import * as THREE from 'three';
import { def, newRig, Rig } from '../species';
import { mixHex, scaleHex, ph } from '../../gfx/pixel';
import {
  Page, Reg, OB, V3, bpart, bodyRing, registerPage, applyLook, meshOf, gaitState, trackMotion, poseLegs, LegSpec, GaitParams,
  animMem, tickEvents, partGone, clamp01, smooth, gauss, damp, hash01, LoftRing, Row, sampleRows, ab, uOf, ramp, fillLv, galleryDriver,
} from '../kit/beasts';
import { op } from '../../game/ops';
import { G } from '../../game/G';
import { worldMaterial } from '../../gfx/materials';
import { itemGeometry } from '../../items/itemMeshes';
import { itemWeight, itemDef } from '../../items/item';
import type { Creature } from '../creature';
import {
  CS, zoneOf, nm, netSet, pulse, instFlags, walkable, attack, nearestPlayer, stop, dist, faceTo, sfx, ventSpots, VentSpot, objectsNear,
  floorItemsAround, isPrecious, takeFloorItem, takeObjItem, dropStored, onKilled, hideRig, suppressSighting, restoreStore, ease, lerp, findSpot,
} from '../behaviors_a';

// =====================================================================================
// VENTLING — a small pale thing that lives in the ducts. It crawls out of one
// vent and into another, and it takes things: whatever is lying on the floor,
// whatever you left in that drawer. Cowardly. Kill it or trap it and it drops
// everything it was carrying.
// =====================================================================================

// Model: a hairless crawling thing about the size of a toddler, all head.
// Bulbous cranium, two huge glossy black almond eyes with a dull eyeshine, a
// lipless slit of needle teeth, spine and ribs under translucent blue-white
// skin, and long knuckled limbs held knees-up like a spider's. Duct grime on
// the palms, knees and belly. Limbs are placed by IK with their bending
// planes turned outward, so the elbows and knees stand up above the body.

const PG = registerPage(new Page('c_ventpg', 96, 96, [
  ['TORSO', 40, 30], ['HEAD', 44, 26], ['JAW', 24, 10], ['LIMB_U', 14, 22], ['LIMB_L', 12, 26], ['HAND', 14, 10],
  ['TAIL', 8, 30], ['EYE', 12, 8], ['TEETH', 24, 5], ['CUT', 12, 12],
], 3));

const TY = 0.17;                 // torso pivot height
const AL1 = 0.17, AL2 = 0.2;     // arm: shoulder->elbow, elbow->palm
const LL1 = 0.18, LL2 = 0.21;    // leg: hip->knee, knee->sole
const TORSO_ROWS: Row[] = [
  { z: -0.17, cy: 0.0, rx: 0.025, up: 0.025, dn: 0.025 },
  { z: -0.15, cy: 0.0, rx: 0.06, up: 0.045, dn: 0.05 },
  { z: -0.1, cy: 0.005, rx: 0.068, up: 0.05, dn: 0.055 },  // haunches
  { z: -0.04, cy: 0.012, rx: 0.05, up: 0.046, dn: 0.04 },  // pinched waist
  { z: 0.03, cy: 0.012, rx: 0.06, up: 0.052, dn: 0.058 },  // ribs
  { z: 0.09, cy: 0.012, rx: 0.066, up: 0.056, dn: 0.058 },
  { z: 0.13, cy: 0.018, rx: 0.056, up: 0.05, dn: 0.045 },  // shoulders
  { z: 0.165, cy: 0.025, rx: 0.03, up: 0.03, dn: 0.03 },
];

function torsoGeo(ob: OB) {
  const z0 = TORSO_ROWS[0].z, z1 = TORSO_ROWS[TORSO_ROWS.length - 1].z;
  const rings: LoftRing[] = [];
  const n = 13;
  for (let k = 0; k <= 14; k++) {
    const z = lerp(z0, z1, k / 14);
    const r = sampleRows(TORSO_ROWS, z);
    const bump = (th: number) => {
      const a = ab(th);
      let b = gauss(a, Math.PI, 0.17) * 0.16 * (Math.cos(z * 150) * 0.35 + 0.65);       // knobbly spine
      if (z > -0.02 && z < 0.12) b += gauss(a, 1.4, 0.4) * Math.max(0, Math.cos((z + 0.02) * 120)) * 0.09; // ribs
      b += gauss(z, 0.1, 0.03) * gauss(a, 2.5, 0.25) * 0.18;                              // shoulder blades
      return b;
    };
    rings.push({ pts: bodyRing(z, r.cy, r.rx, r.up, r.dn, n, 2, bump), v: 0.04 + 0.92 * (k / 14), col: (j) => 0.72 + 0.28 * clamp01(ab((j / (n - 1)) * Math.PI * 2) / 2.2) });
  }
  ob.loft(rings, PG.reg('TORSO'), { start: 'pole', end: 'pole', endBulge: 0.01 });
}

function headGeo(ob: OB) {
  // the cranium: much too big, bulging over the back; a small pointed face under it
  const rows: Row[] = [
    { z: -0.1, cy: 0.06, rx: 0.03, up: 0.03, dn: 0.03 },
    { z: -0.085, cy: 0.06, rx: 0.068, up: 0.07, dn: 0.05 },
    { z: -0.05, cy: 0.055, rx: 0.088, up: 0.085, dn: 0.06 },
    { z: -0.01, cy: 0.045, rx: 0.09, up: 0.08, dn: 0.07 },
    { z: 0.03, cy: 0.03, rx: 0.078, up: 0.068, dn: 0.074 },
    { z: 0.06, cy: 0.012, rx: 0.06, up: 0.05, dn: 0.068 },
    { z: 0.085, cy: -0.005, rx: 0.042, up: 0.035, dn: 0.05 },
    { z: 0.1, cy: -0.012, rx: 0.024, up: 0.02, dn: 0.03 },
  ];
  const n = 15;
  const rings: LoftRing[] = [];
  for (let k = 0; k <= 12; k++) {
    const z = lerp(rows[0].z, rows[rows.length - 1].z, k / 12);
    const r = sampleRows(rows, z);
    // deep eye sockets on the front-sides, a soft fontanelle dent on top
    const bump = (th: number) => -gauss(z, 0.045, 0.025) * gauss(ab(th), 1.75, 0.38) * 0.22 - gauss(z, -0.04, 0.03) * gauss(ab(th), Math.PI, 0.25) * 0.06 + gauss(z, 0.0, 0.03) * gauss(ab(th), 1.2, 0.3) * 0.05;
    rings.push({ pts: bodyRing(z, r.cy, r.rx, r.up, r.dn, n, 2, bump), v: 0.04 + 0.92 * (k / 12), col: (j) => 0.75 + 0.25 * clamp01(ab((j / (n - 1)) * Math.PI * 2) / 2.2) });
  }
  ob.loft(rings, PG.reg('HEAD'), { start: 'pole', end: 'pole', endBulge: 0.006 });
  // upper needle teeth along the slit of a mouth
  const gum: V3[] = [], tip: V3[] = [];
  for (let i = 0; i <= 8; i++) {
    const u = i / 8 - 0.5, x = u * 0.1, z = 0.07 - Math.abs(u) * 0.09;
    gum.push([x, -0.026 + Math.abs(u) * 0.02, z]); tip.push([x * 0.95, -0.04 + Math.abs(u) * 0.02, z]);
  }
  ob.strip(gum, tip, PG.reg('TEETH'), { double: true });
  // neck stub with a cut face
  ob.tube([[0, 0.0, -0.02], [0, -0.01, -0.07]], [0.026, 0.026], 7, PG.reg('TORSO'), { end: 'cut', cut: PG.reg('CUT'), vs: [0.95, 0.9] });
}

function eyesGeo(ob: OB) {
  // huge black almonds, slanted up toward the temples, glossy, with a dull green shine low in each
  for (const s of [1, -1]) {
    ob.blob([s * 0.045, 0.036, 0.05], [0.042, 0.024, 0.017], 8, 5, PG.reg('EYE'), { rot: [0.25, -s * 0.6, s * 0.5], emis: 0.9 });
  }
}

function jawGeo(ob: OB) {
  const gum: V3[] = [], tip: V3[] = [];
  for (let i = 0; i <= 8; i++) {
    const u = i / 8 - 0.5, x = u * 0.1, z = 0.075 - Math.abs(u) * 0.09;
    gum.push([x, -0.004 + Math.abs(u) * 0.01, z]); tip.push([x * 0.95, 0.01 + Math.abs(u) * 0.01, z]);
  }
  ob.strip(gum, tip, PG.reg('TEETH'), { double: true });
  // a small pointed chin under the slit
  const rows: Row[] = [
    { z: -0.01, cy: -0.01, rx: 0.05, up: 0.006, dn: 0.02 },
    { z: 0.04, cy: -0.012, rx: 0.045, up: 0.006, dn: 0.02 },
    { z: 0.08, cy: -0.01, rx: 0.02, up: 0.004, dn: 0.012 },
  ];
  const rings: LoftRing[] = [0, 1, 2, 3, 4].map((k) => { const z = lerp(-0.01, 0.08, k / 4), r = sampleRows(rows, z); return { pts: bodyRing(z, r.cy, r.rx, r.up, r.dn, 9, 2), v: 0.1 + 0.8 * (k / 4) }; });
  ob.loft(rings, PG.reg('JAW'), { start: 'pole', end: 'pole' });
}

/** a long knuckled limb segment along -y (bones show through: knob at each end) */
function limbSeg(ob: OB, len: number, r0: number, r1: number, reg: string, cut: boolean, side: number, top: number) {
  const pts: V3[] = [[-side * top, 0.03, 0], [0, 0.0, 0], [0, -len * 0.3, 0.004], [0, -len * 0.7, 0.002], [0, -len, 0]];
  const rad: [number, number][] = [[r0 * 0.7, r0 * 0.7], [r0 * 1.15, r0 * 1.1], [r0 * 0.85, r0 * 0.8], [r1 * 0.95, r1 * 0.9], [r1 * 1.25, r1 * 1.2]];
  ob.tube(pts, rad, 7, PG.reg(reg), { start: cut ? 'cut' : 'pole', cut: PG.reg('CUT'), end: 'pole', endBulge: r1 * 0.9 });
}
/** a long-fingered hand / foot splayed on the ground at the end of a lower limb */
function hand(ob: OB, len: number, side: number, foot: boolean) {
  const H = PG.reg('HAND');
  ob.blob([0, -len + 0.012, 0.01], [0.02, 0.012, 0.026], 6, 3, H);
  for (let f = 0; f < 4; f++) {
    const a = (f - 1.5) * 0.38 + side * 0.15;
    const L = (foot ? 0.04 : 0.052) * (f === 1 || f === 2 ? 1 : 0.8);
    const p0: V3 = [Math.sin(a) * 0.012, -len + 0.01, 0.025 + Math.cos(a) * 0.005];
    const p1: V3 = [p0[0] + Math.sin(a) * L * 0.55, -len + 0.016, p0[2] + Math.cos(a) * L * 0.55];
    const p2: V3 = [p0[0] + Math.sin(a) * L, -len + 0.003, p0[2] + Math.cos(a) * L];
    ob.tube([p0, p1, p2], [0.0045, 0.004, 0.003], 4, H, { end: 'pole', endBulge: 0.003 });
  }
}

function buildVentling(): Rig {
  const rig = newRig(0.35);
  const torso = bpart(rig, 'torso', rig.body, [0, TY, -0.02], PG, 'torso', torsoGeo);
  const neck = bpart(rig, 'neck', torso, [0, 0.02, 0.15], PG, 'neck', (ob) => {
    ob.tube([[0, -0.01, -0.03], [0, 0.0, 0.0], [0, 0.015, 0.04]], [0.03, 0.028, 0.026], 8, PG.reg('TORSO'), { vs: [0.95, 0.97, 0.99], end: 'cut', cut: PG.reg('CUT') });
  });
  const head = bpart(rig, 'head', neck, [0, 0.02, 0.05], PG, 'head', headGeo);
  const eyes = bpart(rig, 'eyes', head, [0, 0, 0], PG, 'eyes', eyesGeo);
  rig.eyes = [eyes];
  const jaw = bpart(rig, 'jaw', head, [0, -0.03, 0.0], PG, 'jaw', jawGeo);
  void jaw;
  const limbs: [string, number, number, boolean][] = [['armL', 1, 0.115, true], ['armR', -1, 0.115, true], ['legL', 1, -0.115, false], ['legR', -1, -0.115, false]];
  for (const [n, s, z, arm] of limbs) {
    const L1 = arm ? AL1 : LL1, L2 = arm ? AL2 : LL2;
    const up = bpart(rig, n, torso, [s * 0.05, -0.01, z], PG, 'up' + (arm ? 'A' : 'L') + s, (ob) => limbSeg(ob, L1, 0.017, 0.012, 'LIMB_U', true, s, 0.03));
    bpart(rig, n + 'b', up, [0, -L1, 0], PG, 'lo' + (arm ? 'A' : 'L') + s, (ob) => { limbSeg(ob, L2 - 0.012, 0.012, 0.009, 'LIMB_L', false, s, 0); hand(ob, L2, s, !arm); });
  }
  const tail = bpart(rig, 'tail', torso, [0, 0.0, -0.16], PG, 'tail', (ob) => {
    ob.tube([[0, 0, 0.02], [0, -0.01, -0.08], [0, -0.02, -0.18]], [0.011, 0.008, 0.006], 5, PG.reg('TAIL'), { start: 'cut', cut: PG.reg('CUT'), vs: [1, 0.75, 0.45] });
  });
  bpart(rig, 'tail2', tail, [0, -0.02, -0.18], PG, 'tail2', (ob) => {
    ob.tube([[0, 0, 0.01], [0, -0.005, -0.1], [0, -0.004, -0.17]], [0.006, 0.004, 0.002], 5, PG.reg('TAIL'), { end: 'pole', endBulge: 0.004, vs: [0.45, 0.22, 0.02] });
  });
  bpart(rig, 'carry', head, [0, -0.035, 0.1], PG, null, null);
  poseLegs(rig, ventLegs(), gaitState({}), CRAWL, 0, 0.016, { freeze: true });
  return rig;
}

const CRAWL: GaitParams = { duty: 0.6, f0: 1.4, fk: 0.9, maxStride: 0.22, lift: 0.06 };
const SCUTTLE: GaitParams = { duty: 0.45, f0: 3.2, fk: 0.5, maxStride: 0.4, lift: 0.08 };
function ventLegs(): LegSpec[] {
  return (['armL', 'armR', 'legL', 'legR'] as const).map((n, i) => {
    const arm = i < 2, side = (i % 2 === 0 ? 1 : -1) as 1 | -1;
    return {
      up: n, lo: n + 'b', L1: arm ? AL1 : LL1, L2: arm ? AL2 : LL2, bend: 1 as const, ph: [0, 0.5, 0.5, 0][i], restX: 0.16, restZ: arm ? 0.06 : -0.02, front: arm, side,
      // bending planes turned outward: elbows out-back, knees out-forward, both standing up over the body
      yaw: side * (Math.PI / 2 + (arm ? 0.45 : -0.35)),
    };
  });
}

function setCarry(rig: Rig, key: string | null) {
  if ((rig.root.userData.carry ?? null) === key) return;
  rig.root.userData.carry = key;
  const g = rig.parts.carry;
  while (g.children.length) g.remove(g.children[0]);
  if (!key) return;
  const geo = itemGeometry(key);
  if (!geo) return;
  const m = new THREE.Mesh(geo, worldMaterial({}));
  // shrink big things so they fit in its mouth
  const bb = geo.boundingBox; const sz = bb ? Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z) : 0.2;
  m.scale.setScalar(Math.min(1, 0.22 / Math.max(0.05, sz)));
  m.rotation.set(0.3, 0.8, 0);
  g.add(m);
}

const _lame = [false, false, false, false];
const VNAMES = ['armL', 'armR', 'legL', 'legR'];
function crawl(rig: Rig, c: Creature, t: number, dt: number, alarm: number, carry: boolean) {
  const P = rig.parts;
  const m = animMem(rig, c);
  tickEvents(m, c, dt);
  const gs = gaitState(rig.root.userData);
  trackMotion(gs, c, dt);
  const seed = hash01(c.id, 4);
  const legs: LegSpec[] = m.legs || (m.legs = ventLegs());
  const spd = gs.spd;
  let lameN = 0, lameSide = 0;
  for (let i = 0; i < 4; i++) { _lame[i] = partGone(rig, c, VNAMES[i]) || partGone(rig, c, VNAMES[i] + 'b'); if (_lame[i]) { lameN++; lameSide += legs[i].side; } }
  const fast = spd > 2.5;
  // a bite when cornered: rear up on the hind legs, jaw unhinged, then snap down
  const at = m.atk;
  let rear = 0, snap = 0;
  if (at < 0.8) { if (at < 0.22) rear = smooth(at / 0.22); else if (at < 0.4) { rear = 1 - smooth((at - 0.22) / 0.18); snap = smooth((at - 0.22) / 0.18); } else snap = 1 - smooth((at - 0.4) / 0.4); }
  const body = rig.body, torso = P.torso;
  const ph2 = gs.ph * Math.PI * 2, w = gs.w;
  const fl = m.flinch / 0.35;
  const low = alarm * 0.04 + (lameN >= 2 ? 0.08 : 0);
  body.position.set(Math.sin(t * 70) * 0.01 * fl, Math.abs(Math.sin(ph2)) * 0.012 * w - low + rear * 0.05, snap * 0.08 - fl * 0.03);
  torso.rotation.set(-rear * 0.6 + snap * 0.2 + alarm * 0.08, Math.sin(ph2) * 0.08 * w, Math.sin(ph2) * 0.05 * w + lameSide * 0.2);
  const tm = meshOf(torso);
  if (tm) { const b = Math.sin(t * (alarm ? 11 : 6) + seed * 4) * 0.03; tm.scale.set(1 + b, 1 + b, 1); }
  if (c.dead) {
    // a dead spider: every limb curls in under the body
    const k = smooth(m.dead / 0.7);
    for (let i = 0; i < 4; i++) {
      const up = P[VNAMES[i]], lo = P[VNAMES[i] + 'b'];
      up.rotation.order = 'YXZ';
      up.rotation.set(lerp(up.rotation.x, 0.4, k), lerp(up.rotation.y, legs[i].side * 1.6, k), lerp(up.rotation.z, 0, k));
      lo.rotation.set(lerp(lo.rotation.x, 2.4, k), 0, 0);
    }
  } else {
    poseLegs(rig, legs, gs, fast ? SCUTTLE : CRAWL, spd, dt, { lame: _lame, spread: 1 - alarm * 0.15 });
    if (rear > 0.01) for (const i of [0, 1]) { P[VNAMES[i]].rotation.x -= rear * 1.2; P[VNAMES[i] + 'b'].rotation.x += rear * 0.6; }
  }
  // head: twitchy quantised looks while still, low and forward when running; the jaw hangs open sniffing
  const head = P.head, neck = P.neck, jaw = P.jaw;
  const still = spd < 0.2 && !c.dead;
  const tw = Math.floor(t * 2.6 + seed * 9);
  const sy = still ? (hash01(c.id, tw) - 0.5) * 1.4 : 0, sx = still ? (hash01(c.id, tw + 50) - 0.5) * 0.5 : 0;
  const sroll = still && hash01(c.id, tw + 99) < 0.25 ? (hash01(c.id, tw + 7) - 0.5) * 1.4 : 0;
  neck.rotation.set(-0.1 + alarm * 0.25 + rear * 0.4, sy * 0.3, 0);
  head.rotation.set(sx - alarm * 0.1 - rear * 0.2 + (c.dead ? 0.4 : 0), sy * 0.7, sroll);
  const sniff = still && !carry ? Math.max(0, Math.sin(t * 19)) * 0.08 : 0;
  jaw.rotation.x = c.dead ? 0.6 : carry ? 0.18 : Math.max(snap > 0 ? (1 - snap) * 0.2 : 0, rear * 0.9 + sniff + (alarm ? 0.15 : 0.03));
  // tail: whips when fleeing, curls when still
  const tail = P.tail, tail2 = P.tail2;
  const sw = Math.sin(t * (fast ? 14 : 3) + seed * 5) * (fast ? 0.25 : 0.35);
  tail.rotation.set(-0.1 + alarm * 0.3 + (c.dead ? 0.3 : 0), sw, 0);
  m.tl = lerp(m.tl ?? 0, sw, damp(8, dt));
  tail2.rotation.set(0.1, (sw - m.tl) * 2 + (still ? 0.6 * Math.sin(seed * 9) : 0), 0);
}

function animateVentling(rig: Rig, c: Creature, t: number, dt: number) {
  const n = nm(c);
  suppressSighting(c, !!n.duct && !c.dead);
  if (n.duct && !c.dead) { hideRig(c, rig); return; }
  const s = applyLook(rig, c, PG, 0.08) >= 0 ? (rig.root.userData.size as number) : 1;
  setCarry(rig, c.dead ? null : (n.carry ?? null));
  const alarm = c.state === 'flee' || c.attackPhase > 0 ? 1 : 0;
  crawl(rig, c, t, dt, alarm, !!n.carry && !c.dead);
  // squeezing out of a vent: flattened, then unfolds
  if (c.state === 'emerge') { const k = ease(Math.min(1, (c.mem._et = (c.mem._et ?? 0) + dt) / 0.6)); rig.body.scale.set(s * lerp(0.4, 1, k), s * lerp(0.25, 1, k), s); }
  else { c.mem._et = 0; rig.body.scale.set(s, s, s); }
}

// ---------------------------------------------------------------- pages
PG.paint((Pt, v) => {
  const rng = Pt.rng;
  const bases = [0xb4b8b0, 0xa8aeb8, 0xbcb0a8];
  const SK = ramp(bases[v % 3], 14, 0x14161e, 0.55);
  const M = 7;
  const VEIN = 0x5a6a9a;
  const grime = (r: Reg, amt: (x: number, y: number) => number) => {
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) { const d = amt(x, y) + (Pt.n(r, x, y, 3, 2, 3) - 0.5) * 0.6; if (d > 0.3) Pt.blend(r, x, y, 0x2a261e, clamp01((d - 0.3) * 1.8) * 0.8); }
  };
  const veins = (r: Reg, n: number) => { for (let i = 0; i < n; i++) Pt.walk(r, rng.int(0, r.w - 1), rng.int(0, r.h - 1), rng.int(6, 14), rng.float(-1, 1), rng.float(-1, 1), VEIN, 0.4, 0.8, 0.2); };
  // ---------------- torso: translucent, spine knobs and ribs showing, a grimy belly
  {
    const r = Pt.R('TORSO');
    const aOf = (x: number) => ab(((x + 0.5) / r.w) * Math.PI * 2);
    const z0 = TORSO_ROWS[0].z, z1 = TORSO_ROWS[TORSO_ROWS.length - 1].z;
    const zOf = (y: number) => z0 + ((1 - (y + 0.5) / r.h) - 0.04) / 0.92 * (z1 - z0);
    fillLv(Pt, r, SK, (u, vv, x, y) => {
      const a = aOf(x), z = zOf(y);
      let l = M + (a / Math.PI - 0.5) * 2.2 + (Pt.n(r, x, y, 3, 2, 1) - 0.5) * 0.8;
      if (z > -0.02 && z < 0.12) l += Math.cos((z + 0.02) * 120) * 1.3 * gauss(a, 1.4, 0.45);
      l += gauss(a, Math.PI, 0.12) * (Math.cos(z * 150) > 0.3 ? 2 : -0.8);
      return l;
    });
    veins(r, 9);
    grime(r, (x) => (1 - aOf(x) / 1.2) * 0.9);
    for (let i = 0; i < 4; i++) { const x = rng.int(0, r.w - 1), y = rng.int(2, r.h - 3); Pt.walk(r, x, y, 4, 1, 0.3, 0xb87a7a, 0.6, 0.3); } // scrapes
  }
  // ---------------- head: veined dome of a skull, eye sockets bruised dark, a lipless slit
  {
    const r = Pt.R('HEAD');
    const aOf = (x: number) => ab(((x + 0.5) / r.w) * Math.PI * 2);
    fillLv(Pt, r, SK, (u, vv, x, y) => M + 0.6 + (aOf(x) / Math.PI - 0.5) * 1.6 + (Pt.n(r, x, y, 3, 2, 5) - 0.5) * 0.7 - (vv > 0.75 ? (vv - 0.75) * 6 : 0));
    // veins over the cranium, branching
    for (let i = 0; i < 7; i++) Pt.walk(r, rng.int(0, r.w - 1), rng.int(0, Math.floor(r.h * 0.5)), rng.int(8, 16), rng.float(-1, 1), 1, VEIN, 0.45, 0.7, 0.25);
    // bruised sockets around where the eyes sit
    for (const sd of [1, -1]) { const x = uOf(1.75, sd) * r.w, y = (1 - (0.04 + 0.92 * ((0.045 + 0.1) / 0.2))) * r.h; Pt.spot(r, x, y, 4, 3, 0x3a3a50, 0.7); }
    // the mouth slit, lipless, wide
    const ym = Math.round((1 - (0.04 + 0.92 * ((0.07 + 0.1) / 0.2))) * r.h);
    for (let a = 0; a < 1.2; a += 0.04) for (const sd of [1, -1]) { const x = uOf(a, sd) * r.w; Pt.set(r, x, ym + Math.round(a * 1.5), 0x2a1418); }
    grime(r, (x, y) => (1 - (y + 0.5) / r.h) < 0.2 ? 0.4 : 0);
  }
  {
    const r = Pt.R('JAW');
    fillLv(Pt, r, SK, (u, vv, x, y) => M - 0.5 + (Pt.n(r, x, y, 2, 2, 7) - 0.5) * 0.8);
    for (let x = 0; x < r.w; x++) for (let y = 0; y < r.h; y++) if (ab(((x + 0.5) / r.w) * Math.PI * 2) > 2.4) Pt.set(r, x, y, 0x3a1418);
  }
  // ---------------- needle teeth on a black gum
  {
    const r = Pt.R('TEETH');
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) Pt.set(r, x, y, y === 0 ? 0x4a1a1e : 0x120808);
    for (let x = 0; x < r.w; x += 2) { const L = r.h - (ph(x, 1, v) < 0.3 ? 2 : 1); for (let y = 1; y < L; y++) Pt.set(r, x, y, y === L - 1 ? 0xf4f0e0 : 0xd8d0c0); }
  }
  // ---------------- eyes: wet black, a dull green shine low in each, a white glint
  {
    const r = Pt.R('EYE');
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
      const u = (x + 0.5) / r.w, vv = 1 - (y + 0.5) / r.h;
      const du = Math.min(Math.abs(u - 0.0), Math.abs(u - 0.5), Math.abs(u - 1));
      let c = 0x060608;
      if (du < 0.1 && vv < 0.36 && vv > 0.22) c = du < 0.05 ? 0x3e6a4e : 0x1a2c22;
      Pt.set(r, x, y, c);
    }
    Pt.set(r, 1, 1, 0xffffff); Pt.set(r, 7, 1, 0xffffff); Pt.set(r, 2, 1, 0xa0a8b0); Pt.set(r, 8, 1, 0xa0a8b0);
  }
  // ---------------- limbs: bone knobs, tendons, grimy knees / elbows and palms
  const limb = (name: string, knobs: number[]) => {
    const r = Pt.R(name);
    fillLv(Pt, r, SK, (u, vv, x, y) => {
      let l = M + (Pt.n(r, x, y, 2, 2, 9) - 0.5) * 0.7 + Math.cos(u * Math.PI * 2) * 0.6;
      for (const k of knobs) l += gauss(vv, k, 0.05) * 1.8 - gauss(vv, k - 0.1, 0.03) * 1.2;
      return l;
    });
    veins(r, 2);
    grime(r, (x, y) => (knobs.some((k) => Math.abs((1 - (y + 0.5) / r.h) - k) < 0.1) ? 0.35 : 0) + ((y + 0.5) / r.h > 0.85 ? 0.25 : 0));
  };
  limb('LIMB_U', [0.03]); limb('LIMB_L', [0.96, 0.05]);
  {
    const r = Pt.R('HAND');
    fillLv(Pt, r, SK, (u, vv, x, y) => M - 0.5 + (Pt.n(r, x, y, 2, 2, 11) - 0.5) + vv * 1.2);
    for (let x = 0; x < r.w; x++) { Pt.set(r, x, r.h - 1, 0x4a3a30); if (x % 3 === 0) Pt.set(r, x, 0, 0xd8d0c8); } // dirty nails
    grime(r, () => 0.55);
  }
  {
    const r = Pt.R('TAIL');
    fillLv(Pt, r, SK, (u, vv, x, y) => M - 0.6 + Math.cos(u * Math.PI * 2) * 0.6 - (1 - vv) * 1.5 + (y % 4 === 0 ? -0.8 : 0));
    grime(r, (x, y) => ((y + 0.5) / r.h) * 0.7);
  }
  Pt.cut(Pt.R('CUT'), SK[8], { meat: 0x9a3030, fat: 0xe0d0c0, boneR: 0.36 });
  void mixHex; void scaleHex;
});

// ---------------------------------------------------------------- brain
function playerNear(c: Creature, x: number, z: number, r: number) {
  for (const p of CS().playersInZone(c.zoneKey)) if (dist(p.x, p.z, x, z) < r) return true;
  return false;
}
/** nearest vent no survivor is standing next to */
function pickVent(c: Creature, opts: { near?: boolean; awayFrom?: { x: number; z: number }; min?: number; max?: number } = {}): VentSpot | null {
  const vs = ventSpots(zoneOf(c)).filter((v) => !playerNear(c, v.x, v.z, 3));
  if (!vs.length) return null;
  if (opts.near) {
    let best: VentSpot | null = null, bd = opts.max ?? 18;
    for (const v of vs) {
      const d = dist(v.x, v.z, c.x, c.z);
      if (opts.awayFrom && dist(v.x, v.z, opts.awayFrom.x, opts.awayFrom.z) < dist(c.x, c.z, opts.awayFrom.x, opts.awayFrom.z) - 1) continue;
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }
  const far = vs.filter((v) => { const d = dist(v.x, v.z, c.x, c.z); return d >= (opts.min ?? 8) && d <= (opts.max ?? 45); });
  const list = far.length ? far : vs;
  return list[Math.floor(CS().rng.next() * list.length)];
}

type Loot = { kind: 'floor'; wi: any; x: number; z: number } | { kind: 'obj'; o: any; it: any; x: number; z: number } | { kind: 'trap'; o: any; x: number; z: number };
function findLoot(c: Creature): Loot | null {
  const z = zoneOf(c);
  // bait in a set trap is irresistible
  for (const o of objectsNear(z, c.x, c.z, 10, (o, d) => !!o.state?.armed && !!o.state?.bait && !o.state?.caught && !!d.tags?.includes('trap'), 4)) {
    if (!playerNear(c, o.x + 0.5, o.y + 0.5, 4)) return { kind: 'trap', o, x: o.x + 0.5, z: o.y + 0.5 };
  }
  let best: Loot | null = null, bd = 13;
  for (const wi of floorItemsAround(z, c.x, c.z, 13)) {
    if (isPrecious(wi.item) || itemWeight(wi.item) > 2.5) continue;
    if (playerNear(c, wi.x, wi.z, 5)) continue;
    const d = dist(wi.x, wi.z, c.x, c.z);
    if (d < bd) { bd = d; best = { kind: 'floor', wi, x: wi.x, z: wi.z }; }
  }
  if (best) return best;
  for (const o of objectsNear(z, c.x, c.z, 10, (o) => !!o.inv && o.inv.lootDone && o.inv.items.length > 0 && !o.inv.locked, 12)) {
    if (playerNear(c, o.x + 0.5, o.y + 0.5, 6)) continue;
    const it = o.inv.items.filter((i: any) => !isPrecious(i) && itemWeight(i) <= 2.5).sort((a: any, b: any) => (itemDef(b.key).value ?? 1) - (itemDef(a.key).value ?? 1))[0];
    if (it) return { kind: 'obj', o, it, x: o.x + 0.5, z: o.y + 0.5 };
  }
  return null;
}

function enterVent(c: Creature, from: VentSpot | null) {
  const z = zoneOf(c);
  const stash = (c.mem.stolen?.length ?? 0) >= 3 && c.mem.nest;
  const nest: VentSpot | undefined = stash ? ventSpots(z).find((v) => v.uid === c.mem.nest) : undefined;
  const to = nest && !playerNear(c, nest.x, nest.z, 6) ? nest : pickVent(c, { min: 8, max: 40 });
  if (from) { c.x = from.wx; c.z = from.wz; sfx(c, 'vent_clank', 0.8); }
  if (!c.mem.nest && from) c.mem.nest = from.uid;
  c.mem.route = to ? { fx: c.x, fz: c.z, to } : null;
  c.setState('travel'); stop(c);
  netSet(c, 'duct', 1);
}

function thinkVentling(c: Creature, dt: number): boolean {
  const cs = CS(), z = zoneOf(c);
  const ev = pulse(c);
  restoreStore(c, 'stolen');
  if (c.mem.stolen?.length && !nm(c).carry && !nm(c).duct) netSet(c, 'carry', c.mem.stolen[c.mem.stolen.length - 1].key);
  const hasVents = ventSpots(z).length > 0;
  instFlags(c, { immortal: !!nm(c).duct });
  const threat = nearestPlayer(c, 5, (p, d) => d < 2.2 || (c.awareness.get(p.id) ?? 0) > 0.5 || p.running);
  if (c.state !== 'travel' && c.state !== 'hide' && c.state !== 'flee' && c.attackPhase <= 0 && (threat || ev.staggered)) {
    c.setState('flee'); c.goal = null; cs.call(c, 'alert');
  }
  switch (c.state) {
    case 'travel': {
      netSet(c, 'duct', 1);
      const r = c.mem.route;
      if (!r) { c.setState('hide'); return true; }
      const tx = r.to.wx, tz = r.to.wz, d = dist(tx, tz, c.x, c.z), step = 4 * dt;
      if (d <= step) {
        c.x = tx; c.z = tz;
        c.setState('hide'); c.mem.hideFor = 4 + cs.rng.float(0, 14); c.mem.at = r.to;
        return true;
      }
      c.x += ((tx - c.x) / d) * step; c.z += ((tz - c.z) / d) * step;
      stop(c);
      if ((c.mem.clankT ?? 0) < G.time) { c.mem.clankT = G.time + 3 + cs.rng.float(0, 3); sfx(c, 'vent_clank', 0.35); }
      return true;
    }
    case 'hide': {
      stop(c);
      const at: VentSpot | undefined = c.mem.at;
      if (at) { c.x = at.wx; c.z = at.wz; }
      if (!hasVents) { netSet(c, 'duct', 0); if (c.stateT > (c.mem.hideFor ?? 6)) c.setState('wander'); return true; }
      netSet(c, 'duct', 1);
      if (c.stateT < (c.mem.hideFor ?? 6)) return true;
      if (!at || playerNear(c, at.x, at.z, 4)) { enterVent(c, null); return true; }
      // stash the hoard at the nest vent
      if ((c.mem.stolen?.length ?? 0) >= 3 && at.uid === c.mem.nest) { dropStored(c, 'stolen', at.x, at.z); netSet(c, 'carry', null); }
      c.x = at.x; c.z = at.z; faceTo(c, at.x + (at.x - at.wx), at.z + (at.z - at.wz), true);
      c.setState('emerge'); netSet(c, 'duct', 0); sfx(c, 'vent_clank', 0.9);
      return true;
    }
    case 'emerge': {
      stop(c); netSet(c, 'duct', 0);
      if (c.stateT > 0.7) { c.setState('wander'); c.goal = null; c.mem.look = null; }
      return true;
    }
    case 'wander':
    case 'idle':
    case 'investigate': {
      netSet(c, 'duct', 0);
      if (c.state !== 'investigate') {
        if ((c.mem.lookT ?? 0) < G.time) {
          c.mem.lookT = G.time + 1.2;
          const l = (c.mem.stolen?.length ?? 0) < 4 ? findLoot(c) : null;
          if (l) { c.mem.look = l; c.setState('investigate'); return true; }
        }
        if (c.noiseCooldown <= 0 && cs.rng.chance(dt * 0.15)) { cs.call(c, 'idle'); c.noiseCooldown = 5; }
        if (!c.goal || cs.moveTo(c, z, c.goal.x, c.goal.z, c.sp.walk, dt, 0.5)) c.goal = findSpot(c, { rMin: 2, rMax: 8, dark: 0.4 }) ?? cs.wanderSpot(c, z, 6);
        if (c.stateT > 14) {
          const v = pickVent(c, { near: true, max: 25 });
          if (v) { c.goal = { x: v.x, z: v.z }; c.mem.goVent = v; c.setState('flee'); }
          else c.stateT = 0;
        }
        return true;
      }
      const l: Loot | null = c.mem.look;
      if (!l || c.stateT > 15) { c.setState('wander'); return true; }
      if (cs.moveTo(c, z, l.x, l.z, c.sp.walk * 1.2, dt, l.kind === 'trap' ? 0.3 : 0.7)) {
        faceTo(c, l.x, l.z);
        if (l.kind === 'trap') {
          // snap
          if (l.o.state?.armed) {
            op('objState', { z: c.zoneKey, uid: l.o.uid, patch: { armed: false, bait: null } });
            sfx(c, 'wood_hit', 1); cs.call(c, 'hurt');
            cs.kill(c, z);
          } else c.setState('wander');
          return true;
        }
        let s: any = null;
        if (l.kind === 'floor') { if ([...floorItemsAround(z, l.x, l.z, 0.2)].includes(l.wi)) s = takeFloorItem(c, l.wi, 'stolen'); }
        else if (l.o.inv?.items.includes(l.it)) { s = takeObjItem(c, l.o, l.it, 'stolen'); sfx(c, 'rummage', 0.6); }
        if (s) { netSet(c, 'carry', s.key ?? null); cs.call(c, 'idle'); }
        // off to the vents with it
        const v = pickVent(c, { near: true, max: 30 });
        c.mem.goVent = v; c.goal = v ? { x: v.x, z: v.z } : null;
        c.setState('flee');
      }
      return true;
    }
    case 'flee': {
      netSet(c, 'duct', 0);
      const P = nearestPlayer(c, 12);
      if (!c.mem.goVent || (P && dist(c.mem.goVent.x, c.mem.goVent.z, P.p.x, P.p.z) < 2.5)) {
        c.mem.goVent = pickVent(c, { near: true, max: 25, awayFrom: P ? { x: P.p.x, z: P.p.z } : undefined });
        c.goal = c.mem.goVent ? { x: c.mem.goVent.x, z: c.mem.goVent.z } : (P ? cs.fleeSpot(c, z, P.p.x, P.p.z) : cs.wanderSpot(c, z, 10));
      }
      const v: VentSpot | null = c.mem.goVent;
      const g = c.goal ?? (v ? { x: v.x, z: v.z } : null);
      if (!g) { c.setState('wander'); return true; }
      if (cs.moveTo(c, z, g.x, g.z, c.sp.run, dt, 0.35)) {
        if (v) { enterVent(c, v); c.mem.goVent = null; }
        else { c.setState(hasVents ? 'wander' : 'hide'); c.mem.hideFor = 5 + cs.rng.float(0, 8); }
        return true;
      }
      // cornered: bite
      if (P && P.d < 1.0 && c.stateT > 2 && c.speed > 0 && c.attackT <= 0) attack(c, P.p);
      if (c.stateT > 12) { c.setState('wander'); c.mem.goVent = null; }
      return true;
    }
    default: {
      // first think, or a state set by the manager ('chase' after being hit, 'warn'...)
      if (c.state === 'chase' || c.state === 'warn') { c.setState('flee'); c.goal = null; return true; }
      c.setState('wander');
      return true;
    }
  }
}

onKilled('ventling', (c) => {
  // drop the haul somewhere a survivor can reach it (it may have died half inside a duct)
  const z = zoneOf(c);
  let x = c.x, zz = c.z;
  if (!walkable(z, Math.floor(x), Math.floor(zz))) {
    const at: VentSpot | undefined = c.mem.at ?? c.mem.route?.to;
    if (at) { x = at.x; zz = at.z; }
  }
  dropStored(c, 'stolen', x, zz);
  netSet(c, 'carry', null); netSet(c, 'duct', 0);
});

const sp = def({
  key: 'ventling', name: 'Ventling', code: 'E-28 // DUCT-SCAVENGER', temperament: 'skittish', threat: 1,
  rule: { name: 'COWARD AND THIEF', text: 'It flees when approached and only bites when cornered. It steals floor items into the vents; bait a box trap.' },
  hp: 14, walk: 1.7, run: 5.6, turn: 14, radius: 0.22, height: 0.35, sight: 12, fov: 1.8, hearing: 1.8, nightVision: true,
  attack: { dmg: [3, 6], range: 0.6, cooldown: 1.2, kinds: ['bite', 'scratch'], corrupt: 0.04, knock: 0.1, parts: ['hand_l', 'hand_r', 'farm_l', 'farm_r', 'shin_l', 'shin_r'] },
  zones: ['office', 'tunnels', 'mall', 'market', 'hospital'], weight: 2, group: [1, 2], maxPerZone: 4, diet: 'items',
  meat: [['meat_raw', 1]],
  flags: { vents: true, thief: true },
  sounds: { idle: 'ventling_chitter', alert: 'ventling_squeal', attack: 'ventling_squeal', hurt: 'ventling_squeal', death: 'ventling_die', step: 'pad' },
  scan: {
    cls: 'Scavenger / thief',
    notes: [
      'Pale, hairless, all eyes. Lives in the ductwork and travels vent to vent.',
      'Steals: anything small left on the floor, anything in a drawer you opened and walked away from.',
      'Cowardly. Runs for the nearest vent when approached and only bites when cornered.',
      'Cannot resist bait in a set box trap. Kill or catch it and it drops everything it carried.',
      'Missing things? Check under the vents. It keeps a hoard.',
    ],
  },
  gore: { blood: 'red', tint: 0xffd0d0, sever: ['armL', 'armR', 'legL', 'legR', 'tail'], head: 'head' },
  build: buildVentling,
  animate: animateVentling,
  think: thinkVentling,
});
(sp as any).handlesSevered = true;
sp.animateGallery = galleryDriver('ventling', ['walk', 'idle', 'flee', 'carry', 'attack', 'emerge', 'dead'], animateVentling, (pose, fc, t) => {
  fc.state = pose === 'walk' || pose === 'carry' ? 'wander' : pose === 'flee' ? 'flee' : pose === 'attack' ? 'attack' : pose === 'emerge' ? 'emerge' : pose === 'dead' ? 'dead' : 'idle';
  fc.speed = pose === 'walk' || pose === 'carry' ? 1.2 : pose === 'flee' ? 5 : 0;
  fc.dead = pose === 'dead';
  fc.attackPhase = pose === 'attack' && (t % 1.5) < 0.38 ? 0.2 : 0;
  fc.mem.net = { carry: pose === 'carry' ? 'soda_can' : null };
  if (pose === 'emerge' && (t % 2) < 1 / 60) fc.mem._et = 0;
});
