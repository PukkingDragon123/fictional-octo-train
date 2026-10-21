// Parts for the subject room (room3d.ts): the concrete cell, the electric
// chair, the robot arms, the press, the gear, the voxel title, the floating
// signs' painted faces and the blood. All low-poly ModelBuilder geometry on
// the world atlas, or tiny canvases drawn once; nothing here runs per frame.
import * as THREE from 'three';
import { ModelBuilder } from '../../gfx/modelBuilder';

export const ROOM = { W: 3.4, BACK: -2.4, FRONT: 6, H: 3.6, HATCH_W: 1.3, HATCH_H: 2.3, SEAT_Y: 0.47, CHAIR_Z: -0.45, FLOAT_Z: 0.45, PLATE_Y: 0.07 };
export const NEON = { cyan: 0x7ff6ff, magenta: 0xff4fd8, amber: 0xffb43c, red: 0xff3a4a, green: 0x6dff8e, white: 0xe8f4ff };

const hz = (mb: ModelBuilder, x: number, y: number, z: number, w: number, h: number, d: number, n: number, axis: 'x' | 'z') => {
  // a hazard stripe: alternating yellow / black blocks
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n - 0.5;
    const c = i % 2 ? 0x17150f : 0xe8b52a;
    if (axis === 'x') mb.box(x + t * w, y, z, w / n + 0.001, h, d, 'plastic_white', { color: c });
    else mb.box(x, y, z + t * d, w, h, d / n + 0.001, 'plastic_white', { color: c });
  }
};

/** the cell: floor, walls round a hatch in the back wall, a low ceiling with the press housing, pipes, the die plate */
export function roomGeometry(): THREE.BufferGeometry {
  const { W, BACK, FRONT, H, HATCH_W, HATCH_H, FLOAT_Z, PLATE_Y } = ROOM;
  const mb = new ModelBuilder();
  const zc = (BACK + FRONT) / 2, D = FRONT - BACK;
  mb.box(0, -0.05, zc, W * 2, 0.05, D, { top: 'concrete_wet', all: 'concrete' }, { color: 0x8a8c84 });
  // back wall in four pieces round the hatch
  const hw = HATCH_W / 2;
  const wallTex = { south: 'p_tile_wall', all: 'concrete' };
  mb.box((-W - hw) / 2, 0, BACK - 0.1, W - hw, 1.3, 0.2, wallTex, { color: 0x7a8078 });
  mb.box((W + hw) / 2, 0, BACK - 0.1, W - hw, 1.3, 0.2, wallTex, { color: 0x7a8078 });
  mb.box((-W - hw) / 2, 1.3, BACK - 0.1, W - hw, H - 1.3, 0.2, { south: 'concrete_b', all: 'concrete' }, { color: 0x6a6c66 });
  mb.box((W + hw) / 2, 1.3, BACK - 0.1, W - hw, H - 1.3, 0.2, { south: 'concrete_b', all: 'concrete' }, { color: 0x6a6c66 });
  mb.box(0, HATCH_H, BACK - 0.1, HATCH_W, H - HATCH_H, 0.2, { south: 'concrete_b', all: 'concrete' }, { color: 0x6a6c66 });
  // hatch frame and its hazard lintel
  for (const k of [-1, 1]) mb.box(k * (hw + 0.06), 0, BACK + 0.02, 0.12, HATCH_H + 0.06, 0.08, 'metal_dark', { color: 0x4a4c48 });
  hz(mb, 0, HATCH_H + 0.02, BACK + 0.04, HATCH_W + 0.24, 0.1, 0.06, 12, 'x');
  // the tunnel behind the hatch (a dark throat)
  mb.box(0, 0, BACK - 1.6, HATCH_W + 0.2, 0.04, 3, 'grate', { color: 0x3a3c38 });
  for (const k of [-1, 1]) mb.box(k * (hw + 0.1), 0, BACK - 1.6, 0.04, HATCH_H + 0.2, 3, 'metal_dark', { color: 0x2a2c2a });
  mb.box(0, HATCH_H + 0.1, BACK - 1.6, HATCH_W + 0.2, 0.04, 3, 'metal_dark', { color: 0x222422 });
  mb.box(0, 0, BACK - 3.05, HATCH_W + 0.2, HATCH_H + 0.2, 0.05, 'metal_dark', { color: 0x1a1a1a });
  // side walls, skirting
  for (const k of [-1, 1]) {
    mb.box(k * (W + 0.1), 0, zc, 0.2, H, D, { east: 'concrete_b', west: 'concrete_b', all: 'concrete' }, { color: 0x6a6e68 });
    mb.box(k * (W - 0.01), 0, zc, 0.02, 0.14, D, 'metal_painted_green', { color: 0x30342c });
  }
  // ceiling with the press housing (a square well) and tube fixtures
  const pw = 1.5, pd = 1.2;
  mb.box((-W - pw / 2) / 2, H, zc, W - pw / 2, 0.1, D, 'metal_dark', { color: 0x3a3c3a });
  mb.box((W + pw / 2) / 2, H, zc, W - pw / 2, 0.1, D, 'metal_dark', { color: 0x3a3c3a });
  mb.box(0, H, (BACK + FLOAT_Z - pd / 2) / 2, pw, 0.1, FLOAT_Z - pd / 2 - BACK, 'metal_dark', { color: 0x3a3c3a });
  mb.box(0, H, (FLOAT_Z + pd / 2 + FRONT) / 2, pw, 0.1, FRONT - FLOAT_Z - pd / 2, 'metal_dark', { color: 0x3a3c3a });
  for (const k of [-1, 1]) { mb.box(k * (pw / 2 + 0.05), H - 0.25, FLOAT_Z, 0.1, 0.25, pd + 0.2, 'metal_rusty', { color: 0x6a5a4a }); mb.box(0, H - 0.25, FLOAT_Z + k * (pd / 2 + 0.05), pw, 0.25, 0.1, 'metal_rusty', { color: 0x6a5a4a }); }
  mb.box(0, H + 1.2, FLOAT_Z, pw, 0.05, pd, 'metal_dark', { color: 0x111111 });
  for (const k of [-1, 1]) mb.box(k * (pw / 2), H, FLOAT_Z, 0.02, 1.2, pd, 'metal_dark', { color: 0x161616 });
  // pipes and conduits
  for (const [x, z, r] of [[-W + 0.18, -1.0, 0.07], [-W + 0.32, -1.0, 0.04], [W - 0.2, 1.4, 0.06]] as const) {
    mb.cylinder(x, 0, z, r, H, 8, 'metal_rusty', { color: 0x7a6a5a });
  }
  mb.cylinderX(0, H - 0.18, BACK + 0.2, 0.06, W * 2, 8, 'metal_grey', { color: 0x5a5e60 });
  mb.cylinderX(0, H - 0.34, BACK + 0.14, 0.035, W * 2, 6, 'metal_rusty', { color: 0x6a5040 });
  // the breaker panel on the left wall, with a fat cable to the chair
  mb.box(-W + 0.06, 1.1, -1.3, 0.12, 0.7, 0.5, 'metal_painted_green', { color: 0x3a4a3a });
  mb.box(-W + 0.14, 1.35, -1.3, 0.05, 0.25, 0.08, 'metal_dark', {});
  mb.box(-W + 0.18, 1.55, -1.3, 0.08, 0.04, 0.04, 'plastic_red', { color: 0xa81a1a });
  hz(mb, -W + 0.125, 1.04, -1.3, 0.01, 0.04, 0.5, 8, 'z');
  // arm slots (dark mouths in the wall the arms come out of)
  for (const k of [-1, 1]) { mb.box(k * 1.75, 2.75, BACK + 0.005, 0.7, 0.7, 0.02, 'metal_dark', { color: 0x0a0a0a }); hz(mb, k * 1.75, 3.12, BACK + 0.02, 0.8, 0.05, 0.03, 8, 'x'); }
  mb.box(0, H - 0.01, -0.95, 0.6, 0.02, 0.6, 'metal_dark', { color: 0x0a0a0a });
  mb.box(0, H - 0.01, 1.75, 0.6, 0.02, 0.6, 'metal_dark', { color: 0x0a0a0a });
  // the press die: a steel plate on the floor with hazard edging and anchors for the ankle chains
  mb.box(0, 0, FLOAT_Z, 1.4, PLATE_Y, 1.1, { top: 'metal_brushed', all: 'metal_dark' }, { color: 0x8a8e90 });
  hz(mb, 0, PLATE_Y, FLOAT_Z + 0.58, 1.5, 0.012, 0.06, 14, 'x');
  hz(mb, 0, PLATE_Y, FLOAT_Z - 0.58, 1.5, 0.012, 0.06, 14, 'x');
  for (const k of [-1, 1]) mb.cylinder(k * 0.34, PLATE_Y, FLOAT_Z + 0.1, 0.035, 0.05, 6, 'metal_rusty', { color: 0x7a6050 });
  // drain grate, a bucket, a stained mop sink corner
  mb.box(1.6, 0.003, 1.6, 0.4, 0.006, 0.4, 'q_floor_grate', { fit: true });
  mb.cylinder(-2.4, 0, 1.2, 0.16, 0.34, 8, 'metal_grey', { color: 0x6a6e70, rTop: 0.19 });
  return mb.build();
}

/** the electric chair: oak, iron, leather straps, the electrode cap on its arm with a cable up into the dark */
export function chairGeometry(straps: boolean): THREE.BufferGeometry {
  const mb = new ModelBuilder();
  const { SEAT_Y, CHAIR_Z: z } = ROOM;
  const wood = { color: 0x5a3e2a };
  mb.box(0, 0, z, 1.05, 0.06, 0.95, 'rubber_black', { color: 0x2a2a2a });
  for (const [x, dz] of [[-0.27, -0.24], [0.27, -0.24], [-0.27, 0.24], [0.27, 0.24]]) mb.box(x, 0.06, z + dz, 0.09, SEAT_Y - 0.06, 0.09, 'wood_dark', wood);
  mb.box(0, SEAT_Y, z, 0.66, 0.08, 0.6, 'wood_dark', wood);
  mb.box(0, SEAT_Y + 0.08, z - 0.27, 0.66, 0.95, 0.09, 'wood_dark', wood);
  mb.box(0, SEAT_Y + 1.0, z - 0.27, 0.74, 0.08, 0.11, 'wood_dark', { color: 0x4a3222 });
  for (const k of [-1, 1]) {
    mb.box(k * 0.36, SEAT_Y + 0.08, z + 0.2, 0.07, 0.24, 0.07, 'wood_dark', wood);
    mb.box(k * 0.36, SEAT_Y + 0.3, z - 0.02, 0.12, 0.06, 0.58, 'wood_dark', { color: 0x4e3424 });
    mb.box(k * 0.4, 0.12, z + 0.26, 0.05, 0.06, 0.06, 'metal_rusty', { color: 0x7a6050 });
  }
  // iron bands
  mb.box(0, SEAT_Y + 0.55, z - 0.32, 0.7, 0.05, 0.02, 'metal_rusty', { color: 0x6a5242 });
  mb.box(0, SEAT_Y + 0.2, z - 0.32, 0.7, 0.05, 0.02, 'metal_rusty', { color: 0x6a5242 });
  if (straps) {
    for (const k of [-1, 1]) {
      mb.box(k * 0.36, SEAT_Y + 0.31, z + 0.14, 0.135, 0.075, 0.06, 'leather_black', { color: 0x2a2018 });
      mb.box(k * 0.12, 0.2, z + 0.22, 0.12, 0.05, 0.12, 'leather_black', { color: 0x2a2018 });
    }
    mb.box(0, SEAT_Y + 0.6, z - 0.2, 0.7, 0.07, 0.04, 'leather_black', { color: 0x2a2018 });
  }
  // the cap arm and the cap
  mb.box(0, SEAT_Y + 1.08, z - 0.27, 0.06, 0.1, 0.06, 'metal_dark', { color: 0x4a4a48 });
  mb.box(0, SEAT_Y + 1.14, z - 0.17, 0.05, 0.05, 0.22, 'metal_dark', { color: 0x4a4a48 });
  mb.box(0, SEAT_Y + 1.0, z - 0.06, 0.04, 0.16, 0.04, 'metal_dark', { color: 0x4a4a48 });
  mb.cylinder(0, SEAT_Y + 0.92, z - 0.06, 0.13, 0.08, 10, 'metal_brushed', { color: 0x8a8a84, rTop: 0.07 });
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; mb.box(Math.sin(a) * 0.11, SEAT_Y + 0.9, z - 0.06 + Math.cos(a) * 0.11, 0.02, 0.03, 0.02, 'metal_brass', { color: 0xc8a04a }); }
  // cable to the ceiling, and one along the floor to the breaker
  mb.cylinder(0, SEAT_Y + 1.16, z - 0.08, 0.022, ROOM.H - SEAT_Y - 1.16, 6, 'rubber_black', { color: 0x1a1a1a });
  mb.box(-1.7, 0.02, z - 0.3, 3.4, 0.04, 0.05, 'rubber_black', { color: 0x1a1a1a });
  return mb.build();
}

/** one robot-arm segment along +y (hinge at the origin): gunmetal box, a chrome piston, a red tell-tale */
export function armSegment(L: number, w: number): THREE.BufferGeometry {
  const mb = new ModelBuilder();
  mb.box(0, 0.04, 0, w, L - 0.08, w * 1.15, 'metal_dark', { color: 0x5a5e60 });
  mb.box(0, L * 0.2, w * 0.6, w * 0.7, L * 0.5, 0.012, 'metal_sheet', { color: 0x3a3c3e });
  mb.cylinder(w * 0.7, L * 0.12, 0, w * 0.18, L * 0.7, 6, 'chrome', { color: 0xb8c0c8 });
  mb.cylinderX(0, 0, 0, w * 0.62, w * 1.5, 8, 'metal_rusty', { color: 0x6a5242 });
  mb.box(0, L * 0.82, w * 0.6, 0.03, 0.03, 0.02, 'led_red', { color: 0xff2a2a, emissive: 2 });
  hz(mb, 0, L * 0.06, w * 0.59, w * 0.9, 0.05, 0.01, 6, 'x');
  return mb.build();
}
/** the wall / ceiling mount */
export function armBase(): THREE.BufferGeometry {
  const mb = new ModelBuilder();
  mb.box(0, -0.05, 0, 0.46, 0.1, 0.46, 'metal_dark', { color: 0x3a3c3e });
  mb.cylinder(0, 0.05, 0, 0.16, 0.18, 10, 'metal_rusty', { color: 0x6a5242 });
  for (const [x, z] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) mb.box(x, 0.0, z, 0.04, 0.04, 0.04, 'metal_brass', { color: 0x9a8040 });
  return mb.build();
}
/** claw palm (along +y) */
export function clawPalm(): THREE.BufferGeometry {
  const mb = new ModelBuilder();
  mb.cylinder(0, -0.02, 0, 0.075, 0.08, 8, 'metal_rusty', { color: 0x6a5242 });
  mb.box(0, 0.06, 0, 0.16, 0.08, 0.12, 'metal_dark', { color: 0x4a4e50 });
  mb.box(0, 0.1, 0.065, 0.025, 0.02, 0.01, 'led_red', { color: 0xff3a3a, emissive: 2 });
  return mb.build();
}
/** one claw finger (hinge at the origin, pointing +y) */
export function clawFinger(): THREE.BufferGeometry {
  const mb = new ModelBuilder();
  mb.box(0, 0, 0, 0.035, 0.13, 0.06, 'metal_dark', { color: 0x6a6e70 });
  mb.box(0, 0.12, 0.018, 0.03, 0.06, 0.035, 'metal_brushed', { color: 0x9a9ea0 });
  return mb.build();
}
/** the tool head: a palm with a drill and a lamp (the saw blade is a separate spinning mesh) */
export function toolHead(): THREE.BufferGeometry {
  const mb = new ModelBuilder();
  mb.cylinder(0, -0.02, 0, 0.07, 0.1, 8, 'metal_rusty', { color: 0x6a5242 });
  mb.box(0, 0.08, 0, 0.14, 0.12, 0.14, 'metal_dark', { color: 0x4a4e50 });
  mb.cylinder(0.05, 0.2, 0, 0.018, 0.12, 6, 'chrome', { color: 0xc8d0d8, rTop: 0.002 });
  mb.box(-0.05, 0.16, 0.05, 0.04, 0.04, 0.02, 'plastic_white', { color: 0xfff0d0, emissive: 2 });
  mb.box(0.075, 0.14, 0, 0.015, 0.12, 0.02, 'metal_brushed', { color: 0x9a9ea0 });
  return mb.build();
}
export function sawBlade(): THREE.BufferGeometry {
  const mb = new ModelBuilder();
  mb.cylinderZ(0, 0, 0, 0.1, 0.008, 12, { sides: 'chrome', all: 'metal_brushed' }, { color: 0xd0d4d8 });
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; mb.box(Math.cos(a) * 0.105, Math.sin(a) * 0.105 - 0.008, 0, 0.016, 0.016, 0.009, 'chrome', { color: 0xe8ecf0 }); }
  return mb.build();
}

/** the press head: a steel slab with a hazard skirt and two piston rods up into the ceiling well */
export function pressGeometry(): THREE.BufferGeometry {
  const mb = new ModelBuilder();
  mb.box(0, 0, 0, 1.3, 0.5, 1.0, { bottom: 'metal_rusty', all: 'metal_dark' }, { color: 0x5a5e60 });
  mb.box(0, 0.5, 0, 1.36, 0.08, 1.06, 'metal_rusty', { color: 0x6a5242 });
  hz(mb, 0, 0.06, 0.505, 1.3, 0.12, 0.012, 14, 'x');
  hz(mb, 0, 0.06, -0.505, 1.3, 0.12, 0.012, 14, 'x');
  hz(mb, 0.655, 0.06, 0, 0.012, 0.12, 1.0, 10, 'z');
  hz(mb, -0.655, 0.06, 0, 0.012, 0.12, 1.0, 10, 'z');
  for (const k of [-1, 1]) { mb.cylinder(k * 0.38, 0.58, 0, 0.09, 3.4, 10, 'chrome', { color: 0xb8c0c8 }); mb.cylinder(k * 0.38, 0.58, 0, 0.14, 0.2, 10, 'metal_dark', { color: 0x3a3c3e }); }
  for (let i = 0; i < 6; i++) mb.box(-0.5 + i * 0.2, 0.28, 0.506, 0.04, 0.04, 0.01, 'metal_brass', { color: 0x9a8040 });
  return mb.build();
}
/** the hatch shutter */
export function shutterGeometry(): THREE.BufferGeometry {
  const mb = new ModelBuilder();
  const { HATCH_W: w, HATCH_H: h } = ROOM;
  for (let i = 0; i < 9; i++) mb.box(0, i * (h / 9), 0, w, h / 9 - 0.012, 0.06, 'metal_sheet', { color: i % 2 ? 0x6a6e70 : 0x5a5e60 });
  hz(mb, 0, 0, 0.035, w, 0.14, 0.01, 10, 'x');
  return mb.build();
}

/** a cog with n teeth, extruded (the settings gear) */
export function gearGeometry(r: number, n: number, depth: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  const r0 = r * 0.8, r1 = r;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 0.25) / n) * Math.PI * 2, a2 = ((i + 0.5) / n) * Math.PI * 2, a3 = ((i + 0.75) / n) * Math.PI * 2;
    const p = (a: number, rr: number) => [Math.cos(a) * rr, Math.sin(a) * rr] as const;
    if (i === 0) s.moveTo(...p(a0, r0)); else s.lineTo(...p(a0, r0));
    s.lineTo(...p(a1, r1)); s.lineTo(...p(a2, r1)); s.lineTo(...p(a3, r0));
  }
  s.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, 0, r * 0.32, 0, Math.PI * 2, true);
  s.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: depth * 0.2, bevelSize: r * 0.03, bevelSegments: 1, curveSegments: 10 });
  g.translate(0, 0, -depth / 2);
  return g;
}

/** a floating object's body (handset, tape, card, keycap) */
export function propGeometry(kind: string): THREE.BufferGeometry {
  const mb = new ModelBuilder();
  if (kind === 'phone') {
    // an old handset: ear and mouth cups on a curved grip, with a coiled cord stub
    mb.box(0, -0.06, 0, 0.5, 0.1, 0.12, 'plastic_red', { color: 0xb83a2a, emissive: 0.35 });
    for (const k of [-1, 1]) { mb.box(k * 0.27, -0.12, 0, 0.14, 0.18, 0.15, 'plastic_red', { color: 0xa83224, emissive: 0.35 }); mb.cylinder(k * 0.27, -0.215, 0, 0.08, 0.04, 10, 'plastic_black', { color: 0x8a8a8a, emissive: 0.35 }); }
    for (let i = 0; i < 5; i++) mb.box(-0.27 + Math.sin(i * 1.3) * 0.02, -0.25 - i * 0.04, 0, 0.03, 0.03, 0.03, 'rubber_black', { color: 0x141414, emissive: 0.35 });
  } else if (kind === 'tape') {
    mb.box(0, -0.09, 0, 0.56, 0.18, 0.34, 'plastic_white', { color: 0x3a3a4a, emissive: 0.35 });
    mb.box(0, 0.0, 0.0, 0.4, 0.012, 0.2, 'paper', { color: 0xe8e0c8, emissive: 0.35 });
    for (const k of [-1, 1]) mb.cylinder(k * 0.12, 0.001, 0.04, 0.05, 0.012, 10, 'plastic_white', { color: 0x9a9a9a, emissive: 0.35 });
  } else if (kind === 'card') {
    mb.box(0, -0.2, 0, 0.36, 0.48, 0.02, 'plastic_white', { color: 0xe8e4d8, emissive: 0.35 });
    mb.box(0, -0.04, 0.012, 0.22, 0.22, 0.004, 'plastic_black', { color: 0x1a1a1a, emissive: 0.35 });
    mb.box(0, 0.2, 0, 0.06, 0.06, 0.03, 'metal_grey', { color: 0x9aa0a4, emissive: 0.35 });
  } else if (kind === 'key') {
    mb.box(0, -0.12, 0, 0.3, 0.12, 0.3, 'plastic_beige', { color: 0x3a3a40, emissive: 0.35 });
    mb.box(0, 0.0, 0, 0.24, 0.06, 0.24, 'plastic_beige', { color: 0x4a4a52, emissive: 0.35 });
  }
  return mb.build();
}

// ------------------------------------------------------------------ voxel title
const LETTERS: Record<string, string[]> = {
  N: ['#...#', '##..#', '#.#.#', '#.#.#', '#..##', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
};
/** one letter as voxels: glowing faces on a dark body (cell size c, centred on the origin) */
export function letterGeometry(ch: string, c: number, glow: number): THREE.BufferGeometry {
  const g = LETTERS[ch] || LETTERS.O;
  const mb = new ModelBuilder();
  for (let j = 0; j < 7; j++) for (let i = 0; i < 5; i++) {
    if (g[j][i] !== '#') continue;
    const x = (i - 2) * c, y = (3 - j) * c - c / 2;
    mb.box(x, y, -c * 0.4, c * 0.96, c * 0.96, c * 1.1, 'metal_dark', { color: 0x2a2e34 });
    mb.box(x, y + c * 0.08, c * 0.16, c * 0.8, c * 0.8, c * 0.05, 'plastic_white', { color: glow, emissive: 1.4 });
  }
  return mb.build();
}

// ------------------------------------------------------------------ painted faces
const css = (c: number, a = 1) => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;
/** snap canvas alpha to 0/255 and colours to their nearest hard edge (pixel-art text from a web font) */
function crisp(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const d = ctx.getImageData(0, 0, w, h);
  const p = d.data;
  for (let i = 0; i < p.length; i += 4) { if (p[i + 3] < 110) p[i + 3] = 0; else p[i + 3] = 255; }
  ctx.putImageData(d, 0, 0);
}
export function canvasTex(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/** a sign face: smoked glass, a neon border, the label in Silkscreen, a small line under it */
export function paintSign(cv: HTMLCanvasElement, label: string, sub: string, color: number, w: number, h: number) {
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(6,8,12,0.86)';
  ctx.fillRect(1, 1, w - 2, h - 2);
  // scan lines in the glass
  ctx.fillStyle = css(color, 0.06);
  for (let y = 2; y < h - 2; y += 2) ctx.fillRect(2, y, w - 4, 1);
  ctx.strokeStyle = css(color, 1); ctx.lineWidth = 1;
  ctx.strokeRect(1.5, 1.5, w - 3, h - 3);
  ctx.strokeStyle = css(color, 0.35);
  ctx.strokeRect(3.5, 3.5, w - 7, h - 7);
  // corner ticks
  ctx.fillStyle = css(color, 1);
  for (const [x, y] of [[0, 0], [w - 4, 0], [0, h - 4], [w - 4, h - 4]]) ctx.fillRect(x, y, 4, 4);
  const big = Math.max(8, Math.floor(h * (sub ? 0.36 : 0.48) / 8) * 8);
  ctx.font = `700 ${big}px Silkscreen, Tiny5, monospace`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  let size = big;
  while (ctx.measureText(label).width > w - 14 && size > 8) { size -= 8; ctx.font = `700 ${size}px Silkscreen, Tiny5, monospace`; }
  const ty = sub ? Math.round(h * 0.42) : Math.round(h / 2);
  ctx.fillStyle = css(0x000000, 1);
  ctx.fillText(label, Math.round(w / 2) + 1, ty + 1);
  ctx.fillStyle = css(color, 1);
  ctx.fillText(label, Math.round(w / 2), ty);
  if (sub) {
    ctx.font = `400 8px Silkscreen, Tiny5, monospace`;
    ctx.fillStyle = css(color, 0.7);
    let s = sub.toUpperCase();
    while (ctx.measureText(s).width > w - 12 && s.length > 4) s = s.slice(0, -2);
    ctx.fillText(s, Math.round(w / 2), Math.round(h * 0.76));
  }
  crisp(ctx, w, h);
}

/** a blood splat (alpha) for decals: a core, drops flung outwards, a few runs */
export function bloodCanvas(seed: number, size = 64, drip = false): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = size; cv.height = size;
  const ctx = cv.getContext('2d')!;
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const cols = ['#5a0606', '#7a0a0a', '#8e1010', '#4a0404'];
  const blob = (x: number, y: number, r: number) => { ctx.fillStyle = cols[Math.floor(rnd() * cols.length)]; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); };
  const c = size / 2;
  for (let i = 0; i < 9; i++) blob(c + (rnd() - 0.5) * size * 0.25, c + (rnd() - 0.5) * size * 0.25, size * (0.08 + rnd() * 0.12));
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2, d = size * (0.18 + rnd() * 0.3);
    blob(c + Math.cos(a) * d, c + Math.sin(a) * d, 0.7 + rnd() * size * 0.035);
  }
  if (drip) for (let i = 0; i < 5; i++) { const x = c + (rnd() - 0.5) * size * 0.4; ctx.fillStyle = cols[1]; ctx.fillRect(Math.round(x), c, 1 + Math.floor(rnd() * 2), Math.round(size * (0.2 + rnd() * 0.3))); }
  const d = ctx.getImageData(0, 0, size, size);
  for (let i = 3; i < d.data.length; i += 4) d.data[i] = d.data[i] > 90 ? 255 : 0;
  ctx.putImageData(d, 0, 0);
  return cv;
}
