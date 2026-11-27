import { horrify } from '../kit/horror';
import { def, Rig } from '../species';
import { makeRamp } from '../../gfx/pixel';
import type { Creature } from '../creature';
import { CS, zoneOf, pulse, stop, findSpot } from '../behaviors_a';
import { net, netOf, playAt, hashId, rng, localIn, thinkOnce, dist, playersIn } from '../behaviors_b';
import { KitDef, KitRig, BoneSpec, SkinB, BuildCtx, Page, V3, Wt, buildKitRig, kitSync, kitPersonalize, flinchOf, hash } from '../kit/humanoids';
import { sac, paintSkin, paintChitin, paintCap } from '../kit/organic';
import { addInhabitant } from '../lore';
import '../../audio/sounds_creatures_c';

// =====================================================================================
// CARPET GRUB — a fat larva as long as a forearm, segmented like a draught
// excluder, its back grown in the pattern of the carpet it eats: the lobby's mustard
// and brown loops, a band of office blue. Pale, soft and ridged underneath, eight
// pairs of stubby prolegs, a hard brown head capsule and two working mandibles. It
// eats carpet and paper and inches along in slow waves; to sleep it curls into a C
// and spins a loose sheath of pale silk round itself, and the silk is the thing worth
// having. Two in a pen make more of them. Docile, blind, harmless.
//   carpet_grub   skinned kit rig: seven segments in a chain, the carpet-patterned dorsal
//                 plates, prolegs, chitin head with mandibles and spinneret, a silk sheath
//                 bone that swells out round it when it sleeps
// Loops (net 'pn' from the pen, or its own brain): crawl (a peristaltic wave), eat (head down, mandibles), sleep (curled in silk).
// =====================================================================================

const SEG = 7;
function bonesG(v: number): BoneSpec[] {
  const s = 1 + v * 0.07;
  const b: BoneSpec[] = [{ name: 'base', parent: '', at: [0, 0, 0] }, { name: 'silk', parent: 'base', at: [0, 0.05, 0] }, { name: 's0', parent: 'base', at: [0, 0.045 * s, -0.2 * s] }];
  for (let i = 1; i < SEG; i++) b.push({ name: 's' + i, parent: 's' + (i - 1), at: [0, 0, 0.062 * s], cap: i === SEG - 1 });
  b.push({ name: 'head', parent: 's' + (SEG - 1), at: [0, 0.004, 0.045 * s], cap: true });
  for (const [sd, k] of [['L', 1], ['R', -1]] as const) b.push({ name: 'jaw' + sd, parent: 'head', at: [k * 0.012, -0.012, 0.022] });
  return b;
}
function layoutG(p: Page) { p.reg('BODY', 64, 32); p.reg('BELLY', 32, 32); p.reg('HEAD', 16, 16); p.reg('JAW', 8, 8); p.reg('LEG', 8, 8); p.reg('SILK', 48, 32); p.reg('CAP', 8, 8); }
const radius = (i: number) => 0.034 + Math.sin(Math.min(1, (i + 0.6) / (SEG - 0.4)) * Math.PI) * 0.022;
function buildG(B: SkinB, x: BuildCtx) {
  const bi = x.bi, R = x.R, v = x.variant;
  const S = (i: number) => bi('s' + Math.max(0, Math.min(SEG - 1, i)));
  // the segments: each a fat ring, pinched at the joints, ridged across the back
  for (let i = 0; i < SEG; i++) {
    const p = x.rest('s' + i), r = radius(i), w: Wt = [S(i), 1], wn: Wt = i < SEG - 1 ? [S(i), 0.5, S(i + 1), 0.5] : w, wp: Wt = i > 0 ? [S(i - 1), 0.4, S(i), 0.6] : w;
    sac(B, R('BODY'), 1 + i,
      [[0, p[1] - 0.002, p[2] - 0.03], [0, p[1], p[2] - 0.018], [0, p[1] + 0.004, p[2] + 0.004], [0, p[1], p[2] + 0.024], [0, p[1] - 0.002, p[2] + 0.034]],
      [[r * 0.78, r * 0.7], [r * 0.96, r * 0.92], [r * 1.02, r], [r * 0.96, r * 0.92], [r * 0.8, r * 0.72]],
      [wp, w, w, w, wn], { n: 14, up: [0, 1, 0], tv: [0.1, 0.3, 0.5, 0.7, 0.9],
        bump: (a, t) => (Math.sin(a) > 0.2 ? Math.sin(t * Math.PI * 2) * 0.03 : 0) + (hash(Math.round(a * 4), i * 9 + Math.round(t * 4) + v) - 0.5) * 0.025 });
    // the belly plate and a pair of stubby prolegs, each with a ring of hooks
    sac(B, R('BELLY'), 20 + i, [[0, p[1] - r * 0.7, p[2] - 0.02], [0, p[1] - r * 0.86, p[2]], [0, p[1] - r * 0.7, p[2] + 0.02]], [[r * 0.6, 0.006], [r * 0.7, 0.008], [r * 0.6, 0.006]], [w, w, w], { n: 8 });
    if (i > 0 && i < SEG - 1) for (const k of [1, -1]) {
      sac(B, R('LEG'), 30 + i, [[k * r * 0.55, p[1] - r * 0.6, p[2]], [k * r * 0.72, p[1] - r * 0.9, p[2] + 0.003], [k * r * 0.78, p[1] - r * 1.08, p[2] + 0.004]], [[0.008, 0.008], [0.006, 0.006], [0.0045, 0.0045]], [w, w, w], { n: 6 });
    }
  }
  // the head capsule: hard, brown, shiny; two mandibles; the spinneret under the lip, a stub of silk hanging from it
  const H = x.rest('head'), wH: Wt = [bi('head'), 1];
  sac(B, R('HEAD'), 40, [[H[0], H[1], H[2] - 0.018], [H[0], H[1] + 0.006, H[2]], [H[0], H[1] + 0.003, H[2] + 0.02], [H[0], H[1] - 0.005, H[2] + 0.032]], [[0.03, 0.028], [0.036, 0.032], [0.03, 0.026], [0.014, 0.012]], [wH, wH, wH, wH], { n: 12 });
  for (const [sd, k] of [['L', 1], ['R', -1]] as const) {
    const J = x.rest('jaw' + sd), wJ: Wt = [bi('jaw' + sd), 1];
    sac(B, R('JAW'), 41, [J, [J[0] + k * 0.002, J[1] - 0.002, J[2] + 0.012], [J[0] - k * 0.006, J[1] - 0.003, J[2] + 0.02]], [[0.006, 0.005], [0.004, 0.0035], [0.001, 0.001]], [wJ, wJ, wJ], { n: 5 });
    // a simple eye-spot each side (it is blind: they are pale)
    sac(B, R('JAW'), 42, [[H[0] + k * 0.022, H[1] + 0.008, H[2] + 0.004], [H[0] + k * 0.026, H[1] + 0.008, H[2] + 0.006]], [[0.004, 0.004], [0.002, 0.002]], [wH, wH], { n: 5 });
  }
  sac(B, R('SILK'), 43, [[H[0], H[1] - 0.018, H[2] + 0.018], [H[0], H[1] - 0.03, H[2] + 0.02], [H[0], H[1] - 0.042, H[2] + 0.016]], [[0.003, 0.003], [0.002, 0.002], [0.0008, 0.0008]], [wH, wH, wH], { n: 4 });
  // the silk sheath: a loose ring of threads round the curled body, weighted to one bone that is scaled to nothing awake
  const wS: Wt = [bi('silk'), 1];
  const ring: V3[] = [], rr: [number, number][] = [], ws: Wt[] = [];
  for (let i = 0; i <= 10; i++) { const a = -Math.PI * 0.95 + (i / 10) * Math.PI * 1.9; ring.push([Math.cos(a) * 0.12, 0.05, Math.sin(a) * 0.11 + 0.01]); rr.push([0.06 + Math.sin(i * 1.7) * 0.01, 0.055]); ws.push(wS); }
  sac(B, R('SILK'), 44, ring, rr, ws, { n: 12, up: [0, 1, 0], bump: (a, t) => (hash(Math.round(a * 8), Math.round(t * 14)) - 0.5) * 0.4 });
}
function paintG(p: Page, x: BuildCtx) {
  const v = x.variant;
  // the back: the carpet it ate, grown into it: mustard and brown loops (the lobby), a band of office blue in some
  const bd = p.R('BODY');
  const base = [0x9a8456, 0x8a6a4a, 0x7a8090][v % 3];
  paintSkin(bd, makeRamp(base, 7, { hueShift: 0.03, spread: 0.6 }), { seed: 7 + v, veins: 2, vein: 0x6a4a2a, mottle: 1.4, glint: 18 });
  for (let yy = 0; yy < bd.h; yy++) for (let xx = 0; xx < bd.w; xx++) {
    const c = Math.cos((bd.deg(xx) * Math.PI) / 180), top = c > -0.1;
    // the pinched joint at each end of a segment: dark, creased, wet
    if (yy < 3 || yy > bd.h - 4) { bd.blend(xx, yy, 0x3a2614, yy < 1 || yy > bd.h - 2 ? 0.75 : 0.45); continue; }
    // the belly side pales to cream
    if (!top) { bd.blend(xx, yy, 0xe8dcc0, Math.min(0.7, -c * 0.9)); continue; }
    // the back: the lobby carpet grown into skin: brown loop rows, a mustard pile between, a stain or two
    const lx = (xx + (yy >> 2)) % 5, ly = yy % 5;
    if ((lx === 0 || ly === 0) && hash(xx >> 2, yy >> 2) < 0.85) bd.blend(xx, yy, 0x5a3418, 0.7);
    if (lx === 2 && ly === 2 && hash(xx, yy) < 0.4) bd.blend(xx, yy, 0xc8a860, 0.35);
    if (c > 0.9 && xx % 2 === 0) bd.blend(xx, yy, 0x2a1a0c, 0.5);
    if (v === 2 && yy > bd.h * 0.4 && yy < bd.h * 0.6) bd.blend(xx, yy, 0x3a5a8a, 0.55);
  }
  for (let i = 0; i < 14; i++) bd.blob(hash(i, 51) * bd.w, hash(i, 52) * bd.h, 1.5 + hash(i, 53) * 2, 1 + hash(i, 54) * 2, 0x4a2a14, 0.5);
  paintSkin(p.R('BELLY'), makeRamp(0xf0e8d0, 6, { spread: 0.4 }), { seed: 13, veins: 4, vein: 0xd8c8a8, mottle: 0.6, glint: 14 });
  paintChitin(p.R('HEAD'), makeRamp(0x6a4a2a, 6, { spread: 0.6 }), { seed: 3, plates: 3, hi: 0.8 });
  p.R('JAW').fill(makeRamp(0x2a1a10, 4), (xx, yy) => 1.5 + (yy < 3 ? 1 : 0) + (hash(xx, yy) - 0.5) * 0.4);
  p.R('LEG').fill(makeRamp(0xe8dcc0, 4), (xx, yy) => 2.2 + (yy > 5 ? -1 : 0) + (hash(xx, yy) - 0.5) * 0.5);
  // silk: pale, glossy threads crossing
  const sl = p.R('SILK');
  sl.fill(makeRamp(0xf4eedc, 5, { spread: 0.35 }), (xx, yy) => 2.6 + (((xx + yy * 2) % 5) === 0 ? 1.2 : 0) + (((xx * 3 - yy) % 7) === 0 ? -0.8 : 0) + (sl.fbm(xx, yy, 2, 2, 4) - 0.5));
  paintCap(p.R('CAP'), base, 0xf0e8d0, 0xa89860);
}
const GRUB_KIT: KitDef = { key: 'carpet_grub', variants: 3, W: 128, H: 128, bones: bonesG, layout: layoutG, build: buildG, paint: paintG, sphere: [0, 0.06, 0, 0.32] };
function buildGrub(): Rig { return buildKitRig(GRUB_KIT, 0, 0.1); }

// ------------------------------------------------------------------ the loops: crawl, eat, sleep
interface GrubDrive { t: number; dt: number; speed: number; eat: number; sleep: number; dead: number; seed: number; flinch: number }
function poseGrub(K: KitRig, d: GrubDrive) {
  const P = K.parts, ud = K.kit.m as Record<string, number>, t = d.t, s7 = d.seed * 7;
  const mv = Math.min(1, d.speed / 0.12) * (1 - d.dead) * (1 - d.sleep);
  ud.cph = (ud.cph ?? 0) + d.dt * (0.6 + d.speed * 9);
  const sl = d.sleep;
  for (let i = 0; i < SEG; i++) {
    const s = P['s' + i]; if (!s) continue;
    const p0 = s.userData.p0 ?? { x: 0, y: 0, z: 0 };
    // the peristaltic wave: each segment lifts and bunches in turn, front to back
    const w = Math.sin(ud.cph * 3 - i * 0.9);
    const lift = mv * Math.max(0, w) * 0.012 + Math.sin(t * 1.3 + i * 0.6 + s7) * 0.002 * (1 - sl);
    s.position.set(p0.x, p0.y + lift, p0.z * (1 - mv * Math.max(0, w) * 0.18));
    // curled asleep: every joint turned the same way into a C; a slow sway awake
    s.rotation.set(-mv * w * 0.06, (i ? 1 : 0) * (sl * 0.42 + Math.sin(t * 0.5 + i * 0.7 + s7) * 0.05 * (1 - sl) + d.dead * 0.2), 0);
    const br = Math.sin(t * 0.9 + i * 0.3) * 0.02 * sl;
    s.scale.set(1 + br + mv * Math.max(0, -w) * 0.06, 1 + br, 1);
  }
  // the head: down to the carpet working the jaws when it eats; tucked in asleep; casting about awake
  const eat = d.eat * (1 - sl);
  P.head.rotation.set(0.45 * eat + Math.sin(t * 3.5) * 0.08 * eat - 0.1 * (1 - eat) * (1 - sl) + sl * 0.3, Math.sin(t * 0.7 + s7) * 0.4 * (1 - eat) * (1 - sl) + sl * 0.5, 0);
  for (const [sd, k] of [['L', 1], ['R', -1]] as const) P['jaw' + sd].rotation.set(0, k * (0.15 + Math.max(0, Math.sin(t * 9 + k)) * 0.5 * eat), 0);
  // the silk sheath grows round it as it settles, and shrinks back to nothing when it wakes
  const sk = Math.max(0.001, sl);
  P.silk.scale.set(sk, sk * (0.9 + Math.sin(t * 0.8) * 0.03), sk);
  P.silk.position.set(0.02, 0, -0.02);
  if (d.flinch > 0) P.s3.position.x += Math.sin(t * 70) * 0.008 * d.flinch;
}
function animateGrub(rig: Rig, c: Creature, t: number, dt: number) {
  const K = rig as KitRig;
  const v = Math.floor(hashId(c.id) * 3);
  if (K.kit.who !== c.id) { K.kit.who = c.id; kitPersonalize(K, v); }
  kitSync(K);
  const n = netOf(c), ud = K.kit.m as Record<string, number>;
  const sm = (k: string, to: number, r: number) => (ud[k] = (ud[k] ?? to) + (to - (ud[k] ?? to)) * Math.min(1, dt * r));
  poseGrub(K, { t, dt, speed: c.dead ? 0 : c.speed, eat: sm('ea', n.pn === 'eat' || n.md === 'eat' ? 1 : 0, 4), sleep: sm('sl', n.pn === 'sleep' || n.md === 'sleep' ? 1 : 0, 0.6), dead: c.dead ? 1 : 0, seed: hashId(c.id, 9), flinch: flinchOf(c) });
  if (n.yg) { K.root.scale.setScalar(0.6); ud.wasY = 1; } else if (ud.wasY) { K.root.scale.setScalar(1); ud.wasY = 0; }
  const F = K.kit.F.fx.value; F.y += dt; F.z = Math.min(1, c.hitFlash / 0.15) * 0.4;
  const p = localIn(c);
  if (p && !c.dead && c.visibleToLocal && dist(p, c) < 3.5) thinkOnce(p, 'carpet_grub', ['A grub as long as my arm. Its back is the carpet it ate: the same loops, the same stain.', 'It is spinning something pale round itself. It is going to sleep in it.'][Math.floor(t * 0.2) % 2], 100);
}

// ------------------------------------------------------------------ host brain: inch about, graze the carpet, curl up in silk
function thinkGrub(c: Creature, dt: number): boolean {
  const cs = CS(), z = zoneOf(c), m = c.mem, n = net(c);
  const ev = pulse(c);
  let touched = false;
  for (const p of playersIn(c.zoneKey)) if (dist(p, c) < 0.7 && (p.speed ?? 0) > 2) touched = true;
  // it cannot run: hurt or trodden near, it stops dead and curls (and is shaken out of its silk)
  if (ev.hurt > 0 || touched) { n.md = 'sleep'; m.mdT = 6; c.setState('idle'); c.stateT = 0; stop(c); if (c.noiseCooldown <= 0) { playAt('cower_squeak', c, 0.2, 6, 0.5); c.noiseCooldown = 3; } return true; }
  if (n.md === 'eat' || n.md === 'sleep') {
    stop(c);
    if (c.stateT > (m.mdT ?? 6)) { n.md = ''; c.setState('wander'); c.goal = null; }
    return true;
  }
  c.setState('wander');
  if (!c.goal || cs.moveTo(c, z, c.goal.x, c.goal.z, c.sp.walk, dt, 0.3) || c.stateT > 22) {
    if (c.goal && rng.chance(0.8)) { n.md = rng.chance(0.7) ? 'eat' : 'sleep'; m.mdT = n.md === 'sleep' ? rng.float(18, 40) : rng.float(6, 14); c.setState('idle'); return true; }
    c.goal = findSpot(c, { rMin: 1, rMax: 4 }) ?? cs.wanderSpot(c, z, 4);
    c.stateT = 0;
  }
  return true;
}

const GRUB = def({
  key: 'carpet_grub', name: 'Carpet Grub', code: 'LV-12 // FAUNA, LARVA (PILE-FEEDING)', temperament: 'peaceful', threat: 0,
  rule: { name: 'IT EATS THE FLOOR', text: 'Harmless and blind. A fat larva that eats carpet and paper and sleeps curled in its own silk. It cannot run; it curls up. Offer it paper and it follows the rustle.', tell: 'A grub as long as a forearm whose back is patterned like the carpet.' },
  hp: 10, walk: 0.1, run: 0.16, turn: 2, radius: 0.14, height: 0.12, sight: 2, fov: 3, hearing: 0.8,
  zones: ['lobby', 'office', 'hotel', 'house'], weight: 0.7, group: [1, 3], maxPerZone: 6, diet: 'none',
  meat: [['worm_meat', 1]],
  sounds: { hurt: 'cower_squeak', death: 'cower_die' },
  scan: { cls: 'Fauna / larva, pile-feeding', notes: ['A segmented larva as long as a forearm. Its back grows the pattern of the carpet it eats.', 'Eight pairs of stubby prolegs and a hard brown head capsule with working mandibles.', 'It sleeps curled in a loose sheath of its own silk: pale, glossy and very strong.', 'Two kept together breed. The silk unwinds into thread.'] },
  gore: { blood: 'pale', tint: 0xe8dcc0, flesh: 0xd8c898, sever: ['head', 's5', 's6'], head: 'head' },
  build: buildGrub, animate: animateGrub, think: thinkGrub,
});
GRUB.animateGallery = (rig: Rig, t: number) => {
  const q = new URLSearchParams(location.search).get('pose') || ['eat', 'crawl', 'sleep'][Math.floor(t / 5) % 3];
  const K = rig as KitRig; kitSync(K);
  const ud = K.kit.m as Record<string, number>;
  ud.gsl = (ud.gsl ?? 0) + ((q === 'sleep' ? 1 : 0) - (ud.gsl ?? 0)) * 0.025;
  ud.gea = (ud.gea ?? 0) + ((q === 'eat' ? 1 : 0) - (ud.gea ?? 0)) * 0.06;
  poseGrub(K, { t, dt: 1 / 60, speed: q === 'crawl' ? 0.1 : 0, eat: ud.gea, sleep: ud.gsl, dead: 0, seed: 0.6, flinch: 0 });
};
horrify(GRUB, { twitch: 0.2, snap: 0.08, parts: /head|jaw/ });

addInhabitant({
  id: 'carpet_grub', name: 'Carpet Grub', rank: 'sloth', class: 'Fauna', danger: 0,
  summary: 'A fat, segmented larva as long as a forearm whose back has grown into the pattern of the carpet it eats: the lobby\'s mustard loops, a band of office blue.',
  biology: 'Seven soft segments over eight pairs of stubby prolegs, a hard brown head capsule and a pair of working mandibles. It is blind; two pale eye-spots read light and dark. A spinneret under the lip draws a glossy pale silk that is stronger than cotton and does not stretch.',
  behaviour: 'It inches along in slow waves, grazing carpet pile and paper. It cannot run: frightened, it stops and curls. To sleep it curls into a C and spins a loose sheath round itself. Two kept together breed.',
  habitat: 'Carpeted levels: the lobby, the offices, the hotel corridors, the house.',
  lore: 'The bald tracks across the Level 0 carpet that go nowhere are grub trails. The Institute bought its first silk from an operator who had kept a jar of them for a year; the invoice is in the archive, marked "query".',
  harvest: [{ item: 'grub_silk', how: 'Unwind the silk from a sleeping grub, or collect the sheaths from a pen\'s straw.' }],
});
