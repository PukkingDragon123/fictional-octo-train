import * as THREE from 'three';
import { def, Rig } from '../species';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { makeRamp, ph } from '../../gfx/pixel';
import { worldMaterial } from '../../gfx/materials';
import { tileFbm } from '../../core/rng';
import { G } from '../../game/G';
import { queueAt } from '../../actions/basic';
import { UseObjectAction } from '../../actions/world';
import type { Creature } from '../creature';
import type { ModelBuilder } from '../../gfx/modelBuilder';
import {
  CS, zoneOf, pulse, attack, nearestPlayer, stop, dist, faceTo, findSpot, objectsNear, walkable, anyPlayerSees,
  creatureMenu, poke, poked, heardMargin, suppressSighting, galleryPose,
} from '../behaviors_a';
import { SkinKit, KRig, tube, blob, spike, damp, approach, clamp01, smooth01, isLost, atkCurve, strikeShape, flinchOf, wrapPi, toLocal, V3 } from '../kit/anomalies';
import { wetGlints, veins } from '../kit/anomalyTextures';
import '../kit/anomalyTextures';
import { creatureMaterial } from '../species';

// =====================================================================================
// SWIVEL — an office chair that grew a spider into itself. Disguised it is the
// office chair, part for part. Revealed, the caster arms lift into jointed legs
// on telescoping chrome shins (the casters are its feet, with a hooked claw),
// the armrests split lengthwise into fanged mandibles, the seat cushion hinges
// up off a wet, toothed mouth with a tongue, and eight black eyes push out of
// the backrest where the tufting buttons would be. Sits among real chairs and
// bites ankles.
// =====================================================================================

addTextureModule(() => {
  const A = atlas();
  // the mouth floor under the cushion: gums around the rim, a ribbed wet tongue-bed, the throat at the back
  A.add('c_swivel_maw', 32, 32, (pc) => {
    pc.wrap = false;
    const R = makeRamp(0x6a2428, 9, { hueShift: -0.03, spread: 0.65, satShift: -0.06 });
    const h = (x: number, y: number) => tileFbm(x, y, 32, 32, 4, 2, 301);
    pc.fillRamp(R, (x, y) => {
      const dx = (x - 15.5) / 16, dy = (y - 9) / 18;
      const d = Math.hypot(dx, dy);
      const ridge = Math.sin(y * 0.9 + Math.sin(x * 0.4) * 1.2) * 0.5 + 0.5;
      return 0.05 + d * 0.5 + ridge * 0.14 + (h(x, y) - 0.5) * 0.22;
    }, 0.7);
    // the throat: a black hole at the back, folds of darker flesh around it
    pc.ellipse(15.5, 7, 8, 5.5, 0x3a0a0e); pc.ellipse(15.5, 7, 6, 4, 0x1a0406); pc.ellipse(15.5, 7.4, 4, 2.6, 0x060102);
    for (let x = 8; x < 24; x++) pc.blend(x, 13 + Math.round(Math.sin(x * 0.8) * 0.8), 0x2a0608, 0.55);
    veins(pc, 302, 4, 0x3a0a20, 12, 0.45);
    // torn foam and blue fabric fibres at the rim (where it grew into the chair)
    for (let i = 0; i < 32; i++) for (const [x, y] of [[i, 0], [0, i], [31, i], [i, 31]]) { pc.set(x, y, ph(i, x + y, 3) < 0.5 ? 0xb8a878 : 0x988858); if (ph(i, 5, x) < 0.3) pc.set(x === 0 ? 1 : x === 31 ? 30 : x, y === 0 ? 1 : y === 31 ? 30 : y, 0x3b4f76); }
    // saliva pooled in the tongue bed, a few wet glints
    for (let i = 0; i < 14; i++) { const x = 5 + Math.floor(ph(i, 1, 303) * 22), y = 12 + Math.floor(ph(i, 2, 303) * 16); pc.blend(x, y, 0xe0b0a8, 0.7); pc.blend(x + 1, y, 0xc88a88, 0.4); }
  });
  // the cushion's underside: transverse palate ridges, pale and glistening
  A.add('c_swivel_palate', 32, 32, (pc) => {
    pc.wrap = false;
    const R = makeRamp(0x9a4048, 8, { hueShift: -0.03, spread: 0.6 });
    pc.fillRamp(R, (x, y) => {
      const ridge = Math.sin(y * 0.95 + Math.sin(x * 0.35) * 1.5) * 0.5 + 0.5;
      return 0.18 + ridge * 0.4 + (tileFbm(x, y, 32, 32, 4, 2, 311) - 0.5) * 0.2 - Math.abs(x - 15.5) * 0.006;
    }, 0.6);
    for (let y = 0; y < 32; y++) pc.blend(15 + (y & 1), y, 0x4a1018, 0.5); // raphe down the middle
    for (let i = 0; i < 32; i++) for (const [x, y] of [[i, 0], [0, i], [31, i], [i, 31]]) pc.set(x, y, 0xa89868);
    for (let i = 0; i < 10; i++) pc.blend(4 + Math.floor(ph(i, 1, 312) * 24), 3 + Math.floor(ph(i, 2, 312) * 26), 0xf0c8c0, 0.6);
  });
  // chitin hook on the casters
  A.add('c_swivel_chitin', 8, 16, (pc) => {
    const R = makeRamp(0x2a1a1e, 6, { hueShift: -0.03, spread: 0.55 });
    pc.fillRamp(R, (x, y) => 0.2 + (y / 16) * 0.45 + (x === 2 ? 0.3 : 0) + (ph(x, y, 7) - 0.5) * 0.1, 0.4);
    pc.vline(2, 2, 12, 0x8a6a70);
  }, 8 / 64, 16 / 64);
});

const FAB = 'fabric_blue', TINT = { color: 0xb4b8c4 };
const LEG_A = (i: number) => (i / 5) * Math.PI * 2 + 0.31;
/** spoke (femur) length, telescoping shin length at scale 1 */
const L1 = 0.27, SHIN = 0.62;
const HUB_Y = 0.0625;
/** foot spread and lift when standing */
const FOOT_R = 0.56, RISE = 0.24;

function buildSwivel(): Rig {
  const K = new SkinKit(1.0);
  K.bone('hub', null, [0, HUB_Y, 0]);
  K.bone('seat', 'hub', [0, 0.385 - HUB_Y, 0]);
  K.bone('lid', 'seat', [0, 0.44 - 0.385, -0.205]);
  K.bone('back', 'seat', [0, 0.38 - 0.385, -0.29]);
  K.bone('eyes', 'back', [0, 0.4427, 0.0062]);
  K.bone('tongue0', 'seat', [0, 0.456 - 0.385, -0.06]);
  K.bone('tongue1', 'tongue0', [0, 0, 0.1]);
  K.bone('tongue2', 'tongue1', [0, 0, 0.1]);
  for (const s of [-1, 1]) {
    const a = s < 0 ? 'armL' : 'armR', j = s < 0 ? 'jawL' : 'jawR', f = s < 0 ? 'fangL' : 'fangR';
    K.bone(a, 'seat', [s * 0.255, 0.41 - 0.385, -0.03]);
    K.bone(j, a, [0, 0.665 - 0.41, -0.145 + 0.03]);
    K.bone(f, a, [0, 0.665 - 0.41, -0.01 + 0.03]);
  }
  for (let i = 0; i < 5; i++) {
    const a = LEG_A(i);
    K.bone('leg' + i, 'hub', [0, 0, 0], [0, a, 0]);
    K.bone('shin' + i, 'leg' + i, [L1, 0, 0]);
    K.bone('foot' + i, 'leg' + i, [L1, 0, 0]);
    K.bone('toe' + i, 'foot' + i, [0, 0.026 - HUB_Y, 0]);
  }

  // ---------------------------------------------------------------- the chair, exactly as the real one (chair_office)
  K.body('hub', (mb) => {
    mb.cylinder(0, 0.035, 0, 0.05, 0.05, 6, 'plastic_black');
  });
  // gas-lift stem: bends with the seat
  K.blend((mb) => { mb.cylinder(0, 0.08, 0, 0.022, 0.3, 6, 'chrome'); }, (p) => { const w = clamp01((p[1] - 0.2) / 0.18); return [['hub', 1 - w], ['seat', w]]; });
  for (let i = 0; i < 5; i++) {
    const a = LEG_A(i);
    K.body('leg' + i, (mb) => { mb.push().rotateY(a); mb.box(0.14, 0.045, 0, 0.27, 0.035, 0.045, 'plastic_black'); mb.pop(); });
    K.body('foot' + i, (mb) => {
      const x = Math.cos(a) * 0.27, z = -Math.sin(a) * 0.27, r = 0.026;
      mb.cylinderX(x, r, z, r, r * 0.9, 6, 'rubber_black');
      mb.box(x, r, z, r * 1.3, r * 1.2, r * 0.9, 'metal_dark');
    });
  }
  K.body('seat', (mb) => {
    mb.box(0, 0.36, 0, 0.2, 0.05, 0.22, 'metal_dark');
    mb.box(0.12, 0.37, 0.08, 0.1, 0.012, 0.02, 'plastic_black');
    mb.box(0, 0.41, 0.01, 0.5, 0.03, 0.48, 'plastic_black');
    mb.box(0, 0.38, -0.2, 0.08, 0.04, 0.16, 'metal_dark');
  });
  K.body('lid', (mb) => { mb.box(0, 0.44, 0.02, 0.48, 0.07, 0.45, { all: FAB, bottom: 'c_swivel_palate' }, { ...TINT, fit: { bottom: true } }); });
  K.body('back', (mb) => {
    mb.box(0, 0.38, -0.29, 0.07, 0.3, 0.03, 'metal_dark');
    mb.push().translate(0, 0.6, -0.29).rotateX(-0.13);
    mb.box(0, 0, 0, 0.45, 0.44, 0.07, FAB, TINT);
    mb.box(0, 0.03, -0.045, 0.41, 0.38, 0.02, 'plastic_black');
    mb.pop();
  });
  for (const s of [-1, 1]) {
    const a = s < 0 ? 'armL' : 'armR', j = s < 0 ? 'jawL' : 'jawR', f = s < 0 ? 'fangL' : 'fangR';
    K.body(a, (mb) => {
      mb.box(s * 0.255, 0.41, -0.03, 0.035, 0.24, 0.045, 'plastic_black');
      mb.box(s * 0.255, 0.665, -0.01, 0.065, 0.015, 0.27, 'plastic_black'); // upper half of the pad
    });
    K.body(j, (mb) => {
      mb.box(s * 0.255, 0.65, -0.01, 0.065, 0.015, 0.27, 'plastic_black'); // lower half: the moving jaw
      // a serrated row on its upper edge, hidden inside the pad while it is closed
      for (let k = 0; k < 6; k++) spike(mb, [s * (0.255 - 0.012), 0.662, -0.11 + k * 0.042], [0, 1, 0.25], 0.012, 0.008, 'c_an_tooth', 0xffffff, 0, 3);
    });
    K.body(f, (mb) => {
      // fangs along the upper half's underside and a hooked tip where the end cap was
      for (let k = 0; k < 6; k++) spike(mb, [s * (0.255 - 0.008), 0.666, -0.09 + k * 0.042], [0, -1, 0.3], 0.03, 0.009, 'c_an_tooth_dirty', 0xffffff, 0, 3);
      spike(mb, [s * 0.255, 0.664, 0.12], [-s * 0.25, -0.75, 1], 0.11, 0.016, 'c_swivel_chitin', 0xffffff, -0.035, 4);
      spike(mb, [s * 0.255, 0.672, 0.1], [-s * 0.6, -0.2, 1], 0.05, 0.01, 'c_an_tooth', 0xffffff, 0, 3);
    });
  }

  // ---------------------------------------------------------------- what the chair is hiding (inside its own volumes at rest)
  K.body('seat', (mb) => {
    // mouth floor, raised gums around it, teeth pointing up
    mb.box(0, 0.44, 0.015, 0.44, 0.003, 0.4, { top: 'c_swivel_maw', all: 'c_an_flesh' }, { fit: { top: true } });
    for (const [x0, z0, x1, z1] of [[-0.21, 0.205, 0.21, 0.205], [-0.205, -0.17, -0.205, 0.2], [0.205, -0.17, 0.205, 0.2]] as const) {
      const n = 8;
      tube(mb, Array.from({ length: n + 1 }, (_, k) => [x0 + (x1 - x0) * k / n, 0.446, z0 + (z1 - z0) * k / n] as V3), 0.012, 6, 'c_an_gum', { squash: [0.6, 1] });
    }
    for (let k = 0; k < 9; k++) spike(mb, [-0.18 + k * 0.045, 0.452, 0.2], [0, 1, 0.15], 0.034, 0.013, k % 3 === 1 ? 'c_an_tooth_dirty' : 'c_an_tooth', 0xffffff, 0, 4);
    for (const s of [-1, 1]) for (let k = 0; k < 6; k++) spike(mb, [s * 0.2, 0.452, -0.13 + k * 0.055], [-s * 0.1, 1, 0], 0.028, 0.012, 'c_an_tooth', 0xffffff, 0, 4);
  });
  K.body('lid', (mb) => {
    // upper teeth on the cushion's underside, pointing down into the seat shell
    for (let k = 0; k < 9; k++) spike(mb, [-0.18 + k * 0.045, 0.4405, 0.21], [0, -1, 0.1], 0.029, 0.013, k % 4 === 2 ? 'c_an_tooth_dirty' : 'c_an_tooth', 0xffffff, 0, 4);
    for (const s of [-1, 1]) for (let k = 0; k < 5; k++) spike(mb, [s * 0.205, 0.4405, -0.1 + k * 0.06], [s * 0.1, -1, 0], 0.026, 0.011, 'c_an_tooth', 0xffffff, 0, 4);
  });
  // tongue: a flat wet tube lying on the mouth floor, bending through three bones
  K.blend((mb) => {
    const pts: V3[] = []; for (let k = 0; k <= 8; k++) pts.push([0, 0.455, -0.07 + k * 0.032]);
    tube(mb, pts, (t) => 0.034 * (1 - t * 0.55), 7, 'c_an_tongue', { squash: [0.32, 1], capEnd: true, fitU: true, seam: Math.PI });
  }, (p) => {
    const z = p[2];
    const w1 = clamp01((z + 0.0) / 0.1), w2 = clamp01((z - 0.1) / 0.08);
    return [['tongue0', 1 - w1], ['tongue1', w1 * (1 - w2)], ['tongue2', w2]];
  });
  // strings of saliva between the jaws: stretched by the lid as it opens
  K.blend((mb) => {
    for (const [x, z] of [[-0.17, -0.06], [0.16, -0.1], [0.08, -0.03]]) tube(mb, [[x, 0.443, z], [x + 0.004, 0.46, z], [x, 0.478, z]], 0.0045, 4, 'c_an_mucus', { color: 0xa89878 });
  }, (p) => { const w = clamp01((p[1] - 0.443) / 0.035); return [['seat', 1 - w], ['lid', w]]; });
  // eight black eyes behind the tufting
  K.local('eyes', (mb) => {
    mb.push().rotateX(-0.13);
    const E: [number, number, number][] = [[-0.045, 0.02, 0.034], [0.045, 0.02, 0.034], [-0.11, 0.07, 0.022], [0.11, 0.07, 0.022], [-0.09, -0.06, 0.02], [0.09, -0.06, 0.02], [-0.02, -0.1, 0.016], [0.03, 0.12, 0.016]];
    for (const [x, y, r] of E) blob(mb, [x, y, 0.006], [r * 1.3, r * 1.3, r], 6, 3, 'c_an_eye_black', { fit: true, ao: false });
    mb.pop();
  });
  // telescoping shins: knuckle, rubber bellows, two chrome stages and a collar (collapsed into the knee at rest)
  for (let i = 0; i < 5; i++) {
    K.local('shin' + i, (mb) => {
      blob(mb, [0, 0, 0], [0.031, 0.031, 0.031], 7, 4, 'c_an_chrome', {});
      tube(mb, [[0, -0.01, 0], [0, -0.085, 0]], 0.027, 7, 'c_an_bellows', { fitU: true });
      tube(mb, [[0, -0.08, 0], [0, -0.33, 0]], 0.021, 7, 'c_an_chrome_rod', { fitU: true });
      mb.cylinder(0, -0.35, 0, 0.026, 0.035, 7, 'metal_dark');
      tube(mb, [[0, -0.33, 0], [0, -SHIN, 0]], 0.015, 6, 'c_an_chrome_rod', { fitU: true });
      // a few stiff black bristles on the upper stage
      for (let k = 0; k < 4; k++) { const ang = k * 1.7; spike(mb, [Math.cos(ang) * 0.014, -0.12 - k * 0.05, Math.sin(ang) * 0.014], [Math.cos(ang), -0.6, Math.sin(ang)], 0.035, 0.0035, 'plastic_black', 0xffffff, 0, 3); }
    });
    // the hook claw that unfolds from the caster fork
    K.local('toe' + i, (mb) => {
      spike(mb, [0.012, 0.0, 0], [1, -0.45, 0], 0.085, 0.012, 'c_swivel_chitin', 0xffffff, -0.03, 4);
      spike(mb, [-0.01, -0.005, 0.01], [-0.6, -0.8, 0.5], 0.04, 0.007, 'c_swivel_chitin', 0xffffff, 0, 3);
      spike(mb, [-0.01, -0.005, -0.01], [-0.6, -0.8, -0.5], 0.04, 0.007, 'c_swivel_chitin', 0xffffff, 0, 3);
    });
  }
  const rig = K.finish({ sphere: [0, 0.5, 0, 1.4] });
  rig.headY = 1.0;
  return rig;
}

// ---------------------------------------------------------------- animation
const PROP_MAT = () => worldMaterial({ cutout: true });

interface Feet { px: number[]; pz: number[]; fx: number[]; fz: number[]; tx: number[]; tz: number[]; t: number[]; on: boolean[] }

/** k: 0 = an ordinary office chair, 1 = standing on its legs */
function pose(rig: KRig, c: Creature | null, k: number, t: number, dt: number, o: { moving: number; speed: number; open: number; lunge: number; lean: number; flinch: number; dead: number; phase: number }) {
  const P = rig.parts;
  const rv = smooth01(k);
  // body height and attitude
  const bob = o.moving * Math.abs(Math.sin(o.phase * 2.5)) * 0.025;
  const breathe = Math.sin(t * 2.3) * 0.008 * rv;
  const by = RISE * rv + bob * rv + breathe - o.lunge * 0.06 * rv + (o.lunge < 0 ? o.lunge * 0.04 : 0);
  rig.body.position.y = by;
  rig.body.position.z = o.lunge * 0.16 * rv - o.flinch * 0.06;
  let tiltX = (o.lean * 0.12 + o.lunge * 0.14) * rv - o.flinch * 0.25;
  let tiltZ = o.moving * Math.sin(o.phase * 2.5) * 0.04 * rv;
  // missing legs: it sags toward the gap
  if (c) for (let i = 0; i < 5; i++) if (isLost(c, 'leg' + i)) { const a = LEG_A(i); tiltX += -Math.sin(a) * 0.1 * rv; tiltZ -= Math.cos(a) * 0.1 * rv; }
  rig.body.rotation.set(tiltX, 0, tiltZ);
  P.seat.rotation.set(0.12 * rv + o.lunge * 0.1 + Math.sin(t * 1.7) * 0.02 * rv, Math.sin(t * 0.9) * 0.05 * rv, 0);
  // mouth
  const open = clamp01(o.open);
  P.lid.rotation.x = -(open * 1.05 + Math.sin(t * 13) * 0.025 * open * rv);
  P.back.rotation.x = 0.42 * rv - open * 0.25 + Math.sin(t * 6.5) * 0.02 * rv;
  const ey = Math.max(0.001, rv * (((t * 0.37) % 1) < 0.04 ? 0.25 : 1));
  P.eyes.scale.set(Math.max(0.001, rv), ey, Math.max(0.001, rv));
  // tongue: lolls over the lower teeth when the mouth is open, licks and writhes
  const tl = open * rv;
  P.tongue0.rotation.set(-tl * 0.25 + Math.sin(t * 4.1) * 0.08 * tl, Math.sin(t * 3.3) * 0.25 * tl, 0);
  P.tongue1.rotation.set(tl * 0.55 + Math.sin(t * 5.3 + 1) * 0.25 * tl, Math.sin(t * 4.7 + 0.5) * 0.3 * tl, 0);
  P.tongue2.rotation.set(tl * 0.65 + Math.sin(t * 6.1 + 2) * 0.35 * tl, Math.sin(t * 5.9 + 1) * 0.35 * tl, 0);
  P.tongue0.position.z = -0.06 + tl * 0.13;
  // armrests: swing forward into mandibles, the pads split and the fangs come out
  const mand = rv;
  const pinch = o.lunge > 0 ? 1 - o.lunge : 1;
  for (const s of [-1, 1]) {
    const a = P[s < 0 ? 'armL' : 'armR'], j = P[s < 0 ? 'jawL' : 'jawR'], f = P[s < 0 ? 'fangL' : 'fangR'];
    a.rotation.set(1.25 * mand + o.lunge * 0.2 * mand, -s * (0.32 * mand) * pinch, -s * 0.18 * mand + Math.sin(t * 9 + s) * 0.05 * mand * (0.3 + open));
    j.rotation.x = 0.55 * mand * (0.4 + 0.6 * Math.max(open, 0.3)) * pinch;
    f.scale.setScalar(Math.max(0.001, mand));
  }
  // legs
  const feet: Feet | null = c?.mem._feet ?? null;
  const toeK = Math.max(0.001, rv);
  rig.body.updateMatrix();
  const bodyInv = TMP_M.copy(rig.body.matrix).invert();
  for (let i = 0; i < 5; i++) {
    const a = LEG_A(i);
    const leg = P['leg' + i], shin = P['shin' + i], foot = P['foot' + i], toe = P['toe' + i];
    // foot target in root space: planted feet when alive and walking, a fixed stance otherwise
    let fx: number, fy: number, fz: number;
    if (feet && rv > 0.01 && !o.dead) {
      const [lx, lz] = toLocal(c!.x, c!.z, Math.PI / 2 - c!.facing, feet.fx[i], feet.fz[i]);
      fx = lx; fz = lz; fy = HUB_Y + (feet.on[i] ? Math.sin(clamp01(feet.t[i]) * Math.PI) * 0.09 : 0);
    } else {
      const r = FOOT_R * (o.dead ? 0.7 : 1);
      fx = Math.cos(a) * r; fz = -Math.sin(a) * r; fy = HUB_Y + (o.dead ? 0.15 : 0);
    }
    TMP_V.set(fx, fy, fz).applyMatrix4(bodyInv);
    const hx = TMP_V.x, hz = TMP_V.z, dy = TMP_V.y - HUB_Y;
    const yawF = Math.atan2(-hz, hx);
    const h = Math.hypot(hx, hz);
    // the femur rises steeply, the telescoping shin reaches the floor
    const phi = (0.62 + (o.dead ? 0.7 : 0) + Math.max(0, -o.lunge) * 0.25 - o.flinch * 0.3) + (feet?.on[i] ? Math.sin(clamp01(feet.t[i]) * Math.PI) * 0.2 : 0);
    const kx = Math.cos(phi) * L1, ky = Math.sin(phi) * L1;
    const sx = h - kx, sy = dy - ky;
    let len = Math.hypot(sx, sy);
    let psi = Math.atan2(sx, -sy) - phi;
    if (o.dead) { psi += 1.1; len *= 0.6; } // curled in like a dead spider
    leg.rotation.set(0, a + wrapPi(yawF - a) * rv, phi * rv);
    shin.rotation.set(0, 0, psi * rv);
    const ls = Math.max(0.001, (len / SHIN) * rv);
    const w = Math.max(0.001, Math.min(1, rv * 1.6));
    shin.scale.set(w, ls, w);
    const tl = (len / SHIN) * rv * SHIN;
    const sp = Math.sin(psi * rv), cp = Math.cos(psi * rv);
    foot.position.set(L1 + sp * tl, -cp * tl, 0);
    foot.rotation.set(0, 0, -phi * rv);
    toe.scale.setScalar(toeK);
    toe.rotation.z = (feet?.on[i] ? -0.4 : 0.15) * rv + (o.dead ? -0.8 : 0);
  }
}
const TMP_M = new THREE.Matrix4(), TMP_V = new THREE.Vector3();

/** procedural foot planting: legs step in a wave, never two neighbours at once */
function stepFeet(c: Creature, dt: number, rv: number) {
  let F: Feet = c.mem._feet;
  const ry = Math.PI / 2 - c.facing;
  const cs = Math.cos(ry), sn = Math.sin(ry);
  const want = (i: number, lead: number): [number, number] => {
    const a = LEG_A(i);
    const lx = Math.cos(a) * FOOT_R, lz = -Math.sin(a) * FOOT_R;
    return [c.x + lx * cs + lz * sn + c.vx * lead, c.z - lx * sn + lz * cs + c.vz * lead];
  };
  if (!F || rv < 0.3) {
    F = c.mem._feet = { px: [], pz: [], fx: [], fz: [], tx: [], tz: [], t: [], on: [] } as Feet;
    for (let i = 0; i < 5; i++) { const [x, z] = want(i, 0); F.px[i] = F.fx[i] = F.tx[i] = x; F.pz[i] = F.fz[i] = F.tz[i] = z; F.t[i] = 0; F.on[i] = false; }
    return;
  }
  const spd = Math.hypot(c.vx, c.vz);
  const dur = spd > 2.5 ? 0.09 : spd > 0.8 ? 0.14 : 0.2;
  const thr = spd > 2.5 ? 0.16 : 0.12;
  let moving = 0;
  for (let i = 0; i < 5; i++) if (F.on[i]) moving++;
  for (let i = 0; i < 5; i++) {
    if (isLost(c, 'leg' + i)) { F.on[i] = false; continue; }
    if (F.on[i]) {
      F.t[i] += dt / dur;
      const [x, z] = want(i, 0.12);
      F.tx[i] = x; F.tz[i] = z; // keep re-aiming while in the air
      const e = smooth01(F.t[i]);
      F.fx[i] = F.px[i] + (F.tx[i] - F.px[i]) * e; F.fz[i] = F.pz[i] + (F.tz[i] - F.pz[i]) * e;
      if (F.t[i] >= 1) { F.on[i] = false; F.px[i] = F.fx[i] = F.tx[i]; F.pz[i] = F.fz[i] = F.tz[i]; moving--; }
      continue;
    }
    const [x, z] = want(i, 0);
    const d = Math.hypot(x - F.fx[i], z - F.fz[i]);
    const nb = F.on[(i + 1) % 5] || F.on[(i + 4) % 5];
    if ((d > thr && !nb && moving < 2) || d > 0.5) {
      F.on[i] = true; F.t[i] = 0; F.px[i] = F.fx[i]; F.pz[i] = F.fz[i]; moving++;
    }
  }
}

function animateSwivel(rig: Rig, c: Creature, t: number, dt: number) {
  const R = rig as KRig;
  const hidden = c.state === 'disguised' || (c.state === 'hide' && !c.dead);
  suppressSighting(c, c.state === 'disguised');
  const target = hidden || c.dead ? 0 : 1;
  const m = c.mem;
  m._rv = m._rv === undefined ? target : approach(m._rv, target, target ? 5 : 1.6, dt);
  const rv = c.dead ? Math.min(1, 0.6 + 0.4 * (m._rv ?? 0)) : m._rv;
  // furniture shares the props' cut-away material so it vanishes with the real chairs
  const skin = R.skins.n;
  const want = rv < 0.02 && !c.dead ? PROP_MAT() : creatureMaterial(false);
  if (skin && skin.material !== want) skin.material = want;
  const { wind, rec } = atkCurve(c, dt, 0.4);
  const lunge = strikeShape(wind, rec);
  m._open = damp(m._open ?? 0, wind > 0 ? (wind < 0.7 ? 1 : 0.15) : rec > 0.4 ? 0.6 : c.state === 'chase' ? 0.35 + Math.sin(t * 7) * 0.12 : c.state === 'flee' ? 0.12 : 0, wind > 0.7 ? 30 : 9, dt);
  stepFeet(c, dt, rv);
  const fl = flinchOf(c);
  const dead = c.dead ? 1 : 0;
  // death throes: twitching for a couple of seconds, then still
  const tw = c.dead && c.deathT < 2.5 ? Math.max(0, Math.sin(t * 31) * Math.sin(t * 7.3)) * (1 - c.deathT / 2.5) : 0;
  pose(R, c.dead ? null : c, rv, t, dt, {
    moving: c.speed > 0.2 ? 1 : 0, speed: c.speed, open: c.dead ? 0.45 + tw * 0.3 : m._open, lunge: c.dead ? 0 : lunge,
    lean: c.state === 'chase' ? 1 : 0, flinch: Math.max(fl, tw), dead, phase: c.phase,
  });
}

/** a dark spot next to real chairs and desks, away from survivors */
function hideSpot(c: Creature): { x: number; z: number } | null {
  const z = zoneOf(c), rng = CS().rng;
  const props = objectsNear(z, c.x, c.z, 16, (o, d) => (d.tags?.includes('chair') || d.tags?.includes('desk') || /chair|desk/.test(o.key)) && dist(o.x + 0.5, o.y + 0.5, c.x, c.z) > 5, 24);
  rng.shuffle(props);
  for (const o of props.slice(0, 8)) {
    for (const [dx, dy] of rng.shuffle([[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]] as [number, number][])) {
      const x = o.x + dx, y = o.y + dy;
      if (!walkable(z, x, y) || z.objectsAt(x, y).length) continue;
      const near = nearestPlayer(c, 6, () => true);
      if (near && dist(near.p.x, near.p.z, x + 0.5, y + 0.5) < 5) continue;
      if (anyPlayerSees(c.zoneKey, x + 0.5, y + 0.5, 14)) continue;
      return { x: x + 0.5, z: y + 0.5 };
    }
  }
  return findSpot(c, { rMin: 6, rMax: 16, dark: 0.35, unseen: true }) || findSpot(c, { rMin: 6, rMax: 16, unseen: true }) || CS().fleeSpot(c, z, c.x, c.z);
}

function thinkSwivel(c: Creature, dt: number): boolean {
  const cs = CS(), z = zoneOf(c);
  const ev = pulse(c);
  const T = c.targetId ? G.players.get(c.targetId) : null;
  switch (c.state) {
    case 'disguised': {
      stop(c);
      const by = poked(c, 'sit');
      let victim = by ? G.players.get(by) ?? null : null;
      const np = nearestPlayer(c, 2.2, (p) => !p.body.dead);
      if (!victim && np) {
        const close = np.p.stance === 'sneak' ? 0.95 : 1.75;
        if (np.d < close && (np.p.speed > 0.2 || np.d < 1.0)) victim = np.p;
      }
      if (!victim && ev.staggered && np) victim = np.p;
      if (!victim && heardMargin(c) > 9 && np && np.d < 3) victim = np.p;
      if (victim) {
        c.targetId = victim.id; c.mem.bites = 0;
        c.setState('chase'); cs.call(c, 'alert');
        return true;
      }
      // the chair has turned to face you since you last looked
      if (!c.observed && c.stateT > 6 && CS().rng.chance(dt * 0.05)) {
        const p = nearestPlayer(c, 10); if (p) faceTo(c, p.p.x, p.p.z, true);
        c.stateT = 0;
      }
      return true;
    }
    case 'chase': {
      if (!T || T.body.dead || T.zoneKey !== c.zoneKey) { c.setState('flee'); c.goal = hideSpot(c); return true; }
      const d = dist(T.x, T.z, c.x, c.z);
      const b = c.mem.bites ?? 0;
      if ((b >= 2 || (b >= 1 && d < 1.4)) && c.attackT < (c.sp.attack!.cooldown - 0.35)) { c.setState('flee'); c.goal = hideSpot(c); return true; }
      if (c.stateT > 5 || d > 8 || c.hp < c.sp.hp * 0.45) { c.setState('flee'); c.goal = hideSpot(c); return true; }
      const reach = (c.sp.attack?.range ?? 0.7) + T.radius;
      if (d <= reach) {
        faceTo(c, T.x, T.z); stop(c);
        if (c.attackT <= 0) {
          attack(c, T); c.mem.bites = (c.mem.bites ?? 0) + 1;
          // lunge at the ankles so a walking victim does not simply step out of the bite
          const dd = Math.max(0.1, d); c.vx = ((T.x - c.x) / dd + T.vx * 0.15) * 5; c.vz = ((T.z - c.z) / dd + T.vz * 0.15) * 5;
        }
        return true;
      }
      cs.moveTo(c, z, T.x, T.z, c.sp.run, dt, reach * 0.8);
      return true;
    }
    case 'flee': {
      if (!c.goal) c.goal = hideSpot(c);
      if (!c.goal || cs.moveTo(c, z, c.goal.x, c.goal.z, c.sp.run * 0.9, dt, 0.35) || c.stateT > 10) {
        c.setState('hide'); stop(c);
      }
      if (c.stateT > 0.5 && c.noiseCooldown <= 0) { cs.call(c, 'alert'); c.noiseCooldown = 3; }
      return true;
    }
    case 'hide': {
      stop(c);
      if (ev.hurt > 0) { c.setState('chase'); return true; }
      if (!c.observed && c.stateT > 1.5) {
        c.setState('disguised'); c.awareness.clear(); c.targetId = null;
        c.facing = c.targetFacing = Math.floor(CS().rng.next() * 8) * (Math.PI / 4);
      } else if (c.stateT > 12) { c.setState('flee'); c.goal = hideSpot(c); }
      return true;
    }
    default:
      c.setState('flee'); c.goal = hideSpot(c);
      return true;
  }
}

creatureMenu('swivel', (p, c, opts) => {
  if (c.state !== 'disguised') return;
  opts.push({ label: 'Sit down', action: () => queueAt(p, c.x, c.z, new UseObjectAction(p, 'Sit', 0.5, 'pickup', () => poke(p, c, 'sit')), 1.2, false) });
});

const sp = def({
  key: 'swivel', name: 'Swivel', code: 'E-23 // ARACH-ERGONOMIC', temperament: 'ambush', threat: 2,
  rule: { name: 'WALK-PAST LUNGE', text: "It lunges at whoever walks right past it. Sneak by at arm's length, or kick a chair that turned to face you." },
  hp: 24, walk: 1.6, run: 6.6, turn: 16, radius: 0.32, height: 1.05, sight: 6, fov: 2.6, hearing: 1.0, vibration: true,
  attack: { dmg: [4, 9], range: 0.85, cooldown: 0.9, kinds: ['bite', 'laceration', 'scratch'], corrupt: 0.05, knock: 0.2, parts: ['foot_l', 'foot_r', 'shin_l', 'shin_r'] },
  zones: ['office', 'school', 'market'], weight: 3, group: [1, 2], maxPerZone: 5, diet: 'meat',
  flags: { furniture: 'chair_office' },
  sounds: { alert: 'swivel_skitter', attack: 'swivel_bite', hurt: 'chair_squeak', death: 'swivel_die', step: 'plastic_tap' },
  scan: {
    cls: 'Ambush mimic / furniture',
    notes: [
      'An office chair. Five caster arms that unfold into legs on telescoping chrome shins; eight eyes behind the backrest fabric; a mouth under the cushion.',
      'Lunges when someone walks right past it. Sneaking past at arm\'s length is usually safe.',
      'Bites once — always low, ankles and shins — then skitters off to hide among other chairs.',
      'A chair that faces you when it did not before is not a chair. Kick it before it moves.',
    ],
  },
  gore: { blood: 'oil', sever: ['leg0', 'leg1', 'leg2', 'leg3', 'leg4', 'armL', 'armR'], head: 'back' },
  build: buildSwivel,
  animate: animateSwivel,
  think: thinkSwivel,
});

/** gallery poses: disguised, revealed, walk, bite, reveal (loops the transformation), dead */
(sp as any).animateGallery = (rig: Rig, t: number) => {
  const q = galleryPose('');
  const R = rig as KRig;
  const k = q === 'disguised' ? 0 : q === 'reveal' || q === '' ? smooth01(clamp01(Math.sin(t * 0.7) * 1.4 + 0.5)) : 1;
  const bite = q === 'bite' ? (t * 0.9) % 1 : 0;
  const lunge = q === 'bite' ? (bite < 0.5 ? -Math.sin(bite / 0.5 * Math.PI * 0.5) : bite < 0.62 ? -1 + 2 * smooth01((bite - 0.5) / 0.12) : 1 - (bite - 0.62) / 0.38) : 0;
  const open = q === 'bite' ? (bite < 0.55 ? 1 : 0.1) : q === 'revealed' ? 0.55 : q === 'walk' ? 0.3 : 0;
  const fake: any = q === 'walk' ? { x: 0, z: 0, facing: Math.PI / 2, vx: 0, vz: 1.2, mem: {}, phase: t * 6 } : null;
  if (fake) {
    // walk in place: feet cycle in a wave under a stationary body
    const F: Feet = { px: [], pz: [], fx: [], fz: [], tx: [], tz: [], t: [], on: [] };
    for (let i = 0; i < 5; i++) {
      const a = LEG_A(i), ph0 = ((t * 2.2 + i * 0.4) % 1);
      const sw = ph0 < 0.35 ? ph0 / 0.35 : 1 - (ph0 - 0.35) / 0.65;
      const off = (sw - 0.5) * 0.24;
      // root frame is identity in the gallery: local == world
      F.fx[i] = Math.cos(a) * FOOT_R; F.fz[i] = -Math.sin(a) * FOOT_R + off;
      F.on[i] = ph0 < 0.35; F.t[i] = ph0 / 0.35;
    }
    fake.mem._feet = F;
  }
  pose(R, fake, k, t, 1 / 60, { moving: q === 'walk' ? 1 : 0, speed: 0, open, lunge, lean: q === 'walk' ? 1 : 0, flinch: 0, dead: q === 'dead' ? 1 : 0, phase: t * 6 });
};
