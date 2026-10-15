import { Container } from './container';
import { Item, ItemDef, itemDef, hasItemDef, allItemDefs, freshness, itemWeight } from './item';
import { itemGeometry } from './itemMeshes';
import { G } from '../game/G';
import { FOOT, BAG_GRID, POCKETS_BY_SLOT, POCKETS_BY_KEY, KIND_SHAPE } from './footprints';

/**
 * The backpack grid. Every container that holds items has a grid of cells
 * (a bag's canvas interior, the pockets sewn on the clothes you wear, a
 * drawer's tray, a fridge's shelves, a car trunk's carpet); every item has a
 * footprint and sits at a cell (Item.gx / gy, rot 1 = turned 90 degrees).
 * Several small items of the same kind share one cell as a stack.
 *
 * Containers place items themselves when something adds one without a valid
 * position (loot rolls, pickups, crafting, scripted gifts): first fit, trying
 * both orientations. If nothing fits the item is left unplaced; world
 * containers show unplaced items heaped on top, and the local survivor's
 * pack settles them (src/items/packResolver.ts): another pocket or bag, a
 * free hand, or the floor.
 *
 * All of this is deterministic given the container's contents, so co-op
 * peers that apply the same ops end up with the same layout.
 */

export type Rot = 0 | 1;
export interface Placement { gx: number; gy: number; rot: Rot }
export interface Region { x: number; y: number; w: number; h: number; id: string; label: string; slot?: string; pocket?: string; garment?: number }
export interface GridSpec {
  w: number; h: number;
  regions: Region[];
  /** region index per cell (-1 = no cell there) */
  ri: Int16Array;
  /** look of the cells: 'canvas' (bag), 'pocket', 'wood', 'fridge', 'carpet', 'floor'... */
  style: string;
  label: string;
  sig: string;
  /** the floor: positions are a local view only, nothing is stored */
  transient?: boolean;
  /** item key of the bag this grid belongs to */
  bagKey?: string;
}

const clampI = (v: number, a: number, b: number) => Math.max(a, Math.min(b, Math.round(v)));

// ================================================================ footprints
const footCache = new Map<string, [number, number]>();

/** the footprint of an item kind at rot 0 ([w, h] cells) */
export function baseFootprint(key: string): [number, number] {
  let f = footCache.get(key);
  if (f) return f;
  const d = hasItemDef(key) ? itemDef(key) : null;
  if (d?.grid) f = [clampI(d.grid[0], 1, 8), clampI(d.grid[1], 1, 8)];
  else if (FOOT[key]) f = FOOT[key];
  else f = heuristicFootprint(d);
  footCache.set(key, f);
  return f;
}

/** footprint of one item (state can matter later: folded bags, extended stocks) */
export function footprintOf(it: Item): [number, number] { return baseFootprint(it.key); }
export function dimsOf(it: Item, rot: Rot | undefined): [number, number] {
  const [w, h] = footprintOf(it);
  return rot ? [h, w] : [w, h];
}

/** derive a footprint from the 3D model's bounds, the category and the weight */
function heuristicFootprint(d: ItemDef | null): [number, number] {
  if (!d) return [1, 1];
  if (d.heavy) return [6, 6];
  let L = 0, M = 0, S = 0;
  let dims: number[] | null = null;
  try {
    const g = itemGeometry(d.key);
    if (g) {
      if (!g.boundingBox) g.computeBoundingBox();
      const b = g.boundingBox!;
      dims = [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z];
      if (!dims.every((v) => Number.isFinite(v))) dims = null;
    }
  } catch { dims = null; }
  if (dims) { dims.sort((a, b) => b - a); [L, M, S] = dims; }
  else {
    const w = d.weight;
    L = w < 0.1 ? 0.1 : w < 0.5 ? 0.22 : w < 1.5 ? 0.32 : 0.48;
    if (d.weapon && d.weapon.kind !== 'firearm' && d.weapon.kind !== 'thrown') L = Math.max(L, Math.min(1.2, d.weapon.range * 0.45));
    M = L * 0.5; S = M * 0.5;
  }
  let h = L <= 0.13 ? 1 : L <= 0.34 ? 2 : L <= 0.52 ? 3 : L <= 0.95 ? 4 : 5;
  let w = M <= 0.2 ? 1 : M <= 0.36 ? 2 : 3;
  // paper-thin light things fold or roll up
  if (S < 0.015 && d.weight < 0.4) { h = Math.min(h, 2); w = 1; }
  // folded clothes of some bulk
  if (d.cat === 'clothing' && d.weight >= 0.5) { w = Math.max(w, 2); h = Math.max(h, 2); }
  // dense heavy things are bulky too (up to six cells)
  const minA = Math.min(6, Math.ceil(d.weight / 1.6));
  while (w * h < minA) { if (w < h) w++; else h++; }
  if (d.bag) { w = Math.max(w, 2); h = Math.max(h, 2); }
  return [Math.min(w, h), Math.max(w, h)];
}

// ================================================================ stacks
const stackCache = new Map<string, number>();
const TINY_TAGS = new Set(['nails', 'screws', 'fuse', 'battery', 'spring', 'coins', 'needle', 'thread', 'glass_shard', 'zipties', 'bait', 'shard', 'collectible', 'dice', 'chalk']);

/** how many of an item kind share one cell */
export function stackMax(key: string): number {
  let n = stackCache.get(key);
  if (n !== undefined) return n;
  const d = itemDef(key);
  const [w, h] = baseFootprint(key);
  if (d.noStack || d.bag || d.weapon || d.clothing || d.durability || d.fluidCap || d.light || d.radio || d.heavy || d.battery || w * h > 2) n = 1;
  else if (d.cat === 'ammo') n = 10;
  else if (d.cat === 'seed' || (d.tags || []).some((t) => TINY_TAGS.has(t))) n = 12;
  else if (d.medical || d.food?.pills) n = 6;
  else if (d.cat === 'food' || d.cat === 'drink') n = d.weight <= 0.15 ? 6 : d.weight <= 0.5 ? 3 : 1;
  else if (d.cat === 'lore' || d.cat === 'literature') n = d.literature?.skill ? 1 : 5;
  else n = d.weight <= 0.1 ? 8 : d.weight <= 0.3 ? 4 : d.weight <= 1 ? 2 : 1;
  stackCache.set(key, n);
  return n;
}

/** items with their own state never stack */
export function isSolo(it: Item): boolean {
  const d = itemDef(it.key);
  return !!it.inv || !!it.name || (!!d.fluidCap && !!it.fluid && it.fluid.amount > 0.001) || (it.eaten ?? 0) > 0 || (it.cooked ?? 0) > 0
    || (it.ammo ?? 0) > 0 || !!(it.data && Object.keys(it.data).length) || (it.bloody ?? 0) > 0.3 || stackMax(it.key) <= 1;
}
export function canStack(a: Item, b: Item): boolean {
  if (a === b) return true;
  if (a.key !== b.key || isSolo(a) || isSolo(b)) return false;
  return freshness(a) === freshness(b) && ((a.frozen ?? 0) > 0.5) === ((b.frozen ?? 0) > 0.5) && ((a.wet ?? 0) > 0.5) === ((b.wet ?? 0) > 0.5);
}

// ================================================================ who wears what
/** worn or held by the local survivor: lives on the body, not in a grid */
export function isEquipped(it: Item): boolean {
  const p = G?.local;
  if (!p) return false;
  return p.handR === it || p.handL === it || p.isWorn(it);
}

// ================================================================ grid specs
const specCache = new WeakMap<Container, GridSpec>();
const SLOT_ORDER = ['fullsuit', 'pants', 'jacket', 'shirt', 'sweater', 'tshirt', 'hat', 'eyes', 'mask', 'neck', 'hands', 'socks', 'shoes', 'back', 'belt', 'wrist',
  'head', 'face', 'torso_inner', 'torso', 'torso_outer', 'legs', 'feet'];

let bagByName: Map<string, string> | null = null;
function bagKeyFor(c: Container): string | undefined {
  if (!bagByName) {
    bagByName = new Map();
    for (const d of allItemDefs()) if (d.bag) bagByName.set(d.name, d.key);
  }
  let k = bagByName.get(c.name);
  if (!k) { for (const d of allItemDefs()) if (d.bag && d.name === c.name) { k = d.key; bagByName.set(d.name, k); break; } }
  return k;
}

function buildRi(w: number, h: number, regions: Region[]): Int16Array {
  const ri = new Int16Array(Math.max(1, w * h)).fill(-1);
  regions.forEach((r, i) => { for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (x < w && y < h) ri[y * w + x] = i; });
  return ri;
}
function makeSpec(w: number, h: number, regions: Region[], style: string, label: string, sig: string, extra: Partial<GridSpec> = {}): GridSpec {
  return { w, h, regions, ri: buildRi(w, h, regions), style, label, sig, ...extra };
}

/** the player whose pockets a 'main' container is */
function playerOf(c: Container): any | null {
  const g = G as any;
  if (!g) return null;
  if (g.local?.inv === c) return g.local;
  if (g.players) for (const p of g.players.values()) if (p.inv === c) return p;
  return null;
}

/** the pockets: one small region per pocket on every garment worn */
function pocketSpec(c: Container): GridSpec | null {
  const p = playerOf(c);
  if (!p) return null;
  const worn: [string, Item][] = [...p.worn.entries()];
  const sig = 'P|' + worn.map(([s, it]) => s + ':' + it.key + ':' + it.uid).join(',');
  const old = specCache.get(c);
  if (old && old.sig === sig) return old;
  const regions: Region[] = [];
  for (const [slot, it] of worn) {
    const defs = POCKETS_BY_KEY[it.key] ?? POCKETS_BY_SLOT[slot] ?? [];
    let si = SLOT_ORDER.indexOf(slot);
    if (si < 0) si = SLOT_ORDER.length;
    defs.forEach((pd, i) => regions.push({ x: si * 16 + i * 4, y: 0, w: pd.w, h: pd.h, id: slot + ':' + pd.id, label: pd.label, slot, pocket: pd.id, garment: it.uid }));
  }
  let w = 1, h = 1;
  for (const r of regions) { w = Math.max(w, r.x + r.w); h = Math.max(h, r.y + r.h); }
  const spec = makeSpec(w, h, regions, 'pocket', 'pockets', sig);
  specCache.set(c, spec);
  return spec;
}

/** a bag's interior: hand-sized table or from its capacity */
function bagSpec(c: Container): GridSpec {
  const key = bagKeyFor(c) || '';
  const sig = 'B|' + key + '|' + c.capacity;
  const old = specCache.get(c);
  if (old && old.sig === sig) return old;
  let dims = BAG_GRID[key];
  if (!dims) {
    const area = clampI(c.capacity * 2.4, 4, 64);
    const w = clampI(Math.sqrt(area * 1.2), 2, 9);
    dims = [w, clampI(Math.ceil(area / w), 2, 8)];
  }
  const spec = makeSpec(dims[0], dims[1], [{ x: 0, y: 0, w: dims[0], h: dims[1], id: 'bag', label: c.name }], 'canvas', c.name, sig, { bagKey: key });
  specCache.set(c, spec);
  return spec;
}

/** furniture, vehicles, corpses: sized from capacity, shaped like what they are */
function worldSpec(c: Container): GridSpec {
  const sig = 'W|' + c.kind + '|' + c.capacity;
  const old = specCache.get(c);
  if (old && old.sig === sig) return old;
  const shape = KIND_SHAPE[c.kind] || { aspect: 1.4, style: 'wood', label: c.kind };
  const area = clampI(6 + Math.sqrt(Math.max(0, c.capacity)) * 5.2, 6, 60);
  let w = clampI(Math.sqrt(area * shape.aspect), 2, 10);
  let h = clampI(Math.ceil(area / w), 2, 7);
  const regions: Region[] = [];
  const shelves = shape.shelves && h >= 4 ? Math.min(shape.shelves, Math.floor(h / 2)) : 1;
  if (shelves > 1) {
    // equal shelves, the leftover rows go to the bottom one
    const sh = Math.floor(h / shelves);
    let y = 0;
    for (let i = 0; i < shelves; i++) {
      const hh = i === shelves - 1 ? h - y : sh;
      regions.push({ x: 0, y, w, h: hh, id: 'shelf' + i, label: shape.label });
      y += hh;
    }
  } else regions.push({ x: 0, y: 0, w, h, id: 'all', label: shape.label });
  if (c.kind === 'trunk') { w = Math.max(w, 6); h = Math.min(h, 5); regions.length = 0; regions.push({ x: 0, y: 0, w, h, id: 'all', label: 'trunk' }); }
  const spec = makeSpec(w, h, regions, shape.style, shape.label, sig);
  specCache.set(c, spec);
  return spec;
}

/** the floor around you: as big as it needs to be, laid out fresh each look */
export function floorSpec(items: Item[]): GridSpec {
  let area = 0;
  for (const it of items) { const [w, h] = footprintOf(it); area += w * h; }
  const w = 8, h = clampI(Math.max(4, Math.ceil(area * 1.25 / w) + 1), 4, 12);
  return makeSpec(w, h, [{ x: 0, y: 0, w, h, id: 'floor', label: 'floor' }], 'floor', 'floor', 'F|' + h, { transient: true });
}

/** the grid of a container (null = not known yet, e.g. pockets of a survivor still being dressed) */
export function gridSpec(c: Container): GridSpec | null {
  if (c.kind === 'main') return pocketSpec(c);
  if (c.kind === 'floor') return floorSpec(c.items);
  if (c.kind === 'bag' || c.owner.startsWith('item:')) return bagSpec(c);
  return worldSpec(c);
}

// ================================================================ occupancy
export interface Anchor { gx: number; gy: number; w: number; h: number; rot: Rot; items: Item[] }
export interface Occ { spec: GridSpec; cells: Int32Array; anchors: Anchor[]; bad: Item[] }
export type PosFn = (it: Item) => Placement | undefined;
const posOfItem: PosFn = (it) => (it.gx === undefined || it.gy === undefined ? undefined : { gx: it.gx, gy: it.gy, rot: (it.rot ?? 0) as Rot });

function freeRect(spec: GridSpec, cells: Int32Array, gx: number, gy: number, w: number, h: number): boolean {
  if (gx < 0 || gy < 0 || gx + w > spec.w || gy + h > spec.h) return false;
  const r0 = spec.ri[gy * spec.w + gx];
  if (r0 < 0) return false;
  for (let y = gy; y < gy + h; y++) for (let x = gx; x < gx + w; x++) {
    const i = y * spec.w + x;
    if (spec.ri[i] !== r0 || cells[i] !== 0) return false;
  }
  return true;
}

/** which cells are taken, by which stack; items without a valid spot end up in `bad` */
export function occupancy(items: Item[], spec: GridSpec, skip?: Set<Item> | null, pos: PosFn = posOfItem): Occ {
  const cells = new Int32Array(spec.w * spec.h);
  for (let i = 0; i < cells.length; i++) cells[i] = spec.ri[i] < 0 ? -1 : 0;
  const anchors: Anchor[] = [];
  const bad: Item[] = [];
  for (const it of items) {
    if (skip?.has(it) || isEquipped(it)) continue;
    const p = pos(it);
    if (!p) { bad.push(it); continue; }
    const [w, h] = dimsOf(it, p.rot);
    const at = p.gx >= 0 && p.gy >= 0 && p.gx < spec.w && p.gy < spec.h ? cells[p.gy * spec.w + p.gx] : -1;
    if (at > 0) {
      const a = anchors[at - 1];
      if (a.gx === p.gx && a.gy === p.gy && a.rot === p.rot && canStack(a.items[0], it) && a.items.length < stackMax(it.key)) { a.items.push(it); continue; }
    }
    if (!freeRect(spec, cells, p.gx, p.gy, w, h)) { bad.push(it); continue; }
    anchors.push({ gx: p.gx, gy: p.gy, w, h, rot: p.rot, items: [it] });
    const n = anchors.length;
    for (let y = p.gy; y < p.gy + h; y++) for (let x = p.gx; x < p.gx + w; x++) cells[y * spec.w + x] = n;
  }
  return { spec, cells, anchors, bad };
}
export function containerOcc(c: Container, skip?: Set<Item> | null): Occ | null {
  const spec = gridSpec(c);
  return spec ? occupancy(c.items, spec, skip) : null;
}

/** the stack at a cell (or null) */
export function anchorAt(occ: Occ, x: number, y: number): Anchor | null {
  if (x < 0 || y < 0 || x >= occ.spec.w || y >= occ.spec.h) return null;
  const n = occ.cells[y * occ.spec.w + x];
  return n > 0 ? occ.anchors[n - 1] : null;
}

export type Fit = 'free' | 'stack' | 'blocked';
/** can `count` of this item go at gx/gy/rot? */
export function testFit(occ: Occ, it: Item, gx: number, gy: number, rot: Rot, count = 1): Fit {
  const spec = occ.spec;
  const [w, h] = dimsOf(it, rot);
  if (gx >= 0 && gy >= 0 && gx < spec.w && gy < spec.h) {
    const n = occ.cells[gy * spec.w + gx];
    if (n > 0) {
      const a = occ.anchors[n - 1];
      if (a.gx === gx && a.gy === gy && a.w === w && a.h === h && canStack(a.items[0], it) && a.items.length + count <= stackMax(it.key)) return 'stack';
    }
  }
  return freeRect(spec, occ.cells, gx, gy, w, h) ? 'free' : 'blocked';
}

/** first spot that takes `count` of the item: an open stack of its kind, then the first free cell (both orientations) */
export function findSpot(occ: Occ, it: Item, count = 1, prefer?: Rot): Placement | null {
  if (!isSolo(it) && stackMax(it.key) >= count + 1) {
    for (const a of occ.anchors) if (canStack(a.items[0], it) && a.items.length + count <= stackMax(it.key)) return { gx: a.gx, gy: a.gy, rot: a.rot };
  }
  const [w0, h0] = footprintOf(it);
  const rots: Rot[] = w0 === h0 ? [0] : prefer === 1 ? [1, 0] : [0, 1];
  const spec = occ.spec;
  for (const r of spec.regions) {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
      if (occ.cells[y * spec.w + x] !== 0) continue;
      for (const rot of rots) {
        const [w, h] = rot ? [h0, w0] : [w0, h0];
        if (freeRect(spec, occ.cells, x, y, w, h)) return { gx: x, gy: y, rot };
      }
    }
  }
  return null;
}

/** mark a placement in an occupancy (so several items can be fitted in a row) */
export function claim(occ: Occ, it: Item, p: Placement) {
  const spec = occ.spec;
  const n0 = p.gx >= 0 && p.gy >= 0 && p.gx < spec.w && p.gy < spec.h ? occ.cells[p.gy * spec.w + p.gx] : -1;
  if (n0 > 0) { const a = occ.anchors[n0 - 1]; if (a.gx === p.gx && a.gy === p.gy) { a.items.push(it); return; } }
  const [w, h] = dimsOf(it, p.rot);
  occ.anchors.push({ gx: p.gx, gy: p.gy, w, h, rot: p.rot, items: [it] });
  const n = occ.anchors.length;
  for (let y = p.gy; y < p.gy + h; y++) for (let x = p.gx; x < p.gx + w; x++) if (x < spec.w && y < spec.h) occ.cells[y * spec.w + x] = n;
}

export function setPlace(it: Item, p: Placement | null | undefined) {
  if (p) { it.gx = p.gx; it.gy = p.gy; it.rot = p.rot; }
  else { delete it.gx; delete it.gy; delete it.rot; }
}

/** is the item's stored spot in this container valid (ignoring itself)? */
export function placementValid(c: Container, it: Item): boolean {
  if (it.gx === undefined || it.gy === undefined) return false;
  const occ = containerOcc(c, new Set([it]));
  if (!occ) return true;
  return testFit(occ, it, it.gx, it.gy, (it.rot ?? 0) as Rot) !== 'blocked';
}

/** a spot for the item in this container right now (null = full / no grid yet) */
export function spotIn(c: Container, it: Item, count = 1, skip?: Set<Item>): Placement | null {
  const occ = containerOcc(c, skip ?? new Set([it]));
  if (!occ) return null;
  return findSpot(occ, it, count);
}

/** weight a bag will take before the seams give (twice its rating) */
export function weightOk(c: Container, it: Item): boolean {
  if (c.kind !== 'bag' && !c.owner.startsWith('item:')) return true;
  if (c.items.includes(it)) return true;
  return c.contentWeight() + itemWeight(it) <= c.capacity * 2 + 1e-6;
}

// ================================================================ packing
const PACK_ORDERS: ((a: Item, b: Item) => number)[] = [
  (a, b) => { const [aw, ah] = footprintOf(a), [bw, bh] = footprintOf(b); return bw * bh - aw * ah || Math.max(bw, bh) - Math.max(aw, ah) || a.key.localeCompare(b.key) || a.uid - b.uid; },
  (a, b) => { const [aw, ah] = footprintOf(a), [bw, bh] = footprintOf(b); return Math.max(bw, bh) - Math.max(aw, ah) || bw * bh - aw * ah || a.key.localeCompare(b.key) || a.uid - b.uid; },
  (a, b) => { const [aw, ah] = footprintOf(a), [bw, bh] = footprintOf(b); return Math.min(bw, bh) - Math.min(aw, ah) || bw * bh - aw * ah || a.key.localeCompare(b.key) || a.uid - b.uid; },
];

/** lay out a list of items on a spec from scratch; returns the layout and what didn't fit */
export function packLayout(items: Item[], spec: GridSpec, order = 0, preferRot: Rot = 0): { at: Map<Item, Placement>; overflow: Item[] } {
  const at = new Map<Item, Placement>();
  const overflow: Item[] = [];
  const occ = occupancy([], spec);
  const list = items.filter((it) => !isEquipped(it)).sort(PACK_ORDERS[order % PACK_ORDERS.length]);
  for (const it of list) {
    const p = findSpot(occ, it, 1, preferRot);
    if (!p) { overflow.push(it); continue; }
    claim(occ, it, p);
    at.set(it, p);
  }
  return { at, overflow };
}

/**
 * Shake the container: re-pack everything tightly. Tries a few orders and
 * keeps the first that fits everything; if none does, nothing moves.
 */
export function autoPack(c: Container): boolean {
  const spec = gridSpec(c);
  if (!spec) return false;
  const items = c.items.filter((it) => !isEquipped(it));
  // items already overflowing stay overflowing if packing can't help them
  let best: { at: Map<Item, Placement>; overflow: Item[] } | null = null;
  for (let o = 0; o < PACK_ORDERS.length * 2; o++) {
    const r = packLayout(items, spec, o, (o >= PACK_ORDERS.length ? 1 : 0) as Rot);
    if (!best || r.overflow.length < best.overflow.length) best = r;
    if (!r.overflow.length) break;
  }
  if (!best) return false;
  const before = occupancy(c.items, spec).bad.length;
  if (best.overflow.length > before) return false;
  for (const it of items) setPlace(it, best.at.get(it));
  return best.overflow.length === 0;
}

// ================================================================ container hooks
let installed = false;
/** make every Container place what it is given (installed once, by whoever imports the grid first) */
export function installGrid() {
  if (installed) return;
  installed = true;
  Container.placer = (c, it) => {
    if (c.kind === 'floor' || isEquipped(it)) return;
    const spec = gridSpec(c);
    if (!spec || spec.transient) return;
    const occ = occupancy(c.items, spec, new Set([it]));
    if (it.gx !== undefined && it.gy !== undefined && testFit(occ, it, it.gx, it.gy, (it.rot ?? 0) as Rot) !== 'blocked') return;
    setPlace(it, findSpot(occ, it));
  };
  Container.fitter = (c, it) => {
    if (c.kind === 'floor') return true;
    const spec = gridSpec(c);
    if (!spec) return c.contentWeight() + itemWeight(it) <= c.capacity + 1e-6;
    return weightOk(c, it) && !!findSpot(occupancy(c.items, spec, new Set([it])), it);
  };
}
installGrid();
