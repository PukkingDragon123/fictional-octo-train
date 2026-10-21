// Shared floors and the dimensions (src/world/gen/z_floors, z_chess,
// z_meadow, z_moon, void_kit): floors for the giant chessboard, the future
// grass field and the moon; props for each (a chess clock, humming pylons,
// giant daisies, smiling kiosks, moon rocks, a Remittance lander, a stiff
// flag, an empty debtor suit) and the impossible-scale furniture of the weird
// rooms (a chair the size of a room, a door frame for something tall).
// Texture prefix: vx_
import { defObj } from '../../world/objects';
import { defFloor } from '../../world/defs';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { makeRamp, mixHex, scaleHex, ph, text, textC, glow, rockBlob, discY, rod, torus, fillNoise } from './b_common';
import type { PixelCanvas } from '../../gfx/pixel';
import type { ModelBuilder } from '../../gfx/modelBuilder';
import { lathe, blob, tube, surf, type V3 } from '../../creatures/kit/anomalies';

const T = ['vx', 'dimension'];

// ---------------------------------------------------------------- floors
defFloor({ key: 'vx_chess_w', name: 'Ivory Square', tex: ['vx_chess_w'], sound: 'tile', side: 'vx_chess_side' });
defFloor({ key: 'vx_chess_b', name: 'Onyx Square', tex: ['vx_chess_b'], sound: 'tile', side: 'vx_chess_side' });
defFloor({ key: 'vx_grass', name: 'Perfect Grass', tex: ['vx_grass', 'vx_grass_b'], sound: 'grass', outdoor: true, rotate: true, side: 'vx_meadow_side' });
defFloor({ key: 'vx_path', name: 'Pastel Path', tex: ['vx_path'], sound: 'tile', outdoor: true, side: 'vx_meadow_side' });
defFloor({ key: 'vx_regolith', name: 'Regolith', tex: ['vx_regolith', 'vx_regolith_b'], sound: 'dirt', outdoor: true, rotate: true, cold: -18, side: 'vx_regolith_side' });
defFloor({ key: 'vx_mare', name: 'Mare Dust', tex: ['vx_mare'], sound: 'dirt', outdoor: true, rotate: true, cold: -18, side: 'vx_regolith_side' });
defFloor({ key: 'vx_step', name: 'Stair Stone', tex: ['vx_step'], sound: 'concrete', side: 'vx_step_side' });

// ---------------------------------------------------------------- textures
function marble(pc: PixelCanvas, base: number, vein: number, seed: number) {
  const R = makeRamp(base, 5, { spread: 0.12 });
  pc.each((x, y) => {
    const n = Math.sin((x * 0.35 + y * 0.18) + ph(x >> 2, y >> 2, seed) * 3.2 + ph(x >> 3, y >> 3, seed + 1) * 4);
    let c = R[2 + (ph(x, y, seed + 2) < 0.08 ? 1 : 0)];
    if (Math.abs(n) < 0.08) c = mixHex(c, vein, 0.55);
    else if (Math.abs(n) < 0.16) c = mixHex(c, vein, 0.2);
    pc.set(x, y, c);
  });
  // a hairline bevel so the squares read as slabs
  for (let i = 0; i < 32; i++) { pc.blend(i, 0, 0xffffff, 0.18); pc.blend(0, i, 0xffffff, 0.12); pc.blend(i, 31, 0x000000, 0.18); pc.blend(31, i, 0x000000, 0.12); }
}

addTextureModule(() => {
  const A = atlas();
  A.add('vx_chess_w', 32, 32, (pc) => marble(pc, 0xe8e2d2, 0xa89e88, 9101));
  A.add('vx_chess_b', 32, 32, (pc) => marble(pc, 0x24222a, 0x5a5468, 9111));
  A.add('vx_chess_side', 16, 32, (pc) => {
    const R = makeRamp(0x3a3640, 4, { spread: 0.2 });
    pc.each((x, y) => pc.set(x, y, R[1 + (ph(x, y >> 2, 9121) < 0.2 ? 1 : 0) + (y < 2 ? 2 : 0)]));
  });
  // too-green grass: flat, saturated, with soft pastel sparkles
  const grass = (seed: number) => (pc: PixelCanvas) => {
    const R = makeRamp(0x5ce07a, 5, { spread: 0.18, hueShift: 6 });
    pc.each((x, y) => {
      const n = ph(x >> 1, y >> 2, seed) * 0.6 + ph(x, y, seed + 1) * 0.4;
      pc.set(x, y, R[n < 0.2 ? 1 : n > 0.85 ? 3 : 2]);
    });
    for (let i = 0; i < 9; i++) {
      const x = Math.floor(ph(i, 1, seed + 2) * 30) + 1, y = Math.floor(ph(i, 2, seed + 2) * 30) + 1;
      const c = [0xfff4fc, 0xffd0ec, 0xd8f4ff, 0xfffbd0][i % 4];
      pc.set(x, y, c); pc.blend(x + 1, y, c, 0.4); pc.blend(x, y + 1, c, 0.4);
    }
  };
  A.add('vx_grass', 32, 32, grass(9131));
  A.add('vx_grass_b', 32, 32, grass(9141));
  A.add('vx_meadow_side', 16, 32, (pc) => {
    pc.each((x, y) => pc.set(x, y, y < 3 ? 0x4cc86a : mixHex(0xd8b4d0, 0xa8c4e0, y / 32 + (ph(x, y >> 1, 9151) - 0.5) * 0.1)));
  });
  A.add('vx_path', 32, 32, (pc) => {
    pc.each((x, y) => {
      const tx = x >> 3, ty = y >> 3;
      const c = [0xc8b4d8, 0xb0c8d8, 0xd8c4b0, 0xb8d4b4][(tx + ty * 3 + ((tx * ty) & 1)) & 3];
      pc.set(x, y, (x & 7) === 0 || (y & 7) === 0 ? scaleHex(c, 0.9) : c);
    });
  });
  // the moon: grey dust with tiny craters and boot-sized pocks
  const regolith = (base: number, seed: number) => (pc: PixelCanvas) => {
    const R = makeRamp(base, 6, { spread: 0.22 });
    fillNoise(pc, R, 0.5, 0.18, 4, seed, 0.12, 0.9);
    for (let i = 0; i < 4; i++) {
      const cx = 4 + Math.floor(ph(i, 0, seed) * 24), cy = 4 + Math.floor(ph(i, 1, seed) * 24), r = 1.5 + ph(i, 2, seed) * 2.5;
      for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) {
        const d = Math.hypot(x, y);
        if (d < r) pc.blend(cx + x, cy + y, y < 0 ? R[1] : R[4], 0.55);
        else if (d < r + 1) pc.blend(cx + x, cy + y, y < 0 ? R[4] : R[1], 0.35);
      }
    }
  };
  A.add('vx_regolith', 32, 32, regolith(0x9a9a98, 9161));
  A.add('vx_regolith_b', 32, 32, regolith(0x8e8e8c, 9171));
  A.add('vx_mare', 32, 32, regolith(0x5a5a5e, 9181));
  A.add('vx_regolith_side', 16, 32, (pc) => {
    const R = makeRamp(0x6a6a6c, 5, { spread: 0.25 });
    pc.each((x, y) => pc.set(x, y, R[Math.min(4, Math.floor(ph(x >> 1, y >> 1, 9191) * 3) + (y < 2 ? 2 : 0))]));
  });
  A.add('vx_step', 32, 32, (pc) => {
    const R = makeRamp(0xc8c0b0, 5, { spread: 0.16 });
    fillNoise(pc, R, 0.55, 0.12, 3, 9201, 0.06, 0.8);
    for (let x = 0; x < 32; x++) { pc.set(x, 0, R[4]); pc.set(x, 1, R[3]); }
  });
  A.add('vx_step_side', 16, 32, (pc) => {
    const R = makeRamp(0x8a8478, 5, { spread: 0.2 });
    pc.each((x, y) => pc.set(x, y, R[1 + ((y & 7) === 0 ? 0 : 1) + (ph(x, y, 9211) < 0.1 ? 1 : 0)]));
  });
  // chess clock face: two dials and a flag
  A.add('vx_clockface', 48, 24, (pc) => {
    pc.wrap = false;
    pc.fill(0x1a1610);
    for (const cx of [12, 36]) {
      for (let y = -10; y <= 10; y++) for (let x = -10; x <= 10; x++) { const d = Math.hypot(x, y); if (d < 9.5) pc.set(cx + x, 12 + y, d > 8.5 ? 0xc8a050 : 0xf4ecd8); }
      for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; pc.set(Math.round(cx + Math.cos(a) * 7.5), Math.round(12 + Math.sin(a) * 7.5), 0x2a2018); }
    }
    text(pc, 'W', 10, 17, 0x8a6a30); text(pc, 'B', 34, 17, 0x8a6a30);
  });
  // a smiling screen
  A.add('vx_smile', 24, 20, (pc) => {
    pc.wrap = false;
    pc.each((x, y) => pc.set(x, y, mixHex(0xbff4ff, 0xffd6f0, y / 20)));
    for (const ex of [8, 15]) { pc.set(ex, 6, 0x2a3a6a); pc.set(ex, 7, 0x2a3a6a); }
    for (let x = 6; x <= 17; x++) { const y = Math.round(12 + Math.sin(((x - 6) / 11) * Math.PI) * 3); pc.set(x, y, 0x2a3a6a); }
    textC(pc, 'HAPPY', 12, 1, 0x5a6aa0);
  });
  // the institute's flag: a black square with a gold ring and a tally
  A.add('vx_flag_tex', 24, 16, (pc) => {
    pc.wrap = false;
    pc.fill(0x14161c);
    glow(pc, 12, 8, 6, 6, 0xd8b048, 0.4);
    for (let a = 0; a < 40; a++) { const t = (a / 40) * Math.PI * 2; pc.set(Math.round(12 + Math.cos(t) * 5), Math.round(8 + Math.sin(t) * 5), 0xe8c050); }
    for (let k = 0; k < 4; k++) { pc.set(10 + k, 6, 0xe8c050); pc.set(10 + k, 10, 0xe8c050); }
    pc.set(12, 7, 0xe8c050); pc.set(12, 8, 0xe8c050); pc.set(12, 9, 0xe8c050);
  });
  // Earth, the way it should not look: equirect, oceans too dark, a scar
  A.add('vx_earth', 64, 32, (pc) => {
    pc.wrap = true;
    pc.each((x, y) => {
      const lat = (y / 32 - 0.5) * Math.PI;
      const n = ph(x >> 3, y >> 2, 9221) * 0.55 + ph(x >> 2, y >> 1, 9222) * 0.3 + ph(x, y, 9223) * 0.15;
      const ice = Math.abs(lat) > 1.2;
      let c = n > 0.58 ? mixHex(0x4a7a3a, 0xb09a68, ph(x >> 2, y >> 2, 9224)) : mixHex(0x10305a, 0x1c4a8a, n);
      if (ice) c = 0xe8f0f4;
      if (ph(x >> 1, y, 9225) > 0.9) c = mixHex(c, 0xffffff, 0.7); // cloud
      pc.set(x, y, c);
    });
    for (let x = 20; x < 44; x++) { const y = Math.round(16 + Math.sin(x * 0.4) * 2); pc.set(x, y, 0xff5a2a); pc.blend(x, y + 1, 0x3a0a04, 0.7); }
  });
  A.add('vx_lander_foil', 16, 16, (pc) => {
    pc.each((x, y) => {
      const n = ph(x >> 1, y >> 1, 9231);
      pc.set(x, y, mixHex(0xc89a30, 0xffe08a, n) );
    });
  });
  A.add('vx_stencil', 32, 8, (pc) => {
    pc.wrap = false; pc.fill(0xe8e6e0);
    textC(pc, 'REMITTANCE', 16, 1, 0x2a2a30);
  });
});

// ---------------------------------------------------------------- shared forms: nothing here is a raw box
/** a box with chamfered edges and corners (bevel c), standing on y0, centred on (cx, cz) */
export function chamferBox(mb: ModelBuilder, cx: number, y0: number, cz: number, w: number, h: number, d: number, c: number, tex: string, o: { color?: number; emissive?: number } = {}) {
  const hx = w / 2, hy = h / 2, hz = d / 2, cy = y0 + hy;
  c = Math.min(c, hx * 0.45, hy * 0.45, hz * 0.45);
  const ix = hx - c, iy = hy - c, iz = hz - c;
  const col = o.color ?? 0xffffff, em = o.emissive ?? 0;
  const put = (pts: number[][]) => {
    const p = pts.map((q) => [cx + q[0], cy + q[1], cz + q[2]]);
    // outward winding: compare the face normal with the direction from the centre
    const a = p[1].map((v, k) => v - p[0][k]), b = p[2].map((v, k) => v - p[0][k]);
    const n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const m = pts.reduce((s, q) => [s[0] + q[0], s[1] + q[1], s[2] + q[2]], [0, 0, 0]);
    if (n[0] * m[0] + n[1] * m[1] + n[2] * m[2] < 0) p.reverse();
    const ax = Math.abs(n[0]) > Math.abs(n[1]) && Math.abs(n[0]) > Math.abs(n[2]) ? 0 : Math.abs(n[1]) > Math.abs(n[2]) ? 1 : 2;
    const uvs = p.map((q) => (ax === 0 ? [q[2], q[1]] : ax === 1 ? [q[0], q[2]] : [q[0], q[1]]));
    const shade = 0.82 + 0.18 * Math.max(0, n[1] / (Math.hypot(n[0], n[1], n[2]) || 1));
    if (p.length === 4) mb.quadRaw(p, uvs, tex, col, shade, em); else mb.triRaw(p, uvs, tex, col, shade, em);
  };
  for (const s of [1, -1]) {
    put([[-ix, s * hy, -iz], [ix, s * hy, -iz], [ix, s * hy, iz], [-ix, s * hy, iz]]);
    put([[s * hx, -iy, -iz], [s * hx, iy, -iz], [s * hx, iy, iz], [s * hx, -iy, iz]]);
    put([[-ix, -iy, s * hz], [ix, -iy, s * hz], [ix, iy, s * hz], [-ix, iy, s * hz]]);
  }
  for (const sx of [1, -1]) for (const sy of [1, -1]) {
    put([[sx * ix, sy * hy, -iz], [sx * ix, sy * hy, iz], [sx * hx, sy * iy, iz], [sx * hx, sy * iy, -iz]]);
    put([[-ix, sy * hy, sx * iz], [ix, sy * hy, sx * iz], [ix, sy * iy, sx * hz], [-ix, sy * iy, sx * hz]]);
    put([[sx * hx, -iy, sy * iz], [sx * hx, iy, sy * iz], [sx * ix, iy, sy * hz], [sx * ix, -iy, sy * hz]]);
    for (const sz of [1, -1]) put([[sx * ix, sy * hy, sz * iz], [sx * hx, sy * iy, sz * iz], [sx * ix, sy * iy, sz * hz]]);
  }
}
/** a rounded post: a smooth lathe with a domed top and a flared foot */
function post(mb: ModelBuilder, x: number, z: number, r: number, h: number, tex: string, color: number) {
  lathe(mb, [x, 0, z], [[0, 0], [r * 1.5, 0], [r * 1.4, r * 0.8], [r, r * 1.6], [r, h - r], [r * 0.7, h - r * 0.25], [0, h]], 10, tex, { color });
}

// ---------------------------------------------------------------- the chessboard
defObj({
  key: 'vx_chess_clock', name: 'Chess Clock', w: 2, d: 1, height: 3.2, block: 'solid', blocksSight: true, tall: true, movable: 0, hp: 99999,
  sound: 'wood', tags: [...T, 'chess', 'fixed'],
  desc: 'A chess clock as tall as a door. Both buttons are down. It still ticks, and on every tick something on the board decides.',
  model: (mb) => {
    chamferBox(mb, 0, 0, 0, 1.95, 0.3, 0.95, 0.06, 'wood_dark', { color: 0x6a4a2a });
    chamferBox(mb, 0, 0.3, 0, 1.9, 1.6, 0.9, 0.12, 'wood_dark', { color: 0x7a5434 });
    // two dials in round brass bezels, front and back
    for (const z of [0.452, -0.452]) for (const sx of [-0.45, 0.45]) {
      mb.push(); mb.translate(sx, 1.0, z); mb.rotateX(Math.PI / 2 * (z > 0 ? 1 : -1));
      mb.cylinder(0, -0.02, 0, 0.38, 0.04, 20, 'metal_grey', { color: 0xc8a050 });
      mb.pop();
    }
    mb.box(0, 0.6, 0.47, 1.7, 0.85, 0.01, 'vx_clockface', { fit: true, emissive: 0.5 });
    mb.box(0, 0.6, -0.47, 1.7, 0.85, 0.01, 'vx_clockface', { fit: true, emissive: 0.5 });
    for (const sx of [-0.5, 0.5]) {
      lathe(mb, [sx, 1.9, 0], [[0, 0], [0.13, 0], [0.11, 0.2], [0.21, 0.24], [0.22, 0.3], [0.15, 0.34], [0, 0.35]], 14, 'metal_grey', { color: 0xd8b060 });
    }
  },
});

// ---------------------------------------------------------------- the future grass field
const PASTEL = [0xffc8e8, 0xc8e8ff, 0xfff0b8, 0xd8ffd8, 0xe8d0ff];
defObj({
  key: 'vx_pylon', name: 'Humming Pylon', height: 3.4, block: 'solid', tall: true, movable: 0, hp: 99999, sound: 'plastic',
  tags: [...T, 'meadow', 'fixed', 'light'], hum: 'hum_fluoro',
  desc: 'A smooth white post with no seams and no maker. It hums a chord that is a little too pleasant to be an accident.',
  light: { color: 0xffd8f4, intensity: 0.4, radius: 5, y: 3.2, kind: 'lamp', power: false },
  variant: (s) => String((s.v ?? 0) % 5),
  model: (mb, s) => {
    const c = PASTEL[(s.v ?? 0) % 5];
    lathe(mb, [0, 0, 0], [[0, 0], [0.3, 0], [0.3, 0.06], [0.2, 0.2], [0.13, 0.6], [0.1, 2.6], [0.14, 2.82], [0.08, 2.9], [0, 2.9]], 16, 'white', { color: 0xfafafc });
    blob(mb, [0, 3.1, 0], [0.26, 0.26, 0.26], 16, 10, 'white', { color: c, emissive: 0.9 });
    torus(mb, 0, 3.1, 0, 0.42, 0.025, 20, 5, 'white', { color: c, emissive: 0.6 });
  },
});
defObj({
  key: 'vx_daisy', name: 'Giant Daisy', height: 2.8, block: 'solid', tall: true, foliage: false, movable: 0, hp: 160, sound: 'fabric',
  tags: [...T, 'meadow', 'plant'], flammable: 0.3,
  desc: 'A daisy taller than you, too symmetrical, with a face of tiny seeds that all point at you.',
  variant: (s) => String((s.v ?? 0) % 5),
  model: (mb, s) => {
    const v = (s.v ?? 0) % 5, c = PASTEL[v];
    const h = 2.2 + (v % 3) * 0.25;
    // a curving stem, two soft leaves, a head of rounded petals round a domed seed face
    tube(mb, [[0, 0, 0], [0.03, h * 0.35, 0.02], [0.1, h * 0.7, 0.02], [0.08, h, 0.04]], (t) => 0.055 - t * 0.02, 7, 'white', { color: 0x58c870 });
    blob(mb, [0.2, h * 0.42, 0.02], [0.24, 0.035, 0.1], 10, 5, 'white', { color: 0x6ad880 });
    blob(mb, [-0.16, h * 0.28, 0.0], [0.2, 0.03, 0.09], 10, 5, 'white', { color: 0x5cd070 });
    mb.push(); mb.translate(0.08, h, 0.04); mb.rotateX(-1.1);
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; blob(mb, [Math.sin(a) * 0.42, 0, Math.cos(a) * 0.42], [0.13, 0.03, 0.3], 8, 4, 'white', { color: k % 2 ? 0xffffff : c }); }
    blob(mb, [0, 0.03, 0], [0.24, 0.09, 0.24], 14, 7, 'white', { color: 0xffd040, emissive: 0.3 });
    mb.pop();
  },
});
defObj({
  key: 'vx_bench', name: 'Future Bench', w: 2, d: 1, height: 0.8, block: 'low', movable: 0, hp: 400, sound: 'plastic', sit: true,
  tags: [...T, 'meadow', 'seat'],
  desc: 'One continuous piece of warm white plastic. There is a dent in it exactly your size.',
  model: (mb) => {
    chamferBox(mb, 0, 0.32, 0.02, 1.8, 0.12, 0.56, 0.05, 'white', { color: 0xf8f6f2 });
    chamferBox(mb, 0, 0.44, -0.24, 1.8, 0.42, 0.08, 0.035, 'white', { color: 0xf4f2ee });
    for (const sx of [-0.7, 0.7]) lathe(mb, [sx, 0, 0], [[0, 0], [0.2, 0], [0.18, 0.04], [0.11, 0.18], [0.14, 0.3], [0.2, 0.33], [0, 0.33]], 12, 'white', { color: 0xe8e6e2 });
  },
});
defObj({
  key: 'vx_orb', name: 'Pastel Orb', height: 1.6, block: 'solid', movable: 0, hp: 99999, sound: 'glass',
  tags: [...T, 'meadow', 'fixed'],
  desc: 'A sphere on a plinth, softly lit from inside. If you look at it long enough it looks back.',
  variant: (s) => String((s.v ?? 0) % 5),
  model: (mb, s) => {
    const c = PASTEL[(s.v ?? 0) % 5];
    lathe(mb, [0, 0, 0], [[0, 0], [0.34, 0], [0.34, 0.06], [0.26, 0.14], [0.22, 0.62], [0.3, 0.68], [0.18, 0.72], [0, 0.72]], 16, 'white', { color: 0xf6f6fa });
    blob(mb, [0, 1.12, 0], [0.42, 0.42, 0.42], 18, 12, 'white', { color: c, emissive: 0.55 });
  },
});
defObj({
  key: 'vx_kiosk', name: 'Smiling Kiosk', height: 2.0, block: 'solid', tall: true, movable: 0, hp: 300, sound: 'plastic',
  tags: [...T, 'meadow', 'screen'],
  desc: 'A kiosk with a smiling screen. HAVE A NICE FOREVER, it says, and the smile gets wider when you leave.',
  model: (mb) => {
    lathe(mb, [0, 0, 0], [[0, 0], [0.42, 0], [0.4, 0.06], [0.24, 0.3], [0.2, 1.1], [0, 1.1]], 14, 'white', { color: 0xfafafc });
    chamferBox(mb, 0, 1.1, 0, 0.92, 0.78, 0.2, 0.08, 'white', { color: 0xf0eef4 });
    mb.box(0, 1.17, 0.102, 0.78, 0.62, 0.01, 'vx_smile', { fit: true, emissive: 0.8 });
  },
});

// ---------------------------------------------------------------- the moon
defObj({
  key: 'vx_moon_rock', name: 'Moon Rock', height: 0.7, block: 'low', movable: 0, hp: 99999, sound: 'metal',
  tags: [...T, 'moon', 'rock', 'fixed'],
  desc: 'Grey, sharp-edged, never weathered. It is lighter than it looks, and colder than anything should be.',
  variant: (s) => String((s.v ?? 0) % 6),
  model: (mb, s) => {
    const v = (s.v ?? 0) % 6;
    rockBlob(mb, 0, 0, 0, 0.32 + (v % 3) * 0.1, 0.4 + (v % 2) * 0.25, 0.3 + (v % 3) * 0.08, 9301 + v, 'vx_regolith_side', 10, 6, { jit: 0.3 });
    if (v > 2) rockBlob(mb, 0.28, 0, 0.2, 0.16, 0.2, 0.14, 9311 + v, 'vx_regolith_side', 8, 4);
  },
});
defObj({
  key: 'vx_boulder', name: 'Boulder', w: 2, d: 2, height: 1.8, block: 'solid', blocksSight: true, movable: 0, hp: 99999, sound: 'metal',
  tags: [...T, 'moon', 'rock', 'fixed'],
  desc: 'A boulder that rolled here a billion years ago and stopped exactly here, next to your footprints.',
  variant: (s) => String((s.v ?? 0) % 3),
  model: (mb, s) => { const v = (s.v ?? 0) % 3; rockBlob(mb, 0, 0, 0, 0.92, 1.5 + v * 0.2, 0.86, 9321 + v, 'vx_regolith_side', 12, 7, { jit: 0.26 }); },
});
defObj({
  key: 'vx_lander', name: 'Remittance Lander', w: 2, d: 2, height: 3.2, block: 'solid', blocksSight: true, tall: true, movable: 0, hp: 99999, sound: 'metal',
  tags: [...T, 'moon', 'vehicle', 'fixed'],
  desc: 'A landing module with REMITTANCE stencilled on the foil. The hatch is open. The ladder is folded up from the inside.',
  model: (mb) => {
    // legs: struts to round footpads
    for (const [lx, lz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) {
      tube(mb, [[lx * 0.55, 1.05, lz * 0.55], [lx * 0.85, 0.5, lz * 0.85], [lx, 0.1, lz]], 0.045, 6, 'metal_grey', { color: 0xc8c8cc });
      lathe(mb, [lx, 0, lz], [[0, 0], [0.2, 0], [0.18, 0.05], [0.06, 0.1], [0, 0.11]], 12, 'metal_grey', { color: 0xb8b8b8 });
    }
    // gold-foil descent stage (octagonal, chamfered), the crew cabin above with a stencil band and a dark hatch
    lathe(mb, [0, 0.75, 0], [[0, 0], [0.8, 0], [0.82, 0.06], [0.82, 0.78], [0.76, 0.86], [0, 0.86]], 8, 'vx_lander_foil', { color: 0xffffff, flat: true });
    chamferBox(mb, 0, 1.6, 0, 1.2, 0.9, 1.2, 0.12, 'metal_grey', { color: 0xd8d8dc });
    mb.box(0, 1.86, 0.605, 0.9, 0.22, 0.01, 'vx_stencil', { fit: true });
    chamferBox(mb, 0, 1.64, 0.59, 0.5, 0.22, 0.04, 0.015, 'white', { color: 0x101014 });
    lathe(mb, [0, 2.5, 0], [[0, 0], [0.24, 0], [0.22, 0.12], [0.1, 0.42], [0.04, 0.5], [0, 0.52]], 12, 'metal_grey', { color: 0xc8c8cc });
    tube(mb, [[0.55, 2.5, -0.3], [0.55, 3.05, -0.3]], 0.025, 5, 'metal_grey', { color: 0xa8a8ac });
    blob(mb, [0.55, 3.08, -0.3], [0.08, 0.08, 0.08], 8, 5, 'white', { color: 0xff3020, emissive: 1 });
  },
});
defObj({
  key: 'vx_flag', name: 'Institute Flag', height: 2.4, block: 'low', movable: 0, hp: 200, sound: 'metal',
  tags: [...T, 'moon', 'fixed'],
  desc: 'The Meridian Institute planted its flag here. There is no wind, so a wire holds it out. The wire is the only thing that moves.',
  model: (mb) => {
    post(mb, 0, 0, 0.025, 2.35, 'metal_grey', 0xd8d8d8);
    tube(mb, [[0, 2.25, 0], [0.92, 2.25, 0]], 0.012, 5, 'metal_grey', { color: 0xb8b8b8 });
    // the cloth: a few ripples frozen in vacuum
    surf(mb, 8, 2, (i, j) => [0.02 + (i / 8) * 0.9, 2.22 - (j / 2) * 0.6, Math.sin(i * 1.3) * 0.035], (i, j) => [i / 8, 1 - j / 2], 'vx_flag_tex', { inside: null, flat: false });
    surf(mb, 8, 2, (i, j) => [0.02 + (i / 8) * 0.9, 2.22 - (j / 2) * 0.6, Math.sin(i * 1.3) * 0.035 - 0.004], (i, j) => [i / 8, 1 - j / 2], 'vx_flag_tex', { inside: null, flip: true });
  },
});
defObj({
  key: 'vx_suit_empty', name: 'Empty Jumpsuit', height: 0.3, block: 'none', movable: 18, hp: 60, sound: 'fabric',
  tags: [...T, 'moon', 'body'],
  container: { capacity: 12, name: 'Pockets', kind: 'pile', loot: 'zw_survivor' },
  desc: 'A yellow debtor jumpsuit lying flat in the dust, arms out, as if whoever was inside it simply left. The band is still on the cuff.',
  model: (mb) => {
    const Y = 0xd8b020;
    // a deflated suit: a flattened torso, sleeves and legs as squashed tubes lying in the dust, an empty hood
    blob(mb, [0, 0.06, 0.05], [0.22, 0.06, 0.34], 12, 6, 'white', { color: Y });
    const flat = (pts: V3[], r: number, c: number) => tube(mb, pts, r, 7, 'white', { color: c, squash: [1, 0.45], capStart: true, capEnd: true });
    flat([[-0.18, 0.05, 0.3], [-0.38, 0.04, 0.4], [-0.55, 0.035, 0.32]], 0.07, Y);
    flat([[0.18, 0.05, 0.3], [0.36, 0.04, 0.46], [0.56, 0.035, 0.52]], 0.07, Y);
    flat([[-0.1, 0.05, -0.25], [-0.13, 0.04, -0.55], [-0.16, 0.035, -0.85]], 0.08, scaleHex(Y, 0.92));
    flat([[0.1, 0.05, -0.25], [0.16, 0.04, -0.55], [0.24, 0.035, -0.82]], 0.08, scaleHex(Y, 0.92));
    lathe(mb, [0.57, 0.02, 0.53], [[0, 0], [0.05, 0], [0.055, 0.03], [0.045, 0.07], [0, 0.07]], 10, 'metal_grey', { color: 0x30343a, emissive: 0.2 });
    blob(mb, [0, 0.06, 0.5], [0.13, 0.05, 0.12], 10, 5, 'white', { color: 0xe8e8ea });
  },
});

// ---------------------------------------------------------------- impossible scale
defObj({
  key: 'vx_giant_chair', name: 'Chair', w: 3, d: 3, height: 5.6, block: 'solid', blocksSight: true, tall: true, movable: 0, hp: 99999, sound: 'wood',
  tags: [...T, 'scale', 'fixed'],
  desc: 'An ordinary wooden kitchen chair, five metres tall. The seat is above your head. There is gum under it, the size of a pillow.',
  model: (mb) => {
    const W = 0x9a6a3c;
    // turned legs (lathed), a chamfered seat, a curved back of three rails on two posts
    for (const [lx, lz] of [[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]]) lathe(mb, [lx, 0, lz], [[0, 0], [0.1, 0], [0.11, 0.3], [0.13, 0.9], [0.1, 1.3], [0.14, 1.6], [0.12, 2.7], [0, 2.7]], 10, 'wood_dark', { color: W });
    chamferBox(mb, 0, 2.7, 0, 2.7, 0.2, 2.7, 0.07, 'wood_light', { color: W });
    for (const lx of [-1.1, 1.1]) lathe(mb, [lx, 2.9, -1.1], [[0, 0], [0.12, 0], [0.11, 1.0], [0.13, 2.4], [0.09, 2.62], [0, 2.7]], 10, 'wood_dark', { color: W });
    for (const y of [3.9, 4.75, 5.35]) tube(mb, [[-1.15, y, -1.1], [0, y + 0.04, -1.22], [1.15, y, -1.1]], 0.09, 6, 'wood_light', { color: W, squash: [1.6, 1] });
    tube(mb, [[-1.1, 1.0, 0], [1.1, 1.0, 0]], 0.07, 6, 'wood_dark', { color: scaleHex(W, 0.85) });
    blob(mb, [0.4, 2.62, 0.3], [0.3, 0.08, 0.24], 10, 5, 'white', { color: 0xe890a8 });
  },
});
defObj({
  key: 'vx_giant_frame', name: 'Door Frame', w: 3, d: 1, height: 7.2, block: 'none', tall: true, movable: 0, hp: 99999, sound: 'wood',
  tags: [...T, 'scale', 'fixed', 'portal_like'],
  desc: 'A door frame seven metres tall with nothing in it but black. Whatever it was built for has not needed it in a while.',
  model: (mb) => {
    chamferBox(mb, -1.45, 0, 0, 0.3, 7.0, 0.4, 0.05, 'wood_dark', { color: 0xe8e0c8 });
    chamferBox(mb, 1.45, 0, 0, 0.3, 7.0, 0.4, 0.05, 'wood_dark', { color: 0xe8e0c8 });
    chamferBox(mb, 0, 7.0, 0, 3.3, 0.3, 0.44, 0.06, 'wood_dark', { color: 0xe8e0c8 });
    mb.box(0, 0, 0, 2.6, 7.0, 0.04, 'white', { color: 0x020203, ao: false });
    lathe(mb, [0.9, 3.3, 0.02], [[0, 0], [0.06, 0], [0.12, 0.08], [0.12, 0.14], [0, 0.22]], 12, 'metal_grey', { color: 0xc8a050 });
  },
});
defObj({
  key: 'vx_stair_sign', name: 'Sign', height: 2.2, block: 'low', movable: 0, hp: 200, sound: 'metal',
  tags: [...T, 'sign'],
  desc: 'A sign on a pole: UP. There is no UP. There is only further.',
  model: (mb) => {
    post(mb, 0, 0, 0.03, 2.0, 'metal_grey', 0x8a8a84);
    chamferBox(mb, 0, 1.4, 0.04, 0.7, 0.4, 0.03, 0.04, 'white', { color: 0x2a6a3a });
    // a raised arrow pointing up, rounded
    tube(mb, [[0, 1.48, 0.06], [0, 1.72, 0.06]], 0.025, 6, 'white', { color: 0xffffff, emissive: 0.4, capStart: true, capEnd: true });
    tube(mb, [[-0.09, 1.63, 0.06], [0, 1.72, 0.06], [0.09, 1.63, 0.06]], 0.022, 6, 'white', { color: 0xffffff, emissive: 0.4, capStart: true, capEnd: true });
  },
});
/** the rounded stone nosing on each step of the giant stairs (faces down the flight) */
defObj({
  key: 'vx_step_nosing', name: 'Step', height: 0.12, block: 'none', movable: 0, hp: 99999, sound: 'metal',
  tags: [...T, 'stairs', 'fixed', 'decor'], noShadow: true,
  desc: 'A stone step, worn smooth at the edge by nobody.',
  model: (mb) => {
    tube(mb, [[-0.5, -0.05, 0.44], [0.5, -0.05, 0.44]], 0.07, 8, 'vx_step', { color: 0xd8d0c0 });
    chamferBox(mb, 0, -0.02, 0.36, 1.0, 0.04, 0.12, 0.015, 'vx_step', { color: 0xc8c0b0 });
  },
});

// ---------------------------------------------------------------- signs: where you are, on enamel
/** plate size for a sign's text ('LINE ONE|LINE TWO'): the face texture (src/social/signs.ts) is painted to the same size */
export function signDims(text: string): { lines: string[]; W: number; H: number; yc: number; lh: number[] } {
  const lines = String(text || 'SIGN').toUpperCase().split('|').slice(0, 3);
  const lh = lines.map((_, k) => (k === 0 ? 0.26 : 0.17));
  const W = Math.max(1.0, Math.max(...lines.map((l, k) => l.length * lh[k] * 0.5)) + 0.34);
  const H = lh.reduce((a, b) => a + b, 0) + 0.16;
  return { lines, W, H, yc: 1.55, lh };
}
defObj({
  key: 'vx_sign', name: 'Sign', w: 2, d: 1, height: 2.4, block: 'low', movable: 0, hp: 600, sound: 'metal',
  tags: [...T, 'sign', 'fixed'],
  desc: 'An enamel sign on two posts. Someone put it here before anyone arrived.',
  variant: (s) => `${s.text}|${s.c}`,
  model: (mb, s) => {
    const { W, H, yc } = signDims(String(s.text || 'SIGN'));
    const plate = Number(s.c ?? 0x1e4a3a);
    // round posts with domed caps, a plate with softened edges in a rolled rim, bolt heads; the lettering is painted on by src/social/signs.ts
    for (const sx of [-W / 2 + 0.12, W / 2 - 0.12]) post(mb, sx, -0.06, 0.04, yc + H / 2 + 0.08, 'metal_grey', 0x6a6a64);
    chamferBox(mb, 0, yc - H / 2, 0, W, H, 0.05, 0.02, 'white', { color: plate });
    for (const y of [yc + H / 2, yc - H / 2]) tube(mb, [[-W / 2 - 0.02, y, 0], [W / 2 + 0.02, y, 0]], 0.022, 6, 'metal_grey', { color: 0xb0b0a8, capStart: true, capEnd: true });
    for (const sx of [-W / 2 + 0.06, W / 2 - 0.06]) for (const sy of [yc - H / 2 + 0.06, yc + H / 2 - 0.07]) for (const z of [0.03, -0.03]) blob(mb, [sx, sy, z], [0.018, 0.018, 0.008], 6, 3, 'white', { color: 0xb8b8b0 });
  },
});
void mixHex; void discY; void rod;
