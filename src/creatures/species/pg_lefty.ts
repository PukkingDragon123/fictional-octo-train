import * as THREE from 'three';
import { horrify } from '../kit/horror';
import { def, Rig } from '../species';
import { makeRamp, mixHex } from '../../gfx/pixel';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import type { Creature } from '../creature';
import type { Player } from '../../entities/player';
import { CS, zoneOf, pulse, attack, stop, faceTo, onPlayerHit, onKilled, floorItemsAround, isPrecious, takeFloorItem, restoreStore, objectsNear } from '../behaviors_a';
import { net, netOf, playAt, hashId, rng, localIn, thinkOnce, dist, lineOfSightB, walkable } from '../behaviors_b';
import { KitDef, KitRig, SkinB, BuildCtx, Page, V3, Wt, buildKitRig, kitSync, kitPersonalize, attackCurve, flinchOf, hash } from '../kit/humanoids';
import { chain, sac, plate, paintCap, paintSkin } from '../kit/organic';
import { uprightDead } from '../kit/gel';
import { ruleShown } from '../rules';
import { absBones, say, linePoll, nearestUnit, paintFelt, runs, soak } from './pg_common';

// =====================================================================================
// LEFTY — the sock puppet from "Lefty's Laundry Hour" (Bright Hour Television,
// 1989-1995). The show was filmed through a hole in the set: Lefty came up out
// of the laundry basket and told jokes. Nobody on the crew would say whose arm
// it was. The sock is a big striped tube sock, mustard and maroon, with a shirt
// button and a brass button for eyes, a red pompom nose and a felt tongue;
// the arm in it is human, grey, hairless, and it does not end. It comes up out
// of a hole in the ground and keeps coming, lying along the grass behind the
// sock in a long pale road with an elbow every couple of metres, wherever the
// sock has been. It talks. It wants what you have. It cannot go further from
// its hole than the arm goes.
//   pg_lefty   skinned kit rig: the sock (cuff, upper and lower jaw, tongue, buttons,
//              pompom, yarn) on a 22-bone arm laid each frame along the path the sock
//              took from its hole (the rest goes down into the hole); the hole's lip
//              VIDEO / POSTER API (stand-alone):
//   buildLefty(variant?)                                      -> KitRig
//   poseLefty(rig, t, dt, pose, { path, talk })                pose: 'lurk' | 'reach' | 'talk' | 'bite' |
//                                                              'grab' | 'retract' | 'dead'
//   (path: points [x, z] in the rig's own space from the sock back to the hole; default a lazy S)
// =====================================================================================

const NA = 22, SEG = 0.62, REACH = 12.5;
const WRIST: V3 = [0, 0.3, 0];
/** where the arm bone joints rest (a0 behind the cuff, a1 sloping down, then along the ground) */
const AREST: V3[] = Array.from({ length: NA + 1 }, (_, i) => (i === 0 ? [0, 0.27, -0.07] : i === 1 ? [0, 0.15, -0.5] : [0, 0.055, -0.5 - (i - 1) * SEG]));
function bonesLefty() {
  const L: [string, string, V3, boolean?][] = [['base', '', [0, 0, 0]], ['wrist', 'base', WRIST, true], ['upper', 'wrist', [0, 0.325, 0.07], true], ['lower', 'wrist', [0, 0.27, 0.07]], ['hole', 'base', [0, 0, -1.4]]];
  for (let i = 0; i < NA; i++) L.push(['a' + i, 'base', AREST[i], i < 3]);
  return absBones(L);
}
function layoutLefty(p: Page) {
  p.reg('ARM', 32, 128);
  p.reg('SOCK', 64, 40);
  p.reg('JAW', 48, 24);
  p.reg('CUFF', 48, 12);
  p.reg('MOUTH', 24, 20);
  p.reg('TONGUE', 16, 20);
  p.reg('BTN1', 12, 12);
  p.reg('BTN2', 12, 12);
  p.reg('NOSE', 12, 12);
  p.reg('YARN', 8, 16);
  p.reg('SOIL', 40, 12);
  p.reg('PIT', 16, 16);
  p.reg('CAP', 16, 16);
}
function buildLeftyMesh(B: SkinB, x: BuildCtx) {
  const bi = x.bi, R = x.R;
  const WR = bi('wrist'), UP = bi('upper'), LO = bi('lower');
  // ---- the arm: one long grey tube, an elbow every few bones, the far end in the ground
  const names = Array.from({ length: NA }, (_, i) => 'a' + i);
  const elbows = [3, 7, 11, 15, 19];
  chain(B, x, R('ARM'), 1, { bones: names, tip: AREST[NA], r: (t) => 0.056 - t * 0.012 + 0.006 * Math.sin(t * 61), n: 8, rings: 3, start: false, end: true, up: [0, 1, 0],
    bump: (a, t) => { let e = 0; for (const k of elbows) e += Math.exp(-((t - k / NA) ** 2) / 0.00012) * (0.42 + 0.25 * Math.max(0, Math.cos(a))); return e + 0.05 * Math.sin(a * 3 + t * 200); } });
  // ---- the sock: a ribbed cuff round the arm, the head over the fingers, the thumb as the jaw
  const cw = (i: number): Wt => (i < 2 ? [bi('a0'), 0.6, WR, 0.4] : [WR, 1]);
  const cp: V3[] = [[0, 0.285, -0.16], [0, 0.29, -0.1], [0, 0.295, -0.04], [0, 0.3, 0.0]];
  sac(B, R('CUFF'), 2, cp, [[0.07, 0.068], [0.078, 0.076], [0.082, 0.08], [0.084, 0.082]], cp.map((_, i) => cw(i)), { n: 14, start: false, end: false, up: [0, 0, 1], bump: (a) => 0.06 * Math.max(0, Math.sin(a * 9)) });
  const up: V3[] = [[0, 0.3, -0.005], [0, 0.322, 0.07], [0, 0.338, 0.15], [0, 0.335, 0.24], [0, 0.318, 0.31], [0, 0.305, 0.345]];
  sac(B, R('SOCK'), 3, up, [[0.084, 0.07], [0.098, 0.08], [0.095, 0.076], [0.088, 0.066], [0.07, 0.048], [0.034, 0.024]], up.map((_, i) => (i === 0 ? [WR, 1] : i === 1 ? [WR, 0.4, UP, 0.6] : [UP, 1])), { n: 16, start: false, up: [0, 1, 0],
    bump: (a, t) => 0.05 * Math.sin(a * 2 + t * 7) * t + 0.04 * Math.exp(-((t - 0.25) ** 2) / 0.01) * Math.max(0, Math.cos(a)) });
  const lo: V3[] = [[0, 0.275, 0.02], [0, 0.258, 0.1], [0, 0.254, 0.19], [0, 0.262, 0.26], [0, 0.268, 0.285]];
  sac(B, R('JAW'), 4, lo, [[0.078, 0.042], [0.08, 0.04], [0.072, 0.034], [0.05, 0.024], [0.02, 0.012]], lo.map((_, i) => (i === 0 ? [WR, 0.5, LO, 0.5] : [LO, 1])), { n: 14, up: [0, 1, 0] });
  // the inside of the mouth (a dark fold of sock) and the felt tongue lying on the jaw
  plate(B, R('MOUTH'), 5, [0, 0.302, 0.17], [1, 0, 0], [0, 0, -1], 0.07, 0.13, 0.012, [UP, 1], { rows: 4, cols: 4 });
  plate(B, R('TONGUE'), 6, [0, 0.286, 0.18], [1, 0, 0], [0, 0, 1], 0.045, 0.085, 0.01, [LO, 1], { rows: 4, cols: 3 });
  // the eyes: a big white shirt button and a little brass one, sewn on at different heights; a pompom nose; yarn
  const btn = (reg: string, c: V3, r: number, tilt: V3, g: number) => {
    const L = Math.hypot(tilt[0], tilt[1], tilt[2]), n: V3 = [tilt[0] / L, tilt[1] / L, tilt[2] / L];
    sac(B, R(reg), g, [[c[0] - n[0] * 0.006, c[1] - n[1] * 0.006, c[2] - n[2] * 0.006], [c[0] + n[0] * 0.004, c[1] + n[1] * 0.004, c[2] + n[2] * 0.004], [c[0] + n[0] * 0.008, c[1] + n[1] * 0.008, c[2] + n[2] * 0.008]], [[r, r], [r * 1.02, r * 1.02], [r * 0.8, r * 0.8]], [[UP, 1], [UP, 1], [UP, 1]], { n: 12, up: [0, 0, 1] });
  };
  btn('BTN1', [0.05, 0.402, 0.13], 0.034, [0.35, 1, 0.45], 7);
  btn('BTN2', [-0.046, 0.394, 0.165], 0.021, [-0.4, 1, 0.5], 8);
  sac(B, R('NOSE'), 9, [[0, 0.33, 0.33], [0, 0.338, 0.355], [0, 0.338, 0.375]], [[0.028, 0.026], [0.034, 0.032], [0.018, 0.017]], [[UP, 1], [UP, 1], [UP, 1]], { n: 10, bump: (a, t) => (hash(Math.round(a * 4), Math.round(t * 5)) - 0.5) * 0.3 });
  for (let i = 0; i < 5; i++) {
    const xx = (i - 2) * 0.022, zz = 0.02 + (i % 2) * 0.015, h = 0.04 + hash(i, 3) * 0.035;
    sac(B, R('YARN'), 10 + i, [[xx, 0.395, zz], [xx + (hash(i, 5) - 0.5) * 0.03, 0.39 + h, zz - 0.02], [xx + (hash(i, 6) - 0.5) * 0.05, 0.38 + h * 0.6, zz - 0.05]], [[0.008, 0.008], [0.007, 0.007], [0.004, 0.004]], [[UP, 1], [UP, 1], [UP, 1]], { n: 5 });
  }
  // ---- the hole it lives in: a lip of turned-over earth and a dark mouth in the ground
  const HO = bi('hole'), hp = x.rest('hole'), wH: Wt = [HO, 1];
  const rim: V3[] = [];
  for (let i = 0; i <= 16; i++) { const a = (i / 16) * Math.PI * 2; const rr = 0.3 + 0.04 * Math.sin(a * 3 + 1); rim.push([hp[0] + Math.cos(a) * rr, 0.02, hp[2] + Math.sin(a) * rr]); }
  sac(B, R('SOIL'), 15, rim, rim.map((_, i) => [0.11 + 0.03 * Math.sin(i * 1.7), 0.045 + 0.02 * Math.sin(i * 2.3)] as [number, number]), rim.map(() => wH), { n: 8, start: false, end: false, up: [0, 1, 0] });
  plate(B, R('PIT'), 16, [hp[0], 0.008, hp[2]], [1, 0, 0], [0, 0, -1], 0.3, 0.3, 0.0, wH, { rows: 4, cols: 6, oval: 1 });
}

const PAL = [
  { a: 0xc89a2a, b: 0x7a2228, c: 0xe8dcc0 },
  { a: 0x3a6a9a, b: 0xc8c0a8, c: 0xb83a2a },
];
function paintLefty(p: Page, x: BuildCtx) {
  const v = x.variant % 2, C = PAL[v], sd = x.seed % 997;
  const SKIN = makeRamp(0xa89a8a, 8, { hueShift: 0.02, spread: 0.55 }), DIRT = makeRamp(0x4a3a28, 5, { spread: 0.5 }), BLOOD = makeRamp(0x6a0a0a, 6, { spread: 0.7 });
  const RA = makeRamp(C.a, 7, { spread: 0.5 }), RB = makeRamp(C.b, 7, { spread: 0.5 }), RC = makeRamp(C.c, 7, { spread: 0.4 });
  // the arm: grey and hairless, wrinkled at every elbow, scraped and filthy from dragging over the ground
  const A = p.R('ARM');
  paintSkin(A, SKIN, { seed: sd + 1, veins: 22, vein: 0x6a6a82, mottle: 1.5, glint: 6 });
  for (const k of [3, 7, 11, 15, 19]) {
    const yy = (k / NA) * A.h;
    for (let i = -3; i <= 3; i++) for (let xx = 0; xx < A.w; xx++) if (hash(xx, i + k) < 0.7) A.blend(xx, yy + i, i % 2 ? SKIN[2] : SKIN[5], 0.45);
    A.glow(A.w / 2, yy, A.w * 0.3, 3, 0x6a3a5a, 0.4);
  }
  for (let yy = 0; yy < A.h; yy++) for (let xx = 0; xx < A.w; xx++) { const u = xx / A.w; if (u < 0.22 || u > 0.78) A.blend(xx, yy, DIRT[1 + ((xx + yy) & 1)], 0.4 + hash(xx, yy) * 0.3); }
  for (let i = 0; i < 18; i++) A.line(hash(i, sd + 2) * A.w, hash(i, sd + 3) * A.h, hash(i, sd + 2) * A.w + 3, hash(i, sd + 3) * A.h + 6, BLOOD[2], 0.6);
  // the sock: stripes round the leg, a darker heel and toe, pills, grass, blood soaked up from the cuff
  const stripes = (r: ReturnType<Page['R']>, along: 'x' | 'y', seed: number) => {
    r.fill(RC, (xx, yy) => { const s = Math.floor((along === 'y' ? yy : xx) / 5) % 4; return s === 1 ? -100 : s === 3 ? -200 : 3.6 + 0.8 * Math.cos((r.deg(xx) * Math.PI) / 180) + (r.fbm(xx, yy, 4, 2, seed) - 0.5) * 1; }, undefined, 0.5);
    for (let yy = 0; yy < r.h; yy++) for (let xx = 0; xx < r.w; xx++) {
      const s = Math.floor((along === 'y' ? yy : xx) / 5) % 4;
      const l = 3.4 + 0.8 * Math.cos((r.deg(xx) * Math.PI) / 180) + (r.fbm(xx, yy, 4, 2, seed) - 0.5) + ((xx + yy) % 2 ? 0.25 : -0.15);
      if (s === 1) r.put(xx, yy, RA, l, 0.5); else if (s === 3) r.put(xx, yy, RB, l - 0.3, 0.5);
    }
    for (let i = 0; i < r.w * r.h * 0.006; i++) r.blend(hash(i, seed + 9) * r.w, hash(i, seed + 8) * r.h, 0xffffff, 0.35);
  };
  const S = p.R('SOCK');
  stripes(S, 'y', sd + 4);
  S.fill(RB, (xx, yy) => 2.4 + (S.fbm(xx, yy, 3, 2, sd) - 0.5), (xx, yy) => yy > S.h * 0.82 && Math.abs(S.deg(xx)) < 150);   // toe
  for (let i = 0; i < 4; i++) S.glow(hash(i, sd + 5) * S.w, S.h * (0.2 + hash(i, 6) * 0.6), 4, 3, 0x6a7a3a, 0.3);
  const J = p.R('JAW');
  stripes(J, 'y', sd + 7);
  J.fill(RB, (xx, yy) => 2.2 + (J.fbm(xx, yy, 3, 2, sd + 1) - 0.5), (xx, yy) => Math.abs(J.deg(xx)) < 40);
  const Cf = p.R('CUFF');
  Cf.fill(RC, (xx, yy) => 3.2 + ((xx % 3) === 0 ? -1 : 0.3) + (hash(xx, yy) - 0.5) * 0.5);
  soak(Cf, Cf.w * 0.3, Cf.h * 0.5, 8, 6, BLOOD, sd + 9); soak(Cf, Cf.w * 0.75, Cf.h * 0.7, 6, 5, BLOOD, sd + 10);
  runs(S, S.w * 0.12, 0, 2, S.h * 0.25, BLOOD, sd + 11, 1);
  // the mouth: dark folded sock; the tongue red felt with a stitched line down the middle
  p.R('MOUTH').fill(makeRamp(0x3a1418, 4), (xx, yy) => 1.5 + (hash(xx, yy) - 0.5) * 0.8);
  const Tg = p.R('TONGUE');
  paintFelt(Tg, makeRamp(0xc83a3a, 6, { spread: 0.4 }), sd + 12, 3.2);
  for (let yy = 2; yy < Tg.h - 2; yy += 2) Tg.blend(Tg.w / 2, yy, 0x7a1a1a, 0.8);
  // buttons: four holes and a crossed thread
  const button = (r: ReturnType<Page['R']>, base: number, thread: number) => {
    const Rr = makeRamp(base, 5, { spread: 0.35 });
    r.fill(Rr, (xx, yy) => { const d = Math.hypot(xx + 0.5 - r.w / 2, yy + 0.5 - r.h / 2) / (r.w / 2); return d > 0.82 ? 3.6 : d > 0.7 ? 1.4 : 2.8 - d; });
    for (const [hx, hy] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) r.set(r.w / 2 + hx - 0.5, r.h / 2 + hy - 0.5, 0x1a1410);
    r.line(r.w / 2 - 2, r.h / 2 - 2, r.w / 2 + 1, r.h / 2 + 1, thread, 0.9); r.line(r.w / 2 + 1, r.h / 2 - 2, r.w / 2 - 2, r.h / 2 + 1, thread, 0.9);
  };
  button(p.R('BTN1'), 0xeeeae0, 0x1a1a3a);
  button(p.R('BTN2'), 0xb88a3a, 0xe8dcc0);
  paintFelt(p.R('NOSE'), makeRamp(0xd8322a, 5, { spread: 0.45 }), sd + 13, 2.8);
  p.R('YARN').fill(makeRamp(0xe0a040, 4), (xx, yy) => 1.8 + ((xx + yy) % 3 === 0 ? 1 : 0));
  // the hole: turned earth with grass in it, the pit black
  const So = p.R('SOIL');
  So.fill(DIRT, (xx, yy) => 2.4 + Math.cos((So.deg(xx) * Math.PI) / 180) * 0.5 + (So.fbm(xx, yy, 4, 2, sd + 14) - 0.5) * 1.6, undefined, 0.6);
  for (let i = 0; i < 20; i++) So.vline(hash(i, sd + 15) * So.w, 0, 2 + hash(i, 16) * 3, 0x5a8a2a, 0.8);
  const Pt = p.R('PIT');
  for (let yy = 0; yy < Pt.h; yy++) for (let xx = 0; xx < Pt.w; xx++) { const d = Math.hypot(xx + 0.5 - Pt.w / 2, yy + 0.5 - Pt.h / 2) / (Pt.w / 2); Pt.set(xx, yy, d > 0.85 ? DIRT[0] : 0x060404); }
  paintCap(p.R('CAP'), SKIN[3], 0xb84a4a, 0x5a0a0a);
}

const LEFTY_KIT: KitDef = { key: 'pg_lefty', variants: 2, W: 256, H: 256, bones: bonesLefty, layout: layoutLefty, build: buildLeftyMesh, paint: paintLefty, sphere: [0, 0, 0, 16] };
/** a Lefty rig (variant 0: mustard and maroon stripes; 1: navy and oatmeal) */
export function buildLefty(variant = 0): KitRig { return buildKitRig(LEFTY_KIT, variant, 0.42); }

// ------------------------------------------------------------------ the trail the sock left (the arm lies along it)
type Pt = [number, number];
/** keep a trail of world points from the hole to the sock: push forward, cut back when it retraces */
function trailStep(tr: Pt[], hx: number, hz: number, x: number, z: number) {
  if (!tr.length || Math.hypot(tr[0][0] - hx, tr[0][1] - hz) > 0.05) { tr.length = 0; tr.push([hx, hz]); }
  const last = tr[tr.length - 1];
  for (let k = tr.length - 2; k >= 0; k--) if (Math.hypot(tr[k][0] - x, tr[k][1] - z) < 0.3) { tr.length = k + 1; break; }
  if (Math.hypot(last[0] - x, last[1] - z) > 0.25) tr.push([x, z]);
  let L = 0;
  for (let i = 1; i < tr.length; i++) L += Math.hypot(tr[i][0] - tr[i - 1][0], tr[i][1] - tr[i - 1][1]);
  if (L > REACH * 1.5) { tr.length = 0; tr.push([hx, hz], [x, z]); }
  return L;
}
function trailLen(tr: Pt[]) { let L = 0; for (let i = 1; i < tr.length; i++) L += Math.hypot(tr[i][0] - tr[i - 1][0], tr[i][1] - tr[i - 1][1]); return L; }

const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _d = new THREE.Vector3(), _r = new THREE.Vector3();
/**
 * Lay the arm bones along a path given in the rig's local space (x, z pairs from the sock
 * back toward the hole); `hole` is the hole's local position. Whatever arm is left over
 * goes straight down into the hole.
 */
function layArm(K: KitRig, path: Pt[], hole: Pt, t: number, slack: number) {
  const P = K.parts;
  const pts: V3[] = [[AREST[0][0], AREST[0][1], AREST[0][2]]];
  // walk the path from the sock, resampling at the bone spacing; a little snake-wave in it
  let seg = 0, along = 0, cx = path[0]?.[0] ?? 0, cz = path[0]?.[1] ?? 0;
  const seglen = (i: number) => (i === 0 ? Math.hypot(AREST[1][0] - AREST[0][0], AREST[1][2] - AREST[0][2], AREST[1][1] - AREST[0][1]) : SEG);
  let inHole = false, depth = 0;
  for (let i = 1; i <= NA; i++) {
    let need = seglen(i - 1);
    if (!inHole) {
      while (need > 0 && seg < path.length - 1) {
        const ax = path[seg][0], az = path[seg][1], bx = path[seg + 1][0], bz = path[seg + 1][1];
        const L = Math.hypot(bx - ax, bz - az) || 1e-6, left = L - along;
        if (left >= need) { along += need; need = 0; cx = ax + ((bx - ax) * along) / L; cz = az + ((bz - az) * along) / L; }
        else { need -= left; seg++; along = 0; cx = bx; cz = bz; }
      }
      if (need > 0) inHole = true;
    }
    if (inHole) { depth += need > 0 ? need : SEG; need = 0; pts.push([hole[0], -0.05 - depth * 0.6, hole[1]]); continue; }
    const wave = Math.sin(i * 1.3 - t * 2.2) * 0.07 * slack;
    const y = i === 1 ? 0.14 : 0.055 + Math.max(0, Math.sin(i * 2.1 + t * 0.7)) * 0.015 * slack;
    pts.push([cx + wave * 0.3, y, cz + wave]);
  }
  for (let i = 0; i < NA; i++) {
    const b = P['a' + i]; if (!b) continue;
    const a = pts[i], n = pts[i + 1];
    b.position.set(a[0], a[1], a[2]);
    _r.set(AREST[i + 1][0] - AREST[i][0], AREST[i + 1][1] - AREST[i][1], AREST[i + 1][2] - AREST[i][2]).normalize();
    _d.set(n[0] - a[0], n[1] - a[1], n[2] - a[2]);
    if (_d.lengthSq() < 1e-8) _d.set(0, -1, 0);
    _d.normalize();
    _q.setFromUnitVectors(_r, _d);
    b.quaternion.copy(_q);
  }
  const H = P.hole; if (H) { H.position.set(hole[0], 0, hole[1]); H.rotation.set(0, 0, 0); }
}

// ------------------------------------------------------------------ animation
export type LeftyPose = 'lurk' | 'reach' | 'talk' | 'bite' | 'grab' | 'retract' | 'dead';
interface LeftyDrive { t: number; dt: number; md: string; mdT: number; speed: number; atk: number; flinch: number; dead: number; seed: number; yaw: number; talk: number }
function poseSock(K: KitRig, d: LeftyDrive) {
  const P = K.parts, t = d.t, s7 = d.seed * 7;
  P.base.rotation.set(0, 0, 0); P.base.position.set(0, 0, 0);
  const W = P.wrist;
  if (W.userData.p0) W.position.copy(W.userData.p0);
  // the head: a snake's head on a long neck: weaving, cocking, peering
  let pitch = Math.sin(t * 1.1 + s7) * 0.08, yaw = d.yaw + Math.sin(t * 0.7 + s7) * 0.25, roll = Math.sin(t * 0.9) * 0.12;
  let jaw = 0.06 + Math.max(0, Math.sin(t * 2.3)) * 0.04;
  let lift = 0;
  if (d.md === 'lurk') { lift = Math.sin(t * 0.8 + s7) * 0.04 - 0.04; yaw += Math.sin(t * 0.35) * 0.9; roll += Math.sin(t * 1.7) * 0.1; }
  if (d.md === 'reach' || d.md === 'retract') { pitch += Math.sin(t * 9) * 0.05; lift = 0.02 + Math.abs(Math.sin(t * 4.5)) * 0.04; roll += Math.sin(t * 4.5) * 0.15; }
  if (d.talk > 0) { jaw = 0.1 + Math.abs(Math.sin(t * 13 + Math.sin(t * 5) * 2)) * 0.45 * d.talk; pitch += Math.sin(t * 6.5) * 0.08 * d.talk; roll += Math.sin(t * 3.2) * 0.2 * d.talk; }
  if (d.md === 'bite' || d.atk > 0) { const a = Math.max(d.atk, d.md === 'bite' ? Math.max(0, 1 - d.mdT * 1.8) : 0); jaw = 0.75 * a + 0.05; pitch -= 0.35 * a; lift += 0.12 * a; }
  if (d.md === 'grab') { const c = Math.min(1, d.mdT / 0.4); jaw = c < 0.6 ? 0.7 : 0.05; pitch += 0.5 * Math.sin(c * Math.PI); lift -= 0.12 * Math.sin(c * Math.PI); }
  W.position.y += lift;
  W.rotation.set(pitch + d.flinch * -0.3, yaw, roll);
  P.upper.rotation.set(-jaw * 0.55, 0, 0);
  P.lower.rotation.set(jaw * 0.45, 0, 0);
  if (d.dead > 0) { W.position.y = (W.userData.p0?.y ?? 0.3) * (1 - d.dead * 0.75); W.rotation.set(0.3 * d.dead, yaw, 1.3 * d.dead); P.upper.rotation.x = -0.25; P.lower.rotation.x = 0.4; }
}
function animateLefty(rig: Rig, c: Creature, t: number, dt: number) {
  const K = rig as KitRig;
  const v = Math.floor(hashId(c.id) * 2);
  if (K.kit.who !== c.id) { K.kit.who = c.id; kitPersonalize(K, v); K.kit.m.trail = []; }
  kitSync(K);
  const n = netOf(c), ud = K.kit.m as Record<string, any>;
  if (n.md !== ud.lmd) { ud.lmd = n.md; ud.mdT = 0; }
  ud.mdT = (ud.mdT ?? 0) + dt;
  const hx: number = n.hx ?? c.home.x, hz: number = n.hz ?? c.home.z;
  const tr: Pt[] = ud.trail ?? (ud.trail = []);
  trailStep(tr, hx, hz, c.x, c.z);
  // the trail into the rig's own space (from the sock back to the hole)
  rig.root.updateMatrixWorld(true);
  const path: Pt[] = [];
  for (let i = tr.length - 1; i >= 0; i--) { _v.set(tr[i][0], 0, tr[i][1]); rig.body.worldToLocal(_v); path.push([_v.x, _v.z]); }
  // start the path just behind the cuff so the arm leaves the sock backward
  path.unshift([AREST[0][0], AREST[0][2]]);
  _v.set(hx, 0, hz); rig.body.worldToLocal(_v);
  const ac = attackCurve(rig, c, t);
  ud.dk = c.dead ? Math.min(1, (ud.dk ?? 0) + dt * 1.5) : 0;
  ud.talk = (ud.talk ?? 0) + (((n.ln && (G.time ?? 0) - (ud.lnT ?? -9) < 2.6) || n.md === 'talk' ? 1 : 0) - (ud.talk ?? 0)) * Math.min(1, dt * 6);
  const ln = n.ln as [number, string] | undefined;
  if (ln && ln[0] !== ud.lnSeen) { ud.lnSeen = ln[0]; ud.lnT = G.time ?? 0; }
  let yaw = 0;
  const p = localIn(c);
  if (p && !c.dead) { let a = Math.atan2(p.z - c.z, p.x - c.x) - c.facing; while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; yaw = Math.max(-0.9, Math.min(0.9, -a)); }
  ud.yaw = (ud.yaw ?? 0) + (yaw - (ud.yaw ?? 0)) * Math.min(1, dt * 5);
  poseSock(K, { t, dt, md: c.dead ? '' : (n.md ?? ''), mdT: ud.mdT, speed: c.speed, atk: Math.max(ac.wind, ac.strike), flinch: flinchOf(c), dead: ud.dk, seed: hashId(c.id, 2), yaw: ud.yaw, talk: c.dead ? 0 : ud.talk });
  layArm(K, path, [_v.x, _v.z], t, c.dead ? 0 : 1);
  uprightDead(K, c);
  const F = K.kit.F.fx.value; F.y += dt; F.z = Math.min(1, c.hitFlash / 0.15) * 0.4;
  if (c.speed > 0.4 && !c.dead && c.visibleToLocal && (ud.drag ?? 0) < t) { ud.drag = t + 0.5; playAt('carpet_rustle', c, 0.25, 10, 0.7 + Math.random() * 0.2); }
  linePoll(rig, c, 'LEFTY');
  if (p && !c.dead && c.visibleToLocal) {
    const dd = dist(p, c), L = trailLen(tr);
    if (L > 6 && dd < 10) thinkOnce(p, 'lefty_arm', 'The arm goes all the way back across the grass into a hole. It has elbows. It has a lot of elbows.', 90);
    else if (dd < 9) thinkOnce(p, 'lefty', ['A sock puppet. Button eyes. It is talking to me. Somebody\'s arm is in it.', 'Whose arm is that? It is grey. It is coming up out of the ground.'][Math.floor(t * 0.2) % 2], 100);
  }
}

// ------------------------------------------------------------------ host brain: it only goes so far
const HELLO = ['Hey-hey-HEY! Down here, pal! It\'s me, Lefty!', 'Psst! Pal! C\'mere. Lefty wants to tell you a secret.', 'Well, well, well. A new face for the Laundry Hour!'];
const WANT = ['Got anything shiny for old Lefty?', 'Don\'t mind the arm, pal. It\'s a long show.', 'Closer, closer. Lefty don\'t bite. Much!', 'You smell like the outside. Lefty misses the outside.'];
const LIMIT = ['Aw, c\'mon, a little closer. Lefty can\'t reach.', 'That\'s as far as the arm goes, pal. Your turn.', 'Hey! No fair! Come back over here!'];
const MINE = ['Finders keepers! Ha-HAAA!', 'Ooh, for my collection!', 'Into the basket it goes!'];
const BITE = ['Gotcha!', 'CHOMP!', 'Ha! Your face!'];
const OW = ['OW! Okay, okay! Commercial break!', 'Hey! That\'s my good arm!', 'Be right back, folks!'];
function setMd(c: Creature, md: string) { const n = net(c); if (n.md !== md) { n.md = md; c.mem.mdT = 0; } }
function thinkLefty(c: Creature, dt: number): boolean {
  const cs = CS(), z = zoneOf(c), m = c.mem, n = net(c);
  const ev = pulse(c);
  restoreStore(c, 'stash');
  m.mdT = (m.mdT ?? 0) + dt;
  // its hole: where it came up, or under the sandbox / the puppet booth if there is one close
  if (n.hx === undefined) {
    let hx = c.x, hz = c.z;
    const near = objectsNear(z, c.x, c.z, 10, (o: any) => o.key === 'pg_puppet_booth' || o.key === 'sandbox' || o.key === 'pg_sandpit', 4);
    if (near.length) { const o: any = near[0]; const ox = o.x + 0.5, oz = o.y + 1.5; if (walkable(z, Math.floor(ox), Math.floor(oz))) { hx = ox; hz = oz; } }
    n.hx = +hx.toFixed(2); n.hz = +hz.toFixed(2); c.x = hx; c.z = hz; c.home = { x: hx, z: hz };
  }
  const hx: number = n.hx, hz: number = n.hz;
  const tr: Pt[] = m.trail ?? (m.trail = []);
  const used = trailStep(tr, hx, hz, c.x, c.z);
  if (ev.hurt > 0) { m.hurtSum = (m.hurtSum ?? 0) + ev.hurt; if (m.hurtSum > 14) { m.hurtSum = 0; setMd(c, 'retract'); m.hide = G.time + 8 + rng.float(0, 5); say(c, rng.pick(OW)); playAt('plush_squeak', c, 0.8, 14, 0.6); return true; } }
  m.hurtSum = Math.max(0, (m.hurtSum ?? 0) - dt * 2);
  const md: string = n.md ?? 'lurk';
  // ---- retracting: back along its own trail into the hole
  if (md === 'retract') {
    c.setState('flee');
    if (tr.length < 2 || used < 0.3) { stop(c); c.x = hx; c.z = hz; setMd(c, 'lurk'); return true; }
    const tgt = tr[Math.max(0, tr.length - 3)];
    cs.moveTo(c, z, tgt[0], tgt[1], c.sp.run * 1.15, dt, 0.05);
    return true;
  }
  if (md === 'bite') { stop(c); c.setState('attack'); if (m.mdT > 0.9) { setMd(c, 'retract'); m.hide = G.time + 1.5; } return true; }
  if (md === 'grab') {
    stop(c); c.setState('eat');
    if (m.mdT > 0.5 && m.grabUid !== undefined) {
      const wi = floorItemsAround(z, c.x, c.z, 1.2).find((w) => w.item.uid === m.grabUid);
      if (wi) { takeFloorItem(c, wi, 'stash'); say(c, rng.pick(MINE)); playAt('cloth', c, 0.6, 10, 1); }
      m.grabUid = undefined;
    }
    if (m.mdT > 0.9) { setMd(c, 'retract'); m.hide = G.time + 2.5; }
    return true;
  }
  const hidden = G.time < (m.hide ?? 0);
  // ---- who is about: a unit near the hole (it can hear them over the grass), and anything loose on the ground
  const near = nearestUnit(c, REACH + 14);
  const unitNear = near && Math.hypot(near.p.x - hx, near.p.z - hz) < REACH + 7 && lineOfSightB(z, hx, hz, near.p.x, near.p.z) ? near.p : null;
  let item: { x: number; z: number; uid: number } | null = null;
  if (!hidden) for (const wi of floorItemsAround(z, hx, hz, REACH - 0.5)) {
    if (isPrecious(wi.item) || Math.hypot(wi.x - hx, wi.z - hz) > REACH - 0.5) continue;
    if (!item || Math.hypot(wi.x - c.x, wi.z - c.z) < Math.hypot(item.x - c.x, item.z - c.z)) item = { x: wi.x, z: wi.z, uid: wi.item.uid };
  }
  if (hidden || (!unitNear && !item)) {
    if (used > 0.4) { setMd(c, 'retract'); return true; }
    stop(c); c.setState('idle'); setMd(c, 'lurk');
    if (unitNear && (m.helloT ?? 0) < G.time) { m.helloT = G.time + 20; say(c, rng.pick(HELLO)); }
    return true;
  }
  // ---- an item, and no unit right on top of it: go and get it
  const p = unitNear;
  const pd = p ? dist(p, c) : 99;
  if (item && pd > 2.5) {
    setMd(c, 'reach'); c.setState('travel');
    if (Math.hypot(item.x - c.x, item.z - c.z) < 0.6) { setMd(c, 'grab'); m.grabUid = item.uid; return true; }
    if (used > REACH - 0.2 && trailLen([[c.x, c.z], [item.x, item.z]]) > 0.3) { m.hide = G.time + 3; setMd(c, 'retract'); return true; }
    cs.moveTo(c, z, item.x, item.z, c.sp.walk * 1.6, dt, 0.3);
    if (c.noiseCooldown <= 0) { say(c, rng.pick(WANT)); c.noiseCooldown = 9; }
    return true;
  }
  if (!p) { setMd(c, 'retract'); return true; }
  // ---- a unit: weave toward them, talking; bite when close; at the end of the arm, stop and coax
  if (m.greeted !== p.id) { m.greeted = p.id; say(c, rng.pick(HELLO)); m.talkT = G.time + 6; }
  if (pd < c.sp.attack!.range + p.radius && c.attackT <= 0) { faceTo(c, p.x, p.z); attack(c, p); setMd(c, 'bite'); say(c, rng.pick(BITE)); playAt('swivel_bite', c, 0.8, 12, 1.1); ruleShown(c); return true; }
  const atLimit = used > REACH - 0.25;
  const goingOut = Math.hypot(p.x - hx, p.z - hz) > Math.hypot(c.x - hx, c.z - hz) - 0.2;
  if (atLimit && goingOut) {
    setMd(c, 'talk'); stop(c); faceTo(c, p.x, p.z); c.setState('watch');
    if ((m.limT ?? 0) < G.time) { m.limT = G.time + 7; say(c, rng.pick(LIMIT)); ruleShown(c); }
    return true;
  }
  setMd(c, 'reach'); c.setState('chase');
  cs.moveTo(c, z, p.x, p.z, pd < 4 ? c.sp.run : c.sp.walk * 1.8, dt, 0.4);
  if ((m.talkT ?? 0) < G.time) { m.talkT = G.time + 7 + rng.float(0, 4); say(c, rng.pick(WANT)); }
  return true;
}

const LEFTY = def({
  key: 'pg_lefty', name: 'Lefty', code: 'PG-03 // PARASITE, PUPPET (BROADCAST-BOUND)', temperament: 'ambush', threat: 3,
  rule: { name: 'IT ONLY GOES SO FAR', text: 'It lives in a hole, and the arm only reaches about twelve metres from it. Inside that it comes for you, weaving and talking, and bites; it takes anything you drop down the hole with it. Past the end of the arm it can only talk. Hurt it and it pulls back underground for a while.', tell: 'A sock puppet, talking to me from a hole in the ground. There is an arm in it. A long one.' },
  hp: 60, walk: 1.2, run: 3.4, turn: 6, radius: 0.18, height: 0.42, sight: 16, fov: 2.6, hearing: 1.2,
  attack: { dmg: [7, 13], range: 0.75, cooldown: 1.6, kinds: ['bite', 'laceration'], corrupt: 0.02, knock: 0.1, grab: true },
  zones: ['playground'], weight: 1, group: [1, 1], maxPerZone: 2, diet: 'items',
  flags: { thief: true },
  sounds: { idle: 'vg_quick', alert: 'vg_light', attack: 'swivel_bite', hurt: 'plush_squeak', death: 'plush_rip', step: 'carpet_rustle' },
  scan: {
    cls: 'Parasite / puppet, broadcast-bound',
    notes: [
      'A striped sock puppet from a children\'s programme, worn on a human arm that does not end.',
      'It lives in a hole. The arm lies along the ground wherever the sock has been, back to the hole.',
      'It reaches about twelve metres. Inside that, it bites, and steals anything left on the ground.',
      'Hurt it and it retreats underground for a while. What it stole is in its sock when it dies.',
    ],
  },
  gore: { blood: 'red', tint: 0xffffff, flesh: 0xb8a89a, sever: ['upper', 'lower'], head: 'wrist', gib: false },
  build: () => buildLefty(0), animate: animateLefty, think: thinkLefty,
});
(LEFTY as any).handlesSevered = true;
onPlayerHit('pg_lefty', (p: Player) => {
  bus.emit('think', p, ['It bit me. A sock bit me. There are teeth in there, under the felt.', 'Its grip is a person\'s grip. Fingers. Through the sock.'][Math.floor(Math.random() * 2)]);
});
onKilled('pg_lefty', (c) => { void c; });

// ------------------------------------------------------------------ stand-alone posing (gallery, video)
const DEF_PATH: Pt[] = Array.from({ length: 30 }, (_, i) => [Math.sin(i * 0.35) * 1.2 * Math.min(1, i / 6), -0.2 - i * 0.4]);
/** pose a Lefty rig with no game running; path: local [x, z] points from the sock back to the hole (the last one is the hole) */
export function poseLefty(rig: KitRig, t: number, dt: number, pose: LeftyPose = 'reach', o: { path?: Pt[]; talk?: number; variant?: number } = {}) {
  if (o.variant !== undefined && rig.kit.entry.variant !== o.variant % 2) kitPersonalize(rig, o.variant % 2);
  kitSync(rig);
  const ud = rig.kit.m as Record<string, any>;
  if (ud.gp !== pose) { ud.gp = pose; ud.gT = 0; }
  ud.gT = (ud.gT ?? 0) + dt;
  const path = pose === 'lurk' ? [[0, -0.1], [0, -0.12]] as Pt[] : (o.path ?? DEF_PATH);
  const hole = path[path.length - 1];
  poseSock(rig, { t, dt, md: pose === 'dead' ? '' : pose, mdT: pose === 'bite' ? ud.gT % 1.2 : pose === 'grab' ? ud.gT % 1 : ud.gT, speed: pose === 'reach' ? 1.2 : 0, atk: 0, flinch: 0, dead: pose === 'dead' ? 1 : 0, seed: 0.3, yaw: 0, talk: o.talk ?? (pose === 'talk' ? 1 : 0) });
  layArm(rig, [[AREST[0][0], AREST[0][2]], ...path], hole, t, pose === 'dead' ? 0 : 1);
  rig.kit.F.fx.value.y += dt;
}
LEFTY.animateGallery = (rig: Rig, t: number) => {
  const u = new URLSearchParams(location.search);
  const q = (u.get('pose') || ['reach', 'talk', 'bite', 'lurk'][Math.floor(t / 5) % 4]) as LeftyPose;
  poseLefty(rig as KitRig, t, 1 / 60, q, { variant: u.get('v') ? Number(u.get('v')) : 0 });
};
horrify(LEFTY, { twitch: 0.2, snap: 0.1, breathe: 0.0, lunge: 0.15, flop: false, parts: /upper|lower/, keepMaterials: false });
