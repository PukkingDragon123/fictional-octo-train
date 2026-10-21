import * as THREE from 'three';
import { def, newRig, Rig } from '../species';
import { mixHex, ph } from '../../gfx/pixel';
import { Page, OB, V3, bpart, bodyRing, registerPage, applyLook, meshOf, clamp01, lerp, LoftRing, Row, sampleRows, ab, uOf, ramp, fillLv } from '../kit/beasts';
import { G } from '../../game/G';
import type { Creature } from '../creature';
import type { Zone } from '../../world/zone';
import { net, netOf, snd, playersIn, dist, hold, face, hashId, fakeCreature, rng, walkable, fx, fxPoll, playAt } from '../behaviors_b';
import '../../audio/sounds_creatures_b';

// Wrongbird: a flock of ordinary-looking songbirds whose motion is subtly
// wrong. On the ground they move in stop-motion (positions update at 7 fps),
// walk backwards and turn their heads 270 degrees. They take off with wings
// held perfectly still and glide away like paper cut-outs. Huntable: small
// meat, and now and then something that should never be inside a bird.

// Model: a plump little songbird built from lofted rings (breast, rump, a
// round head with a cone of a beak, a fanned tail, thin scaled legs with four
// toes) on a hand-painted page at bird scale. Wings are shaped feather cards
// that fold against the flanks and lock out flat in flight. And on each side
// of the head, painted at four times the world's density: a human eye. White,
// wet, with an iris and lids.
const PG = registerPage(new Page('c_birdpg', 64, 64, [
  ['BODY', 30, 22], ['HEAD', 30, 16], ['WING', 26, 16], ['TAIL', 16, 12], ['BEAK', 8, 6], ['LEG', 6, 10], ['CUT', 8, 8],
], 3));

function torsoGeo(ob: OB) {
  const rows: Row[] = [
    { z: -0.075, cy: 0.006, rx: 0.012, up: 0.01, dn: 0.01 },
    { z: -0.06, cy: 0.004, rx: 0.026, up: 0.024, dn: 0.024 },
    { z: -0.03, cy: 0.0, rx: 0.036, up: 0.033, dn: 0.036 },
    { z: 0.01, cy: 0.0, rx: 0.04, up: 0.036, dn: 0.042 },
    { z: 0.045, cy: 0.006, rx: 0.036, up: 0.032, dn: 0.04 },
    { z: 0.068, cy: 0.018, rx: 0.022, up: 0.022, dn: 0.026 },
  ];
  const rings: LoftRing[] = [];
  for (let k = 0; k <= 8; k++) {
    const z = lerp(-0.075, 0.068, k / 8), r = sampleRows(rows, z);
    rings.push({ pts: bodyRing(z, r.cy - 0.035, r.rx, r.up, r.dn, 11, 2), v: 0.05 + 0.9 * (k / 8), col: (j) => 0.8 + 0.2 * clamp01(ab((j / 10) * Math.PI * 2) / 2.2) });
  }
  ob.loft(rings, PG.reg('BODY'), { start: 'pole', end: 'pole' });
  // fanned tail: two crossed cards so it reads from above and from the side
  const T = PG.reg('TAIL');
  ob.push().translate(0, -0.026, -0.07).rotX(-0.12);
  ob.quad([[-0.026, 0, -0.085], [0.026, 0, -0.085], [0.012, 0, 0.0], [-0.012, 0, 0.0]], T, [[0, 0], [1, 0], [0.75, 1], [0.25, 1]], { double: true });
  ob.pop();
}
function headGeo(ob: OB) {
  const rows: Row[] = [
    { z: -0.026, cy: 0.0, rx: 0.01, up: 0.01, dn: 0.01 },
    { z: -0.016, cy: 0.0, rx: 0.024, up: 0.025, dn: 0.022 },
    { z: 0.004, cy: 0.002, rx: 0.027, up: 0.027, dn: 0.024 },
    { z: 0.022, cy: -0.002, rx: 0.021, up: 0.02, dn: 0.02 },
    { z: 0.032, cy: -0.004, rx: 0.012, up: 0.012, dn: 0.012 },
  ];
  const rings: LoftRing[] = [];
  for (let k = 0; k <= 7; k++) {
    const z = lerp(-0.026, 0.032, k / 7), r = sampleRows(rows, z);
    rings.push({ pts: bodyRing(z, r.cy - 0.02, r.rx, r.up, r.dn, 13, 2), v: 0.06 + 0.88 * (k / 7) });
  }
  ob.loft(rings, PG.reg('HEAD'), { start: 'pole', end: 'pole' });
  ob.cone([0, -0.024, 0.03], [0, -0.12, 1], 0.009, 0.026, 5, PG.reg('BEAK'), { flat: 0.8 });
  // neck stub with a cut face (shows when the head comes off)
  ob.tube([[0, -0.03, -0.0], [0, -0.04, -0.02]], [0.012, 0.012], 6, PG.reg('BODY'), { end: 'cut', cut: PG.reg('CUT'), vs: [0.95, 0.9] });
}
/** a wing: a shaped feather card, span toward -x (left) / +x (right), chord along z */
function wingGeo(ob: OB, side: number) {
  const W = PG.reg('WING');
  const cols = 3;
  const P = (u: number, v: number): V3 => [side * u * 0.17, Math.sin(u * Math.PI) * 0.006 - u * 0.004, -0.1 + v * 0.12 - u * 0.02];
  for (let c = 0; c < cols; c++) {
    const u0 = c / cols, u1 = (c + 1) / cols;
    ob.quad([P(u0, 0), P(u1, 0), P(u1, 1), P(u0, 1)], W, [[u0, 0], [u1, 0], [u1, 1], [u0, 1]], { double: true });
  }
}
function legGeo(ob: OB) {
  const L = PG.reg('LEG');
  ob.tube([[0, 0.008, 0], [0, -0.022, 0.002], [0, -0.042, 0.004]], [0.005, 0.0035, 0.003], 4, L, { start: 'cut', cut: PG.reg('CUT') });
  for (const [a, l] of [[-0.45, 0.022], [0, 0.026], [0.45, 0.022], [Math.PI, 0.016]] as [number, number][]) {
    ob.tube([[0, -0.042, 0.004], [Math.sin(a) * l * 0.6, -0.043, 0.004 + Math.cos(a) * l * 0.6], [Math.sin(a) * l, -0.045, 0.004 + Math.cos(a) * l]], [0.0025, 0.002, 0.0012], 3, L, {});
  }
}

function buildBird(): Rig {
  const rig = newRig(0.25);
  const torso = bpart(rig, 'torso', rig.body, [0, 0.11, 0], PG, 'torso', torsoGeo);
  bpart(rig, 'head', torso, [0, 0.04, 0.06], PG, 'head', headGeo);
  bpart(rig, 'wingL', torso, [-0.034, 0.0, 0.035], PG, 'wingL', (ob) => wingGeo(ob, -1)).quaternion.copy(FOLD_L);
  bpart(rig, 'wingR', torso, [0.034, 0.0, 0.035], PG, 'wingR', (ob) => wingGeo(ob, 1)).quaternion.copy(FOLD_R);
  rig.parts.wingL.scale.setScalar(0.55); rig.parts.wingR.scale.setScalar(0.55);
  for (const [i, x] of [[0, 0.016], [1, -0.016]] as const) bpart(rig, 'leg' + i, torso, [x, -0.07, 0.008], PG, 'leg', legGeo);
  return rig;
}

PG.paint((Pt, v) => {
  const pals = [
    { back: 0x7a6248, belly: 0xcab89a, head: 0x5e4c3c, cap: 0x8a6a4a, wing: 0x6a5440, bar: 0xd8c8a8 },   // sparrow
    { back: 0x2e2a30, belly: 0x5a5058, head: 0x24222a, cap: 0x3a3442, wing: 0x26242a, bar: 0x8a8a6a },   // starling
    { back: 0x8a8884, belly: 0xc8c0b8, head: 0x6a6a6e, cap: 0x7a7a80, wing: 0x76767a, bar: 0xd0ccc4 },   // pale grey
  ][v % 3];
  const BK = ramp(pals.back, 10, 0x100c0c, 0.45), BY = ramp(pals.belly, 10, 0x3a2e24, 0.5), HD = ramp(pals.head, 10, 0x0c0a0a, 0.45), WG = ramp(pals.wing, 10, 0x0a0808, 0.5);
  const M = 5;
  // ---------------- body: scalloped back feathers, pale speckled breast
  {
    const r = Pt.R('BODY');
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
      const a = ab(((x + 0.5) / r.w) * Math.PI * 2);
      const belly = a < 1.35 + (ph(x, y >> 1, v) - 0.5) * 0.3;
      // feather scallops: rows of small U shapes
      const sx = (x + (Math.floor(y / 3) % 2) * 2) % 4, sy = y % 3;
      const scallop = sy === 2 && sx !== 0 ? -0.8 : sy === 0 && sx === 2 ? 0.5 : 0;
      if (belly) Pt.put(r, x, y, BY, M + 0.5 + a * 0.6 + (ph(x, y, 9) < 0.12 ? -2 : 0), 0.2);
      else Pt.put(r, x, y, BK, M + scallop + (a / Math.PI) * 0.8 + (Pt.n(r, x, y, 2, 1, 3) - 0.5), 0.2);
    }
  }
  // ---------------- head: cap, cheek, and the eye. a human eye.
  {
    const r = Pt.R('HEAD');
    fillLv(Pt, r, HD, (u, vv, x, y) => M + (ab(u * Math.PI * 2) / Math.PI - 0.4) * 1.6 + (ph(x, y, 4) - 0.5) * 0.6);
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
      const a = ab(((x + 0.5) / r.w) * Math.PI * 2), vv = 1 - (y + 0.5) / r.h;
      if (a > 2.4 && vv < 0.75) Pt.put(r, x, y, ramp(pals.cap, 8, 0x100c0c, 0.4), 4 + (ph(x, y, 6) - 0.5), 0.2);
      if (a < 0.9) Pt.put(r, x, y, BY, 6, 0.2); // pale throat
    }
    for (const sd of [1, -1]) {
      const cx = uOf(1.72, sd) * r.w, cy = (1 - 0.56) * r.h;
      // lids (pinkish skin), sclera, iris, pupil, a wet glint: 5x3 px
      for (let dx = -3; dx <= 3; dx++) for (let dy = -2; dy <= 2; dy++) {
        const e = (dx * dx) / 9 + (dy * dy) / 4;
        if (e > 1.15) continue;
        Pt.set(r, cx + dx, cy + dy, e > 0.75 ? 0xb48a7a : 0xf2ece0);
      }
      Pt.set(r, cx + sd, cy, 0x5a3a20); Pt.set(r, cx + sd, cy - 1, 0x6a4a28); Pt.set(r, cx + sd * 2, cy, 0x4a3018);
      Pt.set(r, cx + sd, cy + 0, 0x0a0606);
      Pt.set(r, cx, cy - 1, 0xffffff);
      for (let dx = -2; dx <= 2; dx++) Pt.set(r, cx + dx, cy - 2, 0x6a4a40); // upper lid crease
      Pt.set(r, cx - sd * 3, cy + 1, 0x9a6a62); // red rim of the inner corner
    }
  }
  // ---------------- wing card (alpha shaped): coverts, a pale bar, long primaries with ragged tips
  {
    const r = Pt.R('WING');
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
      const u = (x + 0.5) / r.w, vv = 1 - (y + 0.5) / r.h; // u: shoulder -> tip, vv: trailing (0) -> leading (1)
      const lead = 1 - u * 0.35, trail = u < 0.55 ? 0.02 : (u - 0.55) * 1.2;
      if (vv > lead || vv < trail) continue;
      if (u > 0.45 && (x % 3 === 0) && vv < trail + 0.25) continue; // separated primary tips
      let l = M - 0.5 + (vv > 0.7 ? 1.2 : 0) - (x % 3 === 2 ? 1 : 0) + (ph(x, y, 7) - 0.5) * 0.6;
      if (vv > 0.62 && vv < 0.72 && u < 0.7) { Pt.set(r, x, y, pals.bar); continue; }
      Pt.put(r, x, y, WG, l, 0.2);
    }
  }
  {
    const r = Pt.R('TAIL');
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
      const vv = 1 - (y + 0.5) / r.h;
      if (vv < 0.15 && x % 3 === 0) continue;
      Pt.put(r, x, y, WG, M - 0.5 + vv * 1.5 - (x % 3 === 0 ? 1.2 : 0), 0.2);
    }
  }
  fillLv(Pt, Pt.R('BEAK'), ramp(v === 1 ? 0xc8a040 : 0x8a7a5a, 8, 0x1a1408, 0.5), (u, vv) => 4 + vv * 2 - Math.abs(u - 0.5) * 2);
  fillLv(Pt, Pt.R('LEG'), ramp(0x9a7a62, 8, 0x1a1010, 0.4), (u, vv, x, y) => 4 + (y % 2) * 0.8);
  Pt.cut(Pt.R('CUT'), BK[4], { meat: 0x8a2424, fat: 0xc8a888, boneR: 0.3 });
  void mixHex;
});

/** folded wings: span laid back along the flank, feathers hanging down over it, leaning onto the back */
function foldQ(side: number) {
  const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -side), new THREE.Vector3(side, 0, 0), new THREE.Vector3(0, -1, 0));
  const q = new THREE.Quaternion().setFromRotationMatrix(m);
  return q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), side * 0.9));
}
const FOLD_L = foldQ(-1), FOLD_R = foldQ(1), Q_OPEN = new THREE.Quaternion();

interface BirdVis { t: number; x: number; z: number; ry: number; fly: number; head: number }

function animateBird(rig: Rig, c: Creature, t: number, dt: number) {
  const P = rig.parts;
  const n = netOf(c);
  const ud = rig.root.userData as { v?: BirdVis };
  const v = ud.v || (ud.v = { t: 0, x: c.x, z: c.z, ry: rig.root.rotation.y, fly: 0, head: 0 });
  const seed = hashId(c.id);
  applyLook(rig, c, PG, 0.1);
  const flying = !c.dead && (n.fly === 1 || c.state === 'flee');
  v.fly += ((flying ? 1 : 0) - v.fly) * Math.min(1, dt * (flying ? 3 : 1.5));
  // stop-motion: on the ground the drawn position only updates ~7 times a second
  v.t -= dt;
  const moving = c.speed > 0.05;
  const backwards = moving && !flying && c.state === 'wander';
  const ry = rig.root.rotation.y + (backwards ? Math.PI : 0);
  if (flying || c.dead || v.t <= 0) {
    v.t = 0.11 + ((t * 13 + seed * 7) % 1) * 0.08;
    v.x = c.x; v.z = c.z; v.ry = ry;
  }
  if (!flying) rig.root.position.set(v.x, c.y, v.z);
  rig.root.rotation.y = flying ? ry : v.ry;
  // height: glide 2.5-4 m up with an occasional mid-air hitch
  const alt = v.fly * (2.6 + seed * 1.4) + (flying && ((t * 0.7 + seed) % 1) < 0.06 ? 0.25 : 0);
  rig.body.position.y = alt;
  const torso = P.torso, head = P.head;
  if (c.dead) {
    torso.rotation.set(0, 0, Math.PI / 2);
    torso.position.y = 0.042;
    P.wingL.quaternion.copy(FOLD_L).slerp(Q_OPEN, 0.6); P.wingR.quaternion.copy(FOLD_R).slerp(Q_OPEN, 0.2);
    head.rotation.set(0.4, 2.2, 0); // neck at an impossible angle
    return;
  }
  torso.position.y = 0.11;
  // wings: folded on the ground, rigidly spread (and never beating) in the air
  const spread = v.fly;
  // now and then a folded wing flicks half open for a single frame, then is folded again
  const fstep = Math.floor(t * 7 + seed * 13);
  const flick = !flying && ((fstep * 7919 + Math.floor(seed * 1000)) % 41) === 0 ? 0.35 : 0;
  P.wingL.quaternion.copy(FOLD_L).slerp(Q_OPEN, clamp01(spread + flick));
  P.wingR.quaternion.copy(FOLD_R).slerp(Q_OPEN, clamp01(spread));
  P.wingL.scale.setScalar(0.55 + spread * 0.45); P.wingR.scale.setScalar(0.55 + spread * 0.45);
  // legs dangle in flight, hop on the ground
  const hop = !flying && moving ? Math.abs(Math.sin(c.phase * 2)) * 0.03 : 0;
  torso.position.y += hop;
  const stepL = !flying && moving ? (Math.floor(t * 7) % 2 ? 0.35 : -0.25) : 0;
  P.leg0.rotation.x = spread * 0.9 + stepL; P.leg1.rotation.x = spread * 0.9 - stepL;
  const tm = meshOf(torso);
  if (tm) tm.scale.setScalar(1 + (Math.floor(t * 7) % 2) * 0.02);
  if (flying) { torso.rotation.set(0, 0, 0); head.rotation.set(0, 0, 0); return; }
  // pecking, quantised: the head snaps between poses instead of moving
  const step = Math.floor(t * 7 + seed * 10);
  if (c.state === 'graze') {
    const peck = (step + Math.floor(seed * 5)) % 5 < 2;
    torso.rotation.set(peck ? 0.55 : 0.1, 0, 0);
    head.rotation.set(peck ? 0.7 : 0, 0, 0);
  } else {
    torso.rotation.set(0, 0, 0);
    // the head keeps turning... past where a neck should stop, then snaps back
    const turn = ((t * 0.35 + seed) % 1);
    v.head = c.state === 'idle' || c.state === 'watch' ? (turn < 0.85 ? Math.floor(turn / 0.85 * 12) / 12 * 4.7 : 0) : 0;
    head.rotation.set(0, v.head, c.state === 'watch' ? 0.5 : 0);
  }
  const e = fxPoll(rig, c);
  if (e) playAt(e.key, c, e.a.v ?? 0.8, e.a.r);
}

// ---------------------------------------------------------------- brain (host)
function flock(c: Creature, r = 9): Creature[] {
  const out: Creature[] = [];
  for (const o of G.creatures.creatures.values() as Iterable<Creature>) {
    if (o !== c && !o.dead && o.sp.key === c.sp.key && o.zoneKey === c.zoneKey && dist(o, c) < r) out.push(o);
  }
  return out;
}
function landingSpot(z: Zone, c: Creature, fx0: number, fz0: number): { x: number; z: number } {
  const a0 = Math.atan2(c.z - fz0, c.x - fx0);
  for (let t = 0; t < 30; t++) {
    const a = a0 + rng.float(-0.9, 0.9), d = rng.float(16, 30);
    const x = Math.floor(c.x + Math.cos(a) * d), y = Math.floor(c.z + Math.sin(a) * d);
    if (walkable(z, x, y) && (z.floorAt(x, y)?.outdoor || t > 20)) return { x: x + 0.5, z: y + 0.5 };
  }
  return { x: c.x + Math.cos(a0) * 12, z: c.z + Math.sin(a0) * 12 };
}
function takeOff(c: Creature, z: Zone, fromX: number, fromZ: number, cascade = true) {
  if (c.state === 'flee') return;
  c.setState('flee');
  c.goal = landingSpot(z, c, fromX, fromZ);
  net(c).fly = 1;
  if (cascade) {
    fx(c, 'bird_flap', { v: 0.9 });
    // the flock scatters together (each one a beat apart)
    for (const o of flock(c)) { if (o.state !== 'flee') { o.mem.scatterAt = G.time + rng.float(0.05, 0.4); o.mem.scatterFrom = [fromX, fromZ]; } }
    if (rng.chance(0.6)) G.creatures.call(c, 'alert');
  }
}

function thinkBird(c: Creature, dt: number): boolean {
  const z = G.getZone(c.zoneKey);
  const n = net(c);
  const m = c.mem;
  if (c.state === 'flee') {
    // straight glide, over fences and roofs: wings never move
    const g = c.goal!;
    const dx = g.x - c.x, dz = g.z - c.z, d = Math.hypot(dx, dz);
    hold(c);
    face(c, g.x, g.z, true);
    if (d < 0.4 || c.stateT > 12) {
      if (!walkable(z, Math.floor(c.x), Math.floor(c.z))) { c.goal = landingSpot(z, c, c.x - dx, c.z - dz); c.stateT = 0; return true; }
      n.fly = 0; c.home = { x: c.x, z: c.z }; c.setState('graze'); c.awareness.clear(); c.lastHeard = null;
      return true;
    }
    const sp = Math.min(c.sp.run, d * 2 + 1);
    c.x += (dx / d) * sp * dt; c.z += (dz / d) * sp * dt;
    c.speed = sp; c.phase += sp * dt * 4;
    return true;
  }
  // cascade from a flock-mate taking off
  if (m.scatterAt && G.time >= m.scatterAt) { const f = m.scatterFrom || [c.x, c.z]; m.scatterAt = 0; takeOff(c, z, f[0], f[1], false); return true; }
  // noise: anything loud or close scatters the flock
  if (c.lastHeard && G.time - c.lastHeard.t < 0.6 && c.lastHeard.r > 2.5) { takeOff(c, z, c.lastHeard.x, c.lastHeard.z); return true; }
  for (const p of playersIn(c.zoneKey)) {
    const d = dist(p, c);
    const scare = p.running ? 10 : p.stance === 'sneak' ? 2.4 : 5;
    if (d < scare) { takeOff(c, z, p.x, p.z); return true; }
    // someone close and watching: freeze and stare (head turned all the way round)
    if (d < 9 && c.state !== 'watch' && rng.chance(dt * 0.6)) { c.setState('watch'); hold(c); }
  }
  n.fly = 0;
  switch (c.state) {
    case 'watch': {
      hold(c);
      const p = playersIn(c.zoneKey).sort((a, b) => dist(a, c) - dist(b, c))[0];
      if (p) face(c, p.x, p.z);
      if (c.stateT > 3 + rng.next() * 4) c.setState('graze');
      return true;
    }
    case 'graze':
      hold(c);
      if (c.stateT > 3 + rng.next() * 6) c.setState(rng.chance(0.6) ? 'wander' : 'idle');
      break;
    case 'wander':
      if (!c.goal || c.stateT < dt) c.goal = G.creatures.wanderSpot(c, z, 3.5);
      if (G.creatures.moveTo(c, z, c.goal!.x, c.goal!.z, c.sp.walk, dt, 0.3) || c.stateT > 7) { c.setState('graze'); c.goal = null; }
      break;
    default:
      hold(c);
      if (c.stateT > 2 + rng.next() * 4) c.setState('graze');
  }
  if (c.noiseCooldown <= 0 && rng.chance(dt * 0.05)) { G.creatures.call(c, 'idle'); c.noiseCooldown = 8 + rng.next() * 10; }
  return true;
}

const S = def({
  key: 'wrongbird', name: 'Wrongbird', code: 'E-17 // AVES-INCORRECT', temperament: 'skittish', threat: 0,
  rule: { name: 'SCATTERS AT NOISE', text: 'Noise or running scatters the flock. Sneak to get close enough to catch one.' },
  hp: 4, walk: 0.6, run: 6.5, turn: 30, radius: 0.12, height: 0.25, sight: 14, fov: 3.0, hearing: 1.6,
  zones: ['fields', 'suburbs', 'parking'], weight: 3, group: [3, 6], maxPerZone: 12, diet: 'grass',
  meat: [['small_meat_raw', 1]],
  flags: { flying: true },
  sounds: snd({ idle: 'bird_wrong', alert: 'bird_wrong', hurt: 'wrongbird_caw', death: 'wrongbird_caw' }),
  scan: {
    cls: 'Avian / flocking / skittish',
    notes: [
      'Moves at seven frames per second. Walks backwards. The head turns further than a neck allows.',
      'It has a human eye. It is looking at you.',
      'Noise or running scatters the whole flock. It glides off without ever beating its wings. Sneak to get close.',
      'Small game meat. Sometimes something else: keys, coins, a marble. It never swallowed them.',
    ],
  },
  gore: { blood: 'red', sever: ['wingL', 'wingR', 'leg0', 'leg1'], head: 'head' },
  build: buildBird,
  animate: animateBird,
  think: thinkBird,
});
(S as any).animateGallery = (rig: Rig, t: number) => {
  const st = (Math.floor(t / 4) % 3);
  const c = fakeCreature(S, { id: 'g2', state: st === 0 ? 'graze' : st === 1 ? 'idle' : 'flee', mem: { netMem: { fly: st === 2 ? 1 : 0 } } });
  const x = rig.root.position.x, z = rig.root.position.z;
  (c as any).x = x; (c as any).z = z;
  animateBird(rig, c, t, 1 / 60);
};
