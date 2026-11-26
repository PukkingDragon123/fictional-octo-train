// Textures for fractured walls: the broken cross-sections (concrete with its
// aggregate, fired brick clay, rusty ribbed rebar), the crack stages a wall
// shows before it gives (a web of cracks round a crushed patch of board,
// stepped cracks through brick mortar and spalled concrete, a split running
// along a plank) and the rubble left on the floor under a masonry hole. Same
// house rules as src/world/destructTextures.ts.
import { atlas } from '../gfx/atlas';
import { addTextureModule } from '../gfx/textures/index';
import { PixelCanvas, ph } from '../gfx/pixel';
import { Rng } from '../core/rng';
import { over, blob } from '../content/textures/kit';
import { crack, disc } from './destructTextures';

function concreteCore(pc: PixelCanvas) {
  // grey paste with angular aggregate and air voids (tileable)
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const v = ph(x >> 1, y >> 1, 41);
    pc.set(x, y, v > 0.78 ? 0x8e8a82 : v > 0.35 ? 0xa6a29a : 0xb4b0a6);
  }
  const stones = [[3, 3, 0x6e6a62], [10, 5, 0x9a8a74], [6, 11, 0x7a746a], [13, 12, 0x8a8070], [1, 8, 0xc0b8a8]];
  for (const [x, y, c] of stones) { pc.set(x, y, c); pc.set(x + 1, y, c); pc.set(x, y + 1, c); if (x + 1 < 16 && y + 1 < 16) pc.set(x + 1, y + 1, 0x5a564e); }
  pc.set(8, 2, 0x4a4640); pc.set(4, 14, 0x4a4640); pc.set(12, 9, 0x524e48);
}

function brickCore(pc: PixelCanvas) {
  // broken fired clay: orange-red core, darker grog specks, a mortar seam
  const R = [0x9a4a32, 0xb05a3c, 0xc46a48, 0xd88a62];
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) pc.set(x, y, R[Math.floor(ph(x >> 1, y >> 1, 23) * 3.99)]);
  for (let i = 0; i < 9; i++) pc.set((i * 7 + 3) % 16, (i * 5 + 1) % 16, 0x6a3020);
  for (let x = 0; x < 16; x++) { pc.set(x, 11, ph(x, 0, 3) > 0.5 ? 0xb8b2a4 : 0xa8a294); }
}

function rebar(pc: PixelCanvas) {
  // ribbed steel, rusted: diagonal ribs over a brown-orange bar
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const rib = (x + y) % 3 === 0;
    const rust = ph(x, y, 7) > 0.55;
    pc.set(x, y, rib ? (rust ? 0x8a4a22 : 0x5a504a) : rust ? 0xa85e2c : 0x6a625a);
  }
  pc.set(2, 5, 0xc87a3a); pc.set(6, 1, 0xc87a3a);
}

/** stage two and three on board: a crushed patch, a web of long cracks, paper skin lifting */
function wallWeb(pc: PixelCanvas, rng: Rng) {
  pc.wrap = false; pc.clear();
  const cx = rng.float(14, 18), cy = rng.float(13, 18);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const m = blob(x, y, cx, cy, 6.5, 5.5, 4, 0.7);
    if (m <= 0) continue;
    over(pc, x, y, m > 0.62 ? 0x24201a : m > 0.4 ? 0x7a756a : m > 0.18 ? 0xc6c0b2 : 0xf0ece2, 240);
  }
  // concentric ring crack and long radials
  for (let i = 0; i < 26; i++) { const a = (i / 26) * Math.PI * 2, r = 9 + Math.sin(i * 1.7) * 1.2; over(pc, Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), 0x3a3428, 230); }
  const n = rng.int(9, 12);
  for (let i = 0; i < n; i++) crack(pc, rng, cx, cy, (i / n) * Math.PI * 2 + rng.float(-0.25, 0.25), rng.int(12, 19), 0x2e2a22, 0xf6f2e6);
  for (let i = 0; i < 14; i++) { const a = rng.float(0, 6.28), r = rng.float(5, 7); over(pc, Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), 0xfbf8f0, 245); }
}

/** brick and block: stepped cracks along the mortar, a spalled crater with the core showing */
function masonryCrack(pc: PixelCanvas, rng: Rng, brick: boolean) {
  pc.wrap = false; pc.clear();
  const cx = rng.float(13, 19), cy = rng.float(12, 18);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const m = blob(x, y, cx, cy, 5.5, 4.5, 6, 0.75);
    if (m <= 0) continue;
    const c = brick ? (m > 0.55 ? 0x5a2a1c : m > 0.25 ? 0xb05a3c : 0xd88a62) : (m > 0.55 ? 0x4a4640 : m > 0.25 ? 0x8e8a82 : 0xb4b0a6);
    over(pc, x, y, c, 245);
  }
  for (let k = 0; k < 4; k++) {
    // stair-step: along a course, then down a perpend
    let x = Math.round(cx), y = Math.round(cy);
    const dx = k % 2 ? 1 : -1, dy = k < 2 ? 1 : -1;
    for (let s = 0; s < 22; s++) {
      if (s % 6 < 4) x += dx; else y += dy;
      if (x < 0 || y < 0 || x > 31 || y > 31) break;
      over(pc, x, y, 0x1e1a16, 240);
      if (rng.chance(0.4)) over(pc, x, y + 1, brick ? 0xe0d8c8 : 0xc8c2b4, 200);
    }
  }
  for (let i = 0; i < 6; i++) disc(pc, cx + rng.float(-3, 3), cy + rng.float(-3, 3), rng.float(0.6, 1.3), 0x2a2420, 220);
}

/** a plank splitting along its grain, raw wood showing, splinters lifting */
function woodSplit(pc: PixelCanvas, rng: Rng) {
  pc.wrap = false; pc.clear();
  const RAW = [0x9a7448, 0xc49a64, 0xe0c08a, 0xf2dcae];
  for (let k = 0; k < 3; k++) {
    let y = 10 + k * 6 + rng.float(-1.5, 1.5);
    for (let x = 1; x < 31; x++) {
      y += rng.float(-0.35, 0.35);
      const w = x > 6 && x < 25 && k === 1 ? 2 : 1;
      for (let j = 0; j < w; j++) over(pc, x, Math.round(y) + j, j ? 0x24180f : 0x140e0a, 245);
      over(pc, x, Math.round(y) - 1, RAW[2], 230);
      if (rng.chance(0.16)) { const d = rng.chance(0.5) ? -1 : 1; for (let s = 1; s < 4; s++) over(pc, x + s, Math.round(y) + d * (1 + (s >> 1)), RAW[3 - (s >> 1)], 230); }
    }
  }
  const gx = rng.float(12, 20), gy = 16;
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const m = blob(x, y, gx, gy, 5, 3, 5, 0.5); if (m > 0) over(pc, x, y, m > 0.5 ? RAW[0] : RAW[2], 235); }
}

/** rubble under a masonry hole: chips, grit, dust (floor decal) */
function rubble(pc: PixelCanvas, rng: Rng, brick: boolean) {
  pc.wrap = false; pc.clear();
  const S = pc.w, C = S / 2;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const m = blob(x, y, C, C, C * 0.9, C * 0.75, 9, 0.55);
    if (m > 0 && ph(x, y, 29) < m * 1.2) over(pc, x, y, brick ? 0xc8a690 : 0xbab6ac, 190);
  }
  for (let i = 0; i < 46; i++) {
    const a = rng.float(0, Math.PI * 2), d = Math.pow(rng.next(), 0.7) * C * 0.92;
    const x = Math.round(C + Math.cos(a) * d), y = Math.round(C + Math.sin(a) * d);
    const w = rng.int(0, 2), h = rng.int(0, 1);
    const base = brick && rng.chance(0.6) ? 0xb05a3c : rng.chance(0.5) ? 0x8e8a82 : 0xa6a29a;
    for (let yy = 0; yy <= h; yy++) for (let xx = 0; xx <= w; xx++) over(pc, x + xx, y + yy, yy === 0 ? base : 0x4a4640, 245);
  }
}

addTextureModule(() => {
  const A = atlas();
  A.add('dmg_concrete_core', 16, 16, (pc) => concreteCore(pc));
  A.add('dmg_brick_core', 16, 16, (pc) => brickCore(pc));
  A.add('dmg_rebar', 8, 8, (pc) => rebar(pc));
  A.add('dmg_wall_web', 32, 32, (pc, rng) => wallWeb(pc, rng));
  A.add('dmg_brick_crack', 32, 32, (pc, rng) => masonryCrack(pc, rng, true));
  A.add('dmg_concrete_crack', 32, 32, (pc, rng) => masonryCrack(pc, rng, false));
  A.add('dmg_wood_split', 32, 32, (pc, rng) => woodSplit(pc, rng));
  A.add('dbr_rubble', 32, 32, (pc, rng) => rubble(pc, rng, false));
  A.add('dbr_rubble_brick', 32, 32, (pc, rng) => rubble(pc, rng, true));
});
