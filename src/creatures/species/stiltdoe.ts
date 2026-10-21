// Stilt Doe: a deer on legs over two metres long. Graceful, nervous body
// hung impossibly high on knobbly stilts with knuckled knees and hocks;
// a long arched neck; an eyeless face (smooth skin where the eyes should be,
// a single dark nostril slit) under one huge flat ear lying across the top
// of its head. It picks its way along one leg at a time, splays its legs like
// a spider to bring its mouth down to the grass, bounds away in huge strides,
// rears to kick, and turns its head all the way round when watched.
import { def, newRig, Rig } from '../species';
import { mixHex, scaleHex, ph } from '../../gfx/pixel';
import { G } from '../../game/G';
import type { Creature } from '../creature';
import {
  Page, OB, V3, bpart, bodyRing, registerPage, applyLook, meshOf, gaitState, trackMotion, poseLegs, LegSpec, GaitParams,
  animMem, tickEvents, lookAtTarget, partGone, clamp, clamp01, lerp, smooth, gauss, damp, hash01, LoftRing,
  Row, sampleRows, ab, uOf, ramp, fillLv, galleryDriver,
} from '../kit/beasts';

const L = 2.15;              // leg length (absurd)
const TY = L + 0.1;          // torso pivot height
const FL1 = 0.98, FL2 = 1.2; // front: shoulder->knee(ish) / knee->hoof (virtual)
const HL1 = 0.95, HL2 = 1.24;

const PG = registerPage(new Page('c_doepg', 128, 128, [
  ['TORSO', 60, 44], ['NECK', 22, 50], ['HEAD', 40, 24], ['EAR', 36, 14], ['LEG_U', 14, 54], ['LEG_L', 12, 62],
  ['HOOF', 12, 8], ['TAIL', 10, 10], ['CUT', 14, 14], ['MUZ', 12, 8],
], 3));

const TORSO: Row[] = [
  { z: -0.47, cy: 0.04, rx: 0.04, up: 0.04, dn: 0.04 },
  { z: -0.43, cy: 0.04, rx: 0.1, up: 0.08, dn: 0.1 },
  { z: -0.36, cy: 0.035, rx: 0.13, up: 0.095, dn: 0.13 },
  { z: -0.26, cy: 0.04, rx: 0.13, up: 0.095, dn: 0.13 },
  { z: -0.14, cy: 0.045, rx: 0.12, up: 0.09, dn: 0.13 },
  { z: 0.0, cy: 0.04, rx: 0.135, up: 0.095, dn: 0.16 },
  { z: 0.14, cy: 0.04, rx: 0.14, up: 0.1, dn: 0.17 },
  { z: 0.26, cy: 0.05, rx: 0.125, up: 0.105, dn: 0.16 },
  { z: 0.36, cy: 0.07, rx: 0.1, up: 0.1, dn: 0.13 },
  { z: 0.43, cy: 0.1, rx: 0.07, up: 0.08, dn: 0.09 },
  { z: 0.46, cy: 0.12, rx: 0.05, up: 0.05, dn: 0.06 },
];
const SHOULDER: V3 = [0.085, -0.08, 0.3];
const HIP: V3 = [0.08, -0.04, -0.33];
const NECK_AT: V3 = [0, 0.1, 0.4];
const NECK_LEN = 0.85;

// ---------------------------------------------------------------- geometry
function torsoGeo(ob: OB) {
  const reg = PG.reg('TORSO');
  const z0 = TORSO[0].z, z1 = TORSO[TORSO.length - 1].z;
  const n = 15;
  const rings: LoftRing[] = [];
  for (let k = 0; k <= 16; k++) {
    const z = lerp(z0, z1, k / 16);
    const r = sampleRows(TORSO, z);
    const bump = (th: number) => {
      const a = ab(th);
      let b = gauss(a, Math.PI, 0.18) * 0.05;                      // spine
      b += gauss(z, 0.24, 0.06) * gauss(a, 2.4, 0.3) * 0.1;        // withers / shoulder blades
      b += gauss(z, -0.36, 0.05) * gauss(a, 2.2, 0.3) * 0.12;      // haunch
      b += gauss(z, 0.05, 0.12) * gauss(a, 1.3, 0.4) * Math.cos(z * 120) * 0.03; // faint ribs
      return b;
    };
    rings.push({ pts: bodyRing(z, r.cy, r.rx, r.up, r.dn, n, 2, bump), v: 0.03 + 0.94 * (k / 16), col: (j) => 0.74 + 0.26 * clamp01(ab((j / (n - 1)) * Math.PI * 2) / 2.2) });
  }
  ob.loft(rings, reg, { start: 'pole', startBulge: 0.01, end: 'pole', endBulge: 0.01 });
  // white flag of a tail
  ob.tube([[0, 0.06, -0.44], [0, 0.04, -0.52], [0, -0.02, -0.57]], [[0.035, 0.03], [0.04, 0.035], [0.012, 0.012]], 6, PG.reg('TAIL'), { up: [0, 1, 0], end: 'pole', endBulge: 0.01 });
}

function neckGeo(ob: OB) {
  // long, arched: rises steeply then curves forward under the head
  const path: V3[] = [[0, -0.06, -0.1], [0, 0.0, 0.0], [0, 0.22, 0.06], [0, 0.45, 0.1], [0, 0.66, 0.11], [0, 0.8, 0.09], [0, NECK_LEN, 0.06]];
  const rad: [number, number][] = [[0.1, 0.085], [0.09, 0.075], [0.07, 0.058], [0.058, 0.05], [0.052, 0.046], [0.05, 0.045], [0.05, 0.045]];
  ob.tube(path, rad, 11, PG.reg('NECK'), {
    up: [0, 0, 1], th0: Math.PI, end: 'cut', cut: PG.reg('CUT'), start: 'pole', startBulge: 0.03,
    // the throat (front) has a ridge of windpipe, the crest a mane line
    bump: (i, th) => Math.max(0, Math.cos(th)) ** 4 * 0.12 * (i > 1 && i < 5 ? 1 : 0.4),
    col: (i, th) => 0.82 + 0.18 * -Math.cos(th),
  });
}

function headGeo(ob: OB) {
  const P = PG;
  // neck stub with a cut face (shows when the head comes off)
  ob.tube([[0, -0.01, -0.01], [0, -0.07, -0.04], [0, -0.12, -0.05]], [0.046, 0.046, 0.046], 9, P.reg('NECK'), { up: [0, 0, 1], end: 'cut', cut: P.reg('CUT'), vs: [0.05, 0.03, 0.01] });
  // long narrow deer skull, no eyes: smooth domed brow
  const rows: Row[] = [
    { z: -0.07, cy: 0.02, rx: 0.03, up: 0.03, dn: 0.03 },
    { z: -0.05, cy: 0.025, rx: 0.058, up: 0.055, dn: 0.05 },
    { z: 0.0, cy: 0.03, rx: 0.066, up: 0.06, dn: 0.055 },
    { z: 0.06, cy: 0.02, rx: 0.058, up: 0.05, dn: 0.05 },
    { z: 0.13, cy: 0.0, rx: 0.042, up: 0.038, dn: 0.045 },
    { z: 0.2, cy: -0.012, rx: 0.034, up: 0.032, dn: 0.038 },
    { z: 0.26, cy: -0.02, rx: 0.03, up: 0.028, dn: 0.032 },
    { z: 0.29, cy: -0.025, rx: 0.026, up: 0.024, dn: 0.028 },
  ];
  const n = 13;
  const rings: LoftRing[] = [];
  for (let k = 0; k <= 10; k++) {
    const z = lerp(rows[0].z, rows[rows.length - 1].z, k / 10);
    const r = sampleRows(rows, z);
    // shallow pits where eyes should be
    const bump = (th: number) => -gauss(z, 0.04, 0.02) * gauss(ab(th), 1.9, 0.22) * 0.1 + gauss(z, 0.12, 0.03) * gauss(ab(th), 1.1, 0.3) * 0.08;
    rings.push({ pts: bodyRing(z, r.cy, r.rx, r.up, r.dn, n, 2.1, bump), v: 0.04 + 0.92 * (k / 10), col: (j) => 0.78 + 0.22 * clamp01(ab((j / (n - 1)) * Math.PI * 2) / 2.2) });
  }
  ob.loft(rings, P.reg('HEAD'), { start: 'pole', end: 'pole', endBulge: 0.01 });
  // pale muzzle pad and the single nostril slit
  ob.blob([0, -0.02, 0.288], [0.028, 0.026, 0.016], 7, 4, P.reg('MUZ'));
  // one huge flat ear lying across the top of the head
  const E = P.reg('EAR');
  const ew = 0.38, ed = 0.12;
  const cols = 6;
  const top: V3[] = [], bot: V3[] = [];
  for (let c = 0; c <= cols; c++) {
    const u = c / cols - 0.5;
    const x = u * ew, droop = -Math.pow(Math.abs(u) * 2, 2) * 0.05, w = ed * (1 - Math.pow(Math.abs(u) * 2, 3) * 0.6);
    top.push([x, 0.085 + droop + Math.abs(u) * 0.02, 0.0 + w * 0.5]);
    bot.push([x, 0.085 + droop + 0.012 - Math.abs(u) * 0.01, 0.0 - w * 0.5]);
  }
  ob.strip(top, bot, E, { double: true });
  // its root: a fleshy ridge where it joins the skull
  ob.blob([0, 0.075, 0.0], [0.04, 0.018, 0.03], 7, 3, P.reg('HEAD'), { u0: 0.4, u1: 0.6, v0: 0.2, v1: 0.3 });
}

/** a long knobbly leg segment along -y with knuckled joints; `knobs` are fractions along the length */
function stilt(ob: OB, len: number, r0: number, r1: number, knobs: [number, number][], reg: string, cut: boolean, bend: (f: number) => number, inward = 0) {
  const pts: V3[] = [], rad: number[] = [];
  const N = 9;
  for (let i = 0; i <= N; i++) {
    const f = i / N;
    let r = lerp(r0, r1, f);
    for (const [kf, ks] of knobs) r += gauss(f, kf, 0.035) * ks;
    pts.push([inward * (1 - f) * (1 - f), -f * len + (i === 0 ? 0.05 : 0), bend(f)]);
    rad.push(r);
  }
  ob.tube(pts, rad, 7, PG.reg(reg), { start: cut ? 'cut' : 'pole', cut: PG.reg('CUT'), end: 'pole', endBulge: r1 * 0.8, startBulge: 0.01 });
}
function hoof(ob: OB, y: number) {
  const H = PG.reg('HOOF');
  ob.cone([0, y + 0.07, 0.0], [0, -1, 0.25], 0.03, 0.08, 6, H);
  ob.blob([0, y + 0.03, 0.012], [0.026, 0.03, 0.034], 6, 3, H);
}
function frontUpperGeo(ob: OB, side: number) {
  ob.push();
  // shoulder mass inside the body, then the long upper bone
  ob.tube([[-side * 0.04, 0.09, 0.0], [-side * 0.01, 0.0, 0.0], [0, -0.14, -0.02]], [[0.035, 0.03], [0.06, 0.05], [0.04, 0.034]], 8, PG.reg('LEG_U'), { start: 'cut', cut: PG.reg('CUT'), vs: [1, 0.95, 0.85] });
  stilt(ob, FL1, 0.034, 0.024, [[0.97, 0.022]], 'LEG_U', false, (f) => -Math.sin(f * Math.PI) * 0.03);
  ob.pop();
}
function frontLowerGeo(ob: OB) {
  // forearm, a knuckled knee, cannon, fetlock knob, pastern
  stilt(ob, FL2 - 0.06, 0.026, 0.016, [[0.02, 0.014], [0.5, 0.016], [0.94, 0.014]], 'LEG_L', false, (f) => Math.sin(f * Math.PI) * 0.015 + f * 0.02);
  hoof(ob, -FL2);
}
function hindUpperGeo(ob: OB, side: number) {
  ob.tube([[-side * 0.045, 0.09, 0.0], [-side * 0.012, 0.0, 0.0], [0, -0.16, 0.03]], [[0.04, 0.035], [0.075, 0.06], [0.045, 0.04]], 8, PG.reg('LEG_U'), { start: 'cut', cut: PG.reg('CUT'), vs: [1, 0.95, 0.85] });
  stilt(ob, HL1, 0.036, 0.024, [[0.97, 0.024]], 'LEG_U', false, (f) => Math.sin(f * Math.PI) * 0.04);
}
function hindLowerGeo(ob: OB) {
  // long shank back to a pointed hock, then the cannon forward to the hoof
  const pts: V3[] = [], rad: number[] = [];
  const hockF = 0.45;
  for (let i = 0; i <= 12; i++) {
    const f = i / 12;
    const z = f < hockF ? -Math.sin((f / hockF) * Math.PI * 0.5) * 0.11 : -0.11 + ((f - hockF) / (1 - hockF)) * 0.12;
    pts.push([0, -f * (HL2 - 0.06) + (i === 0 ? 0.04 : 0), z]);
    rad.push(lerp(0.028, 0.016, f) + gauss(f, hockF, 0.035) * 0.02 + gauss(f, 0.94, 0.03) * 0.012 + gauss(f, 0.02, 0.03) * 0.012);
  }
  ob.tube(pts, rad, 7, PG.reg('LEG_L'), { start: 'pole', end: 'pole', endBulge: 0.012, bump: (i, th) => (Math.abs(i / 12 - hockF) < 0.05 ? Math.max(0, -Math.cos(th)) * 0.8 : 0) });
  hoof(ob, -HL2);
}

function buildDoe(): Rig {
  const rig = newRig(3.2);
  const torso = bpart(rig, 'torso', rig.body, [0, TY, 0], PG, 'torso', torsoGeo);
  const neck = bpart(rig, 'neck', torso, NECK_AT, PG, 'neck', neckGeo);
  bpart(rig, 'head', neck, [0, NECK_LEN, 0.05], PG, 'head', headGeo);
  const legs: [string, number, V3, boolean][] = [['0', 1, SHOULDER, true], ['1', -1, SHOULDER, true], ['2', 1, HIP, false], ['3', -1, HIP, false]];
  for (const [i, sd, at, front] of legs) {
    const up = bpart(rig, 'leg' + i, torso, [at[0] * sd, at[1], at[2]], PG, (front ? 'fUp' : 'hUp') + sd, (ob) => (front ? frontUpperGeo(ob, sd) : hindUpperGeo(ob, sd)));
    bpart(rig, 'shin' + i, up, [0, -(front ? FL1 : HL1), 0], PG, front ? 'fLo' : 'hLo', (ob) => (front ? frontLowerGeo(ob) : hindLowerGeo(ob)));
  }
  rig.headY = 3.2;
  poseLegs(rig, specs(), gaitState({}), WALK, 0, 0.016, { freeze: true });
  neck.rotation.x = -0.15;
  return rig;
}

// ---------------------------------------------------------------- animation
const WALK: GaitParams = { duty: 0.76, f0: 0.42, fk: 0.22, maxStride: 1.25, lift: 0.3 };
const RUN: GaitParams = { duty: 0.36, f0: 1.1, fk: 0.12, maxStride: 3.6, lift: 0.55 };
const WALK_PH = [0.25, 0.75, 0.0, 0.5];
const RUN_PH = [0.55, 0.65, 0.0, 0.12];
function specs(): LegSpec[] {
  return [0, 1, 2, 3].map((i) => {
    const front = i < 2;
    return { up: 'leg' + i, lo: 'shin' + i, L1: front ? FL1 : HL1, L2: front ? FL2 : HL2, bend: front ? -1 : 1, ph: WALK_PH[i], restX: 0.03, restZ: front ? 0.05 : -0.04, front, side: (i % 2 === 0 ? 1 : -1) as 1 | -1 };
  });
}
const _look = [0, 0];
const _lame = [false, false, false, false];

function animateDoe(rig: Rig, c: Creature, t: number, dt: number) {
  const P = rig.parts;
  const m = animMem(rig, c);
  tickEvents(m, c, dt);
  applyLook(rig, c, PG, 0.05);
  const gs = gaitState(rig.root.userData);
  trackMotion(gs, c, dt);
  const seed = hash01(c.id, 2);
  const st = c.state, spd = gs.spd;
  const legs: LegSpec[] = m.legs || (m.legs = specs());
  const run = spd > 2.4 ? 1 : 0;
  m.run = lerp(m.run ?? 0, run, damp(4, dt));
  for (let i = 0; i < 4; i++) {
    let d = (run ? RUN_PH : WALK_PH)[i] - legs[i].ph; d -= Math.round(d);
    legs[i].ph = (legs[i].ph + d * damp(4, dt) + 1) % 1;
  }
  let lameN = 0, lameSide = 0;
  for (let i = 0; i < 4; i++) { _lame[i] = partGone(rig, c, 'leg' + i) || partGone(rig, c, 'shin' + i); if (_lame[i]) { lameN++; lameSide += legs[i].side; } }
  // grazing: the doe splays its legs like a spider to lower itself to the grass
  const graze = st === 'graze' && !c.dead ? 1 : 0;
  m.graze = lerp(m.graze ?? 0, graze, damp(1.2, dt));
  const g = smooth(m.graze);
  // a kick: rear back, front legs up, strike down
  const at = m.atk;
  let rear = 0, strike = 0;
  if (at < 1.2) {
    if (at < 0.3) rear = smooth(at / 0.3);
    else if (at < 0.45) { rear = 1 - smooth((at - 0.3) / 0.15); strike = smooth((at - 0.3) / 0.15); }
    else strike = 1 - smooth((at - 0.45) / 0.75);
  }
  const body = rig.body, torso = P.torso;
  const ph2 = gs.ph * Math.PI * 2, w = gs.w;
  const fl = m.flinch / 0.35;
  const sink = g * 1.05 + (lameN >= 2 ? 1.2 : lameN ? 0.25 : 0) + rear * -0.15;
  body.position.set(Math.sin(t * 50) * 0.02 * fl, -sink + (run ? Math.abs(Math.sin(ph2)) * 0.12 : Math.cos(ph2 * 2) * 0.02) * w, 0);
  body.rotation.set(0, 0, 0);
  torso.rotation.set(-rear * 0.55 + strike * 0.12 + (run ? Math.sin(ph2 + 0.5) * 0.08 * w : 0) + g * 0.1, Math.sin(ph2) * 0.03 * w, Math.sin(ph2) * 0.04 * w * (1 - m.run) + lameSide * 0.15);
  const tm = meshOf(torso);
  if (tm) { const b = Math.sin(t * (run ? 4.5 : 1.9) + seed * 5) * 0.015; tm.scale.set(1 + b, 1 + b * 0.7, 1); }
  if (c.dead) {
    const k = smooth(m.dead / 0.9);
    for (let i = 0; i < 4; i++) {
      const up = P['leg' + i], lo = P['shin' + i];
      up.rotation.set(lerp(up.rotation.x, i < 2 ? -0.35 : 0.5, k), 0, lerp(up.rotation.z, 0, k));
      lo.rotation.set(lerp(lo.rotation.x, i < 2 ? 0.25 : -0.4, k), 0, 0);
    }
  } else {
    // grazing: knees turn outward and the body sinks between them like a spider's
    for (const L of legs) L.yaw = (L.front ? -L.side : L.side) * g * 1.25;
    poseLegs(rig, legs, gs, run ? RUN : WALK, spd, dt, { lame: _lame, spread: 1 + g * 6, liftMul: st === 'stalk' ? 1.4 : 1 });
    if (rear > 0.01 || strike > 0.01) {
      // front legs pawing the air, then stabbing down
      for (const i of [0, 1]) {
        const s = i === 0 ? 0 : 0.6;
        P['leg' + i].rotation.x += -rear * (1.1 + s * 0.3) - strike * 0.5 * Math.sin(at * 14 + s);
        P['shin' + i].rotation.x += rear * 1.4;
      }
    }
  }
  // ---------------- neck & head
  const neck = P.neck, head = P.head;
  const tracking = lookAtTarget(rig, c, (G as any)?.players, _look) && (st === 'flee' || st === 'warn' || st === 'idle' || st === 'watch');
  m.look = lerp(m.look, tracking ? clamp(_look[0], -1.2, 1.2) : 0, damp(2, dt));
  const alert = st === 'flee' || st === 'warn' || c.lastHeard && st === 'idle' ? 1 : 0;
  m.alert = lerp(m.alert ?? 0, alert, damp(3, dt));
  // neck: graze folds it right down; alert holds it bolt upright
  neck.rotation.set(-0.15 + g * 2.0 - m.alert * 0.2 + rear * 0.4 + (st === 'idle' ? Math.sin(t * 0.4 + seed * 4) * 0.08 : 0) + m.run * 0.55, m.look * 0.5, 0);
  // when watched it slowly turns its eyeless face all the way round
  const watched = c.observed && (st === 'idle' || st === 'graze') && !c.dead;
  m.turn = lerp(m.turn ?? 0, watched ? Math.sin(t * 0.25 + seed * 6) * 2.9 : 0, damp(watched ? 0.6 : 2, dt));
  const chew = graze ? Math.sin(t * 7) * 0.05 : 0;
  head.rotation.set(-0.2 + g * 0.9 + chew - m.run * 0.3 + (c.dead ? 0.5 : 0), m.turn + m.look * 0.5, (st === 'idle' ? Math.sin(t * 0.7) * 0.1 : 0) + Math.sin(m.turn) * 0.2);
}

PG.paint((Pt, v) => {
  const rng = Pt.rng;
  const bases = [0xa07a52, 0x8a6e54, 0xb08a5e];
  const HD = ramp(bases[v % 3], 14, 0x1a1014, 0.5);
  const WH = ramp(0xd8ccb8, 10, 0x4a4038, 0.5);
  const LG = ramp(mixHex(bases[v % 3], 0x5a5048, 0.55), 12, 0x141012, 0.45);
  const M = 7;
  // ---------------- torso: warm hide, darker spine stripe, white belly, fawn spots that never faded
  {
    const r = Pt.R('TORSO');
    const aOf = (x: number) => ab(((x + 0.5) / r.w) * Math.PI * 2);
    const Lh = fillLv(Pt, r, HD, (u, vv, x, y) => M + (aOf(x) / Math.PI - 0.55) * 2 + (Pt.n(r, x, y, 3, 2, 1) - 0.5) * 0.9 - gauss(aOf(x), Math.PI, 0.25) * 1.6);
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
      const a = aOf(x);
      if (a < 0.95 + (Pt.n(r, x, y, 3, 1, 2) - 0.5) * 0.4) Pt.put(r, x, y, WH, 5.5 + a * 1.2, 0.2);
    }
    Pt.strokes(r, HD, Lh.get, { density: 0.25, flow: (x) => [((x + 0.5) / r.w < 0.5 ? -0.5 : 0.5), 1], len: [2, 3], dark: 1.2, light: 0.9, mask: (x) => aOf(x) > 1.0, salt: 3 });
    // spots in two broken rows either side of the spine
    for (const sd of [1, -1]) for (let k = 0; k < 9; k++) {
      const vv = 0.15 + k * 0.085 + rng.float(-0.02, 0.02);
      const a = 2.45 + (k % 2) * 0.28 + rng.float(-0.06, 0.06);
      const x = uOf(a, sd) * r.w, y = (1 - vv) * r.h;
      Pt.spot(r, x, y, 1.4, 1.1, WH[8], 1, true); Pt.set(r, x + 1, y + 1, WH[5]);
    }
    // ribs faintly, a scar, ticks
    for (let i = 0; i < 6; i++) { const sd = rng.chance(0.5) ? 1 : -1; Pt.spot(r, uOf(rng.float(1.2, 2.4), sd) * r.w, rng.int(4, r.h - 4), 0.8, 0.8, 0x2a1a14, 1, true); }
  }
  // ---------------- neck (u 0.5 = throat front: windpipe ridge, pale)
  {
    const r = Pt.R('NECK');
    const fr = (x: number) => -Math.cos(((x + 0.5) / r.w) * Math.PI * 2); // +1 throat, -1 crest
    const Ln = fillLv(Pt, r, HD, (u, vv, x, y) => M - fr(x) * 0.9 + (Pt.n(r, x, y, 2, 2, 5) - 0.5) * 0.8 - (1 - vv) * 0.3);
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) if (fr(x) > 0.55) Pt.put(r, x, y, WH, 5 + fr(x), 0.2);
    for (let y = 1; y < r.h; y += 4) for (let x = 0; x < r.w; x++) if (fr(x) > 0.75) Pt.blend(r, x, y, WH[2], 0.35); // windpipe rings
    Pt.strokes(r, HD, Ln.get, { density: 0.3, flow: () => [0, 1], len: [2, 4], dark: 1.3, light: 0.9, mask: (x) => fr(x) < 0.5, salt: 4 });
    for (let y = 0; y < r.h; y++) { const x = Math.floor(r.w * 0.0); Pt.set(r, x, y, HD[3]); } // mane line
  }
  // ---------------- head: no eyes. smooth domed skin where they should be
  {
    const r = Pt.R('HEAD');
    const aOf = (x: number) => ab(((x + 0.5) / r.w) * Math.PI * 2);
    fillLv(Pt, r, HD, (u, vv, x, y) => M + (aOf(x) / Math.PI - 0.5) * 1.8 + (Pt.n(r, x, y, 2, 2, 7) - 0.5) * 0.7 - vv * 0.6);
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) { const vv = 1 - (y + 0.5) / r.h; if (vv > 0.72 || aOf(x) < 0.7) Pt.put(r, x, y, WH, 4.5 + vv * 2, 0.25); }
    // where the eyes should be: a faint pale ring, and a crease of skin grown over
    for (const sd of [1, -1]) {
      const x = uOf(1.9, sd) * r.w, y = (1 - 0.38) * r.h;
      Pt.spot(r, x, y, 2.4, 1.8, HD[10], 0.6);
      Pt.spot(r, x, y, 1.6, 1.0, HD[5], 0.8);
      for (let k = -2; k <= 2; k++) Pt.set(r, x + k, y + (Math.abs(k) === 2 ? 0 : 0), HD[3]);
    }
    // dark forehead blaze
    for (let y = 0; y < r.h * 0.5; y++) for (let k = -2; k <= 1; k++) Pt.blend(r, r.w / 2 + k, y, HD[3], 0.6);
  }
  // ---------------- muzzle: pale, one nostril slit across it
  {
    const r = Pt.R('MUZ');
    fillLv(Pt, r, WH, (u, vv) => 6 - Math.abs(vv - 0.5) * 3);
    for (let x = 1; x < r.w - 1; x++) { Pt.set(r, x, Math.floor(r.h / 2), 0x1a100c); Pt.set(r, x, Math.floor(r.h / 2) + 1, WH[2]); }
  }
  // ---------------- the ear: tan rim, pale veined inside
  {
    const r = Pt.R('EAR');
    fillLv(Pt, r, HD, (u, vv, x, y) => M + 0.5 + (Pt.n(r, x, y, 3, 2, 9) - 0.5) * 0.8 - Math.abs(u - 0.5) * 1.2);
    for (let y = 2; y < r.h - 2; y++) for (let x = 3; x < r.w - 3; x++) Pt.put(r, x, y, ramp(0xc4a090, 8, 0x3a2420, 0.5), 4.6 + (Pt.n(r, x, y, 2, 2, 11) - 0.5), 0.2);
    for (let i = 0; i < 6; i++) Pt.walk(r, rng.int(4, r.w - 4), r.h / 2, rng.int(5, 12), rng.chance(0.5) ? 1 : -1, rng.float(-0.4, 0.4), 0x8a4a52, 0.5, 0.4, 0.2);
    for (let x = 0; x < r.w; x++) { Pt.set(r, x, 0, WH[7]); Pt.set(r, x, r.h - 1, WH[7]); }
  }
  // ---------------- legs: grey-brown, knobbly pale joints, dark creases
  const leg = (name: string, knobs: number[]) => {
    const r = Pt.R(name);
    const fr = (x: number) => -Math.cos(((x + 0.5) / r.w) * Math.PI * 2);
    fillLv(Pt, r, LG, (u, vv, x, y) => {
      let l = 6 + fr(x) * 0.8 + (Pt.n(r, x, y, 2, 2, 13) - 0.5) * 0.7;
      for (const k of knobs) l += gauss(vv, k, 0.012) * 2.2 - gauss(vv, k - 0.025, 0.008) * 2 - gauss(vv, k + 0.025, 0.008) * 1.5;
      return l;
    });
    // a darker line down the back of each leg (tendon groove)
    for (let y = 0; y < r.h; y++) Pt.set(r, 0, y, LG[3]);
  };
  leg('LEG_U', [0.98, 0.1]);
  leg('LEG_L', [0.98, 0.5, 0.06]);
  {
    const r = Pt.R('HOOF');
    fillLv(Pt, r, ramp(0x2a2420, 8, 0x080606, 0.4), (u, vv) => 3 + vv * 2);
    for (let x = 0; x < r.w; x += 3) Pt.set(r, x, 1, 0x5a5048);
  }
  {
    const r = Pt.R('TAIL');
    fillLv(Pt, r, WH, (u, vv) => 6 + vv * 2);
    for (let x = 0; x < r.w; x++) Pt.set(r, x, 0, HD[5]);
  }
  Pt.cut(Pt.R('CUT'), HD[6], { meat: 0x8a2020, fat: 0xd8c0a0 });
  void scaleHex; void ph;
});

const S = def({
  key: 'stilt_doe', name: 'Stilt Doe', code: 'E-04 // CERVID-TALL', temperament: 'skittish', threat: 1,
  rule: { name: 'SPOOKS AT RUNNING', text: 'Running footsteps send it bounding off. Sneak up for the meat, but corner it and it kicks.' },
  hp: 40, walk: 1.1, run: 7.5, turn: 3, radius: 0.45, height: 3.3, sight: 26, fov: 2.6, hearing: 1.6,
  attack: { dmg: [10, 18], range: 1.4, cooldown: 2.2, kinds: ['fracture', 'laceration'], corrupt: 0, knock: 1.2, parts: ['torso_u', 'head', 'uarm_l', 'uarm_r'] },
  zones: ['fields', 'suburbs', 'parking'], weight: 4, group: [1, 3], maxPerZone: 9, diet: 'grass',
  meat: [['venison_raw', 4]],
  sounds: { idle: 'doe_click', alert: 'doe_shriek', hurt: 'doe_shriek', death: 'doe_death', step: 'hoof' },
  scan: { cls: 'Grazer / skittish', notes: ['Legs over two metres long. It ducks under door frames.', 'Grazes the artificial grass. Flees from running footsteps.', 'Kicks hard if cornered.', 'Edible. Tastes faintly of static.'] },
  gore: { blood: 'red', sever: ['leg0', 'leg1', 'leg2', 'leg3', 'shin0', 'shin1', 'shin2', 'shin3'], head: 'head' },
  build: buildDoe,
  animate: animateDoe,
});
(S as any).handlesSevered = true;
S.animateGallery = galleryDriver('stilt_doe', ['walk', 'graze', 'run', 'idle', 'attack', 'watched', 'dead'], animateDoe, (pose, fc, t) => {
  fc.state = pose === 'walk' ? 'wander' : pose === 'run' ? 'flee' : pose === 'graze' ? 'graze' : pose === 'attack' ? 'attack' : pose === 'dead' ? 'dead' : 'idle';
  fc.speed = pose === 'walk' ? 1.1 : pose === 'run' ? 7 : 0;
  fc.dead = pose === 'dead';
  fc.observed = pose === 'watched';
  fc.attackPhase = pose === 'attack' && (t % 2) < 0.38 ? 0.2 : 0;
});
