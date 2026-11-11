import * as THREE from 'three';
import { def, Rig } from '../species';
import { makeRamp, mixHex } from '../../gfx/pixel';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import { ModelBuilder } from '../../gfx/modelBuilder';
import { worldMaterial } from '../../gfx/materials';
import { Rng } from '../../core/rng';
import type { Creature } from '../creature';
import type { Player } from '../../entities/player';
import type { Zone } from '../../world/zone';
import { CS, zoneOf, pulse, attack, onKilled, wallSpotsNear } from '../behaviors_a';
import { net, netOf, playAt, hashId, rng, localIn, thinkOnce, dist, playersIn, fx, fxPoll, walkable, lineOfSightB, live } from '../behaviors_b';
import { KitDef, KitRig, SkinB, BuildCtx, Page, V3, Wt, buildKitRig, kitSync, kitPersonalize, attackCurve, flinchOf, hash } from '../kit/humanoids';
import { chain, sac, paintCap } from '../kit/organic';
import { uprightDead } from '../kit/gel';
import { tube, type V3 as AV3 } from '../kit/anomalies';
import { mkBones, skBlob, gyri, pin, paintMycelium, paintGills, paintCapTop, sporeCloud, addMount, setMount } from '../kit/fungal';
import { ruleShown } from '../rules';
import '../../audio/sounds_creatures_c';

// =====================================================================================
// THE FUNGUS MIND — a fungal brain the size of a small car, rooted in the floor
// of a damp room: black, glistening, folded like a cortex, throbbing. It is
// the fruiting heart of a mycelial network that it pushes out through the
// floors and up the walls of the rooms around it, a few metres a day: pale
// cords as thick as a thumb, mats of white felt, and at every junction a
// node, a cluster of fruiting bodies around a puffball sac. The nodes feel the
// floor. When a unit walks over the network a node fires, a pulse of light
// runs back down the cords to the mind, and the mind answers: it throbs, it
// breathes out spores at the node, it wakes everything that lives around it
// and it hatches Spore Rats out of the nodes. Cut the network and it weakens:
// every node lost takes the nodes beyond it with it, the mind's rind softens,
// and with most of the network gone it splits open and can be killed.
//   fungus_mind   skinned kit rig: six folded lobes on a rooted boss, seven
//                 root buttresses, two lashing rhizomorph tendrils, ink-cap
//                 stalks and puffball sacs; the network is world-space growth
//                 (cords, side hyphae, felt mats, signal beads) drawn per mind.
//   fungus_node   a node of the network (fruiting bodies round a puffball, on
//                 the floor or shelved on a wall). Killing one cuts the network.
// POSTER / VIDEO API (stand-alone, no game needed):
//   buildFungusMind(variant?)                    -> KitRig
//   poseFungusMind(rig, t, dt, pose, { weak?, lashT?, lookYaw? })
//     pose: 'idle' | 'throb' | 'alert' | 'spore' | 'lash' | 'weak' | 'dead'
//   demoNetwork(seed?)                           -> THREE.Object3D (cords + mats + nodes round the origin, flat floor)
//   buildFungusNode(variant?)                    -> KitRig
//   poseFungusNode(rig, t, dt, pose, { grow?, wall? })
//     pose: 'idle' | 'sense' | 'spore' | 'grow' | 'wall' | 'dead'
// =====================================================================================

const ROOTS = 7, TN = 5;
const LOBES: [string, V3, V3, number, number][] = [
  // name, centre, radii, fold scale, throb phase
  ['hemL', [0.5, 1.12, 0.02], [0.68, 0.62, 0.92], 1, 0],
  ['hemR', [-0.5, 1.1, -0.02], [0.66, 0.6, 0.9], 1.05, 0.7],
  ['front', [0, 0.82, 0.74], [0.64, 0.42, 0.44], 1.3, 1.6],
  ['back', [0, 0.92, -0.8], [0.62, 0.44, 0.42], 1.4, 2.3],
  ['crownL', [0.3, 1.6, -0.1], [0.42, 0.32, 0.5], 1.6, 3.1],
  ['crownR', [-0.28, 1.56, 0.16], [0.4, 0.3, 0.46], 1.7, 3.9],
];
const STALKS: [V3, V3, number][] = [
  [[0.62, 1.62, 0.25], [0.35, 1, 0.2], 0.44], [[-0.5, 1.66, -0.22], [-0.3, 1, -0.25], 0.52], [[0.98, 1.28, -0.35], [0.8, 0.6, -0.2], 0.36],
  [[-1.0, 1.22, 0.3], [-0.8, 0.7, 0.3], 0.4], [[0.1, 1.86, -0.32], [0.05, 1, -0.3], 0.58], [[-0.12, 1.8, 0.42], [-0.1, 1, 0.35], 0.34],
];
const SACS: [V3, number][] = [[[0.8, 0.7, 0.52], 0.2], [[-0.82, 0.64, -0.44], 0.18], [[0.28, 0.52, -1.0], 0.16]];
const nrm = (v: V3): V3 => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const rootAng = (i: number) => (i / ROOTS) * Math.PI * 2 + 0.35 + Math.sin(i * 2.1) * 0.25;

// ------------------------------------------------------------------ the mind: skeleton
function bonesM(): ReturnType<typeof mkBones> {
  const A: [string, string, V3, boolean?][] = [['base', '', [0, 0, 0]], ['boss', 'base', [0, 0.3, 0]], ['core', 'boss', [0, 0.9, 0]]];
  for (const [n, c] of LOBES) A.push([n, 'core', c, true]);
  STALKS.forEach(([b, d0, l], i) => {
    const d = nrm(d0);
    const lobe = b[0] > 0.2 ? (b[1] > 1.5 ? 'crownL' : 'hemL') : b[0] < -0.2 ? (b[1] > 1.5 ? 'crownR' : 'hemR') : b[2] < 0 ? 'crownL' : 'crownR';
    A.push(['st' + i + 'a', lobe, b, true], ['st' + i + 'b', 'st' + i + 'a', [b[0] + d[0] * l * 0.55, b[1] + d[1] * l * 0.55, b[2] + d[2] * l * 0.55]], ['st' + i + 'c', 'st' + i + 'b', [b[0] + d[0] * l, b[1] + d[1] * l, b[2] + d[2] * l], true]);
  });
  SACS.forEach(([p], i) => A.push(['sac' + i, 'core', p, true]));
  for (let i = 0; i < ROOTS; i++) {
    const a = rootAng(i), R = [0.62, 1.2, 1.85, 2.45], Y = [0.18, 0.08, 0.045, 0.025];
    for (let k = 0; k < 4; k++) A.push(['r' + i + '_' + k, k ? 'r' + i + '_' + (k - 1) : 'boss', [Math.cos(a) * R[k], Y[k], Math.sin(a) * R[k]], k === 1]);
  }
  for (const [s, k] of [['L', 1], ['R', -1]] as const) {
    A.push(['t' + s + '0', 'boss', [k * 0.42, 0.26, 0.8], true]);
    for (let j = 1; j < TN; j++) A.push(['t' + s + j, 't' + s + (j - 1), [k * (0.5 + Math.sin(j * 1.1) * 0.35), 0.08, 0.85 + j * 0.24]]);
  }
  return mkBones(A);
}

function layoutM(p: Page) {
  p.reg('RIND', 96, 64); p.reg('BOSS', 64, 32); p.reg('CERE', 48, 32);
  p.reg('ROOT', 32, 32); p.reg('TEND', 24, 32); p.reg('STALK', 16, 24); p.reg('CAPT', 32, 24); p.reg('SAC', 32, 24); p.reg('VEIN', 16, 16); p.reg('CAP', 8, 8);
}

function buildM(B: SkinB, x: BuildCtx) {
  const bi = x.bi, R = x.R, rest = x.rest, v = x.variant;
  const core = bi('core'), boss = bi('boss'), base = bi('base');
  // ================= the lobes: folded cortex (gyri and sulci in the geometry), the cerebellum ridged in folia
  LOBES.forEach(([n, c, r, k], li) => {
    const b = bi(n);
    const folia = n === 'back';
    skBlob(B, R(folia ? 'CERE' : 'RIND'), 10 + li, c, r, {
      n: 32, rings: 18, w: (p: V3) => [b, 0.85, core, 0.15 * Math.max(0, 1 - (p[1] - 0.6))],
      bump: (d) => {
        const fold = folia ? Math.pow(Math.abs(Math.sin(d[1] * 22 + d[0] * 3 + v)), 0.6) * 0.1 - 0.05 : (Math.pow(Math.max(0, gyri(d, k * 1.5, v * 1.7 + li)), 0.7) - 0.6) * 0.22;
        const under = d[1] < -0.5 ? (d[1] + 0.5) * 0.25 : 0;
        return fold + under + (hash(Math.round(d[0] * 6), Math.round(d[2] * 6) + li) - 0.5) * 0.03;
      },
    });
  });
  // ================= the boss: a flared, buttressed root-foot into the floor, felted with mycelium
  sac(B, R('BOSS'), 2, [[0, 0.01, 0], [0, 0.18, 0], [0, 0.42, 0], [0, 0.72, 0]], [[1.05, 1.05], [0.78, 0.78], [0.6, 0.6], [0.52, 0.48]],
    [[base, 1], [boss, 0.7, base, 0.3], [boss, 1], [core, 0.6, boss, 0.4]], {
      n: 20, start: false, end: false,
      bump: (a, t) => 0.22 * Math.pow(Math.max(0, Math.cos(a * ROOTS * 0.5 + 0.35)), 3) * (1 - t) + (hash(Math.round(a * 4), Math.round(t * 8)) - 0.5) * 0.06,
    });
  // ================= roots: rhizomorph buttresses fanning across the floor and sinking into it
  for (let i = 0; i < ROOTS; i++) {
    const bones = [0, 1, 2, 3].map((k) => 'r' + i + '_' + k);
    const end = rest(bones[3]), a = rootAng(i);
    chain(B, x, R('ROOT'), 30 + i, { bones, tip: [end[0] + Math.cos(a + 0.5) * 0.45, -0.05, end[2] + Math.sin(a + 0.5) * 0.45], r: (t) => 0.22 * Math.pow(1 - t, 0.7) + 0.03, flat: 0.5, n: 8, rings: 4, knuckle: 0.3,
      bend: (k) => [-Math.sin(a) * 0.22 * (k % 2 ? 1 : -1), 0.02, Math.cos(a) * 0.22 * (k % 2 ? 1 : -1)],
      bump: (aa, t) => 0.12 * Math.max(0, Math.sin(t * 40 + i)) * (1 - t) + (hash(Math.round(aa * 3), Math.round(t * 20) + i) - 0.5) * 0.12 });
  }
  // ================= the lashers: two long rhizomorph tendrils coiled in front of it
  for (const s of ['L', 'R']) {
    const bones = [0, 1, 2, 3, 4].map((j) => 't' + s + j);
    chain(B, x, R('TEND'), 40 + (s === 'L' ? 0 : 1), { bones, tipLen: 0.32, r: (t) => 0.085 * (1 - t) + 0.014, n: 7, rings: 3, knuckle: 0.12,
      bump: (aa, t) => 0.18 * Math.pow(Math.max(0, Math.sin(t * 46)), 4) * (Math.cos(aa) > 0.2 ? 1 : 0.3) });
  }
  // ================= fruiting stalks with shaggy ink caps
  STALKS.forEach((_, i) => {
    chain(B, x, R('STALK'), 50 + i, { bones: ['st' + i + 'a', 'st' + i + 'b'], tip: rest('st' + i + 'c'), r: [0.05, 0.034], n: 6, rings: 2,
      bump: (aa, t) => (hash(Math.round(aa * 2), Math.round(t * 10) + i) - 0.5) * 0.15 });
    const cp = rest('st' + i + 'c'), cb = bi('st' + i + 'c');
    skBlob(B, R('CAPT'), 60 + i, [cp[0], cp[1] - 0.05, cp[2]], [0.1, 0.19, 0.1], { n: 10, rings: 6, vr: [0.32, 1], w: [cb, 1],
      bump: (d) => 0.1 * Math.max(0, Math.sin(Math.atan2(d[2], d[0]) * 7 + d[1] * 9)) * (1 - d[1]) + (d[1] < -0.3 ? 0.08 : 0) });
  });
  // ================= puffball sacs: swollen, pitted, they breathe out the spores
  SACS.forEach(([p, r], i) => {
    const b = bi('sac' + i);
    skBlob(B, R('SAC'), 70 + i, p, [r, r * 0.9, r], { n: 12, rings: 7, w: [b, 1], bump: (d) => (hash(Math.round(d[0] * 5 + 9), Math.round(d[1] * 5 + d[2] * 3) + i) < 0.18 ? -0.08 : 0) + (d[1] > 0.85 ? -0.12 : 0) });
  });
  // ================= veins: raised cords running over the cortex from the boss
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.2, s = i % 2 ? 1 : -1;
    const pts: V3[] = [];
    for (let k = 0; k <= 5; k++) {
      const t = k / 5, rr = 0.62 - t * 0.12 + 0.22 * Math.sin(t * Math.PI);
      const aa = a + s * t * 0.5;
      pts.push([Math.cos(aa) * (rr + 0.18), 0.55 + t * 1.05, Math.sin(aa) * (rr + 0.18) * 1.3]);
    }
    sac(B, R('VEIN'), 80 + i, pts, pts.map((_, k) => [0.03 - k * 0.003, 0.026 - k * 0.003] as [number, number]), pts.map((p) => [core, 0.6, bi(p[0] > 0 ? 'hemL' : 'hemR'), 0.4]), { n: 5, start: true, end: true, emis: 0.35 });
  }
}

function paintM(p: Page, x: BuildCtx) {
  const v = x.variant;
  const RIND = makeRamp(mixHex(0x2c2238, 0x1c1a28, v * 0.4), 8, { hueShift: 0.05, spread: 0.65 });
  const r = p.R('RIND');
  r.fill(RIND, (xx, yy) => 1.1 + (r.fbm(xx, yy, 4, 3, 21 + v) - 0.5) * 1.8 + Math.cos((r.deg(xx) * Math.PI) / 180) * 0.5, undefined, 0.6);
  // fine mycelial fuzz in the sulci, violet veins, spore pores, wet glints
  for (let i = 0; i < 30; i++) r.crack(hash(i, 31) * r.w, hash(i + 3, 31) * r.h, 3 + Math.floor(hash(i, 33) * 5), hash(i, 35) * 360, 0x5a5262, 31 + i, 0.35, 0.1);
  for (let i = 0; i < 9; i++) r.crack(hash(i, 41) * r.w, hash(i + 3, 41) * r.h, 8 + Math.floor(hash(i, 43) * 12), 70 + hash(i, 45) * 40, 0x5a2a80, 41 + i, 0.6, 0.2, 0x8a5ab8);
  for (let i = 0; i < 40; i++) { const px = hash(i, 51) * r.w, py = hash(i + 1, 51) * r.h; r.set(px, py, RIND[0]); r.blend(px + 1, py, 0xd8d0c0, 0.45); }
  for (let i = 0; i < 30; i++) { const gx = hash(i, 61) * r.w, gy = hash(i + 2, 61) * r.h; r.blend(gx, gy, 0xffffff, 0.85); r.blend(gx + 1, gy, 0xe8d8ff, 0.4); }
  const c = p.R('CERE');
  c.fill(RIND, (xx, yy) => 1.2 + (yy % 3 === 0 ? -1 : 0.4) + (c.fbm(xx, yy, 3, 2, 22) - 0.5) * 1.4, undefined, 0.5);
  for (let i = 0; i < 10; i++) c.crack(hash(i, 71) * c.w, hash(i + 3, 71) * c.h, 12, 0, 0x7a50a0, 71 + i, 0.6, 0.1);
  paintMycelium(p.R('BOSS'), makeRamp(0x3a3040, 7, { spread: 0.7 }), { seed: 5, density: 0.03, ground: 1.6, strand: 0xd8d0dc, hi: 0xf4f0f4 });
  const bo = p.R('BOSS');
  for (let yy = Math.floor(bo.h * 0.7); yy < bo.h; yy++) for (let xx = 0; xx < bo.w; xx++) if (hash(xx, yy * 3) < (yy / bo.h - 0.65) * 2.2) bo.set(xx, yy, hash(xx, yy) < 0.5 ? 0xe8e4ea : 0xbab2c0);
  const ro = p.R('ROOT');
  ro.fill(makeRamp(0x2a2030, 6), (xx, yy) => 0.9 + (yy % 6 < 1 ? 1.2 : 0) + (ro.fbm(xx, yy, 3, 2, 8) - 0.5) * 1.6, undefined, 0.5);
  for (let i = 0; i < 18; i++) ro.crack(hash(i, 81) * ro.w, hash(i + 2, 81) * ro.h, 6, 90, 0x8a8094, 81 + i, 0.4, 0.2);
  const te = p.R('TEND');
  te.fill(makeRamp(0x3a2e48, 6), (xx, yy) => 1.6 + Math.cos((te.deg(xx) * Math.PI) / 180) * 1.1 + (yy % 5 === 0 ? -1.2 : 0), undefined, 0.5);
  for (let yy = 0; yy < 8; yy++) for (let xx = 0; xx < te.w; xx++) te.blend(xx, te.h - 1 - yy, 0xe8dcf0, 0.6 - yy * 0.07);
  const st = p.R('STALK');
  st.fill(makeRamp(0xd8d0c8, 5), (xx, yy) => 2.4 + (hash(xx, yy >> 1) - 0.5) * 1.4 + Math.cos((st.deg(xx) * Math.PI) / 180) * 0.7, undefined, 0.6);
  paintCapTop(p.R('CAPT'), makeRamp(0xe0dad6, 7, { spread: 0.8 }), { seed: 9, scales: 26, scale: 0x8a7a70, drip: 0.32 });
  const sa = p.R('SAC');
  sa.fill(makeRamp(0x8a7a8a, 6), (xx, yy) => 2.6 + Math.cos((sa.deg(xx) * Math.PI) / 180) - (yy / sa.h) * 1.2 + (sa.fbm(xx, yy, 3, 2, 3) - 0.5) * 1.6, undefined, 0.6);
  for (let i = 0; i < 26; i++) { const px = hash(i, 91) * sa.w, py = hash(i + 4, 91) * sa.h; sa.ellipse(px, py, 1.2, 1, 0x2a2030, 1); sa.blend(px - 1, py - 1, 0xf0e8d0, 0.6); }
  p.R('VEIN').fill(makeRamp(0x9a6ac8, 5), (xx, yy) => 2.5 + Math.cos((p.R('VEIN').deg(xx) * Math.PI) / 180) * 1.5 + (hash(xx, yy) - 0.5), undefined, 0.5);
  paintCap(p.R('CAP'), 0x2a2238, 0x6a5a7a, 0xd8d0dc);
}

const MIND_KIT: KitDef = { key: 'fungus_mind', variants: 2, W: 256, H: 256, bones: () => bonesM(), layout: layoutM, build: buildM, paint: paintM, sphere: [0, 1, 0, 3.2] };
/** a Fungus Mind rig (variant 0..1) */
export function buildFungusMind(variant = 0): KitRig { return buildKitRig(MIND_KIT, variant, 1.6); }

// ------------------------------------------------------------------ the mind: pose
interface MindDrive { t: number; dt: number; seed: number; alert: number; weak: number; dead: number; puff: number; flinch: number; wind: number; strike: number; lyaw: number; shriek: number }
const sm = (ud: Record<string, number>, k: string, to: number, rate: number, dt: number) => (ud[k] = (ud[k] ?? to) + (to - (ud[k] ?? to)) * Math.min(1, dt * rate));
function poseMind(K: KitRig, d: MindDrive) {
  const P = K.parts, ud = K.kit.m as Record<string, number>, t = d.t;
  // the throb: a slow double beat at rest, quick and hard when a node has fired
  const rate = 0.75 + d.alert * 1.6 - d.weak * 0.25;
  ud.ph = (ud.ph ?? d.seed * 9) + d.dt * rate * Math.PI * 2;
  const beat = Math.pow(Math.max(0, Math.sin(ud.ph)), 3) + 0.55 * Math.pow(Math.max(0, Math.sin(ud.ph - 0.9)), 5);
  const amp = (0.03 + d.alert * 0.035 + d.shriek * 0.05) * (1 - d.dead * 0.9);
  const sag = d.dead;
  P.core.scale.set(1 + beat * amp, (1 + beat * amp * 0.7) * (1 - sag * 0.28), 1 + beat * amp);
  P.core.position.y = (P.core.userData.p0 as THREE.Vector3).y - sag * 0.2;
  LOBES.forEach(([n, , , , ph], i) => {
    const o = P[n], p0 = o.userData.p0 as THREE.Vector3;
    const w = Math.sin(ud.ph * 0.5 + ph) * 0.5 + 0.5;
    const s = 1 + (beat * 0.6 + w * 0.4) * amp * (1.2 + (i % 2) * 0.4) + d.flinch * 0.03;
    o.scale.set(s, s * (1 - sag * 0.15), s);
    // with most of the network cut, the hemispheres part along the fissure and sag open
    const part = Math.max(0, d.weak - 0.55) / 0.45;
    o.position.set(p0.x + Math.sign(p0.x) * part * 0.09 + Math.sign(p0.x) * sag * 0.08, p0.y - (sag * 0.15 + part * 0.03) * (p0.y > 1.4 ? 1.5 : 1), p0.z);
    o.rotation.z = -Math.sign(p0.x) * (part * 0.08 + sag * 0.12);
  });
  // stalks sway, caps nod; a spore burst snaps them
  STALKS.forEach((_, i) => {
    const a = P['st' + i + 'a'], b = P['st' + i + 'b'], c = P['st' + i + 'c'];
    const sw = Math.sin(t * 0.7 + i * 1.7) * 0.06 + Math.sin(t * 1.9 + i) * 0.02 + d.puff * Math.sin(t * 20 + i) * 0.1;
    a.rotation.set(sw - sag * 0.5, 0, Math.cos(t * 0.5 + i) * 0.05 + sag * 0.3 * (i % 2 ? 1 : -1));
    b.rotation.set(sw * 1.4 + sag * 0.6, 0, 0);
    const cs = 1 - d.puff * 0.2 + beat * 0.03;
    c.scale.set(cs, 1 + d.puff * 0.1 - sag * 0.4, cs);
  });
  // the sacs fill on the beat; a puff empties them with a cough and they refill
  SACS.forEach((_, i) => {
    const s = (0.92 + 0.08 * Math.sin(t * 0.9 + i * 2) + beat * 0.05) * (1 - d.puff * 0.35) * (1 - sag * 0.4);
    P['sac' + i].scale.set(s, s * (1 + d.puff * 0.1), s);
  });
  // roots: a slow peristalsis toward the boss (feeding), tightening when alert
  for (let i = 0; i < ROOTS; i++) for (let k = 0; k < 4; k++) {
    const o = P['r' + i + '_' + k];
    const w = Math.sin(t * 1.3 - k * 1.1 + i) * 0.025 * (1 + d.alert);
    o.rotation.set(w, Math.sin(t * 0.4 + i + k) * 0.015, d.alert * 0.03 * (k === 0 ? 1 : 0));
    const s = 1 + Math.max(0, Math.sin(t * 2.1 - k * 1.4 + i)) * 0.06 * (1 + d.alert);
    o.scale.set(s, s, 1);
  }
  // the lashers: lie coiled and stir; wind up off the floor, crack down at the target, drag back
  for (const [s, k] of [['L', 1], ['R', -1]] as const) {
    for (let j = 0; j < TN; j++) {
      const o = P['t' + s + j];
      const coil = Math.sin(t * 0.8 + j * 0.9 + (k > 0 ? 0 : 2)) * 0.12 + (d.alert * Math.sin(t * 3 + j)) * 0.08;
      const up = d.wind * (j === 0 ? -0.9 : j === 1 ? -0.5 : 0.1) + d.strike * (j === 0 ? 0.25 : 0.12);
      const yaw = coil * k + (d.wind + d.strike) * (j === 0 ? d.lyaw * 0.8 : 0) - sag * 0.1 * k;
      o.rotation.set(up + Math.sin(t * 1.1 + j) * 0.03, yaw, d.wind * 0.3 * k * (j % 2 ? 1 : -1));
    }
  }
  // the glow: violet light through the veins on the beat; pinker and patchier when its network is cut
  const T = K.kit.F.tint.value;
  T.set(mixC(1.5, 1.35, d.weak), mixC(0.8, 1.0, d.weak), mixC(1.8, 1.05, d.weak), Math.max(0, (0.04 + beat * (0.1 + d.alert * 0.2) + d.shriek * 0.25 + d.weak * 0.15) * (1 - d.dead)));
}
const mixC = (a: number, b: number, t: number) => a + (b - a) * Math.min(1, Math.max(0, t));

// =====================================================================================
// the node: fruiting bodies round a puffball, on a felt of mycelium
// =====================================================================================
const NF = 5, NBR = 3;
interface NodeVar { stalks: [number, number, number, number][]; br: [number, number, number, number][] }
// stalk: angle, radius out, length, lean ; bracket: angle, radius, height, size
const NVARS: NodeVar[] = [
  { stalks: [[0.3, 0.12, 0.32, 0.25], [1.9, 0.15, 0.24, 0.35], [3.2, 0.1, 0.4, 0.15], [4.4, 0.16, 0.2, 0.45], [5.4, 0.08, 0.28, 0.2]], br: [[1.1, 0.2, 0.06, 1], [2.6, 0.22, 0.12, 0.8], [4.9, 0.19, 0.04, 0.9]] },
  { stalks: [[0.9, 0.14, 0.26, 0.3], [2.3, 0.12, 0.36, 0.2], [3.6, 0.15, 0.22, 0.4], [5.0, 0.11, 0.3, 0.25], [5.9, 0.17, 0.18, 0.5]], br: [[0.2, 0.21, 0.08, 1.1], [3.0, 0.2, 0.05, 0.7], [4.2, 0.22, 0.1, 0.9]] },
  { stalks: [[0.1, 0.1, 0.38, 0.2], [1.4, 0.16, 0.2, 0.45], [2.9, 0.13, 0.3, 0.3], [4.0, 0.1, 0.42, 0.15], [5.2, 0.15, 0.24, 0.35]], br: [[0.8, 0.2, 0.1, 0.9], [2.2, 0.22, 0.04, 1.2], [3.8, 0.19, 0.07, 0.8]] },
];
function bonesN(v: number) {
  const V = NVARS[v];
  const A: [string, string, V3, boolean?][] = [['base', '', [0, 0, 0]], ['puff', 'base', [0, 0.14, 0], true]];
  V.stalks.forEach(([a, r, l, lean], i) => {
    const bx = Math.cos(a) * r, bz = Math.sin(a) * r, dx = Math.cos(a) * lean, dz = Math.sin(a) * lean, k = 1 / Math.hypot(dx, 1, dz);
    A.push(['f' + i + 'a', 'base', [bx, 0.02, bz]], ['f' + i + 'b', 'f' + i + 'a', [bx + dx * k * l * 0.5, 0.02 + k * l * 0.5, bz + dz * k * l * 0.5]], ['f' + i + 'c', 'f' + i + 'b', [bx + dx * k * l, 0.02 + k * l, bz + dz * k * l], true]);
  });
  V.br.forEach(([a, r, h], i) => A.push(['br' + i, 'base', [Math.cos(a) * r * 0.6, h, Math.sin(a) * r * 0.6], true]));
  return mkBones(A);
}
function layoutN(p: Page) { p.reg('PUFF', 32, 24); p.reg('STALK', 16, 24); p.reg('CAPT', 24, 16); p.reg('GILL', 16, 16); p.reg('BRK', 32, 16); p.reg('MYC', 32, 16); p.reg('CAP', 8, 8); }
function buildN(B: SkinB, x: BuildCtx) {
  const bi = x.bi, R = x.R, rest = x.rest, V = NVARS[x.variant];
  const puff = bi('puff'), base = bi('base');
  // the puffball: pitted, wrinkled at the base where the felt holds it
  skBlob(B, R('PUFF'), 1, [0, 0.14, 0], [0.15, 0.13, 0.15], { n: 14, rings: 8, w: (p) => (p[1] < 0.05 ? [base, 0.6, puff, 0.4] : [puff, 1]),
    bump: (d) => (d[1] < -0.4 ? 0.12 * Math.sin(Math.atan2(d[2], d[0]) * 9) : 0) + (hash(Math.round(d[0] * 6 + 7), Math.round(d[1] * 6 + d[2] * 4)) < 0.15 ? -0.06 : 0) + (d[1] > 0.9 ? -0.1 : 0) });
  // the felt it sits in: a low lumpy skirt
  sac(B, R('MYC'), 2, [[0, 0.005, 0], [0, 0.04, 0], [0, 0.07, 0]], [[0.34, 0.34], [0.26, 0.26], [0.14, 0.14]], [[base, 1], [base, 1], [puff, 0.5, base, 0.5]], { n: 14, start: false, end: false, bump: (a) => 0.18 * Math.sin(a * 5 + x.variant) + 0.1 * Math.sin(a * 11) });
  V.stalks.forEach((_, i) => {
    chain(B, x, R('STALK'), 10 + i, { bones: ['f' + i + 'a', 'f' + i + 'b'], tip: rest('f' + i + 'c'), r: [0.022, 0.014], n: 5, rings: 2 });
    const cp = rest('f' + i + 'c'), cb = bi('f' + i + 'c'), tall = i % 2 === 0;
    skBlob(B, R(tall ? 'CAPT' : 'GILL'), 20 + i, [cp[0], cp[1] - (tall ? 0.03 : 0.005), cp[2]], tall ? [0.045, 0.08, 0.045] : [0.07, 0.035, 0.07], { n: 9, rings: 5, vr: tall ? [0.3, 1] : [0.45, 1], w: [cb, 1],
      bump: (d) => (tall ? 0.08 * Math.max(0, Math.sin(Math.atan2(d[2], d[0]) * 6 + d[1] * 7)) : 0.05 * Math.sin(Math.atan2(d[2], d[0]) * 11)) });
  });
  // bracket shelves: half-discs in zoned bands (on a wall they become the shelves the node hangs from)
  V.br.forEach(([a, r, , s], i) => {
    const b = bi('br' + i), c = rest('br' + i), ox = Math.cos(a), oz = Math.sin(a);
    skBlob(B, R('BRK'), 30 + i, [c[0] + ox * r * 0.25 * s, c[1], c[2] + oz * r * 0.25 * s], [0.13 * s, 0.03 * s, 0.13 * s], { n: 12, rings: 5, w: [b, 1],
      bump: (d) => 0.12 * Math.sin(Math.atan2(d[2], d[0]) * 8) * Math.max(0, 1 - Math.abs(d[1]) * 2) - (d[0] * ox + d[2] * oz < -0.3 ? 0.5 : 0) });
  });
}
function paintN(p: Page, x: BuildCtx) {
  const v = x.variant;
  const pu = p.R('PUFF');
  pu.fill(makeRamp(mixHex(0x7a6a86, 0x8a7a70, v * 0.3), 7), (xx, yy) => 3 + Math.cos((pu.deg(xx) * Math.PI) / 180) - (yy / pu.h) * 1.4 + (pu.fbm(xx, yy, 3, 2, 5 + v) - 0.5) * 1.6, undefined, 0.6);
  for (let i = 0; i < 22; i++) { const px = hash(i, 11 + v) * pu.w, py = hash(i + 4, 11) * pu.h * 0.8; pu.ellipse(px, py, 1, 1, 0x241c2c, 1); pu.blend(px, py - 1, 0xe8d8f0, 0.5); }
  for (let i = 0; i < 6; i++) pu.crack(hash(i, 17) * pu.w, pu.h * 0.6, 8, -90, 0xb090d0, 17 + i, 0.7, 0.2);
  const st = p.R('STALK');
  st.fill(makeRamp(0xd0c8c0, 5), (xx, yy) => 2.5 + Math.cos((st.deg(xx) * Math.PI) / 180) * 0.8 + (hash(xx, yy >> 1) - 0.5), undefined, 0.6);
  paintCapTop(p.R('CAPT'), makeRamp(0xe2dcd8, 7, { spread: 0.8 }), { seed: 3 + v, scales: 12, scale: 0x7a6a62, drip: 0.4 });
  paintCapTop(p.R('GILL'), makeRamp(mixHex(0xb07840, 0x8a6a8a, v * 0.4), 6), { seed: 7, scales: 6, scale: 0xe0c8a0 });
  paintGills(p.R('GILL'), makeRamp(0x6a5040, 5), 4);
  const br = p.R('BRK');
  br.fill(makeRamp(0xa86a38, 7, { spread: 0.8 }), (xx, yy) => { const ring = Math.floor((yy / br.h) * 6 + Math.sin(xx * 0.4) * 0.6); return ring % 2 ? 4.5 : 2 + (ring % 3) * 0.6 + (hash(xx, yy) - 0.5) * 0.6; }, undefined, 0.5);
  for (let xx = 0; xx < br.w; xx++) br.set(xx, br.h - 1, 0xf0e8d8);
  paintMycelium(p.R('MYC'), makeRamp(0x4a4050, 7, { spread: 0.75 }), { seed: 9, density: 0.05, ground: 2.5, strand: 0xe8e4ea, hi: 0xffffff });
  paintCap(p.R('CAP'), 0x6a5a7a, 0xb8a8c0, 0x3a2a40);
}
const NODE_KIT: KitDef = { key: 'fungus_node', variants: 3, W: 128, H: 128, bones: bonesN, layout: layoutN, build: buildN, paint: paintN, sphere: [0, 0.2, 0, 0.6], decorate: (rig) => { addMount(rig); } };
/** a network node rig (variant 0..2) */
export function buildFungusNode(variant = 0): KitRig { return buildKitRig(NODE_KIT, variant, 0.3); }

interface NodeDrive { t: number; dt: number; grow: number; sense: number; puff: number; dead: number; wall: number; h: number; seed: number; flinch: number }
const _W = new THREE.Matrix4(), _Wq = new THREE.Quaternion(), _We = new THREE.Euler(), _Wp = new THREE.Vector3(), _Ws = new THREE.Vector3();
function poseNode(K: KitRig, d: NodeDrive, c: Creature | null = null) {
  const P = K.parts, V = NVARS[K.kit.entry.variant], t = d.t;
  const g = Math.max(0.02, Math.min(1, d.grow));
  // on a wall: hung on its brackets, stalks out of the wall and curling up toward the light
  _We.set(d.wall * Math.PI / 2, 0, 0); _Wq.setFromEuler(_We);
  _Wp.set(0, d.wall * d.h, -d.wall * 0.1); _Ws.set(g * 1.4, g * 1.4 * (1 - d.dead * 0.55), g * 1.4);
  setMount(K, c, _W.compose(_Wp, _Wq, _Ws));
  const beat = Math.pow(Math.max(0, Math.sin(t * (1.2 + d.sense * 4) + d.seed * 9)), 4);
  const s = (1 + beat * (0.04 + d.sense * 0.12)) * (1 - d.puff * 0.4) * (1 - d.dead * 0.5);
  P.puff.scale.set(s, s * (1 + d.puff * 0.15), s);
  V.stalks.forEach((_, i) => {
    const sw = Math.sin(t * 0.9 + i * 1.3 + d.seed * 5) * 0.07 + d.puff * Math.sin(t * 24 + i) * 0.12 + d.flinch * 0.2;
    P['f' + i + 'a'].rotation.set(sw - d.wall * 0.9 + d.dead * 0.6, 0, Math.cos(t * 0.6 + i) * 0.05);
    P['f' + i + 'b'].rotation.set(sw * 1.3 - d.wall * 0.4 + d.dead * 0.5, 0, 0);
    const cs = 1 - d.dead * 0.3;
    P['f' + i + 'c'].scale.set(cs, cs * (1 + d.sense * 0.08 * beat), cs);
  });
  V.br.forEach((_, i) => { P['br' + i].rotation.set(d.wall * -Math.PI / 2 * 0.0 + Math.sin(t * 0.3 + i) * 0.02, 0, 0); });
  K.kit.F.tint.value.set(mixC(1.4, 0.9, d.dead), mixC(0.85, 0.75, d.dead), mixC(1.6, 0.55, d.dead), Math.max(d.dead * 0.6, beat * d.sense * 0.6 + d.sense * 0.15));
}

// =====================================================================================
// the network: world-space growth drawn per mind (every peer, from the replicated node list)
// =====================================================================================
/** replicated node row: x, z, parent (-1 = the mind), wall normal x, z (0,0 = floor), height on the wall, born time, dead time (0 alive), creature id */
type NRow = [number, number, number, number, number, number, number, number, string];
const GROW_T = 9;
interface Gfx { group: THREE.Group; cords: THREE.Mesh | null; mats: THREE.Mesh | null; beads: THREE.InstancedMesh; sig: string; paths: V3[][]; lastT: number; zk: string; pulses: { i: number; t0: number }[] }
const GFX = new Map<string, Gfx>();
let gfxSys = false;
let cordMat: THREE.Material | null = null, matMat: THREE.Material | null = null, beadMat: THREE.Material | null = null;
const _m4 = new THREE.Matrix4(), _q4 = new THREE.Quaternion(), _s4 = new THREE.Vector3(), _p4 = new THREE.Vector3();

function floorY(z: Zone | null, x: number, zz: number) { return z ? z.heightAt(Math.floor(x), Math.floor(zz)) : 0; }
/** the cord from a parent to a node: wandering over the floor, climbing the wall at the end */
function cordPath(z: Zone | null, ax: number, az: number, row: NRow, seed: number, fromMind: boolean): V3[] {
  const [bx, bz, , nx, nz, h] = row;
  const wall = nx !== 0 || nz !== 0;
  const ex = wall ? bx - nx * 0.1 : bx, ez = wall ? bz - nz * 0.1 : bz;
  let sx = ax, sz = az;
  if (fromMind) { const a = Math.atan2(ez - az, ex - ax); sx += Math.cos(a) * 1.15; sz += Math.sin(a) * 1.15; }
  const L = Math.hypot(ex - sx, ez - sz), N = Math.max(4, Math.ceil(L / 0.3));
  const px = -(ez - sz) / (L || 1), pz = (ex - sx) / (L || 1);
  const out: V3[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, w = Math.sin(Math.PI * t) * (0.18 + hash(seed, 3) * 0.2);
    const off = Math.sin(t * Math.PI * (2 + hash(seed, 5) * 2) + seed) * w + Math.sin(t * 17 + seed * 3) * 0.03;
    const x = sx + (ex - sx) * t + px * off, zz = sz + (ez - sz) * t + pz * off;
    out.push([x, floorY(z, x, zz) + 0.03, zz]);
  }
  if (wall && h > 0.2) {
    const fy = out[out.length - 1][1], M = Math.max(3, Math.ceil(h / 0.3));
    for (let i = 1; i <= M; i++) { const t = i / M, s = Math.sin(t * 5 + seed) * 0.08; out.push([ex - nz * s, fy + t * (h - 0.05), ez + nx * s]); }
  }
  return out;
}
function cut(path: V3[], u: number): V3[] {
  if (u >= 1) return path;
  let L = 0; const seg: number[] = [];
  for (let i = 1; i < path.length; i++) { const d = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1], path[i][2] - path[i - 1][2]); seg.push(d); L += d; }
  let want = L * Math.max(0.02, u); const out: V3[] = [path[0]];
  for (let i = 1; i < path.length; i++) {
    if (want <= seg[i - 1]) { const k = want / (seg[i - 1] || 1); out.push([path[i - 1][0] + (path[i][0] - path[i - 1][0]) * k, path[i - 1][1] + (path[i][1] - path[i - 1][1]) * k, path[i - 1][2] + (path[i][2] - path[i - 1][2]) * k]); break; }
    want -= seg[i - 1]; out.push(path[i]);
  }
  return out.length > 1 ? out : [path[0], path[0].map((v, k) => v + (k === 1 ? 0.001 : 0)) as V3];
}
function samplePath(path: V3[], s: number, out: THREE.Vector3): boolean {
  for (let i = 1; i < path.length; i++) {
    const d = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1], path[i][2] - path[i - 1][2]);
    if (s <= d) { const k = s / (d || 1); out.set(path[i - 1][0] + (path[i][0] - path[i - 1][0]) * k, path[i - 1][1] + (path[i][1] - path[i - 1][1]) * k + 0.03, path[i - 1][2] + (path[i][2] - path[i - 1][2]) * k); return true; }
    s -= d;
  }
  return false;
}
/** build the cords, side hyphae and felt mats of a network (z null: flat floor, for previews) */
function buildNetGeo(z: Zone | null, cx: number, cz: number, rows: NRow[], now: number): { cords: THREE.BufferGeometry; mats: THREE.BufferGeometry; paths: V3[][] } {
  const mb = new ModelBuilder(), mm = new ModelBuilder();
  const paths: V3[][] = [];
  rows.forEach((row, i) => {
    const par = row[2];
    const ax = par < 0 ? cx : rows[par][0], az = par < 0 ? cz : rows[par][1];
    const full = cordPath(z, ax, az, row, i * 7.31 + 1, par < 0);
    paths.push(full);
    const u = Math.min(1, (now - row[6]) / GROW_T);
    const dead = row[7] > 0 ? Math.min(1, (now - row[7]) / 6) : 0;
    const path = cut(full, u);
    const tex = dead > 0.15 ? 'fg_cord_dead' : 'fg_cord';
    const r0 = (par < 0 ? 0.07 : 0.05) * (1 - dead * 0.45);
    if (path.length > 1) tube(mb, path as AV3[], (t) => r0 * (1 - t * 0.45) + 0.012, 5, tex, { squash: [1, 0.55], capEnd: true, color: dead ? 0xb8a890 : 0xffffff });
    // side hyphae: thin threads branching off over the floor
    const nb = 2 + Math.floor(hash(i, 9) * 3);
    for (let k = 0; k < nb; k++) {
      const at = Math.floor((0.2 + hash(i, k + 11) * 0.6) * (path.length - 1));
      if (at < 1 || at >= path.length - 1 || u < 0.3) continue;
      const p0 = path[at], p1 = path[at + 1];
      const da = Math.atan2(p1[2] - p0[2], p1[0] - p0[0]) + (hash(i, k + 13) < 0.5 ? 1 : -1) * (0.6 + hash(i, k + 15) * 0.6);
      const len = (0.3 + hash(i, k + 17) * 0.6) * Math.min(1, u * 1.3);
      const hp: V3[] = [];
      for (let j = 0; j <= 4; j++) { const t = j / 4, a = da + Math.sin(t * 4 + k) * 0.3, x = p0[0] + Math.cos(a) * len * t, zz = p0[2] + Math.sin(a) * len * t; hp.push([x, p0[1] - 0.01 + (p0[1] - 0.03 > floorY(z, x, zz) + 0.5 ? 0 : 0), zz]); }
      tube(mb, hp as AV3[], (t) => 0.016 * (1 - t) + 0.004, 4, tex, { squash: [1, 0.6] });
    }
    // the felt around the node, on the floor or on the wall
    if (u > 0.85) {
      const [bx, bz, , nx, nz, h] = row, s = (0.9 + hash(i, 21) * 0.6) * Math.min(1, (u - 0.85) / 0.15) * (1 - dead * 0.3);
      if (nx === 0 && nz === 0) mm.flat(bx, floorY(z, bx, bz) + 0.012 + i * 0.0004, bz, s, s, 'fg_mat', { rot: hash(i, 23) * 6, color: dead ? 0xa89880 : 0xffffff });
      else {
        const wx = bx - nx * 0.11, wz = bz - nz * 0.11, fy = floorY(z, bx, bz), tx = -nz, tz = nx, hw = s * 0.45;
        mm.quadRaw([[wx - tx * hw, fy + h - hw * 1.2, wz - tz * hw], [wx + tx * hw, fy + h - hw * 1.2, wz + tz * hw], [wx + tx * hw, fy + h + hw, wz + tz * hw], [wx - tx * hw, fy + h + hw, wz - tz * hw]], [[0, 0], [1, 0], [1, 1], [0, 1]], 'fg_mat', dead ? 0xa89880 : 0xffffff, 1, 0, 0, [nx, 0, nz]);
        mm.flat(wx + nx * 0.25, fy + 0.012, wz + nz * 0.25, s * 0.7, s * 0.7, 'fg_mat', { rot: hash(i, 27) * 6 });
      }
    }
  });
  // the mind's own felt
  mm.flat(cx, floorY(z, cx, cz) + 0.01, cz, 4.6, 4.6, 'fg_mat', { rot: 0.4 });
  return { cords: mb.build(), mats: mm.build(), paths };
}
function gfxFor(c: Creature): Gfx | null {
  const root = (G as any).creatures?.root as THREE.Object3D | undefined;
  if (!root) return null;
  let g = GFX.get(c.id);
  if (!g) {
    if (!cordMat) { cordMat = worldMaterial({}); matMat = worldMaterial({ alphaTest: 0.5, outline: 0 } as any); beadMat = worldMaterial({ unlit: true, outline: 0, noGrid: true } as any); }
    const group = new THREE.Group(); group.name = 'fungusNet:' + c.id;
    const bmb = new ModelBuilder(); bmb.sphere(0, 0, 0, 1, 6, 4, 'white', { color: 0xe0b8ff, emissive: 1.4 });
    const beads = new THREE.InstancedMesh(bmb.build(), beadMat!, 40); beads.frustumCulled = false; beads.count = 0; group.add(beads);
    g = { group, cords: null, mats: null, beads, sig: '', paths: [], lastT: 0, zk: c.zoneKey, pulses: [] };
    GFX.set(c.id, g);
    if (!gfxSys && (G as any).addSystem) {
      gfxSys = true;
      (G as any).addSystem({ name: 'fungusNet', update: () => {
        for (const [id, gg] of GFX) if (G.time - gg.lastT > 1.5 || gg.zk !== G.local?.zoneKey) { gg.group.removeFromParent(); gg.cords?.geometry.dispose(); gg.mats?.geometry.dispose(); GFX.delete(id); }
      } });
    }
  }
  if (g.group.parent !== root) root.add(g.group);
  g.lastT = G.time;
  return g;
}
/** every peer: keep a mind's network drawn and its signal beads running */
function syncNetwork(c: Creature, rows: NRow[], now: number, dt: number) {
  const g = gfxFor(c);
  if (!g) return;
  let sig = rows.length + ':';
  for (const r of rows) sig += (r[7] ? 'd' + Math.min(4, Math.floor((now - r[7]) / 1.5)) : 'a') + Math.min(12, Math.floor((now - r[6]) / (GROW_T / 12))) + ',';
  if (sig !== g.sig) {
    g.sig = sig;
    const geo = buildNetGeo(zoneOf(c), c.home.x, c.home.z, rows, now);
    if (!g.cords) { g.cords = new THREE.Mesh(geo.cords, cordMat!); g.cords.receiveShadow = true; g.cords.castShadow = false; g.cords.frustumCulled = false; g.group.add(g.cords); } else { g.cords.geometry.dispose(); g.cords.geometry = geo.cords; }
    if (!g.mats) { g.mats = new THREE.Mesh(geo.mats, matMat!); g.mats.receiveShadow = true; g.mats.frustumCulled = false; g.group.add(g.mats); } else { g.mats.geometry.dispose(); g.mats.geometry = geo.mats; }
    g.paths = geo.paths;
  }
  // signal beads: from the node that felt something, back along every cord to the mind
  let k = 0;
  g.pulses = g.pulses.filter((p) => now - p.t0 < 8);
  for (const pl of g.pulses) {
    const chainP: V3[][] = [];
    for (let i = pl.i, n = 0; i >= 0 && i < rows.length && n < 12; i = rows[i][2], n++) chainP.push(g.paths[i]);
    let total = 0; for (const p of chainP) total += plen(p);
    for (let b = 0; b < 5 && k < 40; b++) {
      let s = (now - pl.t0 - b * 0.07) * 4.5;
      if (s < 0 || s > total) continue;
      for (const p of chainP) { const L = plen(p); if (s <= L) { samplePath(p, L - s, _p4); break; } s -= L; }
      const sc = 0.045 - b * 0.006;
      _s4.setScalar(sc); _m4.compose(_p4, _q4, _s4); g.beads.setMatrixAt(k++, _m4);
    }
  }
  g.beads.count = k; g.beads.instanceMatrix.needsUpdate = true;
  void dt;
}
const plen = (p: V3[]) => { let L = 0; for (let i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1], p[i][2] - p[i - 1][2]); return L; };

/** a stand-alone network for posters and the video: cords, mats and node rigs round (0, 0) on a flat floor */
export function demoNetwork(seed = 1): THREE.Object3D {
  const R = new Rng(seed * 9973);
  const rows: NRow[] = [];
  for (let i = 0; i < 9; i++) {
    const par = i < 4 ? -1 : Math.floor(R.next() * i);
    const ax = par < 0 ? 0 : rows[par][0], az = par < 0 ? 0 : rows[par][1];
    const a = (par < 0 ? (i / 4) * Math.PI * 2 + 0.4 : Math.atan2(az, ax) + R.float(-0.9, 0.9)), d = R.float(2.6, 4.2);
    rows.push([ax + Math.cos(a) * d, az + Math.sin(a) * d, par, 0, 0, 0, -99, 0, '']);
  }
  const geo = buildNetGeo(null, 0, 0, rows, 0);
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo.cords, worldMaterial({})), new THREE.Mesh(geo.mats, worldMaterial({ alphaTest: 0.5, outline: 0 } as any)));
  rows.forEach((r, i) => { const n = buildFungusNode(i % 3); n.root.position.set(r[0], 0, r[1]); n.root.rotation.y = i; poseNode(n, { t: i, dt: 0, grow: 1, sense: 0, puff: 0, dead: 0, wall: 0, h: 0, seed: i * 0.1, flinch: 0 }); g.add(n.root); });
  return g;
}

// =====================================================================================
// host: the mind's brain and the network's growth
// =====================================================================================
interface HNode { id: string; x: number; z: number; p: number; nx: number; nz: number; h: number; born: number; dead: number }
const SENSE = 4.6, MAXR = 17, ALERT_CD = 7;
const FUNGAL = new Set(['fungus_mind', 'fungus_node', 'spore_rat', 'whale_corpse']);
function setMd(c: Creature, md: string) { const n = net(c); if (n.md !== md) { n.md = md; c.mem.mdT = 0; } }
function rowsOf(m: HNode[]): NRow[] { return m.map((d) => [+d.x.toFixed(2), +d.z.toFixed(2), d.p, d.nx, d.nz, +d.h.toFixed(2), +d.born.toFixed(1), +d.dead.toFixed(1), d.id]); }
function publish(c: Creature) { net(c).nw = rowsOf(c.mem.nodes as HNode[]); }
export function mindOf(zk: string): Creature | null { for (const o of CS()?.creatures?.values?.() ?? []) if (o.zoneKey === zk && o.sp.key === 'fungus_mind' && !o.dead) return o; return null; }
/** host: alive nodes of a mind (for rats and the bacteria that graze the felt) */
export function mindNodes(c: Creature): { x: number; z: number; id: string }[] { return ((c.mem.nodes ?? []) as HNode[]).filter((d) => !d.dead); }
function strength(c: Creature) { const L = (c.mem.nodes ?? []) as HNode[]; if (!L.length) return 0.4; const a = L.filter((d) => !d.dead).length; return Math.min(1, a / Math.max(6, (c.mem.peak as number) ?? L.length)); }

function freeTile(z: Zone, x: number, y: number) { return z.inb(x, y) && !!z.floor[z.idx(x, y)] && !z.solid[z.idx(x, y)] && walkable(z, x, y); }
/** host: grow one node outward from the network */
function grow(c: Creature, now: number, initial = false): boolean {
  const z = zoneOf(c), L = c.mem.nodes as HNode[];
  const alive = L.map((d, i) => [d, i] as const).filter(([d]) => !d.dead);
  for (let tries = 0; tries < 24; tries++) {
    // mostly from the tips (nodes far from the mind), sometimes straight from the mind
    let par = -1, ax = c.home.x, az = c.home.z;
    if (alive.length && rng.next() < (initial ? 0.45 : 0.8)) {
      const pick = alive[Math.floor(Math.pow(rng.next(), 0.6) * alive.length)];
      par = pick[1]; ax = pick[0].x; az = pick[0].z;
    }
    const base = par < 0 ? rng.float(0, Math.PI * 2) : Math.atan2(az - c.home.z, ax - c.home.x) + rng.float(-1.1, 1.1);
    const d = rng.float(2.8, 5.2);
    let tx = ax + Math.cos(base) * d, tz = az + Math.sin(base) * d;
    if (Math.hypot(tx - c.home.x, tz - c.home.z) > MAXR || Math.hypot(tx - c.home.x, tz - c.home.z) < 2.6) continue;
    if (!freeTile(z, Math.floor(tx), Math.floor(tz))) continue;
    if (L.some((o) => !o.dead && Math.hypot(o.x - tx, o.z - tz) < 2.2)) continue;
    if (!lineOfSightB(z, ax, az, tx, tz)) continue;
    // a third of them shelve up a wall if one is close
    let nx = 0, nz = 0, h = 0;
    if (rng.next() < 0.38) {
      const ws = wallSpotsNear(z, tx, tz, 1.3).filter((w) => Math.hypot(w.x - tx, w.z - tz) < 1.4);
      if (ws.length) { const w = ws[Math.floor(rng.next() * ws.length)]; nx = w.nx; nz = w.nz; tx = w.x + nx * 0.12; tz = w.z + nz * 0.12; h = rng.float(0.8, 1.9); }
    }
    const nd = CS().spawn('fungus_node', c.zoneKey, tx, tz);
    if (!nd) return false;
    nd.mem.mind = c.id; nd.mem.noCap = 1; nd.mem.persistent = true; nd.home = { x: tx, z: tz };
    if (nx || nz) { nd.facing = nd.targetFacing = Math.atan2(nz, nx); }
    const nn = net(nd); nn.w = nx || nz ? 1 : 0; nn.h = +h.toFixed(2); nn.b = +(initial ? now - GROW_T - 1 : now).toFixed(1);
    L.push({ id: nd.id, x: tx, z: tz, p: par, nx, nz, h, born: initial ? now - GROW_T - 1 : now, dead: 0 });
    c.mem.peak = Math.max((c.mem.peak as number) ?? 0, L.filter((o) => !o.dead).length);
    publish(c);
    return true;
  }
  return false;
}
/** host: a node is gone: everything grown beyond it withers after it, hop by hop */
function cutNode(c: Creature, idx: number, now: number) {
  const L = c.mem.nodes as HNode[];
  const kill = (i: number, delay: number) => {
    const d = L[i]; if (!d || d.dead) return;
    d.dead = now + delay;
    const o = CS().creatures.get(d.id);
    if (o && !o.dead) { if (delay <= 0) { /* already dying */ } else setTimeout(() => { if (!o.dead && CS().creatures.has(o.id)) { o.mem.wither = 1; CS().kill(o, zoneOf(o)); } }, delay * 1000); }
    L.forEach((e, j) => { if (e.p === i) kill(j, delay + 0.7); });
  };
  kill(idx, 0);
  c.mem.cutT = now;
  fx(c, 'shriek');
  publish(c);
}
function wake(c: Creature, node: { x: number; z: number }, p: Player) {
  for (const o of CS().creatures.values()) {
    if (o.zoneKey !== c.zoneKey || o.dead || o === c || o.tamedBy || FUNGAL.has(o.sp.key) && o.sp.key !== 'spore_rat') continue;
    const d = Math.hypot(o.x - node.x, o.z - node.z);
    if (d > 24) continue;
    o.lastHeard = { x: p.x, z: p.z, t: G.time, r: 10 };
    if (o.sp.key === 'spore_rat') o.mem.wake = { pid: p.id, t: G.time };
    else if (o.state === 'sleep' || o.state === 'idle' || o.state === 'graze') o.setState('investigate');
  }
}
function ratsNear(c: Creature): number { let n = 0; for (const o of CS().creatures.values()) if (o.zoneKey === c.zoneKey && !o.dead && o.sp.key === 'spore_rat') n++; return n; }

function thinkMind(c: Creature, dt: number): boolean {
  const z = zoneOf(c), m = c.mem, n = net(c), ev = pulse(c), now = G.time;
  pin(c);
  if (!m.init) {
    m.init = 1; m.nodes = m.nodes ?? []; m.growT = rng.float(14, 24); m.alertCd = 0; m.lashCd = 0;
    // a network already standing when you get here
    const seedN = 7 + Math.floor(rng.next() * 3);
    for (let i = 0; i < seedN * 3 && (m.nodes as HNode[]).length < seedN; i++) grow(c, now, true);
    publish(c);
  }
  m.mdT = (m.mdT ?? 0) + dt;
  m.alertCd = Math.max(0, m.alertCd - dt); m.lashCd = Math.max(0, (m.lashCd ?? 0) - dt);
  const L = m.nodes as HNode[];
  const str = strength(c);
  n.wk = +(1 - str).toFixed(2);
  // nodes that died since (killed by a unit): cut there
  L.forEach((d, i) => { if (d.dead) return; const o = CS().creatures.get(d.id); if (!o || o.dead) cutNode(c, i, now); });
  // the rind: a whole network armours it; cut most of it and blows land
  if (ev.hurt > 0) {
    const armour = 0.7 * Math.max(0, str - 0.25) / 0.75;
    c.hp = Math.min(c.sp.hp, c.hp + ev.hurt * armour);
    if (!m.hurtCd || now > m.hurtCd) { m.hurtCd = now + 6; fx(c, 'puff', { r: 3.2, k: 1.1 }); fx(c, 'shriek'); }
    if (c.targetId) { const p = G.players.get(c.targetId); if (p) wake(c, c, p); }
  }
  if (str > 0.5) c.hp = Math.min(c.sp.hp, c.hp + dt * 1.2);
  // growth: slow, and slower the more of it has been cut
  m.growT -= dt;
  const cap = Math.min(22, 9 + Math.floor((now - c.spawnedAt) / 90));
  if (m.growT <= 0) { m.growT = rng.float(24, 40) * (1 + (1 - str)); if (L.filter((d) => !d.dead).length < cap && str > 0.2) grow(c, now); }
  // what the nodes felt
  let felt: { i: number; p: Player } | null = null;
  L.forEach((d, i) => {
    if (d.dead || felt) return;
    const o = CS().creatures.get(d.id); const s = o?.mem.sense as { pid: string; t: number } | undefined;
    if (s && now - s.t < 0.6) { const p = G.players.get(s.pid); if (p && !p.body.dead) felt = { i, p }; }
  });
  // close to the mind itself: it feels you through its roots
  for (const p of playersIn(c.zoneKey)) if (!p.body.dead && dist(p, c) < 4.2 && !felt) felt = { i: -1, p };
  if (felt && m.alertCd <= 0) {
    const f = felt as { i: number; p: Player };
    m.alertCd = ALERT_CD * (1.4 - str * 0.6);
    setMd(c, 'alert'); m.alertAt = now; m.alertNode = f.i; m.alertP = f.p.id;
    if (f.i >= 0) { n.pl = [f.i, +now.toFixed(2)]; const o = CS().creatures.get(L[f.i].id); if (o) fx(o, 'fire'); }
    fx(c, 'beat');
    for (const p of playersIn(c.zoneKey)) if (dist(p, c) < 20) ruleShown(c);
  }
  // the answer, once the signal has run home: spores at the node, everything around woken, rats out of the nodes
  if (m.alertAt && now - m.alertAt > 1.3 && !m.answered) {
    m.answered = 1;
    const p = G.players.get(m.alertP);
    const nd = m.alertNode >= 0 ? L[m.alertNode] : null;
    const at = nd && !nd.dead ? nd : { x: c.x, z: c.z };
    if (p) {
      if (nd && !nd.dead) { const o = CS().creatures.get(nd.id); if (o) fx(o, 'spore', { k: 0.6 + str * 0.6 }); }
      else fx(c, 'puff', { r: 3, k: 1 });
      wake(c, at, p);
      const want = Math.round(2 + str * 4);
      if (ratsNear(c) < want && rng.next() < 0.35 + str * 0.5) {
        let best: HNode | null = null, bd = 1e9;
        for (const d of L) if (!d.dead && !d.h) { const dd = Math.hypot(d.x - p.x, d.z - p.z); if (dd < bd && dd > 2.5) { bd = dd; best = d; } }
        const src = best ?? { x: c.x + rng.float(-2, 2), z: c.z + rng.float(-2, 2) } as any;
        const k = 1 + Math.floor(rng.next() * 2 + str);
        for (let i = 0; i < k; i++) {
          const r = CS().spawn('spore_rat', c.zoneKey, src.x + rng.float(-0.5, 0.5), src.z + rng.float(-0.5, 0.5));
          if (r) { r.mem.mind = c.id; r.mem.wake = { pid: p.id, t: now }; r.mem.hatched = now; r.home = { x: src.x, z: src.z }; }
        }
        if (best) { const o = CS().creatures.get(best.id); if (o) fx(o, 'birth'); }
      }
    }
  }
  if (m.alertAt && now - m.alertAt > 6) { m.alertAt = 0; m.answered = 0; setMd(c, ''); }
  // the lashers: a unit standing right at it gets whipped off its feet
  const near = playersIn(c.zoneKey).filter((p) => !p.body.dead && dist(p, c) < c.sp.attack!.range + 1.1).sort((a, b) => dist(a, c) - dist(b, c))[0];
  if (near && c.attackT <= 0 && m.lashCd <= 0) { n.lt = near.id; m.lashCd = 2.4; attack(c, near); c.targetFacing = c.facing; }
  void z;
  return true;
}

function thinkNode(c: Creature, dt: number): boolean {
  const m = c.mem, n = net(c), ev = pulse(c), now = G.time;
  pin(c);
  m.mdT = (m.mdT ?? 0) + dt;
  const mind = m.mind ? CS().creatures.get(m.mind) : null;
  // an orphan (its mind dead or gone): it withers
  if (!mind || mind.dead) { m.orphan = (m.orphan ?? 0) + dt; if (m.orphan > 2 + hashId(c.id) * 4) { m.wither = 1; CS().kill(c, zoneOf(c)); } return true; }
  if ((now - (n.b ?? 0)) < GROW_T) return true;
  // feel the floor: footsteps over the felt, a crouched, slow unit only right on top of it
  for (const p of playersIn(c.zoneKey)) {
    if (p.body.dead) continue;
    const d = Math.hypot(p.x - c.x, p.z - c.z);
    const r = p.stance === 'sneak' && p.speed < 1.2 ? 1.6 : p.running ? SENSE * 1.3 : SENSE;
    if (d < r) { m.sense = { pid: p.id, t: now }; n.al = +now.toFixed(1); }
  }
  if (c.lastHeard && now - c.lastHeard.t < 0.5 && c.lastHeard.r > 3) {
    const p = playersIn(c.zoneKey).find((q) => Math.hypot(q.x - c.lastHeard!.x, q.z - c.lastHeard!.z) < 2.5);
    if (p) { m.sense = { pid: p.id, t: now }; n.al = +now.toFixed(1); }
  }
  if (ev.hurt > 0) {
    if (c.targetId) { m.sense = { pid: c.targetId, t: now }; n.al = +now.toFixed(1); }
    if (!m.puffCd || now > m.puffCd) { m.puffCd = now + 4; fx(c, 'spore', { k: 0.5 }); }
  }
  return true;
}

// ------------------------------------------------------------------ animation (every peer)
function animateMind(rig: Rig, c: Creature, t: number, dt: number) {
  const K = rig as KitRig;
  const v = Math.floor(hashId(c.id) * 2);
  if (K.kit.who !== c.id) { K.kit.who = c.id; kitPersonalize(K, v); }
  kitSync(K);
  const n = netOf(c), ud = K.kit.m as Record<string, number>, now = live() ? G.time : t;
  // a rooted thing: wherever blows push the record, it stays where it grew
  rig.root.position.x = c.home.x; rig.root.position.z = c.home.z;
  rig.eyes = rig.eyes ?? [];
  const f = fxPoll(rig, c);
  if (f) {
    if (f.key === 'beat') { ud.al = 1; playAt('ix_heart', c, 1, 22, 0.55); setTimeout(() => playAt('ix_heart', c, 0.8, 22, 0.5), 380); }
    else if (f.key === 'puff') { ud.pf = 1; sporeCloud(c.zoneKey, c.x, c.z, { r: f.a.r ?? 3, k: f.a.k ?? 1, dur: 8 }); playAt('lumen_puff', c, 1, 16, 0.5); playAt('hush_inhale', c, 0.6, 14, 0.6); }
    else if (f.key === 'shriek') { ud.sh = 1; playAt('leviathan_rumble', c, 0.9, 26, 1.4); playAt('bh_gurgle', c, 0.8, 14, 0.7); }
  }
  ud.al = Math.max(0, (ud.al ?? 0) - dt * 0.18); ud.pf = Math.max(0, (ud.pf ?? 0) - dt * 0.7); ud.sh = Math.max(0, (ud.sh ?? 0) - dt * 0.8);
  if (n.md === 'alert') ud.al = Math.max(ud.al, 0.7);
  ud.dk = c.dead ? Math.min(1, (ud.dk ?? 0) + dt * 0.4) : 0;
  const ac = attackCurve(rig, c, t);
  let lyaw = 0;
  const tp = n.lt ? G.players?.get(n.lt) : null;
  if (tp) { let rel = Math.atan2(tp.z - c.z, tp.x - c.x) - c.facing; while (rel > Math.PI) rel -= Math.PI * 2; while (rel < -Math.PI) rel += Math.PI * 2; lyaw = Math.max(-1.2, Math.min(1.2, -rel)); }
  poseMind(K, { t, dt, seed: hashId(c.id, 3), alert: ud.al, weak: sm(ud, 'wk', n.wk ?? 0, 0.6, dt), dead: ud.dk, puff: ud.pf, flinch: flinchOf(c), wind: ac.wind, strike: ac.strike, lyaw, shriek: ud.sh });
  K.kit.F.fx.value.y += dt; K.kit.F.fx.value.z = Math.min(1, c.hitFlash / 0.15) * 0.35;
  uprightDead(K, c);
  // a set piece: shown whenever any of it is in view
  if (live() && G.view && !c.dead) { const vis = G.view.vis; const R = 1.4; rig.body.visible = rig.body.visible || [[R, 0], [-R, 0], [0, R], [0, -R]].some(([dx, dz]) => vis.isVisible(Math.floor(c.x + dx), Math.floor(c.z + dz))); }
  // the network
  const rows = (n.nw ?? []) as NRow[];
  if (live() && rows.length) {
    if (n.pl && n.pl[1] !== ud.plT) { ud.plT = n.pl[1]; const g = GFX.get(c.id); if (g) g.pulses.push({ i: n.pl[0], t0: n.pl[1] }); }
    syncNetwork(c, rows, now, dt);
  }
  // a wet heartbeat you can hear through the floor
  if (!c.dead && c.visibleToLocal !== undefined && (ud.hbT ?? 0) < t) { ud.hbT = t + 2.4 - ud.al * 1.2; playAt('ix_heart', c, 0.35 + ud.al * 0.4, 12, 0.45); }
  const p = localIn(c);
  if (p && !c.dead) {
    const d = dist(p, c);
    if (n.md === 'alert' && d < 18) thinkOnce(p, 'fm_alert', ['Something ran down the cords toward it. Light. Like a nerve firing.', 'It felt me. Through the floor. It KNOWS where I am.', 'It is throbbing faster. Everything around here just woke up.'][Math.floor(t) % 3], 40);
    else if ((n.wk ?? 0) > 0.6 && d < 14) thinkOnce(p, 'fm_weak', 'It has split down the middle. The rind is soft now. I can hurt it.', 60);
    else if (d < 12 && c.visibleToLocal) thinkOnce(p, 'fungus_mind', ['A brain. A black brain the size of a car, growing out of the floor. It is beating.', 'The cords. They all run back to it. The whole floor is wired into it.', 'It smells of cellars and wet bread. The air is thick with it.'][Math.floor(t * 0.1) % 3], 90);
  }
}
function animateNode(rig: Rig, c: Creature, t: number, dt: number) {
  const K = rig as KitRig;
  const v = Math.floor(hashId(c.id) * 3);
  if (K.kit.who !== c.id) { K.kit.who = c.id; kitPersonalize(K, v); }
  kitSync(K);
  const n = netOf(c), ud = K.kit.m as Record<string, number>, now = live() ? G.time : t;
  rig.root.position.x = c.home.x; rig.root.position.z = c.home.z;
  const f = fxPoll(rig, c);
  if (f) {
    if (f.key === 'spore') { ud.pf = 1; const w = n.w ? 1 : 0; sporeCloud(c.zoneKey, c.x, c.z, { r: 2.2 + (f.a.k ?? 1), k: f.a.k ?? 1, dur: 7, y: w * (n.h ?? 0) * 0.5 }); playAt('lumen_puff', c, 0.9, 14, 0.7); }
    else if (f.key === 'fire') { ud.fi = 1; playAt('ix_heart', c, 0.6, 12, 0.9); }
    else if (f.key === 'birth') { ud.pf = 1; playAt('bh_squelch', c, 0.9, 12, 0.8); playAt('cower_squeak', c, 0.6, 12, 1.3); }
  }
  ud.pf = Math.max(0, (ud.pf ?? 0) - dt * 0.8); ud.fi = Math.max(0, (ud.fi ?? 0) - dt * 0.6);
  const sense = Math.max(ud.fi, n.al && now - n.al < 2 ? 1 - (now - n.al) / 2 : 0);
  ud.dk = c.dead ? Math.min(1, (ud.dk ?? 0) + dt * 0.35) : 0;
  const grow = Math.min(1, Math.max(0, (now - (n.b ?? -99) - GROW_T * 0.8) / (GROW_T * 0.4)));
  poseNode(K, { t, dt, grow, sense, puff: ud.pf, dead: ud.dk, wall: n.w ? 1 : 0, h: n.h ?? 0, seed: hashId(c.id), flinch: flinchOf(c) }, c);
  K.kit.F.fx.value.y += dt; K.kit.F.fx.value.z = Math.min(1, c.hitFlash / 0.15) * 0.35;
  const p = localIn(c);
  if (p && !c.dead && c.visibleToLocal && dist(p, c) < 6) thinkOnce(p, 'fungus_node', ['Mushrooms, round a grey sac like a lung. The cords run out of it both ways.', 'It pulsed when I stepped on the felt. I felt it pulse.', 'If I cut these, everything past them dies. I can see the cords going back.'][Math.floor(t * 0.2) % 3], 120);
}

// ------------------------------------------------------------------ the species
const MIND = def({
  key: 'fungus_mind', name: 'Fungus Mind', code: 'FM-01 // SOVEREIGN, MYCELIAL (ROOTED, NETWORKED)', temperament: 'hazard', threat: 4,
  rule: { name: 'CUT THE CORDS', text: 'It never moves. It feels the floor through its network: walk over the cords and felt and a node fires, the mind throbs, breathes spores at you, wakes everything nearby and hatches Spore Rats from its nodes. Crouch and walk slowly and the nodes barely feel you. Kill a node and every node grown beyond it dies too. A whole network armours the mind; cut most of it and its rind splits, and then it can be killed. Do not stand next to it: it lashes.', tell: 'The cords on the floor all run one way. Toward something big that is breathing.' },
  hp: 520, walk: 0, run: 0, turn: 0.01, radius: 1.35, height: 2.0, sight: 0.1, fov: 3.1, hearing: 1.4, vibration: true,
  attack: { dmg: [7, 13], range: 2.6, cooldown: 2.4, kinds: ['bruise', 'laceration'], corrupt: 0.02, knock: 1.2 },
  zones: ['undercroft', 'tunnels', 'pools'], weight: 0, maxPerZone: 1, diet: 'none',
  flags: { attached: true },
  sounds: { idle: 'ix_heart', alert: 'ix_heart', attack: 'bh_squelch', hurt: 'bh_gurgle', death: 'leviathan_rumble' },
  scan: {
    cls: 'Sovereign / fungus, mycelial (rooted, networked)',
    notes: [
      'A fungal fruiting body shaped like a brain, two and a half metres across. It beats.',
      'Its network runs through the floors and walls of the rooms around it: cords, felt, nodes.',
      'The nodes feel footsteps. A node that fires calls spores, rats and anything else nearby.',
      'Killing a node kills the network beyond it. Cut enough of it and the mind can be hurt.',
    ],
  },
  remains: 'decal_mold',
  gore: { blood: 'dark', tint: 0x4a3058, flesh: 0x2a2030, sever: ['st0b', 'st1b', 'st2b', 'st3b', 'st4b', 'st5b', 'tL2', 'tR2'], gib: false },
  build: () => buildFungusMind(0), animate: animateMind, think: thinkMind,
});
(MIND as any).handlesSevered = true;
const NODE = def({
  key: 'fungus_node', name: 'Mind Node', code: 'FM-01n // SOVEREIGN, MYCELIAL (FRUITING NODE)', temperament: 'hazard', threat: 1,
  rule: { name: 'IT FEELS THE FLOOR', text: 'A node of a Fungus Mind\'s network. It cannot hurt you, but it feels you walk past and tells the mind. Crouch and walk slowly. Kill it and every node grown beyond it dies with it.', tell: 'Mushrooms round a grey sac, and cords running out of them across the floor.' },
  hp: 22, walk: 0, run: 0, turn: 0.01, radius: 0.3, height: 0.4, sight: 0.1, fov: 3.1, hearing: 1.6, vibration: true,
  zones: [], weight: 0, diet: 'none',
  flags: { attached: true },
  sounds: { hurt: 'bh_squelch', death: 'bh_plop' },
  scan: { cls: 'Sovereign / fungus, mycelial (fruiting node)', notes: ['A cluster of ink caps and bracket shelves round a pitted puffball.', 'Cords run from it back toward a Fungus Mind, and on to further nodes.', 'It senses footsteps on the felt and fires a signal home.', 'Kill it to cut the network: the nodes beyond it wither.'] },
  meat: [['ink_cap', 2]],
  remains: 'decal_mold',
  gore: { blood: 'dark', tint: 0x6a5a7a, flesh: 0xb8a8c0, sever: ['f0b', 'f1b', 'f2b', 'f3b', 'f4b'], gib: false },
  build: () => buildFungusNode(0), animate: animateNode, think: thinkNode,
});
(NODE as any).handlesSevered = true;
// a killed node bursts (unless it withered with its network: those just go grey)
onKilled('fungus_node', (c) => { if (!c.mem.wither) fx(c, 'spore', { k: 0.5 }); });
onKilled('fungus_mind', (c) => {
  const L = (c.mem.nodes ?? []) as HNode[];
  const now = G.time;
  L.forEach((d, i) => { if (d.dead) return; d.dead = now + i * 0.25; const o = CS().creatures.get(d.id); if (o) setTimeout(() => { if (!o.dead && CS().creatures.has(o.id)) { o.mem.wither = 1; CS().kill(o, zoneOf(o)); } }, i * 250); });
  publish(c);
  fx(c, 'puff', { r: 4.5, k: 1.3 }); fx(c, 'shriek');
  MIND_GONE.add(c.zoneKey);
});

// ------------------------------------------------------------------ where it grows: one per damp level, in a dark room
const MIND_LEVELS: Record<string, (type: string) => boolean> = {
  undercroft: () => true,
  tunnels: (t) => t !== 'tunnel' && t !== 'stairs' && t !== 'lab_door' && t !== 'tunnel_loop',
  pools: (t) => t === 'pumps' || t === 'service',
};
function clearAround(z: Zone, x: number, y: number, r: number) {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const tx = x + dx, ty = y + dy;
    if (!z.inb(tx, ty)) return false;
    const i = z.idx(tx, ty);
    if (!z.floor[i] || z.solid[i] || (z.tileObjs.get(i)?.length ?? 0) > 0) return false;
    if (Math.abs(z.height[i] - z.height[z.idx(x, y)]) > 1) return false;
    if (dx && dy && (Math.abs(dx) < r || Math.abs(dy) < r) && (z.wallN[i] || z.wallW[i])) return false;
  }
  return true;
}
bus.on('zoneGenerated', (z: Zone) => {
  const ok = MIND_LEVELS[z.key];
  if (!ok || z.meta.fungusMind) return;
  const R = new Rng((z.seed ^ 0x5f3a) >>> 0);
  let best: [number, number] | null = null, bs = -1e9;
  // a dark room well away from the ways in; failing that (crowded levels), anywhere clear enough
  for (let k = 0; k < 1800 && !(k >= 900 && best && k % 900 === 0); k++) {
    const strict = k < 900;
    if (!strict && best) break;
    const x = 4 + Math.floor(R.next() * (z.W - 8)), y = 4 + Math.floor(R.next() * (z.H - 8));
    const rid = z.room[z.idx(x, y)], room = z.rooms[rid];
    if (!room || (strict && !ok(room.type)) || /arrival|exit|reception|stairs|lab_door/.test(room.type)) continue;
    if (!clearAround(z, x, y, 2)) continue;
    let dark = 0; for (const l of z.lights) { const d = Math.hypot(l.x - x, l.z - y); if (d < l.radius) dark -= (1 - d / l.radius) * l.intensity; }
    let far = 1e9; for (const p of z.portals) far = Math.min(far, Math.hypot(p.x - x, p.y - y));
    if (far < (strict ? 14 : 7)) continue;
    const s = dark * 6 + Math.min(far, 40) * 0.2 + R.next() * 2;
    if (s > bs) { bs = s; best = [x, y]; }
  }
  if (!best) return;
  z.meta.fungusMind = [best[0] + 0.5, best[1] + 0.5];
  // it is a thing you walk round, not through
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) z.solid[z.idx(best[0] + dx, best[1] + dy)] = 1;
});
const MIND_GONE = new Set<string>();
let mindSys = false;
bus.on('enterZone', () => {
  const g: any = G;
  if (mindSys || !g?.addSystem) return;
  mindSys = true;
  let acc = 0;
  g.addSystem({
    name: 'fungusMinds',
    update: (dt: number) => {
      acc += dt; if (acc < 2) return; acc = 0;
      if (G.role === 'client' || !G.creatures) return;
      const zs = new Set<string>(); for (const p of G.players.values()) zs.add(p.zoneKey);
      for (const zk of zs) {
        const z = G.zones.get(zk) as Zone | undefined;
        const at = z?.meta?.fungusMind as [number, number] | undefined;
        if (!z || !at || MIND_GONE.has(zk) || mindOf(zk)) continue;
        if (CS().creatures && [...CS().creatures.values()].some((o) => o.zoneKey === zk && o.sp.key === 'fungus_mind')) continue;
        const c = CS().spawn('fungus_mind', zk, at[0], at[1]);
        if (c) { c.mem.persistent = true; c.mem.noCap = 1; c.facing = c.targetFacing = hashId(zk) * Math.PI * 2; }
      }
    },
  });
});

// ------------------------------------------------------------------ stand-alone posing (gallery, the video)
export type FungusMindPose = 'idle' | 'throb' | 'alert' | 'spore' | 'lash' | 'weak' | 'dead';
/** animate a mind rig with no game running (call every frame with a running clock); 'lash' strikes every 3 s */
export function poseFungusMind(rig: KitRig, t: number, dt: number, pose: FungusMindPose = 'idle', o: { weak?: number; lashT?: number; lookYaw?: number; variant?: number } = {}) {
  if (o.variant !== undefined && rig.kit.entry.variant !== o.variant) kitPersonalize(rig, o.variant);
  kitSync(rig);
  const lt = o.lashT ?? (t % 3);
  const wind = pose === 'lash' ? (lt < 0.9 ? Math.sin((lt / 0.9) * Math.PI * 0.5) : Math.max(0, 1 - (lt - 0.9) / 0.25)) : 0;
  const strike = pose === 'lash' ? (lt > 0.85 && lt < 1.8 ? Math.min(1, (lt - 0.85) / 0.15) * (1 - Math.max(0, lt - 1.2) / 0.6) : 0) : 0;
  const puff = pose === 'spore' ? Math.max(0, 1 - (t % 3) / 1.4) : 0;
  poseMind(rig, { t, dt, seed: 0.3, alert: pose === 'alert' || pose === 'lash' || pose === 'spore' ? 1 : pose === 'throb' ? 0.5 : 0, weak: o.weak ?? (pose === 'weak' ? 1 : 0), dead: pose === 'dead' ? 1 : 0, puff, flinch: 0, wind, strike, lyaw: o.lookYaw ?? 0, shriek: pose === 'weak' ? 0.3 + 0.3 * Math.sin(t * 3) : 0 });
  rig.kit.F.fx.value.y += dt;
}
export type FungusNodePose = 'idle' | 'sense' | 'spore' | 'grow' | 'wall' | 'dead';
/** animate a node rig with no game running; 'grow' loops a fruiting every 4 s */
export function poseFungusNode(rig: KitRig, t: number, dt: number, pose: FungusNodePose = 'idle', o: { grow?: number; wall?: number; h?: number; variant?: number } = {}) {
  if (o.variant !== undefined && rig.kit.entry.variant !== o.variant) kitPersonalize(rig, o.variant);
  kitSync(rig);
  const wall = o.wall ?? (pose === 'wall' ? 1 : 0);
  poseNode(rig, { t, dt, grow: o.grow ?? (pose === 'grow' ? Math.min(1, (t % 4) / 2.5) : 1), sense: pose === 'sense' ? 1 : 0, puff: pose === 'spore' ? Math.max(0, 1 - (t % 2.5) / 1.2) : 0, dead: pose === 'dead' ? 1 : 0, wall, h: o.h ?? 1.2, seed: 0.4, flinch: 0 });
  rig.kit.F.fx.value.y += dt;
}
MIND.animateGallery = (rig: Rig, t: number) => {
  const u = new URLSearchParams(location.search);
  const q = (u.get('pose') || ['idle', 'alert', 'spore', 'lash', 'weak'][Math.floor(t / 5) % 5]) as FungusMindPose;
  const K = rig as KitRig;
  if (u.get('net') !== '0' && !K.kit.m.demo) { K.kit.m.demo = 1; rig.root.add(demoNetwork(1)); }
  poseFungusMind(K, t, 1 / 60, q, { weak: u.get('weak') !== null ? Number(u.get('weak')) : undefined });
};
NODE.animateGallery = (rig: Rig, t: number) => {
  const u = new URLSearchParams(location.search);
  const q = (u.get('pose') || ['idle', 'sense', 'spore', 'grow', 'wall'][Math.floor(t / 4) % 5]) as FungusNodePose;
  poseFungusNode(rig as KitRig, t, 1 / 60, q, { variant: u.get('v') !== null ? Number(u.get('v')) : undefined });
};
void THREE; void sm;
