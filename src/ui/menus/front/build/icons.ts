// THE FACILITY WORKS' ICONS (round 26, part B): little 3D models for the room close-up's floating keys and the
// stat totals, registered into the machine kit's icon set (machine/decor.ts ICON_EXTRA) like the lab's and the
// trades' (designed at 22 units: worn enamel, steel, brass and glass under the panels' light).
//   bunk    a steel bunk, a striped mattress and a pillow           (rest)
//   mug     an enamel mug with a chipped rim, steam                 (morale)
//   pills   an amber pill bottle, a white cap, two capsules         (sanity)
//   skip    a yellow skip, rubble heaped in it                       (clear the debris, take a piece out)
//   roller  a paint roller loaded with green, a drip                (finishes)
//   mop     a yellow mop bucket with its wringer, the mop in it      (clean)
import * as THREE from 'three';
import { ICON_EXTRA } from '../../../machine/decor';
import { Mold, M, STEEL, CHROME, RUBBER, PLASTIC, PAINT, GLASS, PAPER } from '../../../touch/stage3d';
import { fcyl, fbox, frod, gem, flathe } from '../../../touch/facet';
import { R90 } from '../../../machine/parts';

const PI = Math.PI;

ICON_EXTRA.set('bunk', {
  build(m: Mold, g: THREE.Group, u: number) {
    for (const x of [-8, 8]) for (const z of [-3, 3]) m.add(fcyl(0.7 * u, 18 * u, 6, 0.7 * u, 0.2), M(x * u, 0, z * u), 0x4a5a4a, STEEL);
    for (const y of [-5, 4]) {
      m.add(fbox(17 * u, 1 * u, 7 * u, 0.1), M(0, y * u, 0), 0x3a4a3a, STEEL);
      m.add(fbox(16 * u, 2.4 * u, 6.4 * u, 0.3), M(0, (y + 1.6) * u, 0), (x) => (Math.round(x / u) % 3 === 0 ? 0x5a6a8a : 0xe0dccc), PAPER);
      m.add(fbox(4 * u, 1.6 * u, 5.6 * u, 0.4), M(-5.6 * u, (y + 3.4) * u, 0), 0xf4f0e4, PAPER);
      m.add(fbox(8 * u, 0.8 * u, 6.6 * u, 0.3), M(3 * u, (y + 3) * u, 0), 0x4a5a7a, PAPER);
    }
    for (let i = 0; i < 3; i++) m.add(fbox(0.5 * u, 0.5 * u, 5 * u, 0), M(9 * u, (-6 + i * 2.6) * u, 3 * u, 0, 0, 0), 0x6a7a6a, CHROME);
    g.rotation.x = 0.35; g.rotation.y = -0.5;
  },
  glow: [0.7, 0.7, 0.9],
});
ICON_EXTRA.set('mug', {
  build(m: Mold, g: THREE.Group, u: number) {
    m.add(flathe([[0, -7], [5.6, -7], [6, -6.4], [6, 6], [5.2, 6.4]].map(([r, y]) => [r * u, y * u]), 12), M(0, -1 * u, 0), (_x, y) => (y > 4.6 * u ? 0x2a3a5a : 0xece6d8), PAINT);
    m.add(fcyl(5 * u, 0.6 * u, 12, 5 * u, 0), M(0, 4.6 * u, 0), 0x5a3a20, PAPER);
    m.add(flathe([[2.2, 0], [3.4, 0], [3.4, 1.2], [2.2, 1.2]].map(([r, y]) => [r * u, y * u]), 10), M(6.4 * u, -1 * u, 0, R90), 0xece6d8, PAINT);
    m.add(gem(0.9 * u, 0, 0.2, 4), M(3 * u, 5.6 * u, 3.8 * u), 0x2a2a2a, PAINT);
    for (let i = 0; i < 3; i++) m.add(gem((1.4 - i * 0.3) * u, 1, 0.1, 9 + i), M((-1.5 + i * 1.5 + Math.sin(i * 2) * 1.2) * u, (8 + i * 2.4) * u, 0), 0xe8f0f4, GLASS, 0.4);
    g.rotation.x = 0.3; g.rotation.y = -0.4;
  },
  glow: [0.9, 0.8, 0.6],
  free: true,
});
ICON_EXTRA.set('pills', {
  build(m: Mold, g: THREE.Group, u: number) {
    m.add(fcyl(4.6 * u, 12 * u, 12, 4.6 * u, 0.15), M(-1.5 * u, -1 * u, 0), 0xc8701a, GLASS, 0.25);
    m.add(fcyl(4.9 * u, 3.4 * u, 14, 4.9 * u, 0.2), M(-1.5 * u, 6.6 * u, 0), (x) => (Math.round(x / u * 2) % 2 ? 0xf4f0e8 : 0xe0dcd0), PLASTIC);
    m.add(fbox(9.4 * u, 6 * u, 0.4 * u, 0.1), M(-1.5 * u, -1.6 * u, 4.4 * u), (_x, y) => (Math.round(y / u) % 2 ? 0xe8e0c8 : 0xd8d0b8), PAPER);
    m.add(fbox(5 * u, 0.8 * u, 0.3 * u, 0), M(-1.5 * u, -0.4 * u, 4.7 * u), 0xc8261e, PAINT);
    for (const [x, y, r, c] of [[6.4, -6, 0.4, 0xd83a2a], [8.6, -6.6, -0.6, 0x3a6ad8]] as [number, number, number, number][]) {
      m.add(fcyl(1.3 * u, 2.6 * u, 8, 1.3 * u, 0.5), M(x * u, y * u, 2 * u, 0, 0, PI / 2 + r), c, PLASTIC);
      m.add(fcyl(1.3 * u, 2.6 * u, 8, 1.3 * u, 0.5), M((x + Math.cos(r) * 2.6) * u, (y + Math.sin(r) * 2.6) * u, 2 * u, 0, 0, PI / 2 + r), 0xf4f0e8, PLASTIC);
    }
    g.rotation.x = 0.25; g.rotation.y = 0.35;
  },
  glow: [1, 0.8, 0.5],
  free: true,
});
ICON_EXTRA.set('skip', {
  build(m: Mold, g: THREE.Group, u: number) {
    // the body: a trapezoid of yellow steel, ribs, a dark inside, rubble and a plank heaped over the rim
    m.add(fbox(20 * u, 8 * u, 9 * u, 0.12), M(0, -3 * u, 0), (_x, y, _z, _nx, ny, nz) => (ny > 0.5 ? 0x2a2418 : nz > 0.5 ? 0xd8a020 : 0xb88818), PAINT);
    for (const sx of [-1, 1]) m.add(fbox(3 * u, 8.4 * u, 9.4 * u, 0.1), M(sx * 10.2 * u, -2.6 * u, 0, 0, 0, sx * 0.35), 0xc89018, PAINT);
    for (let i = 0; i < 4; i++) m.add(fbox(0.8 * u, 7.6 * u, 0.8 * u, 0), M((-6 + i * 4) * u, -3 * u, 4.8 * u), 0xa87810, PAINT);
    m.add(fbox(4 * u, 1.2 * u, 0.3 * u, 0), M(-7 * u, -1 * u, 4.9 * u), (x) => (Math.round(x / u) % 2 ? 0x14120c : 0xe8c020), PAINT);
    for (let i = 0; i < 8; i++) m.add(gem((1.3 + (i % 3) * 0.5) * u, 0, 0.3, 30 + i), M((-6 + i * 1.8) * u, (1.6 + (i % 2) * 1.2) * u, ((i % 3) - 1) * 2 * u), i % 3 ? 0x8a847a : 0x9a948a, PAINT);
    m.add(fbox(12 * u, 0.9 * u, 1.6 * u, 0.1), M(1 * u, 3.4 * u, 1 * u, 0, 0.3, 0.3), 0x8a6a40, PAPER);
    g.rotation.x = 0.4; g.rotation.y = -0.45;
  },
  glow: [1, 0.85, 0.4],
});
ICON_EXTRA.set('roller', {
  build(m: Mold, g: THREE.Group, u: number) {
    m.add(fcyl(3 * u, 12 * u, 12, 3 * u, 0.2), M(1 * u, 6 * u, 0, 0, 0, PI / 2), (_x, _y, z) => (Math.abs(z) > 2.6 * u ? 0x5a7a4a : 0x6a8a5a), PAPER);
    for (const x of [-5.4, 7.4]) m.add(fcyl(1 * u, 0.8 * u, 8, 1 * u, 0.2), M(x * u, 6 * u, 0, 0, 0, PI / 2), 0x9a9e9a, STEEL);
    m.add(frod([7.6 * u, 6 * u, 0], [9 * u, 2 * u, 0], 0.45 * u), null, 0xb0b4b0, CHROME);
    m.add(frod([9 * u, 2 * u, 0], [1 * u, -1 * u, 0], 0.45 * u), null, 0xb0b4b0, CHROME);
    m.add(fcyl(1.3 * u, 9 * u, 8, 1.1 * u, 0.3), M(-2.4 * u, -4.4 * u, 0, 0, 0, -0.85), 0x8a2a1a, RUBBER);
    m.add(gem(0.9 * u, 1, 0.1, 6), M(-1 * u, 2.2 * u, 1 * u), 0x6a8a5a, GLASS, 0.3);
    g.rotation.x = 0.2; g.rotation.y = 0.5;
  },
  glow: [0.6, 0.9, 0.6],
  free: true,
});
ICON_EXTRA.set('mop', {
  build(m: Mold, g: THREE.Group, u: number) {
    m.add(fbox(14 * u, 8 * u, 9 * u, 0.25), M(0, -5 * u, 0), (_x, _y, _z, _nx, ny) => (ny > 0.5 ? 0x5a8aa8 : 0xe8c020), PLASTIC);
    m.add(fbox(6 * u, 4 * u, 8 * u, 0.2), M(4 * u, 0.6 * u, 0), 0x3a3a34, STEEL);
    m.add(fcyl(0.5 * u, 4 * u, 6, 0.5 * u, 0.2), M(7.4 * u, 2 * u, 0, 0, 0, -0.5), 0x2a2a2a, RUBBER);
    for (const [x, z] of [[-5, -3], [-5, 3], [5, -3], [5, 3]]) m.add(fcyl(1 * u, 1 * u, 8, 1 * u, 0.3), M(x * u, -9.4 * u, z * u, R90), 0x1a1a1a, RUBBER);
    m.add(frod([-3 * u, -2 * u, 0], [-6 * u, 12 * u, -1 * u], 0.6 * u), null, 0x9a7a4a, PAINT);
    for (let i = 0; i < 6; i++) m.add(frod([-3 * u, -2 * u, 0], [(-4.6 + i * 0.6) * u, -6 * u, ((i % 3) - 1) * u], 0.5 * u), null, 0xe8e0c8, PAPER);
    g.rotation.x = 0.3; g.rotation.y = -0.4;
  },
  glow: [0.6, 0.8, 1],
});
ICON_EXTRA.set('laurel', {
  build(m: Mold, g: THREE.Group, u: number) {
    // a brass medal on a ribbon: the laurel's leaves round the rim, the Institute's bishop raised in the middle
    m.add(fbox(5 * u, 7 * u, 0.6 * u, 0.1), M(0, 6.5 * u, -0.6 * u), (x) => (Math.round(x / u * 1.5) % 2 ? 0x2a4a8a : 0xc83a2a), PAPER);
    m.add(fcyl(7 * u, 1.4 * u, 16, 7 * u, 0.25), M(0, -2 * u, 0, R90), 0xc8a050, STEEL);
    m.add(fcyl(5.4 * u, 1.8 * u, 16, 5.4 * u, 0.2), M(0, -2 * u, 0.2 * u, R90), 0xe0b860, STEEL);
    for (let i = 0; i < 12; i++) { const a = i / 12 * PI * 2; m.add(gem(1 * u, 0, 0.1, 40 + i), M(Math.cos(a) * 6.2 * u, -2 * u + Math.sin(a) * 6.2 * u, 0.9 * u, 0, 0, a), 0xa88430, STEEL); }
    m.add(fcyl(1.2 * u, 3 * u, 8, 1.8 * u, 0.3), M(0, -2.6 * u, 1.4 * u), 0xf0d080, STEEL);
    m.add(gem(1.3 * u, 0, 0.1, 9), M(0, 0.2 * u, 1.4 * u), 0xf0d080, STEEL);
    g.rotation.x = 0.15; g.rotation.y = 0.3;
  },
  glow: [1, 0.85, 0.5],
  free: true,
});
ICON_EXTRA.set('vitrine', {
  build(m: Mold, g: THREE.Group, u: number) {
    m.add(fbox(12 * u, 8 * u, 10 * u, 0.15), M(0, -6 * u, 0), (_x, _y, _z, _nx, ny) => (ny > 0.5 ? 0x6a1a1a : 0x4a3424), PAINT);
    for (const [x, z] of [[-5.6, -4.6], [5.6, -4.6], [-5.6, 4.6], [5.6, 4.6]]) m.add(fbox(0.8 * u, 10 * u, 0.8 * u, 0.1), M(x * u, 3 * u, z * u), 0xc8a050, STEEL);
    m.add(fbox(12.6 * u, 0.9 * u, 10.6 * u, 0.1), M(0, 8.2 * u, 0), 0xc8a050, STEEL);
    m.add(fbox(11 * u, 9.6 * u, 9 * u, 0.05), M(0, 3 * u, 0), 0xa8d8e8, GLASS, 0.15);
    m.add(gem(2.6 * u, 1, 0.2, 7), M(0, 0.4 * u, 0), 0x7ad8a0, GLASS, 0.7);
    m.add(fcyl(1.2 * u, 1.6 * u, 8, 1.6 * u, 0.2), M(0, -1.6 * u, 0), 0xc8a050, STEEL);
    g.rotation.x = 0.35; g.rotation.y = -0.5;
  },
  glow: [0.7, 1, 0.8],
});
ICON_EXTRA.set('cage', {
  build(m: Mold, g: THREE.Group, u: number) {
    m.add(fbox(18 * u, 2.4 * u, 12 * u, 0.15), M(0, -7.5 * u, 0), 0x6a6a62, PAINT);
    m.add(fbox(16 * u, 0.6 * u, 10 * u, 0.1), M(0, -6.1 * u, 0), (x, _y, z) => ((Math.round(x / u) + Math.round(z / u)) % 3 ? 0x5a7a3a : 0x7a6a3a), PAPER);
    for (const x of [-8.4, 8.4]) for (const z of [-5.4, 5.4]) m.add(fbox(0.9 * u, 13 * u, 0.9 * u, 0.1), M(x * u, 0, z * u), 0x3a3e40, STEEL);
    m.add(fbox(17.6 * u, 1.4 * u, 11.6 * u, 0.1), M(0, 6.4 * u, 0), 0x3a3e40, STEEL);
    m.add(fbox(16.6 * u, 12 * u, 10.6 * u, 0.04), M(0, 0, 0), 0xa8d8e8, GLASS, 0.1);
    m.add(fbox(14 * u, 0.6 * u, 2 * u, 0.1), M(0, 5.4 * u, 4 * u), 0xfff0c8, GLASS, 1);
    m.add(gem(3 * u, 1, 0.2, 5), M(-1 * u, -3.4 * u, 0), 0xd8c8b0, PAINT);
    m.add(gem(1.8 * u, 1, 0.2, 6), M(2.4 * u, -1.4 * u, 0.6 * u), 0xd8c8b0, PAINT);
    g.rotation.x = 0.35; g.rotation.y = -0.45;
  },
  glow: [0.8, 0.9, 1],
});
