// Hand-pixelled surface textures for the operating theatre (src/ui/surgery):
// chipped enamel, brushed steel, chrome, ribbed rubber, hazard paint, glazed
// tile, terrazzo, peeling plaster, brass, bakelite, leather, surgical drape,
// grilles, lamp lenses. Drawn once with the game's PixelCanvas kit (hue-shifted
// ramps, ordered dither, 1px highlights and shadows, rivets, wear and stains),
// uploaded with nearest filtering and no mipmaps so they stay crisp at the
// stage's integer pixel scale. Materials are built per stage (stage.ts Mats).
import * as THREE from 'three';
import { PixelCanvas, makeRamp, mixHex, scaleHex, bayer } from '../../gfx/pixel';
import { tileFbm, hashf, Rng } from '../../core/rng';

const cache = new Map<string, THREE.DataTexture>();
const K = 0x0a0908;

function upload(pc: PixelCanvas): THREE.DataTexture {
  const t = new THREE.DataTexture(new Uint8Array(pc.data.buffer.slice(0)), pc.w, pc.h, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}
const rnd = (seed: number) => new Rng(seed);
const fb = (x: number, y: number, w: number, h: number, cells: number, seed: number, oct = 3) => tileFbm(x, y, w, h, cells, oct, seed);

/** a 2x2 dome rivet with a lit top-left and a black rim */
function rivet(pc: PixelCanvas, x: number, y: number, r: number[]) {
  pc.set(x - 1, y, K); pc.set(x + 2, y + 1, K); pc.set(x, y - 1, K); pc.set(x + 1, y + 2, K);
  pc.set(x, y, r[r.length - 1]); pc.set(x + 1, y, r[r.length - 3]); pc.set(x, y + 1, r[r.length - 3]); pc.set(x + 1, y + 1, r[1]);
  pc.set(x + 2, y + 2, r[0]);
}
/** a chipped patch: bare dark metal with a lifted light paint lip */
function chip(pc: PixelCanvas, rng: Rng, x: number, y: number, s: number, bare: number, lip: number) {
  const pts: [number, number][] = [];
  for (let j = -s; j <= s; j++) for (let i = -s; i <= s; i++) {
    const d = Math.hypot(i * (0.8 + rng.next() * 0.4), j);
    if (d <= s * (0.55 + hashf(x + i, y + j, 5) * 0.55)) pts.push([x + i, y + j]);
  }
  const set = new Set(pts.map(([a, b]) => a + ',' + b));
  for (const [a, b] of pts) pc.set(a, b, bare);
  for (const [a, b] of pts) { if (!set.has(a + ',' + (b - 1))) pc.set(a, b - 1, lip); if (!set.has((a - 1) + ',' + b)) pc.set(a - 1, b, lip); }
}
function scratch(pc: PixelCanvas, rng: Rng, c: number, n: number, len = 6) {
  for (let k = 0; k < n; k++) {
    let x = rng.int(0, pc.w - 1), y = rng.int(0, pc.h - 1);
    const dx = rng.chance(0.5) ? 1 : -1, l = rng.int(3, len);
    for (let i = 0; i < l; i++) { pc.set(x, y, c); x += dx; if (rng.chance(0.45)) y++; }
  }
}

// ------------------------------------------------------------------ recipes
type Recipe = () => PixelCanvas;
const R: Record<string, Recipe> = {};

/** industrial enamel over steel: mottled, chipped, scratched, a riveted seam across the top */
function enamel(base: number, seed: number, seam = true): PixelCanvas {
  const pc = new PixelCanvas(64, 64), rng = rnd(seed);
  const r = makeRamp(base, 7, { spread: 0.42, hueShift: 0.05 });
  pc.fillRamp(r, (x, y) => 0.5 + (fb(x, y, 64, 64, 4, seed) - 0.5) * 0.5 + (fb(x, y, 64, 64, 16, seed + 9, 2) - 0.5) * 0.18, 1);
  if (seam) {
    pc.hline(0, 63, 0, scaleHex(r[0], 0.6)); pc.hline(0, 63, 1, r[5]);
    pc.vline(0, 0, 63, scaleHex(r[1], 0.85)); pc.vline(1, 0, 63, r[4]);
    for (let x = 4; x < 64; x += 10) rivet(pc, x, 4, r);
  }
  for (let i = 0; i < 9; i++) chip(pc, rng, rng.int(4, 60), rng.int(6, 60), rng.int(1, 3), mixHex(0x2c2a26, r[0], 0.3), r[6]);
  scratch(pc, rng, r[5], 10);
  scratch(pc, rng, r[1], 6, 4);
  pc.grime(0x15120c, 0.7, 4, seed + 3, 0.5);
  for (let i = 0; i < 14; i++) pc.set(rng.int(0, 63), rng.int(0, 63), rng.pick([0x6a3418, 0x8a4a20, r[0]]));
  return pc;
}
R.olive = () => enamel(0x5c6438, 11);
R.yellow = () => enamel(0xc49a28, 12);
R.cream = () => enamel(0xc6bc98, 13);
R.mint = () => enamel(0x7fa894, 14);
R.red = () => enamel(0x8e2a1e, 15);
R.gunmetal = () => enamel(0x3a3e40, 16);
R.olivePlain = () => enamel(0x5c6438, 17, false);
R.creamPlain = () => enamel(0xc6bc98, 18, false);

R.steel = () => {
  const pc = new PixelCanvas(64, 64), rng = rnd(21);
  const r = makeRamp(0x7c8288, 7, { spread: 0.5, hueShift: 0.02 });
  const row = Array.from({ length: 64 }, (_, y) => hashf(y, 3, 21));
  pc.fillRamp(r, (x, y) => 0.42 + (row[y] - 0.5) * 0.22 + (fb(x * 0.25, y, 16, 64, 2, 22, 2) - 0.5) * 0.3 + (hashf(x >> 3, y, 4) - 0.5) * 0.08, 0.8);
  scratch(pc, rng, r[6], 12, 8); scratch(pc, rng, r[1], 8, 5);
  pc.grime(0x1a1a18, 0.5, 4, 23, 0.55);
  return pc;
};
R.darksteel = () => {
  const pc = new PixelCanvas(64, 64), rng = rnd(24);
  const r = makeRamp(0x3c4044, 7, { spread: 0.5 });
  pc.fillRamp(r, (x, y) => 0.45 + (fb(x, y, 64, 64, 4, 25) - 0.5) * 0.4 + (hashf(x, y >> 2, 6) - 0.5) * 0.06, 1);
  pc.hline(0, 63, 0, K); pc.hline(0, 63, 1, r[5]);
  for (let x = 6; x < 64; x += 16) rivet(pc, x, 4, r);
  scratch(pc, rng, r[5], 8);
  for (let i = 0; i < 6; i++) chip(pc, rng, rng.int(4, 60), rng.int(8, 60), 1, 0x5a2c14, 0x8a4a22);
  return pc;
};
R.chrome = () => {
  const pc = new PixelCanvas(32, 32), rng = rnd(31);
  const r = [0x1c1e22, 0x3a3e46, 0x6a7078, 0x9aa2aa, 0xc8ced4, 0xeef2f6];
  pc.fillRamp(r, (x, y) => { const b = Math.sin((y + hashf(x >> 3, 0, 31) * 3) * 0.6) * 0.5 + 0.5; return 0.25 + b * 0.55 + (hashf(x, y, 32) - 0.5) * 0.1; }, 1);
  scratch(pc, rng, 0xffffff, 4, 5);
  return pc;
};
R.brass = () => {
  const pc = new PixelCanvas(32, 32), rng = rnd(41);
  const r = makeRamp(0xb08a3a, 6, { spread: 0.5, hueShift: 0.05 });
  pc.fillRamp(r, (x, y) => 0.45 + (fb(x, y, 32, 32, 4, 42) - 0.5) * 0.5 + (hashf(x, y >> 1, 43) - 0.5) * 0.1, 1);
  scratch(pc, rng, r[5], 5, 4);
  pc.grime(0x2a3a1a, 0.6, 4, 44, 0.6);
  return pc;
};
R.rubber = () => {
  // ribbed hose: rings across v, a highlight ridge on each rib
  const pc = new PixelCanvas(16, 16);
  const r = [0x0e0e0e, 0x1a1a1a, 0x262624, 0x34332f, 0x46443e];
  pc.fillRamp(r, (x, y) => { const k = x % 4; return (k === 0 ? 0.1 : k === 1 ? 0.75 : k === 2 ? 0.45 : 0.3) + (hashf(x, y, 51) - 0.5) * 0.15; }, 0.5);
  return pc;
};
R.cable = () => {
  // braided sleeve: red and black diagonal weave
  const pc = new PixelCanvas(16, 16);
  pc.each((x, y) => { const d = (x + y) % 8, e = (x - y + 64) % 8; const c = d < 4 ? (e < 4 ? 0x8a1a12 : 0x5a0e0a) : (e < 4 ? 0x1a1414 : 0x2a2220); pc.set(x, y, (d === 0 || e === 0) ? scaleHex(c, 0.6) : c); });
  return pc;
};
R.yellowcable = () => {
  const pc = new PixelCanvas(16, 16);
  pc.each((x, y) => { const d = (x + y * 2) % 8; pc.set(x, y, d < 1 ? 0x3a2a08 : d < 4 ? 0xc89a2a : 0x8a6a18); });
  return pc;
};
R.hazard = () => {
  const pc = new PixelCanvas(32, 32), rng = rnd(61);
  const y = makeRamp(0xd0a020, 5, { spread: 0.4 }), b = [0x0c0b09, 0x15140f, 0x201e18, 0x2c2a22, 0x3a372c];
  pc.each((px, py) => {
    const s = ((px + py) % 16) < 8;
    const n = fb(px, py, 32, 32, 4, 62) * 0.8 + 0.1;
    const i = Math.min(4, Math.floor(n * 5 + bayer(px, py) - 0.5));
    pc.set(px, py, s ? y[Math.max(0, i)] : b[Math.max(0, i)]);
  });
  for (let i = 0; i < 7; i++) chip(pc, rng, rng.int(2, 30), rng.int(2, 30), rng.int(1, 2), 0x3a3834, 0x6a665c);
  pc.grime(0x100c06, 0.8, 4, 63, 0.5);
  return pc;
};
R.tile = () => {
  // glazed wall tile, 4 x 4 tiles of 16 px: grout, a lit glaze lip, cracks, grime and rust runs
  const pc = new PixelCanvas(64, 64), rng = rnd(71);
  const r = makeRamp(0x9cb4a4, 7, { spread: 0.45, hueShift: 0.04 });
  const g = 0x262a24;
  pc.each((x, y) => {
    const tx = x >> 4, ty = y >> 4, lx = x & 15, ly = y & 15;
    if (lx === 15 || ly === 15) { pc.set(x, y, g); return; }
    const tb = (hashf(tx, ty, 72) - 0.5) * 0.25;
    let v = 0.55 + tb + (fb(x, y, 64, 64, 4, 73) - 0.5) * 0.3;
    if (lx === 0 || ly === 0) v += 0.22; else if (lx === 14 || ly === 14) v -= 0.22;
    const f = Math.max(0, Math.min(1, v)) * (r.length - 1);
    pc.set(x, y, r[Math.min(r.length - 1, Math.floor(f + bayer(x, y) - 0.5))]);
  });
  // cracks
  for (let k = 0; k < 4; k++) { let x = rng.int(0, 63), y = rng.int(0, 63); for (let i = 0; i < rng.int(6, 14); i++) { pc.set(x, y, 0x30342c); x += rng.int(-1, 1); y += 1; } }
  // a missing tile showing the mortar bed
  const mx = 2 * 16, my = 1 * 16;
  for (let j = 0; j < 15; j++) for (let i = 0; i < 15; i++) pc.set(mx + i, my + j, mixHex(0x3a3830, 0x24221e, hashf(i, j, 74)));
  pc.hline(mx, mx + 14, my, K); pc.vline(mx, my, my + 14, K);
  pc.grime(0x1a1c12, 0.9, 4, 75, 0.45);
  pc.drips(rng, 0x4a2a12, 6, 0, 40, 0.4);
  return pc;
};
R.floor = () => {
  // terrazzo floor tiles, 2 x 2 of 32 px, worn paths and old stains
  const pc = new PixelCanvas(64, 64), rng = rnd(81);
  const r = makeRamp(0x6a665a, 6, { spread: 0.45 });
  pc.each((x, y) => {
    const lx = x & 31, ly = y & 31;
    if (lx === 31 || ly === 31) { pc.set(x, y, 0x1a1a16); return; }
    let v = 0.5 + (fb(x, y, 64, 64, 4, 82) - 0.5) * 0.45 + (hashf(x >> 5, y >> 5, 83) - 0.5) * 0.15;
    if (lx === 0 || ly === 0) v += 0.15;
    pc.set(x, y, r[Math.max(0, Math.min(5, Math.floor(v * 6 + bayer(x, y) - 0.5)))]);
  });
  pc.speckle(rng, [0x9a9282, 0x2c2a24, 0x7a5a3a, 0xb0a890, 0x4a5a4a], 0.08);
  for (let k = 0; k < 3; k++) pc.stain(rng.int(4, 60), rng.int(4, 60), rng.int(3, 7), 0x3a1410, 0x260c08, 85 + k);
  pc.grime(0x0e0c08, 0.9, 4, 86, 0.45);
  return pc;
};
R.plaster = () => {
  // painted plaster peeling off concrete, water stains and a crack
  const pc = new PixelCanvas(64, 64), rng = rnd(91);
  const paint = makeRamp(0x5e7068, 6, { spread: 0.4 }), conc = makeRamp(0x5a5850, 5, { spread: 0.4 });
  pc.each((x, y) => {
    const p = fb(x, y, 64, 64, 4, 92);
    const n = fb(x, y, 64, 64, 8, 93, 2);
    if (p > 0.62) pc.set(x, y, conc[Math.max(0, Math.min(4, Math.floor(n * 5 + bayer(x, y) - 0.5)))]);
    else if (p > 0.6) pc.set(x, y, paint[5]);
    else pc.set(x, y, paint[Math.max(0, Math.min(5, Math.floor((0.45 + (n - 0.5) * 0.5) * 6 + bayer(x, y) - 0.5)))]);
  });
  for (let k = 0; k < 3; k++) pc.stain(rng.int(4, 60), rng.int(4, 60), rng.int(5, 10), 0x3a3a2a, 0x2a2a1e, 94 + k);
  let x = 20, y = 0; for (let i = 0; i < 64; i++) { pc.set(x, y, 0x1a1a14); y++; x += rng.int(-1, 1); }
  pc.drips(rng, 0x2a2618, 8, 0, 50, 0.35);
  return pc;
};
R.concrete = () => {
  const pc = new PixelCanvas(64, 64), rng = rnd(101);
  const r = makeRamp(0x4a4840, 6, { spread: 0.45 });
  pc.fillRamp(r, (x, y) => 0.45 + (fb(x, y, 64, 64, 4, 102) - 0.5) * 0.5 + (hashf(x, y, 103) - 0.5) * 0.12, 1);
  pc.speckle(rng, [r[0], r[5]], 0.03);
  pc.grime(0x12100c, 0.8, 4, 104, 0.5);
  return pc;
};
R.bakelite = () => {
  const pc = new PixelCanvas(32, 32), rng = rnd(111);
  const r = [0x120c08, 0x1e140c, 0x2c1e12, 0x3e2a18, 0x5a3e22, 0x7a5630];
  pc.fillRamp(r, (x, y) => 0.38 + (fb(x, y, 32, 32, 4, 112) - 0.5) * 0.5, 1);
  scratch(pc, rng, r[5], 3, 4);
  return pc;
};
R.keycap = () => {
  // cream bakelite keycap: lit top-left lip, dished centre, a worn shine
  const pc = new PixelCanvas(16, 16);
  const r = makeRamp(0xd8ceac, 6, { spread: 0.4, hueShift: 0.05 });
  pc.each((x, y) => {
    let v = 0.55 + (hashf(x, y, 121) - 0.5) * 0.08;
    if (x === 0 || y === 0) v = 0.95; else if (x === 15 || y === 15) v = 0.15; else if (x === 1 || y === 1) v = 0.75; else if (x === 14 || y === 14) v = 0.35;
    else v -= (1 - Math.min(1, Math.hypot(x - 7.5, y - 7.5) / 7)) * 0.12;
    pc.set(x, y, r[Math.max(0, Math.min(5, Math.floor(v * 6 + bayer(x, y) - 0.5)))]);
  });
  return pc;
};
R.leather = () => {
  const pc = new PixelCanvas(32, 32), rng = rnd(131);
  const r = makeRamp(0x5a3a22, 6, { spread: 0.45, hueShift: 0.05 });
  pc.fillRamp(r, (x, y) => 0.45 + (fb(x, y, 32, 32, 4, 132) - 0.5) * 0.45 + (hashf(x, y >> 1, 133) - 0.5) * 0.12, 1);
  for (let x = 0; x < 32; x += 3) { pc.set(x, 2, r[5]); pc.set(x, 29, r[5]); }
  pc.hline(0, 31, 0, r[0]); pc.hline(0, 31, 31, r[0]);
  scratch(pc, rng, r[0], 6, 4);
  return pc;
};
R.vinyl = () => {
  // the table pad: dark green vinyl, button tufts and seams, old stains
  const pc = new PixelCanvas(64, 64), rng = rnd(141);
  const r = makeRamp(0x2e4a3a, 6, { spread: 0.45 });
  pc.fillRamp(r, (x, y) => 0.5 + (fb(x, y, 64, 64, 4, 142) - 0.5) * 0.4, 1);
  pc.hline(0, 63, 0, r[0]); pc.hline(0, 63, 1, r[4]);
  pc.vline(0, 0, 63, r[0]); pc.vline(1, 0, 63, r[4]);
  for (const [x, y] of [[16, 16], [48, 16], [16, 48], [48, 48], [32, 32]]) { pc.set(x, y, r[0]); pc.set(x + 1, y, r[1]); pc.set(x, y - 1, r[5]); }
  for (let k = 0; k < 4; k++) pc.stain(rng.int(4, 60), rng.int(4, 60), rng.int(3, 6), 0x2a1810, 0x1a0e08, 143 + k);
  scratch(pc, rng, r[5], 6, 5);
  return pc;
};
R.drape = () => {
  // surgical green cloth: weave, folds
  const pc = new PixelCanvas(32, 32);
  const r = makeRamp(0x2c6a5a, 6, { spread: 0.42, hueShift: 0.04 });
  pc.fillRamp(r, (x, y) => 0.5 + Math.sin(x * 0.4 + fb(x, y, 32, 32, 2, 151) * 6) * 0.18 + ((x + y) & 1 ? 0.04 : -0.04), 1);
  return pc;
};
R.grate = () => {
  const pc = new PixelCanvas(16, 16);
  const r = [0x111110, 0x2a2a28, 0x44443e, 0x5e5c54];
  pc.each((x, y) => {
    const lx = x & 3, ly = y & 3;
    if (lx >= 1 && ly >= 1) pc.set(x, y, lx === 1 && ly === 1 ? 0x060606 : 0x020202);
    else pc.set(x, y, lx === 0 && ly === 0 ? r[3] : ly === 0 ? r[2] : r[1]);
  });
  return pc;
};
R.vent = () => {
  const pc = new PixelCanvas(16, 16);
  pc.each((x, y) => { const ly = y & 3; pc.set(x, y, ly === 0 ? 0x5a5c58 : ly === 1 ? 0x080808 : ly === 2 ? 0x141414 : 0x3a3c38); });
  return pc;
};
R.glass = () => {
  const pc = new PixelCanvas(32, 32);
  pc.each((x, y) => { const d = (x + y) % 32; pc.set(x, y, d === 6 || d === 8 ? 0x2a3a3a : d === 7 ? 0x3a5050 : mixHex(0x06100e, 0x0c1a18, hashf(x >> 2, y >> 2, 161))); });
  return pc;
};
R.lens = () => {
  // a fresnel lamp lens: hexagonal cells, hot centres
  const pc = new PixelCanvas(16, 16);
  const r = [0x806a48, 0xc8b08a, 0xf2e2c4, 0xfffaf0];
  pc.each((x, y) => { const lx = (x + ((y >> 2) & 1) * 2) & 3, ly = y & 3; pc.set(x, y, lx === 0 || ly === 0 ? r[1] : lx === 2 && ly === 2 ? r[3] : r[2]); });
  return pc;
};
R.rust = () => {
  const pc = new PixelCanvas(32, 32), rng = rnd(171);
  const r = makeRamp(0x7a3c18, 6, { spread: 0.5, hueShift: 0.04 });
  pc.fillRamp(r, (x, y) => 0.45 + (fb(x, y, 32, 32, 4, 172) - 0.5) * 0.7, 1);
  pc.speckle(rng, [0x2a1206, 0xb06a30], 0.06);
  return pc;
};
R.copper = () => {
  const pc = new PixelCanvas(16, 16);
  const r = makeRamp(0xa05a30, 5, { spread: 0.5 });
  pc.fillRamp(r, (x, y) => 0.5 + (hashf(x, y, 181) - 0.5) * 0.3 + Math.sin(y * 0.8) * 0.15, 1);
  return pc;
};
R.screen = () => {
  // dead CRT glass: deep green-black with a soft sheen line
  const pc = new PixelCanvas(32, 32);
  pc.each((x, y) => { const d = (x - y + 64) % 32; pc.set(x, y, d < 2 ? 0x18241e : mixHex(0x030806, 0x07100c, hashf(x >> 3, y >> 3, 191))); });
  return pc;
};
R.jar = () => {
  // specimen jar contents: murky green fluid with a shape suspended
  const pc = new PixelCanvas(16, 16);
  pc.each((x, y) => { const c = Math.hypot(x - 8, y - 9) < 4 + hashf(x, y, 201) * 1.5 ? 0x5a4a30 : mixHex(0x2a5a3a, 0x3a7a4a, hashf(x >> 1, y >> 1, 202)); pc.set(x, y, c); });
  return pc;
};
R.label = () => {
  // a paper label: lines of illegible type
  const pc = new PixelCanvas(16, 16);
  pc.fill(0xc8bc98);
  for (let y = 3; y < 14; y += 3) for (let x = 2; x < 14; x++) if (hashf(x, y, 211) > 0.35) pc.set(x, y, 0x4a4030);
  pc.strokeRect(0, 0, 16, 16, 0x6a5a40);
  return pc;
};
R.flesh = () => {
  const pc = new PixelCanvas(16, 16);
  const r = makeRamp(0x9a3a2e, 5, { spread: 0.45 });
  pc.fillRamp(r, (x, y) => 0.5 + (hashf(x, y, 221) - 0.5) * 0.5, 1);
  return pc;
};
R.panel = () => {
  // instrument panel face: olive enamel with a recessed seam grid and screw heads
  const pc = enamel(0x4e5636, 231, false), r = makeRamp(0x4e5636, 7, { spread: 0.42 });
  for (let i = 0; i < 64; i++) { pc.set(i, 31, K); pc.set(i, 32, r[5]); pc.set(31, i, K); pc.set(32, i, r[5]); }
  for (const [x, y] of [[3, 3], [59, 3], [3, 59], [59, 59], [35, 35], [27, 27]]) rivet(pc, x, y, r);
  return pc;
};

/** a named texture (cached for the session) */
export function ptex(name: string): THREE.DataTexture {
  let t = cache.get(name);
  if (!t) { const f = R[name]; if (!f) throw new Error('surgery tex ' + name); t = upload(f()); cache.set(name, t); }
  return t;
}

// ------------------------------------------------------------------ materials (one set per stage: env maps belong to a renderer)
export type StdName = 'olive' | 'yellow' | 'cream' | 'mint' | 'red' | 'gunmetal' | 'olivePlain' | 'creamPlain' | 'steel' | 'darksteel' | 'chrome' | 'brass' | 'copper' | 'rubber' | 'cable' | 'yellowcable' | 'hazard' | 'tile' | 'floor' | 'plaster' | 'concrete' | 'bakelite' | 'keycap' | 'leather' | 'vinyl' | 'drape' | 'grate' | 'vent' | 'glass' | 'rust' | 'screen' | 'jar' | 'label' | 'flesh' | 'panel';
const SPEC: Record<StdName, [number, number, number?]> = {
  // roughness, metalness, env intensity
  olive: [0.62, 0.18, 0.25], yellow: [0.55, 0.2, 0.3], cream: [0.5, 0.12, 0.3], mint: [0.5, 0.12, 0.25], red: [0.45, 0.15, 0.3], gunmetal: [0.5, 0.45, 0.35],
  olivePlain: [0.62, 0.18, 0.25], creamPlain: [0.5, 0.12, 0.3],
  steel: [0.34, 0.85, 0.6], darksteel: [0.48, 0.7, 0.4], chrome: [0.16, 1, 1], brass: [0.3, 0.95, 0.6], copper: [0.32, 0.95, 0.5],
  rubber: [0.86, 0, 0.1], cable: [0.7, 0, 0.1], yellowcable: [0.7, 0, 0.1], hazard: [0.58, 0.1, 0.2],
  tile: [0.28, 0.02, 0.35], floor: [0.42, 0.04, 0.3], plaster: [0.92, 0, 0.05], concrete: [0.9, 0, 0.05],
  bakelite: [0.28, 0.05, 0.45], keycap: [0.35, 0.02, 0.35], leather: [0.62, 0, 0.15], vinyl: [0.38, 0, 0.3], drape: [0.92, 0, 0.05],
  grate: [0.55, 0.7, 0.2], vent: [0.6, 0.5, 0.2], glass: [0.06, 0.1, 1], rust: [0.85, 0.3, 0.1], screen: [0.05, 0, 0.8], jar: [0.12, 0, 0.6], label: [0.9, 0, 0.05], flesh: [0.45, 0, 0.3], panel: [0.6, 0.18, 0.25],
};
export type Mats = Record<StdName, THREE.MeshStandardMaterial> & {
  /** an unlit glowing material in an HDR colour (multiplied) */
  glow(color: number, k?: number): THREE.MeshBasicMaterial;
  lens: THREE.MeshBasicMaterial;
  all: THREE.Material[];
};
export function makeMats(env: THREE.Texture | null): Mats {
  const all: THREE.Material[] = [];
  const m = {} as Mats;
  for (const k of Object.keys(SPEC) as StdName[]) {
    const [r, mt, ei] = SPEC[k];
    const mat = new THREE.MeshStandardMaterial({ map: ptex(k), roughness: r, metalness: mt, flatShading: true, vertexColors: true });
    if (env) { mat.envMap = env; mat.envMapIntensity = ei ?? 0.3; }
    (m as any)[k] = mat; all.push(mat);
  }
  const glows = new Map<string, THREE.MeshBasicMaterial>();
  m.glow = (color: number, k = 2.5) => {
    const key = color + ':' + k;
    let g = glows.get(key);
    if (!g) { g = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), toneMapped: false }); glows.set(key, g); all.push(g); }
    return g;
  };
  m.lens = new THREE.MeshBasicMaterial({ map: ptex('lens'), color: new THREE.Color(3.2, 3.0, 2.7), toneMapped: false });
  all.push(m.lens);
  m.all = all;
  return m;
}
