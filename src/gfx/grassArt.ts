// Pixel-art grass sprites for the instanced grass field (src/gfx/grass.ts).
//
// Every tuft is painted procedurally as screen-space pixel art: the sheet is
// repainted for the current zoom so one texel lands on exactly one low-res
// pixel (D texels per metre across, D·cos(pitch) up an upright card, D·sin(pitch)
// along the ground for flat patches). Blades are 1 px lines with a curved lean,
// dark roots, a mid ramp and warm sunlit tips; there are dry straw blades, seed
// heads, clover trefoils, daisies, buttercups, violets and bare-earth patches.
//
// The sheet stores PALETTE INDICES, not colours (r = index * 8 + 4): the shader
// looks the colour up per biome (meadow / fields / lawn) and can shift a pixel a
// whole palette step (gust crests, lush patches, trampled grass) so the shading
// stays crisp pixel art instead of a smooth tint.
import { Rng } from '../core/rng';

/** sheet layout: 8 x 8 cells, each CELL_W x CELL_H metres (upright cards: world height) */
export const COLS = 8, ROWS = 8;
export const CELL_W = 0.56, CELL_H = 0.72;

// palette slots (per biome row, 32 entries)
// 0..5 grass ramp (root shadow .. sunlit tip), 6..8 straw, 9..11 clover, 12 white petal, 13 yellow petal,
// 14 purple petal, 15 flower centre, 16..18 bare earth, 19 pebble, 20 pebble shadow, 21 pink petal,
// 22 purple shade, 23 white petal shade, 24..26 flattened grass (trodden blades lying down show their pale side)
export const PAL_N = 32;

export type Kind = 'tuft' | 'tall' | 'short' | 'clover' | 'flowerW' | 'flowerY' | 'flowerP' | 'straw' | 'flat';

interface Blade { x: number; h: number; lean: number; curve: number; straw: boolean; back: boolean; thick: number; head: boolean }
interface Bloom { x: number; h: number; lean: number; type: 'W' | 'Y' | 'P' | 'K' | 'C' }
interface Leaf { x: number; y: number; flower: boolean }
interface Pebble { u: number; v: number; big: boolean }

export interface Variant {
  i: number;
  kind: Kind;
  /** content box: width and (upright) height in metres; flat patches: width and ground depth */
  w: number; h: number;
  /** how far the wind and bodies bend it (straw and flowers are stiffer) */
  stiff: number;
  blades: Blade[]; blooms: Bloom[]; leaves: Leaf[]; pebbles: Pebble[];
  seed: number;
}

export const VARIANTS: Variant[] = [];
export const BY_KIND: Record<Kind, number[]> = { tuft: [], tall: [], short: [], clover: [], flowerW: [], flowerY: [], flowerP: [], straw: [], flat: [] };

function blades(r: Rng, n: number, spread: number, h0: number, h1: number, o: { straw?: number; heads?: number; lean?: number } = {}): Blade[] {
  const out: Blade[] = [];
  for (let k = 0; k < n; k++) {
    const x = (r.next() - 0.5) * spread * (0.4 + 0.6 * r.next());
    const h = h0 + (h1 - h0) * Math.pow(r.next(), 0.8);
    // blades fan out from the middle of the clump: outer ones lean outward
    const lean = (x / Math.max(0.01, spread)) * h * 0.9 + (r.next() - 0.5) * h * (o.lean ?? 0.55);
    out.push({ x, h, lean, curve: 1.3 + r.next() * 1.1, straw: r.next() < (o.straw ?? 0), back: r.next() < 0.45, thick: r.next() < 0.4 ? (r.next() < 0.5 ? -1 : 1) : 0, head: r.next() < (o.heads ?? 0) });
  }
  // back blades first, the tallest of each layer behind the shorter ones
  out.sort((a, b) => (a.back === b.back ? b.h - a.h : a.back ? -1 : 1));
  return out;
}

function add(kind: Kind, w: number, h: number, stiff: number, fill: (r: Rng, v: Variant) => void) {
  const i = VARIANTS.length;
  const v: Variant = { i, kind, w, h, stiff, blades: [], blooms: [], leaves: [], pebbles: [], seed: 7919 * (i + 3) };
  fill(new Rng(v.seed), v);
  VARIANTS.push(v);
  BY_KIND[kind].push(i);
}

// ---------------------------------------------------------------- the variant specs (zoom independent)
for (let k = 0; k < 12; k++) add('tuft', 0.4, 0.34, 1, (r, v) => { v.blades = blades(r, 6 + r.int(0, 4), 0.26, 0.11, 0.2 + r.next() * 0.12, { straw: 0.04 }); });
for (let k = 0; k < 8; k++) add('tall', 0.5, 0.66, 0.9, (r, v) => {
  v.blades = blades(r, 9 + r.int(0, 5), 0.34, 0.2, 0.42 + r.next() * 0.2, { straw: 0.1, heads: k < 4 ? 0.3 : 0.06, lean: 0.7 });
});
for (let k = 0; k < 8; k++) add('short', 0.36, 0.14, 0.7, (r, v) => { v.blades = blades(r, 5 + r.int(0, 4), 0.3, 0.035, 0.08 + r.next() * 0.04, { straw: 0.06, lean: 0.8 }); });
for (let k = 0; k < 6; k++) add('clover', 0.4, 0.16, 0.55, (r, v) => {
  const n = 3 + r.int(0, 3);
  for (let j = 0; j < n; j++) v.leaves.push({ x: (r.next() - 0.5) * 0.28, y: 0.015 + r.next() * 0.08, flower: j === 0 && k % 2 === 0 });
  v.leaves.sort((a, b) => b.y - a.y);
  v.blades = blades(r, 2 + r.int(0, 2), 0.3, 0.06, 0.14, { lean: 0.7 });
});
const bloomVariant = (kind: Kind, type: (k: number) => Bloom['type']) => (k: number) => add(kind, 0.4, 0.4, 0.6, (r, v) => {
  v.blades = blades(r, 3 + r.int(0, 3), 0.28, 0.08, 0.18, { lean: 0.6 });
  const n = 1 + (r.next() < 0.45 ? 1 : 0) + (r.next() < 0.2 ? 1 : 0);
  for (let j = 0; j < n; j++) v.blooms.push({ x: (r.next() - 0.5) * 0.24, h: 0.12 + r.next() * 0.2, lean: (r.next() - 0.5) * 0.06, type: type(k) });
});
for (let k = 0; k < 4; k++) bloomVariant('flowerW', () => 'W')(k);
for (let k = 0; k < 4; k++) bloomVariant('flowerY', () => 'Y')(k);
for (let k = 0; k < 4; k++) bloomVariant('flowerP', (q) => (q % 2 ? 'K' : 'P'))(k);
for (let k = 0; k < 6; k++) add('straw', 0.42, 0.44, 0.8, (r, v) => { v.blades = blades(r, 6 + r.int(0, 4), 0.3, 0.12, 0.26 + r.next() * 0.12, { straw: 0.6, heads: 0.25, lean: 0.9 }); });
for (let k = 0; k < 6; k++) add('flat', 0.54, 0.5, 0, (r, v) => {
  const n = 2 + r.int(0, 3);
  for (let j = 0; j < n; j++) v.pebbles.push({ u: 0.2 + r.next() * 0.6, v: 0.2 + r.next() * 0.6, big: r.next() < 0.35 });
});

// ---------------------------------------------------------------- biome palettes (sRGB)
// rows: 0 the Meadow (too green, pastel), 1 the Fields (a soft summer afternoon), 2 lawns and verges
const P = (grass: number[], straw: number[], clover: number[], petals: number[], earth: number[], extra: number[]) => [...grass, ...straw, ...clover, ...petals, ...earth, ...extra];
export const PALETTES: number[][] = [
  P([0x1c8a4c, 0x2ea65a, 0x44c26a, 0x60de7e, 0x96f090, 0xd8fca8], [0x9ab868, 0xc8d888, 0xeef6b8], [0x1f7a5e, 0x32a074, 0x5cc492],
    [0xfdfbf4, 0xffe45e, 0xb89cf2, 0xf4b83a], [0x958a72, 0xaca28a, 0xc4bca4, 0xece6da, 0x786e5a], [0xf8b4d4, 0x8a6cd2, 0xd6d2e6, 0x4e9a6c, 0x74ba86, 0x9cd4a0, 0, 0]),
  P([0x2a7448, 0x3a9058, 0x52aa68, 0x6cc482, 0xa0da8e, 0xe0eca0], [0xa48e50, 0xd0b86c, 0xf2e0a2], [0x2c6c50, 0x428c62, 0x6aae7e],
    [0xfcfaf0, 0xf8d040, 0xa88ae2, 0xf0a634], [0x6c6248, 0x857a5c, 0x9e9474, 0xcac2ac, 0x4e4738], [0xf2a4c2, 0x7658b6, 0xd8d6cc, 0x688a54, 0x8eaa6c, 0xb6c48e, 0, 0]),
  P([0x2a4c26, 0x3a6432, 0x4e7c3e, 0x62944a, 0x8cb45c, 0xc4d478], [0x8e7e44, 0xb4a260, 0xd8ca8c], [0x2a5638, 0x3e744a, 0x5e9460],
    [0xf6f4e8, 0xf0cc3c, 0x9a7ad0, 0xe8a82e], [0x5c5240, 0x766a52, 0x908468, 0xb8b09c, 0x423a2e], [0xeaa0be, 0x7056a8, 0xd2d2c6, 0x5e7a4a, 0x84a064, 0xaec08a, 0, 0]),
];

/** palette as an RGBA8 image (PAL_N x rows) */
export function paletteData(): Uint8Array {
  const out = new Uint8Array(PAL_N * PALETTES.length * 4);
  PALETTES.forEach((row, y) => row.forEach((c, x) => { const o = (y * PAL_N + x) * 4; out[o] = (c >> 16) & 255; out[o + 1] = (c >> 8) & 255; out[o + 2] = c & 255; out[o + 3] = 255; }));
  return out;
}

// ---------------------------------------------------------------- painting the sheet at a pixel density
export interface Sheet {
  data: Uint8Array; w: number; h: number; cw: number; ch: number; D: number; Dv: number; Df: number;
  /** per variant, the painted pixels' box in metres: left, right (from the root), height (upright) or depth (flat) */
  box: [number, number, number][];
}

/** hash 0..1 */
const hf = (x: number, y: number, s: number) => { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 2147483647)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

/**
 * Paint every variant into one sheet. D: low-res pixels per metre across the screen; cosP / sinP: the
 * camera pitch (an upright card's metre is D·cosP pixels tall on screen, a metre of ground D·sinP).
 */
export function paintSheet(D: number, cosP: number, sinP: number): Sheet {
  const Dv = D * cosP, Df = D * sinP;
  const cw = Math.ceil(CELL_W * D) + 2, ch = Math.ceil(CELL_H * Dv) + 2;
  const w = cw * COLS, h = ch * ROWS;
  const data = new Uint8Array(w * h * 4);
  const fat = D >= 100 ? 2 : 1;
  const box: [number, number, number][] = [];
  for (const v of VARIANTS) {
    const col = v.i % COLS, row = Math.floor(v.i / COLS);
    const x0 = col * cw, y0 = row * ch;
    // put(x, y, index) in cell pixels (y down from the cell top)
    const put = (x: number, y: number, idx: number) => {
      if (x < 0 || y < 0 || x >= cw || y >= ch) return;
      const o = ((y0 + y) * w + x0 + x) * 4;
      data[o] = Math.max(0, Math.min(31, idx)) * 8 + 4; data[o + 1] = 0; data[o + 2] = 0; data[o + 3] = 255;
    };
    const has = (x: number, y: number) => x >= 0 && y >= 0 && x < cw && y < ch && data[((y0 + y) * w + x0 + x) * 4 + 3] > 0;
    // the card is cut to what was painted (most of a cell is empty: the quads stay small)
    const fit = () => {
      let x0b = cw, x1b = -1, y0b = ch, y1b = -1;
      for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) if (has(x, y)) { x0b = Math.min(x0b, x); x1b = Math.max(x1b, x); y0b = Math.min(y0b, y); y1b = Math.max(y1b, y); }
      if (x1b < 0) { box.push([-0.01, 0.01, 0.01]); return; }
      const c = cw / 2;
      box.push([(x0b - c) / D, (x1b + 1 - c) / D, v.kind === 'flat' ? (y1b + 1) / Df : (ch - y0b) / Dv]);
    };
    if (v.kind === 'flat') { paintFlat(v, put, cw, D, Df); fit(); continue; }
    const cx = Math.floor(cw / 2), bottom = ch - 1;
    // ---- blades
    for (const b of v.blades) {
      const H = Math.max(2, Math.round(b.h * Dv));
      const xr = cx + Math.round(b.x * D);
      let px = xr;
      for (let j = 0; j < H; j++) {
        const t = H > 1 ? j / (H - 1) : 1;
        const xi = Math.round(xr + b.lean * D * Math.pow(t, b.curve));
        let idx: number;
        if (b.straw) idx = t < 0.3 ? 6 : t < 0.78 ? 7 : 8;
        else {
          idx = t < 0.16 ? 1 : t < 0.4 ? 2 : t < 0.66 ? 3 : t < 0.88 ? 4 : 5;
          if (H <= 4) idx = Math.min(5, idx + 1);
          if (b.back) idx = Math.max(1, idx - 1);
        }
        const y = bottom - j;
        const a = Math.min(px, xi), c = Math.max(px, xi);
        for (let x = a; x <= c; x++) for (let f = 0; f < fat; f++) put(x + f, y, idx);
        // a two-pixel base on the stouter blades, the far side a step darker
        if (b.thick && t < 0.38) put(xi + b.thick * fat, y, b.straw ? 6 : Math.max(0, idx - 1));
        px = xi;
      }
      if (b.head) {
        // a seed head: alternating spikelets up the top of the stem
        const tx = Math.round(xr + b.lean * D), ty = bottom - H + 1;
        const n = Math.max(2, Math.round(0.06 * Dv));
        for (let j = 0; j < n; j++) { put(tx + (j % 2 ? 1 : -1), ty + j + 1, j % 2 ? 7 : 8); put(tx, ty - 1, 8); }
      }
    }
    // ---- clover: trefoils on short stems, now and then a white clover head
    for (const l of v.leaves) {
      const lx = cx + Math.round(l.x * D), ly = bottom - Math.round(l.y * Dv) - 1;
      for (let y = ly + 1; y <= bottom; y++) put(lx, y, 9);
      if (l.flower) {
        const r = Math.max(1, Math.round(0.022 * D));
        for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + 0.5) put(lx + x, ly - r + y, y > 0 || x > 0 ? 23 : 12);
        continue;
      }
      const s = Math.max(1, Math.round(0.02 * D));
      const leaf = (ox: number, oy: number) => {
        for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) put(lx + ox + x, ly + oy + y, y === 0 && x === 0 ? 11 : y === s - 1 ? 9 : 10);
        if (s === 1) put(lx + ox, ly + oy, oy < 0 ? 11 : 10);
      };
      leaf(-s, 0); leaf(1, 0); leaf(Math.floor((1 - s) / 2), -s);
      put(lx, ly, 9);
    }
    // ---- flowers on thin stems
    for (const f of v.blooms) {
      const H = Math.max(3, Math.round(f.h * Dv));
      const xr = cx + Math.round(f.x * D);
      let tx = xr;
      for (let j = 0; j < H; j++) { const t = j / (H - 1); tx = Math.round(xr + f.lean * D * t * t); put(tx, bottom - j, t < 0.3 ? 1 : t < 0.7 ? 2 : 3); }
      const ty = bottom - H;
      const big = D >= 56;
      if (f.type === 'W' || f.type === 'C') {
        // daisy: white petals round a golden eye
        if (big) {
          for (const [x, y] of [[0, -1], [-1, 0], [1, 0], [0, 1], [-1, -1], [1, -1]]) put(tx + x, ty + y, 12);
          put(tx - 2, ty, 12); put(tx + 2, ty, 12); put(tx - 1, ty + 1, 23); put(tx + 1, ty + 1, 23); put(tx, ty, 15);
        } else { put(tx - 1, ty, 12); put(tx + 1, ty, 12); put(tx, ty - 1, 12); put(tx, ty, 15); }
      } else if (f.type === 'Y') {
        // buttercup: a little golden cup, lit on top
        put(tx, ty, 13); put(tx + 1, ty, 13); put(tx, ty - 1, 13); put(tx + 1, ty - 1, 12 + 1);
        if (big) { put(tx - 1, ty - 1, 13); put(tx + 2, ty - 1, 13); put(tx, ty - 2, 13); put(tx + 1, ty - 2, 13); put(tx, ty - 1, 15); }
      } else {
        // violets (purple) and campion (pink): a small nodding spike
        const pc = f.type === 'P' ? 14 : 21, sh = f.type === 'P' ? 22 : 22;
        put(tx, ty, pc); put(tx + 1, ty, sh); put(tx, ty - 1, pc); put(tx - 1, ty, pc);
        if (big) { put(tx, ty - 2, pc); put(tx + 1, ty - 1, sh); put(tx - 1, ty + 1, sh); }
      }
    }
    // ---- dark roots: the base of every clump sits in its own shade
    let minX = cw, maxX = -1;
    for (let x = 0; x < cw; x++) if (has(x, bottom)) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); }
    if (maxX >= 0) {
      for (let x = minX; x <= maxX; x++) {
        if (has(x, bottom)) put(x, bottom, hf(x, v.i, 37) < 0.4 ? 0 : 1);
        else if (hf(x, v.i, 31) < 0.2) put(x, bottom, 1);
      }
    }
    fit();
  }
  return { data, w, h, cw, ch, D, Dv, Df, box };
}

/** a flat patch of bare earth: ragged edge, grains, pebbles with a lit top and a shadow (painted foreshortened) */
function paintFlat(v: Variant, put: (x: number, y: number, i: number) => void, cw: number, D: number, Df: number) {
  const W = Math.min(cw - 2, Math.round(v.w * D)), H = Math.max(3, Math.round(v.h * Df));
  const ox = Math.floor((cw - W) / 2);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = (x + 0.5) / W - 0.5, q = (y + 0.5) / H - 0.5;
    // a lumpy blob: the radius wobbles with the angle and a coarse hash
    const a = Math.atan2(q, u);
    const rr = 0.42 + 0.06 * Math.sin(a * 3 + v.seed) + 0.04 * Math.sin(a * 5 + v.seed * 0.7) + (hf(Math.floor(a * 4), v.i, 51) - 0.5) * 0.06;
    const d = Math.hypot(u, q) / rr;
    if (d > 1) continue;
    const n = hf(x, y, v.seed);
    if (d > 0.82) {
      // the rim: earth breaking up into short grass
      if (n < 0.45) continue;
      put(ox + x, y, n < 0.75 ? 16 : 2);
      continue;
    }
    // far rim in the shade of the turf, grains of lighter soil
    let idx = q < -0.28 && d > 0.6 ? 16 : n < 0.12 ? 16 : n > 0.9 ? 18 : 17;
    if (d < 0.5 && n > 0.8) idx = 18;
    put(ox + x, y, idx);
  }
  for (const p of v.pebbles) {
    const x = ox + Math.round(p.u * W), y = Math.round(p.v * H);
    put(x, y, 19); put(x, y + 1, 20);
    if (p.big && D >= 40) { put(x + 1, y, 19); put(x + 1, y + 1, 20); put(x, y - 1, 19); }
  }
}
