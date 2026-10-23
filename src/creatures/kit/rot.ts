// Pixel-art horror paint shared by the creature pages: flayed wounds (raw
// muscle in fibre bundles, bone showing through, a crusted ragged rim and the
// pale edge of the skin), blood that runs and pools, veins under thin skin,
// bruising, necrotic mottling, weeping sores, rusted stains on cloth. Works on
// any page through a tiny canvas adapter (beast pages, humanoid kit regions,
// raw PixelCanvas rectangles). The raw reds paint into the colours the faceted
// creature material makes glint wet (kit/horror.ts).
import type { Painter, Reg } from './beasts';
import type { Region } from './humanoids';
import { mixHex } from '../../gfx/pixel';

export interface Canvas2 { w: number; h: number; set(x: number, y: number, c: number): void; blend(x: number, y: number, c: number, t: number): void }
/** a beast-page region */
export function regionCanvas(Pt: Painter, r: Reg): Canvas2 {
  return { w: r.w, h: r.h, set: (x, y, c) => Pt.set(r, Math.round(x), Math.round(y), c), blend: (x, y, c, t) => Pt.blend(r, Math.round(x), Math.round(y), c, t) };
}
/** a humanoid-kit region (u wraps) */
export function kitCanvas(R: Region): Canvas2 {
  return { w: R.w, h: R.h, set: (x, y, c) => R.set(Math.round(x), Math.round(y), c), blend: (x, y, c, t) => R.blend(Math.round(x), Math.round(y), c, t) };
}

export const RAW = [0x1e0204, 0x380608, 0x520c0c, 0x6e1412, 0x8a1e18, 0xa4301e, 0xbe4a30, 0xd06a48];
export const BONE = [0x5e5440, 0x8a7e64, 0xb4a888, 0xd2c6a6, 0xeae0c4];
export const BLOOD = [0x2a0404, 0x4a0808, 0x6a0e0e, 0x8a1a16];
export const CRUST = 0x22080a;
export const FAT = 0xd2b47a;
const hsh = (x: number, y: number, s: number) => { const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v); };
/** smooth value noise in [0,1] (cell size c px) */
export function vnoise(x: number, y: number, c: number, s: number) {
  const gx = Math.floor(x / c), gy = Math.floor(y / c), fx = x / c - gx, fy = y / c - gy;
  const a = hsh(gx, gy, s), b = hsh(gx + 1, gy, s), d = hsh(gx, gy + 1, s), e = hsh(gx + 1, gy + 1, s);
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  return a + (b - a) * u + (d - a) * v + (a - b - d + e) * u * v;
}
const pick = (R: number[], v: number) => R[Math.max(0, Math.min(R.length - 1, Math.round(v)))];

export interface FlayOpts {
  /** fibre direction in pixels (default along the rows: [0, 1]) */
  fibre?: [number, number];
  /** 0..1 where bone shows through (ribs, a jaw, a shin) */
  bone?: (x: number, y: number) => number;
  /** how deep the middle is (darker), 0..1 */
  depth?: number;
  /** a band of yellow fat under the rim */
  fat?: boolean;
  seed?: number;
  /** runs of blood leaving the bottom of the wound: direction in px and how many */
  drip?: [number, number]; drips?: number;
}
/** a torn-open patch: raw muscle in fibre bundles, bone, fat, a ragged crusted rim, a pale skin edge */
export function flay(C: Canvas2, cx: number, cy: number, rx: number, ry: number, o: FlayOpts = {}) {
  const s = o.seed ?? 1, [fx, fy] = o.fibre ?? [0, 1], fl = Math.hypot(fx, fy) || 1;
  const nx = -fy / fl, ny = fx / fl;
  const depth = o.depth ?? 0.6;
  for (let y = Math.floor(cy - ry * 1.4); y <= cy + ry * 1.4; y++) for (let x = Math.floor(cx - rx * 1.4); x <= cx + rx * 1.4; x++) {
    const dx = (x - cx) / rx, dy = (y - cy) / ry;
    const d = Math.hypot(dx, dy) + (vnoise(x, y, 2.5, s) - 0.5) * 0.55 + (hsh(x, y, s) - 0.5) * 0.12;
    if (d > 1.22) continue;
    if (d > 1.07) { C.blend(x, y, 0xe8d0c0, 0.45); continue; }             // the pale, stretched edge of the skin
    if (d > 0.95) { C.set(x, y, hsh(x, y, s + 1) < 0.5 ? CRUST : 0x3a0c0c); continue; } // crusted rim
    if (o.fat && d > 0.84) { C.set(x, y, hsh(x, y, s + 2) < 0.3 ? mixHex(FAT, 0x8a5a30, 0.4) : FAT); continue; }
    const bone = o.bone ? o.bone(x, y) : 0;
    if (bone > 0.5) {
      const l = 2.2 + (bone - 0.5) * 3 + (hsh(x, y, s + 3) - 0.5) * 0.8 - d * 0.8;
      C.set(x, y, pick(BONE, l));
      continue;
    }
    // muscle bundles: stripes across the fibre direction, dark seams between bundles, glossy crests
    const across = x * nx + y * ny;
    const band = Math.sin(across * 1.9 + vnoise(x, y, 3, s + 4) * 4);
    const seam = Math.abs(Math.sin(across * 0.55 + vnoise(x, y, 5, s + 5) * 3)) < 0.12;
    let l = 4.2 + band * 1.3 - d * depth * 2.6 + (hsh(x, y, s + 6) - 0.5) * 0.7 - (bone > 0.25 ? 1.5 : 0);
    if (seam) l -= 2.4;
    C.set(x, y, pick(RAW, l));
    if (band > 0.82 && hsh(x, y, s + 7) < 0.35) C.set(x, y, RAW[7]);   // a wet highlight on a crest
  }
  if (o.drips) drips(C, cx, cy + ry * 0.7, o.drips, Math.max(3, ry * 1.4), o.drip ?? [0, 1], s + 9);
}

/** blood running from a point (or a line) in a direction, pooling darker at the ends */
export function drips(C: Canvas2, x: number, y: number, n: number, len: number, dir: [number, number], seed = 1, spread = 3) {
  for (let i = 0; i < n; i++) {
    let px = x + (hsh(i, 1, seed) - 0.5) * spread * 2, py = y + (hsh(i, 2, seed) - 0.5) * 2;
    const L = Math.round(len * (0.5 + hsh(i, 3, seed)));
    const w = hsh(i, 4, seed) < 0.3 ? 2 : 1;
    for (let k = 0; k < L; k++) {
      const c = k > L - 2 ? BLOOD[0] : k < 2 ? BLOOD[3] : BLOOD[2];
      C.set(px, py, c); if (w === 2) C.blend(px + 1, py, BLOOD[1], 0.8);
      px += dir[0] + (hsh(i, k, seed + 5) - 0.5) * 0.5; py += dir[1];
    }
    C.blend(px, py, BLOOD[0], 0.9); C.blend(px + 1, py, BLOOD[1], 0.6);
  }
}

/** blue-black veins branching under thin skin */
export function veins(C: Canvas2, n: number, seed = 1, color = 0x3a3450, alpha = 0.5, len = 10) {
  const walk = (x: number, y: number, ax: number, ay: number, L: number, a: number, depth: number) => {
    for (let k = 0; k < L; k++) {
      C.blend(x, y, color, a * (1 - k / (L * 1.4)));
      ax += (hsh(x, y, seed + k) - 0.5) * 0.9; ay += (hsh(y, x, seed + k) - 0.5) * 0.9;
      const l = Math.hypot(ax, ay) || 1; ax /= l; ay /= l;
      x += ax; y += ay;
      if (depth < 2 && hsh(x, y, seed + 31) < 0.08) walk(x, y, ay, -ax, Math.floor(L * 0.5), a * 0.7, depth + 1);
    }
  };
  for (let i = 0; i < n; i++) walk(hsh(i, 7, seed) * C.w, hsh(i, 8, seed) * C.h, hsh(i, 9, seed) - 0.5, 1, Math.round(len * (0.6 + hsh(i, 10, seed) * 0.8)), alpha, 0);
}

/** a bruise: purple core, green-yellow fading rim */
export function bruise(C: Canvas2, cx: number, cy: number, r: number, seed = 1) {
  for (let y = Math.floor(cy - r * 1.5); y <= cy + r * 1.5; y++) for (let x = Math.floor(cx - r * 1.5); x <= cx + r * 1.5; x++) {
    const d = Math.hypot(x - cx, (y - cy) * 1.2) / r + (vnoise(x, y, 2, seed) - 0.5) * 0.6;
    if (d > 1.4) continue;
    if (d < 0.7) C.blend(x, y, 0x3a1e3a, 0.55 * (1 - d * 0.5));
    else C.blend(x, y, d < 1.05 ? 0x5a3a4a : 0x6a6a3a, 0.35);
  }
}

/** necrotic mottling: grey-green and purple-brown blotches over the whole canvas */
export function rot(C: Canvas2, amt: number, seed = 1, mask?: (x: number, y: number) => boolean) {
  for (let y = 0; y < C.h; y++) for (let x = 0; x < C.w; x++) {
    if (mask && !mask(x, y)) continue;
    const n = vnoise(x, y, 5, seed) * 0.7 + vnoise(x, y, 2, seed + 1) * 0.3;
    if (n > 1 - amt * 0.45) C.blend(x, y, n > 1 - amt * 0.2 ? 0x2e3424 : 0x4a4a34, 0.35);
    else if (n < amt * 0.3) C.blend(x, y, 0x3e2430, 0.3);
  }
}

/** weeping sores: a wet red core, a yellow crust, an inflamed ring */
export function sores(C: Canvas2, n: number, seed = 1, mask?: (x: number, y: number) => boolean) {
  for (let i = 0; i < n; i++) {
    const x = Math.round(hsh(i, 11, seed) * C.w), y = Math.round(hsh(i, 12, seed) * C.h);
    if (mask && !mask(x, y)) continue;
    const r = 1 + Math.round(hsh(i, 13, seed) * 1.5);
    for (let dy = -r - 1; dy <= r + 1; dy++) for (let dx = -r - 1; dx <= r + 1; dx++) {
      const d = Math.hypot(dx, dy);
      if (d <= r * 0.6) C.set(x + dx, y + dy, RAW[5]);
      else if (d <= r) C.set(x + dx, y + dy, hsh(dx, dy, i) < 0.4 ? 0xb89a48 : RAW[3]);
      else if (d <= r + 1.2) C.blend(x + dx, y + dy, 0xa04a40, 0.4);
    }
    C.set(x - 1, y - 1, 0xf0d8c8);
  }
}

/** old blood and filth soaked into cloth: brown-red blooms with darker tide lines, and runs */
export function stains(C: Canvas2, n: number, seed = 1, mask?: (x: number, y: number) => boolean, fresh = 0.3) {
  for (let i = 0; i < n; i++) {
    const cx = hsh(i, 21, seed) * C.w, cy = hsh(i, 22, seed) * C.h, r = 1.5 + hsh(i, 23, seed) * 4;
    const freshOne = hsh(i, 24, seed) < fresh;
    for (let y = Math.floor(cy - r * 1.4); y <= cy + r * 1.4; y++) for (let x = Math.floor(cx - r * 1.4); x <= cx + r * 1.4; x++) {
      if (mask && !mask(x, y)) continue;
      const d = Math.hypot(x - cx, y - cy) / r + (vnoise(x, y, 2, seed + i) - 0.5) * 0.7;
      if (d > 1) continue;
      C.blend(x, y, freshOne ? (d > 0.8 ? BLOOD[1] : BLOOD[2]) : d > 0.8 ? 0x2e1410 : 0x4a2018, freshOne ? 0.85 : 0.55);
    }
    if (freshOne) drips(C, cx, cy + r * 0.6, 1 + Math.round(hsh(i, 25, seed) * 2), r * 2.5, [0, 1], seed + i, r * 0.6);
  }
}
