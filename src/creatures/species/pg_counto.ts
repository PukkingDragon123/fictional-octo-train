import { horrify } from '../kit/horror';
import { def, Rig } from '../species';
import { makeRamp, mixHex } from '../../gfx/pixel';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import type { Creature } from '../creature';
import type { Player } from '../../entities/player';
import { CS, zoneOf, pulse, attack, stop, faceTo, findSpot, onPlayerHit } from '../behaviors_a';
import { net, netOf, playAt, hashId, rng, localIn, thinkOnce, dist, lineOfSightB, dropGift, angleDiff } from '../behaviors_b';
import { KitDef, KitRig, SkinB, BuildCtx, Page, V3, Wt, Row, buildKitRig, kitSync, kitPersonalize, attackCurve, flinchOf, hash, tube, wLerp } from '../kit/humanoids';
import { chain, sac, plate, blade, paintCap, paintSkin } from '../kit/organic';
import { ruleShown } from '../rules';
import { SIDES, absBones, say, linePoll, nearestUnit, gait, paintCardboard, paintFoil, runs, soak, stitches } from './pg_common';

// =====================================================================================
// COUNT-O — the counting robot from "COUNT-O's Number Hut" (Bright Hour
// Television, 1994-1996), an educational show made on no money: a cardboard
// box body covered in kitchen foil and silver tape, dryer-hose arms and legs,
// oven-mitt hands, ping-pong-ball lamps for eyes, a bulb on a coat-hanger
// aerial, an abacus across its chest and a dial that counted along with the
// children. It played hide-and-seek with them at the end of every episode.
// It still plays. It covers its eyes and counts to ten, out loud. Then it comes
// looking. If it finds you, there is a lesson, and the lesson is taught with
// the wooden metre-stick taped to its right mitt. Whoever is inside the box has
// been in there a long time: the cardboard is soft and dark at the bottom and
// it drips from the hose joints.
//   pg_counto   skinned kit rig: box body and head (rounded-box lofts), dryer-hose limbs
//               (ribbed chains), oven mitts, foil boots, lamp eyes, aerial bulb, a hinged
//               mouth flap, the abacus, the counting dial and its needle, the metre-stick
// VIDEO / POSTER API (stand-alone):
//   buildCountO(variant?)                        -> KitRig
//   poseCountO(rig, t, dt, pose, { count })      pose: 'idle' | 'count' | 'seek' | 'chase' | 'smack' |
//                                                'cheer' | 'dead'   (count: 0..10 for the dial and the nod)
// =====================================================================================

function bonesCountO() {
  return absBones([
    ['base', '', [0, 0, 0]],
    ['hips', 'base', [0, 0.96, 0]],
    ['spine', 'hips', [0, 1.08, 0]],
    ['chest', 'spine', [0, 1.36, 0]],
    ['dial', 'chest', [0, 1.44, 0.235]],
    ['neck', 'chest', [0, 1.6, 0]],
    ['head', 'neck', [0, 1.7, 0.0], true],
    ['jaw', 'head', [0, 1.745, 0.16]],
    ['antenna', 'head', [0.04, 1.96, -0.03], true],
    ['bulb', 'antenna', [0.07, 2.16, -0.05]],
    ['uarmL', 'chest', [0.31, 1.52, 0.0], true], ['farmL', 'uarmL', [0.35, 1.22, 0.02], true], ['handL', 'farmL', [0.37, 0.95, 0.04], true],
    ['uarmR', 'chest', [-0.31, 1.52, 0.0], true], ['farmR', 'uarmR', [-0.35, 1.22, 0.02], true], ['handR', 'farmR', [-0.37, 0.95, 0.04], true], ['ruler', 'handR', [-0.37, 0.88, 0.08]],
    ['thighL', 'hips', [0.13, 0.88, 0.0], true], ['shinL', 'thighL', [0.13, 0.5, 0.02], true], ['footL', 'shinL', [0.13, 0.11, 0.02]],
    ['thighR', 'hips', [-0.13, 0.88, 0.0], true], ['shinR', 'thighR', [-0.13, 0.5, 0.02], true], ['footR', 'shinR', [-0.13, 0.11, 0.02]],
  ]);
}
function layoutCountO(p: Page) {
  p.reg('BOX', 96, 64, [0.84, 1.64]);
  p.reg('HEAD', 64, 32, [-0.08, 0.27]);
  p.reg('HOSE', 24, 64);
  p.reg('MITT', 24, 24);
  p.reg('BOOT', 24, 24);
  p.reg('RULER', 8, 96);
  p.reg('DIAL', 32, 32);
  p.reg('FLAP', 32, 16);
  p.reg('MOUTH', 24, 12);
  p.reg('LAMP', 12, 12);
  p.reg('BULB', 8, 8);
  p.reg('BOLT', 8, 8);
  p.reg('BEADR', 8, 8); p.reg('BEADY', 8, 8); p.reg('BEADB', 8, 8);
  p.reg('ROD', 8, 16);
  p.reg('NEEDLE', 8, 8);
  p.reg('FLESH', 16, 16);
  p.reg('CAP', 16, 16);
}
const BOX: Row[] = [
  { y: 0.84, rx: 0.29, rf: 0.21, rb: 0.2, sq: 6 },
  { y: 0.9, rx: 0.3, rf: 0.22, rb: 0.21, sq: 6 },
  { y: 1.2, rx: 0.3, rf: 0.225, rb: 0.21, sq: 6.5 },
  { y: 1.5, rx: 0.3, rf: 0.22, rb: 0.205, sq: 6.5 },
  { y: 1.6, rx: 0.295, rf: 0.215, rb: 0.2, sq: 6 },
  { y: 1.63, rx: 0.27, rf: 0.19, rb: 0.18, sq: 5 },
];
const HEADR: Row[] = [
  { y: -0.06, rx: 0.15, rf: 0.14, rb: 0.13, sq: 5 },
  { y: -0.04, rx: 0.17, rf: 0.16, rb: 0.15, sq: 6 },
  { y: 0.12, rx: 0.175, rf: 0.165, rb: 0.155, sq: 6.5 },
  { y: 0.24, rx: 0.17, rf: 0.16, rb: 0.15, sq: 6 },
  { y: 0.26, rx: 0.15, rf: 0.14, rb: 0.13, sq: 5 },
];
function buildCountOMesh(B: SkinB, x: BuildCtx) {
  const bi = x.bi, R = x.R;
  const H = bi('hips'), SP = bi('spine'), CH = bi('chest'), HD = bi('head');
  // ---- the box: a dented cardboard carton worn over the body
  tube(B, { rows: BOX, ys: [0.84, 0.86, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.56, 1.6, 1.63], n: 20, reg: R('BOX'), vr: R('BOX').range, g: 1,
    w: (y) => (y < 1.0 ? [H, 1] : y < 1.2 ? wLerp(y, 1.0, 1.2, H, SP) : y < 1.38 ? wLerp(y, 1.2, 1.38, SP, CH) : [CH, 1]),
    bump: (th, y) => -0.05 * Math.exp(-((th - 1.9) ** 2) / 0.05) * Math.exp(-((y - 1.1) ** 2) / 0.006) - 0.03 * Math.exp(-((th + 0.6) ** 2) / 0.03) * Math.exp(-((y - 1.45) ** 2) / 0.004) + 0.012 * Math.sin(y * 40 + th * 2),
    start: [0, 0.83, 0], end: [0, 1.632, 0] });
  // the carton's top flaps, folded down and sticking out over the shoulders
  for (const [z0, dz] of [[0.2, 1], [-0.19, -1]] as const) {
    const w: Wt = [CH, 1];
    blade(B, R('FLAP'), [[0, 1.63, z0], [0, 1.6, z0 + dz * 0.07], [0, 1.53, z0 + dz * 0.12]], [0.56, 0.55, 0.54], [1, 0, 0], [w, w, w], { offset: -0.5, seed: 3 + dz, edge: 0.06 });
  }
  // ---- the head: a smaller carton, lamp eyes, a hinged mouth flap, bolts for ears, an aerial
  const hp = x.rest('head');
  tube(B, { rows: HEADR, ys: [-0.06, -0.04, 0.04, 0.12, 0.2, 0.24, 0.26], n: 18, reg: R('HEAD'), vr: R('HEAD').range, at: hp, g: 2, w: () => [HD, 1], start: [hp[0], hp[1] - 0.065, hp[2]], end: [hp[0], hp[1] + 0.265, hp[2]],
    bump: (th, y) => -0.04 * Math.exp(-((th - 0.5) ** 2) / 0.02) * Math.exp(-((y - 0.2) ** 2) / 0.002) });
  for (const k of [1, -1]) {
    const e: V3 = [k * 0.075, hp[1] + 0.1, hp[2] + 0.158];
    sac(B, R('LAMP'), 3, [[e[0], e[1], e[2] - 0.01], [e[0], e[1], e[2] + 0.012], [e[0], e[1], e[2] + 0.03]], [[0.042, 0.042], [0.044, 0.044], [0.024, 0.024]], [[HD, 1], [HD, 1], [HD, 1]], { n: 12, up: [0, 1, 0], emis: 0.9 });
    sac(B, R('BOLT'), 4, [[k * 0.17, hp[1] + 0.09, hp[2]], [k * 0.2, hp[1] + 0.09, hp[2]], [k * 0.215, hp[1] + 0.09, hp[2]]], [[0.035, 0.035], [0.034, 0.034], [0.02, 0.02]], [[HD, 1], [HD, 1], [HD, 1]], { n: 8, up: [0, 0, 1] });
  }
  plate(B, R('MOUTH'), 5, [0, hp[1] + 0.02, hp[2] + 0.168], [1, 0, 0], [0, 1, 0], 0.075, 0.025, 0.004, [HD, 1], { rows: 2, cols: 4, oval: 0 });
  plate(B, R('FLAP'), 6, [0, hp[1] + 0.03, hp[2] + 0.172], [1, 0, 0], [0, 1, 0], 0.085, 0.032, 0.006, [bi('jaw'), 1], { rows: 2, cols: 4, oval: 0 });
  chain(B, x, R('ROD'), 7, { bones: ['antenna'], tip: x.rest('bulb'), r: [0.006, 0.004], n: 5, rings: 5, start: true, end: false, bend: () => [-0.03, 0, 0.02] });
  const bu = x.rest('bulb'), wb: Wt = [bi('bulb'), 1];
  sac(B, R('BULB'), 8, [[bu[0], bu[1] - 0.01, bu[2]], [bu[0], bu[1] + 0.025, bu[2]], [bu[0], bu[1] + 0.055, bu[2]]], [[0.016, 0.016], [0.03, 0.03], [0.018, 0.018]], [wb, wb, wb], { n: 10, emis: 1 });
  // ---- a ribbed dryer-hose neck, arms and legs
  const ribs = (a: number, t: number) => 0.09 * Math.max(0, Math.sin(t * 150)) + 0.02 * Math.sin(a * 2);
  sac(B, R('HOSE'), 9, [[0, 1.6, 0], [0, 1.66, 0], [0, 1.71, 0]], [[0.075, 0.075], [0.07, 0.07], [0.075, 0.075]], [[CH, 1], [bi('neck'), 1], [HD, 1]], { n: 10, start: false, end: false, bump: (a, t) => 0.12 * Math.max(0, Math.sin(t * 20)) });
  for (const [sd, k] of SIDES) {
    chain(B, x, R('HOSE'), 10 + (k > 0 ? 0 : 1), { bones: ['uarm' + sd, 'farm' + sd, 'hand' + sd], tip: x.rest('hand' + sd), r: [0.062, 0.055], n: 10, rings: 8, start: true, end: false, bump: ribs });
    const h = x.rest('hand' + sd), wH: Wt = [bi('hand' + sd), 1];
    sac(B, R('MITT'), 12 + (k > 0 ? 0 : 1), [[h[0], h[1] + 0.03, h[2]], [h[0], h[1] - 0.04, h[2] + 0.01], [h[0], h[1] - 0.13, h[2] + 0.02], [h[0], h[1] - 0.17, h[2] + 0.02]], [[0.07, 0.05], [0.08, 0.045], [0.075, 0.04], [0.035, 0.025]], [[bi('farm' + sd), 0.3, bi('hand' + sd), 0.7], wH, wH, wH], { n: 10, up: [k, 0, 0] });
    sac(B, R('MITT'), 14 + (k > 0 ? 0 : 1), [[h[0] - k * 0.01, h[1] - 0.03, h[2] + 0.06], [h[0] - k * 0.015, h[1] - 0.08, h[2] + 0.085], [h[0] - k * 0.016, h[1] - 0.1, h[2] + 0.09]], [[0.028, 0.024], [0.022, 0.018], [0.01, 0.01]], [wH, wH, wH], { n: 7 });
    chain(B, x, R('HOSE'), 16 + (k > 0 ? 0 : 1), { bones: ['thigh' + sd, 'shin' + sd, 'foot' + sd], tip: x.rest('foot' + sd), r: [0.075, 0.065], n: 10, rings: 9, start: true, end: false, bump: ribs });
    const f = x.rest('foot' + sd), wF: Wt = [bi('foot' + sd), 1];
    B.box([f[0], 0.055, f[2] + 0.05], [0.16, 0.11, 0.3], null, R('BOOT'), wF);
    B.box([f[0], 0.12, f[2] + 0.0], [0.14, 0.05, 0.16], null, R('BOOT'), wF, [0, 0, 1, 1], 0.9);
  }
  // ---- the metre-stick, taped to the right mitt
  const rp = x.rest('ruler'), wR: Wt = [bi('ruler'), 1];
  B.box([rp[0], rp[1] - 0.42, rp[2] + 0.02], [0.012, 0.92, 0.045], null, R('RULER'), wR);
  // ---- the chest: an abacus (three rods of beads) and the dial with its needle
  const zf = 0.232;
  for (let r = 0; r < 3; r++) {
    const y = 1.26 - r * 0.07, wC: Wt = [CH, 1];
    sac(B, R('ROD'), 20 + r, [[-0.21, y, zf], [0, y, zf + 0.004], [0.21, y, zf]], [[0.006, 0.006], [0.006, 0.006], [0.006, 0.006]], [wC, wC, wC], { n: 5, up: [0, 1, 0] });
    for (let i = 0; i < 6; i++) {
      const bx = -0.17 + i * 0.045 + (i > 2 ? 0.05 : 0) * (r === 1 ? 1 : 0.5), reg = ['BEADR', 'BEADY', 'BEADB'][(r + i) % 3];
      sac(B, R(reg), 23 + r, [[bx - 0.016, y, zf + 0.004], [bx, y, zf + 0.004], [bx + 0.016, y, zf + 0.004]], [[0.008, 0.008], [0.02, 0.02], [0.008, 0.008]], [wC, wC, wC], { n: 8, up: [0, 1, 0] });
    }
  }
  plate(B, R('DIAL'), 26, [0, 1.44, zf + 0.002], [1, 0, 0], [0, 1, 0], 0.085, 0.085, 0.01, [CH, 1], { rows: 6, cols: 6, oval: 1 });
  const dp = x.rest('dial'), wD: Wt = [bi('dial'), 1];
  B.box([dp[0], dp[1] + 0.035, dp[2] + 0.012], [0.01, 0.07, 0.006], null, R('NEEDLE'), wD);
  // ---- what is in the box: a torn hole on the left side, and something wet against it
  plate(B, R('FLESH'), 27, [0.27, 1.12, -0.05], [0, 0, -1], [0, 1, 0], 0.06, 0.08, 0.03, [SP, 1], { rows: 4, cols: 4, oval: 0.9 });
}

function paintCountO(p: Page, x: BuildCtx) {
  const sd = x.seed % 997;
  const KRAFT = makeRamp(0xa8804a, 8, { hueShift: 0.03, spread: 0.5 }), FOIL = makeRamp(0xb8bcc4, 8, { spread: 0.7 }), TAPE = makeRamp(0x9a9ca4, 6, { spread: 0.4 });
  const BLOOD = makeRamp(0x5a0808, 6, { spread: 0.7, hueShift: 0.01 }), MARK = 0x1a1a2a;
  const Bx = p.R('BOX');
  paintCardboard(Bx, KRAFT, sd + 1);
  // foil sheets wrapped round, gaffer tape holding them, marker rivets, the name across the chest
  for (let yy = 0; yy < Bx.h; yy++) for (let xx = 0; xx < Bx.w; xx++) {
    const band = Math.floor((yy + Math.floor(hash(Math.floor(xx / 12), 3) * 6)) / 14);
    if (hash(band, Math.floor(xx / 24) + sd) < 0.62 && yy < Bx.h * 0.86) Bx.put(xx, yy, FOIL, 3.6 + Math.sin(xx * 0.9 + hash(Math.floor(xx / 3), Math.floor(yy / 3)) * 6) * 1.4 + Math.cos((Bx.deg(xx) * Math.PI) / 180) * 0.8, 0.3);
  }
  for (const yy of [Bx.h * 0.15, Bx.h * 0.48, Bx.h * 0.8]) for (let xx = 0; xx < Bx.w; xx++) for (let k = 0; k < 3; k++) Bx.put(xx, yy + k, TAPE, 2.6 + (k === 0 ? 1 : 0) + (hash(xx, k) - 0.5) * 0.5, 0.4);
  for (let i = 0; i < 24; i++) { const xx = (i % 12) * (Bx.w / 12) + 3, yy = i < 12 ? 4 : Bx.h - 14; Bx.set(xx, yy, MARK); Bx.set(xx + 1, yy, 0x6a6a7a); }
  // the name, in marker over the foil, a crayon star either side
  const lx = Bx.X(-26), ly = Bx.Y(1.57);
  const GLY: Record<string, string[]> = { C: ['111', '100', '100', '100', '111'], O: ['111', '101', '101', '101', '111'], U: ['101', '101', '101', '101', '111'], N: ['101', '111', '111', '111', '101'], T: ['111', '010', '010', '010', '010'], '-': ['000', '000', '111', '000', '000'] };
  [...'COUNT-O'].forEach((ch, i) => { const g = GLY[ch]; for (let j = 0; j < 5; j++) for (let k = 0; k < 3; k++) if (g[j][k] === '1') { Bx.set(lx + i * 4 + k, ly + j, 0xc81a1a); Bx.set(lx + i * 4 + k + 1, ly + j + 1, 0x5a0a0a); } });
  for (const k of [-1, 1]) { const cx = Bx.X(k * 46), cy = Bx.Y(1.52); for (let a = 0; a < 5; a++) { const an = -Math.PI / 2 + (a * Math.PI * 2) / 5; Bx.line(cx, cy, cx + Math.cos(an) * 3, cy + Math.sin(an) * 3, 0xe8c020, 0.9); } }
  // soaked dark from the bottom up; drips from the hem; a torn hole on the left flank with meat behind it
  for (let yy = Math.floor(Bx.h * 0.6); yy < Bx.h; yy++) for (let xx = 0; xx < Bx.w; xx++) { const k = (yy / Bx.h - 0.6) * 2.5 + (Bx.fbm(xx, yy, 4, 2, sd + 3) - 0.5) * 0.8; if (k > 0.25) Bx.blend(xx, yy, BLOOD[1 + (k > 0.7 ? 0 : 1)], Math.min(0.85, k)); }
  for (let i = 0; i < 6; i++) runs(Bx, hash(i, sd + 4) * Bx.w, Bx.h * 0.72, 1, Bx.h * 0.3, BLOOD, sd + 5 + i, 1);
  const hx = Bx.X(100), hy = Bx.Y(1.12);
  soak(Bx, hx, hy, 9, 11, BLOOD, sd + 6);
  for (let j = -8; j <= 8; j++) for (let i = -6; i <= 6; i++) { const d = Math.hypot(i / 6, j / 8); if (d < 0.7 + hash(Math.floor(Math.atan2(j, i) * 3), 7) * 0.25) Bx.set(hx + i, hy + j, d < 0.5 ? 0x140404 : 0x6a4a2a); }
  // the head: foil over card, marker eyebrows, rivets
  const Hd = p.R('HEAD');
  paintCardboard(Hd, KRAFT, sd + 7, false);
  paintFoil(Hd, FOIL, sd + 8, 3.8);
  for (const k of [1, -1]) for (let i = 0; i < 7; i++) Hd.set(Hd.X(k * (12 + i * 3)), Hd.Y(0.18 + (k * i > 0 ? i * 0.006 : 0)) - (k > 0 ? i * 0.4 : 0), MARK);
  for (let i = 0; i < 8; i++) { Hd.set((i / 8) * Hd.w, 3, MARK); Hd.set((i / 8) * Hd.w, Hd.h - 4, MARK); }
  for (let i = 0; i < 3; i++) runs(Hd, Hd.X(-150 + i * 20), Hd.h * 0.7, 1, Hd.h * 0.3, BLOOD, sd + 9 + i, 1);
  // dryer hose: foil ribs; mitts quilted silver; boots foil over shoe boxes
  const Hs = p.R('HOSE');
  Hs.fill(FOIL, (xx, yy) => 3.4 + Math.cos((Hs.deg(xx) * Math.PI) / 180) * 1.6 + ((yy % 4) < 2 ? 1.2 : -0.6) + (hash(xx, yy) - 0.5) * 0.6, undefined, 0.3);
  for (let i = 0; i < 8; i++) runs(Hs, hash(i, sd + 12) * Hs.w, hash(i, sd + 13) * Hs.h * 0.5, 1, 18, BLOOD, sd + 14 + i, 1);
  const Mt = p.R('MITT');
  Mt.fill(FOIL, (xx, yy) => 3.2 + (((xx + yy) % 6 === 0) || ((xx - yy + 60) % 6 === 0) ? -1.4 : 0.4) + Math.cos((Mt.deg(xx) * Math.PI) / 180) * 1, undefined, 0.3);
  soak(Mt, Mt.w * 0.6, Mt.h * 0.75, 5, 4, BLOOD, sd + 16);
  paintFoil(p.R('BOOT'), FOIL, sd + 17, 3.2);
  soak(p.R('BOOT'), 8, 18, 6, 4, BLOOD, sd + 18);
  // the metre-stick: varnished pine, black graduations, numbers, the end dark and sticky
  const Ru = p.R('RULER');
  Ru.fill(makeRamp(0xd8b070, 5, { spread: 0.35 }), (xx, yy) => 2.8 + (Ru.fbm(xx, yy, 2, 2, sd + 19) - 0.5) * 0.8 + (xx === 0 ? 0.8 : 0), undefined, 0.4);
  for (let yy = 0; yy < Ru.h; yy += 2) Ru.blend(0, yy, 0x1a1410, 0.9);
  for (let yy = 0; yy < Ru.h; yy += 10) { Ru.hline(0, 4, yy, 0x1a1410, 0.9); Ru.set(5, yy + 2, 0x3a2a1a); Ru.set(6, yy + 3, 0x3a2a1a); }
  for (let yy = Math.floor(Ru.h * 0.7); yy < Ru.h; yy++) for (let xx = 0; xx < Ru.w; xx++) if (hash(xx, yy) < (yy / Ru.h - 0.7) * 3.4) Ru.blend(xx, yy, BLOOD[1], 0.75);
  // the dial: ten coloured wedges and a number on each
  const Dl = p.R('DIAL');
  const WEDGE = [0xd83a2a, 0xe88a2a, 0xe8c82a, 0x6ab83a, 0x2a9ab8, 0x3a5ac8, 0x8a4ab8, 0xc84a8a, 0xe8e0d0, 0x4a4a4a];
  for (let yy = 0; yy < Dl.h; yy++) for (let xx = 0; xx < Dl.w; xx++) {
    const dx = xx + 0.5 - Dl.w / 2, dy = yy + 0.5 - Dl.h / 2, d = Math.hypot(dx, dy) / (Dl.w / 2);
    let a = Math.atan2(dx, -dy); if (a < 0) a += Math.PI * 2;
    Dl.set(xx, yy, d > 0.92 ? 0x2a2a30 : d > 0.55 ? WEDGE[Math.floor((a / (Math.PI * 2)) * 10) % 10] : 0xf0ece0);
  }
  for (let i = 0; i < 10; i++) { const a = ((i + 0.5) / 10) * Math.PI * 2; Dl.set(Dl.w / 2 + Math.sin(a) * 11, Dl.h / 2 - Math.cos(a) * 11, 0x101010); Dl.set(Dl.w / 2 + Math.sin(a) * 11 + 1, Dl.h / 2 - Math.cos(a) * 11, 0x101010); }
  p.R('NEEDLE').fill(makeRamp(0xc81a1a, 3), () => 1.5);
  const Fl = p.R('FLAP');
  paintCardboard(Fl, KRAFT, sd + 20);
  for (let xx = 0; xx < Fl.w; xx++) Fl.blend(xx, Fl.h - 1, 0x4a3018, 0.8);
  const Mo = p.R('MOUTH');
  Mo.fill(makeRamp(0x1a1a1a, 3), (xx, yy) => ((xx + yy) % 2 ? 0.4 : 1.6));
  p.R('LAMP').fill(makeRamp(0xff3a1a, 5, { spread: 0.4 }), (xx, yy) => 3.4 - Math.hypot(xx - 5, yy - 5) * 0.3);
  p.R('LAMP').set(4, 4, 0xffffff);
  p.R('BULB').fill(makeRamp(0xffc84a, 4), (xx, yy) => 3 - Math.hypot(xx - 3.5, yy - 3.5) * 0.3);
  p.R('BOLT').fill(makeRamp(0x6a6a70, 4), (xx, yy) => 2 + (hash(xx, yy) - 0.5) + (yy < 2 ? 1 : 0));
  p.R('BEADR').fill(makeRamp(0xd8322a, 5), (xx) => 2.4 + Math.cos(((xx + 0.5) / 8) * Math.PI * 2) * 1.2);
  p.R('BEADY').fill(makeRamp(0xe8c22a, 5), (xx) => 2.4 + Math.cos(((xx + 0.5) / 8) * Math.PI * 2) * 1.2);
  p.R('BEADB').fill(makeRamp(0x2a6ac8, 5), (xx) => 2.4 + Math.cos(((xx + 0.5) / 8) * Math.PI * 2) * 1.2);
  p.R('ROD').fill(makeRamp(0x8a8a90, 4), (xx) => 2 + (xx < 4 ? 1 : 0));
  paintSkin(p.R('FLESH'), makeRamp(0xa83a3a, 7, { spread: 0.6 }), { seed: sd + 21, veins: 4, vein: 0x4a0a0a, glint: 6 });
  stitches(p.R('FLAP'), 2, 3, p.R('FLAP').w - 2, 3, 0x4a3018, 0x8a6a4a, 4, 0);
  paintCap(p.R('CAP'), 0xa8804a, 0xb83a3a, 0x3a0808);
}

const COUNTO_KIT: KitDef = { key: 'pg_counto', variants: 1, W: 256, H: 256, bones: bonesCountO, layout: layoutCountO, build: buildCountOMesh, paint: paintCountO, sphere: [0, 1.1, 0, 1.4] };
/** a COUNT-O rig (one of it) */
export function buildCountO(variant = 0): KitRig { return buildKitRig(COUNTO_KIT, variant, 2.0); }

// ------------------------------------------------------------------ animation
export type CountOPose = 'idle' | 'count' | 'seek' | 'chase' | 'smack' | 'cheer' | 'dead';
interface CDrive { t: number; dt: number; speed: number; md: string; mdT: number; count: number; atk: number; flinch: number; dead: number; seed: number }
const JOINTS = ['hips', 'spine', 'chest', 'neck', 'head', 'jaw', 'antenna', 'bulb', 'dial', 'uarmL', 'farmL', 'handL', 'uarmR', 'farmR', 'handR', 'ruler', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'];
function poseCountORig(K: KitRig, d: CDrive) {
  const P = K.parts, ud = K.kit.m as Record<string, number>, t = d.t, s7 = d.seed * 7;
  for (const n of JOINTS) P[n]?.rotation.set(0, 0, 0);
  if (P.hips.userData.p0) P.hips.position.copy(P.hips.userData.p0);
  P.base.rotation.set(0, 0, 0); P.base.position.set(0, 0, 0);
  const run = d.md === 'chase' ? 1 : 0;
  const mv = Math.min(1, d.speed / (run ? 2.6 : 0.7)) * (1 - d.dead);
  ud.ph = (ud.ph ?? 0) + d.dt * (run ? 8.5 : 5.2) * Math.min(1.4, d.speed / (run ? 2.6 : 0.7) + 0.05);
  // a stiff, servo-stepped gait: the phase snaps in little increments
  const ph = Math.floor(ud.ph * 4) / 4;
  const g = gait(P, { ph, mv, stride: run ? 0.7 : 0.4, knee: run ? 0.8 : 0.35, arm: run ? 0.5 : 0.3, bounce: 0.03, waddle: 0.05 });
  P.hips.position.y += g.bob;
  // the servo twitch: the head jumps between headings rather than turning
  const step = Math.floor(t * 0.7 + s7);
  const look = (hash(step, 3) - 0.5) * 1.2 * (d.md === 'seek' ? 1.4 : d.md === '' || d.md === 'idle' ? 0.6 : 0);
  ud.look = (ud.look ?? 0) + (look - (ud.look ?? 0)) * Math.min(1, d.dt * 14);
  P.head.rotation.set(Math.sin(t * 0.5) * 0.03, ud.look, (hash(step, 5) - 0.5) * 0.2 * (d.md === 'seek' ? 1 : 0.3));
  P.antenna.rotation.set(Math.sin(t * 3.1) * 0.08 + g.bob * 3, 0, Math.sin(t * 2.6) * 0.1);
  P.bulb.scale.setScalar(1 + Math.max(0, Math.sin(t * 6)) * 0.25);
  // the dial follows the count (0 at the top, a wedge a number)
  const cnt = d.count;
  ud.dial = (ud.dial ?? 0) + ((-cnt / 10) * Math.PI * 2 - (ud.dial ?? 0)) * Math.min(1, d.dt * 12);
  P.dial.rotation.z = ud.dial;
  let jaw = 0;
  if (d.md === 'count') {
    // hands over the lamps, head down, a nod and a clack of the mouth on every number
    const beat = (d.mdT % 1), nod = Math.max(0, 1 - beat * 4);
    P.chest.rotation.x = 0.12; P.neck.rotation.x = 0.15; P.head.rotation.set(0.3 + nod * 0.12, 0, 0);
    for (const [s, k] of SIDES) { P['uarm' + s].rotation.set(-1.95, 0, k * 0.42); P['farm' + s].rotation.set(-1.55, 0, -k * 0.35); P['hand' + s].rotation.set(0, 0, -k * 0.5); }
    jaw = nod * 0.5;
  } else if (d.md === 'ready') {
    for (const [s, k] of SIDES) { P['uarm' + s].rotation.set(-0.3, 0, k * (1.2 + Math.sin(t * 12) * 0.1)); P['farm' + s].rotation.set(-0.6, 0, 0); }
    P.head.rotation.x = -0.25; jaw = 0.4 + Math.abs(Math.sin(t * 14)) * 0.3;
  } else if (d.md === 'seek') {
    P.chest.rotation.x = 0.1; P.head.rotation.x += 0.05;
    P.uarmR.rotation.x -= 0.4; P.farmR.rotation.x -= 0.3;
  } else if (d.md === 'found' || d.md === 'chase') {
    P.uarmR.rotation.set(-2.7 + Math.sin(t * 9) * 0.1, 0, -0.2); P.farmR.rotation.set(-0.5, 0, 0);
    if (d.md === 'found') { P.uarmL.rotation.set(-1.5, 0, 0.2); P.farmL.rotation.set(0, 0, 0); P.handL.rotation.z = 0.4; jaw = 0.5 + Math.abs(Math.sin(t * 16)) * 0.3; }
    P.chest.rotation.x = 0.15;
  } else if (d.md === 'smack') {
    const u = Math.min(1, d.mdT / 0.32), sw = u < 0.35 ? -2.9 : -2.9 + (u - 0.35) / 0.65 * 2.5;
    P.uarmR.rotation.set(sw, 0, -0.15); P.farmR.rotation.set(-0.3 * (1 - u), 0, 0); P.chest.rotation.set(0.2 * u, -0.3 * u, 0); P.ruler.rotation.x = -0.4 * u;
    jaw = 0.4;
  } else if (d.md === 'cheer') {
    const c = Math.abs(Math.sin(t * 7));
    for (const [s, k] of SIDES) { P['uarm' + s].rotation.set(-2.5, 0, k * (0.3 + c * 0.35)); P['farm' + s].rotation.set(-0.4, 0, -k * 0.4); }
    P.hips.position.y += c * 0.05; jaw = 0.3 + c * 0.3;
  }
  if (d.atk > 0 && d.md !== 'smack') { P.uarmR.rotation.set(-2.9 + d.atk * 2.4, 0, -0.15); P.ruler.rotation.x = -0.4 * d.atk; }
  P.jaw.rotation.x = jaw;
  if (d.dead > 0) {
    const k = d.dead;
    P.hips.position.y -= 0.4 * k; P.chest.rotation.x = 0.4 * k; P.head.rotation.set(0.6 * k, 0.3 * k, 0.4 * k);
    for (const [s, k2] of SIDES) { P['uarm' + s].rotation.set(0.1 * k, 0, k2 * 0.6 * k); P['thigh' + s].rotation.set(-1.4 * k, 0, k2 * 0.3 * k); P['shin' + s].rotation.x = 1.2 * k; }
  }
  if (d.flinch > 0) { P.chest.rotation.x -= d.flinch * 0.2; P.head.rotation.z += Math.sin(t * 60) * 0.1 * d.flinch; }
}
function animateCountO(rig: Rig, c: Creature, t: number, dt: number) {
  const K = rig as KitRig;
  if (K.kit.who !== c.id) { K.kit.who = c.id; kitPersonalize(K, 0); }
  kitSync(K);
  const n = netOf(c), ud = K.kit.m as Record<string, number>;
  if (n.md !== ud.lmd) { ud.lmd = n.md; ud.mdT = 0; }
  ud.mdT = (ud.mdT ?? 0) + dt;
  const ac = attackCurve(rig, c, t);
  ud.dk = c.dead ? Math.min(1, (ud.dk ?? 0) + dt * 1.5) : 0;
  poseCountORig(K, { t, dt, speed: c.dead ? 0 : c.speed, md: c.dead ? '' : (n.md ?? ''), mdT: ud.mdT, count: n.cnt ?? 0, atk: Math.max(ac.wind, ac.strike), flinch: flinchOf(c), dead: ud.dk * ud.dk * (3 - 2 * ud.dk), seed: hashId(c.id, 6) });
  const F = K.kit.F.fx.value; F.y += dt; F.z = Math.min(1, c.hitFlash / 0.15) * 0.4;
  if (c.speed > 0.3 && !c.dead && c.visibleToLocal) { ud.stp = (ud.stp ?? 0) + dt * c.speed; if (ud.stp > 0.7) { ud.stp = 0; playAt(Math.random() < 0.5 ? 'cy_servo' : 'metal_clank', c, 0.18, 10, 0.9 + Math.random() * 0.2); } }
  linePoll(rig, c, 'COUNT-O', 30);
  const p = localIn(c);
  if (p && !c.dead) {
    const dd = dist(p, c);
    if (n.md === 'count' && dd < 24) thinkOnce(p, 'counto_count', 'It has covered its eyes. It is counting. I need to be out of sight when it gets to ten.', 60);
    else if (n.md === 'chase' && dd < 16) thinkOnce(p, 'counto_chase', 'It found me. It has a metre-stick and it is running.', 60);
    else if (c.visibleToLocal && dd < 12) thinkOnce(p, 'counto', ['A cardboard robot. Foil and dryer hose. A kids\' show robot. It is dripping.', 'There is something in the box. The bottom of the box is soaked through.'][Math.floor(t * 0.2) % 2], 100);
  }
}

// ------------------------------------------------------------------ host brain: hide and seek
const WORDS = ['', 'ONE!', 'TWO!', 'THREE!', 'FOUR!', 'FIVE!', 'SIX!', 'SEVEN!', 'EIGHT!', 'NINE!', 'TEN!'];
const START = ['LET US PLAY A GAME! YOU HIDE! I COUNT!', 'HIDE AND SEEK! HIDE AND SEEK! I WILL COUNT TO TEN!', 'TIME FOR NUMBERS, FRIEND! FIND A GOOD PLACE TO HIDE!'];
const FOUND = ['FOUND YOU! LESSON TIME!', 'I SEE YOU! THAT IS NOT HIDING! LESSON TIME!', 'FOUND YOU, FRIEND! LET US COUNT THE MISTAKES!'];
const HITS = ['', 'THAT IS ONE.', 'THAT IS TWO.', 'AND THAT IS THREE. GOOD LEARNING.'];
const SEEK_T = 22;
function setMd(c: Creature, md: string) { const n = net(c); if (n.md !== md) { n.md = md; c.mem.mdT = 0; } }
function startGame(c: Creature, p: Player | null) {
  const n = net(c);
  setMd(c, 'count'); n.cnt = 0; c.mem.nextCnt = 1.2; c.mem.hits = 0;
  say(c, rng.pick(START), 3.2);
  // it turns its back on you to count
  if (p) c.targetFacing = c.facing = Math.atan2(c.z - p.z, c.x - p.x);
}
function thinkCountO(c: Creature, dt: number): boolean {
  const cs = CS(), z = zoneOf(c), m = c.mem, n = net(c);
  const ev = pulse(c);
  m.mdT = (m.mdT ?? 0) + dt;
  const md: string = n.md ?? '';
  const near = nearestUnit(c, 34);
  // can it see a unit: eyes uncovered, in front of it, in the line of sight
  const spot = (p: Player) => dist(p, c) < 16 && Math.abs(angleDiff(c.facing, Math.atan2(p.z - c.z, p.x - c.x))) < 1.2 && lineOfSightB(z, c.x, c.z, p.x, p.z);
  if (ev.hurt > 0 && near && (md === 'count' || md === 'seek' || md === 'cheer' || md === 'ready' || md === '')) {
    setMd(c, 'found'); m.tg = near.p.id; say(c, 'NO PEEKING AND NO HITTING! LESSON TIME!', 2.4); playAt('mn_klaxon', c, 0.5, 20, 1); return true;
  }
  if (md === 'count') {
    stop(c); c.setState('idle');
    if (m.mdT > (m.nextCnt ?? 1.2)) {
      n.cnt = (n.cnt ?? 0) + 1; m.nextCnt = m.mdT + 1.05;
      say(c, WORDS[n.cnt], 1.15);
      playAt('vg_robot', c, 0.35, 24, 0.9 + n.cnt * 0.02); playAt('beep', c, 0.3, 20, 0.8 + n.cnt * 0.04);
      if (n.cnt >= 10) { setMd(c, 'ready'); say(c, 'READY OR NOT, HERE I COME!', 2.2); playAt('school_bell', c, 0.6, 30, 1); ruleShown(c); }
    }
    return true;
  }
  if (md === 'ready') { stop(c); if (m.mdT > 1.2) { setMd(c, 'seek'); m.lastKnown = near ? { x: near.p.x + rng.float(-5, 5), z: near.p.z + rng.float(-5, 5) } : null; c.goal = null; } return true; }
  if (md === 'seek') {
    c.setState('investigate');
    if (near && spot(near.p)) { setMd(c, 'found'); m.tg = near.p.id; say(c, rng.pick(FOUND), 2.4); playAt('mn_klaxon', c, 0.55, 22, 1); return true; }
    if (m.mdT > SEEK_T) {
      // nobody found: good hiding. A gold star for whoever is closest (once a while each).
      setMd(c, 'cheer'); say(c, 'GOOD HIDING, FRIEND! YOU GET A GOLD STAR!', 3); playAt('mn_perfect', c, 0.6, 22, 1);
      const pid = near?.p.id ?? '';
      if (pid && G.time > ((m.stars ?? {})[pid] ?? 0)) { (m.stars ??= {})[pid] = G.time + 300; dropGift(c, 'pg_gold_star'); }
      return true;
    }
    if (!c.goal || cs.moveTo(c, z, c.goal.x, c.goal.z, c.sp.walk, dt, 0.6) || c.stateT > 8) {
      const base = m.lastKnown ?? (near ? { x: near.p.x, z: near.p.z } : { x: c.x, z: c.z });
      c.goal = findSpot(c, { x: base.x, z: base.z, rMin: 0, rMax: 6 }) ?? cs.wanderSpot(c, z, 6);
      c.stateT = 0;
      if (rng.chance(0.4)) say(c, rng.pick(['WHERE ARE YOU, FRIEND?', 'I CAN HEAR YOU BREATHING.', 'COUNT-O IS GOOD AT FINDING.', 'ARE YOU IN THE SANDPIT?']), 2.4);
    }
    return true;
  }
  if (md === 'found') { stop(c); const p = G.players.get(m.tg); if (p) faceTo(c, p.x, p.z); if (m.mdT > 1.0) { setMd(c, 'chase'); m.lostT = 0; } return true; }
  if (md === 'smack') { stop(c); c.setState('attack'); if (m.mdT > 0.7) setMd(c, 'chase'); return true; }
  if (md === 'chase') {
    const p = G.players.get(m.tg) as Player | undefined;
    if (!p || p.body.dead || p.zoneKey !== c.zoneKey) { startGame(c, null); return true; }
    const d = dist(p, c);
    m.lostT = lineOfSightB(z, c.x, c.z, p.x, p.z) && d < 22 ? 0 : (m.lostT ?? 0) + dt;
    if (m.lostT > 5 || m.mdT > 18 || (m.hits ?? 0) >= 3) { setMd(c, 'cheer'); say(c, (m.hits ?? 0) >= 3 ? 'LESSON OVER! LET US PLAY AGAIN!' : 'YOU RAN AWAY FROM THE LESSON. LET US PLAY AGAIN!', 3); return true; }
    c.setState('chase');
    if (d < c.sp.attack!.range + p.radius && c.attackT <= 0) {
      faceTo(c, p.x, p.z); attack(c, p); setMd(c, 'smack'); m.hits = (m.hits ?? 0) + 1;
      playAt('wood_hit', c, 0.9, 14, 0.9); say(c, HITS[Math.min(3, m.hits)], 2);
      return true;
    }
    cs.moveTo(c, z, p.x, p.z, c.sp.run, dt, 0.5);
    return true;
  }
  if (md === 'cheer') { stop(c); if (m.mdT > 3.5) { if (near && near.d < 26) startGame(c, near.p); else setMd(c, ''); } return true; }
  // ---- nobody playing: someone about? start a game. Otherwise it potters, twitching, muttering numbers.
  if (near && near.d < 20) { startGame(c, near.p); return true; }
  c.setState('wander');
  if (!c.goal || cs.moveTo(c, z, c.goal.x, c.goal.z, c.sp.walk * 0.7, dt, 0.6) || c.stateT > 20) {
    c.goal = findSpot(c, { rMin: 3, rMax: 10 }) ?? cs.wanderSpot(c, z, 8);
    c.stateT = 0;
    if (rng.chance(0.3)) say(c, rng.pick(['ONE. TWO. ONE. TWO.', 'NUMBERS ARE OUR FRIENDS.', 'WHO WANTS TO PLAY?']), 2.4);
  }
  return true;
}

const COUNTO = def({
  key: 'pg_counto', name: 'COUNT-O', code: 'PG-05 // STATUTE, COSTUME (BROADCAST-BOUND)', temperament: 'hostile', threat: 4,
  rule: { name: 'HIDE AND SEEK', text: 'When someone is near, it covers its eyes and counts to ten out loud. Be out of its sight when it gets to ten. Then it searches for a while; if it sees you, it runs you down and teaches you with the metre-stick, three strokes. If it never finds you, you get a gold star and it counts again. Hit it while it counts and it stops playing fair.', tell: 'A cardboard robot with its mitts over its eyes. It is counting. Out loud.' },
  hp: 120, walk: 0.85, run: 3.3, turn: 4, radius: 0.36, height: 2.0, sight: 16, fov: 1.2, hearing: 1,
  attack: { dmg: [11, 19], range: 1.45, cooldown: 1.5, kinds: ['bruise', 'laceration', 'fracture'], corrupt: 0.01, knock: 0.7 },
  zones: ['playground'], weight: 1, group: [1, 1], maxPerZone: 1, diet: 'none',
  sounds: { idle: 'cy_servo', alert: 'mn_klaxon', attack: 'wood_hit', hurt: 'metal_clank', death: 'cy_powerdown', step: 'metal_clank' },
  scan: {
    cls: 'Statute / costume, broadcast-bound',
    notes: [
      'A home-made robot costume from an educational programme: carton, foil, dryer hose, oven mitts.',
      'It plays hide-and-seek: eyes covered, it counts to ten aloud, then searches.',
      'Out of sight when it reaches ten, you are safe; seen, you are chased and beaten with a metre-stick.',
      'Something is inside the box. It drips.',
    ],
  },
  gore: { blood: 'red', tint: 0xffffff, flesh: 0xa8804a, sever: ['uarmL', 'farmR', 'head', 'antenna', 'ruler'], head: 'head' },
  build: () => buildCountO(0), animate: animateCountO, think: thinkCountO,
});
onPlayerHit('pg_counto', (p: Player) => {
  bus.emit('think', p, ['The metre-stick. Across the face. It counted out loud when it hit me.', 'It is a ruler. It hurts like an axe handle.'][Math.floor(Math.random() * 2)]);
});

// ------------------------------------------------------------------ stand-alone posing (gallery, video)
/** pose COUNT-O with no game running; 'count' runs its own count 1..10 unless `count` is given */
export function poseCountO(rig: KitRig, t: number, dt: number, pose: CountOPose = 'idle', o: { count?: number; speed?: number } = {}) {
  kitSync(rig);
  const ud = rig.kit.m as Record<string, any>;
  if (ud.gp !== pose) { ud.gp = pose; ud.gT = 0; }
  ud.gT = (ud.gT ?? 0) + dt;
  const count = o.count ?? (pose === 'count' ? Math.min(10, Math.floor(ud.gT % 12)) : 0);
  const speed = o.speed ?? (pose === 'seek' ? 0.8 : pose === 'chase' ? 3 : 0);
  poseCountORig(rig, { t, dt, speed, md: pose === 'idle' || pose === 'dead' ? '' : pose, mdT: pose === 'smack' ? ud.gT % 1 : ud.gT, count, atk: 0, flinch: 0, dead: pose === 'dead' ? 1 : 0, seed: 0.17 });
  rig.kit.F.fx.value.y += dt;
}
COUNTO.animateGallery = (rig: Rig, t: number) => {
  const u = new URLSearchParams(location.search);
  const q = (u.get('pose') || ['count', 'seek', 'chase', 'smack', 'cheer'][Math.floor(t / 5) % 5]) as CountOPose;
  poseCountO(rig as KitRig, t, 1 / 60, q);
};
horrify(COUNTO, { twitch: 0.4, snap: 0.2, breathe: 0.003, lunge: 0.12, parts: /head|antenna|jaw/, keepMaterials: false });
