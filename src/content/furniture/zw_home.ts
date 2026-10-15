// World stream 3 — The Homestead: one family home, copied until it fills the
// dark. Table settings with dinner still warm, family portraits whose faces
// have been smudged out, a console television full of snow, a high chair,
// a children's table, coats on hooks, shoes by the door.
import { defObj } from '../../world/objects';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { makeRamp, mixHex, scaleHex, ph, bayer } from '../../gfx/pixel';
import type { PixelCanvas } from '../../gfx/pixel';
import type { ModelBuilder } from '../../gfx/modelBuilder';
import { WZ, crtGlass } from './a_lib';

const T = ['homestead', 'zw', 'home'];

/** a family portrait: k people, faces smeared to nothing */
function portrait(pc: PixelCanvas, v: number) {
  pc.wrap = false;
  const W = pc.w, H = pc.h;
  const bg = [0x7a8aa0, 0x9a8a6a, 0x6a7a6a, 0x8a7a8a][v % 4];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) pc.set(x, y, mixHex(bg, 0x2a2a30, (y / H) * 0.35 + (bayer(x, y) < 0.15 ? 0.05 : 0)));
  const n = [4, 3, 5, 2][v % 4];
  const cols = [0x3a4a6a, 0x8a3a3a, 0xd0a820, 0x4a6a4a, 0x6a4a6a];
  for (let i = 0; i < n; i++) {
    const cx = Math.round(((i + 0.5) / n) * W), small = i >= n - 1 && n > 2;
    const top = small ? H * 0.5 : H * 0.28;
    // body
    for (let y = Math.round(top + 6); y < H; y++) for (let x = cx - 4; x <= cx + 4; x++) pc.set(x, y, cols[(i + v) % cols.length]);
    // face: smeared sideways like a thumb dragged through wet paint
    for (let y = Math.round(top); y < top + 6; y++) for (let x = cx - 3; x <= cx + 3; x++) pc.set(x, y, 0xd8b898);
    for (let y = Math.round(top) - 1; y < top + 7; y++) for (let x = cx - 4; x <= cx + 6; x++) {
      if (ph(x, y, 8501 + i) < 0.75) pc.blend(x, y, mixHex(0xd8b898, bg, 0.4), 0.85);
    }
    // hair above the smear stays perfectly sharp
    for (let x = cx - 3; x <= cx + 3; x++) pc.set(x, Math.round(top) - 2, i % 2 ? 0x2a1a10 : 0x6a4a2a);
  }
  // the one in the jumpsuit (the newest copy of the family has an extra member)
  if (v === 3) {
    const cx = W - 5;
    for (let y = Math.round(H * 0.3 + 6); y < H; y++) for (let x = cx - 3; x <= cx + 3; x++) pc.set(x, y, 0xe0b828);
    for (let y = Math.round(H * 0.3); y < H * 0.3 + 6; y++) for (let x = cx - 2; x <= cx + 2; x++) pc.set(x, y, 0xe8d8c8);
  }
}

addTextureModule(() => {
  const A = atlas();
  for (let v = 0; v < 4; v++) A.add('zw_portrait_' + v, 28, 22, (pc) => portrait(pc, v));
  A.add('zw_static', 16, 12, (pc) => {
    pc.wrap = false;
    pc.each((x, y) => { const n = ph(x, y, 8511); pc.set(x, y, n < 0.3 ? 0x2a2a30 : n < 0.6 ? 0x8a8a94 : n < 0.85 ? 0xc8c8d0 : 0xf0f0f4); });
    for (let x = 0; x < 16; x++) pc.blend(x, 5, 0xffffff, 0.5);
    crtGlass(pc, 0, 0, 16, 12, 0x0a0a0c, 0.5);
  });
  A.add('zw_plate_food', 16, 16, (pc) => {
    pc.wrap = false; pc.clear();
    pc.circle(7.5, 7.5, 7.5, 0xf4f0e8); pc.circle(7.5, 7.5, 5.8, 0xe8e2d4);
    pc.ellipse(6, 6, 3, 2, 0x8a4a2a); pc.ellipse(9.5, 9, 2.4, 2, 0x5a8a3a); pc.ellipse(9, 5.5, 2, 1.6, 0xe8d090);
    pc.set(5, 5, 0xb87a4a); pc.set(10, 8, 0x7aaa5a);
  });
  A.add('zw_plate_empty', 16, 16, (pc) => {
    pc.wrap = false; pc.clear();
    pc.circle(7.5, 7.5, 7.5, 0xf4f0e8); pc.circle(7.5, 7.5, 5.8, 0xeae6da);
    for (let a = 0; a < 6.28; a += 0.4) pc.set(Math.round(7.5 + Math.cos(a) * 6.6), Math.round(7.5 + Math.sin(a) * 6.6), 0x6a8ab0);
  });
  A.add('zw_tablecloth', 32, 32, (pc) => {
    pc.each((x, y) => pc.set(x, y, ((x >> 2) + (y >> 2)) & 1 ? 0xe8e0d0 : (((x >> 2) & 1) ? 0xc87a7a : 0xe8e0d0)));
    for (let x = 0; x < 32; x += 4) for (let y = 0; y < 32; y++) if (ph(x, y, 8521) < 0.1) pc.set(x, y, 0xd8d0c0);
  });
});

// ============================================================ helpers
function plate(mb: ModelBuilder, x: number, y: number, z: number, food: boolean) {
  mb.cylinder(x, y, z, 0.12, 0.016, 12, { top: food ? 'zw_plate_food' : 'zw_plate_empty', sides: 'porcelain', bottom: 'porcelain' }, { fit: { top: true } as any });
}
function cutlery(mb: ModelBuilder, x: number, y: number, z: number, rotY: number) {
  mb.push().translate(x, y, z).rotateY(rotY);
  mb.box(-0.16, 0, 0, 0.012, 0.004, 0.17, 'chrome'); mb.box(0.16, 0, 0, 0.014, 0.004, 0.18, 'chrome');
  mb.pop();
}
function glassCup(mb: ModelBuilder, x: number, y: number, z: number, col = 0xc8e0e8) {
  mb.cylinder(x, y, z, 0.03, 0.11, 7, 'glass', { color: col, rTop: 0.035 });
}

// ============================================================ objects
defObj({
  key: 'zw_table_setting', name: 'Table Setting', w: 2, d: 1, height: 0.3, block: 'none',
  sound: 'ceramic', hp: 30,
  desc: 'Dinner for the family. The food is still warm. The plates have been laid for one more than there are chairs.',
  tags: [...T, 'table', 'food'],
  variant: (s) => String((s.v ?? 0) % 3),
  model: (mb, s) => {
    const v = (s.v ?? 0) % 3;
    mb.box(0, 0.002, 0, 1.92, 0.006, 0.9, 'zw_tablecloth', { color: [0xffffff, 0xd8e8ff, 0xffe8d8][v] });
    for (const sx of [-1, 1]) mb.box(sx * 0.962, -0.2, 0, 0.006, 0.206, 0.9, 'zw_tablecloth', { color: [0xffffff, 0xd8e8ff, 0xffe8d8][v] });
    const seats: [number, number, number][] = [[-0.5, 0.27, 0], [0.5, 0.27, 0], [-0.5, -0.27, Math.PI], [0.5, -0.27, Math.PI], [-0.82, 0, Math.PI / 2], [0.82, 0, -Math.PI / 2]];
    seats.forEach(([x, z, a], i) => {
      plate(mb, x, 0.008, z, v !== 2 || i < 3);
      cutlery(mb, x, 0.008, z, a);
      glassCup(mb, x + 0.14, 0.008, z - Math.sign(z || 1) * 0.12, i % 2 ? 0xe8c8c8 : 0xc8e0e8);
    });
    if (v === 0) { // the roast
      mb.cylinder(0, 0.008, 0, 0.2, 0.02, 12, 'porcelain', { color: 0xe8e4d8 });
      mb.sphere(0, 0.07, 0, 0.12, 8, 5, 'leather_brown', { sy: 0.6, color: 0xc88a4a });
      for (let k = 0; k < 5; k++) mb.sphere(Math.cos(k * 1.3) * 0.13, 0.04, Math.sin(k * 1.3) * 0.13, 0.03, 5, 3, 'plastic_yellow', { color: 0xe8b860 });
    } else if (v === 1) { // the birthday cake, candles lit
      mb.cylinder(0, 0.008, 0, 0.17, 0.12, 12, 'plastic_white', { color: 0xf8e0e8 });
      mb.cylinder(0, 0.128, 0, 0.17, 0.02, 12, 'plastic_white', { color: 0xf0b0c0 });
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2;
        mb.box(Math.cos(a) * 0.11, 0.148, Math.sin(a) * 0.11, 0.008, 0.06, 0.008, 'plastic_white', { color: k % 2 ? 0x80b0f0 : 0xf0e080 });
        mb.box(Math.cos(a) * 0.11, 0.208, Math.sin(a) * 0.11, 0.01, 0.018, 0.01, 'white', { color: 0xffc040, emissive: 1.6 });
      }
    } else { // breakfast that nobody finished
      mb.box(0, 0.008, 0, 0.22, 0.25, 0.08, 'cardboard', { color: 0xf0c040 });
      mb.cylinder(0.25, 0.008, 0.05, 0.05, 0.2, 8, 'plastic_white', { color: 0xf4f4f0 });
      mb.cylinder(-0.22, 0.008, -0.04, 0.06, 0.1, 8, 'glass', { color: 0xf0a030 });
    }
    // salt, pepper, a candlestick
    mb.cylinder(0.3, 0.008, -0.05, 0.015, 0.07, 6, 'porcelain'); mb.cylinder(0.34, 0.008, -0.05, 0.015, 0.07, 6, 'plastic_black');
    mb.cylinder(-0.3, 0.008, 0.02, 0.03, 0.02, 8, 'metal_brass'); mb.cylinder(-0.3, 0.028, 0.02, 0.012, 0.22, 6, 'plastic_white', { color: 0xf8f0e0 });
  },
});

defObj({
  key: 'zw_portrait', name: 'Family Portrait', height: 2.0, block: 'none', onWall: true,
  sound: 'wood', hp: 30, flammable: 0.8,
  desc: 'A studio portrait of the family. Every face has been smudged sideways, as if wiped with a thumb before it dried. The hair is perfect.',
  tags: [...T, 'photo', 'wall', 'decor'],
  variant: (s) => String((s.v ?? 0) % 4),
  model: (mb, s) => {
    const v = (s.v ?? 0) % 4;
    mb.box(0, 1.25, WZ + 0.025, 0.84, 0.68, 0.04, 'wood_dark', { color: 0xc8a060 });
    mb.box(0, 1.29, WZ + 0.048, 0.76, 0.6, 0.006, 'zw_portrait_' + v, { fit: true });
    mb.box(0, 1.94, WZ + 0.01, 0.01, 0.06, 0.01, 'metal_brass');
  },
});

defObj({
  key: 'zw_tv_console', name: 'Console Television', w: 1, d: 1, height: 1.0, block: 'solid', movable: 50, power: true, hum: 'tv',
  light: { color: 0xc8d0ff, intensity: 0.5, radius: 3.4, y: 0.7, kind: 'screen', power: true, flicker: 0.3 },
  sound: 'wood', hp: 140, flammable: 0.6,
  disassemble: { tools: ['#screwdriver'], time: 25, skill: 'electrical', yields: [['electronics_scrap', 3, 5], ['glass_shard', 2, 3], ['plank', 1, 2], ['wire', 1, 3]] },
  desc: 'A wood-grain console set. Snow, and under the snow a living room with a family on a sofa, watching a television.',
  tags: [...T, 'tv', 'electronics', 'living'],
  variant: (s) => (s.unpowered ? 'off' : 'on'),
  model: (mb, s) => {
    const lit = !s.unpowered, zc = -0.08;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mb.cylinder(sx * 0.4, 0, zc + sz * 0.2, 0.02, 0.12, 6, 'wood_dark', { rTop: 0.025 });
    mb.box(0, 0.12, zc, 0.92, 0.76, 0.56, 'wood_dark', { color: 0xb8885a });
    mb.box(0, 0.88, zc, 0.96, 0.04, 0.6, 'wood_dark', { color: 0xd8a878 });
    mb.box(-0.12, 0.26, zc + 0.282, 0.56, 0.5, 0.012, 'plastic_black', { color: 0x6a6460 });
    mb.box(-0.12, 0.29, zc + 0.29, 0.5, 0.44, 0.01, { south: lit ? 'zw_static' : 'p_crt_off', all: 'glass_dark' }, { fit: { south: true }, emissive: lit ? 0.95 : 0 });
    mb.box(0.32, 0.2, zc + 0.284, 0.2, 0.62, 0.01, 'p_speaker_cloth');
    for (let i = 0; i < 2; i++) mb.cylinderZ(0.32, 0.72 - i * 0.08, zc + 0.3, 0.03, 0.03, 8, 'chrome');
    // a doily and a framed photo on top, face down
    mb.box(0.1, 0.92, zc, 0.4, 0.004, 0.3, 'p_lace');
    mb.box(-0.25, 0.925, zc, 0.18, 0.012, 0.14, 'wood_dark', { color: 0xc8a060 });
  },
});

defObj({
  key: 'zw_highchair', name: 'High Chair', height: 1.05, block: 'low', movable: 7,
  sound: 'wood', hp: 40, flammable: 0.8,
  disassemble: { tools: ['#hammer'], time: 6, skill: 'carpentry', yields: [['plank', 1, 2], ['nails', 1, 3]] },
  desc: 'A wooden high chair with a tray. There is a bowl on the tray, and a spoon, and it has been licked clean.',
  tags: [...T, 'chair', 'nursery'],
  model: (mb) => {
    const w = 'wood_light', c = { color: 0xf0e0c8 };
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      mb.push().translate(sx * 0.2, 0, sz * 0.2).rotateZ(-sx * 0.12).rotateX(sz * 0.12);
      mb.box(0, 0, 0, 0.04, 0.72, 0.04, w, c); mb.pop();
    }
    mb.box(0, 0.68, 0, 0.36, 0.04, 0.34, w, c);
    mb.box(0, 0.72, -0.16, 0.34, 0.34, 0.03, w, c);
    for (const sx of [-1, 1]) mb.box(sx * 0.16, 0.72, 0, 0.03, 0.16, 0.3, w, c);
    mb.box(0, 0.86, 0.2, 0.42, 0.025, 0.18, 'plastic_white', { color: 0xf0e8d8 });
    mb.cylinder(0.05, 0.885, 0.2, 0.05, 0.03, 8, 'plastic_blue', { color: 0x8ab0e0 });
    mb.box(-0.08, 0.888, 0.22, 0.012, 0.006, 0.08, 'chrome');
    mb.box(0, 0.22, 0.12, 0.34, 0.025, 0.08, w, c);
  },
});

defObj({
  key: 'zw_kids_table', name: "Children's Table", w: 2, d: 1, height: 0.5, block: 'table', surface: 0.48, movable: 10,
  sound: 'wood', hp: 50, flammable: 0.8,
  disassemble: { tools: ['#hammer'], time: 6, skill: 'carpentry', yields: [['plank', 1, 3], ['nails', 1, 3]] },
  desc: 'A little table painted primary colours. Crayon on paper: the house, and the house, and the house.',
  tags: [...T, 'table', 'nursery'],
  model: (mb) => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mb.cylinder(sx * 0.8, 0, sz * 0.32, 0.03, 0.46, 6, 'plastic_red', { color: [0xd84a3a, 0x3a7ad8][(sx + sz + 2) % 2] });
    mb.box(0, 0.46, 0, 1.8, 0.03, 0.76, 'wood_light', { color: 0xf0e080 });
    for (let i = 0; i < 4; i++) {
      mb.push().translate(-0.6 + i * 0.4, 0.492, (i % 2 ? 0.1 : -0.12)).rotateY((i - 1.5) * 0.3);
      mb.box(0, 0, 0, 0.21, 0.003, 0.29, { top: 'zgs_drawing', all: 'paper' }, { fit: { top: true } }); mb.pop();
    }
    for (let i = 0; i < 6; i++) mb.box(-0.3 + i * 0.12, 0.49, 0.25 + (i % 2) * 0.04, 0.012, 0.012, 0.08, 'plastic_red', { color: [0xd83a3a, 0x3a8ad8, 0x3ab84a, 0xe8c020, 0x8a3ab8, 0x1a1a1a][i] });
  },
});

defObj({
  key: 'zw_kids_chair', name: "Child's Chair", height: 0.55, block: 'low', sit: true, movable: 2,
  sound: 'plastic', hp: 25,
  desc: 'A small chair. Small enough that sitting on it would be a choice.',
  tags: [...T, 'chair', 'nursery', 'sit'],
  variant: (s) => String((s.v ?? 0) % 4),
  model: (mb, s) => {
    const col = [0xd84a3a, 0x3a7ad8, 0x3ab84a, 0xe8c020][(s.v ?? 0) % 4];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mb.box(sx * 0.13, 0, sz * 0.13, 0.03, 0.28, 0.03, 'plastic_red', { color: col });
    mb.box(0, 0.28, 0, 0.32, 0.03, 0.32, 'plastic_red', { color: col });
    mb.box(0, 0.31, -0.15, 0.3, 0.24, 0.025, 'plastic_red', { color: scaleHex(col, 1.1) });
  },
});

defObj({
  key: 'zw_coat_hooks', name: 'Coat Hooks', height: 1.9, block: 'none', onWall: true,
  sound: 'fabric', hp: 60, flammable: 0.8,
  container: { capacity: 12, kind: 'wardrobe', loot: 'zw_coats' },
  desc: 'Four hooks, four coats. A child-sized one is still damp from rain that never fell here.',
  tags: [...T, 'wall', 'clothes', 'container'],
  model: (mb) => {
    mb.box(0, 1.62, WZ + 0.02, 0.9, 0.08, 0.03, 'wood_dark');
    const cols = [0x3a4a6a, 0x8a3a3a, 0x6a6a5a, 0xe0b828];
    for (let i = 0; i < 4; i++) {
      const x = -0.33 + i * 0.22, small = i === 3;
      mb.box(x, 1.63, WZ + 0.06, 0.02, 0.02, 0.06, 'metal_brass');
      const len = small ? 0.55 : 0.85;
      mb.box(x, 1.62 - len, WZ + 0.08, 0.18, len, 0.1, 'fabric_grey', { color: cols[i] });
      mb.box(x, 1.55, WZ + 0.08, 0.2, 0.08, 0.12, 'fabric_grey', { color: scaleHex(cols[i], 0.85) });
    }
  },
});

defObj({
  key: 'zw_shoe_rack', name: 'Shoe Rack', height: 0.45, block: 'low', movable: 6,
  container: { capacity: 10, kind: 'shelf', loot: 'zw_shoes' },
  sound: 'wood', hp: 40, flammable: 0.8,
  desc: 'Shoes paired by the door, toes to the wall. One pair is yours. You are wearing them.',
  tags: [...T, 'shelf', 'container'],
  model: (mb) => {
    const zc = WZ + 0.18;
    for (const sx of [-1, 1]) mb.box(sx * 0.42, 0, zc, 0.03, 0.42, 0.3, 'wood_light', { color: 0xd8b888 });
    for (const y of [0.05, 0.22, 0.4]) mb.box(0, y, zc, 0.84, 0.02, 0.3, 'wood_light', { color: 0xd8b888 });
    const shoe = (x: number, y: number, col: number, big: boolean) => {
      for (const dx of [-0.045, 0.045]) { mb.box(x + dx, y, zc + 0.02, 0.07, big ? 0.08 : 0.06, big ? 0.24 : 0.17, 'leather_brown', { color: col }); }
    };
    shoe(-0.26, 0.07, 0x3a2a1a, true); shoe(0.0, 0.07, 0x8a6a4a, true); shoe(0.26, 0.07, 0xd84a3a, false);
    shoe(-0.22, 0.24, 0xe8e0d0, true); shoe(0.2, 0.24, 0x2a2a2e, true);
  },
});
void makeRamp;
