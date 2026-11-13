// Round 17 remakes: two of the oldest-looking inhabitants (the Moon Strider, built from
// blobs, and the Moon Calf) rebuilt with the user's own creature software
// (src/creatures/life, ported) in the realistic, grotesque style of the Gaunt Wolf and
// the Parasite Salamander: one continuous sculpted, skinned body with a painted hide,
// real limb proportions and the life Animator's gaits. Their brains, rules and net
// memory are unchanged (moon.ts, moon_calf.ts); this file swaps their bodies and
// their animation. (It loads after them: species files load in name order.)
import * as THREE from 'three';
import { species } from '../registry';
import type { Rig, SpeciesDef } from '../species';
import type { Creature } from '../creature';
import { G } from '../../game/G';
import { netOf, fxPoll, playAt, live, dist, localIn, thinkOnce, hashId } from '../behaviors_b';
import { flinchOf } from '../kit/humanoids';
import { lifeModel, lifeRig, lifeAnimate, type LifeGameRig } from '../life/lifeMesh';
import type { Design } from '../life/design';
import type { Ctx } from '../life/sculpt';
import { sac, hash, addV, scl, type V3, type Page } from '../life/kit';
import { makeRamp, mixHex } from '../../gfx/pixel';
import { shake } from '../../gfx/juice';

const _q = new THREE.Quaternion(), _e = new THREE.Euler();

// =====================================================================================
// MOON STRIDER: a blind leaper the size of a car, grey and cratered like the ground, its
// hind legs folded three times under it, its jaws opening sideways
// =====================================================================================
const STRIDER_D: Design = {
  name: 'Moon Strider', latin: 'Saltator caecus', plan: 'quadruped', lineage: 'vertebrate',
  genes: ['vert_quadruped', 'leg_leaping', 'tongue', 'amphib_skin', 'spawn'],
  size: 0.32, len: 0.6, girth: 0.55, legLen: 0.85, legThick: 0.5, neck: 0.1, head: 0.6, tail: 0, segs: 3,
  colors: { base: 0x8a8890, belly: 0xa8a6ae, pattern: 0x56545c, accent: 0x7a2a38, eye: 0x6a6870 },
  pattern: 'spots', patScale: 0.6, cover: 'skin', seed: 2207,
};
function striderPost(S: Ctx, page: Page) {
  const D = S.rig.dims, iH = S.bi('head'), H0 = S.at(iH);
  const { hl, hw, hh } = D;
  // the sideways jaws: two mandible plates either side of the mouth, opening like a beetle's
  const MAND = S.fixed('MS_MAND', 10, 16), TOOTH = S.fixed('MS_TOOTH', 4, 6);
  for (const s of [-1, 1]) {
    const r: V3 = [H0[0] + s * hw * 0.45, H0[1] - hh * 0.2, H0[2] + hl * 0.3];
    const tip: V3 = [H0[0] + s * hw * 0.12, H0[1] - hh * 0.32, H0[2] + hl * 0.95];
    sac(S.B, MAND, S.gid(), [r, [(r[0] + tip[0]) / 2 + s * hw * 0.12, (r[1] + tip[1]) / 2, (r[2] + tip[2]) / 2], tip], [[hw * 0.16, hh * 0.22], [hw * 0.12, hh * 0.16], [hw * 0.04, hh * 0.05]], [[iH, 1], [iH, 1], [iH, 1]], { n: 7 });
    for (let i = 0; i < 6; i++) {
      const t = 0.2 + i * 0.13, b: V3 = [r[0] + (tip[0] - r[0]) * t, r[1] + (tip[1] - r[1]) * t, r[2] + (tip[2] - r[2]) * t];
      sac(S.B, TOOTH, S.gid(), [b, addV(b, [-s * hw * 0.14, -hh * 0.02, 0])], [[hw * 0.03, hw * 0.03], [0.002, 0.002]], [[iH, 1], [iH, 1]], { n: 4 });
    }
  }
  MAND.fill(makeRamp(0x6a6870, 6, { spread: 0.5 }), (x, y) => 2.8 + Math.cos(MAND.th(x)) - (y / MAND.h) * 0.8 + (hash(x, y) - 0.5) * 0.6);
  for (let y = 0; y < TOOTH.h; y++) for (let x = 0; x < TOOTH.w; x++) TOOTH.set(x, y, mixHex(0xd8d0c0, 0x7a7060, y / TOOTH.h));
  // craters and dust over the whole hide; the eyes skinned over (it is blind)
  for (const name of ['BODY', 'HEAD', 'LIMB']) {
    const r = page.regs.get(name); if (!r) continue;
    for (let i = 0; i < Math.round(r.w * r.h / 60); i++) {
      const cx = hash(i, 31) * r.w, cy = hash(i, 32) * r.h, rr = 1.2 + hash(i, 33) * 2.6;
      r.ellipse(cx, cy, rr, rr, 0x3e3c44, 0.55); r.ellipse(cx - 0.6, cy - 0.6, rr * 0.6, rr * 0.6, 0xb8b6c0, 0.35);
    }
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) if (r.fbm(x, y, 4, 2, 41) > 0.68) r.blend(x, y, 0x6a2a34, 0.35); // raw sores
  }
}
let STRIDER_MODEL: ReturnType<typeof lifeModel> | null = null;
function buildMoonStrider(): Rig {
  STRIDER_MODEL ??= lifeModel('moon_strider_life', STRIDER_D, striderPost);
  return lifeRig(STRIDER_MODEL, 1.45, 2.3);
}
const HOP_H = 2.4, HOP_T = 1.25;
function animateMoonStrider(rig: Rig, c: Creature, t: number, dt: number) {
  const R = rig as LifeGameRig, n = netOf(c), ud = R.life.m as Record<string, number>;
  const ev = fxPoll(rig, c);
  if (ev) {
    if (ev.key === 'charge') playAt('strider_charge', c, 0.9, 22);
    else if (ev.key === 'land') { playAt('strider_land', c, 1, 30); ud.squash = 1; const p = live() ? G.local : null; if (p && p.zoneKey === c.zoneKey) { const d = dist(p, c); if (d < 12) shake((1 - d / 12) * 0.6, 0.4); } }
  }
  ud.squash = Math.max(0, (ud.squash ?? 0) - dt * 2.5);
  if (n.air) { const a = n.air; if (a < (ud.air ?? 0) - 0.3) ud.air = a; ud.air = Math.min(1, Math.max(ud.air ?? 0, a) + dt / HOP_T); } else ud.air = 0;
  const u = ud.air, air = n.air ? 1 : 0;
  ud.ch = (ud.ch ?? 0) + ((n.ch ? 1 : 0) - (ud.ch ?? 0)) * (1 - Math.exp(-(n.ch ? 5 : 8) * dt));
  const crouch = Math.max(ud.ch, ud.squash * 0.8);
  const p = live() ? G.local : null;
  const far = !!p && dist(p, c) > 40;
  lifeAnimate(R, dt, { speed: air ? 3 : 0, state: c.dead ? 'dead' : air ? 'move' : c.attackPhase > 0 ? 'attack' : 'idle', act: c.attackPhase > 0 ? 1 - c.attackPhase / 0.38 : 0 }, 0, far);
  const B = R.life.bones, L = R.life.model.rig;
  // crouched to leap: folded right down, trembling; in the air: high, legs flung back then reaching
  rig.body.position.y = air ? 4 * (n.h ?? HOP_H) * u * (1 - u) : -crouch * 0.45;
  rig.body.rotation.x = air ? (-0.4 + u * 0.8) * 0.5 : crouch * 0.12 + (n.ch ? Math.sin(t * 50) * 0.01 : 0);
  // the jaws gape sideways (the head bone rolls them open)
  if (L.jaw >= 0) { _q.setFromEuler(_e.set(Math.max(n.ch ? 0.3 : 0, c.attackPhase > 0 ? 0.6 : 0, air ? 0.4 : 0, c.dead ? 0.5 : 0), 0, 0)); B[L.jaw].quaternion.multiply(_q); }
  if (flinchOf(c) > 0) B[L.root].position.x += Math.sin(t * 60) * 0.03 * flinchOf(c);
  R.life.F.fx.value.z = Math.min(1, c.hitFlash / 0.15) * 0.4;
}

// =====================================================================================
// MOON CALF: a pale, pocked, soft-skinned grazer with a long tapir's lip and a veined gas
// bladder bulging out of its back
// =====================================================================================
const CALF_D: Design = {
  name: 'Moon Calf', latin: 'Vitulus lunaris', plan: 'quadruped', lineage: 'vertebrate',
  genes: ['vert_quadruped', 'leg_padded', 'eye_camera', 'ears', 'molars', 'endotherm', 'live_birth'],
  size: 0.1, len: 0.4, girth: 0.7, legLen: 0.42, legThick: 0.55, neck: 0.35, head: 0.5, tail: 0.3, segs: 3,
  colors: { base: 0xd6d2ca, belly: 0xe6e2da, pattern: 0x9a968e, accent: 0x9ab8e0, eye: 0x101418 },
  pattern: 'spots', patScale: 0.5, cover: 'skin', seed: 5113,
};
function calfPost(S: Ctx, page: Page) {
  const D = S.rig.dims, sp = S.spine, iH = S.bi('head'), H0 = S.at(iH);
  const BL = S.fixed('MC_BLAD', 24, 24), LIP = S.fixed('MC_LIP', 10, 14);
  // the bladder: a clear, veined sac bulging out along the spine
  if (sp) {
    const pts: V3[] = [], rad: [number, number][] = [], w: number[][] = [];
    for (let i = 0; i <= 6; i++) {
      const t = 0.3 + i * 0.07, k = Math.round(t * (sp.pts.length - 1)), f = sp.fr[k];
      const bulge = Math.sin((i / 6) * Math.PI);
      pts.push(addV(sp.pts[k], scl(f.v, sp.rv[k] * (0.85 + 0.35 * bulge))));
      rad.push([sp.ru[k] * (0.15 + 0.55 * bulge), sp.rv[k] * (0.1 + 0.45 * bulge)]);
      w.push(sp.w[k]);
    }
    sac(S.B, BL, S.gid(), pts, rad, w, { n: 12, bump: (a, t) => Math.sin(a * 5 + t * 13) * 0.06 });
  }
  // the long prehensile lip: a wrinkled trunk hanging off the muzzle
  const { hl, hw, hh } = D;
  const l0: V3 = [H0[0], H0[1] - hh * 0.2, H0[2] + hl * 0.75];
  sac(S.B, LIP, S.gid(), [l0, [l0[0], l0[1] - hh * 0.25, l0[2] + hl * 0.25], [l0[0], l0[1] - hh * 0.6, l0[2] + hl * 0.32]], [[hw * 0.18, hh * 0.15], [hw * 0.13, hh * 0.11], [hw * 0.09, hh * 0.08]], [[iH, 1], [iH, 1], [iH, 1]], { n: 8, bump: (a, t) => Math.sin(t * 30) * 0.12 });
  BL.fill(makeRamp(0x9ab8e0, 6, { spread: 0.5 }), (x, y) => 3.4 + Math.cos(BL.th(x)) * 1.1 + (BL.fbm(x, y, 2, 2, 4) - 0.5));
  for (let i = 0; i < 12; i++) BL.line(hash(i, 3) * BL.w, 0, hash(i, 4) * BL.w + (hash(i, 5) - 0.5) * 8, BL.h, 0x5a6a9a, 0.6);
  for (let i = 0; i < 10; i++) BL.blend(hash(i, 8) * BL.w, hash(i, 9) * BL.h, 0xffffff, 0.8);
  LIP.fill(makeRamp(0xc8a8a8, 6, { spread: 0.5 }), (x, y) => 3 + Math.cos(LIP.th(x)) + (y % 3 === 0 ? -1 : 0));
  // pocked skin: little craters all over, raw at the folds
  for (const name of ['BODY', 'HEAD', 'LIMB']) {
    const r = page.regs.get(name); if (!r) continue;
    for (let i = 0; i < Math.round(r.w * r.h / 45); i++) { const cx = hash(i, 51) * r.w, cy = hash(i, 52) * r.h, rr = 0.8 + hash(i, 53) * 1.6; r.ellipse(cx, cy, rr, rr, 0x8a8680, 0.5); }
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) if (r.fbm(x, y, 5, 2, 61) > 0.72) r.blend(x, y, 0xb88080, 0.3);
  }
}
let CALF_MODEL: ReturnType<typeof lifeModel> | null = null;
function buildMoonCalf(): Rig {
  CALF_MODEL ??= lifeModel('moon_calf_life', CALF_D, calfPost);
  return lifeRig(CALF_MODEL, 0.85, 0.8);
}
function animateMoonCalf(rig: Rig, c: Creature, t: number, dt: number) {
  const R = rig as LifeGameRig, n = netOf(c), ud = R.life.m as Record<string, number>;
  const mv = Math.min(1, c.speed / 0.5) * (c.dead ? 0 : 1);
  // long, slow, low-gravity bounds: one per ~1.7 m
  ud.hph = (ud.hph ?? 0) + dt * (c.speed / 1.7) * Math.PI * 2;
  const u = ((ud.hph / (Math.PI * 2)) % 1 + 1) % 1;
  const air = mv * Math.max(0, Math.sin(Math.min(1, u / 0.8) * Math.PI));
  const was = (ud.air ?? 0) > 0.3;
  ud.air = (ud.air ?? 0) + (air - (ud.air ?? 0)) * Math.min(1, dt * 10);
  ud.gz = (ud.gz ?? 0) + ((n.gz ? 1 : 0) - (ud.gz ?? 0)) * Math.min(1, dt * 2);
  const p = live() ? G.local : null;
  lifeAnimate(R, dt, { speed: c.dead ? 0 : c.speed * 0.6, state: c.dead ? 'dead' : ud.gz > 0.5 ? 'eat' : c.speed > 0.05 ? 'move' : 'idle' }, 0, !!p && dist(p, c) > 40);
  rig.body.position.y = ud.air * 0.55;
  rig.body.rotation.x = (u < 0.5 ? -0.1 : 0.08) * mv;
  if (was && ud.air < 0.15 && c.visibleToLocal) playAt('lumen_puff', c, 0.5, 12, 0.6 + Math.random() * 0.2);
  R.life.F.fx.value.z = Math.min(1, c.hitFlash / 0.15) * 0.4;
  const lp = localIn(c);
  if (lp && !c.dead && c.visibleToLocal && dist(lp, c) < 6) thinkOnce(lp, 'moon_calf', ['A pale calf, pocked all over, with a veined balloon bulging out of its back.', 'Its lip hangs down like a little trunk. It is eating the dust.'][Math.floor(t * 0.2) % 2], 100);
  void hashId;
}

// ------------------------------------------------------------------ swap the bodies in
function remake(key: string, build: () => Rig, animate: SpeciesDef['animate'], gallery: (rig: Rig, t: number) => void, sever: string[]) {
  const sp = species(key) as unknown as SpeciesDef | undefined;
  if (!sp) return;
  sp.build = build;
  sp.animate = animate;
  sp.animateGallery = gallery;
  if (sp.gore) sp.gore = { ...sp.gore, sever, head: 'head' };
  (sp as any).handlesSevered = false;
}
const fake = (o: Partial<Creature>): Creature => ({ id: 'g-remake', x: 0, z: 0, y: 0, facing: Math.PI / 2, speed: 0, dead: false, attackPhase: 0, hitFlash: 0, stagger: 0, mem: {}, visibleToLocal: false, zoneKey: '', ...o } as unknown as Creature);
remake('moon_strider', buildMoonStrider, animateMoonStrider, (rig, t) => {
  const pose = new URLSearchParams(location.search).get('pose') || ['idle', 'crouch', 'leap'][Math.floor(t / 3) % 3];
  const fc = (rig.root.userData.fake ??= fake({})) as Creature;
  fc.mem.netMem = { ch: pose === 'crouch' ? 1 : 0, air: pose === 'leap' ? Math.max(0.01, (t % HOP_T) / HOP_T) : 0, h: HOP_H };
  const px = rig.root.position.x, pz = rig.root.position.z;
  animateMoonStrider(rig, fc, t, 1 / 60);
  rig.root.position.set(px, 0, pz);
}, ['head']);
remake('moon_calf', buildMoonCalf, animateMoonCalf, (rig, t) => {
  const pose = new URLSearchParams(location.search).get('pose') || ['idle', 'graze', 'hop'][Math.floor(t / 3) % 3];
  const fc = (rig.root.userData.fake ??= fake({})) as Creature;
  fc.speed = pose === 'hop' ? 1.2 : 0; fc.mem.netMem = { gz: pose === 'graze' ? 1 : 0 };
  animateMoonCalf(rig, fc, t, 1 / 60);
}, ['head']);
