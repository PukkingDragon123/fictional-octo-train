import * as THREE from 'three';
import { def, Rig } from '../species';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import type { Creature } from '../creature';
import type { Player } from '../../entities/player';
import type { Zone } from '../../world/zone';
import { CS, zoneOf, pulse, attack, stop, faceTo, onPlayerHit } from '../behaviors_a';
import { net, netOf, playAt, hashId, rng, localIn, thinkOnce, dist, playersIn, fx, fxPoll, live } from '../behaviors_b';
import { flinchOf } from '../kit/humanoids';
import { lifeModel, lifeRig, lifeAnimate, type LifeGameRig } from '../life/lifeMesh';
import type { Design } from '../life/design';
import type { Ctx } from '../life/sculpt';
import { sac, ball, hash, norm, addV, scl, type V3, type Page } from '../life/kit';
import { makeRamp, mixHex } from '../../gfx/pixel';
import { PK } from '../../gore/particles';
import { defDread } from '../dread';
import { ruleShown } from '../rules';
import { TEARS } from '../../gore/tearing';
import '../../audio/sounds_creatures_c';

// =====================================================================================
// THE GAUNT WOLF — the apex of the open levels: a wolf grown three times a unit's
// height at the shoulder and starved down to the frame. The hide is mange and scab
// over a coat that comes away in mats; on one flank it has torn open and the ribs
// stand out of the wet meat like the staves of a boat. A ridge of bone runs the
// length of its back where the vertebrae have pushed through. The jaw has grown out
// long and holds too many teeth, three rows of them, yellow and brown. The forelegs
// are too long for the hind ones, so it stands high at the shoulder like a hyena and
// its back slopes down to a hind leg it holds up off the ground and hops on the other.
// Its breath steams. It hunts alone, by sound and by the smell of blood: it howls,
// it comes at a lope, then a charge; it knocks you down and stands on you and bites,
// and what it kills it carries off in its mouth.
// The body is built with the user's own creature software (src/creatures/life,
// ported): one continuous sculpted loft from skull to tail, muscled limbs, a modelled
// head, a painted coat; this file adds the ribs, the spine ridge, the extra teeth and
// the torn flank on top, and lengthens the forelegs.
// POSTER / VIDEO API: buildGauntWolf() -> rig; poseGauntWolf(rig, t, dt, pose, { speed })
//   pose: 'idle' | 'walk' | 'lope' | 'charge' | 'howl' | 'maul' | 'drag' | 'dead'
// =====================================================================================

/** a unit's height at the shoulder, three times over: the sculpted body is a big dog; the rig is scaled up */
const SCALE = 3.1;

const DESIGN: Design = {
  name: 'Gaunt Wolf', latin: 'Lupus macer', plan: 'quadruped', lineage: 'vertebrate',
  genes: ['vert_quadruped', 'leg_cursorial', 'eye_binocular', 'ears', 'carnassials', 'shaggy', 'fur', 'tail_balance', 'endotherm', 'live_birth'],
  size: 0.42, len: 0.75, girth: 0.12, legLen: 0.82, legThick: 0.36, neck: 0.62, head: 0.85, tail: 0.5, segs: 3,
  colors: { base: 0x4a4038, belly: 0x5e5048, pattern: 0x2a221e, accent: 0x7a2a22, eye: 0xd8b840 },
  pattern: 'mottled', patScale: 0.8, cover: 'fur', seed: 9137,
};

/** the grotesque additions: torn flank with ribs, the vertebrae through the back, three rows of teeth */
function grotesque(S: Ctx, page: Page) {
  const rig = S.rig, sp = S.spine, D = rig.dims;
  const BONE = S.fixed('GW_BONE', 12, 24), RAW = S.fixed('GW_RAW', 24, 24), TOOTH = S.fixed('GW_TOOTH', 6, 12);
  if (sp) {
    // the spine ridge: knuckles of vertebra pushed up through the hide, tallest over the shoulders
    const N = 22;
    for (let i = 0; i < N; i++) {
      const t = 0.12 + (i / (N - 1)) * 0.78, k = Math.round(t * (sp.pts.length - 1)), f = sp.fr[k];
      const base = addV(sp.pts[k], scl(f.v, sp.rv[k] * 0.86));
      const hgt = (0.05 + 0.09 * Math.exp(-((t - 0.72) ** 2) / 0.03) + 0.03 * hash(i, 7)) * D.H;
      const tip = addV(base, addV(scl(f.v, hgt), scl(f.d, -hgt * 0.35)));
      sac(S.B, BONE, S.gid(), [base, addV(base, scl(f.v, hgt * 0.55)), tip], [[D.lt * 0.13, D.lt * 0.2], [D.lt * 0.09, D.lt * 0.14], [0.004, 0.006]], [sp.w[k], sp.w[k], sp.w[k]], { n: 5 });
    }
    // the torn flank: ribs standing out of the meat on the left side, the hide hanging off them
    for (let i = 0; i < 7; i++) {
      const t = 0.52 + i * 0.045, k = Math.round(t * (sp.pts.length - 1)), f = sp.fr[k];
      const pts: V3[] = [];
      for (let j = 0; j <= 4; j++) {
        const a = 0.35 + j * 0.42; // from the back round toward the belly
        const r = 1.02 + 0.06 * Math.sin(j * 0.8);
        pts.push(addV(sp.pts[k], addV(scl(f.u, Math.sin(a) * sp.ru[k] * r), scl(f.v, Math.cos(a) * sp.rv[k] * r))));
      }
      sac(S.B, BONE, S.gid(), pts, pts.map((_, j) => [D.lt * (0.07 - j * 0.008), D.lt * (0.06 - j * 0.006)] as [number, number]), pts.map(() => sp.w[k]), { n: 5 });
    }
    // a tatter of hide hanging off the last rib
    { const k = Math.round(0.82 * (sp.pts.length - 1)), f = sp.fr[k];
      const a0 = addV(sp.pts[k], addV(scl(f.u, sp.ru[k] * 1.0), scl(f.v, sp.rv[k] * 0.1)));
      sac(S.B, RAW, S.gid(), [a0, addV(a0, [0, -D.H * 0.25, -D.H * 0.05]), addV(a0, [0, -D.H * 0.45, -D.H * 0.02])], [[D.lt * 0.25, D.lt * 0.04], [D.lt * 0.2, D.lt * 0.03], [D.lt * 0.08, D.lt * 0.02]], [sp.w[k], sp.w[k], sp.w[k]], { n: 5 }); }
  }
  // three rows of teeth along the long jaw, upper and lower, crowding out over the lips
  const iH = S.bi('head'), iJ = S.bi('jaw'), H0 = S.at(iH), J0 = S.at(iJ);
  const { hl, hw, hh, sl } = D;
  for (let row = 0; row < 3; row++) for (let i = 0; i < 9; i++) for (const s of [-1, 1]) {
    const z = hl * 0.3 + (i / 8) * sl * 0.95, x = s * hw * (0.26 - (i / 8) * 0.12 - row * 0.03);
    const up: V3 = [H0[0] + x, H0[1] - hh * (0.33 + row * 0.02), H0[2] + z];
    const lo: V3 = [J0[0] + x * 0.92, J0[1] + hh * 0.04, J0[2] + z - hl * 0.02];
    const L = hh * (0.12 + 0.12 * hash(i * 3 + row, s + 5)) * (i % 3 === 0 ? 1.6 : 1);
    sac(S.B, TOOTH, S.gid(), [up, addV(up, [s * L * 0.1, -L, L * 0.15])], [[hw * 0.03, hw * 0.03], [0.002, 0.002]], [[iH, 1], [iH, 1]], { n: 4 });
    sac(S.B, TOOTH, S.gid(), [lo, addV(lo, [s * L * 0.1, L * 0.9, L * 0.1])], [[hw * 0.028, hw * 0.028], [0.002, 0.002]], [[iJ, 1], [iJ, 1]], { n: 4 });
  }
  // eyes that catch the light: small and deep, a hard yellow
  for (const s of [-1, 1]) ball(S.B, S.fixed('GW_EYE', 6, 6), S.gid(), [H0[0] + s * hw * 0.26, H0[1] + hh * 0.2, H0[2] + hl * 0.42], [0, 0, 1], [hw * 0.07, hw * 0.06, hw * 0.05], [iH, 1], { n: 8, rings: 5 });
  // ---- paint
  const BN = makeRamp(0xd8c8a8, 6, { spread: 0.45 }), RW = makeRamp(0x8a2420, 7, { hueShift: 0.05, spread: 0.65 });
  BONE.fill(BN, (x, y) => 2.6 + Math.cos(BONE.th(x)) * 1.0 - (hash(x, y) < 0.12 ? 1.4 : 0) - (y / BONE.h) * 0.6);
  for (let y = 0; y < BONE.h; y += 4) for (let x = 0; x < BONE.w; x++) BONE.blend(x, y, 0x5a3020, 0.35);
  RAW.fill(RW, (x, y) => 3 + Math.sin(y * 1.6 + x * 0.4) * 1.1 + (hash(x, y) - 0.5) * 0.8);
  for (let y = 0; y < TOOTH.h; y++) for (let x = 0; x < TOOTH.w; x++) TOOTH.set(x, y, mixHex(0xe8d8a8, 0x6a4a20, y / TOOTH.h * 0.6 + hash(x, y) * 0.2));
  const E = S.fixed('GW_EYE', 6, 6);
  for (let y = 0; y < E.h; y++) for (let x = 0; x < E.w; x++) E.set(x, y, Math.hypot(x - E.w / 2, y - E.h / 2) < E.w * 0.18 ? 0x080404 : 0xe8c040);
  // the coat: torn open on the left flank (raw meat behind the ribs), mange and scabs, matted
  const body = page.regs.get('BODY');
  if (body) {
    for (let y = 0; y < body.h; y++) for (let x = 0; x < body.w; x++) {
      const th = body.th(x), v = y / body.h;
      // raw flank (left side is +u: positive angle)
      const d = Math.hypot((th - 1.35) / 0.55, (v - 0.42) / 0.16) + (body.fbm(x, y, 3, 2, 21) - 0.5) * 0.5;
      if (d < 1) body.put(x, y, RW, 2.6 + Math.sin(y * 1.5 + x * 0.3) * 1.0 - d * 1.4 + (hash(x, y) - 0.5) * 0.6, 0.5);
      else if (d < 1.2) body.set(x, y, mixHex(0x3a2420, 0x6a2a20, hash(x, y)));
      // mange: bald grey-pink patches with scabs
      const m = body.fbm(x, y, 5, 2, 33);
      if (m > 0.66 && d > 1.2) body.set(x, y, hash(x, y * 3) < 0.25 ? 0x5a1810 : mixHex(0x8a6a64, 0xa88078, hash(x * 7, y)));
      // dark matted clumps and grime
      if (m < 0.22) body.blend(x, y, 0x161210, 0.45);
    }
  }
  const head = page.regs.get('HEAD');
  if (head) for (let i = 0; i < 26; i++) head.blend(hash(i, 4) * head.w, hash(i, 5) * head.h, 0x5a1810, 0.6);
}

export interface WolfRig extends LifeGameRig { }
export function buildGauntWolf(): WolfRig {
  const model = lifeModel('gaunt_wolf', DESIGN, grotesque, (rig) => {
    // the forelegs: a third too long, the shoulders hiked up to carry them (a hyena's slope)
    for (const lg of rig.legs) if (lg.kind === 'fore') {
      const k = 1.32;
      lg.lens = lg.lens.map((l) => l * k);
      for (let i = 1; i < lg.bones.length; i++) { const b = rig.bones[lg.bones[i]]; b.pos = [b.pos[0] * k, b.pos[1] * k, b.pos[2] * k]; }
    }
    const ch = rig.bones[rig.spine[1]];
    if (ch) ch.pos = [ch.pos[0], ch.pos[1] + rig.rideH * 0.28, ch.pos[2]];
  });
  const R = lifeRig(model, SCALE, model.rig.height * SCALE) as WolfRig;
  return R;
}

// ------------------------------------------------------------------ the pose
export type WolfPose = 'idle' | 'walk' | 'lope' | 'charge' | 'howl' | 'maul' | 'drag' | 'dead';
interface WDrive { t: number; dt: number; md: WolfPose; speed: number; lookYaw: number; lookPitch: number; act: number; far: boolean; flinch: number; dead: boolean }
const sm = (ud: Record<string, number>, k: string, to: number, rate: number, dt: number) => (ud[k] = (ud[k] ?? to) + (to - (ud[k] ?? to)) * (1 - Math.exp(-rate * dt)));
const _v = new THREE.Vector3(), _w = new THREE.Vector3();
function poseW(R: WolfRig, d: WDrive) {
  const L = R.life, ud = L.m as Record<string, number>, rig = L.model.rig, B = L.bones;
  const st = d.dead ? 'dead' : d.md === 'maul' ? 'attack' : d.md === 'drag' && d.speed < 0.1 ? 'eat' : d.speed > 0.08 ? 'move' : 'idle';
  // the animator works in the sculpt's own size: speeds go in at the sculpt's scale
  const posed = lifeAnimate(R, d.dt, { speed: d.speed / SCALE, state: st as any, act: d.act, lookYaw: d.lookYaw, lookPitch: d.lookPitch, turn: 0 }, 0, d.far);
  if (!posed) return;
  const howl = sm(ud, 'howl', d.md === 'howl' ? 1 : 0, 3, d.dt);
  const charge = sm(ud, 'chg', d.md === 'charge' ? 1 : 0, 4, d.dt);
  // the bad hind leg: held up off the floor, the paw curled, touched down now and then
  const hind = rig.legs.filter((l) => l.kind === 'hind');
  const bad = hind.find((l) => l.side > 0);
  if (bad && !d.dead) {
    const touch = Math.pow(Math.max(0, Math.sin(d.t * 2.2)), 8) * 0.6;
    const up = 1 - touch;
    _q.setFromEuler(_e.set(-0.55 * up, 0, 0.12 * up)); B[bad.bones[0]].quaternion.multiply(_q);
    if (bad.bones[1] !== undefined) { _q.setFromEuler(_e.set(1.1 * up, 0, 0)); B[bad.bones[1]].quaternion.multiply(_q); }
    if (bad.bones[2] !== undefined) { _q.setFromEuler(_e.set(-0.7 * up, 0, 0)); B[bad.bones[2]].quaternion.multiply(_q); }
  }
  // the howl: head thrown back, the neck stretched up; in a charge the head goes low and long
  const neck = rig.neck[0], head = rig.head;
  if (neck !== undefined && neck >= 0) { _q.setFromEuler(_e.set(-0.9 * howl + 0.35 * charge, 0, 0)); B[neck].quaternion.premultiply(_q); }
  if (head >= 0) { _q.setFromEuler(_e.set(-0.5 * howl + 0.15 * charge + Math.sin(d.t * 23) * 0.03 * d.flinch, 0, 0)); B[head].quaternion.multiply(_q); }
  if (rig.jaw >= 0) { const open = Math.max(howl * (0.7 + 0.1 * Math.sin(d.t * 5)), d.md === 'maul' ? 0.55 + 0.35 * Math.max(0, Math.sin(d.t * 9)) : 0, charge * 0.35, d.md === 'drag' ? 0.25 : 0); _q.setFromEuler(_e.set(open, 0, 0)); B[rig.jaw].quaternion.multiply(_q); }
  // hackles: the root pitched up in front for the slope of the long forelegs, a shudder on a hit
  if (d.flinch > 0) B[rig.root].position.x += Math.sin(d.t * 60) * 0.02 * d.flinch;
  void _v; void _w;
}
const _q = new THREE.Quaternion(), _e = new THREE.Euler();

/** gallery / video */
export function poseGauntWolf(R: WolfRig, t: number, dt: number, pose: WolfPose = 'idle', o: { speed?: number } = {}) {
  const sp: Partial<Record<WolfPose, number>> = { walk: 1.6, lope: 4.5, charge: 9, drag: 1.4 };
  poseW(R, { t, dt, md: pose, speed: o.speed ?? sp[pose] ?? 0, lookYaw: 0, lookPitch: 0, act: pose === 'maul' ? (t % 1) : 0, far: false, flinch: 0, dead: pose === 'dead' });
}

// ------------------------------------------------------------------ in-game animation
function animateWolf(rig: Rig, c: Creature, t: number, dt: number) {
  const R = rig as WolfRig, n = netOf(c);
  const p = live() ? G.local : null;
  const d = p && p.zoneKey === c.zoneKey ? dist(p, c) : 99;
  let lyaw = 0, lpitch = 0;
  const tg = n.tg ? G.players?.get(n.tg) : null;
  if (tg && !c.dead) { let rel = Math.atan2(tg.x - c.x, tg.z - c.z) - (Math.PI / 2 - c.facing); while (rel > Math.PI) rel -= Math.PI * 2; while (rel < -Math.PI) rel += Math.PI * 2; lyaw = rel; lpitch = -0.3; }
  const md = (c.dead ? 'dead' : (n.md as WolfPose)) || (c.speed > 6 ? 'charge' : c.speed > 2.5 ? 'lope' : c.speed > 0.1 ? 'walk' : 'idle');
  poseW(R, { t, dt, md, speed: c.dead ? 0 : c.speed, lookYaw: lyaw, lookPitch: lpitch, act: c.attackPhase > 0 ? 1 - c.attackPhase / 0.38 : 0, far: d > 40, flinch: flinchOf(c), dead: c.dead });
  R.life.F.fx.value.z = Math.min(1, c.hitFlash / 0.15) * 0.4;
  // steaming breath from the mouth, slow in the cold air
  const ud = R.life.m;
  if (!c.dead && live() && c.visibleToLocal && (ud.brT ?? 0) < t) {
    ud.brT = t + (n.md === 'charge' ? 0.12 : 0.3);
    const dust = (G as any).destruct?.dust;
    const hb = R.life.model.rig.jaw >= 0 ? R.life.bones[R.life.model.rig.jaw] : null;
    if (dust && hb) {
      hb.getWorldPosition(_v);
      const f = c.facing;
      for (let i = 0; i < 2; i++) dust.add(PK.Mist, _v.x + Math.cos(f) * 0.6, _v.y, _v.z + Math.sin(f) * 0.6, Math.cos(f) * 0.6 + (Math.random() - 0.5) * 0.3, 0.25 + Math.random() * 0.2, Math.sin(f) * 0.6 + (Math.random() - 0.5) * 0.3, 0.12 + Math.random() * 0.08, 1.4 + Math.random() * 0.8, 0xe8e8ec);
    }
  }
  // the ground shakes under it
  if (!c.dead && c.speed > 2 && live()) {
    ud.stp = (ud.stp ?? 0) + dt * c.speed;
    if (ud.stp > 3.2) { ud.stp = 0; if (d < 30) { playAt('strider_land', c, Math.min(1, 0.3 + c.speed * 0.06), 30, 0.55); if (d < 14) G.camera?.shake?.(0.08 + c.speed * 0.01, 0.2, 0.5); } }
  }
  const f = fxPoll(rig, c);
  if (f) {
    if (f.key === 'howl') { playAt('strider_call', c, 1, 60, 0.62); if (p && d < 60) thinkOnce(p, 'wolf_howl', ['That was a howl. That was a howl the size of a building.', 'Something out there is howling. It is coming closer.'][Math.floor(t) % 2], 30); }
    else if (f.key === 'growl') playAt('dog_growl', c, 0.9, 26, 0.45);
    else if (f.key === 'snarl') playAt('hound_snarl', c, 1, 30, 0.5);
    else if (f.key === 'bite') { playAt('bone_crunch', c, 1, 20, 0.7); playAt('gore_tear', c, 0.7, 16, 0.8); }
    else if (f.key === 'sniff') playAt('hound_huff', c, 0.7, 18, 0.5);
  }
  if (p && !c.dead && d < 45 && c.visibleToLocal) {
    if (n.md === 'charge') thinkOnce(p, 'wolf_charge', ['RUN. Something that big should not be that fast—', 'It is coming straight at me. Get inside. Get under something.'][Math.floor(t) % 2], 25);
    else thinkOnce(p, 'wolf', ['A wolf. The size of a house. You can see its ribs from here.', 'It is limping on one back leg. It does not seem to slow it down.', 'Its breath is steaming. It is sniffing the air. Sniffing for me.'][Math.floor(t * 0.13) % 3], 80);
  }
}

// ------------------------------------------------------------------ host brain
const PREY_BLOCK = /^(chess_|pg_|king_|fungus_|whale_|queen_)/;
function setMd(c: Creature, md: string) { const n = net(c); if (n.md !== md) { n.md = md; c.mem.mdT = 0; } }
/** stride over the open ground (it steps over low things, it goes round walls) */
function lope(c: Creature, gx: number, gz: number, speed: number, dt: number, stopAt = 1): boolean {
  const z = zoneOf(c), dx = gx - c.x, dz = gz - c.z, d = Math.hypot(dx, dz);
  if (d <= stopAt) { stop(c); return true; }
  // the sim turns it with weight (manager); the wish is toward the goal, bent round anything solid ahead
  let a = Math.atan2(dz, dx);
  const free = (ang: number) => { for (const r of [1.2, 2.4, 3.6]) { const tx = Math.floor(c.x + Math.cos(ang) * r), ty = Math.floor(c.z + Math.sin(ang) * r); if (!z.inb(tx, ty) || !z.floor[z.idx(tx, ty)] || z.solid[z.idx(tx, ty)] === 1) return false; } return true; };
  if (!free(a)) { for (const off of [0.5, -0.5, 1.0, -1.0, 1.6, -1.6]) if (free(a + off)) { a += off; break; } }
  c.targetFacing = a;
  const v = speed * Math.max(0.25, Math.cos(Math.atan2(Math.sin(a - c.facing), Math.cos(a - c.facing))));
  c.vx += (Math.cos(c.facing) * v - c.vx) * Math.min(1, dt * 2.2); c.vz += (Math.sin(c.facing) * v - c.vz) * Math.min(1, dt * 2.2);
  c.speed = v;
  return false;
}
function preyNear(c: Creature, r: number): Creature | null {
  let best: Creature | null = null, bd = r;
  for (const o of CS().creatures.values()) {
    if (o === c || o.zoneKey !== c.zoneKey || o.sp.key === c.sp.key || PREY_BLOCK.test(o.sp.key) || o.sp.flags?.ghost || o.sp.flags?.glitch || o.sp.flags?.attached) continue;
    if (o.mem.carriedBy) continue;
    const d = Math.hypot(o.x - c.x, o.z - c.z);
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}
/** a unit it can smell: bleeding, near, or loud */
function scent(c: Creature): { p: Player; d: number } | null {
  let best: { p: Player; d: number } | null = null;
  for (const p of playersIn(c.zoneKey)) {
    const d = dist(p, c);
    const bleed = p.body.bleedRate();
    const smell = 18 + Math.min(60, bleed * 50);
    if (d < smell && (!best || d < best.d)) best = { p, d };
  }
  return best;
}
const BITE_R = 4.2;
function thinkWolf(c: Creature, dt: number): boolean {
  const z = zoneOf(c), m = c.mem, n = net(c), ev = pulse(c);
  m.mdT = (m.mdT ?? 0) + dt;
  const md: string = n.md ?? '';
  if (!m.init) { m.init = 1; setMd(c, 'roam'); m.howlAt = G.time + rng.float(8, 20); }
  if (ev.hurt > 0 && c.targetId && G.players.has(c.targetId)) { n.tg = c.targetId; if (md !== 'maul' && md !== 'charge') { setMd(c, 'charge'); fx(c, 'snarl'); } }
  // carrying a kill: off to somewhere quiet to eat it
  if (md === 'drag') {
    const prey = m.prey ? CS().creatures.get(m.prey) : null;
    if (!prey) { setMd(c, 'roam'); m.prey = null; return true; }
    const hx = c.x + Math.cos(c.facing) * BITE_R * 0.85, hz = c.z + Math.sin(c.facing) * BITE_R * 0.85;
    prey.x += (hx - prey.x) * Math.min(1, dt * 8); prey.z += (hz - prey.z) * Math.min(1, dt * 8);
    prey.mem.carriedBy = c.id;
    if (!m.lair) m.lair = CS().fleeSpot(c, z, c.x + rng.float(-5, 5), c.z + rng.float(-5, 5));
    if (lope(c, m.lair.x, m.lair.z, 1.8, dt, 2) || m.mdT > 14) { setMd(c, 'feed'); m.feedT = rng.float(12, 22); }
    c.setState('travel');
    return true;
  }
  if (md === 'feed') {
    stop(c); c.setState('eat');
    const prey = m.prey ? CS().creatures.get(m.prey) : null;
    if (prey && (m.biteT = (m.biteT ?? 0) - dt) <= 0) { m.biteT = rng.float(1.2, 2.4); fx(c, 'bite'); }
    if (m.mdT > (m.feedT ?? 15) || !prey) { if (prey) { delete prey.mem.carriedBy; prey.butchered = true; } m.prey = null; m.lair = null; setMd(c, 'roam'); m.calm = G.time + 30; }
    // a unit walking up on it while it eats
    const s = scent(c); if (s && s.d < 10) { if (prey) delete prey.mem.carriedBy; m.prey = null; n.tg = s.p.id; setMd(c, 'charge'); fx(c, 'snarl'); }
    return true;
  }
  // ---- the hunt for a unit
  const tgt = n.tg ? G.players.get(n.tg) as Player | undefined : undefined;
  if (md === 'maul') {
    c.setState('attack');
    if (!tgt || tgt.body.dead || tgt.zoneKey !== c.zoneKey) { n.tg = null; setMd(c, 'roam'); m.calm = G.time + 25; return true; }
    const d = dist(tgt, c);
    faceTo(c, tgt.x, tgt.z);
    // standing on it: bite after bite while it is down; if it gets away, after it
    if (d > BITE_R + 1.5) { setMd(c, 'charge'); return true; }
    stop(c);
    if (c.attackT <= 0) { attack(c, tgt); fx(c, 'bite'); }
    if (m.mdT > 9) { setMd(c, 'back'); m.goal = CS().fleeSpot(c, z, tgt.x, tgt.z); }
    return true;
  }
  if (md === 'back') {
    c.setState('flee');
    if (!m.goal || lope(c, m.goal.x, m.goal.z, 3, dt, 2) || m.mdT > 5) { setMd(c, 'roam'); m.calm = G.time + 20; }
    return true;
  }
  if (md === 'charge') {
    c.setState('chase');
    if (!tgt || tgt.body.dead || tgt.zoneKey !== c.zoneKey) { n.tg = null; setMd(c, 'roam'); return true; }
    const d = dist(tgt, c);
    if (d < BITE_R + tgt.radius) { setMd(c, 'maul'); attack(c, tgt); fx(c, 'bite'); for (const q of playersIn(c.zoneKey)) if (dist(q, c) < 30) { ruleShown(c); break; } return true; }
    lope(c, tgt.x, tgt.z, c.sp.run, dt, 1);
    if (m.mdT > 16) { setMd(c, 'roam'); m.calm = G.time + 15; }
    return true;
  }
  if (md === 'howl') {
    stop(c); c.setState('warn');
    if (tgt) faceTo(c, tgt.x, tgt.z);
    if (m.mdT > 2.6) setMd(c, tgt ? 'stalk' : 'roam');
    return true;
  }
  if (md === 'stalk') {
    c.setState('stalk');
    if (!tgt || tgt.body.dead || tgt.zoneKey !== c.zoneKey) { n.tg = null; setMd(c, 'roam'); return true; }
    const d = dist(tgt, c);
    // a lope in from downwind, then the charge from 22 m
    if (d < 22) { setMd(c, 'charge'); fx(c, 'snarl'); return true; }
    lope(c, tgt.x, tgt.z, c.sp.walk * 1.8, dt, 2);
    if ((m.grT = (m.grT ?? 0) - dt) <= 0) { m.grT = rng.float(3, 6); fx(c, 'growl'); }
    if (m.mdT > 30) setMd(c, 'roam');
    return true;
  }
  // ---- roaming the open ground; it smells blood a long way off and hears footsteps
  c.setState('wander');
  if (!(m.calm > G.time)) {
    const s = scent(c);
    const heard = c.lastHeard && G.time - c.lastHeard.t < 1 && c.lastHeard.r > 2;
    if (s && (s.d < 30 || s.p.body.bleedRate() > 0.2)) { n.tg = s.p.id; setMd(c, 'howl'); fx(c, 'howl'); return true; }
    if (heard) { m.goal = { x: c.lastHeard!.x, z: c.lastHeard!.z }; fx(c, 'sniff'); }
    // something smaller to eat
    const prey = preyNear(c, 14);
    if (prey && !prey.dead && (m.huntCd ?? 0) < G.time) {
      if (Math.hypot(prey.x - c.x, prey.z - c.z) < BITE_R) { CS().damage(c.id, prey.id, 999, c.x, c.z, 0.5, 'bite'); fx(c, 'bite'); m.huntCd = G.time + 20; }
      else { lope(c, prey.x, prey.z, c.sp.run * 0.8, dt, BITE_R * 0.8); return true; }
    }
    if (prey && prey.dead && !prey.butchered && Math.hypot(prey.x - c.x, prey.z - c.z) < BITE_R + 1) { m.prey = prey.id; setMd(c, 'drag'); m.lair = null; return true; }
  }
  if ((m.howlAt ?? 0) < G.time) { m.howlAt = G.time + rng.float(40, 80); setMd(c, 'howl'); fx(c, 'howl'); return true; }
  if (!m.goal || (m.goalT ?? 0) < G.time) { m.goal = CS().wanderSpot(c, z, 30); m.goalT = G.time + rng.float(12, 24); }
  if (lope(c, m.goal.x, m.goal.z, c.sp.walk, dt, 2)) m.goal = null;
  return true;
}

const WOLF = def({
  key: 'gaunt_wolf', name: 'Gaunt Wolf', code: 'OP-03 // FAUNA, CANID (GIGANTIC, STARVED)', temperament: 'hostile', threat: 5,
  rule: { name: 'IT HUNTS BY SOUND AND BLOOD', text: 'It roams the big open levels alone and finds you by your footsteps and by blood: a bleeding unit is smelled from very far off. It howls before it comes. It is too big for doorways: get indoors, into a room or under cover, and it can only circle. Out in the open it knocks you down and stands on you; break free and get under something.', tell: 'A howl, very far off. Then the ground shaking.' },
  hp: 520, walk: 1.6, run: 9.5, turn: 2.4, radius: 1.3, height: 5.6, sight: 30, fov: 2.2, hearing: 2.2, smell: true,
  attack: { dmg: [24, 40], range: BITE_R, cooldown: 1.6, kinds: ['bite', 'deep', 'fracture'], corrupt: 0, knock: 1.4, grab: true, parts: ['torso_u', 'torso_l', 'thigh_l', 'thigh_r', 'uarm_l', 'uarm_r', 'neck'] },
  zones: ['fields', 'parking', 'meadow', 'suburbs'], weight: 0.12, group: [1, 1], maxPerZone: 1, diet: 'meat',
  meat: [['wolf_meat', 4], ['matted_hide', 1], ['wolf_fang', 2]],
  disposition: { mood: 'predator', self: true },
  sounds: { alert: 'strider_call', attack: 'bone_crunch', hurt: 'hound_yelp', death: 'hound_death', idle: 'hound_huff', step: 'strider_land' },
  scan: {
    cls: 'Fauna / gigantic starved canid',
    notes: [
      'A wolf three times a unit\'s height at the shoulder, starved to the frame: ribs bare through a torn flank, vertebrae through the back.',
      'Forelegs longer than the hind; one hind leg held up and dragged. It is still faster than anything on the level.',
      'Hunts alone, by sound and by blood scent. Howls before it attacks. Carries kills away to eat.',
      'Too large for doorways and corridors. Shelter indoors.',
    ],
  },
  gore: { blood: 'red', flesh: 0x8a2a24, gib: false },
  build: () => buildGauntWolf(), animate: animateWolf, think: thinkWolf,
});
onPlayerHit('gaunt_wolf', (p) => { bus.emit('think', p, ['It is standing on me. I cannot breathe—', 'Teeth. Rows of them. All the way down its jaw—', 'It has me by the— GET OFF—'][Math.floor(Math.random() * 3)]); });
TEARS.gaunt_wolf = { parts: [['uarm_l', 2], ['uarm_r', 2], ['thigh_l', 1], ['thigh_r', 1]], chance: 0.08, hold: 1.6, verb: 'wrench', with: /./, line: 'It has my arm in its mouth and it is SHAKING—' };
defDread('gaunt_wolf', { sting: 'chase', cam: 1 });
const GAL: WolfPose[] = ['idle', 'walk', 'lope', 'howl', 'maul', 'charge'];
WOLF.animateGallery = (rig: Rig, t: number) => {
  const q = (new URLSearchParams(location.search).get('pose') || GAL[Math.floor(t / 4) % GAL.length]) as WolfPose;
  poseGauntWolf(rig as WolfRig, t, 1 / 60, q);
};
void WOLF;
