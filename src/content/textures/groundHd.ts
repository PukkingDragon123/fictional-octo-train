// Hand-painted ground for the open levels at twice the old density (64 x 64 a tile: 64 px a metre): the turf
// the grass field (src/gfx/grass.ts) and the voxel litter (src/gfx/voxDetail.ts) sit in. Soil grain in
// three shades, moss cushions, root lines breaking the surface with a lit edge, packed dirt with cracks,
// gravel with a lit top and a shadow under, leaf litter, dried mud flats with crazed edges, short turf
// blades. Every feature wraps at the edges (the canvas wraps), so the tiles run on seamlessly.
import { PixelCanvas, makeRamp, mixHex } from '../../gfx/pixel';
import { Rng, tileFbm, hashf } from '../../core/rng';

export interface TurfStyle {
  /** turf green (the short grass between tufts), soil, moss, packed dirt */
  turf: number; soil: number; moss: number; packed: number;
  /** share of the tile that is turf (rest soil / moss / packed), 0..1 */
  cover: number;
  /** counts per tile */
  roots: number; gravel: number; litter: number; mud: number; flowers: number;
  /** leaf litter colours */
  leaves: number[];
  /** tiny flowers in the turf (meadow sparkles, daisies) */
  petals: number[];
  seed: number;
}

const W = 64;

export function paintTurf(pc: PixelCanvas, rng: Rng, s: TurfStyle) {
  const T = makeRamp(s.turf, 6, { spread: 0.42, hueShift: 0.04, satShift: 0.06 });
  const S = makeRamp(s.soil, 5, { spread: 0.4, hueShift: 0.03 });
  const M = makeRamp(s.moss, 4, { spread: 0.36 });
  const K = makeRamp(s.packed, 4, { spread: 0.28 });
  const sd = s.seed;
  // ---- the ground: turf where the cover noise is high, moss cushions in the damp, soil and packed dirt between
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const c = tileFbm(x, y, W, W, 3, 3, sd + 1);
    const m = tileFbm(x, y, W, W, 5, 2, sd + 2);
    const g = tileFbm(x, y, W, W, 16, 2, sd + 3);          // fine grain
    const j = hashf(x, y, sd + 4);
    let col: number;
    if (c > 0.62 - s.cover * 0.5) {
      // turf: short blades, one pixel each, lit on top
      const v = 2 + (g > 0.56 ? 1 : 0) + (g > 0.68 ? 1 : 0) - (g < 0.4 ? 1 : 0) - (j < 0.08 ? 1 : 0);
      col = T[Math.max(0, Math.min(5, v))];
    } else if (m > 0.6) {
      col = M[Math.max(0, Math.min(3, 1 + (g > 0.55 ? 1 : 0) + (j > 0.9 ? 1 : 0) - (j < 0.1 ? 1 : 0)))];
    } else if (m < 0.36) {
      // packed dirt: smoother, paler
      col = K[1 + (g > 0.6 ? 1 : 0) - (j < 0.06 ? 1 : 0)];
    } else {
      // soil: grain in three shades with dark specks
      col = S[Math.max(0, Math.min(4, 2 + (g > 0.58 ? 1 : 0) - (g < 0.42 ? 1 : 0) - (j < 0.1 ? 1 : 0)))];
    }
    pc.set(x, y, col);
  }
  // blades of turf that stand up out of the soil edges: a dark root pixel under a lit tip
  for (let i = 0; i < 260; i++) {
    const x = rng.int(0, W - 1), y = rng.int(0, W - 1);
    const n = tileFbm(x, y, W, W, 3, 3, sd + 1);
    if (n < 0.42 - s.cover * 0.3) continue;
    const l = 1 + rng.int(0, 2), lean = rng.int(-1, 1);
    for (let k = 0; k < l; k++) pc.set(x + (k === l - 1 ? lean : 0), y - k, T[Math.min(5, 3 + k)]);
    pc.set(x, y + 1, T[0]);
  }
  // ---- dried mud flats: a pale crust crazed into plates, darker cracks
  for (let i = 0; i < s.mud; i++) {
    const cx = rng.int(0, W - 1), cy = rng.int(0, W - 1), rx = rng.int(5, 10), ry = rng.int(3, 6);
    const crust = mixHex(S[3], K[2], 0.5), crack = S[0];
    for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) {
      const d = (x * x) / (rx * rx) + (y * y) / (ry * ry);
      if (d > 1 - hashf(x + cx, y + cy, sd + 9) * 0.25) continue;
      const cell = hashf(Math.floor((x + 40) / 3.3), Math.floor((y + 40) / 2.6), sd + 10 + i);
      const edge = ((x + 40) % 3.3 < 0.9) || ((y + 40) % 2.6 < 0.8);
      pc.set(cx + x, cy + y, edge && cell > 0.25 ? crack : mixHex(crust, S[4], cell * 0.25));
    }
  }
  // ---- roots breaking the surface: meandering, a lit upper edge and a shadow under
  for (let i = 0; i < s.roots; i++) {
    let x = rng.float(0, W), y = rng.float(0, W), a = rng.float(0, Math.PI * 2);
    const len = rng.int(14, 34), thick = rng.chance(0.35);
    const bark = mixHex(S[1], 0x6a4a30, 0.5), lit = mixHex(bark, 0xc8a878, 0.45);
    for (let k = 0; k < len; k++) {
      a += rng.float(-0.35, 0.35);
      x += Math.cos(a); y += Math.sin(a) * 0.8;
      pc.set(x, y, bark); pc.set(x, y - 1, lit); pc.set(x, y + 1, S[0]);
      if (thick && k < len * 0.6) { pc.set(x + 1, y, bark); pc.set(x + 1, y - 1, lit); }
      if (rng.chance(0.06)) { // a rootlet
        let bx = x, by = y, b = a + (rng.chance(0.5) ? 1.2 : -1.2);
        for (let q = 0; q < 5; q++) { bx += Math.cos(b); by += Math.sin(b) * 0.8; pc.set(bx, by, bark); }
      }
    }
  }
  // ---- gravel: clusters of stones, each lit on top with a shadow below-right
  const stones = [0x9a9488, 0x8a8478, 0xaaa496, 0x7c766c, 0xb4ac9c];
  for (let i = 0; i < s.gravel; i++) {
    const cx = rng.int(0, W - 1), cy = rng.int(0, W - 1), n = rng.int(2, 6);
    for (let k = 0; k < n; k++) {
      const x = cx + rng.int(-3, 3), y = cy + rng.int(-2, 2), c = rng.pick(stones), big = rng.chance(0.35);
      pc.set(x, y, c); pc.set(x, y - 1, mixHex(c, 0xffffff, 0.3));
      if (big) { pc.set(x + 1, y, mixHex(c, 0x000000, 0.12)); pc.set(x + 1, y - 1, c); }
      pc.set(x + (big ? 2 : 1), y + 1, S[0]); pc.set(x, y + 1, mixHex(S[0], S[1], 0.5));
    }
  }
  // ---- leaf litter: small leaves with a vein and a dark edge
  for (let i = 0; i < s.litter; i++) {
    const x = rng.int(0, W - 1), y = rng.int(0, W - 1), c = rng.pick(s.leaves), dir = rng.chance(0.5) ? 1 : -1;
    pc.set(x, y, c); pc.set(x + dir, y, c); pc.set(x + dir * 2, y - 1, mixHex(c, 0xffffff, 0.15));
    pc.set(x, y + 1, mixHex(c, 0x000000, 0.4)); pc.set(x + dir, y - 1, mixHex(c, 0xffffff, 0.25));
  }
  // ---- tiny flowers in the turf
  for (let i = 0; i < s.flowers; i++) {
    const x = rng.int(0, W - 1), y = rng.int(0, W - 1);
    if (tileFbm(x, y, W, W, 3, 3, sd + 1) < 0.45) continue;
    const c = rng.pick(s.petals);
    pc.set(x, y, c); pc.set(x + 1, y, mixHex(c, 0xffffff, 0.3)); pc.set(x, y + 1, T[1]);
  }
}

export const TURF: Record<string, TurfStyle> = {
  // the meadow: a dense, healthy turf, moss in the hollows, pastel sparkles of tiny flowers
  meadow: { turf: 0x4c7a36, soil: 0x5c4834, moss: 0x5a7a2c, packed: 0x8a7a5c, cover: 0.82, roots: 2, gravel: 3, litter: 6, mud: 0, flowers: 14,
    leaves: [0x7a8a3a, 0x9a8a44, 0x6a5a30], petals: [0xfff4fc, 0xffd0ec, 0xd8f4ff, 0xfffbd0], seed: 9131 },
  meadowB: { turf: 0x4a7634, soil: 0x5c4834, moss: 0x5a7a2c, packed: 0x8a7a5c, cover: 0.78, roots: 3, gravel: 4, litter: 8, mud: 1, flowers: 10,
    leaves: [0x7a8a3a, 0x9a8a44, 0x6a5a30], petals: [0xfff4fc, 0xffd0ec, 0xd8f4ff, 0xfffbd0], seed: 9141 },
  // the fields: a summer turf with bare soil, straw litter and dried mud
  fields: { turf: 0x55803e, soil: 0x6a5238, moss: 0x5e7a30, packed: 0x9a8662, cover: 0.62, roots: 4, gravel: 6, litter: 14, mud: 1, flowers: 8,
    leaves: [0xb09a50, 0x8a7a3e, 0xc8b068, 0x7a5a30], petals: [0xfcfaf0, 0xf8d040, 0xa88ae2], seed: 4471 },
  fieldsB: { turf: 0x52803c, soil: 0x6a5238, moss: 0x5e7a30, packed: 0x9a8662, cover: 0.55, roots: 5, gravel: 8, litter: 18, mud: 2, flowers: 12,
    leaves: [0xb09a50, 0x8a7a3e, 0xc8b068, 0x7a5a30], petals: [0xfcfaf0, 0xf8d040, 0xa88ae2], seed: 4481 },
  // lawns: mown turf, clover, a few worm casts and pebbles
  lawn: { turf: 0x557e3e, soil: 0x5a4632, moss: 0x4e7034, packed: 0x86765a, cover: 0.86, roots: 1, gravel: 3, litter: 5, mud: 0, flowers: 4,
    leaves: [0x8a6a34, 0x6a5a30, 0xa07a3a], petals: [0xf6f4e8, 0xf0cc3c], seed: 3301 },
  lawnB: { turf: 0x52783c, soil: 0x5a4632, moss: 0x4e7034, packed: 0x86765a, cover: 0.8, roots: 2, gravel: 4, litter: 8, mud: 1, flowers: 6,
    leaves: [0x8a6a34, 0x6a5a30, 0xa07a3a], petals: [0xf6f4e8, 0xf0cc3c], seed: 3311 },
  lawnC: { turf: 0x6a8040, soil: 0x6a5436, moss: 0x5a7034, packed: 0x9a8a62, cover: 0.68, roots: 2, gravel: 5, litter: 10, mud: 2, flowers: 3,
    leaves: [0xb09a50, 0x8a6a34], petals: [0xf0cc3c], seed: 3321 },
  // bare earth (creek banks, beds): packed dirt, gravel, roots and litter, hardly any turf
  dirt: { turf: 0x5a7a3a, soil: 0x6a4e36, moss: 0x5a6a30, packed: 0x8c7656, cover: 0.12, roots: 5, gravel: 14, litter: 10, mud: 2, flowers: 0,
    leaves: [0x8a6a34, 0x6a5a30, 0xa07a3a], petals: [0xffffff], seed: 2201 },
};

/** a painter for the atlas (64 x 64) */
export const turf = (k: keyof typeof TURF) => (pc: PixelCanvas, rng: Rng) => paintTurf(pc, rng, TURF[k]);
