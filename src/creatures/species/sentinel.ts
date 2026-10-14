import * as THREE from 'three';
import { def, newRig, part, Rig } from '../species';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { makeRamp, ph } from '../../gfx/pixel';
import { G } from '../../game/G';
import type { Creature } from '../creature';
import type { Player } from '../../entities/player';
import type { Zone } from '../../world/zone';
import { net, netOf, snd, playersIn, dist, hold, hashId, fakeCreature, rng, fx, fxPoll, playAt, live, seenByAny, walkable, lineOfSightB, localIn, thinkOnce, partB, matB, hiddenSpot } from '../behaviors_b';
import '../../audio/sounds_creatures_b';

// Far Sentinel: an impossibly tall, thin figure that only ever stands at the
// edge of sight, watching. It never moves while anyone is looking. Look away
// and it may be a few metres closer next time you turn around. Walk toward it
// and it simply is not there any more. It does nothing else.
// Distances are tuned to the isometric camera: at the default zoom the screen
// shows ~11 m around the survivor (≈23 m zoomed out), so it first appears
// 14-23 m out (screen edge / zoomed out), creeps no closer than ~11 m and is
// gone once anyone gets inside VANISH metres.

addTextureModule(() => {
  const A = atlas();
  A.add('c_sentinel_body', 16, 32, (pc) => {
    const R = makeRamp(0x2a2a30, 5, { hueShift: 0.06 });
    pc.fillRamp(R, (x, y) => 0.4 + (ph(x, y >> 2, 7) - 0.5) * 0.18 + (x % 5 === 0 ? -0.08 : 0), 0.5); // faint vertical striations
    for (let y = 0; y < 32; y += 11) pc.hline(0, 15, y, R[0]);
  });
  A.add('c_sentinel_face', 8, 12, (pc) => {
    pc.wrap = false;
    const R = makeRamp(0xa8a8a2, 5);
    pc.fillRamp(R, (x, y) => 0.65 - Math.abs(x - 3.5) * 0.05 - y * 0.02, 0.5);
    pc.set(2, 5, 0x0e0e10); pc.set(5, 5, 0x0e0e10); // two small black points
    pc.set(0, 0, 0x2a2a30); pc.set(7, 0, 0x2a2a30); pc.set(0, 11, 0x2a2a30); pc.set(7, 11, 0x2a2a30);
  });
  A.add('c_sentinel_eye', 2, 2, (pc) => { pc.fill(0xe8ecf0); });
});

const LEG = 1.55;

function buildSentinel(): Rig {
  const rig = newRig(5.2);
  const B = 'c_sentinel_body';
  const hip = part(rig, 'hip', rig.body, [0, LEG * 2, 0], (mb) => { mb.box(0, -0.08, 0, 0.3, 0.16, 0.14, B); });
  const torso = part(rig, 'torso', hip, [0, 0.04, 0], (mb) => {
    mb.box(0, 0, 0, 0.26, 0.9, 0.13, B);
    mb.box(0, 0.86, 0, 0.42, 0.12, 0.14, B); // shoulders
  });
  const neck = part(rig, 'neck', torso, [0, 0.96, 0.02], (mb) => { mb.box(0, 0, 0, 0.06, 0.34, 0.06, B); });
  part(rig, 'head', neck, [0, 0.32, 0.02], (mb) => {
    mb.box(0, 0, 0, 0.2, 0.3, 0.18, { south: 'c_sentinel_face', all: B }, { fit: { south: true } });
  });
  for (const [s, side] of [[1, 'L'], [-1, 'R']] as const) {
    const ua = part(rig, 'arm' + side, torso, [0.22 * s, 0.9, 0], (mb) => { mb.box(0, -1.2, 0, 0.06, 1.22, 0.06, B); });
    const fa = part(rig, 'fore' + side, ua, [0, -1.18, 0], (mb) => {
      mb.box(0, -1.15, 0, 0.05, 1.16, 0.05, B);
      for (let f = 0; f < 3; f++) mb.box(-0.015 + f * 0.015, -1.45, 0, 0.012, 0.3, 0.012, B); // fingers
    });
    void fa;
    const th = part(rig, 'thigh' + side, hip, [0.09 * s, -0.12, 0], (mb) => { mb.box(0, -LEG, 0, 0.09, LEG, 0.09, B); });
    part(rig, 'shin' + side, th, [0, -LEG + 0.02, 0], (mb) => { mb.box(0, -LEG + 0.12, 0, 0.07, LEG - 0.1, 0.07, B); mb.box(0, -LEG + 0.12, 0.05, 0.08, 0.04, 0.18, B); });
  }
  // two faint points of light at head height, visible through the dark
  const eyes = new THREE.Group();
  eyes.name = 'eyes';
  rig.root.add(eyes);
  rig.parts.eyes = eyes;
  partB(rig, 'eyeL', eyes, [0.045, 0, 0.1], (mb) => { mb.box(0, 0, 0, 0.025, 0.025, 0.01, 'c_sentinel_eye', { fit: true, emissive: 1 }); }, matB('glow'));
  partB(rig, 'eyeR', eyes, [-0.045, 0, 0.1], (mb) => { mb.box(0, 0, 0, 0.025, 0.025, 0.01, 'c_sentinel_eye', { fit: true, emissive: 1 }); }, matB('glow'));
  rig.eyes = [eyes];
  return rig;
}

function animateSentinel(rig: Rig, c: Creature, t: number, dt: number) {
  const P = rig.parts;
  const n = netOf(c);
  const ud = rig.root.userData as { hideT?: number; seenT?: number };
  const seed = hashId(c.id);
  const absent = n.v === 0;
  const vanishing = c.state === 'hide' && !absent;
  ud.hideT = vanishing ? (ud.hideT ?? 0) + dt : 0;
  const k = Math.min(1, (ud.hideT ?? 0) / 0.8);
  // vanish: stretched upward, thinned to a line, flickering, gone
  rig.body.scale.set(1 - k * 0.92, 1 + k * 0.5, 1 - k * 0.92);
  const flick = vanishing && Math.floor(t * 30) % 3 === 0;
  if (absent || k >= 1 || flick) { rig.body.visible = false; P.eyes.visible = false; }
  // statue-still; only the head tilts, slowly, the longer it is watched
  ud.seenT = c.visibleToLocal && !absent ? (ud.seenT ?? 0) + dt : Math.max(0, (ud.seenT ?? 0) - dt * 0.2);
  const tilt = Math.min(0.9, (ud.seenT ?? 0) * 0.04);
  P.head.rotation.z = tilt * (seed > 0.5 ? 1 : -1);
  P.neck.rotation.x = 0.12 + Math.sin(t * 0.13 + seed * 6) * 0.02;
  P.torso.rotation.x = 0.06;
  P.armL.rotation.z = 0.05; P.armR.rotation.z = -0.05;
  // eyes follow the head (they live on the root to show through darkness)
  const hy = LEG * 2 + 0.04 + 0.96 + 0.32 + 0.16;
  P.eyes.position.set(Math.sin(-tilt * (seed > 0.5 ? 1 : -1)) * 0.15, hy * rig.body.scale.y, 0.05);
  P.eyes.rotation.z = P.head.rotation.z;
  // fx (the vanish) on every peer
  const e = fxPoll(rig, c);
  if (e) playAt(e.key, c, 0.8, 40);
  // the local survivor: being watched wears on you
  const p = localIn(c);
  if (p && !absent && !c.dead) {
    const d = Math.hypot(p.x - c.x, p.z - c.z);
    if (c.visibleToLocal && rig.body.visible) {
      p.body.stress = Math.min(100, p.body.stress + dt * 0.35);
      if (d < 26) p.body.panic = Math.min(100, p.body.panic + dt * (26 - d) * 0.08);
      if ((ud.seenT ?? 0) > 1.5) thinkOnce(p, 'sentinel_seen', ['Someone is standing out there. Watching me.', 'That is not a lamp post.', 'It is too tall. It is far too tall.'][Math.floor(seed * 3)], 240);
    }
    if (vanishing && d < 22 && live()) G.pr.fx.blink = Math.max(G.pr.fx.blink, Math.sin(k * Math.PI) * 0.8);
  }
}

// ---------------------------------------------------------------- brain (host)
const SEE = 50;
const VANISH = 9.5;
const NEAREST = 11;
/** an unobserved tile at ~distance r from p, in the open (clear line to p), near a bearing if given */
function standSpot(z: Zone, p: Player, rMin: number, rMax: number, bearing?: number): { x: number; z: number } | null {
  for (let t = 0; t < 60; t++) {
    const a = bearing !== undefined && t < 35 ? bearing + rng.float(-0.55, 0.55) : rng.float(0, Math.PI * 2);
    const r = rng.float(rMin, rMax);
    const x = Math.floor(p.x + Math.cos(a) * r), y = Math.floor(p.z + Math.sin(a) * r);
    if (!walkable(z, x, y)) continue;
    const px = x + 0.5, pz = y + 0.5;
    if (seenByAny(z, px, pz, SEE)) continue;
    if (!lineOfSightB(z, p.x, p.z, px, pz)) continue;
    // never closer than the vanishing distance to anyone
    if (playersIn(z.key).some((q) => Math.hypot(q.x - px, q.z - pz) < NEAREST - 0.5)) continue;
    return { x: px, z: pz };
  }
  return null;
}
function nearest(c: Creature): { p: Player; d: number } | null {
  let best: Player | null = null, bd = Infinity;
  for (const p of playersIn(c.zoneKey)) { const d = dist(p, c); if (d < bd) { bd = d; best = p; } }
  return best ? { p: best, d: bd } : null;
}
function watched(z: Zone, c: Creature) { return !!seenByAny(z, c.x, c.z, SEE); }

function thinkSentinel(c: Creature, dt: number): boolean {
  const z = G.getZone(c.zoneKey);
  const n = net(c);
  const m = c.mem;
  hold(c);
  c.mem.persistent = true; // it leaves when it wants to
  const np = nearest(c);
  // gone for a while (after being approached or stared down)
  if ((m.goneUntil ?? 0) > G.time || !np) {
    n.v = 0; if (c.state !== 'hide') c.setState('hide');
    // nothing stands where it stood: keep the empty body out of everyone's way
    if (np && np.d < 30) { const s = standSpot(z, np.p, 40, 60) || standSpot(z, np.p, 30, 45); if (s) { c.x = s.x; c.z = s.z; } }
    return true;
  }
  const { p, d } = np;
  // vanishing animation in progress
  if (c.state === 'hide' && n.v === 1) {
    if (c.stateT > 0.85) { n.v = 0; m.goneUntil = G.time + rng.float(45, 130); m.placed = false; m.seenT = 0; }
    return true;
  }
  // (re)appear: stand somewhere out there, unobserved, with a clear line to them
  if (!m.placed || n.v === 0 || d > 36) {
    const s = standSpot(z, p, 14, 23);
    if (!s) {
      // nowhere open enough to stand and be seen: wait out of everyone's way, give up eventually
      n.v = 0;
      m.noRoomT = (m.noRoomT ?? 0) + dt;
      if (d < 25) { const h = hiddenSpot(z, p.x, p.z, 26, 45); if (h) { c.x = h.x; c.z = h.z; } }
      if (m.noRoomT > 90) G.creatures.remove(c);
      return true;
    }
    m.noRoomT = 0;
    c.x = s.x; c.z = s.z; c.facing = c.targetFacing = Math.atan2(p.z - c.z, p.x - c.x);
    m.placed = true; n.v = 1; m.seenT = 0; m.unseenT = 0; m.nextCreep = G.time + rng.float(5, 10);
    c.setState('watch');
    return true;
  }
  // approached: it is simply gone
  for (const q of playersIn(c.zoneKey)) {
    if (dist(q, c) < VANISH) { c.setState('hide'); fx(c, 'sentinel_vanish'); return true; }
  }
  if (watched(z, c)) {
    m.unseenT = 0;
    if (!m.seenT) G.creatures.call(c, 'idle');
    m.seenT = (m.seenT ?? 0) + dt;
    // stared at for long enough: the next blink it is gone
    if (m.seenT > 25) m.leaveOnBlink = true;
    return true;
  }
  m.unseenT = (m.unseenT ?? 0) + dt;
  if (m.leaveOnBlink && m.unseenT > 0.5) { m.leaveOnBlink = false; n.v = 0; m.goneUntil = G.time + rng.float(60, 150); m.placed = false; c.setState('hide'); return true; }
  // unwatched: always already facing you; sometimes a few metres closer
  c.facing = c.targetFacing = Math.atan2(p.z - c.z, p.x - c.x);
  if (m.unseenT > 3 && G.time > (m.nextCreep ?? 0)) {
    m.nextCreep = G.time + rng.float(6, 14);
    if (rng.chance(0.7)) {
      const nd = Math.max(NEAREST + 0.5, d - rng.float(2.5, 5.5));
      const s = standSpot(z, p, nd - 1, nd + 1, Math.atan2(c.z - p.z, c.x - p.x));
      if (s) { c.x = s.x; c.z = s.z; c.facing = c.targetFacing = Math.atan2(p.z - c.z, p.x - c.x); m.seenT = 0; }
    }
  }
  return true;
}

const S = def({
  key: 'sentinel', name: 'Far Sentinel', code: 'E-30 // OBSERVER-FAR', temperament: 'neutral', threat: 2,
  hp: 999, walk: 0, run: 0, turn: 0.4, radius: 0.35, height: 5.3, sight: 60, fov: 3.14, hearing: 0.2,
  zones: ['fields', 'parking', 'server', 'suburbs'], weight: 1, maxPerZone: 1,
  flags: { watcher: true, immortal: true, noCorpse: true },
  sounds: snd({ idle: 'sentinel_hum', loop: 'sentinel_hum' }),
  scan: {
    cls: 'Observer / non-hostile (?)',
    notes: [
      'Five metres tall. It stands at the edge of what you can see and watches.',
      'It never moves while anyone is looking at it. Look away and it may be closer.',
      'Walk toward it and it is gone before you are halfway there.',
      'Being watched is exhausting: stress and panic build while it is in view. Rounds pass through it.',
    ],
  },
  build: buildSentinel,
  animate: animateSentinel,
  think: thinkSentinel,
});
(S as any).animateGallery = (rig: Rig, t: number) => {
  const c = fakeCreature(S, { id: 'g4', state: 'watch', visibleToLocal: true, mem: { netMem: { v: 1 } } });
  animateSentinel(rig, c, t, 1 / 60);
};
