// Debris: how furniture comes apart. Every object model is rebuilt once with
// a recording ModelBuilder that remembers which primitive made which
// triangles; big boards and cushions are re-cut into smaller slabs (same
// texture, same world-scale UVs, so the grain carries across the break),
// glass panes shatter into triangular shards, tiny bits are merged, and the
// result is a set of rigid pieces. A small deterministic rigid-body sim
// (fixed 60 Hz step, seeded RNG, plain arithmetic only) throws them about:
// gravity, bounces, friction, walls, a coarse height map so pieces pile on top
// of each other, and a roll onto their flattest side. Every peer runs the
// same sim from the same seed, so everybody sees the same heap; its final
// arrangement becomes the geometry of the 'debris_pile' object left behind.
//
// Also here: damaged object geometry (dents, scuffs: a variant of the cached
// object geometry) and the crack / tear / dent overlays drawn on damaged
// furniture.
import * as THREE from 'three';
import { ModelBuilder, TexSpec, PrimOpts } from '../gfx/modelBuilder';
import { atlas } from '../gfx/atlas';
import { Rng, hash3 } from '../core/rng';
import type { ObjDef } from './objects';
import type { Zone, TileObject, ObjState } from './zone';

// ---------------------------------------------------------------- materials
export type Mat = 'wood' | 'metal' | 'plastic' | 'fabric' | 'glass' | 'ceramic' | 'paper' | 'flesh' | 'elec';

const MAT_RX: [RegExp, Mat][] = [
  [/(crt_body|term_body|bakelite|q_pvc)/, 'plastic'],
  [/(glass|mirror|crt|screen|tv_bars|lens|bulb|bottle|window|aquarium)/, 'glass'],
  [/(fabric|cloth|cushion|afghan|quilt|pillow|mattress|curtain|carpet|rug|lace|denim|jacket|towel|felt|speaker_cloth|plush|sheet|leather|velvet|upholst|duvet|blanket|straw|foam)/, 'fabric'],
  [/(led_|circuit|pcb|server|keyboard|computer|monitor|render_core|elec)/, 'elec'],
  [/(paper|book|cardboard|label|poster|newspaper|magazine|map_|calendar)/, 'paper'],
  [/(porcelain|ceramic|marble|tile|stone|concrete|rock|plaster|brick|granite|terrazzo)/, 'ceramic'],
  [/(wax|flesh|skin|meat|gore_)/, 'flesh'],
  [/(metal|steel|chrome|brass|iron|pipe|galv|grille|rust|tin|alum|vent|toolchest|mailbox|hydrant|wire|copper|radiator|locker|drawer|hazard|scrap)/, 'metal'],
  [/(wood|oak|plank|pallet|bark|log|trim|pine|walnut|cork|crate|formica|veneer|bamboo|wicker)/, 'wood'],
  [/(plastic|rubber|vinyl|acrylic|nylon|toy|lego)/, 'plastic'],
];
const texMatCache = new Map<string, Mat | null>();
/** material of a texture by its name (null = unknown) */
export function texMat(tex: string): Mat | null {
  let m = texMatCache.get(tex);
  if (m !== undefined) return m;
  m = null;
  for (const [rx, k] of MAT_RX) if (rx.test(tex)) { m = k; break; }
  texMatCache.set(tex, m);
  return m;
}

/** an object's main material (its sound, tags and key) */
export function objMat(d: ObjDef): Mat {
  const t = d.tags || [];
  if (d.key.startsWith('replica_') || t.includes('replica')) return 'flesh';
  if (t.includes('electronics') || t.includes('tv') || t.includes('computer') || t.includes('terminal') || t.includes('server') || d.light?.kind === 'screen') return 'elec';
  switch (d.sound) {
    case 'wood': return 'wood';
    case 'metal': return 'metal';
    case 'plastic': return 'plastic';
    case 'fabric': return 'fabric';
    case 'glass': return 'glass';
    case 'ceramic': return 'ceramic';
    case 'paper': return 'paper';
    case 'flesh': return 'flesh';
  }
  return texMat(d.key) ?? 'wood';
}

/** kg per cubic metre of bounding box (furniture is mostly air) */
const DENSITY: Record<Mat, number> = { wood: 160, metal: 420, plastic: 90, fabric: 70, glass: 260, ceramic: 380, paper: 120, flesh: 300, elec: 220 };
/** hit points per material before size scaling */
const BASE_HP: Record<Mat, number> = { wood: 42, metal: 115, plastic: 26, fabric: 48, glass: 12, ceramic: 20, paper: 12, flesh: 30, elec: 30 };

export function objVolume(d: ObjDef): number { return (d.w ?? 1) * (d.d ?? 1) * Math.max(0.15, d.height); }
export function objMaxHp(d: ObjDef): number {
  if (d.hp) return d.hp;
  const v = objVolume(d);
  return Math.round(BASE_HP[objMat(d)] * Math.min(2.4, Math.max(0.45, 0.55 + v * 0.62)));
}
/** estimated mass in kg (declared movable weight wins) */
export function objMass(d: ObjDef): number {
  if (d.movable) return d.movable;
  return Math.round(Math.min(900, Math.max(4, objVolume(d) * DENSITY[objMat(d)] * 0.55)));
}

/** average colour of a texture (particles) */
export function texAvg(tex: string): number { try { return atlas().get(tex).avg; } catch { return 0x888888; } }

const objColCache = new Map<string, number>();
/** the colour an object mostly is (its biggest surface's texture): chips and dust take it */
export function objColor(d: ObjDef): number {
  let c = objColCache.get(d.key);
  if (c !== undefined) return c;
  c = 0x8a8478;
  try {
    const rb = new RecBuilder();
    d.model(rb, {}, undefined);
    let best = 0;
    for (const r of rb.recs) { const n = r.i1 - r.i0; if (n > best && r.tex && r.tex !== 'white') { best = n; c = texAvg(r.tex); } }
  } catch { /* keep the default */ }
  objColCache.set(d.key, c);
  return c;
}

// ---------------------------------------------------------------- recording builder
interface Rec {
  kind: 'box' | 'other';
  i0: number; i1: number;
  tex: string;
  mat: Mat | null;
  box?: { x: number; y: number; z: number; w: number; h: number; d: number; spec: TexSpec; opts: PrimOpts; m: THREE.Matrix4 };
}

function specTex(spec: TexSpec): string {
  if (typeof spec === 'string') return spec;
  return spec.all || spec.sides || spec.south || spec.top || spec.north || spec.east || 'white';
}

/** ModelBuilder that remembers which top-level primitive produced which triangles */
class RecBuilder extends ModelBuilder {
  recs: Rec[] = [];
  private depth = 0;
  private rec(kind: Rec['kind'], tex: string, fn: () => void, box?: Rec['box']) {
    const i0 = (this as any).idx.length as number;
    this.depth++;
    try { fn(); } finally { this.depth--; }
    if (this.depth === 0) {
      const i1 = (this as any).idx.length as number;
      if (i1 > i0) this.recs.push({ kind, i0, i1, tex, mat: texMat(tex), box });
    }
  }
  box(x: number, y: number, z: number, w: number, h: number, d: number, tex: TexSpec, o: PrimOpts = {}) {
    const top = this.depth === 0;
    this.rec('box', specTex(tex), () => { super.box(x, y, z, w, h, d, tex, o); },
      top ? { x, y, z, w, h, d, spec: tex, opts: o, m: (this as any).m.clone() } : undefined);
    return this;
  }
  cylinder(x: number, y: number, z: number, r: number, h: number, segs: number, tex: TexSpec, o: any = {}) { this.rec('other', specTex(tex), () => { super.cylinder(x, y, z, r, h, segs, tex, o); }); return this; }
  sphere(x: number, y: number, z: number, r: number, segs: number, rings: number, tex: string, o: any = {}) { this.rec('other', tex, () => { super.sphere(x, y, z, r, segs, rings, tex, o); }); return this; }
  flat(x: number, y: number, z: number, w: number, d: number, tex: string, o: any = {}) { this.rec('other', tex, () => { super.flat(x, y, z, w, d, tex, o); }); return this; }
  cross(x: number, y: number, z: number, w: number, h: number, tex: string, o: any = {}) { this.rec('other', tex, () => { super.cross(x, y, z, w, h, tex, o); }); return this; }
  panel(x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, tex: string, o: PrimOpts = {}) { this.rec('other', tex, () => { super.panel(x0, z0, x1, z1, y0, y1, tex, o); }); return this; }
  wedge(x: number, y: number, z: number, w: number, d: number, h0: number, h1: number, tex: TexSpec, o: PrimOpts = {}) { this.rec('other', specTex(tex), () => { super.wedge(x, y, z, w, d, h0, h1, tex, o); }); return this; }
  quadRaw(p: number[][], uvs: number[][], tex: string, color = 0xffffff, shade = 1, emis = 0, sway = 0, normal?: number[]) { this.rec('other', tex, () => { super.quadRaw(p, uvs, tex, color, shade, emis, sway, normal); }); }
  triRaw(p: number[][], uvs: number[][], tex: string, color = 0xffffff, shade = 1, emis = 0, sway = 0) { this.rec('other', tex, () => { super.triRaw(p, uvs, tex, color, shade, emis, sway); }); }
}

// ---------------------------------------------------------------- pieces
/** raw vertex soup of one piece, model space */
interface Soup { pos: number[]; nor: number[]; uv: number[]; col: number[]; atl: number[]; fx: number[]; idx: number[]; mat: Mat; tex: string }

export interface Piece {
  geo: THREE.BufferGeometry;
  /** model-space centre (the geometry is centred on it) */
  c: THREE.Vector3;
  half: THREE.Vector3;
  mat: Mat;
  tex: string;
  mass: number;
}

function soupOf(b: ModelBuilder, i0: number, i1: number, mat: Mat, tex: string): Soup {
  const B = b as any;
  const s: Soup = { pos: [], nor: [], uv: [], col: [], atl: [], fx: [], idx: [], mat, tex };
  const map = new Map<number, number>();
  for (let k = i0; k < i1; k++) {
    const v = B.idx[k] as number;
    let n = map.get(v);
    if (n === undefined) {
      n = s.pos.length / 3; map.set(v, n);
      s.pos.push(B.pos[v * 3], B.pos[v * 3 + 1], B.pos[v * 3 + 2]);
      s.nor.push(B.nor[v * 3], B.nor[v * 3 + 1], B.nor[v * 3 + 2]);
      s.uv.push(B.uv[v * 2], B.uv[v * 2 + 1]);
      s.col.push(B.col[v * 3], B.col[v * 3 + 1], B.col[v * 3 + 2]);
      s.atl.push(B.atl[v * 4], B.atl[v * 4 + 1], B.atl[v * 4 + 2], B.atl[v * 4 + 3]);
      s.fx.push(B.fx[v * 2], 0);
    }
    s.idx.push(n);
  }
  return s;
}
function soupAll(b: ModelBuilder, mat: Mat, tex: string): Soup { return soupOf(b, 0, (b as any).idx.length, mat, tex); }
function mergeSoup(a: Soup, b: Soup) {
  const base = a.pos.length / 3;
  a.pos.push(...b.pos); a.nor.push(...b.nor); a.uv.push(...b.uv); a.col.push(...b.col); a.atl.push(...b.atl); a.fx.push(...b.fx);
  for (const i of b.idx) a.idx.push(i + base);
}
function soupBox(s: Soup): THREE.Box3 {
  const bx = new THREE.Box3();
  const v = new THREE.Vector3();
  for (let i = 0; i < s.pos.length; i += 3) bx.expandByPoint(v.set(s.pos[i], s.pos[i + 1], s.pos[i + 2]));
  return bx;
}
function soupGeo(s: Soup, c: THREE.Vector3): THREE.BufferGeometry {
  const P = new Float32Array(s.pos.length);
  for (let i = 0; i < s.pos.length; i += 3) { P[i] = s.pos[i] - c.x; P[i + 1] = s.pos[i + 1] - c.y; P[i + 2] = s.pos[i + 2] - c.z; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(s.nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(s.uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(s.col, 3));
  g.setAttribute('aAtlas', new THREE.Float32BufferAttribute(s.atl, 4));
  g.setAttribute('aFx', new THREE.Float32BufferAttribute(s.fx, 2));
  g.setIndex(s.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(s.idx, 1) : new THREE.Uint16BufferAttribute(s.idx, 1));
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}

/** what the inside of a broken board / cushion / panel looks like */
const INTERIOR: Record<Mat, string> = { wood: 'dbr_splinter', fabric: 'dbr_stuffing', paper: 'dbr_paper', metal: 'metal_grey', plastic: '', ceramic: 'porcelain', elec: 'dbr_pcb', glass: '', flesh: 'dbr_wax' };
const FACES = ['top', 'bottom', 'north', 'south', 'east', 'west'] as const;
function faceTexOf(spec: TexSpec, f: typeof FACES[number]): string {
  if (typeof spec === 'string') return spec;
  if (spec[f]) return spec[f]!;
  if (f !== 'top' && f !== 'bottom' && spec.sides) return spec.sides;
  return spec.all || 'white';
}

/** a ragged sub-box cut out of a recorded box (same spec, same transform: the texture carries across the cut; cut faces show the raw inside) */
function subBox(r: NonNullable<Rec['box']>, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, mat: Mat, tex: string, rng: Rng, shrink: number): Soup {
  const nb = new ModelBuilder();
  (nb as any).m.copy(r.m);
  const sx = (x1 - x0) * shrink * rng.float(0, 1), sz = (z1 - z0) * shrink * rng.float(0, 1), sy = (y1 - y0) * shrink * rng.float(0, 0.6);
  const e = 1e-4;
  const bx0 = r.x - r.w / 2, bx1 = r.x + r.w / 2, bz0 = r.z - r.d / 2, bz1 = r.z + r.d / 2;
  const inner: Record<string, boolean> = { west: x0 > bx0 + e, east: x1 < bx1 - e, bottom: y0 > r.y + e, top: y1 < r.y + r.h - e, north: z0 > bz0 + e, south: z1 < bz1 - e };
  const cx = (x0 + x1) / 2, cy = y0 + sy * 0.5, cz = (z0 + z1) / 2, w = x1 - x0 - sx, h = y1 - y0 - sy, d = z1 - z0 - sz;
  const it = INTERIOR[mat];
  const cut = FACES.filter((f) => inner[f]);
  if (!it || !cut.length) { nb.box(cx, cy, cz, w, h, d, r.spec, r.opts); return soupAll(nb, mat, tex); }
  // the outside as it was (minus the cut faces), then the cut faces in raw material, untinted
  const skip = [...(r.opts.skip || []), ...cut] as any;
  nb.box(cx, cy, cz, w, h, d, r.spec, { ...r.opts, skip });
  const keep = FACES.filter((f) => !inner[f]) as any;
  nb.box(cx, cy, cz, w, h, d, it, { skip: keep, uvOffset: [rng.float(0, 1), rng.float(0, 1)] });
  void faceTexOf;
  return soupAll(nb, mat, tex);
}

/** glass pane → a fan of triangular shards (thin prisms) */
function shardSoups(r: NonNullable<Rec['box']>, rng: Rng, tex: string): Soup[] {
  const out: Soup[] = [];
  const { x, y, z, w, h, d } = r;
  // the pane's plane: its two largest dims
  const dims = [w, h, d];
  const thin = dims.indexOf(Math.min(w, h, d));
  const ax = thin === 0 ? 1 : 0, ay = thin === 2 ? 1 : 2; // two in-plane axes (0 x, 1 y, 2 z)
  const L = (a: number) => (a === 0 ? w : a === 1 ? h : d);
  const C = (a: number) => (a === 0 ? x : a === 1 ? y + h / 2 : z);
  const n = Math.max(3, Math.min(7, Math.round((L(ax) * L(ay)) / 0.05)));
  // impact point somewhere inside, rays out to the rim
  const cu = rng.float(-0.25, 0.25) * L(ax), cv = rng.float(-0.25, 0.25) * L(ay);
  const rim: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const t = (i + rng.float(0.2, 0.8)) / n;
    // walk the rectangle perimeter
    const P = 2 * (L(ax) + L(ay)), s = t * P;
    let u: number, v: number;
    if (s < L(ax)) { u = -L(ax) / 2 + s; v = -L(ay) / 2; }
    else if (s < L(ax) + L(ay)) { u = L(ax) / 2; v = -L(ay) / 2 + (s - L(ax)); }
    else if (s < 2 * L(ax) + L(ay)) { u = L(ax) / 2 - (s - L(ax) - L(ay)); v = L(ay) / 2; }
    else { u = -L(ax) / 2; v = L(ay) / 2 - (s - 2 * L(ax) - L(ay)); }
    rim.push([u, v]);
  }
  const th = Math.max(0.006, Math.min(w, h, d));
  for (let i = 0; i < n; i++) {
    const a = rim[i], b = rim[(i + 1) % n];
    const nb = new ModelBuilder();
    (nb as any).m.copy(r.m);
    const P3 = (u: number, v: number, o: number) => {
      const q = [0, 0, 0]; q[ax] = C(ax) + u; q[ay] = C(ay) + v; q[thin] = C(thin) + o; return q;
    };
    const p0 = P3(cu, cv, th / 2), p1 = P3(a[0], a[1], th / 2), p2 = P3(b[0], b[1], th / 2);
    const q0 = P3(cu, cv, -th / 2), q1 = P3(a[0], a[1], -th / 2), q2 = P3(b[0], b[1], -th / 2);
    nb.triRaw([p0, p1, p2], [[0.5, 0.5], [0, 0], [1, 0]], tex);
    nb.triRaw([q0, q2, q1], [[0.5, 0.5], [1, 0], [0, 0]], tex);
    nb.quadRaw([p1, q1, q2, p2], [[0, 0], [0, 1], [1, 1], [1, 0]], tex);
    out.push(soupAll(nb, 'glass', tex));
  }
  return out;
}

export interface FractureOpts { max: number; seed: number; mat: Mat }

/**
 * Break an object's model into rigid pieces (model space, centred).
 * Deterministic for (key, state, seed).
 */
export function fracture(d: ObjDef, state: ObjState, o: TileObject | undefined, opts: FractureOpts): Piece[] {
  const rng = new Rng(opts.seed);
  const rb = new RecBuilder();
  try { d.model(rb, state || {}, o); } catch (e) { console.warn('fracture model', d.key, e); }
  const soups: Soup[] = [];
  const covered = new Uint8Array((rb as any).idx.length / 3 + 1);
  for (const r of rb.recs) {
    for (let k = r.i0; k < r.i1; k += 3) covered[k / 3] = 1;
    const mat = r.mat ?? opts.mat;
    if (r.kind === 'box' && r.box) {
      const b = r.box;
      const big = Math.max(b.w, b.h, b.d);
      if (mat === 'glass' && Math.min(b.w, b.h, b.d) < 0.06 && big > 0.12) { soups.push(...shardSoups(b, rng, r.tex)); continue; }
      if (big > 0.5 && mat !== 'glass') {
        // re-cut into slabs along the long axes (grain carries across: same world-scale UVs)
        const cut = (len: number) => Math.max(1, Math.min(mat === 'metal' ? 2 : 4, Math.round(len / (mat === 'fabric' ? 0.5 : 0.42))));
        let nx = cut(b.w), ny = cut(b.h), nz = cut(b.d);
        while (nx * ny * nz > 6) { if (nx >= ny && nx >= nz) nx--; else if (nz >= ny) nz--; else ny--; }
        const splits = (n: number, len: number) => {
          const s = [0];
          for (let i = 1; i < n; i++) s.push(len * (i / n + rng.float(-0.12, 0.12) / n));
          s.push(len);
          return s;
        };
        const sx = splits(nx, b.w), sy = splits(ny, b.h), sz = splits(nz, b.d);
        const x0 = b.x - b.w / 2, z0 = b.z - b.d / 2;
        for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) for (let k = 0; k < nz; k++) {
          soups.push(subBox(b, x0 + sx[i], x0 + sx[i + 1], b.y + sy[j], b.y + sy[j + 1], z0 + sz[k], z0 + sz[k + 1], mat, r.tex, rng, mat === 'metal' ? 0.02 : 0.08));
        }
        continue;
      }
    }
    soups.push(soupOf(rb, r.i0, r.i1, mat, r.tex));
  }
  // anything built without the recorded primitives (append, appendGeometry)
  const total = (rb as any).idx.length;
  let restStart = -1;
  const rest: Soup[] = [];
  for (let t = 0; t <= total / 3; t++) {
    const c = t < total / 3 ? covered[t] : 1;
    if (!c && restStart < 0) restStart = t;
    if (c && restStart >= 0) { rest.push(soupOf(rb, restStart * 3, t * 3, opts.mat, 'white')); restStart = -1; }
  }
  soups.push(...rest);
  // bounds and sizes
  let items = soups.filter((s) => s.idx.length).map((s) => { const bx = soupBox(s); const sz = bx.getSize(new THREE.Vector3()); return { s, bx, vol: Math.max(1e-6, sz.x * sz.y * sz.z), c: bx.getCenter(new THREE.Vector3()) }; });
  // merge tiny bits into their nearest neighbour, then the smallest until under the cap
  const mergeSmallest = (pred: (v: typeof items[number]) => boolean) => {
    items.sort((a, b) => a.vol - b.vol);
    const i = items.findIndex(pred);
    if (i < 0 || items.length < 2) return false;
    const a = items[i];
    let best = -1, bd = Infinity;
    for (let j = 0; j < items.length; j++) { if (j === i) continue; const dd = a.c.distanceToSquared(items[j].c); if (dd < bd) { bd = dd; best = j; } }
    const b = items[best];
    mergeSoup(b.s, a.s);
    b.bx.union(a.bx);
    const sz = b.bx.getSize(new THREE.Vector3());
    b.vol = Math.max(1e-6, sz.x * sz.y * sz.z); b.c = b.bx.getCenter(new THREE.Vector3());
    items.splice(i, 1);
    return true;
  };
  for (let guard = 0; guard < 400 && mergeSmallest((v) => { const s = v.bx.getSize(new THREE.Vector3()); return Math.max(s.x, s.y, s.z) < 0.05; }); guard++);
  for (let guard = 0; guard < 400 && items.length > opts.max && mergeSmallest(() => true); guard++);
  items = items.slice(0, Math.max(1, opts.max));
  return items.map(({ s, bx, c }) => {
    const sz = bx.getSize(new THREE.Vector3()).max(new THREE.Vector3(0.012, 0.012, 0.012));
    return { geo: soupGeo(s, c), c, half: sz.multiplyScalar(0.5), mat: s.mat, tex: s.tex, mass: Math.max(0.05, sz.x * sz.y * sz.z * 8 * DENSITY[s.mat]) };
  });
}

// ---------------------------------------------------------------- extra bits (splinters, stuffing, shards, springs)
const bitGeoCache = new Map<string, THREE.BufferGeometry[]>();
/** small loose bits by material: fresh splinters, stuffing tufts, glass slivers, springs and screws, circuit boards */
export function bitGeos(mat: Mat): THREE.BufferGeometry[] {
  let g = bitGeoCache.get(mat);
  if (g) return g;
  g = [];
  for (let v = 0; v < 4; v++) {
    const mb = new ModelBuilder();
    const r = new Rng(hash3(v, 77, mat.length));
    switch (mat) {
      case 'wood': case 'paper':
        mb.box(0, 0, 0, r.float(0.012, 0.03), r.float(0.008, 0.016), r.float(0.12, 0.34), mat === 'paper' ? 'dbr_paper' : 'dbr_splinter');
        if (v % 2) mb.box(0.02, 0, 0.05, 0.01, 0.01, 0.1, 'dbr_splinter');
        break;
      case 'fabric':
        mb.box(0, 0, 0, 0.09 + v * 0.02, 0.05 + v * 0.01, 0.08, 'dbr_stuffing');
        mb.box(0.03, 0.02, 0.02, 0.06, 0.05, 0.06, 'dbr_stuffing');
        break;
      case 'glass':
        mb.triRaw([[0, 0.004, 0], [0.06 + v * 0.02, 0.004, 0.01], [0.02, 0.004, 0.08 - v * 0.01]], [[0, 0], [1, 0], [0, 1]], 'glass');
        mb.triRaw([[0, 0.004, 0], [0.02, 0.004, 0.08 - v * 0.01], [0.06 + v * 0.02, 0.004, 0.01]], [[0, 0], [0, 1], [1, 0]], 'glass');
        break;
      case 'elec':
        mb.box(0, 0, 0, 0.1 + v * 0.02, 0.008, 0.07, 'dbr_pcb');
        mb.box(0.02, 0.008, 0.01, 0.02, 0.012, 0.015, 'plastic_black');
        mb.cylinderX(0, 0.006, 0.05, 0.004, 0.18, 4, 'dbr_wire');
        break;
      case 'metal':
        if (v % 2) for (let k = 0; k < 4; k++) mb.cylinder(0, k * 0.012, 0, 0.022, 0.006, 6, 'chrome', { caps: false });
        else mb.box(0, 0, 0, 0.14, 0.006, 0.08, 'metal_grey');
        break;
      case 'ceramic': case 'flesh':
        mb.box(0, 0, 0, 0.05 + v * 0.015, 0.02, 0.04, mat === 'flesh' ? 'dbr_wax' : 'porcelain');
        break;
      default:
        mb.box(0, 0, 0, 0.06, 0.012, 0.05, 'plastic_white');
    }
    g.push(mb.build());
  }
  bitGeoCache.set(mat, g);
  return g;
}

// ---------------------------------------------------------------- the rigid-body sim
export interface SimPiece {
  /** world position / rotation now */
  p: THREE.Vector3; q: THREE.Quaternion;
  v: THREE.Vector3; w: THREE.Vector3;
  half: THREE.Vector3;
  rest: boolean;
  /** keyframes every 2 steps: px py pz qx qy qz qw */
  frames: number[];
  bounced: number;
}
export interface SimResult { pieces: SimPiece[]; frames: number; dt: number; landings: { t: number; x: number; z: number; i: number; s: number }[] }

const STEP = 1 / 60;
/** keyframe spacing in steps */
export const KF = 2;

function extentY(q: THREE.Quaternion, h: THREE.Vector3) {
  const x = q.x, y = q.y, z = q.z, w = q.w;
  const r10 = 2 * (x * y + w * z), r11 = 1 - 2 * (x * x + z * z), r12 = 2 * (y * z - w * x);
  return Math.abs(r10) * h.x + Math.abs(r11) * h.y + Math.abs(r12) * h.z;
}
function extentX(q: THREE.Quaternion, h: THREE.Vector3) {
  const x = q.x, y = q.y, z = q.z, w = q.w;
  const r00 = 1 - 2 * (y * y + z * z), r01 = 2 * (x * y - w * z), r02 = 2 * (x * z + w * y);
  return Math.abs(r00) * h.x + Math.abs(r01) * h.y + Math.abs(r02) * h.z;
}
function extentZ(q: THREE.Quaternion, h: THREE.Vector3) {
  const x = q.x, y = q.y, z = q.z, w = q.w;
  const r20 = 2 * (x * z - w * y), r21 = 2 * (y * z + w * x), r22 = 1 - 2 * (x * x + y * y);
  return Math.abs(r20) * h.x + Math.abs(r21) * h.y + Math.abs(r22) * h.z;
}
/** integrate q by angular velocity w over dt (first order, renormalised: no trig) */
function integrateQ(q: THREE.Quaternion, w: THREE.Vector3, dt: number) {
  const hx = w.x * dt * 0.5, hy = w.y * dt * 0.5, hz = w.z * dt * 0.5;
  const x = q.x, y = q.y, z = q.z, ww = q.w;
  q.x = x + (hx * ww + hy * z - hz * y);
  q.y = y + (hy * ww + hz * x - hx * z);
  q.z = z + (hz * ww + hx * y - hy * x);
  q.w = ww + (-hx * x - hy * y - hz * z);
  const l = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w) || 1;
  q.x /= l; q.y /= l; q.z /= l; q.w /= l;
}
const tq = new THREE.Quaternion(), tq2 = new THREE.Quaternion(), tv = new THREE.Vector3();
const UPV = new THREE.Vector3(0, 1, 0), DNV = new THREE.Vector3(0, -1, 0);
/** turn toward resting on the flattest side (nlerp toward the aligned pose) */
function layFlat(q: THREE.Quaternion, h: THREE.Vector3, k: number) {
  const thin = h.x <= h.y && h.x <= h.z ? 0 : h.y <= h.z ? 1 : 2;
  if (thin === 0) tv.set(1 - 2 * (q.y * q.y + q.z * q.z), 2 * (q.x * q.y + q.w * q.z), 2 * (q.x * q.z - q.w * q.y));
  else if (thin === 1) tv.set(2 * (q.x * q.y - q.w * q.z), 1 - 2 * (q.x * q.x + q.z * q.z), 2 * (q.y * q.z + q.w * q.x));
  else tv.set(2 * (q.x * q.z + q.w * q.y), 2 * (q.y * q.z - q.w * q.x), 1 - 2 * (q.x * q.x + q.y * q.y));
  const l = Math.sqrt(tv.x * tv.x + tv.y * tv.y + tv.z * tv.z) || 1;
  tv.x /= l; tv.y /= l; tv.z /= l;
  const target = tv.y >= 0 ? UPV : DNV;
  // shortest arc from tv to target (setFromUnitVectors uses only arithmetic + sqrt)
  tq.setFromUnitVectors(tv, target);
  tq2.copy(tq).multiply(q);
  // nlerp
  const dot = q.x * tq2.x + q.y * tq2.y + q.z * tq2.z + q.w * tq2.w;
  const s = dot < 0 ? -1 : 1;
  q.x += (tq2.x * s - q.x) * k; q.y += (tq2.y * s - q.y) * k; q.z += (tq2.z * s - q.z) * k; q.w += (tq2.w * s - q.w) * k;
  const L = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w) || 1;
  q.x /= L; q.y /= L; q.z /= L; q.w /= L;
}

export interface SimStart { p: THREE.Vector3; q: THREE.Quaternion; v: THREE.Vector3; w: THREE.Vector3; half: THREE.Vector3 }

/** blocking edge between (tx,ty) and its neighbour in direction (dx,dy) */
function blocked(z: Zone, tx: number, ty: number, dx: number, dy: number) {
  if (z.edgeBlocks(tx, ty, dx, dy, 'walk')) return true;
  const nx = tx + dx, ny = ty + dy;
  if (!z.inb(nx, ny) || !z.floor[z.idx(nx, ny)]) return true;
  return false;
}

/**
 * Run the debris sim to rest (or `maxT` seconds). `skip` = tiles whose solid
 * flag should be ignored (the object that just broke). Pure arithmetic: the
 * same inputs give the same heap on every peer.
 */
export function simulate(z: Zone, starts: SimStart[], maxT = 4.5): SimResult {
  const pieces: SimPiece[] = starts.map((s) => ({ p: s.p.clone(), q: s.q.clone(), v: s.v.clone(), w: s.w.clone(), half: s.half.clone(), rest: false, frames: [], bounced: 0 }));
  const hmap = new Map<number, number>();
  const cell = (x: number, zz: number) => (Math.floor(x * 12) & 0xffff) | ((Math.floor(zz * 12) & 0xffff) << 16);
  const stackAt = (x: number, zz: number, ex: number, ez: number) => {
    let top = -1e9;
    const xs = [x, x - ex * 0.6, x + ex * 0.6], zs = [zz, zz - ez * 0.6, zz + ez * 0.6];
    for (const a of xs) for (const b of zs) { const h = hmap.get(cell(a, b)); if (h !== undefined && h > top) top = h; }
    return top;
  };
  const stamp = (sp: SimPiece) => {
    const ex = extentX(sp.q, sp.half), ez = extentZ(sp.q, sp.half), ey = extentY(sp.q, sp.half);
    const top = sp.p.y + ey;
    for (let a = sp.p.x - ex * 0.8; a <= sp.p.x + ex * 0.8 + 1e-6; a += 1 / 12) for (let b = sp.p.z - ez * 0.8; b <= sp.p.z + ez * 0.8 + 1e-6; b += 1 / 12) {
      const k = cell(a, b); const h = hmap.get(k);
      if (h === undefined || h < top) hmap.set(k, top);
    }
  };
  const floorAt = (x: number, zz: number) => { const tx = Math.floor(x), ty = Math.floor(zz); return z.inb(tx, ty) && z.floor[z.idx(tx, ty)] ? z.heightAt(tx, ty) : -3; };
  const landings: SimResult['landings'] = [];
  const steps = Math.ceil(maxT / STEP);
  let step = 0;
  const rec = () => { for (const sp of pieces) sp.frames.push(sp.p.x, sp.p.y, sp.p.z, sp.q.x, sp.q.y, sp.q.z, sp.q.w); };
  rec();
  for (; step < steps; step++) {
    let moving = 0;
    for (let i = 0; i < pieces.length; i++) {
      const sp = pieces[i];
      if (sp.rest) continue;
      moving++;
      sp.v.y -= 9.8 * STEP;
      const ox = sp.p.x, oz = sp.p.z;
      let nx = ox + sp.v.x * STEP, nz = oz + sp.v.z * STEP;
      // walls: keep the centre a margin away from blocking tile edges
      const ex = Math.min(0.32, extentX(sp.q, sp.half)), ez = Math.min(0.32, extentZ(sp.q, sp.half));
      const tx = Math.floor(ox), ty = Math.floor(oz);
      if (nx - ex < tx && blocked(z, tx, ty, -1, 0)) { nx = Math.max(nx, tx + ex); if (sp.v.x < 0) { sp.v.x *= -0.3; sp.w.multiplyScalar(0.7); } }
      if (nx + ex > tx + 1 && blocked(z, tx, ty, 1, 0)) { nx = Math.min(nx, tx + 1 - ex); if (sp.v.x > 0) { sp.v.x *= -0.3; sp.w.multiplyScalar(0.7); } }
      if (nz - ez < ty && blocked(z, tx, ty, 0, -1)) { nz = Math.max(nz, ty + ez); if (sp.v.z < 0) { sp.v.z *= -0.3; sp.w.multiplyScalar(0.7); } }
      if (nz + ez > ty + 1 && blocked(z, tx, ty, 0, 1)) { nz = Math.min(nz, ty + 1 - ez); if (sp.v.z > 0) { sp.v.z *= -0.3; sp.w.multiplyScalar(0.7); } }
      // tall solid furniture in the next tile stops it too
      const ntx = Math.floor(nx), nty = Math.floor(nz);
      if ((ntx !== tx || nty !== ty) && z.inb(ntx, nty) && z.solid[z.idx(ntx, nty)] === 1 && sp.p.y < z.heightAt(ntx, nty) + 0.8) { nx = ox; nz = oz; sp.v.x *= -0.25; sp.v.z *= -0.25; }
      sp.p.x = nx; sp.p.z = nz;
      sp.p.y += sp.v.y * STEP;
      integrateQ(sp.q, sp.w, STEP);
      const ey = extentY(sp.q, sp.half);
      const fl = Math.max(floorAt(sp.p.x, sp.p.z), stackAt(sp.p.x, sp.p.z, extentX(sp.q, sp.half), extentZ(sp.q, sp.half)));
      if (sp.p.y - ey <= fl) {
        if (fl < -2) { sp.rest = true; continue; }
        sp.p.y = fl + ey;
        const vy = sp.v.y;
        if (vy < -1.3) {
          if (sp.bounced < 3) landings.push({ t: step * STEP, x: sp.p.x, z: sp.p.z, i, s: -vy });
          sp.bounced++;
          sp.v.y = -vy * 0.26;
          sp.v.x *= 0.62; sp.v.z *= 0.62;
          // a knock on landing makes it tumble
          sp.w.x = sp.w.x * 0.5 + sp.v.z * 3; sp.w.z = sp.w.z * 0.5 - sp.v.x * 3;
        } else {
          sp.v.y = 0;
          const f = Math.exp(-6.5 * STEP);
          sp.v.x *= f; sp.v.z *= f;
          const fw = Math.exp(-9 * STEP);
          sp.w.x *= fw; sp.w.y *= fw; sp.w.z *= fw;
          layFlat(sp.q, sp.half, 0.12);
          if (sp.v.x * sp.v.x + sp.v.z * sp.v.z < 0.0025 && sp.w.lengthSq() < 0.05) {
            layFlat(sp.q, sp.half, 1);
            sp.p.y = fl + extentY(sp.q, sp.half);
            sp.rest = true;
            stamp(sp);
          }
        }
      } else {
        // air drag
        const f = Math.exp(-0.15 * STEP);
        sp.v.x *= f; sp.v.z *= f;
      }
    }
    if ((step + 1) % KF === 0) rec();
    if (!moving) { step++; break; }
  }
  // whatever is still going settles where it is
  for (const sp of pieces) if (!sp.rest) { layFlat(sp.q, sp.half, 1); const fl = Math.max(floorAt(sp.p.x, sp.p.z), stackAt(sp.p.x, sp.p.z, extentX(sp.q, sp.half), extentZ(sp.q, sp.half))); sp.p.y = Math.max(fl, -2) + extentY(sp.q, sp.half); sp.rest = true; }
  rec();
  return { pieces, frames: pieces[0] ? pieces[0].frames.length / 7 : 0, dt: STEP * KF, landings };
}

// ---------------------------------------------------------------- damaged geometry (dents and scuffs)
/**
 * A battered copy of an object's geometry: vertices nudged (coincident
 * corners move together so faces never split), dents pushed in around a few
 * impact points, colours scuffed darker in patches. Level 1..3.
 */
export function damageGeometry(src: THREE.BufferGeometry, lvl: number, seed: number): THREE.BufferGeometry {
  const g = src.clone();
  const P = g.getAttribute('position') as THREE.BufferAttribute;
  const C = g.getAttribute('color') as THREE.BufferAttribute;
  const bb = src.boundingBox ?? new THREE.Box3().setFromBufferAttribute(P);
  const size = bb.getSize(new THREE.Vector3());
  const rng = new Rng(seed * 31 + lvl);
  const dents: { x: number; y: number; z: number; r: number; k: number }[] = [];
  for (let i = 0; i < lvl + 1; i++) {
    // impact points on the front / top faces mostly (that is where things get hit)
    const face = rng.int(0, 3);
    const x = bb.min.x + size.x * rng.float(0.15, 0.85), y = bb.min.y + size.y * rng.float(0.3, 0.95), zz = face === 0 ? bb.max.z : face === 1 ? bb.min.z + size.z * rng.float(0.2, 0.8) : bb.max.z;
    dents.push({ x, y: face === 1 ? bb.max.y : y, z: zz, r: Math.max(0.08, Math.min(0.35, Math.max(size.x, size.y) * 0.25)), k: 0.012 + lvl * 0.012 });
  }
  const jit = 0.003 + lvl * 0.004;
  const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2, cy = (bb.min.y + bb.max.y) / 2;
  for (let i = 0; i < P.count; i++) {
    let x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    const qx = Math.round(x * 200), qy = Math.round(y * 200), qz = Math.round(z * 200);
    const h = hash3(qx + seed, qy * 3 + lvl, qz * 7);
    const n1 = ((h & 1023) / 1023 - 0.5) * 2, n2 = (((h >> 10) & 1023) / 1023 - 0.5) * 2, n3 = (((h >> 20) & 1023) / 1023 - 0.5) * 2;
    x += n1 * jit; y += n2 * jit * (y > bb.min.y + 0.01 ? 1 : 0); z += n3 * jit;
    let dark = 1 - (((h >> 5) & 255) / 255) * 0.1 * lvl;
    for (const d of dents) {
      const dx = x - d.x, dy = y - d.y, dz = z - d.z;
      const r2 = dx * dx + dy * dy + dz * dz;
      if (r2 < d.r * d.r) {
        const f = 1 - Math.sqrt(r2) / d.r;
        // push toward the object's centre
        const ix = cx - x, iy = cy - y, iz = cz - z;
        const il = Math.sqrt(ix * ix + iy * iy + iz * iz) || 1;
        x += (ix / il) * d.k * f; y += (iy / il) * d.k * f * 0.6; z += (iz / il) * d.k * f;
        dark *= 1 - f * 0.25;
      }
    }
    P.setXYZ(i, x, y, z);
    C.setXYZ(i, C.getX(i) * dark, C.getY(i) * dark, C.getZ(i) * dark);
  }
  P.needsUpdate = true; C.needsUpdate = true;
  g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}

// ---------------------------------------------------------------- crack / tear overlays
let rectNames: Map<string, string> | null = null;
let rectCount = 0;
/** atlas rect (u0,v0) → texture name */
function texOfAtlas(u0: number, v0: number): string {
  const rects: Map<string, any> = (atlas() as any).rects;
  if (!rectNames || rects.size !== rectCount) {
    rectNames = new Map();
    for (const [k, r] of rects) rectNames.set(r.u0.toFixed(5) + '|' + r.v0.toFixed(5), k);
    rectCount = rects.size;
  }
  return rectNames.get(u0.toFixed(5) + '|' + v0.toFixed(5)) ?? '';
}

const CRACK_TEX: Record<Mat, string[]> = {
  wood: ['dmg_crack_wood', 'dmg_crack_wood_b', 'dmg_hole_wood'],
  paper: ['dmg_crack_wood', 'dmg_tear_paper', 'dmg_tear_paper'],
  metal: ['dmg_dent_metal', 'dmg_dent_metal_b', 'dmg_dent_metal_b'],
  plastic: ['dmg_crack_hard', 'dmg_crack_hard_b', 'dmg_crack_hard_b'],
  ceramic: ['dmg_crack_hard', 'dmg_crack_hard_b', 'dmg_crack_hard_b'],
  elec: ['dmg_crack_hard', 'dmg_crack_glass', 'dmg_burn'],
  fabric: ['dmg_tear_fabric', 'dmg_tear_fabric_b', 'dmg_tear_fabric_b'],
  glass: ['dmg_crack_glass', 'dmg_crack_glass', 'dmg_crack_glass'],
  flesh: ['dmg_crack_hard', 'dmg_wax_gash', 'dmg_wax_gash'],
};

/**
 * Crack / tear / dent decals on the real surfaces of a damaged object
 * (area-weighted random triangles, model space), appended to `mb`.
 */
export function crackOverlay(mb: ModelBuilder, g: THREE.BufferGeometry, m: THREE.Matrix4, lvl: number, seed: number, fallback: Mat) {
  const P = g.getAttribute('position') as THREE.BufferAttribute;
  const A = g.getAttribute('aAtlas') as THREE.BufferAttribute;
  const I = g.getIndex();
  if (!I || !P) return;
  const tris = I.count / 3;
  const areas = new Float32Array(tris);
  let total = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), ab = new THREE.Vector3(), ac = new THREE.Vector3(), n = new THREE.Vector3();
  for (let t = 0; t < tris; t++) {
    a.fromBufferAttribute(P, I.getX(t * 3)); b.fromBufferAttribute(P, I.getX(t * 3 + 1)); c.fromBufferAttribute(P, I.getX(t * 3 + 2));
    ab.subVectors(b, a); ac.subVectors(c, a); n.crossVectors(ab, ac);
    const ar = n.length() * 0.5;
    // the camera looks down: up-facing and side faces matter, bottoms never show
    const ny = n.y / (n.length() || 1);
    const w = ny < -0.3 ? 0 : ar;
    areas[t] = w; total += w;
  }
  if (total <= 0) return;
  const rng = new Rng(seed * 7 + 3);
  const count = Math.min(10, Math.round((1 + lvl * 2) * Math.min(2.2, 0.6 + total * 0.8)));
  const nm = new THREE.Matrix3().getNormalMatrix(m);
  const p = new THREE.Vector3(), nn = new THREE.Vector3(), t1 = new THREE.Vector3(), t2 = new THREE.Vector3();
  for (let k = 0; k < count; k++) {
    let r = rng.next() * total, t = 0;
    for (; t < tris - 1; t++) { r -= areas[t]; if (r <= 0) break; }
    const i0 = I.getX(t * 3), i1 = I.getX(t * 3 + 1), i2 = I.getX(t * 3 + 2);
    a.fromBufferAttribute(P, i0); b.fromBufferAttribute(P, i1); c.fromBufferAttribute(P, i2);
    ab.subVectors(b, a); ac.subVectors(c, a); nn.crossVectors(ab, ac);
    const ar = nn.length() * 0.5;
    if (ar < 1e-5) continue;
    nn.normalize();
    // a point inside the triangle
    let u = rng.next(), v = rng.next();
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    p.copy(a).addScaledVector(ab, u).addScaledVector(ac, v);
    const tex = texOfAtlas(A.getX(i0), A.getY(i0));
    const mat = texMat(tex) ?? fallback;
    const set = CRACK_TEX[mat] ?? CRACK_TEX.wood;
    const dt = set[Math.min(set.length - 1, Math.max(0, lvl - 1 + (rng.chance(0.3) ? -1 : 0)))];
    const size = Math.min(0.42, Math.max(0.07, Math.sqrt(ar) * (0.9 + lvl * 0.25)));
    // tangent frame on the face, random spin
    t1.copy(Math.abs(nn.y) > 0.8 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)).cross(nn).normalize();
    t2.crossVectors(nn, t1);
    const sp = rng.float(0, Math.PI * 2), cs = Math.cos(sp), sn = Math.sin(sp);
    const e1 = t1.clone().multiplyScalar(cs).addScaledVector(t2, sn).multiplyScalar(size / 2);
    const e2 = t1.clone().multiplyScalar(-sn).addScaledVector(t2, cs).multiplyScalar(size / 2);
    const o = p.clone().addScaledVector(nn, 0.006);
    const corners = [o.clone().sub(e1).sub(e2), o.clone().add(e1).sub(e2), o.clone().add(e1).add(e2), o.clone().sub(e1).add(e2)].map((q) => q.applyMatrix4(m));
    const wn = nn.clone().applyMatrix3(nm).normalize();
    mb.quadRaw(corners.map((q) => [q.x, q.y, q.z]), [[0, 0], [1, 0], [1, 1], [0, 1]], dt, 0xffffff, 1, 0, 0, [wn.x, wn.y, wn.z]);
  }
}
