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

// ---------------------------------------------------------------- the chessboard
defObj({
  key: 'vx_chess_clock', name: 'Chess Clock', w: 2, d: 1, height: 3.2, block: 'solid', blocksSight: true, tall: true, movable: 0, hp: 99999,
  sound: 'wood', tags: [...T, 'chess', 'fixed'],
  desc: 'A chess clock as tall as a door. Both buttons are down. It still ticks, and on every tick something on the board decides.',
  model: (mb) => {
    mb.box(0, 0, 0, 1.95, 0.3, 0.95, 'wood_dark', { color: 0x6a4a2a });
    mb.box(0, 0.3, 0, 1.9, 1.6, 0.9, 'wood_dark', { color: 0x7a5434 });
    mb.box(0, 0.55, 0.455, 1.7, 0.85, 0.02, 'vx_clockface', { fit: true, emissive: 0.5 });
    mb.box(0, 0.55, -0.455, 1.7, 0.85, 0.02, 'vx_clockface', { fit: true, emissive: 0.5 });
    for (const sx of [-0.5, 0.5]) { mb.cylinder(sx, 1.9, 0, 0.12, 0.25, 8, 'metal_grey', { color: 0xc8a050 }); mb.cylinder(sx, 2.15, 0, 0.2, 0.08, 10, 'metal_grey', { color: 0xd8b060 }); }
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
    mb.cylinder(0, 0, 0, 0.26, 0.12, 12, 'white', { color: 0xf4f4f8 });
    mb.cylinder(0, 0.12, 0, 0.16, 2.8, 12, 'white', { color: 0xfafafc, rTop: 0.1 });
    mb.sphere(0, 3.08, 0, 0.26, 12, 8, 'white', { color: c, emissive: 0.9 });
    torus(mb, 0, 3.08, 0, 0.42, 0.025, 16, 4, 'white', { color: c, emissive: 0.6 });
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
    rod(mb, 0, 0, 0, 0.08, h, 0.04, 0.05, 6, 'white', { color: 0x58c870 });
    mb.box(0.15, h * 0.45, 0, 0.42, 0.03, 0.18, 'white', { color: 0x6ad880 });
    mb.push(); mb.translate(0.08, h, 0.04); mb.rotateX(-1.1);
    for (let k = 0; k < 10; k++) { mb.push(); mb.rotateY((k / 10) * Math.PI * 2); mb.box(0, 0, 0.42, 0.22, 0.04, 0.62, 'white', { color: k % 2 ? 0xffffff : c }); mb.pop(); }
    mb.cylinder(0, -0.02, 0, 0.24, 0.1, 12, 'white', { color: 0xffd040, emissive: 0.3 });
    mb.pop();
  },
});
defObj({
  key: 'vx_bench', name: 'Future Bench', w: 2, d: 1, height: 0.8, block: 'low', movable: 0, hp: 400, sound: 'plastic', sit: true,
  tags: [...T, 'meadow', 'seat'],
  desc: 'One continuous piece of warm white plastic. There is a dent in it exactly your size.',
  model: (mb) => {
    mb.box(0, 0.36, 0, 1.8, 0.12, 0.6, 'white', { color: 0xf8f6f2 });
    mb.box(0, 0.48, -0.26, 1.8, 0.4, 0.08, 'white', { color: 0xf4f2ee });
    for (const sx of [-0.7, 0.7]) mb.cylinder(sx, 0, 0, 0.12, 0.36, 10, 'white', { color: 0xe8e6e2, rTop: 0.2 });
  },
});
defObj({
  key: 'vx_orb', name: 'Pastel Orb', height: 1.6, block: 'solid', movable: 0, hp: 99999, sound: 'glass',
  tags: [...T, 'meadow', 'fixed'],
  desc: 'A sphere on a plinth, softly lit from inside. If you look at it long enough it looks back.',
  variant: (s) => String((s.v ?? 0) % 5),
  model: (mb, s) => {
    const c = PASTEL[(s.v ?? 0) % 5];
    mb.cylinder(0, 0, 0, 0.32, 0.7, 10, 'white', { color: 0xf6f6fa, rTop: 0.22 });
    mb.sphere(0, 1.1, 0, 0.42, 14, 10, 'white', { color: c, emissive: 0.55 });
  },
});
defObj({
  key: 'vx_kiosk', name: 'Smiling Kiosk', height: 2.0, block: 'solid', tall: true, movable: 0, hp: 300, sound: 'plastic',
  tags: [...T, 'meadow', 'screen'],
  desc: 'A kiosk with a smiling screen. HAVE A NICE FOREVER, it says, and the smile gets wider when you leave.',
  model: (mb) => {
    mb.box(0, 0, 0, 0.7, 1.2, 0.5, 'white', { color: 0xfafafc });
    mb.box(0, 1.2, 0, 0.9, 0.75, 0.16, 'white', { color: 0xf0eef4 });
    mb.box(0, 1.24, 0.09, 0.8, 0.66, 0.01, 'vx_smile', { fit: true, emissive: 0.8 });
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
    rockBlob(mb, 0, 0, 0, 0.32 + (v % 3) * 0.1, 0.4 + (v % 2) * 0.25, 0.3 + (v % 3) * 0.08, 9301 + v, 'vx_regolith_side', 7, 4, { jit: 0.35 });
    if (v > 2) rockBlob(mb, 0.28, 0, 0.2, 0.16, 0.2, 0.14, 9311 + v, 'vx_regolith_side', 6, 3);
  },
});
defObj({
  key: 'vx_boulder', name: 'Boulder', w: 2, d: 2, height: 1.8, block: 'solid', blocksSight: true, movable: 0, hp: 99999, sound: 'metal',
  tags: [...T, 'moon', 'rock', 'fixed'],
  desc: 'A boulder that rolled here a billion years ago and stopped exactly here, next to your footprints.',
  variant: (s) => String((s.v ?? 0) % 3),
  model: (mb, s) => { const v = (s.v ?? 0) % 3; rockBlob(mb, 0, 0, 0, 0.92, 1.5 + v * 0.2, 0.86, 9321 + v, 'vx_regolith_side', 9, 5, { jit: 0.3 }); },
});
defObj({
  key: 'vx_lander', name: 'Remittance Lander', w: 2, d: 2, height: 3.2, block: 'solid', blocksSight: true, tall: true, movable: 0, hp: 99999, sound: 'metal',
  tags: [...T, 'moon', 'vehicle', 'fixed'],
  desc: 'A landing module with REMITTANCE stencilled on the foil. The hatch is open. The ladder is folded up from the inside.',
  model: (mb) => {
    for (const [lx, lz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) { rod(mb, lx * 0.6, 1.0, lz * 0.6, lx, 0.08, lz, 0.04, 5, 'metal_grey'); discY(mb, lx, 0.02, lz, 0.18, 8, 'metal_grey', { color: 0xb8b8b8 }); }
    mb.cylinder(0, 0.8, 0, 0.78, 0.8, 8, 'vx_lander_foil', { color: 0xffffff });
    mb.box(0, 1.6, 0, 1.2, 0.9, 1.2, { sides: 'metal_grey', top: 'metal_grey' }, { color: 0xd8d8dc });
    mb.box(0, 1.85, 0.61, 0.9, 0.22, 0.01, 'vx_stencil', { fit: true });
    mb.box(0, 1.62, 0.61, 0.5, 0.2, 0.02, 'white', { color: 0x101014 });
    mb.cylinder(0, 2.5, 0, 0.22, 0.5, 8, 'metal_grey', { color: 0xc8c8cc, rTop: 0.04 });
    mb.box(0.55, 2.55, -0.3, 0.06, 0.6, 0.06, 'metal_grey');
    mb.sphere(0.55, 2.95, -0.3, 0.09, 6, 4, 'white', { color: 0xff3020, emissive: 1 });
  },
});
defObj({
  key: 'vx_flag', name: 'Institute Flag', height: 2.4, block: 'low', movable: 0, hp: 200, sound: 'metal',
  tags: [...T, 'moon', 'fixed'],
  desc: 'The Meridian Institute planted its flag here. There is no wind, so a wire holds it out. The wire is the only thing that moves.',
  model: (mb) => {
    rod(mb, 0, 0, 0, 0, 2.3, 0, 0.025, 5, 'metal_grey', { color: 0xd8d8d8 });
    rod(mb, 0, 2.25, 0, 0.9, 2.25, 0, 0.012, 4, 'metal_grey');
    mb.box(0.45, 1.65, 0, 0.9, 0.6, 0.01, 'vx_flag_tex', { fit: true });
  },
});
defObj({
  key: 'vx_suit_empty', name: 'Empty Jumpsuit', height: 0.3, block: 'none', movable: 18, hp: 60, sound: 'fabric',
  tags: [...T, 'moon', 'body'],
  container: { capacity: 12, name: 'Pockets', kind: 'pile', loot: 'zw_survivor' },
  desc: 'A yellow debtor jumpsuit lying flat in the dust, arms out, as if whoever was inside it simply left. The band is still on the cuff.',
  model: (mb) => {
    const Y = 0xd8b020;
    mb.box(0, 0, 0, 0.42, 0.12, 0.7, 'white', { color: Y });
    mb.push(); mb.translate(-0.32, 0, 0.1); mb.rotateY(0.6); mb.box(0, 0, 0, 0.14, 0.09, 0.5, 'white', { color: Y }); mb.pop();
    mb.push(); mb.translate(0.32, 0, 0.12); mb.rotateY(-0.5); mb.box(0, 0, 0, 0.14, 0.09, 0.5, 'white', { color: Y }); mb.pop();
    for (const sx of [-0.12, 0.12]) mb.box(sx, 0, -0.62, 0.15, 0.09, 0.6, 'white', { color: scaleHex(Y, 0.9) });
    mb.box(0.42, 0.06, 0.32, 0.08, 0.06, 0.08, 'white', { color: 0x30343a, emissive: 0.2 });
    mb.sphere(0, 0.1, 0.48, 0.14, 8, 5, 'white', { color: 0xe8e8ea, sy: 0.6 });
  },
});

// ---------------------------------------------------------------- impossible scale
defObj({
  key: 'vx_giant_chair', name: 'Chair', w: 3, d: 3, height: 5.6, block: 'solid', blocksSight: true, tall: true, movable: 0, hp: 99999, sound: 'wood',
  tags: [...T, 'scale', 'fixed'],
  desc: 'An ordinary wooden kitchen chair, five metres tall. The seat is above your head. There is gum under it, the size of a pillow.',
  model: (mb) => {
    const W = 0x9a6a3c;
    for (const [lx, lz] of [[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]]) mb.box(lx, 0, lz, 0.22, 2.7, 0.22, 'wood_dark', { color: W });
    mb.box(0, 2.7, 0, 2.7, 0.2, 2.7, 'wood_light', { color: W });
    for (const lx of [-1.1, 1.1]) mb.box(lx, 2.9, -1.1, 0.22, 2.7, 0.22, 'wood_dark', { color: W });
    for (const y of [3.9, 4.8, 5.4]) mb.box(0, y, -1.1, 2.4, 0.22, 0.16, 'wood_light', { color: W });
    mb.box(0, 1.0, 0, 2.3, 0.12, 0.12, 'wood_dark', { color: scaleHex(W, 0.85) });
  },
});
defObj({
  key: 'vx_giant_frame', name: 'Door Frame', w: 3, d: 1, height: 7.2, block: 'none', tall: true, movable: 0, hp: 99999, sound: 'wood',
  tags: [...T, 'scale', 'fixed', 'portal_like'],
  desc: 'A door frame seven metres tall with nothing in it but black. Whatever it was built for has not needed it in a while.',
  model: (mb) => {
    mb.box(-1.45, 0, 0, 0.3, 7.0, 0.4, 'wood_dark', { color: 0xe8e0c8 });
    mb.box(1.45, 0, 0, 0.3, 7.0, 0.4, 'wood_dark', { color: 0xe8e0c8 });
    mb.box(0, 7.0, 0, 3.2, 0.3, 0.4, 'wood_dark', { color: 0xe8e0c8 });
    mb.box(0, 0, 0, 2.6, 7.0, 0.04, 'white', { color: 0x020203, ao: false });
    mb.cylinder(0.9, 3.3, 0.25, 0.12, 0.12, 8, 'metal_grey', { color: 0xc8a050 });
  },
});
defObj({
  key: 'vx_stair_sign', name: 'Sign', height: 2.2, block: 'low', movable: 0, hp: 200, sound: 'metal',
  tags: [...T, 'sign'],
  desc: 'A sign on a pole: UP. There is no UP. There is only further.',
  model: (mb) => {
    rod(mb, 0, 0, 0, 0, 2.0, 0, 0.03, 5, 'metal_grey');
    mb.box(0, 1.6, 0.04, 0.7, 0.4, 0.03, 'white', { color: 0x2a6a3a });
    mb.box(0, 1.72, 0.06, 0.06, 0.18, 0.01, 'white', { color: 0xffffff, emissive: 0.4 });
    mb.box(0, 1.58, 0.06, 0.4, 0.05, 0.01, 'white', { color: 0xffffff, emissive: 0.4 });
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
    // posts, the plate with a rolled rim and bolts; the lettering is painted on by src/social/signs.ts
    for (const sx of [-W / 2 + 0.12, W / 2 - 0.12]) mb.box(sx, 0, -0.06, 0.07, yc + H / 2 + 0.05, 0.07, 'metal_grey', { color: 0x6a6a64 });
    mb.box(0, yc - H / 2, 0, W, H, 0.05, 'white', { color: plate });
    mb.box(0, yc + H / 2 - 0.02, 0, W + 0.04, 0.035, 0.07, 'metal_grey', { color: 0xb0b0a8 });
    mb.box(0, yc - H / 2 - 0.015, 0, W + 0.04, 0.035, 0.07, 'metal_grey', { color: 0xb0b0a8 });
    for (const sx of [-W / 2 + 0.06, W / 2 - 0.06]) for (const sy of [yc - H / 2 + 0.06, yc + H / 2 - 0.07]) for (const z of [0.03, -0.03]) mb.box(sx, sy, z, 0.03, 0.03, 0.012, 'white', { color: 0xb8b8b0 });
  },
});
void mixHex;
