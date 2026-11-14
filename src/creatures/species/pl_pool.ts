// The Plunge's inhabitants (round 17, src/world/gen/z_plunge.ts):
//
// GULPER — a leucistic giant salamander four metres long, white as wet plaster with a
//   flush of pink, wrinkled loose skin hanging in folds down both flanks, stubby splayed
//   legs, a long paddle tail, and a flat broad head that is nearly all mouth: the jaws
//   open almost flat back on themselves, rimmed with rows of tiny teeth. Tiny pink eyes.
//   It lies on the bottom of the deep end with only its nostrils at the surface. A unit at
//   the edge or in the water, it explodes up out of the pool and gulps them whole: you can
//   see them in it, a bulge that kicks, while it sinks back with them. Hurt it and it spits
//   you out. On land it is slow.
// GULPER TADPOLE — pale, big-headed tadpoles with a little version of the mouth; they swarm
//   in the shallows, nibble at ankles, and grow.
// FROG PIRANHA — a piranha with a jutting underbite of triangular teeth and a pair of long
//   muscular frog legs. It leaps out of the water in arcs, hops across the wet tile, bites,
//   and hops back in.
// BALLOON PUFFER — a real pufferfish in shape (blunt boxy head, fused beak, fluttering
//   pectoral fins, mottled back, pale belly) with a party balloon's latex shine, a knotted
//   neck at its tail with the string trailing, and two human eyeballs that dart about. It
//   drifts in the air over the pools. Startle it and it swells round with its spines up and a
//   rubber squeak, then either pops (a bang that brings everything in the water) or lets its
//   air out, wrinkled, and darts away.
import * as THREE from 'three';
import { def, newRig, Rig } from '../species';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import type { Creature } from '../creature';
import type { Player } from '../../entities/player';
import type { Zone } from '../../world/zone';
import { Page, OB, V3, bpart, registerPage, applyLook, ramp, clamp01, lerp, damp, bodyRing, galleryPoseParam } from '../kit/beasts';
import { tpart, surfaceMat, eye, flat, hitPlayer, filmMat } from '../kit/oddkit';
import { net, netOf, playersIn, dist, hashId, rng, fx, fxPoll, playAt, localIn, thinkOnce, fakeCreature } from '../behaviors_b';
import { CS, pulse, attack, onPlayerHit } from '../behaviors_a';
import { ruleShown } from '../rules';
import { mixHex, makeRamp } from '../../gfx/pixel';
import { KitDef, KitRig, SkinB, BuildCtx, Page as KPage, V3 as KV3, Wt as KWt, buildKitRig, kitSync, kitPersonalize, hash, norm } from '../kit/humanoids';
import { chain, sac, blade, paintCap } from '../kit/organic';
import { mkBones, skBlob } from '../kit/fungal';
import '../../world/water/poolWater';

const live = () => !!G && !!(G as any).players;
const plungeOf = (z: Zone | null | undefined) => (z?.meta?.plunge ?? null) as null | { deep: [number, number, number, number][]; shallow: [number, number, number, number][]; lair: [number, number] };
const waterAt = (z: Zone | null, x: number, y: number): '' | 'shallow' | 'deep' => (z ? (z.floorAt(Math.floor(x), Math.floor(y))?.water ?? '') : '') as '' | 'shallow' | 'deep';
const angTo = (a: { x: number; z: number }, x: number, z: number) => Math.atan2(z - a.z, x - a.x);
function nearestP(c: Creature, r: number, pred?: (p: Player) => boolean): { p: Player; d: number } | null {
  let best: { p: Player; d: number } | null = null;
  for (const p of playersIn(c.zoneKey)) { if (p.body.dead || (pred && !pred(p))) continue; const d = dist(p, c); if (d < r && (!best || d < best.d)) best = { p, d }; }
  return best;
}
/** a random water tile of a kind near (x, z) */
function waterSpot(z: Zone, x: number, zz: number, r: number, kind: 'shallow' | 'deep' | 'any'): { x: number; z: number } | null {
  for (let t = 0; t < 24; t++) {
    const tx = Math.floor(x + rng.float(-r, r)), ty = Math.floor(zz + rng.float(-r, r));
    const w = waterAt(z, tx + 0.5, ty + 0.5);
    if (!w || (kind !== 'any' && w !== kind)) continue;
    if (z.solid[z.idx(tx, ty)]) continue;
    return { x: tx + 0.5, z: ty + 0.5 };
  }
  return null;
}

// =====================================================================================
// textures
// =====================================================================================
const PG = registerPage(new Page('c_plpool', 224, 160, [
  ['GSKIN', 64, 48], ['GFOLD', 32, 32], ['GMOUTH', 32, 32], ['GTOOTH', 8, 8], ['GEYE', 8, 8], ['GNOSE', 8, 8], ['GTAIL', 32, 24],
  ['TSKIN', 24, 24], ['TFIN', 16, 16],
  ['PSKIN', 32, 32], ['PBELLY', 16, 16], ['PFIN', 16, 16], ['PEYE', 8, 8], ['PTOOTH', 8, 8], ['PLEG', 16, 24],
  ['LATEX', 48, 48], ['KNOT', 16, 16], ['STRING', 4, 16], ['EYEB', 16, 16], ['IRISC', 16, 16], ['SPIKE', 8, 8],
], 3));
const IRIS = [0x4a7ab8, 0x6a8a3a, 0x6a4a2a];
PG.paint((P, v) => {
  // gulper: leucistic white, but not paper: grey-pink mottling under the white, tubercles with darker
  // rims, the lateral-line pores in a dotted row, a pink flush where the skin is thin (the belly band)
  {
    const r = P.R('GSKIN');
    const R = ramp(mixHex(0xe4dcd2, 0xe8d0cc, v * 0.35), 8, 0x5e4c4c, 0.3);
    const L = new Float32Array(r.w * r.h);
    P.fill(r, R, (u, vv, x, y) => {
      const wr = Math.sin(y * 0.95 + Math.sin(x * 0.45) * 2.2) * 0.85 + Math.sin(x * 0.33 + y * 0.21) * 0.45;
      const mott = P.n(r, x, y, 5, 3, 11 + v);
      const belly = Math.min(u, 1 - u) < 0.14 ? -0.8 : 0;
      const l = 4.6 + wr + (mott - 0.5) * 2.6 + belly - (mott < 0.38 ? 1.1 : 0);
      L[y * r.w + x] = l;
      return l;
    }, 0.35);
    // the pink flush round the belly band (thin skin, blood near the surface)
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) { const u = (x + 0.5) / r.w, b = Math.min(u, 1 - u); if (b < 0.2) P.blend(r, x, y, 0xe89a9a, (0.2 - b) * 2.2 * (0.6 + P.n(r, x, y, 3, 2, 15) * 0.5)); }
    // tubercles: pale raised dots with a darker rim
    for (let i = 0; i < 110; i++) { const x = P.rng.int(0, r.w - 1), y = P.rng.int(0, r.h - 1); P.spot(r, x, y, 1.3, 1.1, 0x8a7472, 0.55); P.set(r, x, y, 0xfaf4ee); }
    // the lateral line: a row of dark pores each side, at the flank
    for (const u0 of [0.3, 0.7]) for (let y = 1; y < r.h; y += 3) P.set(r, Math.round(u0 * r.w + Math.sin(y * 0.4) * 0.8), y, 0x3a2a2a);
    for (let i = 0; i < 14; i++) P.walk(r, P.rng.int(0, r.w - 1), P.rng.int(0, r.h - 1), 14, 1, 0.2, 0xd8a8a8, 0.45, 0.5);
    for (let y = 2; y < r.h; y += 6) P.glint(r, (y * 11) % r.w, y, 4, 0xffffff, 0.4);
    void L;
  }
  {
    const r = P.R('GFOLD');
    P.fill(r, ramp(0xe8d8d0, 7, 0x6a5050, 0.3), (u, vv, x, y) => 3.4 + Math.sin(x * 1.1) * 1.6 + (P.n(r, x, y, 3, 2, 21) - 0.5) * 1.2 - vv * 0.8, 0.4);
    // the fold edges flush pink and wet
    for (let y = r.h - 6; y < r.h; y++) for (let x = 0; x < r.w; x++) P.blend(r, x, y, 0xe89090, 0.35 * ((y - (r.h - 6)) / 6));
    for (let y = 3; y < r.h; y += 7) P.glint(r, (y * 5) % r.w, y, 3, 0xffffff, 0.5);
  }
  {
    const r = P.R('GMOUTH');
    P.fill(r, ramp(0xe08890, 8, 0x4a1018, 0.3), (u, vv, x, y) => 3 + Math.sin(y * 0.8) * 0.9 + (P.n(r, x, y, 3, 2, 31) - 0.5) * 1.4 - Math.abs(u - 0.5) * 2.4, 0.4);
    for (let i = 0; i < 6; i++) P.walk(r, P.rng.int(0, r.w - 1), P.rng.int(0, r.h - 1), 10, 0, 1, 0x8a2030, 0.6, 0.5);
    for (let y = 2; y < r.h; y += 4) P.glint(r, (y * 7) % r.w, y, 3, 0xffffff, 0.55);
  }
  flat(P, P.R('GTOOTH'), 0xf4f0e0, 0.05);
  eye(P, P.R('GEYE'), 0xd85060, { pupil: 0x3a0810, sclera: 0xd88890 });
  { const r = P.R('GNOSE'); P.fill(r, ramp(0x4a2a2a, 4, 0x140606, 0.3), (u, vv) => 1 + vv, 0.3); }
  {
    const r = P.R('GTAIL');
    P.fill(r, ramp(0xe4dad0, 7, 0x6a5656, 0.3), (u, vv, x, y) => 4 + Math.sin(y * 1.4) * 0.6 + (P.n(r, x, y, 4, 2, 41) - 0.5) * 2.2 - vv * 0.8, 0.4);
    for (let i = 0; i < 30; i++) P.spot(r, P.rng.int(0, r.w), P.rng.int(0, r.h), 1, 1, 0x8a7070, 0.4);
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) if (y < 3) P.blend(r, x, y, 0xe8a8a8, 0.4);
  }
  // tadpole: translucent-looking pale skin with the organs showing pink through it
  {
    const r = P.R('TSKIN');
    P.fill(r, ramp(0xeee4dc, 6, 0x8a7a7a, 0.4), (u, vv, x, y) => 3.4 + (P.n(r, x, y, 2, 2, 51) - 0.5) * 1.4, 0.4);
    P.spot(r, r.w * 0.5, r.h * 0.6, r.w * 0.2, r.h * 0.2, 0xd08a8a, 0.5);
  }
  { const r = P.R('TFIN'); P.fill(r, ramp(0xf4ece8, 5, 0xa89898, 0.4), (u, vv, x) => 3 + (x % 3 === 0 ? -1 : 0), 0.3); }
  // piranha: dark silver back with speckles, a red-orange belly
  {
    const r = P.R('PSKIN');
    P.fill(r, ramp(0x8a9498, 7, 0x2a3034, 0.45), (u, vv, x, y) => 2 + vv * 3 + (P.n(r, x, y, 3, 2, 61) - 0.5) * 1.2 + ((x + y) % 5 === 0 ? -0.8 : 0), 0.4);
    for (let i = 0; i < 40; i++) P.set(r, P.rng.int(0, r.w - 1), P.rng.int(Math.floor(r.h * 0.2), r.h - 1), 0x1a2024);
    for (let y = 0; y < Math.floor(r.h * 0.35); y++) for (let x = 0; x < r.w; x++) P.blend(r, x, r.h - 1 - y, 0xe0502a, 0.55 * (1 - y / (r.h * 0.35)));
  }
  { const r = P.R('PBELLY'); P.fill(r, ramp(0xe85a30, 6, 0x6a1a10, 0.4), (u, vv, x, y) => 2.8 + (P.n(r, x, y, 2, 2, 62) - 0.5), 0.4); }
  { const r = P.R('PFIN'); P.fill(r, ramp(0x6a7478, 5, 0x1a2024, 0.4), (u, vv, x) => 2 + (x % 2 ? 1 : 0) + vv, 0.3); }
  eye(P, P.R('PEYE'), 0xc8a020, { pupil: 0x050505, sclera: 0x1a1a14 });
  flat(P, P.R('PTOOTH'), 0xf8f4e8, 0.03);
  {
    const r = P.R('PLEG');
    P.fill(r, ramp(0x6a8a5a, 6, 0x1a2a14, 0.4), (u, vv, x, y) => 2.4 + Math.cos(u * 6.28) * 1.2 + (P.n(r, x, y, 3, 2, 63) - 0.5) * 1.4, 0.4);
    for (let i = 0; i < 14; i++) P.spot(r, P.rng.int(0, r.w), P.rng.int(0, r.h), 1.2, 1, 0x2a3a1a, 0.7, true);
  }
  // the puffer's skin, wrapped round the body (u round it from the belly, v tail to snout): a mottled, spotted
  // back, a pale belly, a yellow line between, and the hard shine of balloon latex over all of it
  {
    const r = P.R('LATEX');
    const BACK = [0x8a8448, 0x5c5850, 0xa88c58][v % 3], SPOT = [0x2a2414, 0xf2eee0, 0x4a3018][v % 3];
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
      const u = (x + 0.5) / r.w, vv = (y + 0.5) / r.h, top = -Math.cos(u * Math.PI * 2);
      const m = P.n(r, x, y, 4, 3, 71 + v);
      let col = mixHex(mixHex(BACK, 0x1a1a10, 0.35 - top * 0.25), mixHex(BACK, 0xffffff, 0.25), m * 0.8);
      const belly = clamp01((-top - 0.05) / 0.35);
      col = mixHex(col, mixHex(0xf2ece0, 0xe0d8c8, m * 0.5), belly);
      if (Math.abs(top + 0.08) < 0.07) col = mixHex(col, 0xd8b850, 0.55);
      if (vv > 0.9) col = mixHex(col, 0xd8d0c0, (vv - 0.9) * 4);
      P.set(r, x, y, col);
    }
    for (let i = 0; i < 46; i++) {
      const x = P.rng.int(0, r.w - 1), y = P.rng.int(2, r.h - 4), u = (x + 0.5) / r.w, top = -Math.cos(u * Math.PI * 2);
      if (top < 0.05) continue;
      if (v % 3 === 2) P.spot(r, x, y, 2.6, 1.4, SPOT, 0.7, true);
      else P.spot(r, x, y, v % 3 === 1 ? 0.9 : 1.3, v % 3 === 1 ? 0.9 : 1.2, SPOT, 0.9);
    }
    if (v % 3 === 1) for (let i = 0; i < 6; i++) P.walk(r, P.rng.int(0, r.w - 1), P.rng.int(0, r.h - 1), 10, 0, 1, 0x2a2620, 0.6, 0.4);
    // the latex shine: a broad streak and sharp specks
    for (let y = 4; y < r.h - 4; y++) P.blend(r, Math.round(r.w * 0.5 + Math.sin(y * 0.3) * 2), y, 0xffffff, 0.35);
    for (let i = 0; i < 16; i++) P.blend(r, P.rng.int(0, r.w - 1), P.rng.int(0, r.h - 1), 0xffffff, 0.8);
  }
  { const r = P.R('KNOT'), c0 = [0x8a8448, 0x5c5850, 0xa88c58][v % 3]; P.fill(r, ramp(c0, 6, mixHex(c0, 0x000000, 0.6), 0.3), (u, vv, x, y) => 2 + Math.sin(x * 1.5 + y) * 1.2 + vv, 0.4); for (let i = 0; i < 6; i++) P.blend(r, P.rng.int(0, r.w - 1), P.rng.int(0, r.h - 1), 0xffffff, 0.7); }
  { const r = P.R('STRING'); for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) P.set(r, x, y, y % 3 ? 0xf0ece0 : 0xc8c0b0); }
  // a human eyeball: the white, wet, with red veins running in from the back
  {
    const r = P.R('EYEB');
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) P.set(r, x, y, mixHex(0xfaf6f0, 0xe8cfc8, Math.abs((y + 0.5) / r.h - 0.5) * 1.2 + P.n(r, x, y, 2, 2, 81) * 0.3));
    for (let i = 0; i < 9; i++) P.walk(r, P.rng.int(0, r.w - 1), P.rng.int(0, r.h - 1), 6, P.rng.float(-1, 1), P.rng.float(-1, 1), 0xc83040, 0.7, 0.9, 0.35);
  }
  // the iris and pupil, painted for a cone seen end-on: v=0 the rim of the iris, v=1 the centre
  {
    const r = P.R('IRISC');
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
      const vv = 1 - (y + 0.5) / r.h, u = (x + 0.5) / r.w;
      let c = vv < 0.12 ? mixHex(IRIS[v % 3], 0x101010, 0.7) : mixHex(IRIS[v % 3], 0xffffff, 0.15 + 0.2 * Math.max(0, Math.sin(u * 60)) * (1 - vv));
      if (vv > 0.45 && vv < 0.55) c = mixHex(c, 0xd8b060, 0.4);
      if (vv > 0.62) c = 0x060606;
      P.set(r, x, y, c);
    }
  }
  { const r = P.R('SPIKE'); P.fill(r, ramp(0xe8e0c8, 5, 0x5a4a30, 0.5), (u, vv) => 1 + vv * 3, 0.3); }
});

// =====================================================================================
// GULPER
// =====================================================================================
// ------------------------------------------------------------------ the Gulper: one skinned, sculpted body (kit/humanoids)
// Bones run the spine from the tail tip to the neck, the skull and the jaw hinge at the neck, the
// dewlap hangs off the throat, the belly bone swells round what it has swallowed, the lip lobes pucker.
const GV = 3;
const SP_Z: [string, number][] = [['t4', -2.85], ['t3', -2.42], ['t2', -1.98], ['t1', -1.5], ['t0', -1.0], ['pelvis', -0.45], ['chest', 0.45], ['neck', 0.95]];
function gBones() {
  const A: [string, string, KV3, boolean?][] = [['base', '', [0, 0, 0]]];
  A.push(['pelvis', 'base', [0, 0.34, -0.45]], ['belly', 'pelvis', [0, 0.27, 0.05]], ['chest', 'pelvis', [0, 0.36, 0.45]], ['neck', 'chest', [0, 0.37, 0.95], true]);
  A.push(['skull', 'neck', [0, 0.4, 1.16], true], ['jaw', 'neck', [0, 0.33, 1.16]], ['dew', 'neck', [0, 0.22, 1.02]]);
  A.push(['lobeL', 'skull', [0.6, 0.34, 1.42]], ['lobeR', 'skull', [-0.6, 0.34, 1.42]]);
  A.push(['t0', 'pelvis', [0, 0.34, -1.0], true], ['t1', 't0', [0, 0.33, -1.5]], ['t2', 't1', [0, 0.32, -1.98], true], ['t3', 't2', [0, 0.31, -2.42]], ['t4', 't3', [0, 0.3, -2.85]]);
  for (const [s, k] of [['L', 1], ['R', -1]] as const) {
    A.push(['uF' + s, 'chest', [k * 0.5, 0.3, 0.55]], ['lF' + s, 'uF' + s, [k * 0.82, 0.2, 0.62], true], ['hF' + s, 'lF' + s, [k * 0.96, 0.05, 0.7]]);
    A.push(['uB' + s, 'pelvis', [k * 0.48, 0.3, -0.52]], ['lB' + s, 'uB' + s, [k * 0.8, 0.2, -0.58], true], ['hB' + s, 'lB' + s, [k * 0.94, 0.05, -0.64]]);
  }
  return mkBones(A);
}
function gLayout(p: KPage) {
  p.reg('BODY', 128, 64); p.reg('HEAD', 64, 48); p.reg('JAW', 64, 32); p.reg('FOLD', 64, 32); p.reg('MOUTH', 32, 32); p.reg('DEW', 32, 32);
  p.reg('LIMB', 32, 32); p.reg('FIN', 64, 16); p.reg('TOOTH', 8, 8); p.reg('EYEM', 8, 8); p.reg('EYEW', 8, 8); p.reg('LEECH', 16, 16); p.reg('LUMP', 16, 16); p.reg('CAP', 8, 8);
  p.reg('TONG', 32, 16); p.reg('GUM', 32, 8); p.reg('WART', 16, 16); p.reg('CYST', 8, 8); p.reg('WORM', 8, 16); p.reg('LID', 32, 16);
}
/** spine weights at z: the two nearest spine bones, blended; the belly joins in round the middle */
function gW(bi: (n: string) => number, z: number, belly = 0): KWt {
  let a = 0;
  while (a + 1 < SP_Z.length && SP_Z[a + 1][1] <= z) a++;
  const b = Math.min(SP_Z.length - 1, a + 1);
  const t = b === a ? 0 : Math.max(0, Math.min(1, (z - SP_Z[a][1]) / (SP_Z[b][1] - SP_Z[a][1])));
  const kb = belly * Math.exp(-(z * z) / 0.35);
  const w: KWt = [bi(SP_Z[a][0]), (1 - t) * (1 - kb)];
  if (b !== a) w.push(bi(SP_Z[b][0]), t * (1 - kb));
  if (kb > 0.01) w.push(bi('belly'), kb);
  return w;
}
function gBuild(B: SkinB, x: BuildCtx) {
  const bi = x.bi, R = x.R;
  // ---- the body, tail tip to the throat, one loft: a bloated, sagging trunk, a fat tapering paddle of a tail
  const rows: [number, number, number, number][] = [ // z, y, half width, half height
    [-2.88, 0.3, 0.02, 0.06], [-2.65, 0.3, 0.05, 0.15], [-2.35, 0.31, 0.08, 0.2], [-2.05, 0.31, 0.11, 0.23], [-1.75, 0.32, 0.15, 0.24], [-1.45, 0.33, 0.21, 0.24],
    [-1.18, 0.33, 0.31, 0.23], [-0.92, 0.34, 0.45, 0.24], [-0.62, 0.34, 0.56, 0.25], [-0.3, 0.34, 0.62, 0.27], [0, 0.34, 0.65, 0.27], [0.3, 0.35, 0.62, 0.26],
    [0.58, 0.36, 0.57, 0.24], [0.82, 0.36, 0.55, 0.21], [1.0, 0.37, 0.57, 0.19], [1.16, 0.38, 0.6, 0.17],
  ];
  const lump = (a: number, z: number, a0: number, z0: number, r: number, h: number) => h * Math.exp(-(((a - a0) ** 2) / (r * 1.2) + ((z - z0) ** 2) / (r * 0.4)) * 4);
  sac(B, R('BODY'), 1, rows.map((r) => [0, r[1], r[0]]), rows.map((r) => [r[2], r[3]]), rows.map((r) => gW(bi, r[0], 0.55)), {
    n: 22, start: true, end: false,
    bump: (a, t) => {
      const z = rows[0][0] + t * (rows[rows.length - 1][0] - rows[0][0]);
      const side = Math.exp(-((Math.abs(a) - Math.PI / 2) ** 2) / 0.12);
      // the loose skin folds bunching along both flanks, the belly sagging, wrinkles over the back
      let k = side * (0.09 * Math.sin(z * 17 + Math.sin(z * 5) * 2) + 0.05 * Math.sin(z * 41)) + Math.max(0, -Math.cos(a)) * 0.12 * Math.exp(-(z * z) / 0.6);
      k += Math.max(0, Math.cos(a)) * 0.025 * Math.sin(a * 13 + z * 23);
      // tumour-like lumps
      k += lump(a, z, 1.1, 0.25, 0.25, 0.22) + lump(a, z, -1.5, -0.55, 0.2, 0.18) + lump(a, z, 0.4, -1.2, 0.15, 0.16) + lump(a, z, -0.9, 0.7, 0.18, 0.14);
      return k;
    },
  });
  // ---- the head: the skull melts back into the neck; a broad spade, flat-bottomed at the mouth line
  const hz = [1.0, 1.2, 1.42, 1.66, 1.88, 2.06, 2.2, 2.27], hy = [0.4, 0.43, 0.44, 0.43, 0.42, 0.4, 0.38, 0.37];
  const hrx = [0.58, 0.68, 0.76, 0.78, 0.72, 0.58, 0.38, 0.12], hry = [0.17, 0.17, 0.16, 0.14, 0.12, 0.1, 0.08, 0.04];
  const skW = (z: number): KWt => (z < 1.1 ? [bi('neck'), 0.6, bi('skull'), 0.4] : [bi('skull'), 1]);
  sac(B, R('HEAD'), 2, hz.map((z, i) => [0, hy[i], z]), hz.map((_, i) => [hrx[i], hry[i]]), hz.map(skW), {
    n: 22, start: false, end: true,
    bump: (a, t) => (Math.cos(a) < 0 ? -0.72 * (-Math.cos(a)) ** 0.7 : 0) + Math.max(0, Math.cos(a)) * (0.03 * Math.sin(a * 17 + t * 30) + 0.06 * Math.exp(-((a - 0.9) ** 2) / 0.05) * Math.exp(-((t - 0.45) ** 2) / 0.02)),
  });
  // ---- the lower jaw: a plate rounded underneath, flat on top, hinged at the neck
  const jz = [1.0, 1.24, 1.5, 1.76, 1.98, 2.14, 2.2], jy = [0.33, 0.31, 0.3, 0.3, 0.3, 0.3, 0.3];
  const jrx = [0.56, 0.66, 0.72, 0.7, 0.58, 0.36, 0.1], jry = [0.12, 0.11, 0.1, 0.09, 0.08, 0.06, 0.03];
  const jaW = (z: number): KWt => (z < 1.1 ? [bi('neck'), 0.55, bi('jaw'), 0.45] : [bi('jaw'), 1]);
  sac(B, R('JAW'), 3, jz.map((z, i) => [0, jy[i], z]), jz.map((_, i) => [jrx[i], jry[i]]), jz.map(jaW), {
    n: 20, start: false, end: true, bump: (a) => (Math.cos(a) > 0 ? -0.75 * Math.cos(a) ** 0.7 : 0.05 * Math.sin(a * 11)),
  });
  // the mouth inside: the palate, the floor of the mouth and a fat pale tongue
  skBlob(B, R('MOUTH'), 4, [0, 0.4, 1.68], [0.62, 0.035, 0.5], { n: 16, rings: 6, w: [bi('skull'), 1] });
  skBlob(B, R('MOUTH'), 5, [0, 0.335, 1.66], [0.6, 0.03, 0.48], { n: 16, rings: 6, w: [bi('jaw'), 1] });
  // a fat fleshy tongue, grooved down the middle, lumpy
  skBlob(B, R('TONG'), 6, [0, 0.365, 1.56], [0.3, 0.075, 0.38], { n: 14, rings: 8, w: [bi('jaw'), 1], bump: (d) => 0.07 * Math.sin(d[2] * 9 + d[0] * 4) - (d[1] > 0.3 ? 0.35 * Math.exp(-(d[0] * d[0]) / 0.02) : 0) });
  // ragged fleshy lips over pale gums, rows of needle teeth
  const lipPath = (y: number, rx: number, rz: number, z0: number, n: number, span: number): KV3[] => Array.from({ length: n }, (_, i) => { const a = (i / (n - 1) - 0.5) * span; return [Math.sin(a) * rx, y, z0 + Math.cos(a) * rz]; });
  const up = lipPath(0.38, 0.74, 0.86, 1.36, 21, Math.PI * 1.08), lo = lipPath(0.325, 0.68, 0.8, 1.36, 19, Math.PI * 1.02);
  sac(B, R('FOLD'), 7, up, up.map((_, i) => [0.05 + 0.02 * hash(i, 3), 0.04 + 0.02 * hash(i, 4)] as [number, number]), up.map((p) => skW(p[2])), { n: 7, bump: (a, t) => 0.25 * Math.sin(t * 61) * Math.max(0, -Math.cos(a)) });
  sac(B, R('FOLD'), 8, lo, lo.map((_, i) => [0.045 + 0.02 * hash(i, 5), 0.035] as [number, number]), lo.map((p) => jaW(p[2])), { n: 7, bump: (a, t) => 0.25 * Math.sin(t * 53 + 1) * Math.max(0, Math.cos(a)) });
  for (let i = 0; i < 44; i++) {
    const a = (i / 43 - 0.5) * Math.PI * 1.02, r = 0.66, rz = 0.78;
    const b0: KV3 = [Math.sin(a) * r, 0.37, 1.36 + Math.cos(a) * rz];
    sac(B, R('TOOTH'), 9, [b0, [b0[0] * 0.98, 0.31 - (i % 3) * 0.008, b0[2] - 0.01]], [[0.011, 0.011], [0.0015, 0.0015]], [[bi('skull'), 1], [bi('skull'), 1]], { n: 4, start: false, end: false });
  }
  for (let i = 0; i < 40; i++) {
    const a = (i / 39 - 0.5) * Math.PI, r = 0.6, rz = 0.72;
    const b0: KV3 = [Math.sin(a) * r, 0.33, 1.38 + Math.cos(a) * rz];
    sac(B, R('TOOTH'), 10, [b0, [b0[0] * 0.98, 0.39 + (i % 2) * 0.008, b0[2] - 0.01]], [[0.01, 0.01], [0.0015, 0.0015]], [[bi('jaw'), 1], [bi('jaw'), 1]], { n: 4, start: false, end: false });
  }
  // the lip lobes at the corners of the mouth: they close in to make the mouth a tube when it sucks
  for (const [s, k] of [['L', 1], ['R', -1]] as const) skBlob(B, R('FOLD'), 11, [k * 0.64, 0.355, 1.45], [0.08, 0.075, 0.22], { n: 10, rings: 6, w: [bi('lobe' + s), 1], bump: (d) => 0.12 * Math.sin(d[2] * 12) });
  // the eyes: far apart on top, one milky and blind, the other tiny and wet in a pink socket
  skBlob(B, R('HEAD'), 12, [0.42, 0.535, 1.62], [0.075, 0.035, 0.07], { n: 10, rings: 5, w: [bi('skull'), 1] });
  skBlob(B, R('EYEM'), 13, [0.42, 0.56, 1.63], [0.05, 0.032, 0.05], { n: 10, rings: 6, w: [bi('skull'), 1], emis: 0.2 });
  skBlob(B, R('FOLD'), 14, [-0.42, 0.53, 1.62], [0.05, 0.03, 0.05], { n: 10, rings: 5, w: [bi('skull'), 1] });
  skBlob(B, R('EYEW'), 15, [-0.42, 0.55, 1.63], [0.024, 0.022, 0.024], { n: 8, rings: 5, w: [bi('skull'), 1], emis: 0.35 });
  for (const k of [-1, 1]) skBlob(B, R('LEECH'), 16, [k * 0.09, 0.46, 2.18], [0.025, 0.016, 0.02], { n: 7, rings: 4, w: [bi('skull'), 1] });
  // the dewlap: a heavy bag of throat skin that swings and drops when it sucks
  skBlob(B, R('DEW'), 17, [0, 0.12, 1.02], [0.46, 0.17, 0.44], { n: 16, rings: 9, w: (p) => (p[1] > 0.2 ? [bi('neck'), 0.6, bi('dew'), 0.4] : [bi('dew'), 1]), bump: (d) => 0.1 * Math.sin(d[0] * 13 + d[2] * 5) * Math.max(0, -d[1]) });
  // thick loose folds draping and overlapping down both flanks like melted wax
  for (const [s, k] of [['L', 1], ['R', -1]] as const) for (let layer = 0; layer < 3; layer++) {
    const pts: KV3[] = [], wd: number[] = [], sd: KV3[] = [], ws: KWt[] = [];
    for (let i = 0; i <= 18; i++) {
      const z = -1.05 + i * (2.05 / 18) + layer * 0.05;
      const row = rows.reduce((b, r) => (Math.abs(r[0] - z) < Math.abs(b[0] - z) ? r : b), rows[0]);
      const sag = Math.sin((i / 18) * Math.PI);
      pts.push([k * row[2] * (0.9 - layer * 0.06), row[1] + 0.04 - layer * 0.07, z]);
      wd.push(0.16 + sag * 0.14 + 0.05 * Math.sin(i * 1.7 + layer * 2));
      sd.push(norm([k * (0.55 - layer * 0.1), -1, 0.08 * Math.sin(i * 2.1 + layer)]));
      ws.push(gW(bi, z, 0.4));
    }
    blade(B, R('FOLD'), pts, wd, sd, ws, { edge: 0.55, seed: 11 + layer * 7 + (k > 0 ? 0 : 50) });
    void s;
  }
  // a fleshy crest along the back of the tail
  {
    const pts: KV3[] = [], wd: number[] = [], ws: KWt[] = [];
    for (let i = 0; i <= 14; i++) { const z = -2.8 + i * (1.8 / 14), row = rows.reduce((b, r) => (Math.abs(r[0] - z) < Math.abs(b[0] - z) ? r : b), rows[0]); pts.push([0, row[1] + row[3] * 0.85, z]); wd.push(0.05 + Math.sin((i / 14) * Math.PI) * 0.12); ws.push(gW(bi, z)); }
    blade(B, R('FIN'), pts, wd, [0, 1, 0], ws, { edge: 0.6, seed: 91 });
  }
  // stubby splayed limbs with swollen, webbed fingers
  for (const [s, k] of [['L', 1], ['R', -1]] as const) for (const fb of ['F', 'B']) {
    const h = x.rest('h' + fb + s);
    chain(B, x, R('LIMB'), 20, { bones: ['u' + fb + s, 'l' + fb + s, 'h' + fb + s], tip: [h[0] + k * 0.06, 0.04, h[2] + 0.02], r: [0.13, 0.075], n: 9, knuckle: 0.35, bump: (a, t) => 0.06 * Math.sin(a * 5 + t * 20) });
    for (let f = 0; f < 4; f++) {
      const a = -0.65 + f * 0.43 + (fb === 'B' ? -0.3 : 0.2), dir: KV3 = [k * Math.cos(a) * 0.9, -0.15, Math.sin(a) * 0.9 + 0.3];
      const L = 0.16 + (f === 1 || f === 2 ? 0.04 : 0);
      const p0: KV3 = [h[0] + k * 0.03, 0.05, h[2]], p1: KV3 = [p0[0] + dir[0] * L * 0.5, 0.035, p0[2] + dir[2] * L * 0.5], p2: KV3 = [p0[0] + dir[0] * L, 0.03, p0[2] + dir[2] * L];
      sac(B, R('LIMB'), 21, [p0, p1, p2], [[0.035, 0.03], [0.03, 0.025], [0.045, 0.038]], [[bi('h' + fb + s), 1], [bi('h' + fb + s), 1], [bi('h' + fb + s), 1]], { n: 6 });
    }
    blade(B, R('FOLD'), [[h[0] + k * 0.06, 0.04, h[2] - 0.05], [h[0] + k * 0.08, 0.04, h[2] + 0.1]], [0.12, 0.12], [k, -0.15, 0.3], [[bi('h' + fb + s), 1], [bi('h' + fb + s), 1]], { edge: 0.3, seed: 31 });
  }
  // the torn stub of a gill behind the jaw, old and ragged
  sac(B, R('FOLD'), 22, [[0.5, 0.36, 0.98], [0.62, 0.4, 0.94], [0.7, 0.42, 0.9]], [[0.06, 0.05], [0.045, 0.035], [0.05, 0.03]], [[bi('neck'), 1], [bi('neck'), 1], [bi('neck'), 1]], { n: 7, bump: (a) => 0.3 * Math.sin(a * 7) });
  // leeches clinging to it: black, glossy, ringed
  const leech = (p: KV3, d: KV3, bone: string) => sac(B, R('LEECH'), 23, [p, [p[0] + d[0] * 0.5, p[1] + d[1] * 0.5, p[2] + d[2] * 0.5], [p[0] + d[0], p[1] + d[1], p[2] + d[2]]], [[0.022, 0.016], [0.034, 0.024], [0.018, 0.014]], [[bi(bone), 1], [bi(bone), 1], [bi(bone), 1]], { n: 7 });
  leech([0.6, 0.36, 0.2], [0.02, -0.06, 0.14], 'chest'); leech([-0.62, 0.33, -0.35], [-0.02, -0.07, -0.12], 'pelvis'); leech([0.16, 0.48, -1.6], [0.05, 0.02, -0.15], 't1'); leech([-0.3, 0.56, 1.3], [-0.08, 0, 0.1], 'skull');
  leech([0.66, 0.36, 1.62], [0.03, -0.05, 0.12], 'skull');
  // ---------------- the face, up close
  // the top of the head at (x, z): the skull loft's upper half
  const lerpA = (A: number[], z: number) => { let i = 0; while (i + 2 < hz.length && hz[i + 1] < z) i++; const t = Math.max(0, Math.min(1, (z - hz[i]) / (hz[i + 1] - hz[i]))); return A[i] + (A[i + 1] - A[i]) * t; };
  const topY = (xx: number, z: number) => { const rx = lerpA(hrx, z), ry = lerpA(hry, z), q = Math.min(0.98, Math.abs(xx) / Math.max(0.05, rx)); return lerpA(hy, z) + ry * Math.sqrt(1 - q * q); };
  const EYES: [number, number][] = [[0.42, 1.62], [-0.42, 1.62]];
  // warts: raised tubercles crowded over the skull, thickest between and round the eyes
  for (let i = 0; i < 70; i++) {
    const z = 1.05 + hash(i, 201) * 1.1, rx = lerpA(hrx, z), xx = (hash(i, 202) * 2 - 1) * rx * 0.86;
    if (EYES.some(([ex, ez]) => Math.hypot(xx - ex, z - ez) < 0.085)) continue;
    const r = 0.012 + hash(i, 203) * 0.02 + (EYES.some(([ex, ez]) => Math.hypot(xx - ex, z - ez) < 0.2) ? 0.008 : 0);
    skBlob(B, R('WART'), 24, [xx, topY(xx, z) - r * 0.35, z], [r, r * 0.7, r], { n: 7, rings: 4, w: [bi('skull'), 1], bump: (d) => 0.15 * Math.sin(d[0] * 9 + d[2] * 7) });
  }
  // wrinkled, warty skin heaped round each eye in folds: two crescents, the brow heavier; the blind eye
  // half shut under a swollen lid
  for (const [k, [ex, ez]] of EYES.map((e, i) => [i, e] as const)) {
    const blind = k === 0;
    for (let ring = 0; ring < 3; ring++) {
      const rr = 0.075 + ring * 0.035 + (blind ? 0.01 : 0), pts: KV3[] = [], rad: [number, number][] = [], ws: KWt[] = [];
      const a0 = ring === 2 ? -0.4 : -2.4, a1 = ring === 2 ? 3.5 : 2.4;
      for (let j = 0; j <= 9; j++) {
        const a = a0 + (a1 - a0) * (j / 9), px = ex + Math.sin(a) * rr * (ex > 0 ? 1 : -1), pz = ez + Math.cos(a) * rr;
        pts.push([px, topY(px, pz) + 0.004 - ring * 0.004, pz]);
        const fat = (0.014 + 0.008 * Math.sin((j / 9) * Math.PI)) * (1 + (blind ? 0.3 : 0) - ring * 0.18);
        rad.push([fat, fat * 0.75]); ws.push([bi('skull'), 1]);
      }
      sac(B, R('LID'), 25, pts, rad, ws, { n: 6, bump: (a, t) => 0.25 * Math.sin(t * 40 + ring * 2) * Math.max(0, Math.cos(a)) + 0.12 * Math.sin(a * 5) });
    }
    if (blind) sac(B, R('LID'), 26, [[ex - 0.06, 0.57, ez + 0.02], [ex, 0.585, ez + 0.035], [ex + 0.06, 0.57, ez + 0.02]], [[0.025, 0.018], [0.045, 0.028], [0.025, 0.018]], [[bi('skull'), 1], [bi('skull'), 1], [bi('skull'), 1]], { n: 8, bump: (a, t) => 0.2 * Math.sin(t * 25) });
  }
  // the lip flaps: a ragged frill of loose skin hanging along the upper lip and over the jaw line
  for (const k of [-1, 1]) {
    const pts: KV3[] = [], wd: number[] = [], sd: KV3[] = [], ws: KWt[] = [];
    for (let j = 0; j <= 14; j++) {
      const a = k * (0.12 + (j / 14) * 1.45), px = Math.sin(a) * 0.765, pz = 1.36 + Math.cos(a) * 0.88;
      pts.push([px, 0.405, pz]); wd.push(0.035 + 0.04 * Math.sin((j / 14) * Math.PI) + 0.02 * hash(j, k > 0 ? 211 : 212));
      sd.push(norm([Math.sin(a) * 0.5, -1, Math.cos(a) * 0.5])); ws.push(skW(pz));
    }
    blade(B, R('FOLD'), pts, wd, sd, ws, { edge: 0.9, seed: k > 0 ? 213 : 214 });
  }
  // swollen pale gums along both tooth rows, the needles set in them
  sac(B, R('GUM'), 27, lipPath(0.372, 0.665, 0.785, 1.36, 23, Math.PI * 1.04), Array.from({ length: 23 }, (_, i) => [0.022 + 0.006 * hash(i, 221), 0.016] as [number, number]), lipPath(0.372, 0.665, 0.785, 1.36, 23, Math.PI * 1.04).map((pp) => skW(pp[2])), { n: 6, bump: (a, t) => 0.2 * Math.sin(t * 70) });
  sac(B, R('GUM'), 28, lipPath(0.338, 0.6, 0.725, 1.38, 21, Math.PI), Array.from({ length: 21 }, (_, i) => [0.02 + 0.006 * hash(i, 222), 0.015] as [number, number]), lipPath(0.338, 0.6, 0.725, 1.38, 21, Math.PI).map((pp) => jaW(pp[2])), { n: 6, bump: (a, t) => 0.2 * Math.sin(t * 64 + 1) });
  // an inner row of tiny backward-hooked teeth on the palate
  for (let i = 0; i < 30; i++) {
    const a = (i / 29 - 0.5) * Math.PI * 0.95, b0: KV3 = [Math.sin(a) * 0.48, 0.385, 1.42 + Math.cos(a) * 0.58];
    sac(B, R('TOOTH'), 9, [b0, [b0[0] * 0.97, 0.36, b0[2] - 0.025]], [[0.007, 0.007], [0.001, 0.001]], [[bi('skull'), 1], [bi('skull'), 1]], { n: 4, start: false, end: false });
  }
  // parasites in the skin: cysts swelling under it, and pale worms half out of the flesh round the blind eye and the jaw
  const CY: [number, number, number][] = [[0.6, 0.42, 1.3], [-0.55, 0.47, 1.85], [0.25, 0.56, 1.25], [0.62, 0.36, 1.9], [-0.66, 0.38, 1.2]];
  for (const [cx, cy, cz] of CY) skBlob(B, R('CYST'), 29, [cx, cy, cz], [0.03, 0.022, 0.035], { n: 8, rings: 5, w: [bi('skull'), 1] });
  const worm = (p0: KV3, d: KV3, bone: string, seed: number) => {
    const pts: KV3[] = []; for (let j = 0; j <= 5; j++) { const t = j / 5; pts.push([p0[0] + d[0] * t + Math.sin(t * 5 + seed) * 0.012, p0[1] + d[1] * t + Math.sin(t * 3.1) * 0.02, p0[2] + d[2] * t + Math.cos(t * 4 + seed) * 0.012]); }
    sac(B, R('WORM'), 30, pts, pts.map((_, j) => { const r = 0.008 * (1 - j / 7); return [r, r] as [number, number]; }), pts.map(() => [bi(bone), 1] as KWt), { n: 5 });
  };
  worm([0.49, 0.56, 1.58], [0.06, 0.05, -0.02], 'skull', 1); worm([0.37, 0.57, 1.7], [-0.03, 0.06, 0.04], 'skull', 2); worm([0.66, 0.35, 1.78], [0.06, -0.02, 0.05], 'jaw', 3); worm([-0.62, 0.4, 1.12], [-0.05, 0.03, -0.04], 'neck', 4);
}
function gPaint(p: KPage, x: BuildCtx) {
  const v = x.variant;
  const B = p.R('BODY');
  // cold off-white, grey-green mottling under it, blue-grey veins, pink where the skin is thin
  const RB = makeRamp(mixHex(0x8e9486, 0x968e88, v * 0.3), 9, { hueShift: 0.02, spread: 0.75 });
  B.fill(RB, (xx, yy) => {
    const a = (B.deg(xx) * Math.PI) / 180, top = Math.cos(a);
    const m = B.fbm(xx, yy, 5, 3, 3 + v);
    return 4.6 + top * 1.2 + (m - 0.5) * 2.4 - (m < 0.4 ? 1.4 : 0) - (yy % 9 === 0 ? 0.6 : 0);
  }, undefined, 0.45);
  for (let yy = 0; yy < B.h; yy++) for (let xx = 0; xx < B.w; xx++) {
    const a = (B.deg(xx) * Math.PI) / 180, m = B.fbm(xx + 40, yy, 4, 3, 7 + v);
    if (m < 0.5) B.blend(xx, yy, 0x4a5a42, 0.55 * (0.5 - m) / 0.5 + 0.3);
    if (Math.cos(a) < -0.4) B.blend(xx, yy, 0xd89290, 0.35 * (-Math.cos(a) - 0.4));
  }
  for (let i = 0; i < 34; i++) B.crack(hash(i, 1) * B.w, hash(i, 2) * B.h, 10 + hash(i, 3) * 18, hash(i, 4) * 360, 0x3c4a72, 20 + i, 0.65, 0.35);
  // lesions: raw pink with crusted rims, and pale old scars
  for (let i = 0; i < 9; i++) {
    // ragged lesions: a crusted dark rim, raw flesh in it, irregular
    const cx = hash(i, 11) * B.w, cy = hash(i, 12) * B.h, r = 0.8 + hash(i, 13) * 1.6;
    for (let k = 0; k < 5; k++) { const ox = (hash(i * 7 + k, 14) - 0.5) * r * 1.6, oy = (hash(i * 7 + k, 15) - 0.5) * r; B.ellipse(cx + ox, cy + oy, r * 0.7 + 0.6, r * 0.5 + 0.5, 0x3a2420, 0.55); B.ellipse(cx + ox, cy + oy, r * 0.55, r * 0.4, 0xb04848, 0.75); }
    B.blend(cx, cy, 0xf0c8c0, 0.5);
  }
  for (let i = 0; i < 5; i++) B.line(hash(i, 21) * B.w, hash(i, 22) * B.h, hash(i, 21) * B.w + 8 + hash(i, 23) * 8, hash(i, 22) * B.h + (hash(i, 24) - 0.5) * 6, 0xf0ece4, 0.8);
  // tubercles: pale warts with darker rims, thick over the back
  for (let i = 0; i < 160; i++) { const xx = hash(i, 31) * B.w, yy = hash(i, 32) * B.h, a = (B.deg(xx) * Math.PI) / 180; if (Math.cos(a) < -0.3 && hash(i, 33) < 0.7) continue; B.ellipse(xx, yy, 1.3, 1.1, 0x6a6a5c, 0.5); B.set(xx, yy, 0xf4f4ea); }
  // the lateral line: a dotted row of dark pores each side
  for (const deg of [-88, 88]) for (let yy = 1; yy < B.h; yy += 3) B.set(B.X(deg) + Math.sin(yy * 0.5), yy, 0x2a2a2a);
  for (let i = 0; i < 40; i++) B.blend(hash(i, 41) * B.w, hash(i, 42) * B.h, 0xffffff, 0.7); // wet glints
  // the head: same skin, more warts, pink round the lips
  const H = p.R('HEAD');
  H.fill(RB, (xx, yy) => 4.4 + Math.cos((H.deg(xx) * Math.PI) / 180) * 1.1 + (H.fbm(xx, yy, 4, 3, 13) - 0.5) * 2.4, undefined, 0.45);
  for (let yy = 0; yy < H.h; yy++) for (let xx = 0; xx < H.w; xx++) { const m = H.fbm(xx, yy, 4, 3, 17); if (m < 0.44) H.blend(xx, yy, 0x56664e, 0.5); if (Math.cos((H.deg(xx) * Math.PI) / 180) < -0.2) H.blend(xx, yy, 0xe0a0a0, 0.4); }
  for (let i = 0; i < 90; i++) { const xx = hash(i, 51) * H.w, yy = hash(i, 52) * H.h; H.ellipse(xx, yy, 1.2, 1, 0x6a6a5c, 0.5); H.set(xx, yy, 0xf4f4ea); }
  for (let i = 0; i < 14; i++) H.crack(hash(i, 61) * H.w, hash(i, 62) * H.h, 8 + hash(i, 63) * 10, hash(i, 64) * 360, 0x3c4a72, 70 + i, 0.6, 0.3);
  for (let i = 0; i < 24; i++) H.blend(hash(i, 65) * H.w, hash(i, 66) * H.h, 0xffffff, 0.7);
  const J = p.R('JAW');
  J.fill(RB, (xx, yy) => 4 + Math.cos((J.deg(xx) * Math.PI) / 180) * 0.8 + (J.fbm(xx, yy, 4, 2, 23) - 0.5) * 2, undefined, 0.45);
  for (let yy = 0; yy < J.h; yy++) for (let xx = 0; xx < J.w; xx++) if (Math.cos((J.deg(xx) * Math.PI) / 180) > 0.2) J.blend(xx, yy, 0xe8b8b0, 0.5);
  for (let i = 0; i < 60; i++) { const xx = hash(i, 71) * J.w, yy = hash(i, 72) * J.h; J.ellipse(xx, yy, 1, 1, 0x6a6a5c, 0.4); J.set(xx, yy, 0xf0f0e6); }
  // the folds: waxy, with blue veins and pink flesh showing at the thin edges
  const F = p.R('FOLD');
  F.fill(makeRamp(0x96968a, 8, { spread: 0.7 }), (xx, yy) => 4 + Math.sin(xx * 0.9) * 1.6 + (F.fbm(xx, yy, 4, 2, 31) - 0.5) * 1.6 - (yy / F.h) * 1.2, undefined, 0.4);
  for (let yy = 0; yy < F.h; yy++) for (let xx = 0; xx < F.w; xx++) if (yy > F.h * 0.6) F.blend(xx, yy, 0xd88888, 0.45 * (yy / F.h - 0.6) / 0.4);
  for (let i = 0; i < 12; i++) F.crack(hash(i, 81) * F.w, hash(i, 82) * F.h, 10, 90 + (hash(i, 83) - 0.5) * 60, 0x3c4a72, 90 + i, 0.7, 0.25);
  for (let i = 0; i < 20; i++) F.blend(hash(i, 84) * F.w, hash(i, 85) * F.h, 0xffffff, 0.75);
  // the mouth: pink-red and wet, pale gums at the rims
  const M = p.R('MOUTH');
  M.fill(makeRamp(0xc84858, 8, { spread: 0.6 }), (xx, yy) => 3.6 + Math.sin(yy * 0.9) * 0.9 + (M.fbm(xx, yy, 3, 2, 41) - 0.5) * 1.8 - Math.abs(xx / M.w - 0.5) * 3, undefined, 0.45);
  for (let i = 0; i < 6; i++) M.crack(hash(i, 91) * M.w, hash(i, 92) * M.h, 8, hash(i, 93) * 360, 0x7a1424, 100 + i, 0.6, 0.3);
  for (let yy = 0; yy < 4; yy++) for (let xx = 0; xx < M.w; xx++) M.blend(xx, yy, 0xf0d0d0, 0.6);
  for (let i = 0; i < 18; i++) M.blend(hash(i, 94) * M.w, hash(i, 95) * M.h, 0xffffff, 0.8);
  const D = p.R('DEW');
  D.fill(makeRamp(0x949084, 8, { spread: 0.7 }), (xx, yy) => 4 + Math.sin(xx * 1.3 + yy * 0.2) * 1.1 + (D.fbm(xx, yy, 4, 2, 51) - 0.5) * 2, undefined, 0.45);
  for (let yy = 0; yy < D.h; yy++) for (let xx = 0; xx < D.w; xx++) if (yy > D.h * 0.45) D.blend(xx, yy, 0xd89a9a, 0.4 * (yy / D.h - 0.45));
  for (let i = 0; i < 8; i++) D.crack(hash(i, 101) * D.w, hash(i, 102) * D.h, 10, hash(i, 103) * 360, 0x3c4a72, 110 + i, 0.7, 0.3);
  const L = p.R('LIMB');
  L.fill(RB, (xx, yy) => 4 + Math.cos((L.deg(xx) * Math.PI) / 180) * 1 + (L.fbm(xx, yy, 3, 2, 61) - 0.5) * 2 - (yy % 6 === 0 ? 0.8 : 0), undefined, 0.45);
  for (let yy = 0; yy < L.h; yy++) for (let xx = 0; xx < L.w; xx++) { if (L.fbm(xx, yy, 3, 2, 62) < 0.44) L.blend(xx, yy, 0x56664e, 0.5); if (yy > L.h * 0.75) L.blend(xx, yy, 0xd89090, 0.4); }
  const Fi = p.R('FIN');
  Fi.fill(makeRamp(0xb0b0a2, 7, { spread: 0.6 }), (xx, yy) => 3.6 + (Fi.fbm(xx, yy, 4, 2, 71) - 0.5) * 2 - (yy / Fi.h) * 1.4, undefined, 0.4);
  for (let yy = 0; yy < Fi.h; yy++) for (let xx = 0; xx < Fi.w; xx++) if (yy > Fi.h * 0.5) Fi.blend(xx, yy, 0xd88a8a, 0.4);
  p.R('TOOTH').fill(makeRamp(0xf0ece0, 5, { spread: 0.4 }), (xx, yy) => 3 - yy * 0.2, undefined, 0.3);
  // the blind eye: milky blue-white with a cloud where the pupil was; the good one tiny, pink and wet
  const EM = p.R('EYEM');
  for (let yy = 0; yy < 8; yy++) for (let xx = 0; xx < 8; xx++) { const d = Math.hypot(xx - 3.5, yy - 3.5); EM.set(xx, yy, d < 1.8 ? 0xd8e0e8 : d < 3 ? 0xb8c4d0 : 0xa8a8b0); }
  EM.set(2, 2, 0xffffff);
  const EW = p.R('EYEW');
  for (let yy = 0; yy < 8; yy++) for (let xx = 0; xx < 8; xx++) { const d = Math.hypot(xx - 3.5, yy - 3.5); EW.set(xx, yy, d < 1.4 ? 0x1a0408 : d < 2.8 ? 0xc84858 : 0xe08890); }
  EW.set(2, 2, 0xffffff); EW.set(3, 2, 0xffe0e0);
  // leeches: black-green, glossy, ringed
  const LE = p.R('LEECH');
  LE.fill([0x060806, 0x101810, 0x1a2a1a, 0x2a3a26, 0x4a5a40], (xx, yy) => 1.4 + Math.cos((LE.deg(xx) * Math.PI) / 180) * 1.3 + (yy % 3 === 0 ? -0.8 : 0), undefined, 0.4);
  for (let yy = 1; yy < LE.h; yy += 4) LE.set(LE.X(0), yy, 0xb0c0a0);
  const LU = p.R('LUMP');
  LU.fill(RB, (xx, yy) => 4.6 + (LU.fbm(xx, yy, 2, 2, 81) - 0.5) * 3, undefined, 0.45);
  paintCap(p.R('CAP'), 0xd8d8cc, 0xd88a8a, 0x8a2a2a);
  // the tongue: fleshy pink, wet, with a darker groove and taste-bud stipple
  const TG = p.R('TONG');
  TG.fill(makeRamp(0xe07884, 8, { spread: 0.55 }), (xx, yy) => 4.4 + (TG.fbm(xx, yy, 3, 2, 131) - 0.5) * 1.6 - Math.exp(-((xx / TG.w - 0.5) ** 2) / 0.004) * 2.4, undefined, 0.4);
  for (let i = 0; i < 50; i++) TG.set(hash(i, 132) * TG.w, hash(i, 133) * TG.h, 0xf0a8b0);
  for (let i = 0; i < 14; i++) TG.blend(hash(i, 134) * TG.w, hash(i, 135) * TG.h, 0xffffff, 0.85);
  // gums: swollen, pale pink, raw at the tooth line
  const GU = p.R('GUM');
  GU.fill(makeRamp(0xeab0b0, 6, { spread: 0.5 }), (xx, yy) => 3.6 + (GU.fbm(xx, yy, 3, 2, 141) - 0.5) * 1.4 - (yy > GU.h * 0.6 ? 1.2 : 0), undefined, 0.4);
  for (let xx = 0; xx < GU.w; xx += 2) GU.blend(xx, GU.h - 1, 0x9a2a3a, 0.6);
  for (let i = 0; i < 10; i++) GU.blend(hash(i, 142) * GU.w, hash(i, 143) * GU.h, 0xffffff, 0.8);
  // warts: pale crowns with darker grey-green rims and a wet glint
  const WA = p.R('WART');
  WA.fill(RB, (xx, yy) => 5.2 + Math.cos((WA.deg(xx) * Math.PI) / 180) * 1.6 - (yy / WA.h) * 1.5 + (WA.fbm(xx, yy, 2, 2, 151) - 0.5), undefined, 0.4);
  for (let yy = Math.floor(WA.h * 0.6); yy < WA.h; yy++) for (let xx = 0; xx < WA.w; xx++) WA.blend(xx, yy, 0x4a5a42, 0.45);
  for (let i = 0; i < 6; i++) WA.blend(hash(i, 152) * WA.w, hash(i, 153) * WA.h * 0.4, 0xffffff, 0.8);
  // the lids and eye folds: wrinkled, grey-green in the creases, raw pink at the rims
  const LI = p.R('LID');
  LI.fill(RB, (xx, yy) => 4.2 + Math.sin(xx * 1.4) * 1.5 + (LI.fbm(xx, yy, 3, 2, 161) - 0.5) * 1.6, undefined, 0.45);
  for (let xx = 0; xx < LI.w; xx++) { if (xx % 3 === 0) for (let yy = 0; yy < LI.h; yy++) LI.blend(xx, yy, 0x3e4a38, 0.45); LI.blend(xx, LI.h - 1, 0xc86a72, 0.7); LI.blend(xx, LI.h - 2, 0xd8888c, 0.4); }
  for (let i = 0; i < 12; i++) LI.blend(hash(i, 162) * LI.w, hash(i, 163) * LI.h, 0xffffff, 0.75);
  // cysts: yellowish lumps under the skin with an angry pink ring and a dark pore
  const CS_ = p.R('CYST');
  for (let yy = 0; yy < 8; yy++) for (let xx = 0; xx < 8; xx++) { const d = Math.abs(yy - 3.5) / 4; CS_.set(xx, yy, d < 0.3 ? 0xe8d89a : d < 0.65 ? 0xd8b08a : 0xc87878); }
  CS_.set(3, 3, 0x3a2418); CS_.set(5, 2, 0xffffff);
  // worms: translucent white-pink, segmented
  const WO = p.R('WORM');
  for (let yy = 0; yy < 16; yy++) for (let xx = 0; xx < 8; xx++) WO.set(xx, yy, yy % 3 === 0 ? 0xd8a8a8 : mixHex(0xf4e8e0, 0xe8c0c0, Math.abs(xx - 3.5) / 4));
  // the blind eye: a milky, clouded cataract, a faint red vein net in the white round it
  for (let yy = 0; yy < 8; yy++) for (let xx = 0; xx < 8; xx++) { const d = Math.hypot(xx - 3.5, yy - 3.5); EM.set(xx, yy, d < 1.2 ? 0xe8eef2 : d < 2.2 ? mixHex(0xc8d4dc, 0xe8eef0, hash(xx, yy)) : d < 3.2 ? 0xa8b4c0 : 0xb88a90); }
  EM.set(1, 3, 0xa83040); EM.set(6, 4, 0xa83040); EM.set(4, 6, 0xa83040); EM.set(2, 2, 0xffffff);
  // wet: more slime glints on the head and lips
  for (let i = 0; i < 40; i++) { H.blend(hash(i, 171) * H.w, hash(i, 172) * H.h, 0xffffff, 0.85); H.blend(hash(i, 171) * H.w + 1, hash(i, 172) * H.h, 0xffffff, 0.5); }
  for (let i = 0; i < 20; i++) J.blend(hash(i, 173) * J.w, hash(i, 174) * J.h, 0xffffff, 0.75);
}
const GULPER_KIT: KitDef = { key: 'gulper', variants: GV, W: 256, H: 256, bones: gBones, layout: gLayout, build: gBuild, paint: gPaint, sphere: [0, 0.4, 0, 3.2] };

const SUCK_N = 14, STRANDS = 5;
function buildGulper(): Rig {
  const rig = buildKitRig(GULPER_KIT, 0, 0.6) as KitRig;
  // the suction: grit and water rushing into the mouth, and the pull ring in the water ahead of it
  const suck = new THREE.Group(); suck.name = 'suck'; rig.root.add(suck); rig.parts.suck = suck; suck.visible = false;
  for (let i = 0; i < SUCK_N; i++) bpart(rig, 'sb' + i, suck, [0, 0, 0], PG, 'gsuckbit', (ob) => { ob.blob([0, 0, 0], [0.035, 0.03, 0.05], 5, 4, PG.reg('GTOOTH'), { emis: 0.4 }); });
  tpart(rig, 'sring', suck, [0, 0, 0], PG, 'gsring', filmMat(0.45), (ob) => {
    const path: V3[] = []; for (let i = 0; i <= 24; i++) { const a = (i / 24) * Math.PI * 2; path.push([Math.cos(a), Math.sin(a) * 0.55, 0]); }
    ob.tube(path, path.map(() => 0.035), 6, PG.reg('TFIN'), { emis: 0.5 });
  });
  // slime strands that stretch between the jaws when it opens
  const strands = new THREE.Group(); strands.name = 'strands'; rig.root.add(strands); rig.parts.strands = strands;
  for (let i = 0; i < STRANDS; i++) tpart(rig, 'st' + i, strands, [0, 0, 0], PG, 'gstrand', filmMat(0.6), (ob) => { ob.tube([[0, 0, 0], [0.01, 0.5, 0.02], [0, 1, 0]], [0.012, 0.005, 0.012], 5, PG.reg('TFIN'), { emis: 0.35 }); });
  return rig;
}

interface GulpDrive {
  t: number; dt: number; speed: number; gape: number; sub: number; gulp: number; struggle: number; swim: number; dead: number; flinch: number; suck: number; pump: number; pucker: number;
  /** the spring-damped spine (spineStep): yaw of chest, pelvis, t0..t4 */
  yaw: number[];
  /** the whole body tipped nose-up (hauling up a pool edge), the chest draped forward over the lip, the head raised */
  bodyPitch: number; sag: number; headUp: number;
  /** how much the head holds its line while the body undulates (1 swimming) */
  steady: number;
  /** land: the lurch phase (0..1, heave at 0..0.45) and how much it is lurching */
  lph: number; land: number;
  /** hauling out: forelimbs reaching up onto the tile, the heave of effort, the hind legs and tail thrashing */
  reach: number; heave: number; thrash: number;
}
// ------------------------------------------------------------------ the spine: a chain of damped springs
// Each joint (chest, pelvis, tail t0..t4) is a torsion spring pulled toward a travelling undulation wave (the
// swimming stroke: small at the shoulders, growing to the tail tip, each joint lagging the one before) plus a
// bend that trails the body round a turn. Stiffness falls off down the tail, so a hard turn or a stop whips
// it: the tail overshoots and swings back. Turning the root kicks every joint the other way (inertia).
const SPN = 7;
const SPK = [70, 52, 40, 31, 24, 18, 13];
const SPA = [0.03, 0.06, 0.11, 0.16, 0.22, 0.29, 0.37];
interface SpineIn { speed: number; swim: number; thrash: number; turn: number; land: number; lph: number; sph?: number; dead: number }
function spineStep(ud: Record<string, any>, dt: number, o: SpineIn): number[] {
  const S = (ud.spine ||= { a: new Array(SPN).fill(0), v: new Array(SPN).fill(0), ph: 0, lt: 0 });
  const thr = Math.min(1.6, o.thrash);
  // the stroke: tail beats get faster and wider with speed; thrashing is fast and wild
  const freq = 0.35 + Math.min(2.5, o.speed) * 0.42 + thr * 1.5;
  S.ph = o.sph ?? S.ph + dt * freq * Math.PI * 2;
  const stroke = o.dead ? 0 : o.swim * Math.min(1.5, 0.22 + o.speed * 0.5 + thr * 0.9) + (1 - o.swim) * (0.08 + thr * 0.9);
  const dTurn = o.turn - S.lt; S.lt = o.turn;
  const sub = dt > 1 / 45 ? 2 : 1, h = dt / sub;
  for (let i = 0; i < SPN; i++) {
    // undulation: a wave running from the shoulders to the tail
    let tgt = SPA[i] * stroke * Math.sin(S.ph - i * 0.85);
    // on land: a standing S, the shoulders and hips swinging opposite with each lurch, the tail dragging after
    if (o.land > 0) tgt += o.land * (i === 0 ? 0.22 : i === 1 ? -0.16 : -0.06 - i * 0.03) * Math.sin(o.lph * Math.PI * 2 + (i > 1 ? -(i - 1) * 0.7 : 0));
    // the body trails round a turn: the front bends into it, the tail lags out of it
    tgt += (i === 0 ? 0.1 : i === 1 ? 0 : -0.07 - i * 0.012) * o.turn;
    if (o.dead) tgt = i > 1 ? 0.12 : 0;
    S.v[i] -= dTurn * (i === 0 ? -0.1 : 0.12 + i * 0.07);
    const k = SPK[i], c = 2 * 0.38 * Math.sqrt(k);
    for (let s = 0; s < sub; s++) { S.v[i] += (k * (tgt - S.a[i]) - c * S.v[i]) * h; S.a[i] += S.v[i] * h; }
    S.a[i] = Math.max(-0.9, Math.min(0.9, S.a[i]));
  }
  return S.a;
}

const _sa = new THREE.Vector3(), _sb = new THREE.Vector3(), _sq = new THREE.Quaternion(), _sY = new THREE.Vector3(0, 1, 0);
function poseGulper(rig: Rig, d: GulpDrive) {
  const K = rig as KitRig, P = rig.parts, t = d.t, ud = rig.root.userData as Record<string, any>;
  if (K.kit) kitSync(K);
  ud.ph = (ud.ph ?? 0) + d.dt * (1.2 + d.speed * 2.5);
  const ph = ud.ph;
  const swim = d.swim, walk = clamp01(d.speed / 0.6) * (1 - swim) * (1 - d.land) * (1 - d.reach);
  const p0 = (n: string) => P[n].userData.p0 as THREE.Vector3;
  const y = d.yaw;
  // the body: the spine springs, the slow breath, the heave of effort, the slope up a pool edge; a corpse rolls over
  const br = Math.sin(t * 1.3) * 0.02;
  const lurchP = d.land * Math.max(0, Math.sin(Math.min(1, d.lph / 0.45) * Math.PI)) * (d.lph < 0.45 ? 1 : 0);
  P.pelvis.position.copy(p0('pelvis')).add(_sa.set(0, br - d.dead * 0.12 + d.heave * 0.07 + lurchP * 0.05, 0));
  P.pelvis.rotation.set(-d.bodyPitch, y[1], (d.dead ? 2.7 : 0) + y[1] * 0.25 + Math.sin(t * 7) * 0.05 * d.thrash);
  P.chest.rotation.set(d.sag - lurchP * 0.12 - d.heave * 0.1, y[0], -y[0] * 0.2);
  // the head keeps its line while the body swings under it
  P.neck.rotation.set(-d.headUp * 0.55 + d.sag * 0.4 + lurchP * 0.1, -(y[0] + y[1]) * d.steady - d.flinch * 0.1, 0);
  // the belly swells round what it has swallowed, and kicks
  const bg = d.gulp;
  P.belly.scale.set(1 + bg * 0.55 + Math.sin(t * 9) * 0.06 * d.struggle, 1 + bg * 0.9 + Math.sin(t * 11 + 1) * 0.1 * d.struggle, 1 + bg * 0.4);
  // the mouth: the skull tips back and the jaw drops; sucking it opens fast and only part way, lips closed to a tube
  const g = Math.max(d.gape, d.suck * 0.45, d.heave * 0.25);
  P.skull.rotation.set(-g * 0.95 + d.flinch * 0.08 - d.headUp * 0.2, 0, 0);
  P.jaw.rotation.set(g * 1.15 + Math.sin(t * 3) * 0.015, 0, 0);
  const pk = d.pucker;
  P.lobeL.rotation.set(0, -pk * 0.9, 0); P.lobeR.rotation.set(0, pk * 0.9, 0);
  P.lobeL.scale.set(1 + pk * 0.4, 1 + pk * 0.9, 1 + pk * 0.4); P.lobeR.scale.set(1 + pk * 0.4, 1 + pk * 0.9, 1 + pk * 0.4);
  // the dewlap: it swings with the body, drops and swells as it sucks, pumps as it swallows, flutters as it breathes
  const pumpK = Math.max(0, Math.sin(t * 6)) * 0.06 * (1 - d.gape) + d.pump * Math.max(0, Math.sin(t * 8)) * 0.35;
  P.dew.position.copy(p0('dew')).add(_sa.set(0, -d.suck * 0.16 - pumpK * 0.1 - d.sag * 0.1, d.suck * 0.04));
  P.dew.rotation.set(Math.sin(ph * 0.5 + 1) * 0.06 + Math.sin(t * 1.1) * 0.04 + d.bodyPitch * 0.8 + d.heave * 0.2, 0, -(y[0] + y[1]) * 0.6 + Math.sin(t * 9) * 0.08 * d.thrash);
  P.dew.scale.set(1 + d.suck * 0.45 + d.gulp * 0.3, 1 + d.suck * 1.1 + pumpK + d.gulp * 0.5, 1 + d.suck * 0.3);
  // the tail: the spring chain; dragged flat on the tile, hanging down into the water off an edge
  for (let i = 0; i < 5; i++) P['t' + i].rotation.set(d.bodyPitch * (i === 0 ? 0.35 : 0.12) - d.land * 0.03, y[2 + i], 0);
  // the legs. Swimming: pressed back along the flanks. Walking the bottom: a sprawl. Lurching on land: both
  // forelimbs reach forward together and haul the body after them while the hind legs shove. Hauling out:
  // the forelimbs up on the tile, pulling with each heave, the hind legs kicking at the water.
  const reachCycle = d.lph < 0.45 ? 1 - d.lph / 0.45 : (d.lph - 0.45) / 0.55;
  for (const [s, k] of [['L', 1], ['R', -1]] as const) for (const [fb, off] of [['F', s === 'L' ? 0 : Math.PI], ['B', s === 'L' ? Math.PI : 0]] as const) {
    const front = fb === 'F';
    const sw = Math.sin(ph + off), lift = Math.max(0, Math.cos(ph + off));
    let fwd = sw * 0.45 * walk, raise = (-0.15 + lift * 0.35) * walk, elbow = (0.25 - lift * 0.2 * walk) * walk;
    const tuck = swim * (1 - d.reach) * (1 - d.land);
    fwd += tuck * (front ? -1.0 : -0.85) + tuck * (front ? 0 : Math.sin(t * 2 + off) * 0.15 * (1 - clamp01(d.speed)));
    raise += tuck * 0.12; elbow += tuck * 0.35;
    if (d.land > 0) {
      const lw = d.land * (1 - d.reach);
      fwd += lw * (front ? -0.45 + reachCycle * 1.15 : 0.35 - reachCycle * 0.8);
      raise += lw * (front ? (d.lph < 0.45 ? -0.12 : 0.3) : (d.lph < 0.45 ? 0.05 : -0.1));
      elbow += lw * (front ? 0.35 : 0.2);
    }
    if (d.reach > 0) {
      const rw = d.reach;
      if (front) { fwd += rw * (0.95 - d.heave * 0.55); raise += rw * (0.55 - d.heave * 0.35); elbow += rw * (0.55 + d.heave * 0.3); }
      else { fwd += rw * Math.sin(t * 9 + off) * 0.55 * d.thrash; raise += rw * (0.15 + Math.cos(t * 9 + off) * 0.25 * d.thrash); }
    }
    P['u' + fb + s].rotation.set(0, -k * fwd, k * raise - d.dead * k * 0.5);
    P['l' + fb + s].rotation.set(0, 0, k * (elbow || 0.05));
    P['h' + fb + s].rotation.set(0, 0, k * (-0.1 + lift * 0.1 * walk + d.reach * (front ? -0.25 : 0)));
  }
  // the suction: grit and water streaming in from a cone ahead of the mouth, the pull ring closing on it
  const sk = d.suck;
  P.suck.visible = sk > 0.02;
  if (P.suck.visible) {
    const mouthZ = 2.3, mouthY = 0.38;
    for (let i = 0; i < SUCK_N; i++) {
      const ph2 = ((t * 2.6 + i / SUCK_N) % 1), a = i * 2.399, r0 = 1.3 * (1 - ph2);
      const b = P['sb' + i];
      b.position.set(Math.cos(a) * r0 * 0.9, mouthY + Math.sin(a) * r0 * 0.4 + 0.05, mouthZ + (1 - ph2) * 2.6);
      b.scale.setScalar((0.6 + (1 - ph2) * 0.8) * sk); b.rotation.set(0, 0, a);
    }
    const rk = (t * 2.2) % 1;
    P.sring.position.set(0, mouthY + 0.05, mouthZ + 0.4 + (1 - rk) * 1.8);
    P.sring.scale.setScalar((0.25 + (1 - rk) * 1.4) * sk);
  }
  // slime strands from the upper to the lower jaw while the mouth is open
  const open = g > 0.12;
  P.strands.visible = open;
  if (open && K.kit) {
    rig.root.updateMatrixWorld(true);
    for (let i = 0; i < STRANDS; i++) {
      const a = (i / (STRANDS - 1) - 0.5) * 2.2;
      P.skull.localToWorld(_sa.set(Math.sin(a) * 0.55 - (P.skull.userData.p0 as THREE.Vector3).x, 0.37 - (P.skull.userData.p0 as THREE.Vector3).y, 1.36 + Math.cos(a) * 0.62 - (P.skull.userData.p0 as THREE.Vector3).z));
      P.jaw.localToWorld(_sb.set(Math.sin(a) * 0.5 - (P.jaw.userData.p0 as THREE.Vector3).x, 0.33 - (P.jaw.userData.p0 as THREE.Vector3).y, 1.36 + Math.cos(a) * 0.58 - (P.jaw.userData.p0 as THREE.Vector3).z));
      rig.root.worldToLocal(_sa); rig.root.worldToLocal(_sb);
      const s = P['st' + i];
      s.position.copy(_sb);
      const dv = _sa.sub(_sb); const L = dv.length() || 0.001; dv.divideScalar(L);
      s.quaternion.copy(_sq.setFromUnitVectors(_sY, dv));
      s.scale.set(1 - Math.min(0.7, L * 0.6), L, 1 - Math.min(0.7, L * 0.6));
      s.visible = L < 1.6 && (i + Math.floor(t * 0.5)) % 3 !== 0;
    }
  }
}

type GMd = 'lurk' | 'stalk' | 'burst' | 'gulp' | 'return' | 'haul' | 'land';
function gSet(c: Creature, md: GMd) { const n = net(c); if (n.md !== md) { n.md = md; c.mem.mdT = 0; } }
const wrapA = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const clampN = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
/** a tile the Gulper can lie on out of the water: floor, nothing solid, not water */
function dryAt(z: Zone, x: number, y: number): boolean {
  const tx = Math.floor(x), ty = Math.floor(y);
  if (!z.inb(tx, ty)) return false;
  const i = z.idx(tx, ty);
  return !!z.floor[i] && !z.solid[i] && !z.floorAt(tx, ty)?.water;
}
function passAt(z: Zone, x: number, y: number): boolean {
  const tx = Math.floor(x), ty = Math.floor(y);
  if (!z.inb(tx, ty)) return false;
  const i = z.idx(tx, ty);
  return !!z.floor[i] && !z.solid[i];
}
/**
 * The Gulper's body as a body: velocity, drag and turning inertia instead of steering straight to a point.
 * In water the tail drives it in pulses (one per stroke), it coasts, it can barely slide sideways, and it
 * turns slowly; its head stays in the deep water (it noses into the wall and stops). On land it moves in
 * heavy lurches: the forelimbs haul, then its belly drags it to a stop. Returns the distance left.
 */
function gPhys(c: Creature, z: Zone, tx: number, tz: number, throttle: number, dt: number, medium: 'water' | 'land'): { d: number; wall: boolean } {
  const m = c.mem;
  m.vx ??= 0; m.vz ??= 0; m.yw ??= 0;
  const d = Math.hypot(tx - c.x, tz - c.z);
  const e = d < 0.25 ? 0 : wrapA(Math.atan2(tz - c.z, tx - c.x) - c.facing);
  const tMax = medium === 'water' ? 1.3 + throttle * 0.4 : 0.75;
  m.yw = clampN(m.yw + clampN(e * 4.5 - m.yw * 3, -3.5, 3.5) * dt, -tMax, tMax);
  c.facing = wrapA(c.facing + m.yw * dt); c.targetFacing = c.facing;
  const fx = Math.cos(c.facing), fz = Math.sin(c.facing);
  let fwd = m.vx * fx + m.vz * fz, lat = -m.vx * fz + m.vz * fx;
  const thr = throttle * clamp01(d / 1.4) * Math.max(0, Math.cos(e));
  if (medium === 'water') {
    // a stroke every beat of the tail: the thrust comes in pulses
    m.sph = (m.sph ?? 0) + dt * (0.35 + Math.abs(fwd) * 0.42 + thr * 0.6) * Math.PI * 2;
    const pulse = 0.35 + 1.3 * Math.pow(Math.max(0, Math.sin(m.sph)), 2);
    fwd += thr * 2.6 * pulse * dt;
    fwd -= (fwd * Math.abs(fwd) * 0.7 + fwd * 0.22) * dt;
    lat *= Math.exp(-dt * 5);
  } else {
    m.lph = ((m.lph ?? 0) + dt / 1.3) % 1;
    const power = m.lph < 0.45 ? Math.sin((m.lph / 0.45) * Math.PI) : 0;
    fwd += thr * power * 3.6 * dt;
    fwd *= Math.exp(-dt * (power > 0.05 ? 1.2 : 7));
    lat *= Math.exp(-dt * 12);
  }
  m.vx = fx * fwd - fz * lat; m.vz = fz * fwd + fx * lat;
  const ok = (x: number, y: number) => (medium === 'water' ? waterAt(z, x, y) === 'deep' : passAt(z, x, y));
  let wall = false;
  const nx = c.x + m.vx * dt, nz = c.z + m.vz * dt;
  // the snout is what meets the wall
  const hx = nx + fx * 1.1, hz = nz + fz * 1.1;
  if (medium === 'water' && !ok(hx, hz) && fwd > 0) { wall = true; fwd *= -0.25; m.vx = fx * fwd - fz * lat; m.vz = fz * fwd + fx * lat; }
  else {
    if (ok(nx, c.z)) c.x = nx; else { m.vx *= -0.2; wall = true; }
    if (ok(c.x, nz)) c.z = nz; else { m.vz *= -0.2; wall = true; }
  }
  c.speed = Math.hypot(m.vx, m.vz); c.vx = c.vz = 0;
  return { d, wall };
}
/** the pool edge between the Gulper and a point on the deck: the last deep water, the outward normal, the deck */
function edgeToward(z: Zone, c: Creature, x: number, zz: number): { ex: number; ez: number; nx: number; nz: number; deckY: number } | null {
  const a = angTo(c, x, zz), L = Math.hypot(x - c.x, zz - c.z);
  let px = c.x, pz = c.z;
  for (let s = 0.25; s < L + 0.5; s += 0.25) {
    const qx = c.x + Math.cos(a) * s, qz = c.z + Math.sin(a) * s;
    if (waterAt(z, qx, qz) === 'deep') { px = qx; pz = qz; continue; }
    if (!dryAt(z, qx, qz) || !dryAt(z, qx + Math.cos(a) * 1.2, qz + Math.sin(a) * 1.2)) return null;
    // which tile face it crossed: the outward normal is along that axis
    const cx = Math.floor(qx) !== Math.floor(px), nx = cx ? Math.sign(qx - px) : 0, nz = cx ? 0 : Math.sign(qz - pz);
    const ex = cx ? (nx > 0 ? Math.floor(qx) : Math.floor(px)) : qx, ez = cx ? qz : (nz > 0 ? Math.floor(qz) : Math.floor(pz));
    return { ex, ez, nx, nz, deckY: z.heightAt(Math.floor(qx), Math.floor(qz)) };
  }
  return null;
}
function thinkGulper(c: Creature, dt: number): boolean {
  const z = G.getZone(c.zoneKey) as Zone, m = c.mem, n = net(c), now = G.time;
  const ev = pulse(c);
  m.mdT = (m.mdT ?? 0) + dt;
  const pl = plungeOf(z);
  if (!m.init) { m.init = 1; gSet(c, 'lurk'); m.home = { x: c.x, z: c.z }; m.brT = now + rng.float(8, 20); }
  const md = (n.md ?? 'lurk') as GMd;
  const inWater = waterAt(z, c.x, c.z) === 'deep';
  n.lv = Math.round(((G as any).water?.levelAt?.(c.x, c.z) ?? -0.06) * 100) / 100;
  // ---------------- something in it
  if (md === 'gulp') {
    const p = G.players.get(n.gp);
    c.speed = 0; m.vx = m.vz = 0; c.vx = c.vz = 0; c.setState('eat');
    m.gulpHurt = (m.gulpHurt ?? 0) + ev.hurt;
    if (p && !p.body.dead) {
      if (now > (m.chewT ?? 0)) { m.chewT = now + 1.1; hitPlayer(c, p, rng.float(5, 9), ['bite', 'bruise'], 0, ['torso_u', 'torso_l'], 0.01); fx(c, 'chew'); }
    }
    if (!p || p.body.dead || now > m.gulpEnd || m.gulpHurt > 28) {
      // spat out (or done): it lets go and goes back down
      fx(c, 'spit', { pid: n.gp, a: c.facing });
      n.gp = null; m.gulpHurt = 0; gSet(c, 'return'); m.restT = now + 8;
    }
    return true;
  }
  if (ev.hurt > 0 && md === 'lurk') { gSet(c, 'stalk'); m.prey = c.targetId; }
  // ---------------- who is near the water
  let prey: { p: Player; d: number } | null = null, deckPrey: { p: Player; d: number } | null = null;
  for (const p of playersIn(c.zoneKey)) {
    if (p.body.dead) continue;
    const d = dist(p, c);
    const pw = waterAt(z, p.x, p.z);
    const edge = !pw && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => waterAt(z, p.x + dx, p.z + dy) === 'deep');
    const reach = pw === 'deep' ? 12 : edge ? 4.2 : pw === 'shallow' ? 3.2 : 0;
    if (d < reach && (!prey || d < prey.d)) prey = { p, d };
    if (!pw && d < 7.5 && (!deckPrey || d < deckPrey.d)) deckPrey = { p, d };
  }
  // ---------------- hauling itself out over the edge
  if (md === 'haul') {
    const H = m.haul as { ex: number; ez: number; nx: number; nz: number; deckY: number; heaves: number; hu: number; hT: number };
    const a = Math.atan2(H.nz, H.nx);
    c.facing = c.targetFacing = a; c.setState('attack');
    const place = () => { c.x = H.ex + H.nx * (-1.3 + H.hu * 2.6); c.z = H.ez + H.nz * (-1.3 + H.hu * 2.6); };
    const hp = n.hp ?? 0;
    if (ev.hurt > 10 && hp === 2 && rng.chance(0.5)) { n.hp = 3; m.hpT = now; }
    if (hp === 0) {
      // the lunge: up out of the water at the lip
      H.hu = Math.min(0.25, H.hu + dt * 0.5); place(); c.speed = 2;
      if (H.hu >= 0.25) { n.hp = 1; m.hpT = now; fx(c, 'slap'); }
    } else if (hp === 1) {
      c.speed = 0.2;
      if (now - m.hpT > 0.45) { n.hp = 2; m.hpT = now; H.heaves = 0; H.hT = now; m.hu0 = H.hu; m.gain = 0; }
    } else if (hp === 2) {
      // heave after heave: each one drags it a little further up, or it loses some ground
      const k = (now - H.hT) / 1.05;
      if (k >= 1) {
        H.heaves++; H.hT = now; m.hu0 = H.hu;
        const won = rng.chance(0.58 - H.heaves * 0.03);
        m.gain = won ? rng.float(0.16, 0.24) : -rng.float(0.04, 0.09);
        fx(c, won ? 'heave' : 'strain');
      }
      const k2 = Math.min(1, (now - H.hT) / 1.05), pullK = k2 < 0.45 ? Math.sin((k2 / 0.45) * Math.PI * 0.5) : 1;
      H.hu = clampN((m.hu0 ?? H.hu) + (m.gain ?? 0) * pullK, 0.05, 1.05);
      place(); c.speed = 0.15 + pullK * 0.3;
      if (H.hu >= 1) { gSet(c, 'land'); n.hu = 0; m.vx = H.nx * 0.4; m.vz = H.nz * 0.4; m.lph = 0.45; fx(c, 'out'); return true; }
      if (H.heaves >= 7 || (H.heaves >= 3 && H.hu < 0.2) || !deckPrey) { n.hp = 3; m.hpT = now; }
    } else {
      // it loses its grip and slides back in
      H.hu = Math.max(0, H.hu - dt * 1.4); place(); c.speed = 1;
      if (H.hu <= 0) { fx(c, 'slip'); gSet(c, 'return'); m.restT = now + 5; m.haulCD = now + rng.float(10, 18); n.hu = 0; m.vx = -H.nx * 1.2; m.vz = -H.nz * 1.2; return true; }
    }
    n.hu = Math.round(H.hu * 100) / 100; n.dy = H.deckY;
    return true;
  }
  // ---------------- out on the tile: heavy lurches after them, back to the water when it gives up
  if (md === 'land') {
    c.setState('chase');
    const p = deckPrey?.p;
    if (p && deckPrey!.d < 2.6 && Math.abs(wrapA(angTo(c, p.x, p.z) - c.facing)) < 0.6) {
      gSet(c, 'burst'); fx(c, 'burst'); m.from = { x: c.x, z: c.z }; m.target = { x: p.x, z: p.z }; m.prey = p.id; c.targetId = p.id; ruleShown(c);
      return true;
    }
    if (!p || m.mdT > 9) { gSet(c, 'return'); m.restT = now + 6; m.haulCD = now + 15; return true; }
    gPhys(c, z, p.x, p.z, 1, dt, 'land');
    return true;
  }
  if (md === 'lurk' || md === 'stalk' || md === 'return') {
    n.sub = md === 'lurk' ? 1 : 0.5;
    if (now < (m.restT ?? 0)) { prey = null; deckPrey = null; }
    // out of the water: lurch back to the nearest deep water and slide in
    if (!inWater) {
      c.setState('flee');
      const home = pl ? { x: pl.lair[0] + 0.5, z: pl.lair[1] + 0.5 } : m.home;
      const w = (m.backTo && waterAt(z, m.backTo.x, m.backTo.z) === 'deep' ? m.backTo : null) ?? waterSpot(z, c.x, c.z, 6, 'deep') ?? home;
      m.backTo = w;
      gPhys(c, z, w.x, w.z, 1, dt, 'land');
      if (waterAt(z, c.x + Math.cos(c.facing) * 0.8, c.z + Math.sin(c.facing) * 0.8) === 'deep' || waterAt(z, c.x, c.z) === 'deep') { m.backTo = null; fx(c, 'plunge'); c.x += Math.cos(c.facing) * 0.6; c.z += Math.sin(c.facing) * 0.6; m.vx = Math.cos(c.facing) * 1.8; m.vz = Math.sin(c.facing) * 1.8; }
      return true;
    }
    if (prey && prey.d < 3.4) {
      // up out of the water at them: the surge
      gSet(c, 'burst'); fx(c, 'burst'); m.from = { x: c.x, z: c.z }; m.target = { x: prey.p.x, z: prey.p.z }; m.prey = prey.p.id; c.targetId = prey.p.id; ruleShown(c);
      return true;
    }
    // someone on the deck out of reach: swim at the edge and try to drag itself out after them
    if (!prey && deckPrey && deckPrey.d > 3.4 && now > (m.haulCD ?? 0) && (md === 'stalk' || deckPrey.d < 6)) {
      const E = edgeToward(z, c, deckPrey.p.x, deckPrey.p.z);
      if (E) {
        const ax = E.ex - E.nx * 1.3, az = E.ez - E.nz * 1.3;
        const r = gPhys(c, z, ax, az, 1, dt, 'water');
        if (md !== 'stalk') gSet(c, 'stalk');
        c.setState('stalk');
        if (r.d < 0.7 || (r.wall && r.d < 2)) {
          gSet(c, 'haul'); n.hp = 0; m.hpT = now; m.hu0 = 0; m.gain = 0;
          m.haul = { ...E, heaves: 0, hu: 0, hT: now }; c.targetId = deckPrey.p.id; ruleShown(c);
          fx(c, 'lunge');
        }
        return true;
      }
      m.haulCD = now + 4;
    }
    // breathing: every half minute or so it rises, puts its nostrils out, blows, and sinks again
    if (now > (m.brT ?? 0)) { n.br = 1; if (now > m.brT + 1.6 && !m.blew) { m.blew = 1; fx(c, 'breath'); } if (now > m.brT + 4.5) { n.br = 0; m.blew = 0; m.brT = now + rng.float(18, 38); } }
    if (prey) {
      // creep toward them through the deep water
      c.setState('stalk');
      const to = waterAt(z, prey.p.x, prey.p.z) === 'deep' ? { x: prey.p.x, z: prey.p.z } : null;
      const tgt = to ?? (() => { const a = angTo(c, prey!.p.x, prey!.p.z); const x = c.x + Math.cos(a) * 1.6, zz = c.z + Math.sin(a) * 1.6; return waterAt(z, x, zz) === 'deep' ? { x, z: zz } : null; })();
      if (tgt) gPhys(c, z, tgt.x, tgt.z, 0.75, dt, 'water');
      else gPhys(c, z, c.x + Math.cos(c.facing) * 0.1, c.z + Math.sin(c.facing) * 0.1, 0, dt, 'water');
      if (md !== 'stalk') gSet(c, 'stalk');
      return true;
    }
    // nothing: settle on the bottom, drift a little
    c.setState('hide');
    if (md !== 'lurk' && m.mdT > 3) gSet(c, 'lurk');
    if (!m.drift || m.mdT > (m.dT ?? 20)) { m.drift = waterSpot(z, c.x, c.z, 5, 'deep'); m.dT = rng.float(15, 40); m.mdT = 0; }
    if (m.drift) { if (gPhys(c, z, m.drift.x, m.drift.z, md === 'return' ? 0.7 : 0.25, dt, 'water').d < 0.6) m.drift = null; }
    else gPhys(c, z, c.x, c.z, 0, dt, 'water');
    return true;
  }
  if (md === 'burst') {
    // the surge: it comes up and forward a couple of metres, mouth wide
    const k = Math.min(1, m.mdT / 0.55);
    const a = angTo(m.from, m.target.x, m.target.z), L = Math.min(3, Math.hypot(m.target.x - m.from.x, m.target.z - m.from.z));
    c.x = m.from.x + Math.cos(a) * L * k; c.z = m.from.z + Math.sin(a) * L * k; c.vx = c.vz = 0; c.speed = 4;
    m.vx = Math.cos(a) * 1.5; m.vz = Math.sin(a) * 1.5;
    c.facing = c.targetFacing = a; n.sub = 0; c.setState('attack');
    if (k >= 1) {
      const p = G.players.get(m.prey);
      if (p && !p.body.dead && dist(p, c) < 1.9) {
        gSet(c, 'gulp'); n.gp = p.id; m.gulpEnd = now + rng.float(4.5, 6.5); m.gulpHurt = 0; fx(c, 'gulp', { pid: p.id });
        hitPlayer(c, p, rng.float(8, 14), ['bite', 'deep'], 0, ['torso_u', 'torso_l', 'thigh_l', 'thigh_r'], 0.02);
      } else { gSet(c, 'return'); m.restT = now + 4; fx(c, 'miss'); }
    }
    return true;
  }
  gSet(c, 'return');
  return true;
}

const W8 = () => (live() ? ((G as any).water ?? null) : null) as null | { levelAt(x: number, z: number): number | null; disturb(x: number, z: number, a: number, r?: number, f?: number): void; splash(x: number, z: number, p?: number, s?: boolean): void; pour(x: number, y: number, z: number, r: number, n: number): void; ring(x: number, z: number, y: number, r0: number, sp: number, life: number): void; drop(x: number, y: number, z: number, vx: number, vy: number, vz: number, s?: number): void };
function animateGulper(rig: Rig, c: Creature, t: number, dt: number) {
  const K = rig as KitRig;
  if (K.kit.who !== c.id) { K.kit.who = c.id; kitPersonalize(K, Math.floor(hashId(c.id) * GV)); }
  K.kit.F.fx.value.y += dt; K.kit.F.fx.value.z = Math.min(1, c.hitFlash / 0.15) * 0.4;
  const n = netOf(c), ud = rig.root.userData as Record<string, any>;
  const md = (n.md ?? 'lurk') as GMd;
  const z = live() ? G.zones.get(c.zoneKey) as Zone ?? null : null;
  const W = W8();
  const fa = c.facing, cf = Math.cos(fa), sf = Math.sin(fa);
  const at = (d: number) => [c.x + cf * d, c.z + sf * d] as const;
  const f = fxPoll(rig, c);
  if (f) {
    if (f.key === 'burst') {
      playAt('lifeguard_splash', c, 1, 26, 0.7); playAt('arv_gulp', c, 1, 26, 0.5); playAt('davenport_roar', c, 0.6, 30, 0.45);
      if (G.local && dist(G.local, c) < 10) G.camera?.shake?.(0.35, 0.5);
      if (W) { const [hx, hz] = at(1.4); W.splash(hx, hz, 2.6, false); W.splash(c.x, c.z, 1.6, false); }
    }
    else if (f.key === 'gulp') { playAt('bh_gulp', c, 1, 18, 0.55); playAt('bh_swallow', c, 0.9, 16, 0.6); ud.gulpT = t; if (W) W.splash(c.x + cf * 1.6, c.z + sf * 1.6, 1.8, false); }
    else if (f.key === 'chew') playAt(rng.chance(0.5) ? 'bh_squelch' : 'gore_squelch', c, 0.7, 12, 0.6);
    else if (f.key === 'spit') { playAt('arv_spit', c, 1, 20, 0.6); playAt('lifeguard_splash', c, 0.8, 20, 0.9); spitOut(c, f.a?.pid, f.a?.a ?? c.facing); if (W) W.splash(c.x + cf * 1.8, c.z + sf * 1.8, 1.4, false); }
    else if (f.key === 'miss') { playAt('lifeguard_splash', c, 0.6, 16, 1.1); if (W) W.splash(c.x + cf * 1.8, c.z + sf * 1.8, 1.2, false); }
    else if (f.key === 'lunge') { playAt('lifeguard_splash', c, 0.9, 22, 0.8); if (W) { W.splash(c.x + cf * 1.2, c.z + sf * 1.2, 2.2, false); W.splash(c.x - cf * 1.5, c.z - sf * 1.5, 1.2, false); } }
    else if (f.key === 'slap') { playAt('bh_squelch', c, 1, 18, 0.6); playAt('lifeguard_splash', c, 0.7, 18, 1.2); if (W) { W.splash(c.x + cf * 0.6, c.z + sf * 0.6, 1.4, false); for (let i = 0; i < 14; i++) W.drop(c.x + cf * 1.6 + (Math.random() - 0.5) * 1.2, (n.dy ?? 0) + 0.15, c.z + sf * 1.6 + (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 2, 1 + Math.random() * 1.5, (Math.random() - 0.5) * 2, 0.025); } if (G.local && dist(G.local, c) < 8) G.camera?.shake?.(0.15, 0.25); }
    else if (f.key === 'heave') { playAt(rng.chance(0.5) ? 'hollow_moan' : 'bh_squelch', c, 0.55, 16, 0.6); if (W) W.splash(c.x - cf * 1.3, c.z - sf * 1.3, 0.9, false); }
    else if (f.key === 'strain') { playAt('hollow_moan', c, 0.7, 18, 0.5); if (W) W.splash(c.x - cf * 1.6, c.z - sf * 1.6, 1.3, false); }
    else if (f.key === 'slip') { playAt('lifeguard_splash', c, 1, 24, 0.65); playAt('lifeguard_sink', c, 0.6, 18, 0.8); if (W) { W.splash(c.x, c.z, 2.8, false); W.splash(c.x + cf, c.z + sf, 1.6, false); } }
    else if (f.key === 'out') playAt('bh_squelch', c, 0.9, 18, 0.45);
    else if (f.key === 'plunge') { playAt('lifeguard_splash', c, 1, 24, 0.6); if (W) { W.splash(c.x + cf * 1.2, c.z + sf * 1.2, 2.6, false); } }
    else if (f.key === 'breath') { playAt('lifeguard_bubbles', c, 0.7, 14, 0.7); if (W) { const [hx, hz] = at(1.9); W.splash(hx, hz, 0.35, false); W.disturb(hx, hz, 0.6, 0.5, 0.4); } }
  }
  const water = waterAt(z, c.x, c.z);
  const swim = water === 'deep' ? 1 : 0;
  ud.sw = (ud.sw ?? swim) + (swim - (ud.sw ?? swim)) * damp(3, dt);
  // hauling out: how far up over the edge it has dragged itself
  const huT = md === 'haul' ? (n.hu ?? 0) : 0;
  ud.hu = (ud.hu ?? 0) + (huT - (ud.hu ?? 0)) * damp(md === 'haul' ? 7 : 3, dt);
  const hu = ud.hu, hauling = md === 'haul' || hu > 0.03;
  ud.rch = (ud.rch ?? 0) + ((md === 'haul' && (n.hp ?? 0) < 3 ? 1 : 0) - (ud.rch ?? 0)) * damp(md === 'haul' ? 6 : 3, dt);
  const onLand = !hauling && !swim && water !== 'shallow';
  ud.ld = (ud.ld ?? 0) + ((onLand || md === 'land' ? 1 : 0) - (ud.ld ?? 0)) * damp(4, dt);
  // how far under: 1 lying on the bottom, 0 the back awash at the surface; it rises to breathe
  const breathing = !!n.br && (md === 'lurk' || md === 'stalk');
  const dT = c.dead ? 0.6 : breathing ? 0 : md === 'lurk' ? 1 : md === 'stalk' ? 0.55 : md === 'burst' ? -0.45 : md === 'gulp' ? 0.3 : 0.45;
  ud.sub = (ud.sub ?? dT) + (dT - (ud.sub ?? dT)) * damp(md === 'burst' ? 12 : 1.6, dt);
  const floorY = z ? z.heightAt(Math.floor(c.x), Math.floor(c.z)) : c.y;
  const lv = W?.levelAt(c.x, c.z) ?? (swim ? floorY + 0.84 : null);
  if (md === 'burst' && ud.lastMd !== 'burst') ud.bT = t;
  ud.lastMd = md;
  const bt = md === 'burst' ? t - (ud.bT ?? t) : 9;
  // the heave of effort (hauling): pulls in time with the host's heaves
  ud.hph = (ud.hph ?? 0) + dt / 1.05;
  const heave = md === 'haul' && (n.hp ?? 0) === 2 ? Math.max(0, Math.sin(Math.min(1, (ud.hph % 1) / 0.45) * Math.PI)) * ((ud.hph % 1) < 0.45 ? 1 : 0) : 0;
  let ry: number;
  if (hauling) {
    const deckY = n.dy ?? 0, lvl = n.lv ?? (lv ?? -0.06);
    const s = hu * hu * (3 - 2 * hu);
    ry = lvl - 0.6 + (deckY - 0.03 - (lvl - 0.6)) * Math.min(1, s * 1.1);
  } else if (swim && lv !== null) {
    ry = Math.max(floorY, lv - 0.58 + (floorY - (lv - 0.58)) * clamp01(ud.sub)) + (md === 'burst' ? Math.sin(Math.min(1, bt / 0.55) * Math.PI) * 0.45 : 0);
  } else ry = floorY + (md === 'burst' ? Math.sin(Math.min(1, bt / 0.55) * Math.PI) * 0.25 : 0);
  ud.ry = (ud.ry ?? ry) + (ry - (ud.ry ?? ry)) * damp(md === 'burst' || hauling ? 10 : 3, dt);
  rig.root.position.y = ud.ry;
  // the strike is a suction strike: the throat drops, the jaws flash open only part way with the lip lobes
  // closed in to a tube, and the water ahead (and whatever is in it) rushes into the mouth; then it snaps shut
  const suckT = md === 'burst' ? (bt < 0.5 ? 1 : 0) : 0;
  // idle gulps: every few seconds it drops its throat and snaps a mouthful of water
  if (!c.dead && (md === 'lurk' || md === 'stalk') && t > (ud.igT ?? 0)) { ud.igT = t + rng.float(4.5, 8); ud.igS = t; if (G.local && dist(G.local, c) < 12) playAt('bh_gulp', c, 0.35, 10, 0.9); }
  const ig = t - (ud.igS ?? -9) < 0.45 ? Math.sin(((t - (ud.igS ?? -9)) / 0.45) * Math.PI) : 0;
  ud.sk = (ud.sk ?? 0) + (Math.max(suckT, ig * 0.35) - (ud.sk ?? 0)) * damp(suckT ? 30 : 9, dt);
  ud.pk = (ud.pk ?? 0) + (Math.max(suckT, ig * 0.7) - (ud.pk ?? 0)) * damp(20, dt);
  // the full, flat-open gape is its threat: struck at, or striking at a unit already in its reach
  const gT = c.attackPhase > 0 ? 0.85 : md === 'gulp' ? (t - (ud.gulpT ?? -9) < 0.25 ? 0.5 : 0) : md === 'land' ? 0.12 : md === 'stalk' ? 0.05 : 0.02;
  ud.g = (ud.g ?? 0) + (gT - (ud.g ?? 0)) * damp(gT > (ud.g ?? 0) ? 16 : 6, dt);
  const gl = md === 'gulp' ? 1 : 0;
  ud.gl = (ud.gl ?? 0) + (gl - (ud.gl ?? 0)) * damp(gl ? 4 : 1.2, dt);
  ud.dk = c.dead ? Math.min(1, (ud.dk ?? 0) + dt) : 0;
  const pump = md === 'gulp' && t - (ud.gulpT ?? -9) < 2.5 ? 1 : 0;
  // turning: the root's yaw rate drives the spine's lag and whip
  const rootY = rig.root.rotation.y;
  const dY = wrapA(rootY - (ud.lry ?? rootY)); ud.lry = rootY;
  ud.turn = (ud.turn ?? 0) + ((dt > 0 ? clampN(dY / dt, -3, 3) : 0) - (ud.turn ?? 0)) * damp(10, dt);
  const thrash = md === 'haul' ? ((n.hp ?? 0) === 3 ? 1.3 : (n.hp ?? 0) === 2 ? 0.8 + heave * 0.5 : 0.6) : md === 'burst' ? 0.9 : md === 'gulp' ? 0.25 : 0;
  const host = !!(c.mem && c.mem.sph !== undefined && G.role !== 'client');
  const lph = (host && c.mem.lph !== undefined ? c.mem.lph : (ud.lph = ((ud.lph ?? 0) + dt / 1.3 * (ud.ld > 0.3 ? 1 : 0)) % 1)) as number;
  const yaw = spineStep(ud, dt, { speed: c.speed, swim: ud.sw * (1 - Math.min(1, hu * 2)), thrash, turn: ud.turn, land: ud.ld, lph, dead: ud.dk });
  // the body tipped up the edge, the chest draped over the lip, the head up to breathe or to see
  const bodyPitch = hauling ? 0.42 * Math.sin(Math.PI * Math.min(1, hu * 1.05)) + heave * 0.06 : md === 'burst' ? 0.25 * Math.sin(Math.min(1, bt / 0.55) * Math.PI) : 0;
  const sag = hauling ? 0.32 * clamp01((hu - 0.3) / 0.45) * (1 - clamp01((hu - 0.85) / 0.2)) : 0;
  const headUp = breathing ? 0.55 : md === 'lurk' ? 0.22 : hauling ? 0.3 * (1 - hu) + heave * 0.2 : md === 'land' ? 0.12 : 0;
  ud.hup = (ud.hup ?? 0) + (headUp - (ud.hup ?? 0)) * damp(2.5, dt);
  poseGulper(rig, {
    t, dt, speed: c.speed, gape: ud.g, sub: ud.sub, gulp: ud.gl, struggle: gl, swim: ud.sw, dead: ud.dk, flinch: clamp01(c.hitFlash / 0.15), suck: ud.sk, pump, pucker: ud.pk,
    yaw, bodyPitch, sag, headUp: ud.hup, steady: 0.4 + 0.5 * ud.sw, lph, land: ud.ld * (1 - ud.rch), reach: ud.rch, heave, thrash,
  });
  // ---------------- the water round it
  if (W && !c.dead && z) {
    const k60 = Math.min(3, dt * 60);
    if (swim && lv !== null) {
      const sp = c.speed;
      const top = ud.ry + 0.72;
      // a body moving just under the surface lifts a hump ahead and leaves a trough and a wake; deep down only a swell
      const nearS = clamp01(1 - (lv - top) / 0.7);
      if (sp > 0.15) {
        const [hx, hz] = at(1.6);
        W.disturb(hx, hz, sp * 0.05 * nearS * k60, 0.8);
        W.disturb(c.x - cf * 0.6, c.z - sf * 0.6, -sp * 0.05 * nearS * k60, 0.9, sp * 0.02 * nearS * k60);
      }
      // each beat of the tail shoves water sideways
      const ph = (ud.spine?.ph ?? 0), tail = Math.sin(ph - 5);
      const [tx, tz] = at(-2.6);
      W.disturb(tx - sf * tail * 0.5, tz + cf * tail * 0.5, Math.abs(Math.cos(ph - 5)) * -0.03 * (0.3 + sp) * nearS * k60, 0.6);
      // the surge: a bow wave thrown off the head, spray along it
      if (md === 'burst' && bt < 0.6) {
        const [hx, hz] = at(2.0);
        W.disturb(hx, hz, 0.5 * k60, 1.1, 0.3 * k60);
        W.disturb(hx - sf * 1.0, hz + cf * 1.0, 0.25 * k60, 0.8); W.disturb(hx + sf * 1.0, hz - cf * 1.0, 0.25 * k60, 0.8);
        for (let i = 0; i < 2; i++) { const s = Math.random() < 0.5 ? -1 : 1; W.drop(hx + -sf * s * 0.7, lv + 0.1, hz + cf * s * 0.7, -sf * s * 2.5 + cf * 2, 2 + Math.random() * 2, cf * s * 2.5 + sf * 2, 0.03); }
      }
      // breathing: the snout up through the surface, a ring spreading off it
      if (breathing && Math.random() < dt * 1.5) { const [hx, hz] = at(1.9); W.ring(hx, hz, lv, 0.15, 0.5, 1.2); }
    }
    if (hauling) {
      // water pours off the body as it comes up out of the pool, the tail beats the water white
      if (Math.random() < dt * 30 * Math.min(1, hu * 3)) { const zz = -0.8 + Math.random() * 2.2, [px, pz] = at(zz); W.pour(px, ud.ry + 0.55 + zz * 0.15, pz, 0.45, 1); }
      const ph = (ud.spine?.ph ?? 0);
      const [tx, tz] = at(-2.5);
      W.disturb(tx - sf * Math.sin(ph - 5) * 0.6, tz + cf * Math.sin(ph - 5) * 0.6, -0.12 * thrash * k60, 0.7, 0.05 * k60);
      if (Math.random() < dt * 4 * thrash) W.splash(tx - sf * Math.sin(ph - 5) * 0.6, tz + cf * Math.sin(ph - 5) * 0.6, 0.5 + thrash * 0.3, false);
    } else if (ud.ld > 0.5 && Math.random() < dt * 6 && (t - (ud.wetT ?? (ud.wetT = t))) < 6) { const zz = -1 + Math.random() * 2.4, [px, pz] = at(zz); W.pour(px, ud.ry + 0.45, pz, 0.4, 1); }
    if (swim) ud.wetT = t;
  }
  // the pull: a unit in front of the mouth while it sucks is dragged toward it (on their own machine)
  if (live() && G.local && suckT && !c.dead) {
    const me = G.local, hx = c.x + cf * 1.9, hz = c.z + sf * 1.9;
    const dx = hx - me.x, dz = hz - me.z, d = Math.hypot(dx, dz);
    const ahead = (me.x - c.x) * cf + (me.z - c.z) * sf;
    if (d < 4.2 && d > 0.3 && ahead > 0) { const k = (1 - d / 4.2) * 6 * dt; me.x += (dx / d) * k * 2.2; me.z += (dz / d) * k * 2.2; thinkOnce(me, 'pl_suck', 'It is PULLING me in. The water is going into its mouth and I am going with it.', 20); }
  }
  // the swallowed unit: held inside it (on their own machine)
  if (live() && G.local) {
    const me = G.local;
    if (n.gp === me.id && !c.dead) {
      me.x = c.x + cf * 0.2; me.z = c.z + sf * 0.2; me.vx = me.vz = 0;
      (me as any).__gulpedUntil = G.time + 0.3;
      thinkOnce(me, 'pl_gulped', ['It is dark and wet and it is squeezing. Hit it. HIT IT.', 'I am inside it. I am INSIDE it.', 'Everything is pink and pressing in.'][Math.floor(t) % 3], 4);
    }
    for (const p of G.players.values()) if (p.id === n.gp && p !== me) (p as any).__gulpedUntil = G.time + 0.3;
  }
  hookHide();
  if (c.dead || !live()) return;
  const p = localIn(c);
  if (p && dist(p, c) < 9) {
    if (md === 'lurk' && dist(p, c) < 6) thinkOnce(p, 'pl_lurk', ['Two little bumps on the water, perfectly still. Nostrils?', 'Something pale on the bottom of the deep end. Something big.'][Math.floor(t * 0.2) % 2], 70);
    else if (md === 'gulp' && n.gp !== p.id) thinkOnce(p, 'pl_gulp_saw', 'It swallowed them WHOLE. They are in there. You can see them kicking.', 30);
    else if (md === 'haul') thinkOnce(p, 'pl_haul', 'It is coming OUT. It is dragging itself up onto the tile.', 40);
  }
}
/** on the victim's machine: thrown out beside it, onto the nearest dry tile */
function spitOut(c: Creature, pid: string, a: number) {
  if (!live() || !G.local || G.local.id !== pid) return;
  const p = G.local, z = G.zone;
  for (let r = 1; r < 8; r++) for (let k = 0; k < 12; k++) {
    const aa = a + Math.PI + (k / 12) * Math.PI * 2;
    const x = c.x + Math.cos(aa) * r, zz = c.z + Math.sin(aa) * r;
    const tx = Math.floor(x), ty = Math.floor(zz);
    if (!z.inb(tx, ty) || !z.floor[z.idx(tx, ty)] || z.solid[z.idx(tx, ty)] || z.floorAt(tx, ty)?.water === 'deep') continue;
    p.x = tx + 0.5; p.z = ty + 0.5; (p as any).__gulpedUntil = 0;
    bus.emit('think', p, ['It spat me out. I am covered in it.', 'Out. OUT. Get away from the edge.'][Math.floor(Math.random() * 2)]);
    return;
  }
}
/** hide swallowed units from the picture (after the game's own visibility pass) */
let hooked = false;
function hookHide() {
  if (hooked || !live() || !G.pr?.scene) return;
  hooked = true;
  const scene = G.pr.scene as THREE.Scene;
  const prev = scene.onBeforeRender;
  scene.onBeforeRender = function (this: THREE.Scene, ...a: any[]) {
    (prev as any).apply(this, a);
    for (const p of G.players.values()) if (((p as any).__gulpedUntil ?? 0) > G.time) p.rig.root.visible = false;
  } as any;
}

const GULPER = def({
  key: 'gulper', name: 'Gulper', code: 'GP-07 // FAUNA, CRYPTOBRANCHID (LEUCISTIC, APEX)', temperament: 'ambush', threat: 4,
  rule: { name: 'STAND BACK FROM THE DEEP END', text: 'It lies on the bottom of the deep water with only its nostrils up and takes whatever comes to the edge or into the water: a unit within a long step of deep water, or swimming. It gulps you whole and holds you; hit it hard enough from inside (or let someone hit it from outside) and it spits you out. It barely leaves the water and it is slow on land. Two little bumps on still water mean it is there.', tell: 'Two little bumps on the surface of the deep end, perfectly still.' },
  hp: 420, walk: 0.7, run: 2.4, turn: 2.2, radius: 0.85, height: 0.7, sight: 10, fov: 2.2, hearing: 1.6, vibration: true,
  attack: { dmg: [10, 18], range: 1.8, cooldown: 2.2, kinds: ['bite', 'deep'], corrupt: 0.01, knock: 0.6 },
  zones: ['plunge'], weight: 0, maxPerZone: 1, diet: 'meat',
  meat: [['gulper_meat', 4]],
  sounds: { idle: 'lifeguard_bubbles', alert: 'davenport_roar', attack: 'bh_gulp', hurt: 'hollow_moan', death: 'lifeguard_sink' },
  scan: { cls: 'Fauna / giant salamander (leucistic)', notes: ['Four metres of white salamander. The head is nearly all mouth.', 'It lies in the deep end with only its nostrils up.', 'It gulps a unit whole and holds them. Hurt it and it spits them out.', 'Slow on land; it does not like to leave the water.'] },
  gore: { blood: 'pale', tint: 0xf0c8c8, flesh: 0xf0e4dc, gib: false, sever: ['t2', 'lFL', 'lBR'], head: 'skull' },
  disposition: { mood: 'territorial', self: true },
  build: buildGulper, animate: animateGulper, think: thinkGulper,
});
(GULPER as any).handlesSevered = true;
onPlayerHit('gulper', (p, h) => { if ((h?.dmg ?? 0) > 8) bus.emit('think', p, ['Teeth. Hundreds of little teeth.', 'It came out of the water like a door opening.'][Math.floor(Math.random() * 2)]); });

// =====================================================================================
// GULPER TADPOLE
// =====================================================================================
function buildTadpole(): Rig {
  const rig = newRig(0.2);
  const S = PG.reg('TSKIN'), Fn = PG.reg('TFIN'), M = PG.reg('GMOUTH'), E = PG.reg('GEYE'), Tt = PG.reg('GTOOTH');
  const body = bpart(rig, 'tbody', rig.body, [0, 0.08, 0], PG, 'tbody', (ob) => {
    // a great round head, flat underneath, tapering into the tail root
    ob.loft([0.16, 0.1, 0.02, -0.06, -0.12].map((z, i) => ({ pts: bodyRing(z, 0, [0.06, 0.12, 0.13, 0.08, 0.035][i], [0.05, 0.08, 0.08, 0.05, 0.025][i], [0.02, 0.05, 0.05, 0.04, 0.02][i], 13, 2.2), v: 1 - i / 4 })), S, { start: 'pole', end: 'pole', startBulge: 0.02 });
    for (const sx of [-1, 1]) ob.blob([sx * 0.08, 0.06, 0.1], [0.014, 0.014, 0.014], 6, 4, E, { emis: 0.25 });
    // the little gulper mouth: a broad lip line with teeth
    ob.loft([0.17, 0.12].map((z, i) => ({ pts: bodyRing(z, -0.01, 0.09 - i * 0.02, 0.006, 0.006, 11, 2), v: i })), M, {});
    for (let i = 0; i < 12; i++) { const a = (i / 11 - 0.5) * 2.4; ob.cone([Math.sin(a) * 0.075, -0.012, 0.11 + Math.cos(a) * 0.055], [0, -1, 0], 0.004, 0.014, 3, Tt); }
  });
  void body;
  // the tail: three links of fin
  let par: THREE.Object3D = rig.parts.tbody, at: V3 = [0, 0, -0.12];
  for (let i = 0; i < 3; i++) {
    par = bpart(rig, 'tt' + i, par, at, PG, 'ttail' + i, (ob) => {
      const L = 0.09;
      ob.loft([0, -L].map((z, j) => ({ pts: bodyRing(z, 0, 0.012 - i * 0.003, 0.05 - i * 0.01 - j * 0.008, 0.04 - i * 0.008 - j * 0.006, 9, 2), v: 1 - j })), Fn, { end: i === 2 ? 'pole' : null, endBulge: 0.04, double: true });
    });
    at = [0, 0, -0.09];
  }
  rig.eyes = [];
  return rig;
}
function animateTadpole(rig: Rig, c: Creature, t: number, dt: number) {
  applyLook(rig, c, PG, 0.1);
  const n = netOf(c), ud = rig.root.userData as Record<string, any>, P = rig.parts;
  const seed = hashId(c.id);
  const grow = 1 + Math.min(0.8, (n.age ?? 0) / 900);
  rig.root.scale.setScalar(grow * (c.dead ? 0.95 : 1));
  ud.ph = (ud.ph ?? seed * 9) + dt * (8 + c.speed * 14);
  const atk = c.attackPhase > 0 ? 1 : 0;
  const z = live() ? G.zones.get(c.zoneKey) as Zone ?? null : null;
  const inW = !!waterAt(z, c.x, c.z) || !z;
  rig.root.position.y = c.y - (inW ? 0.07 : 0) + (c.dead ? -0.02 : 0);
  P.tbody.rotation.set(atk * 0.25 - (c.dead ? 0 : 0), Math.sin(ud.ph) * 0.15, c.dead ? Math.PI * 0.9 : Math.sin(ud.ph * 0.5) * 0.05);
  for (let i = 0; i < 3; i++) P['tt' + i].rotation.set(0, Math.sin(ud.ph - i * 1.1) * (0.4 + i * 0.15) * (c.dead ? 0.1 : 1), 0);
  if (c.dead || !live()) return;
  const p = localIn(c);
  if (p && c.visibleToLocal && dist(p, c) < 4) thinkOnce(p, 'pl_tad', ['Tadpoles. Big white ones. Every one of them has the same mouth.', 'They are nibbling. They are NIBBLING me.'][Math.floor(t * 0.3) % 2], 70);
}
function thinkTadpole(c: Creature, dt: number): boolean {
  const z = G.getZone(c.zoneKey) as Zone, m = c.mem, n = net(c), cs = CS(), now = G.time;
  pulse(c);
  m.age = (m.age ?? rng.float(0, 300)) + dt; if (Math.floor(m.age) % 5 === 0) n.age = Math.round(m.age);
  if (!m.swarm) m.swarm = { x: c.x, z: c.z };
  // out of the water: back in, fast
  if (!waterAt(z, c.x, c.z)) {
    const w = waterSpot(z, c.x, c.z, 4, 'any') ?? waterSpot(z, m.swarm.x, m.swarm.z, 8, 'any');
    if (w) cs.moveTo(c, z, w.x, w.z, c.sp.run, dt, 0.3);
    return true;
  }
  // a unit's legs in the water nearby: everyone nibbles
  const near = nearestP(c, 4.5, (p) => !!waterAt(z, p.x, p.z));
  if (near) {
    c.setState('chase'); c.targetId = near.p.id;
    cs.moveTo(c, z, near.p.x + Math.cos(hashId(c.id) * 6) * 0.3, near.p.z + Math.sin(hashId(c.id) * 6) * 0.3, c.sp.run, dt, 0.25);
    if (near.d < c.sp.attack!.range + 0.25 && c.attackT <= 0) { attack(c, near.p); if (near.d < 3) ruleShown(c); }
    return true;
  }
  // milling about the swarm's patch of water
  c.setState('wander');
  if (!m.goal || m.mdT > (m.wT ?? 2)) { m.goal = waterSpot(z, m.swarm.x, m.swarm.z, 3, 'any'); m.wT = rng.float(1, 3.5); m.mdT = 0; }
  m.mdT = (m.mdT ?? 0) + dt;
  if (m.goal && cs.moveTo(c, z, m.goal.x, m.goal.z, rng.chance(0.3) ? c.sp.run : c.sp.walk, dt, 0.2)) m.goal = null;
  void now;
  return true;
}
const TADPOLE = def({
  key: 'gulper_tadpole', name: 'Gulper Tadpole', code: 'GP-08 // FAUNA, CRYPTOBRANCHID (LARVA)', temperament: 'hostile', threat: 1,
  rule: { name: 'KEEP YOUR FEET OUT', text: 'They swarm in the shallows and nibble any legs that come into the water: harmless one at a time, worrying in a crowd. They never leave the water; step out of it and they lose interest.', tell: 'Pale tadpoles as long as a hand, all head and mouth.' },
  hp: 5, walk: 0.8, run: 2.6, turn: 10, radius: 0.12, height: 0.12, sight: 5, fov: 2.8, hearing: 1.2, vibration: true,
  attack: { dmg: [1, 2], range: 0.4, cooldown: 1.0, kinds: ['bite', 'scratch'], corrupt: 0, knock: 0, parts: ['foot_l', 'foot_r', 'shin_l', 'shin_r'] },
  zones: ['plunge', 'pools'], weight: 1, group: [4, 7], maxPerZone: 14, diet: 'meat',
  meat: [['tadpole_meat', 1]],
  sounds: { idle: 'bubble_wob', attack: 'bh_chew', hurt: 'cower_squeak', death: 'bh_plop', step: 'step_water' },
  scan: { cls: 'Fauna / giant salamander larva', notes: ['A Gulper tadpole: big head, a little copy of the mouth.', 'They swarm the shallows and nibble at legs.', 'They grow. Give them time and they get a lot bigger.'] },
  gore: { blood: 'pale', tint: 0xf0d0d0, flesh: 0xf0e4dc, gib: true },
  remains: 'decal_puddle',
  disposition: { mood: 'predator', self: true },
  build: buildTadpole, animate: animateTadpole, think: thinkTadpole,
});

// =====================================================================================
// FROG PIRANHA
// =====================================================================================
function buildPiranha(): Rig {
  const rig = newRig(0.35);
  const S = PG.reg('PSKIN'), Bl = PG.reg('PBELLY'), Fn = PG.reg('PFIN'), E = PG.reg('PEYE'), Tt = PG.reg('PTOOTH'), L = PG.reg('PLEG');
  const body = bpart(rig, 'pbody', rig.body, [0, 0.22, 0], PG, 'pbody', (ob) => {
    // a deep, flat-sided body, humped behind the head
    const zs = [0.2, 0.14, 0.04, -0.08, -0.17, -0.22];
    const rx = [0.03, 0.055, 0.065, 0.055, 0.035, 0.02], up = [0.06, 0.12, 0.14, 0.11, 0.07, 0.04], dn = [0.05, 0.1, 0.12, 0.1, 0.06, 0.03];
    ob.loft(zs.map((z, i) => ({ pts: bodyRing(z, 0, rx[i], up[i], dn[i], 13, 2), v: 1 - i / 5 })), S, { start: 'pole', end: 'pole', startBulge: 0.02 });
    for (const sx of [-1, 1]) ob.blob([sx * 0.04, 0.045, 0.14], [0.022, 0.026, 0.026], 7, 5, E, { emis: 0.3 });
    // fins: dorsal, anal, the forked tail, pectorals
    ob.strip([[0, 0.12, 0.06], [0, 0.13, -0.02], [0, 0.1, -0.1]], [[0, 0.2, 0.0], [0, 0.18, -0.06], [0, 0.12, -0.12]], Fn, { double: true });
    ob.strip([[0, -0.08, -0.06], [0, -0.06, -0.14]], [[0, -0.15, -0.1], [0, -0.1, -0.18]], Fn, { double: true });
    ob.strip([[0, 0.04, -0.21], [0, -0.04, -0.21]], [[0, 0.14, -0.33], [0, -0.13, -0.32]], Fn, { double: true });
    for (const sx of [-1, 1]) ob.strip([[sx * 0.05, -0.02, 0.08], [sx * 0.05, -0.04, 0.05]], [[sx * 0.11, -0.05, 0.02], [sx * 0.1, -0.07, 0.0]], Fn, { double: true });
    // the red throat
    ob.blob([0, -0.07, 0.08], [0.05, 0.05, 0.07], 8, 5, Bl, {});
  });
  void body;
  // the underbite: a jutting lower jaw full of triangular teeth, hinged under the eye
  bpart(rig, 'pjaw', rig.parts.pbody, [0, -0.04, 0.12], PG, 'pjaw', (ob) => {
    ob.loft([0, 0.06, 0.12].map((z, i) => ({ pts: bodyRing(z, -0.01, [0.05, 0.045, 0.03][i], 0.02, 0.03, 11, 2), v: 1 - i / 2 })), Bl, { end: 'pole', endBulge: 0.01 });
    for (let i = 0; i < 9; i++) { const a = (i / 8 - 0.5) * 2.2; ob.cone([Math.sin(a) * 0.04, 0.008, 0.06 + Math.cos(a) * 0.055], [0, 1, 0.25], 0.008, 0.035, 3, Tt); }
  });
  // the upper teeth in the snout
  bpart(rig, 'pteeth', rig.parts.pbody, [0, -0.03, 0.16], PG, 'pteeth', (ob) => { for (let i = 0; i < 7; i++) { const a = (i / 6 - 0.5) * 2; ob.cone([Math.sin(a) * 0.03, 0, Math.cos(a) * 0.025], [0, -1, 0.1], 0.006, 0.025, 3, Tt); } });
  // the frog legs: thigh, shin, a long foot with webbed toes
  for (const sx of [-1, 1]) {
    const th = bpart(rig, sx > 0 ? 'thR' : 'thL', rig.parts.pbody, [sx * 0.05, -0.06, -0.1], PG, 'pthigh', (ob) => {
      ob.tube([[0, 0, 0], [0, -0.02, -0.11], [0, -0.03, -0.22]], [0.045, 0.05, 0.03], 8, L, { start: 'pole', end: 'pole', up: [0, 1, 0] });
    });
    const sh = bpart(rig, sx > 0 ? 'shR' : 'shL', th, [0, -0.03, -0.22], PG, 'pshin', (ob) => {
      ob.tube([[0, 0, 0], [0, 0, 0.1], [0, 0, 0.2]], [0.03, 0.025, 0.018], 7, L, { start: 'pole', end: 'pole', up: [0, 1, 0] });
    });
    bpart(rig, sx > 0 ? 'ftR' : 'ftL', sh, [0, 0, 0.2], PG, 'pfoot', (ob) => {
      ob.tube([[0, 0, 0], [0, 0, -0.08]], [0.02, 0.014], 6, L, { start: 'pole', up: [0, 1, 0] });
      for (let k = 0; k < 4; k++) { const a = -0.5 + k * 0.33; ob.tube([[0, 0, -0.08], [Math.sin(a) * 0.04, -0.005, -0.08 - Math.cos(a) * 0.08]], [0.008, 0.005], 4, L, { end: 'pole' }); }
      ob.strip([[-0.02, -0.004, -0.1], [0, -0.004, -0.11], [0.02, -0.004, -0.1]], [[-0.035, -0.006, -0.15], [0, -0.006, -0.16], [0.035, -0.006, -0.15]], Fn, { double: true });
    });
  }
  rig.eyes = [];
  return rig;
}
function animatePiranha(rig: Rig, c: Creature, t: number, dt: number) {
  applyLook(rig, c, PG, 0.08);
  const n = netOf(c), ud = rig.root.userData as Record<string, any>, P = rig.parts;
  const f = fxPoll(rig, c);
  if (f?.key === 'leap') { playAt('lifeguard_splash', c, 0.6, 16, 1.5); playAt('bx_boing', c, 0.25, 10, 1.6); }
  else if (f?.key === 'land') playAt(f.a?.w ? 'bh_plop' : 'pad', c, 0.6, 12, 1.4);
  const z = live() ? G.zones.get(c.zoneKey) as Zone ?? null : null;
  // the jump arc (replicated: start time, duration, height)
  const jt = n.jt !== undefined && live() ? G.time - n.jt : 9;
  const jd = n.jd ?? 0.5, jk = jt >= 0 && jt < jd ? jt / jd : -1;
  const arc = jk >= 0 ? Math.sin(jk * Math.PI) * (n.jh ?? 0.8) : 0;
  const inW = !!waterAt(z, c.x, c.z) && jk < 0;
  rig.root.position.y = c.y + arc - (inW ? 0.18 : 0) + (c.dead ? -0.1 : 0);
  const pitch = jk >= 0 ? (0.5 - jk) * 1.4 : 0;
  ud.sw = (ud.sw ?? 0) + dt * (inW ? 10 : 3);
  P.pbody.rotation.set(-pitch, inW ? Math.sin(ud.sw) * 0.25 : 0, c.dead ? Math.PI / 2 : 0);
  // the legs: kick straight in the air, fold to land, scissor kick swimming
  const ext = jk >= 0 ? (jk < 0.3 ? 1 : 1 - (jk - 0.3) / 0.7) : inW ? 0.5 + Math.sin(ud.sw) * 0.5 : 0;
  for (const s of ['L', 'R']) {
    const k = s === 'R' ? 1 : -1, e = inW ? 0.5 + Math.sin(ud.sw + (k > 0 ? 0 : Math.PI)) * 0.5 : ext;
    P['th' + s].rotation.set(-0.6 + e * 0.9, k * (0.5 - e * 0.3), 0);
    P['sh' + s].rotation.set(2.6 - e * 2.4, 0, 0);
    P['ft' + s].rotation.set(-2.2 + e * 1.9, 0, 0);
  }
  const atk = c.attackPhase > 0 ? 1 : 0;
  ud.bite = (ud.bite ?? 0) + (atk - (ud.bite ?? 0)) * damp(atk ? 25 : 6, dt);
  P.pjaw.rotation.set(0.15 + ud.bite * 0.6 + (c.dead ? 0.5 : 0), 0, 0);
  if (c.dead || !live()) return;
  const p = localIn(c);
  if (p && c.visibleToLocal && dist(p, c) < 6) thinkOnce(p, 'pl_piranha', ['That fish has LEGS. Frog legs. It is hopping.', 'It jumped out of the pool at me. A piranha. With legs.'][Math.floor(t * 0.3) % 2], 60);
}
type PMd = 'swim' | 'leap' | 'hop' | 'home';
function thinkPiranha(c: Creature, dt: number): boolean {
  const z = G.getZone(c.zoneKey) as Zone, m = c.mem, n = net(c), cs = CS(), now = G.time;
  const ev = pulse(c);
  m.mdT = (m.mdT ?? 0) + dt;
  // mid-jump: ride the arc
  if (m.jump) {
    const j = m.jump as { x0: number; z0: number; x1: number; z1: number; t0: number; d: number };
    const k = Math.min(1, (now - j.t0) / j.d);
    c.x = j.x0 + (j.x1 - j.x0) * k; c.z = j.z0 + (j.z1 - j.z0) * k; c.vx = c.vz = 0; c.speed = 3;
    if (k >= 1) { m.jump = null; fx(c, 'land', { w: waterAt(z, c.x, c.z) ? 1 : 0 }); m.landT = now; }
    return true;
  }
  const jump = (x1: number, z1: number, d: number, h: number) => {
    // never into a wall: shorten the jump to the last open tile
    const a = Math.atan2(z1 - c.z, x1 - c.x), L = Math.hypot(x1 - c.x, z1 - c.z);
    let ok = 0;
    for (let s = 0.5; s <= L; s += 0.5) { const tx = Math.floor(c.x + Math.cos(a) * s), ty = Math.floor(c.z + Math.sin(a) * s); if (!z.inb(tx, ty) || !z.floor[z.idx(tx, ty)] || z.solid[z.idx(tx, ty)]) break; ok = s; }
    if (ok < 0.5) return false;
    const ex = c.x + Math.cos(a) * ok, ez = c.z + Math.sin(a) * ok;
    m.jump = { x0: c.x, z0: c.z, x1: ex, z1: ez, t0: now, d };
    n.jt = now; n.jd = d; n.jh = h; c.facing = c.targetFacing = a; fx(c, 'leap');
    return true;
  };
  const inW = !!waterAt(z, c.x, c.z);
  const target = nearestP(c, 7);
  if (target && (now - (m.landT ?? -9)) > 0.35) {
    c.targetId = target.p.id;
    if (target.d < c.sp.attack!.range + 0.2) {
      if (c.attackT <= 0) { c.targetFacing = angTo(c, target.p.x, target.p.z); attack(c, target.p); ruleShown(c); m.bites = (m.bites ?? 0) + 1; }
      // a bite or two, then away back to the water
      if (m.bites >= 2 && !inW) { const w = waterSpot(z, c.x, c.z, 6, 'any'); if (w) { m.bites = 0; jump(w.x, w.z, 0.55, 0.9); } }
      return true;
    }
    if (target.d < 6.5) {
      // out of the water in an arc, then hops across the tile
      const a = angTo(c, target.p.x, target.p.z), L = Math.min(inW ? 3.2 : 1.6, target.d - 0.5);
      if (L > 0.4 && jump(c.x + Math.cos(a) * L, c.z + Math.sin(a) * L, inW ? 0.6 : 0.38, inW ? 1.1 : 0.45)) { c.setState('chase'); return true; }
    }
  }
  if (ev.hurt > 0 && !inW) { const w = waterSpot(z, c.x, c.z, 8, 'any'); if (w) jump(w.x, w.z, 0.5, 0.7); return true; }
  // on dry tile with nobody to bite: hop back to the water
  if (!inW) {
    if ((now - (m.landT ?? -9)) > 0.4) { const w = waterSpot(z, c.x, c.z, 8, 'any'); if (w) jump(c.x + Math.max(-1.6, Math.min(1.6, w.x - c.x)), c.z + Math.max(-1.6, Math.min(1.6, w.z - c.z)), 0.4, 0.45); }
    return true;
  }
  m.bites = 0;
  c.setState('wander');
  if (!m.goal || m.mdT > (m.wT ?? 3)) { m.goal = waterSpot(z, c.x, c.z, 5, 'any'); m.wT = rng.float(2, 5); m.mdT = 0; }
  if (m.goal && cs.moveTo(c, z, m.goal.x, m.goal.z, rng.chance(0.4) ? c.sp.run : c.sp.walk, dt, 0.3)) m.goal = null;
  return true;
}
const PIRANHA = def({
  key: 'frog_piranha', name: 'Frog Piranha', code: 'FP-09 // FAUNA, SERRASALMID (AMPHIBIOUS MUTANT)', temperament: 'hostile', threat: 2,
  rule: { name: 'IT HAS TO GO BACK IN', text: 'It leaps out of the water at anything near the edge, hops after you across the tile, bites once or twice and then has to go back to the water. Get a few metres from any water and it cannot follow for long.', tell: 'A piranha with long frog legs folded under it.' },
  hp: 16, walk: 1.2, run: 3.6, turn: 9, radius: 0.18, height: 0.3, sight: 8, fov: 2.4, hearing: 1.3, vibration: true,
  attack: { dmg: [4, 9], range: 0.6, cooldown: 0.9, kinds: ['bite', 'laceration'], corrupt: 0.01, knock: 0.1, parts: ['foot_l', 'foot_r', 'shin_l', 'shin_r', 'thigh_l', 'thigh_r', 'hand_l', 'hand_r'] },
  zones: ['plunge', 'pools'], weight: 1, group: [1, 3], maxPerZone: 8, diet: 'meat',
  meat: [['frog_leg', 2]],
  sounds: { idle: 'bh_plop', alert: 'bx_boing', attack: 'swivel_bite', hurt: 'ventling_squeal', death: 'gore_squelch', step: 'pad' },
  scan: { cls: 'Fauna / piranha (amphibious mutant)', notes: ['A piranha with an underbite of triangular teeth and long frog legs.', 'It leaps out of the water in arcs and hops across wet tile.', 'A bite or two, then it must go back in.'] },
  gore: { blood: 'red', flesh: 0xc86a5a, gib: true, sever: ['thL', 'thR'], head: 'pjaw' },
  disposition: { mood: 'predator', self: true },
  build: buildPiranha, animate: animatePiranha, think: thinkPiranha,
});

// =====================================================================================
// BALLOON PUFFER
// =====================================================================================
// A real pufferfish in shape: a blunt, boxy head with the fused beak (two plates above, two below),
// big eyes set high (human eyeballs), little pectoral fins fluttering behind them, a dorsal and an anal fin
// set far back, a short rounded tail; a mottled, spotted back and a pale belly. The balloon survives in the
// material and the behaviour: the skin has a latex shine, the tail ends in a knotted balloon neck with the
// string hanging from it, and it inflates like one: the body swells round, the spines stand up out of the
// stretched skin, and when the air goes out of it the skin hangs in wrinkles for a while.
const ROPE_N = 8;
const PUF_SP = 40;
/** the deflated body: half width and height at s (0 the tail, 1 the snout) */
function pufProf(s: number): [number, number] {
  let b = s < 0.62 ? 0.28 + 0.72 * Math.sin((s / 0.62) * Math.PI * 0.5) : 1 - 0.1 * ((s - 0.62) / 0.38) ** 2;
  if (s > 0.86) b *= Math.sqrt(Math.max(0, 1 - ((s - 0.86) / 0.14) ** 2));
  return [0.17 * b, 0.155 * b];
}
/** a point on the deflated body (th 0 the side, PI/2 the top); wr wrinkles it */
function pufPt(s: number, th: number, wr = 0): V3 {
  const [w, h] = pufProf(s);
  const e = 2 + 0.9 * clamp01((s - 0.45) / 0.4);
  const c = Math.cos(th), sn = Math.sin(th);
  const k = 1 + wr * (0.07 * Math.sin(th * 9 + s * 14) + 0.05 * Math.sin(s * 31 + th * 3) - 0.04);
  return [w * Math.sign(c) * Math.abs(c) ** (2 / e) * k, h * Math.sign(sn) * Math.abs(sn) ** (2 / e) * (sn < 0 ? 1.12 : 1) * k, -0.3 + s * 0.6];
}
function pufBody(ob: OB, wr: number) {
  const L = PG.reg('LATEX'), N = 18, rings: { pts: V3[]; v: number }[] = [];
  for (let i = 0; i <= 16; i++) {
    const s = 0.035 + (i / 16) * 0.965;
    const pts: V3[] = [];
    for (let j = 0; j <= N; j++) pts.push(pufPt(s, -Math.PI / 2 + (j / N) * Math.PI * 2, wr));
    rings.push({ pts, v: s });
  }
  ob.loft(rings, L, { start: 'pole', end: 'pole', startBulge: 0.01, endBulge: 0.0 });
}
function buildPuffer(): Rig {
  const rig = newRig(2.0);
  const K = PG.reg('KNOT'), Sp = PG.reg('SPIKE'), Fn = PG.reg('TFIN'), Bk = PG.reg('PTOOTH'), Mo = PG.reg('GNOSE'), L = PG.reg('LATEX');
  const float = new THREE.Group(); float.name = 'float'; rig.root.add(float); rig.parts.float = float;
  // the body (smooth, and the same body wrinkled for when the air has gone out of it); this group is what swells
  const bodyS = new THREE.Group(); bodyS.name = 'bodyS'; float.add(bodyS); rig.parts.bodyS = bodyS;
  bpart(rig, 'pbody', bodyS, [0, 0, 0], PG, 'pfbody', (ob) => pufBody(ob, 0));
  bpart(rig, 'pwrink', bodyS, [0, 0, 0], PG, 'pfwrink', (ob) => pufBody(ob, 1));
  // the rest rides on the swelling surface (placed every frame, never scaled with it)
  // the beak: four fused tooth plates at the little mouth on the blunt snout
  bpart(rig, 'beak', float, [0, 0, 0], PG, 'pfbeak', (ob) => {
    ob.blob([0, -0.028, -0.012], [0.03, 0.022, 0.02], 8, 5, Mo, {});
    for (const sx of [-1, 1]) {
      ob.blob([sx * 0.0135, -0.016, 0.004], [0.0145, 0.011, 0.012], 7, 5, Bk, {});
      ob.blob([sx * 0.0125, -0.04, 0.002], [0.0135, 0.0105, 0.0115], 7, 5, Bk, {});
    }
    ob.blob([0, -0.028, -0.004], [0.034, 0.03, 0.016], 9, 5, L, { v0: 0.95, v1: 1 });
  });
  // the eyes: two human eyeballs, wet and veined, high on the head in fleshy latex sockets
  for (const s of [-1, 1]) {
    const k = s > 0 ? 'R' : 'L';
    bpart(rig, 'sock' + k, float, [0, 0, 0], PG, 'pfsock', (ob) => {
      const path: V3[] = []; for (let i = 0; i <= 14; i++) { const a = (i / 14) * Math.PI * 2; path.push([Math.cos(a) * 0.058, Math.sin(a) * 0.058, 0]); }
      ob.tube(path, path.map((_, i) => 0.016 + 0.004 * Math.sin(i * 2.1)), 6, L, {});
    });
    bpart(rig, 'eye' + k, float, [0, 0, 0], PG, 'peye2', (ob) => {
      // the eyeball, its front (the iris) along +z
      ob.blob([0, 0, 0], [0.056, 0.056, 0.056], 14, 10, PG.reg('EYEB'), { emis: 0.12 });
      ob.cone([0, 0, 0.05], [0, 0, 1], 0.026, 0.009, 14, PG.reg('IRISC'), { emis: 0.15 });
      ob.blob([-0.011, 0.013, 0.056], [0.0065, 0.0065, 0.003], 5, 3, PG.reg('EYEB'), { emis: 1 });
    });
  }
  // little pectoral fins behind the eyes, a dorsal and an anal fin far back, a short rounded tail fan
  const fan = (ob: OB, len: number, ht: number) => {
    const a: V3[] = [], b: V3[] = [];
    for (let i = 0; i <= 6; i++) { const t = i / 6 - 0.5; a.push([0, t * ht * 0.45, 0]); b.push([0, t * ht * (1 + 0.15 * Math.cos(t * 9)), -len * (0.85 + 0.15 * Math.cos(t * Math.PI))]); }
    ob.strip(a, b, Fn, { double: true });
  };
  for (const k of ['L', 'R']) bpart(rig, 'pec' + k, float, [0, 0, 0], PG, 'pfpec', (ob) => fan(ob, 0.07, 0.08));
  bpart(rig, 'dors', float, [0, 0, 0], PG, 'pfdors', (ob) => fan(ob, 0.08, 0.06));
  bpart(rig, 'anal', float, [0, 0, 0], PG, 'pfanal', (ob) => fan(ob, 0.07, 0.055));
  bpart(rig, 'tail', float, [0, 0, 0], PG, 'pftail', (ob) => fan(ob, 0.13, 0.17));
  // the knot: the twisted neck of the balloon under the root of the tail, where the string is tied
  bpart(rig, 'knot', float, [0, 0, 0], PG, 'pknot2', (ob) => {
    ob.tube([[0, 0, 0], [0, -0.015, -0.03], [0.006, -0.03, -0.05]], [0.022, 0.014, 0.018], 8, K, { start: 'pole', end: 'pole' });
    ob.blob([0.008, -0.036, -0.058], [0.02, 0.016, 0.018], 7, 5, K, {});
  });
  // the spines: lying flat in the skin, they stand straight up when it inflates
  for (let i = 0; i < PUF_SP; i++) bpart(rig, 'sp' + i, float, [0, 0, 0], PG, 'pfspine', (ob) => { ob.cone([0, 0, 0], [0, 1, 0], 0.011, 0.075, 5, Sp, {}); });
  // the string: a chain of short links, simulated
  for (let i = 0; i < ROPE_N; i++) bpart(rig, 'str' + i, rig.root, [0, 0, 0], PG, 'pstr', (ob) => { ob.tube([[0, 0, 0], [0, 0, 0.16]], [0.004, 0.004], 4, PG.reg('STRING'), {}); });
  rig.eyes = [];
  return rig;
}
// where the spines grow: spread over the body away from the face and the fins
const PUF_SPOTS: [number, number][] = Array.from({ length: PUF_SP }, (_, i) => [0.2 + ((i * 0.618) % 1) * 0.6, (i * 2.399) % (Math.PI * 2)]);
const _d1 = new THREE.Vector3(), _d2 = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _q = new THREE.Quaternion(), _zA = new THREE.Vector3(0, 0, 1), _yA = new THREE.Vector3(0, 1, 0);
function animatePuffer(rig: Rig, c: Creature, t: number, dt: number) {
  applyLook(rig, c, PG, 0.1);
  const n = netOf(c), ud = rig.root.userData as Record<string, any>, P = rig.parts;
  const seed = hashId(c.id);
  const f = fxPoll(rig, c);
  if (f) {
    if (f.key === 'puff') { playAt('bubble_inflate', c, 0.8, 14, 1.1); playAt('tim_squeak', c, 0.7, 14, 1.2); }
    else if (f.key === 'deflate') { playAt('tim_deflate', c, 0.8, 16, 1.3); ud.wr = 1; }
    else if (f.key === 'pop') { playAt('tim_pop', c, 1, 40, 1.0); playAt('bubble_pop', c, 0.8, 30, 0.7); if (G.local && dist(G.local, c) < 8) { G.camera?.shake?.(0.25, 0.3); thinkOnce(G.local, 'pl_pop', 'BANG. It POPPED. Everything in the water heard that.', 20); } }
  }
  // inflation (replicated): it swells fast and goes down slowly, the latex overshooting as it fills
  const puffT = n.pf ? 1 : 0;
  ud.pv = ((ud.pv ?? 0) + ((puffT - (ud.pf ?? 0)) * (puffT ? 160 : 40) - (ud.pv ?? 0) * (puffT ? 14 : 12)) * dt);
  ud.pf = clamp01((ud.pf ?? 0) + ud.pv * dt);
  if (!puffT && (ud.lastPf ?? 0) > 0.5 && ud.pf < 0.5) ud.wr = 1;
  ud.lastPf = ud.pf;
  const pf = ud.pf;
  const deadK = c.dead ? Math.min(1, (ud.dk = (ud.dk ?? 0) + dt * 3)) : (ud.dk = 0);
  if (c.dead) ud.wr = 1;
  ud.wr = Math.max(0, (ud.wr ?? 0) - dt * (c.dead ? 0 : 0.35));
  const wr = ud.wr * (1 - pf);
  const hover = c.dead ? 0.05 : 1.9 + Math.sin(t * 0.9 + seed * 6) * 0.15 + Math.sin(t * 0.37 + seed) * 0.1;
  ud.h = (ud.h ?? hover) + (hover - (ud.h ?? hover)) * damp(c.dead ? 6 : 2, dt);
  const fl = P.float;
  fl.position.set(0, ud.h, 0);
  fl.rotation.set(Math.sin(t * 0.7 + seed) * 0.08 + Math.min(0.3, c.speed * 0.1) + deadK * 0.2, Math.sin(t * 0.33 + seed * 2) * 0.15, Math.sin(t * 0.9) * 0.08 + deadK * 1.2);
  // the swelling: round when full; crumpled and loose when the air has gone; flat as a dropped glove dead
  const crum = wr * (0.5 + 0.5 * Math.sin(t * 17 + seed * 9));
  const sx = (1 + pf * 1.05) * (1 - crum * 0.06) * (1 + deadK * 0.25), sy = (1 + pf * 1.15) * (1 - crum * 0.08) * (1 - deadK * 0.75), sz = (1 + pf * 0.25) * (1 - deadK * 0.05);
  P.bodyS.scale.set(sx, sy, sz);
  P.pbody.visible = wr < 0.2;
  P.pwrink.visible = !P.pbody.visible;
  const S = (s: number, th: number, out = 0, o = _a): THREE.Vector3 => {
    const p = pufPt(s, th, wr > 0.2 ? 1 : 0);
    o.set(p[0] * sx, p[1] * sy, p[2] * sz);
    if (out) { const nn = nrm(s, th, _c); o.addScaledVector(nn, out); }
    return o;
  };
  const nrm = (s: number, th: number, o: THREE.Vector3) => {
    const p0 = pufPt(s, th), ps = pufPt(Math.min(0.999, s + 0.01), th), pt = pufPt(s, th + 0.05);
    _d1.set((ps[0] - p0[0]) * sx, (ps[1] - p0[1]) * sy, (ps[2] - p0[2]) * sz); _d2.set((pt[0] - p0[0]) * sx, (pt[1] - p0[1]) * sy, (pt[2] - p0[2]) * sz);
    o.crossVectors(_d1, _d2).normalize();
    if (o.x * p0[0] + o.y * p0[1] < 0) o.negate();
    return o;
  };
  // the beak at the snout, the eyes high on the head, fins behind them
  S(0.995, 0, 0, P.beak.position); P.beak.position.z += 0.012; P.beak.position.y -= 0.01 * sy;
  P.beak.scale.setScalar(1 + pf * 0.15);
  // the eyes dart: a new target every so often, snapping to it (saccades)
  if (t > (ud.eyeT ?? 0)) { ud.eyeT = t + rng.float(0.25, 1.1); ud.ey = rng.float(-0.6, 0.6); ud.ep = rng.float(-0.35, 0.35); }
  if (c.targetId && live() && t > (ud.lookT ?? 0)) {
    const p = G.players.get(c.targetId);
    if (p) { ud.lookT = t + 0.4; const a = Math.atan2(p.z - c.z, p.x - c.x) - c.facing; ud.ey = Math.max(-0.9, Math.min(0.9, -a)); ud.ep = 0.25; }
  }
  for (const k of ['L', 'R']) {
    const sd = k === 'R' ? 1 : -1;
    const th = Math.PI / 2 - sd * 0.62;
    S(0.84, th, 0.022 + pf * 0.01, P['sock' + k].position);
    const nn = nrm(0.84, th, new THREE.Vector3());
    P['sock' + k].quaternion.setFromUnitVectors(_zA, nn);
    S(0.84, th, 0.03 + pf * 0.012, P['eye' + k].position);
    const e = P['eye' + k];
    const ty = (ud.ey ?? 0) + sd * 0.55, tp = (ud.ep ?? 0) - 0.25;
    e.rotation.y += (ty - e.rotation.y) * Math.min(1, dt * 30);
    e.rotation.x += (tp - e.rotation.x) * Math.min(1, dt * 30);
    e.scale.setScalar(1 + pf * 0.2); e.visible = true;
    // pectoral fins: fluttering fast, faster when it is frightened
    const pec = P['pec' + k];
    S(0.66, sd > 0 ? 0 : Math.PI, 0.005, pec.position); pec.position.y -= 0.01 * sy;
    pec.rotation.set(0, sd * (0.45 + Math.sin(t * (24 + pf * 14) + (sd > 0 ? 0 : 1.7)) * (0.5 + pf * 0.2)), 0);
    pec.scale.setScalar(c.dead ? 0.7 : 1);
  }
  S(0.24, Math.PI / 2, -0.004, P.dors.position); P.dors.rotation.set(Math.PI / 2, 0, 0);
  S(0.24, -Math.PI / 2, -0.004, P.anal.position); P.anal.rotation.set(-Math.PI / 2, 0, 0);
  S(0.035, 0, 0, P.tail.position); P.tail.position.x = 0; P.tail.position.y = 0.012 * sy; P.tail.rotation.set(0, Math.sin(t * 2.6 + seed) * 0.35 + Math.min(0.5, c.speed * 0.15) * Math.sin(t * 9), 0);
  P.knot.position.set(0, -0.03 * sy, P.tail.position.z + 0.012);
  // the spines stand up out of the stretched skin as it fills
  const erect = clamp01((pf - 0.25) / 0.6);
  for (let i = 0; i < PUF_SP; i++) {
    const sp = P['sp' + i], [s, th] = PUF_SPOTS[i];
    sp.visible = erect > 0.05 && !c.dead;
    if (!sp.visible) continue;
    S(s, th, -0.004, sp.position);
    const nn = nrm(s, th, _b.set(0, 0, 0));
    const back = _c.set(0, 0, -1).addScaledVector(nn, 0.25).normalize();
    sp.quaternion.setFromUnitVectors(_yA, back.lerp(nn, erect).normalize());
    sp.scale.setScalar(0.4 + erect * 0.6);
  }
  // the string: verlet links hanging from the knot, dragged by the drift
  const knotW = _a.copy(P.knot.position).add(_b.set(0.008, -0.04, -0.06)).applyEuler(fl.rotation).add(_b.set(0, ud.h, 0));
  const pts: THREE.Vector3[] = ud.rope || (ud.rope = Array.from({ length: ROPE_N + 1 }, (_, i) => new THREE.Vector3(knotW.x, knotW.y - i * 0.16, knotW.z)));
  const prev: THREE.Vector3[] = ud.ropeP || (ud.ropeP = pts.map((p) => p.clone()));
  // in root space: account for the root moving (the creature drifting) by a drag opposite its velocity
  const vx = (c.x - (ud.lx ?? c.x)), vz = (c.z - (ud.lz ?? c.z)); ud.lx = c.x; ud.lz = c.z;
  const a0 = -rig.root.rotation.y, ca = Math.cos(a0), sa = Math.sin(a0);
  const lvx = vx * ca + vz * sa, lvz = -vx * sa + vz * ca;
  pts[0].copy(knotW);
  for (let i = 1; i <= ROPE_N; i++) {
    const p = pts[i], q = prev[i];
    const nx = p.x + (p.x - q.x) * 0.92 - lvx * 0.6, ny = p.y + (p.y - q.y) * 0.92 - 9.8 * dt * dt * 0.6, nz = p.z + (p.z - q.z) * 0.92 - lvz * 0.6;
    q.copy(p); p.set(nx, ny, nz);
  }
  for (let it = 0; it < 4; it++) for (let i = 1; i <= ROPE_N; i++) {
    const a = pts[i - 1], b = pts[i];
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, d = Math.hypot(dx, dy, dz) || 1, k = (d - 0.16) / d;
    if (i === 1) { b.x -= dx * k; b.y -= dy * k; b.z -= dz * k; }
    else { a.x += dx * k * 0.5; a.y += dy * k * 0.5; a.z += dz * k * 0.5; b.x -= dx * k * 0.5; b.y -= dy * k * 0.5; b.z -= dz * k * 0.5; }
    if (b.y < 0.02) b.y = 0.02;
  }
  pts[0].copy(knotW);
  for (let i = 0; i < ROPE_N; i++) {
    const part = P['str' + i], a = pts[i], b = pts[i + 1];
    part.position.copy(a);
    const d = _b.copy(b).sub(a); const l = d.length() || 1; d.divideScalar(l);
    part.quaternion.copy(_q.setFromUnitVectors(_zA, d));
    part.scale.set(1, 1, l / 0.16);
    part.visible = !c.dead || i < 4;
  }
  if (c.dead || !live()) return;
  const p = localIn(c);
  if (p && c.visibleToLocal && dist(p, c) < 6) thinkOnce(p, 'pl_puffer', ['A pufferfish. Floating in the AIR. With human eyes. They are looking at me.', 'Its skin shines like a balloon. There is a string tied to its tail.', 'Do not touch it. Do not make it jump.'][Math.floor(t * 0.2) % 3], 80);
}
function thinkPuffer(c: Creature, dt: number): boolean {
  const z = G.getZone(c.zoneKey) as Zone, m = c.mem, n = net(c), cs = CS(), now = G.time;
  const ev = pulse(c);
  m.mdT = (m.mdT ?? 0) + dt;
  const pop = () => {
    fx(c, 'pop');
    bus.emit('noise', { x: c.x, z: c.z, radius: 24, kind: 'pop', zone: c.zoneKey });
    CS().kill(c, z);
  };
  // struck: it pops (or, rarely, it just lets go and shoots off)
  if (ev.hurt > 0) { if (rng.chance(0.8) || c.hp < c.sp.hp * 0.5) { pop(); return true; } n.pf = 0; fx(c, 'deflate'); m.dartT = now + 2.5; m.from = c.targetId ? G.players.get(c.targetId) : null; m.dartTo = null; }
  // startled: a unit running at it, close, or a loud noise nearby
  const near = nearestP(c, 6);
  const heard = c.lastHeard && now - c.lastHeard.t < 0.5 && c.lastHeard.r > 6;
  if (!n.pf && now > (m.calmT ?? 0) && near && (near.d < 1.6 || (near.d < 4 && (near.p.running || near.p.speed > 3))) || (!n.pf && heard && now > (m.calmT ?? 0))) {
    n.pf = 1; fx(c, 'puff'); m.puffT = now; c.targetId = near?.p.id ?? null; ruleShown(c);
  }
  if (n.pf) {
    c.speed = 0; c.vx *= 0.8; c.vz *= 0.8;
    if (near) c.targetFacing = angTo(c, near.p.x, near.p.z);
    if (now - m.puffT > 1.6) {
      // too close still: it pops; otherwise it lets its air out and darts
      if (near && near.d < 1.1) { pop(); return true; }
      n.pf = 0; fx(c, 'deflate'); m.dartT = now + 2.2; m.from = near?.p ?? null; m.dartTo = null; m.calmT = now + 6;
    }
    return true;
  }
  if ((m.dartT ?? 0) > now) {
    c.setState('flee');
    if (!m.dartTo) m.dartTo = cs.fleeSpot(c, z, m.from?.x ?? c.x - 1, m.from?.z ?? c.z);
    // zig-zag
    const zz = Math.sin(now * 13) * 0.8;
    cs.moveTo(c, z, m.dartTo.x + zz, m.dartTo.z - zz, c.sp.run, dt, 0.5);
    return true;
  }
  // drifting
  c.setState('wander');
  if (!m.goal || m.mdT > (m.wT ?? 8)) {
    const pl = plungeOf(z);
    const r = pl ? rng.pick([...pl.deep, ...pl.shallow]) : null;
    m.goal = r ? { x: rng.float(r[0], r[2] + 1), z: rng.float(r[1], r[3] + 1) } : cs.wanderSpot(c, z, 8);
    m.wT = rng.float(6, 14); m.mdT = 0;
  }
  if (cs.moveTo(c, z, m.goal.x, m.goal.z, c.sp.walk, dt, 0.6)) m.goal = null;
  return true;
}
const PUFFER = def({
  key: 'balloon_puffer', name: 'Balloon Puffer', code: 'BP-10 // ANOMALY, INFLATABLE (HUMAN OCULAR)', temperament: 'skittish', threat: 1,
  rule: { name: 'DO NOT STARTLE IT', text: 'It drifts over the water, harmless. Run at it or make a loud noise near it and it puffs up; then, if you are still right next to it (or you hit it), it pops with a bang that brings everything in the water and the tunnels. Back off and it lets its air out and darts away instead. Walk past it slowly.', tell: 'A pufferfish floating in the air, shiny as a balloon, a string tied to its tail, and two human eyes.' },
  hp: 6, walk: 0.5, run: 4.0, turn: 3, radius: 0.3, height: 2.2, sight: 8, fov: 3, hearing: 1.8,
  zones: ['plunge', 'pools'], weight: 1, group: [1, 2], maxPerZone: 5, diet: 'none',
  meat: [['puffer_latex', 1]],
  flags: { flying: true },
  sounds: { idle: 'bubble_wob', alert: 'bubble_squeak', hurt: 'tim_squeak', death: 'tim_pop' },
  scan: { cls: 'Anomaly / inflatable, with human eyes', notes: ['A pufferfish with the skin and the shine of a party balloon, knotted at the tail. The eyes are human.', 'Startled, it swells round and its spines stand up. Close up or struck, it pops loudly.', 'Its pop carries down every tunnel. Things come to it.'] },
  gore: { blood: 'none', gib: false },
  remains: 'none',
  disposition: { mood: 'skittish', self: true },
  build: buildPuffer, animate: animatePuffer, think: thinkPuffer,
});

// =====================================================================================
// the Gulper is always in the Plunge (spawned at its lair when a unit arrives)
// =====================================================================================
function ensureGulper(zk: string) {
  if (G.role === 'client' || !G.creatures) return;
  const z = G.zones.get(zk) as Zone | undefined;
  const pl = plungeOf(z);
  if (!z || !pl || z.meta.pl_gulperDead) return;
  if ([...CS().creatures.values()].some((o) => o.zoneKey === zk && o.sp.key === 'gulper')) return;
  const c = CS().spawn('gulper', zk, pl.lair[0] + 0.5, pl.lair[1] + 0.5);
  if (c) { c.facing = c.targetFacing = Math.PI; c.mem.persistent = true; c.mem.noCap = 1; }
}
bus.on('creatureKilled', (c: Creature) => { if (c?.sp?.key === 'gulper' && G.role !== 'client') G.getZone(c.zoneKey).meta.pl_gulperDead = 1; });
let sys = false;
bus.on('enterZone', (z: Zone) => {
  try { if (z?.key) ensureGulper(z.key); } catch (e) { console.error('gulper', e); }
  const g: any = G;
  if (sys || !g?.addSystem) return;
  sys = true;
  let acc = 0;
  g.addSystem({ name: 'plungeGulper', update: (dt: number) => { acc += dt; if (acc < 4) return; acc = 0; const zs = new Set<string>(); for (const p of G.players.values()) zs.add(p.zoneKey); for (const zk of zs) ensureGulper(zk); } });
});

// =====================================================================================
// galleries
// =====================================================================================
GULPER.animateGallery = (rig: Rig, t: number) => {
  const q = galleryPoseParam() || ['lurk', 'suck', 'walk', 'gape', 'gulp', 'swim', 'haul', 'land'][Math.floor(t / 4) % 8];
  const ud = rig.root.userData as Record<string, any>;
  const dt = 1 / 60;
  // the suction strike loops every 1.6 s: throat drop, mouth flashes open to a tube, water rushes in, snap shut
  const st = t % 1.6, suckT = q === 'suck' && st < 0.5 ? 1 : 0;
  ud.sk = (ud.sk ?? 0) + (suckT - (ud.sk ?? 0)) * damp(suckT ? 30 : 9, dt);
  ud.pk = (ud.pk ?? 0) + (suckT - (ud.pk ?? 0)) * damp(20, dt);
  ud.g = (ud.g ?? 0) + ((q === 'gape' ? 1 : 0.02) - (ud.g ?? 0)) * damp(q === 'gape' ? 10 : 4, dt);
  ud.gl = (ud.gl ?? 0) + ((q === 'gulp' ? 1 : 0) - (ud.gl ?? 0)) * damp(3, dt);
  const swim = q === 'swim' ? 1 : 0, haul = q === 'haul' ? 1 : 0, land = q === 'land' ? 1 : 0;
  ud.glph = ((ud.glph ?? 0) + dt / 1.3) % 1;
  const yaw = spineStep(ud, dt, { speed: swim ? 1.3 : land ? 0.4 : q === 'walk' ? 0.6 : 0, swim, thrash: haul * 0.9, turn: swim ? Math.sin(t * 0.6) * 0.7 : 0, land, lph: ud.glph, dead: 0 });
  const hp = (t % 1.05) / 1.05, heave = haul && hp < 0.45 ? Math.sin((hp / 0.45) * Math.PI) : 0;
  poseGulper(rig, {
    t, dt, speed: q === 'walk' ? 0.6 : swim ? 1.3 : land ? 0.4 : 0, gape: ud.g, sub: 0, gulp: ud.gl, struggle: q === 'gulp' ? 1 : 0, swim, dead: 0, flinch: 0, suck: ud.sk, pump: q === 'gulp' ? 1 : 0,
    pucker: Math.max(ud.pk, q === 'lurk' ? (Math.sin(t * 1.2) > 0.9 ? 0.6 : 0) : 0),
    yaw, bodyPitch: haul * (0.36 + heave * 0.06), sag: haul * 0.2, headUp: q === 'lurk' ? 0.22 : haul * (0.25 + heave * 0.2), steady: 0.4 + 0.5 * swim, lph: ud.glph, land, reach: haul, heave, thrash: haul * (0.8 + heave * 0.5),
  });
};
TADPOLE.animateGallery = (rig: Rig, t: number) => {
  const fc = (rig.root.userData.fake ||= fakeCreature(TADPOLE, { id: 'g-tad', facing: 0, mem: { netMem: { age: 400 } } })) as Creature;
  fc.speed = 0.6;
  animateTadpole(rig, fc, t, 1 / 60);
  rig.root.position.y = 0.05;
};
PIRANHA.animateGallery = (rig: Rig, t: number) => {
  const q = galleryPoseParam() || ['swim', 'leap', 'bite'][Math.floor(t / 3) % 3];
  const fc = (rig.root.userData.fake ||= fakeCreature(PIRANHA, { id: 'g-pir', facing: Math.PI / 2, mem: { netMem: {} } })) as Creature;
  const P = rig.parts, ud = rig.root.userData as Record<string, any>;
  // stand-alone: drive the leg pose straight from the phase
  const jk = q === 'leap' ? (t % 1) : -1;
  rig.root.position.y = jk >= 0 ? Math.sin(jk * Math.PI) * 0.8 : 0.05;
  P.pbody.rotation.set(jk >= 0 ? -(0.5 - jk) * 1.4 : 0, q === 'swim' ? Math.sin(t * 10) * 0.25 : 0, 0);
  const e = jk >= 0 ? (jk < 0.3 ? 1 : 1 - (jk - 0.3) / 0.7) : q === 'swim' ? 0.5 + Math.sin(t * 10) * 0.5 : 0;
  for (const s of ['L', 'R']) { P['th' + s].rotation.set(-0.6 + e * 0.9, (s === 'R' ? 1 : -1) * (0.5 - e * 0.3), 0); P['sh' + s].rotation.set(2.6 - e * 2.4, 0, 0); P['ft' + s].rotation.set(-2.2 + e * 1.9, 0, 0); }
  P.pjaw.rotation.set(0.15 + (q === 'bite' ? Math.max(0, Math.sin(t * 9)) * 0.6 : 0), 0, 0);
  void fc; void ud;
};
PUFFER.animateGallery = (rig: Rig, t: number) => {
  const q = galleryPoseParam() || ['drift', 'puff'][Math.floor(t / 4) % 2];
  const fc = (rig.root.userData.fake ||= fakeCreature(PUFFER, { id: 'g-puf', facing: Math.PI / 2, mem: { netMem: {} } })) as Creature;
  fc.mem.netMem.pf = q === 'puff' ? 1 : 0;
  const home = (rig.root.userData.home ||= rig.root.position.clone()) as THREE.Vector3;
  fc.x = home.x + Math.sin(t * 0.4) * 0.6; fc.z = home.z;
  rig.root.position.set(fc.x, 0, fc.z);
  animatePuffer(rig, fc, t, 1 / 60);
};
void OB; void lerp; void flat; void eye;
