import * as THREE from 'three';
import { def, Rig } from '../species';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import type { Creature } from '../creature';
import type { Player } from '../../entities/player';
import { CS, zoneOf, pulse, stop, faceTo } from '../behaviors_a';
import { net, netOf, playAt, hashId, rng, localIn, thinkOnce, dist, playersIn, fx, fxPoll, live, lightAt } from '../behaviors_b';
import { flinchOf } from '../kit/humanoids';
import { lifeModel, lifeRig, lifeAnimate, type LifeGameRig } from '../life/lifeMesh';
import type { Design } from '../life/design';
import type { Ctx } from '../life/sculpt';
import { sac, ball, hash, addV, scl, type V3, type Page } from '../life/kit';
import { makeRamp, mixHex } from '../../gfx/pixel';
import { infestPlayer, infestCreature } from '../../survival/parasite';
import { defDread } from '../dread';
import { ruleShown } from '../rules';
import type { BodyPart } from '../../items/item';
import '../../audio/sounds_creatures_c';

// =====================================================================================
// THE PARASITE SALAMANDER — a pale, wet amphibian a forearm long that lives inside
// other animals. You can see through it: the organs are dark shapes under skin the
// colour of a peeled grape, the veins blue. It has a flat shovel of a snout for
// pushing into flesh and, under it, a round rasping mouth ringed with teeth; frilled
// red gills behind the head that flush and flatten as it breathes; and too many
// fingers, small and soft and grasping, eight or nine to a foot. It hunts for hosts
// (the sleeping, the hurt, the dead, anything that keeps still) by creeping up,
// latching on and burrowing in through the skin, and once in it eats its host's
// organs one at a time and grows, and then lays. src/survival/parasite.ts runs its
// life inside a body. Its young (the larvae) wriggle out of whatever it was in.
//   parasite_salamander  the adult
//   salamander_larva     a hatchling, a finger long: it looks for a corpse, or grows
// Built with the user's creature software (src/creatures/life, ported): the newt
// body plan (sprawling legs, a paddle tail, external gills), with the shovel snout,
// the rasp, the extra fingers and the see-through skin added on top here.
// =====================================================================================

const DESIGN: Design = {
  name: 'Parasite Salamander', latin: 'Endoproctus vorax', plan: 'quadruped', lineage: 'vertebrate',
  genes: ['vert_quadruped', 'leg_sprawl', 'tongue', 'amphib_skin', 'tail_fin', 'gills', 'spawn'],
  size: 0.0, len: 0.25, girth: 0.42, legLen: 0.42, legThick: 0.42, neck: 0.05, head: 0.5, tail: 0.85, segs: 3,
  colors: { base: 0xe2c8c0, belly: 0xf2e2da, pattern: 0xb08890, accent: 0xc8303c, eye: 0xd8d6c8 },
  pattern: 'mottled', patScale: 0.7, cover: 'slime', seed: 4471,
};

/** the mouth (head space) and its axis (forward and down), and the bones added for its layers */
const MOUTH_AT = (D: Record<string, number>): V3 => [0, -D.hh * 0.3, D.hl * 0.62];
const MOUTH_AX: V3 = (() => { const l = Math.hypot(0.55, 1); return [0, -0.55 / l, 1 / l]; })();
const XM = { lips: -1, r1: -1, r2: -1, r3: -1 };
function tweakS(rig: any) {
  const m = MOUTH_AT(rig.dims);
  const add = (name: string) => { rig.bones.push({ name, parent: rig.head, pos: [m[0], m[1], m[2]] }); return rig.bones.length - 1; };
  XM.lips = add('lips'); XM.r1 = add('teeth1'); XM.r2 = add('teeth2'); XM.r3 = add('teeth3');
}
function grotesque(S: Ctx, page: Page) {
  const rig = S.rig, D = rig.dims;
  const iH = S.bi('head'), H0 = S.at(iH);
  const { hl, hw, hh } = D;
  const SKIN = S.fixed('PS_SHOVEL', 16, 16), RASP = S.fixed('PS_RASP', 8, 8), TOOTH = S.fixed('PS_TOOTH', 4, 6), FING = S.fixed('PS_FING', 6, 8);
  // the shovel: a flat, broad blade of snout pushed out past the face, its edge thin and hard
  const tipZ = H0[2] + hl * 0.95;
  sac(S.B, SKIN, S.gid(), [[H0[0], H0[1] - hh * 0.05, H0[2] + hl * 0.35], [H0[0], H0[1] - hh * 0.12, H0[2] + hl * 0.7], [H0[0], H0[1] - hh * 0.2, tipZ]],
    [[hw * 0.62, hh * 0.32], [hw * 0.72, hh * 0.18], [hw * 0.6, hh * 0.05]], [[iH, 1], [iH, 1], [iH, 1]], { n: 12, sq: 3.5 });
  // ---- the face (round 18). The mouth: a lamprey's round rasp at the front of the underside, opening in layers
  // (puckered lips, then three rings of backward hooked teeth, each on its own bone), a black throat behind
  const M: V3 = addV(H0, MOUTH_AT(D)), MR = hw * 0.34, ax: V3 = MOUTH_AX;
  const LIPS = S.fixed('PS_LIPS', 12, 8), THROAT = S.fixed('PS_THROAT', 6, 6), EYE = S.fixed('PS_EYE', 6, 6), MILK = S.fixed('PS_MILK', 6, 6);
  const GRIT = S.fixed('PS_GRIT', 4, 4), SLIME = S.fixed('PS_SLIME', 4, 8), LEECH = S.fixed('PS_LEECH', 8, 12);
  // a frame across the mouth's face
  const u0: V3 = [1, 0, 0], v0: V3 = [0, ax[2], -ax[1]];
  const ring = (k: number, r: number): V3 => addV(M, [u0[0] * Math.cos(k) * r + v0[0] * Math.sin(k) * r, u0[1] * Math.cos(k) * r + v0[1] * Math.sin(k) * r, u0[2] * Math.cos(k) * r + v0[2] * Math.sin(k) * r]);
  const into = (p: V3, d: number): V3 => [p[0] - ax[0] * d, p[1] - ax[1] * d, p[2] - ax[2] * d];
  ball(S.B, THROAT, S.gid(), into(M, MR * 0.35), ax, [MR * 0.8, MR * 0.8, MR * 0.5], [XM.r3, 1], { n: 10, rings: 4 });
  // the lips: a ring of wet fleshy lobes that pucker shut and roll back to open
  for (let i = 0; i < 11; i++) {
    const k = (i / 11) * Math.PI * 2;
    ball(S.B, LIPS, S.gid(), ring(k, MR * 1.02), ax, [MR * 0.34, MR * 0.3, MR * 0.26], [XM.lips, 1], { n: 7, rings: 4, bump: (a, t) => 0.12 * Math.sin(a * 3 + i) * Math.sin(t * Math.PI) });
  }
  // three rings of teeth, each hooked back into the throat
  ([[XM.r1, 0.86, 16, 0.3], [XM.r2, 0.62, 13, 0.24], [XM.r3, 0.4, 9, 0.19]] as [number, number, number, number][]).forEach(([bone, rr, nT, L], ri) => {
    for (let i = 0; i < nT; i++) {
      const k = ((i + ri * 0.5) / nT) * Math.PI * 2;
      const b0 = into(ring(k, MR * rr), MR * 0.05 * ri), mid = into(ring(k, MR * rr * 0.82), MR * L * 0.6), tip = into(ring(k, MR * rr * 0.55), MR * L * 1.2);
      sac(S.B, TOOTH, S.gid(), [b0, mid, tip], [[MR * 0.07, MR * 0.07], [MR * 0.045, MR * 0.045], [0.0008, 0.0008]], [[bone, 1], [bone, 1], [bone, 1]], { n: 4 });
    }
  });
  // slime strings from the lips, sagging down off the chin
  for (let i = 0; i < 4; i++) {
    const k = Math.PI * (1.15 + i * 0.23), p0 = ring(k, MR * 1.1), sag = hh * (0.35 + 0.3 * hash(i, 7));
    sac(S.B, SLIME, S.gid(), [p0, [p0[0] + (hash(i, 8) - 0.5) * MR * 0.4, p0[1] - sag * 0.6, p0[2] - MR * 0.1], [p0[0] + (hash(i, 9) - 0.5) * MR * 0.6, p0[1] - sag, p0[2] - MR * 0.3]],
      [[MR * 0.05, MR * 0.05], [MR * 0.022, MR * 0.022], [MR * 0.04, MR * 0.04]], [[XM.lips, 1], [iH, 0.5, XM.lips, 0.5], [iH, 1]], { n: 4 });
  }
  // tiny wet black eyes high on the skull; the right one gone milky
  for (const sd of [-1, 1]) ball(S.B, sd < 0 ? EYE : MILK, S.gid(), addV(H0, [sd * hw * 0.44, hh * 0.3, hl * 0.22]), [sd, 0.4, 0.4], [hw * 0.075, hw * 0.07, hw * 0.075], [iH, 1], { n: 8, rings: 5 });
  // grit stuck in the mucus on the shovel
  for (let i = 0; i < 9; i++) {
    const zz = H0[2] + hl * (0.45 + 0.45 * hash(i, 21)), xx = H0[0] + (hash(i, 22) - 0.5) * hw * 1.1;
    ball(S.B, GRIT, S.gid(), [xx, H0[1] - hh * 0.06 + hh * 0.06 * (1 - (zz - H0[2]) / hl), zz], [0, 1, 0], [hw * 0.035 * (0.6 + hash(i, 23) * 0.9), hw * 0.025 * (0.6 + hash(i, 23) * 0.9), hw * 0.035 * (0.6 + hash(i, 23) * 0.9)], [iH, 1], { n: 5, rings: 3 });
  }
  // a parasite or two of its own: fat leeches latched behind the eye and on the nape
  const leech = (at: V3, dir: V3, len: number, w: number[]) => sac(S.B, LEECH, S.gid(), [at, addV(at, scl(dir, len * 0.5)), addV(at, scl(dir, len))], [[len * 0.16, len * 0.13], [len * 0.22, len * 0.17], [len * 0.12, len * 0.1]], [w, w, w], { n: 7, bump: (a, t) => 0.12 * Math.sin(t * 18) });
  leech(addV(H0, [-hw * 0.4, hh * 0.25, -hl * 0.05]), [-0.3, 0.2, -1], hl * 0.42, [iH, 1]);
  if (rig.neck.length && rig.neck[0] >= 0) leech(addV(S.at(rig.neck[0]), [hw * 0.2, hh * 0.35, 0]), [0.4, 0.1, -1], hl * 0.36, [rig.neck[0], 1]);
  // too many fingers: a fan of eight or nine little soft ones on every foot
  for (const lg of rig.legs) {
    const fb = lg.bones[lg.bones.length - 1], F = S.at(fb), w: number[] = [fb, 1];
    const nF = 8 + (lg.kind === 'hind' ? 1 : 0);
    for (let f = 0; f < nF; f++) {
      const a = ((f / (nF - 1)) - 0.5) * 2.4 + (lg.side > 0 ? 0 : 0);
      const dir: V3 = [Math.sin(a) * lg.side * 0.6 + lg.side * 0.4, 0, Math.cos(a)];
      const Lf = D.lt * (0.9 + 0.5 * hash(f, lg.pair + 3));
      const p0: V3 = [F[0] + dir[0] * D.lt * 0.3, F[1] + D.lt * 0.08, F[2] + dir[2] * D.lt * 0.3];
      sac(S.B, FING, S.gid(), [p0, addV(p0, [dir[0] * Lf * 0.5, -D.lt * 0.05, dir[2] * Lf * 0.5]), addV(p0, [dir[0] * Lf, -D.lt * 0.12, dir[2] * Lf])], [[D.lt * 0.07, D.lt * 0.05], [D.lt * 0.05, D.lt * 0.04], [D.lt * 0.03, D.lt * 0.03]], [w, w, w], { n: 4 });
    }
  }
  // ---- paint: see-through skin, organs under it, veins; wet glints
  const PALE = makeRamp(0xe2c8c0, 7, { hueShift: 0.04, spread: 0.5 });
  SKIN.fill(PALE, (x, y) => 3.4 + Math.cos(SKIN.th(x)) * 1.2 - (y / SKIN.h) * 0.6 + (hash(x, y) - 0.5) * 0.4);
  for (let i = 0; i < 6; i++) SKIN.line(hash(i, 2) * SKIN.w, 0, hash(i, 3) * SKIN.w, SKIN.h, 0x8a90b8, 0.4);
  for (let y = 0; y < RASP.h; y++) for (let x = 0; x < RASP.w; x++) RASP.set(x, y, Math.hypot(x - RASP.w / 2, y - RASP.h / 2) < RASP.w * 0.3 ? 0x2a0408 : mixHex(0x9a2a34, 0xd86a70, hash(x, y)));
  for (let y = 0; y < TOOTH.h; y++) for (let x = 0; x < TOOTH.w; x++) TOOTH.set(x, y, mixHex(0xf0e8d8, 0xb8a080, y / TOOTH.h));
  FING.fill(makeRamp(0xe8c0b8, 6, { spread: 0.45 }), (x, y) => 3 + Math.cos(FING.th(x)) - (y / FING.h) * 1.4);
  LIPS.fill(makeRamp(0xc87a80, 6, { spread: 0.5 }), (x, y) => 2.8 + Math.cos(LIPS.th(x)) * 1.1 + (hash(x, y) - 0.5) * 0.6);
  for (let i = 0; i < 10; i++) LIPS.set(hash(i, 31) * LIPS.w, hash(i, 32) * LIPS.h, 0xffeef0); // wet
  for (let y = 0; y < THROAT.h; y++) for (let x = 0; x < THROAT.w; x++) THROAT.set(x, y, mixHex(0x14040a, 0x5a1420, hash(x, y) * 0.5));
  for (let y = 0; y < EYE.h; y++) for (let x = 0; x < EYE.w; x++) EYE.set(x, y, 0x0a0608);
  EYE.set(2, 1, 0xffffff); EYE.set(3, 1, 0xc8c8d0);
  for (let y = 0; y < MILK.h; y++) for (let x = 0; x < MILK.w; x++) MILK.set(x, y, mixHex(0xd8dce0, 0x8a909a, hash(x, y) * 0.6));
  MILK.set(2, 1, 0xffffff);
  for (let y = 0; y < GRIT.h; y++) for (let x = 0; x < GRIT.w; x++) GRIT.set(x, y, mixHex(0x3a342c, 0x7a6e5a, hash(x * 3, y)));
  for (let y = 0; y < SLIME.h; y++) for (let x = 0; x < SLIME.w; x++) SLIME.set(x, y, mixHex(0xe8e0d0, 0xc8b8a0, hash(x, y) * 0.5));
  LEECH.fill(makeRamp(0x4a2420, 6, { spread: 0.5 }), (x, y) => 2.2 + Math.cos(LEECH.th(x)) * 1.1 + ((y % 3) === 0 ? -0.9 : 0));
  // grit in the mucus on the shovel, a wet sheen over it
  for (let i = 0; i < 40; i++) SKIN.set(hash(i, 41) * SKIN.w, hash(i, 42) * SKIN.h, hash(i, 43) < 0.5 ? 0x4a4236 : 0x6a5e4c);
  for (let i = 0; i < 14; i++) SKIN.blend(hash(i, 44) * SKIN.w, hash(i, 45) * SKIN.h, 0xffffff, 0.7);
  // the head: pale and see-through, the skull showing through it (the dome, the eye sockets, the sutures),
  // veins over it, and the pale raised scars of burrowing
  const head = page.regs.get('HEAD');
  if (head) {
    for (let y = 0; y < head.h; y++) for (let x = 0; x < head.w; x++) {
      const th = head.th(x), v = y / head.h, top = Math.cos(th);
      if (top > 0.3 && v > 0.15 && v < 0.75) head.blend(x, y, 0xf4ece0, 0.35 * (top - 0.3) / 0.7); // the skull's dome under the skin
      if (Math.abs(Math.abs(th) - 0.9) < 0.18 && Math.abs(v - 0.55) < 0.08) head.blend(x, y, 0x4a2a34, 0.55); // the sockets
      if (Math.abs(th) < 0.05 && v > 0.2 && v < 0.75) head.blend(x, y, 0x9a7a80, 0.6); // the suture down the middle
      if (Math.abs(Math.sin(x * 0.9 + head.fbm(x, y, 3, 2, 17) * 10)) < 0.07) head.blend(x, y, 0x5a5ab0, 0.55); // veins
    }
    for (let i = 0; i < 4; i++) { const y0 = hash(i, 51) * head.h; head.line(0, y0, head.w, y0 + (hash(i, 52) - 0.5) * head.h * 0.4, 0xf8e0e0, 0.6); }
  }
  const body = page.regs.get('BODY');
  if (body) {
    for (let y = 0; y < body.h; y++) for (let x = 0; x < body.w; x++) {
      const th = body.th(x), v = y / body.h, side = Math.abs(th);
      // the organs: dark shapes seen through the belly and flanks (gut coils, the liver, the egg sacs)
      const gut = Math.sin(v * 38 + Math.sin(th * 3) * 2) > 0.55 && v > 0.25 && v < 0.62 && side > 1.4;
      const liver = Math.hypot((v - 0.68) / 0.1, (side - 2.3) / 0.5) < 1;
      const eggs = v > 0.18 && v < 0.4 && side > 1.0 && side < 2.2 && hash(Math.floor(x / 2), Math.floor(y / 2)) < 0.35;
      if (liver) body.blend(x, y, 0x5a1a2a, 0.55);
      else if (gut) body.blend(x, y, 0x8a4050, 0.4);
      else if (eggs) body.blend(x, y, 0xf0e0a0, 0.45);
      // veins: blue-violet threads
      if (Math.abs(Math.sin(x * 0.7 + body.fbm(x, y, 3, 2, 7) * 9)) < 0.06) body.blend(x, y, 0x6a6aa8, 0.5);
    }
    for (let i = 0; i < 30; i++) body.blend(hash(i, 11) * body.w, hash(i, 12) * body.h, 0xffffff, 0.75);
    // burrow scars: pale ridged lines where it has forced itself through things
    for (let i = 0; i < 9; i++) { const x0 = hash(i, 61) * body.w, y0 = hash(i, 62) * body.h; body.line(x0, y0, x0 + (hash(i, 63) - 0.5) * body.w * 0.3, y0 + hash(i, 64) * body.h * 0.15, 0xf6dcd8, 0.7); }
  }
}

export interface SalaRig extends LifeGameRig { }
export function buildSalamander(): SalaRig {
  const model = lifeModel('parasite_salamander', DESIGN, grotesque, tweakS);
  return lifeRig(model, 1.0, 0.24) as SalaRig;
}

// ------------------------------------------------------------------ animation
export type SalaPose = 'idle' | 'crawl' | 'dash' | 'latch' | 'burrow' | 'dead';
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _ax = new THREE.Vector3();
function poseS(R: SalaRig, t: number, dt: number, md: SalaPose, speed: number, size: number, far: boolean, flinch: number) {
  const L = R.life, rig = L.model.rig, B = L.bones, ud = L.m as Record<string, number>;
  const st = md === 'dead' ? 'dead' : md === 'latch' || md === 'burrow' ? 'attack' : speed > 0.05 ? 'move' : 'idle';
  if (!lifeAnimate(R, dt, { speed: speed / size, state: st as any, act: md === 'burrow' ? (t * 3) % 1 : md === 'latch' ? 0.6 : 0 }, 0, far)) return;
  // burrowing: nose down into the host, the whole body shoving and twisting in, the tail lashing
  const bur = (ud.bur = (ud.bur ?? 0) + ((md === 'burrow' ? 1 : 0) - (ud.bur ?? 0)) * (1 - Math.exp(-6 * dt)));
  if (bur > 0.01) {
    _q.setFromEuler(_e.set(0.6 * bur, Math.sin(t * 17) * 0.25 * bur, Math.sin(t * 11) * 0.2 * bur)); B[rig.root].quaternion.premultiply(_q);
    B[rig.root].position.y -= 0.03 * bur;
  }
  // the gills flush and flatten as it breathes; it pants after a dash
  if (rig.head >= 0) { _q.setFromEuler(_e.set(Math.sin(t * 2.3) * 0.04, Math.sin(t * 0.7 + 1) * 0.15 * (1 - bur), 0)); B[rig.head].quaternion.multiply(_q); }
  // the mouth: puckered and working at rest; it opens in layers to latch and rasp (the lips roll back, then each
  // ring of teeth in turn), and the rings grind against each other while it eats its way in
  if (XM.lips >= 0) {
    const want = md === 'latch' || md === 'burrow' ? 1 : md === 'dash' ? 0.45 : md === 'dead' ? 0.3 : 0;
    ud.mo = (ud.mo ?? 0) + (want - (ud.mo ?? 0)) * (1 - Math.exp(-5 * dt));
    const o = ud.mo, pk = Math.max(0, Math.sin(t * 2.7)) ** 6 * (1 - o);
    const lay = (k: number) => Math.min(1, Math.max(0, (o - k * 0.22) / 0.56));
    B[XM.lips].scale.setScalar(0.78 + 0.55 * lay(0) - 0.12 * pk);
    const grind = md === 'burrow' || md === 'latch' ? t * 5 : Math.sin(t * 1.3) * 0.15;
    [XM.r1, XM.r2, XM.r3].forEach((b, i) => {
      B[b].scale.setScalar(0.62 + 0.55 * lay(i + 1));
      _q.setFromAxisAngle(_ax.set(MOUTH_AX[0], MOUTH_AX[1], MOUTH_AX[2]), (i % 2 ? -1 : 1) * grind * (0.3 + i * 0.12));
      B[b].quaternion.copy(_q);
    });
  }
  if (flinch > 0) B[rig.root].position.x += Math.sin(t * 70) * 0.01 * flinch;
}
function animateSala(rig: Rig, c: Creature, t: number, dt: number) {
  const R = rig as SalaRig, n = netOf(c);
  const larva = c.sp.key === 'salamander_larva';
  const size = larva ? 0.35 : 1;
  if (R.life.m.sz !== size) { R.life.m.sz = size; R.body.scale.setScalar(1.0 * size); }
  const p = live() ? G.local : null;
  const d = p && p.zoneKey === c.zoneKey ? dist(p, c) : 99;
  const md: SalaPose = c.dead ? 'dead' : (n.md as SalaPose) || (c.speed > 1.2 ? 'dash' : c.speed > 0.05 ? 'crawl' : 'idle');
  poseS(R, t, dt, md, c.dead ? 0 : c.speed, size, d > 25, flinchOf(c));
  R.life.F.fx.value.z = Math.min(1, c.hitFlash / 0.15) * 0.4;
  if (!c.dead && c.speed > 0.2 && live() && c.visibleToLocal && (R.life.m.sT ?? 0) < t) { R.life.m.sT = t + 0.35; playAt('swivel_skitter', c, larva ? 0.12 : 0.2, 8, larva ? 1.8 : 1.3); }
  const f = fxPoll(rig, c);
  if (f) {
    if (f.key === 'latch') { playAt('tc_squish', c, 0.9, 12, 1.1); playAt('gore_squelch', c, 0.7, 12, 1.2); }
    else if (f.key === 'burrow') { playAt('gore_squelch', c, 1, 14, 0.9); playAt('limb_rip', c, 0.4, 10, 1.4); }
    else if (f.key === 'hiss') playAt('underlay_hiss', c, 0.5, 10, 1.8);
  }
  const lp = localIn(c);
  if (lp && !c.dead && c.visibleToLocal && d < 9) {
    if (larva) thinkOnce(lp, 'larva', ['Pale little things, wriggling. Each one has a mouth like a ring of hooks.', 'They are looking for something to get into.'][Math.floor(t * 0.2) % 2], 60);
    else thinkOnce(lp, 'salamander', ['A salamander. I can see through it. I can see its insides.', 'It has too many fingers. Its mouth is underneath, round, full of teeth.', 'It is creeping toward me, flat to the floor. Very slowly.'][Math.floor(t * 0.13) % 3], 70);
  }
}

// ------------------------------------------------------------------ host brain
const PARTS: BodyPart[] = ['shin_l', 'shin_r', 'thigh_l', 'thigh_r', 'torso_l', 'foot_l', 'foot_r', 'farm_l', 'farm_r'];
const NO_HOST = /^(chess_|pg_|king_|fungus_|whale_|queen_|parasite_|salamander_|stalker|still_life|strider|gaunt_wolf|bubble_|moon_wisp)/;
function setMd(c: Creature, md: string) { const n = net(c); if (n.md !== md) { n.md = md; c.mem.mdT = 0; } }
/** a unit it can get into: asleep, down, crouched and still, or simply not looking (and not in the light) */
function hostable(c: Creature, p: Player): number {
  if (p.body.dead || p.body.parasite) return 0;
  const d = dist(p, c);
  if (d > 14) return 0;
  const lit = lightAt(zoneOf(c), p.x, p.z) > 0.55 || (p.flashlightOn && Math.abs(Math.atan2(c.z - p.z, c.x - p.x) - p.facing) < 0.5 && d < 8);
  let w = 1;
  if (p.sleeping || p.body.downed) w = 4;
  else if (p.speed < 0.15) w = 2;
  if (lit && !p.sleeping) w *= 0.25;
  return w / (1 + d);
}
function thinkSala(c: Creature, dt: number): boolean {
  const z = zoneOf(c), m = c.mem, n = net(c), ev = pulse(c);
  m.mdT = (m.mdT ?? 0) + dt;
  const md: string = n.md ?? '';
  const larva = c.sp.key === 'salamander_larva';
  if (ev.hurt > 0) { setMd(c, 'flee'); m.goal = CS().fleeSpot(c, z, c.x + rng.float(-2, 2), c.z + rng.float(-2, 2)); fx(c, 'hiss'); }
  if (md === 'flee') {
    c.setState('flee');
    if (!m.goal || CS().moveTo(c, z, m.goal.x, m.goal.z, c.sp.run, dt, 0.5) || m.mdT > 5) setMd(c, '');
    return true;
  }
  // a larva grows: after a while (somewhere dark and quiet) it is an adult
  if (larva) {
    m.age = (m.age ?? 0) + dt;
    if (m.age > 240 && !c.visibleToLocal) { const a = CS().spawn('parasite_salamander', c.zoneKey, c.x, c.z); if (a) { CS().remove(c); return true; } }
  }
  // ---- latched on: it gets its head in and burrows, then it is gone (inside)
  if (md === 'burrow') {
    stop(c); c.setState('attack');
    const host = m.host as { kind: 'p' | 'c'; id: string };
    const hp = host.kind === 'p' ? G.players.get(host.id) as Player | undefined : undefined;
    const hc = host.kind === 'c' ? CS().creatures.get(host.id) : undefined;
    const tx = hp?.x ?? hc?.x, tz = hp?.z ?? hc?.z;
    if (tx === undefined || tz === undefined) { setMd(c, ''); return true; }
    // it rides the host while it digs in
    const off = (m.off as [number, number]) ?? [0, 0];
    c.x = tx + off[0]; c.z = tz + off[1];
    faceTo(c, tx, tz);
    if (hp && (hp.motion as any)?.st === 'roll') { setMd(c, 'flee'); m.goal = CS().fleeSpot(c, z, tx, tz); return true; }
    if (m.mdT > (hp ? 1.1 : 2.2)) {
      if (hp) {
        // the unit's own machine runs its body; here (the host) it can only be the local one, else its peer is told
        if (hp.isLocal) infestPlayer(hp, m.part);
        else G.net?.sendHurt?.(hp.id, { dmg: 3, kinds: ['bite'], corrupt: 0, height: 0.3, knock: 0, from: [c.x, c.z], grab: false, by: 'parasite_salamander', parts: [m.part] });
        for (const q of playersIn(c.zoneKey)) if (dist(q, c) < 12) { ruleShown(c); break; }
      } else if (hc) infestCreature(hc);
      CS().remove(c);
    }
    return true;
  }
  // ---- choose a host: units that keep still (or are down), animals, the dead
  if ((m.pickT = (m.pickT ?? 0) - dt) <= 0) {
    m.pickT = 0.6;
    let best: { kind: 'p' | 'c'; id: string; w: number } | null = null;
    if (!larva && !(m.spent > G.time)) for (const p of playersIn(c.zoneKey)) { const w = hostable(c, p); if (w > 0 && (!best || w > best.w)) best = { kind: 'p', id: p.id, w }; }
    for (const o of CS().creatures.values()) {
      if (o === c || o.zoneKey !== c.zoneKey || o.mem.para || NO_HOST.test(o.sp.key) || o.butchered || o.sp.flags?.ghost || o.sp.flags?.glitch || o.sp.flags?.flying) continue;
      if (!o.dead && (larva || o.radius > 1.2 || o.hp > 200)) continue;
      const d = Math.hypot(o.x - c.x, o.z - c.z); if (d > 16) continue;
      const w = (o.dead ? 3 : 0.8) / (1 + d);
      if (!best || w > best.w) best = { kind: 'c', id: o.id, w };
    }
    m.host = best ? { kind: best.kind, id: best.id } : null;
  }
  const host = m.host as { kind: 'p' | 'c'; id: string } | null;
  if (host) {
    const hp = host.kind === 'p' ? G.players.get(host.id) as Player | undefined : undefined;
    const hc = host.kind === 'c' ? CS().creatures.get(host.id) : undefined;
    const tx = hp?.x ?? hc?.x, tz = hp?.z ?? hc?.z, hr = hp?.radius ?? hc?.radius ?? 0.3;
    if (tx !== undefined && tz !== undefined) {
      const d = Math.hypot(tx - c.x, tz - c.z);
      c.setState('stalk');
      // creeping, flat to the floor; the last metre in a rush
      const close = d < 1.6;
      if (d < hr + 0.35) {
        setMd(c, 'burrow'); fx(c, 'latch'); fx(c, 'burrow');
        m.part = rng.pick(PARTS);
        const a = Math.atan2(c.z - tz, c.x - tx); m.off = [Math.cos(a) * hr * 0.9, Math.sin(a) * hr * 0.9];
        if (hp) bus.emit('think', hp, 'Something just grabbed my leg. Cold. Wet. FINGERS—');
        return true;
      }
      setMd(c, close ? 'dash' : 'crawl');
      CS().moveTo(c, z, tx, tz, close ? c.sp.run : c.sp.walk, dt, hr * 0.5);
      return true;
    }
  }
  // ---- nothing to get into: it keeps to the dark and the damp
  setMd(c, '');
  c.setState('wander');
  if (!c.goal || CS().moveTo(c, z, c.goal.x, c.goal.z, c.sp.walk * 0.7, dt, 0.4) || m.mdT > 12) {
    let g = null;
    for (let i = 0; i < 8; i++) { const w = CS().wanderSpot(c, z, 8); if (lightAt(z, w.x, w.z) < 0.4) { g = w; break; } }
    c.goal = g ?? CS().wanderSpot(c, z, 6);
    m.mdT = 0;
  }
  return true;
}

// ------------------------------------------------------------------ species
const SALA = def({
  key: 'parasite_salamander', name: 'Parasite Salamander', code: 'PA-17 // PARASITE, URODELE (ENDOPARASITIC)', temperament: 'stalker', threat: 3,
  rule: {
    name: 'IT WANTS IN',
    text: 'It creeps up on anything that keeps still (the sleeping, the hurt, the dead) and burrows in through the skin. Inside, it eats your organs one by one, then lays; the clutch hatches out of you two hours later. Light and movement put it off. If it gets in: pull it out by the tail at once, or cut it out of the wound with a knife (Status: the wound) before it lays.',
    tell: 'Something pale crawling toward me, flat to the floor.',
  },
  hp: 14, walk: 0.35, run: 2.6, turn: 6, radius: 0.15, height: 0.15, sight: 10, fov: 2.6, hearing: 1.6,
  attack: { dmg: [2, 4], range: 0.3, cooldown: 3, kinds: ['bite'], corrupt: 0, knock: 0 },
  zones: ['undercroft', 'tunnels', 'pools', 'hospital'], weight: 0.6, group: [1, 1], maxPerZone: 3, diet: 'meat',
  meat: [['parasite_salamander', 1]],
  disposition: { mood: 'predator', self: true },
  flags: { nocturnal: true },
  sounds: { alert: 'underlay_hiss', hurt: 'tc_squish', death: 'gore_squelch', step: 'swivel_skitter' },
  scan: {
    cls: 'Parasite / endoparasitic urodele',
    notes: [
      'A pale, translucent amphibian about 45 cm long. Organs visible through the skin. Shovel snout, a ventral rasping mouth, external gills, eight or nine digits per foot.',
      'Burrows into hosts (units, animals, carcasses) through the skin.',
      'Consumes the host\'s organs in sequence, grows, then oviposits in the body cavity. Larvae emerge ~2 h later.',
      'Removal: by hand during burrowing; surgically (knife, scalpel) afterwards.',
    ],
  },
  gore: { blood: 'pale', tint: 0xffe8e8, flesh: 0xe8c8c0, gib: true },
  build: () => buildSalamander(), animate: animateSala, think: thinkSala,
});
const LARVA = def({
  key: 'salamander_larva', name: 'Salamander Larva', code: 'PA-17L // PARASITE, URODELE (LARVA)', temperament: 'skittish', threat: 1,
  rule: { name: 'IT WANTS IN', text: 'The young of the Parasite Salamander. They look for a carcass to get into; left alone somewhere dark they grow into adults. Stamp on them.', tell: 'Little pale things wriggling out of the dark.' },
  hp: 3, walk: 0.5, run: 2.2, turn: 8, radius: 0.06, height: 0.05, sight: 6, fov: 2.6, hearing: 1.2,
  zones: [], weight: 0, group: [1, 1], maxPerZone: 12, diet: 'meat',
  disposition: { mood: 'skittish', self: true },
  sounds: { hurt: 'tc_squish', death: 'tc_squish' },
  scan: { cls: 'Parasite / larva', notes: ['A hatchling Parasite Salamander, finger-length, translucent.', 'Seeks carcasses to infest; matures into the adult in a few minutes in the dark.'] },
  gore: { blood: 'pale', tint: 0xffe8e8, flesh: 0xe8c8c0, gib: true },
  build: () => buildSalamander(), animate: animateSala, think: thinkSala,
});
defDread('parasite_salamander', { stutter: 0.02, cam: 0.3 });
const GAL: SalaPose[] = ['idle', 'crawl', 'dash', 'latch', 'burrow'];
SALA.animateGallery = (rig: Rig, t: number) => {
  const q = (new URLSearchParams(location.search).get('pose') || GAL[Math.floor(t / 3) % GAL.length]) as SalaPose;
  poseS(rig as SalaRig, t, 1 / 60, q, q === 'crawl' ? 0.35 : q === 'dash' ? 2.4 : 0, 1, false, 0);
};
LARVA.animateGallery = (rig: Rig, t: number) => { rig.body.scale.setScalar(0.35); poseS(rig as SalaRig, t, 1 / 60, 'crawl', 0.4, 0.35, false, 0); };
void hashId; void playersIn;
