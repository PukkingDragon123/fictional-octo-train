import { def, Rig } from '../species';
import { makeRamp } from '../../gfx/pixel';
import { G } from '../../game/G';
import type { Creature } from '../creature';
import type { Player } from '../../entities/player';
import type { Zone } from '../../world/zone';
import {
  net, netOf, snd, playersIn, dist, hold, face, hashId, fakeCreature, rng, playAt, live, lightAt, beamOn, localIn, thinkOnce, pickReach, angleDiff,
} from '../behaviors_b';
import { pulse } from '../behaviors_a';
import {
  KitDef, KitRig, BoneSpec, SkinB, BuildCtx, Page, Region, V3, Wt, buildKitRig, kitSync, kitPersonalize, frames, pathFrames, ellipsoid, tube,
  wLerp, gauss, lostParts, attackCurve, flinchOf, hash, offset, nearestSurvivor, lookAngles,
} from '../kit/humanoids';
import { defDread } from '../dread';
import '../../audio/sounds_creatures_c';

// =====================================================================================
// GLOAM — what you see of it is eyes and teeth. The rest is a darker part of
// the dark: a long, low body that walks on its knuckles, the colour of the
// back of a closet. The eyes throw your light back, green-yellow, too many of
// them and at the wrong heights; the mouth goes most of the way round its
// head and widens while it watches you. It cannot stand light: put a beam on
// it and it is gone, hissing. It comes closer every time your light stutters.
// =====================================================================================

const EYES: [number, number][][] = [
  [[-0.045, 0.05], [0.05, 0.035]],
  [[-0.05, 0.035], [0.025, 0.07], [0.06, 0.02]],
  [[-0.06, 0.03], [-0.03, 0.075], [0.035, 0.06], [0.065, 0.015]],
];
function bonesG(v: number): BoneSpec[] {
  const b: BoneSpec[] = [
    { name: 'pelvis', parent: '', at: [0, 0.74, -0.28] },
    { name: 'spine', parent: 'pelvis', at: [0, 0.06, 0.26] },
    { name: 'chest', parent: 'spine', at: [0, 0.08, 0.28], cap: true },
    { name: 'neck', parent: 'chest', at: [0, 0.04, 0.18], cap: true },
    { name: 'head', parent: 'neck', at: [0, 0.0, 0.16], cap: true },
    { name: 'jaw', parent: 'head', at: [0, -0.05, 0.02] },
  ];
  // always four eye bones (every variant shares one skeleton); the spare ones sit inside the head
  for (let i = 0; i < 4; i++) { const e = EYES[v % 3][i]; b.push({ name: 'eye' + i, parent: 'head', at: e ? [e[0], e[1], 0.1] : [0, 0, 0] }); }
  for (const [s, k] of [['L', 1], ['R', -1]] as const) {
    b.push(
      { name: 'arm' + s, parent: 'chest', at: [k * 0.17, -0.02, 0.02], cap: true },
      { name: 'fore' + s, parent: 'arm' + s, at: [0, -0.44, 0], cap: true },
      { name: 'hand' + s, parent: 'fore' + s, at: [0, -0.42, 0], cap: true },
      { name: 'thigh' + s, parent: 'pelvis', at: [k * 0.13, -0.04, 0], cap: true },
      { name: 'shin' + s, parent: 'thigh' + s, at: [0, -0.38, 0], cap: true },
      { name: 'foot' + s, parent: 'shin' + s, at: [0, -0.34, 0] },
    );
  }
  return b;
}
function layoutG(p: Page) {
  p.reg('BODY', 72, 64);
  p.reg('HEAD', 56, 40);
  p.reg('ARM', 18, 88, [-0.9, 0.03]);
  p.reg('LEG', 18, 76, [-0.76, 0.05]);
  p.reg('PAW', 16, 16);
  p.reg('EYE', 8, 8);
  p.reg('TOOTH', 8, 8);
  p.reg('GUM', 8, 8);
  p.reg('CAP', 16, 16);
}

function buildG(B: SkinB, x: BuildCtx) {
  const bi = x.bi, R = x.R;
  // a long low body, the spine standing out along the top
  const pts: V3[] = [[0, 0.7, -0.42], [0, 0.76, -0.28], [0, 0.82, -0.08], [0, 0.88, 0.12], [0, 0.92, 0.3], [0, 0.93, 0.42], [0, 0.92, 0.5]];
  const rad: [number, number][] = [[0.05, 0.05], [0.14, 0.13], [0.15, 0.13], [0.16, 0.15], [0.19, 0.16], [0.15, 0.12], [0.07, 0.07]];
  const W: Wt[] = [[bi('pelvis'), 1], [bi('pelvis'), 1], wLerp(0.5, 0, 1, bi('pelvis'), bi('spine')), [bi('spine'), 1], wLerp(0.5, 0, 1, bi('spine'), bi('chest')), [bi('chest'), 1], [bi('chest'), 0.5, bi('neck'), 0.5]];
  const fr = pathFrames(pts, rad, W, [1, 0, 0]);
  for (const f of fr) f.bump = (a) => gauss(Math.abs(a), Math.PI / 2, 0.25) * 0.18 * Math.max(0, Math.sin(f.c[2] * 50)) + gauss(a, -Math.PI / 2, 0.6) * 0.05;
  frames(B, fr, 10, R('BODY'), 1, { start: true, end: true });
  const np = x.rest('neck'), hp = x.rest('head');
  frames(B, pathFrames([[0, np[1] - 0.01, np[2] - 0.06], np, [hp[0], hp[1], hp[2] - 0.05]], [[0.08, 0.08], [0.065, 0.06], [0.07, 0.065]], [[bi('chest'), 0.5, bi('neck'), 0.5], [bi('neck'), 1], [bi('neck'), 0.5, bi('head'), 0.5]], [1, 0, 0]), 8, R('BODY'), 2);
  // the head: wide and flat, most of it mouth
  ellipsoid(B, [hp[0], hp[1] + 0.02, hp[2] + 0.02], [0.12, 0.075, 0.11], 12, 6, R('HEAD'), [bi('head'), 1], 3);
  ellipsoid(B, [hp[0], hp[1] - 0.045, hp[2] + 0.03], [0.11, 0.035, 0.1], 10, 4, R('HEAD'), [bi('jaw'), 1], 4);
  // gums, dark, and the teeth, which catch whatever light there is
  const teeth = (y0: number, jaw: boolean) => {
    const J = jaw ? bi('jaw') : bi('head');
    for (let i = 0; i < 15; i++) {
      const a = -1.25 + (2.5 * i) / 14;
      const rx = 0.112, rz = 0.104;
      const c: V3 = [hp[0] + Math.sin(a) * rx, hp[1] + y0, hp[2] + 0.03 + Math.cos(a) * rz];
      const h = 0.022 + (i % 3 === 1 ? 0.012 : 0) + (Math.abs(i - 7) < 2 ? 0.006 : 0);
      B.box([c[0], c[1] + (jaw ? h / 2 : -h / 2), c[2]], [0.011, h, 0.01], null, R('TOOTH'), [J, 1], [0, 0, 1, 1], 1, 0.55);
    }
    B.box([hp[0], hp[1] + y0 + (jaw ? -0.004 : 0.004), hp[2] + 0.06], [0.2, 0.008, 0.12], null, R('GUM'), [J, 1]);
  };
  teeth(-0.012, false);
  teeth(-0.03, true);
  // the eyes: too many, at the wrong heights; they shine
  EYES[x.variant % 3].forEach((_e, i) => {
    const ep = x.rest('eye' + i);
    B.box([ep[0], ep[1], ep[2]], [0.034, 0.022, 0.012], null, R('EYE'), [bi('eye' + i), 1], [0, 0, 1, 1], 1, 1.7);
  });
  for (const [s, k] of [['L', 1], ['R', -1]] as const) {
    const U = bi('arm' + s), F = bi('fore' + s), H = bi('hand' + s);
    const at = x.rest('arm' + s);
    const arm = [{ y: 0.03, rx: 0.06, rf: 0.06, rb: 0.06 }, { y: -0.05, rx: 0.065, rf: 0.065, rb: 0.07 }, { y: -0.4, rx: 0.04, rf: 0.04, rb: 0.045 }, { y: -0.45, rx: 0.048, rf: 0.045, rb: 0.05 }, { y: -0.84, rx: 0.03, rf: 0.03, rb: 0.03 }, { y: -0.88, rx: 0.036, rf: 0.036, rb: 0.036 }];
    tube(B, { rows: arm, ys: [0.03, -0.05, -0.2, -0.36, -0.42, -0.48, -0.62, -0.76, -0.84, -0.88], n: 7, reg: R('ARM'), vr: R('ARM').range, at, mirror: k, g: 10 + (k > 0 ? 0 : 1), w: (y) => (y > -0.36 ? [U, 1] : y > -0.48 ? wLerp(y, -0.36, -0.48, U, F) : y > -0.82 ? [F, 1] : [F, 0.5, H, 0.5]) });
    const hpp = x.rest('hand' + s);
    ellipsoid(B, [hpp[0], hpp[1] - 0.03, hpp[2] + 0.02], [0.05, 0.035, 0.06], 8, 4, R('PAW'), [H, 1], 20 + (k > 0 ? 0 : 1));
    const T = bi('thigh' + s), Sh = bi('shin' + s), Ft = bi('foot' + s);
    const lt = x.rest('thigh' + s);
    const leg = [{ y: 0.05, rx: 0.07, rf: 0.07, rb: 0.08 }, { y: -0.04, rx: 0.08, rf: 0.08, rb: 0.085 }, { y: -0.34, rx: 0.05, rf: 0.055, rb: 0.05 }, { y: -0.4, rx: 0.055, rf: 0.06, rb: 0.05 }, { y: -0.72, rx: 0.035, rf: 0.035, rb: 0.04 }];
    tube(B, { rows: leg, ys: [0.05, -0.04, -0.18, -0.32, -0.38, -0.44, -0.58, -0.72], n: 7, reg: R('LEG'), vr: R('LEG').range, at: lt, mirror: k, g: 30 + (k > 0 ? 0 : 1), w: (y) => (y > -0.32 ? [T, 1] : y > -0.44 ? wLerp(y, -0.32, -0.44, T, Sh) : [Sh, 1]) });
    const fp = x.rest('foot' + s);
    ellipsoid(B, [fp[0], fp[1] + 0.02, fp[2] + 0.05], [0.05, 0.03, 0.09], 8, 4, R('PAW'), [Ft, 1], 36 + (k > 0 ? 0 : 1));
  }
}

function paintG(p: Page, x: BuildCtx) {
  // the back of a closet: near-black with a faint bruise-blue sheen where light grazes it
  const SK = makeRamp(0x14141c, 7, { hueShift: 0.08, spread: 0.7 });
  const fill = (r: Region, sd: number) => r.fill(SK, (xx, yy) => 2 + Math.sin((xx / r.w) * Math.PI * 2) * 1 + (r.fbm(xx, yy, 3, 2, sd) - 0.5) * 1.6 + (hash(xx, yy + sd) < 0.04 ? 2 : 0));
  fill(p.R('BODY'), 3);
  { const r = p.R('BODY'); for (let yy = 0; yy < r.h; yy += 4) for (let xx = 0; xx < 3; xx++) r.blend(Math.round(r.w * 0.25) + xx, yy, SK[5], 0.5); }
  fill(p.R('HEAD'), 5); fill(p.R('ARM'), 7); fill(p.R('LEG'), 9); fill(p.R('PAW'), 11);
  {
    const r = p.R('EYE');
    for (let yy = 0; yy < r.h; yy++) for (let xx = 0; xx < r.w; xx++) {
      const d = Math.hypot(xx + 0.5 - 4, yy + 0.5 - 4) / 4;
      r.set(xx, yy, Math.abs(xx + 0.5 - 4) < 0.8 && d < 0.8 ? 0x1a2008 : d < 0.5 ? 0xf8ffb0 : d < 0.85 ? 0xb8e050 : 0x5a7820);
    }
  }
  { const r = p.R('TOOTH'); for (let yy = 0; yy < r.h; yy++) for (let xx = 0; xx < r.w; xx++) r.set(xx, yy, yy < 2 ? 0x8a8070 : xx === 0 ? 0xb8b0a0 : 0xe8e2d0); }
  { const r = p.R('GUM'); for (let yy = 0; yy < r.h; yy++) for (let xx = 0; xx < r.w; xx++) r.set(xx, yy, hash(xx, yy) < 0.3 ? 0x2a0a10 : 0x180608); }
  {
    const r = p.R('CAP');
    for (let yy = 0; yy < r.h; yy++) for (let xx = 0; xx < r.w; xx++) {
      const d = Math.hypot(xx + 0.5 - r.w / 2, yy + 0.5 - r.h / 2) / (r.w / 2);
      r.set(xx, yy, d > 0.86 ? SK[3] : hash(xx, yy) < 0.2 ? 0x2a1020 : 0x0a0408);
    }
  }
}

const GLOAM_KIT: KitDef = { key: 'gloam', variants: 3, bones: bonesG, layout: layoutG, build: buildG, paint: paintG, sphere: [0, 0.6, 0, 1.2] };
function buildGloam(): Rig { return buildKitRig(GLOAM_KIT, 0, 1.0); }

// ------------------------------------------------------------------ animation
function animateGloam(rig: Rig, c: Creature, t: number, dt: number) {
  const K = rig as KitRig;
  const v = Math.floor(hashId(c.id) * 3);
  if (K.kit.who !== c.id) { K.kit.who = c.id; kitPersonalize(K, v); }
  kitSync(K);
  const P = rig.parts;
  const R = (n: string, x: number, y = 0, z = 0) => { const o = P[n]; if (o) o.rotation.set(x, y, z); };
  const ud = rig.root.userData as Record<string, number>;
  const n = netOf(c);
  const seed = hashId(c.id);
  const ac = attackCurve(rig, c, t);
  const lost = lostParts(c);
  const moving = c.speed > 0.2;
  const ph0 = c.phase;
  const flee = c.state === 'flee';
  // crouched low, the spine arched; it breathes slowly
  const breath = Math.sin(t * 1.1 + seed * 6) * 0.03;
  offset(rig, 'pelvis', 0, -0.12 - (flee ? 0.1 : 0) + breath, 0);
  R('pelvis', -0.05, moving ? Math.sin(ph0) * 0.08 : 0, 0);
  R('spine', 0.1 + breath, 0, moving ? Math.sin(ph0) * 0.05 : 0);
  R('chest', 0.18 - ac.wind * 0.3 + ac.strike * 0.4, 0, 0);
  const tgt = nearestSurvivor(c, 16);
  let yaw = 0, pitch = 0;
  if (tgt) [yaw, pitch] = lookAngles(c, tgt.x, tgt.z, tgt.y, 0.9, 1.2, 0.6);
  ud.hy = (ud.hy ?? 0) + (yaw - (ud.hy ?? 0)) * Math.min(1, dt * 2);
  // the head tilts further over the longer it looks at you
  ud.tilt = (ud.tilt ?? 0) + ((tgt && tgt.d < 10 && !flee ? 0.7 : 0) - (ud.tilt ?? 0)) * Math.min(1, dt * 0.4);
  R('neck', -0.25 - pitch * 0.5, ud.hy * 0.4, 0);
  R('head', -0.15 - pitch * 0.4 - ac.wind * 0.3, ud.hy * 0.5, ud.tilt * (seed < 0.5 ? 1 : -1));
  // the grin widens while it watches you in the dark; it snaps when it bites
  const watching = tgt && tgt.d < 9 && !flee ? 1 : 0;
  ud.grin = (ud.grin ?? 0) + ((ac.wind > 0.2 || ac.strike > 0 ? 1 : watching * (0.25 + 0.15 * Math.max(0, Math.sin(t * 0.7)))) - (ud.grin ?? 0)) * Math.min(1, dt * (ac.strike > 0 ? 20 : 2));
  R('jaw', ud.grin * 0.75, 0, 0);
  // eyes: blink one at a time, never together; shut tight when light finds it
  const shut = n.shut && live() && G.time - n.shut < 1.2 ? 1 : 0;
  for (let i = 0; i < 4; i++) {
    const e = P['eye' + i]; if (!e) continue;
    const blink = Math.floor(t * 0.9 + i * 1.37 + seed * 13) % 7 === 0 && ((t * 0.9 + i * 1.37 + seed * 13) % 1) < 0.15;
    e.scale.set(1, shut || blink || c.dead ? 0.05 : 1, 1);
  }
  // knuckle-walking: the arms are the front legs
  for (const [i, s, k] of [[0, 'L', 1], [1, 'R', -1]] as const) {
    const ph = ph0 + i * Math.PI;
    const sw = moving ? Math.sin(ph) * 0.5 : 0, lift = moving ? Math.max(0, -Math.cos(ph)) * 0.6 : 0;
    let ax = -0.35 + sw, fx_ = -0.2 - lift * 0.8;
    if (ac.wind > 0 || ac.strike > 0) { ax = -1.2 * ac.wind - 1.6 * ac.strike; fx_ = -0.6 * ac.wind + 0.2 * ac.strike; }
    if (flee) { ax = 0.5 + Math.sin(t * 12 + i) * 0.3; fx_ = -1.3; } // arms over its eyes
    R('arm' + s, ax, 0, k * 0.15); R('fore' + s, fx_, 0, 0); R('hand' + s, 0.3 + lift * 0.5, 0, 0);
    const lph = ph + Math.PI * 0.5;
    R('thigh' + s, -0.9 + (moving ? Math.sin(lph) * 0.45 : 0), 0, k * 0.1);
    R('shin' + s, 1.5 + (moving ? Math.max(0, -Math.cos(lph)) * 0.6 : 0), 0, 0);
    R('foot' + s, -0.5, 0, 0);
    if (lost.has('arm' + s) || lost.has('fore' + s)) R('arm' + s, -0.2, 0, k * 0.6);
  }
  const fl = flinchOf(c);
  rig.body.position.x = fl > 0 ? Math.sin(t * 90) * 0.04 * fl : 0;
  // the body is barely there: dithered into the dark, more so in light
  const F = K.kit.F.fx.value;
  F.y += dt; F.z = Math.min(1, c.hitFlash / 0.15) * 0.4;
  const lit = live() && c.zoneKey ? lightAt(G.getZone(c.zoneKey), c.x, c.z) : 0.2;
  F.w = c.dead ? 0 : Math.min(0.7, 0.18 + lit * 0.5 + (flee ? 0.25 : 0));
  if (c.dead) {
    ud.deadT = (ud.deadT ?? 0) + dt;
    const k2 = Math.min(1, ud.deadT * 2);
    R('jaw', 0.5); R('neck', 0.6 * k2); offset(rig, 'pelvis', 0, -0.4 * k2, 0);
  }
  // in the dark with it: the local survivor knows
  const p = localIn(c);
  if (p && !c.dead && tgt && tgt.d < 8 && !flee) {
    p.body.stress = Math.min(100, p.body.stress + dt * 2.5);
    thinkOnce(p, 'gloam', ['Eyes. Down there. Too many.', 'Teeth in the dark. It is smiling.', 'Keep the light on it. KEEP THE LIGHT ON IT.'][Math.floor(t) % 3], 70);
  }
}

// ------------------------------------------------------------------ brain (host)
const darkAt = (z: Zone, x: number, zz: number) => lightAt(z, x, zz) < 0.3;
function target(c: Creature): Player | null {
  let best: Player | null = null, bd = 26;
  for (const p of playersIn(c.zoneKey)) { const d = dist(p, c); if (d < bd) { bd = d; best = p; } }
  return best;
}
function darkSpot(z: Zone, c: Creature, from: { x: number; z: number }, dMin: number, dMax: number) {
  return pickReach(z, c.x, c.z, (x, zz, st) => {
    const d = Math.hypot(x - from.x, zz - from.z);
    if (d < dMin || d > dMax || st > 30) return null;
    const l = lightAt(z, x, zz);
    if (l > 0.35) return null;
    return -l * 6 - Math.abs(d - (dMin + dMax) / 2) * 0.2;
  }, 900);
}

function thinkGloam(c: Creature, dt: number): boolean {
  const z = G.getZone(c.zoneKey), cs = G.creatures, m = c.mem, n = net(c);
  pulse(c);
  const p = target(c);
  // light is the one thing: on it, or standing in it, it goes
  const beam = beamOn(z, c.x, c.z, 15);
  const bright = lightAt(z, c.x, c.z) > 0.42;
  if ((beam || bright) && c.state !== 'flee' && c.attackPhase <= 0) {
    c.setState('flee');
    n.shut = G.time;
    playAt('gloam_hiss', c, 1, 22);
    c.goal = darkSpot(z, c, beam ?? p ?? c, 8, 18) ?? cs.fleeSpot(c, z, (beam ?? p ?? c).x, (beam ?? p ?? c).z);
    m.shyUntil = G.time + rng.float(5, 10);
    return true;
  }
  if (c.state === 'flee') {
    if (!c.goal || cs.moveTo(c, z, c.goal.x, c.goal.z, c.sp.run, dt, 0.7) || c.stateT > 6) { c.setState('hide'); c.goal = null; }
    return true;
  }
  if (!p) { c.setState('idle'); hold(c); return true; }
  c.targetId = p.id;
  const d = dist(p, c);
  // what counts as the dark for the survivor: no light on, or it browning out, and standing somewhere dark
  const out = (p as any).__flickUntil && G.time < (p as any).__flickUntil;
  const exposed = (!p.flashlightOn || out) && darkAt(z, p.x, p.z);
  m.exposedT = exposed ? (m.exposedT ?? 0) + dt : 0;
  const facingMe = Math.abs(angleDiff(p.facing, Math.atan2(c.z - p.z, c.x - p.x))) < 0.6;
  // bite
  const reach = c.sp.attack!.range + p.radius;
  if (d <= reach && c.attackT <= 0 && !(p.flashlightOn && !out && facingMe)) { cs.startAttack(c, p); playAt('gloam_bite', c, 1, 18); return true; }
  // come in when it is dark enough, or when they cannot see it
  if ((m.exposedT > 2.5 || out || (!facingMe && !p.flashlightOn)) && G.time > (m.shyUntil ?? 0) && darkAt(z, c.x, c.z)) {
    c.setState('chase');
    cs.moveTo(c, z, p.x, p.z, out ? c.sp.run : c.sp.walk * 1.4, dt, reach * 0.8);
    return true;
  }
  // otherwise keep to the dark at the edge of their light, watching
  c.setState('stalk');
  m.pickT = (m.pickT ?? 0) - dt;
  if ((!m.spot || dist(m.spot, c) < 0.6 && (d < 4 || d > 10) || !darkAt(z, m.spot.x, m.spot.z)) && m.pickT <= 0) { m.pickT = 1.2; m.spot = darkSpot(z, c, p, 4.5, 9); }
  if (m.spot && dist(m.spot, c) > 0.6) cs.moveTo(c, z, m.spot.x, m.spot.z, c.sp.walk, dt, 0.5);
  else { hold(c); face(c, p.x, p.z); }
  if (c.noiseCooldown <= 0 && d < 12 && rng.chance(dt * 0.25)) { playAt('gloam_click', c, 0.8, 14); c.noiseCooldown = 4; }
  return true;
}

const S = def({
  key: 'gloam', name: 'Gloam', code: 'GL-13 // UMBRAL PREDATOR', temperament: 'stalker', threat: 4,
  hp: 55, walk: 1.3, run: 5.0, turn: 8, radius: 0.36, height: 1.1, sight: 18, fov: 1.6, hearing: 1.6, nightVision: true, light: 'repelled',
  attack: { dmg: [12, 20], range: 1.0, cooldown: 1.6, kinds: ['bite', 'deep', 'laceration'], corrupt: 0.05, knock: 0.7, parts: ['farm_l', 'farm_r', 'hand_l', 'hand_r', 'thigh_l', 'thigh_r', 'torso_l', 'neck'] },
  zones: ['tunnels', 'parking', 'stairwell', 'lobby', 'suburbs', 'house', 'corrupt'], weight: 1, maxPerZone: 2, diet: 'meat',
  sounds: snd({ alert: 'gloam_click', attack: 'gloam_bite', hurt: 'gloam_hiss', death: 'gloam_die', loop: 'gloam_breath' }),
  scan: {
    cls: 'Umbral predator',
    notes: [
      'All you see of it is eye-shine and teeth. The body is a darker part of the dark.',
      'It keeps to the edge of your light and watches. The longer it watches, the wider it smiles.',
      'Light hurts it. A beam on it, or standing in a lit room, and it is gone, hissing.',
      'It comes in when you are in the dark without a light, and every time your light stutters.',
    ],
  },
  gore: { blood: 'oil', tint: 0x2a1a2a, flesh: 0x1a1420, sever: ['armL', 'armR', 'foreL', 'foreR', 'thighL', 'thighR', 'shinL', 'shinR'], head: 'head' },
  build: buildGloam,
  animate: animateGloam,
  think: thinkGloam,
});
defDread('gloam', { shine: { part: 'head', off: [0, 0.05, 0.12], sep: 0.05, color: 0xd8ff70, size: 0.026 }, flick: 9, flickStep: 3, sting: 'swell', cam: 0.7, twitch: ['head', 'jaw'], twitchRate: 0.4, skipDark: 0.3 });
(S as any).animateGallery = (rig: Rig, t: number) => {
  const q = new URLSearchParams(location.search).get('pose') || '';
  const c = fakeCreature(S, { id: 'g' + (Number(q.match(/\d/)?.[0] ?? 1)), state: q.startsWith('flee') ? 'flee' : 'stalk', speed: q.startsWith('walk') ? 1.4 : 0, phase: t * 4, attackPhase: q.startsWith('attack') ? 0.1 : 0, mem: { netMem: {} } });
  animateGloam(rig, c, t, 1 / 60);
};
