import * as THREE from 'three';
import { def, Rig } from '../species';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { makeRamp } from '../../gfx/pixel';
import { G } from '../../game/G';
import type { Creature } from '../creature';
import type { Player } from '../../entities/player';
import type { Zone } from '../../world/zone';
import { net, netOf, snd, playersIn, dist, hold, hashId, fakeCreature, rng, fx, fxPoll, playAt, live, seenByAny, walkable, lineOfSightB, localIn, thinkOnce, partB, matB, hiddenSpot } from '../behaviors_b';
import '../../audio/sounds_creatures_b';
import { KitDef, KitRig, BoneSpec, SkinB, BuildCtx, Page, Region, Row, Wt, buildKitRig, kitSync, tube, headLoft, handLoft, footLoft, wLerp, gauss, FOOT_BARE, ringY, usFor, hash, offset } from '../kit/humanoids';

// Far Sentinel: an impossibly tall, thin figure that only ever stands at the
// edge of sight, watching. It never moves while anyone is looking. Look away
// and it may be a few metres closer next time you turn around. Walk toward it
// and it simply is not there any more. It does nothing else.
// Distances are tuned to the isometric camera: at the default zoom the screen
// shows ~11 m around the survivor (≈23 m zoomed out), so it first appears
// 14-23 m out (screen edge / zoomed out), creeps no closer than ~11 m and is
// gone once anyone gets inside VANISH metres.

addTextureModule(() => {
  const A = atlas();
  A.add('c_sentinel_eye', 2, 2, (pc) => { pc.fill(0xe8ecf0); });
});

const LEG = 1.6;
function bonesS(): BoneSpec[] {
  const b: BoneSpec[] = [
    { name: 'hip', parent: '', at: [0, LEG * 2, 0] },
    { name: 'torso', parent: 'hip', at: [0, 0.04, 0] },
    { name: 'chest', parent: 'torso', at: [0, 0.6, 0] },
    { name: 'neck', parent: 'chest', at: [0, 0.5, 0.01] },
    { name: 'head', parent: 'neck', at: [0, 0.42, 0.02] },
  ];
  for (const [s, k] of [['L', 1], ['R', -1]] as const) {
    b.push(
      { name: 'arm' + s, parent: 'chest', at: [k * 0.17, 0.46, -0.01] },
      { name: 'fore' + s, parent: 'arm' + s, at: [0, -1.2, 0] },
      { name: 'hand' + s, parent: 'fore' + s, at: [0, -1.16, 0] },
      { name: 'f1' + s, parent: 'hand' + s, at: [0, -0.1, 0] },
      { name: 'f2' + s, parent: 'f1' + s, at: [0, -0.13, 0] },
      { name: 'th' + s, parent: 'hand' + s, at: [-k * 0.004, -0.03, 0.022] },
      { name: 'thigh' + s, parent: 'hip', at: [k * 0.075, -0.06, 0] },
      { name: 'shin' + s, parent: 'thigh' + s, at: [0, -LEG + 0.04, 0] },
      { name: 'foot' + s, parent: 'shin' + s, at: [0, -LEG + 0.1, 0] },
    );
  }
  return b;
}
function layoutS(p: Page) {
  p.reg('COAT', 64, 120, [1.0, 4.32]);
  p.reg('ARM', 16, 120, [-2.42, 0.03]);
  p.reg('LEG', 16, 96, [-3.14, 0.06]);
  p.reg('HEAD', 64, 40, [-0.02, 0.42]);
  p.reg('NECK', 16, 30, [-0.05, 0.44]);
  p.reg('HAND', 16, 28);
  p.reg('FOOT', 20, 14);
}
// a long coat as narrow as a man's thigh, hanging from shoulders that are not there
const COAT_S: Row[] = [
  { y: 1.0, rx: 0.11, rf: 0.07, rb: 0.08 },
  { y: 1.6, rx: 0.1, rf: 0.066, rb: 0.074 },
  { y: 2.4, rx: 0.094, rf: 0.062, rb: 0.068 },
  { y: 3.2, rx: 0.1, rf: 0.064, rb: 0.07 },
  { y: 3.5, rx: 0.088, rf: 0.06, rb: 0.062 },
  { y: 3.9, rx: 0.104, rf: 0.066, rb: 0.07 },
  { y: 4.2, rx: 0.17, rf: 0.06, rb: 0.068, sq: 3 },
  { y: 4.28, rx: 0.12, rf: 0.05, rb: 0.056 },
  { y: 4.32, rx: 0.04, rf: 0.034, rb: 0.036 },
];
const HEAD_S: Row[] = [
  { y: -0.02, rx: 0.03, rf: 0.032, rb: 0.03 },
  { y: 0.04, rx: 0.056, rf: 0.07, rb: 0.058 },
  { y: 0.12, rx: 0.072, rf: 0.084, rb: 0.074 },
  { y: 0.22, rx: 0.08, rf: 0.088, rb: 0.084 },
  { y: 0.31, rx: 0.078, rf: 0.082, rb: 0.084 },
  { y: 0.38, rx: 0.06, rf: 0.06, rb: 0.066 },
  { y: 0.415, rx: 0.03, rf: 0.03, rb: 0.034 },
];
function buildS(B: SkinB, x: BuildCtx) {
  const bi = x.bi, R = x.R;
  const cw = (y: number): Wt => {
    if (y < 3.0) {
      // the coat skirt follows the legs a little
      const l = 0.5;
      return [bi('hip'), 0.6, bi('thighL'), 0.2 * l * 2, bi('thighR'), 0.2 * l * 2];
    }
    if (y < 3.3) return [bi('hip'), 1];
    if (y < 3.5) return wLerp(y, 3.3, 3.5, bi('hip'), bi('torso'));
    if (y < 3.75) return [bi('torso'), 1];
    if (y < 3.95) return wLerp(y, 3.75, 3.95, bi('torso'), bi('chest'));
    if (y < 4.3) return [bi('chest'), 1];
    return [bi('chest'), 0.5, bi('neck'), 0.5];
  };
  tube(B, { rows: COAT_S, ys: [1.0, 1.3, 1.6, 2.0, 2.4, 2.8, 3.2, 3.35, 3.5, 3.7, 3.9, 4.05, 4.2, 4.25, 4.28, 4.32], n: 10, reg: R('COAT'), vr: R('COAT').range, w: cw, g: 1, end: [0, 4.335, 0] });
  // the coat is open at the bottom: an inner face so you never see through the hem
  {
    const rr = [1.0, 1.06].map((y, i) => ({ pts: ringY(y, 0, 0, 0.108 - i * 0.02, 0.068 - i * 0.015, 0.078 - i * 0.015, 10, 2), v: 0.02, w: [bi('hip'), 0.6, bi('thighL'), 0.2, bi('thighR'), 0.2] as Wt }));
    B.loft(rr, usFor(10), R('COAT'), 2, { flip: true });
  }
  tube(B, { rows: [{ y: -0.05, rx: 0.03, rf: 0.03, rb: 0.03 }, { y: 0.2, rx: 0.02, rf: 0.02, rb: 0.022 }, { y: 0.43, rx: 0.022, rf: 0.024, rb: 0.022 }], ys: [-0.05, 0.08, 0.2, 0.32, 0.43], n: 6, reg: R('NECK'), vr: R('NECK').range, at: x.rest('neck'), w: (y) => (y < 0 ? [bi('chest'), 0.5, bi('neck'), 0.5] : y > 0.36 ? [bi('neck'), 0.5, bi('head'), 0.5] : [bi('neck'), 1]), g: 3 });
  headLoft(B, { at: x.rest('head'), rows: HEAD_S, reg: R('HEAD'), vr: R('HEAD').range, w: () => [bi('head'), 1], g: 4, top: 0.425, bottom: -0.025, angs: [-180, -135, -90, -45, -20, 0, 20, 45, 90, 135, 180] });
  for (const [s, k] of [['L', 1], ['R', -1]] as const) {
    const U = bi('arm' + s), F = bi('fore' + s), H = bi('hand' + s);
    const at = x.rest('arm' + s);
    tube(B, { rows: [{ y: 0, rx: 0.02, rf: 0.024, rb: 0.024, cx: -0.008 }, { y: -0.03, rx: 0.034, rf: 0.034, rb: 0.034 }, { y: -1.15, rx: 0.026, rf: 0.026, rb: 0.026 }, { y: -1.22, rx: 0.03, rf: 0.03, rb: 0.03 }, { y: -2.3, rx: 0.018, rf: 0.02, rb: 0.018 }, { y: -2.36, rx: 0.016, rf: 0.018, rb: 0.017 }],
      ys: [0, -0.03, -0.5, -1.0, -1.15, -1.2, -1.25, -1.7, -2.1, -2.3, -2.36], n: 6, reg: R('ARM'), vr: R('ARM').range, at, mirror: k, g: 10 + (k > 0 ? 0 : 1),
      w: (y) => (y > -0.02 ? [U, 0.7, bi('chest'), 0.3] : y > -1.12 ? [U, 1] : y > -1.26 ? wLerp(y, -1.12, -1.26, U, F) : y > -2.3 ? [F, 1] : [F, 0.5, H, 0.5]) });
    const hp = x.rest('hand' + s);
    handLoft(B, { k, at: [hp[0], hp[1] - 0.004, hp[2]], bones: { farm: F, hand: H, f1: bi('f1' + s), f2: bi('f2' + s), thumb: bi('th' + s) }, reg: R('HAND'), g: 20 + (k > 0 ? 0 : 10), s: 1.1, palm: { len: 0.1, w: 0.032, t: 0.011 }, fingers: { n: 3, len: [0.26, 0.3, 0.26], r: [0.006, 0.0065, 0.006] }, thumb: { len: 0.1, r: 0.007 } });
    const T = bi('thigh' + s), Sh = bi('shin' + s), Ft = bi('foot' + s);
    const lt = x.rest('thigh' + s);
    tube(B, { rows: [{ y: 0.05, rx: 0.04, rf: 0.04, rb: 0.044 }, { y: -0.5, rx: 0.036, rf: 0.036, rb: 0.036 }, { y: -1.56, rx: 0.028, rf: 0.03, rb: 0.028 }, { y: -1.62, rx: 0.032, rf: 0.034, rb: 0.03 }, { y: -2.4, rx: 0.026, rf: 0.026, rb: 0.03 }, { y: -3.1, rx: 0.018, rf: 0.02, rb: 0.02 }],
      ys: [0.05, -0.5, -1.1, -1.5, -1.56, -1.62, -1.7, -2.4, -2.9, -3.1], n: 6, reg: R('LEG'), vr: R('LEG').range, at: lt, mirror: k, g: 30 + (k > 0 ? 0 : 1),
      w: (y) => (y > 0.0 ? [bi('hip'), 0.5, T, 0.5] : y > -1.5 ? [T, 1] : y > -1.66 ? wLerp(y, -1.5, -1.66, T, Sh) : y > -3.05 ? [Sh, 1] : [Sh, 0.5, Ft, 0.5]) });
    footLoft(B, { k, at: x.rest('foot' + s), rows: FOOT_BARE, ground: -0.06, sole: 0.003, lip: 0, reg: R('FOOT'), w: [Ft, 1], g: 36 + (k > 0 ? 0 : 1), s: 1.6, sx: 0.5, toeLift: 0.1 });
  }
}
function paintS(p: Page, x: BuildCtx) {
  const CR = makeRamp(0x26262c, 8, { hueShift: 0.06, spread: 0.55 });
  const PL = makeRamp(0x9a9a96, 8, { hueShift: 0.02, spread: 0.55 });
  const sheath = (r: Region, base: number, sd: number) => {
    r.fill(CR, (xx, yy) => base + 1.0 * Math.cos((r.deg(xx) * Math.PI) / 180) + (r.fbm(xx, yy >> 2, 3, 2, sd) - 0.5) * 1.0 + (xx % 5 === 0 ? -0.6 : 0), undefined, 0.6);
    // the cloth stretched along its length: long pale tension lines
    for (let i = 0; i < 6; i++) { const cx = Math.floor(hash(i, sd) * r.w); for (let yy = 0; yy < r.h; yy++) if (hash(yy >> 3, i + sd) < 0.7) r.blend(cx, yy, CR[5], 0.35); }
  };
  { const r = p.R('COAT'); sheath(r, 2.9, 7); for (let xx = 0; xx < r.w; xx++) { if (hash(xx, 3) < 0.6) r.set(xx, r.h - 1 - Math.floor(hash(xx, 4) * 3), CR[0]); } r.vline(Math.round(r.X(0)), 0, r.h * 0.6, CR[0]); }
  { const r = p.R('ARM'); sheath(r, 2.6, 9); const cuff = Math.round(r.Y(-2.28)); for (let yy = cuff; yy < r.h; yy++) for (let xx = 0; xx < r.w; xx++) r.put(xx, yy, PL, 4 + Math.cos((r.deg(xx) * Math.PI) / 180)); }
  { const r = p.R('LEG'); sheath(r, 2.4, 11); }
  { const r = p.R('NECK'); r.fill(PL, (xx, yy) => 3.6 + 1.2 * Math.cos((r.deg(xx) * Math.PI) / 180) + (yy % 4 === 0 ? -0.5 : 0)); }
  {
    const r = p.R('HEAD');
    r.fill(PL, (xx, yy) => {
      const deg = r.deg(xx), h = r.yAt(yy);
      return 4.6 + 1.6 * Math.cos((deg * Math.PI) / 180) * 0.6 + (r.fbm(xx, yy, 2, 2, 13) - 0.5) * 0.4 - 1.2 * Math.max(0, (0.03 - h) / 0.05) + ((xx + (yy >> 1)) % 7 === 0 ? -0.35 : 0);
    }, undefined, 0.4);
    // stretched: faint vertical lines down the face, and two pinholes where it sees from
    for (const deg of [-30, -12, 12, 30]) for (let yy = 2; yy < r.h - 2; yy++) if (hash(yy, deg) < 0.6) r.blend(r.X(deg), yy, PL[2], 0.35);
    for (const k of [-1, 1]) r.set(Math.round(r.X(k * 16)), Math.round(r.Y(0.25)), 0x0a0a0c);
  }
  { const r = p.R('HAND'); r.fill(PL, (xx, yy) => 3.8 + Math.cos((r.deg(xx) * Math.PI) / 180) - (yy > r.h * 0.9 ? 1.4 : 0)); for (let yy = Math.round(r.h * 0.5); yy < r.h; yy += 4) for (let xx = 0; xx < r.w; xx++) r.blend(xx, yy, PL[2], 0.4); }
  { const r = p.R('FOOT'); r.fill(PL, (xx) => 2.6 + Math.cos((r.deg(xx) * Math.PI) / 180)); }
  void x;
}
const SENTINEL_KIT: KitDef = { key: 'sentinel', variants: 1, bones: bonesS, layout: layoutS, build: buildS, paint: paintS, sphere: [0, 2.6, 0, 3.2] };

function buildSentinel(): Rig {
  const rig = buildKitRig(SENTINEL_KIT, 0, 5.2);
  // two faint points of light at head height, visible through the dark
  const eyes = new THREE.Group();
  eyes.name = 'eyes';
  rig.root.add(eyes);
  rig.parts.eyes = eyes;
  partB(rig, 'eyeL', eyes, [0.04, 0, 0], (mb) => { mb.box(0, 0, 0, 0.02, 0.02, 0.01, 'c_sentinel_eye', { fit: true, emissive: 1 }); }, matB('glow'));
  partB(rig, 'eyeR', eyes, [-0.04, 0, 0], (mb) => { mb.box(0, 0, 0, 0.02, 0.02, 0.01, 'c_sentinel_eye', { fit: true, emissive: 1 }); }, matB('glow'));
  rig.eyes = [eyes];
  return rig;
}

/** the pose it holds: arms straight down past its knees, head a little forward, the tilt it develops while watched */
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
function poseS(rig: Rig, t: number, tilt: number, stretch: number, seed: number) {
  const R = (n: string, x: number, y = 0, z = 0) => { const o = rig.parts[n]; if (o) o.rotation.set(x, y, z); };
  // not quite still: a sway like something very tall in no wind at all
  const sway = Math.sin(t * 0.21 + seed * 6) * 0.006;
  R('hip', 0, 0, sway); R('torso', 0.04, 0, -sway * 0.5); R('chest', 0.03, 0, 0);
  R('neck', 0.14 + Math.sin(t * 0.13 + seed * 6) * 0.02, 0, tilt * 0.3);
  R('head', 0.05, 0, tilt * 0.9);
  offset(rig, 'neck', 0, stretch * 0.6, 0);
  for (const [s, k] of [['L', 1], ['R', -1]] as const) {
    R('arm' + s, 0.02, 0, k * 0.04); R('fore' + s, -0.02, 0, 0); R('hand' + s, 0, 0, -k * 0.05);
    // one finger moves, once in a long while
    const tw = k > 0 && Math.sin(t * 0.37 + seed * 11) > 0.985 ? 0.5 : 0.12;
    R('f1' + s, 0, 0, -k * tw); R('f2' + s, 0, 0, -k * tw * 0.8); R('th' + s, 0.1, 0, 0);
    R('thigh' + s, 0, 0, k * 0.01); R('shin' + s, 0.01, 0, 0);
  }
}
/** the glowing points follow the head (they live on the root to show through darkness) */
function placeEyes(rig: Rig) {
  const P = rig.parts;
  rig.root.updateMatrixWorld(true);
  P.head.getWorldPosition(_v);
  rig.root.worldToLocal(_v);
  P.head.getWorldQuaternion(_q);
  rig.root.getWorldQuaternion(_q2).invert();
  P.eyes.quaternion.copy(_q2.multiply(_q));
  const off = new THREE.Vector3(0, 0.25, 0.085).applyQuaternion(P.eyes.quaternion);
  P.eyes.position.copy(_v).add(off);
}

function animateSentinel(rig: Rig, c: Creature, t: number, dt: number) {
  kitSync(rig as KitRig);
  const P = rig.parts;
  const n = netOf(c);
  const ud = rig.root.userData as { hideT?: number; seenT?: number };
  const seed = hashId(c.id);
  const absent = n.v === 0;
  const vanishing = c.state === 'hide' && !absent;
  ud.hideT = vanishing ? (ud.hideT ?? 0) + dt : 0;
  const k = Math.min(1, (ud.hideT ?? 0) / 0.8);
  // statue-still; only the head tilts, slowly, the longer it is watched, and the neck lengthens
  ud.seenT = c.visibleToLocal && !absent ? (ud.seenT ?? 0) + dt : Math.max(0, (ud.seenT ?? 0) - dt * 0.2);
  const tilt = Math.min(1.1, (ud.seenT ?? 0) * 0.04) * (seed > 0.5 ? 1 : -1);
  const stretch = Math.min(0.35, (ud.seenT ?? 0) * 0.006) + k * k * 0.8;
  poseS(rig, t, tilt, stretch, seed);
  // vanish: the head goes up first, then everything thins to a line, flickers, is gone
  rig.body.scale.set(1 - k * 0.92, 1 + k * 0.6, 1 - k * 0.92);
  (rig as KitRig).kit.F.fx.value.set(k * 0.6, t, 0, k * 0.5);
  const flick = vanishing && Math.floor(t * 30) % 3 === 0;
  const gone = absent || k >= 1 || flick;
  rig.body.visible = rig.body.visible && !gone;
  P.eyes.visible = P.eyes.visible && !gone;
  placeEyes(rig);
  // fx (the vanish) on every peer
  const e = fxPoll(rig, c);
  if (e) playAt(e.key, c, 0.8, 40);
  // the local survivor: being watched wears on you
  const p = localIn(c);
  if (p && !absent && !c.dead) {
    const d = Math.hypot(p.x - c.x, p.z - c.z);
    if (c.visibleToLocal && rig.body.visible) {
      p.body.stress = Math.min(100, p.body.stress + dt * 0.35);
      if (d < 26) p.body.panic = Math.min(100, p.body.panic + dt * (26 - d) * 0.08);
      if ((ud.seenT ?? 0) > 1.5) thinkOnce(p, 'sentinel_seen', ['Someone is standing out there. Watching me.', 'That is not a lamp post.', 'It is too tall. It is far too tall.'][Math.floor(seed * 3)], 240);
    }
    if (vanishing && d < 22 && live()) G.pr.fx.blink = Math.max(G.pr.fx.blink, Math.sin(k * Math.PI) * 0.8);
  }
}

// ---------------------------------------------------------------- brain (host)
const SEE = 50;
const VANISH = 9.5;
const NEAREST = 11;
/** an unobserved tile at ~distance r from p, in the open (clear line to p), near a bearing if given */
function standSpot(z: Zone, p: Player, rMin: number, rMax: number, bearing?: number): { x: number; z: number } | null {
  for (let t = 0; t < 60; t++) {
    const a = bearing !== undefined && t < 35 ? bearing + rng.float(-0.55, 0.55) : rng.float(0, Math.PI * 2);
    const r = rng.float(rMin, rMax);
    const x = Math.floor(p.x + Math.cos(a) * r), y = Math.floor(p.z + Math.sin(a) * r);
    if (!walkable(z, x, y)) continue;
    const px = x + 0.5, pz = y + 0.5;
    if (seenByAny(z, px, pz, SEE)) continue;
    if (!lineOfSightB(z, p.x, p.z, px, pz)) continue;
    // never closer than the vanishing distance to anyone
    if (playersIn(z.key).some((q) => Math.hypot(q.x - px, q.z - pz) < NEAREST - 0.5)) continue;
    return { x: px, z: pz };
  }
  return null;
}
function nearest(c: Creature): { p: Player; d: number } | null {
  let best: Player | null = null, bd = Infinity;
  for (const p of playersIn(c.zoneKey)) { const d = dist(p, c); if (d < bd) { bd = d; best = p; } }
  return best ? { p: best, d: bd } : null;
}
function watched(z: Zone, c: Creature) { return !!seenByAny(z, c.x, c.z, SEE); }

function thinkSentinel(c: Creature, dt: number): boolean {
  const z = G.getZone(c.zoneKey);
  const n = net(c);
  const m = c.mem;
  hold(c);
  c.mem.persistent = true; // it leaves when it wants to
  const np = nearest(c);
  // gone for a while (after being approached or stared down)
  if ((m.goneUntil ?? 0) > G.time || !np) {
    n.v = 0; if (c.state !== 'hide') c.setState('hide');
    // nothing stands where it stood: keep the empty body out of everyone's way
    if (np && np.d < 30) { const s = standSpot(z, np.p, 40, 60) || standSpot(z, np.p, 30, 45); if (s) { c.x = s.x; c.z = s.z; } }
    return true;
  }
  const { p, d } = np;
  // vanishing animation in progress
  if (c.state === 'hide' && n.v === 1) {
    if (c.stateT > 0.85) { n.v = 0; m.goneUntil = G.time + rng.float(45, 130); m.placed = false; m.seenT = 0; }
    return true;
  }
  // (re)appear: stand somewhere out there, unobserved, with a clear line to them
  if (!m.placed || n.v === 0 || d > 36) {
    const s = standSpot(z, p, 14, 23);
    if (!s) {
      // nowhere open enough to stand and be seen: wait out of everyone's way, give up eventually
      n.v = 0;
      m.noRoomT = (m.noRoomT ?? 0) + dt;
      if (d < 25) { const h = hiddenSpot(z, p.x, p.z, 26, 45); if (h) { c.x = h.x; c.z = h.z; } }
      if (m.noRoomT > 90) G.creatures.remove(c);
      return true;
    }
    m.noRoomT = 0;
    c.x = s.x; c.z = s.z; c.facing = c.targetFacing = Math.atan2(p.z - c.z, p.x - c.x);
    m.placed = true; n.v = 1; m.seenT = 0; m.unseenT = 0; m.nextCreep = G.time + rng.float(5, 10);
    c.setState('watch');
    return true;
  }
  // approached: it is simply gone
  for (const q of playersIn(c.zoneKey)) {
    if (dist(q, c) < VANISH) { c.setState('hide'); fx(c, 'sentinel_vanish'); return true; }
  }
  if (watched(z, c)) {
    m.unseenT = 0;
    if (!m.seenT) G.creatures.call(c, 'idle');
    m.seenT = (m.seenT ?? 0) + dt;
    // stared at for long enough: the next blink it is gone
    if (m.seenT > 25) m.leaveOnBlink = true;
    return true;
  }
  m.unseenT = (m.unseenT ?? 0) + dt;
  if (m.leaveOnBlink && m.unseenT > 0.5) { m.leaveOnBlink = false; n.v = 0; m.goneUntil = G.time + rng.float(60, 150); m.placed = false; c.setState('hide'); return true; }
  // unwatched: always already facing you; sometimes a few metres closer
  c.facing = c.targetFacing = Math.atan2(p.z - c.z, p.x - c.x);
  if (m.unseenT > 3 && G.time > (m.nextCreep ?? 0)) {
    m.nextCreep = G.time + rng.float(6, 14);
    if (rng.chance(0.7)) {
      const nd = Math.max(NEAREST + 0.5, d - rng.float(2.5, 5.5));
      const s = standSpot(z, p, nd - 1, nd + 1, Math.atan2(c.z - p.z, c.x - p.x));
      if (s) { c.x = s.x; c.z = s.z; c.facing = c.targetFacing = Math.atan2(p.z - c.z, p.x - c.x); m.seenT = 0; }
    }
  }
  return true;
}

const S = def({
  key: 'sentinel', name: 'Far Sentinel', code: 'E-30 // OBSERVER-FAR', temperament: 'neutral', threat: 2,
  hp: 999, walk: 0, run: 0, turn: 0.4, radius: 0.35, height: 5.3, sight: 60, fov: 3.14, hearing: 0.2,
  zones: ['fields', 'parking', 'server', 'suburbs'], weight: 1, maxPerZone: 1,
  flags: { watcher: true, immortal: true, noCorpse: true },
  sounds: snd({ idle: 'sentinel_hum', loop: 'sentinel_hum' }),
  scan: {
    cls: 'Observer / non-hostile (?)',
    notes: [
      'Five metres tall. It stands at the edge of what you can see and watches.',
      'It never moves while anyone is looking at it. Look away and it may be closer.',
      'Walk toward it and it is gone before you are halfway there.',
      'Being watched is exhausting: stress and panic build while it is in view. Rounds pass through it.',
    ],
  },
  gore: { blood: 'none' },
  build: buildSentinel,
  animate: animateSentinel,
  think: thinkSentinel,
});
(S as any).animateGallery = (rig: Rig, t: number) => {
  const q = new URLSearchParams(location.search).get('pose') || '';
  const c = fakeCreature(S, { id: 'g4', state: q === 'vanish' ? 'hide' : 'watch', visibleToLocal: true, mem: { netMem: { v: 1 } } });
  if (q === 'vanish') (rig.root.userData as any).hideT = (t % 1.6) * 0.5 - 0.016;
  if (q === 'watched') (rig.root.userData as any).seenT = 30;
  animateSentinel(rig, c, t, 1 / 60);
  if (q === 'vanish') rig.body.visible = true;
};
