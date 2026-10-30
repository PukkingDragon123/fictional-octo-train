// Bitmap text in the user's font, Alagard (Hewett Tsoi): rasterised once at its native 16px
// grid and thresholded to hard 1-bit glyphs, then drawn whole-pixel with an 8-way ink outline
// (and an optional drop shadow) and scaled up by whole numbers only.
//
//   body  Alagard 16px x1   (running text, speech, labels)
//   title Alagard 16px x2   (names, headings, big words)
//   small Alagard 16px x1   (tags, counters; the face has no smaller crisp size)
//
//   await bitReady()                                fonts loaded and glyphs ready
//   bitText(ctx, 'HELLO', x, y, { font, color, outline, shadow, scale, align, maxW })
//   bitCanvas('HELLO', { ... })                     a cached canvas at scale 1 (draw it with smoothing off)
//   bitMeasure('HELLO', 'body')                     width in font pixels
// CSS text uses the same faces through the tokens in src/ui/fonts.css (--font-new / --font-title / --font-small).
export type BitFontId = 'body' | 'title' | 'small';
export interface BitOpts {
  font?: BitFontId;
  color?: string;
  /** 8-way outline colour (null = none) */
  outline?: string | null;
  /** 1px drop shadow down-right (null = none) */
  shadow?: string | null;
  /** whole-number scale */
  scale?: number;
  align?: 'left' | 'center' | 'right';
  /** wrap at this width (font pixels) */
  maxW?: number;
  /** line height in font pixels (default: ascent + descent - 2) */
  lh?: number;
}

const FACES: Record<BitFontId, { family: string; size: number; asc: number; desc: number; x: number }> = {
  body: { family: "'Alagard'", size: 16, asc: 13, desc: 4, x: 1 },
  title: { family: "'Alagard'", size: 16, asc: 13, desc: 4, x: 2 },
  small: { family: "'Alagard'", size: 16, asc: 13, desc: 4, x: 1 },
};
export const INK = '#0a0b10';

interface Glyph { adv: number; w: number; h: number; a: Uint8Array }
const glyphs: Record<BitFontId, Map<string, Glyph>> = { body: new Map(), title: new Map(), small: new Map() };
let ready = false;
let readyP: Promise<void> | null = null;

/** load the three faces (once); glyphs are cut lazily after this */
export function bitReady(): Promise<void> {
  if (readyP) return readyP;
  const fs = typeof document !== 'undefined' ? (document as Document & { fonts?: FontFaceSet }).fonts : undefined;
  readyP = (fs?.load
    ? Promise.all(Object.values(FACES).map((f) => fs.load(`${f.size}px ${f.family}`).catch(() => null))).then(() => undefined)
    : Promise.resolve()).then(() => { ready = true; for (const k of Object.keys(glyphs) as BitFontId[]) glyphs[k].clear(); cache.clear(); });
  return readyP;
}
export function bitIsReady(): boolean { return ready; }

let gcv: HTMLCanvasElement | null = null, gctx: CanvasRenderingContext2D | null = null;
function cut(font: BitFontId, ch: string): Glyph {
  const hit = glyphs[font].get(ch);
  if (hit) return hit;
  const F = FACES[font];
  if (!gcv) { gcv = document.createElement('canvas'); gcv.width = 96; gcv.height = 64; gctx = gcv.getContext('2d', { willReadFrequently: true }); }
  const c = gctx!;
  c.clearRect(0, 0, 96, 64);
  c.font = `${F.size}px ${F.family}`;
  c.textBaseline = 'alphabetic';
  c.fillStyle = '#fff';
  const base = 4 + F.asc;
  c.fillText(ch, 8, base);
  const adv = Math.max(1, Math.round(c.measureText(ch).width));
  const h = F.asc + F.desc;
  const w = adv + 8;
  const d = c.getImageData(4, 4, w, h).data;
  const a = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) a[i] = d[i * 4 + 3] > 110 ? 1 : 0;
  const g = { adv, w, h, a };
  if (ready) glyphs[font].set(ch, g);
  return g;
}

/** width of a line in font pixels */
export function bitMeasure(str: string, font: BitFontId = 'body'): number {
  let w = 0;
  for (const ch of String(str)) w += cut(font, ch).adv;
  return w;
}

function wrap(str: string, font: BitFontId, maxW: number): string[] {
  const out: string[] = [];
  for (const para of String(str).split('\n')) {
    let cur = '';
    for (const word of para.split(' ')) {
      const next = cur ? cur + ' ' + word : word;
      if (cur && bitMeasure(next, font) > maxW) { out.push(cur); cur = word; } else cur = next;
    }
    out.push(cur);
  }
  return out;
}

/** draw text at (x, y) = top-left of the line box (or its centre/right edge with align) */
export function bitText(ctx: CanvasRenderingContext2D, str: string, x: number, y: number, o: BitOpts = {}): number {
  const font = o.font || 'body', F = FACES[font], sc = Math.max(1, Math.round(o.scale || 1)) * F.x;
  if (o.maxW) {
    const lines = wrap(str, font, o.maxW), lh = (o.lh ?? F.asc + F.desc - 2) * sc;
    let w = 0;
    lines.forEach((ln, i) => { w = Math.max(w, bitText(ctx, ln, x, y + i * lh, { ...o, maxW: 0 })); });
    return w;
  }
  const s = String(str);
  const W = bitMeasure(s, font) * sc;
  const x0 = Math.round(o.align === 'center' ? x - W / 2 : o.align === 'right' ? x - W : x);
  const y0 = Math.round(y);
  const passes: [string, [number, number][]][] = [];
  if (o.outline !== null && o.outline !== undefined) passes.push([o.outline, [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]]);
  if (o.shadow) passes.push([o.shadow, [[1, 1]]]);
  passes.push([o.color || '#f2ede0', [[0, 0]]]);
  for (const [col, offs] of passes) {
    ctx.fillStyle = col;
    let px = x0;
    for (const ch of s) {
      const g = cut(font, ch);
      for (let r = 0; r < g.h; r++) for (let c = 0; c < g.w; c++) {
        if (!g.a[r * g.w + c]) continue;
        for (const [dx, dy] of offs) ctx.fillRect(px + (c - 4 + dx) * sc, y0 + (r + dy) * sc, sc, sc);
      }
      px += g.adv * sc;
    }
  }
  return W;
}

const cache = new Map<string, HTMLCanvasElement>();
/** a cached canvas with the text drawn at scale 1 (plus a 2px margin for the outline); upscale it with smoothing off */
export function bitCanvas(str: string, o: BitOpts = {}): HTMLCanvasElement {
  const key = JSON.stringify([str, o.font, o.color, o.outline, o.shadow, o.maxW, o.lh]);
  const hit = cache.get(key);
  if (hit) return hit;
  const font = o.font || 'body', F = FACES[font];
  const lines = o.maxW ? wrap(str, font, o.maxW) : String(str).split('\n');
  const k = F.x;
  const lh = (o.lh ?? F.asc + F.desc - 2) * k;
  const w = Math.max(1, ...lines.map((l) => bitMeasure(l, font))) * k + 4;
  const h = lh * (lines.length - 1) + (F.asc + F.desc) * k + 4;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d')!;
  const ax = o.align === 'center' ? w / 2 : o.align === 'right' ? w - 2 : 2;
  lines.forEach((ln, i) => bitText(ctx, ln, ax, 2 + i * lh, { ...o, scale: 1, maxW: 0, lh: undefined }));
  if (ready) { if (cache.size > 400) cache.clear(); cache.set(key, cv); }
  return cv;
}
