// A small opaque pixel buffer for the body HUD objects (IV bag, lungs, stomach
// jar). Colours are 0xRRGGBB ints; alpha blending is per pixel; an outline pass
// gives every object a dark pixel-art rim so it reads over any floor.

export class Pix {
  readonly w: number; readonly h: number;
  readonly img: ImageData;
  readonly u32: Uint32Array;
  private mask: Uint8Array;
  constructor(w: number, h: number) {
    this.w = w; this.h = h;
    this.img = new ImageData(w, h);
    this.u32 = new Uint32Array(this.img.data.buffer);
    this.mask = new Uint8Array(w * h);
  }
  clear() { this.u32.fill(0); }
  /** opaque write */
  set(x: number, y: number, c: number) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.u32[y * this.w + x] = 0xff000000 | ((c & 0xff) << 16) | (c & 0xff00) | ((c >> 16) & 0xff);
  }
  /** alpha blend over what is there (a transparent pixel takes the colour at that alpha) */
  blend(x: number, y: number, c: number, a: number) {
    x |= 0; y |= 0;
    if (a <= 0 || x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    if (a >= 1) { this.set(x, y, c); return; }
    const i = y * this.w + x, d = this.u32[i];
    const da = (d >>> 24) / 255;
    const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
    if (da <= 0) { this.u32[i] = ((Math.round(a * 255) & 255) << 24) | (b << 16) | (g << 8) | r; return; }
    const dr = d & 255, dg = (d >> 8) & 255, db = (d >> 16) & 255;
    const oa = a + da * (1 - a);
    const k = a / oa;
    const nr = dr + (r - dr) * k, ng = dg + (g - dg) * k, nb = db + (b - db) * k;
    this.u32[i] = ((Math.round(oa * 255) & 255) << 24) | ((nb & 255) << 16) | ((ng & 255) << 8) | (nr & 255);
  }
  rect(x: number, y: number, w: number, h: number, c: number, a = 1) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.blend(x + i, y + j, c, a);
  }
  hline(x0: number, x1: number, y: number, c: number, a = 1) { for (let x = Math.round(x0); x <= Math.round(x1); x++) this.blend(x, y, c, a); }
  vline(x: number, y0: number, y1: number, c: number, a = 1) { for (let y = Math.round(y0); y <= Math.round(y1); y++) this.blend(x, y, c, a); }
  line(x0: number, y0: number, x1: number, y1: number, c: number, a = 1) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let e = dx + dy, n = 0;
    for (;;) {
      this.blend(x0, y0, c, a);
      if ((x0 === x1 && y0 === y1) || ++n > 400) break;
      const e2 = 2 * e;
      if (e2 >= dy) { e += dy; x0 += sx; }
      if (e2 <= dx) { e += dx; y0 += sy; }
    }
  }
  disc(cx: number, cy: number, r: number, c: number, a = 1) {
    const r2 = r * r, R = Math.ceil(r);
    for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) if (i * i + j * j <= r2) this.blend(cx + i, cy + j, c, a);
  }
  ring(cx: number, cy: number, r: number, c: number, a = 1) {
    const R = Math.ceil(r) + 1;
    for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) { const d = Math.sqrt(i * i + j * j); if (Math.abs(d - r) < 0.55) this.blend(cx + i, cy + j, c, a); }
  }
  /** dark rim around everything opaque enough (pixel-art outline), plus a soft shadow below-right */
  outline(c: number, shadow = 0.35) {
    const { w, h, u32, mask } = this;
    for (let i = 0; i < u32.length; i++) mask[i] = (u32[i] >>> 24) > 90 ? 1 : 0;
    const col = 0xff000000 | ((c & 0xff) << 16) | (c & 0xff00) | ((c >> 16) & 0xff);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (mask[i]) continue;
        const n = (x > 0 && mask[i - 1]) || (x < w - 1 && mask[i + 1]) || (y > 0 && mask[i - w]) || (y < h - 1 && mask[i + w]);
        if (n) u32[i] = col;
        else if (shadow > 0 && x > 0 && y > 0 && mask[i - w - 1]) this.blend(x, y, 0x000000, shadow);
      }
    }
  }
}

// ---- colour helpers (0xRRGGBB)
export function mix(a: number, b: number, t: number): number {
  if (t <= 0) return a; if (t >= 1) return b;
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}
export function shade(c: number, k: number): number {
  const r = Math.min(255, Math.max(0, Math.round(((c >> 16) & 255) * k)));
  const g = Math.min(255, Math.max(0, Math.round(((c >> 8) & 255) * k)));
  const b = Math.min(255, Math.max(0, Math.round((c & 255) * k)));
  return (r << 16) | (g << 8) | b;
}
/** 4x4 ordered dither threshold 0..1 */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const bayer = (x: number, y: number) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
/** cheap hash noise 0..1 */
export function hash(x: number, y: number, s = 0): number {
  let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
