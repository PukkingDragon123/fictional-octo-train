import { horrify } from '../kit/horror';
import { def, Rig } from '../species';
import { makeRamp, mixHex } from '../../gfx/pixel';
import type { Creature } from '../creature';
import { CS, zoneOf, pulse, stop, findSpot } from '../behaviors_a';
import { net, netOf, playAt, hashId, rng, localIn, thinkOnce, dist, playersIn } from '../behaviors_b';
import { KitDef, KitRig, BoneSpec, SkinB, BuildCtx, Page, V3, Wt, buildKitRig, kitSync, kitPersonalize, flinchOf, hash } from '../kit/humanoids';
import { chain, sac, paintCap, paintEye } from '../kit/organic';
import { attachFilm, filmPersonalize } from '../kit/gel';
import '../../audio/sounds_creatures_d';

// =====================================================================================
// MOON CALF — the Moon's grazer, and the Strider's prey. A pale, soft-skinned
// animal the size of a calf, pocked like the ground it lives on, with a long
// tapir's lip for scraping the grey lichen off the regolith and a clear gas
// bladder along its back. It fills the bladder and bounds in long, slow,
// low-gravity hops; landing, it puffs it out with a sigh. Harmless. Where
// there are calves, the Striders are listening for their landings.
//   moon_calf   skinned kit rig with a translucent bladder film (src/creatures/kit/gel.ts)
// =====================================================================================

const SIDES = [['L', 1], ['R', -1]] as const;
function bonesC(v: number): BoneSpec[] {
  const s = 1 + v * 0.05;
  const b: BoneSpec[] = [
    { name: 'base', parent: '', at: [0, 0, 0] },
    { name: 'body', parent: 'base', at: [0, 0.5 * s, 0] },
    { name: 'bladder', parent: 'body', at: [0, 0.2 * s, -0.04] },
    { name: 'neck', parent: 'body', at: [0, 0.06, 0.32 * s], cap: true },
    { name: 'head', parent: 'neck', at: [0, 0.06, 0.16], cap: true },
    { name: 'lip', parent: 'head', at: [0, -0.07, 0.15] },
    { name: 'tail', parent: 'body', at: [0, 0.02, -0.38 * s] },
    { name: 'tail2', parent: 'tail', at: [0, -0.05, -0.1] },
  ];
  for (const [sd, k] of SIDES) {
    b.push({ name: 'ear' + sd, parent: 'head', at: [k * 0.075, 0.07, -0.04] }, { name: 'eye' + sd, parent: 'head', at: [k * 0.085, 0.03, 0.06] });
    for (const [f, z] of [['f', 0.22], ['b', -0.24]] as const) {
      b.push(
        { name: `hip${f}${sd}`, parent: 'body', at: [k * 0.17 * s, -0.1, z * s], cap: true },
        { name: `knee${f}${sd}`, parent: `hip${f}${sd}`, at: [k * 0.02, -0.18 * s, f === 'f' ? 0.02 : -0.04] },
        { name: `foot${f}${sd}`, parent: `knee${f}${sd}`, at: [0, -0.18 * s, f === 'f' ? 0.0 : 0.03] },
      );
    }
  }
  return b;
}
function layoutC(p: Page) { p.reg('HIDE', 64, 48); p.reg('HEAD', 32, 32); p.reg('LEG', 16, 32); p.reg('EAR', 16, 16); p.reg('EYE', 8, 8); p.reg('LIP', 16, 16); p.reg('PAD', 8, 8); p.reg('CAP', 8, 8); }
function buildC(B: SkinB, x: BuildCtx) {
  const bi = x.bi, R = x.R, v = x.variant, s = 1 + v * 0.05;
  const Bd = x.rest('body'), wB: Wt = [bi('body'), 1];
  // the body: a soft barrel, belly sagging, pocked all over
  const bp: V3[] = [], br: [number, number][] = [], bw: Wt[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8, z = (-0.44 + t * 0.86) * s, r = Math.pow(Math.sin(Math.PI * Math.min(0.97, Math.max(0.03, t))), 0.6);
    bp.push([0, Bd[1] - 0.03 * Math.sin(Math.PI * t), z]); br.push([0.27 * r * s, 0.25 * r * s]);
    bw.push(t > 0.85 ? [bi('body'), 0.6, bi('neck'), 0.4] : t < 0.1 ? [bi('body'), 0.7, bi('tail'), 0.3] : wB);
  }
  sac(B, R('HIDE'), 1, bp, br, bw, { n: 16, bump: (a, t) => (Math.abs(a) > 2.3 ? 0.1 : 0) + (hash(Math.round(a * 4), Math.round(t * 14)) < 0.08 ? -0.05 : 0) + Math.sin(a * 2 + t * 5) * 0.03 });
  // the head: a long soft face ending in a prehensile lip, big wet eyes, long drooping ears
  const N = x.rest('neck'), H = x.rest('head'), L = x.rest('lip');
  sac(B, R('HEAD'), 2, [[N[0], N[1] - 0.02, N[2] - 0.08], N, [H[0], H[1], H[2] - 0.05], [H[0], H[1] - 0.01, H[2] + 0.06], [L[0], L[1] + 0.02, L[2] - 0.02]],
    [[0.17, 0.17], [0.12, 0.13], [0.105, 0.11], [0.08, 0.085], [0.05, 0.05]], [[bi('body'), 0.5, bi('neck'), 0.5], [bi('neck'), 1], [bi('head'), 1], [bi('head'), 1], [bi('head'), 0.5, bi('lip'), 0.5]], { n: 12, up: [0, 1, 0] });
  sac(B, R('LIP'), 3, [L, [L[0], L[1] - 0.02, L[2] + 0.04], [L[0], L[1] - 0.05, L[2] + 0.06]], [[0.045, 0.035], [0.035, 0.028], [0.015, 0.012]], [[bi('lip'), 1], [bi('lip'), 1], [bi('lip'), 1]], { n: 8 });
  for (const [sd, k] of SIDES) {
    const e = x.rest('eye' + sd), we: Wt = [bi('eye' + sd), 1];
    sac(B, R('EYE'), 4, [[e[0] - k * 0.01, e[1], e[2] - 0.02], e, [e[0] - k * 0.008, e[1], e[2] + 0.02]], [[0.015, 0.015], [0.03, 0.03], [0.012, 0.012]], [we, we, we], { n: 8, up: [0, 1, 0] });
    const ea = x.rest('ear' + sd), wE: Wt = [bi('ear' + sd), 1];
    sac(B, R('EAR'), 5, [ea, [ea[0] + k * 0.04, ea[1] - 0.02, ea[2] - 0.06], [ea[0] + k * 0.06, ea[1] - 0.08, ea[2] - 0.12], [ea[0] + k * 0.06, ea[1] - 0.14, ea[2] - 0.15]],
      [[0.02, 0.035], [0.02, 0.05], [0.015, 0.045], [0.004, 0.01]], [wE, wE, wE, wE], { n: 8, up: [k, 0, 0] });
    // legs: short, thick, soft, on wide padded feet for the dust
    for (const f of ['f', 'b']) {
      const ft = x.rest(`foot${f}${sd}`);
      chain(B, x, R('LEG'), 6, { bones: [`hip${f}${sd}`, `knee${f}${sd}`, `foot${f}${sd}`], tip: [ft[0], 0.0, ft[2] + 0.02], r: (t) => 0.085 - t * 0.03, n: 8, rings: 3, knuckle: 0.25 });
      sac(B, R('PAD'), 7, [[ft[0], 0.02, ft[2] - 0.05], [ft[0], 0.018, ft[2] + 0.01], [ft[0], 0.02, ft[2] + 0.06]], [[0.05, 0.02], [0.07, 0.025], [0.04, 0.018]], [[bi(`foot${f}${sd}`), 1], [bi(`foot${f}${sd}`), 1], [bi(`foot${f}${sd}`), 1]], { n: 8 });
    }
  }
  chain(B, x, R('LEG'), 8, { bones: ['tail', 'tail2'], tipLen: 0.08, r: [0.04, 0.012], n: 6, rings: 3 });
}
function paintC(p: Page, x: BuildCtx) {
  const v = x.variant, base = [0x9ca2b2, 0xaaa6a8, 0x9098a8][v % 3];
  const R = makeRamp(base, 7, { hueShift: 0.03, spread: 0.55 });
  // lunar hide: pale, dusty, pocked with small craters (a dark pit with a lit rim)
  for (const [n, seed] of [['HIDE', 3], ['HEAD', 5], ['LEG', 7], ['EAR', 9]] as const) {
    const r = p.R(n);
    r.fill(R, (xx, yy) => 3.4 + Math.cos((r.deg(xx) * Math.PI) / 180) * 1.0 + (r.fbm(xx, yy, 3, 3, seed + v) - 0.5) * 1.5 - (Math.abs(r.deg(xx)) > 140 ? -0.6 : 0), undefined, 0.5);
    const nc = Math.floor((r.w * r.h) / 70);
    for (let i = 0; i < nc; i++) { const cx = hash(i, seed) * r.w, cy = hash(i, seed + 1) * r.h, rr = 0.8 + hash(i, seed + 2) * 1.8; r.ellipse(cx, cy, rr + 0.8, rr + 0.8, R[5], 0.5); r.ellipse(cx, cy, rr, rr, R[1], 0.8); }
  }
  // a darker saddle under the bladder and a pale belly
  const h = p.R('HIDE');
  for (let yy = 0; yy < h.h; yy++) for (let xx = 0; xx < h.w; xx++) { const d = Math.abs(h.deg(xx)); if (d < 35 && yy > h.h * 0.2 && yy < h.h * 0.8) h.blend(xx, yy, 0x6a7088, 0.35); }
  paintEye(p.R('EYE'), 0x1a2238, 0x05060a, 0x2a3048);
  const lp = p.R('LIP'); lp.fill(makeRamp(0xa89098, 5), (xx, yy) => 2.4 + (hash(xx, yy) - 0.5) + Math.cos((lp.deg(xx) * Math.PI) / 180) * 0.7);
  p.R('PAD').fill(makeRamp(0x4a4a58, 4), (xx, yy) => 1.6 + (hash(xx * 2, yy * 2) - 0.5));
  const ea = p.R('EAR'); for (let yy = 0; yy < ea.h; yy++) for (let xx = 0; xx < ea.w; xx++) if (Math.abs(ea.deg(xx)) > 120) ea.blend(xx, yy, 0xc89098, 0.5);
  paintCap(p.R('CAP'), base, 0x8a90a8, 0x4a5068);
}
const CALF_KIT: KitDef = { key: 'moon_calf', variants: 3, W: 128, H: 128, bones: bonesC, layout: layoutC, build: buildC, paint: paintC, sphere: [0, 0.5, 0, 0.8],
  decorate: (rig, e) => { attachFilm(rig, BLADDER_KIT, e.variant, { opacity: 0.32, edge: 1.6, spec: 1.2, rim: 0.4, tint: 0.35 }); } };

// ---- the bladder: a clear, veined gas sac along the spine
function layoutBl(p: Page) { p.reg('BLAD', 32, 32); p.reg('CAP', 8, 8); }
function buildBl(B: SkinB, x: BuildCtx) {
  const b = x.rest('bladder'), w: Wt = [x.bi('bladder'), 1];
  sac(B, x.R('BLAD'), 1, [[b[0], b[1] - 0.04, b[2] - 0.3], [b[0], b[1], b[2] - 0.18], [b[0], b[1] + 0.03, b[2]], [b[0], b[1], b[2] + 0.17], [b[0], b[1] - 0.05, b[2] + 0.27]],
    [[0.04, 0.03], [0.13, 0.1], [0.16, 0.13], [0.12, 0.1], [0.03, 0.025]], [w, w, w, w, w], { n: 14, bump: (a, t) => Math.sin(a * 4 + t * 11) * 0.05 });
}
function paintBl(p: Page) {
  const r = p.R('BLAD');
  r.fill(makeRamp(0x9ab8e0, 6, { spread: 0.5 }), (xx, yy) => 3.4 + Math.cos((r.deg(xx) * Math.PI) / 180) * 1.1 + (r.fbm(xx, yy, 2, 2, 4) - 0.5));
  for (let i = 0; i < 9; i++) r.crack(hash(i, 3) * r.w, hash(i, 4) * r.h, 16, 90 + (hash(i, 5) - 0.5) * 60, 0x5a6a9a, i + 2, 0.6, 0.3);
  paintCap(p.R('CAP'), 0x9ab8e0, 0x7a90b8, 0x405070);
}
const BLADDER_KIT: KitDef = { key: 'moon_calf_bladder', variants: 3, W: 64, H: 64, bones: bonesC, layout: layoutBl, build: buildBl, paint: paintBl, sphere: [0, 0.7, 0, 0.5] };

function buildCalf(): Rig { return buildKitRig(CALF_KIT, 0, 0.7); }

// ------------------------------------------------------------------ animation: slow lunar bounds, grazing, the bladder breathing
interface CalfDrive { t: number; dt: number; speed: number; graze: number; dead: number; seed: number; flinch: number }
function poseCalf(K: KitRig, d: CalfDrive) {
  const P = K.parts, ud = K.kit.m as Record<string, number>, t = d.t, s7 = d.seed * 7;
  const mv = Math.min(1, d.speed / 0.5) * (1 - d.dead);
  // hops: one long slow bound per ~1.7 m; the bladder fills before take-off and puffs out on landing
  ud.hph = (ud.hph ?? 0) + d.dt * (d.speed / 1.7) * Math.PI * 2;
  const u = ((ud.hph / (Math.PI * 2)) % 1 + 1) % 1;
  const air = mv * Math.max(0, Math.sin(Math.min(1, u / 0.8) * Math.PI));
  const land = mv * Math.max(0, 1 - Math.abs(u - 0.85) / 0.12);
  ud.air = (ud.air ?? 0) + (air - (ud.air ?? 0)) * Math.min(1, d.dt * 10);
  const breathe = Math.sin(t * 0.9 + s7) * (1 - d.dead);
  P.base.position.set(0, ud.air * 0.55, 0);
  P.base.rotation.set(0, 0, 0);
  P.body.rotation.set((u < 0.5 ? -0.12 : 0.1) * mv + d.graze * 0.12, Math.sin(t * 0.4 + s7) * 0.04, Math.sin(t * 0.7 + s7) * 0.03);
  P.body.scale.set(1 + land * 0.08, 1 - land * 0.1 + breathe * 0.015, 1);
  const inflate = 1 + 0.12 * breathe * 0.4 + mv * (u < 0.75 ? 0.3 * Math.min(1, u * 3) : 0.3 * (1 - (u - 0.75) / 0.25)) - d.dead * 0.6;
  P.bladder.scale.set(inflate, Math.max(0.2, inflate * 1.05), 1 + (inflate - 1) * 0.6);
  // the head: down to the ground, lip working, when it grazes; up and back in the air
  P.neck.rotation.set(0.6 * d.graze - 0.25 * ud.air + Math.sin(t * 0.8 + s7) * 0.05 + d.dead * 0.3, Math.sin(t * 0.45 + s7) * 0.25 * (1 - d.graze), 0);
  P.head.rotation.set(0.35 * d.graze + Math.sin(t * 1.3) * 0.05, 0, Math.sin(t * 0.6 + s7) * 0.08);
  P.lip.rotation.set(Math.sin(t * 5.5 + s7) * 0.25 * d.graze + 0.1, Math.sin(t * 3.1) * 0.2 * d.graze, 0);
  for (const [sd, k] of SIDES) {
    P['ear' + sd].rotation.set(Math.sin(t * 1.1 + k) * 0.12 + ud.air * 0.6, 0, k * (0.15 + Math.sin(t * 0.9 + k * 2) * 0.1 - ud.air * 0.3));
    for (const [f, ph] of [['f', 0], ['b', 0.4]] as const) {
      // tucked in the air, reaching to land, folded under to push off
      const tuck = ud.air, reach = f === 'f' ? land : 0;
      P[`hip${f}${sd}`].rotation.set((f === 'f' ? -1 : 1) * (0.5 * tuck) - reach * 0.4 + Math.sin(t * 0.7 + ph + k) * 0.03 * (1 - mv) + d.graze * (f === 'f' ? 0.15 : 0), 0, k * 0.06);
      P[`knee${f}${sd}`].rotation.set((f === 'f' ? 1 : -1) * (0.9 * tuck) + land * 0.3, 0, 0);
      P[`foot${f}${sd}`].rotation.set(-0.3 * tuck, 0, 0);
    }
  }
  P.tail.rotation.set(-0.3 + Math.sin(t * 2.3 + s7) * 0.25, Math.sin(t * 1.7) * 0.3, 0);
  P.tail2.rotation.set(Math.sin(t * 3.1) * 0.3, 0, 0);
  if (d.flinch > 0) P.body.position.x += Math.sin(t * 70) * 0.02 * d.flinch;
}
function animateCalf(rig: Rig, c: Creature, t: number, dt: number) {
  const K = rig as KitRig;
  const v = Math.floor(hashId(c.id) * 3);
  if (K.kit.who !== c.id) { K.kit.who = c.id; kitPersonalize(K, v); filmPersonalize(K, v); }
  kitSync(K);
  const n = netOf(c), ud = K.kit.m as Record<string, number>;
  ud.gz = (ud.gz ?? 0) + ((n.gz ? 1 : 0) - (ud.gz ?? 0)) * Math.min(1, dt * 2);
  const was = (ud.air ?? 0) > 0.3;
  poseCalf(K, { t, dt, speed: c.dead ? 0 : c.speed, graze: ud.gz, dead: c.dead ? 1 : 0, seed: hashId(c.id, 2), flinch: flinchOf(c) });
  // the landing: a soft thump and a sigh out of the bladder
  if (was && (ud.air ?? 0) < 0.15 && c.visibleToLocal) playAt('lumen_puff', c, 0.5, 12, 0.6 + Math.random() * 0.2);
  const F = K.kit.F.fx.value; F.y += dt; F.z = Math.min(1, c.hitFlash / 0.15) * 0.4;
  const p = localIn(c);
  if (p && !c.dead && c.visibleToLocal && dist(p, c) < 6) thinkOnce(p, 'moon_calf', ['A pale calf with a clear balloon on its back. It is eating the dust.', 'It just bounced ten metres. Slowly. Like a dream of a cow.'][Math.floor(t * 0.2) % 2], 100);
}

// ------------------------------------------------------------------ host brain: graze, drift on in long bounds, flee anything that leaps
function thinkCalf(c: Creature, dt: number): boolean {
  const cs = CS(), z = zoneOf(c), m = c.mem, n = net(c);
  const ev = pulse(c);
  let threat: { x: number; z: number } | null = null;
  for (const o of cs.creatures.values()) if (o.zoneKey === c.zoneKey && !o.dead && o.sp.key === 'moon_strider' && dist(o, c) < 10) { threat = o; break; }
  for (const p of playersIn(c.zoneKey)) if (dist(p, c) < 2.2 && (p.speed ?? 0) > 2.5) threat = p;
  if (ev.hurt > 0 || threat) { m.fleeT = 5; m.from = threat ?? { x: c.x - Math.cos(c.facing), z: c.z - Math.sin(c.facing) }; }
  m.fleeT = Math.max(0, (m.fleeT ?? 0) - dt);
  if (m.fleeT > 0) {
    n.gz = 0; c.setState('flee');
    if (!c.goal || c.stateT > 4) { c.goal = cs.fleeSpot(c, z, m.from.x, m.from.z); c.stateT = 0; playAt('cower_squeak', c, 0.5, 12, 0.5); }
    cs.moveTo(c, z, c.goal.x, c.goal.z, c.sp.run, dt, 0.8);
    return true;
  }
  if (c.state === 'graze') { stop(c); n.gz = 1; if (c.stateT > (m.gzT ?? 8)) { c.setState('wander'); n.gz = 0; c.goal = null; } return true; }
  c.setState('wander'); n.gz = 0;
  if (!c.goal || cs.moveTo(c, z, c.goal.x, c.goal.z, c.sp.walk, dt, 0.7) || c.stateT > 25) {
    if (c.goal && rng.chance(0.7)) { c.setState('graze'); m.gzT = rng.float(6, 16); return true; }
    c.goal = findSpot(c, { rMin: 4, rMax: 12 }) ?? cs.wanderSpot(c, z, 12);
    c.stateT = 0;
  }
  return true;
}

const CALF = def({
  key: 'moon_calf', name: 'Moon Calf', code: 'LN-11 // FAUNA, GRAZER', temperament: 'peaceful', threat: 0,
  rule: { name: 'IT DRAWS THE LEAPERS', text: 'Harmless. It grazes the dust and bounds away from anything that runs or leaps. Every landing thumps through the ground: where calves are bounding, the Striders are listening for them and not for you.', tell: 'A pale calf with a clear balloon on its back, bouncing very slowly across the dust.' },
  hp: 30, walk: 0.55, run: 2.1, turn: 2.2, radius: 0.36, height: 0.85, sight: 12, fov: 2.6, hearing: 1.2,
  zones: ['moon'], weight: 2.5, group: [2, 4], maxPerZone: 8, diet: 'none',
  meat: [['moon_meat', 2]],
  sounds: { hurt: 'cower_squeak', death: 'cower_die', idle: 'lumen_puff' },
  scan: { cls: 'Fauna / low-gravity grazer', notes: ['A pale, pocked, soft-skinned grazer the size of a calf, with a long prehensile lip.', 'A clear gas bladder runs along its spine. It fills it and bounds in long, slow hops.', 'It scrapes grey lichen off the dust and bolts from anything that leaps or runs.', 'The Moon Striders hunt it by the thump of its landings.'] },
  gore: { blood: 'pale', tint: 0xc8d0ff, flesh: 0x9aa0b8, sever: ['head', 'earL', 'earR', 'tail', 'hipfL', 'hipfR', 'hipbL', 'hipbR'], head: 'head' },
  build: buildCalf, animate: animateCalf, think: thinkCalf,
});
CALF.animateGallery = (rig: Rig, t: number) => {
  const q = new URLSearchParams(location.search).get('pose') || ['graze', 'hop', 'idle'][Math.floor(t / 4) % 3];
  const K = rig as KitRig; kitSync(K);
  poseCalf(K, { t, dt: 1 / 60, speed: q === 'hop' ? 1.2 : 0, graze: q === 'graze' ? 1 : 0, dead: 0, seed: 0.4, flinch: 0 });
};
horrify(CALF, { twitch: 0.15, snap: 0.08, parts: /ear|tail|lip/ });
void mixHex;
