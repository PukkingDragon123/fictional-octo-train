import { horrify } from '../kit/horror';
import { def, Rig } from '../species';
import { makeRamp, mixHex } from '../../gfx/pixel';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import type { Creature } from '../creature';
import type { Player } from '../../entities/player';
import { CS, zoneOf, pulse, stop, walkable } from '../behaviors_a';
import { net, netOf, playAt, hashId, fakeCreature, rng, localIn, thinkOnce, dist, playersIn, live, lineOfSightB } from '../behaviors_b';
import { KitDef, KitRig, BoneSpec, SkinB, BuildCtx, Page, V3, Wt, buildKitRig, kitSync, hash, gauss, nearestSurvivor, lookAngles } from '../kit/humanoids';
import { chain, sac, blade, plate, paintSkin, paintCap, paintCloth } from '../kit/organic';
import { INHABITANTS } from '../lore';
import { revealAll } from '../../scan/lorebook';
import '../../audio/sounds_creatures_c';

// =====================================================================================
// THE KING IN YELLOW — a vast octopoid shape draped in tattered yellow, seated
// on a throne of its own coiled arms, its face behind a pallid mask. It does
// not hunt. It waits to be seen. Now and then it lifts the mask: whoever looks
// it in the face understands everything, all at once (every inhabitant's lore,
// every rule), and does not survive the understanding. Turn away. The camera
// pulls aside for you; the rest is up to you.
// =====================================================================================

const ARMS = 8;
const ARM_SEG = 5;
/** an arm's joint path (model space): out from under the robe, coiling across the floor; the two front arms rise over it like the arms of a throne */
function armPath(i: number): V3[] {
  const th = (i / ARMS) * Math.PI * 2 + Math.PI / ARMS;
  const front = i === 0 || i === ARMS - 1;
  const curl = i % 2 ? 1 : -1;
  const pts: V3[] = [];
  for (let j = 0; j <= ARM_SEG; j++) {
    const r = 0.75 + j * (front ? 0.28 : 0.36);
    const a = th + curl * j * j * 0.075;
    let y = front ? [0.5, 0.95, 1.15, 1.02, 0.75, 0.55][j] : [0.38, 0.24, 0.2, 0.15, 0.13, 0.3][j];
    if (!front && j === ARM_SEG) y = 0.22 + hash(i, 3) * 0.2;
    pts.push([Math.sin(a) * r, y, Math.cos(a) * r]);
  }
  return pts;
}
const TATTERS = 9;
const FEEL = 6;
function bonesK(): BoneSpec[] {
  const b: BoneSpec[] = [
    { name: 'base', parent: '', at: [0, 0.5, 0] },
    { name: 'body', parent: 'base', at: [0, 0.5, -0.05] },
    { name: 'chest', parent: 'body', at: [0, 0.7, 0.0] },
    { name: 'hood', parent: 'chest', at: [0, 0.75, 0.02], cap: true },
    { name: 'mask', parent: 'hood', at: [0, 0.27, 0.36] },
    { name: 'face', parent: 'hood', at: [0, -0.04, 0.24] },
    { name: 'crown', parent: 'hood', at: [0, 0.85, -0.82] },
  ];
  for (let i = 0; i < ARMS; i++) {
    const P = armPath(i);
    for (let j = 0; j < ARM_SEG; j++) {
      const at: V3 = j === 0 ? [P[0][0], P[0][1] - 0.5, P[0][2]] : [P[j][0] - P[j - 1][0], P[j][1] - P[j - 1][1], P[j][2] - P[j - 1][2]];
      b.push({ name: `a${i}_${j}`, parent: j === 0 ? 'base' : `a${i}_${j - 1}`, at, cap: true });
    }
  }
  for (let i = 0; i < TATTERS; i++) {
    const a = (i / TATTERS) * Math.PI * 2 + 0.35;
    b.push({ name: 'r' + i, parent: 'chest', at: [Math.sin(a) * 0.5, -0.15, Math.cos(a) * 0.45] }, { name: 'r' + i + 'b', parent: 'r' + i, at: [Math.sin(a) * 0.12, -0.65, Math.cos(a) * 0.1] });
  }
  for (let i = 0; i < FEEL; i++) {
    const x = (i / (FEEL - 1) - 0.5) * 0.22;
    b.push({ name: 'f' + i, parent: 'hood', at: [x, -0.24, 0.24 - Math.abs(x) * 0.4] }, { name: 'f' + i + 'b', parent: 'f' + i, at: [x * 0.3, -0.18, 0.03] });
  }
  return b;
}
function layoutK(p: Page) {
  p.reg('ROBE', 96, 80); p.reg('TATTER', 32, 80); p.reg('ARM', 48, 64); p.reg('MASK', 32, 40); p.reg('MANTLE', 64, 48);
  p.reg('FACE', 24, 24); p.reg('EYE', 8, 8); p.reg('CROWN', 24, 16); p.reg('FEEL', 8, 32); p.reg('CAP', 16, 16); p.reg('BEAK', 8, 8);
}
function buildK(B: SkinB, x: BuildCtx) {
  const bi = x.bi, R = x.R;
  const BA = bi('base'), BO = bi('body'), CH = bi('chest'), HD = bi('hood'), MK = bi('mask'), FC = bi('face'), CR = bi('crown');
  // the robed mass: a wide hem, a bowed chest, broad shoulders, the hood; a cowl opening in front
  const prof: [number, number, number, number][] = [
    [0.04, 1.28, 1.12, 0], [0.25, 1.22, 1.08, 0], [0.6, 1.06, 0.96, 0], [1.0, 0.94, 0.82, 0], [1.4, 0.9, 0.72, 0.02], [1.75, 0.94, 0.64, 0.0],
    [1.98, 0.64, 0.52, -0.02], [2.15, 0.43, 0.43, -0.03], [2.4, 0.45, 0.47, -0.05], [2.62, 0.41, 0.43, -0.07], [2.78, 0.31, 0.33, -0.08], [2.88, 0.1, 0.12, -0.08],
  ];
  const wOf = (y: number): Wt => (y < 0.7 ? [BA, 1] : y < 1.2 ? [BA, 1 - (y - 0.7) / 0.5, BO, (y - 0.7) / 0.5] : y < 1.6 ? [BO, 1 - (y - 1.2) / 0.4, CH, (y - 1.2) / 0.4] : y < 2.2 ? [CH, 1 - (y - 1.6) / 0.6, HD, (y - 1.6) / 0.6] : [HD, 1]);
  sac(B, R('ROBE'), 1, prof.map(([y, , , z]) => [0, y, z] as V3), prof.map(([, rx, rz]) => [rx, rz] as [number, number]), prof.map(([y]) => wOf(y)), {
    n: 22, up: [0, 0, 1], start: false,
    bump: (a, t) => Math.sin(a * 7 + t * 4) * 0.03 * (1 - t) + (t < 0.08 ? Math.sin(a * 13) * 0.08 : 0) - 0.5 * Math.exp(-(a * a) / 0.3) * gauss(t, 0.74, 0.075),
  });
  // the mantle: a vast swollen sack of skin rising and leaning back out of the hood, an octopus's head under a man's hood
  sac(B, R('MANTLE'), 50, [[0, 2.32, -0.12], [0, 2.62, -0.3], [0, 2.94, -0.52], [0, 3.22, -0.74], [0, 3.42, -0.92], [0, 3.52, -1.02]],
    [[0.36, 0.36], [0.58, 0.54], [0.68, 0.62], [0.64, 0.58], [0.48, 0.44], [0.18, 0.17]], [[HD, 1], [HD, 1], [HD, 1], [HD, 1], [HD, 1], [HD, 1]],
    { n: 16, up: [0, 0, 1], bump: (a, t) => Math.sin(a * 3 + t * 9) * 0.05 + Math.sin(t * 30 + a) * 0.015 });
  // tatters: long ragged strips hanging from the shoulders to the floor, over the robe
  for (let i = 0; i < TATTERS; i++) {
    const a = (i / TATTERS) * Math.PI * 2 + 0.35;
    const dir: V3 = [Math.sin(a), 0, Math.cos(a)], side: V3 = [Math.cos(a), 0, -Math.sin(a)];
    const at = (y: number, r: number): V3 => [dir[0] * r, y, dir[2] * r];
    const R0 = bi('r' + i), R1 = bi('r' + i + 'b');
    blade(B, R('TATTER'), [at(1.72, 0.74), at(1.3, 0.93), at(0.85, 1.02), at(0.4, 1.18), at(0.02, 1.34 + hash(i, 2) * 0.12)], [0.14, 0.2, 0.26, 0.3, 0.34], side,
      [[CH, 0.5, R0, 0.5], [R0, 1], [R0, 0.5, R1, 0.5], [R1, 1], [R1, 1]], { offset: -0.5, edge: 0.6, seed: i * 3 + 1 });
  }
  for (let i = 0; i < 3; i++) {
    const x0 = (i - 1) * 0.3;
    blade(B, R('TATTER'), [[x0, 3.3, -0.98], [x0 * 1.3, 2.9, -1.1], [x0 * 1.5, 2.2, -1.05], [x0 * 1.7, 1.4, -1.0], [x0 * 1.9, 0.5, -1.25], [x0 * 2, 0.02, -1.45]], [0.12, 0.2, 0.24, 0.28, 0.3, 0.32], [1, 0, 0], [[HD, 1], [HD, 1], [HD, 0.5, CH, 0.5], [CH, 1], [BO, 1], [BA, 1]], { offset: -0.5, edge: 0.5, seed: 50 + i });
  }
  // the pallid mask: a smooth, faintly convex oval, hinged at its top edge
  plate(B, R('MASK'), 2, [0, 2.42, 0.4], [1, 0, 0], [0, 1, 0], 0.21, 0.29, 0.07, [MK, 1], { rows: 8, cols: 6 });
  // the face behind it: a wet dark disc of skin, too many golden eyes, the hard beak
  plate(B, R('FACE'), 3, [0, 2.42, 0.31], [1, 0, 0], [0, 1, 0], 0.2, 0.24, 0.06, [FC, 1], { rows: 6, cols: 6 });
  for (let e = 0; e < 11; e++) {
    const a = e * 2.399, r = Math.sqrt(e / 11) * 0.16, s = 0.012 + hash(e, 2) * 0.022;
    const c: V3 = [Math.cos(a) * r * 0.85, 2.44 + Math.sin(a) * r, 0.36 + 0.03 * (1 - r / 0.16)];
    sac(B, R('EYE'), 4 + e, [[c[0], c[1], c[2] - s], [c[0], c[1], c[2]], [c[0], c[1], c[2] + s * 0.7]], [[s * 0.7, s * 0.7], [s, s], [s * 0.4, s * 0.4]], [[FC, 1], [FC, 1], [FC, 1]], { n: 7, emis: 1.3 });
  }
  for (const k of [1, -1]) sac(B, R('BEAK'), 20, [[k * 0.02, 2.3, 0.33], [k * 0.015, 2.27, 0.38], [k * 0.004, 2.22, 0.39]], [[0.035, 0.03], [0.02, 0.018], [0.003, 0.003]], [[FC, 1], [FC, 1], [FC, 1]], { n: 6 });
  // the crown: a tarnished band and bent spikes, jammed down over the crest of the mantle
  const cc: V3 = [0, 3.3, -0.8], ax: V3 = [0, 0.8, -0.6], ux: V3 = [1, 0, 0], vx: V3 = [0, 0.6, 0.8];
  const band: V3[] = [], bw: Wt[] = [], br: [number, number][] = [];
  const onRing = (a: number, r: number, h: number): V3 => [cc[0] + ux[0] * Math.sin(a) * r + vx[0] * Math.cos(a) * r + ax[0] * h, cc[1] + ux[1] * Math.sin(a) * r + vx[1] * Math.cos(a) * r + ax[1] * h, cc[2] + ux[2] * Math.sin(a) * r + vx[2] * Math.cos(a) * r + ax[2] * h];
  for (let i = 0; i <= 18; i++) { const a = (i / 18) * Math.PI * 2; band.push(onRing(a, 0.47, Math.sin(a * 3) * 0.015)); bw.push([CR, 1]); br.push([0.028, 0.06]); }
  sac(B, R('CROWN'), 30, band, br, bw, { n: 5, start: false, end: false });
  for (let s = 0; s < 9; s++) {
    const a = (s / 9) * Math.PI * 2 + 0.2, L = 0.25 + hash(s, 7) * 0.3, lean = 0.15 + hash(s, 8) * 0.35;
    const b0 = onRing(a, 0.47, 0.03), b1 = onRing(a, 0.47 + lean * 0.2, L * 0.55), b2 = onRing(a + (hash(s, 9) - 0.5) * 0.3, 0.47 + lean * 0.45, L);
    sac(B, R('CROWN'), 31 + s, [b0, b1, b2], [[0.038, 0.03], [0.02, 0.017], [0.002, 0.002]], [[CR, 1], [CR, 1], [CR, 1]], { n: 5, start: false });
  }
  // eight great arms out from under the hem, suckers beneath
  for (let i = 0; i < ARMS; i++) {
    const P = armPath(i);
    chain(B, x, R('ARM'), 40 + i, {
      bones: Array.from({ length: ARM_SEG }, (_, j) => `a${i}_${j}`), tip: P[ARM_SEG], r: (t) => 0.3 * Math.pow(1 - t, 0.95) + 0.014, n: 10, rings: 4, up: [0, 1, 0],
      bump: (a, t) => (Math.abs(a) > 2.1 ? Math.max(0, Math.sin(t * 110)) * 0.16 : 0) + Math.sin(a * 2 + t * 20) * 0.03,
      bend: (j) => { const q = P[j], r = P[j + 1]; const dx = r[0] - q[0], dz = r[2] - q[2], l = Math.hypot(dx, dz) || 1; const k = ((j + i) % 2 ? 1 : -1) * 0.09; return [(-dz / l) * k, j === 0 ? 0.05 : 0.02, (dx / l) * k]; },
    });
  }
  // feelers under the mask's chin, a beard that moves
  for (let i = 0; i < FEEL; i++) chain(B, x, R('FEEL'), 60 + i, { bones: ['f' + i, 'f' + i + 'b'], tipLen: 0.24, r: [0.028, 0.004], n: 5, rings: 3 });
}
function paintK(p: Page) {
  // the yellow: old silk the colour of mustard and jaundice, folds, rot and holes
  const YE = makeRamp(0xc89a1c, 8, { hueShift: 0.06, spread: 0.95 });
  const robe = p.R('ROBE');
  paintCloth(robe, YE, { seed: 3, folds: 6, holes: 22, hole: 0x1a1006, stain: 18, base: 3.8 });
  for (let i = 0; i < 40; i++) robe.crack(hash(i, 21) * robe.w, hash(i, 22) * robe.h, 10 + (i % 7), 80 + hash(i, 23) * 20, YE[1], i + 7, 0.5, 0.1);
  // the hem dark with damp, the cowl a black hollow
  for (let yy = 0; yy < robe.h * 0.25; yy++) for (let xx = 0; xx < robe.w; xx++) robe.blend(xx, yy, 0x3a2a0a, 0.55 * (1 - yy / (robe.h * 0.25)));
  robe.ellipse(robe.w * 0.5, robe.h * 0.74, robe.w * 0.12, robe.h * 0.13, 0x080604, 1);
  robe.ellipse(robe.w * 0.5, robe.h * 0.74, robe.w * 0.16, robe.h * 0.17, 0x1a1006, 0.6);
  const tat = p.R('TATTER');
  paintCloth(tat, YE, { seed: 7, folds: 3, holes: 10, hole: 0x1a1006, stain: 6, base: 3.6 });
  for (let i = 0; i < 16; i++) tat.crack(hash(i, 31) * tat.w, hash(i, 32) * tat.h, 14, 90, YE[1], i + 3, 0.5, 0.1);
  // arms: pale jaundiced skin, mottled darker along the top, a double row of suckers beneath
  const SK = makeRamp(0x5a4658, 7, { hueShift: -0.08, spread: 0.9 });
  const arm = p.R('ARM');
  paintSkin(arm, SK, { seed: 9, veins: 14, vein: 0xb8901a, mottle: 2.4, glint: 24, spots: 46, spot: 0xc8a040 });
  // the underside (the seam runs beneath): jaundiced, with a double row of pale suckers
  for (let yy = 0; yy < arm.h; yy++) for (let xx = 0; xx < arm.w; xx++) { const a = Math.abs(arm.deg(xx)); if (a > 125) arm.blend(xx, yy, 0xc8b078, Math.min(0.85, (a - 125) / 30)); }
  for (let yy = 1; yy < arm.h; yy += 3) for (const u of [0.04, 0.96]) { arm.ellipse(u * arm.w, yy, 2.2, 1.4, 0xf0e4c8, 1); arm.set(Math.round(u * arm.w), yy, 0x8a4a4a); }
  // the mask: porcelain-pale, crazed, two narrow slits for eyes and nothing else
  const mk = p.R('MASK');
  mk.fill(makeRamp(0xe8e2d4, 6, { spread: 0.5 }), (xx, yy) => 3.6 - Math.abs(xx - mk.w / 2) / mk.w * 2 - (yy / mk.h) * 0.6 + (mk.fbm(xx, yy, 3, 2, 4) - 0.5) * 0.5);
  for (let i = 0; i < 9; i++) mk.crack(hash(i, 4) * mk.w, hash(i, 5) * mk.h, 6 + i, hash(i, 6) * 360, 0xa8a090, i + 3, 0.6, 0.2);
  for (const k of [-1, 1]) { mk.hline(mk.w / 2 + k * 3, mk.w / 2 + k * 9, mk.h * 0.36, 0x0a0806); mk.hline(mk.w / 2 + k * 4, mk.w / 2 + k * 8, mk.h * 0.36 + 1, 0x2a2420); }
  // the face: wet black-violet skin, gold veining
  const fc = p.R('FACE');
  paintSkin(fc, makeRamp(0x2a1a2a, 6, { spread: 0.7 }), { seed: 13, veins: 12, vein: 0xc8a020, glint: 10 });
  const ey = p.R('EYE');
  for (let yy = 0; yy < ey.h; yy++) for (let xx = 0; xx < ey.w; xx++) { const d = Math.hypot(xx + 0.5 - 4, yy + 0.5 - 4) / 4; ey.set(xx, yy, Math.abs(xx + 0.5 - 4) < 0.7 && d < 0.8 ? 0x2a1800 : d < 0.55 ? 0xfff6a0 : d < 0.85 ? 0xf0c020 : 0x8a5a08); }
  p.R('BEAK').fill(makeRamp(0x1a1410, 4), (xx, yy) => 1.5 + (yy & 1));
  const cr = p.R('CROWN');
  cr.fill(makeRamp(0x9a7a28, 6, { hueShift: 0.05, spread: 0.85 }), (xx, yy) => 3 + Math.cos((cr.deg(xx) * Math.PI) / 180) * 1.5 + (cr.fbm(xx, yy, 2, 2, 5) - 0.5) * 1.6 + (hash(xx, yy) < 0.1 ? -2 : 0));
  for (let i = 0; i < 12; i++) cr.blend(hash(i, 2) * cr.w, hash(i, 3) * cr.h, 0x3a5a3a, 0.6); // verdigris
  paintSkin(p.R('FEEL'), SK, { seed: 15, veins: 3, vein: 0x6a4a3a });
  // the mantle: the same skin, swollen, veined gold, blotched like a bruise
  const mt = p.R('MANTLE');
  paintSkin(mt, makeRamp(0x8a6670, 8, { hueShift: -0.08, spread: 0.8 }), { seed: 17, veins: 30, vein: 0x4a2a3a, mottle: 1.3, glint: 40 });
  for (let i = 0; i < 14; i++) mt.crack(hash(i, 41) * mt.w, hash(i, 42) * mt.h, 12, 60 + hash(i, 43) * 60, 0xc8a020, i + 11, 0.7, 0.3);
  paintCap(p.R('CAP'), SK[1], 0xd8b84a, 0x3a2a08);
}
const KING_KIT: KitDef = { key: 'king_in_yellow', variants: 1, W: 256, H: 256, bones: bonesK, layout: layoutK, build: buildK, paint: paintK, sphere: [0, 1.5, 0, 3.4] };
function buildKing(): Rig { return buildKitRig(KING_KIT, 0, 2.6); }

// ------------------------------------------------------------------ animation (every peer) and the gaze (the local operator)
function animateKing(rig: Rig, c: Creature, t: number, dt: number) {
  const K = rig as KitRig;
  kitSync(K);
  const P = rig.parts;
  const R = (n: string, x: number, y = 0, z = 0) => { const o = P[n]; if (o) o.rotation.set(x, y, z); };
  const ud = rig.root.userData as Record<string, number>;
  const n = netOf(c);
  const seed = hashId(c.id);
  const want = n.u !== undefined ? Number(n.u) || 0 : c.state === 'warn' ? 1 : 0; // (studio: 'warn' shows it unveiled)
  const u = (ud.u = (ud.u ?? want) + (want - (ud.u ?? want)) * Math.min(1, dt * 2.5));
  // slow breath of the whole mass; the hood leans, very slowly, toward whoever is nearest
  const br = Math.sin(t * 0.55 + seed * 6);
  const ch = P.chest; if (ch) ch.scale.set(1 + br * 0.025, 1 + br * 0.015, 1 + br * 0.025);
  const tgt = nearestSurvivor(c, 22);
  let yaw = 0, pitch = 0;
  if (tgt) [yaw, pitch] = lookAngles(c, tgt.x, tgt.z, tgt.y, 2.5, 0.7, 0.4);
  ud.yaw = (ud.yaw ?? 0) + (yaw - (ud.yaw ?? 0)) * Math.min(1, dt * 0.25);
  R('body', 0.04 + br * 0.01, ud.yaw * 0.3, 0);
  R('chest', 0.06 + u * 0.12, ud.yaw * 0.3, Math.sin(t * 0.3) * 0.02);
  R('hood', 0.1 - pitch * 0.3 + u * 0.1, ud.yaw * 0.4, Math.sin(t * 0.21 + seed) * 0.05);
  // the mask lifts from its top edge; the face's eyes open wide and swell
  // lifted from its top edge back over the brow, as you would push up a visor
  R('mask', u * 1.65, 0, u * 0.1);
  const fc = P.face; if (fc) { const s = 0.7 + u * 0.35 + Math.sin(t * 7) * 0.02 * u; fc.scale.setScalar(s); }
  R('crown', Math.sin(t * 0.4) * 0.02, 0, 0);
  // arms: slow travelling waves; the floor ones coil and uncoil, the throne ones flex their tips; all of them reach a little when it unveils
  for (let i = 0; i < ARMS; i++) {
    const front = i === 0 || i === ARMS - 1;
    for (let j = 0; j < ARM_SEG; j++) {
      const w = Math.sin(t * (0.55 + (i % 3) * 0.12) - j * 0.85 + i * 1.7 + seed * 5);
      const w2 = Math.cos(t * 0.43 - j * 0.6 + i * 2.3);
      const amp = (front ? 0.05 : 0.12) * (0.5 + j * 0.25);
      R(`a${i}_${j}`, w2 * amp * 0.6 - (front ? 0 : u * 0.06 * j), w * amp, w2 * amp * 0.3);
    }
  }
  for (let i = 0; i < TATTERS; i++) {
    R('r' + i, Math.sin(t * 0.7 + i * 1.3) * 0.05, 0, Math.sin(t * 0.5 + i) * 0.04);
    R('r' + i + 'b', Math.sin(t * 0.9 + i * 2.1) * 0.08 + u * 0.1, 0, Math.cos(t * 0.6 + i) * 0.06);
  }
  for (let i = 0; i < FEEL; i++) {
    R('f' + i, Math.sin(t * 1.7 + i * 1.1) * 0.25 - u * 0.4, Math.sin(t * 1.1 + i) * 0.2, Math.cos(t * 1.4 + i * 2) * 0.15);
    R('f' + i + 'b', Math.sin(t * 2.6 + i * 1.9) * 0.4, 0, Math.sin(t * 2.1 + i) * 0.3);
  }
  const F = K.kit.F.fx.value; F.y += dt; F.z = Math.min(1, c.hitFlash / 0.15) * 0.3;
  // a glow under the hood when it unveils (tinted gold, flickering like a candle)
  if (live() && u > 0.05 && G.view?.zone?.key === c.zoneKey) {
    const fx_ = Math.cos(c.facing), fz_ = Math.sin(c.facing);
    G.pointLight?.(c.x + fx_ * 0.9, 2.3, c.z + fz_ * 0.9, 0xffc840, u * (1.1 + Math.sin(t * 13) * 0.1), 7);
  }
  gaze(c, u, t, dt);
}

/** the local operator and the King's face */
function gaze(c: Creature, u: number, t: number, dt: number) {
  const p = localIn(c);
  const m = c.mem;
  if (!p || p.body.dead) { veil(0, t); return; }
  const dx = c.x - p.x, dz = c.z - p.z, d = Math.hypot(dx, dz);
  const toward = Math.atan2(dz, dx);
  let off = p.facing - toward; while (off > Math.PI) off -= Math.PI * 2; while (off < -Math.PI) off += Math.PI * 2;
  const z = live() ? zoneOf(c) : null;
  const sight = d < 18 && !!z && lineOfSightB(z, p.x, p.z, c.x, c.z);
  const looking = sight && Math.abs(off) < 0.62 && u > 0.55;
  // the camera pulls aside while the mask is up (once per unveiling), and comes back when it falls
  if (u > 0.08 && sight && !m.camAside) { m.camAside = Math.sign(off || 1); G.camera?.orbitBy?.(0.42 * m.camAside, 0); }
  if (u < 0.05 && m.camAside) { m.camAside = 0; G.camera?.endOrbit?.(); }
  // dread before anything: you know you must not look
  if (sight && d < 20) {
    p.body.stress = Math.min(100, p.body.stress + dt * (1 + u * 6));
    if (u > 0.05) thinkOnce(p, 'kiy_warn', ['It is lifting the mask. DO NOT LOOK.', 'Look at the floor. Look at the floor. Look at the floor.', 'Turn away. Turn AWAY.'][Math.floor(t * 0.3) % 3], 12);
    else thinkOnce(p, 'kiy', ['Yellow. So much yellow. It is sitting very still.', 'Do not look at its face. Everyone knows that. Who told me that?'][Math.floor(t * 0.2) % 2], 60);
  }
  const was = m.beheld ?? 0;
  m.beheld = looking ? was + dt / 2.4 : Math.max(0, was - dt * (Math.abs(off) > 1.6 ? 0.9 : 0.35));
  const g = m.beheld as number;
  if (g > 0) {
    G.pr.fx.desat = Math.max(G.pr.fx.desat ?? 0, g * 0.6);
    G.pr.fx.wobble = Math.max(G.pr.fx.wobble ?? 0, g * 0.8);
    G.pr.fx.glitch = Math.max(G.pr.fx.glitch ?? 0, g > 0.7 ? (g - 0.7) * 1.5 : 0);
    if (Math.floor(t * 2) !== Math.floor((t - dt) * 2)) G.audio?.flat?.('heartbeat', 'sfx', 0.3 + g * 0.6, 1 + g * 0.8);
  }
  veil(g, t);
  if (g >= 1 && !m.knew) { m.knew = true; know(c, p); }
}

// ------------------------------------------------------------------ the veil: yellow creeping in, knowledge typed across the picture
let veilEl: HTMLDivElement | null = null, veilT = 0, lineT = 0;
function veil(g: number, t: number) {
  if (typeof document === 'undefined') return;
  if (g <= 0.001 && !veilEl) return;
  if (!veilEl) {
    veilEl = document.createElement('div');
    veilEl.className = 'kiy-veil';
    veilEl.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:60;opacity:0;transition:opacity .25s;background:radial-gradient(ellipse at 50% 45%, rgba(255,226,120,0.05) 0%, rgba(214,160,20,0.55) 60%, rgba(90,60,0,0.85) 100%);mix-blend-mode:multiply';
    document.body.appendChild(veilEl);
  }
  veilEl.style.opacity = String(Math.min(1, g * 1.1));
  if (g <= 0.001) { veilEl.remove(); veilEl = null; return; }
  // lines of what it knows, faster the longer you look
  veilT = t;
  if (t - lineT > 1.2 - g * 1.05) { lineT = t; knowledgeLine(g); }
}
function knowledgeLine(g: number, text?: string, big = false) {
  const e = INHABITANTS[Math.floor(Math.random() * INHABITANTS.length)];
  const s = text ?? (Math.random() < 0.5 ? e.lore : e.biology);
  const sentence = text ? s : (s.split(/(?<=\.)\s+/)[Math.floor(Math.random() * Math.max(1, s.split(/(?<=\.)\s+/).length))] || s);
  const el = document.createElement('div');
  el.textContent = sentence.toUpperCase();
  const size = big ? 48 : g > 0.7 ? 32 : 16;
  el.style.cssText = `position:fixed;left:${8 + Math.random() * 60}%;top:${8 + Math.random() * 80}%;max-width:${big ? 80 : 34}vw;pointer-events:none;z-index:61;font-family:var(--font-new, serif);font-size:${size}px;line-height:${size + 6}px;color:#ffe9a0;text-shadow:0 0 8px #c89010,0 0 2px #000;opacity:0;transition:opacity .4s, transform 3s;transform:translateY(0)`;
  if (big) { el.style.left = '10%'; el.style.top = '40%'; el.style.textAlign = 'center'; el.style.width = '80vw'; }
  document.body.appendChild(el);
  requestAnimationFrame(() => { el.style.opacity = String(0.55 + g * 0.45); el.style.transform = 'translateY(-24px)'; });
  setTimeout(() => { el.style.opacity = '0'; }, big ? 2600 : 1600 + g * 800);
  setTimeout(() => el.remove(), big ? 3400 : 2600 + g * 800);
}
void veilT;

/** you looked. You understand. */
function know(c: Creature, p: Player) {
  G.audio?.flat?.('dread_swell', 'music', 0.9, 0.6);
  G.audio?.flat?.('hush_inhale', 'sfx', 0.8, 0.5);
  G.camera?.pushIn?.(0.45, 2.5, -8);
  const n = revealAll();
  // every rule, too
  import('../rules').then((r) => { for (const e of INHABITANTS) r.learnRule(e.id, 'watched'); }).catch(() => {});
  import('../../game/research').then((r) => r.grantResearch?.(30, 'The King in Yellow')).catch(() => {});
  bus.emit('think', p, 'Oh. Oh, I see. I see ALL of it.');
  // the flood: everything it knows, at once
  let k = 0;
  const flood = setInterval(() => {
    for (let i = 0; i < 4; i++) knowledgeLine(1);
    G.pr.fx.glitch = 1; G.pr.fx.desat = 1;
    if (++k > 14) clearInterval(flood);
  }, 160);
  setTimeout(() => knowledgeLine(1, 'I UNDERSTAND', true), 1400);
  setTimeout(() => {
    if (p.body.dead) return;
    bus.emit('playerHit', p, 'head', 'corruption', { dmg: 999, from: [c.x, c.z], knock: 0, by: 'king_in_yellow' });
    p.body.health = 0; p.body.blood = 0;
    bus.emit('think', p, '...');
    G.camera?.pushIn?.(0, 2);
    if (G.camera && c.mem.camAside) { c.mem.camAside = 0; G.camera.endOrbit?.(); }
  }, 3200);
  bus.emit('inhabitantKnowledge', { by: 'king_in_yellow', revealed: n });
}

// ------------------------------------------------------------------ host brain: it sits, it waits, it unveils
function court(c: Creature) {
  // furnish the court with the Seated: those who asked, arranged before it
  const z = zoneOf(c), cs = CS();
  const n = rng.int(2, 3);
  for (let i = 0; i < n; i++) {
    const a = c.facing + (i - (n - 1) / 2) * 0.7;
    const x = c.x + Math.cos(a) * 3.6, zz = c.z + Math.sin(a) * 3.6;
    if (!walkable(z, Math.floor(x), Math.floor(zz))) continue;
    const s = cs.spawn('seated', c.zoneKey, x, zz);
    if (s) { s.facing = s.targetFacing = Math.atan2(c.z - zz, c.x - x); s.mem.persistent = true; s.mem.court = c.id; }
  }
}
function thinkKing(c: Creature, dt: number): boolean {
  const m = c.mem, n = net(c);
  const ev = pulse(c);
  stop(c);
  if (!m.init) {
    m.init = 1; m.persistent = true; m.ph = 'veiled'; m.next = G.time + rng.float(12, 22);
    // there is only ever one
    for (const o of CS().creatures.values()) if (o !== c && !o.dead && o.sp.key === 'king_in_yellow') { CS().remove(c); return true; }
    court(c);
  }
  const ps = playersIn(c.zoneKey);
  let near: Player | null = null, nd = 20;
  for (const p of ps) { const d = dist(p, c); if (d < nd) { nd = d; near = p; } }
  if (near) c.targetFacing = c.facing + Math.max(-0.002, Math.min(0.002, Math.atan2(near.z - c.z, near.x - c.x) - c.facing));
  // struck: it does not bleed; it lifts the mask
  if ((ev.hurt > 0 || ev.staggered) && m.ph === 'veiled') { m.ph = 'lifting'; m.t = 0; }
  m.t = (m.t ?? 0) + dt;
  const u = Number(n.u) || 0;
  switch (m.ph) {
    case 'veiled':
      n.u = Math.max(0, u - dt * 0.5);
      if (near && G.time > m.next) { m.ph = 'lifting'; m.t = 0; playAt('dread_swell', c, 1, 30, 0.7); playAt('hush_inhale', c, 0.9, 24, 0.6); }
      else if (near && c.noiseCooldown <= 0) { playAt('occupant_groan', c, 0.35, 26, 0.5); c.noiseCooldown = 9 + rng.float(0, 6); }
      break;
    case 'lifting':
      n.u = Math.min(1, u + dt / 4);
      if (n.u >= 1) { m.ph = 'unveiled'; m.t = 0; }
      break;
    case 'unveiled':
      n.u = 1;
      if (c.noiseCooldown <= 0) { playAt('wisp_hum', c, 0.8, 26, 0.45); c.noiseCooldown = 2.2; }
      if (m.t > 7) { m.ph = 'lowering'; m.t = 0; }
      break;
    default:
      n.u = Math.max(0, u - dt / 3);
      if (n.u <= 0) { m.ph = 'veiled'; m.next = G.time + rng.float(16, 34); }
  }
  return true;
}

const KING = def({
  key: 'king_in_yellow', name: 'The King in Yellow', code: 'IN-00 // SOVEREIGN, CARCOSAN', temperament: 'hazard', threat: 5,
  rule: { name: 'DO NOT LOOK', text: 'It cannot be hurt and it does not hunt. When it lifts the mask, turn away and keep facing away until it lowers it. Look at its face and you will know everything, and die.', tell: 'Yellow. Something enormous, sitting very still. Do not look at its face.' },
  hp: 9999, walk: 0, run: 0, turn: 0.2, radius: 1.1, height: 3.1, sight: 30, fov: 3.1, hearing: 0.5,
  zones: ['undercroft', 'corrupt'], weight: 0.1, maxPerZone: 1, diet: 'none',
  flags: { immortal: true, noCorpse: true, watcher: true },
  sounds: { idle: 'occupant_groan', hurt: 'hush_inhale' },
  scan: {
    cls: 'Sovereign / do not look',
    notes: [
      'A vast octopoid shape in tattered yellow, seated on its own coiled arms. Its face is behind a pallid mask.',
      'It does not hunt. It waits to be seen. Now and then it lifts the mask.',
      'Anyone who looks it in the face understands everything at once, and does not survive it.',
      'Turn away when the mask rises. The Seated are those who asked.',
    ],
  },
  gore: { blood: 'glow', tint: 0xf0c020, flesh: 0xb8a878, gib: false },
  remains: 'none',
  build: buildKing, animate: animateKing, think: thinkKing,
});
KING.animateGallery = (rig: Rig, t: number) => {
  const q = new URLSearchParams(location.search).get('pose') || '';
  animateKing(rig, fakeCreature(KING, { id: 'kg', mem: { netMem: { u: q === 'unveil' ? 1 : 0 } } }), t, 1 / 60);
};
horrify(KING, { twitch: 0.2, snap: 0.1 });

void mixHex; void blade;
