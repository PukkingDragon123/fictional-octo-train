// Paint for the machine's sheet metal (src/ui/machine): the enamel that goes on a
// housing's front face as a texture, one texel per unit. Olive or safety-yellow
// enamel, mottled and grimed, chipped at the edges to red primer and bright
// steel, rust running down from every bolt and seam, scratches, sprayed stencils
// in Alagard with their bridges, hazard striping. All seeded: the same panel
// always wears the same scars.
import * as THREE from 'three';
import { inkText } from '../body/stage';
import { cssFont } from '../../gfx/crt';

export type Tone = 'olive' | 'yellow' | 'dark' | 'red' | 'cream' | 'steel';
/** [deep, dark, base, light, hi] per enamel */
export const TONES: Record<Tone, number[]> = {
  olive: [0x262c18, 0x3b4428, 0x56603c, 0x6e7a4c, 0x8e9a66],
  yellow: [0x5a4206, 0x9a7210, 0xd2a020, 0xe8bc3a, 0xf8dc78],
  dark: [0x101210, 0x1b1e19, 0x282c24, 0x363b30, 0x4c5244],
  red: [0x2a0806, 0x4a120c, 0x6e2016, 0x8c3020, 0xb04a32],
  cream: [0x5a5038, 0x8a7e60, 0xb8ac8a, 0xd0c6a2, 0xeae2c4],
  steel: [0x1a1d1e, 0x2e3335, 0x4a5154, 0x687174, 0x98a2a4],
};
export const INK = 0x14120c;
export const STENCIL_Y = 0xe8c440;

export function hh(x: number, y: number, s: number): number {
  let h = Math.imul((x | 0) * 374761393 + (y | 0) * 668265263 + (s | 0) * 1442695041, 1274126177);
  h ^= h >>> 13; h = Math.imul(h, 1103515245); h ^= h >>> 16;
  return ((h >>> 0) % 100000) / 100000;
}
/** smooth value noise */
export function vnoise(x: number, y: number, s: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hh(xi, yi, s), b = hh(xi + 1, yi, s), c = hh(xi, yi + 1, s), d = hh(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function mixC(a: number, b: number, t: number): number {
  t = Math.max(0, Math.min(1, t));
  const r = ((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * t);
  const g = ((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * t);
  const bl = (a & 255) + (((b & 255) - (a & 255)) * t);
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}

export interface Rect { x: number; y: number; w: number; h: number }
export interface Stencil { text: string; x: number; y: number; px?: number; color?: number; align?: CanvasTextAlign; alpha?: number }
export interface PaintSpec {
  w: number; h: number; tone: Tone; seed: number;
  /** the outline's corner cut (chips follow the cut edge) */
  cut?: number;
  /** grooved seams across the panel */
  seamsY?: number[]; seamsX?: number[];
  /** hazard striping */
  hazards?: Rect[];
  /** where rust runs down from (bolt heads, rivets, a seam's ends) */
  rustFrom?: [number, number][];
  /** grime dribbles below these (vent slots, glands) */
  grimeUnder?: Rect[];
  /** dark recesses painted in (a well behind louvres, a socket bed) */
  wells?: Rect[];
  stencils?: Stencil[];
  /** paint wear 0..1 */
  wear?: number;
  /** a lighter enamel band (the hood) above this y */
  hoodY?: number;
}

/** paint a housing face; returns the canvas (not yet a texture) */
export function paintFace(p: PaintSpec): HTMLCanvasElement {
  const W = Math.max(2, Math.round(p.w)), H = Math.max(2, Math.round(p.h)), s = p.seed | 0;
  const R = TONES[p.tone];
  const cut = p.cut ?? 8, wear = p.wear ?? 0.65;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d')!;
  const img = c.createImageData(W, H), d = img.data;
  // distance to the outline (cheap: rect edges and the 45-degree cuts)
  const edgeD = (x: number, y: number) => {
    const e = Math.min(x, y, W - 1 - x, H - 1 - y);
    const k = Math.min(x + y, (W - 1 - x) + y, x + (H - 1 - y), (W - 1 - x) + (H - 1 - y)) - cut;
    return Math.min(e, k * 0.7071);
  };
  const isYellow = p.tone === 'yellow';
  for (let y = 0; y < H; y++) {
    const vy = y / H;
    for (let x = 0; x < W; x++) {
      // mottled enamel, darker and grimier low down, a lit lip along the top
      let v = 0.5 + (vnoise(x * 0.03, y * 0.03, s) - 0.5) * 0.26 + (vnoise(x * 0.11, y * 0.11, s + 3) - 0.5) * 0.11 + (hh(x, y, s + 5) - 0.5) * 0.06;
      v -= vy * 0.16;
      if (p.hoodY !== undefined && y < p.hoodY) v += 0.06;
      // vertical streaking (runs of dirty water)
      v -= Math.max(0, vnoise(x * 0.5, y * 0.012, s + 9) - 0.62) * 0.5 * (0.4 + vy);
      let col = v < 0.3 ? mixC(R[1], R[2], v / 0.3) : v < 0.7 ? mixC(R[2], R[3], (v - 0.3) / 0.4) : mixC(R[3], R[4], (v - 0.7) / 0.3);
      if (isYellow) col = mixC(col, 0x3a3010, Math.max(0, vy - 0.55) * 0.5);
      const ed = edgeD(x, y);
      // chipped edges: primer, then bare steel, with a dark lip
      if (ed < 7 && wear > 0) {
        const n = vnoise(x * 0.22, y * 0.22, s + 11) * 0.7 + hh(x >> 1, y >> 1, s + 12) * 0.3;
        const th = 0.86 - wear * 0.2 + ed * 0.035;
        if (n > th + 0.06) col = hh(x, y, s + 13) > 0.5 ? 0xa7aaa0 : 0x8a8c84;
        else if (n > th) col = 0x6a2e1a;
        else if (n > th - 0.03) col = mixC(col, 0x000000, 0.35);
      }
      // random chips in the field
      if (wear > 0.3) {
        const n2 = vnoise(x * 0.3, y * 0.3, s + 21);
        if (n2 > 0.93 - wear * 0.02 && hh(x >> 2, y >> 2, s + 22) > 0.55) col = n2 > 0.955 ? 0x9a9c94 : 0x5e2a18;
      }
      const i = (y * W + x) * 4;
      d[i] = (col >> 16) & 255; d[i + 1] = (col >> 8) & 255; d[i + 2] = col & 255; d[i + 3] = 255;
    }
  }
  const put = (x: number, y: number, col: number, a = 1) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 4;
    d[i] = d[i] + ((((col >> 16) & 255) - d[i]) * a); d[i + 1] = d[i + 1] + ((((col >> 8) & 255) - d[i + 1]) * a); d[i + 2] = d[i + 2] + (((col & 255) - d[i + 2]) * a);
  };
  // scratches: short bright diagonals with a shadow under
  const nScr = Math.round(W * H / 7000 * (0.3 + wear));
  for (let k = 0; k < nScr; k++) {
    let x = hh(k, 1, s) * W, y = hh(k, 2, s) * H;
    const len = 4 + hh(k, 3, s) * 16, dx = hh(k, 4, s) < 0.5 ? 1 : -1, sl = 0.2 + hh(k, 5, s) * 0.8;
    for (let q = 0; q < len; q++) { put(x, y, 0xc8ccbc, 0.22); put(x, y + 1, 0x000000, 0.14); x += dx; y += sl; }
  }
  // seams: a groove (dark) with a lit lower lip, and a weld-spatter speckle
  for (const sy0 of p.seamsY ?? []) for (let x = 2; x < W - 2; x++) { if (edgeD(x, sy0) < 1) continue; put(x, sy0, 0x0a0a06, 0.85); put(x, sy0 + 1, R[4], 0.6); if (hh(x, sy0, s) > 0.9) put(x, sy0 - 1, 0x1a1a10, 0.5); }
  for (const sx0 of p.seamsX ?? []) for (let y = 2; y < H - 2; y++) { if (edgeD(sx0, y) < 1) continue; put(sx0, y, 0x0a0a06, 0.85); put(sx0 + 1, y, R[4], 0.5); }
  // wells
  for (const w of p.wells ?? []) for (let y = w.y; y < w.y + w.h; y++) for (let x = w.x; x < w.x + w.w; x++) {
    const e = Math.min(x - w.x, y - w.y);
    put(x, y, e < 2 ? 0x050504 : mixC(0x0c0d0a, 0x1a1c16, hh(x, y, s + 31) * 0.5), 1);
  }
  // hazard striping, worn through to steel at random
  for (const hz of p.hazards ?? []) {
    for (let y = hz.y; y < hz.y + hz.h; y++) for (let x = hz.x; x < hz.x + hz.w; x++) {
      const band = Math.floor((x + (y - hz.y)) / 9) % 2 === 0;
      let col = band ? 0xe0ac22 : 0x17150e;
      if (band) col = mixC(col, 0x8a6a10, vnoise(x * 0.2, y * 0.2, s + 41) * 0.5);
      const n = vnoise(x * 0.35, y * 0.35, s + 42);
      if (n > 0.8) col = n > 0.88 ? 0x8f9188 : mixC(col, 0x3a2a10, 0.5);
      if (y === hz.y || y === hz.y + hz.h - 1) col = mixC(col, 0x000000, 0.5);
      put(x, y, col);
    }
  }
  // grime dribbles under vents and glands
  for (const g of p.grimeUnder ?? []) {
    for (let x = g.x; x < g.x + g.w; x++) {
      if (hh(x, 7, s) < 0.45) continue;
      const len = 4 + hh(x, 8, s) * 22;
      for (let q = 0; q < len; q++) put(x + Math.round(Math.sin(q * 0.3 + x) * 0.6), g.y + g.h + q, 0x14160c, 0.42 * (1 - q / len));
    }
  }
  // rust runs: from each source down, wandering, thinning, orange at the head
  for (let k = 0; k < (p.rustFrom ?? []).length; k++) {
    const [rx, ry] = p.rustFrom![k];
    if (hh(k, 61, s) > 0.55 + wear * 0.3) continue;
    const len = 6 + hh(k, 62, s) * 30, wdt = 1 + Math.floor(hh(k, 63, s) * 2.2);
    for (let q = 0; q < len; q++) {
      const t = q / len;
      const xx = rx + Math.sin(q * 0.35 + k) * 0.8 * t;
      for (let ww = 0; ww < wdt; ww++) put(xx + ww - (wdt >> 1), ry + 3 + q, t < 0.25 ? 0x7a3814 : 0x4e2410, (0.7 - t * 0.6) * (ww === 0 ? 1 : 0.6));
    }
    for (let q = -2; q <= 2; q++) put(rx + q, ry + 3, 0x5a2810, 0.5);
  }
  c.putImageData(img, 0, 0);
  // sprayed stencils: Alagard, a little overspray, the bridges of a cut stencil
  for (const st of p.stencils ?? []) stencil(c, st, s);
  return cv;
}

/** sprayed stencil text onto a canvas */
export function stencil(c: CanvasRenderingContext2D, st: Stencil, seed = 1) {
  const px = st.px ?? 16, col = st.color ?? STENCIL_Y;
  const hex = '#' + col.toString(16).padStart(6, '0');
  c.save();
  c.globalAlpha = st.alpha ?? 0.92;
  inkText(c, st.text, st.x, st.y, px, cssFont('--font-new'), hex, st.align ?? 'left');
  c.restore();
  // the stencil's bridges and worn spots: knock out a few vertical slivers
  const w = Math.ceil(st.text.length * px * 0.62), x0 = st.align === 'center' ? st.x - w / 2 : st.align === 'right' ? st.x - w : st.x;
  for (let k = 0; k < Math.ceil(w / 14); k++) {
    const bx = Math.round(x0 + hh(k, 71, seed) * w), by = Math.round(st.y - px * (0.15 + hh(k, 72, seed) * 0.6));
    c.globalAlpha = 0.55;
    c.fillStyle = 'rgba(30,30,20,0.6)';
    c.fillRect(bx, by, 1, 1 + Math.round(hh(k, 73, seed) * 2));
  }
  c.globalAlpha = 1;
}

/** a canvas as a texture: nearest, raw colours */
export function canvasTex(cv: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

/** a small printed label (nameplate / tag): enamel or brass ground, Alagard text, a border line */
export function labelCanvas(w: number, h: number, text: string, o: { ground?: 'yellow' | 'brass' | 'cream' | 'dark' | 'olive'; ink?: number; px?: number; seed?: number; border?: boolean; sub?: string } = {}): HTMLCanvasElement {
  const W = Math.max(4, Math.round(w)), H = Math.max(4, Math.round(h)), s = o.seed ?? 3;
  const g = o.ground ?? 'yellow';
  const ramp = g === 'yellow' ? TONES.yellow : g === 'brass' ? [0x4e3612, 0x80601e, 0xb08a3a, 0xc8a24a, 0xead08a] : g === 'cream' ? TONES.cream : g === 'olive' ? TONES.olive : TONES.dark;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d')!;
  const img = c.createImageData(W, H), d = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let v = 0.55 + (vnoise(x * 0.08, y * 0.3, s) - 0.5) * 0.3 + (hh(x, y, s) - 0.5) * 0.08 - (y / H) * 0.15;
    if (g === 'brass') v += Math.sin(x * 0.9 + vnoise(x * 0.1, y, s) * 3) * 0.04; // brushed
    let col = v < 0.5 ? mixC(ramp[1], ramp[2], v / 0.5) : mixC(ramp[2], ramp[3], (v - 0.5) / 0.5);
    const n = vnoise(x * 0.4, y * 0.4, s + 2);
    if (n > 0.86) col = mixC(col, 0x2a1a0a, 0.4);
    const i = (y * W + x) * 4;
    d[i] = (col >> 16) & 255; d[i + 1] = (col >> 8) & 255; d[i + 2] = col & 255; d[i + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  const ink = o.ink ?? (g === 'dark' || g === 'olive' ? STENCIL_Y : INK);
  const hex = '#' + ink.toString(16).padStart(6, '0');
  if (o.border !== false && W > 16 && H > 8) { c.strokeStyle = hex; c.globalAlpha = 0.75; c.lineWidth = 1; c.strokeRect(2.5, 2.5, W - 5, H - 5); c.globalAlpha = 1; }
  const px = o.px ?? Math.max(8, Math.min(16, Math.round(H * (o.sub ? 0.5 : 0.66))));
  const ty = o.sub ? Math.round(H * 0.52) : Math.round(H / 2 + px * 0.36);
  if (text) inkText(c, text, Math.round(W / 2), ty, px, cssFont('--font-new'), hex, 'center');
  if (o.sub) inkText(c, o.sub, Math.round(W / 2), Math.round(H * 0.86), Math.max(8, Math.round(px * 0.6)), cssFont('--font-new'), hex, 'center');
  return cv;
}

/** a hazard stripe canvas */
export function hazardCanvas(w: number, h: number, seed = 5): HTMLCanvasElement {
  return paintFace({ w, h, tone: 'yellow', seed, cut: 1, wear: 0.4, hazards: [{ x: 0, y: 0, w: Math.round(w), h: Math.round(h) }] });
}

/** a paper inventory sticker: cream, a red stripe, typed text and a barcode */
export function stickerCanvas(w: number, h: number, text: string, seed = 7): HTMLCanvasElement {
  const cv = labelCanvas(w, h, '', { ground: 'cream', seed, border: false });
  const c = cv.getContext('2d')!;
  c.fillStyle = '#b8301e'; c.fillRect(0, 0, Math.round(w), 2);
  inkText(c, text, 3, Math.round(h * 0.5), Math.max(7, Math.min(9, Math.round(h * 0.4))), cssFont('--font-new'), '#2a2418', 'left');
  let x = 3;
  while (x < w - 3) { const bw = 1 + Math.floor(hh(x, 1, seed) * 2); c.fillStyle = '#1e1a12'; c.fillRect(x, Math.round(h * 0.62), bw, Math.max(2, Math.round(h * 0.3))); x += bw + 1 + Math.floor(hh(x, 2, seed) * 2); }
  // dog-eared, grubby
  c.fillStyle = 'rgba(60,40,20,0.25)'; c.fillRect(Math.round(w) - 3, Math.round(h) - 3, 3, 3);
  return cv;
}
/** a yellow enamel warning placard with the hazard triangle and a word */
export function placardCanvas(w: number, h: number, text: string, seed = 9): HTMLCanvasElement {
  const cv = labelCanvas(w, h, '', { ground: 'yellow', seed, border: true });
  const c = cv.getContext('2d')!;
  const s = Math.round(h * 0.62), tx = 4, ty = Math.round((h - s) / 2);
  c.fillStyle = '#14120c';
  c.beginPath(); c.moveTo(tx + s / 2, ty); c.lineTo(tx + s, ty + s); c.lineTo(tx, ty + s); c.closePath(); c.fill();
  c.fillStyle = '#e8b52a'; c.fillRect(Math.round(tx + s / 2) - 1, ty + Math.round(s * 0.35), 2, Math.round(s * 0.35)); c.fillRect(Math.round(tx + s / 2) - 1, ty + Math.round(s * 0.8), 2, 2);
  inkText(c, text, Math.round(tx + s + (w - tx - s) / 2), Math.round(h / 2 + Math.min(10, h * 0.5) * 0.36), Math.max(8, Math.min(10, Math.round(h * 0.55))), cssFont('--font-new'), '#14120c', 'center');
  return cv;
}
