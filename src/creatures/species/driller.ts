import * as THREE from 'three';
import { def, Rig } from '../species';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import { op } from '../../game/ops';
import { ModelBuilder } from '../../gfx/modelBuilder';
import { worldMaterial } from '../../gfx/materials';
import { makeRamp, mixHex } from '../../gfx/pixel';
import { atlas } from '../../gfx/atlas';
import { HumanRig, SKIN_TONES, type Appearance, type Outfit, type Pose as HPose } from '../../entities/humanRig';
import type { Creature } from '../creature';
import type { Player } from '../../entities/player';
import { CS, zoneOf, pulse, stop, faceTo, attack, onPlayerHit } from '../behaviors_a';
import { net, netOf, playAt, hashId, rng, localIn, thinkOnce, dist, playersIn, fx, fxPoll } from '../behaviors_b';
import { KitDef, KitRig, BoneSpec, SkinB, BuildCtx, Page, V3, Wt, buildKitRig, kitSync, hash, flinchOf, clamp01 } from '../kit/humanoids';
import { sac, paintSkin, paintCap } from '../kit/organic';
import { KINDS } from '../../gore/kinds';
import { tgOf, hungerOf, feed, verdict, provoked, type Disposition } from '../temper';

// =====================================================================================
// THE DRILLER — a person the place rebuilt around a mouth. It was one of the
// Institute's excavation debtors, sent down with a pick to dig a way through to the
// lower levels; the place rewarded the digging. The jaw grew. The lower face is
// gone into a mandible as wide as the shoulders, ringed with drill-bit teeth that
// are grooved in a spiral, and behind them a ring of seven long teeth that turn in
// the gums like the head of a core drill. It lives under the floor. It opens its
// jaw against the carpet, the ring spins, and it corkscrews down through the slab
// and travels under the levels: a heaving ripple of broken floor, a trail of cracks
// and grit. It hears footsteps through the floor. It comes up underneath what it
// hears, bites, and goes back down. It eats people: the dead, the downed, and you.
// Fed, it lets a quiet unit pass over it; hungry, it hunts any footstep.
//   driller      the one human base (HumanRig: same body, face and paint as every unit),
//                its neck and shoulders grown thick; the jaw is a skinned kit rig grown out
//                of the face on the head bone (organic lofts: gums, enamel, the drill ring)
// POSTER / VIDEO API (stand-alone, no game needed):
//   buildDriller(variant 0..2)                         -> DrillerRig (rig.root into any scene; rig.hr is the HumanRig)
//   poseDriller(rig, t, dt, pose, { out, speed, jaw, spin, floor })
//     pose: 'burrow' | 'emerge' | 'warn' | 'bite' | 'eat' | 'crawl' | 'idle' | 'dive' | 'dead'
//     out (0..1) overrides how far it is out of the floor; floor: a floor texture key for the rubble
//   The body sinks below y = 0 (the floor hides it); the rubble ring and the travelling mound
//   are on rig.root, so stage it on a floor.
// =====================================================================================

const SIDES = [['L', 1], ['R', -1]] as const;
const NT = 8;          // teeth along each side of each jaw
const ND = 7;          // the drill ring
const PEOPLE: { app: Appearance; outfit: Outfit }[] = [
  { app: { skin: SKIN_TONES[1], hair: 0x1c1612, hairStyle: 'bald', face: 2, build: 'broad', height: 1.02, bodyShape: 0.1, eyeColor: 0x3a2a1a, facialHair: 'stubble', freckles: 0.1, scars: 2, age: 0.5 },
    outfit: { torso: { tex: 'c_bare', color: SKIN_TONES[1] }, legs: { tex: 'c_jeans', color: 0x4a4434 }, legsKind: 'pants', cond: { dirt: 3, pale: 2, expr: '', blood: { hand_l: 3, hand_r: 3, farm_l: 2, farm_r: 2, torso: 2, head: 2 } } } },
  { app: { skin: SKIN_TONES[3], hair: 0x0e0c0a, hairStyle: 'buzz', face: 6, build: 'slim', height: 0.97, bodyShape: 0.75, eyeColor: 0x2a1a10, facialHair: 'none', freckles: 0, scars: 2, age: 0.35 },
    outfit: { torso: { tex: 'c_bare', color: SKIN_TONES[3] }, legs: { tex: 'c_slacks', color: 0x2e3436 }, legsKind: 'pants', cond: { dirt: 3, pale: 1, expr: '', blood: { hand_l: 3, hand_r: 3, farm_r: 2, torso: 1, head: 3 } } } },
  { app: { skin: SKIN_TONES[0], hair: 0x8a8478, hairStyle: 'bald', face: 9, build: 'broad', height: 1.0, bodyShape: 0.2, eyeColor: 0x5a6a6a, facialHair: 'beard', freckles: 0.4, scars: 2, age: 0.8 },
    outfit: { torso: { tex: 'c_bare', color: SKIN_TONES[0] }, legs: { tex: 'c_sweatpants', color: 0x5a5448 }, legsKind: 'pants', cond: { dirt: 3, pale: 3, expr: '', blood: { hand_l: 2, hand_r: 3, farm_l: 1, torso: 2, head: 2 } } } },
];

// ------------------------------------------------------------------ the jaw: a skinned kit rig on the head bone
function bonesJ(v: number): BoneSpec[] {
  const s = 1 + v * 0.05;
  return [
    { name: 'base', parent: '', at: [0, 0, 0] },
    { name: 'maw', parent: 'base', at: [0, 0.06, 0.03 * s], cap: true },
    { name: 'jaw', parent: 'base', at: [0, -0.015, -0.01] },
    { name: 'drill', parent: 'base', at: [0, 0.015, 0.25 * s] },
    { name: 'tongue', parent: 'jaw', at: [0, 0.02, 0.06] },
  ];
}
function layoutJ(p: Page) { p.reg('JAW', 64, 48); p.reg('LOW', 64, 32); p.reg('GUM', 32, 32); p.reg('TOOTH', 16, 32); p.reg('DRILL', 16, 32); p.reg('TONGUE', 16, 16); p.reg('CAP', 8, 8); }
/** the rim of each jaw: half-width and height at z (jaw space) */
const upW = (z: number, s: number) => (0.075 + 0.08 * Math.sin(Math.min(1, z / 0.36) * Math.PI * 0.85)) * s;
function buildJ(B: SkinB, x: BuildCtx) {
  const bi = x.bi, R = x.R, s = 1 + x.variant * 0.05;
  const wM: Wt = [bi('maw'), 1], wJ: Wt = [bi('jaw'), 1], wB: Wt = [bi('base'), 1], wD: Wt = [bi('drill'), 1];
  // the upper jaw: the maxilla pushed out into a broad, heavy snout grown over the nose and the cheeks
  const up: V3[] = [], ur: [number, number][] = [], uw: Wt[] = [];
  for (let i = 0; i <= 7; i++) {
    const t = i / 7, z = (-0.02 + t * 0.32) * s;
    up.push([0, (0.07 - t * 0.03) * s, z]);
    const w = upW(Math.max(0, z), s) * 0.86 * (t > 0.92 ? 0.55 : 1), h = (0.05 - t * 0.016) * s * (t > 0.92 ? 0.7 : 1);
    ur.push([w, h]);
    uw.push(t < 0.12 ? [bi('base'), 0.6, bi('maw'), 0.4] : wM);
  }
  sac(B, R('JAW'), 1, up, ur, uw, { n: 16, bump: (a, t) => (Math.abs(Math.abs(a) - 1.4) < 0.25 ? 0.06 : 0) + (hash(Math.round(a * 5), Math.round(t * 12)) < 0.1 ? -0.04 : 0) + Math.sin(a * 6 + t * 9) * 0.02 - (a < -0.6 && a > -2.5 ? 0.12 : 0) });
  // the lower jaw: a mandible as wide as the shoulders, slung under the face like a bucket
  const lo: V3[] = [], lr: [number, number][] = [], lw: Wt[] = [];
  for (let i = 0; i <= 7; i++) {
    const t = i / 7, z = (-0.03 + t * 0.45) * s;
    lo.push([0, (-0.04 - Math.sin(t * Math.PI) * 0.025 + t * t * 0.03) * s, z]);
    const w = upW(Math.max(0, z), s) * 1.12 * (t > 0.92 ? 0.7 : 1), h = (0.042 + t * 0.012) * s * (t > 0.92 ? 0.75 : 1);
    lr.push([w, h]);
    lw.push(t < 0.1 ? [bi('base'), 0.4, bi('jaw'), 0.6] : wJ);
  }
  sac(B, R('LOW'), 2, lo, lr, lw, { n: 16, bump: (a, t) => (Math.abs(a) > 2.6 ? 0.08 : 0) + Math.sin(a * 5 + t * 7) * 0.025 - (a > 0.6 && a < 2.5 ? 0.14 : 0) });
  // teeth: thick grooved pegs along both rims, longest at the front; the upper row points down, the lower up
  const tooth = (root: V3, dir: V3, L: number, r0: number, w: Wt, reg: string, g: number) => {
    sac(B, R(reg), g, [root, [root[0] + dir[0] * L * 0.5, root[1] + dir[1] * L * 0.5, root[2] + dir[2] * L * 0.5], [root[0] + dir[0] * L, root[1] + dir[1] * L, root[2] + dir[2] * L]],
      [[r0, r0], [r0 * 0.72, r0 * 0.72], [0.002, 0.002]], [w, w, w], { n: 6, bump: (a, t) => Math.sin(a * 2 + t * 9) * 0.12 });
  };
  for (const [, k] of SIDES) {
    for (let i = 0; i < NT; i++) {
      const t = (i + 0.5) / NT, z = (0.04 + t * 0.24) * s, w = upW(z, s) * 0.86 * 0.88;
      const Lt = (0.045 + t * 0.035 + hash(i, k + 3) * 0.015) * s;
      tooth([k * w, (0.07 - t * 0.026) * s - 0.04 * s, z], [k * 0.15, -1, 0.15], Lt, 0.015 * s, wM, 'TOOTH', 3);
      const zl = (0.05 + t * 0.34) * s, tl = zl / (0.45 * s);
      tooth([k * upW(zl, s) * 1.12 * 0.9, (-0.04 - Math.sin(tl * Math.PI) * 0.025 + tl * tl * 0.03) * s + 0.035 * s, zl], [k * 0.18, 1, 0.12], Lt * 1.1, 0.016 * s, wJ, 'TOOTH', 3);
    }
  }
  // the front: tusks across the snout tip
  for (let i = 0; i < 4; i++) {
    const xx = (-0.045 + i * 0.03) * s;
    tooth([xx * 0.9, 0.04 * s, 0.3 * s], [0, -0.85, 0.5], 0.06 * s, 0.013 * s, wM, 'TOOTH', 3);
    // the underbite: tusks from the front of the mandible, up past the snout
    tooth([xx * 1.25, -0.0 * s, 0.41 * s], [0, 0.9, 0.35], (0.08 + (i === 1 || i === 2 ? 0.03 : 0)) * s, 0.018 * s, wJ, 'TOOTH', 3);
  }
  // the drill: a collar of gum round the throat end of the mouth, and seven long spiral-grooved teeth in it,
  // raked forward to a point like the bit of a core drill; the collar and the teeth turn together
  const D = x.rest('drill');
  sac(B, R('GUM'), 4, [[D[0], D[1], D[2] - 0.07 * s], [D[0], D[1], D[2] - 0.02 * s], [D[0], D[1], D[2] + 0.02 * s]],
    [[0.05 * s, 0.05 * s], [0.085 * s, 0.085 * s], [0.07 * s, 0.07 * s]], [wB, wD, wD], { n: 12, bump: (a) => Math.sin(a * ND) * 0.08 });
  for (let i = 0; i < ND; i++) {
    const a = (i / ND) * Math.PI * 2;
    const r0 = 0.062 * s, root: V3 = [D[0] + Math.cos(a) * r0, D[1] + Math.sin(a) * r0, D[2] + 0.01];
    const tip: V3 = [D[0] + Math.cos(a + 0.5) * 0.012, D[1] + Math.sin(a + 0.5) * 0.012, D[2] + 0.17 * s];
    const mid: V3 = [(root[0] + tip[0]) / 2 + Math.cos(a + 1.2) * 0.012, (root[1] + tip[1]) / 2 + Math.sin(a + 1.2) * 0.012, (root[2] + tip[2]) / 2];
    sac(B, R('DRILL'), 5, [root, mid, tip], [[0.02 * s, 0.016 * s], [0.014 * s, 0.011 * s], [0.002, 0.002]], [wD, wD, wD], { n: 6, bump: (q, t) => Math.sin(q * 2 + t * 14) * 0.18 });
  }
  // a thick tongue lying in the lower jaw
  const T0 = x.rest('tongue');
  sac(B, R('TONGUE'), 6, [[0, T0[1], T0[2] - 0.04], [0, T0[1] + 0.01, T0[2] + 0.06], [0, T0[1] - 0.005, T0[2] + 0.15]], [[0.04 * s, 0.018], [0.045 * s, 0.02], [0.02 * s, 0.01]],
    [[bi('tongue'), 1], [bi('tongue'), 1], [bi('tongue'), 1]], { n: 8 });
}
function paintJ(p: Page, x: BuildCtx) {
  const v = x.variant, P = PEOPLE[v % PEOPLE.length];
  const skin = mixHex(P.app.skin, 0x6a5a50, 0.45);
  const RS = makeRamp(skin, 8, { hueShift: 0.04, spread: 0.55 });
  for (const [n, seed] of [['JAW', 11], ['LOW', 13]] as const) {
    const r = p.R(n);
    paintSkin(r, RS, { seed: seed + v, veins: 10, vein: mixHex(skin, 0x5a3a5a, 0.5), mottle: 2.2, glint: 10 });
    // stretch marks: pale striations running back from the snout, where the skin had to grow to cover it
    for (let i = 0; i < 26; i++) { const xx = hash(i, seed) * r.w, yy = hash(i + 3, seed) * r.h; r.line(xx, yy, xx + (hash(i, 7) - 0.5) * 3, yy + 4 + hash(i, 9) * 6, mixHex(skin, 0xf0e4dc, 0.55), 0.55); }
    // grime ground into it and old blood round the lips (the rim is the side facing the mouth)
    for (let yy = 0; yy < r.h; yy++) for (let xx = 0; xx < r.w; xx++) {
      const d = Math.abs(r.deg(xx));
      const lip = n === 'JAW' ? Math.max(0, 1 - Math.abs(d - 135) / 45) : Math.max(0, 1 - Math.abs(d - 45) / 45);
      if (lip > 0 && hash(xx * 3, yy * 5 + seed) < lip * 0.75) r.blend(xx, yy, hash(xx, yy) < 0.5 ? 0x5a0c0e : 0x7a1a16, 0.55 * lip);
      const gr = r.fbm(xx, yy, 4, 2, seed + 40); if (gr > 0.5) r.blend(xx, yy, 0x2a2018, Math.min(0.7, (gr - 0.5) * 2.4));
      if (d > 150 && n === 'LOW') r.blend(xx, yy, 0x1a1210, 0.4);
    }
  }
  // gums: wet, ridged, dark red going to purple where the teeth sit
  const g = p.R('GUM');
  g.fill(makeRamp(0x9a2a34, 7, { spread: 0.6 }), (xx, yy) => 3.2 + Math.sin((g.deg(xx) * Math.PI / 180) * ND * 2) * 1.2 + (g.fbm(xx, yy, 3, 2, 5) - 0.5) * 1.4 - yy / g.h);
  for (let i = 0; i < 12; i++) g.blend(hash(i, 2) * g.w, hash(i, 3) * g.h, 0xffd0d0, 0.7);
  // teeth: yellowed enamel, a spiral groove cut down each one, brown at the root, chipped white at the tip
  const enamel = makeRamp(0xd8c8a0, 7, { hueShift: -0.03, spread: 0.5 });
  for (const [n, k] of [['TOOTH', 1.2], ['DRILL', 2.2]] as const) {
    const r = p.R(n);
    r.fill(enamel, (xx, yy) => {
      const groove = ((xx / r.w) * 3 + (yy / r.h) * k * 3) % 1;
      return 3.6 + Math.cos(r.deg(xx) * Math.PI / 180) * 1.3 - (groove < 0.22 ? 2.6 : 0) - (yy / r.h) * 1.4 + (hash(xx, yy) - 0.5) * 0.6;
    }, undefined, 0.5);
    for (let yy = Math.floor(r.h * 0.75); yy < r.h; yy++) for (let xx = 0; xx < r.w; xx++) r.blend(xx, yy, 0x5a3a1a, 0.35 + (yy / r.h - 0.75) * 1.5);
    for (let xx = 0; xx < r.w; xx++) { r.blend(xx, 0, 0xfff8e8, 0.7); if (hash(xx, 5) < 0.4) r.blend(xx, 1, 0x7a1a16, 0.6); }
  }
  const tg = p.R('TONGUE');
  tg.fill(makeRamp(0xa04a58, 6), (xx, yy) => 2.8 + Math.cos(tg.deg(xx) * Math.PI / 180) * 1.0 + (hash(xx * 2, yy) - 0.5) * 1.1);
  paintCap(p.R('CAP'), skin, 0x8a2228, 0xe8dcc8);
}
const JAW_KIT: KitDef = { key: 'driller_jaw', variants: 3, W: 128, H: 192, bones: bonesJ, layout: layoutJ, build: buildJ, paint: paintJ, sphere: [0, 0, 0.18, 0.4] };

// ------------------------------------------------------------------ the floor: rubble round the hole, and the travelling mound
const RUBBLE = new Map<string, THREE.BufferGeometry>();
function rubbleGeo(tex: string, mound: boolean): THREE.BufferGeometry {
  const k = tex + (mound ? ':m' : ':r');
  let g = RUBBLE.get(k);
  if (g) return g;
  const mb = new ModelBuilder();
  const N = mound ? 11 : 14;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + hash(i, 3) * 0.4, r = mound ? 0.12 + hash(i, 4) * 0.32 : 0.5 + hash(i, 4) * 0.22;
    const w = 0.12 + hash(i, 5) * 0.16, d = 0.1 + hash(i, 6) * 0.14, h = 0.035 + hash(i, 7) * 0.03;
    mb.push().translate(Math.cos(a) * r, (mound ? 0.05 + (0.44 - r) * 0.35 : 0.02) + h * 0.5, Math.sin(a) * r).rotateY(a + hash(i, 8)).rotateX((hash(i, 9) - 0.5) * (mound ? 1.1 : 0.7)).rotateZ((hash(i, 10) - 0.5) * 0.9);
    mb.box(0, 0, 0, w, h, d, tex, { uvScale: 0.5 });
    mb.box(0, -h * 0.5 - 0.01, 0, w * 0.92, 0.02, d * 0.92, 'parking', { color: 0x8a8278 });
    mb.pop();
  }
  // grit
  for (let i = 0; i < (mound ? 18 : 22); i++) {
    const a = hash(i, 21) * Math.PI * 2, r = (mound ? 0.05 : 0.45) + hash(i, 22) * (mound ? 0.4 : 0.4);
    mb.box(Math.cos(a) * r, 0.015, Math.sin(a) * r, 0.03 + hash(i, 23) * 0.03, 0.025, 0.03 + hash(i, 24) * 0.03, 'parking', { color: 0x6a645a });
  }
  if (!mound) mb.cylinder(0, 0.004, 0, 0.46, 0.01, 14, 'white', { color: 0x0c0a08 });
  else mb.cylinder(0, 0.004, 0, 0.16, 0.012, 10, 'white', { color: 0x16120e });
  g = mb.build();
  RUBBLE.set(k, g);
  return g;
}
const floorTexAt = (c: { x: number; z: number; zoneKey: string }) => {
  try { const t = zoneOf(c as Creature).floorAt(Math.floor(c.x), Math.floor(c.z))?.tex?.[0]; if (t && atlas().has(t)) return t; } catch { /* the gallery has no zone */ }
  return 'carpet_yellow';
};

// ------------------------------------------------------------------ the rig
export interface DrillerRig extends Rig { hr: HumanRig; jaw: KitRig; ring: THREE.Mesh; mound: THREE.Mesh; v: number; m: Record<string, any>; floor: string }
const POOL: DrillerRig[] = [];
const RMAT = () => worldMaterial({});
function newRig(v: number): DrillerRig {
  const P = PEOPLE[v % PEOPLE.length];
  const hr = new HumanRig(P.app, worldMaterial({}));
  hr.setOutfit(P.outfit);
  hr.setExpression('sleepy');
  (hr.skin as any).clone = () => new THREE.Group();
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body); body.add(hr.root);
  // the shared base, mutated: a thick, long neck carrying the head forward, heavy shoulders, long arms
  hr.j.neck.scale.setScalar(1.32); hr.j.head.scale.setScalar(0.86);
  hr.j.chest.scale.setScalar(1.08); hr.j.uarmL.scale.setScalar(1.1); hr.j.uarmR.scale.setScalar(1.1);
  const jaw = buildKitRig(JAW_KIT, v, 0.2);
  jaw.root.position.set(0, 0.03, 0.03); jaw.root.scale.setScalar(0.88);
  hr.j.head.add(jaw.root);
  const ring = new THREE.Mesh(rubbleGeo('carpet_yellow', false), RMAT()); ring.receiveShadow = true; ring.visible = false;
  const mound = new THREE.Mesh(rubbleGeo('carpet_yellow', true), RMAT()); mound.castShadow = true; mound.receiveShadow = true; mound.visible = false;
  for (const m of [ring, mound]) (m as any).clone = () => new THREE.Group();
  root.add(ring, mound);
  const R: DrillerRig = { root, body, parts: { ...hr.j, jaw: jaw.parts.jaw, maw: jaw.parts.maw, drill: jaw.parts.drill }, headY: 1.0, hr, jaw, ring, mound, v, m: {}, floor: 'carpet_yellow' };
  return R;
}
function setFloor(R: DrillerRig, tex: string) {
  if (R.floor === tex) return;
  R.floor = tex;
  R.ring.geometry = rubbleGeo(tex, false); R.mound.geometry = rubbleGeo(tex, true);
}
function buildPooled(): Rig {
  for (const r of POOL) if (!r.root.parent) { r.root.userData = {}; r.root.position.set(0, 0, 0); r.root.rotation.set(0, 0, 0); r.root.scale.set(1, 1, 1); r.body.visible = true; r.m = {}; return r; }
  const r = newRig(0); POOL.push(r); return r;
}
/** a Driller (variant 0..2: who it was), not pooled: for staging, posters, the video */
export function buildDriller(variant = 0): DrillerRig { return newRig(((variant % 3) + 3) % 3); }

// ------------------------------------------------------------------ the pose
export type DrillerPose = 'burrow' | 'emerge' | 'warn' | 'bite' | 'eat' | 'crawl' | 'idle' | 'dive' | 'dead';
export interface DrillerDrive { t: number; dt: number; md: DrillerPose; speed: number; out: number; walk: number; bite: number; flinch: number; seed: number }
const sm = (ud: Record<string, number>, k: string, to: number, rate: number, dt: number) => (ud[k] = (ud[k] ?? to) + (to - (ud[k] ?? to)) * Math.min(1, dt * rate));
const set = (p: HPose, j: keyof HPose, x: number, y = 0, z = 0) => { (p as any)[j] = [x, y, z]; };
const mixP = (a: HPose, b: HPose, k: number): HPose => {
  const o: any = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const va = (a as any)[key], vb = (b as any)[key];
    if (Array.isArray(va) || Array.isArray(vb)) { const x = va ?? [0, 0, 0], y = vb ?? [0, 0, 0]; o[key] = [x[0] + (y[0] - x[0]) * k, x[1] + (y[1] - x[1]) * k, x[2] + (y[2] - x[2]) * k]; }
    else o[key] = (va ?? 0) + ((vb ?? 0) - (va ?? 0)) * k;
  }
  return o as HPose;
};
/** half out of its hole: braced on its arms on the rim, the head low and forward */
function holePose(t: number, d: DrillerDrive, warn: number, eat: number, bite: number): HPose {
  const P: HPose = {};
  const breathe = Math.sin(t * 1.6 + d.seed) * 0.04;
  P.bodyPitch = 0.32 - warn * 0.3 + eat * 0.55 + bite * 0.55 + breathe;
  set(P, 'spine', 0.18 + eat * 0.15 + bite * 0.1, Math.sin(t * 0.9) * 0.06, 0);
  set(P, 'chest', 0.12 - warn * 0.2, 0, Math.sin(t * 0.7) * 0.04);
  set(P, 'neck', -0.2 - warn * 0.3 + eat * 0.3, warn * Math.sin(t * 7) * 0.25, 0);
  set(P, 'head', -0.45 - warn * 0.45 + eat * 0.25 - bite * 0.3, warn * Math.sin(t * 9 + 1) * 0.3 + eat * Math.sin(t * 2.2) * 0.2, warn * Math.sin(t * 5) * 0.12);
  // arms: planted on the floor either side of the hole, or flung wide in the threat display, or reaching for a bite
  const spread = warn * 0.9;
  set(P, 'uarmL', -1.25 - bite * 0.6 + eat * 0.2, 0.25, 0.45 + spread); set(P, 'uarmR', -1.25 - bite * 0.6 + eat * 0.2, -0.25, -0.45 - spread);
  set(P, 'farmL', -0.55 + spread * 0.3, 0, 0); set(P, 'farmR', -0.55 + spread * 0.3, 0, 0);
  set(P, 'handL', 0.6, 0, 0.2); set(P, 'handR', 0.6, 0, -0.2);
  set(P, 'thighL', -0.4, 0, 0.1); set(P, 'thighR', -0.35, 0, -0.1); set(P, 'shinL', 0.8, 0, 0); set(P, 'shinR', 0.75, 0, 0);
  P.gripL = 0.85; P.gripR = 0.85;
  return P;
}
/** on the surface: a low bear-crawl on knuckles and feet, the jaw carried a hand's breadth off the floor */
function crawlPose(t: number, d: DrillerDrive, ph: number): HPose {
  const P: HPose = {};
  const go = clamp01(d.speed / 0.9), s = Math.sin(ph), c = Math.cos(ph);
  P.bodyPitch = 1.18; P.rootY = -0.08 + Math.abs(c) * 0.03 * go; P.bodyY = 0.02;
  set(P, 'spine', 0.12, s * 0.12 * go, 0); set(P, 'chest', 0.08, -s * 0.1 * go, 0);
  set(P, 'neck', -0.35, Math.sin(t * 0.8) * 0.2 * (1 - go), 0); set(P, 'head', -0.75 + Math.sin(t * 2.3) * 0.05, Math.sin(t * 1.1 + d.seed) * 0.25 * (1 - go), 0);
  set(P, 'uarmL', -1.2 + s * 0.45 * go, 0, 0.18); set(P, 'uarmR', -1.2 - s * 0.45 * go, 0, -0.18);
  set(P, 'farmL', -0.25 - Math.max(0, c) * 0.5 * go, 0, 0); set(P, 'farmR', -0.25 - Math.max(0, -c) * 0.5 * go, 0, 0);
  set(P, 'handL', 0.9, 0, 0); set(P, 'handR', 0.9, 0, 0);
  set(P, 'thighL', -1.05 - s * 0.4 * go, 0, 0.14); set(P, 'thighR', -1.05 + s * 0.4 * go, 0, -0.14);
  set(P, 'shinL', 0.95 + Math.max(0, s) * 0.5 * go, 0, 0); set(P, 'shinR', 0.95 + Math.max(0, -s) * 0.5 * go, 0, 0);
  set(P, 'footL', -0.3, 0, 0); set(P, 'footR', -0.3, 0, 0);
  P.gripL = 0.9; P.gripR = 0.9;
  return P;
}
/** drive the body, the jaw and the floor from a drive state (game and stand-alone share this) */
function poseD(R: DrillerRig, d: DrillerDrive) {
  const ud = R.m as Record<string, number>, t = d.t, dt = Math.min(0.05, Math.max(0, d.dt));
  const warn = sm(ud, 'wn', d.md === 'warn' ? 1 : 0, 6, dt), eat = sm(ud, 'ea', d.md === 'eat' ? 1 : 0, 4, dt), bite = sm(ud, 'bt', d.bite, 14, dt);
  const walk = d.walk, out = d.out, dead = d.md === 'dead' ? 1 : 0;
  ud.ph = (ud.ph ?? 0) + dt * (d.speed / 0.55) * Math.PI;
  let P = mixP(holePose(t, d, warn, eat, bite), crawlPose(t, d, ud.ph), walk);
  if (dead) { P = holePose(0, d, 0, 1, 0); P.bodyPitch = 1.35; set(P, 'head', 0.2, 0.4, 0.2); set(P, 'uarmL', -1.8, 0.5, 0.9); set(P, 'uarmR', -0.4, -0.2, -0.6); P.gripL = 0.2; P.gripR = 0.4; }
  if (d.flinch > 0) { P.rootX = (P.rootX ?? 0) + Math.sin(t * 70) * 0.03 * d.flinch; }
  R.hr.applyPose(P);
  R.hr.faceTick(dt);
  // how far out of the floor: chest-deep in the hole, all the way out to crawl
  const sink = (1 - out) * 1.85 + (1 - walk) * 1.0 * out;
  R.body.position.y = -sink + (dead ? 0.35 : 0);
  R.body.visible = out > 0.02;
  // the jaw: hangs a little open; gapes and works in the display; snaps on a bite; chews; slack when dead
  const J = R.jaw.parts, gape = dead ? 0.5 : Math.max(warn * (0.85 + Math.sin(t * 6) * 0.12), 0.32 + Math.sin(t * 1.3 + d.seed) * 0.08, eat * (0.35 + Math.abs(Math.sin(t * 7)) * 0.4), (1 - out) * 0.9);
  const snap = bite > 0.5 ? 0.85 * (1 - (bite - 0.5) * 2) : bite * 1.7;
  J.jaw.rotation.set(Math.max(0, gape, snap) * 0.75, 0, 0);
  J.maw.rotation.set(-Math.max(gape, snap) * 0.18, 0, 0);
  J.tongue.rotation.set(Math.sin(t * 3.1) * 0.15 * (1 - dead), 0, 0);
  const spin = dead ? 0 : d.md === 'burrow' || d.md === 'dive' ? 28 : warn > 0.3 ? 16 * warn : bite > 0.1 ? 22 : eat > 0.3 ? 9 : 1.5;
  ud.sp = (ud.sp ?? 0) + spin * dt;
  J.drill.rotation.set(0, 0, ud.sp);
  kitSync(R.jaw);
  // the hole: rubble round it while any of it is out; the mound heaving above it while it travels below
  R.ring.visible = out > 0.03 && walk < 0.5;
  R.ring.scale.setScalar(0.85 + out * 0.2);
  const travel = (1 - out) * (d.md === 'burrow' || d.md === 'dive' ? 1 : 0.3);
  R.mound.visible = travel > 0.05 && !dead;
  const heave = Math.abs(Math.sin(t * 9 + d.seed)) * clamp01(d.speed / 1.5) + 0.25;
  R.mound.scale.set(1 + heave * 0.12, 0.6 + heave * 0.7 * travel, 1 + heave * 0.12);
  R.mound.rotation.y = t * 0.6;
  R.mound.position.y = -0.02 + Math.sin(t * 13) * 0.012 * travel;
}

// ------------------------------------------------------------------ game animation (every peer)
function animateDriller(rig: Rig, c: Creature, t: number, dt: number) {
  const R = rig as DrillerRig, ud = R.m as Record<string, any>;
  const n = netOf(c), md = (c.dead ? 'dead' : (n.md as DrillerPose)) || 'burrow';
  // who it was
  const v = Math.floor(hashId(c.id) * 3);
  if (R.v !== v) { R.v = v; const P = PEOPLE[v]; R.hr.setAppearance(P.app); R.hr.setOutfit(P.outfit); }
  if (!ud.flt || t - ud.flt > 3) { ud.flt = t; setFloor(R, floorTexAt(c)); }
  const outT = md === 'burrow' || md === 'dive' ? 0 : md === 'warn' ? 0.82 : 1;
  const walkT = md === 'crawl' || md === 'idle' ? 1 : 0;
  ud.out = (ud.out ?? outT) + (outT - (ud.out ?? outT)) * Math.min(1, dt * (outT > (ud.out ?? 0) ? 4.5 : 2.4));
  ud.walk = (ud.walk ?? walkT) + (walkT - (ud.walk ?? walkT)) * Math.min(1, dt * 3);
  poseD(R, { t, dt, md, speed: c.speed, out: ud.out, walk: ud.walk, bite: c.attackPhase > 0 ? 1 - c.attackPhase / 0.38 : 0, flinch: flinchOf(c), seed: hashId(c.id, 2) * 6 });
  // the floor gives: grit kicked up behind the mound, a dull grinding under your feet
  const p = localIn(c);
  const near = p ? dist(p, c) : 99;
  if (!c.dead && md === 'burrow' && c.speed > 0.3 && near < 22) {
    ud.gT = (ud.gT ?? 0) - dt;
    if (ud.gT <= 0) {
      ud.gT = 0.22 + Math.random() * 0.15;
      const a = c.facing + Math.PI + (Math.random() - 0.5);
      G.gore?.bits?.(KINDS.plaster, 0xd8ccb0, c.x, 0.06, c.z, Math.cos(a), Math.sin(a), 2, 1.2);
    }
    ud.sT = (ud.sT ?? 0) - dt;
    if (ud.sT <= 0) { ud.sT = 1.1 + Math.random() * 0.5; playAt('dig', c, 0.35, 14, 0.7 + Math.random() * 0.15); if (near < 6) G.camera?.shake?.(0.05, 0.25); }
  }
  const f = fxPoll(R, c);
  if (f) {
    if (f.key === 'erupt') {
      for (let i = 0; i < 4; i++) { const a = Math.random() * Math.PI * 2; G.gore?.bits?.(KINDS.plaster, 0xd8ccb0, c.x, 0.1, c.z, Math.cos(a), Math.sin(a), 6, 3.2); }
      playAt('dmg_crumble', c, 1, 20, 0.85); playAt('hound_snarl', c, 0.9, 20, 0.55); playAt('sg_loop_drill', c, 0.7, 16, 0.8);
      if (near < 9) { G.camera?.shake?.(0.42, 0.45); G.camera?.punch?.(0.05, 0.4); }
      if (p && near < 10) thinkOnce(p, 'driller_up', ['The FLOOR— it came up through the floor—', 'Teeth. A whole ring of them, turning.', 'It was right under me the whole time.'][Math.floor(Math.random() * 3)], 30);
    } else if (f.key === 'dive') {
      for (let i = 0; i < 2; i++) { const a = Math.random() * Math.PI * 2; G.gore?.bits?.(KINDS.plaster, 0xd8ccb0, c.x, 0.08, c.z, Math.cos(a), Math.sin(a), 5, 2); }
      playAt('sg_loop_drill', c, 0.8, 16, 0.95); playAt('dig', c, 0.8, 16, 0.6);
    } else if (f.key === 'warn') {
      playAt('davenport_roar', c, 0.9, 22, 1.25); playAt('sg_loop_drill', c, 0.6, 16, 1.15);
      if (near < 12) G.camera?.shake?.(0.15, 0.4);
    } else if (f.key === 'chew') {
      playAt('tithe_chew', c, 0.8, 12); playAt('bone_crunch', c, 0.6, 12);
      G.gore?.jet?.(KINDS.red, 0xffffff, c.x + Math.cos(c.facing) * 0.6, 0.35, c.z + Math.sin(c.facing) * 0.6, Math.cos(c.facing + 1.6), Math.sin(c.facing + 1.6), 6, 1.6, 0.8, 1.0);
    }
  }
}

// ------------------------------------------------------------------ host brain
const D_DISP: Disposition = { mood: 'predator', territory: 7, warn: 2.4, calm: 6, hunger: { rate: 0.06, hunt: 0.45, sated: 0.12 }, self: true };
const HUMANLIKE = /^(hollow|strider|tribe_|seated|bee_keeper)/;
type Mode = 'roam' | 'hunt' | 'up' | 'warn' | 'feed' | 'eat' | 'breathe' | 'flee';
const setMd = (c: Creature, md: DrillerPose) => { const n = net(c); if (n.md !== md) n.md = md; };
/** it feels footsteps through the slab: running far, walking near, sneaking or standing still not at all */
function feels(c: Creature, p: Player): boolean {
  const d = dist(p, c);
  if (p.body.dead) return false;
  if (p.stance === 'sneak' || (p.speed ?? 0) < 0.35) return d < 1.2;
  return d < (p.running ? 16 : 8.5);
}
function crack(c: Creature, w = 1) {
  const m = c.mem;
  m.trail = (m.trail ?? 0) + 1;
  if (m.trail > 60) return;
  op('decal', { z: c.zoneKey, d: { x: c.x, z: c.z, w, d: w, rot: c.facing + (Math.random() - 0.5), tex: 'decal_crack', y: 0.012 } });
}
function underground(c: Creature, on: boolean) { const n = net(c); n.ceil = on ? 1 : 0; }

function thinkDriller(c: Creature, dt: number): boolean {
  const cs = CS(), z = zoneOf(c), m = c.mem, n = net(c), ev = pulse(c), tg = tgOf(c);
  if (!m.init) { m.init = 1; m.mode = 'roam'; setMd(c, 'burrow'); underground(c, true); m.coolUp = G.time + 10 + rng.next() * 20; }
  let mode: Mode = m.mode;
  m.mT = (m.mT ?? 0) + dt;
  const go = (md: Mode) => { if (m.mode !== md) { m.mode = md; m.mT = 0; } mode = md; };
  c.mem.hunger = Math.min(1, hungerOf(c) + (D_DISP.hunger!.rate * dt) / 60);
  // the slab takes the blows while it is under it; above, a blow turns it on you (or sends it down, badly hurt)
  if (ev.hurt > 0) {
    if (n.md === 'burrow') { c.hp = Math.min(c.sp.hp, c.hp + ev.hurt); c.mem._hp = c.hp; }
    else { tg.prov = G.time + 20; if (c.hp < c.sp.hp * 0.3) { go('flee'); setMd(c, 'dive'); fx(c, 'dive'); } }
  }
  // the moving trail of cracks under it
  if (n.md === 'burrow' && c.speed > 0.2) { m.trD = (m.trD ?? 0) + c.speed * dt; if (m.trD > 1.6) { m.trD = 0; crack(c, 0.8 + rng.next() * 0.5); } }
  // who it can feel
  let prey: Player | null = null, pd = 99;
  for (const p of playersIn(c.zoneKey)) { const d = dist(p, c); if (d < pd && (feels(c, p) || (n.md !== 'burrow' && d < 7))) { pd = d; prey = p; } }
  switch (mode) {
    case 'flee': {
      c.setState('flee'); setMd(c, 'burrow'); underground(c, true);
      if (!c.goal || m.mT > 6) c.goal = cs.fleeSpot(c, z, prey?.x ?? c.x, prey?.z ?? c.z);
      if (cs.moveTo(c, z, c.goal.x, c.goal.z, c.sp.run * 0.8, dt, 0.8) || m.mT > 10) { go('roam'); c.goal = null; m.calm = G.time + 30; }
      return true;
    }
    case 'roam': {
      c.setState('hide'); setMd(c, 'burrow'); underground(c, true);
      // something to eat: the people the place leaves lying about
      if (hungerOf(c) > 0.3) {
        for (const o of cs.creatures.values()) if (o.dead && !o.butchered && o.zoneKey === c.zoneKey && HUMANLIKE.test(o.sp.key) && dist(o, c) < 14) { m.food = o.id; go('feed'); return true; }
      }
      if (prey && G.time > (m.calm ?? 0)) {
        const v = verdict(c, D_DISP, prey);
        if (v === 'attack') { m.pid = prey.id; go('hunt'); return true; }
        if (v === 'warn') { m.pid = prey.id; go('warn'); return true; }
      }
      // now and then it comes up to breathe, when nobody is close
      if (G.time > (m.coolUp ?? 0) && (!prey || pd > 9)) { go('breathe'); m.upFor = 4 + rng.next() * 4; fx(c, 'erupt'); return true; }
      if (!c.goal || cs.moveTo(c, z, c.goal.x, c.goal.z, c.sp.walk, dt, 0.7) || m.mT > 14) {
        const a = rng.next() * Math.PI * 2, r = 3 + rng.next() * 7;
        c.goal = { x: c.home.x + Math.cos(a) * r, z: c.home.z + Math.sin(a) * r }; m.mT = 0;
      }
      return true;
    }
    case 'hunt': {
      const p = m.pid ? (G.players.get(m.pid) as Player | undefined) : undefined;
      c.setState('stalk'); setMd(c, 'burrow'); underground(c, true);
      if (!p || p.body.dead || p.zoneKey !== c.zoneKey || dist(p, c) > 22) { go('roam'); return true; }
      if (!feels(c, p) && dist(p, c) > 1.4) { m.lost = (m.lost ?? 0) + dt; if (m.lost > 4) { m.lost = 0; go('roam'); if (p.isLocal) thinkOnce(p, 'driller_lost', 'The grinding under the floor has stopped. Keep still. Keep still.', 25); return true; } }
      else m.lost = 0;
      const d = dist(p, c);
      if (d < 1.25 && c.attackT <= 0) {
        // up through the floor under its prey, the jaw already open
        go('up'); setMd(c, 'emerge'); underground(c, false); fx(c, 'erupt'); crack(c, 1.9);
        faceTo(c, p.x, p.z, true); attack(c, p); tg.warnedAt = G.time;
        return true;
      }
      cs.moveTo(c, z, p.x, p.z, c.sp.run, dt, 0.6);
      return true;
    }
    case 'up': {
      c.setState('attack'); stop(c);
      const p = m.pid ? (G.players.get(m.pid) as Player | undefined) : prey;
      if (p && !p.body.dead && p.zoneKey === c.zoneKey) faceTo(c, p.x, p.z);
      // fed by a bite: the downed and the bleeding are food
      if (m.mT < 0.1) m.fedBite = 0;
      if (p && !m.fedBite && m.mT > 0.4 && dist(p, c) < 1.9 && p.body.health < (m.hpAt ?? 999)) { m.fedBite = 1; feed(c, 0.22); }
      if (m.mT < 0.1 && p) m.hpAt = p.body.health;
      if (p && m.mT > 1.4 && dist(p, c) < 1.9 && c.attackT <= 0 && (provoked(c) || hungerOf(c) > D_DISP.hunger!.sated! || p.body.downed)) { attack(c, p); m.mT = 0.5; fx(c, 'chew'); }
      if (m.mT > 2.6) { go(hungerOf(c) > 0.35 || provoked(c) ? 'hunt' : 'roam'); setMd(c, 'dive'); fx(c, 'dive'); m.calm = G.time + (hungerOf(c) > 0.35 ? 2 : 12); }
      return true;
    }
    case 'warn': {
      // it comes half out of the floor between you and where it was going: jaw wide, the ring screaming
      const p = m.pid ? (G.players.get(m.pid) as Player | undefined) : undefined;
      if (!p || p.body.dead || p.zoneKey !== c.zoneKey) { go('roam'); return true; }
      const d = dist(p, c);
      if (n.md === 'burrow' && d > 4.2) { c.setState('stalk'); cs.moveTo(c, z, p.x, p.z, c.sp.walk * 1.4, dt, 3.6); if (m.mT > 8) go('roam'); return true; }
      if (n.md !== 'warn') { setMd(c, 'warn'); underground(c, false); fx(c, 'erupt'); fx(c, 'warn'); m.mT = 0; m.d0 = d; tg.warnedAt = G.time; if (p.isLocal) bus.emit('think', p, ['It came up out of the floor and it is SCREAMING at me. Back off. Slowly.', 'That jaw. It is warning me. Do not run, it hears running.'][Math.floor(Math.random() * 2)]); }
      c.setState('warn'); stop(c); faceTo(c, p.x, p.z);
      if (provoked(c) || d < 1.6 || (m.d0 - d > 1.0 && m.mT > 0.6)) { go('hunt'); m.calm = 0; return true; }
      if (d > 7.5 || d - m.d0 > 2) { go('roam'); setMd(c, 'dive'); fx(c, 'dive'); m.calm = G.time + 14; if (p.isLocal) thinkOnce(p, 'driller_let', 'It went back down. It let me go.', 20); return true; }
      if (m.mT > 3.2) { if (hungerOf(c) >= D_DISP.hunger!.hunt) go('hunt'); else { go('roam'); setMd(c, 'dive'); fx(c, 'dive'); m.calm = G.time + 12; } }
      return true;
    }
    case 'feed': {
      const o = m.food ? cs.creatures.get(m.food) : null;
      if (!o || !o.dead || o.butchered) { go('roam'); return true; }
      c.setState('hide'); setMd(c, 'burrow'); underground(c, true);
      if (cs.moveTo(c, z, o.x, o.z, c.sp.walk * 1.3, dt, 0.7)) { go('eat'); setMd(c, 'eat'); underground(c, false); fx(c, 'erupt'); faceTo(c, o.x, o.z, true); }
      else if (m.mT > 20) go('roam');
      return true;
    }
    case 'eat': {
      c.setState('eat'); stop(c);
      const o = m.food ? cs.creatures.get(m.food) : null;
      if ((m.chewT = (m.chewT ?? 0) - dt) <= 0) { m.chewT = 1.3; fx(c, 'chew'); }
      // a footstep close by: it drops the meal and turns
      if (prey && pd < 3 && !provoked(c)) { m.pid = prey.id; go('warn'); return true; }
      if (m.mT > 9 || !o) {
        if (o && o.dead && !o.butchered) { o.butchered = true; CS().onButcher?.(o); }
        feed(c, 0.6); go('roam'); setMd(c, 'dive'); fx(c, 'dive'); m.coolUp = G.time + 30;
      }
      return true;
    }
    case 'breathe': {
      // up to its shoulders, the jaw lifted, tasting the air; down again the moment anything moves near
      c.setState('idle'); stop(c); setMd(c, 'emerge'); underground(c, false);
      c.targetFacing += Math.sin(G.time * 0.7 + hashId(c.id)) * dt * 0.6;
      if ((prey && pd < 7) || m.mT > (m.upFor ?? 5)) {
        go('roam'); setMd(c, 'dive'); fx(c, 'dive'); m.coolUp = G.time + 30 + rng.next() * 40;
        if (prey && pd < 7) { const v = verdict(c, D_DISP, prey); if (v !== 'ignore') { m.pid = prey.id; go(v === 'attack' ? 'hunt' : 'warn'); } }
      }
      return true;
    }
  }
  return true;
}

const DRILLER = def({
  key: 'driller', name: 'Driller', code: 'EX-09 // REMNANT, FOSSORIAL (FORMERLY HUMAN)', temperament: 'ambush', threat: 4,
  rule: { name: 'IT FEELS FOOTSTEPS', text: 'It lives under the floor and hunts what it feels through the slab. Running carries a long way; walking only close; a unit that sneaks, or stands still, is not there to it. Fed, it lets a quiet unit pass. When the floor heaves up in front of you and it screams, back away slowly: it is warning you off.', tell: 'A ripple of broken floor, moving. Grit jumping on the carpet. Something under it is grinding.' },
  hp: 150, walk: 1.2, run: 3.6, turn: 5, radius: 0.42, height: 1.2, sight: 7, fov: 1.6, hearing: 1.6,
  attack: { dmg: [18, 30], range: 1.5, cooldown: 1.6, kinds: ['bite', 'deep'], corrupt: 0, knock: 0.9, grab: true, parts: ['shin_l', 'shin_r', 'thigh_l', 'thigh_r', 'torso_l'] },
  zones: ['lobby', 'tunnels', 'undercroft', 'parking', 'depot', 'stairwell', 'server', 'corrupt'], weight: 1, group: [1, 1], maxPerZone: 2, diet: 'meat',
  meat: [['cut_gristle', 3]],
  disposition: D_DISP,
  vibration: true,
  sounds: { alert: 'hound_snarl', attack: 'gloam_bite', hurt: 'dog_growl', death: 'davenport_roar', idle: 'dig' },
  scan: {
    cls: 'Remnant / fossorial human',
    notes: [
      'Formerly human: an excavation debtor. The lower face has grown into a jaw as wide as the shoulders.',
      'Behind the rim teeth, a ring of seven spiral-grooved teeth turns in the gums like the bit of a core drill.',
      'It bores through floor slabs and travels under the level: a heaving mound, a trail of cracks and grit.',
      'It hunts by footsteps felt through the floor. Sneaking or standing still hides you. Running does not.',
      'Fed, it lets a quiet unit pass. It warns before it bites: it rears out of the floor, jaw open, screaming.',
      'It eats people. The dead first, the downed next.',
    ],
  },
  gore: { blood: 'red', flesh: 0xb04048, sever: ['uarmL', 'uarmR', 'farmL', 'farmR', 'handL', 'handR'], head: 'head', gib: false },
  build: buildPooled, animate: animateDriller, think: thinkDriller,
});
(DRILLER as any).handlesSevered = true;
onPlayerHit('driller', (p) => {
  bus.emit('think', p, ['It has my LEG— it bit straight through the boot—', 'The teeth are TURNING— it is drilling into me—', 'It is pulling me down into the hole—'][Math.floor(Math.random() * 3)]);
});
const GAL: DrillerPose[] = ['burrow', 'emerge', 'warn', 'bite', 'eat', 'crawl', 'dive'];
DRILLER.animateGallery = (rig: Rig, t: number) => {
  const q = (new URLSearchParams(location.search).get('pose') || GAL[Math.floor(t / 3.5) % GAL.length]) as DrillerPose;
  poseDriller(rig as DrillerRig, t, 1 / 60, q);
};

/** stand-alone pose (the VIDEO worker stages this): see the header for the pose names */
export function poseDriller(rig: DrillerRig, t: number, dt: number, pose: DrillerPose = 'emerge', o: { out?: number; speed?: number; jaw?: number; spin?: number; floor?: string } = {}) {
  const ud = rig.m as Record<string, any>;
  if (o.floor) setFloor(rig, o.floor);
  const outT = o.out ?? (pose === 'burrow' ? 0 : pose === 'dive' ? 0.5 + 0.5 * Math.cos(Math.min(1, (t % 3.5) / 1.5) * Math.PI) : pose === 'warn' ? 0.82 : 1);
  const walkT = pose === 'crawl' || pose === 'idle' ? 1 : 0;
  ud.out = o.out ?? ((ud.out ?? outT) + (outT - (ud.out ?? outT)) * Math.min(1, dt * 5));
  ud.walk = (ud.walk ?? walkT) + (walkT - (ud.walk ?? walkT)) * Math.min(1, dt * 4);
  const bite = pose === 'bite' ? ((t * 1.2) % 1) : 0;
  poseD(rig, { t, dt, md: pose, speed: o.speed ?? (pose === 'crawl' || pose === 'burrow' ? 1.2 : 0), out: ud.out, walk: ud.walk, bite, flinch: 0, seed: 1.3 });
  if (o.jaw !== undefined) rig.jaw.parts.jaw.rotation.x = o.jaw * 0.75;
}
