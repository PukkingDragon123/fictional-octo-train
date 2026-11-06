// The Ball House (src/world/gen/z_ballhouse.ts): a kids' indoor play-place
// that goes on too long. Floors (the arcade carpet with its faded confetti
// shapes, foam puzzle mats, ball pits packed to the brim, party-room vinyl),
// padded vinyl wallpapers in faded primaries, safety netting and padded
// bolsters, and the fixtures: the ball-pit fill (a ball surface you wade
// through, with things in it), play-frame towers, wave slides, overhead crawl
// tubes with bubble windows, net bridges, soft-play foam blocks, party tables
// with a stale cake, ceiling balloons, the prize counter and its candy jars,
// shoe cubbies, the height giraffe and the rules board. Prefix: bx_.
import { defObj } from '../../world/objects';
import { defFloor, defWall, wallpaperId } from '../../world/defs';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { WALL_PX } from '../../gfx/textures/lobby';
import { makeRamp, mixHex, ph, tileFbm, textC, text, rod } from './b_common';
import type { PixelCanvas } from '../../gfx/pixel';
import type { ModelBuilder } from '../../gfx/modelBuilder';
import { blob, tube, surf, lathe, type V3 } from '../../creatures/kit/anomalies';
import { FLOOR_GLOSS } from '../../gfx/wetmap';

const T = ['bx', 'ballhouse', 'kids'];
/** the play-place's primaries, faded by decades of fluorescent light */
export const BX = { red: 0xd8584a, blue: 0x4a7ad0, yellow: 0xf0c84a, green: 0x5ab06a, purple: 0x9a72c8, orange: 0xf08a3a, pink: 0xf08ab0, white: 0xf4f0e8, teal: 0x4ab8b0 };
const PRIM = [BX.red, BX.blue, BX.yellow, BX.green];
const BALLS = [BX.red, BX.blue, BX.yellow, BX.green, BX.red, BX.blue, BX.yellow, BX.purple, BX.orange, BX.white];

// ---------------------------------------------------------------- floors, walls
defFloor({ key: 'bx_carpet', name: 'Arcade Carpet', tex: ['bx_carpet', 'bx_carpet_b', 'bx_carpet_c'], sound: 'carpet', flammable: 0.5, rotate: true });
defFloor({ key: 'bx_mat', name: 'Foam Play Mats', tex: ['bx_mat', 'bx_mat_b'], sound: 'carpet', rotate: true });
defFloor({ key: 'bx_pit', name: 'Ball Pit', tex: ['bx_pit', 'bx_pit_b'], sound: 'gravel', slow: 0.55, rotate: true, side: 'bx_pit_side' });
defFloor({ key: 'bx_tile', name: 'Party Room Vinyl', tex: ['bx_tile'], sound: 'linoleum' });
FLOOR_GLOSS.bx_tile = 0.3; FLOOR_GLOSS.bx_pit = 0.22; FLOOR_GLOSS.bx_mat = 0.12;
defWall({ key: 'bx_net', name: 'Safety Netting', tex: 'bx_net', top: 'bx_pad_top', height: 2.3, thick: 0.05, hp: 90, seeThrough: true, sound: 'drywall', noWallpaper: true, alpha: true });
defWall({ key: 'bx_pad', name: 'Padded Bolster', tex: 'bx_pad_side', top: 'bx_pad_top', height: 0.6, thick: 0.3, hp: 300, low: true, sound: 'drywall', noWallpaper: true });
/** the Ball House's wallpapers (z_ballhouse.ts papers its rooms with these) */
export const BX_PAPERS = { party: 'bx_paper_party', mural: 'bx_paper_mural', red: 'bx_vinyl_r', blue: 'bx_vinyl_b', yellow: 'bx_vinyl_y', green: 'bx_vinyl_g' };
for (const p of Object.values(BX_PAPERS)) wallpaperId(p);

// ---------------------------------------------------------------- textures
/** the arcade carpet: a deep, slightly faded blue with confetti shapes in old primaries */
function arcadeCarpet(pc: PixelCanvas, v: number) {
  const W = pc.w, H = pc.h;
  const B = makeRamp(0x3a4a9a, 6, { spread: 0.35, hueShift: 0.03 });
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const m = tileFbm(x, y, W, H, 4, 2, 901 + v) * 0.6 + ph(x, y, 903 + v) * 0.4;
    pc.set(x, y, B[m < 0.35 ? 1 : m < 0.6 ? 2 : m < 0.85 ? 3 : 4]);
  }
  const cols = [0xe86a5a, 0xf2d05a, 0x5ac8c0, 0xb07ae0, 0xf4f0e8, 0x8ad86a];
  const shapes = 9 + v * 2;
  for (let i = 0; i < shapes; i++) {
    const cx = Math.floor(ph(i, 1, 911 + v) * W), cy = Math.floor(ph(i, 2, 911 + v) * H), c = cols[(i + v) % cols.length], k = (i + v) % 4;
    const S = (x: number, y: number) => pc.set(((x % W) + W) % W, ((y % H) + H) % H, c);
    if (k === 0) { for (let t = 0; t < 7; t++) S(cx + t, cy + Math.round(Math.sin(t * 1.2) * 1.5)); }                      // squiggle
    else if (k === 1) { for (let j = 0; j < 3; j++) for (let t = -j; t <= j; t++) S(cx + t, cy + j); }                           // triangle
    else if (k === 2) { for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [-1, 1]]) S(cx + dx, cy + dy); }       // ring
    else { for (let t = 0; t < 5; t++) S(cx + t, cy + (t & 1)); }                                                                // zigzag
  }
  // worn paths, a sticky spot
  for (let i = 0; i < 6; i++) pc.blend(Math.floor(ph(i, 5, 921 + v) * W), Math.floor(ph(i, 6, 921 + v) * H), 0x8a8ac0, 0.3);
  if (v === 2) pc.stain(16, 16, 5, 0x5a3a6a, 0x3a2a4a, 931);
}
/** foam puzzle mats: four big interlocking squares per tile, dimpled */
function foamMats(pc: PixelCanvas, v: number) {
  const W = pc.w, H = pc.h, cols = v ? [BX.green, BX.yellow, BX.blue, BX.red] : [BX.red, BX.blue, BX.yellow, BX.green];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const qx = x < W / 2 ? 0 : 1, qy = y < H / 2 ? 0 : 1, lx = x % (W / 2), ly = y % (H / 2);
    // puzzle teeth along the seams
    const tooth = (u: number) => Math.floor(u / 4) % 2;
    let q = qy * 2 + qx;
    if (lx < 2 && tooth(ly) && qx === 1) q = qy * 2;
    if (ly < 2 && tooth(lx) && qy === 1) q = qx;
    const R = makeRamp(cols[q], 5, { spread: 0.32 });
    let i = 2 + (ph(x, y, 941 + v) < 0.25 ? 1 : 0) - (((x + y) % 5 === 0) ? 1 : 0);
    if (lx === 0 || ly === 0) i = 0;
    pc.set(x, y, R[Math.max(0, Math.min(4, i))]);
  }
  for (let i = 0; i < 5; i++) pc.blend(Math.floor(ph(i, 1, 951 + v) * W), Math.floor(ph(i, 2, 951 + v) * H), 0x6a6a7a, 0.25);
}
/** the ball pit's surface: plastic balls packed shoulder to shoulder */
function ballPit(pc: PixelCanvas, v: number) {
  const W = pc.w, H = pc.h;
  pc.fill(0x2a2a3a);
  const r = 3.1;
  for (let row = -1; row < H / 5 + 1; row++) for (let col = -1; col < W / 6 + 1; col++) {
    const cx = col * 6 + (row & 1 ? 3 : 0) + (ph(col, row, 961 + v) - 0.5) * 1.6, cy = row * 5.2 + (ph(row, col, 962 + v) - 0.5) * 1.4;
    const base = BALLS[Math.floor(ph(col * 7 + v, row * 3, 963) * BALLS.length)];
    const R = makeRamp(base, 5, { spread: 0.45 });
    for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy) / r;
      if (d > 1) continue;
      const l = 2.6 - d * 1.6 - (dx + dy) * 0.18;
      pc.set(((x % W) + W) % W, ((y % H) + H) % H, R[Math.max(0, Math.min(4, Math.round(l)))]);
    }
    pc.set(((Math.round(cx - 1) % W) + W) % W, ((Math.round(cy - 1) % H) + H) % H, 0xffffff);
  }
}
/** padded vinyl: quilted squares with a button at each corner, scuffed low down where the kids kick */
function vinyl(pc: PixelCanvas, base: number, seed: number, wall: boolean) {
  const W = pc.w, H = pc.h, R = makeRamp(base, 6, { spread: 0.4, hueShift: 0.03 });
  const cell = 16;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const lx = x % cell, ly = y % cell, ex = Math.min(lx, cell - 1 - lx), ey = Math.min(ly, cell - 1 - ly);
    const puff = Math.min(ex, ey) / (cell / 2);
    let l = 1.6 + puff * 2.6 - (lx < 1 || ly < 1 ? 1.2 : 0) + (tileFbm(x, y, W, H, 3, 2, seed) - 0.5) * 0.6;
    if (wall && y > H - 22) l -= 0.25;
    pc.set(x, y, R[Math.max(0, Math.min(5, Math.round(l)))]);
    if (lx === 0 && ly === 0) pc.set(x, y, R[0]);
  }
  if (wall) {
    // scuffs and sock marks low down, a crayon line, a sticker
    for (let i = 0; i < 9; i++) { const x = Math.floor(ph(i, 1, seed) * W), y = H - 8 - Math.floor(ph(i, 2, seed) * 20); pc.blend(x, y, 0x3a3a40, 0.35); pc.blend(x + 1, y, 0x3a3a40, 0.25); }
    for (let x = 4; x < 20; x++) pc.blend(x, H - 30 + Math.round(Math.sin(x * 0.8 + seed) * 2), 0x2a6ad8, 0.6);
    pc.ellipseBlend(24, H - 40, 2, 2, 0xffe03a, 0.8);
    // skirting
    for (let y = H - 5; y < H; y++) for (let x = 0; x < W; x++) pc.set(x, y, y === H - 5 ? R[5] : R[1]);
  }
}
/** party-room wallpaper: balloons and stars on cream, a painted dado, crayon at kid height */
function partyPaper(pc: PixelCanvas) {
  const W = pc.w, H = pc.h, FLOOR = H - 5;
  const R = makeRamp(0xf4ecd0, 5, { spread: 0.25 });
  pc.fillRamp(R, (x, y) => 0.62 + (tileFbm(x, y, W, H, 3, 2, 971) - 0.5) * 0.12, 0.5);
  const cols = [0xe8705a, 0x5a8ae0, 0xf2c84a, 0x6ac07a, 0xb07ae0];
  for (let i = 0; i < 6; i++) {
    const cx = 4 + (i % 3) * 11 + (Math.floor(i / 3) % 2) * 5, cy = 8 + Math.floor(i / 3) * 24;
    const c = cols[i % cols.length];
    pc.ellipseBlend(cx, cy, 3, 4, c, 0.85, false); pc.set(cx - 1, cy - 2, 0xffffff);
    for (let t = 0; t < 7; t++) pc.set(cx + Math.round(Math.sin(t * 0.9) * 1), cy + 4 + t, 0x8a8070);
  }
  for (let i = 0; i < 8; i++) { const x = Math.floor(ph(i, 1, 973) * W), y = Math.floor(ph(i, 2, 973) * (FLOOR - 32)); pc.set(x, y, 0xf2c84a); pc.set(x + 1, y, 0xf2c84a); pc.set(x, y + 1, 0xf2c84a); pc.set(x - 1, y, 0xf2c84a); pc.set(x, y - 1, 0xf2c84a); }
  // the dado: a band of painted primary stripes, then wipe-clean paint below
  for (let y = FLOOR - 30; y < FLOOR; y++) for (let x = 0; x < W; x++) {
    if (y < FLOOR - 26) pc.set(x, y, cols[Math.floor(x / 8) % 4]);
    else pc.set(x, y, mixHex(0x9ad0e0, 0x7ab0c8, ph(x >> 1, y >> 1, 975) * 0.5));
  }
  for (let x = 0; x < W; x++) { pc.set(x, FLOOR - 26, 0xffffff); pc.set(x, FLOOR - 31, 0x5a5048); }
  // a small handprint and a scribble
  pc.ellipseBlend(9, FLOOR - 14, 2, 2, 0xd8584a, 0.6);
  for (const [dx, dy] of [[-2, -3], [-1, -4], [0, -4], [1, -4], [2, -2]]) pc.blend(9 + dx, FLOOR - 14 + dy, 0xd8584a, 0.6);
  for (let x = 16; x < 28; x++) pc.blend(x, FLOOR - 18 + Math.round(Math.sin(x * 1.3) * 2), 0x2a2a2a, 0.5);
  for (let y = FLOOR; y < H; y++) for (let x = 0; x < W; x++) pc.set(x, y, y === FLOOR ? 0xf4f0e8 : 0x8a7a68);
}
/** the mural: sky blue, clouds, a rainbow, faded to chalk where the sun never was */
function muralPaper(pc: PixelCanvas) {
  const W = pc.w, H = pc.h, FLOOR = H - 5;
  const S = makeRamp(0x8ac8f0, 5, { spread: 0.3 });
  pc.fillRamp(S, (x, y) => 0.75 - (y / H) * 0.35 + (tileFbm(x, y, W, H, 3, 2, 981) - 0.5) * 0.12, 0.5);
  const rb = [0xe8705a, 0xf09a4a, 0xf2d05a, 0x6ac07a, 0x5a8ae0, 0x9a72c8];
  rb.forEach((c, i) => { for (let x = 0; x < W; x++) { const y = 26 + i * 2 + Math.round(Math.sin((x / W) * Math.PI * 2) * 6); pc.set(x, y, c); pc.set(x, y + 1, c); } });
  for (const [cx, cy] of [[8, 12], [24, 48]]) for (const [dx, dy, r] of [[0, 0, 4], [4, -1, 3], [-4, 1, 3], [2, 2, 3]]) pc.ellipseBlend(cx + dx, cy + dy, r, r * 0.7, 0xffffff, 0.9, false);
  for (let y = FLOOR - 18; y < FLOOR; y++) for (let x = 0; x < W; x++) pc.set(x, y, mixHex(0x7ac06a, 0x5aa05a, ph(x >> 1, y >> 1, 983) * 0.6));
  for (let y = FLOOR; y < H; y++) for (let x = 0; x < W; x++) pc.set(x, y, y === FLOOR ? 0xf4f0e8 : 0x6a7a58);
}
/** safety netting: knotted diamond mesh, white with a red edge rope (transparent between) */
function netTex(pc: PixelCanvas) {
  pc.clear();
  const W = pc.w, H = pc.h, s = 6;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const a = ((x + y) % s + s) % s, b = ((x - y) % s + s) % s;
    if (a === 0 || b === 0) pc.set(x, y, ph(x, y, 991) < 0.15 ? 0xc8c4bc : 0xeeeae2, 255);
  }
  for (let x = 0; x < W; x++) { pc.set(x, 0, 0xd8584a); pc.set(x, 1, 0xb8483a); pc.set(x, H - 1, 0xb8483a); pc.set(x, H - 2, 0xd8584a); }
}

addTextureModule(() => {
  const A = atlas();
  A.add('bx_carpet', 32, 32, (pc) => arcadeCarpet(pc, 0));
  A.add('bx_carpet_b', 32, 32, (pc) => arcadeCarpet(pc, 1));
  A.add('bx_carpet_c', 32, 32, (pc) => arcadeCarpet(pc, 2));
  A.add('bx_mat', 32, 32, (pc) => foamMats(pc, 0));
  A.add('bx_mat_b', 32, 32, (pc) => foamMats(pc, 1));
  A.add('bx_pit', 32, 32, (pc) => ballPit(pc, 0));
  A.add('bx_pit_b', 32, 32, (pc) => ballPit(pc, 1));
  A.add('bx_pit_side', 16, 16, (pc) => vinyl(pc, BX.blue, 1001, false));
  A.add('bx_tile', 32, 32, (pc) => {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const q = ((x >> 3) + (y >> 3)) & 1;
      const R = makeRamp(q ? 0x8ad0c8 : 0xf0e8d0, 4, { spread: 0.2 });
      pc.set(x, y, R[(x & 7) === 0 || (y & 7) === 0 ? 0 : 2 - (ph(x, y, 1011) < 0.12 ? 1 : 0)]);
    }
    for (let i = 0; i < 6; i++) pc.set(Math.floor(ph(i, 1, 1013) * 32), Math.floor(ph(i, 2, 1013) * 32), [0xe8705a, 0x5a8ae0, 0xf2c84a][i % 3]);
  });
  A.add('bx_net', 32, 64, netTex, 1, 2.3);
  A.add('bx_pad_side', 32, 20, (pc) => vinyl(pc, BX.red, 1021, false), 1, 0.6);
  A.add('bx_pad_top', 16, 16, (pc) => vinyl(pc, BX.yellow, 1023, false));
  A.add('bx_paper_party', 32, WALL_PX, partyPaper, 1, 2.7);
  A.add('bx_paper_mural', 32, WALL_PX, muralPaper, 1, 2.7);
  A.add('bx_vinyl_r', 32, WALL_PX, (pc) => vinyl(pc, BX.red, 1031, true), 1, 2.7);
  A.add('bx_vinyl_b', 32, WALL_PX, (pc) => vinyl(pc, BX.blue, 1033, true), 1, 2.7);
  A.add('bx_vinyl_y', 32, WALL_PX, (pc) => vinyl(pc, BX.yellow, 1035, true), 1, 2.7);
  A.add('bx_vinyl_g', 32, WALL_PX, (pc) => vinyl(pc, BX.green, 1037, true), 1, 2.7);
  // object surfaces (tinted by vertex colour)
  A.add('bx_vinyl', 16, 16, (pc) => vinyl(pc, 0xf0f0f0, 1041, false));
  A.add('bx_ball', 8, 8, (pc) => { const R = makeRamp(0xe8e8e8, 4, { spread: 0.35 }); pc.each((x, y) => pc.set(x, y, R[Math.max(0, Math.min(3, Math.round(2.6 - Math.hypot(x - 2.5, y - 2.5) * 0.45)))])); pc.set(2, 2, 0xffffff); });
  A.add('bx_foam', 16, 16, (pc) => { const R = makeRamp(0xf0f0f0, 4, { spread: 0.3 }); pc.each((x, y) => pc.set(x, y, R[2 - (ph(x, y, 1051) < 0.2 ? 1 : 0) + (ph(x >> 2, y >> 2, 1052) < 0.15 ? 1 : 0)])); });
  A.add('bx_plastic', 16, 16, (pc) => { const R = makeRamp(0xf0f0f0, 4, { spread: 0.25 }); pc.each((x, y) => pc.set(x, y, R[2 + (y < 2 ? 1 : 0) - (ph(x, y, 1061) < 0.05 ? 1 : 0)])); });
  A.add('bx_cloth', 32, 16, (pc) => {
    pc.fill(0xf4f0f4);
    for (let i = 0; i < 18; i++) { const x = Math.floor(ph(i, 1, 1071) * 32), y = Math.floor(ph(i, 2, 1071) * 16), c = [0xe8705a, 0x5a8ae0, 0xf2c84a, 0x6ac07a, 0xb07ae0][i % 5]; pc.ellipseBlend(x, y, 1.6, 1.6, c, 0.9, false); }
    for (let x = 0; x < 32; x++) { pc.set(x, 15, 0xe0dce0); if (x % 4 === 0) pc.set(x, 14, 0xd8d4d8); }
    pc.stain(22, 8, 3, 0xc89aa0, 0xa87a80, 1073);
  });
  // the cake: icing gone grey and furred, a slice gone
  A.add('bx_cake_top', 16, 16, (pc) => { pc.each((x, y) => pc.set(x, y, ph(x, y, 1081) < 0.3 ? 0xd8d0c0 : 0xe8e0d0)); for (let i = 0; i < 7; i++) pc.ellipseBlend(ph(i, 1, 1083) * 16, ph(i, 2, 1083) * 16, 1.6, 1.4, i % 2 ? 0x8aa86a : 0x6a8a5a, 0.85, false); for (let x = 3; x < 13; x++) pc.set(x, 7 + Math.round(Math.sin(x)), 0xd8584a); });
  A.add('bx_cake_side', 16, 8, (pc) => { pc.each((x, y) => pc.set(x, y, y < 2 ? 0xe8e0d0 : y === 4 ? 0xd8584a : ph(x, y, 1085) < 0.2 ? 0x8a6a4a : 0xc8a878)); for (let x = 0; x < 16; x += 3) pc.set(x, 1, 0x8aa86a); });
  // the prize wall: a pegboard full of plush, slinkies, rubber ducks, inflatable hammers
  A.add('bx_prizes', 48, 32, (pc) => {
    pc.fill(0xd8c8a0);
    for (let y = 2; y < 32; y += 4) for (let x = 2; x < 48; x += 4) pc.set(x, y, 0x8a7a5a);
    const cols = [0xe8705a, 0x5a8ae0, 0xf2c84a, 0x6ac07a, 0xb07ae0, 0xf08ab0];
    for (let i = 0; i < 14; i++) { const x = 3 + (i % 7) * 6.5, y = 5 + Math.floor(i / 7) * 14, c = cols[i % cols.length]; if (i % 3 === 0) { pc.ellipse(x, y, 2.5, 3, c); pc.ellipse(x, y - 4, 2, 2, c); pc.set(x - 1, y - 4, 0x101010); pc.set(x + 1, y - 4, 0x101010); } else if (i % 3 === 1) { for (let k = 0; k < 6; k++) pc.hline(x - 2, x + 2, y - 3 + k, k % 2 ? c : 0xe8e8e8); } else { pc.ellipse(x, y, 2.2, 2, 0xf2d84a); pc.set(x + 2, y - 1, 0xf08a3a); pc.set(x - 1, y - 1, 0x101010); } }
    textC(pc, 'PRIZES', 24, 26, 0xd8584a);
  });
  A.add('bx_glass', 16, 16, (pc) => { pc.fill(0xc8e0e8); for (let i = 0; i < 16; i++) pc.set(i, i, 0xf4ffff); for (let i = 0; i < 12; i++) pc.set(i + 3, i, 0xe8f8ff); }, 1, 1);
  A.add('bx_rules', 48, 40, (pc) => {
    pc.fill(0xf4f0e0);
    for (let x = 0; x < 48; x++) { pc.set(x, 0, 0xd8584a); pc.set(x, 1, 0xd8584a); pc.set(x, 39, 0xd8584a); }
    for (let y = 0; y < 40; y++) { pc.set(0, y, 0xd8584a); pc.set(47, y, 0xd8584a); }
    pc.rect(1, 2, 46, 8, 0x4a7ad0);
    textC(pc, 'BALL HOUSE', 24, 3, 0xffffff);
    const L = ['SOCKS ONLY', 'NO PUSHING', 'NO FOOD IN PIT', 'STAY WITH CHILD', 'PICK UP BY 8PM'];
    L.forEach((l, i) => { text(pc, l, 4, 12 + i * 5.4, i === 4 ? 0xd8584a : 0x2a2a3a); });
  });
  A.add('bx_giraffe', 16, 64, (pc) => {
    pc.clear();
    for (let y = 8; y < 64; y++) for (let x = 5; x < 11; x++) pc.set(x, y, (Math.floor(x / 2) + Math.floor(y / 4)) % 3 === 0 ? 0xb8783a : 0xf2c84a);
    pc.ellipse(8, 6, 5, 4, 0xf2c84a); pc.set(6, 5, 0x101010); pc.set(10, 5, 0x101010); pc.set(5, 1, 0x8a5a2a); pc.set(11, 1, 0x8a5a2a);
    for (let y = 12; y < 62; y += 6) { pc.hline(11, 14, y, 0x2a2a3a); }
    for (let x = 11; x < 16; x++) pc.set(x, 30, 0xd8584a);
  }, 0.4, 1.6);
  // decals: confetti, candy shrapnel, a spilt juice
  A.add('bx_confetti', 32, 32, (pc) => {
    pc.wrap = false; pc.clear();
    const cols = [0xff2a4a, 0xffd21a, 0x2a8aff, 0x3ad84a, 0xff6ad8, 0xff8a1a, 0xffffff, 0x8a5aff];
    for (let i = 0; i < 90; i++) { const a = ph(i, 1, 1101) * Math.PI * 2, r = Math.pow(ph(i, 2, 1101), 0.7) * 14, x = 16 + Math.cos(a) * r, y = 16 + Math.sin(a) * r; pc.set(x, y, cols[i % cols.length], 245); if (i % 3 === 0) pc.set(x + 1, y, cols[i % cols.length], 245); }
  });
  A.add('bx_candy_bits', 32, 32, (pc) => {
    pc.wrap = false; pc.clear();
    const cols = [0xff3a6a, 0xffe03a, 0x4ab8ff, 0x6ae05a, 0xf4f0ff, 0xc85aff];
    for (let i = 0; i < 26; i++) { const a = ph(i, 3, 1103) * Math.PI * 2, r = Math.pow(ph(i, 4, 1103), 0.6) * 13, x = 16 + Math.cos(a) * r, y = 16 + Math.sin(a) * r, c = cols[i % cols.length]; pc.set(x, y, c, 250); pc.set(x + 1, y, c, 250); pc.set(x, y + 1, mixHex(c, 0x000000, 0.25), 250); }
    for (let i = 0; i < 8; i++) pc.set(16 + (ph(i, 5, 1105) - 0.5) * 20, 16 + (ph(i, 6, 1105) - 0.5) * 20, 0x7a1018, 200);
  });
  A.add('bx_juice', 32, 32, (pc) => { pc.wrap = false; pc.clear(); for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const d = Math.hypot(x - 16, (y - 16) * 1.3) + Math.sin(Math.atan2(y - 16, x - 16) * 4) * 2; if (d < 11) pc.set(x, y, d > 9.5 ? 0xa04a6a : 0xc85a7a, d > 9.5 ? 150 : 110); } });
});

// ---------------------------------------------------------------- the fixtures
const P = (x: number, y: number, z: number): V3 => [x, y, z];
/** a pit ball: a low-poly plastic sphere */
function ball(mb: ModelBuilder, x: number, y: number, z: number, r: number, c: number) { mb.sphere(x, y, z, r, 6, 4, 'bx_ball', { fit: true, color: c }); }
/** a soft rounded bolster between two points */
function bolster(mb: ModelBuilder, a: V3, b: V3, r: number, c: number) { tube(mb, [a, b], r, 8, 'bx_vinyl', { color: c, capStart: true, capEnd: true }); }

defObj({
  key: 'bx_ballfill', name: 'Ball Pit', w: 2, d: 2, height: 0.48, block: 'none', movable: 0, hp: 99999, sound: 'plastic', noShadow: true,
  container: { capacity: 4, kind: 'pile', name: 'Ball Pit', loot: 'bx_pit' },
  tags: [...T, 'fixed', 'floor', 'pit'],
  desc: 'Plastic balls, packed to the brim, faded to the colours of old sweets. You can not see the bottom. Something under there is warm.',
  variant: (s) => String((s.v ?? 0) % 8),
  model: (mb, s) => {
    const v = (s.v ?? 0) % 8;
    // the surface you wade through: just below the rim, packed solid (what is under it stays under it)
    mb.flat(0, 0.39, 0, 2, 2, 'bx_pit', { color: 0xffffff, fit: false });
    let k = 0;
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
      const h = Math.sin(i * 7.3 + j * 3.1 + v) * 0.5 + 0.5;
      if (h < 0.18) continue;
      const x = -0.8 + i * 0.4 + (Math.sin(i * 3.7 + j + v) * 0.12), z = -0.8 + j * 0.4 + (Math.cos(j * 2.9 + i + v) * 0.12);
      ball(mb, x, 0.4 + h * 0.03, z, 0.075, BALLS[(i * 3 + j * 7 + v) % BALLS.length]);
      if (h > 0.7) ball(mb, x + 0.07, 0.48, z - 0.05, 0.075, BALLS[(k++ + v * 3) % BALLS.length]);
    }
    // and what is in the pit
    if (v === 5) { // a small sneaker, sole up
      mb.push(); mb.translate(0.25, 0.42, -0.1); mb.rotateZ(Math.PI * 0.9); mb.rotateY(0.6);
      mb.box(0, -0.02, 0, 0.07, 0.04, 0.16, 'bx_vinyl', { color: BX.red }); mb.box(0, -0.035, 0, 0.075, 0.015, 0.17, 'white', { color: 0xf0ece4 });
      mb.pop();
    } else if (v === 6) { // a hand, reaching up out of the balls, very still
      tube(mb, [P(-0.2, 0.3, 0.15), P(-0.21, 0.46, 0.16), P(-0.2, 0.56, 0.15)], 0.024, 6, 'white', { color: 0xf0c4a2 });
      blob(mb, [-0.2, 0.6, 0.15], [0.03, 0.035, 0.016], 7, 4, 'white', { color: 0xf0c4a2 });
      for (let f = 0; f < 4; f++) tube(mb, [P(-0.225 + f * 0.016, 0.62, 0.15), P(-0.228 + f * 0.017, 0.67 - Math.abs(f - 1.5) * 0.008, 0.155)], 0.006, 4, 'white', { color: 0xf0c4a2, capEnd: true });
    } else if (v === 7) { // a lollipop stick, a juice box
      rod(mb, 0.3, 0.38, 0.3, 0.36, 0.52, 0.28, 0.006, 4, 'white', { color: 0xf4f0e8 });
      mb.box(-0.3, 0.38, -0.3, 0.07, 0.1, 0.045, 'bx_plastic', { color: BX.purple });
    }
  },
});
defObj({
  key: 'bx_tower', name: 'Play Frame Tower', w: 2, d: 2, height: 2.7, block: 'solid', tall: true, movable: 0, hp: 2500, sound: 'plastic',
  tags: [...T, 'fixed', 'playframe'],
  desc: 'A padded tower of the play frame: a deck at shoulder height, nets, a little roof like a circus tent. There are small handprints all the way up the posts.',
  variant: (s) => String((s.v ?? 0) % 4),
  model: (mb, s) => {
    const v = (s.v ?? 0) % 4, pc = PRIM[v], rc = PRIM[(v + 1) % 4];
    for (const [x, z] of [[-0.85, -0.85], [0.85, -0.85], [-0.85, 0.85], [0.85, 0.85]]) {
      mb.cylinder(x, 0, z, 0.1, 2.25, 10, 'bx_vinyl', { color: pc });
      mb.sphere(x, 2.32, z, 0.13, 8, 6, 'bx_ball', { fit: true, color: BX.yellow });
    }
    // the deck, padded, with a bolster rim
    mb.box(0, 1.15, 0, 1.8, 0.14, 1.8, 'bx_vinyl', { color: BX.blue });
    for (const [a, b] of [[P(-0.85, 1.32, -0.85), P(0.85, 1.32, -0.85)], [P(-0.85, 1.32, -0.85), P(-0.85, 1.32, 0.85)], [P(0.85, 1.32, -0.85), P(0.85, 1.32, 0.85)]] as [V3, V3][]) bolster(mb, a, b, 0.07, BX.red);
    // nets on three sides above the deck
    for (const [x0, z0, x1, z1] of [[-0.85, -0.85, 0.85, -0.85], [-0.85, -0.85, -0.85, 0.85], [0.85, -0.85, 0.85, 0.85]]) {
      surf(mb, 4, 3, (i, j) => [x0 + (x1 - x0) * (i / 4), 1.4 + j * 0.27, z0 + (z1 - z0) * (i / 4)], (i, j) => [i / 4, j / 3], 'bx_net', { inside: null });
      surf(mb, 4, 3, (i, j) => [x0 + (x1 - x0) * (i / 4), 1.4 + j * 0.27, z0 + (z1 - z0) * (i / 4)], (i, j) => [i / 4, j / 3], 'bx_net', { inside: null, flip: true });
    }
    // the tent roof: striped, peaked
    for (let k = 0; k < 8; k++) {
      const a0 = (k / 8) * Math.PI * 2 + Math.PI / 8, a1 = ((k + 1) / 8) * Math.PI * 2 + Math.PI / 8;
      surf(mb, 1, 2, (i, j) => { const a = i ? a1 : a0, r = 1.28 * (1 - j / 2); return [Math.cos(a) * r, 2.35 + (j / 2) * 0.55, Math.sin(a) * r]; }, (i, j) => [i, j / 2], 'bx_vinyl', { color: k % 2 ? BX.red : BX.white, inside: [0, 2.0, 0] });
    }
    mb.sphere(0, 2.94, 0, 0.07, 6, 4, 'bx_ball', { fit: true, color: BX.yellow });
    // padded steps up the open side
    for (let i = 0; i < 3; i++) mb.box(-0.3 + i * 0.3, 0, 0.62, 0.3, 0.3 + i * 0.3, 0.5, 'bx_foam', { color: [BX.yellow, BX.green, BX.red][i] });
    // handprints, smudges (a few small tinted boxes, flat on the posts)
    mb.box(0.85, 0.9, 0.95, 0.04, 0.05, 0.004, 'white', { color: 0xa06050 });
  },
});
defObj({
  key: 'bx_slide', name: 'Wave Slide', w: 1, d: 3, height: 1.3, block: 'low', movable: 0, hp: 1200, sound: 'plastic',
  tags: [...T, 'fixed', 'playframe'],
  desc: 'A yellow wave slide, worn pale down the middle by a thousand bottoms. It ends in the balls. Something slid down it recently: the balls at the bottom are still settling.',
  model: (mb) => {
    const H = (t: number) => 1.28 * (1 - t) + Math.sin(t * Math.PI * 2) * 0.06 * (1 - t) + 0.05;
    const N = 12;
    surf(mb, 4, N, (i, j) => { const t = j / N, u = i / 4 - 0.5, edge = Math.abs(u) > 0.35 ? (Math.abs(u) - 0.35) * 1.6 : 0; return [u * 0.62, H(t) + edge, -1.5 + t * 2.95]; }, (i, j) => [i / 4, j / 3], 'bx_plastic', { color: BX.yellow, inside: null, flip: true });
    surf(mb, 4, N, (i, j) => { const t = j / N, u = i / 4 - 0.5; return [u * 0.62, H(t) - 0.05, -1.5 + t * 2.95]; }, (i, j) => [i / 4, j / 3], 'bx_plastic', { color: mixHex(BX.yellow, 0x000000, 0.25), inside: null });
    for (const k of [-1, 1]) tube(mb, Array.from({ length: N + 1 }, (_, j) => P(k * 0.33, H(j / N) + 0.17, -1.5 + (j / N) * 2.95)), 0.035, 6, 'bx_plastic', { color: BX.orange });
    for (const z of [-1.3, -0.3]) { mb.cylinder(-0.3, 0, z, 0.04, H((z + 1.5) / 2.95), 6, 'metal_grey', { color: 0xc8ccd0 }); mb.cylinder(0.3, 0, z, 0.04, H((z + 1.5) / 2.95), 6, 'metal_grey', { color: 0xc8ccd0 }); }
  },
});
defObj({
  key: 'bx_tube', name: 'Crawl Tube', w: 1, d: 2, height: 2.6, block: 'none', tall: true, movable: 0, hp: 1500, sound: 'plastic', noShadow: false,
  tags: [...T, 'fixed', 'playframe'],
  desc: 'A crawl tube up in the frame, with bubble windows. From down here you can hear something shuffling along inside it on its knees.',
  variant: (s) => String((s.v ?? 0) % 4),
  model: (mb, s) => {
    const v = (s.v ?? 0) % 4, c = PRIM[v];
    tube(mb, [P(0, 1.95, -1.0), P(0, 1.95, 1.0)], 0.42, 14, 'bx_plastic', { color: c });
    for (const z of [-0.98, 0.98]) blob(mb, [0, 1.95, z], [0.46, 0.46, 0.04], 14, 6, 'bx_plastic', { color: mixHex(c, 0xffffff, 0.25) });
    // two bubble windows on each side (clear domes, a bit of light in them)
    for (const z of [-0.45, 0.45]) for (const k of [-1, 1]) blob(mb, [k * 0.4, 1.95, z], [0.08, 0.17, 0.17], 10, 6, 'bx_glass', { color: 0xd8f0ff, emissive: 0.25 });
    // hangers from the ceiling
    for (const z of [-0.7, 0.7]) rod(mb, 0, 2.37, z, 0, 2.7, z, 0.02, 4, 'metal_grey', { color: 0xb8bcc0 });
  },
});
defObj({
  key: 'bx_netbridge', name: 'Net Bridge', w: 1, d: 3, height: 2.5, block: 'none', tall: true, movable: 0, hp: 600, sound: 'fabric',
  tags: [...T, 'fixed', 'playframe'],
  desc: 'A rope bridge slung between two towers. It sags. It is swaying a little, though nobody is on it.',
  model: (mb) => {
    const sag = (t: number) => 1.3 - Math.sin(t * Math.PI) * 0.22;
    surf(mb, 3, 8, (i, j) => { const t = j / 8; return [(i / 3 - 0.5) * 0.7, sag(t), -1.5 + t * 3]; }, (i, j) => [i / 3, j / 2], 'bx_net', { inside: null });
    surf(mb, 3, 8, (i, j) => { const t = j / 8; return [(i / 3 - 0.5) * 0.7, sag(t) - 0.01, -1.5 + t * 3]; }, (i, j) => [i / 3, j / 2], 'bx_net', { inside: null, flip: true });
    for (const k of [-1, 1]) {
      tube(mb, Array.from({ length: 9 }, (_, j) => P(k * 0.38, sag(j / 8) + 0.75, -1.5 + (j / 8) * 3)), 0.025, 5, 'bx_vinyl', { color: BX.red });
      surf(mb, 8, 2, (i, j) => { const t = i / 8; return [k * 0.36, sag(t) + j * 0.37, -1.5 + t * 3]; }, (i, j) => [i / 2, j / 2], 'bx_net', { inside: null });
      surf(mb, 8, 2, (i, j) => { const t = i / 8; return [k * 0.36, sag(t) + j * 0.37, -1.5 + t * 3]; }, (i, j) => [i / 2, j / 2], 'bx_net', { inside: null, flip: true });
    }
  },
});
defObj({
  key: 'bx_softblock', name: 'Soft Play Block', height: 0.6, block: 'low', movable: 4, hp: 200, sound: 'fabric',
  tags: [...T, 'softplay', 'toy'],
  desc: 'A foam shape in wipe-clean vinyl, light enough to throw. The vinyl is split along one seam and the foam inside has been picked at, in tiny pinches.',
  variant: (s) => `${(s.v ?? 0) % 6}|${(s.c ?? 0) % 4}`,
  model: (mb, s) => {
    const v = (s.v ?? 0) % 6, c = PRIM[(s.c ?? 0) % 4];
    if (v === 0) mb.box(0, 0, 0, 0.55, 0.55, 0.55, 'bx_vinyl', { color: c });
    else if (v === 1) { mb.push(); mb.translate(0, 0.25, 0); mb.rotateZ(Math.PI / 2); mb.cylinder(0, -0.35, 0, 0.25, 0.7, 12, 'bx_vinyl', { color: c }); mb.pop(); }
    else if (v === 2) mb.wedge(0, 0, 0, 0.6, 0.8, 0.05, 0.5, 'bx_vinyl', { color: c });
    else if (v === 3) { for (const k of [-1, 1]) mb.box(k * 0.25, 0, 0, 0.18, 0.5, 0.45, 'bx_vinyl', { color: c }); surf(mb, 8, 1, (i, j) => { const a = Math.PI * (i / 8); return [Math.cos(a) * 0.34, 0.25 + Math.sin(a) * 0.3, j ? 0.22 : -0.22]; }, (i, j) => [i / 4, j], 'bx_vinyl', { color: c, inside: [0, 0.2, 0], flip: true }); }
    else if (v === 4) for (let i = 0; i < 3; i++) mb.box(0, 0, -0.25 + i * 0.18, 0.6, 0.18 * (3 - i), 0.18, 'bx_vinyl', { color: PRIM[((s.c ?? 0) + i) % 4] });
    else { surf(mb, 1, 1, (i, j) => [i ? 0.3 : -0.3, j ? 0.5 : 0, -0.25], (i, j) => [i, j], 'bx_vinyl', { color: c }); mb.wedge(-0.15, 0, 0, 0.3, 0.5, 0.5, 0.0, 'bx_vinyl', { color: c }); mb.wedge(0.15, 0, 0, 0.3, 0.5, 0.0, 0.5, 'bx_vinyl', { color: c }); }
  },
});
defObj({
  key: 'bx_party_table', name: 'Party Table', w: 3, d: 1, height: 0.75, block: 'table', surface: 0.62, movable: 0, hp: 400, sound: 'plastic', flammable: 0.6,
  tags: [...T, 'table', 'party'],
  desc: 'A long party table under a paper tablecloth: a paper plate at every place, a hat on every plate, a name card on every hat. Every card says TIMMY.',
  variant: (s) => `${s.cake ? 1 : 0}|${(s.v ?? 0) % 3}`,
  model: (mb, s) => {
    const v = (s.v ?? 0) % 3;
    for (const x of [-1.3, 1.3]) for (const z of [-0.35, 0.35]) mb.cylinder(x, 0, z, 0.025, 0.6, 6, 'metal_grey', { color: 0xd0d0d4 });
    mb.box(0, 0.6, 0, 2.9, 0.03, 0.85, 'bx_cloth', { fit: true });
    for (const z of [-0.43, 0.43]) mb.box(0, 0.42, z, 2.9, 0.2, 0.01, 'bx_cloth', { fit: true });
    for (let i = 0; i < 6; i++) {
      const x = -1.15 + (i % 3) * 1.15 * (i < 3 ? 1 : 1) + (i >= 3 ? 0.15 : -0.15), z = i < 3 ? -0.26 : 0.26;
      mb.cylinder(x, 0.615, z, 0.11, 0.008, 10, 'white', { color: 0xf4f0f0 });
      // a party hat on the plate, a cup beside it
      mb.cylinder(x, 0.623, z, 0.045, 0.12, 8, 'bx_plastic', { color: PRIM[(i + v) % 4], rTop: 0.002 });
      mb.cylinder(x + 0.16, 0.615, z, 0.03, 0.08, 8, 'bx_plastic', { color: PRIM[(i + v + 2) % 4], rTop: 0.035 });
      if ((i + v) % 3 === 0) mb.box(x - 0.05, 0.62, z + 0.08, 0.08, 0.004, 0.06, 'white', { color: 0x8a5a3a });
    }
    if (s.cake) {
      // the cake: grey, furred, five candles burned to the stub, a slice cut out and gone
      mb.cylinder(0, 0.615, 0, 0.2, 0.01, 12, 'white', { color: 0xf0eeea });
      surf(mb, 10, 1, (i, j) => { const a = (i / 10) * Math.PI * 1.65 + 0.3; return [Math.cos(a) * 0.16, 0.625 + j * 0.11, Math.sin(a) * 0.16]; }, (i, j) => [i / 3, j], 'bx_cake_side', { inside: [0, 0.68, 0] });
      surf(mb, 10, 1, (i, j) => { const a = (i / 10) * Math.PI * 1.65 + 0.3; const r = j ? 0.16 : 0; return [Math.cos(a) * r, 0.735, Math.sin(a) * r]; }, (i, j, p) => [0.5 + p[0] * 3, 0.5 + p[2] * 3], 'bx_cake_top', { inside: [0, 0.6, 0] });
      for (const a of [0.3, 0.3 + Math.PI * 1.65]) surf(mb, 1, 1, (i, j) => [i ? Math.cos(a) * 0.16 : 0, 0.625 + j * 0.11, i ? Math.sin(a) * 0.16 : 0], (i, j) => [i, j * 0.5], 'bx_cake_side', { inside: [0.06, 0.68, 0.06] });
      for (let k = 0; k < 5; k++) { const a = 0.6 + k * 0.85; mb.cylinder(Math.cos(a) * 0.1, 0.735, Math.sin(a) * 0.1, 0.006, 0.025, 4, 'white', { color: PRIM[k % 4] }); mb.box(Math.cos(a) * 0.1, 0.76, Math.sin(a) * 0.1, 0.006, 0.006, 0.006, 'white', { color: 0x2a2a2a }); }
      mb.cylinder(0.2, 0.615, 0.12, 0.012, 0.005, 4, 'white', { color: 0x8aa86a });
    }
  },
});
defObj({
  key: 'bx_balloons', name: 'Party Balloons', height: 2.7, block: 'none', ceiling: true, movable: 0, hp: 20, sound: 'plastic', noShadow: true,
  tags: [...T, 'decor', 'party'],
  desc: 'A bunch of party balloons pressed up against the ceiling tiles, ribbons hanging down. They have not lost any air. They never do, here.',
  variant: (s) => String((s.v ?? 0) % 4),
  model: (mb, s) => {
    const v = (s.v ?? 0) % 4, cols = [BX.red, BX.yellow, BX.blue, BX.green, BX.pink, BX.purple];
    const n = 5 + v;
    for (let i = 0; i < n; i++) {
      const a = i * 2.39 + v, r = 0.12 + (i % 3) * 0.1, x = Math.cos(a) * r, z = Math.sin(a) * r, c = cols[(i + v) % cols.length];
      blob(mb, [x, 2.48, z], [0.15, 0.19, 0.15], 10, 7, 'bx_ball', { color: c, fit: true });
      mb.cylinder(x, 2.27, z, 0.018, 0.03, 5, 'bx_ball', { color: c, rTop: 0.008 });
      tube(mb, [P(x, 2.27, z), P(x + 0.03, 1.9, z + 0.02), P(x - 0.02, 1.5 - (i % 3) * 0.12, z), P(x + 0.04, 1.2 - (i % 2) * 0.2, z + 0.03)], 0.004, 3, 'white', { color: c });
    }
  },
});
defObj({
  key: 'bx_balloon_floor', name: 'Burst Balloon', height: 0.08, block: 'none', movable: 0.02, hp: 5, sound: 'plastic', noShadow: true,
  tags: [...T, 'decor', 'floor', 'party'],
  desc: 'A burst balloon, a curl of ribbon still tied on. There is a smear of something on it that is not party coloured.',
  variant: (s) => String((s.v ?? 0) % 3),
  model: (mb, s) => {
    const v = (s.v ?? 0) % 3, c = [BX.red, BX.blue, BX.yellow][v];
    blob(mb, [0.05, 0.015, 0], [0.12, 0.02, 0.07], 8, 4, 'bx_ball', { color: c, disp: (d, u) => 1 + 0.3 * Math.sin(u * Math.PI * 6) });
    tube(mb, [P(-0.06, 0.01, 0), P(-0.2, 0.01, 0.08), P(-0.3, 0.01, 0.02), P(-0.38, 0.01, 0.1)], 0.004, 3, 'white', { color: c });
  },
});
defObj({
  key: 'bx_prize_counter', name: 'Prize Counter', w: 3, d: 1, height: 1.05, block: 'solid', movable: 0, hp: 900, sound: 'glass',
  container: { capacity: 30, kind: 'shelf', name: 'Prize Counter', loot: 'bx_prize' },
  tags: [...T, 'counter', 'prizes', 'container'],
  desc: 'A glass counter of prizes: candy necklaces, plastic rings, gumballs, a bin of lollipops. A sign says ASK FOR TICKETS. There is a bell. Someone behind the counter is breathing.',
  model: (mb) => {
    mb.box(0, 0, 0, 2.95, 0.35, 0.85, 'bx_vinyl', { color: BX.red });
    mb.box(0, 0.35, 0, 2.95, 0.04, 0.85, 'white', { color: 0xe8e4dc });
    // the glass box, prizes inside
    for (const [x, c] of [[-1.0, BX.yellow], [-0.35, BX.blue], [0.35, BX.pink], [1.0, BX.green]] as [number, number][]) {
      for (let k = 0; k < 5; k++) mb.sphere(x - 0.2 + k * 0.1, 0.45 + (k % 2) * 0.06, 0.05 * (k % 3), 0.04, 6, 4, 'bx_ball', { fit: true, color: [c, BX.white, BX.red, BX.purple, BX.orange][k] });
      mb.box(x, 0.39, 0.15, 0.4, 0.03, 0.3, 'white', { color: 0xf4f0e8 });
    }
    for (const [x, y, z, w, h, d] of [[0, 0.39, 0.42, 2.95, 0.6, 0.02], [0, 0.39, -0.42, 2.95, 0.6, 0.02], [1.46, 0.39, 0, 0.02, 0.6, 0.85], [-1.46, 0.39, 0, 0.02, 0.6, 0.85]]) mb.box(x, y, z, w, h, d, 'bx_glass', { color: 0xd8f0f8, emissive: 0.06 });
    mb.box(0, 0.99, 0, 2.97, 0.05, 0.87, 'white', { color: 0xf4f0e8 });
    // a jar of lollipops on top, the bell, the tickets sign
    lathe(mb, [-1.1, 1.04, 0], [[0, 0], [0.12, 0], [0.13, 0.04], [0.13, 0.26], [0.1, 0.3], [0.1, 0.32]], 10, 'bx_glass', { color: 0xe0f4ff });
    for (let k = 0; k < 7; k++) { const a = k * 0.9; rod(mb, -1.1 + Math.cos(a) * 0.05, 1.08, Math.sin(a) * 0.05, -1.1 + Math.cos(a) * 0.08, 1.42, Math.sin(a) * 0.08, 0.004, 4, 'white'); mb.cylinder(-1.1 + Math.cos(a) * 0.08, 1.42, Math.sin(a) * 0.08, 0.035, 0.012, 8, 'bx_ball', { color: PRIM[k % 4] }); }
    mb.cylinder(0.6, 1.04, 0.15, 0.04, 0.012, 8, 'metal_grey', { color: 0xd8c070 }); mb.sphere(0.6, 1.06, 0.15, 0.035, 8, 4, 'chrome', { color: 0xe8d890 });
    mb.box(0.2, 1.04, -0.3, 0.5, 0.25, 0.02, 'white', { color: 0xf2c84a });
  },
});
defObj({
  key: 'bx_prize_wall', name: 'Prize Wall', w: 3, d: 1, height: 2.6, block: 'none', onWall: true, movable: 0, hp: 300, sound: 'wood',
  tags: [...T, 'wall', 'prizes', 'decor'],
  desc: 'A pegboard of prizes nobody ever had enough tickets for: a plush giraffe, slinkies, a giant inflatable hammer. The giraffe has been taken down and put back facing the wall.',
  model: (mb) => {
    const z = -0.47;
    mb.box(0, 0.9, z, 2.9, 1.6, 0.03, 'bx_prizes', { fit: true });
    for (let i = 0; i < 5; i++) { const x = -1.1 + i * 0.55; blob(mb, [x, 1.95, z + 0.1], [0.13, 0.16, 0.09], 8, 6, 'bx_foam', { color: [BX.pink, BX.blue, BX.yellow, BX.green, BX.purple][i] }); blob(mb, [x, 2.16, z + 0.1], [0.09, 0.08, 0.07], 8, 5, 'bx_foam', { color: [BX.pink, BX.blue, BX.yellow, BX.green, BX.purple][i] }); }
    rod(mb, 1.2, 1.1, z + 0.12, 1.2, 1.9, z + 0.12, 0.03, 6, 'bx_plastic', { color: BX.red });
    mb.box(1.05, 1.9, z + 0.04, 0.3, 0.18, 0.16, 'bx_plastic', { color: BX.yellow });
  },
});
defObj({
  key: 'bx_candy_jar', name: 'Candy Jar', height: 1.1, block: 'low', movable: 25, hp: 80, sound: 'glass',
  container: { capacity: 12, kind: 'box', name: 'Candy Jar', loot: 'bx_candy_jar' },
  tags: [...T, 'candy', 'container', 'glass'],
  desc: 'A glass jar as big as a child, full to the lid with gumballs on one side and lollipops on the other. The lid has a child-proof catch. It has been opened from the inside.',
  variant: (s) => String((s.v ?? 0) % 2),
  model: (mb, s) => {
    const v = (s.v ?? 0) % 2;
    lathe(mb, [0, 0, 0], [[0, 0], [0.22, 0], [0.18, 0.12], [0.07, 0.3], [0.07, 0.42], [0.2, 0.46]], 10, 'bx_plastic', { color: BX.red });
    for (let k = 0; k < 26; k++) { const a = k * 2.39, r = (k % 4) * 0.045, y = 0.52 + Math.floor(k / 6) * 0.07; ball(mb, Math.cos(a) * r, y, Math.sin(a) * r, 0.045, v ? BALLS[(k * 3) % BALLS.length] : [BX.red, BX.white, BX.yellow][k % 3]); }
    lathe(mb, [0, 0.46, 0], [[0.2, 0], [0.24, 0.05], [0.25, 0.4], [0.2, 0.48], [0.12, 0.5]], 12, 'bx_glass', { color: 0xe0f4ff, emissive: 0.05 });
    mb.cylinder(0, 0.96, 0, 0.13, 0.06, 12, 'bx_plastic', { color: BX.yellow });
    mb.sphere(0, 1.04, 0, 0.04, 8, 4, 'bx_ball', { fit: true, color: BX.red });
  },
});
defObj({
  key: 'bx_cubby', name: 'Shoe Cubbies', w: 2, d: 1, height: 1.3, block: 'solid', movable: 0, hp: 500, sound: 'wood',
  container: { capacity: 16, kind: 'shelf', name: 'Shoe Cubbies', loot: 'bx_cubby' },
  tags: [...T, 'container', 'cubby'],
  desc: 'Twelve cubbies for shoes, NO SHOES IN THE BALL PIT. Every cubby has a pair of small shoes in it, neatly side by side. Nobody has come back for any of them.',
  variant: (s) => String((s.v ?? 0) % 2),
  model: (mb, s) => {
    const v = (s.v ?? 0) % 2;
    mb.box(0, 0, 0.0, 1.9, 1.25, 0.5, 'bx_vinyl', { color: v ? BX.blue : BX.green, skip: ['south'] });
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
      const x = -0.71 + c * 0.475, y = 0.08 + r * 0.4;
      mb.box(x, y, 0.06, 0.42, 0.34, 0.4, 'white', { color: 0x3a3a48, skip: ['south'] });
      for (const k of [-1, 1]) { mb.box(x + k * 0.07, y + 0.01, 0.1, 0.07, 0.05, 0.16, 'bx_vinyl', { color: PRIM[(r * 4 + c + v) % 4] }); mb.box(x + k * 0.07, y, 0.1, 0.075, 0.015, 0.165, 'white', { color: 0xf0ece4 }); }
    }
  },
});
defObj({
  key: 'bx_giraffe', name: 'Height Chart', height: 1.8, block: 'none', onWall: true, movable: 0, hp: 60, sound: 'wood',
  tags: [...T, 'wall', 'sign'],
  desc: 'A painted giraffe on the wall: YOU MUST BE THIS TALL TO PLAY. There is a pencil line at the right height for every child that ever came here, and a name by each one. Every name is the same.',
  model: (mb) => { mb.box(0, 0.05, -0.48, 0.4, 1.6, 0.02, 'bx_giraffe', { fit: true }); },
});
defObj({
  key: 'bx_rules', name: 'Rules Board', w: 2, d: 1, height: 2.2, block: 'none', onWall: true, movable: 0, hp: 80, sound: 'wood',
  tags: [...T, 'wall', 'sign'],
  desc: 'BALL HOUSE RULES. SOCKS ONLY. NO PUSHING. NO FOOD IN THE PIT. PARENTS MUST STAY WITH THEIR CHILD AT ALL TIMES. PLEASE COLLECT YOUR CHILD BY 8PM. The last line has been gone over in red marker, many times.',
  model: (mb) => { mb.box(0, 1.0, -0.48, 1.4, 1.15, 0.03, 'bx_rules', { fit: true }); },
});
defObj({
  key: 'bx_post', name: 'Padded Post', height: 2.5, block: 'solid', movable: 0, hp: 800, sound: 'plastic',
  tags: [...T, 'fixed', 'playframe'],
  desc: 'A padded steel post wrapped in vinyl, a ball on top. The padding is bitten through in places at the height of a small mouth.',
  variant: (s) => String((s.v ?? 0) % 4),
  model: (mb, s) => { const c = PRIM[(s.v ?? 0) % 4]; mb.cylinder(0, 0, 0, 0.12, 2.35, 10, 'bx_vinyl', { color: c }); mb.sphere(0, 2.42, 0, 0.14, 8, 6, 'bx_ball', { fit: true, color: BX.yellow }); mb.cylinder(0, 0, 0, 0.2, 0.06, 10, 'bx_vinyl', { color: mixHex(c, 0x000000, 0.2) }); },
});
defObj({
  key: 'bx_presents', name: 'Party Presents', height: 0.6, block: 'low', movable: 6, hp: 30, sound: 'paper', flammable: 1,
  container: { capacity: 6, kind: 'box', name: 'Presents', loot: 'bx_party' },
  tags: [...T, 'party', 'container'],
  desc: 'A heap of wrapped presents. The tags all say TO TIMMY. One has been opened: inside it, another present, wrapped, smaller.',
  model: (mb) => {
    const B = [[-0.15, 0, -0.1, 0.32, 0.26, 0.3, BX.blue], [0.17, 0, 0.08, 0.26, 0.22, 0.26, BX.pink], [-0.05, 0.26, -0.05, 0.22, 0.18, 0.2, BX.yellow], [0.2, 0, -0.22, 0.18, 0.14, 0.18, BX.green]] as const;
    for (const [x, y, z, w, h, d, c] of B) { mb.box(x, y, z, w, h, d, 'bx_plastic', { color: c }); mb.box(x, y, z, w + 0.006, h + 0.004, 0.03, 'white', { color: BX.white }); mb.box(x, y, z, 0.03, h + 0.004, d + 0.006, 'white', { color: BX.white }); }
  },
});
void P;
defObj({
  key: 'bx_arch', name: 'Ball House Entrance', w: 2, d: 1, height: 2.9, block: 'none', tall: true, movable: 0, hp: 2000, sound: 'plastic',
  tags: [...T, 'fixed', 'sign', 'door'],
  desc: 'A padded arch in faded primaries over a dark doorway, BALL HOUSE across the top in letters made of balls. From inside: music, and giggling.',
  model: (mb) => {
    // two padded pillars, an arch of bolsters, a dark doorway, the lettering in balls
    for (const x of [-0.85, 0.85]) { mb.cylinder(x, 0, 0, 0.18, 2.1, 10, 'bx_vinyl', { color: x < 0 ? BX.red : BX.blue }); mb.sphere(x, 2.15, 0, 0.2, 8, 6, 'bx_ball', { fit: true, color: BX.yellow }); }
    tube(mb, Array.from({ length: 11 }, (_, i) => { const a = Math.PI * (i / 10); return P(Math.cos(a) * -0.85, 2.15 + Math.sin(a) * 0.55, 0); }), 0.16, 10, 'bx_vinyl', { color: BX.green });
    mb.box(0, 0, -0.06, 1.5, 2.05, 0.02, 'plastic_black', { color: 0x14141c });
    const cols = [BX.red, BX.yellow, BX.blue, BX.green];
    for (let i = 0; i < 18; i++) { const a = Math.PI * (0.12 + (i / 17) * 0.76); mb.sphere(Math.cos(a) * -0.85, 2.15 + Math.sin(a) * 0.55, 0.17, 0.06, 6, 4, 'bx_ball', { fit: true, color: cols[i % 4] }); }
    mb.box(0, 2.0, 0.12, 1.3, 0.22, 0.04, 'white', { color: BX.white });
    for (let i = 0; i < 9; i++) mb.sphere(-0.56 + i * 0.14, 2.11, 0.15, 0.045, 6, 4, 'bx_ball', { fit: true, color: cols[(i + 1) % 4] });
  },
});
