// Furniture A — kitchen & break room.
import { defObj } from '../../world/objects';
import {
  atlas, addTextureModule, PixelCanvas, makeRamp, mixHex, scaleHex, ph, tileFbm, WZ,
  txt, scribble, fillR, border, legs4, rlegs4, knob, hbar, vbar,
} from './a_lib';
import type { ModelBuilder } from './a_lib';

const T = (...t: string[]) => ['setA', ...t];
const on = (s: any) => !(s.on === false || s.broken || s.unpowered);

// ============================================================ textures
const OAK = 0xb07a40;
function oakGrain(x: number, y: number) {
  const g = Math.sin((x + tileFbm(x, y, 32, 32, 2, 2, 7) * 9) * (Math.PI * 2 * 5 / 32)) * 0.5 + 0.5;
  return (g > 0.86 ? -0.22 : g < 0.1 ? 0.08 : 0) + (tileFbm(x, y, 32, 32, 3, 2, 3) - 0.5) * 0.28;
}
function oakFront(pc: PixelCanvas, panel: boolean) {
  pc.wrap = false;
  const R = makeRamp(OAK, 6, { hueShift: 0.03, spread: 0.45 });
  const W = pc.w, H = pc.h;
  fillR(pc, 0, 0, W, H, R, (x, y) => 0.5 + oakGrain(x * 1.3, y * 0.5) + (ph(x, y, 5) - 0.5) * 0.05, 0.6);
  pc.hline(0, W - 1, 0, R[5]); pc.vline(0, 0, H - 1, R[4]); pc.hline(0, W - 1, H - 1, R[0]); pc.vline(W - 1, 0, H - 1, R[1]);
  if (panel) {
    const x0 = 3, y0 = 3, x1 = W - 4, y1 = H - 4;
    pc.hline(x0, x1, y0, R[1]); pc.vline(x0, y0, y1, R[1]); pc.hline(x0, x1, y1, R[4]); pc.vline(x1, y0, y1, R[4]);
    pc.hline(x0 + 1, x1 - 1, y0 + 1, R[4]); pc.vline(x0 + 1, y0 + 1, y1 - 1, R[3]);
    // cathedral arch hint at the top of the panel
    for (let x = x0 + 2; x <= x1 - 2; x++) { const d = Math.abs(x - (x0 + x1) / 2); if (d < 3) pc.set(x, y0 + 2 + (d < 1.5 ? 0 : 1), R[2]); }
  } else {
    pc.hline(1, W - 2, 1, R[4]);
  }
}

addTextureModule(() => {
  const A = atlas();
  A.add('p_oak', 32, 32, (pc) => {
    const R = makeRamp(OAK, 6, { hueShift: 0.03, spread: 0.45 });
    pc.fillRamp(R, (x, y) => 0.5 + oakGrain(x, y) + (ph(x, y, 5) - 0.5) * 0.05, 0.6);
  });
  A.add('p_oak_door', 14, 20, (pc) => oakFront(pc, true));
  A.add('p_oak_drawer', 14, 5, (pc) => oakFront(pc, false));
  A.add('p_formica', 32, 32, (pc, rng) => {
    const R = makeRamp(0xe2d6b4, 4, { spread: 0.2 });
    pc.fillRamp(R, (x, y) => 0.55 + (tileFbm(x, y, 32, 32, 4, 2, 41) - 0.5) * 0.3, 0.8);
    pc.speckle(rng, [0x9a7a50, 0xb89a6a, 0x6a5038], 0.06);
    pc.speckle(rng, [0xf4ecd8], 0.03);
    // a ring stain from a mug
    pc.stain(9, 22, 2.5, 0xc8b490, 0xa88a60, 3);
  });
  A.add('p_stove_top', 24, 20, (pc) => {
    pc.wrap = false;
    const E = makeRamp(0xece8de, 5, { spread: 0.25 });
    fillR(pc, 0, 0, 24, 20, E, (x, y) => 0.6 + (ph(x, y, 2) - 0.5) * 0.08, 1);
    const burner = (cx: number, cy: number, r: number) => {
      pc.circle(cx, cy, r + 1.2, 0xb4b8bc); pc.circle(cx, cy, r + 0.6, 0x8a8e92); // drip pan
      for (let rr = r; rr > 0.5; rr -= 1.3) { pc.circle(cx, cy, rr, 0x1e1e20); pc.circle(cx, cy, rr - 0.6, 0x5a5a5e); }
      pc.set(Math.round(cx), Math.round(cy), 0x2a2a2e);
    };
    burner(6, 5.5, 3.6); burner(17.5, 5.5, 2.8); burner(6, 14.5, 2.8); burner(17.5, 14.5, 3.6);
    pc.stain(12, 10, 2, 0xc8a878, 0x8a6a40, 9); // old spill
    pc.hline(0, 23, 0, E[4]); pc.hline(0, 23, 19, E[1]);
  });
  A.add('p_oven_door', 22, 13, (pc) => {
    pc.wrap = false;
    const E = makeRamp(0xece8de, 5, { spread: 0.25 });
    pc.fill(E[3]);
    pc.hline(0, 21, 0, E[4]); pc.hline(0, 21, 12, E[0]); pc.vline(21, 0, 12, E[1]);
    pc.rect(4, 3, 14, 7, 0x16120e); pc.strokeRect(3, 2, 16, 9, E[1]);
    pc.hline(5, 16, 7, 0x3a3430); pc.hline(5, 16, 5, 0x2a2420); // oven rack
    pc.blend(5, 4, 0xffffff, 0.3); pc.blend(6, 4, 0xffffff, 0.2);
    pc.set(10, 8, 0x5a3a20); pc.set(11, 8, 0x6a4a28);
  });
  A.add('p_stove_panel', 24, 6, (pc) => {
    pc.wrap = false;
    pc.fill(0xd8d2c4); pc.hline(0, 23, 0, 0xf0ece0); pc.hline(0, 23, 5, 0xa8a294);
    pc.rect(9, 1, 6, 3, 0x101414);
    pc.rect(9, 1, 6, 3, 0x101414); pc.hline(10, 11, 2, 0x5ad8ff); pc.hline(13, 14, 2, 0x5ad8ff); pc.set(12, 1, 0x5ad8ff); pc.set(12, 3, 0x5ad8ff);
    for (const x of [2, 5, 18, 21]) { pc.set(x, 4, 0x8a8478); }
  });
  A.add('p_fridge_door', 22, 37, (pc) => {
    pc.wrap = false;
    const E = makeRamp(0xece2c8, 5, { spread: 0.25, hueShift: 0.02 });
    fillR(pc, 0, 0, 22, 37, E, (x, y) => 0.62 - x * 0.006 + (ph(x, y, 3) - 0.5) * 0.06, 1);
    pc.hline(0, 21, 0, E[4]); pc.vline(0, 0, 36, E[4]); pc.vline(21, 0, 36, E[1]); pc.hline(0, 21, 36, E[0]);
    // child's crayon drawing: house, sun, three figures (one scribbled out)
    pc.rect(2, 4, 10, 9, 0xfaf8f2); pc.hline(2, 11, 12, 0xd8d4c8);
    pc.circle(10, 6, 1.2, 0xf0c020);
    pc.line(3, 9, 5, 7, 0xd04040); pc.line(5, 7, 7, 9, 0xd04040); pc.strokeRect(3, 9, 5, 3, 0x4060d0);
    pc.vline(9, 9, 11, 0x303030); pc.vline(10, 10, 11, 0x303030);
    pc.set(9, 8, 0x303030); pc.set(10, 9, 0x303030);
    for (let k = 0; k < 4; k++) pc.set(8 + (k & 1), 8 + k, 0x101010); // scribbled-out third figure
    pc.set(7, 4, 0xe04060); // magnet
    // polaroid with a blurred face
    pc.rect(13, 5, 7, 8, 0xf6f6f2); pc.rect(14, 6, 5, 5, 0x8aa0b0);
    pc.ellipse(16.5, 8.5, 1.6, 2, 0xc8a890);
    for (let y = 7; y < 11; y++) for (let x = 15; x < 19; x++) if (ph(x, y, 9) < 0.55) pc.set(x, y, mixHex(pc.get(x, y), 0xb0a8a0, 0.6));
    pc.rect(14, 10, 5, 1, 0x4a5a7a);
    pc.set(16, 5, 0x30a0e0);
    // letter magnets
    txt(pc, 'HI', 3, 16, 0xe03030, 1); pc.set(5, 18, 0x30a040);
    pc.rect(9, 16, 2, 2, 0xf0c030); pc.rect(12, 17, 2, 2, 0x4080e0);
    // shopping list under a magnet
    pc.rect(14, 15, 6, 10, 0xfaf6e8); scribble(pc, 15, 17, 4, 4, 0x3a3a8a, 66, 2); pc.rect(16, 14, 2, 2, 0xd04090);
    // calendar page stuck on one date
    pc.rect(3, 22, 9, 9, 0xf8f8f4); pc.rect(3, 22, 9, 2, 0x3a7ab0);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) pc.set(4 + c * 2, 25 + r * 2, 0x9a9aa0);
    pc.strokeRect(7, 26, 3, 3, 0xd02020);
    // fingerprints / grime near the handle
    pc.grime(0xb8ac90, 0.5, 4, 3, 0.62);
  });
  A.add('p_fridge_freezer', 22, 15, (pc) => {
    pc.wrap = false;
    const E = makeRamp(0xece2c8, 5, { spread: 0.25, hueShift: 0.02 });
    fillR(pc, 0, 0, 22, 15, E, (x, y) => 0.62 - x * 0.006 + (ph(x, y, 4) - 0.5) * 0.06, 1);
    pc.hline(0, 21, 0, E[4]); pc.vline(0, 0, 14, E[4]); pc.vline(21, 0, 14, E[1]); pc.hline(0, 21, 14, E[0]);
    // pizza-place magnet and a takeaway menu
    pc.rect(3, 4, 5, 6, 0xf4f0e0); scribble(pc, 4, 5, 3, 3, 0xb03030, 7, 2); pc.set(5, 3, 0x2a2a2a);
    pc.circle(14, 7, 1.5, 0xe0a020); pc.set(14, 7, 0xc03020);
  });
  A.add('p_microwave', 16, 9, (pc) => {
    pc.wrap = false;
    pc.fill(0x3a3a3e);
    pc.hline(0, 15, 0, 0x5a5a5e); pc.hline(0, 15, 8, 0x1e1e20);
    pc.rect(1, 1, 10, 7, 0x0e0f10); pc.strokeRect(1, 1, 10, 7, 0x4a4a50);
    for (let y = 2; y < 7; y++) for (let x = 2; x < 10; x++) if ((x + y) % 2 === 0) pc.set(x, y, 0x1a1c1e);
    pc.blend(2, 2, 0xffffff, 0.25); pc.blend(3, 2, 0xffffff, 0.15);
    pc.rect(12, 1, 3, 2, 0x0a1a0e); pc.set(12, 1, 0x50f070); pc.set(14, 1, 0x50f070); pc.set(13, 2, 0x50f070);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) pc.set(12 + c * 2, 4 + r, 0xb8b8b8);
    pc.set(13, 7, 0xd04040);
  });
  A.add('p_gingham', 16, 16, (pc) => {
    pc.each((x, y) => {
      const a = ((x >> 2) & 1), b = ((y >> 2) & 1);
      const c = a && b ? 0xb02a2a : a || b ? 0xd88a84 : 0xf2ece4;
      pc.set(x, y, (x + y) % 4 === 0 ? mixHex(c, 0x000000, 0.06) : c);
    });
  });
  A.add('p_lace', 16, 8, (pc) => {
    pc.fill(0xf2ece0);
    pc.each((x, y) => { if (((x + 2) % 4 === 0 && (y + 2) % 4 === 0) || ((x % 4 === 0) && (y % 4 === 0))) pc.set(x, y, 0x8a6a48); });
    for (let x = 0; x < 16; x += 2) { pc.set(x, 0, 0xd8d0c0); pc.set(x + 1, 7, 0xd8d0c0); }
  });
  A.add('p_toast', 4, 4, (pc) => { pc.fill(0xc89048); pc.strokeRect(0, 0, 4, 4, 0x8a5a28); pc.set(1, 1, 0xe0b070); });
  A.add('p_freezer_badge', 8, 3, (pc) => {
    pc.wrap = false;
    pc.fill(0xc8ccd0); pc.hline(1, 6, 1, 0x2a5ab0); pc.set(0, 0, 0xffffff); pc.set(7, 2, 0x8a8e92);
  });
});

// ============================================================ shared builders
/** base cabinet carcass with toe kick and countertop. Returns front z. */
function baseCabinet(mb: ModelBuilder, w = 1.0, sink = false) {
  const D = 0.6, zc = WZ + D / 2, zf = zc + D / 2, top = 0.88;
  mb.box(0, 0, zc - 0.03, w - 0.02, 0.09, D - 0.08, 'metal_dark', { color: 0x5a5048 });
  mb.box(0, 0.09, zc, w, top - 0.09, D, 'p_oak', { color: 0xe8e0d8 });
  if (!sink) {
    mb.box(0, top, zc + 0.015, w, 0.04, D + 0.03, { top: 'p_formica', all: 'p_formica' });
  } else {
    const hx = 0.27, hz0 = zc - 0.17, hz1 = zc + 0.17;
    mb.boxMinMax(-w / 2, top, zc - D / 2, w / 2, top + 0.04, hz0, 'p_formica');
    mb.boxMinMax(-w / 2, top, hz1, w / 2, top + 0.04, zf + 0.03, 'p_formica');
    mb.boxMinMax(-w / 2, top, hz0, -hx, top + 0.04, hz1, 'p_formica');
    mb.boxMinMax(hx, top, hz0, w / 2, top + 0.04, hz1, 'p_formica');
    // stainless basin
    mb.boxMinMax(-hx, top - 0.2, hz0, hx, top - 0.19, hz1, 'metal_brushed', { color: 0xb8bcc0 });
    mb.boxMinMax(-hx, top - 0.2, hz0, hx, top + 0.035, hz0 + 0.01, 'metal_brushed');
    mb.boxMinMax(-hx, top - 0.2, hz1 - 0.01, hx, top + 0.035, hz1, 'metal_brushed', { color: 0x9a9ea2 });
    mb.boxMinMax(-hx, top - 0.2, hz0, -hx + 0.01, top + 0.035, hz1, 'metal_brushed', { color: 0xa8acb0 });
    mb.boxMinMax(hx - 0.01, top - 0.2, hz0, hx, top + 0.035, hz1, 'metal_brushed');
    mb.cylinder(0, top - 0.19, zc, 0.03, 0.004, 6, 'metal_dark');
    mb.boxMinMax(-hx - 0.012, top + 0.04, hz0 - 0.012, hx + 0.012, top + 0.046, hz1 + 0.012, 'metal_brushed', { color: 0xd0d4d8 });
    // faucet
    mb.cylinder(0, top + 0.04, zc - 0.24, 0.025, 0.04, 6, 'chrome');
    mb.cylinder(0, top + 0.08, zc - 0.24, 0.014, 0.22, 6, 'chrome');
    mb.cylinderZ(0, top + 0.3, zc - 0.17, 0.014, 0.15, 6, 'chrome');
    mb.cylinder(0, top + 0.25, zc - 0.1, 0.012, 0.05, 6, 'chrome');
    for (const sx of [-0.1, 0.1]) { mb.cylinder(sx, top + 0.04, zc - 0.24, 0.02, 0.05, 6, 'chrome'); mb.box(sx, top + 0.09, zc - 0.24, 0.07, 0.015, 0.02, sx < 0 ? 'plastic_red' : 'plastic_blue'); }
    // sponge and dish soap
    mb.box(0.36, top + 0.04, zc - 0.2, 0.09, 0.03, 0.06, 'plastic_yellow', { color: 0xd8e870 });
    mb.cylinder(-0.38, top + 0.04, zc - 0.21, 0.03, 0.17, 6, 'plastic_blue', { color: 0x9ae0a0 });
  }
  mb.box(0, top + 0.04, WZ + 0.012, w, 0.1, 0.024, 'p_formica', { color: 0xe8e0d0 });
  return zf;
}

function cabinetFronts(mb: ModelBuilder, zf: number, w: number, drawers: boolean) {
  const n = w > 0.7 ? 2 : 1, cw = w / n;
  for (let i = 0; i < n; i++) {
    const cx = -w / 2 + cw * (i + 0.5);
    if (drawers) {
      mb.box(cx, 0.72, zf + 0.01, cw - 0.03, 0.14, 0.02, { south: 'p_oak_drawer', all: 'p_oak' }, { fit: { south: true } });
      hbar(mb, cx, 0.79, zf + 0.02, 0.1, 'metal_brass');
    } else {
      mb.box(cx, 0.72, zf + 0.01, cw - 0.03, 0.14, 0.02, { south: 'p_oak_drawer', all: 'p_oak' }, { fit: { south: true }, color: 0xe0d8d0 });
    }
    mb.box(cx, 0.11, zf + 0.01, cw - 0.03, 0.59, 0.02, { south: 'p_oak_door', all: 'p_oak' }, { fit: { south: true } });
    knob(mb, cx + (i === 0 && n === 2 ? cw / 2 - 0.06 : n === 2 ? -cw / 2 + 0.06 : cw / 2 - 0.06), 0.64, zf + 0.02, 0.03, 'metal_brass');
  }
}

// ============================================================ models
defObj({
  key: 'counter_kitchen', name: 'Kitchen Counter', height: 0.92, block: 'table', surface: 0.92, movable: 0,
  container: { capacity: 25, kind: 'counter', loot: 'kitchen_counter' }, sound: 'wood', flammable: 0.5,
  disassemble: { tools: ['#hammer', '#saw'], time: 25, skill: 'carpentry', yields: [['plank', 2, 3], ['nails', 3, 7]] },
  tags: T('kitchen', 'counter'),
  model: (mb) => {
    const zf = baseCabinet(mb, 1.0, false);
    cabinetFronts(mb, zf, 1.0, true);
    // utensil crock at the back corner
    mb.cylinder(-0.38, 0.92, WZ + 0.1, 0.05, 0.13, 6, 'porcelain', { color: 0xc8d8e0 });
    for (const [dx, dz, h] of [[-0.01, 0, 0.24], [0.015, 0.01, 0.2], [0, -0.015, 0.27]]) mb.box(-0.38 + dx, 0.92, WZ + 0.1 + dz, 0.012, h, 0.012, dx < 0 ? 'wood_light' : 'metal_brushed');
  },
});

defObj({
  key: 'counter_sink', name: 'Kitchen Sink', height: 1.22, block: 'table', surface: 0.92, movable: 0,
  container: { capacity: 18, kind: 'cabinet', loot: 'kitchen_cabinet' }, sound: 'metal', flammable: 0.3,
  water: { capacity: 20, tap: true, tainted: false },
  disassemble: { tools: ['#wrench', '#hammer'], time: 30, skill: 'mechanics', yields: [['pipe', 1, 2], ['sheet_metal', 1, 1], ['plank', 1, 2], ['nails', 2, 5]] },
  tags: T('kitchen', 'counter', 'water'),
  model: (mb) => {
    const zf = baseCabinet(mb, 1.0, true);
    cabinetFronts(mb, zf, 1.0, false);
  },
});

defObj({
  key: 'stove', name: 'Stove', height: 1.1, block: 'table', surface: 0.92, movable: 70, power: true,
  heat: 'stove', container: { capacity: 15, kind: 'oven', loot: 'kitchen_cabinet', heating: true }, sound: 'metal', flammable: 0,
  disassemble: { tools: ['#screwdriver', '#wrench'], time: 35, skill: 'electrical', yields: [['sheet_metal', 2, 4], ['scrap_metal', 2, 4], ['wire', 1, 3], ['electronics_scrap', 0, 1]] },
  tags: T('kitchen', 'stove', 'appliance'),
  model: (mb) => {
    const W = 0.76, D = 0.64, zc = WZ + D / 2, zf = zc + D / 2, en = { color: 0xf0ece4 };
    mb.box(0, 0.03, zc, W, 0.88, D, 'porcelain', en);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mb.box(sx * (W / 2 - 0.04), 0, zc + sz * (D / 2 - 0.05), 0.04, 0.03, 0.04, 'metal_dark');
    mb.box(0, 0.91, zc, W + 0.01, 0.012, D + 0.01, { top: 'p_stove_top', all: 'porcelain' }, { fit: { top: true } });
    // burner coils as slight relief
    for (const [x, z, r] of [[-0.19, -0.14, 0.1], [0.18, -0.14, 0.08], [-0.19, 0.13, 0.08], [0.18, 0.13, 0.1]]) mb.cylinder(x, 0.922, zc + z, r, 0.006, 8, 'metal_dark', { caps: false });
    // backsplash control panel
    mb.box(0, 0.92, WZ + 0.04, W, 0.18, 0.06, { south: 'p_stove_panel', all: 'porcelain' }, { fit: { south: true }, ...en });
    for (const x of [-0.3, -0.2, 0.2, 0.3]) mb.cylinderZ(x, 0.985, WZ + 0.08, 0.022, 0.03, 6, 'plastic_black');
    // oven door + handle + broiler drawer
    mb.box(0, 0.22, zf + 0.012, W - 0.04, 0.56, 0.024, { south: 'p_oven_door', all: 'porcelain' }, { fit: { south: true } });
    mb.box(0, 0.73, zf + 0.06, W - 0.14, 0.025, 0.025, 'chrome');
    for (const sx of [-0.3, 0.3]) mb.box(sx, 0.725, zf + 0.04, 0.02, 0.02, 0.04, 'chrome');
    mb.box(0, 0.06, zf + 0.01, W - 0.04, 0.14, 0.02, 'porcelain', { color: 0xd8d4cc });
    hbar(mb, 0, 0.15, zf + 0.02, 0.3, 'chrome');
    mb.box(0, 0.815, zf + 0.004, W - 0.02, 0.09, 0.008, 'metal_brushed', { color: 0xc8ccd0 });
  },
});

defObj({
  key: 'fridge', name: 'Refrigerator', height: 1.78, block: 'solid', movable: 80, power: true, hum: 'fridge',
  container: { capacity: 40, kind: 'fridge', loot: 'fridge_house', cooling: 'fridge' }, sound: 'metal', flammable: 0.1,
  disassemble: { tools: ['#screwdriver', '#wrench'], time: 40, skill: 'mechanics', yields: [['sheet_metal', 2, 4], ['scrap_metal', 2, 5], ['pipe', 1, 2], ['wire', 1, 2]] },
  tags: T('kitchen', 'fridge', 'appliance'),
  model: (mb) => {
    const W = 0.78, D = 0.72, zc = WZ + D / 2, zf = zc + D / 2, al = { color: 0xf2e8d2 };
    mb.box(0, 0.08, zc - 0.02, W, 1.7, D - 0.04, 'plastic_white', al);
    mb.box(0, 0, zc, W - 0.04, 0.08, D - 0.06, 'metal_dark');
    mb.box(0, 0.015, zf - 0.03, W - 0.08, 0.05, 0.012, 'p_vent');
    mb.box(0, 1.27, zf - 0.04, W, 0.5, 0.05, { south: 'p_fridge_freezer', all: 'plastic_white' }, { fit: { south: true }, ...al });
    mb.box(0, 0.08, zf - 0.04, W, 1.17, 0.05, { south: 'p_fridge_door', all: 'plastic_white' }, { fit: { south: true }, ...al });
    vbar(mb, W / 2 - 0.06, 1.38, zf + 0.01, 0.2, 'plastic_white', { color: 0xc8bea8 }, 0.04);
    vbar(mb, W / 2 - 0.06, 1.0, zf + 0.01, 0.34, 'plastic_white', { color: 0xc8bea8 }, 0.04);
    mb.box(0, 1.78, zc, W - 0.02, 0.012, D - 0.06, 'plastic_white', { color: 0xd8d0bc });
    // stuff on top: a cereal box and a forgotten basket
    mb.box(-0.18, 1.79, zc - 0.05, 0.2, 0.28, 0.07, { south: 'p_cereal', all: 'cardboard' }, { fit: { south: true } });
    mb.cylinder(0.15, 1.79, zc, 0.13, 0.1, 8, 'p_wicker', { rTop: 0.15 });
  },
});

defObj({
  key: 'microwave', name: 'Microwave', height: 0.3, block: 'none', movable: 12, power: true, heat: 'microwave',
  container: { capacity: 4, kind: 'oven', heating: true }, sound: 'metal', flammable: 0.1, hum: 'machine',
  disassemble: { tools: ['#screwdriver'], time: 12, skill: 'electrical', yields: [['electronics_scrap', 1, 3], ['sheet_metal', 1, 1], ['wire', 1, 1]] },
  tags: T('kitchen', 'office', 'microwave', 'appliance', 'surface_item'),
  variant: (s) => (on(s) ? 'on' : 'off'),
  model: (mb, s) => {
    mb.box(0, 0.015, -0.02, 0.5, 0.27, 0.36, 'plastic_white', { color: 0xd8d4cc });
    mb.box(0, 0.015, 0.165, 0.5, 0.27, 0.012, { south: 'p_microwave', all: 'plastic_black' }, { fit: { south: true }, emissive: on(s) ? 0.25 : 0 });
    for (const sx of [-0.21, 0.21]) for (const sz of [-0.15, 0.12]) mb.box(sx, 0, sz, 0.04, 0.015, 0.04, 'rubber_black');
    mb.box(0.1, 0.07, 0.175, 0.012, 0.15, 0.012, 'chrome');
    mb.box(-0.05, 0.285, -0.02, 0.3, 0.003, 0.2, 'p_perf', { color: 0xc8c8c8 });
  },
});

defObj({
  key: 'kitchen_cabinet_wall', name: 'Wall Cabinet', height: 2.15, block: 'none', onWall: true, movable: 20,
  container: { capacity: 15, kind: 'cabinet', loot: 'kitchen_cabinet' }, sound: 'wood', flammable: 0.6,
  disassemble: { tools: ['#hammer'], time: 15, skill: 'carpentry', yields: [['plank', 1, 3], ['nails', 2, 5]] },
  tags: T('kitchen', 'cabinet', 'wall'),
  model: (mb) => {
    const W = 1.0, D = 0.33, y0 = 1.42, H = 0.7, zc = WZ + D / 2, zf = zc + D / 2;
    mb.box(0, y0, zc, W, H, D, 'p_oak', { color: 0xe8e0d8 });
    mb.box(0, y0 + H, zc + 0.01, W + 0.02, 0.04, D + 0.02, 'p_oak', { color: 0xd8ccc0 });
    for (const i of [0, 1]) {
      const cx = -W / 4 + i * W / 2;
      mb.box(cx, y0 + 0.02, zf + 0.01, W / 2 - 0.03, H - 0.04, 0.02, { south: 'p_oak_door', all: 'p_oak' }, { fit: { south: true } });
      knob(mb, cx + (i === 0 ? W / 4 - 0.06 : -W / 4 + 0.06), y0 + 0.08, zf + 0.02, 0.03, 'metal_brass');
    }
    mb.box(0, y0 - 0.012, zc + 0.04, W - 0.1, 0.012, 0.06, 'plastic_white', { color: 0xf0ecd8, emissive: 0.15 });
  },
});

defObj({
  key: 'table_round', name: 'Round Table', height: 0.8, block: 'table', surface: 0.78, movable: 25,
  sound: 'wood', flammable: 0.7,
  disassemble: { tools: ['#hammer', '#saw'], time: 15, skill: 'carpentry', yields: [['plank', 2, 3], ['nails', 2, 4], ['rag', 0, 2]] },
  tags: T('kitchen', 'home', 'table'),
  model: (mb) => {
    mb.box(0, 0, 0, 0.5, 0.04, 0.08, 'wood_dark');
    mb.box(0, 0, 0, 0.08, 0.04, 0.5, 'wood_dark');
    mb.cylinder(0, 0.04, 0, 0.06, 0.62, 8, 'wood_dark', { rTop: 0.045 });
    mb.cylinder(0, 0.62, 0, 0.12, 0.08, 8, 'wood_dark');
    mb.cylinder(0, 0.7, 0, 0.47, 0.04, 14, 'wood_dark');
    mb.cylinder(0, 0.66, 0, 0.49, 0.12, 14, { sides: 'p_gingham', top: 'p_gingham', bottom: 'p_gingham' }, { color: 0xffffff });
    // a vase with one flower, salt & pepper
    mb.cylinder(0.05, 0.78, -0.08, 0.035, 0.12, 6, 'glass', { rTop: 0.02, color: 0xc0e0d8 });
    mb.box(0.05, 0.88, -0.08, 0.006, 0.12, 0.006, 'wood_light', { color: 0x5a9a4a });
    mb.sphere(0.05, 1.0, -0.08, 0.025, 5, 3, 'white', { color: 0xf0d040 });
    mb.cylinder(-0.12, 0.78, 0.05, 0.016, 0.06, 6, 'porcelain');
    mb.cylinder(-0.08, 0.78, 0.07, 0.016, 0.06, 6, 'porcelain', { color: 0x606060 });
  },
});

function turnedLeg(mb: ModelBuilder, x: number, z: number, h: number) {
  mb.cylinder(x, 0, z, 0.022, 0.06, 6, 'wood_dark', { rTop: 0.03 });
  mb.cylinder(x, 0.06, z, 0.03, h * 0.45, 6, 'wood_dark', { rTop: 0.022 });
  mb.cylinder(x, 0.06 + h * 0.45, z, 0.035, 0.05, 6, 'wood_dark');
  mb.cylinder(x, 0.11 + h * 0.45, z, 0.025, h - 0.11 - h * 0.45, 6, 'wood_dark', { rTop: 0.03 });
}

defObj({
  key: 'table_dining', name: 'Dining Table', w: 2, d: 1, height: 0.86, block: 'table', surface: 0.76, movable: 45,
  sound: 'wood', flammable: 0.7,
  disassemble: { tools: ['#hammer', '#saw'], time: 25, skill: 'carpentry', yields: [['plank', 3, 5], ['nails', 3, 6]] },
  tags: T('kitchen', 'home', 'table'),
  model: (mb) => {
    const top = 0.76;
    for (const sx of [-0.8, 0.8]) for (const sz of [-0.36, 0.36]) turnedLeg(mb, sx, sz, top - 0.03);
    mb.box(0, top - 0.12, -0.36, 1.56, 0.09, 0.025, 'wood_dark');
    mb.box(0, top - 0.12, 0.36, 1.56, 0.09, 0.025, 'wood_dark');
    mb.box(-0.8, top - 0.12, 0, 0.025, 0.09, 0.68, 'wood_dark');
    mb.box(0.8, top - 0.12, 0, 0.025, 0.09, 0.68, 'wood_dark');
    mb.box(0, top - 0.035, 0, 1.86, 0.035, 0.92, 'wood_dark', { color: 0xd8c8b8 });
    mb.box(0, top, 0, 0.35, 0.004, 0.86, 'p_lace');
    // fruit bowl (one apple has gone grey)
    mb.cylinder(0, top + 0.004, 0, 0.12, 0.06, 8, 'porcelain', { rTop: 0.16, color: 0xd8e4ec });
    for (const [x, z, c] of [[-0.05, 0.02, 0xc83a2a], [0.05, -0.03, 0xe0b030], [0.0, 0.06, 0x8ab040], [0.04, 0.05, 0x9a9a98]] as const) mb.sphere(x, top + 0.09, z, 0.04, 6, 3, 'white', { color: c });
    mb.cylinder(-0.55, top, 0.15, 0.04, 0.02, 6, 'metal_brass');
    mb.cylinder(-0.55, top + 0.02, 0.15, 0.012, 0.16, 6, 'paper', { color: 0xf0e8d0 });
  },
});

defObj({
  key: 'chair_wood', name: 'Wooden Chair', height: 0.95, block: 'low', sit: true, movable: 6,
  sound: 'wood', flammable: 0.8,
  disassemble: { tools: ['#hammer'], time: 8, skill: 'carpentry', yields: [['plank', 1, 2], ['nails', 1, 3]] },
  tags: T('kitchen', 'home', 'school', 'chair', 'sit'),
  model: (mb) => {
    const t = 'wood_light';
    rlegs4(mb, 0.4, 0.38, 0.44, 0.018, t, { rTop: 0.014 }, 0, 0.02);
    mb.box(0, 0.12, 0.02, 0.36, 0.02, 0.02, t); mb.box(-0.18, 0.18, 0.02, 0.02, 0.02, 0.34, t); mb.box(0.18, 0.18, 0.02, 0.02, 0.02, 0.34, t);
    mb.box(0, 0.44, 0.02, 0.43, 0.035, 0.42, t, { color: 0xe8dcc8 });
    for (const sx of [-0.18, 0.18]) mb.box(sx, 0.475, -0.17, 0.035, 0.5, 0.035, t);
    for (const y of [0.62, 0.74]) mb.box(0, y, -0.17, 0.33, 0.02, 0.02, t);
    mb.box(0, 0.86, -0.17, 0.42, 0.09, 0.035, t);
    for (const x of [-0.08, 0, 0.08]) mb.box(x, 0.475, -0.17, 0.022, 0.39, 0.02, t);
  },
});

defObj({
  key: 'chair_plastic', name: 'Plastic Chair', height: 0.82, block: 'low', sit: true, movable: 3,
  sound: 'plastic', flammable: 0.6,
  disassemble: { tools: [], time: 4, yields: [['scrap_metal', 0, 0]] },
  tags: T('kitchen', 'home', 'outdoor', 'chair', 'sit'),
  model: (mb) => {
    const p = 'plastic_white', c = { color: 0xf2f0ea };
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      mb.push().translate(sx * 0.2, 0, sz * 0.19 + 0.02).rotateZ(sx * 0.12).rotateX(-sz * 0.12);
      mb.box(0, 0, 0, 0.05, 0.43, 0.05, p, c); mb.pop();
    }
    mb.box(0, 0.4, 0.02, 0.46, 0.04, 0.44, p, c);
    mb.box(0, 0.42, 0.235, 0.46, 0.03, 0.02, p, { color: 0xe0ded8 });
    for (const sx of [-1, 1]) mb.box(sx * 0.225, 0.44, 0.02, 0.02, 0.18, 0.36, p, c);
    for (const sx of [-1, 1]) mb.box(sx * 0.225, 0.6, 0.0, 0.03, 0.025, 0.4, p, c);
    mb.push().translate(0, 0.44, -0.2).rotateX(-0.2);
    mb.box(0, 0, 0, 0.44, 0.38, 0.03, p, c);
    for (const x of [-0.12, -0.04, 0.04, 0.12]) mb.box(x, 0.12, 0.016, 0.03, 0.16, 0.004, 'plastic_black', { color: 0x9a9890 });
    mb.pop();
  },
});

defObj({
  key: 'chair_folding', name: 'Folding Chair', height: 0.82, block: 'low', sit: true, movable: 4,
  sound: 'metal', flammable: 0.1,
  disassemble: { tools: ['#screwdriver'], time: 5, skill: 'mechanics', yields: [['scrap_metal', 1, 2], ['screws', 1, 2]] },
  tags: T('office', 'school', 'kitchen', 'chair', 'sit'),
  model: (mb) => {
    const m = 'metal_grey', c = { color: 0xc8bca8 };
    for (const sx of [-0.19, 0.19]) {
      mb.push().translate(sx, 0, 0.17).rotateX(0.18); mb.box(0, 0, 0, 0.025, 0.46, 0.025, m, c); mb.pop();
      mb.push().translate(sx, 0, -0.2).rotateX(-0.12); mb.box(0, 0, 0, 0.025, 0.84, 0.025, m, c); mb.pop();
      mb.box(sx, 0.005, 0.0, 0.025, 0.02, 0.36, m, c);
    }
    mb.box(0, 0.43, 0.02, 0.4, 0.035, 0.38, 'plastic_beige', { color: 0xd8ccb4 });
    mb.box(0, 0.6, -0.27, 0.38, 0.2, 0.03, 'plastic_beige', { color: 0xd8ccb4 });
    mb.box(0, 0.12, 0.0, 0.36, 0.02, 0.02, m, c);
  },
});

defObj({
  key: 'freezer_chest', name: 'Chest Freezer', w: 2, d: 1, height: 0.9, block: 'table', surface: 0.9, movable: 60, power: true, hum: 'fridge',
  container: { capacity: 50, kind: 'freezer', loot: 'freezer', cooling: 'freezer' }, sound: 'metal', flammable: 0.1,
  disassemble: { tools: ['#screwdriver', '#wrench'], time: 35, skill: 'mechanics', yields: [['sheet_metal', 2, 4], ['scrap_metal', 2, 4], ['pipe', 1, 2], ['wire', 1, 2]] },
  tags: T('kitchen', 'store', 'freezer', 'appliance'),
  model: (mb) => {
    const W = 1.5, D = 0.72, zc = WZ + D / 2 + 0.02, zf = zc + D / 2, w = { color: 0xf0eee6 };
    mb.box(0, 0.05, zc, W, 0.75, D, 'plastic_white', w);
    mb.box(0, 0, zc, W - 0.06, 0.05, D - 0.06, 'metal_dark');
    mb.box(0, 0.8, zc - 0.005, W + 0.01, 0.09, D + 0.02, 'plastic_white', { color: 0xe4e2da });
    mb.box(0, 0.795, zc, W + 0.012, 0.012, D + 0.012, 'rubber_black');
    mb.box(0, 0.79, zf + 0.025, 0.36, 0.04, 0.03, 'plastic_white', { color: 0xc8c4b8 });
    mb.box(0.55, 0.74, zf + 0.004, 0.08, 0.06, 0.01, 'chrome');
    mb.box(-0.52, 0.66, zf + 0.004, 0.2, 0.06, 0.008, 'p_freezer_badge', { fit: true });
    mb.box(0.62, 0.66, zf + 0.004, 0.025, 0.015, 0.008, 'led_green', { emissive: 1 });
    mb.box(-0.4, 0.1, zf + 0.004, 0.5, 0.1, 0.008, 'p_vent', { color: 0xc8c8c8 });
  },
});

defObj({
  key: 'toaster', name: 'Toaster', height: 0.24, block: 'none', movable: 2, power: true,
  sound: 'metal', flammable: 0.1,
  disassemble: { tools: ['#screwdriver'], time: 5, skill: 'electrical', yields: [['wire', 1, 1], ['scrap_metal', 1, 1]] },
  tags: T('kitchen', 'appliance', 'surface_item'),
  model: (mb) => {
    mb.box(0, 0, 0, 0.27, 0.012, 0.16, 'plastic_black');
    mb.box(0, 0.012, 0, 0.24, 0.17, 0.15, 'chrome');
    for (const sx of [-0.13, 0.13]) mb.box(sx, 0.012, 0, 0.025, 0.17, 0.16, 'plastic_black');
    for (const sz of [-0.035, 0.035]) mb.box(0, 0.181, sz, 0.17, 0.003, 0.025, 'plastic_black');
    mb.box(0.15, 0.1, 0.0, 0.03, 0.018, 0.04, 'plastic_black');
    mb.cylinderX(-0.145, 0.05, 0.04, 0.015, 0.012, 6, 'plastic_black');
    // a slice of toast still waiting
    mb.box(0.03, 0.12, 0.035, 0.1, 0.11, 0.012, 'p_toast', { fit: true });
  },
});

addTextureModule(() => {
  const A = atlas();
  A.add('p_cereal', 7, 9, (pc) => {
    pc.wrap = false;
    pc.fill(0xe8c030);
    pc.rect(0, 0, 7, 2, 0xc83030); pc.hline(1, 5, 0, 0xf8e8e0);
    pc.circle(3.5, 5.5, 2, 0xf8f4ea); pc.set(3, 5, 0xc89048); pc.set(4, 6, 0xd8a050);
    pc.hline(0, 6, 8, 0x8a6a10);
  });
});

void scaleHex; void border; void legs4;
