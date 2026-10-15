// World stream 3 — The Showroom: an endless furniture warehouse. Flat-pack
// stacks on pallets, pallet racking, price stands for products named like
// promises, high-bay lamps, banners over the room sets, a cafeteria menu.
import { defObj } from '../../world/objects';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { makeRamp, mixHex, scaleHex, ph } from '../../gfx/pixel';
import type { PixelCanvas } from '../../gfx/pixel';
import type { ModelBuilder } from '../../gfx/modelBuilder';
import { text, textC, textW, scribble } from './b_common';
import { WZ } from './a_lib';

const T = ['showroom', 'zw'];

/** price stands: product, price (scrip) */
export const ZW_PRICES: [string, string][] = [
  ['SETTLE', '299'], ['HOMEBODY', '149'], ['FOREVER', '89'], ['LONG STAY', '199'], ['STILL', '19'],
  ['FAMILY SET', '999'], ['STAY', '45'], ['RESTFUL', '129'], ['WAITING', '9'], ['HOME', 'SOLD'],
  ['NOT FOR SALE', '-'], ['YOURS', '0'],
];
export const ZW_BANNERS = ['LIVING ROOM 14', 'KITCHEN 6', 'BEDROOM 22', 'OFFICE 3', 'NURSERY 1', 'DINING 9', 'LIVING ROOM 14', 'COLLECTION POINT', 'EXIT THIS WAY', 'YOU ARE HOME'];
const BOX_NAMES = ['SETTLE', 'HOMEBODY', 'FOREVER', 'LONG STAY', 'STILL', 'RESTFUL', 'STAY', 'WAITING'];

function cardboard(pc: PixelCanvas, seed: number) {
  const R = makeRamp(0xb08a58, 5, { spread: 0.25 });
  pc.each((x, y) => pc.set(x, y, R[2 + (ph(x >> 1, y, seed) < 0.12 ? 1 : 0) - ((x + seed) % 9 === 0 ? 1 : 0)]));
}

addTextureModule(() => {
  const A = atlas();
  BOX_NAMES.forEach((n, i) => A.add('zw_box_' + i, 32, 12, (pc) => {
    pc.wrap = false;
    cardboard(pc, 8401 + i);
    pc.rect(1, 1, 30, 10, 0xd8c8a0);
    text(pc, n, 3, 2, 0x1a2a5a);
    // a line drawing of the product, a little man with a screwdriver, a 1
    pc.hline(3, 3 + textW(n), 8, 0x1a2a5a);
    pc.rect(25, 2, 5, 7, 0xf0e8d0); pc.set(27, 3, 0x1a1a1a); pc.vline(27, 4, 7, 0x1a1a1a); pc.set(26, 5, 0x1a1a1a); pc.set(28, 5, 0x1a1a1a);
    for (let x = 0; x < 32; x++) { pc.set(x, 0, 0x8a6a40); pc.set(x, 11, 0x6a4a28); }
  }));
  ZW_PRICES.forEach(([n, p], i) => A.add('zw_price_' + i, 24, 32, (pc) => {
    pc.wrap = false;
    pc.fill(0xf8f4e8);
    pc.rect(0, 0, 24, 9, 0xe8c020);
    textC(pc, n.length > 5 ? n.split(' ')[0] : n, 12, 2, 0x1a1a1a);
    if (n.includes(' ')) textC(pc, n.split(' ')[1], 12, 11, 0x1a1a1a);
    scribble(pc, 2, 18, 20, 0x8a8478, 8410 + i, 2, 2);
    textC(pc, p, 12, 23, p === 'SOLD' || p === '-' ? 0xc02020 : 0x1a1a1a, p.length > 3 ? 1 : 2);
    pc.strokeRect(0, 0, 24, 32, 0xb8b0a0);
  }));
  ZW_BANNERS.forEach((b, i) => A.add('zw_banner_' + i, Math.max(64, textW(b, 2) + 12), 18, (pc) => {
    pc.wrap = false;
    pc.fill(0x2a5a9a);
    for (let x = 0; x < pc.w; x++) { pc.set(x, 0, 0xe8c020); pc.set(x, 1, 0xe8c020); pc.set(x, 16, 0xe8c020); pc.set(x, 17, 0xe8c020); }
    textC(pc, b, pc.w / 2, 4, 0xf8f4e8, 2);
  }));
  A.add('zw_menu', 64, 40, (pc) => {
    pc.wrap = false;
    pc.fill(0x1e2a22);
    for (let y = 0; y < 40; y++) for (let x = 0; x < 64; x++) if (ph(x, y, 8421) < 0.05) pc.set(x, y, 0x26342a);
    textC(pc, 'CAFE', 32, 2, 0xf0e8c8, 2);
    const rows: [string, string][] = [['SOUP OF DAY', 'SOUP'], ['PLATE OF 12', '2.50'], ['COFFEE', 'ALWAYS'], ['CAKE', 'TODAY'], ['CHILD MEAL', 'FREE']];
    rows.forEach(([a, b], k) => { text(pc, a, 3, 15 + k * 5, 0xe8e0c8); text(pc, b, 61 - textW(b), 15 + k * 5, 0xf0c040); });
    pc.strokeRect(0, 0, 64, 40, 0x6a5a3a);
  });
  // wire mesh for cage bins
  A.add('zw_mesh', 8, 8, (pc) => { pc.clear(); for (let i = 0; i < 8; i++) { pc.set(i, 0, 0xb8bcc0); pc.set(0, i, 0xb8bcc0); pc.set(i, 4, 0x9aa0a4); pc.set(4, i, 0x9aa0a4); } });
});

// ============================================================ helpers
function flatBox(mb: ModelBuilder, x: number, y: number, z: number, w: number, h: number, d: number, k: number, rotY = 0) {
  mb.push().translate(x, y, z).rotateY(rotY);
  mb.box(0, 0, 0, w, h, d, { south: 'zw_box_' + (k % BOX_NAMES.length), north: 'zw_box_' + ((k + 3) % BOX_NAMES.length), all: 'cardboard' }, { fit: { south: true, north: true } });
  mb.box(0, h - 0.002, 0, 0.06, 0.004, d + 0.004, 'plastic_white', { color: 0xd8c890 }); // tape
  mb.pop();
}
function pallet(mb: ModelBuilder, x: number, z: number, w = 0.96, d = 0.92) {
  for (const sx of [-1, 0, 1]) mb.box(x + sx * (w / 2 - 0.05), 0, z, 0.09, 0.09, d, 'wood_crate');
  for (let i = 0; i < 5; i++) mb.box(x, 0.09, z - d / 2 + 0.08 + i * (d - 0.16) / 4, w, 0.022, 0.1, 'wood_crate', { color: 0xe8dcc8 });
}

// ============================================================ objects
defObj({
  key: 'zw_flatpack', name: 'Flat-pack Boxes', height: 1.1, block: 'solid', movable: 45,
  container: { capacity: 30, kind: 'box', loot: 'zw_flatpack' },
  sound: 'paper', hp: 110, flammable: 0.9,
  disassemble: { tools: [], time: 8, yields: [['paper', 2, 5], ['plank', 0, 3], ['screws', 1, 6]] },
  desc: 'Flat-pack boxes on a pallet. The instructions inside show a family assembling the furniture. Their faces are left blank.',
  tags: [...T, 'boxes', 'container'],
  variant: (s) => String((s.v ?? 0) % 4),
  model: (mb, s) => {
    const v = (s.v ?? 0) % 4;
    pallet(mb, 0, 0);
    let y = 0.11;
    const n = 3 + v;
    for (let i = 0; i < n; i++) {
      const h = 0.12 + ph(i, v, 8431) * 0.12;
      flatBox(mb, (ph(i, v, 8432) - 0.5) * 0.06, y, (ph(i, v, 8433) - 0.5) * 0.06, 0.9 - (i > 3 ? 0.2 : 0), h, 0.8 - (i % 2) * 0.12, i + v, (ph(i, v, 8434) - 0.5) * 0.12);
      y += h;
    }
    // stretch wrap remnant
    if (v === 1) mb.box(0, 0.12, 0.41, 0.92, 0.4, 0.004, 'glass', { color: 0xe8f0f0 });
  },
});

defObj({
  key: 'zw_rack', name: 'Pallet Racking', w: 2, d: 1, height: 2.6, block: 'solid', blocksSight: true, tall: true, movable: 0,
  container: { capacity: 80, kind: 'shelf', loot: 'zw_flatpack' },
  sound: 'metal', hp: 900,
  disassemble: { tools: ['#wrench'], time: 40, skill: 'mechanics', yields: [['scrap_metal', 4, 9], ['pipe', 1, 3], ['plank', 1, 4]] },
  desc: 'Orange beams, blue uprights, a weight limit nobody has checked. Every box on it is the same product.',
  tags: [...T, 'shelf', 'container'],
  variant: (s) => String((s.v ?? 0) % 3),
  model: (mb, s) => {
    const v = (s.v ?? 0) % 3;
    const up = { color: 0x3a5a9a }, beam = { color: 0xe07a20 };
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      mb.box(sx * 0.96, 0, sz * 0.42, 0.07, 2.6, 0.07, 'metal_painted_green', up);
      mb.box(sx * 0.96, 0, sz * 0.42, 0.16, 0.012, 0.16, 'metal_dark');
    }
    for (const sx of [-1, 1]) for (let k = 0; k < 6; k++) { // upright bracing
      const y0 = 0.15 + k * 0.4;
      mb.push().translate(sx * 0.96, y0, 0).rotateX(k % 2 ? 0.75 : -0.75); mb.box(0, 0, 0, 0.025, 0.55, 0.025, 'metal_painted_green', up); mb.pop();
    }
    for (const y of [0.12, 1.0, 1.88]) for (const sz of [-1, 1]) mb.box(0, y, sz * 0.42, 1.9, 0.1, 0.05, 'metal_painted_green', beam);
    for (const [y, lvl] of [[0.22, 0], [1.1, 1], [1.98, 2]] as const) {
      if (v === 2 && lvl === 1) continue; // one bay picked clean
      for (const x of [-0.48, 0.48]) {
        pallet(mb, x, 0, 0.9, 0.8);
        let yy = y + 0.11 - 0.11;
        for (let i = 0; i < 3; i++) { const h = 0.18; flatBox(mb, x, yy + 0.11, 0, 0.84, h, 0.74, lvl + v, 0); yy += h; }
      }
    }
    // a load sign
    mb.box(0, 1.0, 0.45, 0.2, 0.1, 0.01, 'plastic_yellow');
  },
});

defObj({
  key: 'zw_price_stand', name: 'Price Stand', height: 1.3, block: 'none', movable: 3,
  sound: 'metal', hp: 40,
  desc: 'A price card on a chrome stand. The product name is a promise. The price is in scrip.',
  tags: [...T, 'sign'],
  variant: (s) => String((s.v ?? 0) % ZW_PRICES.length),
  model: (mb, s) => {
    const v = (s.v ?? 0) % ZW_PRICES.length;
    mb.cylinder(0.3, 0, 0.3, 0.1, 0.02, 10, 'chrome');
    mb.cylinder(0.3, 0.02, 0.3, 0.012, 0.95, 6, 'chrome');
    mb.push().translate(0.3, 0.97, 0.3).rotateX(-0.25);
    mb.box(0, 0, 0, 0.24, 0.32, 0.012, { south: 'zw_price_' + v, north: 'zw_price_' + v, all: 'plastic_white' }, { fit: { south: true, north: true } });
    mb.pop();
  },
});

defObj({
  key: 'zw_banner', name: 'Hanging Banner', w: 2, d: 1, height: 0, block: 'none', ceiling: true,
  sound: 'fabric', hp: 80,
  desc: 'EVERYTHING YOU SEE IS FOR SALE. Everything you see.',
  tags: [...T, 'sign', 'ceiling'],
  variant: (s) => String((s.v ?? 0) % ZW_BANNERS.length),
  model: (mb, s) => {
    const v = (s.v ?? 0) % ZW_BANNERS.length;
    mb.box(0, 2.62, 0, 1.96, 0.03, 0.03, 'metal_grey');
    mb.box(0, 2.08, 0, 1.9, 0.52, 0.02, { south: 'zw_banner_' + v, north: 'zw_banner_' + v, all: 'fabric_blue' }, { fit: { south: true, north: true } });
    for (const x of [-0.8, 0.8]) mb.box(x, 2.6, 0, 0.01, 0.06, 0.01, 'metal_grey');
  },
});

defObj({
  key: 'zw_highbay', name: 'High-bay Lamp', height: 0, block: 'none', ceiling: true,
  light: { color: 0xeef2ff, intensity: 0.75, radius: 7.5, y: 2.62, kind: 'fluoro' },
  hum: 'fluoro', tags: [...T, 'light', 'ceiling'],
  model: () => { /* light only: the lamp hangs above the cut-away */ },
});

defObj({
  key: 'zw_cafe_menu', name: 'Cafe Menu', w: 2, d: 1, height: 2.4, block: 'none', onWall: true,
  sound: 'wood', hp: 200,
  desc: 'Chalk on a green board. The soup of the day is soup. The child meal is free, and there is a child meal on every table.',
  tags: [...T, 'sign', 'wall', 'cafe'],
  model: (mb) => {
    mb.box(0, 1.45, WZ + 0.03, 1.9, 0.95, 0.04, { south: 'zw_menu', all: 'wood_dark' }, { fit: { south: true } });
    mb.box(0, 1.42, WZ + 0.03, 1.96, 0.04, 0.06, 'wood_dark'); mb.box(0, 2.4, WZ + 0.03, 1.96, 0.04, 0.06, 'wood_dark');
  },
});

defObj({
  key: 'zw_bargain_bin', name: 'Bargain Bin', height: 0.85, block: 'low', movable: 25,
  container: { capacity: 30, kind: 'bin', loot: 'zw_bargain' },
  sound: 'metal', hp: 160,
  disassemble: { tools: ['#wrench'], time: 10, yields: [['scrap_metal', 1, 3], ['wire', 1, 3]] },
  desc: 'A wire cage of last chances: odd cushions, a single wine glass, picture frames with the sample photo still in.',
  tags: [...T, 'bin', 'container'],
  model: (mb) => {
    mb.box(0, 0, 0, 0.9, 0.06, 0.9, 'metal_grey');
    for (const sx of [-1, 1]) mb.box(sx * 0.44, 0.06, 0, 0.012, 0.74, 0.88, 'zw_mesh', { color: 0xffffff });
    for (const sz of [-1, 1]) mb.box(0, 0.06, sz * 0.44, 0.88, 0.74, 0.012, 'zw_mesh', { color: 0xffffff });
    for (const [x, z] of [[-0.44, -0.44], [0.44, -0.44], [-0.44, 0.44], [0.44, 0.44]] as const) mb.box(x, 0, z, 0.03, 0.82, 0.03, 'chrome');
    // what is in it
    mb.box(-0.15, 0.06, -0.1, 0.4, 0.36, 0.4, 'fabric_red', { color: 0xc8a0a0 });
    mb.box(0.18, 0.06, 0.12, 0.36, 0.3, 0.32, 'fabric_floral');
    mb.box(0.05, 0.4, 0.0, 0.3, 0.22, 0.03, 'p_photo_frame', { fit: true });
    mb.box(-0.2, 0.42, 0.15, 0.3, 0.2, 0.3, 'pillow', { color: 0xa8c0d8 });
    mb.box(0.25, 0.36, -0.2, 0.1, 0.3, 0.1, 'cardboard', { color: 0xe8e0c8 });
  },
});

defObj({
  key: 'zw_flat_trolley', name: 'Flatbed Trolley', w: 1, d: 2, height: 1.1, block: 'low', movable: 40,
  container: { capacity: 30, kind: 'box', loot: 'zw_flatpack' },
  sound: 'metal', hp: 200,
  disassemble: { tools: ['#wrench'], time: 12, skill: 'mechanics', yields: [['scrap_metal', 2, 4], ['pipe', 1, 2]] },
  desc: 'A warehouse trolley, loaded and abandoned halfway to the tills.',
  tags: [...T, 'cart', 'container'],
  model: (mb) => {
    mb.box(0, 0.16, 0, 0.7, 0.04, 1.7, 'metal_grey', { color: 0x9aa0a4 });
    for (const sz of [-1, 1]) for (const sx of [-1, 1]) mb.cylinderX(sx * 0.3, 0.08, sz * 0.75, 0.08, 0.05, 8, 'rubber_black', { caps: true });
    for (const sx of [-1, 1]) mb.box(sx * 0.34, 0.2, -0.82, 0.03, 0.9, 0.03, 'metal_painted_green', { color: 0x3a5a9a });
    mb.box(0, 1.08, -0.82, 0.72, 0.03, 0.03, 'metal_painted_green', { color: 0x3a5a9a });
    flatBox(mb, 0, 0.2, 0.1, 0.62, 0.18, 1.5, 0); flatBox(mb, 0, 0.38, 0.15, 0.6, 0.14, 1.3, 2); flatBox(mb, 0, 0.52, 0.3, 0.5, 0.2, 0.7, 5, 0.1);
  },
});
void mixHex; void scaleHex;
