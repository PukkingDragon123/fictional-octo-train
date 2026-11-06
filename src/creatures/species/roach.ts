// ROCHELLE, specimen MR-00, the mutt roach: a chunky, fist-sized cockroach
// from the Meridian's sump that came out of the leak rounder, softer and
// friendlier than anything with six legs has a right to be. Huge glossy eyes
// with two glints each, pink cheeks, a little smile, a chestnut carapace
// with cream stripes, and the mutation: bulbs on the antennae and a blister
// on the back that glow (teal, unless an achievement re-dyed it).
// The containment wing's first, easy pet (src/game/meridian.ts). Deployed,
// she trots after her survivor, never in the way (no body push), sniffs out
// valuables on the floor nearby and stands on point beside them, glowing.
// Something dangerous close, a loud bang, a slap: she bolts and hides, then
// comes back. Pet her (the companion menu's Pet) and she does a happy hop.
// She never spawns in the wild (no zones, no weight).
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
  ['SHELL', 32, 24], ['HEAD', 20, 16], ['BELLY', 12, 12], ['EYE', 12, 12], ['LEG', 6, 12], ['PINK', 6, 6], ['INK', 6, 6], ['HATP', 12, 12], ['HATC', 8, 8], ['HATH', 10, 10], ['HATB', 8, 8], ['CREAM', 6, 6],
], 1));
PG.paint((P) => {
  // the carapace: glossy chestnut with three cream bands and a bright window highlight
  const R = ramp(0x9a4a22, 7, 0x3a1608, 0.5);
  skin(P, P.R('SHELL'), R, { mott: 0.9, salt: 3 });
  { const r = P.R('SHELL'); for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) { if (y % 6 === 4) P.set(r, x, y, 0xf0d8a8); if (y % 6 === 5) P.set(r, x, y, 0x5a2410); } P.glint(r, 6, 3, 6, 0xffffff, 0.75); P.glint(r, 22, 3, 5, 0xffffff, 0.75); }
  skin(P, P.R('HEAD'), ramp(0xb8642e, 6, 0x4a2010, 0.5), { mott: 0.7, salt: 5 });
  skin(P, P.R('BELLY'), ramp(0xe8c890, 5, 0x8a6040, 0.4), { mott: 0.6, salt: 7 });
  eye(P, P.R('EYE'), 0x1a2a3a, { pupil: 0x05060a, sclera: 0x101820 });
  { const r = P.R('EYE'); P.spot(r, 8, 8, 0.8, 0.8, 0xffffff, 0.9); }
  flat(P, P.R('LEG'), 0x5a2a14, 0.05);
  flat(P, P.R('PINK'), 0xff7aa8, 0.02);
  flat(P, P.R('INK'), 0x1a0a08, 0.02);
  flat(P, P.R('CREAM'), 0xf4e4c0, 0.02);
  { const r = P.R('HATP'); for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) P.set(r, x, y, (x + y) % 6 < 3 ? 0xff4ab0 : 0x7af0ff); }
  flat(P, P.R('HATC'), 0xffc83a, 0.04);
  flat(P, P.R('HATH'), 0xffd21a, 0.04);
  flat(P, P.R('HATB'), 0xff2a4a, 0.04);
});

const HATS = ['hat_party', 'hat_crown', 'hat_hard', 'hat_bow'];
const TINTS: Record<string, number> = { tint_teal: 0x4affc8, tint_pink: 0xff6ad8, tint_gold: 0xffc23a, tint_violet: 0xa87aff };

function glowBulb(parent: THREE.Object3D, mat: THREE.Material, at: V3, r: number) {
  const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), mat);
  m.position.set(at[0], at[1], at[2]);
  m.userData.noGlow = true;
  parent.add(m);
  return m;
}

function buildRoach(): Rig {
  const rig = newRig(0.3);
  const glow = new THREE.MeshBasicMaterial({ color: TINTS.tint_teal, toneMapped: false });
  rig.root.userData.glowMat = glow;
  const body = bpart(rig, 'shell', rig.body, [0, 0.135, 0], PG, 'rshell', (ob) => {
    ob.blob([0, 0, -0.01], [0.135, 0.09, 0.19], 12, 8, PG.reg('SHELL'));
    ob.blob([0, -0.045, 0], [0.115, 0.04, 0.16], 10, 4, PG.reg('BELLY'));
  });
  // the mutation: a glowing blister and two seed bumps on the back
  glowBulb(body, glow, [0.035, 0.085, -0.05], 0.034);
  glowBulb(body, glow, [-0.045, 0.07, -0.1], 0.018);
  glowBulb(body, glow, [-0.02, 0.08, 0.03], 0.014);
  const head = bpart(rig, 'head', body, [0, 0.025, 0.17], PG, 'rhead', (ob) => {
    ob.blob([0, 0.01, 0.02], [0.105, 0.09, 0.09], 12, 8, PG.reg('HEAD'));
    for (const s of [-1, 1]) ob.blob([s * 0.075, -0.025, 0.075], [0.022, 0.014, 0.01], 6, 4, PG.reg('PINK'));
    ob.blob([0, -0.042, 0.098], [0.026, 0.009, 0.008], 6, 3, PG.reg('INK'));
    for (const s of [-1, 1]) ob.cone([s * 0.03, -0.06, 0.07], [s * 0.3, -1, 0.6], 0.012, 0.035, 4, PG.reg('LEG'));
  });
  for (const [s, k] of [['L', 1], ['R', -1]] as const) {
    bpart(rig, 'eye' + s, head, [k * 0.045, 0.03, 0.085], PG, 'reye', (ob) => ob.blob([0, 0, 0], [0.04, 0.046, 0.026], 10, 6, PG.reg('EYE'), { emis: 0.25 }));
    const ant = bpart(rig, 'ant' + s, head, [k * 0.035, 0.085, 0.04], PG, 'rant' + s, (ob) => ob.tube([[0, 0, 0], [k * 0.02, 0.07, 0.03], [k * 0.055, 0.13, 0.0], [k * 0.08, 0.16, -0.04]], [0.008, 0.007, 0.006, 0.005], 4, PG.reg('LEG'), { start: 'flat', end: 'pole' }));
    glowBulb(ant, glow, [k * 0.08, 0.16, -0.04], 0.022);
    for (let i = 0; i < 3; i++) {
      bpart(rig, `leg${s}${i}`, body, [k * 0.1, -0.035, 0.09 - i * 0.09], PG, 'rleg' + s, (ob) => ob.tube([[0, 0, 0], [k * 0.07, 0.025, 0], [k * 0.12, -0.075, 0.01]], [0.016, 0.013, 0.01], 4, PG.reg('LEG'), { start: 'flat', end: 'pole' }));
    }
  }
  // the hats (achievement rewards), on the crown of the head, hidden until worn
  bpart(rig, 'hat_party', head, [0, 0.09, 0.01], PG, 'rhparty', (ob) => { ob.cone([0, 0, 0], [0.1, 1, 0], 0.045, 0.12, 8, PG.reg('HATP')); ob.blob([0.012, 0.12, 0], [0.018, 0.018, 0.018], 6, 4, PG.reg('HATC')); });
  bpart(rig, 'hat_crown', head, [0, 0.085, 0.01], PG, 'rhcrown', (ob) => {
    ob.tube([[0, 0, 0], [0, 0.03, 0]], [0.05, 0.052], 10, PG.reg('HATC'), { start: null, end: null });
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; ob.cone([Math.cos(a) * 0.046, 0.028, Math.sin(a) * 0.046], [0, 1, 0], 0.014, 0.035, 4, PG.reg('HATC')); }
    ob.blob([0, 0.016, 0.05], [0.01, 0.01, 0.006], 5, 3, PG.reg('HATB'));
  });
  bpart(rig, 'hat_hard', head, [0, 0.07, 0.0], PG, 'rhhard', (ob) => { ob.blob([0, 0.02, 0], [0.075, 0.05, 0.075], 10, 5, PG.reg('HATH'), { v1: 0.55 }); ob.blob([0, 0.012, 0.02], [0.09, 0.008, 0.095], 10, 3, PG.reg('HATH')); });
  bpart(rig, 'hat_bow', head, [0, 0.09, 0.0], PG, 'rhbow', (ob) => { for (const s of [-1, 1]) ob.blob([s * 0.04, 0.02, 0], [0.038, 0.026, 0.016], 8, 4, PG.reg('HATB'), { rot: [0, 0, s * 0.4] }); ob.blob([0, 0.02, 0], [0.016, 0.016, 0.016], 6, 4, PG.reg('HATB')); });
  for (const h of HATS) rig.parts[h].visible = false;
  // a touch larger than life, so she reads at the game's camera distance
  rig.body.scale.setScalar(1.3);
  return rig;
}

function animateRoach(rig: Rig, c: Creature, t: number, dt: number) {
  const ud = rig.root.userData as Record<string, any>;
  const n = netOf(c);
  const seed = hashId(c.id);
  // the look: a hat, the glow colour
  if (ud.hat !== n.hat) { ud.hat = n.hat; for (const h of HATS) if (rig.parts[h]) rig.parts[h].visible = h === n.hat; }
  const glow = ud.glowMat as THREE.MeshBasicMaterial;
  const base = TINTS[n.tint as string] ?? TINTS.tint_teal;
  const pose = c.dead ? '' : (n.pose as string) || '';
  const k = (name: string, target: number, rate = 7) => (ud[name] = lerp(ud[name] ?? 0, target, damp(rate, dt)));
  const point = k('pp', pose === 'point' ? 1 : 0, 6), happy = k('ph', pose === 'happy' ? 1 : 0, 9), scared = k('ps', pose === 'scared' || c.state === 'flee' ? 1 : 0, 10);
  if (glow) { glow.color.setHex(base); glow.color.multiplyScalar(1.1 + Math.sin(t * 2.2 + seed) * 0.25 + point * (0.8 + Math.sin(t * 12) * 0.6)); }
  const sh = fxPoll(rig, c);
  if (sh && G.audio) playAt(sh.key, c, sh.a.v ?? 0.5, sh.a.r ?? 12, sh.a.rate ?? 1.35);
  const moving = c.speed > 0.15, ph = (c.phase || t * 4) * 1.6;
  // a happy hop and a spin; a scared crouch; on point: front up, antennae forward
  const hop = happy * Math.abs(Math.sin(t * 9)) * 0.08;
  rig.body.position.y = hop + (moving ? Math.abs(Math.sin(ph * 2)) * 0.012 : Math.sin(t * 2.4 + seed) * 0.004) - scared * 0.03;
  rig.body.rotation.y = happy * Math.sin(t * 5) * 0.6;
  rot(rig, 'shell', -point * 0.32 + (moving ? Math.sin(ph * 2) * 0.03 : 0), 0, moving ? Math.sin(ph) * 0.06 : Math.sin(t * 1.1 + seed) * 0.03);
  rot(rig, 'head', point * 0.25 - scared * 0.2 + Math.sin(t * 0.9 + seed) * 0.08 * (1 - point), Math.sin(t * 0.6 + seed * 2) * 0.35 * (1 - point - scared), 0);
  // blink: the eyes squash shut for a beat now and then
  const bl = (t * 0.37 + seed) % 1 < 0.035 ? 0.15 : 1;
  for (const s of ['L', 'R']) { const e = rig.parts['eye' + s]; if (e) e.scale.set(1, bl, 1); }
  for (const [s, kk] of [['L', 1], ['R', -1]] as const) {
    const wig = Math.sin(t * (moving ? 9 : 3.3) + kk * 1.7 + seed) * (0.25 + point * 0.2);
    rot(rig, 'ant' + s, -0.25 + point * 0.9 + scared * -0.9 + wig * 0.4, kk * wig * 0.4, kk * (0.15 - scared * 0.4));
    for (let i = 0; i < 3; i++) {
      // tripod gait: legs 0 and 2 on one side move with leg 1 on the other
      const phase = ph * 2 + ((i % 2 === 0) === (kk > 0) ? 0 : Math.PI);
      const sw = moving ? Math.sin(phase) * 0.6 : Math.sin(t * 1.4 + i + kk) * 0.04;
      const lift = moving ? Math.max(0, Math.cos(phase)) * 0.45 : 0;
      rot(rig, `leg${s}${i}`, 0, sw, kk * (lift - scared * 0.35 + point * (i === 0 ? -0.5 : 0)));
    }
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
  const pose = Math.floor(t / 4) % 3;
  fc.mem.netMem.pose = pose === 1 ? 'happy' : pose === 2 ? 'point' : '';
  animateRoach(rig, fc, t, 1 / 60);
};
