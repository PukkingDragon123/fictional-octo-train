// The machines of the press room, faceted low-poly:
//   the giant Remittance Press (front +z): a tread-plate bed on four chamfered
//     footings, octagonal columns with flanged feet and hazard collars, a
//     ribbed safety-yellow crown carrying two hydraulic cylinders, hoses down
//     its back, a pressure tank, a control cabinet with gauges, a mushroom stop
//     and the lever; the ram (ribbed, guide sleeves round the columns, a steel
//     die) and the piston rods are their own meshes;
//   the feed conveyor: C-channel rails, hexagonal rollers, legs and braces, a
//     rubber belt (its own mesh, its texture scrolls), a guard rail, the motor,
//     the wall hatch with its strip curtain; the junk riding it;
//   the band fitting rig: a pedestal with a padded cradle and two hinged clamp
//     jaws, a column and arm carrying the pneumatic bolt driver (it comes
//     down), hoses to a compressor, an amber lamp, a stamped plate;
//   the portal frame round the taped door-shaped section: two steel pylons
//     with copper emitter coils on ceramic insulators, a lintel with chevrons
//     and warning lamps, the threshold plate, cable bundles.
import * as THREE from 'three';
import { ModelBuilder } from '../../gfx/modelBuilder';
import { cbox, lathe, prism, rod, tube, face, lump, sag, mulberry, type V3, type V2 } from './poly';

/** giant press dimensions (metres, model space, front +z) */
export const GP = { bedH: 0.55, bedW: 4.2, bedD: 3.6, colX: 1.75, colZ: 1.4, crownY: 5.5, crownH: 1.1, ramUp: 4.25, ramDown: 0.66, ramH: 0.78, lever: [2.55, 1.15, 1.25] as V3, beacon: [-1.9, 6.6, 1.75] as V3 };

export function pressBody(mb: ModelBuilder, glow: ModelBuilder) {
  const { bedH, bedW, bedD, colX, colZ, crownY, crownH } = GP;
  // footings and the bed
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cbox(mb, sx * (bedW / 2 - 0.25), 0, sz * (bedD / 2 - 0.25), 0.7, 0.2, 0.7, 0.06, 'ix_steel');
  cbox(mb, 0, 0.12, 0, bedW, bedH - 0.12, bedD, 0.09, { top: 'ix_tread', all: 'ix_plate' });
  for (const s of [-1, 1]) {
    cbox(mb, 0, bedH, s * (bedD / 2 - 0.12), bedW - 0.1, 0.02, 0.2, 0.004, 'ix_haz');
    cbox(mb, s * (bedW / 2 - 0.12), bedH, 0, 0.2, 0.02, bedD - 0.5, 0.004, 'ix_haz');
  }
  cbox(mb, 0, bedH, 0, 2.9, 0.05, 2.3, 0.015, 'ix_steel', { color: 0x8a8a84 });
  face(glow, [[-1.1, bedH + 0.052, -0.04], [1.1, bedH + 0.052, -0.04], [1.1, bedH + 0.052, 0.04], [-1.1, bedH + 0.052, 0.04]], 'ix_halo', { color: 0xbfe8e0 });
  // columns
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * colX, z = sz * colZ;
    lathe(mb, x, bedH, z, [[0.38, 0], [0.38, 0.1], [0.27, 0.24], [0.24, 0.26], [0.24, crownY - bedH - 0.2], [0.3, crownY - bedH]], 8, 'ix_steel');
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.3; lathe(mb, x + Math.cos(a) * 0.32, bedH + 0.1, z + Math.sin(a) * 0.32, [[0.03, 0], [0.03, 0.04], [0.0, 0.05]], 6, 'chrome'); }
    lathe(mb, x, 2.4, z, [[0.27, 0], [0.27, 0.22]], 8, 'ix_haz');
  }
  // the crown: ribbed slab, cylinders on top, a stamped plate on the front
  cbox(mb, 0, crownY, 0, bedW + 0.2, crownH, bedD + 0.3, 0.14, 'ix_yellow');
  for (const s of [-1, 1]) for (let i = -2; i <= 2; i++) cbox(mb, i * 0.85, crownY - 0.25, s * (bedD / 2 + 0.2), 0.14, crownH + 0.25, 0.16, 0.03, 'ix_yellow', { color: 0xe0e0d8 });
  cbox(mb, 0, crownY - 0.3, 0, bedW + 0.1, 0.3, bedD + 0.1, 0.05, 'ix_plate');
  face(mb, [[-1.0, crownY + 0.25, bedD / 2 + 0.155], [1.0, crownY + 0.25, bedD / 2 + 0.155], [1.0, crownY + 0.75, bedD / 2 + 0.155], [-1.0, crownY + 0.75, bedD / 2 + 0.155]], 'ix_sign_clear', { fit: true });
  for (const sx of [-1, 1]) {
    const x = sx * 0.95;
    lathe(mb, x, crownY + crownH, 0, [[0.62, 0], [0.62, 0.12], [0.5, 0.16], [0.5, 1.15], [0.56, 1.2], [0.56, 1.32], [0.3, 1.38], [0.12, 1.42]], 10, 'ix_steel');
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; lathe(mb, x + Math.cos(a) * 0.57, crownY + crownH + 0.12, Math.sin(a) * 0.57, [[0.028, 0], [0.028, 0.05], [0, 0.06]], 5, 'chrome'); }
    // hoses off the back, down to the pump
    for (const k of [0, 1]) tube(mb, [[x + 0.3 + k * 0.08, crownY + crownH + 0.6, -0.45], [x + 0.4 + k * 0.08, crownY + crownH + 0.5, -1.2], [x + 0.5 + k * 0.08, crownY + 0.3, -2.25], [x + 0.55 + k * 0.08, 2.5, -2.3], [x + 0.6 + k * 0.08, 0.9, -2.15]], 0.045, 6, 'ix_hose', { caps: false });
  }
  // pump and pressure tank at the back
  cbox(mb, 0.6, 0, -2.35, 1.6, 0.9, 0.7, 0.06, 'ix_steel');
  lathe(mb.push().translate(-0.6, 1.2, -2.3).rotateZ(Math.PI / 2), 0, -0.7, 0, [[0.36, 0], [0.42, 0.1], [0.42, 1.3], [0.36, 1.4]], 10, 'ix_yellow');
  mb.pop();
  // control cabinet on the front-right with its gauges, stop button and the lever
  const [lx, ly, lz] = GP.lever;
  cbox(mb, lx - 0.1, 0, lz - 0.2, 0.55, 1.45, 0.5, 0.04, 'ix_steel');
  cbox(mb, lx - 0.1, 1.45, lz - 0.2, 0.62, 0.08, 0.56, 0.02, 'ix_plate');
  for (const [gx, gy] of [[-0.22, 1.15], [0.0, 1.15]]) {
    lathe(mb.push().translate(lx - 0.1 + gx, gy, lz + 0.06).rotateX(Math.PI / 2), 0, 0, 0, [[0.08, -0.03], [0.08, 0.0], [0.07, 0.02]], 10, 'metal_brass');
    mb.pop();
    face(glow, Array.from({ length: 8 }, (_, i) => { const a = i / 8 * Math.PI * 2 + Math.PI / 8; return [lx - 0.1 + gx + Math.cos(a) * 0.065, gy + Math.sin(a) * 0.065, lz + 0.085] as V3; }), 'zd_dial', { fit: true, color: 0xffe8c0 });
  }
  lathe(mb.push().translate(lx + 0.1, 0.8, lz + 0.05).rotateX(Math.PI / 2), 0, 0, 0, [[0.05, -0.02], [0.05, 0.02], [0.09, 0.04], [0.085, 0.08], [0.0, 0.1]], 8, 'plastic_red', { color: 0xe02a18 });
  mb.pop();
  lathe(mb, lx + 0.18, ly - 0.05, lz - 0.2, [[0.08, 0], [0.08, 0.1]], 8, 'ix_haz');
}
/** the ram: origin at the middle of its underside */
export function ramGeo(): THREE.BufferGeometry {
  const mb = new ModelBuilder();
  const { colX, colZ, ramH } = GP;
  cbox(mb, 0, 0.1, 0, 3.2, ramH - 0.1, 2.6, 0.1, 'ix_yellow');
  cbox(mb, 0, 0, 0, 3.0, 0.12, 2.4, 0.03, 'ix_steel', { color: 0x7a7a74 });
  // teeth: a row of chamfered ridges along the die
  for (let i = -5; i <= 5; i++) cbox(mb, i * 0.27, -0.04, 0, 0.1, 0.05, 2.3, 0.02, 'ix_steel', { color: 0x6a6a64 });
  cbox(mb, 0, ramH * 0.45, 1.31, 3.2, 0.2, 0.02, 0.004, 'ix_haz');
  cbox(mb, 0, ramH * 0.45, -1.31, 3.2, 0.2, 0.02, 0.004, 'ix_haz');
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    lathe(mb, sx * colX, 0.05, sz * colZ, [[0.34, 0], [0.34, ramH - 0.05]], 8, 'ix_steel');
    cbox(mb, sx * (colX - 0.25), 0.15, sz * (colZ - 0.2), 0.45, ramH - 0.25, 0.3, 0.04, 'ix_yellow', { color: 0xd0c8a0 });
  }
  for (const s of [-1, 1]) for (let i = -2; i <= 2; i++) cbox(mb, i * 0.7, ramH, s * 0.9, 0.12, 0.3, 0.12, 0.02, 'ix_yellow');
  for (const x of [-0.95, 0.95]) lathe(mb, x, ramH, 0, [[0.34, 0], [0.3, 0.14], [0.22, 0.2]], 8, 'ix_steel');
  return mb.build();
}
/** a piston rod one metre long (scaled to the gap) */
export function pistonGeo(): THREE.BufferGeometry {
  const mb = new ModelBuilder();
  lathe(mb, 0, 0, 0, [[0.19, 0], [0.19, 1]], 8, 'chrome', { caps: false });
  return mb.build();
}
/** the lever: pivot at the origin, the arm up +y */
export function leverGeo(): THREE.BufferGeometry {
  const mb = new ModelBuilder();
  rod(mb, [-0.06, 0, 0], [0.06, 0, 0], 0.05, 6, 'metal_dark');
  rod(mb, [0, 0, 0], [0, 0.55, 0], 0.022, 6, 'chrome', { r2: 0.018 });
  lathe(mb, 0, 0.5, 0, [[0.032, 0], [0.03, 0.15], [0.0, 0.16]], 6, 'rubber_black');
  lathe(mb, 0, 0.64, 0, [[0.0, 0], [0.05, 0.03], [0.055, 0.07], [0.035, 0.11], [0, 0.12]], 7, 'plastic_red', { color: 0xff3a24 });
  return mb.build();
}

/** the feed conveyor along z at x from z0 (far, the hatch) to z1 (the press); belt top at y */
export function conveyor(mb: ModelBuilder, belt: ModelBuilder, x: number, z0: number, z1: number, y = 0.76, hatchZ = z0) {
  const L = Math.abs(z1 - z0), zc = (z0 + z1) / 2, W = 1.0;
  mb.push().translate(x, 0, zc);
  // C-channel side rails
  for (const s of [-1, 1]) {
    const C: V2[] = s < 0 ? [[0, 0], [0.08, 0], [0.08, 0.02], [0.02, 0.02], [0.02, 0.18], [0.08, 0.18], [0.08, 0.2], [0, 0.2]] : [[0, 0], [-0.08, 0], [-0.08, 0.02], [-0.02, 0.02], [-0.02, 0.18], [-0.08, 0.18], [-0.08, 0.2], [0, 0.2]];
    mb.push().translate(s * W / 2, y - 0.17, 0);
    prism(mb, C, -L / 2, L / 2, 'ix_yellow', { b: 0 });
    mb.pop();
  }
  // rollers
  for (let z = -L / 2 + 0.2; z < L / 2; z += 0.36) rod(mb, [-W / 2 + 0.02, y - 0.06, z], [W / 2 - 0.02, y - 0.06, z], 0.045, 6, 'ix_roller');
  // legs, braces, feet
  for (let z = -L / 2 + 0.4; z < L / 2; z += 1.6) {
    for (const s of [-1, 1]) { cbox(mb, s * (W / 2 - 0.05), 0, z, 0.08, y - 0.17, 0.08, 0.012, 'ix_steel'); cbox(mb, s * (W / 2 - 0.05), 0, z, 0.18, 0.03, 0.14, 0.008, 'metal_dark'); }
    rod(mb, [-W / 2 + 0.05, 0.12, z], [W / 2 - 0.05, y - 0.25, z], 0.018, 4, 'ix_steel');
    rod(mb, [-W / 2 + 0.05, 0.25, z], [W / 2 - 0.05, 0.25, z], 0.018, 4, 'ix_steel');
  }
  // guard rail on the room side (+x)
  for (let z = -L / 2 + 0.3; z < L / 2; z += 1.6) rod(mb, [W / 2 + 0.12, y - 0.1, z], [W / 2 + 0.12, y + 0.45, z], 0.022, 6, 'ix_yellow');
  rod(mb, [W / 2 + 0.12, y + 0.45, -L / 2 + 0.3], [W / 2 + 0.12, y + 0.45, L / 2 - 0.2], 0.025, 6, 'ix_yellow');
  rod(mb, [W / 2 + 0.12, y + 0.2, -L / 2 + 0.3], [W / 2 + 0.12, y + 0.2, L / 2 - 0.2], 0.018, 6, 'ix_yellow');
  // the motor and gearbox at the far end
  cbox(mb, -W / 2 - 0.25, y - 0.45, -L / 2 + 0.3, 0.42, 0.36, 0.42, 0.04, 'ix_steel');
  lathe(mb.push().translate(-W / 2 - 0.25, y - 0.27, -L / 2 + 0.3).rotateZ(Math.PI / 2), 0, -0.45, 0, [[0.16, 0], [0.18, 0.04], [0.18, 0.3], [0.12, 0.36]], 8, 'ix_steel', { color: 0x5a6a5a });
  mb.pop();
  mb.pop();
  // the belt (top run and return run) as its own mesh: its uvs scroll
  belt.push().translate(x, 0, zc);
  face(belt, [[-W / 2 + 0.03, y, L / 2], [W / 2 - 0.03, y, L / 2], [W / 2 - 0.03, y, -L / 2], [-W / 2 + 0.03, y, -L / 2]], 'ix_belt');
  face(belt, [[-W / 2 + 0.03, y - 0.13, -L / 2], [W / 2 - 0.03, y - 0.13, -L / 2], [W / 2 - 0.03, y - 0.13, L / 2], [-W / 2 + 0.03, y - 0.13, L / 2]], 'ix_belt');
  belt.pop();
  // the hatch it comes out of: a steel frame, rubber strips
  const hz = hatchZ + 0.06;
  cbox(mb, x, y - 0.25, hz, 1.5, 0.12, 0.2, 0.02, 'ix_plate');
  cbox(mb, x, y + 1.0, hz, 1.5, 0.16, 0.2, 0.02, 'ix_plate');
  for (const s of [-1, 1]) cbox(mb, x + s * 0.7, y - 0.25, hz, 0.12, 1.4, 0.2, 0.02, 'ix_plate');
  for (let i = 0; i < 9; i++) cbox(mb, x - 0.56 + i * 0.14, y - 0.12, hz + 0.08, 0.12, 1.1, 0.012, 0.004, 'rubber_black', { color: 0x3a3632 });
  cbox(mb, x, y + 1.18, hz + 0.1, 1.2, 0.3, 0.02, 0.004, 'ix_haz');
}
/** junk for the belt: a crate, a sack, a TV, a chair */
export function junkGeo(kind: number): THREE.BufferGeometry {
  const mb = new ModelBuilder();
  const r = mulberry(31 + kind);
  if (kind === 0) {
    cbox(mb, 0, 0, 0, 0.6, 0.45, 0.5, 0.025, 'wood_dark', { color: 0xb08a5a });
    for (const s of [-1, 1]) cbox(mb, 0, 0.05, s * 0.255, 0.62, 0.08, 0.02, 0.006, 'wood_dark', { color: 0x8a6a40 });
  } else if (kind === 1) {
    lump(mb, 0, 0, 0, 0.32, 0.36, 41, 'fabric_grey', { color: 0x8a7a5a });
    lump(mb, 0.15, 0.25, 0.05, 0.18, 0.2, 42, 'fabric_grey', { color: 0x7a6a4a });
  } else if (kind === 2) {
    cbox(mb, 0, 0, 0, 0.55, 0.45, 0.45, 0.04, 'ix_enamel', { color: 0x6a5a48 });
    cbox(mb, 0, 0.06, 0.2, 0.42, 0.32, 0.06, 0.03, 'glass_dark');
    rod(mb, [0.1, 0.45, 0], [0.25, 0.7, -0.05], 0.006, 4, 'chrome');
    rod(mb, [-0.05, 0.45, 0], [-0.2, 0.68, 0.04], 0.006, 4, 'chrome');
  } else {
    cbox(mb, 0, 0.0, 0, 0.45, 0.06, 0.45, 0.015, 'wood_dark', { color: 0x9a7048 });
    cbox(mb, 0, 0.06, -0.2, 0.45, 0.42, 0.05, 0.015, 'wood_dark', { color: 0x9a7048 });
    for (const sx of [-1, 1]) rod(mb, [sx * 0.2, 0, 0.18], [sx * 0.24, -0.3, 0.25], 0.02, 4, 'wood_dark', { color: 0x8a6038 });
  }
  void r;
  return mb.build();
}

/**
 * The band fitting rig, local frame: origin on the floor under the cradle, the arm lies along x
 * (the debtor kneels toward +x). Returns the static body plus the moving parts: the two clamp jaws
 * (hinged along x, at the cradle's rims) and the driver head (it slides down y).
 */
export function bandRigGeo(cradleY = 0.64): { body: THREE.BufferGeometry; jawL: THREE.BufferGeometry; jawR: THREE.BufferGeometry; head: THREE.BufferGeometry; die: THREE.BufferGeometry; glow: THREE.BufferGeometry; jawY: number; headY: number } {
  const b = new ModelBuilder(), g = new ModelBuilder();
  // floor plate, pedestal, cradle
  cbox(b, -0.1, 0, 0, 0.9, 0.05, 0.6, 0.015, 'ix_tread');
  for (const [x, z] of [[-0.48, -0.25], [-0.48, 0.25], [0.3, -0.25], [0.3, 0.25]]) lathe(b, x, 0.05, z, [[0.025, 0], [0.018, 0.015]], 6, 'chrome');
  lathe(b, 0, 0.05, 0, [[0.14, 0], [0.12, 0.06], [0.07, 0.1], [0.07, cradleY - 0.14], [0.11, cradleY - 0.08]], 8, 'ix_yellow');
  b.push().translate(0, cradleY - 0.08, 0);
  prism(b.push().rotateY(Math.PI / 2), [[-0.1, 0], [0.1, 0], [0.1, 0.09], [0.07, 0.09], [0.06, 0.04], [-0.06, 0.04], [-0.07, 0.09], [-0.1, 0.09]] as V2[], -0.2, 0.2, 'ix_steel', { b: 0.008 });
  b.pop();
  prism(b.push().rotateY(Math.PI / 2), [[-0.06, 0.04], [0.06, 0.04], [0.055, 0.06], [-0.055, 0.06]] as V2[], -0.19, 0.19, 'rubber_black', { b: 0.004 });
  b.pop();
  b.pop();
  // the column (well back) and the high arm reaching over the cradle, the driver's cylinder hung from it
  cbox(b, -0.55, 0.05, 0, 0.16, 1.98, 0.18, 0.025, 'ix_yellow');
  for (const y of [0.5, 1.0, 1.5]) cbox(b, -0.55, y, 0, 0.19, 0.05, 0.21, 0.012, 'ix_haz');
  cbox(b, -0.31, 1.94, 0, 0.66, 0.13, 0.15, 0.025, 'ix_yellow');
  prism(b.push().translate(-0.47, 1.94, 0).rotateY(-Math.PI / 2), [[-0.0, 0], [0.0, -0.22], [0.16, 0]] as V2[], -0.03, 0.03, 'ix_yellow', { b: 0.004 });
  b.pop();
  face(b, [[-0.465, 0.6, -0.08], [-0.465, 0.6, 0.08], [-0.465, 1.1, 0.08], [-0.465, 1.1, -0.08]], 'ix_sign_fit', { fit: true });
  lathe(b, 0, 1.52, 0, [[0.075, 0], [0.075, 0.36], [0.09, 0.4], [0.09, 0.44]], 8, 'ix_steel');
  lathe(b, 0, 1.46, 0, [[0.05, 0], [0.06, 0.06]], 8, 'metal_dark');
  cbox(b, 0.1, 1.66, 0, 0.07, 0.14, 0.09, 0.012, 'ix_yellow');
  // hoses to a compressor on the floor
  cbox(b, -0.85, 0, 0.45, 0.45, 0.4, 0.32, 0.04, 'ix_steel');
  lathe(b.push().translate(-0.85, 0.55, 0.45).rotateZ(Math.PI / 2), 0, -0.25, 0, [[0.14, 0], [0.15, 0.05], [0.15, 0.45], [0.14, 0.5]], 8, 'ix_yellow');
  b.pop();
  tube(b, [[-0.7, 0.35, 0.4], [-0.62, 1.0, 0.25], [-0.45, 2.1, 0.12], [-0.1, 2.08, 0.06], [0.0, 1.98, 0.05]], 0.02, 5, 'ix_hose', { caps: false });
  tube(b, [[-0.75, 0.3, 0.38], [-0.5, 0.08, 0.2], [-0.2, 0.06, 0.1], [-0.1, 0.1, 0.05]], 0.016, 5, 'ix_cable', { caps: false });
  // the jaws: curved clamp shells hinged along x at the cradle rims (closed = rotated over the wrist)
  const jaw = (s: number) => {
    const m = new ModelBuilder();
    prism(m.push().rotateY(Math.PI / 2), [[0, 0], [s * 0.02, 0.0], [s * 0.025, 0.06], [s * 0.0, 0.1], [s * -0.035, 0.11], [s * -0.04, 0.095], [s * -0.005, 0.085], [s * 0.005, 0.055], [s * -0.005, 0.0]].map(([px, py]) => [px, py] as V2), -0.12, 0.12, 'ix_steel', { b: 0.005 });
    m.pop();
    for (const x of [-0.08, 0.08]) rod(m, [x, 0, 0], [x, 0, s * 0.03], 0.012, 6, 'chrome');
    return m.build();
  };
  // the driver: a chrome piston rod (one metre, scaled to its stroke) ending in the bolt die
  const h = new ModelBuilder(), d = new ModelBuilder();
  lathe(h, 0, -1, 0, [[0.02, 0], [0.02, 1]], 6, 'chrome', { caps: false });
  cbox(d, 0, -0.05, 0, 0.11, 0.05, 0.09, 0.012, 'metal_dark');
  lathe(d, 0, -0.09, 0, [[0.006, 0], [0.018, 0.04]], 6, 'chrome');
  lathe(g, 0.1, 1.8, 0, [[0.03, 0], [0.032, 0.03], [0, 0.05]], 6, 'ix_sodium', { color: 0xffffff });
  return { body: b.build(), jawL: jaw(1), jawR: jaw(-1), head: h.build(), die: d.build(), glow: g.build(), jawY: cradleY + 0.01, headY: 1.46 };
}

/**
 * The portal frame round the door-shaped section at (x, z) on a wall facing +z, opening w x h.
 * Coils and lamps go into `glow` (they pulse with the liquid).
 */
export function portalFrame(mb: ModelBuilder, glow: ModelBuilder, x: number, z: number, w: number, h: number) {
  mb.push().translate(x, 0, z);
  glow.push().translate(x, 0, z);
  const px = w / 2 + 0.28;
  for (const s of [-1, 1]) {
    const cx = s * px;
    cbox(mb, cx, 0, 0.2, 0.62, 0.16, 0.5, 0.03, 'ix_plate');
    cbox(mb, cx, 0.16, 0.12, 0.34, h + 0.5, 0.3, 0.04, 'ix_frame');
    for (let k = 0; k < 4; k++) cbox(mb, cx + s * 0.18, 0.5 + k * 0.62, 0.12, 0.04, 0.3, 0.2, 0.01, 'ix_steel');
    // the emitter: an insulated rod in front of the pylon, three copper coils, ceramic stacks at the ends
    const ex = cx - s * 0.02, ez = 0.36;
    lathe(mb, ex, 0.2, ez, [[0.035, 0], [0.035, h + 0.3]], 6, 'ix_steel');
    for (const [y0, dir] of [[0.22, 1], [h + 0.5, -1]] as [number, number][]) for (let d = 0; d < 4; d++) lathe(mb, ex, y0 + dir * d * 0.07, ez, [[0.07, 0], [0.07, 0.03 * dir], [0.05, 0.05 * dir]].map(([r, yy]) => [r, yy] as V2).sort((a, b2) => a[1] - b2[1]), 8, 'ix_enamel', { color: 0xe8e4d8 });
    for (let k = 0; k < 3; k++) lathe(glow, ex, 0.75 + k * 0.62, ez, [[0.06, 0], [0.085, 0.04], [0.085, 0.32], [0.06, 0.36]], 8, 'ix_coil', { color: 0xffffff });
    // cable bundles from the pylon top up into the dark
    for (let c = 0; c < 3; c++) tube(mb, [[cx + c * 0.05 - 0.05, h + 0.66, 0.1], [cx + c * 0.05 - 0.05 + s * 0.2, h + 1.2, 0.3], [cx + s * 0.6, h + 2.4, 0.2 + c * 0.1], [cx + s * 0.8, h + 4.5, 0.15]], 0.028, 5, 'ix_cable', { caps: false });
    tube(mb, sag([cx, 0.16, 0.35], [cx + s * 1.4, 0.03, 0.9], 0.02, 6), 0.03, 5, 'ix_cable', { caps: false });
  }
  // the lintel, chevrons, the ROOM 0 plate, two warning lamps
  cbox(mb, 0, h + 0.62, 0.12, w + 1.2, 0.42, 0.34, 0.05, 'ix_frame');
  face(mb, [[-w / 2 - 0.45, h + 0.66, 0.292], [w / 2 + 0.45, h + 0.66, 0.292], [w / 2 + 0.45, h + 0.82, 0.292], [-w / 2 - 0.45, h + 0.82, 0.292]], 'ix_haz');
  face(mb, [[-0.9, h + 1.12, 0.2], [0.9, h + 1.12, 0.2], [0.9, h + 1.55, 0.2], [-0.9, h + 1.55, 0.2]], 'ix_sign_room0', { fit: true });
  cbox(mb, 0, h + 1.06, 0.15, 1.9, 0.54, 0.06, 0.015, 'ix_steel');
  for (const s of [-1, 1]) {
    lathe(mb, s * (w / 2 + 0.4), h + 1.04, 0.15, [[0.08, 0], [0.08, 0.04]], 7, 'metal_dark');
    lathe(glow, s * (w / 2 + 0.4), h + 1.08, 0.15, [[0.065, 0], [0.065, 0.1], [0.04, 0.15], [0, 0.17]], 7, 'ix_sodium', { color: 0xffffff });
  }
  // the inner jamb lining and the threshold
  for (const s of [-1, 1]) cbox(mb, s * (w / 2 + 0.06), 0.0, 0.03, 0.1, h + 0.04, 0.06, 0.012, 'ix_haz');
  cbox(mb, 0, h, 0.03, w + 0.22, 0.1, 0.06, 0.012, 'ix_haz');
  mb.push().rotateY(-Math.PI / 2);
  prism(mb, [[0, 0], [0.7, 0], [0.04, 0.09], [0, 0.09]] as V2[], -w / 2 - 0.15, w / 2 + 0.15, 'ix_tread', { b: 0.01 });
  mb.pop();
  // a junction box on the wall
  cbox(mb, w / 2 + 1.25, 0.9, 0.08, 0.45, 0.6, 0.16, 0.03, 'ix_steel');
  rod(mb, [w / 2 + 1.25, 1.5, 0.1], [w / 2 + 1.25, 4.5, 0.1], 0.03, 6, 'ix_steel');
  glow.pop();
  mb.pop();
}
