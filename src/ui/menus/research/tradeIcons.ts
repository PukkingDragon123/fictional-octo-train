// THE TRADES' KEYS (round 25): little 3D models for the lattice's floating branch keys (research/lattice.ts), the
// trades the user levels by doing the work (src/game/professions.ts). Registered into the machine kit's icon set
// (machine/decor.ts ICON_EXTRA) like the lab's room keys (menus/labIcons.ts): designed at 22 units, worn paint,
// steel, brass, rubber and glass under the panels' light.
//   club    a scarred bat with nails driven through its head, tape on the grip           (Combat)
//   medkit  a dented first-aid tin, the red cross on its lid, a latch and a strap         (Medic)
//   pot     a steel stock pot with a lid, handles and steam coming off it                 (Cook)
//   sprout  a clay pot of dark soil with a seedling, two leaves and a bud                 (Botanist)
//   pail    a galvanised feed pail full of grain, a wire bail and a wooden grip           (Handler)
import * as THREE from 'three';
import { ICON_EXTRA } from '../../machine/decor';
import { Mold, M, STEEL, CHROME, BRASS, RUBBER, PAINT, GLASS, PAPER } from '../../touch/stage3d';
import { fcyl, fbox, fring, frod, gem, flathe } from '../../touch/facet';
import { R90 } from '../../machine/parts';

const PI = Math.PI;

ICON_EXTRA.set('club', {
  build(m: Mold, g: THREE.Group, u: number) {
    // the bat along the diagonal: a taped grip, a knob, the barrel swelling out, nails through the head
    m.add(flathe([[0, -10], [1.5, -10], [1.5, -9.2], [1.0, -8.6], [1.0, -2], [2.3, 4], [2.8, 8.5], [2.2, 10], [0, 10.2]].map(([r, y]) => [r * u, y * u]), 9), M(0, 0, 0, 0, 0, -0.62), (_x, y) => (y < -2.5 * u ? 0x3a3430 : 0x9a6a3c), PAINT);
    for (let i = 0; i < 4; i++) m.add(fring(1.08 * u, 0.22 * u, 9, 3), M(Math.sin(0.62) * (-8 + i * 1.5) * u, Math.cos(0.62) * (-8 + i * 1.5) * u, 0, R90, 0, -0.62), 0x2a2a28, RUBBER);
    const nails: [number, number][] = [[6, 0], [7.5, 2.1], [8.5, -1.9], [5, -2.3], [9.4, 0.8]];
    for (const [d, a] of nails) {
      const cx = Math.sin(0.62) * d * u, cy = Math.cos(0.62) * d * u;
      m.add(frod([cx, cy, 0], [cx + Math.cos(a) * 4.4 * u * Math.cos(0.62), cy - Math.cos(a) * 4.4 * u * Math.sin(0.62), Math.sin(a) * 4.4 * u], 0.3 * u, 4), null, 0xb8bcb4, CHROME);
    }
    m.add(gem(0.9 * u, 0, 0.2, 5), M(Math.sin(0.62) * 7 * u, Math.cos(0.62) * 7 * u, 2.4 * u), 0x8a1a12, PAINT);
    g.rotation.x = 0.2;
  },
  glow: [0.6, 0.8, 0.6],
});

ICON_EXTRA.set('medkit', {
  build(m: Mold, g: THREE.Group, u: number) {
    // the tin: a white enamel body, a lid seam, a red cross raised on the lid, a steel latch and hinges, a strap
    m.add(fbox(18 * u, 12 * u, 8 * u, 0.12), M(0, -1 * u, 0), (_x, y, _z, _nx, ny) => (ny > 0.5 ? 0xece6d8 : y > 3.6 * u ? 0xd8d0c0 : 0xe4ddce), PAINT);
    m.add(fbox(18.4 * u, 0.8 * u, 8.4 * u, 0.1), M(0, 3.4 * u, 0), 0xb0aca0, STEEL);
    m.add(fbox(6 * u, 2 * u, 0.8 * u, 0.1), M(0, -0.5 * u, 4.2 * u), 0xc8261e, PAINT, 0.2);
    m.add(fbox(2 * u, 6 * u, 0.8 * u, 0.1), M(0, -0.5 * u, 4.2 * u), 0xc8261e, PAINT, 0.2);
    m.add(fbox(2.4 * u, 1.6 * u, 1.2 * u, 0.2), M(0, 4.6 * u, 3.8 * u), 0xa8aca8, CHROME);
    for (const x of [-6, 6]) m.add(fcyl(0.6 * u, 2.4 * u, 6, 0.6 * u, 0.2), M(x * u, 3.4 * u, -4.2 * u, 0, 0, PI / 2), 0x8a8e88, STEEL);
    m.add(fbox(14 * u, 1.4 * u, 0.6 * u, 0.1), M(0, -6.6 * u, 4.1 * u), 0x5a4a32, RUBBER);
    for (const x of [-7, 7]) m.add(fcyl(0.5 * u, 0.4 * u, 6, 0.5 * u, 0.2), M(x * u, -6.6 * u, 4.4 * u, R90), 0xc8a050, BRASS);
    g.rotation.x = -0.25; g.rotation.y = 0.35;
  },
  glow: [0.7, 0.6, 0.6],
});

ICON_EXTRA.set('pot', {
  build(m: Mold, g: THREE.Group, u: number) {
    // a steel stock pot: rolled rim, riveted handles, a domed lid with a bakelite knob, steam curling off it
    m.add(flathe([[0, -7], [7.2, -7], [7.6, -6.2], [7.6, 3.6], [8.2, 4.2], [7.6, 4.6]].map(([r, y]) => [r * u, y * u]), 12), M(0, -1 * u, 0), 0xa8aeb0, STEEL);
    m.add(flathe([[0, 0], [7.8, 0], [6.6, 1.6], [2, 3], [0, 3.1]].map(([r, y]) => [r * u, y * u]), 12), M(0, 3.8 * u, 0), 0xbcc2c4, CHROME);
    m.add(fcyl(1.4 * u, 1.6 * u, 8, 1.6 * u, 0.25), M(0, 7.4 * u, 0), 0x1a1612, PAINT);
    for (const sx of [-1, 1]) {
      m.add(fbox(3 * u, 1.2 * u, 2.4 * u, 0.3), M(sx * 9 * u, 1.8 * u, 0), 0x2a2622, RUBBER);
      m.add(fcyl(0.4 * u, 0.4 * u, 6, 0.4 * u, 0.2), M(sx * 7.7 * u, 1.8 * u, 0.8 * u, 0, 0, PI / 2), 0xd8dcd8, CHROME);
    }
    // the stew showing at a gap under the lid, and three puffs of steam
    m.add(fbox(4 * u, 0.6 * u, 1 * u, 0.2), M(4.6 * u, 4.2 * u, 5 * u, 0, 0.6, 0), 0xc87a2a, PAINT, 0.5);
    for (let i = 0; i < 3; i++) m.add(gem((1.6 - i * 0.3) * u, 1, 0.15, 7 + i), M((-2 + i * 2.2) * u, (10 + i * 1.6) * u, 1 * u), 0xf0f4f4, PAPER, 0.35);
    g.rotation.x = 0.28;
  },
  glow: [0.6, 0.7, 0.6],
});

ICON_EXTRA.set('sprout', {
  build(m: Mold, g: THREE.Group, u: number) {
    // a terracotta pot with a rim, dark soil, a stem, two broad leaves and a green bud; a label stick
    m.add(flathe([[0, -9], [4.6, -9], [5.8, -2], [6.6, -2], [6.6, 0.2], [5.6, 0.2]].map(([r, y]) => [r * u, y * u]), 10), M(0, -1 * u, 0), (_x, y) => (y > -3 * u ? 0xc0643a : 0xb05832), PAINT);
    m.add(fcyl(5.6 * u, 0.8 * u, 10, 5.6 * u, 0.1), M(0, -1.2 * u, 0), 0x3a2418, RUBBER);
    m.add(frod([0, -1 * u, 0], [0.6 * u, 7 * u, 0.4 * u], 0.55 * u, 5), null, 0x4a8a2a, PAINT);
    m.add(gem(3.6 * u, 0, 0.1, 11), M(-3 * u, 5 * u, 0.6 * u, 0, 0.3, 0.7, 1, 0.35, 0.8), 0x5aaa3a, PAINT, 0.15);
    m.add(gem(3.2 * u, 0, 0.1, 13), M(3.4 * u, 7 * u, -0.2 * u, 0, -0.3, -0.6, 1, 0.35, 0.8), 0x6abb44, PAINT, 0.15);
    m.add(gem(1.3 * u, 1, 0.1, 17), M(0.7 * u, 8.2 * u, 0.4 * u), 0x8ad860, GLASS, 0.4);
    m.add(fbox(2.6 * u, 3 * u, 0.3 * u, 0.1), M(-3.6 * u, 1.6 * u, 3.2 * u, -0.2, 0.3, 0.1), 0xe8e2d0, PAPER);
    m.add(frod([-3.6 * u, -1 * u, 3.4 * u], [-3.6 * u, 0.4 * u, 3.3 * u], 0.25 * u, 4), null, 0xb89a6a, PAINT);
    g.rotation.x = 0.22;
  },
  glow: [0.6, 0.9, 0.6],
});

ICON_EXTRA.set('pail', {
  build(m: Mold, g: THREE.Group, u: number) {
    // a galvanised pail, its rolled rim and seams, grain heaped in it, a wire bail with a wooden grip
    m.add(flathe([[0, -8], [5.4, -8], [7.2, 4], [7.8, 4.6], [7.2, 4.9]].map(([r, y]) => [r * u, y * u]), 12), M(0, -1 * u, 0), (_x, y) => (Math.round(y / u) % 4 === 0 ? 0x8a9294 : 0xa8b0b2), STEEL);
    m.add(fcyl(6.9 * u, 1.6 * u, 12, 6.9 * u, 0.2), M(0, 3.2 * u, 0), 0xd8b860, PAPER);
    for (let i = 0; i < 9; i++) m.add(gem(0.7 * u, 0, 0.2, 20 + i), M(Math.cos(i * 2.4) * (1 + (i % 3) * 1.6) * u, 4.4 * u, Math.sin(i * 2.4) * (1 + (i % 3) * 1.6) * u), 0xe8c870, PAPER);
    m.add(fring(7.6 * u, 0.3 * u, 14, 3, PI), M(0, 3.4 * u, 0, 0, 0, 0), 0xb8bcb8, CHROME);
    m.add(fcyl(0.8 * u, 4 * u, 8, 0.8 * u, 0.2), M(0, 11 * u, 0, 0, 0, PI / 2), 0x9a6a3c, PAINT);
    for (const sx of [-1, 1]) m.add(fcyl(0.8 * u, 0.6 * u, 6, 0.8 * u, 0.2), M(sx * 7.4 * u, 3.6 * u, 0, 0, 0, PI / 2), 0x6a7072, STEEL);
    g.rotation.x = 0.3;
  },
  glow: [0.6, 0.8, 0.6],
  free: true,
});
