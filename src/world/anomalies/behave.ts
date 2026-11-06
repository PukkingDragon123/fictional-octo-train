// What the anomalies in the levels do (data.ts lists them, place.ts puts them
// there, z.meta.anomalies records where), and the moving parts drawn over
// their static fixtures (src/content/furniture/zl_anomaly.ts):
//   updrip         Upward Rain: beads rise from the drain to a pool on the
//                  ceiling; what is dropped on the grate goes up with them and
//                  comes back down restored (dents out, Ledge melt undone, wet)
//   noon_lamp      the Noon Lamp: inhabitants are pushed out of its light; the
//                  unit under it calms down
//   echo_phone     the Callback: rings once the unit has been on the level a
//                  while; answered, it plays the unit's own words back and
//                  says which way it came in
//   snow_globe     the Small Level: a glass dome, a small figure inside that
//                  walks where the unit walks, snow; shaken, it knocks every
//                  inhabitant nearby off its feet (and costs lucidity)
//   hungry_carpet  the Swallowing Patch: breathes; swallows what is dropped
//                  on it and spits up something else a while later
//   patient_chair  the Patient Chair: turns to face the unit; sitting in it
//                  takes two hours and puts the unit somewhere else, rested
// The world-changing parts run on the host (solo / host).
import * as THREE from 'three';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import { worldMaterial, MAT } from '../../gfx/materials';
import { ModelBuilder } from '../../gfx/modelBuilder';
import { blob, tube, lathe } from '../../creatures/kit/anomalies';
import { objDef } from '../objects';
import { objectMatrix } from '../chunkMesher';
import { moveCircle } from '../collision';
import { floorItems, removeFloorItem, dropItem, type WorldItem } from '../../items/worldItems';
import { createItem } from '../../items/factory';
import { rollLoot } from '../../items/loot';
import { Rng } from '../../core/rng';
import { cbOp, killable } from '../../combat/creatureState';
import { unmeltItem } from './ledge';
import { patientSeat } from '../../content/furniture/zl_anomaly';
import type { Player } from '../../entities/player';
import type { Item } from '../../items/item';
import type { Zone, TileObject } from '../zone';

export interface Placed { key: string; uid: number; x: number; y: number }
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const host = () => G.role !== 'client';

/** world centre of an object's footprint */
export function centreOf(o: TileObject): [number, number] {
  const d = objDef(o.key);
  const w = d?.w ?? 1, dd = d?.d ?? 1;
  const rw = o.rot % 2 === 0 ? w : dd, rd = o.rot % 2 === 0 ? dd : w;
  return [o.x + rw / 2, o.y + rd / 2];
}
function build(fn: (mb: ModelBuilder) => void): THREE.BufferGeometry { const mb = new ModelBuilder(); fn(mb); return mb.build(); }
const COMPASS = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
const compass = (dx: number, dz: number) => COMPASS[((Math.round(Math.atan2(dz, dx) / (Math.PI / 4)) % 8) + 8) % 8];

// ================================================================== the moving parts, per fixture
interface Live { key: string; o: TileObject; group: THREE.Group; t: number; s: Record<string, any> }

export class AnomalyBehaviours {
  private root = new THREE.Group();
  private live = new Map<number, Live>();
  private zoneKey = '';
  private geo: Record<string, THREE.BufferGeometry> = {};
  /** items the Upward Rain is holding up, and the carpet is chewing (host) */
  private held: { zone: string; it: Item; back: number; x: number; z: number }[] = [];
  private lifting = new Map<number, { wi: WorldItem; t: number; y0: number; kind: 'up' | 'down'; zone: string }>();
  private owed: { zone: string; at: number; x: number; z: number }[] = [];
  /** the Callback: what the unit said, and where it came onto each level */
  private said: { t: number; text: string; zone: string }[] = [];
  private cameIn = new Map<string, [number, number, number]>();
  private ring = { until: 0, next: 0, last: -1e9 };
  private globe = { agitation: 0, shakeAt: -1e9 };
  private chair = { yaw: 0, held: 0, creakT: 0 };
  private lineT = new Map<string, number>();

  constructor() {
    this.root.name = 'anomalies';
    bus.on('think', (p: Player, text: string) => { if (p && p === G.local && typeof text === 'string') { this.said.push({ t: G.time, text, zone: p.zoneKey }); if (this.said.length > 60) this.said.shift(); } });
    bus.on('travelEnd', (p: Player, zk: string) => { if (p === G.local) this.cameIn.set(zk, [p.x, p.z, G.time]); });
  }

  private once(k: string, secs: number): boolean { const t = this.lineT.get(k) ?? -1e9; if (G.time < t) return false; this.lineT.set(k, G.time + secs); return true; }

  update(dt: number) {
    const p = G.local as Player | undefined, z = G.zone as Zone | undefined;
    if (!p || !z || !G.pr?.scene) return;
    if (!this.root.parent) G.pr.scene.add(this.root);
    if (z.key !== this.zoneKey) this.enter(z, p);
    if (!this.cameIn.has(z.key)) this.cameIn.set(z.key, [p.x, p.z, G.time]);
    for (const L of this.live.values()) {
      const o = z.objects.get(L.o.uid);
      if (!o) { L.group.visible = false; continue; }
      L.t += dt;
      const d = objDef(o.key)!;
      L.group.matrix.copy(objectMatrix(z, o, d)); L.group.matrixWorldNeedsUpdate = true;
      const [cx, cz] = centreOf(o);
      const dist = Math.hypot(cx - p.x, cz - p.z);
      switch (L.key) {
        case 'updrip': this.updrip(L, z, p, cx, cz, dist, dt); break;
        case 'noon_lamp': this.noonLamp(z, p, cx, cz, dist, dt); break;
        case 'echo_phone': this.phone(L, p, cx, cz, dist, dt); break;
        case 'snow_globe': this.snowGlobe(L, z, p, dt); break;
        case 'hungry_carpet': this.carpet(L, z, p, cx, cz, dist, dt); break;
        case 'patient_chair': this.chairTurn(L, o, p, cx, cz, dist, dt); break;
      }
    }
    this.updateLifting(dt, z);
    if (host()) this.settle(z);
  }

  /** the fixtures of the level just entered get their moving parts */
  private enter(z: Zone, p: Player) {
    // leaving a level: the rain lets go of everything it was holding there (restored)
    if (this.zoneKey) { const old = G.zones?.get?.(this.zoneKey); if (old) for (const h of this.held.filter((q) => q.zone === this.zoneKey)) { h.back = 0; } if (old) this.settle(old, true); }
    this.zoneKey = z.key;
    for (const L of this.live.values()) this.root.remove(L.group);
    this.live.clear();
    this.ring = { until: 0, next: 0, last: G.time };
    for (const a of (z.meta.anomalies || []) as Placed[]) {
      const o = z.objects.get(a.uid);
      if (!o) continue;
      const g = new THREE.Group(); g.matrixAutoUpdate = false;
      const L: Live = { key: a.key, o, group: g, t: 0, s: {} };
      this.dress(L);
      this.root.add(g);
      this.live.set(o.uid, L);
    }
    void p;
  }

  // ---------------------------------------------------------------- the meshes
  private dress(L: Live) {
    const g = L.group, G0 = this.geo;
    if (L.key === 'updrip') {
      G0.bead ??= build((mb) => blob(mb, [0, 0, 0], [0.03, 0.045, 0.03], 7, 5, 'glass', { color: 0xd8f4ff, emissive: 0.45 }));
      G0.ceilPool ??= build((mb) => { blob(mb, [0, 0, 0], [0.8, 0.07, 0.8], 20, 4, 'tile_pool_deep', { color: 0x9ad8f0, emissive: 0.35, v0: 0.5, v1: 1, disp: (dv) => 1 + 0.1 * Math.sin(Math.atan2(dv[2], dv[0]) * 5) }); });
      const beads = new THREE.InstancedMesh(G0.bead, worldMaterial({}), 36); beads.frustumCulled = false;
      const pool = new THREE.Mesh(G0.ceilPool, worldMaterial({})); pool.position.set(0, 2.66, 0);
      g.add(beads, pool);
      L.s.beads = beads; L.s.pool = pool;
      L.s.b = Array.from({ length: 36 }, () => ({ a: Math.random() * 6.28, r: Math.random() * 0.35, y: Math.random() * 2.6, v: 0.7 + Math.random() * 0.8 }));
    } else if (L.key === 'echo_phone') {
      G0.lamp ??= build((mb) => blob(mb, [0, 0, 0], [0.035, 0.03, 0.035], 8, 5, 'white', { color: 0xff3020, emissive: 1.6 }));
      const lamp = new THREE.Mesh(G0.lamp, worldMaterial({})); lamp.position.set(0, 1.93, -0.06); lamp.visible = false;
      g.add(lamp); L.s.lamp = lamp;
    } else if (L.key === 'snow_globe') {
      G0.dome ??= build((mb) => blob(mb, [0, 1.18, 0], [0.8, 0.8, 0.8], 28, 16, 'glass', { color: 0xe8f6ff, v0: 0, v1: 0.63 }));
      G0.mini ??= build(miniUnit);
      G0.flake ??= build((mb) => blob(mb, [0, 0, 0], [0.012, 0.006, 0.012], 5, 3, 'white', { color: 0xffffff, emissive: 0.6 }));
      const dome = new THREE.Mesh(G0.dome, MAT.glass); dome.renderOrder = 3;
      const fig = new THREE.Mesh(G0.mini, worldMaterial({})); fig.position.set(0, 0.93, 0);
      const flakes = new THREE.InstancedMesh(G0.flake, worldMaterial({}), 60); flakes.frustumCulled = false;
      g.add(fig, flakes, dome);
      L.s.fig = fig; L.s.flakes = flakes;
      L.s.f = Array.from({ length: 60 }, () => ({ x: (Math.random() - 0.5) * 1.0, y: 0.95, z: (Math.random() - 0.5) * 1.0, vx: 0, vy: 0, vz: 0 }));
    } else if (L.key === 'hungry_carpet') {
      G0.pucker ??= build((mb) => {
        lathe(mb, [0, 0, 0], [[0.3, 0.0], [0.26, 0.07], [0.18, 0.1], [0.1, 0.06], [0.04, 0.0], [0, -0.02]], 18, 'an_maw', { color: 0xffffff, inside: null, flip: true });
        for (let k = 0; k < 9; k++) { const a = (k / 9) * Math.PI * 2; tube(mb, [[Math.cos(a) * 0.3, 0.0, Math.sin(a) * 0.3], [Math.cos(a) * 0.2, 0.09, Math.sin(a) * 0.2], [Math.cos(a) * 0.06, 0.03, Math.sin(a) * 0.06]], 0.016, 5, 'carpet_yellow', { color: 0xe8d490 }); }
      });
      const pk = new THREE.Mesh(G0.pucker, worldMaterial({})); pk.position.set(0, 0.0, 0);
      g.add(pk); L.s.pk = pk; L.s.eat = 0;
    } else if (L.key === 'patient_chair') {
      G0.seat ??= build(patientSeat);
      const seat = new THREE.Mesh(G0.seat, MAT.propLow); seat.castShadow = true;
      g.add(seat); L.s.seat = seat;
    }
  }

  // ---------------------------------------------------------------- Upward Rain
  private updrip(L: Live, z: Zone, p: Player, cx: number, cz: number, dist: number, dt: number) {
    const beads = L.s.beads as THREE.InstancedMesh, m = new THREE.Matrix4();
    (L.s.b as any[]).forEach((b, i) => {
      b.y += b.v * dt * (0.6 + b.y * 0.35);
      if (b.y > 2.62) { b.y = 0.05; b.a = Math.random() * 6.28; b.r = Math.random() * 0.35; }
      const w = Math.sin(L.t * 2 + i) * 0.03;
      m.makeScale(1, 1 + b.v * 0.6, 1).setPosition(Math.cos(b.a) * b.r + w, b.y, Math.sin(b.a) * b.r);
      beads.setMatrixAt(i, m);
    });
    beads.instanceMatrix.needsUpdate = true;
    (L.s.pool as THREE.Mesh).scale.set(1 + Math.sin(L.t * 0.7) * 0.04, 1, 1 + Math.cos(L.t * 0.6) * 0.04);
    // the unit standing in it: soaked, and oddly calm
    if (dist < 0.9) {
      p.body.wetness = Math.min(100, p.body.wetness + dt * 4);
      p.body.lucidity = Math.min(100, p.body.lucidity + dt * 0.2);
      if (this.once('updrip_in', 60)) bus.emit('think', p, 'It is raining. Upward. On me. It is nice, actually.');
    }
    if (!host()) return;
    // what lies on the grate goes up with it
    for (const wi of floorItems(z).values()) {
      if (this.lifting.has(wi.item.uid) || wi.vy !== undefined) continue;
      if (Math.hypot(wi.x - cx, wi.z - cz) > 0.85) continue;
      this.lifting.set(wi.item.uid, { wi, t: 0, y0: wi.y, kind: 'up', zone: z.key });
      G.audio?.at?.('water_lap', cx, cz, 0.5);
      if (dist < 8 && this.once('updrip_lift', 20)) bus.emit('think', p, pick(['It is going up. It is just going up.', 'The rain took it. Up.']));
    }
    // and comes back down, restored
    for (let i = this.held.length - 1; i >= 0; i--) {
      const h = this.held[i];
      if (h.zone !== z.key || G.time < h.back) continue;
      this.held.splice(i, 1);
      this.restore(h.it);
      const wi = dropItem(z, h.it, cx, cz, 2.5, 0.3);
      wi.vy = 0; wi.vx = 0; wi.vz = 0;
      G.audio?.at?.('bh_plop', cx, cz, 0.6);
      if (dist < 10) bus.emit('think', p, pick(['It came back down. It looks new.', 'Wet. Clean. Like it was never used.']));
    }
  }
  private restore(it: Item) { unmeltItem(it); it.cond = 1; it.wet = 1; it.bloody = 0; if (it.data?.sampled) delete it.data.sampled; }

  private updateLifting(dt: number, z: Zone) {
    for (const [uid, L] of this.lifting) {
      if (L.zone !== z.key || !floorItems(z).has(uid)) { this.lifting.delete(uid); continue; }
      L.t += dt;
      if (L.kind === 'up') {
        L.wi.y = L.y0 + Math.min(2.5, L.t * L.t * 0.35);
        L.wi.rot += dt * 1.5;
        if (L.t > 2.8) { removeFloorItem(z, L.wi.item); this.lifting.delete(uid); this.held.push({ zone: z.key, it: L.wi.item, back: G.time + 30 + Math.random() * 15, x: L.wi.x, z: L.wi.z }); }
      } else {
        L.wi.y = L.y0 - Math.min(0.5, L.t * 0.12);
        L.wi.rot += dt * 0.6;
        if (L.t > 4) {
          removeFloorItem(z, L.wi.item); this.lifting.delete(uid);
          G.audio?.at?.('bh_gulp', L.wi.x, L.wi.z, 0.7);
          this.owed.push({ zone: z.key, at: G.time + 16 + Math.random() * 14, x: L.wi.x, z: L.wi.z });
        }
      }
    }
  }
  /** host: what the carpet owes, and (leaving) what the rain holds, comes back */
  private settle(z: Zone, all = false) {
    for (let i = this.owed.length - 1; i >= 0; i--) {
      const q = this.owed[i];
      if (q.zone !== z.key || (!all && G.time < q.at)) continue;
      this.owed.splice(i, 1);
      const keys = rollLoot('floor_generic', new Rng(Math.random() * 1e9));
      const it = createItem(keys[0] || 'coins');
      const live = [...this.live.values()].find((l) => l.key === 'hungry_carpet');
      const [cx, cz] = live ? centreOf(live.o) : [q.x, q.z];
      const a = Math.random() * Math.PI * 2;
      const wi = dropItem(z, it, cx, cz, 0.15, 0);
      wi.vy = 3.2; wi.vx = Math.cos(a) * 1.6; wi.vz = Math.sin(a) * 1.6;
      if (live) live.s.eat = 1.2;
      G.audio?.at?.('arv_spit', cx, cz, 0.8);
      if (G.local && Math.hypot(cx - G.local.x, cz - G.local.z) < 12) bus.emit('think', G.local, pick(['It spat something out.', 'A trade. I did not agree to a trade.', 'It coughed. Something came up.']));
    }
    if (all) for (let i = this.held.length - 1; i >= 0; i--) { const h = this.held[i]; if (h.zone !== z.key) continue; this.held.splice(i, 1); this.restore(h.it); dropItem(z, h.it, h.x, h.z, undefined, 0.3); }
  }

  // ---------------------------------------------------------------- the Noon Lamp
  private noonLamp(z: Zone, p: Player, cx: number, cz: number, dist: number, dt: number) {
    const R = 4.4;
    if (dist < R) {
      const b = p.body;
      b.panic = Math.max(0, b.panic - dt * 4);
      b.stress = Math.max(0, b.stress - dt * 0.4);
      b.lucidity = Math.min(100, b.lucidity + dt * 0.12);
      if (this.once('noon', 90)) bus.emit('think', p, pick(['It feels like noon. A clear, bright noon.', 'Warm on my face. Like a window in summer.']));
    }
    if (!host()) return;
    for (const c of (G.creatures?.list?.() || []) as any[]) {
      if (c.dead || c.zoneKey !== z.key) continue;
      const dx = c.x - cx, dz = c.z - cz, d = Math.hypot(dx, dz);
      if (d >= R || d < 0.01) continue;
      const push = (R - d + 0.4) * 2.2 * dt;
      moveCircle(z, c, (dx / d) * push, (dz / d) * push, { creature: true });
      if (c.mem && this.once('noon_c' + c.id, 6)) G.audio?.at?.('hush_inhale', c.x, c.z, 0.3);
    }
  }

  // ---------------------------------------------------------------- the Callback
  private phone(L: Live, p: Player, cx: number, cz: number, dist: number, _dt: number) {
    const came = this.cameIn.get(p.zoneKey);
    const onLevel = came ? G.time - came[2] : 0;
    const r = this.ring;
    if (r.until < G.time && onLevel > 45 && dist < 16 && G.time - r.last > 140) { r.until = G.time + 26; r.next = 0; r.last = G.time; }
    const ringing = r.until > G.time;
    (L.s.lamp as THREE.Mesh).visible = ringing && Math.sin(L.t * 9) > 0;
    if (ringing && G.time >= r.next) { r.next = G.time + 2.6; G.audio?.at?.('phone_ring', cx, cz, 0.85); }
  }
  isRinging() { return this.ring.until > G.time; }
  /** the unit answers: its own voice, a few minutes back, and which way it came in */
  answer(p: Player, cx: number, cz: number) {
    const ringing = this.isRinging();
    this.ring.until = 0;
    if (!ringing) { bus.emit('think', p, pick(['Dial tone. Then breathing. Then nothing.', 'Nobody there. The handset is warm though.'])); return false; }
    const old = this.said.filter((s) => G.time - s.t > 50);
    const line = (old.length ? old[Math.floor(Math.random() * Math.min(old.length, 8))] : this.said[0])?.text;
    const ago = old.length ? Math.max(1, Math.round((G.time - old[0].t) / 60)) : 1;
    G.audio?.ui?.('deja', 0.6);
    bus.emit('subtitle', { who: 'THE CALLBACK', text: line ? `"${line}" (your voice, ${ago} minute${ago > 1 ? 's' : ''} ago)` : '"...hello? Is this... is this me?" (your voice)', style: 'radio', dur: 6 });
    const came = this.cameIn.get(p.zoneKey);
    if (came) {
      const dx = came[0] - cx, dz = came[1] - cz, m = Math.round(Math.hypot(dx, dz));
      setTimeout(() => bus.emit('subtitle', { who: 'THE CALLBACK', text: m > 6 ? `"You came in to the ${compass(dx, dz)}. About ${m} metres. Go back the way you came."` : '"You came in right here. You never left."', style: 'radio', dur: 6 }), 6200);
    }
    p.body.lucidity = Math.max(0, p.body.lucidity - 4);
    return true;
  }

  // ---------------------------------------------------------------- the Small Level
  private snowGlobe(L: Live, z: Zone, p: Player, dt: number) {
    const fig = L.s.fig as THREE.Mesh, flakes = L.s.flakes as THREE.InstancedMesh;
    // the small figure walks where the unit walks (the level folded into the globe's floor)
    const fx = Math.max(-0.42, Math.min(0.42, (p.x / z.W - 0.5) * 0.9)), fz = Math.max(-0.42, Math.min(0.42, (p.z / z.H - 0.5) * 0.9));
    const moving = p.speed > 0.2;
    fig.position.set(fx, 0.93 + (moving ? Math.abs(Math.sin(L.t * 9)) * 0.008 : 0), fz);
    // world facing (+x = 0) to the figure's yaw (faces +z at 0); undo the object's own turn
    fig.rotation.y = -p.facing + Math.PI / 2 - (L.o.rot * Math.PI) / 2;
    const ag = (this.globe.agitation = Math.max(0, this.globe.agitation - dt / 12));
    const m = new THREE.Matrix4();
    (L.s.f as any[]).forEach((f, i) => {
      if (ag > 0.02) {
        const a = Math.atan2(f.z, f.x) + 1.4;
        f.vx += (Math.cos(a) * 0.8 - f.x * 0.6) * ag * dt * 3 + (Math.random() - 0.5) * ag * dt * 2;
        f.vz += (Math.sin(a) * 0.8 - f.z * 0.6) * ag * dt * 3 + (Math.random() - 0.5) * ag * dt * 2;
        f.vy += (1.1 - f.y) * ag * dt * 4 + (Math.random() - 0.5) * ag * dt * 3;
      }
      f.vy -= 0.12 * dt; f.vx *= 1 - dt * 0.8; f.vz *= 1 - dt * 0.8; f.vy *= 1 - dt * 0.8;
      f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt;
      const r = Math.hypot(f.x, f.z), dy = f.y - 1.18, R = Math.sqrt(Math.max(0, 0.74 * 0.74 - dy * dy));
      if (r > Math.min(0.6, R)) { const k = Math.min(0.6, R) / r; f.x *= k; f.z *= k; f.vx *= -0.3; f.vz *= -0.3; }
      if (f.y < 0.945) { f.y = 0.945; f.vy = 0; f.vx *= 0.5; f.vz *= 0.5; }
      if (f.y > 1.85) { f.y = 1.85; f.vy = -0.05; }
      m.makeRotationY(i).setPosition(f.x, f.y, f.z);
      flakes.setMatrixAt(i, m);
    });
    flakes.instanceMatrix.needsUpdate = true;
  }
  /** shake it: snow, and every inhabitant nearby is knocked off its feet */
  shake(p: Player, cx: number, cz: number): boolean {
    if (G.time - this.globe.shakeAt < 30) { bus.emit('think', p, 'It is still settling. Let it settle.'); return false; }
    this.globe.shakeAt = G.time; this.globe.agitation = 1;
    for (const L of this.live.values()) if (L.key === 'snow_globe') for (const f of L.s.f) { f.vy = 0.6 + Math.random() * 0.8; f.vx = (Math.random() - 0.5) * 0.8; f.vz = (Math.random() - 0.5) * 0.8; }
    G.audio?.at?.('glass_clink', cx, cz, 0.8); G.audio?.ui?.('dread_hit', 0.4);
    G.pr.shake = Math.max(G.pr.shake, 0.7);
    let n = 0;
    for (const c of (G.creatures?.list?.() || []) as any[]) {
      if (c.dead || c.zoneKey !== p.zoneKey || Math.hypot(c.x - cx, c.z - cz) > 40 || !killable(c)) continue;
      cbOp({ t: 'down', id: c.id, s: 4.5 }); n++;
    }
    p.body.lucidity = Math.max(0, p.body.lucidity - 6);
    bus.emit('think', p, n ? 'Everything tilted. Everything fell over. Not me. Nearly me.' : 'The whole floor tilted. Just for a second.');
    return true;
  }

  // ---------------------------------------------------------------- the Swallowing Patch
  private carpet(L: Live, z: Zone, p: Player, cx: number, cz: number, dist: number, dt: number) {
    const pk = L.s.pk as THREE.Mesh;
    L.s.eat = Math.max(0, (L.s.eat as number) - dt * 0.5);
    const e = L.s.eat as number;
    const br = Math.sin(L.t * (0.9 + e * 3)) * (0.08 + e * 0.15);
    pk.scale.set(1 + br * 0.6, 1 + br * 1.6, 1 + br * 0.6);
    if (dist < 0.9 && this.once('carpet_on', 45)) { bus.emit('think', p, 'It is warm. It moved. Under my feet.'); p.body.lucidity = Math.max(0, p.body.lucidity - 2); }
    if (!host()) return;
    for (const wi of floorItems(z).values()) {
      if (this.lifting.has(wi.item.uid) || wi.vy !== undefined) continue;
      if (Math.hypot(wi.x - cx, wi.z - cz) > 0.75) continue;
      this.lifting.set(wi.item.uid, { wi, t: 0, y0: wi.y, kind: 'down', zone: z.key });
      L.s.eat = 1;
      G.audio?.at?.('bh_squelch', cx, cz, 0.5);
    }
  }

  // ---------------------------------------------------------------- the Patient Chair
  private chairTurn(L: Live, o: TileObject, p: Player, cx: number, cz: number, dist: number, dt: number) {
    const seat = L.s.seat as THREE.Mesh;
    const c = this.chair;
    if (dist < 12) {
      // the seat's local yaw that points its front (+z) at the unit, under the object's own turn
      const want = Math.atan2(p.x - cx, p.z - cz) - (o.rot * Math.PI) / 2;
      let d = want - c.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      const sp = (c.held ? 1.6 : 0.7) * dt;
      const step = Math.max(-sp, Math.min(sp, d));
      c.yaw += step;
      c.creakT -= dt;
      if (Math.abs(step) > sp * 0.6 && c.creakT <= 0) { c.creakT = 2.5 + Math.random() * 2; G.audio?.at?.('chair_squeak', cx, cz, 0.45); }
    }
    seat.rotation.y = c.yaw;
  }
  /** sit in it: two hours gone, somewhere else on the floor, rested and not quite yourself */
  sit(p: Player, z: Zone) {
    this.chair.held++;
    G.audio?.at?.('chair_squeak', p.x, p.z, 0.6);
    G.fadeThen(() => {
      G.clock.hours += 2;
      const b = p.body;
      b.fatigue = 0; b.panic = 0;
      b.lucidity = Math.max(0, b.lucidity - 12);
      const rooms = z.rooms.filter((r) => r.id > 0 && r.x1 - r.x0 >= 3 && r.y1 - r.y0 >= 3);
      const r = rooms[Math.floor(Math.random() * rooms.length)];
      const [x, y] = G.nearestWalkable(z, r ? (r.x0 + r.x1) >> 1 : p.tileX(), r ? (r.y0 + r.y1) >> 1 : p.tileY());
      G.placePlayer(p, z.key, x, y, Math.random() * 6.28);
      setTimeout(() => bus.emit('think', p, pick(['I was sitting. Now I am standing here. My legs are asleep.', 'Two hours. Where did two hours go?', 'Rested. Why do I feel rested? Who sat me down?'])), 900);
    });
  }
}

/** a small unit in a hazmat suit, 16 cm tall, standing at the origin facing +z */
function miniUnit(mb: ModelBuilder) {
  const Y = 0xe8c228, D = 0x2a2c2a;
  for (const s of [-1, 1]) tube(mb, [[s * 0.012, 0, 0], [s * 0.012, 0.035, 0], [s * 0.013, 0.07, 0]], 0.008, 5, 'white', { color: Y, capStart: true });
  for (const s of [-1, 1]) blob(mb, [s * 0.012, 0.004, 0.004], [0.009, 0.005, 0.012], 6, 3, 'white', { color: D });
  lathe(mb, [0, 0.065, 0], [[0, 0], [0.022, 0], [0.025, 0.02], [0.024, 0.05], [0.018, 0.06], [0, 0.062]], 10, 'white', { color: Y });
  for (const s of [-1, 1]) tube(mb, [[s * 0.026, 0.115, 0], [s * 0.031, 0.09, 0.003], [s * 0.029, 0.068, 0.006]], 0.0065, 5, 'white', { color: Y, capEnd: true });
  blob(mb, [0, 0.142, 0], [0.019, 0.021, 0.019], 10, 6, 'white', { color: Y });
  blob(mb, [0, 0.144, 0.013], [0.012, 0.009, 0.007], 8, 5, 'glass', { color: 0x9ab4c8, emissive: 0.3 });
  blob(mb, [0, 0.09, -0.019], [0.01, 0.012, 0.004], 6, 4, 'white', { color: 0x203440 });
}
