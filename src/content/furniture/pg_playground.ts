// The Nostalgic Playground (src/world/gen/z_playground.ts): its floors (sun-
// bleached lawn, bark chips, faded rubber safety tiles, warm blacktop, painted
// stage boards), the painted games and chalk on the blacktop, and its fixtures:
// the swing frames and the merry-go-round whose moving parts run by themselves
// (src/world/pg_playgroundFx.ts), a rainbow climbing dome, a big plastic wave
// slide, Bright Hour Television's closed studio set (a cardboard sky, a
// cardboard hill, the show title boards, a dead pedestal camera, lamp stands,
// an ON AIR sign, bleachers, a puppet booth, a laundry basket, COUNT-O's
// number hut, Dooley's cave) and small lost things in the grass.
import { defObj } from '../../world/objects';
import { defFloor } from '../../world/defs';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import type { ModelBuilder } from '../../gfx/modelBuilder';
import type { PixelCanvas } from '../../gfx/pixel';
import { makeRamp, mixHex, scaleHex, ph, tileFbm, fillNoise, text, textC, rod, torus, discY, chips, rust } from './b_common';
import '../../world/pg_playgroundFx';

const T = ['playground', 'pg'];

defFloor({ key: 'pg_grass', name: 'Park Lawn', tex: ['pg_grass', 'pg_grass_b'], sound: 'grass', outdoor: true, rotate: true, side: 'pg_side' });
defFloor({ key: 'pg_chips', name: 'Bark Chips', tex: ['pg_chips'], sound: 'gravel', outdoor: true, rotate: true, side: 'pg_side' });
defFloor({ key: 'pg_rubber', name: 'Safety Tiles', tex: ['pg_rubber'], sound: 'concrete', outdoor: true, side: 'pg_side' });
defFloor({ key: 'pg_blacktop', name: 'Blacktop', tex: ['pg_blacktop'], sound: 'concrete', outdoor: true, rotate: true, side: 'pg_side' });
defFloor({ key: 'pg_stage', name: 'Stage Boards', tex: ['pg_stage'], sound: 'wood', side: 'wood_dark' });

// ---------------------------------------------------------------- textures
addTextureModule(() => {
  const A = atlas();
  // a lawn at the end of a long summer: gold-green, clover, bald patches, the odd dandelion
  const lawn = (seed: number) => (pc: PixelCanvas) => {
    const R = makeRamp(0x8aa848, 7, { spread: 0.32, hueShift: 0.06 });
    pc.each((x, y) => {
      const n = ph(x >> 1, y >> 2, seed) * 0.5 + ph(x, y, seed + 1) * 0.3 + tileFbm(x, y, 32, 32, 2, 2, seed + 2) * 0.5;
      pc.set(x, y, R[Math.max(0, Math.min(6, Math.floor(n * 4.2)))]);
    });
    pc.each((x, y) => { if (tileFbm(x, y, 32, 32, 2, 2, seed + 3) > 0.66) pc.blend(x, y, 0xc8b878, 0.55); });
    for (let i = 0; i < 4; i++) { const x = Math.floor(ph(i, 1, seed + 4) * 30) + 1, y = Math.floor(ph(i, 2, seed + 4) * 30) + 1; pc.set(x, y, i % 2 ? 0xf0d040 : 0xf4f0e8); }
  };
  A.add('pg_grass', 32, 32, lawn(7101));
  A.add('pg_grass_b', 32, 32, lawn(7111));
  A.add('pg_side', 16, 32, (pc) => { const R = makeRamp(0x6a5236, 5, { spread: 0.4 }); pc.each((x, y) => pc.set(x, y, y < 3 ? 0x7a9a40 : R[1 + Math.floor(ph(x >> 1, y >> 1, 7121) * 3)])); });
  A.add('pg_chips', 32, 32, (pc) => {
    const R = makeRamp(0x8a7454, 6, { spread: 0.45, hueShift: -0.02 });
    pc.each((x, y) => pc.set(x, y, R[1]));
    for (let i = 0; i < 90; i++) {
      const x = Math.floor(ph(i, 1, 7131) * 32), y = Math.floor(ph(i, 2, 7131) * 32), L = 2 + Math.floor(ph(i, 3, 7131) * 4), hz = ph(i, 4, 7131) < 0.5;
      for (let k = 0; k < L; k++) { pc.set(x + (hz ? k : 0), y + (hz ? 0 : k), R[2 + (k === 0 ? 2 : 1)]); pc.set(x + (hz ? k : 1), y + (hz ? 1 : k), R[0]); }
    }
  });
  A.add('pg_rubber', 32, 32, (pc) => {
    const C = [0xa84a3a, 0x3a8a7a, 0xa84a3a, 0x7a6a9a];
    pc.each((x, y) => {
      const tx = x >> 4, ty = y >> 4, c = C[(tx + ty * 2) & 3];
      const edge = (x & 15) === 0 || (y & 15) === 0;
      pc.set(x, y, edge ? scaleHex(c, 0.7) : mixHex(c, 0xd8c8b0, 0.22 + ph(x >> 1, y >> 1, 7141) * 0.2));
    });
    for (let i = 0; i < 40; i++) pc.set(Math.floor(ph(i, 1, 7142) * 32), Math.floor(ph(i, 2, 7142) * 32), 0x2a2420);
  });
  A.add('pg_blacktop', 32, 32, (pc) => {
    const R = makeRamp(0x5a5654, 6, { spread: 0.3, hueShift: 0.02 });
    fillNoise(pc, R, 0.55, 0.12, 3, 7151, 0.1, 0.8);
    for (let i = 0; i < 3; i++) { let x = ph(i, 1, 7152) * 32, y = ph(i, 2, 7152) * 32; for (let k = 0; k < 14; k++) { pc.blend(Math.floor(x), Math.floor(y), R[0], 0.7); x += ph(k, i, 7153) - 0.5 + 0.6; y += ph(k, i, 7154) * 1.4 - 0.4; } }
  });
  A.add('pg_stage', 32, 32, (pc) => {
    const R = makeRamp(0x5a5a62, 5, { spread: 0.3 });
    pc.each((x, y) => pc.set(x, y, (y & 7) === 0 ? R[0] : R[2 + (ph(x >> 3, y >> 3, 7161) < 0.3 ? 1 : 0)]));
    for (let i = 0; i < 6; i++) { const x = Math.floor(ph(i, 1, 7162) * 30), y = Math.floor(ph(i, 2, 7162) * 30); pc.rect(x, y, 2, 1, i % 2 ? 0xe8d040 : 0xe84a3a); }   // spike marks
  });
  // painted games on the blacktop (decals: transparent where unpainted)
  A.add('pg_hopscotch', 24, 64, (pc) => {
    pc.wrap = false; pc.clear();
    const W = 0xf2eee0, Y = 0xf0d040;
    const box = (x: number, y: number, w: number, h: number, n: string) => {
      for (let i = 0; i < w; i++) { pc.set(x + i, y, W, 230); pc.set(x + i, y + h - 1, W, 230); }
      for (let j = 0; j < h; j++) { pc.set(x, y + j, W, 230); pc.set(x + w - 1, y + j, W, 230); }
      text(pc, n, x + Math.floor(w / 2) - 1, y + Math.floor(h / 2) - 2, Y);
    };
    box(8, 54, 8, 9, '1'); box(8, 46, 8, 9, '2'); box(8, 38, 8, 9, '3'); box(2, 30, 10, 9, '4'); box(12, 30, 10, 9, '5'); box(8, 22, 8, 9, '6'); box(2, 14, 10, 9, '7'); box(12, 14, 10, 9, '8');
    for (let a = 0; a < 24; a++) { const t = (a / 23) * Math.PI; pc.set(Math.round(12 + Math.cos(t) * 9), Math.round(13 - Math.sin(t) * 10), W, 230); }
    textC(pc, '9', 12, 6, Y);
  });
  A.add('pg_foursquare', 48, 48, (pc) => {
    pc.wrap = false; pc.clear();
    const C = [0xd84a3a, 0x3a7ad8, 0xe8c83a, 0x4aa84a];
    for (let y = 1; y < 47; y++) for (let x = 1; x < 47; x++) {
      const q = (x < 24 ? 0 : 1) + (y < 24 ? 0 : 2), line = x === 1 || y === 1 || x === 46 || y === 46 || x === 23 || x === 24 || y === 23 || y === 24;
      if (line) pc.set(x, y, 0xf2eee0, 230); else if (ph(x >> 1, y >> 1, 7171 + q) < 0.85) pc.set(x, y, C[q], 120);
    }
    for (const [cx, cy, n] of [[12, 10, 'A'], [36, 10, 'B'], [12, 34, 'C'], [36, 34, 'D']] as const) text(pc, n, cx - 1, cy, 0xf2eee0);
  });
  A.add('pg_snake', 64, 32, (pc) => {
    pc.wrap = false; pc.clear();
    const C = [0xe84a3a, 0xf0a030, 0xe8d040, 0x4ab84a, 0x3a8ad8, 0x9a5ac8];
    for (let i = 0; i < 26; i++) {
      const x = 4 + i * 2.2, y = 16 + Math.sin(i * 0.55) * 9;
      for (let dy = -3; dy <= 3; dy++) for (let dx = -2; dx <= 2; dx++) if (dx * dx + dy * dy <= 7) pc.set(Math.round(x + dx), Math.round(y + dy), C[Math.floor(i / 2) % 6], 200);
    }
    pc.set(60, 14, 0x101010, 255); pc.set(61, 18, 0xe8203a, 255); pc.set(62, 18, 0xe8203a, 255);
  });
  A.add('pg_chalk', 48, 32, (pc) => {
    pc.wrap = false; pc.clear();
    const ch = (x0: number, y0: number, x1: number, y1: number, c: number) => { const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0)); for (let i = 0; i <= n; i++) if (ph(i, x0 + y0, 7181) < 0.85) pc.set(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), c, 200); };
    // a sun with a face, a house, a family of four holding hands, and a fifth, taller, off to the side
    for (let a = 0; a < 16; a++) { const t = (a / 16) * Math.PI * 2; ch(8 + Math.cos(t) * 4, 8 + Math.sin(t) * 4, 8 + Math.cos(t) * 7, 8 + Math.sin(t) * 7, 0xf0d040); }
    for (let a = 0; a < 20; a++) { const t = (a / 20) * Math.PI * 2; pc.set(Math.round(8 + Math.cos(t) * 3.5), Math.round(8 + Math.sin(t) * 3.5), 0xf0d040, 220); }
    for (let i = 0; i < 4; i++) { const x = 20 + i * 5, h = i < 2 ? 9 : 6; ch(x, 30 - h, x, 30 - 3, 0xf4f0f0); ch(x, 30 - 3, x - 1, 30, 0xf4f0f0); ch(x, 30 - 3, x + 1, 30, 0xf4f0f0); pc.set(x, 30 - h - 1, 0xf4f0f0, 220); pc.set(x - 1, 30 - h - 1, 0xf4f0f0, 220); pc.set(x + 1, 30 - h - 1, 0xf4f0f0, 220); if (i < 3) ch(x, 30 - h + 2, x + 5, 30 - (i < 1 ? 9 : 6) + 2, 0xf090c0); }
    ch(44, 12, 44, 27, 0x8a8a9a); ch(44, 27, 42, 31, 0x8a8a9a); ch(44, 27, 46, 31, 0x8a8a9a); ch(44, 16, 41, 22, 0x8a8a9a); ch(44, 16, 47, 22, 0x8a8a9a); pc.set(44, 10, 0x8a8a9a, 230); pc.set(43, 11, 0x101010, 255); pc.set(45, 11, 0x101010, 255);
  });
  A.add('pg_cables', 32, 16, (pc) => {
    pc.wrap = false; pc.clear();
    for (let k = 0; k < 3; k++) for (let x = 0; x < 32; x++) { const y = Math.round(8 + Math.sin(x * 0.3 + k * 2) * (3 + k) - 2 + k * 2); pc.set(x, y, k === 1 ? 0x2a2a6a : 0x161616, 240); pc.set(x, y + 1, 0x0a0a0a, 160); }
  });
  // the studio: a cardboard sky with clouds and a smiling sun, a hill, the title boards, a camera, an ON AIR box
  A.add('pg_skyflat', 64, 48, (pc) => {
    pc.wrap = false;
    pc.each((x, y) => pc.set(x, y, mixHex(0x6ab0e0, 0xbfe0f0, y / 48 + (ph(x >> 2, y >> 2, 7191) - 0.5) * 0.06)));
    const cloud = (cx: number, cy: number, s: number) => { for (const [ox, oy, r] of [[0, 0, 4], [4, -2, 5], [9, 0, 4], [4, 2, 4]]) for (let y = -r * s; y <= r * s; y++) for (let x = -r * s; x <= r * s; x++) if (x * x + y * y <= r * r * s * s) pc.set(Math.round(cx + ox * s + x), Math.round(cy + oy * s + y), y > r * s * 0.4 ? 0xd8e4ec : 0xf8f8f4); };
    cloud(6, 30, 1); cloud(36, 14, 1.2); cloud(44, 36, 0.8);
    // the sun: a face that was painted smiling; someone has gone over the mouth with a marker
    for (let y = -9; y <= 9; y++) for (let x = -9; x <= 9; x++) { const d = Math.hypot(x, y); if (d < 9) pc.set(16 + x, 12 + y, d > 7.5 ? 0xe89a20 : 0xf6d040); }
    for (let a = 0; a < 12; a++) { const t = (a / 12) * Math.PI * 2; for (let r = 10; r < 13; r++) pc.set(Math.round(16 + Math.cos(t) * r), Math.round(12 + Math.sin(t) * r), 0xf0b030); }
    pc.set(13, 10, 0x2a1a0a); pc.set(19, 10, 0x2a1a0a); pc.set(13, 9, 0x2a1a0a); pc.set(19, 9, 0x2a1a0a);
    for (let x = 12; x <= 20; x++) pc.set(x, 15 + Math.round(Math.abs(x - 16) * -0.35), 0x1a0a0a);
    for (let x = 11; x <= 21; x++) for (let y = 14; y <= 17; y++) if (ph(x, y, 7192) < 0.45) pc.set(x, y, 0x101010);
    // tape at the seams, a water stain, the plywood showing at a torn corner
    for (let y = 0; y < 48; y++) { pc.set(31, y, 0xc8b88a); pc.set(32, y, 0xd8c89a); }
    for (let y = 36; y < 48; y++) for (let x = 54; x < 64; x++) if (x - 54 > (48 - y) * 0.8) pc.set(x, y, 0xb08a58);
    for (let y = 0; y < 22; y++) for (let x = 46; x < 52; x++) if (ph(x, y, 7193) < 0.5 - y * 0.02) pc.blend(x, y, 0x6a5a4a, 0.4);
  });
  A.add('pg_hill', 48, 16, (pc) => {
    pc.wrap = false; pc.clear();
    for (let x = 0; x < 48; x++) { const h = Math.round(9 + Math.sin(x * 0.13) * 5 + Math.sin(x * 0.4) * 1); for (let y = 16 - h; y < 16; y++) pc.set(x, y, y === 16 - h ? 0x3a7a2a : ph(x >> 1, y >> 1, 7201) < 0.15 ? 0x4a9a3a : 0x5aa84a); }
    for (let i = 0; i < 10; i++) { const x = 3 + Math.floor(ph(i, 1, 7202) * 42), y = 9 + Math.floor(ph(i, 2, 7202) * 5); pc.set(x, y, [0xf04a4a, 0xf0e040, 0xf4f0f0][i % 3]); }
  });
  const TITLES: [string, string, number, number, number][] = [
    ['DOOLEY\'S', 'DINO DEN', 0xe07a2e, 0x2a9a8a, 0xfff4d8],
    ['THE', 'DOODLEWUMPS', 0xe88a96, 0x5a8ac8, 0xfff8f0],
    ['LEFTY\'S', 'LAUNDRY HOUR', 0x3a6a9a, 0xc8a02a, 0xf8f0e0],
    ['GROW-ALONG', 'WITH PETULA', 0xf0c430, 0x4a9a3a, 0x3a2a14],
    ['COUNT-O\'S', 'NUMBER HUT', 0xa8b0b8, 0xc8322a, 0x1a1a2a],
  ];
  TITLES.forEach(([a, b, c0, c1, ink], i) => A.add('pg_title' + i, 64, 20, (pc) => {
    pc.wrap = false;
    pc.each((x, y) => { const e = x < 2 || y < 2 || x > 61 || y > 17; pc.set(x, y, e ? scaleHex(c1, 0.8) : mixHex(c0, 0xffffff, ((x + y) % 7 === 0 ? 0.1 : 0) + (ph(x >> 2, y >> 2, 7210 + i) - 0.5) * 0.08)); });
    textC(pc, a, 32, 3, ink, 1, scaleHex(c1, 0.7));
    textC(pc, b, 32, 11, ink, 1, scaleHex(c1, 0.7));
    for (let k = 0; k < 6; k++) pc.set(Math.floor(ph(k, i, 7220) * 60) + 2, Math.floor(ph(k, i, 7221) * 16) + 2, 0x6a5a4a);
  }));
  A.add('pg_ballsign', 60, 10, (pc) => { pc.wrap = false; pc.each((x, y) => pc.set(x, y, ((x >> 3) + (y >> 3)) % 2 ? 0x2a6ad8 : 0x3a7ae8)); textC(pc, 'THE BALL HOUSE', 30, 3, 0xffe040, 1, 0x1a2a6a); });
  A.add('pg_onair', 24, 8, (pc) => { pc.wrap = false; pc.fill(0x3a0a0a); textC(pc, 'ON AIR', 12, 2, 0xff4a3a); });
  A.add('pg_brand', 24, 8, (pc) => { pc.wrap = false; pc.fill(0x1a1a1c); textC(pc, 'BRIGHT', 12, 2, 0xf0c040); });
  A.add('pg_awning', 16, 16, (pc) => { pc.each((x, y) => pc.set(x, y, ((x >> 2) & 1) ? 0xe8e0d0 : 0xc83a3a)); for (let x = 0; x < 16; x++) pc.set(x, 15, 0x7a1a1a); });
  A.add('pg_curtain', 16, 32, (pc) => { const R = makeRamp(0x8a1a2a, 5, { spread: 0.5 }); pc.each((x, y) => pc.set(x, y, R[1 + Math.round((Math.sin(x * 1.2) + 1) * 1.4) + (ph(x, y >> 2, 7231) < 0.1 ? -1 : 0)])); });
  A.add('pg_wicker', 16, 16, (pc) => { pc.each((x, y) => pc.set(x, y, ((x + (y >> 1)) & 3) === 0 ? 0x8a6a3a : ((y & 1) ? 0xc8a868 : 0xb8945a))); });
  A.add('pg_numbers', 32, 32, (pc) => {
    pc.wrap = false;
    const R = makeRamp(0xb08a58, 5, { spread: 0.35 });
    pc.each((x, y) => pc.set(x, y, R[2 + (ph(x, y, 7241) < 0.2 ? 1 : 0) + ((y % 3 === 0) ? -1 : 0)]));
    const C = [0xd83a2a, 0x3a6ad8, 0xe8c02a, 0x4aa84a, 0x9a4ab8];
    for (let i = 0; i < 10; i++) text(pc, String((i + 1) % 10), 3 + (i % 5) * 6, 4 + Math.floor(i / 5) * 12, C[i % 5], 1, 0x2a1a0a);
    for (let x = 0; x < 32; x++) { pc.set(x, 26, 0xa8acb4); pc.set(x, 27, 0xc8ccd4); }
  });
  A.add('pg_rock', 32, 32, (pc) => { const R = makeRamp(0x8a7a6a, 6, { spread: 0.45 }); fillNoise(pc, R, 0.5, 0.2, 3, 7251, 0.12, 0.8); for (let y = 0; y < 32; y += 6) for (let x = 0; x < 32; x++) if (ph(x, y, 7252) < 0.3) pc.blend(x, y, R[0], 0.5); });
  A.add('pg_screen', 16, 12, (pc) => { pc.wrap = false; pc.each((x, y) => { const g = 60 + Math.floor(ph(x, y, 7261) * 150); pc.set(x, y, (g << 16) | (g << 8) | g); }); });
});

// ---------------------------------------------------------------- helpers
function aFrame(mb: ModelBuilder, x: number, top: number, spread: number, tex: string) {
  for (const z of [-spread, spread]) rod(mb, x, top, 0, x + Math.sign(x) * 0.08, 0, z, 0.042, 7, tex);
  mb.box(x, 0.85, 0, 0.05, 0.05, spread * 1.15, tex);
  for (const z of [-spread, spread]) mb.cylinder(x + Math.sign(x) * 0.08, -0.05, z, 0.06, 0.06, 6, 'concrete');
}

// ---------------------------------------------------------------- the moving fixtures (the swings and the roundabout's deck are drawn by pg_playgroundFx)
defObj({
  key: 'pg_swing_frame', name: 'Swings', w: 3, d: 2, height: 2.4, block: 'low', tall: true, movable: 0, hp: 900, sound: 'metal',
  tags: [...T, 'fixed'],
  desc: 'A swing frame, the paint gone chalky in the sun. The swings are moving. There is no wind. There has never been any wind here.',
  variant: (s) => String((s.v ?? 0) % 3),
  model: (mb, s) => {
    const tex = ['q_paint_blue', 'q_paint_red', 'q_paint_green'][(s.v ?? 0) % 3], top = 2.28;
    aFrame(mb, -1.4, top, 0.8, tex); aFrame(mb, 1.4, top, 0.8, tex);
    mb.cylinderX(0, top, 0, 0.055, 2.96, 8, 'q_paint_yellow');
    for (const x of [-0.95, -0.55, 0.25, 0.65]) mb.box(x, top - 0.08, 0, 0.05, 0.08, 0.12, 'metal_dark');
    // a third seat's chain, snapped, lying in the dip worn into the dirt
    mb.box(1.0, top - 0.5, 0, 0.018, 0.5, 0.018, 'q_chain');
  },
});
defObj({
  key: 'pg_merry', name: 'Roundabout', w: 2, d: 2, height: 0.95, block: 'low', movable: 0, hp: 900, sound: 'metal',
  tags: [...T, 'fixed'],
  desc: 'A painted roundabout. It turns by itself, slowly, and it creaks on every turn. It speeds up when you look away from it.',
  model: (mb) => {
    mb.cylinder(0, -0.02, 0, 0.98, 0.04, 18, 'q_sandpit');
    mb.cylinder(0, 0, 0, 0.16, 0.2, 8, 'metal_dark');
  },
});

// ---------------------------------------------------------------- the play equipment
defObj({
  key: 'pg_dome', name: 'Climbing Dome', w: 3, d: 3, height: 1.85, block: 'solid', tall: true, movable: 0, hp: 1200, sound: 'metal',
  tags: [...T, 'fixed'],
  desc: 'A geodesic dome of bars, each ring a colour of the rainbow, the colours gone soft. Children used to hang upside down from it. A hair bobble is still knotted round the top bar.',
  model: (mb) => {
    const R = 1.4, rings = 5, segs = 10, tex = ['q_paint_red', 'q_paint_orange', 'q_paint_yellow', 'q_paint_green', 'q_paint_blue'];
    const P = (i: number, j: number): [number, number, number] => {
      const el = (i / rings) * Math.PI * 0.5, az = (j / segs) * Math.PI * 2 + (i % 2) * (Math.PI / segs);
      const r = Math.cos(el) * R; return [Math.cos(az) * r, Math.sin(el) * R * 1.25, Math.sin(az) * r];
    };
    for (let i = 0; i < rings; i++) for (let j = 0; j < segs; j++) {
      const a = P(i, j), b = P(i, j + 1), c = P(i + 1, j), d = P(i + 1, j + 1 - (i % 2 ? 0 : 1) + (i % 2 ? 0 : 1));
      rod(mb, a[0], a[1], a[2], b[0], b[1], b[2], 0.024, 5, tex[i]);
      if (i + 1 <= rings) { rod(mb, a[0], a[1], a[2], c[0], c[1], c[2], 0.022, 5, tex[Math.min(4, i)]); if (i + 1 < rings) rod(mb, b[0], b[1], b[2], d[0], d[1], d[2], 0.022, 5, tex[Math.min(4, i)]); }
    }
    for (let j = 0; j < segs; j++) { const a = P(0, j); mb.cylinder(a[0], -0.04, a[2], 0.045, 0.06, 6, 'metal_dark'); }
    mb.sphere(0, R * 1.25, 0, 0.06, 6, 4, 'q_paint_blue');
    mb.sphere(0.05, R * 1.25 - 0.02, 0.05, 0.03, 5, 3, 'q_paint_pink', { color: 0xffd0e8 });
  },
});
defObj({
  key: 'pg_wave_slide', name: 'Wave Slide', w: 2, d: 4, height: 2.7, block: 'solid', tall: true, movable: 0, hp: 1000, sound: 'plastic',
  tags: [...T, 'fixed'],
  desc: 'A tower with a pointed plastic roof and a wide yellow wave slide, faded to the colour of old custard by a sun that has been setting for thirty years. The slide is warm. Something has been sliding down it: there are long smears.',
  model: (mb) => {
    // the tower: four posts, a deck, a pointed roof, a ladder behind
    for (const x of [-0.55, 0.55]) for (const z of [-1.75, -0.65]) rod(mb, x, 0, z, x, 2.15, z, 0.05, 8, 'q_paint_green');
    mb.box(0, 1.2, -1.2, 1.18, 0.06, 1.18, { top: 'q_paint_blue', sides: 'q_paint_blue' } as any);
    for (const s of [-1, 1]) { mb.box(s * 0.57, 1.26, -1.2, 0.04, 0.5, 1.1, 'q_paint_yellow'); }
    mb.box(0, 1.26, -1.76, 1.1, 0.5, 0.04, 'q_paint_yellow');
    // roof: four sloped panels to a point
    const ry = 2.15;
    for (let k = 0; k < 4; k++) {
      mb.push(); mb.translate(0, ry, -1.2); mb.rotateY((k * Math.PI) / 2); mb.translate(0, 0, 0.32); mb.rotateX(0.62);
      mb.box(0, 0, 0, 1.3, 0.04, 0.78, k % 2 ? 'q_paint_red' : 'q_paint_orange'); mb.pop();
    }
    mb.cylinder(0, ry + 0.45, -1.2, 0.04, 0.18, 6, 'q_paint_yellow');
    for (let i = 1; i <= 5; i++) mb.box(0, i * 0.22, -1.95, 0.7, 0.04, 0.06, 'metal_grey');
    for (const x of [-0.36, 0.36]) rod(mb, x, 0, -2.0, x, 1.25, -1.78, 0.03, 6, 'q_paint_green');
    // the wave slide: three humps down to the bark
    const n = 14;
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      const y = (t: number) => 1.22 * (1 - t) + Math.sin(t * Math.PI * 3) * 0.12 * (1 - t) + 0.12;
      const z = (t: number) => -0.6 + t * 2.4;
      const zA = z(t0), zB = z(t1), yA = y(t0), yB = y(t1), L = Math.hypot(zB - zA, yB - yA);
      mb.push(); mb.translate(0, yA, zA); mb.rotateX(-Math.atan2(yB - yA, zB - zA));
      mb.box(0, 0, L / 2, 0.86, 0.04, L + 0.02, 'q_paint_yellow');
      for (const s of [-1, 1]) mb.box(s * 0.44, 0, L / 2, 0.05, 0.2, L + 0.02, 'q_paint_yellow', { color: 0xf0e8d0 });
      mb.pop();
    }
  },
});

// ---------------------------------------------------------------- lost things
defObj({
  key: 'pg_bucket', name: 'Bucket and Spade', height: 0.2, block: 'none', movable: 1, sound: 'plastic', noShadow: true,
  tags: [...T, 'small'],
  desc: 'A child\'s plastic bucket, half full of damp sand, and a spade stuck in it. The sand is warm.',
  variant: (s) => String((s.v ?? 0) % 3),
  model: (mb, s) => {
    const c = ['plastic_red', 'plastic_blue', 'plastic_yellow'][(s.v ?? 0) % 3];
    mb.cylinder(0, 0, 0, 0.08, 0.15, 10, c, { rTop: 0.1 } as any);
    discY(mb, 0, 0.13, 0, 0.09, 10, 'q_sandpit');
    torus(mb, 0, 0.17, 0, 0.09, 0.006, 10, 4, 'plastic_white');
    mb.push(); mb.translate(0.03, 0.14, 0); mb.rotateZ(0.4); mb.box(0, 0.06, 0, 0.012, 0.14, 0.012, 'plastic_yellow'); mb.box(0, 0.0, 0, 0.05, 0.05, 0.008, 'plastic_yellow'); mb.pop();
  },
});
defObj({
  key: 'pg_shoe', name: 'Little Shoe', height: 0.08, block: 'none', movable: 1, sound: 'fabric', noShadow: true,
  tags: [...T, 'small'],
  desc: 'One child\'s trainer with a light-up sole, the velcro still done up. The light still blinks when you pick it up.',
  model: (mb) => {
    mb.box(0, 0, 0, 0.07, 0.025, 0.17, 'rubber_black', { color: 0xe8e4dc });
    mb.box(0, 0.02, -0.01, 0.068, 0.05, 0.13, 'fabric_blue', { color: 0x8ac8e8 });
    mb.box(0, 0.045, 0.03, 0.07, 0.012, 0.03, 'fabric_red');
    mb.box(0, 0.006, 0.06, 0.03, 0.012, 0.02, 'plastic_red', { emissive: 0.8 });
  },
});
defObj({
  key: 'pg_ball', name: 'Playground Ball', height: 0.22, block: 'none', movable: 1, sound: 'plastic', noShadow: true,
  tags: [...T, 'small'],
  desc: 'A red rubber playground ball, gone soft. It rolls a little way toward you when you are not looking.',
  model: (mb) => { mb.sphere(0, 0.1, 0, 0.11, 10, 6, 'plastic_red', { sy: 0.85 }); },
});

// ---------------------------------------------------------------- Bright Hour Television's set
defObj({
  key: 'pg_sky_flat', name: 'Cardboard Sky', w: 4, d: 1, height: 3.2, block: 'solid', tall: true, movable: 0, hp: 300, sound: 'wood', blocksSight: true,
  tags: [...T, 'studio', 'fixed'],
  desc: 'A painted backdrop: a blue sky with fat clouds and a smiling sun, on plywood flats taped together. Somebody has gone over the sun\'s smile with black marker, carefully, many times.',
  model: (mb) => {
    mb.box(0, 0.05, 0, 3.96, 3.1, 0.05, { south: 'pg_skyflat', north: 'wood_light', east: 'wood_light', west: 'wood_light', top: 'wood_light', bottom: 'wood_light' } as any, { fit: { south: true } } as any);
    for (const x of [-1.6, 0, 1.6]) { mb.push(); mb.translate(x, 0, -0.35); mb.rotateX(-0.42); mb.box(0, 0, 0, 0.06, 2.4, 0.06, 'wood_light'); mb.pop(); mb.box(x, 0, -0.75, 0.3, 0.12, 0.3, 'q_cardboard_a'); }
  },
});
defObj({
  key: 'pg_card_hill', name: 'Cardboard Hill', w: 3, d: 1, height: 1.0, block: 'low', movable: 0, hp: 150, sound: 'paper',
  tags: [...T, 'studio', 'fixed'],
  desc: 'A hill cut out of card and painted green, with flowers. On the back, in pencil: SCENE 4 — DON\'T STAND BEHIND IT.',
  model: (mb) => {
    mb.box(0, 0, 0, 2.9, 1.0, 0.03, { south: 'pg_hill', north: 'cardboard', east: 'cardboard', west: 'cardboard', top: 'cardboard', bottom: 'cardboard' } as any, { fit: { south: true } } as any);
    for (const x of [-1, 1]) { mb.push(); mb.translate(x, 0, -0.2); mb.rotateX(-0.5); mb.box(0, 0, 0, 0.04, 0.8, 0.04, 'wood_light'); mb.pop(); }
  },
});
defObj({
  key: 'pg_title', name: 'Title Board', w: 3, d: 1, height: 2.6, block: 'low', tall: true, movable: 0, hp: 300, sound: 'wood',
  tags: [...T, 'studio', 'fixed', 'sign'],
  desc: 'A painted title board from one of Bright Hour\'s children\'s programmes, on two posts. The paint is chipped where it was carried from set to set.',
  variant: (s) => String((s.v ?? 0) % 5),
  model: (mb, s) => {
    const v = (s.v ?? 0) % 5;
    for (const x of [-1.1, 1.1]) mb.box(x, 0, 0, 0.08, 1.6, 0.08, 'wood_light');
    mb.box(0, 1.5, 0, 2.7, 0.86, 0.06, { south: 'pg_title' + v, north: 'wood_light', east: 'wood_light', west: 'wood_light', top: 'wood_light', bottom: 'wood_light' } as any, { fit: { south: true } } as any);
  },
});
defObj({
  key: 'pg_tv_camera', name: 'Studio Camera', w: 1, d: 1, height: 1.8, block: 'solid', tall: true, movable: 0, hp: 400, sound: 'metal',
  tags: [...T, 'studio', 'fixed'],
  desc: 'A big pedestal studio camera from the early nineties, BRIGHT on the side. It is dead: no power anywhere in the building. When you turn your back on it, its red tally light comes on.',
  model: (mb) => {
    // dolly base on three casters, the pedestal column, the steering ring
    for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2; rod(mb, 0, 0.18, 0, Math.cos(a) * 0.42, 0.1, Math.sin(a) * 0.42, 0.035, 6, 'metal_dark'); mb.cylinder(Math.cos(a) * 0.42, 0, Math.sin(a) * 0.42, 0.05, 0.08, 8, 'rubber_black'); }
    mb.cylinder(0, 0.15, 0, 0.09, 0.95, 10, 'metal_grey');
    torus(mb, 0, 0.75, 0, 0.3, 0.018, 14, 4, 'metal_dark');
    // the camera: a body, the lens barrel, a hood, a viewfinder on top, two pan handles
    mb.box(0, 1.1, -0.05, 0.3, 0.32, 0.5, 'plastic_beige');
    mb.box(0.152, 1.16, -0.05, 0.004, 0.06, 0.2, 'pg_brand', { fit: true } as any);
    mb.cylinderZ(0, 1.25, 0.32, 0.1, 0.3, 12, 'plastic_black');
    mb.cylinderZ(0, 1.25, 0.49, 0.12, 0.05, 12, 'plastic_black');
    discY(mb, 0, 1.25, 0.52, 0.0, 4, 'plastic_black');
    mb.box(0, 1.42, -0.1, 0.24, 0.16, 0.22, 'plastic_black');
    mb.box(0, 1.44, 0.015, 0.2, 0.12, 0.005, 'pg_screen', { fit: true, emissive: 0.15 } as any);
    for (const s of [-1, 1]) { mb.push(); mb.translate(s * 0.12, 1.12, -0.35); mb.rotateX(0.5); mb.box(0, 0, -0.25, 0.03, 0.03, 0.5, 'metal_dark'); mb.pop(); }
    mb.sphere(0, 1.36, 0.22, 0.018, 6, 4, 'plastic_red', { color: 0x6a2020 });
    // the cable, coiled on the floor
    torus(mb, 0.3, 0.02, -0.3, 0.18, 0.02, 12, 4, 'rubber_black');
  },
});
defObj({
  key: 'pg_studio_lamp', name: 'Studio Lamp', w: 1, d: 1, height: 2.4, block: 'solid', tall: true, movable: 0, hp: 300, sound: 'metal',
  tags: [...T, 'studio', 'fixed', 'light'],
  light: { color: 0xffe0b0, intensity: 1.0, radius: 7, y: 2.1, kind: 'lamp', flicker: 0.04, power: false },
  desc: 'A fresnel lamp on a wind-up stand, barn doors open. There is no power in the building. It is on.',
  model: (mb) => {
    for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2 + 0.3; rod(mb, 0, 0.6, 0, Math.cos(a) * 0.45, 0, Math.sin(a) * 0.45, 0.02, 5, 'metal_dark'); }
    rod(mb, 0, 0.6, 0, 0, 2.0, 0, 0.022, 6, 'metal_grey');
    mb.push(); mb.translate(0, 2.08, 0); mb.rotateX(0.35);
    mb.cylinderZ(0, 0, 0, 0.14, 0.32, 10, 'metal_dark');
    discY(mb, 0, 0, 0.17, 0.0, 4, 'metal_dark');
    mb.box(0, 0, 0.17, 0.2, 0.2, 0.01, 'q_paint_white', { emissive: 1, color: 0xfff0d0 } as any);
    for (const s of [-1, 1]) { mb.box(s * 0.16, 0, 0.22, 0.12, 0.26, 0.01, 'metal_dark'); mb.box(0, s * 0.16, 0.22, 0.26, 0.01, 0.12, 'metal_dark'); }
    mb.pop();
  },
});
defObj({
  key: 'pg_onair', name: 'ON AIR Sign', height: 0.3, onWall: true, block: 'none', movable: 0, hp: 100, sound: 'glass',
  tags: [...T, 'studio', 'fixed', 'light'],
  light: { color: 0xff3a2a, intensity: 0.5, radius: 3.5, y: 2.3, kind: 'neon', flicker: 0.15, power: false },
  desc: 'A red ON AIR box over the studio door. The studio has been closed for thirty years. It is lit.',
  model: (mb) => { mb.box(0, 2.15, 0.06, 0.62, 0.22, 0.1, { south: 'pg_onair', north: 'plastic_black', east: 'plastic_black', west: 'plastic_black', top: 'plastic_black', bottom: 'plastic_black' } as any, { fit: { south: true }, emissive: 0.85 } as any); },
});
defObj({
  key: 'pg_bleachers', name: 'Audience Bleachers', w: 4, d: 2, height: 1.2, block: 'solid', movable: 0, hp: 800, sound: 'wood', sit: true,
  tags: [...T, 'studio', 'fixed', 'sit'],
  desc: 'Three tiers of benches for the studio audience: children and their parents, two hundred of them every afternoon. There are small hand prints on the boards, and they are fresh.',
  model: (mb) => {
    for (let r = 0; r < 3; r++) {
      const y = 0.4 + r * 0.38, z = 0.6 - r * 0.6;
      mb.box(0, y, z, 3.9, 0.06, 0.5, 'wood_light');
      mb.box(0, y - 0.38, z - 0.22, 3.9, 0.38, 0.04, 'metal_grey');
      for (const x of [-1.8, -0.6, 0.6, 1.8]) mb.box(x, 0, z, 0.06, y, 0.06, 'metal_dark');
    }
  },
});
defObj({
  key: 'pg_puppet_booth', name: 'Puppet Booth', w: 2, d: 1, height: 2.3, block: 'solid', tall: true, movable: 0, hp: 400, sound: 'wood',
  tags: [...T, 'studio', 'fixed'],
  desc: 'A striped puppet theatre, curtains drawn, a little stage window at the top. There is no floor inside it: just a hole, and the hole goes down a very long way.',
  model: (mb) => {
    mb.box(0, 0, 0, 1.9, 1.3, 0.8, { south: 'q_paint_red', north: 'q_paint_red', east: 'q_paint_red', west: 'q_paint_red', top: 'wood_light', bottom: 'wood_light' } as any);
    for (const s of [-1, 1]) mb.box(s * 0.85, 1.3, 0, 0.2, 0.75, 0.8, 'q_paint_red');
    mb.box(0, 1.3, -0.3, 1.5, 0.75, 0.2, 'pg_curtain');
    mb.box(0, 1.28, 0.3, 1.6, 0.06, 0.24, 'wood_light');
    mb.box(0, 2.05, 0.05, 1.96, 0.25, 0.9, 'q_paint_red');
    mb.push(); mb.translate(0, 2.0, 0.5); mb.rotateX(0.5); mb.box(0, 0, 0, 2.0, 0.03, 0.4, 'pg_awning'); mb.pop();
    mb.box(0, 0.45, 0.405, 1.0, 0.4, 0.01, 'pg_title2', { fit: true } as any);
  },
});
defObj({
  key: 'pg_basket', name: 'Laundry Basket', w: 1, d: 1, height: 0.6, block: 'low', movable: 0, hp: 100, sound: 'wood',
  tags: [...T, 'studio'],
  desc: 'A big wicker laundry basket with odd socks hanging over the rim. Every one of them is a left sock.',
  container: { capacity: 12, name: 'Laundry Basket', kind: 'bin', loot: 'pg_studio' },
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.36, 0.55, 12, 'pg_wicker', { rTop: 0.42 } as any);
    torus(mb, 0, 0.55, 0, 0.42, 0.03, 14, 4, 'pg_wicker');
    for (let i = 0; i < 4; i++) { const a = i * 1.6; mb.push(); mb.translate(Math.cos(a) * 0.4, 0.5, Math.sin(a) * 0.4); mb.rotateY(-a); mb.box(0.03, -0.12, 0, 0.04, 0.26, 0.08, 'fabric_grey', { color: [0xe8c060, 0xc84a4a, 0xf0f0e8, 0x4a6aa8][i] }); mb.pop(); }
  },
});
defObj({
  key: 'pg_number_hut', name: 'Number Hut', w: 3, d: 1, height: 2.6, block: 'solid', tall: true, movable: 0, hp: 500, sound: 'paper', blocksSight: true,
  tags: [...T, 'studio', 'fixed'],
  desc: 'The front of COUNT-O\'s Number Hut: a cardboard house painted with numbers, a door that does not open, a window you can see darkness through. Hide-and-seek tallies are scratched into the door frame. Hundreds.',
  model: (mb) => {
    mb.box(0, 0, 0, 2.9, 2.0, 0.12, { south: 'pg_numbers', north: 'cardboard', east: 'cardboard', west: 'cardboard', top: 'cardboard', bottom: 'cardboard' } as any, { fit: { south: true } } as any);
    for (const s of [-1, 1]) { mb.push(); mb.translate(s * 0.72, 2.0, 0); mb.rotateZ(-s * 0.6); mb.box(0, 0, 0, 1.75, 0.06, 0.4, 'q_cardboard_a'); mb.pop(); }
    mb.box(0.6, 0.0, 0.065, 0.7, 1.4, 0.02, 'q_paint_blue');
    mb.box(-0.75, 1.0, 0.065, 0.6, 0.5, 0.02, 'plastic_black');
    for (const s of [-1, 1]) { mb.box(-0.75 + s * 0.3, 1.0, 0.08, 0.04, 0.5, 0.03, 'q_paint_yellow'); mb.box(-0.75, 1.0 + (s > 0 ? 0.5 : 0), 0.08, 0.64, 0.04, 0.03, 'q_paint_yellow'); }
  },
});
defObj({
  key: 'pg_cave', name: 'Dino Den Cave', w: 3, d: 2, height: 2.6, block: 'solid', tall: true, movable: 0, hp: 700, sound: 'paper',
  tags: [...T, 'studio', 'fixed'],
  desc: 'Dooley\'s cave from the Dino Den: papier-mache rock over chicken wire, a felt fern, a sign that says COME ON IN! The inside smells of hot plush and meat.',
  model: (mb) => {
    const arch = 16;
    for (let i = 0; i <= arch; i++) {
      const t = (i / arch) * Math.PI, x = Math.cos(t) * 1.25, y = Math.sin(t) * 2.1;
      mb.push(); mb.translate(x, Math.max(0, y - 0.25), 0); mb.rotateZ(t - Math.PI / 2);
      mb.box(0, 0, 0, 0.55 + (i % 3) * 0.08, 0.5, 1.7 + (i % 2) * 0.15, 'pg_rock'); mb.pop();
    }
    for (const s of [-1, 1]) mb.box(s * 1.3, 0, 0, 0.5, 1.6, 1.8, 'pg_rock');
    for (let k = 0; k < 5; k++) { mb.push(); mb.translate(-1.0, 0.1, 0.9); mb.rotateY(k * 0.5 - 1); mb.rotateX(-0.6); mb.box(0, 0.3, 0, 0.08, 0.6, 0.02, 'q_paint_green'); mb.pop(); }
  },
});
defObj({
  key: 'pg_monitor', name: 'Studio Monitor', w: 1, d: 1, height: 1.6, block: 'solid', movable: 0, hp: 200, sound: 'metal',
  tags: [...T, 'studio', 'screen'],
  desc: 'A floor monitor on a trolley, for the presenters to watch themselves. It shows static. Every so often, for a single frame, it shows you from behind.',
  model: (mb) => {
    mb.box(0, 0, 0, 0.6, 0.06, 0.5, 'metal_dark');
    for (const x of [-0.25, 0.25]) for (const z of [-0.2, 0.2]) mb.cylinder(x, -0.04, z, 0.04, 0.05, 6, 'rubber_black');
    rod(mb, 0, 0.06, 0, 0, 0.9, 0, 0.03, 6, 'metal_grey');
    mb.box(0, 0.9, -0.05, 0.56, 0.46, 0.44, 'plastic_beige');
    mb.box(0, 0.96, 0.172, 0.44, 0.34, 0.01, 'pg_screen', { fit: true, emissive: 0.75 } as any);
  },
});

// ---------------------------------------------------------------- the ways in and out
defObj({
  key: 'pg_crawl_tube', name: 'Crawl Tube', w: 1, d: 2, height: 0.95, block: 'solid', movable: 0, hp: 99999, sound: 'plastic',
  tags: [...T, 'portal', 'fixed'],
  desc: 'A red plastic crawl tunnel lying in the grass, the kind you wriggle through on your belly. It is longer inside than outside. Warm, gold light comes from the far end.',
  model: (mb) => {
    const n = 12;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
      for (const [z0, z1, c] of [[-0.95, -0.35, 'q_paint_red'], [-0.35, 0.25, 'q_paint_yellow'], [0.25, 0.9, 'q_paint_red']] as const) {
        const p = (a: number, z: number) => [Math.cos(a) * 0.46, 0.46 + Math.sin(a) * 0.46, z];
        const A = p(a0, z0), B = p(a1, z0), C = p(a1, z1), D = p(a0, z1);
        mb.push(); mb.translate((A[0] + C[0]) / 2, (A[1] + C[1]) / 2, (A[2] + C[2]) / 2); mb.rotateZ((a0 + a1) / 2 + Math.PI / 2);
        mb.box(0, -0.02, 0, Math.hypot(B[0] - A[0], B[1] - A[1]) + 0.01, 0.04, Math.abs(D[2] - A[2]) + 0.01, c); mb.pop();
      }
    }
    for (const z of [-0.95, 0.9]) { mb.push(); mb.translate(0, 0.46, z); mb.rotateX(Math.PI / 2); torus(mb, 0, 0, 0, 0.47, 0.035, 14, 4, 'q_paint_blue'); mb.pop(); }
    mb.box(0, 0.02, 0, 0.62, 0.02, 1.7, 'q_sandpit', { color: 0xfff0c0, emissive: 0.4 });
  },
});
defObj({
  key: 'pg_softplay_hut', name: 'Soft-Play Hut', w: 3, d: 2, height: 2.8, block: 'solid', tall: true, movable: 0, hp: 99999, sound: 'fabric',
  tags: [...T, 'portal', 'fixed'],
  desc: 'A padded hut in primary colours with a little door and a sign: THE BALL HOUSE — SOCKS ONLY. From inside comes the sound of plastic balls shifting, and of somebody laughing, much too close to the door.',
  model: (mb) => {
    const pads = ['q_paint_red', 'q_paint_yellow', 'q_paint_blue', 'q_paint_green'];
    for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) mb.box(-1.25 + i * 0.5, j * 0.5, 0, 0.48, 0.48, 1.8, pads[(i + j) % 4]);
    mb.push(); mb.translate(0, 2.0, 0); mb.rotateZ(0.0);
    mb.box(0, 0, 0, 3.1, 0.12, 2.0, 'q_paint_red');
    for (let i = 0; i < 5; i++) mb.sphere(-1.2 + i * 0.6, 0.35, 0, 0.26, 8, 5, pads[i % 4]);
    mb.pop();
    mb.box(0, 0, 0.905, 0.8, 1.5, 0.02, 'q_paint_white', { color: 0xfff0f8 });
    mb.box(0.3, 0.7, 0.92, 0.06, 0.06, 0.04, 'q_paint_yellow');
    mb.box(0, 1.6, 0.92, 1.6, 0.3, 0.02, 'pg_ballsign', { fit: true } as any);
  },
});
