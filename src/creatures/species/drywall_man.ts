import { horrify } from '../kit/horror';
import * as THREE from 'three';
import { def, Rig } from '../species';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { makeRamp, mixHex } from '../../gfx/pixel';
import { ModelBuilder } from '../../gfx/modelBuilder';
import { lineOfSight } from '../../world/collision';
import { G } from '../../game/G';
import type { Creature } from '../creature';
import type { Player } from '../../entities/player';
import {
  CS, zoneOf, nm, netSet, pulse, attack, playersIn, stop, dist, faceTo, isAlone, instFlags, sfx, wallSpotsNear, WallSpot,
  hideRig, galleryPose, ease, lerp, suppressSighting, idHash,
} from '../behaviors_a';
import { worldMaterial } from '../../gfx/materials';
import { kitCanvas, drips, flay, rot, RAW, BONE, BLOOD } from '../kit/rot';
import {
  KitDef, KitRig, BoneSpec, SkinB, BuildCtx, Page, Region, Row, Wt, buildKitRig, kitSync, kitPersonalize, tube, headLoft, handLoft, footLoft,
  wLerp, gauss, angd, FOOT_BARE, lostParts, nearestSurvivor, lookAngles, attackCurve, flinchOf, hash, offset, smooth,
} from '../kit/humanoids';

// =====================================================================================
// THE DRYWALL MAN — a thin man made of wallboard who lives inside the walls. Paper-taped
// seams, screw dimples, scraps of the wallpaper he came through still stuck to him, a
// crack for a mouth. You see a face pressing out through the wallpaper, two hands, the
// plaster splitting around them. If you are alone, he steps out.
// =====================================================================================

addTextureModule(() => {
  const A = atlas();
  // the wall splitting where he presses through: torn paper, broken gypsum, a dark hole, radiating cracks
  A.add('c_drywall_crater', 48, 48, (pc) => {
    pc.wrap = false;
    pc.clear();
    const cx = 24, cy = 24;
    for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) {
      const a = Math.atan2(y - cy, x - cx), d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const rr = 9 + 3 * Math.sin(a * 5 + 1) + 2 * Math.sin(a * 11);
      if (d < rr) pc.set(x, y, d < rr - 2 ? 0x0e0c0a : 0x3a3228);
      else if (d < rr + 2.5) pc.set(x, y, hash(x, y) < 0.5 ? 0xe8e4d8 : 0xc8c0ae); // broken gypsum lip
      else if (d < rr + 4 && hash(x * 3, y) < 0.55) pc.set(x, y, 0xa89c84);          // torn paper
    }
    for (let i = 0; i < 9; i++) {
      let a = (i / 9) * Math.PI * 2 + hash(i, 4) * 0.6, x = cx + Math.cos(a) * 12, y = cy + Math.sin(a) * 12;
      const L = 8 + Math.floor(hash(i, 7) * 12);
      for (let k = 0; k < L; k++) {
        pc.set(x, y, 0x2a241e); if (k < L * 0.5) pc.set(x + 1, y, 0x5a5044);
        a += (hash(k, i + 11) - 0.5) * 0.7; x += Math.cos(a); y += Math.sin(a);
        if (x < 1 || y < 1 || x > 46 || y > 46) break;
      }
    }
  });
});

// ------------------------------------------------------------------ skeleton
function bonesD(v: number): BoneSpec[] {
  const L = 1 + (v % 3) * 0.025;
  const b: BoneSpec[] = [
    { name: 'hips', parent: '', at: [0, 1.02, 0] },
    { name: 'spine', parent: 'hips', at: [0, 0.08, 0] },
    { name: 'chest', parent: 'spine', at: [0, 0.28, 0] },
    { name: 'neck', parent: 'chest', at: [0, 0.27, -0.02], cap: true },
    { name: 'head', parent: 'neck', at: [0, 0.13, 0.02], cap: true },
  ];
  for (const [s, k] of [['L', 1], ['R', -1]] as const) {
    b.push(
      { name: 'uarm' + s, parent: 'chest', at: [k * 0.158, 0.25, -0.012], cap: true },
      { name: 'farm' + s, parent: 'uarm' + s, at: [0, -0.46 * L, 0], cap: true },
      { name: 'hand' + s, parent: 'farm' + s, at: [0, -0.44 * L, 0], cap: true },
      { name: 'fing1' + s, parent: 'hand' + s, at: [0, -0.1, 0] },
      { name: 'fing2' + s, parent: 'fing1' + s, at: [0, -0.1, 0] },
      { name: 'thumb' + s, parent: 'hand' + s, at: [-k * 0.004, -0.03, 0.026] },
    );
  }
  for (const [s, k] of [['L', 1], ['R', -1]] as const) {
    b.push({ name: 'thigh' + s, parent: 'hips', at: [k * 0.072, -0.04, 0], cap: true }, { name: 'shin' + s, parent: 'thigh' + s, at: [0, -0.5, 0], cap: true }, { name: 'foot' + s, parent: 'shin' + s, at: [0, -0.44, 0] });
  }
  return b;
}
const ARMLEN = (v: number) => 1 + (v % 3) * 0.025;

function layoutD(p: Page) {
  p.reg('TORSO', 80, 64, [0.92, 1.68]);
  p.reg('ARM_L', 20, 62, [-0.96, 0.03]);
  p.reg('ARM_R', 20, 62, [-0.96, 0.03]);
  p.reg('LEG_L', 22, 64, [-0.94, 0.06]);
  p.reg('LEG_R', 22, 64, [-0.94, 0.06]);
  p.reg('HEAD', 72, 52, [-0.02, 0.32]);
  p.reg('HAND_L', 18, 30);
  p.reg('HAND_R', 18, 30);
  p.reg('FOOT', 24, 18);
  p.reg('NECK', 20, 14, [-0.06, 0.15]);
  p.reg('CAP', 16, 16);
}

const TORSO_D: Row[] = [
  { y: 0.93, rx: 0.06, rf: 0.045, rb: 0.05 },
  { y: 0.97, rx: 0.11, rf: 0.06, rb: 0.068 },
  { y: 1.04, rx: 0.118, rf: 0.062, rb: 0.07, sq: 2.6 },
  { y: 1.14, rx: 0.1, rf: 0.056, rb: 0.058, sq: 2.6 },
  { y: 1.24, rx: 0.106, rf: 0.058, rb: 0.056, sq: 3 },
  { y: 1.36, rx: 0.124, rf: 0.062, rb: 0.06, sq: 3.6 },   // flat as a board
  { y: 1.48, rx: 0.13, rf: 0.062, rb: 0.062, sq: 3.6 },
  { y: 1.56, rx: 0.14, rf: 0.056, rb: 0.06, sq: 3.6 },
  { y: 1.61, rx: 0.12, rf: 0.05, rb: 0.054, sq: 3 },
  { y: 1.645, rx: 0.07, rf: 0.04, rb: 0.044 },
  { y: 1.67, rx: 0.036, rf: 0.032, rb: 0.034 },
];
const ARM_D: Row[] = [
  { y: 0.0, rx: 0.018, rf: 0.022, rb: 0.022, cx: -0.008 },
  { y: -0.02, rx: 0.03, rf: 0.032, rb: 0.032 },
  { y: -0.1, rx: 0.03, rf: 0.03, rb: 0.03 },
  { y: -0.44, rx: 0.024, rf: 0.024, rb: 0.026 },
  { y: -0.48, rx: 0.027, rf: 0.026, rb: 0.03 },  // a knob of an elbow
  { y: -0.52, rx: 0.024, rf: 0.024, rb: 0.024 },
  { y: -0.85, rx: 0.019, rf: 0.02, rb: 0.019 },
  { y: -0.9, rx: 0.02, rf: 0.022, rb: 0.02 },
];
const LEG_D: Row[] = [
  { y: 0.05, rx: 0.044, rf: 0.046, rb: 0.05 },
  { y: -0.01, rx: 0.054, rf: 0.054, rb: 0.058 },
  { y: -0.2, rx: 0.046, rf: 0.046, rb: 0.046 },
  { y: -0.46, rx: 0.036, rf: 0.04, rb: 0.036 },
  { y: -0.5, rx: 0.04, rf: 0.044, rb: 0.038 },  // knee
  { y: -0.54, rx: 0.034, rf: 0.036, rb: 0.04 },
  { y: -0.66, rx: 0.034, rf: 0.032, rb: 0.042 },
  { y: -0.88, rx: 0.022, rf: 0.024, rb: 0.026 },
  { y: -0.93, rx: 0.024, rf: 0.026, rb: 0.026 },
];
const HEAD_D: Row[] = [
  { y: -0.015, rx: 0.03, rf: 0.034, rb: 0.03 },
  { y: 0.02, rx: 0.05, rf: 0.07, rb: 0.05, cz: 0.008 },   // a long jaw
  { y: 0.07, rx: 0.06, rf: 0.076, rb: 0.062 },
  { y: 0.12, rx: 0.066, rf: 0.078, rb: 0.07 },
  { y: 0.17, rx: 0.07, rf: 0.08, rb: 0.076 },
  { y: 0.22, rx: 0.072, rf: 0.078, rb: 0.08 },
  { y: 0.26, rx: 0.066, rf: 0.07, rb: 0.074 },
  { y: 0.29, rx: 0.048, rf: 0.05, rb: 0.054 },
];

function buildD(B: SkinB, x: BuildCtx) {
  const bi = x.bi, R = x.R, L = ARMLEN(x.variant);
  const tw = (y: number): Wt => {
    if (y < 1.07) return [bi('hips'), 1];
    if (y < 1.14) return wLerp(y, 1.07, 1.14, bi('hips'), bi('spine'));
    if (y < 1.28) return [bi('spine'), 1];
    if (y < 1.38) return wLerp(y, 1.28, 1.38, bi('spine'), bi('chest'));
    if (y < 1.64) return [bi('chest'), 1];
    return [bi('chest'), 0.5, bi('neck'), 0.5];
  };
  tube(B, { rows: TORSO_D, ys: [0.93, 0.97, 1.0, 1.04, 1.09, 1.14, 1.19, 1.24, 1.3, 1.36, 1.42, 1.48, 1.52, 1.56, 1.59, 1.61, 1.63, 1.645, 1.67], n: 12, reg: R('TORSO'), vr: R('TORSO').range, w: tw, g: 1, start: [0, 0.925, -0.002], end: [0, 1.68, -0.01],
    // ribs pressing out through the board, a hollow under the sternum
    bump: (th, y) => (Math.cos(th) > 0 ? 0.05 * Math.max(0, Math.sin(y * 70)) * gauss(y, 1.36, 0.08) * gauss(Math.abs(th), 0.6, 0.4) : 0) - gauss(y, 1.22, 0.04) * gauss(th, 0, 0.3) * 0.06 + gauss(y, 1.4, 0.3) * gauss(Math.abs(angd(th, Math.PI)), 0, 0.15) * 0.05 });
  tube(B, { rows: [{ y: -0.06, rx: 0.034, rf: 0.032, rb: 0.034 }, { y: 0.04, rx: 0.026, rf: 0.028, rb: 0.028 }, { y: 0.14, rx: 0.028, rf: 0.03, rb: 0.03 }], n: 8, reg: R('NECK'), at: x.rest('neck'), w: (y) => (y < -0.02 ? [bi('chest'), 0.4, bi('neck'), 0.6] : y > 0.1 ? [bi('neck'), 0.5, bi('head'), 0.5] : [bi('neck'), 1]), g: 4 });
  // a long face: deep sockets, a ridge of a nose, the crack of a mouth set into the plaster
  headLoft(B, { at: x.rest('head'), rows: HEAD_D, reg: R('HEAD'), vr: R('HEAD').range, w: () => [bi('head'), 1], g: 6, top: 0.302, bottom: -0.02,
    bump: (th, y) => gauss(th, 0, 0.12) * gauss(y, 0.13, 0.04) * 0.14 - gauss(Math.abs(th), 0.38, 0.15) * gauss(y, 0.18, 0.014) * 0.08 + gauss(Math.abs(th), 0.36, 0.25) * gauss(y, 0.2, 0.012) * 0.04 - gauss(Math.abs(th), 0.3, 0.4) * gauss(y, 0.06, 0.006) * 0.05 + gauss(Math.abs(th), 0.95, 0.2) * gauss(y, 0.12, 0.03) * 0.04 });
  for (const [s, k] of [['L', 1], ['R', -1]] as const) {
    const U = bi('uarm' + s), F = bi('farm' + s), H = bi('hand' + s);
    const at = x.rest('uarm' + s);
    const rows = ARM_D.map((r) => ({ ...r, y: r.y * L }));
    const wf = (y: number): Wt => {
      if (y > -0.03) return [U, 0.75, bi('chest'), 0.25];
      if (y > -0.42 * L) return [U, 1];
      if (y > -0.52 * L) return wLerp(y, -0.42 * L, -0.52 * L, U, F);
      if (y > -0.87 * L) return [F, 1];
      return [F, 0.5, H, 0.5];
    };
    const ar = R('ARM_' + s);
    tube(B, { rows, ys: [0, -0.02, -0.1, -0.22, -0.34, -0.44, -0.48, -0.52, -0.62, -0.74, -0.85, -0.9].map((y) => y * L), n: 7, reg: ar, vr: ar.range.map((v) => v * L), at, w: wf, g: 10 + (k > 0 ? 0 : 1), mirror: k, start: [at[0] - k * 0.01, at[1] + 0.004, at[2]] });
    const hp = x.rest('hand' + s);
    // three long fingers and a thumb, knuckles like knots in the board
    handLoft(B, { k, at: [hp[0], hp[1] - 0.006, hp[2]], bones: { farm: F, hand: H, f1: bi('fing1' + s), f2: bi('fing2' + s), thumb: bi('thumb' + s) }, reg: R('HAND_' + s), g: 20 + (k > 0 ? 0 : 10), s: 1.05,
      palm: { len: 0.1, w: 0.036, t: 0.012 }, fingers: { n: 3, len: [0.2, 0.22, 0.19], r: [0.0068, 0.0072, 0.0066], spread: 1.1 }, thumb: { len: 0.08, r: 0.008 } });
  }
  for (const [s, k] of [['L', 1], ['R', -1]] as const) {
    const T = bi('thigh' + s), S = bi('shin' + s), Ft = bi('foot' + s);
    const at = x.rest('thigh' + s);
    const wf = (y: number): Wt => {
      if (y > 0.02) return [bi('hips'), 0.5, T, 0.5];
      if (y > -0.45) return [T, 1];
      if (y > -0.54) return wLerp(y, -0.45, -0.54, T, S);
      if (y > -0.9) return [S, 1];
      return [S, 0.5, Ft, 0.5];
    };
    const lr = R('LEG_' + s);
    tube(B, { rows: LEG_D, ys: [0.05, -0.01, -0.1, -0.2, -0.33, -0.46, -0.5, -0.54, -0.6, -0.66, -0.77, -0.88, -0.93], n: 7, reg: lr, vr: lr.range, at, w: wf, g: 30 + (k > 0 ? 0 : 1), mirror: k, start: [at[0], at[1] + 0.06, at[2]], startW: [bi('hips'), 0.6, T, 0.4] });
    footLoft(B, { k, at: x.rest('foot' + s), rows: FOOT_BARE, ground: -0.04, sole: 0.003, lip: 0, reg: R('FOOT'), w: [Ft, 1], g: 36 + (k > 0 ? 0 : 1), s: 1.25, sx: 0.7, toeLift: 0.1 });
  }
}

function paintD(p: Page, x: BuildCtx) {
  const v = x.variant, seed = x.seed % 997;
  const PR = makeRamp(0x8e8a80, 10, { hueShift: 0.025, spread: 0.6 });
  const PAPER = makeRamp(0x8a7458, 5, { spread: 0.5 });
  const WALL = [makeRamp(0xc8b468, 5, { spread: 0.4 }), makeRamp(0xa8b098, 5, { spread: 0.4 }), makeRamp(0xc8a890, 5, { spread: 0.4 })][v % 3];
  const plaster = (r: Region, base: number, sd: number, extra?: (xx: number, yy: number) => number) => {
    r.fill(PR, (xx, yy) => {
      const th = (r.deg(xx) * Math.PI) / 180;
      return base + 1.4 * Math.cos(th) - 0.5 + (r.fbm(xx, yy, 4, 3, sd) - 0.5) * 1.2 + (hash(xx, yy + sd) - 0.5) * 0.35 + (extra ? extra(xx, yy) : 0);
    }, undefined, 0.6);
  };
  // joint tape: a pale feathered band with the paper edge showing
  const tapeV = (r: Region, x0: number, y0: number, y1: number) => { for (let yy = Math.round(y0); yy < y1; yy++) { r.blend(x0 - 1, yy, PR[8], 0.35); r.blend(x0, yy, PR[8], 0.6); r.blend(x0 + 1, yy, PR[7], 0.6); r.blend(x0 + 2, yy, PR[8], 0.3); if (yy % 7 === 0) r.set(x0 + 2, yy, PR[3]); } };
  const tapeH = (r: Region, y0: number) => { for (let xx = 0; xx < r.w; xx++) { r.blend(xx, y0 - 1, PR[8], 0.35); r.blend(xx, y0, PR[8], 0.6); r.blend(xx, y0 + 1, PR[7], 0.5); if (xx % 9 === 0) r.set(xx, y0 + 1, PR[3]); } };
  const screws = (r: Region, n: number, sd: number) => { for (let i = 0; i < n; i++) { const sx = Math.floor(hash(i, sd) * r.w), sy = 2 + Math.floor(hash(i, sd + 1) * (r.h - 4)); r.set(sx, sy, PR[1]); r.set(sx + 1, sy, PR[3]); r.set(sx, sy - 1, PR[8]); } };
  // broken away: brown paper face under the plaster, the gypsum crumbling at the rim
  const gouge = (r: Region, cx: number, cy: number, rad: number, sd: number) => {
    for (let j = -Math.ceil(rad) - 1; j <= Math.ceil(rad) + 1; j++) for (let i = -Math.ceil(rad * 1.3) - 1; i <= Math.ceil(rad * 1.3) + 1; i++) {
      const a = Math.atan2(j, i), d = Math.hypot(i / 1.3, j), e = rad * (0.75 + 0.45 * hash(Math.floor((a + 4) * 2.5), sd));
      if (d < e - 2.2) {
        // something alive under the board: raw, wet, packed in fibres
        const f = Math.sin((i + j * 0.4) * 1.7 + hash(i, j + sd) * 2) * 1.2 + 3.6 - (d / e) * 2.4 + (hash(i + 7, j, ) - 0.5) * 0.8;
        r.set(cx + i, cy + j, RAW[Math.max(0, Math.min(7, Math.round(f)))]);
      } else if (d < e - 1.2) r.set(cx + i, cy + j, PAPER[1 + ((i + j * 3) & 1)]);
      else if (d < e) r.set(cx + i, cy + j, PR[9]);
    }
    if (rad > 1.9) drips(kitCanvas(r), cx, cy + rad * 0.6, 1 + Math.floor(hash(sd, 3) * 2), rad * 2.2, [0, 1], sd, rad * 0.5);
  };
  // blood weeping out of a crack's mouth
  const seep = (r: Region, x0: number, y0: number, n: number, len: number, sd: number) => drips(kitCanvas(r), x0, y0, n, len, [0, 1], sd, 1.5);
  // a scrap of the wallpaper he came through, still stuck to him
  const scrap = (r: Region, cx: number, cy: number, w: number, h: number) => {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      if (hash(i + cx, j + cy) < 0.12 && (i === 0 || j === 0 || i === w - 1 || j === h - 1)) continue;
      const pat = ((i + j * 2) % 6 === 0 || (i - j * 2 + 60) % 6 === 0) ? 1 : 3;
      r.set(cx + i, cy + j, WALL[pat]);
    }
    for (let i = 0; i < w; i++) r.blend(cx + i, cy + h, 0x4a3a28, 0.4);
  };
  // ---------------- torso: a board, taped down the middle and across, ribs showing
  {
    const r = p.R('TORSO');
    plaster(r, 4.4, 41, (xx, yy) => {
      const deg = r.deg(xx), h = r.yAt(yy);
      return -1.8 * gauss(h, 1.6, 0.03) * gauss(Math.abs(deg), 90, 15) - 0.8 * Math.max(0, (0.97 - h) / 0.04) + (Math.cos((deg * Math.PI) / 180) > 0.2 ? 0.7 * Math.max(0, Math.sin(h * 70)) * gauss(h, 1.36, 0.08) : 0);
    });
    tapeV(r, Math.round(r.X(0)) - 1, 0, r.h);
    tapeV(r, Math.round(r.X(180)) - 1, 0, r.h);
    tapeH(r, Math.round(r.Y(1.26)));
    screws(r, 16, seed);
    r.crack(r.X(30), r.Y(1.5), 26, 100, PR[1], seed + 3, 1, 0.15, PR[8]);
    r.crack(r.X(-60), r.Y(1.2), 18, 70, PR[1], seed + 5, 0.9, 0.1);
    seep(r, r.X(30), r.Y(1.5), 2, 9, seed + 4);
    seep(r, r.X(-60), r.Y(1.2), 1, 7, seed + 6);
    // damp: the board has been soaking up whatever runs inside the walls
    rot(kitCanvas(r), 0.55, seed + 11);
    // the chest has broken open: board snapped back over a wet ribcage
    const cx = Math.round(r.X(-12 + v * 9)), cy = Math.round(r.Y(1.36 - v * 0.03));
    flay(kitCanvas(r), cx, cy, 5.5, 7.5, { fibre: [1, 0.2], bone: (xx, yy) => (Math.sin(yy * 1.25) > 0.45 && Math.abs(xx - cx) > 1 ? 0.8 : 0), depth: 0.9, seed: seed + 13, drips: 3, drip: [0, 1] });
    gouge(r, Math.round(r.X(-35)), Math.round(r.Y(1.42)), 3.2, seed + 7);
    gouge(r, Math.round(r.X(120)), Math.round(r.Y(1.1)), 2.4, seed + 9);
    scrap(r, Math.round(r.X(52 + v * 10)), Math.round(r.Y(1.52)), 8, 6);
    scrap(r, Math.round(r.X(-150)), Math.round(r.Y(1.3)), 6, 9);
    // water stains and a pencil line someone measured him with
    r.glow(r.X(75), r.Y(1.0), 7, 6, mixHex(PR[4], 0xa08840, 0.5), 0.45);
    for (let i = 0; i < 10; i++) r.set(Math.round(r.X(-15)) + i, Math.round(r.Y(1.33)), 0x6a6a7a);
  }
  // ---------------- limbs
  for (const [s, k] of [['L', 1], ['R', -1]] as const) {
    const r = p.R('ARM_' + s);
    plaster(r, 4.2, 51 + k, (xx) => -0.6 * Math.max(0, -Math.sin((r.deg(xx) * Math.PI) / 180)));
    tapeV(r, Math.round(r.X(-160)), 0, r.h);
    screws(r, 6, seed + 20 + k);
    rot(kitCanvas(r), 0.45, seed + 25 + k);
    r.crack(r.X(40), r.Y(-0.48), 14, 90, PR[1], seed + 21 + k, 1, 0.1, PR[8]);
    gouge(r, Math.round(r.X(20 * k)), Math.round(r.Y(-0.7)), 1.8, seed + 23 + k);
    if (k > 0) scrap(r, Math.round(r.X(60)), Math.round(r.Y(-0.2)), 5, 7);
    const lr = p.R('LEG_' + s);
    plaster(lr, 3.9, 61 + k, (xx) => -0.6 * Math.max(0, -Math.sin((lr.deg(xx) * Math.PI) / 180)));
    tapeV(lr, Math.round(lr.X(0)), 0, lr.h * 0.45);
    screws(lr, 6, seed + 30 + k);
    lr.crack(lr.X(-20), lr.Y(-0.5), 16, 80, PR[1], seed + 31 + k, 1, 0.12, PR[8]);
    gouge(lr, Math.round(lr.X(70 * k)), Math.round(lr.Y(-0.25)), 2.2, seed + 33 + k);
    for (let yy = Math.round(lr.Y(-0.8)); yy < lr.h; yy++) for (let xx = 0; xx < lr.w; xx++) if (hash(xx, yy * 3) < 0.25) lr.blend(xx, yy, 0x4a4238, 0.4); // dust from inside the walls
    const hr = p.R('HAND_' + s);
    plaster(hr, 4.2, 71 + k);
    for (let xx = 0; xx < hr.w; xx++) { hr.blend(xx, Math.round(hr.h * 0.45), PR[2], 0.6); if (hash(xx, 3) < 0.6) hr.blend(xx, hr.h - 1, 0x3a3228, 0.7); }
    for (let yy = Math.round(hr.h * 0.5); yy < hr.h; yy += 4) for (let xx = 0; xx < hr.w; xx += 3) hr.blend(xx, yy, PR[3], 0.5); // knuckle joints
    // fingertips worn through clawing out of walls: the plaster gone, raw ends, a chip of bone
    for (let yy = Math.round(hr.h * 0.82); yy < hr.h; yy++) for (let xx = 0; xx < hr.w; xx++) {
      const q = (yy - hr.h * 0.82) / (hr.h * 0.18) + (hash(xx, yy + 5) - 0.5) * 0.5;
      if (q > 0.25) hr.set(xx, yy, q > 0.85 && hash(xx, 17) < 0.3 ? BONE[3] : RAW[2 + Math.floor(hash(xx, yy) * 3)]);
    }
    drips(kitCanvas(hr), hr.w * 0.5, hr.h * 0.6, 3, hr.h * 0.3, [0, 1], seed + 77 + k, hr.w * 0.45);
  }
  {
    const r = p.R('FOOT');
    plaster(r, 4.2, 81);
    for (let xx = 0; xx < r.w; xx++) for (let yy = Math.round(r.h * 0.7); yy < r.h; yy++) r.blend(xx, yy, 0x3a3228, 0.5);
  }
  {
    const r = p.R('NECK');
    plaster(r, 4.6, 85);
    tapeH(r, Math.round(r.h * 0.5));
  }
  // ---------------- head: slit eyes, the ridge of a nose, the crack of a mouth
  {
    const r = p.R('HEAD');
    plaster(r, 4.4, 91, (xx, yy) => {
      const deg = r.deg(xx), h = r.yAt(yy), a = Math.abs(deg);
      return 1.6 * gauss(deg, 0, 5) * gauss(h, 0.13, 0.04) - 2.0 * gauss(a, 22, 9) * gauss(h, 0.18, 0.016) + 1.0 * gauss(a, 22, 12) * gauss(h, 0.205, 0.01) - 1.2 * Math.max(0, (0.02 - h) / 0.03) + 0.8 * gauss(a, 52, 10) * gauss(h, 0.12, 0.02);
    });
    // the eyes: two deep slits, wet-dark, a pale lower lid of gypsum
    for (const k of [-1, 1]) {
      const ex = Math.round(r.X(k * 21)), ey = Math.round(r.Y(0.18));
      for (let i = -3; i <= 3; i++) { r.set(ex + i, ey, 0x100e10); if (Math.abs(i) < 2) r.set(ex + i, ey - 1, 0x1c1a1c); r.blend(ex + i, ey + 1, PR[8], 0.6); }
      r.set(ex - k, ey, 0xd8d0c0); // a wet eye in the slit, looking out
      r.set(ex - k * 2, ey, 0x3a2a24);
    }
    // the mouth: a crack across the lower face, chipped at its edges, cracks running off it
    const my = Math.round(r.Y(0.06));
    let yy = my;
    for (let xx = Math.round(r.X(-34)); xx <= Math.round(r.X(34)); xx++) {
      yy += hash(xx, seed) < 0.3 ? 1 : hash(xx, seed + 1) < 0.3 ? -1 : 0;
      yy = Math.max(my - 2, Math.min(my + 2, yy));
      r.set(xx, yy, 0x0c0a0a); r.set(xx, yy + 1, 0x2a2420); r.blend(xx, yy - 1, PR[8], 0.5);
      if (Math.abs(xx - r.X(0)) < r.w * 0.04 && hash(xx, 9) < 0.6) r.set(xx, yy + 2, 0x1a1614);
      // teeth in the crack: real ones, crowded and yellowed, gums showing where the plaster split
      if (Math.abs(xx - r.X(0)) < r.w * 0.075) {
        if ((xx & 1) === 0 && hash(xx, seed + 2) < 0.8) { r.set(xx, yy, BONE[2 + (hash(xx, 4) < 0.5 ? 1 : 0)]); if (hash(xx, 8) < 0.5) r.set(xx, yy + 1, BONE[1]); }
        else r.set(xx, yy - 1, RAW[3]);
      }
    }
    // in the middle the crack has pulled open: a dark gap rimmed with teeth
    for (let xx = Math.round(r.X(-11)); xx <= Math.round(r.X(11)); xx++) {
      const e = 1 - Math.abs(xx - r.X(0)) / (r.X(11) - r.X(0));
      const hgt = Math.round(1 + e * 2.5);
      for (let j = 0; j < hgt; j++) r.set(xx, my + j, j === 0 && (xx & 1) ? BONE[3] : j === hgt - 1 && !(xx & 1) ? BONE[2] : 0x060404);
      r.set(xx, my - 1, RAW[2]);
      r.set(xx, my + hgt, RAW[1]);
    }
    // blood down the chin from the corners, darker where it dried
    drips(kitCanvas(r), r.X(-6), my + 2, 2, 7, [0, 1], seed + 45, 2);
    drips(kitCanvas(r), r.X(9), my + 2, 1, 5, [0, 1], seed + 46, 1);
    for (let xx = Math.round(r.X(-14)); xx <= Math.round(r.X(14)); xx++) if (hash(xx, seed + 47) < 0.4) r.blend(xx, my + 2 + Math.floor(hash(xx, 3) * 3), BLOOD[1], 0.45);
    r.crack(r.X(-34), my, 10, 110, PR[1], seed + 41, 1, 0, PR[8]);
    r.crack(r.X(34), my, 9, 60, PR[1], seed + 42, 1, 0, PR[8]);
    r.crack(r.X(10), r.Y(0.3), 18, 95, PR[1], seed + 43, 0.9, 0.12, PR[8]);
    tapeV(r, Math.round(r.X(180)), 0, r.h);
    gouge(r, Math.round(r.X(-100)), Math.round(r.Y(0.22)), 2.6, seed + 44);
    if (v === 1) scrap(r, Math.round(r.X(70)), Math.round(r.Y(0.26)), 6, 5);
  }
  // ---------------- cut: paper skin, white gypsum core, dark voids
  {
    const r = p.R('CAP');
    for (let yy = 0; yy < r.h; yy++) for (let xx = 0; xx < r.w; xx++) {
      const d = Math.hypot(xx + 0.5 - r.w / 2, yy + 0.5 - r.h / 2) / (r.w / 2);
      r.set(xx, yy, d > 0.92 ? PAPER[2] : d > 0.84 ? PR[9] : hash(xx, yy) < 0.1 ? PR[3] : hash(xx + 3, yy) < 0.5 ? PR[8] : PR[7]);
    }
  }
}

const DRYWALL_KIT: KitDef = { key: 'drywall', variants: 3, bones: bonesD, layout: layoutD, build: buildD, paint: paintD, sphere: [0, 1.0, 0, 1.6] };

const craterGeo = (() => {
  let g: THREE.BufferGeometry | null = null;
  return () => {
    if (g) return g;
    const mb = new ModelBuilder();
    // the face's hole and two handprints, flat on the wall
    const q = (cx: number, cy: number, s: number) => { mb.push().translate(cx, cy, 0); mb.panel(-s / 2, 0, s / 2, 0, -s / 2, s / 2, 'c_drywall_crater', { fit: true }); mb.pop(); };
    q(0, 1.86, 0.62); q(0.74, 1.74, 0.42); q(-0.73, 1.73, 0.42);
    g = mb.build();
    return g;
  };
})();
function buildDrywall(): Rig {
  const rig = buildKitRig(DRYWALL_KIT, 0, 2.05);
  // cut away with the wall it is painted on when the camera lowers that wall
  const crater = new THREE.Mesh(craterGeo(), worldMaterial({ alphaTest: 0.5, doubleSide: true, cutout: true }));
  crater.name = 'crater'; crater.visible = false; crater.castShadow = false;
  rig.root.add(crater);
  rig.parts.crater = crater;
  return rig;
}

// ------------------------------------------------------------------ animation
type DMode = 'wall' | 'emerge' | 'walk' | 'sink';
function poseD(rig: Rig, mode: DMode, k: number, moving: boolean, phase: number, t: number, o: { wind: number; strike: number; yaw: number; pitch: number; flinch: number; lost: Set<string>; seed: number }) {
  const R = (n: string, x = 0, y = 0, z = 0) => { const p = rig.parts[n]; if (p) p.rotation.set(x, y, z); };
  const noLeg = o.lost.has('thighL') || o.lost.has('thighR') || o.lost.has('shinL') || o.lost.has('shinR');
  // the head tilts in snaps, as if something inside it settles
  const snap = Math.floor(t * 0.9 + o.seed * 5);
  const tilt = (Math.sin(snap * 7.1) * 0.5 + 0.5 < 0.5 ? -1 : 1) * (0.18 + 0.2 * (Math.sin(snap * 3.3) * 0.5 + 0.5));
  if (mode === 'wall') {
    // pressed against the inside of the wallpaper: face and palms first, the rest of him in the board
    const breathe = Math.sin(t * 2.2) * 0.01;
    offset(rig, 'hips', 0, 0.02, -0.14 - (1 - k) * 0.08 + breathe);
    R('hips', 0); R('spine', 0.1); R('chest', 0.12); R('neck', 0.25); R('head', -0.3, o.yaw * 0.3, tilt * 0.6);
    R('uarmL', -0.32, 0, 0.75); R('farmL', 0.95, 0, 1.9); R('handL', -0.7, -1.4, 0);
    R('uarmR', -0.3, 0, -0.72); R('farmR', 0.95, 0, -1.95); R('handR', -0.7, 1.4, 0);
    // up on his toes inside the board, legs trailing back out of sight
    R('thighL', 0.32, 0, 0.04); R('thighR', 0.28, 0, -0.04); R('shinL', 0.15); R('shinR', 0.2); R('footL', 0.9); R('footR', 0.9);
    // fingers splay and curl against the paper
    const c = Math.max(0, Math.sin(t * 1.3)) * 0.4;
    R('fing1L', 0, 0, -c); R('fing2L', 0, 0, -c * 1.4); R('fing1R', 0, 0, c); R('fing2R', 0, 0, c * 1.4);
    return;
  }
  if (mode === 'emerge' || mode === 'sink') {
    // pulling himself out: head and hands through first, a long leg stepping over the skirting
    const e = mode === 'emerge' ? k : 1 - k;
    offset(rig, 'hips', 0, 0.0, -0.1 * (1 - e));
    R('spine', 0.45 * (1 - e) + 0.15); R('chest', 0.25 * (1 - e)); R('neck', 0.3 * (1 - e)); R('head', -0.5 * (1 - e) + o.pitch * 0.4, o.yaw * e * 0.5, tilt * 0.5);
    R('uarmL', -1.3 + e * 0.9, 0, 0.5 - e * 0.3); R('farmL', -0.6 * (1 - e) - 0.2, 0, 0); R('handL', -0.5 * (1 - e));
    R('uarmR', -1.4 + e * 0.95, 0, -0.5 + e * 0.3); R('farmR', -0.5 * (1 - e) - 0.2, 0, 0); R('handR', -0.5 * (1 - e));
    R('thighL', -0.9 * Math.sin(e * Math.PI), 0, 0.05); R('shinL', 1.2 * Math.sin(e * Math.PI)); R('thighR', 0.35 * (1 - e)); R('shinR', 0.2 * (1 - e));
    R('fing1L', 0, 0, -0.2); R('fing2L', 0, 0, -0.3); R('fing1R', 0, 0, 0.2); R('fing2R', 0, 0, 0.3);
    return;
  }
  // out in the open: long stiff strides, knees a little too high, arms trailing their long fingers
  const sw = moving ? Math.sin(phase * 0.8) : 0;
  const amp = noLeg ? 0.15 : 0.5;
  offset(rig, 'hips', 0, (moving ? Math.abs(Math.cos(phase * 0.8)) * 0.03 : 0) - (noLeg ? 0.55 : 0), 0);
  R('hips', noLeg ? 1.1 : 0, sw * 0.08, 0);
  R('thighL', sw * amp - (noLeg ? 1.1 : 0), 0, 0.03); R('thighR', -sw * amp - (noLeg ? 1.1 : 0), 0, -0.03);
  R('shinL', Math.max(0, -sw) * 0.8 + 0.05 + (noLeg ? 1 : 0)); R('shinR', Math.max(0, sw) * 0.8 + 0.05 + (noLeg ? 1 : 0));
  R('footL', Math.max(0, -sw) * -0.3); R('footR', Math.max(0, sw) * -0.3);
  const lean = 0.22 + o.strike * 0.35 - o.wind * 0.15;
  R('spine', lean, -sw * 0.06); R('chest', 0.08 + o.strike * 0.1);
  R('neck', 0.3 - (noLeg ? 0.8 : 0)); R('head', -0.18 + o.pitch * 0.5 - (noLeg ? 0.5 : 0), o.yaw * 0.7, tilt);
  // attack: the right arm drawn up and back, raked down across you with the fingers spread
  const W = o.wind, S = o.strike;
  R('uarmL', -sw * 0.28 - S * 1.2 - (noLeg ? 1.4 : 0), 0, 0.08 + W * 0.3); R('farmL', -0.12 - S * 0.25, 0, 0);
  R('uarmR', sw * 0.28 - W * 2.5 - S * 0.6 - (noLeg ? 1.2 : 0), W * 0.4, -0.08 - W * 0.4 + S * 0.3); R('farmR', -0.1 - W * 0.9 + S * 0.5, 0, 0); R('handR', W * 0.5 - S * 0.4);
  const cu = 0.15 + Math.sin(t * 1.7) * 0.1;
  R('fing1L', 0, 0, -cu); R('fing2L', 0, 0, -cu); R('fing1R', 0, 0, cu - S * 0.4); R('fing2R', 0, 0, cu - S * 0.3);
  if (o.flinch > 0) { const P = rig.parts.chest; P.rotation.x -= 0.3 * o.flinch; rig.parts.head.rotation.z += 0.4 * o.flinch; }
}

function animateDrywall(rig: Rig, c: Creature, t: number, dt: number) {
  const K = rig as KitRig, m = K.kit.m;
  if (K.kit.who !== c.id) { K.kit.who = c.id; kitPersonalize(K, Math.floor(idHash(c) * 3)); }
  kitSync(K);
  const n = nm(c);
  const ph = c.dead ? 2 : (n.ph ?? 2);
  if (ph !== m.lph) { m.lph = ph; m.pht = t; }
  suppressSighting(c, ph === 0);
  const crater = rig.parts.crater;
  const clip = K.kit.F.clip.value;
  if (ph === 0) { hideRig(c, rig); crater.visible = false; clip.w = 0; return; }
  // the wall he is in (replicated): everything behind its surface is not drawn
  const wp = n.wp as number[] | undefined;
  const inWall = ph === 1, emerging = c.state === 'emerge', sinking = c.state === 'flee' && !!wp && Math.hypot(c.x - wp[0], c.z - wp[1]) < 0.75;
  if (wp && (inWall || emerging || sinking) && !c.dead) {
    clip.set(wp[2], wp[3], wp[0] * wp[2] + wp[1] * wp[3] + 0.005, 1);
    crater.visible = true;
    // the crater stays on the wall where he came through
    const d = (c.x - wp[0]) * wp[2] + (c.z - wp[1]) * wp[3];
    crater.position.set(0, 0, -d + 0.012);
    crater.scale.setScalar(inWall ? Math.min(1, 0.3 + (t - m.pht) * 0.7) : 1);
  } else { clip.w = 0; crater.visible = false; }
  const tgt = nearestSurvivor(c, 12);
  let yaw = 0, pitch = 0;
  if (tgt) [yaw, pitch] = lookAngles(c, tgt.x, tgt.z, tgt.y, 1.9, 1.2, 0.6);
  const ac = attackCurve(rig, c, t);
  const o = { wind: ac.wind, strike: ac.strike, yaw: smooth(rig, '_yaw', yaw, 6, dt), pitch, flinch: flinchOf(c), lost: lostParts(c), seed: idHash(c) };
  if (c.dead) {
    // he goes stiff and falls like a sheet of board, the arms last
    m.deadT = (m.deadT ?? 0) + dt;
    poseD(rig, 'walk', 0, false, 0, t, o);
    const kk = Math.min(1, m.deadT * 3);
    rig.parts.uarmL.rotation.z = 0.08 + kk * 0.5; rig.parts.uarmR.rotation.z = -0.08 - kk * 0.4; rig.parts.head.rotation.z = kk * 0.6;
    return;
  }
  m.deadT = 0;
  if (inWall) poseD(rig, 'wall', Math.min(1, ease((t - m.pht) / 1.6)), false, 0, t, o);
  else if (emerging) poseD(rig, 'emerge', Math.min(1, ease(c.stateT / 0.8)), false, 0, t, o);
  else if (sinking) poseD(rig, 'sink', Math.min(1, Math.hypot(c.x - wp![0], c.z - wp![1]) / 0.6), false, 0, t, o);
  else poseD(rig, 'walk', 0, c.speed > 0.2, c.phase, t, o);
}

// ---------------------------------------------------------------- brain
function pin(c: Creature, s: WallSpot, out: number) {
  c.x = s.x + s.nx * out; c.z = s.z + s.nz * out;
  netSet(c, 'wp', [Math.round(s.x * 100) / 100, Math.round(s.z * 100) / 100, Math.round(s.nx * 100) / 100, Math.round(s.nz * 100) / 100]);
  c.facing = c.targetFacing = Math.atan2(s.nz, s.nx);
  stop(c);
}
/** a wall face next to the player, facing them, ideally behind their back */
function spotNear(c: Creature, p: Player): WallSpot | null {
  const z = zoneOf(c);
  const list = wallSpotsNear(z, p.x, p.z, 3).filter((s) => {
    const d = dist(s.x, s.z, p.x, p.z);
    if (d < 1.1 || d > 3.2) return false;
    if ((p.x - s.x) * s.nx + (p.z - s.z) * s.nz < 0.5) return false;
    return lineOfSight(z, s.x + s.nx * 0.4, s.z + s.nz * 0.4, p.x, p.z);
  });
  if (!list.length) return null;
  const behind = (s: WallSpot) => { let a = Math.atan2(s.z - p.z, s.x - p.x) - p.facing; a = Math.atan2(Math.sin(a), Math.cos(a)); return Math.abs(a) + CS().rng.float(0, 0.8); };
  list.sort((a, b) => behind(b) - behind(a));
  return list[0];
}
function nearestWall(c: Creature): WallSpot | null {
  const z = zoneOf(c);
  let best: WallSpot | null = null, bd = Infinity;
  for (const s of wallSpotsNear(z, c.x, c.z, 4)) {
    if ((c.x - s.x) * s.nx + (c.z - s.z) * s.nz < 0) continue; // must be on our side
    const d = dist(s.x, s.z, c.x, c.z);
    if (d < bd && lineOfSight(z, c.x, c.z, s.x + s.nx * 0.3, s.z + s.nz * 0.3)) { bd = d; best = s; }
  }
  return best;
}
function lonePrey(c: Creature, r = 24): Player | null {
  let best: Player | null = null, bd = r;
  for (const p of playersIn(c)) {
    if (!isAlone(p, 8)) continue;
    const d = dist(p.x, p.z, c.x, c.z);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}
function goTravel(c: Creature, s: WallSpot, then: 'hide' | 'watch') {
  c.mem.dest = s; c.mem.then = then;
  c.setState('travel'); netSet(c, 'ph', 0);
}

function thinkDrywall(c: Creature, dt: number): boolean {
  const cs = CS();
  const ev = pulse(c);
  const P = c.targetId ? G.players.get(c.targetId) ?? null : null;
  const inWall = c.state === 'hide' || c.state === 'travel' || c.state === 'watch';
  instFlags(c, { immortal: inWall, ghost: inWall || c.state === 'emerge' });
  c.radius = inWall ? 0.05 : 0.28;
  // first think: melt into the nearest wall
  if (!c.mem.spot && c.state !== 'travel') {
    const s = nearestWall(c) || wallSpotsNear(zoneOf(c), c.x, c.z, 8)[0];
    if (s) { c.mem.spot = s; pin(c, s, 0.02); c.setState('hide'); netSet(c, 'ph', 0); }
  }
  switch (c.state) {
    case 'hide': {
      if (c.mem.spot) pin(c, c.mem.spot, 0.02);
      netSet(c, 'ph', 0);
      if (G.time < (c.mem.cool ?? 0)) return true;
      const p = lonePrey(c);
      if (p) {
        const s = spotNear(c, p);
        if (s) { c.targetId = p.id; goTravel(c, s, 'watch'); }
      } else if (c.stateT > 20 && cs.rng.chance(dt * 0.05)) {
        // drift somewhere else inside the walls
        const s = wallSpotsNear(zoneOf(c), c.x + cs.rng.float(-12, 12), c.z + cs.rng.float(-12, 12), 4)[0];
        if (s) goTravel(c, s, 'hide');
      }
      return true;
    }
    case 'travel': {
      const s: WallSpot | undefined = c.mem.dest;
      if (!s) { c.setState('hide'); return true; }
      const tx = s.x + s.nx * 0.02, tz = s.z + s.nz * 0.02;
      const d = dist(tx, tz, c.x, c.z);
      const step = 3.4 * dt;
      if (d <= step) {
        c.mem.spot = s; pin(c, s, 0.02);
        const watch = c.mem.then === 'watch';
        c.setState(watch ? 'watch' : 'hide');
        if (watch) { netSet(c, 'ph', 1); sfx(c, 'scrape_wall', 0.9); c.mem.watchFor = 1.6 + cs.rng.float(0, 2.2); }
        return true;
      }
      c.x += ((tx - c.x) / d) * step; c.z += ((tz - c.z) / d) * step;
      c.facing = c.targetFacing = Math.atan2(tz - c.z, tx - c.x);
      c.speed = 0; c.vx = c.vz = 0;
      if ((c.mem.scrapeT ?? 0) < G.time) { c.mem.scrapeT = G.time + 2.2 + cs.rng.float(0, 1.5); sfx(c, 'scrape_wall', 0.6); }
      // the prey moved off: re-aim at a wall near where they are now
      if (c.mem.then === 'watch' && P && c.stateT > 1 && dist(P.x, P.z, s.x, s.z) > 3.6) {
        const s2 = spotNear(c, P); if (s2) c.mem.dest = s2; c.stateT = 0;
      }
      if (c.stateT > 15) c.setState('hide');
      return true;
    }
    case 'watch': {
      const s: WallSpot = c.mem.spot;
      pin(c, s, 0.02);
      netSet(c, 'ph', 1);
      if (!P || P.body.dead || P.zoneKey !== c.zoneKey) { c.setState('hide'); return true; }
      if (ev.staggered) { // a blow to the face in the wall: he pulls back
        c.mem.cool = G.time + 12; cs.call(c, 'hurt');
        const far = wallSpotsNear(zoneOf(c), c.x + cs.rng.float(-10, 10), c.z + cs.rng.float(-10, 10), 4)[0];
        if (far) goTravel(c, far, 'hide'); else c.setState('hide');
        return true;
      }
      const d = dist(P.x, P.z, c.x, c.z);
      if (!isAlone(P, 8) || d > 4.5) {
        // company, or they walked off: follow along the wall or give up
        if (isAlone(P, 8) && d < 14) { const s2 = spotNear(c, P); if (s2) { goTravel(c, s2, 'watch'); return true; } }
        c.setState('hide'); c.mem.cool = G.time + 4; return true;
      }
      if ((c.mem.scrapeT ?? 0) < G.time) { c.mem.scrapeT = G.time + 1.8; sfx(c, 'scrape_wall', 0.8); }
      if (c.stateT > (c.mem.watchFor ?? 2.5)) {
        c.setState('emerge'); netSet(c, 'ph', 2); cs.call(c, 'alert');
      }
      return true;
    }
    case 'emerge': {
      const s: WallSpot = c.mem.spot;
      const k = ease(c.stateT / 0.8);
      pin(c, s, lerp(0.02, 0.62, k));
      if (P) c.facing = c.targetFacing = Math.atan2(P.z - c.z, P.x - c.x) * k + Math.atan2(s.nz, s.nx) * (1 - k);
      if (c.stateT >= 0.8) { c.setState('chase'); c.mem.hits = 0; }
      return true;
    }
    case 'chase': {
      netSet(c, 'ph', 2);
      if (!P || P.body.dead || P.zoneKey !== c.zoneKey) { c.setState('flee'); return true; }
      const d = dist(P.x, P.z, c.x, c.z);
      if ((c.mem.hits ?? 0) >= 2 || c.stateT > 7 || !isAlone(P, 6) || c.hp < c.sp.hp * 0.55 || d > 9) { c.setState('flee'); return true; }
      const reach = (c.sp.attack?.range ?? 0.9) + P.radius;
      if (d <= reach) {
        faceTo(c, P.x, P.z); stop(c);
        if (c.attackT <= 0) { attack(c, P); c.mem.hits = (c.mem.hits ?? 0) + 1; }
        return true;
      }
      cs.moveTo(c, zoneOf(c), P.x, P.z, c.sp.run, dt, reach * 0.8);
      return true;
    }
    case 'flee': {
      netSet(c, 'ph', 2);
      // back to the nearest wall, then sink into it
      if (!c.mem.back) c.mem.back = nearestWall(c);
      const s: WallSpot | null = c.mem.back;
      if (!s) { if (cs.moveTo(c, zoneOf(c), c.home.x, c.home.z, c.sp.run, dt, 1) || c.stateT > 8) { c.mem.back = null; c.mem.spot = null; } return true; }
      const ex = s.x + s.nx * 0.6, ez = s.z + s.nz * 0.6;
      if (c.mem.sinkT === undefined) {
        if (cs.moveTo(c, zoneOf(c), ex, ez, c.sp.run, dt, 0.25) || c.stateT > 6) { c.mem.sinkT = 0; c.x = ex; c.z = ez; }
        return true;
      }
      instFlags(c, { ghost: true });
      c.mem.sinkT += dt;
      pin(c, s, lerp(0.6, 0.02, ease(c.mem.sinkT / 0.7)));
      if (c.mem.sinkT >= 0.7) {
        c.mem.sinkT = undefined; c.mem.back = null; c.mem.spot = s;
        c.mem.cool = G.time + 10 + cs.rng.float(0, 10);
        c.setState('hide'); netSet(c, 'ph', 0);
        sfx(c, 'scrape_wall', 0.7);
      }
      return true;
    }
    default:
      // 'idle' at spawn, or anything the manager set
      if (c.state === 'idle' || c.state === 'wander') { c.mem.spot = null; c.setState('hide'); }
      else { c.setState('flee'); }
      return true;
  }
}

const sp = def({
  key: 'drywall_man', name: 'Drywall Man', code: 'E-27 // PARIETAL', temperament: 'stalker', threat: 3,
  rule: { name: 'TAKES THE LONE ONE', text: 'He only steps out of the wall for someone alone. Stay close to a friend; hit the face in the wallpaper and he pulls back.' },
  hp: 55, walk: 1.3, run: 3.9, turn: 9, radius: 0.28, height: 2.05, sight: 14, fov: 1.6, hearing: 1.6,
  attack: { dmg: [8, 15], range: 0.95, cooldown: 1.2, kinds: ['laceration', 'scratch', 'deep'], corrupt: 0.15, knock: -0.3 },
  zones: ['office', 'tunnels', 'corrupt', 'house', 'school'], weight: 1.5, maxPerZone: 2, diet: 'meat',
  flags: { wallHider: true, ghost: true },
  sounds: { idle: 'scrape_wall', alert: 'plaster_crack', attack: 'drywall_wheeze', hurt: 'drywall_wheeze', death: 'drywall_die', step: 'pad' },
  scan: {
    cls: 'Wall-dweller / stalker',
    notes: [
      'Lives inside the walls. Moves through them like they are not there. Scraping follows you down corridors.',
      'Only comes out for someone who is alone. Stay within a few metres of a friend and he stays in the wall.',
      'A face pressing through the wallpaper means he is about to step out. Hit the face and he pulls back.',
      'Cannot be hurt while inside the wall. Out in the open he is thin and breaks like board.',
      'The SEER-9 radar still pings him behind the plaster.',
    ],
  },
  gore: { blood: 'plaster', sever: ['uarmL', 'uarmR', 'farmL', 'farmR', 'handL', 'handR', 'thighL', 'thighR', 'shinL', 'shinR'], head: 'head' },
  build: buildDrywall,
  animate: animateDrywall,
  think: thinkDrywall,
});
(sp as any).animateGallery = (rig: Rig, t: number) => {
  const K = rig as KitRig;
  kitSync(K);
  const q = galleryPose('');
  const o = { wind: 0, strike: 0, yaw: 0.3, pitch: 0, flinch: 0, lost: new Set<string>(), seed: 0.3 };
  const clip = K.kit.F.clip.value, crater = rig.parts.crater;
  const root = rig.root.position;
  crater.visible = false; clip.w = 0;
  if (q === 'wall' || q === 'emerge') {
    // a wall along the rig's back, 2 cm behind the pivot
    clip.set(0, 1, root.z - 0.02, 1); crater.visible = true; crater.position.set(0, 0, -0.008); crater.scale.setScalar(1);
    if (q === 'wall') { poseD(rig, 'wall', 1, false, 0, t, o); return; }
    const k = (t % 2.4) / 1.2;
    poseD(rig, 'emerge', Math.min(1, k), false, 0, t, o);
    rig.root.position.z = 5 + Math.min(1, k) * 0.6;
    clip.z = 5 - 0.02;
    crater.position.z = -(rig.root.position.z - 5) - 0.008;
    return;
  }
  rig.root.position.z = 5;
  if (q === 'attack') { const ph = (t % 1.2) / 1.2; o.wind = ph < 0.6 ? ph / 0.6 : 0; o.strike = ph >= 0.6 ? Math.min(1, (ph - 0.6) / 0.15) : 0; }
  if (q === 'crawl') o.lost.add('shinR');
  poseD(rig, 'walk', 0, q === 'walk' || q === 'crawl', t * 5, t, o);
};

// the horror layer: faceted wet materials, twitches, ragged breathing, lunges, recoils, a weighted death
horrify(sp, { twitch: 0.7, snap: 0.4 });
