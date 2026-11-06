// ROCHELLE, specimen MR-00, the mutt roach: a cockroach the size of a fist
// from the Meridian's sump, mutated by the leak. Drawn as the real animal:
// a pale-rimmed pronotum shield over a small down-turned head, kidney-shaped
// compound eyes, palps and mandibles, long whip antennae of many segments,
// leathery wing cases with venation over a banded, segmented abdomen, cerci
// at the tail, and six articulated legs (coxa, spined femur, tibia, tarsus).
// The mutation: luminous nodules along the antennae, and a blister cluster
// that has split the right wing case, glowing (teal unless a commendation
// re-dyed it). Endearing by behaviour, not by face: she trots after her
// survivor, waves her antennae at you, sniffs out valuables and stands on
// point beside them, bolts from anything with teeth and comes back.
// The containment wing's first, easy pet (src/game/meridian.ts). Deployed,
// she never shoves anyone (no body push). Pet her (the companion menu's Pet)
// and she rears and flutters her antennae. She never spawns in the wild.
import * as THREE from 'three';
import { def, newRig, Rig } from '../species';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import type { Creature } from '../creature';
import { Page, bpart, registerPage, lerp, damp, ramp, V3 } from '../kit/beasts';
import { rot, skin, eye, flat } from '../kit/oddkit';
import { net, netOf, snd, hashId, rng, hold, face, fx, fxPoll, playAt, walkable } from '../behaviors_b';
import { floorItems } from '../../items/worldItems';
import { itemValue } from '../../game/debt/values';

const PG = registerPage(new Page('c_roachpg', 64, 64, [
  ['SHELL', 24, 16], ['WING', 16, 32], ['BELLY', 16, 16], ['HEAD', 12, 12], ['EYE', 8, 8], ['LEG', 8, 16], ['MOUTH', 6, 6], ['WOUND', 8, 8],
  ['HATP', 10, 10], ['HATC', 6, 6], ['HATH', 8, 8], ['HATB', 6, 6],
], 1));
PG.paint((P) => {
  // the pronotum: glossy chestnut, darker in the middle, a pale yellow rim, a sheen line
  { const r = P.R('SHELL'); skin(P, r, ramp(0x6a3214, 7, 0x1a0804, 0.45), { mott: 0.8, salt: 3 });
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) { const e = Math.max(Math.abs(x + 0.5 - r.w / 2) / (r.w / 2), Math.abs(y + 0.5 - r.h / 2) / (r.h / 2)); if (e > 0.82) P.set(r, x, y, e > 0.94 ? 0x8a6a2a : 0xd8b85a); else if (e < 0.35) P.set(r, x, y, 0x2a1006); }
    P.glint(r, 5, 3, 7, 0xfff0d0, 0.55); }
  // the wing cases: translucent-looking amber-brown with dark veins running back, a glossy edge
  { const r = P.R('WING'); skin(P, r, ramp(0x8a4a1c, 7, 0x2a1006, 0.5), { mott: 0.6, salt: 5 });
    for (let k = 0; k < 6; k++) P.walk(r, 2 + k * 2.4, 0, r.h, 0.08 * (k - 2.5), 1, 0x3a1808, 0.7, 0.3, 0.15);
    for (let y = 0; y < r.h; y++) P.blend(r, r.w - 1, y, 0xffe0a0, 0.5);
    P.glint(r, 3, 4, 4, 0xffffff, 0.5); P.glint(r, 9, 14, 3, 0xffffff, 0.35); }
  // the abdomen: banded segments, cream joints
  { const r = P.R('BELLY'); skin(P, r, ramp(0x7a4220, 6, 0x24100a, 0.4), { mott: 0.5, salt: 7 }); for (let y = 0; y < r.h; y++) if (y % 4 === 3) for (let x = 0; x < r.w; x++) P.set(r, x, y, 0xc89a5a); }
  skin(P, P.R('HEAD'), ramp(0x4a220e, 6, 0x140604, 0.4), { mott: 0.5, salt: 9 });
  eye(P, P.R('EYE'), 0x14100c, { pupil: 0x050302, sclera: 0x1a120c });
  { const r = P.R('EYE'); for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) if ((x + y) % 2 === 0) P.blend(r, x, y, 0x3a2a1a, 0.4); }
  flat(P, P.R('LEG'), 0x5a2c12, 0.12);
  { const r = P.R('LEG'); for (let y = 1; y < r.h; y += 3) P.set(r, r.w - 1, y, 0x1a0804); }
  flat(P, P.R('MOUTH'), 0x2a120a, 0.05);
  { const r = P.R('WOUND'); for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) P.set(r, x, y, (x * 7 + y * 3) % 5 < 2 ? 0xc8ffe8 : 0x3a8a6a); }
  { const r = P.R('HATP'); for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) P.set(r, x, y, (x + y) % 6 < 3 ? 0xd83a8a : 0x4ac8d8); }
  flat(P, P.R('HATC'), 0xd8a83a, 0.04);
  flat(P, P.R('HATH'), 0xe8c41a, 0.04);
  flat(P, P.R('HATB'), 0xc82a3a, 0.04);
});

const HATS = ['hat_party', 'hat_crown', 'hat_hard', 'hat_bow'];
const TINTS: Record<string, number> = { tint_teal: 0x4affc8, tint_pink: 0xff6ad8, tint_gold: 0xffc23a, tint_violet: 0xa87aff };

function glowBulb(parent: THREE.Object3D, mat: THREE.Material, at: V3, r: number, detail = 1) {
  const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, detail), mat);
  m.position.set(at[0], at[1], at[2]);
  m.userData.noGlow = true;
  parent.add(m);
  return m;
}
/** a whip antenna: many short segments, tapering, curving out and back */
function antennaPath(k: number): V3[] {
  const out: V3[] = [];
  for (let i = 0; i <= 14; i++) { const u = i / 14; out.push([k * (0.02 + u * 0.13 + Math.sin(u * 2.2) * 0.03), 0.01 + Math.sin(u * 2.6) * 0.07, 0.01 + u * 0.2 - u * u * 0.16]); }
  return out;
}
const LEGS: { s: 'L' | 'R'; k: 1 | -1; i: number; z: number; yaw: number; fem: number; tib: number }[] = [];
for (const [s, k] of [['L', 1], ['R', -1]] as const) for (let i = 0; i < 3; i++) LEGS.push({ s, k, i, z: 0.07 - i * 0.06, yaw: [0.55, 0.05, -0.55][i], fem: [0.07, 0.08, 0.1][i], tib: [0.07, 0.09, 0.13][i] });

function buildRoach(): Rig {
  const rig = newRig(0.2);
  const glow = new THREE.MeshBasicMaterial({ color: TINTS.tint_teal, toneMapped: false });
  rig.root.userData.glowMat = glow;
  // the abdomen: five banded segments tapering back, under the wing cases
  const body = bpart(rig, 'shell', rig.body, [0, 0.07, 0], PG, 'rbody', (ob) => {
    for (let i = 0; i < 6; i++) ob.blob([0, -0.004 - i * 0.002, 0.02 - i * 0.04], [0.085 - i * 0.008, 0.032 - i * 0.003, 0.03], 12, 6, PG.reg('BELLY'));
    // the thorax under the shield, the cerci at the tail
    ob.blob([0, 0.002, 0.07], [0.07, 0.03, 0.045], 12, 6, PG.reg('BELLY'));
    for (const k of [-1, 1]) ob.cone([k * 0.02, 0.0, -0.2], [k * 0.35, 0.1, -1], 0.008, 0.05, 4, PG.reg('LEG'));
  });
  // the pronotum shield and the two wing cases (the right one split by the mutation)
  bpart(rig, 'pronotum', body, [0, 0.03, 0.085], PG, 'rpron', (ob) => ob.blob([0, 0, 0], [0.085, 0.022, 0.06], 14, 6, PG.reg('SHELL'), { rot: [-0.12, 0, 0] }));
  bpart(rig, 'wingL', body, [0.02, 0.028, 0.035], PG, 'rwingL', (ob) => ob.blob([0.02, 0, -0.1], [0.05, 0.012, 0.135], 10, 5, PG.reg('WING'), { rot: [0.05, 0.08, 0] }));
  const wr = bpart(rig, 'wingR', body, [-0.02, 0.028, 0.035], PG, 'rwingR', (ob) => {
    ob.blob([-0.022, 0, -0.1], [0.05, 0.012, 0.135], 10, 5, PG.reg('WING'), { rot: [0.05, -0.12, 0.2] });
    ob.blob([-0.03, 0.006, -0.09], [0.026, 0.01, 0.045], 8, 4, PG.reg('WOUND'), { emis: 0.6 });
  });
  // the mutation: a blister cluster pushing through the split case, glowing
  glowBulb(wr, glow, [-0.03, 0.02, -0.09], 0.02, 1);
  glowBulb(wr, glow, [-0.045, 0.016, -0.11], 0.012, 1);
  glowBulb(wr, glow, [-0.018, 0.017, -0.115], 0.01, 1);
  glowBulb(wr, glow, [-0.036, 0.014, -0.065], 0.008, 0);
  // the head: tucked under the shield, turned down; compound eyes, palps, mandibles
  const head = bpart(rig, 'head', body, [0, 0.0, 0.13], PG, 'rhead', (ob) => {
    ob.blob([0, -0.012, 0.012], [0.035, 0.032, 0.026], 10, 6, PG.reg('HEAD'), { rot: [0.5, 0, 0] });
    for (const k of [-1, 1]) {
      ob.blob([k * 0.026, 0.002, 0.012], [0.012, 0.022, 0.014], 8, 5, PG.reg('EYE'), { rot: [0.3, 0, k * 0.2] });
      ob.cone([k * 0.01, -0.036, 0.022], [k * 0.4, -0.6, 0.7], 0.007, 0.022, 4, PG.reg('MOUTH'));
      ob.tube([[k * 0.018, -0.03, 0.018], [k * 0.03, -0.045, 0.034], [k * 0.026, -0.058, 0.05], [k * 0.02, -0.064, 0.058]], [0.004, 0.0035, 0.003, 0.0025], 4, PG.reg('LEG'), { start: 'flat', end: 'pole' });
    }
  });
  for (const [s, k] of [['L', 1], ['R', -1]] as const) {
    const ant = bpart(rig, 'ant' + s, head, [k * 0.012, 0.012, 0.026], PG, 'rant' + s, (ob) => ob.tube(antennaPath(k), antennaPath(k).map((_, i) => 0.0045 - i * 0.00026), 4, PG.reg('LEG'), { start: 'flat', end: 'pole' }));
    const path = antennaPath(k);
    for (const j of [5, 9]) glowBulb(ant, glow, path[j], 0.0055 - j * 0.0002, 0);
    glowBulb(ant, glow, path[14], 0.007, 1);
  }
  // six legs: spined femur off the coxa, then tibia and tarsus (a knee to bend)
  for (const L of LEGS) {
    const k = L.k;
    bpart(rig, `leg${L.s}${L.i}`, body, [k * 0.05, -0.012, L.z], PG, `rfem${L.s}${L.i}`, (ob) => {
      ob.blob([0, 0, 0], [0.016, 0.012, 0.014], 6, 4, PG.reg('LEG'));
      ob.tube([[0, 0, 0], [k * 0.5 * L.fem, 0.02, 0], [k * L.fem, 0.012, 0]], [0.009, 0.008, 0.006], 5, PG.reg('LEG'), { start: 'flat', end: 'flat' });
      for (let q = 1; q <= 3; q++) ob.cone([k * q * L.fem * 0.25, 0.006, 0.005], [k * 0.2, -0.2, 1], 0.0025, 0.012, 3, PG.reg('MOUTH'));
    });
    bpart(rig, `shin${L.s}${L.i}`, rig.parts[`leg${L.s}${L.i}`], [k * L.fem, 0.012, 0], PG, `rtib${L.s}${L.i}`, (ob) => {
      ob.tube([[0, 0, 0], [k * L.tib * 0.45, -0.035, 0], [k * L.tib * 0.8, -0.06, 0], [k * L.tib, -0.068, 0.004]], [0.006, 0.005, 0.004, 0.003], 4, PG.reg('LEG'), { start: 'flat', end: 'pole' });
      for (let q = 1; q <= 4; q++) ob.cone([k * q * L.tib * 0.17, -0.015 * q, 0.004], [k * 0.1, 0.4, 1], 0.002, 0.014, 3, PG.reg('MOUTH'));
    });
  }
  // the hats (commendation rewards): on the pronotum, hidden until worn
  bpart(rig, 'hat_party', head, [0, 0.045, 0.0], PG, 'rhparty', (ob) => { ob.cone([0, 0, 0], [0.1, 1, 0], 0.024, 0.07, 8, PG.reg('HATP')); ob.blob([0.007, 0.07, 0], [0.01, 0.01, 0.01], 6, 4, PG.reg('HATC')); });
  bpart(rig, 'hat_crown', head, [0, 0.042, -0.005], PG, 'rhcrown', (ob) => {
    ob.tube([[0, 0, 0], [0, 0.018, 0]], [0.028, 0.03], 10, PG.reg('HATC'), { start: null, end: null });
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; ob.cone([Math.cos(a) * 0.026, 0.016, Math.sin(a) * 0.026], [0, 1, 0], 0.008, 0.02, 4, PG.reg('HATC')); }
  });
  bpart(rig, 'hat_hard', head, [0, 0.035, -0.005], PG, 'rhhard', (ob) => { ob.blob([0, 0.012, 0], [0.042, 0.028, 0.042], 10, 5, PG.reg('HATH'), { v1: 0.55 }); ob.blob([0, 0.007, 0.012], [0.05, 0.005, 0.055], 10, 3, PG.reg('HATH')); });
  bpart(rig, 'hat_bow', head, [0, 0.045, -0.005], PG, 'rhbow', (ob) => { for (const k of [-1, 1]) ob.blob([k * 0.022, 0.01, 0], [0.021, 0.014, 0.009], 8, 4, PG.reg('HATB'), { rot: [0, 0, k * 0.4] }); ob.blob([0, 0.01, 0], [0.009, 0.009, 0.009], 6, 4, PG.reg('HATB')); });
  for (const h of HATS) rig.parts[h].visible = false;
  // a touch larger than life, so she reads at the game's camera distance
  rig.body.scale.setScalar(1.35);
  return rig;
}

function animateRoach(rig: Rig, c: Creature, t: number, dt: number) {
  const ud = rig.root.userData as Record<string, any>;
  const n = netOf(c);
  const seed = hashId(c.id) * 0.001;
  // the look: a hat, the glow colour
  if (ud.hat !== n.hat) { ud.hat = n.hat; for (const h of HATS) if (rig.parts[h]) rig.parts[h].visible = h === n.hat; }
  const glow = ud.glowMat as THREE.MeshBasicMaterial;
  const base = TINTS[n.tint as string] ?? TINTS.tint_teal;
  const pose = c.dead ? '' : (n.pose as string) || '';
  const k = (name: string, target: number, rate = 7) => (ud[name] = lerp(ud[name] ?? 0, target, damp(rate, dt)));
  const point = k('pp', pose === 'point' ? 1 : 0, 6), happy = k('ph', pose === 'happy' ? 1 : 0, 9), scared = k('ps', pose === 'scared' || c.state === 'flee' ? 1 : 0, 10);
  // the mutation breathes light; on point it pulses hard
  if (glow) { glow.color.setHex(base); glow.color.multiplyScalar(0.9 + Math.sin(t * 1.7 + seed) * 0.3 + point * (0.8 + Math.sin(t * 12) * 0.6)); }
  const sh = fxPoll(rig, c);
  if (sh && G.audio) playAt(sh.key, c, sh.a.v ?? 0.5, sh.a.r ?? 12, sh.a.rate ?? 1.35);
  const moving = c.speed > 0.15, ph = (c.phase || 0) * 1.8 + (moving ? 0 : 0);
  // body: low and flat when scared, front up on point, a little rear and turn when petted
  rig.body.position.y = -scared * 0.012 + happy * Math.abs(Math.sin(t * 7)) * 0.02 + (moving ? Math.abs(Math.sin(ph * 2)) * 0.004 : 0);
  rig.body.rotation.y = happy * Math.sin(t * 4) * 0.35;
  rot(rig, 'shell', -point * 0.28 - happy * 0.2 * Math.max(0, Math.sin(t * 7)), 0, moving ? Math.sin(ph * 2) * 0.03 : Math.sin(t * 0.8 + seed) * 0.012);
  rot(rig, 'head', point * 0.2 - scared * 0.25 + Math.sin(t * 0.7 + seed) * 0.05, Math.sin(t * 0.5 + seed * 2) * 0.18 * (1 - point - scared), 0);
  // the wing cases breathe; the split one twitches over the blister
  rot(rig, 'wingL', Math.sin(t * 1.9) * 0.012, 0, 0);
  rot(rig, 'wingR', Math.sin(t * 1.9) * 0.012 + (Math.sin(t * 13 + seed) > 0.96 ? 0.06 : 0), 0, -0.02);
  // antennae never stop: slow independent sweeps, a fast flutter when petted, flat back when scared, forward on point
  for (const [s, kk] of [['L', 1], ['R', -1]] as const) {
    const sweep = Math.sin(t * (1.3 + kk * 0.27) + seed * 3 + kk) * 0.5 + Math.sin(t * 3.7 + kk * 2) * 0.15;
    const flutter = happy * Math.sin(t * 30 + kk) * 0.25;
    rot(rig, 'ant' + s, 0.15 + point * 0.4 - scared * 0.7 + Math.sin(t * 1.1 + kk) * 0.15 + flutter, kk * (sweep * (1 - point * 0.7)) * 0.6 - kk * scared * 0.6, 0);
  }
  // tripod gait: front and hind on one side move with the middle leg on the other; legs splay when flat and scared
  for (const L of LEGS) {
    const phase = ph * 2 + ((L.i % 2 === 0) === (L.k > 0) ? 0 : Math.PI);
    const sw = moving ? Math.sin(phase) * 0.55 : Math.sin(t * 0.9 + L.i + L.k) * 0.03;
    const lift = moving ? Math.max(0, Math.cos(phase)) * 0.5 : 0;
    // left legs reach +x, right legs -x: yaw forward and the roll that lifts a foot flip sign with the side
    rot(rig, `leg${L.s}${L.i}`, 0, -L.k * (L.yaw + sw), L.k * (-0.15 + lift + scared * 0.25 - point * (L.i === 0 ? 0.3 : 0)));
    rot(rig, `shin${L.s}${L.i}`, 0, 0, L.k * (-0.05 - lift * 0.6 + scared * 0.2));
  }
}

// ---------------------------------------------------------------- the pet
const THREATS = new Set(['hostile', 'stalker', 'ambush', 'territorial']);
function scare(c: Creature, fromX: number, fromZ: number, why: string) {
  const m = c.mem;
  if ((m.scareT ?? 0) > -6) return;
  const z = G.getZone(c.zoneKey);
  m.scareT = 9;
  m.sniff = null;
  c.goal = G.creatures?.fleeSpot?.(c, z, fromX, fromZ) ?? null;
  c.setState('flee');
  net(c).pose = 'scared';
  fx(c, 'ventling_squeal', { v: 0.5, r: 14, rate: 1.5 });
  const owner = c.tamedBy ? G.players.get(c.tamedBy) : null;
  bus.emit('petScared', c, owner, why);
}
/** a valuable on the floor near the survivor that nobody has pointed out yet */
function sniffFor(c: Creature, ox: number, oz: number) {
  const z = G.getZone(c.zoneKey);
  const seen: number[] = c.mem.pinged || (c.mem.pinged = []);
  let best: { uid: number; x: number; z: number } | null = null, bv = 0;
  for (const [uid, w] of floorItems(z)) {
    if (seen.includes(uid)) continue;
    const d = Math.hypot(w.x - ox, w.z - oz);
    if (d > 9) continue;
    let v = 0; try { v = itemValue(w.item); } catch { v = 0; }
    if (v >= 15 && v / (1 + d * 0.15) > bv) { bv = v / (1 + d * 0.15); best = { uid, x: w.x, z: w.z }; }
  }
  return best;
}
function thinkRoach(c: Creature, dt: number): boolean {
  const m = c.mem, n = net(c), cs = G.creatures;
  if (m.hat !== undefined && n.hat !== m.hat) n.hat = m.hat;
  if (m.tint !== undefined && n.tint !== m.tint) n.tint = m.tint;
  const owner = c.tamedBy ? G.players.get(c.tamedBy) : null;
  const z = G.getZone(c.zoneKey);
  if (!owner || owner.zoneKey !== c.zoneKey || owner.body.dead) { hold(c); c.setState('idle'); n.pose = ''; return true; }
  m.scareT = (m.scareT ?? -10) - dt;
  m.lookT = (m.lookT ?? 0) - dt;
  // hurt: she bolts
  if ((m.hp0 ?? c.hp) > c.hp) scare(c, owner.x, owner.z, 'hit');
  m.hp0 = c.hp;
  if (m.lookT <= 0) {
    m.lookT = 0.3;
    for (const o of cs.creatures.values()) {
      if (o === c || o.dead || o.zoneKey !== c.zoneKey || o.tamedBy || !THREATS.has(o.sp.temperament) || (o.sp.threat ?? 0) < 2) continue;
      if (Math.hypot(o.x - c.x, o.z - c.z) < 5) { scare(c, o.x, o.z, 'monster'); break; }
    }
    for (const nz of cs.noises) if (nz.zone === c.zoneKey && nz.radius >= 20 && Math.hypot(nz.x - c.x, nz.z - c.z) < 7) { scare(c, nz.x, nz.z, 'noise'); break; }
  }
  if (m.scareT > 0) {
    n.pose = 'scared';
    if (c.goal && !cs.moveTo(c, z, c.goal.x, c.goal.z, c.sp.run, dt, 0.4)) return true;
    hold(c); c.goal = null;
    return true;
  }
  if (c.state === 'flee') c.setState('idle');
  const d = Math.hypot(owner.x - c.x, owner.z - c.z);
  // too far behind (a door, a stair): she catches up at a scuttle you do not see
  if (d > 14) { const p = near(z, owner.x, owner.z); if (p) { c.x = p.x; c.z = p.z; } }
  if (m.stay) { hold(c); n.pose = ''; return true; }
  // the happy hop after a pat
  if ((m.happyT = (m.happyT ?? 0) - dt) > 0) { hold(c); n.pose = 'happy'; return true; }
  // sniffing out valuables
  m.sniffT = (m.sniffT ?? rng.float(3, 6)) - dt;
  if (!m.sniff && m.sniffT <= 0) { m.sniffT = rng.float(5, 9); const s = sniffFor(c, owner.x, owner.z); if (s) { m.sniff = s; m.pointT = 0; fx(c, 'ventling_chitter', { v: 0.45, r: 12, rate: 1.6 }); } }
  if (m.sniff) {
    const s = m.sniff as { uid: number; x: number; z: number; };
    const still = floorItems(z).get(s.uid);
    if (!still || Math.hypot(owner.x - s.x, owner.z - s.z) > 14 || c.stateT > 25) { m.sniff = null; n.pose = ''; c.setState('idle'); return true; }
    if (c.state !== 'investigate') c.setState('investigate');
    if (cs.moveTo(c, z, s.x, s.z, c.sp.walk * 1.4, dt, 0.45)) {
      hold(c); face(c, s.x, s.z);
      if ((m.pointT = (m.pointT ?? 0) + dt) === dt) { (m.pinged as number[]).push(s.uid); if ((m.pinged as number[]).length > 60) (m.pinged as number[]).shift(); fx(c, 'remit_chirp', { v: 0.6, r: 16, rate: 1.4 }); bus.emit('petFound', c, owner, s); }
      n.pose = 'point';
      if (m.pointT > 4.5) { m.sniff = null; n.pose = ''; c.setState('idle'); }
    } else n.pose = '';
    return true;
  }
  // follow: a step behind, off to the side, never underfoot
  n.pose = '';
  const side = (hashId(c.id) % 2 ? 1 : -1) * 0.9;
  const bx = owner.x - Math.cos(owner.facing) * 1.3 - Math.sin(owner.facing) * side, bz = owner.z - Math.sin(owner.facing) * 1.3 + Math.cos(owner.facing) * side;
  const gd = Math.hypot(bx - c.x, bz - c.z);
  if (d > 2.4 || (gd > 1.2 && owner.speed < 0.1 && d > 1.4)) {
    if (c.state !== 'follow') c.setState('follow');
    cs.moveTo(c, z, d > 2.4 ? owner.x : bx, d > 2.4 ? owner.z : bz, d > 5 ? c.sp.run : Math.max(c.sp.walk, owner.speed * 1.05), dt, d > 2.4 ? 1.6 : 0.3);
  } else {
    hold(c);
    if (c.state !== 'idle') c.setState('idle');
    if (rng.chance(dt * 0.5)) face(c, owner.x, owner.z);
  }
  return true;
}
function near(z: any, x: number, zz: number): { x: number; z: number } | null {
  for (let r = 1; r < 4; r++) for (let a = 0; a < 8; a++) {
    const tx = Math.floor(x + Math.cos(a * 0.785) * r), ty = Math.floor(zz + Math.sin(a * 0.785) * r);
    if (walkable(z, tx, ty)) return { x: tx + 0.5, z: ty + 0.5 };
  }
  return null;
}

// a pat: the happy hop (the companion menu's Pet emits 'petPetted')
bus.on('petPetted', (_p: any, c: Creature) => { if (c?.sp?.key === 'mutt_roach' && !c.dead) { c.mem.happyT = 1.6; fx(c, 'cower_squeak', { v: 0.5, r: 10, rate: 1.5 }); } });

export const ROACH = def({
  key: 'mutt_roach', name: 'Rochelle', code: 'MR-00 // MUTT ROACH', temperament: 'peaceful', threat: 0,
  hp: 12, walk: 1.9, run: 5.2, turn: 16, radius: 0.12, height: 0.3, sight: 12, fov: 2.8, hearing: 1.4,
  rule: { name: 'GOOD GIRL', text: 'She follows, she sniffs out valuables and stands on point by them, and she bolts from anything with teeth. She comes back.' },
  zones: [], weight: 0, diet: 'items',
  flags: { companion: true, noCorpse: true },
  sounds: snd({ idle: 'ventling_chitter', alert: 'cower_squeak', hurt: 'ventling_squeal', death: 'ventling_die' }),
  scan: { cls: 'Mutated cockroach / harmless / pet', notes: ['Fist-sized, chunky, all eyes. A sump roach the leak made soft and round. The antenna bulbs and the blister glow.', 'Follows the survivor who brought her, sniffs out valuables and stands on point beside them.', 'Bolts from monsters and loud noises; she comes back once it is quiet.'] },
  gore: { blood: 'glow', flesh: 0x9a4a22, gib: false },
  remains: 'none',
  build: buildRoach, animate: animateRoach, think: thinkRoach,
});
ROACH.animateGallery = (rig: Rig, t: number) => {
  const ud = rig.root.userData;
  const fc: any = ud.fake || (ud.fake = { id: 'g-roach', x: 0, z: 0, facing: 0, speed: 0, state: 'idle', mem: { netMem: {} }, phase: 0, dead: false, stateT: 0 });
  const pose = Math.floor(t / 4) % 4;
  fc.mem.netMem.pose = pose === 1 ? 'happy' : pose === 2 ? 'point' : '';
  fc.speed = pose === 3 ? 1.5 : 0; fc.phase += fc.speed / 60 * 8;
  animateRoach(rig, fc, t, 1 / 60);
};
