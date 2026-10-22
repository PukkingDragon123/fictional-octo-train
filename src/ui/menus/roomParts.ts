// The subject room's machines and props as faceted low-poly models (scene/
// facet.ts) on hand-pixelled textures (scene/pixtex.ts): a heavy oak electric
// chair with iron brackets, leather straps and brass buckles, the electrode
// cap and its chin strap, a caged shade lamp, olive hydraulic arms with
// segmented claws and a tool head with a toothed saw, the press, the hatch
// shutter, ceiling tube fixtures, the breaker with its knife switch, a green
// phosphor monitor on a cart, a drain, a brine bucket, an instrument tray.
// Same origins and axes as before, so room3d places them alike.
import * as THREE from 'three';
import { FacetBuilder, at, along, cbox, hull, lathe, prism, extrude, ngon, tube, band, gem, bolt, starGeo, jitter } from './scene/facet';
import type { FMats } from './scene/pixtex';
import { plateTex } from './scene/pixtex';
import { ROOM } from './roomKit';

type V3 = [number, number, number];
export type Mats = FMats;

export const COL = {
  oak: 0xc8bcb0, oakDark: 0x9a8a78, leather: 0xffffff, brass: 0xffffff, steel: 0x8e9294, dark: 0x4a4e50, olive: 0x76804e, oliveDark: 0x4e5636,
  beige: 0xd8ccb0, rubber: 0xffffff, chrome: 0xffffff, red: 0xb83a24, green: 0x4a7a40,
};

// ------------------------------------------------------------------ the chair
/** the electric chair, in world space. straps: the restraints are on the subject (only anchors show); false: open straps hang loose */
export function chairModel(mats: Mats, straps: boolean): THREE.Group {
  const b = new FacetBuilder();
  const { SEAT_Y: Y, CHAIR_Z: z } = ROOM;
  const WOOD = { grain: 'y' as const };
  // the dais: two planks thick, iron-shod corners
  b.add('wood', cbox(1.24, 0.09, 1.14, 0.02), COL.oakDark, at(0, 0.045, z + 0.04), { grain: 'z' });
  for (const [x, dz] of [[-0.6, -0.53], [0.6, -0.53], [-0.6, 0.61], [0.6, 0.61]]) b.add('rust', cbox(0.1, 0.1, 0.1, 0.015), 0xffffff, at(x, 0.05, z + dz));
  b.add('rubber', cbox(0.98, 0.012, 0.86, 0.004), 0x8a8a8a, at(0, 0.096, z + 0.08));
  const floorY = 0.1;
  // legs: heavy square posts, the back pair running up into the uprights
  const legH = Y - 0.08 - floorY;
  for (const k of [-1, 1]) {
    b.add('wood', jitter(cbox(0.1, legH, 0.1, 0.018, 0.08), 0.004, 3 + k), COL.oak, at(k * 0.29, floorY + legH / 2, z + 0.25), WOOD);
    b.add('wood', jitter(cbox(0.1, 1.62 - floorY, 0.1, 0.018, 0.12), 0.004, 5 + k), COL.oak, at(k * 0.29, (1.62 + floorY) / 2, z - 0.31), WOOD);
    // stretchers
    b.add('wood', cbox(0.05, 0.06, 0.52, 0.012), COL.oakDark, at(k * 0.29, floorY + 0.12, z - 0.03), { grain: 'z' });
    // front posts up to the arms
    b.add('wood', jitter(cbox(0.08, 0.3, 0.08, 0.016, 0.1), 0.003, 9 + k), COL.oak, at(k * 0.31, Y + 0.13, z + 0.25), WOOD);
    // arms: planks with a rounded nose
    b.add('wood', cbox(0.13, 0.05, 0.66, 0.016), COL.oak, at(k * 0.31, 0.735, z + 0.0), { grain: 'z' });
    b.add('wood', cbox(0.14, 0.04, 0.08, 0.02, 0.2), COL.oakDark, at(k * 0.31, 0.75, z + 0.33));
    // iron angle brackets on the joints, bolted
    for (const [yy, zz] of [[Y - 0.12, z + 0.25], [Y - 0.12, z - 0.31], [0.7, z + 0.25]] as [number, number][]) {
      b.add('rust', cbox(0.11, 0.07, 0.015, 0.004), 0xd0c0b0, at(k * 0.29, yy, zz + (zz > z ? 0.055 : -0.055)));
      for (const dx of [-0.03, 0.03]) b.add('metal', bolt(0.011, 0.008), COL.dark, at(k * 0.29 + dx, yy, zz + (zz > z ? 0.063 : -0.063), Math.PI / 2 * (zz > z ? 1 : -1)));
    }
  }
  // the seat: a thick slab, aprons under it
  b.add('wood', cbox(0.68, 0.08, 0.62, 0.02), COL.oak, at(0, Y - 0.04, z), { grain: 'z' });
  b.add('wood', cbox(0.6, 0.11, 0.045, 0.012), COL.oakDark, at(0, Y - 0.13, z + 0.27), { grain: 'x' });
  for (const k of [-1, 1]) b.add('wood', cbox(0.045, 0.11, 0.5, 0.012), COL.oakDark, at(k * 0.27, Y - 0.13, z), { grain: 'z' });
  // the back: three slats, a head board with the leather rest, the top rail
  for (const y of [0.18, 0.46, 0.72]) b.add('wood', cbox(0.5, 0.12, 0.04, 0.012), COL.oak, at(0, Y + y, z - 0.3), { grain: 'x' });
  b.add('wood', cbox(0.84, 0.11, 0.14, 0.025, 0.1), COL.oakDark, at(0, 1.66, z - 0.31), { grain: 'x' });
  b.add('wood', cbox(0.16, 0.5, 0.035, 0.01), COL.oak, at(0, 1.36, z - 0.33));
  b.add('leather', jitter(cbox(0.22, 0.2, 0.06, 0.022), 0.004, 13), 0xd0c0b0, at(0, 1.33, z - 0.28));
  for (const [x, y] of [[-0.09, 1.42], [0.09, 1.42], [-0.09, 1.24], [0.09, 1.24]]) b.add('brass', gem(0.008, 6, 0.006), 0xffffff, at(x, y, z - 0.25, Math.PI / 2));
  // iron bands round the uprights with rivets
  for (const y of [0.98, 1.5]) for (const k of [-1, 1]) {
    b.add('rust', cbox(0.115, 0.04, 0.115, 0.006), 0xc8b8a8, at(k * 0.29, y, z - 0.31));
    b.add('metal', bolt(0.009, 0.007), COL.dark, at(k * 0.29, y, z - 0.25, Math.PI / 2));
  }
  // the junction box on the back with porcelain insulators and copper posts
  b.add('paint', cbox(0.3, 0.22, 0.1, 0.015), COL.oliveDark, at(0, 0.98, z - 0.42));
  b.add('metal', cbox(0.27, 0.19, 0.012, 0.004), COL.steel, at(0, 0.98, z - 0.475));
  for (const x of [-0.08, 0, 0.08]) {
    b.add('enamel', lathe([[0, 0], [0.022, 0], [0.024, 0.012], [0.016, 0.02], [0.02, 0.03], [0.012, 0.045], [0, 0.046]], 6), 0xe8e0d0, at(x, 1.09, z - 0.42));
    b.add('copper', prism(0.006, 0.05, 5), 0xffffff, at(x, 1.15, z - 0.42));
  }
  // anchors where the straps are nailed to the chair (always), and the open straps hanging when he is out of it
  for (const k of [-1, 1]) {
    b.add('leather', cbox(0.035, 0.06, 0.13, 0.006), 0xc8b8a8, at(k * 0.385, 0.735, z + 0.12), { rep: 0.06 });
    b.add('leather', cbox(0.12, 0.07, 0.03, 0.006), 0xc8b8a8, at(k * 0.29, 0.98, z - 0.255), { rep: 0.07 });
    b.add('leather', cbox(0.03, 0.06, 0.11, 0.006), 0xc8b8a8, at(k * 0.29 + k * 0.055, 0.22, z + 0.25), { rep: 0.06 });
    if (!straps) {
      // wrist strap ends dangling off the arm, buckle at the bottom
      b.add('leather', tube([[k * 0.39, 0.73, z + 0.12], [k * 0.405, 0.6, z + 0.13], [k * 0.4, 0.46, z + 0.12]], 0.012, 4, 4, true), 0xd0c0b0, undefined, { rep: 0.05 });
      b.add('brass', extrude([[-0.02, -0.025], [0.02, -0.025], [0.02, 0.025], [-0.02, 0.025]], 0.008, 0.002, [[[-0.012, -0.017], [0.012, -0.017], [0.012, 0.017], [-0.012, 0.017]]]), 0xffffff, at(k * 0.4, 0.45, z + 0.12, 0, Math.PI / 2));
      // chest strap halves hanging from the uprights
      b.add('leather', tube([[k * 0.24, 0.98, z - 0.24], [k * 0.2, 0.8, z - 0.18], [k * 0.21, 0.62, z - 0.12]], 0.014, 4, 4, true), 0xc8b8a8, undefined, { rep: 0.05 });
      // ankle straps open on the floor
      b.add('leather', tube([[k * 0.35, 0.22, z + 0.25], [k * 0.38, 0.12, z + 0.32], [k * 0.36, 0.105, z + 0.45]], 0.011, 4, 4, true), 0xc8b8a8, undefined, { rep: 0.05 });
    }
  }
  // the fat feed cable from the junction box down the back and along the floor to the breaker on the left wall
  b.add('rubber', tube([[0.05, 0.92, z - 0.47], [0.1, 0.5, z - 0.52], [0.0, 0.12, z - 0.6], [-0.7, 0.03, z - 0.75], [-1.8, 0.03, z - 0.95], [-ROOM.W + 0.3, 0.05, -1.25], [-ROOM.W + 0.12, 0.6, -1.3], [-ROOM.W + 0.1, 1.0, -1.3]], 0.024, 30, 5), 0x9a9a9a);
  return b.build(mats);
}

/** the electrode cap, its copper coil and terminal, the chin strap (head-bone space at height 1) */
export function capModel(mats: Mats, chin: boolean): THREE.Group {
  const b = new FacetBuilder();
  const tilt = at(0, -0.012, -0.006, -0.2);
  const T = (m: THREE.Matrix4) => tilt.clone().multiply(m);
  b.add('metal', lathe([[0.121, 0.122], [0.126, 0.136], [0.12, 0.165], [0.106, 0.196], [0.082, 0.222], [0.046, 0.238], [0.0, 0.243]], 10), 0xb0a898, tilt, { rep: 0.12 });
  b.add('brass', band(0.124, 0.124, 0.012, 0.01, 10, 1, Math.PI / 10), 0xffffff, T(at(0, 0.128, 0)));
  b.add('sponge', band(0.115, 0.115, 0.014, 0.008, 10, 1, Math.PI / 10), 0xffffff, T(at(0, 0.116, 0)));
  b.add('copper', band(0.117, 0.117, 0.018, 0.008, 10, 1, Math.PI / 10), 0xffffff, T(at(0, 0.168, 0)));
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 + Math.PI / 10; b.add('brass', gem(0.006, 5, 0.005), 0xffffff, T(at(Math.sin(a) * 0.112, 0.19, Math.cos(a) * 0.112, Math.cos(a) * 0.9, 0, -Math.sin(a) * 0.9))); }
  // the terminal: a squat bakelite insulator, a brass collar and the clamp nut the cable is screwed into
  b.add('bakelite', lathe([[0, 0], [0.034, 0], [0.036, 0.01], [0.026, 0.016], [0.03, 0.026], [0.02, 0.036], [0, 0.037]], 6), 0xffffff, T(at(0, 0.236, -0.004)));
  b.add('brass', lathe([[0, 0], [0.016, 0], [0.016, 0.012], [0.011, 0.018], [0, 0.018]], 6), 0xffffff, T(at(0, 0.272, -0.004)));
  b.add('brass', bolt(0.012, 0.01), 0xffffff, T(at(0, 0.288, -0.004)));
  // the cable boot
  b.add('rubber', lathe([[0.013, 0], [0.016, 0.016], [0.013, 0.03], [0.012, 0.036]], 5), 0x7a7a7a, T(at(0, 0.296, -0.004)));
  if (chin) {
    // the chin strap: down the cheeks, under the jaw, a buckle on the left cheek
    const strap = band(0.094, 0.15, 0.026, 0.008, 16, 0.5, -Math.PI / 2);
    b.add('leather', strap, 0xd8c8b8, at(0, 0.122, 0.028, Math.PI / 2 - 0.22), { rep: 0.026, grain: 'y', uv0: [0, 0.5] });
    b.add('brass', extrude([[-0.017, -0.02], [0.017, -0.02], [0.017, 0.02], [-0.017, 0.02]], 0.006, 0.0015, [[[-0.01, -0.013], [0.01, -0.013], [0.01, 0.013], [-0.01, 0.013]]]), 0xffffff, at(0.097, 0.055, 0.03, 0, Math.PI / 2, 0.12));
    b.add('brass', prism(0.0025, 0.03, 4), 0xffffff, at(0.1, 0.055, 0.03, 0, 0, 0.12));
  }
  return b.build(mats);
}

/** a restraint strap loop (bone space: the loop runs round local Y), buckle at the front */
export function strapModel(mats: Mats, rx: number, rz: number, w: number, buckle = true, steel = false): THREE.Group {
  const b = new FacetBuilder();
  if (steel) {
    b.add('metal', band(rx, rz, w, 0.012, 10, 1, Math.PI / 10), COL.steel);
    b.add('chrome', band(rx + 0.007, rz + 0.007, w * 0.25, 0.006, 10, 1, Math.PI / 10), 0xffffff, at(0, w * 0.3, 0));
    b.add('chrome', band(rx + 0.007, rz + 0.007, w * 0.25, 0.006, 10, 1, Math.PI / 10), 0xffffff, at(0, -w * 0.3, 0));
    b.add('metal', cbox(0.03, w * 1.1, 0.03, 0.006), COL.dark, at(0, 0, rz + 0.012));
    b.add('lamp', gem(0.006, 5, 0.006), 0xff3018, at(0, w * 0.3, rz + 0.03, Math.PI / 2));
  } else {
    b.add('leather', band(rx, rz, w, 0.01, 12, 1, Math.PI / 12), 0xd8c8b8, undefined, { rep: w, grain: 'y', uv0: [0, 0.5] });
    if (buckle) {
      b.add('brass', extrude([[-0.022, -w * 0.65], [0.022, -w * 0.65], [0.022, w * 0.65], [-0.022, w * 0.65]], 0.007, 0.0015, [[[-0.013, -w * 0.45], [0.013, -w * 0.45], [0.013, w * 0.45], [-0.013, w * 0.45]]]), 0xffffff, at(rx * 0.25, 0, rz + 0.008));
      b.add('brass', prism(0.0025, w * 1.0, 4), 0xffffff, at(rx * 0.25 + 0.004, 0, rz + 0.012, 0, 0, Math.PI / 2 - 0.1, [1, 0.045 / w, 1]));
      b.add('leather', cbox(0.07, w * 0.9, 0.012, 0.003), 0xb8a898, at(rx * 0.25 + 0.05, 0, rz + 0.012), { rep: w });
    }
  }
  return b.build(mats);
}

/** the caged shade lamp hanging from the ceiling: pivot space, cord down -Y; the bulb glass is separate (own material) */
export function bulbModel(mats: Mats, L: number): { group: THREE.Group; bulbGeo: THREE.BufferGeometry; bulbY: number } {
  const b = new FacetBuilder();
  b.add('bakelite', lathe([[0, 0], [0.06, 0], [0.06, -0.015], [0.03, -0.03], [0.012, -0.04], [0, -0.04]], 8), 0xffffff);
  b.add('rubber', prism(0.006, L - 0.12, 4), 0x8a8a8a, at(0, -(L - 0.12) / 2 - 0.03, 0));
  const y0 = -L + 0.1;
  b.add('bakelite', lathe([[0, 0.02], [0.022, 0.02], [0.026, -0.01], [0.024, -0.05], [0.018, -0.06], [0, -0.06]], 6), 0xffffff, at(0, y0, 0));
  // the shade: green enamel out, white enamel in, a rolled lip
  const shade: [number, number][] = [[0.04, 0], [0.07, -0.025], [0.15, -0.09], [0.19, -0.15], [0.2, -0.16]];
  b.add('paint', lathe(shade, 10), 0x46603e, at(0, y0, 0), { rep: 0.2 });
  b.add('enamel', lathe(shade.map(([r, y]) => [r - 0.006, y - 0.004] as [number, number]).reverse(), 10), 0xe8e4d4, at(0, y0, 0));
  b.add('metal', band(0.2, 0.2, 0.012, 0.008, 10, 1, Math.PI / 10), COL.dark, at(0, y0 - 0.16, 0));
  // the wire cage under it
  const cy = y0 - 0.16;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2, s = Math.sin(a), c = Math.cos(a);
    b.add('metal', tube([[s * 0.19, cy, c * 0.19], [s * 0.15, cy - 0.08, c * 0.15], [s * 0.07, cy - 0.16, c * 0.07], [0, cy - 0.185, 0]], 0.0055, 5, 3), 0x5a5a5a);
  }
  b.add('metal', band(0.155, 0.155, 0.008, 0.008, 8, 1, Math.PI / 8), 0x5a5a5a, at(0, cy - 0.08, 0));
  b.add('metal', band(0.075, 0.075, 0.007, 0.007, 6, 1, Math.PI / 6), 0x5a5a5a, at(0, cy - 0.155, 0));
  const bulbY = y0 - 0.075;
  const bulbGeo = lathe([[0.016, 0.015], [0.026, -0.005], [0.042, -0.04], [0.044, -0.07], [0.034, -0.095], [0.016, -0.108], [0, -0.11]], 7);
  bulbGeo.translate(0, 0.0, 0);
  return { group: b.build(mats), bulbGeo, bulbY };
}

/** a ceiling tube fixture (two tubes, separate so they can light): long axis along Z */
export function fixtureModel(mats: Mats): { group: THREE.Group; tubeGeo: THREE.BufferGeometry } {
  const b = new FacetBuilder();
  b.add('enamel', hull([[-0.12, 0, -0.7], [0.12, 0, -0.7], [-0.12, 0, 0.7], [0.12, 0, 0.7], [-0.16, -0.08, -0.72], [0.16, -0.08, -0.72], [-0.16, -0.08, 0.72], [0.16, -0.08, 0.72]]), 0xb8b4a0);
  for (const z of [-0.66, 0.66]) b.add('metal', cbox(0.3, 0.04, 0.03, 0.006), COL.dark, at(0, -0.1, z));
  for (const z of [-0.5, 0, 0.5]) b.add('metal', cbox(0.3, 0.012, 0.012, 0.003), COL.dark, at(0, -0.135, z));
  for (const k of [-1, 1]) b.add('metal', cbox(0.012, 0.03, 1.36, 0.003), COL.dark, at(k * 0.15, -0.12, 0));
  for (const z of [-0.5, 0.5]) b.add('rust', prism(0.006, 0.4, 4), 0xffffff, at(0, 0.2, z));
  const tubeGeo = new THREE.BufferGeometry();
  const parts = [-0.06, 0.06].map((x) => { const g = prism(0.017, 1.28, 6); g.applyMatrix4(at(x, -0.1, 0, Math.PI / 2)); return g; });
  const merged = mergeFlat(parts);
  tubeGeo.copy(merged);
  return { group: b.build(mats, { cast: false }), tubeGeo };
}
function mergeFlat(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  for (const g of list) { const p = g.attributes.position as THREE.BufferAttribute; for (let i = 0; i < p.count; i++) pos.push(p.getX(i), p.getY(i), p.getZ(i)); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); return g;
}

// ------------------------------------------------------------------ arms
/** an arm beam along +Y (hinge at the origin) */
export function armSegment(mats: Mats, L: number, w: number): THREE.Group {
  const b = new FacetBuilder();
  b.add('metal', prism(w * 0.6, w * 1.35, 8, { c: w * 0.12 }), COL.dark, at(0, 0, 0, 0, 0, Math.PI / 2));
  b.add('chrome', prism(w * 0.24, w * 1.6, 6), 0xffffff, at(0, 0, 0, 0, 0, Math.PI / 2));
  for (const k of [-1, 1]) b.add('metal', bolt(w * 0.16, w * 0.1), COL.steel, at(k * w * 0.8, 0, 0, 0, 0, -k * Math.PI / 2));
  // the beam: an octagon tapering from the knuckle to the wrist
  const oct = (y: number, rx: number, rz: number): V3[] => ngon(1, 8, 0.5).map(([x, z]) => [x * rx, y, z * rz] as V3);
  b.add('paint', hull([...oct(w * 0.45, w * 0.48, w * 0.4), ...oct(L * 0.5, w * 0.42, w * 0.36), ...oct(L * 0.93, w * 0.32, w * 0.28)]), COL.olive, undefined, { rep: 0.3 });
  b.add('hazard', hull([...oct(L * 0.14, w * 0.5, w * 0.42), ...oct(L * 0.2, w * 0.495, w * 0.415)]), 0xffffff, undefined, { rep: 0.1 });
  b.add('metal', cbox(w * 0.5, L * 0.3, 0.012, 0.004), COL.steel, at(0, L * 0.55, w * 0.38));
  for (const y of [0.42, 0.68]) for (const x of [-0.17, 0.17]) b.add('metal', bolt(0.008, 0.006), COL.dark, at(x * w, L * y, w * 0.39, Math.PI / 2));
  // the ram and its rod, the feed hose
  b.add('metal', prism(w * 0.15, L * 0.4, 6), COL.dark, at(w * 0.62, L * 0.34, 0));
  b.add('chrome', prism(w * 0.07, L * 0.34, 6), 0xffffff, at(w * 0.62, L * 0.7, 0));
  b.add('metal', cbox(w * 0.3, w * 0.18, w * 0.3, 0.01), COL.dark, at(w * 0.55, L * 0.14, 0));
  b.add('metal', cbox(w * 0.3, w * 0.18, w * 0.3, 0.01), COL.dark, at(w * 0.55, L * 0.87, 0));
  b.add('rubber', tube([[-w * 0.4, L * 0.05, 0.02], [-w * 0.75, L * 0.35, 0.05], [-w * 0.7, L * 0.65, 0.04], [-w * 0.38, L * 0.93, 0.0]], w * 0.09, 12, 5), 0x8a8a8a);
  b.add('lamp', gem(w * 0.09, 5, w * 0.08), 0xff2a1a, at(0, L * 0.8, w * 0.33, Math.PI / 2));
  return b.build(mats);
}
/** the wall / ceiling mount (+Y into the room) */
export function armBase(mats: Mats): THREE.Group {
  const b = new FacetBuilder();
  b.add('paint', extrude(ngon(0.27, 8), 0.05, 0.012), COL.oliveDark, at(0, -0.02, 0, Math.PI / 2));
  b.add('metal', lathe([[0, 0], [0.2, 0], [0.2, 0.05], [0.17, 0.08], [0.16, 0.2], [0.12, 0.25], [0, 0.26]], 8), COL.dark);
  b.add('hazard', band(0.205, 0.205, 0.04, 0.01, 8, 1, Math.PI / 8), 0xffffff, at(0, 0.03, 0), { rep: 0.1 });
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; b.add('metal', bolt(0.016, 0.012), COL.steel, at(Math.cos(a) * 0.235, 0.005, Math.sin(a) * 0.235)); }
  return b.build(mats);
}
/** the claw's wrist and palm (+Y) */
export function clawPalm(mats: Mats): THREE.Group {
  const b = new FacetBuilder();
  b.add('metal', lathe([[0, -0.07], [0.07, -0.07], [0.078, -0.02], [0.095, 0.03], [0.1, 0.085], [0.085, 0.12], [0, 0.13]], 8), COL.dark);
  b.add('paint', band(0.082, 0.082, 0.03, 0.01, 8, 1, Math.PI / 8), COL.olive, at(0, -0.035, 0));
  b.add('chrome', cbox(0.16, 0.035, 0.05, 0.01), 0xffffff, at(0, 0.11, 0));
  b.add('lamp', gem(0.011, 5, 0.01), 0xff3a2a, at(0, 0.07, 0.095, Math.PI / 2));
  b.add('rubber', tube([[0.05, -0.06, -0.05], [0.09, 0.0, -0.07], [0.08, 0.06, -0.06]], 0.01, 5, 4), 0x8a8a8a);
  return b.build(mats);
}
/** one jointed claw finger (hinge at the origin, reaching +Y, curling toward +X) */
export function clawFinger(mats: Mats): THREE.Group {
  const b = new FacetBuilder();
  b.add('metal', prism(0.022, 0.05, 6), COL.steel, at(0, 0, 0, Math.PI / 2));
  b.add('paint', hull([[-0.02, 0.0, -0.018], [0.02, 0.0, -0.018], [-0.02, 0.0, 0.018], [0.02, 0.0, 0.018], [-0.016, 0.085, -0.014], [0.014, 0.085, -0.014], [-0.016, 0.085, 0.014], [0.014, 0.085, 0.014]]), COL.olive, undefined, { rep: 0.1 });
  b.add('metal', prism(0.015, 0.04, 6), COL.dark, at(0, 0.088, 0, Math.PI / 2));
  // the hooked tip, curling inward
  b.add('chrome', hull([[-0.014, 0.09, -0.012], [0.012, 0.09, -0.012], [-0.014, 0.09, 0.012], [0.012, 0.09, 0.012], [-0.01, 0.15, -0.008], [0.004, 0.155, -0.008], [-0.01, 0.15, 0.008], [0.004, 0.155, 0.008], [-0.022, 0.185, 0]]), 0xffffff);
  return b.build(mats);
}
/** the tool head: motor housing with fins, a drill, a lamp (+Y); the saw is separate */
export function toolHead(mats: Mats): THREE.Group {
  const b = new FacetBuilder();
  b.add('metal', lathe([[0, -0.07], [0.068, -0.07], [0.074, 0.02], [0.086, 0.05], [0.086, 0.14], [0.06, 0.17], [0, 0.175]], 8), COL.dark);
  for (const y of [0.07, 0.095, 0.12]) b.add('metal', band(0.09, 0.09, 0.008, 0.012, 8, 1, Math.PI / 8), COL.steel, at(0, y, 0));
  b.add('paint', band(0.076, 0.076, 0.03, 0.008, 8, 1, Math.PI / 8), COL.olive, at(0, -0.03, 0));
  b.add('chrome', jitter(lathe([[0, 0], [0.018, 0.01], [0.016, 0.05], [0.012, 0.09], [0.006, 0.12], [0, 0.135]], 5), 0.002, 4), 0xffffff, at(0.05, 0.17, 0));
  b.add('metal', prism(0.026, 0.05, 6), COL.dark, at(0.05, 0.18, 0));
  b.add('metal', lathe([[0.012, 0], [0.03, 0.0], [0.034, 0.03], [0.03, 0.035]], 6), COL.dark, at(-0.06, 0.15, 0.04, Math.PI / 2 - 0.3));
  b.add('lamp', gem(0.02, 6, 0.012), 0xfff0d0, at(-0.06, 0.162, 0.07, Math.PI / 2 - 0.3));
  b.add('metal', prism(0.011, 0.17, 6), COL.steel, at(-0.02, 0.27, 0.02, Math.PI / 2));
  return b.build(mats);
}
/** a toothed saw blade in the XY plane */
export function sawBlade(mats: Mats): THREE.Group {
  const b = new FacetBuilder();
  b.add('chrome', starGeo(0.112, 0.094, 24, 0.006, 0.012, 0.45), 0xffffff);
  b.add('metal', prism(0.028, 0.016, 6), COL.dark, at(0, 0, 0, Math.PI / 2));
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; b.add('metal', cbox(0.04, 0.008, 0.009, 0.002), COL.steel, at(Math.cos(a) * 0.06, Math.sin(a) * 0.06, 0, 0, 0, a)); }
  return b.build(mats);
}

// ------------------------------------------------------------------ press, hatch
/** the press head: a riveted slab with a hazard skirt, gussets, two chrome rams up into the ceiling */
export function pressModel(mats: Mats): THREE.Group {
  const b = new FacetBuilder();
  b.add('metal', cbox(1.3, 0.34, 1.0, 0.04), COL.dark, at(0, 0.29, 0), { rep: 0.5 });
  b.add('hazard', cbox(1.34, 0.12, 1.04, 0.02), 0xffffff, at(0, 0.06, 0), { rep: 0.24 });
  b.add('rust', cbox(1.4, 0.07, 1.1, 0.02), 0xffffff, at(0, 0.49, 0));
  for (const x of [-0.5, -0.17, 0.17, 0.5]) b.add('paint', extrude([[-0.45, 0], [0.45, 0], [0.2, 0.22], [-0.2, 0.22]], 0.04, 0.008), COL.oliveDark, at(x, 0.52, 0, 0, Math.PI / 2));
  for (let i = 0; i < 7; i++) for (const zz of [0.505, -0.505]) b.add('metal', bolt(0.018, 0.012), COL.steel, at(-0.54 + i * 0.18, 0.3, zz, zz > 0 ? Math.PI / 2 : -Math.PI / 2));
  for (const k of [-1, 1]) {
    b.add('chrome', prism(0.085, 3.4, 8), 0xffffff, at(k * 0.38, 0.55 + 1.7, 0));
    b.add('metal', lathe([[0.15, 0], [0.15, 0.08], [0.12, 0.14], [0.1, 0.2]], 8), COL.dark, at(k * 0.38, 0.52, 0));
  }
  return b.build(mats);
}
/** the hatch shutter: steel slats and a hazard foot */
export function shutterModel(mats: Mats): THREE.Group {
  const b = new FacetBuilder();
  const { HATCH_W: w, HATCH_H: h } = ROOM;
  for (let i = 0; i < 9; i++) b.add('metal', cbox(w, h / 9 - 0.012, 0.06, 0.018), i % 2 ? 0x7a7e80 : 0x6a6e70, at(0, i * (h / 9) + h / 18, 0), { grain: 'x' });
  b.add('hazard', cbox(w + 0.01, 0.13, 0.075, 0.012), 0xffffff, at(0, 0.065, 0.004));
  for (const x of [-0.35, 0.35]) b.add('metal', cbox(0.12, 0.03, 0.05, 0.01), COL.dark, at(x, 0.32, 0.05));
  return b.build(mats);
}

// ------------------------------------------------------------------ fixtures and dressing
/** the main breaker on the left wall (world space): the box; the lever is separate (it throws) */
export function breakerModel(mats: Mats): THREE.Group {
  const b = new FacetBuilder();
  const x = -ROOM.W + 0.01, z = -1.3;
  b.add('paint', cbox(0.16, 0.8, 0.56, 0.03), COL.olive, at(x + 0.08, 1.25, z));
  b.add('paint', cbox(0.03, 0.7, 0.46, 0.012), COL.oliveDark, at(x + 0.17, 1.25, z));
  for (let i = 0; i < 6; i++) b.add('metal', cbox(0.012, 0.012, 0.3, 0.003), COL.dark, at(x + 0.19, 1.47 - i * 0.03, z));
  b.add('bakelite', cbox(0.04, 0.24, 0.12, 0.01), 0xffffff, at(x + 0.2, 1.13, z));
  for (const dz of [-0.04, 0.04]) b.add('copper', cbox(0.03, 0.1, 0.012, 0.003), 0xffffff, at(x + 0.23, 1.2, z + dz));
  for (const [y, c] of [[1.56, 0xff3018], [1.56, 0x44ff66]] as [number, number][]) b.add('metal', prism(0.018, 0.02, 6), COL.dark, at(x + 0.19, y, z + (c === 0xff3018 ? -0.12 : 0.12), 0, 0, Math.PI / 2));
  for (const [dy, dz] of [[0.38, 0.26], [0.38, -0.26], [-0.38, 0.26], [-0.38, -0.26]]) b.add('metal', bolt(0.014, 0.01), COL.steel, at(x + 0.165, 1.25 + dy, z + dz, 0, 0, -Math.PI / 2));
  // conduit up into the ceiling
  b.add('metal', prism(0.03, ROOM.H - 1.65, 6), COL.steel, at(x + 0.08, (ROOM.H + 1.65) / 2, z - 0.15));
  b.add('metal', cbox(0.08, 0.06, 0.08, 0.01), COL.dark, at(x + 0.08, 1.67, z - 0.15));
  return b.build(mats);
}
/** the knife switch handle (pivot at the origin, lever along +Y, throws round X) */
export function leverModel(mats: Mats): THREE.Group {
  const b = new FacetBuilder();
  b.add('metal', prism(0.02, 0.06, 6), COL.dark, at(0, 0, 0, 0, 0, Math.PI / 2));
  for (const dz of [-0.04, 0.04]) b.add('copper', cbox(0.01, 0.2, 0.024, 0.003), 0xffffff, at(0, 0.1, dz));
  b.add('metal', cbox(0.03, 0.03, 0.12, 0.006), COL.steel, at(0, 0.2, 0));
  b.add('bakelite', lathe([[0, 0], [0.018, 0], [0.022, 0.03], [0.02, 0.1], [0.024, 0.12], [0, 0.13]], 6), 0xffffff, at(0, 0.21, 0));
  return b.build(mats);
}

/** a green phosphor monitor on a steel cart (local: screen faces +Z, floor at y=0); the screen is separate */
export function monitorModel(mats: Mats): { group: THREE.Group; screenAt: THREE.Matrix4; sw: number; sh: number } {
  const b = new FacetBuilder();
  // the cart
  for (const [x, z] of [[-0.24, -0.2], [0.24, -0.2], [-0.24, 0.2], [0.24, 0.2]]) {
    b.add('metal', prism(0.016, 0.72, 6), COL.steel, at(x, 0.42, z));
    b.add('rubber', prism(0.035, 0.03, 8), 0x9a9a9a, at(x, 0.035, z, 0, 0, Math.PI / 2));
    b.add('metal', cbox(0.04, 0.05, 0.03, 0.006), COL.dark, at(x, 0.07, z));
  }
  b.add('metal', cbox(0.56, 0.03, 0.48, 0.008), COL.steel, at(0, 0.78, 0));
  b.add('metal', cbox(0.56, 0.025, 0.48, 0.008), COL.steel, at(0, 0.24, 0));
  b.add('paint', cbox(0.36, 0.14, 0.3, 0.02), COL.oliveDark, at(-0.05, 0.32, 0));
  // the set: an olive enamel box with a deep bell behind, a recessed bezel, knobs, a tag
  const sw = 0.3, sh = 0.23;
  b.add('paint', cbox(0.46, 0.4, 0.3, 0.035), COL.beige, at(0, 1.0, 0.0), { rep: 0.3 });
  b.add('paint', hull([[-0.2, 0.84, -0.15], [0.2, 0.84, -0.15], [-0.2, 1.17, -0.15], [0.2, 1.17, -0.15], [-0.11, 0.9, -0.38], [0.11, 0.9, -0.38], [-0.11, 1.1, -0.38], [0.11, 1.1, -0.38]]), COL.beige, undefined, { rep: 0.3 });
  b.add('paint', extrude([[-0.215, -0.17], [0.215, -0.17], [0.215, 0.17], [-0.215, 0.17]], 0.03, 0.008, [[[-sw / 2, -sh / 2], [sw / 2, -sh / 2], [sw / 2, sh / 2], [-sw / 2, sh / 2]]]), COL.oliveDark, at(0, 1.02, 0.155));
  for (let i = 0; i < 2; i++) b.add('bakelite', lathe([[0, 0], [0.022, 0], [0.024, 0.012], [0.018, 0.026], [0, 0.028]], 6), 0xffffff, at(0.17, 0.92 + i * 0.0, 0.16 - i * 0.0, Math.PI / 2));
  b.add('bakelite', lathe([[0, 0], [0.016, 0], [0.018, 0.01], [0.012, 0.02], [0, 0.022]], 6), 0xffffff, at(-0.17, 0.875, 0.16, Math.PI / 2));
  for (let i = 0; i < 5; i++) b.add('metal', cbox(0.05, 0.006, 0.01, 0.002), COL.dark, at(-0.08 + i * 0.0, 1.19, 0.06 - i * 0.04));
  b.add('rubber', tube([[0.05, 0.95, -0.36], [0.12, 0.6, -0.3], [0.2, 0.25, -0.25], [0.35, 0.02, -0.4], [0.7, 0.02, -0.7]], 0.01, 10, 4), 0x9a9a9a);
  const screenAt = at(0, 1.02, 0.152);
  return { group: b.build(mats), screenAt, sw, sh };
}

/** a steel instrument stand with a tray of tools (local, floor y=0) */
export function trayModel(mats: Mats): THREE.Group {
  const b = new FacetBuilder();
  b.add('metal', prism(0.02, 0.9, 6), COL.steel, at(0, 0.47, 0));
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; b.add('metal', cbox(0.03, 0.025, 0.3, 0.006), COL.steel, at(Math.sin(a) * 0.14, 0.025, Math.cos(a) * 0.14, 0, a)); b.add('rubber', prism(0.02, 0.025, 6), 0x9a9a9a, at(Math.sin(a) * 0.28, 0.012, Math.cos(a) * 0.28)); }
  b.add('chrome', extrude([[-0.24, -0.16], [0.24, -0.16], [0.24, 0.16], [-0.24, 0.16]], 0.03, 0.006, [[[-0.22, -0.14], [0.22, -0.14], [0.22, 0.14], [-0.22, 0.14]]]), 0xd0d0d0, at(0, 0.93, 0, Math.PI / 2));
  b.add('metal', cbox(0.46, 0.008, 0.3, 0.002), COL.steel, at(0, 0.918, 0));
  // tools: a scalpel, pliers, a mallet, a coil of wire, a sponge
  b.add('chrome', hull([[-0.1, 0.926, -0.05], [0.04, 0.926, -0.05], [0.04, 0.93, -0.045], [-0.1, 0.93, -0.045], [0.08, 0.926, -0.048]]), 0xffffff);
  b.add('chrome', cbox(0.18, 0.012, 0.012, 0.003), 0xffffff, at(0.0, 0.93, 0.03, 0, 0.3));
  b.add('chrome', cbox(0.16, 0.012, 0.012, 0.003), 0xffffff, at(0.0, 0.93, 0.04, 0, -0.2));
  b.add('wood', cbox(0.2, 0.02, 0.02, 0.005), COL.oak, at(0.06, 0.935, -0.1, 0, 0.5), { grain: 'x' });
  b.add('wood', cbox(0.05, 0.05, 0.08, 0.008), COL.oakDark, at(0.15, 0.95, -0.05, 0, 0.5));
  b.add('copper', band(0.04, 0.04, 0.02, 0.012, 7), 0xffffff, at(-0.14, 0.935, 0.07));
  b.add('sponge', jitter(cbox(0.1, 0.035, 0.07, 0.012), 0.008, 9), 0xffffff, at(-0.12, 0.94, -0.06, 0, 0.3));
  return b.build(mats);
}

/** a galvanised bucket of brine with the sponge floating in it (local, floor y=0) */
export function bucketModel(mats: Mats): THREE.Group {
  const b = new FacetBuilder();
  b.add('metal', lathe([[0, 0], [0.13, 0], [0.135, 0.01], [0.165, 0.3], [0.172, 0.305], [0.168, 0.31], [0.155, 0.31], [0.12, 0.02], [0, 0.02]], 9), 0xa8aca8);
  for (const y of [0.1, 0.22]) b.add('metal', band(0.15 + y * 0.09, 0.15 + y * 0.09, 0.012, 0.006, 9), 0x8a8e8e, at(0, y, 0));
  b.add('rubber', lathe([[0, 0], [0.16, 0], [0, 0.001]], 9), 0x3a4a48, at(0, 0.26, 0));
  b.add('sponge', jitter(cbox(0.12, 0.05, 0.09, 0.015), 0.01, 3), 0xffffff, at(0.02, 0.27, 0.01, 0.1, 0.4));
  b.add('metal', tube([[-0.168, 0.29, 0], [-0.12, 0.42, 0], [0, 0.46, 0], [0.12, 0.42, 0], [0.168, 0.29, 0]], 0.005, 8, 3), 0x8a8e8e);
  return b.build(mats);
}

/** the floor drain: a square frame and bars, sunk flush (local, floor y=0) */
export function drainModel(mats: Mats): THREE.Group {
  const b = new FacetBuilder();
  b.add('rubber', cbox(0.36, 0.01, 0.36, 0.002), 0x202020, at(0, 0.001, 0));
  b.add('rust', extrude([[-0.2, -0.2], [0.2, -0.2], [0.2, 0.2], [-0.2, 0.2]], 0.02, 0.004, [[[-0.17, -0.17], [0.17, -0.17], [0.17, 0.17], [-0.17, 0.17]]]), 0xd0c0b0, at(0, 0.008, 0, Math.PI / 2));
  for (let i = 0; i < 7; i++) b.add('rust', cbox(0.34, 0.016, 0.022, 0.004), 0xb0a090, at(0, 0.008, -0.15 + i * 0.05));
  return b.build(mats);
}

/** a stencilled plate (text in EB Garamond) on a riveted backing */
export function signModel(mats: Mats, lines: string[], w: number, h: number, o: { bg?: number; ink?: number; px?: [number, number] } = {}): THREE.Group {
  const g = new THREE.Group();
  const b = new FacetBuilder();
  b.add('metal', cbox(w + 0.02, h + 0.02, 0.012, 0.004), COL.dark, at(0, 0, -0.006));
  g.add(b.build(mats, { cast: false }));
  const px = o.px ?? [Math.round(w * 220), Math.round(h * 220)];
  const tex = plateTex(lines, { w: px[0], h: px[1], bg: o.bg, ink: o.ink });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: tex }));
  m.position.z = 0.001;
  m.receiveShadow = true;
  g.add(m);
  return g;
}

/** a pipe run with flanges and bolts along a polyline of straight legs (world space) */
export function pipeRun(b: FacetBuilder, pts: V3[], r: number, mat: 'rust' | 'paint' | 'metal', color: number, flangeEvery = 1.1) {
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], c = pts[i + 1];
    const len = Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    b.add(mat, prism(r, len, 8, { c: 0 }), color, along(a, c), { rep: 0.5 });
    const n = Math.max(1, Math.floor(len / flangeEvery));
    for (let k = 1; k < n; k++) {
      const t = k / n, p: V3 = [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t, a[2] + (c[2] - a[2]) * t];
      b.add('metal', prism(r * 1.45, 0.035, 8, { c: 0.006 }), COL.dark, along([p[0] - (c[0] - a[0]) / len * 0.02, p[1] - (c[1] - a[1]) / len * 0.02, p[2] - (c[2] - a[2]) / len * 0.02], [p[0] + (c[0] - a[0]) / len * 0.02, p[1] + (c[1] - a[1]) / len * 0.02, p[2] + (c[2] - a[2]) / len * 0.02]));
    }
    if (i > 0) b.add(mat, lathe([[0, -r * 1.2], [r * 1.25, -r * 1.2], [r * 1.25, r * 1.2], [0, r * 1.2]], 8), color, at(a[0], a[1], a[2]), { rep: 0.5 });
  }
}
/** a valve handwheel facing +Z (local) */
export function valveWheel(b: FacetBuilder, m: THREE.Matrix4, r = 0.1, color = COL.red) {
  const ring = extrude(ngon(r, 10, 0), 0.018, 0.004, [ngon(r - 0.016, 10, 0)]);
  b.add('paint', ring, color, m.clone(), { rep: 0.1 });
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; b.add('paint', cbox(r - 0.01, 0.012, 0.012, 0.003), color, m.clone().multiply(at(Math.cos(a) * r * 0.48, Math.sin(a) * r * 0.48, 0, 0, 0, a))); }
  b.add('metal', prism(0.018, 0.05, 6), COL.dark, m.clone().multiply(at(0, 0, -0.01, Math.PI / 2)));
}

export { FacetBuilder, at, cbox, prism, lathe, extrude, ngon, tube, band, gem, bolt, hull, jitter };
