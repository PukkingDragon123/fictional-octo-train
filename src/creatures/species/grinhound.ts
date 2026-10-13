import { def, newRig, part, gait, Rig } from '../species';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { makeRamp, ph } from '../../gfx/pixel';
import { tileFbm } from '../../core/rng';
import type { Creature } from '../creature';

addTextureModule(() => {
  const A = atlas();
  // pale, half-hairless hide with ribs and patchy fur
  A.add('c_hound_skin', 32, 32, (pc) => {
    const R = makeRamp(0x9a8478, 7, { hueShift: 0.05 });
    pc.fillRamp(R, (x, y) => 0.55 + (tileFbm(x, y, 32, 32, 3, 3, 4) - 0.5) * 0.35 + (ph(x, y, 2) - 0.5) * 0.06, 0.8);
    for (let y = 2; y < 32; y += 5) for (let x = 0; x < 32; x++) if ((x + y) % 9 < 6) pc.blend(x, y, R[2], 0.45); // ribs
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const f = tileFbm(x, y, 32, 32, 2, 2, 17);
      if (f > 0.6) pc.blend(x, y, ph(x, y, 7) < 0.5 ? 0x3a2e28 : 0x4d3f36, 0.85); // fur patches
    }
  });
  A.add('c_hound_face', 16, 16, (pc) => {
    pc.wrap = false;
    const R = makeRamp(0xb09a8c, 6);
    pc.fillRamp(R, (x, y) => 0.55 - Math.abs(y - 8) * 0.01, 0.6);
    // the grin: far too many flat human teeth
    for (let x = 1; x < 15; x++) { pc.set(x, 7, 0x1a0e0c); pc.set(x, 10, 0x1a0e0c); }
    for (let x = 1; x < 15; x++) for (let y = 8; y < 10; y++) pc.set(x, y, x % 2 === 0 ? 0xeee6d2 : 0xd6ccb4);
    pc.set(0, 8, 0x1a0e0c); pc.set(15, 8, 0x1a0e0c); pc.set(0, 9, 0x1a0e0c); pc.set(15, 9, 0x1a0e0c);
    // gums
    for (let x = 2; x < 14; x += 3) pc.set(x, 7, 0x8a3a3a);
    // pinhole eyes, wrong place
    pc.set(3, 3, 0x050505); pc.set(12, 4, 0x050505);
  });
  A.add('c_dog_fur', 32, 32, (pc) => {
    const R = makeRamp(0x6e4e30, 7, { hueShift: 0.04 });
    pc.fillRamp(R, (x, y) => 0.5 + (tileFbm(x, y, 32, 32, 4, 2, 9) - 0.5) * 0.4 + ((x * 3 + y) % 5 === 0 ? 0.08 : 0), 1);
  });
  A.add('c_eye_glow', 4, 4, (pc) => { pc.fill(0xfff2c0); pc.set(0, 0, 0xffd070); pc.set(3, 3, 0xffd070); });
});

function buildHound(fur: string, scale = 1): Rig {
  const s = scale;
  const rig = newRig(0.8 * s);
  const body = part(rig, 'torso', rig.body, [0, 0.62 * s, 0], (mb) => {
    mb.box(0, -0.15 * s, 0, 0.26 * s, 0.3 * s, 0.72 * s, fur);
    mb.box(0, -0.12 * s, 0.32 * s, 0.22 * s, 0.24 * s, 0.14 * s, fur); // chest
  });
  const neck = part(rig, 'neck', body, [0, 0.02 * s, 0.38 * s], (mb) => { mb.box(0, -0.05 * s, 0.08 * s, 0.13 * s, 0.14 * s, 0.24 * s, fur); });
  const head = part(rig, 'head', neck, [0, 0.0, 0.22 * s], (mb) => {
    // the head is turned sideways: face plate on the +z side but rolled 90°
    mb.push().rotateZ(Math.PI / 2);
    mb.box(0, -0.11 * s, 0.06 * s, 0.22 * s, 0.2 * s, 0.24 * s, { south: fur === 'c_dog_fur' ? 'c_hound_face' : 'c_hound_face', all: fur }, { fit: { south: true } });
    mb.box(0, -0.06 * s, 0.2 * s, 0.14 * s, 0.1 * s, 0.1 * s, fur); // snout stub
    mb.pop();
    mb.box(0.11 * s, 0.05 * s, -0.04 * s, 0.03 * s, 0.1 * s, 0.05 * s, fur); // single ear
  });
  void head;
  const legs = [[0.1, 0.28], [-0.1, 0.28], [0.1, -0.28], [-0.1, -0.28]];
  legs.forEach(([lx, lz], i) => {
    const th = part(rig, 'leg' + i, body, [lx * s, -0.12 * s, lz * s], (mb) => { mb.box(0, -0.36 * s, 0, 0.07 * s, 0.38 * s, 0.09 * s, fur); });
    part(rig, 'shin' + i, th, [0, -0.34 * s, 0], (mb) => { mb.box(0, -0.3 * s, 0, 0.05 * s, 0.32 * s, 0.06 * s, fur); mb.box(0, -0.32 * s, 0.03 * s, 0.07 * s, 0.03 * s, 0.1 * s, 'c_hound_skin'); });
  });
  const tail = part(rig, 'tail', body, [0, -0.02 * s, -0.36 * s], (mb) => { mb.box(0, -0.02 * s, -0.18 * s, 0.04 * s, 0.04 * s, 0.36 * s, fur); });
  void tail;
  return rig;
}

function animateHound(rig: Rig, c: Creature, t: number, dt: number) {
  const P = rig.parts;
  const run = c.speed > 3;
  const amp = c.speed > 0.1 ? (run ? 0.85 : 0.45) : 0;
  for (let i = 0; i < 4; i++) {
    const sw = gait(c.phase * (run ? 1 : 1), i, amp);
    P['leg' + i].rotation.x = sw;
    P['shin' + i].rotation.x = Math.max(0, -sw) * 0.9 + 0.1;
  }
  rig.body.position.y = c.speed > 0.1 ? Math.abs(Math.sin(c.phase)) * (run ? 0.06 : 0.025) : 0;
  P.torso.rotation.x = run ? -0.08 : 0;
  // attack lunge
  if (c.attackPhase > 0) { P.torso.rotation.x = -0.35; P.neck.rotation.x = -0.3; P.head.rotation.z = Math.sin(t * 40) * 0.2; }
  else {
    // unnerving twitches: the head snaps to new angles instead of easing
    const tw = Math.floor(t * 1.7 + c.id.length);
    const snap = ((tw * 9301 + 49297) % 233280) / 233280;
    P.head.rotation.y = c.state === 'idle' || c.state === 'warn' ? (snap - 0.5) * 1.2 : 0;
    P.head.rotation.x = c.state === 'graze' || c.state === 'investigate' ? 0.6 : 0;
    P.neck.rotation.x = c.state === 'investigate' ? 0.5 + Math.sin(t * 6) * 0.1 : 0;
  }
  P.tail.rotation.y = Math.sin(t * (c.tamedBy ? 14 : 3)) * (c.tamedBy ? 0.6 : 0.2);
  P.tail.rotation.x = c.state === 'flee' ? 0.6 : run ? -0.3 : 0.1;
  if (c.hitFlash > 0) rig.body.position.x = Math.sin(t * 80) * 0.03;
  void dt;
}

def({
  key: 'grinhound', name: 'Grinhound', code: 'E-11 // CANID-WRONG', temperament: 'hostile', threat: 3,
  hp: 34, walk: 1.6, run: 5.2, turn: 10, radius: 0.35, height: 0.85, sight: 16, fov: 1.2, hearing: 1.3, smell: true,
  attack: { dmg: [7, 13], range: 0.9, cooldown: 1.0, kinds: ['bite', 'laceration', 'scratch'], corrupt: 0.12, knock: 0.5 },
  zones: ['lobby', 'suburbs', 'office', 'tunnels', 'parking'], weight: 3, group: [2, 4], maxPerZone: 8, diet: 'meat',
  meat: [['hound_meat_raw', 2]], flags: { pack: true },
  sounds: { idle: 'hound_huff', alert: 'hound_laugh', attack: 'hound_snarl', hurt: 'hound_yelp', death: 'hound_death', step: 'pad' },
  scan: { cls: 'Predator / pack', notes: ['Head is rotated ninety degrees. It does not seem to notice.', 'Hunts by smell. Follows the warm trail you leave on carpet.', 'Afraid of open flame.', 'Its "laughing" call brings the rest of the pack.'] },
  build: () => buildHound('c_hound_skin'),
  animate: animateHound,
});

def({
  key: 'goodboy', name: 'Lost Dog', code: 'E-11b // CANID-STRAY', temperament: 'curious', threat: 0,
  hp: 26, walk: 1.5, run: 5.0, radius: 0.3, height: 0.7, sight: 14, fov: 1.3, hearing: 1.4, smell: true,
  attack: { dmg: [5, 9], range: 0.9, cooldown: 1.1, kinds: ['bite'], corrupt: 0 },
  zones: ['suburbs', 'fields', 'lobby'], weight: 0.6, maxPerZone: 1, diet: 'meat',
  tame: { food: ['meat_raw', 'hound_meat_raw', 'venison_raw', 'canned_dogfood', 'dogfood_open', 'jerky', 'steak_raw', 'chicken_raw', 'spam_open'], feeds: 3 },
  flags: { companion: true },
  sounds: { idle: 'dog_whine', alert: 'dog_bark', attack: 'dog_growl', hurt: 'hound_yelp', death: 'hound_death' },
  scan: { cls: 'Stray / tameable', notes: ['Smiles a little too wide. Wags its tail anyway.', 'Feed it meat a few times and it will follow you.', 'Growls at things you cannot see yet.'] },
  build: () => {
    const r = buildHound('c_dog_fur', 0.85);
    return r;
  },
  animate: animateHound,
});
