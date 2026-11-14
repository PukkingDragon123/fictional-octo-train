// Voxel micro-geometry on the ground: pebbles and chipped stones, dirt clods, twigs, roots arching out of
// the soil, mushrooms, fallen leaves, rubble by the walls, kerb stones along path edges; and on the bottom of
// pools and ponds: algae in the corners and along the walls, grime, drain grates, coins, tile shards and the
// odd lost thing. Everything is built here from small boxes (no imported models, no terrain tool).
//
// Each box is one instance of a 20-vertex cube (no bottom face) drawn with the world material pipeline (sun,
// light grid, shadows received, fog, vision), one draw call per 16 x 16 m chunk, frustum culled. Boxes are
// generated once per chunk from the zone's floors, walls and objects; the structural ones (kerbs, drains)
// come first in the buffer and the scatter after them is shuffled, so drawing a prefix thins it evenly
// (zoom, first-person distance, the quality preset). No per-frame work grows with the number of boxes.
import * as THREE from 'three';
import { G } from '../game/G';
import { worldMaterial } from './materials';
import { QUALITY } from './fxconfig';
import { CHUNK, type Zone } from '../world/zone';
import { floorDef } from '../world/defs';
import { objDef } from '../world/objects';

type Ground = 'meadow' | 'fields' | 'lawn' | 'dirt' | 'water';
const GROUND: Record<string, Ground> = {
  vx_grass: 'meadow', grass_dream: 'fields', grass: 'lawn', dirt: 'dirt', soil: 'dirt', sand: 'dirt', gravel: 'dirt',
  water_shallow: 'water', water_deep: 'water',
};
/** hard ground a lawn meets with a kerb */
const KERB_ON = new Set(['sidewalk', 'asphalt', 'parking', 'concrete', 'vx_path', 'tile_pool', 'paving', 'brick_path', 'patio']);

// ---------------------------------------------------------------- shader
const VDECL = /* glsl */`
attribute vec4 aVP;
attribute vec4 aVS;
attribute vec4 aVC;
varying vec3 vVCol;
`;
const VBEGIN = /* glsl */`
float vcr = cos(aVP.w), vsr = sin(aVP.w);
mat3 vRy = mat3(vcr, 0.0, -vsr, 0.0, 1.0, 0.0, vsr, 0.0, vcr);
vec3 objectNormal = vRy * normal;
`;
const VPOS = /* glsl */`
vec3 transformed = aVP.xyz + vRy * (position * aVS.xyz);
vVCol = aVC.rgb;
`;
const FDECL = /* glsl */`
varying vec3 vVCol;
`;
const FMAP = /* glsl */`
diffuseColor.rgb *= pow(vVCol, vec3(2.2));
`;

// ---------------------------------------------------------------- helpers
const hf = (x: number, y: number, s: number) => { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function vn(x: number, y: number, s: number) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hf(xi, yi, s), b = hf(xi + 1, yi, s), c = hf(xi, yi + 1, s), d = hf(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
class Pcg { s: number; constructor(s: number) { this.s = s >>> 0 || 1; } next() { this.s = (Math.imul(this.s, 1664525) + 1013904223) >>> 0; return this.s / 4294967296; } f(a: number, b: number) { return a + (b - a) * this.next(); } pick<T>(a: T[]) { return a[Math.floor(this.next() * a.length)]; } }
const shade = (c: number, k: number) => { const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k))); return (f((c >> 16) & 255) << 16) | (f((c >> 8) & 255) << 8) | f(c & 255); };

/** the box list a chunk is built from */
class Boxes {
  p: number[] = []; s: number[] = []; c: number[] = [];
  box(x: number, y: number, z: number, sx: number, sy: number, sz: number, rot: number, col: number) {
    this.p.push(x, y, z, rot); this.s.push(sx, sy, sz, 0); this.c.push((col >> 16) & 255, (col >> 8) & 255, col & 255, 255);
  }
  get n() { return this.p.length / 4; }
}

// ---------------------------------------------------------------- the things
const STONE = [0x9a948a, 0x8a8478, 0xa8a294, 0x7a746a, 0xb0a898, 0x8c8a82];
function pebble(B: Boxes, r: Pcg, x: number, y: number, z: number, size: number) {
  const c = r.pick(STONE), a = r.f(0, Math.PI);
  const w = size * r.f(0.8, 1.3), d = size * r.f(0.7, 1.1), h = size * r.f(0.45, 0.75);
  B.box(x, y - h * 0.2, z, w, h, d, a, c);
  // chipped faces: a smaller block set off the top, a darker sliver at the foot
  B.box(x + Math.cos(a) * w * 0.12, y + h * 0.55, z + Math.sin(a) * w * 0.12, w * 0.62, h * 0.5, d * 0.6, a + 0.3, shade(c, 1.12));
  if (size > 0.05) B.box(x - Math.cos(a) * w * 0.35, y - h * 0.15, z - Math.sin(a) * w * 0.35, w * 0.4, h * 0.55, d * 0.5, a - 0.4, shade(c, 0.82));
}
function stone(B: Boxes, r: Pcg, x: number, y: number, z: number, size: number, moss: boolean) {
  const c = r.pick(STONE), a = r.f(0, Math.PI);
  B.box(x, y - size * 0.15, z, size, size * 0.55, size * 0.8, a, shade(c, 0.95));
  B.box(x + r.f(-0.2, 0.2) * size, y + size * 0.3, z + r.f(-0.15, 0.15) * size, size * 0.75, size * 0.35, size * 0.6, a + r.f(-0.4, 0.4), c);
  B.box(x + r.f(-0.15, 0.15) * size, y + size * 0.55, z, size * 0.45, size * 0.18, size * 0.4, a + 0.6, shade(c, 1.15));
  B.box(x + Math.cos(a + 1.6) * size * 0.45, y - size * 0.1, z + Math.sin(a + 1.6) * size * 0.45, size * 0.35, size * 0.3, size * 0.3, a + 1.1, shade(c, 0.75));
  if (moss) B.box(x, y + size * 0.62, z, size * 0.5, size * 0.06, size * 0.35, a + 0.2, r.pick([0x5a7a2c, 0x6a8a34, 0x4e6e2a]));
}
function clod(B: Boxes, r: Pcg, x: number, y: number, z: number, size: number) {
  const c = r.pick([0x6a5038, 0x5a4430, 0x7a5c40, 0x544030]), a = r.f(0, Math.PI);
  B.box(x, y - size * 0.25, z, size, size * 0.6, size * 0.85, a, c);
  B.box(x + size * 0.15, y + size * 0.15, z, size * 0.55, size * 0.35, size * 0.5, a + 0.5, shade(c, 1.12));
  if (r.next() < 0.5) B.box(x - size * 0.2, y + size * 0.3, z + size * 0.1, size * 0.06, size * 0.3, size * 0.06, a, 0x6a8a3a);
}
function twig(B: Boxes, r: Pcg, x: number, y: number, z: number, len: number) {
  const c = r.pick([0x5a4028, 0x6a4c30, 0x7a5a3a, 0x4a3420]), a = r.f(0, Math.PI * 2), t = r.f(0.012, 0.02);
  B.box(x, y, z, len, t, t, a, c);
  B.box(x + Math.cos(a) * len * 0.1, y + t * 0.7, z - Math.sin(a) * len * 0.1, len * 0.5, t * 0.5, t * 0.6, a, shade(c, 1.2));
  // a side branch
  const b = a + (r.next() < 0.5 ? 0.7 : -0.7), off = r.f(-0.25, 0.25) * len;
  B.box(x + Math.cos(a) * off + Math.cos(b) * len * 0.18, y, z - Math.sin(a) * off - Math.sin(b) * len * 0.18, len * 0.35, t * 0.8, t * 0.8, b, c);
}
function root(B: Boxes, r: Pcg, x: number, y: number, z: number, len: number) {
  // an arch out of the soil and back in: segments rising then sinking
  const c = r.pick([0x5c4028, 0x6a4a2e, 0x4e3624]), a = r.f(0, Math.PI * 2), n = 6, t = r.f(0.025, 0.045);
  for (let k = 0; k < n; k++) {
    const u = (k + 0.5) / n, h = Math.sin(u * Math.PI) * len * 0.12 - t * 0.4;
    const px = x + Math.cos(a) * (u - 0.5) * len, pz = z - Math.sin(a) * (u - 0.5) * len;
    B.box(px, y + h, pz, len / n * 1.15, t, t * 1.1, a + Math.sin(k * 1.7) * 0.15, k % 2 ? c : shade(c, 1.12));
  }
}
const CAPS = [[0xb84a32, 0xf2e8d8], [0xc8a070, 0xe8dcc0], [0x8a5a34, 0xe0d0b0], [0xe8dcc8, 0xf8f4ec], [0xd8a040, 0xf0e0b0]];
function mushrooms(B: Boxes, r: Pcg, x: number, y: number, z: number) {
  const [cap, stem] = r.pick(CAPS), n = 1 + Math.floor(r.next() * 3);
  for (let k = 0; k < n; k++) {
    const ox = x + r.f(-0.07, 0.07), oz = z + r.f(-0.07, 0.07), h = r.f(0.03, 0.08), w = r.f(0.035, 0.07), a = r.f(0, 1.5);
    B.box(ox, y, oz, w * 0.32, h, w * 0.32, a, stem);
    B.box(ox, y + h, oz, w, w * 0.35, w, a, cap);
    B.box(ox, y + h + w * 0.3, oz, w * 0.6, w * 0.22, w * 0.6, a + 0.4, shade(cap, 1.18));
    if (cap === CAPS[0][0]) B.box(ox + w * 0.15, y + h + w * 0.48, oz, w * 0.14, w * 0.05, w * 0.14, a, 0xf8f0e0);
  }
}
const LEAVES: Record<Ground, number[]> = {
  meadow: [0x8a9a40, 0xb0a048, 0x7a8a3a], fields: [0xb89a48, 0xc87a34, 0x9a7a38, 0xd0b058, 0x8a5a2c],
  lawn: [0xa06a2c, 0xc88a34, 0x8a5a28, 0xb8a040], dirt: [0x9a6a30, 0x7a5a2c, 0xb08a40], water: [0x6a5a2c, 0x5a4a28],
};
function leaf(B: Boxes, r: Pcg, x: number, y: number, z: number, g: Ground) {
  const c = r.pick(LEAVES[g]), a = r.f(0, Math.PI * 2), l = r.f(0.035, 0.06);
  B.box(x, y, z, l, 0.006, l * 0.55, a, c);
  B.box(x, y + 0.004, z, l * 0.8, 0.004, 0.006, a, shade(c, 0.7));     // the vein
  B.box(x + Math.cos(a) * l * 0.45, y + 0.006, z - Math.sin(a) * l * 0.45, l * 0.3, 0.008, l * 0.3, a, shade(c, 1.1)); // a curled tip
}
function rubble(B: Boxes, r: Pcg, x: number, y: number, z: number) {
  const c = r.pick([0xb0aca4, 0x9c988e, 0xc0b8a8, 0x8e3a2a]), n = 2 + Math.floor(r.next() * 3);
  for (let k = 0; k < n; k++) { const s = r.f(0.025, 0.07); B.box(x + r.f(-0.1, 0.1), y - s * 0.2, z + r.f(-0.1, 0.1), s, s * r.f(0.5, 0.9), s * r.f(0.6, 1), r.f(0, 3), k ? shade(c, r.f(0.85, 1.1)) : c); }
}

// ---- the pool bottom
function algae(B: Boxes, r: Pcg, x: number, y: number, z: number, big: boolean) {
  const n = big ? 6 : 3;
  for (let k = 0; k < n; k++) {
    const c = r.pick([0x3a5a28, 0x4a6a2c, 0x5a7a34, 0x2e4a24, 0x6a7a3a]), h = r.f(0.01, big ? 0.07 : 0.03);
    B.box(x + r.f(-0.08, 0.08), y, z + r.f(-0.08, 0.08), r.f(0.02, 0.05), h, r.f(0.02, 0.05), r.f(0, 3), c);
  }
}
function grime(B: Boxes, r: Pcg, x: number, y: number, z: number) {
  const c = r.pick([0x4a5a48, 0x5a6050, 0x3e4a3a]);
  B.box(x, y - 0.004, z, r.f(0.1, 0.25), 0.008, r.f(0.08, 0.2), r.f(0, 3), c);
  B.box(x + r.f(-0.05, 0.05), y - 0.002, z + r.f(-0.05, 0.05), r.f(0.05, 0.12), 0.008, r.f(0.05, 0.1), r.f(0, 3), shade(c, 0.8));
}
function drain(B: Boxes, x: number, y: number, z: number) {
  const frame = 0x8a9096, dark = 0x2a2e30;
  B.box(x, y - 0.006, z, 0.36, 0.012, 0.36, 0, dark);
  B.box(x, y, z - 0.17, 0.38, 0.02, 0.04, 0, frame); B.box(x, y, z + 0.17, 0.38, 0.02, 0.04, 0, frame);
  B.box(x - 0.17, y, z, 0.04, 0.02, 0.38, 0, frame); B.box(x + 0.17, y, z, 0.04, 0.02, 0.38, 0, frame);
  for (let k = -2; k <= 2; k++) B.box(x + k * 0.06, y + 0.002, z, 0.018, 0.016, 0.3, 0, shade(frame, 0.9));
}
function debris(B: Boxes, r: Pcg, x: number, y: number, z: number) {
  const k = r.next();
  if (k < 0.35) { const c = r.next() < 0.5 ? 0xd8b048 : 0xc8ccd0; B.box(x, y, z, 0.024, 0.004, 0.024, r.f(0, 1), c); B.box(x, y + 0.003, z, 0.016, 0.002, 0.016, 0.4, shade(c, 1.15)); }
  else if (k < 0.7) { const c = r.pick([0xf0f4f8, 0x4a8ac8, 0x2a5a9a]); B.box(x, y, z, r.f(0.03, 0.06), 0.008, r.f(0.02, 0.04), r.f(0, 3), c); }
  else if (k < 0.85) { B.box(x, y + 0.006, z, 0.06, 0.012, 0.012, r.f(0, 3), r.pick([0xe84a6a, 0x4ac8e8, 0xf0c040])); }
  else { const c = 0x1a1a1e; const a = r.f(0, 3); B.box(x, y + 0.01, z, 0.03, 0.02, 0.025, a, c); B.box(x + Math.cos(a) * 0.035, y + 0.01, z - Math.sin(a) * 0.035, 0.03, 0.02, 0.025, a, c); B.box(x, y + 0.01, z, 0.08, 0.006, 0.006, a, 0x3a3a40); }
}

// ---------------------------------------------------------------- growing a chunk
function growChunk(z: Zone, cx: number, cy: number): { B: Boxes; nFix: number; ymin: number; ymax: number } | null {
  const fixed = new Boxes(), B = new Boxes();
  const seed = (z.seed ?? 1) & 0xffff;
  let ymin = 1e9, ymax = -1e9;
  const keyAt = (x: number, y: number) => { if (!z.inb(x, y)) return ''; const f = z.floor[z.idx(x, y)]; return f ? floorDef(f)?.key ?? '' : ''; };
  for (let y = cy * CHUNK; y < Math.min(z.H, (cy + 1) * CHUNK); y++) for (let x = cx * CHUNK; x < Math.min(z.W, (cx + 1) * CHUNK); x++) {
    const i = z.idx(x, y), key = keyAt(x, y), g = GROUND[key];
    if (!g) continue;
    if (z.solid[i] === 1 || z.solid[i] === 3) continue;
    const gy = z.height[i] * 0.1;
    const r = new Pcg(Math.imul(x + 7, 73856093) ^ Math.imul(y + 3, 19349663) ^ seed);
    const P = (lo = 0.08, hi = 0.92) => [x + r.f(lo, hi), y + r.f(lo, hi)] as const;
    ymin = Math.min(ymin, gy - 0.1); ymax = Math.max(ymax, gy + 0.2);
    // what the sides meet: a wall (rubble and moss collect against it), hard ground (a kerb), a higher floor (a pool wall)
    const sides: [number, number, number, number][] = [[0, -1, 0, 0], [0, 1, 0, 1], [-1, 0, 1, 0], [1, 0, 1, 1]];
    const wallSide = (k: number) => k === 0 ? !!z.wallN[i] : k === 1 ? z.inb(x, y + 1) && !!z.wallN[z.idx(x, y + 1)] : k === 2 ? !!z.wallW[i] : z.inb(x + 1, y) && !!z.wallW[z.idx(x + 1, y)];
    if (g === 'water') {
      // ---- the pool bottom: algae and grime where the walls meet it, a drain now and then, things that sank
      const deep = key === 'water_deep';
      let walls = 0;
      sides.forEach(([dx, dy, ax], k) => {
        const nk = keyAt(x + dx, y + dy), nh = z.inb(x + dx, y + dy) ? z.height[z.idx(x + dx, y + dy)] * 0.1 : gy + 1;
        if (GROUND[nk] === 'water' && nh <= gy + 0.05 && !wallSide(k)) return;
        walls++;
        const n = 2 + Math.floor(r.next() * 3);
        for (let q = 0; q < n; q++) {
          const t = r.f(0.05, 0.95), d = r.f(0.02, 0.1);
          const px = ax ? (dx < 0 ? x + d : x + 1 - d) : x + t, pz = ax ? y + t : (dy < 0 ? y + d : y + 1 - d);
          algae(B, r, px, gy, pz, r.next() < 0.3);
          if (r.next() < 0.4) grime(B, r, px, gy, pz);
        }
      });
      if (walls >= 2) { const [px, pz] = P(0.1, 0.9); algae(B, r, px, gy, pz, true); grime(B, r, px, gy, pz); }
      if (deep && hf(x, y, seed + 7) < 0.025) drain(fixed, x + 0.5, gy, y + 0.5);
      if (r.next() < (deep ? 0.22 : 0.12)) { const [px, pz] = P(); debris(B, r, px, gy, pz); }
      if (r.next() < 0.18) { const [px, pz] = P(); grime(B, r, px, gy, pz); }
      if (z.isOutdoor(x, y) && r.next() < 0.4) { const [px, pz] = P(); leaf(B, r, px, gy, pz, 'water'); }
      continue;
    }
    // ---- open ground
    let tallObj = false;
    for (const o of z.objectsAt(x, y)) { const d = objDef(o.key); if (d?.foliage || o.key.includes('tree')) tallObj = true; }
    const damp = vn(x * 0.13, y * 0.13, seed + 11), stony = vn(x * 0.17, y * 0.17, seed + 23), litter = vn(x * 0.11, y * 0.11, seed + 31);
    const dens = g === 'dirt' ? 1.6 : g === 'fields' ? 1.1 : g === 'meadow' ? 0.7 : 0.6;
    const nPeb = Math.floor((0.6 + stony * 2.2) * dens + r.next());
    for (let k = 0; k < nPeb; k++) { const [px, pz] = P(); pebble(B, r, px, gy, pz, r.f(0.02, 0.055)); }
    if (r.next() < stony * 0.22 * dens) { const [px, pz] = P(0.2, 0.8); stone(B, r, px, gy, pz, r.f(0.08, 0.16), damp > 0.55); }
    if (r.next() < 0.3 * dens) { const [px, pz] = P(); clod(B, r, px, gy, pz, r.f(0.03, 0.06)); }
    const nLeaf = Math.floor(litter * (g === 'meadow' ? 1.2 : g === 'lawn' ? 1.8 : 2.6) + (tallObj ? 3 : 0) + r.next() * 0.8);
    for (let k = 0; k < nLeaf; k++) { const [px, pz] = P(0.02, 0.98); leaf(B, r, px, gy + 0.004, pz, g); }
    if (r.next() < (tallObj ? 0.6 : 0.14) * (g === 'lawn' ? 0.5 : 1)) { const [px, pz] = P(); twig(B, r, px, gy + 0.008, pz, r.f(0.12, 0.32)); }
    if (r.next() < (tallObj ? 0.45 : 0.035)) { const [px, pz] = P(0.2, 0.8); root(B, r, px, gy, pz, r.f(0.3, 0.6)); }
    if (r.next() < (tallObj ? 0.3 : 0.02 + damp * 0.05) && g !== 'lawn') { const [px, pz] = P(0.15, 0.85); mushrooms(B, r, px, gy, pz); }
    // against walls: rubble and moss; along hard ground: a kerb (lawns, planters) or a line of pale stones (meadow paths)
    sides.forEach(([dx, dy, ax], k) => {
      const nk = keyAt(x + dx, y + dy);
      const edge = (t: number, d: number) => (ax ? [dx < 0 ? x + d : x + 1 - d, y + t] : [x + t, dy < 0 ? y + d : y + 1 - d]) as [number, number];
      if (wallSide(k)) {
        if (r.next() < 0.5) { const [px, pz] = edge(r.f(0.1, 0.9), r.f(0.04, 0.12)); rubble(B, r, px, gy, pz); }
        return;
      }
      if (!nk || GROUND[nk]) return;
      if (KERB_ON.has(nk) && (g === 'lawn' || g === 'fields')) {
        // kerb stones: a run of blocks with hairline gaps, a chipped one now and then
        const col = 0xb8b4aa;
        for (let q = 0; q < 4; q++) {
          const [px, pz] = edge((q + 0.5) / 4, 0.045);
          const chip = hf(x * 4 + q, y, seed + 41) < 0.15;
          fixed.box(px, gy - 0.01, pz, ax ? 0.08 : 0.235, chip ? 0.055 : 0.075, ax ? 0.235 : 0.08, 0, shade(col, 0.92 + hf(x + q, y, seed + 43) * 0.14));
          fixed.box(px, gy + (chip ? 0.04 : 0.06), pz, ax ? 0.05 : 0.2, 0.012, ax ? 0.2 : 0.05, 0, shade(col, 1.12));
        }
      } else if (g === 'meadow' || g === 'fields') {
        const n = 3 + Math.floor(r.next() * 3);
        for (let q = 0; q < n; q++) { const [px, pz] = edge(r.f(0.05, 0.95), r.f(0.03, 0.1)); pebble(B, r, px, gy, pz, r.f(0.025, 0.05)); }
      }
    });
  }
  const nFix = fixed.n;
  if (!nFix && !B.n) return null;
  // shuffle the scatter (a prefix of it is an even thinning), structural boxes stay in front
  const rng = new Pcg(cx * 73856093 ^ cy * 19349663 ^ seed);
  const n = B.n;
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    for (const arr of [B.p, B.s, B.c]) for (let c = 0; c < 4; c++) { const a = arr[i * 4 + c]; arr[i * 4 + c] = arr[j * 4 + c]; arr[j * 4 + c] = a; }
  }
  // keep the parts of one object together when thinning would split it? (no: each box is a few cm, a missing chip reads as variety)
  fixed.p.push(...B.p); fixed.s.push(...B.s); fixed.c.push(...B.c);
  return { B: fixed, nFix, ymin, ymax };
}

function chunkSig(z: Zone, cx: number, cy: number): number {
  let h = 0;
  for (let y = cy * CHUNK; y < Math.min(z.H, (cy + 1) * CHUNK); y++) for (let x = cx * CHUNK; x < Math.min(z.W, (cx + 1) * CHUNK); x++) {
    const i = z.idx(x, y);
    h = (Math.imul(h, 31) + z.floor[i] * 7 + z.solid[i] * 3 + (z.height[i] & 255) * 13 + z.wallN[i] * 5 + z.wallW[i] * 11) | 0;
  }
  return h;
}

interface VChunk { sig: number; mesh: THREE.Mesh | null; geo: THREE.InstancedBufferGeometry | null; nFix: number; nAll: number; cx: number; cz: number }

/** a cube with its base on y = 0, no bottom face (20 vertices, flat normals) */
function cubeGeo(g: THREE.BufferGeometry) {
  const P: number[] = [], N: number[] = [], I: number[] = [];
  const face = (n: number[], corners: number[][]) => { const b = P.length / 3; for (const c of corners) { P.push(c[0], c[1], c[2]); N.push(n[0], n[1], n[2]); } I.push(b, b + 1, b + 2, b, b + 2, b + 3); };
  const a = 0.5;
  face([0, 1, 0], [[-a, 1, a], [a, 1, a], [a, 1, -a], [-a, 1, -a]]);
  face([0, 0, 1], [[-a, 0, a], [a, 0, a], [a, 1, a], [-a, 1, a]]);
  face([0, 0, -1], [[a, 0, -a], [-a, 0, -a], [-a, 1, -a], [a, 1, -a]]);
  face([1, 0, 0], [[a, 0, a], [a, 0, -a], [a, 1, -a], [a, 1, a]]);
  face([-1, 0, 0], [[-a, 0, -a], [-a, 0, a], [-a, 1, a], [-a, 1, -a]]);
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setIndex(I);
}

export class VoxDetail {
  name = 'voxDetail';
  enabled = true;
  readonly root = new THREE.Group();
  private zone: Zone | null = null;
  private chunks = new Map<number, VChunk>();
  private rr = 0;
  private mat: THREE.MeshLambertMaterial;
  stats = { chunks: 0, boxes: 0, drawn: 0 };

  constructor() {
    this.root.name = 'voxDetail';
    const base = worldMaterial({ outline: 0 }) as THREE.MeshLambertMaterial;
    const hook = base.onBeforeCompile;
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    mat.onBeforeCompile = (sh, r) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\n' + VDECL)
        .replace('#include <beginnormal_vertex>', VBEGIN)
        .replace('#include <begin_vertex>', VPOS);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\n' + FDECL)
        .replace('#include <map_fragment>', FMAP);
      hook.call(base, sh, r);
    };
    mat.customProgramCacheKey = () => 'voxdetail:1';
    this.mat = mat;
  }

  frame() {
    const g: any = G;
    const pr = g?.pr, z: Zone | undefined = g?.view?.zone;
    if (!pr || !z) return;
    if (!this.root.parent) pr.scene.add(this.root);
    if (z !== this.zone) { this.clear(); this.zone = z; }
    this.root.visible = this.enabled;
    if (!this.enabled) return;
    const eye = pr.eyeCamera as THREE.PerspectiveCamera | null;
    const fx = eye ? eye.position.x : pr.target.x, fz = eye ? eye.position.z : pr.target.z;
    const R = eye ? 26 : pr.lowW * pr.pxSize * 0.75 + 4;
    const lvl = (pr.qualityOverride ?? pr.quality) as keyof typeof QUALITY;
    const qd = ((QUALITY as any)[lvl]?.grass ?? 1) * ((g.grass as any)?.soft ? 0.5 : 1);
    const ccx = Math.floor(fx / CHUNK), ccz = Math.floor(fz / CHUNK), r = Math.ceil((R + 6) / CHUNK);
    let builds = this.chunks.size === 0 ? 99 : 1;
    for (let cy = ccz - r; cy <= ccz + r; cy++) for (let cx = ccx - r; cx <= ccx + r; cx++) {
      if (cx < 0 || cy < 0 || cx >= z.chunksX || cy >= z.chunksY) continue;
      const ci = cy * z.chunksX + cx;
      if (this.chunks.has(ci) || builds-- <= 0) continue;
      this.chunks.set(ci, this.build(z, cx, cy));
    }
    for (const [ci, c] of this.chunks) if (Math.abs(c.cx - ccx) > r + 1 || Math.abs(c.cz - ccz) > r + 1) { this.drop(c); this.chunks.delete(ci); }
    const keys = [...this.chunks.keys()];
    if (keys.length) {
      const ci = keys[this.rr++ % keys.length], c = this.chunks.get(ci)!;
      if (chunkSig(z, c.cx, c.cz) !== c.sig) { this.drop(c); this.chunks.set(ci, this.build(z, c.cx, c.cz)); }
    }
    const zf = Math.max(0.35, Math.min(1, (1 / pr.pxSize) / 56));
    let all = 0, drawn = 0, n = 0;
    for (const c of this.chunks.values()) {
      if (!c.geo) continue;
      n++;
      let f = qd * (eye ? 1 : zf);
      if (eye) { const d = Math.hypot(fx - (c.cx + 0.5) * CHUNK, fz - (c.cz + 0.5) * CHUNK); f *= Math.max(0.15, Math.min(1, 1.3 - d / 20)); }
      c.geo.instanceCount = c.nFix + Math.round((c.nAll - c.nFix) * Math.min(1, f));
      all += c.nAll; drawn += c.geo.instanceCount;
    }
    this.stats = { chunks: n, boxes: all, drawn };
  }

  private build(z: Zone, cx: number, cy: number): VChunk {
    const c: VChunk = { sig: chunkSig(z, cx, cy), mesh: null, geo: null, nFix: 0, nAll: 0, cx, cz: cy };
    const out = growChunk(z, cx, cy);
    if (!out) return c;
    const geo = new THREE.InstancedBufferGeometry();
    cubeGeo(geo);
    geo.setAttribute('aVP', new THREE.InstancedBufferAttribute(new Float32Array(out.B.p), 4));
    geo.setAttribute('aVS', new THREE.InstancedBufferAttribute(new Float32Array(out.B.s), 4));
    geo.setAttribute('aVC', new THREE.InstancedBufferAttribute(new Uint8Array(out.B.c), 4, true));
    geo.instanceCount = out.B.n;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3((cx + 0.5) * CHUNK, (out.ymin + out.ymax) / 2, (cy + 0.5) * CHUNK), Math.hypot(CHUNK * 0.72, (out.ymax - out.ymin) / 2 + 0.5));
    geo.boundingBox = new THREE.Box3(new THREE.Vector3(cx * CHUNK - 0.5, out.ymin - 0.2, cy * CHUNK - 0.5), new THREE.Vector3((cx + 1) * CHUNK + 0.5, out.ymax + 0.5, (cy + 1) * CHUNK + 0.5));
    const mesh = new THREE.Mesh(geo, this.mat);
    mesh.receiveShadow = true; mesh.castShadow = false; mesh.matrixAutoUpdate = false;
    mesh.raycast = () => { /* never picked */ };
    this.root.add(mesh);
    c.mesh = mesh; c.geo = geo; c.nFix = out.nFix; c.nAll = out.B.n;
    return c;
  }

  private drop(c: VChunk) { if (c.mesh) this.root.remove(c.mesh); c.geo?.dispose(); }
  private clear() { for (const c of this.chunks.values()) this.drop(c); this.chunks.clear(); }
  rebuild() { this.clear(); }
}

/** one voxel layer per running game */
export function installVoxDetail(g: any): VoxDetail | null {
  if (!g?.pr) return null;
  if (g.voxDetail instanceof VoxDetail) return g.voxDetail;
  const s = new VoxDetail();
  g.voxDetail = s;
  g.pr.beforeRender.push(() => { try { s.frame(); } catch (e) { console.warn('vox detail', e); } });
  if (import.meta.env?.DEV && typeof window !== 'undefined') (window as any).__vox = s;
  return s;
}
