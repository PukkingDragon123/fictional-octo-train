import { horrify } from '../kit/horror';
import { def, Rig } from '../species';
import { makeRamp } from '../../gfx/pixel';
import { bus } from '../../core/events';
import { queueAt } from '../../actions/basic';
import { UseObjectAction } from '../../actions/world';
import { createItem } from '../../items/factory';
import { G } from '../../game/G';
import type { Creature } from '../creature';
import { CS, zoneOf, creatureMenu, poke, poked, pulse, stop, faceTo, wallSpotsNear } from '../behaviors_a';
import { net, netOf, hashId, fakeCreature, rng, playersIn, dist, localIn, thinkOnce } from '../behaviors_b';
import { KitDef, KitRig, BoneSpec, SkinB, BuildCtx, Page, V3, Wt, buildKitRig, kitSync, hash, flinchOf } from '../kit/humanoids';
import { chain, sac, paintSkin, paintCap } from '../kit/organic';
import '../../audio/sounds_creatures_c';

// =====================================================================================
// WALLPAPER GRAZER — a pale slug the length of a forearm, flat as a tongue,
// whose mantle is patterned like the paper it eats. It grazes the bottom of
// the walls in slow circuits, rearing its front half up against the paper and
// rasping a clean, wet stripe of plaster. Touched, it pulls everything in.
// Harmless; the one thing in Level 0 the Mulchers will not lay near. Its
// mucus sets into a strong clear glue (harvest: grazer_mucus).
// =====================================================================================

const SEG = 6;
function bonesP(): BoneSpec[] {
  const b: BoneSpec[] = [{ name: 'base', parent: '', at: [0, 0, 0] }, { name: 's0', parent: 'base', at: [0, 0.03, -0.2] }];
  for (let i = 1; i < SEG; i++) b.push({ name: 's' + i, parent: 's' + (i - 1), at: [0, 0, 0.075], cap: i === SEG - 1 });
  const H = 's' + (SEG - 1);
  for (const [s, k] of [['L', 1], ['R', -1]] as const) {
    b.push({ name: 'eA' + s, parent: H, at: [k * 0.022, 0.025, 0.035] }, { name: 'eB' + s, parent: 'eA' + s, at: [k * 0.008, 0.045, 0.01] });
    b.push({ name: 'tA' + s, parent: H, at: [k * 0.03, -0.008, 0.05] }, { name: 'tB' + s, parent: 'tA' + s, at: [k * 0.01, -0.004, 0.022] });
  }
  return b;
}
function layoutP(p: Page) { p.reg('FOOT', 32, 48); p.reg('MANTLE', 48, 32); p.reg('STALK', 8, 16); p.reg('EYE', 8, 8); p.reg('MOUTH', 8, 8); p.reg('CAP', 8, 8); }
function buildP(B: SkinB, x: BuildCtx) {
  const bi = x.bi, R = x.R;
  const S = (i: number) => bi('s' + Math.max(0, Math.min(SEG - 1, i)));
  // the foot: one long muscle, flat, tapering to a point behind, a rounded lip in front, the fringe flared
  const bones = Array.from({ length: SEG }, (_, i) => 's' + i);
  chain(B, x, R('FOOT'), 1, { bones, tipLen: 0.04, r: (t) => 0.012 + Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.9) * 0.05, flat: 0.45, n: 12, rings: 3, start: true, end: true,
    bump: (a, t) => (Math.abs(a) > 2.2 ? 0.25 : 0) + Math.sin(t * 60) * 0.03, up: [0, 1, 0] });
  // the mantle: a raised, wrinkled saddle over the front half, patterned like the wallpaper it eats
  const m: V3[] = [], mr: [number, number][] = [], mw: Wt[] = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6, s = 1.4 + t * 3.0, si = Math.floor(s), f = s - si;
    const p0 = x.rest('s' + Math.min(SEG - 1, si)), p1 = x.rest('s' + Math.min(SEG - 1, si + 1));
    m.push([0, p0[1] + 0.018 + Math.sin(t * Math.PI) * 0.01, p0[2] + (p1[2] - p0[2]) * f]);
    const r = Math.sin(Math.max(0.12, t) * Math.PI) * 0.048 + 0.006;
    mr.push([r, r * 0.55]);
    mw.push(f < 0.5 ? [S(si), 1 - f, S(si + 1), f] : [S(si), 1 - f, S(si + 1), f]);
  }
  sac(B, R('MANTLE'), 2, m, mr, mw, { n: 12, up: [0, 1, 0], bump: (a, t) => Math.sin(a * 5 + t * 30) * 0.08 + Math.sin(t * 70) * 0.05 });
  // a breathing pore on the right side of the mantle
  const pp = x.rest('s3');
  sac(B, R('MOUTH'), 3, [[-0.034, pp[1] + 0.02, pp[2] + 0.02], [-0.04, pp[1] + 0.02, pp[2] + 0.022]], [[0.008, 0.006], [0.004, 0.003]], [[S(3), 1], [S(3), 1]], { n: 6 });
  // eye stalks: two long upper, knobbed; two short lower feelers
  for (const s of ['L', 'R']) {
    chain(B, x, R('STALK'), 4, { bones: ['eA' + s, 'eB' + s], tipLen: 0.012, r: [0.006, 0.0035], n: 6, rings: 3, end: false });
    const e = x.rest('eB' + s);
    sac(B, R('EYE'), 5, [[e[0], e[1] + 0.008, e[2]], [e[0], e[1] + 0.016, e[2] + 0.002], [e[0], e[1] + 0.023, e[2] + 0.003]], [[0.005, 0.005], [0.0075, 0.0075], [0.002, 0.002]], [[bi('eB' + s), 1], [bi('eB' + s), 1], [bi('eB' + s), 1]], { n: 6 });
    chain(B, x, R('STALK'), 6, { bones: ['tA' + s, 'tB' + s], tipLen: 0.008, r: [0.005, 0.002], n: 5, rings: 2 });
  }
  // the mouth under the lip: a dark rasping slot
  const hp = x.rest('s' + (SEG - 1));
  sac(B, R('MOUTH'), 7, [[0, hp[1] - 0.012, hp[2] + 0.03], [0, hp[1] - 0.012, hp[2] + 0.045]], [[0.016, 0.004], [0.01, 0.003]], [[S(SEG - 1), 1], [S(SEG - 1), 1]], { n: 6 });
}
function paintP(p: Page) {
  // the foot: cream, wet, translucent at the edges, a darker gut line showing through
  const ft = p.R('FOOT');
  paintSkin(ft, makeRamp(0xe0d4a8, 7, { hueShift: 0.04, spread: 0.6 }), { seed: 3, veins: 3, vein: 0xb0a070, mottle: 0.8, glint: 18 });
  for (let yy = 0; yy < ft.h; yy++) ft.blend(ft.w / 2, yy, 0x8a7a48, 0.4);
  for (let i = 0; i < 40; i++) ft.blend(hash(i, 2) * ft.w, hash(i, 3) * ft.h, 0xf8f0d0, 0.6);
  // the mantle: Level 0 wallpaper, mimicked in skin: mono-yellow, faint chevrons and stripes, a damp sheen
  const mt = p.R('MANTLE');
  mt.fill(makeRamp(0xb4a24a, 7, { hueShift: 0.03, spread: 0.7 }), (xx, yy) => 3.4 + (mt.fbm(xx, yy, 3, 2, 9) - 0.5) * 1.2 + (((xx + Math.abs((yy % 8) - 4)) % 6) < 1 ? -1 : 0) + ((xx % 12) < 1 ? 0.8 : 0));
  for (let i = 0; i < 14; i++) mt.blend(hash(i, 5) * mt.w, hash(i, 6) * mt.h, 0x8a7a30, 0.5);
  for (let i = 0; i < 10; i++) mt.set(hash(i, 7) * mt.w, hash(i, 8) * mt.h, 0xfff8d0);
  p.R('STALK').fill(makeRamp(0xb8b090, 4), (xx, yy) => 2 + (yy / 16) - (xx & 1) * 0.3);
  const ey = p.R('EYE'); ey.fill(makeRamp(0x1a1a14, 3), () => 1); ey.set(3, 3, 0xffffff); ey.set(4, 2, 0x8a8a70);
  p.R('MOUTH').fill(makeRamp(0x3a2010, 3), (xx) => 1 + (xx & 1) * 0.5);
  paintCap(p.R('CAP'), 0xc8b450, 0xe0d4a8, 0x5a4a20);
}
const GRAZER_KIT: KitDef = { key: 'paper_grazer', variants: 1, W: 128, H: 128, bones: bonesP, layout: layoutP, build: buildP, paint: paintP, sphere: [0, 0.05, 0, 0.35] };
function buildGrazer(): Rig { return buildKitRig(GRAZER_KIT, 0, 0.1); }

// ------------------------------------------------------------------ animation: peristalsis, a sinuous track, rearing to graze, pulling in when touched
function animateGrazer(rig: Rig, c: Creature, t: number, dt: number) {
  const K = rig as KitRig;
  kitSync(K);
  const P = rig.parts, n = netOf(c), seed = hashId(c.id);
  const ud = rig.root.userData as Record<string, number>;
  const sm = (k: string, v: number, rate: number) => (ud[k] = (ud[k] ?? v) + (v - (ud[k] ?? v)) * Math.min(1, dt * rate));
  const graze = sm('gz', n.md === 'graze' ? 1 : 0, 1.5), shrink = sm('sh', n.sh ? 1 : 0, n.sh ? 8 : 0.8);
  const mv = Math.min(1, c.speed / 0.15);
  ud.ph = (ud.ph ?? seed * 10) + dt * (1.2 + mv * 3.5) * (1 - shrink);
  for (let i = 0; i < SEG; i++) {
    const s = P['s' + i]; if (!s) continue;
    // a contraction wave running tail to head along the sole; the body snakes a little behind the head
    const w = Math.sin(ud.ph * 2 - i * 1.1);
    const front = Math.max(0, i - (SEG - 4)) / 3; // 0 behind, 1 at the head
    const rear = graze * front * (0.55 + Math.sin(t * 0.7 + seed) * 0.08);
    s.rotation.set(-rear * 0.9 + (i === SEG - 1 ? graze * Math.sin(t * 9) * 0.06 : 0), Math.sin(ud.ph * 0.6 - i * 0.7 + seed * 3) * 0.12 * (0.4 + mv), 0);
    // (spacing, not scale: scale would compound down the chain)
    if (i > 0) s.position.z = 0.075 * (1 + w * 0.12 * (0.3 + mv) - shrink * 0.4);
    s.position.y = i > 0 ? Math.max(0, w) * 0.003 * (1 - shrink) : 0.03 - shrink * 0.004;
  }
  // eye stalks: questing, retracted when touched or when it rasps hard
  for (const [s, k] of [['L', 1], ['R', -1]] as const) {
    const out = Math.max(0.15, 1 - shrink * 0.9 - graze * 0.2);
    const ea = P['eA' + s]; if (ea) { ea.scale.set(1, out, 1); ea.rotation.set(-0.3 + Math.sin(t * 0.9 + k + seed * 4) * 0.25 + graze * 0.4, k * Math.sin(t * 0.6 + k * 2) * 0.35, k * 0.2); }
    P['eB' + s]?.rotation.set(Math.sin(t * 1.3 + k * 3) * 0.3, 0, k * Math.sin(t * 0.8 + seed) * 0.2);
    P['tA' + s]?.rotation.set(0.3 + Math.sin(t * 2.1 + k) * 0.2 + graze * 0.3, k * 0.3, 0);
    P['tB' + s]?.rotation.set(Math.sin(t * 3 + k) * 0.3, 0, 0);
  }
  rig.body.scale.set(1 + shrink * 0.25, 1 + shrink * 0.35, 1);
  const fl = flinchOf(c);
  rig.body.position.y = fl > 0 ? Math.sin(t * 60) * 0.004 * fl : 0;
  const F = K.kit.F.fx.value; F.y += dt; F.z = Math.min(1, c.hitFlash / 0.15) * 0.4;
  const p = localIn(c);
  if (p && c.visibleToLocal && Math.hypot(p.x - c.x, p.z - c.z) < 3) thinkOnce(p, 'grazer', ['A slug the colour of the wallpaper. It is eating the wallpaper.', 'It leaves a clean wet stripe behind it, like a path.'][Math.floor(t * 0.2) % 2], 90);
}

// ------------------------------------------------------------------ host brain: slow circuits along the walls
function thinkGrazer(c: Creature, dt: number): boolean {
  const n = net(c), m = c.mem, z = zoneOf(c);
  const ev = pulse(c);
  // touched, hit, or someone running right past: everything pulls in
  if (poked(c, 'scrape') || poked(c, 'poke') || ev.hurt > 0) m.shT = 6;
  for (const p of playersIn(c.zoneKey)) if (dist(p, c) < 1.1 && (p.speed ?? 0) > 2.5) m.shT = Math.max(m.shT ?? 0, 3);
  m.shT = Math.max(0, (m.shT ?? 0) - dt);
  n.sh = m.shT > 0 ? 1 : 0;
  if (n.sh) { stop(c); n.md = ''; return true; }
  m.t = (m.t ?? 0) - dt;
  if (n.md === 'graze') {
    stop(c);
    if (m.wx !== undefined) faceTo(c, c.x - m.wx, c.z - m.wz);
    if (m.t <= 0) { n.md = ''; m.goal = null; }
    return true;
  }
  if (!m.goal || m.t < -40) {
    // the next stretch of wall along the circuit, a few metres on
    const ws = wallSpotsNear(z, c.x, c.z, 5).filter((w) => Math.hypot(w.x - c.x, w.z - c.z) > 1.2);
    const w = ws.length ? ws[Math.floor(rng.float(0, ws.length))] : null;
    if (!w) { stop(c); return true; }
    m.goal = { x: w.x + w.nx * 0.25, z: w.z + w.nz * 0.25, nx: w.nx, nz: w.nz }; m.t = 0;
  }
  if (CS().moveTo(c, z, m.goal.x, m.goal.z, c.sp.walk, dt, 0.15)) {
    n.md = 'graze'; m.wx = m.goal.nx; m.wz = m.goal.nz; m.t = rng.float(8, 18); m.goal = null;
  }
  return true;
}

const GRAZER = def({
  key: 'paper_grazer', name: 'Wallpaper Grazer', code: 'IN-12 // FAUNA, GRAZER', temperament: 'peaceful', threat: 0,
  rule: { name: 'IT ALWAYS COMES BACK', text: 'Harmless. It grazes the walls in circuits that always close: follow its clean stripe and you come back to where you started. Mulchers will not lay near one.', tell: 'Something the colour of the wallpaper is moving along the bottom of the wall.' },
  hp: 8, walk: 0.12, run: 0.2, turn: 1.2, radius: 0.12, height: 0.08, sight: 3, fov: 1.5, hearing: 0.6,
  zones: ['lobby', 'house', 'office'], weight: 1, group: [1, 2], maxPerZone: 6, diet: 'none',
  meat: [['small_meat_raw', 1]],
  sounds: { hurt: 'cower_squeak', death: 'cower_die' },
  scan: { cls: 'Fauna / grazer', notes: ['A pale slug, flat as a tongue, its back patterned exactly like the wallpaper it eats.', 'It rasps a clean, wet stripe along the bottom of the walls.', 'Touched, it pulls in its eyes and shrinks.', 'Its mucus sets into a strong clear glue.'] },
  gore: { blood: 'pale', flesh: 0xe0d4a8, gib: true },
  build: buildGrazer, animate: animateGrazer, think: thinkGrazer,
});
creatureMenu('paper_grazer', (p, c, opts) => {
  const n = netOf(c);
  if (n.sh) return;
  opts.push({
    label: 'Scrape glue off it', action: () => queueAt(p, c.x, c.z, new UseObjectAction(p, 'Scrape', 2, 'pickup', () => {
      if (!CS().creatures.has(c.id) || c.dead) return;
      const key = 'gz:' + c.id, now = G.time;
      poke(p, c, 'scrape');
      if (((p as any)[key] ?? -1e9) > now - 120) { bus.emit('think', p, 'Nothing left on it but skin. It needs time.'); return; }
      (p as any)[key] = now;
      p.inv.add(createItem('grazer_mucus'));
      bus.emit('inventoryChanged', p);
      bus.emit('think', p, ['It shrank right down. The glue is already setting on my fingers.', 'Sorry. Sorry. There. Done.'][Math.floor(Math.random() * 2)]);
    }), 0.8, false),
  });
});
GRAZER.animateGallery = (rig: Rig, t: number) => {
  const q = new URLSearchParams(location.search).get('pose') || 'graze';
  animateGrazer(rig, fakeCreature(GRAZER, { id: 'pg', speed: q === 'walk' ? 0.12 : 0, mem: { netMem: { md: q === 'graze' ? 'graze' : '', sh: q === 'shrink' ? 1 : 0 } } }), t, 1 / 60);
};
horrify(GRAZER, { twitch: 0.2, snap: 0.05 });
