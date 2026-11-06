// The hive at the Ledge's Honey Pools (src/world/gen/z_ledge.ts): the Queen
// Bee's chamber (src/creatures/species/queen_bee.ts). Curtains of comb grown
// from the ceiling to the floor, the brood comb the Queen lays into (a cell
// per egg; state.brood 0..6 shows how many grubs are in it), wax pots of
// honey, and the throne: a bowl of wax and old comb she sits in.
// Texture prefix: qb_
import { defObj } from '../../world/objects';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { makeRamp, mixHex, ph, tileFbm } from './b_common';
import type { PixelCanvas } from '../../gfx/pixel';
import type { ModelBuilder } from '../../gfx/modelBuilder';
import { blob, tube, lathe, surf, type V3 } from '../../creatures/kit/anomalies';
import '../../world/remains';

const T = ['hive', 'ledge', 'anomaly', 'fixed'];

/** a hex grid of cells: capped (pale wax), honey (dark amber with a glint), brood (a white grub curled in it), empty */
function comb(pc: PixelCanvas, seed: number, brood: number) {
  const W = pc.w, H = pc.h;
  const wax = makeRamp(0xd8a840, 6, { spread: 0.45, hueShift: 0.03 });
  pc.fillRamp(wax, (x, y) => 0.55 + (tileFbm(x, y, W, H, 3, 2, seed) - 0.5) * 0.3, 0.6);
  const cw = 6, ch = 5;
  for (let r = -1; r <= H / ch + 1; r++) for (let q = -1; q <= W / cw + 1; q++) {
    const cx = q * cw + (r & 1 ? cw / 2 : 0), cy = r * ch;
    const k = ph(q & 7, r & 7, seed);
    const kind = k < brood ? 'brood' : k < brood + 0.25 ? 'cap' : k < brood + 0.75 ? 'honey' : 'empty';
    for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) {
      if (Math.abs(x) + Math.abs(y) * 0.6 > 2.6) continue;
      const X = ((Math.round(cx + x) % W) + W) % W, Y = ((Math.round(cy + y) % H) + H) % H;
      const edge = Math.abs(x) + Math.abs(y) * 0.6 > 1.8;
      if (edge) { pc.set(X, Y, y < 0 ? wax[5] : wax[1]); continue; }
      const c = kind === 'cap' ? mixHex(0xf0dca8, 0xe0c080, ph(X, Y, seed + 1) * 0.5) : kind === 'honey' ? (x === -1 && y === -1 ? 0xfff0b0 : mixHex(0x8a4a0a, 0xc87a1a, (y + 2) / 4)) : kind === 'brood' ? (Math.abs(x) + Math.abs(y) < 2 ? (x + y === 0 ? 0xd8ccb0 : 0xf8f0dc) : 0x6a3a10) : 0x4a2808;
      pc.set(X, Y, c);
    }
  }
}

addTextureModule(() => {
  const A = atlas();
  A.add('qb_comb', 32, 32, (pc) => comb(pc, 501, 0));
  A.add('qb_comb_brood', 32, 32, (pc) => comb(pc, 503, 0.55));
  A.add('qb_wax', 16, 16, (pc) => {
    const R = makeRamp(0xe0a438, 7, { spread: 0.5, hueShift: 0.04 });
    pc.fillRamp(R, (x, y) => 0.5 + (tileFbm(x, y, 16, 16, 3, 3, 511) - 0.5) * 0.45 + Math.sin((x + y) * 0.6) * 0.05, 0.5);
    for (let i = 0; i < 4; i++) pc.blend(Math.floor(ph(i, 1, 512) * 16), Math.floor(ph(i, 2, 512) * 16), 0xfff4d0, 0.7);
  });
  A.add('qb_honey', 16, 16, (pc) => {
    const R = makeRamp(0xc87818, 6, { spread: 0.5 });
    pc.fillRamp(R, (x, y) => 0.45 + Math.sin(x * 0.5 + Math.sin(y * 0.4) * 2) * 0.12 + (tileFbm(x, y, 16, 16, 2, 2, 521) - 0.5) * 0.3, 0.5);
    for (let i = 0; i < 5; i++) pc.blend(Math.floor(ph(i, 1, 522) * 16), Math.floor(ph(i, 2, 522) * 16), 0xfff0c0, 0.85);
  });
  A.add('qb_grub', 8, 8, (pc) => { pc.fill(0xf4ecd8); for (let x = 0; x < 8; x += 2) for (let y = 0; y < 8; y++) pc.blend(x, y, 0xc8b898, 0.5); pc.set(1, 1, 0xffffff); });
});

const P = (x: number, y: number, z: number): V3 => [x, y, z];
function drip(mb: ModelBuilder, x: number, y: number, z: number, len: number, r: number, tex = 'qb_honey') {
  tube(mb, [P(x, y, z), P(x, y - len * 0.6, z), P(x, y - len, z)], (t) => r * (0.35 + 0.65 * t * t), 6, tex, { emissive: 0.15, capEnd: true });
  blob(mb, [x, y - len, z], [r * 1.3, r * 1.5, r * 1.3], 7, 4, tex, { emissive: 0.2 });
}
/** a sheet of comb hanging from the ceiling: a ragged, bulging slab, cells on both faces */
function combSheet(mb: ModelBuilder, x0: number, x1: number, z: number, top: number, bottom: number, thick: number, tex: string, seed: number) {
  const nu = 8, nv = 7;
  const at = (i: number, j: number, side: number): V3 => {
    const u = i / nu, v = j / nv;
    // a hanging tongue of comb: broad where it grows from the ceiling, narrowing and lobed toward a ragged tip
    const narrow = 1 - 0.42 * Math.pow(v, 1.4) * (0.8 + 0.2 * Math.sin(seed));
    const x = (x0 + x1) / 2 + (u - 0.5) * (x1 - x0) * narrow + Math.sin(v * 3 + seed) * 0.06;
    const bot = bottom + Math.sin(u * 9 + seed) * 0.32 + Math.sin(u * 23 + seed) * 0.1 + Math.pow(Math.abs(u - 0.5) * 2, 2) * 0.45;
    const y = top - (top - bot) * v;
    const bulge = Math.sin(v * Math.PI) * (0.11 + 0.06 * Math.sin(u * 5 + seed)) + Math.sin(u * 7 + v * 5 + seed) * 0.025;
    return [x, y, z + side * (thick + bulge) * (1 - Math.pow(Math.abs(u - 0.5) * 2, 4) * 0.7)];
  };
  surf(mb, nu, nv, (i, j) => at(i, j, 1), (i, j) => [(i / nu) * (x1 - x0) * 1.5, (j / nv) * (top - bottom) * 1.5], tex, { inside: [0.5 * (x0 + x1), (top + bottom) / 2, z] });
  surf(mb, nu, nv, (i, j) => at(i, j, -1), (i, j) => [(i / nu) * (x1 - x0) * 1.5, (j / nv) * (top - bottom) * 1.5], tex, { inside: [0.5 * (x0 + x1), (top + bottom) / 2, z] });
  // the edges: a wax rim round the sheet
  const rim: V3[] = []; for (let i = 0; i <= nu; i++) rim.push(at(i, nv, 0));
  tube(mb, rim, thick * 0.9, 5, 'qb_wax');
  for (let k = 0; k < 5; k++) { const p = at(1 + k * 1.5, nv, 0); drip(mb, p[0], p[1] + 0.02, p[2], 0.12 + (k % 3) * 0.1, 0.02); }
}

defObj({
  key: 'qb_comb_wall', name: 'Hanging Comb', w: 2, d: 1, height: 2.7, block: 'solid', tall: true, movable: 0, hp: 900, sound: 'flesh',
  tags: T,
  desc: 'A curtain of honeycomb grown down from the ceiling to the floor, warm, every cell a different shape. It hums. Some of the cells have something in them that moves.',
  variant: (s) => String((s.v ?? 0) % 3),
  model: (mb, s) => {
    const v = (s.v ?? 0) % 3;
    combSheet(mb, -0.95, 0.95, 0, 2.72, 0.35 + v * 0.1, 0.07, v === 1 ? 'qb_comb_brood' : 'qb_comb', v * 3 + 1);
    // where it meets the floor: a fat wax foot, a pool of honey
    blob(mb, [0, 0, 0], [0.9, 0.35, 0.28], 14, 6, 'qb_wax', { v0: 0, v1: 0.5, disp: (d, u) => 1 + 0.15 * Math.sin(u * 30 + v) });
    blob(mb, [0.3, 0, 0.32], [0.45, 0.03, 0.22], 12, 3, 'qb_honey', { v0: 0, v1: 0.5, emissive: 0.15 });
    // a second, smaller tongue of comb in front
    combSheet(mb, -0.5 + v * 0.2, 0.25 + v * 0.2, 0.22, 2.7, 1.3 + v * 0.2, 0.05, 'qb_comb', v * 5 + 2);
  },
});
defObj({
  key: 'qb_brood', name: 'Brood Comb', height: 0.75, block: 'low', movable: 0, hp: 300, sound: 'flesh',
  tags: T,
  container: { capacity: 6, kind: 'pile', name: 'Brood Comb', loot: 'qb_brood' },
  desc: 'A mound of wax comb on the floor, the cells as big as cups. In the open ones grubs the size of a forearm lie curled in a pearly jelly. They turn toward the light.',
  variant: (s) => String(Math.max(0, Math.min(6, s.brood ?? 3))),
  model: (mb, s) => {
    const n = Math.max(0, Math.min(6, s.brood ?? 3));
    blob(mb, [0, 0, 0], [0.48, 0.42, 0.44], 14, 7, 'qb_wax', { v0: 0, v1: 0.5, disp: (d, u) => 1 + 0.08 * Math.sin(u * 22) });
    // cells: open wax cups round the mound, a grub in the first n of them
    for (let k = 0; k < 7; k++) {
      const a = k * 0.9 + 0.3, y = 0.2 + (k % 3) * 0.1, r = 0.4 - (k % 3) * 0.06;
      const c: V3 = [Math.cos(a) * r, y, Math.sin(a) * r];
      mb.push(); mb.translate(c[0], c[1], c[2]); mb.rotateY(-a + Math.PI / 2); mb.rotateX(-1.0);
      lathe(mb, [0, 0, 0], [[0.02, -0.04], [0.085, -0.02], [0.095, 0.1], [0.075, 0.11], [0.06, 0.02], [0, 0.02]], 6, 'qb_wax', { inside: null });
      if (k < n) {
        blob(mb, [0, 0.06, 0], [0.055, 0.045, 0.055], 8, 5, 'qb_honey', { color: 0xfff4e0 });
        tube(mb, [P(-0.03, 0.08, 0), P(0, 0.11, 0.02), P(0.03, 0.08, 0), P(0.01, 0.06, -0.02)], (t) => 0.032 - t * 0.012, 7, 'qb_grub', { capStart: true, capEnd: true, bump: (t) => 1 + 0.12 * Math.sin(t * 40) });
      } else if (k === n) blob(mb, [0, 0.085, 0], [0.07, 0.02, 0.07], 8, 3, 'qb_wax', { color: 0xf0dca8 });
      mb.pop();
    }
    drip(mb, 0.3, 0.32, 0.2, 0.2, 0.02);
  },
});
defObj({
  key: 'qb_honey_pot', name: 'Honey Pot', height: 0.6, block: 'low', movable: 0, hp: 200, sound: 'flesh',
  tags: T,
  container: { capacity: 4, kind: 'pile', name: 'Honey Pot', loot: 'qb_brood' },
  desc: 'A wax jar the size of a bucket, grown, not made, brimming with dark honey. The surface is skinned over and has a dead moth in it.',
  model: (mb) => {
    lathe(mb, [0, 0, 0], [[0, 0], [0.2, 0], [0.27, 0.12], [0.28, 0.32], [0.22, 0.5], [0.18, 0.55], [0.2, 0.58]], 12, 'qb_wax');
    lathe(mb, [0, 0, 0], [[0.17, 0.5], [0, 0.52]], 12, 'qb_honey', { emissive: 0.15 });
    for (let k = 0; k < 4; k++) { const a = k * 1.6; drip(mb, Math.cos(a) * 0.2, 0.56, Math.sin(a) * 0.2, 0.15 + (k % 2) * 0.12, 0.022); }
    blob(mb, [0.18, 0, 0.18], [0.25, 0.02, 0.18], 10, 3, 'qb_honey', { v0: 0, v1: 0.5, emissive: 0.1 });
  },
});
defObj({
  key: 'qb_throne', name: 'Royal Chamber', w: 3, d: 3, height: 0.7, block: 'none', movable: 0, hp: 99999, sound: 'flesh', noShadow: true,
  tags: T,
  desc: 'A shallow bowl of wax and old comb three metres across, worn smooth in the middle by something enormous that sits there and does not leave. Bones are pressed into the rim.',
  model: (mb) => {
    // the bowl: a raised rim of piled comb and wax, a honey-slick floor inside
    // (planar-mapped: a polar grid of the floor of the bowl, the honey sheen lying flat)
    surf(mb, 20, 4, (i, j) => { const a = (i / 20) * Math.PI * 2, r = (j / 4) * 1.42; return [Math.cos(a) * r, 0.03 + (1 - j / 4) * 0.02, Math.sin(a) * r]; }, (i, j, p) => [p[0] * 1.2, p[2] * 1.2], 'qb_honey', { inside: [0, -1, 0], emissive: 0.1 });
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2, r = 1.32 + Math.sin(k * 3.1) * 0.08;
      blob(mb, [Math.cos(a) * r, 0, Math.sin(a) * r], [0.34, 0.32 + Math.sin(k * 1.7) * 0.12, 0.3], 9, 5, k % 3 === 0 ? 'qb_comb' : 'qb_wax', { v0: 0, v1: 0.5, disp: (d, u) => 1 + 0.12 * Math.sin(u * 14 + k) });
    }
    // bones in the rim, a skull half sunk
    for (let k = 0; k < 5; k++) { const a = k * 1.3 + 0.4; tube(mb, [P(Math.cos(a) * 1.2, 0.2, Math.sin(a) * 1.2), P(Math.cos(a + 0.18) * 1.45, 0.3, Math.sin(a + 0.18) * 1.45)], 0.022, 5, 'rm_bone', { capStart: true, capEnd: true }); }
    blob(mb, [-1.25, 0.25, 0.55], [0.08, 0.08, 0.09], 9, 5, 'rm_bone');
    for (let k = 0; k < 8; k++) { const a = k * 0.8; drip(mb, Math.cos(a) * 1.3, 0.38, Math.sin(a) * 1.3, 0.2, 0.025); }
  },
});
