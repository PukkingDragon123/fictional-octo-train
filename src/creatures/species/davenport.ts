import { horrify } from '../kit/horror';
import * as THREE from 'three';
import { def, Rig, creatureMaterial } from '../species';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { makeRamp, ph, mixHex } from '../../gfx/pixel';
import { worldMaterial } from '../../gfx/materials';
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
import { SkinKit, KRig, tube, blob, spike, molar, damp, approach, clamp01, smooth01, isLost, atkCurve, strikeShape, flinchOf, V3 } from '../kit/anomalies';
import { wetGlints, veins } from '../kit/anomalyTextures';
import '../kit/anomalyTextures';

// =====================================================================================
// DAVENPORT — a sofa that is also a bear. Asleep it is the three-seater in faded
// florals with the crocheted throw and the lost remote. Awake, bear legs tear
// out of the upholstery (stuffing, blood, rags of fabric), the seat cushions
// peel back off a long wet mouth of gums and molars with the springs grown into
// them, eyes open in the creases between the back cushions and shoulders heave
// up behind. It charges, then lumbers off to become a sofa somewhere else.
// =====================================================================================

addTextureModule(() => {
  const A = atlas();
  // the mouth floor under the cushions: a long gullet slit, ridged wet flesh, stuffing at the edges
  A.add('c_dav_gullet', 96, 36, (pc) => {
    pc.wrap = false;
    const R = makeRamp(0x7a2428, 9, { hueShift: -0.03, spread: 0.7 });
    const h = (x: number, y: number) => tileFbm(x, y, 96, 36, 6, 3, 401);
    pc.fillRamp(R, (x, y) => {
      const d = Math.abs(y - 15) / 18;
      return 0.08 + d * 0.55 + (Math.sin(x * 0.5 + Math.sin(y * 0.4) * 2) * 0.5 + 0.5) * 0.12 + (h(x, y) - 0.5) * 0.25;
    }, 0.7);
    for (let x = 4; x < 92; x++) { const w = 1.6 + Math.sin(x * 0.11) * 1.1 + (x > 20 && x < 76 ? 1 : 0); for (let y = Math.floor(15 - w); y <= 15 + w; y++) pc.set(x, y, Math.abs(y - 15) < w * 0.5 ? 0x050102 : 0x1e0406); }
    veins(pc, 402, 10, 0x3a0a22, 16, 0.45);
    wetGlints(pc, h, 0xf0b8b0, 0.72, 403);
    for (let x = 0; x < 96; x++) for (const y of [0, 1, 34, 35]) if (ph(x, y, 404) < 0.7) pc.set(x, y, ph(x, y, 405) < 0.5 ? 0xe4dccc : 0xc8bca8);
    for (let y = 0; y < 36; y++) for (const x of [0, 1, 94, 95]) if (ph(x, y, 406) < 0.7) pc.set(x, y, 0xe4dccc);
  });
  // the underside of a seat cushion: soaked fabric, flesh grown onto it in webs
  A.add('c_dav_cushion_under', 32, 32, (pc) => {
    pc.wrap = false;
    const R = makeRamp(0xa89878, 6, { hueShift: 0.03 });
    pc.fillRamp(R, (x, y) => 0.5 + ((x + y) & 1 ? 0.04 : -0.03) + (tileFbm(x, y, 32, 32, 3, 2, 411) - 0.5) * 0.25, 0.6);
    // old water stains, then flesh that has grown into the fabric from the mouth side
    pc.stain(9, 22, 6, 0x7a6a4a, 0x5a4a30, 2); pc.stain(24, 9, 5, 0x7a6a4a, 0x5a4a30, 5);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const v = tileFbm(x, y, 32, 32, 2, 3, 412) + (y / 32) * 0.25;
      if (v > 0.68) pc.set(x, y, mixHex(0x9a3434, 0x3a080c, Math.min(1, (v - 0.68) * 3.5)));
      else if (v > 0.62) pc.blend(x, y, 0x6a2a24, 0.55);
    }
    veins(pc, 413, 4, 0x5a1020, 14, 0.55);
    wetGlints(pc, (x, y) => tileFbm(x, y, 32, 32, 2, 3, 412) + (y / 32) * 0.25, 0xe8a8a0, 0.82, 414);
  });
  // a rag of the floral upholstery, blood soaking up from the torn edge (v=0 bottom = the tear)
  A.add('c_dav_torn', 16, 16, (pc) => {
    pc.wrap = false;
    const R = makeRamp(0xd9c9aa, 5, { spread: 0.22 });
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) pc.set(x, y, tileFbm(x, y, 16, 16, 3, 2, 421) < 0.42 ? R[1] : R[2]);
    for (const [cx, cy] of [[4, 4], [11, 9]]) { pc.set(cx, cy, 0xc85a5a); pc.set(cx + 1, cy, 0xa83a4a); pc.set(cx, cy + 1, 0xa83a4a); pc.set(cx + 1, cy + 1, 0xc85a5a); pc.set(cx + 2, cy + 2, 0x7aa86a); }
    for (let x = 0; x < 16; x++) {
      const soak = 6 + Math.floor(ph(x, 1, 422) * 5);
      for (let y = 15; y > 15 - soak; y--) pc.blend(x, y, y > 12 ? 0x5a0a0c : 0x8a2420, 0.85 - (15 - y) * 0.06);
      if (ph(x, 2, 422) < 0.5) pc.set(x, 15, 0xe8e2d4); // threads
    }
  });
});

const FAB = 'fabric_floral';
const W = 1.96, D = 0.86, ZC = -0.44 + D / 2 + 0.02;
const SW = (W - 0.36) / 3;
const SEAT_X = [0, 1, 2].map((i) => -W / 2 + 0.18 + SW * (i + 0.5));
const LEGS = ['legFL', 'legFR', 'legBL', 'legBR'] as const;
const HIP: Record<string, V3> = { legFL: [-0.66, 0.2, 0.2], legFR: [0.66, 0.2, 0.2], legBL: [-0.66, 0.2, -0.22], legBR: [0.66, 0.2, -0.22] };
const L_UP = 0.3, L_LO = 0.26, PAW_Y = 0.07, RISE = 0.36;

function buildDavenport(): Rig {
  const K = new SkinKit(0.9);
  K.bone('base', null, [0, 0.25, ZC]);
  K.bone('back', 'base', [0, 0.4 - 0.25, -0.42 - ZC]);
  K.bone('eyes', 'back', [0, 0.74 - 0.4, -0.065 + 0.42]);
  K.bone('hump', 'back', [0, 0.84 - 0.4, -0.3 + 0.42]);
  for (let i = 0; i < 3; i++) K.bone('seat' + i, 'base', [SEAT_X[i], 0.4 - 0.25, -0.18 - ZC]);
  for (const s of [-1, 1]) K.bone(s < 0 ? 'armL' : 'armR', 'base', [s * (W / 2 - 0.09), 0.4 - 0.25, 0.04 - ZC]);
  for (const n of LEGS) {
    const h = HIP[n];
    K.bone(n, 'base', [h[0], h[1] - 0.25, h[2] - ZC]);
    K.bone(n + 'k', n, [0, -L_UP, 0]);
    K.bone(n + 'p', n + 'k', [0, -L_LO, 0]);
    K.bone(n + 't', 'base', [h[0], 0.1 - 0.25, h[2] - ZC]);
  }

  // ---------------------------------------------------------------- the sofa, exactly as the real one
  K.body('base', (mb) => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mb.cylinder(sx * (W / 2 - 0.08), 0, ZC + sz * (D / 2 - 0.08), 0.025, 0.1, 6, 'wood_dark', { rTop: 0.03 });
    mb.box(0, 0.1, ZC, W, 0.3, D, FAB);
  });
  K.body('back', (mb) => {
    mb.box(0, 0.4, ZC - D / 2 + 0.12, W - 0.02, 0.48, 0.24, FAB);
    for (let i = 0; i < 3; i++) { mb.push().translate(SEAT_X[i], 0.54, ZC - D / 2 + 0.3).rotateX(-0.2); mb.box(0, 0, 0, SW - 0.03, 0.36, 0.16, FAB, { color: 0xf9f9f9 }); mb.pop(); }
    mb.box(0.45, 0.82, ZC - 0.34, 0.5, 0.05, 0.24, 'p_afghan');
    mb.box(0.45, 0.5, ZC - 0.21, 0.5, 0.33, 0.03, 'p_afghan');
  });
  for (const s of [-1, 1]) K.body(s < 0 ? 'armL' : 'armR', (mb) => {
    mb.box(s * (W / 2 - 0.09), 0.4, ZC + 0.03, 0.18, 0.24, D - 0.06, FAB);
    mb.cylinderZ(s * (W / 2 - 0.09), 0.64, ZC + 0.03, 0.09, D - 0.06, 8, FAB, { caps: true });
  });
  for (let i = 0; i < 3; i++) K.body('seat' + i, (mb) => {
    mb.box(SEAT_X[i], 0.4, ZC + 0.1, SW - 0.02, 0.14, D - 0.28, { all: FAB, bottom: 'c_dav_cushion_under' }, { fit: { bottom: true } });
    if (i === 1) mb.box(-0.22, 0.545, ZC + 0.12, 0.05, 0.02, 0.16, 'plastic_black'); // the remote nobody can find
  });

  // ---------------------------------------------------------------- the mouth under the cushions (inside the cushions' volume at rest)
  K.body('base', (mb) => {
    const z0 = -0.17, z1 = ZC + 0.1 + (D - 0.28) / 2 - 0.01;
    mb.box(0, 0.4, (z0 + z1) / 2, 1.58, 0.004, z1 - z0, { top: 'c_dav_gullet', all: 'c_an_flesh' }, { fit: { top: true } });
    // lower gums along the front lip with a row of molars, springs coiled through them
    const gz = z1 - 0.035;
    tube(mb, Array.from({ length: 9 }, (_, k) => [-0.78 + k * 0.195, 0.415, gz] as V3), 0.028, 6, 'c_an_gum', { squash: [0.8, 1.1] });
    for (let k = 0; k < 16; k++) {
      const x = -0.72 + k * 0.096 + (ph(k, 1, 7) - 0.5) * 0.02;
      molar(mb, [x, 0.432, gz + 0.004], [0, 1, 0.12], 0.045 + ph(k, 2, 7) * 0.02, 0.05, 0.045, k % 5 === 3 ? 'c_an_tooth_dirty' : 'c_an_tooth');
    }
    // side gums
    for (const s of [-1, 1]) tube(mb, Array.from({ length: 4 }, (_, k) => [s * 0.77, 0.415, z0 + 0.03 + k * (gz - z0 - 0.05) / 3] as V3), 0.024, 5, 'c_an_gum', { squash: [0.8, 1.1] });
    // springs half-swallowed in the floor
    for (const x of [-0.42, 0.38]) {
      const pts: V3[] = []; for (let k = 0; k <= 10; k++) { const a = k * 1.6; pts.push([x + Math.cos(a) * 0.035, 0.405 + k * 0.0065, 0.02 + Math.sin(a) * 0.035]); }
      tube(mb, pts, 0.006, 3, 'c_an_spring');
    }
    // tufts of torn stuffing at the corners of the mouth
    for (const [x, z] of [[-0.74, -0.12], [0.72, 0.3]]) blob(mb, [x, 0.42, z], [0.05, 0.03, 0.045], 5, 3, 'c_an_stuffing_blood', { disp: (d) => 1 + Math.sin(d[0] * 9 + d[2] * 7) * 0.2 });
  });
  K.body('back', (mb) => {
    // upper gums under the back cushions and a row of molars biting forward-down
    tube(mb, Array.from({ length: 9 }, (_, k) => [-0.78 + k * 0.195, 0.47, -0.165] as V3), 0.032, 6, 'c_an_gum', { squash: [1.1, 0.8] });
    for (let k = 0; k < 15; k++) {
      const x = -0.7 + k * 0.1 + (ph(k, 3, 7) - 0.5) * 0.02;
      molar(mb, [x, 0.455, -0.155], [0, -0.5, 1], 0.042 + ph(k, 4, 7) * 0.02, 0.05, 0.045, k % 4 === 1 ? 'c_an_tooth_dirty' : 'c_an_tooth');
    }
  });
  // eyes in the creases between the back cushions: wet, human, too far apart
  K.local('eyes', (mb) => {
    for (const s of [-1, 1]) {
      mb.push().translate(s * 0.27, 0, 0).rotateX(-0.2);
      blob(mb, [0, 0, 0], [0.055, 0.042, 0.036], 8, 4, 'c_an_eye_ball', { fit: true, seam: Math.PI, ao: false });
      mb.pop();
    }
  }, 'g');
  // shoulders heaving up behind the back, through a split seam
  K.local('hump', (mb) => {
    for (const sx of [-1, 1]) blob(mb, [sx * 0.33, 0, 0], [0.3, 0.17, 0.16], 7, 4, 'c_an_fur', { disp: (d) => 1 + Math.sin(d[0] * 5 + sx) * 0.08 - (d[1] < -0.3 ? 0.25 : 0) });
    for (let k = 0; k < 5; k++) blob(mb, [-0.24 + k * 0.12, 0.13, 0.0], [0.045, 0.05, 0.05], 5, 3, k % 2 ? 'c_an_fur_blood' : 'c_an_flesh_pale', {});
    for (let k = 0; k < 7; k++) { const x = -0.6 + k * 0.2; mb.push().translate(x, -0.05, 0.13 + (k & 1) * 0.02).rotateX(0.5 + ph(k, 5, 9) * 0.4).rotateZ((ph(k, 6, 9) - 0.5) * 0.6); mb.box(0, 0, 0, 0.17, 0.1, 0.01, 'c_dav_torn', { fit: true }); mb.pop(); }
  });
  // legs: fur, a blood-soaked top where they tore out, paws with pads and claws
  for (const n of LEGS) {
    const front = n.startsWith('legF');
    K.local(n, (mb) => {
      tube(mb, [[0, 0.07, 0], [0, -0.05, 0.012], [0, -0.17, 0.016], [0, -L_UP, 0]], (t) => 0.13 - t * 0.03, 8, 'c_an_fur', { bump: (t, a) => 1 + Math.sin(a * 3 + t * 4) * 0.06 + (Math.cos(a) > 0.3 ? 0.1 * Math.sin(t * Math.PI) : 0), capStart: true });
      tube(mb, [[0, 0.075, 0], [0, -0.01, 0.006]], 0.137, 8, 'c_an_fur_blood', {});
    });
    K.local(n + 'k', (mb) => {
      blob(mb, [0, 0, 0], [0.1, 0.1, 0.105], 6, 3, 'c_an_fur', {});
      tube(mb, [[0, 0, 0], [0, -0.13, front ? -0.012 : 0.012], [0, -L_LO, 0]], (t) => 0.095 - t * 0.015, 7, 'c_an_fur', { bump: (t, a) => 1 + Math.sin(a * 4 + t * 6) * 0.05 });
    });
    K.local(n + 'p', (mb) => {
      blob(mb, [0, -0.005, 0.045], [0.105, 0.058, 0.135], 7, 4, 'c_an_fur', { disp: (d) => 1 + (d[1] < -0.4 ? -0.15 : 0) });
      blob(mb, [0, -0.055, 0.055], [0.08, 0.013, 0.09], 5, 2, 'c_an_pad', {});
      for (let k = 0; k < 4; k++) { const x = -0.06 + k * 0.04; spike(mb, [x, -0.02, 0.16 - Math.abs(k - 1.5) * 0.012], [0, -0.55, 1], 0.085, 0.015, 'c_an_claw', 0xffffff, -0.025, 4); }
    });
    // rags of upholstery, stuffing and blood around the hole it tore out of
    K.local(n + 't', (mb) => {
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2 + ph(k, 1, 11) * 0.5;
        mb.push().translate(Math.cos(a) * 0.14, 0, Math.sin(a) * 0.14).rotateY(-a + Math.PI / 2).rotateX(-0.3 - ph(k, 2, 11) * 0.5);
        mb.box(0, -0.12, 0, 0.1 + ph(k, 3, 11) * 0.06, 0.12, 0.008, 'c_dav_torn', { fit: true });
        mb.pop();
      }
      for (let k = 0; k < 3; k++) { const a = k * 2.1; blob(mb, [Math.cos(a) * 0.12, -0.02, Math.sin(a) * 0.12], [0.05, 0.045, 0.05], 5, 3, k % 2 ? 'c_an_stuffing' : 'c_an_stuffing_blood', { disp: (d) => 1 + Math.sin(d[0] * 8 + k) * 0.2 }); }
      for (let k = 0; k < 2; k++) { const a = k * 2.6 + 0.4; tube(mb, [[Math.cos(a) * 0.1, 0, Math.sin(a) * 0.1], [Math.cos(a) * 0.11, -0.07 - k * 0.04, Math.sin(a) * 0.11]], 0.008, 4, 'c_an_flesh', { capEnd: true }); }
    });
  }
  const rig = K.finish({ sphere: [0, 0.6, 0, 1.6] });
  rig.eyes = rig.skins.g ? [rig.skins.g] : undefined;
  return rig;
}

// ---------------------------------------------------------------- animation
const PROP_MAT = () => worldMaterial({ cutout: true });
const TMP_M = new THREE.Matrix4(), TMP_V = new THREE.Vector3();

interface PoseIn { moving: number; phase: number; jaw: number; lunge: number; shake: number; flinch: number; dead: number; breathe: number; turn: number }

/** k: 0 sofa .. 1 bear */
function pose(rig: KRig, c: Creature | null, k: number, t: number, o: PoseIn) {
  const P = rig.parts;
  const rv = smooth01(k);
  // legs grow out fast at first (tearing out), then the body heaves up on them
  const legK = smooth01(clamp01(k * 1.6));
  const rise = smooth01(clamp01((k - 0.25) / 0.75));
  const step = o.moving * rv;
  const sway = Math.sin(o.phase) * step;
  rig.body.position.set(Math.sin(t * 70) * 0.025 * o.flinch, RISE * rise + Math.abs(Math.cos(o.phase)) * 0.035 * step - o.dead * 0.1 + o.lunge * -0.04 * rv, o.lunge * 0.3 * rv - o.flinch * 0.05);
  rig.body.rotation.set(
    (-0.06 * rise) + o.lunge * 0.16 * rv - o.jaw * 0.08 * rv + Math.sin(o.phase * 2) * 0.02 * step - o.flinch * 0.12,
    o.shake * Math.sin(t * 22) * 0.12 + o.turn * 0.1 * rv,
    sway * 0.06 + o.flinch * 0.05,
  );
  // breathing upholstery (a barely-there swell even while it pretends)
  const br = Math.sin(t * (rv > 0.5 ? 1.6 : 0.9)) * (0.0035 + rv * 0.012) * o.breathe;
  P.base.scale.set(1 + br * 0.5, 1 + br, 1 + br * 0.8);
  // the mouth: cushions peel back off the gums, the back rocks away like an upper jaw
  const jaw = clamp01(o.jaw);
  for (let i = 0; i < 3; i++) {
    const s = P['seat' + i];
    const flap = Math.sin(t * 9 + i * 1.7) * 0.06 * rv * (0.3 + jaw);
    s.rotation.set(-(jaw * (1.2 + i % 2 * 0.25) + rv * 0.08 + flap) , 0, (i - 1) * 0.08 * jaw);
  }
  P.back.rotation.x = -jaw * 0.32 + rv * 0.1 + br * 2 + o.lunge * 0.12 * rv;
  P.hump.scale.set(Math.max(0.001, rv), Math.max(0.001, rv * (1 + br * 4)), Math.max(0.001, rv));
  P.hump.position.y = 0.44 - (1 - rv) * 0.1;
  const blink = ((t * 0.29) % 1) < 0.035 ? 0.15 : 1;
  P.eyes.scale.set(Math.max(0.001, rv), Math.max(0.001, rv * blink * (o.dead ? 0.3 : 1)), Math.max(0.001, rv));
  for (const s of [-1, 1]) {
    const a = P[s < 0 ? 'armL' : 'armR'];
    a.rotation.set(0.08 * rv, 0, -s * (0.22 * rv + jaw * 0.1 + sway * 0.08 * s));
  }
  // legs: IK onto the floor through a lumbering diagonal gait
  rig.body.updateMatrix();
  P.base.updateMatrix();
  const inv = TMP_M.copy(rig.body.matrix).multiply(P.base.matrix).invert();
  const stride = 0.17 * step;
  LEGS.forEach((n, i) => {
    const hip = P[n], knee = P[n + 'k'], paw = P[n + 'p'], tear = P[n + 't'];
    const lost = c ? isLost(c, n) : false;
    tear.scale.setScalar(Math.max(0.001, smooth01(clamp01(k * 3))));
    hip.scale.setScalar(Math.max(0.001, legK));
    if (lost) return;
    const h = HIP[n];
    const front = n.startsWith('legF');
    const ph0 = o.phase + (i === 0 || i === 3 ? 0 : Math.PI);
    const swing = Math.sin(ph0) * stride, lift = Math.max(0, Math.cos(ph0)) * 0.11 * step;
    // target in root space: under the hip, a little splayed
    let tx = h[0] * 1.05, tz = h[2] + ZC + swing + (front ? 0.04 : -0.04) + o.lunge * (front ? 0.18 : -0.06) * rv, ty = PAW_Y + lift;
    if (o.dead) { tx = h[0] * 1.35; ty = PAW_Y + 0.2; tz += front ? 0.2 : -0.2; }
    TMP_V.set(tx, ty, tz).applyMatrix4(inv);
    const lz = (TMP_V.z - (h[2] - ZC)) / legK, ly = (TMP_V.y - (h[1] - 0.25)) / legK;
    // two-bone IK in the leg's z-y plane: front elbows point back, hind knees forward
    let d = Math.hypot(lz, ly);
    d = Math.min(L_UP + L_LO - 0.005, Math.max(0.12, d));
    const beta = Math.atan2(lz, -ly);
    const A = Math.acos(clamp(-1, 1, (L_UP * L_UP + d * d - L_LO * L_LO) / (2 * L_UP * d)));
    const alpha = beta + (front ? -A : A);
    const kz = Math.sin(alpha) * L_UP, ky = -Math.cos(alpha) * L_UP;
    const gamma = Math.atan2(lz - kz, -(ly - ky));
    const r = Math.min(1, legK * 1.2);
    hip.rotation.set(-alpha * r, 0, (h[0] < 0 ? -1 : 1) * 0.06 * rv);
    knee.rotation.set(-(gamma - alpha) * r, 0, 0);
    paw.rotation.set((gamma - rig.body.rotation.x) * r + (o.dead ? 0.6 : 0), 0, 0);
  });
}
const clamp = (a: number, b: number, v: number) => (v < a ? a : v > b ? b : v);

function animateDavenport(rig: Rig, c: Creature, t: number, dt: number) {
  const R = rig as KRig;
  const sofa = c.state === 'disguised' || c.state === 'hide' || c.state === 'sleep';
  suppressSighting(c, c.state === 'disguised');
  const target = sofa || c.dead ? 0 : 1;
  const m = c.mem;
  m._rv = m._rv === undefined ? target : approach(m._rv, target, target ? 1.6 : 0.6, dt);
  const rv = c.dead ? Math.max(m._rv, 0.75) : m._rv;
  const skin = R.skins.n;
  const want = rv < 0.02 && !c.dead ? PROP_MAT() : creatureMaterial(false);
  if (skin && skin.material !== want) skin.material = want;
  const { wind, rec } = atkCurve(c, dt, 0.6);
  const lunge = strikeShape(wind, rec);
  const jawT = wind > 0 ? (wind < 0.72 ? 1 : 0.2) : rec > 0.5 ? 0.5 : c.state === 'warn' ? 0.7 + Math.sin(t * 5) * 0.2 : c.state === 'chase' ? 0.3 + Math.sin(t * 3) * 0.1 : 0;
  m._jaw = damp(m._jaw ?? 0, c.dead ? 0.8 : jawT, wind > 0.72 ? 26 : 7, dt);
  // turning in place: the shoulders lead
  const turn = Math.max(-1, Math.min(1, ((c.targetFacing - c.facing + Math.PI * 3) % (Math.PI * 2) - Math.PI) * 2));
  pose(R, c, rv, t, {
    moving: c.speed > 0.2 ? 1 : 0, phase: c.phase, jaw: m._jaw, lunge: c.dead ? 0 : lunge,
    shake: rec > 0 ? rec : c.state === 'warn' ? 0.25 : 0, flinch: flinchOf(c), dead: c.dead ? 1 : 0, breathe: c.dead ? 0 : 1, turn: c.dead ? 0 : turn,
  });
  if (rig.eyes && rv < 0.5) for (const e of rig.eyes) e.visible = false;
}

/** distance from a point to the sofa's footprint rectangle */
function rectDist(c: Creature, x: number, z: number) {
  const dx = x - c.x, dz = z - c.z, f = c.facing;
  const lx = dx * Math.sin(f) - dz * Math.cos(f), lz = dx * Math.cos(f) + dz * Math.sin(f);
  return Math.hypot(Math.max(0, Math.abs(lx) - W / 2), Math.max(0, Math.abs(lz) - D / 2));
}

/** a spot against a wall, out of sight, to become a sofa again (two tiles, like a real sofa) */
function settleSpot(c: Creature, r0 = 8, r1 = 22): { x: number; z: number; f: number } | null {
  const z = zoneOf(c), rng = CS().rng;
  for (let t = 0; t < 40; t++) {
    const a = rng.float(0, Math.PI * 2), r = rng.float(r0, r1);
    const x = Math.floor(c.x + Math.cos(a) * r), y = Math.floor(c.z + Math.sin(a) * r);
    if (!walkable(z, x, y) || !walkable(z, x + 1, y)) continue;
    if (z.objectsAt(x, y).length || z.objectsAt(x + 1, y).length) continue;
    // back against a north wall, facing into the room (+z)
    const i = z.idx(x, y), i2 = z.idx(x + 1, y);
    if (!z.wallN[i] || z.edges.get(i * 2) || !z.wallN[i2] || z.edges.get(i2 * 2)) continue;
    if (anyPlayerSees(c.zoneKey, x + 1, y + 0.5, 20)) continue;
    const np = nearestPlayer(c, Infinity);
    if (np && dist(np.p.x, np.p.z, x + 1, y + 0.5) < Math.min(9, r1)) continue;
    return { x: x + 1, z: y + 0.5, f: Math.PI / 2 };
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
  rule: { name: 'TOO WIDE FOR DOORS', text: 'Never sit on a sofa that breathes. If one wakes, get through a doorway: it is too wide to follow.' },
  hp: 120, walk: 1.5, run: 5.0, turn: 3.2, radius: 0.5, height: 0.9, sight: 10, fov: 1.4, hearing: 1.4,
  attack: { dmg: [14, 24], range: 1.0, cooldown: 1.9, kinds: ['bite', 'bruise', 'fracture', 'laceration'], corrupt: 0.06, knock: 2.0, parts: ['thigh_l', 'thigh_r', 'torso_l', 'torso_u', 'groin', 'farm_l', 'farm_r'] },
  zones: ['house', 'mall', 'suburbs'], weight: 1.5, maxPerZone: 2, diet: 'meat',
  meat: [['meat_raw', 3]],
  flags: { furniture: 'sofa' },
  sounds: { alert: 'sofa_groan', idle: 'sofa_groan', attack: 'davenport_roar', hurt: 'davenport_hurt', death: 'davenport_die', step: 'thud_soft' },
  scan: {
    cls: 'Ambush mimic / furniture',
    notes: [
      'A three-seater in faded florals, crocheted throw and all. The seat is a mouth. The springs are in its gums.',
      'Sleeps until disturbed: sitting on it, rummaging in it, bumping it, or loud noise close by.',
      'Bear legs tear out through the upholstery. It charges and knocks you flat, bites twice, then wanders off to become a sofa somewhere else.',
      'Too wide for doorways. Get through a door and it will give up.',
      'There are always coins and remotes inside it. Nobody knows where they came from.',
    ],
  },
  gore: { blood: 'stuffing', sever: ['legFL', 'legFR', 'legBL', 'legBR', 'armL', 'armR'], head: 'back', flesh: 0xd8ccbc },
  build: buildDavenport,
  animate: animateDavenport,
  think: thinkDavenport,
});

/** gallery poses: disguised, revealed, walk, bite, warn, reveal (loops the transformation), dead */
(sp as any).animateGallery = (rig: Rig, t: number) => {
  const q = galleryPose('');
  const k = q === 'disguised' ? 0 : q === 'reveal' || q === '' ? smooth01(clamp01(Math.sin(t * 0.5) * 1.3 + 0.5)) : 1;
  const b = (t * 0.6) % 1;
  const lunge = q === 'bite' ? (b < 0.55 ? -Math.sin(b / 0.55 * Math.PI * 0.5) : b < 0.68 ? -1 + 2 * smooth01((b - 0.55) / 0.13) : 1 - (b - 0.68) / 0.32) : 0;
  const jaw = q === 'bite' ? (b < 0.6 ? 1 : 0.25) : q === 'warn' ? 0.75 + Math.sin(t * 5) * 0.2 : q === 'revealed' ? 0.35 : 0;
  pose(rig as KRig, null, k, t, { moving: q === 'walk' ? 1 : 0, phase: t * 5, jaw, lunge, shake: q === 'bite' && b > 0.68 ? 1 - (b - 0.68) / 0.32 : 0, flinch: 0, dead: q === 'dead' ? 1 : 0, breathe: 1, turn: 0 });
};

// the horror layer: faceted wet materials, twitches, ragged breathing, lunges, recoils, a weighted death
horrify(sp, { twitch: 0.3, snap: 0.15, breathe: 0.02 });
