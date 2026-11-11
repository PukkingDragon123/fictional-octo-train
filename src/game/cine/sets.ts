// Staged sets for the first-person cinematics (round 15, WORLD). Each is built in a
// local frame: the unit stands at the origin on the floor, +X is where it looks, +Y up.
// The caller turns the group to the unit's facing (rotation.y = -facing) and puts it
// at the unit's feet. Geometry is faceted low-poly from the intake kit's helpers
// (src/game/introKit/poly.ts) on the world's atlas textures, lit by BAKING the lamps
// into the vertex colours (bake()) and drawn self-lit (emitMat): no real lights, no
// shader recompiles, cheap on a software renderer. Lamp glass is its own mesh so it
// can flicker (its material's uK).
//
//   liftCab({ landing, half })   the Ostrander car: steel plate, tread floor, a scissor gate, sliding doors, a lamp, a floor indicator
//   stairShaft(up)               a concrete stair flight with rails, a caged bulb on the landing and a level stencil
//   duct(kind, open)             a sheet-metal crawl duct ('duct') or a wet concrete pipe ('pipe'); open = its mouth gives onto the level
//   membrane(col)                the wall gone liquid: a rippling, bulging gel sheet (its own shader)
//   darkDoor(w, h, tex)          a door slab on its hinge with pitch black behind it
import * as THREE from 'three';
import { ModelBuilder } from '../../gfx/modelBuilder';
import { face, cbox, rod, type V3 } from '../introKit/poly';
import { emitMat, type EmitMat } from '../introKit/stageMat';
import { atlas } from '../../gfx/atlas';
import { U } from '../../gfx/materials';

export interface Lamp { at: V3; col: number; k: number; r: number }

/** multiply the vertex colours by the light of these lamps (wrap-lit, soft falloff) */
export function bake(g: THREE.BufferGeometry, lamps: Lamp[], amb = 0.1, ambCol = 0xb8c0c8) {
  const pos = g.getAttribute('position'), nor = g.getAttribute('normal'), col = g.getAttribute('color');
  if (!pos || !nor || !col) return g;
  const A = new THREE.Color(ambCol), C = lamps.map((l) => new THREE.Color(l.col));
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i), nx = nor.getX(i), ny = nor.getY(i), nz = nor.getZ(i);
    let r = A.r * amb, gg = A.g * amb, b = A.b * amb;
    lamps.forEach((l, j) => {
      const lx = l.at[0] - px, ly = l.at[1] - py, lz = l.at[2] - pz;
      const d = Math.hypot(lx, ly, lz) || 1e-3;
      const ndl = Math.max(0, (nx * lx + ny * ly + nz * lz) / d) * 0.8 + 0.2;
      const f = (l.k * ndl) / (1 + (d / l.r) * (d / l.r) * 2.2);
      r += C[j].r * f; gg += C[j].g * f; b += C[j].b * f;
    });
    col.setXYZ(i, col.getX(i) * Math.min(1.6, r), col.getY(i) * Math.min(1.6, gg), col.getZ(i) * Math.min(1.6, b));
  }
  col.needsUpdate = true;
  return g;
}

const MAT = new Map<string, EmitMat>();
/** one shared self-lit material per tint (the sets' bodies) */
function bodyMat(): EmitMat {
  let m = MAT.get('body');
  if (!m) { m = emitMat(0xffffff, 1); (m as unknown as { userData: { shared: boolean } }).userData.shared = true; MAT.set('body', m); }
  return m;
}
function mesh(mb: ModelBuilder, lamps: Lamp[], amb?: number, ambCol?: number, mat?: THREE.Material): THREE.Mesh {
  const g = bake(mb.build(), lamps, amb, ambCol);
  return new THREE.Mesh(g, mat ?? bodyMat());
}
/** a glowing part with its own brightness */
function glow(mb: ModelBuilder, col: number, k: number): THREE.Mesh & { material: EmitMat } {
  return new THREE.Mesh(mb.build(), emitMat(col, k)) as THREE.Mesh & { material: EmitMat };
}

/** an axis-aligned quad facing `n` (inward walls) */
function quad(mb: ModelBuilder, a: V3, b: V3, c: V3, d: V3, tex: string, n: V3, o: { shade?: number; color?: number; uvScale?: number; fit?: boolean } = {}) {
  face(mb, [a, b, c, d], tex, o, n, true);
}
/** the inside of a box: floor, ceiling and the four walls, each facing in */
function room(mb: ModelBuilder, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, t: { floor: string; ceil: string; wall: string; back?: string; front?: string }, skip: ('x0' | 'x1' | 'z0' | 'z1' | 'y0' | 'y1')[] = []) {
  if (!skip.includes('y0')) quad(mb, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], t.floor, [0, 1, 0]);
  if (!skip.includes('y1')) quad(mb, [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], t.ceil, [0, -1, 0]);
  if (!skip.includes('x0')) quad(mb, [x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1], t.back ?? t.wall, [1, 0, 0]);
  if (!skip.includes('x1')) quad(mb, [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], t.front ?? t.wall, [-1, 0, 0]);
  if (!skip.includes('z0')) quad(mb, [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], t.wall, [0, 0, 1]);
  if (!skip.includes('z1')) quad(mb, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], t.wall, [0, 0, -1]);
}

// ================================================================== the cargo lift's car
export interface LiftCab {
  group: THREE.Group;
  /** 0 shut .. 1 open */
  doors(k: number): void;
  /** 0 drawn back .. 1 across the doorway */
  gate(k: number): void;
  /** the car's lamp brightness (flicker it) */
  lamp(k: number): void;
  /** light floor i of the indicator (-1 none) */
  floor(i: number): void;
}
export function liftCab(o: { landing?: boolean; half?: number } = {}): LiftCab {
  const H = o.half ?? 0.95, X0 = -1.0, X1 = 1.0, Y1 = 2.5, DW = Math.min(0.55, H - 0.2), DH = 2.15;
  const group = new THREE.Group();
  const lamp: Lamp = { at: [0, 2.32, 0], col: 0xffe2b0, k: 1.15, r: 2.0 };
  const lamps: Lamp[] = [lamp, { at: [0.9, 2.3, 0], col: 0xffb070, k: 0.25, r: 1.2 }];
  const mb = new ModelBuilder();
  // the car: tread floor with a hazard lip at the doors, riveted plate walls, a grate ceiling
  quad(mb, [X0, 0, -H], [X1, 0, -H], [X1, 0, H], [X0, 0, H], 'ix_tread', [0, 1, 0]);
  quad(mb, [X1 - 0.16, 0.005, -H], [X1, 0.005, -H], [X1, 0.005, H], [X1 - 0.16, 0.005, H], 'ix_haz', [0, 1, 0]);
  quad(mb, [X0, Y1, -H], [X1, Y1, -H], [X1, Y1, H], [X0, Y1, H], 'ix_grate', [0, -1, 0], { shade: 0.7 });
  quad(mb, [X0, 0, -H], [X0, Y1, -H], [X0, Y1, H], [X0, 0, H], 'zf_lift_plate', [1, 0, 0]);
  for (const s of [-1, 1]) quad(mb, [X0, 0, s * H], [X1, 0, s * H], [X1, Y1, s * H], [X0, Y1, s * H], 'zf_lift_plate', [0, 0, -s]);
  // the front wall round the doorway, the jambs in hazard paint, the header
  for (const s of [-1, 1]) quad(mb, [X1, 0, s * DW], [X1, Y1, s * DW], [X1, Y1, s * H], [X1, 0, s * H], 'ix_steel', [-1, 0, 0]);
  quad(mb, [X1, DH, -DW], [X1, Y1, -DW], [X1, Y1, DW], [X1, DH, DW], 'ix_steel', [-1, 0, 0]);
  for (const s of [-1, 1]) { cbox(mb, X1 - 0.03, 0, s * (DW + 0.03), 0.08, DH, 0.07, 0.015, 'ix_steel'); cbox(mb, X1 - 0.075, 0.05, s * (DW + 0.03), 0.01, 1.0, 0.05, 0.004, 'plastic_yellow'); }
  cbox(mb, X1 - 0.03, DH, 0, 0.08, 0.08, DW * 2 + 0.14, 0.015, 'ix_steel');
  // a handrail round three walls, kick plates
  rod(mb, [X0 + 0.06, 0.95, -H + 0.08], [X0 + 0.06, 0.95, H - 0.08], 0.022, 6, 'ix_steel');
  for (const s of [-1, 1]) rod(mb, [X0 + 0.06, 0.95, s * (H - 0.06)], [X1 - 0.25, 0.95, s * (H - 0.06)], 0.022, 6, 'ix_steel');
  for (const s of [-1, 1]) cbox(mb, 0, 0, s * (H - 0.02), 2.0, 0.22, 0.03, 0.005, 'metal_dark');
  // the lamp housing, its cage, a ventilation fan box
  cbox(mb, 0, 2.36, 0, 0.56, 0.12, 0.34, 0.03, 'metal_dark');
  for (let i = 0; i < 5; i++) rod(mb, [-0.26 + i * 0.13, 2.36, -0.17], [-0.26 + i * 0.13, 2.36, 0.17], 0.008, 4, 'ix_steel');
  cbox(mb, -0.65, 2.4, 0.5, 0.36, 0.1, 0.36, 0.02, 'ix_grate');
  // the control panel by the doors: a green steel box, a call column, a brass key, the lever
  const cz = H - 0.03;
  cbox(mb, X1 - 0.38, 0.95, cz, 0.3, 0.62, 0.05, 0.012, 'metal_painted_green');
  cbox(mb, X1 - 0.38, 1.18, cz - 0.03, 0.04, 0.24, 0.02, 0.004, 'metal_dark');
  rod(mb, [X1 - 0.3, 1.0, cz - 0.03], [X1 - 0.3, 1.18, cz - 0.16], 0.014, 5, 'metal_grey');
  cbox(mb, X1 - 0.3, 1.18, cz - 0.17, 0.05, 0.05, 0.05, 0.01, 'plastic_black');
  // stencils of wear: grime boxes along the floor edge
  const body = mesh(mb, lamps, 0.12);
  group.add(body);
  // the lamp's glass and the panel's lit buttons
  const gl = new ModelBuilder();
  cbox(gl, 0, 2.33, 0, 0.46, 0.03, 0.26, 0.01, 'ix_diffuser');
  const glass = glow(gl, 0xfff0d0, 1.6);
  group.add(glass);
  const bl = new ModelBuilder();
  for (let i = 0; i < 3; i++) cbox(bl, X1 - 0.44, 1.05 + i * 0.12, cz - 0.03, 0.05, 0.05, 0.02, 0.008, 'plastic_red');
  group.add(glow(bl, 0xffb070, 1.2));
  // the floor indicator over the doorway: five lamps, one lit
  const ind: (THREE.Mesh & { material: EmitMat })[] = [];
  for (let i = 0; i < 5; i++) {
    const ib = new ModelBuilder();
    cbox(ib, X1 - 0.05, 2.28, -0.24 + i * 0.12, 0.03, 0.07, 0.08, 0.01, 'plastic_yellow');
    const m = glow(ib, 0xffc060, 0.15); ind.push(m); group.add(m);
  }
  // the doors (outside the front wall: they slide behind it) and the scissor gate (inside)
  const doors: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const db = new ModelBuilder();
    cbox(db, 0, 0, 0, 0.05, DH - 0.02, DW, 0.01, { all: 'q_elev_doors' }, { fit: true } as never);
    const m = mesh(db, lamps.map((l) => ({ ...l, at: [l.at[0] - X1 - 0.05, l.at[1], l.at[2]] as V3 })), 0.12);
    m.position.set(X1 + 0.05, 0.01, s * DW * 0.5);
    m.userData.s = s;
    doors.push(m); group.add(m);
  }
  const gate = new THREE.Group();
  {
    // a collapsible gate: flat uprights, and between each pair the lattice of crossed straps in three bays
    const gb = new ModelBuilder();
    const n = 7, bays = 3, y0 = 0.08, y1 = DH - 0.12, bh = (y1 - y0) / bays;
    for (let i = 0; i <= n; i++) cbox(gb, 0, y0, -(i / n) * DW * 2, 0.025, y1 - y0, 0.022, 0.004, 'ix_steel');
    for (let i = 0; i < n; i++) {
      const z0 = -(i / n) * DW * 2, z1 = -((i + 1) / n) * DW * 2;
      for (let b = 0; b < bays; b++) {
        const ya = y0 + b * bh, yb = ya + bh;
        rod(gb, [0.012, ya, z0], [0.012, yb, z1], 0.008, 4, 'metal_grey');
        rod(gb, [0.012, ya, z1], [0.012, yb, z0], 0.008, 4, 'metal_grey');
      }
    }
    cbox(gb, 0, y0 - 0.04, -DW, 0.04, 0.04, DW * 2, 0.008, 'ix_steel');
    cbox(gb, 0, y1, -DW, 0.04, 0.05, DW * 2, 0.008, 'ix_steel');
    const gm = mesh(gb, lamps.map((l) => ({ ...l, at: [l.at[0] - (X1 - 0.18), l.at[1], l.at[2] - DW] as V3 })), 0.12);
    gate.add(gm);
    gate.position.set(X1 - 0.18, 0, DW);
    group.add(gate);
  }
  // the landing outside (departures): a yellow corridor of the level the car is leaving
  if (o.landing) {
    const lb = new ModelBuilder();
    room(lb, X1 + 0.06, X1 + 3.4, 0, 2.6, -1.3, 1.3, { floor: 'carpet_yellow', ceil: 'ceil_tile', wall: 'wall_yellow' }, ['x0']);
    for (const s of [-1, 1]) quad(lb, [X1 + 0.06, 0, s * DW], [X1 + 0.06, 2.6, s * DW], [X1 + 0.06, 2.6, s * 1.3], [X1 + 0.06, 0, s * 1.3], 'wall_yellow', [1, 0, 0]);
    const land = mesh(lb, [{ at: [X1 + 2.0, 2.5, 0], col: 0xfff2c0, k: 1.3, r: 2.6 }], 0.15, 0xd8c890);
    group.add(land);
    const tb = new ModelBuilder();
    quad(tb, [X1 + 1.6, 2.59, -0.3], [X1 + 2.4, 2.59, -0.3], [X1 + 2.4, 2.59, 0.3], [X1 + 1.6, 2.59, 0.3], 'ceil_troffer', [0, -1, 0]);
    group.add(glow(tb, 0xfff6d8, 1.4));
  }
  const api: LiftCab = {
    group,
    doors(k) { for (const d of doors) d.position.z = (d.userData.s as number) * (DW * 0.5 + k * DW * 1.02); },
    gate(k) { gate.scale.z = Math.max(0.06, k); },
    lamp(k) { glass.material.uniforms.uK.value = 1.6 * k; (body.material as EmitMat).uniforms.uK.value = 0.25 + 0.75 * k; },
    floor(i) { ind.forEach((m, j) => { m.material.uniforms.uK.value = j === i ? 1.8 : 0.15; }); },
  };
  api.doors(1); api.gate(0); api.floor(-1);
  return api;
}

// ================================================================== the stair shaft
export interface Shaft { group: THREE.Group; run: number; drop: number; bulb(k: number): void }
export function stairShaft(up = false): Shaft {
  const group = new THREE.Group();
  const n = 12, rise = 0.17 * (up ? 1 : -1), run = 0.28, W = 0.68, x0 = 0.45;
  const xEnd = x0 + n * run, yEnd = n * rise;
  const yLow = Math.min(0, yEnd) - 2.6, yHigh = Math.max(0, yEnd) + 2.7;
  const bulbAt: V3 = [xEnd + 0.9, yEnd + 2.0, W - 0.22];
  const lamps: Lamp[] = [{ at: bulbAt, col: 0xffd9a0, k: 1.35, r: 2.8 }, { at: [-0.5, 2.5, 0], col: 0xd0d8e0, k: 0.45, r: 2.2 }];
  const mb = new ModelBuilder();
  // landings
  quad(mb, [-1.2, 0, -W], [x0, 0, -W], [x0, 0, W], [-1.2, 0, W], 'concrete', [0, 1, 0]);
  quad(mb, [xEnd, yEnd, -W], [xEnd + 1.7, yEnd, -W], [xEnd + 1.7, yEnd, W], [xEnd, yEnd, W], 'concrete', [0, 1, 0]);
  // treads and risers (painted nosings)
  for (let i = 0; i < n; i++) {
    const xa = x0 + i * run, xb = xa + run, ya = i * rise, yb = (i + 1) * rise;
    const ty = up ? yb : yb;
    quad(mb, [xa, ty, -W], [xb, ty, -W], [xb, ty, W], [xa, ty, W], 'concrete', [0, 1, 0]);
    quad(mb, [xa, ya, -W], [xa, yb, -W], [xa, yb, W], [xa, ya, W], 'concrete_b', [up ? -1 : 1, 0, 0], { shade: 0.8 });
    quad(mb, [xa, ty + 0.004, -W], [xa + 0.05, ty + 0.004, -W], [xa + 0.05, ty + 0.004, W], [xa, ty + 0.004, W], 'plastic_yellow', [0, 1, 0], { shade: 0.9 });
  }
  // walls, the end wall, the ceiling, the back wall
  for (const s of [-1, 1]) quad(mb, [-1.2, yLow, s * W], [xEnd + 1.7, yLow, s * W], [xEnd + 1.7, yHigh, s * W], [-1.2, yHigh, s * W], 'concrete', [0, 0, -s]);
  quad(mb, [xEnd + 1.7, yLow, -W], [xEnd + 1.7, yHigh, -W], [xEnd + 1.7, yHigh, W], [xEnd + 1.7, yLow, W], 'concrete', [-1, 0, 0]);
  quad(mb, [-1.2, yLow, -W], [-1.2, yHigh, -W], [-1.2, yHigh, W], [-1.2, yLow, W], 'concrete', [1, 0, 0]);
  quad(mb, [-1.2, yHigh, -W], [xEnd + 1.7, yHigh, -W], [xEnd + 1.7, yHigh, W], [-1.2, yHigh, W], 'ceil_concrete', [0, -1, 0]);
  // the level stencil on the end wall, a painted band at waist height
  quad(mb, [xEnd + 1.69, yEnd + 0.9, -0.42], [xEnd + 1.69, yEnd + 1.7, -0.42], [xEnd + 1.69, yEnd + 1.7, 0.42], [xEnd + 1.69, yEnd + 0.9, 0.42], 'zg_lvl_?', [-1, 0, 0], { fit: true });
  // handrails on brackets, following the flight
  for (const s of [-1, 1]) {
    const z = s * (W - 0.07);
    rod(mb, [x0 - 0.2, 0.92, z], [xEnd + 0.1, yEnd + 0.92, z], 0.024, 6, 'metal_painted_green');
    for (let i = 0; i <= 3; i++) { const t = i / 3; const x = x0 + t * (xEnd - x0), y = t * yEnd; rod(mb, [x, y + 0.92, z], [x, y + 0.92, s * (W - 0.005)], 0.012, 4, 'metal_grey'); }
  }
  // a conduit and a pipe down the corner
  rod(mb, [-1.1, yHigh - 0.15, -W + 0.1], [xEnd + 1.6, yHigh - 0.15, -W + 0.1], 0.05, 6, 'metal_rusty');
  rod(mb, [xEnd + 1.55, yLow, W - 0.12], [xEnd + 1.55, yHigh, W - 0.12], 0.035, 6, 'metal_grey');
  // the caged bulb's fitting
  cbox(mb, bulbAt[0], bulbAt[1] + 0.06, bulbAt[2] + 0.1, 0.16, 0.12, 0.08, 0.02, 'metal_dark');
  group.add(mesh(mb, lamps, 0.06, 0x8890a0));
  const gb = new ModelBuilder();
  cbox(gb, bulbAt[0], bulbAt[1] - 0.06, bulbAt[2], 0.09, 0.12, 0.09, 0.03, 'plastic_white');
  const bulb = glow(gb, 0xffe0a8, 2.0);
  group.add(bulb);
  return { group, run: xEnd - x0 + 0.5, drop: yEnd, bulb(k) { bulb.material.uniforms.uK.value = 2.0 * k; } };
}

// ================================================================== the crawl duct / the pipe
export interface Duct { group: THREE.Group; light(k: number): void; len: number }
export function duct(kind: 'duct' | 'pipe', open: boolean): Duct {
  const group = new THREE.Group();
  const W = kind === 'pipe' ? 0.58 : 0.46, H = kind === 'pipe' ? 1.1 : 0.92;
  const x0 = -2.2, x1 = open ? 0.35 : 6.5;
  const lamps: Lamp[] = open ? [{ at: [1.2, 1.2, 0], col: 0xfff0d0, k: 1.1, r: 2.2 }] : [{ at: [3.4, 0.5, W - 0.05], col: kind === 'pipe' ? 0x9ad0c0 : 0xffd090, k: 0.9, r: 1.4 }, { at: [-0.4, 0.6, 0], col: 0xc8c0b0, k: 0.35, r: 1.2 }];
  const mb = new ModelBuilder();
  if (kind === 'duct') {
    room(mb, x0, x1, 0, H, -W, W, { floor: 'metal_sheet', ceil: 'metal_sheet', wall: 'metal_sheet' }, open ? ['x1'] : []);
    // seams and rivet bands every 1.2 m, a side grille with light behind it
    for (let x = x0 + 0.4; x < x1; x += 1.2) {
      for (const s of [-1, 1]) cbox(mb, x, 0, s * (W - 0.01), 0.05, H, 0.02, 0.005, 'metal_grey');
      cbox(mb, x, H - 0.02, 0, 0.05, 0.02, W * 2, 0.005, 'metal_grey');
      cbox(mb, x, 0, 0, 0.05, 0.02, W * 2, 0.005, 'metal_grey');
    }
    if (!open) quad(mb, [3.1, 0.25, W - 0.012], [3.7, 0.25, W - 0.012], [3.7, 0.7, W - 0.012], [3.1, 0.7, W - 0.012], 'ix_grate', [0, 0, -1]);
  } else {
    // an octagonal concrete pipe with a wet invert
    const R = 0.62, cy = 0.55, seg = 8;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2 + Math.PI / seg, a1 = ((i + 1) / seg) * Math.PI * 2 + Math.PI / seg;
      const p = (x: number, a: number): V3 => [x, cy + Math.sin(a) * R, Math.cos(a) * R];
      const am = (a0 + a1) / 2;
      quad(mb, p(x0, a0), p(x1, a0), p(x1, a1), p(x0, a1), Math.sin(am) < -0.6 ? 'concrete_wet' : 'concrete', [0, -Math.sin(am), -Math.cos(am)]);
    }
    for (let x = x0 + 0.5; x < x1; x += 1.5) for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      cbox(mb, x, cy + Math.sin(a) * (R - 0.03) - 0.02, Math.cos(a) * (R - 0.03), 0.06, 0.04, 0.2, 0.01, 'concrete_b');
    }
    quad(mb, [x0, 0.02, -0.25], [x1, 0.02, -0.25], [x1, 0.02, 0.25], [x0, 0.02, 0.25], 'concrete_wet', [0, 1, 0], { color: 0x8ab0a8 });
  }
  if (!open) quad(mb, [x0, 0, -W], [x0, H, -W], [x0, H, W], [x0, 0, W], kind === 'pipe' ? 'concrete' : 'metal_sheet', [1, 0, 0]);
  group.add(mesh(mb, lamps, 0.07, 0x9098a0));
  const gb = new ModelBuilder();
  if (!open && kind === 'duct') quad(gb, [3.15, 0.3, W - 0.02], [3.65, 0.3, W - 0.02], [3.65, 0.65, W - 0.02], [3.15, 0.65, W - 0.02], 'ceil_troffer', [0, 0, -1]);
  else if (!open) cbox(gb, 3.4, 1.05, 0, 0.12, 0.05, 0.12, 0.02, 'plastic_white');
  const lit = gb.vertexCount ? glow(gb, kind === 'pipe' ? 0xa8f0d8 : 0xffd8a0, 1.4) : null;
  if (lit) group.add(lit);
  return { group, len: x1, light(k) { if (lit) lit.material.uniforms.uK.value = 1.4 * k; (group.children[0] as THREE.Mesh & { material: EmitMat }).material.uniforms.uK.value = 0.2 + 0.8 * k; } };
}

// ================================================================== the wall gone liquid
const MEM_VERT = /* glsl */`
uniform float uTime; uniform float uTouch; uniform float uSwell;
varying vec3 vWp; varying vec2 vUv; varying float vD; varying vec3 vN;
float disp(vec2 c) {
  float r = length(c);
  float d = uTouch * 0.95 * exp(-r * r / (0.35 + uSwell * 1.6));
  d += 0.04 * sin(r * 12.0 - uTime * 5.5) * exp(-r * 0.55) * (0.45 + uTouch);
  d += 0.022 * sin(c.x * 3.1 + uTime * 1.3) * sin(c.y * 2.3 - uTime * 1.05);
  d += 0.012 * sin(c.x * 7.3 - uTime * 2.1 + c.y * 4.0);
  d += uSwell * 0.5 * (1.0 - smoothstep(0.0, 2.6, r));
  return d;
}
void main() {
  vUv = uv;
  vec2 c = (uv - 0.5) * vec2(4.2, 3.4);
  float e = 0.02;
  float d = disp(c), du = disp(c + vec2(e, 0.0)), dv = disp(c + vec2(0.0, e));
  // the plane was turned to face -X: u runs along +Z, v along +Y
  vec3 Pu = vec3(0.0, 0.0, 1.0) * e + normal * (du - d), Pv = vec3(0.0, 1.0, 0.0) * e + normal * (dv - d);
  vec3 n = normalize(cross(Pu, Pv));
  if (dot(n, normal) < 0.0) n = -n;
  vN = normalize(mat3(modelMatrix) * n);
  vD = d;
  vec4 wp = modelMatrix * vec4(position + normal * d, 1.0);
  vWp = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const MEM_FRAG = /* glsl */`
layout(location = 1) out highp vec4 gNormal;
uniform float uTime; uniform float uK; uniform vec3 uCol; uniform float uA;
uniform sampler2D tAtlas; uniform float uAtlasSize; uniform vec4 uRect; uniform vec2 uRep; uniform float uWall;
varying vec3 vWp; varying vec2 vUv; varying float vD; varying vec3 vN;
vec3 wallTex(vec2 w) {
  vec2 texPx = max(uRect.zw * uAtlasSize, vec2(1.0));
  vec2 f = fract(w);
  f = (floor(f * texPx) + 0.5) / texPx;
  return texture2D(tAtlas, uRect.xy + vec2(f.x, 1.0 - f.y) * uRect.zw).rgb;
}
void main() {
  vec3 n = normalize(vN);
  vec3 v = normalize(cameraPosition - vWp);
  if (dot(n, v) < 0.0) n = -n;
  vec3 l = normalize(vec3(-0.35, 0.8, 0.45)), l2 = normalize(vec3(0.5, 0.2, -0.6));
  float fres = pow(1.0 - max(0.0, dot(n, v)), 2.5);
  float dif = max(0.0, dot(n, l)) * 0.6 + max(0.0, dot(n, l2)) * 0.25;
  float spec = pow(max(0.0, dot(reflect(-l, n), v)), 36.0) + 0.5 * pow(max(0.0, dot(reflect(-l2, n), v)), 18.0);
  vec2 q = vUv * vec2(9.0, 7.0);
  float caus = sin(q.x + sin(q.y * 1.3 + uTime * 0.9) * 1.6 + uTime * 0.6) * sin(q.y + sin(q.x * 1.1 - uTime * 0.7) * 1.4);
  caus = smoothstep(0.6, 1.0, caus);
  // the wall's own paper, dragged by the ripples (or the gel's colour in the open)
  vec2 w = vUv * uRep + n.zy * 0.12 * (0.4 + vD) + vec2(0.0, vD * 0.35);
  vec3 base = mix(uCol, wallTex(w), uWall);
  vec3 col = base * (0.45 + dif * 0.75 + vD * 0.45) + uCol * 0.4 * fres + vec3(0.85, 0.97, 1.0) * spec * 1.15 + vec3(0.5, 0.9, 1.0) * caus * 0.1;
  col *= uK;
  float edge = smoothstep(0.0, 0.1, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)));
  gl_FragColor = vec4(col, uA * edge);
  gNormal = vec4(n * 0.5 + 0.5, 1.0);
}`;
export interface Membrane { group: THREE.Group; mat: THREE.ShaderMaterial }
export function membrane(col: number, wallTexName?: string): Membrane {
  const A = atlas(), r = A.get(wallTexName || 'ix_caustic');
  const g = new THREE.PlaneGeometry(4.2, 3.4, 42, 34);
  g.rotateY(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uTouch: { value: 0 }, uSwell: { value: 0 }, uK: { value: 1 }, uCol: { value: new THREE.Color(col) }, uA: { value: 0 },
      tAtlas: { value: A.texture as THREE.Texture }, uAtlasSize: U.uAtlasSize, uRect: { value: new THREE.Vector4(r.u0, r.v0, r.du, r.dv) },
      uRep: { value: new THREE.Vector2(4.2 / Math.max(0.1, r.mw), 3.4 / Math.max(0.1, r.mh)) }, uWall: { value: wallTexName ? 1 : 0 },
    },
    vertexShader: MEM_VERT, fragmentShader: MEM_FRAG, transparent: true, side: THREE.DoubleSide, depthWrite: true,
  });
  const m = new THREE.Mesh(g, mat);
  m.position.set(0.78, 1.55, 0);
  m.renderOrder = 5;
  const group = new THREE.Group();
  group.add(m);
  return { group, mat };
}

// ================================================================== a door into the dark
export interface DarkDoor { group: THREE.Group; open(k: number): void }
export function darkDoor(w = 0.92, h = 2.08, tex = 'p_oak_door'): DarkDoor {
  const group = new THREE.Group();
  // the black: a box behind the doorway, its front face a hair in front of the level's own door
  const vb = new ModelBuilder();
  const X = -0.075;
  quad(vb, [X, 0, -w / 2], [X, h, -w / 2], [X, h, w / 2], [X, 0, w / 2], 'white', [-1, 0, 0]);
  room(vb, X, 2.5, -0.02, h + 0.02, -w / 2 - 0.02, w / 2 + 0.02, { floor: 'white', ceil: 'white', wall: 'white' }, ['x0']);
  const black = new THREE.Mesh(vb.build(), emitMat(0x000000, 0));
  group.add(black);
  // the slab on its hinge (it swings toward the unit)
  const hinge = new THREE.Group();
  hinge.position.set(X - 0.035, 0, -w / 2);
  const sb = new ModelBuilder();
  cbox(sb, 0, 0.01, w / 2, 0.045, h - 0.02, w, 0.008, { all: tex }, { fit: true } as never);
  cbox(sb, -0.04, 1.0, w - 0.08, 0.05, 0.03, 0.12, 0.01, 'metal_brass');
  const slab = mesh(sb, [{ at: [-1.6, 2.0, w / 2], col: 0xfff0d8, k: 0.9, r: 2.6 }], 0.3, 0xd0c8b8);
  hinge.add(slab);
  group.add(hinge);
  return { group, open(k) { hinge.rotation.y = k * 1.75; } };
}
