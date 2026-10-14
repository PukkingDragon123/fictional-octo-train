import { def, newRig, part, Rig } from '../species';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { makeRamp, ph } from '../../gfx/pixel';
import { tileFbm } from '../../core/rng';
import { angleDiff } from '../../core/math';
import { lineOfSight } from '../../world/collision';
import { G } from '../../game/G';
import type { Creature } from '../creature';
import { CS, zoneOf, nm, netSet, pulse, attack, nearestPlayer, playersIn, lightAt, faceTo, stop, galleryPose } from '../behaviors_a';

// =====================================================================================
// THE EMPLOYEE — a mannequin assembled from buffer furniture, wearing the idea of a
// beige suit. It only moves while nobody is looking at it.
// =====================================================================================

addTextureModule(() => {
  const A = atlas();
  // beige polyester twill with a faint pinstripe: the most average suit possible
  A.add('c_employee_suit', 32, 32, (pc) => {
    const R = makeRamp(0x9a8a70, 7, { hueShift: 0.03 });
    pc.fillRamp(R, (x, y) => 0.55 + (tileFbm(x, y, 32, 32, 3, 3, 21) - 0.5) * 0.12 + (((x + y) & 3) === 0 ? 0.06 : 0) - (((x - y) & 7) === 0 ? 0.04 : 0), 0.6);
    for (let x = 3; x < 32; x += 8) for (let y = 0; y < 32; y++) if ((y & 1) === 0) pc.blend(x, y, R[5], 0.35);
    // creases that never move
    for (let i = 0; i < 4; i++) { const cx = (i * 13 + 5) % 32, cy = (i * 7 + 3) % 32; for (let k = 0; k < 5; k++) pc.blend(cx + k, cy + (k >> 1), R[2], 0.35); }
  });
  // jacket front: lapels, shirt, tie, lanyard with a blank badge
  A.add('c_employee_jacket', 24, 32, (pc) => {
    pc.wrap = false;
    const R = makeRamp(0x9a8a70, 7, { hueShift: 0.03 });
    pc.fillRamp(R, (x, y) => 0.55 + (ph(x, y, 4) - 0.5) * 0.08 + (((x + y) & 3) === 0 ? 0.05 : 0), 0.6);
    // shirt V
    for (let y = 0; y < 14; y++) { const w = Math.max(0, 6 - (y >> 1)); for (let x = 12 - w; x < 12 + w; x++) pc.set(x, y, y < 1 ? 0xd8d6cc : 0xe8e6dc); }
    // lapels (darker, with a highlight edge)
    for (let y = 0; y < 18; y++) { const w = Math.max(0, 7 - (y >> 1)); pc.set(12 - w - 1, y, R[2]); pc.set(12 - w - 2, y, R[3]); pc.set(12 + w, y, R[2]); pc.set(12 + w + 1, y, R[5]); }
    // tie: muted oxblood with diagonal stripes
    for (let y = 1; y < 22; y++) { const w = y < 3 ? 1 : 2; for (let x = 12 - w; x < 12 + w; x++) pc.set(x, y, ((x + y) % 4 === 0) ? 0x7a4a3c : 0x5e2e2a); }
    pc.set(11, 22, 0x4a2422); pc.set(12, 22, 0x4a2422);
    // buttons
    pc.set(12, 24, R[1]); pc.set(12, 28, R[1]); pc.set(13, 24, R[4]);
    // lanyard and the badge with no photo and no name
    for (let y = 0; y < 13; y++) { pc.set(4 + (y >> 2), y, 0x3a5a8a); pc.set(19 - (y >> 2), y, 0x3a5a8a); }
    pc.rect(4, 13, 6, 8, 0xf0f0ea); pc.strokeRect(4, 13, 6, 8, 0xc8c8c0);
    pc.rect(5, 14, 4, 3, 0xb8b8b0); pc.hline(5, 8, 18, 0x9a9a94); pc.hline(5, 7, 19, 0xb8b8b0);
    pc.rect(4, 13, 6, 1, 0x3a5a8a);
    // pocket seam
    pc.hline(15, 20, 26, R[2]);
  });
  // glossy fibreglass skin, mould seams
  A.add('c_employee_skin', 16, 16, (pc) => {
    const R = makeRamp(0xc4ab92, 6, { hueShift: 0.02 });
    pc.fillRamp(R, (x, y) => 0.6 + (tileFbm(x, y, 16, 16, 2, 2, 5) - 0.5) * 0.12, 0.4);
    for (let y = 0; y < 16; y++) pc.blend(7, y, R[2], 0.25);
    pc.set(3, 4, R[5]); pc.set(4, 4, R[5]); pc.set(11, 10, R[5]);
  });
  // the face: brow, nose, cheekbones — and nothing else
  A.add('c_employee_face', 16, 20, (pc) => {
    pc.wrap = false;
    const R = makeRamp(0xc4ab92, 7, { hueShift: 0.02 });
    pc.fillRamp(R, (x, y) => 0.62 - Math.abs(x - 7.5) * 0.018 - Math.max(0, y - 15) * 0.03, 0.4);
    // brow ridge and two shallow, empty sockets
    pc.hline(3, 12, 7, R[5]);
    for (const ex of [5, 10]) { pc.set(ex - 1, 9, R[3]); pc.set(ex, 9, R[3]); pc.set(ex, 10, R[4]); pc.set(ex - 1, 10, R[4]); }
    // nose ridge and its shadow
    for (let y = 8; y < 13; y++) { pc.set(8, y, R[6]); pc.set(7, y, R[4]); }
    pc.hline(7, 9, 13, R[2]);
    // cheekbones catching the fluorescent light
    pc.set(3, 12, R[6]); pc.set(12, 12, R[6]);
    // faint chin line where a mouth should be
    pc.hline(6, 9, 16, R[4]);
    // mould seam down the middle
    for (let y = 0; y < 20; y += 2) pc.blend(8, y, R[2], 0.3);
  });
});

const SUIT = 'c_employee_suit', SKIN = 'c_employee_skin';

function buildEmployee(): Rig {
  const rig = newRig(1.95);
  const hips = part(rig, 'hips', rig.body, [0, 0.96, 0], (mb) => {
    mb.box(0, -0.1, 0, 0.34, 0.16, 0.2, SUIT);
    mb.box(0, -0.02, 0, 0.36, 0.06, 0.22, 'leather_black', { color: 0x8a7a6a }); // belt
  });
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    const th = part(rig, 'thigh' + n, hips, [s * 0.09, -0.08, 0], (mb) => {
      mb.box(0, -0.46, 0, 0.13, 0.46, 0.15, SUIT);
      mb.sphere(0, -0.46, 0.01, 0.06, 6, 3, SKIN); // knee joint showing through a seam
    });
    const sh = part(rig, 'shin' + n, th, [0, -0.46, 0], (mb) => {
      mb.box(0, -0.34, 0, 0.115, 0.34, 0.135, SUIT);
      mb.box(0, -0.42, 0.035, 0.11, 0.08, 0.27, 'leather_black');
      mb.box(0, -0.35, 0.0, 0.1, 0.02, 0.12, SKIN); // a sliver of ankle: no sock
    });
    void sh;
  }
  const spine = part(rig, 'spine', hips, [0, 0.06, 0], (mb) => {
    mb.box(0, 0, 0, 0.4, 0.56, 0.22, { south: 'c_employee_jacket', all: SUIT }, { fit: { south: true } });
    mb.box(0, -0.08, 0.005, 0.42, 0.12, 0.23, SUIT); // jacket hem
    mb.box(0, 0.5, 0, 0.46, 0.07, 0.22, SUIT); // shoulder pads
    mb.box(0, 0.54, 0.0, 0.16, 0.04, 0.16, 'white', { color: 0xe6e4da }); // collar
  });
  const neck = part(rig, 'neck', spine, [0, 0.56, 0], (mb) => {
    mb.cylinder(0, 0, 0, 0.045, 0.08, 6, SKIN);
    mb.sphere(0, 0.08, 0, 0.06, 6, 3, SKIN);
  });
  part(rig, 'head', neck, [0, 0.08, 0], (mb) => {
    mb.box(0, 0.0, 0.0, 0.2, 0.25, 0.22, { south: 'c_employee_face', all: SKIN }, { fit: { south: true } });
    mb.box(0, 0.25, 0.0, 0.16, 0.035, 0.18, SKIN); // crown
    mb.box(0, -0.035, 0.03, 0.14, 0.04, 0.14, SKIN); // jaw, slightly too narrow
  });
  for (const s of [-1, 1]) {
    const n = s < 0 ? 'L' : 'R';
    const ua = part(rig, 'uarm' + n, spine, [s * 0.255, 0.5, 0], (mb) => {
      mb.box(0, -0.42, 0, 0.1, 0.42, 0.12, SUIT);
    });
    const fa = part(rig, 'farm' + n, ua, [0, -0.42, 0], (mb) => {
      mb.sphere(0, 0, 0, 0.055, 6, 3, SKIN); // elbow ball joint
      mb.box(0, -0.32, 0, 0.09, 0.32, 0.1, SUIT);
      mb.box(0, -0.33, 0, 0.1, 0.03, 0.11, 'white', { color: 0xe6e4da }); // cuff
      mb.cylinder(0, -0.38, 0, 0.03, 0.05, 6, SKIN); // wrist peg
    });
    part(rig, 'hand' + n, fa, [0, -0.38, 0], (mb) => {
      // mitten hand: fingers moulded together, far too long
      mb.box(0, -0.22, 0.005, 0.055, 0.22, 0.09, SKIN);
      mb.box(-s * 0.035, -0.1, 0.03, 0.025, 0.09, 0.03, SKIN); // thumb
    });
  }
  return rig;
}

type Pose = Record<string, [number, number, number]>;
/** frozen poses, from "just standing there" to "reaching for you" */
const POSES: { p: Pose; y: number; band: 0 | 1 | 2 }[] = [
  { band: 0, y: 0, p: { uarmL: [0, 0, 0.04], uarmR: [0, 0, -0.04] } },
  { band: 0, y: 0, p: { thighL: [-0.45, 0, 0], shinL: [0.25, 0, 0], thighR: [0.32, 0, 0], shinR: [0.35, 0, 0], uarmL: [0.32, 0, 0.05], uarmR: [-0.38, 0, -0.05], farmR: [-0.2, 0, 0], spine: [0.06, 0, 0] } },
  { band: 0, y: 0, p: { uarmL: [-0.6, 0, 0.2], farmL: [-1.9, 0, 0], uarmR: [-0.5, 0, -0.25], farmR: [-1.8, 0, 0], head: [0.45, 0, 0], neck: [0.2, 0, 0] } }, // adjusting a tie that is not there
  { band: 1, y: 0, p: { uarmR: [-1.55, 0, 0], farmR: [0, 0, 0], head: [0, 0, 0.3], uarmL: [0.1, 0, 0.05] } }, // pointing at you
  { band: 1, y: 0, p: { head: [0, 0, 1.05], uarmR: [-2.4, 0, -0.2], farmR: [-1.2, 0, 0], uarmL: [0.05, 0, 0.1], spine: [0, 0, -0.08] } }, // head lolled sideways
  { band: 1, y: 0, p: { uarmL: [0, 0, 1.45], uarmR: [0, 0, -1.45], head: [-0.25, 0, 0] } }, // arms out
  { band: 2, y: 0, p: { uarmL: [-1.35, 0.15, 0.1], uarmR: [-1.4, -0.15, -0.1], farmL: [-0.25, 0, 0], farmR: [-0.15, 0, 0], spine: [0.18, 0, 0], head: [0.2, 0, 0.15], thighL: [-0.3, 0, 0], shinL: [0.2, 0, 0], thighR: [0.25, 0, 0], shinR: [0.25, 0, 0] } }, // reaching
  { band: 2, y: -0.12, p: { thighL: [-0.95, 0, 0], shinL: [1.0, 0, 0], thighR: [0.55, 0, 0], shinR: [0.65, 0, 0], spine: [0.38, 0, 0], uarmL: [-1.7, 0, 0.15], uarmR: [-1.05, 0, -0.2], farmL: [-0.2, 0, 0], head: [-0.3, 0, 0] } }, // mid-lunge
  { band: 2, y: -0.3, p: { thighL: [-1.5, 0, 0.1], shinL: [1.9, 0, 0], thighR: [-1.4, 0, -0.1], shinR: [1.85, 0, 0], spine: [0.75, 0, 0], uarmL: [-0.9, 0, 0.2], uarmR: [-0.85, 0, -0.2], farmL: [-0.4, 0, 0], farmR: [-0.4, 0, 0], head: [-0.8, 0, 0] } }, // crouched, looking up at you
];
const PARTS = ['hips', 'spine', 'neck', 'head', 'uarmL', 'uarmR', 'farmL', 'farmR', 'handL', 'handR', 'thighL', 'thighR', 'shinL', 'shinR'];
const ATTACK_POSE: Pose = { uarmL: [-1.5, 0.2, 0.05], uarmR: [-1.6, -0.2, -0.05], farmL: [0.1, 0, 0], farmR: [0.1, 0, 0], spine: [0.3, 0, 0], head: [0.35, 0, 0], thighL: [-0.6, 0, 0], shinL: [0.4, 0, 0], thighR: [0.4, 0, 0], shinR: [0.3, 0, 0] };

function applyPose(rig: Rig, pose: Pose, y: number) {
  const P = rig.parts;
  for (const n of PARTS) { const r = pose[n]; const o = P[n]; if (!o) continue; if (r) o.rotation.set(r[0], r[1], r[2]); else o.rotation.set(0, 0, 0); }
  rig.body.position.y = y;
}

function animateEmployee(rig: Rig, c: Creature, t: number, dt: number) {
  void dt;
  if (c.dead) { applyPose(rig, POSES[0].p, 0); return; }
  if (c.attackPhase > 0) {
    applyPose(rig, ATTACK_POSE, -0.05);
    rig.parts.head.rotation.z = Math.sin(t * 50) * 0.25;
    return;
  }
  const i = (nm(c).pose ?? 0) % POSES.length;
  const P = POSES[i];
  applyPose(rig, P.p, P.y);
  // hit: a hollow fibreglass shudder, nothing else
  if (c.hitFlash > 0) rig.body.position.x = Math.sin(t * 90) * 0.02; else rig.body.position.x = 0;
}

/** strict observation: a survivor's vision cone, line of sight and enough light to see by */
function watched(c: Creature): boolean {
  const z = zoneOf(c);
  for (const p of playersIn(c)) {
    if (p.sleeping || p.body.downed) continue;
    const dx = c.x - p.x, dz = c.z - p.z, d = Math.hypot(dx, dz);
    if (d > 32) continue;
    const ang = Math.abs(angleDiff(p.facing, Math.atan2(dz, dx)));
    const cone = (p.isLocal && G.view ? G.view.vis.coneHalf : 1.4) + 0.05;
    if (ang > cone) continue;
    if (!lineOfSight(z, p.x, p.z, c.x, c.z)) continue;
    const lit = lightAt(c.zoneKey, c.x, c.z) + (p.flashlightOn && ang < 0.55 && d < 16 ? 1 : 0);
    if (lit < 0.1 && d > 1.6) continue;
    return true;
  }
  return false;
}

function pickPose(c: Creature, d: number) {
  const band = d > 9 ? 0 : d > 4 ? 1 : 2;
  const opts = POSES.map((p, i) => [i, p.band] as const).filter(([i, b]) => b === band && i !== nm(c).pose);
  const pick = opts[Math.floor(CS().rng.next() * opts.length)]?.[0] ?? 0;
  netSet(c, 'pose', pick);
}

function thinkEmployee(c: Creature, dt: number): boolean {
  const cs = CS(), z = zoneOf(c);
  pulse(c);
  const seen = watched(c);
  const tp = nearestPlayer(c, 28, (p) => !p.body.dead);
  if (seen) {
    if (c.state !== 'frozen') { c.setState('frozen'); c.mem.moved = 0; }
    stop(c); c.targetFacing = c.facing;
    return true;
  }
  // nobody is looking
  if (c.state === 'frozen' || c.state === 'chase' || c.state === 'idle') {
    if (c.state === 'frozen') pickPose(c, tp ? tp.d : 20);
    c.setState(tp ? 'stalk' : 'wander');
  }
  if (tp) {
    const p = tp.p;
    c.targetId = p.id;
    faceTo(c, p.x, p.z, true); // it is always already facing you when you look back
    const reach = (c.sp.attack?.range ?? 0.9) + p.radius;
    if (tp.d <= reach) {
      stop(c);
      if (c.attackT <= 0) attack(c, p);
      return true;
    }
    if (c.state !== 'stalk') c.setState('stalk');
    cs.moveTo(c, z, p.x, p.z, c.sp.run, dt, reach * 0.85);
    c.mem.moved = (c.mem.moved ?? 0) + c.speed * dt;
    if (c.mem.moved > 1.6) { c.mem.moved = 0; pickPose(c, tp.d); }
    return true;
  }
  // no one in range: drift through the cubicles, changing pose when unobserved
  if (c.state !== 'wander') c.setState('wander');
  if (!c.goal || cs.moveTo(c, z, c.goal.x, c.goal.z, c.sp.walk, dt, 0.6) || c.stateT > 25) { c.goal = cs.wanderSpot(c, z, 14); c.stateT = 0; }
  c.mem.moved = (c.mem.moved ?? 0) + c.speed * dt;
  if (c.mem.moved > 3) { c.mem.moved = 0; pickPose(c, 20); }
  return true;
}

const sp = def({
  key: 'employee', name: 'The Employee', code: 'E-21 // MANNEQUIN-STAFF', temperament: 'stalker', threat: 4,
  hp: 85, walk: 2.4, run: 6.2, turn: 30, radius: 0.3, height: 1.95, sight: 30, fov: 3.1, hearing: 0.6, nightVision: true,
  attack: { dmg: [11, 19], range: 0.85, cooldown: 1.4, kinds: ['laceration', 'bruise', 'deep'], corrupt: 0.12, knock: 0.9, parts: ['neck', 'head', 'torso_u', 'uarm_l', 'uarm_r'] },
  zones: ['office', 'school', 'stairwell', 'mall', 'hospital', 'lab'], weight: 1, maxPerZone: 2, diet: 'none',
  flags: { weepingAngel: true },
  sounds: { attack: 'employee_crack', hurt: 'mannequin_knock', death: 'mannequin_fall' },
  scan: {
    cls: 'Observer-bound mimic',
    notes: [
      'Fibreglass shell in a beige suit. No face. Badge photo is blank.',
      'Does not move while a survivor is looking at it in the light. It moves very fast when nobody is.',
      'Darkness counts as not looking. So does sleeping. So does turning your back.',
      'Walk backwards through a door and close it. It has never been seen opening one.',
      'Its pose is different every time you look. The closer it is, the more it is reaching.',
    ],
  },
  build: buildEmployee,
  animate: animateEmployee,
  think: thinkEmployee,
});
(sp as any).animateGallery = (rig: Rig, t: number) => {
  const q = galleryPose('');
  const i = q === '' ? Math.floor(t / 1.5) % POSES.length : Number(q) % POSES.length;
  applyPose(rig, POSES[i].p, POSES[i].y);
};
