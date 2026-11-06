// THE REMAINS KIT — what is left when something here has eaten. Props and
// decals for the dead of the backrooms, placed by ./scatter.ts through the
// zone generators' post-generation hook and fed on by the Giant Bumble Bees
// (src/creatures/species/bumble_bee.ts, via ./life.ts).
//
//   rm_bones       picked-over bones: a femur gnawed to the marrow, ribs, a jaw, vertebrae
//   rm_carcass     a half-eaten inhabitant (v 0 a stilt doe, 1 a grinhound, 2 a bee husk)
//   rm_unit        an old unit in torn Meridian hazmat (v 0 on its back, 1 face down and
//                  dragged, 2 the top half), mask still on
//   rm_gore_pile   a heap of offal: loops of gut, torn chunks, bone chips, a fresh shine
//   decals         rm_pool (old pool with a dried rim), rm_smear, rm_trail (drag marks),
//                  rm_spatter, rm_hand (bloody handprints, for walls too), rm_prints
//
// Fleshed remains carry state.eaten (0..3): each pass of the bees takes more
// of the soft parts and the model goes to bone (the variant key includes it).
// All of it is lootable (pile containers) and scannable (the watch reads a
// clue off it: ./life.ts). Texture prefix: rm_
import { defObj } from '../objects';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { makeRamp, mixHex, ph, tileFbm } from '../../content/furniture/b_common';
import type { PixelCanvas } from '../../gfx/pixel';
import type { ModelBuilder } from '../../gfx/modelBuilder';
import { blob, tube, lathe, surf, spike, type V3 } from '../../creatures/kit/anomalies';
import { defLoot } from '../../items/loot';
import { bakeDeadUnit } from './corpse';

export const REMAINS_TAG = 'remains';
/** keys of the props with soft parts left on them (the bees' larder) */
export const FLESHED = new Set(['rm_carcass', 'rm_unit', 'rm_gore_pile']);

// ====================================================================== textures
const BLOOD = { wet: 0x7a1410, deep: 0x4a0a08, dry: 0x5a2418, crust: 0x3a1a12, hi: 0xc84a3a };
const P = (x: number, y: number, z: number): V3 => [x, y, z];

/** bone: an old ivory, darker in the grooves, pitted, with brown tooth scores across it */
function bone(pc: PixelCanvas, seed: number, gnawed = true) {
  const R = makeRamp(0xd8ccae, 7, { spread: 0.4, hueShift: 0.03 });
  pc.fillRamp(R, (x, y) => 0.55 + (tileFbm(x, y, pc.w, pc.h, 3, 3, seed) - 0.5) * 0.4 + Math.sin(y * 0.9 + x * 0.1) * 0.05, 0.6);
  for (let i = 0; i < 10; i++) pc.blend(Math.floor(ph(i, 1, seed) * pc.w), Math.floor(ph(i, 2, seed) * pc.h), 0x7a6a52, 0.6);
  if (gnawed) for (let k = 0; k < 6; k++) {
    const x0 = ph(k, 3, seed) * pc.w, y0 = ph(k, 4, seed) * pc.h, a = ph(k, 5, seed) * 3;
    for (let s = 0; s < 5; s++) { pc.blend(Math.round(x0 + Math.cos(a) * s), Math.round(y0 + Math.sin(a) * s), 0x5a4030, 0.55); pc.blend(Math.round(x0 + Math.cos(a) * s), Math.round(y0 + Math.sin(a) * s) + 1, 0xf0e8d0, 0.3); }
  }
  // dried gristle in the hollows
  for (let k = 0; k < 3; k++) pc.ellipseBlend(ph(k, 6, seed) * pc.w, ph(k, 7, seed) * pc.h, 2, 1.4, BLOOD.dry, 0.55);
}
/** raw meat: dark muscle grain, ribbons of fat, a wet shine */
function flesh(pc: PixelCanvas, seed: number, old = 0) {
  const R = makeRamp(mixHex(0x9a2a22, 0x6a2a20, old), 7, { spread: 0.5, hueShift: -0.02 });
  pc.fillRamp(R, (x, y) => 0.45 + Math.sin(x * 0.7 + Math.sin(y * 0.35 + seed) * 2) * 0.12 + (tileFbm(x, y, pc.w, pc.h, 4, 2, seed) - 0.5) * 0.35, 0.6);
  // marbling: fat runs across the grain
  for (let k = 0; k < 4; k++) {
    let x = ph(k, 1, seed) * pc.w, y = ph(k, 2, seed) * pc.h;
    for (let s = 0; s < 18; s++) { x += 1; y += Math.sin(s * 0.5 + k) * 0.8; pc.blend(Math.round(x), Math.round(y), mixHex(0xe8c8a0, 0xc8a070, old), 0.5); }
  }
  // gloss: tight white glints where it is still wet
  if (old < 0.7) for (let i = 0; i < 6; i++) { const x = Math.floor(ph(i, 3, seed) * pc.w), y = Math.floor(ph(i, 4, seed) * pc.h); pc.blend(x, y, 0xfff0e8, 0.8); pc.blend(x + 1, y, 0xffd0c8, 0.35); }
  if (old > 0) for (let i = 0; i < 18; i++) pc.blend(Math.floor(ph(i, 5, seed) * pc.w), Math.floor(ph(i, 6, seed) * pc.h), 0x3a1410, 0.5 * old);
}
/** gut: a glossy pink-grey loop, veined, with a dark seam */
function guts(pc: PixelCanvas) {
  const R = makeRamp(0xc8787a, 6, { spread: 0.45 });
  pc.fillRamp(R, (x, y) => 0.5 + Math.cos((y / pc.h) * Math.PI * 2) * 0.22 + (tileFbm(x, y, pc.w, pc.h, 3, 2, 71) - 0.5) * 0.3, 0.6);
  for (let k = 0; k < 4; k++) { let x = ph(k, 1, 72) * pc.w, y = 0; for (let s = 0; s < pc.h; s++) { x += Math.sin(s * 0.6 + k) * 0.7; y = s; pc.blend(Math.round(x), y, 0x8a2a4a, 0.5); } }
  for (let x = 0; x < pc.w; x++) pc.blend(x, pc.h >> 1, 0x5a2a2a, 0.3);
  for (let i = 0; i < 8; i++) pc.blend(Math.floor(ph(i, 3, 73) * pc.w), Math.floor(ph(i, 4, 73) * pc.h), 0xfff0f0, 0.75);
}
/** hide: short coarse fur, matted with dried blood toward the wound edge (bottom rows) */
function hide(pc: PixelCanvas, base: number, seed: number) {
  const R = makeRamp(base, 7, { spread: 0.45 });
  pc.each((x, y) => {
    const strand = (y + Math.floor(ph(x, 1, seed) * 4)) % 4;
    const v = 0.5 + (tileFbm(x, y, pc.w, pc.h, 3, 2, seed) - 0.5) * 0.4 + strand * 0.07 - 0.1 + (ph(x * 3, y * 7, seed) - 0.5) * 0.25;
    pc.set(x, y, R[Math.max(0, Math.min(6, Math.floor(v * 7)))]);
  });
  for (let y = Math.floor(pc.h * 0.6); y < pc.h; y++) for (let x = 0; x < pc.w; x++) if (ph(x, y, seed + 3) < (y / pc.h - 0.55) * 1.6) pc.blend(x, y, BLOOD.dry, 0.65);
}
/** Meridian hazmat: glossy safety-yellow PVC, creased, grimed, torn edges browned */
function hazmat(pc: PixelCanvas, seed: number, filth: number) {
  const R = makeRamp(0xe8c228, 7, { spread: 0.5, hueShift: 0.04 });
  pc.fillRamp(R, (x, y) => 0.6 + Math.sin(x * 0.45 + Math.sin(y * 0.3) * 1.5 + seed) * 0.12 + (tileFbm(x, y, pc.w, pc.h, 3, 2, seed) - 0.5) * 0.25, 0.6);
  // creases
  for (let k = 0; k < 5; k++) { const y0 = ph(k, 1, seed) * pc.h; for (let x = 0; x < pc.w; x++) { const y = Math.round(y0 + Math.sin(x * 0.3 + k) * 1.5); pc.blend(x, y, 0x8a6a10, 0.4); pc.blend(x, y - 1, 0xfff4b0, 0.3); } }
  // seam tape
  for (let y = 0; y < pc.h; y++) { pc.blend(pc.w >> 1, y, 0x6a6a64, 0.7); pc.blend((pc.w >> 1) + 1, y, 0x9a9a90, 0.5); }
  pc.grime(0x4a3a20, 0.4 * filth + 0.15, 4, seed, 0.5);
  for (let i = 0; i < 6 * filth; i++) pc.ellipseBlend(ph(i, 4, seed) * pc.w, ph(i, 5, seed) * pc.h, 2 + ph(i, 6, seed) * 3, 1.5 + ph(i, 7, seed) * 2, BLOOD.dry, 0.6);
}

addTextureModule(() => {
  const A = atlas();
  A.add('rm_bone', 16, 16, (pc) => bone(pc, 11));
  A.add('rm_bone_old', 16, 16, (pc) => { bone(pc, 13); for (let i = 0; i < 30; i++) pc.blend(Math.floor(ph(i, 8, 13) * 16), Math.floor(ph(i, 9, 13) * 16), 0x8a7a5a, 0.4); });
  A.add('rm_marrow', 8, 8, (pc) => { pc.fill(0x5a1a14); pc.ellipseBlend(4, 4, 2.5, 2.5, 0x8a3a2a, 0.8); pc.set(3, 3, 0xc87a5a); });
  A.add('rm_flesh', 16, 16, (pc) => flesh(pc, 21, 0));
  A.add('rm_flesh_old', 16, 16, (pc) => flesh(pc, 23, 0.8));
  A.add('rm_fat', 16, 16, (pc) => { const R = makeRamp(0xe0c098, 5, { spread: 0.35 }); pc.fillRamp(R, (x, y) => 0.55 + (tileFbm(x, y, 16, 16, 3, 2, 31) - 0.5) * 0.5, 0.6); for (let i = 0; i < 5; i++) pc.blend(Math.floor(ph(i, 1, 31) * 16), Math.floor(ph(i, 2, 31) * 16), 0x9a3a2a, 0.5); });
  A.add('rm_guts', 16, 16, guts);
  A.add('rm_hide_doe', 32, 32, (pc) => hide(pc, 0x9a7a5a, 41));
  A.add('rm_hide_hound', 32, 32, (pc) => hide(pc, 0x6a5a4e, 43));
  A.add('rm_bee_husk', 32, 16, (pc) => {
    // a bee drained to a dry bag: bands faded to straw and soot, the fuzz worn bald in patches
    for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) {
      const band = Math.floor((x + Math.sin(y * 0.8) * 1.5) / 5) % 3;
      const c = band === 1 ? 0x3a3028 : band === 2 ? 0xd8c8a0 : 0xc8a050;
      pc.set(x, y, mixHex(c, 0x8a7a60, ph(x, y, 51) * 0.4));
    }
    for (let i = 0; i < 12; i++) pc.ellipseBlend(ph(i, 1, 52) * 32, ph(i, 2, 52) * 16, 2, 1.2, 0x6a5a48, 0.6);
  });
  A.add('rm_hazmat', 32, 32, (pc) => hazmat(pc, 61, 0.6));
  A.add('rm_hazmat_foul', 32, 32, (pc) => hazmat(pc, 63, 1.4));
  A.add('rm_rubber', 16, 16, (pc) => { const R = makeRamp(0x2a2a2c, 5, { spread: 0.4 }); pc.fillRamp(R, (x, y) => 0.45 + (tileFbm(x, y, 16, 16, 3, 2, 71) - 0.5) * 0.3 + (y % 4 === 0 ? 0.15 : 0), 0.6); });
  A.add('rm_visor', 8, 8, (pc) => { pc.fill(0x3a4a48); pc.blend(1, 1, 0xe8f4f0, 0.8); pc.blend(2, 1, 0xa8c8c0, 0.5); for (let i = 0; i < 6; i++) pc.blend(Math.floor(ph(i, 1, 75) * 8), Math.floor(ph(i, 2, 75) * 8), 0x1a2020, 0.5); pc.line(2, 6, 6, 3, 0xd8e8e0, 120); });
  A.add('rm_badge', 16, 8, (pc) => {
    // a Meridian ID strip: the M-in-a-circle, a unit number, a photo square gone brown
    pc.fill(0xe8e4d8);
    pc.rect(1, 1, 5, 6, 0x8a6a4a); pc.rect(2, 2, 3, 3, 0x5a4030);
    pc.ellipseBlend(10, 3, 2, 2, 0x2a3a6a, 0.9); pc.set(10, 3, 0xe8e4d8);
    for (let x = 7; x < 15; x += 2) pc.set(x, 6, 0x2a2a2a);
    pc.ellipseBlend(13, 5, 2, 2, BLOOD.dry, 0.6);
  });
  A.add('rm_crust', 16, 16, (pc) => {
    // dried blood crust: dark, cracked into plates, glossy where it is still tacky
    const R = makeRamp(BLOOD.dry, 5, { spread: 0.4 });
    pc.fillRamp(R, (x, y) => 0.45 + (tileFbm(x, y, 16, 16, 3, 2, 81) - 0.5) * 0.5, 0.6);
    for (let k = 0; k < 4; k++) { let x = ph(k, 1, 82) * 16, y = ph(k, 2, 82) * 16; for (let s = 0; s < 8; s++) { x += Math.cos(k + s * 0.7); y += Math.sin(k * 2 + s); pc.blend(Math.round(x), Math.round(y), BLOOD.crust, 0.8); } }
    pc.blend(5, 6, BLOOD.hi, 0.6); pc.blend(11, 10, BLOOD.hi, 0.5);
  });

  // ---------------------------------------------------------------- decals (alpha)
  // an old pool: a tacky dark centre, a lighter dried ring, the rim cracked and lifting, fly specks
  A.add('rm_pool', 32, 32, (pc) => {
    pc.wrap = false; pc.clear();
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const a = Math.atan2(y - 16, x - 16), d = Math.hypot(x - 15.5, y - 16.5);
      const r = 11 + Math.sin(a * 3 + 0.6) * 2 + Math.sin(a * 7 + 2) * 1 + Math.sin(a * 13) * 0.5;
      if (d > r + 1) continue;
      const t = d / r;
      if (d > r) { pc.set(x, y, BLOOD.crust, 150); continue; }
      const c = t < 0.55 ? mixHex(BLOOD.deep, BLOOD.wet, ph(x >> 1, y >> 1, 91) * 0.5) : t < 0.85 ? mixHex(BLOOD.wet, BLOOD.dry, (t - 0.55) / 0.3) : BLOOD.dry;
      pc.set(x, y, c, t < 0.55 ? 225 : 200);
    }
    // cracks in the dried ring
    for (let k = 0; k < 9; k++) { const a = (k / 9) * 6.28 + ph(k, 1, 92); for (let s = 0; s < 3; s++) { const rr = 9.5 + s; pc.set(Math.round(16 + Math.cos(a) * rr), Math.round(16 + Math.sin(a) * rr), BLOOD.crust, 220); } }
    for (const [x, y] of [[12, 13], [13, 13], [19, 18]]) pc.set(x, y, 0xe89a8a, 210);
    for (let i = 0; i < 7; i++) pc.set(Math.floor(5 + ph(i, 2, 93) * 22), Math.floor(5 + ph(i, 3, 93) * 22), 0x1a0a08, 230);
  });
  // a hand-swiped smear: streaks that thin out in one direction
  A.add('rm_smear', 32, 32, (pc) => {
    pc.wrap = false; pc.clear();
    for (let k = 0; k < 5; k++) {
      const y0 = 9 + k * 3.2 + ph(k, 1, 101) * 2, len = 18 + ph(k, 2, 101) * 10;
      for (let x = 3; x < 3 + len && x < 31; x++) {
        const t = (x - 3) / len, w = (1 - t) * 2.2 + 0.4;
        for (let d = -w; d <= w; d++) {
          const y = Math.round(y0 + d + Math.sin(x * 0.2 + k) * 0.8);
          if (ph(x, y, 102 + k) < t * 0.9) continue;
          pc.set(x, y, mixHex(BLOOD.wet, BLOOD.dry, t * 0.8 + ph(x, y, 103) * 0.2), Math.round(220 - t * 110));
        }
      }
    }
  });
  // drag marks: two broken parallel streaks with drips beside them (run it along z with d > w)
  A.add('rm_trail', 16, 32, (pc) => {
    pc.wrap = false; pc.clear();
    for (const cx of [5, 10]) for (let y = 0; y < 32; y++) {
      if (ph(cx, y >> 2, 111) < 0.18) continue;
      const w = 1 + (ph(cx, y, 112) < 0.4 ? 1 : 0);
      for (let d = 0; d < w; d++) pc.set(cx + d + Math.round(Math.sin(y * 0.25) * 0.8), y, mixHex(BLOOD.wet, BLOOD.dry, ph(cx, y, 113) * 0.7), 200);
    }
    for (let i = 0; i < 9; i++) { const x = Math.floor(ph(i, 1, 114) * 16), y = Math.floor(ph(i, 2, 114) * 32); pc.set(x, y, BLOOD.dry, 210); if (ph(i, 3, 114) < 0.5) pc.set(x + 1, y, BLOOD.dry, 160); }
  });
  // spatter: a burst with droplets thrown outward and their tails
  A.add('rm_spatter', 32, 32, (pc) => {
    pc.wrap = false; pc.clear();
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const d = Math.hypot(x - 16, y - 16); if (d < 4 + ph(x, y, 121) * 2) pc.set(x, y, BLOOD.wet, 220); }
    for (let k = 0; k < 22; k++) {
      const a = ph(k, 1, 122) * 6.28, r0 = 5 + ph(k, 2, 122) * 9, sz = ph(k, 3, 122) < 0.3 ? 1 : 0;
      const x = 16 + Math.cos(a) * r0, y = 16 + Math.sin(a) * r0;
      for (let dy = -sz; dy <= sz; dy++) for (let dx = -sz; dx <= sz; dx++) pc.set(Math.round(x + dx), Math.round(y + dy), mixHex(BLOOD.wet, BLOOD.dry, r0 / 14), 215);
      for (let s = 1; s < 3; s++) pc.set(Math.round(x + Math.cos(a) * s), Math.round(y + Math.sin(a) * s), BLOOD.dry, 150);
    }
  });
  // a handprint: palm and four fingers, the thumb out to one side, smeared at the heel
  A.add('rm_hand', 16, 16, (pc) => {
    pc.wrap = false; pc.clear();
    const c = (x: number, y: number) => pc.set(x, y, mixHex(BLOOD.wet, BLOOD.dry, ph(x, y, 131) * 0.6), 215);
    for (let y = 7; y < 13; y++) for (let x = 4; x < 11; x++) if (Math.hypot(x - 7.5, y - 9.8) < 3.4) c(x, y);
    for (const [fx, top] of [[4, 3], [6, 1], [8, 1], [10, 3]] as [number, number][]) for (let y = top; y < 8; y++) c(fx, y);
    for (let s = 0; s < 4; s++) c(11 + (s >> 1), 9 - s);
    for (let y = 13; y < 16; y++) if (ph(y, 2, 132) < 0.7) c(7, y);
  });
  // bloody footprints: a pair, toes and heel, fading
  A.add('rm_prints', 16, 32, (pc) => {
    pc.wrap = false; pc.clear();
    for (const [cx, cy, a] of [[5, 7, 230], [11, 19, 160]] as [number, number, number][]) {
      for (let y = -4; y <= 5; y++) for (let x = -2; x <= 2; x++) if ((x * x) / 5 + (y * y) / 26 < 1 && !(y > -1 && y < 2 && Math.abs(x) < 1)) pc.set(cx + x, cy + y, BLOOD.dry, a);
      for (let x = -2; x <= 2; x++) pc.set(cx + x, cy - 6, BLOOD.dry, a);
    }
  });
});

// ====================================================================== shared forms
const T = [REMAINS_TAG, 'corpse', 'gore', 'creepy', 'story'];
const eatenOf = (s: Record<string, any>) => Math.max(0, Math.min(3, s.eaten | 0));

/** a bone: a shaft with knobbed ends (condyles), gnawed open at one end to show the marrow */
function longBone(mb: ModelBuilder, a: V3, b: V3, r: number, tex = 'rm_bone', broken = false) {
  tube(mb, [a, [a[0] * 0.5 + b[0] * 0.5, a[1] * 0.5 + b[1] * 0.5 + r * 0.3, a[2] * 0.5 + b[2] * 0.5], b], (t) => r * (1 - 0.25 * Math.sin(t * Math.PI)), 7, tex, { capStart: !broken, capEnd: true });
  blob(mb, a, [r * 1.9, r * 1.5, r * 1.7], 8, 5, tex);
  blob(mb, [a[0] + r * 0.9, a[1] + r * 0.2, a[2]], [r * 1.2, r * 1.1, r * 1.2], 6, 4, tex);
  if (broken) {
    // splintered end: a ring of shards round the hollow
    for (let k = 0; k < 4; k++) { const ang = k * 1.6; spike(mb, [b[0] + Math.cos(ang) * r * 0.6, b[1] + Math.sin(ang) * r * 0.6, b[2]], [b[0] - a[0], b[1] - a[1] + 0.02, b[2] - a[2]], r * (1.2 + (k % 2)), r * 0.35, tex, 0xffffff, 0, 3); }
    blob(mb, b, [r * 0.55, r * 0.55, r * 0.55], 6, 3, 'rm_marrow');
  } else blob(mb, b, [r * 1.6, r * 1.3, r * 1.5], 8, 5, tex);
}
/** a rib: a thin flattened arc from (x, y, z) curving `dir` (+1 / -1) */
function rib(mb: ModelBuilder, x: number, y: number, z: number, len: number, rot: number, dir: number, tex = 'rm_bone', lift = 0.1) {
  const pts: V3[] = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6, a = rot + dir * t * 1.6;
    pts.push([x + Math.cos(a) * len * t, y + Math.sin(t * Math.PI) * lift * len, z + Math.sin(a) * len * t]);
  }
  tube(mb, pts, (t) => 0.012 * (1 - t * 0.5), 5, tex, { squash: [1, 0.55], capEnd: true, capStart: true });
}
/** a vertebra: a squat drum with a dorsal spine and two wings */
function vertebra(mb: ModelBuilder, x: number, y: number, z: number, s: number, rot: number, tex = 'rm_bone') {
  mb.push(); mb.translate(x, y, z); mb.rotateY(rot); mb.rotateX(1.2);
  lathe(mb, [0, 0, 0], [[0, 0], [0.026 * s, 0], [0.03 * s, 0.012 * s], [0.028 * s, 0.03 * s], [0, 0.032 * s]], 7, tex);
  spike(mb, [0, 0.016 * s, -0.024 * s], [0, 0.3, -1], 0.04 * s, 0.01 * s, tex);
  for (const k of [-1, 1]) spike(mb, [k * 0.022 * s, 0.016 * s, -0.01 * s], [k, 0.1, -0.2], 0.035 * s, 0.008 * s, tex);
  mb.pop();
}
/** a skull: a cranium, the brow, two orbits, the nasal hole, the upper teeth row; jaw optional */
function skull(mb: ModelBuilder, x: number, y: number, z: number, s: number, yaw: number, roll: number, tex = 'rm_bone', jaw = true) {
  mb.push(); mb.translate(x, y, z); mb.rotateY(yaw); mb.rotateZ(roll);
  blob(mb, [0, 0.06 * s, -0.01 * s], [0.075 * s, 0.07 * s, 0.09 * s], 12, 7, tex, { disp: (d) => 1 - 0.12 * Math.max(0, d[2]) * Math.max(0, -d[1] + 0.2) });
  blob(mb, [0, 0.025 * s, 0.06 * s], [0.055 * s, 0.04 * s, 0.035 * s], 10, 5, tex);
  for (const k of [-1, 1]) blob(mb, [k * 0.027 * s, 0.05 * s, 0.083 * s], [0.02 * s, 0.018 * s, 0.01 * s], 7, 4, 'rm_marrow', { color: 0x3a2018 });
  blob(mb, [0, 0.02 * s, 0.093 * s], [0.008 * s, 0.012 * s, 0.006 * s], 5, 3, 'rm_marrow', { color: 0x2a1410 });
  for (let i = 0; i < 8; i++) { const a = -0.7 + (i / 7) * 1.4; mb.box(Math.sin(a) * 0.04 * s - 0.005 * s, -0.006 * s, 0.05 * s + Math.cos(a) * 0.035 * s, 0.01 * s, 0.014 * s, 0.008 * s, tex, { bevel: false }); }
  if (jaw) tube(mb, [P(-0.045 * s, 0.0, -0.01 * s), P(-0.035 * s, -0.035 * s, 0.05 * s), P(0, -0.04 * s, 0.075 * s), P(0.035 * s, -0.035 * s, 0.05 * s), P(0.045 * s, 0.0, -0.01 * s)], 0.009 * s, 5, tex, { capStart: true, capEnd: true });
  mb.pop();
}
/** a torn loop of gut lying in coils */
function gutLoop(mb: ModelBuilder, cx: number, cz: number, r: number, turns: number, seed: number, y = 0.02, rad = 0.028, tex = 'rm_guts') {
  const pts: V3[] = [];
  const n = Math.round(10 * turns);
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = t * turns * Math.PI * 2 + seed;
    const rr = r * (0.35 + 0.65 * t) * (1 + 0.15 * Math.sin(t * 17 + seed));
    pts.push([cx + Math.cos(a) * rr, y + rad * 0.8 + Math.max(0, Math.sin(t * 9 + seed)) * rad * 1.2, cz + Math.sin(a) * rr * 0.8]);
  }
  tube(mb, pts, (t) => rad * (0.85 + 0.2 * Math.sin(t * 23 + seed)), 7, tex, { capStart: true, capEnd: true, bump: (t, a) => 1 + 0.08 * Math.sin(t * 60 + a * 2) });
}
/** an irregular chunk of torn meat */
function chunk(mb: ModelBuilder, c: V3, s: number, seed: number, tex = 'rm_flesh') {
  blob(mb, c, [s, s * 0.7, s * 0.85], 8, 5, tex, { disp: (d) => 1 + 0.25 * Math.sin(d[0] * 7 + seed) * Math.sin(d[2] * 5 + seed * 2) + 0.12 * Math.sin(d[1] * 9 + seed) });
}
/** a flat stain on the floor (drawn into the model so it stays with the prop) */
function stain(mb: ModelBuilder, cx: number, cz: number, rx: number, rz: number, seed: number, tex = 'rm_crust') {
  blob(mb, [cx, 0.003, cz], [rx, 0.006, rz], 16, 2, tex, { v0: 0, v1: 0.5, ao: false, disp: (d) => { const a = Math.atan2(d[2], d[0]); return 1 + 0.16 * Math.sin(a * 3 + seed) + 0.08 * Math.sin(a * 7 + seed * 2); } });
}
/** strips of hazmat PVC torn and curled back from a wound */
function flaps(mb: ModelBuilder, c: V3, n: number, len: number, seed: number, tex = 'rm_hazmat_foul') {
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + seed;
    const ox = Math.cos(a), oz = Math.sin(a);
    surf(mb, 2, 3, (i, j) => {
      const u = (i / 2 - 0.5) * 0.06, t = j / 3;
      const curl = t * t * 0.08;
      return [c[0] + ox * (0.02 + t * len) - oz * u, c[1] + 0.01 + curl + Math.sin(t * 3 + k) * 0.01, c[2] + oz * (0.02 + t * len) + ox * u];
    }, (i, j) => [i / 2, j / 3], tex, { inside: null });
    surf(mb, 2, 3, (i, j) => {
      const u = (i / 2 - 0.5) * 0.06, t = j / 3;
      const curl = t * t * 0.08;
      return [c[0] + ox * (0.02 + t * len) - oz * u, c[1] + 0.006 + curl + Math.sin(t * 3 + k) * 0.01, c[2] + oz * (0.02 + t * len) + ox * u];
    }, (i, j) => [i / 2, j / 3], tex, { inside: null, flip: true });
  }
}

// ====================================================================== props
defObj({
  key: 'rm_bones', name: 'Picked Bones', height: 0.25, block: 'none', movable: 0, hp: 200, sound: 'flesh', noShadow: true,
  tags: [...T, 'bones'],
  container: { capacity: 8, kind: 'pile', name: 'Bones', loot: 'rm_bones' },
  desc: 'Bones, cleaned. Something chewed the ends off the long ones to get at the marrow and took its time over it. A few strings of gristle are left in the joints.',
  variant: (s) => String((s.v ?? 0) % 3),
  model: (mb, s) => {
    const v = (s.v ?? 0) % 3;
    stain(mb, 0, 0, 0.42, 0.34, v + 1, 'rm_crust');
    if (v === 0) {
      longBone(mb, P(-0.3, 0.025, -0.1), P(0.22, 0.03, 0.14), 0.022, 'rm_bone', true);
      skull(mb, 0.22, 0.0, -0.18, 1, 2.4, 0.5);
      for (let k = 0; k < 4; k++) rib(mb, -0.25 + k * 0.08, 0.008, 0.1 + (k % 2) * 0.05, 0.22, -0.4 + k * 0.2, 1);
      for (let k = 0; k < 3; k++) vertebra(mb, 0.05 + k * 0.055, 0.012, -0.05 - k * 0.03, 1, k * 0.7);
    } else if (v === 1) {
      // a ribcage on its side, half its ribs snapped, the spine still joining them
      for (let k = 0; k < 5; k++) vertebra(mb, -0.2 + k * 0.08, 0.015, 0.02 + Math.sin(k) * 0.02, 1.1, 0.2);
      for (let k = 0; k < 5; k++) {
        rib(mb, -0.2 + k * 0.08, 0.03, 0.02, k % 3 === 1 ? 0.12 : 0.28, 1.4, 1, 'rm_bone', 0.9);
        rib(mb, -0.2 + k * 0.08, 0.03, 0.02, k % 2 === 0 ? 0.1 : 0.26, -1.4, -1, 'rm_bone_old', 0.5);
      }
      longBone(mb, P(0.2, 0.02, 0.22), P(0.36, 0.025, -0.12), 0.018, 'rm_bone_old', true);
      chunk(mb, [-0.05, 0.02, 0.08], 0.04, 3, 'rm_flesh_old');
    } else {
      // a jaw and a fan of hand bones round a gnawed pelvis
      blob(mb, [0, 0.04, 0], [0.13, 0.05, 0.09], 12, 6, 'rm_bone_old', { disp: (d) => 1 - 0.5 * Math.max(0, d[1]) * Math.abs(d[2]) });
      for (const k of [-1, 1]) blob(mb, [k * 0.08, 0.05, -0.02], [0.05, 0.04, 0.035], 8, 5, 'rm_marrow', { color: 0x4a2a20 });
      skull(mb, -0.25, 0.0, 0.16, 0.9, -0.8, -0.9, 'rm_bone', false);
      tube(mb, [P(0.15, 0.01, 0.2), P(0.21, 0.02, 0.24), P(0.27, 0.012, 0.22)], 0.01, 5, 'rm_bone', { capStart: true, capEnd: true });
      for (let k = 0; k < 7; k++) { const a = -0.8 + k * 0.25; tube(mb, [P(0.2 + Math.cos(a) * 0.05, 0.008, -0.18 + Math.sin(a) * 0.05), P(0.2 + Math.cos(a) * 0.12, 0.01, -0.18 + Math.sin(a) * 0.12)], 0.006, 4, 'rm_bone', { capStart: true, capEnd: true }); }
      longBone(mb, P(-0.34, 0.02, -0.25), P(0.0, 0.025, -0.3), 0.02);
    }
  },
});

defObj({
  key: 'rm_carcass', name: 'Carcass', w: 2, d: 1, height: 0.7, block: 'none', movable: 0, hp: 400, sound: 'flesh',
  tags: [...T, 'carcass'],
  container: { capacity: 10, kind: 'pile', name: 'Carcass', loot: 'rm_carcass' },
  desc: 'Something that lived here, opened along the belly and half emptied. The edges of the wound are scalloped: it was eaten in small bites, by many mouths, over days.',
  variant: (s) => (s.v ?? 0) % 3 + ':' + eatenOf(s),
  model: (mb, s) => {
    const v = (s.v ?? 0) % 3, e = eatenOf(s), keep = (lvl: number) => e < lvl;
    stain(mb, 0.05, 0.05, 0.95, 0.45, v + 7, 'rm_crust');
    if (v === 2) {
      // a Giant Bumble Bee drained to a husk: the abdomen collapsed like a deflated ball, legs curled up
      blob(mb, [-0.3, 0.16, 0], [0.42, 0.22 - e * 0.03, 0.36], 16, 8, 'rm_bee_husk', { disp: (d, u) => 1 - 0.35 * Math.max(0, d[1]) * (0.5 + 0.5 * Math.sin(u * 20)) });
      blob(mb, [0.22, 0.2, 0], [0.18, 0.17, 0.17], 12, 7, 'rm_bee_husk');
      blob(mb, [0.43, 0.17, 0], [0.09, 0.1, 0.1], 10, 6, 'rm_rubber', { color: 0x4a4038 });
      for (const k of [-1, 1]) blob(mb, [0.48, 0.19, k * 0.07], [0.04, 0.06, 0.03], 8, 5, 'rm_visor', { color: 0x4a4a52 });
      for (let i = 0; i < 6; i++) { const k = i < 3 ? 1 : -1, z = 0.12 - (i % 3) * 0.12; tube(mb, [P(0.15 + (i % 3) * 0.08, 0.12, k * 0.12), P(0.2 + (i % 3) * 0.05, 0.3, k * 0.24), P(0.12 + (i % 3) * 0.04, 0.36, k * (0.18 + z * 0.1))], 0.012, 4, 'rm_rubber', { capEnd: true }); }
      // the belly bitten open: a ragged dark hole with the inside scraped clean
      if (keep(3)) chunk(mb, [-0.35, 0.08, 0.3], 0.1, 4, e > 0 ? 'rm_flesh_old' : 'rm_flesh');
      blob(mb, [-0.3, 0.12, 0.3], [0.16, 0.08, 0.04], 10, 5, 'rm_marrow', { color: 0x2a1410 });
      return;
    }
    const hound = v === 1, hideT = hound ? 'rm_hide_hound' : 'rm_hide_doe';
    // the body: the hide, collapsed toward the open side
    blob(mb, [-0.15, 0.18, -0.08], [0.55, 0.2 - e * 0.025, 0.28], 18, 8, hideT, { disp: (d) => 1 - 0.45 * Math.max(0, d[2]) * Math.max(0, d[1] + 0.2) });
    // the ribcage, open to the sky: arched ribs rising from the spine, the cavity under them
    blob(mb, [-0.15, 0.1, 0.1], [0.42, 0.06, 0.18], 14, 5, e >= 2 ? 'rm_crust' : 'rm_flesh', { disp: (d) => 1 + 0.15 * Math.sin(d[0] * 11) });
    for (let k = 0; k < 8; k++) {
      const x = -0.5 + k * 0.1, broke = (k * 7 + v) % 5 === 0;
      rib(mb, x, 0.18, -0.05, broke ? 0.14 : 0.3 - Math.abs(k - 3.5) * 0.025, 1.45, 1, e >= 2 ? 'rm_bone' : 'rm_bone_old', 0.6);
    }
    // what is left on the ribs: strips of meat and fat, fewer at each pass
    if (keep(2)) for (let k = 0; k < 5; k++) chunk(mb, [-0.45 + k * 0.15, 0.2, 0.12 + Math.sin(k) * 0.05], 0.045, k + v, k % 2 ? 'rm_fat' : 'rm_flesh');
    if (keep(1)) for (let k = 0; k < 3; k++) chunk(mb, [-0.3 + k * 0.2, 0.26, 0.04], 0.06, k * 3 + v, 'rm_flesh');
    // entrails spilling out of the opening onto the floor
    if (keep(3)) gutLoop(mb, 0.0, 0.35, 0.22 - e * 0.05, 1.6 - e * 0.4, v * 2, 0.02, 0.03);
    if (keep(2)) gutLoop(mb, -0.35, 0.32, 0.14, 1.1, v + 3, 0.02, 0.025);
    // a long leg (the doe's goes on and on), the hoof or paw
    if (hound) {
      longBone(mb, P(-0.6, 0.12, -0.2), P(-0.85, 0.06, -0.38), 0.03, e >= 2 ? 'rm_bone' : 'rm_bone_old', e >= 2);
      if (e < 2) tube(mb, [P(-0.6, 0.12, -0.2), P(-0.72, 0.1, -0.3), P(-0.84, 0.07, -0.38)], 0.05, 7, hideT, { capEnd: true });
      blob(mb, [-0.88, 0.04, -0.4], [0.07, 0.04, 0.06], 8, 4, hideT);
      for (let i = 0; i < 4; i++) spike(mb, [-0.93, 0.03, -0.42 + i * 0.025], [-1, -0.2, 0], 0.04, 0.008, 'rm_bone_old');
    } else {
      tube(mb, [P(-0.55, 0.15, -0.15), P(-0.75, 0.08, -0.28), P(-0.95, 0.05, -0.3), P(-0.98, 0.04, -0.42)], (t) => 0.045 - t * 0.02, 7, hideT, { capEnd: true });
      blob(mb, [-0.98, 0.03, -0.45], [0.035, 0.03, 0.05], 7, 4, 'rm_rubber', { color: 0x3a3028 });
      // the other leg was taken whole: a socket and a strip of hide
      blob(mb, [-0.5, 0.13, 0.12], [0.06, 0.05, 0.05], 8, 4, 'rm_marrow');
    }
    // the head: thrown back on the floor, mouth open
    mb.push(); mb.translate(0.5, 0.0, -0.05); mb.rotateY(hound ? 0.4 : -0.3);
    if (e >= 3) skull(mb, 0.1, 0.02, 0, 1.8, 1.4, 1.2, 'rm_bone');
    else {
      blob(mb, [0.1, 0.12, 0], [0.16, 0.11, 0.1], 12, 7, hideT);
      blob(mb, [0.27, 0.09, 0], [0.12, 0.06, 0.06], 10, 5, hideT);
      blob(mb, [0.38, 0.09, 0], [0.025, 0.02, 0.03], 6, 3, 'rm_rubber');
      for (const k of [-1, 1]) blob(mb, [0.17, 0.16, k * 0.08], [0.02, 0.02, 0.012], 6, 3, 'rm_marrow', { color: 0x2a1a14 });
      tube(mb, [P(0.15, 0.05, 0), P(0.27, 0.03, 0.01), P(0.36, 0.02, 0)], 0.025, 6, 'rm_flesh', { squash: [1, 0.4], capEnd: true });
      for (let i = 0; i < 5; i++) spike(mb, [0.22 + i * 0.03, 0.06, 0.035], [0.1, -1, 0], 0.025, 0.006, 'rm_bone');
      if (hound) for (const k of [-1, 1]) tube(mb, [P(0.02, 0.2, k * 0.06), P(-0.03, 0.27, k * 0.09), P(-0.02, 0.32, k * 0.08)], 0.02, 5, hideT, { squash: [1, 0.3], capEnd: true });
      else for (const k of [-1, 1]) tube(mb, [P(0.0, 0.2, k * 0.05), P(-0.06, 0.32, k * 0.1), P(-0.05, 0.4, k * 0.16), P(0.0, 0.44, k * 0.2)], 0.012, 5, 'rm_bone_old', { capEnd: true });
    }
    // the neck torn through
    tube(mb, [P(-0.1, 0.15, 0), P(0.05, 0.12, 0)], 0.07, 8, hideT, { capEnd: false });
    chunk(mb, [-0.1, 0.15, 0], 0.06, v, e > 1 ? 'rm_flesh_old' : 'rm_flesh');
    mb.pop();
  },
});

defObj({
  key: 'rm_unit', name: 'Remains of a Unit', w: 2, d: 1, height: 0.45, block: 'none', movable: 0, hp: 400, sound: 'flesh',
  tags: [...T, 'unit', 'meridian'],
  container: { capacity: 12, kind: 'pile', name: 'Unit Remains', loot: 'rm_unit' },
  desc: 'A unit from an earlier sending, still in the Institute\'s yellow hazmat. The suit is torn open where the soft parts were and the visor has fogged from the inside. There is an ID strip on the chest.',
  variant: (s) => (s.v ?? 0) % 3 + ':' + eatenOf(s),
  model: (mb, s) => {
    const v = (s.v ?? 0) % 3, e = eatenOf(s), keep = (lvl: number) => e < lvl;
    stain(mb, 0.0, 0.0, 0.85, 0.42, v + 11, 'rm_crust');
    // the body: the human base (a HumanRig in the hazmat suit, its own blood and pallor, limbs dropped by its own
    // severing), posed where it fell and frozen into the prop (./corpse.ts). v 0 on its back, 1 face down with the
    // legs gone at the knee, 2 the top half
    const B = bakeDeadUnit(mb, v);
    if (!B) return;
    const [cx, cy, cz] = B.chest, [hx, , hz] = B.hips;
    let ax = cx - hx, az = cz - hz; const al = Math.hypot(ax, az) || 1; ax /= al; az /= al;
    const sx = -az, sz = ax;   // across the body
    const along = (t: number, up: number, side = 0): V3 => [hx + (cx - hx) * t + sx * side, cy + up, hz + (cz - hz) * t + sz * side];
    const rotAcross = Math.atan2(sz, sx);
    if (v !== 1) {
      // on its back: the chest and belly torn open through the suit, the ribs standing out of it
      const ctr = along(0.55, 0.07);
      blob(mb, ctr, [0.15, 0.04, 0.15], 12, 5, e >= 2 ? 'rm_crust' : 'rm_flesh');
      for (let k = 0; k < 5; k++) for (const sd of [-1, 1]) { const p = along(0.75 + k * 0.08 - 0.3, 0.06); rib(mb, p[0], p[1], p[2], 0.11 + (k % 2) * 0.02, rotAcross + (sd > 0 ? 0 : Math.PI), sd, e >= 2 ? 'rm_bone' : 'rm_bone_old', 0.55); }
      flaps(mb, along(0.55, 0.06), 7, 0.13, 2 + v, 'rm_hazmat_foul');
      if (keep(2)) for (let k = 0; k < 3; k++) chunk(mb, along(0.35 + k * 0.18, 0.09, (k - 1) * 0.05), 0.04, k + 2, 'rm_flesh');
      if (keep(3)) { const g = along(0.15, -0.05, 0.3); gutLoop(mb, g[0], g[2], 0.15, 1.3, 5, 0.02, 0.026); }
    } else {
      // face down: the back split along the spine, vertebrae standing out of it
      for (let k = 0; k < 5; k++) { const p = along(0.15 + k * 0.2, 0.08); vertebra(mb, p[0], p[1], p[2], 1.2, Math.atan2(az, ax)); }
      flaps(mb, along(0.5, 0.07), 5, 0.12, 3, 'rm_hazmat_foul');
      if (keep(2)) chunk(mb, along(0.45, 0.09, 0.04), 0.045, 6, 'rm_flesh');
    }
    if (v === 2 && keep(3)) { const g = along(-0.25, -0.06); gutLoop(mb, g[0], g[2], 0.2, 1.3, 2, 0.02, 0.03); chunk(mb, along(-0.08, -0.03), 0.06, 9, 'rm_flesh'); }
    // the ID strip, left of the chest
    if (v !== 1) { mb.push(); const p = along(0.9, 0.09, 0.08); mb.translate(p[0], p[1], p[2]); mb.rotateY(-Math.atan2(az, ax)); mb.rotateX(-0.1); mb.box(0, 0, 0, 0.07, 0.005, 0.035, { top: 'rm_badge', sides: 'white' }, { fit: { top: true }, bevel: false }); mb.pop(); }
    // the torch it was holding, dead, by its hand
    const [tx, , tz] = B.handR;
    mb.push(); mb.translate(tx + sx * 0.12, 0.03, tz + sz * 0.12); mb.rotateY(rotAcross + 0.7); mb.rotateZ(Math.PI / 2); mb.cylinder(0, -0.08, 0, 0.022, 0.16, 8, 'rubber_black'); mb.cylinder(0, 0.08, 0, 0.03, 0.03, 8, 'metal_grey'); mb.pop();
  },
});

defObj({
  key: 'rm_gore_pile', name: 'Gore Pile', height: 0.35, block: 'none', movable: 0, hp: 200, sound: 'flesh', noShadow: true,
  tags: [...T, 'offal'],
  container: { capacity: 6, kind: 'pile', name: 'Gore', loot: 'rm_gore' },
  desc: 'A heap of what comes out of a body: loops of gut, torn meat, chips of bone, all of it still shining. It was left here, or it was put here.',
  variant: (s) => (s.v ?? 0) % 3 + ':' + eatenOf(s),
  model: (mb, s) => {
    const v = (s.v ?? 0) % 3, e = eatenOf(s);
    stain(mb, 0, 0, 0.46, 0.4, v + 21, 'rm_crust');
    const k = 1 - e * 0.22;
    gutLoop(mb, 0.02, 0.0, 0.2 * k, 2.2 - e * 0.4, v, 0.02, 0.032);
    if (e < 3) gutLoop(mb, -0.12, 0.08, 0.13 * k, 1.4, v + 2, 0.07, 0.028);
    for (let i = 0; i < 6 - e * 2; i++) { const a = i * 1.1 + v; chunk(mb, [Math.cos(a) * 0.18 * k, 0.05 + (i % 2) * 0.05, Math.sin(a) * 0.16 * k], 0.05 + (i % 3) * 0.015, i + v * 5, i % 3 === 2 ? 'rm_fat' : 'rm_flesh'); }
    // an organ on top: a liver-dark lobe, glossy
    if (e < 2) blob(mb, [0.03, 0.14, 0.02], [0.1, 0.05, 0.075], 12, 6, 'rm_flesh', { color: 0x8a5a5a, disp: (d) => 1 + 0.12 * Math.sin(d[0] * 6 + v) });
    for (let i = 0; i < 4 + e; i++) { const a = i * 1.7 + v; spike(mb, [Math.cos(a) * 0.25, 0.01, Math.sin(a) * 0.22], [Math.cos(a), 0.2, Math.sin(a)], 0.05, 0.01, e > 1 ? 'rm_bone' : 'rm_bone_old'); }
    if (e >= 2) longBone(mb, P(-0.2, 0.02, -0.1), P(0.15, 0.03, -0.25), 0.016, 'rm_bone', true);
  },
});

// ====================================================================== loot
defLoot('rm_bones', [0, 2], [['bone', 6], ['coins', 1], ['keyring', 0.5], ['wedding_ring', 0.3], ['photo_old', 0.5]], 0.3);
defLoot('rm_carcass', [1, 3], [['bone', 4], ['meat_raw', 2], ['matted_fur', 0.6], ['gull_feather', 0.4], ['bee_fuzz', 0.6]], 0.15);
defLoot('rm_unit', [2, 4], [['meridian_tag', 3], ['battery', 2], ['bandage', 2], ['flashlight', 1], ['water_bottle', 1.5], ['ration_bar', 1.2], ['glowstick', 1], ['note', 1], ['specimen_jar', 0.6], ['photo_old', 0.8], ['wallet', 0.6], ['bone', 1]], 0);
defLoot('rm_gore', [0, 2], [['meat_raw', 3], ['bone', 2], ['meridian_tag', 0.3], ['wedding_ring', 0.3]], 0.35);
