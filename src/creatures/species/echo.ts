import { def, newRig, part, Rig } from '../species';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { makeRamp, ph } from '../../gfx/pixel';
import { tileFbm } from '../../core/rng';
import { G } from '../../game/G';
import type { Creature } from '../creature';
import type { Player } from '../../entities/player';
import type { Zone } from '../../world/zone';
import {
  net, netOf, snd, playersIn, dist, hold, face, hashId, fakeCreature, rng, fx, fxPoll, playAt, live,
  lightAt, beamOn, sees, seenByAny, angleDiff, lineOfSightB, localIn, thinkOnce, pickReach,
} from '../behaviors_b';
import '../../audio/sounds_creatures_b';

// Echo: a gangly, eyeless thing whose head is all ears and a vertical mouth.
// It stays out of sight and calls out in a borrowed voice (a snippet a friend
// actually said in co-op voice chat; a synthesised call when alone), then
// moves before anyone arrives where the voice came from. It drifts toward
// voices and noise it hears. Light is the counter: a flashlight beam on it
// sends it shrieking away, and it only ever strikes from behind, in the dark.

addTextureModule(() => {
  const A = atlas();
  A.add('c_echo_skin', 32, 32, (pc) => {
    const R = makeRamp(0x857a72, 7, { hueShift: 0.05 });
    pc.fillRamp(R, (x, y) => 0.55 + (tileFbm(x, y, 32, 32, 3, 3, 21) - 0.5) * 0.35, 0.7);
    for (let y = 3; y < 32; y += 4) for (let x = 0; x < 32; x++) if ((x + (y >> 2)) % 7 < 4) pc.blend(x, y, R[2], 0.35); // stretched skin folds
    for (let i = 0; i < 6; i++) { const x = (i * 13) % 32, y = (i * 9 + 5) % 32; pc.blend(x, y, 0x7a5e5a, 0.5); pc.blend(x + 1, y, 0x7a5e5a, 0.3); } // bruising
  });
  A.add('c_echo_ears', 16, 16, (pc) => {
    // the head: overlapping human ears, whorls and canals
    const R = makeRamp(0x957c74, 6, { hueShift: 0.05 });
    pc.fillRamp(R, (x, y) => 0.5 + (ph(x, y, 4) - 0.5) * 0.1, 0.4);
    const ear = (cx: number, cy: number, s: number) => {
      pc.ellipse(cx, cy, 2.2 * s, 3 * s, R[4]);
      pc.ellipse(cx, cy, 1.4 * s, 2.1 * s, R[2]);
      pc.set(Math.round(cx), Math.round(cy), 0x3a2622);
      pc.set(Math.round(cx), Math.round(cy) + 1, 0x5a3a34);
    };
    ear(4, 4, 1); ear(11, 5, 0.9); ear(7, 11, 1.1); ear(13, 12, 0.8); ear(1, 12, 0.7);
  });
  A.add('c_echo_face', 16, 24, (pc) => {
    pc.wrap = false;
    const R = makeRamp(0x8e827a, 6, { hueShift: 0.04 });
    pc.fillRamp(R, (x, y) => 0.6 - Math.abs(x - 7.5) * 0.02 - y * 0.008, 0.5);
    // no eyes: two shallow dents where eyes should be
    pc.ellipse(4, 7, 1.6, 1, R[2]); pc.ellipse(11, 7, 1.6, 1, R[2]);
    // the mouth runs vertically down the face, lips like an ear canal
    for (let y = 9; y < 22; y++) { pc.set(7, y, 0x2a1414); pc.set(8, y, 0x3a1c1a); pc.set(6, y, R[1]); pc.set(9, y, R[1]); }
    pc.set(7, 8, R[1]); pc.set(8, 22, R[1]);
  });
  A.add('c_echo_mouth', 4, 16, (pc) => {
    pc.wrap = false;
    pc.fill(0x1a0a0a);
    for (let y = 1; y < 16; y += 3) { pc.set(1, y, 0xd8ccb8); pc.set(2, y + 1, 0xd8ccb8); } // small flat teeth inside
  });
});

function buildEcho(): Rig {
  const rig = newRig(2.1);
  const sk = 'c_echo_skin';
  const pelvis = part(rig, 'pelvis', rig.body, [0, 1.12, 0], (mb) => { mb.box(0, -0.08, 0, 0.26, 0.14, 0.16, sk); });
  const torso = part(rig, 'torso', pelvis, [0, 0.02, 0], (mb) => {
    mb.box(0, 0, 0, 0.24, 0.62, 0.15, sk);
    mb.box(0, 0.5, 0.0, 0.34, 0.12, 0.16, sk); // shoulders: too narrow for the arms
    for (let i = 0; i < 4; i++) mb.box(0, 0.12 + i * 0.1, 0.077, 0.2 - i * 0.012, 0.025, 0.012, sk, { color: 0xd8d0c4 }); // ribs pressing out
  });
  const neck = part(rig, 'neck', torso, [0, 0.6, 0.02], (mb) => { mb.box(0, 0, 0, 0.07, 0.34, 0.07, sk); });
  const head = part(rig, 'head', neck, [0, 0.32, 0.02], (mb) => {
    mb.box(0, -0.04, 0, 0.2, 0.36, 0.2, { south: 'c_echo_face', all: 'c_echo_ears' }, { fit: { south: true } });
    mb.box(0, 0.3, -0.01, 0.15, 0.06, 0.16, 'c_echo_ears'); // crown
    mb.box(0.11, 0.05, -0.02, 0.04, 0.16, 0.1, 'c_echo_ears'); // cupped ear flaps
    mb.box(-0.11, 0.05, -0.02, 0.04, 0.16, 0.1, 'c_echo_ears');
  });
  // the jaw: two halves of the vertical mouth that open sideways
  part(rig, 'mouth', head, [0, 0.0, 0.102], (mb) => { mb.box(0, 0.0, 0, 0.028, 0.24, 0.006, 'c_echo_mouth', { fit: true }); });
  for (const [s, side] of [[1, 'L'], [-1, 'R']] as const) {
    const sh = part(rig, 'arm' + side, torso, [0.19 * s, 0.54, 0], (mb) => { mb.box(0, -0.62, 0, 0.065, 0.64, 0.07, sk); });
    const fa = part(rig, 'fore' + side, sh, [0, -0.6, 0], (mb) => { mb.box(0, -0.6, 0, 0.055, 0.62, 0.06, sk); });
    part(rig, 'hand' + side, fa, [0, -0.6, 0], (mb) => {
      mb.box(0, -0.06, 0, 0.08, 0.08, 0.04, sk);
      for (let f = 0; f < 4; f++) mb.box(-0.03 + f * 0.02, -0.26, 0.0, 0.014, 0.2, 0.014, sk); // fingers far too long
    });
    const th = part(rig, 'thigh' + side, pelvis, [0.08 * s, -0.08, 0], (mb) => { mb.box(0, -0.5, 0, 0.08, 0.52, 0.09, sk); });
    const shin = part(rig, 'shin' + side, th, [0, -0.5, 0], (mb) => { mb.box(0, -0.5, 0, 0.06, 0.52, 0.065, sk); });
    part(rig, 'foot' + side, shin, [0, -0.5, 0], (mb) => { mb.box(0, -0.035, 0.07, 0.07, 0.035, 0.2, sk); });
  }
  void head;
  return rig;
}

function animateEcho(rig: Rig, c: Creature, t: number, dt: number) {
  const P = rig.parts;
  const n = netOf(c);
  const st = c.state;
  const ud = rig.root.userData as { low?: number; mouth?: number; mT?: number };
  const seed = hashId(c.id);
  const moving = c.speed > 0.15;
  const fast = c.speed > 2.5;
  // posture: crouched when hiding/stalking, upright when fleeing or calling
  const lowT = c.dead ? 0 : st === 'hide' ? 1 : st === 'stalk' ? 0.8 : st === 'mimic' ? 0.35 : st === 'flee' ? 0.1 : st === 'chase' ? 0.55 : 0.25;
  ud.low = (ud.low ?? lowT) + (lowT - (ud.low ?? lowT)) * Math.min(1, dt * 4);
  const low = ud.low;
  rig.body.position.y = -low * 0.5 + (moving ? Math.abs(Math.sin(c.phase)) * 0.05 : 0);
  P.pelvis.rotation.x = low * 0.35;
  P.torso.rotation.x = 0.3 + low * 0.75 + (st === 'mimic' ? -0.35 : 0);
  P.neck.rotation.x = -0.2 - low * 0.65 + (st === 'mimic' ? -0.3 : 0);
  // gait: long strides, knees bent backwards
  const amp = moving ? (fast ? 0.9 : 0.5) : 0;
  for (const [i, side] of [[0, 'L'], [1, 'R']] as const) {
    const ph0 = c.phase + i * Math.PI;
    const sw = Math.sin(ph0) * amp;
    P['thigh' + side].rotation.x = -low * 1.1 + sw;
    P['shin' + side].rotation.x = low * 1.9 + Math.max(0, -Math.sin(ph0)) * amp * 1.2;
    P['foot' + side].rotation.x = -low * 0.8;
    // arms: hanging, dragging; reaching forward when stalking like a crawl
    const armSw = Math.sin(ph0 + Math.PI) * amp * (st === 'stalk' ? 1.2 : 0.6);
    let ax = -0.1 - low * 0.9 + armSw, az = (i ? -1 : 1) * 0.12;
    if (st === 'hide') { ax = -1.05 + Math.sin(t * 0.7 + i) * 0.04; az = (i ? -1 : 1) * 0.3; }
    if (st === 'flee') { ax = 0.6 + Math.sin(t * 14 + i * 2) * 0.4; az = (i ? -1 : 1) * 0.5; }
    if (c.attackPhase > 0) { ax = -2.4 + (0.38 - c.attackPhase) * 5; az = (i ? -1 : 1) * 0.15; }
    P['arm' + side].rotation.set(ax, 0, az);
    P['fore' + side].rotation.x = st === 'hide' ? -0.6 : -0.3 - low * 0.3;
    P['hand' + side].rotation.x = st === 'hide' ? -0.5 : 0;
  }
  // the head listens: snapping tilts, quantised like a bird's
  const snap = Math.floor(t * 1.3 + seed * 9);
  const r1 = ((snap * 9301 + 49297) % 233280) / 233280;
  const listening = st === 'hide' || st === 'idle' || st === 'wander';
  P.head.rotation.z = listening ? (r1 - 0.5) * 1.1 : st === 'mimic' ? 0.55 : 0;
  P.head.rotation.y = listening ? (((snap * 7 + 3) % 5) - 2) * 0.25 : 0;
  // mouth: wide while calling (driven by the fx clock so every peer matches), twitching otherwise
  const calling = st === 'mimic' || (ud.mT !== undefined && t - ud.mT < 2.2);
  const mOpen = calling ? 0.5 + Math.abs(Math.sin(t * 11)) * 0.9 : c.attackPhase > 0 || st === 'flee' ? 1.6 : 0.15;
  ud.mouth = (ud.mouth ?? 0) + (mOpen - (ud.mouth ?? 0)) * Math.min(1, dt * 12);
  P.mouth.scale.set(1 + ud.mouth * 2.2, 1 + ud.mouth * 0.15, 1);
  if (c.hitFlash > 0) rig.body.position.x = Math.sin(t * 90) * 0.04;
  // network fx: borrowed voices, clicks and shrieks
  const e = fxPoll(rig, c);
  if (e && live()) {
    if (e.key === 'mimic') { ud.mT = t; G.audio?.mimic?.(c); }
    else playAt(e.key, c, e.a.v ?? 1, e.a.r);
  }
  // being stalked: the local survivor feels it before they see it
  const p = localIn(c);
  if (p && !c.dead && (st === 'stalk' || st === 'chase') && Math.hypot(p.x - c.x, p.z - c.z) < 7) {
    p.body.stress = Math.min(100, p.body.stress + dt * 2);
    thinkOnce(p, 'echo_behind', ['Something is breathing behind me.', 'Don\'t turn around. Turn around.', 'I can hear clicking. Close.'][Math.floor(t) % 3], 90);
  }
  void n;
}

// ---------------------------------------------------------------- brain (host)
/** prefer the survivor who is most alone */
function pickTarget(c: Creature): Player | null {
  let best: Player | null = null, bs = -Infinity;
  const ps = playersIn(c.zoneKey);
  for (const p of ps) {
    const d = dist(p, c);
    if (d > 40) continue;
    let alone = 30;
    for (const q of ps) if (q !== p) alone = Math.min(alone, dist(p, q));
    const s = alone * 0.5 - d;
    if (s > bs) { bs = s; best = p; }
  }
  return best;
}
const isDark = (z: Zone, x: number, zz: number) => lightAt(z, x, zz) < 0.35;

function lurkSpot(z: Zone, c: Creature, p: { x: number; z: number }, near?: { x: number; z: number }) {
  // somewhere it can walk to, out of everyone's sight, ideally dark, 7-16 m from the target
  return pickReach(z, c.x, c.z, (x, zz, steps) => {
    const d = Math.hypot(x - p.x, zz - p.z);
    if (d < 6.5 || d > 17 || steps > 40) return null;
    if (near && Math.hypot(x - near.x, zz - near.z) > 9) return null;
    if (seenByAny(z, x, zz, 28)) return null;
    return (isDark(z, x, zz) ? 4 : 0) - Math.abs(d - 11) * 0.3 - steps * 0.04;
  }, 1600);
}

function thinkEcho(c: Creature, dt: number): boolean {
  const z = G.getZone(c.zoneKey);
  const cs = G.creatures;
  const m = c.mem;
  net(c);
  m.callT = (m.callT ?? rng.float(6, 14)) - dt;
  m.clickT = (m.clickT ?? rng.float(4, 10)) - dt;
  // light is pain: a beam on it, or being clearly seen in bright light
  const beam = beamOn(z, c.x, c.z, 15);
  // seen clearly (lit, close) for more than a moment also drives it off
  m.brightT = c.observed && lightAt(z, c.x, c.z) > 0.7 && (nearestTo(c) ? dist(nearestTo(c)!, c) < 12 : false) ? (m.brightT ?? 0) + dt : 0;
  const brightSeen = !beam && m.brightT > 0.6;
  if ((beam || brightSeen) && c.state !== 'flee') {
    const from = beam || nearestTo(c);
    c.setState('flee');
    c.goal = pickReach(z, c.x, c.z, (x, zz, st) => { const d = from ? Math.hypot(x - from.x, zz - from.z) : 12; return d < 9 || st > 30 || beamOn(z, x, zz, 16) ? null : d * 0.3 + (isDark(z, x, zz) ? 3 : 0) - (seenByAny(z, x, zz, 26) ? 4 : 0); }, 900) || cs.fleeSpot(c, z, from?.x ?? c.x, from?.z ?? c.z);
    if (c.noiseCooldown <= 0) { fx(c, 'echo_shriek', { r: 38 }); c.noiseCooldown = 3; }
    m.shyUntil = G.time + rng.float(12, 22);
    return true;
  }
  if (c.state === 'flee') {
    if (!c.goal || cs.moveTo(c, z, c.goal.x, c.goal.z, c.sp.run, dt, 0.8) || c.stateT > 7) { c.setState('hide'); c.goal = null; m.spot = null; }
    return true;
  }
  const p = pickTarget(c);
  if (!p) {
    // nobody around: wander, listen
    if (c.state !== 'wander' || !c.goal) { c.setState('wander'); c.goal = cs.wanderSpot(c, z, 14); }
    if (cs.moveTo(c, z, c.goal!.x, c.goal!.z, c.sp.walk * 0.7, dt, 0.8) || c.stateT > 25) c.goal = cs.wanderSpot(c, z, 14);
    return true;
  }
  const d = dist(p, c);
  const behind = Math.abs(angleDiff(p.facing, Math.atan2(c.z - p.z, c.x - p.x))) > 1.9;
  const dark = isDark(z, c.x, c.z) && lightAt(z, p.x, p.z) < 0.6;
  // watched: the target has it in their view cone (lit, or close), or anyone else can see it at all
  const inCone = Math.abs(angleDiff(p.facing, Math.atan2(c.z - p.z, c.x - p.x))) < 1.45 && d < 30 && lineOfSightB(z, p.x, p.z, c.x, c.z);
  const watched = (inCone && (!isDark(z, c.x, c.z) || d < 6 || !!beamOn(z, c.x, c.z, 16))) || playersIn(c.zoneKey).some((q) => q !== p && sees(q, z, c.x, c.z, 24));
  // after a strike: away, back into the dark
  if (m.struck) {
    m.struck = false;
    c.setState('flee');
    c.goal = pickReach(z, c.x, c.z, (x, zz, st) => { const d = Math.hypot(x - p.x, zz - p.z); return d < 9 || st > 30 ? null : (isDark(z, x, zz) ? 3 : 0) - (seenByAny(z, x, zz, 26) ? 4 : 0); }, 900) || cs.fleeSpot(c, z, p.x, p.z);
    m.shyUntil = G.time + rng.float(15, 30);
    return true;
  }
  // ---- strike: only from behind, only in the dark, only when nobody else is looking
  if (c.state === 'stalk') {
    if (!behind || !dark || watched || (m.shyUntil ?? 0) > G.time || d > 12) { c.setState('hide'); m.spot = lurkSpot(z, c, p); return true; }
    const reach = (c.sp.attack!.range) + p.radius;
    if (d <= reach && c.attackT <= 0) { cs.startAttack(c, p); m.struck = true; return true; }
    cs.moveTo(c, z, p.x, p.z, d > 4 ? c.sp.run * 0.8 : c.sp.run, dt, reach * 0.7);
    return true;
  }
  if (behind && dark && !watched && d < 9 && (m.shyUntil ?? 0) < G.time && rng.chance(dt * 0.5)) {
    c.setState('stalk');
    return true;
  }
  // ---- calling out
  if (c.state === 'mimic') {
    hold(c); face(c, p.x, p.z);
    if (c.stateT > 2.2) { c.setState('hide'); m.calls = (m.calls ?? 0) + 1; if (m.calls >= 2) { m.calls = 0; m.spot = lurkSpot(z, c, p); } }
    return true;
  }
  // ---- it heard someone: drift toward where the voice/noise came from (staying hidden)
  if (c.lastHeard && G.time - c.lastHeard.t < 0.6 && (m.followT ?? 0) < G.time) {
    const h = c.lastHeard;
    m.followT = G.time + rng.float(6, 12);
    const s = lurkSpot(z, c, p, { x: h.x, z: h.z });
    if (s) m.spot = s;
  }
  // ---- lurking: keep a hidden spot 8-15 m from the target
  const here = { x: c.x, z: c.z };
  const exposed = seenByAny(z, here.x, here.z, 26);
  m.pickT = (m.pickT ?? 0) - dt;
  const atSpot = !!m.spot && dist(m.spot, here) < 0.8;
  if ((!m.spot || d < 5.5 || d > 22 || (exposed && atSpot) || rng.chance(dt * 0.01)) && m.pickT <= 0) {
    m.pickT = 0.8;
    const s = lurkSpot(z, c, p);
    if (s) m.spot = s;
  }
  if (m.spot && dist(m.spot, here) > 0.7) {
    c.setState('hide');
    cs.moveTo(c, z, m.spot.x, m.spot.z, exposed ? c.sp.run : c.sp.walk, dt, 0.6);
    // no progress (blocked by a closed door, furniture): pick elsewhere
    m.stuckT = c.speed < 0.05 ? (m.stuckT ?? 0) + dt : 0;
    if (m.stuckT > 1.5) { m.stuckT = 0; m.spot = lurkSpot(z, c, p); }
    return true;
  }
  c.setState('hide');
  hold(c);
  face(c, p.x, p.z);
  // calls come from where nobody is looking
  if (m.callT <= 0 && d > 5 && d < 26 && !exposed && (!lineOfSightB(z, c.x, c.z, p.x, p.z) || isDark(z, c.x, c.z))) {
    m.callT = rng.float(14, 30);
    c.setState('mimic');
    fx(c, 'mimic');
    return true;
  }
  if (m.clickT <= 0) { m.clickT = rng.float(6, 14); if (d < 16) fx(c, 'echo_click', { v: 0.7, r: 14 }); }
  return true;
}
function nearestTo(c: Creature) {
  let best: Player | null = null, bd = Infinity;
  for (const p of playersIn(c.zoneKey)) { const d = dist(p, c); if (d < bd) { bd = d; best = p; } }
  return best;
}

const S = def({
  key: 'echo', name: 'Echo', code: 'E-09 // MIMIC-VOX', temperament: 'stalker', threat: 3,
  hp: 45, walk: 1.4, run: 5.2, turn: 7, radius: 0.32, height: 2.2, sight: 20, fov: 1.6, hearing: 2.4, nightVision: true,
  attack: { dmg: [12, 20], range: 1.1, cooldown: 2.5, kinds: ['laceration', 'deep', 'scratch'], corrupt: 0.15, knock: 0.9, parts: ['torso_u', 'neck', 'uarm_l', 'uarm_r', 'head'] },
  zones: ['pools', 'school', 'stairwell', 'hospital', 'lab', 'corrupt', 'house', 'lobby'], weight: 1, maxPerZone: 2, diet: 'meat',
  flags: { mimic: true },
  sounds: snd({ call: 'mimic_call', attack: 'echo_shriek', hurt: 'echo_shriek', death: 'echo_death' }),
  scan: {
    cls: 'Mimic / ambush predator',
    notes: [
      'No eyes. The head is ears. It hunts by listening, and it remembers voices.',
      'It calls out in a voice you know. The voice never comes from where it is standing a moment later.',
      'Hates light. A flashlight beam on it sends it running. It only strikes from behind, in the dark.',
      'Listen for wet clicking. Stay together; it goes for whoever is alone.',
    ],
  },
  build: buildEcho,
  animate: animateEcho,
  think: thinkEcho,
});
(S as any).animateGallery = (rig: Rig, t: number) => {
  const k = Math.floor(t / 3) % 4;
  const c = fakeCreature(S, { id: 'g3', state: (['hide', 'mimic', 'stalk', 'flee'] as const)[k], speed: k >= 2 ? 3 : 0, phase: t * 6, mem: {} });
  animateEcho(rig, c, t, 1 / 60);
};
