import { def, newRig, part, Rig } from '../species';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { makeRamp, ph } from '../../gfx/pixel';
import { G } from '../../game/G';
import type { Creature } from '../creature';
import type { Zone } from '../../world/zone';
import { net, netOf, snd, playersIn, dist, hold, face, hashId, fakeCreature, rng, walkable, fx, fxPoll, playAt, partB, matB } from '../behaviors_b';
import '../../audio/sounds_creatures_b';

// Wrongbird: a flock of ordinary-looking songbirds whose motion is subtly
// wrong. On the ground they move in stop-motion (positions update at 7 fps),
// walk backwards and turn their heads 270 degrees. They take off with wings
// held perfectly still and glide away like paper cut-outs. Huntable: small
// meat, and now and then something that should never be inside a bird.

addTextureModule(() => {
  const A = atlas();
  A.add('c_wrongbird_body', 16, 16, (pc) => {
    const R = makeRamp(0x7a6a58, 6, { hueShift: 0.05 });
    pc.fillRamp(R, (x, y) => 0.55 + (ph(x >> 1, y >> 1, 3) - 0.5) * 0.25 - y * 0.012, 0.6);
    for (let y = 1; y < 16; y += 3) for (let x = (y % 2) * 2; x < 16; x += 4) pc.set(x, y, R[1]); // feather scallops
  });
  A.add('c_wrongbird_belly', 8, 8, (pc) => {
    const R = makeRamp(0xcab89c, 5);
    pc.fillRamp(R, (x, y) => 0.65 + (ph(x, y, 9) - 0.5) * 0.2, 0.5);
    pc.set(3, 4, R[1]); pc.set(5, 2, R[1]);
  });
  A.add('c_wrongbird_head', 8, 8, (pc) => {
    pc.wrap = false;
    const R = makeRamp(0x5e5248, 5);
    pc.fillRamp(R, (x, y) => 0.5 - y * 0.03, 0.4);
    // a human eye. small, wet, with a white sclera. on a bird.
    pc.set(5, 3, 0xf2eee4); pc.set(6, 3, 0xf2eee4); pc.set(5, 4, 0x2a2018); pc.set(6, 4, 0xf2eee4);
    pc.set(1, 5, 0xb89a6a);
  });
  // spread wing card seen from above, primaries fanned, pale bars
  A.add('c_wrongbird_wing', 16, 8, (pc) => {
    pc.wrap = false;
    pc.clear();
    const R = makeRamp(0x6a5a4a, 6, { hueShift: 0.05 });
    for (let y = 0; y < 8; y++) for (let x = 0; x < 16; x++) {
      const len = 7 - Math.floor(Math.abs(x - 3) * 0.12) - (x > 9 ? Math.floor((x - 9) * 0.9) : 0);
      if (y > len) continue;
      if (x > 9 && (x + y) % 3 === 0 && y > len - 2) continue; // ragged feather tips
      pc.set(x, y, R[Math.max(0, Math.min(5, 2 + Math.round((ph(x, y, 4) - 0.5) * 2) + (y < 2 ? 1 : 0)))]);
    }
    for (let x = 1; x < 12; x++) pc.set(x, 3, 0xd8c8a8); // wing bar
  });
});

function buildBird(): Rig {
  const rig = newRig(0.25);
  const torso = part(rig, 'torso', rig.body, [0, 0.11, 0], (mb) => {
    mb.box(0, -0.035, 0, 0.075, 0.075, 0.13, { all: 'c_wrongbird_body', bottom: 'c_wrongbird_belly', south: 'c_wrongbird_belly' });
    mb.box(0, -0.01, -0.09, 0.05, 0.016, 0.08, 'c_wrongbird_body'); // tail
  });
  const head = part(rig, 'head', torso, [0, 0.04, 0.06], (mb) => {
    mb.box(0, -0.02, 0.012, 0.05, 0.05, 0.055, { east: 'c_wrongbird_head', west: 'c_wrongbird_head', all: 'c_wrongbird_body' }, { fit: { east: true, west: true } });
    mb.box(0, -0.008, 0.05, 0.012, 0.012, 0.03, 'c_wrongbird_belly', { color: 0xc8a050 }); // beak
  });
  void head;
  // wings: folded strips against the body; open into rigid cards in flight
  partB(rig, 'wingL', torso, [-0.035, 0.02, 0.03], (mb) => { mb.quadRaw([[0, 0, -0.1], [-0.17, 0, -0.1], [-0.17, 0, 0.02], [0, 0, 0.02]], [[0, 0], [1, 0], [1, 1], [0, 1]], 'c_wrongbird_wing'); }, matB('card'));
  partB(rig, 'wingR', torso, [0.035, 0.02, 0.03], (mb) => { mb.quadRaw([[0, 0, -0.1], [0.17, 0, -0.1], [0.17, 0, 0.02], [0, 0, 0.02]], [[0, 0], [1, 0], [1, 1], [0, 1]], 'c_wrongbird_wing'); }, matB('card'));
  for (const [i, x] of [[0, 0.018], [1, -0.018]] as const) {
    part(rig, 'leg' + i, torso, [x, -0.035, 0.005], (mb) => {
      mb.box(0, -0.04, 0, 0.007, 0.04, 0.007, 'c_wrongbird_belly', { color: 0xa08060 });
      mb.box(0, -0.042, 0.008, 0.016, 0.004, 0.022, 'c_wrongbird_belly', { color: 0xa08060 }); // toes
    });
  }
  return rig;
}

interface BirdVis { t: number; x: number; z: number; ry: number; fly: number; head: number }

function animateBird(rig: Rig, c: Creature, t: number, dt: number) {
  const P = rig.parts;
  const n = netOf(c);
  const ud = rig.root.userData as { v?: BirdVis };
  const v = ud.v || (ud.v = { t: 0, x: c.x, z: c.z, ry: rig.root.rotation.y, fly: 0, head: 0 });
  const seed = hashId(c.id);
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
    torso.position.y = 0.03;
    P.wingL.rotation.z = 0; P.wingR.rotation.z = 0;
    head.rotation.set(0.4, 2.2, 0); // neck at an impossible angle
    return;
  }
  torso.position.y = 0.11;
  // wings: folded on the ground, rigidly spread (and never beating) in the air
  const spread = v.fly;
  P.wingL.rotation.set(0, (1 - spread) * -1.35, (1 - spread) * 1.45);
  P.wingR.rotation.set(0, (1 - spread) * 1.35, (1 - spread) * -1.45);
  P.wingL.scale.setScalar(0.55 + spread * 0.45); P.wingR.scale.setScalar(0.55 + spread * 0.45);
  // legs dangle in flight, hop on the ground
  const hop = !flying && moving ? Math.abs(Math.sin(c.phase * 2)) * 0.03 : 0;
  torso.position.y += hop;
  P.leg0.rotation.x = spread * 0.9; P.leg1.rotation.x = spread * 0.9;
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
