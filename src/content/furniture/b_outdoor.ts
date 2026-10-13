// Furniture B — parking lots, streets, parks and gardens: sodium lamps, cones,
// barriers, booths, bus shelters, phone booths, trees and plants, rocks,
// power poles, billboards and suburban garden ornaments.
import { defObj } from '../../world/objects';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { ModelBuilder } from '../../gfx/modelBuilder';
import { PixelCanvas } from '../../gfx/pixel';
import {
  makeRamp, mixHex, scaleHex, bayer, ph, tileFbm, hashf, text, textC, scribble, fillNoise, rust, chips, stripes,
  grimeBottom, rivet, screw, seamH, seamV, gauge, grille, glow, woodFill, poly, rod, torus, disc, discY, dial,
  rockBlob, quadW, triW, mirroredStamp, gradV, pushSeg,
} from './b_common';

const T = ['setB', 'outdoor'];

// ---------------------------------------------------------------------------
// textures
// ---------------------------------------------------------------------------
/** leafy blob with ragged alpha edges (fit on box faces / cards) */
function leafBlob(pc: PixelCanvas, base: number, seed: number, holes = 0.06, flowers: number[] = []) {
  pc.wrap = false;
  const R = makeRamp(base, 6, { hueShift: 0.06, spread: 0.55 });
  const W = pc.w, H = pc.h;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (x + 0.5 - W / 2) / (W / 2), dy = (y + 0.5 - H / 2) / (H / 2);
    const d = Math.pow(Math.pow(Math.abs(dx), 2.6) + Math.pow(Math.abs(dy), 2.6), 1 / 2.6);
    const n = tileFbm(x, y, W, H, 4, 2, seed);
    if (d > 0.97 - n * 0.42) continue;
    // interior holes
    if (d < 0.8 && tileFbm(x, y, W, H, 6, 1, seed + 3) > 1 - holes) continue;
    // leaf clusters: cell pattern with light upper-left facets
    const cx = Math.floor((x + (Math.floor(y / 3) % 2) * 1.5) / 3), cy = Math.floor(y / 3);
    const lv = hashf(cx, cy, seed);
    const lx = (x + (Math.floor(y / 3) % 2) * 1.5) % 3, ly = y % 3;
    let k = 1 + Math.floor(lv * 2.6) + (lx < 1 && ly < 1 ? 1 : 0) - (lx >= 2 && ly >= 2 ? 1 : 0);
    k += Math.round((0.5 - y / H) * 1.6) + (n > 0.55 ? 1 : 0) - (d > 0.75 ? 0 : 0);
    pc.set(x, y, R[Math.max(0, Math.min(5, k))]);
  }
  for (let k = 0; k < flowers.length * 6; k++) {
    const x = Math.floor(hashf(k, 1, seed) * W), y = Math.floor(hashf(k, 2, seed) * H);
    if (pc.alpha(x, y) > 0) { pc.set(x, y, flowers[k % flowers.length]); }
  }
}

addTextureModule(() => {
  const A = atlas();

  // --- poles, lamps
  A.add('q_pole_galv', 16, 32, (pc, rng) => {
    const r = makeRamp(0x7c8386, 6, { spread: 0.38 });
    pc.fillRamp(r, (x, y) => 0.5 + Math.floor(tileFbm(x, y, 16, 32, 4, 1, 601) * 4) / 4 * 0.3 - 0.15 + (ph(x, y, 602) - 0.5) * 0.08, 0.6);
    pc.drips(rng, 0x6a6e6a, 3, 0, 26, 0.3);
    rust(pc, 603, 0.12, 2);
  });
  A.add('q_iron_green', 16, 16, (pc, rng) => {
    const r = makeRamp(0x2f4a3a, 5, { spread: 0.4 });
    fillNoise(pc, r, 0.5, 0.1, 2, 611, 0.03);
    chips(pc, rng, 2, 0x4a5048, r[1]);
  });
  A.add('q_lamp_head', 16, 16, (pc) => {
    const r = makeRamp(0x55595c, 5, { spread: 0.4 });
    fillNoise(pc, r, 0.5, 0.1, 2, 613, 0.05);
    seamH(pc, 0, 15, 7, r[0], r[3]);
  });
  A.add('q_sodium_lens', 16, 8, (pc) => {
    pc.wrap = false;
    pc.fill(0xb85a14);
    glow(pc, 8, 4, 8, 4.5, 0xe88a2a, 1.3);
    glow(pc, 8, 4, 5.5, 3, 0xffc060, 1.3);
    glow(pc, 8, 4, 3, 1.6, 0xfff0b0, 1.5);
    for (let x = 1; x < 16; x += 3) for (let y = 0; y < 8; y++) pc.blend(x, y, 0x8a3a10, 0.25);
  });
  A.add('q_lantern_pane', 8, 12, (pc) => {
    pc.wrap = false;
    pc.fill(0xc87020);
    glow(pc, 4, 6, 4, 6, 0xf0a040, 1.4);
    glow(pc, 4, 7, 2.2, 3.2, 0xffd070, 1.5);
    pc.set(4, 7, 0xfff0c0);
    pc.strokeRect(0, 0, 8, 12, 0x1e2a22); pc.vline(4, 0, 11, 0x2a3a2e);
  });
  A.add('q_flyer', 10, 14, (pc) => {
    pc.wrap = false;
    pc.fill(0xeeeae0);
    pc.rect(2, 1, 6, 6, 0x8a8a86); pc.circle(5, 3.5, 1.4, 0x2a2a2a); pc.rect(3, 5, 4, 2, 0x2a2a2a);
    scribble(pc, 1, 8, 8, 0x3a3a3a, 3, 2, 2);
    for (let x = 1; x < 10; x += 2) pc.vline(x, 12, 13, 0x7a7a7a);
    pc.blend(9, 0, 0xc8c0a0, 0.6); pc.set(8, 13, 0xd8d0b8);
  });

  // --- cones, barriers, bollards, meters
  A.add('q_cone', 32, 22, (pc, rng) => {
    pc.wrap = false;
    const r = makeRamp(0xe8622a, 5, { spread: 0.35 });
    pc.fillRamp(r, (x, y) => 0.6 + (ph(x, y, 621) - 0.5) * 0.15, 1);
    for (const [y0, h] of [[4, 3], [10, 3]]) for (let y = y0; y < y0 + h; y++) for (let x = 0; x < 32; x++) pc.set(x, y, ph(x, y, 623) < 0.08 ? 0xc8c8c0 : 0xf2f2ea);
    grimeBottom(pc, 0x3a2a1a, 6, 0.8, 625);
    chips(pc, rng, 3, 0x9a4a20, r[0]);
  });
  A.add('q_jersey', 32, 32, (pc, rng) => {
    const r = makeRamp(0xa6a49c, 6, { spread: 0.35 });
    pc.fillRamp(r, (x, y) => 0.55 + (tileFbm(x, y, 32, 32, 3, 3, 631) - 0.5) * 0.3 + (ph(x, y, 632) - 0.5) * 0.12, 1);
    pc.speckle(rng, [r[1], r[0]], 0.03);
    for (let k = 0; k < 4; k++) { const x = rng.int(0, 31), y = rng.int(0, 31); pc.set(x, y, r[0]); pc.set(x + 1, y, r[1]); pc.set(x, y + 1, r[5]); }
    pc.drips(rng, 0x6a5a3a, 3, 0, 20, 0.25);
    text(pc, '07', 4, 20, 0xe07a30);
  });
  A.add('q_bollard', 20, 32, (pc, rng) => {
    pc.wrap = false;
    const r = makeRamp(0xe2b02a, 5, { spread: 0.35 });
    pc.fillRamp(r, (x, y) => 0.6 + (ph(x, y, 641) - 0.5) * 0.12, 1);
    for (let y = 3; y < 6; y++) for (let x = 0; x < 20; x++) pc.set(x, y, 0xf0f0e8);
    for (let y = 7; y < 9; y++) for (let x = 0; x < 20; x++) pc.set(x, y, 0x2a2a2a);
    chips(pc, rng, 6, 0x7a7a74, r[0]);
    rust(pc, 643, 0.4, 2, [0, 26, 20, 6]);
    grimeBottom(pc, 0x3a3020, 6, 0.8, 645);
  });
  A.add('q_meter_head', 10, 12, (pc) => {
    pc.wrap = false;
    pc.fill(0x8a9094); pc.bevel(0, 0, 10, 12, 0xc8ccd0, 0x4a4e52);
    pc.rect(2, 2, 6, 5, 0x1e2226); pc.rect(3, 3, 4, 3, 0xd8d8c8);
    pc.rect(4, 3, 3, 2, 0xc8281e); pc.set(4, 5, 0x1a1a1a);
    pc.rect(4, 8, 2, 1, 0x1a1a1a); pc.rect(3, 10, 4, 1, 0x5a5e62);
  });

  // --- booth, pay station
  A.add('q_booth_panel', 48, 30, (pc, rng) => {
    pc.wrap = false;
    const r = makeRamp(0xd8ceb0, 5, { spread: 0.3 });
    fillNoise(pc, r, 0.55, 0.08, 3, 651, 0.04);
    for (let x = 0; x < 48; x += 8) seamV(pc, x, 0, 29, r[1], r[4]);
    pc.rect(0, 0, 48, 3, 0x2a5a9a); pc.hline(0, 47, 3, 0x1a3a6a);
    rust(pc, 653, 0.35, 3, [0, 24, 48, 6]);
    grimeBottom(pc, 0x4a4030, 8, 0.8, 655);
    chips(pc, rng, 4, r[1], r[0]);
  });
  A.add('q_booth_glass', 32, 32, (pc) => {
    const r = makeRamp(0x2e3e4a, 5, { spread: 0.3 });
    pc.fillRamp(r, (x, y) => 0.4 + (tileFbm(x, y, 32, 32, 2, 2, 661) - 0.5) * 0.2, 0.7);
    // interior: warm desk lamp glow + papers
    glow(pc, 10, 22, 7, 5, 0x6a5a3a, 0.9); glow(pc, 10, 22, 3, 2, 0xb89a5a, 1);
    pc.rect(18, 24, 6, 2, 0x8a8a7a);
    // reflections: diagonal streaks
    for (let x = 0; x < 32; x++) for (let y = 0; y < 32; y++) {
      const t = (x + y * 0.8) % 32;
      if (t < 2) pc.blend(x, y, 0xb8d0d8, 0.4); else if (t > 12 && t < 14) pc.blend(x, y, 0x9ab0b8, 0.22);
    }
    pc.vline(0, 0, 31, 0xc8ccd0); pc.hline(0, 31, 0, 0xc8ccd0);
  });
  A.add('q_booth_sign', 34, 8, (pc) => {
    pc.wrap = false;
    pc.fill(0x2a5a9a); pc.bevel(0, 0, 34, 8, 0x4a7aba, 0x1a3a6a);
    textC(pc, 'PARKING', 17, 2, 0xffffff);
  });
  A.add('q_sign_p', 12, 12, (pc) => {
    pc.wrap = false;
    pc.fill(0x2a5aa8); pc.strokeRect(0, 0, 12, 12, 0xffffff);
    text(pc, 'P', 3, 2, 0xffffff, 2);
  });
  A.add('q_paystation', 16, 50, (pc, rng) => {
    pc.wrap = false;
    const r = makeRamp(0x5a6a7a, 5, { spread: 0.35 });
    fillNoise(pc, r, 0.5, 0.08, 3, 671, 0.04);
    pc.bevel(0, 0, 16, 50, r[4], r[0]);
    pc.rect(1, 2, 14, 7, 0x2a5aa8); textC(pc, 'PAY', 8, 3, 0xffffff);
    pc.rect(2, 11, 12, 8, 0x14181c);
    // keypad
    for (let j = 0; j < 4; j++) for (let i = 0; i < 3; i++) { pc.rect(4 + i * 3, 21 + j * 3, 2, 2, 0xc8ccd0); pc.set(5 + i * 3, 22 + j * 3, 0x6a6e72); }
    pc.rect(4, 34, 8, 1, 0x0a0a0a); pc.rect(5, 37, 6, 2, 0x2a2e32); pc.hline(5, 10, 37, 0x0a0a0a);
    pc.rect(3, 41, 10, 4, 0xe8e6de); scribble(pc, 4, 42, 8, 0x4a4a4e, 3, 2, 2);
    chips(pc, rng, 3, r[1], r[0]);
    grimeBottom(pc, 0x2a2a20, 6, 0.7, 673);
  });
  A.add('q_pay_screen', 8, 6, (pc) => {
    pc.wrap = false;
    pc.fill(0x1a4a7a);
    text(pc, '0', 1, 0, 0xa8e0ff); pc.set(4, 4, 0xa8e0ff); text(pc, '0', 5, 0, 0xa8e0ff);
    pc.hline(0, 7, 5, 0x2a6aa0);
  });

  // --- street furniture
  A.add('q_mailbox_front', 16, 22, (pc, rng) => {
    pc.wrap = false;
    const r = makeRamp(0x2c4c8c, 5, { spread: 0.38 });
    fillNoise(pc, r, 0.55, 0.08, 3, 681, 0.04);
    pc.bevel(0, 0, 16, 22, r[4], r[0]);
    textC(pc, 'MAIL', 8, 8, 0xf0f0e8);
    pc.rect(2, 15, 12, 4, 0xd8d8d0); scribble(pc, 3, 16, 10, 0x4a4a52, 5, 2, 2);
    chips(pc, rng, 4, 0x8a8a8a, r[0]);
  });
  A.add('q_mailbox_side', 16, 16, (pc, rng) => {
    const r = makeRamp(0x2c4c8c, 5, { spread: 0.38 });
    fillNoise(pc, r, 0.55, 0.08, 2, 683, 0.04);
    chips(pc, rng, 3, 0x8a8a8a, r[0]);
    for (let k = 0; k < 3; k++) { const x = rng.int(0, 13), y = rng.int(0, 15); pc.hline(x, x + 2, y, r[4]); }
  });
  A.add('q_hydrant', 22, 18, (pc, rng) => {
    pc.wrap = false;
    const r = makeRamp(0xc0302a, 5, { spread: 0.4 });
    fillNoise(pc, r, 0.55, 0.12, 3, 691, 0.05);
    chips(pc, rng, 8, 0x6a6a64, r[0]);
    rust(pc, 693, 0.35, 3);
    pc.hline(0, 21, 2, r[4]); pc.hline(0, 21, 3, r[1]);
    grimeBottom(pc, 0x3a2a1a, 5, 0.8, 695);
  });
  A.add('q_park_slat', 32, 8, (pc, rng) => {
    const r = makeRamp(0x8a5e38, 5, { spread: 0.42 });
    woodFill(pc, r, 701, 8, false, false);
    pc.grime(0x4a3a2a, 0.5, 2, 703, 0.62);
    // carved initials
    pc.set(12, 3, r[0]); pc.set(13, 4, r[0]); pc.set(14, 3, r[0]); pc.set(16, 3, r[0]); pc.set(16, 4, r[0]); pc.set(17, 4, r[0]);
  });
  A.add('q_plaque', 8, 3, (pc) => {
    pc.wrap = false;
    pc.fill(0xb08a3a); pc.hline(1, 6, 1, 0x5a4010); pc.set(0, 0, 0xe0c070);
  });
  A.add('q_picnic', 32, 32, (pc, rng) => {
    const r = makeRamp(0x8a7a62, 6, { spread: 0.42 });
    woodFill(pc, r, 711, 5, false, true);
    pc.grime(0x4a4232, 0.5, 3, 713, 0.62);
    // carved heart, ring stain, burn
    const H = r[0];
    for (const [x, y] of [[9, 9], [11, 9], [8, 10], [10, 10], [12, 10], [8, 11], [12, 11], [9, 12], [11, 12], [10, 13]]) pc.set(x, y, H);
    pc.stain(22, 20, 3, 0x6a5a42, 0x5a4a34, 3);
    pc.set(rng.int(0, 31), rng.int(0, 31), 0x2a2018); pc.set(26, 6, 0x2a2018); pc.set(27, 6, 0x3a2a1e);
  });
  A.add('q_grill_enamel', 16, 16, (pc, rng) => {
    const r = makeRamp(0x2a2a2e, 5, { spread: 0.5 });
    pc.fillRamp(r, (x, y) => 0.35 + (tileFbm(x, y, 16, 16, 2, 2, 721) - 0.5) * 0.3, 0.8);
    for (let x = 0; x < 16; x++) if (x % 5 === 1) for (let y = 0; y < 16; y++) pc.blend(x, y, r[4], 0.3);
    pc.drips(rng, 0x4a3a2a, 3, 0, 10, 0.4);
    for (let k = 0; k < 3; k++) pc.set(rng.int(0, 15), rng.int(0, 15), 0x6a3a1e);
  });
  A.add('q_trashcan_slats', 60, 27, (pc, rng) => {
    const r = makeRamp(0x2e5a3c, 5, { spread: 0.4 });
    pc.each((x, y) => pc.set(x, y, x % 4 === 3 ? 0x0e140f : x % 4 === 0 ? r[3] : r[2]));
    pc.hline(0, 59, 0, r[4]); pc.hline(0, 59, 1, r[1]); pc.hline(0, 59, 25, r[4]); pc.hline(0, 59, 26, r[0]);
    pc.rect(-2, 10, 22, 7, 0x2e5a3c);
    mirroredStamp(pc, 20, 5, -2, 11, (s) => text(s, 'TRASH', 0, 0, 0xe8e4d8));
    chips(pc, rng, 8, 0x6a6a64, r[0]);
    rust(pc, 731, 0.3, 4, [0, 18, 60, 9]);
  });
  A.add('q_shelter_glass', 32, 32, (pc, rng) => {
    const r = makeRamp(0x7a9aa6, 5, { spread: 0.3 });
    pc.fillRamp(r, (x, y) => 0.45 + (tileFbm(x, y, 32, 32, 2, 2, 741) - 0.5) * 0.25, 0.7);
    for (let x = 0; x < 32; x++) for (let y = 0; y < 32; y++) {
      const t = (x * 1.2 + y) % 32;
      if (t < 2) pc.blend(x, y, 0xe0f0f4, 0.45); else if (t > 9 && t < 11) pc.blend(x, y, 0xc8e0e8, 0.25);
    }
    // scratched tags
    for (let k = 0; k < 2; k++) { let x = rng.int(2, 26), y = rng.int(4, 26); for (let t = 0; t < 7; t++) { pc.set(x, y, 0xd8e4e8); x++; y += rng.int(-1, 1); } }
    pc.grime(0x5a6a5a, 0.4, 2, 743, 0.65);
  });
  A.add('q_poster_liminal', 24, 40, (pc) => {
    pc.wrap = false;
    gradV(pc, 0, 0, 24, 30, 0x9ac8ea, 0xf4c4d4, 6);
    pc.ellipse(6, 9, 4, 2, 0xffffff); pc.ellipse(9, 8, 3, 2.4, 0xffffff); pc.ellipse(18, 13, 4, 1.6, 0xf8f0f8);
    pc.rect(0, 30, 24, 10, 0x8ac478); for (let x = 0; x < 24; x += 3) pc.vline(x, 31, 39, 0x7ab468);
    // a small house with one lit window
    poly(pc, [[9, 24], [15, 19], [21, 24]], 0xc8a0b0);
    pc.rect(10, 24, 10, 7, 0xf0ece4); pc.rect(12, 26, 2, 2, 0xffd860); pc.rect(16, 26, 2, 5, 0x8a7a8a);
    textC(pc, 'STAY', 12, 2, 0xffffff, 1, 0x7a98c0);
    pc.rect(0, 33, 24, 7, 0xf0ece4); textC(pc, 'HERE', 12, 34, 0x3a5a8a);
    pc.strokeRect(0, 0, 24, 40, 0xd0d4d8);
  });
  A.add('q_bus_sign', 16, 20, (pc) => {
    pc.wrap = false;
    pc.fill(0x2a6a3a); pc.strokeRect(0, 0, 16, 20, 0xf0f0e8);
    // bus pictogram
    pc.rect(3, 3, 10, 7, 0xf0f0e8); pc.rect(4, 4, 3, 2, 0x2a6a3a); pc.rect(8, 4, 3, 2, 0x2a6a3a);
    pc.set(4, 10, 0xf0f0e8); pc.set(11, 10, 0xf0f0e8);
    textC(pc, 'BUS', 8, 12, 0xf0f0e8);
  });
  A.add('q_bus_schedule', 10, 14, (pc) => {
    pc.wrap = false;
    pc.fill(0xf0eee6); pc.rect(0, 0, 10, 3, 0x2a6a3a);
    for (let y = 4; y < 13; y += 2) { pc.hline(1, 3, y, 0x3a3a3a); pc.set(5, y, 0x3a3a3a); pc.hline(6, 8, y, 0x8a8a8a); }
  });
  A.add('q_shelter_fascia', 96, 5, (pc) => {
    pc.wrap = false;
    pc.fill(0x2a3236);
    textC(pc, 'BUS STOP', 48, 0, 0xf0f0e8);
    pc.hline(0, 95, 4, 0x1a1e20);
  });
  A.add('q_tube_light', 8, 2, (pc) => { pc.wrap = false; pc.fill(0xf4f8ff); pc.hline(0, 7, 1, 0xc8d8e8); });
  A.add('q_phone_sign', 20, 6, (pc) => {
    pc.wrap = false;
    pc.fill(0x1e4a9a); textC(pc, 'PHONE', 10, 0, 0xffffff); pc.hline(0, 19, 5, 0x15357a);
  });
  A.add('q_payphone', 10, 14, (pc) => {
    pc.wrap = false;
    pc.fill(0x9aa0a4); pc.bevel(0, 0, 10, 14, 0xd0d4d8, 0x5a5e62);
    pc.rect(2, 1, 6, 2, 0x2a3a2a); pc.hline(3, 6, 2, 0x6ad06a);
    for (let j = 0; j < 4; j++) for (let i = 0; i < 3; i++) pc.set(3 + i * 2, 5 + j * 2, 0x2a2a2e);
    pc.rect(8, 4, 1, 3, 0x1a1a1a); pc.rect(3, 12, 4, 1, 0x1a1a1a);
  });
  A.add('q_newsbox_front', 16, 18, (pc, rng) => {
    pc.wrap = false;
    const r = makeRamp(0xd8a830, 5, { spread: 0.38 });
    fillNoise(pc, r, 0.55, 0.08, 3, 751, 0.04);
    pc.bevel(0, 0, 16, 18, r[4], r[0]);
    // window with today's paper
    pc.rect(2, 2, 12, 12, 0x3a3e40);
    pc.rect(3, 3, 10, 10, 0xe8e4d6);
    pc.rect(3, 3, 10, 2, 0x1a1a1a);
    pc.rect(4, 6, 5, 4, 0x7a7a76); pc.rect(6, 7, 1, 3, 0x1a1a1a);
    scribble(pc, 10, 6, 3, 0x4a4a4a, 2, 3, 2); scribble(pc, 4, 11, 8, 0x4a4a4a, 4, 1, 2);
    for (let k = 0; k < 4; k++) pc.blend(3 + k, 3 + k, 0xffffff, 0.35);
    pc.rect(6, 15, 4, 2, 0x5a5e62); pc.set(7, 15, 0x1a1a1a);
    chips(pc, rng, 3, 0x7a7a74, r[0]);
  });
  A.add('q_house_number', 12, 5, (pc) => { pc.wrap = false; pc.fill(0x1e2022); text(pc, '404', 1, 0, 0xf0ece0); });

  // --- billboard
  A.add('q_billboard_ad', 128, 64, (pc) => {
    pc.wrap = false;
    gradV(pc, 0, 0, 128, 46, 0x4f8fd6, 0xf2a8c4, 8);
    const cloud = (cx: number, cy: number, s: number) => {
      pc.ellipse(cx, cy, 7 * s, 3 * s, 0xf4f4fa); pc.ellipse(cx - 4 * s, cy - 2 * s, 4 * s, 3 * s, 0xffffff);
      pc.ellipse(cx + 3 * s, cy - 3 * s, 5 * s, 3.5 * s, 0xffffff); pc.ellipse(cx, cy + 1.5 * s, 7 * s, 1.5 * s, 0xdcd8ea);
    };
    cloud(104, 7, 1.2); cloud(22, 38, 0.9); cloud(72, 37, 0.7);
    for (let y = 46; y < 64; y++) for (let x = 0; x < 128; x++) {
      const band = Math.floor((y - 46) / 3) % 2;
      pc.set(x, y, (band ? 0x4f9a48 : 0x5aa852) - (ph(x, y, 761) < 0.15 ? 0x081008 : 0));
    }
    // the door in the field
    pc.rect(101, 49, 8, 2, 0x6a9a5a);
    pc.rect(98, 28, 12, 22, 0xf2f0ea); pc.rect(100, 30, 8, 20, 0xdedad0); pc.vline(107, 30, 49, 0x0a0a0c); pc.vline(106, 31, 49, 0x2a2a30);
    pc.set(101, 40, 0xb08a3a);
    text(pc, 'HAVE YOU TRIED', 6, 9, 0xffffff, 2, 0x22407a);
    text(pc, 'WAKING UP?', 6, 23, 0xfff4a0, 2, 0x22407a);
    scribble(pc, 6, 58, 30, 0x4a7a3a, 5);
    pc.strokeRect(0, 0, 128, 64, 0xf0f0ea); pc.strokeRect(1, 1, 126, 62, 0xc8ccd0);
    // weathering: peeling corner + streaks
    for (let k = 0; k < 9; k++) pc.set(120 + (k % 3), 54 + Math.floor(k / 3) * 2, 0x8a8a84);
    for (let x = 0; x < 128; x += 11) for (let y = 0; y < 30; y++) if (ph(x, y, 7) < 0.4) pc.blend(x, y + 30, 0x5a6a6a, 0.12);
  });
  A.add('q_catwalk', 16, 16, (pc) => {
    const r = makeRamp(0x4a4e52, 5, { spread: 0.4 });
    pc.each((x, y) => pc.set(x, y, (x % 4 === 0 || y % 4 === 0) ? r[3] : (x % 4 === 1 || y % 4 === 1) ? r[1] : 0x141618));
  });
  A.add('q_billboard_back', 32, 32, (pc, rng) => {
    const r = makeRamp(0x6a6a66, 5, { spread: 0.4 });
    fillNoise(pc, r, 0.5, 0.12, 2, 771, 0.05);
    for (let x = 0; x < 32; x += 16) seamV(pc, x, 0, 31, r[0], r[3]);
    pc.hline(0, 31, 15, r[0]); pc.hline(0, 31, 16, r[3]);
    rust(pc, 773, 0.35, 3);
    pc.drips(rng, 0x4a3a2a, 4, 0, 24, 0.3);
  });

  // --- plants (alpha cut-outs: background left transparent)
  A.add('q_leaf_oak', 32, 32, (pc) => leafBlob(pc, 0x4c7a34, 781, 0.07));
  A.add('q_leaf_oak_b', 32, 32, (pc) => leafBlob(pc, 0x587f36, 783, 0.05));
  A.add('q_bush', 32, 32, (pc) => leafBlob(pc, 0x5a8a3c, 785, 0.04, [0xf0e8f0, 0xf6a8c8]));
  A.add('q_leaf_pine', 32, 24, (pc) => {
    pc.wrap = false;
    const R = makeRamp(0x22462c, 6, { hueShift: 0.05, spread: 0.55 });
    for (let y = 0; y < 24; y++) for (let x = 0; x < 32; x++) {
      const tooth = Math.abs((x % 4) - 1.5);
      const edge = 23 - Math.round(tooth * 2) - (hashf(Math.floor(x / 4), 1, 791) < 0.3 ? 2 : 0);
      if (y > edge) continue;
      const needle = ((x + y * 2) % 3 === 0) ? 1 : 0;
      const k = Math.round(1 + (y / 24) * 2.6 + needle + (ph(x, y, 792) - 0.5) * 1.2);
      pc.set(x, y, R[Math.max(0, Math.min(5, k))]);
      if (y > edge - 2 && ph(x, y, 793) < 0.5) pc.set(x, y, R[5]);
    }
  });
  A.add('q_twigs', 32, 32, (pc) => {
    pc.wrap = false;
    const C = [0x3a322c, 0x4a4038, 0x5e544a];
    const branch = (x: number, y: number, a: number, len: number, depth: number, seed: number) => {
      let cx = x, cy = y;
      for (let i = 0; i < len; i++) {
        cx += Math.cos(a); cy -= Math.sin(a);
        pc.set(Math.round(cx), Math.round(cy), C[Math.min(2, 2 - depth)]);
        if (depth >= 2) pc.set(Math.round(cx) + 1, Math.round(cy), C[0]);
        a += (hashf(i, depth, seed) - 0.5) * 0.5;
      }
      if (depth > 0) {
        branch(cx, cy, a + 0.5, Math.floor(len * 0.7), depth - 1, seed + 1);
        branch(cx, cy, a - 0.55, Math.floor(len * 0.65), depth - 1, seed + 2);
      }
    };
    branch(16, 31, Math.PI / 2, 10, 3, 801);
    branch(8, 31, Math.PI / 2 + 0.4, 7, 2, 805);
    branch(25, 31, Math.PI / 2 - 0.4, 7, 2, 809);
  });
  A.add('q_grass_tall', 32, 20, (pc) => {
    pc.wrap = false;
    const G = makeRamp(0x6a9a3e, 6, { hueShift: 0.06, spread: 0.5 });
    for (let k = 0; k < 46; k++) {
      const x0 = hashf(k, 1, 811) * 31, h = 7 + hashf(k, 2, 811) * 12, lean = (hashf(k, 3, 811) - 0.5) * 6;
      for (let t = 0; t < h; t++) {
        const f = t / h;
        const x = Math.round(x0 + lean * f * f), y = 19 - t;
        pc.set(x, y, G[Math.min(5, Math.floor(1 + f * 4 + (k % 3 === 0 ? 1 : 0)))]);
      }
      if (k % 5 === 0) { const x = Math.round(x0 + lean), y = Math.round(19 - h); pc.set(x, y, 0xd8cc88); pc.set(x, y - 1, 0xc8b878); }
    }
  });
  A.add('q_flowers', 32, 16, (pc) => {
    pc.wrap = false;
    const G = makeRamp(0x5a8a3a, 4, { spread: 0.4 });
    const cols = [0xf28ab4, 0xf2d244, 0xb294e6, 0xf4f2ea, 0x8ac8f0];
    for (let k = 0; k < 24; k++) {
      const x = Math.round(1 + hashf(k, 1, 821) * 29), h = 6 + Math.floor(hashf(k, 2, 821) * 9);
      for (let t = 0; t < h; t++) pc.set(x + (t > h / 2 && k % 2 ? 1 : 0), 15 - t, G[t < 3 ? 0 : 1]);
      if (k % 3 === 0) { pc.set(x - 1, 13, G[2]); pc.set(x + 1, 12, G[3]); }
      const c = cols[k % cols.length], top = 15 - h, fx = x + (k % 2);
      pc.set(fx, top - 1, c); pc.set(fx - 1, top, c); pc.set(fx + 1, top, c); pc.set(fx, top + 1, c);
      pc.set(fx, top, k % cols.length === 3 ? 0xf2c840 : scaleHex(c, 0.7));
    }
  });

  // --- wood / rural
  A.add('q_pole_wood', 16, 32, (pc, rng) => {
    const r = makeRamp(0x5e4a3a, 6, { spread: 0.45 });
    pc.fillRamp(r, (x, y) => 0.45 + Math.sin((x + tileFbm(x, y, 16, 32, 2, 2, 831) * 4) * 1.4) * 0.12 + (tileFbm(x, y, 16, 32, 3, 3, 832) - 0.5) * 0.3, 0.7);
    for (let k = 0; k < 4; k++) { const x = rng.int(0, 15), y = rng.int(0, 31); pc.vline(x, y, y + rng.int(3, 8), r[0]); }
    for (let k = 0; k < 5; k++) { const x = rng.int(0, 14), y = rng.int(0, 31); pc.set(x, y, 0xa8a8a0); pc.set(x + 1, y, 0x7a7a74); }
  });
  A.add('q_dish', 16, 16, (pc, rng) => {
    const r = makeRamp(0xd8d6ce, 5, { spread: 0.3 });
    fillNoise(pc, r, 0.6, 0.1, 2, 841, 0.05);
    pc.drips(rng, 0x8a8470, 3, 0, 14, 0.3);
  });
  A.add('q_dish_face', 20, 20, (pc) => {
    pc.wrap = false;
    const r = makeRamp(0xe2e0d8, 6, { spread: 0.32 });
    pc.fill(r[1]);
    pc.each((x, y) => {
      const d = Math.hypot(x + 0.5 - 10, y + 0.5 - 10);
      if (d < 9.8) pc.set(x, y, r[Math.max(0, Math.min(5, Math.round(4 - d * 0.25 + (y < 10 ? 0.5 : -0.5) + (bayer(x, y) - 0.5))))]);
    });
    pc.circle(10, 10, 1.6, 0x8a8a84);
    pc.stain(13, 13, 3, 0x9a9070, 0x8a8060, 4);
  });
  A.add('q_hay', 32, 16, (pc, rng) => {
    const r = makeRamp(0xd2b45a, 6, { hueShift: 0.04, spread: 0.45 });
    pc.fillRamp(r, (x, y) => 0.5 + (ph(Math.floor(x / 3), y, 851) - 0.5) * 0.5 + (tileFbm(x, y, 32, 16, 2, 2, 852) - 0.5) * 0.3, 0.6);
    for (let k = 0; k < 30; k++) { const x = rng.int(0, 31), y = rng.int(0, 15), l = rng.int(2, 5); for (let i = 0; i < l; i++) pc.set(x + i, y + (i > 2 ? 1 : 0), rng.chance(0.5) ? r[5] : r[1]); }
    pc.grime(0x6a5a2a, 0.4, 2, 853, 0.62);
  });
  A.add('q_straw', 8, 8, (pc) => {
    const r = makeRamp(0xd2b45a, 5, { spread: 0.45 });
    pc.each((x, y) => pc.set(x, y, r[(x + y * 3) % 5 === 0 ? 0 : 1 + Math.floor(ph(x, y, 861) * 4)]));
  });
  A.add('q_burlap', 16, 16, (pc) => {
    const r = makeRamp(0xa8885a, 5, { spread: 0.35 });
    pc.each((x, y) => pc.set(x, y, r[((x % 2) ^ (y % 2)) ? 2 : 3 - (ph(x, y, 871) < 0.2 ? 1 : 0)]));
    pc.grime(0x5a4a2a, 0.5, 2, 873, 0.6);
  });
  A.add('q_burlap_face', 8, 10, (pc) => {
    pc.wrap = false;
    const r = makeRamp(0xa8885a, 5, { spread: 0.35 });
    pc.each((x, y) => pc.set(x, y, r[((x % 2) ^ (y % 2)) ? 2 : 3]));
    const K = 0x1a1410;
    // stitched X eyes
    pc.set(1, 2, K); pc.set(3, 2, K); pc.set(2, 3, K); pc.set(1, 4, K); pc.set(3, 4, K);
    pc.set(5, 2, K); pc.set(6, 3, K); pc.set(5, 4, K); pc.set(7, 2, K); pc.set(7, 4, K);
    // stitched grin
    for (let x = 1; x < 7; x++) pc.set(x, x % 2 ? 7 : 6, K);
    pc.set(0, 6, K); pc.set(7, 6, K);
    pc.blend(4, 8, 0x5a2a1a, 0.6); pc.blend(4, 9, 0x5a2a1a, 0.4);
  });
  A.add('q_plaid', 16, 16, (pc) => {
    pc.each((x, y) => {
      const a = (x % 8) < 3, b = (y % 8) < 3;
      const c = a && b ? 0x2a1414 : a || b ? 0x7a1e1a : 0xb0302a;
      pc.set(x, y, (x + y) % 2 === 0 && (a || b) ? scaleHex(c, 0.85) : c);
    });
    pc.grime(0x3a2a1a, 0.5, 2, 881, 0.6);
  });
  A.add('q_hose', 8, 8, (pc) => {
    pc.each((x, y) => pc.set(x, y, y % 4 === 0 ? 0x5ab85a : y % 4 === 3 ? 0x1e5a2a : 0x2e8a3a));
    pc.set(2, 1, 0xf0e050); pc.set(6, 5, 0xf0e050);
  });
});

// ---------------------------------------------------------------------------
// objects — parking & street
// ---------------------------------------------------------------------------
function flyer(mb: ModelBuilder, x: number, y: number, z: number, faceZ = true) {
  if (faceZ) mb.box(x, y, z, 0.2, 0.28, 0.006, { south: 'q_flyer', sides: 'paper' }, { fit: { south: true } });
  else mb.box(x, y, z, 0.006, 0.28, 0.2, { east: 'q_flyer', sides: 'paper' }, { fit: { east: true } });
}

defObj({
  key: 'lamp_post', name: 'Sodium Lamp Post', w: 1, d: 1, height: 4.4, block: 'solid', tall: true,
  power: true, sound: 'metal', hp: 1500,
  light: { color: 0xffa040, intensity: 1.15, radius: 9, y: 4.0, kind: 'sodium', power: true },
  desc: 'A tall lamp washing the lot in sodium orange. Moths circle something you cannot see.',
  tags: [...T, 'parking', 'light'],
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.24, 0.3, 8, { sides: 'concrete', top: 'concrete' });
    mb.cylinder(0, 0.3, 0, 0.15, 0.05, 8, 'metal_dark');
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; mb.box(Math.cos(a) * 0.11, 0.35, Math.sin(a) * 0.11, 0.03, 0.03, 0.03, 'metal_dark'); }
    mb.cylinder(0, 0.35, 0, 0.075, 3.85, 8, 'q_pole_galv', { rTop: 0.055, caps: false });
    // arm and cobra head
    rod(mb, 0, 4.12, 0, 0, 4.25, 0.5, 0.035, 6, 'q_pole_galv');
    mb.sphere(0, 4.17, 0, 0.06, 6, 3, 'q_pole_galv');
    mb.push(); mb.translate(0, 4.2, 0.62); mb.rotateX(-0.08);
    mb.box(0, 0, 0, 0.36, 0.13, 0.66, 'q_lamp_head');
    mb.box(0, 0.13, -0.06, 0.26, 0.06, 0.46, 'q_lamp_head');
    // drop refractor: its glowing sides are what the iso camera sees
    mb.box(0, -0.11, 0.04, 0.28, 0.11, 0.5, { sides: 'q_sodium_lens', top: 'q_lamp_head', bottom: 'q_sodium_lens' }, { fit: true, emissive: 1.7 });
    mb.cylinder(0, 0.17, -0.12, 0.03, 0.04, 6, 'plastic_black');
    mb.pop();
    flyer(mb, 0, 1.45, 0.078);
    mb.box(0.06, 1.0, 0.05, 0.08, 0.08, 0.004, 'paper', { color: 0xf0e070 });
  },
});

defObj({
  key: 'street_light', name: 'Street Lantern', w: 1, d: 1, height: 3.45, block: 'solid', tall: true,
  power: true, sound: 'metal', hp: 1200,
  light: { color: 0xffb860, intensity: 0.95, radius: 7, y: 3.0, kind: 'sodium', power: true },
  desc: 'An old cast-iron lantern post. It hums a single low note all night.',
  tags: [...T, 'street', 'light'],
  model: (mb) => {
    const G = 'q_iron_green';
    mb.cylinder(0, 0, 0, 0.17, 0.12, 8, G);
    mb.cylinder(0, 0.12, 0, 0.15, 0.45, 8, G, { rTop: 0.09 });
    mb.cylinder(0, 0.57, 0, 0.11, 0.06, 8, G);
    mb.cylinder(0, 0.63, 0, 0.055, 2.15, 8, G, { rTop: 0.045, caps: false });
    mb.cylinder(0, 1.6, 0, 0.07, 0.05, 8, G);
    mb.cylinder(0, 2.78, 0, 0.065, 0.06, 8, G);
    // ladder rest arms
    for (const s of [-1, 1]) rod(mb, 0, 2.6, 0, s * 0.2, 2.72, 0, 0.012, 4, G);
    // lantern
    mb.cylinder(0, 2.84, 0, 0.09, 0.08, 4, G, { rTop: 0.17 });
    mb.box(0, 2.92, 0, 0.26, 0.36, 0.26, { sides: 'q_lantern_pane', top: G }, { fit: true, emissive: 1.0 });
    for (const x of [-0.13, 0.13]) for (const z of [-0.13, 0.13]) mb.box(x, 2.92, z, 0.025, 0.36, 0.025, G);
    mb.push(); mb.translate(0, 3.28, 0); mb.rotateY(Math.PI / 4);
    mb.cylinder(0, 0, 0, 0.23, 0.14, 4, G, { rTop: 0.03 });
    mb.pop();
    mb.sphere(0, 3.44, 0, 0.03, 5, 3, G);
  },
});

defObj({
  key: 'traffic_cone', name: 'Traffic Cone', w: 1, d: 1, height: 0.72, block: 'low',
  movable: 3, sound: 'plastic', flammable: 0.3,
  desc: 'An orange cone. Someone keeps moving these into lines that point at walls.',
  tags: [...T, 'parking', 'pushable'],
  model: (mb) => {
    mb.push(); mb.rotateY(0.3);
    mb.box(0, 0, 0, 0.38, 0.035, 0.38, 'rubber_black');
    mb.cylinder(0, 0.035, 0, 0.15, 0.66, 10, { sides: 'q_cone', top: 'q_cone', bottom: 'rubber_black' }, { fit: true, rTop: 0.022 });
    mb.pop();
  },
});

defObj({
  key: 'parking_barrier', name: 'Concrete Barrier', w: 2, d: 1, height: 0.8, block: 'low',
  sound: 'metal', hp: 4000,
  desc: 'A precast concrete barrier, cold and gritty. The spray-painted number is not this lot.',
  tags: [...T, 'parking', 'barrier'],
  model: (mb) => {
    const prof: [number, number][] = [[0.3, 0], [0.3, 0.08], [0.19, 0.24], [0.09, 0.8], [-0.09, 0.8], [-0.19, 0.24], [-0.3, 0.08], [-0.3, 0]];
    const seg = (xa: number, xb: number, hazardTop: boolean) => {
      for (let i = 0; i + 1 < prof.length; i++) {
        const [za, ya] = prof[i], [zb, yb] = prof[i + 1];
        const tex = hazardTop && (i === 2 || i === 4) ? 'q_hazard' : 'q_jersey';
        // profile runs clockwise seen from +x, so this winding faces outward
        quadW(mb, [[xa, ya, za], [xb, ya, za], [xb, yb, zb], [xa, yb, zb]], tex, { shade: i === 3 ? 1 : 0.92 });
      }
    };
    seg(-0.96, -0.66, true); seg(-0.66, 0.66, false); seg(0.66, 0.96, true);
    // end caps
    for (const s of [-1, 1]) {
      const x = s * 0.96;
      for (let i = 1; i + 1 < prof.length; i++) {
        const p0 = [x, prof[0][1], prof[0][0]], p1 = [x, prof[i][1], prof[i][0]], p2 = [x, prof[i + 1][1], prof[i + 1][0]];
        if (s > 0) triW(mb, [p0, p2, p1], 'q_jersey', { shade: 0.9 }); else triW(mb, [p0, p1, p2], 'q_jersey', { shade: 0.84 });
      }
    }
    // lifting loops
    for (const x of [-0.55, 0.55]) {
      mb.box(x - 0.05, 0.8, 0, 0.015, 0.06, 0.015, 'q_pipe_rust');
      mb.box(x + 0.05, 0.8, 0, 0.015, 0.06, 0.015, 'q_pipe_rust');
      mb.box(x, 0.86, 0, 0.115, 0.015, 0.015, 'q_pipe_rust');
    }
  },
});

defObj({
  key: 'bollard', name: 'Bollard', w: 1, d: 1, height: 1.0, block: 'low',
  sound: 'metal', hp: 3000,
  desc: 'A yellow steel bollard, scuffed by a thousand bumpers.',
  tags: [...T, 'parking', 'barrier'],
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.14, 0.03, 8, 'concrete');
    mb.cylinder(0, 0.03, 0, 0.1, 0.9, 10, { sides: 'q_bollard', top: 'q_bollard' }, { fit: true, caps: false });
    mb.cylinder(0, 0.93, 0, 0.1, 0.07, 10, 'plastic_yellow', { rTop: 0.05 });
  },
});

defObj({
  key: 'parking_meter', name: 'Parking Meter', w: 1, d: 1, height: 1.55, block: 'low',
  sound: 'metal', hp: 600,
  disassemble: { tools: ['#crowbar'], time: 25, skill: 'mechanics', yields: [['scrap_metal', 2, 4], ['electronics_scrap', 0, 1]] },
  desc: 'EXPIRED. It has said so for a very long time.',
  tags: [...T, 'parking'],
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.07, 0.03, 8, 'metal_dark');
    mb.cylinder(0, 0.03, 0, 0.035, 1.12, 8, 'q_pole_galv', { caps: false });
    mb.box(0, 1.12, 0, 0.12, 0.05, 0.1, 'metal_dark');
    mb.box(0, 1.17, 0, 0.2, 0.26, 0.15, { south: 'q_meter_head', north: 'q_meter_head', sides: 'q_steel_grey', top: 'q_steel_grey' }, { fit: { south: true, north: true } });
    mb.cylinderZ(0, 1.43, 0, 0.1, 0.15, 10, 'q_steel_grey');
    disc(mb, 0, 1.43, 0.076, 0.085, 10, 'glass_dark');
  },
});

defObj({
  key: 'ticket_booth', name: 'Parking Booth', w: 2, d: 2, height: 2.6, block: 'solid', blocksSight: true, tall: true,
  power: true, sound: 'metal', hp: 1500,
  light: { color: 0xffd8a0, intensity: 0.55, radius: 3.5, y: 1.9, kind: 'bulb', power: true },
  desc: 'An attendant booth with the lamp still on. A half-finished crossword waits on the desk.',
  tags: [...T, 'parking', 'building'],
  model: (mb) => {
    mb.box(0, 0, 0, 1.75, 0.12, 1.75, { top: 'concrete', sides: 'concrete' }, { skip: ['bottom'] });
    mb.box(0, 0.12, 0, 1.5, 0.95, 1.5, { sides: 'q_booth_panel', top: 'q_booth_panel' }, { fit: { south: true, north: true, east: true, west: true } });
    mb.box(0, 1.07, 0, 1.46, 1.0, 1.46, { sides: 'q_booth_glass', top: 'q_steel_cream' });
    // pay window: open sliding pane + counter
    mb.box(0.25, 1.07, 0.74, 0.6, 0.5, 0.02, 'q_void');
    mb.box(0.25, 1.05, 0.82, 0.7, 0.04, 0.18, 'q_steel_cream');
    // corner posts and mullions
    for (const x of [-0.74, 0.74]) for (const z of [-0.74, 0.74]) mb.box(x, 1.07, z, 0.06, 1.0, 0.06, 'plastic_white');
    for (const x of [-0.2]) mb.box(x, 1.07, 0.745, 0.04, 1.0, 0.03, 'plastic_white');
    // roof with overhang and sign
    mb.box(0, 2.07, 0, 1.86, 0.12, 1.86, { top: 'q_steel_dark', sides: 'q_steel_cream' });
    mb.box(0, 2.19, 0.55, 1.1, 0.26, 0.06, { south: 'q_booth_sign', north: 'q_booth_sign', sides: 'q_steel_dark', top: 'q_steel_dark' }, { fit: { south: true, north: true } });
    mb.box(-0.62, 2.19, -0.5, 0.4, 0.28, 0.3, { sides: 'q_grille', top: 'q_steel_grey' }, { fit: { south: true, east: true } });
    // boom gate post with raised arm
    mb.box(0.86, 0.0, 0.86, 0.18, 0.95, 0.18, { sides: 'q_paint_yellow', top: 'q_steel_dark' });
    mb.box(0.86, 0.95, 0.96, 0.06, 1.55, 0.06, 'q_hazard_red');
    mb.box(0.86, 0.82, 0.96, 0.1, 0.16, 0.1, 'metal_dark');
    // P sign on the wall
    mb.box(-0.4, 0.45, 0.755, 0.34, 0.34, 0.01, 'q_sign_p', { fit: true });
  },
});

defObj({
  key: 'pay_station', name: 'Pay Station', w: 1, d: 1, height: 1.75, block: 'solid',
  power: true, sound: 'metal',
  light: { color: 0x8ac8ff, intensity: 0.22, radius: 1.8, y: 1.3, kind: 'screen', power: true },
  disassemble: { tools: ['#screwdriver', '#crowbar'], time: 40, skill: 'electrical', yields: [['electronics_scrap', 2, 4], ['sheet_metal', 1, 2], ['wire', 1, 3]] },
  desc: 'PAY HERE. The display shows 0.00 and will not accept anything you have.',
  tags: [...T, 'parking'],
  model: (mb) => {
    mb.box(0, 0, -0.05, 0.64, 0.08, 0.5, 'concrete', { skip: ['bottom'] });
    mb.box(0, 0.08, -0.08, 0.5, 1.56, 0.36, { south: 'q_paystation', sides: 'q_steel_blue', top: 'q_steel_blue' }, { fit: { south: true } });
    mb.box(0, 1.64, -0.06, 0.56, 0.06, 0.44, 'q_steel_dark');
    mb.box(0, 1.21, 0.105, 0.36, 0.24, 0.01, 'q_pay_screen', { fit: true, emissive: 0.9 });
  },
});

defObj({
  key: 'mailbox', name: 'Mailbox', w: 1, d: 1, height: 1.2, block: 'solid',
  container: { capacity: 12, kind: 'mailbox', loot: 'mailbox', lockable: true },
  sound: 'metal',
  desc: 'A public mailbox. The pickup times are listed as "soon".',
  tags: [...T, 'street', 'mail'],
  model: (mb) => {
    for (const x of [-0.2, 0.2]) for (const z of [-0.18, 0.18]) mb.box(x, 0, z, 0.05, 0.16, 0.05, 'q_steel_blue', { skip: ['bottom'] });
    mb.box(0, 0.15, 0, 0.5, 0.78, 0.46, { south: 'q_mailbox_front', sides: 'q_mailbox_side', top: 'q_mailbox_side' }, { fit: { south: true } });
    mb.cylinderZ(0, 0.93, 0, 0.25, 0.46, 10, { sides: 'q_mailbox_side', top: 'q_mailbox_side', bottom: 'q_mailbox_side' });
    mb.box(0, 0.86, 0.25, 0.34, 0.12, 0.05, 'q_steel_blue');
    mb.box(0, 0.94, 0.27, 0.18, 0.02, 0.02, 'metal_grey');
  },
});

defObj({
  key: 'fire_hydrant', name: 'Fire Hydrant', w: 1, d: 1, height: 0.75, block: 'low',
  sound: 'metal', hp: 3000,
  desc: 'A red hydrant. Press your ear to it and you hear the sea.',
  tags: [...T, 'street'],
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.15, 0.05, 8, 'q_hydrant');
    mb.cylinder(0, 0.05, 0, 0.105, 0.45, 9, { sides: 'q_hydrant', top: 'q_hydrant' }, { fit: true, caps: false });
    mb.cylinder(0, 0.5, 0, 0.13, 0.06, 9, 'q_hydrant');
    mb.cylinder(0, 0.56, 0, 0.11, 0.1, 9, 'q_hydrant', { rTop: 0.05 });
    mb.cylinder(0, 0.66, 0, 0.03, 0.05, 5, 'q_pipe_rust');
    mb.cylinderX(0, 0.36, 0, 0.045, 0.32, 8, 'q_hydrant');
    for (const s of [-1, 1]) mb.cylinderX(s * 0.17, 0.36, 0, 0.055, 0.03, 6, 'q_pipe_rust');
    mb.cylinderZ(0, 0.3, 0.12, 0.065, 0.12, 8, 'q_hydrant');
    mb.cylinderZ(0, 0.3, 0.19, 0.075, 0.03, 6, 'q_pipe_rust');
  },
});

// ---------------------------------------------------------------------------
// objects — parks & streets
// ---------------------------------------------------------------------------
defObj({
  key: 'bench_park', name: 'Park Bench', w: 2, d: 1, height: 0.9, block: 'low', sit: true,
  sound: 'wood', flammable: 0.5,
  disassemble: { tools: ['#screwdriver', '#saw'], time: 30, skill: 'carpentry', yields: [['plank', 2, 4], ['scrap_metal', 2, 3], ['screws', 4, 8]] },
  desc: 'A park bench with a brass plaque: IN MEMORY OF — the name has been rubbed away.',
  tags: [...T, 'park', 'sit'],
  model: (mb) => {
    const G = 'q_iron_green';
    for (const x of [-0.85, 0.85]) {
      mb.box(x, 0, 0.16, 0.06, 0.44, 0.06, G);
      rod(mb, x, 0, -0.18, x, 0.88, -0.32, 0.03, 4, G);
      mb.box(x, 0.4, -0.02, 0.06, 0.04, 0.42, G);
      mb.box(x, 0.62, 0.0, 0.07, 0.04, 0.4, G);
      rod(mb, x, 0.44, 0.17, x, 0.62, 0.17, 0.025, 4, G);
    }
    for (let i = 0; i < 4; i++) mb.box(0, 0.43, -0.15 + i * 0.1, 1.86, 0.03, 0.08, 'q_park_slat', { uvOffset: [0, i * 0.25] });
    mb.push(); mb.translate(0, 0.5, -0.24); mb.rotateX(-0.2);
    for (let i = 0; i < 3; i++) mb.box(0, 0.06 + i * 0.12, 0, 1.86, 0.09, 0.03, 'q_park_slat', { uvOffset: [0.3, i * 0.25] });
    mb.box(0.1, 0.22, 0.017, 0.16, 0.05, 0.005, 'q_plaque', { fit: true });
    mb.pop();
  },
});

defObj({
  key: 'picnic_table', name: 'Picnic Table', w: 2, d: 2, height: 0.78, block: 'table', sit: true, surface: 0.78,
  sound: 'wood', flammable: 0.7,
  disassemble: { tools: ['#hammer', '#saw'], time: 35, skill: 'carpentry', yields: [['plank', 4, 7], ['nails', 4, 10]] },
  desc: 'A weathered picnic table. Someone carved a heart. Someone else carved it out.',
  tags: [...T, 'park', 'sit', 'table'],
  model: (mb) => {
    const W = 'q_picnic';
    for (let i = 0; i < 5; i++) mb.box(0, 0.74, -0.32 + i * 0.16, 1.85, 0.04, 0.14, W, { uvOffset: [0, i * 0.3] });
    for (const s of [-1, 1]) for (let i = 0; i < 2; i++) mb.box(0, 0.43, s * (0.62 + i * 0.13), 1.85, 0.035, 0.12, W, { uvOffset: [0.5, i * 0.2] });
    for (const x of [-0.68, 0.68]) {
      for (const s of [-1, 1]) rod(mb, x, 0.0, s * 0.72, x, 0.74, s * 0.08, 0.035, 4, W);
      mb.box(x, 0.36, 0, 0.07, 0.07, 1.6, W);
      mb.box(x, 0.68, 0, 0.07, 0.06, 0.68, W);
    }
    rod(mb, -0.68, 0.38, 0, 0, 0.72, 0, 0.03, 4, W);
    rod(mb, 0.68, 0.38, 0, 0, 0.72, 0, 0.03, 4, W);
    // forgotten paper cup and napkin
    mb.cylinder(0.4, 0.78, 0.1, 0.035, 0.09, 6, 'paper', { rTop: 0.042, color: 0xf0e8e0 });
    mb.box(-0.2, 0.78, -0.1, 0.16, 0.004, 0.16, 'paper');
  },
});

defObj({
  key: 'bbq_grill', name: 'Kettle Grill', w: 1, d: 1, height: 1.05, block: 'low',
  heat: 'grill', movable: 18, sound: 'metal',
  disassemble: { tools: ['#screwdriver'], time: 15, skill: 'mechanics', yields: [['scrap_metal', 2, 4], ['screws', 2, 4]] },
  desc: 'A kettle grill with old charcoal inside. It still smells of a summer that ended.',
  tags: [...T, 'grill', 'park'],
  model: (mb) => {
    // legs, wheels, ash pan
    const legs: [number, number][] = [[0, 0.3], [-0.26, -0.15], [0.26, -0.15]];
    for (const [x, z] of legs) rod(mb, x * 0.45, 0.58, z * 0.45, x, 0.03, z, 0.016, 5, 'metal_dark');
    for (const [x, z] of legs.slice(1)) mb.cylinderX(x, 0.06, z, 0.06, 0.03, 8, 'rubber_black');
    mb.cylinderX(0, 0.06, -0.15, 0.012, 0.52, 4, 'metal_dark');
    discY(mb, 0, 0.24, 0.02, 0.17, 8, 'metal_dark');
    // bowl + lid
    mb.cylinder(0, 0.52, 0, 0.12, 0.08, 10, 'q_grill_enamel', { rTop: 0.22 });
    mb.cylinder(0, 0.6, 0, 0.22, 0.18, 10, 'q_grill_enamel', { rTop: 0.28, caps: false });
    mb.cylinder(0, 0.78, 0, 0.285, 0.02, 12, 'metal_dark');
    mb.cylinder(0, 0.8, 0, 0.28, 0.12, 12, 'q_grill_enamel', { rTop: 0.23, caps: false });
    mb.cylinder(0, 0.92, 0, 0.23, 0.06, 12, 'q_grill_enamel', { rTop: 0.12 });
    discY(mb, 0.08, 0.981, -0.04, 0.05, 6, 'metal_grey');
    // lid handle
    for (const x of [-0.07, 0.07]) mb.box(x, 0.98, 0, 0.02, 0.05, 0.02, 'metal_grey');
    mb.box(0, 1.02, 0, 0.18, 0.035, 0.04, 'wood_dark');
    for (const s of [-1, 1]) mb.box(s * 0.3, 0.72, 0, 0.04, 0.025, 0.12, 'wood_dark');
  },
});

defObj({
  key: 'trash_can_outdoor', name: 'Park Trash Can', w: 1, d: 1, height: 1.0, block: 'solid',
  container: { capacity: 25, kind: 'trash', loot: 'trash' },
  sound: 'metal',
  desc: 'A slatted bin with a black liner. Something inside is still in its wrapper.',
  tags: [...T, 'trash', 'park'],
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.3, 0.86, 12, { sides: 'q_trashcan_slats', top: 'q_void' }, { fit: true });
    mb.cylinder(0, 0.86, 0, 0.31, 0.04, 12, 'q_iron_green', { caps: false });
    mb.cylinder(0, 0.84, 0, 0.305, 0.06, 12, 'q_trashbag', { caps: false });
    mb.cylinder(0, 0.9, 0, 0.3, 0.1, 12, 'q_iron_green', { rTop: 0.2, caps: false });
    discY(mb, 0, 1.0, 0, 0.2, 12, 'q_void');
  },
});

defObj({
  key: 'bus_stop', name: 'Bus Shelter', w: 3, d: 1, height: 2.55, block: 'solid', sit: true, tall: true,
  power: true, sound: 'metal',
  light: { color: 0xe6f0ff, intensity: 0.45, radius: 4, y: 1.95, kind: 'fluoro', power: true },
  desc: 'A lit bus shelter. The timetable lists every bus as "--:--". The bench is still warm.',
  tags: [...T, 'street', 'sit'],
  model: (mb) => {
    const F = 'q_steel_grey';
    // frame
    for (const x of [-1.45, -0.5, 0.5, 1.45]) mb.box(x, 0, -0.42, 0.06, 2.06, 0.06, F, { skip: ['bottom'] });
    for (const x of [-1.45, 1.45]) mb.box(x, 0, 0.36, 0.06, 2.02, 0.06, F, { skip: ['bottom'] });
    mb.box(0, 0.12, -0.42, 2.84, 1.85, 0.025, 'q_shelter_glass');
    mb.box(-1.45, 0.12, -0.03, 0.025, 1.85, 0.72, 'q_shelter_glass');
    mb.box(-1.43, 0.5, -0.03, 0.012, 1.25, 0.75, { east: 'q_poster_liminal', sides: 'q_steel_grey' }, { fit: { east: true } });
    // roof (sloping forward) + fascia + light tube
    mb.push(); mb.translate(0, 2.06, -0.03); mb.rotateX(0.06);
    mb.box(0, 0, 0, 3.0, 0.07, 0.98, { top: 'q_steel_dark', sides: F });
    mb.box(0, -0.06, 0.48, 3.0, 0.16, 0.02, { south: 'q_shelter_fascia', sides: F }, { fit: { south: true } });
    mb.box(0, -0.03, -0.1, 1.6, 0.03, 0.05, 'q_tube_light', { emissive: 1.4 });
    mb.pop();
    // bench
    for (const x of [-0.9, 0, 0.9]) mb.box(x, 0, -0.26, 0.05, 0.44, 0.3, F);
    mb.box(0, 0.44, -0.24, 2.1, 0.04, 0.34, { top: 'q_park_slat', sides: F });
    // timetable + sign pole
    mb.box(0.95, 1.05, -0.4, 0.32, 0.45, 0.012, 'q_bus_schedule', { fit: true });
    mb.cylinder(1.38, 0, 0.42, 0.03, 2.5, 6, 'q_pole_galv', { caps: false });
    mb.box(1.38, 2.0, 0.42, 0.36, 0.45, 0.02, { south: 'q_bus_sign', north: 'q_bus_sign', sides: F }, { fit: { south: true, north: true } });
    // litter
    mb.box(-0.3, 0.003, 0.15, 0.12, 0.004, 0.08, 'paper');
    mb.cylinder(0.6, 0.0, 0.2, 0.03, 0.1, 6, 'plastic_red', { color: 0xffd0d0 });
  },
});

defObj({
  key: 'phone_booth', name: 'Phone Booth', w: 1, d: 1, height: 2.45, block: 'solid', tall: true,
  power: true, sound: 'glass',
  light: { color: 0xdff0ff, intensity: 0.45, radius: 3.5, y: 2.0, kind: 'fluoro', power: true },
  desc: 'The receiver is off the hook. Through it, very faintly, someone is breathing.',
  tags: [...T, 'street', 'phone', 'light'],
  model: (mb) => {
    const F = 'q_steel_blue';
    mb.box(0, 0, 0, 0.98, 0.08, 0.98, 'concrete', { skip: ['bottom'] });
    for (const x of [-0.44, 0.44]) for (const z of [-0.44, 0.44]) mb.box(x, 0.08, z, 0.06, 2.0, 0.06, F, { skip: ['bottom'] });
    // kick panels + glass on back and sides
    mb.box(0, 0.08, -0.44, 0.84, 0.42, 0.03, F);
    mb.box(0, 0.5, -0.44, 0.84, 1.5, 0.02, 'q_shelter_glass');
    for (const s of [-1, 1]) {
      mb.box(s * 0.44, 0.08, 0, 0.03, 0.42, 0.84, F);
      mb.box(s * 0.44, 0.5, 0, 0.02, 1.5, 0.84, 'q_shelter_glass');
      mb.box(s * 0.44, 1.2, 0, 0.035, 0.04, 0.84, F);
    }
    // bi-fold door folded open against the front-left post
    mb.push(); mb.translate(-0.44, 0.08, 0.44); mb.rotateY(-1.45);
    mb.box(0.2, 0, 0, 0.4, 1.95, 0.03, { sides: 'q_shelter_glass', top: F });
    mb.box(0.2, 0, 0, 0.42, 0.4, 0.04, F);
    mb.pop();
    // roof + lit sign band
    mb.box(0, 2.08, 0, 1.0, 0.22, 1.0, { sides: 'q_phone_sign', top: F }, { fit: { south: true, north: true, east: true, west: true }, emissive: 0.9 });
    mb.box(0, 2.3, 0, 1.04, 0.06, 1.04, { sides: F, top: 'q_steel_dark' });
    mb.box(0, 2.04, 0, 0.5, 0.04, 0.12, 'q_tube_light', { emissive: 1.3 });
    // payphone on the west inner wall (seen through the open front), handset off the hook
    mb.box(-0.37, 1.0, -0.05, 0.1, 0.42, 0.26, { east: 'q_payphone', sides: 'metal_brushed', top: 'metal_brushed' }, { fit: { east: true } });
    mb.push(); mb.translate(-0.3, 0.72, 0.12); mb.rotateX(0.2);
    mb.box(0, 0, 0, 0.05, 0.2, 0.05, 'plastic_black');
    mb.pop();
    rod(mb, -0.33, 1.05, 0.08, -0.3, 0.84, 0.13, 0.006, 4, 'metal_grey');
    mb.box(-0.3, 0.62, -0.05, 0.22, 0.03, 0.4, 'metal_brushed');
    mb.box(-0.3, 0.65, -0.1, 0.17, 0.05, 0.24, 'paper', { color: 0xf0e070 });
  },
});

defObj({
  key: 'newspaper_box', name: 'Newspaper Box', w: 1, d: 1, height: 1.05, block: 'solid',
  sound: 'metal',
  desc: "Today's paper. It is always today's paper. The photo is of this street.",
  tags: [...T, 'street'],
  model: (mb) => {
    for (const x of [-0.18, 0.18]) mb.box(x, 0, -0.05, 0.05, 0.4, 0.3, 'metal_dark', { skip: ['bottom'] });
    mb.box(0, 0.38, -0.05, 0.5, 0.58, 0.42, { south: 'q_newsbox_front', sides: 'q_paint_yellow', top: 'q_paint_yellow' }, { fit: { south: true } });
    mb.wedge(0, 0.96, -0.05, 0.52, 0.44, 0.08, 0.02, 'q_paint_yellow');
    mb.box(0.12, 0.84, 0.17, 0.14, 0.1, 0.03, 'metal_brushed');
    mb.box(0, 0.42, 0.17, 0.3, 0.03, 0.02, 'metal_grey');
  },
});

// ---------------------------------------------------------------------------
// objects — nature
// ---------------------------------------------------------------------------
function leafBox(mb: ModelBuilder, x: number, y: number, z: number, s: number, h: number, tex: string, sway = 0.6, rot = 0) {
  mb.push(); mb.translate(x, y, z); if (rot) mb.rotateY(rot);
  mb.box(0, 0, 0, s, h, s, tex, { fit: true, sway });
  mb.pop();
}

defObj({
  key: 'tree_oak', name: 'Oak Tree', w: 1, d: 1, height: 4.6, block: 'solid', foliage: true, tall: true,
  sound: 'wood', flammable: 0.4, hp: 3000,
  desc: 'A broad oak. Its leaves rustle in a wind that is not blowing.',
  tags: [...T, 'tree', 'nature'],
  model: (mb) => {
    // roots + trunk
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2 + 0.4;
      mb.push(); mb.translate(Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2); mb.rotateY(-a); mb.rotateZ(0.5);
      mb.box(0, -0.05, 0, 0.14, 0.32, 0.12, 'q_bark');
      mb.pop();
    }
    mb.cylinder(0, 0, 0, 0.22, 2.1, 7, 'q_bark', { rTop: 0.14, caps: false });
    rod(mb, 0, 1.6, 0, 0.75, 2.5, 0.35, 0.07, 5, 'q_bark');
    rod(mb, 0, 1.8, 0, -0.6, 2.7, -0.4, 0.07, 5, 'q_bark');
    rod(mb, 0, 2.0, 0, 0.1, 3.1, -0.3, 0.06, 5, 'q_bark');
    mb.box(0.12, 1.1, 0.16, 0.08, 0.1, 0.03, 'q_void');
    // canopy: overlapping leaf clumps
    leafBox(mb, 0.0, 2.25, 0.05, 1.9, 1.3, 'q_leaf_oak', 0.5, 0.2);
    leafBox(mb, 0.7, 2.1, 0.35, 1.3, 1.1, 'q_leaf_oak_b', 0.6, 0.6);
    leafBox(mb, -0.65, 2.3, -0.35, 1.35, 1.1, 'q_leaf_oak_b', 0.6, -0.4);
    leafBox(mb, -0.3, 2.15, 0.55, 1.1, 0.9, 'q_leaf_oak', 0.7, 0.9);
    leafBox(mb, 0.15, 3.05, -0.1, 1.4, 1.05, 'q_leaf_oak', 0.8, 0.5);
    leafBox(mb, 0.5, 2.9, -0.45, 0.9, 0.8, 'q_leaf_oak_b', 0.9, 1.1);
  },
});

defObj({
  key: 'tree_pine', name: 'Pine Tree', w: 1, d: 1, height: 4.9, block: 'solid', foliage: true, tall: true,
  sound: 'wood', flammable: 0.6, hp: 3000,
  desc: 'A dark pine. The needles underneath are dry and perfectly arranged.',
  tags: [...T, 'tree', 'nature'],
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.15, 1.5, 6, 'q_bark', { rTop: 0.08, caps: false });
    const tiers: [number, number, number][] = [[0.65, 1.1, 1.45], [1.35, 0.92, 1.35], [2.05, 0.74, 1.25], [2.75, 0.55, 1.15], [3.45, 0.36, 1.05], [4.1, 0.2, 0.8]];
    tiers.forEach(([y, r, h], i) => mb.cylinder(0, y, 0, r, h, 8, 'q_leaf_pine', { rTop: 0.02, fit: true, caps: false, sway: 0.25 + i * 0.12 }));
  },
});

defObj({
  key: 'tree_dead', name: 'Dead Tree', w: 1, d: 1, height: 4.2, block: 'solid', foliage: true, tall: true,
  sound: 'wood', flammable: 0.9, hp: 1800,
  desc: 'A bare grey tree. A faded red ribbon is tied to one branch.',
  tags: [...T, 'tree', 'nature'],
  model: (mb) => {
    mb.push(); mb.rotateZ(0.06);
    mb.cylinder(0, 0, 0, 0.19, 2.7, 6, 'q_bark_grey', { rTop: 0.09, caps: false });
    mb.box(-0.1, 1.2, 0.12, 0.08, 0.14, 0.06, 'q_void');
    const br: [number, number, number, number, number, number][] = [
      [0, 1.4, 0, 0.8, 2.3, 0.3], [0, 1.7, 0, -0.7, 2.6, -0.2], [0, 2.1, 0, 0.3, 3.2, -0.5], [0, 2.4, 0, -0.35, 3.5, 0.4],
      [0.8, 2.3, 0.3, 1.1, 2.9, 0.1], [-0.7, 2.6, -0.2, -1.0, 3.0, -0.5], [0, 2.6, 0, 0.1, 3.8, 0.05],
    ];
    for (const [a, b, c, d, e, f] of br) rod(mb, a, b, c, d, e, f, b < 2 ? 0.055 : 0.035, 4, 'q_bark_grey');
    for (const [, , , d, e, f] of br) mb.cross(d, e - 0.4, f, 0.9, 0.9, 'q_twigs', { sway: 0.4, rot: d * 2 });
    // ribbon
    mb.box(0.55, 1.95, 0.2, 0.03, 0.3, 0.02, 'fabric_red', { sway: 0.5 });
    mb.pop();
  },
});

defObj({
  key: 'bush', name: 'Bush', w: 1, d: 1, height: 0.95, block: 'low', foliage: true,
  sound: 'wood', flammable: 0.6,
  desc: 'A dense shrub dotted with tiny pale flowers.',
  tags: [...T, 'nature', 'plant'],
  model: (mb) => {
    leafBox(mb, 0, 0.0, 0, 0.9, 0.7, 'q_bush', 0.3, 0.3);
    leafBox(mb, 0.18, 0.3, 0.12, 0.7, 0.62, 'q_bush', 0.5, 0.9);
    leafBox(mb, -0.2, 0.25, -0.1, 0.6, 0.55, 'q_leaf_oak_b', 0.5, -0.5);
  },
});

defObj({
  key: 'grass_tall', name: 'Tall Grass', w: 1, d: 1, height: 0.6, block: 'none', foliage: true,
  sound: 'fabric', flammable: 0.9,
  desc: 'Knee-high grass that whispers when you walk through it.',
  tags: [...T, 'nature', 'plant'],
  model: (mb) => {
    mb.cross(-0.15, 0, -0.1, 0.8, 0.55, 'q_grass_tall', { sway: 1, rot: 0.3 });
    mb.cross(0.2, 0, 0.15, 0.7, 0.48, 'q_grass_tall', { sway: 1, rot: 1.1 });
    mb.cross(-0.1, 0, 0.25, 0.6, 0.42, 'q_grass_tall', { sway: 1, rot: 2.0 });
  },
});

defObj({
  key: 'flowers', name: 'Wildflowers', w: 1, d: 1, height: 0.45, block: 'none', foliage: true,
  sound: 'fabric', flammable: 0.7,
  desc: 'Pastel wildflowers, too bright for the light here.',
  tags: [...T, 'nature', 'plant', 'dream'],
  model: (mb) => {
    mb.cross(0, 0, 0, 0.85, 0.45, 'q_flowers', { sway: 0.8, rot: 0.5 });
    mb.cross(0.2, 0, -0.18, 0.7, 0.4, 'q_flowers', { sway: 0.8, rot: 1.4 });
    mb.cross(-0.18, 0, 0.18, 0.7, 0.38, 'q_flowers', { sway: 0.8, rot: 2.6 });
    mb.cross(-0.1, 0, -0.2, 0.6, 0.3, 'q_grass_tall', { sway: 1, rot: 2.3 });
  },
});

defObj({
  key: 'rock', name: 'Rock', w: 1, d: 1, height: 0.4, block: 'low',
  sound: 'ceramic',
  desc: 'A lichen-spotted rock.',
  tags: [...T, 'nature'],
  model: (mb) => {
    rockBlob(mb, 0, 0, 0, 0.36, 0.38, 0.3, 11, 'q_rock', 7, 4);
    rockBlob(mb, 0.3, 0, 0.28, 0.12, 0.1, 0.1, 12, 'q_rock', 5, 3);
  },
});

defObj({
  key: 'rock_large', name: 'Boulder', w: 2, d: 2, height: 1.3, block: 'solid', blocksSight: true,
  sound: 'ceramic', hp: 99999,
  desc: 'A boulder dropped here by something that is not a glacier.',
  tags: [...T, 'nature'],
  model: (mb) => {
    rockBlob(mb, -0.1, 0, -0.05, 0.85, 1.28, 0.72, 21, 'q_rock', 9, 5, { jit: 0.22 });
    rockBlob(mb, 0.62, 0, 0.55, 0.38, 0.5, 0.32, 22, 'q_rock_dark', 7, 4);
    rockBlob(mb, -0.7, 0, 0.62, 0.16, 0.14, 0.14, 23, 'q_rock', 5, 3);
  },
});

defObj({
  key: 'log', name: 'Fallen Log', w: 1, d: 1, height: 0.38, block: 'low', sit: true,
  sound: 'wood', flammable: 0.8,
  disassemble: { tools: ['#saw'], time: 30, skill: 'carpentry', yields: [['plank', 1, 3]] },
  desc: 'A mossy fallen log, good for sitting by a fire.',
  tags: [...T, 'nature', 'sit'],
  model: (mb) => {
    mb.push(); mb.rotateY(0.25);
    mb.cylinderX(0, 0.18, 0, 0.18, 0.92, 7, 'q_bark', { caps: false });
    mb.push(); mb.translate(0.46, 0.18, 0); mb.rotateY(Math.PI / 2); disc(mb, 0, 0, 0, 0.18, 7, 'q_log_end'); mb.pop();
    mb.push(); mb.translate(-0.46, 0.18, 0); mb.rotateY(-Math.PI / 2); disc(mb, 0, 0, 0, 0.18, 7, 'q_log_end'); mb.pop();
    rod(mb, 0.15, 0.3, 0.05, 0.3, 0.42, 0.18, 0.035, 4, 'q_bark');
    mb.pop();
  },
});

defObj({
  key: 'stump', name: 'Tree Stump', w: 1, d: 1, height: 0.45, block: 'low', sit: true,
  sound: 'wood', flammable: 0.7,
  desc: 'A sawn stump with an axe left in it, mid-swing.',
  tags: [...T, 'nature', 'sit'],
  model: (mb) => {
    for (let k = 0; k < 5; k++) {
      const a = k * Math.PI * 2 / 5 + 0.3;
      mb.push(); mb.translate(Math.cos(a) * 0.22, 0, Math.sin(a) * 0.22); mb.rotateY(-a); mb.rotateZ(0.7);
      mb.box(0, -0.06, 0, 0.12, 0.22, 0.1, 'q_bark');
      mb.pop();
    }
    mb.cylinder(0, 0, 0, 0.27, 0.42, 8, 'q_bark', { rTop: 0.25, caps: false });
    discY(mb, 0, 0.42, 0, 0.25, 8, 'q_log_end');
    // axe
    mb.push(); mb.translate(0.05, 0.43, 0.02); mb.rotateZ(-0.5);
    mb.box(0, 0, 0, 0.03, 0.42, 0.035, 'wood_light');
    mb.pop();
    mb.box(0.02, 0.38, 0.02, 0.16, 0.07, 0.02, 'metal_grey');
  },
});

defObj({
  key: 'power_pole', name: 'Power Pole', w: 1, d: 1, height: 5.3, block: 'solid', tall: true,
  sound: 'wood', flammable: 0.5, hp: 2500,
  desc: 'A utility pole. Its wires run out a few metres away and simply stop.',
  tags: [...T, 'street', 'electrical'],
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.13, 5.25, 8, 'q_pole_wood', { rTop: 0.1 });
    mb.box(0, 4.75, 0, 1.6, 0.1, 0.1, 'q_pole_wood');
    for (const s of [-1, 1]) rod(mb, 0, 4.35, 0.06, s * 0.5, 4.75, 0.06, 0.02, 4, 'metal_dark');
    for (const x of [-0.7, -0.25, 0.7]) {
      mb.cylinder(x, 4.85, 0, 0.035, 0.05, 6, 'metal_dark');
      mb.cylinder(x, 4.9, 0, 0.05, 0.1, 7, 'glass', { color: 0x6ad0a0, emissive: 0.15 });
      // dangling cut wires
      rod(mb, x, 4.95, 0, x + 0.05, 4.4, 0.5, 0.008, 4, 'plastic_black');
      rod(mb, x + 0.05, 4.4, 0.5, x + 0.02, 4.0, 0.62, 0.008, 4, 'plastic_black');
    }
    // transformer can
    mb.box(0, 3.95, 0.15, 0.06, 0.25, 0.1, 'metal_dark');
    mb.cylinder(0, 3.8, 0.33, 0.19, 0.55, 8, 'q_steel_grey');
    mb.cylinder(0, 4.35, 0.33, 0.2, 0.04, 8, 'metal_dark');
    for (const x of [-0.07, 0.07]) mb.cylinder(x, 4.39, 0.33, 0.025, 0.1, 5, 'porcelain', { color: 0x9a6a50 });
    // steps + flyers + tag
    for (let y = 2.3; y < 4.4; y += 0.4) { const s = Math.round(y / 0.4) % 2 ? 1 : -1; mb.box(s * 0.17, y, 0, 0.12, 0.025, 0.025, 'metal_grey'); }
    flyer(mb, 0, 1.4, 0.135);
    flyer(mb, 0.135, 1.75, 0, false);
    mb.box(0, 2.0, 0.13, 0.08, 0.05, 0.005, 'metal_brushed');
  },
});

defObj({
  key: 'satellite_dish', name: 'Satellite Dish', w: 1, d: 1, height: 1.6, block: 'solid',
  sound: 'metal',
  disassemble: { tools: ['#wrench'], time: 20, skill: 'electrical', yields: [['scrap_metal', 2, 4], ['wire', 1, 3], ['electronics_scrap', 1, 2]] },
  desc: 'A dish aimed at a patch of sky where there are no stars.',
  tags: [...T, 'electrical', 'antenna'],
  model: (mb) => {
    mb.box(0, 0, -0.1, 0.5, 0.06, 0.5, 'concrete');
    mb.cylinder(0, 0.06, -0.1, 0.045, 0.95, 8, 'metal_grey', { caps: false });
    mb.box(0, 0.95, -0.1, 0.1, 0.12, 0.1, 'metal_dark');
    mb.push(); mb.translate(0, 1.05, -0.05); mb.rotateX(0.85);
    mb.cylinder(0, 0, 0, 0.1, 0.16, 12, 'q_dish', { rTop: 0.5, caps: false });
    discY(mb, 0, 0.158, 0, 0.5, 12, 'q_dish_face');
    rod(mb, 0, 0.1, 0.38, 0, 0.55, 0.0, 0.015, 4, 'metal_grey');
    mb.box(0, 0.5, 0, 0.07, 0.1, 0.07, 'plastic_black');
    mb.pop();
    rod(mb, 0.03, 0.1, -0.08, 0.06, 0.95, -0.08, 0.007, 4, 'plastic_black');
  },
});

defObj({
  key: 'hay_bale', name: 'Hay Bale', w: 1, d: 1, height: 0.48, block: 'low', sit: true,
  sound: 'fabric', flammable: 1.0, movable: 25,
  desc: 'A tight hay bale that smells of a field you have never been to.',
  tags: [...T, 'farm', 'sit'],
  model: (mb) => {
    mb.push(); mb.rotateY(0.12);
    mb.box(0, 0, 0, 0.95, 0.45, 0.5, 'q_hay');
    for (const x of [-0.25, 0.25]) mb.box(x, -0.003, 0, 0.025, 0.462, 0.512, 'fabric_brown', { color: 0xd8b880 });
    mb.box(0.5, 0.12, 0.05, 0.06, 0.12, 0.2, 'q_straw');
    mb.pop();
  },
});

defObj({
  key: 'scarecrow', name: 'Scarecrow', w: 1, d: 1, height: 1.95, block: 'solid', tall: true,
  sound: 'fabric', flammable: 1.0,
  desc: 'A stitched grin and button-less eyes. It was facing the other way a moment ago.',
  tags: [...T, 'farm', 'creepy'],
  model: (mb) => {
    mb.box(0, 0, -0.02, 0.07, 1.62, 0.07, 'q_pallet_wood', { color: 0x9a8070 });
    mb.box(0, 1.32, -0.02, 1.3, 0.06, 0.06, 'q_pallet_wood', { color: 0x9a8070 });
    // shirt + sleeves + straw cuffs
    mb.box(0, 0.88, 0, 0.42, 0.56, 0.22, 'q_plaid');
    for (const s of [-1, 1]) {
      mb.box(s * 0.42, 1.24, 0, 0.44, 0.17, 0.17, 'q_plaid');
      mb.box(s * 0.67, 1.22, 0, 0.08, 0.2, 0.14, 'q_straw');
    }
    // dangling trousers
    for (const s of [-1, 1]) mb.box(s * 0.1, 0.38, 0.02, 0.15, 0.52, 0.15, 'fabric_blue', { color: 0xc8c0b0 });
    for (const s of [-1, 1]) mb.box(s * 0.1, 0.32, 0.02, 0.1, 0.07, 0.1, 'q_straw');
    // tilted burlap head + hat
    mb.push(); mb.translate(0, 1.44, 0); mb.rotateZ(0.22); mb.rotateY(-0.25);
    mb.box(0, 0, 0, 0.27, 0.3, 0.25, { south: 'q_burlap_face', sides: 'q_burlap', top: 'q_burlap' }, { fit: { south: true } });
    mb.box(0, -0.02, 0, 0.18, 0.04, 0.18, 'fabric_brown');
    mb.cylinder(0, 0.29, 0, 0.27, 0.02, 10, 'q_straw');
    mb.cylinder(0, 0.31, 0, 0.14, 0.13, 8, 'q_straw', { rTop: 0.12 });
    mb.pop();
    // a crow on the arm
    mb.box(0.52, 1.38, 0.0, 0.14, 0.08, 0.07, 'plastic_black');
    mb.box(0.6, 1.44, 0.0, 0.06, 0.06, 0.06, 'plastic_black');
    mb.box(0.645, 1.45, 0.0, 0.03, 0.015, 0.015, 'plastic_yellow');
  },
});

defObj({
  key: 'billboard', name: 'Billboard', w: 4, d: 1, height: 4.9, block: 'solid', tall: true,
  power: true, sound: 'metal', hp: 2500,
  light: { color: 0xfff0d0, intensity: 0.75, radius: 6, y: 4.5, kind: 'lamp', power: true },
  desc: 'HAVE YOU TRIED WAKING UP? The fine print is in a language you almost know.',
  tags: [...T, 'street', 'decor', 'dream'],
  model: (mb) => {
    const S = 'q_steel_dark';
    // I-beam posts stand behind the panel (panel back face is at z = -0.1)
    for (const x of [-1.2, 1.2]) {
      mb.box(x, 0, -0.24, 0.08, 4.5, 0.2, S, { skip: ['bottom'] });
      mb.box(x, 0, -0.24, 0.2, 4.5, 0.03, S, { skip: ['bottom'] });
      mb.box(x, 0, -0.24, 0.36, 0.08, 0.36, 'concrete');
    }
    for (const x of [-1.2, 1.2]) mb.box(x, 2.38, 0.0, 0.06, 0.06, 0.48, S);
    // catwalk
    mb.box(0, 2.4, 0.22, 3.9, 0.04, 0.4, 'q_catwalk');
    for (const x of [-1.9, -0.95, 0, 0.95, 1.9]) rod(mb, x, 2.44, 0.4, x, 2.95, 0.4, 0.012, 4, S);
    rod(mb, -1.95, 2.95, 0.4, 1.95, 2.95, 0.4, 0.014, 4, S);
    // panel
    mb.box(0, 2.5, -0.05, 4.0, 2.0, 0.1, { south: 'q_billboard_ad', north: 'q_billboard_back', sides: S, top: S }, { fit: { south: true } });
    mb.box(0, 4.5, -0.05, 4.06, 0.05, 0.14, S);
    mb.box(0, 2.46, -0.05, 4.06, 0.05, 0.14, S);
    // gooseneck lamps
    for (const x of [-1.3, 0, 1.3]) {
      rod(mb, x, 4.5, -0.02, x, 4.68, 0.34, 0.018, 4, S);
      mb.push(); mb.translate(x, 4.66, 0.42); mb.rotateX(0.7);
      mb.box(0, 0, 0, 0.26, 0.08, 0.16, { sides: 'q_lamp_head', top: 'q_lamp_head', bottom: 'q_sodium_lens' }, { fit: { bottom: true }, emissive: 0 });
      mb.box(0, -0.012, 0, 0.22, 0.012, 0.13, 'q_sodium_lens', { fit: true, emissive: 1.5, color: 0xfff6e8 });
      mb.pop();
    }
  },
});

defObj({
  key: 'birdbath', name: 'Birdbath', w: 1, d: 1, height: 0.82, block: 'low',
  sound: 'ceramic',
  desc: 'A stone birdbath. The water reflects a sky that is a different colour.',
  tags: [...T, 'garden', 'birdbath'],
  model: (mb) => {
    const C = 'q_rock';
    mb.cylinder(0, 0, 0, 0.2, 0.07, 8, C, { color: 0xd8d4c8 });
    mb.cylinder(0, 0.07, 0, 0.09, 0.5, 8, C, { rTop: 0.07, color: 0xd8d4c8 });
    mb.cylinder(0, 0.57, 0, 0.08, 0.14, 10, C, { rTop: 0.33, color: 0xd8d4c8, caps: false });
    mb.cylinder(0, 0.71, 0, 0.34, 0.05, 10, C, { color: 0xd0ccc0, caps: false });
    discY(mb, 0, 0.74, 0, 0.3, 10, 'water', { color: 0xf4c8e0, emissive: 0.2 });
    // tiny bird on the rim
    mb.box(0.25, 0.76, 0.12, 0.07, 0.05, 0.04, 'fabric_brown');
    mb.box(0.29, 0.79, 0.12, 0.035, 0.035, 0.035, 'fabric_brown');
  },
});

defObj({
  key: 'garden_gnome', name: 'Garden Gnome', w: 1, d: 1, height: 0.42, block: 'none',
  movable: 3, sound: 'ceramic',
  desc: 'A gnome with a chipped smile. Wherever you stand, it is facing you.',
  tags: [...T, 'garden', 'creepy'],
  model: (mb) => {
    mb.push(); mb.rotateY(0.45);
    for (const x of [-0.035, 0.035]) mb.box(x, 0, 0.02, 0.05, 0.04, 0.08, 'q_paint_red', { color: 0x8a5a3a });
    mb.cylinder(0, 0.04, 0, 0.075, 0.15, 8, 'q_paint_blue', { rTop: 0.06 });
    mb.cylinder(0, 0.12, 0, 0.077, 0.02, 8, 'plastic_black');
    mb.box(0, 0.12, 0.045, 0.1, 0.1, 0.05, 'q_paint_white');
    mb.box(0, 0.2, 0.02, 0.09, 0.07, 0.08, 'q_paint_pink', { color: 0xffe0d0 });
    mb.box(0, 0.21, 0.065, 0.025, 0.025, 0.02, 'q_paint_pink');
    for (const x of [-0.022, 0.022]) mb.box(x, 0.235, 0.061, 0.012, 0.012, 0.005, 'plastic_black');
    mb.cylinder(0, 0.265, 0.01, 0.07, 0.17, 7, 'q_paint_red', { rTop: 0.008 });
    mb.pop();
  },
});

defObj({
  key: 'sprinkler', name: 'Lawn Sprinkler', w: 1, d: 1, height: 0.12, block: 'none',
  movable: 2, sound: 'plastic',
  desc: 'An oscillating sprinkler and a coiled hose. It ticks, though no water runs.',
  tags: [...T, 'garden'],
  model: (mb) => {
    torus(mb, -0.2, 0.02, -0.15, 0.17, 0.02, 12, 4, 'q_hose');
    torus(mb, -0.2, 0.055, -0.15, 0.15, 0.02, 12, 4, 'q_hose');
    rod(mb, -0.05, 0.02, -0.1, 0.18, 0.02, 0.12, 0.018, 5, 'q_hose');
    mb.box(0.24, 0, 0.14, 0.34, 0.04, 0.1, 'plastic_yellow');
    for (const x of [0.09, 0.39]) mb.box(x, 0.04, 0.14, 0.03, 0.05, 0.03, 'plastic_yellow');
    // arc of the spray tube
    const N = 6;
    for (let i = 0; i < N; i++) {
      const a0 = Math.PI * i / N, a1 = Math.PI * (i + 1) / N;
      rod(mb, 0.24 - Math.cos(a0) * 0.15, 0.08 + Math.sin(a0) * 0.06, 0.14, 0.24 - Math.cos(a1) * 0.15, 0.08 + Math.sin(a1) * 0.06, 0.14, 0.012, 4, 'metal_brushed');
    }
  },
});

defObj({
  key: 'mailbox_house', name: 'House Mailbox', w: 1, d: 1, height: 1.3, block: 'low',
  container: { capacity: 8, kind: 'mailbox', loot: 'mailbox' },
  sound: 'metal',
  desc: 'Number 404. The little red flag is up. There is always mail.',
  tags: [...T, 'street', 'mail', 'suburb'],
  model: (mb) => {
    mb.box(0, 0, -0.05, 0.09, 1.02, 0.09, 'q_pallet_wood', { color: 0xe8e4dc });
    mb.box(0, 1.0, 0.02, 0.16, 0.03, 0.42, 'q_pallet_wood', { color: 0xe8e4dc });
    mb.box(0, 1.03, 0.04, 0.2, 0.12, 0.48, { sides: 'q_steel_dark', top: 'q_steel_dark' });
    mb.cylinderZ(0, 1.15, 0.04, 0.1, 0.48, 8, 'q_steel_dark');
    mb.box(0.101, 1.06, 0.04, 0.005, 0.07, 0.2, { east: 'q_house_number', sides: 'q_steel_dark' }, { fit: { east: true } });
    mb.box(-0.101, 1.06, 0.04, 0.005, 0.07, 0.2, { west: 'q_house_number', sides: 'q_steel_dark' }, { fit: { west: true } });
    mb.box(0, 1.12, 0.29, 0.04, 0.03, 0.02, 'metal_grey');
    // flag up
    mb.box(0.115, 1.05, -0.05, 0.015, 0.22, 0.025, 'plastic_red');
    mb.box(0.115, 1.22, -0.1, 0.015, 0.06, 0.09, 'plastic_red');
  },
});
