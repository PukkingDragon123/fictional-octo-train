// Shared behaviour helpers for creature pack A (employee, swivel, davenport,
// underlay, drywall_man, ventling, hollow, custodian). Engine files are not
// touched: everything here builds on the public CreatureSystem API, world
// ops, the 'worldMenu' / 'playerHit' / 'creatureKilled' bus events and the
// replicated c.mem.net blob.
import * as THREE from 'three';
import { G } from '../game/G';
import { bus } from '../core/events';
import { defOp, op } from '../game/ops';
import type { Creature, CState } from './creature';
import type { CreatureSystem } from './manager';
import type { Player } from '../entities/player';
import type { MenuOption } from '../ui/ui';
import type { FullBody } from '../entities/humanAnim';
import { Zone, TF } from '../world/zone';
import { lineOfSight } from '../world/collision';
import { objDef } from '../world/objects';
import { wallDef } from '../world/defs';
import { floorItems, removeFloorItem, WorldItem } from '../items/worldItems';
import { serializeItem } from '../items/factory';
import { itemDef, Item } from '../items/item';
import { TimedAction } from '../actions/action';
import { ModelBuilder } from '../gfx/modelBuilder';
import { worldMaterial } from '../gfx/materials';
import type { Rig } from './species';
import '../audio/sounds_creatures_a';

// ---------------------------------------------------------------- basics
export const CS = (): CreatureSystem => G.creatures as CreatureSystem;
export const isHost = () => G.role !== 'client';
export const zoneOf = (c: Creature): Zone => G.getZone(c.zoneKey);
export const dist = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);
export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const ease = (v: number) => { const t = clamp01(v); return t * t * (3 - 2 * t); };
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** replicated per-creature visual state (host writes c.mem.net, clients read c.mem.netMem) */
export function nm(c: Creature): Record<string, any> { return c.mem.net ?? c.mem.netMem ?? {}; }
export function netSet(c: Creature, k: string, v: any) {
  const n = c.mem.net || (c.mem.net = {});
  if (n[k] !== v) n[k] = v;
}

/** deterministic hash 0..1 for visuals (same on every client) */
export function h01(a: number, b = 0) { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); }
export function idHash(c: Creature) { let h = 0; for (let i = 0; i < c.id.length; i++) h = (h * 31 + c.id.charCodeAt(i)) | 0; return (h >>> 0) / 4294967296; }

/** spatial creature sound on the host, mirrored to clients */
export function sfx(c: Creature, key: string, vol = 1) {
  G.audio?.play?.(key, c.x, c.z, { zone: c.zoneKey, vol });
  if (G.role === 'host') G.net?.broadcastFx?.('csnd', { id: c.id, s: key });
}

/** light level at a point (only known for the zone the host is viewing) */
export function lightAt(zk: string, x: number, z: number) {
  return G.view && G.view.zone.key === zk ? G.lightLevelAt(x, z) : 0.5;
}

export function playersIn(c: Creature): Player[] { return CS().playersInZone(c.zoneKey); }
export function nearestPlayer(c: Creature, maxD = Infinity, pred?: (p: Player, d: number) => boolean): { p: Player; d: number } | null {
  let best: Player | null = null, bd = maxD;
  for (const p of playersIn(c)) {
    const d = dist(p.x, p.z, c.x, c.z);
    if (d < bd && (!pred || pred(p, d))) { bd = d; best = p; }
  }
  return best ? { p: best, d: bd } : null;
}
/** no other living survivor within r metres */
export function isAlone(p: Player, r = 8) {
  for (const o of G.players.values()) if (o !== p && o.zoneKey === p.zoneKey && !o.body.dead && dist(o.x, o.z, p.x, p.z) < r) return false;
  return true;
}
/** does any player have a clear line of sight to the point (within r) */
export function anyPlayerSees(zk: string, x: number, z: number, r = 18) {
  const zone = G.getZone(zk);
  for (const p of CS().playersInZone(zk)) {
    const d = dist(p.x, p.z, x, z);
    if (d < r && lineOfSight(zone, p.x, p.z, x, z)) return true;
  }
  return false;
}
/** player is pointing a lit flashlight at the point */
export function torchOn(p: Player, x: number, z: number, maxD = 9, cone = 0.45) {
  if (!p.flashlightOn) return false;
  const d = dist(p.x, p.z, x, z); if (d > maxD) return false;
  let a = Math.atan2(z - p.z, x - p.x) - p.facing; a = Math.atan2(Math.sin(a), Math.cos(a));
  return Math.abs(a) < cone;
}
/** creature c is facing towards (x,z) within cone */
export function facingTo(c: Creature, x: number, z: number, cone = 0.9) {
  let a = Math.atan2(z - c.z, x - c.x) - c.facing; a = Math.atan2(Math.sin(a), Math.cos(a));
  return Math.abs(a) < cone;
}
export function faceTo(c: Creature, x: number, z: number, instant = false) {
  c.targetFacing = Math.atan2(z - c.z, x - c.x);
  if (instant) c.facing = c.targetFacing;
}
export function stop(c: Creature) { c.speed = 0; c.vx = 0; c.vz = 0; }

// ---------------------------------------------------------------- tiles
export function walkable(z: Zone, x: number, y: number) {
  if (!z.inb(x, y)) return false;
  const i = z.idx(x, y);
  return !!z.floor[i] && z.solid[i] !== 1 && z.solid[i] !== 3 && z.floorAt(x, y)?.water !== 'deep';
}
export function isCarpet(z: Zone, x: number, y: number) { return (z.floorAt(Math.floor(x), Math.floor(y))?.sound ?? '').includes('carpet'); }

/** random tile around a point matching a predicate (returns tile centre) */
export function findSpot(c: Creature, opts: { x?: number; z?: number; rMin?: number; rMax?: number; tries?: number; dark?: number; unseen?: boolean; pred?: (x: number, y: number) => boolean }): { x: number; z: number } | null {
  const z = zoneOf(c), rng = CS().rng;
  const cx = opts.x ?? c.x, cz = opts.z ?? c.z;
  const r0 = opts.rMin ?? 4, r1 = opts.rMax ?? 14;
  for (let t = 0; t < (opts.tries ?? 24); t++) {
    const a = rng.float(0, Math.PI * 2), r = rng.float(r0, r1);
    const x = Math.floor(cx + Math.cos(a) * r), y = Math.floor(cz + Math.sin(a) * r);
    if (!walkable(z, x, y)) continue;
    if (opts.pred && !opts.pred(x, y)) continue;
    if (opts.dark !== undefined && lightAt(c.zoneKey, x + 0.5, y + 0.5) > opts.dark) continue;
    if (opts.unseen && anyPlayerSees(c.zoneKey, x + 0.5, y + 0.5)) continue;
    return { x: x + 0.5, z: y + 0.5 };
  }
  return null;
}

/** objects near a point whose def matches (cheap: scans tiles in a square) */
export function objectsNear(z: Zone, x: number, y: number, r: number, pred: (o: any, d: any) => boolean, max = 20) {
  const out: any[] = [];
  const seen = new Set<number>();
  const x0 = Math.floor(x - r), x1 = Math.floor(x + r), y0 = Math.floor(y - r), y1 = Math.floor(y + r);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    if (!z.inb(tx, ty)) continue;
    for (const o of z.objectsAt(tx, ty)) {
      if (seen.has(o.uid)) continue; seen.add(o.uid);
      const d = objDef(o.key);
      if (d && pred(o, d)) { out.push(o); if (out.length >= max) return out; }
    }
  }
  return out;
}

// ---------------------------------------------------------------- vents
export interface VentSpot { uid: number; x: number; z: number; wx: number; wz: number; key: string }
const VENT_RE = /(^|_)(vent|duct|grate)(_|$)/;
/** every vent object (and TF.VENT tile) of a zone: where a creature can enter / leave the ducts */
export function ventSpots(z: Zone): VentSpot[] {
  const cache = z.meta.__ventsA as { n: number; list: VentSpot[] } | undefined;
  if (cache && cache.n === z.objects.size) return cache.list;
  const list: VentSpot[] = [];
  const DIR: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  for (const o of z.objects.values()) {
    const d = objDef(o.key);
    if (!d) continue;
    if (!(d.tags?.includes('vent') || VENT_RE.test(o.key))) continue;
    if (o.key.includes('manhole')) continue;
    const [dx, dz] = d.onWall ? DIR[o.rot] : [0, 0];
    list.push({ uid: o.uid, x: o.x + 0.5, z: o.y + 0.5, wx: o.x + 0.5 + dx * 0.42, wz: o.y + 0.5 + dz * 0.42, key: o.key });
  }
  for (let i = 0; i < z.flags.length; i++) if (z.flags[i] & TF.VENT) {
    const x = i % z.W, y = (i / z.W) | 0;
    if (list.some((v) => Math.floor(v.x) === x && Math.floor(v.z) === y)) continue;
    list.push({ uid: -1 - i, x: x + 0.5, z: y + 0.5, wx: x + 0.5, wz: y + 0.5, key: 'tile' });
  }
  z.meta.__ventsA = { n: z.objects.size, list };
  return list;
}

// ---------------------------------------------------------------- walls
export interface WallSpot { x: number; z: number; nx: number; nz: number; tx: number; ty: number }
/** opaque wall faces near a point (no doors/windows), each with its outward normal */
export function wallSpotsNear(z: Zone, px: number, pz: number, r: number): WallSpot[] {
  const out: WallSpot[] = [];
  const x0 = Math.floor(px - r), x1 = Math.floor(px + r), y0 = Math.floor(pz - r), y1 = Math.floor(pz + r);
  const solidWall = (id: number) => !!id && !wallDef(id).seeThrough;
  for (let ty = y0; ty <= y1 + 1; ty++) for (let tx = x0; tx <= x1 + 1; tx++) {
    if (!z.inb(tx, ty)) continue;
    const i = z.idx(tx, ty);
    if (solidWall(z.wallN[i]) && !z.edges.get(i * 2)) {
      if (walkable(z, tx, ty)) out.push({ x: tx + 0.5, z: ty, nx: 0, nz: 1, tx, ty });
      if (walkable(z, tx, ty - 1)) out.push({ x: tx + 0.5, z: ty, nx: 0, nz: -1, tx, ty: ty - 1 });
    }
    if (solidWall(z.wallW[i]) && !z.edges.get(i * 2 + 1)) {
      if (walkable(z, tx, ty)) out.push({ x: tx, z: ty + 0.5, nx: 1, nz: 0, tx, ty });
      if (walkable(z, tx - 1, ty)) out.push({ x: tx, z: ty + 0.5, nx: -1, nz: 0, tx: tx - 1, ty });
    }
  }
  return out;
}

// ---------------------------------------------------------------- per-instance flags
/** override species flags for one creature (e.g. immortal while submerged) — host only */
export function instFlags(c: Creature, patch: Record<string, any>) {
  let sp: any = c.sp;
  if (!Object.prototype.hasOwnProperty.call(sp, '__inst')) {
    const base = sp; sp = Object.create(base);
    sp.__inst = true; sp.flags = { ...(base.flags || {}) };
    c.sp = sp;
  }
  for (const k in patch) if (sp.flags[k] !== patch[k]) sp.flags[k] = patch[k];
}

// ---------------------------------------------------------------- think bookkeeping
/**
 * Call at the top of think(): detects hp loss and staggers (think() is not
 * called while a creature staggers or attacks, so a gap means it was hit).
 */
export function pulse(c: Creature): { hurt: number; staggered: boolean; dtGap: number } {
  const now = G.time;
  const last = c.mem._lt ?? now;
  const gap = now - last;
  c.mem._lt = now;
  const hp0 = c.mem._hp ?? c.hp;
  c.mem._hp = c.hp;
  const hurt = Math.max(0, hp0 - c.hp);
  const staggered = gap > 0.3 && gap < 2.5 && now - (c.mem._atkAt ?? -99) > gap + 0.1;
  if (c.mem._sayUntil && now > c.mem._sayUntil) { netSet(c, 'say', null); c.mem._sayUntil = 0; }
  return { hurt, staggered: staggered || hurt > 0, dtGap: gap };
}
/** start an attack through the manager (keeps track for stagger detection) */
export function attack(c: Creature, p: Player) {
  c.mem._atkAt = G.time;
  CS().startAttack(c, p);
}
export function setState(c: Creature, s: CState) { c.setState(s); }

// ---------------------------------------------------------------- speech bubbles
export function speak(c: Creature, text: string, secs = 4.5) {
  const n = (c.mem._sayN = (c.mem._sayN || 0) + 1);
  netSet(c, 'say', [n, text]);
  c.mem._sayUntil = G.time + secs;
}
/** animate(): show the replicated line once on this machine */
export function showSpeech(c: Creature, headY: number) {
  const s = nm(c).say;
  if (!s || s[0] === c.mem._sayShown) return;
  c.mem._sayShown = s[0];
  const l = G.local;
  if (!l || l.zoneKey !== c.zoneKey || dist(l.x, l.z, c.x, c.z) > 16 || !c.visibleToLocal) return;
  const tgt = { get x() { return c.x; }, get y() { return c.y + headY; }, get z() { return c.z; } };
  G.ui?.say?.(tgt as any, s[1], 'say', 3.2);
}

// ---------------------------------------------------------------- poke (sit / search / touch) requests
const MENUS = new Map<string, (p: Player, c: Creature, opts: MenuOption[]) => void>();
export function creatureMenu(key: string, fn: (p: Player, c: Creature, opts: MenuOption[]) => void) { MENUS.set(key, fn); }
bus.on('worldMenu', (p: Player, t: any, opts: MenuOption[]) => {
  if (t?.kind !== 'creature' || !t.c || t.c.dead) return;
  MENUS.get(t.c.sp.key)?.(p, t.c, opts);
});
/** tell the host a player touched this creature (rides the noise channel, which clients forward) */
export function poke(p: Player, c: Creature, kind = 'poke') {
  bus.emit('noise', { x: c.x, z: c.z, radius: 0.6, kind: `${kind}:${c.id}`, zone: c.zoneKey, by: p.id });
}
/** host: id of the player who poked this creature recently */
export function poked(c: Creature, kind = 'poke'): string | null {
  const k = `${kind}:${c.id}`;
  for (const n of CS().noises) if (n.kind === k) return n.by ?? '?';
  return null;
}
/** loudest recent noise margin (radius minus distance) heard by c */
export function heardMargin(c: Creature, within = 1) {
  return c.lastHeard && G.time - c.lastHeard.t < within ? c.lastHeard.r : 0;
}

// ---------------------------------------------------------------- player-side hit hooks
export class HeldAction extends TimedAction {
  constructor(p: Player, secs: number, full: FullBody, name: string, private slow = 0.8) {
    super(p); this.name = name; this.duration = secs; this.fixedTime = true; this.full = full; this.anim = full ? '' : 'flinch';
    this.locks = true; this.showBar = false;
  }
  update() { this.p.vx *= this.slow; this.p.vz *= this.slow; }
  perform() {}
}
const HIT_HOOKS = new Map<string, (p: Player, h: any) => void>();
/** react on the victim's machine when a creature of this species hits a local player */
export function onPlayerHit(key: string, fn: (p: Player, h: any) => void) { HIT_HOOKS.set(key, fn); }
bus.on('playerHit', (p: Player, _part: string, _kind: string, h: any) => {
  if (!p?.isLocal || !h?.by) return;
  try { HIT_HOOKS.get(h.by)?.(p, h); } catch (e) { console.error(e); }
});
const KILL_HOOKS = new Map<string, (c: Creature) => void>();
export function onKilled(key: string, fn: (c: Creature) => void) { KILL_HOOKS.set(key, fn); }
bus.on('creatureKilled', (c: Creature) => {
  if (!c?.sp || !isHost()) return;
  try { KILL_HOOKS.get(c.sp.key)?.(c); } catch (e) { console.error(e); }
});

// ---------------------------------------------------------------- items (thieves & tidiers)
defOp('a_takeFloor', (a: { z: string; uid: number }) => {
  const z = G.zones.get(a.z); if (!z) return;
  const wi = floorItems(z).get(a.uid); if (!wi) return;
  removeFloorItem(z, wi.item);
  bus.emit('floorChanged', z);
});
defOp('a_takeObj', (a: { z: string; obj: number; uid: number }) => {
  const z = G.zones.get(a.z); if (!z) return;
  const o = z.objects.get(a.obj); const inv = o?.inv; if (!inv) return;
  const it = inv.items.find((i) => i.uid === a.uid); if (!it) return;
  inv.remove(it);
  bus.emit('containerChanged', inv);
});
const KEEP_RE = /(key|card|note|journal|diary|letter|lore|root_|fuse_special|exit_code|data_drive|specimen)/;
/** mission/lore things nobody should silently remove */
export function isPrecious(it: Item) {
  const d = itemDef(it.key);
  return (d.cat as string) === 'mission' || KEEP_RE.test(it.key) || !!d.lore || !!it.data?.lore || !!it.data?.keyId || !!it.inv?.items.length;
}
export function floorItemsAround(z: Zone, x: number, zz: number, r: number): WorldItem[] {
  const out: WorldItem[] = [];
  for (const wi of floorItems(z).values()) if (Math.abs(wi.x - x) <= r && Math.abs(wi.z - zz) <= r && (wi.y ?? 0) < 1.3) out.push(wi);
  return out;
}
/** host: lift an item off the floor into the creature's memory */
export function takeFloorItem(c: Creature, wi: WorldItem, store: string) {
  const s = serializeItem(wi.item);
  op('a_takeFloor', { z: c.zoneKey, uid: wi.item.uid });
  (c.mem[store] = c.mem[store] || []).push(s);
  return s;
}
export function takeObjItem(c: Creature, o: any, it: Item, store: string) {
  const s = serializeItem(it);
  op('a_takeObj', { z: c.zoneKey, obj: o.uid, uid: it.uid });
  (c.mem[store] = c.mem[store] || []).push(s);
  return s;
}
/** host: drop remembered items on the floor around (x,z) */
export function dropStored(c: Creature, store: string, x = c.x, z = c.z) {
  const list: any[] = c.mem[store] || [];
  for (const s of list) op('dropFloor', { z: c.zoneKey, item: s, x: x + (Math.random() - 0.5) * 0.5, zz: z + (Math.random() - 0.5) * 0.5 });
  c.mem[store] = [];
}

// ---------------------------------------------------------------- rendering helpers
/** a rig part with its own material (translucent hollows, item meshes...) */
export function partMat(rig: Rig, name: string, parent: THREE.Object3D, at: [number, number, number], mat: THREE.Material, fn: (mb: ModelBuilder) => void): THREE.Group {
  const g = new THREE.Group();
  g.name = name; g.position.set(at[0], at[1], at[2]);
  const mb = new ModelBuilder(); fn(mb);
  if (!mb.isEmpty) { const m = new THREE.Mesh(mb.build(), mat); m.castShadow = true; m.receiveShadow = true; g.add(m); }
  parent.add(g); rig.parts[name] = g;
  return g;
}
export const ghostMat = () => worldMaterial({ transparent: true, opacity: 0.78, depthWrite: true });

/** gallery preview state (?pose=...) */
export function galleryPose(def = ''): string {
  try { return new URLSearchParams(location.search).get('pose') || def; } catch { return def; }
}

/** hide a creature completely on this machine (inside walls / vents) */
export function hideRig(c: Creature, rig: Rig) {
  rig.root.visible = false;
  if (rig.eyes) for (const e of rig.eyes) e.visible = false;
  c.visibleToLocal = false;
}
/** furniture mimics: keep the "first sighting" sting for the reveal, not for the sofa */
export function suppressSighting(c: Creature, disguised: boolean) {
  if (disguised) { c.wasSeenByLocal = true; c.mem._wasHidden = true; }
  else if (c.mem._wasHidden) { c.mem._wasHidden = false; c.wasSeenByLocal = false; }
}
