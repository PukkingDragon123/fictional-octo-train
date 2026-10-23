// Shared kit for the beast-type creatures (grinhound, lost dog, stilt doe,
// wrongbird, lumenmoth, ventling, lifeguard):
//
//  * Page: a per-species pixel-art texture page living in the shared atlas
//    (painted at ~2x the world's texel density), laid out in named regions,
//    with several seeded colour variants so a pack never looks cloned.
//  * OB ("organic builder"): lofted cross-section rings, tubes along curved
//    paths, blobs, cut caps and double-sided cards with smooth normals, UVs
//    into page regions and per-vertex occlusion / emissive. Produces the same
//    vertex layout as ModelBuilder, so it draws with the world material.
//  * bpart(): rig parts built from an OB, geometry cached per species so a
//    pack shares buffers; applyLook() swaps a rig onto its individual variant.
//  * ik2() and Gait: two-bone leg IK and a phase-driven quadruped gait with
//    planted feet, stride from measured ground speed, body bob / roll, and
//    support for missing legs (gore / limb loss).
import * as THREE from 'three';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { PixelCanvas, bayer, mixHex, ph } from '../../gfx/pixel';
import { Rng, tileFbm, hashStr } from '../../core/rng';
import { worldMaterial } from '../../gfx/materials';
import { facetMaterial } from './horror';
import type { Rig } from '../species';
import type { Creature } from '../creature';

export type V3 = [number, number, number];
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (t: number) => { const x = clamp01(t); return x * x * (3 - 2 * x); };
export const gauss = (x: number, c: number, s: number) => Math.exp(-((x - c) * (x - c)) / (2 * s * s));
/** framerate independent approach factor */
export const damp = (k: number, dt: number) => 1 - Math.exp(-k * dt);
export const wrapA = (a: number) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
/** deterministic 0..1 hash of a string (creature ids) */
export function hash01(s: string, salt = 0) { return ((hashStr(s + ':' + salt) >>> 0) % 100003) / 100003; }

// =====================================================================================
// texture pages
// =====================================================================================
export interface Reg { x: number; y: number; w: number; h: number }

export class Page {
  readonly regs: Record<string, Reg> = {};
  constructor(readonly key: string, readonly W: number, readonly H: number, sizes: [string, number, number][], readonly variants = 1, pad = 2) {
    // simple shelf packing, tallest first
    const list = [...sizes].sort((a, b) => b[2] - a[2]);
    let x = pad, y = pad, rowH = 0;
    for (const [n, w, h] of list) {
      if (x + w + pad > W) { x = pad; y += rowH + pad; rowH = 0; }
      if (y + h + pad > H) throw new Error(`page ${key} overflow at ${n}`);
      this.regs[n] = { x, y, w, h };
      x += w + pad; rowH = Math.max(rowH, h);
    }
  }
  tex(v = 0) { return `${this.key}_${v}`; }
  reg(n: string): Reg { const r = this.regs[n]; if (!r) throw new Error(`page ${this.key}: no region ${n}`); return r; }
  /** register the painter for every variant (runs when the atlas is filled) */
  paint(fn: (P: Painter, variant: number) => void) {
    addTextureModule(() => {
      for (let v = 0; v < this.variants; v++) {
        atlas().add(this.tex(v), this.W, this.H, (pc) => {
          pc.wrap = false;
          pc.clear();
          fn(new Painter(this, pc, v), v);
        });
      }
    });
  }
}

/** painting helpers working in region-local pixel coordinates */
export class Painter {
  readonly rng: Rng;
  readonly seed: number;
  constructor(readonly page: Page, readonly pc: PixelCanvas, readonly variant: number) {
    this.seed = (hashStr(page.key) + variant * 7919) >>> 0;
    this.rng = new Rng(this.seed);
  }
  R(n: string) { return this.page.reg(n); }
  /** wrapped x inside a region (tubes wrap around u) */
  private wx(r: Reg, x: number) { const w = r.w; return ((Math.round(x) % w) + w) % w; }
  inside(r: Reg, x: number, y: number) { return y >= 0 && y < r.h; }
  set(r: Reg, x: number, y: number, c: number) { const yy = Math.round(y); if (yy < 0 || yy >= r.h) return; this.pc.set(r.x + this.wx(r, x), r.y + yy, c); }
  get(r: Reg, x: number, y: number) { return this.pc.get(r.x + this.wx(r, x), r.y + clamp(Math.round(y), 0, r.h - 1)); }
  blend(r: Reg, x: number, y: number, c: number, t: number) { const yy = Math.round(y); if (yy < 0 || yy >= r.h || t <= 0) return; this.pc.blend(r.x + this.wx(r, x), r.y + yy, c, Math.min(1, t)); }
  /** ordered-dither blend: either fully on or off per pixel (crisp pixel art) */
  dblend(r: Reg, x: number, y: number, c: number, t: number) { if (t > bayer(Math.round(x), Math.round(y))) this.set(r, x, y, c); }
  /** dithered write of a fractional ramp index */
  put(r: Reg, x: number, y: number, R: number[], v: number, dither = 0.6) {
    let i = Math.floor(v);
    if (v - i > 0.5 + (bayer(x, y) - 0.5) * dither) i++;
    this.set(r, x, y, R[i < 0 ? 0 : i >= R.length ? R.length - 1 : i]);
  }
  /** fill a whole region: fn(u, v, x, y) -> ramp index (u 0..1 across, v 1 at the top row) */
  fill(r: Reg, R: number[], fn: (u: number, v: number, x: number, y: number) => number, dither = 0.6, mask?: (u: number, v: number, x: number, y: number) => boolean) {
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
      const u = (x + 0.5) / r.w, v = 1 - (y + 0.5) / r.h;
      if (mask && !mask(u, v, x, y)) continue;
      this.put(r, x, y, R, fn(u, v, x, y), dither);
    }
  }
  /** tileable noise over a region (wraps in both directions) */
  n(r: Reg, x: number, y: number, cells = 3, oct = 2, salt = 0) { return tileFbm(((x % r.w) + r.w) % r.w, ((y % r.h) + r.h) % r.h, r.w, r.h, cells, oct, (this.seed + salt * 131) % 100000); }
  /** soft round spot */
  spot(r: Reg, cx: number, cy: number, rx: number, ry: number, c: number, a = 1, dith = false) {
    for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
      const d = Math.hypot((x + 0.5 - cx) / Math.max(0.3, rx), (y + 0.5 - cy) / Math.max(0.3, ry));
      if (d > 1) continue;
      const t = a * (1 - d * d * 0.6);
      if (dith) this.dblend(r, x, y, c, t); else this.blend(r, x, y, c, t);
    }
  }
  /** wandering line (veins, scars, cracks, fur strokes) */
  walk(r: Reg, x: number, y: number, len: number, dx: number, dy: number, c: number, a = 1, wob = 0.6, branch = 0) {
    let px = x, py = y, ax = dx, ay = dy;
    for (let i = 0; i < len; i++) {
      this.blend(r, px, py, c, a * (1 - (i / len) * 0.5));
      ax += (this.rng.next() - 0.5) * wob; ay += (this.rng.next() - 0.5) * wob;
      const l = Math.hypot(ax, ay) || 1; ax /= l; ay /= l;
      px += ax; py += ay;
      if (branch > 0 && this.rng.chance(branch)) this.walk(r, px, py, Math.floor(len * 0.4), ay, -ax * (this.rng.chance(0.5) ? 1 : -1), c, a * 0.7, wob, 0);
    }
  }
  /**
   * Hand-painted hair: short strokes laid along a flow direction over what is
   * already painted. Each stroke samples the ramp index under its root (via
   * `level`) and goes `dark` steps darker or `light` steps lighter.
   */
  strokes(r: Reg, R: number[], level: (x: number, y: number) => number, o: {
    density: number; flow: (x: number, y: number) => [number, number]; len?: [number, number]; dark?: number; light?: number; lightP?: number; mask?: (x: number, y: number) => boolean; salt?: number;
  }) {
    const n = Math.round(r.w * r.h * o.density);
    const rng = new Rng(this.seed + (o.salt ?? 0) * 977);
    const [l0, l1] = o.len ?? [2, 4];
    for (let i = 0; i < n; i++) {
      const x = rng.int(0, r.w - 1), y = rng.int(0, r.h - 1);
      if (o.mask && !o.mask(x, y)) continue;
      const lv = level(x, y);
      const lightS = rng.chance(o.lightP ?? 0.35);
      const c = R[clamp(Math.round(lv + (lightS ? (o.light ?? 1.2) : -(o.dark ?? 1.4))), 0, R.length - 1)];
      const [fx, fy] = o.flow(x, y);
      const L = rng.int(l0, l1);
      let px = x + 0.5, py = y + 0.5;
      for (let k = 0; k < L; k++) {
        if (o.mask && !o.mask(Math.floor(px), Math.floor(py))) break;
        this.set(r, Math.floor(px), Math.floor(py), c);
        px += fx; py += fy;
      }
    }
  }
  /** wet highlight: a 1px bright run with a softer halo */
  glint(r: Reg, x: number, y: number, len: number, c = 0xffffff, a = 0.7) {
    for (let i = 0; i < len; i++) { this.blend(r, x + i, y, c, a); this.blend(r, x + i, y + 1, c, a * 0.25); }
  }
  /** a flesh cross-section: skin rim, fat, muscle, a bone in the middle (stumps of severed parts) */
  cut(r: Reg, skin: number, opts: { bone?: number; marrow?: number; meat?: number; fat?: number; boneR?: number; off?: [number, number] } = {}) {
    const meat = opts.meat ?? 0x8a1c1c, fat = opts.fat ?? 0xd8b890, bone = opts.bone ?? 0xe8e0c8, marrow = opts.marrow ?? 0x9a3a2a;
    const cx = r.w / 2 + (opts.off?.[0] ?? 0), cy = r.h / 2 + (opts.off?.[1] ?? 0), R0 = Math.min(r.w, r.h) / 2;
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
      const d = Math.hypot(x + 0.5 - r.w / 2, y + 0.5 - r.h / 2) / R0;
      const nb = this.n(r, x, y, 2, 2, 77);
      let c = d > 0.9 ? skin : d > 0.8 ? fat : mixHex(meat, 0x5a0808, clamp01(nb * 1.4 - 0.3));
      if (d <= 0.8 && ph(x, y, 5) > 0.86) c = mixHex(c, 0xc04040, 0.6); // wet glints in the meat
      if (d <= 0.8 && d > 0.7 && ph(x >> 1, y, 9) > 0.6) c = mixHex(c, 0x3a0404, 0.5);
      this.set(r, x, y, c);
      const db = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / (R0 * (opts.boneR ?? 0.32));
      if (db < 1) this.set(r, x, y, db < 0.45 ? marrow : db > 0.85 ? mixHex(bone, 0x8a7a60, 0.4) : bone);
    }
  }
}

// =====================================================================================
// organic geometry builder
// =====================================================================================
const _m = new THREE.Matrix4(), _v = new THREE.Vector3();

export interface LoftRing { pts: V3[]; v: number; col?: number | ((j: number) => number); emis?: number }
export interface LoftOpts {
  g?: number;
  start?: 'pole' | 'flat' | 'cut' | null;
  end?: 'pole' | 'flat' | 'cut' | null;
  /** pole points pushed out along the axis by this much (rounded ends) */
  startBulge?: number; endBulge?: number;
  /** region used for 'cut' caps (cross-section painting) */
  cut?: Reg;
  /** u span used around the ring (default full region width) */
  u0?: number; u1?: number;
  /** skip quads (open sides) */
  skip?: (i: number, j: number) => boolean;
  /** also emit inner faces (thin shells such as ears) */
  double?: boolean;
}

/** builds smooth low-poly organic meshes textured from a Page */
export class OB {
  private P: number[] = []; private UV: number[] = []; private C: number[] = []; private FX: number[] = []; private G: number[] = []; private I: number[] = [];
  private m = new THREE.Matrix4();
  private stack: THREE.Matrix4[] = [];
  private gid = 1000;
  constructor(readonly page: Page) {}

  push() { this.stack.push(this.m.clone()); return this; }
  pop() { const m = this.stack.pop(); if (m) this.m.copy(m); return this; }
  translate(x: number, y: number, z: number) { this.m.multiply(_m.makeTranslation(x, y, z)); return this; }
  rotX(a: number) { this.m.multiply(_m.makeRotationX(a)); return this; }
  rotY(a: number) { this.m.multiply(_m.makeRotationY(a)); return this; }
  rotZ(a: number) { this.m.multiply(_m.makeRotationZ(a)); return this; }
  scale(x: number, y: number, z: number) { this.m.multiply(_m.makeScale(x, y, z)); return this; }
  /** a fresh smoothing group id */
  newGroup() { return this.gid++; }
  get tris() { return this.I.length / 3; }
  get empty() { return this.I.length === 0; }

  /** add a vertex (local position, region uv with v=1 at the top row) */
  vert(p: V3, reg: Reg, u: number, v: number, g = 0, col = 1, emis = 0): number {
    _v.set(p[0], p[1], p[2]).applyMatrix4(this.m);
    this.P.push(_v.x, _v.y, _v.z);
    const px = reg.x + clamp01(u) * reg.w, py = reg.y + (1 - clamp01(v)) * reg.h;
    this.UV.push(px / this.page.W, 1 - py / this.page.H);
    this.C.push(col, col, col);
    this.FX.push(emis, 0);
    this.G.push(g);
    return this.P.length / 3 - 1;
  }
  private pos(i: number): V3 { return [this.P[i * 3], this.P[i * 3 + 1], this.P[i * 3 + 2]]; }
  tri(a: number, b: number, c: number) { this.I.push(a, b, c); }
  /** triangle wound so its normal points away from `inside` (world/builder space) */
  triOut(a: number, b: number, c: number, inside: V3, flip = false) {
    const A = this.pos(a), B = this.pos(b), C = this.pos(c);
    const n = cross(sub(B, A), sub(C, A));
    const m: V3 = [(A[0] + B[0] + C[0]) / 3 - inside[0], (A[1] + B[1] + C[1]) / 3 - inside[1], (A[2] + B[2] + C[2]) / 3 - inside[2]];
    if ((dot(n, m) >= 0) !== flip) this.tri(a, b, c); else this.tri(a, c, b);
  }
  private xf(p: V3): V3 { _v.set(p[0], p[1], p[2]).applyMatrix4(this.m); return [_v.x, _v.y, _v.z]; }

  /**
   * Loft through rings with equal point counts (seam point duplicated at the
   * end of every ring). us: u per ring point (0..1, mapped into [u0,u1] of the region).
   */
  loft(rings: LoftRing[], reg: Reg, o: LoftOpts = {}) {
    const n = rings[0].pts.length;
    const g = o.g ?? this.newGroup();
    const u0 = o.u0 ?? 0, u1 = o.u1 ?? 1;
    const us = Array.from({ length: n }, (_, j) => u0 + (u1 - u0) * (j / (n - 1)));
    const cents = rings.map((r) => this.xf(centroid(r.pts.slice(0, n - 1))));
    const colOf = (r: LoftRing, j: number) => (typeof r.col === 'function' ? r.col(j) : r.col ?? 1);
    const rows = rings.map((r) => r.pts.map((p, j) => this.vert(p, reg, us[j], r.v, g, colOf(r, j), r.emis ?? 0)));
    const emit = (R: number[][], flip: boolean) => {
      for (let i = 0; i + 1 < R.length; i++) {
        const ins = mid(cents[i], cents[i + 1]);
        for (let j = 0; j + 1 < n; j++) {
          if (o.skip?.(i, j)) continue;
          const a = R[i][j], b = R[i][j + 1], c = R[i + 1][j + 1], d = R[i + 1][j];
          const A = this.pos(a), B = this.pos(b), C = this.pos(c), D = this.pos(d);
          let nrm = cross(sub(B, A), sub(C, A));
          if (len(nrm) < 1e-12) nrm = cross(sub(C, A), sub(D, A));
          const out = dot(nrm, sub(mid(A, C), ins)) >= 0;
          if (out !== flip) { this.tri(a, b, c); this.tri(a, c, d); } else { this.tri(a, c, b); this.tri(a, d, c); }
        }
      }
    };
    emit(rows, false);
    if (o.double) {
      const g2 = this.newGroup();
      const inner = rings.map((r) => r.pts.map((p, j) => this.vert(p, reg, us[j], r.v, g2, colOf(r, j) * 0.7, r.emis ?? 0)));
      emit(inner, true);
    }
    const all = centroid(cents);
    const cap = (which: 'start' | 'end', kind: 'pole' | 'flat' | 'cut', bulge: number) => {
      const ri = which === 'start' ? 0 : rings.length - 1;
      const other = which === 'start' ? Math.min(1, rings.length - 1) : Math.max(0, rings.length - 2);
      const ring = rings[ri];
      const c0 = centroid(ring.pts.slice(0, n - 1));
      const c1 = centroid(rings[other].pts.slice(0, n - 1));
      let ax = sub(c0, c1); const l = len(ax) || 1; ax = [ax[0] / l, ax[1] / l, ax[2] / l];
      if (kind === 'cut') {
        // flat cross-section disc mapped radially onto the cut region (flat normals)
        const cr = o.cut ?? reg;
        const gg = this.newGroup();
        const cv = this.vert(c0, cr, 0.5, 0.5, gg);
        const ids = ring.pts.map((p, j) => { const a = (j / (n - 1)) * Math.PI * 2; return this.vert(p, cr, 0.5 + Math.cos(a) * 0.48, 0.5 + Math.sin(a) * 0.48, gg); });
        const inside = this.xf(sub(c0, ax.map((q) => q * 0.01) as V3));
        for (let j = 0; j + 1 < n; j++) this.triOut(cv, ids[j], ids[j + 1], inside);
        return;
      }
      const P: V3 = kind === 'pole' ? [c0[0] + ax[0] * bulge, c0[1] + ax[1] * bulge, c0[2] + ax[2] * bulge] : c0;
      const v = ring.v;
      for (let j = 0; j + 1 < n; j++) {
        const pi = this.vert(P, reg, (us[j] + us[j + 1]) / 2, v, g, colOf(ring, j), ring.emis ?? 0);
        this.triOut(pi, rows[ri][j], rows[ri][j + 1], all);
      }
    };
    if (o.start) cap('start', o.start, o.startBulge ?? 0);
    if (o.end) cap('end', o.end, o.endBulge ?? 0);
    return rows;
  }

  /**
   * Tube along a path of centre points. rad: [r across N, r across B] per point
   * (N starts from `up` projected off the tangent). th0 sets where u=0 sits.
   */
  tube(path: V3[], rad: ([number, number] | number)[], n: number, reg: Reg, o: LoftOpts & {
    up?: V3; th0?: number; vs?: number[]; vflip?: boolean; col?: (i: number, th: number) => number; bump?: (i: number, th: number) => number; emis?: number;
  } = {}) {
    const frames = pathFrames(path, o.up ?? [0, 0, 1]);
    const th0 = o.th0 ?? Math.PI;
    const total = pathLen(path);
    let acc = 0;
    const rings: LoftRing[] = path.map((p, i) => {
      if (i > 0) acc += len(sub(p, path[i - 1]));
      const r = rad[i];
      const rn = typeof r === 'number' ? r : r[0], rb = typeof r === 'number' ? r : r[1];
      const { N, B } = frames[i];
      const pts: V3[] = [];
      const cols: number[] = [];
      for (let j = 0; j < n; j++) {
        const th = th0 + (j / (n - 1)) * Math.PI * 2;
        const k = 1 + (o.bump ? o.bump(i, th) : 0);
        const c = Math.cos(th) * rn * k, s = Math.sin(th) * rb * k;
        pts.push([p[0] + N[0] * c + B[0] * s, p[1] + N[1] * c + B[1] * s, p[2] + N[2] * c + B[2] * s]);
        cols.push(o.col ? o.col(i, th) : 1);
      }
      return { pts, v: o.vs ? o.vs[i] : o.vflip ? 0.02 + 0.96 * (acc / (total || 1)) : 1 - acc / (total || 1), col: (j: number) => cols[j], emis: o.emis };
    });
    return this.loft(rings, reg, o);
  }

  /** ellipsoid blob (eyes, joints, knuckles) */
  blob(c: V3, r: V3, segs: number, rings: number, reg: Reg, o: { g?: number; col?: number; emis?: number; u0?: number; u1?: number; v0?: number; v1?: number; rot?: V3 } = {}) {
    const g = o.g ?? this.newGroup();
    const rows: number[][] = [];
    const rm = o.rot ? new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(o.rot[0], o.rot[1], o.rot[2])) : null;
    for (let j = 0; j <= rings; j++) {
      const phi = (j / rings) * Math.PI;
      const row: number[] = [];
      for (let i = 0; i <= segs; i++) {
        const th = (i / segs) * Math.PI * 2;
        _v.set(Math.sin(phi) * Math.cos(th) * r[0], Math.cos(phi) * r[1], Math.sin(phi) * Math.sin(th) * r[2]);
        if (rm) _v.applyMatrix4(rm);
        const u = lerp(o.u0 ?? 0, o.u1 ?? 1, i / segs), v = lerp(o.v1 ?? 1, o.v0 ?? 0, j / rings);
        row.push(this.vert([c[0] + _v.x, c[1] + _v.y, c[2] + _v.z], reg, u, v, g, o.col ?? 1, o.emis ?? 0));
      }
      rows.push(row);
    }
    const C = this.xf(c);
    for (let j = 0; j < rings; j++) for (let i = 0; i < segs; i++) {
      const a = rows[j][i], b = rows[j][i + 1], cc = rows[j + 1][i + 1], d = rows[j + 1][i];
      if (j > 0) this.triOut(a, b, cc, C);
      if (j < rings - 1) this.triOut(a, cc, d, C);
    }
  }

  /** single quad (optionally double sided) with explicit region uvs per corner */
  quad(p: [V3, V3, V3, V3], reg: Reg, uv: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]], o: { double?: boolean; col?: number; emis?: number; g?: number; out?: V3 } = {}) {
    const g = o.g ?? this.newGroup();
    const ids = p.map((q, i) => this.vert(q, reg, uv[i][0], uv[i][1], g, o.col ?? 1, o.emis ?? 0));
    this.tri(ids[0], ids[1], ids[2]); this.tri(ids[0], ids[2], ids[3]);
    if (o.double) {
      const g2 = this.newGroup();
      const b = p.map((q, i) => this.vert(q, reg, uv[i][0], uv[i][1], g2, (o.col ?? 1) * 0.8, o.emis ?? 0));
      this.tri(b[0], b[2], b[1]); this.tri(b[0], b[3], b[2]);
    }
    return ids;
  }

  /** a strip of quads between two polylines (teeth rows, lips, fins); double sided optional */
  strip(a: V3[], b: V3[], reg: Reg, o: { double?: boolean; col?: number; emis?: number; v0?: number; v1?: number } = {}) {
    const g = this.newGroup();
    const n = a.length;
    const ra = a.map((p, i) => this.vert(p, reg, i / (n - 1), o.v1 ?? 1, g, o.col ?? 1, o.emis ?? 0));
    const rb = b.map((p, i) => this.vert(p, reg, i / (n - 1), o.v0 ?? 0, g, o.col ?? 1, o.emis ?? 0));
    for (let i = 0; i + 1 < n; i++) { this.tri(ra[i], rb[i], rb[i + 1]); this.tri(ra[i], rb[i + 1], ra[i + 1]); }
    if (o.double) {
      const g2 = this.newGroup();
      const qa = a.map((p, i) => this.vert(p, reg, i / (n - 1), o.v1 ?? 1, g2, (o.col ?? 1) * 0.8, o.emis ?? 0));
      const qb = b.map((p, i) => this.vert(p, reg, i / (n - 1), o.v0 ?? 0, g2, (o.col ?? 1) * 0.8, o.emis ?? 0));
      for (let i = 0; i + 1 < n; i++) { this.tri(qa[i], qb[i + 1], qb[i]); this.tri(qa[i], qa[i + 1], qb[i + 1]); }
    }
  }

  /** a tapered cone (claws, teeth, spines, beaks) from base centre along dir */
  cone(base: V3, dir: V3, r: number, h: number, segs: number, reg: Reg, o: { col?: number; emis?: number; up?: V3; flat?: number } = {}) {
    const d = norm(dir);
    const up = o.up ?? (Math.abs(d[1]) > 0.9 ? [0, 0, 1] : [0, 1, 0]) as V3;
    const N = norm(cross(cross(d, up), d)), B = cross(d, N);
    const g = this.newGroup();
    const tip: V3 = [base[0] + d[0] * h, base[1] + d[1] * h, base[2] + d[2] * h];
    const ids: number[] = [];
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const c = Math.cos(a) * r, s = Math.sin(a) * r * (o.flat ?? 1);
      ids.push(this.vert([base[0] + N[0] * c + B[0] * s, base[1] + N[1] * c + B[1] * s, base[2] + N[2] * c + B[2] * s], reg, i / segs, 0, g, o.col ?? 1, o.emis ?? 0));
    }
    const C = this.xf(base);
    for (let i = 0; i < segs; i++) {
      const t = this.vert(tip, reg, (i + 0.5) / segs, 1, g, o.col ?? 1, o.emis ?? 0);
      this.triOut(ids[i], ids[i + 1], t, C);
    }
  }

  build(): THREE.BufferGeometry {
    const nv = this.P.length / 3;
    const N = new Float32Array(nv * 3);
    for (let t = 0; t < this.I.length; t += 3) {
      const a = this.I[t], b = this.I[t + 1], c = this.I[t + 2];
      const A = this.pos(a), B = this.pos(b), C = this.pos(c);
      const n = cross(sub(B, A), sub(C, A));
      for (const k of [a, b, c]) { N[k * 3] += n[0]; N[k * 3 + 1] += n[1]; N[k * 3 + 2] += n[2]; }
    }
    // merge normals of coincident vertices in the same smoothing group (seams, poles)
    const groups = new Map<string, number[]>();
    for (let i = 0; i < nv; i++) {
      const key = this.G[i] + ':' + Math.round(this.P[i * 3] * 4000) + ',' + Math.round(this.P[i * 3 + 1] * 4000) + ',' + Math.round(this.P[i * 3 + 2] * 4000);
      let l = groups.get(key); if (!l) groups.set(key, l = []); l.push(i);
    }
    for (const l of groups.values()) {
      if (l.length < 2) continue;
      let x = 0, y = 0, z = 0;
      for (const i of l) { x += N[i * 3]; y += N[i * 3 + 1]; z += N[i * 3 + 2]; }
      for (const i of l) { N[i * 3] = x; N[i * 3 + 1] = y; N[i * 3 + 2] = z; }
    }
    for (let i = 0; i < nv; i++) {
      const l = Math.hypot(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]) || 1;
      N[i * 3] /= l; N[i * 3 + 1] /= l; N[i * 3 + 2] /= l;
    }
    const r = atlas().get(this.page.tex(0));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.UV, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    const at = new Float32Array(nv * 4);
    for (let i = 0; i < nv; i++) { at[i * 4] = r.u0; at[i * 4 + 1] = r.v0; at[i * 4 + 2] = r.du; at[i * 4 + 3] = r.dv; }
    g.setAttribute('aAtlas', new THREE.BufferAttribute(at, 4));
    g.setAttribute('aFx', new THREE.Float32BufferAttribute(this.FX, 2));
    g.setIndex(nv > 65535 ? new THREE.Uint32BufferAttribute(this.I, 1) : new THREE.Uint16BufferAttribute(this.I, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

// ---------------------------------------------------------------- vector helpers
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: V3): V3 => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const mid = (a: V3, b: V3): V3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
export const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export function centroid(ps: V3[]): V3 { let x = 0, y = 0, z = 0; for (const p of ps) { x += p[0]; y += p[1]; z += p[2]; } const n = Math.max(1, ps.length); return [x / n, y / n, z / n]; }
function pathLen(p: V3[]) { let l = 0; for (let i = 1; i < p.length; i++) l += len(sub(p[i], p[i - 1])); return l; }
/** parallel-transport frames along a path */
function pathFrames(p: V3[], up: V3): { T: V3; N: V3; B: V3 }[] {
  const out: { T: V3; N: V3; B: V3 }[] = [];
  let N: V3 | null = null;
  for (let i = 0; i < p.length; i++) {
    const a = p[Math.max(0, i - 1)], b = p[Math.min(p.length - 1, i + 1)];
    const T = norm(sub(b, a));
    if (!N) { N = sub(up, mul(T, dot(up, T))); if (len(N) < 1e-5) N = Math.abs(T[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]; N = norm(sub(N, mul(T, dot(N, T)))); }
    else N = norm(sub(N, mul(T, dot(N, T))));
    out.push({ T, N, B: norm(cross(T, N)) });
  }
  return out;
}

/** a cross-section ring around the z axis (bodies): angle 0 at the belly, PI at the spine */
export function bodyRing(z: number, cy: number, rx: number, up: number, dn: number, n: number, sq = 2, bump?: (th: number) => number, cx = 0): V3[] {
  const pts: V3[] = [];
  const e = 2 / sq;
  for (let j = 0; j < n; j++) {
    const th = (j / (n - 1)) * Math.PI * 2;
    const s = Math.sin(th), c = -Math.cos(th);
    const ex = Math.sign(s) * Math.pow(Math.abs(s), e), ey = Math.sign(c) * Math.pow(Math.abs(c), e);
    const k = 1 + (bump ? bump(th) : 0);
    pts.push([cx + ex * rx * k, cy + ey * (c >= 0 ? up : dn) * k, z]);
  }
  return pts;
}

// =====================================================================================
// rig parts, materials, looks
// =====================================================================================
let _mat: THREE.Material | null = null;
/** one material for every beast (alpha-tested so fur / wing cards can be shaped) */
export function beastMaterial(): THREE.Material {
  // faceted with wet glints (kit/horror.ts)
  if (!_mat) _mat = facetMaterial(worldMaterial({ alphaTest: 0.5 }));
  return _mat;
}

const GEO = new Map<string, THREE.BufferGeometry>();
/** cached geometry for a part (shared by every individual of the species) */
export function cachedGeo(key: string, page: Page, fn: (ob: OB) => void): THREE.BufferGeometry {
  let g = GEO.get(key);
  if (!g) { const ob = new OB(page); fn(ob); g = ob.build(); GEO.set(key, g); TRIS.set(key, ob.tris); }
  return g;
}
const TRIS = new Map<string, number>();
/** triangle count of a rig built from cached parts (dev) */
export function rigTris(rig: Rig) { let n = 0; rig.root.traverse((o) => { const k = o.userData.gk as string | undefined; if (k) n += TRIS.get(k.split('|')[0]) ?? 0; }); return n; }

/**
 * A rig part: pivot group at `at` with one merged mesh. Geometry is cached
 * under page.key + ':' + key (pass the same key for parts with identical
 * shape, e.g. the left and right leg of a mirrored pair).
 */
export function bpart(rig: Rig, name: string, parent: THREE.Object3D, at: V3, page: Page, key: string | null, fn: ((ob: OB) => void) | null): THREE.Group {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(at[0], at[1], at[2]);
  if (fn) {
    const gk = page.key + ':' + (key ?? name);
    const geo = cachedGeo(gk, page, fn);
    if (geo.index && geo.index.count > 0) {
      const mesh = new THREE.Mesh(geo, beastMaterial());
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.userData.gk = gk;
      mesh.userData.page = page.key;
      g.add(mesh);
    }
  }
  parent.add(g);
  rig.parts[name] = g;
  return g;
}
/** the mesh of a part (for breathing scale etc.) */
export const meshOf = (g: THREE.Object3D | undefined) => (g?.children.find((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh | undefined);

const VARIANT_GEO = new Map<string, THREE.BufferGeometry>();
/** geometry of a cached part remapped onto texture variant k */
function variantGeo(gk: string, base: THREE.BufferGeometry, page: Page, k: number) {
  if (k === 0) return base;
  const key = gk + '|' + k;
  let g = VARIANT_GEO.get(key);
  if (g) return g;
  g = base.clone();
  const r0 = atlas().get(page.tex(0)), rk = atlas().get(page.tex(k));
  const A = g.getAttribute('aAtlas') as THREE.BufferAttribute;
  for (let i = 0; i < A.count; i++) if (Math.abs(A.getX(i) - r0.u0) < 1e-6 && Math.abs(A.getY(i) - r0.v0) < 1e-6) A.setXY(i, rk.u0, rk.v0);
  A.needsUpdate = true;
  VARIANT_GEO.set(key, g);
  return g;
}
const PAGES = new Map<string, Page>();
export function registerPage(p: Page) { PAGES.set(p.key, p); return p; }

/**
 * Give a rig its individual look once (texture variant and size), seeded by
 * the creature id so every peer sees the same animal.
 */
export function applyLook(rig: Rig, c: Creature, page: Page, sizeVar = 0.06): number {
  const ud = rig.root.userData;
  if (ud.lookId === c.id) return ud.lookK as number;
  ud.lookId = c.id;
  const k = Math.floor(hash01(c.id, 3) * page.variants) % page.variants;
  ud.lookK = k;
  rig.root.traverse((o) => {
    const m = o as THREE.Mesh;
    const gk = m.userData?.gk as string | undefined;
    if (!m.isMesh || !gk || m.userData.page !== page.key) return;
    const base = GEO.get(gk);
    if (base) m.geometry = variantGeo(gk, base, page, k);
  });
  const s = 1 + (hash01(c.id, 5) - 0.5) * 2 * sizeVar;
  ud.size = s;
  rig.body.scale.setScalar(s);
  return k;
}

// =====================================================================================
// IK and gait
// =====================================================================================
/**
 * Planar two-bone IK in a leg's YZ plane. Target (fy, fz) relative to the hip
 * (y up, z forward). Bones hang along -y at rotation 0; positive rotation.x
 * swings toward -z. bend +1: the knee points forward (hind stifle), -1 back.
 * Returns [hip rotation.x, knee rotation.x] into `out`.
 */
export function ik2(fy: number, fz: number, L1: number, L2: number, bend: number, out: number[]): number[] {
  let d = Math.hypot(fy, fz);
  const dmax = (L1 + L2) * 0.999, dmin = Math.abs(L1 - L2) * 1.02 + 1e-4;
  d = clamp(d, dmin, dmax);
  const a = Math.atan2(-fz, -fy);
  const ca = clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1);
  const cb = clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1);
  const alpha = Math.acos(ca), beta = Math.acos(cb);
  out[0] = a - bend * alpha;
  out[1] = bend * (Math.PI - beta);
  return out;
}

export interface LegSpec {
  /** upper / lower part names (lower rotates at the knee) */
  up: string; lo: string;
  /** optional third part kept level with the ground (hooves, paws) */
  foot?: string;
  L1: number; L2: number;
  bend: 1 | -1;
  /** gait phase offset 0..1 */
  ph: number;
  /** foot rest offset from below the hip (root space x / z) */
  restX?: number; restZ?: number;
  /** rest pitch of the foot part relative to the lower bone's direction */
  footPitch?: number;
  front: boolean;
  side: 1 | -1;
  /** turn the leg's bending plane about the vertical through the hip (knees out: spider stance) */
  yaw?: number;
}

export interface GaitParams {
  /** duty factor (fraction of the cycle a foot is on the ground) */
  duty: number;
  /** cycles per second at zero speed and per m/s */
  f0: number; fk: number;
  /** max stride (m) */
  maxStride: number;
  /** swing lift (m) */
  lift: number;
}
export const WALK: GaitParams = { duty: 0.64, f0: 0.9, fk: 0.55, maxStride: 0.55, lift: 0.07 };

export interface GaitState {
  ph: number; spd: number; px: number; pz: number; init: boolean; turn: number; lastF: number; w: number;
  /** per-leg planted foot positions in root space while a leg is lame */
  feet: number[];
}
export function gaitState(ud: Record<string, any>): GaitState {
  return ud.gait || (ud.gait = { ph: 0, spd: 0, px: 0, pz: 0, init: false, turn: 0, lastF: 0, w: 0, feet: [] });
}

/** measured ground speed (m/s) and turn rate, smoothed; works for host and clients */
export function trackMotion(gs: GaitState, c: Creature, dt: number, fallback = true) {
  if (!gs.init) { gs.px = c.x; gs.pz = c.z; gs.lastF = c.facing; gs.init = true; }
  const d = Math.hypot(c.x - gs.px, c.z - gs.pz);
  gs.px = c.x; gs.pz = c.z;
  let v = dt > 0 ? d / dt : 0;
  if (v > 15) v = 0; // teleport
  if (!fallback) v = Math.min(v, c.speed + 0.5);
  gs.spd += (v - gs.spd) * damp(8, dt);
  const df = wrapA(c.facing - gs.lastF); gs.lastF = c.facing;
  gs.turn += ((dt > 0 ? df / dt : 0) - gs.turn) * damp(8, dt);
}

const _chain: THREE.Object3D[] = new Array(8);
const _M = new THREE.Matrix4(), _Mi = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Vector3(), _ik = [0, 0];

/** is a named part gone (cut off by gore, hidden by limb loss, or listed in mem.severed) */
export function partGone(rig: Rig, c: Creature | null, name: string): boolean {
  const p = rig.parts[name];
  if (!p || !p.parent || !p.visible) return true;
  const s = (c?.mem?.severed as string[] | undefined);
  return !!s && s.includes(name);
}

/**
 * Pose legs for one frame: gait foot targets in root space (ground y = 0),
 * transformed into the parent (torso) frame and solved with ik2. `phAdv`
 * advances the shared phase. Returns the support weight (0 idle .. 1 moving).
 * `lame` legs (missing lower part) are tucked instead of placed.
 */
export function poseLegs(rig: Rig, legs: LegSpec[], gs: GaitState, gp: GaitParams, speed: number, dt: number, o: {
  crouch?: number; stride?: number; spread?: number; lame?: boolean[]; liftMul?: number; freeze?: boolean; footY?: number;
} = {}) {
  const moving = clamp01((Math.abs(speed) - 0.05) / 0.35);
  const turning = clamp01(Math.abs(gs.turn) / 2.2) * (1 - moving);
  const w = Math.max(moving, turning * 0.6);
  gs.w += (w - gs.w) * damp(6, dt);
  const f = gp.f0 + gp.fk * Math.abs(speed);
  let stride = Math.abs(speed) * gp.duty / Math.max(0.2, f);
  let freq = f;
  if (stride > gp.maxStride) { stride = gp.maxStride; freq = Math.abs(speed) * gp.duty / gp.maxStride; }
  if (o.stride !== undefined) stride = o.stride;
  if (!o.freeze) gs.ph = (gs.ph + freq * dt * Math.max(gs.w, 0.001) * (gs.w > 0.02 ? 1 : 0)) % 1;
  const dir = speed < 0 ? -1 : 1;
  rig.root.updateMatrix(); rig.body.updateMatrix();
  for (let i = 0; i < legs.length; i++) {
    const L = legs[i];
    const up = rig.parts[L.up], lo = rig.parts[L.lo];
    if (!up || !lo) continue;
    const par = up.parent!;
    // parent frame relative to the root: body * (torso ...)
    _M.identity();
    let nc = 0;
    for (let o2: THREE.Object3D | null = par; o2 && o2 !== rig.root && nc < _chain.length; o2 = o2.parent) _chain[nc++] = o2;
    for (let k = nc - 1; k >= 0; k--) { _chain[k].updateMatrix(); _M.multiply(_chain[k].matrix); }
    // hip in root space
    _p.copy(up.position).applyMatrix4(_M);
    if (o.lame?.[i]) {
      // tuck the stump up under the body, twitching with the gait
      up.rotation.set(L.front ? -0.9 : 0.6, 0, 0);
      lo.rotation.set(L.bend * 1.2, 0, 0);
      continue;
    }
    const p = (gs.ph + L.ph) % 1;
    let fz = 0, fy = 0;
    const D = gp.duty;
    if (p < D) { fz = (0.5 - p / D) * stride * dir; }
    else { const t = (p - D) / (1 - D); fz = (-0.5 + smooth(t)) * stride * dir; fy = Math.pow(Math.sin(Math.PI * t), 0.8) * gp.lift * (o.liftMul ?? 1) * gs.w; }
    fz *= gs.w;
    const sx = (L.restX ?? 0) * (o.spread ?? 1);
    // root-space target, scaled by the body scale (ground stays at 0)
    const bs = rig.body.scale.y || 1;
    _q.set(_p.x + sx * L.side, (o.footY ?? 0) + fy, _p.z + (L.restZ ?? 0) * bs + fz);
    // into the parent frame
    _Mi.copy(_M).invert();
    _q.applyMatrix4(_Mi);
    const dy = _q.y - up.position.y;
    let dz = _q.z - up.position.z, dx = _q.x - up.position.x;
    const yaw = L.yaw ?? 0;
    if (yaw !== 0) {
      // solve in the turned plane: bring the target into the leg's yawed frame
      const cs = Math.cos(yaw), sn = Math.sin(yaw);
      const rx = dx * cs - dz * sn, rz = dx * sn + dz * cs;
      dx = rx; dz = rz;
      up.rotation.order = 'YXZ';
    }
    ik2(dy, dz, L.L1, L.L2, L.bend, _ik);
    up.rotation.set(_ik[0], yaw, clamp(Math.atan2(dx, -dy), -0.5, 0.5));
    lo.rotation.set(_ik[1], 0, 0);
    if (L.foot) {
      const ft = rig.parts[L.foot];
      if (ft) {
        // keep the foot level with the ground: undo the chain's pitch (plus the parent's)
        const parentPitch = Math.atan2(_M.elements[6], _M.elements[5]);
        const lift = p >= D ? Math.sin(Math.PI * (p - D) / (1 - D)) * 0.6 * gs.w : 0;
        ft.rotation.x = -(_ik[0] + _ik[1] + parentPitch) + (L.footPitch ?? 0) + lift * L.bend * -1;
      }
    }
  }
  return gs.w;
}

/** per-frame helpers kept on the rig */
export interface AnimMem {
  atk: number; atkOn: boolean; hp: number; flinch: number; flinchDir: number; look: number; lookP: number; dead: number; t: number; [k: string]: any;
}
export function animMem(rig: Rig, c: Creature): AnimMem {
  const ud = rig.root.userData;
  let m = ud.am as AnimMem | undefined;
  if (!m) m = ud.am = { atk: 9, atkOn: false, hp: c.hp, flinch: 0, flinchDir: 1, look: 0, lookP: 0, dead: 0, t: 0 };
  return m;
}
/** attack timeline (seconds since the strike started; 9 = idle) and hit flinch, host and clients alike */
export function tickEvents(m: AnimMem, c: Creature, dt: number) {
  const on = c.attackPhase > 0;
  if (on && !m.atkOn) m.atk = 0;
  m.atkOn = on;
  m.atk = Math.min(9, m.atk + dt);
  if (c.hp < m.hp - 0.01 || c.hitFlash > 0.12) { if (m.flinch < 0.1) { m.flinch = 0.35; m.flinchDir = Math.random() < 0.5 ? -1 : 1; } }
  m.hp = c.hp;
  m.flinch = Math.max(0, m.flinch - dt);
  m.dead = c.dead ? m.dead + dt : 0;
}

/** yaw/pitch toward the creature's target player in rig space (0 when none) */
export function lookAtTarget(rig: Rig, c: Creature, players: Map<string, { x: number; z: number }> | undefined, out: number[]): boolean {
  out[0] = 0; out[1] = 0;
  const id = c.targetId || c.tamedBy;
  if (!id || !players) return false;
  const p = players.get(id);
  if (!p) return false;
  const dx = p.x - c.x, dz = p.z - c.z;
  const d = Math.hypot(dx, dz);
  if (d > 18 || d < 0.05) return false;
  const a = rig.root.rotation.y;
  // world -> rig local (rig faces +z)
  const lx = dx * Math.cos(a) - dz * Math.sin(a), lz = dx * Math.sin(a) + dz * Math.cos(a);
  out[0] = Math.atan2(lx, lz);
  out[1] = Math.atan2(1.2, d);
  return true;
}

// =====================================================================================
// shared painting / body-plan helpers
// =====================================================================================
/** a hand-built ramp: cold deep shadow -> base -> warm pale highlight */
export function ramp(base: number, n: number, shadow: number, hi: number): number[] {
  const mid = Math.floor(n * 0.55), light = mixHex(base, 0xfff0dc, hi);
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(i <= mid ? mixHex(shadow, base, Math.pow(i / mid, 0.75)) : mixHex(base, light, (i - mid) / (n - 1 - mid)));
  return out;
}
/** angle from the belly (0) round to the spine (PI) for a bodyRing angle */
export const ab = (th: number) => Math.min(th, Math.PI * 2 - th);
/** column (0..1) of an angle measured from the belly on side +1 / -1 */
export const uOf = (a: number, side: number) => (side > 0 ? a : Math.PI * 2 - a) / (Math.PI * 2);

/** per-region level buffer so strokes can sample what is underneath */
export class Lv {
  f: Float32Array;
  constructor(readonly r: Reg) { this.f = new Float32Array(r.w * r.h); }
  get = (x: number, y: number) => this.f[clamp(Math.round(y), 0, this.r.h - 1) * this.r.w + (((Math.round(x) % this.r.w) + this.r.w) % this.r.w)];
}
/** fill a region with ramp levels (remembered for strokes) */
export function fillLv(Pt: Painter, r: Reg, R: number[], fn: (u: number, v: number, x: number, y: number) => number, dither = 0.25, mask?: (u: number, v: number, x: number, y: number) => boolean): Lv {
  const L = new Lv(r);
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
    const u = (x + 0.5) / r.w, vv = 1 - (y + 0.5) / r.h;
    if (mask && !mask(u, vv, x, y)) continue;
    const l = fn(u, vv, x, y);
    L.f[y * r.w + x] = l;
    Pt.put(r, x, y, R, l, dither);
  }
  return L;
}

/** a body cross-section row: z along the body, centre height, half width, height above / below centre */
export interface Row { z: number; cy: number; rx: number; up: number; dn: number; sq?: number }
export function sampleRows(rows: Row[], z: number): Row {
  if (z <= rows[0].z) return { ...rows[0], z };
  for (let i = 0; i + 1 < rows.length; i++) {
    const a = rows[i], b = rows[i + 1];
    if (z <= b.z) {
      const l = (z - a.z) / (b.z - a.z || 1), t = smooth(l) * 0.5 + l * 0.5;
      return { z, cy: lerp(a.cy, b.cy, t), rx: lerp(a.rx, b.rx, t), up: lerp(a.up, b.up, t), dn: lerp(a.dn, b.dn, t), sq: lerp(a.sq ?? 2, b.sq ?? 2, t) };
    }
  }
  return { ...rows[rows.length - 1], z };
}

/** what the creature manager does to a corpse (lie on its side, resting on the floor), for gallery previews */
export function galleryDeathRoll(rig: Rig, dead: boolean, rz = Math.PI / 2) {
  const ud = rig.root.userData;
  if (!dead) { if (ud.gRest !== undefined) { rig.body.rotation.z = 0; ud.gRest = undefined; } return; }
  if (ud.gRest === undefined) {
    rig.body.rotation.z = rz; rig.body.position.y = 0;
    rig.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(rig.body);
    ud.gRest = box.isEmpty() ? 0 : Math.min(0.3, rig.root.position.y + 0.015 - box.min.y);
  }
  rig.body.rotation.z = rz;
  rig.body.position.y = ud.gRest;
}

/** the URL ?pose= override for gallery previews */
export function galleryPoseParam(): string { try { return new URLSearchParams(location.search).get('pose') || ''; } catch { return ''; } }

/**
 * Drive a species' animate() from the asset gallery with a fake creature:
 * poses cycle every 4 s (or ?pose=...). `setup` maps a pose to state/speed.
 */
export function galleryDriver(key: string, poses: string[], anim: (rig: Rig, c: Creature, t: number, dt: number) => void,
  setup: (pose: string, fc: any, t: number) => void) {
  return (rig: Rig, t: number) => {
    const ud = rig.root.userData;
    const pose = galleryPoseParam() || poses[Math.floor(t / 4) % poses.length];
    const fc: any = ud.fake || (ud.fake = { id: 'g-' + key, x: 0, z: 0, y: 0, facing: Math.PI / 2, speed: 0, state: 'idle', mem: {}, attackPhase: 0, hp: 30, hitFlash: 0, dead: false, deathT: 0, targetId: null, tamedBy: null, phase: 0, observed: false, stateT: 0 });
    fc.speed = 0; fc.attackPhase = 0; fc.dead = false; fc.observed = false; fc.tamedBy = null;
    setup(pose, fc, t);
    fc.z += fc.speed * (1 / 60); fc.x = 0; fc.facing = Math.PI / 2;
    fc.stateT = (fc.stateT ?? 0) + 1 / 60;
    if (fc.dead) fc.deathT = (fc.deathT ?? 0) + 1 / 60; else fc.deathT = 0;
    const px = rig.root.position.x, pz = rig.root.position.z;
    anim(rig, fc, t, 1 / 60);
    rig.root.position.set(px, 0, pz);
    galleryDeathRoll(rig, fc.dead);
  };
}
