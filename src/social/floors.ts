// G.floors: the shared floors. Holes are void pits (src/world/gen/void_kit);
// walk into one and you fall: you tip over the edge, drop out of sight, the
// picture closes to black with the wind, and you come down out of the dark
// onto a fresh floor (a 'floor~<n>' zone built from its number), into a
// dimension, or, online, onto ANOTHER PLAYER'S FLOOR: a shared hole asks
// the relay's public floor directory (/floors) and, if someone has their
// floor open, joins that room as a guest (your own world is saved first).
// A guest who falls through a shared hole goes home. "Open floor" (centre of
// the emote wheel) turns a solo world into a public room for others to fall
// into. Offline or sandboxed: generated floors only.
import * as THREE from 'three';
import { G } from '../game/G';
import { bus } from '../core/events';
import type { GameSystem } from '../game/game';
import type { Player } from '../entities/player';
import type { Portal, Zone } from '../world/zone';
import { holeAt, type HoleRec, type HoleSpec } from '../world/gen/void_kit';
import { zoneSpec } from '../world/worldGraph';
import { shake, punch } from '../gfx/juice';
import { ModelBuilder } from '../gfx/modelBuilder';
import { worldMaterial } from '../gfx/materials';

const FELL_KEY = 'noclip.fell';

type Dest = { kind: 'zone'; key: string; anchor: string; tx?: number; ty?: number }
  | { kind: 'remote'; room: string; server: string; name: string; zone?: string }
  | { kind: 'home'; id: string };

interface Fall {
  phase: 'tip' | 'drop' | 'black' | 'land' | 'up';
  t: number;
  spec: HoleSpec & { tx?: number; ty?: number };
  sx: number; sz: number; cx: number; cz: number; y0: number;
  dest: Dest | null;
  g: number;
  ground: number;
  y: number; vy: number;
}

export interface FloorInfo { room: string; name: string; players: number; max: number; zone?: string; zoneName?: string; locked?: boolean }

function relayHttp(): string | null {
  try {
    if ((import.meta as any).env?.VITE_SANDBOXED) return null;
    if (!/^https?:$/.test(location.protocol)) return null;
    const ws = (import.meta as any).env?.DEV ? `ws://${location.hostname}:8787/ws` : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
    return ws.replace(/^ws/, 'http').replace(/\/ws$/, '');
  } catch { return null; }
}

export class FloorSystem implements GameSystem {
  name = 'floors';
  fall: Fall | null = null;
  /** a guest who came in through a hole: where home is */
  fell: { home?: string | null; room?: string; name?: string } | null = null;
  private overlay: HTMLDivElement | null = null;
  private loops = new Set<string>();
  private motes: THREE.InstancedMesh | null = null;
  private tmpM = new THREE.Matrix4();
  private moteSeed: Float32Array | null = null;
  private ring: THREE.Mesh | null = null;
  private ringT = -1;
  private lastAdvert = '';
  private arrivalPending = false;
  /** always take another player's floor when one is open (tests) */
  preferRemote = false;

  constructor() {
    try {
      const s = sessionStorage.getItem(FELL_KEY);
      if (s) { sessionStorage.removeItem(FELL_KEY); this.fell = JSON.parse(s); this.arrivalPending = true; }
    } catch { /* storage blocked */ }
    bus.on('enterZone', (z: Zone, p: Player) => { if (p?.isLocal) this.advertise(z); });
  }

  // ---------------------------------------------------------------- per frame
  update(dt: number) {
    const p = G.local;
    if (!p || !G.view) return;
    if (this.arrivalPending && G.role === 'client') { this.arrivalPending = false; this.arriveAsGuest(); }
    if (this.fall) { this.stepFall(dt); return; }
    const z = G.zone;
    // walking into a pit: pressed against its edge, moving toward it
    if (!p.body.dead && !p.body.downed && !p.inVehicle && !G.transitioning && z.meta.holes?.length) {
      const sp = Math.hypot(p.vx, p.vz);
      if (sp > 0.6) {
        const ux = p.vx / sp, uz = p.vz / sp;
        const h = holeAt(z, Math.floor(p.x + ux * 0.5), Math.floor(p.z + uz * 0.5));
        if (h) this.jump(p, h, ux, uz);
      }
    }
    this.updateDrafts(dt, z, p);
    if (this.ringT >= 0) this.stepRing(dt);
  }

  // ---------------------------------------------------------------- jumping
  /** a 'hole' portal (older zones: a hole you walk onto) goes through the fall too */
  jumpPortal(p: Player, portal: Portal): boolean {
    if (!p.isLocal || this.fall) return false;
    if (portal.locked && G.missions && !G.missions.isUnlocked?.(portal.locked, p)) return false;
    if (!zoneSpec(portal.to)) return false;
    const h = (G.zone.meta.holes as HoleRec[] | undefined)?.find((q) => q.id === portal.id);
    this.start(p, h ? { ...h } : { to: portal.to, anchor: portal.anchor ?? portal.id, label: portal.label, tx: portal.tx, ty: portal.ty } as any, portal.x + 0.5, portal.y + 0.5);
    return true;
  }

  jump(p: Player, h: HoleRec, ux: number, uz: number) {
    // fall in where you went over the edge, not at the hole's centre (stairs over a void are big)
    const tx = Math.floor(p.x + ux * 0.5) + 0.5, tz = Math.floor(p.z + uz * 0.5) + 0.5;
    this.start(p, { ...h }, tx, tz);
  }

  private start(p: Player, spec: HoleSpec & { tx?: number; ty?: number }, cx: number, cz: number) {
    G.transitioning = true;
    p.actions.clear();
    p.vx = p.vz = 0;
    const lowG = G.zone.meta.lowGravity as number | undefined;
    this.fall = { phase: 'tip', t: 0, spec, sx: p.x, sz: p.z, cx, cz, y0: p.y, dest: null, g: lowG ? 5 : 16, ground: 0, y: p.y, vy: 0 };
    bus.emit('holeJump', p, spec);
    G.missions?.set?.('vx:fell');
    G.audio?.at?.('vx_fall_wind', p.x, p.z, 0.9);
    this.resolve(spec).then((d) => { if (this.fall) this.fall.dest = d; }).catch(() => { if (this.fall) this.fall.dest = { kind: 'zone', key: spec.to, anchor: spec.anchor || 'fall' }; });
  }

  private async resolve(spec: HoleSpec & { tx?: number; ty?: number }): Promise<Dest> {
    const local: Dest = { kind: 'zone', key: spec.to, anchor: spec.anchor || 'fall', tx: spec.tx, ty: spec.ty };
    if (!spec.shared || !relayHttp()) return local;
    // a guest falls home
    if (G.role === 'client' && this.fell?.home) return { kind: 'home', id: this.fell.home };
    if (G.role !== 'solo') return local;
    const list = await this.listFloors(1600);
    const mine = G.net?.room;
    const open = list.filter((f) => f.room !== mine && !f.locked && f.players < f.max);
    if (!open.length || (!this.preferRemote && Math.random() < 0.4)) return local;
    const f = open[Math.floor(Math.random() * open.length)];
    const http = relayHttp()!;
    return { kind: 'remote', room: f.room, name: f.name, zone: f.zoneName, server: http.replace(/^http/, 'ws') + '/ws' };
  }

  /** the relay's public floor directory */
  async listFloors(timeoutMs = 2000): Promise<FloorInfo[]> {
    const http = relayHttp();
    if (!http) return [];
    const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const tm = setTimeout(() => ac?.abort(), timeoutMs);
    try {
      const r = await fetch(http + '/floors', { signal: ac?.signal, cache: 'no-store' });
      if (!r.ok) return [];
      const j = await r.json();
      return Array.isArray(j) ? j : [];
    } catch { return []; } finally { clearTimeout(tm); }
  }

  private stepFall(dt: number) {
    const f = this.fall!, p = G.local;
    f.t += dt;
    p.vx = p.vz = 0;
    switch (f.phase) {
      case 'tip': {
        const k = Math.min(1, f.t / 0.3), e = k * k * (3 - 2 * k);
        p.x = f.sx + (f.cx - f.sx) * e; p.z = f.sz + (f.cz - f.sz) * e;
        p.y = f.y0 + Math.sin(k * Math.PI) * 0.35;
        if (k >= 1) { f.phase = 'drop'; f.t = 0; this.showOverlay(true); }
        break;
      }
      case 'drop': {
        p.x = f.cx; p.z = f.cz;
        p.y = f.y0 - 0.5 * f.g * f.t * f.t;
        this.setOverlay(Math.max(8, 60 - f.t * 70));
        if (f.t > 0.9) { f.phase = 'black'; f.t = 0; this.setOverlay(0); }
        break;
      }
      case 'black': {
        p.y = f.y0 - 12;
        if (f.t > 0.9 && f.dest) this.arrive(f);
        else if (f.t > 4 && !f.dest) f.dest = { kind: 'zone', key: f.spec.to, anchor: f.spec.anchor || 'fall' };
        break;
      }
      case 'land': {
        f.vy -= f.g * 1.25 * dt;
        f.y += f.vy * dt;
        p.y = f.y;
        if (f.t > 0.15) this.showOverlay(false);
        if (f.y <= f.ground) { p.y = f.ground; this.impact(f); }
        break;
      }
      case 'up': {
        if (f.t > 0.9) { this.fall = null; G.transitioning = false; }
        break;
      }
    }
  }

  private async arrive(f: Fall) {
    const d = f.dest!, p = G.local;
    if (d.kind === 'remote' || d.kind === 'home') {
      f.phase = 'up'; f.t = -1e9; // hold the black while the page changes over
      try {
        const S = await import('../game/save');
        if (G.role === 'solo') await S.saveGame().catch(() => false);
        const L = await import('../game/launch');
        if (d.kind === 'home') { L.setLaunch({ mode: 'load', id: d.id }); return; }
        try { sessionStorage.setItem(FELL_KEY, JSON.stringify({ home: G.saveId, room: d.room, name: d.name })); } catch { /* storage blocked */ }
        const traits = [...((p.body as any).traits || [])] as string[];
        L.setLaunch({ mode: 'join', server: d.server, room: d.room, pass: '', name: p.name, app: p.app, occupation: p.occupation, traits });
      } catch (e) {
        console.warn('remote floor', e);
        f.dest = { kind: 'zone', key: f.spec.to, anchor: f.spec.anchor || 'fall' };
        f.phase = 'black'; f.t = 1;
      }
      return;
    }
    // a floor in this world
    const z = G.getZone(d.key);
    const a = z.meta.anchors?.[d.anchor] as number[] | undefined;
    let tx = a ? a[0] : d.tx ?? Math.floor(z.W / 2), ty = a ? a[1] : d.ty ?? Math.floor(z.H / 2);
    [tx, ty] = G.nearestWalkable(z, tx, ty);
    bus.emit('travelStart', p, d.key);
    G.placePlayer(p, d.key, tx, ty, a?.[2]);
    p.vx = p.vz = 0;
    bus.emit('travelEnd', p, d.key);
    G.net?.onLocalTravel?.(d.key);
    this.beginLanding(f, z, tx, ty);
  }

  private beginLanding(f: Fall, z: Zone, tx: number, ty: number) {
    const p = G.local;
    const lowG = z.meta.lowGravity as number | undefined;
    f.g = lowG ? 4.5 : 18;
    f.ground = z.heightAt(tx, ty);
    f.y = f.ground + (lowG ? 9 : 14);
    f.vy = -2;
    p.y = f.y;
    f.phase = 'land'; f.t = 0;
    G.pr.target.y = f.ground;
  }

  private impact(f: Fall) {
    const p = G.local;
    f.phase = 'up'; f.t = 0;
    const hard = f.g > 10;
    shake(hard ? 0.75 : 0.35, hard ? 0.45 : 0.3);
    punch(hard ? 0.09 : 0.04, 0.25);
    G.audio?.at?.('vx_land', p.x, p.z, hard ? 1 : 0.6);
    p.playAnim?.('fall_land', hard ? 1.4 : 0.9);
    this.dustRing(p.x, p.y, p.z);
    bus.emit('noise', { x: p.x, z: p.z, radius: hard ? 14 : 8, kind: 'thud', zone: p.zoneKey, by: p.id });
    if (hard) p.body.panic = Math.min(100, (p.body.panic || 0) + 8);
  }

  // ---------------------------------------------------------------- overlay
  private showOverlay(on: boolean) {
    if (!this.overlay) {
      const el = document.createElement('div');
      el.className = 'vx-fall';
      el.innerHTML = '<div class="streaks"></div>';
      document.body.appendChild(el);
      this.overlay = el;
    }
    this.overlay.classList.toggle('on', on);
    if (on) this.setOverlay(60);
  }
  private setOverlay(r: number) { this.overlay?.style.setProperty('--r', r.toFixed(1)); }

  // ---------------------------------------------------------------- guests
  private arriveAsGuest() {
    const p = G.local, z = G.zone;
    if (!p || !z) return;
    this.fall = { phase: 'land', t: 0, spec: { to: z.key }, sx: p.x, sz: p.z, cx: p.x, cz: p.z, y0: p.y, dest: null, g: 18, ground: 0, y: 0, vy: 0 };
    G.transitioning = true;
    this.beginLanding(this.fall, z, Math.floor(p.x), Math.floor(p.z));
    this.showOverlay(true);
    setTimeout(() => this.showOverlay(false), 250);
    // no notices: you say it out loud, and they hear you
    const line = ['Hello?! Whose floor is this?', 'Where... where am I?', 'Ow. Hello? Anyone?'][Math.floor(Math.random() * 3)];
    setTimeout(() => { G.ui?.say?.(p, line, 'shout', 3); G.net?.social?.({ t: 'bark', text: line, kind: 'shout' }); }, 1600);
    G.net?.floorsMsg?.({ t: 'fellIn', name: p.name }, 'all');
  }

  /** the dimension system (chess board messages go there) */
  dims: any = null;
  onNet(from: string, d: any) {
    if (typeof d?.t === 'string' && d.t.startsWith('chess')) { this.dims?.onNet?.(from, d); return; }
    if (d?.t === 'fellIn' && G.local) {
      G.audio?.ui?.('vx_land', 0.5);
      setTimeout(() => G.local && G.ui?.say?.(G.local, 'Something just came through the ceiling...', 'think', 4), 900);
    }
  }

  // ---------------------------------------------------------------- opening your floor
  /** '' (cannot), 'can-open', or 'open:<room code>' */
  floorStatus(): string {
    if (!relayHttp()) return '';
    if (G.role === 'host' && G.net?.room) return 'open:' + G.net.room;
    if (G.role === 'solo') return 'can-open';
    return '';
  }
  async openFloor() {
    if (G.role !== 'solo' || !relayHttp()) return;
    try {
      const { Net, defaultServerUrl } = await import('../net/net');
      const net = await Net.host(defaultServerUrl(), `${G.local?.name || 'Someone'}'s floor`, { public: true });
      G.net = net; G.role = 'host';
      G.addSystem(net);
      this.lastAdvert = '';
      this.advertise(G.zone);
      if (G.local) G.ui?.say?.(G.local, `Line ${net.room} is open. Anyone who falls could land here now.`, 'think', 5);
    } catch (e: any) {
      console.warn('open floor', e);
      if (G.local) G.ui?.say?.(G.local, 'Nobody is picking up.', 'think', 3);
    }
  }
  /** a host tells the relay which floor it is on (shown in the directory) */
  advertise(z: Zone | null) {
    if (!z || G.role !== 'host' || !G.net?.floor) return;
    const k = z.key + '|' + z.name;
    if (k === this.lastAdvert) return;
    this.lastAdvert = k;
    G.net.floor(z.key, z.name || z.key, zoneSpec(z.key)?.depth ?? 0);
  }

  // ---------------------------------------------------------------- the draft round holes
  private updateDrafts(dt: number, z: Zone, p: Player) {
    const holes = (z.meta.holes || []) as HoleRec[];
    const near: HoleRec[] = [];
    for (const h of holes) if (h.r > 0 && Math.abs(h.cx - p.x) < 18 && Math.abs(h.cy - p.z) < 18) near.push(h);
    near.sort((a, b) => Math.hypot(a.cx - p.x, a.cy - p.z) - Math.hypot(b.cx - p.x, b.cy - p.z));
    const live = new Set<string>();
    for (const h of near.slice(0, 2)) {
      const id = 'vxhole:' + z.key + ':' + h.id;
      live.add(id);
      G.audio?.positionalLoop?.(id, 'vx_hole_wind', h.cx, h.cy, 0.55, 1, 14);
    }
    for (const id of this.loops) if (!live.has(id)) G.audio?.positionalLoop?.(id, null);
    this.loops = live;
    // dust motes spiralling down into the nearest holes
    if (!near.length) { if (this.motes) this.motes.visible = false; return; }
    if (!this.motes) this.buildMotes();
    const m = this.motes!, S = this.moteSeed!;
    m.visible = true;
    const N = m.count, t = G.time;
    for (let i = 0; i < N; i++) {
      const h = near[i % Math.min(3, near.length)];
      const ph = (S[i] + t * (0.18 + (i % 5) * 0.03)) % 1;
      const r = (h.r + 1.6) * (1 - ph) + 0.1;
      const a = S[i] * 40 + ph * 5.5;
      const base = z.heightAt(Math.floor(h.cx + Math.cos(a) * (h.r + 1)), Math.floor(h.cy + Math.sin(a) * (h.r + 1)));
      const y = base + 0.15 + (1 - ph) * 0.9 - (ph > 0.8 ? (ph - 0.8) * 12 : 0);
      const s = 0.6 + (1 - ph) * 0.6;
      this.tmpM.makeScale(s, s, s).setPosition(h.cx + Math.cos(a) * r, y, h.cy + Math.sin(a) * r);
      m.setMatrixAt(i, this.tmpM);
    }
    m.instanceMatrix.needsUpdate = true;
    void dt;
  }
  private buildMotes() {
    const N = 42;
    this.moteSeed = new Float32Array(N);
    for (let i = 0; i < N; i++) this.moteSeed[i] = Math.random();
    const mb = new ModelBuilder();
    mb.box(0, 0, 0, 0.05, 0.05, 0.05, 'white', { color: 0xd8d0c0 });
    this.motes = new THREE.InstancedMesh(mb.build(), worldMaterial({ outline: 0 }), N);
    this.motes.frustumCulled = false;
    G.pr.scene.add(this.motes);
  }

  // ---------------------------------------------------------------- landing dust
  private dustRing(x: number, y: number, z: number) {
    if (!this.ring) {
      const mb = new ModelBuilder();
      const n = 24;
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
        mb.quadRaw([[Math.cos(a0) * 0.6, 0, Math.sin(a0) * 0.6], [Math.cos(a0), 0, Math.sin(a0)], [Math.cos(a1), 0, Math.sin(a1)], [Math.cos(a1) * 0.6, 0, Math.sin(a1) * 0.6]], [[0, 0], [1, 0], [1, 1], [0, 1]], 'white', 0xd8d0c0, 1, 0, 0, [0, 1, 0]);
      }
      this.ring = new THREE.Mesh(mb.build(), worldMaterial({ transparent: true, opacity: 0.557, outline: 0, depthWrite: false, doubleSide: true }));
      G.pr.scene.add(this.ring);
    }
    this.ring.position.set(x, y + 0.05, z);
    this.ring.visible = true;
    this.ringT = 0;
  }
  private stepRing(dt: number) {
    const r = this.ring!;
    this.ringT += dt;
    const k = this.ringT / 0.55;
    if (k >= 1) { r.visible = false; this.ringT = -1; return; }
    const s = 0.4 + k * 2.6;
    r.scale.set(s, 1, s);
    (r.material as THREE.Material).opacity = 0.6 * (1 - k) * (1 - k);
  }
}
