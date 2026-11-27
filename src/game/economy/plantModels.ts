// How the backrooms crops and fungi look growing: in a planter, a hydro rack,
// a fungus bed and on the forage spots out in the levels. Stage 0 is a seeded
// speck, 1 sprouting, 2 growing, 3 flowering / pinning, 4 ready, 5 past it
// (rotting); `dead` is withered. Textures are world-atlas pixel art.
import type { ModelBuilder } from '../../gfx/modelBuilder';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { makeRamp, ph, bayer } from '../../gfx/pixel';

export type PlantLook = 'moss' | 'thistle' | 'tuber' | 'ear' | 'morel' | 'humcap' | 'puffball' | 'truffle'
  // round 25: the grow-room crops (bluecap, strip cress, exit-sign pepper, lint cotton, hush mint)
  | 'bluecap' | 'cress' | 'pepper' | 'cotton' | 'mint';
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
  // round 25 — bluecap: a deep blue cap, pale freckles, a darker rim
  A.add('ec_bluecap', 16, 16, (pc) => {
    const R = makeRamp(0x2a5ab8, 6, { spread: 0.6 });
    pc.each((x, y) => { const d = Math.hypot(x - 7.5, y - 7.5), n = ph(x, y, 131); pc.set(x, y, n < 0.08 ? 0xd8ecff : d > 6.6 ? R[1] : R[2 + Math.floor((1 - d / 8) * 2.4 + (bayer(x, y) > 0.6 ? 1 : 0))]); });
  });
  // the gills under a bluecap: fine radial lines that glow cyan
  A.add('ec_gill', 16, 16, (pc) => {
    pc.each((x, y) => { const a = Math.atan2(y - 7.5, x - 7.5), d = Math.hypot(x - 7.5, y - 7.5); const line = Math.abs(Math.sin(a * 9)) < 0.35; pc.set(x, y, d < 1.6 ? 0xd8e8f0 : line ? 0x8af0ff : 0x3a8ab8); });
  });
  // a round cress leaf on a pale stalk (alpha round it)
  A.add('ec_cress', 8, 8, (pc) => {
    pc.each((x, y) => { const d = Math.hypot(x - 3.5, y - 3.2); if (d < 3.4) pc.set(x, y, d > 2.7 ? 0x3a7a2a : x === 3 || (x + y) % 5 === 0 ? 0x9ae070 : 0x6ac04a); });
  });
  // a hush mint leaf: oval, serrated, veined
  A.add('ec_mint', 12, 16, (pc) => {
    for (let y = 0; y < 16; y++) {
      const w = Math.round(Math.sin(((y + 0.5) / 16) * Math.PI) * 5.4) + (y % 2 ? 0 : 1);
      for (let x = 6 - w; x <= 5 + w; x++) if (x >= 0 && x < 12) pc.set(x, y, x === 5 || x === 6 ? 0xb8e0b0 : Math.abs(x - 5.5) >= w - 0.5 ? 0x2a5a3a : (x * 2 + y) % 6 === 0 ? 0x8ac890 : 0x4a9a62);
    }
  });
  // a pepper leaf: long, glossy, a pale midrib
  A.add('ec_pleaf', 8, 16, (pc) => {
    for (let y = 0; y < 16; y++) { const w = Math.round(Math.sin(((y + 0.5) / 16) * Math.PI) * 3.4); for (let x = 4 - w; x < 4 + w; x++) pc.set(x, y, x === 3 ? 0xa8d888 : x === 4 - w ? 0x2a5a22 : y < 5 ? 0x5aa040 : 0x4a8a34); }
  });
  // a ripe exit-sign pepper: glossy red with a hot highlight
  A.add('ec_pepper', 8, 8, (pc) => { pc.each((x, y) => pc.set(x, y, x === 1 && y < 6 ? 0xffb0a0 : x < 3 ? 0xff3a2a : x > 5 ? 0x8a1410 : 0xd8221a)); });
  // lint cotton: a matted grey-white boll of duct lint, a thread or two of colour in it
  A.add('ec_boll', 16, 16, (pc) => {
    pc.each((x, y) => { const n = ph(x, y, 141), m = ph(x >> 1, y >> 1, 142); pc.set(x, y, n < 0.05 ? 0x8a6aa8 : n < 0.09 ? 0xc85a4a : m < 0.25 ? 0xb8b4ac : m > 0.75 ? 0xf4f2ee : 0xdcd8d0); });
  });
  // a lobed cotton leaf
  A.add('ec_cleaf', 12, 12, (pc) => {
    pc.each((x, y) => { const a = Math.atan2(y - 9, x - 5.5), d = Math.hypot(x - 5.5, y - 9); const r = 5.2 + Math.cos(a * 3) * 1.4; if (d < r) pc.set(x, y, d > r - 0.9 ? 0x3a5a30 : Math.abs(x - 5.5) < 0.6 ? 0x9ab88a : 0x5a7a48); });
  });
  // trouble: mite webbing (fine white threads) and grey blight mould
  A.add('ec_web', 16, 16, (pc) => {
    for (let i = 0; i < 9; i++) pc.line(ph(i, 1, 151) * 15, ph(i, 2, 151) * 15, ph(i, 3, 151) * 15, ph(i, 4, 151) * 15, 0xf0f0f0, 150);
    for (let i = 0; i < 6; i++) pc.set(Math.floor(ph(i, 5, 151) * 15), Math.floor(ph(i, 6, 151) * 15), 0x8a1a12);
  });
  A.add('ec_mould', 8, 8, (pc) => { pc.each((x, y) => { const n = ph(x, y, 161); pc.set(x, y, n < 0.3 ? 0xe8ece0 : n < 0.6 ? 0xb8bca8 : n < 0.8 ? 0x8a8a70 : 0x5a5a40); }); });
});


const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const BIG = new Set<PlantLook>(['bluecap', 'cress', 'pepper', 'cotton', 'mint']);
/** a two-sided leaf card lying along +z from the current origin (w across, d along), its tip `off` out from the stem */
function leaf2(mb: ModelBuilder, w: number, d: number, tex: string, color: number, emissive = 0, off = d / 2) {
  mb.flat(0, 0, off, w, d, tex, { color, emissive, sway: 0.4 });
  mb.push().rotateX(Math.PI); mb.flat(0, -0.0004, -off, w, d, tex, { color: scaleCol(color, 0.82), emissive, sway: 0.4 }); mb.pop();
}
const scaleCol = (c: number, k: number) => (Math.round(((c >> 16) & 255) * k) << 16) | (Math.round(((c >> 8) & 255) * k) << 8) | Math.round((c & 255) * k);
/**
 * Trouble on a plant (round 25): lint mites (pinhead red mites, a white web between the leaves) and blight (grey
 * mould puffs, brown spots). `amt` 0..1 is how bad it has got.
 */
export function drawTrouble(mb: ModelBuilder, x: number, y: number, z: number, stage: number, pest: number, blight: number, i = 0) {
  const h = 0.04 + Math.min(4, stage) * 0.035;
  mb.push().translate(x, y, z).rotateY(rnd(i, 21) * 6.28);
  if (pest > 0.02) {
    const n = 3 + Math.round(pest * 9);
    for (let k = 0; k < n; k++) { const a = k * 2.4, r = 0.02 + 0.06 * rnd(i, k + 30); mb.sphere(Math.cos(a) * r, h * (0.3 + 0.9 * rnd(i, k + 31)), Math.sin(a) * r, 0.0065, 5, 3, 'plastic_white', { color: 0xd82a1a, emissive: 0.15 }); }
    // the webbing they spin between the leaves, double-sided so it catches the light from either side
    if (pest > 0.3) for (let k = 0; k < 3; k++) { mb.push().translate(0, h * (0.5 + k * 0.25), 0).rotateY(k * 1.3).rotateX(-1.2); mb.flat(0, 0, 0, 0.1 + pest * 0.08, 0.08 + pest * 0.05, 'ec_web', { color: 0xffffff }); mb.rotateX(Math.PI); mb.flat(0, 0.001, 0, 0.1 + pest * 0.08, 0.08 + pest * 0.05, 'ec_web', { color: 0xe8e8e8 }); mb.pop(); }
  }
  if (blight > 0.02) {
    const n = 2 + Math.round(blight * 7);
    for (let k = 0; k < n; k++) { const a = k * 2.1 + 0.5, r = 0.015 + 0.05 * rnd(i, k + 50); mb.sphere(Math.cos(a) * r, h * (0.15 + 0.6 * rnd(i, k + 51)), Math.sin(a) * r, 0.008 + blight * 0.01 * rnd(i, k + 52), 5, 4, 'ec_mould', { sy: 0.7, color: 0xf0f0e8 }); }
    mb.flat(0, 0.003, 0, 0.12 + blight * 0.08, 0.12 + blight * 0.08, 'ec_mould', { color: 0x9a9a80 });
  }
  mb.pop();
}
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
  // round 25: the grow-room crops are drawn a little larger so their stages read from the isometric camera
  if (BIG.has(look)) mb.scale(1.7, 1.7, 1.7);
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
    // ---------------------------------------------------------------- round 25: the grow-room crops
    case 'bluecap': {
      // a knot of white mycelium, pins, closed domes, then broad caps lifting to show cyan-glowing gills
      // the white mycelium knot shows while it pins; under grown caps only a fringe of it
      mb.flat(0, 0.002, 0, st <= 1 ? 0.12 : 0.07, st <= 1 ? 0.12 : 0.07, 'ec_mould', { color: st <= 1 ? 0xf4f2ea : 0xb8b4a8, rot: rnd(i, 3) * 3 });
      const n = st <= 0 ? 0 : 2 + Math.min(5, st + 1);
      if (st <= 0) for (let k = 0; k < 4; k++) mb.sphere(Math.cos(k * 1.7) * 0.03, 0.006, Math.sin(k * 1.7) * 0.03, 0.006, 4, 3, 'plastic_white', { color: 0xf8f6f0 });
      for (let k = 0; k < n; k++) {
        const a = k * 2.399 + rnd(i, k) * 0.5, r = k ? 0.025 + 0.05 * rnd(i, k + 4) : 0;
        const big = (k === 0 ? 1 : 0.55 + rnd(i, k + 2) * 0.4) * g;
        const h = 0.025 + 0.11 * big, cr = st <= 1 ? 0.01 : 0.014 + 0.045 * big;
        const px = Math.cos(a) * r, pz = Math.sin(a) * r;
        mb.push().translate(px, 0, pz).rotateZ(rot ? 0.5 + rnd(i, k) * 0.4 : (rnd(i, k + 8) - 0.5) * 0.3).rotateX(rot ? 0.3 : 0);
        mb.cylinder(0, 0, 0, 0.004 + 0.006 * big, h, 6, 'ec_stalk', { rTop: 0.003 + 0.005 * big, color: rot ? 0x6a6050 : 0xf0f4f8 });
        if (st >= 2) mb.cylinder(0, h - 0.004, 0, 0.007 + 0.006 * big, 0.004, 6, 'ec_stalk', { color: rot ? 0x5a5040 : 0xd8e4f0 });
        const open = st >= 3 ? (st >= 4 ? 0.36 : 0.55) : 0.95;
        mb.sphere(0, h, 0, cr, 9, 5, 'ec_bluecap', { sy: open, color: rot ? 0x3a3028 : 0xffffff, emissive: rot ? 0 : 0.12 });
        if (st >= 3 && !rot) mb.cylinder(0, h - cr * open * 0.55, 0, cr * 0.92, 0.003, 9, 'ec_gill', { rTop: cr * 0.25, emissive: st >= 4 ? 1.3 : 0.6 });
        mb.pop();
      }
      if (rot) mb.flat(0.02, 0.003, 0.01, 0.12, 0.1, 'ec_substrate', { color: 0x3a4a5a });
      break;
    }
    case 'cress': {
      // strip cress on its felt pad: seed specks, a white fuzz of sprouts, then a dense mat of round leaves
      mb.flat(0, 0.002, 0, 0.2, 0.16, 'ec_substrate', { color: 0xd8ccb8, rot: rnd(i, 1) });
      const n = st <= 0 ? 10 : 9 + st * 5;
      for (let k = 0; k < n; k++) {
        const px = (rnd(i, k) - 0.5) * 0.17, pz = (rnd(i, k + 40) - 0.5) * 0.13;
        if (st <= 0) { mb.sphere(px, 0.004, pz, 0.0035, 4, 3, 'plastic_white', { color: 0x8a5a3a }); continue; }
        const h = (0.012 + 0.03 * g) * (0.7 + rnd(i, k + 7) * 0.6), lean = (rnd(i, k + 9) - 0.5) * (rot ? 1.4 : 0.4);
        mb.push().translate(px, 0, pz).rotateY(rnd(i, k + 3) * 6.28).rotateZ(lean);
        mb.cylinder(0, 0, 0, 0.0016, h, 3, 'ec_stalk', { color: rot ? 0xa89060 : 0xf0f4e0 });
        const lw = 0.008 + 0.012 * g;
        for (const s2 of [-1, 1]) { mb.push().translate(s2 * lw * 0.45, h, 0).rotateZ(s2 * 0.35); leaf2(mb, lw, lw, 'ec_cress', rot ? 0xb89848 : st >= 4 ? 0xeaffd8 : 0xffffff, st >= 3 && !rot ? 0.12 : 0); mb.pop(); }
        if (st >= 4 && !rot && k % 7 === 0) mb.sphere(0, h + 0.006, 0, 0.003, 4, 3, 'plastic_white', { color: 0xffffff, emissive: 0.4 });
        mb.pop();
      }
      break;
    }
    case 'pepper': {
      // exit-sign pepper: a woody stem, glossy paired leaves, white star flowers, then red pods that glow like the sign
      if (st <= 0) { mb.sphere(0, 0.004, 0, 0.006, 5, 3, 'plastic_white', { color: 0xe8d8a0 }); break; }
      const h = 0.04 + 0.2 * g;
      mb.cylinder(0, 0, 0, 0.005 + 0.004 * g, h, 5, 'ec_stalk', { rTop: 0.003, color: rot ? 0x6a5a3a : 0x6a8a4a });
      const pairs = st <= 1 ? 1 : 2 + st;
      for (let k = 0; k < pairs; k++) {
        const yy = h * (0.35 + 0.65 * (k + 1) / (pairs + 0.5)), a = k * 1.9 + rnd(i, k);
        for (const s2 of [-1, 1]) {
          mb.push().translate(0, yy, 0).rotateY(a + (s2 > 0 ? 0 : Math.PI)).rotateZ(-(rot ? 1.4 : 0.7 + 0.2 * rnd(i, k)));
          leaf2(mb, 0.018 + 0.016 * g, 0.04 + 0.03 * g, 'ec_pleaf', rot ? 0x9a7a3a : 0xffffff, 0, 0.022 + 0.015 * g);
          mb.pop();
        }
        if (st === 3 && k % 2 === 0) mb.sphere(Math.cos(a) * 0.03, yy - 0.006, Math.sin(a) * 0.03, 0.006, 5, 3, 'plastic_white', { color: 0xfffaf0, emissive: 0.3 });
        if (st >= 4 && k >= 1) {
          // a pod hangs from each pair: tapered, curled at the tip
          const px = Math.cos(a) * 0.04, pz = Math.sin(a) * 0.04, L = rot ? 0.03 : 0.06;
          mb.push().translate(px, yy - 0.004, pz).rotateZ(Math.PI - 0.35 + rnd(i, k) * 0.3);
          mb.cylinder(0, 0, 0, rot ? 0.006 : 0.012, L, 7, 'ec_pepper', { rTop: 0.002, color: rot ? 0x5a2a1a : 0xffffff, emissive: rot ? 0 : 0.55 });
          mb.cylinder(0, -0.006, 0, 0.004, 0.007, 5, 'ec_stalk', { color: 0x4a7a2a });
          mb.pop();
        }
      }
      break;
    }
    case 'cotton': {
      // lint cotton: grey-green woody stems with lobed leaves, green bolls, then bolls split into grey duct fluff
      if (st <= 0) { for (let k = 0; k < 3; k++) mb.sphere((k - 1) * 0.02, 0.004, 0, 0.005, 4, 3, 'ec_boll', { color: 0xd8d4cc }); break; }
      const h = 0.05 + 0.26 * g;
      const stems = st <= 1 ? 1 : 3;
      for (let k = 0; k < stems; k++) {
        const a = k * 2.1 + rnd(i, k), lean = k ? 0.25 : 0;
        mb.push().rotateY(a).rotateZ(lean);
        mb.cylinder(0, 0, 0, 0.005, h * (k ? 0.8 : 1), 5, 'ec_stalk', { rTop: 0.003, color: rot ? 0x5a4a3a : 0x7a7a5a });
        for (let l = 0; l < 2 + Math.min(3, st); l++) {
          mb.push().translate(0, h * (0.25 + l * 0.16), 0).rotateY(l * 2.4).rotateZ(-(rot ? 1.3 : 0.8));
          leaf2(mb, 0.03 + 0.02 * g, 0.03 + 0.02 * g, 'ec_cleaf', rot ? 0x8a7a4a : 0xffffff, 0, 0.018);
          mb.pop();
        }
        if (st >= 3) {
          const by = h * (k ? 0.8 : 1);
          if (st === 3) mb.sphere(0, by, 0, 0.014, 7, 5, 'ec_moss', { color: 0x8aa060, sy: 1.2 });
          else {
            // burst: four lobes of lint round a split brown husk
            for (let q = 0; q < 4; q++) { const qa = q * 1.571 + 0.3; mb.sphere(Math.cos(qa) * 0.012, by + 0.008, Math.sin(qa) * 0.012, 0.015 + (rot ? -0.004 : 0), 7, 5, 'ec_boll', { color: rot ? 0x9a9080 : 0xffffff, emissive: rot ? 0 : 0.05 }); }
            for (let q = 0; q < 4; q++) { const qa = q * 1.571 + 1.08; mb.push().translate(Math.cos(qa) * 0.014, by - 0.004, Math.sin(qa) * 0.014).rotateY(-qa).rotateX(0.9); mb.box(0, 0, 0, 0.012, 0.016, 0.003, 'plank', { color: 0x6a4a2a, bevel: false }); mb.pop(); }
          }
        }
        mb.pop();
      }
      break;
    }
    case 'mint': {
      // hush mint: square stems, opposite leaf pairs turning a quarter each node, lilac flower spikes that hum
      if (st <= 0) { mb.sphere(0, 0.004, 0, 0.004, 4, 3, 'plastic_white', { color: 0x4a3a2a }); mb.sphere(0.012, 0.004, 0.006, 0.004, 4, 3, 'plastic_white', { color: 0x4a3a2a }); break; }
      const stems = st <= 1 ? 1 : 2 + Math.min(3, st);
      for (let k = 0; k < stems; k++) {
        const a = k * 2.4 + rnd(i, k), r = k ? 0.035 + 0.02 * rnd(i, k + 5) : 0;
        const h = (0.03 + 0.16 * g) * (k ? 0.75 + rnd(i, k + 2) * 0.3 : 1);
        mb.push().translate(Math.cos(a) * r, 0, Math.sin(a) * r).rotateZ(rot ? 0.6 : (rnd(i, k + 1) - 0.5) * 0.25);
        mb.box(0, 0, 0, 0.004, h, 0.004, 'ec_stalk', { color: rot ? 0x5a4a3a : 0x6a4a6a, bevel: false });
        const nodes = Math.max(1, Math.round(h / 0.035));
        for (let l = 0; l < nodes; l++) {
          const yy = h * (0.3 + 0.7 * (l + 1) / (nodes + 0.3)), sz = (0.016 + 0.02 * g) * (1 - l * 0.12);
          for (const s2 of [-1, 1]) {
            mb.push().translate(0, yy, 0).rotateY(l * 1.571 + (s2 > 0 ? 0 : Math.PI)).rotateZ(-(rot ? 1.5 : 0.55));
            leaf2(mb, sz * 0.75, sz, 'ec_mint', rot ? 0x6a5a3a : 0xffffff, 0, sz * 0.5);
            if (rot && l % 2 === 0) mb.sphere(0.006, 0.002, sz * 0.4, 0.003, 4, 3, 'plastic_white', { color: 0x2a2018 });
            mb.pop();
          }
        }
        if (st >= 3 && !rot) for (let f = 0; f < 5; f++) mb.sphere(0, h + 0.006 + f * 0.007, 0, 0.007 - f * 0.0008, 5, 4, 'plastic_white', { color: st >= 4 ? 0xb88ae8 : 0xd8c8f0, emissive: st >= 4 ? 0.35 : 0.1 });
        mb.pop();
      }
      break;
    }
  }
  mb.pop();
}

/** a row of plants across a planter top (the welded planter and the hydro rack call this for the new crops) */
export function plantRow(mb: ModelBuilder, look: PlantLook, s: Record<string, any>, y: number, w: number, n: number) {
  const st = Math.floor(s.stage ?? 0);
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (i + 0.5) * (w / n), z = lerp(-0.05, 0.05, rnd(i, 2));
    drawPlant(mb, look, x, y, z, st, !!s.dead, i);
    if ((s.pest ?? 0) > 0.02 || (s.blight ?? 0) > 0.02) drawTrouble(mb, x, y, z, st, s.pest ?? 0, s.blight ?? 0, i);
  }
}
/** the variant key a planter's look depends on (crop, stage, death, damp, trouble) */
export const plantVariant = (s: Record<string, any>) => `${s.crop ?? ''}:${Math.floor(s.stage ?? 0)}:${s.dead ? 1 : 0}:${(s.water ?? 0) > 20 ? 1 : 0}:${Math.round((s.pest ?? 0) * 3)}:${Math.round((s.blight ?? 0) * 3)}:${s.tilled ? 1 : 0}`;
