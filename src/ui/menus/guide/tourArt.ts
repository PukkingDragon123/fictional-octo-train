// THE TUTORIAL'S PIXEL ART (round 18): every piece of the guided tour and the first-run key hints is a drawn
// object, never a flat block of colour: the brass corner pieces that close on a station (a glint runs round
// them), the key caps (a sculpted cap on a dark well, the legend stamped in the pixel font, a lit frame and a
// pressed frame), the progress pips (little lamps), the arrows of the loop diagram. Drawn once into sprite
// sheets (data URLs), shown at whole multiples with image-rendering: pixelated.
import { PixelCanvas } from '../../../gfx/pixel';
import { glyph5x7 } from '../../font5x7';

const mul = (c: number, f: number) => ((Math.min(255, ((c >> 16) & 255) * f) << 16) | (Math.min(255, ((c >> 8) & 255) * f) << 8) | Math.min(255, (c & 255) * f)) >>> 0;
const url = (pc: PixelCanvas) => { const cv = document.createElement('canvas'); cv.width = pc.w; cv.height = pc.h; cv.getContext('2d')!.putImageData(pc.toImageData(), 0, 0); return cv.toDataURL(); };
const cache = new Map<string, string>();
const memo = (k: string, f: () => string) => { let u = cache.get(k); if (!u) { u = f(); cache.set(k, u); } return u; };

// ---------------------------------------------------------------- the bracket corner (top-left; the others are turned)
export const CORNER = 14, CORNER_F = 8;
/** a brass L with a dark lip, a rivet and a glint that runs along it: CORNER_F frames stacked */
export function cornerSheet(): string {
  return memo('corner', () => {
    const pc = new PixelCanvas(CORNER, CORNER * CORNER_F);
    pc.wrap = false;
    const B = [0x5a3a10, 0x9a6a1c, 0xd8a030, 0xffd060, 0xfff4c8];
    const path: [number, number][] = [];
    for (let i = CORNER - 2; i >= 1; i--) path.push([1, i]);
    for (let i = 2; i <= CORNER - 2; i++) path.push([i, 1]);
    for (let f = 0; f < CORNER_F; f++) {
      const o = f * CORNER;
      const L = (x: number, y: number) => (x <= 4 && y <= CORNER - 2) || (y <= 4 && x <= CORNER - 2);
      for (let y = 0; y < CORNER; y++) for (let x = 0; x < CORNER; x++) {
        if (!L(x, y)) continue;
        const edge = !L(x - 1, y) || !L(x, y - 1) || !L(x + 1, y) || !L(x, y + 1);
        const c = edge ? (x === 0 || y === 0 ? B[3] : B[0]) : x <= 1 || y <= 1 ? B[3] : x >= 4 && y >= 4 ? B[1] : B[2];
        pc.set(x, o + y, c);
      }
      // the inner shadow and a rivet in the corner
      pc.set(2, o + 2, B[4]); pc.set(3, o + 3, B[1]); pc.set(2, o + 3, B[2]);
      // the glint: three pixels walking along the L
      const k = Math.floor((f / CORNER_F) * path.length);
      for (let j = -1; j <= 1; j++) { const p = path[(k + j + path.length) % path.length]; pc.set(p[0], o + p[1], j === 0 ? 0xffffff : B[4]); }
    }
    return url(pc);
  });
}

// ---------------------------------------------------------------- a key cap
export type CapGlyph = string | 'skip' | 'ok' | 'next';
const CAP_H = 15;
/** the cap's width for a legend */
function capW(g: CapGlyph) { return g === 'skip' || g === 'ok' || g === 'next' ? 17 : Math.max(15, g.length * 6 + 7); }
/**
 * a key cap (rest, lit, pressed frames stacked): a dark well, the sculpted cap (a light top face, darker sides, a
 * shine on the near edge), the legend in the pixel font or a drawn glyph (skip ⏭, ok ✓, next ›)
 */
export function capSheet(g: CapGlyph): { url: string; w: number; h: number } {
  const w = capW(g), h = CAP_H;
  const u = memo('cap|' + g, () => {
    const pc = new PixelCanvas(w, h * 3);
    pc.wrap = false;
    for (let f = 0; f < 3; f++) {
      const o = f * h, hot = f === 1, down = f === 2 ? 1 : 0;
      const T = hot ? [0x6a5a30, 0xb89a50, 0xe8d090, 0xfff4d0] : [0x3a3424, 0x6e6450, 0xb8ac88, 0xe8e0c8];
      // the well
      for (let y = 1; y < h; y++) for (let x = 0; x < w; x++) if (!((x === 0 || x === w - 1) && (y === 1 || y === h - 1))) pc.set(x, o + y, 0x0b0a07);
      // the cap: sides, then the top face
      const top = 1 + down, bot = h - 3 + down;
      for (let y = top; y <= bot + 1; y++) for (let x = 1; x < w - 1; x++) {
        const side = y > bot - 1 || x === 1 || x === w - 2;
        pc.set(x, o + y, side ? (y > bot - 1 ? T[0] : T[1]) : T[2]);
      }
      for (let x = 2; x < w - 2; x++) pc.set(x, o + top, T[3]);
      pc.set(2, o + top + 1, T[3]);
      if (down) for (let x = 2; x < w - 2; x++) pc.set(x, o + top + 1, mul(T[2], 0.92));
      // the legend
      const ink = hot ? 0x3a2408 : 0x2a2418;
      const gx = 3, gy = top + 2;
      if (g === 'skip' || g === 'next') {
        const tri = (x0: number) => { for (let i = 0; i < 4; i++) for (let j = -i; j <= i; j++) pc.set(x0 + (3 - i), o + gy + 3 + j, ink); };
        tri(gx + 2); if (g === 'skip') { tri(gx + 6); for (let y = -3; y <= 3; y++) pc.set(gx + 11, o + gy + 3 + y, ink); }
      } else if (g === 'ok') {
        const pts = [[0, 3], [1, 4], [2, 5], [3, 4], [4, 3], [5, 2], [6, 1], [7, 0]];
        for (const [x, y] of pts) { pc.set(gx + 2 + x, o + gy + 1 + y, ink); pc.set(gx + 2 + x, o + gy + 2 + y, ink); }
      } else {
        [...g].forEach((ch, i) => {
          const b = glyph5x7(ch);
          for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) if (b[y * 5 + x]) pc.set(gx + 1 + i * 6 + x, o + gy - 1 + y, ink);
        });
      }
    }
    return url(pc);
  });
  return { url: u, w, h };
}
/** a key cap element: `scale` CSS px per art px; it lights under the pointer and sinks while pressed */
export function capEl(g: CapGlyph, scale = 2, cls = 'tcap'): HTMLElement {
  const { url: u, w, h } = capSheet(g);
  const e = document.createElement('i');
  e.className = cls;
  Object.assign(e.style, { display: 'inline-block', width: w * scale + 'px', height: h * scale + 'px', backgroundImage: `url(${u})`, backgroundSize: `${w * scale}px ${h * 3 * scale}px`, imageRendering: 'pixelated', backgroundRepeat: 'no-repeat' });
  e.style.setProperty('--ch', h * scale + 'px');
  return e;
}

// ---------------------------------------------------------------- a progress pip (a little lamp: off, past, now)
export function pipSheet(): string {
  return memo('pip', () => {
    const pc = new PixelCanvas(7, 21);
    pc.wrap = false;
    const C = [[0x2a2418, 0x3a3224, 0x4a4030], [0x8a5a14, 0xc88a24, 0xe8b050], [0xd88a10, 0xffc040, 0xfff0c0]];
    C.forEach((c, f) => {
      const o = f * 7;
      for (let y = 1; y < 6; y++) for (let x = 1; x < 6; x++) pc.set(x, o + y, (x + y) < 5 ? c[2] : x + y > 7 ? c[0] : c[1]);
      for (let i = 1; i < 6; i++) { pc.set(i, o, 0x0b0a07); pc.set(i, o + 6, 0x0b0a07); pc.set(0, o + i, 0x0b0a07); pc.set(6, o + i, 0x0b0a07); }
      if (f === 2) pc.set(2, o + 2, 0xffffff);
    });
    return url(pc);
  });
}

// ---------------------------------------------------------------- an arrow of the loop diagram (a brass chevron)
export function arrowSheet(): string {
  return memo('arrow', () => {
    const pc = new PixelCanvas(12, 11);
    pc.wrap = false;
    for (let i = 0; i < 6; i++) for (let t = 0; t < 3; t++) { pc.set(2 + i + t, i, t === 0 ? 0xffe090 : 0xd8a030); pc.set(2 + i + t, 10 - i, t === 2 ? 0x8a5a14 : 0xd8a030); }
    for (let x = 0; x < 6; x++) { pc.set(x, 5, 0xc89028); }
    // a dark outline below
    for (let i = 0; i < 6; i++) pc.set(5 + i, 10 - i + 0, 0x5a3a10);
    return url(pc);
  });
}
