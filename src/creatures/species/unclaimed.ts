// THE UNCLAIMED (the Halcyon, third floor: src/world/gen/z_hotel.ts).
//
// A teetering tower of old luggage on six long jointed legs: a canvas steamer
// trunk at the bottom whose lid is a mouth full of teeth, two brass keyhole
// locks lit like eyes; a cracked oxblood suitcase on that; a carpet bag; a
// vanity case; a striped hatbox on top with a brass service bell on its lid.
// Every case is strapped to the next and the stack is a body: it whips and
// sways on springs when the thing starts, stops and turns (physics below),
// tags flutter off it, and its six legs plant their brass ball-and-claw feet
// in the carpet and step in waves (src/creatures/kit/crawler.ts IK). One long
// arm in three joints folds against the stack and ends in a brass luggage hook.
//
// THE ROUND (the hunting pattern this floor made): it rides the corridor ring
// (z.meta.hotel.ring) clockwise at a walk and rings the bell on its hatbox at
// every corner, so the floor always knows where it is. Down a straight it sees
// a long way; anything it sees on the carpet it charges, fast, but it cannot
// take a corner at speed (the stack would go over): it brakes hard into every
// corner and the cases swing out. It never leaves the ring: it is too tall for
// the room doors. Saw or heard a unit go into a room? It goes to that door,
// knocks three times, and then the arm comes in through the doorway and hooks
// whatever is within reach of it. Then it waits, rattling the handle, and goes
// back to its round. Fair and readable: the bell says where it is, the knock
// says what is coming, the back half of every room (and the bath) is safe.
//
// POSTER / VIDEO API (stand-alone):
//   buildUnclaimed() -> Rig ; poseUnclaimed(rig, t, dt, pose)
//   pose: 'walk' | 'run' | 'idle' | 'ring' | 'knock' | 'reach' | 'attack' | 'dead'
import * as THREE from 'three';
import { def, newRig, Rig } from '../species';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import type { Creature } from '../creature';
import type { Player } from '../../entities/player';
import type { Zone } from '../../world/zone';
import { Page, OB, V3, bpart, registerPage, applyLook, ramp, clamp01, lerp, damp } from '../kit/beasts';
import { obox, lathe, hitPlayer } from '../kit/oddkit';
import { newFrame, updateLegs, legNeighbours, newLegState, type Frame, type LegDef, type LegState } from '../kit/crawler';
import { net, netOf, playersIn, dist, hashId, rng, fx, fxPoll, playAt, localIn, thinkOnce, lineOfSightB, angleDiff } from '../behaviors_b';
import { CS, pulse, attack, onPlayerHit, onKilled } from '../behaviors_a';
import { ruleShown } from '../rules';
import { defDread } from '../dread';
import { mixHex } from '../../gfx/pixel';

// =====================================================================================
// texture page
// =====================================================================================
const PG = registerPage(new Page('c_unclaimed', 192, 112, [
  ['TRUNK', 48, 32], ['CASE', 40, 24], ['CARPET', 40, 32], ['VANITY', 24, 16], ['HATBOX', 48, 20], ['LIDTOP', 24, 24],
  ['BRASS', 16, 16], ['STRAP', 8, 24], ['TAG', 8, 12], ['TEETH', 8, 8], ['MOUTH', 24, 16], ['LEG', 16, 32], ['LOCK', 8, 8],
  ['LINING', 16, 16], ['CUT', 16, 16],
], 2));
const OXBLOOD = 0x6a1e1c, CANVAS = 0x7a6a48, SLAT = 0x6a4224, BRASS = 0xc8a050;
PG.paint((P, v) => {
  // the steamer trunk: striped canvas over a box, wooden slats, brass corners, a label or two
  {
    const r = P.R('TRUNK');
    const C = ramp(v ? 0x5a6a5a : CANVAS, 6, 0x2a2418, 0.3), S = ramp(SLAT, 5, 0x1e140a, 0.3), B = ramp(BRASS, 5, 0x4a3410, 0.45);
    P.fill(r, C, (u, vv, x, y) => 2 + (P.n(r, x, y, 4, 2, 11) - 0.5) * 2 + (x % 6 < 2 ? 0.7 : 0) + (vv > 0.9 ? 0.6 : 0));
    for (const yy of [3, 15, 28]) for (let x = 0; x < r.w; x++) for (let k = 0; k < 2; k++) P.set(r, x, yy + k, S[k ? 1 : 3 - (x % 9 === 0 ? 1 : 0)]);
    for (const xx of [0, r.w - 3]) for (let y = 0; y < r.h; y++) for (let k = 0; k < 3; k++) P.set(r, xx + k, y, S[2 - (k === 2 ? 1 : 0)]);
    for (const [cx, cy] of [[0, 0], [r.w - 4, 0], [0, r.h - 4], [r.w - 4, r.h - 4]]) for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) P.set(r, cx + x, cy + y, B[(x + y) % 3 === 0 ? 4 : 2]);
    // travel labels: a cream oval, a red diamond
    for (let y = 0; y < 6; y++) for (let x = 0; x < 9; x++) if (((x - 4) / 4.5) ** 2 + ((y - 2.5) / 3) ** 2 < 1) P.set(r, 30 + x, 7 + y, y === 2 || y === 3 ? 0x9a2a2e : 0xeae0c4);
    for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) if (Math.abs(x - 3) + Math.abs(y - 3) < 3.5) P.set(r, 8 + x, 18 + y, (x + y) % 2 ? 0xc84a2a : 0xf0c048);
  }
  // the suitcase: cracked oxblood leather, stitched welt, a brass clasp
  {
    const r = P.R('CASE');
    const L = ramp(OXBLOOD, 6, 0x1a0606, 0.35);
    P.fill(r, L, (u, vv, x, y) => 2.4 + (P.n(r, x, y, 5, 3, 21) - 0.5) * 2.4 + (vv > 0.85 ? 0.8 : 0) - (vv < 0.1 ? 0.8 : 0));
    for (let i = 0; i < 18; i++) P.walk(r, P.n(r, i, 1, 3, 1, 23) * r.w, P.n(r, i, 2, 3, 1, 24) * r.h, 5, 1, 0.3, 0x2a0a08, 0.7, 0.8);
    for (let x = 1; x < r.w - 1; x += 2) { P.set(r, x, 2, 0xd8c8a8); P.set(r, x, r.h - 3, 0xd8c8a8); }
    for (let y = 0; y < 4; y++) for (let x = 0; x < 6; x++) P.set(r, r.w / 2 - 3 + x, 9 + y, y === 0 ? 0xfff0c0 : BRASS);
  }
  // the carpet bag: a Turkey-carpet pattern, crimson and indigo and gold, worn to the warp at the corners
  {
    const r = P.R('CARPET');
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
      const lx = x % 10 - 4.5, ly = y % 10 - 4.5, d = Math.abs(lx) + Math.abs(ly);
      let c = d < 2 ? 0xe8b840 : d < 3.2 ? 0x2a2a6a : d < 5 ? 0x9a2a2a : 0x5a1a1a;
      if ((x + y) % 4 === 0 && d >= 5) c = 0x7a2222;
      if (P.n(r, x, y, 3, 2, 31) > 0.72) c = mixHex(c, 0xb8a888, 0.5);
      P.set(r, x, y, c);
    }
  }
  // the vanity case: cream hide with a brown band and a mirror catch
  {
    const r = P.R('VANITY');
    const L = ramp(0xd8cab0, 5, 0x4a3a2a, 0.3);
    P.fill(r, L, (u, vv, x, y) => 2.4 + (P.n(r, x, y, 3, 2, 41) - 0.5) * 1.5);
    for (let x = 0; x < r.w; x++) for (const y of [6, 7]) P.set(r, x, y, 0x5a3a22);
    P.set(r, r.w / 2, 6, 0xfff0c0); P.set(r, r.w / 2 + 1, 6, BRASS);
  }
  // the hatbox: pastel stripes, a scalloped rim
  {
    const r = P.R('HATBOX');
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
      let c = (Math.floor(x / 4) % 2) ? (v ? 0xb8d0c0 : 0xe8b8b0) : 0xf4ecdc;
      if (y < 2 || y > r.h - 3) c = 0x8a5a4a;
      if (P.n(r, x, y, 3, 2, 51) > 0.75) c = mixHex(c, 0x8a7a5a, 0.3);
      P.set(r, x, y, c);
    }
  }
  {
    const r = P.R('LIDTOP');
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) { const d = Math.hypot(x + 0.5 - r.w / 2, y + 0.5 - r.h / 2); P.set(r, x, y, d > 10.5 ? 0x8a5a4a : (Math.floor(d / 2.5) % 2 ? 0xe8b8b0 : 0xf4ecdc)); }
  }
  { const r = P.R('BRASS'); const B = ramp(BRASS, 6, 0x3a2408, 0.5); P.fill(r, B, (u, vv, x, y) => 2.5 + vv * 2 + (P.n(r, x, y, 3, 2, 61) - 0.5) * 1.2); P.glint(r, 3, 3, 4); }
  { const r = P.R('STRAP'); const S = ramp(0x5a3220, 5, 0x1a0a04, 0.3); P.fill(r, S, (u, vv, x) => (x === 0 || x === r.w - 1 ? 1 : 3) + (P.n(r, x, Math.floor(vv * r.h), 2, 2, 71) - 0.5)); for (let y = 2; y < r.h; y += 5) P.set(r, Math.floor(r.w / 2), y, 0x1a0a04); }
  { const r = P.R('TAG'); for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) P.set(r, x, y, y < 2 ? 0x6a4a2a : (y % 3 === 0 && x > 1 && x < 6) ? 0x3a3a3a : 0xeee2c4); P.set(r, 3, 0, BRASS); }
  { const r = P.R('TEETH'); for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) P.set(r, x, y, y > 5 ? 0x8a5a4a : mixHex(0xf2ead0, 0xb8a888, y / 8)); }
  {
    // the throat inside the trunk: claret silk lining going dark and wet in the middle
    const r = P.R('MOUTH');
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) { const d = Math.hypot((x + 0.5 - r.w / 2) / (r.w / 2), (y + 0.5 - r.h / 2) / (r.h / 2)); P.set(r, x, y, d < 0.45 ? 0x140204 : d < 0.75 ? 0x4a0a14 : (x + y) % 3 ? 0x7a1a2a : 0x9a2a3a); }
  }
  { const r = P.R('LEG'); const S = ramp(0x3a2a22, 6, 0x0e0806, 0.35); P.fill(r, S, (u, vv, x, y) => 2 + Math.sin(u * Math.PI) * 1.5 + ((y % 6) < 2 ? 1 : 0) + (P.n(r, x, y, 2, 2, 81) - 0.5)); for (let y = 0; y < r.h; y += 6) for (let x = 0; x < r.w; x++) P.set(r, x, y, 0x6a4028); }
  { const r = P.R('LOCK'); for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) { const d = Math.hypot(x + 0.5 - 4, y + 0.5 - 3.5); P.set(r, x, y, d < 1.3 ? 0xfff6c0 : (x === 3 || x === 4) && y > 3 && y < 7 ? 0xffd860 : d < 3 ? 0xc89020 : 0x6a4a18); } }
  { const r = P.R('LINING'); for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) P.set(r, x, y, (x + y) % 4 === 0 ? 0x5a1a2a : 0x8a2a3a); }
  P.cut(P.R('CUT'), OXBLOOD, { meat: 0x8a2a3a, bone: 0xe8dcc0, marrow: 0xc8a050, fat: 0xe8d8b8 });
});

// =====================================================================================
// rig
// =====================================================================================
const RIDE = 1.0;                // hip height (the underside of the trunk)
const L1 = 0.82, L2 = 0.92;      // femur, tibia
/** the stack: name, height of the case, offset (x, z), twist */
const STACK: { n: string; h: number; ox: number; oz: number; tw: number }[] = [
  { n: 'trunk', h: 0.5, ox: 0, oz: 0, tw: 0 },
  { n: 'case', h: 0.26, ox: 0.03, oz: -0.02, tw: 0.12 },
  { n: 'bag', h: 0.36, ox: -0.04, oz: 0.02, tw: -0.18 },
  { n: 'vanity', h: 0.25, ox: 0.05, oz: 0.01, tw: 0.3 },
  { n: 'hatbox', h: 0.28, ox: 0, oz: 0, tw: 0 },
];
const ARM_L = [0.72, 0.7, 0.55];

function legDefs(): LegDef[] {
  const out: LegDef[] = [];
  for (const [k, along] of [[0, 0.32], [1, 0], [2, -0.32]] as const) for (const side of [1, -1] as const) {
    out.push({ seg: 0, side, along, out: 0.4, up: -0.02, reach: 1.02 + (k === 1 ? 0.08 : 0), fwd: along * 1.5, L1, L2, femur: `L${k}${side > 0 ? 'R' : 'L'}u`, tibia: `L${k}${side > 0 ? 'R' : 'L'}d` });
  }
  return out;
}

function femur(ob: OB) {
  const L = PG.reg('LEG'), B = PG.reg('BRASS'), S = PG.reg('STRAP');
  const path: V3[] = []; for (let i = 0; i <= 6; i++) path.push([0, Math.sin((i / 6) * Math.PI) * 0.035, (i / 6) * L1]);
  ob.tube(path, path.map((_, i) => 0.05 - i * 0.004), 7, L, { start: 'pole', end: 'pole', up: [0, 1, 0] });
  ob.blob([0, 0, L1], [0.055, 0.055, 0.055], 7, 5, B, {});        // the brass knee cap
  for (const t of [0.3, 0.6]) ob.tube([[0, 0.02, t * L1 - 0.03], [0, 0.02, t * L1 + 0.03]], [0.058, 0.058], 7, S, { start: 'flat', end: 'flat', up: [0, 1, 0] });
}
function tibia(ob: OB) {
  const L = PG.reg('LEG'), B = PG.reg('BRASS');
  const path: V3[] = []; for (let i = 0; i <= 7; i++) path.push([0, -Math.sin((i / 7) * Math.PI) * 0.03, (i / 7) * (L2 - 0.07)]);
  ob.tube(path, path.map((_, i) => Math.max(0.016, 0.04 - i * 0.004)), 6, L, { start: 'pole', up: [0, 1, 0] });
  // a brass ball-and-claw foot, like a chest of drawers
  ob.blob([0, 0, L2 - 0.04], [0.045, 0.045, 0.045], 7, 5, B, {});
  for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2; ob.cone([Math.cos(a) * 0.03, Math.sin(a) * 0.03, L2 - 0.06], [Math.cos(a) * 0.6, Math.sin(a) * 0.6, 1], 0.014, 0.07, 4, B); }
}

function buildUnclaimed(): Rig {
  const rig = newRig(2.45);
  // the stack rides the body (the body takes the physics layer's hits and the death topple)
  const stack = new THREE.Group(); stack.name = 'stack'; stack.position.y = RIDE; rig.body.add(stack); rig.parts.stack = stack;
  const T = PG.reg('TRUNK'), C = PG.reg('CASE'), CP = PG.reg('CARPET'), VA = PG.reg('VANITY'), HB = PG.reg('HATBOX'), LT = PG.reg('LIDTOP');
  const B = PG.reg('BRASS'), S = PG.reg('STRAP'), TG = PG.reg('TAG'), TE = PG.reg('TEETH'), M = PG.reg('MOUTH'), LK = PG.reg('LOCK');
  // ---- the steamer trunk: the gut and the mouth
  const trunk = bpart(rig, 'trunk', stack, [0, 0, 0], PG, 'trunk', (ob) => {
    // a box open at the front: the cavity is the mouth, the drop front is the jaw
    obox(ob, [0, 0.25, -0.1], [0.96, 0.5, 0.5], T);
    obox(ob, [0, 0.45, 0.25], [0.96, 0.1, 0.2], T);
    obox(ob, [0, 0.03, 0.25], [0.96, 0.06, 0.2], T);
    for (const s of [-1, 1]) obox(ob, [s * 0.45, 0.25, 0.25], [0.06, 0.5, 0.2], T);
    // the throat (claret lining going dark), the upper teeth hanging from the rim
    ob.quad([[-0.42, 0.06, 0.151], [0.42, 0.06, 0.151], [0.42, 0.4, 0.151], [-0.42, 0.4, 0.151]], M, undefined, { emis: 0.3 });
    ob.quad([[-0.42, 0.061, 0.15], [0.42, 0.061, 0.15], [0.42, 0.061, 0.34], [-0.42, 0.061, 0.34]], M, undefined, { emis: 0.15 });
    for (let k = 0; k < 9; k++) ob.cone([-0.38 + k * 0.095, 0.4, 0.31], [0, -1, 0.1], 0.024, 0.08 + (k % 2) * 0.04, 4, TE);
    // brass corners, carrying handles, the two keyhole locks on the rim (lit, like eyes)
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const sy of [0.03, 0.47]) obox(ob, [sx * 0.47, sy, sz * 0.34], [0.07, 0.07, 0.07], B);
    for (const s of [-1, 1]) ob.tube([[s * 0.49, 0.26, -0.12], [s * 0.53, 0.3, 0], [s * 0.49, 0.26, 0.12]], [0.018, 0.022, 0.018], 6, S, { start: 'pole', end: 'pole' });
    for (const s of [-1, 1]) obox(ob, [s * 0.22, 0.45, 0.355], [0.07, 0.07, 0.02], LK, { emis: 0.95 });
    for (const x of [-0.26, 0.26]) { obox(ob, [x, 0.25, -0.356], [0.06, 0.5, 0.01], S); obox(ob, [x, 0.502, 0], [0.06, 0.01, 0.72], S); }
  });
  // the jaw: the trunk's drop front, hinged along its bottom edge, the lower teeth along its top; a tongue of strap in the throat
  bpart(rig, 'lid', trunk, [0, 0.06, 0.33], PG, 'lid', (ob) => {
    obox(ob, [0, 0.17, 0], [0.86, 0.34, 0.04], T);
    for (const x of [-0.26, 0.26]) obox(ob, [x, 0.17, 0.022], [0.065, 0.34, 0.01], S);
    for (let k = 0; k < 8; k++) ob.cone([-0.35 + k * 0.1, 0.33, -0.01], [0, 1, -0.15], 0.024, 0.07 + ((k + 1) % 2) * 0.04, 4, TE);
    obox(ob, [0, 0.27, 0.025], [0.14, 0.05, 0.02], B);
  });
  bpart(rig, 'tongue', trunk, [0, 0.08, 0.16], PG, 'tongue', (ob) => { ob.tube([[0, 0, 0], [0, 0.03, 0.12], [0, 0.0, 0.25], [0, -0.06, 0.34]], [[0.08, 0.015], [0.075, 0.015], [0.065, 0.014], [0.05, 0.012]], 6, S, { start: 'flat', end: 'pole' }); });
  // ---- the rest of the stack, each case on the one under it (springs: see sway())
  let parent: THREE.Object3D = trunk, y = STACK[0].h;
  for (let i = 1; i < STACK.length; i++) {
    const s = STACK[i];
    const g = bpart(rig, s.n, parent, [s.ox, y, s.oz], PG, s.n, (ob) => {
      if (s.n === 'case') {
        obox(ob, [0, s.h / 2, 0], [0.82, s.h, 0.56], C);
        for (const x of [-0.2, 0.2]) obox(ob, [x, s.h / 2, 0], [0.05, s.h + 0.01, 0.57], S);
        ob.tube([[-0.12, s.h / 2, 0.29], [0, s.h / 2 + 0.06, 0.33], [0.12, s.h / 2, 0.29]], [0.016, 0.02, 0.016], 6, S, { start: 'pole', end: 'pole' });
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) obox(ob, [sx * 0.4, 0.03, sz * 0.27], [0.05, 0.05, 0.05], B);
      } else if (s.n === 'bag') {
        ob.blob([0, s.h * 0.48, 0], [0.38, s.h * 0.5, 0.27], 12, 7, CP, {});
        obox(ob, [0, s.h * 0.9, 0], [0.5, 0.05, 0.12], B);
        for (const z of [-0.06, 0.06]) ob.tube([[-0.16, s.h * 0.92, z], [-0.08, s.h + 0.12, z], [0.08, s.h + 0.12, z], [0.16, s.h * 0.92, z]], [0.015, 0.018, 0.018, 0.015], 6, S, { start: 'pole', end: 'pole' });
      } else if (s.n === 'vanity') {
        obox(ob, [0, s.h / 2, 0], [0.5, s.h, 0.36], VA);
        ob.tube([[-0.08, s.h, 0], [0, s.h + 0.06, 0], [0.08, s.h, 0]], [0.012, 0.015, 0.012], 6, B, { start: 'pole', end: 'pole' });
      } else {
        lathe(ob, [[0, 0.24], [s.h * 0.85, 0.25]], 18, HB, { start: 'flat', end: null });
        lathe(ob, [[s.h * 0.78, 0.265], [s.h, 0.265]], 18, HB, { start: 'flat', end: null });
        ob.quad([[-0.265, s.h + 0.001, 0.265], [0.265, s.h + 0.001, 0.265], [0.265, s.h + 0.001, -0.265], [-0.265, s.h + 0.001, -0.265]], LT);
      }
    });
    g.rotation.y = s.tw;
    parent = g; y = s.h;
  }
  // the service bell on the hatbox lid
  const bell = bpart(rig, 'bell', rig.parts.hatbox, [0.04, STACK[4].h, 0.06], PG, 'bell', (ob) => {
    ob.quad([[-0.07, 0.005, 0.07], [0.07, 0.005, 0.07], [0.07, 0.005, -0.07], [-0.07, 0.005, -0.07]], PG.reg('LEG'));
    lathe(ob, [[0.005, 0.06], [0.04, 0.055], [0.07, 0.035], [0.085, 0.0]], 12, B, { start: 'flat', end: null });
    ob.blob([0, 0.095, 0], [0.012, 0.016, 0.012], 5, 4, B, {});
  });
  void bell;
  // the tags: pendulums off the cases
  const TAGS: [string, string, V3][] = [['tag0', 'case', [0.42, 0.18, 0.2]], ['tag1', 'trunk', [-0.5, 0.36, 0.1]], ['tag2', 'bag', [0.3, 0.3, -0.18]], ['tag3', 'vanity', [-0.26, 0.2, 0.1]]];
  for (const [n, on, at] of TAGS) bpart(rig, n, rig.parts[on], at, PG, 'tag', (ob) => {
    ob.tube([[0, 0, 0], [0, -0.06, 0]], [0.004, 0.004], 4, S, { start: 'flat', end: 'flat' });
    ob.quad([[-0.03, -0.06, 0], [0.03, -0.06, 0], [0.03, -0.15, 0], [-0.03, -0.15, 0]], TG, undefined, { double: true });
  });
  // ---- the arm: three joints off the carpet bag, a brass hook for a hand
  const a0 = bpart(rig, 'arm0', rig.parts.bag, [0.4, 0.22, 0.04], PG, 'arm0', (ob) => {
    ob.blob([0, 0, 0], [0.07, 0.07, 0.07], 7, 5, B, {});
    ob.tube([[0, 0, 0], [0.015, -ARM_L[0] * 0.5, 0.02], [0, -ARM_L[0], 0]], [0.04, 0.034, 0.03], 7, PG.reg('LEG'), { start: 'pole', end: 'pole' });
    obox(ob, [0, -ARM_L[0] * 0.5, 0], [0.09, 0.05, 0.09], S);
  });
  const a1 = bpart(rig, 'arm1', a0, [0, -ARM_L[0], 0], PG, 'arm1', (ob) => {
    ob.blob([0, 0, 0], [0.045, 0.045, 0.045], 6, 4, B, {});
    ob.tube([[0, 0, 0], [-0.01, -ARM_L[1] * 0.5, 0.015], [0, -ARM_L[1], 0]], [0.032, 0.028, 0.024], 7, PG.reg('LEG'), { start: 'pole', end: 'pole' });
  });
  const a2 = bpart(rig, 'arm2', a1, [0, -ARM_L[1], 0], PG, 'arm2', (ob) => {
    ob.blob([0, 0, 0], [0.04, 0.04, 0.04], 6, 4, B, {});
    ob.tube([[0, 0, 0], [0, -ARM_L[2], 0]], [0.024, 0.02], 6, PG.reg('LEG'), { start: 'pole', end: 'pole' });
  });
  bpart(rig, 'hook', a2, [0, -ARM_L[2], 0], PG, 'hook', (ob) => {
    ob.blob([0, 0, 0], [0.04, 0.035, 0.04], 6, 4, B, {});
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      const dx = Math.cos(a) * 0.035, dz = Math.sin(a) * 0.035;
      ob.tube([[dx, -0.02, dz], [dx * 2, -0.1, dz * 2], [dx * 1.6, -0.17, dz * 1.6 + 0.04], [dx * 0.6, -0.19, dz * 0.6 + 0.07]], [0.014, 0.012, 0.009, 0.004], 5, B, { start: 'pole', end: 'pole' });
    }
  });
  // ---- the legs (posed by the IK in root space: straight under the root, not the body)
  const legs = new THREE.Group(); legs.name = 'legs'; rig.root.add(legs); rig.parts.legs = legs;
  for (const d of legDefs()) { bpart(rig, d.femur, legs, [0, 0, 0], PG, 'femur', femur); bpart(rig, d.tibia, legs, [0, 0, 0], PG, 'tibia', tibia); }
  rig.eyes = [];
  return rig;
}

// =====================================================================================
// animation: legs (IK, planted feet), the stack on springs, tags, the arm, the bell, the jaw
// =====================================================================================
interface UD {
  defs: LegDef[]; st: LegState[]; nb: number[][]; F: Frame[];
  lx: number; lz: number; vx: number; vz: number; ax: number; az: number; seen: string;
  th: number[]; tw: number[]; rl: number[]; rw: number[];
  tg: number[]; tgw: number[];
  jaw: number; reach: number; ring: number; arm: number[]; dead: number; stepT: number; creakT: number; inited: boolean;
}
function ud(rig: Rig): UD {
  const u = rig.root.userData as Record<string, any>;
  if (!u.un) {
    const defs = legDefs();
    u.un = {
      defs, st: defs.map(newLegState), nb: legNeighbours(defs), F: [newFrame()],
      lx: 0, lz: 0, vx: 0, vz: 0, ax: 0, az: 0, seen: '',
      th: STACK.map(() => 0), tw: STACK.map(() => 0), rl: STACK.map(() => 0), rw: STACK.map(() => 0),
      tg: [0, 0, 0, 0], tgw: [0, 0, 0, 0], jaw: 0, reach: 0, ring: 0, arm: [0.15, -2.6, 2.4], dead: 0, stepT: 0, creakT: 0, inited: false,
    } as UD;
  }
  return u.un as UD;
}

interface Drive { t: number; dt: number; md: string; reach: number; jaw: number; dead: number; hurt: number; groundY: number; z: Zone | null; c: Creature | null; visible: boolean }

/** the arm's three angles (rotation.x per joint) for folded / ringing / reaching */
function armTarget(D: Drive, out: number[], t: number) {
  if (D.reach > 0.01) {
    // forward and down, through a doorway at chest height, the hook working
    const k = D.reach;
    out[0] = lerp(0.15, -1.55, k); out[1] = lerp(-2.6, 0.25 + Math.sin(t * 7) * 0.12 * k, k); out[2] = lerp(2.4, 0.45 + Math.sin(t * 9 + 1) * 0.2 * k, k);
  } else if (D.md === 'ring') {
    // up to the bell on the hatbox, the hook tapping it
    out[0] = -2.75; out[1] = -0.9; out[2] = -0.7 + Math.max(0, Math.sin(t * 14)) * 0.35;
  } else {
    const hunt = D.md === 'hunt' ? 1 : 0;
    out[0] = 0.15 - hunt * 0.35 + Math.sin(t * 1.1) * 0.05; out[1] = -2.6 + hunt * 0.6; out[2] = 2.4 - hunt * 0.5;
  }
}

function poseRig(rig: Rig, D: Drive) {
  const U = ud(rig);
  const root = rig.root, dt = Math.max(1e-3, Math.min(0.1, D.dt));
  const id = D.c?.id ?? 'g';
  if (!U.inited || U.seen !== id || Math.hypot(root.position.x - U.lx, root.position.z - U.lz) > 4) {
    U.seen = id; U.inited = true; U.lx = root.position.x; U.lz = root.position.z; U.vx = U.vz = U.ax = U.az = 0;
    for (const s of U.st) s.init = false;
  }
  // ---- velocity and acceleration of the hips (world), smoothed
  const vx = (root.position.x - U.lx) / dt, vz = (root.position.z - U.lz) / dt;
  U.lx = root.position.x; U.lz = root.position.z;
  const ok = Math.hypot(vx, vz) < 20;
  const nvx = U.vx + ((ok ? vx : 0) - U.vx) * damp(14, dt), nvz = U.vz + ((ok ? vz : 0) - U.vz) * damp(14, dt);
  U.ax += ((nvx - U.vx) / dt - U.ax) * damp(10, dt); U.az += ((nvz - U.vz) / dt - U.az) * damp(10, dt);
  U.vx = nvx; U.vz = nvz;
  const speed = Math.hypot(U.vx, U.vz);
  // root-local axes: forward f = (sin r, cos r) for root rotation r (+z local), right = local +x
  const ry = root.rotation.y, fx = Math.sin(ry), fz = Math.cos(ry), rx = Math.cos(ry), rz = -Math.sin(ry);
  const aF = U.ax * fx + U.az * fz, aR = U.ax * rx + U.az * rz;
  // ---- the stack: a chain of damped angular springs; the cases lag the hips and whip back
  const sub = Math.min(6, Math.ceil(dt / (1 / 120)));
  const h = dt / sub;
  const dead = D.dead;
  for (let n = 0; n < sub; n++) {
    for (let i = 1; i < STACK.length; i++) {
      const K = 46 - i * 6, Cd = 3.2 + i * 0.3, g = 0.022 * (1 + i * 0.35);
      const tq = -aF * g + Math.sin(D.t * (0.9 + i * 0.3) + i) * 0.04 * (1 - dead);
      const tr = aR * g;
      U.tw[i] += (-K * U.th[i] - Cd * U.tw[i] + tq) * h; U.th[i] += U.tw[i] * h;
      U.rw[i] += (-K * U.rl[i] - Cd * U.rw[i] + tr) * h; U.rl[i] += U.rw[i] * h;
      U.th[i] = Math.max(-0.4, Math.min(0.4, U.th[i])); U.rl[i] = Math.max(-0.4, Math.min(0.4, U.rl[i]));
    }
    for (let i = 0; i < 4; i++) {
      const tq = -aF * 0.25 - Math.sin(D.t * 3 + i) * 0.6 * clamp01(speed / 3);
      U.tgw[i] += (-14 * U.tg[i] - 1.2 * U.tgw[i] + tq) * h; U.tg[i] += U.tgw[i] * h;
    }
  }
  // a hit knocks the whole stack
  if (D.hurt > 0.5) for (let i = 1; i < STACK.length; i++) { U.tw[i] += (rng.next() - 0.5) * 2.4 * i * 0.4; U.rw[i] += (rng.next() - 0.5) * 2.4 * i * 0.4; }
  for (let i = 1; i < STACK.length; i++) {
    const p = rig.parts[STACK[i].n];
    if (!p) continue;
    // dead: the cases slide apart and settle askew
    const dk = dead * (0.25 + i * 0.12);
    p.rotation.set(U.th[i] + dk * (i % 2 ? 1 : -0.7), STACK[i].tw + dk * 0.8, U.rl[i] + dk * (i % 2 ? -0.6 : 0.9));
    p.position.x = STACK[i].ox + dead * (i % 2 ? 0.18 : -0.15) * i * 0.4;
  }
  // the whole stack leans into its own speed a little and bobs on its steps
  const stack = rig.parts.stack;
  const bob = Math.sin(D.t * (4 + speed * 2.2)) * 0.02 * clamp01(speed / 1.5);
  stack.position.y = lerp(RIDE, 0.28, dead) + bob;
  stack.rotation.x = clamp01(speed / 5) * 0.08 * (1 - dead);
  // tags
  for (let i = 0; i < 4; i++) { const p = rig.parts['tag' + i]; if (p) p.rotation.set(U.tg[i], 0, U.tg[(i + 1) % 4] * 0.6); }
  // jaw (the trunk lid), the tongue showing when it gapes
  U.jaw = lerp(U.jaw, D.jaw, damp(D.jaw > U.jaw ? 16 : 5, dt));
  if (rig.parts.lid) rig.parts.lid.rotation.x = U.jaw * 1.1 + Math.max(0, Math.sin(D.t * 23)) * 0.05 * U.jaw;
  if (rig.parts.tongue) { rig.parts.tongue.rotation.x = U.jaw * 0.55 + Math.sin(D.t * 5) * 0.1 * U.jaw; rig.parts.tongue.scale.set(1, 1, 0.35 + U.jaw * 1.3); }
  // the bell
  U.ring = Math.max(0, U.ring - dt * 3);
  if (rig.parts.bell) { const s = 1 + U.ring * 0.18 * Math.sin(D.t * 60); rig.parts.bell.scale.set(s, 1 + U.ring * 0.08, s); }
  // the arm on springs toward its target angles
  U.reach = lerp(U.reach, D.reach, damp(D.reach > U.reach ? 7 : 3, dt));
  const tgt = [0, 0, 0];
  armTarget({ ...D, reach: U.reach }, tgt, D.t);
  for (let k = 0; k < 3; k++) U.arm[k] = lerp(U.arm[k], tgt[k], damp(D.md === 'ring' ? 9 : 6 - k, dt));
  if (rig.parts.arm0) rig.parts.arm0.rotation.set(U.arm[0], 0, D.md === 'ring' ? 0.55 : -0.12 * U.reach);
  if (rig.parts.arm1) rig.parts.arm1.rotation.set(U.arm[1], 0, 0);
  if (rig.parts.arm2) rig.parts.arm2.rotation.set(U.arm[2], 0, 0);
  if (rig.parts.hook) rig.parts.hook.rotation.set(Math.sin(D.t * 6) * 0.3 * U.reach, D.t * 3 * U.reach, 0);
  // ---- the legs: planted feet, steps in waves, IK
  const F = U.F[0];
  F.f.set(fx, 0, fz); F.u.set(0, 1, 0); F.r.set(rx, 0, rz);
  F.p.set(root.position.x, D.groundY + lerp(RIDE, 0.35, dead) + bob * 0.5, root.position.z);
  F.ride = lerp(RIDE, 0.35, dead);
  updateLegs(root, rig.parts, U.defs, U.st, U.nb, U.F, dt, {
    vx: U.vx, vy: 0, vz: U.vz, speed, stepDist: 0.42 + clamp01(speed / 4) * 0.5, lift: 0.22 + clamp01(speed / 4) * 0.12,
    ground: (x, zz) => groundY(D.z, x, zz),
    splay: 0.55, poleU: 1.2,
    curl: dead ? clamp01(dead) * 0.1 : 0, freeze: dead > 0,
    onLand: (i, x, yy, zz) => {
      // every footfall jolts the stack a little
      for (let k = 1; k < STACK.length; k++) U.tw[k] += (i % 2 ? 0.25 : -0.2) * 0.15 * k;
      if (!D.c || !live() || D.t < U.stepT || !D.visible) return;
      U.stepT = D.t + 0.12;
      G.audio?.play?.(i % 3 ? 'plenum_skitter' : 'swivel_skitter', x, zz, { zone: D.c.zoneKey, vol: 0.32, range: 16, rate: 0.75 + Math.random() * 0.15 });
      void yy;
    },
  });
  // braking hard into a corner: the leather creaks
  if (D.c && live() && D.visible && -aF > 3 && D.t > U.creakT) { U.creakT = D.t + 1.2; playAt('wood_creak', D.c, 0.7, 20, 0.7); }
}
const live = () => !!G && !!(G as any).players;
function groundY(z: Zone | null, x: number, zz: number): number | null {
  if (!z) return 0;
  const tx = Math.floor(x), ty = Math.floor(zz);
  if (!z.inb(tx, ty) || !z.floor[z.idx(tx, ty)]) return null;
  return z.heightAt(tx, ty);
}

function animateUnclaimed(rig: Rig, c: Creature, t: number, dt: number) {
  applyLook(rig, c, PG, 0.03);
  const n = netOf(c);
  const U = ud(rig);
  const md = (n.md ?? 'round') as string;
  const f = fxPoll(rig, c);
  if (f) {
    if (f.key === 'ding') { U.ring = 1; playAt('elevator_ding', c, 1, 46, 0.82 + rng.next() * 0.04); }
    else if (f.key === 'alarm') { U.ring = 1; playAt('elevator_ding', c, 1, 50, 1.0); playAt('davenport_roar', c, 0.8, 34, 0.72); playAt('bag_shake', c, 0.8, 18, 0.8); }
    else if (f.key === 'knock') playAt('knock', c, 1, 26, 0.85);
    else if (f.key === 'rattle') playAt('door_locked', c, 0.9, 20, 0.9);
    else if (f.key === 'reach') { playAt('bag_zip', c, 0.9, 18, 0.7); playAt('swivel_bite', c, 0.8, 18, 0.7); }
    else if (f.key === 'hook') playAt('metal_clank', c, 0.9, 18, 0.8);
  }
  const atk = c.attackPhase > 0 ? 1 : 0;
  const jaw = c.dead ? 0.5 : atk ? 1 : md === 'hunt' ? 0.35 + Math.max(0, Math.sin(t * 6)) * 0.15 : md === 'reach' ? 0.55 : md === 'knock' ? 0.12 : 0.03;
  U.dead = c.dead ? Math.min(1, U.dead + dt * 1.2) : 0;
  const z = live() ? (G.zones.get(c.zoneKey) as Zone ?? null) : null;
  poseRig(rig, { t, dt, md, reach: c.dead ? 0 : (n.rc ?? 0), jaw, dead: U.dead, hurt: c.hitFlash > 0.1 ? 1 : 0, groundY: c.y, z, c, visible: c.visibleToLocal });
  // the lock-eyes give off a little light in the corridor
  if (live() && G.local && !c.dead && Math.hypot(c.x - G.local.x, c.z - G.local.z) < 22) {
    const fx0 = Math.cos(c.facing), fz0 = Math.sin(c.facing);
    G.pointLight?.(c.x + fx0 * 0.45, c.y + RIDE + 0.32, c.z + fz0 * 0.45, 0xffc860, md === 'hunt' ? 0.9 : 0.45, 3);
  }
  const p = localIn(c);
  if (p && !c.dead) {
    const d = dist(p, c);
    if (md === 'knock' && d < 9) thinkOnce(p, 'unc_knock', 'Three knocks. Get away from the door. Into the bath.', 40);
    else if (md === 'hunt' && d < 14) thinkOnce(p, 'unc_hunt', ['Luggage. On legs. Running. Make for the corner.', 'It cannot turn. The corner. Get round the corner.'][Math.floor(t * 0.3) % 2], 35);
    else if (md === 'ring' && d < 18) thinkOnce(p, 'unc_ring', 'A bell at the corner. Somebody ringing for service.', 80);
  }
}

// =====================================================================================
// the round: brain (host)
// =====================================================================================
interface HotelMeta { ring: [number, number][]; arm: number; bounds: [number, number, number, number]; doors: { x: number; y: number; ix: number; iy: number; room: [number, number, number, number]; kind: string }[] }
const hotelOf = (z: Zone | null | undefined): HotelMeta | null => (z?.meta as any)?.hotel ?? null;
interface Line { pts: [number, number][]; cum: number[]; len: number; corners: number[] }
const LINES = new WeakMap<object, Line>();
/** the ring as a closed polyline with rounded corners (radius 1 m), its arc lengths and where its corners are */
function lineOf(H: HotelMeta): Line {
  let L = LINES.get(H);
  if (L) return L;
  const pts: [number, number][] = [], corners: number[] = [];
  const R = H.ring, n = R.length, rad = 1.0;
  for (let i = 0; i < n; i++) {
    const a = R[(i + n - 1) % n], b = R[i], c = R[(i + 1) % n];
    const ia = Math.hypot(b[0] - a[0], b[1] - a[1]), ic = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const p0: [number, number] = [b[0] + (a[0] - b[0]) / ia * rad, b[1] + (a[1] - b[1]) / ia * rad];
    const p1: [number, number] = [b[0] + (c[0] - b[0]) / ic * rad, b[1] + (c[1] - b[1]) / ic * rad];
    for (let k = 0; k <= 6; k++) {
      const t = k / 6, u = 1 - t;
      pts.push([u * u * p0[0] + 2 * u * t * b[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * b[1] + t * t * p1[1]]);
      if (k === 3) corners.push(pts.length - 1);
    }
  }
  const cum = [0];
  for (let i = 1; i <= pts.length; i++) { const a = pts[i - 1], b = pts[i % pts.length]; cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  L = { pts, cum, len: cum[pts.length], corners: corners.map((i) => cum[i]) };
  LINES.set(H, L);
  return L;
}
const wrapS = (L: Line, s: number) => ((s % L.len) + L.len) % L.len;
const _p = { x: 0, z: 0, tx: 1, tz: 0 };
function lineAt(L: Line, s: number, out = _p) {
  s = wrapS(L, s);
  let i = 0, lo = 0, hi = L.pts.length - 1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (L.cum[m] <= s) { i = m; lo = m + 1; } else hi = m - 1; }
  const a = L.pts[i], b = L.pts[(i + 1) % L.pts.length], seg = L.cum[i + 1] - L.cum[i] || 1, t = (s - L.cum[i]) / seg;
  out.x = a[0] + (b[0] - a[0]) * t; out.z = a[1] + (b[1] - a[1]) * t;
  out.tx = (b[0] - a[0]) / seg; out.tz = (b[1] - a[1]) / seg;
  return out;
}
function lineNearest(L: Line, x: number, z: number): number {
  let best = 0, bd = Infinity;
  for (let i = 0; i < L.pts.length; i++) {
    const a = L.pts[i], b = L.pts[(i + 1) % L.pts.length];
    const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2));
    const d = Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z);
    if (d < bd) { bd = d; best = L.cum[i] + Math.sqrt(l2) * t; }
  }
  return best;
}
/** signed shortest way round the ring from s0 to s1 */
const ringDelta = (L: Line, s0: number, s1: number) => { let d = wrapS(L, s1 - s0); if (d > L.len / 2) d -= L.len; return d; };
/** distance along the direction of travel to the next corner */
function toCorner(L: Line, s: number, dir: number): number {
  let best = Infinity;
  for (const cs of L.corners) { const d = dir > 0 ? wrapS(L, cs - s) : wrapS(L, s - cs); if (d > 0.05 && d < best) best = d; }
  return best;
}

const WALK = 1.25, RUN = 4.3, CORNER_V = 0.85, ACC = 3.2, BRAKE = 5.5, SIGHT = 22, REACH = 2.7;
type Md = 'round' | 'ring' | 'hunt' | 'go' | 'knock' | 'reach' | 'wait';
function setMd(c: Creature, md: Md) { const n = net(c); if (n.md !== md) { n.md = md; c.mem.mdT = 0; } }
const isCorridor = (z: Zone, x: number, y: number) => z.roomAt(Math.floor(x), Math.floor(y)).type === 'corridor';
function doorOf(H: HotelMeta, x: number, y: number) {
  const tx = Math.floor(x), ty = Math.floor(y);
  let best: HotelMeta['doors'][number] | null = null, bd = Infinity;
  for (const d of H.doors) {
    const [x0, y0, x1, y1] = d.room;
    if (tx < x0 || tx > x1 || ty < y0 || ty > y1) continue;
    const dd = Math.hypot(d.x + 0.5 - x, d.y + 0.5 - y);
    if (dd < bd) { bd = dd; best = d; }
  }
  return best;
}
/** does it see this unit: on the carpet, in range, in its eyeline down the corridor */
function seesUnit(c: Creature, z: Zone, p: Player): boolean {
  if (!isCorridor(z, p.x, p.z)) return false;
  const d = dist(p, c);
  if (d > SIGHT) return false;
  if (d > 4.5 && Math.abs(angleDiff(c.facing, Math.atan2(p.z - c.z, p.x - c.x))) > 1.25) return false;
  return lineOfSightB(z, c.x, c.z, p.x, p.z);
}

function thinkUnclaimed(c: Creature, dt: number): boolean {
  const z = G.getZone(c.zoneKey) as Zone, H = hotelOf(z);
  if (!H) return false;  // not on its floor: the default brain
  const L = lineOf(H), m = c.mem, n = net(c), now = G.time;
  const ev = pulse(c);
  m.mdT = (m.mdT ?? 0) + dt;
  if (!m.init) { m.init = 1; m.s = lineNearest(L, c.x, c.z); m.v = 0; m.dir = 1; m.aware = {}; m.lastCorner = -1; setMd(c, 'round'); }
  const md = (n.md ?? 'round') as Md;
  const players = playersIn(c.zoneKey).filter((p) => !p.body.dead);
  // ---- perception: who it can see on the carpet, who it heard (running, or a noise), who went into which room
  let prey: Player | null = null, pd = Infinity;
  for (const p of players) {
    const d = dist(p, c);
    const heard = (p.running && d < 11) || (!!c.lastHeard && now - c.lastHeard.t < 1 && Math.hypot(c.lastHeard.x - p.x, c.lastHeard.z - p.z) < 3 && d < 16);
    if (seesUnit(c, z, p) || (heard && isCorridor(z, p.x, p.z))) { m.aware[p.id] = now; if (d < pd) { pd = d; prey = p; } }
    else if (heard) m.aware[p.id] = now;
  }
  // hurt: it knows exactly where you are
  if (ev.hurt > 0 && c.targetId) m.aware[c.targetId] = now;
  // a unit it knows about has gone into a room: that door
  let door: HotelMeta['doors'][number] | null = null, doorP: Player | null = null;
  if (!prey) for (const p of players) {
    if (now - (m.aware[p.id] ?? -99) > 6 || isCorridor(z, p.x, p.z)) continue;
    const d = doorOf(H, p.x, p.z);
    if (d && d.kind !== 'staff') { door = d; doorP = p; break; }
  }
  const sNow = m.s as number;
  /** ride the ring toward s1 (or just keep going `dir`), braking into corners */
  const ride = (vMax: number, s1: number | null) => {
    let dir = m.dir as number, remain = Infinity;
    if (s1 !== null) { const dd = ringDelta(L, sNow, s1); dir = dd >= 0 ? 1 : -1; remain = Math.abs(dd); }
    m.dir = dir;
    const corner = toCorner(L, sNow, dir);
    let vt = Math.min(vMax, Math.sqrt(CORNER_V * CORNER_V + 2 * BRAKE * Math.max(0, corner - 0.6)));
    if (corner < 1.1) vt = Math.min(vt, CORNER_V);
    if (remain < Infinity) vt = Math.min(vt, Math.sqrt(2 * BRAKE * Math.max(0, remain - 0.3)));
    const v = m.v as number;
    m.v = v + Math.max(-BRAKE * dt, Math.min(ACC * dt, vt - v));
    m.s = wrapS(L, sNow + dir * (m.v as number) * dt);
    return remain;
  };
  switch (md) {
    case 'round': case 'ring': {
      c.setState(md === 'ring' ? 'watch' : 'wander');
      if (prey) { setMd(c, 'hunt'); m.prey = prey.id; fx(c, 'alarm'); c.targetId = prey.id; if (pd < 12) ruleShown(c); break; }
      if (door) { setMd(c, 'go'); m.door = door; m.doorP = doorP!.id; break; }
      if (md === 'ring') { m.v = 0; if (m.mdT > 1.6) setMd(c, 'round'); break; }
      m.dir = 1; ride(WALK, null);
      // the corners: ring for service
      for (let k = 0; k < L.corners.length; k++) {
        if (k === m.lastCorner) continue;
        if (Math.abs(ringDelta(L, m.s, L.corners[k])) < 0.35) { m.lastCorner = k; setMd(c, 'ring'); fx(c, 'ding'); break; }
      }
      break;
    }
    case 'hunt': {
      c.setState('chase');
      const p = m.prey ? G.players.get(m.prey) as Player | undefined : undefined;
      if (prey && prey.id !== m.prey && pd < (p ? dist(p, c) : Infinity)) m.prey = prey.id;
      const target = m.prey ? G.players.get(m.prey) as Player | undefined : undefined;
      if (!target || target.body.dead || target.zoneKey !== c.zoneKey) { setMd(c, 'round'); break; }
      if (!isCorridor(z, target.x, target.z)) {
        // it went in somewhere: that door
        const d = doorOf(H, target.x, target.z);
        if (d && d.kind !== 'staff' && now - (m.aware[target.id] ?? -99) < 6) { setMd(c, 'go'); m.door = d; m.doorP = target.id; }
        else { setMd(c, 'round'); m.v = Math.min(m.v, WALK); }
        break;
      }
      if (now - (m.aware[target.id] ?? -99) > 5) { setMd(c, 'round'); break; }
      c.targetId = target.id;
      const sp = lineNearest(L, target.x, target.z);
      ride(RUN, sp);
      if (dist(target, c) < (c.sp.attack!.range) + 0.3 && c.attackT <= 0) { c.targetFacing = Math.atan2(target.z - c.z, target.x - c.x); attack(c, target); }
      break;
    }
    case 'go': {
      c.setState('investigate');
      const d = m.door as HotelMeta['doors'][number];
      if (prey) { setMd(c, 'hunt'); m.prey = prey.id; fx(c, 'alarm'); break; }
      const sd = lineNearest(L, d.x + 0.5, d.y + 0.5);
      const remain = ride(RUN * 0.7, sd);
      if (remain < 0.4 && (m.v as number) < 0.6) { m.v = 0; setMd(c, 'knock'); m.kn = 0; m.knT = now + 0.5; }
      if (m.mdT > 30) setMd(c, 'round');
      break;
    }
    case 'knock': {
      c.setState('warn');
      const d = m.door as HotelMeta['doors'][number];
      m.v = 0;
      if (prey) { setMd(c, 'hunt'); m.prey = prey.id; fx(c, 'alarm'); break; }
      if (now > m.knT) {
        if (m.kn < 3) { fx(c, 'knock'); m.kn++; m.knT = now + 0.75; }
        else { setMd(c, 'reach'); fx(c, 'reach'); m.hit = {}; }
      }
      n.dr = +Math.atan2(d.iy, d.ix).toFixed(3);
      break;
    }
    case 'reach': {
      c.setState('attack');
      const d = m.door as HotelMeta['doors'][number];
      m.v = 0;
      n.rc = Math.min(1, (n.rc ?? 0) + dt * 2.2);
      // the hook sweeps the doorway: anything within reach of the door, and in line of it, is hooked
      const ex = d.x + 0.5 + d.ix * 0.5, ez = d.y + 0.5 + d.iy * 0.5;
      if (m.mdT > 0.45 && m.mdT < 1.8) {
        for (const p of players) {
          if ((m.hit[p.id] ?? 0) > now) continue;
          const dd = Math.hypot(p.x - ex, p.z - ez);
          const inside = (p.x - ex) * d.ix + (p.z - ez) * d.iy > -0.4;
          if (dd < REACH && inside && lineOfSightB(z, ex - d.ix * 0.4, ez - d.iy * 0.4, p.x, p.z)) {
            m.hit[p.id] = now + 1.2;
            hitPlayer(c, p, rng.float(13, 21), ['laceration', 'bruise'], 0.4, ['torso_u', 'uarm_l', 'uarm_r', 'farm_l', 'farm_r', 'head']);
            fx(c, 'hook');
          }
        }
      }
      if (m.mdT > 2.4) {
        // anyone it went in for, still in the room, out of reach: that is how you live on this floor
        const p = m.doorP ? G.players.get(m.doorP) as Player | undefined : undefined;
        if (p && !p.body.dead && p.zoneKey === c.zoneKey && !m.hit[p.id] && doorOf(H, p.x, p.z) === d) ruleShown(c);
        setMd(c, 'wait'); m.ratT = now + 1;
      }
      break;
    }
    case 'wait': {
      c.setState('watch');
      n.rc = Math.max(0, (n.rc ?? 0) - dt * 1.5);
      m.v = 0;
      if (prey) { setMd(c, 'hunt'); m.prey = prey.id; fx(c, 'alarm'); break; }
      if (now > m.ratT) { fx(c, 'rattle'); m.ratT = now + rng.float(1.4, 2.2); }
      if (m.mdT > 5.5) { setMd(c, 'round'); m.lastCorner = -1; }
      break;
    }
  }
  if (md !== 'reach' && md !== 'wait') n.rc = Math.max(0, (n.rc ?? 0) - dt * 2);
  // ---- on the ring: it rides the centre line exactly, facing its way (or the door it is at)
  lineAt(L, m.s);
  c.x = _p.x; c.z = _p.z; c.vx = 0; c.vz = 0; c.speed = m.v;
  const curMd = (n.md ?? 'round') as Md;
  if (curMd === 'knock' || curMd === 'reach' || curMd === 'wait') { const d = m.door; c.facing = c.targetFacing = Math.atan2(d.iy, d.ix); }
  else if ((m.v as number) > 0.05 || curMd === 'ring') { const a = Math.atan2(_p.tz * m.dir, _p.tx * m.dir); c.facing = c.targetFacing = a; }
  n.v = +(+m.v).toFixed(2);
  return true;
}

// =====================================================================================
// species
// =====================================================================================
const UNC = def({
  key: 'unclaimed', name: 'The Unclaimed', code: 'HT-03 // MIMIC (LUGGAGE)', temperament: 'hostile', threat: 4,
  rule: { name: 'DO NOT DISTURB', text: 'It walks the corridor ring clockwise and rings its bell at every corner. On a straight it is fast; it has to stop for every corner. It is too tall for the room doors: it knocks three times and reaches in through the doorway. Get to the back of the room (the bath) and it cannot touch you.', tell: 'A bell, at the corner. Somebody ringing for service.' },
  hp: 260, walk: WALK, run: RUN, turn: 3, radius: 0.55, height: 2.6, sight: SIGHT, fov: 1.25, hearing: 1.6,
  attack: { dmg: [18, 28], range: 1.75, cooldown: 1.6, kinds: ['laceration', 'bruise', 'bite'], corrupt: 0, knock: 1.4 },
  zones: ['hotel'], weight: 0, maxPerZone: 1, diet: 'none',
  flags: {},
  sounds: { idle: 'wood_creak', alert: 'elevator_ding', attack: 'swivel_bite', hurt: 'davenport_hurt', death: 'davenport_die', step: 'plenum_skitter' },
  scan: {
    cls: 'Mimic / luggage, corridor keeper',
    notes: [
      'A stack of five cases on six legs, 2.6 m. The bottom trunk is a mouth.',
      'Walks the ring clockwise, rings the bell at each corner.',
      'Fast on the straight, slow round corners. Too tall for room doors.',
      'Knocks three times, then reaches 2.7 m through the doorway.',
    ],
  },
  gore: { blood: 'stuffing', tint: 0xb89a7a, flesh: 0x8a2a3a, gib: false, sever: ['arm0', 'hatbox', 'lid'], head: 'hatbox' },
  disposition: { mood: 'predator', self: true } as any,
  remains: 'none',
  build: buildUnclaimed, animate: animateUnclaimed, think: thinkUnclaimed,
});
defDread('unclaimed', { cam: 0.45 });
onPlayerHit('unclaimed', (p, h) => { if ((h?.dmg ?? 0) > 10) bus.emit('think', p, ['The hook. Through the door. Away from the door.', 'It does not stop for anything but a corner.', 'The cases are all shut. Something in them is breathing.'][Math.floor(Math.random() * 3)]); });
onKilled('unclaimed', (c) => { const z = G.getZone(c.zoneKey); z.meta.ht_uncDead = G.time; });

// ---- the set piece: one keeper on the ring, the far side from whoever arrives
function ensureUnclaimed(zk: string) {
  if (G.role === 'client' || !G.creatures) return;
  const z = G.zones.get(zk) as Zone | undefined, H = hotelOf(z);
  if (!z || !H) return;
  if (z.meta.ht_uncDead && G.time - z.meta.ht_uncDead < 600) return;
  if ([...CS().creatures.values()].some((o) => o.zoneKey === zk && o.sp.key === 'unclaimed' && !o.dead)) return;
  const L = lineOf(H);
  let best = 0, bs = -1;
  for (let s = 0; s < L.len; s += 4) {
    lineAt(L, s);
    let near = 1e9; for (const p of G.players.values()) if (p.zoneKey === zk) near = Math.min(near, Math.hypot(p.x - _p.x, p.z - _p.z));
    if (near > bs) { bs = near; best = s; }
  }
  lineAt(L, best);
  const c = CS().spawn('unclaimed', zk, _p.x, _p.z);
  if (c) { c.facing = c.targetFacing = Math.atan2(_p.tz, _p.tx); c.mem.persistent = true; c.mem.noCap = 1; }
}
let sys = false;
bus.on('enterZone', (z: Zone) => {
  try { if (z?.key) ensureUnclaimed(z.key); } catch (e) { console.error('unclaimed', e); }
  const g: any = G;
  if (sys || !g?.addSystem) return;
  sys = true;
  let acc = 0;
  g.addSystem({
    name: 'unclaimed',
    update: (dt: number) => {
      acc += dt; if (acc < 4) return; acc = 0;
      const zs = new Set<string>(); for (const p of G.players.values()) zs.add(p.zoneKey);
      for (const zk of zs) ensureUnclaimed(zk);
    },
  });
});

// =====================================================================================
// stand-alone posing (gallery, videos): a fake creature walking a circle
// =====================================================================================
export type UnclaimedPose = 'walk' | 'run' | 'idle' | 'ring' | 'knock' | 'reach' | 'attack' | 'dead';
const GALLERY: Record<string, any> = {};
export function poseUnclaimed(rig: Rig, t: number, dt: number, pose: UnclaimedPose = 'walk') {
  const key = rig.root.uuid;
  const home = (rig.root.userData.home ||= rig.root.position.clone()) as THREE.Vector3;
  const fc: any = GALLERY[key] || (GALLERY[key] = { id: 'g-unc-' + key, a: 0 });
  const R = 2.6;
  const sp = pose === 'run' ? 3.6 : pose === 'walk' ? 1.2 : 0;
  // running: it brakes and swings every few seconds, the way it does at a corner
  const brake = pose === 'run' ? (Math.sin(t * 0.9) > 0.6 ? 0.25 : 1) : 1;
  fc.a += (sp * brake / R) * dt;
  const x = home.x + Math.cos(fc.a) * R * (sp ? 1 : 0), z = home.z + Math.sin(fc.a) * R * (sp ? 1 : 0);
  rig.root.position.set(x, home.y, z);
  rig.root.rotation.y = sp ? -fc.a : 0;
  const md = pose === 'run' || pose === 'attack' ? 'hunt' : pose === 'ring' ? 'ring' : pose === 'knock' ? 'knock' : pose === 'reach' ? 'reach' : 'round';
  const U = ud(rig);
  if (pose === 'ring' && (t % 1.6) < dt * 1.5) U.ring = 1;
  const jaw = pose === 'attack' ? ((t % 1.2) < 0.4 ? 1 : 0.3) : pose === 'run' ? 0.4 : pose === 'reach' ? 0.55 : pose === 'dead' ? 0.5 : 0.04;
  poseRig(rig, { t, dt, md, reach: pose === 'reach' ? 0.5 + Math.sin(t * 1.5) * 0.5 : 0, jaw, dead: pose === 'dead' ? 1 : 0, hurt: 0, groundY: home.y, z: null, c: null, visible: false });
}
const galleryPose = (d: UnclaimedPose) => { try { return (new URLSearchParams(location.search).get('pose') as UnclaimedPose) || d; } catch { return d; } };
UNC.animateGallery = (rig: Rig, t: number) => poseUnclaimed(rig, t, 1 / 60, galleryPose((['walk', 'run', 'ring', 'reach', 'attack'] as UnclaimedPose[])[Math.floor(t / 5) % 5]));
export { buildUnclaimed };
void OB; void ramp;
