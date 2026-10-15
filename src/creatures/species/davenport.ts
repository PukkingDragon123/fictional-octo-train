import { def, newRig, part, gait, Rig } from '../species';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { makeRamp, ph } from '../../gfx/pixel';
import { tileFbm } from '../../core/rng';
import { bus } from '../../core/events';
import { G } from '../../game/G';
import { queueAt } from '../../actions/basic';
import { UseObjectAction } from '../../actions/world';
import type { Creature } from '../creature';
import {
  CS, zoneOf, pulse, attack, nearestPlayer, playersIn, stop, dist, faceTo, findSpot, walkable, anyPlayerSees,
  creatureMenu, poke, poked, heardMargin, suppressSighting, galleryPose, onPlayerHit, HeldAction,
} from '../behaviors_a';

// =====================================================================================
// DAVENPORT — a sofa that is also a bear. Corduroy hide, cushion back hunched
// like shoulders, a mouth where you would sit. It sleeps as furniture, wakes
// angry, charges, and then lumbers off to become a sofa somewhere else.
// =====================================================================================

addTextureModule(() => {
  const A = atlas();
  // mustard-brown corduroy worn shiny, with coarse hairs growing out of the seams
  A.add('c_davenport_hide', 32, 32, (pc) => {
    const R = makeRamp(0x6e5434, 7, { hueShift: 0.03, satShift: 0 });
    pc.fillRamp(R, (x, y) => 0.5 + ((x & 1) ? 0.035 : -0.025) + (tileFbm(x, y, 32, 32, 2, 3, 31) - 0.5) * 0.28, 0.5);
    // worn, shiny patches where people sat for decades
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if (tileFbm(x, y, 32, 32, 3, 2, 77) > 0.66) pc.blend(x, y, R[5], 0.25);
    pc.stain(9, 22, 4, 0x4e3a20, 0x5a4426, 3);
    // a few coarse hairs growing out of the weave
    for (let i = 0; i < 7; i++) { const x = Math.floor(ph(i, 1, 9) * 30), y = Math.floor(ph(i, 2, 9) * 30); pc.set(x, y, R[0]); pc.set(x + 1, y + 1, R[1]); }
  });
  // seat cushion top: corduroy, piping, a button, an old cigarette burn
  A.add('c_davenport_cushion', 32, 24, (pc) => {
    pc.wrap = false;
    const R = makeRamp(0x7a5e3a, 7, { hueShift: 0.03 });
    pc.fillRamp(R, (x, y) => 0.55 + ((x & 1) ? 0.035 : -0.025) - Math.abs(y - 11.5) * 0.008 - Math.abs(x - 15.5) * 0.004 + (ph(x, y, 5) - 0.5) * 0.05, 0.5);
    pc.strokeRect(0, 0, 32, 24, R[2]);
    for (let x = 1; x < 31; x++) pc.set(x, 1, R[5]);
    for (const bx of [8, 24]) { pc.set(bx, 11, R[0]); pc.set(bx + 1, 11, R[1]); pc.set(bx, 12, R[1]); }
    pc.ellipse(20, 17, 1.5, 1, 0x2a1a0a); pc.set(20, 16, 0x5a3a1a);
  });
  // the inside of the seat
  A.add('c_davenport_maw', 48, 16, (pc) => {
    pc.wrap = false;
    const R = makeRamp(0x8a1c22, 6, { hueShift: -0.04 });
    pc.fillRamp(R, (x, y) => 0.15 + Math.abs(y - 7.5) * 0.07 + (tileFbm(x, y, 48, 16, 4, 2, 12) - 0.5) * 0.2, 0.8);
    for (let x = 0; x < 48; x++) { pc.set(x, 7, 0x0e0204); pc.set(x, 8, 0x140406); }
    // springs coiled in the gums
    for (let sx = 5; sx < 48; sx += 11) for (let k = 0; k < 6; k++) { pc.set(sx + (k & 1), 3 + k, 0x8a8a84); pc.set(sx + 2 - (k & 1), 9 + (k >> 1), 0x6a6a64); }
    // molars along both lips
    for (let x = 1; x < 47; x += 3) { pc.rect(x, 0, 2, 2, 0xe0d6bc); pc.set(x + 1, 1, 0xb0a68e); pc.rect(x, 14, 2, 2, 0xd8ceb4); pc.set(x, 14, 0xf0e8d0); }
  });
  A.add('c_davenport_claw', 8, 8, (pc) => {
    const R = makeRamp(0x2a221c, 5);
    pc.fillRamp(R, (x, y) => 0.3 + y * 0.06 + (x === 0 ? 0.2 : 0), 0.4);
  });
});

const HIDE = 'c_davenport_hide';
const W = 1.8, D = 0.86;

function buildDavenport(): Rig {
  const rig = newRig(0.9);
  const base = part(rig, 'base', rig.body, [0, 0.1, 0], (mb) => {
    mb.box(0, 0, 0, W, 0.3, D, HIDE);
    mb.box(0, 0.0, D / 2 - 0.01, W - 0.04, 0.035, 0.03, HIDE, { color: 0xc0a080 }); // piping
    mb.box(0, 0.27, 0.05, W - 0.38, 0.012, D - 0.32, { top: 'c_davenport_maw', all: 'c_davenport_maw' }, { fit: { top: true } }); // what is under the cushions
  });
  // legs: little turned wooden feet (sofa) and fabric bear legs (not sofa)
  const corners: [string, number, number][] = [['legFL', -1, 1], ['legFR', 1, 1], ['legBL', -1, -1], ['legBR', 1, -1]];
  for (const [n, sx, sz] of corners) {
    const leg = part(rig, n, base, [sx * (W / 2 - 0.12), 0.02, sz * (D / 2 - 0.12)], (mb) => {
      mb.cylinder(0, -0.12, 0, 0.03, 0.12, 6, 'wood_dark', { rTop: 0.024 });
    });
    part(rig, n + 'paw', leg, [0, 0, 0], (mb) => {
      mb.box(0, -0.38, 0, 0.24, 0.38, 0.26, HIDE);
      mb.box(0, -0.12, 0, 0.28, 0.14, 0.3, HIDE, { color: 0xd8ccbc }); // haunch
      mb.box(0, -0.42, 0.04, 0.27, 0.06, 0.32, HIDE, { color: 0x9a8a78 });
      for (let k = -1; k <= 1; k++) mb.wedge(k * 0.08, -0.42, 0.24, 0.045, 0.1, 0.055, 0.0, 'c_davenport_claw');
    });
  }
  // the seat splits along the middle like a pair of lips
  const lipF = part(rig, 'lipF', base, [0, 0.3, D / 2 - 0.04], (mb) => {
    mb.box(0, 0, -0.2, W - 0.38, 0.14, 0.4, { top: 'c_davenport_cushion', all: HIDE }, { fit: { top: true }, color: 0xf2ece4 });
    for (let k = 0; k < 12; k++) mb.box(-0.62 + k * 0.113, -0.04, -0.38, 0.04, 0.05, 0.03, 'white', { color: 0xe2d8bc }); // teeth under the front cushion
  });
  void lipF;
  const lipB = part(rig, 'lipB', base, [0, 0.3, -0.16], (mb) => {
    mb.box(0, 0, 0.0, W - 0.38, 0.14, 0.18, { top: 'c_davenport_cushion', all: HIDE }, { fit: { top: true }, color: 0xe8e0d6 });
    for (let k = 0; k < 12; k++) mb.box(-0.62 + k * 0.113, -0.04, 0.16, 0.04, 0.05, 0.03, 'white', { color: 0xd8ceb2 });
  });
  void lipB;
  const back = part(rig, 'back', base, [0, 0.3, -D / 2 + 0.12], (mb) => {
    mb.box(0, 0, 0, W - 0.02, 0.48, 0.24, HIDE);
    for (const x of [-0.48, 0, 0.48]) { mb.push().translate(x, 0.12, 0.16).rotateX(-0.2); mb.box(0, 0, 0, 0.46, 0.36, 0.16, HIDE, { color: 0xf0e8de }); mb.pop(); }
  });
  part(rig, 'hump', back, [0, 0.44, -0.02], (mb) => {
    // shoulders: only there when it is awake
    mb.box(0, 0, 0, 1.45, 0.26, 0.34, HIDE, { color: 0xd8ccbc });
    mb.box(0, 0.2, -0.02, 1.0, 0.18, 0.28, HIDE, { color: 0xccbfae });
    mb.box(0, 0.34, -0.02, 0.5, 0.1, 0.2, HIDE, { color: 0xc4b6a4 });
  });
  // eyes in the crease between the back cushions: dark until it wakes
  const eyes = part(rig, 'eyes', back, [0, 0.2, 0.25], (mb) => {
    mb.box(-0.24, 0, 0, 0.03, 0.025, 0.01, 'c_eye_glow', { color: 0xffe0a0, emissive: 1.2 });
    mb.box(0.24, 0, 0, 0.03, 0.025, 0.01, 'c_eye_glow', { color: 0xffe0a0, emissive: 1.2 });
  }, true);
  rig.eyes = [eyes];
  for (const s of [-1, 1]) {
    part(rig, s < 0 ? 'armL' : 'armR', base, [s * (W / 2 - 0.09), 0.3, 0.02], (mb) => {
      mb.box(0, 0, 0, 0.18, 0.24, D - 0.06, HIDE);
      mb.cylinderZ(0, 0.24, 0, 0.09, D - 0.06, 8, HIDE, { caps: true });
    });
  }
  return rig;
}

/** k: 0 sofa .. 1 bear; jaw 0..1; walk phase */
function pose(rig: Rig, k: number, jaw: number, moving: boolean, phase: number, t: number) {
  const P = rig.parts;
  const breathe = Math.sin(t * 1.3) * 0.012 * k;
  rig.body.position.y = 0.32 * k + (moving ? Math.abs(Math.sin(phase)) * 0.05 : 0);
  P.base.rotation.z = moving ? Math.sin(phase) * 0.06 : 0;
  P.base.rotation.x = -0.08 * k - jaw * 0.12;
  const legs = ['legFL', 'legFR', 'legBL', 'legBR'];
  legs.forEach((n, i) => {
    const paw = P[n + 'paw'];
    paw.scale.set(1, Math.max(0.001, k), 1);
    paw.visible = k > 0.02;
    P[n].rotation.x = moving ? gait(phase, i, 0.5) * k : 0;
  });
  // the seat opens along the crease: the front cushion sags, the rear one rears up with the back
  P.lipF.rotation.x = -jaw * 0.22 + breathe;
  P.lipB.rotation.x = -jaw * 1.1;
  P.back.rotation.x = 0.55 * k - jaw * 0.55 + breathe * 2;
  P.hump.scale.set(1, Math.max(0.001, k), Math.max(0.001, k));
  P.hump.visible = k > 0.02;
  P.armL.rotation.z = 0.35 * k; P.armR.rotation.z = -0.35 * k;
  P.armL.rotation.x = P.armR.rotation.x = 0.12 * k;
  P.eyes.visible = k > 0.5;
}

function animateDavenport(rig: Rig, c: Creature, t: number, dt: number) {
  const sofa = c.state === 'disguised' || c.state === 'hide' || c.state === 'sleep';
  suppressSighting(c, c.state === 'disguised');
  const target = sofa || c.dead ? 0 : 1;
  const r = c.mem._rv ?? target;
  c.mem._rv = r + Math.sign(target - r) * Math.min(Math.abs(target - r), dt * (target ? 1.6 : 0.6));
  const jaw = c.attackPhase > 0 ? 1 : c.state === 'warn' ? 0.55 + Math.sin(t * 5) * 0.2 : c.state === 'chase' ? 0.25 : 0;
  pose(rig, c.mem._rv, jaw, c.speed > 0.2, c.phase, t);
  if (rig.eyes && c.mem._rv < 0.5) for (const e of rig.eyes) e.visible = false;
  if (c.hitFlash > 0) rig.body.position.x = Math.sin(t * 70) * 0.03; else rig.body.position.x = 0;
}

/** distance from a point to the sofa's footprint rectangle */
function rectDist(c: Creature, x: number, z: number) {
  const dx = x - c.x, dz = z - c.z, f = c.facing;
  const lx = dx * Math.sin(f) - dz * Math.cos(f), lz = dx * Math.cos(f) + dz * Math.sin(f);
  return Math.hypot(Math.max(0, Math.abs(lx) - W / 2), Math.max(0, Math.abs(lz) - D / 2));
}

/** a spot against a wall, out of sight, to become a sofa again */
function settleSpot(c: Creature, r0 = 8, r1 = 22): { x: number; z: number; f: number } | null {
  const z = zoneOf(c), rng = CS().rng;
  for (let t = 0; t < 40; t++) {
    const a = rng.float(0, Math.PI * 2), r = rng.float(r0, r1);
    const x = Math.floor(c.x + Math.cos(a) * r), y = Math.floor(c.z + Math.sin(a) * r);
    if (!walkable(z, x, y) || !walkable(z, x - 1, y) || !walkable(z, x + 1, y)) continue;
    if (z.objectsAt(x, y).length || z.objectsAt(x - 1, y).length || z.objectsAt(x + 1, y).length) continue;
    // back against a north wall, facing into the room (+z)
    const i = z.idx(x, y);
    if (!z.wallN[i] || z.edges.get(i * 2)) continue;
    if (anyPlayerSees(c.zoneKey, x + 0.5, y + 0.5, 20)) continue;
    const np = nearestPlayer(c, Infinity);
    if (np && dist(np.p.x, np.p.z, x + 0.5, y + 0.5) < Math.min(9, r1)) continue;
    return { x: x + 0.5, z: y + 0.55, f: Math.PI / 2 };
  }
  const s = findSpot(c, { rMin: r0, rMax: r1, unseen: true });
  return s ? { ...s, f: c.facing } : null;
}

function wake(c: Creature, victimId: string | null) {
  if (victimId) c.targetId = victimId;
  c.setState('warn'); stop(c);
  CS().call(c, 'alert');
  c.mem.hits = 0; c.mem.stuck = 0;
}

function thinkDavenport(c: Creature, dt: number): boolean {
  const cs = CS(), z = zoneOf(c);
  const ev = pulse(c);
  const T = c.targetId ? G.players.get(c.targetId) ?? null : null;
  switch (c.state) {
    case 'disguised':
    case 'hide': {
      stop(c);
      if (!c.mem.placed) {
        // fresh spawn: shuffle back against a wall like proper furniture
        c.mem.placed = true;
        const s = settleSpot(c, 0, 7);
        if (s) { c.x = s.x; c.z = s.z; c.facing = c.targetFacing = s.f; }
        else c.facing = c.targetFacing = Math.round(c.facing / (Math.PI / 2)) * (Math.PI / 2);
      }
      if (c.state === 'hide' && !c.observed && c.stateT > 1.2) { c.setState('disguised'); c.awareness.clear(); c.targetId = null; return true; }
      const by = poked(c, 'sit') || poked(c, 'search');
      if (by) { wake(c, by); return true; }
      // bumped into: someone brushing the cushions
      let bumper: string | null = null;
      for (const p of playersIn(c)) {
        const d = rectDist(c, p.x, p.z);
        if (d < p.radius + 0.1 && (p.speed > 0.3 || c.mem.bumpT > 0.6)) bumper = p.id;
        if (d < p.radius + 0.1) c.mem.bumpT = (c.mem.bumpT ?? 0) + dt; else if (d > 1) c.mem.bumpT = 0;
      }
      if (bumper) { wake(c, bumper); return true; }
      if (ev.staggered) { wake(c, c.targetId ?? nearestPlayer(c, 12)?.p.id ?? null); return true; }
      // loud things nearby (running, fighting, gunshots, breaking glass) — sneaking past is fine
      if (heardMargin(c) > 5.5) { const np = nearestPlayer(c, 12); if (np) { wake(c, np.p.id); return true; } }
      return true;
    }
    case 'warn': {
      stop(c);
      if (T) faceTo(c, T.x, T.z);
      if (c.stateT > 1.1) { c.setState(T ? 'chase' : 'flee'); if (!T) c.goal = null; }
      return true;
    }
    case 'chase': {
      if (!T || T.body.dead || T.zoneKey !== c.zoneKey) { c.setState('flee'); c.goal = null; return true; }
      const d = dist(T.x, T.z, c.x, c.z);
      if ((c.mem.hits ?? 0) >= 2 || c.stateT > 14 || d > 18 || T.body.downed) { c.setState('flee'); c.goal = null; return true; }
      const reach = (c.sp.attack?.range ?? 1) + T.radius + 0.25;
      if (d <= reach) {
        faceTo(c, T.x, T.z); stop(c);
        if (c.attackT <= 0) { attack(c, T); c.mem.hits = (c.mem.hits ?? 0) + 1; }
        return true;
      }
      // a sofa does not fit through a doorway: give up when wedged
      const lx = c.mem.lx ?? c.x, lz = c.mem.lz ?? c.z;
      c.mem.lx = c.x; c.mem.lz = c.z;
      if (c.speed > 1 && dist(lx, lz, c.x, c.z) < c.speed * dt * 0.2) c.mem.stuck = (c.mem.stuck ?? 0) + dt; else c.mem.stuck = Math.max(0, (c.mem.stuck ?? 0) - dt * 0.5);
      if (c.mem.stuck > 1.6) {
        // wedged in a doorway: back off the way it came and give up
        c.setState('flee'); cs.call(c, 'idle');
        c.goal = cs.fleeSpot(c, z, T.x, T.z); c.mem.settleF = c.facing; c.mem.stuck = 0; c.mem.tries = 0;
        return true;
      }
      cs.moveTo(c, z, T.x, T.z, c.sp.run, dt, reach * 0.8);
      if (c.noiseCooldown <= 0 && cs.rng.chance(dt * 0.5)) { cs.call(c, 'idle'); c.noiseCooldown = 3; }
      return true;
    }
    case 'flee': {
      // lumber off and find somewhere to be a sofa
      if (!c.goal) { const s = settleSpot(c); c.goal = s ? { x: s.x, z: s.z } : cs.wanderSpot(c, z, 16); c.mem.settleF = s?.f ?? c.facing; }
      const lx = c.mem.lx ?? c.x, lz = c.mem.lz ?? c.z;
      c.mem.lx = c.x; c.mem.lz = c.z;
      if (c.speed > 0.5 && dist(lx, lz, c.x, c.z) < c.speed * dt * 0.2) c.mem.stuck = (c.mem.stuck ?? 0) + dt; else c.mem.stuck = 0;
      let settle = cs.moveTo(c, z, c.goal.x, c.goal.z, c.sp.walk, dt, 0.4) || c.stateT > 25;
      if (c.mem.stuck > 1.5) {
        // too wide for wherever it was going: pick somewhere else, or just become a sofa right here
        c.mem.stuck = 0; c.mem.tries = (c.mem.tries ?? 0) + 1;
        if (c.mem.tries > 3) settle = true;
        else { const s = settleSpot(c, 4, 14); c.goal = s ? { x: s.x, z: s.z } : cs.wanderSpot(c, z, 10); c.mem.settleF = s?.f ?? c.facing; }
      }
      if (settle) {
        stop(c); c.facing = c.targetFacing = c.mem.settleF ?? c.facing;
        c.setState('hide'); c.mem.tries = 0;
      }
      if (ev.hurt > 0 && T && dist(T.x, T.z, c.x, c.z) < 4) wake(c, T.id);
      return true;
    }
    default:
      if (c.state === 'idle' || c.state === 'wander') { c.setState('flee'); c.goal = null; }
      else wake(c, c.targetId);
      return true;
  }
}

creatureMenu('davenport', (p, c, opts) => {
  if (c.state !== 'disguised' && c.state !== 'hide') return;
  opts.push({ label: 'Sit down', action: () => queueAt(p, c.x, c.z, new UseObjectAction(p, 'Sit', 0.7, 'pickup', () => poke(p, c, 'sit')), 1.4, false) });
  opts.push({ label: 'Search between the cushions', action: () => queueAt(p, c.x, c.z, new UseObjectAction(p, 'Search', 2.2, 'loot', () => { poke(p, c, 'search'); bus.emit('think', p, 'The cushions are warm. They close on my hand.'); }), 1.4, false) });
});

onPlayerHit('davenport', (p) => {
  p.actions.set(new HeldAction(p, 1.5, 'lie_side', 'Knocked down', 0.86));
  bus.emit('think', p, ['It flattened me!', 'Get up. Get up!', 'It hit like a falling wardrobe.'][Math.floor(Math.random() * 3)]);
});

const sp = def({
  key: 'davenport', name: 'Davenport', code: 'E-24 // URSID-UPHOLSTERED', temperament: 'ambush', threat: 4,
  hp: 120, walk: 1.5, run: 5.0, turn: 3.2, radius: 0.5, height: 0.9, sight: 10, fov: 1.4, hearing: 1.4,
  attack: { dmg: [14, 24], range: 1.0, cooldown: 1.9, kinds: ['bite', 'bruise', 'fracture', 'laceration'], corrupt: 0.06, knock: 2.0, parts: ['thigh_l', 'thigh_r', 'torso_l', 'torso_u', 'groin', 'farm_l', 'farm_r'] },
  zones: ['house', 'mall', 'suburbs'], weight: 1.5, maxPerZone: 2, diet: 'meat',
  meat: [['meat_raw', 3]],
  flags: { furniture: 'sofa' },
  sounds: { alert: 'sofa_groan', idle: 'sofa_groan', attack: 'davenport_roar', hurt: 'davenport_hurt', death: 'davenport_die', step: 'thud_soft' },
  scan: {
    cls: 'Ambush mimic / furniture',
    notes: [
      'A three-seater in corduroy. The seat is a mouth. The springs are in its gums.',
      'Sleeps until disturbed: sitting on it, rummaging in it, bumping it, or loud noise close by.',
      'Charges and knocks you flat, bites twice, then wanders off to become a sofa somewhere else.',
      'Too wide for doorways. Get through a door and it will give up.',
      'There are always coins and remotes inside it. Nobody knows where they came from.',
    ],
  },
  gore: { blood: 'stuffing', sever: ['legFL', 'legFR', 'legBL', 'legBR', 'armL', 'armR'], head: 'back', flesh: 0xd8ccbc },
  build: buildDavenport,
  animate: animateDavenport,
  think: thinkDavenport,
});
(sp as any).animateGallery = (rig: Rig, t: number) => {
  const q = galleryPose('');
  const k = q === 'disguised' ? 0 : q === '' ? Math.sin(t * 0.6) * 0.5 + 0.5 : 1;
  pose(rig, k, q === 'bite' ? 1 : q === 'warn' ? 0.6 : 0, q === 'walk', t * 5, t);
  rig.parts.eyes.visible = k > 0.5;
};
