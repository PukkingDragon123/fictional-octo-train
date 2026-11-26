// Walls coming apart. When a wall segment gives (op 'wallSmash' at zero hit
// points, src/world/destruction.ts) every peer throws the same kind of
// wreckage out of the hole, sized and cut to the material:
//   drywall    both boards of the stud wall tear into thin Voronoi plates
//              (the hitter's side caves in, the far side blows out), gypsum
//              crumbs, pink insulation, a choking cloud; plates that land
//              hard crumble into bits
//   cubicle    the fabric partition tears into a few panels
//   concrete   thick Voronoi chunks with spalled faces, grit, and bent lengths
//              of rusty rebar (cinder block, tiled walls the same)
//   brick      pre-scored along the courses: runs of one to three bricks
//              break off at the mortar, half bricks, brick crumbs
//   wood       boards snap with slanted, splintered ends, a stud breaks in
//              two, splinters fly
//   glass      radial shards round the point of impact, glitter
// Chunks are rigid bodies (src/world/rigid.ts): they tumble, bounce, slide,
// pile up, sleep and fade a while later. The hole itself (its torn lip,
// rebar, splinters) is drawn by src/world/wallHoles.ts and stays open.
// Hits before the break knock out spall: crumbs and a flake or two.
import * as THREE from 'three';
import { G } from '../game/G';
import { ModelBuilder } from '../gfx/modelBuilder';
import { atlas } from '../gfx/atlas';
import { worldMaterial } from '../gfx/materials';
import { Rng } from '../core/rng';
import { PK } from '../gore/particles';
import { WallDef, WALL_H } from './defs';
import type { Zone } from './zone';
import { RigidWorld, RBody, InstPool } from './rigid';
import { faceTex } from './wallHoles';

export type WallMat = 'drywall' | 'cubicle' | 'concrete' | 'brick' | 'wood' | 'glass';

/** what a wall is made of, for fracture (null: it does not come apart) */
export function wallMatOf(w: WallDef | undefined): WallMat | null {
  if (!w) return null;
  if (w.glass) return 'glass';
  if (w.key === 'cubicle') return 'cubicle';
  if (w.sound === 'drywall') return 'drywall';
  if (w.key === 'brick') return 'brick';
  if (w.sound === 'concrete' && !w.low) return 'concrete';
  if (w.sound === 'wood' && !w.low && w.key !== 'hedge') return 'wood';
  return null;
}

interface HitArgs { x: number; y: number; side: 0 | 1; u: number; h: number; n: 1 | -1; how: string; d?: number }

const POWER: Record<string, number> = { smash: 2.6, melee: 2.2, kick: 1.6, bullet: 1, thrown: 1.4, crush: 1.2, blast: 6, creature: 2.6, vehicle: 4.5 };
const DENS: Record<WallMat, number> = { drywall: 760, cubicle: 260, concrete: 2300, brick: 1900, wood: 520, glass: 2500 };
const REST: Record<WallMat, number> = { drywall: 0.08, cubicle: 0.1, concrete: 0.12, brick: 0.14, wood: 0.22, glass: 0.18 };
const FRIC: Record<WallMat, number> = { drywall: 0.75, cubicle: 0.8, concrete: 0.7, brick: 0.7, wood: 0.55, glass: 0.4 };
const CORE: Record<WallMat, string> = { drywall: 'dmg_gypsum', cubicle: 'dmg_insul', concrete: 'dmg_concrete_core', brick: 'dmg_brick_core', wood: 'dbr_splinter', glass: 'glass' };
const DUST: Record<WallMat, number[]> = {
  drywall: [0xe4e0d6, 0xd6d2c6, 0xc8c4ba], cubicle: [0xc8c2b4, 0xd8d4ca], concrete: [0xa6a29a, 0x8e8a82, 0xb8b4aa],
  brick: [0xc8a690, 0xb08a74, 0xa6a29a], wood: [0xd8c8a8, 0xc8b490, 0xb8ae9c], glass: [0xe8eef2, 0xffffff],
};

// ---------------------------------------------------------------- geometry
type P2 = [number, number];

/** clip a convex polygon to the half-plane (p - m) . n <= 0 */
function clip(poly: P2[], mx: number, my: number, nx: number, ny: number): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const da = (a[0] - mx) * nx + (a[1] - my) * ny, db = (b[0] - mx) * nx + (b[1] - my) * ny;
    if (da <= 0) out.push(a);
    if ((da < 0) !== (db < 0) && da !== db) { const t = da / (da - db); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
  }
  return out;
}
/** Voronoi cells of seeds inside a rectangle; `sx` stretches the metric along a (long, grain-wise cells) */
function voronoi(seeds: P2[], a0: number, h0: number, a1: number, h1: number, sx = 1): P2[][] {
  const S = seeds.map(([a, h]) => [a * sx, h] as P2);
  const cells: P2[][] = [];
  for (let i = 0; i < S.length; i++) {
    let poly: P2[] = [[a0 * sx, h0], [a1 * sx, h0], [a1 * sx, h1], [a0 * sx, h1]];
    for (let j = 0; j < S.length && poly.length >= 3; j++) {
      if (j === i) continue;
      const nx = S[j][0] - S[i][0], ny = S[j][1] - S[i][1];
      poly = clip(poly, (S[i][0] + S[j][0]) / 2, (S[i][1] + S[j][1]) / 2, nx, ny);
    }
    if (poly.length >= 3) cells.push(poly.map(([a, h]) => [a / sx, h] as P2));
  }
  return cells;
}
function area(p: P2[]): number { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
/** ragged edges: a jittered midpoint on each long edge (stays star-shaped about the centre) */
function ragged(p: P2[], rng: Rng, amt: number): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    out.push(a);
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 0.06) continue;
    const t = rng.float(0.35, 0.65), j = rng.float(-amt, amt) * Math.min(1, L * 4);
    out.push([a[0] + (b[0] - a[0]) * t + (a[1] - b[1]) / L * j, a[1] + (b[1] - a[1]) * t + (b[0] - a[0]) / L * j]);
  }
  return out;
}

interface Frame { z: Zone; x: number; y: number; side: 0 | 1; baseH: number; T: number }
/** world point of panel coords (along, height, through) */
function world(f: Frame, a: number, h: number, t: number, out: THREE.Vector3) {
  return f.side === 0 ? out.set(f.x + a, f.baseH + h, f.y + t) : out.set(f.x - t, f.baseH + h, f.y + a);
}
const Q1 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);

/** a prism from a panel polygon: front (+t) and back faces, edge faces in the core texture. Geometry in body frame. */
function prism(f: Frame, poly: P2[], t0: number, t1: number, texF: string, texB: string, core: string, rng: Rng, chip = 0): { geo: THREE.BufferGeometry; c: [number, number, number]; h: THREE.Vector3 } {
  if (area(poly) < 0) poly = poly.slice().reverse();
  let amin = Infinity, amax = -Infinity, hmin = Infinity, hmax = -Infinity;
  for (const [a, h] of poly) { amin = Math.min(amin, a); amax = Math.max(amax, a); hmin = Math.min(hmin, h); hmax = Math.max(hmax, h); }
  const ca = (amin + amax) / 2, ch = (hmin + hmax) / 2, ct = (t0 + t1) / 2;
  const mb = new ModelBuilder();
  const rF = atlas().get(texF), rB = atlas().get(texB), rC = atlas().get(core);
  // world-scale uvs so the wall's pattern carries across the break (same projection as the wall's box faces)
  const along = f.side === 0 ? f.x : f.y;
  const uF = (a: number) => (f.side === 0 ? (along + a) : -(along + a)) / rF.mw;
  const uB = (a: number) => (f.side === 0 ? -(along + a) : (along + a)) / rB.mw;
  const L = (a: number, h: number, t: number) => [a - ca, h - ch, t - ct];
  // the front face sits a little proud or sunk in spots (spalled, crushed)
  const tf = (i: number) => t1 - (chip ? (rng.float(0, chip) * ((i * 7) % 3 === 0 ? 1 : 0.2)) : 0);
  const fr = poly.map((_, i) => tf(i));
  const n = poly.length;
  for (let i = 1; i < n - 1; i++) {
    const a = poly[0], b = poly[i], c = poly[i + 1];
    mb.triRaw([L(a[0], a[1], fr[0]), L(b[0], b[1], fr[i]), L(c[0], c[1], fr[i + 1])], [[uF(a[0]), a[1] / rF.mh], [uF(b[0]), b[1] / rF.mh], [uF(c[0]), c[1] / rF.mh]], texF, 0xffffff, 1);
    mb.triRaw([L(a[0], a[1], t0), L(c[0], c[1], t0), L(b[0], b[1], t0)], [[uB(a[0]), a[1] / rB.mh], [uB(c[0]), c[1] / rB.mh], [uB(b[0]), b[1] / rB.mh]], texB, 0xffffff, 0.94);
  }
  let s = 0;
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n], j = (i + 1) % n;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const u0 = s / rC.mw, u1 = (s + len) / rC.mw; s += len;
    mb.quadRaw([L(a[0], a[1], t0), L(b[0], b[1], t0), L(b[0], b[1], fr[j]), L(a[0], a[1], fr[i])], [[u0, t0 / rC.mh], [u1, t0 / rC.mh], [u1, fr[j] / rC.mh], [u0, fr[i] / rC.mh]], core, 0xffffff, 0.86);
  }
  return { geo: mb.build(), c: [ca, ch, ct], h: new THREE.Vector3((amax - amin) / 2, (hmax - hmin) / 2, Math.max(0.006, (t1 - t0) / 2)) };
}

// ---------------------------------------------------------------- bits (instanced)
function bitPool(rw: RigidWorld, kind: 'gyp' | 'peb' | 'brk' | 'spl' | 'gls' | 'reb' | 'ins'): InstPool {
  return rw.pool('bit_' + kind, () => {
    const mb = new ModelBuilder();
    let half: THREE.Vector3;
    switch (kind) {
      case 'gyp': mb.box(0, -0.02, 0, 0.05, 0.04, 0.035, { all: 'dmg_gypsum', top: 'wall_yellow' }, { bevel: false }); half = new THREE.Vector3(0.025, 0.02, 0.0175); break;
      case 'peb': mb.box(0, -0.022, 0, 0.05, 0.044, 0.042, 'dmg_concrete_core', { bevel: 0.008 }); half = new THREE.Vector3(0.025, 0.022, 0.021); break;
      case 'brk': mb.box(0, -0.03, 0, 0.08, 0.06, 0.055, { all: 'dmg_brick_core', north: 'wall_brick' }, { bevel: 0.006 }); half = new THREE.Vector3(0.04, 0.03, 0.0275); break;
      case 'spl': mb.box(0, -0.006, 0, 0.16, 0.012, 0.016, 'dbr_splinter', { bevel: false }); half = new THREE.Vector3(0.08, 0.006, 0.008); break;
      case 'gls': mb.triRaw([[-0.03, 0, -0.02], [0.03, 0, -0.025], [0, 0, 0.035]], [[0, 0], [1, 0], [0.5, 1]], 'glass'); mb.triRaw([[-0.03, 0, -0.02], [0, 0, 0.035], [0.03, 0, -0.025]], [[0, 0], [0.5, 1], [1, 0]], 'glass'); half = new THREE.Vector3(0.03, 0.004, 0.03); break;
      case 'reb': mb.box(0, -0.008, 0, 0.42, 0.016, 0.016, 'dmg_rebar', { bevel: false }); half = new THREE.Vector3(0.21, 0.008, 0.008); break;
      default: mb.box(0, -0.04, 0, 0.12, 0.08, 0.09, 'dmg_insul', { bevel: 0.02 }); half = new THREE.Vector3(0.06, 0.04, 0.045); break;
    }
    return { geo: mb.build(), half };
  }, kind === 'reb' || kind === 'ins' ? 40 : 160);
}

// ---------------------------------------------------------------- impacts (sound, dust, crumbling)
const SND: Record<string, [string, string]> = {
  drywall: ['dmg_debris_soft', 'dmg_crumble'], cubicle: ['dmg_debris_soft', 'thud_soft'], concrete: ['dmg_hit_hard', 'gore_crumble'],
  brick: ['dmg_hit_hard', 'dmg_crumble'], wood: ['mannequin_knock', 'dmg_debris_wood'], glass: ['glass_clink', 'dmg_debris_glass'],
  metal: ['cy_clank', 'dmg_debris_metal'], insul: ['thud_soft', 'thud_soft'],
};
function onImpact(rw: RigidWorld, b: RBody, sp: number, x: number, y: number, z: number) {
  const pair = SND[b.mat] ?? SND.concrete;
  const big = b.m > 1.2 || sp > 4.5;
  if (sp > 1.6) G.audio?.at?.(big ? pair[1] : pair[0], x, z, Math.min(0.85, 0.15 + sp * 0.09 + (big ? 0.15 : 0)));
  const D = G.destruct?.dust;
  if (D && b.mat !== 'metal') {
    const cols = DUST[b.mat as WallMat] ?? DUST.concrete;
    const n = Math.min(8, Math.round(sp * (b.mat === 'drywall' ? 2.2 : 1.2)));
    for (let k = 0; k < n; k++) D.add(b.mat === 'glass' ? PK.Glass : PK.Dust, x, y + 0.02, z, (Math.random() - 0.5) * 1.4, Math.random() * 0.5, (Math.random() - 0.5) * 1.4, b.mat === 'glass' ? 0.014 : 0.02 + Math.random() * 0.025, 0.8 + Math.random() * 1.6, cols[k % cols.length]);
  }
  // brittle plates hitting the floor hard crumble (drywall) or burst (glass)
  if (b.kind === 'chunk' && ((b.mat === 'drywall' && sp > 4.2 && b.m < 2.5) || (b.mat === 'glass' && sp > 3.4))) {
    const pool = bitPool(rw, b.mat === 'glass' ? 'gls' : 'gyp');
    for (let k = 0; k < 3; k++) rw.addBit(pool, { p: b.p.clone().add(new THREE.Vector3((Math.random() - 0.5) * b.h.x, 0.02, (Math.random() - 0.5) * b.h.z)), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 3, Math.random() * 3, Math.random() * 3)), v: new THREE.Vector3((Math.random() - 0.5) * 2, 0.8 + Math.random(), (Math.random() - 0.5) * 2), w: new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10), mass: 0.05, e: 0.15, mu: 0.6, mat: b.mat, scale: 0.7 + Math.random() * 0.6, life: 10, onImpact: (bb, s, ix, iy, iz) => onImpact(rw, bb, s, ix, iy, iz) });
    if (b.mat === 'glass') G.audio?.at?.('glass_clink', x, z, 0.6);
    rw.remove(b);
  }
}

// ---------------------------------------------------------------- spawning
interface Spawn { poly: P2[]; t0: number; t1: number; texF: string; texB: string; core: string; mat: string; chip?: number; dens?: number; slow?: number }

function launch(rw: RigidWorld, f: Frame, sp: Spawn[], hit: HitArgs, wm: WallMat, rng: Rng, group: number) {
  const P = POWER[hit.how] ?? 2.2;
  const dir = f.side === 0 ? new THREE.Vector3(0, 0, -hit.n) : new THREE.Vector3(-hit.n, 0, 0);
  const along = f.side === 0 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
  const bodies: RBody[] = [], geos: THREE.BufferGeometry[] = [];
  const qBase = f.side === 0 ? new THREE.Quaternion() : Q1.clone();
  const wp = new THREE.Vector3();
  for (const s of sp) {
    const pr = prism(f, s.poly, s.t0, s.t1, s.texF, s.texB, s.core, rng, s.chip ?? 0);
    const [ca, ch, ct] = pr.c;
    world(f, ca, ch, ct, wp);
    const r = Math.hypot(ca - hit.u, ch - hit.h), k = Math.exp(-r * 2.4);
    const spd = (0.35 + P * 1.15 * k) * rng.float(0.65, 1.2) * (s.slow ?? 1);
    const v = dir.clone().multiplyScalar(spd);
    const ra = (ca - hit.u) / (r || 1), rh = (ch - hit.h) / (r || 1);
    v.addScaledVector(along, ra * P * 0.4 * k * rng.float(0.4, 1));
    v.y += rh * P * 0.25 * k + rng.float(0, 0.5);
    const wv = new THREE.Vector3(rng.float(-1, 1), rng.float(-1, 1), rng.float(-1, 1)).multiplyScalar((2 + P * 3) * (0.3 + k));
    const vol = Math.abs(area(s.poly)) * (s.t1 - s.t0);
    const b = rw.add({ kind: 'chunk', p: wp, q: qBase, v, w: wv, h: pr.h, mass: Math.max(0.05, vol * (s.dens ?? DENS[wm])), e: REST[wm], mu: FRIC[wm], mat: s.mat, life: 22 + rng.float(0, 10), group, groupFor: 0.22, onImpact: (bb, sp2, x, y, z) => onImpact(rw, bb, sp2, x, y, z) });
    bodies.push(b); geos.push(pr.geo);
  }
  const mat = wm === 'glass' ? worldMaterial({ transparent: true, opacity: 0.62, outline: 0 } as any) : undefined;
  rw.addBatch(bodies, geos, mat);
  for (const g of geos) g.dispose();
  return bodies;
}

function bits(rw: RigidWorld, f: Frame, kind: Parameters<typeof bitPool>[1], n: number, hit: HitArgs, rng: Rng, mat: string, spread: [number, number, number, number], toward = 0.15, mass = 0.06) {
  const pool = bitPool(rw, kind);
  const P = POWER[hit.how] ?? 2.2;
  const wp = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const a = rng.float(spread[0], spread[1]), h = rng.float(spread[2], spread[3]);
    const back = rng.chance(toward) ? -1 : 1;
    world(f, a, h, rng.float(-f.T / 2, f.T / 2), wp);
    const sp = rng.float(0.5, 1.6) * (0.5 + P * 0.5);
    const v = f.side === 0 ? new THREE.Vector3(rng.float(-0.8, 0.8), rng.float(-0.2, 1.2), -hit.n * back * sp) : new THREE.Vector3(-hit.n * back * sp, rng.float(-0.2, 1.2), rng.float(-0.8, 0.8));
    rw.addBit(pool, { p: wp.clone(), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.float(0, 6), rng.float(0, 6), rng.float(0, 6))), v, w: new THREE.Vector3(rng.float(-14, 14), rng.float(-14, 14), rng.float(-14, 14)), mass, e: kind === 'reb' ? 0.25 : 0.15, mu: 0.6, mat, scale: rng.float(0.55, 1.35), life: 12 + rng.float(0, 8), onImpact: (bb, s, x, y, z) => onImpact(rw, bb, s, x, y, z) });
  }
}

/** the wall at (x, y, side) just gave: throw its wreckage out of the hole */
export function fractureWall(rw: RigidWorld, z: Zone, w: WallDef, hit: HitArgs, seed: number) {
  const wm = wallMatOf(w); if (!wm) return;
  const T = w.thick ?? 0.12, H = w.height ?? WALL_H;
  const baseH = Math.max(z.heightAt(hit.x, hit.y), z.heightAt(hit.side === 1 ? hit.x - 1 : hit.x, hit.side === 0 ? hit.y - 1 : hit.y));
  const f: Frame = { z, x: hit.x, y: hit.y, side: hit.side, baseH, T };
  const rng = new Rng(seed);
  const q = rw.quality;
  const many = (n: number) => Math.max(3, Math.round(n * (q === 0 ? 0.55 : q === 2 ? 1.25 : 1)));
  const ox = hit.side === 1 ? hit.x - 1 : hit.x, oy = hit.side === 0 ? hit.y - 1 : hit.y;
  const tIn = faceTex(z, hit.x, hit.y, w.tex, !!w.noWallpaper), tOut = faceTex(z, ox, oy, w.tex, !!w.noWallpaper);
  // panel local +t is world +z (side 0: the tile it faces) or world -x (side 1: the other tile)
  const texPos = hit.side === 0 ? tIn : tOut, texNeg = hit.side === 0 ? tOut : tIn;
  // the hitter's side in local t
  const hitT = hit.side === 0 ? hit.n : -hit.n;
  const TOP = Math.min(2.2, H);
  const A0 = 0.1, A1 = 0.9, H0 = wm === 'glass' ? 0.02 : 0.2, H1 = wm === 'glass' ? Math.min(H, 2.4) - 0.04 : TOP - 0.34;
  const seeds = (n: number, sig: number): P2[] => {
    const out: P2[] = [];
    for (let i = 0; i < n; i++) {
      if (i % 2 === 0) out.push([rng.float(A0, A1), rng.float(H0, H1)]);
      else out.push([Math.max(A0, Math.min(A1, hit.u + rng.gauss(0, sig))), Math.max(H0, Math.min(H1, hit.h + rng.gauss(0, sig * 1.3)))]);
    }
    return out;
  };
  const group = seed | 1;
  const sp: Spawn[] = [];
  const mid: [number, number, number, number] = [A0, A1, H0, H1];
  switch (wm) {
    case 'drywall': case 'cubicle': {
      const core = CORE[wm];
      const board = wm === 'cubicle' ? T / 2 - 0.004 : 0.016;
      // both boards, cut separately; the far one blows out harder
      for (const side of [1, -1]) {
        const cells = voronoi(seeds(many(wm === 'cubicle' ? 7 : 15), 0.22), A0, H0, A1, H1);
        for (const c of cells) {
          const poly = ragged(c, rng, 0.03);
          const t1 = side > 0 ? T / 2 : -T / 2 + board, t0 = t1 - board;
          sp.push({ poly, t0, t1, texF: side > 0 ? texPos : core, texB: side > 0 ? core : texNeg, core, mat: 'drywall', slow: side === hitT ? 0.55 : 1.15 });
        }
        if (wm === 'cubicle') break;
      }
      launch(rw, f, sp, hit, wm, rng, group);
      if (wm === 'drywall') {
        bits(rw, f, 'gyp', many(34), hit, rng, 'drywall', mid, 0.25, 0.04);
        bits(rw, f, 'ins', many(4), hit, rng, 'insul', [0.2, 0.8, 0.4, 1.6], 0.4, 0.03);
        // the stud standing in the cavity splits (or stays: sometimes the stud holds)
        if (rng.chance(0.5)) {
          const sa = rng.chance(0.5) ? 0.3 : 0.7, cut = rng.float(0.6, 1.4);
          const st: Spawn[] = [[H0, cut], [cut + 0.02, H1]].map(([h0, h1]) => ({ poly: [[sa, h0], [sa + 0.045, h0], [sa + 0.045, h1 - rng.float(0, 0.06)], [sa, h1]] as P2[], t0: -0.044, t1: 0.044, texF: 'dmg_stud', texB: 'dmg_stud', core: 'dbr_splinter', mat: 'wood', dens: 500, slow: 0.5 }));
          launch(rw, f, st, hit, 'wood', rng, group);
        }
      }
      break;
    }
    case 'concrete': {
      const cells = voronoi(seeds(many(12), 0.25), A0, H0, A1, H1);
      for (const c of cells) {
        const poly = ragged(c, rng, 0.025);
        // spalled: chunks are thinner than the wall in places, shifted toward one face
        const th = T * rng.float(0.55, 1), off = rng.float(-(T - th) / 2, (T - th) / 2);
        sp.push({ poly, t0: off - th / 2, t1: off + th / 2, texF: texPos, texB: texNeg, core: 'dmg_concrete_core', mat: 'concrete', chip: 0.02 });
      }
      launch(rw, f, sp, hit, wm, rng, group);
      bits(rw, f, 'peb', many(30), hit, rng, 'concrete', mid, 0.2, 0.12);
      if (w.key !== 'tile') bits(rw, f, 'reb', many(3), hit, rng, 'metal', [0.25, 0.75, 0.4, 1.6], 0.1, 0.5);
      break;
    }
    case 'brick': {
      // pre-scored: brick courses with running bond; runs of 1..3 bricks break at the mortar
      const CH = 0.0825, BL = 0.22;
      for (let r = 0, h = H0; h < H1 - 0.02; r++, h += CH) {
        let a = A0 - (r % 2 ? BL / 2 : 0);
        while (a < A1 - 0.01) {
          const near = Math.hypot(a - hit.u, h - hit.h) < 0.3;
          const nb = near ? 1 : rng.int(1, 3);
          const a1 = a + nb * BL * (rng.chance(0.15) ? 0.5 : 1);
          const s0 = Math.max(A0, a), s1 = Math.min(A1, a1 - 0.006);
          if (s1 - s0 > 0.03) sp.push({ poly: [[s0, h], [s1, h], [s1, h + CH - 0.008], [s0, h + CH - 0.008]], t0: -T / 2 + rng.float(0, 0.01), t1: T / 2 - rng.float(0, 0.01), texF: texPos, texB: texNeg, core: 'dmg_brick_core', mat: 'brick', chip: 0.012 });
          a = a1;
        }
      }
      launch(rw, f, sp, hit, wm, rng, group);
      bits(rw, f, 'brk', many(18), hit, rng, 'brick', mid, 0.2, 0.15);
      bits(rw, f, 'peb', many(12), hit, rng, 'concrete', mid, 0.2, 0.05);
      break;
    }
    case 'wood': {
      // boards across the wall snap into lengths with slanted, splintered ends
      const BH = w.key === 'siding' ? 0.15 : 0.19;
      for (let h = H0; h < H1 - 0.03; h += BH) {
        const h1 = Math.min(H1, h + BH - 0.006);
        let a = A0, cutB = A0, cutT = A0;
        while (a < A1 - 0.02) {
          const nxt = Math.min(A1, a + rng.float(0.22, 0.5));
          const sl = nxt >= A1 ? 0 : rng.float(-0.09, 0.09);
          const nb = Math.min(A1, nxt - sl), nt = Math.min(A1, nxt + sl);
          if (nb - cutB > 0.04 && nt - cutT > 0.04) sp.push({ poly: [[cutB, h], [nb, h], [nt, h1], [cutT, h1]], t0: -T / 2 + 0.005, t1: -T / 2 + 0.03, texF: texPos, texB: 'dmg_stud', core: 'dbr_splinter', mat: 'wood' });
          cutB = nb; cutT = nt; a = nxt;
        }
      }
      // the boards are on one face; mirror them onto the other face for a real plank wall
      for (const s of sp.slice()) sp.push({ ...s, t0: T / 2 - 0.03, t1: T / 2 - 0.005, texF: 'dmg_stud', texB: texNeg });
      launch(rw, f, sp, hit, wm, rng, group);
      bits(rw, f, 'spl', many(26), hit, rng, 'wood', mid, 0.3, 0.05);
      break;
    }
    case 'glass': {
      // radial shards round the hit
      const pts: P2[] = [];
      for (const [r, n] of [[0.06, 4], [0.18, 7], [0.36, 9], [0.62, 10], [1.0, 9], [1.5, 6]] as [number, number][]) {
        for (let i = 0; i < n; i++) { const a = (i / n + rng.float(-0.12, 0.12)) * Math.PI * 2, rr = r * rng.float(0.8, 1.2); pts.push([hit.u + Math.cos(a) * rr * 0.7, hit.h + Math.sin(a) * rr]); }
      }
      const G0 = 0.02, G1 = 0.98;
      const cells = voronoi(pts.filter(([a, h]) => a > G0 && a < G1 && h > H0 && h < H1), G0, H0, G1, H1);
      for (const c of cells) sp.push({ poly: c, t0: -0.006, t1: 0.006, texF: 'glass_wall', texB: 'glass_wall', core: 'glass', mat: 'glass' });
      launch(rw, f, sp, hit, wm, rng, group);
      bits(rw, f, 'gls', many(30), hit, rng, 'glass', [G0, G1, H0, H1], 0.25, 0.01);
      break;
    }
  }
}

/** a blow that did not go through: crumbs and a flake knocked off toward the hitter */
export function spallWall(rw: RigidWorld, z: Zone, w: WallDef, hit: HitArgs, stage: number, seed: number) {
  const wm = wallMatOf(w); if (!wm || wm === 'glass' || hit.how === 'bullet') return;
  const T = w.thick ?? 0.12;
  const baseH = Math.max(z.heightAt(hit.x, hit.y), z.heightAt(hit.side === 1 ? hit.x - 1 : hit.x, hit.side === 0 ? hit.y - 1 : hit.y));
  const f: Frame = { z, x: hit.x, y: hit.y, side: hit.side, baseH, T };
  const rng = new Rng(seed);
  const kind = wm === 'drywall' || wm === 'cubicle' ? 'gyp' : wm === 'brick' ? 'brk' : wm === 'wood' ? 'spl' : 'peb';
  const s = 0.08 + stage * 0.04;
  // bits fly back off the face that was hit (toward = 1: all of them)
  bits(rw, f, kind, 3 + stage * 3, { ...hit, how: 'kick' }, rng, wm === 'cubicle' ? 'drywall' : wm, [hit.u - s, hit.u + s, hit.h - s, hit.h + s], 1, 0.05);
  // a flake of the face at the later stages
  if (stage >= 2 && wm !== 'cubicle') {
    const ox = hit.side === 1 ? hit.x - 1 : hit.x, oy = hit.side === 0 ? hit.y - 1 : hit.y;
    const tIn = faceTex(z, hit.x, hit.y, w.tex, !!w.noWallpaper), tOut = faceTex(z, ox, oy, w.tex, !!w.noWallpaper);
    const hitT = hit.side === 0 ? hit.n : -hit.n;
    const tex = (hit.side === 0) === (hitT > 0) ? tIn : tOut;
    const r = rng.float(0.05, 0.09);
    const poly: P2[] = [];
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + rng.float(-0.3, 0.3); poly.push([hit.u + Math.cos(a) * r * rng.float(0.6, 1.2), hit.h + Math.sin(a) * r * rng.float(0.6, 1.2)]); }
    const th = wm === 'drywall' ? 0.012 : 0.025;
    const t1 = hitT > 0 ? T / 2 + 0.004 : -T / 2 + th, t0 = t1 - th - 0.004;
    const core = CORE[wm];
    launch(rw, f, [{ poly, t0, t1, texF: hitT > 0 ? tex : core, texB: hitT > 0 ? core : tex, core, mat: wm, slow: -0.35 }], { ...hit, how: 'kick' }, wm, rng, 0);
  }
}
