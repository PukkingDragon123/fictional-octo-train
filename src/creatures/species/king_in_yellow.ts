import { horrify } from '../kit/horror';
import * as THREE from 'three';
import { def, Rig } from '../species';
import { makeRamp } from '../../gfx/pixel';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import type { Creature } from '../creature';
import type { Player } from '../../entities/player';
import { CS, zoneOf, pulse, stop, walkable } from '../behaviors_a';
import { net, netOf, playAt, hashId, fakeCreature, rng, localIn, thinkOnce, dist, playersIn, live, lineOfSightB } from '../behaviors_b';
import { KitDef, KitRig, BoneSpec, SkinB, BuildCtx, Page, V3, Wt, buildKitRig, kitSync, hash, nearestSurvivor, lookAngles } from '../kit/humanoids';
import { chain, sac, blade, plate, paintSkin, paintCap, paintCloth } from '../kit/organic';
import { createItem } from '../../items/factory';
import { dropItem } from '../../items/worldItems';
import { INHABITANTS } from '../lore';
import { revealAll } from '../../scan/lorebook';
import '../../audio/sounds_creatures_c';

// =====================================================================================
// THE KING IN YELLOW — a tall figure, the shape of a man and a head too tall,
// in tattered yellow robes under a pallid mantle, standing very still in the
// deepest rooms. Nothing resolves it: the silhouette wavers, an after-image
// lags behind every movement, the robe frays into grain at the hem, and the
// face is a deep hood over a smeared, out-of-focus dark. It does not hunt. It
// waits to be looked at. Whoever stares too long sees its face (the player
// never does: the picture blurs and blooms yellow first), understands
// everything at once, and does not survive the understanding.
// =====================================================================================

const SIDES = [['L', 1], ['R', -1]] as const;
const SKIRT = 11;   // hanging robe panels round the hips
const MANT = 9;     // ragged strips under the mantle
const A = (i: number, n: number, off = 0) => (i / n) * Math.PI * 2 + off;
function bonesK(): BoneSpec[] {
  const b: BoneSpec[] = [
    { name: 'base', parent: '', at: [0, 0, 0] },
    { name: 'hips', parent: 'base', at: [0, 1.12, 0] },
    { name: 'spine', parent: 'hips', at: [0, 0.3, -0.02] },
    { name: 'chest', parent: 'spine', at: [0, 0.3, 0.0] },
    { name: 'neck', parent: 'chest', at: [0, 0.26, 0.03] },
    { name: 'head', parent: 'neck', at: [0, 0.13, 0.04] },
    { name: 'hoodtip', parent: 'head', at: [0, 0.1, -0.12] },
  ];
  for (const [s, k] of SIDES) {
    b.push(
      { name: 'uarm' + s, parent: 'chest', at: [k * 0.22, 0.17, -0.02] },
      { name: 'farm' + s, parent: 'uarm' + s, at: [k * 0.04, -0.36, 0.03] },
      { name: 'hand' + s, parent: 'farm' + s, at: [k * 0.005, -0.34, 0.05] },
      { name: 'fing' + s, parent: 'hand' + s, at: [0, -0.1, 0.012] },
      { name: 'tip' + s, parent: 'fing' + s, at: [0, -0.075, 0.012] },
      { name: 'thigh' + s, parent: 'hips', at: [k * 0.1, -0.04, 0] },
      { name: 'shin' + s, parent: 'thigh' + s, at: [0, -0.5, 0.03] },
    );
  }
  for (let i = 0; i < SKIRT; i++) {
    const a = A(i, SKIRT, 0.2), c = Math.cos(a), s = Math.sin(a);
    b.push(
      { name: 'rA' + i, parent: 'hips', at: [c * 0.25, -0.2, s * 0.2] },
      { name: 'rB' + i, parent: 'rA' + i, at: [c * 0.03, -0.38, s * 0.03] },
      { name: 'rC' + i, parent: 'rB' + i, at: [c * 0.03, -0.36, s * 0.03] },
    );
  }
  for (let i = 0; i < MANT; i++) {
    const a = A(i, MANT, 0.35), c = Math.cos(a), s = Math.sin(a);
    b.push({ name: 'mA' + i, parent: 'chest', at: [c * 0.28, -0.04, s * 0.2 - 0.02] }, { name: 'mB' + i, parent: 'mA' + i, at: [c * 0.03, -0.24, s * 0.03] });
  }
  return b;
}
function layoutK(p: Page) {
  p.reg('ROBE', 64, 80); p.reg('SKIRT', 32, 56); p.reg('MANTLE', 48, 32); p.reg('HOOD', 48, 32); p.reg('SLEEVE', 32, 32);
  p.reg('VOID', 32, 32); p.reg('SKIN', 24, 32); p.reg('MSTRIP', 16, 24); p.reg('LINING', 16, 16); p.reg('NAIL', 8, 8); p.reg('CAP', 8, 8);
}
function buildK(B: SkinB, x: BuildCtx) {
  const bi = x.bi, R = x.R;
  const HP = bi('hips'), SP = bi('spine'), CH = bi('chest'), NK = bi('neck'), HD = bi('head'), HT = bi('hoodtip');
  const TL = bi('thighL'), TR = bi('thighR'), SL = bi('shinL'), SR = bi('shinR');
  // the robe: one long fall of heavy cloth from the collar to the floor, belted loosely at the hips, deep folds
  const prof: [number, number, number, number, Wt][] = [
    [2.0, 0.09, 0.08, 0.02, [NK, 0.5, CH, 0.5]], [1.9, 0.2, 0.14, 0.0, [CH, 1]], [1.75, 0.25, 0.17, -0.02, [CH, 1]], [1.56, 0.23, 0.16, -0.02, [CH, 0.5, SP, 0.5]],
    [1.36, 0.2, 0.15, -0.015, [SP, 1]], [1.16, 0.235, 0.18, 0, [SP, 0.3, HP, 0.7]], [1.1, 0.25, 0.19, 0, [HP, 1]], [0.88, 0.26, 0.2, 0, [HP, 0.6, TL, 0.2, TR, 0.2]],
    [0.6, 0.27, 0.21, 0.01, [HP, 0.3, SL, 0.35, SR, 0.35]], [0.32, 0.28, 0.22, 0.01, [SL, 0.5, SR, 0.5]], [0.1, 0.29, 0.23, 0.01, [SL, 0.5, SR, 0.5]],
  ];
  sac(B, R('ROBE'), 1, prof.map(([y, , , z]) => [0, y, z] as V3), prof.map(([, a, b]) => [a, b] as [number, number]), prof.map((p) => p[4]), {
    n: 18, up: [0, 0, 1], end: false,
    bump: (a, t) => (Math.sin(a * 6 + t * 2.5) * 0.045 + Math.sin(a * 13 + 1.3) * 0.018) * (0.25 + t * 1.1) + (t > 0.45 && t < 0.5 ? -0.05 : 0),
  });
  // a cord belt at the waist, knotted, the ends hanging
  sac(B, R('LINING'), 2, [[0, 1.13, -0.005], [0, 1.12, 0.0], [0, 1.11, 0.005]], [[0.255, 0.2], [0.262, 0.205], [0.255, 0.2]], [[HP, 1], [HP, 1], [HP, 1]], { n: 18, up: [0, 0, 1], start: false, end: false, bump: (a) => Math.sin(a * 22) * 0.02 });
  for (const k of [1, -1]) sac(B, R('LINING'), 3, [[k * 0.06, 1.1, 0.2], [k * 0.07, 0.95, 0.21], [k * 0.09, 0.78, 0.2]], [[0.012, 0.012], [0.011, 0.011], [0.016, 0.016]], [[HP, 1], [HP, 1], [HP, 1]], { n: 5 });
  // the skirt: long overlapping panels hung from the belt, each its own fall; the hems drag and fray
  for (let i = 0; i < SKIRT; i++) {
    const a = A(i, SKIRT, 0.2), c = Math.cos(a), s = Math.sin(a);
    const ra = x.rest('rA' + i), rb = x.rest('rB' + i), rc = x.rest('rC' + i);
    const lenJ = hash(i, 4) * 0.12;
    const tip: V3 = [rc[0] + c * 0.04, Math.max(0.0, 0.04 - lenJ), rc[2] + s * 0.04];
    blade(B, R('SKIRT'), [[ra[0], ra[1] + 0.12, ra[2]], ra, rb, rc, tip], [0.2, 0.22, 0.24, 0.23, 0.17 - hash(i, 5) * 0.07], [-s, 0, c],
      [[HP, 1], [bi('rA' + i), 1], [bi('rB' + i), 1], [bi('rC' + i), 1], [bi('rC' + i), 1]], { offset: -0.5, edge: 0.45, seed: 10 + i });
  }
  // the pallid mantle over the shoulders, a cowl rising to the hood, and its ragged lower edge
  sac(B, R('MANTLE'), 4, [[0, 2.06, 0.0], [0, 2.0, -0.01], [0, 1.9, -0.02], [0, 1.78, -0.025], [0, 1.68, -0.025]], [[0.12, 0.11], [0.2, 0.16], [0.28, 0.2], [0.3, 0.215], [0.295, 0.21]],
    [[NK, 0.6, HD, 0.4], [NK, 0.5, CH, 0.5], [CH, 1], [CH, 1], [CH, 1]], { n: 18, up: [0, 0, 1], start: false, end: false, bump: (a, t) => Math.sin(a * 5 + 0.6) * 0.05 * t + Math.sin(a * 11) * 0.015 });
  for (let i = 0; i < MANT; i++) {
    const a = A(i, MANT, 0.35), c = Math.cos(a), s = Math.sin(a);
    const ma = x.rest('mA' + i), mb = x.rest('mB' + i);
    blade(B, R('MSTRIP'), [[c * 0.28, 1.74, s * 0.2 - 0.02], ma, mb, [mb[0] + c * 0.02, mb[1] - 0.1 - hash(i, 7) * 0.12, mb[2] + s * 0.02]], [0.21, 0.22, 0.19, 0.09], [-s, 0, c],
      [[CH, 1], [bi('mA' + i), 1], [bi('mB' + i), 1], [bi('mB' + i), 1]], { offset: -0.5, edge: 0.4, seed: 40 + i });
  }
  // the hood: a deep cowl, its peak slumped back, the opening a little too wide and a little too dark
  const hd = x.rest('head');
  sac(B, R('HOOD'), 5, [[0, hd[1] + 0.02, hd[2] - 0.27], [0, hd[1] + 0.05, hd[2] - 0.17], [0, hd[1] + 0.05, hd[2] - 0.07], [0, hd[1] + 0.04, hd[2] + 0.03], [0, hd[1] + 0.02, hd[2] + 0.12], [0, hd[1] - 0.005, hd[2] + 0.19]],
    [[0.03, 0.04], [0.12, 0.15], [0.185, 0.21], [0.2, 0.215], [0.19, 0.2], [0.178, 0.188]], [[HT, 1], [HT, 0.6, HD, 0.4], [HD, 1], [HD, 1], [HD, 1], [HD, 1]],
    { n: 16, up: [0, 1, 0], end: false, bump: (a, t) => Math.exp(-(a * a) / 0.2) * 0.1 * (1 - t) + Math.sin(a * 7 + t * 9) * 0.035 * t + Math.sin(a * 3 + t * 13) * 0.025 });
  // the cowl falling from the hood onto the shoulders, under the mantle
  sac(B, R('HOOD'), 15, [[0, hd[1] - 0.02, hd[2] - 0.02], [0, hd[1] - 0.1, hd[2] - 0.04], [0, 1.93, -0.03]], [[0.18, 0.19], [0.2, 0.19], [0.25, 0.2]], [[HD, 1], [NK, 0.5, HD, 0.5], [CH, 1]],
    { n: 16, up: [0, 0, 1], start: false, end: false, bump: (a, t) => Math.sin(a * 6 + 1) * 0.06 * t });
  // the rolled lip of the opening
  sac(B, R('HOOD'), 6, [[0, hd[1] - 0.005, hd[2] + 0.175], [0, hd[1] - 0.01, hd[2] + 0.2]], [[0.178, 0.188], [0.186, 0.196]], [[HD, 1], [HD, 1]], { n: 14, up: [0, 1, 0], start: false, end: false, bump: (a) => Math.sin(a * 9) * 0.03 });
  // inside: no head anyone can make out. A dark lining, and in it the smear where the face would be
  sac(B, R('LINING'), 7, [[0, hd[1], hd[2] - 0.1], [0, hd[1], hd[2] + 0.0], [0, hd[1], hd[2] + 0.14]], [[0.08, 0.09], [0.16, 0.17], [0.165, 0.175]], [[HD, 1], [HD, 1], [HD, 1]], { n: 12, up: [0, 1, 0], emis: 1 });
  plate(B, R('VOID'), 8, [0, hd[1] - 0.01, hd[2] + 0.165], [1, 0, 0], [0, 1, 0], 0.168, 0.178, -0.07, [HD, 1], { rows: 8, cols: 8, emis: 1 });
  // the arms in long bell sleeves, the cuffs fraying; pale hands with fingers a joint too long
  for (const [s, k] of SIDES) {
    const hp = x.rest('hand' + s);
    chain(B, x, R('SLEEVE'), 9 + (k > 0 ? 0 : 1), { bones: ['uarm' + s, 'farm' + s], tip: [hp[0] + k * 0.01, hp[1] + 0.02, hp[2] + 0.01], r: (t) => 0.07 + t * t * 0.1, n: 12, rings: 3, start: false, end: false, knuckle: 0.12,
      bump: (a, t) => Math.sin(a * 5 + t * 6) * 0.06 * t });
    for (let j = 0; j < 4; j++) {
      const a = (j / 4) * Math.PI * 2 + 0.4;
      const p0: V3 = [hp[0] + Math.cos(a) * 0.14, hp[1] + 0.06, hp[2] + Math.sin(a) * 0.14];
      blade(B, R('MSTRIP'), [p0, [p0[0] + Math.cos(a) * 0.02, p0[1] - 0.12, p0[2] + Math.sin(a) * 0.02], [p0[0] + Math.cos(a) * 0.03, p0[1] - 0.2 - hash(j, k) * 0.1, p0[2] + Math.sin(a) * 0.03]], [0.08, 0.07, 0.03],
        [-Math.sin(a), 0, Math.cos(a)], [[bi('farm' + s), 1], [bi('hand' + s), 1], [bi('hand' + s), 1]], { offset: -0.5, edge: 0.5, seed: 60 + j + (k > 0 ? 0 : 5) });
    }
    // wrist, a narrow palm, four long fingers and a thumb
    const H = bi('hand' + s), F = bi('fing' + s), T = bi('tip' + s);
    sac(B, R('SKIN'), 11, [[hp[0], hp[1] + 0.07, hp[2] - 0.01], [hp[0], hp[1] + 0.02, hp[2]], [hp[0], hp[1] - 0.05, hp[2] + 0.008], [hp[0], hp[1] - 0.095, hp[2] + 0.012]],
      [[0.026, 0.022], [0.03, 0.02], [0.038, 0.016], [0.036, 0.014]], [[bi('farm' + s), 0.4, H, 0.6], [H, 1], [H, 1], [H, 0.6, F, 0.4]], { n: 8, up: [0, 0, 1] });
    for (let f = 0; f < 4; f++) {
      const xo = hp[0] + k * (f - 1.5) * 0.017, zo = hp[2] + 0.012 + Math.abs(f - 1.5) * -0.004;
      const L = 1 - Math.abs(f - 1.2) * 0.08;
      const pts: V3[] = [[xo, hp[1] - 0.09, zo], [xo, hp[1] - 0.09 - 0.055 * L, zo + 0.006], [xo, hp[1] - 0.09 - 0.11 * L, zo + 0.012], [xo, hp[1] - 0.09 - 0.16 * L, zo + 0.014], [xo, hp[1] - 0.09 - 0.19 * L, zo + 0.01]];
      sac(B, R('SKIN'), 12, pts, [[0.0095, 0.009], [0.0085, 0.0085], [0.008, 0.0075], [0.0065, 0.006], [0.002, 0.002]], [[H, 0.5, F, 0.5], [F, 1], [F, 0.5, T, 0.5], [T, 1], [T, 1]],
        { n: 6, up: [0, 0, 1], start: false, bump: (a, t) => Math.exp(-((t - 0.25) * (t - 0.25)) / 0.004) * 0.25 + Math.exp(-((t - 0.55) * (t - 0.55)) / 0.004) * 0.2 });
      sac(B, R('NAIL'), 13, [[xo, pts[3][1] + 0.01, pts[3][2] + 0.006], [xo, pts[4][1] - 0.008, pts[4][2] + 0.004]], [[0.006, 0.003], [0.002, 0.001]], [[T, 1], [T, 1]], { n: 4 });
    }
    sac(B, R('SKIN'), 14, [[hp[0] + k * 0.03, hp[1] - 0.02, hp[2] + 0.01], [hp[0] + k * 0.045, hp[1] - 0.06, hp[2] + 0.03], [hp[0] + k * 0.045, hp[1] - 0.1, hp[2] + 0.045]], [[0.011, 0.01], [0.009, 0.009], [0.003, 0.003]], [[H, 1], [H, 1], [H, 1]], { n: 6, start: false });
  }
}
function paintK(p: Page) {
  const Y = makeRamp(0xc8981a, 8, { hueShift: 0.04, spread: 0.95 });
  // the robe: heavy silk gone to felt, folds, rot holes, and grime rising from the hem
  const rb = p.R('ROBE');
  paintCloth(rb, Y, { seed: 3, folds: 16, holes: 9, hole: 0x1a1206, stain: 12, base: 4.2 });
  for (let yy = 0; yy < rb.h; yy++) for (let xx = 0; xx < rb.w; xx++) {
    const v = 1 - yy / rb.h;
    if (v < 0.35) rb.blend(xx, yy, 0x3a2a0a, (0.35 - v) * 1.4 * (0.6 + hash(xx, yy) * 0.4));
    if (v < 0.22 && hash(xx * 3, yy * 7) < (0.22 - v) * 2.2) rb.set(xx, yy, hash(xx, yy * 5) < 0.5 ? 0xf0d060 : 0x1a1004); // fraying into grain
  }
  // embroidery at the collar: a sign nobody can draw from memory
  for (let i = 0; i < 40; i++) { const xx = (i * 7.3) % rb.w, yy = 2 + Math.floor(hash(i, 2) * 6); rb.set(xx, yy, 0x6a4a08); rb.set(xx + 1, yy + 1, 0xe8c040); }
  const sk = p.R('SKIRT');
  paintCloth(sk, makeRamp(0xd0a020, 7, { hueShift: 0.05, spread: 0.9 }), { seed: 5, folds: 4, holes: 6, hole: 0x1a1206, stain: 6, base: 4 });
  for (let yy = 0; yy < sk.h; yy++) for (let xx = 0; xx < sk.w; xx++) {
    const v = 1 - yy / sk.h;
    if (v < 0.4) sk.blend(xx, yy, 0x2a1e08, (0.4 - v) * 1.5);
    if (v < 0.25 && hash(xx * 5, yy * 3) < (0.25 - v) * 2.5) sk.set(xx, yy, hash(xx * 2, yy) < 0.45 ? 0xf8e080 : 0x120c02);
  }
  const PM = makeRamp(0xb8b2a0, 7, { hueShift: -0.02, spread: 0.75 });
  paintCloth(p.R('MANTLE'), PM, { seed: 7, folds: 10, holes: 4, hole: 0x3a3020, stain: 8, base: 4.4 });
  const mt = p.R('MANTLE'); for (let i = 0; i < 26; i++) mt.blend(hash(i, 3) * mt.w, mt.h - 1 - hash(i, 4) * 10, 0xc8a030, 0.35); // yellow wicking up into the pale
  paintCloth(p.R('MSTRIP'), PM, { seed: 9, folds: 2, holes: 3, hole: 0x3a3020, stain: 3 });
  const ms = p.R('MSTRIP'); for (let yy = ms.h - 6; yy < ms.h; yy++) for (let xx = 0; xx < ms.w; xx++) if (hash(xx, yy * 3) < 0.35) ms.set(xx, yy, hash(xx * 7, yy) < 0.5 ? 0xf0e8d0 : 0x2a2418);
  paintCloth(p.R('HOOD'), makeRamp(0x9a7210, 7, { hueShift: 0.05, spread: 0.95 }), { seed: 11, folds: 14, holes: 3, hole: 0x0a0602, stain: 7, base: 3.6 });
  const hd = p.R('HOOD'); for (let yy = 0; yy < hd.h; yy++) for (let xx = 0; xx < hd.w; xx++) if (yy > hd.h * 0.7) hd.blend(xx, yy, 0x1a1004, (yy / hd.h - 0.7) * 2.2); // shadow at the lip
  paintCloth(p.R('SLEEVE'), Y, { seed: 13, folds: 9, holes: 4, hole: 0x1a1206, stain: 5 });
  const sl = p.R('SLEEVE'); for (let yy = sl.h - 7; yy < sl.h; yy++) for (let xx = 0; xx < sl.w; xx++) { sl.blend(xx, yy, 0x2a1e08, 0.4); if (hash(xx * 3, yy) < 0.3) sl.set(xx, yy, 0xf0d060); }
  // the void: not black, not a face; a dark smeared sideways as if the picture slipped while it was taken
  const vd = p.R('VOID');
  vd.fill(makeRamp(0x2a200a, 6, { spread: 0.9 }), (xx, yy) => {
    const dx = (xx + 0.5) / vd.w - 0.5, dy = (yy + 0.5) / vd.h - 0.5, r = Math.hypot(dx * 1.1, dy);
    const smear = Math.sin(yy * 0.9 + Math.sin(xx * 0.15) * 1.5) * 0.35 + (vd.fbm(xx * 0.3, yy * 2, 3, 2, 17) - 0.5) * 1.4;
    return Math.max(0, 0.2 + r * 5.5 + smear * (0.6 - r));
  }, undefined, 0.9);
  for (let i = 0; i < 9; i++) { const yy = 6 + hash(i, 9) * (vd.h - 12), x0 = 6 + hash(i, 10) * 8; vd.hline(x0, x0 + 6 + hash(i, 11) * 10, yy, i % 3 ? 0x2a2208 : 0x4a3a10, 0.6); }
  const ln = p.R('LINING'); ln.fill(makeRamp(0x1a1406, 4, { spread: 0.6 }), (xx, yy) => 1 + (ln.fbm(xx, yy, 2, 2, 5) - 0.5) * 1.5);
  // hands: pallid, a yellow cast under the nails, blue at the knuckles
  paintSkin(p.R('SKIN'), makeRamp(0xc8c2a4, 7, { hueShift: 0.03, spread: 0.6 }), { seed: 15, veins: 10, vein: 0x6a7088, mottle: 1.1, glint: 4 });
  p.R('NAIL').fill(makeRamp(0x6a5a30, 4), (xx) => 1.5 + (xx & 1));
  paintCap(p.R('CAP'), 0xc8981a, 0xe8d070, 0x3a2a08);
}
const KING_KIT: KitDef = { key: 'king_in_yellow', variants: 1, W: 256, H: 256, bones: bonesK, layout: layoutK, build: buildK, paint: paintK, sphere: [0, 1.3, 0, 1.6] };

// ------------------------------------------------------------------ never in focus: a blur pass on its own material, and after-images
/**
 * Its material, patched: the silhouette wavers (vertex drift), grazing faces
 * and the hem dissolve into a crawling dither, the whole figure shimmers. The
 * same patch with a heavy dissolve draws the after-images.
 * uKiy: x time, y ground height, z extra dissolve (after-images), w drift.
 */
function blurMaterial(K: KitRig, ghost: number): THREE.Vector4 {
  const m = K.kit.material as THREE.MeshLambertMaterial & { userData: Record<string, any> };
  const u = { value: new THREE.Vector4(0, 0, ghost, 0.01) };
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey.bind(m);
  m.onBeforeCompile = (shader, renderer) => {
    prev.call(m, shader, renderer);
    shader.uniforms.uKiy = u;
    // no ink line round it: everything else in the picture is outlined, it never quite is
    if (shader.uniforms.uWOutline) shader.uniforms.uWOutline = { value: 0 };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform vec4 uKiy;').replace('vec4 nWp = vec4( transformed, 1.0 );', `
{ float ph = transformed.y * 6.0 + uKiy.x * 2.7;
  transformed.x += (sin(ph) + sin(ph * 2.3 + 1.7) * 0.5) * uKiy.w;
  transformed.z += cos(transformed.y * 4.3 + uKiy.x * 2.1) * uKiy.w * 0.7; }
vec4 nWp = vec4( transformed, 1.0 );`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec4 uKiy;').replace('diffuseColor *= sampledDiffuseColor;', `diffuseColor *= sampledDiffuseColor;
{
  vec2 fc = floor(gl_FragCoord.xy);
  float tf = floor(uKiy.x * 9.0);
  float nz = fract(sin(dot(fc + vec2(tf * 3.1, tf * 1.7), vec2(12.9898, 78.233))) * 43758.5453);
  vec3 fn = normalize(cross(dFdx(vWPos), dFdy(vWPos)));
  vec3 vd = normalize(vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]));
  float rim = 1.0 - abs(dot(fn, vd));
  float hy = clamp(1.0 - (vWPos.y - uKiy.y) / 0.38, 0.0, 1.0);
  float cut = smoothstep(0.5, 0.97, rim) * 0.75 + hy * hy * 0.85 + uKiy.z;
  if ((vEmis < 0.5 || uKiy.z > 0.0) && nz < cut) discard;
}`);
  };
  m.customProgramCacheKey = () => prevKey() + '|kiy';
  m.needsUpdate = true;
  return u.value;
}
interface Ghost { rig: KitRig; u: THREE.Vector4; lag: number; ph: number }
const GHOSTS = new WeakMap<Rig, { u: THREE.Vector4; ghosts: Ghost[] }>();
function buildKing(): Rig {
  const rig = buildKitRig(KING_KIT, 0, 2.35);
  const u = blurMaterial(rig, 0);
  const ghosts: Ghost[] = [0.55, 0.72].map((d, i) => {
    const g = buildKitRig(KING_KIT, 0, 2.35);
    g.kit.mesh.castShadow = false;
    g.kit.F.tint.value.set(1.35, 1.15, 0.55, 0.6);
    rig.root.add(g.root);
    return { rig: g, u: blurMaterial(g, d), lag: i ? 1.6 : 3.2, ph: i * 2.1 };
  });
  GHOSTS.set(rig, { u, ghosts });
  return rig;
}
function ghostSync(rig: Rig, t: number, dt: number, smear: number, groundY: number) {
  const G_ = GHOSTS.get(rig); if (!G_) return;
  const K = rig as KitRig;
  G_.u.x = t; G_.u.y = groundY; G_.u.w = 0.006 + smear * 0.03;
  for (const g of G_.ghosts) {
    const k = 1 - Math.exp(-dt * g.lag);
    const gb = g.rig.kit.bones;
    K.kit.bones.forEach((b, i) => { gb[i].quaternion.slerp(b.quaternion, k); gb[i].position.lerp(b.position, k); });
    g.rig.body.position.lerp(rig.body.position, k);
    // the after-image wanders off the figure and back, further when it is paying attention
    const amp = 0.05 + smear * 0.16;
    g.rig.root.position.set(Math.sin(t * 0.63 + g.ph) * amp, Math.sin(t * 1.7 + g.ph) * 0.015, Math.cos(t * 0.41 + g.ph * 1.3) * amp * 0.7);
    g.rig.root.scale.setScalar(1.01 + smear * 0.03);
    g.u.x = t; g.u.y = groundY; g.u.w = G_.u.w * 1.6;
    g.rig.kit.F.fx.value.y += dt;
  }
}

// ------------------------------------------------------------------ animation (every peer) and the gaze (the local operator)
function animateKing(rig: Rig, c: Creature, t: number, dt: number) {
  const K = rig as KitRig;
  kitSync(K);
  const P = rig.parts;
  const R = (n: string, x: number, y = 0, z = 0) => { const o = P[n]; if (o) o.rotation.set(x, y, z); };
  const ud = rig.root.userData as Record<string, number>;
  const n = netOf(c);
  const seed = hashId(c.id);
  // u: how far it has turned its attention (the hood) on someone. (studio: 'warn' shows it attending)
  const want = n.u !== undefined ? Number(n.u) || 0 : c.state === 'warn' ? 1 : 0;
  const u = (ud.u = (ud.u ?? want) + (want - (ud.u ?? want)) * Math.min(1, dt * 1.8));
  const tgt = nearestSurvivor(c, 22);
  let yaw = 0, pitch = 0;
  if (tgt) [yaw, pitch] = lookAngles(c, tgt.x, tgt.z, tgt.y, 2.2, 1.3, 0.6);
  // the head turns toward whoever it attends to; at rest it drifts, very slowly, as if listening
  const idleYaw = Math.sin(t * 0.11 + seed * 7) * 0.35;
  ud.yaw = (ud.yaw ?? 0) + ((tgt ? yaw * (0.25 + u * 0.75) : idleYaw) - (ud.yaw ?? 0)) * Math.min(1, dt * (0.3 + u * 1.2));
  const tilt = Math.sin(t * 0.17 + seed * 3) * 0.08 + u * 0.22 * (seed < 0.5 ? 1 : -1);
  // a tall thing balancing: the faintest sway, no breath
  R('hips', 0, ud.yaw * 0.08, Math.sin(t * 0.31 + seed) * 0.012);
  R('spine', 0.02 + u * 0.05, ud.yaw * 0.15, Math.sin(t * 0.23) * 0.01);
  R('chest', 0.03 + u * 0.06, ud.yaw * 0.2, -Math.sin(t * 0.31 + seed) * 0.01);
  R('neck', 0.12 + pitch * 0.3 + u * 0.12, ud.yaw * 0.3, tilt * 0.4);
  R('head', 0.05 + pitch * 0.4, ud.yaw * 0.35, tilt);
  R('hoodtip', Math.sin(t * 0.5 + seed) * 0.05 - u * 0.1, 0, Math.sin(t * 0.37) * 0.04);
  // the arms hang; when it attends, the hands come up a little, palms out, the fingers working one after another
  for (const [s, k] of SIDES) {
    const lift = u * (k > 0 ? 1 : 0.7);
    R('uarm' + s, -0.06 - lift * 0.35, 0, k * (0.05 + Math.sin(t * 0.29 + k) * 0.01 + lift * 0.12));
    R('farm' + s, -0.12 - lift * 0.75, k * lift * 0.3, 0);
    R('hand' + s, lift * 0.2, k * lift * 0.5, k * Math.sin(t * 0.4 + k * 2) * 0.05);
    const fl = Math.pow(Math.max(0, Math.sin(t * (0.5 + u * 1.3) + k * 1.9 + seed * 4)), 3);
    R('fing' + s, 0.15 + fl * 0.45 - lift * 0.15, 0, 0);
    R('tip' + s, 0.2 + fl * 0.6, 0, 0);
    R('thigh' + s, 0, 0, 0); R('shin' + s, 0, 0, 0);
  }
  // cloth: a draught that is not there, travelling round the hem
  const wind = 0.6 + u * 0.8;
  for (let i = 0; i < SKIRT; i++) {
    const ph = t * 0.9 - i * 0.7 + seed * 5;
    R('rA' + i, Math.sin(ph) * 0.03 * wind, 0, Math.cos(ph * 0.8) * 0.025 * wind);
    R('rB' + i, Math.sin(ph - 0.8) * 0.06 * wind + 0.02, 0, Math.cos(ph * 0.8 - 0.8) * 0.05 * wind);
    R('rC' + i, Math.sin(ph - 1.6) * 0.1 * wind + 0.06, 0, Math.cos(ph * 0.8 - 1.6) * 0.08 * wind);
  }
  for (let i = 0; i < MANT; i++) {
    const ph = t * 1.1 - i * 0.9 + seed * 2;
    R('mA' + i, Math.sin(ph) * 0.03 * wind, 0, Math.cos(ph) * 0.02 * wind);
    R('mB' + i, Math.sin(ph - 1) * 0.08 * wind + 0.03, 0, Math.cos(ph - 1) * 0.05 * wind);
  }
  // it skips: now and then the figure is a hand's width from where it was, for a moment
  const sk = hash(Math.floor(t * 2.2), seed * 31);
  const skip = sk < 0.05 + u * 0.08 ? (hash(Math.floor(t * 2.2), 7) - 0.5) * (0.12 + u * 0.12) : 0;
  rig.body.position.set(skip, 0, skip * 0.4);
  const F = K.kit.F.fx.value; F.y += dt; F.z = Math.min(1, c.hitFlash / 0.15) * 0.3; F.x = 0;
  // ghosting: more of it the more it attends, and the longer you have been looking
  const g = Number(c.mem.beheld ?? 0);
  const groundY = rig.root.matrixWorld.elements[13];
  ghostSync(rig, t, dt, Math.min(1, u * 0.7 + g * 0.6), groundY);
  // a low yellow spill round it in the dark
  if (live() && G.view?.zone?.key === c.zoneKey) G.pointLight?.(c.x, 1.6, c.z, 0xffc840, 0.35 + u * 0.35 + Math.sin(t * 7) * 0.03, 5 + u * 2);
  gaze(c, u, t, dt);
}

/** the local operator and the King's face */
function gaze(c: Creature, u: number, t: number, dt: number) {
  const p = localIn(c);
  const m = c.mem;
  if (!p || p.body.dead) { veil(0, t); return; }
  const dx = c.x - p.x, dz = c.z - p.z, d = Math.hypot(dx, dz);
  const toward = Math.atan2(dz, dx);
  let off = p.facing - toward; while (off > Math.PI) off -= Math.PI * 2; while (off < -Math.PI) off += Math.PI * 2;
  const z = live() ? zoneOf(c) : null;
  const sight = d < 18 && !!z && lineOfSightB(z, p.x, p.z, c.x, c.z);
  const looking = sight && Math.abs(off) < 0.62;
  // the camera pulls aside while it attends (once per turning), and comes back when it lets go
  if (u > 0.3 && sight && !m.camAside) { m.camAside = Math.sign(off || 1); G.camera?.orbitBy?.(0.42 * m.camAside, 0); }
  if (u < 0.05 && m.camAside) { m.camAside = 0; G.camera?.endOrbit?.(); }
  // dread before anything: you know you must not look
  if (sight && d < 20) {
    p.body.stress = Math.min(100, p.body.stress + dt * (1 + u * 6));
    if (u > 0.05) thinkOnce(p, 'kiy_warn', ['It has turned its hood toward me. DO NOT LOOK.', 'Look at the floor. Look at the floor. Look at the floor.', 'There is a face in there. I must not see it.'][Math.floor(t * 0.3) % 3], 12);
    else thinkOnce(p, 'kiy', ['Yellow. Tall. Standing very still, and it will not come into focus.', 'My eyes keep sliding off it. Do not look at its face.', 'Do not look at its face. Everyone knows that. Who told me that?'][Math.floor(t * 0.2) % 3], 60);
  }
  // staring fills it: slowly while it ignores you, fast once it has turned to you; looking away drains it
  const was = m.beheld ?? 0;
  const rate = u > 0.5 ? 1 / 2.6 : d < 7 ? 1 / 10 : 1 / 16;
  m.beheld = looking ? was + dt * rate : Math.max(0, was - dt * (Math.abs(off) > 1.6 ? 0.45 : 0.18));
  const g = m.beheld as number;
  if (g > 0) {
    G.pr.fx.wobble = Math.max(G.pr.fx.wobble ?? 0, g * 0.6);
    G.pr.fx.glitch = Math.max(G.pr.fx.glitch ?? 0, g > 0.75 ? (g - 0.75) * 0.8 : 0);
    if (Math.floor(t * (2 + g * 2)) !== Math.floor((t - dt) * (2 + g * 2))) G.audio?.flat?.('heartbeat', 'sfx', 0.3 + g * 0.6, 1 + g * 0.8);
    if (g > 0.5) thinkOnce(p, 'kiy_late', 'I cannot look away. It is coming into focus. LOOK AWAY.', 20);
  }
  veil(g, t);
  if (g >= 1 && !m.knew) { m.knew = true; know(c, p); }
}

// ------------------------------------------------------------------ the veil: the picture blurs and blooms yellow; knowledge typed across it
let blurEl: HTMLDivElement | null = null, bloomEl: HTMLDivElement | null = null, lineT = 0, force = 0;
function veil(g: number, t: number) {
  if (typeof document === 'undefined') return;
  g = Math.max(g, force);
  if (g <= 0.001) { blurEl?.remove(); bloomEl?.remove(); blurEl = bloomEl = null; return; }
  if (!blurEl) {
    blurEl = document.createElement('div');
    blurEl.className = 'kiy-blur';
    blurEl.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:60';
    bloomEl = document.createElement('div');
    bloomEl.className = 'kiy-bloom';
    bloomEl.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:60;mix-blend-mode:screen;background:radial-gradient(ellipse at 50% 45%, rgba(255,236,150,1) 0%, rgba(255,200,40,0.75) 45%, rgba(200,140,10,0.5) 100%)';
    document.body.append(blurEl, bloomEl);
  }
  const k = Math.min(1.6, g);
  // the image goes soft first, then gold, then white-gold
  blurEl.style.backdropFilter = `blur(${(k * k * 7).toFixed(1)}px) sepia(${Math.min(1, k * 0.9).toFixed(2)}) saturate(${(1 + k * 2.2).toFixed(2)}) brightness(${(1 + k * k * 0.7).toFixed(2)})`;
  bloomEl!.style.opacity = String(Math.min(1, Math.max(0, k - 0.25) * 0.7 + Math.sin(t * 6) * 0.03 * k));
  if (t - lineT > 1.4 - Math.min(1, g) * 1.2) { lineT = t; if (g > 0.3) knowledgeLine(Math.min(1, g)); }
}
function knowledgeLine(g: number, text?: string, big = false) {
  const e = INHABITANTS[Math.floor(Math.random() * INHABITANTS.length)];
  const s = text ?? (Math.random() < 0.5 ? e.lore : e.biology);
  const parts = s.split(/(?<=\.)\s+/);
  const sentence = text ? s : (parts[Math.floor(Math.random() * Math.max(1, parts.length))] || s);
  const el = document.createElement('div');
  el.textContent = sentence.toUpperCase();
  const size = big ? 48 : g > 0.7 ? 32 : 16;
  el.style.cssText = `position:fixed;left:${8 + Math.random() * 60}%;top:${8 + Math.random() * 80}%;max-width:${big ? 80 : 34}vw;pointer-events:none;z-index:61;font-family:var(--font-new, serif);font-size:${size}px;line-height:${size + 6}px;color:#fff3c0;text-shadow:0 0 8px #c89010,0 0 2px #3a2a00;filter:blur(${(g * 1.2).toFixed(1)}px);opacity:0;transition:opacity .4s, transform 3s;transform:translateY(0)`;
  if (big) { el.style.left = '10%'; el.style.top = '40%'; el.style.textAlign = 'center'; el.style.width = '80vw'; el.style.filter = 'none'; el.style.color = '#3a2a00'; el.style.textShadow = '0 0 12px #fff8d0'; }
  document.body.appendChild(el);
  requestAnimationFrame(() => { el.style.opacity = String(0.55 + g * 0.45); el.style.transform = 'translateY(-24px)'; });
  setTimeout(() => { el.style.opacity = '0'; }, big ? 2600 : 1600 + g * 800);
  setTimeout(() => el.remove(), big ? 3400 : 2600 + g * 800);
}

/** you looked. You saw. You understand. */
function know(c: Creature, p: Player) {
  G.audio?.flat?.('dread_swell', 'music', 0.9, 0.6);
  G.audio?.flat?.('hush_inhale', 'sfx', 0.8, 0.5);
  G.camera?.pushIn?.(0.45, 2.5, -8);
  const n = revealAll();
  import('../rules').then((r) => { for (const e of INHABITANTS) r.learnRule(e.id, 'watched'); }).catch(() => {});
  import('../../game/research').then((r) => r.grantResearch?.(30, 'The King in Yellow')).catch(() => {});
  bus.emit('think', p, 'Oh. Oh, I see. I see ALL of it.');
  // the face is not shown: the picture is gone to gold before it could be
  let k = 0;
  const flood = setInterval(() => {
    force = Math.min(1.6, 1 + k * 0.05);
    for (let i = 0; i < 4; i++) knowledgeLine(1);
    G.pr.fx.glitch = 0.6;
    if (++k > 14) clearInterval(flood);
  }, 160);
  setTimeout(() => knowledgeLine(1, 'I UNDERSTAND', true), 1400);
  setTimeout(() => {
    force = 0;
    if (p.body.dead) return;
    bus.emit('playerHit', p, 'head', 'corruption', { dmg: 999, from: [c.x, c.z], knock: 0, by: 'king_in_yellow' });
    p.body.health = 0; p.body.blood = 0;
    bus.emit('think', p, '...');
    G.camera?.pushIn?.(0, 2);
    if (G.camera && c.mem.camAside) { c.mem.camAside = 0; G.camera.endOrbit?.(); }
  }, 3200);
  bus.emit('inhabitantKnowledge', { by: 'king_in_yellow', revealed: n });
}

// ------------------------------------------------------------------ host brain: it stands, it waits, it turns to whoever stares
function court(c: Creature) {
  // furnish the court with the Seated: those who asked, arranged before it
  const z = zoneOf(c), cs = CS();
  const n = rng.int(2, 3);
  for (let i = 0; i < n; i++) {
    const a = c.facing + (i - (n - 1) / 2) * 0.7;
    const x = c.x + Math.cos(a) * 3.6, zz = c.z + Math.sin(a) * 3.6;
    if (!walkable(z, Math.floor(x), Math.floor(zz))) continue;
    const s = cs.spawn('seated', c.zoneKey, x, zz);
    if (s) { s.facing = s.targetFacing = Math.atan2(c.z - zz, c.x - x); s.mem.persistent = true; s.mem.court = c.id; }
  }
  // a strip of its robe, frayed loose where it has stood
  const a = rng.float(0, Math.PI * 2);
  const tx = c.x + Math.cos(a) * 1.4, tz = c.z + Math.sin(a) * 1.4;
  if (walkable(z, Math.floor(tx), Math.floor(tz))) { try { dropItem(z, createItem('yellow_tatter'), tx, tz, undefined, 0.1); } catch { /* no floor items here */ } }
}
function thinkKing(c: Creature, dt: number): boolean {
  const m = c.mem, n = net(c);
  const ev = pulse(c);
  stop(c);
  if (!m.init) {
    m.init = 1; m.persistent = true; m.ph = 'still'; m.next = G.time + rng.float(18, 30); m.stare = {};
    // there is only ever one
    for (const o of CS().creatures.values()) if (o !== c && !o.dead && o.sp.key === 'king_in_yellow') { CS().remove(c); return true; }
    court(c);
  }
  const ps = playersIn(c.zoneKey);
  let near: Player | null = null, nd = 20;
  const stare = m.stare as Record<string, number>;
  let starer = '';
  for (const p of ps) {
    const d = dist(p, c);
    if (d < nd) { nd = d; near = p; }
    // who keeps looking at it: it notices
    let off = p.facing - Math.atan2(c.z - p.z, c.x - p.x); while (off > Math.PI) off -= Math.PI * 2; while (off < -Math.PI) off += Math.PI * 2;
    stare[p.id] = d < 18 && Math.abs(off) < 0.62 && !p.body.dead ? (stare[p.id] ?? 0) + dt : Math.max(0, (stare[p.id] ?? 0) - dt * 2);
    if (stare[p.id] > 4) starer = p.id;
  }
  if (near) c.targetFacing = c.facing + Math.max(-0.002, Math.min(0.002, Math.atan2(near.z - c.z, near.x - c.x) - c.facing));
  m.t = (m.t ?? 0) + dt;
  const u = Number(n.u) || 0;
  const turn = () => { m.ph = 'turning'; m.t = 0; playAt('dread_swell', c, 1, 30, 0.7); playAt('hush_inhale', c, 0.9, 24, 0.6); };
  // struck: it does not bleed; it turns to you
  if ((ev.hurt > 0 || ev.staggered) && m.ph === 'still') turn();
  switch (m.ph) {
    case 'still':
      n.u = Math.max(0, u - dt * 0.5);
      if (near && (G.time > m.next || starer)) turn();
      else if (near && c.noiseCooldown <= 0) { playAt('occupant_groan', c, 0.3, 26, 0.45); c.noiseCooldown = 10 + rng.float(0, 6); }
      break;
    case 'turning':
      n.u = Math.min(1, u + dt / 2.5);
      if (n.u >= 1) { m.ph = 'attending'; m.t = 0; }
      break;
    case 'attending':
      n.u = 1;
      if (c.noiseCooldown <= 0) { playAt('wisp_hum', c, 0.7, 26, 0.4); c.noiseCooldown = 2.4; }
      if (m.t > 7 && !starer) { m.ph = 'leaving'; m.t = 0; }
      break;
    default:
      n.u = Math.max(0, u - dt / 3);
      if (n.u <= 0) { m.ph = 'still'; m.next = G.time + rng.float(20, 40); }
  }
  return true;
}

const KING = def({
  key: 'king_in_yellow', name: 'The King in Yellow', code: 'IN-00 // SOVEREIGN, CARCOSAN', temperament: 'hazard', threat: 5,
  rule: { name: 'DO NOT STARE', text: 'It cannot be hurt and it does not hunt. Do not keep looking at it: the longer you look, the sooner it turns its hood to you, and then you will see its face, know everything, and die. Look at the floor until the picture clears.', tell: 'Yellow. Something tall, standing very still, out of focus. Do not look at its face.' },
  hp: 9999, walk: 0, run: 0, turn: 0.2, radius: 0.45, height: 2.4, sight: 30, fov: 3.1, hearing: 0.5,
  zones: ['undercroft', 'corrupt'], weight: 0.1, maxPerZone: 1, diet: 'none',
  flags: { immortal: true, noCorpse: true, watcher: true },
  sounds: { idle: 'occupant_groan', hurt: 'hush_inhale' },
  scan: {
    cls: 'Sovereign / do not look',
    notes: [
      'A tall figure in tattered yellow robes and a pallid mantle. It will not come into focus; the scan smears.',
      'It does not hunt. It waits to be looked at. It turns its hood toward whoever stares.',
      'Anyone who sees its face understands everything at once, and does not survive it.',
      'Look at the floor. The Seated are those who asked.',
    ],
  },
  gore: { blood: 'glow', tint: 0xf0c020, flesh: 0xb8a878, gib: false },
  remains: 'none',
  build: buildKing, animate: animateKing, think: thinkKing,
});
KING.animateGallery = (rig: Rig, t: number) => {
  const q = new URLSearchParams(location.search).get('pose') || '';
  animateKing(rig, fakeCreature(KING, { id: 'kg', mem: { netMem: { u: q === 'attend' || q === 'unveil' ? 1 : 0 } } }), t, 1 / 60);
};
horrify(KING, { twitch: 0.2, snap: 0.1 });
