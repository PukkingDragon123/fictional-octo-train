import * as THREE from 'three';
import { horrify } from '../kit/horror';
import { def, Rig } from '../species';
import { makeRamp, mixHex } from '../../gfx/pixel';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import type { Creature } from '../creature';
import type { Player } from '../../entities/player';
import { CS, zoneOf, pulse, attack, stop, faceTo, findSpot, onPlayerHit } from '../behaviors_a';
import { net, netOf, playAt, hashId, rng, localIn, thinkOnce, dist, lineOfSightB } from '../behaviors_b';
import { KitDef, KitRig, SkinB, BuildCtx, Page, Region, V3, Wt, Row, buildKitRig, kitSync, kitPersonalize, kitMaterial, kitFx, attackCurve, flinchOf, hash, tube, wLerp, lookAngles, nearestSurvivor } from '../kit/humanoids';
import { chain, sac, plate, paintCap, paintEye } from '../kit/organic';
import { ruleShown } from '../rules';
import { SIDES, absBones, say, linePoll, nearestUnit, gait, paintPlush, paintFelt, runs, soak, donor, fold, graft, donorTick } from './pg_common';
import type { HumanRig, Appearance } from '../../entities/humanRig';

// =====================================================================================
// THE DOODLEWUMPS — the four-to-six of them from "The Doodlewumps" (Bright Hour
// Television, 1996-1999), a pre-school show that went out at half past six in
// the morning. Big pear-shaped bodies of pastel terry plush embroidered with
// little stars, stubby legs, long soft arms that hang to the knee, a
// porcelain baby-doll face set into a plush hood, a bent set of rabbit-ear TV
// aerials on top, and a real cathode-ray screen sewn into the belly. The show
// used the screens for "Tummy Time": a short film on every belly. The screens
// still play. Usually static. When one of them sees you, the static clears and
// the screen shows your face, live, from where it is standing. Stay on its
// screen and it "tunes in" to you, and the longer it does the less of you is
// left watching. Fully tuned, it comes for a cuddle, and presses the hot glass
// to you.
//   pg_doodlewump   skinned kit rig (plush body, hood, the aerial, TV housing + bezel); the
//                   doll face is a HumanRig head (the survivors' own base, pale, bald) grafted
//                   into the hood; the glass has its own live 48x36 page (static, colour bars)
//                   and, when it sees you, goes clear over a second HumanRig head built from
//                   the local unit's own Appearance, pressed flat against the inside of it
// VIDEO / POSTER API (stand-alone):
//   buildDoodlewump(variant?)                         -> KitRig
//   poseDoodlewump(rig, t, dt, pose, { tune, screen }) pose: 'idle' | 'walk' | 'play' | 'stare' |
//                                                      'hug' | 'squeeze' | 'dead'
//                                                      screen: 'static' | 'face' | 'bars' | 'off'
// =====================================================================================

function bonesWump() {
  return absBones([
    ['base', '', [0, 0, 0]],
    ['hips', 'base', [0, 0.42, 0]],
    ['body', 'hips', [0, 0.64, 0.04]],
    ['screen', 'body', [0, 0.66, 0.4]],
    ['chest', 'hips', [0, 0.95, 0]],
    ['head', 'chest', [0, 1.18, 0.03], true],
    ['antenna', 'head', [0, 1.44, -0.01]],
    ['antL', 'antenna', [0.02, 1.46, -0.01]], ['antLt', 'antL', [0.17, 1.74, -0.05]],
    ['antR', 'antenna', [-0.02, 1.46, -0.01]], ['antRt', 'antR', [-0.13, 1.75, 0.03]],
    ['uarmL', 'chest', [0.3, 1.0, 0.0], true], ['farmL', 'uarmL', [0.36, 0.74, 0.04], true], ['handL', 'farmL', [0.385, 0.5, 0.06], true],
    ['uarmR', 'chest', [-0.3, 1.0, 0.0], true], ['farmR', 'uarmR', [-0.36, 0.74, 0.04], true], ['handR', 'farmR', [-0.385, 0.5, 0.06], true],
    ['thighL', 'hips', [0.15, 0.36, 0.0], true], ['shinL', 'thighL', [0.16, 0.21, 0.01]], ['footL', 'shinL', [0.16, 0.08, 0.02]],
    ['thighR', 'hips', [-0.15, 0.36, 0.0], true], ['shinR', 'thighR', [-0.16, 0.21, 0.01]], ['footR', 'shinR', [-0.16, 0.08, 0.02]],
  ]);
}
function layoutWump(p: Page) {
  p.reg('BODY', 96, 76, [0.22, 1.49]);
  p.reg('ARM', 28, 36);
  p.reg('LEG', 28, 20);
  p.reg('MITT', 24, 20);
  p.reg('FOOT', 28, 20);
  p.reg('HOOD', 40, 12);
  p.reg('BEZEL', 40, 32);
  p.reg('PLAST', 24, 16);
  p.reg('KNOB', 8, 8);
  p.reg('ROD', 8, 24);
  p.reg('BALL', 8, 8);
  p.reg('CAP', 16, 16);
}
const BODY: Row[] = [
  { y: 0.22, rx: 0.14, rf: 0.14, rb: 0.14 },
  { y: 0.3, rx: 0.3, rf: 0.3, rb: 0.3 },
  { y: 0.42, rx: 0.4, rf: 0.41, rb: 0.38 },
  { y: 0.58, rx: 0.43, rf: 0.45, rb: 0.4, cz: 0.01 },
  { y: 0.76, rx: 0.4, rf: 0.43, rb: 0.37, cz: 0.01 },
  { y: 0.92, rx: 0.33, rf: 0.34, rb: 0.31 },
  { y: 1.04, rx: 0.27, rf: 0.28, rb: 0.27 },
  { y: 1.16, rx: 0.255, rf: 0.27, rb: 0.255 },
  { y: 1.28, rx: 0.235, rf: 0.245, rb: 0.24 },
  { y: 1.38, rx: 0.18, rf: 0.17, rb: 0.19 },
  { y: 1.45, rx: 0.09, rf: 0.08, rb: 0.1 },
];
const FC: V3 = [0, 1.215, 0.235];   // the middle of the face

function buildWump(B: SkinB, x: BuildCtx) {
  const bi = x.bi, R = x.R;
  const H = bi('hips'), BO = bi('body'), CH = bi('chest'), HD = bi('head');
  tube(B, {
    rows: BODY, ys: [0.22, 0.26, 0.3, 0.36, 0.42, 0.5, 0.58, 0.67, 0.76, 0.84, 0.92, 0.98, 1.04, 1.1, 1.16, 1.22, 1.28, 1.33, 1.38, 1.42, 1.45], n: 18, reg: R('BODY'), vr: R('BODY').range, g: 1,
    w: (y, p) => {
      const front = Math.max(0, Math.min(1, (p[2] - 0.1) / 0.25)) * Math.max(0, 1 - Math.abs(y - 0.64) / 0.3);
      const base: Wt = y < 0.5 ? [H, 1] : y < 0.88 ? wLerp(y, 0.5, 0.88, H, CH) : y < 1.06 ? [CH, 1] : wLerp(y, 1.06, 1.16, CH, HD);
      return front > 0.05 ? [...base.map((q, i) => (i % 2 ? q * (1 - front) : q)), BO, front] : base;
    },
    // the hood: the face is set in, the plush puffs round it; soft stuffing lumps; a seam down each side
    bump: (th, y) => {
      const fx = Math.sin(th) * 0.27, fy = y - FC[1];
      const inFace = (fx / 0.165) ** 2 + (fy / 0.15) ** 2;
      const hole = Math.cos(th) > 0 ? -0.24 * Math.exp(-inFace * inFace * 1.6) + 0.08 * Math.exp(-((Math.sqrt(inFace) - 1.12) ** 2) / 0.02) : 0;
      return hole + 0.02 * Math.sin(th * 6 + y * 11) + 0.015 * Math.sin(th * 3 - y * 17) - 0.03 * Math.exp(-((Math.abs(th) - Math.PI / 2) ** 2) / 0.01);
    },
    start: [0, 0.2, 0], end: [0, 1.48, -0.005],
  });
  // ---- the face is a HumanRig head grafted in at decorate (attachDoll); the rolled plush rim round it
  const rim: V3[] = [];
  for (let i = 0; i <= 18; i++) { const a = (i / 18) * Math.PI * 2; rim.push([Math.sin(a) * 0.178, FC[1] + Math.cos(a) * 0.162, FC[2] - 0.015 + Math.abs(Math.cos(a)) * -0.01]); }
  sac(B, R('HOOD'), 6, rim, rim.map(() => [0.034, 0.03] as [number, number]), rim.map((p) => (p[1] < 1.1 ? [CH, 0.3, HD, 0.7] : [HD, 1])), { n: 8, start: false, end: false, up: [0, 0, 1] });
  // ---- the aerial: a black knob, two telescopic rods (one bent), a ball on each tip
  sac(B, R('KNOB'), 7, [[0, 1.425, -0.01], [0, 1.455, -0.01], [0, 1.475, -0.01]], [[0.05, 0.045], [0.04, 0.036], [0.022, 0.02]], [[HD, 1], [bi('antenna'), 1], [bi('antenna'), 1]], { n: 10, up: [0, 0, 1] });
  for (const [sd] of SIDES) {
    chain(B, x, R('ROD'), 8, { bones: ['ant' + sd], tip: x.rest('ant' + sd + 't'), r: (t) => (t < 0.5 ? 0.0075 : 0.0055), n: 5, rings: 5, start: true, end: false,
      bend: sd === 'R' ? () => [-0.035, -0.02, 0.03] : undefined });
    const tp = x.rest('ant' + sd + 't'), w: Wt = [bi('ant' + sd), 1];
    sac(B, R('BALL'), 9, [[tp[0], tp[1] - 0.012, tp[2]], [tp[0], tp[1] + 0.002, tp[2]], [tp[0], tp[1] + 0.014, tp[2]]], [[0.011, 0.011], [0.015, 0.015], [0.008, 0.008]], [w, w, w], { n: 8, up: [0, 0, 1] });
  }
  // ---- the TV in its belly: a plastic housing pushed into the plush, the bezel, two knobs, the speaker slot
  const SC = bi('screen'), wS: Wt = [SC, 1];
  B.box([0, 0.665, 0.39], [0.4, 0.33, 0.12], null, R('PLAST'), wS, [0, 0, 1, 1], 0.92);
  plate(B, R('BEZEL'), 10, [0, 0.665, 0.452], [1, 0, 0], [0, 1, 0], 0.205, 0.17, 0.012, wS, { rows: 4, cols: 6, oval: 0 });
  for (const kx of [0.11, 0.16]) sac(B, R('KNOB'), 11, [[kx, 0.535, 0.452], [kx, 0.535, 0.472], [kx, 0.535, 0.48]], [[0.016, 0.016], [0.015, 0.015], [0.009, 0.009]], [wS, wS, wS], { n: 8, up: [0, 1, 0] });
  // ---- arms: long, soft, hanging past the hips, a mitten each
  for (const [sd, k] of SIDES) {
    chain(B, x, R('ARM'), 12 + (k > 0 ? 0 : 1), { bones: ['uarm' + sd, 'farm' + sd, 'hand' + sd], tip: x.rest('hand' + sd), r: (t) => 0.078 - t * 0.016 + 0.006 * Math.sin(t * 9), n: 9, rings: 4, start: true, end: false });
    const h = x.rest('hand' + sd), wH: Wt = [bi('hand' + sd), 1];
    sac(B, R('MITT'), 14 + (k > 0 ? 0 : 1), [[h[0], h[1] + 0.02, h[2]], [h[0] + k * 0.005, h[1] - 0.05, h[2] + 0.005], [h[0] + k * 0.008, h[1] - 0.12, h[2] + 0.01], [h[0] + k * 0.008, h[1] - 0.15, h[2] + 0.01]],
      [[0.06, 0.045], [0.072, 0.042], [0.062, 0.036], [0.03, 0.02]], [[bi('farm' + sd), 0.4, bi('hand' + sd), 0.6], wH, wH, wH], { n: 10, up: [k, 0, 0] });
    sac(B, R('MITT'), 16 + (k > 0 ? 0 : 1), [[h[0] - k * 0.01, h[1] - 0.03, h[2] + 0.05], [h[0] - k * 0.018, h[1] - 0.07, h[2] + 0.075], [h[0] - k * 0.02, h[1] - 0.09, h[2] + 0.08]], [[0.025, 0.02], [0.02, 0.016], [0.008, 0.008]], [wH, wH, wH], { n: 7 });
  }
  // ---- stubby legs, round booties
  for (const [sd, k] of SIDES) {
    chain(B, x, R('LEG'), 18 + (k > 0 ? 0 : 1), { bones: ['thigh' + sd, 'shin' + sd, 'foot' + sd], tip: x.rest('foot' + sd), r: (t) => 0.13 - t * 0.02, n: 10, rings: 3, start: true, end: false });
    const f = x.rest('foot' + sd), wF: Wt = [bi('foot' + sd), 1];
    sac(B, R('FOOT'), 20 + (k > 0 ? 0 : 1), [[f[0], 0.07, f[2] - 0.08], [f[0] + k * 0.005, 0.068, f[2] + 0.0], [f[0] + k * 0.01, 0.062, f[2] + 0.1], [f[0] + k * 0.01, 0.055, f[2] + 0.15]],
      [[0.1, 0.07], [0.115, 0.07], [0.105, 0.062], [0.05, 0.04]], [wF, wF, wF, wF], { n: 12, up: [0, 1, 0] });
  }
}

const PAL = [
  { body: 0xc4b294, star: 0xe88a96, sole: 0xeee2c8 },
  { body: 0xc8786a, star: 0xb8e0cc, sole: 0xf0dcc8 },
  { body: 0x7694c0, star: 0xf4e08a, sole: 0xe8e0d0 },
];
function paintWump(p: Page, x: BuildCtx) {
  const v = x.variant % 3, C = PAL[v], sd = x.seed % 997;
  const PL = makeRamp(C.body, 9, { hueShift: 0.03, spread: 0.55 }), STAR = makeRamp(C.star, 4, { spread: 0.3 });
  const DIRT = makeRamp(0x5a5a3a, 5, { spread: 0.5 }), OIL = makeRamp(0x240a0a, 5, { spread: 0.5, hueShift: 0.02 });
  // body: terry plush, an embroidered star every so often, grass and dirt at the bottom, a dark leak from under the TV
  const Bd = p.R('BODY');
  paintPlush(Bd, PL, { seed: sd + 1, pile: 0.75, matted: 5 });
  const star = (cx: number, cy: number, r: number, c: number) => {
    for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + (k * Math.PI * 2) / 5; Bd.line(cx, cy, cx + Math.cos(a) * r, cy + Math.sin(a) * r, c, 0.9); }
    Bd.set(cx, cy, c);
  };
  for (let j = 0; j < 6; j++) for (let i = 0; i < 9; i++) {
    const cx = (i + (j & 1) * 0.5) * (Bd.w / 9) + 3, cy = 6 + j * (Bd.h / 6.2);
    if (Math.abs(Bd.deg(cx)) < 40 && cy > Bd.Y(0.98) && cy < Bd.Y(0.4)) continue;   // not under the TV
    if (hash(i, j + sd) < 0.18) continue;
    star(cx, cy, 2, STAR[1 + ((i + j) % 3)]);
  }
  for (const a of [90, -90]) for (let yy = 0; yy < Bd.h; yy += 2) { Bd.blend(Bd.X(a), yy, PL[1], 0.8); Bd.set(Bd.X(a) + (yy % 4 === 0 ? 1 : -1), yy, PL[6]); }
  for (let yy = Math.floor(Bd.h * 0.8); yy < Bd.h; yy++) for (let xx = 0; xx < Bd.w; xx++) if (hash(xx, yy + sd) < (yy / Bd.h - 0.8) * 4) Bd.blend(xx, yy, DIRT[1 + (xx & 1)], 0.5);
  for (let i = 0; i < 5; i++) Bd.glow(Bd.X(-60 + hash(i, sd + 3) * 120), Bd.h * (0.8 + hash(i, 4) * 0.15), 4, 2.5, 0x4a7a24, 0.35);
  soak(Bd, Bd.X(0), Bd.Y(0.48), 9, 4, OIL, sd + 5);
  runs(Bd, Bd.X(-6), Bd.Y(0.49), 3, Bd.h * 0.25, OIL, sd + 6, 1);
  runs(Bd, Bd.X(10), Bd.Y(0.5), 2, Bd.h * 0.18, OIL, sd + 7, 1);
  // the hood rim: the same plush, a bit darker
  paintPlush(p.R('HOOD'), PL, { seed: sd + 8, base: 3.8, pile: 0.9 });
  // the TV: cream plastic gone yellow, the bezel's dark recess, a speaker slot, the brand worn off
  const PS = makeRamp(0xd8cca8, 6, { spread: 0.35 });
  paintFelt(p.R('PLAST'), PS, sd + 12, 3.4);
  const Bz = p.R('BEZEL');
  Bz.fill(PS, (xx, yy) => 3.6 + (Bz.fbm(xx, yy, 3, 2, sd + 13) - 0.5) * 0.6 - (yy / Bz.h) * 0.6, undefined, 0.4);
  Bz.rect(4, 3, Bz.w - 8, Bz.h - 10, 0x141414);
  for (let xx = 6; xx < 18; xx += 2) Bz.vline(xx, Bz.h - 5, Bz.h - 3, 0x5a5444, 0.9);
  for (let i = 0; i < 6; i++) Bz.blob(hash(i, sd + 14) * Bz.w, Bz.h * (0.75 + hash(i, 15) * 0.25), 1.5, 1, 0x6a5a3a, 0.7);
  p.R('KNOB').fill(makeRamp(0x2a2826, 4), (xx, yy) => 1.5 + (yy < 3 ? 1 : 0) + (hash(xx, yy) - 0.5) * 0.4);
  p.R('ROD').fill(makeRamp(0xa8acb0, 5, { spread: 0.5 }), (xx, yy) => 2.6 + Math.cos(((xx + 0.5) / 8) * Math.PI * 2) * 1.4 + (yy % 6 === 0 ? -1 : 0));
  p.R('BALL').fill(makeRamp(0xc8ccd0, 4), (xx, yy) => 2 + Math.cos(((xx + 0.5) / 8) * Math.PI * 2));
  // limbs: plush; mitts and booties a lighter shade with dirt on the soles
  paintPlush(p.R('ARM'), PL, { seed: sd + 16, pile: 0.75 });
  paintPlush(p.R('LEG'), PL, { seed: sd + 17, pile: 0.75 });
  const SO = makeRamp(C.sole, 6, { spread: 0.4 });
  paintPlush(p.R('MITT'), SO, { seed: sd + 18, pile: 0.5 });
  const Ft = p.R('FOOT');
  paintPlush(Ft, SO, { seed: sd + 19, pile: 0.5 });
  for (let yy = 0; yy < Ft.h; yy++) for (let xx = 0; xx < Ft.w; xx++) if (xx < Ft.w * 0.15 || xx > Ft.w * 0.85) Ft.put(xx, yy, DIRT, 1.4 + (hash(xx, yy) - 0.5), 0.6);
  paintCap(p.R('CAP'), C.body, 0xe8e0d0, 0x2a0a0a);
}

// ------------------------------------------------------------------ the glass: its own little live page
const SW = 48, SH = 36;
interface Screen { tex: THREE.DataTexture; data: Uint8Array; mesh: THREE.Mesh; t: number; mode: string; roll: number }
function screenGeo(): THREE.BufferGeometry {
  const B = new SkinB(SW, SH);
  plate(B, new Region(null, 'glass', 0, 0, SW, SH), 0, [0, 0, 0], [1, 0, 0], [0, 1, 0], 0.155, 0.118, 0.018, [0, 1], { rows: 4, cols: 6, oval: 0.2, emis: 0.95 });
  return B.build([0, 0, 0, 0.3]);
}
let GEO: THREE.BufferGeometry | null = null;
function attachScreen(rig: KitRig) {
  const data = new Uint8Array(SW * SH * 4);
  const tex = new THREE.DataTexture(data, SW, SH, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true;
  const mat = kitMaterial(tex, kitFx());
  mat.transparent = true; mat.depthWrite = false;
  const mesh = new THREE.Mesh(GEO ??= screenGeo(), mat);
  mesh.position.set(0, 0.005, 0.085);
  mesh.renderOrder = 2;
  mesh.name = 'pg_screen';
  rig.parts.screen.add(mesh);
  rig.kit.m.scr = { tex, data, mesh, t: 0, mode: '', roll: 0 } as Screen;
}
const px = (s: Screen, x: number, y: number, c: number, a = 1) => {
  if (x < 0 || y < 0 || x >= SW || y >= SH) return;
  const i = ((SH - 1 - Math.floor(y)) * SW + Math.floor(x)) * 4, d = s.data;
  d[i] = d[i] + (((c >> 16) & 255) - d[i]) * a; d[i + 1] = d[i + 1] + (((c >> 8) & 255) - d[i + 1]) * a; d[i + 2] = d[i + 2] + ((c & 255) - d[i + 2]) * a; d[i + 3] = 255;
};
const BARS = [0xc0c0c0, 0xc0c000, 0x00c0c0, 0x00c000, 0xc000c0, 0xc00000, 0x0000c0];
/** repaint the glass: 'static', 'bars', 'face' (the local unit's own face, live), 'off'; tune 0..1 makes the face worse */
function paintScreen(s: Screen, mode: string, tune: number, crack: number, flash: number) {
  const r = Math.random;
  s.roll = (s.roll + 1.3) % SH;
  if (mode === 'off') { for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) px(s, x, y, 0x0c100e); px(s, SW / 2, SH / 2, 0x6a7a70); }
  else if (mode === 'bars') {
    for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) px(s, x, y, y < SH * 0.72 ? BARS[Math.floor((x / SW) * 7)] : (x < SW * 0.3 ? 0x101040 : x < SW * 0.6 ? 0xe8e8e8 : 0x200030));
    for (let x = 0; x < SW; x++) px(s, x, (s.roll + 4) % SH, 0x000000, 0.25);
  } else if (mode === 'face') {
    // the picture clears: dark glass, scanlines, snow, a red dot; what shows through is the head pressed against it
    for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) px(s, x, y, y % 2 ? 0x0a1620 : 0x020608);
    for (let i = 0; i < 30 + tune * 200; i++) px(s, r() * SW, r() * SH, r() < 0.5 ? 0xffffff : 0x000000, 0.6);
    if (tune > 0.6) for (let x = 0; x < SW; x++) px(s, x, (s.roll * 2) % SH, 0xffffff, 0.5);
    if (tune > 0.5) for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) px(s, x, y, 0x9a0a0a, (tune - 0.5) * 0.5);
    if (Math.floor(s.t * 2) % 2 === 0) for (let y = 2; y < 5; y++) for (let x = 2; x < 5; x++) px(s, x, y, 0xe82020);
  } else {
    for (let y = 0; y < SH; y++) {
      const band = Math.abs(y - s.roll) < 3 ? 0.55 : 1;
      for (let x = 0; x < SW; x++) { const g = Math.floor(r() * 210 * band) + 20; px(s, x, y, (g << 16) | (g << 8) | g); }
    }
  }
  if (flash > 0) for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) px(s, x, y, 0xfff8f0, flash);
  // the vignette of the tube, and the cracks when it is hurt
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) { const dx = (x + 0.5) / SW - 0.5, dy = (y + 0.5) / SH - 0.5; const v = Math.max(0, dx * dx * 2.2 + dy * dy * 2.6 - 0.18); if (v > 0) px(s, x, y, 0x000000, Math.min(0.85, v * 2.4)); }
  if (crack > 0) {
    const L = (x0: number, y0: number, a: number, n: number) => { let x = x0, y = y0; for (let i = 0; i < n; i++) { px(s, x, y, 0xffffff, 0.85); px(s, x + 1, y, 0x000000, 0.6); x += Math.cos(a + Math.sin(i * 1.7) * 0.4); y += Math.sin(a + Math.sin(i * 1.7) * 0.4); } };
    L(30, 12, 2.5, 22); L(30, 12, 0.4, 14); L(30, 12, -1.6, 10); L(30, 12, 1.4, 18);
    for (let y = 8; y < 17; y++) for (let x = 26; x < 34; x++) if (Math.hypot(x - 30, y - 12) < 3.2) px(s, x, y, 0x000000, 0.9);
  }
  // the glass is clear only while it shows you: scanlines and snow stay on it, the edges stay dark
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
    const i = ((SH - 1 - y) * SW + x) * 4;
    if (mode !== 'face') { s.data[i + 3] = 255; continue; }
    const dx = (x + 0.5) / SW - 0.5, dy = (y + 0.5) / SH - 0.5, v = Math.max(0, dx * dx * 2.2 + dy * dy * 2.6 - 0.12);
    const lum = s.data[i] + s.data[i + 1] + s.data[i + 2];
    const red = s.data[i] > 180 && s.data[i + 1] < 80;
    s.data[i + 3] = red && x < 6 && y < 6 ? 255 : Math.min(255, (y % 2 ? 70 : 36) + v * 420 + (lum > 600 ? 120 : 0) + tune * 40);
  }
  s.tex.needsUpdate = true;
}

// ------------------------------------------------------------------ the human parts: the doll's head, and you on the glass
/** the doll: a pale, bald HumanRig head with glassy eyes, set into the hood */
const DOLL: Partial<Appearance>[] = [
  { skin: 0xf3d2b8, hair: 0xd8c08a, hairStyle: 'bald', face: 1, eyeColor: 0x4a7ab8, build: 'slim', height: 0.96, age: 0, freckles: 0.2 },
  { skin: 0xf0d6c4, hair: 0x9c7a46, hairStyle: 'bald', face: 3, eyeColor: 0x6a4a2a, build: 'slim', height: 0.96, age: 0, freckles: 0 },
  { skin: 0xf3d2b8, hair: 0xd8c08a, hairStyle: 'bald', face: 5, eyeColor: 0x5a8a5a, build: 'slim', height: 0.96, age: 0, freckles: 0.4 },
];
function attachDoll(rig: KitRig, variant: number) {
  const v = variant % 3;
  const hr = donor('pg_wump_doll:' + v, DOLL[v], { pale: 2, dirt: 1, blood: { head: 1 } }, 'smile');
  fold(hr, rig.parts.head, [0, -0.13, -0.03]);
  graft(hr, 'head', rig.parts.head, [0, -0.031, 0.095], [0, 0, 0], [1.1, 1.1, 1.0]);
  rig.kit.m.doll = hr;
}
/** you, on the screen: a HumanRig head made from the local unit's own appearance, pressed flat inside the glass */
function screenHead(rig: KitRig): HumanRig {
  const app = ((G as any)?.local as Player | undefined)?.app ?? { skin: 0xe8b98f, hair: 0x3b2a1e, hairStyle: 'short', face: 2, eyeColor: 0x4a3a2a } as Partial<Appearance>;
  const key = 'pg_wump_screen:' + JSON.stringify(app);
  const m = rig.kit.m as Record<string, any>;
  if (m.scrHead && m.scrKey === key) return m.scrHead;
  if (m.scrHead) (m.scrHead as HumanRig).root.removeFromParent();
  const hr = donor(key, app, {}, 'fear');
  fold(hr, rig.parts.screen, [0, -0.05, -0.05]);
  graft(hr, 'head', rig.parts.screen, [0, -0.05, 0.061], [0, 0, 0], [0.95, 0.95, 0.14]);
  m.scrHead = hr; m.scrKey = key;
  return hr;
}
/** per frame: both human parts live; the screen head shows only while the glass shows you */
function humansStep(K: KitRig, dt: number, mode: string, tune: number, yaw: number, flash: number) {
  const m = K.kit.m as Record<string, any>;
  const doll = m.doll as HumanRig | undefined;
  if (doll) {
    donorTick(doll, dt, flash);
    const want = tune > 0.75 ? 'grin' : tune > 0.3 ? 'happy' : 'smile';
    if (m.dollExpr !== want) { m.dollExpr = want; doll.setExpression(want); }
    doll.lookEyes(Math.max(-2, Math.min(2, -yaw * 2.2)), 0.2);
  }
  const face = mode === 'face';
  if (face || m.scrHead) {
    const hr = face ? screenHead(K) : (m.scrHead as HumanRig);
    hr.root.visible = face;
    if (face) {
      donorTick(hr, dt, 0.28 + tune * 0.2);
      const want = tune > 0.6 ? 'pain' : 'fear';
      if (m.scrExpr !== want) { m.scrExpr = want; hr.setExpression(want); }
      hr.lookEyes(0, 0.4);
      const head = hr.bones.head, g0 = head.userData.g0;
      // the closer it tunes, the harder the face is pressed to the glass
      if (g0) head.scale.set(0.95 + tune * 0.12, 0.95 + tune * 0.12, 0.14 * (1 - tune * 0.4));
    }
  }
}

const WUMP_KIT: KitDef = { key: 'pg_doodlewump', variants: 3, W: 256, H: 256, bones: bonesWump, layout: layoutWump, build: buildWump, paint: paintWump, sphere: [0, 0.8, 0, 1.0], decorate: (rig, e) => { attachScreen(rig); attachDoll(rig, e.variant); } };
/** a Doodlewump rig (variant 0 oatmeal, 1 coral, 2 powder blue) */
export function buildDoodlewump(variant = 0): KitRig { return buildKitRig(WUMP_KIT, variant, 1.45); }

// ------------------------------------------------------------------ animation
export type WumpPose = 'idle' | 'walk' | 'play' | 'stare' | 'hug' | 'squeeze' | 'dead';
interface WumpDrive { t: number; dt: number; speed: number; md: string; mdT: number; tune: number; atk: number; flinch: number; dead: number; seed: number; yaw: number; pitch: number }
const NAMES = ['hips', 'body', 'chest', 'head', 'antenna', 'antL', 'antR', 'uarmL', 'farmL', 'handL', 'uarmR', 'farmR', 'handR', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'];
function poseWumpRig(K: KitRig, d: WumpDrive) {
  const P = K.parts, ud = K.kit.m as Record<string, number>, t = d.t, s7 = d.seed * 7;
  for (const n of NAMES) P[n]?.rotation.set(0, 0, 0);
  if (P.hips.userData.p0) P.hips.position.copy(P.hips.userData.p0);
  P.base.rotation.set(0, 0, 0); P.base.position.set(0, 0, 0);
  const run = d.md === 'hug' ? 1 : 0;
  const mv = Math.min(1, d.speed / (run ? 2.4 : 0.6)) * (1 - d.dead);
  ud.ph = (ud.ph ?? 0) + d.dt * (run ? 9 : 6) * Math.min(1.4, d.speed / (run ? 2.4 : 0.6) + 0.05);
  const g = gait(P, { ph: ud.ph, mv, stride: run ? 0.7 : 0.45, knee: run ? 0.9 : 0.5, arm: run ? 0.1 : 0.5, bounce: run ? 0.05 : 0.035, waddle: 0.28 });
  P.hips.position.y += g.bob;
  P.base.rotation.z = g.sway * 0.6;
  P.chest.rotation.z = -g.sway * 0.3;
  const br = Math.sin(t * 1.9 + s7);
  P.body.scale.set(1 + br * 0.012, 1 - br * 0.008, 1 + br * 0.015);
  // the head tilts like a puppy listening; toward the unit while it stares
  P.head.rotation.set(d.pitch * 0.5, d.yaw * 0.7, Math.sin(t * 0.6 + s7) * 0.15);
  // the aerial: springs, wobbling at every step, quivering while it tunes
  const q = d.tune * Math.sin(t * 31) * 0.05;
  P.antL.rotation.set(Math.sin(t * 2.7 + 1) * 0.06 + g.bob * 2 + q, 0, Math.sin(t * 2.1) * 0.08 + q);
  P.antR.rotation.set(Math.sin(t * 2.3) * 0.06 + g.bob * 2 - q, 0, Math.sin(t * 1.9 + 2) * 0.08);
  P.antenna.rotation.y = Math.sin(t * 0.4 + s7) * 0.2;
  if (d.md === 'play') {
    // a bounce on the spot, arms up, a turn
    const b = Math.abs(Math.sin(t * 4.5));
    P.hips.position.y += b * 0.12;
    for (const [s, k] of SIDES) { P['uarm' + s].rotation.set(-2.4 + Math.sin(t * 9 + k) * 0.2, 0, k * 0.5); P['farm' + s].rotation.set(-0.3, 0, 0); P['thigh' + s].rotation.x = -b * 0.3; P['shin' + s].rotation.x = b * 0.5; }
    P.base.rotation.y = Math.sin(t * 1.1) * 0.6;
  } else if (d.md === 'tune' || d.md === 'stare') {
    // dead still but for a slow rock; leaning in; the arms coming up to hold you
    const reach = 0.25 + d.tune * 0.7;
    P.hips.rotation.x = 0.06 + d.tune * 0.08; P.base.rotation.z = Math.sin(t * 1.2) * 0.04;
    for (const [s, k] of SIDES) { P['uarm' + s].rotation.set(-reach * 1.2, 0, k * (0.2 + d.tune * 0.15)); P['farm' + s].rotation.set(-reach * 0.6, 0, 0); P['hand' + s].rotation.x = -0.2 * d.tune; }
    P.head.rotation.z += Math.sin(t * 0.8) * 0.1 * (1 - d.tune) + 0.35 * d.tune;
  } else if (d.md === 'hug') {
    for (const [s, k] of SIDES) { P['uarm' + s].rotation.set(-1.45 + Math.sin(t * 12 + k) * 0.1, 0, k * 0.35); P['farm' + s].rotation.set(-0.2, 0, 0); }
    P.hips.rotation.x = 0.15;
  } else if (d.md === 'squeeze') {
    const c = Math.min(1, d.mdT / 0.3);
    for (const [s, k] of SIDES) { P['uarm' + s].rotation.set(-1.35, 0, k * (0.35 - c * 0.75)); P['farm' + s].rotation.set(-0.6 - c * 0.8, 0, 0); }
    P.hips.rotation.x = 0.2 + Math.sin(t * 25) * 0.02;
  } else {
    // idle and walk: the arms swing loose from the shoulders
    for (const [s, k] of SIDES) { P['uarm' + s].rotation.x += Math.sin(t * 1.3 + k) * 0.05 * (1 - mv); P['uarm' + s].rotation.z += k * 0.05; }
  }
  if (d.atk > 0) for (const [s, k] of SIDES) { P['uarm' + s].rotation.x = -1.5; P['uarm' + s].rotation.z = k * (0.4 - d.atk * 0.7); }
  if (d.dead > 0) {
    const k = d.dead;
    P.hips.position.y -= 0.18 * k; P.head.rotation.x += 0.7 * k; P.head.rotation.z += 0.4 * k;
    for (const [s, k2] of SIDES) { P['uarm' + s].rotation.set(0.1 * k, 0, k2 * 0.7 * k); P['thigh' + s].rotation.set(-1.3 * k, 0, k2 * 0.4 * k); P['shin' + s].rotation.x = 0.3 * k; }
    P.antL.rotation.z += 0.8 * k; P.antR.rotation.x += 0.6 * k;
  }
  if (d.flinch > 0) { P.chest.rotation.x -= d.flinch * 0.2; P.hips.position.x += Math.sin(t * 70) * 0.01 * d.flinch; }
}
/** the screen's mode for this frame and repaint (about 12 times a second) */
function screenStep(K: KitRig, dt: number, mode: string, tune: number, crack: number, flash: number) {
  const s = K.kit.m.scr as Screen | undefined;
  if (!s) return;
  s.t += dt;
  const due = (K.kit.m.scrDue ?? 0) - dt;
  K.kit.m.scrDue = due;
  if (due > 0 && mode === s.mode) return;
  K.kit.m.scrDue = 1 / 12;
  s.mode = mode;
  paintScreen(s, mode, tune, crack, flash);
}

function animateWump(rig: Rig, c: Creature, t: number, dt: number) {
  const K = rig as KitRig;
  const v = Math.floor(hashId(c.id) * 3);
  if (K.kit.who !== c.id) { K.kit.who = c.id; kitPersonalize(K, v); }
  kitSync(K);
  const n = netOf(c), ud = K.kit.m as Record<string, number>;
  if (n.md !== ud.lmd) { ud.lmd = n.md; ud.mdT = 0; }
  ud.mdT = (ud.mdT ?? 0) + dt;
  const ac = attackCurve(rig, c, t);
  ud.dk = c.dead ? Math.min(1, (ud.dk ?? 0) + dt * 1.5) : 0;
  ud.tune = (ud.tune ?? 0) + ((n.tune ?? 0) - (ud.tune ?? 0)) * Math.min(1, dt * 4);
  let yaw = 0, pitch = 0;
  const ns = !c.dead ? nearestSurvivor(c, 16) : null;
  if (ns && (n.md === 'tune' || n.md === 'hug')) [yaw, pitch] = lookAngles(c, ns.x, ns.z, ns.y, 1.2, 0.8, 0.5);
  ud.yaw = (ud.yaw ?? 0) + (yaw - (ud.yaw ?? 0)) * Math.min(1, dt * 3); ud.pitch = (ud.pitch ?? 0) + (pitch - (ud.pitch ?? 0)) * Math.min(1, dt * 3);
  poseWumpRig(K, { t, dt, speed: c.dead ? 0 : c.speed, md: c.dead ? '' : (n.md ?? ''), mdT: ud.mdT, tune: ud.tune, atk: Math.max(ac.wind, ac.strike), flinch: flinchOf(c), dead: ud.dk * ud.dk * (3 - 2 * ud.dk), seed: hashId(c.id, 5), yaw: ud.yaw, pitch: ud.pitch });
  const F = K.kit.F.fx.value; F.y += dt; F.z = Math.min(1, c.hitFlash / 0.15) * 0.4;
  // the screen: you, when it can see you; static otherwise; off when dead
  const p = localIn(c);
  const tuned = (n.md === 'tune' || n.md === 'hug' || n.md === 'squeeze') && (n.tune ?? 0) > 0.12;
  const mode = c.dead ? 'off' : tuned && p ? 'face' : (Math.floor(t * 0.31 + hashId(c.id) * 9) % 7 === 0 ? 'bars' : 'static');
  screenStep(K, dt, mode, ud.tune, (n.crack ?? 0), n.md === 'squeeze' ? Math.max(0, 0.6 - ud.mdT) : 0);
  humansStep(K, dt, mode, ud.tune, ud.yaw, F.z);
  // the hum of the tube; giggles; lines
  if (!c.dead && c.visibleToLocal && (ud.humT ?? 0) < t) { ud.humT = t + 3 + Math.random() * 2; playAt(tuned ? 'static_burst' : 'crt', c, tuned ? 0.25 + ud.tune * 0.3 : 0.12, 8, 1); }
  if (c.speed > 0.2 && !c.dead) { ud.stp = (ud.stp ?? 0) + dt * c.speed; if (ud.stp > 0.55) { ud.stp = 0; if (c.visibleToLocal) playAt('plush_squeak', c, 0.12, 8, 0.6 + Math.random() * 0.2); } }
  linePoll(rig, c, 'DOODLEWUMP');
  if (p && !c.dead) {
    const dd = dist(p, c);
    // on its screen: it is in your head. The longer, the worse.
    if (tuned && dd < 16 && c.visibleToLocal) {
      p.body.lucidity = Math.max(0, p.body.lucidity - dt * (0.4 + ud.tune * 1.6));
      p.body.stress = Math.min(100, p.body.stress + dt * (0.6 + ud.tune * 2));
      if (ud.tune > 0.6) thinkOnce(p, 'wump_tuned', 'I can see myself on its belly. My eyes on the screen are black. I can\'t look away. I have to get out of its sight.', 45);
      else thinkOnce(p, 'wump_face', 'That is me. On the screen in its belly. That is my face, live, from where it is standing.', 80);
    } else if (c.visibleToLocal && dd < 12) thinkOnce(p, 'wump', ['A kids\' show thing. A doll face in a plush hood. A television in its stomach, showing static.', 'Its arms hang down to its knees. It is waddling. It is giggling.', 'There is something dark leaking from under the TV in its belly.'][Math.floor(t * 0.13) % 3], 100);
  }
}

// ------------------------------------------------------------------ host brain: tuning in
const SEE = ['Ooh! Ooh! A friend on the telly!', 'Look-look! It\'s YOU! You\'re on my tummy!', 'Hello, friend on the screen!', 'Tummy Time! Tummy Time!'];
const TUNE = ['Stay on the channel! Stay! Stay!', 'Don\'t change the channel, friend.', 'You look so sleepy on my tummy.', 'Closer to the screen. Closer.'];
const HUG = ['Cuddle time! Squishy-squishy cuddle!', 'Tummy wants to hold you!', 'Wheee! Here I come!'];
const LOST = ['Where\'d the friend go? Fuzzy-fuzzy.', 'Nothing on. Nothing on.', 'Byeee-bye, friend. Bye. Bye. Bye.'];
const TUNE_T = 5.5;
function setMd(c: Creature, md: string) { const n = net(c); if (n.md !== md) { n.md = md; c.mem.mdT = 0; } }
function thinkWump(c: Creature, dt: number): boolean {
  const cs = CS(), z = zoneOf(c), m = c.mem, n = net(c);
  const ev = pulse(c);
  m.mdT = (m.mdT ?? 0) + dt;
  if (ev.hurt > 0) { n.tune = Math.min(1, (n.tune ?? 0) + 0.25); if (c.hp < c.sp.hp * 0.5 && !n.crack) { n.crack = 1; playAt('glass_break', c, 0.7, 12, 1); } }
  const md: string = n.md ?? '';
  // who can it see? (its eyes and its screen both face front, but it notices all round)
  const near = nearestUnit(c, 18);
  let tg = near && near.d < 15 && lineOfSightB(z, c.x, c.z, near.p.x, near.p.z) ? near : null;
  // a sibling on the same channel: they all turn to you at once
  if (!tg) for (const o of cs.creatures.values()) {
    if (o === c || o.dead || o.zoneKey !== c.zoneKey || o.sp.key !== c.sp.key || dist(o, c) > 10) continue;
    const on = netOf(o);
    if ((on.md === 'tune' || on.md === 'hug') && near && near.d < 20) { tg = near; break; }
  }
  if (md === 'squeeze') { stop(c); c.setState('attack'); if (m.mdT > 1.4) { setMd(c, tg ? 'tune' : ''); n.tune = 0.45; } return true; }
  if (tg) {
    const p = tg.p;
    m.last = { x: p.x, z: p.z };
    if (md === 'hug') {
      c.setState('chase');
      if (tg.d < c.sp.attack!.range + p.radius + 0.1 && c.attackT <= 0) { faceTo(c, p.x, p.z); attack(c, p); setMd(c, 'squeeze'); playAt('taser', c, 0.6, 12, 0.8); playAt('static_burst', c, 0.8, 14, 1); return true; }
      cs.moveTo(c, z, p.x, p.z, c.sp.run, dt, 0.35);
      if (m.mdT > 9) { setMd(c, 'tune'); n.tune = 0.5; }
      return true;
    }
    if (md !== 'tune') { setMd(c, 'tune'); say(c, rng.pick(SEE)); playAt('cower_squeak', c, 0.5, 14, 0.9); }
    stop(c); faceTo(c, p.x, p.z); c.setState('watch');
    n.tune = Math.min(1, +((n.tune ?? 0) + (dt / TUNE_T) * (1 + Math.max(0, 8 - tg.d) / 8)).toFixed(3));
    if ((m.lineT ?? 0) < G.time && n.tune > 0.35) { m.lineT = G.time + 6 + rng.float(0, 4); say(c, rng.pick(TUNE)); }
    if (n.tune >= 1) { setMd(c, 'hug'); say(c, rng.pick(HUG)); ruleShown(c); playAt('hound_laugh', c, 0.5, 16, 1.25); }
    return true;
  }
  // out of sight: the picture goes, it wanders to where you were, then gives up
  n.tune = Math.max(0, +((n.tune ?? 0) - dt / 3).toFixed(3));
  if (md === 'tune' || md === 'hug') { setMd(c, 'search'); if (n.tune < 0.5) say(c, rng.pick(LOST)); }
  if (md === 'search') {
    c.setState('investigate');
    if (!m.last || cs.moveTo(c, z, m.last.x, m.last.z, c.sp.walk * 1.3, dt, 0.8) || m.mdT > 10) { setMd(c, ''); m.last = null; }
    return true;
  }
  if (md === 'play') { stop(c); c.setState('idle'); if (m.mdT > (m.playT ?? 4)) setMd(c, ''); if (c.noiseCooldown <= 0) { playAt('cower_squeak', c, 0.35, 12, 1.1); c.noiseCooldown = 2.5; } return true; }
  c.setState('wander');
  if (!c.goal || cs.moveTo(c, z, c.goal.x, c.goal.z, c.sp.walk, dt, 0.5) || c.stateT > 16) {
    if (c.goal && rng.chance(0.4)) { setMd(c, 'play'); m.playT = rng.float(2.5, 5); c.goal = null; return true; }
    // they wander together: toward a sibling if there is one nearby
    let sib: Creature | null = null;
    for (const o of cs.creatures.values()) if (o !== c && !o.dead && o.zoneKey === c.zoneKey && o.sp.key === c.sp.key && dist(o, c) < 14) { sib = o; break; }
    c.goal = (sib ? findSpot(c, { x: sib.x, z: sib.z, rMin: 1.5, rMax: 4 }) : null) ?? findSpot(c, { rMin: 3, rMax: 10 }) ?? cs.wanderSpot(c, z, 8);
    c.stateT = 0;
  }
  return true;
}

const WUMP = def({
  key: 'pg_doodlewump', name: 'Doodlewump', code: 'PG-02 // MIMIC, PLUSH (BROADCAST-BOUND)', temperament: 'stalker', threat: 3,
  rule: { name: 'TUNED IN', text: 'Its belly screen shows static until it sees you; then it shows your face, live, and it starts to tune in. Stay in its sight and your mind drains into the screen, and when it is fully tuned it runs to cuddle you against the hot glass. Break its line of sight and the picture goes. They tune in together.', tell: 'A pastel plush thing with a doll\'s face and a television in its stomach. The screen is showing static.' },
  hp: 70, walk: 0.62, run: 2.7, turn: 3.4, radius: 0.4, height: 1.45, sight: 15, fov: 2.0, hearing: 1,
  attack: { dmg: [6, 12], range: 1.05, cooldown: 2.2, kinds: ['burn', 'bruise'], corrupt: 0.04, knock: 0.2, grab: true },
  zones: ['playground'], weight: 1, group: [2, 3], maxPerZone: 6, diet: 'none',
  sounds: { idle: 'crt', alert: 'cower_squeak', attack: 'taser', hurt: 'plush_squeak', death: 'crt_cut', step: 'plush_squeak' },
  scan: {
    cls: 'Mimic / plush, broadcast-bound',
    notes: [
      'A pre-school television character. Plush body, porcelain doll face, a TV aerial on its head.',
      'The cathode-ray screen in its belly is live. When it sees you, it shows your face.',
      'While you stay on its screen it tunes in, and your lucidity drains. Fully tuned, it runs to hold you to the glass.',
      'Break its line of sight. They travel in twos and threes and tune in together.',
    ],
  },
  gore: { blood: 'stuffing', tint: 0x6a2a2a, flesh: 0xc8786a, sever: ['uarmL', 'uarmR', 'antL', 'antR', 'head'], head: 'head' },
  build: () => buildDoodlewump(0), animate: animateWump, think: thinkWump,
});
onPlayerHit('pg_doodlewump', (p: Player) => {
  bus.emit('think', p, ['It pressed the screen against me. It is HOT. It buzzed through my teeth.', 'I saw my own face on the glass, up close, screaming. Then it let go.', 'It smells of hot dust and electrics and something rotten behind the tube.'][Math.floor(Math.random() * 3)]);
});

// ------------------------------------------------------------------ stand-alone posing (gallery, video)
/** animate a Doodlewump rig with no game running; screen 'face' paints the local unit's face (or a stand-in) */
export function poseDoodlewump(rig: KitRig, t: number, dt: number, pose: WumpPose = 'idle', o: { tune?: number; screen?: 'static' | 'face' | 'bars' | 'off'; speed?: number; variant?: number; crack?: number } = {}) {
  if (o.variant !== undefined && rig.kit.entry.variant !== o.variant % 3) kitPersonalize(rig, o.variant % 3);
  kitSync(rig);
  const ud = rig.kit.m as Record<string, any>;
  if (ud.gp !== pose) { ud.gp = pose; ud.gT = 0; }
  ud.gT = (ud.gT ?? 0) + dt;
  const tune = o.tune ?? (pose === 'stare' ? Math.min(1, ud.gT / 6) : pose === 'hug' || pose === 'squeeze' ? 1 : 0);
  const speed = o.speed ?? (pose === 'walk' ? 0.6 : pose === 'hug' ? 2.4 : 0);
  poseWumpRig(rig, { t, dt, speed, md: pose === 'stare' ? 'tune' : pose === 'idle' || pose === 'walk' || pose === 'dead' ? '' : pose, mdT: pose === 'squeeze' ? ud.gT % 1.4 : ud.gT, tune, atk: 0, flinch: 0, dead: pose === 'dead' ? 1 : 0, seed: 0.41, yaw: 0, pitch: 0 });
  const mode = o.screen ?? (pose === 'dead' ? 'off' : pose === 'stare' || pose === 'hug' || pose === 'squeeze' ? 'face' : 'static');
  screenStep(rig, dt, mode, tune, o.crack ?? 0, pose === 'squeeze' ? Math.max(0, 0.6 - (ud.gT % 1.4)) : 0);
  humansStep(rig, dt, mode, tune, 0, 0);
  rig.kit.F.fx.value.y += dt;
}
WUMP.animateGallery = (rig: Rig, t: number) => {
  const u = new URLSearchParams(location.search);
  const q = (u.get('pose') || ['walk', 'play', 'stare', 'hug', 'squeeze'][Math.floor(t / 5) % 5]) as WumpPose;
  poseDoodlewump(rig as KitRig, t, 1 / 60, q, { variant: u.get('v') ? Number(u.get('v')) : 0, screen: (u.get('screen') as any) || undefined });
};
horrify(WUMP, { twitch: 0.3, snap: 0.14, breathe: 0.005, lunge: 0.08, parts: /head|antL|antR/, keepMaterials: false });
