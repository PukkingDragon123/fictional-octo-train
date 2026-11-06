import { horrify } from '../kit/horror';
import * as THREE from 'three';
import { def, Rig } from '../species';
import { makeRamp, mixHex } from '../../gfx/pixel';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import { queueAt } from '../../actions/basic';
import { UseObjectAction } from '../../actions/world';
import { createItem } from '../../items/factory';
import type { Creature } from '../creature';
import type { Player } from '../../entities/player';
import { objDef } from '../../world/objects';
import { objectMatrix } from '../../world/chunkMesher';
import { CS, zoneOf, objectsNear, creatureMenu, poke, poked, pulse, attack, findSpot, onKilled, stop, faceTo, isHost } from '../behaviors_a';
import { net, netOf, playAt, hashId, fakeCreature, rng, lightAt, live, localIn, thinkOnce, dist, playersIn } from '../behaviors_b';
import {
  KitDef, KitRig, BoneSpec, SkinB, BuildCtx, Page, V3, Wt, buildKitRig, kitSync, kitPersonalize, kitEntry, attackCurve, flinchOf, hash, offset, lostParts,
} from '../kit/humanoids';
import { chain, sac, paintChitin, paintSkin, paintCap, paintEye } from '../kit/organic';
import '../../audio/sounds_creatures_c';

// =====================================================================================
// MULCHERS — cat-sized insects that look assembled from spares: a glossy split
// carapace and far too many legs, a few grown out of the wrong segments. Alone
// they skitter between shadows. Three or more that meet a warm body lock legs
// and roll at it as one writhing ball. Gravid females lay their clutches in
// still, soft places: upholstery, mattresses, the laps of Still Lifes. The
// eggs hatch when they have been left alone long enough.
//   mulcher         the single insect (skinned kit rig, tripod gait, writhing extras)
//   mulcher_ball    the rolling mass (instanced flip-book of baked mulcher poses)
//   mulcher_clutch  an egg clutch stuck in furniture or on a Still Life
// =====================================================================================

const SIDES = [['L', 1], ['R', -1]] as const;
/** the wrong limbs: [parent, offset of the first joint, first segment, second segment, has a hand] per variant (six each, seeded) */
const SPOTS: [string, V3, V3][] = [
  ['abd', [0.065, 0.03, -0.03], [1, 0.55, 0.1]], ['abd', [-0.065, 0.03, -0.03], [-1, 0.55, 0.1]], ['abd', [0.0, 0.072, -0.05], [0.1, 1, -0.3]],
  ['abd2', [0.045, 0.025, -0.03], [1, 0.3, -0.4]], ['abd2', [-0.045, 0.025, -0.03], [-1, 0.3, -0.4]], ['abd2', [0.0, -0.025, -0.06], [0, -0.5, -1]],
  ['thorax', [0.025, 0.05, 0.01], [0.5, 1, 0.3]], ['thorax', [-0.03, 0.048, -0.02], [-0.5, 1, -0.1]], ['thorax', [0.0, -0.035, 0.035], [0.2, -1, 0.6]],
  ['head', [0.03, 0.03, 0.03], [0.8, 0.7, 0.5]], ['head', [-0.026, -0.018, 0.035], [-0.7, -0.4, 0.7]], ['abd', [0.04, -0.04, -0.06], [0.7, -0.8, -0.2]],
];
const nrm3 = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const EXTRA: [string, V3, V3, V3, boolean][][] = [0, 1, 2].map((v) => {
  const order = SPOTS.map((_, i) => i).sort((a, b) => hash(a, v * 13 + 5) - hash(b, v * 13 + 5)).slice(0, 6);
  return order.map((si, j) => {
    const [par, at, nn] = SPOTS[si];
    const n0 = nrm3(nn);
    const L1 = 0.06 + hash(j, v + 3) * 0.05, L2 = 0.05 + hash(j, v + 7) * 0.06;
    const d1: V3 = [n0[0] * L1 + (hash(j, v + 11) - 0.5) * 0.03, n0[1] * L1 + 0.02, n0[2] * L1 + (hash(j, v + 12) - 0.5) * 0.03];
    // the second segment hooks back down and round, the way a broken finger sets
    const d2: V3 = [n0[0] * L2 * 0.5 + (hash(j, v + 13) - 0.5) * 0.04, -L2 * 0.8, n0[2] * L2 * 0.5 + (hash(j, v + 14) - 0.5) * 0.04];
    return [par, at, d1, d2, j < 2] as [string, V3, V3, V3, boolean];
  });
});
function bonesM(v: number): BoneSpec[] {
  const b: BoneSpec[] = [
    { name: 'thorax', parent: '', at: [0, 0.17, 0], cap: true },
    { name: 'head', parent: 'thorax', at: [0, 0.005, 0.085], cap: true },
    { name: 'mandL', parent: 'head', at: [0.018, -0.022, 0.055] },
    { name: 'mandR', parent: 'head', at: [-0.018, -0.022, 0.055] },
    { name: 'antL1', parent: 'head', at: [0.016, 0.02, 0.05] }, { name: 'antL2', parent: 'antL1', at: [0.03, 0.05, 0.04] },
    { name: 'antR1', parent: 'head', at: [-0.016, 0.02, 0.05] }, { name: 'antR2', parent: 'antR1', at: [-0.03, 0.05, 0.04] },
    { name: 'abd', parent: 'thorax', at: [0, 0, -0.075], cap: true },
    { name: 'abd2', parent: 'abd', at: [0, -0.01, -0.09] },
  ];
  for (let i = 0; i < 3; i++) for (const [s, k] of SIDES) {
    const fz = (1 - i) * 0.03, sz = 0.045 - i * 0.045;
    b.push(
      { name: `c${i}${s}`, parent: 'thorax', at: [k * 0.045, -0.015, sz], cap: true },
      { name: `f${i}${s}`, parent: `c${i}${s}`, at: [k * 0.07, 0.06, fz] },
      { name: `t${i}${s}`, parent: `f${i}${s}`, at: [k * 0.065, -0.11, fz * 1.2] },
    );
  }
  EXTRA[v % 3].forEach(([par, at, d1], j) => {
    b.push({ name: `x${j}a`, parent: par, at, cap: true }, { name: `x${j}b`, parent: `x${j}a`, at: d1 });
  });
  return b;
}
function layoutM(p: Page) {
  p.reg('THX', 40, 28); p.reg('HEAD', 28, 16); p.reg('ABD', 48, 40); p.reg('LEG', 10, 44); p.reg('XLEG', 10, 44);
  p.reg('EYE', 8, 8); p.reg('MAND', 8, 16); p.reg('CAP', 12, 12);
}
function buildM(B: SkinB, x: BuildCtx) {
  const bi = x.bi, R = x.R;
  const TH = bi('thorax'), HD = bi('head'), AB = bi('abd'), A2 = bi('abd2');
  const seed = x.variant * 7 + 1;
  // thorax: armoured segments with a dorsal keel and a row of short spurs
  sac(B, R('THX'), 1, [[0, 0.165, 0.08], [0, 0.178, 0.045], [0, 0.185, 0.0], [0, 0.178, -0.04], [0, 0.167, -0.072]],
    [[0.03, 0.026], [0.055, 0.046], [0.062, 0.052], [0.056, 0.046], [0.036, 0.03]], [[TH, 0.6, HD, 0.4], [TH, 1], [TH, 1], [TH, 1], [TH, 0.6, AB, 0.4]],
    { n: 12, bump: (a, t) => Math.exp(-(a * a) / 0.05) * 0.22 + Math.max(0, Math.sin(t * Math.PI * 4)) * 0.05 * Math.cos(a * 0.5) + (Math.abs(a) > 2.4 ? -0.12 : 0) });
  // head: a heavy blunt capsule, jaws underneath
  sac(B, R('HEAD'), 2, [[0, 0.168, 0.07], [0, 0.178, 0.098], [0, 0.175, 0.128], [0, 0.162, 0.152]],
    [[0.032, 0.028], [0.044, 0.038], [0.038, 0.031], [0.016, 0.014]], [[TH, 0.4, HD, 0.6], [HD, 1], [HD, 1], [HD, 1]], { n: 10, bump: (a) => Math.exp(-(a * a) / 0.08) * 0.1 });
  // compound eyes, and a cluster of small wrong ones on the crown
  const eye = (c: V3, r: V3, bone: number, g: number) => {
    const rows = 4, n = 6, rings: { pts: V3[]; v: number; w: Wt }[] = [];
    for (let i = 1; i < rows; i++) {
      const a = -Math.PI / 2 + (Math.PI * i) / rows, y = Math.sin(a), k = Math.cos(a);
      const pts: V3[] = [];
      for (let j = 0; j <= n; j++) { const th = -Math.PI + (Math.PI * 2 * j) / n; pts.push([c[0] + Math.sin(th) * r[0] * k, c[1] + y * r[1], c[2] + Math.cos(th) * r[2] * k]); }
      rings.push({ pts, v: i / rows, w: [bone, 1] });
    }
    B.loft(rings, Array.from({ length: n + 1 }, (_, j) => j / n), R('EYE'), g, { start: [c[0], c[1] - r[1], c[2]], end: [c[0], c[1] + r[1], c[2]], startW: [bone, 1], endW: [bone, 1], startV: 0, endV: 1, emis: 0.35 });
  };
  for (const [, k] of SIDES) eye([k * 0.034, 0.188, 0.112], [0.017, 0.02, 0.022], HD, 3 + (k > 0 ? 0 : 1));
  for (let i = 0; i < 3 + x.variant; i++) eye([(hash(i, seed) - 0.5) * 0.04, 0.205 + hash(i, seed + 1) * 0.008, 0.09 + hash(i, seed + 2) * 0.04], [0.006, 0.006, 0.006], HD, 5);
  // mandibles: hooked, crossing
  for (const [s, k] of SIDES) chain(B, x, R('MAND'), 6, { bones: ['mand' + s], tip: [k * 0.004, 0.142, 0.195], r: [0.01, 0.0018], n: 5, rings: 4, bend: () => [k * 0.022, 0.004, 0] });
  // antennae: thin, beaded
  for (const [s, k] of SIDES) chain(B, x, R('LEG'), 7, { bones: ['ant' + s + '1', 'ant' + s + '2'], tip: [k * 0.075, 0.272, 0.245], r: [0.005, 0.0016], knuckle: 0.6, n: 4, rings: 3 });
  // abdomen: the soft ribbed egg sac, swollen with lumps
  sac(B, R('ABD'), 8, [[0, 0.17, -0.06], [0, 0.182, -0.1], [0, 0.184, -0.15], [0, 0.175, -0.2], [0, 0.158, -0.24], [0, 0.142, -0.266]],
    [[0.036, 0.031], [0.07, 0.064], [0.082, 0.074], [0.072, 0.064], [0.046, 0.04], [0.014, 0.014]],
    [[AB, 1], [AB, 1], [AB, 0.5, A2, 0.5], [A2, 1], [A2, 1], [A2, 1]],
    { n: 14, bump: (a, t) => Math.max(0, Math.sin(t * Math.PI * 11)) * 0.07 + Math.max(0, Math.sin(a * 3 + t * 9 + seed)) * 0.05 * Math.sin(t * Math.PI) });
  // six legs: coxa, a high knee, a long tibia to a hooked tip
  for (let i = 0; i < 3; i++) for (const [s, k] of SIDES) {
    const t0 = x.rest(`t${i}${s}`);
    chain(B, x, R('LEG'), 10 + i * 2 + (k > 0 ? 0 : 1), { bones: [`c${i}${s}`, `f${i}${s}`, `t${i}${s}`], tip: [t0[0] + k * 0.03, 0.004, t0[2] + (1 - i) * 0.02], r: (t) => 0.013 * (1 - t) + 0.0025 + Math.sin(t * Math.PI * 9) * 0.0012, knuckle: 0.45, n: 5, rings: 3 });
  }
  // the wrong ones: jointed limbs out of the abdomen, the crown, the underside
  EXTRA[x.variant % 3].forEach(([, , , d2, hand], j) => {
    const b0 = x.rest(`x${j}b`);
    const tip: V3 = [b0[0] + d2[0], b0[1] + d2[1], b0[2] + d2[2]];
    chain(B, x, R('XLEG'), 30 + j, { bones: [`x${j}a`, `x${j}b`], tip, r: (t) => (hand ? 0.013 : 0.011) * (1 - t * 0.75) + Math.max(0, Math.sin(t * Math.PI * 7)) * 0.002, knuckle: 0.6, n: 5, rings: 4 });
    // two of them end in something like a small, three-fingered hand
    if (hand) {
      const XB = x.bi(`x${j}b`);
      const dir = nrm3(d2);
      for (let f = -1; f <= 1; f++) {
        const side = nrm3([dir[2] + f * 0.6, 0.2, -dir[0] + f * 0.3]);
        const p1: V3 = [tip[0] + dir[0] * 0.022 + side[0] * f * 0.012, tip[1] + dir[1] * 0.022 + 0.004, tip[2] + dir[2] * 0.022 + side[2] * f * 0.012];
        const p2: V3 = [p1[0] + dir[0] * 0.016 + side[0] * f * 0.008, p1[1] + dir[1] * 0.018 - 0.006, p1[2] + dir[2] * 0.016 + side[2] * f * 0.008];
        sac(B, R('XLEG'), 40 + j * 3 + f, [tip, p1, p2], [[0.0045, 0.0045], [0.0032, 0.0032], [0.0012, 0.0012]], [[XB, 1], [XB, 1], [XB, 1]], { n: 4, start: false });
      }
    }
  });
  // spurs on the tibiae
  for (let i = 0; i < 3; i++) for (const [s, k] of SIDES) {
    const T = x.bi(`t${i}${s}`), t0 = x.rest(`t${i}${s}`);
    for (let q = 0; q < 2; q++) {
      const b: V3 = [t0[0] + k * 0.01 * (q + 1), t0[1] - 0.025 - q * 0.03, t0[2]];
      sac(B, R('LEG'), 60 + i * 4 + q, [b, [b[0] + k * 0.018, b[1] + 0.012, b[2] + 0.004]], [[0.0035, 0.0035], [0.0008, 0.0008]], [[T, 1], [T, 1]], { n: 4, start: false });
    }
  }
}
const PAL = [
  { shell: 0x2a2018, sheen: 0x5a7a48, belly: 0xa8786a, vein: 0x5a1a1a },
  { shell: 0x3a1810, sheen: 0xb85a28, belly: 0xb88a70, vein: 0x6a1a14 },
  { shell: 0x1c1c2a, sheen: 0x6a4a9a, belly: 0x9a8078, vein: 0x4a1a3a },
];
function paintM(p: Page, x: BuildCtx) {
  const c = PAL[x.variant % 3];
  const SH = makeRamp(c.shell, 7, { hueShift: 0.05, spread: 0.85 });
  // the sheen colour in the brightest steps: oil on a beetle
  SH[5] = mixHex(SH[5], c.sheen, 0.55); SH[6] = mixHex(SH[6], c.sheen, 0.35);
  paintChitin(p.R('THX'), SH, { seed: x.variant + 2, plates: 4 });
  paintChitin(p.R('HEAD'), SH, { seed: x.variant + 5, plates: 2, hi: 2.8 });
  paintChitin(p.R('LEG'), SH, { seed: x.variant + 7, plates: 7, hi: 1.6, spots: 0.1 });
  paintChitin(p.R('MAND'), makeRamp(0x6a3a1c, 6, { spread: 0.8 }), { seed: 3, plates: 3 });
  // the extra limbs: paler, newer, half-hardened
  paintChitin(p.R('XLEG'), makeRamp(mixHex(c.shell, c.belly, 0.45), 7, { spread: 0.75 }), { seed: 9, plates: 5, spots: 0.2 });
  // abdomen: soft, pale, veined, with dark spiracles down the sides
  const BE = makeRamp(c.belly, 7, { hueShift: -0.03, spread: 0.7 });
  const ab = p.R('ABD');
  paintSkin(ab, BE, { seed: 11 + x.variant, veins: 10, vein: c.vein, mottle: 1.4, glint: 14 });
  // split dorsal plates (tergites) across the top, soft flesh bulging between and below them
  for (let yy = 0; yy < ab.h; yy++) for (let xx = 0; xx < ab.w; xx++) {
    const a = Math.abs(ab.deg(xx));
    const band = (yy / ab.h) * 11, fr = band - Math.floor(band);
    if (a < 62 - Math.abs(Math.sin(band)) * 12 && fr > 0.18 && fr < 0.86) ab.put(xx, yy, SH, 2.2 + Math.cos((a * Math.PI) / 180) * 1.8 - fr * 1.2 + (a < 8 ? -1 : 0), 0.6);
    else if (fr <= 0.18 || fr >= 0.94) ab.blend(xx, yy, BE[0], 0.55);
  }
  // spiracles down the sides
  for (let i = 0; i < 9; i++) for (const side of [0.27, 0.73]) ab.ellipse(side * ab.w, (i + 0.6) * (ab.h / 10), 1.1, 1.3, 0x1a0806, 0.95);
  paintEye(p.R('EYE'), 0x6a1010, 0x1a0404, 0x3a0a0a);
  paintCap(p.R('CAP'), SH[2], c.belly, 0x3a2a10);
}
export const MULCHER_KIT: KitDef = { key: 'mulcher', variants: 3, W: 128, H: 128, bones: bonesM, layout: layoutM, build: buildM, paint: paintM, sphere: [0, 0.15, -0.04, 0.4] };

// ------------------------------------------------------------------ pose (shared by the live rig and the ball's baked frames)
interface Drive { t: number; ph: number; speed: number; seed: number; flee: boolean; curl: number; lay: number; atk: number; flinch: number; dead: boolean; lost?: Set<string> }
function poseMulcher(P: Record<string, THREE.Object3D>, d: Drive) {
  const R = (n: string, x: number, y = 0, z = 0) => { const o = P[n]; if (o) o.rotation.set(x, y, z); };
  const moving = d.speed > 0.05;
  const ph = d.ph * 2.6;
  const breath = Math.sin(d.t * 2.2 + d.seed * 9);
  // the egg sac heaves; it swings as it walks; it curls down to lay
  const ab = P.abd; if (ab) { ab.scale.set(1 + breath * 0.04, 1 + breath * 0.06, 1); }
  R('abd', 0.12 + d.lay * 0.55 + (moving ? Math.sin(ph * 0.5) * 0.05 : 0), moving ? Math.sin(ph * 0.5) * 0.18 : Math.sin(d.t * 0.8 + d.seed) * 0.12, 0);
  R('abd2', 0.1 + d.lay * 0.6, Math.sin(d.t * 1.6 + d.seed * 3) * 0.2, 0);
  R('thorax', -d.atk * 0.25 + (moving ? Math.sin(ph * 2) * 0.03 : 0), 0, moving ? Math.sin(ph) * 0.05 : 0);
  // the head scans in little snaps; the jaws work all the time
  const snap = Math.floor(d.t * 1.3 + d.seed * 5);
  R('head', -0.08 + d.atk * 0.5 + (hash(snap, 2) - 0.5) * 0.25, (hash(snap, 1) - 0.5) * 0.7 * (1 - d.atk), (hash(snap, 3) - 0.5) * 0.3);
  const chew = Math.sin(d.t * (d.atk > 0 ? 22 : 9)) * 0.28 + 0.25 + d.atk * 0.5;
  R('mandL', 0, -chew, 0); R('mandR', 0, chew, 0);
  for (const [s, k] of SIDES) {
    const w = Math.sin(d.t * 3.1 + k + d.seed * 4);
    R('ant' + s + '1', -0.2 + w * 0.3 - (d.flee ? 0.5 : 0), k * (0.2 + Math.sin(d.t * 2.3 + k) * 0.25), 0);
    R('ant' + s + '2', 0.3 + Math.sin(d.t * 4.7 + k * 2) * 0.35, 0, 0);
  }
  // tripod gait: L0 R1 L2 against R0 L1 R2; legs lift high, stab down
  for (let i = 0; i < 3; i++) for (const [s, k] of SIDES) {
    const grp = (i + (k > 0 ? 0 : 1)) & 1;
    const p = ph + grp * Math.PI + i * 0.25;
    const sw = moving ? Math.sin(p) : 0;
    const lift = moving ? Math.max(0, Math.cos(p)) : 0;
    let cy = -k * (sw * 0.45 + (i - 1) * -0.25), cz = k * (lift * 0.55 - 0.05);
    let fz = -k * (lift * 0.4), tz = k * lift * 0.3;
    // idle: legs shift their grip one at a time
    if (!moving) { const tw = Math.max(0, Math.sin(d.t * 1.7 + i * 2.1 + k * 1.3 + d.seed * 8)); cz += k * Math.pow(tw, 8) * 0.4; }
    if (d.curl > 0) { // dead / balled: legs fold in over the belly
      cy = cy * (1 - d.curl); cz = cz * (1 - d.curl) - k * d.curl * 0.9; fz = fz * (1 - d.curl) - k * d.curl * 1.3; tz = tz * (1 - d.curl) - k * d.curl * 1.1;
    }
    if (d.dead) { const tw = Math.sin(d.t * 14 + i * 3 + k) * Math.max(0, 1 - d.t * 0.05) * 0.15; fz += tw; }
    R(`c${i}${s}`, 0, cy, cz); R(`f${i}${s}`, 0, 0, fz); R(`t${i}${s}`, 0, 0, tz);
  }
  // the wrong limbs writhe: slow searching sweeps with sudden twitches
  for (let j = 0; j < 6; j++) {
    const tw = Math.floor(d.t * (2 + j * 0.7) + d.seed * 11);
    const jerk = hash(tw, j) < 0.25 ? (hash(tw, j + 9) - 0.5) * 1.2 : 0;
    R(`x${j}a`, Math.sin(d.t * (1.3 + j * 0.4) + j + d.seed * 6) * 0.5 + jerk - d.curl * 0.6, Math.cos(d.t * (0.9 + j * 0.3) + j * 2) * 0.5, Math.sin(d.t * 2.1 + j * 1.7) * 0.4);
    R(`x${j}b`, Math.sin(d.t * (2.7 + j) + j * 3) * 0.6 + jerk * 0.5 - d.curl * 0.8, 0, Math.cos(d.t * 1.9 + j) * 0.35);
  }
  if (d.lost) for (const n of d.lost) { const o = P[n]; if (o && /^c\d/.test(n)) o.rotation.z += 0.6; }
}

// ------------------------------------------------------------------ the single insect
function buildMulcher(): Rig { return buildKitRig(MULCHER_KIT, 0, 0.2); }
function animateMulcher(rig: Rig, c: Creature, t: number, dt: number) {
  const K = rig as KitRig;
  const v = Math.floor(hashId(c.id) * 3);
  if (K.kit.who !== c.id) { K.kit.who = c.id; kitPersonalize(K, v); }
  kitSync(K);
  const n = netOf(c), ud = rig.root.userData as Record<string, number>;
  const seed = hashId(c.id, 2);
  const ac = attackCurve(rig, c, t);
  ud.lay = (ud.lay ?? 0) + ((n.lay ? 1 : 0) - (ud.lay ?? 0)) * Math.min(1, dt * 3);
  ud.curl = (ud.curl ?? 0) + ((c.dead ? 1 : 0) - (ud.curl ?? 0)) * Math.min(1, dt * 4);
  poseMulcher(rig.parts, { t, ph: c.phase, speed: c.speed, seed, flee: c.state === 'flee', curl: ud.curl, lay: ud.lay, atk: Math.max(ac.wind, ac.strike), flinch: flinchOf(c), dead: c.dead, lost: lostParts(c) });
  // a scuttle has a body bounce in it; it hunkers when it bites
  const bob = c.speed > 0.05 ? Math.abs(Math.sin(c.phase * 2.6)) * 0.012 : 0;
  offset(rig, 'thorax', 0, bob - ac.wind * 0.03 - (ud.lay ?? 0) * 0.04, ac.strike * 0.06);
  // flipped over when dead, legs in the air
  if (c.dead) rig.body.rotation.x = Math.PI * Math.min(1, (ud.deadT = (ud.deadT ?? 0) + dt) * 3) * 0;
  const fl = flinchOf(c);
  rig.body.position.x = fl > 0 ? Math.sin(t * 90) * 0.02 * fl : 0;
  const F = K.kit.F.fx.value; F.y += dt; F.z = Math.min(1, c.hitFlash / 0.15) * 0.4;
  const p = localIn(c);
  if (p && !c.dead && dist(p, c) < 3.5 && c.visibleToLocal) thinkOnce(p, 'mulcher', ['How many legs is that? It keeps changing.', 'It is chewing. It is always chewing.', 'Something with too many legs went under that chair.'][Math.floor(t) % 3], 90);
}

// ------------------------------------------------------------------ host brains
const SEAT = /(chair|stool|bench|sofa|armchair|couch|loveseat|recliner|bed|mattress|futon|ottoman|pouf)/;
function clutchesIn(zk: string) { let n = 0; for (const o of CS().creatures.values()) if (o.zoneKey === zk && !o.dead && o.sp.key === 'mulcher_clutch') n++; return n; }
function countIn(zk: string, key: string) { let n = 0; for (const o of CS().creatures.values()) if (o.zoneKey === zk && !o.dead && o.sp.key === key) n++; return n; }
function taken(z: any): Set<string> { return (z.meta.__mulchHosts ??= new Set<string>()) as Set<string>; }

interface LaySite { x: number; z: number; py: number; host: string; f: number; obj?: number }
/** somewhere still and soft to lay in: a Still Life, or upholstered furniture nobody is near */
function laySite(c: Creature): LaySite | null {
  const z = zoneOf(c), used = taken(z);
  let best: LaySite | null = null, bd = 16;
  for (const o of CS().creatures.values()) {
    if (o.zoneKey !== c.zoneKey || o.dead || o.sp.key !== 'still_life' || used.has('c' + o.id)) continue;
    const d = dist(o, c);
    if (d < bd) { bd = d; best = { x: o.x, z: o.z, py: 0, host: 'c' + o.id, f: o.facing }; }
  }
  if (best) return best;
  for (const o of objectsNear(z, c.x, c.z, 10, (oo, d) => SEAT.test(oo.key) || (d.tags || []).includes('seat'), 30)) {
    if (used.has('o' + o.uid)) continue;
    const d = objDef(o.key); if (!d) continue;
    const m = objectMatrix(z, o, d).elements;
    const dd = Math.hypot(m[12] - c.x, m[14] - c.z);
    if (dd < bd) { bd = dd; best = { x: m[12], z: m[14], py: Math.min(0.9, Math.max(0.3, (d.surface ?? 0.45) - 0.04)), host: 'o' + o.uid, f: Math.atan2(m[10], m[8]), obj: o.uid }; }
  }
  return best;
}
function layClutch(c: Creature, s: LaySite) {
  const z = zoneOf(c);
  const k = CS().spawn('mulcher_clutch', c.zoneKey, s.x, s.z);
  if (!k) return;
  taken(z).add(s.host);
  k.mem.host = s.host; k.mem.hatchAt = G.time + rng.float(140, 260); k.mem.persistent = true;
  k.facing = k.targetFacing = s.f;
  const n = net(k); n.py = s.py;
  playAt('plenum_skitter', c, 0.4, 8, 0.7);
}

/** a ball forms: these members lock together and roll at the warm thing */
function formBall(members: Creature[], target: Player) {
  const cs = CS();
  let x = 0, zz = 0, hp = 0;
  for (const m of members) { x += m.x; zz += m.z; hp += Math.max(4, m.hp); }
  x /= members.length; zz /= members.length;
  const b = cs.spawn('mulcher_ball', members[0].zoneKey, x, zz);
  if (!b) return;
  b.hp = hp * 1.4; b.mem.n = members.length; b.mem.persistent = true; b.targetId = target.id;
  b.facing = b.targetFacing = Math.atan2(target.z - zz, target.x - x);
  net(b).n = members.length;
  for (const m of members) cs.remove(m);
  playAt('plenum_shriek', b, 0.8, 18, 0.7);
}

function thinkMulcher(c: Creature, dt: number): boolean {
  const cs = CS(), z = zoneOf(c), m = c.mem, n = net(c);
  const ev = pulse(c);
  if (m.init === undefined) { m.init = 1; m.gravid = rng.chance(0.65); m.layAt = G.time + rng.float(15, 45); }
  const near = playersIn(c.zoneKey).reduce<{ p: Player; d: number } | null>((b, p) => { const d = dist(p, c); return !b || d < b.d ? { p, d } : b; }, null);
  // gather: three or more that meet near a warm body become a ball
  if (near && near.d < 11 && G.time > (m.noBall ?? 0) && c.state !== 'flee') {
    const mates: Creature[] = [c];
    for (const o of cs.creatures.values()) if (o !== c && !o.dead && o.zoneKey === c.zoneKey && o.sp.key === 'mulcher' && G.time > (o.mem.noBall ?? 0) && dist(o, c) < 3.2) mates.push(o);
    if (mates.length >= 3) { formBall(mates.slice(0, 9), near.p); return true; }
    // call the others in: they converge on whoever is nearest the warm body
    for (const o of cs.creatures.values()) if (o !== c && !o.dead && o.zoneKey === c.zoneKey && o.sp.key === 'mulcher' && dist(o, c) < 9 && o.state !== 'flee') o.mem.gather = { x: c.x, z: c.z, t: G.time };
  }
  if (ev.hurt > 0) { c.setState('flee'); c.goal = cs.fleeSpot(c, z, near?.p.x ?? c.x, near?.p.z ?? c.z); m.noBall = G.time + 4; }
  // bite if something warm is right on top of it and it cannot get away
  if (near && near.d < c.sp.attack!.range + near.p.radius && c.attackT <= 0 && (c.state === 'flee' || c.stateT > 2)) { attack(c, near.p); return true; }
  switch (c.state) {
    case 'flee': {
      if (!c.goal || cs.moveTo(c, z, c.goal.x, c.goal.z, c.sp.run, dt, 0.6) || c.stateT > 5) { c.setState('wander'); c.goal = null; }
      return true;
    }
    case 'nest': {
      // laying: curled over the host, abdomen pumping
      stop(c); n.lay = 1;
      const s = m.site as LaySite | undefined;
      if (s) faceTo(c, s.x, s.z);
      if (c.stateT > 4) { if (s && clutchesIn(c.zoneKey) < 6) layClutch(c, s); m.gravid = false; m.layAt = G.time + rng.float(120, 220); n.lay = 0; c.setState('wander'); }
      if (near && near.d < 2.2) { n.lay = 0; c.setState('flee'); c.goal = cs.fleeSpot(c, z, near.p.x, near.p.z); }
      return true;
    }
    case 'travel': {
      const s = m.site as LaySite | undefined;
      if (!s || c.stateT > 25) { c.setState('wander'); return true; }
      if (cs.moveTo(c, z, s.x, s.z, c.sp.walk * 1.3, dt, s.host.startsWith('c') ? 0.55 : 0.9)) c.setState('nest');
      return true;
    }
    default: {
      // shy of people and of light
      if (near && near.d < 3.2) { c.setState('flee'); c.goal = cs.fleeSpot(c, z, near.p.x, near.p.z); playAt('ventling_chitter', c, 0.5, 9, 1.4); return true; }
      if (m.gravid && G.time > (m.layAt ?? 0) && (!near || near.d > 7)) {
        const s = laySite(c);
        m.layAt = G.time + 8;
        if (s) { m.site = s; c.setState('travel'); return true; }
      }
      const g = m.gather as { x: number; z: number; t: number } | undefined;
      if (g && G.time - g.t < 4) { cs.moveTo(c, z, g.x, g.z, c.sp.run, dt, 0.8); return true; }
      c.setState('wander');
      if (!c.goal || cs.moveTo(c, z, c.goal.x, c.goal.z, c.sp.walk, dt, 0.5) || c.stateT > 12) {
        c.goal = findSpot(c, { rMin: 2, rMax: 9, dark: 0.45 }) ?? cs.wanderSpot(c, z, 8);
        c.stateT = 0;
        if (rng.chance(0.3)) playAt('plenum_skitter', c, 0.25, 7, 1.5);
      }
      return true;
    }
  }
}

const MULCHER = def({
  key: 'mulcher', name: 'Mulcher', code: 'IN-31 // SWARM ISOPTERAN', temperament: 'skittish', threat: 1,
  rule: { name: 'THREE MAKE A BALL', text: 'One alone runs from you. Three that meet near you lock together and roll at you. Kill them while they are apart, and burn the clutches they lay in still furniture.', tell: 'Something with far too many legs ran under the sofa.' },
  hp: 9, walk: 1.1, run: 3.6, turn: 14, radius: 0.16, height: 0.24, sight: 9, fov: 1.8, hearing: 1.2, light: 'repelled',
  attack: { dmg: [2, 5], range: 0.45, cooldown: 1.3, kinds: ['bite', 'laceration'], corrupt: 0, knock: 0.1, parts: ['foot_l', 'foot_r', 'shin_l', 'shin_r'] },
  zones: ['house', 'suburbs', 'lobby', 'office', 'hospital', 'mall'], weight: 1.1, maxPerZone: 10, group: [2, 4], diet: 'none',
  sounds: { alert: 'ventling_chitter', hurt: 'ventling_squeal', death: 'plenum_die', attack: 'plenum_skitter' },
  scan: {
    cls: 'Swarm insect / egg-layer',
    notes: [
      'Cat-sized, glossy, far too many legs: some grow out of the abdomen and the crown, like spares.',
      'Alone it skitters from shadow to shadow and runs from you and from light.',
      'Three or more that meet near a warm body lock together into a rolling ball.',
      'Gravid ones lay egg clutches in upholstery and on Still Lifes. The eggs hatch if left alone.',
    ],
  },
  gore: { blood: 'dark', tint: 0x6a7a3a, flesh: 0xc8b07a, sever: ['c0L', 'c0R', 'c1L', 'c1R', 'c2L', 'c2R', 'x0a', 'x1a', 'x2a', 'x3a', 'abd'], head: 'head' },
  build: buildMulcher, animate: animateMulcher, think: thinkMulcher,
});
(MULCHER as any).handlesSevered = true;
MULCHER.animateGallery = (rig: Rig, t: number) => {
  const q = new URLSearchParams(location.search).get('pose') || 'walk';
  const fc = fakeCreature(MULCHER, { id: 'mg' + (Number(q.match(/\d/)?.[0] ?? 0)), speed: q.startsWith('walk') ? 1 : 0, phase: t * 6, state: 'wander', mem: { netMem: { lay: q.startsWith('lay') ? 1 : 0 } }, dead: q.startsWith('dead') });
  animateMulcher(rig, fc, t, 1 / 60);
};
horrify(MULCHER, { twitch: 0.9, snap: 0.4 });

// =====================================================================================
// THE BALL — an instanced flip-book: a few baked poses of the mulcher rig,
// each insect swapping between them out of step so the whole mass writhes.
// =====================================================================================
const FRAMES = 4;
let FRAME_GEO: THREE.BufferGeometry[][] | null = null;
/** bake a posed copy of a variant's skinned geometry (static, positions only) */
function bakePose(v: number, drive: Drive): THREE.BufferGeometry {
  const rig = buildKitRig(MULCHER_KIT, v, 0.2);
  poseMulcher(rig.parts, drive);
  rig.root.updateMatrixWorld(true);
  const mesh = rig.kit.mesh, src = mesh.geometry;
  const pos = src.getAttribute('position'), out = new Float32Array(pos.count * 3), tmp = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) { tmp.fromBufferAttribute(pos, i); mesh.applyBoneTransform(i, tmp); out[i * 3] = tmp.x; out[i * 3 + 1] = tmp.y - 0.16; out[i * 3 + 2] = tmp.z + 0.05; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(out, 3));
  for (const k of ['normal', 'uv', 'color', 'aAtlas', 'aFx']) { const a = src.getAttribute(k); if (a) g.setAttribute(k, a); }
  g.setIndex(src.getIndex());
  g.computeBoundingSphere();
  return g;
}
function frameGeo(): THREE.BufferGeometry[][] {
  if (FRAME_GEO) return FRAME_GEO;
  FRAME_GEO = [0, 1, 2].map((v) => Array.from({ length: FRAMES }, (_, f) => bakePose(v, { t: f * 0.37 + v, ph: (f / FRAMES) * Math.PI * 2 / 2.6, speed: 1, seed: v * 0.3 + f * 0.1, flee: f % 2 === 0, curl: 0.25 + (f % 2) * 0.15, lay: 0, atk: f === 3 ? 0.6 : 0, flinch: 0, dead: false })));
  return FRAME_GEO;
}
const BALL_N = 34;
interface BallRig extends Rig { meshes: THREE.InstancedMesh[]; spin: THREE.Group; q: THREE.Quaternion; seeds: Float32Array }
function buildBall(): Rig {
  const root = new THREE.Group(), body = new THREE.Group(), spin = new THREE.Group();
  root.add(body); body.add(spin);
  const meshes: THREE.InstancedMesh[] = [];
  const geos = frameGeo();
  for (let v = 0; v < 3; v++) for (let f = 0; f < FRAMES; f++) {
    const e = kitEntry(MULCHER_KIT, v);
    const im = new THREE.InstancedMesh(geos[v][f], e.gibMat, BALL_N);
    im.count = 0; im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
    spin.add(im); meshes.push(im);
  }
  const seeds = new Float32Array(BALL_N * 4);
  for (let i = 0; i < seeds.length; i++) seeds[i] = hash(i, 77);
  return { root, body, parts: { spin }, headY: 0.6, meshes, spin, q: new THREE.Quaternion(), seeds } as BallRig;
}
const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0), _n = new THREE.Vector3(), _ax = new THREE.Vector3();
function animateBall(rig: Rig, c: Creature, t: number, dt: number) {
  const R = rig as BallRig, n = netOf(c), ud = rig.root.userData as Record<string, number>;
  const members = Math.max(3, Number(n.n ?? c.mem.n ?? 5));
  const count = Math.min(BALL_N, 10 + members * 3);
  const rad = 0.24 + members * 0.035;
  // roll: about the axis across the direction of travel (rig space: travel is +z)
  ud.roll = (ud.roll ?? 0) + (c.speed * dt) / rad;
  R.spin.position.y = rad * (c.dead ? 0.45 : 0.92);
  _ax.set(1, 0, 0);
  R.spin.quaternion.setFromAxisAngle(_ax, ud.roll);
  // it squashes as it rolls over its own legs, and bulges when it lunges
  const ac = attackCurve(rig, c, t);
  const sq = 1 + Math.sin(ud.roll * 3) * 0.04 + ac.strike * 0.15;
  rig.body.scale.set(sq, 1 / sq, sq);
  for (const im of R.meshes) im.count = 0;
  const S = R.seeds;
  for (let i = 0; i < count; i++) {
    // fibonacci shell, each insect wobbling on its spot, two layers
    const inner = i % 4 === 3;
    const k = (i + 0.5) / count, phi = Math.acos(1 - 2 * k), th = Math.PI * (1 + Math.sqrt(5)) * i;
    const wob = Math.sin(t * (3 + S[i * 4] * 4) + S[i * 4 + 1] * 9) * 0.06;
    const rr = rad * (inner ? 0.55 : 0.88 + wob) * (c.dead ? 1 + Math.min(1, ud.dt ?? 0) * 0.6 : 1);
    _n.set(Math.sin(phi) * Math.cos(th + wob), Math.cos(phi), Math.sin(phi) * Math.sin(th + wob));
    _p.copy(_n).multiplyScalar(rr);
    // belly to the core, back out, turned a random way round the normal (and crawling round it)
    _q.setFromUnitVectors(_up, _n);
    _q2.setFromAxisAngle(_up, S[i * 4 + 2] * Math.PI * 2 + t * (S[i * 4 + 3] - 0.5) * 2);
    _q.multiply(_q2);
    const sc = (inner ? 1.0 : 1.15) * (0.85 + S[i * 4 + 1] * 0.3);
    _s.set(sc, sc, sc);
    _m.compose(_p, _q, _s);
    const v = i % 3, f = Math.floor(t * (5 + S[i * 4] * 5) + S[i * 4 + 3] * 7) % FRAMES;
    const im = R.meshes[v * FRAMES + f];
    im.setMatrixAt(im.count++, _m);
  }
  for (const im of R.meshes) im.instanceMatrix.needsUpdate = true;
  if (c.dead) ud.dt = (ud.dt ?? 0) + dt;
  const p = localIn(c);
  if (p && !c.dead && dist(p, c) < 9 && c.visibleToLocal) {
    p.body.stress = Math.min(100, p.body.stress + dt * 3);
    thinkOnce(p, 'mulcher_ball', ['That is not one thing. That is dozens of them, holding on.', 'It is ROLLING at me.', 'Legs. A ball of legs.'][Math.floor(t) % 3], 60);
  }
}
function burst(c: Creature, keep = 1) {
  const cs = CS();
  const nn = Math.max(2, Math.round((c.mem.n ?? 5) * keep));
  for (let i = 0; i < nn; i++) {
    const a = (i / nn) * Math.PI * 2;
    const m = cs.spawn('mulcher', c.zoneKey, c.x + Math.cos(a) * 0.5, c.z + Math.sin(a) * 0.5);
    if (!m) continue;
    m.mem.noBall = G.time + 7 + rng.float(0, 4); m.mem.init = 1; m.mem.gravid = false; m.mem.layAt = G.time + 60;
    m.setState('flee'); m.goal = cs.fleeSpot(m, zoneOf(m), c.x, c.z);
  }
  playAt('ventling_squeal', c, 0.9, 16, 0.8);
  cs.remove(c);
}
function thinkBall(c: Creature, dt: number): boolean {
  const cs = CS(), z = zoneOf(c), m = c.mem;
  const ev = pulse(c);
  // a hard blow breaks the grip: it bursts back into panicking singles
  if (ev.hurt >= 14 || c.hp < c.sp.hp * 0.35) { burst(c, ev.hurt >= 14 ? 1 : 0.6); return true; }
  const tgt = c.targetId ? (G.players.get(c.targetId) as Player | undefined) : undefined;
  let p = tgt && !tgt.body.dead && tgt.zoneKey === c.zoneKey ? tgt : null;
  if (!p) { const ps = playersIn(c.zoneKey); let bd = 18; for (const q of ps) { const d = dist(q, c); if (d < bd) { bd = d; p = q; } } }
  if (!p || dist(p, c) > 20) { m.lostT = (m.lostT ?? 0) + dt; stop(c); if (m.lostT > 8) burst(c); return true; }
  m.lostT = 0; c.targetId = p.id;
  const d = dist(p, c);
  c.setState('chase');
  if (d <= c.sp.attack!.range + p.radius && c.attackT <= 0) { attack(c, p); return true; }
  cs.moveTo(c, z, p.x, p.z, c.sp.run * (d < 4 ? 1.1 : 1), dt, 0.3);
  if (c.noiseCooldown <= 0) { playAt('occupant_drag', c, 0.35, 12, 2.2); c.noiseCooldown = 1.6; }
  return true;
}
const BALL = def({
  key: 'mulcher_ball', name: 'Mulcher Ball', code: 'IN-31b // SWARM, FUSED', temperament: 'hostile', threat: 3,
  rule: { name: 'HIT IT HARD', text: 'A heavy blow breaks the grip and it bursts back into single insects. Kill the singles before they meet again.' },
  hp: 80, walk: 2.4, run: 3.9, turn: 4, radius: 0.42, height: 0.8, sight: 14, fov: 3.1, hearing: 1.4, vibration: true,
  attack: { dmg: [7, 13], range: 0.75, cooldown: 1.1, kinds: ['bite', 'laceration'], corrupt: 0, knock: 0.6, parts: ['shin_l', 'shin_r', 'thigh_l', 'thigh_r', 'foot_l', 'foot_r', 'groin'] },
  zones: [], weight: 0, maxPerZone: 3, diet: 'meat',
  flags: { noCorpse: true },
  sounds: { attack: 'plenum_shriek', hurt: 'ventling_squeal', death: 'plenum_die' },
  scan: { cls: 'Swarm / fused ball', notes: ['A rolling knot of Mulchers, legs locked into each other\'s joints.', 'It rolls at the nearest warm body and every member bites at once.', 'A heavy blow breaks the grip. Then kill the singles before they find each other.'] },
  gore: { blood: 'dark', tint: 0x6a7a3a, flesh: 0xc8b07a, gib: false },
  remains: 'none',
  build: buildBall, animate: animateBall, think: thinkBall,
});
onKilled('mulcher_ball', (c) => {
  // killed outright: half of it is dead insects, the rest scatter
  const cs = CS();
  const nn = Math.max(2, Math.round((c.mem.n ?? 5) / 2));
  for (let i = 0; i < nn; i++) {
    const m = cs.spawn('mulcher', c.zoneKey, c.x + rng.float(-0.5, 0.5), c.z + rng.float(-0.5, 0.5));
    if (m) cs.kill(m, zoneOf(m));
  }
  burst(c, 0.3);
});
BALL.animateGallery = (rig: Rig, t: number) => { animateBall(rig, fakeCreature(BALL, { id: 'bg', speed: 1.5, mem: { netMem: { n: 6 } } }), t, 1 / 60); };

// =====================================================================================
// THE CLUTCH — amber eggs glued into a cushion or onto a Still Life
// =====================================================================================
const EGG_N = 13;
const EGGS: V3[] = Array.from({ length: EGG_N }, (_, i) => {
  const a = i * 2.39996, r = Math.sqrt(i / EGG_N) * 0.1;
  return [Math.cos(a) * r, 0.04 + (1 - r / 0.1) * 0.035 + hash(i, 4) * 0.01, Math.sin(a) * r * 0.85];
});
function bonesK(): BoneSpec[] {
  const b: BoneSpec[] = [{ name: 'base', parent: '', at: [0, 0, 0] }];
  EGGS.forEach((e, i) => b.push({ name: 'egg' + i, parent: 'base', at: e }));
  return b;
}
function layoutK(p: Page) { p.reg('GLUE', 32, 16); p.reg('EGG', 16, 16); p.reg('EGG2', 16, 16); p.reg('CAP', 8, 8); }
function buildK(B: SkinB, x: BuildCtx) {
  const R = x.R, BA = x.bi('base');
  // a glistening pad of cement, rumpled
  sac(B, R('GLUE'), 1, [[0, 0.004, -0.13], [0, 0.018, -0.07], [0, 0.026, 0], [0, 0.018, 0.07], [0, 0.004, 0.12]], [[0.03, 0.008], [0.11, 0.022], [0.13, 0.03], [0.11, 0.022], [0.03, 0.008]],
    [[BA, 1], [BA, 1], [BA, 1], [BA, 1], [BA, 1]], { n: 12, bump: (a, t) => Math.sin(a * 5 + t * 7) * 0.12 });
  // the eggs: soft capsules, pointed at the top, each its own bone (they pulse)
  EGGS.forEach((e, i) => {
    const s = 0.8 + hash(i, 9) * 0.45, bone = x.bi('egg' + i);
    const h = 0.034 * s, r = 0.026 * s, lean = (hash(i, 3) - 0.5) * 0.3;
    const prof: [number, number][] = [[-0.85, 0.55], [-0.45, 0.92], [0.05, 1.0], [0.5, 0.86], [0.85, 0.5], [1.0, 0.12]];
    const pts: V3[] = prof.map(([yy]) => [e[0] + lean * yy * h, e[1] + yy * h, e[2]]);
    sac(B, R(i % 3 === 0 ? 'EGG2' : 'EGG'), 2 + i, pts, prof.map(([, rr]) => [r * rr, r * rr] as [number, number]), prof.map(() => [bone, 1] as Wt), { n: 8, up: [0, 0, 1] });
  });
}
function paintK(p: Page) {
  const GL = makeRamp(0x8a7040, 6, { spread: 0.8 });
  paintSkin(p.R('GLUE'), GL, { seed: 4, veins: 3, vein: 0x5a3a20, glint: 16 });
  // translucent amber with the folded nymph showing through as a dark comma
  const AM = makeRamp(0xd8902a, 7, { hueShift: 0.04, spread: 0.85 });
  for (const [name, dark] of [['EGG', 0x4a2408], ['EGG2', 0x2a1a10]] as const) {
    const r = p.R(name);
    r.fill(AM, (xx, yy) => 3.4 + Math.cos((r.deg(xx) * Math.PI) / 180) * 1.6 - (yy / r.h) * 0.8 + (r.fbm(xx, yy, 2, 2, 3) - 0.5));
    r.ellipse(r.w * 0.5, r.h * 0.55, r.w * 0.16, r.h * 0.28, dark, 0.55);
    r.ellipse(r.w * 0.56, r.h * 0.35, r.w * 0.08, r.h * 0.08, dark, 0.6);
    r.blend(Math.floor(r.w * 0.42), Math.floor(r.h * 0.2), 0xfff0c0, 0.9);
  }
  paintCap(p.R('CAP'), GL[2], 0xd8902a, 0x4a2408);
}
const CLUTCH_KIT: KitDef = { key: 'mulcher_clutch', variants: 1, W: 64, H: 64, bones: bonesK, layout: layoutK, build: buildK, paint: paintK, sphere: [0, 0.05, 0, 0.25] };
interface ClutchRig extends KitRig { lift: THREE.Group }
function buildClutch(): Rig {
  const r = buildKitRig(CLUTCH_KIT, 0, 0.15) as ClutchRig;
  return r;
}
function animateClutch(rig: Rig, c: Creature, t: number, dt: number) {
  const K = rig as KitRig;
  kitSync(K);
  const n = netOf(c), ud = rig.root.userData as Record<string, number>;
  const py = typeof n.py === 'number' ? n.py : 0;
  ud.py = (ud.py ?? py) + (py - (ud.py ?? py)) * Math.min(1, dt * 6);
  rig.body.position.y = ud.py;
  // the eggs swell and settle out of step; near hatching they twitch
  const ripe = Number(n.r ?? 0);
  for (let i = 0; i < EGG_N; i++) {
    const e = rig.parts['egg' + i]; if (!e) continue;
    const s = 1 + Math.sin(t * (1.2 + hash(i, 2)) + i * 1.7) * 0.06 + (ripe && hash(Math.floor(t * 6), i) < 0.08 ? 0.12 : 0);
    e.scale.set(s, s * (1 + ripe * 0.1), s);
    e.rotation.z = ripe ? Math.sin(t * 13 + i) * 0.1 : 0;
  }
  if (c.dead) rig.body.scale.y = Math.max(0.2, 1 - (c.deathT ?? 0));
  const F = K.kit.F.fx.value; F.y += dt; F.z = Math.min(1, c.hitFlash / 0.15) * 0.5;
}
function thinkClutch(c: Creature, dt: number): boolean {
  const cs = CS(), z = zoneOf(c), m = c.mem, n = net(c);
  stop(c);
  m.chk = (m.chk ?? 0) - dt;
  if (m.chk <= 0) {
    m.chk = 0.25;
    const h = String(m.host ?? '');
    // riding a Still Life: on its lap when it sits, on its shoulder when it stands
    if (h.startsWith('c')) {
      const host = cs.creatures.get(h.slice(1));
      if (!host || host.dead || host.zoneKey !== c.zoneKey) { m.host = ''; n.py = 0; }
      else {
        const hn = netOf(host), ps = String(hn.ps ?? 'sit');
        const sit = ps === 'sit' || ps === 'sit_table';
        const fx = Math.cos(host.facing), fz = Math.sin(host.facing);
        const side = sit ? 0 : 0.17;
        c.x = host.x + fx * (sit ? 0.18 : 0.02) - fz * side; c.z = host.z + fz * (sit ? 0.18 : 0.02) + fx * side;
        c.facing = c.targetFacing = host.facing;
        n.py = (sit ? 0.5 : ps === 'lie' ? 0.62 : 1.38) + (typeof hn.py === 'number' ? hn.py : 0);
      }
    } else if (h.startsWith('o')) {
      // the furniture went (carried off, smashed): the clutch falls to the floor
      if (!z.objects.get(Number(h.slice(1)))) { m.host = ''; n.py = 0; }
    }
  }
  // someone scooped it out
  if (poked(c, 'harvest')) { if (m.host) taken(z).delete(String(m.host)); cs.remove(c); return true; }
  const left = (m.hatchAt ?? G.time + 200) - G.time;
  n.r = left < 25 ? 1 : 0;
  if (left <= 0) {
    const nn = rng.int(2, 4);
    for (let i = 0; i < nn && countIn(c.zoneKey, 'mulcher') < 12; i++) {
      const a = rng.float(0, Math.PI * 2);
      const k = cs.spawn('mulcher', c.zoneKey, c.x + Math.cos(a) * 0.4, c.z + Math.sin(a) * 0.4);
      if (k) { k.mem.init = 1; k.mem.gravid = rng.chance(0.4); k.mem.layAt = G.time + rng.float(90, 180); k.mem.noBall = G.time + 20; }
    }
    playAt('ventling_chitter', c, 0.8, 12, 0.6);
    if (m.host) taken(z).delete(String(m.host));
    cs.remove(c);
  }
  return true;
}
const CLUTCH = def({
  key: 'mulcher_clutch', name: 'Mulcher Clutch', code: 'IN-31c // EGG MASS', temperament: 'peaceful', threat: 0,
  hp: 10, walk: 0, run: 0, turn: 0, radius: 0.12, height: 0.12, sight: 0, fov: 0, hearing: 0,
  zones: [], weight: 0, maxPerZone: 6, diet: 'none',
  flags: { noCorpse: true, attached: true },
  sounds: { hurt: 'bubble_pop', death: 'bubble_pop' },
  scan: { cls: 'Egg mass', notes: ['Amber eggs glued into a cushion, each with a folded nymph curled inside.', 'Left undisturbed, it hatches three or four new Mulchers.', 'Scoop it out or smash it.'] },
  gore: { blood: 'glow', tint: 0xd8902a, flesh: 0xd8902a, gib: false },
  remains: 'none',
  build: buildClutch, animate: animateClutch, think: thinkClutch,
});
creatureMenu('mulcher_clutch', (p, c, opts) => {
  opts.push({
    label: 'Harvest the clutch', action: () => queueAt(p, c.x, c.z, new UseObjectAction(p, 'Harvest', 2.4, 'loot', () => {
      if (!CS().creatures.has(c.id) || c.dead) return;
      const it = createItem('mulcher_roe');
      p.inv.add(it);
      bus.emit('inventoryChanged', p);
      poke(p, c, 'harvest');
      bus.emit('think', p, ['Warm. They move against my fingers.', 'Every one of them has something curled up inside.', 'It peels away from the fabric like wet glue.'][Math.floor(Math.random() * 3)]);
      G.audio?.ui?.('bubble_pop', 0.5);
    }), 1.3, false),
  });
});
CLUTCH.animateGallery = (rig: Rig, t: number) => { animateClutch(rig, fakeCreature(CLUTCH, { id: 'kg', mem: { netMem: { r: 1 } } }), t, 1 / 60); };

void live; void lightAt; void isHost;
