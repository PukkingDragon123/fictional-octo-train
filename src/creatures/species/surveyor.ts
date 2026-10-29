import { horrify } from '../kit/horror';
import { kitCanvas, drips, stains, rot } from '../kit/rot';
import * as THREE from 'three';
import { def, Rig } from '../species';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { worldMaterial } from '../../gfx/materials';
import { ModelBuilder } from '../../gfx/modelBuilder';
import { makeRamp, mixHex, ph } from '../../gfx/pixel';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import type { Creature } from '../creature';
import type { Player } from '../../entities/player';
import type { Zone } from '../../world/zone';
import { applyHitToPlayer, HitInfo } from '../manager';
import {
  net, netOf, snd, playersIn, dist, hold, face, hashId, fakeCreature, rng, playAt, live, lightAt, beamOn, localIn, thinkOnce, pickReach, lineOfSightB,
} from '../behaviors_b';
import { pulse } from '../behaviors_a';
import {
  KitDef, KitRig, BoneSpec, SkinB, BuildCtx, Page, Region, Row, Wt, buildKitRig, kitSync, kitPersonalize, tube, headLoft, handLoft, footLoft,
  wLerp, gauss, SHOE_DRESS, lostParts, attackCurve, flinchOf, hash, offset, nearestSurvivor, lookAngles, twill,
} from '../kit/humanoids';
import { defDread } from '../dread';
import '../../audio/sounds_creatures_c';

// =====================================================================================
// SURVEYOR — a member of a 1990 survey team, still in the suit: rubberised
// yellow hazmat, a round hood with a visor, an air pack, a flashlight, a
// tether rope that trails away behind it into the dark and is not tied to
// anything. Whatever is wearing the suit now walks wrong (knees that bend the
// other way for a step, a hood that lolls, sometimes backwards), keeps its
// light on so you will see it from far off, and talks on the radio in a
// voice that is nearly words. Get close and the light goes out.
// =====================================================================================

addTextureModule(() => {
  const A = atlas();
  // the visor, fogged from the inside: grey-white bloom, runs of condensation, a smeared clear patch
  A.add('c_visor_fog', 32, 24, (pc) => {
    pc.wrap = false;
    for (let y = 0; y < 24; y++) for (let x = 0; x < 32; x++) {
      const d = Math.hypot((x - 15.5) / 16, (y - 11.5) / 12);
      const n = ph(x >> 1, y >> 1, 7);
      let c = mixHex(0xc8ccc4, 0x8a908c, Math.min(1, d * 0.9 + n * 0.25));
      if (ph(x, 3, 11) < 0.12 && y > 6 + ph(x, 5, 3) * 8) c = mixHex(c, 0x5a625e, 0.5); // runs of condensation
      if (d > 0.96) c = 0x2a2c2a;
      pc.set(x, y, c);
    }
    // a smeared hand-sized patch where something wiped it from inside
    for (let y = 7; y < 15; y++) for (let x = 18; x < 25; x++) if (ph(x, y, 13) < 0.7) pc.blend(x, y, 0x3a3e3c, 0.55);
  });
  // the visor with whatever is inside pressed against it
  A.add('c_visor_face', 32, 24, (pc) => {
    pc.wrap = false;
    for (let y = 0; y < 24; y++) for (let x = 0; x < 32; x++) {
      const d = Math.hypot((x - 15.5) / 16, (y - 11.5) / 12);
      pc.set(x, y, d > 0.96 ? 0x2a2c2a : mixHex(0x2e2a26, 0x141210, d));
    }
    // a mouth, flattened on the glass, too wide, too many teeth; no eyes
    for (let x = 6; x < 26; x++) { const yy = 13 + Math.round(Math.sin((x - 6) / 20 * Math.PI) * 2); pc.set(x, yy, 0x6a1a1a); pc.set(x, yy - 1, 0x8a2a24); pc.set(x, yy + 1, 0x4a1210); if (x % 2 === 0) { pc.set(x, yy - 1, 0xe8e0c8); pc.set(x, yy + 1, 0xd8d0b8); } }
    for (let x = 8; x < 24; x++) for (let y = 3; y < 10; y++) if (ph(x, y, 17) < 0.3) pc.blend(x, y, 0x8a7a6a, 0.6); // skin pressed white against the glass
  });
  // braided tether rope
  A.add('c_tether', 8, 32, (pc) => {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 8; x++) pc.set(x, y, ((x + y) % 4 < 2 ? 0xd8cfa0 : 0xb0a476));
    for (let y = 0; y < 32; y++) { pc.set(0, y, 0x8a7e58); pc.set(7, y, 0x8a7e58); }
    for (let y = 9; y < 12; y++) for (let x = 0; x < 8; x++) pc.blend(x, y, 0x3a3020, 0.5); // a filthy stretch
  }, 0.25, 1);
});

// ------------------------------------------------------------------ skeleton
function bonesV(): BoneSpec[] {
  const b: BoneSpec[] = [
    { name: 'pelvis', parent: '', at: [0, 0.98, 0] },
    { name: 'spine', parent: 'pelvis', at: [0, 0.06, 0] },
    { name: 'chest', parent: 'spine', at: [0, 0.3, 0] },
    { name: 'neck', parent: 'chest', at: [0, 0.24, 0.0], cap: true },
    { name: 'head', parent: 'neck', at: [0, 0.1, 0.01], cap: true },
  ];
  for (const [s, k] of [['L', 1], ['R', -1]] as const) {
    b.push(
      { name: 'arm' + s, parent: 'chest', at: [k * 0.22, 0.18, -0.01], cap: true },
      { name: 'fore' + s, parent: 'arm' + s, at: [0, -0.31, 0], cap: true },
      { name: 'hand' + s, parent: 'fore' + s, at: [0, -0.28, 0], cap: true },
      { name: 'f1' + s, parent: 'hand' + s, at: [0, -0.08, 0] },
      { name: 'f2' + s, parent: 'f1' + s, at: [0, -0.045, 0] },
      { name: 'th' + s, parent: 'hand' + s, at: [-k * 0.004, -0.03, 0.03] },
      { name: 'thigh' + s, parent: 'pelvis', at: [k * 0.105, -0.05, 0], cap: true },
      { name: 'shin' + s, parent: 'thigh' + s, at: [0, -0.45, 0], cap: true },
      { name: 'foot' + s, parent: 'shin' + s, at: [0, -0.43, 0] },
    );
  }
  return b;
}
function layoutV(p: Page) {
  p.reg('TORSO', 84, 64, [0.86, 1.62]);
  p.reg('HOOD', 72, 44, [-0.08, 0.3]);
  p.reg('ARM', 26, 64, [-0.64, 0.05]);
  p.reg('LEG', 28, 64, [-0.94, 0.08]);
  p.reg('PACK', 48, 40);
  p.reg('GLOVE', 20, 22);
  p.reg('BOOT', 28, 16);
  p.reg('CAP', 16, 16);
}
// a bulky suit over something thinner: the rubber hangs in folds
const TORSO_V: Row[] = [
  { y: 0.86, rx: 0.07, rf: 0.06, rb: 0.06 },
  { y: 0.92, rx: 0.17, rf: 0.13, rb: 0.13 },
  { y: 1.02, rx: 0.19, rf: 0.14, rb: 0.14 },
  { y: 1.16, rx: 0.18, rf: 0.14, rb: 0.13 },
  { y: 1.3, rx: 0.2, rf: 0.15, rb: 0.14 },
  { y: 1.44, rx: 0.22, rf: 0.15, rb: 0.15 },
  { y: 1.52, rx: 0.24, rf: 0.13, rb: 0.14, sq: 2.6 },
  { y: 1.58, rx: 0.14, rf: 0.1, rb: 0.11 },
  { y: 1.62, rx: 0.1, rf: 0.09, rb: 0.1 },
];
const HOOD_V: Row[] = [
  { y: -0.08, rx: 0.11, rf: 0.11, rb: 0.12 },
  { y: -0.02, rx: 0.15, rf: 0.15, rb: 0.15 },
  { y: 0.06, rx: 0.165, rf: 0.17, rb: 0.16 },
  { y: 0.15, rx: 0.165, rf: 0.17, rb: 0.16 },
  { y: 0.22, rx: 0.15, rf: 0.15, rb: 0.15 },
  { y: 0.27, rx: 0.11, rf: 0.11, rb: 0.11 },
  { y: 0.3, rx: 0.05, rf: 0.05, rb: 0.05 },
];
const ARM_V: Row[] = [
  { y: 0.04, rx: 0.06, rf: 0.065, rb: 0.065 },
  { y: -0.02, rx: 0.075, rf: 0.07, rb: 0.07 },
  { y: -0.28, rx: 0.062, rf: 0.06, rb: 0.062 },
  { y: -0.32, rx: 0.066, rf: 0.064, rb: 0.07 },
  { y: -0.4, rx: 0.058, rf: 0.056, rb: 0.058 },
  { y: -0.56, rx: 0.05, rf: 0.05, rb: 0.05 },
  { y: -0.6, rx: 0.056, rf: 0.056, rb: 0.056 },   // the cuff, taped
];
const LEG_V: Row[] = [
  { y: 0.08, rx: 0.08, rf: 0.08, rb: 0.09 },
  { y: -0.02, rx: 0.095, rf: 0.095, rb: 0.1 },
  { y: -0.3, rx: 0.082, rf: 0.08, rb: 0.085 },
  { y: -0.45, rx: 0.075, rf: 0.08, rb: 0.072 },
  { y: -0.6, rx: 0.07, rf: 0.07, rb: 0.075 },
  { y: -0.84, rx: 0.068, rf: 0.07, rb: 0.07 },
  { y: -0.9, rx: 0.074, rf: 0.076, rb: 0.074 },
];

function buildV(B: SkinB, x: BuildCtx) {
  const bi = x.bi, R = x.R;
  const tw = (y: number): Wt => {
    if (y < 1.0) return [bi('pelvis'), 1];
    if (y < 1.1) return wLerp(y, 1.0, 1.1, bi('pelvis'), bi('spine'));
    if (y < 1.3) return [bi('spine'), 1];
    if (y < 1.4) return wLerp(y, 1.3, 1.4, bi('spine'), bi('chest'));
    if (y < 1.58) return [bi('chest'), 1];
    return [bi('chest'), 0.5, bi('neck'), 0.5];
  };
  tube(B, { rows: TORSO_V, ys: [0.86, 0.92, 0.97, 1.02, 1.09, 1.16, 1.23, 1.3, 1.37, 1.44, 1.52, 1.58, 1.62], n: 14, reg: R('TORSO'), vr: R('TORSO').range, w: tw, g: 1, start: [0, 0.855, 0], end: [0, 1.63, 0],
    bump: (th, y) => 0.03 * Math.sin(th * 7 + y * 30) * gauss(y, 1.12, 0.12) }); // the rubber hangs in folds
  // the air pack: a box on the back, a tank across it
  {
    const C = bi('chest');
    B.box([0, 1.32, -0.235], [0.3, 0.38, 0.15], null, R('PACK'), [C, 1]);
    B.box([0, 1.33, -0.32], [0.12, 0.42, 0.08], null, R('PACK'), [C, 1], [0, 0, 0.45, 1], 1.1);
  }
  // the hood: one rounded bag over the head with the visor set in front
  headLoft(B, { at: x.rest('head'), rows: HOOD_V, reg: R('HOOD'), vr: R('HOOD').range, w: (y) => (y < -0.04 ? [bi('neck'), 0.5, bi('head'), 0.5] : [bi('head'), 1]), g: 6, top: 0.3, bottom: -0.08 });
  for (const [s, k] of [['L', 1], ['R', -1]] as const) {
    const U = bi('arm' + s), F = bi('fore' + s), H = bi('hand' + s);
    const at = x.rest('arm' + s);
    const wf = (y: number): Wt => (y > -0.01 ? [U, 0.7, bi('chest'), 0.3] : y > -0.26 ? [U, 1] : y > -0.36 ? wLerp(y, -0.26, -0.36, U, F) : y > -0.56 ? [F, 1] : [F, 0.5, H, 0.5]);
    tube(B, { rows: ARM_V, ys: [0.04, -0.02, -0.12, -0.22, -0.28, -0.32, -0.36, -0.44, -0.52, -0.56, -0.6], n: 8, reg: R('ARM'), vr: R('ARM').range, at, w: wf, g: 10 + (k > 0 ? 0 : 1), mirror: k, start: true });
    const hpp = x.rest('hand' + s);
    handLoft(B, { k, at: [hpp[0], hpp[1] - 0.004, hpp[2]], bones: { farm: F, hand: H, f1: bi('f1' + s), f2: bi('f2' + s), thumb: bi('th' + s) }, reg: R('GLOVE'), g: 20 + (k > 0 ? 0 : 10), s: 1.2, fused: true, glove: 0.006 });
    const T = bi('thigh' + s), Sh = bi('shin' + s), Ft = bi('foot' + s);
    const lt = x.rest('thigh' + s);
    const wl = (y: number): Wt => (y > 0.02 ? [bi('pelvis'), 0.5, T, 0.5] : y > -0.4 ? [T, 1] : y > -0.5 ? wLerp(y, -0.4, -0.5, T, Sh) : y > -0.86 ? [Sh, 1] : [Sh, 0.5, Ft, 0.5]);
    tube(B, { rows: LEG_V, ys: [0.08, -0.02, -0.16, -0.3, -0.4, -0.45, -0.5, -0.6, -0.72, -0.84, -0.9], n: 8, reg: R('LEG'), vr: R('LEG').range, at: lt, w: wl, g: 30 + (k > 0 ? 0 : 1), mirror: k, start: [lt[0], lt[1] + 0.08, lt[2]], startW: [bi('pelvis'), 0.6, T, 0.4] });
    footLoft(B, { k, at: x.rest('foot' + s), rows: SHOE_DRESS, ground: -0.06, sole: 0.02, lip: 0.006, reg: R('BOOT'), w: [Ft, 1], g: 36 + (k > 0 ? 0 : 1), s: 1.3, sx: 1.2 });
  }
}

function paintV(p: Page, x: BuildCtx) {
  const v = x.variant;
  const SU = makeRamp([0xc89a2a, 0xb8a032, 0xc88a2a][v % 3], 9, { hueShift: 0.04, spread: 0.6 });
  const TAPE = makeRamp(0x8a8c88, 5, { spread: 0.4 });
  const grime = (r: Region, sd: number, k = 1) => { for (let yy = 0; yy < r.h; yy++) for (let xx = 0; xx < r.w; xx++) { const n = r.fbm(xx, yy, 3, 2, sd); if (n < 0.32) r.blend(xx, yy, 0x3a3020, (0.32 - n) * 1.8 * k); } };
  const rubber = (r: Region, base: number, sd: number, extra?: (xx: number, yy: number) => number) => {
    r.fill(SU, (xx, yy) => {
      const th = (r.deg(xx) * Math.PI) / 180;
      return base + 1.6 * Math.cos(th) - 0.5 + (r.fbm(xx, yy, 4, 2, sd) - 0.5) * 0.8 + twill(xx, yy, 'plain') + (extra ? extra(xx, yy) : 0);
    }, undefined, 0.5);
    grime(r, sd + 1);
  };
  // the suit has split: a jagged rip, the rubber curling back from it, something grey and
  // swollen pressed into the gap, and thirty years of dark fluid run down from it
  const rip = (r: Region, cx: number, cy: number, len: number, sd: number) => {
    let yy = cy;
    for (let i = -len; i <= len; i++) {
      yy += hash(i, sd) < 0.3 ? 1 : hash(i, sd + 1) < 0.3 ? -1 : 0;
      const w = Math.max(0, Math.round((1 - Math.abs(i) / (len + 1)) * 2.4));
      for (let j = -w; j <= w; j++) r.set(cx + i, yy + j, Math.abs(j) === w ? 0x0e0a06 : hash(i, j + sd) < 0.55 ? 0x8a8c80 : 0x6a6c62);
      r.set(cx + i, yy - w - 1, SU[8]); r.blend(cx + i, yy + w + 1, 0x1a1408, 0.7);
    }
    drips(kitCanvas(r), cx, cy + 2, 3, 8, [0, 1], sd + 7, len * 0.6);
  };
  const tapeBand = (r: Region, y0: number, h: number) => { for (let yy = y0; yy < y0 + h; yy++) for (let xx = 0; xx < r.w; xx++) r.put(xx, yy, TAPE, 2.4 + Math.cos((r.deg(xx) * Math.PI) / 180) * 1.2 + (yy === y0 ? 0.6 : 0) + (hash(xx, yy) - 0.5) * 0.6); };
  {
    const r = p.R('TORSO');
    rubber(r, 4.6, 3, (xx, yy) => 0.6 * Math.sin(r.deg(xx) * 0.12 + yy * 0.3) * gauss(r.yAt(yy), 1.12, 0.12));
    // zipper flap down the front, reflective chest stripe, the survey patch, a number on the back
    for (let yy = Math.round(r.Y(1.56)); yy < r.Y(0.9); yy++) { r.set(r.X(0), yy, SU[2]); r.set(r.X(4), yy, SU[3]); }
    for (let yy = Math.round(r.Y(1.36)); yy < Math.round(r.Y(1.32)); yy++) for (let xx = 0; xx < r.w; xx++) if (Math.abs(r.deg(xx)) < 150) r.set(xx, yy, (xx + yy) % 3 ? 0xd8dcd0 : 0xb8bcb0);
    r.rect(r.X(-32) - 5, r.Y(1.47), 10, 6, 0xe8e4d8); r.rect(r.X(-32) - 4, r.Y(1.47) + 2, 8, 1, 0x2a3a6a); r.rect(r.X(-32) - 3, r.Y(1.47) + 4, 6, 1, 0x8a2a24);
    for (let i = 0; i < 5; i++) r.rect(r.X(180) - 10 + i * 4, r.Y(1.42), 3, 5, i === 3 ? SU[5] : 0x2a2418);
    tapeBand(r, Math.round(r.Y(0.94)), 3);
    rip(r, Math.round(r.X(40 + v * 30)), Math.round(r.Y(1.22)), 5, 31 + v);
    rip(r, Math.round(r.X(-120)), Math.round(r.Y(1.05)), 3, 35 + v);
    stains(kitCanvas(r), 5, 37 + v, undefined, 0.15);
    rot(kitCanvas(r), 0.5, 39 + v); // mould in the creases
  }
  {
    const r = p.R('HOOD');
    rubber(r, 4.8, 5);
    // the visor frame: a dark gasket where the glass sits (the glass itself is its own piece)
    for (let yy = 0; yy < r.h; yy++) for (let xx = 0; xx < r.w; xx++) {
      const deg = r.deg(xx), h = r.yAt(yy);
      if (Math.abs(deg) < 58 && h > -0.01 && h < 0.2) { const edge = Math.abs(deg) > 52 || h < 0.005 || h > 0.19; r.set(xx, yy, edge ? 0x1a1a18 : 0x2a2c2a); }
    }
    for (let xx = 0; xx < r.w; xx++) if (hash(xx, 3) < 0.5) r.set(xx, Math.round(r.Y(-0.05)), TAPE[2]);
  }
  { const r = p.R('ARM'); rubber(r, 4.4, 7); tapeBand(r, Math.round(r.Y(-0.56)), 4); tapeBand(r, Math.round(r.Y(-0.31)), 2); stains(kitCanvas(r), 3, 45 + v, undefined, 0.2); }
  { const r = p.R('LEG'); rubber(r, 4.2, 9); tapeBand(r, Math.round(r.Y(-0.86)), 4); for (let yy = Math.round(r.Y(-0.5)); yy < r.Y(-0.42); yy++) for (let xx = 0; xx < r.w; xx++) r.blend(xx, yy, 0x3a3020, 0.4); grime(r, 19, 1.5); rip(r, Math.round(r.X(10)), Math.round(r.Y(-0.3)), 3, 41 + v); stains(kitCanvas(r), 3, 43 + v, undefined, 0.1); }
  {
    const r = p.R('GLOVE');
    const G2 = makeRamp(0x3a3e36, 6, { spread: 0.5 });
    r.fill(G2, (xx, yy) => 2.8 + Math.cos((r.deg(xx) * Math.PI) / 180) * 1.2 + twill(xx, yy, 'knit'));
  }
  { const r = p.R('BOOT'); const BB = makeRamp(0x2a2a26, 5, { spread: 0.4 }); r.fill(BB, (xx, yy) => 2.2 + (yy / r.h) * 1.4 + (hash(xx, yy) - 0.5) * 0.5); }
  {
    const r = p.R('PACK');
    const M = makeRamp(0x6a706a, 7, { spread: 0.5 });
    r.fill(M, (xx, yy) => 3 + (r.fbm(xx, yy, 3, 2, 21) - 0.5) * 1.2 - (yy / r.h) * 0.8);
    // the tank: a bright cylinder band, stencilled, a valve
    for (let yy = 4; yy < r.h - 4; yy++) for (let xx = 4; xx < 20; xx++) r.put(xx, yy, makeRamp(0xc8c8c0, 6, { spread: 0.4 }), 2 + Math.sin(((xx - 4) / 16) * Math.PI) * 2.4);
    r.rect(6, 12, 12, 3, 0x2a5a2a);
    r.rect(10, 1, 4, 4, 0x8a8a84);
    grime(r, 23);
  }
  {
    const r = p.R('CAP');
    for (let yy = 0; yy < r.h; yy++) for (let xx = 0; xx < r.w; xx++) {
      const d = Math.hypot(xx + 0.5 - r.w / 2, yy + 0.5 - r.h / 2) / (r.w / 2);
      // the suit, cut: nothing in it but black, and something wet at the bottom
      r.set(xx, yy, d > 0.86 ? SU[4] : d > 0.74 ? 0x1a1a18 : hash(xx, yy) < 0.15 ? 0x2a1a14 : 0x050404);
    }
  }
  void v;
}

const SURVEYOR_KIT: KitDef = { key: 'surveyor', variants: 3, bones: () => bonesV(), layout: layoutV, build: buildV, paint: paintV, sphere: [0, 1.0, 0, 1.4] };

// ------------------------------------------------------------------ extra pieces: visor, lamp, tether
interface VRig extends KitRig { visor: THREE.Mesh; face: THREE.Mesh; lamp: THREE.Group; lens: THREE.Mesh; rope: THREE.InstancedMesh; hist: number[][] }
const MAT = () => worldMaterial({});
let visorGeo: THREE.BufferGeometry | null = null, faceGeo: THREE.BufferGeometry | null = null, lampGeo: THREE.BufferGeometry | null = null, lensGeo: THREE.BufferGeometry | null = null, ropeGeo: THREE.BufferGeometry | null = null;
const ROPE_N = 16;
function curvedPlate(tex: string, emis: number) {
  // a curved visor: a strip of quads round the front of the hood
  const mb = new ModelBuilder();
  const R = 0.178, n = 6, a0 = -0.95, a1 = 0.95, y0 = 0.005, y1 = 0.19;
  for (let i = 0; i < n; i++) {
    const t0 = a0 + ((a1 - a0) * i) / n, t1 = a0 + ((a1 - a0) * (i + 1)) / n;
    const p = (a: number, y: number) => [Math.sin(a) * R, y, Math.cos(a) * R];
    mb.quadRaw([p(t0, y0), p(t1, y0), p(t1, y1), p(t0, y1)], [[i / n, 0], [(i + 1) / n, 0], [(i + 1) / n, 1], [i / n, 1]], tex, 0xffffff, 1, emis);
  }
  return mb.build();
}
function buildSurveyor(): Rig {
  const rig = buildKitRig(SURVEYOR_KIT, 0, 1.9) as VRig;
  if (!visorGeo) {
    visorGeo = curvedPlate('c_visor_fog', 0.35);
    faceGeo = curvedPlate('c_visor_face', 0.15);
    let mb = new ModelBuilder();
    // a long survey lamp: body along -y of the hand, lens at the end
    mb.cylinder(0, -0.2, 0.0, 0.028, 0.2, 8, { sides: 'metal_dark', top: 'metal_dark', bottom: 'metal_dark' });
    mb.cylinder(0, -0.24, 0.0, 0.04, 0.045, 8, { sides: 'metal_dark', top: 'metal_dark', bottom: 'metal_dark' });
    lampGeo = mb.build();
    mb = new ModelBuilder();
    mb.cylinder(0, -0.245, 0.0, 0.034, 0.01, 8, 'white', { color: 0xfff4d0, emissive: 2 });
    lensGeo = mb.build();
    mb = new ModelBuilder();
    mb.box(0, -0.5, 0, 1, 1, 1, { all: 'c_tether' });
    ropeGeo = mb.build();
  }
  const head = rig.parts.head;
  const visor = new THREE.Mesh(visorGeo, MAT()); head.add(visor);
  const faceM = new THREE.Mesh(faceGeo!, MAT()); faceM.visible = false; head.add(faceM);
  const lamp = new THREE.Group(); rig.parts.handR.add(lamp); lamp.rotation.x = -0.4;
  lamp.add(new THREE.Mesh(lampGeo!, MAT()));
  const lens = new THREE.Mesh(lensGeo!, worldMaterial({ unlit: true, outline: 0 } as any)); lamp.add(lens);
  const rope = new THREE.InstancedMesh(ropeGeo!, worldMaterial({}), ROPE_N);
  rope.frustumCulled = false; rope.castShadow = false; rope.count = 0;
  rig.root.add(rope);
  rig.visor = visor; rig.face = faceM; rig.lamp = lamp; rig.lens = lens; rig.rope = rope; rig.hist = [];
  return rig;
}

const _m4 = new THREE.Matrix4(), _inv = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
/** the tether lies along where it has walked, back to nothing */
function updateRope(R: VRig, c: Creature) {
  const h = R.hist;
  const last = h[h.length - 1];
  if (!last || Math.hypot(last[0] - c.x, last[1] - c.z) > 0.45) { h.push([c.x, c.z]); if (h.length > ROPE_N) h.shift(); }
  // points: the pack, then the walked path, then a little further into the dark
  const pts: number[][] = [];
  const bx = c.x - Math.cos(c.facing) * 0.3, bz = c.z - Math.sin(c.facing) * 0.3;
  pts.push([bx, 1.0, bz], [bx - Math.cos(c.facing) * 0.15, 0.35, bz - Math.sin(c.facing) * 0.15]);
  for (let i = h.length - 2; i >= 0; i--) pts.push([h[i][0], 0.03, h[i][1]]);
  if (pts.length >= 3) { const a = pts[pts.length - 2], b = pts[pts.length - 1]; const dx = b[0] - a[0], dz = b[2] - a[2], l = Math.hypot(dx, dz) || 1; pts.push([b[0] + (dx / l) * 1.6, 0.03, b[2] + (dz / l) * 1.6]); }
  R.root.updateMatrixWorld(true);
  _inv.copy(R.root.matrixWorld).invert();
  let k = 0;
  for (let i = 0; i + 1 < pts.length && k < ROPE_N; i++) {
    _a.set(pts[i][0], pts[i][1], pts[i][2]); _b.set(pts[i + 1][0], pts[i + 1][1], pts[i + 1][2]);
    const L = _a.distanceTo(_b); if (L < 0.01) continue;
    _p.copy(_b).sub(_a).normalize();
    _q.setFromUnitVectors(_up, _p);
    _s.set(0.022, L, 0.022);
    _m4.compose(_b, _q, _s).premultiply(_inv);
    R.rope.setMatrixAt(k++, _m4);
  }
  R.rope.count = k;
  R.rope.instanceMatrix.needsUpdate = true;
}

// ------------------------------------------------------------------ animation
function animateSurveyor(rig: Rig, c: Creature, t: number, dt: number) {
  const K = rig as VRig;
  if (K.kit.who !== c.id) { K.kit.who = c.id; kitPersonalize(K, Math.floor(hashId(c.id) * 3)); K.hist.length = 0; }
  kitSync(K);
  const P = rig.parts;
  const R = (nm: string, x: number, y = 0, z = 0) => { const o = P[nm]; if (o) o.rotation.set(x, y, z); };
  const ud = rig.root.userData as Record<string, number>;
  const n = netOf(c);
  const seed = hashId(c.id);
  const ac = attackCurve(rig, c, t);
  const lost = lostParts(c);
  const moving = c.speed > 0.15;
  const dragging = n.drag ? 1 : 0;
  const ph0 = c.phase;
  const step = Math.floor(ph0 / Math.PI);
  // every third step the knee bends the wrong way
  const wrongKnee = moving && (step % 3 === 0);
  for (const [i, s, k] of [[0, 'L', 1], [1, 'R', -1]] as const) {
    const ph = ph0 + i * Math.PI;
    const sw = moving ? Math.sin(ph) * 0.5 : 0;
    const lift = moving ? Math.max(0, -Math.sin(ph)) : 0;
    const knee = wrongKnee && i === (step & 1) ? -0.65 * lift : 0.9 * lift;
    R('thigh' + s, -sw + (dragging ? -0.2 : 0), 0, k * 0.04);
    R('shin' + s, knee + 0.05, 0, 0);
    R('foot' + s, -knee * 0.3, 0, 0);
    if (lost.has('thigh' + s) || lost.has('shin' + s)) R('thigh' + s, -1.2, 0, k * 0.3);
  }
  // the body is carried, not walking: stiff, leaning back a little, the hood lolling
  const loll = Math.sin(t * 0.7 + seed * 9) * 0.25 + (ph(Math.floor(t * 0.5), 1, seed * 100) < 0.2 ? 0.9 : 0);
  ud.loll = (ud.loll ?? 0) + (loll - (ud.loll ?? 0)) * Math.min(1, dt * (Math.abs(loll) > 0.8 ? 14 : 2));
  R('pelvis', 0, moving ? Math.sin(ph0) * 0.05 : 0, 0);
  R('spine', -0.08 + ac.strike * 0.35 - ac.wind * 0.2 + dragging * -0.25, 0, Math.sin(t * 0.4 + seed) * 0.04);
  R('chest', -0.04 + ac.strike * 0.2, 0, 0);
  const tgt = nearestSurvivor(c, 18);
  let yaw = 0;
  if (tgt) [yaw] = lookAngles(c, tgt.x, tgt.z, tgt.y, 1.7, 1.0, 0.5);
  ud.hy = (ud.hy ?? 0) + (yaw - (ud.hy ?? 0)) * Math.min(1, dt * 3);
  R('neck', 0.1, ud.hy * 0.4, ud.loll * 0.5);
  R('head', 0.05, ud.hy * 0.5, ud.loll * 0.7);
  // left arm: dead weight on a pendulum; right arm: the lamp
  ud.swing = (ud.swing ?? 0) * Math.exp(-dt * 1.2) + (moving ? Math.cos(ph0) * dt * 2.4 : 0);
  if (ac.wind > 0 || ac.strike > 0 || dragging) {
    // both hands out: it takes hold
    const w = Math.max(ac.wind, ac.strike, dragging);
    R('armL', -1.4 * w, 0, 0.2); R('foreL', -0.4 * w, 0, 0); R('armR', -1.3 * w, 0, -0.2); R('foreR', -0.5 * w, 0, 0);
  } else {
    R('armL', ud.swing * 0.8 + 0.05, 0, 0.12); R('foreL', -0.15 + Math.abs(ud.swing) * 0.2, 0, 0);
    // the lamp held out, sweeping slowly, or levelled at you when it has seen you
    const sweep = n.lamp ? Math.sin(t * 0.6 + seed * 4) * 0.35 : 0;
    R('armR', n.lamp ? -0.95 : -0.1, sweep, -0.15); R('foreR', n.lamp ? -0.35 : -0.2, 0, 0);
  }
  R('handL', -0.1); R('handR', 0);
  for (const s of ['L', 'R']) { R('f1' + s, 0, 0, 0); R('f2' + s, 0, 0, 0); }
  // the lamp: lens bright when on; a real pool of light ahead of it (every peer sees the same light)
  K.lens.visible = !!n.lamp;
  if (n.lamp && live() && G.local && G.local.zoneKey === c.zoneKey && !c.dead) {
    rig.root.updateMatrixWorld(true);
    K.lens.getWorldPosition(_p);
    const fx = Math.cos(c.facing + (ud.hy ?? 0) * -0.5), fz = Math.sin(c.facing + (ud.hy ?? 0) * -0.5);
    const flick = ph(Math.floor(t * 18), 3, seed * 50) < 0.06 ? 0.15 : 1;
    G.pointLight?.(_p.x + fx * 1.8, 0.6, _p.z + fz * 1.8, 0xfff0c8, 0.9 * flick, 5.5);
  }
  // the visor: fogged; for a moment after it is hurt, you can see what is pressed against it
  if (n.vs !== undefined && n.vs !== ud.vsSeen) { if (ud.vsSeen !== undefined) ud.visAt = t; ud.vsSeen = n.vs; }
  const showFace = n.vis === 1e9 || (ud.visAt !== undefined && t - ud.visAt < 1.4);
  K.visor.visible = !showFace; K.face.visible = !!showFace;
  if (ac.strike > 0.5) { K.visor.visible = false; K.face.visible = true; }
  const fl = flinchOf(c);
  if (fl > 0) { rig.body.position.x = Math.sin(t * 80) * 0.03 * fl; } else rig.body.position.x = 0;
  const F = K.kit.F.fx.value; F.y += dt; F.z = Math.min(1, c.hitFlash / 0.15) * 0.4; F.x = c.dead ? 0 : (ph(Math.floor(t * 2), 7, seed * 30) < 0.03 ? 0.4 : 0);
  if (c.dead) {
    ud.deadT = (ud.deadT ?? 0) + dt;
    const k = Math.min(1, ud.deadT * 2);
    // the suit goes slack: whatever was in it is not holding it up any more
    for (const [s, kk] of [['L', 1], ['R', -1]] as const) { R('thigh' + s, -0.3 * k, 0, kk * 0.3); R('shin' + s, 0.4 * k, 0, 0); R('arm' + s, 0.2, 0, kk * 0.6 * k); }
    R('neck', 0.8 * k, 0, 0.6); R('head', 0.4, 0, 0.4);
    offset(rig, 'pelvis', 0, -0.25 * k, 0);
    K.lens.visible = false;
  }
  updateRope(K, c);
  dragLocal(K, c, n, t, dt);
  radioLocal(c, n);
}

/** on every peer: the radio voice, with a subtitle for the survivor close enough to hear it */
function radioLocal(c: Creature, n: Record<string, any>) {
  const r = n.rad as [number, number] | undefined;
  if (!r || !live()) return;
  const ud = c.rig!.root.userData;
  if (ud.radSeen === undefined) { ud.radSeen = r[0]; return; }
  if (ud.radSeen === r[0]) return;
  ud.radSeen = r[0];
  playAt('surveyor_radio', c, 1, 30);
  const p = G.local;
  if (p && p.zoneKey === c.zoneKey && Math.hypot(p.x - c.x, p.z - c.z) < 26) bus.emit('subtitle', { who: 'RADIO', text: LINES[r[1] % LINES.length], dur: 3.2, style: 'radio' });
}
const LINES = [
  '...this is Survey Four... anyone on this channel... over.',
  '...found it. Found the way out. Over here. Over.',
  '...follow the rope... follow the rope back... over.',
  '...requesting... requesting... requesting...',
  '...I can see your light. Keep coming. Over.',
  '...Brandt? Is that you? Say something. Over.',
  '...don\'t take the suit off. Whatever you do... over.',
  '...it\'s warm in here. It\'s so warm in here...',
];

/** the victim's machine: pulled along, backwards, into the dark */
function dragLocal(R: VRig, c: Creature, n: Record<string, any>, t: number, dt: number) {
  const p = G?.local as Player | undefined;
  const ud = R.root.userData;
  const on = !!p && n.drag === p.id && !p.body.dead;
  if (on) {
    if (!ud.dragOn) {
      ud.dragOn = 1;
      G.camera?.pushIn?.(0.16, 0.4, -4);
      G.audio?.flat?.('dread_hit', 'music', 0.55);
      bus.emit('subtitle', { who: '', text: 'It has hold of the suit— of ME—', dur: 2.2, style: 'self' });
    }
    const fx = Math.cos(c.facing), fz = Math.sin(c.facing);
    const tx = c.x + fx * 0.62, tz = c.z + fz * 0.62;
    p.x += (tx - p.x) * Math.min(1, dt * 9); p.z += (tz - p.z) * Math.min(1, dt * 9);
    p.vx *= 0.1; p.vz *= 0.1;
    G.pr.fx.hurt = Math.max(G.pr.fx.hurt, 0.25);
    if (((t * 2.2) | 0) !== (((t - dt) * 2.2) | 0)) G.camera?.shake?.(0.22, 0.4, 0.8);
  } else if (ud.dragOn) { ud.dragOn = 0; G.camera?.pushIn?.(0, 1); }
}

// ------------------------------------------------------------------ brain (host)
const dark = (z: Zone, x: number, zz: number) => lightAt(z, x, zz) < 0.4;
function nearest(c: Creature, maxD = 30): { p: Player; d: number } | null {
  let best: Player | null = null, bd = maxD;
  for (const p of playersIn(c.zoneKey)) { const d = dist(p, c); if (d < bd) { bd = d; best = p; } }
  return best ? { p: best, d: bd } : null;
}
function radio(c: Creature, line?: number) {
  const n = net(c);
  n.rad = [(((n.rad?.[0]) ?? 0) + 1) % 1000, line ?? Math.floor(rng.next() * LINES.length)];
}

function thinkSurveyor(c: Creature, dt: number): boolean {
  const z = G.getZone(c.zoneKey), cs = G.creatures, m = c.mem, n = net(c);
  const ev = pulse(c);
  if (ev.hurt > 0) { n.vs = ((n.vs ?? 0) + 1) % 1000; if (m.drag) endDrag(c); if (c.noiseCooldown <= 0) { playAt('surveyor_hurt', c, 1, 20); c.noiseCooldown = 1.5; } }
  m.radT = (m.radT ?? rng.float(4, 10)) - dt;
  const near = nearest(c, 40);
  // a grab that landed (the manager resolved the strike since the last think) becomes a drag
  if (m.grabNext && c.attackPhase <= 0) {
    m.grabNext = false;
    const p = near?.p;
    if (p && near!.d <= c.sp.attack!.range + p.radius + 0.35 && !p.body.dead) {
      m.drag = { pid: p.id, t: 0, next: 0.85 };
      n.drag = p.id;
      c.setState('attack');
    }
  }
  // ---- dragging someone away
  if (m.drag) {
    const p = G.players.get(m.drag.pid) as Player | undefined;
    m.drag.t += dt;
    if (!p || p.body.dead || p.zoneKey !== c.zoneKey || m.drag.t > 3.6 || dist(p, c) > 1.8) { endDrag(c); return true; }
    // walk backwards, away, the victim held in front
    const a = Math.atan2(c.z - p.z, c.x - p.x);
    c.vx = Math.cos(a) * 1.5; c.vz = Math.sin(a) * 1.5; c.speed = 1.5;
    face(c, p.x, p.z);
    m.drag.next -= dt;
    if (m.drag.next <= 0) {
      m.drag.next = 0.85;
      const hit: HitInfo = { dmg: rng.float(5, 9), kinds: ['bruise', 'scratch', 'laceration'], corrupt: 0.05, height: 1.4, knock: 0, from: [c.x, c.z], grab: true, by: 'surveyor' };
      if (p.isLocal) applyHitToPlayer(p, hit); else G.net?.sendHurt?.(p.id, hit);
    }
    return true;
  }
  if (!near || near.d > 26) {
    // nobody: a slow wrong walk through the dark with its light on, talking to no one
    n.lamp = 1;
    if (c.state !== 'wander' || !c.goal) { c.setState('wander'); c.goal = cs.wanderSpot(c, z, 12); m.back = rng.chance(0.3); }
    if (cs.moveTo(c, z, c.goal!.x, c.goal!.z, c.sp.walk, dt, 0.8) || c.stateT > 25) c.goal = cs.wanderSpot(c, z, 12);
    if (m.back && c.speed > 0) c.targetFacing = Math.atan2(c.vz, c.vx) + Math.PI; // walking backwards, the legs still stepping forwards
    if (m.radT <= 0) { m.radT = rng.float(18, 34); if (near) radio(c); }
    return true;
  }
  const p = near.p, d = near.d;
  if (c.state === 'flee') {
    n.lamp = 0;
    if (!c.goal || cs.moveTo(c, z, c.goal.x, c.goal.z, c.sp.run, dt, 0.8) || c.stateT > 6) { c.setState('wander'); c.goal = null; }
    return true;
  }
  // close: the light goes out, it waits a heartbeat, then it comes
  if (d < 6.5 || c.state === 'chase') {
    if (c.state !== 'chase' && c.state !== 'warn') { c.setState('warn'); n.lamp = 0; m.radT = 99; playAt('surveyor_radio', c, 0.6, 12); }
    if (c.state === 'warn') { hold(c); face(c, p.x, p.z); if (c.stateT > 1.4 || d < 2.2) { c.setState('chase'); playAt('surveyor_scream', c, 1, 26); } return true; }
    const reach = c.sp.attack!.range + p.radius;
    if (d <= reach && c.attackT <= 0) { m.grabNext = true; cs.startAttack(c, p); m._atkAt = G.time; return true; }
    if (d > 16 || c.stateT > 18) { c.setState('flee'); c.goal = pickReach(z, c.x, c.z, (x, zz, st) => (st > 30 ? null : (dark(z, x, zz) ? 2 : 0) + Math.hypot(x - p.x, zz - p.z) * 0.2), 600); return true; }
    cs.moveTo(c, z, p.x, p.z, c.sp.run, dt, reach * 0.8);
    return true;
  }
  // the lure: light on, standing where you can see it, calling; it backs away into the dark as you come
  c.setState('watch');
  n.lamp = 1;
  if (d < 12 && lineOfSightB(z, c.x, c.z, p.x, p.z)) {
    const s = m.lureTo && dist(m.lureTo, c) > 0.6 ? m.lureTo : (m.lureTo = pickReach(z, c.x, c.z, (x, zz, st) => (st < 3 || st > 10 ? null : (dark(z, x, zz) ? 2 : 0) + Math.hypot(x - p.x, zz - p.z) * 0.3), 300));
    if (s) { cs.moveTo(c, z, s.x, s.z, c.sp.walk, dt, 0.5); c.targetFacing = Math.atan2(p.z - c.z, p.x - c.x); }
    else { hold(c); face(c, p.x, p.z); }
  } else { hold(c); face(c, p.x, p.z); m.lureTo = null; }
  if (m.radT <= 0) { m.radT = rng.float(9, 16); radio(c); }
  return true;
}
function endDrag(c: Creature) {
  const n = net(c);
  c.mem.drag = undefined; n.drag = null;
  c.setState('flee');
  c.goal = G.creatures.fleeSpot(c, G.getZone(c.zoneKey), c.x, c.z);
  c.attackT = 6;
}
const S = def({
  key: 'surveyor', name: 'Surveyor', code: 'SV-04 // SUIT, OCCUPIED', temperament: 'ambush', threat: 4,
  rule: { name: 'WHEN THE LAMP GOES OUT', text: 'Its light is bait. Keep your distance; when its lamp goes dark, it is coming. Run.' },
  hp: 80, walk: 0.85, run: 3.9, turn: 4, radius: 0.32, height: 1.9, sight: 20, fov: 1.3, hearing: 1.4, nightVision: true,
  attack: { dmg: [7, 12], range: 1.0, cooldown: 2.0, kinds: ['bruise', 'laceration'], corrupt: 0.05, knock: 0.3, grab: true, parts: ['uarm_l', 'uarm_r', 'torso_u', 'neck'] },
  zones: ['tunnels', 'lab', 'pools', 'lobby', 'parking', 'fields', 'office'], weight: 1, maxPerZone: 2, diet: 'none',
  sounds: snd({ attack: 'surveyor_scream', death: 'surveyor_die', step: 'step_concrete', loop: 'surveyor_breath' }),
  scan: {
    cls: 'Occupied protective suit',
    notes: [
      'A 1990 survey-team hazmat suit with its tether rope still attached. The rope is not tied to anything.',
      'Something else is wearing it. The visor is fogged from the inside.',
      'It keeps its light on so you will see it, and it talks on the radio in a voice that is nearly words.',
      'When you get close, the light goes out. Then it comes for you and drags you backwards into the dark.',
      'Hit it to make it let go. Do not follow the rope.',
    ],
  },
  gore: { blood: 'dark', tint: 0x2a2420, flesh: 0xc89a2a, sever: ['armL', 'armR', 'foreL', 'foreR', 'thighL', 'thighR', 'shinL', 'shinR'], head: 'head' },
  build: buildSurveyor,
  animate: animateSurveyor,
  think: thinkSurveyor,
});
defDread('surveyor', { tilt: 'head', tiltMax: 0.9, twitch: ['head', 'armL'], twitchRate: 0.25, sting: 'hit', cam: 0.8, flick: 7 });
(S as any).animateGallery = (rig: Rig, t: number) => {
  const q = new URLSearchParams(location.search).get('pose') || '';
  const c = fakeCreature(S, { id: 'g2', state: 'wander', speed: q === 'walk' ? 0.9 : 0, phase: t * 4, attackPhase: q === 'attack' ? 0.05 : 0, mem: { netMem: { lamp: q === 'dark' ? 0 : 1, vis: q === 'face' ? 1e9 : 0, drag: null } } });
  c.x = 5; c.z = 5;
  animateSurveyor(rig, c, t, 1 / 60);
};
void TAPE_UNUSED;
function TAPE_UNUSED() { return 0; }

// the horror layer: faceted wet materials, twitches, ragged breathing, lunges, recoils, a weighted death
horrify(S, { twitch: 0.5, snap: 0.3 });
