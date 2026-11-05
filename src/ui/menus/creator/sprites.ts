// Crisp pixel-art bits for the creator's lab interface, drawn once in code
// and shown at whole multiples with nearest filtering: arrow chevrons, a
// pointer, key caps, a section tick. Every sprite has a black one-pixel ink
// outline and a 1px highlight; no boxes, no circles.
import { PixelCanvas, mixHex } from '../../../gfx/pixel';

const K = 0x0a0b10;
const cache = new Map<string, string>();
const url = (pc: PixelCanvas) => {
  const cv = document.createElement('canvas');
  cv.width = pc.w; cv.height = pc.h;
  cv.getContext('2d')!.putImageData(pc.toImageData(), 0, 0);
  return cv.toDataURL();
};
const memo = (k: string, f: () => PixelCanvas) => { let u = cache.get(k); if (!u) { u = url(f()); cache.set(k, u); } return u; };
/** paint rows of chars: '#' ink, 'a' light, 'b' mid, 'c' dark, 'h' highlight */
function rows(r: string[], pal: Record<string, number>): PixelCanvas {
  const pc = new PixelCanvas(r[0].length, r.length);
  pc.wrap = false;
  r.forEach((row, y) => [...row].forEach((ch, x) => { const c = ch === '#' ? K : pal[ch]; if (c !== undefined) pc.set(x, y, c); }));
  return pc;
}
const AMBER = { h: 0xfff2c0, a: 0xffd070, b: 0xf09a20, c: 0xa85a10 };
const STEEL = { h: 0xf4f0e4, a: 0xd8d2c0, b: 0x9a948a, c: 0x5a564e };
const GREEN = { h: 0xe0ffe8, a: 0x9affb0, b: 0x3ad060, c: 0x1a7a30 };
const RED = { h: 0xffd0c0, a: 0xff7a5a, b: 0xd83a20, c: 0x7a1408 };
const PALS: Record<string, Record<string, number>> = { amber: AMBER, steel: STEEL, green: GREEN, red: RED };

/** a chevron arrow: dir 'l' | 'r' | 'u' | 'd' */
export function chevron(dir: 'l' | 'r' | 'u' | 'd', tone: 'amber' | 'steel' | 'green' | 'red' = 'amber'): string {
  return memo(`chev|${dir}|${tone}`, () => {
    const R = [
      '##.......',
      '#h#......',
      '#ab#.....',
      '.#ab#....',
      '..#ab#...',
      '...#ab#..',
      '....#ab#.',
      '.....#bc#',
      '....#bc#.',
      '...#bc#..',
      '..#bc#...',
      '.#bc#....',
      '#bc#.....',
      '#c#......',
      '##.......',
    ];
    let pc = rows(R, PALS[tone]);
    if (dir === 'l') pc = flipX(pc);
    if (dir === 'u' || dir === 'd') pc = rot(pc, dir === 'd');
    return pc;
  });
}
/** a small solid pointer (a filled triangle) */
export function pointer(tone: 'amber' | 'green' | 'red' = 'amber'): string {
  return memo(`ptr|${tone}`, () => rows(['#....', '##...', '#h#..', '#ab#.', '#abb#', '#bc#.', '#c#..', '##...', '#....'], PALS[tone]));
}
/** a pending mark: a little faceted diamond */
export function diamond(tone: 'amber' | 'green' | 'red' = 'amber'): string {
  return memo(`dia|${tone}`, () => rows(['...#...', '..#h#..', '.#hab#.', '#habbc#', '.#bbc#.', '..#c#..', '...#...'], PALS[tone]));
}
/** a key cap with a glyph drawn in pixels (Space, Enter, arrows): w = width in px */
export function keycap(glyph: 'space' | 'enter' | 'l' | 'r' | 'u' | 'd' | 'esc', tone: 'steel' | 'amber' = 'steel'): string {
  return memo(`key|${glyph}|${tone}`, () => {
    const w = glyph === 'space' ? 23 : glyph === 'enter' || glyph === 'esc' ? 15 : 11, h = 11;
    const pc = new PixelCanvas(w, h);
    pc.wrap = false;
    const P = PALS[tone];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      const corner = (x === 0 || x === w - 1) && (y === 0 || y === h - 1);
      if (corner) continue;
      pc.set(x, y, edge ? K : y === h - 2 || y === h - 3 ? P.c : x === 1 || y === 1 ? P.h : P.a);
    }
    const ink = mixHex(P.c, K, 0.5);
    const g = (pts: [number, number][]) => pts.forEach(([x, y]) => pc.set(x, y, ink));
    const cx = Math.floor(w / 2);
    if (glyph === 'space') g([[5, 5], [5, 6], [6, 6], [7, 6], [8, 6], [9, 6], [10, 6], [11, 6], [12, 6], [13, 6], [14, 6], [15, 6], [16, 6], [17, 6], [17, 5]]);
    if (glyph === 'enter') g([[10, 3], [10, 4], [10, 5], [10, 6], [9, 6], [8, 6], [7, 6], [6, 6], [5, 6], [6, 5], [6, 7], [7, 4], [7, 8]]);
    if (glyph === 'esc') g([[4, 3], [5, 3], [6, 3], [4, 4], [4, 5], [5, 5], [4, 6], [4, 7], [5, 7], [6, 7], [8, 3], [9, 3], [10, 3], [8, 4], [8, 5], [9, 5], [10, 5], [10, 6], [8, 7], [9, 7], [10, 7]]);
    const arrow: Record<string, [number, number][]> = {
      r: [[3, 5], [4, 5], [5, 5], [6, 5], [7, 5], [6, 4], [6, 6], [5, 3], [5, 7]],
      l: [[3, 5], [4, 5], [5, 5], [6, 5], [7, 5], [4, 4], [4, 6], [5, 3], [5, 7]],
      u: [[cx, 3], [cx, 4], [cx, 5], [cx, 6], [cx, 7], [cx - 1, 4], [cx + 1, 4], [cx - 2, 5], [cx + 2, 5]],
      d: [[cx, 3], [cx, 4], [cx, 5], [cx, 6], [cx, 7], [cx - 1, 6], [cx + 1, 6], [cx - 2, 5], [cx + 2, 5]],
    };
    if (arrow[glyph]) g(arrow[glyph]);
    return pc;
  });
}

function flipX(pc: PixelCanvas): PixelCanvas {
  const o = new PixelCanvas(pc.w, pc.h); o.wrap = false;
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) { const a = pc.alpha(x, y); if (a) o.set(pc.w - 1 - x, y, pc.get(x, y), a); }
  return o;
}
function rot(pc: PixelCanvas, down: boolean): PixelCanvas {
  const o = new PixelCanvas(pc.h, pc.w); o.wrap = false;
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) {
    const a = pc.alpha(x, y); if (!a) continue;
    // right-pointing -> down: (x, y) -> (h-1-y, x); -> up: (y, w-1-x)
    if (down) o.set(pc.h - 1 - y, x, pc.get(x, y), a); else o.set(y, pc.w - 1 - x, pc.get(x, y), a);
  }
  return o;
}
