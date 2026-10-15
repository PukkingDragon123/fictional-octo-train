// Remittance Hoppers: processing and the show.
//
// The host watches every hopper in zones where somebody is. Floor items lying
// on the plate, and furniture standing on it, are weighed for ~1.5 s once they
// stop moving; then a 'hopperEat' op takes them (every peer removes them, plays
// the scan line, the sink and the pneumatic thunk, rolls the number up) and the
// host credits the ledger. Things the hopper refuses (mission items, keys,
// the band) are shoved back off the front lip.
//
// The moving parts are local overlays on top of the static model
// (src/content/furniture/zd_contract.ts): the scale needle, the plate light,
// the scan curtain, the amber beacon and the projector lens.
import * as THREE from 'three';
import { bus } from '../../core/events';
import { G } from '../G';
import { defOp, op, isReplaying } from '../ops';
import { ModelBuilder } from '../../gfx/modelBuilder';
import { worldMaterial } from '../../gfx/materials';
import { objDef, buildObjGeometry } from '../../world/objects';
import { objectMatrix } from '../../world/chunkMesher';
import { floorItems, removeFloorItem, dropItem, WorldItem } from '../../items/worldItems';
import { itemGeometry } from '../../items/itemMeshes';
import { serializeItem } from '../../items/factory';
import { itemDef, itemName, type Item } from '../../items/item';
import { queueAt } from '../../actions/basic';
import { UseObjectAction } from '../../actions/world';
import type { GameSystem } from '../game';
import type { Player } from '../../entities/player';
import type { Zone, TileObject } from '../../world/zone';
import type { MenuOption } from '../../ui/ui';
import { itemValue, objectValue, objKeyValue, isRejected } from './values';
import { voss, bailiff, pick, fmt, L } from './voice';
import './debt.css';

const WEIGH_SECS = 1.5;
/** dial position on the model (needle pivot), see hopperModel() */
const DIAL = new THREE.Vector3(-0.84, 1.374, -0.684);

interface SinkPiece { key?: string; obj?: string; state?: any; x: number; y: number; z: number; rot: number; objRot?: number }
interface EatArgs { z: string; h: number; items: number[]; objs: number[]; value: number; keys: string[]; by: string; rej?: number[] }

defOp('hopperEat', (a: EatArgs) => {
  const z = G.zones.get(a.z); if (!z) return;
  const fl = floorItems(z);
  const sink: SinkPiece[] = [];
  for (const uid of a.items || []) {
    const wi = fl.get(uid); if (!wi) continue;
    sink.push({ key: wi.item.key, x: wi.x, y: wi.y, z: wi.z, rot: wi.rot });
    removeFloorItem(z, wi.item);
  }
  for (const ouid of a.objs || []) {
    const o = z.objects.get(ouid); if (!o) continue;
    const d = objDef(o.key);
    const w = d?.w ?? 1, dd = d?.d ?? 1, rw = o.rot % 2 === 0 ? w : dd, rd = o.rot % 2 === 0 ? dd : w;
    sink.push({ obj: o.key, state: { ...o.state }, x: o.x + rw / 2 + (o.ox ?? 0), y: 0, z: o.y + rd / 2 + (o.oz ?? 0), rot: 0, objRot: o.rot });
    z.removeObject(o);
    bus.emit('objRemoved', z, o);
  }
  // refused things are shoved back off the front lip
  const h = z.objects.get(a.h);
  for (const uid of a.rej || []) {
    const wi = fl.get(uid); if (!wi || !h) continue;
    removeFloorItem(z, wi.item);
    const [fx, fz] = frontLip(h);
    dropItem(z, wi.item, fx, fz, undefined, 0.8);
  }
  z.meta.floorVersion = (z.meta.floorVersion || 0) + 1;
  bus.emit('floorChanged', z);
  if (isReplaying()) return;
  if (a.items.length || a.objs.length) bus.emit('deposited', { by: a.by, keys: a.keys, value: a.value, hopper: a.h });
  (G.debt?.hoppers as HopperSystem | undefined)?.play(z, a.h, a.value, sink, (a.rej || []).length, a.by);
});

/** world point just in front of the plate */
function frontLip(o: TileObject): [number, number] {
  const r = o.rot;
  const cx = o.x + 1, cz = o.y + 1;
  const dx = r === 1 ? -1 : r === 3 ? 1 : 0, dz = r === 0 ? 1 : r === 2 ? -1 : 0;
  return [cx + dx * 1.45, cz + dz * 1.45];
}
/** is a world point on the plate (2 x 2 tiles) */
function onPlate(o: TileObject, x: number, z: number, m = 0.06) { return x >= o.x + m && x <= o.x + 2 - m && z >= o.y + m && z <= o.y + 2 - m; }

/** objects that count as "pushed onto the plate" */
function eatableObject(o: TileObject): boolean {
  if (o.key === 'hopper' || o.key === 'seam_door') return false;
  if (o.key === 'debris_pile') return true; // smashed on the plate: the wreck goes down too
  const d = objDef(o.key);
  if (!d || d.onWall || d.ceiling) return false;
  const t = d.tags || [];
  if (t.includes('hopper') || t.includes('portal') || t.includes('mission') || t.includes('node') || t.includes('light') || t.includes('transport_model')) return false;
  if (o.state.held || o.state.pushedBy || o.state.dragBy || o.state.draggedBy || o.state.heldBy || o.state.carriedBy) return false;
  return !!(d.movable || o.state.broken || o.state.pushed || o.state.debris || t.includes('debris'));
}

interface Fx {
  o: TileObject;
  zone: string;
  group: THREE.Group;
  needle: THREE.Object3D;
  glow: THREE.Mesh;
  pit: THREE.Mesh;
  scan: THREE.Mesh;
  curtain: THREE.Mesh;
  beacon: THREE.Mesh;
  lens: THREE.Mesh;
  load: number;           // 0..1 estimated weight on the plate
  needleA: number;
  phase: 'idle' | 'weigh' | 'scan' | 'sink' | 'reject';
  t: number;
  value: number;
  sinks: { mesh: THREE.Mesh; y0: number; x: number; z: number; s: number }[];
  label: HTMLElement | null;
  roll: number;
  checkT: number;
  big: boolean;
}

const GEO = new Map<string, THREE.BufferGeometry>();
/** overlay geometry, tinted per colour (additive overlays take their colour from the vertices) */
function geo(kind: 'needle' | 'glow' | 'pit' | 'scan' | 'curtain' | 'beacon' | 'lens', color = 0xffffff): THREE.BufferGeometry {
  const k = kind + ':' + color;
  let g = GEO.get(k);
  if (g) return g;
  const mb = new ModelBuilder();
  const o = { emissive: 1, color, fit: true };
  switch (kind) {
    case 'needle': mb.box(0, -0.012, 0, 0.014, 0.13, 0.006, 'zd_needle', { fit: true, emissive: 0.4 }); break;
    case 'glow': mb.flat(0, 0, 0, 1.0, 1.0, 'zd_glow', o); break;
    case 'pit': mb.flat(0, 0, 0, 0.94, 0.94, 'zd_pit', { emissive: 0 }); break;
    case 'scan': mb.flat(0, 0, 0, 1.92, 0.16, 'zd_scanline', o); break;
    case 'curtain': mb.panel(-0.92, 0, 0.92, 0, 0, 1.72, 'zd_curtain', o); mb.panel(0.92, 0, -0.92, 0, 0, 1.72, 'zd_curtain', o); break;
    case 'beacon': mb.cylinder(0, 0, 0, 0.065, 0.12, 8, 'zd_glow', o); break;
    case 'lens': mb.sphere(0, 0, 0, 0.045, 6, 4, 'zd_glow', o); break;
  }
  g = mb.build();
  GEO.set(k, g);
  return g;
}
/** a colour scaled to a brightness step (keeps the number of cached geometries small) */
const step = (c: number, k: number) => { const q = Math.max(0, Math.min(8, Math.round(k * 8))) / 8; return (Math.round(((c >> 16) & 255) * q) << 16) | (Math.round(((c >> 8) & 255) * q) << 8) | Math.round((c & 255) * q); };
const ADD = () => worldMaterial({ additive: true, outline: 0, unlit: true });

export class HopperSystem implements GameSystem {
  name = 'hoppers';
  root = new THREE.Group();
  private hostT = 0;
  private pending = new Map<number, { sig: string; since: number }>();
  private fx = new Map<number, Fx>();
  private cache = new Map<string, { t: number; list: TileObject[] }>();
  private tmp = new THREE.Vector3();

  constructor() {
    this.root.name = 'hoppers';
    G.pr.scene.add(this.root);
    bus.on('objectMenu', (p: Player, o: TileObject, out: MenuOption[]) => { if (o.key === 'hopper') { try { out.unshift(...this.menu(p, o)); } catch (e) { console.warn('hopper menu', e); } } });
    bus.on('zoneView', () => this.clearFx());
    bus.on('objAdded', (z: Zone, o: TileObject) => { if (o?.key === 'hopper') this.cache.delete(z.key); });
    bus.on('objRemoved', (z: Zone, o: TileObject) => { if (o?.key === 'hopper') this.cache.delete(z.key); });
  }

  /** every hopper in a zone */
  hoppersIn(z: Zone): TileObject[] {
    const c = this.cache.get(z.key);
    if (c && G.time - c.t < 5) return c.list;
    const list = [...z.objects.values()].filter((o) => o.key === 'hopper');
    this.cache.set(z.key, { t: G.time, list });
    return list;
  }
  /** nearest hopper to a point in a zone */
  nearest(z: Zone, x: number, zz: number): { o: TileObject; d: number } | null {
    let best: TileObject | null = null, bd = Infinity;
    for (const o of this.hoppersIn(z)) { const d = Math.hypot(o.x + 1 - x, o.y + 1 - zz); if (d < bd) { bd = d; best = o; } }
    return best ? { o: best, d: bd } : null;
  }
  /** a hopper within reach of a survivor */
  near(p: Player, r = 2.4): TileObject | null {
    const z = G.zones.get(p.zoneKey); if (!z) return null;
    const n = this.nearest(z, p.x, p.z);
    return n && n.d <= r + 1 ? n.o : null;
  }

  /** what lies on a plate right now */
  contents(z: Zone, o: TileObject): { items: WorldItem[]; objs: TileObject[] } {
    const items: WorldItem[] = [];
    for (const wi of floorItems(z).values()) if (onPlate(o, wi.x, wi.z)) items.push(wi);
    const objs: TileObject[] = [];
    const seen = new Set<number>();
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) for (const q of z.objectsAt(o.x + dx, o.y + dy)) {
      if (seen.has(q.uid) || q === o) continue;
      seen.add(q.uid);
      if (eatableObject(q)) objs.push(q);
    }
    return { items, objs };
  }

  // ---------------------------------------------------------------- host processing
  private hostStep() {
    const zones = new Set<string>();
    for (const p of G.players.values()) if (p.zoneKey) zones.add(p.zoneKey);
    const live = new Set<number>();
    for (const zk of zones) {
      if (zk === 'reality') continue;
      // a crewmate's zone the host never visited still has to be weighed: generate it (deterministic)
      let z = G.zones.get(zk);
      if (!z) { try { z = G.getZone(zk); } catch { continue; } }
      for (const o of this.hoppersIn(z)) {
        live.add(o.uid);
        const { items, objs } = this.contents(z, o);
        if (!items.length && !objs.length) { this.pending.delete(o.uid); continue; }
        const moving = items.some((wi) => wi.vy !== undefined);
        const sig = items.map((w) => w.item.uid).sort().join(',') + '|' + objs.map((q) => q.uid + ':' + q.x + ',' + q.y).sort().join(',');
        const pend = this.pending.get(o.uid);
        if (!pend || pend.sig !== sig || moving) { this.pending.set(o.uid, { sig, since: G.time }); continue; }
        if (G.time - pend.since < WEIGH_SECS) continue;
        this.pending.delete(o.uid);
        this.process(z, o, items, objs);
      }
    }
    for (const k of this.pending.keys()) if (!live.has(k)) this.pending.delete(k);
  }

  private process(z: Zone, o: TileObject, items: WorldItem[], objs: TileObject[]) {
    let value = 0;
    const keys: string[] = [], take: number[] = [], rej: number[] = [], objTake: number[] = [];
    for (const wi of items) {
      const v = itemValue(wi.item);
      if (v <= 0 && isRejected(itemDef(wi.item.key))) { rej.push(wi.item.uid); continue; }
      value += v; take.push(wi.item.uid); keys.push(wi.item.key);
    }
    for (const q of objs) { value += objectValue(q); objTake.push(q.uid); keys.push(q.key); }
    // who gets the credit: whoever stands closest
    let by = '', bd = 8;
    for (const p of G.players.values()) if (p.zoneKey === z.key) { const d = Math.hypot(p.x - (o.x + 1), p.z - (o.y + 1)); if (d < bd) { bd = d; by = p.id; } }
    op('hopperEat', { z: z.key, h: o.uid, items: take, objs: objTake, value, keys, by, rej } as EatArgs);
    if (value > 0) G.debt?.credit?.(value, 'deposit', by);
  }

  // ---------------------------------------------------------------- the show (every peer)
  play(z: Zone, uid: number, value: number, sink: SinkPiece[], rejected: number, by: string) {
    const o = z.objects.get(uid);
    const f = o && G.view?.zone === z ? this.ensureFx(z, o) : null;
    const cx = o ? o.x + 1 : 0, cz = o ? o.y + 1 : 0;
    if (f) {
      for (const s of sink) {
        let g: THREE.BufferGeometry | null = null;
        if (s.key) g = itemGeometry(s.key); else if (s.obj) g = buildObjGeometry(s.obj, s.state || {});
        if (!g) continue;
        const m = new THREE.Mesh(g, worldMaterial({}));
        m.position.set(s.x, s.y + 0.02, s.z);
        m.rotation.y = s.key ? s.rot : -(s.objRot ?? 0) * Math.PI / 2;
        m.castShadow = true;
        this.root.add(m);
        f.sinks.push({ mesh: m, y0: s.y + 0.02, x: s.x, z: s.z, s: 1 });
      }
      if (sink.length) { f.phase = 'scan'; f.t = 0; f.value = value; f.big = value >= 1000; }
      else if (rejected) { f.phase = 'reject'; f.t = 0; }
    }
    const here = z.key === G.local?.zoneKey;
    if (here && o) {
      if (sink.length) {
        G.audio?.play?.('hopper_scan', cx, cz, { vol: 0.9, range: 22 });
        setTimeout(() => G.audio?.play?.('hopper_thunk', cx, cz, { vol: 1, range: 28 }), 650);
        setTimeout(() => G.audio?.play?.('hopper_tally', cx, cz, { vol: 0.8, range: 18 }), 1300);
      }
      if (rejected) G.audio?.play?.('hopper_reject', cx, cz, { vol: 0.9, range: 18 });
    }
    // the handler has something to say about it (only the one who did it hears the comment)
    if (by && by === G.local?.id) {
      G.holo?.ping?.('deposit', value);
      const first = (G.debt?.s?.deposits ?? 0) <= 1;
      if (sink.length && value > 0) {
        if (first && !G.missions?.flags?.has('contract:first_deposit_said')) { G.missions?.set?.('contract:first_deposit_said'); setTimeout(() => voss(L.firstDeposit), 2400); }
        else if (Math.random() < (value >= 1000 ? 0.9 : 0.35)) setTimeout(() => voss(pick(value >= 1000 ? L.depositBig : L.deposit)), 2600);
      } else if (rejected) setTimeout(() => voss(pick(L.reject)), 800);
    }
  }

  private ensureFx(z: Zone, o: TileObject): Fx {
    let f = this.fx.get(o.uid);
    if (f) return f;
    const group = new THREE.Group();
    group.matrixAutoUpdate = false;
    const d = objDef('hopper')!;
    group.matrix.copy(objectMatrix(z, o, d));
    group.matrixWorldNeedsUpdate = true;
    const needleMat = worldMaterial({});
    const needle = new THREE.Group();
    const nm = new THREE.Mesh(geo('needle'), needleMat);
    nm.position.y = 0.065;
    needle.add(nm);
    needle.position.copy(DIAL);
    const glow = new THREE.Mesh(geo('glow', 0xffb040), ADD()); glow.position.set(0, 0.026, 0);
    const pit = new THREE.Mesh(geo('pit'), worldMaterial({})); pit.position.set(0, 0.0215, 0); pit.visible = false;
    const scan = new THREE.Mesh(geo('scan', 0x6af0ff), ADD()); scan.position.set(0, 0.03, 0); scan.visible = false;
    const curtain = new THREE.Mesh(geo('curtain', 0x2a90b0), ADD()); curtain.visible = false;
    const beacon = new THREE.Mesh(geo('beacon', 0xffa020), ADD()); beacon.position.set(-0.4, 2.39, -0.88); beacon.visible = false;
    const lens = new THREE.Mesh(geo('lens', 0x1a90c0), ADD()); lens.position.set(0.86, 1.86, -0.62);
    for (const m of [glow, scan, curtain, beacon, lens]) { m.renderOrder = 6; (m as any).castShadow = false; }
    group.add(needle, glow, pit, scan, curtain, beacon, lens);
    this.root.add(group);
    f = { o, zone: z.key, group, needle, glow, pit, scan, curtain, beacon, lens, load: 0, needleA: 0, phase: 'idle', t: 0, value: 0, sinks: [], label: null, roll: 0, checkT: 0, big: false };
    this.fx.set(o.uid, f);
    return f;
  }
  private dropFx(f: Fx) {
    this.root.remove(f.group);
    for (const s of f.sinks) this.root.remove(s.mesh);
    f.label?.remove();
    this.fx.delete(f.o.uid);
  }
  private clearFx() { for (const f of [...this.fx.values()]) this.dropFx(f); }

  private updateFx(dt: number) {
    const z = G.view?.zone;
    if (!z) return;
    const camX = G.pr.target.x, camZ = G.pr.target.z;
    const R = G.pr.lowW * G.pr.pxSize * 0.8 + 6;
    // create / drop overlays around the camera
    for (const o of this.hoppersIn(z)) {
      const near = Math.abs(o.x + 1 - camX) < R && Math.abs(o.y + 1 - camZ) < R;
      const f = this.fx.get(o.uid);
      if (near && !f) this.ensureFx(z, o);
      else if (!near && f && f.phase === 'idle') this.dropFx(f);
    }
    for (const f of this.fx.values()) {
      if (f.zone !== z.key || !z.objects.has(f.o.uid)) { this.dropFx(f); continue; }
      const o = f.o;
      const vis = G.view.vis.isVisible(o.x, o.y) || G.view.vis.isVisible(o.x + 1, o.y + 1);
      f.group.visible = vis;
      // what is on the plate (cheap check a few times a second)
      f.checkT -= dt;
      if (f.checkT <= 0 && (f.phase === 'idle' || f.phase === 'weigh')) {
        f.checkT = 0.2;
        const c = this.contents(z, o);
        let est = 0;
        for (const wi of c.items) { est += itemValue(wi.item); if (wi.y < 0.02 && wi.vy === undefined) wi.y = 0.021; }
        for (const q of c.objs) est += objKeyValue(q.key, q.state);
        const any = c.items.length + c.objs.length > 0;
        if (any && f.phase === 'idle') { f.phase = 'weigh'; f.t = 0; if (o.y < 9999) G.audio?.play?.('hopper_weigh', o.x + 1, o.y + 1, { vol: 0.8, range: 16 }); }
        if (!any && f.phase === 'weigh') f.phase = 'idle';
        f.load = any ? Math.min(1, Math.log10(1 + est) / 4.2) : 0;
      }
      f.t += dt;
      const on = G.debt?.on;
      // needle: springy, overshoots, jitters while something is on the plate
      const target = f.phase === 'weigh' || f.phase === 'scan' ? f.load + Math.sin(G.time * 23) * 0.01 : f.phase === 'sink' ? f.load * Math.max(0, 1 - f.t * 1.5) : 0;
      f.needleA += (target - f.needleA) * Math.min(1, dt * 5) + (f.phase === 'weigh' ? Math.sin(f.t * 17) * Math.exp(-f.t * 3) * 0.02 : 0);
      const a = Math.PI * 0.75 + Math.max(0, Math.min(1.02, f.needleA)) * Math.PI * 1.5;
      f.needle.rotation.z = Math.atan2(-Math.cos(a), -Math.sin(a));
      // plate light: dim idle breathing, amber while weighing, white flash on the take, red on reject
      let gl = on ? 0.12 + 0.05 * Math.sin(G.time * 1.3) : 0.02, gc = 0xffb040;
      if (f.phase === 'weigh') gl = 0.75 + 0.25 * Math.sin(G.time * 8);
      if (f.phase === 'scan') { gl = 0.6; gc = 0x6af0ff; }
      if (f.phase === 'sink') { gl = Math.max(0.15, 1.2 - f.t * 1.2); gc = 0xffe8c0; }
      if (f.phase === 'reject') { gl = 0.7 * (Math.sin(f.t * 20) > 0 ? 1 : 0.2); gc = 0xff3020; }
      f.glow.geometry = geo('glow', step(gc, Math.min(1, gl)));
      f.glow.scale.set(0.9 + gl * 0.25, 1, 0.9 + gl * 0.25);
      f.glow.visible = gl > 0.03;
      // scan curtain sweeps front to back, then back again
      const scanning = f.phase === 'scan';
      f.scan.visible = scanning; f.curtain.visible = scanning;
      if (scanning) {
        const s = Math.min(1, f.t / 0.6);
        const zz = 0.9 - s * 1.75;
        f.scan.position.z = zz; f.curtain.position.z = zz;
        f.curtain.scale.y = 0.85 + Math.sin(G.time * 40) * 0.05;
        if (f.t >= 0.62) { f.phase = 'sink'; f.t = 0; this.label(f); }
      }
      // pit open while things go down
      f.pit.visible = f.phase === 'sink' && f.t < 1.1;
      // sinking pieces: drop through the trapdoor with a shudder, shrinking into the dark
      for (let i = f.sinks.length - 1; i >= 0; i--) {
        const s = f.sinks[i];
        if (f.phase !== 'sink') continue;
        const k = Math.min(1, f.t / 0.9);
        const pull = k * k;
        const ox = (o.x + 1 - s.x) * pull * 0.6, oz = (o.y + 1 - s.z) * pull * 0.6;
        s.mesh.position.set(s.x + ox + Math.sin(G.time * 60 + i) * 0.01 * (1 - k), s.y0 - pull * 1.4, s.z + oz);
        s.mesh.scale.setScalar(Math.max(0.05, 1 - pull * 0.5));
        if (k >= 1) { this.root.remove(s.mesh); f.sinks.splice(i, 1); }
      }
      if (f.phase === 'sink' && f.t > 1.6 && !f.sinks.length) { f.phase = 'idle'; f.t = 0; }
      if (f.phase === 'reject' && f.t > 0.9) { f.phase = 'idle'; f.t = 0; }
      // beacon spins while processing, the lens brightens: the handler's projector is awake
      const busy = f.phase === 'scan' || f.phase === 'sink' || f.phase === 'reject';
      f.beacon.visible = busy && Math.sin(G.time * 14) > -0.2;
      f.lens.scale.setScalar((on ? 0.6 + 0.1 * Math.sin(G.time * 3) : 0.25) + (busy ? 0.4 : 0));
      if (vis && G.local?.zoneKey === f.zone) {
        this.tmp.set(o.x + 1, 0, o.y + 1);
        if (busy) G.pointLight(this.tmp.x - 0.4, 2.3, this.tmp.z - 0.9, f.phase === 'reject' ? 0xff3020 : 0xffa020, 1.4 * (Math.sin(G.time * 14) > 0 ? 1 : 0.25), 6);
        if (scanning) G.pointLight(this.tmp.x, 0.6, this.tmp.z, 0x6af0ff, 1.6, 5);
        else if (f.phase === 'weigh') G.pointLight(this.tmp.x, 0.4, this.tmp.z, 0xffa030, 0.7 + 0.4 * Math.sin(G.time * 8), 4);
        else if (f.phase === 'sink') G.pointLight(this.tmp.x, 0.3, this.tmp.z, 0xffe0b0, Math.max(0, 1.4 - f.t), 5);
      }
      // the number roll-up projected above the plate
      if (f.label) {
        f.roll += dt;
        const k = Math.min(1, f.roll / 1.1);
        const shown = Math.round(f.value * (1 - Math.pow(1 - k, 3)));
        const num = f.label.querySelector('b');
        if (num) num.textContent = '+' + fmt(shown);
        const sp = G.pr.worldToScreen(this.tmp.set(o.x + 1, 1.1, o.y + 1.3));
        f.label.style.left = sp.x + 'px'; f.label.style.top = sp.y + 'px';
        f.label.style.opacity = String(vis ? Math.min(1, (3.2 - f.roll) * 2) : 0);
        if (f.roll > 3.4) { f.label.remove(); f.label = null; }
      }
    }
  }

  private label(f: Fx) {
    if (f.value <= 0) return;
    f.label?.remove();
    const el = document.createElement('div');
    el.className = 'dbt-roll' + (f.big ? ' big' : '');
    const owed = G.debt?.on ? (G.debt.cleared ? `SURPLUS ${fmt(G.debt.surplus)}` : `OWED ${fmt(G.debt.remaining)}`) : '';
    el.innerHTML = `<b>+0</b><i>SCRIP</i>${owed ? `<s>${owed}</s>` : ''}`;
    document.body.appendChild(el);
    f.label = el; f.roll = 0;
  }

  // ---------------------------------------------------------------- menus
  menu(p: Player, o: TileObject): MenuOption[] {
    const out: MenuOption[] = [];
    const z = G.getZone(p.zoneKey);
    const debt = G.debt;
    const at = (name: string, secs: number, anim: string, fn: () => void) => () => queueAt(p, o.x + 1, o.y + 1, new UseObjectAction(p, name, secs, anim as any, fn), 2.0);
    if (!debt?.on) { out.push({ label: 'The plate is cold. Nobody is collecting.', disabled: true }); return out; }
    out.push({ label: 'Read the scale', action: at('Read the scale', 1.2, 'read', () => G.ui?.read?.('REMITTANCE HOPPER', ledgerText(), 'terminal')) });
    const carried = p.allItems().filter((it) => !p.isWorn(it) && it.key !== 'bailiff_band');
    const valued = carried.map((it) => ({ it, v: itemValue(it) })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v);
    const vals = valued.filter((x) => (itemDef(x.it.key).tags || []).includes('valuable'));
    if (vals.length) out.push({ label: `Deposit all valuables (${vals.length}) ≈ ${fmt(vals.reduce((s, x) => s + x.v, 0))}`, action: at('Deposit', 1.2, 'pickup', () => this.depositItems(p, o, vals.map((x) => x.it))) });
    if (valued.length) out.push({ label: 'Deposit…', sub: valued.slice(0, 14).map((x) => ({ label: `${itemName(x.it)} ≈ ${fmt(x.v)}`, action: at('Deposit', 0.8, 'pickup', () => this.depositItems(p, o, [x.it])) })) });
    else out.push({ label: 'Deposit…', disabled: 'nothing worth anything on you' });
    const st = G.band?.get?.(p.id);
    if (st === 'blown' || st === 'lost') out.push({ label: 'Take a replacement band', danger: true, action: at('Refit', 3, 'craft', () => G.band?.refit?.(p)) });
    void z;
    return out;
  }

  /** put carried items onto the plate (they are processed like anything else lying there) */
  depositItems(p: Player, o: TileObject, items: Item[]) {
    const z = G.getZone(p.zoneKey);
    let i = 0;
    for (const it of items) {
      if (!p.containerOf(it) || p.isWorn(it)) continue;
      p.removeItem(it);
      const a = (i++ / Math.max(1, items.length)) * Math.PI * 2 + o.uid;
      const r = items.length > 1 ? 0.35 : 0.1;
      op('dropFloor', { z: z.key, item: serializeItem(it), x: o.x + 1 + Math.cos(a) * r, zz: o.y + 1.15 + Math.sin(a) * r * 0.7, y: 0.6, v: [Math.cos(a) * 0.3, 0.6, Math.sin(a) * 0.3] });
    }
    bus.emit('inventoryChanged', p);
    G.audio?.at?.('thud_soft', o.x + 1, o.y + 1, 0.5);
  }

  /** item menu hook: "Deposit" while standing at a hopper */
  itemMenu(p: Player, it: Item, opts: MenuOption[], inWorld: boolean) {
    if (!G.debt?.on || it.key === 'bailiff_band') return;
    const o = this.near(p, 2.2);
    if (!o) return;
    const v = itemValue(it);
    if (v <= 0) { opts.unshift({ label: 'Deposit', disabled: 'the hopper won\'t take it' }); return; }
    opts.unshift({ label: `Deposit in hopper ≈ ${fmt(v)} scrip`, action: () => {
      if (inWorld) { G.ui?.toast?.('PICK IT UP FIRST', '', 2); return; }
      queueAt(p, o.x + 1, o.y + 1, new UseObjectAction(p, 'Deposit', 0.8, 'pickup', () => this.depositItems(p, o, [it])), 2.0);
    } });
  }

  // ---------------------------------------------------------------- per frame
  update(dt: number) {
    if (G.role !== 'client' && G.debt?.on) {
      this.hostT -= dt;
      if (this.hostT <= 0) { this.hostT = 0.25; this.hostStep(); }
    }
    this.updateFx(dt);
  }
}

export function ledgerText(): string {
  const d = G.debt;
  if (!d?.on) return 'NO ACCOUNT.';
  const L2 = [`ACCOUNT  CREW LEDGER`, `PRINCIPAL        ${fmt(d.s.principal).padStart(9)}`, `PENALTIES        ${fmt(d.s.owed - d.s.principal).padStart(9)}`, `PAID             ${fmt(d.paid).padStart(9)}`, `BALANCE          ${fmt(d.remaining).padStart(9)}`, ''];
  if (d.cleared) L2.push('CONTRACT DISCHARGED.', `SURPLUS          ${fmt(d.surplus).padStart(9)}`, '', 'PASSAGE MAY BE PURCHASED AT THE DEPOT.');
  else {
    L2.push(`INSTALLMENT ${d.installment} OF ${d.count}`, `DUE              ${fmt(d.due).padStart(9)}`, `BY               DAY ${d.dueDay}  (${Math.floor(d.hoursLeft)}H LEFT)`);
    if (d.s.missed) L2.push('', `MISSED PAYMENTS: ${d.s.missed}`);
  }
  L2.push('', `DEPOSITS LOGGED: ${d.s.deposits}`, 'STAND CLEAR OF THE PLATE DURING PROCESSING.');
  void bailiff;
  return L2.join('\n');
}
