// Ragged holes smashed through drywall. A broken wall segment becomes an
// 'arch' edge (style 'hole_ragged') so it is passable and see-through for
// everything that already understands edges; this module draws the torn
// board around the opening: a jagged lip of wall left at the bottom and top
// and along both sides (each face in the wallpaper of the room it faces, the
// broken edges in raw gypsum), a stud showing in the cavity, pink insulation
// spilling out and strips of paper skin hanging from the top. Shapes are
// seeded by the edge position, so every peer draws the same hole.
import * as THREE from 'three';
import { ModelBuilder, TexSpec } from '../gfx/modelBuilder';
import { MAT } from '../gfx/materials';
import { Rng, hash3 } from '../core/rng';
import { wallDef, wallpaperTex, WALL_H } from './defs';
import type { Zone } from './zone';

export const HOLE_STYLE = 'hole_ragged';

export function faceTex(z: Zone, x: number, y: number, fallback: string, noPaper: boolean): string {
  if (noPaper || !z.inb(x, y)) return fallback;
  const p = z.paper[z.idx(x, y)];
  return p ? wallpaperTex(p) : fallback;
}

/** add one ragged hole frame (edge x,y,side) to mb */
export function buildHole(mb: ModelBuilder, z: Zone, x: number, y: number, side: 0 | 1) {
  const i = z.idx(x, y);
  const wid = side === 0 ? z.wallN[i] : z.wallW[i];
  if (!wid) return;
  const w = wallDef(wid);
  const T = w.thick ?? 0.12, H = w.height ?? WALL_H;
  const baseH = Math.max(z.heightAt(x, y), z.heightAt(side === 1 ? x - 1 : x, side === 0 ? y - 1 : y));
  const ox = side === 1 ? x - 1 : x, oy = side === 0 ? y - 1 : y;
  const tIn = faceTex(z, x, y, w.tex, !!w.noWallpaper), tOut = faceTex(z, ox, oy, w.tex, !!w.noWallpaper);
  const rng = new Rng(hash3(x * 7 + side, y * 13, 4242));
  // what the wall is made of decides the lip: torn board, broken masonry with rebar, snapped planks
  const kind = w.key === 'brick' ? 'brick' : w.sound === 'concrete' ? 'concrete' : w.sound === 'wood' ? 'wood' : 'board';
  const G = kind === 'brick' ? 'dmg_brick_core' : kind === 'concrete' ? 'dmg_concrete_core' : kind === 'wood' ? 'dbr_splinter' : 'dmg_gypsum';
  const spec: TexSpec = side === 0 ? { south: tIn, north: tOut, east: G, west: G, top: G, bottom: G } : { east: tIn, west: tOut, north: G, south: G, top: G, bottom: G };
  mb.swayDefault = side === 0 ? 1 : 2;
  // a piece of board between along a0..a1 and height h0..h1 (local), inset `d` from both faces
  const piece = (a0: number, a1: number, h0: number, h1: number, s: TexSpec = spec, d = 0) => {
    if (a1 - a0 < 0.004 || h1 - h0 < 0.004) return;
    if (side === 0) mb.boxMinMax(x + a0, baseH + h0, y - T / 2 + d, x + a1, baseH + h1, y + T / 2 - d, s, { uvOffset: [0, -baseH], ao: true });
    else mb.boxMinMax(x - T / 2 + d, baseH + h0, y + a0, x + T / 2 - d, baseH + h1, y + a1, s, { uvOffset: [0, -baseH], ao: true });
  };
  const A0 = 0.05, A1 = 0.95, TOP = Math.min(2.2, H);
  // jagged lips: short columns of random height
  const CH = 0.0825;
  const cols = (from: number, to: number, base: number, lo: number, hi: number, up: boolean) => {
    let a = from;
    while (a < to - 1e-3) {
      // brick breaks along the courses (stepped), concrete in coarse lumps, board in fine tears
      const wv = Math.min(to - a, kind === 'brick' ? 0.11 : kind === 'concrete' ? rng.float(0.07, 0.15) : kind === 'wood' ? rng.float(0.1, 0.24) : rng.float(0.045, 0.1));
      const h = kind === 'brick' ? Math.max(1, Math.round(rng.float(lo, hi) / CH)) * CH : rng.float(lo, hi);
      if (up) piece(a, a + wv, base, base + h); else piece(a, a + wv, base - h, base);
      // a loose flake hanging off the lip
      if (rng.chance(0.25)) { const fh = rng.float(0.02, 0.05); if (up) piece(a + wv * 0.2, a + wv * 0.8, base + h, base + h + fh); else piece(a + wv * 0.2, a + wv * 0.8, base - h - fh, base - h); }
      a += wv;
    }
  };
  cols(A0, A1, 0, 0.14, 0.38, true);
  cols(A0, A1, TOP, 0.3, 0.62, false);
  // the side lips: rows of random depth
  const rows = (lo: number, hi: number, fromA: number, dir: 1 | -1) => {
    let h = lo;
    while (h < hi - 1e-3) {
      const hv = Math.min(hi - h, kind === 'brick' ? CH : kind === 'wood' ? 0.15 : rng.float(0.06, 0.16));
      const d = kind === 'brick' ? 0.11 * rng.int(0, 2) + 0.05 : kind === 'wood' ? rng.float(0.04, 0.3) : rng.float(0.05, 0.2);
      if (dir > 0) piece(fromA, fromA + d, h, h + hv); else piece(fromA - d, fromA, h, h + hv);
      h += hv;
    }
  };
  rows(0.1, TOP - 0.25, A0, 1);
  rows(0.1, TOP - 0.25, A1, -1);
  if (kind !== 'board') {
    const R = 'dmg_rebar';
    if (kind === 'concrete' && w.key !== 'tile') {
      // rebar left standing in the hole: bars across from the sides, bent where the concrete let go, and hanging from the top
      for (let k = 0; k < 3; k++) {
        const hh = 0.45 + k * 0.5 + rng.float(-0.08, 0.08), left = rng.chance(0.5);
        const a0 = left ? A0 : A1, len = rng.float(0.15, 0.4), a1 = left ? a0 + len : a0 - len, drop = rng.float(0.04, 0.16);
        piece(Math.min(a0, a1), Math.max(a0, a1), hh, hh + 0.014, R, T / 2 - 0.022);
        const ae = left ? a1 : a1 - 0.014;
        piece(ae, ae + 0.014, hh - drop, hh, R, T / 2 - 0.022);
      }
      for (let k = 0; k < 2; k++) {
        const aa = rng.float(0.25, 0.75), len = rng.float(0.2, 0.55);
        piece(aa, aa + 0.014, TOP - 0.3 - len, TOP - 0.3, R, T / 2 - 0.022);
      }
    }
    if (kind === 'wood') {
      // splinters standing out of the snapped board ends
      for (let k = 0; k < 10; k++) {
        const left = rng.chance(0.5), hh = rng.float(0.2, TOP - 0.4), len = rng.float(0.05, 0.16);
        const a0 = left ? A0 + rng.float(0.04, 0.3) : A1 - rng.float(0.04, 0.3);
        piece(left ? a0 : a0 - len, left ? a0 + len : a0, hh, hh + 0.012, 'dbr_splinter', rng.float(0, T * 0.35));
      }
      const sa = rng.chance(0.5) ? A0 + 0.04 : A1 - 0.08;
      piece(sa, sa + 0.045, 0, rng.float(0.5, 1.2), 'dmg_stud', T * 0.12);
    }
    mb.swayDefault = 0;
    return;
  }
  // a stud standing in the cavity by one side, pink insulation pushing out round it
  const sa = rng.chance(0.5) ? A0 + 0.04 : A1 - 0.08;
  piece(sa, sa + 0.045, 0, TOP, 'dmg_stud', T * 0.12);
  for (let k = 0; k < 5; k++) {
    const hh = rng.float(0.35, 1.7), aa = rng.chance(0.5) ? A0 + rng.float(0.1, 0.2) : A1 - rng.float(0.1, 0.2), s = rng.float(0.04, 0.09);
    piece(aa - s / 2, aa + s / 2, hh, hh + s * 1.3, 'dmg_insul', T * 0.2);
  }
  // torn paper skin hanging from the top lip on both faces
  for (let k = 0; k < 6; k++) {
    const a = rng.float(0.15, 0.85), len = rng.float(0.05, 0.16), wd = rng.float(0.03, 0.07), front = rng.chance(0.5);
    const h1 = TOP - rng.float(0.32, 0.5), h0 = h1 - len;
    const tx = front ? tIn : tOut;
    const off = (T / 2 + 0.002) * (front ? 1 : -1);
    if (side === 0) mb.boxMinMax(x + a, baseH + h0, y + off - 0.002, x + a + wd, baseH + h1, y + off + 0.002, tx, { uvOffset: [0, -baseH] });
    else mb.boxMinMax(x + off - 0.002, baseH + h0, y + a, x + off + 0.002, baseH + h1, y + a + wd, tx, { uvOffset: [0, -baseH] });
  }
  mb.swayDefault = 0;
}

/** one merged mesh of every ragged hole in a zone */
export function buildHolesMesh(z: Zone): THREE.Mesh | null {
  const mb = new ModelBuilder();
  for (const [k, e] of z.edges) {
    if (e.style !== HOLE_STYLE) continue;
    const ti = k >> 1, side = (k & 1) as 0 | 1;
    buildHole(mb, z, ti % z.W, Math.floor(ti / z.W), side);
  }
  if (mb.isEmpty) return null;
  const m = new THREE.Mesh(mb.build(), MAT.wall);
  m.castShadow = true; m.receiveShadow = true;
  m.matrixAutoUpdate = false;
  return m;
}
