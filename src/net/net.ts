// Co-op networking. Star topology through the relay server: the host's
// browser runs the authoritative world (creatures, world ops, missions) and
// streams snapshots; every client simulates its own survivor (body, actions,
// inventory) and streams its state. World changes are ops (see game/ops.ts),
// replayed from the host's op log when someone joins late.
import { bus } from '../core/events';
import { G } from '../game/G';
import { hostApply, applyOp, opLog } from '../game/ops';
import { receiveGive } from '../game/worldOps';
import { serializeItem } from '../items/factory';
import { applyHitToPlayer } from '../creatures/manager';
import { Player, PlayerNetState } from '../entities/player';
import { itemDef, Item } from '../items/item';
import { Voice } from './voice';
import type { GameSystem } from '../game/game';
import { Appearance, randomAppearance } from '../entities/humanRig';
import type { MenuOption } from '../ui/ui';

export interface Welcome {
  seed: number; sandbox: any; hours: number; collapse: number;
  missions: any; log: string[]; fires: Record<string, any>; vehicles?: any[];
  zone: string; spawn: [number, number];
  players: { id: string; name: string; app: Appearance; state?: PlayerNetState }[];
}
export interface Hello { name: string; app: Appearance; occupation: string; traits: string[] }

const SNAP_HZ = 15, SELF_HZ = 15;

export function defaultServerUrl() {
  const loc = window.location;
  if (loc.protocol === 'http:' || loc.protocol === 'https:') {
    if (import.meta.env.DEV) return `ws://${loc.hostname}:8787/ws`; // vite dev server → local relay
    return `${loc.protocol === 'https:' ? 'wss' : 'ws'}://${loc.host}/ws`;
  }
  return 'ws://localhost:8787/ws';
}

export class Net implements GameSystem {
  name = 'net';
  ws: WebSocket;
  id = '';
  room = '';
  isHost = false;
  peers = new Map<string, { name: string }>();
  voice: Voice;
  status = '';
  ping = 0;
  private snapT = 0; private selfT = 0; private pingT = 0;
  private pendingHello = new Map<string, Hello>();
  private outfitKey = new Map<string, string>();
  onWelcome?: (w: Welcome) => void;
  onError?: (e: string) => void;
  onHosted?: (room: string) => void;
  private openP: Promise<void>;

  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.openP = new Promise((res, rej) => {
      this.ws.onopen = () => res();
      this.ws.onerror = () => rej(new Error('Could not reach the server at ' + url));
    });
    this.ws.onmessage = (e) => this.onMessage(e.data);
    this.ws.onclose = () => { this.status = 'disconnected'; bus.emit('netClosed'); if (G?.ui && !this.isHost) G.ui.centerMessage?.('CONNECTION LOST<br><span style="font-size:18px;color:#a89a72">The host is gone. The simulation keeps running without you.</span>', { label: 'Back to title', action: () => location.reload() }); };
    this.voice = new Voice((to, d) => this.raw({ t: 'msg', to, d }), () => this.id);
  }

  // ---------------------------------------------------------------- lobby
  static async host(url: string, name: string, opts: { public?: boolean; pass?: string } = {}): Promise<Net> {
    const n = new Net(url);
    await n.openP;
    n.isHost = true;
    return new Promise((res, rej) => {
      n.onHosted = () => res(n);
      n.onError = (e) => rej(new Error(e));
      n.raw({ t: 'host', name, public: opts.public !== false, pass: opts.pass || '' });
    });
  }
  static async join(url: string, room: string, hello: Hello, pass = ''): Promise<{ net: Net; welcome: Welcome }> {
    const n = new Net(url);
    await n.openP;
    if (!hello.app) hello.app = randomAppearance(Math.random); // host and client must agree on the look
    return new Promise((res, rej) => {
      n.onWelcome = (w) => res({ net: n, welcome: w });
      n.onError = (e) => rej(new Error(e));
      n.raw({ t: 'join', room: room.trim().toUpperCase(), name: hello.name, pass });
      n.pendingSelfHello = hello;
    });
  }
  private pendingSelfHello: Hello | null = null;

  private raw(m: any) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); }
  private to(to: string, d: any) { this.raw({ t: 'msg', to, d }); }

  // ---------------------------------------------------------------- API used by gameplay code
  sendOp(name: string, args: any) { this.to('host', { k: 'op', n: name, a: args }); }
  broadcastOp(name: string, args: any) { this.to('all', { k: 'op', n: name, a: args }); }
  broadcastFx(kind: string, data: any) { this.to('all', { k: 'fx', f: kind, d: data }); }
  sendTo(id: string, kind: string, data: any) { if (G.players.get(id)?.isLocal) { this.handle(this.id, { k: kind, ...data }); return; } this.to(id, { k: kind, ...data }); }
  sendNoise(n: any) { this.to('host', { k: 'noise', n }); }
  /** the local driver's car pose (host relays it to everyone) */
  sendVehicle(s: any) { this.to(this.isHost ? 'all' : 'host', { k: 'veh', s }); }
  sendHurt(pid: string, hit: any) { this.sendTo(pid, 'hurt', { hit }); }
  sendMedical(pid: string, inj: any) { this.sendTo(pid, 'med', { inj }); }
  onLocalTravel(zone: string) { void zone; this.selfT = 1; }
  revive(id: string) { this.sendTo(id, 'revive', { by: this.id }); }
  toggleCarry(id: string) {
    const me = G.local;
    if (me.carrying === id) { me.carrying = null; this.sendTo(id, 'carry', { by: null }); return; }
    if (me.carrying) return;
    me.carrying = id;
    this.sendTo(id, 'carry', { by: me.id });
  }
  giveItem(id: string, it: Item) {
    const me = G.local;
    if (!me.containerOf(it)) return;
    me.removeItem(it);
    bus.emit('inventoryChanged', me);
    this.sendTo(id, 'give', { item: serializeItem(it) });
    bus.emit('halo', me, 'Gave ' + itemDef(it.key).name);
  }
  chat(text: string) {
    text = text.trim().slice(0, 200);
    if (!text) return;
    const me = G.local;
    G.ui?.say?.(me, text, 'say', 5);
    this.to('all', { k: 'chat', text });
    G.ui?.chatLine?.(me.name, text);
  }
  /** a shout everyone in the zone can hear (bubble + voice) */
  shout(text: string) { this.to('all', { k: 'shout', text }); }
  /** walkie-talkie: pick a channel / switch on (item menu) */
  radioMenu(p: Player, it: Item) {
    const d = itemDef(it.key);
    const opts: MenuOption[] = [];
    opts.push({ label: it.data?.on ? 'Switch off' : 'Switch on', action: () => { it.data = { ...(it.data || {}), on: !it.data?.on, ch: it.data?.ch ?? 1 }; G.audio?.ui?.('static_burst', 0.3); } });
    const chs = d.radio?.channels ?? 8;
    opts.push({ label: 'Channel', sub: Array.from({ length: Math.min(16, chs) }, (_, i) => ({ label: `CH ${i + 1}${(it.data?.ch ?? 1) === i + 1 ? '  ◂' : ''}`, action: () => { it.data = { ...(it.data || {}), ch: i + 1 }; G.audio?.ui?.('dial'); } })) });
    G.ui?.openMenu?.(G.input.mouseX, G.input.mouseY, d.name, opts);
  }

  // ---------------------------------------------------------------- incoming
  private onMessage(data: any) {
    let m: any;
    try { m = JSON.parse(data); } catch { return; }
    switch (m.t) {
      case 'hosted': this.id = m.id; this.room = m.room; this.status = 'hosting ' + m.room; this.onHosted?.(m.room); break;
      case 'joined': this.id = m.id; this.room = m.room; this.status = 'joined ' + m.room; if (this.pendingSelfHello) this.to('host', { k: 'hello', ...this.pendingSelfHello }); break;
      case 'error': this.status = m.error; this.onError?.(m.error); G.ui?.toast?.('NETWORK', m.error, 4); break;
      case 'peerJoin': this.peers.set(m.id, { name: m.name }); G.ui?.toast?.(`${m.name.toUpperCase()} IS CONNECTING`, '', 3); break;
      case 'peerLeave': this.dropPeer(m.id); break;
      case 'hostLeft': this.status = 'host left'; break;
      case 'pong': this.ping = performance.now() - m.at; break;
      case 'msg': this.handle(m.from, m.d); break;
    }
  }

  private handle(from: string, d: any) {
    if (!d) return;
    // until our own session exists only the welcome matters (snapshots etc. would hit a null game)
    if (!G?.local && d.k !== 'welcome' && d.k !== 'hello') return;
    switch (d.k) {
      // ---- host side
      case 'hello': if (this.isHost) this.welcome(from, d); break;
      case 'me': this.applyRemote(from, d.s); break;
      case 'op': if (this.isHost) hostApply(d.n, d.a, from); else applyOp(d.n, d.a, from, false); break;
      case 'noise': if (this.isHost) bus.emit('noise', d.n); break;
      case 'veh': (G as any).vehicles?.applyPose?.(d.s); if (this.isHost) this.to('all', { k: 'veh', s: d.s }); break;
      // ---- client side
      case 'welcome': this.onWelcome?.(d.w); break;
      case 'snap': this.applySnap(d); break;
      case 'fx': this.fx(d.f, d.d); break;
      // ---- anyone
      case 'hurt': if (G.local) applyHitToPlayer(G.local, d.hit); break;
      case 'med': this.applyMedical(d.inj); break;
      case 'give': receiveGive(d); G.ui?.toast?.('RECEIVED', itemDef(d.item?.key)?.name || 'an item', 2.5); break;
      case 'revive': this.revived(from); break;
      case 'carry': if (G.local) { G.local.carriedBy = d.by; bus.emit('think', G.local, d.by ? 'Someone has me.' : 'Back on my feet... sort of.'); } break;
      case 'chat': { const p = G.players.get(from); if (p) G.ui?.say?.(p, d.text, 'say', 5); G.ui?.chatLine?.(p?.name || from, d.text); break; }
      case 'shout': { const p = G.players.get(from); if (p && G.local && p.zoneKey === G.local.zoneKey) { G.ui?.say?.(p, String(d.text).slice(0, 40), 'shout', 2.5); G.audio?.at?.('shout', p.x, p.z, 1); } break; }
      case 'rtc': this.voice.onSignal(from, d); break;
      case 'left': this.dropPeer(from); break;
    }
  }

  private dropPeer(id: string) {
    const name = this.peers.get(id)?.name || G.players.get(id)?.name;
    this.peers.delete(id);
    this.voice.drop(id);
    if (G.players.has(id)) G.removePlayer(id);
    if (G.local?.carrying === id) G.local.carrying = null;
    if (name) G.ui?.toast?.(`${name.toUpperCase()} LEFT`, 'their connection to the simulation closed', 3);
  }

  // ---------------------------------------------------------------- host: welcoming a client
  private welcome(id: string, h: Hello) {
    this.pendingHello.set(id, h);
    const me = G.local;
    if (!h.app) h.app = randomAppearance(Math.random);
    const p = new Player(id, h.name || 'Survivor', h.app, false);
    p.zoneKey = me.zoneKey;
    p.x = me.x + 1; p.z = me.z;
    G.addPlayer(p);
    const fires: Record<string, any> = {};
    for (const z of G.zones.values()) if (z.meta.fires && Object.keys(z.meta.fires).length) fires[z.key] = z.meta.fires;
    const w: Welcome = {
      seed: G.worldSeed, sandbox: G.sandbox, hours: G.clock.hours, collapse: G.collapse,
      missions: G.missions?.serialize?.() ?? null, log: opLog, fires, vehicles: (G as any).vehicles?.serialize?.() ?? [],
      zone: me.zoneKey, spawn: G.nearestWalkable(G.getZone(me.zoneKey), Math.floor(me.x + 1), Math.floor(me.z)),
      players: [...G.players.values()].filter((q) => q.id !== id).map((q) => ({ id: q.id, name: q.name, app: q.app, state: q.netState() })),
    };
    this.to(id, { k: 'welcome', w });
    G.ui?.toast?.(`${h.name.toUpperCase()} NOCLIPPED IN`, '', 3.5);
    this.voice.ensure(id);
  }

  // ---------------------------------------------------------------- snapshots
  update(dt: number) {
    const me = G.local;
    if (!me) return;
    this.pingT -= dt;
    if (this.pingT <= 0) { this.pingT = 2; this.raw({ t: 'ping', at: performance.now() }); }
    // my own state to everyone else (host includes it in snapshots)
    this.selfT -= dt;
    if (!this.isHost && this.selfT <= 0) { this.selfT = 1 / SELF_HZ; this.to('host', { k: 'me', s: this.myState() }); }
    if (this.isHost) {
      this.snapT -= dt;
      if (this.snapT <= 0) { this.snapT = 1 / SNAP_HZ; this.broadcastSnap(); }
    }
    // remote survivors: interpolate + mirror their visible state
    for (const p of G.players.values()) if (!p.isLocal && p.remote) this.stepRemote(p, dt);
    // carried: ride on the carrier's shoulder
    if (me.carriedBy) {
      const c = G.players.get(me.carriedBy);
      if (c && c.zoneKey === me.zoneKey) { me.x = c.x + Math.cos(c.facing + Math.PI / 2) * 0.15; me.z = c.z + Math.sin(c.facing + Math.PI / 2) * 0.15; me.facing = c.facing; }
      else if (!c) me.carriedBy = null;
    }
    // talking: hold V (with a walkie switched on, you transmit on its channel too)
    const talk = G.input.down('talk');
    if (talk && !this.voice.mic && !this.voice.micError) this.voice.enableMic();
    const ch = Voice.radioOn(me);
    const mode: 0 | 1 | 2 = talk ? (ch ? 2 : 1) : 0;
    if (mode !== this.voice.mode) { this.voice.channel = ch; this.voice.setTalking(mode); if (mode === 2) G.audio?.ui?.('static_burst', 0.2); }
    for (const id of G.players.keys()) if (id !== this.id) this.voice.ensure(id);
    this.voice.update();
  }

  private myState() {
    const s: any = G.local.netState();
    s.vc = this.voice.mode; s.ch = this.voice.channel;
    return s;
  }

  private broadcastSnap() {
    const p: Record<string, any> = {};
    for (const q of G.players.values()) p[q.id] = q.isLocal ? this.myState() : q.remote?.state;
    const zones = new Set<string>();
    const near: { x: number; z: number; zone: string }[] = [];
    for (const q of G.players.values()) if (!q.isLocal) { zones.add(q.zoneKey); near.push({ x: q.x, z: q.z, zone: q.zoneKey }); }
    const c: any[] = [];
    for (const cr of (G.creatures?.creatures?.values?.() || []) as Iterable<any>) {
      if (!zones.has(cr.zoneKey)) continue;
      if (!near.some((n) => n.zone === cr.zoneKey && Math.abs(n.x - cr.x) < 60 && Math.abs(n.z - cr.z) < 60)) continue;
      c.push({ id: cr.id, k: cr.sp.key, z: cr.zoneKey, x: +cr.x.toFixed(2), zz: +cr.z.toFixed(2), f: +cr.facing.toFixed(2), s: cr.state, sp: +cr.speed.toFixed(2), hp: Math.round(cr.hp), y: +(cr.y || 0).toFixed(2), d: cr.dead ? 1 : 0, at: cr.attackPhase > 0 ? 1 : 0, ...(cr.mem?.net ? { m: cr.mem.net } : {}) });
    }
    this.to('all', { k: 'snap', p, c, h: G.clock.hours, col: +G.collapse.toFixed(3) });
  }

  private applySnap(d: any) {
    if (typeof d.h === 'number') G.clock.hours = d.h;
    if (typeof d.col === 'number') G.collapse = d.col;
    for (const [id, s] of Object.entries(d.p as Record<string, any>)) if (id !== this.id && s) this.applyRemote(id, s);
    for (const s of d.c || []) G.creatures?.applySnapshot?.(s);
  }

  /** a peer's survivor state arrived */
  private applyRemote(id: string, s: PlayerNetState & { vc?: number; ch?: number }) {
    if (!s || id === this.id) return;
    let p = G.players.get(id);
    if (!p) {
      p = new Player(id, s.name, s.app, false);
      p.x = s.x; p.z = s.z; p.zoneKey = s.zone;
      G.addPlayer(p);
      if (!this.peers.has(id)) this.peers.set(id, { name: s.name });
    }
    const tele = p.zoneKey !== s.zone || Math.hypot(p.x - s.x, p.z - s.z) > 6;
    p.remote = { tx: s.x, tz: s.z, tf: s.f, t: G.time, state: s };
    if (tele) { p.x = s.x; p.z = s.z; p.zoneKey = s.zone; }
  }

  private stepRemote(p: Player, dt: number) {
    const r = p.remote!; const s = r.state; if (!s) return;
    const k = 1 - Math.exp(-12 * dt);
    p.x += (r.tx - p.x) * k; p.z += (r.tz - p.z) * k;
    let df = r.tf - p.facing; while (df > Math.PI) df -= Math.PI * 2; while (df < -Math.PI) df += Math.PI * 2;
    p.facing += df * k;
    p.zoneKey = s.zone;
    p.y = G.zones.get(s.zone)?.heightAt(Math.floor(p.x), Math.floor(p.z)) ?? 0;
    p.speed = s.sp; p.stance = s.st; p.running = s.run; p.aiming = s.aim; p.scannerOpen = !!s.th;
    p.full = s.fb; p.actionAnim = s.ac; p.actionT = s.at; p.actionDur = s.ad;
    p.flashlightOn = s.light;
    p.body.downed = s.down; p.body.dead = s.dead;
    p.carrying = s.carry || null; p.carriedBy = s.carriedBy || null;
    p.inVehicle = s.veh || null;
    // held items & outfit are visual mirrors
    if ((p.handR?.key || '') !== s.hr) p.handR = s.hr ? ({ uid: -1, key: s.hr, cond: 1, age: 0 } as Item) : null;
    if ((p.handL?.key || '') !== s.hl) p.handL = s.hl ? ({ uid: -2, key: s.hl, cond: 1, age: 0 } as Item) : null;
    p.lightItem = s.light ? p.handR : null;
    const ok = JSON.stringify(s.out);
    if (this.outfitKey.get(p.id) !== ok) { this.outfitKey.set(p.id, ok); p.rig.setOutfit(s.out); }
  }

  // ---------------------------------------------------------------- effects & helpers
  private fx(kind: string, d: any) {
    if (kind === 'csnd') { const c = G.creatures?.creatures?.get?.(d.id); if (c) G.audio?.creature?.(d.s, c); }
    else if (kind === 'sound') G.audio?.at?.(d.key, d.x, d.z, d.vol ?? 1);
  }
  private applyMedical(inj: any) {
    const me = G.local; if (!me || !inj) return;
    for (const part of Object.values(me.body.parts)) for (const i of part.injuries) if ((i as any).id === inj.id) Object.assign(i, inj);
    bus.emit('halo', me, 'Someone patched me up', 'good');
  }
  private revived(by: string) {
    const me = G.local; if (!me?.body.downed) return;
    me.body.downed = false; me.body.downedTime = 0;
    me.body.blood = Math.max(me.body.blood, 40);
    me.body.health = Math.max(me.body.health, 25);
    me.body.endurance = Math.max(me.body.endurance, 0.3);
    bus.emit('halo', me, `${G.players.get(by)?.name || 'Someone'} pulled you back`, 'good');
  }

  close() { try { this.ws.close(); } catch { /* ignore */ } }
}
