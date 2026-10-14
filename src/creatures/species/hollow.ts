import { def, newRig, Rig } from '../species';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { makeRamp, ph } from '../../gfx/pixel';
import { tileFbm } from '../../core/rng';
import { lineOfSight } from '../../world/collision';
import { G } from '../../game/G';
import type { Creature } from '../creature';
import type { Player } from '../../entities/player';
import {
  CS, zoneOf, nm, netSet, pulse, attack, playersIn, stop, dist, faceTo, facingTo, torchOn, lightAt, speak, showSpeech,
  objectsNear, walkable, partMat, ghostMat, galleryPose, h01, idHash, sfx,
} from '../behaviors_a';

// =====================================================================================
// HOLLOW — someone who stayed too long. Faded office clothes, a face rendered
// at the lowest level of detail, a routine they cannot stop repeating. Harmless
// until you get close in the dark or shine a light in their face.
// =====================================================================================

addTextureModule(() => {
  const A = atlas();
  A.add('c_hollow_shirt', 16, 16, (pc) => {
    const R = makeRamp(0x8e9aa4, 6, { hueShift: 0.02 });
    pc.fillRamp(R, (x, y) => 0.55 + (tileFbm(x, y, 16, 16, 2, 2, 61) - 0.5) * 0.2, 0.5);
    for (let y = 0; y < 16; y += 4) for (let x = 0; x < 16; x++) if ((x + y) % 8 < 2) pc.blend(x, y, R[4], 0.25); // a pattern that has faded out
  });
  A.add('c_hollow_slacks', 16, 16, (pc) => {
    const R = makeRamp(0x6a6a66, 6, { hueShift: 0.01 });
    pc.fillRamp(R, (x, y) => 0.5 + (tileFbm(x, y, 16, 16, 2, 2, 62) - 0.5) * 0.18 + (x === 7 ? 0.08 : 0), 0.5);
  });
  A.add('c_hollow_skin', 8, 8, (pc) => {
    const R = makeRamp(0xb0a49a, 5, { hueShift: 0.02 });
    pc.fillRamp(R, (x, y) => 0.55 + (ph(x, y, 63) - 0.5) * 0.1, 0.3);
  });
  A.add('c_hollow_hair', 8, 8, (pc) => {
    const R = makeRamp(0x5a5048, 5);
    pc.fillRamp(R, (x, y) => 0.5 + (ph(x, y, 64) - 0.5) * 0.25, 0.5);
  });
  // the face: a 5x6 level-of-detail texture, stretched — eyes and mouth are just smudges
  A.add('c_hollow_face', 5, 6, (pc) => {
    pc.wrap = false;
    pc.fill(0xb0a49a);
    pc.set(1, 2, 0x5a524c); pc.set(3, 2, 0x5a524c);
    pc.set(2, 3, 0x9a8e84);
    pc.set(1, 4, 0x7a6e66); pc.set(2, 4, 0x6a5e58); pc.set(3, 4, 0x7a6e66);
    pc.set(0, 0, 0x5a5048); pc.set(1, 0, 0x5a5048); pc.set(2, 0, 0x5a5048); pc.set(3, 0, 0x5a5048); pc.set(4, 0, 0x5a5048);
  });
  // what the face turns into when it is angry: static
  A.add('c_hollow_static', 8, 8, (pc) => {
    pc.wrap = false;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const v = ph(x, y, 65); pc.set(x, y, v < 0.4 ? 0x141418 : v < 0.75 ? 0x5a5a66 : 0xd0d0dc); }
  });
});

const SHIRT = 'c_hollow_shirt', SLACK = 'c_hollow_slacks', SKIN = 'c_hollow_skin';

function buildHollow(): Rig {
  const rig = newRig(1.8);
  const M = ghostMat();
  const hips = partMat(rig, 'hips', rig.body, [0, 0.92, 0], M, (mb) => { mb.box(0, -0.1, 0, 0.32, 0.16, 0.19, SLACK); });
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    const th = partMat(rig, 'thigh' + n, hips, [s * 0.085, -0.08, 0], M, (mb) => { mb.box(0, -0.43, 0, 0.12, 0.43, 0.14, SLACK); });
    partMat(rig, 'shin' + n, th, [0, -0.43, 0], M, (mb) => {
      mb.box(0, -0.34, 0, 0.11, 0.34, 0.12, SLACK);
      mb.box(0, -0.41, 0.03, 0.11, 0.07, 0.24, 'leather_brown', { color: 0x9a948c });
    });
  }
  const spine = partMat(rig, 'spine', hips, [0, 0.06, 0], M, (mb) => {
    mb.box(0, 0, 0, 0.36, 0.5, 0.2, SHIRT);
    mb.box(0, 0.44, 0.0, 0.4, 0.07, 0.2, SHIRT);
    mb.box(0, 0.47, 0.04, 0.14, 0.03, 0.12, 'white', { color: 0xc8ccd0 }); // collar
    mb.box(0, 0.12, 0.102, 0.01, 0.34, 0.004, 'fabric_blue', { color: 0x6a7080 }); // lanyard, no badge
    mb.box(0, 0.11, 0.104, 0.03, 0.03, 0.004, 'metal_grey'); // the empty clip
  });
  const neck = partMat(rig, 'neck', spine, [0, 0.5, 0], M, (mb) => { mb.box(0, 0, 0, 0.08, 0.08, 0.08, SKIN); });
  const head = partMat(rig, 'head', neck, [0, 0.07, 0.01], M, (mb) => {
    mb.box(0, 0, 0, 0.19, 0.24, 0.21, { south: 'c_hollow_face', all: SKIN }, { fit: { south: true } });
    mb.box(0, 0.2, -0.01, 0.2, 0.07, 0.22, 'c_hollow_hair');
    mb.box(0, 0.08, -0.105, 0.2, 0.15, 0.03, 'c_hollow_hair');
  });
  partMat(rig, 'static', head, [0, 0, 0], M, (mb) => { mb.box(0, -0.005, 0.005, 0.2, 0.25, 0.21, { south: 'c_hollow_static', all: 'c_hollow_static' }, { fit: true }); });
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    const ua = partMat(rig, 'uarm' + n, spine, [s * 0.23, 0.46, 0], M, (mb) => { mb.box(0, -0.32, 0, 0.1, 0.32, 0.11, SHIRT); });
    const fa = partMat(rig, 'farm' + n, ua, [0, -0.32, 0], M, (mb) => {
      mb.box(0, -0.27, 0, 0.09, 0.27, 0.1, SHIRT);
      mb.box(0, -0.38, 0.0, 0.07, 0.11, 0.08, SKIN);
    });
    void fa;
  }
  return rig;
}

const LINES = [
  'Have you seen my badge?', 'Is it Tuesday?', 'I just need to finish this one thing.', 'The meeting got moved again.',
  'What floor is this?', 'My shift ended a while ago.', 'Do you know the way out? I knew it this morning.',
  'They said it would only take a minute.', 'I can\'t remember my desk number.', 'Did the lights always hum like that?',
  'Sorry — I think you\'re in my seat.', 'I parked on P3. Or P4.', 'Is that my coffee?', 'I keep hearing the elevator.',
  'Five more minutes.', 'Same as yesterday.',
];
const ANGRY = ['TURN IT OFF.', 'Don\'t look at me.', 'You\'re not on the list.', 'STAY.', 'I was here first.', 'Stop. STOP.'];
function garble(s: string, amt: number) {
  const r = CS().rng;
  return s.split('').map((ch) => (ch !== ' ' && r.chance(amt) ? '#%&*?_/'.charAt(Math.floor(r.next() * 7)) : ch)).join('');
}

function pose(rig: Rig, mode: 'walk' | 'stand' | 'sit' | 'watch' | 'grab', phase: number, t: number, moving: boolean) {
  const P = rig.parts;
  const z = (n: string) => P[n].rotation.set(0, 0, 0);
  for (const n of ['hips', 'spine', 'neck', 'head', 'thighL', 'thighR', 'shinL', 'shinR', 'uarmL', 'uarmR', 'farmL', 'farmR']) z(n);
  rig.body.position.y = 0;
  P.spine.rotation.x = 0.06;
  if (mode === 'sit') {
    rig.body.position.y = -0.44;
    P.thighL.rotation.x = P.thighR.rotation.x = -1.5;
    P.shinL.rotation.x = P.shinR.rotation.x = 1.45;
    P.uarmL.rotation.x = P.uarmR.rotation.x = -0.7;
    P.farmL.rotation.x = -0.9 + Math.max(0, Math.sin(t * 17)) * 0.08;
    P.farmR.rotation.x = -0.9 + Math.max(0, Math.sin(t * 15 + 1)) * 0.08;
    P.head.rotation.x = 0.25;
    return;
  }
  if (moving) {
    const sw = Math.sin(phase * 0.8);
    P.thighL.rotation.x = sw * 0.32; P.thighR.rotation.x = -sw * 0.32;
    P.shinL.rotation.x = Math.max(0, -sw) * 0.4; P.shinR.rotation.x = Math.max(0, sw) * 0.4;
    P.uarmL.rotation.x = -sw * 0.12; P.uarmR.rotation.x = sw * 0.12;
    rig.body.position.y = Math.abs(Math.cos(phase * 0.8)) * 0.02;
    P.head.rotation.x = 0.2; // looking at the floor
  }
  if (mode === 'watch') { P.head.rotation.z = 0.35; P.head.rotation.x = -0.05; P.neck.rotation.x = -0.1; }
  if (mode === 'grab') {
    P.uarmL.rotation.x = -1.35; P.uarmR.rotation.x = -1.45; P.farmL.rotation.x = -0.2; P.farmR.rotation.x = -0.1;
    P.spine.rotation.x = 0.22; P.head.rotation.x = -0.25;
  }
}

function animateHollow(rig: Rig, c: Creature, t: number, dt: number) {
  void dt;
  const n = nm(c);
  const hostile = !!n.angry || c.state === 'chase';
  const mode = c.attackPhase > 0 || (hostile && c.speed > 0.1) ? 'grab' : n.sit ? 'sit' : c.state === 'watch' ? 'watch' : 'stand';
  pose(rig, mode, c.phase, t, c.speed > 0.1);
  // desync: slices of the body tear sideways for a frame or two
  const P = rig.parts;
  const slot = Math.floor(t * 9), seed = idHash(c) * 97;
  const amt = hostile ? 0.22 : 0.05;
  for (const name of ['spine', 'head', 'thighL', 'uarmR']) {
    const g = h01(slot + seed, name.length);
    P[name].position.x = (P[name].userData.x0 ??= P[name].position.x) + (g < amt ? (h01(slot, seed) - 0.5) * 0.18 : 0);
  }
  // the face gives way to static when it is angry (and, rarely, when it is not)
  P.static.visible = hostile ? h01(Math.floor(t * 14), seed) < 0.6 : h01(Math.floor(t * 3), seed) < 0.03;
  // rubber-banding: once in a while it is drawn where it was a moment ago
  const hist: number[][] = (c.mem._hist ??= []);
  hist.push([c.x, c.z]); if (hist.length > 40) hist.shift();
  if (!c.dead && h01(Math.floor(t * 2.2), seed + 3) < (hostile ? 0.18 : 0.06) && (t * 2.2) % 1 < 0.3) {
    const o = hist[0]; rig.root.position.x = o[0]; rig.root.position.z = o[1];
  }
  showSpeech(c, 2.0);
}

// ---------------------------------------------------------------- the routine
interface Routine { pts: { x: number; z: number }[]; sit: { x: number; z: number; f: number } | null; i: number }
function buildRoutine(c: Creature): Routine {
  const z = zoneOf(c), rng = CS().rng;
  let sit: Routine['sit'] = null;
  // a chair at a desk, or failing that a free tile beside any desk/counter
  const desks = objectsNear(z, c.home.x, c.home.z, 12, (o, d) => /desk|table|counter|reception|bench/.test(o.key) || !!d.tags?.includes('desk'), 16);
  const chairs = objectsNear(z, c.home.x, c.home.z, 12, (o, d) => !!d.tags?.includes('chair') || /chair|stool/.test(o.key), 16);
  for (const ch of rng.shuffle(chairs)) {
    const dk = desks.find((d) => Math.abs(d.x - ch.x) <= 1 && Math.abs(d.y - ch.y) <= 1);
    if (dk && walkable(z, ch.x, ch.y)) { sit = { x: ch.x + 0.5, z: ch.y + 0.5, f: Math.atan2(dk.y - ch.y, dk.x - ch.x) }; break; }
  }
  if (!sit) for (const dk of rng.shuffle(desks)) {
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const x = dk.x + dx, y = dk.y + dy;
      if (walkable(z, x, y) && !z.objectsAt(x, y).length) { sit = { x: x + 0.5, z: y + 0.5, f: Math.atan2(-dy, -dx) }; break; }
    }
    if (sit) break;
  }
  const pts: { x: number; z: number }[] = [];
  const from = sit ?? c.home;
  for (let tries = 0; tries < 30 && pts.length < 3; tries++) {
    const x = Math.floor(from.x + rng.float(-6, 6)), y = Math.floor(from.z + rng.float(-6, 6));
    if (!walkable(z, x, y) || z.solid[z.idx(x, y)]) continue;
    if (!lineOfSight(z, from.x, from.z, x + 0.5, y + 0.5)) continue;
    pts.push({ x: x + 0.5, z: y + 0.5 });
  }
  if (!pts.length) pts.push({ x: c.home.x, z: c.home.z });
  return { pts, sit, i: 0 };
}

function annoyedBy(c: Creature, dt: number): Player | null {
  const z = zoneOf(c);
  let who: Player | null = null;
  for (const p of playersIn(c)) {
    const d = dist(p.x, p.z, c.x, c.z);
    if (d > 9) continue;
    if (!lineOfSight(z, p.x, p.z, c.x, c.z)) continue;
    const dark = lightAt(c.zoneKey, c.x, c.z) < 0.22 && !torchOn(p, c.x, c.z, 9, 0.6);
    const glare = torchOn(p, c.x, c.z, 8, 0.32) && facingTo(c, p.x, p.z, 1.3);
    if ((dark && d < 2.4) || glare) { who = p; break; }
  }
  c.mem.annoy = who ? (c.mem.annoy ?? 0) + dt : Math.max(0, (c.mem.annoy ?? 0) - dt * 0.5);
  return c.mem.annoy > 0.7 ? who : null;
}

function goHostile(c: Creature, p: Player) {
  c.targetId = p.id; c.setState('chase');
  netSet(c, 'angry', 1); netSet(c, 'sit', 0);
  CS().call(c, 'alert');
  speak(c, garble(ANGRY[Math.floor(CS().rng.next() * ANGRY.length)], 0.12), 2.5);
  c.mem.calmAt = G.time + 16;
}

function thinkHollow(c: Creature, dt: number): boolean {
  const cs = CS(), z = zoneOf(c);
  const ev = pulse(c);
  if (!c.mem.routine) c.mem.routine = buildRoutine(c);
  const R: Routine = c.mem.routine;
  const T = c.targetId ? G.players.get(c.targetId) ?? null : null;
  if (c.state !== 'chase') {
    const who = annoyedBy(c, dt);
    if (who) { goHostile(c, who); return true; }
    if (ev.staggered && T) { goHostile(c, T); return true; }
  }
  // muttering and the occasional line
  if (c.noiseCooldown <= 0 && cs.rng.chance(dt * 0.07)) { cs.call(c, 'idle'); c.noiseCooldown = 10; }
  if (c.state !== 'chase' && G.time > (c.mem.lineAt ?? 0)) {
    const near = playersIn(c).some((p) => dist(p.x, p.z, c.x, c.z) < 10 && lineOfSight(z, p.x, p.z, c.x, c.z));
    c.mem.lineAt = G.time + (near ? 18 + cs.rng.float(0, 22) : 6);
    if (near) speak(c, garble(LINES[Math.floor(cs.rng.next() * LINES.length)], 0.03));
  }
  switch (c.state) {
    case 'chase': {
      if (!nm(c).angry) { c.mem.calmAt = G.time + 16; cs.call(c, 'alert'); } // struck: the manager put it straight into a chase
      netSet(c, 'angry', 1); netSet(c, 'sit', 0);
      if (!T || T.body.dead || T.zoneKey !== c.zoneKey) { calm(c); return true; }
      const d = dist(T.x, T.z, c.x, c.z);
      const sees = lineOfSight(z, T.x, T.z, c.x, c.z);
      if (sees) c.mem.seenT = G.time;
      if (G.time > (c.mem.calmAt ?? 0) || d > 16 || G.time - (c.mem.seenT ?? G.time) > 6) { calm(c); return true; }
      const reach = (c.sp.attack?.range ?? 0.85) + T.radius;
      if (d <= reach) { faceTo(c, T.x, T.z); stop(c); if (c.attackT <= 0) attack(c, T); return true; }
      cs.moveTo(c, z, T.x, T.z, c.sp.run, dt, reach * 0.8);
      if (c.noiseCooldown <= 0 && cs.rng.chance(dt * 0.3)) { sayAngry(c); c.noiseCooldown = 4; }
      return true;
    }
    case 'watch': {
      stop(c); netSet(c, 'sit', 0);
      const p = T && dist(T.x, T.z, c.x, c.z) < 8 ? T : null;
      if (p) faceTo(c, p.x, p.z);
      if (!p || c.stateT > (c.mem.watchFor ?? 4)) { c.setState('travel'); c.mem.watchCool = G.time + 14; }
      return true;
    }
    default: {
      // stare at anyone who comes close (it does not blink)
      if (G.time > (c.mem.watchCool ?? 0) && c.state !== 'nest') {
        const p = playersIn(c).find((q) => dist(q.x, q.z, c.x, c.z) < 5.5 && lineOfSight(z, q.x, q.z, c.x, c.z));
        if (p) { c.targetId = p.id; c.setState('watch'); c.mem.watchFor = 3 + cs.rng.float(0, 2.5); if (cs.rng.chance(0.5)) sfx(c, 'hollow_moan', 0.7); return true; }
      }
      return routine(c, R, dt);
    }
  }
}
function sayAngry(c: Creature) { speak(c, garble(ANGRY[Math.floor(CS().rng.next() * ANGRY.length)], 0.15), 2.2); }
function calm(c: Creature) {
  c.setState('travel'); c.targetId = null; c.awareness.clear();
  netSet(c, 'angry', 0); c.mem.annoy = 0; c.mem.watchCool = G.time + 10;
}

/** walk the same short loop, sit at the same desk, for ever */
function routine(c: Creature, R: Routine, dt: number): boolean {
  const cs = CS(), z = zoneOf(c);
  const steps = R.pts.length + (R.sit ? 1 : 0);
  const i = R.i % steps;
  const atDesk = R.sit && i === R.pts.length;
  const goal = atDesk ? R.sit! : R.pts[i];
  if (c.state === 'nest') {
    // seated: typing at nothing
    stop(c); c.x = goal.x; c.z = goal.z; c.facing = c.targetFacing = (goal as any).f ?? c.facing;
    netSet(c, 'sit', 1);
    if (c.stateT > 22) { netSet(c, 'sit', 0); R.i++; c.setState('travel'); }
    return true;
  }
  if (c.state === 'idle') {
    stop(c); netSet(c, 'sit', 0);
    if (c.stateT > 2.5) { R.i++; c.setState('travel'); }
    return true;
  }
  if (c.state !== 'travel') c.setState('travel');
  netSet(c, 'sit', 0);
  if (cs.moveTo(c, z, goal.x, goal.z, c.sp.walk, dt, atDesk ? 0.15 : 0.4) || c.stateT > 30) {
    c.setState(atDesk ? 'nest' : 'idle');
  }
  return true;
}

const sp = def({
  key: 'hollow', name: 'Hollow', code: 'H-00 // DESYNCED STAFF', temperament: 'neutral', threat: 2,
  hp: 45, walk: 1.0, run: 3.4, turn: 7, radius: 0.28, height: 1.8, sight: 12, fov: 1.2, hearing: 0.8,
  attack: { dmg: [5, 10], range: 0.85, cooldown: 1.4, kinds: ['scratch', 'bruise', 'bite'], corrupt: 0.4, knock: 0.2, grab: true, parts: ['uarm_l', 'uarm_r', 'farm_l', 'farm_r', 'neck', 'torso_u'] },
  zones: ['office', 'pools', 'suburbs', 'stairwell', 'mall', 'market', 'parking', 'hospital', 'lab', 'corrupt'], weight: 2, maxPerZone: 4, diet: 'none',
  flags: { glitch: true },
  sounds: { idle: 'hollow_mutter', alert: 'hollow_shriek', attack: 'hollow_moan', hurt: 'static_burst', death: 'hollow_die', step: 'step_carpet' },
  scan: {
    cls: 'Desynced human',
    notes: [
      'A person who stayed in the simulation too long. Rendered at the lowest level of detail.',
      'Repeats a short routine: the same loop, the same desk, the same questions.',
      'Harmless — unless you get close to it in the dark, or shine a light in its face.',
      'Its grab carries a high chance of corruption. Keep the torch pointed at the floor.',
      'It calms down and forgets you if you get out of sight.',
    ],
  },
  build: buildHollow,
  animate: animateHollow,
  think: thinkHollow,
});
(sp as any).animateGallery = (rig: Rig, t: number) => {
  const q = galleryPose('stand');
  pose(rig, q === 'sit' ? 'sit' : q === 'grab' ? 'grab' : q === 'watch' ? 'watch' : 'stand', t * 5, t, q === 'walk');
  rig.parts.static.visible = q === 'grab';
};
