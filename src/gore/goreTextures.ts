// Gore textures: blood and other insides as fit-once decals (floor splats,
// directional sprays, cast-off streaks, pools, drag smears, drops, wall
// splatter with drip runs, bloody shoe prints) plus stump / meat / bone
// surfaces for severed parts and chunks. One set per "liquid" (red blood,
// hydraulic oil, glow paint) and per dry debris (stuffing, plaster,
// fibreglass, static). Alpha is used in a few hard steps so the decals stay
// crisp after the renderer's quantisation.
import { atlas } from '../gfx/atlas';
import { addTextureModule } from '../gfx/textures/index';
import { PixelCanvas, ph } from '../gfx/pixel';
import { Rng } from '../core/rng';
import { blob, over } from '../content/textures/kit';

/** dark → light, then a wet highlight */
interface Pal { c: number[]; hi: number; liquid: boolean }

const PALS: Record<string, Pal> = {
  red: { c: [0x1e0405, 0x3a0708, 0x5a0b0d, 0x7a1315, 0x9a2022, 0xb83a3a], hi: 0xd87070, liquid: true },
  oil: { c: [0x0c0c0e, 0x18181c, 0x26252a, 0x34333a, 0x46464e, 0x5e6474], hi: 0x9aa8c8, liquid: true },
  glow: { c: [0x0b3a2e, 0x125846, 0x1c7c60, 0x2aa47e, 0x48cc9c, 0x8af0c8], hi: 0xd8fff0, liquid: true },
  fluff: { c: [0x6e685e, 0x9a948a, 0xbcb8ae, 0xd8d4ca, 0xeae8e0, 0xf8f6f0], hi: 0xffffff, liquid: false },
  plaster: { c: [0x6a665e, 0x8e8a80, 0xaeaaa0, 0xc8c4ba, 0xdcd8ce, 0xeceae2], hi: 0xf8f6f0, liquid: false },
  shell: { c: [0x3a3026, 0x6a5c48, 0x9a8a6e, 0xbcac8c, 0xd4c6a6, 0xe6dcc2], hi: 0xf4ecd8, liquid: false },
  static: { c: [0x050508, 0x2a2a34, 0xff00ff, 0x00e5ff, 0xd0d0dc, 0xffffff], hi: 0xffffff, liquid: false },
};
export const GORE_PALETTES = Object.keys(PALS);

const A_EDGE = 200, A_BODY = 236, A_FULL = 250;

function disc(pc: PixelCanvas, cx: number, cy: number, r: number, c: number, a = A_BODY) {
  const r2 = r * r;
  for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
    if (dx * dx + dy * dy <= r2) over(pc, x, y, c, a);
  }
}

/** a drop that thins into a tail pointing back toward (ox, oy) */
function teardrop(pc: PixelCanvas, P: Pal, x: number, y: number, ox: number, oy: number, r: number, tail: number) {
  const dx = x - ox, dy = y - oy, l = Math.hypot(dx, dy) || 1;
  const ux = dx / l, uy = dy / l;
  for (let i = 0; i < tail; i++) {
    const t = i / Math.max(1, tail);
    over(pc, Math.round(x - ux * (r + i)), Math.round(y - uy * (r + i)), P.c[2], t < 0.5 ? A_BODY : A_EDGE);
  }
  disc(pc, x, y, r, P.c[3]);
  if (r >= 1.2) over(pc, Math.round(x - ux * 0.6 - 0.4), Math.round(y - uy * 0.6 - 0.4), P.hi, A_BODY);
}

/** irregular blob with dark rim, body and lit core */
function body(pc: PixelCanvas, P: Pal, cx: number, cy: number, rx: number, ry: number, seed: number, wob = 0.45) {
  for (let y = Math.floor(cy - ry - 3); y <= cy + ry + 3; y++) for (let x = Math.floor(cx - rx - 3); x <= cx + rx + 3; x++) {
    const m = blob(x, y, cx, cy, rx, ry, seed, wob);
    if (m <= 0) continue;
    let c = m < 0.14 ? P.c[1] : m < 0.4 ? P.c[2] : P.c[3];
    if (m > 0.55 && ph(x >> 1, y >> 1, seed) > 0.62) c = P.c[4];
    over(pc, x, y, c, m < 0.14 ? A_EDGE : A_BODY);
  }
}

/** dry debris: clumps (fluff), angular chips (plaster / fibreglass) or glitch blocks */
function debris(pc: PixelCanvas, P: Pal, kind: string, cx: number, cy: number, r: number, n: number, rng: Rng) {
  for (let i = 0; i < n; i++) {
    const a = rng.float(0, Math.PI * 2), d = Math.pow(rng.next(), 0.7) * r;
    const x = Math.round(cx + Math.cos(a) * d), y = Math.round(cy + Math.sin(a) * d * 0.9);
    if (kind === 'static') {
      const w = rng.chance(0.3) ? 4 : 2, h = rng.chance(0.2) ? 1 : 2;
      const c = P.c[rng.int(0, 5)];
      for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) over(pc, x + xx, y + yy, c, A_FULL);
    } else if (kind === 'fluff') {
      const s = rng.float(1.2, 2.6);
      disc(pc, x, y, s, P.c[3], A_BODY);
      disc(pc, x - 0.6, y - 0.6, s * 0.6, P.c[4], A_BODY);
      over(pc, x - 1, y - 1, P.c[5], A_FULL);
      over(pc, x + Math.round(s), y + Math.round(s * 0.5), P.c[1], A_EDGE);
    } else {
      // chip: small parallelogram, lit top-left edge, dark bottom-right
      const w = rng.int(1, 3), h = rng.int(1, 2), sk = rng.chance(0.5) ? 1 : 0;
      for (let yy = 0; yy <= h; yy++) for (let xx = 0; xx <= w; xx++) over(pc, x + xx + (yy ? sk : 0), y + yy, yy === 0 ? P.c[4] : xx === w ? P.c[1] : P.c[3], A_FULL);
    }
  }
}

function splat(pc: PixelCanvas, P: Pal, kind: string, rng: Rng, seed: number) {
  pc.wrap = false; pc.clear();
  const cx = 16 + rng.float(-1.5, 1.5), cy = 16 + rng.float(-1.5, 1.5);
  if (!P.liquid) {
    debris(pc, P, kind, cx, cy, 8, 10, rng);
    debris(pc, P, kind, cx, cy, 14, 12, rng);
    if (kind === 'plaster' || kind === 'shell') for (let i = 0; i < 40; i++) { const a = rng.float(0, 6.28), d = rng.float(3, 13); over(pc, Math.round(cx + Math.cos(a) * d), Math.round(cy + Math.sin(a) * d), P.c[2], 150); }
    return;
  }
  body(pc, P, cx, cy, rng.float(5.5, 7.5), rng.float(4.5, 6.5), seed);
  // radiating spatter: drops flung out of the impact, tails toward the centre
  const rays = rng.int(9, 14);
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2 + rng.float(-0.25, 0.25);
    const d = rng.float(8.5, 14.5);
    teardrop(pc, P, cx + Math.cos(a) * d, cy + Math.sin(a) * d, cx, cy, rng.float(0.6, 1.7), rng.int(1, 4));
    if (rng.chance(0.5)) disc(pc, cx + Math.cos(a) * (d - 3), cy + Math.sin(a) * (d - 3), rng.float(0.5, 1), P.c[2]);
  }
  for (let i = 0; i < 10; i++) { const a = rng.float(0, 6.28), d = rng.float(11, 15.5); over(pc, Math.round(cx + Math.cos(a) * d), Math.round(cy + Math.sin(a) * d), P.c[1], A_EDGE); }
  over(pc, Math.round(cx - 2), Math.round(cy - 2), P.hi, A_FULL); over(pc, Math.round(cx - 1), Math.round(cy - 2), P.hi, A_BODY);
}

/** directional spray (32x16): fan of elongated drops flying toward +x */
function spray(pc: PixelCanvas, P: Pal, kind: string, rng: Rng) {
  pc.wrap = false; pc.clear();
  if (!P.liquid) {
    for (let i = 0; i < 26; i++) debris(pc, P, kind, 4 + Math.pow(rng.next(), 0.8) * 26, 8 + rng.float(-5, 5), 0.5, 1, rng);
    return;
  }
  body(pc, P, 4.5, 8, 3.5, 3, 31, 0.3);
  for (let i = 0; i < 34; i++) {
    const t = Math.pow(rng.next(), 0.75);
    const x = 5 + t * 25, spread = 1.5 + t * 5.5;
    const y = 8 + rng.float(-spread, spread);
    teardrop(pc, P, x, y, x - 6, 8 + (y - 8) * 0.7, rng.float(0.5, 1.3 - t * 0.4), rng.int(1, 3 + Math.round(t * 3)));
  }
  over(pc, 3, 7, P.hi, A_FULL);
}

/** cast-off streak (32x8): a line flung off a blade, beading into drops */
function streak(pc: PixelCanvas, P: Pal, rng: Rng) {
  pc.wrap = false; pc.clear();
  let y = 4 + rng.float(-0.5, 0.5);
  for (let x = 1; x < 31; x++) {
    y += rng.float(-0.18, 0.18);
    const w = x < 18 ? 1.2 - x * 0.03 : 0.5;
    if (x > 20 && rng.chance(0.45)) continue;
    disc(pc, x, y, Math.max(0.55, w), x % 7 === 3 ? P.c[3] : P.c[2]);
    if (rng.chance(0.15)) disc(pc, x + rng.float(-1, 1), y + rng.float(-2.5, 2.5), 0.6, P.c[2]);
  }
  for (let i = 0; i < 5; i++) teardrop(pc, P, rng.float(6, 30), 4 + rng.float(-2.5, 2.5), 0, 4, rng.float(0.7, 1.4), 2);
}

function pool(pc: PixelCanvas, P: Pal, kind: string, rng: Rng) {
  pc.wrap = false; pc.clear();
  if (!P.liquid) {
    // heap of debris, densest in the middle
    debris(pc, P, kind, 16, 16, 6, 26, rng);
    debris(pc, P, kind, 16, 16, 12, 24, rng);
    debris(pc, P, kind, 16, 16, 15, 10, rng);
    return;
  }
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    let m = blob(x, y, 16, 16.5, 12, 10, 4, 0.35);
    m = Math.max(m, blob(x, y, 23, 10, 5, 4, 8) * 0.95, blob(x, y, 8, 23, 4.5, 3.5, 11) * 0.95, blob(x, y, 25, 22, 3.5, 3, 17) * 0.9);
    if (m <= 0) continue;
    // deep pools are darker in the middle (thickness), with a lighter wet ring
    let c = m < 0.1 ? P.c[1] : m < 0.22 ? P.c[3] : m < 0.6 ? P.c[2] : P.c[1];
    if (m > 0.3 && m < 0.6 && ph(x >> 1, y >> 1, 21) > 0.7) c = P.c[3];
    over(pc, x, y, c, m < 0.1 ? A_EDGE : A_FULL);
  }
  // glossy highlights from the ceiling lights
  for (const [x, y] of [[12, 12], [13, 12], [14, 12], [12, 13], [19, 17], [20, 17], [22, 8], [9, 22]]) over(pc, x, y, P.hi, A_FULL);
  for (const [x, y] of [[15, 13], [11, 14], [21, 18]]) over(pc, x, y, P.c[4], A_FULL);
  for (let i = 0; i < 7; i++) { const a = rng.float(0, 6.28), d = rng.float(13, 15.5); disc(pc, 16 + Math.cos(a) * d, 16 + Math.sin(a) * d, rng.float(0.5, 1.1), P.c[2]); }
}

function drops(pc: PixelCanvas, P: Pal, kind: string, rng: Rng) {
  pc.wrap = false; pc.clear();
  if (!P.liquid) { debris(pc, P, kind, 8, 8, 6, 7, rng); return; }
  const n = rng.int(4, 6);
  for (let i = 0; i < n; i++) {
    const x = rng.float(3, 13), y = rng.float(3, 13), r = rng.float(0.7, 1.9);
    disc(pc, x, y, r + 0.5, P.c[1], A_EDGE);
    disc(pc, x, y, r, P.c[3]);
    if (r > 1.2) over(pc, Math.round(x - 0.7), Math.round(y - 0.7), P.hi, A_FULL);
    // tiny crown of satellites around the bigger drops
    if (r > 1.4) for (let k = 0; k < 4; k++) { const a = rng.float(0, 6.28); over(pc, Math.round(x + Math.cos(a) * (r + 1.6)), Math.round(y + Math.sin(a) * (r + 1.6)), P.c[2], A_BODY); }
  }
}

/** wall splatter (32x32): the impact high up, runs dripping down (texture y down = down the wall) */
function wall(pc: PixelCanvas, P: Pal, kind: string, rng: Rng, seed: number) {
  pc.wrap = false; pc.clear();
  if (!P.liquid) { debris(pc, P, kind, 16, 12, 9, 22, rng); debris(pc, P, kind, 16, 12, 14, 10, rng); return; }
  const cx = 16, cy = 11;
  body(pc, P, cx, cy, rng.float(4.5, 6.5), rng.float(3.5, 5), seed, 0.5);
  for (let i = 0; i < 14; i++) {
    const a = rng.float(0, Math.PI * 2), d = rng.float(6, 13);
    teardrop(pc, P, cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8, cx, cy, rng.float(0.5, 1.4), rng.int(1, 3));
  }
  // runs: gravity pulls thin lines down from the heavy parts, beading at the end
  const runs = rng.int(4, 7);
  for (let i = 0; i < runs; i++) {
    let x = cx + rng.float(-5, 5);
    const y0 = cy + rng.float(0, 3), len = rng.float(6, 19);
    for (let y = y0; y < Math.min(30, y0 + len); y++) {
      if (rng.chance(0.08)) x += rng.chance(0.5) ? 1 : -1;
      over(pc, Math.round(x), Math.round(y), y < y0 + 2 ? P.c[3] : P.c[2], A_BODY);
    }
    disc(pc, x, Math.min(30, y0 + len), 1.1, P.c[3]);
  }
  over(pc, cx - 2, cy - 2, P.hi, A_FULL);
}

/** wall cast-off (32x16): a flung arc with short runs below it */
function wallSpray(pc: PixelCanvas, P: Pal, rng: Rng) {
  pc.wrap = false; pc.clear();
  for (let x = 1; x < 31; x++) {
    const y = 5 + Math.sin(x / 31 * Math.PI) * -2.5 + rng.float(-0.4, 0.4);
    if (x > 22 && rng.chance(0.5)) continue;
    disc(pc, x, y, x < 10 ? 1.1 : 0.7, P.c[3]);
    if (rng.chance(0.22)) {
      const len = rng.int(2, 8);
      for (let k = 1; k <= len; k++) over(pc, x, Math.round(y + k), P.c[2], A_BODY);
      disc(pc, x, y + len + 0.5, 0.8, P.c[3]);
    }
  }
}

/** drag smear (32x16) along +x: streaky, thinning out at the end */
function smear(pc: PixelCanvas, P: Pal, rng: Rng) {
  pc.wrap = false; pc.clear();
  const lanes = [4, 6, 7, 9, 10, 12];
  for (const ly of lanes) {
    const end = rng.int(18, 31), base = rng.chance(0.5) ? P.c[2] : P.c[1];
    for (let x = 1; x < end; x++) {
      const gap = x > end - 8 && rng.chance(0.4);
      if (gap) continue;
      over(pc, x, ly + (rng.chance(0.15) ? 1 : 0), x < 6 ? P.c[3] : base, x > end - 5 ? A_EDGE : A_BODY);
    }
  }
  for (let y = 3; y < 13; y++) for (let x = 1; x < 6; x++) if (blob(x, y, 3.5, 8, 3.5, 5, 9) > 0) over(pc, x, y, P.c[3], A_BODY);
  for (let x = 2; x < 20; x += 3) over(pc, x, 8, P.hi, 180);
}

/** one bloody shoe print (8x16), toe at the top; strong or fading */
function print(pc: PixelCanvas, P: Pal, faint: boolean) {
  pc.wrap = false; pc.clear();
  const sole = ['.####.', '######', '##.###', '######', '###.##', '######', '.#####', '..####', '..###.', '......', '.####.', '######', '##.###', '.####.'];
  for (let j = 0; j < sole.length; j++) for (let i = 0; i < 6; i++) {
    if (sole[j][i] !== '#') continue;
    const h = ph(i, j, faint ? 41 : 40);
    if (faint && h < 0.45) continue;
    if (!faint && h < 0.08) continue;
    over(pc, i + 1, j + 1, h > 0.8 ? P.c[3] : P.c[2], faint ? 170 : A_BODY);
  }
}

function stump(pc: PixelCanvas) {
  pc.wrap = false;
  const R = PALS.red.c;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const d = Math.hypot(x + 0.5 - 4, y + 0.5 - 4);
    pc.set(x, y, d < 1.4 ? 0xe8dcc8 : d < 2 ? 0xb8a890 : d < 3 ? (ph(x, y, 3) > 0.5 ? R[4] : R[3]) : R[2]);
  }
  pc.set(3, 3, 0xfff4e4); pc.set(6, 1, R[5]); pc.set(1, 6, R[1]);
}

function flesh(pc: PixelCanvas) {
  const R = PALS.red.c;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const v = ph(x >> 1, y, 5);
    pc.set(x, y, v > 0.78 ? 0xd8b8a0 : v > 0.5 ? R[4] : v > 0.2 ? R[3] : R[2]); // marbled fat
  }
  pc.set(2, 2, R[5]); pc.set(5, 6, R[1]);
}

function bone(pc: PixelCanvas) {
  const C = [0x8a7c66, 0xb8aa90, 0xd8ccb4, 0xece2cc];
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) pc.set(x, y, C[x === 0 || y === 7 ? 1 : x === 7 ? 0 : ph(x, y, 6) > 0.7 ? 3 : 2]);
  pc.set(3, 4, 0x6a1012); pc.set(4, 4, 0x8a1a1c);
}

function fluffBits(pc: PixelCanvas) {
  const C = PALS.fluff.c;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) pc.set(x, y, C[2 + Math.floor(ph(x >> 1, y >> 1, 8) * 4)]);
  pc.set(1, 1, 0xffffff); pc.set(5, 4, C[1]);
}

function staticBits(pc: PixelCanvas) {
  const C = PALS.static.c;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const v = ph(x >> 1, y, 9); pc.set(x, y, v < 0.35 ? C[0] : v < 0.55 ? C[2] : v < 0.75 ? C[3] : C[5]); }
}

function chipBits(pc: PixelCanvas, P: Pal) {
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) pc.set(x, y, P.c[y === 0 ? 5 : x === 7 || y === 7 ? 1 : 2 + Math.floor(ph(x, y, 10) * 3)]);
}

addTextureModule(() => {
  const A = atlas();
  for (const k of GORE_PALETTES) {
    const P = PALS[k];
    A.add(`gore_${k}_splat_a`, 32, 32, (pc, rng) => splat(pc, P, k, rng, 3));
    A.add(`gore_${k}_splat_b`, 32, 32, (pc, rng) => splat(pc, P, k, rng, 13));
    A.add(`gore_${k}_spray`, 32, 16, (pc, rng) => spray(pc, P, k, rng));
    A.add(`gore_${k}_pool`, 32, 32, (pc, rng) => pool(pc, P, k, rng));
    A.add(`gore_${k}_drops`, 16, 16, (pc, rng) => drops(pc, P, k, rng));
    A.add(`gore_${k}_wall`, 32, 32, (pc, rng) => wall(pc, P, k, rng, 23));
    if (P.liquid) {
      A.add(`gore_${k}_streak`, 32, 8, (pc, rng) => streak(pc, P, rng));
      A.add(`gore_${k}_wallspray`, 32, 16, (pc, rng) => wallSpray(pc, P, rng));
      A.add(`gore_${k}_smear`, 32, 16, (pc, rng) => smear(pc, P, rng));
    }
  }
  A.add('gore_print_a', 8, 16, (pc) => print(pc, PALS.red, false));
  A.add('gore_print_b', 8, 16, (pc) => print(pc, PALS.red, true));
  A.add('gore_stump', 8, 8, (pc) => stump(pc));
  A.add('gore_flesh', 8, 8, (pc) => flesh(pc));
  A.add('gore_bone', 8, 8, (pc) => bone(pc));
  A.add('gore_fluff_bits', 8, 8, (pc) => fluffBits(pc));
  A.add('gore_static_bits', 8, 8, (pc) => staticBits(pc));
  A.add('gore_plaster_bits', 8, 8, (pc) => chipBits(pc, PALS.plaster));
  A.add('gore_shell_bits', 8, 8, (pc) => chipBits(pc, PALS.shell));
  A.add('gore_glass_bits', 8, 8, (pc) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) pc.set(x, y, (x + y) % 5 === 0 ? 0xf0f8ff : ph(x, y, 12) > 0.5 ? 0xa8c8d8 : 0x7898a8); });
});
