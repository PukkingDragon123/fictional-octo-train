import * as THREE from 'three';
import { def, Rig } from '../species';
import { makeRamp, mixHex } from '../../gfx/pixel';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import type { Creature } from '../creature';
import type { Player } from '../../entities/player';
import { CS, zoneOf, pulse, attack, faceTo, onPlayerHit } from '../behaviors_a';
import { net, netOf, playAt, hashId, rng, localIn, thinkOnce, dist, playersIn, fx, fxPoll, live } from '../behaviors_b';
import { KitDef, KitRig, SkinB, BuildCtx, Page, V3, Wt, buildKitRig, kitSync, kitPersonalize, attackCurve, flinchOf, hash } from '../kit/humanoids';
import { chain, sac, blade, paintCap } from '../kit/organic';
import { mkBones, skBlob } from '../kit/fungal';
import { larderNear, nibble } from '../../world/remains';
import { ruleShown } from '../rules';
import '../../audio/sounds_creatures_c';

// =====================================================================================
// THE SEA WORM — a bristle worm a metre long that runs. Twelve flat, ringed
// segments with a sheen like oil on water, and on every segment a pair of
// fleshy paddle-legs fringed with bristles, so that the whole fringe ripples
// down its sides in waves when it goes. They came in with the whale (see
// whale_corpse.ts) and they live off the dead: they scuttle to remains, turn
// the proboscis out (a pink tube with two black hooked jaws on the end) and
// strip them. Alone, one runs from a unit; a few together, at a meal, will
// nip at ankles to drive you off it. The ones that stayed in the whale grew:
// two and a half metres, as thick as a thigh. They lie coiled in its ribs,
// and when something disturbs the carcass they come out of it all at once.
//   sea_worm   skinned kit rig: segmented body, 24 parapodia with chaetae fans,
//              prostomium with eyes, antennae and palps, eversible proboscis
//              and jaws, tail cirri. Giants are the same worm, scaled (net g).
// POSTER / VIDEO API (stand-alone, no game needed):
//   buildSeaWorm(variant?)                                  -> KitRig
//   poseSeaWorm(rig, t, dt, pose, { speed?, giant?, variant? })
//     pose: 'idle' | 'walk' | 'run' | 'nip' | 'feed' | 'rear' | 'coil' | 'burst' | 'dead'
// =====================================================================================

const NS = 12, SEGL = 0.085, Y0 = 0.085;
const segZ = (i: number) => 0.42 - i * SEGL;
const SIDES = [['L', 1], ['R', -1]] as const;
export const GIANT = 2.35;

function bonesW() {
  const A: [string, string, V3, boolean?][] = [['base', '', [0, 0, 0]]];
  for (let i = 0; i < NS; i++) A.push(['s' + i, i ? 's' + (i - 1) : 'base', [0, Y0, segZ(i)], i % 3 === 1]);
  A.push(['hd', 's0', [0, Y0 + 0.005, 0.49], true], ['pr', 'hd', [0, Y0 - 0.01, 0.55]]);
  for (const [s, k] of SIDES) {
    A.push(['jw' + s, 'pr', [k * 0.018, Y0 - 0.01, 0.6]], ['an' + s, 'hd', [k * 0.02, Y0 + 0.03, 0.53]], ['pa' + s, 'hd', [k * 0.04, Y0 - 0.01, 0.53]]);
    for (let i = 0; i < NS; i++) A.push(['g' + s + i, 's' + i, [k * 0.07, Y0 - 0.015, segZ(i)]]);
    A.push(['ci' + s, 's' + (NS - 1), [k * 0.015, Y0, segZ(NS - 1) - 0.06]]);
  }
  return mkBones(A);
}
function layoutW(p: Page) { p.reg('BODY', 64, 48); p.reg('LEG', 16, 16); p.reg('CHAETA', 16, 16); p.reg('HEAD', 32, 16); p.reg('PROB', 16, 16); p.reg('JAW', 8, 8); p.reg('EYE', 8, 8); p.reg('CAP', 8, 8); }
function buildW(B: SkinB, x: BuildCtx) {
  const bi = x.bi, R = x.R, rest = x.rest;
  // the body: flat, ringed, swelling a little at each segment's middle
  const pts: V3[] = [[0, Y0, 0.5]], rad: [number, number][] = [[0.035, 0.026]], w: Wt[] = [[bi('hd'), 1]];
  for (let i = 0; i < NS; i++) {
    for (const f of [0, 0.5]) {
      const z = segZ(i) - f * SEGL, taper = 1 - Math.max(0, (i - 6) / 7) * 0.55 - (i === 0 && f === 0 ? 0.1 : 0);
      pts.push([0, Y0, z]); rad.push([0.06 * taper * (f ? 0.86 : 1), 0.04 * taper * (f ? 0.84 : 1)]);
      w.push(f ? [bi('s' + i), 0.55, bi('s' + Math.min(NS - 1, i + 1)), 0.45] : [bi('s' + i), 1]);
    }
  }
  pts.push([0, Y0, segZ(NS - 1) - 0.06]); rad.push([0.012, 0.01]); w.push([bi('s' + (NS - 1)), 1]);
  sac(B, R('BODY'), 1, pts, rad, w, { n: 12, start: true, end: true, bump: (a) => (Math.abs(a) > 2.4 ? -0.18 : 0) + 0.06 * Math.cos(a * 2) });
  // the paddle-legs and their bristle fans
  for (const [s, k] of SIDES) for (let i = 0; i < NS; i++) {
    const g = bi('g' + s + i), r0 = rest('g' + s + i), taper = 1 - Math.max(0, (i - 6) / 7) * 0.5;
    const tip: V3 = [r0[0] + k * 0.075 * taper, r0[1] - 0.04, r0[2] + 0.01];
    sac(B, R('LEG'), 10 + i * 2 + (k > 0 ? 0 : 1), [[r0[0] - k * 0.02, r0[1], r0[2]], [(r0[0] + tip[0]) / 2, r0[1] - 0.015, r0[2]], tip], [[0.02 * taper, 0.014 * taper], [0.014 * taper, 0.01 * taper], [0.006, 0.005]], [[bi('s' + i), 0.5, g, 0.5], [g, 1], [g, 1]], { n: 5 });
    const up: V3 = [0, 1, 0];
    blade(B, R('CHAETA'), [[tip[0] - k * 0.02, tip[1] + 0.01, tip[2]], [tip[0] + k * 0.03 * taper, tip[1] + 0.03, tip[2] - 0.004]], [0.03 * taper, 0.05 * taper], up, [[g, 1], [g, 1]], { edge: 0.6, seed: i + (k > 0 ? 0 : 50) });
    blade(B, R('CHAETA'), [[tip[0] - k * 0.01, tip[1], tip[2] + 0.005], [tip[0] + k * 0.035 * taper, tip[1] - 0.02, tip[2] + 0.01]], [0.02 * taper, 0.035 * taper], [0, 0, 1], [[g, 1], [g, 1]], { edge: 0.6, seed: i + 100 });
  }
  // the head: a blunt prostomium, two pairs of eyes, antennae and fat palps
  const hd = bi('hd');
  skBlob(B, R('HEAD'), 60, [0, Y0 + 0.008, 0.515], [0.034, 0.022, 0.035], { n: 10, rings: 6, w: [hd, 1] });
  for (const [s, k] of SIDES) {
    for (const ez of [0.52, 0.505]) skBlob(B, R('EYE'), 61, [k * 0.016, Y0 + 0.027, ez], [0.006, 0.005, 0.006], { n: 6, rings: 4, w: [hd, 1], emis: 0.4 });
    chain(B, x, R('LEG'), 64 + (k > 0 ? 0 : 1), { bones: ['an' + s], tip: [k * 0.035, Y0 + 0.07, 0.6], r: [0.004, 0.0015], n: 4, rings: 4 });
    chain(B, x, R('LEG'), 66 + (k > 0 ? 0 : 1), { bones: ['pa' + s], tip: [k * 0.05, Y0 - 0.02, 0.585], r: [0.011, 0.005], n: 5, rings: 3 });
  }
  // the proboscis (turned in, it is a fold under the head; turned out, a pink tube) and two black jaws
  sac(B, R('PROB'), 70, [[0, Y0 - 0.012, 0.5], [0, Y0 - 0.014, 0.55], [0, Y0 - 0.012, 0.6]], [[0.022, 0.018], [0.02, 0.017], [0.016, 0.014]], [[hd, 1], [bi('pr'), 1], [bi('pr'), 1]], { n: 8, bump: (a, t) => (t > 0.5 ? 0.15 * Math.max(0, Math.sin(a * 6)) : 0) });
  for (const [s, k] of SIDES) {
    const j = bi('jw' + s), b0 = rest('jw' + s);
    const jp: V3[] = [b0, [b0[0] + k * 0.012, b0[1] + 0.002, b0[2] + 0.025], [b0[0] - k * 0.004, b0[1] + 0.003, b0[2] + 0.042]];
    sac(B, R('JAW'), 72 + (k > 0 ? 0 : 1), jp, [[0.008, 0.006], [0.006, 0.004], [0.0015, 0.0015]], [[j, 1], [j, 1], [j, 1]], { n: 5 });
  }
  // tail cirri
  for (const [s, k] of SIDES) chain(B, x, R('LEG'), 80 + (k > 0 ? 0 : 1), { bones: ['ci' + s], tip: [k * 0.03, Y0, segZ(NS - 1) - 0.16], r: [0.005, 0.0015], n: 4, rings: 3 });
}
function paintW(p: Page, x: BuildCtx) {
  const v = x.variant;
  const RB = makeRamp(mixHex(0x8a5a6a, 0x5a6a5a, v * 0.5), 8, { hueShift: 0.08, spread: 0.65 });
  const b = p.R('BODY');
  b.fill(RB, (xx, yy) => {
    const th = (b.deg(xx) * Math.PI) / 180;
    const ring = (yy % 4) === 0 ? -1.6 : (yy % 4) === 2 ? 0.4 : 0;
    const belly = Math.abs(th) > 2.3 ? 1.6 : 0;
    return 3.6 + Math.cos(th) * 1.2 + ring + belly + (b.fbm(xx, yy, 3, 2, 4 + v) - 0.5) * 1.2;
  }, undefined, 0.5);
  // iridescence: a sheen that slides from green to violet down the back
  for (let yy = 0; yy < b.h; yy++) for (let xx = 0; xx < b.w; xx++) {
    const th = (b.deg(xx) * Math.PI) / 180;
    if (Math.abs(th) < 0.9 && (yy % 4) !== 0) { const k = Math.sin(yy * 0.5 + xx * 0.2) * 0.5 + 0.5; b.blend(xx, yy, k > 0.5 ? 0x7ad0a0 : 0xb08ae0, 0.22 * (1 - Math.abs(th))); }
  }
  for (let yy = 0; yy < b.h; yy += 4) b.hline(b.X(-6), b.X(6), yy + 1, 0x2a1418, 0.5);
  const l = p.R('LEG');
  l.fill(makeRamp(mixHex(0xc87a7a, 0xb88a6a, v * 0.4), 6), (xx, yy) => 3 + Math.cos((l.deg(xx) * Math.PI) / 180) - (yy / l.h), undefined, 0.5);
  const ch = p.R('CHAETA');
  ch.fill(makeRamp(0xe8d8a0, 5), (xx, yy) => ((xx % 2) ? 3.5 : 1.5) + (hash(xx, yy) - 0.5), undefined, 0.3);
  const h = p.R('HEAD');
  h.fill(RB, (xx, yy) => 4 + Math.cos((h.deg(xx) * Math.PI) / 180) * 1.3 + (hash(xx, yy) - 0.5) * 0.6, undefined, 0.5);
  p.R('PROB').fill(makeRamp(0xe08890, 6), (xx, yy) => 3 + Math.sin(yy * 1.6) * 1 + (hash(xx, yy) - 0.5), undefined, 0.5);
  p.R('JAW').fill([0x0a0606, 0x1a1210, 0x3a2a24, 0x6a5a50], (xx, yy) => 1.5 + (yy / 8) * 1.5, undefined, 0.4);
  p.R('EYE').fill([0x101010, 0x302020, 0xc04030], (xx, yy) => (Math.hypot(xx - 3.5, yy - 3.5) < 1.5 ? 0 : 1.2), undefined, 0.2);
  paintCap(p.R('CAP'), 0x8a5a6a, 0xc87a7a, 0x5a2a30);
}
const WORM_KIT: KitDef = { key: 'sea_worm', variants: 3, W: 128, H: 128, bones: bonesW, layout: layoutW, build: buildW, paint: paintW, sphere: [0, 0.1, 0, 0.8] };
/** a sea worm rig (variant 0..2); giants are the same rig scaled by GIANT */
export function buildSeaWorm(variant = 0): KitRig { return buildKitRig(WORM_KIT, variant, 0.12); }

// ------------------------------------------------------------------ pose
interface WormDrive { t: number; dt: number; speed: number; ph: number; seed: number; md: string; bite: number; dead: number; flinch: number; turn: number; coil: number; rear: number; lyaw: number }
function poseWorm(K: KitRig, d: WormDrive) {
  const P = K.parts, t = d.t;
  const go = Math.min(1, d.speed / 1.5), run = Math.min(1, d.speed / 4);
  // the body: a travelling wave head to tail (more at speed); coiled, an S held and slowly turning over
  const amp = 0.06 + go * 0.12 + run * 0.06;
  for (let i = 0; i < NS; i++) {
    const w = Math.sin(d.ph - i * 0.75) * amp * (i === 0 ? 0.4 : 1);
    const coil = d.coil * (0.42 + Math.sin(t * 0.6 + i * 0.4 + d.seed * 5) * 0.12) * (i % 6 < 3 ? 1 : -0.6);
    const curlDead = d.dead * (0.3 + Math.sin(i * 0.9) * 0.08);
    // rearing: the front third lifts off the floor
    const lift = i < 4 ? -d.rear * (0.35 - i * 0.07) : i === 4 ? d.rear * 0.25 : 0;
    P['s' + i].rotation.set(lift + (d.flinch * Math.sin(t * 40 + i) * 0.1), w + coil + curlDead + (i < 3 ? d.turn * 0.05 : -d.turn * 0.02) + (i === 0 ? d.lyaw * 0.6 : 0), Math.sin(d.ph * 0.5 - i * 0.5) * 0.06 * go);
    // legs: metachronal waves rowing down each side, opposite sides in antiphase
    for (const [s, k] of SIDES) {
      const ph = d.ph * 2.2 - i * 0.95 + (k > 0 ? 0 : Math.PI);
      const sw = Math.sin(ph) * (0.25 + go * 0.5) * (1 - d.dead * 0.7) + (d.dead ? Math.sin(t * 14 + i) * 0.15 * Math.max(0, 1 - (t % 6) / 3) : 0);
      const lift2 = Math.max(0, Math.cos(ph)) * 0.45 * go;
      P['g' + s + i].rotation.set(0, sw * k, k * (lift2 + 0.05 + d.coil * 0.3) - d.rear * k * 0.2 * (i < 4 ? 1 : 0));
    }
  }
  // the head searches; the proboscis turns out to bite, the jaws open and snap
  const out = Math.max(d.bite, d.md === 'feed' ? 0.6 + Math.sin(t * 9) * 0.3 : 0, d.md === 'rear' ? 0.5 : 0);
  P.hd.rotation.set(-0.15 * d.rear + Math.sin(t * 2.3 + d.seed) * 0.08 + (d.md === 'feed' ? 0.35 : 0), Math.sin(t * 1.7 + d.seed * 3) * 0.25 * (1 - go), 0);
  P.pr.position.z = (P.pr.userData.p0 as THREE.Vector3).z + out * 0.05;
  P.pr.scale.setScalar(0.7 + out * 0.5);
  const snap = Math.max(0, Math.sin(t * (d.md === 'feed' ? 9 : 5))) * out;
  for (const [s, k] of SIDES) {
    P['jw' + s].rotation.set(0, k * (0.5 * out - snap * 0.45), 0);
    P['an' + s].rotation.set(Math.sin(t * 3 + k) * 0.25 - 0.2, k * (0.2 + Math.sin(t * 2.2 + k * 2) * 0.25), 0);
    P['pa' + s].rotation.set(Math.sin(t * 2.6 + k) * 0.2 + 0.1, k * Math.sin(t * 1.9) * 0.2, 0);
    P['ci' + s].rotation.set(Math.sin(t * 2 + k) * 0.2, k * 0.2 + Math.sin(d.ph) * 0.2, 0);
  }
}

function animateWorm(rig: Rig, c: Creature, t: number, dt: number) {
  const K = rig as KitRig;
  const v = Math.floor(hashId(c.id) * 3);
  if (K.kit.who !== c.id) { K.kit.who = c.id; kitPersonalize(K, v); }
  kitSync(K);
  const n = netOf(c), ud = K.kit.m as Record<string, number>;
  const giant = n.g ? GIANT * (0.9 + hashId(c.id, 3) * 0.2) : 0.9 + hashId(c.id, 3) * 0.25;
  rig.root.scale.setScalar(giant);
  const f = fxPoll(rig, c);
  if (f) {
    if (f.key === 'burst') { ud.bu = 1; playAt('gore_burst', c, 1, 22, 0.6); playAt('arv_slide', c, 0.9, 18, 0.7); }
    else if (f.key === 'hiss') playAt('gloam_hiss', c, 0.7, 12, n.g ? 0.6 : 1.4);
    else if (f.key === 'chit') playAt('ventling_chitter', c, 0.5, 10, n.g ? 0.6 : 1.1);
  }
  ud.bu = Math.max(0, (ud.bu ?? 0) - dt * 0.8);
  const turn = (() => { let df = c.facing - (ud.lf ?? c.facing); while (df > Math.PI) df -= Math.PI * 2; while (df < -Math.PI) df += Math.PI * 2; ud.lf = c.facing; return Math.max(-4, Math.min(4, df / Math.max(1e-3, dt))); })();
  ud.trn = (ud.trn ?? 0) + (turn - (ud.trn ?? 0)) * Math.min(1, dt * 6);
  const md: string = c.dead ? '' : n.md ?? '';
  const sp = c.speed / (n.g ? 1.6 : 1);
  ud.ph = (ud.ph ?? hashId(c.id) * 9) + dt * (2.5 + sp * 5.5 + (md === 'nest' ? 1.5 : 0));
  ud.dk = c.dead ? Math.min(1, (ud.dk ?? 0) + dt) : 0;
  const ac = attackCurve(rig, c, t);
  const nest = md === 'nest' ? 1 : 0;
  ud.co = (ud.co ?? nest) + (nest - (ud.co ?? nest)) * Math.min(1, dt * 2);
  poseWorm(K, { t, dt, speed: c.dead ? 0 : c.speed / (n.g ? 1.6 : 1), ph: ud.ph, seed: hashId(c.id, 2), md, bite: Math.max(ac.wind * 0.5, ac.strike), dead: ud.dk, flinch: flinchOf(c), turn: ud.trn, coil: ud.co, rear: Math.max(md === 'rear' ? 1 : 0, ud.bu, nest * Math.max(0, Math.sin(t * 0.5 + hashId(c.id) * 6)) * 0.8), lyaw: 0 });
  // nested in the whale: it rises and sinks in the ribs, half out of sight
  if (nest) rig.root.position.y += Math.sin(t * 0.5 + hashId(c.id) * 6) * 0.15 + (n.ny ?? 0);
  K.kit.F.fx.value.y += dt; K.kit.F.fx.value.z = Math.min(1, c.hitFlash / 0.15) * 0.4;
  if (c.speed > 0.4 && c.visibleToLocal && (ud.sT ?? 0) < t) { ud.sT = t + (n.g ? 0.2 : 0.12); playAt(n.g ? 'swivel_skitter' : 'plenum_skitter', c, n.g ? 0.35 : 0.15, n.g ? 14 : 8, n.g ? 0.6 : 1.6 + Math.random() * 0.3); }
  const p = localIn(c);
  if (p && !c.dead && c.visibleToLocal) {
    const d = dist(p, c);
    if (n.g && md === 'hunt' && d < 12) thinkOnce(p, 'sw_giant', ['They came OUT of it. Out of the whale. They are as long as a car.', 'Worms. Giant worms, running on all those legs. RUN.', 'Its mouth turned inside out. There are hooks on the end.'][Math.floor(t * 0.3) % 3], 40);
    else if (n.g && nest && d < 10) thinkOnce(p, 'sw_nest', 'Something is moving in the ribs. Something long, coiled up in there.', 60);
    else if (!n.g && d < 6) thinkOnce(p, 'sea_worm', ['A worm. A metre of it. Running on legs. So many legs.', 'It is stripping that body with a mouth on a stalk.', 'The legs go in waves down its sides. Like a centipede made of oars.'][Math.floor(t * 0.15) % 3], 90);
  }
}

// ------------------------------------------------------------------ host brain
function setMd(c: Creature, md: string) { const n = net(c); if (n.md !== md) { n.md = md; c.mem.mdT = 0; } }
/** host: the whale's nest slot and exit (whale_corpse.ts writes them into mem) */
interface Nest { wid: string; sx: number; sz: number; ex: number; ez: number; y: number }
function whaleOf(c: Creature): Creature | null { const n = c.mem.nest as Nest | undefined; if (!n) return null; const w = CS().creatures.get(n.wid); return w && !w.dead ? w : null; }
function thinkWorm(c: Creature, dt: number): boolean {
  const z = zoneOf(c), m = c.mem, n = net(c), ev = pulse(c), cs = CS(), now = G.time;
  if (!m.init) { m.init = 1; m.hunger = rng.float(0.3, 1); if (n.g && c.hp === c.sp.hp) c.hp = 120; }
  m.mdT = (m.mdT ?? 0) + dt;
  m.hunger = Math.min(1, m.hunger + dt / 160);
  const md: string = n.md ?? '';
  const giant = !!n.g;
  if (ev.hurt > 0) { fx(c, 'hiss'); if (c.targetId && G.players.has(c.targetId)) m.anger = { pid: c.targetId, t: now + (giant ? 30 : 8) }; if (!giant && c.hp < c.sp.hp * 0.6) { setMd(c, 'flee'); m.from = c.targetId ? G.players.get(c.targetId) : null; } }
  // ---------------- the giants' nest in the whale
  const nest = m.nest as Nest | undefined, whale = whaleOf(c);
  if (nest && whale) {
    const wm = whale.mem;
    if (md === 'nest') {
      c.x = nest.sx; c.z = nest.sz; c.vx = c.vz = 0; c.speed = 0; n.ny = nest.y; c.setState('nest');
      c.targetFacing = c.facing + Math.sin(now * 0.3 + hashId(c.id) * 9) * 0.02;
      const dist0 = wm.disturbed as { pid: string; t: number } | undefined;
      if (dist0 && now - dist0.t < 4 && now > (m.restT ?? 0)) { setMd(c, 'burst'); fx(c, 'burst'); m.prey = dist0.pid; m.t0 = now; m.from = { x: c.x, z: c.z }; ruleShown(whale); }
      return true;
    }
    if (md === 'burst') {
      // out through the ribs in a heave: straight to the exit, ignoring the carcass around it
      const k = Math.min(1, (now - m.t0) / 1.1);
      c.x = m.from.x + (nest.ex - m.from.x) * k; c.z = m.from.z + (nest.ez - m.from.z) * k; c.vx = c.vz = 0; c.speed = 3;
      n.ny = nest.y * (1 - k); faceTo(c, nest.ex, nest.ez, true);
      if (k >= 1) { setMd(c, 'hunt'); n.ny = 0; m.huntT = now + rng.float(14, 22); }
      return true;
    }
    if (md === 'home') {
      // back to the exit, then in
      if (Math.hypot(c.x - nest.ex, c.z - nest.ez) > 0.6) { cs.moveTo(c, z, nest.ex, nest.ez, c.sp.run * 0.6, dt, 0.5); return true; }
      setMd(c, 'enter'); m.t0 = now; m.from = { x: c.x, z: c.z };
      return true;
    }
    if (md === 'enter') {
      const k = Math.min(1, (now - m.t0) / 1.6);
      c.x = m.from.x + (nest.sx - m.from.x) * k; c.z = m.from.z + (nest.sz - m.from.z) * k; c.vx = c.vz = 0; c.speed = 1;
      n.ny = nest.y * k; faceTo(c, nest.sx, nest.sz, true);
      if (k >= 1) { setMd(c, 'nest'); m.restT = now + 6; }
      return true;
    }
    if (md === 'hunt') {
      const p = m.prey ? G.players.get(m.prey) : null;
      if (!p || p.body.dead || p.zoneKey !== c.zoneKey || now > m.huntT || dist(p, c) > 24) { setMd(c, 'home'); return true; }
      c.setState('chase'); c.targetId = p.id;
      cs.moveTo(c, z, p.x, p.z, c.sp.run * 1.15, dt, 0.4);
      if (dist(p, c) < 1.5 && c.attackT <= 0) { faceTo(c, p.x, p.z); attack(c, p); fx(c, 'hiss'); }
      return true;
    }
    setMd(c, 'home');
    return true;
  }
  if (nest && !whale) { m.nest = null; setMd(c, ''); }
  // ---------------- a free worm: scavenger
  if (md === 'flee') {
    c.setState('flee');
    const fr = m.from as { x: number; z: number } | null;
    if (!m.fleeTo) m.fleeTo = cs.fleeSpot(c, z, fr?.x ?? c.x - Math.cos(c.facing), fr?.z ?? c.z - Math.sin(c.facing));
    if (cs.moveTo(c, z, m.fleeTo.x, m.fleeTo.z, c.sp.run, dt, 0.6) || m.mdT > 5) { setMd(c, ''); m.fleeTo = null; }
    return true;
  }
  // a unit near: a lone worm runs; one at a meal, or one that was hurt, or a bleeding unit on the floor: it nips
  let near: { p: Player; d: number } | null = null;
  for (const p of playersIn(c.zoneKey)) { if (p.body.dead) continue; const d = dist(p, c); if (d < (giant ? 10 : 4) && (!near || d < near.d)) near = { p, d }; }
  const angry = m.anger && m.anger.t > now ? G.players.get(m.anger.pid) : null;
  if (angry || (near && (giant || md === 'feed' || near.p.body.downed || near.p.body.health < 30))) {
    const p = angry ?? near!.p;
    if (md !== 'nip') { setMd(c, 'nip'); fx(c, 'chit'); if (dist(p, c) < 8) ruleShown(c); }
    c.setState('chase'); c.targetId = p.id;
    cs.moveTo(c, z, p.x, p.z, c.sp.run, dt, 0.35);
    if (dist(p, c) < c.sp.attack!.range + 0.3 && c.attackT <= 0) {
      faceTo(c, p.x, p.z); attack(c, p);
      // a nip, and away again unless it is angry
      if (!angry && !giant) { setMd(c, 'flee'); m.from = { x: p.x, z: p.z }; m.fleeTo = null; }
    }
    return true;
  }
  if (near && near.d < 3.2 && !giant) { setMd(c, 'flee'); m.from = { x: near.p.x, z: near.p.z }; m.fleeTo = null; return true; }
  if (md === 'nip') setMd(c, '');
  // scavenging
  if (m.hunger > 0.3) {
    const l = larderNear(z, c.x, c.z, 16);
    if (l) {
      if (cs.moveTo(c, z, l.x + Math.cos(hashId(c.id) * 6) * 0.4, l.z + Math.sin(hashId(c.id) * 6) * 0.4, c.sp.run * 0.7, dt, 0.35)) {
        setMd(c, 'feed'); c.setState('eat'); faceTo(c, l.x, l.z);
        m.eatT = (m.eatT ?? 0) + dt;
        if (m.eatT > 6) { m.eatT = 0; nibble(z, l); m.hunger = Math.max(0, m.hunger - 0.45); }
      }
      return true;
    }
  }
  if (md === 'feed') setMd(c, '');
  // nosing about: short fast runs, pauses with the head up
  c.setState('wander');
  if (!m.goal || m.mdT > (m.wT ?? 3)) {
    if (rng.next() < 0.4) { m.goal = null; setMd(c, 'rear'); m.wT = rng.float(1, 2.5); m.mdT = 0; c.speed = 0; c.vx = c.vz = 0; return true; }
    m.goal = cs.wanderSpot(c, z, 6); m.wT = rng.float(2, 5); m.mdT = 0; setMd(c, '');
  }
  if (m.goal && cs.moveTo(c, z, m.goal.x, m.goal.z, rng.next() < 0.5 ? c.sp.walk : c.sp.run * 0.7, dt, 0.4)) m.goal = null;
  return true;
}

const WORM = def({
  key: 'sea_worm', name: 'Sea Worm', code: 'SW-03 // FAUNA, POLYCHAETE (TERRESTRIAL, NECROPHAGE)', temperament: 'skittish', threat: 2,
  rule: { name: 'THE WHALE IS THEIRS', text: 'Free ones are scavengers: they run from a unit, strip remains, and nip at you only to drive you off their meal, or if you are bleeding on the floor. The giants live coiled in the Whale Corpse: disturb it (come close to the open ribs, run near it, cut at it) and they all come out together and hunt you for a while before they go back in. Walk softly round the whale.', tell: 'A worm a metre long, running on rows of little paddle legs.' },
  hp: 22, walk: 1.2, run: 4.6, turn: 7, radius: 0.22, height: 0.22, sight: 8, fov: 2.4, hearing: 1.5, vibration: true, smell: true,
  attack: { dmg: [3, 7], range: 0.7, cooldown: 1.3, kinds: ['bite', 'laceration'], corrupt: 0.02, knock: 0.1, parts: ['foot_l', 'foot_r', 'shin_l', 'shin_r', 'thigh_l', 'thigh_r'] },
  zones: ['pools', 'undercroft', 'tunnels'], weight: 1, group: [2, 4], maxPerZone: 8, diet: 'meat',
  meat: [['worm_meat', 1]],
  sounds: { idle: 'ventling_chitter', alert: 'gloam_hiss', attack: 'swivel_bite', hurt: 'ventling_squeal', death: 'gore_squelch', step: 'plenum_skitter' },
  scan: {
    cls: 'Fauna / polychaete, terrestrial scavenger',
    notes: [
      'A bristle worm a metre long on twelve pairs of fringed paddle-legs. Fast.',
      'It turns out a proboscis with two black hooked jaws to strip remains.',
      'Alone it runs. At a meal, or with a bleeding unit on the floor, it nips.',
      'Giants (two and a half metres) nest in the Whale Corpse and come out when it is disturbed.',
    ],
  },
  gore: { blood: 'red', tint: 0xd0a0a8, flesh: 0xc87a7a, sever: ['s4', 's8', 'hd', 'pr'], head: 'hd' },
  build: () => buildSeaWorm(0), animate: animateWorm, think: thinkWorm,
});
onPlayerHit('sea_worm', (p, h) => { if ((h?.dmg ?? 0) > 7) bus.emit('think', p, ['Hooks. It bit with HOOKS. They went in and came out.', 'It took a piece of my leg with it.'][Math.floor(Math.random() * 2)]); });

export type SeaWormPose = 'idle' | 'walk' | 'run' | 'nip' | 'feed' | 'rear' | 'coil' | 'burst' | 'dead';
/** animate a sea worm rig with no game running (call every frame with a running clock); 'nip' loops every 1.5 s */
export function poseSeaWorm(rig: KitRig, t: number, dt: number, pose: SeaWormPose = 'idle', o: { speed?: number; giant?: boolean; variant?: number } = {}) {
  if (o.variant !== undefined && rig.kit.entry.variant !== o.variant) kitPersonalize(rig, o.variant);
  kitSync(rig);
  if (o.giant !== undefined) rig.root.scale.setScalar(o.giant ? GIANT : 1);
  const ud = rig.kit.m as Record<string, number>;
  const speeds: Partial<Record<SeaWormPose, number>> = { walk: 1.1, run: 4.4, burst: 3 };
  const speed = o.speed ?? speeds[pose] ?? 0;
  ud.ph = (ud.ph ?? 0) + dt * (2.5 + speed * 5.5 + (pose === 'coil' ? 1.5 : 0));
  const nt = t % 1.5, bite = pose === 'nip' ? (nt < 0.35 ? nt / 0.35 * 0.5 : nt < 0.5 ? 1 : Math.max(0, 1 - (nt - 0.5) / 0.5)) : 0;
  poseWorm(rig, { t, dt, speed, ph: ud.ph, seed: 0.3, md: pose === 'feed' ? 'feed' : pose === 'rear' ? 'rear' : '', bite, dead: pose === 'dead' ? 1 : 0, flinch: 0, turn: 0, coil: pose === 'coil' ? 1 : 0, rear: pose === 'rear' || pose === 'burst' ? 1 : 0, lyaw: 0 });
  rig.kit.F.fx.value.y += dt;
}
WORM.animateGallery = (rig: Rig, t: number) => {
  const u = new URLSearchParams(location.search);
  const q = (u.get('pose') || ['idle', 'walk', 'run', 'nip', 'feed', 'coil'][Math.floor(t / 4) % 6]) as SeaWormPose;
  poseSeaWorm(rig as KitRig, t, 1 / 60, q, { giant: u.get('giant') === '1' ? true : undefined, variant: u.get('v') !== null ? Number(u.get('v')) : undefined });
};
