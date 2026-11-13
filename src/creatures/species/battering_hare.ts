import * as THREE from 'three';
import { def, Rig } from '../species';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import type { Creature } from '../creature';
import type { Player } from '../../entities/player';
import { CS, zoneOf, pulse, stop, faceTo, onPlayerHit } from '../behaviors_a';
import { net, netOf, playAt, rng, localIn, thinkOnce, dist, playersIn, fx, fxPoll, live, lineOfSightB } from '../behaviors_b';
import { flinchOf } from '../kit/humanoids';
import { applyHitToPlayer, type HitInfo } from '../manager';
import { lifeModel, lifeRig, lifeAnimate, type LifeGameRig } from '../life/lifeMesh';
import type { Design } from '../life/design';
import type { Ctx } from '../life/sculpt';
import { sac, ball, hash, addV, type V3, type Page } from '../life/kit';
import { makeRamp, mixHex } from '../../gfx/pixel';
import { objDef } from '../../world/objects';
import { breakable } from '../../world/destruction';
import { op } from '../../game/ops';
import { PK } from '../../gore/particles';
import { defDread } from '../dread';
import { ruleShown } from '../rules';
import '../../audio/sounds_creatures_c';

// =====================================================================================
// THE BATTERING HARE — a rabbit the size of an elephant, grotesquely fat, on three legs.
// One hind leg is gone: what is left of it has fused into a knot of scar and bone sunk
// in the haunch. It does not hop and it does not walk: it crawls, hunched and low, its
// sagging belly an inch off the floor and wobbling, the forelegs reaching and pulling,
// the one huge hind leg shoving, the whole body slewing toward the missing side on every
// shove. A true rabbit's shape gone wrong: enormous rounded haunches, a short fat barrel
// of a body, long upright ears that flop and twitch (one torn), a blunt rounded muzzle
// with a split lip over yellow chisel teeth, big wet dark eyes, a matted cotton tail. It
// rams: it lowers its head, scrapes the floor with a forefoot, and comes in a dead
// straight line, a low, fast lunging scramble, through whatever is in the way: units,
// animals, furniture, barricades, the walls of a camp. It cannot turn once it has
// started; it stops when it hits something it cannot break, and lies there dazed.
// Built with the user's creature software (src/creatures/life, ported): the right hind
// leg is removed from its rig before sculpting and belly, ear and tail bones added; the
// haunches, belly, ears, muzzle, eyes, teeth and stump are sculpted on top here.
// =====================================================================================

const SCALE = 2.6;
const DESIGN: Design = {
  name: 'Battering Hare', latin: 'Lepus ariens', plan: 'quadruped', lineage: 'vertebrate',
  genes: ['vert_quadruped', 'leg_cursorial', 'eye_camera', 'molars', 'fur', 'endotherm', 'live_birth'],
  size: 0.34, len: 0.05, girth: 1, legLen: 0.32, legThick: 0.75, neck: 0, head: 0.85, tail: 0, segs: 3,
  colors: { base: 0x7e6e5c, belly: 0xc8b8a0, pattern: 0x4a3e32, accent: 0xc87a8a, eye: 0x1a1010 },
  pattern: 'mottled', patScale: 0.9, cover: 'fur', seed: 6619,
};
/** the hind leg that is gone (right side), and the bones added for the belly, the ears and the scut */
let MISSING: { bones: number[] } | null = null;
const XB = { belly: -1, earL: -1, earR: -1, scut: -1 };
function tweak(rig: any) {
  const i = rig.legs.findIndex((l: any) => l.kind === 'hind' && l.side > 0);
  if (i >= 0) { MISSING = { bones: rig.legs[i].bones }; rig.legs.splice(i, 1); }
  // a rabbit's legs: the one good hind leg long and hugely muscled (folded under it), the forelegs short
  for (const lg of rig.legs) {
    const k = lg.kind === 'hind' ? 1.35 : 0.85;
    for (let j = 1; j < lg.bones.length; j++) { const p = rig.bones[lg.bones[j]].pos; p[0] *= k; p[1] *= k; p[2] *= k; }
    lg.lens = lg.lens.map((x: number) => x * k);
    if (lg.kind === 'fore') lg.foot = [lg.foot[0] * 1.3, lg.foot[1] + rig.dims.T * 0.15]; // reaching, splayed
  }
  const { W, H, T, hl, hw, hh } = rig.dims;
  const add = (name: string, parent: number, pos: number[]) => { rig.bones.push({ name, parent, pos }); return rig.bones.length - 1; };
  XB.belly = add('belly', rig.root, [0, -H * 0.32, T * 0.38]);
  XB.earL = add('earL', rig.head, [-hw * 0.24, hh * 0.42, -hl * 0.12]);
  XB.earR = add('earR', rig.head, [hw * 0.24, hh * 0.42, -hl * 0.12]);
  XB.scut = add('scut', rig.root, [0, H * 0.32, -T * 0.42]);
  // a blunt, rounded muzzle (the snout half as long)
  rig.dims.sl *= 0.55;
  void W;
}
function grotesque(S: Ctx, page: Page) {
  const D = S.rig.dims, iH = S.bi('head'), H0 = S.at(iH), iR = S.rig.root, R0 = S.at(iR);
  const { hl, hw, hh, W, H, T } = D;
  const FAT = S.fixed('BH_FAT', 24, 24), TOOTH = S.fixed('BH_TOOTH', 6, 10), EAR = S.fixed('BH_EAR', 12, 24), SCAR = S.fixed('BH_SCAR', 12, 12);
  const SKIN = S.fixed('BH_SKIN', 12, 12), TAILR = S.fixed('BH_TAIL', 12, 12), EYE = S.fixed('BH_EYE', 8, 8), BOSS = S.fixed('BH_HORN', 12, 12);
  const fuzzy = (amp: number) => (a: number, t: number) => amp * (Math.sin(a * 13 + t * 9) * 0.5 + Math.sin(a * 29 - t * 17) * 0.3);
  // ---- the fat: a sagging belly (on its own bone, so it wobbles), a high rounded rump, enormous haunches
  ball(S.B, FAT, S.gid(), addV(R0, [0, -H * 0.3, T * 0.36]), [0, 1, 0], [W * 0.62, H * 0.5, T * 0.72], [XB.belly, 0.75, iR, 0.25], { n: 14, rings: 9, bump: fuzzy(0.04) });
  ball(S.B, FAT, S.gid(), addV(R0, [0, H * 0.2, -T * 0.12]), [0, 1, 0], [W * 0.58, H * 0.52, T * 0.5], [iR, 1], { n: 14, rings: 9, bump: fuzzy(0.05) });
  const good = S.rig.legs.find((l) => l.kind === 'hind');
  if (good) { const hp = S.at(good.bones[0]); ball(S.B, FAT, S.gid(), [hp[0] + good.side * W * 0.08, hp[1] + H * 0.02, hp[2] - T * 0.04], [0, 1, 0], [W * 0.36, H * 0.52, T * 0.46], [good.bones[0], 0.55, iR, 0.45], { n: 12, rings: 8, bump: fuzzy(0.05) }); }
  // the stump: what is left of the right hind leg, fused into a knot of scar and bone sunk in a smaller haunch
  if (MISSING) {
    const hip = S.at(MISSING.bones[0]);
    ball(S.B, FAT, S.gid(), [hip[0] + W * 0.05, hip[1] + H * 0.05, hip[2] - T * 0.04], [0, 1, 0], [W * 0.3, H * 0.42, T * 0.38], [iR, 1], { n: 12, rings: 8, bump: fuzzy(0.05) });
    ball(S.B, SCAR, S.gid(), [hip[0] + W * 0.2, hip[1] - H * 0.22, hip[2] - T * 0.02], [0.6, -1, 0.2], [D.lt * 1.2, D.lt * 1.0, D.lt * 1.1], [iR, 1], { n: 10, rings: 7, bump: (a, t) => 0.2 * Math.sin(a * 4 + t * 7) + 0.1 * Math.sin(a * 9) });
  }
  // the cotton tail, matted into a dirty ball
  ball(S.B, TAILR, S.gid(), addV(R0, [0, H * 0.32, -T * 0.5]), [0, 0.3, -1], [W * 0.17, W * 0.16, W * 0.15], [XB.scut, 1], { n: 10, rings: 6, bump: fuzzy(0.18) });
  // ---- the head: a blunt rounded muzzle with fat whisker pads and a split lip, chisel teeth under it
  const mz: V3 = [H0[0], H0[1] - hh * 0.12, H0[2] + hl * 0.5];
  for (const s of [-1, 1]) ball(S.B, SKIN, S.gid(), [mz[0] + s * hw * 0.13, mz[1], mz[2]], [s * 0.3, 0, 1], [hw * 0.17, hh * 0.24, hl * 0.16], [iH, 1], { n: 10, rings: 6, bump: fuzzy(0.06) });
  ball(S.B, SKIN, S.gid(), [mz[0], mz[1] + hh * 0.18, mz[2] + hl * 0.02], [0, 0.3, 1], [hw * 0.12, hh * 0.1, hl * 0.08], [iH, 1], { n: 8, rings: 5 }); // the nose
  for (const s of [-1, 1]) {
    const b: V3 = [mz[0] + s * hw * 0.045, mz[1] - hh * 0.12, mz[2] + hl * 0.1];
    sac(S.B, TOOTH, S.gid(), [b, [b[0], b[1] - hh * 0.3, b[2] + hl * 0.03], [b[0], b[1] - hh * 0.55, b[2] + hl * 0.01]], [[hw * 0.05, hw * 0.022], [hw * 0.048, hw * 0.02], [hw * 0.04, hw * 0.016]], [[iH, 1], [iH, 1], [iH, 1]], { n: 6, sq: 3 });
  }
  // a callus on the forehead from everything it has hit
  ball(S.B, BOSS, S.gid(), [H0[0], H0[1] + hh * 0.36, H0[2] + hl * 0.25], [0, 0.6, 0.8], [hw * 0.3, hh * 0.14, hl * 0.2], [iH, 1], { n: 10, rings: 6, bump: (a, t) => 0.25 * Math.max(0, Math.sin(a * 5)) * Math.sin(t * Math.PI) });
  // the long ears, on their own bones (they flop and twitch): broad, veined, the right one torn ragged
  for (const s of [-1, 1]) {
    const ib = s < 0 ? XB.earL : XB.earR, b = S.at(ib);
    const tear = s > 0 ? 0.6 : 1, E = hl * 1.9;
    const tip: V3 = [b[0] + s * hw * 0.3, b[1] + E * 0.95, b[2] - E * 0.22];
    const midP: V3 = [b[0] + s * hw * 0.16, b[1] + E * 0.5, b[2] - E * 0.06];
    sac(S.B, EAR, S.gid(), [b, midP, tip], [[hw * 0.2, hw * 0.08], [hw * 0.36, hw * 0.07], [hw * 0.16 * tear, hw * 0.05]], [[ib, 1], [ib, 1], [ib, 1]], { n: 10, bump: fuzzy(0.05) });
  }
  // the eyes: big, dark, wet, bulging out of the sides of the skull, the rims raw
  for (const s of [-1, 1]) ball(S.B, EYE, S.gid(), [H0[0] + s * hw * 0.38, H0[1] + hh * 0.2, H0[2] + hl * 0.12], [s, 0.1, 0.3], [hw * 0.2, hw * 0.18, hw * 0.2], [iH, 1], { n: 12, rings: 7 });
  // ---- paint
  const coat = makeRamp(0x6a5a48, 6, { spread: 0.45 });
  FAT.fill(coat, (x, y) => 2.1 + Math.cos(FAT.th(x)) * 0.9 + (FAT.fbm(x, y, 4, 2, 5) - 0.5) * 1.6 + (hash(x, y) - 0.5) * 0.9);
  for (let y = 0; y < FAT.h; y++) for (let x = 0; x < FAT.w; x++) {
    const m = FAT.fbm(x, y, 5, 2, 33), h = hash(x * 7, y * 3);
    if (Math.cos(FAT.th(x)) < -0.6) FAT.blend(x, y, 0xb0a088, 0.35); // the paler underside
    if (m > 0.72) FAT.set(x, y, h < 0.25 ? 0x5a1a14 : mixHex(0xb88a84, 0xd8a8a0, hash(x * 5, y))); // mange, scabs, stretch-raw skin
    else if (m < 0.2) FAT.blend(x, y, 0x241c16, 0.55); // matted, filthy
    if ((x + y * 3) % 7 === 0 && h < 0.4) FAT.blend(x, y, 0x3a2e24, 0.4); // the lie of the hair
  }
  for (let y = 0; y < TOOTH.h; y++) for (let x = 0; x < TOOTH.w; x++) TOOTH.set(x, y, mixHex(0xe8d088, 0x8a5a20, y / TOOTH.h * 0.7 + hash(x, y) * 0.15));
  SKIN.fill(makeRamp(0x9a8a76, 6, { spread: 0.4 }), (x, y) => 2.8 + Math.cos(SKIN.th(x)) * 0.8 + (hash(x, y) - 0.5));
  for (let x = 0; x < SKIN.w; x++) if (Math.abs(SKIN.th(x)) < 0.25) for (let y = 0; y < SKIN.h; y++) SKIN.set(x, y, 0x3a1414); // the split
  for (let i = 0; i < 10; i++) SKIN.set(Math.floor(hash(i, 2) * SKIN.w), Math.floor(hash(i, 3) * SKIN.h), 0x1a1210); // whisker pits
  EAR.fill(makeRamp(0xc89090, 6, { spread: 0.5 }), (x, y) => 2.8 + Math.cos(EAR.th(x)) * 0.9 + (hash(x, y) - 0.5) * 0.5);
  for (let i = 0; i < 7; i++) EAR.line(EAR.w * (0.2 + hash(i, 3) * 0.6), 0, EAR.w * (0.2 + hash(i, 4) * 0.6), EAR.h, 0x8a3a4a, 0.55);
  for (let x = 0; x < EAR.w; x++) if (Math.abs(EAR.th(x)) > 1.6) for (let y = 0; y < EAR.h; y++) EAR.blend(x, y, 0x6a5a4a, 0.7); // furred backs
  SCAR.fill(makeRamp(0xc88a8a, 6, { spread: 0.55 }), (x, y) => 2.6 + Math.sin(x * 1.3 + y * 0.7) * 1.2 + (hash(x, y) - 0.5));
  for (let i = 0; i < 8; i++) SCAR.line(hash(i, 5) * SCAR.w, hash(i, 6) * SCAR.h, hash(i, 7) * SCAR.w, hash(i, 8) * SCAR.h, 0xe8c8b8, 0.7);
  for (let y = 0; y < TAILR.h; y++) for (let x = 0; x < TAILR.w; x++) TAILR.set(x, y, hash(x * 3, y) < 0.2 ? 0x6a5a46 : mixHex(0xe0d8c8, 0xa89880, hash(x, y * 5)));
  BOSS.fill(makeRamp(0x8a7a60, 6, { spread: 0.5 }), (x, y) => 2.6 + Math.cos(BOSS.th(x)) * 1.1 + ((y % 3) === 0 ? -1 : 0) + (hash(x, y) - 0.5) * 0.8);
  for (let y = 0; y < EYE.h; y++) for (let x = 0; x < EYE.w; x++) { const r = Math.hypot(EYE.th(x), (y / EYE.h - 0.5) * 3); EYE.set(x, y, r < 0.9 ? mixHex(0x0e0808, 0x2a1810, r) : r < 1.3 ? 0x8a2a2a : mixHex(0xc89090, 0x8a5050, hash(x, y) * 0.5)); }
  EYE.set(Math.floor(EYE.w * 0.45), Math.floor(EYE.h * 0.35), 0xffffff);
  for (const name of ['BODY', 'HEAD', 'LIMB']) {
    const r = page.regs.get(name); if (!r) continue;
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
      const m = r.fbm(x, y, 5, 2, 71);
      if (m > 0.7) r.set(x, y, hash(x, y * 3) < 0.25 ? 0x5a1a14 : mixHex(0xb88a84, 0xd8a8a0, hash(x * 5, y))); // mange and scabs
      else if (m < 0.2) r.blend(x, y, 0x241c16, 0.5); // matted, filthy
    }
  }
}

export function buildBatteringHare(): LifeGameRig {
  const model = lifeModel('battering_hare', DESIGN, grotesque, tweak);
  return lifeRig(model, SCALE, model.rig.height * SCALE);
}

// ------------------------------------------------------------------ the pose: a low, hunched three-legged crawl, the ram
export type HarePose = 'idle' | 'bound' | 'scrape' | 'charge' | 'dazed' | 'dead';
const _q = new THREE.Quaternion(), _e = new THREE.Euler();
function poseH(R: LifeGameRig, t: number, dt: number, md: HarePose, speed: number, far: boolean, flinch: number) {
  const L = R.life, rig = L.model.rig, B = L.bones, ud = L.m as Record<string, number>;
  const rb = rig.bones[rig.root].pos, r0 = ((L.model as any).r0 ??= [rb[0], rb[1], rb[2]]) as number[];
  const mv = Math.min(1, speed / 2), charge = md === 'charge';
  // the crawl: the hind leg shoves (the body surges forward and up a little), then it drags itself on the forelegs
  ud.bph = (ud.bph ?? 0) + dt * speed / (charge ? 3.4 : 2.0) / SCALE * 2.6;
  const u = ((ud.bph % 1) + 1) % 1;
  const shove = u < 0.32 ? Math.sin(Math.PI * u / 0.32) : 0;
  // low to the floor: lower still in the charge, the scrape and the daze
  const lowT = md === 'dead' ? 1 : charge ? 0.56 : md === 'scrape' ? 0.66 : md === 'dazed' ? 0.6 : 0.74 - 0.04 * mv;
  ud.lowH = (ud.lowH ?? lowT) + (lowT - (ud.lowH ?? lowT)) * (1 - Math.exp(-5 * dt));
  rb[1] = r0[1] * ud.lowH + shove * r0[1] * (charge ? 0.1 : 0.16) * mv;
  rb[2] = r0[2] + (shove - 0.35) * r0[1] * (charge ? 0.4 : 0.28) * mv;
  const st = md === 'dead' ? 'dead' : md === 'dazed' ? 'stunned' : md === 'scrape' ? 'idle' : speed > 0.1 ? 'move' : 'idle';
  const ok = lifeAnimate(R, dt, { speed: speed / SCALE * (charge ? 0.8 : 1), state: st as any }, 0, far);
  rb[1] = r0[1]; rb[2] = r0[2];
  if (!ok) return;
  // slewing toward the missing leg on every shove, nose dipping as the forelegs pull
  R.body.position.y = 0;
  R.body.rotation.z = -((0.05 + 0.09 * (1 - shove)) * mv + 0.05);
  R.body.rotation.x = (shove > 0 ? -0.05 * shove : 0.06) * mv;
  const low = (ud.low = (ud.low ?? 0) + (((md === 'scrape' || charge) ? 1 : 0) - (ud.low ?? 0)) * (1 - Math.exp(-6 * dt)));
  const daze = (ud.dz = (ud.dz ?? 0) + ((md === 'dazed' ? 1 : 0) - (ud.dz ?? 0)) * (1 - Math.exp(-5 * dt)));
  // head down to ram; dazed: head swaying, low
  const neck = rig.neck[0];
  if (neck !== undefined && neck >= 0) { _q.setFromEuler(_e.set(0.45 * low + 0.35 * daze, Math.sin(t * 2.3) * 0.35 * daze, Math.sin(t * 1.7) * 0.25 * daze)); B[neck].quaternion.premultiply(_q); }
  if (rig.head >= 0) { _q.setFromEuler(_e.set(0.3 * low, 0, 0)); B[rig.head].quaternion.multiply(_q); }
  // scraping: one forefoot raking back along the floor
  if (md === 'scrape') {
    const fore = rig.legs.find((l) => l.kind === 'fore' && l.side < 0);
    if (fore) { const k = Math.sin(t * 9); _q.setFromEuler(_e.set(-0.5 + 0.8 * Math.max(0, k), 0, 0)); B[fore.bones[0]].quaternion.multiply(_q); }
  }
  // the belly: a sack of fat on a spring, slapped about by every shove
  if (XB.belly >= 0) {
    const vy = (rb[1] + shove * r0[1] * 0.16 * mv - (ud.py ?? 0)) / Math.max(dt, 1e-3); ud.py = rb[1] + shove * r0[1] * 0.16 * mv;
    ud.bv = (ud.bv ?? 0) + (-(ud.bo ?? 0) * 140 - (ud.bv ?? 0) * 5 - Math.max(-3, Math.min(3, vy)) * 6) * dt;
    ud.bo = Math.max(-0.25, Math.min(0.25, (ud.bo ?? 0) + ud.bv * dt));
    const bb = B[XB.belly];
    bb.position.y += ud.bo * r0[1] * 0.25 - r0[1] * 0.04 * (1 - mv); // it sags when it stops
    bb.scale.set(1 + Math.abs(ud.bo) * 0.25 + 0.04 * (1 - mv), 1 - ud.bo * 0.4, 1 + Math.abs(ud.bo) * 0.15);
  }
  // the ears: laid back by the speed, flopping with the shoves, twitching on their own
  if (XB.earL >= 0) {
    if ((ud.twT ?? 0) < t) { ud.twT = t + 0.6 + Math.random() * 2.2; ud.twS = Math.random() < 0.5 ? -1 : 1; ud.tw0 = t; }
    const tw = Math.exp(-((t - (ud.tw0 ?? -9)) * 9)) * Math.sin((t - (ud.tw0 ?? -9)) * 40);
    for (const s of [-1, 1]) {
      const b = B[s < 0 ? XB.earL : XB.earR];
      const back = -0.35 * mv - (charge ? 0.75 : 0) - 0.3 * daze, flop = (s > 0 ? 0.55 : 0.12) + shove * 0.2 * mv + 0.35 * daze;
      _q.setFromEuler(_e.set(back + (s === ud.twS ? tw * 0.25 : 0), s * (0.1 + (s === ud.twS ? tw * 0.3 : 0)), s * flop));
      b.quaternion.multiply(_q);
    }
  }
  if (XB.scut >= 0) { _q.setFromEuler(_e.set(Math.sin(t * 7) * 0.15 * mv, Math.sin(t * 11) * 0.2, 0)); B[XB.scut].quaternion.multiply(_q); }
  if (flinch > 0) B[rig.root].position.x += Math.sin(t * 60) * 0.02 * flinch;
}
export function poseBatteringHare(R: LifeGameRig, t: number, dt: number, pose: HarePose = 'idle', o: { speed?: number } = {}) {
  poseH(R, t, dt, pose, o.speed ?? (pose === 'bound' ? 3 : pose === 'charge' ? 10 : 0), false, 0);
}

/** dust, sounds and shakes of a rammer (the hare and the procedural heavies) */
export function ramFeedback(rig: Rig, c: Creature, t: number, d: number) {
  const n = netOf(c), ud = (rig as any).life?.m ?? rig.root.userData;
  // dust off the scraping forefoot and the charge
  if ((n.md === 'scrape' || n.md === 'charge') && live() && c.visibleToLocal && (ud.dT ?? 0) < t) {
    ud.dT = t + 0.08;
    const dust = (G as any).destruct?.dust;
    if (dust) for (let i = 0; i < 3; i++) { const a = c.facing + Math.PI + (Math.random() - 0.5) * 1.2; dust.add(PK.Dust, c.x + Math.cos(c.facing) * 1.2 + (Math.random() - 0.5), 0.1, c.z + Math.sin(c.facing) * 1.2 + (Math.random() - 0.5), Math.cos(a) * 1.5, 0.4 + Math.random() * 0.6, Math.sin(a) * 1.5, 0.06 + Math.random() * 0.06, 0.8 + Math.random() * 0.6, 0xa89880); }
  }
  const f = fxPoll(rig, c);
  if (f) {
    if (f.key === 'scrape') { playAt('hound_huff', c, 1, 26, 0.45); playAt('dmg_scrape_wood', c, 0.6, 18, 0.6); }
    else if (f.key === 'charge') playAt('dog_growl', c, 0.9, 30, 0.35);
    else if (f.key === 'smash') { playAt('dmg_wall_break', c, 1, 34, 0.8); playAt('vx_slam', c, 0.8, 34, 0.7); if (d < 16) G.camera?.shake?.(0.5, 0.4); }
    else if (f.key === 'thud') { playAt('body_thud', c, 1, 30, 0.5); playAt('vx_slam', c, 1, 34, 0.6); if (d < 18) G.camera?.shake?.(0.6, 0.45); }
    else if (f.key === 'hit') { playAt('cb_impact', c, 1, 24, 0.8); playAt('bone_crunch', c, 0.8, 20, 0.8); }
  }
}
function animateHare(rig: Rig, c: Creature, t: number, dt: number) {
  const R = rig as LifeGameRig, n = netOf(c);
  const p = live() ? G.local : null;
  const d = p && p.zoneKey === c.zoneKey ? dist(p, c) : 99;
  const md: HarePose = c.dead ? 'dead' : (n.md as HarePose) || (c.speed > 0.2 ? 'bound' : 'idle');
  poseH(R, t, dt, md, c.dead ? 0 : c.speed, d > 40, flinchOf(c));
  R.life.F.fx.value.z = Math.min(1, c.hitFlash / 0.15) * 0.4;
  const ud = R.life.m;
  // the landings: the ground takes every one, harder on the stump side
  if (!c.dead && c.speed > 1 && live()) {
    const u = (((ud.bph ?? 0) % 1) + 1) % 1;
    // every shove ends with the weight of it slapping down; between shoves the belly drags on the floor
    if (u > 0.3 && !ud.landed) { ud.landed = 1; if (d < 30) { playAt('strider_land', c, Math.min(1, 0.4 + c.speed * 0.05), 30, 0.6); if ((ud.drT ?? 0) < t) { ud.drT = t + 1.4; playAt('drag_scrape', c, 0.5, 18, 0.7); } if (d < 12) G.camera?.shake?.(0.05 + c.speed * 0.01, 0.2); } }
    else if (u < 0.1) ud.landed = 0;
  }
  ramFeedback(rig, c, t, d);
  const lp = localIn(c);
  if (lp && !c.dead && c.visibleToLocal && d < 40) {
    if (n.md === 'scrape') thinkOnce(lp, 'hare_scrape', ['It has its head down. It is scraping the floor. It is lined up on ME.', 'Get out of the line. Sideways. NOW.'][Math.floor(t) % 2], 20);
    else if (n.md === 'dazed') thinkOnce(lp, 'hare_daze', 'It hit the wall and it is just standing there, swaying. Now is the time.', 30);
    else thinkOnce(lp, 'hare', ['A rabbit. The size of an elephant. Dragging itself along on three legs.', 'It is so fat its belly drags on the floor. One back leg is just a lump of scar. It is still fast.'][Math.floor(t * 0.15) % 2], 90);
  }
}

// ------------------------------------------------------------------ host brain
function setMd(c: Creature, md: string) { const n = net(c); if (n.md !== md) { n.md = md; c.mem.mdT = 0; } }
/** a rammer's numbers (the procedural heavy species use the same brain: src/creatures/species/wildlife.ts) */
export interface RamCfg { v: number; max: number; dmg: [number, number]; cdmg: number; scrape: number; sight: number; wander: number }
const HARE_RAM: RamCfg = { v: 11, max: 30, dmg: [26, 42], cdmg: 70, scrape: 1.5, sight: 26, wander: 18 };
const ramOf = (c: Creature): RamCfg => (c.sp as any).ram ?? HARE_RAM;
function clearGap(z: ReturnType<typeof zoneOf>, x: number, y: number, side: 0 | 1) {
  if (z.edge(x, y, side)) op('edge', { z: z.key, x, y, side, patch: null });
  if ((side === 0 ? z.wallN : z.wallW)[z.idx(x, y)]) op('wall', { z: z.key, x, y, side, wall: 0 });
}
/** the hare at full tilt along a fixed heading: whatever is in the way is hit */
function ramStep(c: Creature, dt: number): 'go' | 'stop' | 'wall' {
  const z = zoneOf(c), m = c.mem, RC = ramOf(c), CHARGE_V = RC.v;
  const h = m.ramH as number, dx = Math.cos(h), dz = Math.sin(h);
  const step = Math.min(CHARGE_V * dt, 0.5);
  const v = (m.ramV ?? 1);
  // the head is a body length ahead of the hips: that is what meets things first
  const ax = c.x + dx * (c.radius + step), az = c.z + dz * (c.radius + step);
  const tx = Math.floor(ax), ty = Math.floor(az);
  if (!z.inb(tx, ty)) return 'wall';
  const sm = (m.smashed ??= {}) as Record<string, number>;
  // the front of it is as wide as it is: everything across that width is hit at once
  const wr = c.radius * 0.85, px = -dz, pz = dx;
  const tiles = new Map<number, [number, number]>();
  for (let k = -wr; k <= wr + 1e-6; k += Math.max(0.3, wr / 3)) { const fx0 = Math.floor(ax + px * k), fz0 = Math.floor(az + pz * k); if (z.inb(fx0, fz0)) tiles.set(z.idx(fx0, fz0), [fx0, fz0]); }
  // furniture and barricades in the path: smashed (it keeps going, a little slower); what will not break stops it
  for (const [ox, oy] of tiles.values()) for (const o of z.objectsAt(ox, oy)) {
    const d = objDef(o.key); if (!d || !d.block || d.block === 'none') continue;
    if (!breakable(d, o)) { if (d.block === 'solid') return 'wall'; continue; }
    if (sm['o' + o.uid]) { if (sm['o' + o.uid] > 2 && d.block === 'solid') return 'wall'; continue; }
    sm['o' + o.uid] = 1;
    op('objDmg', { z: z.key, uid: o.uid, d: 420, how: 'blunt', by: null, hx: ax, hy: 0.8, hz: az, dx, dz });
    if (z.objects.has(o.uid) && (o.hp ?? 1) > 0) sm['o' + o.uid] = 3; // it held: next step it is a wall
    fx(c, 'smash'); m.ramV = Math.max(0.55, v - 0.12);
  }
  // the edges it crosses: doors and barricaded doors burst open; base walls (wood, drywall) are knocked through
  // across the whole width of it; the place's own walls (concrete, brick) do not move, and neither does a pillar
  const hx = c.x + dx * c.radius, hz = c.z + dz * c.radius, cx = Math.floor(hx), cz = Math.floor(hz);
  const segs: [number, number, 0 | 1, 1 | -1][] = [];
  if (ty !== cz) for (let xx = Math.floor(c.x - wr); xx <= Math.floor(c.x + wr); xx++) segs.push([xx, Math.max(cz, ty), 0, dz > 0 ? -1 : 1]);
  if (tx !== cx) for (let yy = Math.floor(c.z - wr); yy <= Math.floor(c.z + wr); yy++) segs.push([Math.max(cx, tx), yy, 1, dx > 0 ? -1 : 1]);
  for (const [ex, ey, side, nn] of segs) {
    if (!z.inb(ex, ey)) continue;
    const i = z.idx(ex, ey), key = 'e' + (i * 2 + side);
    const e = z.edge(ex, ey, side);
    if (e) {
      if (e.open && !e.barricade) continue;
      // a door (or a hole already knocked through): the door, the frame and all, goes; what is left is a ragged gap
      if (!sm[key]) { sm[key] = 1; clearGap(z, ex, ey, side); if (e.kind !== 'arch') { fx(c, 'smash'); m.ramV = Math.max(0.55, (m.ramV ?? 1) - 0.12); } }
      continue;
    }
    const wid = side === 0 ? z.wallN[i] : z.wallW[i];
    if (!wid) continue;
    if (!sm[key]) {
      sm[key] = 1; op('wallSmash', { z: z.key, x: ex, y: ey, side, d: 420, how: 'blunt', by: null, u: 0.5, h: 1.0, n: nn }); fx(c, 'smash');
      // broken through: no jambs left standing in the hole (it is as wide as the animal)
      if (z.edges.get(i * 2 + side)?.kind === 'arch') clearGap(z, ex, ey, side);
    }
    if (!z.edges.has(i * 2 + side) && (side === 0 ? z.wallN[i] : z.wallW[i])) return 'wall';
  }
  if (z.solid[z.idx(tx, ty)] || !z.floor[z.idx(tx, ty)]) return 'wall';
  const vv = (m.ramV ?? 1);
  // (the manager moves it with the world's collision; if something we did not see holds it, that is a wall too)
  if (m.ramPx !== undefined) {
    const got = Math.hypot(c.x - m.ramPx, c.z - m.ramPz), want = (m.ramWant ?? 0);
    m.ramStuck = want > 0.02 && got < want * 0.3 ? (m.ramStuck ?? 0) + dt : 0;
    m.ramD = (m.ramD ?? 0) + got;
    if (m.ramStuck > 0.2) return 'wall';
  }
  m.ramPx = c.x; m.ramPz = c.z; m.ramWant = CHARGE_V * vv * dt;
  c.vx = dx * CHARGE_V * vv; c.vz = dz * CHARGE_V * vv; c.speed = CHARGE_V * vv;
  c.facing = c.targetFacing = h;
  // units and animals in the way are run down
  const hit = (m.ramHit ??= {}) as Record<string, number>;
  for (const p of playersIn(c.zoneKey)) if (!p.body.dead && !hit[p.id] && Math.hypot(p.x - hx, p.z - hz) < c.radius * 0.9 + 0.5) {
    hit[p.id] = 1; fx(c, 'hit');
    // run down, not held: the blow comes from back along the line (it throws you forward and out of the way, and it does
    // not stop to sit on you)
    const h: HitInfo = { dmg: rng.float(RC.dmg[0], RC.dmg[1]), kinds: ['fracture', 'bruise'], corrupt: 0, height: c.height, knock: 2.6, from: [c.x - dx * 4.5 - pz * 0.6, c.z - dz * 4.5 + px * 0.6], grab: false, parts: ['torso_u', 'torso_l', 'thigh_l', 'thigh_r', 'uarm_l', 'uarm_r'], by: c.sp.key };
    if (p.isLocal) applyHitToPlayer(p, h); else G.net?.sendHurt?.(p.id, h);
  }
  for (const o of CS().creatures.values()) if (o !== c && !o.dead && o.zoneKey === c.zoneKey && !hit[o.id] && Math.hypot(o.x - hx, o.z - hz) < c.radius * 0.9 + o.radius) {
    hit[o.id] = 1; CS().damage(c.id, o.id, RC.cdmg, c.x, c.z, 1.6, 'blunt'); fx(c, 'hit');
  }
  return m.ramD > RC.max ? 'stop' : 'go';
}
/** lower the head, scrape, charge in a dead straight line, dazed by what will not break */
export function thinkRammer(c: Creature, dt: number): boolean {
  const z = zoneOf(c), m = c.mem, n = net(c), ev = pulse(c), RC = ramOf(c);
  m.mdT = (m.mdT ?? 0) + dt;
  const md: string = n.md ?? '';
  if (!m.init) { m.init = 1; setMd(c, ''); }
  if (ev.hurt > 0 && c.targetId && md !== 'charge' && md !== 'dazed') { n.tg = c.targetId; m.cd = 0; }
  if (md === 'charge') {
    c.setState('chase');
    const r = ramStep(c, dt);
    if (r === 'wall') { fx(c, 'thud'); setMd(c, 'dazed'); stop(c); c.stagger = 1.2; for (const q of playersIn(c.zoneKey)) if (dist(q, c) < 25) { ruleShown(c); break; } }
    else if (r === 'stop') { setMd(c, ''); stop(c); m.cd = G.time + rng.float(3, 5); }
    return true;
  }
  if (md === 'dazed') { stop(c); c.setState('frozen'); if (m.mdT > 1.8) { setMd(c, ''); m.cd = G.time + 3; } return true; }
  if (md === 'scrape') {
    stop(c); c.setState('warn');
    const p = n.tg ? G.players.get(n.tg) as Player | undefined : undefined;
    if (p) faceTo(c, p.x, p.z);
    if (m.mdT > RC.scrape) {
      // the line is fixed now: where it is facing (it will not steer again)
      m.ramH = c.facing; m.ramD = 0; m.ramV = 1; m.ramHit = {}; m.smashed = {}; m.ramPx = undefined; m.ramStuck = 0;
      setMd(c, 'charge'); fx(c, 'charge');
    }
    return true;
  }
  // ---- grazing, bounding about; a unit in the open in front of it is a thing to run down
  c.setState('wander');
  if ((m.cd ?? 0) < G.time) {
    let best: Player | null = null, bd = RC.sight;
    for (const p of playersIn(c.zoneKey)) {
      if (p.body.dead) continue;
      // seen in the open, or heard close behind a wall or a barricade (it goes through those)
      const d = dist(p, c);
      if (d < bd && d > 4 && (lineOfSightB(z, c.x, c.z, p.x, p.z) || d < RC.sight * 0.5)) { bd = d; best = p; }
    }
    if (best) { n.tg = best.id; setMd(c, 'scrape'); fx(c, 'scrape'); faceTo(c, best.x, best.z); stop(c); return true; }
  }
  if (!c.goal || CS().moveTo(c, z, c.goal.x, c.goal.z, c.sp.walk, dt, 1.5) || m.mdT > 14) { c.goal = CS().wanderSpot(c, z, RC.wander); m.mdT = 0; }
  return true;
}

const HARE = def({
  key: 'battering_hare', name: 'Battering Hare', code: 'OP-05 // FAUNA, LEPORID (GIGANTIC, MAIMED)', temperament: 'territorial', threat: 4,
  rule: { name: 'IT RAMS IN A STRAIGHT LINE', text: 'It lowers its head and scrapes the floor, lined up on you, then charges in a dead straight line through anything in the way: furniture, barricades, the walls of a camp. It cannot turn once it has started. Step out of the line. If it hits something it cannot break (the place\'s own walls, a pillar) it stands dazed for a few seconds.', tell: 'Head down, scraping the floor with one foot. Lined up on me.' },
  hp: 420, walk: 1.6, run: 6.5, turn: 2.4, radius: 1.4, height: 3.6, sight: 26, fov: 1.6, hearing: 1.6,
  attack: { dmg: [26, 40], range: 2.2, cooldown: 2.5, kinds: ['fracture', 'bruise'], corrupt: 0, knock: 2 },
  zones: ['fields', 'meadow', 'parking', 'suburbs', 'homestead'], weight: 0.15, group: [1, 1], maxPerZone: 1, diet: 'grass',
  meat: [['hare_haunch', 4], ['hare_incisor', 1]],
  disposition: { mood: 'territorial', self: true },
  sounds: { alert: 'hound_huff', hurt: 'cower_squeak', death: 'hound_death', step: 'strider_land' },
  scan: {
    cls: 'Fauna / gigantic leporid (maimed)',
    notes: [
      'A rabbit the size of an elephant, grossly fat. The right hind leg is missing, fused into a stump of scar; it crawls low on three, belly dragging.',
      'Huge haunches, sagging belly, long torn ears, split lip over chisel incisors, big dark eyes, a callused forehead, mange.',
      'Rams: lowers the head, scrapes, charges in a straight line through furniture, barricades and base walls.',
      'Cannot turn once charging. A hit on solid structure leaves it dazed for a few seconds.',
    ],
  },
  gore: { blood: 'red', flesh: 0xa84a4a, gib: false },
  build: () => buildBatteringHare(), animate: animateHare, think: thinkRammer,
});
onPlayerHit('battering_hare', (p) => { bus.emit('think', p, ['It went straight through me. Like a lorry.', 'I am on the floor. I do not know where I am. Something is broken.'][Math.floor(Math.random() * 2)]); });
defDread('battering_hare', { sting: 'chase', cam: 1 });
const GAL: HarePose[] = ['idle', 'bound', 'scrape', 'charge', 'dazed'];
HARE.animateGallery = (rig: Rig, t: number) => {
  const q = (new URLSearchParams(location.search).get('pose') || GAL[Math.floor(t / 3) % GAL.length]) as HarePose;
  poseBatteringHare(rig as LifeGameRig, t, 1 / 60, q);
};

