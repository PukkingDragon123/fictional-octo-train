import { def, Rig } from '../species';
import { makeRamp, mixHex } from '../../gfx/pixel';
import { G } from '../../game/G';
import type { Creature } from '../creature';
import type { Player } from '../../entities/player';
import type { Zone } from '../../world/zone';
import { findPath } from '../../world/path';
import {
  net, netOf, snd, playersIn, dist, hold, face, hashId, fakeCreature, rng, playAt, live, lightAt, beamOn, seenByAny, angleDiff, localIn, thinkOnce, pickReach, walkable,
} from '../behaviors_b';
import { pulse } from '../behaviors_a';
import {
  KitDef, KitRig, BoneSpec, SkinB, BuildCtx, Page, Region, Row, Wt, buildKitRig, kitSync, kitPersonalize, tube, headLoft, handLoft, footLoft,
  wLerp, gauss, angd, FOOT_BARE, lostParts, attackCurve, flinchOf, hash, offset, nearestSurvivor, lookAngles,
} from '../kit/humanoids';
import { defDread } from '../dread';
import '../../audio/sounds_creatures_c';

// =====================================================================================
// STAMMER — a tall, starved figure the colour of overexposed film. It is
// never seen walking. It stands in the dark, perfectly still, and then the
// picture skips and it is two metres closer, caught for one frame
// mid-stride. Its arms are folded up against its chest like a deck chair;
// they unfold to twice their length when it reaches for you. A light held on
// it drives it back into the dark, skipping backwards.
// =====================================================================================

// ------------------------------------------------------------------ skeleton
function bonesS(v: number): BoneSpec[] {
  const L = 1 + (v % 3) * 0.05;
  const b: BoneSpec[] = [
    { name: 'pelvis', parent: '', at: [0, 1.5 * L, 0] },
    { name: 'spine', parent: 'pelvis', at: [0, 0.05, 0] },
    { name: 'chest', parent: 'spine', at: [0, 0.36, -0.02] },
    { name: 'neck', parent: 'chest', at: [0, 0.34, 0.02], cap: true },
    { name: 'head', parent: 'neck', at: [0, 0.26, 0.03], cap: true },
    { name: 'jaw', parent: 'head', at: [0, 0.03, 0.05] },
  ];
  for (const [s, k] of [['L', 1], ['R', -1]] as const) {
    b.push(
      { name: 'arm' + s, parent: 'chest', at: [k * 0.21, 0.29, -0.01], cap: true },
      { name: 'fore' + s, parent: 'arm' + s, at: [0, -0.56, 0], cap: true },
      { name: 'hand' + s, parent: 'fore' + s, at: [0, -0.74, 0], cap: true },
      { name: 'f1' + s, parent: 'hand' + s, at: [0, -0.1, 0] },
      { name: 'f2' + s, parent: 'f1' + s, at: [0, -0.14, 0] },
      { name: 'th' + s, parent: 'hand' + s, at: [-k * 0.004, -0.03, 0.024] },
      { name: 'thigh' + s, parent: 'pelvis', at: [k * 0.085, -0.04, 0], cap: true },
      { name: 'shin' + s, parent: 'thigh' + s, at: [0, -0.78 * L, 0], cap: true },
      { name: 'foot' + s, parent: 'shin' + s, at: [0, -0.68 * L, 0] },
    );
  }
  return b;
}
const LEN = (v: number) => 1 + (v % 3) * 0.05;

function layoutS(p: Page) {
  p.reg('TORSO', 64, 64, [1.44, 2.3]);
  p.reg('HEAD', 64, 40, [-0.04, 0.24]);
  p.reg('ARM', 16, 100, [-1.32, 0.03]);
  p.reg('LEG', 18, 100, [-1.5, 0.06]);
  p.reg('NECK', 16, 32, [-0.04, 0.36]);
  p.reg('HAND', 18, 32);
  p.reg('FOOT', 22, 14);
  p.reg('MOUTH', 14, 18);
  p.reg('CAP', 16, 16);
}

const TORSO_S: Row[] = [
  { y: 1.45, rx: 0.05, rf: 0.04, rb: 0.045 },
  { y: 1.5, rx: 0.1, rf: 0.065, rb: 0.07 },
  { y: 1.58, rx: 0.09, rf: 0.055, rb: 0.065 },
  { y: 1.7, rx: 0.058, rf: 0.04, rb: 0.055 },      // the waist is a spine with skin over it
  { y: 1.84, rx: 0.09, rf: 0.07, rb: 0.06 },
  { y: 1.98, rx: 0.11, rf: 0.085, rb: 0.07 },
  { y: 2.12, rx: 0.12, rf: 0.07, rb: 0.08 },
  { y: 2.2, rx: 0.15, rf: 0.055, rb: 0.075, sq: 2.6 },
  { y: 2.25, rx: 0.08, rf: 0.04, rb: 0.05 },
  { y: 2.28, rx: 0.035, rf: 0.03, rb: 0.035 },
];
const ARM_S = (L: number): Row[] => [
  { y: 0.0, rx: 0.026, rf: 0.028, rb: 0.028 },
  { y: -0.03, rx: 0.033, rf: 0.033, rb: 0.033 },
  { y: -0.5, rx: 0.022, rf: 0.022, rb: 0.025 },
  { y: -0.56, rx: 0.033, rf: 0.03, rb: 0.037 },   // elbows like knots
  { y: -0.62, rx: 0.021, rf: 0.021, rb: 0.022 },
  { y: -1.25 * L, rx: 0.015, rf: 0.016, rb: 0.016 },
  { y: -1.3 * L, rx: 0.02, rf: 0.02, rb: 0.02 },
];
const LEG_S: Row[] = [
  { y: 0.06, rx: 0.04, rf: 0.04, rb: 0.046 },
  { y: -0.02, rx: 0.046, rf: 0.046, rb: 0.05 },
  { y: -0.3, rx: 0.032, rf: 0.032, rb: 0.036 },
  { y: -0.72, rx: 0.024, rf: 0.026, rb: 0.024 },
  { y: -0.78, rx: 0.034, rf: 0.038, rb: 0.03 },   // knees
  { y: -0.84, rx: 0.022, rf: 0.022, rb: 0.026 },
  { y: -1.0, rx: 0.026, rf: 0.022, rb: 0.032 },
  { y: -1.4, rx: 0.014, rf: 0.016, rb: 0.016 },
  { y: -1.46, rx: 0.018, rf: 0.018, rb: 0.018 },
];
const HEAD_S: Row[] = [
  { y: -0.03, rx: 0.026, rf: 0.026, rb: 0.026 },
  { y: 0.0, rx: 0.044, rf: 0.06, rb: 0.046 },       // a long jaw, hanging
  { y: 0.05, rx: 0.058, rf: 0.07, rb: 0.06 },
  { y: 0.11, rx: 0.066, rf: 0.074, rb: 0.072 },
  { y: 0.16, rx: 0.07, rf: 0.07, rb: 0.078 },
  { y: 0.2, rx: 0.062, rf: 0.06, rb: 0.072, cz: -0.006 },
  { y: 0.23, rx: 0.036, rf: 0.032, rb: 0.044, cz: -0.012 },
];

function buildS(B: SkinB, x: BuildCtx) {
  const bi = x.bi, R = x.R, L = LEN(x.variant);
  const pel = x.rest('pelvis')[1];
  const off = pel - 1.5; // body rows are authored for a pelvis at 1.5
  const tw = (y: number): Wt => {
    if (y < 1.52) return [bi('pelvis'), 1];
    if (y < 1.6) return wLerp(y, 1.52, 1.6, bi('pelvis'), bi('spine'));
    if (y < 1.86) return [bi('spine'), 1];
    if (y < 1.96) return wLerp(y, 1.86, 1.96, bi('spine'), bi('chest'));
    if (y < 2.26) return [bi('chest'), 1];
    return [bi('chest'), 0.5, bi('neck'), 0.5];
  };
  // a ribcage you could count, a spine of knuckles
  tube(B, { rows: TORSO_S.map((r) => ({ ...r, rx: r.rx * 1.3, rf: r.rf * 1.2, rb: r.rb * 1.25 })), ys: [1.45, 1.5, 1.54, 1.58, 1.64, 1.7, 1.76, 1.84, 1.91, 1.98, 2.05, 2.12, 2.17, 2.2, 2.25, 2.28], n: 12, reg: R('TORSO'), vr: R('TORSO').range, at: [0, off, 0], w: (y) => tw(y), g: 1, start: [0, 1.445 + off, 0], end: [0, 2.29 + off, -0.004],
    bump: (th, y) => (Math.cos(th) > -0.2 ? 0.09 * Math.pow(Math.max(0, Math.sin(y * 70)), 2) * gauss(y, 2.0, 0.12) : 0) + gauss(Math.abs(angd(th, Math.PI)), 0, 0.12) * 0.1 * Math.max(0, Math.sin(y * 95)) - gauss(y, 1.72, 0.06) * gauss(th, 0, 0.5) * 0.12 });
  tube(B, { rows: [{ y: -0.04, rx: 0.03, rf: 0.03, rb: 0.034 }, { y: 0.05, rx: 0.02, rf: 0.02, rb: 0.024 }, { y: 0.28, rx: 0.018, rf: 0.018, rb: 0.022 }, { y: 0.35, rx: 0.026, rf: 0.026, rb: 0.026 }],
    ys: [-0.04, 0.02, 0.08, 0.16, 0.24, 0.3, 0.35], n: 7, reg: R('NECK'), vr: R('NECK').range, at: x.rest('neck'), w: (y) => (y < 0.0 ? [bi('chest'), 0.5, bi('neck'), 0.5] : y > 0.3 ? [bi('neck'), 0.4, bi('head'), 0.6] : [bi('neck'), 1]), g: 4 });
  const hp = x.rest('head');
  headLoft(B, { at: hp, rows: HEAD_S, s: 1.3, reg: R('HEAD'), vr: R('HEAD').range, w: (y) => (y < 0.06 ? [bi('head'), 0.5, bi('jaw'), 0.5] : [bi('head'), 1]), g: 6, top: 0.235, bottom: -0.035,
    bump: (th, y) => -gauss(Math.abs(th), 0.32, 0.12) * gauss(y, 0.12, 0.018) * 0.22 - gauss(th, 0, 0.16) * gauss(y, 0.04, 0.03) * 0.16 });
  // the inside of the mouth: a long dark hole the jaw hangs open over
  {
    const J = bi('jaw'), z = hp[2] + 0.05;
    B.quad([hp[0] - 0.03, hp[1] - 0.03, z + 0.012], [hp[0] + 0.03, hp[1] - 0.03, z + 0.012], [hp[0] + 0.03, hp[1] + 0.09, z + 0.012], [hp[0] - 0.03, hp[1] + 0.09, z + 0.012], R('MOUTH'), [0, 0, 1, 1], [J, 1]);
  }
  for (const [s, k] of [['L', 1], ['R', -1]] as const) {
    const U = bi('arm' + s), F = bi('fore' + s), H = bi('hand' + s);
    const at = x.rest('arm' + s);
    const wf = (y: number): Wt => {
      if (y > -0.03) return [U, 0.75, bi('chest'), 0.25];
      if (y > -0.5) return [U, 1];
      if (y > -0.62) return wLerp(y, -0.5, -0.62, U, F);
      if (y > -1.26 * L) return [F, 1];
      return [F, 0.5, H, 0.5];
    };
    tube(B, { rows: ARM_S(L), ys: [0, -0.03, -0.2, -0.4, -0.5, -0.56, -0.62, -0.8, -1.0, -1.15, -1.25 * L, -1.3 * L], n: 6, reg: R('ARM'), vr: R('ARM').range, at, w: wf, g: 10 + (k > 0 ? 0 : 1), mirror: k });
    const hpp = x.rest('hand' + s);
    handLoft(B, { k, at: [hpp[0], hpp[1] - 0.004, hpp[2]], bones: { farm: F, hand: H, f1: bi('f1' + s), f2: bi('f2' + s), thumb: bi('th' + s) }, reg: R('HAND'), g: 20 + (k > 0 ? 0 : 10), s: 1.0,
      palm: { len: 0.1, w: 0.03, t: 0.01 }, fingers: { n: 3, len: [0.25, 0.28, 0.24], r: [0.0058, 0.006, 0.0056] }, thumb: { len: 0.1, r: 0.006 } });
    const T = bi('thigh' + s), Sh = bi('shin' + s), Ft = bi('foot' + s);
    const lt = x.rest('thigh' + s);
    const rows = LEG_S.map((r) => ({ ...r, y: r.y < -0.75 ? r.y * L : r.y }));
    const wl = (y: number): Wt => {
      if (y > 0.02) return [bi('pelvis'), 0.5, T, 0.5];
      if (y > -0.72 * L) return [T, 1];
      if (y > -0.84 * L) return wLerp(y, -0.72 * L, -0.84 * L, T, Sh);
      if (y > -1.42 * L) return [Sh, 1];
      return [Sh, 0.5, Ft, 0.5];
    };
    tube(B, { rows, ys: [0.06, -0.02, -0.15, -0.3, -0.5, -0.72 * L, -0.78 * L, -0.84 * L, -1.0 * L, -1.2 * L, -1.4 * L, -1.46 * L], n: 6, reg: R('LEG'), vr: R('LEG').range.map((v) => v * L), at: lt, w: wl, g: 30 + (k > 0 ? 0 : 1), mirror: k, start: [lt[0], lt[1] + 0.06, lt[2]], startW: [bi('pelvis'), 0.6, T, 0.4] });
    footLoft(B, { k, at: x.rest('foot' + s), rows: FOOT_BARE, ground: -0.06, sole: 0.002, lip: 0, reg: R('FOOT'), w: [Ft, 1], g: 36 + (k > 0 ? 0 : 1), s: 1.25, sx: 0.55, toeLift: 0.1 });
  }
}

function paintS(p: Page, x: BuildCtx) {
  const v = x.variant;
  // overexposed film: grey-white, bleached, with a sour yellow in the shadows
  const SK = makeRamp([0xb8b4a8, 0xb0aca4, 0xbcb6a6][v % 3], 10, { hueShift: -0.06, spread: 0.55 });
  const skin = (r: Region, base: number, sd: number, extra?: (xx: number, yy: number) => number) => {
    r.fill(SK, (xx, yy) => {
      const th = (r.deg(xx) * Math.PI) / 180;
      return base + 1.4 * Math.cos(th) - 0.4 + (r.fbm(xx, yy, 3, 2, sd) - 0.5) * 1.1 + (extra ? extra(xx, yy) : 0);
    }, undefined, 0.6);
    // film damage: vertical scratches that run the full length, light and dark
    for (let i = 0; i < Math.max(2, r.w / 9); i++) {
      const sx = Math.floor(hash(i, sd + 3) * r.w), dark = hash(i, sd + 4) < 0.4;
      for (let yy = 0; yy < r.h; yy++) if (hash(yy >> 3, sd + i) < 0.85) r.blend(sx, yy, dark ? SK[1] : 0xf4f2ec, dark ? 0.45 : 0.55);
    }
    // grain
    for (let yy = 0; yy < r.h; yy++) for (let xx = 0; xx < r.w; xx++) if (hash(xx * 7 + yy, sd) < 0.06) r.blend(xx, yy, hash(xx, yy + sd) < 0.5 ? SK[2] : SK[8], 0.5);
  };
  {
    const r = p.R('TORSO');
    skin(r, 5, 11, (xx, yy) => {
      const h = r.yAt(yy), th = (r.deg(xx) * Math.PI) / 180;
      return (Math.cos(th) > -0.2 ? 1.8 * Math.pow(Math.max(0, Math.sin(h * 70)), 2) * gauss(h, 2.0, 0.12) - 1.4 * Math.pow(Math.max(0, -Math.sin(h * 70)), 2) * gauss(h, 2.0, 0.12) : 0)
        + (Math.abs(angd(th, Math.PI)) < 0.12 ? 1.5 * Math.max(0, Math.sin(h * 95)) : 0) - 1.6 * gauss(h, 1.72, 0.05) * gauss(r.deg(xx), 0, 40);
    });
  }
  { const r = p.R('NECK'); skin(r, 4.6, 13); for (let yy = 1; yy < r.h; yy += 3) r.hline(r.X(-50), r.X(50), yy, SK[2], 0.35); }
  {
    const r = p.R('HEAD');
    skin(r, 5.2, 17, (xx, yy) => {
      const deg = r.deg(xx), h = r.yAt(yy), a = Math.abs(deg);
      return -3.0 * gauss(a, 18, 7) * gauss(h, 0.12, 0.016) - 1.2 * Math.max(0, (0.0 - h) / 0.03) + 0.6 * gauss(a, 18, 10) * gauss(h, 0.145, 0.01);
    });
    // eyes: two black holes, too deep, smeared downward like wet emulsion
    for (const k of [-1, 1]) {
      const ex = r.X(k * 18), ey = r.Y(0.12);
      r.ellipse(ex, ey, 2.4, 2, 0x060404);
      for (let i = 1; i < 6; i++) r.blend(ex + (hash(i, k + 5) - 0.5) * 2, ey + 2 + i, 0x1a1210, 0.7 - i * 0.1);
    }
    // the mouth: hanging open to the chin
    for (let yy = Math.round(r.Y(0.07)); yy <= Math.round(r.Y(-0.02)); yy++) for (let dx = -2; dx <= 2; dx++) r.set(r.X(0) + dx, yy, Math.abs(dx) === 2 ? 0x3a2a24 : 0x0a0606);
  }
  { const r = p.R('ARM'); skin(r, 4.6, 19); for (const h of [-0.56, -1.25]) r.hline(0, r.w - 1, Math.round(r.Y(h)), SK[2], 0.6); }
  { const r = p.R('LEG'); skin(r, 4.4, 23); r.hline(0, r.w - 1, Math.round(r.Y(-0.78)), SK[2], 0.6); for (let yy = Math.round(r.h * 0.85); yy < r.h; yy++) for (let xx = 0; xx < r.w; xx++) if (hash(xx, yy) < 0.4) r.blend(xx, yy, 0x3a3428, 0.5); }
  { const r = p.R('HAND'); skin(r, 4.6, 29); for (let xx = 0; xx < r.w; xx++) r.set(xx, r.h - 1, 0x2a2420); }
  { const r = p.R('FOOT'); skin(r, 3.6, 31); }
  {
    const r = p.R('MOUTH');
    for (let yy = 0; yy < r.h; yy++) for (let xx = 0; xx < r.w; xx++) r.set(xx, yy, xx === 0 || xx === r.w - 1 ? 0x2a1a16 : 0x070404);
    for (let yy = 2; yy < r.h; yy += 3) { r.set(2, yy, 0x8a8478); r.set(r.w - 3, yy + 1, 0x8a8478); }
  }
  {
    const r = p.R('CAP');
    for (let yy = 0; yy < r.h; yy++) for (let xx = 0; xx < r.w; xx++) {
      const d = Math.hypot(xx + 0.5 - r.w / 2, yy + 0.5 - r.h / 2) / (r.w / 2);
      r.set(xx, yy, d > 0.88 ? SK[6] : d < 0.25 ? 0xd8d2c0 : hash(xx, yy) < 0.4 ? 0x5a5448 : 0x8a7e6a);
    }
  }
}

const STAMMER_KIT: KitDef = { key: 'stammer', variants: 3, bones: bonesS, layout: layoutS, build: buildS, paint: paintS, sphere: [0, 1.4, 0, 2.2] };
function buildStammer(): Rig { return buildKitRig(STAMMER_KIT, 0, 2.6); }

// ------------------------------------------------------------------ animation
type AM = { skSeen?: number; skAt?: number; low?: number; hy?: number; deadT?: number; fold?: number; jaw?: number; cover?: number };
function animateStammer(rig: Rig, c: Creature, t: number, dt: number) {
  const K = rig as KitRig;
  if (K.kit.who !== c.id) { K.kit.who = c.id; kitPersonalize(K, Math.floor(hashId(c.id) * 3)); }
  kitSync(K);
  const P = rig.parts;
  const R = (n: string, x: number, y = 0, z = 0) => { const o = P[n]; if (o) o.rotation.set(x, y, z); };
  const ud = rig.root.userData as AM;
  const n = netOf(c);
  const seed = hashId(c.id);
  const ac = attackCurve(rig, c, t);
  const lost = lostParts(c);
  // a skip just happened: one frame of a stride it never took, the picture tears, a projector clicks
  if (n.sk !== undefined && n.sk !== ud.skSeen) {
    const first = ud.skSeen === undefined;
    ud.skSeen = n.sk;
    if (!first) {
      ud.skAt = t;
      if (live()) {
        if (G.role === 'client' && c.net) { c.x = c.net.x; c.z = c.net.z; }
        playAt('stammer_click', c, 0.8, 18);
      }
    }
  }
  const skipK = ud.skAt !== undefined && t - ud.skAt < 0.16 ? 1 : 0;
  const moving = c.speed > 0.2;
  const flee = c.state === 'flee';
  // arms: folded up against the chest like a deck chair, unless it is reaching
  const unfold = Math.max(ac.wind * 0.6, ac.strike, ac.follow);
  ud.fold = (ud.fold ?? 1) + ((1 - unfold) - (ud.fold ?? 1)) * Math.min(1, dt * 18);
  const fold = ud.fold;
  ud.cover = (ud.cover ?? 0) + ((n.lit ? 1 : 0) - (ud.cover ?? 0)) * Math.min(1, dt * 8);
  const cover = ud.cover;
  const sway = Math.sin(t * 0.9 + seed * 10) * 0.03;
  // stillness: hunched, the head hanging below the shoulders
  R('pelvis', 0.08, 0, 0);
  R('spine', 0.22 + ac.strike * 0.2 - ac.wind * 0.15, 0, sway);
  R('chest', 0.24 + ac.strike * 0.15, 0, 0);
  R('neck', 0.7 - ac.strike * 0.9 - cover * 0.2, 0, 0);
  const tgt = nearestSurvivor(c, 16);
  let yaw = 0;
  if (tgt) [yaw] = lookAngles(c, tgt.x, tgt.z, tgt.y, 2.3, 1.1, 0.5);
  ud.hy = (ud.hy ?? 0) + (yaw - (ud.hy ?? 0)) * Math.min(1, dt * 2.5);
  R('head', 0.45 - ac.strike * 0.9 - cover * 0.4, ud.hy * 0.6 + cover * 0.8, 0.15 + sway * 2);
  ud.jaw = (ud.jaw ?? 0.2) + ((ac.wind > 0.3 || ac.strike > 0 ? 0.9 : flee ? 0.7 : 0.2 + Math.max(0, Math.sin(t * 0.7 + seed * 5)) * 0.1) - (ud.jaw ?? 0.2)) * Math.min(1, dt * 10);
  R('jaw', ud.jaw * 0.7, 0, 0);
  for (const [i, s, k] of [[0, 'L', 1], [1, 'R', -1]] as const) {
    // folded: upper arm down and forward, the forearm folded flat up against it, the hand at the chin
    const ax = -0.25 * fold + (-2.05 - 0.1 * i) * (1 - fold) - cover * 1.3;
    const az = k * (0.18 * fold + 0.05 * (1 - fold) + cover * 0.25);
    R('arm' + s, ax, k * -0.15 * fold, az);
    R('fore' + s, -2.75 * fold - cover * 0.4 + 0.02, 0, 0);
    R('hand' + s, -0.6 * fold, 0, 0);
    const curl = unfold > 0.5 ? 0.0 : 0.7 + Math.sin(t * 5 + i * 2 + seed * 9) * 0.12; // the fingers never stop
    R('f1' + s, 0, 0, -k * curl); R('f2' + s, 0, 0, -k * curl * 1.3); R('th' + s, curl * 0.3, k * curl * 0.4, 0);
    // legs: straight, a little knock-kneed; a real stride only when it is made to walk
    const ph0 = c.phase * 0.7 + i * Math.PI;
    let tx = 0.04, sx = 0.08;
    if (moving) { tx = Math.sin(ph0) * 0.55 * (flee ? -1 : 1); sx = 0.1 + Math.max(0, -Math.sin(ph0)) * 0.9; }
    if (skipK) { tx = i === 0 ? -0.7 : 0.45; sx = i === 0 ? 0.6 : 0.15; }
    if (lost.has('thigh' + s) || lost.has('shin' + s)) { tx = -1.2; sx = 1.6; }
    R('thigh' + s, tx, 0, k * 0.03);
    R('shin' + s, sx, 0, 0);
    R('foot' + s, -0.05 - sx * 0.3, 0, 0);
  }
  if (skipK) { R('spine', 0.5, 0.2, 0.1); R('head', 0.1, 0.4, 0.6); }
  offset(rig, 'pelvis', 0, -(lost.has('thighL') || lost.has('thighR') || lost.has('shinL') || lost.has('shinR') ? 0.7 : 0), 0);
  const fl = flinchOf(c);
  if (fl > 0) { rig.body.position.x = Math.sin(t * 80) * 0.05 * fl; P.head.rotation.z += 0.6 * fl; } else rig.body.position.x = 0;
  // the picture tears on every skip, and a little all the time in the dark
  const F = K.kit.F.fx.value;
  F.y += dt;
  F.x = skipK ? 0.85 : 0;
  F.z = Math.min(1, c.hitFlash / 0.15) * 0.5;
  if (c.dead) {
    // it folds up like a deck chair and goes down
    ud.deadT = (ud.deadT ?? 0) + dt;
    const k = Math.min(1, ud.deadT * 2);
    for (const [s, kk] of [['L', 1], ['R', -1]] as const) { R('thigh' + s, -1.5 * k, 0, kk * 0.1); R('shin' + s, 2.6 * k, 0, 0); R('arm' + s, -0.3, 0, kk * 0.4); R('fore' + s, -2.6, 0, 0); }
    R('neck', 1.0 * k); R('head', 0.6 * k, 0.5, 0.4); F.x = 0;
    offset(rig, 'pelvis', 0, -0.9 * k, 0);
  }
  // being hunted by it: the local survivor feels the skips
  const p = localIn(c);
  if (p && !c.dead && c.state === 'stalk') {
    const d = Math.hypot(p.x - c.x, p.z - c.z);
    if (d < 9) { p.body.stress = Math.min(100, p.body.stress + dt * 3); thinkOnce(p, 'stammer', ['It was further away a second ago.', 'Every time the picture jumps, it is closer.', 'Don\'t blink. Do NOT blink.'][Math.floor(t) % 3], 80); }
  }
}

// ------------------------------------------------------------------ brain (host)
const isDark = (z: Zone, x: number, zz: number) => lightAt(z, x, zz) < 0.42;

/** jump `len` metres along the walkable path toward (tx, tz), only onto dark tiles unless `anyLight` */
function skipToward(c: Creature, z: Zone, tx: number, tz: number, len: number, anyLight = false, back = false): boolean {
  let pts: [number, number][] | null;
  if (back) {
    const s = pickReach(z, c.x, c.z, (x, zz, st) => { const d = Math.hypot(x - tx, zz - tz); return st > 8 || d < Math.hypot(c.x - tx, c.z - tz) + 1 ? null : (isDark(z, x, zz) ? 3 : -3) + d * 0.2; }, 200);
    if (!s) return false;
    pts = [[Math.floor(s.x), Math.floor(s.z)]];
  } else {
    pts = findPath(z, Math.floor(c.x), Math.floor(c.z), Math.floor(tx), Math.floor(tz), { creature: true, maxNodes: 1500, doors: false });
    if (!pts || pts.length < 2) return false;
  }
  let x = c.x, zz = c.z, left = len;
  for (let i = back ? 0 : 1; i < pts.length && left > 0; i++) {
    const px = pts[i][0] + 0.5, pz = pts[i][1] + 0.5;
    const d = Math.hypot(px - x, pz - zz);
    if (!anyLight && !isDark(z, px, pz) && Math.hypot(px - tx, pz - tz) > 3.2) break;
    if (d > left) { x += ((px - x) / d) * left; zz += ((pz - zz) / d) * left; left = 0; break; }
    x = px; zz = pz; left -= d;
  }
  if (Math.hypot(x - c.x, zz - c.z) < 0.4 || !walkable(z, Math.floor(x), Math.floor(zz))) return false;
  // never closer than an arm's reach in one jump
  const dd = Math.hypot(tx - x, tz - zz);
  if (!back && dd < 1.6) { const k = 1.6 / Math.max(0.01, dd); x = tx + (x - tx) * k; zz = tz + (zz - tz) * k; if (!walkable(z, Math.floor(x), Math.floor(zz))) return false; }
  c.x = x; c.z = zz;
  face(c, tx, tz, true);
  const nn = net(c);
  nn.sk = ((nn.sk ?? 0) + 1) % 1000;
  return true;
}

function target(c: Creature): Player | null {
  let best: Player | null = null, bd = 28;
  for (const p of playersIn(c.zoneKey)) { const d = dist(p, c); if (d < bd) { bd = d; best = p; } }
  return best;
}

function thinkStammer(c: Creature, dt: number): boolean {
  const z = G.getZone(c.zoneKey), cs = G.creatures, m = c.mem;
  const n = net(c);
  pulse(c);
  hold(c);
  // a light held on it: it shields its face and skips back into the dark
  const beam = beamOn(z, c.x, c.z, 14);
  m.litT = beam ? (m.litT ?? 0) + dt : Math.max(0, (m.litT ?? 0) - dt * 2);
  n.lit = m.litT > 0.3 ? 1 : 0;
  if (m.litT > 1.0 && c.state !== 'flee') { c.setState('flee'); m.skipT = 0; playAt('stammer_shriek', c, 0.9, 30); m.shyUntil = G.time + rng.float(6, 12); }
  if (c.state === 'flee') {
    m.skipT = (m.skipT ?? 0) - dt;
    if (m.skipT <= 0) {
      m.skipT = rng.float(0.35, 0.6);
      const from = beam || target(c);
      if (from) skipToward(c, z, from.x, from.z, rng.float(2, 3), true, true);
    }
    if (c.stateT > 3 || (!beam && c.stateT > 1.5 && isDark(z, c.x, c.z))) c.setState('idle');
    return true;
  }
  const p = target(c);
  if (!p) {
    c.setState('idle');
    // drift between dark places, a skip at a time
    m.skipT = (m.skipT ?? rng.float(3, 8)) - dt;
    if (m.skipT <= 0) {
      m.skipT = rng.float(4, 10);
      const s = pickReach(z, c.x, c.z, (x, zz, st) => (st < 2 || st > 6 || !isDark(z, x, zz) ? null : 0), 120);
      if (s) skipToward(c, z, s.x, s.z, 2.4, false);
    }
    return true;
  }
  const d = dist(p, c);
  face(c, p.x, p.z);
  // within its reach: it unfolds
  const reach = (c.sp.attack!.range) + p.radius;
  if (d <= reach && c.attackT <= 0 && (m.shyUntil ?? 0) < G.time) { cs.startAttack(c, p); return true; }
  c.setState(d < 22 ? 'stalk' : 'idle');
  // the skips: more often in the dark, when it is not watched, when your light is out
  const seen = cs.observed(c, z, true);
  const out = (p as any).__flickUntil && G.time < (p as any).__flickUntil;
  m.skipT = (m.skipT ?? rng.float(0.8, 1.6)) - dt;
  if (m.skipT <= 0 && (m.shyUntil ?? 0) < G.time) {
    m.skipT = out ? rng.float(0.25, 0.4) : seen ? rng.float(1.4, 2.6) : rng.float(0.7, 1.4);
    if (!seen || out || rng.chance(0.45)) {
      const len = d < 4 ? d - 1.4 : rng.float(1.6, 2.6);
      if (len > 0.3) skipToward(c, z, p.x, p.z, len, d < 6 || isDark(z, p.x, p.z));
    }
  }
  if (d < 7 && c.noiseCooldown <= 0 && rng.chance(dt * 0.3)) { playAt('stammer_click', c, 0.5, 12); c.noiseCooldown = 4; }
  return true;
}

const S = def({
  key: 'stammer', name: 'Stammer', code: 'ST-02 // FRAME-SKIP ENTITY', temperament: 'stalker', threat: 4,
  hp: 95, walk: 0.9, run: 1.6, turn: 5, radius: 0.3, height: 2.6, sight: 22, fov: 1.4, hearing: 1.2, nightVision: true,
  attack: { dmg: [14, 22], range: 1.9, cooldown: 2.2, kinds: ['laceration', 'deep', 'fracture'], corrupt: 0.1, knock: 1.1, parts: ['torso_u', 'neck', 'head', 'uarm_l', 'uarm_r'] },
  zones: ['lobby', 'office', 'stairwell', 'hospital', 'parking', 'corrupt', 'school'], weight: 1, maxPerZone: 2, diet: 'none',
  sounds: snd({ attack: 'stammer_unfold', hurt: 'stammer_shriek', death: 'stammer_die', step: 'stammer_step' }),
  scan: {
    cls: 'Discontinuous predator',
    notes: [
      'Tall, starved, the colour of overexposed film. It is never seen walking.',
      'It skips: the picture jumps and it is two metres closer, caught mid-stride for one frame.',
      'It skips more often when you are not looking, and every time your light stutters.',
      'Its arms fold up against its chest. Unfolded, it can reach you from two metres away.',
      'Hold a light on its face. It cannot stand that, and skips back into the dark.',
    ],
  },
  gore: { blood: 'pale', tint: 0xd8d0c8, flesh: 0xc8c0b0, sever: ['armL', 'armR', 'foreL', 'foreR', 'thighL', 'thighR', 'shinL', 'shinR'], head: 'head' },
  build: buildStammer,
  animate: animateStammer,
  think: thinkStammer,
});
defDread('stammer', { bend: ['shinL', 'shinR', 'foreL', 'foreR'], bendRate: 0.5, stretch: { parts: ['foreL', 'foreR'], amount: 0.55 }, sting: 'hit', cam: 1, flick: 9, twitch: ['head', 'handL', 'handR'], twitchRate: 0.3, tilt: 'head', tiltMax: 0.5, moved: true });
(S as any).animateGallery = (rig: Rig, t: number) => {
  const q = new URLSearchParams(location.search).get('pose') || '';
  const atk = q === 'attack' ? Math.max(0, 0.38 - (t % 1.4) * 0.5) : 0;
  const c = fakeCreature(S, { id: 'g1', state: q === 'walk' ? 'flee' : 'stalk', speed: q === 'walk' ? 1 : 0, phase: t * 3, attackPhase: q === 'reach' ? 0.05 : atk, mem: { netMem: { lit: q === 'lit' ? 1 : 0, sk: q === 'skip' ? Math.floor(t * 1.5) : 0 } } });
  animateStammer(rig, c, t, 1 / 60);
};
void mixHex; void angleDiff; void seenByAny;
