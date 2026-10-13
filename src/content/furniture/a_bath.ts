// Furniture A — bathroom fixtures.
import { defObj } from '../../world/objects';
import { atlas, addTextureModule, PixelCanvas, makeRamp, mixHex, ph, tileFbm, WZ, fillR, knob } from './a_lib';

const T = (...t: string[]) => ['setA', ...t];

// ============================================================ textures
function enamelOval(pc: PixelCanvas, cx: number, cy: number, rx: number, ry: number, rim: number[], inner: number[], water?: number) {
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, d = Math.hypot(dx, dy);
    if (d <= 1) {
      // bowl shading: darker toward the far (top) rim, lighter at the bottom
      const v = 0.55 - dy * 0.25 - d * 0.15;
      const R = water !== undefined && d < 0.55 ? makeRamp(water, 4) : inner;
      const n = R.length, f = Math.max(0, Math.min(1, v)) * (n - 1);
      let i = Math.floor(f); if (f - i > 0.5) i++;
      pc.set(x, y, R[Math.min(n - 1, i)]);
      if (d > 0.88) pc.set(x, y, dy < 0 ? rim[0] : rim[2]);
    }
  }
}

addTextureModule(() => {
  const A = atlas();
  const P = [0xa8acb0, 0xc8ccd0, 0xe4e6e8, 0xf4f4f2];
  A.add('p_toilet_seat', 14, 14, (pc) => {
    pc.wrap = false;
    pc.fill(0xf2f2ee);
    pc.circle(7, 7, 6.8, 0xe6e6e2); pc.circle(7, 7, 6.2, 0xf6f6f2);
    enamelOval(pc, 7, 7.4, 4.2, 4.8, [0xb8bcc0, 0, 0xffffff], P, 0x6a8a90);
    pc.set(7, 9, 0xd8e4e4); pc.set(6, 8, 0x9ab4b8);
  });
  A.add('p_sink_basin', 16, 12, (pc) => {
    pc.wrap = false;
    fillR(pc, 0, 0, 16, 12, P, (x, y) => 0.8 - y * 0.01, 1);
    enamelOval(pc, 8, 6.5, 6, 4.4, [0xa8acb0, 0, 0xffffff], P);
    pc.set(8, 7, 0x3a3a3c); pc.set(7, 7, 0x8a8e90); pc.set(9, 7, 0x8a8e90);
    for (let y = 8; y < 10; y++) pc.blend(8, y, 0xc8a070, 0.4); // rust drip from the drain
    pc.hline(2, 13, 0, 0xd8dadc);
  });
  A.add('p_tub_floor', 48, 22, (pc) => {
    pc.wrap = false;
    for (let y = 0; y < 22; y++) for (let x = 0; x < 48; x++) {
      const ex = Math.min(x, 47 - x) / 8, ey = Math.min(y, 21 - y) / 6;
      const e = Math.min(1, Math.min(ex, ey));
      const v = 0.35 + e * 0.6 - (y < 3 ? 0.2 : 0);
      const n = P.length, f = Math.max(0, Math.min(1, v)) * (n - 1);
      let i = Math.floor(f); if (f - i > 0.3 + ph(x, y, 4) * 0.4) i++;
      pc.set(x, y, P[Math.min(n - 1, i)]);
    }
    // drain + rust streak under the faucet end
    pc.circle(5, 11, 1.6, 0x8a8e92); pc.set(5, 11, 0x2a2a2c); pc.set(4, 11, 0x5a5e62);
    for (let x = 1; x < 12; x++) for (let k = -1; k <= 1; k++) if (ph(x, k, 3) < 0.7 - x * 0.05) pc.blend(x, 11 + k + (x > 6 ? 1 : 0), 0xb87a48, 0.35);
    // shallow grey water left behind
    for (let y = 5; y < 18; y++) for (let x = 2; x < 20; x++) { const d = Math.hypot((x - 9) / 9, (y - 11) / 6); if (d < 1) pc.blend(x, y, 0x8aa4a8, 0.35 * (1 - d)); }
    // bathtub ring
    for (let x = 4; x < 44; x++) { pc.blend(x, 2, 0xb8aa88, 0.35); pc.blend(x, 19, 0xb8aa88, 0.25); }
  });
  A.add('p_mirror', 16, 24, (pc) => {
    pc.wrap = false;
    // a cool, slightly too-dark reflection
    fillR(pc, 0, 0, 16, 24, [0x2e3236, 0x3c4246, 0x50585c, 0x687276, 0x8a969a], (x, y) => 0.5 + (x - y * 0.5) * 0.02 + (tileFbm(x, y, 32, 32, 3, 2, 8) - 0.5) * 0.15, 1);
    // reflected doorway and ceiling light
    pc.rect(3, 6, 4, 14, 0x24282a); pc.vline(2, 6, 19, 0x5a6266);
    pc.rect(5, 1, 6, 1, 0xc8d4d4);
    // someone standing behind you (who is not there)
    pc.ellipse(11.5, 12, 1.4, 1.7, 0x1c1e20); pc.rect(10, 14, 4, 8, 0x1c1e20); pc.rect(9, 15, 6, 7, 0x202426);
    // glossy diagonal streaks
    for (let i = 0; i < 24; i++) { pc.blend(i * 0.7, 23 - i, 0xe0eeee, 0.25); pc.blend(i * 0.7 + 1, 23 - i, 0xe0eeee, 0.12); pc.blend(i * 0.7 + 7, 23 - i, 0xe0eeee, 0.12); }
    // desilvering at the edges
    for (let k = 0; k < 9; k++) { const x = [0, 15, 0, 15, 1, 14, 7, 0, 15][k], y = [3, 8, 20, 22, 23, 0, 23, 12, 15][k]; pc.set(x, y, 0x101214); pc.blend(x + (x ? -1 : 1), y, 0x101214, 0.5); }
  });
  A.add('p_medicine_mirror', 14, 19, (pc) => {
    pc.wrap = false;
    fillR(pc, 0, 0, 14, 19, [0x343a3e, 0x465054, 0x5c686c, 0x7a888c, 0x9aa6a8], (x, y) => 0.55 + (x - y * 0.6) * 0.025, 1);
    for (let i = 0; i < 19; i++) { pc.blend(i * 0.7 + 1, 18 - i, 0xe8f2f2, 0.25); }
    pc.line(10, 0, 8, 6, 0xb8c4c4); pc.line(8, 6, 11, 9, 0xb8c4c4); // crack
    pc.strokeRect(0, 0, 14, 19, 0x9aa0a4);
  });
  A.add('p_frosted', 16, 32, (pc) => {
    pc.fillRamp([0xa8b8bc, 0xb8c8cc, 0xc8d6d8, 0xd8e4e4], (x, y) => 0.6 + (tileFbm(x, y, 16, 32, 2, 2, 5) - 0.5) * 0.4 + (x % 5 === 0 ? -0.15 : 0), 1);
    for (let x = 0; x < 16; x += 3) for (let y = 0; y < 32; y++) if (ph(x, y, 7) < 0.15) pc.blend(x, y, 0x8a9a9e, 0.4);
  });
  A.add('p_tile_wall', 16, 16, (pc) => {
    const R = [0xb4bcc0, 0xd4dadc, 0xe8ecec, 0xf6f8f8];
    pc.each((x, y) => {
      const gx = x % 8, gy = y % 8;
      if (gx === 7 || gy === 7) pc.set(x, y, 0x9aa2a4);
      else pc.set(x, y, gx === 0 || gy === 0 ? R[3] : gx === 6 || gy === 6 ? R[1] : R[2]);
    });
    pc.set(3, 3, 0xffffff); pc.set(11, 11, 0xffffff); pc.set(12, 4, 0xc8a878);
  });
  A.add('p_shower_curtain', 16, 32, (pc) => {
    const R = makeRamp(0xa8d8c4, 5, { spread: 0.35 });
    pc.fillRamp(R, (x, y) => 0.55 + Math.sin(x / 16 * Math.PI * 4) * 0.3 + (ph(x, y, 2) - 0.5) * 0.06, 0.6);
    for (let y = 2; y < 32; y += 6) for (let x = (y % 12 === 2 ? 2 : 10); x < 16; x += 16) { pc.set(x, y, 0xf4f0e0); pc.set(x + 1, y, 0xf4f0e0); pc.set(x + 2, y + 1, 0xf4f0e0); pc.set(x, y + 1, 0xe8a0a0); }
    for (let x = 0; x < 16; x++) if (ph(x, 0, 9) < 0.5) { pc.blend(x, 30, 0x4a5a4a, 0.4); pc.blend(x, 31, 0x3a4a3a, 0.5); }
  });
  A.add('p_shower_tray', 28, 28, (pc) => {
    pc.wrap = false;
    for (let y = 0; y < 28; y++) for (let x = 0; x < 28; x++) {
      const d = Math.max(Math.abs(x - 13.5), Math.abs(y - 13.5)) / 14;
      const v = 0.45 + d * 0.5;
      pc.set(x, y, P[Math.min(3, Math.floor(v * 4 + ph(x, y, 6) * 0.3))]);
    }
    pc.circle(14, 14, 2, 0x8a8e92); for (let k = -1; k <= 1; k++) pc.set(14 + k, 14, 0x2a2a2c);
    for (let x = 0; x < 28; x++) { pc.set(x, 0, 0xffffff); pc.blend(x, 27, 0x8a8a8a, 0.4); }
    pc.stain(9, 20, 3, 0xd8c8a0, 0xb8a070, 4);
  });
  A.add('p_urinal_top', 12, 8, (pc) => {
    pc.wrap = false;
    pc.fill(0xf2f4f4);
    enamelOval(pc, 6, 4.5, 4.6, 3.4, [0xa8acb0, 0, 0xffffff], P);
    pc.rect(5, 4, 2, 2, 0x5a8ad8); pc.set(5, 4, 0x8ab4f0); // urinal cake
    pc.set(7, 6, 0x5a5e62);
  });
});

// ============================================================ models
defObj({
  key: 'toilet', name: 'Toilet', height: 0.8, block: 'low', sit: true, movable: 0,
  water: { capacity: 6, tainted: true }, sound: 'ceramic', flammable: 0,
  disassemble: { tools: ['#wrench'], time: 20, skill: 'mechanics', yields: [['pipe', 1, 1], ['scrap_metal', 0, 1]] },
  tags: T('bathroom', 'toilet', 'sit', 'water'),
  model: (mb) => {
    const zt = WZ + 0.1, zb = WZ + 0.42, pc = { color: 0xf4f4f0 };
    mb.push().translate(0, 0, zb).scale(1, 1, 1.25);
    mb.cylinder(0, 0, 0, 0.11, 0.24, 8, 'porcelain', { ...pc, rTop: 0.13 });
    mb.cylinder(0, 0.24, 0, 0.16, 0.14, 10, 'porcelain', { ...pc, rTop: 0.19 });
    mb.cylinder(0, 0.38, 0, 0.195, 0.03, 10, { top: 'p_toilet_seat', sides: 'plastic_white', bottom: 'plastic_white' }, { fit: true, color: 0xfafaf6 });
    mb.pop();
    mb.box(0, 0.3, zt + 0.02, 0.2, 0.14, 0.2, 'porcelain', pc);
    mb.box(0, 0.42, zt, 0.44, 0.36, 0.18, 'porcelain', pc);
    mb.box(0, 0.78, zt, 0.46, 0.04, 0.2, 'porcelain', { color: 0xe8e8e4 });
    mb.box(-0.16, 0.7, zt + 0.095, 0.08, 0.02, 0.025, 'chrome');
    // lid raised against the tank
    mb.push().translate(0, 0.41, zt + 0.1).rotateX(-0.18);
    mb.box(0, 0, 0.015, 0.38, 0.42, 0.025, 'plastic_white', { color: 0xf0f0ec }); mb.pop();
    // supply line
    mb.cylinder(0.17, 0.12, WZ + 0.03, 0.012, 0.3, 6, 'chrome');
    mb.cylinderZ(0.17, 0.12, WZ + 0.015, 0.02, 0.03, 6, 'chrome');
  },
});

defObj({
  key: 'sink_bathroom', name: 'Bathroom Sink', height: 0.95, block: 'low', surface: 0.85, movable: 0,
  water: { capacity: 8, tap: true, tainted: false }, sound: 'ceramic', flammable: 0,
  disassemble: { tools: ['#wrench'], time: 15, skill: 'mechanics', yields: [['pipe', 1, 2]] },
  tags: T('bathroom', 'water', 'sink'),
  model: (mb) => {
    const zc = WZ + 0.24, pc = { color: 0xf4f4f0 };
    mb.cylinder(0, 0, zc - 0.04, 0.1, 0.7, 8, 'porcelain', { ...pc, rTop: 0.07 });
    mb.box(0, 0.68, zc, 0.56, 0.17, 0.46, { top: 'p_sink_basin', all: 'porcelain' }, { fit: { top: true }, ...pc });
    mb.box(0, 0.8, zc + 0.23, 0.56, 0.05, 0.012, 'porcelain', { color: 0xe8e8e4 });
    mb.cylinder(0, 0.85, zc - 0.18, 0.022, 0.1, 6, 'chrome');
    mb.cylinderZ(0, 0.94, zc - 0.13, 0.016, 0.1, 6, 'chrome');
    for (const sx of [-0.12, 0.12]) { mb.cylinder(sx, 0.85, zc - 0.18, 0.025, 0.04, 6, 'chrome'); mb.box(sx, 0.89, zc - 0.18, 0.06, 0.012, 0.012, 'chrome'); mb.box(sx, 0.895, zc - 0.18, 0.016, 0.016, 0.016, sx < 0 ? 'plastic_red' : 'plastic_blue'); }
    mb.box(0.2, 0.85, zc - 0.12, 0.09, 0.02, 0.06, 'plastic_white', { color: 0xf0d8e0 });
    mb.cylinder(-0.2, 0.85, zc - 0.13, 0.03, 0.09, 6, 'glass', { color: 0xc8e0e8 });
    mb.box(-0.2, 0.9, zc - 0.13, 0.008, 0.11, 0.008, 'plastic_blue');
  },
});

defObj({
  key: 'bathtub', name: 'Bathtub', w: 2, d: 1, height: 0.62, block: 'low', movable: 0,
  water: { capacity: 120, tap: true, tainted: false }, sound: 'ceramic', flammable: 0,
  disassemble: { tools: ['#wrench', '#sledge'], time: 40, skill: 'mechanics', yields: [['pipe', 1, 2], ['scrap_metal', 2, 5]] },
  tags: T('bathroom', 'bath', 'water'),
  model: (mb) => {
    const W = 1.66, D = 0.76, zc = WZ + D / 2 + 0.01, y0 = 0.12, H = 0.46, t = 0.06, pc = { color: 0xf6f6f2 };
    // claw feet
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      mb.box(sx * (W / 2 - 0.16), 0, zc + sz * (D / 2 - 0.12), 0.07, 0.04, 0.07, 'metal_brass');
      mb.box(sx * (W / 2 - 0.16), 0.04, zc + sz * (D / 2 - 0.12), 0.05, y0, 0.05, 'metal_brass', { color: 0xd8c090 });
    }
    mb.box(0, y0 - 0.04, zc, W - 0.12, 0.06, D - 0.12, 'porcelain', { color: 0xd8d8d4 });
    mb.box(0, y0, zc + D / 2 - t / 2, W, H, t, 'porcelain', pc);
    mb.box(0, y0, zc - D / 2 + t / 2, W, H, t, 'porcelain', pc);
    mb.box(-W / 2 + t / 2, y0, zc, t, H, D - t * 2, 'porcelain', pc);
    mb.box(W / 2 - t / 2, y0, zc, t, H, D - t * 2, 'porcelain', pc);
    mb.box(0, y0 + 0.02, zc, W - t * 2, 0.02, D - t * 2, { top: 'p_tub_floor', all: 'porcelain' }, { fit: { top: true } });
    // rolled rim
    mb.box(0, y0 + H, zc + D / 2 - t / 2, W + 0.02, 0.035, t + 0.02, 'porcelain', { color: 0xffffff });
    mb.box(0, y0 + H, zc - D / 2 + t / 2, W + 0.02, 0.035, t + 0.02, 'porcelain', { color: 0xffffff });
    mb.box(-W / 2 + t / 2, y0 + H, zc, t + 0.02, 0.035, D - t * 2, 'porcelain', { color: 0xffffff });
    mb.box(W / 2 - t / 2, y0 + H, zc, t + 0.02, 0.035, D - t * 2, 'porcelain', { color: 0xffffff });
    // faucet at the left end + rubber duck
    mb.cylinder(-W / 2 + 0.03, y0 + H + 0.035, zc, 0.02, 0.1, 6, 'chrome');
    mb.cylinderX(-W / 2 + 0.1, y0 + H + 0.12, zc, 0.016, 0.16, 6, 'chrome');
    for (const sz of [-0.1, 0.1]) mb.box(-W / 2 + 0.03, y0 + H + 0.06, zc + sz, 0.04, 0.03, 0.05, 'chrome');
    mb.box(-0.3, y0 + 0.04, zc + 0.08, 0.07, 0.05, 0.05, 'plastic_yellow');
    mb.box(-0.32, y0 + 0.09, zc + 0.08, 0.04, 0.04, 0.035, 'plastic_yellow');
    mb.box(-0.355, y0 + 0.1, zc + 0.08, 0.02, 0.012, 0.02, 'plastic_red', { color: 0xf09030 });
  },
});

defObj({
  key: 'shower_stall', name: 'Shower Stall', height: 2.05, block: 'low', movable: 0,
  water: { capacity: 30, tap: true, tainted: false }, sound: 'ceramic', flammable: 0.1,
  disassemble: { tools: ['#wrench', '#screwdriver'], time: 30, skill: 'mechanics', yields: [['pipe', 1, 2], ['glass_shard', 1, 3], ['scrap_metal', 1, 2]] },
  tags: T('bathroom', 'shower', 'water'),
  model: (mb) => {
    const W = 0.92, H = 2.0;
    mb.box(0, 0, 0, W, 0.1, W, { top: 'p_shower_tray', all: 'porcelain' }, { fit: { top: true } });
    mb.box(0, 0.1, WZ + 0.02, W, H - 0.1, 0.04, { south: 'p_tile_wall', all: 'porcelain' });
    for (const sx of [-1, 1]) {
      mb.box(sx * (W / 2 - 0.015), 0.1, 0.0, 0.03, H - 0.1, W - 0.06, 'p_frosted');
      mb.box(sx * (W / 2 - 0.015), 0.1, W / 2 - 0.02, 0.04, H - 0.1, 0.04, 'metal_brushed');
      mb.box(sx * (W / 2 - 0.015), H - 0.03, 0.0, 0.04, 0.03, W - 0.04, 'metal_brushed');
    }
    // curtain on a rod across the front, half drawn
    mb.cylinderX(0, H - 0.08, W / 2 - 0.05, 0.012, W, 6, 'chrome');
    for (let i = 0; i < 6; i++) {
      const x = -W / 2 + 0.06 + i * 0.08, z = W / 2 - 0.05 + (i % 2 ? 0.03 : -0.02);
      mb.box(x, 0.18, z, 0.085, H - 0.28, 0.02, 'p_shower_curtain', { uvOffset: [i * 0.13, 0] });
    }
    // shower head, mixer, soap dish
    mb.cylinderZ(0, 1.82, WZ + 0.1, 0.012, 0.14, 6, 'chrome');
    mb.cylinder(0, 1.76, WZ + 0.17, 0.05, 0.05, 8, 'chrome', { rTop: 0.03 });
    mb.cylinderZ(0, 1.1, WZ + 0.06, 0.04, 0.04, 8, 'chrome');
    mb.box(0, 1.1, WZ + 0.09, 0.08, 0.014, 0.02, 'chrome');
    mb.box(0.28, 1.0, WZ + 0.07, 0.14, 0.02, 0.07, 'chrome');
    mb.box(0.28, 1.02, WZ + 0.07, 0.08, 0.025, 0.05, 'plastic_white', { color: 0xf0e0b0 });
  },
});

defObj({
  key: 'urinal', name: 'Urinal', height: 1.35, block: 'low', onWall: true, movable: 0,
  water: { capacity: 3, tainted: true }, sound: 'ceramic', flammable: 0,
  disassemble: { tools: ['#wrench'], time: 15, skill: 'mechanics', yields: [['pipe', 1, 1], ['scrap_metal', 0, 1]] },
  tags: T('bathroom', 'toilet', 'water', 'wall'),
  model: (mb) => {
    const pc = { color: 0xf4f4f0 };
    mb.box(0, 0.48, WZ + 0.05, 0.4, 0.64, 0.1, 'porcelain', pc);
    mb.box(0, 0.46, WZ + 0.2, 0.36, 0.26, 0.2, { top: 'p_urinal_top', all: 'porcelain' }, { fit: { top: true }, ...pc });
    for (const sx of [-1, 1]) mb.box(sx * 0.19, 0.55, WZ + 0.17, 0.04, 0.5, 0.18, 'porcelain', { color: 0xeaeae6 });
    mb.box(0, 0.4, WZ + 0.22, 0.2, 0.06, 0.14, 'porcelain', { color: 0xe4e4e0 });
    mb.cylinder(0, 1.12, WZ + 0.06, 0.018, 0.22, 6, 'chrome');
    mb.cylinder(0, 1.3, WZ + 0.06, 0.035, 0.07, 6, 'chrome');
    mb.box(0.06, 1.33, WZ + 0.07, 0.1, 0.015, 0.015, 'chrome');
  },
});

defObj({
  key: 'mirror', name: 'Mirror', height: 1.95, block: 'none', onWall: true, movable: 5,
  sound: 'glass', flammable: 0, tags: T('bathroom', 'home', 'mirror', 'wall'),
  disassemble: { tools: [], time: 4, yields: [['glass_shard', 2, 4]] },
  model: (mb) => {
    const W = 0.52, H = 0.76, y0 = 1.14;
    mb.box(0, y0, WZ + 0.012, W, H, 0.012, { south: 'p_mirror', all: 'metal_brushed' }, { fit: { south: true }, emissive: 0.12 });
    const fz = WZ + 0.014, t = 0.025;
    mb.box(0, y0 + H, fz, W + t * 2, t, 0.03, 'metal_brushed');
    mb.box(0, y0 - t, fz, W + t * 2, t, 0.03, 'metal_brushed');
    mb.box(-W / 2 - t / 2, y0, fz, t, H, 0.03, 'metal_brushed');
    mb.box(W / 2 + t / 2, y0, fz, t, H, 0.03, 'metal_brushed');
    mb.box(0, y0 - 0.1, WZ + 0.06, W, 0.012, 0.11, 'glass', { color: 0xd0e8e8 });
    mb.cylinder(0.15, y0 - 0.088, WZ + 0.06, 0.03, 0.09, 6, 'glass', { color: 0xc8e0e8 });
    mb.box(0.15, y0 - 0.03, WZ + 0.06, 0.008, 0.1, 0.008, 'plastic_red');
  },
});

defObj({
  key: 'medicine_cabinet', name: 'Medicine Cabinet', height: 1.85, block: 'none', onWall: true, movable: 6,
  container: { capacity: 6, kind: 'medical', loot: 'medicine_cabinet' }, sound: 'metal', flammable: 0.1,
  disassemble: { tools: ['#screwdriver'], time: 8, skill: 'mechanics', yields: [['glass_shard', 1, 2], ['scrap_metal', 1, 1], ['screws', 1, 3]] },
  tags: T('bathroom', 'cabinet', 'mirror', 'wall'),
  model: (mb) => {
    const W = 0.46, H = 0.6, D = 0.13, y0 = 1.22, zc = WZ + D / 2;
    mb.box(0, y0, zc, W, H, D, 'plastic_white', { color: 0xe8e8e4 });
    mb.box(0, y0 + 0.015, zc + D / 2 + 0.006, W - 0.03, H - 0.03, 0.012, { south: 'p_medicine_mirror', all: 'chrome' }, { fit: { south: true }, emissive: 0.1 });
    knob(mb, W / 2 - 0.04, y0 + H / 2, zc + D / 2 + 0.012, 0.02, 'chrome');
    mb.box(0, y0 + H, zc, W + 0.02, 0.02, D + 0.01, 'plastic_white', { color: 0xd8d8d4 });
  },
});

defObj({
  key: 'towel_rack', name: 'Towel Rack', height: 1.3, block: 'none', onWall: true, movable: 1,
  sound: 'metal', flammable: 0.4, tags: T('bathroom', 'wall'),
  container: { capacity: 2, kind: 'shelf', loot: 'bathroom_cabinet' },
  disassemble: { tools: ['#screwdriver'], time: 4, yields: [['scrap_metal', 1, 1], ['rag', 1, 2]] },
  model: (mb) => {
    const y = 1.12, z = WZ + 0.07;
    for (const sx of [-0.3, 0.3]) { mb.cylinderZ(sx, y, WZ + 0.035, 0.018, 0.07, 6, 'chrome'); mb.cylinderZ(sx, y, WZ + 0.004, 0.03, 0.008, 6, 'chrome'); }
    mb.cylinderX(0, y, z, 0.012, 0.64, 6, 'chrome');
    const tc = { color: 0xb8d0e8 };
    mb.box(-0.02, y - 0.42, z - 0.025, 0.42, 0.44, 0.012, 'towel', tc);
    mb.box(-0.02, y - 0.3, z + 0.025, 0.42, 0.32, 0.012, 'towel', tc);
    mb.box(-0.02, y + 0.01, z, 0.42, 0.012, 0.06, 'towel', tc);
    mb.box(-0.02, y - 0.27, z + 0.033, 0.42, 0.03, 0.004, 'towel', { color: 0x8ab0d8 });
  },
});

void mixHex;
