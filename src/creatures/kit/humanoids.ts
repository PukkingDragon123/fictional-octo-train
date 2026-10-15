// Skinned humanoid kit for creatures: one low-poly skinned mesh per creature
// (lofted cross-section rings like the survivors' bodies, see
// src/entities/humanModel.ts) textured from a hand-painted 256 px page at
// about twice the world's texel density. Species describe a skeleton, a page
// layout, a geometry builder and a painter; the kit caches geometry and pages
// per variant, builds the rig (bones are plain Groups in rig.parts, so poses
// and the gore system keep working) and keeps severed / hidden parts honest:
//  - every bone carries an invisible proxy whose bounding box sizes cuts and
//    whose clone() is that segment of the body as a static mesh with a painted
//    cross-section cap (gore clones parts into gibs);
//  - a bone that was cut off (detached) or hidden (limb loss) has its skinned
//    vertices collapsed into the joint and a painted stump cap shown there.
import * as THREE from 'three';
import { worldMaterial } from '../../gfx/materials';
import { PixelCanvas, bayer } from '../../gfx/pixel';
import { tileFbm } from '../../core/rng';
import { G } from '../../game/G';
import type { Rig } from '../species';
import type { Creature } from '../creature';

export type V3 = number[];
/** skin weights: [boneIndex, weight, boneIndex, weight, ...] (up to 4) */
export type Wt = number[];

// =====================================================================================
// page + regions (painting)
// =====================================================================================
export const KPAD = 3;
const NOISE = new Map<string, Float32Array>();

/** a rectangle of the page; u wraps (tubes), v clamps. range maps reference heights to rows. */
export class Region {
  constructor(public page: Page | null, public name: string, public x: number, public y: number, public w: number, public h: number, public range: number[] = [0, 1]) {}
  /** column of an angle in degrees (0 = front, +90 = the outer / +x side) */
  X(deg: number) { return (0.5 + deg / 360) * this.w; }
  /** row of a reference height */
  Y(v: number) { return (1 - (v - this.range[0]) / (this.range[1] - this.range[0])) * this.h; }
  deg(x: number) { return ((x + 0.5) / this.w - 0.5) * 360; }
  yAt(row: number) { return this.range[0] + (1 - (row + 0.5) / this.h) * (this.range[1] - this.range[0]); }
  /** v (0 bottom .. 1 top) of a reference height */
  v(y: number) { return (y - this.range[0]) / (this.range[1] - this.range[0]); }
  private ix(x: number, y: number) {
    const xx = ((Math.floor(x) % this.w) + this.w) % this.w, yy = Math.min(this.h - 1, Math.max(0, Math.floor(y)));
    return [this.x + xx, this.y + yy];
  }
  inside(y: number) { return y >= 0 && y < this.h; }
  set(x: number, y: number, c: number) { if (!this.inside(Math.floor(y))) return; const [a, b] = this.ix(x, y); this.page!.pc.set(a, b, c); }
  get(x: number, y: number) { const [a, b] = this.ix(x, y); return this.page!.pc.get(a, b); }
  blend(x: number, y: number, c: number, t: number) { if (!this.inside(Math.floor(y))) return; const [a, b] = this.ix(x, y); this.page!.pc.blend(a, b, c, t); }
  shade(x: number, y: number, f: number) { if (!this.inside(Math.floor(y))) return; const [a, b] = this.ix(x, y); this.page!.pc.shade(a, b, f); }
  dither(x: number, y: number, c: number, t: number) { if (t > bayer(Math.floor(x), Math.floor(y))) this.set(x, y, c); }
  /** dithered write of a fractional ramp index */
  put(x: number, y: number, R: number[], v: number, dither = 0.5) {
    let i = Math.floor(v);
    if (v - i > 0.5 + (bayer(Math.floor(x), Math.floor(y)) - 0.5) * dither) i++;
    this.set(x, y, R[i < 0 ? 0 : i >= R.length ? R.length - 1 : i]);
  }
  fill(R: number[], fn: (x: number, y: number) => number, mask?: (x: number, y: number) => boolean, dither = 0.5) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) { if (mask && !mask(x, y)) continue; this.put(x, y, R, fn(x, y), dither); }
  }
  rect(x: number, y: number, w: number, h: number, c: number) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c); }
  rectBlend(x: number, y: number, w: number, h: number, c: number, t: number) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.blend(x + i, y + j, c, t); }
  hline(x0: number, x1: number, y: number, c: number, t = 1) { for (let x = Math.round(Math.min(x0, x1)); x <= Math.round(Math.max(x0, x1)); x++) this.blend(x, y, c, t); }
  vline(x: number, y0: number, y1: number, c: number, t = 1) { for (let y = Math.round(Math.min(y0, y1)); y <= Math.round(Math.max(y0, y1)); y++) this.blend(x, y, c, t); }
  line(x0: number, y0: number, x1: number, y1: number, c: number, t = 1) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let n = 0; n < 2000; n++) {
      this.blend(x0, y0, c, t);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, c: number, t = 1) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) this.blend(x, y, c, t);
    }
  }
  /** dithered soft blob */
  blob(cx: number, cy: number, rx: number, ry: number, c: number, strength = 1) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d <= 1 && (1 - d) * strength > bayer(x & 1023, y & 1023)) this.set(x, y, c);
    }
  }
  /** soft alpha blob */
  glow(cx: number, cy: number, rx: number, ry: number, c: number, t: number) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      const d = dx * dx + dy * dy;
      if (d <= 1) this.blend(x, y, c, t * (1 - d));
    }
  }
  /** tileable fbm over the region (cached) */
  fbm(x: number, y: number, cells = 3, oct = 2, seed = 0) {
    const w = this.w, h = this.h;
    const key = w + 'x' + h + ':' + cells + ':' + oct + ':' + seed;
    let f = NOISE.get(key);
    if (!f) {
      f = new Float32Array(w * h);
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) f[j * w + i] = tileFbm(i, j, w, h, cells, oct, seed);
      NOISE.set(key, f);
    }
    const xi = ((Math.floor(x) % w) + w) % w, yi = ((Math.floor(y) % h) + h) % h;
    return f[yi * w + xi];
  }
  /** a wandering hairline crack (random walk) */
  crack(x: number, y: number, len: number, dirDeg: number, c: number, seed: number, t = 1, branch = 0.12, hi?: number) {
    let a = (dirDeg * Math.PI) / 180, px = x, py = y;
    for (let i = 0; i < len; i++) {
      this.blend(px, py, c, t);
      if (hi !== undefined) this.blend(px + 1, py + 1, hi, t * 0.5);
      a += (hash(i, seed) - 0.5) * 0.9;
      px += Math.cos(a); py += Math.sin(a);
      if (branch > 0 && hash(i, seed + 7) < branch && len > 6) this.crack(px, py, Math.floor(len * 0.4), (a * 180) / Math.PI + (hash(i, seed + 3) < 0.5 ? 50 : -50), c, seed * 3 + i, t * 0.8, 0, hi);
    }
  }
}

export const hash = (a: number, b = 0) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

/** a 256 px page split into regions by a shelf packer (deterministic: same order, same layout) */
export class Page {
  pc: PixelCanvas;
  regs = new Map<string, Region>();
  private cx = 0; private cy = 0; private rowH = 0;
  constructor(public W = 256, public H = 256, paint = true) {
    this.pc = paint ? new PixelCanvas(W, H) : (null as any);
    if (this.pc) this.pc.wrap = false;
  }
  reg(name: string, w: number, h: number, range: number[] = [0, 1]): Region {
    const W = w + KPAD * 2, H = h + KPAD * 2;
    if (this.cx + W > this.W) { this.cx = 0; this.cy += this.rowH; this.rowH = 0; }
    if (this.cy + H > this.H) throw new Error('kit page overflow: ' + name);
    const r = new Region(this.pc ? this : null, name, this.cx + KPAD, this.cy + KPAD, w, h, range);
    this.cx += W; this.rowH = Math.max(this.rowH, H);
    this.regs.set(name, r);
    return r;
  }
  R(name: string) { const r = this.regs.get(name); if (!r) throw new Error('no region ' + name); return r; }
  /** extend every region into its padding (u wraps, v clamps) so mips never bleed */
  finish() {
    const d = this.pc.data, W = this.W;
    for (const r of this.regs.values()) {
      for (let y = -KPAD; y < r.h + KPAD; y++) {
        const sy = Math.min(r.h - 1, Math.max(0, y));
        for (let x = -KPAD; x < r.w + KPAD; x++) {
          if (y >= 0 && y < r.h && x >= 0 && x < r.w) continue;
          const sx = ((x % r.w) + r.w) % r.w;
          const si = ((r.y + sy) * W + r.x + sx) * 4, di = ((r.y + y) * W + r.x + x) * 4;
          if (r.y + y < 0 || r.y + y >= this.H || r.x + x < 0 || r.x + x >= W) continue;
          d[di] = d[si]; d[di + 1] = d[si + 1]; d[di + 2] = d[si + 2]; d[di + 3] = 255;
        }
      }
    }
    for (let i = 3; i < d.length; i += 4) d[i] = 255;
  }
}

// =====================================================================================
// geometry builder (adapted from the survivors' SkinBuilder, any page size)
// =====================================================================================
export class SkinB {
  P: number[] = []; UV: number[] = []; C: number[] = []; SI: number[] = []; SW: number[] = []; I: number[] = []; G: number[] = []; FX: number[] = [];
  constructor(public W = 256, public H = 256) {}
  vert(p: V3, px: number, py: number, w: Wt, g: number, c = 1, emis = 0): number {
    this.P.push(p[0], p[1], p[2]);
    this.UV.push(px / this.W, 1 - py / this.H);
    this.C.push(c, c, c);
    this.G.push(g);
    this.FX.push(emis, 0);
    let tot = 0;
    const si = [0, 0, 0, 0], sw = [0, 0, 0, 0];
    for (let k = 0; k < 4 && k * 2 < w.length; k++) { si[k] = w[k * 2]; sw[k] = Math.max(0, w[k * 2 + 1]); tot += sw[k]; }
    for (let k = 0; k < 4; k++) sw[k] = tot > 0 ? sw[k] / tot : (k === 0 ? 1 : 0);
    this.SI.push(si[0], si[1], si[2], si[3]); this.SW.push(sw[0], sw[1], sw[2], sw[3]);
    return this.P.length / 3 - 1;
  }
  tri(a: number, b: number, c: number) { this.I.push(a, b, c); }
  pos(i: number): V3 { return [this.P[i * 3], this.P[i * 3 + 1], this.P[i * 3 + 2]]; }
  triOut(a: number, b: number, c: number, inside: V3, flip = false) {
    const A = this.pos(a), B = this.pos(b), C = this.pos(c);
    const n = cross(sub(B, A), sub(C, A));
    const m = [(A[0] + B[0] + C[0]) / 3 - inside[0], (A[1] + B[1] + C[1]) / 3 - inside[1], (A[2] + B[2] + C[2]) / 3 - inside[2]];
    if ((dot(n, m) >= 0) !== flip) this.tri(a, b, c); else this.tri(a, c, b);
  }
  /** loft through rings of equal point count (seam point duplicated at the end); poles close the ends */
  loft(rings: { pts: V3[]; v: number; w: Wt | ((p: V3, j: number) => Wt); c?: number }[], us: number[], reg: Region, g: number,
    o: { start?: V3 | null; end?: V3 | null; startV?: number; endV?: number; startW?: Wt; endW?: Wt; double?: boolean; flip?: boolean; skip?: (j: number) => boolean; emis?: number } = {}) {
    const n = us.length;
    const idx: number[][] = [];
    const cents: V3[] = rings.map((r) => centroid(r.pts.slice(0, n - 1)));
    const emis = o.emis ?? 0;
    for (const r of rings) {
      const row: number[] = [];
      for (let j = 0; j < n; j++) {
        const p = r.pts[j];
        const w = typeof r.w === 'function' ? r.w(p, j) : r.w;
        row.push(this.vert(p, reg.x + us[j] * reg.w, reg.y + (1 - r.v) * reg.h, w, g, r.c ?? 1, emis));
      }
      idx.push(row);
    }
    const emit = (flip: boolean, rows: number[][]) => {
      for (let i = 0; i + 1 < rows.length; i++) {
        const ins = mid(cents[i], cents[i + 1]);
        for (let j = 0; j + 1 < n; j++) {
          if (o.skip?.(j)) continue;
          const a = rows[i][j], b = rows[i][j + 1], c = rows[i + 1][j + 1], d = rows[i + 1][j];
          const A = this.pos(a), B = this.pos(b), C = this.pos(c), D = this.pos(d);
          let nrm = cross(sub(B, A), sub(C, A));
          if (len(nrm) < 1e-10) nrm = cross(sub(C, A), sub(D, A));
          const out = dot(nrm, sub(mid(A, C), ins)) >= 0;
          if (out !== flip) { this.tri(a, b, c); this.tri(a, c, d); } else { this.tri(a, c, b); this.tri(a, d, c); }
        }
      }
    };
    emit(!!o.flip, idx);
    if (o.double) {
      const inner = rings.map((r) => r.pts.map((p, j) => {
        const w = typeof r.w === 'function' ? r.w(p, j) : r.w;
        return this.vert(p, reg.x + us[j] * reg.w, reg.y + (1 - r.v) * reg.h, w, g + 5000, (r.c ?? 1) * 0.65, emis);
      }));
      emit(!o.flip, inner);
    }
    const all = centroid(cents);
    const pole = (P: V3, ring: number[], v: number, w: Wt | undefined, rw: Wt | ((p: V3, j: number) => Wt), rp: V3[]) => {
      for (let j = 0; j + 1 < n; j++) {
        if (o.skip?.(j)) continue;
        const ww = w || (typeof rw === 'function' ? rw(rp[j], j) : rw);
        const pi = this.vert(P, reg.x + ((us[j] + us[j + 1]) / 2) * reg.w, reg.y + (1 - v) * reg.h, ww, g, 1, emis);
        this.triOut(pi, ring[j], ring[j + 1], all, !!o.flip);
      }
    };
    if (o.start) pole(o.start, idx[0], o.startV ?? rings[0].v, o.startW, rings[0].w, rings[0].pts);
    if (o.end) pole(o.end, idx[idx.length - 1], o.endV ?? rings[rings.length - 1].v, o.endW, rings[rings.length - 1].w, rings[rings.length - 1].pts);
    return idx;
  }
  /** flat-shaded box mapped onto (a sub-rect of) a region */
  box(c: V3, size: V3, rot: THREE.Matrix4 | null, reg: Region, w: Wt, subr: [number, number, number, number] = [0, 0, 1, 1], col = 1, emis = 0) {
    const [hx, hy, hz] = [size[0] / 2, size[1] / 2, size[2] / 2];
    const corners: V3[] = [];
    const v = new THREE.Vector3();
    for (const z of [-hz, hz]) for (const y of [-hy, hy]) for (const x of [-hx, hx]) {
      v.set(x, y, z); if (rot) v.applyMatrix4(rot);
      corners.push([c[0] + v.x, c[1] + v.y, c[2] + v.z]);
    }
    const [u0, v0, u1, v1] = subr;
    const faces = [[0, 1, 3, 2], [5, 4, 6, 7], [4, 0, 2, 6], [1, 5, 7, 3], [2, 3, 7, 6], [4, 5, 1, 0]];
    for (const f of faces) {
      const ids = f.map((k, i) => {
        const uu = i === 0 || i === 3 ? u0 : u1, vv = i < 2 ? v0 : v1;
        return this.vert(corners[k], reg.x + uu * reg.w, reg.y + (1 - vv) * reg.h, w, -1, col, emis);
      });
      this.triOut(ids[0], ids[1], ids[2], c); this.triOut(ids[0], ids[2], ids[3], c);
    }
  }
  /** a single (optionally double-sided) quad a-b-c-d with a region sub-rect (a = u0v0, b = u1v0, c = u1v1, d = u0v1) */
  quad(a: V3, b: V3, c: V3, d: V3, reg: Region, subr: [number, number, number, number], w: Wt | Wt[], double = false, col = 1) {
    const [u0, v0, u1, v1] = subr;
    const uv = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
    const ws = Array.isArray(w[0]) ? (w as Wt[]) : [w as Wt, w as Wt, w as Wt, w as Wt];
    const mk = (cc: number) => [a, b, c, d].map((p, i) => this.vert(p, reg.x + uv[i][0] * reg.w, reg.y + (1 - uv[i][1]) * reg.h, ws[i], -1, cc));
    const f = mk(col);
    this.tri(f[0], f[1], f[2]); this.tri(f[0], f[2], f[3]);
    if (double) { const g = mk(col * 0.7); this.tri(g[0], g[2], g[1]); this.tri(g[0], g[3], g[2]); }
  }
  get tris() { return this.I.length / 3; }
  build(sphere?: [number, number, number, number]): THREE.BufferGeometry {
    const nv = this.P.length / 3;
    const N = new Float32Array(nv * 3);
    for (let t = 0; t < this.I.length; t += 3) {
      const a = this.I[t], b = this.I[t + 1], c = this.I[t + 2];
      const n = cross(sub(this.pos(b), this.pos(a)), sub(this.pos(c), this.pos(a)));
      for (const k of [a, b, c]) { N[k * 3] += n[0]; N[k * 3 + 1] += n[1]; N[k * 3 + 2] += n[2]; }
    }
    const groups = new Map<string, number[]>();
    for (let i = 0; i < nv; i++) {
      const g = this.G[i]; if (g < 0) continue;
      const key = g + ':' + Math.round(this.P[i * 3] * 2000) + ',' + Math.round(this.P[i * 3 + 1] * 2000) + ',' + Math.round(this.P[i * 3 + 2] * 2000);
      let l = groups.get(key); if (!l) groups.set(key, l = []); l.push(i);
    }
    for (const l of groups.values()) {
      if (l.length < 2) continue;
      let x = 0, y = 0, z = 0;
      for (const i of l) { x += N[i * 3]; y += N[i * 3 + 1]; z += N[i * 3 + 2]; }
      for (const i of l) { N[i * 3] = x; N[i * 3 + 1] = y; N[i * 3 + 2] = z; }
    }
    for (let i = 0; i < nv; i++) { const l = Math.hypot(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]) || 1; N[i * 3] /= l; N[i * 3 + 1] /= l; N[i * 3 + 2] /= l; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.UV, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    const atl = new Float32Array(nv * 4); for (let i = 0; i < nv; i++) { atl[i * 4 + 2] = 1; atl[i * 4 + 3] = 1; }
    g.setAttribute('aAtlas', new THREE.BufferAttribute(atl, 4));
    g.setAttribute('aFx', new THREE.Float32BufferAttribute(this.FX, 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.SI, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.SW, 4));
    g.setIndex(nv > 65535 ? new THREE.Uint32BufferAttribute(this.I, 1) : new THREE.Uint16BufferAttribute(this.I, 1));
    const s = sphere || [0, 1, 0, 1.8];
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(s[0], s[1], s[2]), s[3]);
    return g;
  }
}

export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const addV = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const scl = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: V3): V3 => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const mid = (a: V3, b: V3): V3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
export function centroid(ps: V3[]): V3 { let x = 0, y = 0, z = 0; for (const p of ps) { x += p[0]; y += p[1]; z += p[2]; } const n = Math.max(1, ps.length); return [x / n, y / n, z / n]; }
export const gauss = (x: number, c: number, s: number) => Math.exp(-((x - c) * (x - c)) / (2 * s * s));
export const angd = (a: number, b: number) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const usFor = (n: number) => Array.from({ length: n + 1 }, (_, i) => i / n);

/** superellipse ring around a vertical axis: angle 0 = front (+z), +90 = +x (times mirror); seam at the back */
export function ringY(y: number, cx: number, cz: number, rx: number, rf: number, rb: number, n: number, sq = 2, mirror = 1, bump?: (th: number) => number, th0 = -Math.PI): V3[] {
  const pts: V3[] = [];
  const e = 2 / sq;
  for (let i = 0; i <= n; i++) {
    const th = th0 + (Math.PI * 2 * i) / n;
    const sx = Math.sin(th), cz_ = Math.cos(th);
    const ex = Math.sign(sx) * Math.pow(Math.abs(sx), e), ez = Math.sign(cz_) * Math.pow(Math.abs(cz_), e);
    const k = 1 + (bump ? bump(th) : 0);
    pts.push([cx + mirror * ex * rx * k, y, cz + ez * (cz_ >= 0 ? rf : rb) * k]);
  }
  return pts;
}

export interface Row { y: number; rx: number; rf: number; rb: number; sq?: number; cx?: number; cz?: number }
export function sampleRows(rows: Row[], y: number): Row {
  const asc = rows[0].y < rows[rows.length - 1].y;
  const r = asc ? rows : [...rows].reverse();
  if (y <= r[0].y) return { sq: 2, cx: 0, cz: 0, ...r[0], y };
  if (y >= r[r.length - 1].y) return { sq: 2, cx: 0, cz: 0, ...r[r.length - 1], y };
  for (let i = 0; i + 1 < r.length; i++) {
    const a = r[i], b = r[i + 1];
    if (y >= a.y && y <= b.y) {
      const t = (y - a.y) / (b.y - a.y || 1);
      const L = (p: number, q: number) => p + (q - p) * t;
      return { y, rx: L(a.rx, b.rx), rf: L(a.rf, b.rf), rb: L(a.rb, b.rb), sq: L(a.sq ?? 2, b.sq ?? 2), cx: L(a.cx ?? 0, b.cx ?? 0), cz: L(a.cz ?? 0, b.cz ?? 0) };
    }
  }
  return { ...r[0], y };
}

/**
 * Vertical tube through a profile (rows in local metres, measured from `at`).
 * ys: ring heights (default: the rows' own); w(y): skin weights per ring;
 * vr: reference range mapped onto the region's v; mirror -1 for right-side limbs.
 */
export function tube(B: SkinB, o: {
  rows: Row[]; ys?: number[]; n: number; reg: Region; vr?: number[]; at?: V3; w: (y: number, p: V3) => Wt; g: number;
  mirror?: number; bump?: (th: number, y: number) => number; start?: V3 | boolean; end?: V3 | boolean; startW?: Wt; endW?: Wt; double?: boolean; skip?: (j: number) => boolean; us?: number[]; scale?: (y: number) => number;
}) {
  const at = o.at || [0, 0, 0];
  const ys = o.ys || o.rows.map((r) => r.y);
  const vr = o.vr || [Math.min(...ys), Math.max(...ys)];
  const m = o.mirror ?? 1;
  const rings = ys.map((y) => {
    const r = sampleRows(o.rows, y);
    const k = o.scale ? o.scale(y) : 1;
    const pts = ringY(at[1] + y, at[0] + m * (r.cx ?? 0), at[2] + (r.cz ?? 0), r.rx * k, r.rf * k, r.rb * k, o.n, r.sq ?? 2, m, o.bump ? (th) => o.bump!(th, y) : undefined);
    return { pts, v: (y - vr[0]) / (vr[1] - vr[0]), w: (p: V3) => o.w(y, p) };
  });
  const first = ys[0], last = ys[ys.length - 1];
  const cap = (spec: V3 | boolean | undefined, y: number, dir: number): V3 | null => {
    if (!spec) return null;
    if (spec !== true) return spec as V3;
    const r = sampleRows(o.rows, y);
    return [at[0] + m * (r.cx ?? 0), at[1] + y + dir * Math.min(r.rx, r.rf) * 0.35, at[2] + (r.cz ?? 0)];
  };
  const asc = last > first;
  return B.loft(rings, o.us || usFor(o.n), o.reg, o.g, {
    start: cap(o.start, first, asc ? -1 : 1), end: cap(o.end, last, asc ? 1 : -1),
    startW: o.startW ?? o.w(first, [0, 0, 0]), endW: o.endW ?? o.w(last, [0, 0, 0]), double: o.double, skip: o.skip,
    startV: (first - vr[0]) / (vr[1] - vr[0]), endV: (last - vr[0]) / (vr[1] - vr[0]),
  });
}

/** rings perpendicular to an arbitrary path: each frame is a centre with two axes and radii */
export interface Frame { c: V3; u: V3; v: V3; ru: number; rv: number; w: Wt; tv: number; bump?: (a: number) => number }
export function frames(B: SkinB, fr: Frame[], n: number, reg: Region, g: number, o: { start?: boolean | V3; end?: boolean | V3; double?: boolean; a0?: number; us?: number[] } = {}) {
  const a0 = o.a0 ?? -Math.PI;
  const rings = fr.map((f) => {
    const pts: V3[] = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + (Math.PI * 2 * i) / n;
      const k = 1 + (f.bump ? f.bump(a) : 0);
      const cu = Math.cos(a) * f.ru * k, sv = Math.sin(a) * f.rv * k;
      pts.push([f.c[0] + f.u[0] * cu + f.v[0] * sv, f.c[1] + f.u[1] * cu + f.v[1] * sv, f.c[2] + f.u[2] * cu + f.v[2] * sv]);
    }
    return { pts, v: f.tv, w: f.w };
  });
  const tip = (spec: boolean | V3 | undefined, i: number, dir: number): V3 | null => {
    if (!spec) return null;
    if (spec !== true) return spec as V3;
    const f = fr[i], f2 = fr[i + dir] || f;
    const d = norm(sub(f.c, f2.c));
    const r = Math.min(f.ru, f.rv) * 0.4;
    return [f.c[0] + d[0] * r, f.c[1] + d[1] * r, f.c[2] + d[2] * r];
  };
  return B.loft(rings, o.us || usFor(n), reg, g, { start: tip(o.start, 0, 1), end: tip(o.end, fr.length - 1, -1), startW: fr[0].w, endW: fr[fr.length - 1].w, double: o.double });
}

/** frames along a polyline (centres), radius per point, with a stable side axis */
export function pathFrames(pts: V3[], radii: [number, number][], w: Wt[] | ((i: number) => Wt), up: V3 = [1, 0, 0], tv?: number[]): Frame[] {
  return pts.map((c, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const d = norm(sub(b, a));
    let u = norm(cross(d, up));
    if (len(cross(d, up)) < 1e-4) u = norm(cross(d, [0, 0, 1]));
    const v = norm(cross(u, d));
    return { c, u, v, ru: radii[i][0], rv: radii[i][1], w: typeof w === 'function' ? w(i) : w[i], tv: tv ? tv[i] : 1 - i / Math.max(1, pts.length - 1) };
  });
}

/** small lat-long ellipsoid (ball joints, knuckles, eyes) */
export function ellipsoid(B: SkinB, c: V3, r: V3, n: number, rings: number, reg: Region, w: Wt, g: number) {
  const rr: { pts: V3[]; v: number; w: Wt }[] = [];
  for (let i = 1; i < rings; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / rings;
    const y = Math.sin(a), k = Math.cos(a);
    rr.push({ pts: ringY(c[1] + y * r[1], c[0], c[2], r[0] * k, r[2] * k, r[2] * k, n), v: i / rings, w });
  }
  return B.loft(rr, usFor(n), reg, g, { start: [c[0], c[1] - r[1], c[2]], end: [c[0], c[1] + r[1], c[2]], startW: w, endW: w, startV: 0, endV: 1 });
}

/** blend weights between two bones over [y0, y1] (y0 -> a, y1 -> b) */
export function wLerp(y: number, y0: number, y1: number, a: number, b: number): Wt {
  const t = clamp01((y - y0) / (y1 - y0));
  if (t <= 0) return [a, 1];
  if (t >= 1) return [b, 1];
  return [a, 1 - t, b, t];
}

// =====================================================================================
// material
// =====================================================================================
/**
 * Per-rig material over a page texture with the world shader (light grid,
 * visibility, fog, outlines) plus: x glitch slices, y time, z hit flash,
 * w dithered dissolve; uClip (nx, nz, d, on) discards everything behind a
 * vertical plane (things stepping out of walls).
 */
export interface KitFx { fx: { value: THREE.Vector4 }; clip: { value: THREE.Vector4 }; tint: { value: THREE.Vector4 } }
export function kitFx(): KitFx { return { fx: { value: new THREE.Vector4(0, 0, 0, 0) }, clip: { value: new THREE.Vector4(0, 0, 0, 0) }, tint: { value: new THREE.Vector4(1, 1, 1, 0) } }; }

let warned = false;
export function patchShader(shader: { vertexShader: string; fragmentShader: string; uniforms: Record<string, any> }, F: KitFx, texGrad = true) {
  shader.uniforms.uKit = F.fx; shader.uniforms.uClip = F.clip; shader.uniforms.uKitTint = F.tint;
  let vs = shader.vertexShader, fs = shader.fragmentShader;
  vs = vs.replace('#include <common>', '#include <common>\nuniform vec4 uKit;');
  vs = vs.replace('vec4 nWp = vec4( transformed, 1.0 );', `
if (uKit.x > 0.001) {
  float band = floor(transformed.y * 13.0);
  float gt = floor(uKit.y * 11.0);
  float gh = fract(sin(band * 12.9898 + gt * 78.233) * 43758.5453);
  if (gh < uKit.x * 0.3) transformed.x += (fract(gh * 91.7) - 0.5) * 0.2 * uKit.x;
}
vec4 nWp = vec4( transformed, 1.0 );`);
  fs = fs.replace('#include <common>', '#include <common>\nuniform vec4 uKit;\nuniform vec4 uClip;\nuniform vec4 uKitTint;');
  if (texGrad) {
    if (fs.includes('texture2D( map, auv )')) fs = fs.replace('texture2D( map, auv )', 'textureGrad( map, auv, dFdx( vMapUv ), dFdy( vMapUv ) )');
    else if (!warned) { warned = true; console.warn('kit: world map chunk changed; creature mipmaps may shimmer'); }
  }
  fs = fs.replace('diffuseColor *= sampledDiffuseColor;', `diffuseColor *= sampledDiffuseColor;
if (uClip.w > 0.5 && dot(vWPos.xz, uClip.xy) < uClip.z) discard;
if (uKit.w > 0.001 && vEmis < 0.5 && bayer4(gl_FragCoord.xy) < uKit.w) discard; // glowing parts (eyes, teeth) never dissolve
if (uKitTint.w > 0.001) diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * uKitTint.rgb, uKitTint.w);
if (uKit.x > 0.001) {
  float gb = floor(vWPos.y * 24.0 + floor(uKit.y * 9.0) * 3.0);
  float gh = fract(sin(gb * 7.13 + floor(uKit.y * 10.0) * 3.71) * 4375.85);
  if (gh < uKit.x * 0.25) diffuseColor.rgb = mix(diffuseColor.rgb, gh < uKit.x * 0.09 ? vec3(1.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.9), 0.65);
}
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.86, 0.8), uKit.z);`);
  shader.vertexShader = vs; shader.fragmentShader = fs;
}

export function kitMaterial(map: THREE.Texture, F: KitFx): THREE.MeshLambertMaterial {
  const base = worldMaterial({}) as any;
  const m = new THREE.MeshLambertMaterial({ map, vertexColors: true });
  m.onBeforeCompile = (shader, renderer) => { base.onBeforeCompile?.(shader, renderer); patchShader(shader as any, F); };
  const key = base.customProgramCacheKey ? base.customProgramCacheKey() : 'base';
  m.customProgramCacheKey = () => key + '|hkit1';
  return m;
}

export function pageTexture(data: Uint8Array | Uint8ClampedArray, W: number, H: number): THREE.DataTexture {
  const tex = new THREE.DataTexture(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestMipmapNearestFilter;
  tex.generateMipmaps = true;
  tex.flipY = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

// =====================================================================================
// rig definition, cache and build
// =====================================================================================
export interface BoneSpec { name: string; parent: string; at: V3; /** severable: gets a painted cross-section cap on gibs and stumps */ cap?: boolean }
export interface BuildCtx { bi: (name: string) => number; rest: (name: string) => V3; page: Page; R: (name: string) => Region; variant: number; seed: number }
export interface KitDef {
  key: string;
  variants: number;
  W?: number; H?: number;
  /** skeleton for a variant (offsets may vary per individual) */
  bones: (variant: number) => BoneSpec[];
  /** allocate page regions (same order every time) */
  layout: (page: Page) => void;
  build: (B: SkinB, ctx: BuildCtx) => void;
  paint: (page: Page, ctx: BuildCtx) => void;
  sphere: [number, number, number, number];
  /** cross-section region for caps (default 'CAP') */
  capReg?: string;
  /** after the rig is built: extra meshes etc. */
  decorate?: (rig: KitRig, entry: KitEntry) => void;
}

interface Segment { geo: THREE.BufferGeometry | null; box: THREE.Box3; dir: V3; r: number; stumpGeo: THREE.BufferGeometry | null }
export interface KitEntry {
  def: KitDef; variant: number; bones: BoneSpec[]; rest: V3[]; geo: THREE.BufferGeometry; tex: THREE.DataTexture; gibMat: THREE.Material;
  segs: Segment[]; proxyGeo: THREE.BufferGeometry[]; tris: number; page: Page;
}
const ENTRIES = new Map<string, KitEntry>();

function restOf(bones: BoneSpec[]): V3[] {
  const idx = new Map(bones.map((b, i) => [b.name, i] as const));
  const out: V3[] = [];
  bones.forEach((b, i) => {
    const p = b.parent ? out[idx.get(b.parent)!] : [0, 0, 0];
    if (b.parent && p === undefined) throw new Error('bone parent order ' + b.name);
    out[i] = [p[0] + b.at[0], p[1] + b.at[1], p[2] + b.at[2]];
  });
  return out;
}

export function kitEntry(def: KitDef, variant: number): KitEntry {
  variant = ((variant % def.variants) + def.variants) % def.variants;
  const key = def.key + ':' + variant;
  const hit = ENTRIES.get(key);
  if (hit) return hit;
  const W = def.W ?? 256, H = def.H ?? 256;
  const bones = def.bones(variant);
  const rest = restOf(bones);
  const idx = new Map(bones.map((b, i) => [b.name, i] as const));
  const page = new Page(W, H, true);
  def.layout(page);
  const ctx: BuildCtx = {
    bi: (n) => { const i = idx.get(n); if (i === undefined) throw new Error('no bone ' + n); return i; },
    rest: (n) => rest[ctx.bi(n)], page, R: (n) => page.R(n), variant, seed: hashStr(key),
  };
  const B = new SkinB(W, H);
  def.build(B, ctx);
  const geo = B.build(def.sphere);
  def.paint(page, ctx);
  page.finish();
  const tex = pageTexture(page.pc.data, W, H);
  const gibMat = kitMaterial(tex, kitFx());
  const capReg = page.regs.get(def.capReg ?? 'CAP') || null;
  const segs = bones.map((b, i) => segment(geo, i, rest[i], b.cap ? capReg : null, W, H));
  const proxyGeo = segs.map((s) => { const g = new THREE.BufferGeometry(); g.boundingBox = s.box.clone(); g.boundingSphere = new THREE.Sphere(); s.box.getBoundingSphere(g.boundingSphere); return g; });
  const e: KitEntry = { def, variant, bones, rest, geo, tex, gibMat, segs, proxyGeo, tris: B.tris, page };
  ENTRIES.set(key, e);
  return e;
}
function hashStr(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

/** the triangles that belong to one bone (dominant weight), bone-local, plus a cross-section cap */
function segment(g: THREE.BufferGeometry, bi: number, r: V3, capReg: Region | null, W: number, H: number): Segment {
  const P = g.getAttribute('position'), SI = g.getAttribute('skinIndex'), SW = g.getAttribute('skinWeight'), I = g.getIndex()!;
  const dom = (v: number) => { let best = 0, bw = -1; for (let k = 0; k < 4; k++) { const w = SW.getComponent(v, k); if (w > bw) { bw = w; best = SI.getComponent(v, k); } } return best; };
  const keep: number[] = [];
  for (let t = 0; t < I.count; t += 3) {
    const a = I.getX(t), b = I.getX(t + 1), c = I.getX(t + 2);
    const n = (dom(a) === bi ? 1 : 0) + (dom(b) === bi ? 1 : 0) + (dom(c) === bi ? 1 : 0);
    if (n >= 2) keep.push(a, b, c);
  }
  const box = new THREE.Box3();
  if (!keep.length) { box.setFromCenterAndSize(new THREE.Vector3(), new THREE.Vector3(0.04, 0.04, 0.04)); return { geo: null, box, dir: [0, -1, 0], r: 0.02, stumpGeo: null }; }
  const map = new Map<number, number>();
  const names = ['position', 'normal', 'uv', 'color', 'aAtlas', 'aFx'];
  const attrs: Record<string, number[]> = {}; for (const n of names) attrs[n] = [];
  const idx: number[] = [];
  let cx = 0, cy = 0, cz = 0;
  for (const v of keep) {
    let ni = map.get(v);
    if (ni === undefined) {
      ni = map.size; map.set(v, ni);
      for (const name of names) {
        const at = g.getAttribute(name); if (!at) continue;
        for (let c = 0; c < at.itemSize; c++) attrs[name].push(at.getComponent(v, c) - (name === 'position' ? r[c] : 0));
      }
      const x = P.getX(v) - r[0], y = P.getY(v) - r[1], z = P.getZ(v) - r[2];
      box.expandByPoint(new THREE.Vector3(x, y, z));
      cx += x; cy += y; cz += z;
    }
    idx.push(ni);
  }
  const nv = map.size;
  const dir = norm([cx / nv, cy / nv, cz / nv]);
  // radius of the body right at the joint: mean distance off the axis of vertices near it
  let rs = 0, rn = 0;
  const pos = attrs.position;
  for (let i = 0; i < nv; i++) {
    const p = [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
    const along = dot(p, dir);
    if (along < -0.01 || along > 0.07) continue;
    rs += len(sub(p, scl(dir, along))); rn++;
  }
  const rad = rn ? (rs / rn) * 0.92 : 0.03;
  let stumpGeo: THREE.BufferGeometry | null = null;
  if (capReg) {
    capDisc(attrs, idx, dir, rad, capReg, W, H, -1, 0.004);
    stumpGeo = capGeo(dir, rad, capReg, W, H);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(attrs.position, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(attrs.normal, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(attrs.uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(attrs.color, 3));
  geo.setAttribute('aAtlas', new THREE.Float32BufferAttribute(attrs.aAtlas, 4));
  geo.setAttribute('aFx', new THREE.Float32BufferAttribute(attrs.aFx, 2));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return { geo, box, dir, r: rad, stumpGeo };
}

/** append a disc (normal = side * dir) at offset along dir, UV-mapped radially into the cap region */
function capDisc(attrs: Record<string, number[]>, idx: number[], dir: V3, r: number, reg: Region, W: number, H: number, side: number, off: number) {
  const n = 10;
  const up: V3 = Math.abs(dir[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = norm(cross(dir, up)), v = norm(cross(u, dir));
  const base = attrs.position.length / 3;
  const nrm = scl(dir, side);
  const push = (p: V3, uu: number, vv: number, c: number) => {
    attrs.position.push(p[0], p[1], p[2]);
    attrs.normal.push(nrm[0], nrm[1], nrm[2]);
    attrs.uv.push((reg.x + uu * reg.w) / W, 1 - (reg.y + (1 - vv) * reg.h) / H);
    attrs.color.push(c, c, c);
    attrs.aAtlas.push(0, 0, 1, 1);
    attrs.aFx.push(0, 0);
  };
  const c0 = scl(dir, off);
  push(c0, 0.5, 0.5, 1);
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n;
    const rr = r * (0.94 + 0.12 * hash(i, r * 1000));
    const p = addV(c0, addV(scl(u, Math.cos(a) * rr), scl(v, Math.sin(a) * rr)));
    push(p, 0.5 + 0.48 * Math.cos(a), 0.5 + 0.48 * Math.sin(a), 0.95);
  }
  for (let i = 0; i < n; i++) {
    const a = base + 1 + i, b = base + 1 + ((i + 1) % n);
    // winding: front face toward side*dir
    const A = [attrs.position[a * 3], attrs.position[a * 3 + 1], attrs.position[a * 3 + 2]];
    const Bp = [attrs.position[b * 3], attrs.position[b * 3 + 1], attrs.position[b * 3 + 2]];
    const nn = cross(sub(A, c0), sub(Bp, c0));
    if (dot(nn, nrm) >= 0) idx.push(base, a, b); else idx.push(base, b, a);
  }
}
function capGeo(dir: V3, r: number, reg: Region, W: number, H: number): THREE.BufferGeometry {
  const attrs: Record<string, number[]> = { position: [], normal: [], uv: [], color: [], aAtlas: [], aFx: [] };
  const idx: number[] = [];
  capDisc(attrs, idx, dir, r * 1.02, reg, W, H, 1, 0.012);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(attrs.position, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(attrs.normal, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(attrs.uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(attrs.color, 3));
  geo.setAttribute('aAtlas', new THREE.Float32BufferAttribute(attrs.aAtlas, 4));
  geo.setAttribute('aFx', new THREE.Float32BufferAttribute(attrs.aFx, 2));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return geo;
}

export interface KitState {
  entry: KitEntry;
  mesh: THREE.SkinnedMesh;
  skeleton: THREE.Skeleton;
  bones: THREE.Group[];
  idx: Map<string, number>;
  proxies: THREE.Mesh[];
  cut: CutState;
  F: KitFx;
  material: THREE.MeshLambertMaterial;
  who: string;
  /** free animation memory */
  m: Record<string, any>;
}
export interface KitRig extends Rig { kit: KitState }

/** Build a rig for a variant; call kitPersonalize(rig, variant) later to switch individuals. */
export function buildKitRig(def: KitDef, variant: number, headY: number): KitRig {
  const e = kitEntry(def, variant);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const parts: Record<string, THREE.Object3D> = {};
  const bones: THREE.Group[] = [];
  const idx = new Map<string, number>();
  e.bones.forEach((b, i) => { const g = new THREE.Group(); g.name = b.name; g.userData.bi = i; bones.push(g); idx.set(b.name, i); parts[b.name] = g; });
  e.bones.forEach((b, i) => { (b.parent ? bones[idx.get(b.parent)!] : body).add(bones[i]); });
  const F = kitFx();
  const material = kitMaterial(e.tex, F);
  const mesh = new THREE.SkinnedMesh(e.geo, material);
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.boundingBox = new THREE.Box3(); // proxies carry the bounds (posed)
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(def.sphere[0], def.sphere[1], def.sphere[2]), def.sphere[3]);
  mesh.frustumCulled = true;
  (mesh as any).clone = () => new THREE.Group();
  body.add(mesh);
  const skeleton = new THREE.Skeleton(bones as unknown as THREE.Bone[], e.rest.map((r) => new THREE.Matrix4().makeTranslation(-r[0], -r[1], -r[2])));
  mesh.bind(skeleton, new THREE.Matrix4());
  const proxies = bones.map((g, i) => {
    const p = new THREE.Mesh(e.proxyGeo[i], material);
    p.visible = false; p.name = 'seg:' + g.name;
    (p as any).clone = () => {
      const s = rig.kit.entry.segs[i];
      if (!s.geo) return new THREE.Group();
      const m = new THREE.Mesh(s.geo, rig.kit.entry.gibMat); m.castShadow = true; return m;
    };
    g.add(p);
    return p;
  });
  const rig: KitRig = {
    root, body, parts, headY,
    kit: { entry: e, mesh, skeleton, bones, idx, proxies, cut: null as unknown as CutState, F, material, who: '', m: {} },
  };
  placeBones(rig);
  rig.kit.cut = cutState(bones, skeleton, (i) => {
    const E = rig.kit.entry;
    if (!E.bones[i].cap || !E.segs[i].stumpGeo) return null;
    const m = new THREE.Mesh(E.segs[i].stumpGeo!, rig.kit.material); m.name = 'kit_stump'; return m;
  });
  def.decorate?.(rig, e);
  return rig;
}

function placeBones(rig: KitRig) {
  const e = rig.kit.entry;
  e.bones.forEach((b, i) => { const g = rig.kit.bones[i]; g.position.set(b.at[0], b.at[1], b.at[2]); g.userData.p0 = new THREE.Vector3(b.at[0], b.at[1], b.at[2]); });
}

/** switch an existing rig to another variant (individual): geometry, page and bone offsets */
export function kitPersonalize(rig: KitRig, variant: number) {
  const K = rig.kit;
  const e = kitEntry(K.entry.def, variant);
  if (e === K.entry) return;
  K.entry = e;
  K.mesh.geometry = e.geo;
  K.material.map = e.tex;
  placeBones(rig);
  K.skeleton.boneInverses = e.rest.map((r) => new THREE.Matrix4().makeTranslation(-r[0], -r[1], -r[2]));
  K.proxies.forEach((p, i) => { p.geometry = e.proxyGeo[i]; });
  const C = K.cut;
  C.rest0 = K.bones.map((b) => b.position.clone());
  for (let i = 0; i < C.caps.length; i++) { const cp = C.caps[i]; if (cp) { cp.removeFromParent(); C.caps[i] = null; } }
  for (const c of C.collapse) c?.removeFromParent();
  C.collapse.fill(null);
  C.gone.fill(-1);
  for (let i = 0; i < K.bones.length; i++) K.skeleton.bones[i] = K.bones[i] as unknown as THREE.Bone;
  cutSync(C, rig.body);
}

/**
 * Severed / hidden bones of any skinned rig: their vertices collapse into the
 * joint (the skeleton slot points at a zero-scale node there) and an optional
 * stump cap appears. Works for kit rigs and the survivors' HumanRig.
 */
export interface CutState {
  bones: THREE.Object3D[];
  skeleton: THREE.Skeleton;
  parent0: THREE.Object3D[];
  rest0: THREE.Vector3[];
  gone: Int16Array;
  collapse: (THREE.Object3D | null)[];
  caps: (THREE.Object3D | null)[];
  capFor: (i: number) => THREE.Object3D | null;
}
export function cutState(bones: THREE.Object3D[], skeleton: THREE.Skeleton, capFor: (i: number) => THREE.Object3D | null = () => null): CutState {
  bones.forEach((b, i) => { b.userData.bi = i; });
  return {
    bones, skeleton, parent0: bones.map((b) => b.parent!), rest0: bones.map((b) => b.position.clone()),
    gone: new Int16Array(bones.length).fill(-1), collapse: bones.map(() => null), caps: bones.map(() => null), capFor,
  };
}
/** returns true when something changed */
export function cutSync(S: CutState, body: THREE.Object3D): boolean {
  const n = S.bones.length;
  let changed = false;
  for (let i = 0; i < n; i++) {
    let o: THREE.Object3D | null = S.bones[i], top = -1;
    while (o && o !== body) {
      const bi = o.userData.bi as number | undefined;
      if (bi !== undefined && S.bones[bi] === o && (!o.visible || !o.parent)) top = bi;
      o = o.parent;
    }
    if (!o && top < 0) top = i;
    if (S.gone[i] !== top) { S.gone[i] = top; changed = true; }
  }
  if (!changed) return false;
  const tops = new Set<number>();
  for (let i = 0; i < n; i++) if (S.gone[i] >= 0) tops.add(S.gone[i]);
  for (let i = 0; i < n; i++) {
    const g = S.gone[i];
    if (g < 0) { S.skeleton.bones[i] = S.bones[i] as unknown as THREE.Bone; continue; }
    let c = S.collapse[g];
    if (!c) { c = new THREE.Object3D(); c.name = 'kit_collapse'; S.collapse[g] = c; }
    if (c.parent !== S.parent0[g]) { S.parent0[g].add(c); c.position.copy(S.rest0[g]); c.scale.setScalar(1e-4); }
    S.skeleton.bones[i] = c as unknown as THREE.Bone;
  }
  for (let i = 0; i < n; i++) {
    const want = tops.has(i);
    if (want && !S.caps[i]) {
      const m = S.capFor(i);
      if (m) { m.position.copy(S.rest0[i]); S.parent0[i].add(m); S.caps[i] = m; }
    } else if (!want && S.caps[i]) { S.caps[i]!.removeFromParent(); S.caps[i] = null; }
  }
  return true;
}
/** put every bone back where it was and clear stumps (rig reuse) */
export function cutRestore(S: CutState, root: THREE.Object3D, body: THREE.Object3D) {
  S.bones.forEach((b, i) => { if (b.parent !== S.parent0[i]) S.parent0[i].add(b); b.visible = true; b.position.copy(S.rest0[i]); });
  const dead: THREE.Object3D[] = [];
  root.traverse((o) => { if (o.name === 'gore_stump') dead.push(o); });
  for (const o of dead) o.removeFromParent();
  cutSync(S, body);
}

/** per frame: collapse cut-off / hidden bones into their joints and show painted stumps */
export function kitSync(rig: KitRig) { cutSync(rig.kit.cut, rig.body); }

/** reattach everything gore or limb loss took off (rig reuse) */
export function kitRestore(rig: KitRig) { cutRestore(rig.kit.cut, rig.root, rig.body); }

// =====================================================================================
// animation helpers
// =====================================================================================
export function P(rig: Rig, name: string): THREE.Object3D { return rig.parts[name]; }
/** set a joint's rotation (no-op for missing parts) */
export function rot(rig: Rig, name: string, x: number, y = 0, z = 0) { const o = rig.parts[name]; if (o) o.rotation.set(x, y, z); }
/** damp a joint toward a rotation */
export function drot(rig: Rig, name: string, x: number, y: number, z: number, k: number) {
  const o = rig.parts[name]; if (!o) return;
  o.rotation.x += (x - o.rotation.x) * k; o.rotation.y += (y - o.rotation.y) * k; o.rotation.z += (z - o.rotation.z) * k;
}
export type Pose = Record<string, [number, number, number]>;
/** apply a pose (unlisted joints in `names` go to zero); damped when k < 1 */
export function applyPose(rig: Rig, pose: Pose, names: readonly string[], k = 1) {
  for (const n of names) {
    const r = pose[n] || Z3;
    if (k >= 1) rot(rig, n, r[0], r[1], r[2]); else drot(rig, n, r[0], r[1], r[2], k);
  }
}
const Z3: [number, number, number] = [0, 0, 0];
export function mixPose(a: Pose, b: Pose, t: number, names: readonly string[]): Pose {
  const out: Pose = {};
  for (const n of names) {
    const p = a[n] || Z3, q = b[n] || Z3;
    out[n] = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
  }
  return out;
}
/** add rotation onto a joint */
export function addRot(rig: Rig, name: string, x: number, y = 0, z = 0) { const o = rig.parts[name]; if (o) { o.rotation.x += x; o.rotation.y += y; o.rotation.z += z; } }
/** move a bone relative to its rest offset */
export function offset(rig: Rig, name: string, x: number, y: number, z: number) {
  const o = rig.parts[name]; if (!o) return;
  const p0 = o.userData.p0 as THREE.Vector3 | undefined;
  if (p0) o.position.set(p0.x + x, p0.y + y, p0.z + z);
}

/** names of parts a creature has lost (death cuts and limb loss while alive) */
export function lostParts(c: Creature | null | undefined): Set<string> {
  const s = new Set<string>();
  if (!c) return s;
  for (const k of ['severed', 'sev']) { const l = c.mem?.[k]; if (Array.isArray(l)) for (const n of l) s.add(n); }
  return s;
}

/** the nearest living survivor in the creature's zone (any peer), or null (galleries) */
export function nearestSurvivor(c: Creature, maxD = 30): { x: number; z: number; d: number; y: number } | null {
  const g = G as any;
  if (!g || !g.players) return null;
  let best: any = null, bd = maxD;
  for (const p of g.players.values()) {
    if (p.zoneKey !== c.zoneKey || p.body?.dead) continue;
    const d = Math.hypot(p.x - c.x, p.z - c.z);
    if (d < bd) { bd = d; best = p; }
  }
  return best ? { x: best.x, z: best.z, d: bd, y: (best.y ?? 0) + 1.55 } : null;
}

/**
 * Head yaw / pitch (radians, rig space: +yaw turns toward +x) to look at a
 * world point from a creature whose eyes are eyeY above its feet; clamped.
 */
export function lookAngles(c: Creature, tx: number, tz: number, ty: number, eyeY: number, maxYaw = 1.2, maxPitch = 0.7): [number, number] {
  const a = Math.atan2(tz - c.z, tx - c.x);
  let rel = a - c.facing;
  while (rel > Math.PI) rel -= Math.PI * 2;
  while (rel < -Math.PI) rel += Math.PI * 2;
  const yaw = Math.max(-maxYaw, Math.min(maxYaw, -rel));
  const d = Math.max(0.3, Math.hypot(tx - c.x, tz - c.z));
  const pitch = Math.max(-maxPitch, Math.min(maxPitch, Math.atan2(eyeY - ty, d)));
  return [yaw, pitch];
}

/** smoothed scalar kept on the rig */
export function smooth(rig: KitRig | Rig, key: string, target: number, rate: number, dt: number): number {
  const ud = rig.root.userData;
  const v = ud[key] === undefined ? target : (ud[key] as number);
  const n = v + (target - v) * (1 - Math.exp(-rate * dt));
  ud[key] = n;
  return n;
}

/** attack envelope from c.attackPhase (0.38 -> 0): wind-up, strike, follow-through (needs per-rig memory) */
export function attackCurve(rig: Rig, c: Creature, t: number): { wind: number; strike: number; follow: number } {
  const ud = rig.root.userData;
  const ap = c.attackPhase;
  if (ap > 0) { ud._atkEnd = undefined; ud._atkOn = true; }
  else if (ud._atkOn) { ud._atkOn = false; ud._atkEnd = t; }
  if (ap > 0) {
    const u = 1 - ap / 0.38;
    const wind = u < 0.62 ? Math.sin((u / 0.62) * Math.PI * 0.5) : 1 - (u - 0.62) / 0.38;
    const strike = u < 0.55 ? 0 : Math.min(1, (u - 0.55) / 0.3);
    return { wind: Math.max(0, wind), strike, follow: 0 };
  }
  const since = ud._atkEnd !== undefined ? t - (ud._atkEnd as number) : 99;
  const follow = since < 0.55 ? 1 - since / 0.55 : 0;
  return { wind: 0, strike: follow > 0 ? follow : 0, follow };
}

/** hit flinch 0..1 (hitFlash on the host, stagger as fallback) */
export function flinchOf(c: Creature): number { return Math.max(c.hitFlash / 0.15, Math.min(1, (c.stagger ?? 0) * 2.5)); }

// =====================================================================================
// body-part primitives (adapted from the survivors' hands, feet and heads)
// =====================================================================================
/** ring through explicit angles (deg, 0 front, + toward +x * mirror) */
export function ringA(y: number, cx: number, cz: number, rx: number, rf: number, rb: number, angs: number[], sq = 2, mirror = 1, bump?: (th: number) => number): V3[] {
  const e = 2 / sq;
  return angs.map((deg) => {
    const th = (deg * Math.PI) / 180;
    const sx = Math.sin(th), cz_ = Math.cos(th);
    const ex = Math.sign(sx) * Math.pow(Math.abs(sx), e), ez = Math.sign(cz_) * Math.pow(Math.abs(cz_), e);
    const k = 1 + (bump ? bump(th) : 0);
    return [cx + mirror * ex * rx * k, y, cz + ez * (cz_ >= 0 ? rf : rb) * k];
  });
}
export const HEAD_ANGS = [-180, -150, -120, -95, -70, -45, -24, -10, 0, 10, 24, 45, 70, 95, 120, 150, 180];

/** lofted head from rows (head-local y) with a bump field; returns nothing (adds to B) */
export function headLoft(B: SkinB, o: { at: V3; rows: Row[]; reg: Region; vr: number[]; w: (y: number) => Wt; g: number; bump?: (th: number, y: number) => number; angs?: number[]; top?: number; bottom?: number; s?: number }) {
  const s = o.s ?? 1;
  const angs = o.angs || HEAD_ANGS;
  const us = angs.map((a) => 0.5 + a / 360);
  const rings = o.rows.map((r) => ({
    pts: ringA(o.at[1] + r.y * s, o.at[0] + (r.cx ?? 0) * s, o.at[2] + (r.cz ?? 0) * s, r.rx * s, r.rf * s, r.rb * s, angs, r.sq ?? 2, 1, o.bump ? (th) => o.bump!(th, r.y) : undefined),
    v: (r.y - o.vr[0]) / (o.vr[1] - o.vr[0]), w: o.w(r.y),
  }));
  const f = o.rows[0], l = o.rows[o.rows.length - 1];
  return B.loft(rings, us, o.reg, o.g, {
    start: o.bottom !== undefined ? [o.at[0] + (f.cx ?? 0) * s, o.at[1] + o.bottom * s, o.at[2] + (f.cz ?? 0) * s] : null,
    end: o.top !== undefined ? [o.at[0] + (l.cx ?? 0) * s, o.at[1] + o.top * s, o.at[2] + (l.cz ?? 0) * s] : null,
    startW: o.w(f.y), endW: o.w(l.y), startV: 0, endV: 1,
  });
}

export interface HandOpt {
  k: number;                    // +1 left (+x), -1 right
  at: V3;                       // hand bone rest position
  bones: { farm: number; hand: number; f1: number; f2: number; thumb: number };
  reg: Region; g: number;
  s?: number;                   // overall scale
  palm?: { len: number; w: number; t: number };
  fingers?: { n: number; len: number[]; r: number[]; spread?: number }; // fingers across the palm width
  fused?: boolean;              // moulded mannequin fingers
  thumb?: { len: number; r: number };
  glove?: number;               // thickness
}
/** a hand: palm loft, fingers (two segments each, curl via f1 / f2) and a thumb */
export function handLoft(B: SkinB, o: HandOpt) {
  const s = o.s ?? 1, k = o.k;
  const g = o.glove ?? 0;
  const pl = o.palm ?? { len: 0.09, w: 0.043, t: 0.018 };
  const tr = (p: V3): V3 => [o.at[0] + p[0], o.at[1] + p[1], o.at[2] + p[2]];
  const { farm, hand: H, f1: F1, f2: F2, thumb: TH } = o.bones;
  const prow = [
    { y: 0.004, rx: pl.t * 0.95, rf: pl.w * 0.62, rb: pl.w * 0.58, v: 1, w: [farm, 0.4, H, 0.6] },
    { y: -pl.len * 0.32, rx: pl.t * 1.06, rf: pl.w * 0.92, rb: pl.w * 0.84, v: 0.82, w: [H, 1] },
    { y: -pl.len * 0.7, rx: pl.t, rf: pl.w, rb: pl.w * 0.94, v: 0.66, w: [H, 1] },
    { y: -pl.len * 0.98, rx: pl.t * 0.85, rf: pl.w * 0.98, rb: pl.w * 0.92, v: 0.55, w: [H, 0.6, F1, 0.4] },
  ];
  const rings = prow.map((r) => ({ pts: ringY(r.y * s, 0, 0.002, (r.rx + g) * s, (r.rf + g) * s, (r.rb + g) * s, 6, 2.6, k, undefined, -Math.PI + Math.PI / 6).map(tr), v: r.v, w: r.w as Wt }));
  B.loft(rings, usFor(6), o.reg, o.g, { end: tr([0, -pl.len * 1.04 * s, 0.002]), endW: [H, 0.6, F1, 0.4] });
  const y0 = -pl.len * 0.92 * s;
  if (o.fused) {
    // moulded fingers: one flat, slightly cupped block that bends at the knuckles
    const L = (o.fingers?.len[1] ?? 0.085) * s;
    const fr = [
      { y: y0, rx: pl.t * 0.85, rz: pl.w * 0.95, v: 0.5, w: [H, 0.3, F1, 0.7] as Wt },
      { y: y0 - L * 0.5, rx: pl.t * 0.72, rz: pl.w * 0.9, v: 0.27, w: [F1, 0.5, F2, 0.5] as Wt },
      { y: y0 - L * 0.92, rx: pl.t * 0.6, rz: pl.w * 0.78, v: 0.05, w: [F2, 1] as Wt },
    ];
    const rr = fr.map((f) => ({ pts: ringY(f.y, 0, 0.002, (f.rx + g) * s, (f.rz + g) * s, (f.rz + g) * s * 0.96, 6, 3.2, k, undefined, -Math.PI + Math.PI / 6).map(tr), v: f.v, w: f.w }));
    B.loft(rr, usFor(6), o.reg, o.g + 1, { end: tr([0, y0 - L, 0.002]), endW: [F2, 1], endV: 0 });
  } else {
    const fn = o.fingers ?? { n: 4, len: [0.075, 0.083, 0.078, 0.063], r: [0.0088, 0.0094, 0.0088, 0.0076] };
    const spread = fn.spread ?? 1;
    for (let i = 0; i < fn.n; i++) {
      const z = (fn.n === 1 ? 0 : (0.5 - i / (fn.n - 1)) * pl.w * 1.3 * spread) * s;
      const L = fn.len[i] * s, r = (fn.r[i] + g * 0.6) * s;
      const ym = y0 - L * 0.48, y1 = y0 - L;
      const fr4 = (y: number, rr: number) => ringY(y, 0, z, rr * 1.05, rr, rr, 4, 2, k, undefined, -Math.PI + Math.PI / 4).map(tr);
      const rr = [
        { pts: fr4(y0, r), v: 0.5, w: [H, 0.3, F1, 0.7] as Wt },
        { pts: fr4(ym, r * 0.94), v: 0.25, w: [F1, 0.5, F2, 0.5] as Wt },
        { pts: fr4(y1 + 0.006 * s, r * 0.8), v: 0.04, w: [F2, 1] as Wt },
      ];
      B.loft(rr, usFor(4), o.reg, o.g + 2 + i, { end: tr([0, y1, z]), endW: [F2, 1], endV: 0 });
    }
  }
  // thumb along a diagonal from the heel of the palm
  const tl = o.thumb ?? { len: 0.062, r: 0.0115 };
  const base: V3 = [-k * 0.004 * s, -pl.len * 0.27 * s, pl.w * 0.66 * s];
  const dir = norm([-k * 0.22, -0.72, 0.62]);
  const side2 = norm(cross(dir, [k, 0, 0]));
  const up = norm(cross(side2, dir));
  const ring = (t: number, r: number): V3[] => {
    const c = [base[0] + dir[0] * t, base[1] + dir[1] * t, base[2] + dir[2] * t];
    const out: V3[] = [];
    for (let i = 0; i <= 5; i++) {
      const a = -Math.PI + (Math.PI * 2 * i) / 5;
      out.push(tr([c[0] + (Math.cos(a) * up[0] + Math.sin(a) * side2[0]) * r, c[1] + (Math.cos(a) * up[1] + Math.sin(a) * side2[1]) * r, c[2] + (Math.cos(a) * up[2] + Math.sin(a) * side2[2]) * r]));
    }
    return out;
  };
  const L = tl.len * s, r = (tl.r + g * 0.6) * s;
  const rr = [
    { pts: ring(0, r * 1.25), v: 0.5, w: [H, 0.5, TH, 0.5] as Wt },
    { pts: ring(L * 0.5, r), v: 0.25, w: [TH, 1] as Wt },
    { pts: ring(L * 0.92, r * 0.82), v: 0.05, w: [TH, 1] as Wt },
  ];
  B.loft(rr, usFor(5), o.reg, o.g + 9, { end: tr([base[0] + dir[0] * L, base[1] + dir[1] * L, base[2] + dir[2] * L]), endW: [TH, 1], endV: 0 });
}

export interface FootRow { z: number; rx: number; top: number }
export const SHOE_DRESS: FootRow[] = [
  { z: -0.068, rx: 0.027, top: -0.015 }, { z: -0.054, rx: 0.033, top: 0.008 }, { z: -0.018, rx: 0.037, top: 0.02 },
  { z: 0.085, rx: 0.045, top: -0.024 }, { z: 0.135, rx: 0.045, top: -0.04 }, { z: 0.172, rx: 0.036, top: -0.049 }, { z: 0.196, rx: 0.022, top: -0.054 },
];
export const FOOT_BARE: FootRow[] = [
  { z: -0.062, rx: 0.022, top: -0.03 }, { z: -0.048, rx: 0.029, top: -0.005 }, { z: -0.015, rx: 0.033, top: 0.022 },
  { z: 0.08, rx: 0.043, top: -0.026 }, { z: 0.122, rx: 0.046, top: -0.043 }, { z: 0.158, rx: 0.042, top: -0.05 }, { z: 0.178, rx: 0.03, top: -0.056 },
];
/** a shoe or bare foot lofted along z around the foot bone; ground is local y */
export function footLoft(B: SkinB, o: { k: number; at: V3; rows: FootRow[]; ground: number; sole: number; lip: number; reg: Region; w: Wt; g: number; s?: number; sx?: number; sz?: number; toeLift?: number }) {
  const s = o.s ?? 1, k = o.k, sx = o.sx ?? 1, sz = o.sz ?? 1;
  const AN = [-180, -125, -91, -89, -45, 0, 45, 89, 91, 125, 180];
  const us = AN.map((a) => 0.5 + a / 360);
  const rings = o.rows.map((r, i) => {
    const toeLift = r.z > 0.15 ? (r.z - 0.15) * (o.toeLift ?? 0.25) : 0;
    const yb = o.ground + toeLift * s;
    const ym = yb + o.sole * s;
    const yt = Math.max(ym + 0.012 * s, r.top * s);
    const rx = r.rx * s * sx, rl = rx + o.lip * s;
    const pts: V3[] = AN.map((a) => {
      const t = (a * Math.PI) / 180;
      if (Math.abs(a) < 90) {
        const sxx = Math.sin(t), cy = Math.cos(t);
        return [k * Math.sign(sxx) * Math.pow(Math.abs(sxx), 0.85) * rx, ym + Math.pow(Math.max(0, cy), 0.8) * (yt - ym), r.z * s * sz];
      }
      const sxx = Math.sin(t), cy = -Math.cos(t);
      return [k * Math.sign(sxx) * Math.pow(Math.abs(sxx), 0.35) * rl, ym - Math.pow(Math.max(0, cy), 0.3) * (ym - yb), r.z * s * sz];
    });
    for (const p of pts) { p[0] += o.at[0]; p[1] += o.at[1]; p[2] += o.at[2]; }
    return { pts, v: 0.04 + 0.66 * (i / (o.rows.length - 1)), w: o.w };
  });
  const f = o.rows[0], l = o.rows[o.rows.length - 1];
  B.loft(rings, us, o.reg, o.g, {
    start: [o.at[0], o.at[1] + o.ground + 0.03 * s, o.at[2] + (f.z - 0.006) * s * sz],
    end: [o.at[0], o.at[1] + o.ground + (o.sole + 0.012) * s, o.at[2] + (l.z + 0.012) * s * sz], endV: 0.72, startV: 0,
  });
}

// =====================================================================================
// painting helpers
// =====================================================================================
/** paint a ramp-shaded tube surface with soft ambient occlusion around the circumference */
export function shadeTube(r: Region, R: number[], base: number, opts: { noise?: number; cells?: number; seed?: number; side?: number; mask?: (x: number, y: number) => boolean; extra?: (x: number, y: number) => number } = {}) {
  const n = opts.noise ?? 0.5, cells = opts.cells ?? 3, seed = opts.seed ?? 1;
  r.fill(R, (x, y) => {
    const th = (r.deg(x) * Math.PI) / 180;
    // light from the front-top: back and inner side darker
    let l = base + 0.35 * Math.cos(th) - 0.15 + (r.fbm(x, y, cells, 2, seed) - 0.5) * n;
    if (opts.side) l -= 0.35 * Math.max(0, -Math.sin(th) * opts.side);
    if (opts.extra) l += opts.extra(x, y);
    return l;
  }, opts.mask);
}

/** twill / weave texture offset (0..~0.5) for cloth */
export function twill(x: number, y: number, kind: 'twill' | 'plain' | 'herring' | 'knit' = 'twill'): number {
  switch (kind) {
    case 'twill': return ((x + y) % 4 === 0 ? 0.35 : 0) + ((x + y) % 4 === 2 ? -0.15 : 0);
    case 'plain': return ((x + y) & 1) ? 0.12 : -0.08;
    case 'herring': { const b = Math.floor(x / 4) & 1; return (((b ? x - y : x + y) % 4 + 4) % 4 === 0 ? 0.3 : -0.05); }
    case 'knit': return (y % 2 === 0 ? 0.2 : -0.1) * (((x + (y >> 1)) & 1) ? 1 : -0.5);
  }
}
