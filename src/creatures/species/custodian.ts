import { horrify } from '../kit/horror';
import { BLOOD } from '../kit/rot';
import * as THREE from 'three';
import { def, Rig } from '../species';
import { makeRamp, mixHex, scaleHex } from '../../gfx/pixel';
import { op } from '../../game/ops';
import { G } from '../../game/G';
import { TF, Zone } from '../../world/zone';
import { itemDef } from '../../items/item';
import type { Creature } from '../creature';
import type { Player } from '../../entities/player';
import {
  CS, zoneOf, nm, netSet, pulse, attack, playersIn, stop, dist, faceTo, sfx, speak, showSpeech, objectsNear,
  floorItemsAround, isPrecious, takeFloorItem, putStored, restoreStore, galleryPose, h01, idHash,
} from '../behaviors_a';
import {
  KitDef, KitRig, BoneSpec, SkinB, BuildCtx, Page, Region, Row, Wt, V3, buildKitRig, kitSync, tube, headLoft, handLoft, footLoft,
  wLerp, gauss, angd, SHOE_DRESS, ringY, usFor, nearestSurvivor, lookAngles, attackCurve, hash, twill, smooth,
} from '../kit/humanoids';

// =====================================================================================
// THE CUSTODIAN — a maintenance process wearing a tailored pinstripe suit, two and a
// half metres tall, six arms in white cotton gloves folded behind its back. It tidies:
// picks up what you dropped, closes the doors you left open, switches off what you
// left on. It does not mind you — until you are untidy yourself.
// =====================================================================================

const PAIRS = 3;
/** where each pair of arms leaves the body: the shoulders, then two slits in the back of the jacket */
const PAIR_AT: [string, number, number, number][] = [['chest', 0.218, 0.4, -0.02], ['chest', 0.17, 0.14, -0.075], ['spine', 0.16, 0.25, -0.07]];
const ARM_U = 0.4, ARM_F = 0.38;

function bonesC(): BoneSpec[] {
  const b: BoneSpec[] = [
    { name: 'hips', parent: '', at: [0, 1.3, 0] },
    { name: 'spine', parent: 'hips', at: [0, 0.1, 0] },
    { name: 'chest', parent: 'spine', at: [0, 0.42, 0] },
    { name: 'neck', parent: 'chest', at: [0, 0.46, -0.012] },
    { name: 'head', parent: 'neck', at: [0, 0.11, 0.012] },
  ];
  for (const [s, k] of [['L', 1], ['R', -1]] as const) {
    b.push({ name: 'thigh' + s, parent: 'hips', at: [k * 0.088, -0.04, 0] }, { name: 'shin' + s, parent: 'thigh' + s, at: [0, -0.62, 0] }, { name: 'foot' + s, parent: 'shin' + s, at: [0, -0.56, 0] });
  }
  for (let i = 0; i < PAIRS; i++) for (const [s, k] of [['L', 1], ['R', -1]] as const) {
    const n = `${i}${s}`, [par, x, y, z] = PAIR_AT[i];
    b.push(
      { name: 'ua' + n, parent: par, at: [k * x, y, z] },
      { name: 'fa' + n, parent: 'ua' + n, at: [0, -ARM_U, 0] },
      { name: 'hd' + n, parent: 'fa' + n, at: [0, -ARM_F, 0] },
      { name: 'f1' + n, parent: 'hd' + n, at: [0, -0.1, 0] },
      { name: 'f2' + n, parent: 'f1' + n, at: [0, -0.046, 0] },
      { name: 'th' + n, parent: 'hd' + n, at: [-k * 0.004, -0.028, 0.03] },
    );
  }
  return b;
}

function layoutC(p: Page) {
  p.reg('TORSO', 96, 72, [1.2, 2.32]);
  p.reg('LEG', 28, 84, [-1.24, 0.06]);
  p.reg('ARM', 26, 56, [-0.8, 0.03]);
  p.reg('HEAD', 80, 44, [-0.02, 0.27]);
  p.reg('SKIRT', 96, 22, [0.98, 1.42]);
  p.reg('GLOVE', 22, 26);
  p.reg('SHOE', 28, 18);
  p.reg('NECK', 28, 14, [-0.08, 0.13]);
  p.reg('BITS', 32, 24);
}

const TORSO_C: Row[] = [
  { y: 1.21, rx: 0.068, rf: 0.056, rb: 0.064 },
  { y: 1.25, rx: 0.14, rf: 0.084, rb: 0.096 },
  { y: 1.32, rx: 0.15, rf: 0.09, rb: 0.1 },
  { y: 1.45, rx: 0.138, rf: 0.088, rb: 0.088 },
  { y: 1.58, rx: 0.126, rf: 0.088, rb: 0.08 },
  { y: 1.72, rx: 0.14, rf: 0.096, rb: 0.086 },
  { y: 1.88, rx: 0.16, rf: 0.104, rb: 0.094 },
  { y: 2.02, rx: 0.172, rf: 0.104, rb: 0.098, sq: 2.6 },
  { y: 2.13, rx: 0.205, rf: 0.09, rb: 0.096, sq: 3.4 },
  { y: 2.2, rx: 0.2, rf: 0.072, rb: 0.08, sq: 3.4 },
  { y: 2.25, rx: 0.11, rf: 0.06, rb: 0.066, sq: 2.2 },
  { y: 2.29, rx: 0.06, rf: 0.054, rb: 0.056 },
];
const ARM_C: Row[] = [
  { y: 0.0, rx: 0.026, rf: 0.032, rb: 0.032, cx: -0.01 },
  { y: -0.02, rx: 0.042, rf: 0.045, rb: 0.045 },
  { y: -0.08, rx: 0.044, rf: 0.045, rb: 0.045 },
  { y: -0.36, rx: 0.036, rf: 0.036, rb: 0.038 },
  { y: -0.42, rx: 0.038, rf: 0.04, rb: 0.038 },
  { y: -0.7, rx: 0.033, rf: 0.034, rb: 0.033 },
  { y: -0.745, rx: 0.036, rf: 0.036, rb: 0.035 },   // the cuff
  { y: -0.755, rx: 0.026, rf: 0.03, rb: 0.028 },
  { y: -0.78, rx: 0.024, rf: 0.028, rb: 0.026 },
];
const LEG_C: Row[] = [
  { y: 0.06, rx: 0.062, rf: 0.066, rb: 0.07 },
  { y: -0.01, rx: 0.082, rf: 0.082, rb: 0.086 },
  { y: -0.16, rx: 0.074, rf: 0.076, rb: 0.074 },
  { y: -0.4, rx: 0.062, rf: 0.064, rb: 0.062 },
  { y: -0.62, rx: 0.056, rf: 0.06, rb: 0.056 },
  { y: -0.8, rx: 0.054, rf: 0.055, rb: 0.056 },
  { y: -1.0, rx: 0.052, rf: 0.054, rb: 0.054 },
  { y: -1.14, rx: 0.054, rf: 0.056, rb: 0.056 },
  { y: -1.19, rx: 0.056, rf: 0.06, rb: 0.058 },
];
const HEAD_C: Row[] = [
  { y: -0.015, rx: 0.044, rf: 0.05, rb: 0.046, cz: -0.004 },
  { y: 0.015, rx: 0.064, rf: 0.076, rb: 0.064 },
  { y: 0.05, rx: 0.074, rf: 0.088, rb: 0.078 },
  { y: 0.095, rx: 0.08, rf: 0.092, rb: 0.088 },
  { y: 0.14, rx: 0.083, rf: 0.092, rb: 0.094 },
  { y: 0.185, rx: 0.082, rf: 0.088, rb: 0.094 },
  { y: 0.225, rx: 0.07, rf: 0.072, rb: 0.08 },
  { y: 0.252, rx: 0.044, rf: 0.044, rb: 0.05 },
];

function buildC(B: SkinB, x: BuildCtx) {
  const bi = x.bi, R = x.R;
  const tw = (y: number): Wt => {
    if (y < 1.34) return [bi('hips'), 1];
    if (y < 1.44) return wLerp(y, 1.34, 1.44, bi('hips'), bi('spine'));
    if (y < 1.7) return [bi('spine'), 1];
    if (y < 1.84) return wLerp(y, 1.7, 1.84, bi('spine'), bi('chest'));
    if (y < 2.26) return [bi('chest'), 1];
    return [bi('chest'), 0.6, bi('neck'), 0.4];
  };
  const ys = [1.21, 1.25, 1.29, 1.32, 1.38, 1.45, 1.52, 1.58, 1.65, 1.72, 1.8, 1.88, 1.95, 2.02, 2.08, 2.13, 2.17, 2.2, 2.23, 2.25, 2.27, 2.29];
  tube(B, { rows: TORSO_C, ys, n: 14, reg: R('TORSO'), vr: R('TORSO').range, w: tw, g: 1, start: [0, 1.2, -0.004], end: [0, 2.305, -0.006],
    bump: (th, y) => gauss(y, 1.92, 0.08) * gauss(Math.abs(th), 0.5, 0.35) * 0.03 - gauss(y, 1.7, 0.3) * gauss(Math.abs(angd(th, Math.PI)), 0, 0.12) * 0.03 });
  // long tailored skirt of the jacket, split at the back and open at the front
  {
    const n = 16, top = 1.42, bot = 0.99;
    const rings = [top, 1.2, bot].map((y, i) => {
      const f = i / 2;
      const rx = 0.15 + 0.014 + f * 0.022, rf = 0.09 + 0.014 + f * 0.014, rb = 0.1 + 0.016 + f * 0.022;
      const w = (p: V3): Wt => { const kk = f * 0.8, l = Math.min(1, Math.max(0, 0.5 + p[0] / (rx * 0.9) * 0.5)); return [bi('hips'), 1 - kk, bi('thighL'), kk * l, bi('thighR'), kk * (1 - l)]; };
      return { pts: ringY(y, 0, 0, rx, rf, rb, n, 2.2), v: 1 - i / 2, w };
    });
    B.loft(rings, usFor(n), R('SKIRT'), 2, { double: true, skip: (j) => j === 7 || j === 8 || j === 0 || j === 15 });
  }
  // peaked lapels
  for (const k of [1, -1]) {
    const zf = (y: number) => (TORSO_C.find((q) => q.y >= y) || TORSO_C[TORSO_C.length - 1]).rf + 0.012;
    const top: V3 = [k * 0.05, 2.26, zf(2.2) - 0.012], tip: V3 = [k * 0.012, 1.8, zf(1.8) + 0.004];
    const out: V3 = [k * 0.13, 2.12, zf(2.1) - 0.004], peak: V3 = [k * 0.125, 2.2, zf(2.18) - 0.004];
    B.quad(tip, out, peak, top, R('BITS'), k > 0 ? [0, 0, 0.25, 1] : [0.25, 0, 0, 1], [bi('chest'), 1], false, 0.9);
  }
  // shirt collar, tie knot, brass nameplate, a ring of keys
  {
    const rr = [2.26, 2.33].map((y, i) => ({ pts: ringY(y, 0, -0.008, 0.058 - i * 0.005, 0.066 - i * 0.006, 0.055, 10, 2), v: i, w: [bi('chest'), 1 - i * 0.5, bi('neck'), i * 0.5] as Wt }));
    B.loft(rr, usFor(10), new Region(null, '', R('BITS').x + 26, R('BITS').y + 16, 6, 8), 3, { double: true, skip: (j) => j === 4 || j === 5 });
    B.box([0, 2.25, 0.072], [0.03, 0.03, 0.02], null, R('BITS'), [bi('chest'), 1], [0.82, 0, 0.94, 0.2]);
    B.box([0.09, 1.99, 0.112], [0.06, 0.02, 0.006], null, R('BITS'), [bi('chest'), 1], [0.5, 0.82, 0.8, 1]);
    for (let i = 0; i < 4; i++) B.box([0.165 + i * 0.006, 1.29 - (i & 1) * 0.02, 0.07 + i * 0.008], [0.006, 0.05, 0.016], new THREE.Matrix4().makeRotationZ(-0.3 + i * 0.2), R('BITS'), [bi('hips'), 1], [0.5, 0.35, 0.6, 0.7]);
  }
  // neck (the shirt collar hides most of it) and the head: a tall smooth egg, nothing on it
  tube(B, { rows: [{ y: -0.07, rx: 0.05, rf: 0.054, rb: 0.05 }, { y: 0.02, rx: 0.042, rf: 0.045, rb: 0.042 }, { y: 0.11, rx: 0.04, rf: 0.042, rb: 0.04 }],
    n: 10, reg: R('NECK'), at: x.rest('neck'), w: (y) => (y < -0.02 ? [bi('chest'), 0.4, bi('neck'), 0.6] : y > 0.08 ? [bi('neck'), 0.4, bi('head'), 0.6] : [bi('neck'), 1]), g: 4 });
  headLoft(B, { at: x.rest('head'), rows: HEAD_C, reg: R('HEAD'), vr: R('HEAD').range, w: () => [bi('head'), 1], g: 6, top: 0.262, bottom: -0.02,
    bump: (th, y) => gauss(th, 0, 0.4) * gauss(y, 0.03, 0.02) * 0.04 + gauss(Math.abs(th), 1.3, 0.3) * gauss(y, 0.1, 0.03) * -0.02 });
  // six arms: sleeves to the wrist, a white cuff, gloves
  for (let i = 0; i < PAIRS; i++) for (const [s, k] of [['L', 1], ['R', -1]] as const) {
    const n = `${i}${s}`;
    const U = bi('ua' + n), F = bi('fa' + n), H = bi('hd' + n);
    const at = x.rest('ua' + n);
    const wf = (y: number): Wt => {
      if (y > -0.03) return i === 0 ? [U, 0.8, bi('chest'), 0.2] : [U, 1];
      if (y > -0.34) return [U, 1];
      if (y > -0.44) return wLerp(y, -0.34, -0.44, U, F);
      if (y > -0.76) return [F, 1];
      return [F, 0.5, H, 0.5];
    };
    tube(B, { rows: ARM_C, ys: [0, -0.02, -0.1, -0.3, -0.36, -0.42, -0.48, -0.7, -0.745, -0.745, -0.755, -0.78], n: 6, reg: R('ARM'), vr: R('ARM').range, at, w: wf, g: 10 + i * 2 + (k > 0 ? 0 : 1), mirror: k, start: [at[0] - k * 0.012, at[1] + 0.004, at[2]] });
    const hp = x.rest('hd' + n);
    handLoft(B, { k, at: [hp[0], hp[1] - 0.01, hp[2]], bones: { farm: F, hand: H, f1: bi('f1' + n), f2: bi('f2' + n), thumb: bi('th' + n) }, reg: R('GLOVE'), g: 40 + i * 20 + (k > 0 ? 0 : 10), s: 1.12, glove: 0.004,
      fingers: { n: 4, len: [0.085, 0.094, 0.09, 0.074], r: [0.0086, 0.009, 0.0086, 0.0074] } });
  }
  // legs and polished shoes
  for (const [s, k] of [['L', 1], ['R', -1]] as const) {
    const T = bi('thigh' + s), S = bi('shin' + s), Ft = bi('foot' + s);
    const at = x.rest('thigh' + s);
    const wf = (y: number): Wt => {
      if (y > 0.02) return [bi('hips'), 0.5, T, 0.5];
      if (y > -0.05) return [bi('hips'), 0.2, T, 0.8];
      if (y > -0.56) return [T, 1];
      if (y > -0.67) return wLerp(y, -0.56, -0.67, T, S);
      if (y > -1.12) return [S, 1];
      return [S, 0.5, Ft, 0.5];
    };
    tube(B, { rows: LEG_C, ys: [0.06, -0.01, -0.16, -0.4, -0.56, -0.62, -0.68, -0.8, -1.0, -1.14, -1.19], n: 8, reg: R('LEG'), vr: R('LEG').range, at, w: wf, g: 30 + (k > 0 ? 0 : 1), mirror: k, start: [at[0], at[1] + 0.07, at[2]], startW: [bi('hips'), 0.6, T, 0.4],
      bump: (th, y) => gauss(th, 0, 0.12) * 0.04 + gauss(y, -0.62, 0.03) * gauss(th, 0, 0.5) * 0.03 });
    footLoft(B, { k, at: x.rest('foot' + s), rows: SHOE_DRESS, ground: -0.08, sole: 0.018, lip: 0.003, reg: R('SHOE'), w: [Ft, 1], g: 36 + (k > 0 ? 0 : 1), s: 1.22, sx: 0.92 });
  }
}

function paintC(p: Page, x: BuildCtx) {
  const SR = makeRamp(0x2c2c36, 9, { hueShift: 0.04, spread: 0.6 });
  const stripe = 0x6a6a7a;
  const shirt = makeRamp(0xdcdcd4, 5, { spread: 0.35 });
  const PR = makeRamp(0xa4a49e, 9, { hueShift: 0.02, spread: 0.55 });
  const GL = makeRamp(0xcfcdc4, 6, { spread: 0.45 });
  const cloth = (r: Region, base: number, seed: number, xx: number, yy: number) => {
    const th = (r.deg(xx) * Math.PI) / 180;
    return base + 0.9 * Math.cos(th) + twill(xx, yy, 'herring') * 0.6 + (r.fbm(xx, yy, 3, 2, seed) - 0.5) * 0.6;
  };
  const pin = (r: Region, yy0 = 0, yy1 = r.h) => { for (let xx = 0; xx < r.w; xx += 4) for (let yy = yy0; yy < yy1; yy++) if (yy % 3 !== 2) r.blend(xx, yy, stripe, 0.4); };
  // ---------------- torso: three-piece jacket, shirt, black tie, nameplate, pocket square
  {
    const r = p.R('TORSO');
    const vW = (h: number) => (h < 1.8 ? -1 : 5 + (h - 1.8) * 36);
    r.fill(SR, (xx, yy) => {
      const deg = r.deg(xx), h = r.yAt(yy);
      let l = cloth(r, 3.7, 5, xx, yy);
      l -= 2.2 * gauss(h, 2.12, 0.035) * gauss(Math.abs(deg), 92, 14);
      l += 1.0 * Math.max(0, (h - 2.17) / 0.08) * Math.max(0, Math.cos((deg * Math.PI) / 180));
      if (h < 1.36) l -= 0.7;
      return l;
    });
    pin(r);
    for (let yy = 0; yy < r.h; yy++) for (let xx = 0; xx < r.w; xx++) {
      const deg = r.deg(xx), h = r.yAt(yy), w = vW(h);
      if (h > 1.8 && Math.abs(deg) < w) {
        r.put(xx, yy, shirt, 3.3 + 0.5 * Math.cos((deg * Math.PI) / 180) - (Math.abs(deg) > w - 2 ? 1.1 : 0));
        if (Math.abs(deg) < 5 && h < 2.24) r.set(xx, yy, (yy % 5 === 0) ? 0x2a2a30 : 0x101014);
      } else if (h > 1.8 && Math.abs(deg) < w + 10) {
        const t = Math.abs(deg) - w;
        r.put(xx, yy, SR, 2.6 + (t > 8.5 ? 2 : 0) + twill(xx, yy) * 0.4);
        if (t < 1.2) r.set(xx, yy, SR[0]);
      }
    }
    // buttons (three), front edge, flap pockets, breast pocket with a square of white
    for (const h of [1.78, 1.68, 1.58]) { const bx = Math.round(r.X(0)), by = Math.round(r.Y(h)); r.rect(bx - 1, by, 2, 2, SR[1]); r.set(bx - 1, by, SR[6]); }
    for (let h = 1.77; h > 1.2; h -= 0.005) { const cur = Math.max(0, (1.5 - h) / 0.3) * 10; for (const k of [1, -1]) r.blend(r.X(k * (1 + cur)), r.Y(h), SR[0], 0.9); }
    for (const k of [1, -1]) { const y0 = Math.round(r.Y(1.45)); r.rectBlend(Math.round(r.X(k > 0 ? 28 : -56)), y0, Math.round(r.X(28) - r.X(0)), 3, SR[2], 0.7); r.hline(r.X(k > 0 ? 28 : -56), r.X(k > 0 ? 56 : -28), y0 + 3, SR[0]); }
    const py = Math.round(r.Y(2.02));
    r.hline(r.X(26), r.X(44), py, SR[0]);
    for (let i = 0; i < 4; i++) { r.set(r.X(30 + i * 3), py - 1 - (i & 1), shirt[4]); r.set(r.X(31 + i * 3), py - 1, shirt[3]); }
    // the brass plate: blank, polished at one corner
    const nx = Math.round(r.X(-36)), ny = Math.round(r.Y(1.99));
    r.rect(nx, ny, 6, 2, 0xb89a4a); r.set(nx, ny, 0xe8d07a); r.hline(nx, nx + 5, ny + 2, 0x5a4a22);
    // back seams and the two slits the lower arms come out of
    r.vline(Math.round(r.X(180)), r.Y(2.2), r.Y(1.2), SR[1]);
    for (const k of [1, -1]) {
      for (const h0 of [1.96, 1.69]) for (let yy = Math.round(r.Y(h0 + 0.05)); yy <= Math.round(r.Y(h0 - 0.05)); yy++) { r.set(r.X(k * 142), yy, 0x0a0a0c); r.set(r.X(k * 142 + k * 4), yy, SR[5]); }
      r.vline(Math.round(r.X(k * 96)), r.Y(2.12), r.Y(1.3), SR[1], 0.7);
    }
    // a seam of lint and dust it has never brushed off its shoulders (it is too busy)
    for (let yy = 0; yy < r.h; yy++) for (let xx = 0; xx < r.w; xx++) if (r.yAt(yy) > 2.15 && hash(xx * 13 + yy, 4) < 0.07) r.blend(xx, yy, 0x8a8a92, 0.5);
  }
  {
    const r = p.R('SKIRT');
    r.fill(SR, (xx, yy) => cloth(r, 3.4, 9, xx, yy) - (yy / r.h) * 0.7);
    pin(r);
    r.hline(0, r.w - 1, r.h - 1, SR[0]);
  }
  // ---------------- sleeves: pinstripe, four cuff buttons, a white shirt cuff and a link
  {
    const r = p.R('ARM');
    r.fill(SR, (xx, yy) => cloth(r, 3.5, 13, xx, yy) - 0.6 * Math.max(0, -Math.sin((r.deg(xx) * Math.PI) / 180)));
    pin(r);
    const cuff = Math.round(r.Y(-0.745));
    for (let i = 0; i < 4; i++) r.set(r.X(120), cuff - 2 - i * 2, SR[6]);
    for (let i = 0; i < 3; i++) r.hline(r.X(-60), r.X(30), Math.round(r.Y(-0.4 - i * 0.02)), SR[1], 0.5);
    r.hline(0, r.w - 1, cuff, SR[0]);
    for (let yy = cuff + 1; yy < r.h; yy++) for (let xx = 0; xx < r.w; xx++) r.put(xx, yy, shirt, 3 + Math.cos((r.deg(xx) * Math.PI) / 180) * 0.6);
    r.set(r.X(100), cuff + 2, 0xb89a4a);
  }
  // ---------------- trousers: knife crease, polished shoes
  {
    const r = p.R('LEG');
    r.fill(SR, (xx, yy) => cloth(r, 3.3, 17, xx, yy) + (Math.abs(r.deg(xx)) < 6 ? 1.3 : 0) - 0.5 * Math.max(0, -Math.sin((r.deg(xx) * Math.PI) / 180)));
    pin(r);
    r.hline(0, r.w - 1, r.h - 1, SR[0]);
    for (let i = 0; i < 3; i++) r.line(r.X(-40), r.Y(-0.6 - i * 0.025), r.X(35), r.Y(-0.59 - i * 0.03), SR[1], 0.4);
  }
  {
    const r = p.R('SHOE');
    const LR = makeRamp(0x18161a, 7, { spread: 0.7 });
    r.fill(LR, (xx, yy) => 2.4 + 1.6 * Math.cos((r.deg(xx) * Math.PI) / 180) - (yy > r.h * 0.8 ? 2 : 0) + (r.fbm(xx, yy, 2, 2, 3) - 0.5) * 0.4);
    for (let xx = 0; xx < r.w; xx++) if (Math.abs(r.deg(xx)) < 30) r.set(xx, Math.round(r.h * 0.55), LR[6]); // the shine on the toe
    r.hline(0, r.w - 1, Math.round(r.h * 0.8), LR[0]);
    for (let yy = Math.round(r.h * 0.15); yy < r.h * 0.4; yy += 2) r.set(Math.round(r.X(0)), yy, LR[4]);
  }
  // ---------------- gloves: white cotton, three stitched lines on the back, grey at the fingertips
  {
    const r = p.R('GLOVE');
    r.fill(GL, (xx, yy) => 3 + 0.9 * Math.cos((r.deg(xx) * Math.PI) / 180) + twill(xx, yy, 'knit') * 0.5 - (yy > r.h * 0.85 ? 0.8 : 0));
    for (const deg of [70, 90, 110]) for (let yy = 2; yy < r.h * 0.45; yy += 2) r.set(Math.round(r.X(deg)), yy, GL[1]);
    for (let xx = 0; xx < r.w; xx++) { r.set(xx, 0, GL[1]); if (hash(xx, 9) < 0.5) r.blend(xx, r.h - 1, 0x8a8a84, 0.6); }
    // it has been tidying up after someone: the fingertips soaked through, rust-red, a spot on the back
    for (let yy = Math.round(r.h * 0.78); yy < r.h; yy++) for (let xx = 0; xx < r.w; xx++) if (hash(xx, yy + 31) < 0.3 + (yy / r.h - 0.78) * 2.5) r.blend(xx, yy, BLOOD[hash(xx, yy) < 0.5 ? 1 : 2], 0.7);
    r.glow(r.X(100), r.h * 0.35, 1.5, 1.5, BLOOD[2], 0.6);
  }
  // ---------------- head: porcelain grey, a seam down the middle, a seam at the jaw, two screws
  {
    const r = p.R('HEAD');
    r.fill(PR, (xx, yy) => {
      const deg = r.deg(xx), h = r.yAt(yy), th = (deg * Math.PI) / 180;
      return 3.9 + 1.6 * Math.cos(th) * 0.6 + 1.6 * gauss(h, 0.16, 0.04) * gauss(deg, -15, 25) - 1.6 * Math.max(0, (0.02 - h) / 0.04) + (r.fbm(xx, yy, 2, 2, 21) - 0.5) * 0.5;
    }, undefined, 0.3);
    for (let yy = 0; yy < r.h; yy++) { r.blend(r.X(0), yy, PR[2], 0.55); r.blend(r.X(180), yy, PR[2], 0.55); }
    const jaw = Math.round(r.Y(0.045));
    for (let xx = 0; xx < r.w; xx++) { const d = Math.abs(r.deg(xx)); if (d < 110) { r.set(xx, jaw + Math.round(Math.max(0, d - 60) / 25), PR[2]); r.blend(xx, jaw + 1 + Math.round(Math.max(0, d - 60) / 25), PR[7], 0.5); } }
    for (const k of [-1, 1]) { const sx = Math.round(r.X(k * 9)), sy = Math.round(r.Y(0.03)); r.set(sx, sy, PR[1]); r.set(sx + 1, sy, PR[3]); r.set(sx, sy - 1, PR[6]); r.set(sx, sy + 1, PR[2]); }
    // the thumbprints of someone who tried to find its eyes, in their own blood, dried brown,
    // and the long smear where their hand slid off
    r.glow(r.X(28), r.Y(0.12), 3, 2, BLOOD[1], 0.55);
    r.glow(r.X(-22), r.Y(0.14), 2.5, 2, BLOOD[2], 0.45);
    for (let k = 0; k < 9; k++) r.blend(r.X(28 + k * 2), r.Y(0.12) + k, BLOOD[1], 0.45 - k * 0.04);
  }
  {
    const r = p.R('NECK');
    r.fill(PR, (xx) => 3.8 + 1.4 * Math.cos((r.deg(xx) * Math.PI) / 180));
    r.hline(0, r.w - 1, r.h - 2, PR[2]);
  }
  // ---------------- bits: lapel cloth, collar, tie knot, nameplate, keys
  {
    const r = p.R('BITS');
    for (let yy = 0; yy < r.h; yy++) for (let xx = 0; xx < 16; xx++) r.put(xx, yy, SR, 2.8 + twill(xx, yy) * 0.5 + (xx === 1 || xx === 8 ? 1.4 : 0) - (xx === 0 || xx === 7 ? 1 : 0));
    r.rect(26, 16, 6, 8, shirt[3]);
    r.rect(26, 0, 4, 5, 0x141418); r.set(27, 1, 0x34343c);
    r.rect(16, 18, 10, 6, 0xb89a4a); r.hline(16, 25, 23, 0x6a5a2a); r.set(17, 19, 0xe8d07a);
    r.rect(16, 8, 4, 8, 0xc8a850); r.rect(20, 8, 3, 8, 0x9aa0a8);
  }
  void mixHex; void scaleHex; void x;
}

const CUSTODIAN_KIT: KitDef = { key: 'custodian', variants: 1, bones: bonesC, layout: layoutC, build: buildC, paint: paintC, sphere: [0, 1.4, 0, 2.0] };

function buildCustodian(): Rig { return buildKitRig(CUSTODIAN_KIT, 0, 2.6); }

// ------------------------------------------------------------------ choreography
/**
 * Each pair has its own unfold amount u (0 folded behind the back .. 1 open);
 * reach / menace / strike decide where an open pair goes. Pairs unfold one
 * after another, top first, so the arms come out of the back like a fan.
 */
interface CPose { moving: boolean; phase: number; t: number; u: number[]; reach: number; menace: number; strike: number; wind: number; grip: number[]; glitch: number; seed: number; yaw: number; pitch: number }
function setR(rig: Rig, n: string, x: number, y: number, z: number) { const o = rig.parts[n]; if (o) o.rotation.set(x, y, z); }
function poseC(rig: Rig, q: CPose) {
  const P = rig.parts;
  // precise, unhurried gait: long level strides, heel to toe, the upper body perfectly still
  const sw = q.moving ? Math.sin(q.phase * 0.62) : 0;
  const lift = (s: number) => Math.max(0, s);
  setR(rig, 'thighL', sw * 0.34, 0, 0.02); setR(rig, 'thighR', -sw * 0.34, 0, -0.02);
  setR(rig, 'shinL', lift(-sw) * 0.55 + 0.04, 0, 0); setR(rig, 'shinR', lift(sw) * 0.55 + 0.04, 0, 0);
  setR(rig, 'footL', -sw * 0.18 - lift(-sw) * 0.2, 0, 0); setR(rig, 'footR', sw * 0.18 - lift(sw) * 0.2, 0, 0);
  // no bob: the hips sink exactly as much as the stride would lift them
  const p0 = P.hips.userData.p0 as THREE.Vector3;
  P.hips.position.set(0, p0.y - (q.moving ? Math.abs(sw) * 0.025 : 0), 0);
  setR(rig, 'hips', 0, sw * 0.04, 0);
  setR(rig, 'spine', q.reach * 0.25 + q.strike * 0.2 - q.wind * 0.1, -sw * 0.04, 0);
  setR(rig, 'chest', q.reach * 0.12 - q.menace * 0.06, 0, 0);
  setR(rig, 'neck', q.reach * 0.2 + q.pitch * 0.3, q.yaw * 0.4, 0);
  setR(rig, 'head', q.reach * 0.3 - q.menace * 0.08 + q.pitch * 0.5, q.yaw * 0.6, 0);
  for (let i = 0; i < PAIRS; i++) for (const k of [1, -1]) {
    const n = `${i}${k > 0 ? 'L' : 'R'}`;
    const u = q.u[i];
    const fold = 1 - u;
    // folded: upper arm drawn back, forearm laid across the small of the back, hands cupping the opposite elbow
    let ux = 0.38 + i * 0.06, uy = 0, uz = -k * 0.06;
    let fx = 0, fy = 0, fz = -k * (1.5 - i * 0.05);
    let hx = 0, hz = -k * 0.2;
    // open: where depends on what it is doing
    let ox = -0.35, oy = 0, oz = k * (0.4 + i * 0.25), ofx = -0.5, ofz = 0, ohx = 0.2, ohz = k * 0.2;
    if (q.menace > 0) {
      // a fan: each pair further out and lower, elbows bent like a spider's legs
      ox = -0.55 + i * 0.32; oz = k * (0.95 + i * 0.32); oy = -k * 0.2; ofx = -0.85 - i * 0.1; ofz = -k * 0.25; ohx = 0.4; ohz = k * 0.35;
    }
    if (i === 0 && q.reach > 0) { ox = -1.25; oz = k * 0.06; ofx = -0.15; ofz = 0; ohx = 0.35; ohz = 0; }
    if (q.strike > 0 || q.wind > 0) {
      if (i === 0) { ox = -2.6 * q.wind - 1.2 * q.strike; oz = k * 0.15; ofx = -1.2 * q.wind - 0.1 * q.strike; }   // raised overhead, brought down
      else { ox = -1.35 + i * 0.1; oy = -k * 0.25; oz = k * (0.25 + i * 0.1); ofx = -0.35; ohx = 0.2; }        // the lower pairs hold you
    }
    ux = ux * fold + ox * u; uy = uy * fold + oy * u; uz = uz * fold + oz * u;
    fx = fx * fold + ofx * u; fy = fy * fold; fz = fz * fold + ofz * u;
    hx = hx * fold + ohx * u; hz = hz * fold + ohz * u;
    if (q.glitch > 0) {
      const g = h01(Math.floor(q.t * 12) + i * 7 + (k > 0 ? 3 : 0), q.seed);
      if (g < 0.45) { ux += (g - 0.2) * 3 * q.glitch; fz += (h01(g * 99, q.seed) - 0.5) * 2 * q.glitch; }
    }
    // breathing it does not need, and the slight unsettled drift of hands at rest
    const drift = Math.sin(q.t * 0.7 + i * 1.3 + k) * 0.03 * fold;
    setR(rig, 'ua' + n, ux, uy, uz + drift);
    setR(rig, 'fa' + n, fx, fy, fz);
    setR(rig, 'hd' + n, hx, 0, hz);
    const g = q.grip[i];
    setR(rig, 'f1' + n, 0, 0, -k * g * 1.4); setR(rig, 'f2' + n, 0, 0, -k * g * 1.6); setR(rig, 'th' + n, g * 0.5, k * g * 0.6, -k * g * 0.5);
  }
  if (q.glitch > 0) { P.head.rotation.y += (h01(Math.floor(q.t * 9), q.seed) - 0.5) * 1.4 * q.glitch; P.head.rotation.z = (h01(Math.floor(q.t * 7), q.seed + 1) - 0.5) * 0.6 * q.glitch; }
}

function animateCustodian(rig: Rig, c: Creature, t: number, dt: number) {
  const K = rig as KitRig;
  kitSync(K);
  const n = nm(c);
  const ac = attackCurve(rig, c, t);
  const attacking = c.attackPhase > 0 || ac.follow > 0;
  const reach = smooth(rig, '_reach', n.reach && !attacking ? 1 : 0, 5, dt);
  const menace = smooth(rig, '_men', c.state === 'chase' || c.state === 'warn' ? 1 : 0, 2.5, dt);
  // each pair unfolds in its turn (top first), folds back in reverse
  const want = [reach || menace || attacking ? 1 : 0, menace || attacking ? 1 : 0, menace || attacking ? 1 : 0];
  const ud = rig.root.userData;
  const u: number[] = ud._u ?? (ud._u = [0, 0, 0]);
  for (let i = 0; i < PAIRS; i++) {
    const ready = want[i] ? (i === 0 || u[i - 1] > 0.45) : (i === PAIRS - 1 || u[i + 1] < 0.55);
    const target = ready ? want[i] : u[i];
    u[i] += (target - u[i]) * Math.min(1, dt * (attacking ? 9 : 3.2));
  }
  // fingers: open as they reach, close on what they take (or on you)
  const grip = [reach > 0.85 && (c.mem.reachT ?? 0) - G.time < 0.45 ? 1 : 0.15 + (1 - u[0]) * 0.35, 0.1 + (1 - u[1]) * 0.4, 0.1 + (1 - u[2]) * 0.4];
  if (attacking) { grip[0] = ac.strike > 0.3 ? 1 : 0; grip[1] = grip[2] = ac.strike > 0.2 ? 0.9 : 0.2; }
  if (menace > 0.5) { grip[1] = grip[2] = 0.05; }
  const tgt = nearestSurvivor(c, 18);
  let yaw = 0, pitch = 0;
  if (tgt) [yaw, pitch] = lookAngles(c, tgt.x, tgt.z, tgt.y, 2.45, 1.0, 0.8);
  // precise: the head turns at a constant, slow rate, then stops dead
  const cy = ud._yaw ?? 0, cp = ud._pitch ?? 0;
  const step = dt * 1.2;
  ud._yaw = cy + Math.max(-step, Math.min(step, yaw - cy));
  ud._pitch = cp + Math.max(-step, Math.min(step, pitch - cp));
  const glitch = c.state === 'frozen' || c.hitFlash > 0 || c.stagger > 0 ? 1 : 0;
  poseC(rig, { moving: c.speed > 0.1, phase: c.phase, t, u, reach, menace, strike: ac.strike, wind: ac.wind, grip, glitch, seed: idHash(c) * 50, yaw: ud._yaw, pitch: ud._pitch });
  K.kit.F.fx.value.x = glitch ? 0.35 : 0;
  K.kit.F.fx.value.y = t;
  showSpeech(c, 2.75);
}

// ---------------------------------------------------------------- judgement
const ANOMALOUS = (key: string) => { const d = itemDef(key); return d.cat === ('anomaly' as any) || !!d.anomaly || !!d.tags?.includes('anomalous'); };
/** how out of place a survivor is (>= 3: process them) */
export function untidiness(p: Player, z: Zone): number {
  let s = Math.max(0, G.missions?.stage ?? 0);
  if (z.inb(p.tileX(), p.tileY()) && (z.flags[z.idx(p.tileX(), p.tileY())] & TF.CORRUPT)) s += 2;
  const items = p.isLocal ? p.allItems() : [p.handR, p.handL].filter((x): x is NonNullable<typeof x> => !!x);
  let an = 0; for (const it of items) if (ANOMALOUS(it.key)) an++;
  s += Math.min(2, an * 0.75);
  if (p.isLocal) { const cr = p.body.corruption ?? 0; s += cr > 60 ? 2 : cr > 30 ? 1 : 0; }
  return s;
}
const NOTICES = ['This area is being maintained.', 'Please return anomalous materials.', 'You are out of place.', 'Unauthorised persistence detected.', 'Remain where you are.', 'Thank you for your patience.'];

// ---------------------------------------------------------------- tidying
type Task = { kind: 'item'; uid: number; x: number; z: number } | { kind: 'door'; x: number; y: number; side: 0 | 1; sx: number; sz: number } | { kind: 'switch'; uid: number; x: number; z: number } | { kind: 'bin'; uid: number; x: number; z: number };
function playerNear(c: Creature, x: number, z: number, r: number) { return playersIn(c).some((p) => dist(p.x, p.z, x, z) < r); }
function findTask(c: Creature): Task | null {
  const z = zoneOf(c);
  const tidied: any[] = c.mem.tidied || [];
  if (tidied.length >= 3) {
    const bins = objectsNear(z, c.x, c.z, 22, (o, d) => !!o.inv && (d.container?.kind === 'trash' || (d.container?.kind === 'bin' && d.container?.loot === 'trash') || /trash|bin/.test(o.key)), 6);
    const b = bins.sort((a, b2) => dist(a.x, a.y, c.x, c.z) - dist(b2.x, b2.y, c.x, c.z))[0];
    if (b) return { kind: 'bin', uid: b.uid, x: b.x + 0.5, z: b.y + 0.5 };
  }
  // whatever is nearest: dropped things, doors left open, things left switched on
  let best: Task | null = null, bd = Infinity;
  const consider = (t: Task, d: number) => { if (d < bd) { bd = d; best = t; } };
  if (tidied.length < 12) for (const wi of floorItemsAround(z, c.x, c.z, 10)) {
    if (isPrecious(wi.item) || playerNear(c, wi.x, wi.z, 2.5)) continue;
    consider({ kind: 'item', uid: wi.item.uid, x: wi.x, z: wi.z }, dist(wi.x, wi.z, c.x, c.z));
  }
  const cx = Math.floor(c.x), cy = Math.floor(c.z);
  for (let y = cy - 6; y <= cy + 6; y++) for (let x = cx - 6; x <= cx + 6; x++) for (const side of [0, 1] as const) {
    const e = z.edge(x, y, side);
    if (!e || e.kind !== 'door' || !e.open || e.portal || e.locked || e.barricade > 0) continue;
    const ex = side === 0 ? x + 0.5 : x, ez = side === 0 ? y : y + 0.5;
    if (playerNear(c, ex, ez, 3)) continue;
    // stand on our side of it
    const sx = side === 0 ? ex : ex + (c.x > ex ? 0.6 : -0.6), sz = side === 0 ? ez + (c.z > ez ? 0.6 : -0.6) : ez;
    consider({ kind: 'door', x, y, side, sx, sz }, dist(ex, ez, c.x, c.z) * 0.8);
  }
  const on = objectsNear(z, c.x, c.z, 8, (o, d) => !!o.state?.on && (!!d.tags?.includes('tv') || !!d.tags?.includes('radio')) && !d.tags?.includes('mission'), 3);
  for (const o of on) if (!playerNear(c, o.x + 0.5, o.y + 0.5, 4)) consider({ kind: 'switch', uid: o.uid, x: o.x + 0.5, z: o.y + 0.5 }, dist(o.x + 0.5, o.y + 0.5, c.x, c.z));
  return best;
}
function doTask(c: Creature, t: Task) {
  const z = zoneOf(c);
  if (t.kind === 'item') {
    const wi = floorItemsAround(z, t.x, t.z, 0.3).find((w) => w.item.uid === t.uid);
    if (wi) { takeFloorItem(c, wi, 'tidied'); sfx(c, 'grab', 0.6); }
  } else if (t.kind === 'door') {
    const e = z.edge(t.x, t.y, t.side);
    if (e && e.open) { op('edge', { z: c.zoneKey, x: t.x, y: t.y, side: t.side, patch: { open: false } }); sfx(c, 'door_close', 0.9); }
  } else if (t.kind === 'switch') {
    const o = z.objects.get(t.uid);
    if (o?.state?.on) { op('objState', { z: c.zoneKey, uid: o.uid, patch: { on: false } }); sfx(c, 'power_off', 0.6); }
  } else if (t.kind === 'bin') {
    const o = z.objects.get(t.uid);
    if (o?.inv) { putStored(c, 'tidied', o.uid); sfx(c, 'rummage', 0.7); }
  }
}

/** pursuing: open (and later close) doors in the way */
function doorwork(c: Creature, dt: number) {
  const z = zoneOf(c);
  const lx = c.mem.lx ?? c.x, lz = c.mem.lz ?? c.z;
  c.mem.lx = c.x; c.mem.lz = c.z;
  if (c.speed > 0.5 && dist(lx, lz, c.x, c.z) < c.speed * dt * 0.25) c.mem.stuck = (c.mem.stuck ?? 0) + dt; else c.mem.stuck = 0;
  if (c.speed === 0 || c.mem.stuck > 0.6) {
    const cx = Math.floor(c.x), cy = Math.floor(c.z);
    for (const [x, y, side] of [[cx, cy, 0], [cx, cy, 1], [cx, cy + 1, 0], [cx + 1, cy, 1]] as [number, number, 0 | 1][]) {
      const e = z.edge(x, y, side);
      if (!e || e.kind !== 'door' || e.open || e.locked || e.barricade > 0) continue;
      op('edge', { z: c.zoneKey, x, y, side, patch: { open: true } });
      sfx(c, 'door_open', 0.9);
      c.mem.toClose = { x, y, side }; c.mem.stuck = 0; c.path = null; c.repathT = 0;
      break;
    }
  }
  const tc = c.mem.toClose;
  if (tc) {
    const ex = tc.side === 0 ? tc.x + 0.5 : tc.x, ez = tc.side === 0 ? tc.y : tc.y + 0.5;
    if (dist(ex, ez, c.x, c.z) > 1.6) {
      const e = z.edge(tc.x, tc.y, tc.side);
      if (e?.open && !playerNear(c, ex, ez, 1.2)) { op('edge', { z: c.zoneKey, x: tc.x, y: tc.y, side: tc.side, patch: { open: false } }); sfx(c, 'door_close', 0.8); }
      c.mem.toClose = null;
    }
  }
}

function thinkCustodian(c: Creature, dt: number): boolean {
  const cs = CS(), z = zoneOf(c);
  const ev = pulse(c);
  restoreStore(c, 'tidied');
  // staggers: three blows in quick succession make it lose its place for a moment
  if (ev.staggered) {
    const hits: number[] = (c.mem.hits = (c.mem.hits || []).filter((h: number) => G.time - h < 6));
    hits.push(G.time);
    if (hits.length >= 3 && c.state !== 'frozen') { c.mem.hits = []; c.setState('frozen'); stop(c); sfx(c, 'custodian_glitch', 1); netSet(c, 'reach', 0); return true; }
  }
  if (c.state === 'frozen') { stop(c); if (c.stateT > 4.5) c.setState('wander'); return true; }
  // who is out of place?
  if ((c.mem.judgeT ?? 0) < G.time) {
    c.mem.judgeT = G.time + 0.6;
    let worst: Player | null = null, ws = 0;
    for (const p of playersIn(c)) {
      const d = dist(p.x, p.z, c.x, c.z);
      if (d > 16) continue;
      const s = untidiness(p, z);
      if (s > ws) { ws = s; worst = p; }
    }
    c.mem.score = ws; c.mem.worst = worst?.id ?? null;
  }
  const worst = c.mem.worst ? G.players.get(c.mem.worst) ?? null : null;
  const score = c.mem.score ?? 0;
  switch (c.state) {
    case 'chase': {
      netSet(c, 'reach', 0);
      const T = c.targetId ? G.players.get(c.targetId) ?? null : worst;
      if (!T || T.body.dead || T.zoneKey !== c.zoneKey) { c.setState('wander'); return true; }
      const d = dist(T.x, T.z, c.x, c.z);
      const sTarget = untidinessCached(c, T, z);
      if (sTarget < 2 && c.stateT > 8) { c.setState('wander'); c.targetId = null; cs.call(c, 'idle'); return true; }
      if (d > 30) { c.setState('wander'); return true; }
      const reach = (c.sp.attack?.range ?? 1.1) + T.radius;
      if (d <= reach) { faceTo(c, T.x, T.z); stop(c); if (c.attackT <= 0) attack(c, T); return true; }
      cs.moveTo(c, z, T.x, T.z, c.sp.run, dt, reach * 0.85);
      doorwork(c, dt);
      return true;
    }
    case 'warn': {
      stop(c); netSet(c, 'reach', 0);
      const T = c.targetId ? G.players.get(c.targetId) ?? null : null;
      if (!T) { c.setState('wander'); return true; }
      faceTo(c, T.x, T.z);
      if (c.stateT > 3.2) {
        if (untidinessCached(c, T, z) >= 3) { c.setState('chase'); cs.call(c, 'alert'); }
        else { c.setState('wander'); c.mem.noteCool = G.time + 25; }
      }
      return true;
    }
    default: {
      if (worst && score >= 3) { c.targetId = worst.id; c.setState('chase'); cs.call(c, 'alert'); speak(c, NOTICES[2 + Math.floor(cs.rng.next() * 3)], 3); return true; }
      if (worst && score >= 2 && G.time > (c.mem.noteCool ?? 0) && dist(worst.x, worst.z, c.x, c.z) < 9) {
        c.targetId = worst.id; c.setState('warn'); cs.call(c, 'alert'); speak(c, NOTICES[Math.floor(cs.rng.next() * 3)], 3); return true;
      }
      if (ev.staggered && c.targetId && score >= 1) { c.setState('warn'); return true; }
      return tidy(c, dt);
    }
  }
}
function untidinessCached(c: Creature, p: Player, z: Zone) {
  const k = 's_' + p.id;
  const e = c.mem[k];
  if (e && e.t > G.time) return e.v;
  const v = untidiness(p, z); c.mem[k] = { v, t: G.time + 1 };
  return v;
}

function tidy(c: Creature, dt: number): boolean {
  const cs = CS(), z = zoneOf(c);
  const task: Task | null = c.mem.task;
  if (c.mem.reachT && G.time < c.mem.reachT) { stop(c); return true; }
  if (c.mem.reachT) { c.mem.reachT = 0; netSet(c, 'reach', 0); if (task) doTask(c, task); c.mem.task = null; c.setState('wander'); c.goal = null; return true; }
  if (task) {
    const gx = task.kind === 'door' ? task.sx : task.x, gz = task.kind === 'door' ? task.sz : task.z;
    if (cs.moveTo(c, z, gx, gz, c.sp.walk, dt, task.kind === 'item' ? 0.55 : 0.8) || c.stateT > 20) {
      if (c.stateT > 20) { c.mem.task = null; c.setState('wander'); return true; }
      if (task.kind === 'door') faceTo(c, task.side === 0 ? task.x + 0.5 : task.x, task.side === 0 ? task.y : task.y + 0.5); else faceTo(c, task.x, task.z);
      stop(c);
      c.mem.reachT = G.time + 1.1; netSet(c, 'reach', 1);
    }
    doorwork(c, dt);
    return true;
  }
  if ((c.mem.taskT ?? 0) < G.time) {
    c.mem.taskT = G.time + 1.5;
    const t = findTask(c);
    if (t) { c.mem.task = t; c.setState('investigate'); return true; }
  }
  // patrol
  if (c.state !== 'wander') c.setState('wander');
  if (!c.goal || cs.moveTo(c, z, c.goal.x, c.goal.z, c.sp.walk, dt, 0.6) || c.stateT > 30) {
    c.goal = cs.wanderSpot(c, z, 22); c.stateT = 0;
  }
  if (c.noiseCooldown <= 0 && cs.rng.chance(dt * 0.06)) { cs.call(c, 'idle'); c.noiseCooldown = 12; }
  doorwork(c, dt);
  return true;
}

const sp = def({
  key: 'custodian', name: 'The Custodian', code: 'M-00 // MAINTENANCE PROCESS', temperament: 'neutral', threat: 4,
  rule: { name: 'TIDY OR TARGETED', text: 'It ignores tidy survivors. Carry anomalies or stand in corruption and it notices you. Three quick blows make it lose its place.' },
  hp: 999, walk: 1.05, run: 2.9, turn: 5, radius: 0.34, height: 2.6, sight: 18, fov: 1.5, hearing: 1.0, nightVision: true,
  attack: { dmg: [8, 15], range: 1.1, cooldown: 2.1, kinds: ['bruise', 'fracture', 'laceration'], corrupt: 0.25, knock: 1.1, parts: ['torso_u', 'head', 'neck', 'uarm_l', 'uarm_r'] },
  zones: ['office', 'mall', 'hospital', 'lab', 'server', 'corrupt'], weight: 1, maxPerZone: 2, diet: 'none',
  flags: { custodian: true, immortal: true, noCorpse: true },
  sounds: { idle: 'custodian_tone', alert: 'custodian_alarm', attack: 'custodian_strike', hurt: 'custodian_glitch' },
  scan: {
    cls: 'Maintenance process',
    notes: [
      'Tall, faceless, six arms folded behind its back. It is cleaning up.',
      'Picks up anything left on the floor and puts it in the nearest bin. Closes doors. Switches off what you left on.',
      'Ignores tidy survivors. Carrying anomalies, standing in corruption or being corrupted yourself gets you noticed.',
      'Every render node taken offline makes it less tolerant.',
      'It cannot be destroyed. Three quick blows make it lose its place for a few seconds.',
    ],
  },
  gore: { blood: 'none' },
  build: buildCustodian,
  animate: animateCustodian,
  think: thinkCustodian,
});
(sp.sounds as any).loop = 'custodian_hum';
(sp as any).animateGallery = (rig: Rig, t: number) => {
  const K = rig as KitRig;
  kitSync(K);
  const q = galleryPose('');
  const reach = q.startsWith('reach') ? 1 : 0, menace = q.startsWith('menace') ? 1 : 0, glitch = q.startsWith('glitch') ? 1 : 0;
  const atk = q.startsWith('attack');
  const ph = atk ? (t % 1.4) / 1.4 : 0;
  const wind = atk ? (ph < 0.5 ? ph / 0.5 : Math.max(0, 1 - (ph - 0.5) / 0.15)) : 0, strike = atk && ph >= 0.5 ? Math.min(1, (ph - 0.5) / 0.15) : 0;
  const fold = q.startsWith('unfold') ? 0.5 + 0.5 * Math.sin(t * 1.5) : 1;
  const u = [reach || menace || atk ? 1 : 1 - fold, menace || atk ? 1 : 1 - fold, menace || atk ? 1 : 1 - fold];
  poseC(rig, { moving: q.startsWith('walk'), phase: t * 4, t, u, reach, menace, strike, wind, grip: [reach ? 0.5 + 0.5 * Math.sin(t * 2) : 0.3, 0.3, 0.3], glitch, seed: 3, yaw: 0.3, pitch: 0 });
  rig.root.rotation.y = q.endsWith('back') ? Math.PI * 0.8 : 0;
};

// the horror layer: faceted wet materials, twitches, ragged breathing, lunges, recoils, a weighted death
horrify(sp, { twitch: 0.7, snap: 0.4 });
