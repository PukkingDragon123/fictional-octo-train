import { def, newRig, part, Rig } from '../species';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { makeRamp, ph } from '../../gfx/pixel';
import { tileFbm } from '../../core/rng';
import type { Creature } from '../creature';

addTextureModule(() => {
  const A = atlas();
  A.add('c_doe_hide', 32, 32, (pc) => {
    const R = makeRamp(0xa6825a, 7, { hueShift: 0.04 });
    pc.fillRamp(R, (x, y) => 0.55 + (tileFbm(x, y, 32, 32, 2, 3, 3) - 0.5) * 0.3 + ((x + y * 2) % 7 === 0 ? 0.05 : 0), 1);
    for (let i = 0; i < 9; i++) { const x = (i * 11) % 32, y = (i * 7) % 32; pc.ellipse(x, y, 1.5, 1, R[6]); } // fawn spots that never faded
  });
  A.add('c_doe_leg', 8, 32, (pc) => {
    const R = makeRamp(0x6a5a4a, 5);
    pc.fillRamp(R, (x, y) => 0.5 + (x === 0 ? -0.2 : x === 7 ? 0.15 : 0) + (ph(x, y, 3) - 0.5) * 0.1, 0.5);
    for (let y = 4; y < 32; y += 9) pc.hline(0, 7, y, R[1]); // knobbly joints
  });
  A.add('c_doe_face', 16, 16, (pc) => {
    pc.wrap = false;
    const R = makeRamp(0xb89068, 6);
    pc.fillRamp(R, (x, y) => 0.6 - y * 0.012, 0.5);
    // no eyes. just a single dark nostril line and a pale muzzle
    pc.rect(5, 11, 6, 4, R[5]);
    pc.hline(6, 9, 13, 0x2a1a12);
  });
});

function buildDoe(): Rig {
  const rig = newRig(3.2);
  const L = 2.15; // leg length (absurd)
  const torso = part(rig, 'torso', rig.body, [0, L + 0.1, 0], (mb) => {
    mb.box(0, -0.18, 0, 0.3, 0.36, 0.85, 'c_doe_hide');
    mb.box(0, -0.12, -0.46, 0.1, 0.14, 0.12, 'c_doe_hide'); // tail stub
  });
  const neck = part(rig, 'neck', torso, [0, 0.0, 0.38], (mb) => { mb.box(0, 0, 0.0, 0.12, 0.85, 0.14, 'c_doe_hide'); });
  neck.rotation.x = -0.35;
  part(rig, 'head', neck, [0, 0.82, 0.04], (mb) => {
    mb.box(0, -0.06, 0.08, 0.16, 0.18, 0.32, { south: 'c_doe_face', all: 'c_doe_hide' }, { fit: { south: true } });
    mb.box(0, 0.1, -0.04, 0.32, 0.08, 0.05, 'c_doe_hide'); // one huge flat ear across the top
  });
  const legs = [[0.1, 0.32], [-0.1, 0.32], [0.1, -0.32], [-0.1, -0.32]];
  legs.forEach(([lx, lz], i) => {
    const up = part(rig, 'leg' + i, torso, [lx, -0.2, lz], (mb) => { mb.box(0, -L * 0.52, 0, 0.05, L * 0.54, 0.05, 'c_doe_leg', { fit: true }); });
    part(rig, 'shin' + i, up, [0, -L * 0.5, 0], (mb) => { mb.box(0, -L * 0.5, 0, 0.035, L * 0.52, 0.035, 'c_doe_leg', { fit: true }); mb.box(0, -L * 0.52, 0.02, 0.06, 0.04, 0.08, 'metal_dark'); });
  });
  return rig;
}

function animateDoe(rig: Rig, c: Creature, t: number, dt: number) {
  const P = rig.parts;
  const moving = c.speed > 0.1;
  const run = c.speed > 3;
  // slow, deliberate high-stepping walk; legs move one at a time
  for (let i = 0; i < 4; i++) {
    const order = [0, 3, 1, 2][i];
    const ph = c.phase * 0.5 + order * Math.PI * 0.5;
    const lift = moving ? Math.max(0, Math.sin(ph)) : 0;
    P['leg' + i].rotation.x = moving ? Math.sin(ph) * (run ? 0.55 : 0.25) : 0;
    P['shin' + i].rotation.x = lift * (run ? 0.9 : 0.6);
  }
  rig.body.position.y = moving ? Math.sin(c.phase) * 0.04 : 0;
  // grazing: the impossibly long neck folds down to the grass
  const graze = c.state === 'graze' ? 1 : 0;
  P.neck.rotation.x = -0.35 + graze * 1.9 + (c.state === 'idle' ? Math.sin(t * 0.4) * 0.1 : 0);
  P.head.rotation.x = graze * 0.6;
  // when watched it slowly turns the head all the way around
  P.head.rotation.y = c.state === 'idle' && c.observed ? Math.sin(t * 0.3) * 2.6 : 0;
  void dt;
}

def({
  key: 'stilt_doe', name: 'Stilt Doe', code: 'E-04 // CERVID-TALL', temperament: 'skittish', threat: 1,
  hp: 40, walk: 1.1, run: 7.5, turn: 3, radius: 0.45, height: 3.3, sight: 26, fov: 2.6, hearing: 1.6,
  attack: { dmg: [10, 18], range: 1.4, cooldown: 2.2, kinds: ['fracture', 'laceration'], corrupt: 0, knock: 1.2, parts: ['torso_u', 'head', 'uarm_l', 'uarm_r'] },
  zones: ['fields', 'suburbs', 'parking'], weight: 4, group: [1, 3], maxPerZone: 9, diet: 'grass',
  meat: [['venison_raw', 4]],
  sounds: { idle: 'doe_click', alert: 'doe_shriek', hurt: 'doe_shriek', death: 'doe_death', step: 'hoof' },
  scan: { cls: 'Grazer / skittish', notes: ['Legs over two metres long. It ducks under door frames.', 'Grazes the artificial grass. Flees from running footsteps.', 'Kicks hard if cornered.', 'Edible. Tastes faintly of static.'] },
  gore: { blood: 'red', sever: ['leg0', 'leg1', 'leg2', 'leg3', 'shin0', 'shin1', 'shin2', 'shin3'], head: 'head' },
  build: buildDoe,
  animate: animateDoe,
});
