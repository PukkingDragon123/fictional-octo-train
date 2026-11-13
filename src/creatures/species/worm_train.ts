// THE WORM TRAIN — and its eggs and larvae (round 16, Westgate Station, src/world/gen/z_subway.ts).
//
// WORM TRAIN: a segmented animal sixteen metres long that has grown into the
// shape of the thing it lives among. Six car-segments of horn plate over pale
// flesh, fluted like stainless steel and striped teal and orange where the old
// stock was; fleshy concertina gangways between them; a cab-shaped head with a
// headlamp that is an eye and a mouth that splits down the middle like cab
// doors; dead window-eyes all down both flanks, lit like a carriage at night;
// pantograph spines folded on its back. It walks on twenty-four long jointed
// legs, spider fashion, the steps rippling down each side in waves, along the
// tracks, up the tunnel walls and upside down along the ceilings, every
// segment following exactly where the head went (src/creatures/kit/crawler.ts).
// It runs the Inner Loop (z.meta.subway.line) like a service: in through the
// tunnel mouth with its lamp lit and the rails singing, braking into the
// station with a scream, dwelling at Platform 2 with its eyes lit, and away.
// Between laps it climbs into a tunnel roof and waits. What is on the track or
// at the platform edge it takes; what runs out onto the track bed it hunts.
// It does not leave the tracks and the platforms.
//
// WORM EGG: a translucent sac as big as a man, laid in the track pits, lit
// inside, pulsing, with a curled larva in it. It hatches if it is disturbed,
// or in its own time. Cut open first, it is jelly and a specimen.
//
// WORM LARVA: three soft cars long, the size of a dog. Hungry, quick, and it
// runs up walls.
//
// POSTER / VIDEO API (stand-alone):
//   buildWormTrain(larva?) -> Rig ; poseWormTrain(rig, t, dt, pose)  pose: 'walk' | 'run' | 'climb' | 'ceiling' | 'attack' | 'idle'
import * as THREE from 'three';
import { def, newRig, Rig } from '../species';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import type { Creature } from '../creature';
import type { Player } from '../../entities/player';
import type { Zone } from '../../world/zone';
import { Page, OB, V3, Reg, bpart, registerPage, applyLook, bodyRing, ramp, clamp01, lerp, damp, hash01 } from '../kit/beasts';
import { tpart, surfaceMat, filmMat, hitPlayer, eye } from '../kit/oddkit';
import { Trail, newFrame, trailFrame, placeOnFrame, toRoot, updateLegs, legNeighbours, newLegState, type Frame, type LegDef, type LegState } from '../kit/crawler';
import { net, netOf, playersIn, dist, hashId, rng, fx, fxPoll, playAt, localIn, thinkOnce } from '../behaviors_b';
import { CS, pulse, attack, onPlayerHit, onKilled } from '../behaviors_a';
import { ruleShown } from '../rules';
import { mixHex } from '../../gfx/pixel';

// =====================================================================================
// texture page
// =====================================================================================
const PG = registerPage(new Page('c_wtrain', 192, 128, [
  ['SHELL', 64, 48], ['FLESH', 32, 32], ['WIN', 16, 16], ['LAMP', 16, 16], ['RED', 8, 8], ['LEG', 16, 32], ['CLAW', 8, 8],
  ['SPINE', 8, 16], ['TOOTH', 8, 8], ['MOUTH', 16, 16], ['CUT', 16, 16], ['SAC', 48, 32], ['YOLK', 16, 16], ['BLIND', 32, 8],
], 2));
const TEAL = 0x2f8a86, ORANGE = 0xe07a2a;
PG.paint((P, v) => {
  // the car shell: belly (u ~0/1) flesh-grey ribs, sides fluted horn with the stripes and plate seams, roof dark with vents
  {
    const r = P.R('SHELL');
    const S = ramp(v ? 0xa8aca4 : 0xb4b2a8, 7, 0x3a3c38, 0.35), Fl = ramp(0xb08a84, 6, 0x4a2a2a, 0.3), Rf = ramp(0x5a5e58, 6, 0x1a1c1a, 0.25);
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
      const u = (x + 0.5) / r.w, vv = 1 - (y + 0.5) / r.h;
      const ab = Math.min(u, 1 - u) * 2; // 0 belly .. 1 roof
      const n = P.n(r, x, y, 3, 2, 31 + v);
      let c: number;
      if (ab < 0.22) c = Fl[Math.max(0, Math.min(5, Math.round(2 + n * 2 - (y % 4 === 0 ? 1.5 : 0))))];
      else if (ab > 0.8) c = Rf[Math.max(0, Math.min(5, Math.round(2.5 + n * 1.6 - ((x + y) % 7 === 0 ? 1 : 0))))];
      else {
        const flute = (x % 3 === 0) ? -1.2 : (x % 3 === 1) ? 0.8 : 0;
        c = S[Math.max(0, Math.min(6, Math.round(3.2 + flute + (n - 0.5) * 1.8)))];
        // the stripes: teal over orange over teal, low on the sides
        const sb = ab - 0.36;
        if (Math.abs(sb) < 0.035) c = mixHex(TEAL, c, 0.15);
        else if (Math.abs(sb - 0.06) < 0.02) c = mixHex(ORANGE, c, 0.2);
        // grime runs down from the roof
        if (P.n(r, x, 0, 6, 1, 33) > 0.6 && ab > 0.55) c = mixHex(c, 0x2a2620, 0.35);
      }
      // plate seams across the car, rivets along them
      if (y % 12 === 0) c = mixHex(c, 0x1a1816, 0.6);
      if (y % 12 === 1 && x % 4 === 0 && ab > 0.22) c = mixHex(c, 0xffffff, 0.4);
      void vv;
      P.set(r, x, y, c);
    }
  }
  // flesh: wet pink-grey, ribs, veins
  {
    const r = P.R('FLESH');
    const R = ramp(0xc08a84, 7, 0x4a1a20, 0.4);
    P.fill(r, R, (u, vv, x, y) => 3 + Math.sin(y * 1.2) * 1.2 + (P.n(r, x, y, 3, 2, 41) - 0.5) * 2, 0.5);
    for (let i = 0; i < 6; i++) P.walk(r, P.rng.int(0, r.w - 1), P.rng.int(0, r.h - 1), 14, 0, 1, 0x6a2a3a, 0.6, 0.5, 0.2);
    for (let y = 2; y < r.h; y += 7) P.glint(r, (y * 5) % r.w, y, 3, 0xffe8e0, 0.5);
  }
  // a dead window-eye: smoked glass over a clouded iris, carriage-light warm behind
  {
    const r = P.R('WIN');
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
      const dx = (x + 0.5 - r.w / 2) / (r.w / 2), dy = (y + 0.5 - r.h / 2) / (r.h / 2), d = Math.hypot(dx, dy);
      let c = mixHex(0xe8c880, 0x8a6a40, Math.min(1, d));
      if (d < 0.55) c = mixHex(0xd8d8c8, 0x8a9a94, d * 1.4);
      if (d < 0.2) c = 0x9aa8a0;
      if (d > 0.9) c = 0x2a2a26;
      P.set(r, x, y, c);
    }
    P.spot(r, 4, 4, 1.5, 1, 0xffffff, 0.8);
  }
  // the headlamp eye
  {
    const r = P.R('LAMP');
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
      const d = Math.hypot(x + 0.5 - r.w / 2, y + 0.5 - r.h / 2) / (r.w / 2);
      P.set(r, x, y, d < 0.35 ? 0xffffff : d < 0.7 ? 0xfff0b0 : d < 0.9 ? 0xe8b050 : 0x5a4a30);
    }
  }
  eye(P, P.R('RED'), 0xe02818, { pupil: 0x8a0808, sclera: 0x5a1010 });
  // leg chitin: black-green with a teal sheen, pale at the joints (top rows)
  {
    const r = P.R('LEG');
    const R = ramp(0x2a3430, 6, 0x0a0c0c, 0.35);
    P.fill(r, R, (u, vv, x, y) => 1.8 + Math.cos(u * Math.PI * 2) * 1.2 + (y % 8 === 0 ? 1.6 : 0) + (P.n(r, x, y, 2, 2, 51) - 0.5), 0.4);
    for (let y = 3; y < r.h; y += 8) P.glint(r, 3, y, 4, 0x6ad0c0, 0.35);
  }
  {
    const r = P.R('CLAW'); P.fill(r, ramp(0x1a1814, 5, 0x000000, 0.3), (u, vv) => 1 + vv * 2.5, 0.3);
  }
  {
    const r = P.R('SPINE'); P.fill(r, ramp(0x3a3a36, 5, 0x0a0a0a, 0.3), (u, vv, x, y) => 1.5 + (y % 4 === 0 ? 1.5 : 0) + Math.cos(u * 6.28) * 0.8, 0.3);
    P.spot(r, r.w / 2, 1, 2, 1, 0x80c0ff, 0.9);
  }
  { const r = P.R('TOOTH'); P.fill(r, ramp(0xe8dcc0, 5, 0x6a5a40, 0.3), (u, vv) => 1 + vv * 3, 0.3); }
  { const r = P.R('MOUTH'); P.fill(r, ramp(0x8a2a3a, 6, 0x1a0408, 0.3), (u, vv, x, y) => 1.5 + vv * 2 + Math.sin(x * 1.3) * 0.6, 0.5); }
  P.cut(P.R('CUT'), 0xb4b2a8, { meat: 0xb05a5a, bone: 0xd8d0b0 });
  // the egg sac: amber film with veins, brighter where it stretches
  {
    const r = P.R('SAC');
    const R = ramp(0xe8c070, 6, 0x6a4a20, 0.5);
    P.fill(r, R, (u, vv, x, y) => 3 + Math.sin(u * 18 + Math.sin(vv * 7) * 2) * 0.6 + (P.n(r, x, y, 3, 2, 61) - 0.5) * 1.5, 0.4);
    for (let i = 0; i < 9; i++) P.walk(r, P.rng.int(0, r.w - 1), P.rng.int(0, r.h - 1), 22, 0, 1, 0x8a3a2a, 0.75, 0.55, 0.3);
  }
  { const r = P.R('YOLK'); P.fill(r, ramp(0xf0d890, 5, 0x8a6a30, 0.5), (u, vv, x, y) => 2.5 + (P.n(r, x, y, 2, 2, 71) - 0.5) * 2, 0.4); }
  // the destination blind over the cab: a lit strip, letters long since gone
  {
    const r = P.R('BLIND');
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) P.set(r, x, y, y === 0 || y === r.h - 1 ? 0x1a1a1a : (x > 3 && x < r.w - 4 && y > 2 && y < 5 && (x % 4) < 3 && P.n(r, x, y, 2, 1, 81) > 0.45) ? 0x1a1a1a : 0xfff0c8);
  }
});

// =====================================================================================
// the body plan
// =====================================================================================
/** car-segment body: length, half width, height above / below the axis */
const SEG_L = 2.5, SP = 2.62, RX = 0.84, UP = 0.78, DN = 0.66;
const NSEG = 6, RIDE = 1.2;
const LEG_L1 = 1.35, LEG_L2 = 1.78;
const CEIL_Y = 2.7;

/** a car-segment cross-section ring at z (taper 0..1 toward the ends) */
const carRing = (z: number, k: number, n = 17) => bodyRing(z, 0, RX * k, UP * k, DN * k, n, 3.4);

function carShell(ob: OB, head: boolean, tail: boolean) {
  const S = PG.reg('SHELL'), F = PG.reg('FLESH'), Wn = PG.reg('WIN');
  const zs = [-SEG_L / 2, -SEG_L * 0.42, -SEG_L * 0.25, 0, SEG_L * 0.25, SEG_L * 0.42, SEG_L / 2];
  const ks = [0.9, 0.97, 1, 1, 1, 0.97, 0.9];
  // the shell (front of the car toward +z: v = 1 at the front)
  ob.loft(zs.map((z, i) => ({ pts: carRing(z, ks[i]), v: 1 - i / (zs.length - 1) })), S, {});
  // the concertina gangways: fleshy bellows that reach into the next car
  if (!tail) ob.tube([[0, 0, -SEG_L / 2 + 0.05], [0, 0, -SEG_L / 2 - 0.22], [0, 0, -SEG_L / 2 - 0.42]], [[RX * 0.78, UP * 0.82], [RX * 0.7, UP * 0.74], [RX * 0.66, UP * 0.7]], 13, F, { bump: (i, th) => (i === 1 ? 0.06 : 0) + 0.03 * Math.cos(th * 6), end: 'pole', endBulge: 0.05 });
  if (!head) ob.tube([[0, 0, SEG_L / 2 - 0.05], [0, 0, SEG_L / 2 + 0.2]], [[RX * 0.8, UP * 0.84], [RX * 0.72, UP * 0.76]], 13, F, { end: 'pole', endBulge: 0.08 });
  // dead window-eyes down both flanks, each in a lid of flesh
  for (const sx of [-1, 1]) for (const z of [-0.78, -0.26, 0.26, 0.78]) {
    ob.blob([sx * RX * 0.985, 0.2, z], [0.06, 0.26, 0.21], 8, 6, F, {});
    ob.blob([sx * RX * 1.02, 0.2, z], [0.04, 0.22, 0.17], 8, 6, Wn, { emis: 0.85 });
  }
  // the bogie bosses: knuckled hip sockets low on each side
  for (const sx of [-1, 1]) for (const z of [-0.7, 0.7]) ob.blob([sx * RX * 0.88, -0.36, z], [0.2, 0.2, 0.24], 8, 6, F, {});
  // belly ribs
  for (let i = 0; i < 5; i++) ob.blob([0, -DN * 0.92, -0.9 + i * 0.45], [RX * 0.6, 0.1, 0.12], 10, 4, F, {});
}

function headCap(ob: OB) {
  const S = PG.reg('SHELL'), F = PG.reg('FLESH'), Wn = PG.reg('WIN'), L = PG.reg('LAMP'), Rd = PG.reg('RED'), M = PG.reg('MOUTH'), T = PG.reg('TOOTH'), B = PG.reg('BLIND');
  // the cab: the shell carries on forward and rounds off into a blunt nose
  const zs = [SEG_L / 2 - 0.02, SEG_L / 2 + 0.25, SEG_L / 2 + 0.5, SEG_L / 2 + 0.68];
  const ks = [0.9, 0.86, 0.74, 0.5];
  ob.loft(zs.map((z, i) => ({ pts: carRing(z, ks[i]), v: 1 - i / 3 })), S, { end: 'pole', endBulge: 0.06 });
  // the cab windows: two big dead eyes either side of the lamp
  for (const sx of [-1, 1]) ob.blob([sx * 0.36, 0.3, SEG_L / 2 + 0.56], [0.24, 0.2, 0.08], 8, 6, Wn, { emis: 0.9 });
  // destination blind
  ob.quad([[-0.32, 0.6, SEG_L / 2 + 0.52], [0.32, 0.6, SEG_L / 2 + 0.52], [0.3, 0.72, SEG_L / 2 + 0.44], [-0.3, 0.72, SEG_L / 2 + 0.44]], B, [[0, 0], [1, 0], [1, 1], [0, 1]], { emis: 0.95 });
  // marker lamps low: red eyes
  for (const sx of [-1, 1]) ob.blob([sx * 0.52, -0.32, SEG_L / 2 + 0.5], [0.08, 0.08, 0.06], 7, 5, Rd, { emis: 0.95 });
  // the pilot: a comb of bone prongs at the bottom of the face
  for (let i = -3; i <= 3; i++) ob.cone([i * 0.12, -0.55, SEG_L / 2 + 0.35], [i * 0.08, -0.5, 1], 0.045, 0.42, 5, T);
  // the throat behind the split face
  ob.blob([0, -0.05, SEG_L / 2 + 0.42], [0.42, 0.42, 0.25], 10, 6, M, {});
  void F; void L;
}

function tailCap(ob: OB) {
  const S = PG.reg('SHELL'), Rd = PG.reg('RED'), T = PG.reg('TOOTH');
  const zs = [-SEG_L / 2 + 0.02, -SEG_L / 2 - 0.25, -SEG_L / 2 - 0.48, -SEG_L / 2 - 0.62];
  const ks = [0.9, 0.84, 0.68, 0.4];
  ob.loft(zs.map((z, i) => ({ pts: carRing(z, ks[i]), v: i / 3 })), S, { end: 'pole', endBulge: 0.05 });
  for (const sx of [-1, 1]) ob.blob([sx * 0.4, -0.2, -SEG_L / 2 - 0.5], [0.1, 0.1, 0.06], 7, 5, Rd, { emis: 1 });
  ob.cone([0, -0.35, -SEG_L / 2 - 0.55], [0, -0.3, -1], 0.08, 0.5, 6, T); // the coupler hook
}

/** a jaw half: a curved plate of the cab face with a row of teeth along its inner edge (hinged at x = side * 0.5) */
function jaw(ob: OB, side: number) {
  const S = PG.reg('SHELL'), T = PG.reg('TOOTH');
  const pts: V3[] = [];
  for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push([-side * (0.05 + Math.sin(t * Math.PI) * 0.12), -0.5 + t * 0.95, 0.08 + Math.sin(t * Math.PI) * 0.05]); }
  ob.tube(pts, pts.map((_, i) => [0.36 * (0.6 + Math.sin((i / 6) * Math.PI) * 0.4), 0.06] as [number, number]), 8, S, { up: [0, 0, 1], start: 'pole', end: 'pole' });
  for (let i = 0; i < 7; i++) ob.cone([-side * 0.32, -0.42 + i * 0.13, 0.1], [-side * 1, 0, 0.35], 0.035, 0.16 + (i % 2) * 0.06, 4, T);
}

function pantograph(ob: OB) {
  const Sp = PG.reg('SPINE');
  // folded jointed spines and the pan bar on top
  for (const sx of [-0.18, 0.18]) {
    ob.tube([[sx, 0, -0.35], [sx * 0.7, 0.32, 0.05], [sx * 0.4, 0.55, -0.15]], [0.045, 0.035, 0.025], 6, Sp, { start: 'pole', end: 'pole' });
    ob.tube([[sx, 0, 0.35], [sx * 0.7, 0.3, 0.1]], [0.04, 0.03], 6, Sp, { start: 'pole', end: 'pole' });
  }
  ob.tube([[-0.42, 0.56, -0.15], [0, 0.6, -0.15], [0.42, 0.56, -0.15]], [0.03, 0.035, 0.03], 6, Sp, { start: 'pole', end: 'pole' });
  for (let i = 0; i < 5; i++) ob.cone([-0.32 + i * 0.16, 0.6, -0.15], [0, 1, 0.1], 0.015, 0.1, 4, Sp, { emis: 0.6 });
}

function femur(ob: OB) {
  const L = PG.reg('LEG'), T = PG.reg('TOOTH'), F = PG.reg('FLESH');
  const path: V3[] = []; for (let i = 0; i <= 6; i++) path.push([0, Math.sin((i / 6) * Math.PI) * 0.06, (i / 6) * LEG_L1]);
  ob.tube(path, path.map((_, i) => 0.1 - i * 0.008), 7, L, { start: 'pole', end: 'pole', up: [0, 1, 0], bump: (i, th) => (i % 2 ? 0.08 : 0) * Math.max(0, Math.cos(th)) });
  ob.blob([0, 0, LEG_L1], [0.1, 0.1, 0.1], 7, 5, F, {});
  for (let i = 1; i < 5; i++) ob.cone([0, 0.07, (i / 5) * LEG_L1], [0, 1, 0.4], 0.02, 0.09, 4, T);
}
function tibia(ob: OB) {
  const L = PG.reg('LEG'), C = PG.reg('CLAW');
  const path: V3[] = []; for (let i = 0; i <= 7; i++) path.push([0, -Math.sin((i / 7) * Math.PI) * 0.05, (i / 7) * (LEG_L2 - 0.12)]);
  ob.tube(path, path.map((_, i) => Math.max(0.022, 0.075 - i * 0.008)), 6, L, { start: 'pole', up: [0, 1, 0], bump: (i, th) => (i === 3 ? 0.18 : 0) * (0.5 + 0.5 * Math.cos(th)) });
  // the hooked tarsus
  ob.cone([0, 0, LEG_L2 - 0.14], [0, -0.35, 1], 0.03, 0.2, 5, C);
  ob.cone([0, 0, LEG_L2 - 0.2], [0, 0.6, 1], 0.015, 0.1, 4, C);
}

// =====================================================================================
// rig
// =====================================================================================
interface TrainSpec { segs: number; scale: number; larva: boolean }
const ADULT: TrainSpec = { segs: NSEG, scale: 1, larva: false };
const LARVA: TrainSpec = { segs: 3, scale: 0.34, larva: true };

function legDefs(spec: TrainSpec): LegDef[] {
  const out: LegDef[] = [];
  const k = spec.scale;
  for (let s = 0; s < spec.segs; s++) for (const along of [0.7, -0.7]) for (const side of [1, -1] as const) {
    const n = `L${s}${along > 0 ? 'a' : 'b'}${side > 0 ? 'R' : 'L'}`;
    out.push({ seg: s, side, along: along * k, out: RX * 0.85 * k, up: -0.36 * k, reach: 1.5 * k, fwd: 0.1 * k, L1: LEG_L1 * k, L2: LEG_L2 * k, femur: n + 'u', tibia: n + 'd' });
  }
  return out;
}

interface TrainUD {
  spec: TrainSpec; trail: Trail; frames: Frame[]; defs: LegDef[]; st: LegState[]; nb: number[][];
  seen: string; sfK: number; wallK: number; ceilK: number; ph: number; jaw: number; pan: number; breath: number;
  lpx: number; lpz: number; vx: number; vz: number; stepT: number; rumT: number; shakeT: number; dead: number; init: boolean;
}

function buildTrain(spec: TrainSpec): Rig {
  const rig = newRig(2.2 * spec.scale);
  // everything hangs off one group straight under the root (not rig.body: a corpse's fall tips rig.body)
  const train = new THREE.Group(); train.name = 'train';
  rig.root.add(train); rig.parts.train = train;
  const lac = surfaceMat('lacquer', { alphaTest: 0.5 });
  for (let s = 0; s < spec.segs; s++) {
    const head = s === 0, tail = s === spec.segs - 1;
    const key = spec.larva ? (head ? 'lhead' : tail ? 'ltail' : 'lmid') : (head ? 'head' : tail ? 'tail' : 'mid');
    const g = tpart(rig, 'seg' + s, train, [0, 0, 0], PG, key, lac, (ob) => {
      carShell(ob, head, tail);
      if (head) headCap(ob);
      if (tail) tailCap(ob);
    });
    g.scale.setScalar(spec.scale);
    if (!spec.larva || s === 1) bpart(rig, 'pan' + s, g, [0, UP * 0.92, 0], PG, 'pan', pantograph);
    if (head) {
      for (const side of [-1, 1]) bpart(rig, side > 0 ? 'jawR' : 'jawL', g, [side * 0.02, 0.05, SEG_L / 2 + 0.5], PG, side > 0 ? 'jawR' : 'jawL', (ob) => jaw(ob, side));
      const lamp = bpart(rig, 'lamp', g, [0, 0.45, SEG_L / 2 + 0.6], PG, 'lamp', (ob) => { ob.blob([0, 0, 0], [0.2, 0.2, 0.1], 10, 7, PG.reg('LAMP'), { emis: 1 }); });
      void lamp;
    }
  }
  for (const d of legDefs(spec)) {
    const u = bpart(rig, d.femur, train, [0, 0, 0], PG, 'femur', femur);
    const lo = bpart(rig, d.tibia, train, [0, 0, 0], PG, 'tibia', tibia);
    u.scale.setScalar(spec.scale); lo.scale.setScalar(spec.scale);
  }
  rig.eyes = []; // keeps the root shown when the head's own tile is out of sight (the body is long)
  rig.root.userData.spec = spec;
  return rig;
}

export function buildWormTrain(larva = false): Rig { return buildTrain(larva ? LARVA : ADULT); }

// =====================================================================================
// the ring (z.meta.subway.line): arc length helpers
// =====================================================================================
type Line = [number, number][];
const CUM = new WeakMap<Line, number[]>();
function cumOf(L: Line): number[] {
  let c = CUM.get(L);
  if (!c) { c = [0]; for (let i = 1; i <= L.length; i++) { const a = L[i - 1], b = L[i % L.length]; c.push(c[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); } CUM.set(L, c); }
  return c;
}
const lineLen = (L: Line) => cumOf(L)[L.length];
function lineAt(L: Line, s: number, out: { x: number; z: number; tx: number; tz: number }) {
  const c = cumOf(L), T = c[L.length];
  s = ((s % T) + T) % T;
  let lo = 0, hi = L.length;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] <= s) lo = m; else hi = m; }
  const a = L[lo], b = L[(lo + 1) % L.length], d = c[lo + 1] - c[lo] || 1, t = (s - c[lo]) / d;
  out.x = a[0] + (b[0] - a[0]) * t; out.z = a[1] + (b[1] - a[1]) * t; out.tx = (b[0] - a[0]) / d; out.tz = (b[1] - a[1]) / d;
  return out;
}
function lineNearest(L: Line, x: number, z: number): number {
  const c = cumOf(L);
  let best = 0, bd = 1e9;
  for (let i = 0; i < L.length; i++) {
    const a = L[i], b = L[(i + 1) % L.length];
    const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2));
    const px = a[0] + dx * t, pz = a[1] + dz * t, d = Math.hypot(x - px, z - pz);
    if (d < bd) { bd = d; best = c[i] + Math.sqrt(l2) * t; }
  }
  return best;
}
const subwayOf = (z: Zone | null | undefined) => (z?.meta?.subway ?? null) as null | { line: Line; pits: [number, number][]; hunt: [number, number, number, number][]; booth: any; mantis: [number, number] };
const _lp = { x: 0, z: 0, tx: 0, tz: 0 };

// =====================================================================================
// animation
// =====================================================================================
const _up = new THREE.Vector3(), _tmp = new THREE.Vector3();

function groundY(z: Zone | null, x: number, zz: number, upY: number): number | null {
  if (upY < 0) return CEIL_Y;
  if (!z) return 0;
  const tx = Math.floor(x), ty = Math.floor(zz);
  if (!z.inb(tx, ty) || !z.floor[z.idx(tx, ty)]) return null;
  return z.heightAt(tx, ty);
}

/** the wall beside the head on side s (+1 right): its plane point and normal, or null */
function wallBeside(z: Zone | null, x: number, zz: number, fx: number, fz: number, s: number): { px: number; pz: number; nx: number; nz: number } | null {
  if (!z) return null;
  const rx = fz * s, rz = -fx * s; // right of travel times s
  const ax = Math.abs(rx) > Math.abs(rz);
  const dx = ax ? Math.sign(rx) : 0, dy = ax ? 0 : Math.sign(rz);
  let tx = Math.floor(x), ty = Math.floor(zz);
  for (let k = 0; k < 3; k++) {
    if (!z.inb(tx, ty)) return null;
    if (z.edgeBlocks(tx, ty, dx, dy, 'walk')) {
      const px = dx > 0 ? tx + 1 - 0.06 : dx < 0 ? tx + 0.06 : x;
      const pz = dy > 0 ? ty + 1 - 0.06 : dy < 0 ? ty + 0.06 : zz;
      return { px: dx ? px : x, pz: dy ? pz : zz, nx: -dx, nz: -dy };
    }
    tx += dx; ty += dy;
  }
  return null;
}

function trainUD(rig: Rig): TrainUD {
  const ud = rig.root.userData as Record<string, any>;
  if (!ud.tr) {
    const spec = ud.spec as TrainSpec;
    const defs = legDefs(spec);
    ud.tr = {
      spec, trail: new Trail(0.18 * Math.max(0.5, spec.scale), spec.segs * SP * spec.scale + 4), frames: Array.from({ length: spec.segs }, newFrame), defs, st: defs.map(newLegState), nb: legNeighbours(defs),
      seen: '', sfK: 0, wallK: 0, ceilK: 0, ph: 0, jaw: 0, pan: 0, breath: 0, lpx: 0, lpz: 0, vx: 0, vz: 0, stepT: 0, rumT: 0, shakeT: 0, dead: 0, init: false,
    } as TrainUD;
  }
  return ud.tr as TrainUD;
}

/** lay the body out behind the head when the rig is first seen: along the ring if it is on it */
function initTrail(T: TrainUD, c: Creature, z: Zone | null, gy: number) {
  const sw = subwayOf(z), n = netOf(c);
  const k = T.spec.scale;
  if (sw && n.li && !T.spec.larva) {
    const s0 = lineNearest(sw.line, c.x, c.z), pts: [number, number, number][] = [];
    for (let d = 0; d <= T.trail.maxLen + 2; d += 0.5) { lineAt(sw.line, s0 - d, _lp); pts.push([_lp.x, groundY(z, _lp.x, _lp.z, 1) ?? gy, _lp.z]); }
    T.trail.resetAlong(pts);
  } else T.trail.reset(c.x, gy, c.z, Math.cos(c.facing), Math.sin(c.facing));
  void k;
  T.lpx = c.x; T.lpz = c.z; T.init = true;
  for (const s of T.st) s.init = false;
}

interface Drive { t: number; dt: number; speed: number; jaw: number; pan: number; dead: number; surf: 'f' | 'w' | 'c'; wallSide: number; brake: number; hunt: number; flinch: number }

function poseTrain(rig: Rig, c: Creature, z: Zone | null, D: Drive) {
  const T = trainUD(rig);
  const k = T.spec.scale;
  const gy = groundY(z, c.x, c.z, 1) ?? c.y;
  if (!T.init || T.seen !== c.id) { T.seen = c.id; initTrail(T, c, z, gy); }
  // velocity (world) for the step lead
  const dt = Math.max(1e-3, D.dt);
  const vx = (c.x - T.lpx) / dt, vz = (c.z - T.lpz) / dt;
  T.lpx = c.x; T.lpz = c.z;
  const vOk = Math.hypot(vx, vz) < 25;
  T.vx += ((vOk ? vx : 0) - T.vx) * damp(10, dt); T.vz += ((vOk ? vz : 0) - T.vz) * damp(10, dt);
  // the surface the head is on: floor, a wall beside it, or the roof
  const fx = Math.cos(c.facing), fz = Math.sin(c.facing);
  const wall = D.surf === 'w' ? wallBeside(z, c.x, c.z, fx, fz, D.wallSide) : null;
  T.wallK += ((D.surf === 'w' && wall ? 1 : 0) - T.wallK) * damp(2.2, dt);
  T.ceilK += ((D.surf === 'c' ? 1 : 0) - T.ceilK) * damp(1.6, dt);
  let px = c.x, py = gy, pz = c.z;
  _up.set(0, 1, 0);
  if (T.wallK > 0.01 && wall) {
    const wk = T.wallK;
    px = lerp(px, wall.px, wk); pz = lerp(pz, wall.pz, wk); py = gy + wk * 1.45 * k;
    _up.set(lerp(0, wall.nx, wk), 1 - wk, lerp(0, wall.nz, wk)).normalize();
  }
  if (T.ceilK > 0.01) {
    const ck = T.ceilK;
    py = lerp(py, CEIL_Y, ck);
    _tmp.set(0, -1, 0);
    _up.lerp(_tmp, ck);
    if (_up.lengthSq() < 0.01) _up.set(fz * 0.2, ck > 0.5 ? -1 : 1, -fx * 0.2);
    _up.normalize();
  }
  // a dead train settles onto the floor
  const ride = RIDE * k * (1 - D.dead * 0.62);
  if (D.dead) { py = lerp(py, gy, D.dead); _up.lerp(_tmp.set(0, 1, 0), D.dead).normalize(); }
  T.trail.push(px, py, pz, _up.x, _up.y, _up.z);
  // the segments ride the trail
  const root = rig.root, sp = SP * k;
  T.breath += dt * (1.1 + D.hunt * 1.4);
  for (let i = 0; i < T.spec.segs; i++) {
    const F = T.frames[i];
    trailFrame(T.trail, (SEG_L * 0.5 + 0.55) * k + i * sp, SEG_L * 0.45 * k, ride, F);
    // a little give: the cars sway and settle as they go (more when they brake)
    const sway = Math.sin(D.t * 2.4 + i * 0.9) * 0.025 * k * clamp01(D.speed / 3) + D.brake * Math.sin(i * 1.3) * 0.04 * k;
    F.p.addScaledVector(F.r, sway).addScaledVector(F.u, Math.sin(D.t * 3.1 + i * 1.7) * 0.02 * k * clamp01(D.speed / 2) - D.flinch * 0.05 * k);
    const g = rig.parts['seg' + i];
    if (!g) continue;
    // to root-local
    const P = _tmp.copy(F.p); toRoot(root, P);
    const f = F.f.clone(), u = F.u.clone(), r = F.r.clone();
    const a = -root.rotation.y, ca = Math.cos(a), sa = Math.sin(a);
    for (const v of [f, u, r]) v.set(v.x * ca + v.z * sa, v.y, -v.x * sa + v.z * ca);
    placeOnFrame(g, P, f, u, r);
    const br = 1 + Math.sin(T.breath * 2 + i * 0.8) * 0.018;
    g.scale.set(k * br, k * (1 + Math.sin(T.breath * 2 + i * 0.8 + 0.5) * 0.025), k);
    // pantograph spines: folded, raised when it hunts, crackling
    const pan = rig.parts['pan' + i];
    if (pan) pan.rotation.set(-0.15 + D.pan * (0.55 + Math.sin(D.t * 9 + i) * 0.06), 0, Math.sin(D.t * 1.3 + i) * 0.03);
  }
  // the head: jaws, the lamp
  const jw = D.jaw;
  if (rig.parts.jawL) { rig.parts.jawL.rotation.set(0, -jw * 0.9, 0); rig.parts.jawR.rotation.set(0, jw * 0.9, 0); }
  // legs
  updateLegs(root, rig.parts, T.defs, T.st, T.nb, T.frames, dt, {
    vx: T.vx, vy: 0, vz: T.vz, speed: Math.hypot(T.vx, T.vz), stepDist: (0.55 + clamp01(D.speed / 6) * 0.65) * Math.max(0.45, k), lift: 0.32 * Math.max(0.5, k),
    ground: (x, zz, upY) => groundY(z, x, zz, upY),
    onLand: (i, x, y, zz) => {
      if (D.t < T.stepT || !c.visibleToLocal && !T.spec.larva) return;
      T.stepT = D.t + (T.spec.larva ? 0.09 : 0.07);
      if (live()) G.audio?.play?.(T.spec.larva ? 'plenum_skitter' : (i % 3 ? 'swivel_skitter' : 'step_metal'), x, zz, { zone: c.zoneKey, vol: T.spec.larva ? 0.25 : 0.45, range: T.spec.larva ? 8 : 18, rate: T.spec.larva ? 1.4 : 0.6 + Math.random() * 0.2 });
      void y;
    },
    curl: D.dead ? clamp01(D.dead) * 0.08 : 0, freeze: D.dead > 0,
  });
}
const live = () => !!G && !!(G as any).players;

/** after the pose: show the body when any car of it is in sight (the head's own tile may not be) */
function trainVisibility(rig: Rig, c: Creature) {
  const T = trainUD(rig);
  const train = rig.parts.train;
  if (!train || !live() || !G.view || !G.local) return;
  let any = c.visibleToLocal;
  if (!any) for (const F of T.frames) if (G.view.vis.isVisible(Math.floor(F.p.x), Math.floor(F.p.z))) { any = true; break; }
  const d = Math.hypot(c.x - G.local.x, c.z - G.local.z);
  train.visible = any || d < 3;
  rig.body.visible = false;
}

// =====================================================================================
// THE WORM TRAIN: host brain
// =====================================================================================
type Md = 'run' | 'brake' | 'dwell' | 'climb' | 'lurk' | 'drop' | 'hunt' | 'back';
const SERVICE = 6.6, HUNT_V = 6.0, STATION_X = 76;
function setMd(c: Creature, md: Md) { const n = net(c); if (n.md !== md) { n.md = md; c.mem.mdT = 0; } }
const HUNT_ROOMS = new Set(['tunnel', 'track', 'platform']);
function inHunt(z: Zone, x: number, y: number): boolean {
  if (!subwayOf(z)) return true;
  return HUNT_ROOMS.has(z.roomAt(Math.floor(x), Math.floor(y)).type);
}
/** on the track bed, or at the platform edge */
function exposed(z: Zone, p: Player): boolean {
  const h = z.heightAt(Math.floor(p.x), Math.floor(p.z));
  if (h < -0.5) return true;
  // the platform edges (rows next to a track bed)
  for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) { const tx = Math.floor(p.x) + dx, ty = Math.floor(p.z) + dy; if (z.inb(tx, ty) && z.floor[z.idx(tx, ty)] && z.heightAt(tx, ty) < -0.5) return true; }
  return false;
}
/** the cars' centres (host), from the ring or its own trail */
function bodyPoints(c: Creature, z: Zone, out: [number, number][]): [number, number][] {
  out.length = 0;
  const sw = subwayOf(z), n = netOf(c), m = c.mem;
  if (sw && n.li) { for (let i = 0; i < NSEG; i++) { lineAt(sw.line, m.s - (SEG_L * 0.5 + 0.55) - i * SP, _lp); out.push([_lp.x, _lp.z]); } return out; }
  const tr = m.htr instanceof Trail ? m.htr as Trail : null;
  if (tr) { const p = { x: 0, y: 0, z: 0, ux: 0, uy: 1, uz: 0 }; for (let i = 0; i < NSEG; i++) { tr.at((SEG_L * 0.5 + 0.55) + i * SP, p); out.push([p.x, p.z]); } }
  else out.push([c.x, c.z]);
  return out;
}
const _bp: [number, number][] = [];

function thinkTrain(c: Creature, dt: number): boolean {
  const z = G.getZone(c.zoneKey) as Zone, m = c.mem, n = net(c), sw = subwayOf(z), cs = CS(), now = G.time;
  if (!sw) return false; // not in a station: the default brain
  const L = sw.line, LT = lineLen(L);
  const ev = pulse(c);
  m.mdT = (m.mdT ?? 0) + dt;
  if (!m.init) {
    m.init = 1; m.s = lineNearest(L, c.x, c.z); m.v = 0; n.li = 1; n.sf = 'f'; setMd(c, 'run');
    m.sStation = lineNearest(L, STATION_X, 49.5); m.lurkT = now + rng.float(40, 90);
  }
  if (!(m.htr instanceof Trail)) { m.htr = new Trail(0.3, NSEG * SP + 4); (m.htr as Trail).reset(c.x, 0, c.z, Math.cos(c.facing), Math.sin(c.facing)); }
  (m.htr as Trail).push(c.x, 0, c.z, 0, 1, 0);
  const md = (n.md ?? 'run') as Md;
  // hurt: it turns on whoever did it, if they are where it can go
  if (ev.hurt > 0) {
    fx(c, 'roar');
    const p = c.targetId ? G.players.get(c.targetId) : null;
    if (p && md !== 'hunt' && inHunt(z, p.x, p.z)) { m.prey = p.id; m.huntT = now + 18; setMd(c, 'hunt'); n.sf = 'f'; }
  }
  const players = playersIn(c.zoneKey).filter((p) => !p.body.dead);
  // run over: anything on the line in front of or under a moving train
  if ((m.v ?? 0) > 2.2 || md === 'hunt') {
    bodyPoints(c, z, _bp);
    for (const p of players) {
      if ((m.hitT?.[p.id] ?? 0) > now) continue;
      if (z.heightAt(Math.floor(p.x), Math.floor(p.z)) > 0.4) continue;
      for (const [bx, bz] of _bp) {
        if (Math.hypot(p.x - bx, p.z - bz) < 1.15) {
          (m.hitT ||= {})[p.id] = now + 1.2;
          hitPlayer(c, p, 16 + Math.min(26, (m.v ?? 3) * 3.2), ['bruise', 'fracture', 'laceration'], 2.6, undefined, 0.02);
          fx(c, 'thud');
          break;
        }
      }
    }
  }
  // the lead: whoever is exposed near the head
  const head = { x: c.x, z: c.z };
  let prey: Player | null = null, pd = 1e9;
  for (const p of players) {
    const d = dist(p, head);
    if (!inHunt(z, p.x, p.z)) continue;
    const reach = md === 'lurk' ? 7 : md === 'dwell' ? 4.2 : exposed(z, p) ? 14 : 3.2;
    if (d < reach && d < pd) { pd = d; prey = p; }
  }
  // something rang (a Ringer, src/creatures/species/su_natives.ts): it goes to look
  const call = z.meta.su_call as { x: number; z: number; t: number } | undefined;
  if (md !== 'hunt' && md !== 'back' && call && now - call.t < 6 && inHunt(z, call.x, call.z) && Math.hypot(call.x - c.x, call.z - c.z) < 60 && !m.callSeen?.[String(call.t)]) {
    (m.callSeen ||= {})[String(call.t)] = 1;
    if (md === 'lurk' || md === 'climb') { setMd(c, 'drop'); n.sf = 'f'; fx(c, 'roar'); }
    m.lure = { x: call.x, z: call.z, t: now };
  }
  switch (md) {
    case 'run': case 'brake': {
      n.li = 1; n.sf = 'f'; c.setState('travel');
      const toSt = (((m.sStation - m.s) % LT) + LT) % LT;
      let vt = SERVICE;
      if (md === 'run' && toSt < 26 && toSt > 2 && !m.skip) { setMd(c, 'brake'); fx(c, 'brake'); }
      if (md === 'brake') { vt = Math.min(SERVICE, Math.sqrt(Math.max(0, 2 * 2.2 * (toSt - 0.2)))); if (toSt < 0.35 || toSt > LT - 2) { m.v = 0; setMd(c, 'dwell'); m.dwellT = now + rng.float(7, 12); fx(c, 'horn'); break; } }
      if (m.skip && toSt > 30 && toSt < LT - 30) m.skip = 0;
      if (m.lure) vt = SERVICE * 1.25;
      m.v = (m.v ?? 0) + Math.max(-4, Math.min(2.4, vt - (m.v ?? 0))) * dt;
      // in the tunnels, between laps: climb into the roof and wait
      lineAt(L, m.s, _lp);
      const inTunnel = _lp.x < 22 || _lp.x > 128 || _lp.z < 10;
      if (md === 'run' && inTunnel && now > m.lurkT && !m.lure) { setMd(c, 'climb'); m.climbD = 0; m.lurkT = now + rng.float(80, 160); n.ws = rng.chance(0.5) ? 1 : -1; }
      if (prey && md === 'run' && exposed(z, prey)) { m.prey = prey.id; m.huntT = now + 20; setMd(c, 'hunt'); fx(c, 'horn'); if (dist(prey, c) < 12) ruleShown(c); }
      if (m.lure && now - m.lure.t > 1 && Math.hypot(m.lure.x - c.x, m.lure.z - c.z) < 20) { m.prey = null; setMd(c, 'hunt'); m.huntT = now + 10; }
      break;
    }
    case 'dwell': {
      n.li = 1; n.sf = 'f'; c.setState('watch'); m.v = 0;
      if (prey) { m.prey = prey.id; m.huntT = now + 14; setMd(c, 'hunt'); fx(c, 'roar'); if (dist(prey, c) < 8) ruleShown(c); break; }
      if (now > m.dwellT) { setMd(c, 'run'); m.skip = 1; fx(c, 'horn'); }
      break;
    }
    case 'climb': {
      n.li = 1; c.setState('travel');
      m.v = (m.v ?? 0) + (1.5 - (m.v ?? 0)) * Math.min(1, dt * 2);
      m.climbD += (m.v ?? 0) * dt;
      n.sf = m.climbD < 3 ? 'w' : 'c';
      if (m.climbD > NSEG * SP + 4) { setMd(c, 'lurk'); m.v = 0; m.lurkEnd = now + rng.float(25, 55); }
      if (prey) { setMd(c, 'drop'); m.prey = prey.id; }
      break;
    }
    case 'lurk': {
      n.li = 1; n.sf = 'c'; c.setState('hide'); m.v = 0;
      if (prey) { setMd(c, 'drop'); m.prey = prey.id; fx(c, 'roar'); ruleShown(c); break; }
      if (now > m.lurkEnd) { setMd(c, 'run'); n.sf = 'f'; }
      break;
    }
    case 'drop': {
      n.sf = 'f'; m.v = Math.min(3, (m.v ?? 0) + dt * 3);
      if (m.mdT > 1.6) { setMd(c, 'hunt'); m.huntT = now + 16; }
      break;
    }
    case 'hunt': {
      n.li = 0; n.sf = 'f'; c.setState('chase');
      const p = m.prey ? G.players.get(m.prey) : null;
      const lure = m.lure as { x: number; z: number; t: number } | undefined;
      if (p && !p.body.dead && p.zoneKey === c.zoneKey && inHunt(z, p.x, p.z) && now < m.huntT && dist(p, c) < 34) {
        c.targetId = p.id;
        cs.moveTo(c, z, p.x, p.z, HUNT_V, dt, 1.2);
        if (dist(p, c) < c.sp.attack!.range + 0.4 && c.attackT <= 0) { c.targetFacing = Math.atan2(p.z - c.z, p.x - c.x); attack(c, p); }
      } else if (lure && now - lure.t < 12 && inHunt(z, lure.x, lure.z) && !p) {
        if (cs.moveTo(c, z, lure.x, lure.z, HUNT_V * 0.8, dt, 2)) { m.lure = null; setMd(c, 'back'); }
        if (prey) { m.prey = prey.id; m.huntT = now + 16; }
      } else { m.lure = null; m.prey = null; setMd(c, 'back'); }
      m.v = c.speed;
      break;
    }
    case 'back': {
      n.li = 0; n.sf = 'f'; c.setState('travel');
      const s = lineNearest(L, c.x, c.z); lineAt(L, s + 4, _lp);
      if (cs.moveTo(c, z, _lp.x, _lp.z, SERVICE * 0.6, dt, 1.0) || m.mdT > 20) { m.s = lineNearest(L, c.x, c.z); m.v = 2; n.li = 1; setMd(c, 'run'); }
      if (prey) { m.prey = prey.id; m.huntT = now + 14; setMd(c, 'hunt'); }
      m.v = c.speed;
      break;
    }
  }
  // on the ring: it rides the line exactly
  if (n.li) {
    m.s = (m.s + (m.v ?? 0) * dt) % LT;
    lineAt(L, m.s, _lp);
    c.x = _lp.x; c.z = _lp.z; c.vx = 0; c.vz = 0;
    c.facing = c.targetFacing = Math.atan2(_lp.tz, _lp.tx);
    c.speed = m.v ?? 0;
    n.s = +m.s.toFixed(2);
  }
  n.v = +(m.v ?? c.speed).toFixed(2);
  return true;
}

function animateTrain(rig: Rig, c: Creature, t: number, dt: number) {
  applyLook(rig, c, PG, 0);
  const z = live() ? G.zones.get(c.zoneKey) as Zone ?? null : null;
  const n = netOf(c), T = trainUD(rig);
  const md = (n.md ?? 'run') as Md;
  const f = fxPoll(rig, c);
  if (f) {
    if (f.key === 'horn') { playAt('coach_horn', c, 0.85, 70, 0.55); playAt('carriage_glide', c, 0.6, 50, 0.7); }
    else if (f.key === 'brake') { playAt('tire_screech', c, 0.7, 60, 0.6); }
    else if (f.key === 'roar') { playAt('davenport_roar', c, 1, 40, 0.55); if (G.camera && G.local && Math.hypot(c.x - G.local.x, c.z - G.local.z) < 14) G.camera.shake?.(0.35, 0.6); }
    else if (f.key === 'thud') playAt('body_thud', c, 1, 16, 0.7);
  }
  const ud = rig.root.userData as Record<string, any>;
  const atk = c.attackPhase > 0 ? 1 : 0;
  ud.jaw = (ud.jaw ?? 0) + ((atk ? 1 : md === 'hunt' ? 0.35 : md === 'lurk' ? 0.1 : 0.04) - (ud.jaw ?? 0)) * damp(atk ? 18 : 5, dt);
  ud.pan = (ud.pan ?? 0) + ((md === 'hunt' || md === 'drop' ? 1 : md === 'dwell' ? 0.4 : 0) - (ud.pan ?? 0)) * damp(3, dt);
  ud.dead = c.dead ? Math.min(1, (ud.dead ?? 0) + dt * 0.8) : 0;
  const speed = c.dead ? 0 : Math.max(c.speed, n.v ?? 0);
  poseTrain(rig, c, z, { t, dt, speed, jaw: ud.jaw, pan: ud.pan, dead: ud.dead, surf: c.dead ? 'f' : (n.sf ?? 'f'), wallSide: n.ws ?? 1, brake: md === 'brake' ? 1 : 0, hunt: md === 'hunt' ? 1 : 0, flinch: clamp01(c.hitFlash / 0.15) });
  trainVisibility(rig, c);
  if (!live() || !G.local || c.dead) return;
  // the headlamp: a real light down the tunnel, and its spill ahead on the ground
  const F = T.frames[0], d = Math.hypot(c.x - G.local.x, c.z - G.local.z);
  if (F && d < 46) {
    const hp = F.p.clone().addScaledVector(F.f, 1.9).addScaledVector(F.u, 0.45);
    const fl = md === 'hunt' ? 0.85 + Math.sin(t * 23) * 0.15 : md === 'lurk' ? 0.25 : 1;
    G.pointLight(hp.x, hp.y, hp.z, 0xfff0c8, 2.4 * fl, 9);
    const gp = F.p.clone().addScaledVector(F.f, 5.5);
    G.pointLight(gp.x, (groundY(z, gp.x, gp.z, 1) ?? 0) + 0.6, gp.z, 0xffe8b0, 1.5 * fl, 7);
    // the windows glow along the flanks like a carriage at night
    if (md === 'dwell' || md === 'run') { const mp = T.frames[Math.floor(T.frames.length / 2)].p; G.pointLight(mp.x, mp.y, mp.z, 0xffd890, 0.9, 6); }
  }
  // rumble and the rails singing
  if (speed > 1.5 && t > T.rumT && d < 60) { T.rumT = t + 3.4; playAt('leviathan_rumble', c, Math.min(1, 0.35 + speed / 8), 80, 0.8); }
  if (speed > 3 && d < 9 && t > T.shakeT) { T.shakeT = t + 0.6; G.camera?.shake?.(0.12 + (9 - d) * 0.02, 0.5); }
  const p = localIn(c);
  if (p && (c.visibleToLocal || d < 14)) {
    if (md === 'dwell' && d < 16) thinkOnce(p, 'wt_dwell', ['It stopped at the platform. Like a train. The windows are eyes. They are all open.', 'It is waiting at the platform with its lamp on. Do not go near the edge.', 'Every window down its side is an eye, and every eye is lit.'][Math.floor(t * 0.2) % 3], 50);
    else if (md === 'lurk' && d < 12) thinkOnce(p, 'wt_lurk', 'There is something along the tunnel roof. Legs. Folded. Hundreds of legs.', 60);
    else if (md === 'hunt' && d < 16) thinkOnce(p, 'wt_hunt', ['It left the rails. It is coming up onto the platform. RUN. Up the stairs.', 'Off the platform. It does not leave the tracks. Get off the platform.'][Math.floor(t * 0.3) % 2], 30);
    else if (speed > 3 && d < 18) thinkOnce(p, 'wt_pass', ['A train. It is a train. It is walking.', 'The legs. All down both sides. Walking like a spider.', 'Stand back from the edge. Stand back.'][Math.floor(t * 0.15) % 3], 70);
  }
}

const TRAIN = def({
  key: 'worm_train', name: 'Worm Train', code: 'WT-01 // FAUNA, MYRIAPOD MIMIC (TRANSIT)', temperament: 'hostile', threat: 5,
  rule: { name: 'MIND THE GAP', text: 'It keeps to the tracks and the platforms: it runs the Inner Loop like a service, stops at Platform 2, and climbs into the tunnel roofs to wait between laps. It takes what stands on the track bed or at the platform edge. Off the platform (the stairs, the ticket hall, the train on Track 1, the staff rooms) it cannot follow. Anything that rings brings it.', tell: 'A train with its lamp lit. Walking.' },
  hp: 900, walk: 2, run: HUNT_V, turn: 2.4, radius: 0.95, height: 2.2, sight: 18, fov: 1.2, hearing: 2.2, vibration: true,
  attack: { dmg: [24, 40], range: 2.3, cooldown: 1.7, kinds: ['bite', 'deep', 'fracture'], corrupt: 0.03, knock: 1.6 },
  zones: ['subway'], weight: 0, maxPerZone: 1, diet: 'meat',
  meat: [['wt_flesh', 4]],
  flags: { leviathan: true },
  sounds: { idle: 'leviathan_rumble', alert: 'coach_horn', attack: 'swivel_bite', hurt: 'davenport_hurt', death: 'davenport_die', step: 'swivel_skitter' },
  scan: {
    cls: 'Fauna / myriapod, transit mimic (apex)',
    notes: [
      'Sixteen metres, six car-segments of horn plate over flesh, twenty-four jointed legs.',
      'Runs the loop like a service and stops at Platform 2. The headlamp is an eye.',
      'It hunts the track bed and the platform edges. It does not climb the stairs.',
      'It lays egg sacs in the track pits. Ringing draws it.',
    ],
  },
  gore: { blood: 'dark', tint: 0xa08070, flesh: 0xc08a84, gib: false },
  disposition: { mood: 'predator', self: true },
  build: () => buildTrain(ADULT), animate: animateTrain, think: thinkTrain,
});
(TRAIN as any).handlesSevered = true;
onPlayerHit('worm_train', (p, h) => { if ((h?.dmg ?? 0) > 14) bus.emit('think', p, ['It hit me like a train. It IS a train.', 'The legs. I was under the legs.', 'Get off the tracks. Get OFF the tracks.'][Math.floor(Math.random() * 3)]); });
onKilled('worm_train', (c) => { const z = G.getZone(c.zoneKey); z.meta.su_trainDead = (z.meta.su_trainDead ?? 0) + 1; });

// =====================================================================================
// THE WORM LARVA
// =====================================================================================
function thinkLarva(c: Creature, dt: number): boolean {
  const z = G.getZone(c.zoneKey) as Zone, m = c.mem, n = net(c), cs = CS(), now = G.time;
  const ev = pulse(c);
  m.mdT = (m.mdT ?? 0) + dt;
  if (ev.hurt > 0 && c.hp < c.sp.hp * 0.4) { m.fleeT = now + 4; m.from = c.targetId ? G.players.get(c.targetId) : null; }
  if (m.fleeT > now) {
    c.setState('flee'); n.sf = 'w';
    if (!m.fleeTo) m.fleeTo = cs.fleeSpot(c, z, m.from?.x ?? c.x, m.from?.z ?? c.z);
    if (cs.moveTo(c, z, m.fleeTo.x, m.fleeTo.z, c.sp.run, dt, 0.6)) m.fleeTo = null;
    return true;
  }
  m.fleeTo = null;
  let near: Player | null = null, nd = 9;
  for (const p of playersIn(c.zoneKey)) { if (p.body.dead) continue; const d = dist(p, c); if (d < nd) { nd = d; near = p; } }
  if (near) {
    c.setState('chase'); c.targetId = near.id; n.sf = 'f';
    cs.moveTo(c, z, near.x, near.z, c.sp.run, dt, 0.5);
    if (nd < c.sp.attack!.range + 0.3 && c.attackT <= 0) { c.targetFacing = Math.atan2(near.z - c.z, near.x - c.x); attack(c, near); if (nd < 5) ruleShown(c); }
    return true;
  }
  // nosing about the tunnels, running up the walls now and then
  c.setState('wander');
  if (!m.goal || m.mdT > (m.wT ?? 4)) { m.goal = cs.wanderSpot(c, z, 8); m.wT = rng.float(2.5, 6); m.mdT = 0; n.sf = rng.chance(0.4) ? 'w' : 'f'; n.ws = rng.chance(0.5) ? 1 : -1; }
  if (cs.moveTo(c, z, m.goal.x, m.goal.z, rng.chance(0.5) ? c.sp.walk : c.sp.run * 0.7, dt, 0.4)) m.goal = null;
  return true;
}
function animateLarva(rig: Rig, c: Creature, t: number, dt: number) {
  applyLook(rig, c, PG, 0);
  const z = live() ? G.zones.get(c.zoneKey) as Zone ?? null : null;
  const n = netOf(c);
  const ud = rig.root.userData as Record<string, any>;
  const atk = c.attackPhase > 0 ? 1 : 0;
  ud.jaw = (ud.jaw ?? 0) + ((atk ? 1 : c.state === 'chase' ? 0.3 : 0.05) - (ud.jaw ?? 0)) * damp(atk ? 18 : 5, dt);
  ud.dead = c.dead ? Math.min(1, (ud.dead ?? 0) + dt) : 0;
  poseTrain(rig, c, z, { t, dt, speed: c.dead ? 0 : c.speed, jaw: ud.jaw, pan: 0, dead: ud.dead, surf: c.dead ? 'f' : (n.sf ?? 'f'), wallSide: n.ws ?? 1, brake: 0, hunt: c.state === 'chase' ? 1 : 0, flinch: clamp01(c.hitFlash / 0.15) });
  trainVisibility(rig, c);
  if (!live() || !G.local || c.dead) return;
  const F = trainUD(rig).frames[0];
  if (F && Math.hypot(c.x - G.local.x, c.z - G.local.z) < 24) { const hp = F.p.clone().addScaledVector(F.f, 0.7); G.pointLight(hp.x, hp.y + 0.1, hp.z, 0xfff0c8, 0.6, 3.5); }
  const p = localIn(c);
  if (p && c.visibleToLocal && Math.hypot(c.x - p.x, c.z - p.z) < 7) thinkOnce(p, 'wt_larva', ['A little one. A little train, the size of a dog. Its lamp is on.', 'It runs up the wall like a centipede. It has a headlamp.'][Math.floor(t * 0.2) % 2], 80);
}
const LARVA_DEF = def({
  key: 'worm_larva', name: 'Worm Train Larva', code: 'WT-02 // FAUNA, MYRIAPOD (JUVENILE)', temperament: 'hostile', threat: 2,
  rule: { name: 'JUST HATCHED', text: 'A larva is hungry and quick, and it runs up walls, but it is small and soft and breaks off when it is hurt. Hit it and it runs.', tell: 'A little train the size of a dog, lamp lit, legs everywhere.' },
  hp: 34, walk: 1.6, run: 4.9, turn: 6, radius: 0.35, height: 0.6, sight: 9, fov: 1.6, hearing: 1.6, vibration: true,
  attack: { dmg: [4, 8], range: 0.8, cooldown: 1.1, kinds: ['bite', 'laceration'], corrupt: 0.01, knock: 0.2, parts: ['foot_l', 'foot_r', 'shin_l', 'shin_r', 'thigh_l', 'thigh_r'] },
  zones: ['subway', 'tunnels'], weight: 0.4, group: [1, 2], maxPerZone: 5, diet: 'meat',
  meat: [['wt_flesh', 1]],
  sounds: { idle: 'plenum_skitter', alert: 'ventling_chitter', attack: 'swivel_bite', hurt: 'ventling_squeal', death: 'gore_squelch', step: 'plenum_skitter' },
  scan: { cls: 'Fauna / myriapod, juvenile', notes: ['A Worm Train three soft cars long.', 'Hungry. Fast. Climbs walls. Breaks off when hurt.'] },
  gore: { blood: 'dark', tint: 0xb09080, flesh: 0xd0a090, gib: false },
  disposition: { mood: 'predator', self: true },
  build: () => buildTrain(LARVA), animate: animateLarva, think: thinkLarva,
});
(LARVA_DEF as any).handlesSevered = true;

// =====================================================================================
// THE WORM EGG
// =====================================================================================
function buildEgg(): Rig {
  const rig = newRig(1.0);
  const base = bpart(rig, 'base', rig.body, [0, 0, 0], PG, 'eggbase', (ob) => {
    const F = PG.reg('FLESH'), Y = PG.reg('YOLK');
    // the mucus collar it is glued down with, and tethers to the floor
    ob.blob([0, 0.02, 0], [0.78, 0.08, 0.62], 12, 4, F, {});
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.3; ob.tube([[Math.cos(a) * 0.4, 0.3, Math.sin(a) * 0.32], [Math.cos(a) * 0.75, 0.05, Math.sin(a) * 0.62]], [0.05, 0.025], 5, F, { start: 'pole', end: 'pole' }); }
    ob.blob([0, 0.45, 0], [0.5, 0.38, 0.4], 10, 7, Y, { emis: 0.55 });
  });
  void base;
  // the larva curled inside (its own part, it turns over)
  bpart(rig, 'larva', rig.body, [0, 0.5, 0], PG, 'egglarva', (ob) => {
    const S = PG.reg('SHELL'), L = PG.reg('LEG'), Lm = PG.reg('LAMP');
    const pts: V3[] = [];
    for (let i = 0; i <= 12; i++) { const a = (i / 12) * Math.PI * 1.55 - 0.4; pts.push([Math.cos(a) * 0.26, Math.sin(i * 0.6) * 0.03, Math.sin(a) * 0.22]); }
    ob.tube(pts, pts.map((_, i) => [0.12 - i * 0.004, 0.1 - i * 0.003] as [number, number]), 9, S, { start: 'pole', end: 'pole', bump: (i, th) => (i % 4 === 0 ? -0.12 : 0) + 0.02 * Math.cos(th * 3) });
    ob.blob([pts[12][0] + 0.02, 0.02, pts[12][2] + 0.04], [0.05, 0.05, 0.05], 7, 5, Lm, { emis: 0.9 });
    for (let i = 1; i < 12; i += 2) for (const s of [-1, 1]) {
      const p = pts[i];
      ob.tube([[p[0], p[1] - 0.05, p[2]], [p[0] * 0.75, p[1] - 0.12 - s * 0.03, p[2] * 0.75], [p[0] * 0.55, p[1] - 0.04, p[2] * 0.55]], [0.018, 0.014, 0.008], 4, L, { start: 'pole', end: 'pole' });
    }
  });
  // the sac: see-through amber film over all of it
  tpart(rig, 'sac', rig.body, [0, 0, 0], PG, 'eggsac', filmMat(0.55), (ob) => {
    const pts: V3[] = [];
    for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push([0, 0.05 + t * 1.05, Math.sin(t * Math.PI) * 0.04]); }
    ob.tube(pts, pts.map((_, i) => { const t = i / 8; const r = Math.sin(Math.min(1, t * 1.1) * Math.PI) * 0.62 + 0.06; return [r * 1.15, r] as [number, number]; }), 16, PG.reg('SAC'), { up: [0, 0, 1], start: 'pole', end: 'pole', emis: 0.35, bump: (i, th) => 0.04 * Math.sin(th * 5 + i) });
  });
  rig.eyes = [];
  return rig;
}

function thinkEgg(c: Creature, dt: number): boolean {
  const z = G.getZone(c.zoneKey) as Zone, m = c.mem, n = net(c), now = G.time;
  const ev = pulse(c);
  c.speed = 0; c.vx = c.vz = 0; c.setState('nest');
  if (!m.init) {
    m.init = 1;
    m.hatchAt = now + rng.float(240, 720);
    // laid in a pit: move to one nobody is looking at
    const sw = subwayOf(z);
    if (sw && sw.pits.length && !m.placed) {
      m.placed = 1;
      const taken = new Set([...CS().creatures.values()].filter((o) => o !== c && o.sp.key === 'worm_egg' && o.zoneKey === c.zoneKey).map((o) => Math.floor(o.x) + ',' + Math.floor(o.z)));
      const free = sw.pits.filter(([x, y]) => !taken.has(x + ',' + y));
      const pick = free.length ? free[Math.floor(rng.next() * free.length)] : null;
      if (pick && !playersIn(c.zoneKey).some((p) => Math.hypot(p.x - pick[0], p.z - pick[1]) < 14)) { c.x = pick[0] + 0.5; c.z = pick[1] + 0.5; c.home = { x: c.x, z: c.z }; }
    }
    c.facing = c.targetFacing = rng.float(0, Math.PI * 2);
  }
  if (n.h) { // hatching
    if (now > m.hatchEnd) {
      const lv = CS().spawn('worm_larva', c.zoneKey, c.x + Math.cos(c.facing) * 0.6, c.z + Math.sin(c.facing) * 0.6);
      if (lv) lv.facing = lv.targetFacing = c.facing;
      m.hatched = 1; n.hd = 1;
      CS().kill(c, z);
      // the sac is empty now: jelly, no larva
      if (c.inv) for (const it of [...c.inv.items]) if (it.key === 'wt_larva') c.inv.remove(it);
    }
    return true;
  }
  // disturbed: touched, struck, or a unit right on top of it; or simply its time
  let close = false;
  for (const p of playersIn(c.zoneKey)) if (!p.body.dead && dist(p, c) < 1.6) close = true;
  if (ev.hurt > 0 && c.hp > 0 && c.hp < c.sp.hp * 0.5) { /* cut open: it may still hatch */ }
  if ((ev.hurt > 0 || close || now > m.hatchAt) && !n.h) {
    if (close || ev.hurt > 0) { m.disturb = (m.disturb ?? 0) + (ev.hurt > 0 ? 1 : dt); }
    if ((m.disturb ?? 0) > 1.2 || now > m.hatchAt) { n.h = 1; m.hatchEnd = now + 3.2; fx(c, 'hatch'); ruleShown(c); }
  }
  return true;
}
function animateEgg(rig: Rig, c: Creature, t: number, dt: number) {
  applyLook(rig, c, PG, 0.08);
  const n = netOf(c), seed = hashId(c.id);
  const ud = rig.root.userData as Record<string, any>;
  const f = fxPoll(rig, c);
  if (f?.key === 'hatch') { playAt('arv_squelch', c, 0.9, 14, 0.8); playAt('ventling_chitter', c, 0.6, 12, 0.9); }
  ud.h = n.h ? Math.min(1, (ud.h ?? 0) + dt / 3.2) : 0;
  const sac = rig.parts.sac, lv = rig.parts.larva;
  if (c.dead) {
    // split and slumped
    sac.scale.set(1.15, 0.35, 1.1); sac.position.y = -0.02;
    lv.visible = !n.hd && !n.h;
    lv.rotation.set(0, seed * 6, 0.4); lv.position.y = 0.18;
    return;
  }
  // the pulse: a slow double beat; hatching, it heaves
  const beat = Math.max(0, Math.sin(t * 2.2 + seed * 6)) ** 6 + Math.max(0, Math.sin(t * 2.2 + seed * 6 - 0.6)) ** 8 * 0.6;
  const h = ud.h;
  const k = 1 + beat * 0.05 + h * Math.sin(t * 22) * 0.06;
  sac.scale.set(k, 1 + beat * 0.07 + h * 0.15, k);
  lv.rotation.set(Math.sin(t * 0.7 + seed) * 0.1 + h * Math.sin(t * 17) * 0.4, t * 0.15 + seed * 6 + h * t * 2, Math.sin(t * 0.5) * 0.08);
  lv.position.y = 0.5 + Math.sin(t * 1.3 + seed) * 0.02 + h * 0.15;
  if (live() && G.local && c.visibleToLocal !== undefined && Math.hypot(c.x - G.local.x, c.z - G.local.z) < 30) G.pointLight(c.x, c.y + 0.6, c.z, 0xffc870, 0.55 + beat * 0.35 + h * 0.6, 4.5);
  const p = localIn(c);
  if (p && c.visibleToLocal && Math.hypot(c.x - p.x, c.z - p.z) < 6) thinkOnce(p, 'wt_egg', ['An egg sac. Lit up inside like a carriage at night. Something is curled up in it.', 'It is pulsing. Do not touch it. Do not touch it.'][Math.floor(t * 0.2) % 2], 90);
}
const EGG = def({
  key: 'worm_egg', name: 'Worm Train Egg', code: 'WT-03 // OVUM (TRANSIT MYRIAPOD)', temperament: 'hazard', threat: 1,
  rule: { name: 'DO NOT TOUCH THE SACS', text: 'An egg sac hatches when it is disturbed: stand over it, touch it or strike it and it splits within seconds and a larva comes out hungry. Cut it open fast, from a step away, and you get the jelly and the specimen.', tell: 'A big see-through sac, lit inside, pulsing.' },
  hp: 30, walk: 0, run: 0, turn: 0, radius: 0.55, height: 1.1, sight: 0, fov: 0, hearing: 0,
  zones: ['subway'], weight: 0, maxPerZone: 4, diet: 'none',
  flags: { attached: true },
  sounds: { hurt: 'bh_squelch', death: 'arv_squelch' },
  scan: { cls: 'Ovum / transit myriapod', notes: ['A Worm Train egg sac, laid in the track pits.', 'Lit and pulsing; a larva is curled inside.', 'Hatches when disturbed, or in its own time.'] },
  gore: { blood: 'pale', tint: 0xf0d890, gib: false },
  remains: 'decal_puddle',
  disposition: null,
  build: buildEgg, animate: animateEgg, think: thinkEgg,
});
void EGG;

// =====================================================================================
// set pieces: the Worm Train is always on the ring (spawned out of sight the moment a unit arrives)
// =====================================================================================
function ensureTrain(zk: string) {
  if (G.role === 'client' || !G.creatures) return;
  const z = G.zones.get(zk) as Zone | undefined;
  const sw = subwayOf(z);
  if (!z || !sw || (z.meta.su_trainDead ?? 0) > 0) return;
  if ([...CS().creatures.values()].some((o) => o.zoneKey === zk && o.sp.key === 'worm_train')) return;
  // the far side of the ring from the nearest unit
  const L = sw.line, LT = lineLen(L);
  let best = 0, bs = -1;
  for (let s = 0; s < LT; s += 6) {
    lineAt(L, s, _lp);
    let near = 1e9; for (const p of G.players.values()) if (p.zoneKey === zk) near = Math.min(near, Math.hypot(p.x - _lp.x, p.z - _lp.z));
    if (near > bs) { bs = near; best = s; }
  }
  lineAt(L, best, _lp);
  const c = CS().spawn('worm_train', zk, _lp.x, _lp.z);
  if (c) { c.facing = c.targetFacing = Math.atan2(_lp.tz, _lp.tx); c.mem.persistent = true; c.mem.noCap = 1; }
}
let sys = false;
bus.on('enterZone', (z: Zone) => {
  try { if (z?.key) ensureTrain(z.key); } catch (e) { console.error('worm train', e); }
  const g: any = G;
  if (sys || !g?.addSystem) return;
  sys = true;
  let acc = 0;
  g.addSystem({
    name: 'wormTrain',
    update: (dt: number) => {
      acc += dt; if (acc < 3) return; acc = 0;
      const zs = new Set<string>(); for (const p of G.players.values()) zs.add(p.zoneKey);
      for (const zk of zs) ensureTrain(zk);
    },
  });
});

// =====================================================================================
// stand-alone posing (gallery, videos): a fake creature walking a loop
// =====================================================================================
export type WormTrainPose = 'walk' | 'run' | 'climb' | 'ceiling' | 'attack' | 'idle';
const GALLERY: Record<string, any> = {};
export function poseWormTrain(rig: Rig, t: number, dt: number, pose: WormTrainPose = 'walk') {
  const spec = rig.root.userData.spec as TrainSpec;
  const key = rig.root.uuid;
  const home = (rig.root.userData.home ||= rig.root.position.clone()) as THREE.Vector3;
  const fc: any = GALLERY[key] || (GALLERY[key] = { id: 'g-train-' + key, x: home.x, z: home.z, y: 0, facing: 0, speed: 0, mem: { netMem: { md: 'run', sf: 'f', li: 0 } }, attackPhase: 0, hp: 900, hitFlash: 0, dead: false, visibleToLocal: true, zoneKey: '', state: 'idle', a: 0 });
  const R = 6 * spec.scale + 2;
  const sp = pose === 'run' ? 5 : pose === 'idle' || pose === 'attack' ? 0 : pose === 'climb' || pose === 'ceiling' ? 1.4 : 2;
  fc.a += (sp / R) * dt;
  fc.x = home.x + Math.cos(fc.a) * R; fc.z = home.z + Math.sin(fc.a) * R;
  fc.facing = fc.a + Math.PI / 2; fc.speed = sp;
  fc.attackPhase = pose === 'attack' && (t % 2) < 0.4 ? 0.3 : 0;
  fc.mem.netMem.sf = pose === 'ceiling' ? 'c' : pose === 'climb' ? 'w' : 'f';
  fc.mem.netMem.md = pose === 'attack' ? 'hunt' : 'run';
  rig.root.position.set(fc.x, 0, fc.z);
  rig.root.rotation.y = Math.PI / 2 - fc.facing;
  const ud = rig.root.userData as Record<string, any>;
  ud.jaw = (ud.jaw ?? 0) + ((fc.attackPhase > 0 ? 1 : 0.1) - (ud.jaw ?? 0)) * damp(12, dt);
  poseTrain(rig, fc, null, { t, dt, speed: sp, jaw: ud.jaw, pan: pose === 'attack' ? 1 : 0.2, dead: 0, surf: fc.mem.netMem.sf, wallSide: 1, brake: 0, hunt: pose === 'attack' ? 1 : 0, flinch: 0 });
}
const galleryPose = (def0: WormTrainPose) => { try { return (new URLSearchParams(location.search).get('pose') as WormTrainPose) || def0; } catch { return def0; } };
TRAIN.animateGallery = (rig: Rig, t: number) => poseWormTrain(rig, t, 1 / 60, galleryPose(['walk', 'run', 'attack'][Math.floor(t / 6) % 3] as WormTrainPose));
LARVA_DEF.animateGallery = (rig: Rig, t: number) => poseWormTrain(rig, t, 1 / 60, galleryPose(['walk', 'run'][Math.floor(t / 6) % 2] as WormTrainPose));
EGG.animateGallery = (rig: Rig, t: number) => {
  const fc: any = (rig.root.userData.fake ||= { id: 'g-egg', x: 0, z: 0, y: 0, facing: 0, mem: { netMem: { h: 0 } }, dead: false, zoneKey: '', visibleToLocal: false });
  fc.mem.netMem.h = galleryPose('walk') === 'attack' || (t % 10) > 7 ? 1 : 0;
  animateEgg(rig, fc, t, 1 / 60);
};
void hash01; void eye; void ramp; void (null as unknown as Reg);
