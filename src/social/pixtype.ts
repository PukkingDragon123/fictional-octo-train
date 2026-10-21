// Typed pixel lettering for floating speech and signs: the 5x7 type
// (src/ui/font5x7.ts) struck in ink, with optional outline, drop shadow and
// bold strike, baked into one sprite sheet per ink (a data URL), plus small
// tileable paper textures (ticker tape, telegram, TV caption band, manila
// tag) and pixel-art music notes. Everything is drawn at 1:1 pixels and
// scaled up crisp (image-rendering: pixelated).
import { glyph5x7 } from '../ui/font5x7';

export interface Ink { ink: number; outline?: number; shadow?: number; bold?: boolean }
export interface Sheet { url: string; cw: number; ch: number; w: number }

/** characters in the sheets, in order (index = position) */
export const CHARS = (() => { let s = ''; for (let c = 32; c < 127; c++) s += String.fromCharCode(c); return s + '…▸•'; })();
const IDX = new Map<string, number>([...CHARS].map((c, i) => [c, i]));
const ALIAS: Record<string, string> = { '—': '-', '–': '-', '’': "'", '‘': "'", '“': '"', '”': '"', '♪': '•', '♫': '•' };
export function glyphIndex(ch: string): number { return IDX.get(ch) ?? IDX.get(ALIAS[ch] ?? '') ?? IDX.get('?')!; }

const sheets = new Map<string, Sheet>();
const hex = (c: number) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];

function canvasUrl(w: number, h: number, draw: (put: (x: number, y: number, c: number, a?: number) => void) => void): string {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  if (!g) return '';
  const img = g.createImageData(w, h);
  const put = (x: number, y: number, c: number, a = 255) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (y * w + x) * 4, [r, gg, b] = hex(c);
    img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = b; img.data[i + 3] = a;
  };
  draw(put);
  g.putImageData(img, 0, 0);
  try { return cv.toDataURL(); } catch { return ''; }
}

/** a sprite sheet of every character in one ink: cell = glyph + 1px margin round it (+1 wider when bold) */
export function sheet(o: Ink): Sheet {
  const key = `${o.ink}|${o.outline ?? -1}|${o.shadow ?? -1}|${o.bold ? 1 : 0}`;
  const hit = sheets.get(key); if (hit) return hit;
  const gw = o.bold ? 6 : 5;
  const cw = gw + 2, chh = 10;
  const n = CHARS.length;
  const url = canvasUrl(cw * n, chh, (put) => {
    [...CHARS].forEach((c, i) => {
      const bits = glyph5x7(c === '•' ? '•' : c);
      const on = (x: number, y: number) => {
        if (y < 0 || y > 6) return false;
        if (x >= 0 && x < 5 && bits[y * 5 + x]) return true;
        return !!o.bold && x - 1 >= 0 && x - 1 < 5 && !!bits[y * 5 + x - 1];
      };
      const ox = i * cw + 1, oy = 1;
      if (o.shadow !== undefined) for (let y = 0; y < 7; y++) for (let x = 0; x < gw; x++) if (on(x, y)) put(ox + x + 1, oy + y + 1, o.shadow);
      if (o.outline !== undefined) for (let y = -1; y <= 7; y++) for (let x = -1; x <= gw; x++) {
        if (on(x, y)) continue;
        if (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1)) put(ox + x, oy + y, o.outline);
      }
      for (let y = 0; y < 7; y++) for (let x = 0; x < gw; x++) if (on(x, y)) put(ox + x, oy + y, o.ink);
    });
  });
  const s: Sheet = { url, cw, ch: chh, w: cw * n };
  sheets.set(key, s);
  return s;
}

const papers = new Map<string, string>();
/** a tileable 8x8 paper: fibres, a few flecks; kind 'tape' adds perforations along the top */
export function paper(c: number, kind: 'plain' | 'tape' | 'band' = 'plain'): string {
  const key = c + kind;
  const hit = papers.get(key); if (hit) return hit;
  const [r, g, b] = hex(c);
  const sh = (k: number) => ((Math.max(0, Math.min(255, r * k)) << 16) | (Math.max(0, Math.min(255, g * k)) << 8) | Math.max(0, Math.min(255, b * k))) >>> 0;
  let h = (c * 2654435761) >>> 0;
  const rnd = () => { h ^= h << 13; h >>>= 0; h ^= h >> 17; h ^= h << 5; h >>>= 0; return h / 4294967296; };
  const url = canvasUrl(8, 8, (put) => {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const n = rnd();
      put(x, y, n < 0.08 ? sh(kind === 'band' ? 1.25 : 0.9) : n > 0.94 ? sh(kind === 'band' ? 0.8 : 1.05) : c);
    }
    if (kind === 'band') for (let x = 0; x < 8; x++) if (x % 2 === 0) put(x, 7, sh(1.4));
  });
  papers.set(key, url);
  return url;
}

let noteUrls: string[] | null = null;
/** two pixel-art music notes (eighth, beamed pair), ink with a cream rim */
export function notes(): string[] {
  if (noteUrls) return noteUrls;
  const A = ['....##..', '....#.#.', '....#..#', '....#...', '....#...', '.####...', '#####...', '.###....'];
  const B = ['..######', '..######', '..#....#', '..#....#', '..#....#', '###..###', '###.####', '.#...##.'];
  const draw = (rows: string[]) => canvasUrl(10, 10, (put) => {
    const on = (x: number, y: number) => y >= 0 && y < 8 && x >= 0 && x < 8 && rows[y][x] === '#';
    for (let y = -1; y <= 8; y++) for (let x = -1; x <= 8; x++) if (!on(x, y) && (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1))) put(x + 1, y + 1, 0xf2e6c4);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (on(x, y)) put(x + 1, y + 1, 0x2a1e14);
  });
  noteUrls = [draw(A), draw(B)];
  return noteUrls;
}

/** pastel paper tint for a survivor (from their id) */
export function tintFor(id: string): number {
  let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const hue = (h % 360) / 360, s = 0.45, l = 0.82;
  const f = (n: number) => { const k = (n + hue * 12) % 12; const a = s * Math.min(l, 1 - l); return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return (Math.round(f(0) * 255) << 16) | (Math.round(f(8) * 255) << 8) | Math.round(f(4) * 255);
}
