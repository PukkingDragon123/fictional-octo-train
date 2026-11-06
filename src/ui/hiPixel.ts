// THE HIGH-RESOLUTION PIXEL KIT (round 13). The interface's small pixel art
// (context icons, item icons, research icons, the mini-game gauges, the action
// bar, the loading screens) is drawn at two to four times the density it used
// to be: one art pixel per CSS pixel (or per device pixel on a sharp screen)
// instead of chunky 2-3 px blocks, with real shading in it.
//
//   upscaleRows   hand-drawn 16x16 maps grown with the EPX / AdvMAME family
//                 (Scale2x, Scale3x): diagonals and curves come out smooth, no
//                 blurry resampling and no stair-stepped fat blocks
//   shadeSprite   a flat-colour sprite lit from the top-left: every colour
//                 region gets a bevelled height field, a hue-shifted ramp (warm
//                 lights, cool shadows) broken with ordered dithering, a lit
//                 lip, specular glints, a little material grain, 1 px inner
//                 lines where materials meet, a selective outline (a dark tone
//                 of the colour it touches, never flat black) and a drop shadow
//   bevel / rivet / hazard / glass / bar
//                 Canvas2D primitives for gauges and plates, all whole pixels
//   drawBar       the one detailed progress bar every loader and timed action
//                 uses: a riveted gunmetal housing, a recessed glass channel,
//                 amber cells with a four-tone ramp, a moving glint, ticks
import { PixelCanvas, mixHex, bayer } from '../gfx/pixel';

// ================================================================== density
/** device pixels per CSS pixel the art is drawn for (1 on plain screens, 2 on sharp ones) */
export function dprK(): number { return Math.max(1, Math.min(2, Math.round(window.devicePixelRatio || 1))); }

// ================================================================== EPX upscaling
type Grid = string[][];
function scale2x(g: Grid): Grid {
  const H = g.length, W = g[0]?.length ?? 0;
  const at = (x: number, y: number) => g[Math.max(0, Math.min(H - 1, y))][Math.max(0, Math.min(W - 1, x))];
  const out: Grid = Array.from({ length: H * 2 }, () => new Array(W * 2).fill('.'));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const P = g[y][x], A = at(x, y - 1), B = at(x + 1, y), C = at(x - 1, y), D = at(x, y + 1);
    out[y * 2][x * 2] = C === A && C !== D && A !== B ? A : P;
    out[y * 2][x * 2 + 1] = A === B && A !== C && B !== D ? B : P;
    out[y * 2 + 1][x * 2] = D === C && D !== B && C !== A ? C : P;
    out[y * 2 + 1][x * 2 + 1] = B === D && B !== A && D !== C ? D : P;
  }
  return out;
}
function scale3x(g: Grid): Grid {
  const H = g.length, W = g[0]?.length ?? 0;
  const at = (x: number, y: number) => g[Math.max(0, Math.min(H - 1, y))][Math.max(0, Math.min(W - 1, x))];
  const out: Grid = Array.from({ length: H * 3 }, () => new Array(W * 3).fill('.'));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const A = at(x - 1, y - 1), B = at(x, y - 1), C = at(x + 1, y - 1), D = at(x - 1, y), E = g[y][x], F = at(x + 1, y), Gq = at(x - 1, y + 1), Hq = at(x, y + 1), I = at(x + 1, y + 1);
    const o = [E, E, E, E, E, E, E, E, E];
    if (B !== Hq && D !== F) {
      o[0] = D === B ? D : E;
      o[1] = (D === B && E !== C) || (B === F && E !== A) ? B : E;
      o[2] = B === F ? F : E;
      o[3] = (D === B && E !== Gq) || (D === Hq && E !== A) ? D : E;
      o[5] = (B === F && E !== I) || (Hq === F && E !== C) ? F : E;
      o[6] = D === Hq ? D : E;
      o[7] = (D === Hq && E !== I) || (Hq === F && E !== Gq) ? Hq : E;
      o[8] = Hq === F ? F : E;
    }
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) out[y * 3 + j][x * 3 + i] = o[j * 3 + i];
  }
  return out;
}
/** a char map grown k times (k = 1, 2, 3, 4, 6, 8) with edge-aware EPX rules */
export function upscaleRows(rows: string[], k: number): string[] {
  const W = Math.max(...rows.map((r) => r.length));
  let g: Grid = rows.map((r) => r.padEnd(W, '.').split(''));
  let left = Math.max(1, Math.round(k));
  if (left % 3 === 0) { g = scale3x(g); left /= 3; }
  while (left >= 2 && left % 2 === 0) { g = scale2x(g); left /= 2; }
  if (left > 1) g = g.flatMap((r) => Array.from({ length: left }, () => r.flatMap((c) => new Array(left).fill(c))));
  return g.map((r) => r.join(''));
}
/** stamp a char map into a fresh canvas (pad px of empty margin round it) */
export function rowsToCanvas(rows: string[], pal: Record<string, number>, pad = 0, w?: number, h?: number): PixelCanvas {
  const W = w ?? Math.max(...rows.map((r) => r.length)) + pad * 2, H = h ?? rows.length + pad * 2;
  const pc = new PixelCanvas(W, H); pc.wrap = false;
  rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) { const c = pal[r[x]]; if (r[x] !== '.' && r[x] !== ' ' && c !== undefined) pc.set(x + pad, y + pad, c); } });
  return pc;
}

// ================================================================== shading
export interface ShadeOpts {
  /** bevel width in px (default: a little over 1/10 of the sprite) */
  bevel?: number;
  /** strength of the light 0..1.5 */
  light?: number;
  /** material grain 0..0.1 */
  grain?: number;
  /** dark 1 px lines where two materials meet */
  inner?: boolean;
  /** selective outline: 0 none, 1 thin (4-connected), 2 round (8-connected) */
  outline?: number;
  /** drop shadow offset in px (0: none) */
  shadow?: number;
  seed?: number;
}
const WARM = 0xfff2cf, COOL = 0x1a1530, INKC = 0x07060a;
function lumOf(c: number) { return ((c >> 16) & 255) * 0.3 + ((c >> 8) & 255) * 0.59 + (c & 255) * 0.11; }
function hsh(x: number, y: number, s: number) { let h = (x * 374761393 + y * 668265263 + s * 974711) | 0; h = (h ^ (h >>> 13)) * 1274126177; h ^= h >>> 16; return ((h >>> 0) % 1000) / 1000; }

/** light a flat-colour sprite (in place; returns it) */
export function shadeSprite(pc: PixelCanvas, o: ShadeOpts = {}): PixelCanvas {
  const W = pc.w, H = pc.h, N = W * H;
  const col = new Int32Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) col[y * W + x] = pc.alpha(x, y) > 0 ? pc.get(x, y) : -1;
  const op = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && col[y * W + x] >= 0;
  const bev = o.bevel ?? Math.max(2, Math.round(Math.min(W, H) / 9));
  const light = o.light ?? 1;
  // distance to the edge of each colour region (chamfer 1 / 1.4, through the same colour only)
  const dR = new Float32Array(N).fill(1e4), dS = new Float32Array(N).fill(1e4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, c = col[i];
    if (c < 0) { dR[i] = 0; dS[i] = 0; continue; }
    let rb = false, sb = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const q = op(x + dx, y + dy) ? col[(y + dy) * W + x + dx] : -1; if (q < 0) sb = true; if (q !== c) rb = true; }
    if (rb) dR[i] = 1; if (sb) dS[i] = 1;
  }
  const pass = (d: Float32Array, same: boolean) => {
    const K: [number, number, number][] = [[-1, 0, 1], [0, -1, 1], [-1, -1, 1.41], [1, -1, 1.41]];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (col[i] < 0) continue; for (const [dx, dy, w] of K) { const X = x + dx, Y = y + dy; if (!op(X, Y)) continue; const j = Y * W + X; if (same && col[j] !== col[i]) continue; if (d[j] + w < d[i]) d[i] = d[j] + w; } }
    for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) { const i = y * W + x; if (col[i] < 0) continue; for (const [dx, dy, w] of K) { const X = x - dx, Y = y - dy; if (!op(X, Y)) continue; const j = Y * W + X; if (same && col[j] !== col[i]) continue; if (d[j] + w < d[i]) d[i] = d[j] + w; } }
  };
  pass(dR, true); pass(dS, false);
  const dome = Math.max(bev * 2.2, Math.min(W, H) / 3.5);
  const hgt = new Float32Array(N);
  for (let i = 0; i < N; i++) if (col[i] >= 0) hgt[i] = 0.62 * Math.min(1, (dR[i] - 0.5) / bev) + 0.38 * Math.min(1, (dS[i] - 0.5) / dome);
  const hAt = (x: number, y: number, i: number) => (op(x, y) ? hgt[y * W + x] : hgt[i] - 0.5);
  // bounding box (the global light runs over the sprite, not the canvas)
  let x0 = W, x1 = 0, y0 = H, y1 = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (col[y * W + x] >= 0) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const bw = Math.max(1, x1 - x0), bh = Math.max(1, y1 - y0);
  const Lx = -0.58, Ly = -0.68, Lz = 0.45;
  const out = new Int32Array(N).fill(-1);
  const seed = o.seed ?? 7;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, c = col[i];
    if (c < 0) continue;
    const gx = (hAt(x + 1, y, i) - hAt(x - 1, y, i)) * 0.5 * bev, gy = (hAt(x, y + 1, i) - hAt(x, y - 1, i)) * 0.5 * bev;
    const nl = Math.hypot(gx, gy, 1);
    const lit = (-gx * Lx - gy * Ly + Lz) / nl - Lz;
    const glob = (0.5 - (y - y0) / bh) * 0.32 + (0.5 - (x - x0) / bw) * 0.12;
    const v = lit * 1.15 * light + glob * light + (hsh(x, y, seed) - 0.5) * (o.grain ?? 0.04) * 4;
    // a 5-step ramp, the steps broken with ordered dither
    const lv = Math.max(-2, Math.min(2, Math.round(v * 3 + (bayer(x, y) - 0.5) * 0.7)));
    let cc = lv > 0 ? mixHex(c, WARM, 0.15 * lv) : lv < 0 ? mixHex(c, COOL, 0.19 * -lv) : c;
    // the lit lip and its glints
    if (lv >= 2 && dR[i] <= 1.5) cc = mixHex(cc, 0xffffff, hsh(x >> 1, y >> 1, seed + 3) > 0.7 ? 0.55 : 0.3);
    out[i] = cc;
  }
  // inner lines where two materials meet (on the darker side)
  if (o.inner !== false) {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, c = col[i];
      if (c < 0) continue;
      for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
        if (!op(x + dx, y + dy)) continue;
        const q = col[(y + dy) * W + x + dx];
        if (q !== c && lumOf(c) < lumOf(q) - 18) { out[i] = mixHex(out[i], INKC, 0.38); break; }
      }
    }
  }
  pc.clear();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = out[y * W + x]; if (c >= 0) pc.set(x, y, c); }
  // selective outline
  const ol = o.outline ?? 1;
  if (ol > 0) {
    const nb = ol > 1 ? [[0, 1], [1, 0], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]] : [[0, 1], [1, 0], [-1, 0], [0, -1]];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (col[y * W + x] >= 0) continue;
      for (const [dx, dy] of nb) {
        if (!op(x + dx, y + dy)) continue;
        const shadowSide = dx < 0 || dy < 0;
        pc.set(x, y, mixHex(out[(y + dy) * W + x + dx], INKC, shadowSide ? 0.88 : 0.78));
        break;
      }
    }
  }
  // drop shadow
  const sd = o.shadow ?? 0;
  if (sd > 0) {
    const snap = new Uint8ClampedArray(pc.data);
    for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
      const sx = x - sd, sy = y - sd;
      if (snap[(y * W + x) * 4 + 3] > 0 || sx < 0 || sy < 0) continue;
      if (snap[(sy * W + sx) * 4 + 3] > 0) pc.set(x, y, 0x000000, 96);
    }
  }
  return pc;
}

export function pcUrl(pc: PixelCanvas): string {
  const c = document.createElement('canvas'); c.width = pc.w; c.height = pc.h;
  c.getContext('2d')!.putImageData(pc.toImageData(), 0, 0);
  return c.toDataURL();
}

// ================================================================== Canvas2D primitives (whole pixels)
type C2 = CanvasRenderingContext2D;
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
/** gunmetal, dark to light */
export const GUN = [0x07080a, 0x121417, 0x1c1f23, 0x272b30, 0x343940, 0x434a52, 0x566069, 0x6e7983, 0x8d98a1, 0xb4bec4, 0xdde4e6];
export const AMB = [0x3a1c04, 0x6e3608, 0xa65a10, 0xd8861c, 0xf2ad32, 0xffd06a, 0xfff0bc];
export const GRN = [0x062410, 0x0c4a20, 0x167a34, 0x24b04c, 0x48dc70, 0x96ffb0, 0xe0ffe8];
export const RED = [0x2a0604, 0x5a0c08, 0x8e1a10, 0xc8301e, 0xf05a3a, 0xff9a7a, 0xffe0d4];
export const CYN = [0x041c24, 0x083a4a, 0x0e6278, 0x1a92aa, 0x3ec8da, 0x9cf0f8, 0xe4feff];
export function rect(c: C2, x: number, y: number, w: number, h: number, col: number | string, a = 1) {
  if (w <= 0 || h <= 0) return;
  c.globalAlpha = a; c.fillStyle = typeof col === 'number' ? hex(col) : col; c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); c.globalAlpha = 1;
}
/** a bevelled block: ink outline, chamfered corners, lit top-left lip, shaded bottom-right, a soft vertical ramp (ramp: dark..light, 5+ tones) */
export function bevel(c: C2, x: number, y: number, w: number, h: number, ramp: number[], o: { ink?: boolean; chamfer?: number; sunk?: boolean } = {}) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  const n = ramp.length, ch = o.chamfer ?? (Math.min(w, h) >= 8 ? 2 : 1);
  if (o.ink !== false) {
    rect(c, x - 1 + ch, y - 1, w + 2 - ch * 2, h + 2, INKC); rect(c, x - 1, y - 1 + ch, w + 2, h + 2 - ch * 2, INKC);
    if (ch > 1) { rect(c, x, y, 1, 1, INKC); rect(c, x + w - 1, y, 1, 1, INKC); rect(c, x, y + h - 1, 1, 1, INKC); rect(c, x + w - 1, y + h - 1, 1, 1, INKC); }
  }
  const mid = Math.floor(n / 2);
  // body: a 3-band vertical ramp
  const bands = o.sunk ? [mid - 1, mid, mid] : [mid + 1, mid, mid - 1];
  for (let j = 0; j < h; j++) {
    const b = bands[Math.min(2, Math.floor((j / Math.max(1, h)) * 3))];
    const inset = ch > 1 && (j === 0 || j === h - 1) ? 1 : 0;
    rect(c, x + inset, y + j, w - inset * 2, 1, ramp[Math.max(0, Math.min(n - 1, b))]);
  }
  const lip = o.sunk ? ramp[Math.max(0, mid - 2)] : ramp[Math.min(n - 1, mid + 2)], shd = o.sunk ? ramp[Math.min(n - 1, mid + 1)] : ramp[Math.max(0, mid - 2)];
  const ins = ch > 1 ? 1 : 0;
  rect(c, x + ins, y, w - ins * 2, 1, lip); rect(c, x, y + ins, 1, h - ins * 2, lip);
  rect(c, x + ins, y + h - 1, w - ins * 2, 1, shd); rect(c, x + w - 1, y + ins, 1, h - ins * 2, shd);
  if (!o.sunk && w > 4 && h > 3) { rect(c, x + 1 + ins, y + 1, Math.min(3, w - 3), 1, ramp[n - 1]); }
}
/** a domed rivet / screw head (r = 1 small, 2 large) */
export function rivet(c: C2, x: number, y: number, r = 1, slot = false) {
  x = Math.round(x); y = Math.round(y);
  if (r <= 1) {
    rect(c, x - 1, y - 1, 3, 3, GUN[1]); rect(c, x - 1, y - 1, 2, 2, GUN[7]); rect(c, x, y, 1, 1, GUN[5]); rect(c, x - 1, y - 1, 1, 1, GUN[10]);
    return;
  }
  rect(c, x - 2, y - 1, 5, 3, GUN[1]); rect(c, x - 1, y - 2, 3, 5, GUN[1]);
  rect(c, x - 1, y - 1, 3, 3, GUN[6]); rect(c, x - 1, y - 1, 2, 2, GUN[8]); rect(c, x - 1, y - 1, 1, 1, GUN[10]); rect(c, x + 1, y + 1, 1, 1, GUN[4]);
  if (slot) { rect(c, x - 1, y + 1, 1, 1, GUN[2]); rect(c, x, y, 1, 1, GUN[2]); rect(c, x + 1, y - 1, 1, 1, GUN[3]); }
}
/** diagonal hazard stripes in a box */
export function hazard(c: C2, x: number, y: number, w: number, h: number, a = 0xe8b52a, b = 0x17150f, period = 6, phase = 0) {
  x = Math.round(x); y = Math.round(y);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const s = ((i + j + Math.floor(phase)) % period + period) % period < period / 2;
    rect(c, x + i, y + j, 1, 1, s ? (j === 0 ? mixHex(a, 0xffffff, 0.35) : j === h - 1 ? mixHex(a, 0x000000, 0.3) : a) : b);
  }
}
/** a recessed glass channel (dark, scanlined, with an inner shadow and a lit bottom lip) */
export function glass(c: C2, x: number, y: number, w: number, h: number, tint = 0x0a0f0c) {
  x = Math.round(x); y = Math.round(y);
  rect(c, x - 1, y - 1, w + 2, h + 2, INKC);
  rect(c, x, y, w, h, tint);
  for (let j = 1; j < h; j += 2) rect(c, x, y + j, w, 1, 0x000000, 0.28);
  rect(c, x, y, w, 1, 0x000000, 0.55); rect(c, x, y, 1, h, 0x000000, 0.45);
  rect(c, x, y + h, w + 1, 1, GUN[6]); rect(c, x + w, y - 1, 1, h + 1, GUN[5]);
}

export interface BarOpts {
  /** cells' colour ramp (dark..light, 7 tones) */
  ramp?: number[];
  /** seconds, for the glint */
  t?: number;
  /** cell width and gap */
  cell?: number; gap?: number;
  /** tick marks under the channel */
  ticks?: boolean;
  /** an indeterminate sweep instead of a fill */
  busy?: boolean;
  /** the first part of the fill in another ramp (e.g. what was done before, green, then the gain, amber) */
  lo?: { k: number; ramp: number[] };
}
/**
 * The progress bar: a glass channel with lit cells. (x, y, w, h) is the
 * channel's inside; draw it inside a housing (bevel) or alone.
 */
export function drawBar(c: C2, x: number, y: number, w: number, h: number, frac: number, o: BarOpts = {}) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  const R0 = o.ramp ?? AMB, t = o.t ?? 0;
  let R = R0;
  glass(c, x, y, w, h);
  const cw = o.cell ?? Math.max(3, Math.round(h * 0.75)), gap = o.gap ?? 1;
  const n = Math.max(1, Math.floor((w - 2 + gap) / (cw + gap)));
  const used = n * (cw + gap) - gap, ox = x + 1 + Math.floor((w - 2 - used) / 2);
  const f = Math.max(0, Math.min(1, frac));
  const lit = f * n;
  for (let i = 0; i < n; i++) {
    const cx = ox + i * (cw + gap), cy = y + 1, chh = h - 2;
    let k = o.busy ? Math.max(0, 1 - Math.abs(((t * 1.6) % 1.4) * n - i - 0.2 * n) / (n * 0.18)) : Math.max(0, Math.min(1, lit - i));
    if (k <= 0) { rect(c, cx, cy, cw, chh, R0[0], 0.55); rect(c, cx, cy, cw, 1, R0[1], 0.35); continue; }
    const head = !o.busy && k < 1;
    const R = o.lo && (i + 1) / n <= o.lo.k + 1e-6 ? o.lo.ramp : R0;
    const top = head ? R[4] : R[3], bot = R[2];
    // cell: lit top line, body, shade, bottom lip; the head cell flickers hot
    for (let j = 0; j < chh; j++) {
      const u = j / Math.max(1, chh - 1);
      const tone = j === 0 ? R[6] : j === 1 ? R[5] : u < 0.55 ? top : u < 0.85 ? bot : R[1];
      rect(c, cx, cy + j, cw, 1, tone, head ? 0.45 + 0.55 * k : 1);
    }
    rect(c, cx, cy + 1, 1, chh - 2, R[5], head ? 0.5 : 0.8);
    rect(c, cx + cw - 1, cy + 1, 1, chh - 2, R[1], 0.6);
  }
  // the glint sweeping along the lit part, and a hot leading edge
  if (!o.busy && f > 0.02) {
    const end = ox + Math.min(used, Math.round(lit * (cw + gap)));
    const gx = ox + ((t * 70) % Math.max(8, end - ox + 16)) - 8;
    for (let j = 0; j < h - 2; j++) {
      const px = Math.round(gx - j * 0.6);
      if (px >= ox && px + 2 <= end) rect(c, px, y + 1 + j, 2, 1, 0xffffff, 0.35);
    }
    if (f < 1) rect(c, Math.min(end, x + w - 2), y + 1, 1, h - 2, R0[6], 0.85);
  }
  // glass reflection over everything
  rect(c, x + 1, y + 1, Math.max(0, w - 2), 1, 0xffffff, 0.08);
  if (o.ticks) for (let i = 0; i <= 10; i++) { const tx = x + Math.round((i / 10) * (w - 1)); rect(c, tx, y + h + 2, 1, i % 5 === 0 ? 3 : 2, GUN[i % 5 === 0 ? 8 : 6]); }
}

/**
 * A skill gauge: a riveted housing round a glass channel of cells; the target
 * band(s) lit green, an optional amber fill (a level being drawn up), and a
 * needle with an ink edge and arrow heads. W x H is the whole plate.
 */
export function drawGauge(c: C2, W: number, H: number, o: { zones?: ([number, number] | undefined)[]; x: number; fill?: number; t?: number; flash?: 'hit' | 'miss' | '' }) {
  c.clearRect(0, 0, W, H);
  rect(c, 3, H - 3, W - 4, 3, 0x000000, 0.4);
  bevel(c, 1, 1, W - 3, H - 5, GUN.slice(2, 9), { chamfer: 3 });
  rivet(c, 6, 7, 2, true); rivet(c, W - 8, 7, 2, true); rivet(c, 6, H - 11, 1); rivet(c, W - 8, H - 11, 1);
  const x0 = 14, w = W - 28, y0 = 10, h = Math.max(8, H - 26);
  glass(c, x0, y0, w, h, o.flash === 'hit' ? 0x0c2a14 : o.flash === 'miss' ? 0x2a0c08 : 0x08100c);
  const cell = 5, n = Math.floor((w - 2) / (cell + 1));
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n, cx = x0 + 1 + i * (cell + 1);
    const inZ = (z?: [number, number]) => !!z && u >= z[0] && u <= z[1];
    const zone = (o.zones ?? []).some(inZ);
    const filled = o.fill !== undefined && u <= o.fill;
    const R = filled ? (zone ? GRN : AMB) : zone ? GRN : GUN;
    const on = filled || zone;
    const a = on ? (filled || !o.fill ? 1 : 0.55) : 0.8;
    rect(c, cx, y0 + 1, cell, h - 2, on ? R[3] : R[2], a);
    rect(c, cx, y0 + 1, cell, 1, on ? R[6] : R[4], on ? a : 0.5);
    rect(c, cx, y0 + 2, cell, Math.max(1, Math.round(h * 0.25)), on ? R[4] : R[3], on ? 0.9 * a : 0.5);
    rect(c, cx, y0 + h - 4, cell, 2, on ? R[2] : R[1], 0.9);
  }
  rect(c, x0 + 1, y0 + 1, w - 2, 1, 0xffffff, 0.07);
  for (let i = 0; i <= 20; i++) { const tx = x0 + Math.round((i / 20) * (w - 1)); rect(c, tx, y0 + h + 2, 1, i % 5 === 0 ? 4 : 2, GUN[i % 5 === 0 ? 9 : 6]); }
  const nx = x0 + Math.round(Math.max(0, Math.min(1, o.x)) * (w - 1));
  rect(c, nx - 2, y0 - 4, 5, h + 8, INKC);
  rect(c, nx - 1, y0 - 3, 3, h + 6, AMB[4]); rect(c, nx - 1, y0 - 3, 1, h + 6, AMB[6]); rect(c, nx + 1, y0 - 3, 1, h + 6, AMB[2]);
  for (let j = 0; j < 3; j++) { rect(c, nx - 3 + j, y0 - 6 + j, 7 - j * 2, 1, j === 0 ? INKC : AMB[5]); rect(c, nx - 3 + j, y0 + h + 5 - j, 7 - j * 2, 1, j === 0 ? INKC : AMB[3]); }
}
/** keep a crisp gauge canvas inside a host element and paint it */
export function gaugeIn(el: HTMLElement, H: number, o: Parameters<typeof drawGauge>[3]) {
  const Wc = Math.round(el.clientWidth) || 400;
  let cv = el.querySelector('canvas.hi-gauge') as HTMLCanvasElement | null;
  if (!cv || +(cv.dataset.w ?? 0) !== Wc) {
    cv?.remove();
    const k = crispCanvas(Wc, H); cv = k.cv; cv.className = 'hi-gauge'; cv.dataset.w = String(Wc);
    cv.style.position = 'absolute'; cv.style.left = '0'; cv.style.top = '0';
    el.append(cv);
  }
  drawGauge(cv.getContext('2d')!, Wc, H, o);
}

/** a canvas sized for crisp whole pixels: w x h art pixels at `scale` CSS px each, backed at device resolution */
export function crispCanvas(w: number, h: number, scale = 1): { cv: HTMLCanvasElement; c: C2; k: number } {
  const k = dprK() * scale;
  const cv = document.createElement('canvas');
  cv.width = w * k; cv.height = h * k;
  cv.style.width = w * scale + 'px'; cv.style.height = h * scale + 'px';
  cv.style.imageRendering = 'pixelated';
  const c = cv.getContext('2d')!;
  c.imageSmoothingEnabled = false;
  c.setTransform(k, 0, 0, k, 0, 0);
  return { cv, c, k };
}
