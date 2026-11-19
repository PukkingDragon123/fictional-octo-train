// THE LAB'S ROOM KEYS (round 21): little 3D models for the keys that replace the room HUD's words
// (title.ts buildHud) and the menus' tabs. Registered into the machine kit's icon set (machine/decor.ts
// ICON_EXTRA), so mxIcon / mxIconSpin / mxIconAnim / crtIcon draw them like the rest: designed at 22 units,
// worn enamel, steel, brass and glass under the panels' light.
//
//   crt      a little olive CRT set, its green tube lit, a knob and a vent    (the monitors)
//   lattice  the research lattice: brass nodes on chrome rods, one lit       (the research tree)
//   scale    the talent balance: a beam on a post, two pans, a marble        (the talent bench)
//   flask    a conical flask of glowing green sample, corked                 (process a sample)
//   spool    a filament spool: two flanges, wound orange filament, a strand  (the fab bay)
//   cabinet  a steel filing cabinet, three drawers, card slots, one ajar     (the codex archive)
import * as THREE from 'three';
import { ICON_EXTRA } from '../machine/decor';
import { Mold, M, STEEL, CHROME, BRASS, RUBBER, PLASTIC, PAINT, GLASS, PAPER } from '../touch/stage3d';
import { fcyl, fbox, fring, frod, plate, clipRect, gem, flathe } from '../touch/facet';
import { R90, meshOf } from '../machine/parts';
import { mxMat } from '../machine/core';

const PI = Math.PI, TAU = PI * 2;

ICON_EXTRA.set('crt', {
  build(m: Mold, g: THREE.Group, u: number) {
    // the case: a deep olive box, a darker bezel, the curved tube proud of it
    m.add(fbox(18 * u, 14 * u, 11 * u, 0.18), M(0, 0.5 * u, -2 * u), (_x, _y, _z, _nx, ny, nz) => (nz > 0.5 ? 0x5e6a40 : ny > 0.4 ? 0x7a865a : 0x3b4428), PAINT);
    m.add(plate(clipRect(14 * u, 10.4 * u, 1.6 * u), 1.2 * u, 0.4 * u, [clipRect(11.4 * u, 8 * u, 1.2 * u)]), M(-1.6 * u, 1 * u, 3.6 * u), 0x23281a, PAINT);
    m.add(plate(clipRect(11.4 * u, 8 * u, 1.2 * u), 0.8 * u, 0.5 * u), M(-1.6 * u, 1 * u, 3.4 * u), (x, y) => {
      // the phosphor: a lit trace across a dark green field, scanlines
      const lx = x / u + 1.6, ly = y / u - 1;
      if (Math.abs(ly - Math.sin(lx * 0.9) * 1.6) < 0.55) return 0xc8ffb0;
      return Math.round(ly * 2) % 2 ? 0x1e6a2e : 0x2a8a3a;
    }, GLASS, 1);
    // the side column: a knob, a lamp, a vent
    m.add(fcyl(1.5 * u, 1.2 * u, 10, 1.5 * u, 0.2), M(7 * u, 3 * u, 3.6 * u, R90), 0x1a1a16, PLASTIC);
    m.add(fbox(0.4 * u, 1.2 * u, 0.4 * u, 0), M(7 * u, 3.6 * u, 4.3 * u), 0xf0e4c0, PAINT);
    m.add(gem(0.8 * u, 0, 0.05, 3), M(7 * u, -0.4 * u, 3.6 * u), 0xffb02a, GLASS, 1);
    for (let i = 0; i < 3; i++) m.add(fbox(2.4 * u, 0.5 * u, 0.4 * u, 0), M(7 * u, (-3 - i * 1.2) * u, 3.5 * u), 0x14160c, STEEL);
    // feet and a screw in each corner
    for (const x of [-7, 7]) m.add(fbox(3 * u, 1.4 * u, 8 * u, 0.2), M(x * u, -7.2 * u, -2 * u), 0x1a1c16, RUBBER);
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) m.add(fcyl(0.4 * u, 0.4 * u, 6, 0.4 * u, 0.2), M((-1.6 + sx * 6.4) * u, (1 + sy * 4.6) * u, 4.3 * u, R90), 0xb0b8b4, CHROME);
    g.rotation.x = 0.18;
  },
  glow: [0.5, 1.1, 0.6],
});

ICON_EXTRA.set('lattice', {
  build(m: Mold, g: THREE.Group, u: number) {
    // five sockets in a branching tree, chrome rods between, the root on a steel foot; the top node lit
    const N: [number, number, number][] = [[0, -6.5, 0], [-5.5, -1, 1.5], [5.5, -1.5, -1], [-2.5, 5.5, -1.5], [4, 6.5, 1.8], [-8, 6, 2]];
    const E: [number, number][] = [[0, 1], [0, 2], [1, 3], [2, 4], [1, 5]];
    for (const [a, b] of E) m.add(frod([N[a][0] * u, N[a][1] * u, N[a][2] * u], [N[b][0] * u, N[b][1] * u, N[b][2] * u], 0.55 * u, 5), null, 0xc8ccc4, CHROME);
    N.forEach(([x, y, z], i) => {
      m.add(gem(i === 0 ? 2.4 * u : 2 * u, 1, 0.03, 4 + i), M(x * u, y * u, z * u), i === 4 ? 0x7aff8a : i === 3 ? 0xffd25a : 0xb08a3a, i === 4 || i === 3 ? GLASS : BRASS, i === 4 ? 1 : i === 3 ? 0.6 : 0);
      if (i) m.add(fring(2.2 * u, 0.35 * u, 10, 4), M(x * u, y * u, z * u, 0.3 * i, 0.5, 0), 0x3a3f38, STEEL);
    });
    m.add(fcyl(3 * u, 1.6 * u, 8, 4.2 * u, 0.25), M(0, -9.4 * u, 0), 0x3a3f38, STEEL);
    m.add(frod([0, -9 * u, 0], [0, -6.5 * u, 0], 0.8 * u, 6), null, 0x9aa29c, STEEL);
  },
  glow: [0.6, 1.2, 0.6],
  free: true,
});

ICON_EXTRA.set('scale', {
  build(m: Mold, g: THREE.Group, u: number) {
    // a brass balance: a stepped foot, the post, the beam tipped a little, a pan on chains each side, a marble in one
    m.add(fcyl(5 * u, 1.4 * u, 10, 6 * u, 0.25), M(0, -9 * u, 0), 0x3b4428, PAINT);
    m.add(fcyl(1 * u, 13 * u, 8, 1.3 * u, 0.2), M(0, -2 * u, 0), 0xb08a3a, BRASS);
    m.add(gem(1.6 * u, 0, 0.05, 3), M(0, 5 * u, 0), 0xead08a, BRASS);
    const tip = -0.16;
    const beam = (x: number) => [x * Math.cos(tip) * u, (4.6 + x * Math.sin(tip)) * u] as const;
    m.add(fbox(19 * u, 1.1 * u, 1.2 * u, 0.3), M(0, 4.6 * u, 0, 0, 0, tip), 0xc8a24a, BRASS);
    for (const s of [-1, 1]) {
      const [bx, by] = beam(s * 8.6);
      const py = by - 7 * u;
      for (const dz of [-1.6, 1.6]) m.add(frod([bx, by, 0], [bx + dz * 0.8 * u, py + 0.6 * u, dz * u], 0.18 * u, 4), null, 0x9aa29c, CHROME);
      m.add(fcyl(3.4 * u, 0.7 * u, 10, 2.6 * u, 0.25), M(bx, py, 0), 0xb8bcb4, STEEL);
      if (s > 0) m.add(gem(1.5 * u, 1, 0.02, 6), M(bx, py + 1.6 * u, 0.4 * u), 0x4ab0ff, GLASS, 0.5);
      else m.add(fbox(2.4 * u, 1.6 * u, 2.4 * u, 0.3), M(bx, py + 1.1 * u, 0), 0x8a8e88, STEEL);
    }
    g.rotation.x = 0.22;
  },
  glow: [0.6, 0.9, 1.2],
  free: true,
});

ICON_EXTRA.set('flask', {
  build(m: Mold, g: THREE.Group, u: number) {
    // a conical flask: thin glass, a glowing green sample to the shoulder, a cork, a paper label tag on a string
    const glass: number[][] = [[0.1, -9], [7.4, -9], [7.8, -8.2], [2.4, 2.2], [2.2, 6.2], [2.8, 6.8]].map(([r, y]) => [r * u, y * u]);
    m.add(flathe(glass, 12), null, 0xcfe8e4, GLASS, 0.12);
    const liq: number[][] = [[0.1, -8.4], [6.8, -8.4], [3.6, -1.6], [0.1, -1.6]].map(([r, y]) => [r * u, y * u]);
    m.add(flathe(liq, 12), M(0, 0, 0, 0, 0, 0, 1.02), (_x, y) => (y > -2.6 * u ? 0xc8ffa0 : 0x5ad84a), GLASS, 1);
    for (const [x, y, r] of [[-2, -5, 0.7], [1.6, -3.4, 0.5], [3, -6.4, 0.6]]) m.add(gem(r * u, 0, 0.05, 2), M(x * u, y * u, 3 * u), 0xeaffd8, GLASS, 1);
    m.add(fcyl(2.2 * u, 2.6 * u, 8, 1.8 * u, 0.2), M(0, 8 * u, 0), 0x8a5a2a, RUBBER);
    m.add(frod([2.4 * u, 5.4 * u, 1.4 * u], [5.6 * u, 2 * u, 2.4 * u], 0.15 * u, 4), null, 0xd8c890, PAPER);
    m.add(plate(clipRect(3.6 * u, 2.4 * u, 0.6 * u), 0.3 * u, 0), M(6.4 * u, 0.6 * u, 2.6 * u, 0, -0.3, -0.4), 0xe8e0c8, PAPER);
    g.rotation.x = 0.18;
  },
  glow: [0.6, 1.2, 0.5],
  free: true,
});

ICON_EXTRA.set('spool', {
  build(m: Mold, g: THREE.Group, u: number) {
    // a filament spool side on (axis to the viewer, tilted): steel flanges with windows, orange filament wound on the hub
    const sp = new THREE.Group(); sp.rotation.set(0.2, 0.5, 0); g.add(sp);
    const s = new Mold();
    for (const z of [-3.4, 3.4]) {
      s.add(fcyl(9 * u, 0.8 * u, 16, 9 * u, 0.2), M(0, 0, z * u, R90), 0x9aa29c, STEEL);
      for (let i = 0; i < 4; i++) { const a = i * TAU / 4 + 0.4; s.add(fcyl(1.5 * u, 1 * u, 8, 1.5 * u, 0), M(Math.cos(a) * 5.8 * u, Math.sin(a) * 5.8 * u, z * u + (z > 0 ? 0.1 : -0.1) * u, R90), 0x1a1c16, STEEL); }
    }
    s.add(fcyl(7 * u, 6 * u, 16, 7 * u, 0.1), M(0, 0, 0, R90), (x, y) => (Math.round((Math.atan2(y, x) + PI) * 6) % 2 ? 0xe06a1a : 0xf08a2a), PLASTIC);
    s.add(fcyl(2.2 * u, 8 * u, 8, 2.2 * u, 0.2), M(0, 0, 0, R90), 0x3a3f38, STEEL);
    s.add(fcyl(1 * u, 8.4 * u, 6, 1 * u, 0), M(0, 0, 0, R90), 0x0a0a08, STEEL);
    s.add(frod([6.4 * u, -3 * u, 1 * u], [9.6 * u, -8 * u, 2.4 * u], 0.45 * u, 5), null, 0xf08a2a, PLASTIC);
    // (its own mesh on the tilted group, in the kit's worn material)
    meshOf(s, mxMat({ wear: 0.4, seed: 13 }), sp);
    void m;
  },
  free: true,
});

ICON_EXTRA.set('cabinet', {
  build(m: Mold, g: THREE.Group, u: number) {
    // a steel filing cabinet: three drawers, chrome pulls, cream card slots, the middle drawer pulled out a little
    m.add(fbox(13 * u, 19 * u, 10 * u, 0.12), M(0, 0, -3 * u), (_x, _y, _z, _nx, ny, nz) => (nz > 0.5 ? 0x8a948c : ny > 0.4 ? 0xa8b2aa : 0x5a625c), STEEL);
    for (let i = 0; i < 3; i++) {
      const y = (5.8 - i * 5.8) * u, out = i === 1 ? 2.4 * u : 0;
      m.add(fbox(11.4 * u, 5 * u, 1.2 * u + out, 0.2), M(0, y, 2.2 * u + out / 2), (_x, _y, _z, _nx, ny) => (ny > 0.4 ? 0xb8c2ba : 0x7c8680), STEEL);
      m.add(plate(clipRect(4 * u, 1.6 * u, 0.3 * u), 0.3 * u, 0), M(0, y + 1.2 * u, 2.9 * u + out), i === 1 ? 0xffd25a : 0xe8e0c8, PAPER);
      m.add(fbox(5 * u, 0.9 * u, 1 * u, 0.3), M(0, y - 1.1 * u, 3.3 * u + out), 0xd8dcd8, CHROME);
      if (i === 1) for (let k = 0; k < 4; k++) m.add(fbox(9.6 * u, 3.6 * u, 0.2 * u, 0), M(0, y + 2.6 * u, (0.8 + k * 0.5) * u, -0.25 + k * 0.05, 0, 0), k === 2 ? 0xc8a86a : 0xe8e0c8, PAPER);
    }
    m.add(fbox(13.6 * u, 1 * u, 10.6 * u, 0.2), M(0, -9.8 * u, -3 * u), 0x2a2e28, RUBBER);
    g.rotation.y = -0.35; g.rotation.x = 0.12;
  },
});

