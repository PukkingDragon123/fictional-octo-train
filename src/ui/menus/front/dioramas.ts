// THE FACILITY'S ROOMS AS DIORAMAS (round 26): one cutaway room per facility room (src/game/facility.ts), at
// full scale (4 x 4 m, the two back walls standing, the two front walls cut low like a section model), in the
// menu rooms' kit (faceted parts, pixel textures, scene/facet.ts). Each room is dressed by its condition:
//   0 derelict   debris (rubble, fallen ceiling panels, planks, a broken chair, a tarp over a crate), grime, water
//                and a burnt patch, a dead light hanging off its chain, wiring out of the conduit, a cracked wall,
//                a door boarded shut; LOCKED adds hazard tape on posts across the front
//   1 cleared    the debris gone (into the skip, part B), the rest still as it was
//   2 repaired   the light up and lit, the wiring back in, the crack patched, the boards off: powered
//   3 restored   cleaned: bright and warm, the room's finishes (part B: paint, paper, tile, carpet, light)
// No words anywhere (the map has no text). buildRoom(id, condition, locked, mats, seed, furniture, opts) -> Diorama.
// Part B (src/ui/menus/front/build): `loose` builds the debris as separate pieces (dragged into the skip), `work`
// puts the skip in the corridor in front with what is already in it, `finish` dresses the shell; every diorama
// also carries its floor and wall occupancy (what the room's own fixtures stand on) for build mode.
import * as THREE from 'three';
import type { FMats, FKey } from '../scene/pixtex';
import { FacetBuilder, at, cbox, prism, lathe, jitter, tube, gem } from '../scene/facet';
import { crtSet, type CrtSpot } from '../monitor/props';
import { chairModel } from '../roomParts';
import { puddle } from '../rooms/dress';
import type { RoomId, Condition, Furniture, RoomFinish, RoomWork } from '../../../game/facility';
import { finishSpec, debrisCount } from '../../../game/facilityStores';
import { extMats, XREP, type XKey, type XMats } from './build/kit';

export const HALF = 2, WALL_H = 2.6, CUT_H = 0.34, WT = 0.2;
/** build mode's grid: cells of CELL metres, GN to a side of the floor */
export const CELL = 0.25, GN = 16;
/** the skip's place (room-local: in the corridor in front of the cut south wall), its inner size */
export const SKIP_AT = new THREE.Vector3(0.45, -0.08, HALF + WT + 0.34), SKIP_W = 1.4, SKIP_D = 0.5, SKIP_H = 0.5;
type M4 = THREE.Matrix4;
const mul = (a: M4, b: M4) => new THREE.Matrix4().multiplyMatrices(a, b);

export interface Diorama {
  group: THREE.Group;
  /** where its light hangs (room-local) and its colour when powered */
  light: THREE.Vector3; color: number; powered: boolean;
  /** room-local look point for the zoom */
  focus: THREE.Vector3;
  tick(t: number, dt: number): void;
  /** part B: floor cells (GN x GN, x across then z deep) the room's own fixtures stand on (1) */
  grid: Uint8Array;
  /** part B: wall cells behind its fixtures: GN along the north wall (x), then GN along the west wall (z) */
  wall: Uint8Array;
  /** part B: the debris as separate pieces (loose builds only) */
  debris: DebrisPiece[];
  /** part B: the skip, while the room is being cleared */
  skip: THREE.Object3D | null;
  /** part B: the grime the cleaning takes away (puddles, papers, the burnt patch, stains) */
  grime: THREE.Object3D[];
}
/** a piece of debris: its number (the save's), the object, what it sounds like, its size, where it lies */
export interface DebrisPiece { n: number; o: THREE.Object3D; kind: 'stone' | 'wood' | 'metal' | 'soft' | 'paper'; r: number; heavy: number; home: THREE.Vector3; binned: boolean }

interface Ctx { b: FacetBuilder; g: THREE.Group; R: () => number; on: boolean; cond: Condition; ticks: ((t: number, dt: number) => void)[]; mats: FMats; x: XMats; finish?: RoomFinish; grime: THREE.Object3D[]; gb: FacetBuilder }
const glow = (on: boolean, c: number) => (on ? c : 0x0c0e10);

// ---------------------------------------------------------------- the shell
interface Skin { floor: FKey | XKey; fc: number; low: FKey | XKey; lc: number; up: FKey | XKey; uc: number; dado?: number }
const SKIN: Record<RoomId, Skin> = {
  monitors: { floor: 'floor', fc: 0x6e7064, low: 'paint', lc: 0x4e5a44, up: 'paint', uc: 0xb8b29a, dado: 1.1 },
  control: { floor: 'floor', fc: 0x8a8676, low: 'paint', lc: 0x5a6a4a, up: 'paint', uc: 0xc8c0a4, dado: 1.2 },
  lattice: { floor: 'metal', fc: 0x5a5e5c, low: 'paint', lc: 0x3a4a52, up: 'paint', uc: 0x8a9aa0, dado: 1.0 },
  archive: { floor: 'wood', fc: 0x8a6a4a, low: 'wood', lc: 0x6a4a30, up: 'paint', uc: 0xc8b898, dado: 1.0 },
  unit: { floor: 'tile', fc: 0x9aa898, low: 'tile', lc: 0xa8b8a8, up: 'tile', uc: 0xb8c4b4 },
  vault: { floor: 'metal', fc: 0x6a6e70, low: 'concrete', lc: 0x7a7a74, up: 'concrete', uc: 0x8a8a84 },
  fab: { floor: 'concrete', fc: 0x8a8680, low: 'paint', lc: 0x4a5a6a, up: 'paint', uc: 0x9aa4aa, dado: 1.3 },
  clone: { floor: 'tile', fc: 0xc8d0c8, low: 'enamel', lc: 0xd8dcd4, up: 'enamel', uc: 0xe0e4dc },
  workshop: { floor: 'concrete', fc: 0x7a766e, low: 'paint', lc: 0x6a5a3a, up: 'paint', uc: 0xb0a890, dado: 1.2 },
  bunks: { floor: 'wood', fc: 0x7a5a3a, low: 'paint', lc: 0x5a4a6a, up: 'paint', uc: 0xc0b4a0, dado: 1.0 },
  dress: { floor: 'tile', fc: 0xb8a890, low: 'tile', lc: 0x8aa0a8, up: 'paint', uc: 0xd0c8b4, dado: 1.4 },
  canteen: { floor: 'tile', fc: 0xc8b878, low: 'tile', lc: 0xd0c8a0, up: 'paint', uc: 0xd8d0b8, dado: 1.2 },
};

/** the room's own skin with its finishes over it (part B) */
function skinOf(id: RoomId, f?: RoomFinish): Skin {
  const s = { ...SKIN[id] };
  const fw = finishSpec(f?.wall), ff = finishSpec(f?.floor);
  if (ff) { s.floor = ff.mat as FKey | XKey; s.fc = ff.color; }
  if (fw) {
    const dk = new THREE.Color(fw.color).multiplyScalar(0.7).getHex();
    if (fw.mat === 'paint') Object.assign(s, { low: 'paint', lc: dk, up: 'paint', uc: fw.color, dado: 1.1 });
    else if (fw.mat === 'tile') Object.assign(s, { low: 'tile', lc: fw.color, up: 'tile', uc: fw.color, dado: undefined });
    else if (fw.mat === 'wood') Object.assign(s, { low: 'wood', lc: dk, up: 'wood', uc: fw.color, dado: 1.0 });
    else Object.assign(s, { low: 'wood', lc: 0x6a4a30, up: fw.mat, uc: fw.color, dado: 1.0 });
  }
  return s;
}
const repOf = (k: FKey | XKey) => (k === 'tile' ? 0.9 : k in XREP ? XREP[k as XKey] : undefined);

function shell(c: Ctx, id: RoomId) {
  const { b } = c, s = skinOf(id, c.cond >= 3 ? c.finish : undefined), grime = c.cond === 0 ? 0.62 : c.cond === 1 ? 0.7 : c.cond === 2 ? 0.86 : 1.06;
  const k = (col: number) => { const cc = new THREE.Color(col).multiplyScalar(grime); return cc.getHex(); };
  const L = HALF * 2, dado = s.dado ?? WALL_H;
  b.add(s.floor as FKey, cbox(L, 0.12, L, 0.01), k(s.fc), at(0, -0.06, 0), { rep: repOf(s.floor) });
  // the two standing walls (west, north): lower course, upper paint, a dado rail
  for (const [m, len] of [[at(-HALF - WT / 2, 0, 0), L + WT], [at(0, 0, -HALF - WT / 2, 0, Math.PI / 2), L]] as [M4, number][]) {
    b.add(s.low as FKey, cbox(WT, dado, len, 0.01), k(s.lc), mul(m, at(0, dado / 2, 0)), { rep: repOf(s.low) });
    if (dado < WALL_H) b.add(s.up as FKey, cbox(WT, WALL_H - dado, len, 0.01), k(s.uc), mul(m, at(0, dado + (WALL_H - dado) / 2, 0)), { ao: 1.6, rep: repOf(s.up) });
    if (s.dado) b.add('wood', cbox(WT + 0.04, 0.05, len, 0.01), k(0x5a4430), mul(m, at(0, dado, 0)));
    // the section cut: a dark cap on the top of the wall
    b.add('rubber', cbox(WT + 0.002, 0.02, len, 0.002), 0x14100c, mul(m, at(0, WALL_H, 0)));
  }
  // the two cut walls (east, south): low, capped dark
  b.add(s.low as FKey, cbox(WT, CUT_H, L + WT, 0.01), k(s.lc), at(HALF + WT / 2, CUT_H / 2, -WT / 2), { rep: repOf(s.low) });
  b.add(s.low as FKey, cbox(L + WT * 2, CUT_H, WT, 0.01), k(s.lc), at(0, CUT_H / 2, HALF + WT / 2), { rep: repOf(s.low) });
  b.add('rubber', cbox(WT + 0.002, 0.02, L + WT, 0.002), 0x14100c, at(HALF + WT / 2, CUT_H, -WT / 2));
  b.add('rubber', cbox(L + WT * 2, 0.02, WT + 0.002, 0.002), 0x14100c, at(0, CUT_H, HALF + WT / 2));
  // skirting, a door in the north wall (boarded on a derelict room)
  b.add('paint', cbox(0.02, 0.1, L, 0.004), 0x2a2a24, at(-HALF + 0.01, 0.05, 0));
  b.add('paint', cbox(L, 0.1, 0.02, 0.004), 0x2a2a24, at(0, 0.05, -HALF + 0.01));
  const dx = 1.25;
  b.add('paint', cbox(1.0, 2.1, 0.06, 0.01), 0x3a3e36, at(dx, 1.05, -HALF + 0.02));
  b.add('metal', cbox(0.86, 2.0, 0.04, 0.01), k(0x6a7062), at(dx, 1.0, -HALF + 0.05));
  b.add('chrome', cbox(0.04, 0.12, 0.05, 0.01), 0xc0c0b8, at(dx + 0.34, 1.0, -HALF + 0.09));
  if (c.cond <= 1) for (let i = 0; i < 3; i++) {
    b.add('wood', cbox(1.1, 0.12, 0.04, 0.01), 0x8a6a40, at(dx, 0.6 + i * 0.55, -HALF + 0.12, 0, 0, (i - 1) * 0.12 + 0.05), { grain: 'x' });
    for (const sx of [-0.45, 0.45]) b.add('chrome', prism(0.008, 0.02, 5), 0x6a6a64, at(dx + sx, 0.6 + i * 0.55 + sx * ((i - 1) * 0.12 + 0.05), -HALF + 0.145, Math.PI / 2));
  }
  // the ceiling light: a trough on brackets off the north wall top
  const lit = c.on;
  const ly = WALL_H - 0.18;
  if (c.cond <= 1) {
    // dead, hanging off one chain
    b.add('enamel', cbox(1.2, 0.08, 0.26, 0.02), 0x8a8676, at(-0.3, ly - 0.45, -0.9, 0.2, 0.3, 0.7));
    b.add('metal', prism(0.006, 0.6, 4), 0x2a2a2a, at(-0.75, ly - 0.05, -1.0, 0, 0, 0.4));
  } else {
    b.add('enamel', cbox(1.3, 0.09, 0.28, 0.02), 0xc8c4b0, at(0, ly, -0.6));
    const lc = c.cond === 3 ? finishSpec(c.finish?.light)?.color ?? 0xfff0d0 : 0xe8f0ff;
    b.add(lit ? 'lamp' : 'glass', cbox(1.2, 0.02, 0.2, 0.004), lit ? lc : 0x2a2c30, at(0, ly - 0.05, -0.6));
    for (const x of [-0.5, 0.5]) b.add('metal', prism(0.006, 0.18, 4), 0x3a3a3a, at(x, ly + 0.1, -0.6));
  }
  // conduit and a pipe run along the walls
  b.add('metal', tube([[-HALF + 0.06, WALL_H - 0.1, HALF], [-HALF + 0.06, WALL_H - 0.1, -HALF + 0.06], [HALF, WALL_H - 0.1, -HALF + 0.06]], 0.025, 3, 6, false), k(0x7a7a70));
}

// ---------------------------------------------------------------- the decay (and the care) laid over every room
function condition(c: Ctx, id: RoomId, locked: boolean) {
  const { b, R, gb } = c;
  if (c.cond <= 2) {
    // water: puddles under the leaks (separate meshes: the cleaning dries them)
    const n = c.cond <= 1 ? 3 : 2;
    for (let i = 0; i < n; i++) { const p = puddle((R() - 0.5) * 3, (R() - 0.5) * 3, 0.6 + R() * 0.9, 0.5 + R() * 0.7, 0.004); c.g.add(p); c.grime.push(p); }
    // papers blown about, a burnt patch with soot up the wall, a water stain (the grime builder: swept on cleaning)
    for (let i = 0; i < 9; i++) gb.add('paint', cbox(0.2, 0.004, 0.28, 0.001), 0xa8a290, at((R() - 0.5) * 3.4, 0.004 + i * 0.001, (R() - 0.5) * 3.4, 0, R() * 6, 0));
    const sx = -HALF + 0.5 + R() * 0.6, sz = 0.2 + R() * 1.2;
    const burn = new THREE.Mesh(new THREE.CircleGeometry(0.5, 12), new THREE.MeshStandardMaterial({ color: 0x0a0806, roughness: 1, transparent: true, opacity: 0.62, depthWrite: false }));
    burn.rotation.x = -Math.PI / 2; burn.scale.set(1.3, 0.9, 1); burn.position.set(sx, 0.005, sz); burn.renderOrder = 2; burn.userData.noGlow = true;
    const soot = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.5), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false, alphaMap: sootMap() }));
    soot.rotation.y = Math.PI / 2; soot.position.set(-HALF + 0.004, 0.75, sz); soot.renderOrder = 2; soot.userData.noGlow = true;
    const stain = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.1), new THREE.MeshBasicMaterial({ color: 0x3a2a10, transparent: true, opacity: 0.35, depthWrite: false, alphaMap: sootMap() }));
    stain.rotation.z = Math.PI; stain.position.set(-0.6 + R() * 0.6, 1.95, -HALF + 0.004); stain.renderOrder = 2; stain.userData.noGlow = true;
    c.g.add(burn, soot, stain); c.grime.push(burn, soot, stain);
    for (let i = 0; i < 6; i++) gb.add('rubber', jitter(cbox(0.1 + R() * 0.12, 0.012, 0.08 + R() * 0.1, 0.004), 0.02, i), 0x14100c, at(sx + (R() - 0.5) * 0.6, 0.008, sz + (R() - 0.5) * 0.5, 0, R() * 3, 0));
  }
  if (c.cond <= 1) {
    // the wiring out of its conduit: loops hanging off the ceiling run, bare copper ends
    for (let i = 0; i < 3; i++) {
      const x = -1.2 + i * 1.0 + R() * 0.3, z = -HALF + 0.08, drop = 0.6 + R() * 0.7;
      b.add('rubber', tube([[x, WALL_H - 0.1, z], [x + 0.12, WALL_H - drop * 0.6, z + 0.15], [x + 0.25, WALL_H - drop, z + 0.12 + R() * 0.2]], 0.012, 6, 4), [0x1a1a1a, 0x8a2a1a, 0x2a4a8a][i]);
      b.add('copper', prism(0.008, 0.06, 4), 0xffffff, at(x + 0.25, WALL_H - drop - 0.03, z + 0.2));
    }
    // a crack down the north wall
    let cx = -0.6 + R() * 0.4, cy = 2.3;
    for (let i = 0; i < 9; i++) { const nx = cx + (R() - 0.5) * 0.14, ny = cy - 0.12 - R() * 0.08; b.add('rubber', cbox(0.016, Math.hypot(nx - cx, ny - cy) + 0.01, 0.006, 0.002), 0x14100c, at((cx + nx) / 2, (cy + ny) / 2, -HALF + 0.002, 0, 0, Math.atan2(cx - nx, ny - cy))); cx = nx; cy = ny; }
    b.add('rubber', cbox(0.02, 1.2, 0.04, 0.004), 0x1a1814, at(-HALF + 0.005, 1.6, -0.4, 0.3, 0, 0.1));
  } else if (c.cond === 2) {
    // the crack filled and sanded, not yet painted
    b.add('paint', cbox(0.5, 1.2, 0.006, 0.002), 0xd8d4c4, at(-0.5, 1.7, -HALF + 0.003));
  }
  if (locked) {
    // hazard tape on posts across the open front, a chained door
    for (const [x, z] of [[-1.8, HALF + 0.05], [1.95, HALF + 0.05], [HALF + 0.05, -1.8]] as [number, number][]) {
      b.add('paint', lathe([[0, 0], [0.12, 0], [0.12, 0.04], [0, 0.04]], 8), 0x1a1a1a, at(x, CUT_H, z));
      b.add('hazard', prism(0.025, 0.85, 6), 0xffffff, at(x, CUT_H + 0.43, z));
    }
    b.add('hazard', cbox(3.75, 0.07, 0.01, 0.002), 0xffffff, at(0.075, CUT_H + 0.72, HALF + 0.05, 0, 0, 0.012));
    b.add('hazard', cbox(0.01, 0.07, 3.75, 0.002), 0xffffff, at(HALF + 0.05, CUT_H + 0.6, 0.075, 0.01, 0, 0));
    for (let i = 0; i < 9; i++) b.add('chrome', cbox(0.07, 0.035, 0.02, 0.006), 0x8a8a84, at(0.95 + i * 0.07, 1.0 + Math.sin(i * 0.8) * 0.04, -HALF + 0.14, 0, 0, i * 0.7));
    b.add('brass', cbox(0.09, 0.11, 0.04, 0.012), 0xc89a3a, at(1.3, 0.9, -HALF + 0.16));
  }
}

// ---------------------------------------------------------------- the rooms' furniture
const P = (x: number, y: number, z: number, ry = 0) => at(x, y, z, 0, ry, 0);
function desk(c: Ctx, m: M4, w = 1.4, d = 0.7, col = 0x6a5a44) {
  c.b.add('wood', cbox(w, 0.05, d, 0.01), col, mul(m, at(0, 0.74, 0)), { grain: 'x' });
  for (const sx of [-1, 1]) c.b.add('metal', cbox(0.05, 0.72, d - 0.08, 0.01), 0x3a3e40, mul(m, at(sx * (w / 2 - 0.06), 0.36, 0)));
  c.b.add('metal', cbox(0.4, 0.55, d - 0.1, 0.01), 0x5a6050, mul(m, at(w / 2 - 0.3, 0.42, 0)));
}
function chair(c: Ctx, m: M4, col = 0x2a2a30) {
  c.b.add('leather', cbox(0.46, 0.08, 0.44, 0.03), col, mul(m, at(0, 0.46, 0)));
  c.b.add('leather', cbox(0.44, 0.5, 0.07, 0.03), col, mul(m, at(0, 0.76, -0.2)));
  c.b.add('chrome', prism(0.025, 0.4, 6), 0x9a9ea2, mul(m, at(0, 0.22, 0)));
  for (let i = 0; i < 5; i++) c.b.add('metal', cbox(0.3, 0.03, 0.04, 0.008), 0x2a2a2a, mul(m, at(Math.sin(i * 1.256) * 0.14, 0.03, Math.cos(i * 1.256) * 0.14, 0, i * 1.256, 0)));
}
function screen(c: Ctx, s: CrtSpot, col: number) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(s.sw, s.sh), new THREE.MeshBasicMaterial({ color: glow(c.on, col), toneMapped: false }));
  mesh.applyMatrix4(s.m); mesh.position.add(new THREE.Vector3(0, 0, 0.004).applyMatrix4(new THREE.Matrix4().extractRotation(s.m)));
  c.g.add(mesh);
  if (c.on) { const ph = c.R() * 9; c.ticks.push((t) => { const k = 0.85 + 0.15 * Math.sin(t * 7 + ph) * Math.sin(t * 2.3 + ph); (mesh.material as THREE.MeshBasicMaterial).color.setHex(col).multiplyScalar(k); }); }
}
function locker(c: Ctx, m: M4, col: number, open = false) {
  c.b.add('paint', cbox(0.4, 1.8, 0.45, 0.01), col, mul(m, at(0, 0.9, 0)), { rep: 0.35 });
  for (let i = 0; i < 5; i++) c.b.add('rubber', cbox(0.22, 0.012, 0.01, 0.002), 0x1a1a1a, mul(m, at(0, 1.55 + i * 0.03, 0.226)));
  c.b.add('chrome', cbox(0.03, 0.1, 0.03, 0.006), 0xb8b8b0, mul(m, at(0.14, 1.0, 0.24)));
  if (open) c.b.add('paint', cbox(0.38, 1.76, 0.02, 0.006), col, mul(m, at(-0.36, 0.9, 0.36, 0, -1.1, 0)));
}

type Dress = (c: Ctx) => THREE.Vector3;
const ROOMS: Record<RoomId, Dress> = {
  monitors: (c) => {
    // a wall of CRTs over a long console, the operator's chair
    for (let r = 0; r < 2; r++) for (let i = 0; i < 4; i++) {
      const s = crtSet(c.b, -1.35 + i * 0.86, 1.25 + r * 0.62, -HALF + 0.42, 0.62, 0.5, { seed: i + r * 4, color: r ? 0xc8bc98 : 0xb8ae90 });
      screen(c, s, [0x6aff8a, 0x8affa0, 0xffc060, 0x6ad8ff][(i + r) % 4]);
    }
    c.b.add('metal', cbox(3.6, 0.06, 0.6, 0.01), 0x3a4038, at(0, 0.94, -HALF + 0.42));
    c.b.add('paint', cbox(3.6, 0.82, 0.7, 0.02), 0x5a6a4a, at(0, 0.45, -1.1), { rep: 0.4 });
    c.b.add('metal', cbox(3.5, 0.06, 0.5, 0.01), 0x2a2e2a, at(0, 0.88, -1.0, -0.3, 0, 0));
    for (let i = 0; i < 26; i++) c.b.add(c.on && i % 3 === 0 ? 'lamp' : 'bakelite', cbox(0.04, 0.03, 0.04, 0.006), c.on && i % 3 === 0 ? [0x6aff6a, 0xffb040, 0xff4a3a][i % 3 ? 1 : (i % 2)] : 0x2a2a2a, at(-1.6 + i * 0.13, 0.92, -0.95, -0.3, 0, 0));
    chair(c, P(0.3, 0, -0.1, 0.4));
    c.b.add('enamel', lathe([[0, 0], [0.04, 0], [0.045, 0.1], [0, 0.1]], 8), 0xe8e4d8, at(-0.9, 0.95, -0.95));
    return new THREE.Vector3(0, 1.0, -0.8);
  },
  control: (c) => {
    // two desks with terminals, a mainframe bank on the west wall, a map board
    for (const [x, z, ry] of [[-0.5, -1.2, 0], [0.9, 0.2, -Math.PI / 2]] as [number, number, number][]) {
      desk(c, P(x, 0, z, ry));
      const s = crtSet(c.b, x + Math.sin(ry) * -0.1, 0.98, z + Math.cos(ry) * -0.1, 0.42, 0.36, { ry, seed: 5 + x });
      screen(c, s, 0x7aff9a);
      chair(c, P(x + Math.sin(ry) * 0.65, 0, z + Math.cos(ry) * 0.65, ry + Math.PI + 0.3));
    }
    for (let i = 0; i < 3; i++) {
      const z = -1.4 + i * 0.75;
      c.b.add('paint', cbox(0.6, 2.0, 0.7, 0.012), 0x8a8e80, at(-HALF + 0.32, 1.0, z));
      for (let k = 0; k < 2; k++) c.b.add('rubber', lathe([[0, 0], [0.11, 0], [0.11, 0.02], [0, 0.02]], 10), 0x1a1a1a, at(-HALF + 0.63, 1.45, z - 0.15 + k * 0.3, 0, 0, -Math.PI / 2));
      for (let k = 0; k < 6; k++) c.b.add(c.on ? 'lamp' : 'bakelite', cbox(0.01, 0.025, 0.025, 0.004), c.on ? (k % 2 ? 0xff5a3a : 0xffd060) : 0x2a2a2a, at(-HALF + 0.63, 0.9 - k * 0.06, z));
    }
    c.b.add('wood', cbox(1.4, 0.9, 0.04, 0.01), 0x6a5034, at(0.1, 1.75, -HALF + 0.03));
    c.b.add('paint', cbox(1.3, 0.8, 0.02, 0.004), 0x9aaa8a, at(0.1, 1.75, -HALF + 0.06));
    for (let i = 0; i < 7; i++) c.b.add('paint', cbox(0.08, 0.08, 0.01, 0.002), [0xc84a3a, 0x3a6ac8, 0xe8c040][i % 3], at(-0.4 + (i * 0.37) % 1.1, 1.5 + ((i * 0.53) % 0.55), -HALF + 0.075));
    return new THREE.Vector3(0, 1.0, -0.5);
  },
  lattice: (c) => {
    // the research lattice: a cage of brass rods and lit nodes on a plinth, cables up into the dark
    c.b.add('metal', lathe([[0, 0], [1.0, 0], [1.0, 0.12], [0.9, 0.18], [0, 0.18]], 10), 0x3a3e40, at(0, 0, -0.3));
    const nodes: THREE.Vector3[] = [];
    for (let l = 0; l < 4; l++) for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + l * 0.5, r = 0.7 - l * 0.12; nodes.push(new THREE.Vector3(Math.cos(a) * r, 0.45 + l * 0.48, -0.3 + Math.sin(a) * r)); }
    nodes.forEach((p, i) => {
      c.b.add(c.on ? 'lamp' : 'brass', gem(0.06, 6, 0.08), c.on ? (i % 5 === 0 ? 0x7affa0 : 0xffc870) : 0x8a7040, at(p.x, p.y, p.z));
      const q = nodes[(i + 1) % 6 + Math.floor(i / 6) * 6], u = nodes[i + 6];
      for (const o of [q, u]) if (o) c.b.add('brass', tube([[p.x, p.y, p.z], [o.x, o.y, o.z]], 0.012, 1, 5, false), 0xc8a050);
    });
    c.b.add('brass', prism(0.05, 2.0, 8), 0xb89048, at(0, 1.18, -0.3));
    for (let i = 0; i < 4; i++) c.b.add('rubber', tube([[0, 2.1, -0.3], [-0.2 + i * 0.15, 2.4, -1.2], [-0.6 + i * 0.3, WALL_H - 0.05, -HALF + 0.1]], 0.02, 6, 4), [0x1a1a1a, 0x2a4a8a, 0xc8a028, 0x8a2a2a][i]);
    if (c.on) {
      const halo = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.0, 32), new THREE.MeshBasicMaterial({ color: 0xffb860, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
      halo.rotation.x = -Math.PI / 2; halo.position.set(0, 0.2, -0.3); halo.userData.noGlow = true; c.g.add(halo);
      c.ticks.push((t) => { halo.scale.setScalar(1 + 0.05 * Math.sin(t * 1.4)); (halo.material as THREE.MeshBasicMaterial).opacity = 0.25 + 0.12 * Math.sin(t * 2.1); });
    }
    for (const [x, z] of [[-1.5, -1.5], [1.5, 0.9]] as [number, number][]) { c.b.add('paint', cbox(0.5, 1.4, 0.5, 0.02), 0x2a3a42, at(x, 0.7, z)); c.b.add(c.on ? 'lamp' : 'glass', cbox(0.3, 0.2, 0.01, 0.004), c.on ? 0x6ad8ff : 0x223038, at(x, 1.1, z + 0.256)); }
    return new THREE.Vector3(0, 1.1, -0.3);
  },
  archive: (c) => {
    // rows of steel cabinets, a projection table, boxes of files
    for (let i = 0; i < 6; i++) {
      const x = -1.65 + i * 0.56;
      c.b.add('paint', cbox(0.5, 1.3, 0.6, 0.012), 0x6e7a6a, at(x, 0.65, -HALF + 0.32), { rep: 0.35 });
      for (let k = 0; k < 4; k++) { c.b.add('paint', cbox(0.46, 0.29, 0.02, 0.006), 0x7a867a, at(x, 0.17 + k * 0.31, -HALF + 0.63)); c.b.add('chrome', cbox(0.1, 0.02, 0.03, 0.006), 0xd0d0c8, at(x, 0.12 + k * 0.31, -HALF + 0.65)); c.b.add('paint', cbox(0.08, 0.04, 0.005, 0.002), 0xe8e0c8, at(x, 0.24 + k * 0.31, -HALF + 0.645)); }
    }
    c.b.add('paint', cbox(0.5, 0.25, 0.4, 0.02), 0x6e7a6a, at(-1.65 + 0.56 * 2, 0.4, -HALF + 0.86));
    c.b.add('wood', lathe([[0, 0], [0.28, 0], [0.3, 0.7], [0.75, 0.72], [0.75, 0.8], [0, 0.8]], 12), 0x5a4030, at(0.4, 0, 0.5));
    c.b.add(c.on ? 'lamp' : 'glass', lathe([[0, 0], [0.12, 0], [0.1, 0.06], [0, 0.07]], 10), c.on ? 0x8ae8ff : 0x3a4a50, at(0.4, 0.8, 0.5));
    if (c.on) {
      const holo = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), new THREE.MeshBasicMaterial({ color: 0x6ae0ff, wireframe: true, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, toneMapped: false }));
      holo.position.set(0.4, 1.25, 0.5); holo.userData.noGlow = true; c.g.add(holo);
      c.ticks.push((t) => { holo.rotation.y = t * 0.6; holo.position.y = 1.25 + Math.sin(t * 1.2) * 0.04; });
    }
    for (let i = 0; i < 4; i++) c.b.add('wood', cbox(0.42, 0.28, 0.32, 0.006), [0xb89a6a, 0xa88a5a, 0xc8aa7a][i % 3], at(1.55, 0.14 + (i % 2) * 0.28, 1.0 - Math.floor(i / 2) * 0.4, 0, (i - 1.5) * 0.1, 0));
    return new THREE.Vector3(0, 0.9, -0.3);
  },
  unit: (c) => {
    // unit room 4: the link chair under its caged lamp, the arms' base, a drain, a cart monitor
    const ch = chairModel(c.mats, false);
    ch.position.set(0, 0, 0.25); ch.scale.setScalar(1.0);
    c.g.add(ch);
    c.b.add('rubber', cbox(0.36, 0.01, 0.36, 0.002), 0x202020, at(0.9, 0.004, 0.9));
    c.b.add('rust', cbox(0.3, 0.012, 0.3, 0.002), 0xb0a090, at(0.9, 0.008, 0.9));
    c.b.add('paint', lathe([[0, 0], [0.27, 0], [0.27, 0.05], [0.2, 0.1], [0.16, 0.5], [0, 0.5]], 8), 0x4e5636, at(-1.4, 0, -1.4));
    c.b.add('metal', cbox(0.12, 1.2, 0.12, 0.02), 0x4a4e50, at(-1.4, 1.1, -1.4, 0, 0, 0.5));
    c.b.add('metal', cbox(0.1, 0.9, 0.1, 0.02), 0x4a4e50, at(-0.85, 1.75, -1.25, 0, 0.3, -0.9));
    c.b.add('bakelite', lathe([[0, 0], [0.06, 0], [0.06, -0.015], [0, -0.03]], 8), 0xffffff, at(0, WALL_H, 0.1));
    c.b.add('rubber', prism(0.006, 0.7, 4), 0x8a8a8a, at(0, WALL_H - 0.35, 0.1));
    c.b.add('paint', lathe([[0.04, 0], [0.07, -0.025], [0.15, -0.09], [0.19, -0.15]], 10), 0x46603e, at(0, WALL_H - 0.7, 0.1));
    if (c.on) c.b.add('lamp', lathe([[0, 0], [0.04, -0.02], [0.03, -0.08], [0, -0.09]], 7), 0xffe0a0, at(0, WALL_H - 0.75, 0.1));
    const s = crtSet(c.b, 1.4, 1.0, -1.2, 0.46, 0.4, { ry: -0.6, seed: 31 });
    c.b.add('metal', cbox(0.5, 0.75, 0.45, 0.02), 0x5a5e58, at(1.4, 0.4, -1.32, 0, -0.6, 0));
    screen(c, s, 0x6aff8a);
    return new THREE.Vector3(0, 1.0, 0.1);
  },
  vault: (c) => {
    // a round vault door in the north wall, its locking wheel, a containment case with something in it
    const z = -HALF + 0.1;
    c.b.add('metal', lathe([[0, 0], [1.0, 0], [1.0, 0.16], [0.92, 0.22], [0, 0.22]], 18), 0x7a8084, at(-0.3, 1.15, z, Math.PI / 2));
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; c.b.add('chrome', prism(0.04, 0.08, 6), 0xc8ccd0, at(-0.3 + Math.cos(a) * 0.82, 1.15 + Math.sin(a) * 0.82, z + 0.26, Math.PI / 2)); }
    c.b.add('metal', lathe([[0, 0], [0.32, 0], [0.32, 0.05], [0, 0.05]], 12), 0x5a6064, at(-0.3, 1.15, z + 0.24, Math.PI / 2));
    for (let i = 0; i < 4; i++) c.b.add('chrome', cbox(0.04, 0.6, 0.04, 0.01), 0xd0d4d8, at(-0.3, 1.15, z + 0.32, 0, 0, i * Math.PI / 4));
    c.b.add('hazard', cbox(2.4, 0.12, 0.02, 0.002), 0xffffff, at(-0.3, 0.06, -HALF + 0.02));
    // the case: a plinth, glass, a pale thing floating
    c.b.add('paint', cbox(0.6, 0.9, 0.6, 0.03), 0x22262a, at(1.1, 0.45, 0.6));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) c.b.add('metal', cbox(0.02, 0.7, 0.02, 0.004), 0x8a9294, at(1.1 + sx * 0.28, 1.25, 0.6 + sz * 0.28));
    c.b.add('metal', cbox(0.62, 0.06, 0.62, 0.01), 0x3a4044, at(1.1, 1.62, 0.6));
    c.b.add('glass', cbox(0.56, 0.68, 0.56, 0.004), 0x4a6a7a, at(1.1, 1.25, 0.6));
    const thing = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 0), new THREE.MeshStandardMaterial({ color: 0xd8c8b0, roughness: 0.4, flatShading: true, emissive: c.on ? 0x3a1a10 : 0 }));
    thing.position.set(1.1, 1.25, 0.6); c.g.add(thing);
    c.ticks.push((t) => { thing.rotation.set(t * 0.3, t * 0.5, 0); thing.position.y = 1.25 + Math.sin(t * 0.9) * 0.03; });
    c.b.add(c.on ? 'lamp' : 'glass', cbox(0.3, 0.01, 0.3, 0.002), c.on ? 0xd8eeff : 0x2a3034, at(1.1, 1.585, 0.6));
    // a red beacon over the door
    c.b.add(c.on ? 'lamp' : 'glass', lathe([[0, 0], [0.07, 0], [0.06, 0.12], [0, 0.14]], 8), c.on ? 0xff3a1a : 0x4a1a14, at(-0.3, 2.35, z + 0.08));
    return new THREE.Vector3(0, 1.0, -0.6);
  },
  fab: (c) => {
    // the printer: a steel frame with its gantry and bed, spools on a rack, a robot arm on its base
    const X = -0.5, Z = -0.9;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) c.b.add('metal', cbox(0.08, 1.8, 0.08, 0.01), 0x3a4a5a, at(X + sx * 0.75, 0.9, Z + sz * 0.55));
    c.b.add('metal', cbox(1.6, 0.08, 1.2, 0.01), 0x3a4a5a, at(X, 1.8, Z));
    c.b.add('metal', cbox(1.5, 0.06, 1.1, 0.01), 0x2a2e30, at(X, 0.7, Z));
    c.b.add('paint', cbox(1.5, 0.08, 0.12, 0.01), 0xe8b030, at(X, 1.4, Z));
    c.b.add('metal', cbox(0.16, 0.2, 0.18, 0.02), 0x2a2a2a, at(X + 0.2, 1.3, Z));
    c.b.add(c.on ? 'lamp' : 'glass', prism(0.012, 0.06, 6), c.on ? 0xff7a2a : 0x3a2a20, at(X + 0.2, 1.17, Z));
    c.b.add('paint', cbox(0.5, 0.18, 0.4, 0.01), 0x8a8a84, at(X - 0.1, 0.82, Z + 0.1));
    for (let i = 0; i < 4; i++) c.b.add('rubber', lathe([[0.05, 0], [0.16, 0], [0.16, 0.1], [0.05, 0.1]], 12), [0xe8b030, 0x3a8ac8, 0xc84a3a, 0xe8e4d8][i], at(1.4, 0.4 + i * 0.4, -HALF + 0.2, Math.PI / 2));
    c.b.add('metal', cbox(0.4, 1.8, 0.3, 0.01), 0x4a5054, at(1.4, 0.9, -HALF + 0.35));
    // the arm
    c.b.add('paint', lathe([[0, 0], [0.3, 0], [0.3, 0.08], [0.2, 0.14], [0, 0.14]], 8), 0xe8b030, at(0.9, 0, 0.8));
    const arm = new THREE.Group(); arm.position.set(0.9, 0.14, 0.8); c.g.add(arm);
    const ab = new FacetBuilder();
    ab.add('paint', cbox(0.14, 0.8, 0.14, 0.03), 0xe8b030, at(0, 0.4, 0));
    ab.add('metal', prism(0.08, 0.16, 8), 0x2a2a2a, at(0, 0.82, 0, 0, 0, Math.PI / 2));
    ab.add('paint', cbox(0.12, 0.7, 0.12, 0.03), 0xe8b030, at(0.25, 1.05, 0, 0, 0, -1.0));
    ab.add('metal', cbox(0.1, 0.1, 0.18, 0.02), 0x2a2a2a, at(0.55, 1.22, 0));
    arm.add(ab.build(c.mats));
    if (c.cond >= 2) c.ticks.push((t) => { arm.rotation.y = Math.sin(t * 0.5) * 0.9; });
    else arm.rotation.set(0, 0.8, 0.4);
    c.b.add('hazard', cbox(1.8, 0.006, 0.1, 0.001), 0xffffff, at(X, 0.004, Z + 0.85));
    return new THREE.Vector3(0, 0.9, -0.4);
  },
  clone: (c) => {
    // two vats of green fluid on steel bases, pipes into the ceiling, a control column
    for (const [x, z] of [[-0.8, -0.9], [0.6, -1.2]] as [number, number][]) {
      c.b.add('metal', lathe([[0, 0], [0.5, 0], [0.5, 0.3], [0.42, 0.36], [0, 0.36]], 12), 0x5a6064, at(x, 0, z));
      c.b.add('metal', lathe([[0, 0], [0.48, 0], [0.48, 0.14], [0, 0.14]], 12), 0x5a6064, at(x, 2.0, z));
      const fl = c.cond >= 2;
      c.b.add(fl ? 'lamp' : 'glass', lathe([[0, 0], [0.38, 0], [0.38, fl ? 1.5 : 0.35], [0, fl ? 1.5 : 0.35]], 12), fl ? 0x5aff9a : 0x2a4a3a, at(x, 0.36, z));
      c.b.add('glass', lathe([[0, 0], [0.42, 0], [0.42, 1.64], [0, 1.64]], 12), 0x6a9a8a, at(x, 0.36, z));
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.4; c.b.add('chrome', prism(0.018, 1.64, 6), 0xc0c4c8, at(x + Math.cos(a) * 0.43, 1.18, z + Math.sin(a) * 0.43)); }
      c.b.add('copper', tube([[x, 2.14, z], [x, 2.4, z], [x - 0.3, WALL_H - 0.05, -HALF + 0.1]], 0.04, 6, 6), 0xffffff);
      if (fl) {
        const bub = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), new THREE.MeshBasicMaterial({ color: 0xcaffe0, toneMapped: false }));
        bub.userData.noGlow = true; c.g.add(bub);
        const ph = x * 3;
        c.ticks.push((t) => { const k = (t * 0.4 + ph) % 1; bub.position.set(x + Math.sin(t * 3 + ph) * 0.1, 0.45 + k * 1.35, z + 0.1); });
      }
    }
    c.b.add('paint', cbox(0.5, 1.2, 0.4, 0.02), 0xd8dcd4, at(1.5, 0.6, 0.4));
    c.b.add(c.on ? 'lamp' : 'glass', cbox(0.36, 0.26, 0.01, 0.004), c.on ? 0x7affb0 : 0x203028, at(1.5, 1.0, 0.606));
    return new THREE.Vector3(0, 1.1, -0.6);
  },
  workshop: (c) => {
    // a heavy bench with a vice, a pegboard of tools, a toolbox, gas bottles
    c.b.add('wood', cbox(2.2, 0.08, 0.8, 0.012), 0x9a7a4a, at(-0.3, 0.9, -HALF + 0.45), { grain: 'x' });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) c.b.add('metal', cbox(0.07, 0.86, 0.07, 0.01), 0x3a3e40, at(-0.3 + sx * 1.0, 0.43, -HALF + 0.45 + sz * 0.32));
    c.b.add('metal', cbox(2.0, 0.04, 0.6, 0.01), 0x4a4e50, at(-0.3, 0.25, -HALF + 0.45));
    c.b.add('paint', cbox(0.22, 0.16, 0.18, 0.02), 0x2a5a8a, at(0.5, 1.02, -HALF + 0.7));
    c.b.add('chrome', prism(0.015, 0.3, 6), 0xd0d0c8, at(0.5, 1.0, -HALF + 0.85, Math.PI / 2));
    c.b.add('wood', cbox(2.2, 1.0, 0.03, 0.006), 0xb89a6a, at(-0.3, 1.65, -HALF + 0.03));
    const tools = [[0.05, 0.36], [0.04, 0.28], [0.12, 0.06], [0.03, 0.32], [0.08, 0.22], [0.05, 0.4], [0.14, 0.05], [0.04, 0.3]];
    tools.forEach(([w, h], i) => c.b.add(i % 3 ? 'metal' : 'rubber', cbox(w, h, 0.02, 0.004), i % 3 ? 0x9a9ea2 : 0xc83a2a, at(-1.25 + i * 0.27, 1.65 + (i % 2) * 0.12, -HALF + 0.06)));
    c.b.add('paint', cbox(0.6, 0.35, 0.3, 0.02), 0xc83a2a, at(1.4, 0.18, -1.0));
    c.b.add('chrome', cbox(0.3, 0.03, 0.03, 0.006), 0xd0d0c8, at(1.4, 0.38, -1.0));
    for (let i = 0; i < 2; i++) { c.b.add('paint', lathe([[0, 0], [0.12, 0], [0.12, 1.1], [0.07, 1.25], [0, 1.27]], 8), i ? 0x2a6a3a : 0x6a6e70, at(-1.65 + i * 0.3, 0, 1.4)); c.b.add('brass', prism(0.03, 0.08, 6), 0xffffff, at(-1.65 + i * 0.3, 1.3, 1.4)); }
    chair(c, P(-0.2, 0, -0.9, Math.PI), 0x5a3a2a);
    return new THREE.Vector3(-0.2, 1.0, -1.0);
  },
  bunks: (c) => {
    // two bunks along the walls, lockers, a footlocker, a lamp on a crate
    for (const [x, z, ry] of [[-1.5, -0.4, 0], [0.4, -1.55, Math.PI / 2]] as [number, number, number][]) {
      const m = P(x, 0, z, ry);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) c.b.add('metal', prism(0.025, 1.7, 6), 0x4a5a4a, mul(m, at(sx * 0.42, 0.85, sz * 0.95)));
      for (const y of [0.4, 1.3]) {
        c.b.add('metal', cbox(0.86, 0.05, 1.95, 0.01), 0x4a5a4a, mul(m, at(0, y, 0)));
        c.b.add('sponge', jitter(cbox(0.8, 0.12, 1.85, 0.04), c.cond === 0 ? 0.03 : 0.008, Math.round(y * 10 + x)), c.cond === 0 ? 0x6a6450 : 0xd8d0c0, mul(m, at(0, y + 0.09, 0)));
        if (c.cond >= 1) c.b.add('sponge', cbox(0.82, 0.04, 1.2, 0.02), 0x4a5a7a, mul(m, at(0, y + 0.17, 0.3)));
        c.b.add('sponge', cbox(0.5, 0.1, 0.3, 0.04), 0xe8e4d8, mul(m, at(0, y + 0.2, -0.75)));
      }
    }
    for (let i = 0; i < 3; i++) locker(c, P(1.65, 0, 0.2 + i * 0.45, -Math.PI / 2), 0x5a6a5a, i === 1 && c.cond === 0);
    c.b.add('wood', cbox(0.7, 0.4, 0.4, 0.01), 0x5a4a2a, at(-1.5, 0.2, 1.2));
    c.b.add('brass', cbox(0.08, 0.08, 0.02, 0.006), 0xffffff, at(-1.5, 0.3, 1.41));
    return new THREE.Vector3(-0.3, 0.9, -0.5);
  },
  dress: (c) => {
    // a row of lockers, a mirror with its bulbs, a bench, coats on a rail
    for (let i = 0; i < 6; i++) locker(c, P(-1.55 + i * 0.42, 0, -HALF + 0.24), [0x5a7a8a, 0x4a6a7a][i % 2], c.cond === 0 && i === 3);
    c.b.add('wood', cbox(2.4, 0.06, 0.4, 0.01), 0x9a7a4a, at(-0.5, 0.45, -0.6));
    for (const x of [-1.5, 0.5]) c.b.add('metal', cbox(0.05, 0.44, 0.35, 0.01), 0x3a3e40, at(x, 0.22, -0.6));
    c.b.add('wood', cbox(0.05, 1.1, 0.9, 0.01), 0x6a4a2a, at(-HALF + 0.03, 1.5, 0.8));
    c.b.add('chrome', cbox(0.02, 0.95, 0.75, 0.004), c.cond === 0 ? 0x5a6064 : 0xd8e4ec, at(-HALF + 0.06, 1.5, 0.8));
    for (let i = 0; i < 8; i++) { c.b.add(c.on ? 'lamp' : 'glass', gem(0.03, 6, 0.04), c.on ? 0xffe0a0 : 0x4a4030, at(-HALF + 0.08, 0.96 + (i % 4) * 0.36, i < 4 ? 0.36 : 1.24)); }
    c.b.add('chrome', prism(0.015, 1.3, 6), 0xc0c4c8, at(1.0, 1.65, 1.2, 0, 0, Math.PI / 2));
    for (const x of [0.5, 1.4]) c.b.add('chrome', prism(0.015, 1.65, 6), 0xc0c4c8, at(x, 0.83, 1.2));
    for (let i = 0; i < 5; i++) c.b.add('sponge', jitter(cbox(0.08, 0.9, 0.42, 0.03, 0.15), 0.01, i), [0xe8e4d8, 0x2a3a5a, 0x6a2a24, 0xe8e4d8, 0x3a4a3a][i], at(0.6 + i * 0.19, 1.15, 1.2, 0, 0.1 * (i - 2), 0));
    return new THREE.Vector3(-0.3, 1.0, -0.3);
  },
  canteen: (c) => {
    // two tables and their chairs, a vending machine glowing, a counter with an urn
    for (const [x, z] of [[-0.9, 0.6], [0.7, 0.8]] as [number, number][]) {
      c.b.add('enamel', cbox(1.1, 0.04, 0.7, 0.01), 0xe8e0c8, at(x, 0.74, z));
      c.b.add('chrome', prism(0.03, 0.72, 6), 0xc0c4c8, at(x, 0.37, z));
      c.b.add('metal', lathe([[0, 0], [0.3, 0], [0.3, 0.03], [0, 0.03]], 8), 0x6a6e70, at(x, 0, z));
      for (const s of [-1, 1]) { c.b.add('paint', cbox(0.4, 0.05, 0.4, 0.01), 0xc84a2a, at(x + s * 0.35, 0.45, z + s * 0.55)); c.b.add('paint', cbox(0.4, 0.4, 0.05, 0.01), 0xc84a2a, at(x + s * 0.35, 0.7, z + s * 0.74)); c.b.add('chrome', prism(0.02, 0.44, 6), 0xc0c4c8, at(x + s * 0.35, 0.22, z + s * 0.55)); }
    }
    c.b.add('paint', cbox(0.9, 1.9, 0.8, 0.02), 0x8a2a24, at(-1.45, 0.95, -1.5));
    c.b.add(c.on ? 'lamp' : 'glass', cbox(0.6, 1.2, 0.01, 0.004), c.on ? 0xffe0b0 : 0x2a2420, at(-1.55, 1.15, -1.095));
    for (let r = 0; r < 4; r++) for (let i = 0; i < 4; i++) c.b.add('paint', cbox(0.1, 0.14, 0.04, 0.006), [0xe8b030, 0x3a8ac8, 0xc84a3a, 0x6ac84a][(r + i) % 4], at(-1.78 + i * 0.15, 0.7 + r * 0.27, -1.12));
    c.b.add('wood', cbox(2.0, 1.0, 0.6, 0.02), 0x8a6a4a, at(0.8, 0.5, -1.6));
    c.b.add('enamel', cbox(2.1, 0.05, 0.7, 0.01), 0xd8d0b8, at(0.8, 1.02, -1.6));
    c.b.add('chrome', lathe([[0, 0], [0.16, 0], [0.18, 0.4], [0.12, 0.48], [0.04, 0.5], [0, 0.5]], 10), 0xd0d4d8, at(1.4, 1.04, -1.6));
    for (let i = 0; i < 5; i++) c.b.add('enamel', lathe([[0, 0], [0.04, 0], [0.045, 0.09], [0, 0.09]], 8), 0xe8e4d8, at(0.2 + i * 0.12, 1.05, -1.5));
    return new THREE.Vector3(0, 0.9, -0.4);
  },
};

// ---------------------------------------------------------------- part B: debris, the skip, occupancy
let soot: THREE.Texture | null = null;
/** a soft blotch (soot, a water stain) as an alpha map */
function sootMap(): THREE.Texture {
  if (soot) return soot;
  const cv = document.createElement('canvas'); cv.width = cv.height = 32;
  const x = cv.getContext('2d')!;
  const g = x.createRadialGradient(16, 22, 1, 16, 18, 16);
  g.addColorStop(0, '#fff'); g.addColorStop(0.5, '#999'); g.addColorStop(1, '#000');
  x.fillStyle = g; x.fillRect(0, 0, 32, 32);
  for (let i = 0; i < 60; i++) { x.fillStyle = `rgba(0,0,0,${Math.random() * 0.5})`; x.fillRect(Math.random() * 32, Math.random() * 32, 2, 2); }
  soot = new THREE.CanvasTexture(cv);
  return soot;
}

type PieceKind = DebrisPiece['kind'];
const PIECES: { kind: PieceKind; r: number; heavy: number; make: (b: FacetBuilder, m: M4, R: () => number) => void }[] = [
  { kind: 'stone', r: 0.32, heavy: 1, make: (b, m, R) => { // a heap of broken concrete, a bent bar out of it
    for (let i = 0; i < 9; i++) { const r = 0.07 + R() * 0.1; b.add('concrete', jitter(cbox(r, r * 0.7, r, r * 0.3), r * 0.25, i + 3), 0x8a847a, mul(m, at((R() - 0.5) * 0.36, r * 0.3 + (i > 5 ? 0.08 : 0), (R() - 0.5) * 0.36, R(), R() * 3, R())), { rep: 0.3 }); }
    b.add('rust', tube([[-0.2, 0.05, 0.05], [0, 0.18, 0], [0.2, 0.32, -0.05]], 0.01, 4, 5, false), 0x8a5a3a, m);
  } },
  { kind: 'wood', r: 0.45, heavy: 0.5, make: (b, m, R) => { // three snapped planks across each other
    for (let i = 0; i < 3; i++) b.add('wood', cbox(0.9 - i * 0.12, 0.035, 0.12, 0.006), [0x8a6a40, 0x7a5a34, 0x9a7a4a][i], mul(m, at((R() - 0.5) * 0.1, 0.02 + i * 0.035, (i - 1) * 0.08, 0, (i - 1) * 0.5 + R() * 0.2, 0)), { grain: 'x' });
    b.add('chrome', prism(0.006, 0.06, 4), 0x5a5a54, mul(m, at(0.3, 0.1, 0, 0, 0, 0.6)));
  } },
  { kind: 'soft', r: 0.34, heavy: 0.25, make: (b, m, R) => { // a fallen ceiling panel broken in two, its grid bar
    b.add('paint', cbox(0.58, 0.02, 0.3, 0.004), 0xa89c80, mul(m, at(0, 0.02, -0.14, 0.06, 0, 0.04)));
    b.add('paint', cbox(0.52, 0.02, 0.28, 0.004), 0x9a8e74, mul(m, at(0.04, 0.05, 0.14, -0.2, 0.2, 0)));
    b.add('metal', cbox(0.62, 0.03, 0.03, 0.004), 0x8a8a84, mul(m, at(-0.02, 0.08, 0.02, 0, 0.3 + R() * 0.2, 0.1)));
  } },
  { kind: 'metal', r: 0.34, heavy: 0.6, make: (b, m) => { // an office chair on its side, a castor gone
    b.add('leather', cbox(0.44, 0.08, 0.42, 0.03), 0x2a2a30, mul(m, at(0, 0.23, 0, 0, 0, Math.PI / 2)));
    b.add('leather', cbox(0.42, 0.48, 0.07, 0.03), 0x2a2a30, mul(m, at(-0.05, 0.22, -0.24, 0, 0, Math.PI / 2 - 0.1)));
    b.add('chrome', prism(0.022, 0.36, 6), 0x9a9ea2, mul(m, at(0.22, 0.2, 0, 0, 0, Math.PI / 2)));
    for (let i = 0; i < 4; i++) b.add('metal', cbox(0.04, 0.03, 0.28, 0.008), 0x2a2a2a, mul(m, at(0.42, 0.2 + Math.sin(i * 1.57) * 0.12, Math.cos(i * 1.57) * 0.12, i * 1.57, 0, 0)));
  } },
  { kind: 'wood', r: 0.36, heavy: 0.9, make: (b, m) => { // a crate under a tarp, roped
    b.add('wood', cbox(0.5, 0.42, 0.44, 0.012), 0x8a6a40, mul(m, at(0, 0.21, 0)), { grain: 'x' });
    b.add('sponge', jitter(cbox(0.58, 0.46, 0.52, 0.1, 0.12), 0.03, 11), 0x4e5e6a, mul(m, at(0, 0.25, 0.01)));
    b.add('sponge', jitter(cbox(0.7, 0.04, 0.3, 0.02), 0.03, 12), 0x4e5e6a, mul(m, at(0.08, 0.02, 0.32, 0, 0.3, 0)));
    for (const x of [-0.15, 0.15]) b.add('sponge', cbox(0.03, 0.5, 0.56, 0.01), 0xc8b078, mul(m, at(x, 0.25, 0.01)));
  } },
  { kind: 'metal', r: 0.42, heavy: 0.7, make: (b, m) => { // the old light fitting down off its chains, its tube smashed
    b.add('enamel', cbox(1.1, 0.08, 0.24, 0.02), 0x8a8676, mul(m, at(0, 0.05, 0, 0, 0, 0.06)));
    b.add('glass', cbox(0.5, 0.02, 0.16, 0.004), 0x6a7078, mul(m, at(-0.25, 0.02, 0)));
    for (let i = 0; i < 5; i++) b.add('glass', cbox(0.05, 0.01, 0.04, 0.002), 0xa8b0b8, mul(m, at(0.15 + i * 0.07, 0.006, 0.18 - (i % 2) * 0.32, 0, i, 0)));
    b.add('metal', prism(0.006, 0.5, 4), 0x2a2a2a, mul(m, at(0.3, 0.02, 0.12, 0, 0, Math.PI / 2)));
  } },
  { kind: 'metal', r: 0.24, heavy: 0.35, make: (b, m) => { // a paint drum on its side, its spill dried
    b.add('rust', lathe([[0, 0], [0.16, 0], [0.16, 0.36], [0, 0.36]], 10), 0x7a6a5a, mul(m, at(-0.18, 0.16, 0, 0, 0, -Math.PI / 2)));
    b.add('paint', cbox(0.36, 0.006, 0.3, 0.004), 0x8a9a7a, mul(m, at(0.22, 0.003, 0.02)));
  } },
  { kind: 'paper', r: 0.26, heavy: 0.3, make: (b, m) => { // a box of files burst open
    b.add('sponge', cbox(0.38, 0.26, 0.3, 0.006), 0xb89a6a, mul(m, at(0, 0.13, 0, 0, 0, 0.25)));
    for (let i = 0; i < 6; i++) b.add('paint', cbox(0.22, 0.004, 0.3, 0.001), [0xe8e0c8, 0xd8d0b0][i % 2], mul(m, at(0.25 + (i % 3) * 0.06, 0.004 + i * 0.002, -0.1 + i * 0.05, 0, i * 0.7, 0)));
  } },
];
const ORDER_P = [0, 1, 2, 3, 4, 0, 5, 6, 7, 2];

/** the skip: yellow steel, sloped ends, ribs, lifting lugs, hazard plates, rust (built standing on y = 0, centred) */
export function skipModel(mats: FMats): THREE.Group {
  const b = new FacetBuilder(), W = SKIP_W + 0.1, D = SKIP_D + 0.08, H = SKIP_H;
  b.add('paint', cbox(W - 0.34, 0.05, D, 0.01), 0xc89018, at(0, 0.025, 0));
  b.add('rubber', cbox(W - 0.38, 0.01, D - 0.06, 0.002), 0x1a1810, at(0, 0.055, 0));
  for (const z of [-1, 1]) {
    b.add('paint', cbox(W, H, 0.035, 0.008), 0xd8a020, at(0, H / 2 + 0.03, z * (D / 2)), { rep: 0.3 });
    for (let i = 0; i < 5; i++) b.add('paint', cbox(0.05, H - 0.04, 0.03, 0.006), 0xb88818, at(-W / 2 + 0.2 + i * ((W - 0.4) / 4), H / 2 + 0.02, z * (D / 2 + 0.025)));
    b.add('paint', cbox(W + 0.02, 0.05, 0.06, 0.01), 0xc89018, at(0, H + 0.03, z * (D / 2 + 0.01)));
    for (let i = 0; i < 3; i++) b.add('rust', cbox(0.12 + i * 0.05, 0.08, 0.005, 0.002), 0x8a4a20, at(-0.4 + i * 0.35, 0.12 + i * 0.1, z * (D / 2 + 0.02)));
  }
  for (const x of [-1, 1]) {
    b.add('paint', cbox(0.035, H + 0.06, D, 0.008), 0xd8a020, at(x * (W / 2 - 0.08), H / 2 + 0.02, 0, 0, 0, x * 0.32));
    b.add('hazard', cbox(0.01, 0.16, D - 0.12, 0.002), 0xffffff, at(x * (W / 2 - 0.02), H * 0.6, 0, 0, 0, x * 0.32));
    for (const z of [-1, 1]) b.add('metal', prism(0.035, 0.06, 8), 0x3a3a34, at(x * (W / 2 - 0.1), H * 0.7, z * (D / 2 + 0.05), Math.PI / 2));
  }
  const g = b.build(mats);
  g.name = 'skip';
  return g;
}
/** where the k-th piece rides in the skip (skip-local) */
export function skipSlot(k: number, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(-SKIP_W / 2 + 0.25 + (k % 4) * ((SKIP_W - 0.5) / 3), 0.08 + Math.floor(k / 4) * 0.12, ((k * 37) % 3 - 1) * 0.06);
}

/** the derelict mess: on the floor (merged into the room, or loose pieces), or in the skip */
function debris(c: Ctx, id: RoomId, grid: Uint8Array, work: RoomWork | undefined, loose: boolean, out: DebrisPiece[]) {
  const N = debrisCount(id);
  let s = 7 + id.length * 131 + id.charCodeAt(0) * 17;
  const R = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
  const taken = new Uint8Array(GN * GN);
  const free = (x: number, z: number, r: number) => {
    for (let gz = Math.floor((z - r + HALF) / CELL); gz <= Math.floor((z + r + HALF) / CELL); gz++) for (let gx = Math.floor((x - r + HALF) / CELL); gx <= Math.floor((x + r + HALF) / CELL); gx++) {
      if (gx < 0 || gz < 0 || gx >= GN || gz >= GN || grid[gz * GN + gx] || taken[gz * GN + gx]) return false;
    }
    return true;
  };
  for (let n = 0; n < N; n++) {
    const P = PIECES[ORDER_P[n % ORDER_P.length]];
    const binned = !!work?.binned.includes(n);
    let x = 0, z = 0, ok = false;
    for (let k = 0; k < 60 && !ok; k++) { x = (R() - 0.5) * (HALF * 2 - 2 * P.r - 0.1); z = (R() - 0.5) * (HALF * 2 - 2 * P.r - 0.1); ok = free(x, z, P.r * 0.8); }
    if (ok) for (let gz = Math.floor((z - P.r + HALF) / CELL); gz <= Math.floor((z + P.r + HALF) / CELL); gz++) for (let gx = Math.floor((x - P.r + HALF) / CELL); gx <= Math.floor((x + P.r + HALF) / CELL); gx++) if (gx >= 0 && gz >= 0 && gx < GN && gz < GN) taken[gz * GN + gx] = 1;
    const ry = R() * Math.PI * 2;
    const home = new THREE.Vector3(x, 0, z);
    let pos = home, rot = ry;
    if (binned) { const k = work!.binned.indexOf(n); pos = skipSlot(k).add(SKIP_AT); rot = k * 1.3; }
    if (loose) {
      const pb = new FacetBuilder();
      P.make(pb, new THREE.Matrix4(), R);
      const o = new THREE.Group();
      o.add(pb.build(c.mats));
      o.position.copy(pos); o.rotation.y = rot; o.name = 'debris:' + n; o.userData.debris = n;
      c.g.add(o);
      out.push({ n, o, kind: P.kind, r: P.r, heavy: P.heavy, home, binned });
    } else P.make(c.b, at(pos.x, pos.y, pos.z, 0, rot, 0), R);
  }
}

/** what the room's own fixtures stand on: floor cells under anything from ankle to chest height; wall cells behind
 *  anything on (or against) the two standing walls at picture height */
function occupancy(g: THREE.Object3D): { grid: Uint8Array; wall: Uint8Array } {
  const grid = new Uint8Array(GN * GN), wall = new Uint8Array(GN * 2);
  g.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  const cellR = (a: number, b: number) => [Math.max(0, Math.floor((a + HALF) / CELL)), Math.min(GN - 1, Math.floor((b + HALF) / CELL))];
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.userData.noGlow || m.userData.furniture) return;
    const p = m.geometry.attributes.position as THREE.BufferAttribute | undefined;
    if (!p) return;
    const idx = m.geometry.index;
    const n = idx ? idx.count : p.count;
    for (let i = 0; i + 2 < n; i += 3) {
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9;
      for (let k = 0; k < 3; k++) {
        v.fromBufferAttribute(p, idx ? idx.getX(i + k) : i + k).applyMatrix4(m.matrixWorld);
        x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); z0 = Math.min(z0, v.z); z1 = Math.max(z1, v.z);
      }
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      if (Math.abs(cx) > HALF - 0.03 || Math.abs(cz) > HALF - 0.03) continue;
      if (y1 > 0.12 && y0 < 1.2) {
        const [gx0, gx1] = cellR(x0 + 0.04, x1 - 0.04), [gz0, gz1] = cellR(z0 + 0.04, z1 - 0.04);
        for (let gz = gz0; gz <= gz1; gz++) for (let gx = gx0; gx <= gx1; gx++) grid[gz * GN + gx] = 1;
      }
      if (y0 < 2.2 && y1 > 1.05) {
        if (z1 < -HALF + 0.45) { const [a, b] = cellR(x0 + 0.03, x1 - 0.03); for (let k = a; k <= b; k++) wall[k] = 1; }
        if (x1 < -HALF + 0.45) { const [a, b] = cellR(z0 + 0.03, z1 - 0.03); for (let k = a; k <= b; k++) wall[GN + k] = 1; }
      }
    }
  });
  return { grid, wall };
}

/** part B: a furniture kind's model (room-local, standing on y = 0, facing +Z); unregistered kinds stand as a crate */
export const FURNITURE_MODELS = new Map<string, (mats: FMats) => THREE.Object3D>();
export function registerFurnitureModel(kind: string, make: (mats: FMats) => THREE.Object3D) { FURNITURE_MODELS.set(kind, make); }

export interface BuildOpts { finish?: RoomFinish; work?: RoomWork; loose?: boolean }
/** build one room's diorama (room-local: centre of the floor at the origin, the open sides toward +X and +Z) */
export function buildRoom(id: RoomId, cond: Condition, locked: boolean, mats: FMats, seed = 1, furniture: Furniture[] = [], o: BuildOpts = {}): Diorama {
  let s = 1 + seed * 7919;
  const R = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
  const g = new THREE.Group();
  g.name = 'room:' + id;
  const x = extMats(mats);
  const c: Ctx = { b: new FacetBuilder(), g, R, on: !locked && cond >= 2, cond, ticks: [], mats, x, finish: o.finish, grime: [], gb: new FacetBuilder() };
  shell(c, id);
  const focus = ROOMS[id](c);
  condition(c, id, locked);
  // the room's own fixtures, before the debris and the furniture: what build mode cannot stand on
  const fixed = new THREE.Group();
  fixed.add(c.b.build(x as unknown as FMats));
  for (const ch of [...g.children]) if (!(ch as THREE.Mesh).userData?.noGlow) fixed.add(ch);
  g.add(fixed);
  const occ = occupancy(g);
  const pieces: DebrisPiece[] = [];
  let skip: THREE.Object3D | null = null;
  if (cond === 0) debris(c, id, occ.grid, o.work, !!o.loose, pieces);
  if (cond === 0 && o.work?.skip) { skip = skipModel(mats); skip.position.copy(SKIP_AT); g.add(skip); }
  for (const f of furniture) {
    const make = FURNITURE_MODELS.get(f.kind);
    let fo: THREE.Object3D;
    if (make) fo = make(mats);
    else { const fb = new FacetBuilder(); fb.add('wood', cbox(0.5, 0.4, 0.4, 0.02), 0xa88a5a, at(0, 0.2, 0)); fo = fb.build(mats); }
    fo.position.set(f.x, 0, f.z); fo.rotation.y = f.rot; fo.userData.furniture = f.uid;
    fo.traverse((q) => { q.userData.furniture = f.uid; });
    g.add(fo);
  }
  if (!c.b.empty) g.add(c.b.build(x as unknown as FMats));
  if (!c.gb.empty) { const gg = c.gb.build(mats); gg.name = 'grime'; g.add(gg); c.grime.push(gg); }
  // power: a warm room once restored (in its own light), a cold thin one before, a dead one while it is locked
  const color = cond >= 3 ? finishSpec(o.finish?.light)?.color ?? 0xffe2b8 : cond === 2 ? 0xf0f0e8 : cond === 1 ? 0xa8c0e0 : 0x6a8aa0;
  return {
    group: g, light: new THREE.Vector3(0, WALL_H - 0.35, -0.3), color, powered: c.on, focus,
    tick: (t, dt) => { for (const f of c.ticks) f(t, dt); },
    grid: occ.grid, wall: occ.wall, debris: pieces, skip, grime: c.grime,
  };
}
