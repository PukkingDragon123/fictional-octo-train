// How the backrooms crops and fungi look growing: in a planter, a hydro rack,
// a fungus bed and on the forage spots out in the levels. Stage 0 is a seeded
// speck, 1 sprouting, 2 growing, 3 flowering / pinning, 4 ready, 5 past it
// (rotting); `dead` is withered. Textures are world-atlas pixel art.
import type { ModelBuilder } from '../../gfx/modelBuilder';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { makeRamp, ph, bayer } from '../../gfx/pixel';

export type PlantLook = 'moss' | 'thistle' | 'tuber' | 'ear' | 'morel' | 'humcap' | 'puffball' | 'truffle';
/** crop key -> look (filled by src/game/economy/registry.ts) */
export const CROP_LOOK = new Map<string, PlantLook>();
export const lookOf = (crop: string | undefined | null) => (crop ? CROP_LOOK.get(crop) : undefined);

addTextureModule(() => {
  const A = atlas();
  // lamp moss: tight tufts, pale tips that glow a little under the tubes
  A.add('ec_moss', 16, 16, (pc) => {
    const R = makeRamp(0x5a8a3a, 6, { spread: 0.5 });
    pc.each((x, y) => { const n = ph(x, y, 61), m = ph(x >> 1, y >> 1, 62); pc.set(x, y, n < 0.12 ? 0xd8f0a0 : m < 0.3 ? R[1] : n > 0.7 ? R[4] : R[2 + (bayer(x, y) > 0.5 ? 1 : 0)]); });
  });
  // a thistle leaf: serrated, silver-veined (alpha around it)
  A.add('ec_thistle', 16, 16, (pc) => {
    for (let y = 0; y < 16; y++) {
      const w = Math.round(Math.sin((y / 15) * Math.PI) * 6) + (y % 3 === 0 ? 1 : 0);
      for (let x = 8 - w; x <= 8 + w; x++) if (x >= 0 && x < 16) pc.set(x, y, x === 8 ? 0xc8d8c0 : Math.abs(x - 8) === w ? 0x2a4a2a : (x + y) % 5 === 0 ? 0x6a9a5a : 0x4a7a44);
    }
  });
  // bracket fungus ("wallpaper ear"): concentric tan and rust growth rings, a cream lip
  A.add('ec_ear', 16, 16, (pc) => {
    const R = makeRamp(0xa8784a, 6, { spread: 0.55 });
    pc.each((x, y) => { const d = Math.hypot(x - 8, y - 15); const b = Math.floor(d * 0.9 + ph(x, y, 71) * 1.4); pc.set(x, y, d > 13 ? 0xe8d8b0 : R[1 + (b % 4)]); });
  });
  // morel: a honeycomb of dark pits and pale ridges
  A.add('ec_morel', 16, 16, (pc) => {
    pc.each((x, y) => { const cx = ((x + (y >> 2) * 2) % 4), cy = y % 4; const ridge = cx === 0 || cy === 0; pc.set(x, y, ridge ? (ph(x, y, 81) < 0.3 ? 0xd8c090 : 0xb89868) : ph(x, y, 82) < 0.4 ? 0x3a2416 : 0x5a3a22); });
  });
  // hum cap: slate blue with a pale speckle
  A.add('ec_humcap', 8, 8, (pc) => { pc.each((x, y) => pc.set(x, y, ph(x, y, 91) < 0.15 ? 0xd8e8f8 : y < 3 ? 0x5a7aa8 : 0x3a5480)); });
  // puffball skin: white, faintly cracked in a net
  A.add('ec_puff', 16, 16, (pc) => {
    pc.each((x, y) => { const c = ph(x >> 1, y >> 1, 101); pc.set(x, y, (x + y * 3) % 7 === 0 && c < 0.5 ? 0xb8b0a0 : c < 0.2 ? 0xd8d2c4 : 0xf2eee4); });
  });
  // pale stalk / tuber skin
  A.add('ec_stalk', 8, 8, (pc) => { pc.each((x, y) => pc.set(x, y, ph(x, y, 111) < 0.2 ? 0xc8bca0 : x % 3 === 0 ? 0xe0d8c4 : 0xece6d4)); });
  // wet sawdust and coffee grounds: the fungus bed's substrate
  A.add('ec_substrate', 16, 16, (pc) => {
    pc.each((x, y) => { const n = ph(x, y, 121); pc.set(x, y, n < 0.1 ? 0xd8d0c0 : n < 0.25 ? 0x8a6a42 : n < 0.7 ? 0x3a2818 : 0x2a1c12); });
  });
});

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const rnd = (i: number, k: number) => ((Math.sin(i * 127.1 + k * 311.7) * 43758.5453) % 1 + 1) % 1;

/**
 * One plant (or one cluster of fungus) of a look at (x, y, z), y being the soil
 * surface. i varies the shape between neighbours.
 */
export function drawPlant(mb: ModelBuilder, look: PlantLook, x: number, y: number, z: number, stage: number, dead: boolean, i = 0) {
  const st = Math.max(0, Math.min(5, Math.floor(stage)));
  const rot = st >= 5 || dead;
  const g = st <= 0 ? 0.15 : Math.min(1, 0.25 + st * 0.19);
  mb.push().translate(x, y, z).rotateY(rnd(i, 1) * 6.28);
  switch (look) {
    case 'moss': {
      // low cushions that spread, then send up glowing pale sporophytes
      const n = 3 + Math.min(4, st);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * 6.28 + rnd(i, k), r = 0.04 + 0.12 * g * rnd(i, k + 9);
        mb.sphere(Math.cos(a) * r, 0, Math.sin(a) * r, (0.035 + 0.04 * g) * (0.7 + rnd(i, k + 3) * 0.6), 7, 4, 'ec_moss', { sy: 0.45, color: rot ? 0x8a7a4a : 0xffffff, emissive: rot ? 0 : 0.18 });
      }
      if (st >= 3 && !rot) for (let k = 0; k < 6; k++) { const a = k * 1.1 + rnd(i, k); mb.cylinder(Math.cos(a) * 0.06, 0.01, Math.sin(a) * 0.06, 0.003, 0.05 + st * 0.008, 3, 'ec_stalk', { color: 0xc8e8a0 }); mb.sphere(Math.cos(a) * 0.06, 0.06 + st * 0.008, Math.sin(a) * 0.06, 0.007, 4, 3, 'plastic_white', { color: 0xe8ffc0, emissive: 1.2 }); }
      break;
    }
    case 'thistle': {
      const h = 0.06 + 0.42 * g;
      // a rosette of spined leaves, then the stalk and its weeping heads
      for (let k = 0; k < 5; k++) { mb.push().rotateY(k * 1.26).rotateX(-0.9 + g * 0.3); mb.flat(0, 0.02, 0.07 * g + 0.02, 0.07 + 0.06 * g, 0.16 * g + 0.04, 'ec_thistle', { color: rot ? 0x9a8a5a : 0xffffff }); mb.pop(); }
      if (st >= 2) {
        mb.cylinder(0, 0, 0, 0.008, h, 5, 'ec_stalk', { color: rot ? 0x8a7a5a : 0x7a9a6a });
        const heads = st >= 3 ? 3 : 1;
        for (let k = 0; k < heads; k++) {
          const hx = k ? (k === 1 ? 0.05 : -0.04) : 0, hy = h - k * 0.07;
          if (k) mb.cylinder(0, hy - 0.04, 0, 0.005, 0.05, 4, 'ec_stalk', { color: 0x7a9a6a });
          mb.sphere(hx, hy, 0, 0.025 + (st >= 4 ? 0.01 : 0), 7, 5, 'ec_moss', { color: rot ? 0x6a5a3a : 0x8aa070 });
          if (st >= 3) mb.sphere(hx, hy + 0.025, 0, 0.022, 7, 4, 'plastic_white', { color: rot ? 0x8a7a6a : st >= 4 ? 0xf2ecd8 : 0xb88ad8, sy: 0.7 });
          // the bead of almond water hanging under a ripe head
          if (st === 4 && !dead) mb.sphere(hx + 0.01, hy - 0.035, 0.01, 0.009, 5, 4, 'plastic_white', { color: 0xfff4d0, emissive: 0.5 });
        }
      }
      break;
    }
    case 'tuber': {
      const leaf = rot ? 0x8a7a4a : 0x7aa860;
      if (st >= 1) for (let k = 0; k < 3; k++) mb.cross(0.02 * (k - 1), 0, 0, 0.12 + 0.16 * g, 0.08 + 0.2 * g, 'grass', { color: leaf, rot: k * 0.8, sway: 0.5 });
      // pale tubers shouldering out of the soil, eyes and all
      if (st >= 3) for (let k = 0; k < (st >= 4 ? 4 : 2); k++) { const a = k * 1.7 + 0.4; mb.sphere(Math.cos(a) * 0.07, 0.005, Math.sin(a) * 0.07, 0.03 + (st >= 4 ? 0.012 : 0), 7, 5, 'ec_stalk', { color: rot ? 0x8a7050 : 0xe8dcc0, sy: 0.7 }); }
      if (st <= 0) mb.sphere(0, 0, 0, 0.015, 5, 3, 'ec_stalk', { color: 0xd8c8a8 });
      break;
    }
    case 'ear': {
      // stacked shelves on a sodden lump of wallpaper and lath
      mb.box(0, 0, 0, 0.08, 0.06 + 0.1 * g, 0.06, 'plank', { color: 0x6a5a48 });
      const n = st <= 0 ? 0 : Math.min(4, st);
      for (let k = 0; k < n; k++) {
        const r = (0.03 + 0.05 * g) * (1 - k * 0.15), yy = 0.02 + k * 0.045;
        mb.push().translate(0, yy, 0.03).rotateY(k * 0.5 - 0.6);
        mb.sphere(0, 0, r * 0.45, r, 9, 4, 'ec_ear', { sy: 0.22, color: rot ? 0x6a5040 : 0xffffff });
        mb.pop();
      }
      if (st <= 0) mb.sphere(0, 0.04, 0.03, 0.01, 5, 3, 'plastic_white', { color: 0xf0e8d8 });
      break;
    }
    case 'morel': {
      const n = st <= 0 ? 1 : 1 + Math.min(3, st);
      for (let k = 0; k < n; k++) {
        const a = k * 2.2 + rnd(i, k), r = k ? 0.05 : 0;
        const h = (0.02 + 0.06 * g) * (1 - k * 0.12);
        const px = Math.cos(a) * r, pz = Math.sin(a) * r;
        mb.cylinder(px, 0, pz, 0.012 + 0.008 * g, h * 0.45, 6, 'ec_stalk', { rTop: 0.01 + 0.006 * g, color: rot ? 0x8a7a60 : 0xf0e8d4 });
        mb.sphere(px, h * 0.45 + h * 0.4, pz, 0.016 + 0.014 * g, 8, 6, 'ec_morel', { sy: 1.7, color: rot ? 0x5a4a3a : 0xffffff });
      }
      break;
    }
    case 'humcap': {
      // a tight cluster of thin stalks and slate caps, tilted toward the nearest hum
      const n = st <= 0 ? 2 : 3 + st * 2;
      for (let k = 0; k < n; k++) {
        const a = k * 2.4 + rnd(i, k) * 0.6, r = 0.012 + 0.05 * rnd(i, k + 5) * g;
        const h = (0.03 + 0.07 * g) * (0.6 + rnd(i, k + 7) * 0.5);
        const px = Math.cos(a) * r, pz = Math.sin(a) * r;
        mb.cylinder(px, 0, pz, 0.003, h, 4, 'ec_stalk', { color: 0xd8e0e8 });
        mb.sphere(px, h, pz, 0.008 + 0.01 * g, 7, 4, 'ec_humcap', { sy: 0.5, color: rot ? 0x5a5a5a : 0xffffff, emissive: rot ? 0 : 0.25 });
      }
      break;
    }
    case 'puffball': {
      const r = 0.02 + 0.09 * g;
      if (rot) {
        // split open: a brown husk and a stain of spore dust round it
        mb.sphere(0, r * 0.4, 0, r, 9, 5, 'ec_puff', { sy: 0.55, color: 0x8a6a42 });
        mb.flat(0, 0.004, 0, r * 3, r * 3, 'ec_substrate', { color: 0x6a5032 });
      } else {
        mb.sphere(0, r * 0.8, 0, r, 10, 7, 'ec_puff', { sy: 0.85 });
        if (st >= 2) mb.sphere(r * 1.1, r * 0.35, 0.02, r * 0.45, 8, 5, 'ec_puff', { sy: 0.85 });
      }
      break;
    }
    case 'truffle': {
      // black knuckles in a scrape of ceiling-tile grit
      mb.flat(0, 0.003, 0, 0.2, 0.2, 'ec_substrate', { color: 0xd8d0c0 });
      for (let k = 0; k < 2 + Math.min(3, st); k++) { const a = k * 2.1; mb.sphere(Math.cos(a) * 0.05, 0.012, Math.sin(a) * 0.05, 0.018 + rnd(i, k) * 0.01, 7, 5, 'ec_morel', { color: 0x2a2220, sy: 0.8 }); }
      break;
    }
  }
  mb.pop();
}

/** a row of plants across a planter top (the welded planter and the hydro rack call this for the new crops) */
export function plantRow(mb: ModelBuilder, look: PlantLook, s: Record<string, any>, y: number, w: number, n: number) {
  const st = Math.floor(s.stage ?? 0);
  for (let i = 0; i < n; i++) drawPlant(mb, look, -w / 2 + (i + 0.5) * (w / n), y, lerp(-0.05, 0.05, rnd(i, 2)), st, !!s.dead, i);
}
