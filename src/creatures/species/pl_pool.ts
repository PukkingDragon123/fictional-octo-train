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
// BALLOON PUFFER — a pufferfish made of a party balloon, latex sheen, the knot at its tail
//   and the string trailing, with two human eyeballs that dart about. It drifts in the air
//   over the pools. Startle it and it puffs up with a rubber squeak, then either pops (a
//   bang that brings everything in the water) or lets its air out and darts away.
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
import { mixHex } from '../../gfx/pixel';

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
const LATEX = [0xc81838, 0x1a58c8, 0xe09810];
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
  // the balloon: latex in one bright colour with a hard shine
  {
    const r = P.R('LATEX'), c0 = LATEX[v % 3];
    const R = ramp(c0, 7, mixHex(c0, 0x000000, 0.6), 0.45);
    P.fill(r, R, (u, vv, x, y) => 2.6 + vv * 2.2 + (P.n(r, x, y, 2, 2, 71) - 0.5) * 0.5, 0.3);
    P.spot(r, r.w * 0.3, r.h * 0.25, r.w * 0.08, r.h * 0.06, 0xffffff, 0.9);
    P.spot(r, r.w * 0.36, r.h * 0.34, r.w * 0.03, r.h * 0.03, 0xffffff, 0.8);
  }
  { const r = P.R('KNOT'), c0 = LATEX[v % 3]; P.fill(r, ramp(c0, 6, mixHex(c0, 0x000000, 0.6), 0.3), (u, vv, x, y) => 2 + Math.sin(x * 1.5 + y) * 1.2 + vv, 0.4); }
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
  { const r = P.R('SPIKE'), c0 = LATEX[v % 3]; P.fill(r, ramp(c0, 5, mixHex(c0, 0x000000, 0.5), 0.5), (u, vv) => 1 + vv * 3, 0.3); }
});

// =====================================================================================
// GULPER
// =====================================================================================
const G_LEGS = [['FL', 1, 0.55], ['FR', -1, 0.55], ['BL', 1, -0.6], ['BR', -1, -0.6]] as const;
const SUCK_N = 14;
function buildGulper(): Rig {
  const rig = newRig(0.5);
  const S = PG.reg('GSKIN'), F = PG.reg('GFOLD'), M = PG.reg('GMOUTH'), Tt = PG.reg('GTOOTH'), E = PG.reg('GEYE'), N = PG.reg('GNOSE'), TL = PG.reg('GTAIL');
  const wet = surfaceMat('lacquer', { alphaTest: 0.5 });
  // the trunk: broad and flat, a wet clear-coat on it; loose skin hanging in folds and flaps down both flanks
  const trunk = tpart(rig, 'trunk', rig.body, [0, 0.36, 0], PG, 'gtrunk', wet, (ob) => {
    const zs = [-0.95, -0.75, -0.45, -0.15, 0.15, 0.45, 0.75, 0.95];
    const ks = [0.7, 0.86, 0.96, 1, 1, 0.97, 0.9, 0.82];
    ob.loft(zs.map((z, i) => ({ pts: bodyRing(z, 0, 0.56 * ks[i], 0.21 * ks[i], 0.19 * ks[i], 21, 2.6, (th) => 0.035 * Math.sin(th * 9 + i * 1.7) + 0.02 * Math.sin(th * 23 + i)), v: 1 - i / 7 })), S, { start: 'pole', end: 'pole', startBulge: 0.08, endBulge: 0.05 });
    // the flank folds: four wavy layers of loose skin each side, sagging between the legs
    for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) {
      const a: V3[] = [], b2: V3[] = [];
      for (let i = 0; i <= 20; i++) {
        const z = -0.9 + i * (1.8 / 20), w = Math.sin(i * 1.9 + k * 2.3) * 0.05 + Math.sin(i * 0.7 + k) * 0.03, sag = Math.sin((i / 20) * Math.PI);
        a.push([sx * (0.5 - k * 0.04), 0.03 - k * 0.07, z]);
        b2.push([sx * (0.72 + sag * 0.1 - k * 0.04 + w), -0.14 - k * 0.07 - sag * 0.07 + w * 0.6, z + w * 0.4]);
      }
      ob.strip(a, b2, F, { double: true });
    }
    // wrinkle ridges across the back, and the lateral-line pores along each flank
    for (let i = 0; i < 11; i++) ob.tube([[-0.46, 0.1, -0.82 + i * 0.165], [-0.2, 0.19, -0.8 + i * 0.165], [0.2, 0.19 + Math.sin(i) * 0.01, -0.81 + i * 0.165], [0.46, 0.1, -0.82 + i * 0.165]], [0.016, 0.022, 0.022, 0.016], 5, F, { start: 'pole', end: 'pole' });
    for (const sx of [-1, 1]) for (let i = 0; i < 16; i++) ob.blob([sx * 0.535, 0.02 + Math.sin(i * 0.8) * 0.01, -0.8 + i * 0.105], [0.012, 0.012, 0.012], 4, 3, N, {});
    // tubercles all over the back
    for (let i = 0; i < 46; i++) { const a = (i * 2.399) % 1, z = -0.85 + (i / 46) * 1.7; ob.blob([(a - 0.5) * 0.8, 0.18 + Math.cos((a - 0.5) * 2.5) * 0.02, z], [0.03, 0.018, 0.03], 5, 3, S, {}); }
    // the gular folds: loose skin hanging in pleats under the throat
    for (let k = 0; k < 3; k++) ob.strip([[-0.42, -0.16, 0.74 + k * 0.08], [0, -0.18, 0.76 + k * 0.08], [0.42, -0.16, 0.74 + k * 0.08]], [[-0.4, -0.26 - k * 0.02, 0.7 + k * 0.08], [0, -0.3 - k * 0.02, 0.72 + k * 0.08], [0.4, -0.26 - k * 0.02, 0.7 + k * 0.08]], F, { double: true });
  });
  // the belly bulge (what it has swallowed)
  bpart(rig, 'bulge', trunk, [0, -0.06, 0.05], PG, 'gbulge', (ob) => {
    ob.blob([0, 0, 0], [0.42, 0.2, 0.62], 12, 7, S, {});
    // a knee and an elbow pressing out from inside
    ob.blob([0.22, 0.08, 0.3], [0.12, 0.1, 0.12], 7, 5, S, {}); ob.blob([-0.18, 0.06, -0.3], [0.13, 0.1, 0.14], 7, 5, S, {});
  });
  // the head: flat and wide as the body, a rounded spade of a snout; it tips back to open the mouth
  const head = tpart(rig, 'head', trunk, [0, 0.02, 0.88], PG, 'ghead', wet, (ob) => {
    const zs = [0, 0.2, 0.42, 0.65, 0.86, 1.02, 1.12];
    const rx = [0.5, 0.64, 0.73, 0.76, 0.7, 0.55, 0.32], up = [0.2, 0.18, 0.155, 0.13, 0.1, 0.075, 0.045];
    ob.loft(zs.map((z, i) => ({ pts: bodyRing(z, 0, rx[i], up[i], 0.02, 21, 2.8, (th) => 0.03 * Math.sin(th * 11 + i * 2)), v: 1 - i / 6 })), S, { end: 'pole', endBulge: 0.035 });
    // the palate under it
    ob.loft(zs.slice(0, 6).map((z, i) => ({ pts: bodyRing(z, -0.015, rx[i] * 0.9, 0.01, 0.01, 15, 2.4), v: 1 - i / 5 })), M, { end: 'flat' });
    // a row of tiny teeth all round the upper jaw rim, inside the lip
    for (let i = 0; i < 56; i++) {
      const t = i / 55, a = (t - 0.5) * Math.PI * 1.05;
      ob.cone([Math.sin(a) * 0.66, -0.025, 0.4 + Math.cos(a) * 0.68], [0, -1, -0.1], 0.01, 0.04, 4, Tt);
    }
    // the upper lip: a fleshy rim all round the jaw edge
    const lip: V3[] = [];
    for (let i = 0; i <= 18; i++) { const a = (i / 18 - 0.5) * Math.PI * 1.1; lip.push([Math.sin(a) * 0.72, -0.015, 0.38 + Math.cos(a) * 0.74]); }
    ob.tube(lip, lip.map(() => [0.04, 0.03] as [number, number]), 6, F, { start: 'pole', end: 'pole' });
    // tiny lidless eyes far apart on top, the nostrils close together right at the tip
    for (const sx of [-1, 1]) {
      ob.blob([sx * 0.38, 0.13, 0.72], [0.045, 0.03, 0.04], 6, 4, S, {});
      ob.blob([sx * 0.38, 0.155, 0.73], [0.026, 0.022, 0.026], 7, 5, E, { emis: 0.3 });
      ob.blob([sx * 0.08, 0.075, 1.08], [0.028, 0.02, 0.024], 6, 4, N, {});
    }
    // tubercles over the skull and down the snout
    for (let i = 0; i < 34; i++) { const a = ((i * 2.399) % 1 - 0.5) * 1.2, z = 0.08 + (i / 34) * 0.95; ob.blob([a * (0.7 - z * 0.25), 0.13 - z * 0.06 + 0.02, z], [0.026, 0.014, 0.026], 5, 3, S, {}); }
  });
  void head;
  // the lower jaw: it drops away, a plate rimmed with lip and teeth, a pink floor and a fat tongue
  bpart(rig, 'jaw', rig.parts.head, [0, -0.03, 0.04], PG, 'gjaw', (ob) => {
    const zs = [0, 0.3, 0.6, 0.88, 1.08];
    const rx = [0.5, 0.68, 0.74, 0.66, 0.4];
    ob.loft(zs.map((z, i) => ({ pts: bodyRing(z, -0.06, rx[i], 0.04, 0.09, 17, 2.6, (th) => 0.03 * Math.sin(th * 9 + i)), v: 1 - i / 4 })), S, { end: 'pole', endBulge: 0.03 });
    ob.loft(zs.slice(0, 4).map((z, i) => ({ pts: bodyRing(z, -0.02, rx[i] * 0.9, 0.02, 0.01, 13, 2.4), v: 1 - i / 3 })), M, { end: 'flat' });
    for (let i = 0; i < 48; i++) { const t = i / 47, a = (t - 0.5) * Math.PI; ob.cone([Math.sin(a) * 0.62, -0.01, 0.42 + Math.cos(a) * 0.62], [0, 1, -0.1], 0.01, 0.036, 4, Tt); }
    const lip: V3[] = [];
    for (let i = 0; i <= 16; i++) { const a = (i / 16 - 0.5) * Math.PI; lip.push([Math.sin(a) * 0.68, 0.0, 0.42 + Math.cos(a) * 0.68]); }
    ob.tube(lip, lip.map(() => [0.035, 0.03] as [number, number]), 6, F, { start: 'pole', end: 'pole' });
    ob.blob([0, 0.01, 0.45], [0.3, 0.045, 0.32], 9, 5, M, {});
  });
  // the labial lobes: fleshy flaps at the corners of the mouth; they close in to make the mouth a tube when it sucks
  for (const sx of [-1, 1]) bpart(rig, sx > 0 ? 'lobeL' : 'lobeR', rig.parts.head, [sx * 0.68, -0.04, 0.24], PG, 'globe', (ob) => {
    ob.blob([0, 0, 0.08], [0.07, 0.09, 0.2], 9, 6, F, {});
    ob.blob([0, -0.02, 0.2], [0.05, 0.06, 0.1], 7, 5, M, {});
  });
  // the throat pouch: it drops and swells as it sucks, and pumps as it swallows
  bpart(rig, 'throat', trunk, [0, -0.12, 0.8], PG, 'gthroat', (ob) => { ob.blob([0, 0, 0.06], [0.44, 0.15, 0.36], 12, 7, F, {}); });
  // stubby limbs, four fat toes webbed with skin
  for (const [n, sx, z] of G_LEGS) {
    const up = bpart(rig, 'leg' + n + 'u', trunk, [sx * 0.46, -0.08, z], PG, 'glegu', (ob) => {
      ob.tube([[0, 0, 0], [0.18, -0.06, 0.02], [0.32, -0.1, 0.02]], [0.12, 0.1, 0.085], 9, S, { start: 'pole', end: 'pole', bump: (i, th) => 0.06 * Math.sin(th * 5 + i) });
      // a skin flap trailing behind the limb
      ob.strip([[0.05, -0.02, -0.06], [0.28, -0.08, -0.06]], [[0.04, -0.1, -0.16], [0.26, -0.14, -0.12]], F, { double: true });
    });
    if (sx < 0) up.scale.x = -1;
    bpart(rig, 'leg' + n + 'd', up, [0.32, -0.1, 0.02], PG, 'glegd', (ob) => {
      ob.tube([[0, 0, 0], [0.04, -0.14, 0.02], [0.06, -0.24, 0.03]], [0.085, 0.075, 0.065], 8, S, { start: 'pole' });
      const tips: V3[] = [];
      for (let k = 0; k < 4; k++) {
        const a = -0.55 + k * 0.37, tip: V3 = [0.06 + Math.sin(a) * 0.14, -0.27, 0.03 + Math.cos(a) * 0.14];
        tips.push(tip);
        ob.tube([[0.06, -0.24, 0.03], [(0.06 + tip[0]) / 2, -0.265, (0.03 + tip[2]) / 2], tip], [0.035, 0.026, 0.02], 6, S, { end: 'pole', endBulge: 0.01 });
      }
      // the webbing between the toes
      for (let k = 0; k < 3; k++) ob.strip([[0.06, -0.255, 0.03], [0.06, -0.255, 0.03]], [[tips[k][0] * 0.75 + 0.015, -0.265, tips[k][2] * 0.75], [tips[k + 1][0] * 0.75 + 0.015, -0.265, tips[k + 1][2] * 0.75]], F, { double: true });
    });
  }
  // the long paddle tail: four segments, each a tall thin blade, a fin of skin along the top
  let par: THREE.Object3D = trunk, at: V3 = [0, 0, -0.92];
  for (let i = 0; i < 4; i++) {
    const L = 0.4, h = 0.24 - i * 0.03, w = 0.17 - i * 0.035;
    par = tpart(rig, 'tail' + i, par, at, PG, 'gtail' + i, wet, (ob) => {
      const zs = [0, -L * 0.5, -L];
      ob.loft(zs.map((z, j) => ({ pts: bodyRing(z, 0.02, (w - j * 0.015) * 0.55, h - j * 0.015 + 0.04, h * 0.8 - j * 0.01, 15, 2.2, (th) => 0.03 * Math.sin(th * 7 + j)), v: 1 - j / 2 })), TL, { end: i === 3 ? 'pole' : null, endBulge: 0.1 });
      ob.strip([[0, h + 0.05, 0], [0, h + 0.04, -L]], [[0, h + 0.13 - i * 0.015, -0.02], [0, h + 0.11 - i * 0.015, -L]], F, { double: true });
    });
    at = [0, 0, -0.4];
  }
  // the suction: water and grit rushing into the mouth, and the pull ring in the water ahead of it
  const suck = new THREE.Group(); suck.name = 'suck'; rig.root.add(suck); rig.parts.suck = suck; suck.visible = false;
  for (let i = 0; i < SUCK_N; i++) bpart(rig, 'sb' + i, suck, [0, 0, 0], PG, 'gsuckbit', (ob) => { ob.blob([0, 0, 0], [0.035, 0.03, 0.05], 5, 4, PG.reg('GTOOTH'), { emis: 0.4 }); });
  tpart(rig, 'sring', suck, [0, 0, 0], PG, 'gsring', filmMat(0.45), (ob) => {
    const path: V3[] = []; for (let i = 0; i <= 24; i++) { const a = (i / 24) * Math.PI * 2; path.push([Math.cos(a), Math.sin(a) * 0.55, 0]); }
    ob.tube(path, path.map(() => 0.035), 6, PG.reg('TFIN'), { emis: 0.5 });
  });
  rig.eyes = [];
  return rig;
}

interface GulpDrive { t: number; dt: number; speed: number; gape: number; sub: number; gulp: number; struggle: number; swim: number; dead: number; flinch: number; suck: number; pump: number; pucker: number }
function poseGulper(rig: Rig, d: GulpDrive) {
  const P = rig.parts, t = d.t, ud = rig.root.userData as Record<string, any>;
  ud.ph = (ud.ph ?? 0) + d.dt * (1.2 + d.speed * 2.5);
  const ph = ud.ph;
  const swim = d.swim, walk = clamp01(d.speed / 0.6) * (1 - swim);
  // breathing; the throat pumps (buccal pumping, the way they breathe) and drops wide to suck
  const br = Math.sin(t * 1.4) * 0.03;
  P.trunk.position.y = 0.36 + br * 0.3 - d.dead * 0.2;
  P.trunk.rotation.set(0, Math.sin(ph) * 0.12 * (walk + swim * 0.6), Math.sin(ph * 0.5) * 0.04 * walk + (d.dead ? 2.9 : 0));
  const pumpK = Math.max(0, Math.sin(t * 6)) * 0.12 * (1 - d.gape) + d.pump * Math.max(0, Math.sin(t * 9)) * 0.5;
  P.throat.scale.set(1 + d.gulp * 0.4 + d.suck * 0.35, 1 + pumpK + d.gulp * 0.7 + d.suck * 1.6, 1 + d.gulp * 0.25 + d.suck * 0.25);
  P.throat.position.y = -0.12 - d.suck * 0.12;
  // the mouth: skull back, jaw down. Sucking it opens fast and only part way, lobes closed in to a tube
  const g = Math.max(d.gape, d.suck * 0.42);
  P.head.rotation.set(-g * 1.25 + d.flinch * 0.1 - clamp01(d.sub) * 0.2 * swim, Math.sin(ph) * -0.08 * walk, 0);
  P.jaw.rotation.set(g * 1.45 + Math.sin(t * 3) * 0.02, 0, 0);
  const pk = d.pucker;
  P.lobeL.rotation.set(0, -0.15 + pk * 0.95, 0); P.lobeR.rotation.set(0, 0.15 - pk * 0.95, 0);
  P.lobeL.scale.set(1, 1 + pk * 0.8, 1 + pk * 0.3); P.lobeR.scale.set(1, 1 + pk * 0.8, 1 + pk * 0.3);
  // the bulge: something whole inside it, kicking
  const bg = d.gulp;
  P.bulge.visible = bg > 0.02;
  P.bulge.scale.set(0.4 + bg * 0.8 + Math.sin(t * 9) * 0.05 * d.struggle, 0.4 + bg * 0.9 + Math.sin(t * 11 + 1) * 0.08 * d.struggle, 0.5 + bg * 0.6);
  P.bulge.position.y = -0.06 - bg * 0.12;
  // legs: a slow sprawling walk on land; tucked against the body swimming
  G_LEGS.forEach(([n, sx], i) => {
    const off = i === 0 || i === 3 ? 0 : Math.PI;
    const s = Math.sin(ph + off);
    const tuck = swim;
    P['leg' + n + 'u'].rotation.set(0, (s * 0.5 * walk) * (n.startsWith('F') ? 1 : -1) * sx + tuck * 0.9 * sx * (n.startsWith('F') ? -1 : 1), -0.35 + Math.max(0, Math.cos(ph + off)) * 0.4 * walk + tuck * 0.3 - d.dead * 0.6);
    P['leg' + n + 'd'].rotation.set(0, 0, 0.5 - s * 0.2 * walk);
  });
  // the tail: a wave down it; strong strokes swimming, a drag on land
  for (let i = 0; i < 4; i++) P['tail' + i].rotation.set(0, Math.sin(ph * (swim ? 1.6 : 1) - i * 0.8) * (0.18 + swim * 0.3 + i * 0.05) * (1 - d.dead * 0.8) + (d.dead ? 0.2 : 0), 0);
  // the suction: grit and water streaming in from a cone ahead of the mouth, the pull ring closing on it
  const sk = d.suck;
  P.suck.visible = sk > 0.02;
  if (P.suck.visible) {
    const mouthZ = 2.2, mouthY = 0.38;
    for (let i = 0; i < SUCK_N; i++) {
      const ph2 = ((t * 2.6 + i / SUCK_N) % 1);
      const a = i * 2.399, r0 = 1.4 * (1 - ph2);
      const b = P['sb' + i];
      b.position.set(Math.cos(a) * r0 * 0.9, mouthY + Math.sin(a) * r0 * 0.4 + 0.05, mouthZ + (1 - ph2) * 2.6);
      b.scale.setScalar((0.6 + (1 - ph2) * 0.8) * sk);
      b.rotation.set(0, 0, a);
    }
    const ring = P.sring, rk = (t * 2.2) % 1;
    ring.position.set(0, mouthY + 0.05, mouthZ + 0.4 + (1 - rk) * 1.8);
    ring.scale.setScalar((0.25 + (1 - rk) * 1.4) * sk);
  }
}

type GMd = 'lurk' | 'stalk' | 'burst' | 'gulp' | 'return' | 'haul';
function gSet(c: Creature, md: GMd) { const n = net(c); if (n.md !== md) { n.md = md; c.mem.mdT = 0; } }
function thinkGulper(c: Creature, dt: number): boolean {
  const z = G.getZone(c.zoneKey) as Zone, m = c.mem, n = net(c), cs = CS(), now = G.time;
  const ev = pulse(c);
  m.mdT = (m.mdT ?? 0) + dt;
  const pl = plungeOf(z);
  if (!m.init) { m.init = 1; gSet(c, 'lurk'); m.home = { x: c.x, z: c.z }; }
  const md = (n.md ?? 'lurk') as GMd;
  const inWater = waterAt(z, c.x, c.z) === 'deep';
  // ---------------- something in it
  if (md === 'gulp') {
    const p = G.players.get(n.gp);
    c.speed = 0; c.vx = c.vz = 0; c.setState('eat');
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
  let prey: { p: Player; d: number } | null = null;
  for (const p of playersIn(c.zoneKey)) {
    if (p.body.dead) continue;
    const d = dist(p, c);
    const pw = waterAt(z, p.x, p.z);
    const edge = !pw && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => waterAt(z, p.x + dx, p.z + dy) === 'deep');
    const reach = pw === 'deep' ? 12 : edge ? 4.2 : pw === 'shallow' ? 3.2 : 0;
    if (d < reach && (!prey || d < prey.d)) prey = { p, d };
  }
  if (md === 'lurk' || md === 'stalk' || md === 'return') {
    n.sub = md === 'lurk' ? 1 : 0.5;
    if (now < (m.restT ?? 0)) prey = null;
    if (prey && prey.d < 3.4) {
      // up out of the water at them
      gSet(c, 'burst'); fx(c, 'burst'); m.from = { x: c.x, z: c.z }; m.target = { x: prey.p.x, z: prey.p.z }; m.prey = prey.p.id; c.targetId = prey.p.id; ruleShown(c);
      return true;
    }
    if (prey) {
      // creep toward them along the bottom, staying in the deep water
      c.setState('stalk');
      const to = waterAt(z, prey.p.x, prey.p.z) === 'deep' ? { x: prey.p.x, z: prey.p.z } : null;
      const tgt = to ?? (() => { const a = angTo(c, prey!.p.x, prey!.p.z); const x = c.x + Math.cos(a) * 1.2, zz = c.z + Math.sin(a) * 1.2; return waterAt(z, x, zz) === 'deep' ? { x, z: zz } : null; })();
      if (tgt) cs.moveTo(c, z, tgt.x, tgt.z, c.sp.walk * 1.6, dt, 0.8);
      else { c.speed = 0; c.targetFacing = angTo(c, prey.p.x, prey.p.z); }
      if (md !== 'stalk') gSet(c, 'stalk');
      return true;
    }
    // nothing: settle on the bottom, drift a little
    c.setState('hide');
    if (!inWater) {
      const home = pl ? { x: pl.lair[0] + 0.5, z: pl.lair[1] + 0.5 } : m.home;
      const w = waterSpot(z, c.x, c.z, 6, 'deep') ?? home;
      cs.moveTo(c, z, w.x, w.z, c.sp.walk, dt, 0.4);
      return true;
    }
    if (md !== 'lurk') gSet(c, 'lurk');
    if (!m.drift || m.mdT > (m.dT ?? 20)) { m.drift = waterSpot(z, c.x, c.z, 5, 'deep'); m.dT = rng.float(15, 40); m.mdT = 0; }
    if (m.drift && cs.moveTo(c, z, m.drift.x, m.drift.z, c.sp.walk * 0.4, dt, 0.4)) m.drift = null;
    return true;
  }
  if (md === 'burst') {
    // a lunge: it comes up and forward a couple of metres, mouth wide
    const k = Math.min(1, m.mdT / 0.55);
    const a = angTo(m.from, m.target.x, m.target.z), L = Math.min(3, Math.hypot(m.target.x - m.from.x, m.target.z - m.from.z));
    c.x = m.from.x + Math.cos(a) * L * k; c.z = m.from.z + Math.sin(a) * L * k; c.vx = c.vz = 0; c.speed = 4;
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
  if (md === 'haul') gSet(c, 'return');
  return true;
}

function animateGulper(rig: Rig, c: Creature, t: number, dt: number) {
  applyLook(rig, c, PG, 0.05);
  const n = netOf(c), ud = rig.root.userData as Record<string, any>;
  const md = (n.md ?? 'lurk') as GMd;
  const z = live() ? G.zones.get(c.zoneKey) as Zone ?? null : null;
  const f = fxPoll(rig, c);
  if (f) {
    if (f.key === 'burst') { playAt('lifeguard_splash', c, 1, 26, 0.7); playAt('arv_gulp', c, 1, 26, 0.5); playAt('davenport_roar', c, 0.6, 30, 0.45); if (G.local && dist(G.local, c) < 10) G.camera?.shake?.(0.35, 0.5); }
    else if (f.key === 'gulp') { playAt('bh_gulp', c, 1, 18, 0.55); playAt('bh_swallow', c, 0.9, 16, 0.6); ud.gulpT = t; }
    else if (f.key === 'chew') playAt(rng.chance(0.5) ? 'bh_squelch' : 'gore_squelch', c, 0.7, 12, 0.6);
    else if (f.key === 'spit') { playAt('arv_spit', c, 1, 20, 0.6); playAt('lifeguard_splash', c, 0.8, 20, 0.9); spitOut(c, f.a?.pid, f.a?.a ?? c.facing); }
    else if (f.key === 'miss') playAt('lifeguard_splash', c, 0.6, 16, 1.1);
  }
  const water = waterAt(z, c.x, c.z);
  const swim = water === 'deep' ? 1 : 0;
  ud.sw = (ud.sw ?? swim) + (swim - (ud.sw ?? swim)) * damp(3, dt);
  // how far under it lies: lurking only the nostrils and eyes break the surface
  const subT = c.dead ? 0.6 : md === 'lurk' ? 1 : md === 'stalk' ? 0.85 : md === 'burst' ? -0.3 : md === 'gulp' ? 0.2 : 0.6;
  ud.sub = (ud.sub ?? subT) + (subT * ud.sw - (ud.sub ?? 0)) * damp(md === 'burst' ? 14 : 2.5, dt);
  rig.root.position.y = c.y - (ud.sub ?? 0) * 0.63 + (md === 'burst' ? Math.sin(Math.min(1, (t - (ud.bT ?? t)) / 0.55) * Math.PI) * 0.4 : 0);
  if (md === 'burst' && ud.lastMd !== 'burst') ud.bT = t;
  ud.lastMd = md;
  // the strike is a suction strike: the throat drops, the jaws flash open only part way with the lip lobes
  // closed in to a tube, and the water ahead (and whatever is in it) rushes into the mouth; then it snaps shut
  const bt = md === 'burst' ? t - (ud.bT ?? t) : 9;
  const suckT = md === 'burst' ? (bt < 0.5 ? 1 : 0) : 0;
  // idle gulps: every few seconds it drops its throat and snaps a mouthful of water
  if (!c.dead && (md === 'lurk' || md === 'stalk') && t > (ud.igT ?? 0)) { ud.igT = t + rng.float(4.5, 8); ud.igS = t; if (G.local && dist(G.local, c) < 12) playAt('bh_gulp', c, 0.35, 10, 0.9); }
  const ig = t - (ud.igS ?? -9) < 0.45 ? Math.sin(((t - (ud.igS ?? -9)) / 0.45) * Math.PI) : 0;
  ud.sk = (ud.sk ?? 0) + (Math.max(suckT, ig * 0.35) - (ud.sk ?? 0)) * damp(suckT ? 30 : 9, dt);
  ud.pk = (ud.pk ?? 0) + (Math.max(suckT, ig * 0.7) - (ud.pk ?? 0)) * damp(20, dt);
  // the full, flat-open gape is its threat: struck at, or striking at a unit already in its reach
  const gT = c.attackPhase > 0 ? 0.85 : md === 'gulp' ? (t - (ud.gulpT ?? -9) < 0.25 ? 0.5 : 0) : md === 'stalk' ? 0.05 : 0.02;
  ud.g = (ud.g ?? 0) + (gT - (ud.g ?? 0)) * damp(gT > (ud.g ?? 0) ? 16 : 6, dt);
  const gl = md === 'gulp' ? 1 : 0;
  ud.gl = (ud.gl ?? 0) + (gl - (ud.gl ?? 0)) * damp(gl ? 4 : 1.2, dt);
  ud.dk = c.dead ? Math.min(1, (ud.dk ?? 0) + dt) : 0;
  const pump = md === 'gulp' && t - (ud.gulpT ?? -9) < 2.5 ? 1 : 0;
  poseGulper(rig, { t, dt, speed: c.speed, gape: ud.g, sub: ud.sub, gulp: ud.gl, struggle: gl, swim: ud.sw, dead: ud.dk, flinch: clamp01(c.hitFlash / 0.15), suck: ud.sk, pump, pucker: ud.pk });
  // the pull: a unit in front of the mouth while it sucks is dragged toward it (on their own machine)
  if (live() && G.local && suckT && !c.dead) {
    const me = G.local, hx = c.x + Math.cos(c.facing) * 1.9, hz = c.z + Math.sin(c.facing) * 1.9;
    const dx = hx - me.x, dz = hz - me.z, d = Math.hypot(dx, dz);
    const ahead = (me.x - c.x) * Math.cos(c.facing) + (me.z - c.z) * Math.sin(c.facing);
    if (d < 4.2 && d > 0.3 && ahead > 0) { const k = (1 - d / 4.2) * 6 * dt; me.x += (dx / d) * k * 2.2; me.z += (dz / d) * k * 2.2; thinkOnce(me, 'pl_suck', 'It is PULLING me in. The water is going into its mouth and I am going with it.', 20); }
  }
  // the swallowed unit: held inside it (on their own machine)
  if (live() && G.local) {
    const me = G.local;
    if (n.gp === me.id && !c.dead) {
      me.x = c.x + Math.cos(c.facing) * 0.2; me.z = c.z + Math.sin(c.facing) * 0.2; me.vx = me.vz = 0;
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
  gore: { blood: 'pale', tint: 0xf0c8c8, flesh: 0xf0e4dc, gib: false, sever: ['tail2', 'legFLd', 'legBRd'], head: 'head' },
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
const ROPE_N = 8;
function buildPuffer(): Rig {
  const rig = newRig(2.0);
  const L = PG.reg('LATEX'), K = PG.reg('KNOT'), Sp = PG.reg('SPIKE');
  const float = new THREE.Group(); float.name = 'float'; rig.root.add(float); rig.parts.float = float;
  // the balloon: a round fish body, a little puckered mouth at the front, latex fins
  bpart(rig, 'balloon', float, [0, 0, 0], PG, 'pball', (ob) => {
    ob.blob([0, 0, 0], [0.26, 0.24, 0.3], 16, 11, L, {});
    ob.blob([0, -0.03, 0.29], [0.05, 0.04, 0.03], 8, 5, K, {});
    for (const sx of [-1, 1]) ob.strip([[sx * 0.2, -0.02, 0.08], [sx * 0.22, -0.05, 0.02]], [[sx * 0.33, 0.0, 0.0], [sx * 0.32, -0.06, -0.06]], L, { double: true });
    ob.strip([[0, 0.22, -0.05], [0, 0.18, -0.2]], [[0, 0.3, -0.12], [0, 0.24, -0.26]], L, { double: true });
  });
  // the latex spikes: hidden flat, they stand up when it puffs
  bpart(rig, 'spikes', float, [0, 0, 0], PG, 'pspikes', (ob) => {
    for (let i = 0; i < 26; i++) {
      const a = (i * 2.399) % (Math.PI * 2), y = 1 - (i + 0.5) / 13 * 0.9 - 0.05;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const d: V3 = [Math.cos(a) * r, y, Math.sin(a) * r * 1.1];
      ob.cone([d[0] * 0.24, d[1] * 0.22, d[2] * 0.27], d, 0.022, 0.08, 4, Sp);
    }
  });
  // the knot at the tail, and the curled neck of the balloon
  bpart(rig, 'knot', float, [0, -0.02, -0.3], PG, 'pknot', (ob) => {
    ob.tube([[0, 0, 0], [0, -0.01, -0.05], [0.01, -0.02, -0.08]], [0.035, 0.022, 0.03], 8, K, { start: 'pole', end: 'pole' });
    ob.blob([0.015, -0.025, -0.1], [0.03, 0.022, 0.028], 7, 5, K, {});
    ob.strip([[-0.04, -0.02, -0.1], [0.06, -0.02, -0.1]], [[-0.06, 0.03, -0.17], [0.08, 0.02, -0.17]], K, { double: true });
  });
  // the eyes: two human eyeballs, wet and veined, set into the latex
  for (const s of [-1, 1]) {
    const sock = bpart(rig, s > 0 ? 'sockR' : 'sockL', float, [s * 0.16, 0.07, 0.19], PG, 'psock', (ob) => { ob.blob([0, 0, 0], [0.07, 0.07, 0.05], 10, 6, L, {}); });
    void sock;
    const eb = bpart(rig, s > 0 ? 'eyeR' : 'eyeL', float, [s * 0.2, 0.075, 0.22], PG, 'peye', (ob) => {
      // the eyeball, its front (the iris) along +z
      ob.blob([0, 0, 0], [0.078, 0.078, 0.078], 14, 10, PG.reg('EYEB'), { emis: 0.12 });
      ob.cone([0, 0, 0.07], [0, 0, 1], 0.036, 0.012, 14, PG.reg('IRISC'), { emis: 0.15 });
      ob.blob([-0.015, 0.018, 0.078], [0.009, 0.009, 0.004], 5, 3, PG.reg('EYEB'), { emis: 1 });
    });
    eb.rotation.y = s * 0.45;
  }
  // the string: a chain of short links, simulated
  for (let i = 0; i < ROPE_N; i++) bpart(rig, 'str' + i, rig.root, [0, 0, 0], PG, 'pstr', (ob) => { ob.tube([[0, 0, 0], [0, 0, 0.16]], [0.004, 0.004], 4, PG.reg('STRING'), {}); });
  rig.eyes = [];
  return rig;
}
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion(), _zA = new THREE.Vector3(0, 0, 1);
function animatePuffer(rig: Rig, c: Creature, t: number, dt: number) {
  applyLook(rig, c, PG, 0.1);
  const n = netOf(c), ud = rig.root.userData as Record<string, any>, P = rig.parts;
  const seed = hashId(c.id);
  const f = fxPoll(rig, c);
  if (f) {
    if (f.key === 'puff') { playAt('bubble_inflate', c, 0.8, 14, 1.1); playAt('tim_squeak', c, 0.7, 14, 1.2); }
    else if (f.key === 'deflate') { playAt('tim_deflate', c, 0.8, 16, 1.3); }
    else if (f.key === 'pop') { playAt('tim_pop', c, 1, 40, 1.0); playAt('bubble_pop', c, 0.8, 30, 0.7); if (G.local && dist(G.local, c) < 8) { G.camera?.shake?.(0.25, 0.3); thinkOnce(G.local, 'pl_pop', 'BANG. It POPPED. Everything in the water heard that.', 20); } }
  }
  // inflation (replicated), the bob, the dart
  const puffT = n.pf ? 1 : 0;
  ud.pf = (ud.pf ?? 0) + (puffT - (ud.pf ?? 0)) * damp(puffT ? 7 : 2.5, dt);
  const pf = ud.pf;
  const deadK = c.dead ? Math.min(1, (ud.dk = (ud.dk ?? 0) + dt * 3)) : (ud.dk = 0);
  const hover = c.dead ? 0.05 : 1.9 + Math.sin(t * 0.9 + seed * 6) * 0.15 + Math.sin(t * 0.37 + seed) * 0.1;
  ud.h = (ud.h ?? hover) + (hover - (ud.h ?? hover)) * damp(c.dead ? 6 : 2, dt);
  const fl = P.float;
  fl.position.set(0, ud.h, 0);
  const wob = Math.sin(t * 5 + seed * 4) * 0.03;
  const s = c.dead ? 1 : 1 + pf * 0.55;
  fl.scale.set(s * (1 + wob) * (1 - deadK * 0.4), s * (1 - wob) * (1 - deadK * 0.82), s * (1 + deadK * 0.3));
  fl.rotation.set(Math.sin(t * 0.7 + seed) * 0.1 + Math.min(0.4, c.speed * 0.12), Math.sin(t * 0.33 + seed * 2) * 0.2, Math.sin(t * 0.9) * 0.12 + deadK * 0.4);
  P.spikes.visible = pf > 0.15 && !c.dead;
  P.spikes.scale.setScalar(0.4 + pf * 0.6);
  // the eyes dart: a new target every so often, snapping to it (saccades)
  if (t > (ud.eyeT ?? 0)) { ud.eyeT = t + rng.float(0.25, 1.1); ud.ey = rng.float(-0.6, 0.6); ud.ep = rng.float(-0.35, 0.35); }
  if (c.targetId && live() && t > (ud.lookT ?? 0)) {
    const p = G.players.get(c.targetId);
    if (p) { ud.lookT = t + 0.4; const a = Math.atan2(p.z - c.z, p.x - c.x) - c.facing; ud.ey = Math.max(-0.9, Math.min(0.9, -a)); ud.ep = 0.25; }
  }
  for (const k of ['L', 'R']) {
    const e = P['eye' + k], sx = k === 'R' ? 1 : -1;
    const ty = (ud.ey ?? 0) + sx * 0.45, tp = ud.ep ?? 0;
    e.rotation.y += (ty - e.rotation.y) * Math.min(1, dt * 30);
    e.rotation.x += (tp - e.rotation.x) * Math.min(1, dt * 30);
    e.scale.setScalar(1 + pf * 0.25);
    e.visible = true;
  }
  // the string: verlet links hanging from the knot, dragged by the drift
  const knotW = _a.set(0, -0.05, -0.38).multiplyScalar(s).applyEuler(fl.rotation).add(_b.set(0, ud.h, 0));
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
  if (p && c.visibleToLocal && dist(p, c) < 6) thinkOnce(p, 'pl_puffer', ['A balloon. A pufferfish balloon. With EYES. Real eyes. They are looking at me.', 'It is drifting over the water. Its eyes keep darting about.', 'Do not touch it. Do not make it jump.'][Math.floor(t * 0.2) % 3], 80);
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
  rule: { name: 'DO NOT STARTLE IT', text: 'It drifts over the water, harmless. Run at it or make a loud noise near it and it puffs up; then, if you are still right next to it (or you hit it), it pops with a bang that brings everything in the water and the tunnels. Back off and it lets its air out and darts away instead. Walk past it slowly.', tell: 'A pufferfish-shaped party balloon with two real eyes in it.' },
  hp: 6, walk: 0.5, run: 4.0, turn: 3, radius: 0.3, height: 2.2, sight: 8, fov: 3, hearing: 1.8,
  zones: ['plunge', 'pools'], weight: 1, group: [1, 2], maxPerZone: 5, diet: 'none',
  meat: [['puffer_latex', 1]],
  flags: { flying: true },
  sounds: { idle: 'bubble_wob', alert: 'bubble_squeak', hurt: 'tim_squeak', death: 'tim_pop' },
  scan: { cls: 'Anomaly / inflatable, with human eyes', notes: ['A party balloon in the shape of a pufferfish. The eyes are human.', 'Startled, it puffs up. Close up or struck, it pops loudly.', 'Its pop carries down every tunnel. Things come to it.'] },
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
  const q = galleryPoseParam() || ['lurk', 'suck', 'walk', 'gape', 'gulp', 'swim'][Math.floor(t / 4) % 6];
  const ud = rig.root.userData as Record<string, any>;
  const dt = 1 / 60;
  // the suction strike loops every 1.6 s: throat drop, mouth flashes open to a tube, water rushes in, snap shut
  const st = t % 1.6, suckT = q === 'suck' && st < 0.5 ? 1 : 0;
  ud.sk = (ud.sk ?? 0) + (suckT - (ud.sk ?? 0)) * damp(suckT ? 30 : 9, dt);
  ud.pk = (ud.pk ?? 0) + (suckT - (ud.pk ?? 0)) * damp(20, dt);
  ud.g = (ud.g ?? 0) + ((q === 'gape' ? 1 : 0.02) - (ud.g ?? 0)) * damp(q === 'gape' ? 10 : 4, dt);
  ud.gl = (ud.gl ?? 0) + ((q === 'gulp' ? 1 : 0) - (ud.gl ?? 0)) * damp(3, dt);
  poseGulper(rig, { t, dt, speed: q === 'walk' ? 0.6 : q === 'swim' ? 1 : 0, gape: ud.g, sub: 0, gulp: ud.gl, struggle: q === 'gulp' ? 1 : 0, swim: q === 'swim' ? 1 : 0, dead: 0, flinch: 0, suck: ud.sk, pump: q === 'gulp' ? 1 : 0, pucker: Math.max(ud.pk, q === 'lurk' ? (Math.sin(t * 1.2) > 0.9 ? 0.6 : 0) : 0) });
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
