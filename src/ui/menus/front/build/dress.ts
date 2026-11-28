// THE ROOMS' SET DRESSING (round 26, part B): the layer that makes each facility room a lived-in, art-directed place
// rather than a box with its machine in it. Laid over every diorama (front/dioramas.ts) after its own fixtures, in
// the space they leave (the floor and wall occupancy):
//   the ceiling's cut edge: a strip of tiles on its T-bar grid along the two standing walls (tiles missing and
//     hanging in a derelict room), a galvanised duct with a diffuser, a sprinkler line
//   the walls: a pipe run on brackets with a valve wheel, a ventilation grille, switch and socket plates, a cable
//     tray, a fire point (extinguisher on its bracket, a pictogram over it), a notice board of pinned papers and
//     photographs (no words), a radiator, an exit pictogram lit green over the door, a wall clock
//   the floor: a worn path from the door, scuffs, a drain, cables run along the skirting, a door mat once restored
//   practicals: a caged sconce and a task lamp per room (their bulbs lit when powered; a red emergency lamp turning
//     while derelict), returned so the map can hang real lights on them when the room is in close-up
//   each room's own clutter: the game's furniture kits and the Poly Haven props in the spots its function asks for
//     (only where the floor is free)
import * as THREE from 'three';
import type { FMats } from '../../scene/pixtex';
import { FacetBuilder, at, cbox, prism, lathe, tube, jitter, gem } from '../../scene/facet';
import type { RoomId, Condition } from '../../../../game/facility';
import { world, glb } from './props3d';

export const HALF = 2, WALL_H = 2.6, CELL = 0.25, GN = 16;
export interface Practical { p: THREE.Vector3; color: number; k: number; emergency?: boolean }
export interface DressCtx {
  b: FacetBuilder; g: THREE.Group; R: () => number; cond: Condition; on: boolean; mats: FMats;
  grid: Uint8Array; wall: Uint8Array; ticks: ((t: number, dt: number) => void)[]; grime: THREE.Object3D[]; locked: boolean;
}

type M4 = THREE.Matrix4;
const mul = (a: M4, b: M4) => new THREE.Matrix4().multiplyMatrices(a, b);

/** a free run of wall cells (north: along x, west: along z) of n cells, searched from a preferred cell outward */
function wallSpot(c: DressCtx, north: boolean, n: number, pref: number): number | null {
  const base = north ? 0 : GN;
  for (let d = 0; d < GN; d++) for (const s of [1, -1]) {
    const i0 = pref + d * s;
    if (i0 < 0 || i0 + n > GN) continue;
    let ok = true;
    for (let k = 0; k < n; k++) if (c.wall[base + i0 + k]) { ok = false; break; }
    if (ok) { for (let k = 0; k < n; k++) c.wall[base + i0 + k] = 1; return -HALF + (i0 + n / 2) * CELL; }
  }
  return null;
}
/** a free patch of floor (w x d metres) at or near (x, z); marks it taken */
function floorSpot(c: DressCtx, x: number, z: number, w: number, d: number, reach = 0.5): [number, number] | null {
  const nx = Math.ceil(w / CELL), nz = Math.ceil(d / CELL);
  const tryAt = (px: number, pz: number) => {
    const i0 = Math.round((px + HALF) / CELL - nx / 2), j0 = Math.round((pz + HALF) / CELL - nz / 2);
    if (i0 < 0 || j0 < 0 || i0 + nx > GN || j0 + nz > GN) return null;
    for (let j = j0; j < j0 + nz; j++) for (let i = i0; i < i0 + nx; i++) if (c.grid[j * GN + i]) return null;
    // keep the doorway clear (the door is in the north wall at x 1.25)
    const cx = -HALF + (i0 + nx / 2) * CELL, cz = -HALF + (j0 + nz / 2) * CELL;
    if (Math.abs(cx - 1.25) < 0.55 + w / 2 && cz - d / 2 < -HALF + 0.9) return null;
    for (let j = j0; j < j0 + nz; j++) for (let i = i0; i < i0 + nx; i++) c.grid[j * GN + i] = 1;
    return [cx, cz] as [number, number];
  };
  for (let r = 0; r <= reach + 1e-3; r += CELL) for (let a = 0; a < (r ? 8 : 1); a++) {
    const hit = tryAt(x + Math.cos(a / 8 * Math.PI * 2) * r, z + Math.sin(a / 8 * Math.PI * 2) * r);
    if (hit) return hit;
  }
  return null;
}

// ---------------------------------------------------------------- the shared layer
function ceiling(c: DressCtx) {
  const { b, R } = c, y = WALL_H - 0.04, dark = c.cond === 0 ? 0.62 : c.cond === 1 ? 0.75 : 1;
  const tone = (h: number) => new THREE.Color(h).multiplyScalar(dark).getHex();
  // the T-bar grid and its tiles along the north and the west walls (the section's cut ceiling)
  for (const north of [true, false]) {
    for (let i = 0; i < 7; i++) {
      const u = -HALF + 0.3 + i * 0.6;
      const gone = c.cond === 0 && R() < 0.3, hang = c.cond <= 1 && !gone && R() < 0.18;
      const m = north ? at(u, y, -HALF + 0.2) : at(-HALF + 0.2, y, u, 0, Math.PI / 2, 0);
      b.add('metal', cbox(0.6, 0.02, 0.025, 0.004), tone(0xd8d8d0), mul(m, at(0.3, -0.005, 0.18)));
      if (gone) continue;
      b.add('paint', cbox(0.58, 0.018, 0.3, 0.004), tone(i % 3 === 0 && c.cond < 2 ? 0x8a7c62 : 0xa8a494), mul(m, hang ? at(0, -0.22, 0.05, 0.9, 0, 0.1) : at(0, 0, -0.04)));
      // the tile's fissured face, a darker seam each side
      if (!hang) for (const dz of [-0.15, 0.11]) b.add('rubber', cbox(0.56, 0.004, 0.012, 0.001), 0x2a2820, mul(m, at(0, -0.011, dz)));
    }
    b.add('metal', cbox(north ? HALF * 2 : 0.03, 0.02, north ? 0.03 : HALF * 2, 0.004), tone(0xd8d8d0), north ? at(0, y - 0.005, -HALF + 0.39) : at(-HALF + 0.39, y - 0.005, 0));
  }
  // a galvanised duct along the west wall's top with a square diffuser, a sprinkler line with its heads
  const dx = -HALF + 0.3;
  b.add('chrome', cbox(0.3, 0.22, HALF * 2 - 0.4, 0.02), tone(0x9aa0a0), at(dx, y - 0.14, 0.2), { rep: 0.3 });
  for (let k = 0; k < 4; k++) b.add('metal', cbox(0.34, 0.03, 0.04, 0.006), tone(0x6a7070), at(dx, y - 0.25, -1.4 + k * 1.05));
  b.add('metal', cbox(0.28, 0.03, 0.28, 0.01), tone(0xb8bcb8), at(dx, y - 0.26, 0.5));
  for (let k = 0; k < 4; k++) b.add('rubber', cbox(0.22, 0.004, 0.02, 0.001), 0x14140f, at(dx, y - 0.275, 0.4 + k * 0.06));
  b.add('paint', tube([[-HALF + 0.5, y - 0.06, -HALF + 0.3], [HALF - 0.1, y - 0.06, -HALF + 0.3]], 0.016, 2, 6, false), tone(0xb83a2a));
  for (let k = 0; k < 3; k++) b.add('brass', lathe([[0, 0], [0.02, 0], [0.03, -0.04], [0, -0.05]], 6), 0xc89a3a, at(-1.0 + k * 1.3, y - 0.07, -HALF + 0.3));
}
function walls(c: DressCtx, id: RoomId): Practical[] {
  const { b, R } = c, dark = c.cond === 0 ? 0.6 : c.cond === 1 ? 0.75 : 1;
  const tone = (h: number) => new THREE.Color(h).multiplyScalar(dark).getHex();
  const out: Practical[] = [];
  // a pipe run along the north wall, brackets, a valve wheel, a gauge; rusted through in a derelict room
  const py = 2.18;
  b.add(c.cond <= 1 ? 'rust' : 'copper', tube([[-HALF, py, -HALF + 0.1], [HALF, py, -HALF + 0.1]], 0.035, 2, 8, false), c.cond <= 1 ? 0x8a6a50 : 0xffffff);
  b.add('metal', tube([[-HALF, py - 0.12, -HALF + 0.08], [HALF, py - 0.12, -HALF + 0.08]], 0.022, 2, 6, false), tone(0x5a6a5a));
  for (let k = 0; k < 6; k++) b.add('metal', cbox(0.04, 0.2, 0.1, 0.008), tone(0x3a3e3a), at(-1.75 + k * 0.7, py - 0.06, -HALF + 0.05));
  const vx = -1.55 + R() * 0.4;
  b.add('paint', lathe([[0, 0], [0.09, 0], [0.09, 0.015], [0.07, 0.02], [0, 0.02]], 10), 0xb82a1e, at(vx, py, -HALF + 0.2, Math.PI / 2));
  b.add('metal', prism(0.012, 0.1, 6), tone(0x4a4a44), at(vx, py, -HALF + 0.15, Math.PI / 2));
  b.add('chrome', lathe([[0, 0], [0.05, 0], [0.05, 0.02], [0, 0.025]], 10), 0xd8d8d0, at(vx + 0.45, py + 0.06, -HALF + 0.15, Math.PI / 2));
  b.add('paint', lathe([[0, 0], [0.04, 0], [0, 0.002]], 10), 0xe8e4d8, at(vx + 0.45, py + 0.06, -HALF + 0.175, Math.PI / 2));
  if (c.cond === 0) for (let k = 0; k < 2; k++) b.add('rust', cbox(0.12, 0.3, 0.004, 0.002), 0x6a4020, at(vx + 0.9 + k * 1.1, py - 0.3, -HALF + 0.004));
  // a ventilation grille high on the north wall: a frame and its louvres
  const gx = wallSpot(c, true, 2, 8) ?? 99;
  if (gx < 50) b.add('metal', cbox(0.5, 0.32, 0.03, 0.006), tone(0x8a8e88), at(gx, 1.95, -HALF + 0.015));
  if (gx < 50) for (let k = 0; k < 6; k++) b.add('rubber', cbox(0.44, 0.022, 0.03, 0.004), 0x1a1c1a, at(gx, 1.83 + k * 0.045, -HALF + 0.02, -0.5, 0, 0));
  // switch and socket plates by the door, a cable tray and its loom along the west wall
  b.add('enamel', cbox(0.08, 0.12, 0.012, 0.004), tone(0xe0dcd0), at(0.6, 1.3, -HALF + 0.006));
  b.add('bakelite', cbox(0.02, 0.04, 0.012, 0.003), 0x3a2a1a, at(0.6, 1.3, -HALF + 0.014));
  for (const x of [-0.9, 0.9]) { b.add('enamel', cbox(0.1, 0.07, 0.012, 0.004), tone(0xe0dcd0), at(-HALF + 0.006, 0.3, x, 0, Math.PI / 2, 0)); }
  b.add('metal', cbox(0.08, 0.03, HALF * 2 - 0.2, 0.004), tone(0x7a7e78), at(-HALF + 0.06, 2.42, 0));
  for (let k = 0; k < 3; k++) b.add('rubber', tube([[-HALF + 0.06, 2.44, -HALF + 0.1], [-HALF + 0.06, 2.44 + 0.01 * k, 0], [-HALF + 0.06, 2.44, HALF - 0.1]], 0.009, 4, 4), [0x1a1a1a, 0x2a3a6a, 0x6a2a1a][k]);
  // the floor cables: from a socket along the skirting to the room's machine
  for (let k = 0; k < 2; k++) b.add('rubber', tube([[-HALF + 0.05, 0.02, -0.9 + k * 1.8], [-HALF + 0.08, 0.012, -0.3 + k * 0.9], [-1.2 + R() * 0.4, 0.012, -0.5 + R() * 0.6]], 0.012, 8, 4), [0x1a1a1a, 0x3a3a34][k]);
  // the exit pictogram over the door: a green lit box, a white running figure and an arrow, drawn in solid bars
  {
    const ex = 1.25, ey = 2.28, ez = -HALF + 0.03, lit = c.on;
    b.add('metal', cbox(0.36, 0.17, 0.05, 0.008), tone(0x3a3e38), at(ex, ey, ez));
    b.add(lit ? 'lamp' : 'paint', cbox(0.32, 0.13, 0.006, 0.002), lit ? 0x3ac85a : 0x1e4a26, at(ex, ey, ez + 0.026));
    const W = lit ? 'lamp' : 'paint', wc = lit ? 0xf4fff4 : 0x8a9a8a;
    b.add(W, gem(0.012, 6, 0.012), wc, at(ex - 0.07, ey + 0.035, ez + 0.03));
    b.add(W, cbox(0.012, 0.05, 0.004, 0.001), wc, at(ex - 0.075, ey + 0.002, ez + 0.03, 0, 0, 0.3));
    b.add(W, cbox(0.01, 0.04, 0.004, 0.001), wc, at(ex - 0.06, ey - 0.032, ez + 0.03, 0, 0, -0.6));
    b.add(W, cbox(0.01, 0.04, 0.004, 0.001), wc, at(ex - 0.092, ey - 0.03, ez + 0.03, 0, 0, 0.5));
    b.add(W, cbox(0.07, 0.012, 0.004, 0.001), wc, at(ex + 0.06, ey, ez + 0.03));
    b.add(W, cbox(0.03, 0.012, 0.004, 0.001), wc, at(ex + 0.085, ey + 0.012, ez + 0.03, 0, 0, -0.8));
    b.add(W, cbox(0.03, 0.012, 0.004, 0.001), wc, at(ex + 0.085, ey - 0.012, ez + 0.03, 0, 0, 0.8));
  }
  // a fire point: the extinguisher on its bracket with a red pictogram plate over it
  const fz = wallSpot(c, false, 1, 13);
  if (fz !== null) {
    b.add('paint', lathe([[0, 0], [0.07, 0], [0.075, 0.42], [0.05, 0.5], [0.02, 0.52], [0, 0.52]], 10), 0xc8261e, at(-HALF + 0.11, 0.45, fz));
    b.add('rubber', tube([[-HALF + 0.11, 0.98, fz], [-HALF + 0.2, 0.95, fz + 0.05], [-HALF + 0.17, 0.6, fz + 0.08]], 0.01, 5, 4), 0x1a1a1a);
    b.add('metal', cbox(0.04, 0.06, 0.12, 0.006), 0x3a3a3a, at(-HALF + 0.03, 0.8, fz));
    b.add('paint', cbox(0.012, 0.18, 0.18, 0.003), 0xc8261e, at(-HALF + 0.008, 1.32, fz));
    b.add('paint', lathe([[0, 0], [0.035, 0], [0.04, 0.1], [0.02, 0.12], [0, 0.12]], 6), 0xf4ecd8, at(-HALF + 0.016, 1.28, fz, 0, 0, Math.PI / 2));
  }
  // a notice board of pinned papers and photographs (no words), on whichever wall has the room for it
  const nb = wallSpot(c, false, 4, 7), north = nb === null;
  const nbx = north ? wallSpot(c, true, 4, 4) : nb;
  if (nbx !== null) {
    const m = north ? at(nbx, 1.5, -HALF + 0.02) : at(-HALF + 0.02, 1.5, nbx, 0, Math.PI / 2, 0);
    b.add('wood', cbox(0.95, 0.66, 0.03, 0.008), 0x5a3a20, m);
    b.add('sponge', cbox(0.88, 0.59, 0.01, 0.004), tone(0xb08a50), mul(m, at(0, 0, 0.018)));
    for (let k = 0; k < 9; k++) {
      const pw = 0.12 + R() * 0.1, ph = 0.14 + R() * 0.1, px = -0.34 + R() * 0.68, pyy = -0.2 + R() * 0.4;
      const photo = k % 4 === 1;
      b.add('paint', cbox(pw, ph, 0.003, 0.001), photo ? 0xe8e8e0 : [0xece4cc, 0xe0d8b8, 0xf4f0e0, 0xd8e0c8][k % 4], mul(m, at(px, pyy, 0.026 + k * 0.0005, 0, 0, (R() - 0.5) * 0.25)));
      if (photo) b.add('paint', cbox(pw - 0.025, ph - 0.045, 0.003, 0.001), [0x4a5a6a, 0x5a4a3a, 0x3a4a3a][k % 3], mul(m, at(px, pyy + 0.01, 0.028 + k * 0.0005)));
      else for (let l = 0; l < 4; l++) b.add('rubber', cbox(pw * (0.5 + R() * 0.35), 0.006, 0.002, 0.001), 0x4a4a44, mul(m, at(px - pw * 0.1, pyy + ph * 0.3 - l * 0.025, 0.029 + k * 0.0005)));
      b.add('paint', gem(0.008, 5, 0.008), [0xc8261e, 0x2a6ac8, 0xe8c020][k % 3], mul(m, at(px, pyy + ph / 2 - 0.015, 0.035)));
    }
    if (c.cond === 0) b.add('paint', cbox(0.2, 0.26, 0.003, 0.001), 0xd8d0b8, mul(m, at(0.3, -0.42, 0.03, 0.2, 0, 0.7)));
  }
  // a cast-iron radiator under a free stretch of the west wall
  const rz = wallSpot(c, false, 3, 9);
  if (rz !== null && !c.grid[Math.floor((rz + HALF) / CELL) * GN]) {
    for (let k = 0; k < 9; k++) b.add('metal', cbox(0.08, 0.55, 0.05, 0.012), tone(c.cond <= 1 ? 0x8a7a6a : 0xd8d4c8), at(-HALF + 0.09, 0.4, rz - 0.3 + k * 0.075));
    b.add('metal', prism(0.016, 0.1, 6), tone(0x5a5a54), at(-HALF + 0.09, 0.1, rz + 0.38));
  }
  // the practicals: a caged sconce on the west wall, its bulb lit when powered
  const sz = wallSpot(c, false, 1, 3) ?? -1.2;
  b.add('metal', cbox(0.08, 0.14, 0.06, 0.01), 0x3a3a34, at(-HALF + 0.03, 1.95, sz));
  b.add('metal', lathe([[0, 0], [0.07, 0], [0.07, 0.12], [0, 0.14]], 8), 0x2a2a24, at(-HALF + 0.12, 1.9, sz, 0, 0, -Math.PI / 2));
  b.add(c.on ? 'lamp' : 'glass', gem(0.04, 8, 0.05), c.on ? 0xffd8a0 : 0x4a4038, at(-HALF + 0.14, 1.9, sz));
  out.push({ p: new THREE.Vector3(-HALF + 0.3, 1.9, sz), color: 0xffc888, k: 1 });
  // a derelict room: a red emergency beacon turning over the door instead
  if (c.cond <= 1 && !c.locked) {
    b.add('metal', cbox(0.12, 0.05, 0.08, 0.01), 0x2a2a24, at(0.62, 2.45, -HALF + 0.05));
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff3a1a, toneMapped: false }));
    dome.position.set(0.62, 2.475, -HALF + 0.05); dome.userData.noGlow = true;
    c.g.add(dome);
    c.ticks.push((t) => { const k = 0.35 + 0.65 * Math.max(0, Math.sin(t * 4.2)); (dome.material as THREE.MeshBasicMaterial).color.setRGB(1.6 * k, 0.25 * k, 0.1 * k); });
    out.push({ p: new THREE.Vector3(0.62, 2.3, -HALF + 0.4), color: 0xff4a20, k: 0.8, emergency: true });
  }
  // a wall clock (stopped in a derelict room)
  const cx = wallSpot(c, true, 1, 1);
  if (cx !== null) {
    b.add('paint', lathe([[0, 0], [0.13, 0], [0.13, 0.03], [0, 0.035]], 14), 0x2a2a24, at(cx, 2.0, -HALF + 0.005, Math.PI / 2));
    b.add('enamel', lathe([[0, 0], [0.115, 0], [0, 0.002]], 14), 0xf4f0e4, at(cx, 2.0, -HALF + 0.038, Math.PI / 2));
    for (let k = 0; k < 12; k++) b.add('rubber', cbox(0.006, 0.02, 0.002, 0.001), 0x14140f, at(cx + Math.sin(k / 12 * Math.PI * 2) * 0.095, 2.0 + Math.cos(k / 12 * Math.PI * 2) * 0.095, -HALF + 0.041, 0, 0, -k / 12 * Math.PI * 2));
    const hands = new THREE.Group(); hands.position.set(cx, 2.0, -HALF + 0.045);
    const hb = new FacetBuilder();
    hb.add('rubber', cbox(0.008, 0.07, 0.003, 0.001), 0x14140f, at(0, 0.03, 0));
    const hh = hb.build(c.mats); hands.add(hh);
    const mb = new FacetBuilder(); mb.add('paint', cbox(0.004, 0.09, 0.003, 0.001), 0xc8261e, at(0, 0.04, 0.002));
    const mm = mb.build(c.mats); const mh = new THREE.Group(); mh.add(mm); hands.add(mh);
    c.g.add(hands);
    if (c.cond >= 2) c.ticks.push((t) => { mh.rotation.z = -t * 0.105; hh.rotation.z = -t * 0.0087 - 1.3; }); else { mh.rotation.z = -2.1; hh.rotation.z = -4.0; }
  }
  void id;
  return out;
}
function floor(c: DressCtx) {
  const { R } = c;
  // the worn path from the door into the room, scuffs, a drain
  const wear = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 2.6), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: c.cond >= 3 ? 0.1 : 0.2, depthWrite: false, alphaMap: wornMap() }));
  wear.rotation.x = -Math.PI / 2; wear.rotation.z = 0.35; wear.position.set(0.8, 0.003, -0.7); wear.renderOrder = 1; wear.userData.noGlow = true;
  c.g.add(wear);
  for (let k = 0; k < 7; k++) c.b.add('rubber', cbox(0.12 + R() * 0.2, 0.002, 0.012, 0.001), 0x2a2620, at((R() - 0.5) * 3, 0.002, (R() - 0.5) * 3, 0, R() * 3, 0));
  const dp = floorSpot(c, 0.4, 0.9, 0.25, 0.25, 0.8);
  if (dp) { c.b.add('metal', cbox(0.22, 0.008, 0.22, 0.003), 0x5a5e5a, at(dp[0], 0.004, dp[1])); for (let k = 0; k < 5; k++) c.b.add('rubber', cbox(0.18, 0.004, 0.012, 0.001), 0x0e0e0c, at(dp[0], 0.009, dp[1] - 0.08 + k * 0.04)); c.grid[Math.floor((dp[1] + HALF) / CELL) * GN + Math.floor((dp[0] + HALF) / CELL)] = 0; }
  // a door mat once the room is restored
  if (c.cond >= 3) c.b.add('sponge', cbox(0.7, 0.012, 0.45, 0.003), 0x5a4a3a, at(1.25, 0.006, -HALF + 0.38));
}

let worn: THREE.Texture | null = null;
function wornMap(): THREE.Texture {
  if (worn) return worn;
  const cv = document.createElement('canvas'); cv.width = 32; cv.height = 64;
  const x = cv.getContext('2d')!;
  x.fillStyle = '#000'; x.fillRect(0, 0, 32, 64);
  for (let i = 0; i < 260; i++) { const yy = Math.random() * 64, w = 10 * Math.sin((yy / 64) * Math.PI) + 2; const v = Math.floor(120 + Math.random() * 120); x.fillStyle = `rgb(${v},${v},${v})`; x.fillRect(16 + (Math.random() - 0.5) * w * 1.6, yy, 2, 2); }
  worn = new THREE.CanvasTexture(cv);
  return worn;
}

// ---------------------------------------------------------------- each room's own clutter
type Prop = ['w', string, number, number, number, number, number] | ['g', string, number, number, number, number, number, number?] | ['f', (b: FacetBuilder, m: M4, c: DressCtx) => void, number, number, number, number, number, number?];
const BIN = (b: FacetBuilder, m: M4, c: DressCtx) => { b.add('metal', lathe([[0, 0], [0.13, 0], [0.15, 0.36], [0, 0.36]], 10), c.cond <= 1 ? 0x6a6a5a : 0x5a6a5a, m); for (let i = 0; i < 4; i++) b.add('paint', jitter(cbox(0.08, 0.06, 0.08, 0.02), 0.02, i), 0xd8d0b8, mul(m, at((i % 2 - 0.5) * 0.08, 0.36 + (i > 1 ? 0.03 : 0), (i > 1 ? 0.04 : -0.04), i, i, 0))); };
const SIDETABLE = (b: FacetBuilder, m: M4) => {
  b.add('wood', cbox(0.6, 0.04, 0.45, 0.008), 0x6a4a2a, mul(m, at(0, 0.72, 0)), { grain: 'x' });
  for (const sx of [-0.26, 0.26]) for (const sz of [-0.18, 0.18]) b.add('metal', prism(0.016, 0.7, 6), 0x3a3a34, mul(m, at(sx, 0.35, sz)));
  b.add('enamel', lathe([[0, 0], [0.04, 0], [0.045, 0.09], [0, 0.09]], 8), 0xe8e4d8, mul(m, at(0.18, 0.74, 0.08)));
  b.add('paint', cbox(0.2, 0.004, 0.28, 0.001), 0xe8e0c8, mul(m, at(-0.1, 0.742, 0, 0, 0.2, 0)));
};
const IV = (b: FacetBuilder, m: M4) => {
  b.add('chrome', prism(0.012, 1.7, 6), 0xc0c4c8, mul(m, at(0, 0.85, 0)));
  for (let i = 0; i < 5; i++) b.add('chrome', cbox(0.22, 0.015, 0.02, 0.004), 0xc0c4c8, mul(m, at(0, 0.03, 0, 0, i * 1.256, 0)));
  b.add('glass', cbox(0.1, 0.16, 0.04, 0.02), 0xd8ecf0, mul(m, at(0.08, 1.5, 0)));
  b.add('rubber', tube([[0.08, 1.42, 0], [0.12, 1.0, 0.05], [0.3, 0.9, 0.2]], 0.005, 6, 3), 0xd8e0e0, m);
};
const SPOOL = (b: FacetBuilder, m: M4) => { for (const y of [0.02, 0.48]) b.add('wood', lathe([[0, 0], [0.32, 0], [0.32, 0.04], [0, 0.04]], 12), 0x8a6a40, mul(m, at(0, y, 0))); b.add('rubber', lathe([[0, 0], [0.24, 0], [0.24, 0.44], [0, 0.44]], 12), 0x1a1a1a, mul(m, at(0, 0.05, 0))); };
const JARS = (b: FacetBuilder, m: M4) => {
  b.add('metal', cbox(0.9, 0.04, 0.32, 0.006), 0x6a6e70, mul(m, at(0, 0.9, 0))); b.add('metal', cbox(0.9, 0.04, 0.32, 0.006), 0x6a6e70, mul(m, at(0, 0.45, 0)));
  for (const x of [-0.43, 0.43]) b.add('metal', cbox(0.03, 1.4, 0.32, 0.006), 0x4a4e50, mul(m, at(x, 0.7, 0)));
  for (let i = 0; i < 6; i++) { const y = i < 3 ? 0.47 : 0.92, x = -0.28 + (i % 3) * 0.28; b.add('glass', lathe([[0, 0], [0.08, 0], [0.08, 0.24], [0.05, 0.26], [0, 0.26]], 10), 0xa8d0c0, mul(m, at(x, y, 0))); b.add('leather', gem(0.05, 5, 0.06), [0xd8b8a0, 0x8a6a5a, 0xc8c0a0][i % 3], mul(m, at(x, y + 0.1, 0))); b.add('metal', lathe([[0, 0], [0.06, 0], [0.06, 0.02], [0, 0.02]], 10), 0x3a3a34, mul(m, at(x, y + 0.26, 0))); }
};
const BINS = (b: FacetBuilder, m: M4) => { for (let r = 0; r < 4; r++) for (let i = 0; i < 5; i++) b.add('paint', cbox(0.15, 0.12, 0.2, 0.01, 0.15), [0x2a6ac8, 0xe8c020, 0xc8261e, 0x3a8a3a][r], mul(m, at(-0.36 + i * 0.18, 0.9 + r * 0.16, 0.08))); b.add('metal', cbox(0.95, 0.7, 0.04, 0.006), 0x4a4e50, mul(m, at(0, 1.12, -0.04))); };
const CURTAIN = (b: FacetBuilder, m: M4) => { b.add('chrome', prism(0.012, 1.0, 6), 0xc0c4c8, mul(m, at(0, 1.85, 0, 0, 0, Math.PI / 2))); for (let i = 0; i < 8; i++) b.add('sponge', cbox(0.13, 1.6, 0.02, 0.008), 0x8a2a1a, mul(m, at(-0.45 + i * 0.13, 1.03, Math.sin(i * 1.7) * 0.04, 0, Math.sin(i) * 0.4, 0))); };
const BOOTS = (b: FacetBuilder, m: M4) => { for (const x of [-0.07, 0.07]) { b.add('leather', cbox(0.1, 0.22, 0.12, 0.03), 0x3a2a1a, mul(m, at(x, 0.11, -0.03))); b.add('leather', cbox(0.1, 0.07, 0.26, 0.03), 0x3a2a1a, mul(m, at(x, 0.035, 0.04))); } };
const LADDER = (b: FacetBuilder, m: M4) => { for (const x of [-0.2, 0.2]) b.add('metal', cbox(0.04, 1.4, 0.05, 0.008), 0xc8c8c0, mul(m, at(x, 0.68, 0, 0.12, 0, 0))); for (let i = 0; i < 4; i++) b.add('metal', cbox(0.4, 0.03, 0.12, 0.006), 0xa8a8a0, mul(m, at(0, 0.3 + i * 0.32, -0.04 - i * 0.04))); };
const CAM = (b: FacetBuilder, m: M4) => { b.add('metal', cbox(0.05, 0.2, 0.05, 0.01), 0x3a3a34, mul(m, at(0, 0, 0))); b.add('paint', cbox(0.1, 0.09, 0.22, 0.02), 0xd8d4c8, mul(m, at(0, -0.12, 0.08, 0.4, 0, 0))); b.add('glass', lathe([[0, 0], [0.03, 0], [0, 0.01]], 8), 0x1a2a3a, mul(m, at(0, -0.17, 0.2, -1.2, 0, 0))); };
const TRAYS = (b: FacetBuilder, m: M4) => { for (let i = 0; i < 6; i++) b.add('paint', cbox(0.4, 0.015, 0.3, 0.006), [0x8a3a2a, 0x3a5a7a][i % 2], mul(m, at(0, 0.008 + i * 0.016, 0, 0, (i % 2) * 0.05, 0))); };
const MAT = (b: FacetBuilder, m: M4) => { b.add('rubber', cbox(1.0, 0.012, 0.6, 0.003), 0x2a2c2a, mul(m, at(0, 0.006, 0))); for (let i = 0; i < 9; i++) b.add('rubber', cbox(0.98, 0.006, 0.02, 0.002), 0x3a3c3a, mul(m, at(0, 0.014, -0.26 + i * 0.065))); };
const HAZARD_RING = (b: FacetBuilder, m: M4) => { for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; b.add('hazard', cbox(0.3, 0.004, 0.08, 0.001), 0xffffff, mul(m, at(Math.cos(a) * 1.18, 0.003, Math.sin(a) * 1.18, 0, -a + Math.PI / 2, 0))); } };
const KEYPAD = (b: FacetBuilder, m: M4) => { b.add('metal', cbox(0.12, 0.18, 0.03, 0.008), 0x4a4e50, m); for (let i = 0; i < 9; i++) b.add('bakelite', cbox(0.022, 0.018, 0.01, 0.003), 0xd8d4c8, mul(m, at(-0.03 + (i % 3) * 0.03, -0.04 + Math.floor(i / 3) * 0.028, 0.018))); b.add('lamp', cbox(0.02, 0.01, 0.006, 0.002), 0x3aff5a, mul(m, at(0, 0.065, 0.017))); };

/** [source, key or builder, x, z, ry, footprint w, footprint d, y (on a surface)] */
const EXTRA: Partial<Record<RoomId, Prop[]>> = {
  monitors: [['w', 'filing_cabinet', -1.7, 0.7, Math.PI / 2, 0.5, 0.75], ['w', 'zw_crt_cart', 1.5, 1.0, -0.6, 0.75, 0.75], ['f', BIN, -0.6, 0.6, 0, 0.3, 0.3], ['g', 'clipboard', -1.2, -0.95, 0.4, 0, 0, 0.92], ['g', 'radio', 1.3, -0.95, -0.3, 0, 0, 0.92], ['f', MAT, 0.3, 0.1, 0, 1.0, 0.6]],
  control: [['w', 'printer_desk', -1.3, 1.45, 0, 1.0, 0.75], ['g', 'stationery', -0.8, -1.2, 0.3, 0, 0, 0.77], ['g', 'clipboard', 0.0, -1.35, -0.2, 0, 0, 0.77], ['f', BIN, 0.1, 0.9, 0, 0.3, 0.3], ['g', 'kettle', 1.0, 0.55, 0.5, 0, 0, 0.77], ['w', 'chair_office', -1.3, 0.75, 2.6, 0.5, 0.5]],
  lattice: [['f', HAZARD_RING, 0, -0.3, 0, 0, 0], ['g', 'gas_tank', -1.65, 1.4, 0.4, 0.5, 0.5], ['f', SPOOL, 1.4, -1.35, 0, 0.7, 0.7], ['w', 'electrical_cabinet', -1.7, 0.5, Math.PI / 2, 0.5, 1.0], ['f', LADDER, 0.9, 1.6, 0.3, 0.5, 0.4]],
  archive: [['g', 'hand_truck', -1.5, 1.2, 0.8, 0.5, 0.5], ['g', 'storage_cart', -1.6, 0.25, Math.PI / 2, 0.5, 1.0], ['g', 'carton', 1.55, 1.6, 0.2, 0.5, 0.5], ['f', LADDER, -0.9, -1.05, 0, 0.5, 0.4], ['g', 'stationery', 0.4, 0.5, 0.6, 0, 0, 0.8]],
  unit: [['f', IV, 0.75, -0.3, 0, 0.3, 0.3], ['w', 'wheelchair', -1.35, 1.3, 0.7, 0.75, 1.0], ['w', 'medical_cabinet', -1.7, 0.1, Math.PI / 2, 0.5, 1.0], ['g', 'gallon', 1.5, 1.5, 0.2, 0.3, 0.3], ['f', TRAYS, 1.45, 0.4, 0, 0.5, 0.4]],
  vault: [['w', 'locker', -1.7, 0.4, Math.PI / 2, 0.5, 0.5], ['g', 'drum', -1.5, 1.45, 0, 0.6, 0.6], ['f', KEYPAD, 1.0, -HALF + 0.02, 0, 0, 0, 1.3], ['f', CAM, -HALF + 0.15, -HALF + 0.15, Math.PI / 4, 0, 0, 2.45], ['w', 'electrical_cabinet', 1.65, -1.2, -Math.PI / 2, 0.5, 1.0]],
  fab: [['g', 'tool_chest', -1.65, 0.3, Math.PI / 2, 0.5, 1.0], ['g', 'gas_tank', 1.6, -0.6, -0.5, 0.5, 0.5], ['f', BINS, -1.95, 1.2, Math.PI / 2, 0, 0], ['g', 'propane', -1.5, 1.55, 0.3, 0.5, 0.5], ['f', BIN, 1.5, 1.6, 0, 0.3, 0.3]],
  clone: [['f', JARS, -1.82, 0.7, Math.PI / 2, 0.4, 1.0], ['w', 'operating_table', -0.4, 1.25, 0, 1.0, 2.0], ['g', 'chem_set', 1.5, 1.2, 0.4, 0.5, 0.5], ['g', 'microscope_old', 1.5, 0.4, -0.6, 0, 0, 1.2]],
  workshop: [['g', 'welder', 1.45, 0.4, -Math.PI / 2, 0.75, 0.75], ['g', 'tool_cart', 0.4, 1.3, 0.2, 1.0, 0.5], ['g', 'drum', 1.6, 1.5, 0, 0.6, 0.6], ['f', CURTAIN, 1.2, -0.45, 0, 1.0, 0.3], ['g', 'toolbox', -0.9, -1.55, 0.3, 0, 0, 0.94]],
  bunks: [['f', SIDETABLE, 0.35, 1.25, 0.1, 0.75, 0.5], ['g', 'radio', 0.42, 1.28, 0.3, 0, 0, 0.74], ['f', BOOTS, -1.0, 0.75, 0.4, 0.3, 0.4], ['f', BIN, 1.6, 1.65, 0, 0.3, 0.3], ['g', 'stool_low', 0.35, 0.65, 0.3, 0.4, 0.4]],
  dress: [['f', BIN, 1.55, -0.6, 0, 0.3, 0.3], ['f', BOOTS, -1.2, -0.05, 0.2, 0.3, 0.4], ['f', MAT, 0.5, 0.4, 0, 1.0, 0.6], ['g', 'stool_low', 1.55, 0.3, 0, 0.4, 0.4]],
  canteen: [['g', 'kettle', 0.3, -1.55, 0.5, 0, 0, 1.04], ['f', TRAYS, 1.6, -1.55, 0, 0, 0, 1.04], ['w', 'fridge', -1.6, 0.6, Math.PI / 2, 1.0, 0.75], ['f', BIN, -0.2, -0.6, 0, 0.3, 0.3], ['g', 'stool_tall', 1.4, -0.7, 0.4, 0.4, 0.4]],
};

/** lay the room's dressing over it; returns its practical lamps */
export function dressRoom(c: DressCtx, id: RoomId): Practical[] {
  if (c.locked && c.cond === 0) { ceiling(c); return walls(c, id); }
  ceiling(c);
  const pr = walls(c, id);
  floor(c);
  for (const p of EXTRA[id] ?? []) {
    const [src, key, x, z, ry, w, d, y] = p as [string, unknown, number, number, number, number, number, number?];
    let px = x, pz = z;
    if (w > 0 && d > 0) { const s = floorSpot(c, x, z, w, d, 0.5); if (!s) continue; [px, pz] = s; }
    const yy = y ?? 0;
    if (src === 'f') { (key as (b: FacetBuilder, m: M4, c: DressCtx) => void)(c.b, at(px, yy, pz, 0, ry, 0), c); continue; }
    const o = src === 'w' ? world(key as string) : glb(key as string, c.mats);
    o.position.set(px, yy, pz); o.rotation.y = ry;
    o.traverse((q) => { const m = q as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    c.g.add(o);
  }
  // the room's task lamp: a practical over its work
  return pr;
}
