// Grinhound and the Lost Dog. One canine skeleton, two animals:
//  * the grinhound: an emaciated, half-hairless pack hunter. Ribs, spine,
//    shoulder blades and hip bones push through wet mangy hide; its skull is
//    rolled ninety degrees so the jaw opens sideways, and the grin runs back
//    to where the ear should be: far too many flat human teeth.
//  * the lost dog: a scruffy, well-fed stray that wags its tail anyway. Floppy
//    ears, a collar with a tag, eyes with whites like a person's and a smile
//    a little too wide.
// Models are lofted low-poly meshes (one per moving part) textured from
// per-species pixel-art pages with seeded colour variants; legs are placed by
// two-bone IK on a phase-driven gait (walk / gallop), with stalk, warn,
// lunge-bite, flinch, sleep and death poses. Severable parts keep the old
// names and carry painted flesh-and-bone cross-sections at the cut.
import * as THREE from 'three';
import { def, newRig, Rig } from '../species';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { makeRamp, mixHex, scaleHex, ph } from '../../gfx/pixel';
import { G } from '../../game/G';
import type { Creature } from '../creature';
import {
  Page, Painter, Reg, OB, V3, bpart, bodyRing, registerPage, applyLook, meshOf, gaitState, trackMotion, poseLegs, LegSpec, GaitParams,
  animMem, tickEvents, lookAtTarget, partGone, clamp, clamp01, lerp, smooth, gauss, damp, hash01, wrapA, LoftRing,
  Row, sampleRows, ab, uOf, ramp, Lv, fillLv, galleryDeathRoll,
} from '../kit/beasts';

// ---------------------------------------------------------------- shared atlas bits (other species use the glow)
addTextureModule(() => {
  const A = atlas();
  A.add('c_eye_glow', 4, 4, (pc) => { pc.fill(0xfff2c0); pc.set(0, 0, 0xffd070); pc.set(3, 3, 0xffd070); });
});

// =====================================================================================
// pages
// =====================================================================================
const REGS: [string, number, number][] = [
  ['TORSO', 64, 56], ['HEAD', 48, 30], ['NECK', 32, 22], ['JAW', 32, 16], ['HLEG_U', 28, 22], ['HLEG_L', 20, 36],
  ['FLEG_U', 24, 18], ['FLEG_L', 18, 34], ['TAIL', 12, 36], ['TEETH', 40, 8], ['EAR', 16, 18], ['PAW', 18, 12],
  ['CUT', 16, 16], ['EYE', 6, 6], ['NOSE', 8, 6], ['CLAW', 4, 6], ['FUR', 16, 12], ['COLLAR', 24, 6],
];
const HOUND = registerPage(new Page('c_houndpg', 128, 128, REGS, 4));
const DOG = registerPage(new Page('c_dogpg', 128, 128, REGS, 3));

// ---------------------------------------------------------------- body plan

interface Plan {
  page: Page;
  dog: boolean;
  torsoY: number;
  torso: Row[];
  ribs: number;
  /** z range of the ribcage and the rib pitch */
  ribZ: [number, number]; ribP: number;
  shoulder: V3; hip: V3;
  fL1: number; fL2: number; hL1: number; hL2: number;
  neckAt: V3; neckEnd: V3; neckR: [number, number];
  skull: Row[]; jaw: Row[]; hinge: V3;
  roll: number;
  tailAt: V3; tailL: number; tailR: number;
  legR: number;
}

const HOUND_PLAN: Plan = {
  page: HOUND, dog: false, torsoY: 0.62,
  torso: [
    { z: -0.445, cy: 0.035, rx: 0.03, up: 0.03, dn: 0.03 },
    { z: -0.41, cy: 0.035, rx: 0.07, up: 0.058, dn: 0.07 },
    { z: -0.35, cy: 0.032, rx: 0.098, up: 0.074, dn: 0.1 },
    { z: -0.28, cy: 0.04, rx: 0.1, up: 0.074, dn: 0.104 },
    { z: -0.2, cy: 0.06, rx: 0.062, up: 0.056, dn: 0.05 },
    { z: -0.13, cy: 0.05, rx: 0.078, up: 0.064, dn: 0.08 },
    { z: -0.06, cy: 0.042, rx: 0.094, up: 0.074, dn: 0.125 },
    { z: 0.02, cy: 0.036, rx: 0.108, up: 0.08, dn: 0.165 },
    { z: 0.1, cy: 0.036, rx: 0.112, up: 0.086, dn: 0.185 },
    { z: 0.18, cy: 0.042, rx: 0.106, up: 0.098, dn: 0.18 },
    { z: 0.25, cy: 0.052, rx: 0.096, up: 0.096, dn: 0.165 },
    { z: 0.31, cy: 0.062, rx: 0.08, up: 0.086, dn: 0.13 },
    { z: 0.36, cy: 0.08, rx: 0.06, up: 0.07, dn: 0.09 },
    { z: 0.39, cy: 0.09, rx: 0.045, up: 0.055, dn: 0.06 },
  ],
  ribs: 0.07, ribZ: [-0.09, 0.2], ribP: 0.048,
  shoulder: [0.078, -0.07, 0.235], hip: [0.072, -0.02, -0.3],
  fL1: 0.2, fL2: 0.385, hL1: 0.245, hL2: 0.425,
  neckAt: [0, 0.08, 0.33], neckEnd: [0, 0.13, 0.2], neckR: [0.052, 0.042],
  skull: [
    { z: -0.078, cy: 0.002, rx: 0.026, up: 0.026, dn: 0.024 },
    { z: -0.06, cy: 0.008, rx: 0.054, up: 0.056, dn: 0.046 },
    { z: -0.03, cy: 0.012, rx: 0.068, up: 0.07, dn: 0.054 },
    { z: 0.0, cy: 0.008, rx: 0.072, up: 0.062, dn: 0.052 },
    { z: 0.035, cy: -0.002, rx: 0.056, up: 0.05, dn: 0.046 },
    { z: 0.065, cy: -0.008, rx: 0.042, up: 0.04, dn: 0.038 },
    { z: 0.1, cy: -0.012, rx: 0.036, up: 0.033, dn: 0.033 },
    { z: 0.14, cy: -0.013, rx: 0.033, up: 0.03, dn: 0.031 },
    { z: 0.18, cy: -0.013, rx: 0.03, up: 0.028, dn: 0.029 },
    { z: 0.212, cy: -0.015, rx: 0.025, up: 0.023, dn: 0.026 },
  ],
  jaw: [
    { z: -0.012, cy: -0.004, rx: 0.044, up: 0.014, dn: 0.03 },
    { z: 0.03, cy: -0.01, rx: 0.042, up: 0.01, dn: 0.026 },
    { z: 0.08, cy: -0.014, rx: 0.034, up: 0.009, dn: 0.021 },
    { z: 0.14, cy: -0.015, rx: 0.028, up: 0.008, dn: 0.018 },
    { z: 0.198, cy: -0.013, rx: 0.021, up: 0.007, dn: 0.014 },
  ],
  hinge: [0, -0.034, -0.012], roll: Math.PI / 2,
  tailAt: [0, 0.03, -0.42], tailL: 0.42, tailR: 0.022, legR: 1,
};

const DOG_PLAN: Plan = {
  page: DOG, dog: true, torsoY: 0.5,
  torso: [
    { z: -0.37, cy: 0.035, rx: 0.04, up: 0.04, dn: 0.04 },
    { z: -0.34, cy: 0.035, rx: 0.088, up: 0.07, dn: 0.085 },
    { z: -0.28, cy: 0.035, rx: 0.11, up: 0.085, dn: 0.11 },
    { z: -0.2, cy: 0.04, rx: 0.105, up: 0.085, dn: 0.1 },
    { z: -0.12, cy: 0.045, rx: 0.106, up: 0.088, dn: 0.11 },
    { z: -0.04, cy: 0.04, rx: 0.116, up: 0.092, dn: 0.14 },
    { z: 0.05, cy: 0.04, rx: 0.122, up: 0.096, dn: 0.155 },
    { z: 0.13, cy: 0.045, rx: 0.118, up: 0.104, dn: 0.15 },
    { z: 0.21, cy: 0.055, rx: 0.106, up: 0.1, dn: 0.14 },
    { z: 0.27, cy: 0.07, rx: 0.088, up: 0.09, dn: 0.115 },
    { z: 0.31, cy: 0.085, rx: 0.065, up: 0.07, dn: 0.08 },
  ],
  ribs: 0, ribZ: [0, 0], ribP: 0.05,
  shoulder: [0.08, -0.06, 0.19], hip: [0.075, -0.02, -0.25],
  fL1: 0.16, fL2: 0.3, hL1: 0.19, hL2: 0.33,
  neckAt: [0, 0.08, 0.27], neckEnd: [0, 0.13, 0.15], neckR: [0.07, 0.06],
  skull: [
    { z: -0.07, cy: 0.004, rx: 0.03, up: 0.032, dn: 0.028 },
    { z: -0.055, cy: 0.01, rx: 0.058, up: 0.06, dn: 0.05 },
    { z: -0.025, cy: 0.012, rx: 0.07, up: 0.07, dn: 0.058 },
    { z: 0.01, cy: 0.006, rx: 0.068, up: 0.064, dn: 0.055 },
    { z: 0.04, cy: -0.006, rx: 0.052, up: 0.046, dn: 0.048 },
    { z: 0.075, cy: -0.016, rx: 0.042, up: 0.034, dn: 0.038 },
    { z: 0.11, cy: -0.018, rx: 0.036, up: 0.03, dn: 0.034 },
    { z: 0.138, cy: -0.018, rx: 0.03, up: 0.026, dn: 0.03 },
  ],
  jaw: [
    { z: -0.012, cy: -0.004, rx: 0.046, up: 0.014, dn: 0.03 },
    { z: 0.03, cy: -0.01, rx: 0.042, up: 0.01, dn: 0.026 },
    { z: 0.08, cy: -0.013, rx: 0.033, up: 0.009, dn: 0.02 },
    { z: 0.128, cy: -0.012, rx: 0.025, up: 0.008, dn: 0.015 },
  ],
  hinge: [0, -0.038, -0.004], roll: 0,
  tailAt: [0, 0.05, -0.35], tailL: 0.36, tailR: 0.05, legR: 1.25,
};

// =====================================================================================
// geometry
// =====================================================================================

function torsoGeo(ob: OB, S: Plan) {
  const reg = S.page.reg('TORSO');
  const z0 = S.torso[0].z, z1 = S.torso[S.torso.length - 1].z;
  const zs: number[] = [];
  for (let z = z0; z < z1 - 1e-4;) {
    zs.push(z);
    const inRibs = S.ribs > 0 && z > S.ribZ[0] - 0.02 && z < S.ribZ[1] + 0.02;
    z += inRibs ? S.ribP / 3 : 0.032;
  }
  zs.push(z1);
  const n = 15;
  const rings: LoftRing[] = zs.map((z) => {
    const r = sampleRows(S.torso, z);
    const bump = (th: number) => {
      const a = ab(th);
      let k = 0;
      if (S.ribs > 0 && z > S.ribZ[0] && z < S.ribZ[1]) {
        const w = Math.cos(((z - S.ribZ[0]) / S.ribP) * Math.PI * 2);
        const fade = smooth((z - S.ribZ[0]) / 0.04) * smooth((S.ribZ[1] - z) / 0.04);
        k += S.ribs * gauss(a, 1.3, 0.42) * (w > 0 ? w : w * 0.35) * fade;
      }
      const thin = S.dog ? 0.25 : 1;
      k += gauss(a, Math.PI, 0.16) * 0.1 * thin;                                       // spine ridge
      k += gauss(z, 0.2, 0.05) * gauss(a, 2.42, 0.26) * 0.13 * thin;                    // shoulder blades
      k += gauss(z, -0.33, 0.035) * gauss(a, 2.3, 0.22) * 0.2 * thin;                   // hip bones (tuber coxae)
      k += gauss(z, -0.39, 0.03) * gauss(a, 2.75, 0.2) * 0.12 * thin;                   // pin bones
      k -= gauss(z, -0.18, 0.045) * gauss(a, 1.45, 0.5) * 0.1 * thin;                   // sunken flank
      k += gauss(z, 0.29, 0.03) * gauss(a, 0.25, 0.3) * 0.08;                           // breastbone point
      return k;
    };
    const pts = bodyRing(z, r.cy, r.rx, r.up, r.dn, n, r.sq ?? (S.dog ? 1.9 : 2.1), bump);
    // baked occlusion: belly and the creases behind the elbows are darker
    const col = (j: number) => {
      const th = (j / (n - 1)) * Math.PI * 2, a = ab(th);
      return 0.72 + 0.28 * clamp01(a / 2.2) - gauss(z, 0.16, 0.05) * gauss(a, 0.7, 0.35) * 0.18 - gauss(z, -0.25, 0.06) * gauss(a, 0.9, 0.3) * 0.15;
    };
    return { pts, v: 0.02 + 0.96 * ((z - z0) / (z1 - z0)), col };
  });
  ob.loft(rings, reg, { start: 'pole', startBulge: 0.012, end: 'pole', endBulge: 0.01 });
}

function neckGeo(ob: OB, S: Plan) {
  const reg = S.page.reg('NECK');
  const e = S.neckEnd;
  const path: V3[] = [[0, -0.03, -0.07], [0, -0.005, 0.0], [0, e[1] * 0.45, e[2] * 0.5], [0, e[1] * 0.8, e[2] * 0.86], [0, e[1], e[2]]];
  const [r0, r1] = S.neckR;
  // N starts pointing up-back (dorsal): the throat side gets a fold, the crest a ridge of vertebrae
  ob.tube(path, [[r0 * 1.35, r0 * 1.15], [r0 * 1.1, r0], [r0 * 0.95, r0 * 0.88], [r1, r1 * 0.95], [r1 * 0.9, r1 * 0.85]], 11, reg, {
    up: [0, 1, 0], th0: Math.PI, end: 'cut', cut: S.page.reg('CUT'), start: 'pole', startBulge: 0.02,
    bump: (i, th) => (S.dog ? 0 : Math.max(0, Math.cos(th)) ** 6 * 0.12 * (i > 0 && i < 4 ? 1 : 0) - Math.max(0, -Math.cos(th)) ** 4 * 0.05 * Math.sin(i * 2.1)),
    col: (i, th) => 0.85 + 0.15 * Math.cos(th),
  });
  if (S.dog) {
    // collar with a tag
    const c = S.page.reg('COLLAR');
    const cp: V3[] = [[0, -0.012, -0.02], [0, 0.0, 0.012]];
    ob.tube(cp, [[r0 * 1.17, r0 * 1.05], [r0 * 1.12, r0 * 1.0]], 11, c, { up: [0, 1, 0], th0: Math.PI, vs: [0, 1] });
    ob.push().translate(0, -0.075, 0.03).rotX(0.5);
    ob.blob([0, 0, 0], [0.012, 0.016, 0.004], 6, 3, c, { u0: 0.86, u1: 0.98, v0: 0.1, v1: 0.9 });
    ob.pop();
  }
}

/** eye bead centres in the skull frame: the grinhound's sit wrong (one forward, one high on the cranium) */
const eyePos = (S: Plan): V3[] => (S.dog ? [[0.047, 0.016, 0.05], [-0.047, 0.016, 0.05]] : [[0.045, 0.018, 0.055], [-0.05, 0.042, -0.004]]);

/** points along the mouth edge of a jaw row set (for the teeth strips) */
function mouthEdge(rows: Row[], z0: number, z1: number, side: number, upper: boolean, n: number): V3[] {
  const out: V3[] = [];
  for (let i = 0; i < n; i++) {
    const z = lerp(z0, z1, i / (n - 1));
    const r = sampleRows(rows, z);
    out.push(upper ? [side * r.rx * 0.84, r.cy - r.dn * 0.6, z] : [side * r.rx * 0.82, r.cy + r.up * 0.55, z]);
  }
  return out;
}

function headGeo(ob: OB, S: Plan) {
  const P = S.page;
  const reg = P.reg('HEAD');
  // neck stub with a cut face (shows when the head comes off; hidden inside the neck otherwise)
  ob.tube([[0, -0.012, 0.0], [0, -0.03, -0.05], [0, -0.04, -0.075]], [S.neckR[1] * 0.9, S.neckR[1] * 0.92, S.neckR[1] * 0.92], 9, P.reg('NECK'), { up: [0, 1, 0], end: 'cut', cut: P.reg('CUT'), vs: [1, 0.85, 0.75] });
  ob.push().rotZ(S.roll);
  const z0 = S.skull[0].z, z1 = S.skull[S.skull.length - 1].z;
  const n = 15;
  const rings: LoftRing[] = [];
  for (let k = 0; k <= 12; k++) {
    const z = lerp(z0, z1, k / 12);
    const r = sampleRows(S.skull, z);
    const bump = (th: number) => {
      const a = ab(th);
      let b = 0;
      b += gauss(z, 0.0, 0.022) * gauss(a, 1.45, 0.35) * 0.13;                          // cheekbones
      b += gauss(z, 0.045, 0.016) * gauss(a, 2.35, 0.28) * 0.14;                        // brow ridge
      b -= gauss(z, 0.06, 0.016) * gauss(a, 1.85, 0.25) * (S.dog ? 0.05 : 0.17);         // sunken orbits
      b += gauss(z, -0.035, 0.035) * gauss(a, Math.PI, 0.14) * (S.dog ? 0.02 : 0.12);    // sagittal crest
      b += gauss(z, -0.07, 0.015) * gauss(a, 2.6, 0.4) * 0.08;                          // occiput
      if (S.dog) b += gauss(z, 0.085, 0.03) * gauss(a, 0.9, 0.4) * 0.12;                 // jowls
      return b;
    };
    const pts = bodyRing(z, r.cy, r.rx, r.up, r.dn, n, 2.15, bump);
    rings.push({ pts, v: 0.03 + 0.94 * (k / 12), col: (j: number) => { const a = ab((j / (n - 1)) * Math.PI * 2); return 0.78 + 0.22 * clamp01(a / 2); } });
  }
  ob.loft(rings, reg, { start: 'pole', startBulge: 0.01, end: 'pole', endBulge: 0.008 });
  // nose pad
  const nz = z1 + 0.004, nr = sampleRows(S.skull, z1);
  ob.blob([0, nr.cy + nr.up * 0.25, nz], [0.019, 0.014, 0.012], 7, 4, P.reg('NOSE'));
  // upper teeth: a strip all along the mouth edge, round the front and back the other side (the grin)
  const zBack = S.dog ? 0.02 : -0.018;
  const rt = mouthEdge(S.skull, zBack, z1 - 0.012, -1, true, 7);
  const lt = mouthEdge(S.skull, z1 - 0.012, zBack, 1, true, 7);
  const gum = [...rt, ...lt];
  const tip = gum.map((p) => [p[0] * 0.95, p[1] - (S.dog ? 0.012 : 0.02), p[2]] as V3);
  ob.strip(gum, tip, P.reg('TEETH'), { double: true, v1: 1, v0: 0 });
  // eyes: grinhound pinholes sit wrong (one forward, one high on the cranium); the dog's are wide and wet
  const ep = eyePos(S);
  const eyes: [V3, number][] = S.dog ? [[ep[0], 0.013], [ep[1], 0.013]] : [[ep[0], 0.0085], [ep[1], 0.0075]];
  for (const [p, r] of eyes) ob.blob(p, [r, r * (S.dog ? 0.82 : 1), r], 6, 4, P.reg('EYE'), { emis: S.dog ? 0.25 : 0.9, rot: [0, -Math.sign(p[0]) * 0.4, 0] });
  // ears
  const E = P.reg('EAR');
  if (!S.dog) {
    // one ragged ear standing off the cranium, the other bitten down to a stub
    ob.push().translate(0.028, 0.058, -0.035).rotZ(-0.45).rotX(-0.35).rotY(1.0);
    earShell(ob, E, 0.042, 0.095, 0.014, false);
    ob.pop();
    ob.push().translate(-0.036, 0.052, -0.04).rotZ(0.55).rotX(-0.2).rotY(-1.0);
    earShell(ob, E, 0.03, 0.034, 0.01, false);
    ob.pop();
  }
  ob.pop();
}

/** an ear: a cupped double-sided shell (alpha-shaped on the page) */
function earShell(ob: OB, E: Reg, w: number, h: number, cup: number, droop: boolean) {
  const cols = 4, rows = 4;
  const grid: V3[][] = [];
  for (let r = 0; r <= rows; r++) {
    const v = r / rows;
    const row: V3[] = [];
    for (let c = 0; c <= cols; c++) {
      const u = c / cols - 0.5;
      const ww = w * (1 - v * 0.7);
      const x = u * ww * 2, y = v * h;
      const zz = -Math.cos(u * Math.PI) * cup * (1 - v * 0.5) + (droop ? -v * v * h * 0.5 : 0);
      row.push([x, droop ? -y : y, zz]);
    }
    grid.push(row);
  }
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    ob.quad([grid[r][c], grid[r][c + 1], grid[r + 1][c + 1], grid[r + 1][c]], E,
      [[c / cols, r / rows], [(c + 1) / cols, r / rows], [(c + 1) / cols, (r + 1) / rows], [c / cols, (r + 1) / rows]], { double: true });
  }
}

function jawGeo(ob: OB, S: Plan) {
  const P = S.page;
  const z0 = S.jaw[0].z, z1 = S.jaw[S.jaw.length - 1].z;
  const n = 13;
  const rings: LoftRing[] = [];
  for (let k = 0; k <= 7; k++) {
    const z = lerp(z0, z1, k / 7);
    const r = sampleRows(S.jaw, z);
    rings.push({ pts: bodyRing(z, r.cy, r.rx, r.up, r.dn, n, 2.2, (th) => gauss(z, 0.0, 0.03) * gauss(ab(th), 0.9, 0.4) * 0.1), v: 0.04 + 0.92 * (k / 7), col: (j) => 0.75 + 0.25 * clamp01(ab((j / (n - 1)) * Math.PI * 2) / 2) });
  }
  ob.loft(rings, P.reg('JAW'), { start: 'pole', end: 'pole', endBulge: 0.006 });
  const zBack = S.dog ? 0.02 : -0.01;
  const rt = mouthEdge(S.jaw, zBack, z1 - 0.008, -1, false, 6);
  const lt = mouthEdge(S.jaw, z1 - 0.008, zBack, 1, false, 6);
  const gum = [...rt, ...lt];
  const tip = gum.map((p) => [p[0] * 0.95, p[1] + (S.dog ? 0.01 : 0.016), p[2]] as V3);
  ob.strip(gum, tip, P.reg('TEETH'), { double: true, v1: 1, v0: 0 });
  // tongue
  if (S.dog) ob.blob([0, -0.004, 0.06], [0.022, 0.006, 0.05], 6, 3, P.reg('CUT'), { u0: 0.3, u1: 0.4, v0: 0.3, v1: 0.4 });
}

/** a paw: pad blob, four toes and claws (in the lower leg's frame, ground contact at `at`) */
function paw(ob: OB, S: Plan, at: V3, s: number) {
  const P = S.page, PW = P.reg('PAW'), CL = P.reg('CLAW');
  ob.blob([at[0], at[1] + 0.02 * s, at[2] + 0.012 * s], [0.026 * s, 0.022 * s, 0.034 * s], 6, 3, PW, { col: 0.9 });
  for (let i = 0; i < 4; i++) {
    const x = (i - 1.5) * 0.013 * s, z = at[2] + (0.04 - Math.abs(i - 1.5) * 0.007) * s;
    ob.blob([at[0] + x, at[1] + 0.011 * s, z], [0.0085 * s, 0.01 * s, 0.012 * s], 4, 2, PW, { col: 0.85 });
    const cl = S.dog ? 0.012 : 0.022;
    ob.cone([at[0] + x, at[1] + 0.012 * s, z + 0.008 * s], [0, -0.55, 1], 0.004 * s, cl * s, 3, CL, { flat: 0.7 });
  }
}

function frontUpperGeo(ob: OB, S: Plan, side: number) {
  const P = S.page, s = S.legR;
  const L = S.fL1;
  ob.tube([[-side * 0.03, 0.07, 0.01], [-side * 0.008, 0.03, 0.0], [0, -L * 0.45, -0.012], [0, -L * 0.85, -0.008], [0, -L - 0.012, 0.0]],
    [[0.03 * s, 0.026 * s], [0.05 * s, 0.042 * s], [0.04 * s, 0.033 * s], [0.03 * s, 0.026 * s], [0.026 * s, 0.024 * s]], 9, P.reg('FLEG_U'), {
      start: 'cut', cut: P.reg('CUT'), end: 'pole', endBulge: 0.012,
      // triceps mass behind, the point of the elbow sticking out the back
      bump: (i, th) => (i === 2 ? Math.max(0, -Math.cos(th)) * 0.18 : 0) + (i === 4 ? Math.max(0, -Math.cos(th)) ** 3 * 0.35 : 0),
      col: (i) => (i < 1 ? 0.8 : 1),
    });
}
function frontLowerGeo(ob: OB, S: Plan) {
  const P = S.page, s = S.legR;
  const L = S.fL2;
  ob.tube([[0, 0.01, 0.0], [0, -L * 0.3, 0.004], [0, -L * 0.66, 0.006], [0, -L * 0.74, 0.01], [0, -L * 0.86, 0.02], [0, -L + 0.03, 0.028]],
    [[0.027 * s, 0.025 * s], [0.024 * s, 0.021 * s], [0.017 * s, 0.016 * s], [0.021 * s, 0.019 * s], [0.016 * s, 0.016 * s], [0.018 * s, 0.017 * s]], 8, P.reg('FLEG_L'), {
      start: 'pole', startBulge: 0.01,
      bump: (i, th) => (i === 3 ? 0.12 * Math.max(0, Math.cos(th)) : 0), // wrist knuckle
      col: (i) => 0.9 + i * 0.01,
    });
  paw(ob, S, [0, -L, 0.012], s);
  // dewclaw
  ob.cone([0, -L * 0.8, -0.014 * s], [0, -0.4, -1], 0.004 * s, 0.014 * s, 4, P.reg('CLAW'));
}
function hindUpperGeo(ob: OB, S: Plan, side: number) {
  const P = S.page, s = S.legR;
  const L = S.hL1;
  ob.tube([[-side * 0.035, 0.075, -0.01], [-side * 0.01, 0.035, 0.0], [0, -L * 0.4, 0.012], [0, -L * 0.8, 0.012], [0, -L - 0.01, 0.0]],
    [[0.035 * s, 0.03 * s], [0.066 * s, 0.05 * s], [0.055 * s, 0.042 * s], [0.035 * s, 0.03 * s], [0.027 * s, 0.026 * s]], 9, P.reg('HLEG_U'), {
      start: 'cut', cut: P.reg('CUT'), end: 'pole', endBulge: 0.012,
      // hamstrings behind, kneecap in front
      bump: (i, th) => (i === 2 ? Math.max(0, -Math.cos(th)) * 0.12 : 0) + (i === 4 ? Math.max(0, Math.cos(th)) ** 3 * 0.3 : 0),
      col: (i) => (i < 1 ? 0.78 : 1),
    });
}
function hindLowerGeo(ob: OB, S: Plan) {
  const P = S.page, s = S.legR;
  const L = S.hL2;
  // tibia runs down and back to the hock, the long metatarsus comes forward to the paw
  const hock: V3 = [0, -L * 0.53, -0.085 * (L / 0.425)];
  ob.tube([[0, 0.012, 0.0], [0, -L * 0.2, -0.03], [0, -L * 0.42, -0.067], hock, [0, -L * 0.64, -0.068], [0, -L * 0.84, -0.03], [0, -L + 0.03, 0.0]],
    [[0.03 * s, 0.028 * s], [0.034 * s, 0.026 * s], [0.02 * s, 0.018 * s], [0.022 * s, 0.017 * s], [0.017 * s, 0.015 * s], [0.016 * s, 0.015 * s], [0.018 * s, 0.017 * s]], 8, P.reg('HLEG_L'), {
      start: 'pole', startBulge: 0.01,
      bump: (i, th) => (i === 1 ? Math.max(0, -Math.cos(th)) * 0.3 : 0) + (i === 3 ? Math.max(0, -Math.cos(th)) ** 2 * 0.55 : 0), // calf, point of the hock
      col: (i) => 0.88 + i * 0.015,
    });
  paw(ob, S, [0, -L, 0.004], s * 0.95);
}

function tailGeo(ob: OB, S: Plan, seg: number) {
  const P = S.page, L = S.tailL / 2, r = S.tailR;
  const r0 = seg === 0 ? r : r * 0.66, r1 = seg === 0 ? r * 0.7 : r * (S.dog ? 0.4 : 0.18);
  const path: V3[] = [[0, 0, 0.02], [0, -0.01, -L * 0.35], [0, -0.025, -L * 0.7], [0, -0.035, -L - 0.01]];
  ob.tube(path, [r0 * 1.05, lerp(r0, r1, 0.35), lerp(r0, r1, 0.7), r1], 7, P.reg('TAIL'), {
    vs: seg === 0 ? [1, 0.84, 0.68, 0.52] : [0.52, 0.36, 0.2, 0.04],
    start: seg === 0 ? 'cut' : 'pole', cut: P.reg('CUT'), end: 'pole', endBulge: seg === 0 ? 0.01 : 0.02,
  });
}

/** droopy ear (lost dog): a flap hanging down the side of the head, its own part so it can flop */
function dogEarGeo(ob: OB, S: Plan, side: number) {
  const E = S.page.reg('EAR');
  const w = 0.042, h = 0.088, cup = 0.012, cols = 4, rows = 4;
  const grid: V3[][] = [];
  for (let r = 0; r <= rows; r++) {
    const v = r / rows, row: V3[] = [];
    for (let c = 0; c <= cols; c++) {
      const u = c / cols - 0.5;
      row.push([side * (cup * Math.cos(u * Math.PI) * (1 - v * 0.4) + v * v * 0.012), -v * h, u * w * 2 * (1 - v * 0.2) - v * 0.012]);
    }
    grid.push(row);
  }
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    ob.quad([grid[r][c], grid[r][c + 1], grid[r + 1][c + 1], grid[r + 1][c]], E,
      [[c / cols, 1 - r / rows], [(c + 1) / cols, 1 - r / rows], [(c + 1) / cols, 1 - (r + 1) / rows], [c / cols, 1 - (r + 1) / rows]], { double: true });
  }
}

function buildHound(S: Plan): Rig {
  const P = S.page;
  const rig = newRig(S.torsoY + 0.2);
  const torso = bpart(rig, 'torso', rig.body, [0, S.torsoY, 0], P, 'torso', (ob) => {
    torsoGeo(ob, S);
    if (!S.dog) {
      // hackles: a ridge of coarse bristles standing along the spine from the withers to mid-back
      const F = P.reg('FUR');
      for (let k = 0; k < 7; k++) {
        const z = 0.25 - k * 0.055, r = sampleRows(S.torso, z);
        const hgt = 0.03 + Math.sin((k / 6) * Math.PI) * 0.025;
        ob.push().translate(0, r.cy + r.up * 0.94, z).rotX(-0.55).rotZ((k % 2 ? 1 : -1) * 0.12);
        ob.quad([[0, 0, -0.035], [0, 0, 0.035], [0, hgt, 0.035], [0, hgt, -0.035]], F, [[0, 0], [1, 0], [1, 1], [0, 1]], { double: true });
        ob.pop();
      }
    }
  });
  const neck = bpart(rig, 'neck', torso, S.neckAt, P, 'neck', (ob) => neckGeo(ob, S));
  const head = bpart(rig, 'head', neck, S.neckEnd, P, 'head', (ob) => headGeo(ob, S));
  const jaw = bpart(rig, 'jaw', head, S.roll ? [-S.hinge[1], S.hinge[0], S.hinge[2]] : S.hinge, P, 'jaw', (ob) => jawGeo(ob, S));
  jaw.rotation.order = 'ZYX';
  jaw.rotation.z = S.roll;
  if (S.dog) {
    for (const [nm, x] of [['earL', 1], ['earR', -1]] as const) {
      const e = bpart(rig, nm, head, [x * 0.058, 0.052, -0.028], P, 'ear' + x, (ob) => dogEarGeo(ob, S, x));
      e.rotation.set(0.1, 0, x * 0.3);
    }
  }
  const legs: [string, number, V3, boolean][] = [['0', 1, S.shoulder, true], ['1', -1, S.shoulder, true], ['2', 1, S.hip, false], ['3', -1, S.hip, false]];
  for (const [i, sd, at, front] of legs) {
    const up = bpart(rig, 'leg' + i, torso, [at[0] * sd, at[1], at[2]], P, (front ? 'fUp' : 'hUp') + sd, (ob) => (front ? frontUpperGeo(ob, S, sd) : hindUpperGeo(ob, S, sd)));
    bpart(rig, 'shin' + i, up, [0, -(front ? S.fL1 : S.hL1), 0], P, front ? 'fLo' : 'hLo', (ob) => (front ? frontLowerGeo(ob, S) : hindLowerGeo(ob, S)));
  }
  const tail = bpart(rig, 'tail', torso, S.tailAt, P, 'tail0', (ob) => tailGeo(ob, S, 0));
  bpart(rig, 'tail2', tail, [0, -0.035, -S.tailL / 2], P, 'tail1', (ob) => tailGeo(ob, S, 1));
  rig.headY = S.torsoY + 0.25;
  restPose(rig, S);
  return rig;
}

/** standing pose without a creature (gallery / hallucinations): legs solved onto the floor */
function restPose(rig: Rig, S: Plan) {
  const gs = gaitState({});
  poseLegs(rig, legSpecs(S, WALK_PH), gs, GAITS.walk, 0, 0.016, { freeze: true });
  rig.parts.neck.rotation.x = S.dog ? -0.05 : 0.42;
  rig.parts.tail.rotation.x = S.dog ? -0.5 : 0.35;
  rig.parts.tail2.rotation.x = 0.25;
}

// =====================================================================================
// animation
// =====================================================================================
// gait phase offsets per leg: 0 FL, 1 FR, 2 HL, 3 HR
const WALK_PH = [0.25, 0.75, 0.0, 0.5];
const TROT_PH = [0.0, 0.5, 0.5, 0.0];
const GALLOP_PH = [0.52, 0.62, 0.0, 0.1];
const GAITS: Record<string, GaitParams> = {
  walk: { duty: 0.62, f0: 1.0, fk: 0.55, maxStride: 0.5, lift: 0.07 },
  trot: { duty: 0.5, f0: 1.6, fk: 0.35, maxStride: 0.7, lift: 0.09 },
  gallop: { duty: 0.38, f0: 2.2, fk: 0.2, maxStride: 1.25, lift: 0.15 },
};
function legSpecs(S: Plan, ph: number[]): LegSpec[] {
  return [0, 1, 2, 3].map((i) => {
    const front = i < 2;
    return { up: 'leg' + i, lo: 'shin' + i, L1: front ? S.fL1 : S.hL1, L2: front ? S.fL2 : S.hL2, bend: front ? -1 : 1, ph: ph[i], restX: 0.012, restZ: front ? 0.03 : -0.02, front, side: (i % 2 === 0 ? 1 : -1) as 1 | -1 };
  });
}
const _look = [0, 0];
const _lame = [false, false, false, false];

function animateHound(S: Plan) {
  return (rig: Rig, c: Creature, t: number, dt: number) => {
    const P = rig.parts;
    const m = animMem(rig, c);
    tickEvents(m, c, dt);
    applyLook(rig, c, S.page, S.dog ? 0.04 : 0.07);
    const gs = gaitState(rig.root.userData);
    trackMotion(gs, c, dt);
    const seed = hash01(c.id, 1);
    const st = c.state;
    const tame = !!c.tamedBy;
    const spd = gs.spd;
    // ---------------- gait selection (hysteresis) and phase offsets
    const gaitKey: string = m.gait ?? 'walk';
    let gk = gaitKey;
    if (gk === 'walk' && spd > 2.6) gk = 'gallop';
    else if (gk === 'gallop' && spd < 2.0) gk = spd > 1.3 ? 'trot' : 'walk';
    else if (gk === 'walk' && spd > 1.5 && spd <= 2.6) gk = 'trot';
    else if (gk === 'trot' && spd < 1.1) gk = 'walk';
    else if (gk === 'trot' && spd > 3.0) gk = 'gallop';
    m.gait = gk;
    const tgtPh = gk === 'gallop' ? GALLOP_PH : gk === 'trot' ? TROT_PH : WALK_PH;
    const legs: LegSpec[] = m.legs || (m.legs = legSpecs(S, WALK_PH));
    for (let i = 0; i < 4; i++) {
      let d = tgtPh[i] - legs[i].ph; d -= Math.round(d);
      legs[i].ph = (legs[i].ph + d * damp(6, dt) + 1) % 1;
    }
    // missing legs (gore / limb loss): tuck the stump, favour the rest
    let lameN = 0, lameSide = 0, lameFront = 0;
    for (let i = 0; i < 4; i++) {
      _lame[i] = partGone(rig, c, 'leg' + i) || partGone(rig, c, 'shin' + i);
      if (_lame[i]) { lameN++; lameSide += legs[i].side; lameFront += i < 2 ? 1 : -1; }
    }
    // ---------------- posture by state
    const stalk = st === 'stalk' ? 1 : 0;
    const warn = st === 'warn' ? 1 : 0;
    const flee = st === 'flee' ? 1 : 0;
    const sniff = st === 'investigate' || (st === 'idle' && Math.sin(t * 0.37 + seed * 9) > 0.55) ? 1 : 0;
    const sleep = st === 'sleep' ? 1 : 0;
    const eat = st === 'eat' ? 1 : 0;
    const dead = c.dead;
    m.crouch = lerp(m.crouch ?? 0, dead ? 0 : (stalk * 0.11 + warn * 0.07 + flee * 0.03 + (lameN >= 3 ? 0.4 : lameN >= 2 ? 0.15 : lameN ? 0.03 : 0)), damp(4, dt));
    m.sleep = lerp(m.sleep ?? 0, sleep, damp(1.5, dt));
    const run = gk === 'gallop' ? 1 : 0;
    m.run = lerp(m.run ?? 0, run, damp(5, dt));
    // ---------------- attack timeline: wind up, lunge, snap, shake, recover
    const at = m.atk;
    let lunge = 0, rear = 0, jawA = 0, shake = 0;
    if (at < 0.95) {
      if (at < 0.16) { const k = smooth(at / 0.16); rear = k; jawA = k * 0.7; }
      else if (at < 0.34) { const k = smooth((at - 0.16) / 0.18); rear = 1 - k; lunge = k; jawA = 0.75 + k * 0.25; }
      else if (at < 0.42) { const k = (at - 0.34) / 0.08; lunge = 1; jawA = 1 - k; }
      else { const k = smooth((at - 0.42) / 0.53); lunge = 1 - k; jawA = 0; shake = (1 - k) * Math.sin(at * 46); }
    }
    // ---------------- body
    const body = rig.body, torso = P.torso;
    const gaitPh = gs.ph * Math.PI * 2;
    const w = gs.w;
    const bob = (Math.cos(gaitPh * 2) * (run ? 0.012 : 0.008) + (run ? Math.sin(gaitPh) * 0.02 : 0)) * w;
    const breath = Math.sin(t * (st === 'chase' || st === 'flee' || warn ? 5.2 : sleep ? 1.4 : 2.3) + seed * 6);
    const fl = m.flinch / 0.35;
    body.position.set(Math.sin(t * 60) * 0.012 * fl * fl, bob - m.crouch * 0.8 - rear * 0.07 + lunge * 0.06, lunge * 0.22 - rear * 0.06 - fl * 0.05);
    body.rotation.set(0, fl * 0.15 * m.flinchDir, 0);
    torso.position.y = S.torsoY;
    // spine pitch: gallop rock, crouch nose-down, rear on the wind-up
    let pitch = (run ? Math.sin(gaitPh + 0.6) * 0.09 : Math.sin(gaitPh * 2) * 0.015) * w + stalk * 0.08 + warn * 0.06 - rear * 0.16 + lunge * 0.1;
    let roll = Math.sin(gaitPh) * 0.035 * w * (1 - m.run * 0.6);
    if (lameN) { roll += lameSide * 0.12; pitch += lameFront * 0.08; }
    torso.rotation.set(pitch, Math.sin(gaitPh) * 0.04 * w, roll);
    const tm = meshOf(torso);
    if (tm) { const b = breath * (sleep ? 0.03 : 0.018); tm.scale.set(1 + b, 1 + b * 0.8, 1); }
    // ---------------- legs
    if (dead) {
      // collapse: legs go slack, front pair folds, hind pair splays
      const k = smooth(m.dead / 0.6);
      for (let i = 0; i < 4; i++) {
        const up = P['leg' + i], lo = P['shin' + i];
        up.rotation.set(lerp(up.rotation.x, i < 2 ? -0.55 : 0.75, k), 0, lerp(up.rotation.z, (i % 2 ? -1 : 1) * 0.15, k));
        lo.rotation.set(lerp(lo.rotation.x, i < 2 ? 0.35 : -0.6, k), 0, 0);
      }
    } else if (m.sleep > 0.02) {
      const k = m.sleep;
      body.position.y -= k * (S.torsoY - 0.17);
      if (k < 0.98) poseLegs(rig, legs, gs, GAITS[gk], spd, dt, { lame: _lame });
      for (let i = 0; i < 4; i++) {
        const up = P['leg' + i], lo = P['shin' + i];
        // folded under the chest / curled hind legs
        up.rotation.set(lerp(up.rotation.x, i < 2 ? -1.35 : -1.1, k), 0, lerp(0, (i % 2 ? -1 : 1) * 0.25, k));
        lo.rotation.set(lerp(lo.rotation.x, i < 2 ? 1.5 : 2.2, k), 0, 0);
      }
    } else {
      const gp = GAITS[gk];
      poseLegs(rig, legs, gs, gp, spd, dt, { lame: _lame, liftMul: stalk ? 1.6 : lameN ? 1.3 : 1 });
      // the lunge throws the front legs forward
      if (lunge > 0.01) { for (const i of [0, 1]) { P['leg' + i].rotation.x -= lunge * 0.7; P['shin' + i].rotation.x += lunge * 0.3; } }
    }
    // ---------------- neck and head
    const neck = P.neck, head = P.head, jaw = P.jaw;
    const tracking = lookAtTarget(rig, c, (G as any)?.players, _look) && (st === 'chase' || st === 'warn' || st === 'stalk' || st === 'curious' || st === 'follow' || st === 'attack' || tame);
    const lookYaw = tracking ? clamp(_look[0], -1.3, 1.3) : 0;
    m.look = lerp(m.look, lookYaw, damp(tracking ? 7 : 3, dt));
    // grinhounds twitch: the head snaps to new angles instead of easing
    let snapYaw = 0, snapRoll = 0;
    if (!S.dog && (st === 'idle' || st === 'warn' || st === 'wander' && spd < 0.3)) {
      const tw = Math.floor(t * (warn ? 3.1 : 1.6) + seed * 7);
      const h1 = hash01(c.id, tw), h2 = hash01(c.id, tw + 77);
      snapYaw = (h1 - 0.5) * (warn ? 0.7 : 1.3);
      snapRoll = h2 < 0.3 ? (h2 - 0.15) * 2.4 : 0;
    }
    const sniffBob = sniff ? (Math.sin(t * 17) * 0.5 + 0.5) * 0.08 * (Math.sin(t * 2.3 + seed * 4) > -0.2 ? 1 : 0) : 0;
    const neckDown = sniff * 0.85 + stalk * 0.45 + warn * 0.35 + flee * 0.2 + eat * 1.05 + m.run * 0.3 + m.sleep * 0.5 + lunge * -0.25 + rear * 0.15;
    neck.rotation.set((S.dog ? -0.05 : 0.42) + neckDown - pitch * 0.8 - bob * 2, m.look * 0.55 + snapYaw * 0.4 + shake * 0.15, 0);
    const headPitch = sniff * 0.35 + stalk * 0.2 - warn * 0.1 + eat * 0.3 + sniffBob - lunge * 0.25 + (dead ? 0.3 : 0);
    head.rotation.set(headPitch, m.look * 0.45 + snapYaw * 0.6 + shake * 0.35, snapRoll + (S.dog && tame ? Math.sin(t * 1.3) * 0.18 : 0) + (S.dog && st === 'curious' ? 0.35 : 0));
    // the jaw: grinhound chatters when it "laughs" (warn / chase calls), pants when running
    let open = jawA * 0.85;
    if (!dead) {
      if (warn) open = Math.max(open, 0.18 + Math.max(0, Math.sin(t * 22)) * 0.22);
      else if (run || st === 'chase') open = Math.max(open, 0.25 + Math.sin(t * 9) * 0.06);
      else if (S.dog && (tame || st === 'follow' || st === 'curious')) open = Math.max(open, 0.22 + Math.sin(t * 7) * 0.04); // panting smile
      else if (eat) open = Math.max(open, Math.max(0, Math.sin(t * 6)) * 0.4);
      else if (sleep) open = 0;
      else open = Math.max(open, 0.03 + (S.dog ? 0.08 : 0.06) * (Math.sin(t * 0.7 + seed * 3) * 0.5 + 0.5));
    } else open = 0.45;
    jaw.rotation.x = open;
    // ears (lost dog): flop with the gait and perk up when curious
    if (S.dog) {
      const perk = st === 'curious' || st === 'warn' || tame ? 1 : 0;
      for (const [nm, sd] of [['earL', 1], ['earR', -1]] as const) {
        const e = P[nm]; if (!e) continue;
        const flop = Math.sin(gaitPh * 2 + sd) * 0.25 * w + Math.sin(t * 3 + sd) * 0.05;
        e.rotation.set(0.1 - perk * 0.2 + flop * 0.7 + m.run * 0.5, 0, sd * (0.12 + perk * 0.22 + Math.abs(flop) * 0.25) + (fl ? sd * 0.4 * fl : 0));
      }
    }
    // ---------------- tail
    const tail = P.tail, tail2 = P.tail2;
    let tUp = S.dog ? -0.5 : 0.35, tSw = 0, tF = 2.2;
    if (tame || (S.dog && (st === 'follow' || st === 'curious'))) { tUp = S.dog ? -0.75 : 0; tSw = 0.75; tF = 13; }
    else if (flee) { tUp = 1.25; tSw = 0.1; tF = 6; }
    else if (stalk) { tUp = 0.55; tSw = 0.04; tF = 1.2; }
    else if (warn) { tUp = S.dog ? -0.9 : -0.25; tSw = 0.05; tF = 14; }
    else if (st === 'chase' || run) { tUp = S.dog ? -0.2 : 0.05; tSw = 0.12; tF = 3; }
    else if (sleep) { tUp = 1.0; tSw = 0; }
    else tSw = 0.18;
    if (dead) { tUp = 0.9; tSw = 0; }
    m.tUp = lerp(m.tUp ?? tUp, tUp, damp(4, dt));
    const sw = Math.sin(t * tF + seed * 5) * tSw;
    tail.rotation.set(m.tUp + Math.sin(gaitPh * 2) * 0.08 * w, sw + Math.sin(gaitPh) * 0.12 * w, 0);
    m.tLag = lerp(m.tLag ?? 0, sw, damp(9, dt));
    tail2.rotation.set(0.15 + (dead ? 0.3 : 0) + Math.sin(gaitPh * 2 - 0.8) * 0.12 * w, (sw - m.tLag) * 1.6 + sw * 0.4, 0);
    void wrapA;
  };
}

// =====================================================================================
// painting
// =====================================================================================
interface Pal { skin: number; fur: number; fur2: number; belly: number; pig: number; mange: number; sores: number; scars: number; blood: number; dirt: number }
const HOUND_PALS: Pal[] = [
  { skin: 0xb8a6a0, fur: 0x2a201e, fur2: 0x443630, belly: 0x86706e, pig: 0x5a4644, mange: 0.55, sores: 6, scars: 2, blood: 0.8, dirt: 0.5 },
  { skin: 0xb4aa8c, fur: 0x342a20, fur2: 0x524430, belly: 0x88785e, pig: 0x5e5236, mange: 0.45, sores: 4, scars: 3, blood: 0.6, dirt: 0.7 },
  { skin: 0xa69ea8, fur: 0x1e1a1e, fur2: 0x322a30, belly: 0x76686e, pig: 0x463a44, mange: 0.62, sores: 7, scars: 1, blood: 1, dirt: 0.4 },
  { skin: 0xc0a090, fur: 0x443024, fur2: 0x5e4836, belly: 0x94746a, pig: 0x664438, mange: 0.35, sores: 5, scars: 4, blood: 0.7, dirt: 0.6 },
];
const DOG_PALS: Pal[] = [
  { skin: 0x6e4a2e, fur: 0x5a3a22, fur2: 0x8a6440, belly: 0xc6a47c, pig: 0x3a2414, mange: 0, sores: 0, scars: 1, blood: 0.15, dirt: 0.5 },
  { skin: 0x2e2622, fur: 0x221c1a, fur2: 0x3a302a, belly: 0xa06a3a, pig: 0x141010, mange: 0, sores: 0, scars: 0, blood: 0.15, dirt: 0.4 },
  { skin: 0xa88c62, fur: 0x9a7a50, fur2: 0xc4a87a, belly: 0xe2d0aa, pig: 0x6a4e30, mange: 0, sores: 0, scars: 1, blood: 0.1, dirt: 0.6 },
];

const MOUTH = 0x2e0c0e, GUM = 0x9a4248, GUM_D = 0x5a1a1e, BLOOD = 0x6a0e10, BLOOD_D = 0x3a0606, BLOOD_W = 0x9a2222;

function paintHound(Pt: Painter, v: number, dog: boolean) {
  const pal = (dog ? DOG_PALS : HOUND_PALS)[v % (dog ? DOG_PALS.length : HOUND_PALS.length)];
  const S = dog ? DOG_PLAN : HOUND_PLAN;
  const rng = Pt.rng;
  const SK = ramp(pal.skin, 14, 0x161118, 0.5);
  const FR = ramp(pal.fur, 12, 0x0c0808, 0.45);
  const FR2 = ramp(pal.fur2, 12, 0x120c0a, 0.5);
  const BL = ramp(pal.belly, 12, 0x2a1e18, 0.5);
  const SKM = 7, FRM = 6;
  const sore = (r: Reg, x: number, y: number, s: number) => {
    Pt.spot(r, x, y, s + 1.3, s + 0.9, 0xa84e4a, 0.5);
    Pt.spot(r, x, y, s * 0.8, s * 0.6, 0x6a1a16, 1, true);
    Pt.set(r, x, y, 0x8a2018); Pt.set(r, x + 1, y, rng.chance(0.5) ? 0xa89048 : 0x8a2418);
    Pt.set(r, x - 1, y - 1, 0xe8c8c0);
  };
  const scar = (r: Reg, x: number, y: number, L: number, dx: number, dy: number) => {
    for (let k = 0; k < L; k++) {
      const px = x + dx * k, py = y + dy * k;
      Pt.set(r, px, py, mixHex(SK[11], 0xe0c4bc, 0.4)); Pt.blend(r, px, py + 1, SK[3], 0.7);
      if (!dog && k % 3 === 1) { Pt.set(r, px, py - 1, SK[3]); Pt.set(r, px, py + 2, SK[3]); }
    }
  };
  const dirt = (r: Reg, amt: (x: number, y: number) => number, col = 0x2e2418) => {
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) { const d = amt(x, y) + (Pt.n(r, x, y, 3, 2, 13) - 0.5) * 0.5; if (d > 0.3) Pt.blend(r, x, y, col, clamp01((d - 0.3) * 1.6) * 0.75); }
  };

  // ================= torso
  {
    const r = Pt.R('TORSO');
    const z0 = S.torso[0].z, z1 = S.torso[S.torso.length - 1].z;
    const zOf = (y: number) => z0 + (1 - (y + 0.5) / r.h - 0.02) / 0.96 * (z1 - z0);
    const yOf = (z: number) => (1 - (0.02 + 0.96 * (z - z0) / (z1 - z0))) * r.h;
    const aOf = (x: number) => ab(((x + 0.5) / r.w) * Math.PI * 2);
    if (!dog) {
      const L = fillLv(Pt, r, SK, (u, vv, x, y) => {
        const a = aOf(x), z = zOf(y);
        let l = SKM + (a / Math.PI - 0.55) * 2.4 + (Pt.n(r, x, y, 3, 2, 1) - 0.5) * 1.1;
        if (z > S.ribZ[0] && z < S.ribZ[1]) {
          const wv = Math.cos(((z - S.ribZ[0]) / S.ribP) * Math.PI * 2);
          l += (wv > 0 ? wv * 1.2 : wv * 2.6) * gauss(a, 1.3, 0.45);
        }
        l += gauss(z, 0.2, 0.045) * gauss(a, 2.42, 0.24) * 2.2 - gauss(z, 0.14, 0.03) * gauss(a, 2.3, 0.3) * 1.2; // scapula + its shadow
        l += gauss(z, -0.33, 0.028) * gauss(a, 2.3, 0.2) * 2.8 - gauss(z, -0.29, 0.03) * gauss(a, 2.1, 0.3) * 1.2; // hip points
        l -= gauss(z, -0.18, 0.05) * gauss(a, 1.45, 0.5) * 1.6;
        l -= gauss(z, 0.14, 0.05) * gauss(a, 0.65, 0.3) * 1.8;
        l += gauss(a, Math.PI, 0.12) * 1.2;
        return l;
      });
      // pigment blotches (grey-brown, like a hairless dog's spots)
      for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
        const f = Pt.n(r, x, y, 3, 2, 5);
        if (f > 0.6) Pt.blend(r, x, y, pal.pig, clamp01((f - 0.6) * 6) * 0.55);
      }
      // vertebrae knobs down the spine: lit bump, dark gap
      for (let z = -0.39; z < 0.33; z += 0.03) {
        const y = Math.round(yOf(z)), xm = Math.floor(r.w / 2);
        for (const dx of [-1, 0]) { Pt.set(r, xm + dx, y, SK[12]); Pt.set(r, xm + dx, y - 1, SK[10]); Pt.set(r, xm + dx, y + 1, SK[4]); }
      }
      // mange: clusters of coarse dark hair over the back, shoulders and haunches (dark core, lighter rim, stray hairs)
      const mm = (x: number, y: number) => Pt.n(r, x, y, 2, 2, 9) * 0.8 + Pt.n(r, x, y, 4, 1, 19) * 0.2 + Math.cos(aOf(x) - Math.PI) * 0.1 - (1 - pal.mange) * 0.3 - 0.11;
      fillLv(Pt, r, FR, (u, vv, x, y) => FRM - 1.5 + clamp01((mm(x, y) - 0.56) * 6) * -1 + (mm(x, y) < 0.6 ? 1.2 : 0), 0.15, (u, vv, x, y) => mm(x, y) > 0.56);
      Pt.strokes(r, FR, () => FRM - 0.5, { density: 0.2, flow: (x) => [((x + 0.5) / r.w < 0.5 ? -0.35 : 0.35), 1], len: [2, 3], dark: 1, light: 0.8, lightP: 0.3, mask: (x, y) => mm(x, y) > 0.5 && mm(x, y) < 0.6, salt: 1 });
      void L;
      for (let i = 0; i < pal.sores; i++) sore(r, rng.int(0, r.w - 1), rng.int(6, r.h - 6), rng.float(1.2, 2.2));
      for (let i = 0; i < 8; i++) {
        const sd = rng.chance(0.5) ? 1 : -1;
        Pt.walk(r, Math.round(uOf(rng.float(0.3, 1.5), sd) * r.w), rng.int(4, r.h - 4), rng.int(8, 18), rng.float(-1, 1), rng.float(-0.6, 0.6), 0x4e4668, 0.32, 0.7, 0.15);
      }
      for (let i = 0; i < 9; i++) Pt.glint(r, r.w / 2 + rng.int(-10, 10), rng.int(2, r.h - 3), rng.int(1, 2), 0xf8f0e8, 0.4);
    } else {
      // the lost dog's coat: darker saddle, pale chest and belly, strokes back and down
      const coat = (x: number, y: number) => {
        const a = aOf(x);
        const belly = a < 1.0 + (Pt.n(r, x, y, 3, 2, 4) - 0.5) * 0.6;
        return { belly, l: belly ? FRM + 0.5 + a * 0.6 : FRM + (a / Math.PI) * 1.2 - gauss(a, Math.PI, 0.55) * (v === 1 ? 2.4 : 1.2) + (Pt.n(r, x, y, 2, 2, 6) - 0.5) * 0.5 };
      };
      const L = new Lv(r);
      for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
        const c = coat(x, y); L.f[y * r.w + x] = c.l;
        Pt.put(r, x, y, c.belly ? BL : (v === 1 ? FR : FR2), c.l, 0.2);
      }
      const flow = (x: number): [number, number] => [((x + 0.5) / r.w < 0.5 ? -0.45 : 0.45), 1];
      Pt.strokes(r, FR2, L.get, { density: 0.22, flow, len: [3, 5], dark: 1.1, light: 0.8, mask: (x, y) => !coat(x, y).belly && v !== 1, salt: 2 });
      Pt.strokes(r, FR, L.get, { density: 0.22, flow, len: [3, 5], dark: 1.1, light: 0.8, mask: (x, y) => !coat(x, y).belly && v === 1, salt: 3 });
      Pt.strokes(r, BL, L.get, { density: 0.3, flow, len: [2, 4], dark: 1.4, light: 1.0, mask: (x, y) => coat(x, y).belly, salt: 4 });
      // matted clumps and burrs
      for (let i = 0; i < 8; i++) { const x = rng.int(0, r.w - 1), y = rng.int(2, r.h - 3); Pt.spot(r, x, y, 1.3, 1, scaleHex(pal.fur, 0.6), 0.8, true); Pt.set(r, x, y - 1, scaleHex(pal.fur2, 1.1)); }
    }
    for (let i = 0; i < pal.scars; i++) scar(r, rng.int(0, r.w - 1), rng.int(6, r.h - 8), rng.int(6, 11), rng.float(0.7, 1), rng.float(-0.5, 0.5));
    dirt(r, (x) => (1 - aOf(x) / 1.3) * pal.dirt);
    for (let i = 0; i < Math.round(pal.blood * 7); i++) {
      const sd = rng.chance(0.5) ? 1 : -1;
      Pt.walk(r, Math.round(uOf(rng.float(0.1, 0.9), sd) * r.w), rng.int(1, 7), rng.int(4, 10), sd > 0 ? -1 : 1, 0.6, rng.chance(0.4) ? BLOOD_W : BLOOD, 0.8, 0.3);
    }
  }

  // ================= neck
  {
    const r = Pt.R('NECK');
    const cth = (x: number) => -Math.cos(((x + 0.5) / r.w) * Math.PI * 2); // +1 crest, -1 throat
    if (!dog) {
      fillLv(Pt, r, SK, (u, vv, x, y) => SKM + cth(x) * 1.3 + (Pt.n(r, x, y, 3, 2, 21) - 0.5) * 1.1 - (1 - vv) * 0.5);
      // throat folds and the trachea rings
      for (let y = 2; y < r.h - 1; y += 3) for (let x = 0; x < r.w; x++) { const c = cth(x); if (c < -0.3) { Pt.set(r, x, y, SK[4]); Pt.blend(r, x, y - 1, SK[10], 0.5); } }
      const mm = (x: number, y: number) => Pt.n(r, x, y, 2, 1, 23) + cth(x) * 0.3 - (1 - pal.mange) * 0.5;
      fillLv(Pt, r, FR, (u, vv, x, y) => FRM - 1.5 + (mm(x, y) < 0.56 ? 1.2 : 0), 0.15, (u, vv, x, y) => mm(x, y) > 0.52);
      Pt.strokes(r, FR, () => FRM - 0.5, { density: 0.2, flow: () => [0, 1], dark: 1, light: 0.8, mask: (x, y) => mm(x, y) > 0.47 && mm(x, y) < 0.56, salt: 5 });
      for (let i = 0; i < 4; i++) Pt.walk(r, r.w / 2 + rng.int(-6, 6), 0, rng.int(6, 14), 0, 1, rng.chance(0.5) ? BLOOD : BLOOD_D, 0.75, 0.4);
    } else {
      const L = fillLv(Pt, r, FR2, (u, vv, x, y) => FRM + cth(x) * 0.9 + (Pt.n(r, x, y, 3, 2, 22) - 0.5) * 1.2);
      for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) if (cth(x) < -0.2) { L.f[y * r.w + x] = FRM + 1; Pt.put(r, x, y, BL, FRM + 1 + cth(x), 0.2); }
      Pt.strokes(r, v === 1 ? FR : FR2, L.get, { density: 0.4, flow: () => [0, 1], len: [3, 5], dark: 1.6, light: 1.2, mask: (x) => cth(x) >= -0.2, salt: 6 });
      Pt.strokes(r, BL, L.get, { density: 0.35, flow: () => [0, 1], len: [2, 4], dark: 1.3, light: 1.0, mask: (x) => cth(x) < -0.2, salt: 7 });
    }
  }

  // ================= head (skull loft: u 0 = mouth / palate side, 0.5 = crown; v 0 back .. 1 nose)
  {
    const r = Pt.R('HEAD');
    const z0 = S.skull[0].z, z1 = S.skull[S.skull.length - 1].z;
    const zOf = (y: number) => z0 + ((1 - (y + 0.5) / r.h) - 0.03) / 0.94 * (z1 - z0);
    const yOf = (z: number) => (1 - (0.03 + 0.94 * (z - z0) / (z1 - z0))) * r.h;
    const aOf = (x: number) => ab(((x + 0.5) / r.w) * Math.PI * 2);
    const base = (x: number, y: number) => {
      const a = aOf(x), z = zOf(y);
      let l = (a / Math.PI - 0.5) * 2 + (Pt.n(r, x, y, 3, 2, 41) - 0.5) * 1.0;
      l += gauss(z, 0.0, 0.02) * gauss(a, 1.45, 0.35) * 1.8;
      l -= gauss(z, 0.06, 0.016) * gauss(a, 1.85, 0.25) * 2.6;
      l += gauss(z, 0.045, 0.014) * gauss(a, 2.35, 0.3) * 1.5;
      l -= clamp01((z - 0.15) / 0.06) * 1.0;
      return l;
    };
    if (!dog) {
      fillLv(Pt, r, SK, (u, vv, x, y) => SKM + base(x, y));
      for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) { const f = Pt.n(r, x, y, 2, 2, 45); if (f > 0.62) Pt.blend(r, x, y, pal.pig, 0.45); }
      // sparse hair on the cranium
      // a few coarse hairs on the cranium
      const hm = (x: number, y: number) => zOf(y) < 0.0 && aOf(x) > 2.2 && Pt.n(r, x, y, 2, 1, 43) > 0.55;
      Pt.strokes(r, FR, () => FRM, { density: 0.25, flow: () => [0, 1], len: [2, 3], dark: 1, light: 0.5, mask: hm, salt: 8 });
      // snarl: deep folds above the peeled-back lips
      for (const sd of [1, -1]) for (let k = 0; k < 5; k++) {
        const z = 0.04 + k * 0.03, y = Math.round(yOf(z));
        for (let a = 0.72; a < 1.55; a += 0.06) { const x = uOf(a, sd) * r.w, yy = y + Math.round(Math.sin(a * 5 + k) * 0.8); Pt.set(r, x, yy, SK[3]); Pt.blend(r, x, yy - 1, SK[11], 0.5); }
      }
    } else {
      const L = new Lv(r);
      for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
        const a = aOf(x), z = zOf(y);
        const muzzle = z > 0.065 + (Pt.n(r, x, y, 2, 2, 46) - 0.5) * 0.02;
        const l = FRM + base(x, y) * 0.8 + (muzzle ? 0.6 : 0);
        L.f[y * r.w + x] = l;
        const R = v === 1 ? (muzzle || a < 1.6 ? BL : FR) : v === 0 ? (muzzle ? BL : FR2) : (muzzle ? BL : FR2);
        Pt.put(r, x, y, R, l, 0.2);
      }
      Pt.strokes(r, v === 1 ? FR : FR2, L.get, { density: 0.35, flow: () => [0, 1], len: [2, 3], dark: 1.5, light: 1.1, mask: (x, y) => zOf(y) < 0.06, salt: 9 });
      if (v === 1) for (const sd of [1, -1]) Pt.spot(r, uOf(2.2, sd) * r.w, yOf(0.04), 1.8, 1.3, 0xa06e3e, 1, true);
      if (v !== 1) for (let y = 0; y < r.h; y++) { const z = zOf(y); if (z > 0.05) continue; const x = Math.floor(r.w / 2); Pt.set(r, x, y, BL[8]); Pt.set(r, x - 1, y, BL[7]); }
    }
    // palate / mouth interior on the underside, the lip line along the mouth edge
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
      const a = aOf(x), z = zOf(y);
      if (z < (dog ? 0.02 : -0.02)) continue;
      if (a < 0.5) Pt.set(r, x, y, (y % 3 === 0) ? mixHex(MOUTH, GUM, 0.4) : MOUTH);
      else if (a < 0.68) Pt.set(r, x, y, dog ? scaleHex(pal.fur, 0.35) : (a < 0.6 ? GUM_D : mixHex(GUM_D, SK[4], 0.5)));
    }
    // eye sockets (dark rings where the eye beads sit)
    for (const [ex, ey, z] of eyePos(S)) {
      const row = sampleRows(S.skull, z);
      const a = Math.atan2(Math.min(1, Math.abs(ex) / row.rx), -(ey - row.cy) / (ey > row.cy ? row.up : row.dn));
      const x = uOf(a, Math.sign(ex)) * r.w, y = yOf(z);
      Pt.spot(r, x, y, dog ? 2.6 : 2.2, dog ? 2 : 1.7, dog ? scaleHex(pal.fur, 0.3) : 0x1a0e0e, 1, true);
      if (!dog) { Pt.spot(r, x + 1, y + 1, 2.4, 1.6, 0x5a2a2a, 0.45); Pt.walk(r, x + 1, y + 2, 4, 0.2, 1, 0x5a1010, 0.6, 0.2); } // weeping
    }
    // blood around the mouth: crusted, with fresh wet runs
    for (let i = 0; i < Math.round(pal.blood * 10) + 1; i++) {
      const sd = rng.chance(0.5) ? 1 : -1;
      const z = rng.float(0.0, 0.2), a = rng.float(0.55, 1.2);
      const x = uOf(a, sd) * r.w, y = yOf(z);
      Pt.spot(r, x, y, rng.float(1.2, 2.6), rng.float(0.9, 1.7), rng.chance(0.5) ? BLOOD_D : BLOOD, 0.9, true);
      if (rng.chance(0.4)) Pt.set(r, x, y, BLOOD_W);
    }
  }

  // ================= jaw (u 0.5 = mouth floor)
  {
    const r = Pt.R('JAW');
    const aOf = (x: number) => ab(((x + 0.5) / r.w) * Math.PI * 2);
    const L = fillLv(Pt, r, dog ? BL : SK, (u, vv, x, y) => (dog ? FRM : SKM) - 0.6 + (Pt.n(r, x, y, 3, 2, 51) - 0.5) * 1.0 - vv * 0.6 + (aOf(x) / Math.PI) * 0.8);
    if (dog) Pt.strokes(r, BL, L.get, { density: 0.3, flow: () => [0, 1], dark: 1.3, light: 1, salt: 10 });
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
      const a = aOf(x);
      if (a > Math.PI - 0.62) Pt.set(r, x, y, (x + y) % 4 === 0 ? 0x6a2228 : 0x4a1418);
      else if (a > Math.PI - 0.8) Pt.set(r, x, y, dog ? scaleHex(pal.fur, 0.35) : GUM_D);
    }
    for (let i = 0; i < Math.round(pal.blood * 6) + 1; i++) Pt.walk(r, rng.int(0, r.w - 1), rng.int(2, r.h - 2), rng.int(3, 7), 0, 1, rng.chance(0.5) ? BLOOD : BLOOD_D, 0.85, 0.5);
  }

  // ================= teeth (v=1 gum, v=0 tip): far too many flat human teeth (the dog's: just too many)
  {
    const r = Pt.R('TEETH');
    const gumRows = 3;
    let x = 0, k = 0;
    for (let y = 0; y < r.h; y++) for (let xx = 0; xx < r.w; xx++) Pt.set(r, xx, y, y < gumRows ? (y === 0 ? GUM_D : ((xx + y) % 3 === 0 ? mixHex(GUM, 0xc87070, 0.3) : GUM)) : MOUTH);
    while (x < r.w) {
      const w = (dog ? 1 : 2) + (ph(k, 17, v) < 0.35 ? 1 : 0);
      const bad = ph(k, 3, v) < 0.14, gone = ph(k, 5, v) < (dog ? 0.02 : 0.08);
      const tc = bad ? 0xb09868 : ph(k, 7, v) < 0.5 ? 0xf0e8d2 : 0xdcd0b0;
      const lenK = r.h - (ph(k, 13, v) < 0.35 ? 1 : 0);
      for (let i = 0; i < w && x + i < r.w; i++) for (let y = gumRows; y < r.h; y++) {
        if (gone || y >= lenK) continue;
        const lit = i === 0 ? 0.25 : i === w - 1 ? -0.2 : 0;
        let c = y === lenK - 1 ? mixHex(tc, 0xffffff, 0.3) : y === gumRows ? mixHex(tc, 0x7a5a38, 0.45) : tc;
        c = lit > 0 ? mixHex(c, 0xffffff, lit) : mixHex(c, 0x5a4a3a, -lit);
        Pt.set(r, x + i, y, c);
      }
      if (!gone && ph(k, 9, v) < 0.3 * pal.blood) Pt.set(r, x, gumRows + (k % 3), 0x8a2020);
      x += w + 1; k++;
    }
  }

  // ================= legs
  const limb = (name: string, knobs: number[], upper: boolean) => {
    const r = Pt.R(name);
    const cth = (x: number) => -Math.cos(((x + 0.5) / r.w) * Math.PI * 2); // -1 back, +1 front
    if (!dog) {
      fillLv(Pt, r, SK, (u, vv, x, y) => {
        let l = SKM + (Pt.n(r, x, y, 3, 2, 61) - 0.5) * 1.1 - cth(x) * 0.8 - (1 - vv) * 0.5;
        for (const kv of knobs) l += gauss(vv, kv, 0.04) * 1.6 * Math.max(0, -cth(x) * 0.5 + 0.5) - gauss(vv, kv - 0.07, 0.03) * 1.2;
        // tendons: a pale ridge and its shadow down the back
        const xb = Math.abs(((x + 0.5) / r.w) - 0.5) * 2;
        if (!upper) l += gauss(xb, 0.93, 0.04) * 1.2 - gauss(xb, 0.8, 0.05) * 1.0;
        return l;
      });
      if (upper) {
        const mm = (x: number, y: number) => Pt.n(r, x, y, 2, 2, 63) + (1 - (y + 0.5) / r.h) * 0.4 - (1 - pal.mange) * 0.6;
        Pt.strokes(r, FR, () => FRM - 1, { density: 0.6, flow: () => [0, 1], len: [2, 4], dark: 0.6, light: 1.6, mask: (x, y) => mm(x, y) > 0.48, salt: 11 });
      }
      for (let i = 0; i < 2; i++) Pt.walk(r, rng.int(0, r.w - 1), rng.int(0, r.h / 2), rng.int(6, 12), 0, 1, 0x4e4668, 0.3, 0.5);
      if (rng.chance(0.5)) sore(r, rng.int(0, r.w - 1), rng.int(3, r.h - 4), 0.9);
    } else {
      const R = v === 1 && !upper ? BL : v === 1 ? FR : FR2;
      const L = fillLv(Pt, r, R, (u, vv, x, y) => FRM + 0.4 - cth(x) * -0.6 + (Pt.n(r, x, y, 2, 2, 64) - 0.5) * 0.5 - (1 - vv) * 0.4 + (v === 1 && !upper ? 0.6 : 0));
      Pt.strokes(r, R, L.get, { density: 0.3, flow: () => [0, 1], len: [2, 4], dark: 1.1, light: 0.8, salt: 12 });
    }
    dirt(r, (x, y) => ((y + 0.5) / r.h) * pal.dirt * (upper ? 0.5 : 1.2) - 0.15);
  };
  limb('FLEG_U', [0.06], true); limb('FLEG_L', [0.27, 0.13], false); limb('HLEG_U', [0.06], true); limb('HLEG_L', [0.47, 0.12], false);
  {
    const r = Pt.R('PAW');
    fillLv(Pt, r, dog ? (v === 1 ? BL : FR2) : SK, (u, vv, x, y) => (dog ? FRM : SKM) - 1.5 + (Pt.n(r, x, y, 2, 2, 71) - 0.5) * 1.2 + vv * 1.5);
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
      const vv = 1 - (y + 0.5) / r.h;
      if (vv < 0.38) Pt.set(r, x, y, (x + y) % 3 === 0 ? 0x2e2620 : 0x221c18); // pads
      else if (x % 6 === 0) Pt.set(r, x, y, 0x1e1814); // toe gaps
    }
    dirt(r, () => 0.3 + pal.dirt * 0.4, 0x241a12);
    if (!dog) for (let i = 0; i < 4; i++) Pt.spot(r, rng.int(0, r.w - 1), rng.int(0, r.h - 1), 1.5, 1, BLOOD_D, 0.85, true);
  }
  {
    const r = Pt.R('CLAW');
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) Pt.set(r, x, y, y < 2 ? 0x9a8a74 : y < 4 ? 0x3e342c : 0x1e1814);
  }
  // ================= tail
  {
    const r = Pt.R('TAIL');
    if (!dog) {
      fillLv(Pt, r, SK, (u, vv, x, y) => SKM - 0.3 + (Pt.n(r, x, y, 2, 2, 81) - 0.5) * 1.0 - Math.cos(u * Math.PI * 2) * 0.7 - (1 - vv) * 1.2 + (y % 5 === 0 ? -1 : 0));
      for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) if (1 - (y + 0.5) / r.h < 0.22) Pt.blend(r, x, y, 0x1e1614, 0.65);
      for (let i = 0; i < 4; i++) sore(r, rng.int(0, r.w - 1), rng.int(3, r.h - 4), 1);
    } else {
      const R = v === 1 ? FR : FR2;
      const L = fillLv(Pt, r, R, (u, vv, x, y) => FRM + 0.3 - Math.cos(u * Math.PI * 2) * 0.6 + (Pt.n(r, x, y, 2, 2, 82) - 0.5) * 1.0);
      for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) if (1 - (y + 0.5) / r.h < 0.18 && v !== 1) { L.f[y * r.w + x] = FRM + 2; Pt.put(r, x, y, BL, FRM + 1.5, 0.3); }
      Pt.strokes(r, R, L.get, { density: 0.5, flow: () => [0, 1], len: [3, 6], dark: 1.6, light: 1.3, salt: 13 });
    }
  }
  // ================= ears (alpha-shaped: ragged outline on a transparent page)
  {
    const r = Pt.R('EAR');
    const ER = dog ? (v === 1 ? FR : ramp(scaleHex(pal.fur, 0.8), 12, 0x0c0808, 0.4)) : SK;
    const lvl = dog ? FRM : SKM;
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
      const u = (x + 0.5) / r.w, vv = 1 - (y + 0.5) / r.h;
      const half = (1 - vv * (dog ? 0.45 : 0.72)) * 0.5;
      const ragged = dog ? 0 : (ph(Math.floor(vv * 9), 2, v) < 0.35 ? 0.12 : 0) + (ph(Math.floor(vv * 5), 6, v) < 0.25 ? 0.2 : 0);
      if (Math.abs(u - 0.5) > half - ragged * (u > 0.5 ? 1 : 0.4)) continue;
      if (dog && vv > 0.86 && Math.abs(u - 0.5) > (1 - vv) * 2.4) continue; // rounded tip
      if (!dog && vv > 0.62 && ph(x, 4, v) < 0.4) continue;
      const edge = Math.abs(u - 0.5) > half - 0.12;
      Pt.put(r, x, y, ER, lvl + (edge ? -1.5 : 0) + (Pt.n(r, x, y, 2, 2, 91) - 0.5) * 1.2 - vv * 0.6, 0.2);
      if (!dog && !edge && Math.abs(u - 0.5) < half * 0.5) Pt.set(r, x, y, mixHex(0xb06a68, SK[7], 0.4));
      if (dog && (x + Math.floor(y / 3)) % 4 === 0) Pt.set(r, x, y, ER[clamp(Math.round(lvl - 1.6), 0, ER.length - 1)]);
    }
    if (!dog) Pt.walk(r, r.w / 2, r.h - 2, 8, 0, -1, 0x6a3a5a, 0.6, 0.5, 0.2);
  }
  {
    const r = Pt.R('FUR');
    const FRc = dog ? (v === 1 ? FR : FR2) : FR;
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
      const u = (x + 0.5) / r.w, vv = 1 - (y + 0.5) / r.h;
      const strand = ph(x, 1, v) * 0.9 + 0.1;
      if (vv > strand || Math.abs(u - 0.5) > 0.5 - vv * 0.3) continue;
      Pt.put(r, x, y, FRc, FRM - 1 + vv * 2 + (x % 2) * 0.6, 0.2);
    }
  }
  Pt.cut(Pt.R('CUT'), dog ? scaleHex(pal.fur, 0.8) : SK[6], { meat: 0x8a1c1c, fat: dog ? 0xe0c8a0 : 0xc8a888 });
  {
    const r = Pt.R('EYE');
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
      const u = (x + 0.5) / r.w, vv = (y + 0.5) / r.h;
      // u wraps round the bead; it looks outward at u = 0 (+x eye) and u = 0.5 (-x eye)
      const du = Math.min(Math.abs(u), Math.abs(u - 0.5), Math.abs(u - 1));
      const face = du < 0.17 && Math.abs(vv - 0.5) < 0.3;
      if (dog) Pt.set(r, x, y, face ? (du < 0.08 && Math.abs(vv - 0.5) < 0.18 ? 0x140a06 : 0x6a3e1e) : 0xe8e0d0);
      else Pt.set(r, x, y, face && du < 0.09 && Math.abs(vv - 0.5) < 0.18 ? 0xd8c860 : 0x0a0606);
    }
    Pt.set(r, 0, 2, 0xffffff); Pt.set(r, 3, 2, 0xffffff);
  }
  {
    const r = Pt.R('NOSE');
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) Pt.set(r, x, y, (x + y) % 3 === 0 ? 0x2a2222 : 0x1a1414);
    Pt.set(r, 2, 1, 0x8a8080); Pt.set(r, 3, 1, 0x6a6060);
  }
  {
    const r = Pt.R('COLLAR');
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) Pt.set(r, x, y, x > r.w * 0.85 ? (y < 3 ? 0xd8c070 : 0xa08840) : y === 0 || y === r.h - 1 ? 0x4a1010 : (x % 4 === 0 ? 0x6a1818 : 0x8a2420));
  }
}
HOUND.paint((P, v) => paintHound(P, v, false));
DOG.paint((P, v) => paintHound(P, v, true));

// =====================================================================================
// species
// =====================================================================================
const animH = animateHound(HOUND_PLAN);
const animD = animateHound(DOG_PLAN);
/** gallery poses cycle: walk, gallop, stalk, warn, attack, sleep */
function galleryAnim(S: Plan, anim: (rig: Rig, c: Creature, t: number, dt: number) => void, key: string) {
  return (rig: Rig, t: number) => {
    const ud = rig.root.userData;
    const q = (() => { try { return new URLSearchParams(location.search).get('pose') || ''; } catch { return ''; } })();
    const poses = ['walk', 'gallop', 'stalk', 'warn', 'attack', 'idle', 'sleep', 'dead'];
    const pose = q || poses[Math.floor(t / 4) % poses.length];
    const fc: any = ud.fake || (ud.fake = { id: 'g-' + key, x: 0, z: 0, facing: 0, speed: 0, state: 'idle', mem: {}, attackPhase: 0, hp: 30, hitFlash: 0, dead: false, deathT: 0, targetId: null, tamedBy: null, phase: 0 });
    const sp = pose === 'walk' ? 1.1 : pose === 'gallop' ? 5 : pose === 'stalk' ? 0.7 : 0;
    // walk in place: the creature "moves" along +z in its own frame
    fc.z += sp * (1 / 60); fc.x = 0; fc.facing = Math.PI / 2;
    fc.state = pose === 'walk' ? 'wander' : pose === 'gallop' ? 'chase' : pose === 'idle' ? 'idle' : pose === 'attack' ? 'attack' : pose === 'dead' ? 'dead' : pose;
    fc.dead = pose === 'dead';
    fc.attackPhase = pose === 'attack' && (t % 1.4) < 0.38 ? 0.2 : 0;
    fc.tamedBy = key === 'goodboy' && pose === 'walk' ? 'x' : null;
    const px = rig.root.position.x, pz = rig.root.position.z;
    anim(rig, fc, t, 1 / 60);
    rig.root.position.set(px, 0, pz);
    galleryDeathRoll(rig, fc.dead);
  };
}

const SH = def({
  key: 'grinhound', name: 'Grinhound', code: 'E-11 // CANID-WRONG', temperament: 'hostile', threat: 3,
  hp: 34, walk: 1.6, run: 5.2, turn: 10, radius: 0.35, height: 0.85, sight: 16, fov: 1.2, hearing: 1.3, smell: true,
  attack: { dmg: [7, 13], range: 0.9, cooldown: 1.0, kinds: ['bite', 'laceration', 'scratch'], corrupt: 0.12, knock: 0.5 },
  zones: ['lobby', 'suburbs', 'office', 'tunnels', 'parking'], weight: 3, group: [2, 4], maxPerZone: 8, diet: 'meat',
  meat: [['hound_meat_raw', 2]], flags: { pack: true },
  sounds: { idle: 'hound_huff', alert: 'hound_laugh', attack: 'hound_snarl', hurt: 'hound_yelp', death: 'hound_death', step: 'pad' },
  scan: { cls: 'Predator / pack', notes: ['Head is rotated ninety degrees. It does not seem to notice.', 'Hunts by smell. Follows the warm trail you leave on carpet.', 'Afraid of open flame.', 'Its "laughing" call brings the rest of the pack.'] },
  gore: { blood: 'red', sever: ['leg0', 'leg1', 'leg2', 'leg3', 'shin0', 'shin1', 'shin2', 'shin3', 'tail'], head: 'head' },
  build: () => buildHound(HOUND_PLAN),
  animate: animH,
});
SH.animateGallery = galleryAnim(HOUND_PLAN, animH, 'grinhound');
(SH as any).handlesSevered = true;

const SD = def({
  key: 'goodboy', name: 'Lost Dog', code: 'E-11b // CANID-STRAY', temperament: 'curious', threat: 0,
  hp: 26, walk: 1.5, run: 5.0, radius: 0.3, height: 0.7, sight: 14, fov: 1.3, hearing: 1.4, smell: true,
  attack: { dmg: [5, 9], range: 0.9, cooldown: 1.1, kinds: ['bite'], corrupt: 0 },
  zones: ['suburbs', 'fields', 'lobby'], weight: 0.6, maxPerZone: 1, diet: 'meat',
  tame: { food: ['meat_raw', 'hound_meat_raw', 'venison_raw', 'canned_dogfood', 'dogfood_open', 'jerky', 'steak_raw', 'chicken_raw', 'spam_open'], feeds: 3 },
  flags: { companion: true },
  sounds: { idle: 'dog_whine', alert: 'dog_bark', attack: 'dog_growl', hurt: 'hound_yelp', death: 'hound_death' },
  scan: { cls: 'Stray / tameable', notes: ['Smiles a little too wide. Wags its tail anyway.', 'Feed it meat a few times and it will follow you.', 'Growls at things you cannot see yet.'] },
  gore: { blood: 'red', sever: ['leg0', 'leg1', 'leg2', 'leg3', 'tail'], head: 'head' },
  build: () => buildHound(DOG_PLAN),
  animate: animD,
});
SD.animateGallery = galleryAnim(DOG_PLAN, animD, 'goodboy');
(SD as any).handlesSevered = true;
void THREE;
