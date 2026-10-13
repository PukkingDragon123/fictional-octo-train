// Furniture A — mall: atrium set pieces, food court, kiosks & amusements.
import { defObj } from '../../world/objects';
import {
  atlas, addTextureModule, PixelCanvas, makeRamp, mixHex, scaleHex, ph, tileFbm, WZ,
  txt, txtC, scribble, fillR, border, crtGlass, caster, leafCard, flipH,
} from './a_lib';
import type { ModelBuilder } from './a_lib';

const T = (...t: string[]) => ['setA', ...t];
const on = (s: any) => !(s.on === false || s.broken || s.unpowered);

// ============================================================ textures
addTextureModule(() => {
  const A = atlas();
  A.add('p_tile_counter', 16, 16, (pc) => {
    pc.each((x, y) => {
      const t = ((x >> 3) + (y >> 3)) % 2;
      const g = x % 8 === 7 || y % 8 === 7;
      pc.set(x, y, g ? 0xc8c0b8 : t ? 0xa8dcc8 : 0xf4c8d0);
      if (!g && (x % 8 === 0 || y % 8 === 0)) pc.set(x, y, mixHex(t ? 0xa8dcc8 : 0xf4c8d0, 0xffffff, 0.4));
    });
  });
  A.add('p_menu_board', 84, 20, (pc) => {
    pc.wrap = false;
    fillR(pc, 0, 0, 84, 20, [0x1e2a3a, 0x24344a, 0x2a3c54], (x, y) => 0.5 + (ph(x, y, 3) - 0.5) * 0.2, 1);
    border(pc, 0xf0c040);
    const items: [string, string, number][] = [['BURGER', '2.99', 0xc87a3a], ['FRIES', '0.99', 0xf0c040], ['SODA', '0.79', 0xd04040], ['PIZZA', '1.49', 0xe0a050]];
    items.forEach(([name, price, c], i) => {
      const x0 = 3 + i * 20;
      pc.rect(x0, 3, 6, 5, c); pc.rect(x0 + 1, 4, 4, 1, mixHex(c, 0xffffff, 0.4));
      txt(pc, name, x0, 10, 0xf4f0e8); txt(pc, price, x0, 14, 0xf0c040);
    });
    pc.set(80, 2, 0xffffff);
  });
  A.add('p_food_trays', 40, 10, (pc) => {
    pc.wrap = false;
    pc.fill(0xb8bcc0);
    const foods = [0xf0e8c8, 0xf0c840, 0x5a9a3a, 0x8a4a2a, 0xf0b040];
    foods.forEach((c, i) => {
      const x0 = 1 + i * 8;
      pc.rect(x0, 1, 7, 8, 0x8a8e92);
      for (let y = 2; y < 8; y++) for (let x = x0 + 1; x < x0 + 6; x++) pc.set(x, y, ph(x, y, i) < 0.3 ? mixHex(c, 0xffffff, 0.3) : ph(x, y, i + 9) < 0.2 ? scaleHex(c, 0.75) : c);
    });
  });
  A.add('p_kiosk_sign', 30, 7, (pc) => {
    pc.wrap = false;
    pc.fill(0xf4b8c8); border(pc, 0xffffff);
    txtC(pc, 'GIFTS', 15, 1, 0x6a4a9a);
    pc.set(3, 3, 0xf8e070); pc.set(26, 3, 0xf8e070); pc.set(2, 2, 0xfff8c0); pc.set(27, 4, 0xfff8c0);
  });
  A.add('p_awning', 16, 8, (pc) => {
    pc.each((x, y) => pc.set(x, y, ((x >> 2) % 2) ? 0xfaf4ec : 0x9ad8d0));
    for (let x = 0; x < 16; x++) { pc.set(x, 7, (x % 4 < 2) ? 0x7ab8b0 : 0xd8d0c8); }
  });
  A.add('p_jewelry', 24, 12, (pc) => {
    pc.wrap = false;
    pc.fill(0x2a1a3a);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) {
      const x = 2 + c * 4, y = 2 + r * 4, gold = ph(c, r, 3) < 0.5;
      pc.circle(x + 0.5, y + 0.5, 1.1, gold ? 0xe0b840 : 0xd8dce0); pc.set(x, y, 0x2a1a3a); pc.set(x + 1, y - 1, 0xffffff);
    }
    for (let i = 0; i < 12; i++) pc.blend(i * 2, 11 - i, 0xffffff, 0.2);
  });
  A.add('p_carousel_center', 16, 32, (pc) => {
    fillR(pc, 0, 0, 16, 32, [0x7a8a9a, 0x9aacbc, 0xc0d0dc, 0xe0ecf4], (x, y) => 0.5 + (x - y * 0.4 + 32) % 8 / 16 - 0.2, 1);
    for (let y = 0; y < 32; y++) { pc.set(0, y, 0xd8b048); pc.set(15, y, 0xa88028); }
    for (let x = 0; x < 16; x++) { pc.set(x, 0, 0xe8c058); pc.set(x, 31, 0xa88028); }
    for (let y = 4; y < 32; y += 9) { pc.set(7, y, 0xfff0a0); pc.set(8, y, 0xfff0a0); }
  });
  A.add('p_canopy', 32, 16, (pc) => {
    // 16 stripes: one per canopy segment (texture is fitted once around the cone)
    const cols = [0xf4a8c4, 0xfaf2e8, 0x9ad8cc, 0xfaf2e8, 0xc4b0f0, 0xfaf2e8, 0xf8dc90, 0xfaf2e8];
    pc.each((x, y) => {
      const c = cols[(x >> 1) % cols.length];
      pc.set(x, y, y >= 14 ? scaleHex(c, 0.82) : y <= 1 ? mixHex(c, 0xffffff, 0.3) : c);
    });
  });
  A.add('p_valance', 8, 8, (pc) => {
    pc.wrap = false;
    pc.fill(0xfaf2e8);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const d = Math.hypot((x + 0.5 - 4) / 4, (y + 0.5 - 2) / 6);
      if (y >= 2 && d <= 1) pc.set(x, y, d > 0.8 ? 0xe090b0 : 0xf4a8c4);
      else if (y >= 5) pc.set(x, y, 0x7a6470);
    }
    pc.hline(0, 7, 0, 0xe8c070); pc.hline(0, 7, 1, 0xf8e0a0);
  });
  A.add('p_carousel_base', 16, 8, (pc) => {
    pc.fill(0xe8a8c0);
    pc.hline(0, 15, 0, 0xf8d8e4); pc.hline(0, 15, 7, 0xb87890);
    for (let x = 2; x < 16; x += 4) { pc.set(x, 3, 0xfff6c0); pc.set(x, 4, 0xf0d070); pc.set(x + 1, 3, 0xfffff0); }
    for (let x = 0; x < 16; x++) if (x % 4 === 0) pc.vline(x, 1, 6, 0xd890a8);
  });
  A.add('p_arcade_side', 26, 56, (pc) => {
    pc.wrap = false;
    fillR(pc, 0, 0, 26, 56, [0x140a2a, 0x2a1450, 0x48207a, 0x6a2a9a], (x, y) => 0.15 + y / 56 * 0.7 + (ph(x, y, 3) - 0.5) * 0.08, 1);
    for (let i = 0; i < 30; i++) pc.set(Math.floor(ph(i, 1, 3) * 26), Math.floor(ph(i, 2, 3) * 40), i % 4 ? 0xe8e0ff : 0xfff0a0);
    pc.circle(16, 14, 6, 0xf08ac0); pc.circle(15, 13, 5, 0xf8a8d0); pc.hline(8, 24, 15, 0xc8f0ff); pc.hline(9, 23, 16, 0x8ad0f0);
    for (let y = 30; y < 56; y++) { const x = Math.round(4 + (y - 30) * 0.7); pc.set(x, y, 0x40f0f0); pc.set(x + 1, y, 0x40f0f0); pc.set(x + 3, y, 0xf040a0); pc.set(x + 4, y, 0xf040a0); }
    txt(pc, 'VOID', 3, 46, 0xf8f040);
  });
  A.add('p_arcade_marquee', 22, 6, (pc) => {
    pc.wrap = false;
    pc.fill(0x100820);
    for (let i = 0; i < 10; i++) pc.set(Math.floor(ph(i, 3, 1) * 22), Math.floor(ph(i, 4, 1) * 6), 0x8a7ab0);
    txtC(pc, 'VOID', 11, 0, 0xf050c0);
    for (let x = 4; x < 19; x++) if (pc.get(x, 0) === 0xf050c0) pc.set(x, 0, 0xffa0e0);
  });
  A.add('p_arcade_screen', 14, 11, (pc) => {
    pc.wrap = false;
    pc.fill(0x05040e);
    for (let i = 0; i < 12; i++) pc.set(Math.floor(ph(i, 9, 2) * 14), Math.floor(ph(i, 8, 2) * 11), 0x5a5a8a);
    for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) { const x = 2 + c * 3, y = 2 + r * 2; pc.set(x, y, r ? 0x40f070 : 0xf04080); pc.set(x + 1, y, r ? 0x40f070 : 0xf04080); }
    pc.set(7, 6, 0xf0f040); pc.set(7, 7, 0xf0f040);
    pc.set(6, 9, 0x40c0f0); pc.set(7, 8, 0x40c0f0); pc.set(8, 9, 0x40c0f0); pc.set(7, 9, 0xe0f0ff);
    pc.set(1, 0, 0xffffff); pc.set(2, 0, 0xffffff); pc.set(11, 0, 0xf0d040); pc.set(12, 0, 0xf0d040);
    crtGlass(pc, 0, 0, 14, 11, 0x020208, 0.5);
  });
  A.add('p_coin_door', 8, 9, (pc) => {
    pc.wrap = false;
    pc.fill(0x2a2a2e); border(pc, 0x5a5a60);
    for (const x of [2, 5]) { pc.rect(x, 2, 1, 3, 0xf04040); pc.set(x, 6, 0xd8d8d8); }
    pc.set(3, 7, 0x8a8a8a);
  });
  A.add('p_photo_strips', 6, 20, (pc) => {
    pc.wrap = false;
    pc.fill(0xf4f4f0);
    for (let i = 0; i < 4; i++) {
      const y = 1 + i * 5;
      pc.rect(1, y, 4, 4, 0x8a8a90); pc.rect(2, y + 1, 2, 2, 0xc8a890);
      if (i === 3) { pc.rect(2, y + 1, 2, 2, 0x8a8a90); pc.set(3, y + 1, 0x1a1a1a); } // the last frame came out empty, almost
      else if (i === 2) pc.set(2, y + 1, 0xa88a78);
    }
  });
  A.add('p_booth_sign', 24, 6, (pc) => {
    pc.wrap = false; pc.fill(0x2a0e1a); txtC(pc, 'PHOTOS', 12, 0, 0xffd860); pc.hline(1, 22, 5, 0xf06aa0);
  });
  A.add('p_booth_curtain', 16, 32, (pc) => {
    const R = makeRamp(0xa82a3a, 5, { spread: 0.4 });
    pc.fillRamp(R, (x, y) => 0.5 + Math.sin(x / 16 * Math.PI * 4) * 0.35 + (ph(x, y, 4) - 0.5) * 0.05, 0.6);
  });
  A.add('p_booth_side', 28, 60, (pc) => {
    pc.wrap = false;
    fillR(pc, 0, 0, 28, 60, [0xd8c0e8, 0xe8d0f0, 0xf4e4f8], (x, y) => 0.55 + Math.sin((x + y) * 0.3) * 0.1, 1);
    for (let i = 0; i < 14; i++) { const x = Math.floor(ph(i, 1, 5) * 26) + 1, y = Math.floor(ph(i, 2, 5) * 50) + 4; pc.set(x, y, 0xfff8c0); pc.set(x - 1, y, 0xf8e080); pc.set(x + 1, y, 0xf8e080); pc.set(x, y - 1, 0xf8e080); pc.set(x, y + 1, 0xf8e080); }
    txtC(pc, '4 POSES', 14, 26, 0x7a4a9a); txtC(pc, '$1', 14, 33, 0xd04080);
    border(pc, 0xb898d0);
  });
  A.add('p_escalator_steps', 16, 8, (pc) => {
    pc.each((x, y) => pc.set(x, y, x % 2 ? 0x5a5e62 : 0x8a8e92));
    pc.hline(0, 15, 7, 0xe0c030); pc.hline(0, 15, 6, 0x6a6e72);
  });
  A.add('p_comb_plate', 32, 12, (pc) => {
    pc.wrap = false;
    pc.each((x, y) => pc.set(x, y, (x + y) % 4 === 0 ? 0xa8acb0 : 0x8a8e92));
    for (let x = 0; x < 32; x += 2) { pc.set(x, 0, 0xe0c030); pc.set(x, 1, 0xd0b028); }
    txtC(pc, 'CAUTION', 16, 5, 0xe0c030);
  });
  A.add('p_closed_sign', 14, 6, (pc) => {
    pc.wrap = false; pc.fill(0xf0d020); border(pc, 0x1a1a1a); txtC(pc, 'CLOSED', 7, 1, 0x1a1a1a);
  });
  A.add('p_payphone', 7, 15, (pc) => {
    pc.wrap = false;
    const S = makeRamp(0xa8acb0, 4, { spread: 0.3 });
    pc.fill(S[2]); border(pc, S[1]);
    pc.rect(1, 1, 5, 2, 0x3a5aa8); pc.hline(2, 4, 1, 0xf0f0f0);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) pc.set(1 + c * 2, 5 + r * 2, 0xe8e8e4);
    pc.set(5, 1, 0x1a1a1a);
    pc.rect(1, 13, 5, 1, 0x1a1a1a);
    pc.vline(5, 4, 6, 0x1a1a1a);
  });
  A.add('p_phone_sign', 12, 5, (pc) => {
    pc.wrap = false; pc.fill(0x2a5ab8); txtC(pc, 'PHONE', 6, 0, 0xf4f4f8);
  });
  A.add('p_gumballs', 16, 12, (pc) => {
    pc.wrap = false;
    pc.fill(0xd8e8f0);
    const cols = [0xe03a3a, 0xf0d040, 0x3a8ae0, 0x5ac05a, 0xf08a30, 0xf0f0f0, 0xd060c0];
    for (let y = 3; y < 12; y++) for (let x = 0; x < 16; x++) if ((x + y * 2) % 2 === 0 || ph(x, y, 2) < 0.4) pc.set(x, y, cols[Math.floor(ph(x, y, 7) * cols.length)]);
    for (let x = 0; x < 16; x++) pc.blend(x, 2, 0xffffff, 0.4);
    pc.vline(3, 1, 8, 0xffffff);
  });
  A.add('p_coin_box', 6, 7, (pc) => {
    pc.wrap = false; pc.fill(0xf0c830); border(pc, 0xb89020); txt(pc, '25', 0, 1, 0xd02020); pc.set(5, 1, 0xd02020); pc.rect(2, 5, 2, 1, 0x1a1a1a);
  });
  A.add('p_rocket', 16, 16, (pc) => {
    pc.fill(0xa8e0d0);
    for (let y = 0; y < 16; y += 8) pc.hline(0, 15, y, 0x7ab8a8);
    for (let x = 0; x < 16; x += 8) pc.vline(x, 0, 15, 0x7ab8a8);
    for (let y = 2; y < 16; y += 4) for (let x = 2; x < 16; x += 4) pc.set(x, y, 0xd8f4ec);
  });
  A.add('p_porthole', 6, 6, (pc) => {
    pc.wrap = false; pc.fill(0xa8e0d0); pc.circle(3, 3, 2.8, 0xc8ccd0); pc.circle(3, 3, 2, 0x3a5a8a); pc.set(2, 2, 0xb8e0f8);
  });
  A.add('p_shrub', 24, 20, (pc, rng) => {
    const R = makeRamp(0x3e6e34, 6, { hueShift: 0.06, spread: 0.55 });
    for (let i = 0; i < 110; i++) {
      const a = rng.next() * Math.PI, rr = Math.sqrt(rng.next());
      const x = 12 + Math.cos(a) * rr * 11, y = 19 - Math.sin(a) * rr * 18;
      const lit = y < 9 || x > 14 ? 1 : 0;
      pc.set(x, y, R[1 + lit + (rng.chance(0.4) ? 1 : 0)]); pc.set(x + 1, y, R[2 + lit]);
      if (rng.chance(0.3)) pc.set(x, y - 1, R[3 + lit]);
    }
    for (let i = 0; i < 6; i++) pc.set(rng.int(4, 20), rng.int(4, 16), 0xf0e8f0);
  });
  A.add('p_planter_tile', 16, 16, (pc) => {
    pc.each((x, y) => {
      const g = x % 8 === 7 || y % 8 === 7;
      const c = ((x >> 3) + (y >> 3)) % 2 ? 0xd8c8a8 : 0xe4d6b8;
      pc.set(x, y, g ? 0x9a8e7a : (x % 8 === 0 || y % 8 === 0) ? mixHex(c, 0xffffff, 0.3) : c);
    });
  });
  A.add('p_plaque', 6, 2, (pc) => {
    pc.wrap = false; pc.fill(0xc8a050); pc.hline(1, 4, 0, 0x6a5020); pc.set(0, 1, 0xe8c870);
  });
  A.add('p_coin', 2, 2, (pc) => { pc.wrap = false; pc.fill(0xd8b040); pc.set(0, 0, 0xfff0a0); });
});

// ============================================================ models
defObj({
  key: 'kiosk', name: 'Mall Kiosk', w: 2, d: 2, height: 2.45, block: 'solid', movable: 0,
  container: { capacity: 30, kind: 'cabinet', loot: 'store_toys' }, sound: 'wood', flammable: 0.6,
  disassemble: { tools: ['#hammer', '#screwdriver'], time: 45, skill: 'carpentry', yields: [['plank', 3, 6], ['glass_shard', 1, 3], ['scrap_metal', 1, 3], ['nails', 3, 8]] },
  tags: T('mall', 'store'),
  model: (mb) => {
    const W = 1.5, D = 0.86;
    mb.box(0, 0, 0, W, 0.9, D, { all: 'p_tile_counter' });
    mb.box(0, 0.9, 0, W + 0.06, 0.04, D + 0.06, 'wood_light', { color: 0xf0e0d0 });
    mb.box(0, 0.94, 0, W - 0.1, 0.16, D - 0.1, 'glass', { color: 0xd8f0f4 });
    mb.box(0, 0.942, 0, W - 0.14, 0.004, D - 0.14, 'p_jewelry', { fit: true });
    mb.box(0, 1.1, 0, W - 0.08, 0.02, D - 0.08, 'metal_brushed');
    for (const sx of [-1, 1]) {
      mb.cylinderX(sx * (W / 2 + 0.02), 0.3, 0.2, 0.26, 0.05, 12, { sides: 'wood_dark', top: 'p_wheel', bottom: 'p_wheel' }, { fit: true, color: 0xffffff });
    }
    // canopy on four poles
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mb.cylinder(sx * 0.78, 0.0, sz * 0.48, 0.03, 2.25, 6, 'metal_brass');
    mb.box(0, 2.25, 0, 1.86, 0.06, 1.2, 'wood_light', { color: 0xfaf0e8 });
    mb.wedge(0, 2.31, 0.3, 1.86, 0.6, 0.14, 0.0, { top: 'p_awning', all: 'p_awning' });
    mb.wedge(0, 2.31, -0.3, 1.86, 0.6, 0.0, 0.14, { top: 'p_awning', all: 'p_awning' });
    for (const sz of [-1, 1]) mb.box(0, 2.08, sz * 0.61, 1.88, 0.17, 0.02, 'p_awning');
    for (const sx of [-1, 1]) mb.box(sx * 0.94, 2.08, 0, 0.02, 0.17, 1.22, 'p_awning');
    mb.box(0, 1.9, 0.62, 0.95, 0.22, 0.03, 'p_kiosk_sign', { fit: true });
    // sunglasses spinner
    mb.cylinder(0.55, 1.12, -0.2, 0.012, 0.5, 6, 'chrome');
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; mb.box(0.55 + Math.cos(a) * 0.07, 1.3 + (i % 3) * 0.1, -0.2 + Math.sin(a) * 0.07, 0.06, 0.025, 0.02, 'plastic_black', { color: [0xffffff, 0xf080a0, 0x80c0f0][i % 3] }); }
    mb.box(-0.4, 1.12, 0.0, 0.3, 0.2, 0.2, 'cardboard', { color: 0xf0d0e0 });
  },
});

defObj({
  key: 'bench', name: 'Bench', w: 2, d: 1, height: 0.85, block: 'low', sit: true, sleep: 0.25, movable: 0,
  sound: 'wood', flammable: 0.5,
  disassemble: { tools: ['#wrench', '#saw'], time: 20, skill: 'carpentry', yields: [['plank', 2, 4], ['scrap_metal', 1, 3], ['screws', 2, 5]] },
  tags: T('mall', 'outdoor', 'sit'),
  model: (mb) => {
    const L = 1.8, iron = { color: 0x3a3e44 };
    for (const sx of [-0.82, 0.82]) {
      mb.box(sx, 0, 0.12, 0.05, 0.44, 0.05, 'metal_dark', iron);
      mb.push().translate(sx, 0, -0.12).rotateX(-0.12); mb.box(0, 0, 0, 0.05, 0.85, 0.05, 'metal_dark', iron); mb.pop();
      mb.box(sx, 0.4, 0.0, 0.05, 0.04, 0.42, 'metal_dark', iron);
      mb.box(sx, 0.62, 0.05, 0.06, 0.04, 0.34, 'metal_dark', iron);
      mb.box(sx, 0.44, 0.2, 0.04, 0.18, 0.04, 'metal_dark', iron);
    }
    for (let i = 0; i < 4; i++) mb.box(0, 0.44, -0.12 + i * 0.1, L, 0.035, 0.075, 'wood_light', { color: 0xd8b888 });
    mb.push().translate(0, 0.52, -0.2).rotateX(-0.12);
    for (let i = 0; i < 3; i++) mb.box(0, i * 0.1, 0, L, 0.075, 0.03, 'wood_light', { color: 0xd8b888 });
    mb.box(0, 0.12, 0.017, 0.18, 0.06, 0.004, 'p_plaque', { fit: true });
    mb.pop();
  },
});

defObj({
  key: 'planter_box', name: 'Planter', w: 2, d: 1, height: 1.35, block: 'solid', foliage: true, movable: 0,
  sound: 'ceramic', flammable: 0.2,
  tags: T('mall', 'plant', 'decor'),
  model: (mb) => {
    const W = 1.9, D = 0.62;
    mb.box(0, 0, 0, W, 0.55, D, 'p_planter_tile');
    mb.box(0, 0.55, 0, W + 0.06, 0.05, D + 0.06, 'marble', { color: 0xe8e0d0 });
    mb.box(0, 0.58, 0, W - 0.08, 0.02, D - 0.08, 'p_soil');
    for (const [x, s, r] of [[-0.6, 0.85, 0.2], [0.05, 0.75, 0.9], [0.6, 0.9, 0.4]]) {
      mb.cross(x, 0.58, 0, s, s * 0.85, 'p_shrub', { rot: r, sway: 0.4 });
      mb.cross(x + 0.05, 0.58, 0.02, s * 0.8, s * 0.7, 'p_shrub', { rot: r + Math.PI / 4, sway: 0.4 });
    }
    mb.cross(-0.25, 0.58, 0, 0.5, 0.6, 'p_leaves_a', { sway: 0.3 });
    mb.cylinder(0.85, 0.6, 0.15, 0.035, 0.09, 6, 'paper', { color: 0xe8d0d8 });
  },
});

defObj({
  key: 'fountain', name: 'Fountain', w: 3, d: 3, height: 1.85, block: 'solid', movable: 0,
  water: { capacity: 500, tainted: true }, sound: 'ceramic', flammable: 0, hum: 'water',
  tags: T('mall', 'water', 'decor'),
  model: (mb) => {
    const R = 1.36, segs = 16, st = 'marble', sc = { color: 0xe8e4dc };
    for (let i = 0; i < segs; i++) {
      const a = (i + 0.5) / segs * Math.PI * 2;
      mb.push().translate(Math.cos(a) * R, 0, Math.sin(a) * R).rotateY(-a + Math.PI / 2);
      mb.box(0, 0, 0, 2 * Math.PI * R / segs + 0.04, 0.42, 0.14, st, sc);
      mb.box(0, 0.42, 0, 2 * Math.PI * R / segs + 0.06, 0.06, 0.22, st, { color: 0xf4f0ea });
      mb.pop();
    }
    mb.cylinder(0, 0.0, 0, R - 0.05, 0.36, segs, { top: 'water', sides: st, bottom: st }, { color: 0xc8e0e0 });
    // coins scattered on the bottom, glinting through the water
    for (let i = 0; i < 18; i++) {
      const a = ph(i, 1, 7) * Math.PI * 2, d = 0.45 + ph(i, 2, 7) * 0.75;
      mb.flat(Math.cos(a) * d, 0.363, Math.sin(a) * d, 0.035, 0.035, 'p_coin', { rot: a, color: i % 3 ? 0xffe8a0 : 0xd8dce0, emissive: 0.25 });
    }
    mb.cylinder(0, 0.36, 0, 0.24, 0.62, 10, st, sc);
    mb.cylinder(0, 0.94, 0, 0.22, 0.14, 12, st, { rTop: 0.72, color: 0xf0ece4 });
    mb.cylinder(0, 1.08, 0, 0.72, 0.05, 12, st, { color: 0xf4f0ea });
    mb.cylinder(0, 1.1, 0, 0.66, 0.035, 12, { top: 'water', sides: st, bottom: st });
    mb.cylinder(0, 1.13, 0, 0.09, 0.36, 8, st, sc);
    mb.cylinder(0, 1.45, 0, 0.08, 0.06, 10, st, { rTop: 0.28, color: 0xf0ece4 });
    mb.cylinder(0, 1.51, 0, 0.27, 0.025, 10, { top: 'water', sides: st, bottom: st });
    mb.sphere(0, 1.64, 0, 0.09, 8, 5, st, { color: 0xf8f4ee });
    mb.cylinder(0, 1.72, 0, 0.02, 0.1, 6, 'metal_brass');
    // water curtains spilling from the bowls
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2 + 0.2;
      mb.push().translate(Math.cos(a) * 0.74, 0.37, Math.sin(a) * 0.74).rotateY(-a + Math.PI / 2);
      mb.box(0, 0, 0, 0.1, 0.72, 0.015, 'water', { color: 0xd8f0f4, emissive: 0.25 }); mb.pop();
    }
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2;
      mb.push().translate(Math.cos(a) * 0.29, 1.13, Math.sin(a) * 0.29).rotateY(-a + Math.PI / 2);
      mb.box(0, 0, 0, 0.06, 0.38, 0.012, 'water', { color: 0xd8f0f4, emissive: 0.25 }); mb.pop();
    }
    // a paper cup bobbing in the basin
    mb.push().translate(0.85, 0.36, -0.6).rotateZ(1.4);
    mb.cylinder(0, 0, 0, 0.035, 0.1, 6, 'paper', { rTop: 0.045, color: 0xf0d8e0 }); mb.pop();
  },
});

function carouselHorse(mb: ModelBuilder, col: number, saddle: number) {
  const h = 'p_horse', c = { color: col };
  mb.box(0, 0, 0, 0.5, 0.18, 0.16, h, c);
  mb.push().translate(0.22, 0.12, 0).rotateZ(-0.6); mb.box(0, 0, 0, 0.12, 0.26, 0.12, h, c); mb.pop();
  mb.push().translate(0.34, 0.3, 0).rotateZ(0.45);
  mb.box(0, 0, 0, 0.2, 0.1, 0.1, h, c);
  mb.box(0.1, -0.01, 0, 0.06, 0.07, 0.085, h, { color: scaleHex(col, 0.9) });
  for (const sz of [-1, 1]) mb.box(0.04, 0.06, sz * 0.052, 0.02, 0.02, 0.004, 'plastic_black');
  mb.box(-0.02, 0.1, 0, 0.04, 0.05, 0.06, h, c);
  mb.pop();
  mb.push().translate(0.2, 0.24, 0).rotateZ(-0.6); mb.box(-0.04, 0, 0, 0.03, 0.22, 0.05, 'wood_dark', { color: 0xc8a050 }); mb.pop();
  mb.box(0.0, 0.18, 0, 0.18, 0.025, 0.2, 'plastic_red', { color: saddle });
  for (const sz of [-1, 1]) {
    mb.push().translate(0.18, 0.02, sz * 0.05).rotateZ(-1.0); mb.box(0, -0.22, 0, 0.04, 0.22, 0.04, h, c); mb.pop();
    mb.push().translate(-0.2, 0.02, sz * 0.05).rotateZ(0.35); mb.box(0, -0.26, 0, 0.04, 0.26, 0.04, h, c); mb.pop();
  }
  mb.push().translate(-0.25, 0.1, 0).rotateZ(0.7); mb.box(0, -0.18, 0, 0.04, 0.18, 0.05, 'wood_dark', { color: 0xe8d8a0 }); mb.pop();
}

defObj({
  key: 'carousel', name: 'Carousel', w: 4, d: 4, height: 2.7, block: 'solid', movable: 0, power: true, hum: 'carousel',
  light: { color: 0xffe2b8, intensity: 0.7, radius: 5.5, y: 2.0, kind: 'lamp', power: true },
  sound: 'wood', flammable: 0.5,
  tags: T('mall', 'decor', 'kids'),
  model: (mb) => {
    const R = 1.88;
    mb.cylinder(0, 0, 0, R + 0.06, 0.06, 20, 'metal_brushed', { color: 0xd8d0c8 });
    mb.cylinder(0, 0.06, 0, R, 0.2, 20, { sides: 'p_carousel_base', top: 'wood_light', bottom: 'wood_light' }, { color: 0xffffff });
    mb.cylinder(0, 0.261, 0, R - 0.04, 0.004, 20, 'wood_light', { color: 0xf0e0e8 });
    mb.cylinder(0, 0.26, 0, 0.42, 1.88, 8, 'p_carousel_center', { color: 0xffffff });
    // canopy: underside, striped cone, scalloped valance with bulbs, finial
    mb.cylinder(0, 2.1, 0, R + 0.05, 0.04, 20, 'wood_light', { color: 0xf8e8f0 });
    mb.cylinder(0, 2.14, 0, R + 0.05, 0.5, 16, 'p_canopy', { rTop: 0.3, caps: false, fit: true });
    mb.cylinder(0, 2.62, 0, 0.3, 0.05, 10, 'metal_brass');
    mb.sphere(0, 2.69, 0, 0.06, 6, 4, 'metal_brass');
    const vs = 28;
    for (let i = 0; i < vs; i++) {
      const a = (i + 0.5) / vs * Math.PI * 2;
      mb.push().translate(Math.cos(a) * (R + 0.06), 1.96, Math.sin(a) * (R + 0.06)).rotateY(-a + Math.PI / 2);
      mb.box(0, 0, 0, 2 * Math.PI * (R + 0.06) / vs - 0.02, 0.18, 0.025, 'p_valance', { fit: true });
      mb.box(0, -0.03, 0.016, 0.04, 0.04, 0.02, 'white', { color: i % 2 ? 0xfff2b0 : 0xffd8a0, emissive: 1.2 });
      mb.pop();
    }
    // poles + horses frozen mid-gallop
    const cols = [0xfaf4ee, 0xf8c8d8, 0xb8e4dc, 0xd8c8f0, 0xfaf4ee, 0xf8e4a8, 0xb8d8f4, 0xf8c8d8];
    const sad = [0xd84a6a, 0x6a8ad8, 0xe8a040, 0x5ab08a];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.2, pr = 1.35;
      const x = Math.cos(a) * pr, z = Math.sin(a) * pr;
      mb.cylinder(x, 0.26, z, 0.025, 1.84, 6, 'metal_brass');
      mb.push().translate(x, 0.82 + (i % 2) * 0.18, z).rotateY(-a - Math.PI / 2);
      carouselHorse(mb, cols[i], sad[i % 4]);
      mb.pop();
    }
    // inner ring of poles to the mirrors
    for (let i = 0; i < 8; i++) { const a = (i + 0.5) / 8 * Math.PI * 2; mb.cylinder(Math.cos(a) * 0.75, 0.26, Math.sin(a) * 0.75, 0.02, 1.84, 6, 'metal_brass'); }
  },
});

defObj({
  key: 'arcade_machine', name: 'Arcade Cabinet', height: 1.8, block: 'solid', movable: 90, power: true, hum: 'arcade',
  light: { color: 0xd8a8ff, intensity: 0.4, radius: 2.4, y: 1.3, kind: 'screen', power: true, flicker: 0.02 },
  sound: 'wood', flammable: 0.5,
  disassemble: { tools: ['#screwdriver'], time: 30, skill: 'electrical', yields: [['electronics_scrap', 3, 5], ['glass_shard', 1, 2], ['wire', 2, 3], ['plank', 1, 3]] },
  tags: T('mall', 'arcade', 'electronics'),
  variant: (s) => (on(s) ? 'on' : 'off'),
  model: (mb, s) => {
    const lit = on(s), W = 0.68, D = 0.78, zc = WZ + D / 2 + 0.01, zf = zc + D / 2;
    const sides = { east: 'p_arcade_side', west: 'p_arcade_side', all: 'plastic_black' };
    mb.box(0, 0, zc, W, 1.78, D, sides, { fit: { east: true, west: true }, color: 0xffffff });
    mb.box(0, 0.05, zf + 0.005, W - 0.06, 0.82, 0.01, 'plastic_black', { color: 0x4a3a6a });
    mb.box(0, 0.36, zf + 0.012, 0.24, 0.27, 0.01, 'p_coin_door', { fit: true, emissive: lit ? 0.5 : 0 });
    // control panel
    mb.wedge(0, 0.88, zf + 0.08, W - 0.02, 0.24, 0.12, 0.06, { top: 'plastic_black', all: 'plastic_black' }, { color: 0x6a5a8a });
    mb.cylinder(-0.15, 0.99, zf + 0.08, 0.012, 0.07, 6, 'chrome');
    mb.sphere(-0.15, 1.07, zf + 0.08, 0.028, 6, 4, 'plastic_red');
    for (let i = 0; i < 3; i++) mb.cylinder(0.02 + i * 0.075, 0.975 - i * 0.004, zf + 0.06 + i * 0.01, 0.022, 0.02, 8, 'plastic_red', { color: [0xffffff, 0x80a0ff, 0xffe060][i] });
    // screen (tilted back) + bezel + marquee
    mb.push().translate(0, 1.04, zf - 0.08).rotateX(-0.3);
    mb.box(0, 0, 0.0, W - 0.06, 0.46, 0.02, 'plastic_black');
    mb.box(0, 0.05, 0.012, 0.44, 0.36, 0.006, { south: lit ? 'p_arcade_screen' : 'p_crt_off', all: 'glass_dark' }, { fit: { south: true }, emissive: lit ? 0.9 : 0 });
    mb.pop();
    mb.box(0, 1.56, zf - 0.08, W - 0.04, 0.2, 0.04, { south: 'p_arcade_marquee', all: 'plastic_black' }, { fit: { south: true }, emissive: lit ? 0.9 : 0.05 });
    mb.box(0, 1.76, zf - 0.04, W, 0.03, 0.14, 'plastic_black');
  },
});

defObj({
  key: 'photo_booth', name: 'Photo Booth', height: 2.15, block: 'solid', blocksSight: true, movable: 0, power: true,
  light: { color: 0xffe0f0, intensity: 0.35, radius: 2.0, y: 1.9, kind: 'neon', power: true },
  sound: 'wood', flammable: 0.5,
  disassemble: { tools: ['#screwdriver'], time: 30, skill: 'electrical', yields: [['electronics_scrap', 1, 3], ['plank', 2, 4], ['rag', 1, 3], ['glass_shard', 0, 1]] },
  tags: T('mall', 'arcade'),
  variant: (s) => (on(s) ? 'on' : 'off'),
  model: (mb, s) => {
    const lit = on(s), W = 0.96, D = 0.9, zc = WZ + D / 2 + 0.01, zf = zc + D / 2;
    mb.box(0, 0, zc, W, 1.95, D, { east: 'p_booth_side', west: 'p_booth_side', all: 'plastic_white' }, { fit: { east: true, west: true }, color: 0xffffff });
    // entrance on the left: dark interior with a stool, curtain drawn halfway
    mb.box(-0.21, 0.02, zf - 0.005, 0.5, 1.75, 0.012, 'plastic_black', { color: 0x2a1a26 });
    mb.box(-0.21, 1.78, zf + 0.04, 0.54, 0.03, 0.03, 'chrome');
    for (let i = 0; i < 4; i++) mb.box(-0.42 + i * 0.075, 0.25, zf + 0.03 + (i % 2) * 0.02, 0.08, 1.53, 0.015, 'p_booth_curtain', { uvOffset: [i * 0.1, 0] });
    mb.box(-0.1, 0.0, zf - 0.1, 0.2, 0.45, 0.2, 'chrome');
    // right panel: sample strips, coin slot
    mb.box(0.27, 0.9, zf + 0.004, 0.16, 0.6, 0.006, 'p_photo_strips', { fit: true });
    mb.box(0.27, 0.65, zf + 0.008, 0.08, 0.12, 0.012, 'p_coin_door', { fit: true, emissive: lit ? 0.5 : 0 });
    mb.box(0.27, 0.3, zf + 0.02, 0.18, 0.06, 0.04, 'metal_brushed');
    // header sign
    mb.box(0, 1.95, zc + 0.15, W + 0.02, 0.2, D - 0.2, 'plastic_white', { color: 0xf0d8e8 });
    mb.box(0, 1.97, zf - 0.04, 0.8, 0.18, 0.008, 'p_booth_sign', { fit: true, emissive: lit ? 1.0 : 0.05 });
  },
});

defObj({
  key: 'escalator', name: 'Escalator', w: 2, d: 4, height: 2.3, block: 'solid', blocksSight: false, movable: 0,
  sound: 'metal', flammable: 0,
  disassemble: { tools: ['#wrench', '#screwdriver'], time: 120, skill: 'mechanics', yields: [['sheet_metal', 6, 10], ['scrap_metal', 6, 12], ['glass_shard', 2, 6]] },
  tags: T('mall', 'decor'),
  model: (mb) => {
    const W = 1.05, H = 2.0, zTop = -1.5, zBot = 1.45, run = zBot - zTop, n = 12;
    // truss body under the steps
    mb.wedge(0, 0, (zTop + zBot) / 2, W + 0.3, run, H - 0.12, 0.0, { top: 'metal_dark', all: 'metal_brushed' }, { color: 0xc8ccd0 });
    // top landing block
    mb.box(0, 0, -1.75, W + 0.3, H, 0.5, 'metal_brushed', { color: 0xc8ccd0 });
    mb.box(0, H, -1.72, W, 0.012, 0.52, { top: 'p_comb_plate', all: 'metal_grey' }, { fit: { top: true }, rotTop: false });
    // bottom landing comb plate
    mb.box(0, 0, 1.73, W + 0.3, 0.05, 0.54, 'metal_grey');
    mb.box(0, 0.05, 1.72, W, 0.008, 0.5, { top: 'p_comb_plate', all: 'metal_grey' }, { fit: { top: true } });
    // the stopped steps
    for (let i = 0; i < n; i++) {
      const t = i / n, z = zBot - t * run - run / n / 2, y = t * (H - 0.04);
      mb.box(0, y, z, W, (H - 0.04) / n + 0.03, run / n, { top: 'p_escalator_steps', all: 'metal_grey' }, { color: 0xffffff });
    }
    // balustrades: skirt, glass, handrail along the slope
    const slope = Math.atan2(H, run), L = Math.hypot(H, run);
    for (const sx of [-1, 1]) {
      const x = sx * (W / 2 + 0.08);
      mb.push().translate(x, H / 2 + 0.05, (zTop + zBot) / 2).rotateX(slope);
      mb.box(0, -0.12, 0, 0.12, 0.2, L, 'metal_brushed', { color: 0xb8bcc0 });
      mb.box(0, 0.08, 0, 0.03, 0.82, L, 'glass', { color: 0xc8e4e8 });
      mb.box(0, 0.9, 0, 0.09, 0.07, L + 0.05, 'rubber_black');
      mb.pop();
      mb.box(x, 0.05, 1.55, 0.12, 0.9, 0.5, 'metal_brushed', { color: 0xb8bcc0 });
      mb.cylinderX(x, 0.95, 1.8, 0.07, 0.09, 8, 'rubber_black');
      mb.box(x, 0.88, 1.55, 0.09, 0.07, 0.5, 'rubber_black');
      mb.box(x, H, -1.75, 0.12, 0.9, 0.5, 'metal_brushed', { color: 0xb8bcc0 });
      mb.box(x, H + 0.88, -1.75, 0.09, 0.07, 0.5, 'rubber_black');
    }
    // closed: a chain across the entrance with a sign
    mb.box(0, 0.78, 1.85, W + 0.1, 0.02, 0.02, 'metal_dark');
    mb.box(0, 0.62, 1.86, 0.36, 0.15, 0.01, 'p_closed_sign', { fit: true });
  },
});

defObj({
  key: 'food_court_counter', name: 'Food Court Counter', w: 3, d: 1, height: 2.25, block: 'solid', surface: 0.95, movable: 0, power: true,
  container: { capacity: 40, kind: 'counter', loot: 'cafeteria' }, sound: 'metal', flammable: 0.3,
  disassemble: { tools: ['#wrench', '#screwdriver'], time: 60, skill: 'mechanics', yields: [['sheet_metal', 3, 6], ['glass_shard', 2, 4], ['scrap_metal', 2, 4], ['wire', 1, 3]] },
  tags: T('mall', 'cafeteria', 'counter'),
  model: (mb) => {
    const W = 2.92, zc = 0.05;
    mb.box(0, 0, zc, W, 0.08, 0.7, 'metal_dark');
    mb.box(0, 0.08, zc, W, 0.84, 0.72, 'p_tile_counter');
    mb.box(0, 0.92, zc, W + 0.04, 0.04, 0.76, 'metal_brushed');
    mb.box(-0.35, 0.95, zc - 0.05, 1.6, 0.012, 0.4, { top: 'p_food_trays', all: 'metal_grey' }, { fit: { top: true } });
    // sneeze guard + heat lamps
    for (const sx of [-1.15, -0.35, 0.45]) mb.box(sx, 0.96, zc + 0.3, 0.025, 0.42, 0.025, 'chrome');
    mb.push().translate(-0.35, 1.36, zc + 0.24).rotateX(0.5);
    mb.box(0, 0, 0, 1.64, 0.012, 0.32, 'glass', { color: 0xd8eef2 }); mb.pop();
    for (const sx of [-0.9, -0.35, 0.2]) mb.box(sx, 1.3, zc - 0.05, 0.3, 0.05, 0.12, 'white', { color: 0xffa860, emissive: 0.9 });
    mb.box(-0.35, 1.35, zc - 0.05, 1.64, 0.03, 0.04, 'metal_brushed');
    // register + cup stack + straws
    mb.box(0.95, 0.96, zc, 0.36, 0.12, 0.3, 'plastic_beige', { color: 0xb8b4ac });
    mb.box(0.95, 1.08, zc - 0.08, 0.2, 0.14, 0.04, 'plastic_black');
    mb.cylinder(1.3, 0.96, zc + 0.15, 0.045, 0.3, 6, 'paper', { color: 0xf0d8e0 });
    mb.cylinder(1.3, 0.96, zc - 0.12, 0.04, 0.18, 6, 'glass', { color: 0xe8f0f0 });
    // menu board on posts
    for (const sx of [-1.3, 1.3]) mb.box(sx, 0.96, -0.4, 0.05, 1.28, 0.05, 'metal_dark');
    mb.box(0, 1.6, -0.4, 2.7, 0.66, 0.05, { south: 'p_menu_board', all: 'metal_dark' }, { fit: { south: true }, emissive: 0.45 });
  },
});

defObj({
  key: 'payphone', name: 'Payphone', height: 1.75, block: 'none', onWall: true, movable: 0,
  sound: 'metal', flammable: 0, tags: T('mall', 'phone', 'wall', 'electronics'),
  disassemble: { tools: ['#screwdriver', '#crowbar'], time: 20, skill: 'electrical', yields: [['electronics_scrap', 1, 3], ['scrap_metal', 1, 3], ['wire', 1, 2]] },
  model: (mb) => {
    const z = WZ + 0.07;
    mb.box(0, 1.6, WZ + 0.02, 0.36, 0.13, 0.04, 'p_phone_sign', { fit: true, emissive: 0.4 });
    mb.box(0, 1.02, z, 0.24, 0.5, 0.14, { south: 'p_payphone', all: 'metal_brushed' }, { fit: { south: true } });
    mb.box(0, 1.52, z + 0.01, 0.26, 0.03, 0.17, 'metal_brushed');
    mb.box(-0.15, 1.28, z + 0.03, 0.05, 0.06, 0.04, 'metal_dark');
    // the receiver left dangling off the hook
    mb.box(-0.15, 0.9, z + 0.05, 0.006, 0.38, 0.006, 'metal_dark');
    mb.push().translate(-0.15, 0.62, z + 0.06).rotateZ(0.15);
    mb.box(0, 0, 0, 0.045, 0.24, 0.05, 'plastic_black');
    mb.box(0, -0.02, 0.01, 0.06, 0.05, 0.065, 'plastic_black');
    mb.box(0, 0.22, 0.01, 0.06, 0.05, 0.065, 'plastic_black');
    mb.pop();
    mb.box(0, 0.94, WZ + 0.12, 0.34, 0.025, 0.22, 'metal_brushed');
    mb.box(0.06, 0.965, WZ + 0.12, 0.2, 0.05, 0.16, 'paper', { color: 0xe0d870 });
  },
});

defObj({
  key: 'gumball_machine', name: 'Gumball Machine', height: 1.32, block: 'low', movable: 20,
  container: { capacity: 3, kind: 'vending', loot: 'vending_snack', lockable: true }, sound: 'glass', flammable: 0.1,
  disassemble: { tools: ['#screwdriver'], time: 10, skill: 'mechanics', yields: [['scrap_metal', 1, 2], ['glass_shard', 1, 3]] },
  tags: T('mall', 'vending', 'kids'),
  model: (mb) => {
    const red = { color: 0xd83a3a };
    mb.cylinder(0, 0, 0, 0.2, 0.03, 10, 'plastic_red', red);
    mb.cylinder(0, 0.03, 0, 0.03, 0.62, 6, 'chrome');
    mb.cylinder(0, 0.65, 0, 0.12, 0.03, 8, 'chrome');
    mb.box(0, 0.68, 0, 0.24, 0.24, 0.24, 'plastic_red', red);
    mb.box(0, 0.74, 0.122, 0.13, 0.13, 0.012, 'chrome');
    mb.cylinderZ(0, 0.8, 0.14, 0.03, 0.03, 8, 'chrome');
    mb.box(0, 0.69, 0.125, 0.07, 0.04, 0.03, 'metal_dark');
    mb.box(0.075, 0.86, 0.123, 0.04, 0.03, 0.006, 'p_coin_box', { fit: true });
    mb.sphere(0, 1.08, 0, 0.17, 10, 7, 'p_gumballs', { fit: true, sy: 1.0 });
    mb.cylinder(0, 0.91, 0, 0.12, 0.03, 10, 'chrome');
    mb.cylinder(0, 1.22, 0, 0.08, 0.06, 10, 'plastic_red', red);
    mb.cylinder(0, 1.28, 0, 0.025, 0.04, 6, 'chrome');
  },
});

defObj({
  key: 'coin_ride', name: 'Kiddie Ride', height: 1.2, block: 'solid', movable: 0, power: true, hum: 'kiddie_ride', sit: true,
  sound: 'plastic', flammable: 0.4,
  disassemble: { tools: ['#wrench', '#screwdriver'], time: 35, skill: 'mechanics', yields: [['scrap_metal', 2, 4], ['electronics_scrap', 1, 2], ['spring', 1, 2], ['wire', 1, 2]] },
  tags: T('mall', 'kids', 'arcade'),
  model: (mb) => {
    mb.box(0, 0, 0, 0.94, 0.14, 0.94, 'plastic_blue', { color: 0x8ab8e8 });
    mb.box(0, 0.14, 0, 0.88, 0.012, 0.88, 'rubber_black');
    mb.box(0.36, 0.14, 0.36, 0.14, 0.38, 0.12, 'plastic_yellow', { color: 0xf0d050 });
    mb.box(0.36, 0.38, 0.421, 0.1, 0.12, 0.006, 'p_coin_box', { fit: true });
    mb.cylinder(0, 0.15, 0, 0.09, 0.22, 8, 'metal_dark');
    // the rocket, nose up
    mb.push().translate(0, 0.62, 0.0).rotateX(0.42);
    const hull = { color: 0xffffff };
    mb.push().rotateX(-Math.PI / 2);
    mb.cylinder(0, -0.38, 0, 0.21, 0.66, 10, 'p_rocket', hull);
    mb.cylinder(0, 0.28, 0, 0.21, 0.3, 10, 'plastic_red', { rTop: 0.0, color: 0xf8a0b8 });
    mb.cylinder(0, -0.46, 0, 0.12, 0.08, 8, 'metal_dark', { rTop: 0.16 });
    mb.pop();
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * Math.PI * 2 + Math.PI / 2;
      mb.push().translate(Math.cos(a) * 0.22, Math.sin(a) * 0.22, 0.28).rotateZ(a);
      mb.box(0.06, -0.015, 0, 0.14, 0.03, 0.2, 'plastic_red', { color: 0xf8a0b8 }); mb.pop();
    }
    mb.box(0, 0.17, -0.02, 0.24, 0.07, 0.3, 'rubber_black');
    mb.box(0, 0.2, -0.2, 0.22, 0.12, 0.02, 'glass', { color: 0xc8e8f8 });
    for (const sx of [-1, 1]) mb.box(sx * 0.207, 0.0, -0.12, 0.006, 0.09, 0.09, 'p_porthole', { fit: true });
    mb.pop();
  },
});

void mixHex; void tileFbm; void scribble; void caster; void leafCard; void flipH; void PixelCanvas;
