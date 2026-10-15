// Pixel-art UI kit, drawn pixel by pixel at start-up with the same
// PixelCanvas tools as the world textures and handed to the stylesheet as CSS
// custom properties (data: URLs). Everything is authored at 1 art pixel and
// shown at an integer scale (--px CSS pixels per art pixel) with
// image-rendering: pixelated, so frames, keys and icons stay crisp.
//
// 9-slice images are used with border-image; the slice numbers below are the
// contract with style.css (border-image-slice in art pixels, border widths in
// calc(N * var(--px))).
//
//   name            size    slice (t r b l)   use
//   housing         48x48   8                 riveted metal frame (.mf, .k-panel)
//   screen          32x32   10                recessed CRT glass bezel (.crt)
//   plate           16x12   4                 sunk stencil plate (.mf-plate)
//   hl / hl-danger  12x10   3                 phosphor highlight bar (menu lines)
//   hl-line         12x10   3                 outlined bar (primary lines)
//   key*            14x16   4 4 6 4           keycaps (.t-key, .k-btn)
//   seg*            8x8     3                 segmented selector cells
//   tab-on          10x10   3 3 1 3           tab cursor
//   bar             6x6     2                 recessed meter frame
//   brackets        16x16   6                 viewfinder corners
//   tip             16x16   5                 tooltip readout
//   menu            20x20   6                 context menu housing
//   strip*          8x8     2                 header strip with notched ends
//   slot*           10x10   3                 item icon cell
//   tabkey*         12x12   4                 inventory folder keys
//   paper           24x24   0 10 0 10         tractor-feed printout
//   toast           20x20   6                 toast plate
import { PixelCanvas, mixHex, scaleHex, bayer, bayer8, ph } from '../gfx/pixel';
import { tileFbm, Rng } from '../core/rng';

// ------------------------------------------------------------------ palettes
export interface PkTheme { ph: number; hi: number; mid: number; dim: number; dark: number; scr: number; scr2: number; warn: number; danger: number; good: number }
export const THEMES: Record<string, PkTheme> = {
  green: { ph: 0x6dff8e, hi: 0xd6ffdc, mid: 0x3fcf68, dim: 0x24803f, dark: 0x0c3a1c, scr: 0x020d05, scr2: 0x061a0d, warn: 0xffd04a, danger: 0xff5f45, good: 0x8dffb0 },
  amber: { ph: 0xffb43c, hi: 0xffe7b8, mid: 0xe38c1f, dim: 0x8c5612, dark: 0x3a2206, scr: 0x0d0702, scr2: 0x1a0e03, warn: 0xfff07a, danger: 0xff5f45, good: 0xffe7b8 },
};
/** olive gunmetal, dark to light */
export const MET = [0x0b0c0a, 0x171915, 0x22251f, 0x2e322a, 0x3b4036, 0x4a5044, 0x5b6253, 0x6f7766, 0x899180, 0xa9b09d, 0xcdd2c0];
export const RUST = [0x2a1309, 0x44200f, 0x633015, 0x86451e, 0xa95f2b, 0xc98647];
/** beige keycap plastic, dark to light */
export const KEY = [0x23241f, 0x3d3e36, 0x5b5c52, 0x7c7e71, 0x989a8d, 0xb0b2a4, 0xc6c8ba, 0xdddfd2, 0xf1f2e8];
export const HAZ = { a: 0xe8b52a, aHi: 0xffd768, aLo: 0xa97b12, b: 0x17150f, bHi: 0x2c2a20 };
export const K = 0x070806;
export const INK = 0xd8d3bd;

// ------------------------------------------------------------------ helpers
type Pal = Record<string, number>;
/** stamp a pixel map: each char looks up a colour, '.' and ' ' are transparent */
export function art(pc: PixelCanvas, x: number, y: number, rows: string[], pal: Pal) {
  for (let j = 0; j < rows.length; j++) for (let i = 0; i < rows[j].length; i++) {
    const ch = rows[j][i];
    if (ch === '.' || ch === ' ') continue;
    const c = pal[ch];
    if (c !== undefined) pc.set(x + i, y + j, c);
  }
}
export function toUrl(pc: PixelCanvas, scale = 1): string {
  const c = document.createElement('canvas');
  c.width = pc.w * scale; c.height = pc.h * scale;
  const g = c.getContext('2d')!;
  if (scale === 1) g.putImageData(pc.toImageData(), 0, 0);
  else {
    const t = document.createElement('canvas'); t.width = pc.w; t.height = pc.h;
    t.getContext('2d')!.putImageData(pc.toImageData(), 0, 0);
    g.imageSmoothingEnabled = false;
    g.drawImage(t, 0, 0, c.width, c.height);
  }
  return c.toDataURL();
}
function canvasOf(w: number, h: number) { const pc = new PixelCanvas(w, h); pc.wrap = false; return pc; }
/** rounded-rect test with pixel stairs (r in px) */
function inRound(x: number, y: number, w: number, h: number, r: number) {
  const cx = x < r ? r - 1 - x : x > w - 1 - r ? x - (w - r) : -1;
  const cy = y < r ? r - 1 - y : y > h - 1 - r ? y - (h - r) : -1;
  if (cx < 0 || cy < 0) return true;
  return cx * cx + cy * cy <= (r - 0.5) * (r - 0.5) + 0.5;
}
/** distance (in px) from the nearest edge, honouring a corner radius */
function edgeDist(x: number, y: number, w: number, h: number) { return Math.min(x, y, w - 1 - x, h - 1 - y); }

// ------------------------------------------------------------------ metal surface
/** 64x64 tileable painted gunmetal: clustered tone, brushed grain, chips, scratches, rust bloom */
function metalTile(seed: number, size = 64, features = 1): PixelCanvas {
  const pc = new PixelCanvas(size, size);
  const rng = new Rng(seed);
  const R = [MET[3], MET[4], MET[4], MET[5], MET[5], MET[6]];
  pc.fillRamp(R, (x, y) => {
    const n = tileFbm(x, y, size, size, 4, 3, seed);
    const grain = (ph(0, y, seed + 3) - 0.5) * 0.14 + (ph(Math.floor(x / 9), y, seed + 4) - 0.5) * 0.06;
    return 0.5 + (n - 0.5) * 0.75 + grain;
  }, 0.85);
  // grime pooling in clusters
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const n = tileFbm(x, y, size, size, 3, 2, seed + 11);
    if (n > 0.64 && (n - 0.64) * 4 > bayer(x, y)) pc.set(x, y, MET[2]);
  }
  // scratches: light engraved line with a dark lip below
  const ns = Math.round(5 * features);
  for (let i = 0; i < ns; i++) {
    const x = rng.int(0, size - 1), y = rng.int(0, size - 1), len = rng.int(4, 11);
    const steep = rng.next() < 0.3, dir = rng.next() < 0.5 ? 1 : -1;
    for (let k = 0; k < len; k++) {
      const px = x + (steep ? Math.floor(k * 0.5) * dir : k), py = y + (steep ? k : Math.floor(k * 0.35) * dir);
      pc.set(px, py, k === 0 || k === len - 1 ? MET[6] : MET[8]);
      pc.set(px, py + 1, MET[2]);
    }
  }
  // paint chips down to bright steel, shadowed edge bottom-right
  const nc = Math.round(4 * features);
  for (let i = 0; i < nc; i++) {
    const cx = rng.int(0, size - 1), cy = rng.int(0, size - 1), r = rng.float(1.2, 2.6);
    for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) {
      const d = Math.hypot(x * 1.2, y) + (ph(cx + x, cy + y, seed) - 0.5) * 1.2;
      if (d < r) pc.set(cx + x, cy + y, d < r - 1 ? MET[9] : MET[8]);
      else if (d < r + 1 && (x > 0 || y > 0)) pc.set(cx + x, cy + y, MET[2]);
    }
  }
  // rust blooms with a drip
  const nr = Math.round(2 * features);
  for (let i = 0; i < nr; i++) {
    const cx = rng.int(0, size - 1), cy = rng.int(0, size - 1), r = rng.float(1.5, 3.2);
    for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) {
      const d = Math.hypot(x, y * 1.15) / r + (ph(cx + x, cy + y, seed + 5) - 0.5) * 0.6;
      if (d < 0.55) pc.set(cx + x, cy + y, RUST[ph(x, y, seed) > 0.5 ? 3 : 2]);
      else if (d < 1 && (1 - d) * 1.6 > bayer(cx + x, cy + y)) pc.set(cx + x, cy + y, d < 0.8 ? RUST[2] : RUST[1]);
    }
    const len = rng.int(4, 10);
    for (let k = 1; k < len; k++) if ((1 - k / len) > bayer(cx, cy + k) * 0.9) pc.set(cx + (k > len / 2 ? 1 : 0), cy + Math.round(r) + k, k < len / 2 ? RUST[2] : RUST[1]);
  }
  return pc;
}

// ------------------------------------------------------------------ screws & rivets
const SCREW5 = ['.kkk.', 'khhmk', 'khxmk', 'kmmdk', '.kkk.'];
const SCREW7 = ['..kkk..', '.khhhk.', 'khhxmmk', 'khxxxmk', 'kmmxmdk', '.kmmddk', '..kkk..'];
const RIVET3 = ['hm', 'md'];
function screw(pc: PixelCanvas, x: number, y: number, big = false, rot = 0) {
  const pal: Pal = { k: MET[1], h: MET[9], m: MET[7], d: MET[5], x: MET[2] };
  const rows = big ? SCREW7 : SCREW5;
  if (rot && !big) art(pc, x, y, ['.kkk.', 'khxmk', 'kxhxk', 'kmxdk', '.kkk.'], pal);
  else art(pc, x, y, rows, pal);
  // drop shadow pixels
  const n = rows.length;
  pc.set(x + n, y + Math.floor(n / 2), MET[2]); pc.set(x + Math.floor(n / 2), y + n, MET[2]); pc.set(x + n - 1, y + n - 1, MET[2]);
}
function rivet(pc: PixelCanvas, x: number, y: number) {
  art(pc, x, y, RIVET3, { h: MET[9], m: MET[7], d: MET[4] });
  pc.set(x + 2, y + 1, MET[2]); pc.set(x + 1, y + 2, MET[2]); pc.set(x + 2, y + 2, MET[1]);
}
function rustStreak(pc: PixelCanvas, x: number, y: number, len: number, seed: number) {
  for (let k = 0; k < len; k++) {
    const t = 1 - k / len;
    if (t * 1.2 > bayer(x, y + k) || k < 2) pc.set(x, y + k, k < len * 0.4 ? RUST[3] : RUST[2]);
    if (ph(x, y + k, seed) < t * 0.4) pc.set(x + 1, y + k, RUST[1]);
  }
}

// ------------------------------------------------------------------ frames
/** riveted housing frame, 48x48, slice 8 on every side; centre transparent (the metal tile shows) */
function housing(seed = 3): PixelCanvas {
  const S = 48, pc = canvasOf(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (!inRound(x, y, S, S, 3)) continue;
    const d = edgeDist(x, y, S, S);
    const top = y <= x && y <= S - 1 - x && y <= S - 1 - y, left = x < y && x <= S - 1 - y && x <= S - 1 - x;
    const lit = top || left;
    if (!inRound(x - 1, y - 1, S - 2, S - 2, 2) || d === 0) { pc.set(x, y, K); continue; }
    if (d === 1) pc.set(x, y, lit ? MET[9] : MET[1]);
    else if (d === 2) { if (lit) { if (bayer(x, y) < 0.55) pc.set(x, y, MET[7]); } else pc.set(x, y, MET[2]); }
    else if (d === 3 && !lit) { if (bayer(x, y) < 0.5) pc.set(x, y, MET[3]); }
    else if (d === 6) pc.set(x, y, lit ? MET[2] : MET[6]);
    else if (d === 7) pc.set(x, y, lit ? MET[1] : MET[7]);
  }
  // corner screws with rust weeping from the lower two... and from the top ones onto the band
  screw(pc, 1 + 1, 1 + 1, false, 0); screw(pc, S - 7, 2, false, 1);
  screw(pc, 2, S - 7, false, 1); screw(pc, S - 7, S - 7, false, 0);
  rustStreak(pc, 4, 7, 2, seed);
  // rivets mid-edge (repeat every 32 px along the edges)
  rivet(pc, 23, 3); rivet(pc, 23, S - 6); rivet(pc, 3, 23); rivet(pc, S - 6, 23);
  // a few bright chips on the outer bevel at the corners
  for (const [x, y] of [[6, 1], [1, 9], [S - 10, 1], [S - 2, 6]]) pc.set(x, y, MET[10]);
  return pc;
}

/** recessed CRT glass, 32x32 slice 10. Outer bezel lip, inner shadow by ordered dither, corner glare */
function screen(t: PkTheme): PixelCanvas {
  const S = 32, pc = canvasOf(S, S);
  const rad = 6;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (!inRound(x, y, S, S, rad)) continue;
    const outer = !inRound(x - 1, y - 1, S - 2, S - 2, rad - 1);
    if (outer) { pc.set(x, y, K); continue; }
    const lip = !inRound(x - 2, y - 2, S - 4, S - 4, rad - 2);
    if (lip) { // bezel lip: top/left in shadow, bottom/right catch light
      const lower = x + y > S - 1;
      pc.set(x, y, lower ? MET[4] : MET[1]);
      continue;
    }
    const glass = !inRound(x - 3, y - 3, S - 6, S - 6, rad - 3);
    if (glass) { pc.set(x, y, K); continue; }
    // vignette: darker toward the rim (and more at the top-left where the bezel shades the tube)
    const d = Math.min(x - 3, y - 3, S - 4 - x, S - 4 - y);
    let dark = Math.max(0, 1 - d / 7);
    dark = dark * dark * 0.9 + ((x < 8 || y < 8) ? 0.06 : 0);
    if (dark > bayer8(x, y)) pc.set(x, y, mixHex(t.scr, 0x000000, 0.7));
    else if (dark * 0.5 > bayer8(x + 3, y + 1) - 0.25) pc.set(x, y, t.scr);
  }
  // glare: a little arc of reflected light in the top-left and a speck bottom-right
  const glare = mixHex(t.hi, 0xffffff, 0.4);
  for (const [x, y, c] of [[6, 5, 1], [7, 5, 1], [8, 5, 0], [5, 6, 1], [5, 7, 0], [5, 8, 0], [10, 5, 0]] as [number, number, number][]) pc.set(x, y, c ? mixHex(t.scr2, glare, 0.45) : mixHex(t.scr2, glare, 0.22));
  pc.set(S - 7, S - 6, mixHex(t.scr2, glare, 0.18)); pc.set(S - 6, S - 7, mixHex(t.scr2, glare, 0.18));
  return pc;
}

/** sunk plate behind stencilled captions: 16x12 slice 4 */
function plate(): PixelCanvas {
  const W = 16, H = 12, pc = canvasOf(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!inRound(x, y, W, H, 2)) continue;
    const d = edgeDist(x, y, W, H);
    const lit = y >= H - 1 - d && y > 0 || x >= W - 1 - d && x > 0; // inset: light on bottom/right
    if (d === 0) pc.set(x, y, lit ? MET[6] : MET[1]);
    else if (d === 1) pc.set(x, y, lit ? MET[3] : K);
    else pc.set(x, y, (x * 3 + y * 5) % 11 === 0 ? 0x1c1e19 : 0x141612);
  }
  return pc;
}

function hazard(a: number, aHi: number, aLo: number, b = HAZ.b): PixelCanvas {
  const pc = new PixelCanvas(8, 8);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const s = (x + y) % 8;
    pc.set(x, y, s < 4 ? (s === 0 ? aHi : s === 3 ? aLo : a) : (s === 4 ? HAZ.bHi : b));
  }
  return pc;
}

/** phosphor highlight bar 12x10 slice 3, notched corners, top highlight, bottom shade */
function hlBar(fill: number, hi: number, lo: number, outlineOnly = false): PixelCanvas {
  const W = 12, H = 10, pc = canvasOf(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const corner = (x === 0 || x === W - 1) && (y === 0 || y === H - 1);
    if (corner) continue;
    const d = edgeDist(x, y, W, H);
    if (outlineOnly) { if (d === 0) pc.set(x, y, fill); else if (d === 1 && (x === 1 || x === W - 2) && (y === 1 || y === H - 2)) pc.set(x, y, lo); continue; }
    if (y === 0) pc.set(x, y, hi);
    else if (y === H - 1) pc.set(x, y, lo);
    else if (x === 0 || x === W - 1) pc.set(x, y, mixHex(fill, lo, 0.5));
    else pc.set(x, y, fill);
  }
  return pc;
}

/** small arrow caret 4x7 */
function caret(c: number, shade: number): PixelCanvas {
  const pc = canvasOf(4, 7);
  art(pc, 0, 0, ['a...', 'aa..', 'aaa.', 'aaab', 'aab.', 'ab..', 'b...'], { a: c, b: shade });
  return pc;
}

/** keycap 14x16; slices 4 4 6 4. state: 0 up, 1 hover, 2 down, 3 lit, 4 amber, 5 red, 6 dark metal */
function keycap(state: number, t: PkTheme): PixelCanvas {
  const W = 14, H = 16, pc = canvasOf(W, H);
  let R = KEY;
  if (state === 3) R = [0x061a0d, mixHex(t.dark, t.dim, 0.5), t.dim, mixHex(t.dim, t.mid, 0.5), t.mid, mixHex(t.mid, t.ph, 0.6), t.ph, mixHex(t.ph, t.hi, 0.5), t.hi];
  if (state === 4) R = [0x2a1a04, 0x5a3a0c, 0x8a5c14, 0xb07a1c, 0xd09426, 0xe8a83a, 0xf8c25a, 0xffd98a, 0xfff0c8];
  if (state === 5) R = [0x2a0804, 0x5a160c, 0x8a2414, 0xb2341e, 0xd0482c, 0xe25c3a, 0xf07a58, 0xffa88a, 0xffd8c8];
  if (state === 6) R = [MET[0], MET[1], MET[2], MET[3], MET[4], MET[5], MET[6], MET[7], MET[8]];
  const down = state === 2;
  const lift = down ? 1 : 3;            // visible key skirt (depth)
  const bright = state === 1 ? 1 : 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const top = down ? 2 : 0;
    if (y < top) continue;
    if (!inRound(x, y - top, W, H - top, 2)) continue;
    const yy = y - top;
    const hh = H - top;
    if (x === 0 || x === W - 1 || yy === 0 || yy === hh - 1 || !inRound(x - 1, yy - 1, W - 2, hh - 2, 1)) { pc.set(x, y, K); continue; }
    const faceBottom = hh - 1 - lift;
    if (yy >= faceBottom) { // skirt
      const sk = yy - faceBottom;
      pc.set(x, y, sk === 0 ? R[2] : R[1]);
      if (x === 1 || x === W - 2) pc.set(x, y, R[1]);
      continue;
    }
    let c = R[5 + bright];
    if (yy === 1) c = R[8 - (bright ? 0 : 1)];
    else if (x === 1) c = R[6 + bright];
    else if (x === W - 2) c = R[3 + bright];
    else if (yy === faceBottom - 1) c = R[4 + bright];
    // faint dished centre: dither a slightly darker ring
    else if ((yy === 2 || x === 2) && bayer(x, y) < 0.5) c = R[6 + bright];
    pc.set(x, y, c);
  }
  if (state === 1) { // hover: phosphor tell-tale pixels in the outline corners
    for (const [x, y] of [[2, 0], [3, 0], [0, 3], [W - 3, 0], [W - 4, 0], [W - 1, 3]]) pc.set(x, y, t.ph);
  }
  return pc;
}

/** segmented selector cell 8x8 slice 3: 0 off, 1 hover, 2 on, 3 disabled */
function segCell(state: number, t: PkTheme): PixelCanvas {
  const pc = canvasOf(8, 8);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const d = edgeDist(x, y, 8, 8);
    if ((x === 0 || x === 7) && (y === 0 || y === 7)) { pc.set(x, y, K); continue; }
    if (d === 0) pc.set(x, y, state === 2 ? t.ph : state === 1 ? t.mid : state === 3 ? mixHex(t.dark, t.scr, 0.5) : t.dim);
    else if (state === 2) pc.set(x, y, y === 1 ? t.hi : y === 6 ? t.mid : t.ph);
    else if (state === 1) pc.set(x, y, d === 1 && (x === 1 || y === 1) ? mixHex(t.scr2, t.dark, 0.5) : mixHex(t.scr2, t.dark, 0.85));
    else pc.set(x, y, d === 1 && (x === 1 || y === 1) ? 0x000000 : t.scr);
  }
  return pc;
}

/** tab cursor 10x10 slice 3 3 1 3: phosphor with cut top corners */
function tabOn(t: PkTheme, fill = t.ph): PixelCanvas {
  const pc = canvasOf(10, 10);
  for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) {
    if (y < 2 && (x < 2 - y || x > 7 + y)) continue;
    let c = fill;
    if (y === 0) c = t.hi;
    else if (x === 0 || x === 9 || (y === 1 && (x === 1 || x === 8))) c = mixHex(fill, t.hi, 0.35);
    pc.set(x, y, c);
  }
  return pc;
}

/** toggle switch 24x11: slot, lever, LED */
function toggleSw(on: boolean, t: PkTheme): PixelCanvas {
  const W = 24, H = 11, pc = canvasOf(W, H);
  // slot
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!inRound(x, y, W, H, 2)) continue;
    const d = edgeDist(x, y, W, H);
    if (d === 0) pc.set(x, y, K);
    else if (d === 1) pc.set(x, y, y >= H - 2 || x >= W - 2 ? MET[5] : MET[1]);
    else pc.set(x, y, on ? (bayer(x, y) < 0.25 ? t.dark : mixHex(t.scr2, t.dark, 0.6)) : 0x0b0d0a);
  }
  // lit channel when on
  if (on) for (let x = 3; x < 13; x++) pc.set(x, 5, t.dim);
  // lever cap (keycap-ish)
  const lx = on ? 12 : 2;
  for (let y = 2; y < 9; y++) for (let x = lx; x < lx + 10; x++) {
    const e = x === lx || x === lx + 9 || y === 2 || y === 8;
    pc.set(x, y, e ? K : y === 3 ? KEY[7] : y === 7 ? KEY[2] : x === lx + 1 ? KEY[6] : x === lx + 8 ? KEY[3] : KEY[5]);
  }
  // grip ridges
  for (let y = 4; y < 7; y++) { pc.set(lx + 4, y, KEY[3]); pc.set(lx + 6, y, KEY[3]); pc.set(lx + 5, y, KEY[7]); }
  // LED on the lever
  pc.set(lx + 2, 4, on ? t.hi : 0x3a1a10); pc.set(lx + 2, 5, on ? t.ph : 0x2a120a);
  return pc;
}

/** check box 9x9: 0 off, 1 on, 2 locked */
function check(state: number, t: PkTheme): PixelCanvas {
  const pc = canvasOf(9, 9);
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
    const d = edgeDist(x, y, 9, 9);
    if (d === 0) pc.set(x, y, state === 1 ? t.scr : t.mid);
    else if (d === 1) pc.set(x, y, state === 1 ? t.scr : 0x000000);
    else pc.set(x, y, state === 1 ? t.scr : t.scr);
  }
  if (state === 1) art(pc, 2, 2, ['....a', '...aa', 'a.aa.', 'aaa..', '.a...'], { a: t.ph });
  if (state === 2) { pc.clear(); art(pc, 1, 0, ['..aaa..', '.a...a.', '.a...a.', 'bbbbbbb', 'bccbccb', 'bcc.ccb', 'bccbccb', 'bbbbbbb', '.......'], { a: t.warn, b: scaleHex(t.warn, 0.55), c: t.warn }); }
  return pc;
}

/** recessed meter frame 6x6 slice 2 */
function barFrame(t: PkTheme): PixelCanvas {
  const pc = canvasOf(6, 6);
  for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) {
    const d = edgeDist(x, y, 6, 6);
    if (d === 0) pc.set(x, y, (x === 0 || x === 5) && (y === 0 || y === 5) ? t.scr : t.dim);
    else if (d === 1) pc.set(x, y, y === 1 || x === 1 ? 0x000000 : t.scr);
  }
  return pc;
}

/** slider knob 7x11 */
function knob(hover: boolean, t: PkTheme): PixelCanvas {
  const pc = canvasOf(7, 11);
  const R = hover ? [t.dim, t.mid, t.ph, t.hi] : [KEY[2], KEY[4], KEY[6], KEY[8]];
  art(pc, 0, 0, [
    '.kkkkk.', 'khhhhmk', 'khmmmdk', 'khggmdk', 'khmmmdk', 'khggmdk', 'khmmmdk', 'khggmdk', 'khmmmdk', 'kmdddsk', '.kkkkk.',
  ], { k: K, h: R[3], m: R[2], d: R[1], g: R[0], s: R[0] });
  return pc;
}
/** slider track 8x6 slice 2 */
function track(t: PkTheme): PixelCanvas {
  const pc = canvasOf(8, 6);
  for (let y = 0; y < 6; y++) for (let x = 0; x < 8; x++) {
    const d = edgeDist(x, y, 8, 6);
    if (d === 0) pc.set(x, y, (x === 0 || x === 7) && (y === 0 || y === 5) ? K : y === 5 || x === 7 ? MET[5] : K);
    else if (d === 1 && (y === 1 || x === 1)) pc.set(x, y, 0x000000);
  }
  return pc;
}

/** viewfinder brackets 16x16 slice 6 */
function brackets(c: number, sh: number): PixelCanvas {
  const pc = canvasOf(16, 16);
  const L = ['aaaaa', 'abbbb', 'ab...', 'ab...', 'ab...'];
  for (const [fx, fy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) {
      const ch = L[j][i]; if (ch === '.') continue;
      const x = fx ? 15 - i : i, y = fy ? 15 - j : j;
      pc.set(x, y, ch === 'a' ? c : sh);
    }
  }
  return pc;
}

/** tooltip / readout frame 16x16 slice 5: thin metal rim, black gap, phosphor hairline, glass */
function readout(t: PkTheme, rim = true): PixelCanvas {
  const S = 16, pc = canvasOf(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (!inRound(x, y, S, S, 2)) continue;
    const d = edgeDist(x, y, S, S);
    const lit = (y < S / 2 && y <= x && y <= S - 1 - x) || (x < S / 2 && x < y && x <= S - 1 - y);
    if (d === 0) pc.set(x, y, K);
    else if (d === 1) pc.set(x, y, rim ? (lit ? MET[8] : MET[3]) : K);
    else if (d === 2) pc.set(x, y, rim ? (lit ? MET[5] : MET[2]) : K);
    else if (d === 3) pc.set(x, y, K);
    else if (d === 4) pc.set(x, y, (x + y) % 2 === 0 ? t.dim : t.dark);
    else pc.set(x, y, t.scr);
  }
  if (rim) for (const [x, y] of [[1, 1], [S - 2, 1], [1, S - 2], [S - 2, S - 2]]) pc.set(x, y, MET[9]);
  return pc;
}

/** context-menu housing 20x20 slice 6: chunkier rim with corner rivets */
function menuFrame(t: PkTheme): PixelCanvas {
  const S = 20, pc = canvasOf(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (!inRound(x, y, S, S, 3)) continue;
    const d = edgeDist(x, y, S, S);
    const lit = (y < S / 2 && y <= x && y <= S - 1 - x) || (x < S / 2 && x < y && x <= S - 1 - y);
    if (d === 0 || !inRound(x - 1, y - 1, S - 2, S - 2, 2)) pc.set(x, y, K);
    else if (d === 1) pc.set(x, y, lit ? MET[9] : MET[2]);
    else if (d === 2 || d === 3) pc.set(x, y, d === 2 ? (lit ? MET[6] : MET[3]) : (lit ? MET[5] : MET[3]));
    else if (d === 4) pc.set(x, y, K);
    else if (d === 5) pc.set(x, y, t.dark);
    else pc.set(x, y, t.scr);
  }
  for (const [x, y] of [[2, 2], [S - 4, 2], [2, S - 4], [S - 4, S - 4]]) rivet(pc, x, y);
  return pc;
}

/** header strip 8x8 slice 2: solid fill with notched ends and a highlight row */
function strip(fill: number, hi: number, lo: number): PixelCanvas {
  const pc = canvasOf(8, 8);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    if ((x === 0 || x === 7) && (y === 0 || y === 7)) continue;
    pc.set(x, y, y === 0 ? hi : y === 7 ? lo : fill);
  }
  return pc;
}

/** item icon cell 10x10 slice 3: sunk tray with a faint grid floor */
function slot(t: PkTheme, sel: boolean): PixelCanvas {
  const pc = canvasOf(10, 10);
  for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) {
    if ((x === 0 || x === 9) && (y === 0 || y === 9)) continue;
    const d = edgeDist(x, y, 10, 10);
    if (d === 0) pc.set(x, y, sel ? t.hi : y === 9 || x === 9 ? t.dim : 0x000000);
    else if (d === 1) pc.set(x, y, sel ? t.ph : (y === 1 || x === 1) ? 0x000000 : mixHex(t.scr, t.dark, 0.5));
    else pc.set(x, y, sel ? mixHex(t.dark, t.dim, 0.3) : mixHex(t.scr, t.dark, 0.35));
  }
  return pc;
}

/** paper with tractor-feed holes, 24x24 slice 0 10 0 10 */
function paper(): PixelCanvas {
  const W = 24, H = 24, pc = canvasOf(W, H);
  const P = [0xf2f0e4, 0xe6e3d2, 0xd9ecd6, 0xc9dcc6, 0xb9b6a2];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const strip = x < 10 || x >= W - 10;
    let c = strip ? P[0] : (Math.floor(y / 12) % 2 ? P[0] : P[2]);
    if (x === 9 || x === W - 10) c = bayer(x, y) < 0.5 ? P[4] : P[1]; // perforation
    pc.set(x, y, c);
  }
  for (const cx of [4, W - 6]) for (const cy of [3, 15]) art(pc, cx, cy, ['.ab.', 'abbc', 'abbc', '.cc.'], { a: 0x8a877a, b: 0x2a2924, c: 0xd2cfbf });
  return pc;
}

/** dotted divider tile 4x1 */
function dots(c: number): PixelCanvas { const pc = new PixelCanvas(4, 1); pc.set(0, 0, c); pc.set(1, 0, c); return pc; }
/** etched groove 1x2: dark over light */
function etch(): PixelCanvas { const pc = new PixelCanvas(1, 2); pc.set(0, 0, MET[1]); pc.set(0, 1, MET[7]); return pc; }

/** scrollbar thumb 6x10 slice 3, grip lines in the middle */
function sbThumb(t: PkTheme, hover = false): PixelCanvas {
  const pc = canvasOf(6, 10);
  const f = hover ? t.mid : t.dim;
  for (let y = 0; y < 10; y++) for (let x = 0; x < 6; x++) {
    if ((x === 0 || x === 5) && (y === 0 || y === 9)) continue;
    pc.set(x, y, x === 0 || y === 0 ? mixHex(f, t.hi, 0.3) : x === 5 || y === 9 ? mixHex(f, 0x000000, 0.4) : f);
  }
  for (const y of [3, 5]) for (let x = 1; x < 5; x++) pc.set(x, y, mixHex(f, 0x000000, 0.45));
  for (const y of [4, 6]) for (let x = 1; x < 5; x++) pc.set(x, y, mixHex(f, t.hi, 0.25));
  return pc;
}
function sbTrack(t: PkTheme): PixelCanvas {
  const pc = new PixelCanvas(6, 4);
  for (let y = 0; y < 4; y++) { pc.set(2, y, y % 2 ? t.scr : t.dark); pc.set(3, y, y % 2 ? t.dark : t.scr); }
  return pc;
}

/** inventory folder key 12x12 slice 4 */
function tabKey(on: boolean, t: PkTheme): PixelCanvas {
  const pc = canvasOf(12, 12);
  for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
    if (!inRound(x, y, 12, 12, 2)) continue;
    const d = edgeDist(x, y, 12, 12);
    const lit = y < 6 && y <= x && y <= 11 - x || x < 6 && x < y && x <= 11 - y;
    if (d === 0) pc.set(x, y, on ? t.ph : K);
    else if (on) pc.set(x, y, d === 1 ? (lit ? t.dim : t.dark) : mixHex(t.scr2, t.dark, 0.4));
    else if (d === 1) pc.set(x, y, lit ? MET[7] : MET[2]);
    else if (d === 2) pc.set(x, y, lit ? MET[5] : MET[3]);
    else pc.set(x, y, MET[4]);
  }
  return pc;
}

/** toast plate 20x20 slice 6: dark glass in a riveted steel tag with hazard corners */
function toastFrame(t: PkTheme): PixelCanvas {
  const pc = menuFrame(t);
  // hazard chevrons in the top corners
  for (let i = 0; i < 4; i++) { pc.set(5 + i, 1, i % 2 ? HAZ.b : HAZ.a); pc.set(14 - i, 1, i % 2 ? HAZ.b : HAZ.a); }
  return pc;
}

/** dim wallpaper behind the personnel file: mono-yellow stripes and a small lozenge motif, water-stained */
function wallpaper(): PixelCanvas {
  const S = 32, pc = new PixelCanvas(S, S);
  const Y = [0x2a2310, 0x3a3117, 0x4a3f1e, 0x5c4f27, 0x6e6031];
  pc.fillRamp(Y, (x, y) => {
    const stripe = (x % 16) < 2 ? -0.18 : (x % 16) === 2 ? 0.08 : 0;
    return 0.55 + stripe + (tileFbm(x, y, S, S, 2, 2, 41) - 0.5) * 0.35;
  }, 0.8);
  for (const [cx, cy] of [[9, 7], [9, 23], [25, 15], [25, 31]] as [number, number][]) {
    art(pc, cx - 2, cy - 2, ['..a..', '.aba.', 'abcba', '.aba.', '..a..'], { a: Y[1], b: Y[3], c: Y[4] });
  }
  pc.stain(20, 6, 6, Y[1], Y[0], 3);
  return pc;
}
/** phosphor graph paper 16x16 */
function gridTile(t: PkTheme): PixelCanvas {
  const pc = new PixelCanvas(16, 16);
  pc.fill(t.scr);
  for (let i = 0; i < 16; i += 2) { pc.set(i, 0, mixHex(t.scr, t.dark, 0.6)); pc.set(0, i, mixHex(t.scr, t.dark, 0.6)); }
  pc.set(0, 0, t.dark); pc.set(8, 8, mixHex(t.scr, t.dark, 0.5));
  return pc;
}
/** Meridian Institute seal, 22x22: a globe of meridians under a lintel, embossed on the plate */
function seal(t: PkTheme): PixelCanvas {
  const S = 22, pc = canvasOf(S, S);
  const c = 10.5;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = Math.hypot(x - c, y - c);
    if (d > 10.6) continue;
    if (d > 9.6) pc.set(x, y, K);
    else if (d > 8.6) pc.set(x, y, x + y < S - 1 ? MET[9] : MET[5]);
    else if (d > 7.8) pc.set(x, y, MET[3]);
    else pc.set(x, y, x + y < S ? MET[6] : MET[5]);
  }
  // meridians and equator, engraved (dark with a light lip)
  const eng = (x: number, y: number) => { pc.set(x, y, MET[2]); if (pc.get(x + 1, y + 1) !== MET[2]) pc.set(x + 1, y + 1, MET[8]); };
  for (let y = 4; y <= 17; y++) eng(10, y);
  for (const rx of [3.6, 6.4]) for (let a = 0; a < 64; a++) { const th = (a / 64) * Math.PI * 2; const x = Math.round(c + Math.cos(th) * rx - 0.5), y = Math.round(c + Math.sin(th) * 6.6 - 0.5); if (y >= 4 && y <= 17) eng(x, y); }
  for (let x = 4; x <= 17; x++) eng(x, 10);
  // phosphor dot: the institute's "eye"
  pc.set(10, 10, t.ph); pc.set(11, 10, t.mid);
  return pc;
}
/** cassette tape, 24x16 (save slots) */
function cassette(t: PkTheme): PixelCanvas {
  const W = 24, H = 16, pc = canvasOf(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!inRound(x, y, W, H, 2)) continue;
    const d = edgeDist(x, y, W, H);
    pc.set(x, y, d === 0 ? K : (y === 1 ? KEY[3] : x === 1 ? KEY[2] : y === H - 2 || x === W - 2 ? 0x17181a : 0x2a2c2e));
  }
  // label
  for (let y = 2; y < 7; y++) for (let x = 3; x < W - 3; x++) pc.set(x, y, y === 2 ? 0xf4efd8 : y === 6 ? 0xb9b39a : (y === 4 && x > 4 && x < 14 ? 0x7a7466 : 0xe6e0c6));
  pc.hline(3, W - 4, 3, t.mid);
  // window + reels
  for (let y = 7; y < 12; y++) for (let x = 6; x < 18; x++) pc.set(x, y, y === 7 ? 0x0b0c0d : 0x3a2a18);
  for (const rx of [8, 15]) art(pc, rx - 1, 8, ['.a.', 'aba', '.a.'], { a: 0xd8d2bc, b: K });
  pc.hline(10, 13, 9, 0x6b4a26);
  // trapezoid at the bottom with screw holes
  pc.hline(7, 16, 13, 0x1d1e20); pc.set(5, 13, KEY[4]); pc.set(18, 13, KEY[4]);
  return pc;
}
/** ID photo 22x26: white print with a paperclip, a dim phosphor silhouette until a real snapshot replaces it */
export function idPhoto(t: PkTheme, img?: ImageData): PixelCanvas {
  const W = 22, H = 26, pc = canvasOf(W, H);
  for (let y = 2; y < H; y++) for (let x = 0; x < W; x++) {
    const d = Math.min(x, y - 2, W - 1 - x, H - 1 - y);
    pc.set(x, y, d === 0 ? (x === W - 1 || y === H - 1 ? 0x8a8676 : 0xb9b5a2) : 0xeeeadb);
  }
  // photo area 18x17 at (2,4)
  const ox = 2, oy = 4, pw = 18, ph2 = 17;
  for (let y = 0; y < ph2; y++) for (let x = 0; x < pw; x++) {
    let c = mixHex(0x10140f, 0x2c3329, y / ph2 * 0.6);
    if (img && img.width) {
      const sx = Math.floor((x / pw) * img.width), sy = Math.floor((y / ph2) * img.height);
      const i = (sy * img.width + sx) * 4;
      if (img.data[i + 3] > 40) c = (img.data[i] << 16) | (img.data[i + 1] << 8) | img.data[i + 2];
    }
    pc.set(ox + x, oy + y, c);
  }
  if (!img) {
    art(pc, ox + 5, oy + 3, ['..aaaa..', '.abbbba.', '.abbbba.', '.abbbba.', '..abba..', '...bb...', '.aabbaa.', 'abbbbbba', 'bbbbbbbb', 'bbbbbbbb'], { a: t.dim, b: t.dark });
    for (let x = ox; x < ox + pw; x++) pc.set(x, oy + ph2 - 1, mixHex(t.scr, t.dim, 0.4));
  }
  // date stamp in the corner and a paperclip over the top edge
  pc.set(ox + pw - 2, oy + ph2 - 2, 0xff8a3a); pc.set(ox + pw - 4, oy + ph2 - 2, 0xff8a3a);
  art(pc, 4, 0, ['.aaaa.', 'a....a', 'a.aa.a', 'a.a..a', 'a.a..a', 'b.b..b', '..b..b', '..bbbb'], { a: MET[9], b: MET[6] });
  return pc;
}

/**
 * On-screen touch pad, 16x16 (slice 5) or 24x24 round (slice 9): translucent dark rubber with a
 * hard bevel. rim: accent colour for "on" states; down: pressed (bevel inverted, darker).
 */
function pad(round: boolean, rim: number | null, down: boolean, fill = 0x16130c, alpha = 150): PixelCanvas {
  const S = round ? 24 : 16, r = round ? 9 : 4, pc = canvasOf(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (!inRound(x, y, S, S, r)) continue;
    const outer = !inRound(x - 1, y - 1, S - 2, S - 2, r - 1);
    if (outer) { pc.set(x, y, 0x080704, 235); continue; }
    const rimPx = !inRound(x - 2, y - 2, S - 4, S - 4, r - 2);
    const upper = x + y < S - 1;
    if (rimPx) {
      if (rim !== null) pc.set(x, y, rim, 255);
      else pc.set(x, y, (down ? !upper : upper) ? 0xb8ae90 : 0x3a3428, down ? 170 : 190);
      continue;
    }
    const inner2 = !inRound(x - 3, y - 3, S - 6, S - 6, Math.max(1, r - 3));
    if (inner2 && rim !== null) { pc.set(x, y, mixHex(rim, 0x000000, 0.55), 200); continue; }
    pc.set(x, y, down ? mixHex(fill, 0xf2b33d, 0.35) : fill, down ? alpha + 40 : alpha);
  }
  return pc;
}
/** stick plate 24x24 slice 10: ring with tick marks */
function stickBase(): PixelCanvas {
  const S = 24, pc = canvasOf(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (!inRound(x, y, S, S, 10)) continue;
    const ring = !inRound(x - 1, y - 1, S - 2, S - 2, 9);
    const ring2 = !inRound(x - 2, y - 2, S - 4, S - 4, 8);
    if (ring) pc.set(x, y, 0x080704, 170);
    else if (ring2) pc.set(x, y, 0xefe5c4, 80);
    else pc.set(x, y, 0x0e0c08, (x + y) % 2 ? 40 : 60);
  }
  for (const [x, y] of [[11, 3], [12, 3], [3, 11], [3, 12], [20, 11], [20, 12], [11, 20], [12, 20]]) pc.set(x, y, 0xefe5c4, 120);
  return pc;
}

// ------------------------------------------------------------------ cursors (art 1x; scaled when installed)
const CUR_ARROW = [
  'k.........', 'kk........', 'kwk.......', 'kwwk......', 'kwwwk.....', 'kwwwwk....', 'kwwwwwk...', 'kwwwwwwk..', 'kwwwwwwwk.', 'kwwwwwwwwk',
  'kwwwwwkkkk', 'kwwkwwk...', 'kwk.kwwk..', 'kk..kwwk..', 'k....kwwk.', '.....kwwk.', '......kk..',
];
const CUR_HAND = [
  '....kk......', '...kwwk.....', '...kwwk.....', '...kwwk.....', '...kwwkkk...', '...kwwkwwkk.', '.kkkwwkwwkwk', 'kwwkwwwwwkwk', 'kwwkwwwwwwwk',
  'kwwwwwwwwwwk', '.kwwwwwwwwwk', '.kwwwwwwwwk.', '..kwwwwwwwk.', '..kwwwwwwk..', '...kwwwwwk..', '...kkkkkkk..',
];
const CUR_AIM = [
  '.....kak.....', '.....kak.....', '.....kak.....', '.............', '.............', 'kkk.......kkk', 'aaa...a...aaa', 'kkk.......kkk', '.............', '.............', '.....kak.....', '.....kak.....', '.....kak.....',
];
const CUR_WAIT = [
  'kkkkkkkkk', 'kmmmmmmmk', '.kwwwwwk.', '.kawwwak.', '..kaaak..', '...kak...', '...kwk...', '..kwawk..', '.kwwawwk.', '.kwaaawk.', 'kmmmmmmmk', 'kkkkkkkkk',
];
const CUR_TEXT = ['kkk.kkk', '...k...', '...k...', '...k...', '...k...', '...k...', '...k...', '...k...', 'kkk.kkk'];
function cursorArt(kind: string, t: PkTheme): PixelCanvas {
  const rows = kind === 'hand' ? CUR_HAND : kind === 'aim' ? CUR_AIM : kind === 'busy' ? CUR_WAIT : kind === 'text' ? CUR_TEXT : CUR_ARROW;
  const w = Math.max(...rows.map((r) => r.length)) + 1, h = rows.length + 1;
  const pc = canvasOf(w, h);
  const shade = 0xb9c2b0;
  // drop shadow
  for (let j = 0; j < rows.length; j++) for (let i = 0; i < rows[j].length; i++) if (rows[j][i] !== '.') pc.set(i + 1, j + 1, 0x000000, 110);
  for (let j = 0; j < rows.length; j++) for (let i = 0; i < rows[j].length; i++) {
    const ch = rows[j][i];
    if (ch === '.') continue;
    let c = ch === 'k' ? 0x050805 : ch === 'a' ? t.ph : ch === 'm' ? MET[7] : 0xf2f5ea;
    // shade the right/bottom side of the white body for a bit of volume
    if (ch === 'w' && (rows[j][i + 1] === 'k' || rows[j + 1]?.[i] === 'k')) c = shade;
    if (kind === 'hand' && ch === 'w' && j < 6) c = i === 4 ? shade : 0xf2f5ea;
    pc.set(i, j, c);
  }
  if (kind === 'aim') pc.set(6, 6, t.hi);
  return pc;
}
export const CURSOR_HOT: Record<string, [number, number]> = { arrow: [0, 0], hand: [4, 0], aim: [6, 6], busy: [4, 6], text: [3, 4] };

// ------------------------------------------------------------------ install
let installedFor = '';
let curTheme: PkTheme = THEMES.green;
const urls: Record<string, string> = {};
/** the active terminal palette */
export function kitTheme(): PkTheme { return curTheme; }
export function kitUrl(name: string): string { return urls[name] || ''; }

/** integer CSS px per art pixel (written to --px by applyUiSettings) */
export function pxScale(): number {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--pxn'));
  return v > 0 ? v : 2;
}

/** cursor value for the CSS `cursor` property at the current scale */
export function cursorCss(kind: string): string {
  return urls['cur-' + kind] ? `url(${urls['cur-' + kind]}) ${urls['cur-' + kind + '-hot']}, ${kind === 'hand' ? 'pointer' : kind === 'text' ? 'text' : kind === 'aim' ? 'crosshair' : kind === 'busy' ? 'wait' : 'default'}` : 'default';
}

export function installPixelKit(themeName: string, px: number) {
  const key = themeName + '|' + px;
  if (key === installedFor) return;
  installedFor = key;
  const t = THEMES[themeName] || THEMES.green;
  curTheme = t;
  const set = (name: string, pc: PixelCanvas) => { urls[name] = toUrl(pc); };
  set('metal', metalTile(7));
  set('metal-lite', metalTile(19, 48, 0.6));
  set('housing', housing());
  set('screen', screen(t));
  set('plate', plate());
  set('hazard', hazard(HAZ.a, HAZ.aHi, HAZ.aLo));
  set('hazard-red', hazard(t.danger, mixHex(t.danger, 0xffffff, 0.35), scaleHex(t.danger, 0.6)));
  set('hazard-ph', hazard(t.ph, t.hi, t.mid));
  set('hl', hlBar(t.ph, t.hi, t.mid));
  set('hl-danger', hlBar(t.danger, mixHex(t.danger, 0xffffff, 0.45), scaleHex(t.danger, 0.65)));
  set('hl-line', hlBar(t.ph, t.hi, t.dim, true));
  set('hl-dim', hlBar(t.dark, t.dim, mixHex(t.dark, 0x000000, 0.4)));
  set('caret', caret(t.ph, t.mid));
  set('caret-inv', caret(t.scr, mixHex(t.scr, t.dim, 0.5)));
  set('key', keycap(0, t)); set('key-hover', keycap(1, t)); set('key-down', keycap(2, t)); set('key-on', keycap(3, t));
  set('key-amber', keycap(4, t)); set('key-red', keycap(5, t)); set('key-metal', keycap(6, t));
  set('seg', segCell(0, t)); set('seg-hover', segCell(1, t)); set('seg-on', segCell(2, t)); set('seg-dis', segCell(3, t));
  set('tab-on', tabOn(t)); set('tab-hover', tabOn(t, t.dark));
  set('sw-off', toggleSw(false, t)); set('sw-on', toggleSw(true, t));
  set('chk-off', check(0, t)); set('chk-on', check(1, t)); set('chk-lock', check(2, t));
  set('bar', barFrame(t)); set('track', track(t)); set('knob', knob(false, t)); set('knob-hover', knob(true, t));
  set('brackets', brackets(t.mid, t.dark)); set('brackets-warn', brackets(t.warn, scaleHex(t.warn, 0.4)));
  set('tip', readout(t)); set('readout', readout(t, false)); set('menu', menuFrame(t)); set('toast', toastFrame(t));
  set('strip', strip(t.ph, t.hi, t.mid)); set('strip-danger', strip(t.danger, mixHex(t.danger, 0xffffff, 0.4), scaleHex(t.danger, 0.65)));
  set('strip-warn', strip(t.warn, mixHex(t.warn, 0xffffff, 0.5), scaleHex(t.warn, 0.7))); set('strip-dark', strip(t.dark, t.dim, 0x000000));
  set('slot', slot(t, false)); set('slot-sel', slot(t, true));
  set('tabkey', tabKey(false, t)); set('tabkey-on', tabKey(true, t));
  set('paper', paper());
  set('dots', dots(t.dark)); set('dots-dim', dots(t.dim)); set('dots-metal', dots(MET[2])); set('etch', etch());
  set('sb-thumb', sbThumb(t)); set('sb-thumb-hover', sbThumb(t, true)); set('sb-track', sbTrack(t));
  set('pad', pad(false, null, false)); set('pad-down', pad(false, null, true)); set('pad-on', pad(false, 0xf2b33d, false)); set('pad-rec', pad(false, 0xe0533a, false));
  set('pad-round', pad(true, null, false)); set('pad-round-down', pad(true, null, true)); set('pad-round-on', pad(true, 0xf2b33d, false));
  set('pad-scan', pad(false, null, false, mixHex(t.scr, 0x000000, 0.2), 205)); set('pad-scan-on', pad(false, t.ph, false, t.dark, 225));
  set('stick-base', stickBase()); set('stick-knob', pad(true, null, false, 0x3a3428, 140));
  set('desk', wallpaper()); set('grid', gridTile(t)); set('seal', seal(t)); set('tape', cassette(t)); set('idphoto', idPhoto(t));
  // cursors: pre-scaled (CSS cursors are not resampled by image-rendering)
  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  const cs = Math.max(1, Math.round(Math.min(px, 3) * dpr));
  for (const k of ['arrow', 'hand', 'aim', 'busy', 'text']) {
    const pc = cursorArt(k, t);
    urls['cur-' + k] = toUrl(pc, cs);
    urls['cur-' + k + '-img'] = toUrl(pc, Math.max(1, Math.round(Math.min(px, 3))));
    const [hx, hy] = CURSOR_HOT[k];
    // the hotspot is in image pixels; with image-set the browser divides by the resolution
    urls['cur-' + k + '-hot'] = `${Math.round((hx + 0.5) * cs / dpr)} ${Math.round((hy + 0.5) * cs / dpr)}`;
  }
  const de = document.documentElement.style;
  for (const [k, v] of Object.entries(urls)) if (!k.startsWith('cur-')) de.setProperty('--pk-' + k, `url(${v})`);
  for (const k of ['arrow', 'hand', 'aim', 'busy', 'text']) {
    const u = urls['cur-' + k];
    const fb = k === 'hand' ? 'pointer' : k === 'text' ? 'text' : k === 'aim' ? 'crosshair' : k === 'busy' ? 'wait' : 'default';
    const hot = urls['cur-' + k + '-hot'];
    de.setProperty('--cur-' + k, dpr > 1 ? `-webkit-image-set(url(${u}) ${dpr}x) ${hot}, ${fb}` : `url(${u}) ${hot}, ${fb}`);
  }
}

/** draw a kit sprite into a canvas element (for places that need a real element) */
export function kitImage(name: string): HTMLImageElement { const i = new Image(); i.src = urls[name] || ''; i.alt = ''; return i; }
