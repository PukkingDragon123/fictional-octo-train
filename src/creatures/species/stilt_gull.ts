import { horrify } from '../kit/horror';
import * as THREE from 'three';
import { def, Rig } from '../species';
import { makeRamp, mixHex } from '../../gfx/pixel';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import { queueAt } from '../../actions/basic';
import { UseObjectAction } from '../../actions/world';
import { createItem } from '../../items/factory';
import type { Creature } from '../creature';
import type { Player } from '../../entities/player';
import { CS, zoneOf, creatureMenu, poke, poked, pulse, attack, findSpot, stop, faceTo, walkable, onPlayerHit } from '../behaviors_a';
import { net, netOf, playAt, hashId, fakeCreature, rng, localIn, thinkOnce, dist, playersIn, fx, fxPoll } from '../behaviors_b';
import {
  KitDef, KitRig, BoneSpec, SkinB, BuildCtx, Page, V3, Wt, buildKitRig, kitSync, kitPersonalize, attackCurve, flinchOf, hash, offset, lostParts, nearestSurvivor, lookAngles,
} from '../kit/humanoids';
import { chain, sac, blade, paintSkin, paintCap, paintEye, paintFeathers, paintCloth } from '../kit/organic';
import '../../audio/sounds_creatures_c';

// =====================================================================================
// STILT GULL — a gull the size of a man on six jointed stilt legs, with two
// enormous wings whose leading edges are fused bone blades. It walks; the
// floors are wet and it never needs to fly far. It builds a nest of torn
// carpet and ceiling tile in the biggest open room it can find, raises two to
// four chicks, and cuts anything that comes too close to them. It forages
// away from the nest for minutes at a time: that is when you take an egg.
//   stilt_gull  the parent (skinned kit rig: 6-leg gait, folding wings, blade slashes)
//   gull_nest   the nest with its eggs and begging chicks (harvest eggs and feathers)
// =====================================================================================

const SIDES = [['L', 1], ['R', -1]] as const;
const HIPS: [string, V3, number][] = [['chest', [0.11, -0.1, 0.0], 0.34], ['pelvis', [0.13, -0.08, 0.14], 0.02], ['pelvis', [0.12, -0.07, -0.1], -0.3]];
function bonesG(): BoneSpec[] {
  const b: BoneSpec[] = [
    { name: 'pelvis', parent: '', at: [0, 1.15, -0.15], cap: true },
    { name: 'chest', parent: 'pelvis', at: [0, 0.1, 0.32], cap: true },
    { name: 'neck1', parent: 'chest', at: [0, 0.12, 0.14], cap: true },
    { name: 'neck2', parent: 'neck1', at: [0, 0.16, 0.04] },
    { name: 'head', parent: 'neck2', at: [0, 0.12, 0.06], cap: true },
    { name: 'jaw', parent: 'head', at: [0, -0.03, 0.07] },
    { name: 'tail', parent: 'pelvis', at: [0, 0.03, -0.22] },
  ];
  for (const [s, k] of SIDES) {
    b.push(
      { name: 'wA' + s, parent: 'chest', at: [k * 0.16, 0.08, -0.02], cap: true },
      { name: 'wB' + s, parent: 'wA' + s, at: [k * 0.38, 0.02, -0.05], cap: true },
      { name: 'wC' + s, parent: 'wB' + s, at: [k * 0.4, 0.0, -0.04] },
    );
  }
  HIPS.forEach(([par, at, fz], i) => {
    for (const [s, k] of SIDES) {
      const hipY = (par === 'chest' ? 1.25 : 1.15) + at[1];
      const drop = hipY - 0.16 - 0.48 - 0.04;
      b.push(
        { name: `h${i}${s}`, parent: par, at: [k * at[0], at[1], at[2]], cap: true },
        { name: `k${i}${s}`, parent: `h${i}${s}`, at: [k * 0.1, -0.16, 0.06 + fz * 0.2] },
        { name: `a${i}${s}`, parent: `k${i}${s}`, at: [k * 0.05, -0.48, -0.12 + fz * 0.4] },
        { name: `f${i}${s}`, parent: `a${i}${s}`, at: [k * 0.03, -drop, 0.05 + fz * 0.4] },
      );
    }
  });
  return b;
}
function layoutG(p: Page) {
  p.reg('BODY', 64, 48); p.reg('HEAD', 32, 24); p.reg('BEAK', 16, 16); p.reg('JAW', 16, 8);
  p.reg('WING', 48, 40); p.reg('PRIM', 16, 48); p.reg('LEG', 10, 48); p.reg('THIGH', 16, 16);
  p.reg('BLADE', 32, 12); p.reg('FOOT', 16, 16); p.reg('EYE', 8, 8); p.reg('CAP', 12, 12); p.reg('TAIL', 16, 24);
}
function buildG(B: SkinB, x: BuildCtx) {
  const bi = x.bi, R = x.R;
  const PV = bi('pelvis'), CH = bi('chest'), N1 = bi('neck1'), HD = bi('head'), JW = bi('jaw'), TL = bi('tail');
  // body: a deep-keeled, feathered barrel, wedge-tailed
  sac(B, R('BODY'), 1, [[0, 1.2, -0.48], [0, 1.2, -0.38], [0, 1.19, -0.22], [0, 1.2, -0.05], [0, 1.23, 0.1], [0, 1.27, 0.22], [0, 1.33, 0.31]],
    [[0.035, 0.012], [0.1, 0.045], [0.17, 0.15], [0.21, 0.19], [0.22, 0.21], [0.18, 0.18], [0.095, 0.095]],
    [[TL, 1], [TL, 0.6, PV, 0.4], [PV, 1], [PV, 1], [PV, 0.5, CH, 0.5], [CH, 1], [CH, 0.6, N1, 0.4]],
    { n: 14, bump: (a, t) => Math.max(0, Math.sin(t * Math.PI * 16 + Math.abs(a) * 2.5)) * 0.035 + (Math.abs(a) > 2.5 ? 0.06 * Math.sin(t * Math.PI) : 0) });
  // neck: thick, white, a little S
  chain(B, x, R('BODY'), 2, { bones: ['neck1', 'neck2', 'head'], tip: [0, 1.67, 0.42], r: (t) => 0.085 - t * 0.035, n: 10, rings: 3, bend: (i) => (i === 0 ? [0, 0, 0.04] : null), end: false });
  // head: rounded, a flat brow; the beak heavy and hooked, a red spot on the lower mandible
  sac(B, R('HEAD'), 3, [[0, 1.655, 0.34], [0, 1.68, 0.38], [0, 1.68, 0.43], [0, 1.66, 0.48], [0, 1.645, 0.5]],
    [[0.04, 0.045], [0.064, 0.066], [0.06, 0.06], [0.04, 0.04], [0.026, 0.024]], [[HD, 1], [HD, 1], [HD, 1], [HD, 1], [HD, 1]], { n: 10, bump: (a) => Math.exp(-(a * a) / 0.15) * -0.06 });
  sac(B, R('BEAK'), 4, [[0, 1.648, 0.485], [0, 1.652, 0.54], [0, 1.65, 0.6], [0, 1.64, 0.632], [0, 1.618, 0.648]],
    [[0.026, 0.02], [0.019, 0.016], [0.013, 0.013], [0.009, 0.01], [0.003, 0.003]], [[HD, 1], [HD, 1], [HD, 1], [HD, 1], [HD, 1]], { n: 8, start: false });
  sac(B, R('JAW'), 5, [[0, 1.628, 0.49], [0, 1.622, 0.55], [0, 1.618, 0.6], [0, 1.622, 0.625]],
    [[0.022, 0.011], [0.016, 0.01], [0.01, 0.008], [0.004, 0.004]], [[JW, 1], [JW, 1], [JW, 1], [JW, 1]], { n: 6, start: false });
  for (const [, k] of SIDES) {
    const c: V3 = [k * 0.052, 1.688, 0.435];
    sac(B, R('EYE'), 6 + (k > 0 ? 0 : 1), [[c[0] - k * 0.012, c[1], c[2]], [c[0], c[1], c[2]], [c[0] + k * 0.004, c[1], c[2]]], [[0.006, 0.006], [0.013, 0.013], [0.004, 0.004]], [[HD, 1], [HD, 1], [HD, 1]], { n: 8, up: [0, 1, 0] });
  }
  // tail fan
  for (let i = -2; i <= 2; i++) {
    const base: V3 = [i * 0.03, 1.21, -0.42];
    const tip: V3 = [i * 0.07, 1.2 - Math.abs(i) * 0.005, -0.66 + Math.abs(i) * 0.03];
    blade(B, R('TAIL'), [base, [(base[0] + tip[0]) / 2, 1.205, (base[2] + tip[2]) / 2], tip], [0.04, 0.045, 0.03], [1, 0, 0], [[TL, 1], [TL, 1], [TL, 1]], { offset: -0.5, edge: 0.2, seed: i + 9 });
  }
  // wings: the arm (flattened, feathered), a trailing sheet of secondaries, the fused bone blade, the primaries
  for (const [s, k] of SIDES) {
    const A = bi('wA' + s), Bw = bi('wB' + s), C = bi('wC' + s);
    const a = x.rest('wA' + s), b = x.rest('wB' + s), c = x.rest('wC' + s);
    const tip: V3 = [c[0] + k * 0.55, c[1] - 0.03, c[2] - 0.1];
    chain(B, x, R('WING'), 10 + (k > 0 ? 0 : 1), { bones: ['wA' + s, 'wB' + s, 'wC' + s], tip, r: (t) => 0.06 * (1 - t * 0.7), flat: 0.42, n: 7, rings: 3, knuckle: 0.25, up: [0, 0, 1] });
    // the trailing sheet: secondaries hang back off the forearm and hand, ragged at the edge
    const sp: V3[] = [a, [(a[0] + b[0]) / 2, a[1], (a[2] + b[2]) / 2], b, [(b[0] + c[0]) / 2, b[1], (b[2] + c[2]) / 2], c];
    blade(B, R('WING'), sp, [0.22, 0.32, 0.36, 0.36, 0.3], [0, -0.02, -1], [[A, 1], [A, 0.5, Bw, 0.5], [Bw, 1], [Bw, 0.5, C, 0.5], [C, 1]], { edge: 0.25, seed: 3 + k, offset: 0.05 });
    // primaries: long, separated, black-tipped, fanning back from the hand
    for (let f = 0; f < 6; f++) {
      const u = f / 5;
      const root: V3 = [c[0] + k * u * 0.5, c[1] - 0.01, c[2] - 0.03 - u * 0.04];
      const dir = [k * (0.25 + u * 0.75), -0.01, -(1 - u) * 0.95 - 0.1];
      const L = 0.42 + Math.sin(u * Math.PI) * 0.12;
      const l = Math.hypot(dir[0], dir[2]);
      const end: V3 = [root[0] + (dir[0] / l) * L, root[1] - 0.02, root[2] + (dir[2] / l) * L];
      const mid: V3 = [(root[0] + end[0]) / 2, root[1] - 0.005, (root[2] + end[2]) / 2];
      const side: V3 = [-(dir[2] / l) * k, 0, (dir[0] / l) * k];
      blade(B, R('PRIM'), [root, mid, end], [0.05, 0.055, 0.025], side, [[C, 1], [C, 1], [C, 1]], { offset: -0.5, seed: f + 20, edge: 0.1 });
    }
    // the blade: bone-white keratin fused along the leading edge of forearm and hand, scimitar-curved
    const bl: V3[] = [[b[0] - k * 0.05, b[1] + 0.01, b[2] + 0.05], [b[0] + k * 0.2, b[1] + 0.012, b[2] + 0.07], c.map((v, i) => v + (i === 2 ? 0.075 : i === 1 ? 0.01 : 0)) as V3, [c[0] + k * 0.3, c[1], c[2] + 0.05], [tip[0] + k * 0.08, tip[1] + 0.01, tip[2] + 0.06]];
    sac(B, R('BLADE'), 12 + (k > 0 ? 0 : 1), bl, [[0.02, 0.006], [0.045, 0.009], [0.055, 0.01], [0.045, 0.008], [0.004, 0.002]], [[Bw, 1], [Bw, 1], [Bw, 0.5, C, 0.5], [C, 1], [C, 1]], { n: 6, start: true });
  }
  // six stilt legs: a feathered drumstick, then bare scaly shanks to webbed feet
  HIPS.forEach((_, i) => {
    for (const [s, k] of SIDES) {
      const fp = x.rest(`f${i}${s}`);
      chain(B, x, R('LEG'), 20 + i * 2 + (k > 0 ? 0 : 1), { bones: [`h${i}${s}`, `k${i}${s}`, `a${i}${s}`, `f${i}${s}`], tip: [fp[0], 0.03, fp[2] + 0.02], r: (t) => (t < 0.14 ? 0.05 - t * 0.2 : 0.018 - t * 0.006), knuckle: 0.4, n: 6, rings: 3 });
      // the drumstick's feathered cuff
      const h = x.rest(`h${i}${s}`), kn = x.rest(`k${i}${s}`);
      sac(B, R('THIGH'), 30 + i * 2 + (k > 0 ? 0 : 1), [[h[0], h[1] + 0.03, h[2]], [(h[0] + kn[0]) / 2, (h[1] + kn[1]) / 2, (h[2] + kn[2]) / 2], [kn[0], kn[1] - 0.02, kn[2]]], [[0.05, 0.05], [0.06, 0.055], [0.03, 0.028]],
        [[bi(`h${i}${s}`), 1], [bi(`h${i}${s}`), 1], [bi(`h${i}${s}`), 0.5, bi(`k${i}${s}`), 0.5]], { n: 7 });
      // three forward toes and the web between them
      const F = bi(`f${i}${s}`);
      const toes: V3[] = [-0.6, 0, 0.6].map((a) => [fp[0] + Math.sin(a) * 0.12, 0.012, fp[2] + 0.02 + Math.cos(a) * 0.12]);
      const heel: V3 = [fp[0], 0.03, fp[2] + 0.01];
      for (const t of toes) sac(B, R('LEG'), 50, [heel, [(heel[0] + t[0]) / 2, 0.02, (heel[2] + t[2]) / 2], t], [[0.012, 0.01], [0.009, 0.008], [0.003, 0.003]], [[F, 1], [F, 1], [F, 1]], { n: 5, start: false });
      B.quad(heel, toes[0], toes[1], heel, R('FOOT'), [0, 0, 1, 1], [F, 1], true);
      B.quad(heel, toes[1], toes[2], heel, R('FOOT'), [0, 0, 1, 1], [F, 1], true);
    }
  });
}
function paintGull(p: Page, x: BuildCtx) {
  void x;
  const WH = makeRamp(0xe8e6de, 7, { hueShift: 0.02, spread: 0.55 });
  const GR = makeRamp(0x8a9098, 7, { hueShift: 0.05, spread: 0.6 });
  // body: grey mantle over the top, white below, scalloped
  const body = p.R('BODY');
  paintFeathers(body, WH, { seed: 2, rows: 12, cols: 12, base: 3.6 });
  for (let yy = 0; yy < body.h; yy++) for (let xx = 0; xx < body.w; xx++) {
    const a = Math.abs(body.deg(xx));
    if (a < 70 + Math.sin(yy * 0.4) * 6 && yy > body.h * 0.1) body.put(xx, yy, GR, 3.2 + Math.cos((a * Math.PI) / 180) * 1.3 + (hash(xx >> 2, yy >> 2) - 0.5) * 0.9, 0.55);
  }
  // head: white with faint winter streaking round the eye
  const hd = p.R('HEAD');
  paintFeathers(hd, WH, { seed: 4, rows: 6, cols: 10, base: 3.8 });
  for (let i = 0; i < 26; i++) hd.blend(hash(i, 3) * hd.w, hd.h * (0.3 + hash(i, 4) * 0.5), GR[2], 0.35);
  // beak: yellow, a red gonys spot
  const YB = makeRamp(0xe8c030, 6, { spread: 0.7 });
  p.R('BEAK').fill(YB, (xx, yy) => 3 + Math.cos((p.R('BEAK').deg(xx) * Math.PI) / 180) * 1.2 - yy * 0.02);
  const jw = p.R('JAW');
  jw.fill(YB, (xx) => 2.6 + Math.cos((jw.deg(xx) * Math.PI) / 180));
  jw.ellipse(jw.w * 0.5, jw.h * 0.4, 3, 2.2, 0xc81818, 1); jw.ellipse(jw.w * 0.5, jw.h * 0.4, 1.5, 1.2, 0xe83020, 1);
  paintEye(p.R('EYE'), 0xf0d040, 0x101010, 0xd83020, { size: 0.62 });
  // wings: grey coverts, white trailing edge
  const wg = p.R('WING');
  paintFeathers(wg, GR, { seed: 6, rows: 6, cols: 10, base: 3.3, tip: WH.slice(2), tipFrom: 0.8, shaft: GR[1] });
  // primaries: grey to black with white "mirrors" near the tip
  const pr = p.R('PRIM');
  const BK = makeRamp(0x1c1c20, 5, { spread: 0.6 });
  pr.fill(GR, (xx, yy) => 3 + Math.cos((pr.deg(xx) * Math.PI) / 180) * 0.8 - (yy / pr.h) * 0.6);
  for (let yy = Math.floor(pr.h * 0.45); yy < pr.h; yy++) for (let xx = 0; xx < pr.w; xx++) pr.put(xx, yy, BK, 2 + Math.cos((pr.deg(xx) * Math.PI) / 180) * 0.8, 0.4);
  pr.ellipse(pr.w * 0.5, pr.h * 0.8, pr.w * 0.22, pr.h * 0.05, 0xf0f0ea, 1);
  for (let yy = 0; yy < pr.h; yy++) pr.blend(pr.w / 2, yy, 0xe0e0d8, 0.5);
  // the blade: bone white, a hard steel-grey edge, old stains
  const bl = p.R('BLADE');
  const BN = makeRamp(0xe8dcc0, 6, { spread: 0.6 });
  bl.fill(BN, (xx, yy) => 3.2 + Math.cos((bl.deg(xx) * Math.PI) / 180) * 1.6 + (bl.fbm(xx, yy, 3, 2, 3) - 0.5) * 1.2);
  for (let xx = 0; xx < bl.w; xx++) { bl.blend(xx, 0, 0x6a7078, 0.8); bl.blend(xx, bl.h - 1, 0x6a7078, 0.8); }
  for (let i = 0; i < 5; i++) bl.glow(hash(i, 8) * bl.w, hash(i, 9) * bl.h, 2 + hash(i, 1) * 3, 1.5, 0x5a1810, 0.5);
  // legs: pink-orange, scaly; thighs grey down
  const LG = makeRamp(0xd8806a, 6, { hueShift: 0.04, spread: 0.6 });
  const lg = p.R('LEG');
  lg.fill(LG, (xx, yy) => 2.8 + Math.cos((lg.deg(xx) * Math.PI) / 180) * 1.2 + (((xx + (yy >> 1)) & 1) && (yy & 1) ? -0.8 : 0.2));
  paintFeathers(p.R('THIGH'), GR, { seed: 8, rows: 5, cols: 6, base: 3 });
  paintSkin(p.R('FOOT'), LG, { seed: 9, veins: 3, vein: LG[1], glint: 2 });
  paintFeathers(p.R('TAIL'), WH, { seed: 10, rows: 3, cols: 3, base: 3.6, tip: BK, tipFrom: 0.85 });
  paintCap(p.R('CAP'), WH[3], 0xb83028, 0x5a1010);
}
const GULL_KIT: KitDef = { key: 'stilt_gull', variants: 1, W: 128, H: 256, bones: bonesG, layout: layoutG, build: buildG, paint: paintGull, sphere: [0, 1.0, 0, 2.2] };
function buildGull(): Rig { return buildKitRig(GULL_KIT, 0, 1.7); }

// ------------------------------------------------------------------ animation
function animateGull(rig: Rig, c: Creature, t: number, dt: number) {
  const K = rig as KitRig;
  if (K.kit.who !== c.id) { K.kit.who = c.id; kitPersonalize(K, 0); }
  kitSync(K);
  const P = rig.parts;
  const R = (n: string, x: number, y = 0, z = 0) => { const o = P[n]; if (o) o.rotation.set(x, y, z); };
  const ud = rig.root.userData as Record<string, number>;
  const n = netOf(c), seed = hashId(c.id);
  const ac = attackCurve(rig, c, t);
  const lost = lostParts(c);
  const sm = (k: string, v: number, rate: number) => (ud[k] = (ud[k] ?? v) + (v - (ud[k] ?? v)) * Math.min(1, dt * rate));
  const moving = c.speed > 0.15;
  const running = c.speed > 2.4;
  // modes: brood (sitting on the nest), warn (wings up, screaming), fly-hop, walk
  const brood = sm('brood', n.md === 'brood' && !moving ? 1 : 0, 2);
  const warn = sm('warn', n.md === 'warn' || c.state === 'warn' ? 1 : 0, 5);
  const spread = sm('spread', Math.max(warn, running ? 0.85 : 0, ac.wind > 0 || ac.strike > 0 ? 1 : 0), running ? 3 : 4);
  const ph = c.phase * 1.4;
  // ---- legs: three pairs in a tetrapod wave; folded under it when it broods
  for (let i = 0; i < 3; i++) for (const [s, k] of SIDES) {
    const grp = ((i + (k > 0 ? 0 : 1)) % 2) * Math.PI + i * 0.7;
    const p = ph + grp;
    const sw = moving ? Math.sin(p) : 0, lift = moving ? Math.max(0, Math.cos(p)) : 0;
    const shift = !moving ? Math.pow(Math.max(0, Math.sin(t * 0.6 + i * 2 + k + seed * 5)), 12) : 0;
    R(`h${i}${s}`, -sw * 0.32 - brood * 0.9 + (i - 1) * -0.06, 0, k * (0.06 + brood * 0.25));
    R(`k${i}${s}`, -lift * 0.35 - brood * 0.6 - shift * 0.3, 0, 0);
    R(`a${i}${s}`, lift * 0.85 + brood * 2.4 + shift * 0.6, 0, 0);
    R(`f${i}${s}`, -lift * 0.5 - brood * 1.0, 0, 0);
    if (lost.has(`h${i}${s}`) || lost.has(`k${i}${s}`)) R(`h${i}${s}`, 0.4, 0, k * 0.5);
  }
  const bob = moving ? Math.abs(Math.sin(ph)) * 0.04 : 0;
  const breath = Math.sin(t * 2.6 + seed * 7);
  offset(rig, 'pelvis', 0, -brood * 0.82 + bob - warn * 0.06 + breath * 0.008, 0);
  R('pelvis', -brood * 0.04 + warn * 0.08, moving ? Math.sin(ph) * 0.05 : 0, moving ? Math.sin(ph * 2) * 0.03 : 0);
  R('chest', breath * 0.02 + warn * 0.12 - ac.strike * 0.15, 0, 0);
  R('tail', Math.sin(t * 1.3 + seed) * 0.06 + warn * 0.25, Math.sin(t * 0.9) * 0.08, 0);
  // ---- wings: folded along the back; spread and raised to threaten; flapping hop-glides when it runs; blade slashes
  const flap = running ? Math.sin(t * 9) : 0;
  const slashL = ac.strike > 0 && (Math.floor(c.attackT * 3 + seed * 10) & 1) === 0;
  for (const [s, k] of SIDES) {
    const fold = 1 - spread;
    const sl = ac.strike > 0 && ((k > 0) === slashL) ? ac.strike : 0;
    const wind = ac.wind * (((k > 0) === slashL) ? 1 : 0.3);
    // folded: the wing rolls on its long axis so the feather sheet hangs down the flank, then swings back along the body,
    // the hand tipped up so the primaries cross over the tail; spread: level, raised for display; slashes sweep forward
    const wa = P['wA' + s]; if (wa && wa.rotation.order !== 'YXZ') wa.rotation.order = 'YXZ';
    const roll = -1.2 * fold + warn * 0.25 + sl * 0.3;
    const ay = k * (fold * 1.48 + warn * 0.25 + wind * 0.9 - sl * 1.7);
    const az = k * (fold * 0.1 + warn * 0.5 + flap * 0.75 * spread + wind * 0.3 - sl * 0.15 + breath * 0.02);
    R('wA' + s, roll, ay, az);
    R('wB' + s, 0, -k * (-fold * 0.12 + wind * 0.3 - warn * 0.1), k * (warn * 0.15 + flap * 0.35 * spread) - k * fold * 0.05);
    R('wC' + s, 0, k * (-fold * 0.62 + warn * 0.05 - sl * 0.3), k * (warn * -0.2 + flap * 0.4 * spread) + k * fold * 0.22);
    if (lost.has('wA' + s)) R('wA' + s, 0.4, k * 0.4, -k * 0.6);
  }
  // ---- neck and head: pigeon-bob when it walks, scanning snaps, a screaming throw-back in display, preening when calm
  const tgt = nearestSurvivor(c, 14);
  let yaw = 0, pitch = 0;
  if (tgt) [yaw, pitch] = lookAngles(c, tgt.x, tgt.z, tgt.y, 1.65, 1.3, 0.6);
  const snapI = Math.floor(t * 0.8 + seed * 7);
  const idleYaw = (hash(snapI, 5) - 0.5) * 1.6;
  const look = sm('look', tgt && tgt.d < 10 ? yaw : idleYaw, tgt ? 6 : 12);
  const preen = sm('preen', !tgt && !moving && !brood && Math.sin(t * 0.21 + seed * 9) > 0.75 ? 1 : 0, 2);
  const hb = moving ? (Math.sin(ph * 2) > 0 ? 0.12 : -0.1) : 0;
  const call = n.call && t - (ud.callT ?? -9) < 1.4 ? 1 : 0;
  { const f = fxPoll(rig, c); if (f?.key === 'scream') ud.callT = t; }
  const scream = Math.max(warn * (0.5 + 0.5 * Math.max(0, Math.sin(t * 2.2))), t - (ud.callT ?? -9) < 1.4 ? 1 : 0, call);
  R('neck1', -0.15 + warn * 0.55 - scream * 0.25 + hb + brood * 0.3, look * 0.45 + preen * 1.9 * (seed < 0.5 ? 1 : -1), 0);
  R('neck2', 0.05 - warn * 0.2 - scream * 0.6 - pitch * 0.4, look * 0.4 + preen * 0.8 * (seed < 0.5 ? 1 : -1), 0);
  R('head', 0.1 - warn * 0.3 + scream * 0.35 + preen * 0.6 - pitch * 0.3 + ac.wind * 0.3, look * 0.25, (hash(snapI, 9) - 0.5) * 0.3 + preen * 0.5);
  R('jaw', scream * (0.5 + Math.sin(t * 30) * 0.08) + ac.strike * 0.4 + (preen ? Math.max(0, Math.sin(t * 12)) * 0.15 : 0), 0, 0);
  const fl = flinchOf(c);
  rig.body.position.x = fl > 0 ? Math.sin(t * 70) * 0.04 * fl : 0;
  const F = K.kit.F.fx.value; F.y += dt; F.z = Math.min(1, c.hitFlash / 0.15) * 0.4;
  if (c.dead) { R('neck1', 0.9); R('neck2', 0.6); R('head', 0.4); }
  const p = localIn(c);
  if (p && !c.dead && c.visibleToLocal && tgt && tgt.d < 9) {
    if (warn > 0.5) { p.body.stress = Math.min(100, p.body.stress + dt * 3); thinkOnce(p, 'gull_warn', ['Those wings are blades. It is telling me to back off.', 'It is screaming at me. The nest. I am too close to the nest.', 'Back away from the chicks. Slowly.'][Math.floor(t) % 3], 40); }
    else thinkOnce(p, 'gull', ['A gull. Six legs. Wings like scythes.', 'It smells like a fish market in here. Where is the sea?'][Math.floor(t) % 2], 120);
  }
}

// ------------------------------------------------------------------ host brain
/** a nest site: the middle of a big open room near home */
function nestSite(c: Creature): { x: number; z: number } | null {
  const z = zoneOf(c);
  const open = (tx: number, ty: number) => {
    let n = 0;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (walkable(z, tx + dx, ty + dy) && !z.objectsAt(tx + dx, ty + dy).length) n++;
    return n;
  };
  let best: { x: number; z: number } | null = null, bn = 40;
  for (let i = 0; i < 40; i++) {
    const s = findSpot(c, { x: c.home.x, z: c.home.z, rMin: 0, rMax: 14, tries: 6 });
    if (!s) continue;
    const n = open(Math.floor(s.x), Math.floor(s.z));
    if (n > bn) { bn = n; best = s; if (n >= 49) break; }
  }
  return best;
}
function nestOf(c: Creature): Creature | null { const id = c.mem.nest as string | undefined; const n = id ? CS().creatures.get(id) : undefined; return n && !n.dead ? n : null; }
function intruder(c: Creature, nest: Creature | null): { p: Player; d: number; dn: number } | null {
  let best: { p: Player; d: number; dn: number } | null = null;
  for (const p of playersIn(c.zoneKey)) {
    const d = dist(p, c), dn = nest ? dist(p, nest) : d;
    const score = Math.min(d, dn);
    if (!best || score < Math.min(best.d, best.dn)) best = { p, d, dn };
  }
  return best;
}
function scream(c: Creature) { fx(c, 'scream'); playAt('echo_shriek', c, 0.9, 26, 0.55); playAt('wrongbird_caw', c, 1, 30, 0.45); }

function thinkGull(c: Creature, dt: number): boolean {
  const cs = CS(), z = zoneOf(c), m = c.mem, n = net(c);
  const ev = pulse(c);
  if (!m.init) {
    m.init = 1;
    const site = nestSite(c);
    if (site) {
      const ne = cs.spawn('gull_nest', c.zoneKey, site.x, site.z);
      if (ne) {
        ne.mem.parent = c.id; ne.mem.persistent = true;
        const nn = net(ne); nn.e = rng.int(1, 3); nn.k = rng.int(1, 3); nn.f = rng.int(2, 4);
        m.nest = ne.id; c.home = { x: site.x, z: site.z }; m.persistent = true;
      }
    }
    m.forageAt = G.time + rng.float(25, 60);
  }
  const nest = nestOf(c);
  const it = intruder(c, nest);
  // fury: someone touched the nest, or hurt it
  if (ev.hurt > 0 && it) m.fury = { pid: it.p.id, until: G.time + 25 };
  if (m.fury && G.time > m.fury.until) m.fury = null;
  if (c.hp < c.sp.hp * 0.25) { if (c.state !== 'flee') { c.setState('flee'); c.goal = cs.fleeSpot(c, z, it?.p.x ?? c.x, it?.p.z ?? c.z); scream(c); } }
  if (c.state === 'flee') { n.md = ''; if (!c.goal || cs.moveTo(c, z, c.goal.x, c.goal.z, c.sp.run, dt, 0.8) || c.stateT > 8) c.setState('wander'); return true; }
  const furyP = m.fury ? (G.players.get(m.fury.pid) as Player | undefined) : undefined;
  // ---- attack: it cuts whoever went for the nest, or whoever ignored the warning
  if (furyP && !furyP.body.dead && furyP.zoneKey === c.zoneKey && (!nest || dist(furyP, nest) < 16)) {
    c.setState('chase'); n.md = 'warn';
    const d = dist(furyP, c);
    if (d <= c.sp.attack!.range + furyP.radius && c.attackT <= 0) { attack(c, furyP); return true; }
    cs.moveTo(c, z, furyP.x, furyP.z, c.sp.run, dt, c.sp.attack!.range * 0.7);
    if (c.noiseCooldown <= 0) { scream(c); c.noiseCooldown = 3; }
    return true;
  }
  // ---- warning: too close to the nest or to it
  if (it && (it.dn < 6 || it.d < 3.2)) {
    if (c.state !== 'warn') { c.setState('warn'); scream(c); }
    n.md = 'warn';
    // come back to stand over the nest, facing the intruder
    if (nest && dist(c, nest) > 1.6) cs.moveTo(c, z, nest.x + (it.p.x - nest.x) * 0.25, nest.z + (it.p.z - nest.z) * 0.25, c.sp.run, dt, 0.6);
    else { stop(c); faceTo(c, it.p.x, it.p.z); }
    m.warnT = (m.warnT ?? 0) + dt;
    if ((it.dn < 3.4 || it.d < 2.2) && m.warnT > 1.6) m.fury = { pid: it.p.id, until: G.time + 14 };
    if (c.noiseCooldown <= 0) { scream(c); c.noiseCooldown = 2.2 + rng.float(0, 1); }
    return true;
  }
  m.warnT = 0;
  // ---- foraging: away from the nest for a while, pecking at the carpet
  if (c.state === 'wander' || c.state === 'eat') {
    n.md = '';
    if (c.state === 'eat') { stop(c); if (c.stateT > 4) { c.setState('wander'); c.goal = null; } return true; }
    if (!c.goal || cs.moveTo(c, z, c.goal.x, c.goal.z, c.sp.walk, dt, 0.6)) {
      if (c.goal && rng.chance(0.6)) { c.setState('eat'); return true; }
      c.goal = findSpot(c, { x: c.home.x, z: c.home.z, rMin: 5, rMax: 13 }) ?? cs.wanderSpot(c, z, 12);
    }
    if (G.time > (m.homeAt ?? 0)) { c.setState('nest'); c.goal = null; }
    if (c.noiseCooldown <= 0 && rng.chance(dt * 0.05)) { fx(c, 'scream'); playAt('wrongbird_caw', c, 0.6, 26, 0.5); c.noiseCooldown = 10; }
    return true;
  }
  // ---- at the nest: brooding, standing guard, feeding the chicks
  c.setState('nest');
  if (nest) {
    if (dist(c, nest) > 0.5) { n.md = ''; cs.moveTo(c, z, nest.x, nest.z, c.sp.walk, dt, 0.4); return true; }
    stop(c);
    n.md = (netOf(nest).e ?? 0) > 0 ? 'brood' : '';
    if (c.stateT > 3 && rng.chance(dt * 0.1)) c.targetFacing = rng.float(0, Math.PI * 2);
  } else { n.md = ''; stop(c); }
  if (G.time > (m.forageAt ?? 0)) { m.forageAt = G.time + rng.float(70, 120); m.homeAt = G.time + rng.float(35, 60); c.setState('wander'); c.goal = null; }
  return true;
}
onPlayerHit('stilt_gull', (p) => {
  bus.emit('think', p, ['It CUT me. The wing is a blade.', 'Like being hit with a scythe.', 'Get away from the nest!'][Math.floor(Math.random() * 3)]);
  G.camera?.kick?.(Math.random() - 0.5, Math.random() - 0.5, 0.35);
});

const GULL = def({
  key: 'stilt_gull', name: 'Stilt Gull', code: 'IN-40 // LARID, HEXAPOD', temperament: 'territorial', threat: 3,
  rule: { name: 'MIND THE NEST', text: 'It ignores you until you get near its nest. Wings up and screaming is the last warning. It leaves the nest to forage: take an egg then, or it cuts you.', tell: 'Something is screaming like a gull. There is no sea down here.' },
  hp: 95, walk: 1.4, run: 4.6, turn: 6, radius: 0.48, height: 1.8, sight: 16, fov: 1.6, hearing: 1.3,
  attack: { dmg: [11, 19], range: 1.55, cooldown: 1.5, kinds: ['laceration', 'deep'], corrupt: 0, knock: 0.9, parts: ['uarm_l', 'uarm_r', 'farm_l', 'farm_r', 'torso_u', 'torso_l', 'thigh_l', 'thigh_r', 'neck'] },
  zones: ['lobby', 'pools', 'parking', 'mall', 'fields'], weight: 0.55, maxPerZone: 2, diet: 'meat',
  meat: [['meat_raw', 3]],
  sounds: { alert: 'wrongbird_caw', attack: 'echo_shriek', hurt: 'cower_squeak', death: 'strider_die', step: 'thud_soft' },
  scan: {
    cls: 'Hexapod gull / nesting',
    notes: [
      'A gull the size of a man on six stilt legs. The wing edges are fused bone, sharp as a blade.',
      'It nests in the biggest open room it can find, on torn carpet and ceiling tile, and raises chicks.',
      'Near the nest it spreads its wings and screams. That is the only warning.',
      'It leaves to forage. Eggs and moulted blade feathers can be taken from the nest then.',
    ],
  },
  gore: { blood: 'red', flesh: 0xd8a090, sever: ['wBL', 'wBR', 'h0L', 'h0R', 'h1L', 'h1R', 'h2L', 'h2R', 'neck2'], head: 'head' },
  build: buildGull, animate: animateGull, think: thinkGull,
});
(GULL as any).handlesSevered = true;
GULL.animateGallery = (rig: Rig, t: number) => {
  const q = new URLSearchParams(location.search).get('pose') || 'walk';
  const fc = fakeCreature(GULL, { id: 'gg', speed: q === 'walk' ? 1.3 : q === 'run' ? 4 : 0, phase: t * 3, state: q === 'warn' ? 'warn' : 'wander', mem: { netMem: { md: q === 'brood' ? 'brood' : q === 'warn' ? 'warn' : '' } } });
  animateGull(rig, fc, t, 1 / 60);
};
horrify(GULL, { twitch: 0.35, snap: 0.25 });

// =====================================================================================
// THE NEST
// =====================================================================================
const EGG_AT: V3[] = [[0.1, 0.12, 0.08], [-0.13, 0.12, 0.04], [0.02, 0.12, -0.16]];
const CHICK_AT: V3[] = [[-0.24, 0.06, -0.18], [0.24, 0.06, -0.14], [0.02, 0.06, 0.26]];
const CS_ = 1.7;
function bonesN(): BoneSpec[] {
  const b: BoneSpec[] = [{ name: 'base', parent: '', at: [0, 0, 0] }];
  EGG_AT.forEach((e, i) => b.push({ name: 'egg' + i, parent: 'base', at: e }));
  CHICK_AT.forEach((c, i) => {
    b.push({ name: 'ck' + i, parent: 'base', at: c }, { name: 'cn' + i, parent: 'ck' + i, at: [0, 0.07 * CS_, 0.05 * CS_] },
      { name: 'ch' + i, parent: 'cn' + i, at: [0, 0.08 * CS_, 0.02 * CS_] }, { name: 'cb' + i, parent: 'ch' + i, at: [0, -0.012 * CS_, 0.04 * CS_] });
  });
  return b;
}
function layoutN(p: Page) {
  p.reg('RIM', 64, 24); p.reg('FLOOR', 24, 24); p.reg('STRIP', 16, 32); p.reg('TILE', 16, 16); p.reg('EGG', 16, 16);
  p.reg('DOWN', 32, 24); p.reg('BEAK', 8, 8); p.reg('GAPE', 8, 8); p.reg('EYE', 8, 8); p.reg('FEATH', 12, 24); p.reg('BADGE', 12, 8); p.reg('CAP', 8, 8);
}
function buildN(B: SkinB, x: BuildCtx) {
  const R = x.R, BA = x.bi('base');
  // the bowl: a thick twisted ring of shredded carpet and insulation
  const N = 18, ring: V3[] = [], rr: [number, number][] = [], w: Wt[] = [];
  for (let i = 0; i <= N; i++) { const a = (i / N) * Math.PI * 2; const r = 0.55 + Math.sin(a * 3) * 0.04; ring.push([Math.cos(a) * r, 0.11 + Math.sin(a * 5) * 0.015, Math.sin(a) * r]); rr.push([0.22 + Math.sin(a * 4) * 0.03, 0.13]); w.push([BA, 1]); }
  sac(B, R('RIM'), 1, ring, rr.map(([a, b]) => [a * 0.75, b * 0.7] as [number, number]), w, { n: 8, start: false, end: false, bump: (a, t) => Math.sin(a * 7 + t * 60) * 0.12 + Math.sin(t * 140) * 0.05 });
  // woven strands wound round the core, each its own wobble: the bowl reads as built, not moulded
  for (let k = 0; k < 7; k++) {
    const pts: V3[] = [], rad: [number, number][] = [], ww: Wt[] = [];
    const r0 = 0.48 + hash(k, 1) * 0.16, y0 = 0.08 + hash(k, 2) * 0.14, a0 = hash(k, 3) * 6.28, span = Math.PI * (1.1 + hash(k, 4) * 0.8);
    for (let i = 0; i <= 14; i++) {
      const a = a0 + (i / 14) * span;
      const r = r0 + Math.sin(a * 5 + k) * 0.05;
      pts.push([Math.cos(a) * r, y0 + Math.sin(a * 4 + k * 2) * 0.05, Math.sin(a) * r]);
      const th = 0.045 + hash(k, 5) * 0.035;
      rad.push([th * (i === 0 || i === 14 ? 0.3 : 1), th * 0.8]); ww.push([BA, 1]);
    }
    sac(B, R(k % 3 === 2 ? 'STRIP' : 'RIM'), 100 + k, pts, rad, ww, { n: 5, bump: (a, t) => Math.sin(a * 3 + t * 90) * 0.15 });
  }
  sac(B, R('FLOOR'), 2, [[0, 0.0, 0], [0, 0.035, 0.001], [0, 0.04, 0.002]], [[0.5, 0.5], [0.44, 0.44], [0.02, 0.02]], [[BA, 1], [BA, 1], [BA, 1]], { n: 12, up: [0, 0, 1], start: false, end: false });
  // carpet strips draped over the rim, ceiling-tile fragments, a lanyard, moulted blade feathers in the lining
  for (let i = 0; i < 11; i++) {
    const a = hash(i, 3) * Math.PI * 2, r = 0.5 + hash(i, 4) * 0.12;
    const pIn: V3 = [Math.cos(a) * (r - 0.18), 0.12 + hash(i, 5) * 0.06, Math.sin(a) * (r - 0.18)];
    const pTop: V3 = [Math.cos(a) * r, 0.25 + hash(i, 6) * 0.05, Math.sin(a) * r];
    const pOut: V3 = [Math.cos(a) * (r + 0.26), 0.02, Math.sin(a) * (r + 0.26)];
    blade(B, R('STRIP'), [pIn, pTop, pOut], [0.07, 0.09, 0.08], [-Math.sin(a), 0, Math.cos(a)], [[BA, 1], [BA, 1], [BA, 1]], { offset: -0.5, edge: 0.3, seed: i });
  }
  for (let i = 0; i < 7; i++) {
    const a = hash(i, 13) * Math.PI * 2, r = 0.45 + hash(i, 14) * 0.25, s = 0.08 + hash(i, 15) * 0.06;
    const c: V3 = [Math.cos(a) * r, 0.2 + hash(i, 16) * 0.06, Math.sin(a) * r];
    sac(B, R('TILE'), 3 + i, [[c[0] - s, c[1], c[2]], [c[0], c[1] + 0.01, c[2]], [c[0] + s, c[1] - 0.01, c[2]]], [[s * 0.7, 0.012], [s, 0.014], [s * 0.6, 0.012]], [[BA, 1], [BA, 1], [BA, 1]], { n: 4, bump: (aa) => Math.sin(aa * 2 + i) * 0.2 });
  }
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.3, r = 0.32 + hash(i, 21) * 0.06;
    const p0: V3 = [Math.cos(a) * r, 0.07, Math.sin(a) * r], p1: V3 = [Math.cos(a + 0.35) * (r + 0.06), 0.12, Math.sin(a + 0.35) * (r + 0.06)], p2: V3 = [Math.cos(a + 0.6) * (r + 0.1), 0.18, Math.sin(a + 0.6) * (r + 0.1)];
    blade(B, R('FEATH'), [p0, p1, p2], [0.03, 0.035, 0.012], [0, 1, 0], [[BA, 1], [BA, 1], [BA, 1]], { offset: -0.5, seed: i + 40 });
  }
  // sticks: ceiling-grid T-bar, wire, a chair rung, poking out of the weave
  for (let i = 0; i < 14; i++) {
    const a = hash(i, 31) * Math.PI * 2, r0 = 0.4 + hash(i, 32) * 0.1, r1 = 0.75 + hash(i, 33) * 0.25, a1 = a + (hash(i, 34) - 0.5) * 0.8;
    sac(B, R('TILE'), 70 + i, [[Math.cos(a) * r0, 0.12 + hash(i, 35) * 0.08, Math.sin(a) * r0], [Math.cos(a1) * r1, 0.06 + hash(i, 36) * 0.14, Math.sin(a1) * r1]], [[0.012, 0.01], [0.006, 0.005]], [[BA, 1], [BA, 1]], { n: 4 });
  }
  // a name badge on its lanyard, woven into the rim
  const bd: V3 = [0.48, 0.24, 0.26];
  sac(B, R('BADGE'), 20, [[bd[0] - 0.035, bd[1], bd[2]], [bd[0] + 0.035, bd[1] + 0.01, bd[2]]], [[0.025, 0.004], [0.025, 0.004]], [[BA, 1], [BA, 1]], { n: 4 });
  // eggs: speckled, pointed
  EGG_AT.forEach((e, i) => {
    const E = x.bi('egg' + i);
    const prof: [number, number][] = [[-0.9, 0.5], [-0.5, 0.92], [0, 1], [0.5, 0.82], [0.9, 0.38], [1, 0.08]];
    sac(B, R('EGG'), 30 + i, prof.map(([yy]) => [e[0] + yy * 0.03, e[1], e[2] + yy * 0.085] as V3), prof.map(([, r]) => [0.06 * r, 0.06 * r] as [number, number]), prof.map(() => [E, 1] as Wt), { n: 8 });
  });
  // chicks: fluffy grey down, big heads, the begging gape
  CHICK_AT.forEach((c, i) => {
    const CK = x.bi('ck' + i), CN = x.bi('cn' + i), CHh = x.bi('ch' + i), CB = x.bi('cb' + i);
    sac(B, R('DOWN'), 40 + i, [[c[0], c[1] + 0.02 * CS_, c[2] - 0.09 * CS_], [c[0], c[1] + 0.05 * CS_, c[2] - 0.04 * CS_], [c[0], c[1] + 0.06 * CS_, c[2] + 0.02 * CS_], [c[0], c[1] + 0.06 * CS_, c[2] + 0.06 * CS_]],
      [[0.03 * CS_, 0.03 * CS_], [0.075 * CS_, 0.065 * CS_], [0.08 * CS_, 0.07 * CS_], [0.05 * CS_, 0.05 * CS_]], [[CK, 1], [CK, 1], [CK, 1], [CK, 0.5, CN, 0.5]], { n: 9, bump: (a, t) => Math.sin(a * 9 + t * 20) * 0.08 });
    const cn = x.rest('cn' + i), ch = x.rest('ch' + i), cb = x.rest('cb' + i);
    sac(B, R('DOWN'), 44 + i, [cn, [cn[0], (cn[1] + ch[1]) / 2, (cn[2] + ch[2]) / 2], [ch[0], ch[1] - 0.02 * CS_, ch[2] - 0.035 * CS_], [ch[0], ch[1] + 0.01 * CS_, ch[2]], [ch[0], ch[1] + 0.005 * CS_, ch[2] + 0.03 * CS_]],
      [[0.035 * CS_, 0.035 * CS_], [0.03 * CS_, 0.03 * CS_], [0.045 * CS_, 0.045 * CS_], [0.05 * CS_, 0.048 * CS_], [0.03 * CS_, 0.03 * CS_]], [[CN, 1], [CN, 0.5, CHh, 0.5], [CHh, 1], [CHh, 1], [CHh, 1]], { n: 9, bump: (a) => Math.sin(a * 11) * 0.07 });
    sac(B, R('BEAK'), 48 + i, [[ch[0], ch[1] + 0.004 * CS_, ch[2] + 0.03 * CS_], [ch[0], ch[1] + 0.002 * CS_, ch[2] + 0.06 * CS_], [ch[0], ch[1] - 0.004 * CS_, ch[2] + 0.075 * CS_]], [[0.016 * CS_, 0.01 * CS_], [0.01 * CS_, 0.007 * CS_], [0.002 * CS_, 0.002 * CS_]], [[CHh, 1], [CHh, 1], [CHh, 1]], { n: 6, start: false });
    sac(B, R('GAPE'), 52 + i, [[cb[0], cb[1], cb[2] - 0.005 * CS_], [cb[0], cb[1] - 0.002 * CS_, cb[2] + 0.02 * CS_], [cb[0], cb[1], cb[2] + 0.034 * CS_]], [[0.016 * CS_, 0.007 * CS_], [0.011 * CS_, 0.006 * CS_], [0.002 * CS_, 0.002 * CS_]], [[CB, 1], [CB, 1], [CB, 1]], { n: 6, start: false });
    for (const k of [1, -1]) sac(B, R('EYE'), 56 + i, [[ch[0] + k * 0.036, ch[1] + 0.016 * CS_, ch[2] + 0.004 * CS_], [ch[0] + k * 0.046, ch[1] + 0.016 * CS_, ch[2] + 0.004 * CS_]], [[0.009 * CS_, 0.009 * CS_], [0.002 * CS_, 0.002 * CS_]], [[CHh, 1], [CHh, 1]], { n: 6, start: true });
    // stubby wing nubs
    for (const k of [1, -1]) sac(B, R('DOWN'), 60 + i, [[c[0] + k * 0.06, c[1] + 0.07 * CS_, c[2]], [c[0] + k * 0.085, c[1] + 0.05 * CS_, c[2] - 0.04 * CS_]], [[0.022 * CS_, 0.012 * CS_], [0.008 * CS_, 0.006 * CS_]], [[CK, 1], [CK, 1]], { n: 5 });
  });
}
function paintN(p: Page) {
  const CP = makeRamp(0x6a5a44, 7, { hueShift: 0.05, spread: 0.9 });
  paintCloth(p.R('RIM'), CP, { seed: 3, folds: 18, holes: 14, hole: 0x1a140c, stain: 8 });
  // fibres: pink insulation, yellow carpet, white tile crumbs, grey felt, all twisted round
  const rim = p.R('RIM'); for (let i = 0; i < 70; i++) rim.crack(hash(i, 2) * rim.w, hash(i, 3) * rim.h, 6 + (i % 5), hash(i, 4) * 360, [0xc87a7a, 0xc8a838, 0xe0dcd0, 0x8a8478, 0x4a3a28][i % 5], i, 0.8, 0);
  const fl = p.R('FLOOR');
  paintFeathers(fl, makeRamp(0x5a5248, 6, { spread: 0.7 }), { seed: 5, rows: 6, cols: 8, base: 2.2 });
  for (let i = 0; i < 20; i++) fl.crack(hash(i, 7) * fl.w, hash(i, 8) * fl.h, 6, hash(i, 9) * 360, 0x4a3a28, i, 0.6, 0);
  paintCloth(p.R('STRIP'), makeRamp(0xc8a838, 6, { spread: 0.8 }), { seed: 7, folds: 2, holes: 3 });
  const tl = p.R('TILE'); tl.fill(makeRamp(0xd8d4c8, 5), (xx, yy) => 3 + (tl.fbm(xx, yy, 3, 2, 8) - 0.5) * 1.5 + (hash(xx, yy) < 0.12 ? -1.5 : 0));
  const eg = p.R('EGG'); eg.fill(makeRamp(0xa8b088, 6), (xx, yy) => 3.2 + Math.cos((eg.deg(xx) * Math.PI) / 180) * 1.3 + (eg.fbm(xx, yy, 2, 2, 4) - 0.5));
  for (let i = 0; i < 26; i++) eg.ellipse(hash(i, 5) * eg.w, hash(i, 6) * eg.h, 0.6 + hash(i, 7) * 1.2, 0.6 + hash(i, 8), i % 2 ? 0x3a2a18 : 0x5a4a30, 1);
  paintFeathers(p.R('DOWN'), makeRamp(0x9a9890, 6, { spread: 0.7 }), { seed: 11, rows: 10, cols: 14, base: 3 });
  const dn = p.R('DOWN'); for (let i = 0; i < 30; i++) dn.blend(hash(i, 9) * dn.w, hash(i, 10) * dn.h, 0x3a3a38, 0.5);
  p.R('BEAK').fill(makeRamp(0x4a4038, 4), () => 2);
  p.R('GAPE').fill(makeRamp(0xf06020, 5), (xx) => 2.5 + Math.cos((p.R('GAPE').deg(xx) * Math.PI) / 180));
  p.R('EYE').fill(makeRamp(0x101010, 3), () => 1); p.R('EYE').set(2, 2, 0xffffff);
  paintFeathers(p.R('FEATH'), makeRamp(0x9aa0a8, 6), { seed: 13, rows: 4, cols: 2, base: 3.4, tip: makeRamp(0x1c1c20, 4), tipFrom: 0.75 });
  const bg = p.R('BADGE'); bg.rect(0, 0, bg.w, bg.h, 0xf0ece0); bg.rect(1, 1, 4, 5, 0x8a7a6a); bg.hline(6, 10, 2, 0x2a2a2a); bg.hline(6, 9, 4, 0x4a4a4a); bg.hline(0, bg.w, 0, 0xc82020);
  paintCap(p.R('CAP'), 0x9a9890, 0xc86040, 0x3a1010);
}
const NEST_KIT: KitDef = { key: 'gull_nest', variants: 1, W: 128, H: 128, bones: bonesN, layout: layoutN, build: buildN, paint: paintN, sphere: [0, 0.15, 0, 1.0] };
function buildNest(): Rig { return buildKitRig(NEST_KIT, 0, 0.3); }
function animateNest(rig: Rig, c: Creature, t: number, dt: number) {
  const K = rig as KitRig;
  kitSync(K);
  const P = rig.parts, n = netOf(c), seed = hashId(c.id);
  const eggs = Number(n.e ?? 2), chicks = Number(n.k ?? 2);
  for (let i = 0; i < 3; i++) { const e = P['egg' + i]; if (e) e.scale.setScalar(i < eggs ? 1 : 0.0001); }
  // chicks: heads up and gaping when anything comes near (they think it is the parent), else dozing
  const near = nearestSurvivor(c, 6);
  for (let i = 0; i < 3; i++) {
    const ck = P['ck' + i]; if (!ck) continue;
    ck.scale.setScalar(i < chicks ? 1 : 0.0001);
    const beg = near ? Math.max(0, Math.sin(t * 1.3 + i * 2.1)) : Math.max(0, Math.sin(t * 0.35 + i * 2 + seed * 5)) > 0.8 ? 0.7 : 0;
    const sh = Math.sin(t * 17 + i * 3) * beg;
    ck.rotation.set(-beg * 0.15, Math.sin(t * 0.4 + i) * 0.3, sh * 0.05);
    P['cn' + i]?.rotation.set(-beg * 0.9 + 0.5 * (1 - beg), Math.sin(t * 2.3 + i) * 0.4 * beg, 0);
    P['ch' + i]?.rotation.set(-beg * 0.5 + sh * 0.1, 0, Math.sin(t * 3 + i) * 0.2);
    P['cb' + i]?.rotation.set(beg * (0.55 + Math.sin(t * 25 + i) * 0.08), 0, 0);
    const br = 1 + Math.sin(t * 4 + i * 1.3) * 0.04;
    ck.scale.multiplyScalar(br);
  }
  const F = K.kit.F.fx.value; F.y += dt; F.z = Math.min(1, c.hitFlash / 0.15) * 0.4;
  // peeping
  const ud = rig.root.userData as Record<string, number>;
  if (chicks > 0 && near && near.d < 7 && t > (ud.peep ?? 0)) { ud.peep = t + 0.6 + Math.random() * 1.2; playAt('cower_squeak', c, 0.25, 8, 1.6 + Math.random() * 0.3); }
}
function thinkNest(c: Creature, dt: number): boolean {
  const n = net(c), m = c.mem;
  stop(c); void dt;
  const parent = () => { const g = CS().creatures.get(String(m.parent ?? '')); return g && !g.dead ? g : null; };
  for (const [kind, k] of [['egg', 'e'], ['feather', 'f']] as const) {
    const by = poked(c, kind);
    if (!by || (n[k] ?? 0) <= 0) continue;
    n[k] = Math.max(0, (n[k] ?? 0) - 1);
    // the parent hears its chicks: it comes for whoever did it, wherever it is
    const g = parent();
    if (g && G.players.has(by)) {
      const d = dist(g, c);
      if (kind === 'egg' || d < 9) { g.mem.fury = { pid: by, until: G.time + (kind === 'egg' ? 30 : 15) }; scream(g); }
    }
  }
  return true;
}
const NEST = def({
  key: 'gull_nest', name: 'Stilt Gull Nest', code: 'IN-40n // NEST', temperament: 'peaceful', threat: 0,
  hp: 40, walk: 0, run: 0, turn: 0, radius: 0.6, height: 0.3, sight: 0, fov: 0, hearing: 0,
  zones: [], weight: 0, maxPerZone: 2, diet: 'none',
  flags: { noCorpse: true, attached: true },
  sounds: { hurt: 'cower_squeak' },
  scan: { cls: 'Nest', notes: ['Shredded carpet, ceiling tile and wallpaper in a wide bowl, lined with moulted blade feathers.', 'Speckled eggs and grey chicks that beg at anything that comes close.', 'The parent hears them from across the level.'] },
  gore: { blood: 'stuffing', flesh: 0xb89a48, gib: false },
  remains: 'none',
  build: buildNest, animate: animateNest, think: thinkNest,
});
creatureMenu('gull_nest', (p, c, opts) => {
  const n = netOf(c);
  const give = (key: string, kind: string, line: string[]) => () => {
    const it = createItem(key);
    p.inv.add(it);
    bus.emit('inventoryChanged', p);
    poke(p, c, kind);
    bus.emit('think', p, line[Math.floor(Math.random() * line.length)]);
  };
  if ((n.e ?? 0) > 0) opts.push({ label: 'Take an egg', action: () => queueAt(p, c.x, c.z, new UseObjectAction(p, 'Take egg', 1.6, 'pickup', give('gull_egg', 'egg', ['Still warm. The chicks are screaming.', 'Heavy as a stone. Speckled like one.', 'Got it. Now go. GO.'])), 1.2, false) });
  if ((n.f ?? 0) > 0) opts.push({ label: 'Pull a blade feather from the lining', action: () => queueAt(p, c.x, c.z, new UseObjectAction(p, 'Pull feather', 1.2, 'pickup', give('gull_feather', 'feather', ['The edge is sharper than my knife.', 'Careful. It opened my glove.', 'A feather you could shave with.'])), 1.2, false) });
});
NEST.animateGallery = (rig: Rig, t: number) => { animateNest(rig, fakeCreature(NEST, { id: 'ng', mem: { netMem: { e: 2, k: 3 } } }), t, 1 / 60); };

void THREE; void mixHex;
