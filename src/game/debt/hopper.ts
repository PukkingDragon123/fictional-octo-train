// Remittance Presses: processing and the show. (The object key and the class
// name are still 'hopper' / HopperSystem so saves, zones and hooks keep working.)
//
// Put goods or furniture on the plate and pull the lever (the menu's first
// option, so E / a click pulls it; anything else can call pull(p, o)). Every
// peer runs the cycle from the 'pressCycle' op: the lever comes down, the horn,
// the ram creeps, then slams onto the plate (hitstop, shake, sparks, the frame
// ringing). At the moment of impact the host weighs what is under it and a
// 'hopperEat' op takes it: every peer removes it and shows the flattened load
// sinking into the shimmering seam under the plate, the number rolls up, the
// host credits the ledger, bus 'deposited' fires. Things the press refuses
// (mission items, keys, the band) are thrown back off the front lip. Anything
// alive on the plate is crushed: each peer kills its own survivor, the host its
// creatures.
//
// Nothing about it is screen UI: the moving parts are local overlays on top
// of the static model (src/content/furniture/zd_contract.ts): ram and piston
// rods, the lever, the gauge needle, the plate's warning light, the beacon,
// the row of nixie tubes in the crown that counts up what the last load was
// worth, the seam's shimmer and the projector lens.
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
import { Particles, PK } from '../../gore/particles';
import { KINDS } from '../../gore/kinds';
import { hitstop, shake, punch } from '../../gfx/juice';
import { PRESS, pressRamModel, pressRodModel, pressLeverModel } from '../../content/furniture/zd_contract';
import type { GameSystem } from '../game';
import type { Player } from '../../entities/player';
import type { Zone, TileObject } from '../../world/zone';
import type { MenuOption } from '../../ui/ui';
import { itemValue, objectValue, objKeyValue, isRejected } from './values';
import { voss, bailiff, pick, fmt, L } from './voice';
import '../../audio/sounds_press';
import { crtScreen, phosphorText, fontsReady, type CrtScreen } from '../../gfx/crt';
import './debt.css';

/** the cycle, seconds after the lever: horn, slam, hold, back up */
export const CYCLE = { horn: 0.3, drop: 0.95, impact: 1.13, rise: 1.75, done: 3.3 };
const DIAL = new THREE.Vector3(...PRESS.gauge);
/** the seam's shimmer: pale and oily, the colour of nothing in particular */
const SEAM = 0xd8d0bc;

interface SinkPiece { key?: string; obj?: string; state?: any; x: number; y: number; z: number; rot: number; objRot?: number }
interface EatArgs { z: string; h: number; items: number[]; objs: number[]; value: number; keys: string[]; by: string; rej?: number[] }
interface CycleArgs { z: string; h: number; by: string }

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
  // refused things are thrown back off the front lip
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

/** somebody threw the lever: every peer runs the show, the host weighs at the impact */
defOp('pressCycle', (a: CycleArgs) => {
  if (isReplaying()) return;
  (G.debt?.hoppers as HopperSystem | undefined)?.startCycle(a);
});

/** the press's model matrix: front +z, rotated by o.rot */
function dirOf(o: TileObject): [number, number] { const r = o.rot; return [r === 1 ? -1 : r === 3 ? 1 : 0, r === 0 ? 1 : r === 2 ? -1 : 0]; }
/** world point just in front of the plate */
function frontLip(o: TileObject): [number, number] {
  const [dx, dz] = dirOf(o);
  return [o.x + 1 + dx * 1.45, o.y + 1 + dz * 1.45];
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
  ram: THREE.Mesh;
  rods: THREE.Mesh[];
  lever: THREE.Mesh;
  needle: THREE.Object3D;
  glow: THREE.Mesh;
  seam: THREE.Mesh;
  ring: THREE.Mesh;
  beacon: THREE.Mesh;
  lens: THREE.Mesh;
  load: number;           // 0..1 estimated value on the plate
  needleA: number;
  loaded: boolean;
  ramY: number;
  sinks: { mesh: THREE.Mesh; y0: number; x: number; z: number; t: number }[];
  nixie: CrtScreen;
  shownN: number;
  roll: number;
  value: number;
  big: boolean;
  checkT: number;
  flash: number;
}
/** a running cycle (kept per press uid on every peer, whether or not anyone is looking) */
interface Cycle { z: string; h: number; by: string; t: number; hit: boolean; rej: boolean; loadT: number }

const GEO = new Map<string, THREE.BufferGeometry>();
/** overlay geometry, tinted per colour (additive overlays take their colour from the vertices) */
function geo(kind: 'needle' | 'glow' | 'seam' | 'ring' | 'beacon' | 'lens' | 'ram' | 'rod' | 'lever' | 'drum', color = 0xffffff): THREE.BufferGeometry {
  const k = kind + ':' + color;
  let g = GEO.get(k);
  if (g) return g;
  const mb = new ModelBuilder();
  const o = { emissive: 1, color, fit: true };
  switch (kind) {
    case 'needle': mb.box(0, -0.012, 0, 0.014, 0.12, 0.006, 'zd_needle', { fit: true, emissive: 0.4 }); break;
    case 'glow': mb.flat(0, 0, 0, 1.0, 1.0, 'zd_glow', o); break;
    case 'seam': mb.flat(0, 0, 0, 1.0, 1.0, 'zd_seam', o); break;
    case 'ring': mb.flat(0, 0, 0, 1.0, 1.0, 'zd_glow', o); break;
    case 'beacon': mb.cylinder(0, 0, 0, 0.065, 0.12, 8, 'zd_glow', o); break;
    case 'lens': mb.sphere(0, 0, 0, 0.045, 6, 4, 'zd_glow', o); break;
    case 'ram': pressRamModel(mb); break;
    case 'rod': pressRodModel(mb); break;
    case 'lever': pressLeverModel(mb); break;
    case 'drum': {
      // the nixie tubes' glass envelopes and their sockets (the glow behind is a canvas on a tube material)
      for (let i = 0; i < 5; i++) {
        const x = (i - 2) * PRESS.drum;
        mb.cylinder(x, -0.085, 0.03, 0.05, 0.03, 8, 'metal_dark');
        mb.cylinder(x, -0.055, 0.03, 0.044, 0.135, 10, 'glass', { color: 0xd8c8b0, emissive: 0.08 });
        mb.sphere(x, 0.08, 0.03, 0.044, 8, 3, 'glass', { color: 0xd8c8b0, sy: 0.5 });
      }
      mb.cylinderX(0, -0.08, 0.025, 0.035, 0.6, 8, 'metal_dark');
      break;
    }
  }
  g = mb.build();
  GEO.set(k, g);
  return g;
}
/** the press's moving parts as geometry (the intro builds its giant press from these too) */
export function pressPartGeo(kind: 'ram' | 'rod' | 'lever'): THREE.BufferGeometry { return geo(kind); }
let nixieFonts = false;
void fontsReady().then(() => { nixieFonts = true; });
/** five nixie tubes: every cathode faintly there, the lit digit glowing orange (n < 0: all dark) */
function drawNixie(c: CrtScreen, n: number) {
  const x = c.ctx, W = c.canvas.width, H = c.canvas.height;
  x.fillStyle = '#0a0604'; x.fillRect(0, 0, W, H);
  const font = "'Nixie One', 'IBM Plex Mono', monospace";
  const s = n < 0 ? '' : String(n).padStart(5, '0');
  for (let i = 0; i < 5; i++) {
    const cx = W * (0.1 + i * 0.2);
    // the stacked cathodes behind the lit one
    if (nixieFonts) for (const d of ['8', '0', '3']) phosphorText(x, d, cx, 4, { size: 30, color: '#2a160c', align: 'center', glow: 0, font });
    if (s && nixieFonts) phosphorText(x, s[i], cx, 4, { size: 30, color: '#ff9a3a', align: 'center', glow: 10, font });
  }
  c.flush();
}
/** a colour scaled to a brightness step (keeps the number of cached geometries small) */
const step = (c: number, k: number) => { const q = Math.max(0, Math.min(8, Math.round(k * 8))) / 8; return (Math.round(((c >> 16) & 255) * q) << 16) | (Math.round(((c >> 8) & 255) * q) << 8) | Math.round((c & 255) * q); };
const ADD = () => worldMaterial({ additive: true, outline: 0, unlit: true });
const easeIn = (t: number) => t * t * t;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** where the ram is (underside, model y) t seconds into a cycle */
export function ramAt(t: number): number {
  const { ramUp, ramDown } = PRESS;
  if (t < CYCLE.horn) return ramUp;
  if (t < CYCLE.drop) return ramUp - 0.1 * easeOut((t - CYCLE.horn) / (CYCLE.drop - CYCLE.horn));
  if (t < CYCLE.impact) return ramUp - 0.1 - (ramUp - 0.1 - ramDown) * easeIn((t - CYCLE.drop) / (CYCLE.impact - CYCLE.drop));
  if (t < CYCLE.rise) return ramDown + Math.max(0, Math.sin((t - CYCLE.impact) * 40) * 0.012 * Math.exp(-(t - CYCLE.impact) * 9));
  if (t < CYCLE.done) return ramDown + (ramUp - ramDown) * easeOut((t - CYCLE.rise) / (CYCLE.done - CYCLE.rise)) ** 1.4;
  return ramUp;
}
/** the lever's angle t seconds into a cycle (-1 = at rest) */
export function leverAt(t: number): number {
  const { leverRest: a, leverPulled: b } = PRESS;
  if (t < 0) return a;
  if (t < 0.28) return a + (b - a) * easeOut(t / 0.28);
  if (t < CYCLE.rise) return b;
  if (t < CYCLE.rise + 0.5) return b + (a - b) * easeOut((t - CYCLE.rise) / 0.5);
  return a;
}

/** valuables lying about catch the light now and then, so a smashed sofa's ring is findable */
class Glints {
  private pool: THREE.Mesh[] = [];
  private live: { m: THREE.Mesh; t: number; life: number }[] = [];
  private pickT = 0;
  constructor(private root: THREE.Group) {
    const mb = new ModelBuilder();
    mb.panel(-0.5, 0, 0.5, 0, -0.5, 0.5, 'zd_glint', { emissive: 1, fit: true, color: 0xfff4d8 });
    const g = mb.build();
    for (let i = 0; i < 10; i++) { const m = new THREE.Mesh(g, ADD()); m.visible = false; m.renderOrder = 7; m.frustumCulled = false; root.add(m); this.pool.push(m); }
  }
  update(dt: number, z: Zone) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const l = this.live[i];
      l.t += dt;
      const k = Math.sin(Math.PI * Math.min(1, l.t / l.life));
      l.m.scale.setScalar(Math.max(0.001, k * 0.22));
      l.m.quaternion.copy(G.pr.camera.quaternion);
      if (l.t >= l.life) { l.m.visible = false; this.pool.push(l.m); this.live.splice(i, 1); }
    }
    this.pickT -= dt;
    if (this.pickT > 0 || !this.pool.length) return;
    this.pickT = 0.35;
    const cx = G.pr.target.x, cz = G.pr.target.z, R = 12;
    const cands: WorldItem[] = [];
    for (const wi of floorItems(z).values()) {
      if (Math.abs(wi.x - cx) > R || Math.abs(wi.z - cz) > R || wi.vy !== undefined) continue;
      const t = itemDef(wi.item.key).tags;
      if (!t || !t.includes('valuable')) continue;
      if (!G.view?.vis.isVisible(Math.floor(wi.x), Math.floor(wi.z))) continue;
      cands.push(wi);
    }
    if (!cands.length) return;
    const wi = cands[Math.floor(Math.random() * cands.length)];
    const m = this.pool.pop()!;
    m.position.set(wi.x + (Math.random() - 0.5) * 0.05, wi.y + 0.06, wi.z + (Math.random() - 0.5) * 0.05);
    m.visible = true;
    this.live.push({ m, t: 0, life: 0.45 });
  }
}

const tv = new THREE.Vector3();

export class HopperSystem implements GameSystem {
  name = 'hoppers';
  root = new THREE.Group();
  /** running press cycles by press uid */
  cycles = new Map<number, Cycle>();
  private fx = new Map<number, Fx>();
  private cache = new Map<string, { t: number; list: TileObject[] }>();
  private glints: Glints;
  private sparks: Particles;
  private nagT = 0;

  constructor() {
    G.press = this;
    this.root.name = 'hoppers';
    G.pr.scene.add(this.root);
    this.glints = new Glints(this.root);
    this.sparks = new Particles(140, true);
    this.root.add(this.sparks.mesh);
    bus.on('objectMenu', (p: Player, o: TileObject, out: MenuOption[]) => { if (o.key === 'hopper') { try { out.unshift(...this.menu(p, o)); } catch (e) { console.warn('press menu', e); } } });
    bus.on('zoneView', () => { this.clearFx(); this.sparks.clear(); });
    bus.on('objAdded', (z: Zone, o: TileObject) => { if (o?.key === 'hopper') this.cache.delete(z.key); });
    bus.on('objRemoved', (z: Zone, o: TileObject) => { if (o?.key === 'hopper') this.cache.delete(z.key); });
  }

  /** every press in a zone */
  hoppersIn(z: Zone): TileObject[] {
    const c = this.cache.get(z.key);
    if (c && G.time - c.t < 5) return c.list;
    const list = [...z.objects.values()].filter((o) => o.key === 'hopper');
    this.cache.set(z.key, { t: G.time, list });
    return list;
  }
  /** nearest press to a point in a zone */
  nearest(z: Zone, x: number, zz: number): { o: TileObject; d: number } | null {
    let best: TileObject | null = null, bd = Infinity;
    for (const o of this.hoppersIn(z)) { const d = Math.hypot(o.x + 1 - x, o.y + 1 - zz); if (d < bd) { bd = d; best = o; } }
    return best ? { o: best, d: bd } : null;
  }
  /** a press within reach of a survivor */
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
  /** rough value of what is on the plate */
  estimate(z: Zone, o: TileObject): number {
    const c = this.contents(z, o);
    let v = 0;
    for (const wi of c.items) v += itemValue(wi.item);
    for (const q of c.objs) v += objKeyValue(q.key, q.state);
    return v;
  }

  // ---------------------------------------------------------------- the lever
  /** is this press mid-cycle */
  busy(o: TileObject | number): boolean { return this.cycles.has(typeof o === 'number' ? o : o.uid); }
  /** world point beside the lever (outside the plate), where a survivor stands to pull it */
  leverPoint(o: TileObject): [number, number] {
    const [dx, dz] = dirOf(o);
    // the lever sits on the press's right: model +x, which is the front direction turned a quarter
    const rx = -dz, rz = dx;
    return [o.x + 1 + rx * 1.55 + dx * 0.85, o.y + 1 + rz * 1.55 + dz * 0.85];
  }
  /** throw the lever now (G.press.pull: the grab verb, the menu, the walkthrough): a press object or its uid; false while it is cycling */
  pull(p: Player | null, press: TileObject | number): boolean {
    const z = G.zones.get(p?.zoneKey ?? G.view?.zone.key ?? '');
    const o = typeof press === 'number' ? z?.objects.get(press) : press;
    if (!o || o.key !== 'hopper' || this.busy(o)) return false;
    if (!z || !z.objects.has(o.uid)) return false;
    op('pressCycle', { z: z.key, h: o.uid, by: p?.id ?? '' } as CycleArgs);
    return true;
  }
  /** walk to the lever and pull it (from the front lip when the lever side is walled in) */
  pullAction(p: Player, o: TileObject, then?: () => void) {
    const z = G.zones.get(p.zoneKey);
    const free = (x: number, y: number) => !!z && z.inb(Math.floor(x), Math.floor(y)) && !!z.floor[z.idx(Math.floor(x), Math.floor(y))] && !z.solid[z.idx(Math.floor(x), Math.floor(y))];
    let [lx, lz] = this.leverPoint(o);
    if (!free(lx, lz)) [lx, lz] = frontLip(o);
    const act = new UseObjectAction(p, 'Pull the lever', 0.45, 'pickup', () => { this.pull(p, o); then?.(); });
    if (!free(lx, lz) && !onPlate(o, p.x, p.z, -0.1) && Math.hypot(p.x - o.x - 1, p.z - o.y - 1) < 3.2) { p.actions.clear(); p.actions.add(act); return; }
    queueAt(p, lx, lz, act, 0.9, false);
  }

  /** every peer: a cycle starts */
  startCycle(a: CycleArgs) {
    if (this.cycles.has(a.h)) return;
    this.cycles.set(a.h, { z: a.z, h: a.h, by: a.by, t: 0, hit: false, rej: false, loadT: 0 });
    const z = G.zones.get(a.z), o = z?.objects.get(a.h);
    if (!o || a.z !== G.local?.zoneKey) return;
    const cx = o.x + 1, cz = o.y + 1;
    G.audio?.play?.('press_lever', cx, cz, { vol: 0.9, range: 16 });
    setTimeout(() => G.audio?.play?.('press_klaxon', cx, cz, { vol: 0.8, range: 30 }), CYCLE.horn * 1000);
    bus.emit('pressPulled', { by: a.by, hopper: a.h, zone: a.z });
  }

  private stepCycles(dt: number) {
    for (const [uid, c] of this.cycles) {
      c.t += dt;
      if (!c.hit && c.t >= CYCLE.impact) { c.hit = true; this.impact(c); }
      if (c.t >= CYCLE.done) this.cycles.delete(uid);
    }
  }

  /** the ram meets the plate */
  private impact(c: Cycle) {
    const z = G.zones.get(c.z), o = z?.objects.get(c.h);
    if (!z || !o) return;
    const cx = o.x + 1, cz = o.y + 1;
    const here = c.z === G.local?.zoneKey;
    // what is alive under it
    const crushed: { x: number; z: number }[] = [];
    for (const p of G.players.values()) {
      if (p.zoneKey !== c.z || p.body.dead || !onPlate(o, p.x, p.z, 0.12)) continue;
      crushed.push({ x: p.x, z: p.z });
      if (p === G.local) this.crushPlayer(p, cx, cz);
    }
    const cr = G.creatures?.creatures as Map<string, any> | undefined;
    if (cr) for (const k of cr.values()) {
      if (k.zoneKey !== c.z || k.dead || !onPlate(o, k.x, k.z, 0.05)) continue;
      crushed.push({ x: k.x, z: k.z });
      if (G.role !== 'client') G.creatures.damage('press', k.id, 99999, cx, cz, 0, 'vehicle', true);
    }
    // the host weighs and takes whatever is under the ram
    if (G.role !== 'client' && G.debt?.on) {
      const { items, objs } = this.contents(z, o);
      if (items.length || objs.length) this.process(z, o, items, objs, c.by);
    }
    if (!here) return;
    // the show: the slam, hitstop and shake by distance, sparks from the column sleeves, grit, blood if it found someone
    G.audio?.play?.('press_slam', cx, cz, { vol: 1, range: 36 });
    setTimeout(() => G.audio?.play?.('press_hiss', cx, cz, { vol: 0.7, range: 18 }), (CYCLE.rise - CYCLE.impact) * 1000);
    const p = G.local;
    const d = p ? Math.hypot(p.x - cx, p.z - cz) : 99;
    if (d < 12) {
      const k = 1 - d / 12;
      hitstop(40 + 50 * k);
      shake(0.25 + 0.5 * k, 0.35);
      if (d < 5) punch(0.05 * k, 0.25);
    }
    const f = this.fx.get(c.h);
    if (f) f.flash = 1;
    const m = f?.group.matrix;
    const r = Math.random;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      tv.set(sx * 0.89, PRESS.ramDown + 0.1, sz * 0.89);
      if (m) tv.applyMatrix4(m); else tv.set(cx + sx * 0.89, PRESS.ramDown + 0.1, cz + sz * 0.89);
      for (let i = 0; i < 9; i++) this.sparks.add(PK.Spark, tv.x, tv.y, tv.z, sx * (0.6 + r() * 2.2), 0.4 + r() * 2.2, sz * (0.6 + r() * 2.2), 0.012 + r() * 0.01, 0.4 + r() * 0.5, [0xffffff, 0xfff2c0, 0xffd070, 0xbfe6ff][(r() * 4) | 0], 0.25);
    }
    for (let i = 0; i < 18; i++) { const a = r() * Math.PI * 2; this.sparks.add(PK.Dust, cx + Math.cos(a) * 1.05, 0.08, cz + Math.sin(a) * 1.05, Math.cos(a) * (0.6 + r()), 0.2 + r() * 0.4, Math.sin(a) * (0.6 + r()), 0.03 + r() * 0.03, 1.2 + r(), 0x8a8478, 0); }
    if (crushed.length) {
      G.audio?.play?.('press_crunch', cx, cz, { vol: 1, range: 24 });
      const gore = G.gore as any;
      if (gore && (G.sandbox.gore ?? 2) > 0) {
        for (const q of crushed) {
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) gore.jet?.(KINDS.red, 0xffffff, q.x, 0.12, q.z, dx, dz, 16, 3.2, 0.7, 0.35);
          gore.pool?.(z, q.x, q.z, 1.2, KINDS.red, 0xffffff, 2);
        }
        if (d < 4) gore.lens?.splash?.(0.7, 0);
      }
    }
  }

  /** the local survivor was standing on the plate */
  private crushPlayer(p: Player, cx: number, cz: number) {
    const b = p.body;
    for (const part of ['head', 'torso_u', 'torso_l', 'thigh_l', 'thigh_r', 'uarm_l', 'uarm_r'] as const) { try { b.addInjury(part, 'fracture', 1); } catch { /* unknown part on an old body */ } }
    b.blood = Math.min(b.blood, 3);
    b.health = 0;
    const gore = G.gore as any;
    gore?.playerHit?.(p, { dmg: 250, from: [cx, cz] }, 'torso_u', 'deep');
    if ((G.sandbox.gore ?? 2) >= 2) gore?.gibPlayer?.(p);
    bus.emit('playerHit', p, 'torso_u', 'crush', { dmg: 250, from: [cx, cz], knock: 0, by: 'the Remittance Press' });
    if (!b.dead) { b.dead = true; b.downed = false; bus.emit('death', p); }
  }

  private process(z: Zone, o: TileObject, items: WorldItem[], objs: TileObject[], puller = '') {
    let value = 0;
    const keys: string[] = [], take: number[] = [], rej: number[] = [], objTake: number[] = [];
    for (const wi of items) {
      const v = itemValue(wi.item);
      if (v <= 0 && isRejected(itemDef(wi.item.key))) { rej.push(wi.item.uid); continue; }
      value += v; take.push(wi.item.uid); keys.push(wi.item.key);
    }
    for (const q of objs) { value += objectValue(q); objTake.push(q.uid); keys.push(q.key); }
    // who gets the credit: whoever pulled the lever, else whoever stands closest
    let by = puller && G.players.has(puller) ? puller : '', bd = 8;
    if (!by) for (const p of G.players.values()) if (p.zoneKey === z.key) { const d = Math.hypot(p.x - (o.x + 1), p.z - (o.y + 1)); if (d < bd) { bd = d; by = p.id; } }
    op('hopperEat', { z: z.key, h: o.uid, items: take, objs: objTake, value, keys, by, rej } as EatArgs);
    if (value > 0) G.debt?.credit?.(value, 'deposit', by);
  }

  // ---------------------------------------------------------------- the show (every peer)
  play(z: Zone, uid: number, value: number, sink: SinkPiece[], rejected: number, by: string) {
    const o = z.objects.get(uid);
    const f = o && G.view?.zone === z ? this.ensureFx(z, o) : null;
    const cx = o ? o.x + 1 : 0, cz = o ? o.y + 1 : 0;
    if (f) {
      // the load, flattened, sinks into the seam once the ram lets go
      for (const s of sink) {
        let g: THREE.BufferGeometry | null = null;
        if (s.key) g = itemGeometry(s.key); else if (s.obj) g = buildObjGeometry(s.obj, s.state || {});
        if (!g) continue;
        const m = new THREE.Mesh(g, worldMaterial({}));
        m.position.set(s.x, 0.07, s.z);
        m.rotation.y = s.key ? s.rot : -(s.objRot ?? 0) * Math.PI / 2;
        m.scale.set(1.15, 0.08, 1.15);
        this.root.add(m);
        f.sinks.push({ mesh: m, y0: 0.07, x: s.x, z: s.z, t: 0 });
      }
      if (value > 0) { f.value = value; f.big = value >= 1000; f.roll = 0; }
    }
    const here = z.key === G.local?.zoneKey;
    if (here && o) {
      if (sink.length) {
        setTimeout(() => G.audio?.play?.('press_seam', cx, cz, { vol: 0.85, range: 20 }), 450);
        setTimeout(() => G.audio?.play?.('hopper_tally', cx, cz, { vol: 0.8, range: 18 }), 1200);
      }
      if (rejected) setTimeout(() => G.audio?.play?.('hopper_reject', cx, cz, { vol: 0.9, range: 18 }), 700);
    }
    // the handler has something to say about it (only the one who did it hears the comment)
    if (by && by === G.local?.id) {
      G.holo?.ping?.('deposit', value);
      const first = (G.debt?.s?.deposits ?? 0) <= 1;
      if (sink.length && value > 0) {
        if (first && !G.missions?.flags?.has('contract:first_deposit_said')) { G.missions?.set?.('contract:first_deposit_said'); setTimeout(() => voss(L.firstDeposit), 2600); }
        else if (Math.random() < (value >= 1000 ? 0.9 : 0.35)) setTimeout(() => voss(pick(value >= 1000 ? L.depositBig : L.deposit)), 2800);
      } else if (rejected) setTimeout(() => voss(pick(L.reject)), 1000);
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
    const solid = worldMaterial({});
    const ram = new THREE.Mesh(geo('ram'), solid);
    ram.castShadow = true;
    ram.position.y = PRESS.ramUp;
    const rods = PRESS.rods.map(([x, zz]) => { const r = new THREE.Mesh(geo('rod'), solid); r.position.set(x, 0, zz); return r; });
    const lever = new THREE.Mesh(geo('lever'), solid);
    lever.position.set(...PRESS.lever);
    lever.rotation.x = PRESS.leverRest;
    const needle = new THREE.Group();
    const nm = new THREE.Mesh(geo('needle'), solid);
    nm.position.y = 0.06;
    needle.add(nm);
    needle.position.copy(DIAL);
    const glow = new THREE.Mesh(geo('glow', 0xffb040), ADD()); glow.position.set(0, 0.068, 0); glow.scale.set(1.9, 1, 1.9);
    const seam = new THREE.Mesh(geo('seam', SEAM), ADD()); seam.position.set(0, 0.07, 0); seam.scale.set(1.3, 1, 0.42); seam.visible = false;
    const ring = new THREE.Mesh(geo('ring', SEAM), ADD()); ring.position.set(0, 0.072, 0); ring.visible = false;
    const [bx, by, bz] = PRESS.beacon;
    const beacon = new THREE.Mesh(geo('beacon', 0xffa020), ADD()); beacon.position.set(bx, by, bz); beacon.visible = false;
    const lens = new THREE.Mesh(geo('lens', 0xc08030), ADD()); lens.position.set(0.86, 1.86, -0.6);
    // the counter drums in the crown
    const [cx0, cy0, cz0] = PRESS.counter;
    const nixie = crtScreen(0.55, 0.15, { tint: 0xffb070, res: [160, 40], curvature: 0.03, bulge: 0.003, scan: 0.12, mask: 0.12, glow: 1.5, noise: 0.012, flicker: 0.25, vignette: 0.2, reflect: 0.5 });
    nixie.mesh.position.set(cx0, cy0, cz0 + 0.003);
    const tubes = new THREE.Mesh(geo('drum'), worldMaterial({ transparent: true, opacity: 0.35, depthWrite: false, outline: 0 }));
    tubes.position.set(cx0, cy0, cz0); tubes.renderOrder = 7;
    drawNixie(nixie, -1);
    for (const m of [glow, seam, ring, beacon, lens]) { m.renderOrder = 6; (m as any).castShadow = false; }
    group.add(ram, ...rods, lever, needle, glow, seam, ring, beacon, lens, nixie.mesh, tubes);
    this.root.add(group);
    f = { o, zone: z.key, group, ram, rods, lever, needle, glow, seam, ring, beacon, lens, load: 0, needleA: 0, loaded: false, ramY: PRESS.ramUp, sinks: [], nixie, shownN: -1, roll: 9, value: 0, big: false, checkT: 0, flash: 0 };
    this.fx.set(o.uid, f);
    return f;
  }
  private dropFx(f: Fx) {
    this.root.remove(f.group);
    for (const s of f.sinks) this.root.remove(s.mesh);
    f.nixie.tex.dispose(); f.nixie.mat.dispose(); f.nixie.mesh.geometry.dispose();
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
      else if (!near && f && !this.cycles.has(o.uid) && !f.sinks.length) this.dropFx(f);
    }
    const on = !!G.debt?.on;
    for (const f of this.fx.values()) {
      if (f.zone !== z.key || !z.objects.has(f.o.uid)) { this.dropFx(f); continue; }
      const o = f.o;
      const vis = G.view.vis.isVisible(o.x, o.y) || G.view.vis.isVisible(o.x + 1, o.y + 1);
      f.group.visible = vis;
      const cyc = this.cycles.get(o.uid);
      const t = cyc ? cyc.t : -1;
      // what is on the plate (cheap check a few times a second)
      f.checkT -= dt;
      if (f.checkT <= 0) {
        f.checkT = 0.25;
        const c = this.contents(z, o);
        let est = 0;
        for (const wi of c.items) { est += itemValue(wi.item); if (wi.y < 0.06 && wi.vy === undefined) wi.y = 0.066; }
        for (const q of c.objs) est += objKeyValue(q.key, q.state);
        const any = c.items.length + c.objs.length > 0;
        if (any && !f.loaded && !cyc && on) G.audio?.play?.('hopper_weigh', o.x + 1, o.y + 1, { vol: 0.6, range: 14 });
        f.loaded = any;
        f.load = any ? Math.min(1, Math.log10(1 + est) / 4.2) : 0;
      }
      // ram, rods, lever
      f.ramY = cyc ? ramAt(t) : PRESS.ramUp;
      f.ram.position.y = f.ramY;
      const top = f.ramY + PRESS.ramH + 0.06;
      for (const r of f.rods) { r.position.y = top; r.scale.y = Math.max(0.01, PRESS.crownY - top); }
      f.lever.rotation.x = leverAt(t);
      // gauge: the load while it waits, a pressure spike on the slam
      const spike = cyc && t > CYCLE.drop && t < CYCLE.rise ? 1.0 : 0;
      const target = Math.max(spike, f.loaded && on ? f.load * 0.7 : 0) + Math.sin(G.time * 23) * 0.008 * (f.loaded ? 1 : 0);
      f.needleA += (target - f.needleA) * Math.min(1, dt * (spike ? 18 : 5));
      const a = Math.PI * 0.75 + Math.max(0, Math.min(1.02, f.needleA)) * Math.PI * 1.5;
      f.needle.rotation.z = Math.atan2(-Math.cos(a), -Math.sin(a));
      // plate light: dim idle breathing, amber while loaded, red flashing through the cycle
      let gl = on ? 0.1 + 0.04 * Math.sin(G.time * 1.3) : 0.02, gc = 0xffb040;
      if (f.loaded && on) gl = 0.55 + 0.25 * Math.sin(G.time * 5);
      if (cyc && t < CYCLE.impact) { gl = Math.sin(t * 26) > 0 ? 0.9 : 0.25; gc = 0xff3020; }
      f.glow.geometry = geo('glow', step(gc, Math.min(1, gl)));
      f.glow.visible = gl > 0.03;
      // the seam: wakes on the impact, shimmers while the load goes through, closes
      f.flash = Math.max(0, f.flash - dt * 1.6);
      const seamK = cyc && t >= CYCLE.impact ? Math.max(0, 1 - (t - CYCLE.impact) / (CYCLE.done - CYCLE.impact + 0.6)) : f.sinks.length ? 0.5 : 0;
      f.seam.visible = seamK > 0.02;
      if (f.seam.visible) {
        const fl = 0.75 + 0.25 * Math.sin(G.time * 31) * Math.sin(G.time * 7);
        f.seam.geometry = geo('seam', step(SEAM, Math.min(1, seamK * fl + f.flash * 0.5)));
        f.seam.scale.set(1.3 + Math.sin(G.time * 13) * 0.04, 1, 0.3 + seamK * 0.25);
      }
      f.ring.visible = f.flash > 0.02;
      if (f.ring.visible) { const s = 0.6 + (1 - f.flash) * 2.6; f.ring.scale.set(s, 1, s); f.ring.geometry = geo('ring', step(SEAM, f.flash * 0.8)); }
      // the flattened load sinks once the ram lets go: down through the slot, squeezed toward the middle
      for (let i = f.sinks.length - 1; i >= 0; i--) {
        const s = f.sinks[i];
        if (cyc && t < CYCLE.rise - 0.15) continue;
        s.t += dt;
        const k = clamp01(s.t / 1.3), pull = k * k;
        const ox = (o.x + 1 - s.x) * pull * 0.8, oz = (o.y + 1 - s.z) * pull * 0.8;
        s.mesh.position.set(s.x + ox + Math.sin(G.time * 70 + i) * 0.008 * (1 - k), s.y0 - pull * 0.9, s.z + oz);
        s.mesh.scale.set(Math.max(0.05, 1.15 - pull), 0.08 * (1 - pull * 0.5), Math.max(0.05, 1.15 - pull));
        if (k >= 1) { this.root.remove(s.mesh); f.sinks.splice(i, 1); }
      }
      // beacon spins through the cycle, the lens brightens: the handler's projector is awake
      f.beacon.visible = !!cyc && Math.sin(G.time * 14) > -0.2;
      f.lens.scale.setScalar((on ? 0.6 + 0.1 * Math.sin(G.time * 3) : 0.25) + (cyc ? 0.4 : 0));
      if (vis && G.local?.zoneKey === f.zone) {
        tv.set(...PRESS.beacon).applyMatrix4(f.group.matrix);
        if (cyc && Math.sin(G.time * 14) > 0) G.pointLight(tv.x, tv.y, tv.z, 0xff8a30, 0.8, 4.5);
        if (seamK > 0.05 || f.flash > 0.05) G.pointLight(o.x + 1, 0.35, o.y + 1, 0xd8ccb0, 0.5 + seamK * 1.1 + f.flash * 2, 5);
        else if (f.loaded && on) G.pointLight(o.x + 1, 0.4, o.y + 1, 0xffa030, 0.5 + 0.3 * Math.sin(G.time * 5), 4);
      }
      // the nixie tubes in the crown count up to what the last load was worth
      if (f.roll < 1.6) {
        f.roll += dt;
        const k = Math.min(1, f.roll / 1.4);
        const shown = Math.min(99999, Math.round(f.value * (1 - Math.pow(1 - k, 3))));
        if (shown !== f.shownN) {
          if (vis && G.local?.zoneKey === f.zone && (shown % 7 === 0 || k >= 1)) G.audio?.play?.('hopper_tally', o.x + 1, o.y + 1, { vol: 0.1, range: 10 });
          f.shownN = shown; drawNixie(f.nixie, shown);
        }
      }
    }
  }

  // ---------------------------------------------------------------- menus
  menu(p: Player, o: TileObject): MenuOption[] {
    const out: MenuOption[] = [];
    const z = G.getZone(p.zoneKey);
    const debt = G.debt;
    const at = (name: string, secs: number, anim: string, fn: () => void) => () => queueAt(p, o.x + 1, o.y + 1, new UseObjectAction(p, name, secs, anim as any, fn), 2.0);
    if (!debt?.on) { out.push({ label: 'The press is cold. Nobody is collecting.', disabled: true }); return out; }
    const est = this.estimate(z, o);
    out.push({
      label: est > 0 ? `Pull the lever (≈ ${fmt(est)} on the plate)` : 'Pull the lever',
      disabled: this.busy(o) ? 'the ram is moving' : false,
      danger: !est,
      action: () => this.pullAction(p, o),
    });
    out.push({ label: 'Read the ledger', action: at('Read the ledger', 1.2, 'read', () => G.ui?.read?.('REMITTANCE PRESS', ledgerText(), 'terminal')) });
    const carried = p.allItems().filter((it) => !p.isWorn(it) && it.key !== 'bailiff_band');
    const valued = carried.map((it) => ({ it, v: itemValue(it) })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v);
    const vals = valued.filter((x) => (itemDef(x.it.key).tags || []).includes('valuable'));
    if (vals.length) out.push({ label: `Deposit all valuables (${vals.length}) ≈ ${fmt(vals.reduce((s, x) => s + x.v, 0))}`, action: at('Deposit', 1.2, 'pickup', () => this.depositItems(p, o, vals.map((x) => x.it), true)) });
    if (valued.length) out.push({ label: 'Deposit…', sub: valued.slice(0, 14).map((x) => ({ label: `${itemName(x.it)} ≈ ${fmt(x.v)}`, action: at('Deposit', 0.8, 'pickup', () => this.depositItems(p, o, [x.it], true)) })) });
    else out.push({ label: 'Deposit…', disabled: 'nothing worth anything on you' });
    const st = G.band?.get?.(p.id);
    if (st === 'blown' || st === 'lost') out.push({ label: 'Take a replacement band', danger: true, action: at('Refit', 3, 'craft', () => G.band?.refit?.(p)) });
    return out;
  }

  /** put carried items onto the plate (they go through like anything else lying there); press = throw the lever after */
  depositItems(p: Player, o: TileObject, items: Item[], press = false) {
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
    // (standing on the plate: step off to the lever first; otherwise reach over and pull it once the load has landed)
    if (press && i) setTimeout(() => {
      if (this.busy(o)) return;
      if (onPlate(o, p.x, p.z, -0.25)) this.pullAction(p, o); else this.pull(p, o);
    }, 600);
  }

  /** item menu hook: "Deposit" while standing at a press */
  itemMenu(p: Player, it: Item, opts: MenuOption[], inWorld: boolean) {
    if (!G.debt?.on || it.key === 'bailiff_band') return;
    const o = this.near(p, 2.2);
    if (!o) return;
    const v = itemValue(it);
    if (v <= 0) { opts.unshift({ label: 'Deposit', disabled: 'the press won\'t take it' }); return; }
    opts.unshift({ label: `Deposit in press ≈ ${fmt(v)} scrip`, action: () => {
      if (inWorld) { G.ui?.toast?.('PICK IT UP FIRST', '', 2); return; }
      queueAt(p, o.x + 1, o.y + 1, new UseObjectAction(p, 'Deposit', 0.8, 'pickup', () => this.depositItems(p, o, [it], true)), 2.0);
    } });
  }

  // ---------------------------------------------------------------- per frame
  update(dt: number) {
    this.stepCycles(dt);
    this.updateFx(dt);
    const z = G.view?.zone;
    if (z) { this.glints.update(dt, z); this.sparks.update(dt, z); }
    // a loaded plate and nobody pulling: the band nags once in a while
    this.nagT -= dt;
    if (this.nagT <= 0) {
      this.nagT = 1;
      const p = G.local, o = p && G.debt?.on ? this.near(p, 2.6) : null;
      const f = o ? this.fx.get(o.uid) : null;
      if (f && f.loaded && !this.busy(o!) && !G.missions?.flags?.has('tut:lever')) {
        f.checkT = Math.min(f.checkT, 0.1);
        (f as any).waitT = ((f as any).waitT ?? 0) + 1;
        if ((f as any).waitT > 7) { G.missions?.set?.('tut:lever'); voss(L.lever); }
      }
    }
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
  L2.push('', `LOADS SENT THROUGH: ${d.s.deposits}`, 'STAND CLEAR OF THE PLATE WHEN THE HORN SOUNDS.');
  void bailiff;
  return L2.join('\n');
}
