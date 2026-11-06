import { horrify } from '../kit/horror';
import { def, Rig } from '../species';
import { makeRamp, mixHex } from '../../gfx/pixel';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import { queueAt } from '../../actions/basic';
import { UseObjectAction } from '../../actions/world';
import { createItem } from '../../items/factory';
import type { Creature } from '../creature';
import { CS, zoneOf, creatureMenu, poke, poked, pulse, stop, findSpot } from '../behaviors_a';
import { net, netOf, playAt, hashId, rng, localIn, thinkOnce, dist, playersIn } from '../behaviors_b';
import { KitDef, KitRig, BoneSpec, SkinB, BuildCtx, Page, V3, Wt, buildKitRig, kitSync, kitPersonalize, flinchOf, hash } from '../kit/humanoids';
import { chain, sac, paintCap, paintEye, paintFeathers } from '../kit/organic';
import '../../audio/sounds_creatures_c';

// =====================================================================================
// TALLOW PIGEON — a city pigeon that went over the Ledge and came back as a
// candle. Below the neck it has run down into a lumpy cone of warm tallow,
// the wings slumped into two long drips down its sides, a little puddle of
// itself spreading round its feet; the head is still a pigeon's, bobbing,
// orange-eyed, the neck still shot green and violet. It waddles on its own
// melt and pecks at crumbs. It does nothing else. In the warm it softens and
// sags; the crown of its head is a charred wick.
//   tallow_pigeon   skinned kit rig: wax cone with runnels, drip beads that crawl down,
//                   feathered head and neck, pink feet poking out of the puddle
// =====================================================================================

const SIDES = [['L', 1], ['R', -1]] as const;
function bonesP(v: number): BoneSpec[] {
  const s = 1 + v * 0.08;
  const b: BoneSpec[] = [
    { name: 'base', parent: '', at: [0, 0, 0] },
    { name: 'body', parent: 'base', at: [0, 0.12 * s, 0] },
    { name: 'neck', parent: 'body', at: [0, 0.13 * s, 0.025], cap: true },
    { name: 'head', parent: 'neck', at: [0, 0.065, 0.02], cap: true },
    { name: 'tail', parent: 'body', at: [0, 0.03, -0.08] },
  ];
  for (const [sd, k] of SIDES) {
    b.push({ name: 'wing' + sd, parent: 'body', at: [k * 0.06, 0.09 * s, -0.005] }, { name: 'wtip' + sd, parent: 'wing' + sd, at: [k * 0.02, -0.12 * s, -0.03] });
    b.push({ name: 'foot' + sd, parent: 'base', at: [k * 0.03, 0.012, 0.05] });
  }
  for (let i = 0; i < 4; i++) b.push({ name: 'drip' + i, parent: 'body', at: [Math.cos(i * 1.7 + 0.4) * 0.07, 0.06 - i * 0.01, Math.sin(i * 1.7 + 0.4) * 0.07] });
  return b;
}
function layoutP(p: Page) { p.reg('WAX', 48, 48); p.reg('NECK', 32, 16); p.reg('HEAD', 16, 16); p.reg('WING', 32, 32); p.reg('BEAK', 8, 8); p.reg('EYE', 8, 8); p.reg('FOOT', 8, 8); p.reg('WICK', 8, 8); p.reg('CAP', 8, 8); }
function buildP(B: SkinB, x: BuildCtx) {
  const bi = x.bi, R = x.R, v = x.variant, s = 1 + v * 0.08;
  const Bd = x.rest('body'), wB: Wt = [bi('body'), 1];
  // the cone: a puddle at the floor, a lumpy column of runnels, the feathered shoulders on top
  const pts: V3[] = [], rr: [number, number][] = [], ws: Wt[] = [];
  const prof: [number, number][] = [[0.004, 0.13], [0.015, 0.125], [0.03, 0.1], [0.06, 0.088], [0.1, 0.085], [0.15, 0.084], [0.2, 0.078], [0.24, 0.06], [0.265, 0.035]];
  prof.forEach(([y, r], i) => { pts.push([0, y * s, (i > 5 ? 0.012 : 0) - (i < 2 ? 0.01 : 0)]); rr.push([r * s, r * s * 0.95]); ws.push(y < 0.03 ? [bi('base'), 1] : wB); });
  sac(B, R('WAX'), 1, pts, rr, ws, { n: 18, up: [0, 0, 1], start: false,
    // runnels: vertical ridges that thicken toward the bottom, a sag on one side, lumps
    bump: (a, t) => Math.sin(a * 7 + v) * 0.07 * (1 - t) + Math.sin(a * 3 + 2) * 0.05 + (hash(Math.round(a * 3), Math.round(t * 9) + v) - 0.5) * 0.08 * (1 - t) });
  // a dribble of tail: the last of the tail feathers gone to a drip at the back
  const T = x.rest('tail');
  sac(B, R('WAX'), 2, [[T[0], T[1] + 0.03, T[2] + 0.02], T, [T[0], T[1] - 0.06, T[2] - 0.035], [T[0], T[1] - 0.1, T[2] - 0.04]], [[0.035, 0.02], [0.03, 0.018], [0.022, 0.014], [0.006, 0.005]], [[bi('tail'), 1], [bi('tail'), 1], [bi('tail'), 1], [bi('tail'), 1]], { n: 8 });
  // the wings: slumped into two long drips down the sides, feathered at the shoulder, wax below, the two black bars still there
  for (const [sd, k] of SIDES) {
    const w0 = x.rest('wing' + sd), w1 = x.rest('wtip' + sd);
    sac(B, R('WING'), 3, [[w0[0] - k * 0.01, w0[1] + 0.03, w0[2] + 0.02], w0, [(w0[0] + w1[0]) / 2 + k * 0.012, (w0[1] + w1[1]) / 2, (w0[2] + w1[2]) / 2], w1, [w1[0], w1[1] - 0.05, w1[2] - 0.01]],
      [[0.025, 0.03], [0.022, 0.05], [0.02, 0.045], [0.016, 0.03], [0.004, 0.006]], [[bi('wing' + sd), 1], [bi('wing' + sd), 1], [bi('wing' + sd), 0.5, bi('wtip' + sd), 0.5], [bi('wtip' + sd), 1], [bi('wtip' + sd), 1]], { n: 8, up: [k, 0, 0] });
    // feet poking out of the puddle
    const f = x.rest('foot' + sd), wf: Wt = [bi('foot' + sd), 1];
    for (let toe = -1; toe <= 1; toe++) sac(B, R('FOOT'), 4, [[f[0], f[1], f[2] - 0.01], [f[0] + toe * 0.012, f[1] - 0.004, f[2] + 0.02], [f[0] + toe * 0.02, f[1] - 0.008, f[2] + 0.035]], [[0.006, 0.005], [0.005, 0.004], [0.002, 0.002]], [wf, wf, wf], { n: 5 });
  }
  // drip beads crawling down the column
  for (let i = 0; i < 4; i++) {
    const d = x.rest('drip' + i), wd: Wt = [bi('drip' + i), 1];
    const o = [d[0] * 0.12, 0, d[2] * 0.12];
    sac(B, R('WAX'), 5 + i, [[d[0] + o[0], d[1] + 0.03, d[2] + o[2]], [d[0] + o[0], d[1], d[2] + o[2]], [d[0] + o[0], d[1] - 0.015, d[2] + o[2]]], [[0.006, 0.006], [0.013, 0.013], [0.004, 0.004]], [wd, wd, wd], { n: 6 });
  }
  // neck: iridescent, puffed; head: small and round with a white cere on the beak, orange eyes; the crown a charred wick
  const N = x.rest('neck'), H = x.rest('head');
  sac(B, R('NECK'), 10, [[N[0], N[1] - 0.04, N[2] - 0.01], N, [N[0], N[1] + 0.04, N[2] + 0.01]], [[0.05, 0.05], [0.046, 0.048], [0.032, 0.032]], [wB, [bi('neck'), 1], [bi('neck'), 0.5, bi('head'), 0.5]], { n: 12 });
  const wH: Wt = [bi('head'), 1];
  sac(B, R('HEAD'), 11, [[H[0], H[1], H[2] - 0.035], [H[0], H[1] + 0.008, H[2] - 0.005], [H[0], H[1] + 0.004, H[2] + 0.02], [H[0], H[1] - 0.004, H[2] + 0.035]], [[0.015, 0.02], [0.033, 0.034], [0.028, 0.028], [0.012, 0.012]], [wH, wH, wH, wH], { n: 10 });
  sac(B, R('BEAK'), 12, [[H[0], H[1] - 0.002, H[2] + 0.035], [H[0], H[1] - 0.004, H[2] + 0.05], [H[0], H[1] - 0.008, H[2] + 0.062]], [[0.009, 0.008], [0.006, 0.005], [0.0015, 0.0015]], [wH, wH, wH], { n: 6 });
  for (const [, k] of SIDES) sac(B, R('EYE'), 13, [[H[0] + k * 0.024, H[1] + 0.012, H[2] + 0.008], [H[0] + k * 0.03, H[1] + 0.012, H[2] + 0.012], [H[0] + k * 0.033, H[1] + 0.012, H[2] + 0.014]], [[0.006, 0.006], [0.008, 0.008], [0.002, 0.002]], [wH, wH, wH], { n: 6 });
  chain(B, x, R('WICK'), 14, { bones: ['head'], tip: [H[0], H[1] + 0.065, H[2] - 0.01], r: [0.004, 0.0015], n: 4, rings: 3, start: true });
}
function paintP(p: Page, x: BuildCtx) {
  const v = x.variant;
  const WAX = makeRamp([0xe8dcc0, 0xe0d4b0, 0xd8d0c8][v % 3], 7, { hueShift: 0.03, spread: 0.5 }), GREY = makeRamp([0x8a90a0, 0x7a8090, 0x9a9488][v % 3], 6, { spread: 0.5 });
  // wax: translucent-looking tallow, glossy runnels, the grey of the old feathers still clouded through the upper half
  const w = p.R('WAX');
  w.fill(WAX, (xx, yy) => 3.6 + Math.cos((w.deg(xx) * Math.PI) / 180) * 0.9 + Math.sin(xx * 0.9) * 0.4 + (w.fbm(xx, yy, 3, 2, 4 + v) - 0.5) * 1.2, undefined, 0.45);
  for (let yy = 0; yy < w.h * 0.45; yy++) for (let xx = 0; xx < w.w; xx++) if (w.fbm(xx, yy, 3, 2, 9) + (1 - yy / (w.h * 0.45)) * 0.6 > 0.95) w.put(xx, yy, GREY, 2.6 + Math.cos((w.deg(xx) * Math.PI) / 180) * 0.8, 0.5);
  for (let i = 0; i < 16; i++) w.vline(hash(i, 3) * w.w, hash(i, 4) * w.h * 0.6, w.h, 0xfff8e8, 0.35);
  for (let i = 0; i < 10; i++) w.blend(hash(i, 6) * w.w, hash(i, 7) * w.h, 0xffffff, 0.7);
  // wings: grey feathers at the shoulder with the two black bars, melting into wax toward the tip
  const wg = p.R('WING');
  paintFeathers(wg, GREY, { seed: 5 + v, rows: 6, cols: 6 });
  for (let yy = 0; yy < wg.h; yy++) for (let xx = 0; xx < wg.w; xx++) {
    if (yy === Math.round(wg.h * 0.35) || yy === Math.round(wg.h * 0.45)) wg.blend(xx, yy, 0x1a1a20, 0.8);
    if (yy > wg.h * 0.55) wg.put(xx, yy, WAX, 3.4 + (hash(xx, yy) - 0.5) * 0.8 + (yy - wg.h * 0.55) * 0.04, 0.6);
  }
  // neck: green and violet sheen over grey
  const nk = p.R('NECK');
  nk.fill(GREY, (xx, yy) => 2.8 + Math.cos((nk.deg(xx) * Math.PI) / 180) * 0.8 + (hash(xx, yy) - 0.5) * 0.6);
  for (let yy = 0; yy < nk.h; yy++) for (let xx = 0; xx < nk.w; xx++) nk.blend(xx, yy, (xx + yy) % 7 < 3 ? 0x3a9a6a : 0x8a4aa0, 0.35 + Math.sin(xx * 0.5) * 0.1);
  p.R('HEAD').fill(GREY, (xx, yy) => 3 + Math.cos((p.R('HEAD').deg(xx) * Math.PI) / 180) * 0.8 + (hash(xx, yy) - 0.5) * 0.5);
  p.R('BEAK').fill(makeRamp(0x3a3438, 4), (xx, yy) => (yy < 3 ? 3 : 1.4) + (hash(xx, yy) - 0.5) * 0.4);
  paintEye(p.R('EYE'), 0xe87a20, 0x0a0604, 0xc83a20);
  p.R('FOOT').fill(makeRamp(0xc87070, 4), (xx, yy) => 2 + (hash(xx, yy) - 0.5));
  p.R('WICK').fill(makeRamp(0x1a1410, 3), (xx, yy) => 1 + (yy < 2 ? 1 : 0));
  paintCap(p.R('CAP'), mixHex(0xe8dcc0, 0x8a90a0, 0.3), 0xe0d0b0, 0xa89070);
}
const PIGEON_KIT: KitDef = { key: 'tallow_pigeon', variants: 3, W: 128, H: 128, bones: bonesP, layout: layoutP, build: buildP, paint: paintP, sphere: [0, 0.18, 0, 0.3] };
function buildPigeon(): Rig { return buildKitRig(PIGEON_KIT, 0, 0.32); }

// ------------------------------------------------------------------ animation: the head-bob waddle, pecking, cooing, slow melt
interface PigeonDrive { t: number; dt: number; speed: number; peck: number; coo: number; dead: number; seed: number; flinch: number; dist: number }
function posePigeon(K: KitRig, d: PigeonDrive) {
  const P = K.parts, ud = K.kit.m as Record<string, number>, t = d.t, s7 = d.seed * 7;
  const mv = Math.min(1, d.speed / 0.3) * (1 - d.dead);
  ud.wph = (ud.wph ?? 0) + d.dt * d.speed * 26;
  const st = Math.sin(ud.wph);
  // the bob: the head shoots forward then holds still in space while the body catches up (a sawtooth)
  const saw = ((ud.wph / (Math.PI * 2)) % 1 + 1) % 1;
  const bob = mv * (saw < 0.3 ? saw / 0.3 : 1 - (saw - 0.3) / 0.7) * 0.03;
  P.body.rotation.set(0.05 * mv + d.peck * 0.35, 0, st * 0.12 * mv + Math.sin(t * 0.5 + s7) * 0.02);
  P.body.scale.set(1 + d.dead * 0.25 + Math.sin(t * 0.3 + s7) * 0.015, 1 - d.dead * 0.35 - Math.sin(t * 0.3 + s7) * 0.015, 1 + d.dead * 0.2);
  P.neck.position.set(0, (P.neck.userData.p0?.y ?? 0.13) + 0.004 * d.coo * Math.sin(t * 9), (P.neck.userData.p0?.z ?? 0.025) + bob);
  P.neck.scale.setScalar(1 + d.coo * (0.25 + Math.sin(t * 9) * 0.08));
  const pk = d.peck * Math.max(0, Math.sin(t * 7 + s7));
  P.neck.rotation.set(0.5 * d.peck + pk * 0.6 + d.dead * 0.9, Math.sin(t * 0.9 + s7) * 0.3 * (1 - d.peck) * (1 - mv), 0);
  P.head.rotation.set(-0.2 * d.peck + d.coo * 0.2 * Math.sin(t * 4.5), Math.sin(t * 2.3 + s7) > 0.7 ? 0.5 : -0.1, 0);
  for (const [sd, k] of SIDES) {
    P['wing' + sd].rotation.set(Math.sin(t * 0.8 + k) * 0.05, 0, k * (0.08 + 0.12 * mv * Math.max(0, k * st) + d.dead * 0.4));
    P['wtip' + sd].rotation.set(Math.sin(t * 1.1 + k * 2) * 0.08, 0, k * 0.05 * Math.sin(t * 0.7));
    const f = P['foot' + sd];
    f.position.set((f.userData.p0?.x ?? 0), 0.012 + Math.max(0, k * st) * 0.015 * mv, (f.userData.p0?.z ?? 0.05) + k * st * 0.025 * mv);
  }
  P.tail.rotation.set(-0.2 + Math.sin(t * 1.3) * 0.05, 0, st * 0.15 * mv);
  // drips crawl down the column and start again at the top
  for (let i = 0; i < 4; i++) {
    const o = P['drip' + i]; if (!o) continue;
    const c = ((t * (0.025 + i * 0.008) + i * 0.27 + d.seed) % 1);
    o.position.set(o.userData.p0.x * (1 + c * 0.35), o.userData.p0.y + 0.06 - c * 0.12, o.userData.p0.z * (1 + c * 0.35));
    o.scale.set(1, 0.6 + c * 1.2, 1);
  }
  if (d.flinch > 0) P.body.position.x += Math.sin(t * 80) * 0.01 * d.flinch;
}
function animatePigeon(rig: Rig, c: Creature, t: number, dt: number) {
  const K = rig as KitRig;
  const v = Math.floor(hashId(c.id) * 3);
  if (K.kit.who !== c.id) { K.kit.who = c.id; kitPersonalize(K, v); }
  kitSync(K);
  const n = netOf(c), ud = K.kit.m as Record<string, number>;
  const sm = (k: string, to: number, r: number) => (ud[k] = (ud[k] ?? to) + (to - (ud[k] ?? to)) * Math.min(1, dt * r));
  posePigeon(K, { t, dt, speed: c.dead ? 0 : c.speed, peck: sm('pk', n.md === 'peck' ? 1 : 0, 5), coo: sm('coo', n.md === 'coo' ? 1 : 0, 4), dead: c.dead ? 1 : 0, seed: hashId(c.id, 5), flinch: flinchOf(c), dist: 0 });
  const F = K.kit.F.fx.value; F.y += dt; F.z = Math.min(1, c.hitFlash / 0.15) * 0.4;
  const p = localIn(c);
  if (p && !c.dead && c.visibleToLocal && dist(p, c) < 4) thinkOnce(p, 'tallow_pigeon', ['A pigeon. From the neck down it is a candle. It is still bobbing its head.', 'It is standing in a puddle of itself. Its feet are poking out of the wax.'][Math.floor(t * 0.2) % 2], 100);
}

// ------------------------------------------------------------------ host brain: waddle, peck, coo, shuffle out of the way
function thinkPigeon(c: Creature, dt: number): boolean {
  const cs = CS(), z = zoneOf(c), m = c.mem, n = net(c);
  const ev = pulse(c);
  let near: { x: number; z: number; d: number } | null = null;
  for (const p of playersIn(c.zoneKey)) { const d = dist(p, c); if (d < 2.4 && (!near || d < near.d)) near = { x: p.x, z: p.z, d }; }
  if (ev.hurt > 0 || poked(c, 'scrape') || (near && near.d < 1.4)) { m.shoo = 2.5; m.from = near ?? { x: c.x, z: c.z }; }
  m.shoo = Math.max(0, (m.shoo ?? 0) - dt);
  if (m.shoo > 0) {
    n.md = ''; c.setState('flee');
    if (!c.goal || c.stateT > 3) { c.goal = cs.fleeSpot(c, z, m.from.x, m.from.z); c.stateT = 0; playAt('bird_flap', c, 0.4, 8, 0.6); }
    cs.moveTo(c, z, c.goal.x, c.goal.z, c.sp.run, dt, 0.4);
    return true;
  }
  if (n.md === 'peck' || n.md === 'coo') {
    stop(c);
    if (n.md === 'coo' && c.noiseCooldown <= 0) { playAt('birds_dream', c, 0.35, 9, 0.5 + rng.float(0, 0.1)); c.noiseCooldown = 3; }
    if (c.stateT > (m.mdT ?? 4)) { n.md = ''; c.setState('wander'); c.goal = null; }
    return true;
  }
  c.setState('wander');
  if (!c.goal || cs.moveTo(c, z, c.goal.x, c.goal.z, c.sp.walk, dt, 0.3) || c.stateT > 14) {
    if (c.goal && rng.chance(0.7)) { n.md = rng.chance(0.7) ? 'peck' : 'coo'; m.mdT = rng.float(3, 8); c.setState('idle'); return true; }
    c.goal = findSpot(c, { rMin: 1.5, rMax: 6 }) ?? cs.wanderSpot(c, z, 6);
    c.stateT = 0;
  }
  return true;
}

const PIGEON = def({
  key: 'tallow_pigeon', name: 'Tallow Pigeon', code: 'LG-03 // FAUNA, COLUMBID (LEDGE-EXPOSED)', temperament: 'skittish', threat: 0,
  rule: { name: 'IT ONLY MELTS', text: 'Harmless. A pigeon run down into a candle of its own tallow. It waddles, pecks and coos, and shuffles out of your way. Where pigeons have melted, the Ledge is close.', tell: 'A pigeon standing in a puddle of wax. From the neck down it is a candle.' },
  hp: 6, walk: 0.28, run: 0.7, turn: 6, radius: 0.12, height: 0.32, sight: 7, fov: 2.4, hearing: 1,
  zones: ['ledge', 'suburbs', 'parking', 'corrupt'], weight: 1, group: [2, 5], maxPerZone: 10, diet: 'none',
  meat: [['small_meat_raw', 1]],
  sounds: { hurt: 'cower_squeak', death: 'cower_die', idle: 'birds_dream' },
  scan: { cls: 'Fauna / columbid, Ledge-exposed', notes: ['A city pigeon from the neck up. Below that, a lumpy cone of warm tallow.', 'The wings have slumped into two long drips down its sides; its feet poke out of a puddle of itself.', 'It waddles, bobs, pecks and coos. It does nothing else.', 'The tallow scrapes off in warm curls: a slow, clean-burning fuel.'] },
  gore: { blood: 'pale', tint: 0xf0e0c0, flesh: 0xe8dcc0, sever: ['head', 'neck', 'wingL', 'wingR'], head: 'head' },
  build: buildPigeon, animate: animatePigeon, think: thinkPigeon,
});
creatureMenu('tallow_pigeon', (p, c, opts) => {
  opts.push({
    label: 'Scrape tallow', action: () => queueAt(p, c.x, c.z, new UseObjectAction(p, 'Scrape', 1.6, 'pickup', () => {
      if (!CS().creatures.has(c.id) || c.dead) return;
      const key = 'tallow:' + c.id, now = G.time;
      poke(p, c, 'scrape');
      if (((p as any)[key] ?? -1e9) > now - 150) { bus.emit('think', p, 'There is hardly any of it left. It needs to melt some more.'); return; }
      (p as any)[key] = now;
      p.inv.add(createItem('pigeon_tallow'));
      bus.emit('inventoryChanged', p);
      bus.emit('think', p, ['Warm curls of tallow. It cooed at me the whole time.', 'It is still warm. It smells like a church.'][Math.floor(Math.random() * 2)]);
    }), 0.6, false),
  });
});
PIGEON.animateGallery = (rig: Rig, t: number) => {
  const q = new URLSearchParams(location.search).get('pose') || ['walk', 'peck', 'coo'][Math.floor(t / 4) % 3];
  const K = rig as KitRig; kitSync(K);
  posePigeon(K, { t, dt: 1 / 60, speed: q === 'walk' ? 0.28 : 0, peck: q === 'peck' ? 1 : 0, coo: q === 'coo' ? 1 : 0, dead: 0, seed: 0.2, flinch: 0, dist: 0 });
};
horrify(PIGEON, { twitch: 0.3, snap: 0.15, parts: /head|neck/ });
