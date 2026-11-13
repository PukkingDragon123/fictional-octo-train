// Westgate Station on the Inner Loop (src/world/gen/z_subway.ts): a 1980s metro
// station kept exactly as it was the night the last train ran. Cream and teal
// glazed tile with a mosaic name band, tiled columns, token turnstiles and a
// token booth, wooden slat benches, old maps and adverts, fluorescent tubes,
// track with polished rails, tunnel signals, and the dead train on Track 1
// (seats, grab poles, the ad cards over the windows).
// Texture prefix: su_
import { defObj } from '../../world/objects';
import { defWall } from '../../world/defs';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { makeRamp, mixHex, scaleHex, ph, bayer } from '../../gfx/pixel';
import type { PixelCanvas } from '../../gfx/pixel';
import type { ModelBuilder } from '../../gfx/modelBuilder';
import { Rng } from '../../core/rng';
import { text, textC, textW, rod, scribble } from './b_common';

const T = ['subway', 'su'];
/** the station's name, in tile */
export const SU_STATION = 'WESTGATE';
const WH = 86; // wallpaper height px (2.7 m)
const yAt = (m: number) => Math.round(WH - m * 32);

// ============================================================ palette
const CREAM = 0xe9dfc2, TEAL = 0x2f8a86, TEAL_D = 0x1d5e5c, MAROON = 0x7a2a2e, GROUT = 0xa49c86, NAVY = 0x22314f;

// ============================================================ texture painters
/** glazed subway tiles (8x4 px bricks, running bond) over a region */
function tiles(pc: PixelCanvas, x0: number, y0: number, x1: number, y1: number, base: number, seed: number, glaze = true) {
  const R = makeRamp(base, 5, { spread: 0.16, hueShift: 0.01 });
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const row = Math.floor((y - y0) / 4), ly = (y - y0) % 4;
    const lx = (x + (row & 1 ? 4 : 0)) % 8;
    let c = R[2];
    const tv = ph((x + (row & 1 ? 4 : 0)) >> 3, row, seed);
    if (tv < 0.14) c = R[1]; else if (tv > 0.86) c = R[3];
    if (ly === 0 || lx === 0) c = GROUT;
    else if (glaze && ly === 1 && lx > 1 && lx < 6) c = mixHex(c, 0xffffff, 0.35);
    else if (ly === 3) c = mixHex(c, R[0], 0.35);
    pc.set(x, y, c);
  }
}
/** the station wall: cream tile to the ceiling, a teal dado band with a maroon pinstripe, a teal skirting */
function wallTile(pc: PixelCanvas, rng: Rng, variant: number) {
  tiles(pc, 0, 0, 32, WH, CREAM, 8801 + variant);
  // teal dado band at 1.1 - 1.35 m, pinstripe above
  const b0 = yAt(1.38), b1 = yAt(1.1);
  for (let y = b0; y < b1; y++) for (let x = 0; x < 32; x++) {
    const ly = (y - b0) % 4;
    pc.set(x, y, ly === 0 || x % 8 === 0 ? mixHex(GROUT, TEAL_D, 0.4) : ly === 1 ? mixHex(TEAL, 0xffffff, 0.2) : TEAL);
  }
  for (let x = 0; x < 32; x++) { pc.set(x, b0 - 2, MAROON); pc.set(x, b0 - 3, mixHex(MAROON, CREAM, 0.5)); }
  // the skirting: dark teal quarter-round tiles
  for (let y = WH - 6; y < WH; y++) for (let x = 0; x < 32; x++) pc.set(x, y, (y === WH - 6 ? mixHex(TEAL, 0xffffff, 0.25) : x % 8 === 0 ? TEAL_D : TEAL));
  if (variant === 1) {
    // lower half teal (the platform back walls)
    for (let y = b1; y < WH - 6; y++) for (let x = 0; x < 32; x++) {
      const c = pc.get(x, y);
      if (c !== GROUT) pc.set(x, y, mixHex(TEAL, c, 0.25));
    }
  }
  // decades: chips, a grime line where the ceiling was, grime rising from the floor
  for (let i = 0; i < 5; i++) { const x = rng.int(1, 30), y = rng.int(4, WH - 10); pc.set(x, y, 0x6a6250); pc.blend(x + 1, y, 0x6a6250, 0.5); }
  for (let x = 0; x < 32; x++) { pc.blend(x, 0, 0x403a30, 0.45); pc.blend(x, 1, 0x403a30, 0.25); }
  for (let y = WH - 14; y < WH - 6; y++) for (let x = 0; x < 32; x++) if (bayer(x, y) < (y - (WH - 14)) / 14) pc.blend(x, y, 0x5a5242, 0.18);
}
/** tunnel lining: sooty brick, cable runs, a white sighting stripe */
function wallTunnel(pc: PixelCanvas, rng: Rng) {
  const R = makeRamp(0x6a5446, 5, { spread: 0.22 });
  for (let y = 0; y < WH; y++) for (let x = 0; x < 32; x++) {
    const row = y >> 2, lx = (x + (row & 1 ? 4 : 0)) % 8, ly = y & 3;
    let c = ph((x + (row & 1 ? 4 : 0)) >> 3, row, 8811) < 0.3 ? R[1] : R[2];
    if (ly === 0 || lx === 0) c = R[0];
    pc.set(x, y, c);
    // soot thickening toward the top
    pc.blend(x, y, 0x141210, 0.55 * (1 - y / WH));
  }
  // cable runs at 1.9 m and 2.1 m, brackets
  for (const m of [1.85, 2.05]) { const y = yAt(m); for (let x = 0; x < 32; x++) { pc.set(x, y, 0x1a1816); pc.set(x, y + 1, 0x2e2a26); } }
  for (const x of [6, 22]) for (let y = yAt(2.15); y < yAt(1.8); y++) pc.set(x, y, 0x5a5a58);
  // the painted stripe the drivers sight along
  const sy = yAt(0.95);
  for (let x = 0; x < 32; x++) { pc.set(x, sy, 0xd8d4c4); pc.set(x, sy + 1, 0xb8b4a4); }
  for (let i = 0; i < 4; i++) { const x = rng.int(0, 31), y = rng.int(yAt(0.8), WH - 2); pc.blend(x, y, 0x2a6a8a, 0.25); }
}
/** the dead train, inside: beige laminate under the windows, wood-effect strip, ad-card rail above */
function wallCar(pc: PixelCanvas) {
  const L = makeRamp(0xd6ccb0, 5, { spread: 0.12 });
  for (let y = 0; y < WH; y++) for (let x = 0; x < 32; x++) pc.set(x, y, y < yAt(2.1) ? L[3] : L[2]);
  // the ad-card frames up top
  const a0 = yAt(2.45), a1 = yAt(2.12);
  for (let y = a0; y < a1; y++) for (let x = 0; x < 32; x++) {
    const inFrame = x % 16 > 0 && x % 16 < 15 && y > a0 && y < a1 - 1;
    pc.set(x, y, inFrame ? [0xe0b040, 0x5aa0c8, 0xd86a5a, 0x8ac070][(x >> 4) % 4] : 0x8a8a86);
    if (inFrame && (y - a0) % 3 === 1 && x % 16 > 2 && x % 16 < 13) pc.set(x, y, 0x2a2a2a);
  }
  // wood-effect strip
  for (let y = yAt(1.05); y < yAt(0.95); y++) for (let x = 0; x < 32; x++) pc.set(x, y, mixHex(0x8a5a32, 0x6a4022, ph(x, y >> 1, 8821)));
  // kick panel: brushed steel
  for (let y = yAt(0.32); y < WH; y++) for (let x = 0; x < 32; x++) pc.set(x, y, (x + y) % 5 === 0 ? 0x9a9c9c : 0xb4b6b4);
  // graffiti tag
  for (let i = 0; i < 18; i++) pc.set(5 + Math.floor(Math.sin(i * 0.7) * 3 + i * 0.6), yAt(0.7) + Math.floor(Math.cos(i * 1.3) * 2), 0x3a3a8a);
}
/** staff rooms: green gloss paint over brown tile */
function wallStaff(pc: PixelCanvas) {
  const G = makeRamp(0x8aa88a, 5, { spread: 0.12 });
  for (let y = 0; y < WH; y++) for (let x = 0; x < 32; x++) pc.set(x, y, ph(x >> 2, y >> 2, 8831) < 0.2 ? G[1] : G[2]);
  tiles(pc, 0, yAt(1.2), 32, WH, 0x8a6a4a, 8832);
  for (let x = 0; x < 32; x++) pc.set(x, yAt(1.2), 0x3a2a1a);
}

/** the mosaic name band (96 x 18 px = 3 m x 0.56 m): tesserae, a border, the name in navy */
function mosaic(pc: PixelCanvas, name: string) {
  pc.wrap = false;
  const W = pc.w, H = pc.h;
  const R = makeRamp(0xece2c6, 4, { spread: 0.14 });
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const tx = x >> 1, ty = y >> 1;
    let c = R[1 + Math.floor(ph(tx, ty, 8841) * 2.2)];
    if ((x & 1) && (y & 1)) c = mixHex(c, GROUT, 0.55);
    pc.set(x, y, c);
  }
  // border: maroon outer, teal inner, little corner squares
  for (let x = 0; x < W; x++) for (const y of [0, 1, H - 2, H - 1]) pc.set(x, y, (x >> 1) % 2 ? MAROON : mixHex(MAROON, 0x000000, 0.25));
  for (let y = 0; y < H; y++) for (const x of [0, 1, W - 2, W - 1]) pc.set(x, y, (y >> 1) % 2 ? MAROON : mixHex(MAROON, 0x000000, 0.25));
  for (let x = 2; x < W - 2; x++) { pc.set(x, 2, TEAL); pc.set(x, H - 3, TEAL); }
  for (let y = 2; y < H - 2; y++) { pc.set(2, y, TEAL); pc.set(W - 3, y, TEAL); }
  for (const cx of [6, W - 7]) for (let y = 6; y < H - 6; y++) for (let x = cx - 2; x <= cx + 2; x++) pc.set(x, y, ((x + y) & 1) ? TEAL : TEAL_D);
  // the letters, 2 px tesserae
  const s = 2, w = textW(name, s);
  const x0 = Math.round((W - w) / 2), y0 = Math.round((H - 5 * s) / 2);
  text(pc, name, x0, y0, NAVY, s);
  // the glaze catches the light on some tiles; a few tesserae are missing
  for (let i = 0; i < 40; i++) { const x = Math.floor(ph(i, 1, 8842) * W), y = 3 + Math.floor(ph(i, 2, 8843) * (H - 6)); if (pc.get(x, y) !== NAVY) pc.blend(x, y, 0xffffff, 0.4); }
  for (let i = 0; i < 6; i++) { const x = 4 + Math.floor(ph(i, 3, 8844) * (W - 8)), y = 4 + Math.floor(ph(i, 4, 8845) * (H - 8)); pc.set(x, y, 0x6a6250); }
}

/** old adverts (64 x 44 px = 2 m x 1.4 m), original fictional brands of the time */
const ADS: { bg: number; fg: number; acc: number; lines: string[]; pic: 'can' | 'tape' | 'smile' | 'film' | 'star' | 'missing' | 'phone' | 'burger' }[] = [
  { bg: 0xe86a2a, fg: 0xfff4d8, acc: 0x2a7ac8, lines: ['FIZZ-UP!', 'THE TASTE', 'OF SUMMER'], pic: 'can' },
  { bg: 0x1a1a2a, fg: 0xf0e050, acc: 0xe04080, lines: ['WALKMATE', 'TAKE YOUR', 'MUSIC OUT'], pic: 'tape' },
  { bg: 0x8ad0e8, fg: 0x1a3a6a, acc: 0xffffff, lines: ['DR KALE', 'TOOTH', 'POWDER'], pic: 'smile' },
  { bg: 0xf0d040, fg: 0x8a1a1a, acc: 0x1a1a1a, lines: ['VIDEO VAULT', '2 FOR 1', 'TUESDAYS'], pic: 'film' },
  { bg: 0x2a5a3a, fg: 0xf8f0d8, acc: 0xe0b040, lines: ['MERIDIAN', 'A NEW YOU', 'APPLY NOW'], pic: 'star' },
  { bg: 0xf4f0e4, fg: 0x1a1a1a, acc: 0xc02020, lines: ['MISSING', 'HAVE YOU', 'SEEN ME'], pic: 'missing' },
  { bg: 0x6a2a7a, fg: 0xffe8f8, acc: 0x60e0e0, lines: ['PARTY LINE', 'CALL NOW', '976-0000'], pic: 'phone' },
  { bg: 0xd83a2a, fg: 0xfff0a0, acc: 0x5a2a0a, lines: ['BIG BURGER', 'NOW 99C', 'ON THE LOOP'], pic: 'burger' },
];
function advert(pc: PixelCanvas, i: number) {
  pc.wrap = false;
  const a = ADS[i % ADS.length], W = pc.w, H = pc.h;
  // aluminium frame
  pc.fill(0xb8bab8);
  for (let x = 0; x < W; x++) { pc.set(x, 0, 0xe0e2e0); pc.set(x, H - 1, 0x7a7c7a); }
  for (let y = 0; y < H; y++) { pc.set(0, y, 0xd0d2d0); pc.set(W - 1, y, 0x8a8c8a); }
  const x0 = 2, y0 = 2, w = W - 4, h = H - 4;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) pc.set(x0 + x, y0 + y, a.bg);
  // the picture on the left
  const px = x0 + 3, py = y0 + 4;
  const P = (x: number, y: number, c: number) => pc.set(px + x, py + y, c);
  switch (a.pic) {
    case 'can': for (let y = 0; y < 22; y++) for (let x = 0; x < 12; x++) P(x, y + 4, y < 2 || y > 19 ? 0xc0c0c0 : x < 3 ? scaleHex(a.acc, 0.7) : x > 9 ? scaleHex(a.acc, 0.8) : a.acc); for (let x = 2; x < 10; x++) P(x, 13, a.fg); break;
    case 'tape': for (let y = 0; y < 14; y++) for (let x = 0; x < 20; x++) P(x - 2, y + 8, y < 2 || y > 11 ? 0x3a3a3a : 0xd8d8d0); for (const cx of [3, 13]) for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) if (x * x + y * y < 6) P(cx + x - 2, 15 + y, 0x2a2a2a); break;
    case 'smile': for (let y = -10; y <= 10; y++) for (let x = -10; x <= 10; x++) if (x * x + y * y < 100) P(10 + x - 3, 15 + y, x * x + y * y > 70 ? scaleHex(a.acc, 0.85) : a.acc); for (let x = -5; x <= 5; x++) P(7 + x, 19 + Math.round(x * x / 10), a.fg); P(4, 11, a.fg); P(10, 11, a.fg); break;
    case 'film': for (let y = 0; y < 22; y++) for (let x = 0; x < 14; x++) P(x, y + 4, (x < 2 || x > 11) && y % 3 === 0 ? a.bg : 0x1a1a1a); for (let y = 8; y < 22; y += 5) for (let x = 3; x < 11; x++) P(x, y, 0x8a8a8a); break;
    case 'star': for (let k = 0; k < 5; k++) { const ang = -Math.PI / 2 + k * Math.PI * 2 / 5; for (let r = 0; r < 10; r++) P(8 + Math.round(Math.cos(ang) * r), 15 + Math.round(Math.sin(ang) * r), a.acc); } for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) P(8 + x, 15 + y, a.acc); break;
    case 'missing': for (let y = 0; y < 22; y++) for (let x = 0; x < 16; x++) P(x - 1, y + 3, y > 14 ? 0x6a6a6a : (x - 7) ** 2 / 30 + (y - 7) ** 2 / 42 < 1 ? 0x8a8a8a : 0xd0d0c8); break;
    case 'phone': for (let y = 0; y < 6; y++) for (let x = 0; x < 18; x++) P(x - 2, y + 8, a.acc); for (let y = 0; y < 10; y++) for (let x = 0; x < 4; x++) { P(x - 2, y + 12, a.acc); P(x + 12, y + 12, a.acc); } break;
    case 'burger': for (let y = 0; y < 18; y++) for (let x = 0; x < 18; x++) { const yy = y + 6; const c = y < 6 ? 0xe0a050 : y < 8 ? 0x60c040 : y < 12 ? 0x6a2a10 : y < 14 ? 0xf0d040 : 0xd89040; if (!(y < 3 && (x < 2 || x > 15))) P(x - 2, yy, c); } break;
  }
  // the copy on the right, big
  const tx = x0 + 22;
  a.lines.forEach((l, k) => {
    const sc = k === 0 && textW(l, 1) * 1 < w - 24 ? 1 : 1;
    text(pc, l, tx, y0 + 6 + k * 10, k === 0 ? a.fg : mixHex(a.fg, a.bg, 0.15), sc);
  });
  scribble(pc, tx, y0 + h - 7, w - 26, mixHex(a.fg, a.bg, 0.4), i + 3, 2, 2);
  // the decades: a corner peeled back, a tear, sun-fade, scrawl
  for (let y = 0; y < 6; y++) for (let x = 0; x < 6 - y; x++) pc.set(x0 + w - 1 - x, y0 + y, mixHex(0xe8e4d8, 0x9a9488, x / 6));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (bayer(x, y) < 0.18) pc.blend(x0 + x, y0 + y, 0xffffff, 0.12);
  for (let k = 0; k < 10; k++) pc.set(x0 + 4 + k, y0 + h - 3 - (k % 3), 0x1a1a1a);
}

/** the Inner Loop diagram (64 x 40) */
const MAP_STOPS = ['WESTGATE', 'ALDER LN', 'ELM ST', 'ST ALDRIC', 'INTERCHANGE 0', 'FACILITY 4'];
function lineMap(pc: PixelCanvas) {
  pc.wrap = false;
  const W = pc.w, H = pc.h;
  pc.fill(0xf4f0e2);
  for (let x = 0; x < W; x++) { pc.set(x, 0, 0x1a1a1a); pc.set(x, H - 1, 0x1a1a1a); pc.set(x, 1, NAVY); pc.set(x, 2, NAVY); pc.set(x, 3, NAVY); pc.set(x, 4, NAVY); pc.set(x, 5, NAVY); pc.set(x, 6, NAVY); }
  for (let y = 0; y < H; y++) { pc.set(0, y, 0x1a1a1a); pc.set(W - 1, y, 0x1a1a1a); }
  text(pc, 'INNER LOOP', 3, 2, 0xffffff);
  // the loop: a rounded rectangle, teal
  const L = 8, Rr = W - 10, Tp = 14, B = H - 8;
  for (let x = L; x <= Rr; x++) for (const y of [Tp, Tp + 1, B, B + 1]) pc.set(x, y, TEAL);
  for (let y = Tp; y <= B + 1; y++) for (const x of [L, L + 1, Rr, Rr + 1]) pc.set(x, y, TEAL);
  // the other lines, which stop at the edge of the map
  for (let x = 2; x < W - 2; x++) { const y = 26 + Math.round(Math.sin(x * 0.12) * 3); pc.set(x, y, MAROON); }
  for (let y = 8; y < H - 2; y++) pc.set(30, y, 0xd8a020);
  // stops
  const at: [number, number][] = [[L, 28], [L + 14, Tp], [36, Tp], [Rr, 22], [44, B], [20, B]];
  at.forEach(([x, y], k) => {
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) pc.set(x + i, y + j, k === 0 ? 0xc02020 : 0xffffff);
    pc.set(x, y, k === 0 ? 0xffffff : 0x1a1a1a);
  });
  text(pc, 'YOU ARE', L + 3, 29, 0xc02020); text(pc, 'HERE', L + 3, 35, 0xc02020);
  // fingerprints over YOU ARE HERE, and the rest scribbled out
  for (let y = 26; y < 38; y++) for (let x = L - 2; x < L + 12; x++) if (bayer(x, y) < 0.25) pc.blend(x, y, 0x8a7a5a, 0.35);
  scribble(pc, Rr - 22, Tp + 3, 18, 0x4a4a4a, 9, 2, 2);
  void MAP_STOPS;
}

function boothSign(pc: PixelCanvas) {
  pc.wrap = false;
  pc.fill(0x1a2a3a);
  for (let x = 0; x < pc.w; x++) { pc.set(x, 0, 0xc8a050); pc.set(x, pc.h - 1, 0x8a6a2a); }
  textC(pc, 'TOKENS', pc.w / 2, 3, 0xffe8a0, 2);
}
function signalLens(pc: PixelCanvas, c: number) {
  pc.wrap = false;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const d = Math.hypot(x - 3.5, y - 3.5);
    pc.set(x, y, d < 1.5 ? mixHex(c, 0xffffff, 0.6) : d < 3.2 ? c : scaleHex(c, 0.45));
  }
}
function carSide(pc: PixelCanvas) {
  // fluted stainless steel with the line's teal and orange stripes
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) pc.set(x, y, x % 3 === 0 ? 0x9a9e9e : x % 3 === 1 ? 0xc8cccc : 0xb4b8b8);
  for (let x = 0; x < pc.w; x++) { for (const y of [10, 11]) pc.set(x, y, TEAL); for (const y of [12]) pc.set(x, y, 0xe07a2a); }
}
/** the dead train, outside: fluted stainless, the line's teal and orange stripes, a window band */
function carExt(pc: PixelCanvas) {
  for (let y = 0; y < WH; y++) for (let x = 0; x < 32; x++) pc.set(x, y, x % 3 === 0 ? 0x8e9292 : x % 3 === 1 ? 0xc4c8c8 : 0xacb0b0);
  for (const [m, c] of [[0.95, TEAL], [0.88, 0xe07a2a], [0.84, TEAL]] as const) { const y = yAt(m); for (let x = 0; x < 32; x++) { pc.set(x, y, c); pc.set(x, y + 1, c); } }
  for (let y = yAt(2.45); y < yAt(2.3); y++) for (let x = 0; x < 32; x++) pc.set(x, y, 0x5a5e5e);
  for (let y = WH - 10; y < WH; y++) for (let x = 0; x < 32; x++) pc.blend(x, y, 0x2a2420, 0.35 * ((y - (WH - 10)) / 10));
  for (let i = 0; i < 14; i++) pc.set(4 + Math.floor(Math.sin(i * 0.9) * 2 + i * 1.2), yAt(1.5) + Math.floor(Math.cos(i * 1.7) * 3), i % 2 ? 0xc03a7a : 0x3a3a9a);
}
function vinyl(pc: PixelCanvas) {
  const R = makeRamp(0xc8662a, 5, { spread: 0.2 });
  pc.each((x, y) => pc.set(x, y, y % 4 === 0 ? R[1] : ph(x, y, 8851) < 0.12 ? R[3] : R[2]));
}
function gum(pc: PixelCanvas) {
  pc.wrap = false; pc.clear();
  const rng = new Rng(8861);
  for (let i = 0; i < 26; i++) {
    const cx = rng.int(2, 29), cy = rng.int(2, 29), r = rng.float(0.6, 1.6);
    const c = rng.pick([0x3a3634, 0x4a4440, 0x2e2a28, 0x5a524c, 0x6a5a5a]);
    for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) if (x * x + y * y <= r * r + 0.5) pc.set(cx + x, cy + y, mixHex(c, 0x000000, (x + y) > 0 ? 0.2 : 0), 230);
  }
}
function tactile(pc: PixelCanvas) {
  pc.wrap = false; pc.clear();
  const Y = makeRamp(0xf0c020, 5, { spread: 0.3 });
  for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) pc.set(x, y, ph(x >> 2, y >> 2, 8871) < 0.12 ? Y[1] : Y[2], 245);
  for (let y = 2; y < 16; y += 4) for (let x = 2; x < 32; x += 4) { pc.set(x, y, Y[4]); pc.set(x + 1, y, Y[3]); pc.set(x, y + 1, Y[1]); pc.set(x + 1, y + 1, Y[0]); }
}
function coping(pc: PixelCanvas) {
  pc.wrap = false; pc.clear();
  for (let y = 0; y < 8; y++) for (let x = 0; x < 32; x++) pc.set(x, y, y < 2 ? 0x8a867a : ph(x >> 3, y, 8881) < 0.2 ? 0xc8c4b4 : 0xdedad0, 250);
  for (let x = 0; x < 32; x += 8) for (let y = 0; y < 8; y++) pc.set(x, y, 0x7a766a, 250);
}
function stencilBehind(pc: PixelCanvas) {
  pc.wrap = false; pc.clear();
  textC(pc, 'STAND BEHIND THE YELLOW LINE', pc.w / 2, 1, 0xf2f0e6);
}
function stepNose(pc: PixelCanvas) {
  pc.wrap = false;
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) pc.set(x, y, y < 5 ? (y < 2 ? 0xf0c020 : 0x2a2a28) : ph(x >> 2, y >> 2, 8891) < 0.2 ? 0xa8a49a : 0xbcb8ae);
}

addTextureModule(() => {
  const A = atlas();
  const W = (name: string, fn: (pc: PixelCanvas, rng: Rng) => void) => A.add(name, 32, WH, fn, 1, 2.7);
  W('su_wall_tile', (pc, r) => wallTile(pc, r, 0));
  W('su_wall_tile_b', (pc, r) => wallTile(pc, r, 1));
  W('su_wall_tunnel', wallTunnel);
  W('su_wall_car', (pc) => wallCar(pc));
  W('su_wall_car_ext', (pc) => carExt(pc));
  W('su_wall_staff', (pc) => wallStaff(pc));
  A.add('su_tile', 32, 32, (pc) => tiles(pc, 0, 0, 32, 32, CREAM, 8802));
  A.add('su_tile_teal', 32, 32, (pc) => tiles(pc, 0, 0, 32, 32, TEAL, 8803));
  A.add('su_mosaic', 96, 18, (pc) => mosaic(pc, SU_STATION));
  ADS.forEach((_, i) => A.add('su_ad_' + i, 64, 44, (pc) => advert(pc, i)));
  A.add('su_map', 64, 40, lineMap);
  A.add('su_booth_sign', 64, 14, boothSign);
  A.add('su_lens_red', 8, 8, (pc) => signalLens(pc, 0xe02818));
  A.add('su_lens_green', 8, 8, (pc) => signalLens(pc, 0x30e070));
  A.add('su_lens_amber', 8, 8, (pc) => signalLens(pc, 0xf0a020));
  A.add('su_car_side', 32, 32, carSide);
  A.add('su_vinyl', 16, 16, vinyl);
  A.add('su_gum', 32, 32, gum);
  A.add('su_tactile', 32, 16, tactile);
  A.add('su_coping', 32, 8, coping);
  A.add('su_behind', 128, 7, stencilBehind);
  A.add('su_step', 32, 32, stepNose);
});

// ============================================================ walls
defWall({ key: 'su_trackside', name: 'Tunnel Wall', tex: 'su_wall_tunnel', top: 'wall_top_concrete', height: 3.8, hp: 3000, sound: 'concrete' });
defWall({ key: 'su_car', name: 'Train Car Side', tex: 'su_wall_car_ext', top: 'metal_grey', height: 2.5, thick: 0.1, hp: 900, sound: 'metal' });

// ============================================================ track, signals, tunnel
defObj({
  key: 'su_track', name: 'Track', height: 0.2, block: 'none', movable: 0, sound: 'metal', hp: 99999, noShadow: true,
  desc: 'Two rails on sleepers in black ballast, polished bright on top. The live rail is boarded over. Something has kept the top of the rails shining.',
  tags: [...T, 'rail', 'fixed'],
  variant: (s) => String((s.v ?? 0) % 4),
  model: (mb, s) => {
    const v = (s.v ?? 0) % 4;
    // laid on the centre row of a track bed: ballast and sleepers spill over the rows either side
    mb.box(0, 0, 0, 1.0, 0.05, 2.7, 'gravel', { color: 0x5a5650, bevel: false });
    for (let k = 0; k < 2; k++) mb.box(-0.25 + k * 0.5, 0.05, 0, 0.22, 0.07, 2.5, 'wood_crate', { color: 0x4a3e34, bevel: false });
    for (const z of [-0.72, 0.72]) {
      mb.box(0, 0.12, z, 1.0, 0.08, 0.07, 'metal_rusty', { color: 0x7a5a4a, bevel: false });
      mb.box(0, 0.2, z, 1.0, 0.014, 0.05, 'chrome', { color: 0xe8e8e8, bevel: false });
    }
    // the boarded third rail
    mb.box(0, 0.06, 1.1, 1.0, 0.12, 0.1, 'wood_dark', { color: 0x5a4a30, bevel: false });
    if (v === 1) { mb.box(0.15, 0.06, 0.1, 0.18, 0.02, 0.12, 'paper', { color: 0xd8d0b8 }); mb.box(-0.3, 0.06, -0.15, 0.06, 0.12, 0.06, 'metal_sheet', { color: 0xc04030 }); }
    if (v === 2) { mb.cylinder(0.2, 0.06, -0.1, 0.035, 0.12, 6, 'plastic_white', { color: 0x40a060 }); }
    if (v === 3) { mb.box(-0.1, 0.06, 0.15, 0.3, 0.01, 0.2, 'paper', { color: 0xe8e4d8 }); }
  },
});

defObj({
  key: 'su_buffer', name: 'Buffer Stop', w: 1, d: 1, height: 1.1, block: 'solid', movable: 0, sound: 'metal', hp: 2000,
  desc: 'The end of Track 1, red and white, with a lamp that has gone out. The beam is dented from the tunnel side.',
  tags: [...T, 'rail', 'fixed'],
  model: (mb) => {
    mb.box(0, 0, 0, 0.9, 0.12, 0.9, 'concrete');
    for (const z of [-0.3, 0.3]) { mb.box(0, 0.12, z, 0.14, 0.7, 0.14, 'metal_sheet', { color: 0xb02020 }); }
    mb.box(0.12, 0.6, 0, 0.18, 0.26, 0.98, 'metal_sheet', { color: 0xd8d8d0 });
    for (let k = 0; k < 4; k++) mb.box(0.22, 0.62 + (k % 2) * 0.12, -0.36 + k * 0.24, 0.02, 0.1, 0.2, 'metal_sheet', { color: 0xc02020 });
    mb.cylinderX(0.3, 0.7, -0.3, 0.09, 0.16, 8, 'metal_dark'); mb.cylinderX(0.3, 0.7, 0.3, 0.09, 0.16, 8, 'metal_dark');
    mb.box(0, 0.86, 0, 0.12, 0.2, 0.12, 'su_lens_red', { emissive: 0.4 });
  },
});

defObj({
  key: 'su_signal', name: 'Tunnel Signal', height: 2.4, block: 'none', onWall: true, movable: 0, sound: 'metal', hp: 800,
  power: true,
  light: { color: 0xff3020, intensity: 0.55, radius: 3.2, y: 1.95, kind: 'emergency', power: true, flicker: 0 },
  desc: 'A three-aspect tunnel signal in a black hood. It is always on red. Nothing has ever waited for it.',
  tags: [...T, 'signal', 'rail'],
  variant: (s) => String(s.g ? 1 : 0),
  model: (mb, s) => {
    const g = !!s.g, z = -0.36;
    mb.box(0, 1.5, z, 0.3, 0.86, 0.14, 'metal_dark', { color: 0x2a2a2a });
    const lens = [g ? 'su_lens_green' : 'su_lens_red', 'su_lens_amber', g ? 'su_lens_red' : 'su_lens_green'];
    [2.1, 1.85, 1.6].forEach((y, k) => {
      const on = k === 0;
      mb.cylinderZ(0, y, z + 0.08, 0.075, 0.03, 10, lens[k], { caps: true, emissive: on ? 1.6 : 0.05, color: on ? 0xffffff : 0x606060 });
      mb.box(0, y + 0.07, z + 0.12, 0.18, 0.02, 0.1, 'metal_dark', { color: 0x1a1a1a }); // hood
    });
    mb.box(0, 1.3, z, 0.12, 0.2, 0.1, 'metal_rusty');
    mb.box(0, 1.36, z + 0.06, 0.2, 0.1, 0.01, 'plastic_white', { color: 0xf0f0e8 }); // signal plate
  },
});

defObj({
  key: 'su_tube', name: 'Fluorescent Tube', height: 0, block: 'none', ceiling: true,
  light: { color: 0xf4f2e4, intensity: 0.72, radius: 6.2, y: 2.6, kind: 'fluoro' },
  hum: 'fluoro', tags: [...T, 'light', 'ceiling'],
  desc: 'A bare twin-tube batten on chains. One end of one tube has gone grey.',
  variant: (s) => String(s.r ? 1 : 0),
  model: (mb, s) => {
    mb.push(); if (s.r) mb.rotateY(Math.PI / 2);
    mb.box(0, 2.58, 0, 1.24, 0.06, 0.14, 'metal_painted_green', { color: 0xd8dccc });
    for (const z of [-0.035, 0.035]) mb.cylinderX(0, 2.555, z, 0.018, 1.18, 6, 'plastic_white', { emissive: 1.2, color: 0xfffff4 });
    for (const x of [-0.5, 0.5]) mb.box(x, 2.64, 0, 0.01, 0.12, 0.01, 'metal_dark');
    mb.pop();
  },
});

defObj({
  key: 'su_column', name: 'Tiled Column', height: 2.7, block: 'solid', tall: true, movable: 0, sound: 'ceramic', hp: 4000,
  desc: 'A steel column cased in cream tile, teal band at shoulder height, the name in a little enamel plate. Chewing gum on all four sides at exactly the height of a bored hand.',
  tags: [...T, 'column', 'fixed'],
  model: (mb) => {
    mb.box(0, 0, 0, 0.62, 0.16, 0.62, 'su_tile_teal');
    mb.box(0, 0.16, 0, 0.56, 2.38, 0.56, 'su_tile');
    mb.box(0, 1.1, 0, 0.58, 0.26, 0.58, 'su_tile_teal');
    mb.box(0, 2.54, 0, 0.66, 0.16, 0.66, 'su_tile_teal');
    for (const [x, z, ry] of [[0, 0.285, 0], [0.285, 0, Math.PI / 2]] as const) {
      mb.push().translate(x, 1.6, z).rotateY(ry);
      mb.box(0, 0, 0, 0.44, 0.12, 0.012, { south: 'su_booth_sign', all: 'metal_dark' }, { fit: { south: true } });
      mb.pop();
    }
    for (let k = 0; k < 7; k++) mb.box(-0.2 + ((k * 37) % 40) / 100, 0.9 + ((k * 13) % 30) / 100, 0.282, 0.025, 0.02, 0.006, 'plastic_white', { color: [0xd8a0b0, 0x8ac0d0, 0xe0e0d0][k % 3] });
  },
});

defObj({
  key: 'su_name_band', name: 'Mosaic Name Band', w: 3, height: 1.9, block: 'none', onWall: true, movable: 0, sound: 'ceramic', hp: 99999,
  desc: `${SU_STATION}, in little tiles, set into the wall in 1926 and re-grouted in 1987. Somebody has prised out the T.`,
  tags: [...T, 'sign', 'wall'],
  model: (mb) => {
    mb.box(0, 1.55, -0.43, 2.96, 0.56, 0.02, { south: 'su_mosaic', all: 'su_tile' }, { fit: { south: true }, bevel: false });
  },
});

defObj({
  key: 'su_advert', name: 'Advertisement', w: 2, height: 2.0, block: 'none', onWall: true, movable: 0, sound: 'paper', hp: 60,
  desc: 'An advert in an aluminium frame. The prices are from a decade nobody here remembers living through.',
  tags: [...T, 'poster', 'wall'],
  variant: (s) => String((s.v ?? 0) % ADS.length),
  model: (mb, s) => {
    mb.box(0, 0.62, -0.43, 1.96, 1.36, 0.03, { south: 'su_ad_' + ((s.v ?? 0) % ADS.length), all: 'metal_brushed' }, { fit: { south: true }, bevel: false });
  },
});

defObj({
  key: 'su_map', name: 'Line Map', w: 2, height: 2.0, block: 'none', onWall: true, movable: 0, sound: 'paper', hp: 60,
  lore: 'su_map',
  desc: 'The Inner Loop, in teal: six stations on a ring. YOU ARE HERE is worn to a smudge by fingers. The other lines stop at the edge of the map.',
  tags: [...T, 'map', 'wall'],
  model: (mb) => {
    mb.box(0, 0.8, -0.42, 1.6, 1.0, 0.04, { south: 'su_map', all: 'metal_dark' }, { fit: { south: true }, bevel: false });
    mb.box(0, 0.76, -0.4, 1.66, 0.04, 0.08, 'metal_dark');
  },
});

defObj({
  key: 'su_speaker', name: 'PA Horn', height: 2.5, block: 'none', onWall: true, movable: 0, sound: 'metal', hp: 200,
  desc: 'A grey horn speaker on a bracket. Every few minutes it clears its throat.',
  tags: [...T, 'wall'],
  model: (mb) => {
    mb.box(0, 2.3, -0.42, 0.08, 0.16, 0.06, 'metal_grey');
    mb.push().translate(0, 2.28, -0.3).rotateX(0.35);
    mb.cylinder(0, -0.1, 0, 0.05, 0.24, 8, 'metal_grey', { rTop: 0.13, color: 0xa0a4a0 });
    mb.pop();
  },
});

// ============================================================ the ticket hall
defObj({
  key: 'su_turnstile', name: 'Token Turnstile', height: 1.05, block: 'low', movable: 0, sound: 'metal', hp: 600,
  disassemble: { tools: ['#wrench', '#screwdriver'], time: 30, skill: 'mechanics', yields: [['scrap_metal', 3, 6], ['screws', 2, 6], ['brass_token', 0, 2]] },
  desc: 'A steel turnstile with a brass token slot and three arms. DEPOSIT TOKEN. The arms are warm.',
  tags: [...T, 'gate', 'turnstile'],
  model: (mb) => {
    // the cabinet on the north side of the tile, arms reaching across
    mb.box(0, 0, -0.34, 0.86, 0.94, 0.26, 'metal_brushed', { color: 0xc8ccc8 });
    mb.box(0, 0.94, -0.34, 0.9, 0.05, 0.3, 'metal_dark');
    mb.box(0.24, 0.99, -0.34, 0.12, 0.03, 0.08, 'metal_brass'); // token slot
    mb.box(0.24, 1.0, -0.34, 0.06, 0.012, 0.012, 'plastic_black');
    mb.box(-0.26, 0.86, -0.205, 0.12, 0.06, 0.01, 'led_green', { emissive: 1.3 });
    mb.box(0, 0.7, -0.205, 0.5, 0.12, 0.01, 'plastic_white', { color: 0xe8e4d4 });
    // the tripod hub and three arms
    mb.cylinderZ(0, 0.82, -0.18, 0.06, 0.08, 8, 'chrome');
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + 0.3;
      mb.push().translate(0, 0.82, -0.16).rotateZ(a).rotateX(-0.75);
      mb.cylinder(0, 0, 0, 0.022, 0.5, 6, 'chrome'); mb.pop();
    }
    // the far post
    mb.box(0, 0, 0.42, 0.86, 0.9, 0.08, 'metal_brushed', { color: 0xb8bcb8 });
  },
});

defObj({
  key: 'su_token_booth', name: 'Token Booth', w: 3, d: 3, height: 2.6, block: 'solid', tall: true, movable: 0, sound: 'metal', hp: 2500,
  power: true,
  light: { color: 0xffe2b0, intensity: 0.7, radius: 4.2, y: 2.0, kind: 'lamp', power: true, flicker: 0.03 },
  desc: 'A token booth of brown steel and scratched bulletproof glass, brass trays under the windows, TOKENS lit up on top. Something in there is very big and very soft and it has pressed itself flat against the glass to look at you.',
  tags: [...T, 'booth', 'kiosk', 'tokens'],
  model: (mb) => {
    const W = 2.9, D = 2.9, h0 = 0.1;
    mb.box(0, 0, 0, W, h0, D, 'concrete', { color: 0x9a9a92 });
    // a lower band of brown steel all round, glass above on the front and sides
    mb.box(0, h0, -D / 2 + 0.07, W, 2.35, 0.14, 'metal_sheet', { color: 0x6a4a32 });
    for (const sx of [-1, 1]) { mb.box(sx * (W / 2 - 0.07), h0, 0, 0.14, 1.0, D, 'metal_sheet', { color: 0x6a4a32 }); mb.box(sx * (W / 2 - 0.05), h0 + 1.0, 0.25, 0.04, 1.2, D - 0.6, 'glass', { color: 0xb8d0d4 }); }
    mb.box(0, h0, D / 2 - 0.07, W, 1.0, 0.14, 'metal_sheet', { color: 0x6a4a32 });
    mb.box(0, h0 + 1.0, D / 2 - 0.05, W - 0.2, 1.2, 0.04, 'glass', { color: 0xb8d0d4 });
    for (const x of [-0.98, 0, 0.98]) mb.box(x, h0 + 1.0, D / 2 - 0.05, 0.06, 1.2, 0.07, 'metal_dark');
    // brass trays and speaking grilles
    for (const x of [-0.5, 0.5]) {
      mb.box(x, h0 + 0.95, D / 2 + 0.05, 0.42, 0.05, 0.22, 'metal_brass');
      mb.box(x, h0 + 0.99, D / 2 + 0.14, 0.42, 0.04, 0.03, 'metal_brass');
      mb.cylinderZ(x, h0 + 1.45, D / 2 - 0.02, 0.07, 0.02, 10, 'metal_grey', { caps: true });
    }
    // the roof, the sign
    mb.box(0, 2.3, 0, W + 0.08, 0.1, D + 0.08, 'metal_dark');
    mb.box(0, 2.4, D / 2 - 0.1, 2.0, 0.34, 0.12, { south: 'su_booth_sign', all: 'metal_dark' }, { fit: { south: true }, emissive: 0.7 });
    mb.box(1.45, 2.4, 0.2, 0.12, 0.34, 1.6, { east: 'su_booth_sign', all: 'metal_dark' }, { fit: { east: true }, emissive: 0.7 });
    // inside: token racks, the stool, a calendar from 1989, slime on the glass
    mb.box(-1.0, h0, -0.9, 0.7, 0.9, 0.5, 'metal_grey', { color: 0x7a7a72 });
    for (let k = 0; k < 4; k++) mb.cylinder(-1.2 + k * 0.14, h0 + 0.9, -0.9, 0.05, 0.12, 6, 'metal_brass');
    mb.cylinder(0.9, h0, -0.6, 0.18, 0.6, 8, 'plastic_black');
    mb.box(1.0, h0 + 1.3, -1.36, 0.4, 0.5, 0.01, 'paper', { color: 0xe8e0c8 });
    mb.box(0.2, h0 + 1.1, D / 2 - 0.08, 1.2, 0.9, 0.006, 'glass', { color: 0xd8e0b8 });
  },
});

defObj({
  key: 'su_bench', name: 'Platform Bench', w: 2, height: 0.86, block: 'low', sit: true, movable: 0, sound: 'wood', hp: 260, flammable: 0.5,
  disassemble: { tools: ['#wrench'], time: 16, skill: 'carpentry', yields: [['plank', 2, 4], ['scrap_metal', 1, 3], ['screws', 2, 6]] },
  desc: 'Varnished wooden slats on cast-iron ends with the old company crest. Initials carved into every slat. Gum underneath, in geological layers.',
  tags: [...T, 'sit', 'bench'],
  model: (mb) => {
    for (const x of [-0.82, 0.82]) {
      mb.box(x, 0, 0, 0.08, 0.44, 0.5, 'metal_dark', { color: 0x2a3a34 });
      mb.box(x, 0.44, -0.18, 0.08, 0.4, 0.08, 'metal_dark', { color: 0x2a3a34 });
      mb.box(x, 0.58, 0.12, 0.07, 0.04, 0.34, 'metal_dark', { color: 0x2a3a34 });
    }
    for (let k = 0; k < 4; k++) mb.box(0, 0.42, -0.16 + k * 0.105, 1.8, 0.035, 0.085, 'wood_dark', { color: 0xa06a3a });
    for (let k = 0; k < 3; k++) mb.box(0, 0.56 + k * 0.1, -0.22 - k * 0.012, 1.8, 0.075, 0.03, 'wood_dark', { color: 0xa06a3a });
    mb.box(0.3, 0.456, 0.05, 0.25, 0.012, 0.18, 'paper', { color: 0xd8d4c4 });
  },
});

defObj({
  key: 'su_car_seat', name: 'Train Seat', w: 2, height: 0.9, block: 'low', sit: true, movable: 0, sound: 'fabric', hp: 200, flammable: 0.6,
  disassemble: { tools: ['#screwdriver'], time: 12, yields: [['scrap_metal', 1, 2], ['fabric', 1, 3], ['screws', 2, 4]] },
  desc: 'A moulded bench seat in orange vinyl, worn through to the foam in two places. A newspaper from the night of the last train is still on it.',
  tags: [...T, 'sit', 'seat'],
  model: (mb) => {
    mb.box(0, 0, -0.06, 1.9, 0.38, 0.4, 'metal_brushed', { color: 0x9a9c9a });
    mb.box(0, 0.38, -0.02, 1.92, 0.08, 0.5, 'su_vinyl');
    mb.box(0, 0.46, -0.3, 1.92, 0.44, 0.08, 'su_vinyl');
    for (const x of [-0.97, 0.97]) mb.box(x, 0.38, -0.05, 0.05, 0.3, 0.52, 'chrome');
    mb.box(-0.5, 0.465, 0.05, 0.3, 0.012, 0.22, 'paper', { color: 0xdcd8c8 });
    mb.box(0.4, 0.465, 0.02, 0.12, 0.02, 0.12, 'fabric_grey', { color: 0x5a3a2a });
  },
});

defObj({
  key: 'su_grab_pole', name: 'Grab Pole', height: 2.6, block: 'none', movable: 0, sound: 'metal', hp: 600,
  desc: 'A chrome pole, floor to ceiling. Every hand that ever held it held it at the same height: the chrome is dull there.',
  tags: [...T, 'pole'],
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.022, 2.6, 8, 'chrome');
    mb.cylinder(0, 0, 0, 0.06, 0.03, 8, 'metal_dark');
    mb.cylinder(0, 1.2, 0, 0.024, 0.5, 8, 'metal_grey', { color: 0xa0a0a0 });
  },
});

defObj({
  key: 'su_car_end', name: 'Car End Panel', height: 2.4, block: 'none', onWall: true, movable: 0, sound: 'metal', hp: 400,
  desc: 'The end of the car: a number plate, CAR 3, an emergency handle behind cracked plastic, and the fire extinguisher bracket, empty.',
  tags: [...T, 'wall'],
  model: (mb) => {
    mb.box(0, 2.0, -0.42, 0.5, 0.18, 0.02, 'plastic_white', { color: 0xf0f0e8 });
    mb.box(0.32, 1.2, -0.42, 0.16, 0.24, 0.04, 'plastic_red');
    mb.box(-0.3, 0.9, -0.42, 0.12, 0.3, 0.06, 'metal_dark');
  },
});

// ============================================================ the step nosings on the mezzanine stairs
defObj({
  key: 'su_step', name: 'Stair Nosing', height: 0.02, block: 'none', movable: 0, sound: 'metal', hp: 99999, noShadow: true,
  desc: 'A worn step with a yellow anti-slip edge. Ten thousand commuters a day, for sixty years.',
  tags: [...T, 'stairs'],
  model: (mb) => { mb.box(0, 0, 0.42, 1.0, 0.02, 0.16, 'su_step', { fit: true, bevel: false, skip: ['bottom'] }); },
});

// ============================================================ the way down, at the Depot
defObj({
  key: 'su_metro_sign', name: 'Metro Sign', height: 2.8, block: 'low', movable: 0, sound: 'metal', hp: 600,
  desc: 'A lit roundel on a post: the Inner Loop, teal on cream, and an arrow down. TRAINS EVERY FEW MINUTES.',
  tags: [...T, 'sign'],
  power: true,
  light: { color: 0xd8f0e8, intensity: 0.45, radius: 3, y: 2.4, kind: 'lamp', power: true },
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.05, 2.2, 8, 'metal_dark', { color: 0x2a3a34 });
    mb.cylinder(0, 0, 0, 0.14, 0.06, 8, 'concrete');
    mb.cylinderZ(0, 2.42, 0, 0.36, 0.08, 18, 'su_tile_teal', { caps: true, emissive: 0.5 });
    mb.cylinderZ(0, 2.42, 0, 0.26, 0.1, 18, 'su_tile', { caps: true, emissive: 0.8 });
    mb.box(0, 2.36, 0.06, 0.62, 0.12, 0.02, 'metal_sheet', { color: NAVY, emissive: 0.3 });
    mb.box(0, 2.36, -0.06, 0.62, 0.12, 0.02, 'metal_sheet', { color: NAVY, emissive: 0.3 });
  },
});

void rod; void Rng; void mixHex; void carSide;
