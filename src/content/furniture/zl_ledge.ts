// The Ledge (src/world/gen/z_ledge.ts): the far shelf of the backrooms where
// everything is warm all the way through. Floors (carpet streaked with runs,
// molten pools that shine, the drooping lip where the carpet hangs over
// nothing), the yellow wallpaper sliding down its own wall, wax textures, and
// the fixtures: melt heaps of furniture, drip columns where the ceiling met
// the floor, ceiling grid sagged to the waist, a fluorescent troffer stretched
// like taffy, an EXIT sign running down the wall. Also hooks the melt into
// the object geometry cache (src/world/anomalies/meltGeo.ts).
// Texture prefix: lg_
import { defObj, setMeltGeometryHook } from '../../world/objects';
import { defFloor, wallpaperId } from '../../world/defs';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { WALL_PX } from '../../gfx/textures/lobby';
import { makeRamp, mixHex, scaleHex, ph, tileFbm, textC } from './b_common';
import type { PixelCanvas } from '../../gfx/pixel';
import type { ModelBuilder } from '../../gfx/modelBuilder';
import { lathe, blob, tube, surf, type V3 } from '../../creatures/kit/anomalies';
import { meltGeometry } from '../../world/anomalies/meltGeo';
import { FLOOR_GLOSS } from '../../gfx/wetmap';

setMeltGeometryHook(meltGeometry);

const T = ['lg', 'ledge', 'anomaly'];

// ---------------------------------------------------------------- floors
defFloor({ key: 'lg_carpet', name: 'Warm Carpet', tex: ['lg_carpet', 'lg_carpet_b', 'lg_carpet_c'], sound: 'wetcarpet', rotate: true, side: 'lg_lip_side' });
defFloor({ key: 'lg_pool', name: 'Melt Pool', tex: ['lg_pool', 'lg_pool_b'], sound: 'water', wet: 0.003, slow: 0.82, rotate: true, side: 'lg_lip_side' });
defFloor({ key: 'lg_lip', name: 'The Lip', tex: ['lg_lip'], sound: 'wetcarpet', slow: 0.9, side: 'lg_lip_side' });
defFloor({ key: 'lg_tile', name: 'Softened Tile', tex: ['lg_tile'], sound: 'tile', rotate: true, side: 'lg_lip_side' });
FLOOR_GLOSS.lg_pool = 0.62; FLOOR_GLOSS.lg_lip = 0.3; FLOOR_GLOSS.lg_carpet = 0.1; FLOOR_GLOSS.lg_tile = 0.36;
/** the Ledge's wallpapers (z_ledge.ts papers its rooms with these) */
export const LG_PAPERS = ['lg_paper', 'lg_paper_b'];
for (const p of LG_PAPERS) wallpaperId(p);

// ---------------------------------------------------------------- textures
/** honey-amber wax with a soft sheen and a few bright glints */
function wax(pc: PixelCanvas, base: number, seed: number) {
  const R = makeRamp(base, 7, { spread: 0.5, hueShift: 0.04 });
  pc.fillRamp(R, (x, y) => 0.5 + (tileFbm(x, y, pc.w, pc.h, 3, 3, seed) - 0.5) * 0.5 + Math.sin((x + y * 0.6) * 0.5 + seed) * 0.06, 0.5);
  for (let i = 0; i < 4; i++) { const x = Math.floor(ph(i, 1, seed) * pc.w), y = Math.floor(ph(i, 2, seed) * pc.h); pc.blend(x, y, 0xfff6e0, 0.75); pc.blend(x + 1, y, 0xfff0d0, 0.35); }
}
/** the warm carpet: the lobby's yellow pile, too saturated, run through with glossy amber streaks */
function warmCarpet(pc: PixelCanvas, v: number) {
  const W = pc.w, H = pc.h;
  const R = makeRamp(0xb49a5c, 7, { hueShift: 0.04, spread: 0.36 });
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const m = tileFbm(x, y, W, H, 5, 2, 401 + v) * 0.7 + tileFbm(x, y, W, H, 8, 1, 411 + v) * 0.3;
    let c = m < 0.4 ? R[2] : m < 0.52 ? R[3] : m < 0.64 ? R[4] : R[5];
    const t = ph((x + (y & 1)) >> 1, y >> 1, 421 + v);
    if (t < 0.05) c = R[1]; else if (t > 0.985) c = R[6];
    pc.set(x, y, c);
  }
  // runs of melt across the pile: wavy amber bands with a lit edge
  const runs = v === 2 ? 2 : v === 1 ? 1 : 0;
  for (let k = 0; k < runs; k++) {
    const y0 = 8 + k * 13 + Math.floor(ph(k, v, 431) * 5);
    for (let x = 0; x < W; x++) {
      const yy = y0 + Math.round(Math.sin(x * 0.35 + k * 2 + v) * 2 + Math.sin(x * 0.9 + v) * 0.8);
      const w = Math.sin(x * 0.21 + k) > 0.2 ? 2 : 1;
      for (let d = 0; d < w; d++) pc.blend(x, yy + d, mixHex(0xc88a3a, 0xe0a848, ph(x, d, 441)), 0.5);
      pc.blend(x, yy - 1, 0x6a4a20, 0.25);
      if (ph(x, k, 451 + v) < 0.1) pc.blend(x, yy, 0xfff0c8, 0.6);
    }
  }
  if (v === 1) pc.stain(16, 14, 6, 0x8a6a3a, 0x6a4a1a, 461);
}
/** molten floor: a slow swirl of amber, rose and cream under a gloss, darker where it sets at the rim */
function meltPool(pc: PixelCanvas, v: number) {
  const W = pc.w, H = pc.h;
  const A = makeRamp(0xd09a40, 6, { spread: 0.45, hueShift: 0.03 }), B = makeRamp(0xd08a78, 6, { spread: 0.4 });
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sw = Math.sin((x * 0.31 + tileFbm(x, y, W, H, 3, 2, 501 + v) * 6) + y * 0.12) * 0.5 + 0.5;
    const n = tileFbm(x, y, W, H, 4, 3, 511 + v);
    const r = sw < 0.3 ? B : A;
    const i = Math.max(0, Math.min(5, Math.floor(1.5 + n * 3 + (sw > 0.82 ? 1.5 : 0))));
    pc.set(x, y, r[i]);
  }
  // cream marbling, set skin wrinkles, gloss glints
  for (let k = 0; k < 3; k++) { let x = ph(k, 0, 521 + v) * W, y = ph(k, 1, 521 + v) * H; for (let s = 0; s < 26; s++) { x += Math.cos(s * 0.4 + k); y += Math.sin(s * 0.33 + k * 2) * 0.8; pc.blend(Math.round(x), Math.round(y), 0xf8e2b0, 0.55); } }
  for (let i = 0; i < 6; i++) { const x = Math.floor(ph(i, 3, 531 + v) * W), y = Math.floor(ph(i, 4, 531 + v) * H); pc.blend(x, y, 0xffffff, 0.85); pc.blend(x + 1, y, 0xfff4d8, 0.4); pc.blend(x, y + 1, 0xfff4d8, 0.3); }
}
/** melting wallpaper: the yellow strips sliding down their wall, the chevrons dragged into runs, wax beading at the skirting */
function meltPaper(pc: PixelCanvas, v: number) {
  const W = pc.w, H = pc.h, FLOOR = H - 5;
  const R = makeRamp(0xd8b048, 8, { hueShift: 0.05, spread: 0.6 });
  pc.fillRamp(R, (x, y) => 0.58 + (tileFbm(x, y, W, H, 3, 3, 601 + v) - 0.5) * 0.14 + (y / H) * 0.06, 0.55);
  // strip seams that bow outward as they slide (the paper is coming off in a curve)
  for (const sx of [0, 16]) for (let y = 0; y < FLOOR; y++) {
    const off = Math.round(Math.sin((y / FLOOR) * Math.PI) * 2.2 * (v ? -1 : 1));
    pc.blend(sx + off, y, R[1], 0.55); pc.blend(sx + off + 1, y, R[6], 0.35);
  }
  // chevrons dragged downward into long tails
  for (const [cx, off] of [[8, 0], [24, 5]] as [number, number][]) for (let y = 4 + off; y < FLOOR - 22; y += 11) {
    pc.blend(cx, y, R[2], 0.6); pc.blend(cx - 1, y + 1, R[2], 0.5); pc.blend(cx + 1, y + 1, R[2], 0.5);
    const tail = 3 + Math.floor(ph(cx, y, 611 + v) * 7);
    for (let t = 2; t < tail; t++) pc.blend(cx + (t > 4 ? 1 : 0), y + t, R[2], 0.45 * (1 - t / tail));
  }
  // under the ceiling the paper has gone soft and dark, with glossy drips running out of it
  for (let y = 0; y < 10; y++) for (let x = 0; x < W; x++) pc.blend(x, y, mixHex(R[0], 0x8a3a1a, 0.4), 0.55 * (1 - y / 10));
  for (let k = 0; k < 7; k++) {
    const x = Math.floor(ph(k, v, 621) * (W - 2)) + 1, len = 12 + Math.floor(ph(k, v, 622) * (FLOOR - 24));
    const col = k % 3 === 0 ? 0xe86a3a : 0xe89a2a;
    for (let y = 2; y < len; y++) {
      const w = y > len - 3 ? 2 : 1;
      for (let d = 0; d < w; d++) pc.blend(x + d, y, col, 0.72);
      pc.blend(x - 1, y, 0x5a2a10, 0.25);
    }
    pc.blend(x, len, 0xfff0c8, 0.9); pc.blend(x + 1, len - 1, 0xfff0c8, 0.5);
  }
  // wax bead pooled along the skirting, then the skirting itself warped
  for (let x = 0; x < W; x++) {
    const bead = FLOOR - 2 - Math.round((Math.sin(x * 0.45 + v) + 1) * 1.2);
    for (let y = bead; y < FLOOR; y++) pc.blend(x, y, 0xd8781c, 0.6);
    pc.blend(x, bead, 0xffe0a0, 0.5);
    for (let y = FLOOR; y < H; y++) pc.set(x, y, y === FLOOR ? 0x3a2410 : mixHex(0x8a5a2a, 0x6a3a1a, (y - FLOOR) / 5));
  }
}
/** ceiling tiles gone soft: the grid sagging, the tile faces dimpled and dripping */
function softTile(pc: PixelCanvas) {
  const R = makeRamp(0xd8c8a0, 6, { spread: 0.35 });
  pc.fillRamp(R, (x, y) => 0.55 + (tileFbm(x, y, pc.w, pc.h, 4, 4, 701) - 0.5) * 0.3, 0.6);
  for (let i = 0; i < pc.w; i++) { const s = Math.round(Math.sin(i * 0.3) * 1.2); pc.blend(i, 0 + Math.max(0, s), 0x8a7a5a, 0.7); pc.blend(0 + Math.max(0, s), i, 0x8a7a5a, 0.7); }
  for (let i = 0; i < 14; i++) pc.blend(Math.floor(ph(i, 1, 702) * pc.w), Math.floor(ph(i, 2, 702) * pc.h), 0x9a8a6a, 0.5);
  for (let k = 0; k < 3; k++) { const cx = 6 + ph(k, 3, 703) * 20, cy = 6 + ph(k, 4, 703) * 20; pc.ellipseBlend(cx, cy, 3, 2, 0xc8783a, 0.5); pc.blend(cx, cy - 1, 0xfff0d0, 0.7); }
}

addTextureModule(() => {
  const A = atlas();
  A.add('lg_carpet', 32, 32, (pc) => warmCarpet(pc, 0));
  A.add('lg_carpet_b', 32, 32, (pc) => warmCarpet(pc, 1));
  A.add('lg_carpet_c', 32, 32, (pc) => warmCarpet(pc, 2));
  A.add('lg_pool', 32, 32, (pc) => meltPool(pc, 0));
  A.add('lg_pool_b', 32, 32, (pc) => meltPool(pc, 1));
  A.add('lg_tile', 32, 32, softTile);
  // the lip: carpet stretched thin over the edge, the pile combed out into strings
  A.add('lg_lip', 32, 32, (pc) => {
    warmCarpet(pc, 2);
    for (let x = 0; x < 32; x++) for (let y = 0; y < 32; y++) if (((x + Math.round(Math.sin(y * 0.4) * 2)) % 5) === 0) pc.blend(x, y, 0x9a5a1a, 0.45);
  });
  // the face of a drooping ledge: carpet backing, then strings of melt hanging off it
  A.add('lg_lip_side', 16, 32, (pc) => {
    const R = makeRamp(0xa8742a, 6, { spread: 0.45 });
    pc.each((x, y) => pc.set(x, y, R[2 + (ph(x >> 1, y >> 2, 801) < 0.3 ? 1 : 0) - (y > 24 ? 1 : 0)]));
    for (let x = 0; x < 16; x++) { pc.set(x, 0, R[5]); pc.set(x, 1, R[4]); }
    for (let k = 0; k < 5; k++) { const x = Math.floor(ph(k, 1, 802) * 15); const len = 8 + Math.floor(ph(k, 2, 802) * 22); for (let y = 2; y < len; y++) pc.blend(x, y, 0xe8902a, 0.8); pc.blend(x, len, 0xfff0c8, 0.9); }
  });
  A.add('lg_paper', 32, WALL_PX, (pc) => meltPaper(pc, 0), 1, 2.7);
  A.add('lg_paper_b', 32, WALL_PX, (pc) => meltPaper(pc, 1), 1, 2.7);
  A.add('lg_wax', 16, 16, (pc) => wax(pc, 0xe0902a, 811));
  A.add('lg_wax_pale', 16, 16, (pc) => wax(pc, 0xf0dcb4, 812));
  A.add('lg_wax_rose', 16, 16, (pc) => wax(pc, 0xe0708a, 813));
  // the troffer's diffuser and the EXIT plate, gone soft
  A.add('lg_diffuser', 16, 32, (pc) => { pc.fill(0xfff4f8); for (let y = 0; y < 32; y += 3) for (let x = 0; x < 16; x++) pc.blend(x + Math.round(Math.sin(y * 0.3)), y, 0xf0c8e0, 0.6); });
  A.add('lg_exit', 32, 16, (pc) => {
    pc.fill(0x1a0806);
    textC(pc, 'EXIT', 16, 5, 0xff4a2a);
    // the letters run
    for (let x = 6; x < 26; x++) if (pc.get(x, 9) === 0xff4a2a || ph(x, 0, 821) < 0.25) { const len = 2 + Math.floor(ph(x, 1, 821) * 6); for (let y = 10; y < 10 + len; y++) pc.blend(x, y, 0xff5a2a, 0.85 * (1 - (y - 10) / len)); }
  });
  // decals: a molten puddle and a run down a wall
  A.add('lg_puddle', 32, 32, (pc) => {
    pc.wrap = false; pc.clear();
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const a = Math.atan2(y - 16, x - 16), d = Math.hypot(x - 16, y - 16);
      const r = 11 + Math.sin(a * 3 + 1) * 2.5 + Math.sin(a * 7) * 1.2;
      if (d > r + 1.5) continue;
      if (d > r) { pc.set(x, y, 0x5a2a0a, 90); continue; }
      const sw = Math.sin(x * 0.4 + y * 0.2 + d * 0.3);
      pc.set(x, y, sw > 0.55 ? 0xf0a83a : sw < -0.6 ? 0xc8542a : 0xe0821c, 225);
    }
    for (const [x, y] of [[11, 12], [12, 12], [19, 18]]) pc.set(x, y, 0xfff6e0, 240);
  });
  A.add('lg_run', 16, 32, (pc) => {
    pc.wrap = false; pc.clear();
    for (let k = 0; k < 4; k++) {
      const x = 2 + k * 3 + Math.floor(ph(k, 0, 831) * 2), len = 10 + Math.floor(ph(k, 1, 831) * 20);
      for (let y = 0; y < len; y++) { const w = y > len - 3 ? 2 : 1; for (let d = 0; d < w; d++) pc.set(x + d, y, y < 2 ? 0xa84a1a : 0xe8902a, 235); }
      pc.set(x, len, 0xfff0c8, 250);
    }
  });
});

// ---------------------------------------------------------------- shared forms
const P = (x: number, y: number, z: number): V3 => [x, y, z];
/** a soft drip hanging from (x, y, z): a teardrop that thins upward */
function drip(mb: ModelBuilder, x: number, y: number, z: number, len: number, r: number, tex: string, color = 0xffffff) {
  tube(mb, [P(x, y, z), P(x, y - len * 0.6, z), P(x, y - len, z)], (t) => r * (0.35 + 0.65 * t * t), 6, tex, { color, capEnd: true });
  blob(mb, [x, y - len, z], [r * 1.25, r * 1.5, r * 1.25], 7, 4, tex, { color });
}
/** a puddle of wax flat on the floor round (x, z) */
function puddle(mb: ModelBuilder, x: number, z: number, rx: number, rz: number, h: number, tex: string, color: number, seed: number) {
  blob(mb, [x, 0, z], [rx, h, rz], 18, 4, tex, { color, v0: 0, v1: 0.5, disp: (d) => { const a = Math.atan2(d[2], d[0]); return 1 + 0.14 * Math.sin(a * 3 + seed) + 0.07 * Math.sin(a * 7 - seed * 2); } });
}

// ---------------------------------------------------------------- the fixtures
defObj({
  key: 'lg_wax_heap', name: 'Melt Heap', w: 2, d: 2, height: 1.1, block: 'solid', movable: 0, hp: 99999, sound: 'flesh',
  tags: [...T, 'fixed'],
  desc: 'A heap of what a room used to hold: a chair back, a table leg, a telephone, all slid into one warm mound. It is still settling.',
  variant: (s) => String((s.v ?? 0) % 3),
  model: (mb, s) => {
    const v = (s.v ?? 0) % 3;
    const col = [0xe8a040, 0xe88a5a, 0xf0c070][v];
    puddle(mb, 0, 0, 1.0, 0.92, 0.06, 'lg_wax', col, v);
    // the mound, lumpy, with a sagging crown
    blob(mb, [0.05, 0, -0.04], [0.7, 0.62, 0.62], 18, 9, 'lg_wax', { color: col, v0: 0, v1: 0.55, disp: (d, u) => 1 + 0.12 * Math.sin(u * Math.PI * 10 + v) + 0.1 * d[1] * Math.sin(u * Math.PI * 4) });
    blob(mb, [-0.32, 0.36, 0.2], [0.32, 0.22, 0.3], 12, 6, 'lg_wax_rose', { color: 0xffffff });
    // a chair back sticking out of it, bent soft
    tube(mb, [P(0.3, 0.3, -0.25), P(0.42, 0.7, -0.3), P(0.38, 1.0, -0.22), P(0.2, 1.08, -0.1)], 0.035, 6, 'plastic_black', { color: 0x4a4a52, capEnd: true });
    surf(mb, 5, 4, (i, j) => [0.32 + i * 0.05 - j * 0.02, 0.62 + j * 0.1 - Math.sin(i * 0.6) * 0.06, -0.32 + i * 0.07 + Math.sin(j * 0.8) * 0.04], (i, j) => [i / 5, j / 4], 'fabric_blue', { inside: null, flip: false });
    surf(mb, 5, 4, (i, j) => [0.32 + i * 0.05 - j * 0.02, 0.62 + j * 0.1 - Math.sin(i * 0.6) * 0.06, -0.32 + i * 0.07 + Math.sin(j * 0.8) * 0.04 - 0.01], (i, j) => [i / 5, j / 4], 'fabric_blue', { inside: null, flip: true });
    // a table leg, a beige telephone handset half sunk
    tube(mb, [P(-0.55, 0.15, -0.3), P(-0.7, 0.45, -0.42), P(-0.78, 0.62, -0.38)], 0.03, 6, 'wood_dark', { color: 0x8a6a4a, capEnd: true });
    tube(mb, [P(-0.1, 0.5, 0.42), P(0.05, 0.56, 0.5), P(0.22, 0.52, 0.46)], (t) => 0.045 + Math.sin(t * Math.PI) * -0.012, 7, 'white', { color: 0xd8c8a8, capStart: true, capEnd: true });
    // drips running off the crown
    for (let k = 0; k < 5; k++) { const a = k * 1.3 + v; drip(mb, Math.cos(a) * 0.55, 0.32, Math.sin(a) * 0.5, 0.2 + (k % 2) * 0.1, 0.035, 'lg_wax', col); }
  },
});
defObj({
  key: 'lg_wax_column', name: 'Drip Column', height: 2.7, block: 'solid', tall: true, movable: 0, hp: 99999, sound: 'flesh',
  tags: [...T, 'fixed'],
  desc: 'The ceiling dripped here for so long that the drip reached the floor. It is warm, and it is still getting thicker.',
  variant: (s) => String((s.v ?? 0) % 3),
  model: (mb, s) => {
    const v = (s.v ?? 0) % 3, tex = v === 1 ? 'lg_wax_pale' : 'lg_wax', col = [0xffffff, 0xffffff, 0xf0b0a0][v];
    puddle(mb, 0, 0, 0.62, 0.55, 0.05, tex, col, v + 3);
    // stalagmite up, stalactite down, a thin waist where they met
    lathe(mb, [0, 0, 0], [[0, 0], [0.42, 0], [0.38, 0.06], [0.26, 0.3], [0.17, 0.75], [0.1, 1.15], [0.07, 1.35], [0.09, 1.55], [0.14, 1.95], [0.22, 2.35], [0.34, 2.62], [0.44, 2.7]], 14, tex, { color: col });
    // rings of drips frozen as they ran
    for (let k = 0; k < 9; k++) {
      const a = k * 2.4 + v, y = 2.55 - (k % 3) * 0.35, r = k % 3 === 0 ? 0.3 : k % 3 === 1 ? 0.2 : 0.14;
      drip(mb, Math.cos(a) * r, y, Math.sin(a) * r, 0.18 + (k % 4) * 0.07, 0.03, tex, col);
    }
    for (let k = 0; k < 6; k++) { const a = k * 1.05 + v; blob(mb, [Math.cos(a) * 0.32, 0.06, Math.sin(a) * 0.3], [0.12, 0.1, 0.1], 8, 4, tex, { color: col }); }
  },
});
defObj({
  key: 'lg_wax_puddle', name: 'Melt Pool', height: 0.12, block: 'none', movable: 0, hp: 99999, sound: 'flesh', noShadow: true,
  tags: [...T, 'fixed', 'floor'],
  desc: 'A pool of something that used to be ceiling, still soft. A skin forms on it and sinks again.',
  variant: (s) => String((s.v ?? 0) % 3),
  model: (mb, s) => {
    const v = (s.v ?? 0) % 3, tex = ['lg_wax', 'lg_wax_rose', 'lg_wax_pale'][v];
    puddle(mb, 0, 0, 0.46, 0.4, 0.04, tex, 0xffffff, v + 7);
    for (let k = 0; k < 3; k++) { const a = k * 2.1 + v; blob(mb, [Math.cos(a) * 0.22, 0.02, Math.sin(a) * 0.18], [0.07, 0.05, 0.06], 8, 4, tex, { color: 0xffffff }); }
    // a ceiling-tile flake floating on it
    surf(mb, 3, 3, (i, j) => [-0.12 + i * 0.08, 0.045 + Math.sin(i + j) * 0.01, -0.05 + j * 0.07], (i, j) => [i / 3, j / 3], 'lg_tile', { inside: null });
  },
});
defObj({
  key: 'lg_slump', name: 'Sagging Ceiling', w: 2, d: 2, height: 2.7, block: 'solid', tall: true, movable: 0, hp: 99999, sound: 'fabric',
  tags: [...T, 'fixed'],
  desc: 'A square of the ceiling grid, tiles and all, has come down like a wet sheet and hangs at waist height. It drips from every corner.',
  model: (mb) => {
    // the sheet: pinned at the ceiling all round, belly sagging to 0.5 m in the middle
    const N = 8;
    const at = (i: number, j: number): V3 => {
      const u = i / N - 0.5, w = j / N - 0.5, r = Math.max(Math.abs(u), Math.abs(w)) * 2;
      const sag = (1 - r * r) * 2.05 + Math.sin(i * 1.3) * Math.sin(j * 1.1) * 0.06 * (1 - r);
      return [u * 1.9, 2.66 - sag, w * 1.9];
    };
    surf(mb, N, N, at, (i, j) => [i / 2, j / 2], 'lg_tile', { inside: null, flip: true, color: 0xf4ead8 });
    surf(mb, N, N, (i, j) => { const p = at(i, j); return [p[0], p[1] + 0.03, p[2]]; }, (i, j) => [i / 2, j / 2], 'lg_tile', { inside: null, color: 0xd8cab0 });
    // the grid rails bent into the sag
    for (let k = 0; k <= 4; k++) {
      const pts: V3[] = []; const pts2: V3[] = [];
      for (let i = 0; i <= N; i++) { const a = at(i, k * 2), b = at(k * 2, i); pts.push([a[0], a[1] - 0.012, a[2]]); pts2.push([b[0], b[1] - 0.012, b[2]]); }
      tube(mb, pts, 0.012, 4, 'metal_grey', { color: 0xd0ccc4 });
      tube(mb, pts2, 0.012, 4, 'metal_grey', { color: 0xd0ccc4 });
    }
    // drips off the lowest point and the corners of tiles, and the pool they make
    for (let k = 0; k < 7; k++) { const a = k * 0.9, r = 0.1 + (k % 3) * 0.22; const p = at(N / 2 + Math.round(Math.cos(a) * r * 4), N / 2 + Math.round(Math.sin(a) * r * 4)); drip(mb, p[0], p[1], p[2], 0.15 + (k % 3) * 0.12, 0.028, 'lg_wax_pale'); }
    puddle(mb, 0.05, 0.02, 0.62, 0.55, 0.04, 'lg_wax_pale', 0xf4e4c8, 2);
  },
});
defObj({
  key: 'lg_sag_tube', name: 'Stretched Fluorescent', w: 1, d: 2, height: 2.7, block: 'none', tall: true, movable: 0, hp: 400, sound: 'glass',
  tags: [...T, 'fixed', 'light'],
  desc: 'A ceiling troffer has come halfway down on strings of its own plastic. The tube inside is bent like taffy and still lit, pink.',
  light: { color: 0xff6ac8, intensity: 0.9, radius: 5.5, y: 1.9, kind: 'fluoro', power: false, flicker: 0.04 },
  variant: (s) => String((s.v ?? 0) % 2),
  model: (mb, s) => {
    const v = (s.v ?? 0) % 2;
    // strings from the ceiling to the fixture's corners
    for (const [x, z] of [[-0.28, -0.72], [0.28, -0.72], [-0.28, 0.72], [0.28, 0.72]]) tube(mb, [P(x, 2.7, z), P(x * 0.9, 2.3, z * 0.95), P(x * 0.85, 1.95 - Math.abs(z) * 0.18, z * 0.92)], (t) => 0.02 - t * 0.008, 5, 'lg_wax_pale', { color: 0xf8f0f4 });
    // the troffer housing, bowed down in the middle
    const H = (z: number) => 1.75 + Math.abs(z) * 0.22 + (v ? 0.06 : 0);
    surf(mb, 2, 8, (i, j) => { const x = (i / 2 - 0.5) * 0.6, z = (j / 8 - 0.5) * 1.5; return [x, H(z) + Math.abs(x) * 0.25 + 0.06, z]; }, (i, j) => [i / 2, j / 4], 'metal_grey', { inside: null, flip: true, color: 0xe8e4e0 });
    surf(mb, 2, 8, (i, j) => { const x = (i / 2 - 0.5) * 0.54, z = (j / 8 - 0.5) * 1.42; return [x, H(z) + Math.abs(x) * 0.22 + 0.02, z]; }, (i, j) => [i / 2, j / 8], 'lg_diffuser', { inside: null, emissive: 0.9, color: 0xffe0f0 });
    // the tube itself, out of the housing and sagging lower
    tube(mb, [P(0.1, H(-0.7) + 0.02, -0.7), P(0.12, H(-0.3) - 0.12, -0.3), P(0.04, H(0) - 0.32, 0.05), P(0.1, H(0.35) - 0.1, 0.38), P(0.1, H(0.7) + 0.02, 0.7)], 0.024, 6, 'white', { color: 0xffd0ec, emissive: 1.4 });
    drip(mb, 0.04, H(0) - 0.34, 0.05, 0.18, 0.018, 'lg_wax_rose');
  },
});
defObj({
  key: 'lg_drip_sign', name: 'Running Exit Sign', height: 2.6, block: 'none', onWall: true, movable: 0, hp: 200, sound: 'plastic',
  tags: [...T, 'fixed', 'sign'],
  desc: 'An EXIT sign that has slid a metre down the wall and kept going. The letters run red into the skirting.',
  light: { color: 0xff3a2a, intensity: 0.5, radius: 3.5, y: 1.4, kind: 'emergency', power: false },
  model: (mb) => {
    const z = -0.47;
    // the plate, bent forward at the top and sagging at the bottom
    surf(mb, 4, 6, (i, j) => { const x = (i / 4 - 0.5) * 0.62, t = j / 6; return [x + Math.sin(t * 2) * 0.02, 1.15 + t * 0.42 - Math.abs(x) * (1 - t) * 0.12, z + 0.02 + t * t * 0.07]; }, (i, j) => [i / 4, j / 6], 'lg_exit', { inside: null, emissive: 0.9 });
    surf(mb, 4, 6, (i, j) => { const x = (i / 4 - 0.5) * 0.62, t = j / 6; return [x + Math.sin(t * 2) * 0.02, 1.15 + t * 0.42 - Math.abs(x) * (1 - t) * 0.12, z + t * t * 0.07]; }, (i, j) => [i / 4, j / 6], 'plastic_black', { inside: null, flip: true });
    // its housing has run down the wall in red streaks
    for (let k = 0; k < 5; k++) { const x = -0.24 + k * 0.12; tube(mb, [P(x, 1.15, z + 0.02), P(x + 0.01, 0.8 - (k % 2) * 0.2, z + 0.015), P(x, 0.3 + (k % 3) * 0.15, z + 0.012)], (t) => 0.02 * (1 - t * 0.5), 5, 'lg_wax_rose', { color: 0xff6a5a, emissive: 0.4, capEnd: true }); }
    puddle(mb, 0, z + 0.2, 0.36, 0.18, 0.03, 'lg_wax_rose', 0xff8070, 4);
  },
});
// the survey post: the Institute's foil tent and its thermometer post
defObj({
  key: 'lg_foil_tent', name: 'Survey Shelter', w: 2, d: 2, height: 1.7, block: 'solid', movable: 0, hp: 600, sound: 'fabric',
  tags: ['lg', 'ledge', 'fixed', 'camp'],
  container: { capacity: 14, kind: 'pile', name: 'Survey Shelter', loot: 'lg_survey' },
  desc: 'A low dome of reflective survey foil over bent poles. Inside it is a few degrees less wrong. The foil has started to wrinkle into the carpet.',
  model: (mb) => {
    // poles: two crossed hoops
    for (const s of [1, -1]) { const pts: V3[] = []; for (let i = 0; i <= 10; i++) { const a = (i / 10) * Math.PI; pts.push([Math.cos(a) * 0.9 * s, Math.sin(a) * 1.55, Math.cos(a) * 0.9]); } tube(mb, pts, 0.016, 5, 'metal_grey', { color: 0x9a9aa0 }); }
    // foil dome, crinkled, the hem melting into the floor
    blob(mb, [0, 0, 0], [0.95, 1.55, 0.95], 20, 8, 'chrome', { color: 0xf0e8d8, v0: 0, v1: 0.5, disp: (d, u, v) => 1 + 0.035 * Math.sin(u * 60) * Math.sin(v * 30) - (v > 0.42 ? (v - 0.42) * 0.6 : 0) });
    // the door flap pegged back, dark inside
    surf(mb, 3, 3, (i, j) => [-0.25 + i * 0.17, j * 0.3, 0.9 - Math.sin(i / 3 * Math.PI) * 0.05], (i, j) => [i / 3, j / 3], 'plastic_black', { inside: null, color: 0x2a2420 });
    puddle(mb, 0.6, 0.6, 0.35, 0.25, 0.03, 'chrome', 0xd8d0c0, 5);
  },
});
defObj({
  key: 'lg_thermo', name: 'Survey Thermometer', height: 2.0, block: 'low', movable: 0, hp: 300, sound: 'metal',
  tags: ['lg', 'ledge', 'fixed'],
  desc: 'A survey post with a dial thermometer. The needle says 31. The post has bent over at the top like a reed.',
  model: (mb) => {
    puddle(mb, 0, 0, 0.3, 0.26, 0.03, 'lg_wax', 0xe0a050, 6);
    tube(mb, [P(0, 0, 0), P(0, 0.9, 0), P(0.05, 1.5, 0.02), P(0.25, 1.82, 0.08), P(0.42, 1.78, 0.12)], 0.022, 6, 'metal_grey', { color: 0xc8c4bc });
    mb.push(); mb.translate(0.44, 1.72, 0.14); mb.rotateX(0.9); mb.rotateZ(0.4);
    mb.cylinder(0, -0.02, 0, 0.11, 0.04, 16, 'metal_brass');
    mb.cylinder(0, 0.02, 0, 0.095, 0.005, 16, 'white', { color: 0xf4f0e4, emissive: 0.2 });
    mb.box(0.03, 0.026, 0, 0.07, 0.004, 0.008, 'white', { color: 0xc81a1a });
    mb.pop();
  },
});
