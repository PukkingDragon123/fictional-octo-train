// A tiny additive pixel buffer for the BAILIFF hologram. Everything is drawn
// as light: colours add up and saturate, black is "no light", and the alpha
// written to the canvas is the brightest channel, so the projection reads as
// glowing pixels over the world with no panel behind it. Text comes in two
// sizes: a 3x5 glyph font (the band's own readout type) and the 5x7 LCD font
// the scanner uses (borrowed through a scratch Screen mask).
import { Screen } from '../font5x7';

/** 3x5 glyphs, rows top to bottom, 3 bits each ('1' lit). '¤' is the scrip sign. */
const F3: Record<string, string> = {
  '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001011001111', '4': '101101111001001',
  '5': '111100111001111', '6': '111100111101111', '7': '111001010010010', '8': '111101111101111', '9': '111101111001111',
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
  F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
  K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010',
  P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
  Z: '111001010100111', ' ': '000000000000000', ':': '000010000010000', '.': '000000000000010', ',': '000000000010100',
  '-': '000000111000000', '+': '000010111010000', '/': '001001010100100', '%': '101001010100101', '!': '010010010000010',
  '?': '110001010000010', '<': '001010100010001', '>': '100010001010100', '#': '101111101111101', '♥': '000101111111010',
  '¤': '010111101111010', '(': '010100100100010', ')': '010001001001010', '=': '000111000111000', '*': '000101010101000',
  '_': '000000000000111', "'": '010010000000000', '|': '010010010010010', '▸': '100110111110100', '×': '000101010101000',
  '°': '010101010000000', '~': '000011110000000', '[': '110100100100110', ']': '011001001001011', '"': '101101000000000',
};
const F3B = new Map<string, Uint8Array>();
for (const [k, s] of Object.entries(F3)) { const b = new Uint8Array(15); for (let i = 0; i < 15; i++) b[i] = s[i] === '1' ? 1 : 0; F3B.set(k, b); }
const F3Q = F3B.get('?')!;

/** a 3x5 glyph as a white mask image (DOM text that needs the band's own signs, like scrip) */
const glyph3Cache = new Map<string, string>();
export function glyph3Url(ch: string, k = 4): string {
  let u = glyph3Cache.get(ch);
  if (u) return u;
  const g = F3B.get(ch) || F3Q;
  const c = document.createElement('canvas'); c.width = 3 * k; c.height = 5 * k;
  const x = c.getContext('2d')!;
  x.fillStyle = '#fff';
  for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (g[j * 3 + i]) x.fillRect(i * k, j * k, k, k);
  u = c.toDataURL();
  glyph3Cache.set(ch, u);
  return u;
}

export interface Ink { r: number; g: number; b: number }
export const ink = (hex: number): Ink => ({ r: (hex >> 16) & 255, g: (hex >> 8) & 255, b: hex & 255 });
export function mixInk(a: Ink, b: Ink, t: number, out: Ink = { r: 0, g: 0, b: 0 }): Ink {
  out.r = a.r + (b.r - a.r) * t; out.g = a.g + (b.g - a.g) * t; out.b = a.b + (b.b - a.b) * t;
  return out;
}

export class HoloBuf {
  w: number; h: number;
  /** linear light, 0..255 per channel (can exceed while drawing; clamped on output) */
  r: Float32Array; g: Float32Array; b: Float32Array;
  img: ImageData;
  private mask: Screen;
  constructor(w: number, h: number) {
    this.w = w; this.h = h;
    const n = w * h;
    this.r = new Float32Array(n); this.g = new Float32Array(n); this.b = new Float32Array(n);
    this.img = new ImageData(w, h);
    this.mask = new Screen(Math.max(8, w), 7);
  }
  clear() { this.r.fill(0); this.g.fill(0); this.b.fill(0); }
  /** fade what is there toward black (persistence / phosphor trails) */
  fade(k: number) { const r = this.r, g = this.g, b = this.b; for (let i = 0; i < r.length; i++) { r[i] *= k; g[i] *= k; b[i] *= k; } }
  add(x: number, y: number, c: Ink, a: number) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || a <= 0) return;
    const i = y * this.w + x;
    this.r[i] += c.r * a; this.g[i] += c.g * a; this.b[i] += c.b * a;
  }
  /** chromatic add: red channel drawn `dx` px to the left, blue `dx` to the right */
  addChroma(x: number, y: number, c: Ink, a: number, dx: number) {
    if (!dx) { this.add(x, y, c, a); return; }
    x |= 0; y |= 0;
    if (y < 0 || y >= this.h || a <= 0) return;
    const row = y * this.w, w = this.w;
    const xr = x - dx, xb = x + dx;
    if (xr >= 0 && xr < w) this.r[row + xr] += c.r * a;
    if (x >= 0 && x < w) this.g[row + x] += c.g * a;
    if (xb >= 0 && xb < w) this.b[row + xb] += c.b * a;
  }
  rect(x: number, y: number, w: number, h: number, c: Ink, a: number) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.add(x + i, y + j, c, a); }
  hline(x0: number, x1: number, y: number, c: Ink, a: number, dash = 0) { for (let x = x0; x <= x1; x++) if (!dash || ((x - x0) % dash) < dash / 2) this.add(x, y, c, a); }
  vline(x: number, y0: number, y1: number, c: Ink, a: number) { if (y1 < y0) { const t = y0; y0 = y1; y1 = t; } for (let y = y0; y <= y1; y++) this.add(x, y, c, a); }
  line(x0: number, y0: number, x1: number, y1: number, c: Ink, a: number) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let g = 0; g < 600; g++) { this.add(x0, y0, c, a); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
  }
  /** brighten (k > 1) or dim one row of whatever light is already there (refresh sweep) */
  scaleRow(y: number, k: number) { y |= 0; if (y < 0 || y >= this.h) return; const o = y * this.w; for (let x = 0; x < this.w; x++) { this.r[o + x] *= k; this.g[o + x] *= k; this.b[o + x] *= k; } }
  /** 3x5 glyph text; returns width. `jit` scrambles random pixels (glitch) */
  text3(s: string, x: number, y: number, c: Ink, a: number, jit = 0, dx = 0): number {
    let cx = x;
    for (const ch0 of s) {
      const ch = ch0.toUpperCase();
      const g = F3B.get(ch) || F3Q;
      for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) {
        let on = g[j * 3 + i] === 1;
        if (jit && Math.random() < jit) on = !on;
        if (on) this.addChroma(cx + i, y + j, c, a, dx);
      }
      cx += 4;
    }
    return cx - x;
  }
  static w3(s: string) { return [...s].length * 4 - 1; }
  /** 5x7 LCD text (scale 1 or 2); returns width */
  text7(s: string, x: number, y: number, c: Ink, a: number, scale = 1, dx = 0): number {
    const m = this.mask;
    m.data.fill(0);
    const w = m.text(s, 0, 0, 0xffffff);
    for (let j = 0; j < 7; j++) for (let i = 0; i < Math.min(w, m.w); i++) {
      if (!m.data[j * m.w + i]) continue;
      if (scale === 1) this.addChroma(x + i, y + j, c, a, dx);
      else for (let v = 0; v < scale; v++) for (let u = 0; u < scale; u++) this.addChroma(x + i * scale + u, y + j * scale + v, c, a, dx);
    }
    return w * scale;
  }
  static w7(s: string, scale = 1) { return [...s].length * 6 * scale; }

  /**
   * Write to the ImageData: per-row horizontal shift (`shift(y)` px; heat
   * shimmer, glitch slices) and a global gain. Alpha is the brightest channel,
   * colour is divided back out so the canvas composites like added light.
   */
  resolve(gain = 1, shift?: (y: number) => number, noise = 0): ImageData {
    const d = this.img.data, w = this.w, h = this.h;
    const R = this.r, G2 = this.g, B = this.b;
    for (let y = 0; y < h; y++) {
      const sx = shift ? Math.round(shift(y)) : 0;
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const src = x - sx;
        let r = 0, g = 0, b = 0;
        if (src >= 0 && src < w) { const i = row + src; r = R[i] * gain; g = G2[i] * gain; b = B[i] * gain; }
        if (noise > 0 && Math.random() < noise) { const n = 40 + Math.random() * 120; r += n * 0.6; g += n; b += n; }
        if (r > 255) r = 255; if (g > 255) g = 255; if (b > 255) b = 255;
        const a = r > g ? (r > b ? r : b) : (g > b ? g : b);
        const o = (row + x) * 4;
        if (a < 2) { d[o + 3] = 0; continue; }
        const k = 255 / a;
        d[o] = r * k; d[o + 1] = g * k; d[o + 2] = b * k; d[o + 3] = a;
      }
    }
    return this.img;
  }
}
