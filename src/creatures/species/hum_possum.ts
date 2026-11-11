import { horrify } from '../kit/horror';
import { def, Rig } from '../species';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import { makeRamp, mixHex } from '../../gfx/pixel';
import type { Creature } from '../creature';
import type { Player } from '../../entities/player';
import { CS, zoneOf, pulse, stop, faceTo, findSpot, attack, onPlayerHit, floorItemsAround } from '../behaviors_a';
import { net, netOf, playAt, hashId, rng, localIn, thinkOnce, dist, playersIn } from '../behaviors_b';
import { KitDef, KitRig, BoneSpec, SkinB, BuildCtx, Page, V3, Wt, buildKitRig, kitSync, kitPersonalize, flinchOf, hash, clamp01 } from '../kit/humanoids';
import { chain, sac, paintSkin, paintCap, paintEye } from '../kit/organic';
import { tgOf, isCalm, provoked, type Disposition } from '../temper';
import '../../audio/sounds_creatures_d';

// =====================================================================================
// THE HUM POSSUM — the commonest animal in the backrooms, and the gentlest. A
// marsupial that got in from somewhere with weather and adapted to the ceiling
// voids: the fur has thinned to grey bristle over pink-grey skin under the
// fluorescent hum, the eyes have grown into wet black mirrors for the dark between
// the tiles, the tail is long, naked and prehensile. It comes down at night to work
// the bins and the break rooms. Meet one and it freezes; come closer and it opens a
// mouth with fifty teeth in it and hisses, drooling (that is all bluff); corner it
// and it falls over, tongue out, stiff, and smells of death until you go away.
// Meat on it, if you are that hungry. Mothers carry the young on their backs.
//   hum_possum   skinned kit rig (organic lofts: a pear body, long snout and jaw,
//                paper ears, glossy eyes, five-fingered pink hands, a naked tail)
// POSTER / VIDEO API (stand-alone, no game needed):
//   buildHumPossum(variant 0..2)                      -> KitRig (rig.root into any scene)
//   poseHumPossum(rig, t, dt, pose, { speed })
//     pose: 'idle' | 'walk' | 'run' | 'sniff' | 'forage' | 'freeze' | 'hiss' | 'playdead' | 'dead'
// =====================================================================================

const SIDES = [['L', 1], ['R', -1]] as const;
function bonesP(v: number): BoneSpec[] {
  const s = 1 + v * 0.06;
  const b: BoneSpec[] = [
    { name: 'base', parent: '', at: [0, 0, 0] },
    { name: 'body', parent: 'base', at: [0, 0.2 * s, -0.04] },
    { name: 'chest', parent: 'body', at: [0, 0.0, 0.14 * s] },
    { name: 'neck', parent: 'chest', at: [0, 0.03, 0.08 * s], cap: true },
    { name: 'head', parent: 'neck', at: [0, 0.02, 0.06 * s], cap: true },
    { name: 'jaw', parent: 'head', at: [0, -0.025, 0.02] },
    { name: 'tail1', parent: 'body', at: [0, -0.01, -0.16 * s], cap: true },
    { name: 'tail2', parent: 'tail1', at: [0, -0.02, -0.11 * s] },
    { name: 'tail3', parent: 'tail2', at: [0, -0.01, -0.11 * s] },
    { name: 'tail4', parent: 'tail3', at: [0, 0.0, -0.1 * s] },
    { name: 'joey', parent: 'body', at: [0, 0.1 * s, -0.02] },
  ];
  for (const [sd, k] of SIDES) {
    b.push({ name: 'ear' + sd, parent: 'head', at: [k * 0.035, 0.035, -0.025] });
    b.push({ name: 'shoulder' + sd, parent: 'chest', at: [k * 0.06 * s, -0.04, 0.02], cap: true }, { name: 'elbow' + sd, parent: 'shoulder' + sd, at: [k * 0.01, -0.07 * s, 0.0] }, { name: 'hand' + sd, parent: 'elbow' + sd, at: [0, -0.07 * s, 0.02] });
    b.push({ name: 'hip' + sd, parent: 'body', at: [k * 0.07 * s, -0.03, -0.1 * s], cap: true }, { name: 'knee' + sd, parent: 'hip' + sd, at: [k * 0.01, -0.07 * s, 0.03] }, { name: 'foot' + sd, parent: 'knee' + sd, at: [0, -0.08 * s, -0.03] });
  }
  return b;
}
function layoutP(p: Page) { p.reg('FUR', 64, 48); p.reg('HEAD', 32, 32); p.reg('SNOUT', 16, 16); p.reg('JAW', 16, 16); p.reg('EAR', 16, 16); p.reg('EYE', 8, 8); p.reg('TAIL', 16, 48); p.reg('LIMB', 16, 32); p.reg('HAND', 16, 16); p.reg('JOEY', 32, 16); p.reg('CAP', 8, 8); }
function buildP(B: SkinB, x: BuildCtx) {
  const bi = x.bi, R = x.R, s = 1 + x.variant * 0.06;
  const Bd = x.rest('body'), C = x.rest('chest');
  // the body: pear-shaped, heavy at the haunches, the coat rough and thin
  const bp: V3[] = [], br: [number, number][] = [], bw: Wt[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8, z = Bd[2] - 0.2 * s + t * 0.34 * s;
    const r = Math.pow(Math.sin(Math.PI * Math.min(0.96, Math.max(0.05, t))), 0.55) * (1.15 - t * 0.4);
    bp.push([0, Bd[1] + 0.01 - t * 0.012, z]); br.push([0.1 * r * s, 0.095 * r * s]);
    bw.push(t > 0.7 ? [bi('chest'), 0.7, bi('body'), 0.3] : t < 0.15 ? [bi('body'), 0.7, bi('tail1'), 0.3] : [bi('body'), 1]);
  }
  sac(B, R('FUR'), 1, bp, br, bw, { n: 14, bump: (a, t) => (hash(Math.round(a * 6), Math.round(t * 16)) - 0.5) * 0.09 + Math.sin(a * 9 + t * 21) * 0.03 });
  // head: a long tapering snout, the nose pink and wet; the lower jaw its own piece (it opens to hiss)
  const N = x.rest('neck'), H = x.rest('head'), J = x.rest('jaw');
  sac(B, R('HEAD'), 2, [[N[0], N[1] - 0.01, N[2] - 0.05], N, [H[0], H[1] + 0.005, H[2] - 0.01], [H[0], H[1] - 0.005, H[2] + 0.045], [H[0], H[1] - 0.012, H[2] + 0.09]],
    [[0.065, 0.06], [0.05, 0.05], [0.048, 0.042], [0.03, 0.026], [0.017, 0.015]], [[bi('chest'), 0.5, bi('neck'), 0.5], [bi('neck'), 1], [bi('head'), 1], [bi('head'), 1], [bi('head'), 1]], { n: 12, up: [0, 1, 0] });
  sac(B, R('SNOUT'), 3, [[H[0], H[1] - 0.01, H[2] + 0.085], [H[0], H[1] - 0.01, H[2] + 0.105], [H[0], H[1] - 0.012, H[2] + 0.118]], [[0.016, 0.014], [0.014, 0.012], [0.004, 0.004]], [[bi('head'), 1], [bi('head'), 1], [bi('head'), 1]], { n: 8 });
  sac(B, R('JAW'), 4, [[J[0], J[1] + 0.002, J[2] - 0.02], [J[0], J[1], J[2] + 0.04], [J[0], J[1] + 0.004, J[2] + 0.085]], [[0.03, 0.012], [0.022, 0.01], [0.01, 0.006]], [[bi('jaw'), 1], [bi('jaw'), 1], [bi('jaw'), 1]], { n: 8 });
  for (const [sd, k] of SIDES) {
    // big wet black eyes, set forward for the dark
    const e: V3 = [H[0] + k * 0.03, H[1] + 0.016, H[2] + 0.025], we: Wt = [bi('head'), 1];
    sac(B, R('EYE'), 5, [[e[0] - k * 0.004, e[1], e[2] - 0.012], e, [e[0] - k * 0.004, e[1], e[2] + 0.012]], [[0.008, 0.008], [0.016, 0.015], [0.006, 0.006]], [we, we, we], { n: 8, up: [0, 1, 0] });
    // paper-thin round ears
    const ea = x.rest('ear' + sd), wE: Wt = [bi('ear' + sd), 1];
    sac(B, R('EAR'), 6, [ea, [ea[0] + k * 0.012, ea[1] + 0.022, ea[2] - 0.004], [ea[0] + k * 0.016, ea[1] + 0.04, ea[2] - 0.006]], [[0.012, 0.006], [0.024, 0.005], [0.006, 0.003]], [wE, wE, wE], { n: 8, up: [0, 0, 1] });
    // legs: short; pale five-fingered hands with a thumb, bare soles
    for (const [a, b2, c2] of [['shoulder', 'elbow', 'hand'], ['hip', 'knee', 'foot']] as const) {
      const ft = x.rest(c2 + sd);
      chain(B, x, R('LIMB'), 7, { bones: [a + sd, b2 + sd, c2 + sd], tip: [ft[0], 0.012, ft[2] + 0.02], r: (t) => (a === 'hip' ? 0.04 : 0.032) - t * 0.016, n: 7, rings: 3, knuckle: 0.2 });
      const wH: Wt = [bi(c2 + sd), 1];
      sac(B, R('HAND'), 8, [[ft[0], 0.012, ft[2] - 0.01], [ft[0], 0.01, ft[2] + 0.02], [ft[0], 0.008, ft[2] + 0.04]], [[0.016, 0.009], [0.024, 0.008], [0.012, 0.004]], [wH, wH, wH], { n: 7 });
      for (let f = 0; f < 4; f++) {
        const fx0 = ft[0] + (f - 1.5) * 0.009, fz0 = ft[2] + 0.04;
        sac(B, R('HAND'), 8, [[fx0, 0.008, fz0], [fx0 + (f - 1.5) * 0.004, 0.006, fz0 + 0.014], [fx0 + (f - 1.5) * 0.006, 0.004, fz0 + 0.022]], [[0.004, 0.003], [0.003, 0.0025], [0.0015, 0.0015]], [wH, wH, wH], { n: 5 });
      }
    }
  }
  // the tail: long, naked, scaled, and prehensile
  chain(B, x, R('TAIL'), 9, { bones: ['tail1', 'tail2', 'tail3', 'tail4'], tipLen: 0.12, r: [0.024, 0.005], n: 7, rings: 4 });
  void C;
  // the young: a clutch of three on the mother's back, clinging in the fur (hidden on the others)
  const jy = x.rest('joey'), wJ: Wt = [bi('joey'), 1];
  for (let i = 0; i < 3; i++) {
    const ox = (i - 1) * 0.045, oz = (i - 1) * 0.03;
    sac(B, R('JOEY'), 10, [[jy[0] + ox, jy[1] - 0.005, jy[2] + oz - 0.035], [jy[0] + ox, jy[1] + 0.012, jy[2] + oz], [jy[0] + ox, jy[1] + 0.006, jy[2] + oz + 0.035], [jy[0] + ox, jy[1], jy[2] + oz + 0.055]],
      [[0.012, 0.01], [0.026, 0.024], [0.02, 0.018], [0.006, 0.005]], [wJ, wJ, wJ, wJ], { n: 8 });
  }
}
function paintP(p: Page, x: BuildCtx) {
  const v = x.variant;
  const furC = [0x8a8682, 0x6e6a66, 0x9a948a][v % 3], skinC = 0xd8a8a0;
  const RF = makeRamp(furC, 8, { hueShift: 0.03, spread: 0.6 }), RS = makeRamp(skinC, 7, { hueShift: 0.05, spread: 0.5 });
  // the coat: grey bristle thinned to the pink skin in patches, a darker stripe down the spine, the belly pale
  for (const [n, seed] of [['FUR', 3], ['HEAD', 7], ['LIMB', 11], ['JOEY', 13]] as const) {
    const r = p.R(n);
    r.fill(RF, (xx, yy) => 3.6 + Math.cos(r.deg(xx) * Math.PI / 180) * 1.3 + (r.fbm(xx, yy, 4, 2, seed + v) - 0.5) * 1.6 + ((xx * 7 + yy * 3) % 5 === 0 ? 1.1 : 0) - ((xx * 3 + yy * 11) % 7 === 0 ? 1.2 : 0), undefined, 0.5);
    for (let yy = 0; yy < r.h; yy++) for (let xx = 0; xx < r.w; xx++) {
      const d = Math.abs(r.deg(xx));
      if (r.fbm(xx, yy, 5, 2, seed + 31) > 0.6) r.blend(xx, yy, RS[3 + (hash(xx, yy) < 0.5 ? 1 : 0)], 0.75);
      if (d < 20 && n === 'FUR') r.blend(xx, yy, 0x3a3634, 0.45);
      if (d > 150) r.blend(xx, yy, 0xd8d0c4, 0.5);
    }
  }
  // the face mask: pale cheeks, dark round the eyes
  const h = p.R('HEAD');
  for (let yy = 0; yy < h.h; yy++) for (let xx = 0; xx < h.w; xx++) { const d = Math.abs(h.deg(xx)); if (yy > h.h * 0.45) h.blend(xx, yy, 0xe8e0d4, 0.55); if (d > 25 && d < 70 && yy > h.h * 0.3 && yy < h.h * 0.6) h.blend(xx, yy, 0x2a2624, 0.5); }
  paintSkin(p.R('SNOUT'), makeRamp(0xe8a0a8, 6), { seed: 4, veins: 2, mottle: 0.8, glint: 6 });
  const j = p.R('JAW');
  j.fill(RS, (xx, yy) => 3 + Math.cos(j.deg(xx) * Math.PI / 180));
  // fifty small teeth along the top of the jaw (the side that shows when it gapes)
  for (let xx = 0; xx < j.w; xx++) if (Math.abs(j.deg(xx)) < 70) for (let yy = 0; yy < j.h; yy += 2) j.set(xx, yy, (xx + yy) % 3 === 0 ? 0x5a1a20 : 0xf2ecd8);
  paintSkin(p.R('EAR'), makeRamp(0xc89090, 6), { seed: 8, veins: 5, vein: 0x9a4a5a, mottle: 1, glint: 2 });
  paintEye(p.R('EYE'), 0x14161c, 0x020204, 0x08080a, { size: 0.95 });
  p.R('EYE').set(2, 2, 0xffffff); p.R('EYE').set(3, 2, 0xc8d0e0);
  // the tail: naked, pink-grey, scaled in rings, darker at the root
  const t = p.R('TAIL');
  t.fill(makeRamp(0xc8a8a4, 7), (xx, yy) => 3.4 + Math.cos(t.deg(xx) * Math.PI / 180) * 1.1 - (yy % 3 === 0 ? 1 : 0) - Math.max(0, 1 - yy / (t.h * 0.25)) * 2 + (hash(xx, yy) - 0.5) * 0.5);
  paintSkin(p.R('HAND'), makeRamp(0xe8b8b0, 6), { seed: 9, veins: 1, mottle: 0.8, glint: 4 });
  paintCap(p.R('CAP'), furC, 0x9a3a3a, 0xe8dcc8);
  void mixHex;
}
export const POSSUM_KIT: KitDef = { key: 'hum_possum', variants: 3, W: 128, H: 192, bones: bonesP, layout: layoutP, build: buildP, paint: paintP, sphere: [0, 0.2, 0, 0.5] };
export function buildHumPossum(variant = 0): KitRig { const K = buildKitRig(POSSUM_KIT, variant, 0.32); K.parts.joey.visible = variant === 2; return K; }
function buildPooled(): Rig { return buildKitRig(POSSUM_KIT, 0, 0.32); }

// ------------------------------------------------------------------ the pose
export type PossumPose = 'idle' | 'walk' | 'run' | 'sniff' | 'forage' | 'freeze' | 'hiss' | 'playdead' | 'dead';
interface PDrive { t: number; dt: number; md: PossumPose; speed: number; seed: number; flinch: number; mother: boolean }
const sm = (ud: Record<string, number>, k: string, to: number, rate: number, dt: number) => (ud[k] = (ud[k] ?? to) + (to - (ud[k] ?? to)) * Math.min(1, dt * rate));
function poseP(K: KitRig, d: PDrive) {
  const P = K.parts, ud = K.kit.m as Record<string, number>, t = d.t, dt = Math.min(0.05, Math.max(0, d.dt)), s7 = d.seed * 7;
  const is = (m: PossumPose) => (d.md === m ? 1 : 0);
  const hiss = sm(ud, 'hs', is('hiss'), 8, dt), freeze = sm(ud, 'fz', is('freeze'), 10, dt), dead = sm(ud, 'dd', is('playdead') + is('dead'), 5, dt);
  const forage = sm(ud, 'fo', is('forage'), 3, dt), sniff = sm(ud, 'sn', is('sniff') + is('idle') * 0.4, 3, dt);
  const live = 1 - dead, mv = clamp01(d.speed / 1.2) * live * (1 - freeze);
  // a low waddle: diagonal pairs, the hips rolling, quick little steps at a run
  ud.ph = (ud.ph ?? 0) + dt * (d.speed / 0.16) * Math.PI * (1 - freeze);
  const ph = ud.ph, sw = Math.sin(ph), cw = Math.cos(ph);
  P.base.position.set(0, Math.abs(cw) * 0.012 * mv - dead * 0.1, 0);
  // playing dead: over on its side, stiff, legs out, the mouth open and the tongue out
  P.base.rotation.set(0, 0, dead * 1.45);
  P.body.rotation.set(-hiss * 0.18 + forage * 0.12 + sw * 0.03 * mv, sw * 0.06 * mv, Math.sin(ph * 0.5) * 0.05 * mv);
  P.body.scale.set(1 + hiss * 0.08, 1 + hiss * 0.1 + Math.sin(t * 2.2 + s7) * 0.012 * live, 1);
  P.chest.rotation.set(-hiss * 0.15 + forage * 0.2, -sw * 0.05 * mv, 0);
  const look = Math.sin(t * 0.7 + s7) * 0.4 * sniff * (1 - hiss);
  P.neck.rotation.set(forage * 0.55 - hiss * 0.25 + sniff * Math.sin(t * 3.3) * 0.06 + dead * 0.3, look, 0);
  P.head.rotation.set(forage * 0.3 - hiss * 0.35 + sniff * Math.sin(t * 9 + s7) * 0.05 * (1 - freeze), look * 0.5 + hiss * Math.sin(t * 13) * 0.06, dead * 0.2);
  P.jaw.rotation.set(Math.max(hiss * (0.95 + Math.sin(t * 17) * 0.05), dead * 0.6, forage * Math.max(0, Math.sin(t * 6)) * 0.25), 0, 0);
  for (const [sd, k] of SIDES) {
    P['ear' + sd].rotation.set(-hiss * 0.6 + Math.sin(t * 1.3 + k) * 0.1 * live, 0, k * (0.2 + hiss * 0.4));
    const ofs = k > 0 ? 0 : Math.PI;
    const a = Math.sin(ph + ofs) * 0.6 * mv, b = Math.sin(ph + ofs + Math.PI) * 0.6 * mv;
    P['shoulder' + sd].rotation.set(a - forage * 0.5 - hiss * 0.25 - dead * 0.9, 0, k * (0.1 + dead * 0.3));
    P['elbow' + sd].rotation.set(-Math.max(0, Math.sin(ph + ofs + 1.5)) * 0.7 * mv + forage * Math.max(0, Math.sin(t * 5 + k)) * 0.8, 0, 0);
    P['hand' + sd].rotation.set(0.2 * mv + forage * 0.4, 0, 0);
    P['hip' + sd].rotation.set(b + hiss * 0.3 + dead * 0.8, 0, k * (0.1 + dead * 0.25));
    P['knee' + sd].rotation.set(Math.max(0, Math.sin(ph + ofs + Math.PI + 1.5)) * 0.8 * mv + hiss * 0.3, 0, 0);
    P['foot' + sd].rotation.set(-0.2 * mv, 0, 0);
  }
  // the tail: curled off the floor, swinging; lashing in a hiss; straight and stiff when it plays dead
  const tw = Math.sin(t * 1.4 + s7) * 0.35 * live + hiss * Math.sin(t * 11) * 0.5;
  P.tail1.rotation.set(-0.15 - mv * 0.15 + dead * 0.2, tw * 0.5, 0);
  P.tail2.rotation.set(0.1 + Math.sin(t * 1.9) * 0.1 * live, tw * 0.6, 0);
  P.tail3.rotation.set(0.25 * live, tw * 0.7, 0);
  P.tail4.rotation.set(0.6 * live + 0.6 * freeze, tw, 0);
  P.joey.visible = d.mother;
  P.joey.rotation.set(Math.sin(t * 3 + s7) * 0.03, 0, 0);
  if (d.flinch > 0) P.body.position.x = Math.sin(t * 70) * 0.012 * d.flinch;
}
export function poseHumPossum(rig: KitRig, t: number, dt: number, pose: PossumPose = 'idle', o: { speed?: number; mother?: boolean } = {}) {
  kitSync(rig);
  poseP(rig, { t, dt, md: pose, speed: o.speed ?? (pose === 'walk' ? 0.6 : pose === 'run' ? 2.2 : 0), seed: 0.4, flinch: 0, mother: o.mother ?? rig.parts.joey.visible });
}

// ------------------------------------------------------------------ game animation (every peer)
function animatePossum(rig: Rig, c: Creature, t: number, dt: number) {
  const K = rig as KitRig;
  const v = Math.floor(hashId(c.id) * 3);
  if (K.kit.who !== c.id) { K.kit.who = c.id; kitPersonalize(K, v); }
  kitSync(K);
  const n = netOf(c);
  const md: PossumPose = c.dead ? 'dead' : (n.md as PossumPose) || (c.speed > 1.2 ? 'run' : c.speed > 0.05 ? 'walk' : 'idle');
  poseP(K, { t, dt, md: md === 'walk' && c.speed > 1.2 ? 'run' : md, speed: c.dead ? 0 : c.speed, seed: hashId(c.id, 2), flinch: flinchOf(c), mother: v === 2 });
  const F = K.kit.F.fx.value; F.y += dt; F.z = Math.min(1, c.hitFlash / 0.15) * 0.4;
  const p = localIn(c);
  if (p && !c.dead && c.visibleToLocal && dist(p, c) < 7) {
    if (md === 'playdead') thinkOnce(p, 'possum_dead', ['It just fell over. Tongue out. It is faking. I think.', 'It smells like it has been dead a week. It was alive a second ago.'][Math.floor(t * 0.3) % 2], 60);
    else thinkOnce(p, 'possum', ['A possum. Grey and pink and bald in patches, eyes like wet black marbles.', 'It is holding very still and hoping I am not real.'][Math.floor(t * 0.2) % 2], 120);
  }
}

// ------------------------------------------------------------------ host brain
const DISP: Disposition = { mood: 'skittish', territory: 3, warn: 2, calm: 3, self: true };
type Mode = 'forage' | 'freeze' | 'hiss' | 'playdead' | 'flee';
const setMd = (c: Creature, md: PossumPose | '') => { const n = net(c); n.md = md || undefined; };
function thinkPossum(c: Creature, dt: number): boolean {
  const cs = CS(), z = zoneOf(c), m = c.mem, ev = pulse(c), tg = tgOf(c);
  m.mT = (m.mT ?? 0) + dt;
  const go = (md: Mode) => { if (m.mode !== md) { m.mode = md; m.mT = 0; } };
  if (!m.mode) go('forage');
  if (ev.hurt > 0) {
    tg.prov = G.time + 15;
    // struck: over it goes (most of the time); the rest bolt
    if (m.mode !== 'playdead') { if (rng.chance(0.7)) { go('playdead'); m.deadFor = 10 + rng.next() * 14; playAt('cower_squeak', c, 0.7, 10, 0.6); } else go('flee'); }
  }
  let near: Player | null = null, nd = 99;
  for (const p of playersIn(c.zoneKey)) { const d = dist(p, c); if (d < nd) { nd = d; near = p; } }
  switch (m.mode as Mode) {
    case 'playdead': {
      c.setState('frozen'); stop(c); setMd(c, 'playdead');
      // it gets up when it is alone again
      if (m.mT > (m.deadFor ?? 12) && (!near || nd > 5)) { go('flee'); setMd(c, ''); }
      return true;
    }
    case 'flee': {
      c.setState('flee'); setMd(c, '');
      if (!c.goal || m.mT < dt * 1.5) c.goal = cs.fleeSpot(c, z, near?.x ?? c.x, near?.z ?? c.z);
      if (cs.moveTo(c, z, c.goal.x, c.goal.z, c.sp.run, dt, 0.6) || m.mT > 7) { go('forage'); c.goal = null; m.calm = G.time + 6; }
      return true;
    }
    case 'freeze': {
      c.setState('frozen'); stop(c); setMd(c, 'freeze');
      if (!near) { go('forage'); return true; }
      faceTo(c, near.x, near.z);
      if (!isCalm(near, c) || nd < 2.2) { go('hiss'); playAt('underlay_hiss', c, 0.6, 12, 1.5); return true; }
      if (nd > 6 || m.mT > 6) { go(nd > 6 ? 'forage' : 'flee'); return true; }
      return true;
    }
    case 'hiss': {
      // all bluff: mouth wide, fifty teeth, drool. Closer still, and it either nips or falls over
      c.setState('warn'); stop(c); setMd(c, 'hiss');
      if (!near) { go('forage'); return true; }
      faceTo(c, near.x, near.z);
      if ((m.hT = (m.hT ?? 0) - dt) <= 0) { m.hT = 0.9 + rng.next() * 0.5; playAt('underlay_hiss', c, 0.55, 10, 1.4 + rng.next() * 0.2); }
      if (nd < 1.1 || provoked(c)) {
        if (rng.chance(0.35) && c.attackT <= 0) { attack(c, near); go('flee'); }
        else { go('playdead'); m.deadFor = 8 + rng.next() * 12; playAt('cower_squeak', c, 0.6, 10, 0.6); }
        return true;
      }
      if (nd > 4.5) go('forage');
      else if (m.mT > 3.5) go('flee');
      return true;
    }
    default: {
      setMd(c, m.fo ? 'forage' : '');
      // a unit nearby: it freezes (a calm one walking past at a distance is ignored)
      if (near && G.time > (m.calm ?? 0)) {
        if (!isCalm(near, c) && nd < 7) { go('flee'); return true; }
        if (nd < (DISP.territory ?? 3) + 1) { go('freeze'); return true; }
      }
      // working the floor: food scraps first, then just wandering and sniffing
      if (m.fo) { c.setState('eat'); stop(c); if (m.mT > m.foT) { m.fo = 0; m.mT = 0; } return true; }
      c.setState('wander');
      if (!c.goal || cs.moveTo(c, z, c.goal.x, c.goal.z, c.sp.walk, dt, 0.5) || m.mT > 16) {
        if (c.goal && rng.chance(0.6)) { m.fo = 1; m.foT = 3 + rng.next() * 6; m.mT = 0; c.goal = null; return true; }
        const food = floorItemsAround(z, c.x, c.z, 5).find((w: any) => /food|scrap|meat|bread|cookie|candy/i.test(String(w.item?.key ?? '')));
        c.goal = food ? { x: (food as any).x, z: (food as any).z } : findSpot(c, { rMin: 2, rMax: 8, dark: 0.6 }) ?? cs.wanderSpot(c, z, 8);
        m.mT = 0;
      }
      return true;
    }
  }
}

const POSSUM = def({
  key: 'hum_possum', name: 'Hum Possum', code: 'IN-52 // FAUNA, MARSUPIAL (PLENUM-ADAPTED)', temperament: 'skittish', threat: 0,
  rule: { name: 'ALL BLUFF', text: 'Harmless. Walk calmly and it freezes and lets you pass; come close and it hisses and gapes (bluff); corner or strike it and it plays dead until you leave. Running sends it bolting.', tell: 'Something grey and pink, frozen in the light, staring with black glass eyes.' },
  hp: 24, walk: 0.7, run: 2.6, turn: 6, radius: 0.2, height: 0.36, sight: 9, fov: 2.4, hearing: 1.4, nightVision: true,
  attack: { dmg: [3, 6], range: 0.6, cooldown: 2, kinds: ['bite', 'scratch'], corrupt: 0, knock: 0.1 },
  zones: ['lobby', 'office', 'mall', 'market', 'house', 'suburbs', 'school', 'fields', 'tunnels', 'depot'], weight: 1.2, group: [1, 2], maxPerZone: 5, diet: 'items',
  meat: [['small_meat_raw', 2]],
  disposition: DISP,
  flags: { nocturnal: true },
  sounds: { alert: 'underlay_hiss', hurt: 'cower_squeak', death: 'cower_squeak', idle: 'bubble_squeak' },
  scan: {
    cls: 'Fauna / marsupial scavenger',
    notes: [
      'A grey marsupial adapted to the ceiling voids: thinned bristle over pink skin, wet black mirror eyes, a naked prehensile tail.',
      'It scavenges the bins and break rooms at night. Mothers carry their young on their backs.',
      'Approached, it freezes. Too close, it gapes and hisses: a bluff. Cornered or struck, it plays dead.',
      'Edible. Cook it well.',
    ],
  },
  gore: { blood: 'red', flesh: 0xb85a5a, sever: ['head', 'tail2', 'shoulderL', 'shoulderR', 'hipL', 'hipR'], head: 'head' },
  build: buildPooled, animate: animatePossum, think: thinkPossum,
});
onPlayerHit('hum_possum', (p) => { bus.emit('think', p, ['It NIPPED me. Little needle teeth.', 'Ow. Fine. FINE. I am going.'][Math.floor(Math.random() * 2)]); });
const GAL: PossumPose[] = ['idle', 'walk', 'sniff', 'forage', 'freeze', 'hiss', 'playdead', 'run'];
POSSUM.animateGallery = (rig: Rig, t: number) => {
  const q = (new URLSearchParams(location.search).get('pose') || GAL[Math.floor(t / 3) % GAL.length]) as PossumPose;
  poseHumPossum(rig as KitRig, t, 1 / 60, q, { mother: true });
};
horrify(POSSUM, { twitch: 0.12, snap: 0.05, parts: /ear|tail/ });
