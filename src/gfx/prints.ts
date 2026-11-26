// Printed matter made from real imagery: the wall posters, the notice-board prints, the hallway poster, the evidence
// photographs and the specimen plate. Each one is a real photograph (Poly Haven CC0 HDRI backplates and textures) or a
// render of the game's own 3D scenes, printed in the institute's look (halftone, the green/yellow inks, aged paper,
// Alagard type) by the art pipeline; they ship packed into sheets in public/art/print (sources: CREDITS.md there).
// A sheet loads once at start; textures that use a print draw their old procedural art until it is in, then repaint.
import { PRINT_MAP, PrintKey, PRINT_SHEETS } from './printMap';

export type { PrintKey };
/** anything with a w x h RGBA pixel store (the texture atlases' PixelCanvas) */
interface PixelTarget { w: number; h: number; data: Uint8ClampedArray }

const sheets = new Map<string, HTMLImageElement | null>();
const waiting = new Map<string, (() => void)[]>();
const canDraw = () => typeof document !== 'undefined' && typeof Image !== 'undefined' && typeof document.createElement === 'function';

function loadSheet(name: string) {
  if (sheets.has(name) || !canDraw()) return;
  sheets.set(name, null);
  const im = new Image();
  im.decoding = 'async';
  im.onload = () => {
    sheets.set(name, im);
    const cbs = waiting.get(name) ?? []; waiting.delete(name);
    for (const cb of cbs) try { cb(); } catch (e) { console.warn('print', e); }
  };
  im.onerror = () => { waiting.delete(name); };
  im.src = `${import.meta.env.BASE_URL}art/print/${PRINT_SHEETS[name]}`;
}
/** start fetching every sheet (called at start; cheap: a few small JPEGs) */
export function preloadPrints() { for (const n of Object.keys(PRINT_SHEETS)) loadSheet(n); }

export function printReady(key: PrintKey): boolean { return !!sheets.get(PRINT_MAP[key][0]); }
/** cb once the print's sheet is in (at once if it is) */
export function whenPrint(key: PrintKey, cb: () => void) {
  const s = PRINT_MAP[key][0];
  if (sheets.get(s)) { cb(); return; }
  loadSheet(s);
  if (!canDraw()) return;
  const l = waiting.get(s) ?? []; l.push(cb); waiting.set(s, l);
}

const cache = new Map<string, ImageData>();
/** the print scaled to w x h (area-averaged), or null until its sheet is in */
export function printPixels(key: PrintKey, w: number, h: number): ImageData | null {
  w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
  const ck = key + '|' + w + 'x' + h;
  const hit = cache.get(ck); if (hit) return hit;
  const [s, sx, sy, sw, sh] = PRINT_MAP[key];
  const im = sheets.get(s);
  if (!im) return null;
  // halve step by step (a box filter each time), then one last smooth step: keeps tiny prints clean, not aliased
  let src: CanvasImageSource = im, x = sx, y = sy, cw = sw, ch = sh;
  while (cw >= w * 2 && ch >= h * 2) {
    const nw = Math.ceil(cw / 2), nh = Math.ceil(ch / 2);
    const cv = document.createElement('canvas'); cv.width = nw; cv.height = nh;
    const c = cv.getContext('2d')!; c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    c.drawImage(src, x, y, cw, ch, 0, 0, nw, nh);
    src = cv; x = 0; y = 0; cw = nw; ch = nh;
  }
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c = cv.getContext('2d', { willReadFrequently: true })!; c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
  c.drawImage(src, x, y, cw, ch, 0, 0, w, h);
  const d = c.getImageData(0, 0, w, h);
  // tiny prints (atlas tiles) get a light sharpen so they read as pixel art, not a blur
  if (w * h <= 64 * 64) sharpen(d, 0.55);
  cache.set(ck, d);
  return d;
}

function sharpen(d: ImageData, k: number) {
  const { width: W, height: H, data: s } = d, src = new Uint8ClampedArray(s);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) for (let c = 0; c < 3; c++) {
    const at = (xx: number, yy: number) => src[((Math.min(H - 1, Math.max(0, yy)) * W) + Math.min(W - 1, Math.max(0, xx))) * 4 + c];
    const v = at(x, y), avg = (at(x - 1, y) + at(x + 1, y) + at(x, y - 1) + at(x, y + 1)) / 4;
    s[(y * W + x) * 4 + c] = v + (v - avg) * k * 2;
  }
}

/**
 * copy the print into a pixel canvas at (x, y, w, h). false (nothing drawn) until its sheet is in; with `later`,
 * later() runs once it is, to repaint.
 */
export function blitPrint(pc: PixelTarget, x: number, y: number, w: number, h: number, key: PrintKey, later?: () => void): boolean {
  const d = printPixels(key, w, h);
  if (!d) { if (later) whenPrint(key, later); return false; }
  x = Math.round(x); y = Math.round(y);
  const W = d.width, H = d.height, s = d.data;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const px = x + i, py = y + j;
    if (px < 0 || py < 0 || px >= pc.w || py >= pc.h) continue;
    const k = (j * W + i) * 4, o = (py * pc.w + px) * 4;
    pc.data[o] = s[k]; pc.data[o + 1] = s[k + 1]; pc.data[o + 2] = s[k + 2]; pc.data[o + 3] = 255;
  }
  return true;
}

/** draw the print into a 2D canvas (smoothly scaled); false until its sheet is in (later() then runs when it is) */
export function drawPrint(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, key: PrintKey, later?: () => void): boolean {
  const d = printPixels(key, w, h);
  if (!d) { if (later) whenPrint(key, later); return false; }
  ctx.putImageData(d, Math.round(x), Math.round(y));
  return true;
}

/** the print as tight RGBA bytes at w x h (the texture atlas's close-up copies), null until its sheet is in */
export function printRGBA(key: PrintKey, w: number, h: number): Uint8Array | null {
  const d = printPixels(key, w, h);
  return d ? new Uint8Array(d.data.buffer.slice(0)) : null;
}

preloadPrints();
