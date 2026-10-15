// DestructionSystem (G.destruct): furniture that takes damage and breaks,
// walls you can smash through, windows and glass walls that shatter, ceiling
// lights that pop, bullet holes, and furniture you can grab and push or drag.
//
// Everything that changes the world is an op, applied the same way on every
// peer and kept in the op log (saves, late joiners):
//   objDmg      hit points down, visible damage level up (dents, cracks)
//   objBreak    the object is gone: contents spill, a debris pile is left,
//               bus 'objBroken' (z, o, by, how, pile) fires on every peer
//   wallSmash   cracks, bullet holes, and at zero a ragged hole (an arch edge)
//   lightSmash  a fixture shot or smashed dark
//   objHold / objRelease   furniture grabbed for pushing / dragging, and
//               where it ended up (bus 'objPushed' (z, o, by))
// The show (particles, debris tumbling out of the model, sounds, sparks) is
// local, driven from the op handlers, and the debris sim is deterministic
// (src/world/debris.ts) so everyone sees the same heap.
import * as THREE from 'three';
import { G } from '../game/G';
import type { GameSystem } from '../game/game';
import { defOp, op, isReplaying } from '../game/ops';
import { bus } from '../core/events';
import { Rng, hash3, hashStr, uid, setUidBase } from '../core/rng';
import { Zone, TileObject, ObjState, Decal, EdgeObj } from './zone';
import { defObj, objDef, objectGeometry, setDamageGeometryHook, ObjDef } from './objects';
import { objectMatrix } from './chunkMesher';
import { wallDef, WallDef, WALL_H } from './defs';
import { ModelBuilder } from '../gfx/modelBuilder';
import { MAT, worldMaterial } from '../gfx/materials';
import { Container } from '../items/container';
import { fillLoot, serializeItem } from '../items/factory';
import { dropItem } from '../items/worldItems';
import { itemDef, Item } from '../items/item';
import { defLoot } from '../items/loot';
import type { Player } from '../entities/player';
import { Particles, PK } from '../gore/particles';
import { addStat } from '../game/profile';
import { Mat, objMat, objMaxHp, objColor, fracture, simulate, damageGeometry, crackOverlay, bitGeos, Piece, SimStart, SimResult } from './debris';
import { buildHolesMesh, HOLE_STYLE } from './wallHoles';
import { PushDrag } from './pushDrag';
import './destructTextures';
import './destructSounds';
import './destructActions';

// ================================================================ rules
/** things that never break or move (mission hardware, portals, the remittance kit) */
const FIXED_TAGS = ['mission', 'node', 'portal', 'keypad', 'keycard', 'hopper', 'kiosk', 'transport', 'transport_model', 'seam', 'fixed', 'indestructible', 'nobreak', 'pylon', 'fusebox', 'breaker'];
const FIXED_KEYS = new Set(['seam_door', 'hopper', 'ticket_kiosk', 'transport_bay', 'keycard_reader']);
export const PILE = 'debris_pile';

function fixedObj(d: ObjDef, o?: TileObject): boolean {
  if (FIXED_KEYS.has(d.key) || d.key === PILE) return true;
  if (d.tags?.some((t) => FIXED_TAGS.includes(t))) return true;
  if (o && (o.state?.mission || o.state?.portal || o.state?.code || o.state?.node || o.state?.hopper)) return true;
  if ((d.hp ?? 0) > 5000) return true;
  return false;
}
export function breakable(d: ObjDef | undefined, o?: TileObject): boolean {
  if (!d || d.ceiling || fixedObj(d, o)) return false;
  if (d.height < 0.18 && !d.onWall) return false;
  return true;
}
export function pushable(d: ObjDef | undefined, o?: TileObject): boolean {
  if (!d || d.ceiling || d.onWall || d.dynamic || d.foliage || fixedObj(d, o)) return false;
  if (d.height < 0.25 || (d.block ?? 'solid') === 'none' && d.height < 0.5) return false;
  if (o?.state?.held) return false;
  return true;
}
/** damage level 0..3 from remaining hit points */
export function dmgLevel(hp: number, max: number): number {
  const r = hp / Math.max(1, max);
  return r > 0.75 ? 0 : r > 0.45 ? 1 : r > 0.2 ? 2 : 3;
}

/** what a weapon kind does to a material */
const MULT: Record<string, Partial<Record<Mat, number>>> = {
  blunt: { wood: 1, fabric: 0.7, metal: 0.8, plastic: 1.2, glass: 2, ceramic: 1.6, elec: 1.15, paper: 0.8, flesh: 1 },
  axe: { wood: 1.45, fabric: 1, metal: 0.5, plastic: 1.1, glass: 1.6, ceramic: 1.2, elec: 1, paper: 1.2, flesh: 1.2 },
  blade: { wood: 0.35, fabric: 0.9, metal: 0.08, plastic: 0.5, glass: 0.8, ceramic: 0.4, elec: 0.4, paper: 1, flesh: 0.9 },
  spear: { wood: 0.4, fabric: 0.6, metal: 0.1, plastic: 0.5, glass: 1, ceramic: 0.5, elec: 0.5, paper: 0.6, flesh: 0.7 },
  unarmed: { wood: 0.7, fabric: 0.55, metal: 0.35, plastic: 0.9, glass: 1.2, ceramic: 0.7, elec: 0.8, paper: 1, flesh: 0.8 },
  kick: { wood: 0.85, fabric: 0.6, metal: 0.45, plastic: 1, glass: 1.3, ceramic: 0.9, elec: 0.9, paper: 1, flesh: 0.9 },
  firearm: { wood: 0.7, fabric: 0.6, metal: 0.45, plastic: 0.8, glass: 2.5, ceramic: 1, elec: 1, paper: 0.8, flesh: 0.8 },
  thrown: { wood: 0.6, fabric: 0.4, metal: 0.4, plastic: 0.8, glass: 2, ceramic: 1.2, elec: 1, paper: 0.6, flesh: 0.6 },
};
export function matMult(kind: string, m: Mat): number { return (MULT[kind] ?? MULT.blunt)[m] ?? 1; }

/** breakable walls and how much they take (concrete, brick, lab panels only chip) */
function wallHpOf(w: WallDef): number {
  if (w.glass) return 20;
  if (w.key === 'cubicle') return 45;
  if (w.sound === 'drywall') return 95;
  if (w.sound === 'wood' && !w.low && w.key !== 'hedge') return 170;
  return Infinity;
}
const wallHp = new WeakMap<Zone, Map<number, number>>();

/** throw strength per way of breaking */
const POWER: Record<string, number> = { smash: 2.6, melee: 2.2, kick: 2.1, bullet: 1.3, thrown: 1.6, crush: 1.2, blast: 6, creature: 2.4, vehicle: 4 };

// salvage left in a debris pile (searchable)
defLoot('debris_wood', [1, 3], [['plank', 4], ['firewood', 3], ['nails', 3], ['screws', 1]], 0.25);
defLoot('debris_metal', [1, 3], [['scrap_metal', 5], ['screws', 3], ['spring', 2], ['pipe', 1]], 0.2);
defLoot('debris_fabric', [1, 3], [['rag', 5], ['cloth', 2], ['spring', 3], ['plank', 1]], 0.2);
defLoot('debris_plastic', [1, 2], [['scrap_metal', 1], ['screws', 2], ['wire', 1]], 0.45);
defLoot('debris_glass', [1, 2], [['glass_shard', 6], ['scrap_metal', 1]], 0.3);
defLoot('debris_ceramic', [0, 2], [['stone', 3], ['glass_shard', 1]], 0.5);
defLoot('debris_elec', [1, 3], [['electronics_scrap', 5], ['wire', 4], ['glass_shard', 2], ['fuse', 1], ['battery', 1]], 0.1);
defLoot('debris_paper', [0, 2], [['firewood', 1], ['rag', 1]], 0.55);
defLoot('debris_flesh', [0, 1], [['rag', 1]], 0.8);

// ================================================================ ops
interface DmgArgs { z: string; uid: number; d: number; how: string; by: string | null; hx: number; hy: number; hz: number; dx: number; dz: number }
interface BreakArgs { z: string; uid: number; by: string | null; how: string; seed: number; dx: number; dz: number; pu: number }
interface HoldArgs { z: string; uid: number; by: string }
interface ReleaseArgs { z: string; uid: number; by: string; x: number; y: number; ox: number; oz: number }
interface WallArgs { z: string; x: number; y: number; side: 0 | 1; d: number; how: string; by: string | null; u: number; h: number; n: 1 | -1 }

const r2 = (v: number) => Math.round(v * 100) / 100;

defOp('objDmg', (a: DmgArgs, ctx) => {
  const z = G.zones.get(a.z); if (!z) return;
  const o = z.objects.get(a.uid); if (!o || o.state?.held) return;
  const d = objDef(o.key); if (!d || !breakable(d, o)) return;
  const max = objMaxHp(d);
  const hp = (o.hp ?? max) - a.d;
  o.hp = Math.round(hp * 10) / 10;
  const lvl = dmgLevel(hp, max);
  if (lvl > (o.state.dmg | 0)) {
    o.state.dmg = lvl;
    for (const [x, y] of z.footprint(o, d)) z.markDirty(x, y);
    G.destruct?.markOverlay?.(z);
  }
  if (!isReplaying()) G.destruct?.onHit?.(z, o, d, a, lvl);
  // the host turns a hit that finished it into a break (the striker may have seen stale hit points)
  if (hp <= 0 && ctx.host && !isReplaying()) op('objBreak', { z: a.z, uid: a.uid, by: a.by, how: a.how, seed: hash3(a.uid, Math.round(G.time * 7), 99), dx: a.dx, dz: a.dz, pu: uid() } as BreakArgs);
});

defOp('objBreak', (a: BreakArgs, ctx) => {
  const z = G.zones.get(a.z); if (!z) return;
  const o = z.objects.get(a.uid); if (!o) return;
  const d = objDef(o.key); if (!d) return;
  // contents: the host makes sure the loot exists; clients get it (lootFill) before this op arrives
  if (o.inv && !o.inv.lootDone && o.inv.loot && ctx.host) {
    fillLoot(o.inv, z.seed, G.sandbox.loot * (z.roomAt(o.x, o.y).lootMul ?? 1));
    if (G.role === 'host' && !isReplaying()) G.net?.broadcastOp('lootFill', { z: a.z, ref: 'obj:' + o.uid, items: o.inv.items.map(serializeItem) });
  }
  if (o.state?.held) { G.destruct?.dropHold?.(z, o); }
  const m = objectMatrix(z, o, d).clone();
  const snap: TileObject = { ...o, state: { ...o.state } };
  const items = o.inv ? [...o.inv.items] : [];
  z.removeObject(o);
  // the pile, on the tile under the object's centre
  const cx = m.elements[12], cy = m.elements[13], cz = m.elements[14];
  const tx = Math.floor(cx), ty = Math.floor(cz);
  const mat = objMat(d);
  let pile: TileObject | null = null;
  if (z.inb(tx, ty) && z.floor[z.idx(tx, ty)]) {
    setUidBase(a.pu + 1);
    const ps: ObjState = { of: o.key, seed: a.seed, mat, how: a.how, ix: r2(a.dx), iz: r2(a.dz), src: { uid: o.uid, x: o.x, y: o.y, rot: o.rot, ox: o.ox ?? 0, oz: o.oz ?? 0, sy: o.state?.y, yaw: o.state?.yaw }, os: pickState(o.state), t: Math.round(G.clock.hours * 10) / 10 };
    pile = { uid: a.pu, key: PILE, x: tx, y: ty, rot: 0, state: ps };
    const c = new Container(a.pu, 'Debris', 'pile', 25);
    c.loot = 'debris_' + mat;
    c.owner = 'obj:' + a.pu;
    pile.inv = c;
    z.addObject(pile);
  }
  // contents spill out with the debris (seeded toss: the same on every peer)
  const rng = new Rng(a.seed ^ 0x5bd1e995);
  for (const it of items) {
    o.inv!.remove(it);
    const wi = dropItem(z, it, cx + rng.float(-0.25, 0.25), cz + rng.float(-0.25, 0.25), cy + 0.5, 0.2);
    const ang = Math.atan2(a.dz, a.dx) + rng.float(-1.2, 1.2), sp = rng.float(0.6, 2.2);
    wi.vx = Math.cos(ang) * sp; wi.vz = Math.sin(ang) * sp; wi.vy = rng.float(1.2, 2.8);
  }
  // dust, splinters, stuffing, glass left on the floor
  const dec = (tex: string, w: number, ox = 0, oz = 0) => {
    const x = cx + ox, zz = cz + oz;
    if (!z.inb(Math.floor(x), Math.floor(zz)) || !z.floor[z.idx(Math.floor(x), Math.floor(zz))]) return;
    z.decals.push({ x: r2(x), z: r2(zz), w, d: w * rng.float(0.8, 1), rot: r2(rng.float(0, 6.28)), tex, y: 0.011 } as Decal);
    z.markDirty(Math.floor(x), Math.floor(zz));
  };
  const big = Math.min(2.2, Math.max(0.9, Math.sqrt((d.w ?? 1) * (d.d ?? 1)) * 1.2));
  dec('dbr_dust', big * 1.2);
  const extra = mat === 'wood' || mat === 'paper' ? 'dbr_splinters' : mat === 'fabric' ? 'dbr_stuffing_floor' : mat === 'glass' ? 'decal_glass' : mat === 'ceramic' || mat === 'flesh' ? 'dbr_plaster' : mat === 'elec' ? 'dbr_scorch' : 'dbr_dust';
  dec(extra, big * 0.9, a.dx * 0.4, a.dz * 0.4);
  if (mat === 'elec' && (d.tags?.includes('tv') || d.light?.kind === 'screen')) dec('decal_glass', 0.8, a.dx * 0.5, a.dz * 0.5);
  if (z.decals.length > 4000) z.decals.splice(0, z.decals.length - 4000);
  bus.emit('floorChanged', z);
  bus.emit('objRemoved', z, o);
  bus.emit('objBroken', z, snap, a.by, a.how, pile);
  G.destruct?.onBroken?.(z, snap, d, m, a, pile);
  if (a.by && a.by === G.local?.id && !isReplaying()) {
    try { addStat('furniture_smashed', 1); } catch { /* profile storage unavailable */ }
    G.missions?.set?.('tut:smash');
  }
});

/** state worth keeping for the debris model (appearance variants), nothing bulky */
function pickState(s: ObjState): ObjState {
  const out: ObjState = {};
  for (const k of ['on', 'open', 'variant', 'color', 'style', 'v', 'kind', 'lit', 'broken'] as const) if (s?.[k] !== undefined) out[k] = s[k];
  return out;
}

/** take an object off its tiles while somebody holds it (kept in z.objects, its lights kept) */
export function applyHold(z: Zone, o: TileObject, by: string) {
  if (o.state.held === by) return;
  if (o.state.held) return;
  const ls = z.lights.filter((l) => l.objUid === o.uid);
  z.removeObject(o);
  z.objects.set(o.uid, o);
  if (ls.length) { z.lights.push(...ls); z.removedLights = z.removedLights.filter((l) => !ls.includes(l)); }
  o.state.held = by;
  o.state.heldBy = by; // the hopper waits for it to be let go
  bus.emit('objHeld', z, o, by);
}
defOp('objHold', (a: HoldArgs) => {
  const z = G.zones.get(a.z); if (!z) return;
  const o = z.objects.get(a.uid); if (!o) return;
  if (o.state.held && o.state.held !== a.by) return;
  applyHold(z, o, a.by);
});
defOp('objRelease', (a: ReleaseArgs) => {
  const z = G.zones.get(a.z); if (!z) return;
  const o = z.objects.get(a.uid); if (!o) return;
  const d = objDef(o.key); if (!d) return;
  if (o.state.held && o.state.held !== a.by) return;
  delete o.state.held; delete o.state.heldBy;
  o.state.pushed = 1;
  // remove from its old tiles first (a release without a hold, e.g. replay order) then place
  if (z.tileObjs.get(z.idx(o.x, o.y))?.includes(o)) z.removeObject(o);
  o.x = a.x; o.y = a.y; o.ox = a.ox || undefined; o.oz = a.oz || undefined;
  if (!o.ox) delete o.ox; if (!o.oz) delete o.oz;
  const ls = z.lights.filter((l) => l.objUid === o.uid);
  z.addObject(o);
  const w = d.w ?? 1, dd = d.d ?? 1;
  const rw = o.rot % 2 === 0 ? w : dd, rd = o.rot % 2 === 0 ? dd : w;
  for (const l of ls) { l.x = o.x + rw / 2 + (o.ox ?? 0); l.z = o.y + rd / 2 + (o.oz ?? 0); l.fp = null; }
  z.lightDirtyTiles.push([o.x, o.y]);
  G.destruct?.onReleased?.(z, o);
  bus.emit('objPushed', z, o, a.by);
});

defOp('wallSmash', (a: WallArgs, ctx) => {
  const z = G.zones.get(a.z); if (!z || !z.inb(a.x, a.y)) return;
  const i = z.idx(a.x, a.y);
  const wid = a.side === 0 ? z.wallN[i] : z.wallW[i];
  if (!wid || z.edges.has(i * 2 + a.side)) return;
  const w = wallDef(wid);
  const max = wallHpOf(w);
  const key = i * 2 + a.side;
  let hm = wallHp.get(z); if (!hm) wallHp.set(z, hm = new Map());
  const hp = (hm.get(key) ?? max) - (a.how === 'bullet' && !w.glass ? 0 : a.d);
  if (Number.isFinite(max)) hm.set(key, hp);
  const rng = new Rng(hash3(a.x * 31 + a.side, a.y * 17, Math.round(a.u * 100) + Math.round(a.h * 100) * 101));
  const facePos = (n: 1 | -1, off = 0.008) => {
    // the wall face on side n (n = 1 faces into tile x,y)
    const T = (w.thick ?? 0.12) / 2 + off;
    if (a.side === 0) return { x: a.x + a.u, z: a.y + n * T, rot: n > 0 ? Math.PI / 2 : -Math.PI / 2 };
    return { x: a.x + n * T, z: a.y + a.u, rot: n > 0 ? 0 : Math.PI };
  };
  const wallDecal = (tex: string, size: number, n: 1 | -1) => {
    const f = facePos(n);
    // decals belong to the tile they face (the chunk mesher looks the wall up from there)
    z.decals.push({ x: r2(f.x), z: r2(f.z), y: r2(Math.max(size / 2 + 0.02, Math.min((w.height ?? WALL_H) - size / 2 - 0.02, a.h))), w: size, d: size, rot: r2(f.rot), tex, vert: 1 } as Decal);
    z.markDirty(Math.floor(f.x), Math.floor(f.z));
  };
  const broken = hp <= 0 && Number.isFinite(max);
  if (!broken) {
    if (a.how === 'bullet') wallDecal('dmg_bullet', 0.1, a.n);
    else if (Number.isFinite(max) && !w.glass) wallDecal(rng.chance(0.4) || a.d > 18 ? 'dmg_wall_dent' : 'dmg_wall_crack', Math.min(0.75, 0.3 + a.d * 0.015), a.n);
    else if (!w.glass) wallDecal('dmg_bullet', 0.16, a.n);
    if (z.decals.length > 4000) z.decals.splice(0, z.decals.length - 4000);
    if (!isReplaying()) G.destruct?.onWallHit?.(z, a, w, false);
    return;
  }
  hm.delete(key);
  if (w.glass) {
    if (a.side === 0) z.setWallN(a.x, a.y, 0); else z.setWallW(a.x, a.y, 0);
    for (const n of [1, -1] as const) {
      const f = facePos(n, 0.35);
      z.decals.push({ x: r2(f.x), z: r2(f.z), w: 0.9, d: 0.8, rot: r2(rng.float(0, 6.28)), tex: 'decal_glass', y: 0.011 } as Decal);
      z.markDirty(Math.floor(f.x), Math.floor(f.z));
    }
  } else {
    z.setEdge(a.x, a.y, a.side, { kind: 'arch', style: HOLE_STYLE, open: true, locked: false, hp: 0, maxHp: 0, barricade: 0 } as EdgeObj);
    for (const n of [1, -1] as const) {
      const f = facePos(n, 0.4);
      if (!z.inb(Math.floor(f.x), Math.floor(f.z)) || !z.floor[z.idx(Math.floor(f.x), Math.floor(f.z))]) continue;
      z.decals.push({ x: r2(f.x), z: r2(f.z), w: 1.1, d: 0.8, rot: r2(rng.float(0, 6.28)), tex: 'dbr_plaster', y: 0.011 } as Decal);
      z.markDirty(Math.floor(f.x), Math.floor(f.z));
    }
  }
  void ctx;
  bus.emit('wallBroken', z, a.x, a.y, a.side, a.by);
  if (!isReplaying()) G.destruct?.onWallHit?.(z, a, w, true);
  G.destruct?.markHoles?.(z);
});

defOp('lightSmash', (a: { z: string; id: number; by: string | null }) => {
  const z = G.zones.get(a.z); if (!z) return;
  const l = z.lights.find((q) => q.id === a.id); if (!l || l.broken) return;
  l.broken = true;
  z.decals.push({ x: r2(l.x), z: r2(l.z), w: 0.7, d: 0.7, rot: r2((a.id % 628) / 100), tex: 'decal_glass', y: 0.011 } as Decal);
  z.markDirty(Math.floor(l.x), Math.floor(l.z));
  bus.emit('lightSmashed', z, l, a.by);
  if (!isReplaying()) G.destruct?.onLightSmashed?.(z, l);
});

// ================================================================ the debris pile
const SETTLED = new Set<number>();
defObj({
  key: PILE, name: 'Debris', w: 1, d: 1, height: 0.25, block: 'none', sound: 'wood',
  container: { capacity: 25, kind: 'pile' },
  tags: ['debris'],
  desc: 'What is left of it. Something might be buried in there.',
  variant: (s) => 'p' + (s.seed ?? 0) + (SETTLED.has(s.seed ?? 0) ? 's' : ''),
  model: (mb, s, o) => { G.destruct?.pileModel?.(mb, s, o); },
});

// ================================================================ the system
interface PileData { pieces: Piece[]; finals: THREE.Matrix4[]; mats: Mat[]; bits: { geo: THREE.BufferGeometry; m: THREE.Matrix4 }[] }
interface LiveBreak {
  zone: string; seed: number; mesh: THREE.Mesh; geo: THREE.BufferGeometry;
  rest: Float32Array; restN: Float32Array; ranges: [number, number][];
  sim: SimResult; t: number; dur: number; li: number;
  mats: Mat[]; pileTile: [number, number] | null; settled: boolean; wait: number;
}
interface Flash { x: number; y: number; z: number; col: number; t: number; dur: number; i: number; flicker: boolean }
interface SparkSrc { zone: string; x: number; y: number; z: number; until: number; next: number }

const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpQ2 = new THREE.Quaternion(), tmpP = new THREE.Vector3(), tmpS = new THREE.Vector3(1, 1, 1);

export class DestructionSystem implements GameSystem {
  name = 'destruct';
  root = new THREE.Group();
  dust: Particles;
  sparks: Particles;
  live: LiveBreak[] = [];
  piles = new Map<number, PileData>();
  flashes: Flash[] = [];
  sparkSrcs: SparkSrc[] = [];
  private overlayDirty = true;
  private overlayZone = '';
  private overlayMeshes: THREE.Mesh[] = [];
  private holesDirty = true;
  private holesZone = '';
  private holesMesh: THREE.Mesh | null = null;
  rng = new Rng(Math.random() * 1e9);
  /** push / drag (src/world/pushDrag.ts) */
  push: any = null;

  constructor() {
    G.destruct = this;
    this.root.name = 'destruct';
    G.pr.scene.add(this.root);
    this.dust = new Particles(1100, 0.22);
    this.sparks = new Particles(260, true);
    this.root.add(this.dust.mesh, this.sparks.mesh);
    setDamageGeometryHook((g, d, lvl) => damageGeometry(g, lvl, hashStr(d.key)));
    this.push = new PushDrag();
    // windows shattering (any path that breaks the glass: swings, smash action, bullets, creatures)
    bus.on('edgeChanged', (z: Zone, x: number, y: number, side: 0 | 1, e: EdgeObj, patch: any) => {
      if (patch?.glass === 'broken' && !isReplaying()) this.windowFx(z, x, y, side);
    });
    bus.on('objRemoved', (z: Zone) => this.markOverlay(z));
    bus.on('objAdded', (z: Zone) => this.markOverlay(z));
  }

  onZoneChange() {
    this.dust.clear(); this.sparks.clear();
    for (const l of this.live) this.endLive(l, true);
    this.live.length = 0;
    this.flashes.length = 0; this.sparkSrcs.length = 0;
    this.overlayDirty = true; this.holesDirty = true;
    this.push?.zoneChanged?.();
  }

  markOverlay(z?: Zone) { if (!z || z === G.view?.zone) this.overlayDirty = true; }
  markHoles(z?: Zone) { if (!z || z === G.view?.zone) this.holesDirty = true; }

  get quality(): number {
    try { const q = (G.pr as any)?.quality ?? (G.pr as any)?.settings?.quality; if (q === 'low' || q === 0) return 0; if (q === 'high' || q === 2) return 2; } catch { /* default */ }
    return 1;
  }

  update(dt: number) {
    const z = G.view?.zone ?? null;
    this.dust.update(dt, z);
    this.sparks.update(dt, z);
    this.updateLive(dt, z);
    this.updateFlashes(dt, z);
    if (z && (this.overlayDirty || this.overlayZone !== z.key)) this.rebuildOverlay(z);
    if (z && (this.holesDirty || this.holesZone !== z.key)) this.rebuildHoles(z);
    try { this.push?.update?.(dt); } catch (e) { console.error('push', e); }
  }

  // ================================================================ public API
  /** damage a piece of furniture on behalf of a player (any machine): op, or a break when it is done for */
  damageObject(p: Player | null, o: TileObject, dmg: number, how: string, hit?: { x: number; y: number; z: number }, dir?: [number, number]) {
    const zk = p?.zoneKey ?? G.local?.zoneKey; if (!zk) return;
    const z = G.getZone(zk);
    const d = objDef(o.key);
    if (!d || !breakable(d, o) || o.state?.held || dmg <= 0) return;
    const m = objectMatrix(z, o, d);
    const cx = m.elements[12], cz = m.elements[14];
    let dx = dir ? dir[0] : cx - (p?.x ?? cx), dz = dir ? dir[1] : cz - (p?.z ?? cz);
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const hx = hit?.x ?? cx - dx * 0.3, hz = hit?.z ?? cz - dz * 0.3, hy = hit?.y ?? Math.min(d.height * 0.7, 1.2) + z.heightAt(o.x, o.y);
    const by = p?.id ?? null;
    // the host's handler turns the hit that finishes it into a break (its hit points are the ones that count)
    op('objDmg', { z: zk, uid: o.uid, d: r2(dmg), how, by, hx: r2(hx), hy: r2(hy), hz: r2(hz), dx: r2(dx), dz: r2(dz) } as DmgArgs);
  }

  /** what a weapon does to this object's material */
  weaponDamage(p: Player, o: TileObject, kind: string, base: number): number {
    const d = objDef(o.key); if (!d) return 0;
    const str = p.body.skill('strength');
    return base * matMult(kind, objMat(d)) * (1 + str * 0.05);
  }

  /** a melee swing that hit no creature: furniture, walls, windows in front (combat.ts) */
  meleeWorld(p: Player, w: any, it: Item | null): boolean {
    const z = G.getZone(p.zoneKey);
    const reach = (w.range ?? 0.85) + 0.35;
    const fx = Math.cos(p.facing), fz = Math.sin(p.facing);
    // furniture in the arc
    const o = this.objectInFront(p, reach, 0.9);
    if (o) {
      const base = (w.dmg ? (w.dmg[0] + Math.random() * (w.dmg[1] - w.dmg[0])) : 3);
      const dmg = this.weaponDamage(p, o, w.kind ?? 'unarmed', base);
      this.damageObject(p, o, dmg, 'melee', undefined, [fx, fz]);
      if (it) this.wearWeapon(p, it, 0.6);
      return true;
    }
    // a wall right in front
    const wh = this.wallInFront(z, p, reach);
    if (wh) {
      const base = (w.dmg ? (w.dmg[0] + Math.random() * (w.dmg[1] - w.dmg[0])) : 2);
      const k = w.kind === 'blunt' ? 1 : w.kind === 'axe' ? 0.85 : w.kind === 'unarmed' ? 0.35 : 0.2;
      op('wallSmash', { z: z.key, x: wh.x, y: wh.y, side: wh.side, d: r2(base * k * (1 + p.body.skill('strength') * 0.05)), how: 'melee', by: p.id, u: r2(wh.u), h: r2(wh.h), n: wh.n } as WallArgs);
      if (it) this.wearWeapon(p, it, 0.5);
      if (!it) this.punchedWall(p);
      return true;
    }
    return false;
  }

  private punchedWall(p: Player) {
    if (Math.random() < 0.35) p.body.addInjury(Math.random() < 0.5 ? 'hand_r' : 'hand_l', 'bruise', 0.25);
  }

  private wearWeapon(p: Player, it: Item, k: number) {
    const dur = itemDef(it.key).weapon?.durability ?? 50;
    if (Math.random() < (1 / Math.max(1, dur)) * 2.2 * k) it.cond = Math.max(0, (it.cond ?? 1) - 0.1);
    if ((it.cond ?? 1) <= 0) { p.removeItem(it); bus.emit('think', p, `My ${itemDef(it.key).name.toLowerCase()} broke!`); G.audio?.at?.('break', p.x, p.z); bus.emit('inventoryChanged', p); }
  }

  /** nearest breakable object in front of the player within reach (arc in radians) */
  objectInFront(p: Player, reach: number, arc: number): TileObject | null {
    const z = G.getZone(p.zoneKey);
    let best: TileObject | null = null, bd = Infinity;
    const seen = new Set<number>();
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) for (const o of z.objectsAt(p.tileX() + dx, p.tileY() + dy)) {
      if (seen.has(o.uid)) continue; seen.add(o.uid);
      const d = objDef(o.key);
      if (!breakable(d, o)) continue;
      const m = objectMatrix(z, o, d!);
      const w = d!.w ?? 1, dd = d!.d ?? 1;
      const rw = o.rot % 2 === 0 ? w : dd, rd = o.rot % 2 === 0 ? dd : w;
      const cx = m.elements[12], cz = m.elements[14];
      // closest point of the footprint (shrunk a little: models rarely fill their tiles)
      const hx = rw / 2 - 0.08, hz = rd / 2 - 0.08;
      const nx = Math.max(cx - hx, Math.min(p.x, cx + hx)), nz = Math.max(cz - hz, Math.min(p.z, cz + hz));
      const dist = Math.hypot(nx - p.x, nz - p.z);
      if (dist > reach) continue;
      const ang = Math.atan2(nz - p.z, nx - p.x);
      let da = Math.abs(ang - p.facing); da = Math.min(da, Math.PI * 2 - da);
      if (dist > 0.35 && da > arc) continue;
      if (dist < bd) { bd = dist; best = o; }
    }
    return best;
  }

  /** the wall face right in front of the player (a plain wall: no door, window or hole on it) */
  wallInFront(z: Zone, p: Player, reach: number): { x: number; y: number; side: 0 | 1; u: number; h: number; n: 1 | -1 } | null {
    const fx = Math.cos(p.facing), fz = Math.sin(p.facing);
    const tx = p.tileX(), ty = p.tileY();
    let best: any = null, bd = Infinity;
    for (const [ex, ey, side] of [[tx, ty, 0], [tx, ty + 1, 0], [tx, ty, 1], [tx + 1, ty, 1]] as [number, number, 0 | 1][]) {
      if (!z.inb(ex, ey)) continue;
      const i = z.idx(ex, ey);
      const wid = side === 0 ? z.wallN[i] : z.wallW[i];
      if (!wid || z.edges.has(i * 2 + side)) continue;
      // distance along the facing to the edge line
      const t = side === 0 ? (ey - p.z) / (Math.abs(fz) > 1e-3 ? fz : 1e-3) : (ex - p.x) / (Math.abs(fx) > 1e-3 ? fx : 1e-3);
      if (t < 0 || t > reach) continue;
      const hx = p.x + fx * t, hz = p.z + fz * t;
      const u = side === 0 ? hx - ex : hz - ey;
      if (u < -0.05 || u > 1.05) continue;
      if (t < bd) { bd = t; best = { x: ex, y: ey, side, u: Math.max(0.1, Math.min(0.9, u)), h: 1.1 + Math.random() * 0.4, n: side === 0 ? (p.z >= ey ? 1 : -1) : (p.x >= ex ? 1 : -1) }; }
    }
    return best;
  }

  /**
   * A shot that went past (or missed) every creature (combat.ts): the first
   * window, wall, door or piece of furniture along the line takes it.
   */
  bulletWorld(p: Player, ang: number, maxD: number, w: any) {
    const z = G.getZone(p.zoneKey);
    const dx = Math.cos(ang), dz = Math.sin(ang);
    const aimD = Math.max(1.5, Math.hypot(p.aimX - p.x, p.aimZ - p.z));
    const hAt = (d: number) => Math.max(0.15, 1.3 + (0.85 - 1.3) * Math.min(1.6, d / aimD));
    let x = p.x, zz = p.z;
    let tx = Math.floor(x), ty = Math.floor(zz);
    const stepX = dx > 0 ? 1 : -1, stepY = dz > 0 ? 1 : -1;
    const tDX = Math.abs(1 / (dx || 1e-9)), tDY = Math.abs(1 / (dz || 1e-9));
    let tMaxX = Math.abs(dx) < 1e-6 ? Infinity : dx > 0 ? (tx + 1 - x) * tDX : (x - tx) * tDX;
    let tMaxY = Math.abs(dz) < 1e-6 ? Infinity : dz > 0 ? (ty + 1 - zz) * tDY : (zz - ty) * tDY;
    const base = w?.dmg ? (w.dmg[0] + w.dmg[1]) / 2 : 12;
    let tPrev = 0;
    for (let guard = 0; guard < 64; guard++) {
      // objects in this tile, between tPrev and the next edge
      const tNext = Math.min(tMaxX, tMaxY, maxD);
      const hitO = this.rayObjects(z, p, tx, ty, x, zz, dx, dz, tPrev, tNext, hAt);
      if (hitO) {
        const dmg = this.weaponDamage(p, hitO.o, 'firearm', base) * 0.7;
        this.damageObject(p, hitO.o, dmg, 'bullet', { x: hitO.x, y: hitO.y, z: hitO.z }, [dx, dz]);
        return;
      }
      if (tNext >= maxD) return;
      const crossX = tMaxX < tMaxY;
      const t = crossX ? tMaxX : tMaxY;
      let ex: number, ey: number, side: 0 | 1;
      if (crossX) { ex = stepX > 0 ? tx + 1 : tx; ey = ty; side = 1; } else { ex = tx; ey = stepY > 0 ? ty + 1 : ty; side = 0; }
      if (!z.inb(ex, ey)) return;
      const i = z.idx(ex, ey);
      const e = z.edges.get(i * 2 + side);
      const wid = side === 0 ? z.wallN[i] : z.wallW[i];
      const hx = x + dx * t, hz = zz + dz * t, hy = hAt(t);
      if (e) {
        if (e.kind === 'window' && e.glass === 'intact' && hy > 0.9 && hy < 2.0) {
          op('edge', { z: z.key, x: ex, y: ey, side, patch: { glass: 'broken' } });
          G.audio?.at?.('glass_break', hx, hz);
          // the bullet carries on
        } else if (e.kind === 'door' && !e.open || e.kind === 'window' && (hy < 0.9 || hy > 2.0) || e.barricade > 0) {
          this.impactFx(z, hx, hy, hz, -dx, -dz, 'wood', 0.7);
          G.audio?.at?.('dmg_hit_wood', hx, hz, 0.7);
          return;
        }
      } else if (wid) {
        const wd = wallDef(wid);
        if (hy < (wd.height ?? WALL_H) && !wd.seeThrough || wd.glass) {
          const u = side === 0 ? hx - ex : hz - ey;
          op('wallSmash', { z: z.key, x: ex, y: ey, side, d: r2(base * (wd.glass ? 2 : 0.3)), how: 'bullet', by: p.id, u: r2(Math.max(0.05, Math.min(0.95, u))), h: r2(hy), n: side === 0 ? (stepY > 0 ? -1 : 1) : (stepX > 0 ? -1 : 1) } as WallArgs);
          return;
        }
      }
      tPrev = t;
      if (crossX) { tx += stepX; tMaxX += tDX; } else { ty += stepY; tMaxY += tDY; }
      if (!z.inb(tx, ty) || !z.floor[z.idx(tx, ty)]) return;
    }
  }

  private rayObjects(z: Zone, p: Player, tx: number, ty: number, x: number, zz: number, dx: number, dz: number, t0: number, t1: number, hAt: (d: number) => number) {
    let best: { o: TileObject; x: number; y: number; z: number; t: number } | null = null;
    for (const o of z.objectsAt(tx, ty)) {
      const d = objDef(o.key);
      if (!breakable(d, o)) continue;
      const m = objectMatrix(z, o, d!);
      const w = d!.w ?? 1, dd = d!.d ?? 1;
      const rw = o.rot % 2 === 0 ? w : dd, rd = o.rot % 2 === 0 ? dd : w;
      const cx = m.elements[12], cz = m.elements[14];
      const minX = cx - rw / 2 + 0.1, maxX = cx + rw / 2 - 0.1, minZ = cz - rd / 2 + 0.1, maxZ = cz + rd / 2 - 0.1;
      // slab test in xz
      let tn = t0, tf = t1;
      for (const [o0, dir, lo, hi] of [[x, dx, minX, maxX], [zz, dz, minZ, maxZ]] as const) {
        if (Math.abs(dir) < 1e-9) { if (o0 < lo || o0 > hi) { tn = Infinity; break; } continue; }
        let a = (lo - o0) / dir, b = (hi - o0) / dir;
        if (a > b) { const s = a; a = b; b = s; }
        tn = Math.max(tn, a); tf = Math.min(tf, b);
      }
      if (tn > tf || tn === Infinity) continue;
      const hy = hAt(tn);
      const top = (d!.onWall ? (o.state?.y ?? 1.0) + d!.height : d!.height) + z.heightAt(o.x, o.y);
      const bottom = d!.onWall ? top - d!.height : 0;
      if (hy > top + 0.05 || hy < bottom) continue;
      if (!best || tn < best.t) best = { o, x: x + dx * tn, y: hy, z: zz + dz * tn, t: tn };
    }
    void p;
    return best;
  }

  /** ceiling light near a point (smashable) */
  lightNear(z: Zone, x: number, zz: number, r = 0.9) {
    let best: any = null, bd = r;
    for (const l of z.lights) {
      if (l.broken || l.kind === 'sky' || l.kind === 'fire' || l.kind === 'screen' || l.y < 1.8) continue;
      const d = Math.hypot(l.x - x, l.z - zz);
      if (d < bd) { bd = d; best = l; }
    }
    return best;
  }

  // ================================================================ hit / break effects (every peer)
  onHit(z: Zone, o: TileObject, d: ObjDef, a: DmgArgs, lvl: number) {
    if (z !== G.view?.zone) return;
    const mat = objMat(d);
    const k = Math.min(1.6, Math.max(0.4, a.d / 14));
    this.impactFx(z, a.hx, a.hy, a.hz, -a.dx, -a.dz, mat, k, d);
    const snd = mat === 'wood' || mat === 'paper' ? 'dmg_hit_wood' : mat === 'metal' ? 'dmg_hit_metal' : mat === 'fabric' ? 'dmg_hit_fabric' : mat === 'plastic' ? 'dmg_hit_plastic' : 'dmg_hit_hard';
    G.audio?.at?.(a.how === 'kick' ? 'dmg_kick' : snd, a.hx, a.hz, 0.9);
    if (a.how === 'kick') G.audio?.at?.(snd, a.hx, a.hz, 0.6);
    if (mat === 'elec' || (mat === 'glass' && lvl >= 2)) G.audio?.at?.(mat === 'elec' ? 'dmg_spark' : 'glass_clink', a.hx, a.hz, 0.7);
    // badly damaged electronics keep spitting sparks
    if (mat === 'elec' && lvl >= 2) {
      const m = objectMatrix(z, o, d);
      this.sparkSrcs.push({ zone: z.key, x: m.elements[12], y: z.heightAt(o.x, o.y) + d.height * 0.6, z: m.elements[14], until: G.time + 6 + lvl * 3, next: G.time + 0.5 });
    }
    this.shakeNear(a.hx, a.hz, a.how === 'bullet' ? 0.06 : 0.12 + k * 0.08);
  }

  /** particles where something hit a surface of material `mat`, flying back along (nx, nz) */
  impactFx(z: Zone, x: number, y: number, zz: number, nx: number, nz: number, mat: Mat, k = 1, d?: ObjDef) {
    if (z !== G.view?.zone) return;
    const q = this.quality, n = (v: number) => Math.max(1, Math.round(v * k * (q === 0 ? 0.5 : q === 2 ? 1.3 : 1)));
    const P = this.dust, S = this.sparks, r = this.rng;
    const spray = (kind: PK, count: number, cols: number[], speed: number, up: number, size: number, life: number, spread = 0.9, stretch = 0) => {
      const base = Math.atan2(nz, nx);
      for (let i = 0; i < count; i++) {
        const a = base + r.gauss(0, spread), s = speed * r.float(0.35, 1.1);
        (kind === PK.Spark ? S : P).add(kind, x, y, zz, Math.cos(a) * s, up * r.float(0.3, 1.2), Math.sin(a) * s, size * r.float(0.6, 1.3), life * r.float(0.6, 1.3), cols[(r.next() * cols.length) | 0], stretch);
      }
    };
    const avg = d ? objColor(d) : 0x8a8478;
    switch (mat) {
      case 'wood': case 'paper':
        spray(PK.Sliver, n(7), [0xe2c48c, 0xc8a46e, 0xf2dca8, 0xa8845a], 2.6, 2.2, 0.03, 2.2);
        spray(PK.Chunk, n(3), [0x8a6a42, 0xa8845a], 2, 2, 0.025, 2.5);
        spray(PK.Dust, n(8), [0xb8ae9c, 0xa89e8a, 0xd0c8b8], 0.9, 0.5, 0.028, 2.2, 1.4);
        break;
      case 'fabric':
        spray(PK.Fluff, n(9), [0xeceae2, 0xfbfaf6, 0xd8d4ca], 1.6, 1.8, 0.035, 1.8, 1.2);
        spray(PK.Dust, n(8), [0xc8c2b4, 0xe0dcd2], 0.8, 0.6, 0.026, 2.4, 1.4);
        break;
      case 'metal':
        spray(PK.Spark, n(8), [0xfff2c0, 0xffd070, 0xffb040], 4.2, 2.4, 0.016, 0.5, 0.8, 0.18);
        spray(PK.Chunk, n(2), [0x9aa0a8, 0x6a6e74], 1.8, 1.6, 0.018, 2);
        break;
      case 'glass':
        spray(PK.Glass, n(10), [0xd8ecf4, 0xffffff, 0xa8c8d8], 2.6, 2, 0.022, 1.5);
        spray(PK.Sliver, n(4), [0xc8e0ec, 0xffffff], 2.2, 1.5, 0.02, 2);
        break;
      case 'elec':
        spray(PK.Spark, n(14), [0xffffff, 0xbfe6ff, 0xfff2c0, 0xffd070], 4.8, 2.8, 0.016, 0.55, 1.1, 0.2);
        spray(PK.Chunk, n(3), [0x2a2a2c, 0x4a4a4e, avg], 2, 1.8, 0.02, 2);
        spray(PK.Dust, n(8), [0x3a3836, 0x4a4644, 0x5a5654], 0.7, 0.9, 0.03, 2.4, 1.2);
        this.flash(x, y, zz, 0xbfe6ff, 0.5, 0.12, true);
        break;
      case 'flesh':
        spray(PK.Chunk, n(5), [0xdcc0a8, 0xecd4be, 0x9a5a52], 2, 1.8, 0.025, 2.5);
        if ((G.sandbox.gore ?? 2) > 0) G.gore?.replicaBleed?.(x, y, zz, nx, nz, k);
        break;
      default: // plastic, ceramic
        spray(PK.Chunk, n(6), mat === 'ceramic' ? [0xf0eee8, 0xd8d4ca, 0xb8b2a4] : [avg, 0x2a2a2c, 0xd8d4ca], 2.4, 2, 0.02, 2.2);
        spray(PK.Dust, n(8), [0xd8d4ca, 0xb8b2a4], 0.9, 0.5, 0.026, 2.2, 1.4);
    }
  }

  /** the object is gone: debris out of its model, particles, sound, sparks, flash */
  onBroken(z: Zone, o: TileObject, d: ObjDef, m: THREE.Matrix4, a: BreakArgs, pile: TileObject | null) {
    this.markOverlay(z);
    if (!isReplaying()) this.tidyPiles(z);
    const here = z === G.view?.zone && !isReplaying();
    const mat = objMat(d);
    if (!here) { if (pile) SETTLED.add(a.seed); return; }
    const cx = m.elements[12], cy = m.elements[13], cz = m.elements[14];
    const h = Math.max(0.2, d.height);
    // the debris
    try {
      const data = this.buildPile(z, o, d, m, a, pile);
      if (data && pile) this.startLive(z, data.sim, data.pieces, a.seed, mat, pile);
      else if (pile) SETTLED.add(a.seed);
    } catch (e) { console.error('debris', e); if (pile) SETTLED.add(a.seed); }
    // particles: a cloud, then what it was made of
    const q = this.quality, r = this.rng;
    const nd = q === 0 ? 40 : q === 2 ? 130 : 80;
    const fw = Math.max(0.4, ((d.w ?? 1) + (d.d ?? 1)) / 4);
    const dc = mat === 'elec' ? [0x3a3836, 0x4a4644, 0x5a5654] : mat === 'fabric' ? [0xd8d4ca, 0xeceae2, 0xbcb6aa] : mat === 'ceramic' ? [0xe0dcd2, 0xc8c4ba] : [0xb0a896, 0xc8c0ae, 0x948c7c];
    for (let i = 0; i < nd; i++) {
      const a2 = r.float(0, Math.PI * 2), sp = r.float(0.3, 1.8);
      this.dust.add(PK.Dust, cx + r.float(-fw, fw) * 0.6, cy + r.float(0.05, h * 0.7), cz + r.float(-fw, fw) * 0.6, Math.cos(a2) * sp + a.dx * 0.5, r.float(0.1, 0.9), Math.sin(a2) * sp + a.dz * 0.5, r.float(0.022, 0.05), r.float(1.8, 4), dc[(r.next() * dc.length) | 0]);
    }
    const k = 2.2;
    for (let i = 0; i < 4; i++) this.impactFx(z, cx + r.float(-fw, fw) * 0.6, cy + h * r.float(0.3, 0.8), cz + r.float(-fw, fw) * 0.6, a.dx + r.float(-0.6, 0.6), a.dz + r.float(-0.6, 0.6), mat, k, d);
    if (mat === 'fabric') for (let i = 0; i < (q === 0 ? 14 : 34); i++) this.dust.add(PK.Fluff, cx + r.float(-fw, fw), cy + h * r.float(0.2, 0.9), cz + r.float(-fw, fw), r.float(-1.2, 1.2), r.float(0.4, 2), r.float(-1.2, 1.2), r.float(0.03, 0.07), r.float(3, 6), r.chance(0.7) ? 0xf4f2ea : 0xd8d4ca);
    if (mat === 'elec' || d.tags?.includes('tv') || d.light?.kind === 'screen') {
      for (let i = 0; i < 3; i++) this.impactFx(z, cx, cy + h * 0.6, cz, r.float(-1, 1), r.float(-1, 1), 'elec', 2, d);
      this.impactFx(z, cx, cy + h * 0.55, cz, a.dx, a.dz, 'glass', 2.5, d);
      this.flash(cx, cy + h * 0.6, cz, 0xd8f0ff, 1.6, 0.35, true);
      this.sparkSrcs.push({ zone: z.key, x: cx, y: cy + 0.25, z: cz, until: G.time + 9, next: G.time + 0.3 });
      G.audio?.at?.(d.tags?.includes('tv') || d.key.includes('tv') || d.key.includes('crt') ? 'dmg_tv_implode' : 'dmg_spark', cx, cz, 1);
    }
    const snd = mat === 'wood' || mat === 'paper' ? 'dmg_break_wood' : mat === 'metal' ? 'dmg_break_metal' : mat === 'fabric' ? 'dmg_break_fabric' : mat === 'glass' ? 'dmg_break_glass' : mat === 'ceramic' || mat === 'flesh' ? 'dmg_break_ceramic' : 'dmg_break_plastic';
    G.audio?.at?.(snd, cx, cz, 1);
    if (mat === 'elec') G.audio?.at?.('dmg_break_plastic', cx, cz, 0.7);
    // the wax replicas bleed something pale when they come apart
    if (mat === 'flesh' && (G.sandbox.gore ?? 2) > 0) G.gore?.replicaBurst?.(z, cx, cy + h * 0.6, cz, a.dx, a.dz);
    this.shakeNear(cx, cz, 0.35);
    (G.camera as any)?.punch?.(0.03, 0.25);
  }

  /** host: a zone full of wreckage loses its oldest heaps (anything buried in them is left on the floor) */
  private tidyPiles(z: Zone) {
    if (G.role === 'client') return;
    const piles = [...z.objects.values()].filter((q) => q.key === PILE);
    if (piles.length <= 60) return;
    piles.sort((a, b) => (a.state.t ?? 0) - (b.state.t ?? 0));
    for (const q of piles.slice(0, piles.length - 60)) {
      if (q.inv) for (const it of [...q.inv.items]) op('move', { z: z.key, from: 'obj:' + q.uid, to: `floor:${q.x + 0.5},${q.y + 0.5}`, uid: it.uid });
      op('objRemove', { z: z.key, uid: q.uid });
    }
  }

  /** window glass shattered (edge op) */
  windowFx(z: Zone, x: number, y: number, side: 0 | 1) {
    if (z !== G.view?.zone) return;
    const cx = side === 0 ? x + 0.5 : x, cz = side === 0 ? y : y + 0.5, base = z.heightAt(x, y);
    const r = this.rng, q = this.quality;
    const n = q === 0 ? 24 : q === 2 ? 70 : 46;
    for (let i = 0; i < n; i++) {
      const along = r.float(-0.38, 0.38), hh = base + r.float(0.95, 1.95);
      const px = side === 0 ? cx + along : cx, pz = side === 0 ? cz : cz + along;
      const dir = r.chance(0.5) ? 1 : -1, sp = r.float(0.4, 2.4);
      const vx = side === 1 ? dir * sp : r.float(-0.5, 0.5), vz = side === 0 ? dir * sp : r.float(-0.5, 0.5);
      this.dust.add(r.chance(0.3) ? PK.Sliver : PK.Glass, px, hh, pz, vx, r.float(-0.2, 1.4), vz, r.float(0.015, 0.035), r.float(2, 4), r.pick([0xd8ecf4, 0xffffff, 0xa8c8d8, 0xc8e0ec]));
    }
    G.audio?.at?.('dmg_break_glass', cx, cz, 0.9);
  }

  onWallHit(z: Zone, a: WallArgs, w: WallDef, broken: boolean) {
    if (z !== G.view?.zone) return;
    const T = (w.thick ?? 0.12) / 2;
    const base = z.heightAt(a.x, a.y);
    const fx = a.side === 0 ? a.x + a.u : a.x + a.n * (T + 0.02), fz = a.side === 0 ? a.y + a.n * (T + 0.02) : a.y + a.u;
    const nx = a.side === 0 ? 0 : a.n, nz = a.side === 0 ? a.n : 0;
    const mat: Mat = w.glass ? 'glass' : w.sound === 'drywall' ? 'ceramic' : w.sound === 'wood' ? 'wood' : w.sound === 'metal' ? 'metal' : 'ceramic';
    const r = this.rng;
    if (a.how === 'bullet') {
      this.impactFx(z, fx, base + a.h, fz, nx, nz, mat === 'metal' ? 'metal' : mat, 0.6);
      G.audio?.at?.(mat === 'metal' ? 'dmg_ricochet' : 'dmg_bullet_wall', fx, fz, 0.8);
      return;
    }
    if (!broken) {
      this.impactFx(z, fx, base + a.h, fz, nx, nz, mat, 1.3);
      for (let i = 0; i < 18; i++) this.dust.add(PK.Dust, fx + r.float(-0.15, 0.15), base + a.h + r.float(-0.2, 0.1), fz + r.float(-0.15, 0.15), nx * r.float(0.3, 1.2) + r.float(-0.3, 0.3), r.float(-0.2, 0.4), nz * r.float(0.3, 1.2) + r.float(-0.3, 0.3), r.float(0.02, 0.045), r.float(1.5, 3.2), r.chance(0.5) ? 0xe0dcd2 : 0xc8c4ba);
      G.audio?.at?.(w.glass ? 'glass_clink' : mat === 'wood' ? 'dmg_hit_wood' : mat === 'metal' ? 'dmg_hit_metal' : 'dmg_wall_hit', fx, fz, 1);
      this.shakeNear(fx, fz, 0.18);
      return;
    }
    // through: chunks of board both ways, a choking cloud
    const cx = a.side === 0 ? a.x + 0.5 : a.x, cz = a.side === 0 ? a.y : a.y + 0.5;
    for (const n of [1, -1]) {
      const ex = a.side === 0 ? 0 : n, ez = a.side === 0 ? n : 0;
      for (let i = 0; i < 4; i++) this.impactFx(z, cx + (a.side === 0 ? r.float(-0.35, 0.35) : 0), base + r.float(0.3, 1.8), cz + (a.side === 1 ? r.float(-0.35, 0.35) : 0), ex, ez, w.glass ? 'glass' : mat, 2);
    }
    for (let i = 0; i < (this.quality === 0 ? 50 : 140); i++) this.dust.add(PK.Dust, cx + r.float(-0.5, 0.5), base + r.float(0.2, 2), cz + r.float(-0.5, 0.5), r.float(-1.4, 1.4), r.float(-0.1, 0.6), r.float(-1.4, 1.4), r.float(0.022, 0.05), r.float(2.5, 5), w.glass ? 0xe8eef2 : r.chance(0.5) ? 0xe4e0d6 : 0xc8c4ba);
    if (!w.glass) {
      // chunky board pieces as real debris (local, short-lived)
      const mb = new ModelBuilder();
      mb.box(0, 0, 0, 0.3, 0.22, 0.1, 'dmg_gypsum');
      const g = mb.build();
      const pieces: Piece[] = [];
      for (let i = 0; i < 6; i++) pieces.push({ geo: g, c: new THREE.Vector3(), half: new THREE.Vector3(0.15 * (0.6 + i * 0.08), 0.11, 0.05), mat: 'ceramic', tex: 'dmg_gypsum', mass: 2 });
      const starts: SimStart[] = pieces.map((pc, i) => {
        const n = i % 2 ? 1 : -1;
        const p = new THREE.Vector3(cx + (a.side === 0 ? r.float(-0.3, 0.3) : n * 0.15), base + r.float(0.4, 1.7), cz + (a.side === 1 ? r.float(-0.3, 0.3) : n * 0.15));
        const v = new THREE.Vector3((a.side === 1 ? n : r.float(-0.4, 0.4)) * r.float(0.6, 2), r.float(0.2, 1.4), (a.side === 0 ? n : r.float(-0.4, 0.4)) * r.float(0.6, 2));
        return { p, q: new THREE.Quaternion().setFromEuler(new THREE.Euler(r.float(0, 3), r.float(0, 3), r.float(0, 3))), v, w: new THREE.Vector3(r.float(-8, 8), r.float(-8, 8), r.float(-8, 8)), half: pc.half };
      });
      const sim = simulate(z, starts, 3);
      this.startLive(z, sim, pieces, -1, 'ceramic', null, 12);
    }
    G.audio?.at?.(w.glass ? 'dmg_break_glass' : 'dmg_wall_break', cx, cz, 1);
    this.shakeNear(cx, cz, 0.45);
    (G.camera as any)?.punch?.(0.04, 0.3);
  }

  onLightSmashed(z: Zone, l: any) {
    if (z !== G.view?.zone) return;
    const r = this.rng;
    for (let i = 0; i < (this.quality === 0 ? 16 : 36); i++) this.sparks.add(PK.Spark, l.x + r.float(-0.25, 0.25), l.y - 0.05, l.z + r.float(-0.25, 0.25), r.float(-1.6, 1.6), r.float(-0.5, 1.2), r.float(-1.6, 1.6), r.float(0.012, 0.022), r.float(0.5, 1.1), r.pick([0xffffff, 0xfff2c0, 0xbfe6ff, 0xffd070]), 0.2);
    for (let i = 0; i < 24; i++) this.dust.add(r.chance(0.4) ? PK.Sliver : PK.Glass, l.x + r.float(-0.4, 0.4), l.y - 0.1, l.z + r.float(-0.2, 0.2), r.float(-0.6, 0.6), r.float(-0.5, 0.3), r.float(-0.6, 0.6), r.float(0.012, 0.028), r.float(2.5, 4), r.pick([0xf2f6f0, 0xffffff, 0xd8e8e0]));
    // it dies flickering
    this.flash(l.x, l.y - 0.2, l.z, l.color ?? 0xf1edd0, 2.4, 0.8, true);
    this.sparkSrcs.push({ zone: z.key, x: l.x, y: l.y - 0.05, z: l.z, until: G.time + 4, next: G.time + 0.6 });
    G.audio?.at?.('dmg_light_pop', l.x, l.z, 1);
    G.audio?.at?.('dmg_spark', l.x, l.z, 0.8);
  }

  flash(x: number, y: number, z: number, col: number, i: number, dur: number, flicker = false) {
    this.flashes.push({ x, y, z, col, t: 0, dur, i, flicker });
  }

  private updateFlashes(dt: number, z: Zone | null) {
    for (let k = this.flashes.length - 1; k >= 0; k--) {
      const f = this.flashes[k];
      f.t += dt;
      if (f.t > f.dur) { this.flashes.splice(k, 1); continue; }
      const e = 1 - f.t / f.dur;
      const fl = f.flicker ? (Math.random() < 0.45 ? 0.15 : 1) : 1;
      G.pointLight(f.x, f.y, f.z, f.col, f.i * e * fl, 5);
    }
    for (let k = this.sparkSrcs.length - 1; k >= 0; k--) {
      const s = this.sparkSrcs[k];
      if (G.time > s.until || !z || s.zone !== z.key) { this.sparkSrcs.splice(k, 1); continue; }
      if (G.time < s.next) continue;
      s.next = G.time + 0.4 + Math.random() * 1.6;
      const r = this.rng;
      for (let i = 0; i < 6 + r.int(0, 8); i++) this.sparks.add(PK.Spark, s.x + r.float(-0.1, 0.1), s.y, s.z + r.float(-0.1, 0.1), r.float(-1.8, 1.8), r.float(0.2, 2), r.float(-1.8, 1.8), r.float(0.01, 0.02), r.float(0.4, 0.8), r.pick([0xffffff, 0xbfe6ff, 0xfff2c0]), 0.2);
      this.flash(s.x, s.y + 0.1, s.z, 0xbfe6ff, 1.2, 0.08, false);
      G.audio?.at?.('dmg_spark', s.x, s.z, 0.45);
    }
  }

  private shakeNear(x: number, z: number, amt: number) {
    const p = G.local; if (!p || Math.hypot(p.x - x, p.z - z) > 8) return;
    const k = 1 - Math.hypot(p.x - x, p.z - z) / 8;
    try { (G.camera as any)?.shake?.(amt * k, 0.25 + amt * 0.4); } catch { G.pr.shake = Math.max(G.pr.shake, amt * k); }
  }

  // ================================================================ debris: fracture, sim, pile
  /** fracture + simulate (break time, or lazily for a pile seen later) */
  private buildPile(z: Zone, o: TileObject, d: ObjDef, m: THREE.Matrix4, a: { seed: number; dx: number; dz: number; how: string }, pile: TileObject | null): { sim: SimResult; pieces: Piece[] } | null {
    const mat = objMat(d);
    // the same on every machine (phones and desktops must agree on the heap)
    const max = 18;
    const pieces = fracture(d, { ...(o.state || {}), dmg: 0, held: undefined }, o, { max, seed: a.seed, mat });
    // loose bits by material (splinters, stuffing tufts, shards, boards) join the sim
    const bits = bitGeos(mat);
    const nb = mat === 'fabric' ? 8 : mat === 'glass' || mat === 'elec' ? 7 : mat === 'metal' ? 4 : 6;
    const rng = new Rng(a.seed ^ 0x2545f491);
    const bb = new THREE.Box3();
    for (let i = 0; i < nb; i++) {
      const g = bits[i % bits.length];
      bb.copy(g.boundingBox!);
      const c = bb.getCenter(new THREE.Vector3());
      const geo = g.clone(); geo.translate(-c.x, -c.y, -c.z);
      const half = bb.getSize(new THREE.Vector3()).multiplyScalar(0.5).max(new THREE.Vector3(0.006, 0.006, 0.006));
      pieces.push({ geo, c: new THREE.Vector3(rng.float(-0.3, 0.3) * (d.w ?? 1), rng.float(0.1, Math.max(0.2, d.height * 0.8)), rng.float(-0.2, 0.2) * (d.d ?? 1)), half, mat, tex: '', mass: 0.1 });
    }
    // starting state: where each piece sits in the intact model, flung out from the blow
    const pw = POWER[a.how] ?? 2.2;
    const centre = new THREE.Vector3(m.elements[12], m.elements[13] + d.height * 0.45, m.elements[14]);
    const rotQ = new THREE.Quaternion().setFromRotationMatrix(tmpM.extractRotation(m));
    const starts: SimStart[] = pieces.map((pc) => {
      const p = pc.c.clone().applyMatrix4(m);
      const rad = p.clone().sub(centre); rad.y = 0;
      const rl = Math.sqrt(rad.x * rad.x + rad.z * rad.z) || 1;
      const heavy = 1 / Math.sqrt(1 + pc.mass * 0.08);
      const v = new THREE.Vector3(
        (a.dx * pw * rng.float(0.35, 1.0) + (rad.x / rl) * rng.float(0.3, 1.4)) * heavy,
        rng.float(0.6, 2.4) * Math.min(1.4, pw / 2.2) * heavy,
        (a.dz * pw * rng.float(0.35, 1.0) + (rad.z / rl) * rng.float(0.3, 1.4)) * heavy,
      );
      const w = new THREE.Vector3(rng.float(-1, 1), rng.float(-1, 1), rng.float(-1, 1)).multiplyScalar(rng.float(3, 12) * heavy);
      return { p, q: rotQ.clone(), v, w, half: pc.half };
    });
    const sim = simulate(z, starts, 4.5);
    if (pile) {
      const finals = sim.pieces.map((sp) => new THREE.Matrix4().compose(sp.p, sp.q, tmpS));
      this.piles.set(pile.state.seed, { pieces, finals, mats: pieces.map((p) => p.mat), bits: [] });
    }
    return { sim, pieces };
  }

  /** the pile's geometry: every piece where it came to rest (model space of the pile object) */
  pileModel(mb: ModelBuilder, s: ObjState, o?: TileObject) {
    const seed = s.seed ?? 0;
    // still tumbling: draw nothing (the live debris is showing it)
    if (!SETTLED.has(seed) && this.live.some((l) => l.seed === seed)) return;
    let data = this.piles.get(seed);
    if (!data && o) {
      // a pile from earlier (save, late join, another zone): rebuild it the same way
      const z = [...G.zones.values()].find((zz) => zz.objects.get(o.uid) === o);
      const d = s.of ? objDef(s.of) : undefined;
      if (z && d && s.src) {
        const fake: TileObject = { uid: s.src.uid ?? -1, key: s.of, x: s.src.x, y: s.src.y, rot: s.src.rot, state: { ...(s.os || {}), y: s.src.sy, yaw: s.src.yaw }, ox: s.src.ox || undefined, oz: s.src.oz || undefined };
        const m = objectMatrix(z, fake, d).clone();
        this.buildPile(z, fake, d, m, { seed, dx: s.ix ?? 0, dz: s.iz ?? 0, how: s.how ?? 'smash' }, o);
        data = this.piles.get(seed);
      }
    }
    if (!data || !o) {
      // fallback heap (galleries, unknown source)
      const r = new Rng(seed || 1);
      for (let i = 0; i < 9; i++) { mb.push().translate(r.float(-0.35, 0.35), 0, r.float(-0.35, 0.35)).rotateY(r.float(0, 3)).rotateZ(r.float(-0.3, 0.3)); mb.box(0, 0, 0, r.float(0.1, 0.4), r.float(0.02, 0.06), r.float(0.05, 0.12), r.chance(0.5) ? 'dbr_splinter' : 'wood_dark'); mb.pop(); }
      return;
    }
    // into the pile's own frame (anchor tile centre on the floor)
    const z = [...G.zones.values()].find((zz) => zz.objects.get(o.uid) === o);
    const fy = z ? z.heightAt(o.x, o.y) : 0;
    const inv = new THREE.Matrix4().makeTranslation(-(o.x + 0.5), -fy, -(o.y + 0.5));
    for (let i = 0; i < data.pieces.length; i++) {
      tmpM.multiplyMatrices(inv, data.finals[i]);
      mb.appendGeometry(data.pieces[i].geo, tmpM);
    }
  }

  // ---------------------------------------------------------------- live debris (one merged, CPU-posed mesh per break)
  private startLive(z: Zone, sim: SimResult, pieces: Piece[], seed: number, mat: Mat, pile: TileObject | null, cut = 0) {
    let vtot = 0, itot = 0;
    for (const pc of pieces) { vtot += pc.geo.getAttribute('position').count; itot += pc.geo.getIndex()!.count; }
    const pos = new Float32Array(vtot * 3), nor = new Float32Array(vtot * 3), uv = new Float32Array(vtot * 2), col = new Float32Array(vtot * 3), atl = new Float32Array(vtot * 4), fx = new Float32Array(vtot * 2);
    const idx = vtot > 65535 ? new Uint32Array(itot) : new Uint16Array(itot);
    const ranges: [number, number][] = [];
    let v0 = 0, i0 = 0;
    for (const pc of pieces) {
      const g = pc.geo;
      const n = g.getAttribute('position').count;
      pos.set((g.getAttribute('position') as THREE.BufferAttribute).array as Float32Array, v0 * 3);
      nor.set((g.getAttribute('normal') as THREE.BufferAttribute).array as Float32Array, v0 * 3);
      uv.set((g.getAttribute('uv') as THREE.BufferAttribute).array as Float32Array, v0 * 2);
      col.set((g.getAttribute('color') as THREE.BufferAttribute).array as Float32Array, v0 * 3);
      atl.set((g.getAttribute('aAtlas') as THREE.BufferAttribute).array as Float32Array, v0 * 4);
      fx.set((g.getAttribute('aFx') as THREE.BufferAttribute).array as Float32Array, v0 * 2);
      const I = g.getIndex()!;
      for (let k = 0; k < I.count; k++) idx[i0 + k] = I.getX(k) + v0;
      ranges.push([v0, v0 + n]);
      v0 += n; i0 += I.count;
    }
    const geo = new THREE.BufferGeometry();
    const P = new THREE.BufferAttribute(new Float32Array(pos), 3); P.setUsage(THREE.DynamicDrawUsage);
    const N = new THREE.BufferAttribute(new Float32Array(nor), 3); N.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', P); geo.setAttribute('normal', N);
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aAtlas', new THREE.BufferAttribute(atl, 4)); geo.setAttribute('aFx', new THREE.BufferAttribute(fx, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    const mesh = new THREE.Mesh(geo, MAT.propLow);
    mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = true;
    this.root.add(mesh);
    const dur = Math.max(0.5, (sim.frames - 1) * sim.dt);
    const L: LiveBreak = { zone: z.key, seed, mesh, geo, rest: pos, restN: nor, ranges, sim, t: 0, dur: cut ? Math.min(dur, cut) : dur, li: 0, mats: pieces.map((p) => p.mat), pileTile: pile ? [pile.x, pile.y] : null, settled: false, wait: 0 };
    this.live.push(L);
    this.poseLive(L);
    // too many at once on a phone: settle the oldest
    const cap = this.quality === 0 ? 2 : 5;
    while (this.live.length > cap) this.endLive(this.live.shift()!, true);
  }

  private poseLive(L: LiveBreak) {
    const f = Math.min(L.sim.frames - 1, L.t / L.sim.dt);
    const f0 = Math.floor(f), f1 = Math.min(L.sim.frames - 1, f0 + 1), k = f - f0;
    const P = L.geo.getAttribute('position') as THREE.BufferAttribute, N = L.geo.getAttribute('normal') as THREE.BufferAttribute;
    const pa = P.array as Float32Array, na = N.array as Float32Array;
    for (let i = 0; i < L.ranges.length; i++) {
      const fr = L.sim.pieces[i].frames;
      const a = f0 * 7, b = f1 * 7;
      tmpP.set(fr[a] + (fr[b] - fr[a]) * k, fr[a + 1] + (fr[b + 1] - fr[a + 1]) * k, fr[a + 2] + (fr[b + 2] - fr[a + 2]) * k);
      tmpQ.set(fr[a + 3], fr[a + 4], fr[a + 5], fr[a + 6]);
      tmpQ2.set(fr[b + 3], fr[b + 4], fr[b + 5], fr[b + 6]);
      tmpQ.slerp(tmpQ2, k);
      tmpM.compose(tmpP, tmpQ, tmpS);
      const e = tmpM.elements;
      const [v0, v1] = L.ranges[i];
      for (let v = v0; v < v1; v++) {
        const x = L.rest[v * 3], y = L.rest[v * 3 + 1], z = L.rest[v * 3 + 2];
        pa[v * 3] = e[0] * x + e[4] * y + e[8] * z + e[12];
        pa[v * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
        pa[v * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
        const nx = L.restN[v * 3], ny = L.restN[v * 3 + 1], nz = L.restN[v * 3 + 2];
        na[v * 3] = e[0] * nx + e[4] * ny + e[8] * nz;
        na[v * 3 + 1] = e[1] * nx + e[5] * ny + e[9] * nz;
        na[v * 3 + 2] = e[2] * nx + e[6] * ny + e[10] * nz;
      }
    }
    P.needsUpdate = true; N.needsUpdate = true;
  }

  private updateLive(dt: number, z: Zone | null) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const L = this.live[i];
      if (!z || L.zone !== z.key) { this.endLive(L, true); this.live.splice(i, 1); continue; }
      if (!L.settled) {
        L.t += dt;
        // pieces landing: knocks, clatter, puffs of dust
        while (L.li < L.sim.landings.length && L.sim.landings[L.li].t <= L.t) {
          const ld = L.sim.landings[L.li++];
          if (ld.s < 1.6) continue;
          const m = L.mats[ld.i] ?? 'wood';
          const snd = m === 'metal' ? 'dmg_debris_metal' : m === 'glass' ? 'dmg_debris_glass' : m === 'fabric' || m === 'flesh' ? 'dmg_debris_soft' : 'dmg_debris_wood';
          if (this.rng.chance(0.6)) G.audio?.at?.(snd, ld.x, ld.z, Math.min(0.8, ld.s / 5));
          for (let k = 0; k < 5; k++) this.dust.add(PK.Dust, ld.x, z.heightAt(Math.floor(ld.x), Math.floor(ld.z)) + 0.04, ld.z, this.rng.float(-0.7, 0.7), this.rng.float(0.1, 0.5), this.rng.float(-0.7, 0.7), this.rng.float(0.02, 0.04), this.rng.float(1, 2.2), 0xb0a896);
        }
        this.poseLive(L);
        if (L.t >= L.dur) {
          L.settled = true;
          if (L.seed >= 0) SETTLED.add(L.seed);
          if (L.pileTile) z.markDirty(L.pileTile[0], L.pileTile[1]);
          else if (L.seed < 0) { L.wait = 6; }
        }
        continue;
      }
      // keep the live copy until the chunk with the pile has been rebuilt (no gap)
      if (L.pileTile) {
        if (!z.dirtyChunks.has(z.chunkOf(L.pileTile[0], L.pileTile[1]))) { this.endLive(L, false); this.live.splice(i, 1); }
      } else if ((L.wait -= dt) <= 0) { this.endLive(L, false); this.live.splice(i, 1); }
    }
  }

  private endLive(L: LiveBreak, settle: boolean) {
    this.root.remove(L.mesh);
    L.geo.dispose();
    if (settle && L.seed >= 0 && !SETTLED.has(L.seed)) {
      SETTLED.add(L.seed);
      const z = G.zones.get(L.zone);
      if (z && L.pileTile) z.markDirty(L.pileTile[0], L.pileTile[1]);
    }
  }

  // ---------------------------------------------------------------- damage overlay (cracks, tears, dents)
  private rebuildOverlay(z: Zone) {
    this.overlayDirty = false; this.overlayZone = z.key;
    for (const m of this.overlayMeshes) { this.root.remove(m); m.geometry.dispose(); }
    this.overlayMeshes.length = 0;
    const tall = new ModelBuilder(), low = new ModelBuilder();
    for (const o of z.objects.values()) {
      const lvl = o.state?.dmg | 0;
      if (!lvl || o.state?.held) continue;
      const d = objDef(o.key); if (!d) continue;
      const g = objectGeometry(d, { ...o, state: { ...o.state, dmg: 0 } });
      if (!g) continue;
      crackOverlay(d.height > 1.1 || d.tall ? tall : low, g, objectMatrix(z, o, d), lvl, o.uid, objMat(d));
    }
    const add = (mb: ModelBuilder, cut: boolean) => {
      if (mb.isEmpty) return;
      const m = new THREE.Mesh(mb.build(), worldMaterial({ alphaTest: 0.5, cutout: cut }));
      m.renderOrder = 1; m.matrixAutoUpdate = false; m.receiveShadow = true;
      this.root.add(m); this.overlayMeshes.push(m);
    };
    add(tall, true); add(low, false);
  }

  /** a held (pushed) object's cracks travel with its proxy */
  overlayFor(o: TileObject, d: ObjDef): THREE.BufferGeometry | null {
    const lvl = o.state?.dmg | 0; if (!lvl) return null;
    const g = objectGeometry(d, { ...o, state: { ...o.state, dmg: 0 } }); if (!g) return null;
    const mb = new ModelBuilder();
    crackOverlay(mb, g, new THREE.Matrix4(), lvl, o.uid, objMat(d));
    return mb.isEmpty ? null : mb.build();
  }

  private rebuildHoles(z: Zone) {
    this.holesDirty = false; this.holesZone = z.key;
    if (this.holesMesh) { this.root.remove(this.holesMesh); this.holesMesh.geometry.dispose(); this.holesMesh = null; }
    const m = buildHolesMesh(z);
    if (m) { this.holesMesh = m; this.root.add(m); }
  }

  // ---------------------------------------------------------------- held objects (push / drag)
  dropHold(z: Zone, o: TileObject) {
    this.push?.forget?.(o.uid);
    delete o.state.held; delete o.state.heldBy;
    if (!z.tileObjs.get(z.idx(o.x, o.y))?.includes(o)) z.addObject(o);
  }
  onReleased(z: Zone, o: TileObject) { this.push?.released?.(z, o); this.markOverlay(z); }

  /** network: fx events piggyback on the gore channel ({ t: 'D', ... }) */
  onNet(ev: any) { this.push?.onNet?.(ev); }
}
