// Props for the debt contract (src/game/debt): the Remittance Press (the
// object key stays 'hopper' so saves and zones keep working: a four-column
// hydraulic press over a loading plate, one in every zone), the depot's
// passage kiosk and the three transports the kiosk sells. The press's moving
// parts (ram, piston rods, lever, gauge needle, beacon, the seam shimmer) are
// overlays drawn by src/game/debt/hopper.ts; everything static is here.
//
// The press also places itself: a post-generation hook (src/game/debt/
// hopperPlace.ts) drops one into every zone that does not already have one.
import { defObj } from '../../world/objects';
import { atlas, addTextureModule, makeRamp, mixHex, scaleHex, ph, tileFbm, txt, txtC, txtW, fillR, plate, screw, scribble, crtGlass, type ModelBuilder } from './a_lib';
import { installHopperPlacement } from '../../game/debt/hopperPlace';

const T = ['contract', 'zd'];
const HAZ_Y = 0xe2b21e, HAZ_K = 0x1c1a16;

/** diagonal hazard stripes over a rect (period p, 45 degrees) */
function hazard(pc: any, x0: number, y0: number, w: number, h: number, p = 8, wear = 0.15, seed = 1) {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const on = (((x0 + x) + (y0 + y)) % p) < p / 2;
    let c = on ? HAZ_Y : HAZ_K;
    const n = ph((x0 + x) >> 1, (y0 + y) >> 1, seed);
    if (n < wear) c = on ? scaleHex(HAZ_Y, 0.72) : 0x3a3530;
    else if (n > 0.93) c = on ? mixHex(HAZ_Y, 0xfff2b8, 0.5) : 0x2a2622;
    pc.set(x0 + x, y0 + y, c);
  }
}

addTextureModule(() => {
  const A = atlas();

  // ---- the hopper plate (2 x 2 m at 32 px/m): hazard border, tread plate, the grate trapdoor
  A.add('zd_hopper_plate', 64, 64, (pc, rng) => {
    pc.wrap = false;
    const S = makeRamp(0x6e7378, 6, { spread: 0.45 });
    // diamond tread steel
    fillR(pc, 0, 0, 64, 64, S, (x, y) => 0.42 + (tileFbm(x, y, 64, 64, 6, 2, 801) - 0.5) * 0.45, 0.8);
    for (let y = 0; y < 64; y += 4) for (let x = (y / 4) % 2 ? 2 : 0; x < 64; x += 4) { pc.set(x, y, S[4]); pc.set(x + 1, y + 1, S[1]); }
    // rust creeping in from the seams and a ring of scuffing where things get dragged on
    for (let i = 0; i < 260; i++) { const x = rng.int(0, 63), y = rng.int(0, 63); const d = Math.hypot(x - 32, y - 32); if (d > 18 && d < 30 && rng.chance(0.5)) pc.blend(x, y, 0x8a5a32, 0.35); }
    // hazard border
    hazard(pc, 0, 0, 64, 6, 8, 0.12, 802); hazard(pc, 0, 58, 64, 6, 8, 0.12, 803);
    hazard(pc, 0, 6, 6, 52, 8, 0.12, 804); hazard(pc, 58, 6, 6, 52, 8, 0.12, 805);
    pc.strokeRect(6, 6, 52, 52, 0x2a2c30);
    // the seam slot: a long black slit across the middle of the bed, lips of bright worn steel,
    // a cold teal sheen where the other side leaks through, and old brown stains crusted round it
    for (let i = 0; i < 340; i++) { const x = rng.int(12, 51), y = rng.int(22, 41); if (rng.chance(0.55)) pc.blend(x, y, rng.chance(0.5) ? 0x4a1a12 : 0x5a2416, 0.28 + rng.next() * 0.25); }
    pc.rect(12, 29, 40, 6, 0x24262a);
    for (let x = 13; x < 51; x++) {
      const w = x < 16 || x > 47 ? 1 : 2;
      for (let y = 32 - w; y < 32 + w; y++) pc.set(x, y, 0x020304);
      pc.set(x, 32 - w - 1, x % 5 === 0 ? 0xb8b4a8 : 0x3a3a38);
      pc.set(x, 32 + w, x % 7 === 0 ? 0x8a8678 : 0x2a2a28);
      pc.set(x, 29, S[5]); pc.set(x, 34, S[0]);
    }
    for (const [x, y] of [[13, 30], [49, 30], [13, 33], [49, 33]] as const) screw(pc, x, y, S[5], S[0], true);
    // stencilled arrows pointing in, STAND CLEAR on the lip
    const ink = 0xd8d2bc;
    for (const [cx, cy, dx, dy] of [[32, 10, 0, 1], [32, 53, 0, -1], [10, 32, 1, 0], [53, 32, -1, 0]] as const) {
      for (let k = 0; k < 4; k++) {
        const px = cx + dx * k, py = cy + dy * k;
        if (dx === 0) { pc.hline(px - (3 - k), px + (3 - k), py, ink); } else { pc.vline(px, py - (3 - k), py + (3 - k), ink); }
      }
    }
    txtC(pc, 'STAND CLEAR', 32, 44, scaleHex(ink, 0.85));
    txtC(pc, 'PRESS', 32, 15, scaleHex(ink, 0.7));
    for (let x = 7; x < 57; x += 6) { screw(pc, x, 7, S[5], S[0]); screw(pc, x, 56, S[5], S[0]); }
  }, 2, 2);

  // the plate's edge strip
  A.add('zd_hazard', 16, 4, (pc) => { hazard(pc, 0, 0, 16, 4, 8, 0.1, 806); });

  // gantry steel: painted dark grey, chipped to bare metal, rust runs
  A.add('zd_steel', 16, 32, (pc, rng) => {
    const S = makeRamp(0x4a4e54, 5, { spread: 0.35 });
    fillR(pc, 0, 0, 16, 32, S, (x, y) => 0.5 + (tileFbm(x, y, 16, 32, 4, 2, 811) - 0.5) * 0.35, 0.8);
    for (let i = 0; i < 18; i++) { const x = rng.int(0, 15), y = rng.int(0, 31); pc.set(x, y, 0x8a8e94); pc.blend(x + 1, y, 0x8a8e94, 0.5); }
    for (let i = 0; i < 3; i++) { const x = rng.int(1, 14), y = rng.int(0, 20); for (let k = 0; k < rng.int(4, 10); k++) pc.blend(x, y + k, 0x7a4a2a, 0.45 - k * 0.03); }
  });
  // ribbed flexible duct
  A.add('zd_duct', 16, 16, (pc) => {
    const S = makeRamp(0x8a8e92, 5, { spread: 0.5 });
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) pc.set(x, y, S[[1, 3, 4, 2][y % 4]]);
  });
  // the placard bolted to the crossbar
  A.add('zd_hopper_sign', 48, 12, (pc) => {
    pc.wrap = false;
    plate(pc, 0, 0, 48, 12, 0x2a3a4a, 821, { noise: 0.08 });
    pc.rect(1, 1, 7, 10, HAZ_Y); for (let y = 1; y < 11; y += 3) pc.hline(1, 7, y, HAZ_K);
    txt(pc, 'REMITTANCE', 10, 1, 0xe8e4d8);
    txt(pc, 'HOPPER', 10, 6, 0xe8e4d8);
    txt(pc, '07', 37, 3, HAZ_Y, 1, 1);
    pc.set(46, 1, 0xb8c0c8); pc.set(46, 10, 0xb8c0c8);
  });
  // the scale dial: cream face, black ticks, red overload arc, MERIDIAN in tiny type
  A.add('zd_dial', 24, 24, (pc) => {
    pc.wrap = false;
    pc.fill(0x2a2c30);
    for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
      const d = Math.hypot(x + 0.5 - 12, y + 0.5 - 12);
      if (d < 11.5) pc.set(x, y, d > 10.5 ? 0x9aa0a6 : d > 9.8 ? 0x4a4e54 : 0xeee6cc);
    }
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI * 0.75 + (i / 10) * Math.PI * 1.5;
      for (let r = 7.5; r < 9.6; r += 0.5) pc.set(Math.round(12 + Math.cos(a) * r - 0.5), Math.round(12 + Math.sin(a) * r - 0.5), i >= 8 ? 0xc0281e : 0x1a1a1a);
    }
    for (let i = 0; i < 40; i++) { const a = Math.PI * 0.75 + (i / 40) * Math.PI * 1.5; pc.set(Math.round(12 + Math.cos(a) * 9.2 - 0.5), Math.round(12 + Math.sin(a) * 9.2 - 0.5), i > 31 ? 0xc0281e : 0x5a5a5a); }
    txtC(pc, 'SCRIP', 12, 15, 0x3a3a3a);
    pc.set(11, 11, 0x1a1a1a); pc.set(12, 11, 0x1a1a1a); pc.set(11, 12, 0x1a1a1a); pc.set(12, 12, 0x1a1a1a);
    pc.blend(7, 6, 0xffffff, 0.6); pc.blend(8, 5, 0xffffff, 0.5); pc.blend(6, 7, 0xffffff, 0.4);
  });
  // projector pylon housing: grille slots, hazard band and a serial
  A.add('zd_pylon', 8, 32, (pc) => {
    const S = makeRamp(0x3c4048, 5, { spread: 0.35 });
    fillR(pc, 0, 0, 8, 32, S, (x, y) => 0.5 + (ph(x >> 1, y >> 2, 831) - 0.5) * 0.3, 0.8);
    hazard(pc, 0, 4, 8, 4, 4, 0.08, 832);
    for (let y = 12; y < 22; y += 2) pc.hline(1, 6, y, 0x14161a);
    pc.vline(0, 0, 31, S[4]); pc.vline(7, 0, 31, S[1]);
    pc.set(3, 26, 0xffb040); pc.set(4, 26, 0x8a5a20);
  });
  // lens: deep cyan glass with a bright core
  A.add('zd_lens', 8, 8, (pc) => {
    pc.wrap = false;
    pc.fill(0x2a1a0a);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const d = Math.hypot(x + 0.5 - 4, y + 0.5 - 4); if (d < 3) pc.set(x, y, d < 1.2 ? 0xfff4d8 : d < 2.2 ? 0xffc060 : 0x8a5a20); }
  });

  // ---- the passage kiosk
  A.add('zd_kiosk_body', 32, 64, (pc, rng) => {
    pc.wrap = false;
    plate(pc, 0, 0, 32, 64, 0x3a4048, 841, { noise: 0.1 });
    // ticket slot, band reader cradle, coin return, a sticker
    pc.rect(6, 34, 20, 3, 0x0c0d10); pc.hline(6, 25, 33, 0x8a9098); pc.hline(6, 25, 37, 0x22252a);
    txtC(pc, 'TICKET', 16, 39, 0xc8ccd2);
    pc.rect(9, 46, 14, 9, 0x22252a); pc.strokeRect(9, 46, 14, 9, 0x8a9098);
    for (let y = 48; y < 54; y += 2) pc.hline(11, 20, y, 0x3a3e46);
    pc.set(21, 47, 0x6af0ff);
    txtC(pc, 'BAND', 16, 57, 0xc8ccd2);
    hazard(pc, 0, 61, 32, 3, 4, 0.1, 842);
    pc.rect(25, 41, 5, 4, 0xe8e2d0); scribble(pc, 25, 42, 5, 2, 0x8a3a2a, 43, 1);
    for (let i = 0; i < 30; i++) pc.blend(rng.int(0, 31), rng.int(0, 60), 0x1a1c20, 0.3);
    for (const [x, y] of [[2, 2], [29, 2], [2, 58], [29, 58]] as const) screw(pc, x, y, 0xb8c0c8, 0x22252a);
  });
  A.add('zd_kiosk_screen', 32, 24, (pc) => {
    pc.wrap = false;
    pc.fill(0x140c04);
    const amb = 0xffb040, dim = 0x8a5a20;
    txt(pc, 'PASSAGE', 2, 2, amb);
    pc.hline(2, 29, 8, dim);
    scribble(pc, 2, 10, 20, 3, dim, 851, 3);
    txt(pc, '0400', 21, 10, amb);
    txt(pc, 'DEBT', 2, 18, amb); pc.rect(20, 18, 9, 5, 0x3a2208); txt(pc, 'OK', 21, 18, 0x7aff6a);
    crtGlass(pc, 0, 0, 32, 24, 0x050302, 0.6);
  });
  A.add('zd_kiosk_sign', 32, 8, (pc) => {
    pc.wrap = false;
    pc.fill(0x1a1c20);
    txtC(pc, 'PASSAGE', 16, 1, 0xfff0c8);
    pc.hline(1, 30, 7, 0xffb040);
  });

  // ---- transports
  // night coach: grimy cream and maroon, blacked-out windows with brush marks, a route number nobody runs
  A.add('zd_coach_side', 128, 40, (pc, rng) => {
    pc.wrap = false;
    const C = makeRamp(0xc8bea0, 5, { spread: 0.3 }), M = makeRamp(0x5a1e22, 5, { spread: 0.3 });
    fillR(pc, 0, 0, 128, 40, C, (x, y) => 0.55 + (tileFbm(x, y, 128, 40, 8, 2, 861) - 0.5) * 0.4, 0.8);
    fillR(pc, 0, 26, 128, 14, M, (x, y) => 0.5 + (ph(x >> 2, y, 862) - 0.5) * 0.3, 0.8);
    pc.hline(0, 127, 25, 0x2a1a14); pc.hline(0, 127, 24, C[4]);
    // windows: painted over from outside, streaks where the brush ran dry
    for (let i = 0; i < 7; i++) {
      const x0 = 6 + i * 17, w = 14;
      pc.rect(x0, 5, w, 15, 0x0c0c0e);
      for (let k = 0; k < 10; k++) { const sx = x0 + rng.int(0, w - 1), sy = 5 + rng.int(0, 14); pc.blend(sx, sy, 0x2a2a30, 0.6); pc.blend(sx + 1, sy, 0x2a2a30, 0.4); }
      pc.strokeRect(x0 - 1, 4, w + 2, 17, 0x6a6a70);
      pc.hline(x0, x0 + w - 1, 5, 0x3a3a42);
    }
    // the route plate and the dirt line
    pc.rect(4, 29, 18, 6, 0xe8e2d0); txt(pc, '0400', 5, 30, 0x1a1a1a);
    for (let x = 0; x < 128; x++) for (let y = 34; y < 40; y++) if (ph(x, y, 863) < (y - 33) * 0.12) pc.blend(x, y, 0x2a2018, 0.5);
    for (let i = 0; i < 40; i++) pc.blend(rng.int(0, 127), rng.int(0, 39), 0x6a5a40, 0.25);
  }, 10.5, 3.1);
  A.add('zd_coach_front', 32, 40, (pc) => {
    pc.wrap = false;
    const C = makeRamp(0xc8bea0, 5, { spread: 0.3 });
    fillR(pc, 0, 0, 32, 40, C, (x, y) => 0.55 + (ph(x >> 2, y >> 2, 871) - 0.5) * 0.3, 0.8);
    pc.rect(0, 26, 32, 14, 0x5a1e22);
    pc.rect(2, 2, 28, 4, 0x0e0a06); txtC(pc, 'NOT IN', 16, 0, 0x0e0a06); // the destination blind is set past its last stop
    pc.rect(3, 3, 26, 3, 0x1a0e04); for (let x = 4; x < 28; x += 2) pc.set(x, 4, 0xffa030);
    pc.rect(2, 8, 28, 16, 0x101216); pc.vline(15, 8, 23, 0x3a3a42); pc.blend(4, 10, 0xffffff, 0.25); pc.blend(5, 9, 0xffffff, 0.25);
    pc.rect(2, 28, 6, 4, 0xfff4c8); pc.rect(24, 28, 6, 4, 0xfff4c8);
    pc.rect(10, 29, 12, 5, 0x2a2a30); for (let x = 10; x < 22; x += 2) pc.vline(x, 29, 33, 0x4a4a52);
  }, 2.5, 3.1);
  // the quiet car: varnished teak panelling, warm lit windows, someone already seated in every one
  A.add('zd_carriage_side', 128, 40, (pc, rng) => {
    pc.wrap = false;
    const W = makeRamp(0x6a3a1e, 6, { spread: 0.35 });
    fillR(pc, 0, 0, 128, 40, W, (x, y) => 0.45 + Math.sin(x * 0.25 + Math.sin(y * 0.3) * 2) * 0.1 + (ph(x >> 1, y >> 3, 881) - 0.5) * 0.15, 0.6);
    for (let x = 0; x < 128; x += 16) pc.vline(x, 0, 39, W[1]);
    pc.hline(0, 127, 3, 0xd2a63e); pc.hline(0, 127, 31, 0xd2a63e);
    for (let i = 0; i < 6; i++) {
      const x0 = 8 + i * 20, w = 13;
      for (let y = 8; y < 26; y++) for (let x = x0; x < x0 + w; x++) pc.set(x, y, y < 17 ? 0xffd890 : 0xf0b860);
      // a seated passenger silhouette, perfectly still, facing forward
      const sx = x0 + 4 + (i % 2);
      pc.rect(sx, 13, 5, 13, 0x3a2414); pc.rect(sx + 1, 10, 3, 3, 0x3a2414);
      if (i === 3) { pc.rect(sx + 1, 10, 3, 3, 0xe8c8b0); pc.set(sx + 1, 11, 0x1a0a04); pc.set(sx + 3, 11, 0x1a0a04); } // one of them is looking out
      pc.strokeRect(x0 - 1, 7, w + 2, 20, 0xd2a63e);
    }
    txt(pc, 'Q', 120, 33, 0xd2a63e);
    for (let i = 0; i < 30; i++) pc.blend(rng.int(0, 127), rng.int(0, 39), 0x1a0e06, 0.25);
  }, 12, 3.3);
  A.add('zd_carriage_end', 32, 40, (pc) => {
    pc.wrap = false;
    const W = makeRamp(0x6a3a1e, 6, { spread: 0.35 });
    fillR(pc, 0, 0, 32, 40, W, (x, y) => 0.45 + (ph(x >> 1, y >> 3, 891) - 0.5) * 0.2, 0.6);
    pc.rect(10, 8, 12, 28, 0x2a160a); pc.strokeRect(10, 8, 12, 28, 0xd2a63e);
    pc.rect(12, 10, 8, 8, 0xffd890);
    pc.rect(2, 30, 4, 3, 0xffe8b0); pc.rect(26, 30, 4, 3, 0xff6a3a);
  }, 2.8, 3.3);
  // overlay glows for the hopper (additive): a soft square glow, a scan line, the open pit
  A.add('zd_glow', 16, 16, (pc) => {
    pc.wrap = false;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const u = Math.abs(x + 0.5 - 8) / 8, v = Math.abs(y + 0.5 - 8) / 8;
      const d = Math.max(u, v);
      const k = Math.max(0, 1 - d * d) * (0.7 + 0.3 * ((x + y) % 2));
      const c = Math.round(255 * k);
      pc.setRGBA(x, y, c, c, c, 255);
    }
  });
  A.add('zd_scanline', 8, 8, (pc) => {
    pc.wrap = false;
    for (let y = 0; y < 8; y++) { const k = [0.05, 0.15, 0.4, 1, 1, 0.4, 0.15, 0.05][y]; for (let x = 0; x < 8; x++) { const c = Math.round(255 * k * (x % 2 ? 0.85 : 1)); pc.setRGBA(x, y, c, c, c, 255); } }
  });
  A.add('zd_curtain', 8, 16, (pc) => {
    pc.wrap = false;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 8; x++) { const k = (y / 15) * (y % 3 === 0 ? 0.5 : 1) * (0.6 + 0.4 * Math.abs(Math.sin(x * 1.7))); const c = Math.round(255 * k); pc.setRGBA(x, y, c, c, c, 255); }
  });
  A.add('zd_pit', 4, 4, (pc) => { pc.fill(0x020203); pc.set(1, 1, 0x0a0a0c); });
  // a four-point glint for valuables lying about (additive: black is transparent)
  A.add('zd_glint', 9, 9, (pc) => {
    pc.wrap = false; pc.fill(0x000000);
    for (let i = 0; i < 9; i++) { const k = 1 - Math.abs(i - 4) / 4.5; const c = Math.round(255 * k * k); pc.setRGBA(i, 4, c, c, c, 255); pc.setRGBA(4, i, c, c, c, 255); }
    pc.setRGBA(3, 3, 120, 120, 120, 255); pc.setRGBA(5, 5, 120, 120, 120, 255); pc.setRGBA(3, 5, 120, 120, 120, 255); pc.setRGBA(5, 3, 120, 120, 120, 255);
    pc.setRGBA(4, 4, 255, 255, 255, 255);
  });
  A.add('zd_needle', 4, 8, (pc) => { pc.wrap = false; pc.fill(0xb81e14); pc.vline(0, 0, 7, 0xe8402a); pc.rect(0, 6, 4, 2, 0x1a1a1a); });

  // ---- the Remittance Press: the crown's front plate, the ram's faces and its scarred underside
  A.add('zd_crown_front', 64, 8, (pc) => {
    pc.wrap = false;
    plate(pc, 0, 0, 64, 8, 0x3a3e44, 851, { noise: 0.1 });
    hazard(pc, 0, 0, 5, 8, 6, 0.1, 852); hazard(pc, 59, 0, 5, 8, 6, 0.1, 853);
    // enamel name plate
    pc.rect(6, 1, 25, 6, 0x1e2a36); pc.strokeRect(6, 1, 25, 6, 0x8a9098);
    txt(pc, 'PRESS', 8, 1, 0xe8e4d8); txt(pc, '07', 24, 1, HAZ_Y);
    // the nixie window: a black recess with a chrome lip (the tubes stand in it), SCRIP stamped beside
    pc.rect(33, 1, 22, 6, 0x0a0a0c); pc.strokeRect(32, 0, 24, 8, 0xb8bcc2);
    pc.set(57, 3, 0xd8d2bc); pc.set(57, 5, 0xd8d2bc);
  }, 1.98, 0.24);
  A.add('zd_ram_face', 56, 8, (pc, rng) => {
    pc.wrap = false;
    hazard(pc, 0, 0, 56, 8, 8, 0.18, 861);
    pc.hline(0, 55, 0, 0x8a8e94); pc.hline(0, 55, 7, 0x16181c);
    for (let x = 3; x < 56; x += 7) { screw(pc, x, 2, 0xb8bcc2, 0x2a2c30, true); }
    for (let i = 0; i < 14; i++) pc.blend(rng.int(0, 55), rng.int(1, 6), 0x5a2416, 0.45);
  }, 1.74, 0.26);
  A.add('zd_ram_under', 32, 32, (pc, rng) => {
    const S = makeRamp(0x50545a, 5, { spread: 0.4 });
    fillR(pc, 0, 0, 32, 32, S, (x, y) => 0.45 + (tileFbm(x, y, 32, 32, 4, 2, 871) - 0.5) * 0.5, 0.8);
    for (let y = 2; y < 32; y += 6) pc.hline(0, 31, y, S[0]);
    // what it has met before: brown-black crust and a few bright gouges
    for (let i = 0; i < 90; i++) { const x = rng.int(0, 31), y = rng.int(0, 31); pc.blend(x, y, rng.chance(0.6) ? 0x3a0e0a : 0x5a1a12, 0.5); }
    for (let i = 0; i < 6; i++) { const x = rng.int(0, 28), y = rng.int(0, 31); for (let k = 0; k < 4; k++) pc.set(x + k, y, 0xa8acb2); }
  }, 1.74, 1.74);
  // the seam opening under the plate (additive: black shows nothing)
  A.add('zd_seam', 32, 16, (pc) => {
    pc.wrap = false;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) {
      const v = Math.abs(y + 0.5 - 8) / 8, u = Math.abs(x + 0.5 - 16) / 16;
      const edge = Math.max(0, 1 - Math.abs(v - 0.18) * 6) * (1 - u * u);
      const halo = Math.max(0, 1 - v) * (1 - u) * 0.35;
      const k = Math.min(1, edge + halo) * (0.75 + 0.25 * ((x * 7 + y * 3) % 4 === 0 ? 1 : 0));
      pc.setRGBA(x, y, Math.round(255 * k), Math.round(255 * k), Math.round(255 * k), 255);
    }
  });

  // freight cage mesh and its warning gate
  A.add('zd_cage_mesh', 16, 16, (pc) => {
    pc.fill(0x000000, 0);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if ((x + y) % 4 === 0 || (x - y + 16) % 4 === 0) pc.set(x, y, (x + y) % 8 === 0 ? 0x9aa0a6 : 0x5a5e64);
  }, 1, 1);
});

// ================================================================ the press
/** the Remittance Press's moving parts, in model space (front +z): the ram's underside at rest and on the
 *  plate, the lever's pivot (outside the front-right column, so you never stand on the plate to pull it) */
export const PRESS = {
  ramUp: 1.86, ramDown: 0.065, ramH: 0.26, crownY: 2.2,
  rods: [[-0.5, 0], [0.5, 0]] as [number, number][],
  lever: [1.075, 1.0, 0.84] as [number, number, number],
  leverRest: -0.42, leverPulled: 1.75,
  gauge: [-0.89, 1.375, 1.03] as [number, number, number],
  /** the nixie display in the crown's window: its centre, and the pitch between tubes */
  counter: [0.37, 2.32, 0.996] as [number, number, number], drum: 0.12,
  beacon: [-0.72, 2.47, 0.72] as [number, number, number],
};

/** model of the Remittance Press (2 x 2 tiles, front +z): a four-column hydraulic press over a striped
 *  loading plate with the seam slot in it. The ram, its rods, the lever and the lights are overlays. */
export function hopperModel(mb: ModelBuilder) {
  // the bed: thick steel, hazard skirt, the plate on top
  mb.box(0, 0, 0, 1.98, 0.06, 1.98, { top: 'zd_hopper_plate', all: 'zd_hazard' }, { fit: { top: true } });
  // four columns with feet and guide collars
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * 0.89, z = sz * 0.89;
    mb.box(x, 0.06, z, 0.15, 2.14, 0.15, 'zd_steel', { skip: ['bottom'] });
    mb.box(x, 0.0, z, 0.24, 0.1, 0.24, 'metal_dark');
    for (const k of [-1, 1]) mb.box(x + k * 0.085, 0.1, z + k * 0.085, 0.025, 0.025, 0.025, 'chrome');
    mb.box(x, 2.1, z, 0.21, 0.1, 0.21, 'metal_dark');
  }
  // the crown: a slab of steel across the tops, the name plate, two cylinder housings
  mb.box(0, 2.2, 0, 1.98, 0.24, 1.98, { all: 'zd_steel', south: 'zd_crown_front' }, { fit: { south: true } });
  for (const [x] of PRESS.rods) {
    mb.cylinder(x, 2.44, 0, 0.16, 0.12, 10, 'zd_steel');
    mb.cylinder(x, 2.56, 0, 0.1, 0.03, 10, 'metal_dark');
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; mb.box(x + Math.cos(a) * 0.13, 2.555, Math.sin(a) * 0.13, 0.02, 0.02, 0.02, 'chrome'); }
  }
  // hydraulic pump at the back, hoses up the back-right column into the crown
  mb.box(0.36, 0.06, -0.86, 0.5, 0.4, 0.22, 'zd_steel', { color: 0x9aa890 });
  mb.box(0.36, 0.46, -0.86, 0.44, 0.03, 0.18, 'metal_dark');
  mb.cylinder(0.2, 0.49, -0.86, 0.05, 0.1, 6, 'chrome');
  for (const dx of [0.6, 0.66]) mb.box(dx, 0.3, -0.97, 0.035, 1.92, 0.035, 'rubber_black');
  // the pressure gauge on the front-left column (needle drawn as an overlay)
  mb.box(-0.89, 1.24, 0.99, 0.28, 0.28, 0.06, 'zd_steel');
  mb.box(-0.89, 1.255, 1.021, 0.24, 0.24, 0.004, 'zd_dial', { fit: true });
  // the lever's housing, bolted to the outside of the front-right column
  mb.box(0.995, 0.86, 0.84, 0.06, 0.28, 0.2, 'metal_dark');
  mb.box(1.04, 0.92, 0.84, 0.06, 0.16, 0.14, 'zd_hazard');
  mb.box(1.05, 0.7, 0.84, 0.04, 0.12, 0.06, 'metal_grey');
  // amber beacon cage on the crown (the lamp flashes as an overlay)
  const [bx, by, bz] = PRESS.beacon;
  mb.cylinder(bx, by - 0.03, bz, 0.07, 0.03, 8, 'metal_dark');
  mb.cylinder(bx, by, bz, 0.06, 0.12, 8, 'glass', { color: 0xffb040, emissive: 0.25 });
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; mb.box(bx + Math.cos(a) * 0.065, by, bz + Math.sin(a) * 0.065, 0.01, 0.13, 0.01, 'metal_dark'); }
  // the handler's projector: an arm off the back-right column, the lens looking out over the plate
  mb.box(0.89, 1.83, -0.74, 0.06, 0.06, 0.24, 'metal_dark');
  mb.box(0.86, 1.8, -0.66, 0.12, 0.12, 0.12, { all: 'zd_pylon', top: 'metal_dark' }, { fit: { south: true, north: true, east: true, west: true } });
  mb.push().translate(0.86, 1.86, -0.6).rotateX(Math.PI / 2);
  mb.cylinder(0, 0, 0, 0.05, 0.02, 8, { sides: 'chrome', top: 'zd_lens', bottom: 'zd_lens' }, { fit: true, emissive: 1.2 });
  mb.pop();
}
/** the ram: origin at the centre of its underside */
export function pressRamModel(mb: ModelBuilder) {
  const W = 1.62, H = PRESS.ramH;
  mb.box(0, 0, 0, W, H, W, { all: 'zd_ram_face', top: 'zd_steel', bottom: 'zd_ram_under' }, { fit: true });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) mb.box(sx * 0.89, 0.02, sz * 0.89, 0.23, H - 0.04, 0.23, 'metal_dark');
  mb.box(0, H, 0, 1.5, 0.07, 0.2, 'zd_steel');
  mb.box(0, H, 0, 0.2, 0.07, 1.5, 'zd_steel');
  for (const [x] of PRESS.rods) mb.cylinder(x, H, 0, 0.12, 0.06, 10, 'metal_dark');
}
/** a piston rod, one metre tall (scaled to the gap between ram and crown) */
export function pressRodModel(mb: ModelBuilder) { mb.cylinder(0, 0, 0, 0.065, 1, 10, 'chrome'); }
/** the lever: origin at its pivot, the arm up +y */
export function pressLeverModel(mb: ModelBuilder) {
  mb.box(0, -0.035, 0, 0.07, 0.07, 0.07, 'metal_dark');
  mb.box(0, 0, 0, 0.035, 0.6, 0.035, 'chrome');
  mb.cylinder(0, 0.58, 0, 0.03, 0.14, 8, 'rubber_black');
  mb.sphere(0, 0.74, 0, 0.055, 8, 6, 'plastic_red', { color: 0xff3a24 });
}

defObj({
  key: 'hopper', name: 'Remittance Press', w: 2, d: 2, height: 2.6, block: 'none', hp: 99999, sound: 'metal', flammable: 0,
  desc: 'A four-column hydraulic press over a striped loading plate with a black slit in it. Put things on the plate and pull the lever. The ram comes down, and what was on the plate goes through to the other side. The ledger on your wrist goes down. Stand clear.',
  tags: [...T, 'hopper', 'press', 'machine', 'lever'],
  noShadow: false,
  light: { color: 0xffc070, intensity: 0.28, radius: 3.2, y: 2.1, kind: 'emergency', power: false },
  model: (mb) => hopperModel(mb),
});

// ================================================================ the passage kiosk
export function kioskModel(mb: ModelBuilder) {
  mb.box(0, 0, -0.06, 0.84, 0.06, 0.62, 'metal_dark');
  mb.box(0, 0.06, -0.08, 0.76, 1.26, 0.52, { south: 'zd_kiosk_body', all: 'zd_steel', top: 'metal_dark' }, { fit: { south: true } });
  // hazard-striped kick plate and side rails
  mb.box(0, 0.06, 0.185, 0.78, 0.1, 0.012, 'zd_hazard', { fit: true });
  for (const s of [-1, 1]) mb.box(s * 0.4, 0.06, -0.08, 0.04, 1.3, 0.54, 'metal_dark');
  // slanted screen hood
  mb.box(0, 1.32, -0.12, 0.76, 0.06, 0.48, 'zd_steel');
  mb.push().translate(0, 1.38, 0.08).rotateX(-0.42);
  mb.box(0, 0, -0.02, 0.72, 0.5, 0.08, 'zd_steel');
  mb.box(0, 0.06, 0.022, 0.58, 0.38, 0.004, 'zd_kiosk_screen', { fit: true, emissive: 1.1 });
  mb.box(0, 0.47, 0.03, 0.72, 0.04, 0.12, 'metal_dark'); // glare visor
  mb.pop();
  mb.box(0, 1.38, -0.24, 0.76, 0.5, 0.2, 'zd_steel');
  // the lit sign on a stalk
  mb.box(0, 1.86, -0.2, 0.07, 0.26, 0.07, 'metal_dark');
  mb.box(0, 2.1, -0.2, 0.96, 0.26, 0.14, { south: 'zd_kiosk_sign', north: 'zd_kiosk_sign', all: 'metal_dark' }, { fit: { south: true, north: true }, emissive: 0.9 });
  // band reader cradle and the ticket tongue
  mb.box(0, 0.72, 0.19, 0.36, 0.05, 0.1, 'metal_dark');
  mb.box(0.1, 0.75, 0.23, 0.04, 0.012, 0.03, 'led_green', { emissive: 1.4 });
  mb.box(0, 0.9, 0.185, 0.18, 0.004, 0.05, 'paper', { color: 0xece2c8 });
}

defObj({
  key: 'ticket_kiosk', name: 'Passage Kiosk', w: 1, d: 1, height: 2.2, block: 'solid', hp: 99999, sound: 'metal', flammable: 0, power: false,
  desc: 'A steel booking machine with an amber screen. It sells passage out, to debtors whose ledgers read zero. Press your band to the cradle.',
  tags: [...T, 'kiosk', 'passage', 'machine'],
  light: { color: 0xffb040, intensity: 0.35, radius: 2.6, y: 1.6, kind: 'screen', power: false },
  model: (mb) => kioskModel(mb),
});

// ================================================================ transports (built at origin, long axis along x, doors on +z)
/** side: which flank the door is on (+1 = +z, -1 = -z) */
export function coachModel(mb: ModelBuilder, open = false, side = 1) {
  const L = 10.4, W = 2.5, H = 3.0, y0 = 0.42;
  mb.box(0, y0, 0, L, H - y0, W, { south: 'zd_coach_side', north: 'zd_coach_side', east: 'zd_coach_front', west: 'zd_coach_front', top: 'metal_grey' }, { fit: { south: true, north: true, east: true, west: true } });
  mb.box(0, H, 0, L - 0.4, 0.08, W - 0.2, 'metal_grey');
  for (let i = 0; i < 3; i++) mb.box(-3 + i * 2.5, H + 0.08, 0, 0.8, 0.12, 1.0, 'metal_dark'); // roof vents
  mb.box(0, 0.25, 0, L - 0.2, 0.2, W - 0.1, 'metal_dark');
  for (const x of [-3.6, 3.4]) for (const s of [-1, 1]) {
    mb.push().translate(x, 0.5, s * (W / 2 - 0.12)).rotateX(Math.PI / 2);
    mb.cylinder(0, -0.14, 0, 0.5, 0.28, 10, { sides: 'rubber_black', top: 'metal_dark', bottom: 'metal_dark' });
    mb.pop();
  }
  // bumpers, mirrors, headlights (emissive) and the door
  mb.box(L / 2 + 0.06, 0.42, 0, 0.12, 0.25, W, 'metal_dark');
  mb.box(-L / 2 - 0.06, 0.42, 0, 0.12, 0.25, W, 'metal_dark');
  for (const s of [-1, 1]) { mb.box(L / 2 + 0.02, 1.0, s * 0.95, 0.04, 0.16, 0.3, 'screen_on', { emissive: 1.4, color: 0xfff4d0 }); mb.box(L / 2 + 0.25, 2.2, s * (W / 2 + 0.15), 0.05, 0.4, 0.05, 'metal_dark'); }
  for (const s of [-1, 1]) mb.box(-L / 2 - 0.02, 0.95, s * 0.95, 0.04, 0.2, 0.25, 'led_red', { emissive: 1.2 });
  const dx = 3.9, sd = side < 0 ? -1 : 1;
  if (open) {
    mb.box(dx, y0 + 0.05, sd * (W / 2 + 0.01), 1.1, 2.2, 0.02, 'metal_dark', { color: 0x050506 });
    mb.box(dx, 0.2, sd * (W / 2 + 0.3), 1.1, 0.06, 0.5, 'metal_grey'); // step
    for (const s of [-1, 1]) mb.box(dx + s * 0.75, y0 + 0.05, sd * (W / 2 + 0.05), 0.4, 2.2, 0.04, 'glass_dark');
  } else {
    for (const s of [-1, 1]) mb.box(dx + s * 0.28, y0 + 0.05, sd * (W / 2 + 0.02), 0.54, 2.2, 0.04, 'glass_dark');
  }
  // dim cab light: the driver's seat is empty
  mb.box(L / 2 - 0.9, 1.6, 0.6, 0.4, 0.5, 0.4, 'fabric_grey');
}
export function carriageModel(mb: ModelBuilder, open = false, side = 1) {
  const L = 12, W = 2.7, H = 3.3, y0 = 0.6;
  mb.box(0, y0, 0, L, H - y0, W, { south: 'zd_carriage_side', north: 'zd_carriage_side', east: 'zd_carriage_end', west: 'zd_carriage_end', top: 'metal_dark' }, { fit: { south: true, north: true, east: true, west: true }, emissive: 0.15 });
  // curved roof suggested by two stepped slabs
  mb.box(0, H, 0, L, 0.12, W - 0.3, 'metal_dark');
  mb.box(0, H + 0.12, 0, L - 0.2, 0.08, W - 0.9, 'metal_dark');
  // bogies with no rails under them
  for (const x of [-4.2, 4.2]) {
    mb.box(x, 0.2, 0, 2.2, 0.4, W - 0.4, 'metal_dark');
    for (const k of [-0.6, 0.6]) for (const s of [-1, 1]) { mb.push().translate(x + k, 0.42, s * (W / 2 - 0.4)).rotateX(Math.PI / 2); mb.cylinder(0, -0.06, 0, 0.42, 0.12, 10, 'metal_rusty'); mb.pop(); }
  }
  for (const s of [-1, 1]) mb.box(s * (L / 2 + 0.2), 1.0, 0, 0.4, 0.3, 0.3, 'metal_dark'); // couplers to nothing
  const dx = 0, sd = side < 0 ? -1 : 1;
  if (open) { mb.box(dx, y0, sd * (W / 2 + 0.01), 1.0, 2.1, 0.02, 'wood_dark', { color: 0x1a0e06 }); mb.box(dx, 0.3, sd * (W / 2 + 0.35), 1.0, 0.06, 0.5, 'metal_dark'); }
  else mb.box(dx, y0, sd * (W / 2 + 0.02), 1.0, 2.1, 0.04, 'wood_dark');
}
export function cageModel(mb: ModelBuilder, open = false, side = 1) {
  const S = 3.0, H = 2.6;
  mb.box(0, 0, 0, S, 0.12, S, { top: 'zd_hopper_plate', all: 'zd_hazard' }, { fit: { top: true } });
  for (const x of [-1, 1]) for (const z of [-1, 1]) mb.box(x * (S / 2 - 0.05), 0.12, z * (S / 2 - 0.05), 0.1, H, 0.1, 'zd_steel');
  mb.box(0, H + 0.12, 0, S, 0.12, S, 'zd_steel');
  // mesh walls on three sides, a folding gate on the front
  mb.box(0, 0.12, -(side < 0 ? -1 : 1) * (S / 2 - 0.03), S - 0.1, H, 0.02, 'zd_cage_mesh', { fit: false });
  for (const s of [-1, 1]) mb.box(s * (S / 2 - 0.03), 0.12, 0, 0.02, H, S - 0.1, 'zd_cage_mesh', { fit: false });
  const gz = (side < 0 ? -1 : 1) * (S / 2 - 0.03);
  if (!open) for (let i = 0; i < 7; i++) mb.box(-S / 2 + 0.25 + i * 0.42, 0.12, gz, 0.04, H, 0.04, 'chrome');
  else for (let i = 0; i < 7; i++) mb.box(-S / 2 + 0.12 + i * 0.06, 0.12, gz, 0.04, H, 0.04, 'chrome');
  mb.box(0, H - 0.3, -S / 2 + 0.08, 0.5, 0.3, 0.12, 'metal_dark'); // control box
  mb.box(0.1, H - 0.2, -S / 2 + 0.145, 0.06, 0.06, 0.01, 'led_green', { emissive: 1.4 });
  // cables vanishing up into the dark
  for (const s of [-1, 1]) mb.box(s * 0.6, H + 0.24, 0, 0.05, 6, 0.05, 'metal_dark');
}

defObj({ key: 'transport_coach', name: 'Night Coach', w: 10, d: 3, height: 3.2, block: 'none', hp: 99999, sound: 'metal', tags: [...T, 'transport_model'], desc: 'A late-night coach with its windows painted black from the outside.', model: (mb) => { mb.push().translate(0, 0, 0); coachModel(mb, false); mb.pop(); } });
defObj({ key: 'transport_carriage', name: 'The Quiet Car', w: 12, d: 3, height: 3.4, block: 'none', hp: 99999, sound: 'wood', tags: [...T, 'transport_model'], desc: 'A single railway carriage with no locomotive and no rails. Every window is lit. Every seat by a window is taken.', model: (mb) => carriageModel(mb, false) });
defObj({ key: 'transport_cage', name: 'Freight Lift', w: 3, d: 3, height: 2.8, block: 'none', hp: 99999, sound: 'metal', tags: [...T, 'transport_model'], desc: 'An open freight cage on cables that go up further than the ceiling.', model: (mb) => cageModel(mb, false) });

installHopperPlacement();

void txtW; void scribble;
