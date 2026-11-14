// The Plunge (src/world/gen/z_plunge.ts): a municipal leisure pool, 1991, wave
// machine and flumes and a toddler pool with a mushroom fountain, empty and lit
// and running. Floating noodles, the wave machine grilles, the flume, the
// mushroom, the poolside signs and the pace clock; decals for drains, the
// caustic light the water throws on the tile, and lane T-marks.
// Texture prefix: pl_
import { defObj } from '../../world/objects';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { makeRamp, mixHex, ph } from '../../gfx/pixel';
import type { PixelCanvas } from '../../gfx/pixel';
import { text, textC, textW } from './b_common';

const T = ['plunge', 'pool', 'pl'];

/** poolside signs: label, colours */
export const PL_SIGNS: { lines: string[]; bg: number; fg: number }[] = [
  { lines: ['NO RUNNING'], bg: 0xc8202a, fg: 0xffffff },
  { lines: ['NO DIVING', 'SHALLOW WATER'], bg: 0xffffff, fg: 0xc8202a },
  { lines: ['DEEP END', '3.8 M'], bg: 0x1c3a8a, fg: 0xffffff },
  { lines: ['WAVES', 'EVERY HOUR'], bg: 0xf0c020, fg: 0x1a1a1a },
  { lines: ['FLUMES', 'ONE AT A TIME'], bg: 0x18908a, fg: 0xffffff },
  { lines: ['ADULT', 'SUPERVISION'], bg: 0xffffff, fg: 0x1c3a8a },
  { lines: ['DO NOT FEED', 'THE WATER'], bg: 0x1a1a1a, fg: 0xf0c020 },
];

function sign(pc: PixelCanvas, i: number) {
  pc.wrap = false;
  const s = PL_SIGNS[i % PL_SIGNS.length];
  pc.fill(s.bg);
  for (let x = 0; x < pc.w; x++) { pc.set(x, 0, mixHex(s.bg, 0x000000, 0.3)); pc.set(x, pc.h - 1, mixHex(s.bg, 0x000000, 0.4)); }
  for (let y = 0; y < pc.h; y++) { pc.set(0, y, mixHex(s.bg, 0x000000, 0.3)); pc.set(pc.w - 1, y, mixHex(s.bg, 0x000000, 0.4)); }
  const sc = s.lines.length === 1 ? 2 : 1;
  s.lines.forEach((l, k) => textC(pc, l, pc.w / 2, s.lines.length === 1 ? 4 : 3 + k * 7, s.fg, sc));
  for (let i2 = 0; i2 < 18; i2++) pc.blend(Math.floor(ph(i2, i, 8701) * pc.w), Math.floor(ph(i2, i + 1, 8702) * pc.h), 0x7a6a4a, 0.25);
}
function paceClock(pc: PixelCanvas) {
  pc.wrap = false; pc.clear();
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) {
    const d = Math.hypot(x + 0.5 - 16, y + 0.5 - 16);
    if (d > 15.5) continue;
    let c = d > 14 ? 0x1a1a1a : 0xf4f4ee;
    const a = Math.atan2(y + 0.5 - 16, x + 0.5 - 16);
    const tick = Math.abs(((a / (Math.PI * 2)) * 60 + 60.5) % 5 - 0.5) < 0.5 && d > 11.5 && d < 14;
    if (tick) c = 0xc8202a;
    pc.set(x, y, c);
  }
  for (let r = 0; r < 12; r++) { pc.set(16 + Math.round(Math.cos(-2.2) * r), 16 + Math.round(Math.sin(-2.2) * r), 0xc8202a); pc.set(16 + Math.round(Math.cos(0.6) * r * 0.7), 16 + Math.round(Math.sin(0.6) * r * 0.7), 0x1a1a1a); }
}
function drain(pc: PixelCanvas) {
  pc.wrap = false; pc.clear();
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const d = Math.hypot(x + 0.5 - 8, y + 0.5 - 8);
    if (d > 7.5) continue;
    pc.set(x, y, d > 6.5 ? 0x8a8e90 : (x % 3 === 1) ? 0x1a2024 : 0xb8bcbe, 245);
  }
}
function caustic(pc: PixelCanvas) {
  // the bright web a lit pool throws on tile: alpha net of soft lines
  pc.wrap = false; pc.clear();
  const W = pc.w, H = pc.h;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W * 6.28, v = y / H * 6.28;
    const n = Math.abs(Math.sin(u * 2 + Math.sin(v * 3) * 1.3)) * Math.abs(Math.sin(v * 2.2 + Math.cos(u * 2.5) * 1.4));
    const e = 1 - Math.min(1, Math.hypot(x / W - 0.5, y / H - 0.5) * 2);
    const a = Math.max(0, 0.35 - n) / 0.35 * e;
    if (a > 0.05) pc.set(x, y, 0xe8fbff, Math.round(a * 200));
  }
}
function laneT(pc: PixelCanvas) {
  pc.wrap = false; pc.clear();
  for (let y = 0; y < 8; y++) for (let x = 0; x < 32; x++) if (y > 2 && y < 6 || (x > 26 && y >= 0)) pc.set(x, y, 0x1c3478, 230);
}
function noodle(pc: PixelCanvas, c: number) {
  const R = makeRamp(c, 5, { spread: 0.35 });
  pc.each((x, y) => pc.set(x, y, R[2 + (y % 4 === 0 ? -1 : 0) + (ph(x, y, 8711) < 0.12 ? 1 : 0)]));
}
function mushroom(pc: PixelCanvas) {
  pc.each((x, y) => pc.set(x, y, (Math.floor(x / 4) + Math.floor(y / 4)) % 2 ? 0xe8402a : 0xf8f4ec));
}
function flume(pc: PixelCanvas) {
  const R = makeRamp(0x2aa8c8, 5, { spread: 0.3 });
  pc.each((x, y) => pc.set(x, y, R[2 + (x % 8 === 0 ? -1 : 0) + (y < 3 ? 1 : 0)]));
}
function grille(pc: PixelCanvas) {
  pc.wrap = false;
  pc.fill(0xd8dcdc);
  for (let y = 2; y < pc.h - 2; y++) for (let x = 2; x < pc.w - 2; x++) pc.set(x, y, (x % 3 === 0 || y % 3 === 0) ? 0x9aa0a4 : 0x1a2a34);
  textC(pc, 'WAVE', pc.w / 2, pc.h - 8, 0xc8202a);
}

addTextureModule(() => {
  const A = atlas();
  PL_SIGNS.forEach((_, i) => A.add('pl_sign_' + i, 48, 16, (pc) => sign(pc, i)));
  A.add('pl_clock', 32, 32, paceClock);
  A.add('pl_drain', 16, 16, drain);
  A.add('pl_caustic', 64, 64, caustic);
  A.add('pl_lane_t', 32, 8, laneT);
  A.add('pl_noodle_0', 16, 8, (pc) => noodle(pc, 0xf06aa8));
  A.add('pl_noodle_1', 16, 8, (pc) => noodle(pc, 0x40c870));
  A.add('pl_noodle_2', 16, 8, (pc) => noodle(pc, 0xf0c030));
  A.add('pl_noodle_3', 16, 8, (pc) => noodle(pc, 0x4080e8));
  A.add('pl_mushroom', 16, 16, mushroom);
  A.add('pl_flume', 16, 16, flume);
  A.add('pl_grille', 32, 32, grille);
});

// ============================================================ things on the water
defObj({
  key: 'pl_noodle', name: 'Pool Noodle', height: 0.12, block: 'none', movable: 0.3, dynamic: true, sound: 'plastic', hp: 20,
  desc: 'A foam noodle, sun-faded, bitten at one end. It turns slowly on water that is not moving.',
  tags: [...T, 'toy', 'float'],
  variant: (s) => String((s.v ?? 0) % 4),
  model: (mb, s) => {
    const v = (s.v ?? 0) % 4, a = ((s.a ?? 0) % 6) * 0.5;
    mb.push().rotateY(a);
    for (let k = 0; k < 6; k++) {
      const t0 = k / 6, t1 = (k + 1) / 6;
      const x0 = -0.75 + t0 * 1.5, z0 = Math.sin(t0 * 3) * 0.12, x1 = -0.75 + t1 * 1.5, z1 = Math.sin(t1 * 3) * 0.12;
      mb.push().translate((x0 + x1) / 2, 0.04, (z0 + z1) / 2).rotateY(-Math.atan2(z1 - z0, x1 - x0));
      mb.cylinderX(0, 0, 0, 0.045, 0.27, 7, 'pl_noodle_' + v, { caps: k === 0 || k === 5, bevel: false });
      mb.pop();
    }
    mb.pop();
  },
});

defObj({
  key: 'pl_mushroom', name: 'Mushroom Fountain', w: 2, d: 2, height: 2.0, block: 'solid', movable: 0, sound: 'plastic', hp: 900,
  water: { capacity: 200, tap: true, tainted: true },
  desc: 'A fibreglass toadstool, red with white spots, raining a ring of water off its cap into the toddler pool. The water is warm. Something small and pale swims round the stem.',
  tags: [...T, 'fountain'],
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.22, 1.5, 10, 'plastic_white', { rTop: 0.18 });
    mb.cylinder(0, 1.45, 0, 0.95, 0.12, 14, 'pl_mushroom', { rTop: 0.85 });
    mb.cylinder(0, 1.57, 0, 0.85, 0.25, 14, 'pl_mushroom', { rTop: 0.3 });
    // the falling ring of water: thin pale curtains
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      mb.box(Math.cos(a) * 0.9, 0.05, Math.sin(a) * 0.9, 0.06, 1.38, 0.02, 'glass', { color: 0xd8f4ff, emissive: 0.15, bevel: false });
    }
  },
});

defObj({
  key: 'pl_flume', name: 'Flume', w: 2, d: 4, height: 3.4, block: 'solid', tall: true, movable: 0, sound: 'plastic', hp: 1500,
  desc: 'A closed teal tube spiralling down from a stair tower into the splash pool. Water still runs out of the bottom of it. Something is still coming down it, slowly, every few minutes.',
  tags: [...T, 'slide'],
  model: (mb) => {
    // the tower
    for (const [x, z] of [[-0.8, -1.8], [0.8, -1.8], [-0.8, -0.6], [0.8, -0.6]] as const) mb.box(x, 0, z, 0.1, 3.2, 0.1, 'metal_painted_green', { color: 0xd8e0d8 });
    mb.box(0, 3.1, -1.2, 1.8, 0.1, 1.4, 'metal_grey');
    mb.box(0, 3.2, -1.85, 1.8, 0.5, 0.05, 'metal_grey', { color: 0xc8c8c8 });
    // the tube: a helix of short cylinders coming down to the mouth at the front
    const N = 18;
    for (let i = 0; i < N; i++) {
      const t = i / N, a = t * Math.PI * 2.4, y = 3.0 - t * 2.75;
      const x = Math.cos(a) * 0.55 * (1 - t * 0.3), z = -1.2 + Math.sin(a) * 0.55 + t * 2.6;
      mb.push().translate(x, y, z).rotateY(-a);
      mb.cylinderZ(0, 0, 0, 0.36, 0.42, 10, 'pl_flume', { caps: false, bevel: false });
      mb.pop();
    }
    mb.box(0, 0.05, 1.85, 0.7, 0.08, 0.3, 'pl_flume');
  },
});

// ============================================================ on the walls
defObj({
  key: 'pl_sign', name: 'Pool Sign', w: 1, height: 2.2, block: 'none', onWall: true, movable: 0, sound: 'plastic', hp: 40,
  desc: 'A poolside sign in a plastic frame. The water has got behind it.',
  tags: [...T, 'sign', 'wall'],
  variant: (s) => String((s.v ?? 0) % PL_SIGNS.length),
  model: (mb, s) => { mb.box(0, 1.7, -0.43, 0.96, 0.34, 0.02, { south: 'pl_sign_' + ((s.v ?? 0) % PL_SIGNS.length), all: 'plastic_white' }, { fit: { south: true }, bevel: false }); },
});

defObj({
  key: 'pl_clock', name: 'Pace Clock', height: 2.6, block: 'none', onWall: true, movable: 0, sound: 'plastic', hp: 60,
  desc: 'A big lap clock with one red sweep hand. The hand goes round. The minute hand never moves.',
  tags: [...T, 'clock', 'wall'],
  model: (mb) => { mb.cylinderZ(0, 2.05, -0.42, 0.5, 0.06, 18, { all: 'pl_clock', sides: 'plastic_black' } as any, { caps: true, fit: true } as any); },
});

defObj({
  key: 'pl_grille', name: 'Wave Machine Grille', w: 2, height: 1.6, block: 'none', onWall: true, movable: 0, sound: 'metal', hp: 2000,
  desc: 'The intake of the wave machine: a steel grille half under the water. Behind it, a long way back, something big turns over and over.',
  tags: [...T, 'wall', 'machine'],
  model: (mb) => { mb.box(0, -0.4, -0.42, 1.9, 1.5, 0.05, { south: 'pl_grille', all: 'metal_grey' }, { fit: { south: true }, bevel: false }); },
});

defObj({
  key: 'pl_rescue', name: 'Rescue Board', height: 2.0, block: 'none', onWall: true, movable: 0, sound: 'plastic', hp: 120,
  desc: 'A yellow spinal board and a shepherd\'s crook on hooks. The crook is bent. The board has tooth marks.',
  tags: [...T, 'wall'],
  model: (mb) => {
    mb.box(0, 0.4, -0.38, 0.45, 1.6, 0.05, 'plastic_yellow');
    mb.box(0.32, 0.2, -0.36, 0.03, 1.9, 0.03, 'metal_grey');
    mb.box(0.32, 2.1, -0.3, 0.03, 0.03, 0.12, 'metal_grey');
  },
});

void text; void textW;
