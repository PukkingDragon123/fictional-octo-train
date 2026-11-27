import { horrify } from '../kit/horror';
import { def, Rig } from '../species';
import { makeRamp } from '../../gfx/pixel';
import type { Creature } from '../creature';
import { CS, zoneOf, pulse, stop, findSpot, faceTo } from '../behaviors_a';
import { net, netOf, playAt, hashId, rng, localIn, thinkOnce, dist, playersIn } from '../behaviors_b';
import { KitDef, KitRig, BoneSpec, SkinB, BuildCtx, Page, Wt, buildKitRig, kitSync, kitPersonalize, flinchOf, hash } from '../kit/humanoids';
import { sac, paintSkin, paintEye, paintCap } from '../kit/organic';
import { addInhabitant } from '../lore';
import '../../audio/sounds_creatures_c';

// =====================================================================================
// PALLID HEN — a hen with no feathers, the colour and sheen of candle wax, every
// pore of the plucked skin standing up in goosebumps. The neck is too long by half
// and folds in an S when she settles; the comb is a pale pink frill, the eyes milky.
// Under each folded wing is a hidden lining of white down, the only soft thing on
// her. She pecks, she mutters, she lays a long waxy egg every half day if she is fed,
// and at night she folds her legs under her, lays the neck down her back and tucks
// her head under a wing. Docile: offer her cress or feed by hand and she follows.
//   pale_hen   skinned kit rig: plucked waxy body, folded wings over down linings,
//              S-neck, pink frill comb and wattle, scaled legs, three-toed feet
// Loops (net 'pn' from the pen, or her own brain): walk (head-bob), eat (peck), sleep (settled, head tucked), idle.
// =====================================================================================

const SIDES = [['L', 1], ['R', -1]] as const;
function bonesH(v: number): BoneSpec[] {
  const s = 1 + v * 0.06;
  const b: BoneSpec[] = [
    { name: 'base', parent: '', at: [0, 0, 0] },
    { name: 'body', parent: 'base', at: [0, 0.2 * s, 0] },
    { name: 'neck', parent: 'body', at: [0, 0.05, 0.075], cap: true },
    { name: 'neck2', parent: 'neck', at: [0, 0.07, 0.03] },
    { name: 'head', parent: 'neck2', at: [0, 0.06, 0.02], cap: true },
    { name: 'tail', parent: 'body', at: [0, 0.035, -0.1] },
  ];
  for (const [sd, k] of SIDES) {
    b.push({ name: 'wing' + sd, parent: 'body', at: [k * 0.072, 0.03, 0.01] });
    b.push({ name: 'thigh' + sd, parent: 'body', at: [k * 0.042, -0.05, 0.0] }, { name: 'shin' + sd, parent: 'thigh' + sd, at: [0, -0.07, -0.012] }, { name: 'foot' + sd, parent: 'shin' + sd, at: [0, -0.072, 0.012] });
  }
  return b;
}
function layoutH(p: Page) { p.reg('SKIN', 64, 48); p.reg('NECK', 32, 24); p.reg('HEAD', 16, 16); p.reg('DOWN', 32, 16); p.reg('COMB', 16, 8); p.reg('BEAK', 8, 8); p.reg('EYE', 8, 8); p.reg('LEG', 16, 16); p.reg('CAP', 8, 8); }
function buildH(B: SkinB, x: BuildCtx) {
  const bi = x.bi, R = x.R, v = x.variant;
  const Bd = x.rest('body'), wB: Wt = [bi('body'), 1], wT: Wt = [bi('tail'), 1];
  // the body: an egg of plucked skin, deep in the breast, a goose-pimpled ridge down the keel
  const y = Bd[1];
  sac(B, R('SKIN'), 1,
    [[0, y + 0.04, -0.13], [0, y + 0.02, -0.09], [0, y + 0.005, -0.03], [0, y - 0.005, 0.03], [0, y + 0.005, 0.08], [0, y + 0.03, 0.11]],
    [[0.012, 0.014], [0.06, 0.058], [0.088, 0.08], [0.088, 0.086], [0.07, 0.07], [0.03, 0.034]],
    [wT, [bi('tail'), 0.4, bi('body'), 0.6], wB, wB, wB, [bi('body'), 0.6, bi('neck'), 0.4]],
    { n: 18, up: [0, 1, 0], bump: (a, t) => (hash(Math.round(a * 9), Math.round(t * 22) + v) - 0.5) * 0.05 + (Math.abs(Math.cos(a)) > 0.96 && Math.sin(a) < 0 ? 0.06 : 0) });
  // the tail: a stub with five bare quills fanned up
  const T = x.rest('tail');
  for (let i = 0; i < 5; i++) {
    const a = (i - 2) * 0.35;
    sac(B, R('NECK'), 2, [[T[0] + Math.sin(a) * 0.01, T[1], T[2]], [T[0] + Math.sin(a) * 0.035, T[1] + 0.05, T[2] - 0.03], [T[0] + Math.sin(a) * 0.05, T[1] + 0.085, T[2] - 0.035]], [[0.006, 0.004], [0.004, 0.003], [0.0012, 0.0012]], [wT, wT, wT], { n: 5 });
  }
  // the wings: folded flat against the flanks, bare skin over, the white down lining fluffing out below
  for (const [sd, k] of SIDES) {
    const W = x.rest('wing' + sd), wW: Wt = [bi('wing' + sd), 1];
    sac(B, R('SKIN'), 3, [[W[0], W[1] + 0.01, W[2] + 0.05], [W[0] + k * 0.014, W[1], W[2] - 0.01], [W[0] + k * 0.012, W[1] - 0.01, W[2] - 0.08], [W[0] + k * 0.004, W[1] - 0.012, W[2] - 0.12]],
      [[0.02, 0.03], [0.014, 0.05], [0.012, 0.045], [0.004, 0.012]], [wW, wW, wW, wW], { n: 8, up: [k, 0, 0] });
    sac(B, R('DOWN'), 4, [[W[0] + k * 0.004, W[1] - 0.04, W[2] + 0.04], [W[0] + k * 0.01, W[1] - 0.05, W[2] - 0.02], [W[0] + k * 0.006, W[1] - 0.048, W[2] - 0.08]],
      [[0.016, 0.014], [0.02, 0.018], [0.01, 0.01]], [wW, wW, wW], { n: 9, bump: (a, t) => (hash(Math.round(a * 7), Math.round(t * 9) + 3) - 0.5) * 0.45 });
    // legs: the scaled shank, a thigh of plucked skin, three toes forward and one back
    const Th = x.rest('thigh' + sd), Sh = x.rest('shin' + sd), F = x.rest('foot' + sd);
    sac(B, R('SKIN'), 5, [[Th[0], Th[1] + 0.03, Th[2]], Th, [Sh[0], Sh[1] + 0.01, Sh[2]]], [[0.03, 0.03], [0.022, 0.024], [0.012, 0.012]], [wB, [bi('thigh' + sd), 1], [bi('thigh' + sd), 0.5, bi('shin' + sd), 0.5]], { n: 8 });
    sac(B, R('LEG'), 6, [Sh, [(Sh[0] + F[0]) / 2, (Sh[1] + F[1]) / 2, (Sh[2] + F[2]) / 2], F], [[0.008, 0.008], [0.0065, 0.0065], [0.007, 0.006]], [[bi('shin' + sd), 1], [bi('shin' + sd), 1], [bi('foot' + sd), 1]], { n: 6 });
    const wf: Wt = [bi('foot' + sd), 1];
    for (const ta of [-0.55, 0, 0.55, Math.PI]) {
      const L = ta === Math.PI ? 0.022 : 0.04;
      sac(B, R('LEG'), 7, [[F[0], F[1] - 0.004, F[2]], [F[0] + Math.sin(ta) * L * 0.5, F[1] - 0.008, F[2] + Math.cos(ta) * L * 0.5], [F[0] + Math.sin(ta) * L, F[1] - 0.01, F[2] + Math.cos(ta) * L]], [[0.005, 0.004], [0.0035, 0.003], [0.0012, 0.001]], [wf, wf, wf], { n: 5 });
    }
  }
  // the neck: long, bare, ringed with creases, an S when it settles
  const N0 = x.rest('neck'), N1 = x.rest('neck2'), H = x.rest('head');
  sac(B, R('NECK'), 8, [[N0[0], N0[1] - 0.03, N0[2] - 0.02], N0, [(N0[0] + N1[0]) / 2, (N0[1] + N1[1]) / 2, (N0[2] + N1[2]) / 2], N1, [H[0], H[1] - 0.025, H[2] - 0.008]],
    [[0.04, 0.04], [0.027, 0.028], [0.021, 0.022], [0.019, 0.019], [0.017, 0.017]],
    [wB, [bi('neck'), 1], [bi('neck'), 0.5, bi('neck2'), 0.5], [bi('neck2'), 1], [bi('neck2'), 0.5, bi('head'), 0.5]],
    { n: 12, bump: (_a, t) => Math.sin(t * 40) * 0.06 });
  // the head: small, round at the back, the frill comb, a wattle, a horn beak, milky eyes
  const wH: Wt = [bi('head'), 1];
  sac(B, R('HEAD'), 9, [[H[0], H[1] + 0.002, H[2] - 0.028], [H[0], H[1] + 0.008, H[2] - 0.004], [H[0], H[1] + 0.002, H[2] + 0.02], [H[0], H[1] - 0.006, H[2] + 0.03]], [[0.012, 0.016], [0.026, 0.028], [0.021, 0.022], [0.01, 0.01]], [wH, wH, wH, wH], { n: 10 });
  for (let i = 0; i < 4; i++) {
    const zc = H[2] - 0.016 + i * 0.013, hh = 0.02 + Math.sin((i / 3) * Math.PI) * 0.01;
    sac(B, R('COMB'), 10, [[H[0], H[1] + 0.025, zc], [H[0], H[1] + 0.025 + hh * 0.6, zc + 0.002], [H[0], H[1] + 0.025 + hh, zc + 0.004]], [[0.004, 0.008], [0.003, 0.007], [0.001, 0.003]], [wH, wH, wH], { n: 6, up: [1, 0, 0] });
  }
  sac(B, R('COMB'), 11, [[H[0], H[1] - 0.012, H[2] + 0.02], [H[0], H[1] - 0.026, H[2] + 0.024], [H[0], H[1] - 0.036, H[2] + 0.02]], [[0.007, 0.004], [0.008, 0.005], [0.002, 0.002]], [wH, wH, wH], { n: 6, up: [1, 0, 0] });
  sac(B, R('BEAK'), 12, [[H[0], H[1] - 0.002, H[2] + 0.028], [H[0], H[1] - 0.004, H[2] + 0.042], [H[0], H[1] - 0.009, H[2] + 0.054]], [[0.01, 0.008], [0.006, 0.005], [0.0012, 0.0012]], [wH, wH, wH], { n: 6 });
  for (const [, k] of SIDES) sac(B, R('EYE'), 13, [[H[0] + k * 0.019, H[1] + 0.01, H[2] + 0.006], [H[0] + k * 0.024, H[1] + 0.01, H[2] + 0.01], [H[0] + k * 0.026, H[1] + 0.01, H[2] + 0.012]], [[0.006, 0.006], [0.0075, 0.0075], [0.002, 0.002]], [wH, wH, wH], { n: 6 });
}
function paintH(p: Page, x: BuildCtx) {
  const v = x.variant;
  const WAX = makeRamp([0xeee2d2, 0xf2e6dc, 0xe6dcd0][v % 3], 7, { hueShift: 0.04, spread: 0.45 });
  // the skin: waxy, pinkish in the folds, every follicle a raised pimple with a dark pore, faint blue veins
  const sk = p.R('SKIN');
  paintSkin(sk, WAX, { seed: 11 + v, veins: 5, vein: 0xb8c0d8, mottle: 0.7, glint: 22 });
  for (let yy = 1; yy < sk.h; yy += 3) for (let xx = (yy % 2) * 2; xx < sk.w; xx += 4) { sk.blend(xx, yy, 0xc8a8a0, 0.55); sk.blend(xx + 1, yy - 1, 0xfff8f0, 0.45); }
  for (let i = 0; i < 10; i++) sk.glow(hash(i, 31) * sk.w, hash(i, 32) * sk.h, 3, 4, 0xe8b8b0, 0.3);
  const nk = p.R('NECK');
  paintSkin(nk, WAX, { seed: 21 + v, veins: 2, vein: 0xc8b0b0, mottle: 0.6, glint: 8 });
  for (let yy = 2; yy < nk.h; yy += 4) for (let xx = 0; xx < nk.w; xx++) nk.blend(xx, yy, 0xb89890, 0.4);
  paintSkin(p.R('HEAD'), WAX, { seed: 41 + v, veins: 1, mottle: 0.5, glint: 4 });
  // the down: white fluff, cool shadows between the tufts
  const dn = p.R('DOWN');
  dn.fill(makeRamp(0xf4f0ea, 5, { spread: 0.35 }), (xx, yy) => 3 + (dn.fbm(xx, yy, 2, 2, 7) - 0.5) * 2 + ((xx * 3 + yy) % 5 === 0 ? -1 : 0));
  // the comb and wattle: a pale flesh-pink frill, darker at the edges
  p.R('COMB').fill(makeRamp(0xe89a9a, 5, { spread: 0.5 }), (xx, yy) => 3 - yy * 0.25 + (hash(xx, yy) - 0.5));
  p.R('BEAK').fill(makeRamp(0xc8b890, 4), (xx, yy) => 2.4 - yy * 0.2 + (hash(xx, yy) - 0.5) * 0.4);
  paintEye(p.R('EYE'), 0xc8d0d8, 0x1a1a22, 0xe8e0d8);
  p.R('LEG').fill(makeRamp(0xc89a90, 5, { spread: 0.5 }), (xx, yy) => 2.5 + ((xx + (yy >> 1)) % 3 === 0 ? -0.8 : 0.3) + (hash(xx, yy) - 0.5) * 0.5);
  paintCap(p.R('CAP'), 0xeee2d2, 0xd89890, 0x8a3a3a);
}
const HEN_KIT: KitDef = { key: 'pale_hen', variants: 3, W: 128, H: 128, bones: bonesH, layout: layoutH, build: buildH, paint: paintH, sphere: [0, 0.25, 0, 0.36] };
function buildHen(): Rig { return buildKitRig(HEN_KIT, 0, 0.42); }

// ------------------------------------------------------------------ the loops: walk, eat, sleep, idle
interface HenDrive { t: number; dt: number; speed: number; peck: number; sleep: number; dead: number; seed: number; flinch: number }
function poseHen(K: KitRig, d: HenDrive) {
  const P = K.parts, ud = K.kit.m as Record<string, number>, t = d.t, s7 = d.seed * 7;
  const mv = Math.min(1, d.speed / 0.3) * (1 - d.dead) * (1 - d.sleep);
  ud.wph = (ud.wph ?? 0) + d.dt * d.speed * 22;
  const st = Math.sin(ud.wph);
  const saw = ((ud.wph / (Math.PI * 2)) % 1 + 1) % 1;
  const bob = mv * (saw < 0.3 ? saw / 0.3 : 1 - (saw - 0.3) / 0.7) * 0.035;
  const sl = d.sleep, breathe = Math.sin(t * (sl > 0.5 ? 1.1 : 2.2) + s7);
  // settled: the legs folded under, the body down on the straw, rocking with breath
  P.base.position.set(0, 0, 0);
  P.body.position.set(0, (P.body.userData.p0?.y ?? 0.2) - sl * 0.12 - d.dead * 0.14, 0);
  P.body.rotation.set(0.06 * mv + d.peck * 0.22 - sl * 0.05 + d.dead * 0.2, 0, st * 0.1 * mv + Math.sin(t * 0.6 + s7) * 0.02 * (1 - sl) + d.dead * 1.2);
  P.body.scale.set(1 + breathe * 0.012 + sl * 0.05, 1 + breathe * 0.015 - sl * 0.04, 1);
  // the neck: the bob when walking, the peck when eating, an S laid down the back asleep
  const pk = d.peck * Math.max(0, Math.sin(t * 6.5 + s7)) ** 2;
  P.neck.position.set(0, P.neck.userData.p0?.y ?? 0.05, (P.neck.userData.p0?.z ?? 0.075) + bob);
  P.neck.rotation.set(0.45 * d.peck + pk * 0.7 - sl * 0.9 + d.dead * 1.1, Math.sin(t * 0.8 + s7) * 0.35 * (1 - d.peck) * (1 - mv) * (1 - sl), 0);
  P.neck2.rotation.set(0.35 * d.peck + pk * 0.4 + sl * 1.6, sl * 0.5, 0);
  P.head.rotation.set(-0.2 * d.peck + sl * 0.6, (Math.sin(t * 2.1 + s7) > 0.6 ? 0.6 : -0.15) * (1 - sl) + sl * 1.3, sl * 0.4);
  for (const [sd, k] of SIDES) {
    // wings: a shrug now and then, lifted a little asleep to take the head
    const flap = Math.max(0, Math.sin(t * 0.37 + k + s7) - 0.92) * 8;
    P['wing' + sd].rotation.set(Math.sin(t * 0.9 + k) * 0.04, 0, k * (0.05 + flap * 0.5 + sl * (k > 0 ? 0.35 : 0.08) + mv * 0.08 * Math.max(0, k * st) + d.dead * 0.5));
    const ph = k * st * mv;
    P['thigh' + sd].rotation.set(-ph * 0.55 - sl * 1.1 + d.dead * 0.8, 0, k * (0.04 + sl * 0.15));
    P['shin' + sd].rotation.set(Math.max(0, ph) * 0.8 + sl * 2.2, 0, 0);
    P['foot' + sd].rotation.set(-Math.max(0, ph) * 0.4 - sl * 1.1, 0, 0);
  }
  P.tail.rotation.set(-0.15 + Math.sin(t * 1.4) * 0.04 - sl * 0.2, 0, st * 0.12 * mv);
  if (d.flinch > 0) P.body.position.x += Math.sin(t * 80) * 0.012 * d.flinch;
}
function animateHen(rig: Rig, c: Creature, t: number, dt: number) {
  const K = rig as KitRig;
  const v = Math.floor(hashId(c.id) * 3);
  if (K.kit.who !== c.id) { K.kit.who = c.id; kitPersonalize(K, v); }
  kitSync(K);
  const n = netOf(c), ud = K.kit.m as Record<string, number>;
  const sm = (k: string, to: number, r: number) => (ud[k] = (ud[k] ?? to) + (to - (ud[k] ?? to)) * Math.min(1, dt * r));
  const eat = n.pn === 'eat' || n.md === 'peck' ? 1 : 0, sleep = n.pn === 'sleep' || n.md === 'sleep' ? 1 : 0;
  poseHen(K, { t, dt, speed: c.dead ? 0 : c.speed, peck: sm('pk', eat, 5), sleep: sm('sl', sleep, 1.5), dead: c.dead ? 1 : 0, seed: hashId(c.id, 5), flinch: flinchOf(c) });
  // a chick hatched in the pen is small for its first day
  if (n.yg) { K.root.scale.setScalar(0.6); ud.wasY = 1; } else if (ud.wasY) { K.root.scale.setScalar(1); ud.wasY = 0; }
  const F = K.kit.F.fx.value; F.y += dt; F.z = Math.min(1, c.hitFlash / 0.15) * 0.4;
  const p = localIn(c);
  if (p && !c.dead && c.visibleToLocal && dist(p, c) < 4) thinkOnce(p, 'pale_hen', ['A hen with no feathers. Her skin is all goosebumps, the colour of a candle.', 'She muttered at me and went on pecking. There is down under her wings, white as cotton.'][Math.floor(t * 0.2) % 2], 100);
}

// ------------------------------------------------------------------ host brain: peck about, mutter, settle at night, shuffle off
function thinkHen(c: Creature, dt: number): boolean {
  const cs = CS(), z = zoneOf(c), m = c.mem, n = net(c);
  const ev = pulse(c);
  let near: { x: number; z: number; d: number; fast: boolean; food: boolean } | null = null;
  for (const p of playersIn(c.zoneKey)) {
    const d = dist(p, c);
    // someone carrying what she eats is not a threat: she lets them come (that is how she is tamed)
    if (d < 3 && (!near || d < near.d)) near = { x: p.x, z: p.z, d, fast: (p.speed ?? 0) > 3.2, food: !!(c.sp.tame && p.findItem?.((i: { key: string }) => c.sp.tame!.food.includes(i.key))) };
  }
  if (ev.hurt > 0 || (near && !near.food && (near.fast ? near.d < 2.2 : near.d < 0.8))) { m.shoo = 2.5; m.from = near ?? { x: c.x, z: c.z }; }
  m.shoo = Math.max(0, (m.shoo ?? 0) - dt);
  if (m.shoo > 0) {
    n.md = ''; c.setState('flee');
    if (!c.goal || c.stateT > 3) { c.goal = cs.fleeSpot(c, z, m.from.x, m.from.z); c.stateT = 0; playAt('bird_flap', c, 0.35, 8, 0.8); }
    cs.moveTo(c, z, c.goal.x, c.goal.z, c.sp.run, dt, 0.4);
    return true;
  }
  // food in a hand: she comes to it and waits there, head cocked
  if (near?.food && !c.tamedBy) {
    n.md = ''; c.setState('idle');
    if (near.d > 1.1) cs.moveTo(c, z, near.x, near.z, c.sp.walk, dt, 1.0); else { stop(c); faceTo(c, near.x, near.z); }
    return true;
  }
  if (n.md === 'peck' || n.md === 'sleep') {
    stop(c);
    if (n.md === 'peck' && c.noiseCooldown <= 0 && rng.chance(0.3)) { playAt('birds_dream', c, 0.25, 8, 0.75 + rng.float(0, 0.1)); c.noiseCooldown = 4; }
    if (c.stateT > (m.mdT ?? 4)) { n.md = ''; c.setState('wander'); c.goal = null; }
    return true;
  }
  c.setState('wander');
  if (!c.goal || cs.moveTo(c, z, c.goal.x, c.goal.z, c.sp.walk, dt, 0.3) || c.stateT > 14) {
    if (c.goal && rng.chance(0.75)) { n.md = rng.chance(0.85) ? 'peck' : 'sleep'; m.mdT = n.md === 'sleep' ? rng.float(10, 25) : rng.float(3, 8); c.setState('idle'); return true; }
    c.goal = findSpot(c, { rMin: 1.5, rMax: 6 }) ?? cs.wanderSpot(c, z, 6);
    c.stateT = 0;
  }
  return true;
}

const HEN = def({
  key: 'pale_hen', name: 'Pallid Hen', code: 'LV-07 // FAUNA, GALLIFORM (PLUCKED)', temperament: 'skittish', threat: 0,
  rule: { name: 'SHE ONLY LAYS', text: 'Harmless. A featherless hen the colour of wax. She pecks, mutters and lays, and runs from anything that runs at her. Offer her cress or feed by hand and she follows you home.', tell: 'A plucked hen in goosebumps, too long in the neck, pecking at the carpet.' },
  hp: 8, walk: 0.32, run: 1.4, turn: 6, radius: 0.16, height: 0.42, sight: 7, fov: 2.6, hearing: 1,
  zones: ['house', 'suburbs', 'fields', 'office'], weight: 0.8, group: [2, 4], maxPerZone: 6, diet: 'none',
  meat: [['bird_meat_raw', 1]],
  sounds: { hurt: 'cower_squeak', death: 'cower_die', idle: 'birds_dream' },
  scan: { cls: 'Fauna / galliform, plucked', notes: ['A domestic hen with no feathers at all: waxy skin, every follicle raised, a pale frill comb.', 'The neck is half again too long and folds into an S when she settles.', 'A lining of white down grows under each wing, the only soft thing on her.', 'She lays a long waxy egg every half day if fed and watered. Kept warm, the eggs hatch.'] },
  gore: { blood: 'red', tint: 0xf0e0d8, flesh: 0xe8c8c0, sever: ['head', 'neck', 'wingL', 'wingR'], head: 'head' },
  build: buildHen, animate: animateHen, think: thinkHen,
});
HEN.animateGallery = (rig: Rig, t: number) => {
  const q = new URLSearchParams(location.search).get('pose') || ['peck', 'walk', 'sleep', 'idle'][Math.floor(t / 4.5) % 4];
  const K = rig as KitRig; kitSync(K);
  const ud = K.kit.m as Record<string, number>;
  ud.gsl = (ud.gsl ?? 0) + ((q === 'sleep' ? 1 : 0) - (ud.gsl ?? 0)) * 0.03;
  ud.gpk = (ud.gpk ?? 0) + ((q === 'peck' ? 1 : 0) - (ud.gpk ?? 0)) * 0.08;
  poseHen(K, { t, dt: 1 / 60, speed: q === 'walk' ? 0.3 : 0, peck: ud.gpk, sleep: ud.gsl, dead: 0, seed: 0.3, flinch: 0 });
};
horrify(HEN, { twitch: 0.25, snap: 0.12, parts: /head|neck/ });


addInhabitant({
  id: 'pale_hen', name: 'Pallid Hen', rank: 'sloth', class: 'Fauna', danger: 0,
  summary: 'A domestic hen with no feathers at all, the colour and sheen of candle wax, every follicle raised in a goosebump, a pale pink frill of comb and a neck half again too long.',
  biology: 'The skin is warm and slightly greasy; under each folded wing grows a lining of fine white down, the only soft thing on her. She lays a long, waxy, faintly translucent egg every half day when fed and watered. The fertile ones show a curled shape against a light, and hatch if they are kept at thirty-eight degrees.',
  behaviour: 'She pecks at carpet and crumbs, mutters, and runs from anything that runs at her. At night she folds her legs under her, lays the neck down her back in an S and tucks her head under a wing. Offered cress or feed by hand a few times, she follows the hand that fed her.',
  habitat: 'Wherever there was once a kitchen: the house, the suburbs, the break rooms of the offices, the fields.',
  lore: 'Operators call them the plucked. Nobody has ever found a feather. Dr. Calder thinks they came through with the pigeons and lost them on the way; she keeps three in the lab annex and will not say what she feeds them.',
  harvest: [{ item: 'pallid_egg', how: 'Collect from the straw of a pen where a hen is fed and watered.' }, { item: 'hen_down', how: 'Shear the down from under her wings (shears).' }],
});
