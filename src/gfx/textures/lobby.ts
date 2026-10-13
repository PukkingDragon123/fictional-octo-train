// Level 0 — "The Lobby": mono-yellow wallpaper, damp mustard carpet, the hum.
import { atlas } from '../atlas';
import { PixelCanvas, makeRamp, bayer, ph, mixHex } from '../pixel';
import { Rng, tileFbm } from '../../core/rng';

export const WALL_PX = 86; // 2.7m at 32px/m

/** The iconic wallpaper: faint vertical pinstripes with staggered chevron motifs. */
function wallpaperYellow(pc: PixelCanvas, rng: Rng, variant: number) {
  const R = makeRamp(0xcbb662, 8, { hueShift: 0.03, spread: 0.55 });
  // R[0]=darkest .. R[7]=lightest ; base sits at R[4]
  const W = pc.w, H = pc.h;
  pc.fillRamp(R, (x, y) => {
    const n = tileFbm(x, y, W, H, 3, 3, 11 + variant) * 0.12;
    const fine = (ph(x, y, 3) - 0.5) * 0.05;
    return 0.56 + n - 0.06 + fine;
  }, 0.7);
  // pinstripes every 8px (double line at 0 and 16 is slightly stronger)
  for (let x = 0; x < W; x += 8) {
    for (let y = 0; y < H; y++) {
      const strong = x % 16 === 0;
      if (strong || (y + x) % 3 !== 0) pc.blend(x, y, R[3], strong ? 0.55 : 0.35);
    }
  }
  // staggered chevrons ("^") between stripes
  for (let col = 0; col < W / 8; col++) {
    const cx = col * 8 + 4;
    const off = col % 2 === 0 ? 0 : 5;
    for (let y = off; y < H; y += 10) {
      pc.blend(cx, y, R[2], 0.5);
      pc.blend(cx - 1, y + 1, R[2], 0.45); pc.blend(cx + 1, y + 1, R[2], 0.45);
      pc.blend(cx - 2, y + 2, R[3], 0.35); pc.blend(cx + 2, y + 2, R[3], 0.35);
      pc.blend(cx, y + 1, R[6], 0.25); // printed highlight
    }
  }
  // ceiling junction shadow
  for (let x = 0; x < W; x++) { pc.blend(x, 0, R[1], 0.6); pc.blend(x, 1, R[2], 0.35); if (bayer(x, 2) < 0.4) pc.blend(x, 2, R[2], 0.25); }
  // moisture wicking up from the carpet: darker, slightly green-brown toward the bottom
  const damp = mixHex(R[1], 0x6b6a3a, 0.4);
  for (let y = H - 22; y < H; y++) {
    const t = (y - (H - 22)) / 22;
    for (let x = 0; x < W; x++) {
      const wav = tileFbm(x, y, W, H, 4, 2, 5 + variant) * 0.6;
      if (t * t * 0.9 + wav * t > bayer(x, y) + 0.15) pc.blend(x, y, damp, 0.35 + 0.3 * t);
    }
  }
  // baseboard
  const bb = makeRamp(0x7a6834, 5);
  for (let x = 0; x < W; x++) {
    pc.set(x, H - 4, bb[3]); pc.set(x, H - 3, bb[2]); pc.set(x, H - 2, bb[1]); pc.set(x, H - 1, bb[0]);
    if (ph(x, 1, 9) < 0.18) pc.set(x, H - 3, bb[1]);
  }
  // variant ageing
  if (variant === 1) {
    pc.stain(rng.int(6, 26), rng.int(18, 50), rng.int(5, 8), mixHex(R[2], 0x7d6a2a, 0.5), R[1], variant);
    pc.drips(rng, R[2], 3, 0, 30, 0.25);
  } else if (variant === 2) {
    pc.drips(rng, mixHex(R[1], 0x55502a, 0.5), 5, 0, 45, 0.3);
    pc.stain(rng.int(8, 24), rng.int(52, 70), rng.int(4, 7), R[3], R[1], variant + 3);
  } else if (variant === 3) {
    // peeling seam: a vertical tear showing grey drywall
    const sx = rng.int(4, 27);
    for (let y = rng.int(5, 20); y < rng.int(40, 70); y++) {
      if (ph(sx, y, 4) < 0.85) pc.set(sx, y, 0x9a9686);
      if (ph(sx + 1, y, 5) < 0.4) pc.set(sx + 1, y, 0xb5ae92);
      pc.blend(sx - 1, y, R[1], 0.4);
    }
  }
}

/**
 * Level 0 carpet: light tan loop pile (~#a8956e), deliberately low contrast.
 * Soft damp mottling at mid frequency (so 1 m repeats don't read as a grid),
 * sparse 2px tufts instead of per-pixel static. The floor is laid with random
 * 90° turns, so one-off marks stay away from the tile edges.
 */
function carpetYellow(pc: PixelCanvas, rng: Rng, variant: number) {
  const R = makeRamp(0xa8956e, 6, { hueShift: 0.03, spread: 0.3 });
  const W = pc.w, H = pc.h;
  const lo = mixHex(R[2], R[3], 0.3), mid = mixHex(R[2], R[3], 0.65), hi = mixHex(R[3], R[4], 0.25);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const m = tileFbm(x, y, W, H, 5, 2, 21 + variant) * 0.7 + tileFbm(x, y, W, H, 8, 1, 31 + variant) * 0.3;
    let c = m < 0.41 ? lo : m < 0.5 ? mid : m < 0.61 ? R[3] : hi;
    // loop-pile tufts: tiny 2px clusters, sparse
    const t = ph((x + (y & 1)) >> 1, y, 17 + variant);
    if (t < 0.06) c = mixHex(R[2], lo, 0.3);
    else if (t > 0.97) c = R[4];
    pc.set(x, y, c);
  }
  if (variant === 1) {
    // an old coffee-coloured stain with a darker tide line
    const cx = rng.int(12, 20), cy = rng.int(12, 20), r = rng.int(4, 6);
    pc.stain(cx, cy, r, 0x7a6438, 0x5e4a26, 7);
  } else if (variant === 2) {
    // a damp patch: darker, faintly green-brown, with a few wet glints
    for (let y = 4; y < H - 4; y++) for (let x = 4; x < W - 4; x++) {
      const dx = (x - 15.5) / 10, dy = (y - 16.5) / 8;
      const d = dx * dx + dy * dy + (tileFbm(x, y, W, H, 4, 2, 55) - 0.5) * 0.9;
      if (d < 1) {
        pc.blend(x, y, 0x6c6240, d < 0.55 ? 0.42 : 0.26);
        if (d < 0.5 && ph(x, y, 6) < 0.04) pc.set(x, y, 0xd2c99e);
      }
    }
  }
}

/** Soaked carpet: darker, matted pile with standing water sheen (no static). */
function carpetWet(pc: PixelCanvas, rng: Rng) {
  const R = makeRamp(0x7e6d4a, 6, { hueShift: 0.04, spread: 0.34 });
  const W = pc.w, H = pc.h;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const m = tileFbm(x, y, W, H, 5, 2, 8);
    let c = m < 0.42 ? R[1] : m < 0.56 ? mixHex(R[1], R[2], 0.6) : R[2];
    if (ph((x + (y & 1)) >> 1, y, 31) < 0.07) c = R[1];
    pc.set(x, y, c);
  }
  // standing water: slightly green-grey sheen pooling in the low spots, sparse glints
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const n = tileFbm(x, y, W, H, 4, 2, 91);
    if (n > 0.55) {
      pc.blend(x, y, 0x48503e, n > 0.6 ? 0.45 : 0.28);
      if (n > 0.6 && ph(x, y, 2) < 0.05) pc.set(x, y, 0xcfcaa6);
    }
  }
  void rng;
}

function wallTop(pc: PixelCanvas, rng: Rng, base: number) {
  const R = makeRamp(base, 4, { spread: 0.25 });
  pc.fillRamp(R, (x, y) => 0.5 + (ph(x, y, 4) - 0.5) * 0.4, 1);
  pc.speckle(rng, [R[0]], 0.05);
}

export function registerLobbyTextures() {
  const A = atlas();
  A.add('wall_yellow', 32, WALL_PX, (pc, r) => wallpaperYellow(pc, r, 0), 1, 2.7);
  A.add('wall_yellow_b', 32, WALL_PX, (pc, r) => wallpaperYellow(pc, r, 1), 1, 2.7);
  A.add('wall_yellow_c', 32, WALL_PX, (pc, r) => wallpaperYellow(pc, r, 2), 1, 2.7);
  A.add('wall_yellow_d', 32, WALL_PX, (pc, r) => wallpaperYellow(pc, r, 3), 1, 2.7);
  A.add('carpet_yellow', 32, 32, (pc, r) => carpetYellow(pc, r, 0));
  A.add('carpet_yellow_b', 32, 32, (pc, r) => carpetYellow(pc, r, 1));
  A.add('carpet_yellow_c', 32, 32, (pc, r) => carpetYellow(pc, r, 2));
  A.add('carpet_wet', 32, 32, carpetWet);
  A.add('wall_top', 16, 16, (pc, r) => wallTop(pc, r, 0x3b3426));
  A.add('wall_top_concrete', 16, 16, (pc, r) => wallTop(pc, r, 0x3d3d3a));
  A.add('wall_top_white', 16, 16, (pc, r) => wallTop(pc, r, 0x8f9496));
}
