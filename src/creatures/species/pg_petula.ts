import { horrify } from '../kit/horror';
import { def, Rig } from '../species';
import { makeRamp, mixHex } from '../../gfx/pixel';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import type { Creature } from '../creature';
import type { Player } from '../../entities/player';
import { CS, zoneOf, pulse, attack, stop, faceTo, findSpot, onPlayerHit } from '../behaviors_a';
import { net, netOf, playAt, hashId, rng, localIn, thinkOnce, dist } from '../behaviors_b';
import { KitDef, KitRig, SkinB, BuildCtx, Page, V3, Wt, buildKitRig, kitSync, kitPersonalize, attackCurve, flinchOf, hash, gauss } from '../kit/humanoids';
import { chain, sac, plate, blade, paintCap, paintSkin } from '../kit/organic';
import { ruleShown } from '../rules';
import { absBones, say, linePoll, nearestUnit, seenBy, runs, donor, fold, graft, donorTick } from './pg_common';
import type { HumanRig } from '../../entities/humanRig';

// =====================================================================================
// PETULA — the sunflower who sang the songs on "Grow-Along with Petula" (Bright
// Hour Television, 1993-1997): a big puppet sunflower in a window box who
// taught the children to water things and turn their faces to the sun. What
// stands in the playground now is two and a half metres of real, hairy, living
// sunflower that walks on its roots. The petals are going brown at the tips.
// In the middle of the seed head, where the puppet had a painted smile, there is
// a baby's face: soft, plump and pink (the survivors' own human base, grown
// big and bald), with seeds packed up to its edges. Its face is always toward you.
// It never moves while anyone is looking at it. Look away and it comes,
// singing, and you can hear the song getting closer.
//   pg_petula   skinned kit rig: hairy stem, drooping leaves, six walking roots, a seed
//               disc, two rings of petals; the baby face is a HumanRig head (bald,
//               inflated, flattened) grafted into the middle of the seeds
// VIDEO / POSTER API (stand-alone):
//   buildPetula(variant?)                         -> KitRig
//   posePetula(rig, t, dt, pose, { sing })        pose: 'sway' | 'sing' | 'creep' | 'frozen' | 'lunge' | 'dead'
// =====================================================================================

const ROOTS = [-155, -100, -40, 40, 100, 155].map((d) => (d * Math.PI) / 180);
const LEAVES: { at: string; base: V3; mid: V3; tip: V3 }[] = [
  { at: 'stem1', base: [0.05, 0.78, 0.03], mid: [0.28, 0.82, 0.1], tip: [0.5, 0.66, 0.18] },
  { at: 'stem2', base: [-0.05, 1.22, 0.0], mid: [-0.3, 1.25, 0.06], tip: [-0.54, 1.08, 0.12] },
  { at: 'stem2', base: [0.05, 1.42, 0.0], mid: [0.27, 1.46, -0.12], tip: [0.46, 1.32, -0.24] },
  { at: 'stem3', base: [-0.04, 1.74, 0.06], mid: [-0.22, 1.78, 0.14], tip: [-0.4, 1.64, 0.2] },
];
const HC: V3 = [0, 2.16, 0.2];   // the middle of the face
const RD = 0.31;                 // the seed disc's radius
function bonesPetula() {
  const L: [string, string, V3, boolean?][] = [
    ['base', '', [0, 0, 0]],
    ['stem0', 'base', [0, 0.08, 0]], ['stem1', 'stem0', [0, 0.6, 0.02], true], ['stem2', 'stem1', [0, 1.15, 0.0], true], ['stem3', 'stem2', [0, 1.65, 0.04], true],
    ['neck', 'stem3', [0, 1.97, 0.1], true], ['head', 'neck', [HC[0], HC[1], HC[2] - 0.08], true], ['jaw', 'head', [0, 2.075, HC[2] + 0.03]], ['petals', 'head', [0, HC[1], HC[2] - 0.03]],
  ];
  LEAVES.forEach((l, i) => { L.push(['leaf' + i, l.at, l.base], ['leaf' + i + 'm', 'leaf' + i, l.mid]); });
  ROOTS.forEach((a, i) => { L.push(['root' + i, 'base', [Math.sin(a) * 0.07, 0.07, Math.cos(a) * 0.07]], ['root' + i + 'm', 'root' + i, [Math.sin(a) * 0.3, 0.03, Math.cos(a) * 0.3]]); });
  return absBones(L);
}
function layoutPetula(p: Page) {
  p.reg('FACE', 72, 72);
  p.reg('STEM', 24, 96);
  p.reg('LEAF', 40, 48);
  p.reg('PETAL', 24, 40);
  p.reg('BACK', 48, 24);
  p.reg('SEPAL', 16, 24);
  p.reg('ROOT', 16, 32);
  p.reg('CAP', 16, 16);
}
function buildPetulaMesh(B: SkinB, x: BuildCtx) {
  const bi = x.bi, R = x.R, v = x.variant;
  const HD = bi('head'), JW = bi('jaw'), PE = bi('petals');
  // ---- the stem: thick, ridged, furred with stiff hairs; a kink where the puppet's rod once went in
  chain(B, x, R('STEM'), 1, { bones: ['stem0', 'stem1', 'stem2', 'stem3', 'neck'], tip: [0, 2.1, 0.13], r: (t) => 0.078 - t * 0.032 + 0.008 * gauss(t, 0.05, 0.05), n: 9, rings: 4, start: true, end: false,
    bump: (a, t) => 0.07 * Math.max(0, Math.sin(a * 5)) + (hash(Math.round(a * 6), Math.round(t * 90)) - 0.5) * 0.12 });
  // ---- the roots it walks on: gnarled, splayed, the ends curling into the ground
  ROOTS.forEach((a, i) => {
    const tip: V3 = [Math.sin(a) * 0.58, 0.0, Math.cos(a) * 0.58];
    chain(B, x, R('ROOT'), 2 + i, { bones: ['root' + i, 'root' + i + 'm'], tip, r: (t) => 0.045 * (1 - t) + 0.006, n: 6, rings: 4, start: true, end: true,
      bend: (k) => (k === 0 ? [0, 0.06, 0] : [0, 0.03, 0]), bump: (aa, t) => (hash(Math.round(aa * 3), Math.round(t * 14) + i) - 0.5) * 0.4 });
  });
  // ---- leaves: big, coarse, heart-shaped, drooping
  LEAVES.forEach((l, i) => {
    const W0: Wt = [bi('leaf' + i), 1], W1: Wt = [bi('leaf' + i + 'm'), 1];
    const pts: V3[] = [l.base, [(l.base[0] + l.mid[0]) / 2, (l.base[1] + l.mid[1]) / 2 + 0.03, (l.base[2] + l.mid[2]) / 2], l.mid, [(l.mid[0] + l.tip[0]) / 2, (l.mid[1] + l.tip[1]) / 2 + 0.02, (l.mid[2] + l.tip[2]) / 2], l.tip];
    const d: V3 = [l.tip[0] - l.base[0], 0, l.tip[2] - l.base[2]], L = Math.hypot(d[0], d[2]) || 1;
    const side: V3 = [-d[2] / L, 0.25, d[0] / L];
    blade(B, R('LEAF'), pts, [0.03, 0.2, 0.24, 0.16, 0.0], side, [W0, W0, W1, W1, W1], { offset: -0.5, seed: 7 + i, edge: 0.18 });
  });
  // ---- the seed head: a thick disc with a rounded green back, green bracts, the face over the front
  const back: V3[] = [[0, HC[1], HC[2] - 0.17], [0, HC[1], HC[2] - 0.12], [0, HC[1], HC[2] - 0.06], [0, HC[1], HC[2] - 0.01], [0, HC[1], HC[2] + 0.005]];
  sac(B, R('BACK'), 10, back, [[0.08, 0.08], [0.22, 0.22], [0.3, 0.3], [RD + 0.01, RD + 0.01], [RD, RD]], back.map(() => [HD, 1]), { n: 20, end: false, up: [0, 1, 0] });
  plate(B, R('FACE'), 11, [HC[0], HC[1], HC[2] + 0.004], [1, 0, 0], [0, 1, 0], RD, RD, 0.07, [HD, 1], { rows: 10, cols: 10, oval: 1 });
  // ---- petals: two rings, the front ones yellow and long, the back ones shorter; some wilted
  const ring = (n: number, r0: number, len: number, z: number, tilt: number, g: number, off: number) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + off, ca = Math.cos(a), sa = Math.sin(a);
      const wilt = hash(i, g + v * 7) < 0.22 ? 1 : 0, L = len * (0.85 + hash(i, g + 1) * 0.3) * (wilt ? 0.75 : 1);
      const pt = (s: number, fz: number, droop: number): V3 => [ca * (r0 + L * s), HC[1] + sa * (r0 + L * s) - droop, HC[2] + z + fz];
      const droop = wilt ? 0.08 : 0.0;
      const pts: V3[] = [pt(0, 0, 0), pt(0.3, tilt * 0.3, droop * 0.2), pt(0.65, tilt * 0.7, droop * 0.6), pt(1, tilt, droop)];
      const side: V3 = [-sa, ca, 0];
      const w: Wt = [PE, 1];
      blade(B, R('PETAL'), pts, [0.05, 0.085, 0.07, 0.0], side, [w, w, w, w], { offset: -0.5, seed: g + i, edge: 0.12, col: wilt ? 0.82 : 1 });
    }
  };
  ring(14, RD * 0.82, 0.24, -0.05, -0.06, 30, 0.11);
  ring(18, RD * 0.92, 0.3, -0.005, 0.04, 50, 0.0);
  // green bracts behind the petals
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.2, ca = Math.cos(a), sa = Math.sin(a);
    const pts: V3[] = [[ca * RD * 0.7, HC[1] + sa * RD * 0.7, HC[2] - 0.12], [ca * RD * 1.0, HC[1] + sa * RD * 1.0, HC[2] - 0.14], [ca * RD * 1.25, HC[1] + sa * RD * 1.25, HC[2] - 0.1]];
    blade(B, R('SEPAL'), pts, [0.06, 0.06, 0.0], [-sa, ca, 0], [[HD, 1], [HD, 1], [PE, 1]], { offset: -0.5, seed: 70 + i, edge: 0.2 });
  }
}

function paintPetula(p: Page, x: BuildCtx) {
  const v = x.variant % 2, sd = x.seed % 997;
  const GREEN = makeRamp(0x5a8a32, 8, { hueShift: 0.04, spread: 0.6 }), YEL = makeRamp(v ? 0xe8a828 : 0xf0c430, 8, { hueShift: 0.05, spread: 0.55 });
  const SEED = makeRamp(0x3a2414, 6, { spread: 0.6 });
  // the face: a spiral of seeds out to the rim, then the soft skin with seeds pushing through toward its edge
  const F = p.R('FACE');
  const cx = F.w / 2, cy = F.h / 2;
  for (let yy = 0; yy < F.h; yy++) for (let xx = 0; xx < F.w; xx++) {
    const dx = xx + 0.5 - cx, dy = yy + 0.5 - cy, d = Math.hypot(dx, dy) / (F.w / 2);
    // golden-angle florets: each pixel lit by its nearest floret's centre
    const k = Math.round(Math.pow(d * 1.02, 2) * 520), ga = k * 2.39996, rr = Math.sqrt(k / 520) * (F.w / 2);
    const fx = cx + Math.cos(ga) * rr, fy = cy + Math.sin(ga) * rr, fd = Math.hypot(xx + 0.5 - fx, yy + 0.5 - fy);
    let l = 3.2 - fd * 1.4 + (hash(xx, yy + sd) - 0.5) * 0.6 - d * 0.6;
    if (d > 0.92) l -= 1.2;
    F.put(xx, yy, SEED, l, 0.5);
    if (d > 0.86 && hash(k, 3) < 0.35) F.blend(xx, yy, YEL[2], 0.45);   // tiny florets, pollen at the rim
  }
  // the middle, where the face is grafted, packed tight with the smallest, palest florets
  F.glow(cx, cy, F.w * 0.3, F.h * 0.3, SEED[4], 0.35);
  // stem: green, ridged, with paler hairs; a ring of old rope burn where the puppet rod went
  const St = p.R('STEM');
  St.fill(GREEN, (xx, yy) => 3.6 + Math.cos((St.deg(xx) * Math.PI) / 180) * 1.2 + (Math.sin(xx * 1.6) > 0.6 ? 0.6 : 0) + (St.fbm(xx, yy, 3, 2, sd + 5) - 0.5) * 1.1, undefined, 0.5);
  for (let i = 0; i < 160; i++) St.blend(hash(i, sd + 6) * St.w, hash(i, sd + 7) * St.h, 0xd8e8b0, 0.55);
  for (let xx = 0; xx < St.w; xx++) { St.blend(xx, St.h * 0.62, 0x5a4a2a, 0.7); St.blend(xx, St.h * 0.62 + 1, 0x7a6a3a, 0.5); }
  const Lf = p.R('LEAF');
  Lf.fill(GREEN, (xx, yy) => 3.2 + (Lf.fbm(xx, yy, 4, 2, sd + 8) - 0.5) * 1.4 - Math.abs(xx - Lf.w / 2) * 0.03, undefined, 0.5);
  for (let yy = 0; yy < Lf.h; yy++) { Lf.blend(Lf.w / 2, yy, GREEN[6], 0.7); if (yy % 6 === 0) for (let k = 1; k < 12; k++) { Lf.blend(Lf.w / 2 + k, yy + k * 0.6, GREEN[5], 0.4); Lf.blend(Lf.w / 2 - k, yy + k * 0.6, GREEN[5], 0.4); } }
  for (let i = 0; i < 9; i++) Lf.blob(hash(i, sd + 9) * Lf.w, hash(i, sd + 10) * Lf.h, 2.5, 2, 0x8a7a2a, 0.8);   // yellowing, holes eaten
  for (let i = 0; i < 4; i++) Lf.blob(hash(i, sd + 11) * Lf.w, hash(i, sd + 12) * Lf.h, 1.6, 1.4, 0x0a0a06, 1);
  // petals: yellow with veins along their length, brown at the tips (brown all over on the wilted ones: their vertex shade)
  const Pe = p.R('PETAL');
  Pe.fill(YEL, (xx, yy) => 4.4 + (Pe.fbm(xx, yy, 3, 2, sd + 13) - 0.5) * 0.9 - Math.abs(xx - Pe.w / 2) * 0.06 + (xx % 4 === 0 ? -0.6 : 0), undefined, 0.5);
  for (let yy = 0; yy < Pe.h * 0.28; yy++) for (let xx = 0; xx < Pe.w; xx++) if (hash(xx, yy + sd) < 1 - yy / (Pe.h * 0.28)) Pe.put(xx, yy, makeRamp(0x7a4a1a, 4), 1.5 + hash(xx, yy), 0.5);
  const Bk = p.R('BACK');
  Bk.fill(GREEN, (xx, yy) => 2.8 + Math.cos((Bk.deg(xx) * Math.PI) / 180) * 0.8 + (Bk.fbm(xx, yy, 4, 2, sd + 14) - 0.5) * 1.4 + (yy % 4 === 0 ? -0.5 : 0), undefined, 0.5);
  const Sp = p.R('SEPAL');
  Sp.fill(GREEN, (xx, yy) => 2.6 + (hash(xx, yy) - 0.5) * 0.8 - Math.abs(xx - Sp.w / 2) * 0.05);
  const Rt = p.R('ROOT');
  Rt.fill(makeRamp(0x8a7a5a, 6, { spread: 0.5 }), (xx, yy) => 2.6 + Math.cos((Rt.deg(xx) * Math.PI) / 180) * 0.9 + (Rt.fbm(xx, yy, 3, 2, sd + 15) - 0.5) * 1.4, undefined, 0.5);
  for (let yy = Math.floor(Rt.h * 0.5); yy < Rt.h; yy++) for (let xx = 0; xx < Rt.w; xx++) if (hash(xx, yy) < 0.5) Rt.blend(xx, yy, 0x3a2a1a, 0.5);
  paintCap(p.R('CAP'), GREEN[3], 0xc8d890, 0x6a8a3a);
}

const PETULA_KIT: KitDef = { key: 'pg_petula', variants: 2, W: 256, H: 256, bones: bonesPetula, layout: layoutPetula, build: buildPetulaMesh, paint: paintPetula, sphere: [0, 1.3, 0, 1.6], decorate: (rig, e) => attachBaby(rig, e.variant) };
/** the baby face: the survivors' HumanRig head, bald and soft, blown up and pressed flat into the seed disc */
function attachBaby(rig: KitRig, variant: number) {
  const hr = donor('pg_petula_baby:' + (variant % 2), { skin: variant % 2 ? 0xf0c8b0 : 0xf3d2b8, hair: 0xd8c08a, hairStyle: 'bald', face: variant % 2 ? 4 : 2, eyeColor: 0x1a1210, build: 'broad', height: 0.95, age: 0, freckles: 0 }, { dirt: 1 }, 'smile');
  fold(hr, rig.parts.head, [0, 0, -0.1]);
  graft(hr, 'head', rig.parts.head, [0, -0.118, 0.07], [-0.05, 0, 0], [1.8, 1.8, 1.0]);
  rig.kit.m.baby = hr;
}
/** the face lives only while it is not being watched: it sings (talks), smiles, bares its teeth to bite */
function babyStep(K: KitRig, dt: number, md: string, sing: number, atk: number, dead: number, flash: number) {
  const m = K.kit.m as Record<string, any>, hr = m.baby as HumanRig | undefined;
  if (!hr) return;
  if (md === 'frozen') { hr.fx.value.z = flash; return; }
  donorTick(hr, dt, flash);
  const want = dead > 0.5 ? 'dead' : atk > 0.2 || md === 'lunge' ? 'angry' : sing > 0.5 ? 'happy' : 'smile';
  if (m.babyExpr !== want) { m.babyExpr = want; hr.setExpression(want); }
  hr.talking = sing > 0.5 && dead < 0.5 && md !== 'lunge';
}
/** a Petula rig (variant 0: lemon petals; 1: deep marigold) */
export function buildPetula(variant = 0): KitRig { return buildKitRig(PETULA_KIT, variant, 2.3); }

// ------------------------------------------------------------------ animation
export type PetulaPose = 'sway' | 'sing' | 'creep' | 'frozen' | 'lunge' | 'dead';
interface PetulaDrive { t: number; dt: number; md: string; mdT: number; speed: number; sing: number; atk: number; flinch: number; dead: number; seed: number }
function posePetulaRig(K: KitRig, d: PetulaDrive) {
  const P = K.parts, t = d.t, s7 = d.seed * 7;
  // frozen: it holds whatever it was doing, exactly
  if (d.md === 'frozen') return;
  P.base.rotation.set(0, 0, 0); P.base.position.set(0, 0, 0);
  const mv = Math.min(1, d.speed / 1.2) * (1 - d.dead);
  // a slow sway with no wind, the head nodding like it is listening to music
  const sw = Math.sin(t * 0.6 + s7) * 0.04, sw2 = Math.sin(t * 0.43 + s7 * 2) * 0.03;
  const lean = -0.16 * mv;
  P.stem0.rotation.set(lean * 0.5 + sw2, 0, sw);
  P.stem1.rotation.set(lean * 0.3 + sw2 * 0.6, 0, sw * 0.8 + Math.sin(t * 7) * 0.02 * mv);
  P.stem2.rotation.set(lean * 0.2 + sw2 * 0.4, 0, sw * 0.6);
  P.stem3.rotation.set(sw2 * 0.4, 0, sw * 0.5);
  P.neck.rotation.set(0.15 + Math.sin(t * 0.9) * 0.05 + 0.1 * mv, 0, -sw);
  P.head.rotation.set(-0.12 + Math.sin(t * 1.1 + s7) * 0.04, Math.sin(t * 0.5) * 0.05, Math.sin(t * 0.8 + s7) * 0.1 * (0.5 + d.sing));
  P.petals.rotation.set(0, 0, Math.sin(t * 0.3) * 0.02);
  P.petals.scale.setScalar(1 + Math.sin(t * 2.3) * 0.01);
  // the chin: a lullaby is mostly 'oo' and 'ah'
  let jaw = d.sing * (0.012 + Math.abs(Math.sin(t * 2.1 + Math.sin(t * 0.7) * 1.5)) * 0.03);
  // leaves droop and flap, roots scrabble when it moves (front pair reaching, back pair pushing)
  LEAVES.forEach((_, i) => { P['leaf' + i].rotation.set(Math.sin(t * 0.8 + i * 1.7) * 0.06 + mv * 0.15 * Math.sin(t * 6 + i), 0, Math.sin(t * 0.7 + i) * 0.06); P['leaf' + i + 'm'].rotation.set(0.1 + Math.sin(t * 1.1 + i) * 0.08, 0, 0); });
  ROOTS.forEach((a, i) => {
    const ph = t * 7 + i * 1.9, front = Math.cos(a);
    const scr = mv * Math.sin(ph);
    P['root' + i].rotation.set(-Math.max(0, scr) * 0.5 * Math.cos(a), scr * 0.25, Math.max(0, scr) * 0.5 * Math.sin(a));
    P['root' + i + 'm'].rotation.set(Math.max(0, -scr) * 0.4 * front, 0, 0);
  });
  if (mv > 0) P.base.position.y = Math.abs(Math.sin(t * 7)) * 0.03 * mv;
  // the strike: the whole stem whips forward, the head comes down at you with the mouth open
  const a = Math.max(d.atk, d.md === 'lunge' ? Math.max(0, Math.sin(Math.min(1, d.mdT / 0.7) * Math.PI)) : 0);
  if (a > 0) { P.stem1.rotation.x += 0.25 * a; P.stem2.rotation.x += 0.35 * a; P.stem3.rotation.x += 0.3 * a; P.neck.rotation.x += 0.45 * a; jaw = Math.max(jaw, 0.09 * a); }
  if (d.dead > 0) {
    const k = d.dead;
    P.stem1.rotation.x += 0.3 * k; P.stem2.rotation.x += 0.5 * k; P.stem3.rotation.x += 0.6 * k; P.neck.rotation.x += 0.9 * k;
    P.petals.scale.setScalar(1 - 0.25 * k);
    LEAVES.forEach((_, i) => { P['leaf' + i].rotation.x += 0.6 * k; P['leaf' + i + 'm'].rotation.x += 0.5 * k; });
  }
  if (d.flinch > 0) { P.stem2.rotation.z += Math.sin(t * 60) * 0.03 * d.flinch; P.head.rotation.x -= 0.2 * d.flinch; }
  const J = P.jaw; if (J?.userData.p0) J.position.set(J.userData.p0.x, J.userData.p0.y - jaw * 0.55, J.userData.p0.z + jaw * 0.15);
  J.rotation.x = jaw * 2.5;
}
function animatePetula(rig: Rig, c: Creature, t: number, dt: number) {
  const K = rig as KitRig;
  const v = Math.floor(hashId(c.id) * 2);
  if (K.kit.who !== c.id) { K.kit.who = c.id; kitPersonalize(K, v); }
  kitSync(K);
  const n = netOf(c), ud = K.kit.m as Record<string, number>;
  if (n.md !== ud.lmd) { ud.lmd = n.md; ud.mdT = 0; }
  ud.mdT = (ud.mdT ?? 0) + dt;
  const ac = attackCurve(rig, c, t);
  ud.dk = c.dead ? Math.min(1, (ud.dk ?? 0) + dt * 0.8) : 0;
  const frozen = n.md === 'frozen' && !c.dead && c.hitFlash <= 0;
  // its own clock stops while it is frozen, so it picks up exactly where it was
  if (!frozen) ud.ct = (ud.ct ?? t) + dt;
  ud.sing = (ud.sing ?? 0) + (((n.md === 'creep' || n.md === 'sing') ? 1 : 0) - (ud.sing ?? 0)) * Math.min(1, dt * 3);
  posePetulaRig(K, { t: ud.ct ?? t, dt, md: frozen ? 'frozen' : c.dead ? '' : (n.md ?? ''), mdT: ud.mdT, speed: c.dead ? 0 : c.speed, sing: ud.sing, atk: Math.max(ac.wind, ac.strike), flinch: flinchOf(c), dead: ud.dk, seed: hashId(c.id, 4) });
  const F = K.kit.F.fx.value; if (!frozen) F.y += dt; F.z = Math.min(1, c.hitFlash / 0.15) * 0.4;
  babyStep(K, dt, frozen ? 'frozen' : (n.md ?? ''), ud.sing, Math.max(ac.wind, ac.strike), ud.dk, F.z);
  // the lullaby, from wherever it is (heard, not seen)
  if (!c.dead && (n.md === 'creep' || n.md === 'sing') && (ud.songT ?? 0) < t) { ud.songT = t + 4.5 + Math.random() * 2; playAt('music_box_broken', c, n.md === 'creep' ? 0.55 : 0.3, 22, 0.8 + hashId(c.id) * 0.15); }
  if (!c.dead && c.speed > 0.3 && (ud.rootT ?? 0) < t) { ud.rootT = t + 0.3; playAt('carpet_rustle', c, 0.25, 9, 0.5); }
  linePoll(rig, c, 'PETULA');
  const p = localIn(c);
  if (p && !c.dead && c.visibleToLocal) {
    const dd = dist(p, c);
    if (frozen && dd < 4) thinkOnce(p, 'petula_close', 'It is right there. It was not there a second ago. Its face is pointed straight at me.', 50);
    else if (dd < 14) thinkOnce(p, 'petula', ['A sunflower. Taller than me. There is a baby\'s face in the middle of it.', 'It is not moving. Its face is turned toward me. It was facing the other way before.', 'I can hear singing. A lullaby. Coming from the flower.'][Math.floor(t * 0.13) % 3], 100);
  }
}

// ------------------------------------------------------------------ host brain: it only grows while you look away
const SONG = [
  'Grow, little seedling, grow toward the sun...',
  'Turn your face up, turn your face to me...',
  'Water and sunshine and someone to hold...',
  'Close your eyes, sunshine, close your eyes...',
  'Roots in the dark and your face in the light...',
];
const NEAR = ['Peek-a-boo, sunshine.', 'There you are.', 'Don\'t blink, sunshine.'];
function setMd(c: Creature, md: string) { const n = net(c); if (n.md !== md) { n.md = md; c.mem.mdT = 0; } }
function thinkPetula(c: Creature, dt: number): boolean {
  const cs = CS(), z = zoneOf(c), m = c.mem, n = net(c);
  pulse(c);
  m.mdT = (m.mdT ?? 0) + dt;
  const md: string = n.md ?? '';
  // anyone with it in view: it is a sunflower; it does not move, it does not sing
  const watcher = seenBy(c, 34);
  if (watcher) {
    if (md !== 'frozen') { setMd(c, 'frozen'); if (dist(watcher, c) < 4.5 && (m.nearT ?? 0) < G.time) { m.nearT = G.time + 12; say(c, rng.pick(NEAR)); ruleShown(c); } }
    stop(c); c.setState('frozen');
    return true;
  }
  if (md === 'lunge') { stop(c); c.setState('attack'); if (m.mdT > 0.9) setMd(c, 'creep'); return true; }
  const tg = nearestUnit(c, 32);
  if (tg) {
    const p = tg.p;
    if (md !== 'creep') { setMd(c, 'creep'); m.songN = (m.songN ?? Math.floor(hashId(c.id) * 5)) + 1; say(c, SONG[m.songN % SONG.length]); }
    c.setState('stalk');
    if (tg.d < c.sp.attack!.range + p.radius && c.attackT <= 0) { faceTo(c, p.x, p.z, true); attack(c, p); setMd(c, 'lunge'); playAt('bh_crunch', c, 0.8, 12, 0.8); return true; }
    cs.moveTo(c, z, p.x, p.z, tg.d > 10 ? c.sp.run : c.sp.run * 0.8, dt, 0.5);
    faceTo(c, p.x, p.z, true);
    if ((m.lineT ?? 0) < G.time) { m.lineT = G.time + 7; m.songN = (m.songN ?? 0) + 1; say(c, SONG[m.songN % SONG.length]); }
    return true;
  }
  // nobody about: it stands in the sun, sings to itself, and wanders a little toward the light
  if (md === 'creep' || md === 'frozen') setMd(c, 'sing');
  if (md === 'sing' && m.mdT < 14) { stop(c); c.setState('idle'); return true; }
  c.setState('wander');
  if (!c.goal || cs.moveTo(c, z, c.goal.x, c.goal.z, c.sp.walk, dt, 0.6) || c.stateT > 25) {
    if (c.goal) { setMd(c, 'sing'); c.goal = null; return true; }
    c.goal = findSpot(c, { rMin: 2, rMax: 7 }) ?? cs.wanderSpot(c, z, 6);
    c.stateT = 0;
  }
  return true;
}

const PETULA = def({
  key: 'pg_petula', name: 'Petula', code: 'PG-04 // STATUTE, FLORA (BROADCAST-BOUND)', temperament: 'stalker', threat: 4,
  rule: { name: 'IT GROWS WHILE YOU LOOK AWAY', text: 'It never moves while anyone has it in view: it is a sunflower. Look away and it walks on its roots toward you, singing its lullaby, and its face is always turned to you. Close enough and unseen, it bites. Keep it in sight while you back away; move in pairs and somebody is always looking.', tell: 'A huge sunflower with a baby\'s face. It is facing me. I am sure it was facing the other way.' },
  hp: 110, walk: 0.35, run: 3.4, turn: 8, radius: 0.35, height: 2.5, sight: 30, fov: 3.1, hearing: 1,
  attack: { dmg: [12, 20], range: 1.2, cooldown: 1.6, kinds: ['bite', 'laceration'], corrupt: 0.02, knock: 0.3 },
  zones: ['playground'], weight: 1, group: [1, 1], maxPerZone: 2, diet: 'light',
  flags: { weepingAngel: true },
  sounds: { idle: 'music_box_broken', alert: 'music_box_broken', attack: 'bh_crunch', hurt: 'wood_creak', death: 'dmg_break_wood', step: 'carpet_rustle' },
  scan: {
    cls: 'Statute / flora, broadcast-bound',
    notes: [
      'A walking sunflower, two and a half metres tall, with a baby\'s face in the seed head.',
      'It does not move while anyone has it in view. Its face is always turned toward the nearest person.',
      'Unseen, it walks on its roots and sings. The song is louder the closer it gets.',
      'Its bite is a mouth full of seeds. Keep it in sight.',
    ],
  },
  gore: { blood: 'pale', tint: 0xb8d070, flesh: 0x6a9a3a, sever: ['leaf0', 'leaf1', 'leaf2', 'leaf3', 'neck', 'jaw'], head: 'head' },
  build: () => buildPetula(0), animate: animatePetula, think: thinkPetula,
});
onPlayerHit('pg_petula', (p: Player) => {
  bus.emit('think', p, ['It bit me. A mouth full of seeds. I felt them go in.', 'The baby face was right against mine. It smelled of milk and soil.'][Math.floor(Math.random() * 2)]);
});

// ------------------------------------------------------------------ stand-alone posing (gallery, video)
/** pose a Petula rig with no game running ('frozen' holds the last pose) */
export function posePetula(rig: KitRig, t: number, dt: number, pose: PetulaPose = 'sway', o: { sing?: number; variant?: number; speed?: number } = {}) {
  if (o.variant !== undefined && rig.kit.entry.variant !== o.variant % 2) kitPersonalize(rig, o.variant % 2);
  kitSync(rig);
  const ud = rig.kit.m as Record<string, any>;
  if (ud.gp !== pose) { ud.gp = pose; ud.gT = 0; }
  ud.gT = (ud.gT ?? 0) + dt;
  const sing = o.sing ?? (pose === 'sing' || pose === 'creep' ? 1 : 0);
  posePetulaRig(rig, { t, dt, md: pose === 'sway' || pose === 'dead' ? '' : pose, mdT: pose === 'lunge' ? ud.gT % 1.4 : ud.gT, speed: o.speed ?? (pose === 'creep' ? 2.2 : 0), sing, atk: 0, flinch: 0, dead: pose === 'dead' ? 1 : 0, seed: 0.23 });
  babyStep(rig, dt, pose, sing, 0, pose === 'dead' ? 1 : 0, 0);
  if (pose !== 'frozen') rig.kit.F.fx.value.y += dt;
}
PETULA.animateGallery = (rig: Rig, t: number) => {
  const u = new URLSearchParams(location.search);
  const q = (u.get('pose') || ['sway', 'sing', 'creep', 'lunge'][Math.floor(t / 5) % 4]) as PetulaPose;
  posePetula(rig as KitRig, t, 1 / 60, q, { variant: u.get('v') ? Number(u.get('v')) : 0 });
};
horrify(PETULA, { twitch: 0.0, snap: 0.0, breathe: 0.0, lunge: 0.2, flop: false, parts: /leafx/, keepMaterials: false });
