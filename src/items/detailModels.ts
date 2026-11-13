// Hand-detailed item models for the close-ups (round 15). The most common and
// most visible items get the small things a real one has: grip ridges and butt
// caps, slotted screws, rivets, stitching, knurled bezels, tamper rings, cap
// ridges, graduations, hinge barrels, spiral bindings, wax seals, pores and
// gills. Each entry either rebuilds the model (`build`) or lays detail over the
// item's own model (`add`, given its bounds), and names a few points of
// interest the inspect view marks on the thing (`poi`, model space, metres).
// Both the world model and the close-up are built from these, so fitting,
// holding and icons stay in one frame.
import type * as THREE from 'three';
import type { ModelBuilder } from '../gfx/modelBuilder';
import type { Item } from './item';

type MB = ModelBuilder;
type V3 = [number, number, number];
type Face = '+x' | '-x' | '+y' | '-y' | '+z' | '-z';
export interface Poi { at: V3; label: string; note: string | ((it: Item) => string) }
export interface Detail { build?: (mb: MB) => void; add?: (mb: MB, bb: THREE.Box3) => void; poi?: Poi[] }

// ---------------------------------------------------------------- little parts
const FACE_ROT: Record<Face, (mb: MB) => void> = {
  '+y': () => {}, '-y': (mb) => mb.rotateX(Math.PI), '+z': (mb) => mb.rotateX(Math.PI / 2), '-z': (mb) => mb.rotateX(-Math.PI / 2),
  '+x': (mb) => mb.rotateZ(-Math.PI / 2), '-x': (mb) => mb.rotateZ(Math.PI / 2),
};
function onFace(mb: MB, x: number, y: number, z: number, f: Face, fn: () => void) { mb.push().translate(x, y, z); FACE_ROT[f](mb); fn(); mb.pop(); }
/** a slotted screw head standing on a face */
function screw(mb: MB, x: number, y: number, z: number, r: number, f: Face = '+y', color = 0xc8ccd0, tex = 'i_steel') {
  onFace(mb, x, y, z, f, () => {
    mb.cylinder(0, 0, 0, r, r * 0.5, 8, tex, { color, rTop: r * 0.82 });
    mb.push().rotateY(0.5 + x * 40); mb.box(0, r * 0.38, 0, r * 1.7, r * 0.18, r * 0.34, 'i_black', { bevel: false }); mb.pop();
  });
}
/** a domed rivet on a face */
function rivet(mb: MB, x: number, y: number, z: number, r: number, f: Face = '+y', color = 0xb8bcc0, tex = 'i_metal') {
  onFace(mb, x, y, z, f, () => mb.sphere(0, 0, 0, r, 8, 4, tex, { color, sy: 0.55 }));
}
/** a ring band round an axis: centre, radius, width */
function band(mb: MB, ax: 'x' | 'y' | 'z', x: number, y: number, z: number, r: number, w: number, tex: string, color = 0xffffff, segs = 12) {
  if (ax === 'x') mb.cylinderX(x, y, z, r, w, segs, tex, { color });
  else if (ax === 'z') mb.cylinderZ(x, y, z, r, w, segs, tex, { color });
  else mb.cylinder(x, y - w / 2, z, r, w, segs, tex, { color });
}
/** stitches: n dashes from a to b along one axis, sitting proud of a face */
function stitch(mb: MB, a: V3, b: V3, n: number, color = 0xe8dcc0, tex = 'i_cloth') {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const L = Math.hypot(dx, dy, dz), seg = (L / n) * 0.55, t = 0.0011;
  const ax = Math.abs(dx) >= Math.abs(dy) && Math.abs(dx) >= Math.abs(dz) ? 0 : Math.abs(dy) >= Math.abs(dz) ? 1 : 2;
  for (let i = 0; i < n; i++) {
    const k = (i + 0.5) / n, x = a[0] + dx * k, y = a[1] + dy * k, z = a[2] + dz * k;
    if (ax === 0) mb.box(x, y - t / 2, z, seg, t, t, tex, { color, bevel: false });
    else if (ax === 1) mb.box(x, y - seg / 2, z, t, seg, t, tex, { color, bevel: false });
    else mb.box(x, y - t / 2, z, t, t, seg, tex, { color, bevel: false });
  }
}
/** vertical ridges round a cap (bottle caps, bezels) */
function capRidges(mb: MB, y0: number, h: number, r: number, color: number, n = 16, tex = 'i_cap') {
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; mb.box(Math.cos(a) * r, y0, Math.sin(a) * r, 0.0018, h, 0.0018, tex, { color, bevel: false }); }
}
/** a cap with ridges and a tamper ring under it */
function bottleCap(mb: MB, y0: number, h: number, r: number, color: number) {
  capRidges(mb, y0 + 0.0008, h - 0.0016, r * 1.01, color);
  mb.cylinder(0, y0 - 0.004, 0, r * 0.88, 0.0032, 14, 'i_plastic', { color });
  mb.cylinder(0, y0 + h - 0.0004, 0, r * 0.7, 0.0008, 14, 'i_plastic', { color: mixc(color, 0xffffff, 0.25) });
}
/** a few speckles / pores half sunk into a round surface (centre, radii, colour) */
function pores(mb: MB, c: V3, rx: number, ry: number, rz: number, n: number, r: number, color: number, seed = 1, tex = 'i_black') {
  let s = seed * 9301 + 49297;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  for (let i = 0; i < n; i++) {
    const u = rnd() * Math.PI * 2, v = Math.acos(rnd() * 1.6 - 0.6);
    mb.sphere(c[0] + Math.sin(v) * Math.cos(u) * rx, c[1] + Math.cos(v) * ry, c[2] + Math.sin(v) * Math.sin(u) * rz, r * (0.6 + rnd() * 0.7), 5, 3, tex, { color, sy: 0.6 });
  }
}
function mixc(a: number, b: number, t: number) {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t) << s;
  return ch(16) | ch(8) | ch(0);
}
const pct = (v: number) => Math.round(v * 100) + '%';
const wornNote = (good: string, mid: string, bad: string) => (it: Item) => (it.cond > 0.7 ? good : it.cond > 0.35 ? mid : bad) + '  (' + pct(it.cond) + ')';
const fluidNote = (it: Item) => it.fluid ? it.fluid.amount.toFixed(2) + ' L of ' + it.fluid.type + ' sloshes inside.' : 'Empty. Something dried in the bottom.';

// ---------------------------------------------------------------- the pistol, rebuilt (lying on its side: barrel +x, top +z)
function pistol(mb: MB) {
  mb.box(0.0225, 0.002, 0.015, 0.185, 0.026, 0.03, 'metal_dark', { color: 0x9a9ea4 });
  for (let i = 0; i < 7; i++) mb.box(-0.064 + i * 0.0045, 0.0015, 0.016, 0.0016, 0.027, 0.027, 'i_black', { bevel: false });
  mb.box(0.03, 0.0278, 0.0215, 0.028, 0.0009, 0.0095, 'i_steel', { color: 0xd8dde2 });
  mb.cylinderX(0.1155, 0.015, 0.018, 0.0062, 0.004, 12, 'metal_dark', { color: 0x6a6e74 });
  mb.cylinderX(0.1172, 0.015, 0.018, 0.0042, 0.001, 12, 'i_black');
  mb.box(0.104, 0.012, 0.03, 0.005, 0.006, 0.005, 'metal_dark');
  mb.box(-0.062, 0.006, 0.03, 0.006, 0.018, 0.005, 'metal_dark');
  mb.box(-0.062, 0.0145, 0.0328, 0.0062, 0.0012, 0.0012, 'i_white', { color: 0xf0f0e0, bevel: false });
  mb.box(0.01, 0.003, -0.006, 0.16, 0.024, 0.012, 'plastic_black', { color: 0x4a4a4e });
  for (let i = 0; i < 3; i++) mb.box(0.06 + i * 0.008, 0.0025, -0.012, 0.004, 0.025, 0.002, 'i_black', { bevel: false });
  mb.box(-0.004, 0.009, -0.031, 0.044, 0.012, 0.004, 'plastic_black', { color: 0x4a4a4e });
  mb.box(0.017, 0.009, -0.021, 0.004, 0.012, 0.022, 'plastic_black', { color: 0x4a4a4e });
  mb.push().translate(-0.002, 0.0115, -0.012).rotateY(-0.25); mb.box(0, 0, -0.008, 0.004, 0.007, 0.016, 'metal_dark', { color: 0x7a7e84 }); mb.pop();
  mb.box(0.005, 0.0282, 0.003, 0.034, 0.0016, 0.005, 'metal_dark', { color: 0x5a5e64 });
  mb.box(-0.024, 0.0282, -0.007, 0.007, 0.0016, 0.007, 'i_black');
  mb.box(-0.075, 0.008, 0.026, 0.008, 0.012, 0.01, 'metal_dark', { color: 0x7a7e84 });
  mb.push().translate(-0.046, 0, -0.008).rotateY(0.26);
  mb.box(0, 0.002, -0.042, 0.032, 0.026, 0.078, 'plastic_black', { color: 0x3c3c40 });
  mb.box(0, 0.0005, -0.044, 0.025, 0.029, 0.058, 'i_grip', { color: 0x4a4a4a });
  mb.box(0, 0.003, -0.084, 0.035, 0.024, 0.006, 'metal_dark', { color: 0x6a6e74 });
  screw(mb, 0, 0.0295, -0.026, 0.0022, '+y', 0x9a9ea4); screw(mb, 0, 0.0295, -0.064, 0.0022, '+y', 0x9a9ea4);
  mb.pop();
}

// ---------------------------------------------------------------- the registry
export const DETAIL: Record<string, Detail> = {
  // ------------------------------------------------ tools
  hammer: {
    add: (mb) => {
      for (let x = -0.16; x < -0.02; x += 0.011) band(mb, 'x', x, 0.015, 0, 0.0146 - (x + 0.17) * 0.006, 0.0035, 'i_rubber', 0x202022);
      band(mb, 'x', -0.172, 0.015, 0, 0.0152, 0.006, 'i_rubber', 0x141416);
      band(mb, 'x', 0.054, 0.015, 0, 0.0136, 0.008, 'i_metal', 0x6a6e74);
      mb.box(0.12, 0.0298, 0, 0.011, 0.0016, 0.018, 'i_steel', { color: 0xd8dce0 });
      for (const z of [-0.006, 0.006]) rivet(mb, 0.12, 0.031, z, 0.0016, '+y', 0xb0b4b8);
      band(mb, 'z', 0.12, 0.015, 0.0765, 0.0128, 0.003, 'i_steel', 0xe8ecef, 16);
      mb.push().translate(0.12, 0.0, -0.05).rotateX(-0.35); mb.box(0, -0.0005, -0.03, 0.005, 0.021, 0.042, 'i_black'); mb.pop();
      mb.box(0.1362, 0.008, 0.012, 0.0008, 0.012, 0.03, 'i_black', { color: 0x4a4a4a, bevel: false });
    },
    poi: [
      { at: [0.12, 0.015, 0.078], label: 'STRIKING FACE', note: wornNote('Hardened face, still crisp at the rim.', 'Face mushroomed at the rim from misses.', 'Face chipped and domed. It will glance off nails.') },
      { at: [0.12, 0.012, -0.09], label: 'CLAW', note: 'Split claw. Pulls nails, pries boards, opens the stubborn.' },
      { at: [-0.1, 0.03, 0], label: 'GRIP', note: 'Ribbed rubber over hickory, worn smooth where a thumb sat.' },
    ],
  },
  screwdriver: {
    add: (mb) => {
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; mb.box(-0.06, 0.014 + Math.sin(a) * 0.0128 - 0.0015, Math.cos(a) * 0.0128, 0.068, 0.003, 0.003, 'i_plastic', { color: 0xc89410 }); }
      band(mb, 'x', -0.017, 0.014, 0, 0.0062, 0.008, 'chrome', 0xd8dce0);
      band(mb, 'x', -0.1, 0.014, 0, 0.0128, 0.004, 'i_plastic', 0x1a1a1a);
    },
    poi: [
      { at: [0.096, 0.014, 0], label: 'TIP', note: wornNote('Flat blade, square and sharp.', 'Blade a little rounded. It will cam out under load.', 'Tip twisted and rounded off.') },
      { at: [-0.06, 0.03, 0], label: 'HANDLE', note: 'Fluted acetate, yellowed with age and hand grease.' },
    ],
  },
  wrench: {
    add: (mb) => {
      mb.cylinder(-0.12, 0.0121, 0, 0.0115, 0.0006, 6, 'i_black');
      mb.cylinder(-0.12, -0.0006, 0, 0.0115, 0.0006, 6, 'i_black');
      mb.box(0, 0.0101, 0, 0.15, 0.0009, 0.012, 'i_steel', { color: 0x8a9096, bevel: false });
      mb.box(0.03, 0.0111, 0, 0.022, 0.0004, 0.005, 'i_black', { color: 0x3a3a3a, bevel: false });
    },
    poi: [
      { at: [0.142, 0.006, 0], label: 'OPEN JAW', note: wornNote('17 mm. Jaws square.', '17 mm. Jaws sprung a hair wide.', 'Jaws spread. It slips off anything tight.') },
      { at: [-0.12, 0.013, 0], label: 'BOX END', note: 'Twelve-point ring. Grips a nut that is already rounded.' },
    ],
  },
  crowbar: {
    add: (mb) => {
      for (const x of [-0.125, -0.06, 0.02, 0.055]) band(mb, 'x', x, 0.012, 0, 0.0128, 0.003, 'i_white', 0x7a2018);
      mb.box(-0.315, 0.006, 0, 0.014, 0.009, 0.004, 'i_black');
      for (const [x, z] of [[0.15, 0.008], [0.2, -0.006], [-0.22, 0.007], [-0.18, -0.009]]) mb.sphere(x, 0.012 + (z > 0 ? 0.008 : -0.006), z * 0.5, 0.0035, 5, 3, 'i_rust', { sy: 0.4 });
    },
    poi: [
      { at: [-0.3, 0.01, 0], label: 'CHISEL END', note: 'Flat bit with a nail slot, burred from hammering.' },
      { at: [0.29, 0.012, -0.06], label: 'GOOSENECK', note: 'Bent for leverage. The claw lips are chewed.' },
      { at: [-0.03, 0.025, 0], label: 'PAINT', note: wornNote('Red enamel, mostly whole.', 'Paint flaking off in rings where hands go.', 'Paint mostly gone; bare iron, rusting.') },
    ],
  },
  knife_kitchen: {
    add: (mb) => {
      for (const x of [-0.11, -0.09, -0.07]) mb.box(x, -0.0006, 0, 0.006, 0.001, 0.006, 'i_steel', { bevel: false });
      mb.box(-0.09, 0.0161, 0, 0.0055, 0.0008, 0.0055, 'i_steel', { bevel: false });
      mb.box(-0.022, 0.002, -0.004, 0.008, 0.012, 0.026, 'i_steel', { color: 0xd8dce0 });
      mb.push().translate(0.075, 0.0055, -0.0186).rotateY(-Math.atan2(0.01, 0.205)); mb.box(0, 0, 0, 0.2, 0.0012, 0.0028, 'i_steel', { color: 0xffffff, bevel: false }); mb.pop();
    },
    poi: [
      { at: [0.08, 0.006, -0.02], label: 'EDGE', note: wornNote('Keen. It shaves the hair off a wrist.', 'Dull in the belly, still bites at the tip.', 'Edge rolled and nicked. Saws more than cuts.') },
      { at: [-0.09, 0.017, 0], label: 'HANDLE', note: 'Three brass-look rivets through black composite.' },
    ],
  },
  pocket_knife: {
    add: (mb) => {
      mb.box(-0.035, 0.0055, 0, 0.091, 0.003, 0.0226, 'i_steel', { color: 0xb0b6bc, bevel: false });
      mb.cylinder(0.006, -0.0004, 0, 0.0038, 0.0148, 10, 'chrome');
      mb.box(0.03, 0.0081, 0.004, 0.006, 0.0005, 0.0016, 'i_black', { bevel: false });
      mb.box(-0.084, 0.004, 0, 0.004, 0.006, 0.012, 'chrome');
    },
    poi: [
      { at: [0.06, 0.007, 0], label: 'BLADE', note: wornNote('Bright, oiled, snaps open clean.', 'Grit in the pivot; opens with a thumbnail.', 'Blade wobbles on the pivot.') },
      { at: [-0.06, 0.016, 0], label: 'SCALES', note: 'Red scales with the cross. Liners show steel at the seam.' },
    ],
  },
  lighter: {
    add: (mb) => {
      mb.cylinderZ(0.006, 0.072, 0, 0.0045, 0.008, 12, 'i_metal', { color: 0x6a6e72 });
      for (let i = 0; i < 4; i++) mb.box(-0.008 + i * 0.0045, 0.0615, 0.0061, 0.0018, 0.0065, 0.0006, 'i_black', { bevel: false });
      mb.box(0, 0.014, 0.0061, 0.016, 0.03, 0.0006, 'i_glass', { color: 0xffb860, bevel: false });
      mb.box(0, -0.0006, 0, 0.0256, 0.0026, 0.0126, 'i_plastic', { color: 0x9a1a14 });
    },
    poi: [
      { at: [0.006, 0.072, 0.006], label: 'STRIKER', note: 'Knurled steel wheel over a flint. Thumb it hard.' },
      { at: [0, 0.03, 0.007], label: 'FUEL', note: (it) => 'Butane window: about ' + pct(Math.max(0, Math.min(1, it.uses ?? 1))) + ' left.' },
    ],
  },
  flashlight: {
    add: (mb) => {
      for (let x = -0.09; x < 0.04; x += 0.011) band(mb, 'x', x, 0.019, 0, 0.0185, 0.0022, 'i_rubber', 0x1c1c20);
      band(mb, 'x', -0.103, 0.019, 0, 0.0186, 0.008, 'i_metal', 0x52525a, 14);
      mb.box(-0.111, 0.0165, 0, 0.007, 0.005, 0.011, 'i_black');
      band(mb, 'x', 0.1045, 0.026, 0, 0.0286, 0.004, 'chrome', 0xd8dce0, 16);
      band(mb, 'x', 0.1032, 0.026, 0, 0.0215, 0.0012, 'chrome', 0xffffff, 16);
      for (let i = 0; i < 4; i++) mb.box(-0.005 + i * 0.0035, 0.0408, 0, 0.0016, 0.0012, 0.01, 'i_rubber', { color: 0x4a4a4a, bevel: false });
    },
    poi: [
      { at: [0.106, 0.026, 0], label: 'LENS', note: 'Scratched polycarbonate. The reflector behind it is still bright.' },
      { at: [0, 0.042, 0], label: 'SWITCH', note: 'Rubber boot over a clicky switch. Press hard.' },
      { at: [-0.106, 0.019, 0], label: 'TAIL CAP', note: (it) => 'Two D cells. Charge ' + pct(Math.max(0, Math.min(1, it.uses ?? 1))) + '.' },
    ],
  },
  lantern: {
    add: (mb) => {
      mb.cylinderZ(0, 0.025, 0.0615, 0.008, 0.008, 12, 'i_rubber', { color: 0x1a1a1a });
      mb.box(0, 0.033, 0.0662, 0.0016, 0.006, 0.0016, 'i_white', { bevel: false });
      for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + Math.PI / 4; mb.box(Math.cos(a) * 0.045, -0.002, Math.sin(a) * 0.045, 0.012, 0.003, 0.012, 'i_rubber', { color: 0x1a1a1a }); }
      for (const y of [0.05, 0.156]) mb.cylinder(0, y, 0, 0.0505, 0.004, 14, 'i_plastic', { color: 0x2a5a3a });
      for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; mb.box(Math.cos(a) * 0.0605, 0.012, Math.sin(a) * 0.0605, 0.002, 0.022, 0.002, 'i_black', { bevel: false }); }
      for (const s of [-1, 1]) screw(mb, s * 0.02, 0.19, 0, 0.0025, '+y');
    },
    poi: [
      { at: [0, 0.1, 0.05], label: 'GLOBE', note: 'Frosted globe. Throws light all round, not far.' },
      { at: [0, 0.025, 0.07], label: 'DIMMER', note: (it) => 'Knob dimmer. Charge ' + pct(Math.max(0, Math.min(1, it.uses ?? 1))) + '.' },
    ],
  },
  candle: {
    add: (mb) => {
      mb.cylinder(0, 0.006, 0, 0.041, 0.004, 16, 'i_metal', { color: 0xb89040 });
      mb.box(0.046, 0.002, 0, 0.014, 0.004, 0.009, 'i_metal', { color: 0xc8a050 });
      for (const [a, l] of [[0.6, 0.02], [2.4, 0.012], [4.1, 0.026]]) mb.box(Math.cos(a) * 0.0185, 0.098 - l, Math.sin(a) * 0.0185, 0.004, l, 0.004, 'i_white', { color: 0xf6eedc });
      mb.cylinder(0, 0.096, 0, 0.0175, 0.002, 12, 'i_white', { color: 0xe8dcc0 });
    },
    poi: [
      { at: [0, 0.1, 0], label: 'WICK', note: 'Cotton wick, trimmed short. It gutters in a draught.' },
      { at: [0.02, 0.05, 0.01], label: 'WAX', note: (it) => 'Tallow-white wax, ' + pct(Math.max(0, Math.min(1, it.uses ?? 1))) + ' left, dripped down one side.' },
    ],
  },
  glowstick: {
    add: (mb) => {
      mb.box(0.074, 0.002, 0, 0.008, 0.012, 0.012, 'i_plastic', { color: 0xf2f2ee });
      for (const z of [-0.004, 0.004]) mb.box(-0.082, 0.002 + 0.006, z, 0.01, 0.0018, 0.0018, 'i_plastic', { color: 0xe0e0dc, bevel: false });
      mb.box(-0.087, 0.0042, 0, 0.0018, 0.0075, 0.0098, 'i_plastic', { color: 0xe0e0dc, bevel: false });
    },
    poi: [{ at: [0, 0.015, 0], label: 'VIAL', note: 'Snap the glass vial inside and shake. Hours of cold green light.' }],
  },
  // ------------------------------------------------ weapons
  bat_baseball: {
    add: (mb) => {
      for (let x = -0.395; x < -0.225; x += 0.017) band(mb, 'x', x, 0.034, 0, 0.0158 + (x + 0.4) * 0.011 + 0.0008, 0.0028, 'i_rubber', 0x2a2a2e);
      band(mb, 'x', -0.428, 0.034, 0, 0.0228, 0.004, 'wood_light', 0xc8b088, 14);
      mb.cylinderX(0.4205, 0.034, 0, 0.022, 0.0016, 14, 'wood_light', { color: 0x8a6a40 });
      mb.box(0.2, 0.027, 0.0284, 0.06, 0.014, 0.0008, 'i_black', { color: 0x3a2a1a, bevel: false });
      mb.box(0.2, 0.0305, 0.0289, 0.05, 0.007, 0.0006, 'i_white', { color: 0xc8b088, bevel: false });
    },
    poi: [
      { at: [0.28, 0.064, 0], label: 'BARREL', note: wornNote('Ash, sweet spot unmarked.', 'Dented along the sweet spot. Flecks of something dark.', 'Cracked along the grain. One more swing, maybe two.') },
      { at: [-0.3, 0.052, 0], label: 'GRIP TAPE', note: 'Cloth tape wound tight, black with use.' },
    ],
  },
  machete: {
    add: (mb) => {
      for (const x of [-0.25, -0.21, -0.17]) { rivet(mb, x, 0.024, 0, 0.0028, '+y', 0xc8ccd0); rivet(mb, x, 0, 0, 0.0028, '-y', 0xc8ccd0); }
      for (let x = -0.265; x < -0.15; x += 0.012) mb.box(x, 0.0236, 0.012, 0.004, 0.0012, 0.006, 'i_black', { bevel: false });
      mb.cylinder(-0.268, -0.0004, 0, 0.0035, 0.0248, 8, 'i_black');
      mb.box(0.06, 0.0131, 0.006, 0.26, 0.0007, 0.006, 'i_steel', { color: 0x8c949c, bevel: false });
      for (const [x, z] of [[0.18, -0.01], [0.24, 0.0], [0.07, -0.016]]) mb.box(x, 0.013, z, 0.012, 0.0006, 0.007, 'i_rust', { bevel: false });
    },
    poi: [
      { at: [0.2, 0.014, 0.024], label: 'EDGE', note: wornNote('Fresh grind along the whole belly.', 'Nicked in two places; rust starting at the spine.', 'Edge chewed. It tears now.') },
      { at: [-0.21, 0.026, 0], label: 'HANDLE', note: 'Riveted polymer scales, grooved for a wet hand.' },
    ],
  },
  bat_nailed: {
    add: (mb) => {
      for (let x = -0.395; x < -0.225; x += 0.017) band(mb, 'x', x, 0.034, 0, 0.0158 + (x + 0.4) * 0.011 + 0.0008, 0.0028, 'i_rubber', 0x2a2a2e);
      for (let i = 0; i < 9; i++) { const x = 0.12 + (i % 5) * 0.06, a = i * 2.2; mb.push().translate(x, 0.034, 0).rotateX(a); mb.cylinder(0, 0.026, 0, 0.0045, 0.0015, 8, 'metal_grey', { color: 0x9a9ea4 }); mb.pop(); }
    },
    poi: [{ at: [0.24, 0.07, 0], label: 'NAILS', note: 'Sixteen-penny nails driven through and bent back. Rusting.' }],
  },
  pipe_lead: {
    add: (mb) => {
      for (let x = 0.24; x < 0.28; x += 0.005) band(mb, 'x', x, 0.02, 0, 0.0198, 0.002, 'metal_rusty', 0x7a7a7a);
      for (let x = -0.29; x < -0.125; x += 0.02) band(mb, 'x', x, 0.02, 0, 0.0216, 0.004, 'i_rubber', 0x5a5a5a);
      mb.cylinderX(-0.3005, 0.02, 0, 0.014, 0.0015, 12, 'i_black');
      mb.cylinderX(0.3305, 0.02, 0, 0.018, 0.0015, 12, 'i_black');
    },
    poi: [
      { at: [0.3, 0.045, 0], label: 'COUPLING', note: 'Threaded steel coupling. Most of the weight is here.' },
      { at: [-0.2, 0.042, 0], label: 'TAPE', note: 'Electrical tape over grip tape, layered by a nervous hand.' },
    ],
  },
  pistol: {
    build: pistol,
    poi: [
      { at: [0.03, 0.029, 0.022], label: 'EJECTION PORT', note: 'Brass-bright barrel hood. Check it is clear.' },
      { at: [-0.055, 0.03, 0.016], label: 'SLIDE', note: wornNote('Serrations sharp. Racks clean.', 'Holster wear along the slide.', 'Slide gritty. It may not go into battery.') },
      { at: [-0.06, 0.03, -0.06], label: 'GRIP', note: (it) => 'Stippled grip. Magazine: ' + (it.ammo ?? 0) + ' rounds.' },
    ],
  },
  // ------------------------------------------------ food and drink
  soda_can: {
    add: (mb) => {
      mb.box(0.007, 0.1222, 0, 0.016, 0.0012, 0.009, 'i_metal', { color: 0xd8dce0 });
      mb.cylinder(0.002, 0.1222, 0, 0.0022, 0.0014, 8, 'i_metal', { color: 0xc0c4c8 });
      mb.box(-0.0333, 0.008, 0, 0.0008, 0.106, 0.003, 'i_tin', { color: 0xa8acb0, bevel: false });
    },
    poi: [
      { at: [0.008, 0.124, 0], label: 'TAB', note: 'Ring pull, still sealed. Warm, but carbonated.' },
      { at: [0, 0.06, 0.034], label: 'LABEL', note: 'Printed aluminium. Somebody else\'s brand, from somebody else\'s world.' },
    ],
  },
  energy_drink: {
    add: (mb) => {
      mb.box(0.006, 0.1602, 0, 0.014, 0.0012, 0.008, 'i_metal', { color: 0xd8dce0 });
      mb.cylinder(0.002, 0.1602, 0, 0.002, 0.0014, 8, 'i_metal', { color: 0xc0c4c8 });
    },
    poi: [{ at: [0.006, 0.162, 0], label: 'TAB', note: 'Sealed. Taurine, sugar and a jittery hour.' }],
  },
  water_bottle: {
    add: (mb) => {
      bottleCap(mb, 0.194, 0.016, 0.01625, 0x2a6ac8);
      for (const y of [0.02, 0.035, 0.12]) mb.cylinder(0, y, 0, 0.0334, 0.0025, 16, 'i_plastic', { color: 0xc4e0f0 });
    },
    poi: [
      { at: [0, 0.21, 0], label: 'CAP', note: 'Blue screw cap. The tamper ring tells you if it was opened.' },
      { at: [0, 0.08, 0.034], label: 'CONTENTS', note: fluidNote },
    ],
  },
  almond_water: {
    add: (mb) => {
      bottleCap(mb, 0.194, 0.016, 0.01625, 0x7ab0d8);
      for (const y of [0.02, 0.035, 0.125]) mb.cylinder(0, y, 0, 0.0334, 0.0025, 16, 'i_plastic', { color: 0xe8e2d0 });
    },
    poi: [
      { at: [0, 0.21, 0], label: 'CAP', note: 'Pale blue cap. They are always the same cap.' },
      { at: [0, 0.085, 0.034], label: 'CONTENTS', note: fluidNote },
    ],
  },
  // ------------------------------------------------ medical
  bandage: {
    add: (mb) => {
      mb.box(0.028, 0.0005, 0.044, 0.006, 0.004, 0.006, 'i_steel', { color: 0xd0d4d8 });
      mb.box(0.034, 0.0005, 0.044, 0.006, 0.004, 0.006, 'i_steel', { color: 0xd0d4d8 });
      for (let x = -0.03; x <= 0.031; x += 0.0085) mb.box(x, 0.0, 0.025, 0.0012, 0.0502, 0.0008, 'i_cloth', { color: 0xe0dccc, bevel: false });
    },
    poi: [
      { at: [0.031, 0.004, 0.045], label: 'CLIPS', note: 'Two butterfly clips to pin the end.' },
      { at: [0, 0.05, 0], label: 'GAUZE', note: 'Sterile cotton gauze, still in its fold.' },
    ],
  },
  first_aid_kit: {
    add: (mb) => {
      band(mb, 'x', 0, 0.07, -0.087, 0.0045, 0.2, 'i_plastic', 0x9a1c18, 10);
      for (const [x, z] of [[-0.118, -0.083], [0.118, -0.083], [-0.118, 0.083], [0.118, 0.083]]) mb.box(x, -0.001, z, 0.014, 0.084, 0.014, 'i_rubber', { color: 0x2a2a2a });
      for (const s of [-1, 1]) screw(mb, s * 0.04, 0.042, 0.0885, 0.0022, '+z');
      for (let i = 0; i < 5; i++) mb.box(-0.03 + i * 0.015, 0.098, -0.05, 0.004, 0.0012, 0.015, 'i_black', { bevel: false });
      stitch(mb, [-0.105, 0.0835, 0.065], [0.105, 0.0835, 0.065], 22, 0xf0f0ea, 'i_white');
    },
    poi: [
      { at: [0.04, 0.04, 0.09], label: 'LATCH', note: 'Two sprung latches. One sticks.' },
      { at: [0, 0.085, 0.02], label: 'LID', note: 'Red ABS shell, white cross. The kit inside is half used.' },
    ],
  },
  syringe: {
    add: (mb) => {
      for (let i = 0; i < 10; i++) mb.box(-0.034 + i * 0.006, 0.0138, 0, 0.0007, 0.0008, i % 2 ? 0.003 : 0.005, 'i_black', { bevel: false });
      mb.box(-0.041, 0.0, 0, 0.003, 0.014, 0.03, 'i_plastic', { color: 0xf2f2ee });
      mb.cylinderX(0.033, 0.007, 0, 0.0035, 0.006, 10, 'i_plastic', { color: 0x3a8ad8 });
      mb.cylinderX(-0.036, 0.007, 0, 0.0067, 0.005, 12, 'i_rubber', { color: 0x1a1a1a });
    },
    poi: [
      { at: [0.05, 0.007, 0], label: 'NEEDLE', note: '23 gauge, capped once. Do not recap.' },
      { at: [0, 0.015, 0], label: 'BARREL', note: '5 ml, graduated in halves. Clear.' },
    ],
  },
  disinfectant: {
    add: (mb) => {
      bottleCap(mb, 0.13, 0.02, 0.015, 0xf2f2ee);
      mb.box(0, 0.1498, 0.004, 0.012, 0.004, 0.01, 'i_plastic', { color: 0xe8e8e4 });
    },
    poi: [{ at: [0, 0.07, 0.031], label: 'CONTENTS', note: (it) => (it.uses !== undefined ? 'Povidone iodine, ' + pct(Math.max(0, Math.min(1, it.uses))) + ' left. ' : 'Povidone iodine. ') + 'Stains everything.' }],
  },
  // ------------------------------------------------ documents and cards
  journal: {
    add: (mb) => {
      mb.push().rotateY(0.4);
      mb.box(0.035, -0.0006, 0, 0.007, 0.0262, 0.2012, 'i_black', { color: 0x2a2a2a, bevel: false });
      mb.box(0.012, 0.004, 0.106, 0.004, 0.0008, 0.024, 'i_cloth', { color: 0x8a1a1a, bevel: false });
      for (const [x, z] of [[0.058, 0.093], [0.058, -0.093]]) mb.box(x, 0.0242, z, 0.014, 0.0012, 0.014, 'i_brass', { color: 0xc8a050 });
      mb.pop();
    },
    poi: [
      { at: [0, 0.026, 0], label: 'COVER', note: 'Oxblood leatherette, an elastic strap holding it shut.' },
      { at: [0.04, 0.012, 0.09], label: 'PAGES', note: 'Dense handwriting, then a run of pages left blank.' },
    ],
  },
  notebook: {
    add: (mb) => {
      mb.push().rotateY(-0.2);
      for (let i = 0; i < 15; i++) mb.cylinderZ(-0.0745, 0.006, -0.1 + i * 0.0143, 0.0074, 0.0022, 10, 'chrome', { color: 0xb8bcc0, caps: false });
      mb.pop();
    },
    poi: [{ at: [-0.075, 0.012, 0], label: 'SPIRAL', note: 'Wire spiral, a few pages torn out at the rings.' }],
  },
  keycard_admin: {
    add: (mb) => {
      mb.push().rotateY(0.3);
      mb.box(0.02, 0.002, 0.008, 0.012, 0.0005, 0.01, 'i_brass', { color: 0xe0b040, bevel: false });
      for (let i = 0; i < 3; i++) mb.box(0.02, 0.0025, 0.0045 + i * 0.0035, 0.011, 0.0002, 0.0006, 'i_black', { bevel: false });
      mb.box(-0.02, 0.002, -0.015, 0.012, 0.0004, 0.012, 'chrome', { color: 0xc8e0ff, bevel: false });
      mb.box(-0.036, 0.0021, 0.021, 0.009, 0.0003, 0.0022, 'i_black', { bevel: false });
      mb.pop();
    },
    poi: [
      { at: [0.02, 0.003, 0.01], label: 'CHIP', note: 'Contact chip. Opens what the level-4 readers guard.' },
      { at: [-0.02, 0.003, -0.015], label: 'HOLOGRAM', note: 'Meridian Institute of Liminality seal. Hard to fake, harder to find.' },
    ],
  },
  id_badge: {
    add: (mb) => {
      mb.push().rotateY(0.2);
      for (const x of [-0.025, 0.025]) mb.box(x, 0.003, 0, 0.002, 0.0004, 0.084, 'i_plastic', { color: 0xd8e4ec, bevel: false });
      screw(mb, 0, 0.006, -0.05, 0.0018, '+y', 0xd8dce0, 'chrome');
      mb.pop();
    },
    poi: [{ at: [0, 0.004, 0.01], label: 'PHOTO', note: 'A face you almost recognise. The name is scratched out.' }],
  },
  // ------------------------------------------------ containers
  canteen: {
    add: (mb) => {
      for (const x of [-0.061, 0.061]) { stitch(mb, [x, 0.008, 0.0331], [x, 0.162, 0.0331], 18, 0xc8c098); stitch(mb, [x, 0.008, -0.0331], [x, 0.162, -0.0331], 18, 0xc8c098); }
      stitch(mb, [-0.058, 0.164, 0.0331], [0.058, 0.164, 0.0331], 14, 0xc8c098);
      for (const x of [-0.035, 0.035]) rivet(mb, x, 0.15, 0.0328, 0.004, '+z', 0xc8ccd0, 'chrome');
      mb.box(0, 0.07, -0.0355, 0.05, 0.06, 0.004, 'i_metal', { color: 0x6a6e5a });
      for (let i = 0; i < 4; i++) mb.box(0.014 + i * 0.003, 0.184 + i * 0.0012, 0.004, 0.0028, 0.0018, 0.0018, 'i_metal', { color: 0x9a9ea4, bevel: false });
    },
    poi: [
      { at: [0, 0.2, 0], label: 'CAP', note: 'Screw cap on a short chain. Rubber seal perished a little.' },
      { at: [0, 0.09, 0.034], label: 'COVER', note: (it) => 'Olive canvas cover, stitched by hand. ' + fluidNote(it) },
    ],
  },
  gas_can: {
    add: (mb) => {
      for (const s of [-1, 1]) for (let i = 0; i < 4; i++) mb.box(s * 0.0808, 0.04 + i * 0.05, 0, 0.0016, 0.006, 0.2, 'i_plastic', { color: 0xa82020 });
      mb.cylinder(0, 0.28, 0.07, 0.009, 0.006, 12, 'i_plastic', { color: 0xf0c419 });
      for (let i = 0; i < 6; i++) mb.box(-0.012 + i * 0.0045, 0.333, -0.05, 0.0018, 0.0014, 0.12, 'i_black', { bevel: false });
    },
    poi: [
      { at: [0, 0.3, 0.11], label: 'SPOUT', note: 'Flexible spout, yellow vent cap. It glugs.' },
      { at: [0, 0.14, 0.126], label: 'CONTENTS', note: fluidNote },
    ],
  },
  // ------------------------------------------------ economy and resources
  chem_reagent: {
    add: (mb) => {
      for (let i = 0; i < 6; i++) { const a = i * 1.05; mb.sphere(Math.cos(a) * 0.02, 0.118 - (i % 2) * 0.006, Math.sin(a) * 0.02, 0.0035, 6, 3, 'i_plastic', { color: 0x8a1a14, sy: 1.4 }); }
      mb.cylinder(0, 0.104, 0, 0.0205, 0.004, 14, 'i_rope', { color: 0xc8b890 });
      mb.push().translate(0, 0.045, 0.0353).rotateZ(Math.PI / 4); mb.box(0, -0.008, 0, 0.016, 0.016, 0.0008, 'i_white', { color: 0xe8901a, bevel: false }); mb.pop();
    },
    poi: [
      { at: [0, 0.125, 0], label: 'SEAL', note: 'Cork under red wax. Somebody pressed a thumbprint into it.' },
      { at: [0, 0.05, 0.036], label: 'HAZARD', note: 'Orange diamond: corrosive. Do not smell it to check.' },
    ],
  },
  glass_pane: {
    add: (mb) => {
      mb.push().rotateX(-0.12);
      for (const [x, z] of [[-0.11, -0.11], [0.11, 0.11]]) mb.box(x, 0.0044, z, 0.03, 0.0008, 0.012, 'i_card', { color: 0xd8c070, bevel: false });
      mb.box(0.03, 0.0042, -0.04, 0.06, 0.0004, 0.002, 'i_white', { color: 0xf0f0f0, bevel: false });
      mb.pop();
    },
    poi: [{ at: [0, 0.006, 0], label: 'PANE', note: 'Float glass, tape on two corners. One flaw near the edge.' }],
  },
  honeycomb: {
    add: (mb) => {
      mb.box(0, 0.03, -0.043, 0.13, 0.007, 0.007, 'i_wood', { color: 0xb88a56 });
      for (const [x, z] of [[-0.04, 0.041], [0.01, 0.041], [0.061, -0.02], [-0.061, 0.01]]) mb.sphere(x, 0.012, z, 0.006, 6, 4, 'i_white', { color: 0xffa820, sy: 1.6, emissive: 0.15 });
    },
    poi: [{ at: [0, 0.031, 0], label: 'COMB', note: 'Capped cells, warm and heavy. The wax hums faintly.' }],
  },
  pigeon_egg: {
    add: (mb) => { pores(mb, [0, 0.025, 0], 0.02, 0.026, 0.02, 10, 0.0022, 0xa8987a, 3, 'i_white'); },
    poi: [{ at: [0, 0.05, 0], label: 'SHELL', note: 'Chalky shell, still faintly warm. Something moved once.' }],
  },
  carpet_morel: {
    add: (mb) => {
      pores(mb, [0, 0.055, 0], 0.022, 0.035, 0.022, 16, 0.0045, 0x2a1a10, 7);
      for (let i = 0; i < 6; i++) { const a = i * 1.1; mb.sphere(Math.cos(a) * 0.016, 0.004, Math.sin(a) * 0.016, 0.003, 5, 3, 'i_knit', { color: 0x8a7a5a, sy: 0.6 }); }
    },
    poi: [{ at: [0, 0.08, 0], label: 'CAP', note: 'Honeycombed cap that grew through carpet underlay. Edible, cooked.' }],
  },
  hum_cap: {
    add: (mb) => {
      for (let i = 0; i < 7; i++) { const a = i * 2.39, r = i ? 0.016 : 0, h = 0.03 + (i % 3) * 0.008; mb.cylinder(Math.cos(a) * r, h - 0.0028, Math.sin(a) * r, 0.0092, 0.0012, 10, 'i_black', { color: 0x4a5a6a }); }
      for (let i = 0; i < 5; i++) { const a = i * 1.3; mb.sphere(Math.cos(a) * 0.026, 0.05 + i * 0.006, Math.sin(a) * 0.026, 0.0012, 4, 3, 'i_white', { color: 0xc8f0ff, emissive: 1.2 }); }
    },
    poi: [{ at: [0, 0.05, 0], label: 'GILLS', note: 'Blue-grey gills that buzz at mains frequency. The spores glow.' }],
  },
  biomass: {
    add: (mb) => {
      for (const [x, z, r] of [[-0.03, -0.02, 0.4], [0.02, 0.015, -0.3], [0.0, -0.01, 1.2]]) { mb.push().translate(x, 0.0505, z).rotateY(r); mb.box(0, 0, 0, 0.07, 0.0012, 0.0022, 'i_white', { color: 0x8a2a2a, bevel: false }); mb.pop(); }
      pores(mb, [0, 0.025, 0], 0.06, 0.026, 0.04, 12, 0.003, 0x3a4a1a, 5);
    },
    poi: [{ at: [0, 0.052, 0], label: 'MASS', note: 'Compressed organic matter, veined and damp. Feeds a vat.' }],
  },
  plastic_scrap: {
    poi: [{ at: [0, 0.03, 0], label: 'POLYMER', note: 'Bottle, tray and a rubber stopper. Melts down into sheet.' }],
  },
  // ------------------------------------------------ harvest parts
  driller_tooth: {
    add: (mb) => {
      mb.push().rotateZ(1.2);
      band(mb, 'x', -0.046, 0.012, 0, 0.0116, 0.008, 'i_white', 0xa04a3a, 12);
      for (const x of [-0.03, -0.015, 0.0]) band(mb, 'x', x, 0.012, 0, 0.0098 - (x + 0.03) * 0.13, 0.0016, 'i_white', 0xb8a888, 12);
      mb.pop();
    },
    poi: [{ at: [0.0, 0.03, 0], label: 'ROOT', note: 'Gum still clings to the root. Ridged like a drill bit.' }],
  },
  sponge_chunk: {
    add: (mb) => { pores(mb, [0, 0.035, 0], 0.05, 0.037, 0.05, 22, 0.006, 0x4a3a1a, 11); },
    poi: [{ at: [0, 0.07, 0], label: 'PORES', note: 'Open pores, each one slightly wet. It breathes if you wait.' }],
  },
  // ------------------------------------------------ anomaly samples
  glow_jar: {
    add: (mb) => {
      for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2; mb.box(Math.cos(a) * 0.0342, 0.101, Math.sin(a) * 0.0342, 0.0016, 0.01, 0.0016, 'i_tin', { bevel: false }); }
      for (const s of [-1, 1]) mb.box(s * 0.0408, 0.06, 0, 0.0016, 0.05, 0.0035, 'i_metal', { color: 0x9a9ea4, bevel: false });
      mb.box(0, 0.04, -0.0406, 0.05, 0.03, 0.0012, { all: 'i_card', north: 'i_note', south: 'i_note' }, { fit: true, bevel: false });
    },
    poi: [
      { at: [0, 0.05, 0.041], label: 'DUST', note: 'Luminous dust that settles upward. Shake it and it glows brighter.' },
      { at: [0, 0.112, 0], label: 'LID', note: 'Tin screw lid, wired shut.' },
    ],
  },
  specimen_jar: {
    add: (mb) => {
      for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.4; screw(mb, Math.cos(a) * 0.03, 0.135, Math.sin(a) * 0.03, 0.0026, '+y', 0xd8dce0, 'chrome'); }
      for (let i = 0; i < 6; i++) mb.sphere(0.012 - i * 0.004, 0.03 + i * 0.013, 0.02 * Math.sin(i), 0.0022, 6, 3, 'i_glass', { color: 0xffffff });
    },
    poi: [
      { at: [0, 0.07, 0.046], label: 'SPECIMEN', note: 'An eye in formalin. It tracks the light. Probably.' },
      { at: [0, 0.135, 0], label: 'LID', note: 'Bakelite lid, four screws. Catalogue number filed off.' },
    ],
  },
  memory_shard: {
    add: (mb) => { mb.sphere(0.005, 0.008, 0, 0.004, 6, 4, 'i_white', { color: 0xe0d0ff, emissive: 1.4 }); },
    poi: [{ at: [0.005, 0.02, 0], label: 'CORE', note: 'A bright point inside. Hold it long enough and you remember a room you never saw.' }],
  },
  data_drive: {
    add: (mb) => {
      for (const [x, z] of [[-0.04, -0.021], [0.04, -0.021], [-0.04, 0.021], [0.04, 0.021]]) screw(mb, x, 0, z, 0.0022, '-y', 0xb0b4b8);
      for (let i = 0; i < 5; i++) mb.box(0.058, 0.007, -0.006 + i * 0.003, 0.012, 0.0008, 0.0012, 'i_brass', { color: 0xe0b040, bevel: false });
      for (let i = 0; i < 6; i++) mb.box(-0.042, 0.0162, -0.012 + i * 0.005, 0.008, 0.0005, 0.0018, 'i_black', { bevel: false });
    },
    poi: [
      { at: [0.06, 0.008, 0], label: 'CONNECTOR', note: 'Gold contacts, institute pinout. Readers in the archive take it.' },
      { at: [-0.03, 0.017, 0.015], label: 'ACTIVITY LED', note: 'Still blinks. Something on it is running.' },
    ],
  },
};
