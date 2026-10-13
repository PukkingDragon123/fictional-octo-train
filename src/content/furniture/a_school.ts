// Furniture A — school: classroom, cafeteria, gym, library.
import { defObj } from '../../world/objects';
import {
  atlas, addTextureModule, makeRamp, mixHex, scaleHex, ph, tileFbm, WZ,
  txt, txtC, scribble, fillR, legs4, caster, hbar, frontGrid, bookRow, papers, mug, flipH,
} from './a_lib';
import type { ModelBuilder } from './a_lib';

const T = (...t: string[]) => ['setA', ...t];
const WZ2 = WZ - 0.5;

// ============================================================ textures
addTextureModule(() => {
  const A = atlas();
  A.add('p_chalkboard', 58, 30, (pc, rng) => {
    pc.wrap = false;
    const G = makeRamp(0x2e4a3a, 5, { spread: 0.3 });
    fillR(pc, 0, 0, 58, 30, G, (x, y) => 0.45 + (tileFbm(x, y, 64, 64, 5, 2, 3) - 0.5) * 0.3, 1);
    // eraser swirls
    for (let k = 0; k < 6; k++) {
      const cx = rng.int(5, 52), cy = rng.int(4, 24);
      for (let a = 0; a < 40; a++) { const r = 2 + (a % 10) * 0.5; pc.blend(cx + Math.cos(a * 0.6) * r * 1.6, cy + Math.sin(a * 0.6) * r * 0.6, 0x8aa094, 0.18); }
    }
    const chalk = 0xe8ece4, faint = 0x9ab4a4;
    txt(pc, 'OCT 13', 2, 2, chalk);
    txt(pc, '3X4=12', 36, 2, faint);
    pc.hline(2, 24, 8, mixHex(chalk, G[2], 0.4));
    txt(pc, 'DO NOT LEAVE', 3, 11, chalk);
    txt(pc, 'DO NOT LEAVE', 3, 17, chalk);
    txt(pc, 'DO NOT LEA', 3, 23, mixHex(chalk, G[2], 0.35));
    // a little house drawing in the corner, chalk dust along the bottom
    pc.line(50, 18, 53, 15, 0xf0d8e0); pc.line(53, 15, 56, 18, 0xf0d8e0); pc.strokeRect(50, 18, 7, 5, 0xf0d8e0); pc.set(53, 21, 0xf0e070);
    for (let x = 0; x < 58; x++) if (ph(x, 29, 3) < 0.5) pc.blend(x, 29, 0xc8d4cc, 0.5);
  });
  A.add('p_locker', 10, 58, (pc) => {
    pc.wrap = false;
    const R = makeRamp(0x8a9cb8, 6, { spread: 0.4 });
    fillR(pc, 0, 0, 10, 58, R, (x, y) => 0.55 + (ph(x, y, 4) - 0.5) * 0.06 - x * 0.01, 1);
    pc.vline(0, 0, 57, R[5]); pc.hline(0, 9, 0, R[5]); pc.vline(9, 0, 57, R[1]); pc.hline(0, 9, 57, R[0]);
    for (const y0 of [3, 50]) for (let k = 0; k < 3; k++) { pc.hline(2, 7, y0 + k * 2, 0x1e2228); pc.hline(2, 7, y0 + k * 2 + 1, R[4]); }
    pc.rect(3, 12, 4, 3, 0xd8d8d0); pc.set(4, 13, 0x3a3a3a); pc.set(5, 13, 0x3a3a3a); // number plate
    pc.rect(6, 26, 2, 6, R[1]); pc.vline(7, 26, 31, R[4]); pc.set(6, 28, 0x2a2a2a); // lift latch + lock hole
    pc.set(3, 36, R[1]); pc.set(4, 37, R[2]); pc.set(2, 40, R[4]); // dent + scratch
  });
  A.add('p_locker_sticker', 3, 3, (pc) => {
    pc.wrap = false; pc.fill(0xf0d040); pc.set(0, 0, 0xd8b830); pc.set(2, 0, 0xd8b830); pc.set(0, 1, 0x3a2a10); pc.set(2, 1, 0x3a2a10); pc.set(1, 2, 0x3a2a10);
  });
  A.add('p_school_desktop', 19, 14, (pc) => {
    pc.wrap = false;
    const R = makeRamp(0xc8a070, 5, { spread: 0.3 });
    fillR(pc, 0, 0, 19, 14, R, (x, y) => 0.55 + Math.sin(y * 1.7 + Math.sin(x * 0.3) * 2) * 0.1 + (ph(x, y, 3) - 0.5) * 0.06, 1);
    pc.hline(1, 17, 1, R[1]); pc.hline(1, 17, 2, R[3]); // pencil groove
    txt(pc, 'JM', 3, 6, R[1]); pc.set(10, 7, 0xd04040); pc.set(11, 7, 0xd04040); pc.set(10, 8, 0xd04040);
    pc.line(13, 9, 17, 12, 0x3a3a8a);
    scribble(pc, 12, 5, 5, 1, R[1], 4);
    pc.hline(0, 18, 0, R[4]); pc.hline(0, 18, 13, R[0]);
  });
  A.add('p_globe', 24, 12, (pc) => {
    pc.wrap = false;
    const O = makeRamp(0x3a7ab8, 4, { spread: 0.3 });
    fillR(pc, 0, 0, 24, 12, O, (x, y) => 0.55 + (ph(x, y, 7) - 0.5) * 0.1, 1);
    // continents that never existed
    for (let y = 0; y < 12; y++) for (let x = 0; x < 24; x++) {
      const n = tileFbm(x, y * 2, 24, 24, 3, 3, 41);
      if (n > 0.56 && y > 0 && y < 11) pc.set(x, y, n > 0.66 ? 0xc8b078 : n > 0.6 ? 0x8ab468 : 0x6a9a58);
    }
    pc.hline(0, 23, 0, 0xf0f4f8); pc.hline(0, 23, 11, 0xf0f4f8);
    for (let x = 0; x < 24; x += 2) pc.blend(x, 6, 0xffffff, 0.3);
    flipH(pc);
  });
  A.add('p_backboard', 30, 18, (pc) => {
    pc.wrap = false;
    pc.fill(0xeceee8);
    pc.strokeRect(0, 0, 30, 18, 0xd04a2a); pc.strokeRect(1, 1, 28, 16, 0xd04a2a);
    pc.strokeRect(10, 7, 10, 8, 0xd04a2a);
    for (let i = 0; i < 18; i++) pc.blend(4 + i, 16 - i * 0.8, 0xffffff, 0.4);
    pc.set(25, 4, 0x8a8a7a); pc.set(6, 12, 0x9a9a8a); // ball smudges
  });
  A.add('p_net', 8, 8, (pc) => {
    pc.fill(0x6a6a6a);
    pc.each((x, y) => { if ((x + y) % 4 === 0 || (x - y + 8) % 4 === 0) pc.set(x, y, 0xf0f0f0); });
  });
  A.add('p_lunch_tray', 12, 9, (pc) => {
    pc.wrap = false;
    pc.fill(0xd88a3a); pc.strokeRect(0, 0, 12, 9, 0xb06a2a);
    pc.rect(1, 1, 6, 7, 0xc87a32); pc.rect(8, 1, 3, 3, 0xc87a32); pc.rect(8, 5, 3, 3, 0xc87a32);
    pc.rect(2, 2, 4, 3, 0xe8d8a0); pc.set(3, 3, 0xd8a050); // half a sandwich
    pc.rect(8, 5, 3, 3, 0x7ab050); pc.set(9, 2, 0xc04040);
  });
  A.add('p_milk', 4, 6, (pc) => {
    pc.wrap = false;
    pc.fill(0xf4f4f0); pc.rect(0, 0, 4, 2, 0x3a6ab0); pc.set(1, 3, 0x3a6ab0); pc.set(2, 4, 0x8a8a90);
  });
  A.add('p_shelf_label', 12, 3, (pc) => {
    pc.wrap = false; pc.fill(0xf0ece0); pc.hline(1, 10, 1, 0x3a3a50); pc.set(0, 0, 0xd0c8b0);
  });
  A.add('p_books_lib', 32, 10, (pc) => bookRow(pc, 0, 0, 32, 10, 404, { gaps: 0.05, palette: [0x9a3a2a, 0x2a4a7a, 0x3a6a3a, 0xc8a050, 0x5a3a6a, 0x8a8a8a, 0x2a2a2a, 0xd8c8a0, 0x4a7a8a] }));
  A.add('p_teacher_mug', 6, 4, (pc) => { pc.wrap = false; pc.fill(0xf0ece4); txt(pc, '#1', 0, 0, 0xc03030); });
});

// ============================================================ models
defObj({
  key: 'desk_school', name: 'School Desk', height: 0.86, block: 'low', sit: true, surface: 0.74, movable: 14,
  container: { capacity: 6, kind: 'desk', loot: 'school_desk' }, sound: 'metal', flammable: 0.3,
  disassemble: { tools: ['#screwdriver'], time: 10, skill: 'mechanics', yields: [['scrap_metal', 1, 3], ['screws', 2, 4], ['plank', 0, 1]] },
  tags: T('school', 'desk', 'sit', 'chair'),
  model: (mb) => {
    const m = 'metal_grey', mc = { color: 0x9aa4b0 };
    // floor runners + uprights
    for (const sx of [-0.2, 0.2]) {
      mb.box(sx, 0, -0.02, 0.03, 0.03, 0.8, m, mc);
      mb.box(sx, 0.03, -0.3, 0.03, 0.4, 0.03, m, mc);
      mb.box(sx, 0.03, 0.26, 0.03, 0.68, 0.03, m, mc);
    }
    mb.box(0, 0.4, -0.3, 0.44, 0.03, 0.03, m, mc);
    // seat + backrest
    mb.box(0, 0.42, -0.2, 0.42, 0.03, 0.38, 'wood_light', { color: 0xe0c8a0 });
    mb.box(0, 0.45, -0.39, 0.03, 0.3, 0.03, m, mc);
    mb.box(0, 0.62, -0.4, 0.4, 0.2, 0.03, 'wood_light', { color: 0xe0c8a0 });
    // wire book basket under the seat
    mb.box(0, 0.2, -0.2, 0.36, 0.14, 0.3, { top: 'p_mesh', all: 'p_mesh' });
    mb.box(0.05, 0.22, -0.18, 0.22, 0.04, 0.17, 'p_books_a');
    // desk top in front
    mb.box(0.03, 0.71, 0.22, 0.6, 0.03, 0.44, { top: 'p_school_desktop', all: 'wood_light' }, { fit: { top: true }, color: 0xffffff });
    mb.box(0.2, 0.62, 0.0, 0.03, 0.03, 0.5, m, mc);
    mb.box(0.12, 0.742, 0.12, 0.15, 0.006, 0.012, 'plastic_yellow');
  },
});

defObj({
  key: 'teacher_desk', name: "Teacher's Desk", w: 2, d: 1, height: 0.86, block: 'table', surface: 0.75, movable: 55,
  container: { capacity: 20, kind: 'desk', loot: 'teacher_desk' }, sound: 'metal', flammable: 0.3,
  disassemble: { tools: ['#screwdriver', '#hammer'], time: 25, skill: 'mechanics', yields: [['sheet_metal', 1, 3], ['scrap_metal', 1, 3], ['screws', 3, 6]] },
  tags: T('school', 'desk', 'table'),
  model: (mb) => {
    const top = 0.75, D = 0.76, zc = -0.04, zf = zc + D / 2 - 0.03, st = { color: 0xc8c0b0 };
    mb.box(0, top - 0.035, zc, 1.62, 0.035, D, { top: 'wood_light', all: 'wood_dark' });
    mb.boxMinMax(0.32, 0.03, zc - D / 2 + 0.03, 0.78, top - 0.035, zf, 'p_steel', st);
    const cells = frontGrid(mb, 0.34, 0.76, 0.06, top - 0.06, zf, [1], [1, 1, 1.8], 'p_steel_drawer', { ...st, fit: { south: true } });
    for (const c of cells) hbar(mb, 0.55, c.y1 - 0.06, zf + 0.02, 0.12, 'metal_brushed');
    mb.box(-0.77, 0.03, zc, 0.04, top - 0.065, D - 0.06, 'p_steel', st);
    mb.boxMinMax(-0.75, 0.2, zc - D / 2 + 0.04, 0.32, top - 0.035, zc - D / 2 + 0.06, 'p_steel', { color: 0xa8a090 });
    // apple, papers, gradebook, mug
    mb.sphere(-0.62, top + 0.045, zc + 0.15, 0.045, 7, 4, 'white', { color: 0xc8302a });
    mb.box(-0.62, top + 0.088, zc + 0.15, 0.006, 0.02, 0.006, 'wood_dark');
    papers(mb, -0.3, top, zc + 0.05, 4, 23);
    mb.box(0.62, top, zc - 0.18, 0.24, 0.04, 0.3, 'fabric_red', { color: 0x8a3a2a });
    mb.cylinder(0.72, top, zc + 0.18, 0.04, 0.09, 7, { sides: 'p_teacher_mug', top: 'p_coffee_top', bottom: 'porcelain' }, { fit: true });
    mb.cylinder(-0.75, top, zc - 0.25, 0.04, 0.02, 6, 'metal_brushed');
    mb.sphere(-0.75, top + 0.02, zc - 0.25, 0.03, 6, 3, 'chrome', { sy: 0.8 });
  },
});

defObj({
  key: 'chalkboard', name: 'Chalkboard', w: 2, d: 1, height: 1.95, block: 'none', onWall: true, movable: 0,
  sound: 'wood', flammable: 0.4, tags: T('school', 'board', 'wall'),
  disassemble: { tools: ['#hammer'], time: 15, skill: 'carpentry', yields: [['plank', 1, 3], ['nails', 2, 4]] },
  model: (mb) => {
    const W = 1.84, H = 1.0, y0 = 0.88;
    mb.box(0, y0, WZ + 0.012, W, H, 0.02, { south: 'p_chalkboard', all: 'wood_trim' }, { fit: { south: true } });
    const fz = WZ + 0.02, t = 0.05;
    mb.box(0, y0 + H, fz, W + t * 2, t, 0.04, 'wood_trim');
    mb.box(-W / 2 - t / 2, y0, fz, t, H, 0.04, 'wood_trim');
    mb.box(W / 2 + t / 2, y0, fz, t, H, 0.04, 'wood_trim');
    mb.box(0, y0 - 0.04, WZ + 0.05, W + t * 2, 0.04, 0.1, 'wood_trim');
    mb.box(0, y0 - 0.005, WZ + 0.09, W + t * 2, 0.02, 0.02, 'wood_trim', { color: 0xc8b8a0 });
    for (const [x, c] of [[-0.5, 0xf4f4f0], [-0.42, 0xf4f4f0], [-0.3, 0xf0e070], [0.1, 0xf0b0c8]] as const) mb.box(x, y0, WZ + 0.06, 0.07, 0.014, 0.014, 'white', { color: c });
    mb.box(0.4, y0, WZ + 0.06, 0.14, 0.04, 0.05, 'wood_light');
    mb.box(0.4, y0, WZ + 0.06, 0.14, 0.012, 0.05, 'fabric_grey', { color: 0xe0e0e0 });
  },
});

defObj({
  key: 'locker', name: 'Lockers', height: 1.9, block: 'solid', blocksSight: false, movable: 0,
  container: { capacity: 15, kind: 'locker', loot: 'school_locker', lockable: true }, sound: 'metal', flammable: 0,
  disassemble: { tools: ['#screwdriver', '#wrench'], time: 25, skill: 'mechanics', yields: [['sheet_metal', 2, 4], ['scrap_metal', 1, 3], ['screws', 3, 6]] },
  tags: T('school', 'gym', 'locker'),
  model: (mb) => {
    const W = 1.0, D = 0.42, H = 1.86, zc = WZ + D / 2 + 0.005, zf = zc + D / 2, tint = { color: 0xffffff };
    mb.box(0, 0, zc + 0.01, W, 0.1, D - 0.02, 'metal_dark', { color: 0x4a5058 });
    mb.box(0, 0.1, zc, W, H - 0.1, D, 'p_steel', { color: 0x9aaac4 });
    mb.box(0, H, zc + 0.03, W, 0.04, D + 0.04, 'p_steel', { color: 0x8a9ab4 });
    for (let i = 0; i < 3; i++) {
      const x = -W / 2 + W / 6 + i * W / 3;
      if (i === 1) {
        // this one was left open a crack
        mb.push().translate(x - W / 6 + 0.01, 0.12, zf + 0.01).rotateY(-0.18);
        mb.box(W / 6 - 0.01, 0, 0, W / 3 - 0.02, H - 0.15, 0.015, { south: 'p_locker', all: 'p_steel' }, { fit: { south: true }, ...tint });
        mb.pop();
        mb.box(x, 0.12, zf - 0.005, W / 3 - 0.03, H - 0.15, 0.004, 'metal_dark', { color: 0x1a1a1e });
      } else {
        mb.box(x, 0.12, zf + 0.005, W / 3 - 0.012, H - 0.15, 0.015, { south: 'p_locker', all: 'p_steel' }, { fit: { south: true }, ...tint });
      }
    }
    mb.box(-0.27, 1.35, zf + 0.014, 0.06, 0.06, 0.004, 'p_locker_sticker', { fit: true });
    mb.box(0.36, 1.05, zf + 0.016, 0.04, 0.05, 0.02, 'metal_brushed');
  },
});

defObj({
  key: 'cafeteria_table', name: 'Cafeteria Table', w: 2, d: 2, height: 0.76, block: 'table', sit: true, surface: 0.74, movable: 0,
  sound: 'metal', flammable: 0.2,
  disassemble: { tools: ['#wrench', '#screwdriver'], time: 30, skill: 'mechanics', yields: [['scrap_metal', 3, 6], ['screws', 3, 8], ['sheet_metal', 1, 2]] },
  tags: T('school', 'cafeteria', 'table', 'sit'),
  model: (mb) => {
    const top = { color: 0xb8c8d8 }, m = 'chrome';
    mb.box(0, 0.7, 0, 1.9, 0.04, 0.76, { top: 'p_formica', all: 'metal_dark' }, top);
    mb.box(0, 0.69, 0, 1.92, 0.015, 0.78, 'metal_brushed');
    for (const sz of [-1, 1]) {
      mb.box(0, 0.41, sz * 0.7, 1.9, 0.035, 0.3, { top: 'p_formica', all: 'metal_dark' }, top);
      for (const sx of [-0.7, 0.7]) mb.box(sx, 0.3, sz * 0.52, 0.04, 0.03, 0.36, m);
    }
    // folding undercarriage
    for (const sx of [-0.7, 0.7]) {
      mb.box(sx, 0.05, 0, 0.05, 0.64, 0.05, m);
      for (const sz of [-1, 1]) { mb.push().translate(sx, 0.05, sz * 0.12).rotateX(sz * 0.62); mb.box(0, 0, 0, 0.035, 0.5, 0.035, m); mb.pop(); }
      mb.box(sx, 0.0, 0, 0.06, 0.04, 1.4, m);
    }
    for (const sx of [-0.92, 0.92]) for (const sz of [-0.62, 0.62]) caster(mb, sx, sz, 0.03);
    // somebody's lunch, abandoned
    mb.box(-0.35, 0.74, 0.15, 0.38, 0.02, 0.28, { top: 'p_lunch_tray', all: 'plastic_red' }, { fit: { top: true }, color: 0xffd8b0 });
    mb.box(-0.05, 0.74, 0.12, 0.06, 0.1, 0.06, { sides: 'p_milk', top: 'paper' }, { fit: true });
    mb.box(0.5, 0.74, -0.2, 0.38, 0.02, 0.28, { top: 'p_lunch_tray', all: 'plastic_red' }, { fit: { top: true }, color: 0xb8d8ff });
  },
});

defObj({
  key: 'gym_bleachers', name: 'Bleachers', w: 3, d: 2, height: 1.75, block: 'solid', movable: 0, sit: true,
  sound: 'wood', flammable: 0.6,
  disassemble: { tools: ['#saw', '#wrench'], time: 60, skill: 'carpentry', yields: [['plank', 6, 10], ['scrap_metal', 3, 6], ['nails', 4, 10]] },
  tags: T('school', 'gym', 'sit'),
  model: (mb) => {
    const L = 2.92, m = 'metal_grey', mc = { color: 0x9aa0a8 };
    const tiers = [{ z: 0.55, y: 0.42 }, { z: 0.0, y: 0.82 }, { z: -0.55, y: 1.22 }];
    tiers.forEach((t, i) => {
      mb.box(0, t.y, t.z - 0.05, L, 0.05, 0.32, 'wood_light', { color: 0xf0d8a8 });
      mb.box(0, t.y - 0.33, t.z + 0.22, L, 0.04, 0.24, 'wood_light', { color: 0xd8c090 });
      mb.box(0, t.y - 0.29, t.z + 0.335, L, 0.29, 0.02, 'metal_dark', { color: 0x5a5a60 });
      for (const sx of [-1.35, 0, 1.35]) mb.box(sx, 0, t.z, 0.05, t.y, 0.05, m, mc);
      void i;
    });
    for (const sx of [-1.35, 0, 1.35]) {
      mb.push().translate(sx, 0.05, 0.0).rotateX(0.62); mb.box(0, 0, 0, 0.04, 1.35, 0.04, m, mc); mb.pop();
      mb.box(sx, 0, 0, 0.06, 0.03, 1.8, m, mc);
    }
    mb.box(0, 1.27, -0.9, L, 0.4, 0.04, 'metal_dark', { color: 0x4a5058 });
    for (const sx of [-1.4, 1.4]) mb.box(sx, 1.27, -0.9, 0.04, 0.48, 0.04, m, mc);
    mb.box(0, 1.73, -0.9, L, 0.035, 0.04, m, mc);
    // a lost water bottle and a jacket
    mb.cylinder(0.6, 0.86, 0.02, 0.035, 0.2, 6, 'plastic_blue', { color: 0xa0d0f0 });
    mb.push().translate(-0.8, 1.27, -0.6).rotateY(0.3); mb.box(0, 0, 0, 0.45, 0.04, 0.3, 'fabric_red', { color: 0xd04040 }); mb.pop();
  },
});

defObj({
  key: 'basketball_hoop', name: 'Basketball Hoop', height: 2.7, block: 'solid', tall: true, movable: 0,
  sound: 'metal', flammable: 0.1,
  disassemble: { tools: ['#wrench'], time: 30, skill: 'mechanics', yields: [['pipe', 2, 3], ['scrap_metal', 2, 4], ['sheet_metal', 1, 2]] },
  tags: T('school', 'gym', 'sport'),
  model: (mb) => {
    const m = 'metal_grey', mc = { color: 0x5a6a8a };
    mb.box(0, 0, -0.28, 0.95, 0.22, 0.4, 'plastic_black', { color: 0x4a5a7a });
    mb.box(0, 0.22, -0.28, 0.9, 0.02, 0.36, 'plastic_black', { color: 0x3a4a6a });
    mb.push().translate(0, 0.22, -0.32).rotateX(0.12);
    mb.box(0, 0, 0, 0.1, 2.0, 0.1, m, mc); mb.pop();
    mb.box(0, 2.0, -0.05, 0.08, 0.08, 0.36, m, mc);
    mb.box(0, 1.98, 0.14, 1.2, 0.72, 0.04, { south: 'p_backboard', all: 'plastic_white' }, { fit: { south: true } });
    mb.box(0, 2.24, 0.17, 0.12, 0.08, 0.04, 'metal_dark');
    // rim + net
    mb.push().translate(0, 2.25, 0.36);
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; mb.push().rotateY(a); mb.box(0, 0, 0.17, 0.11, 0.018, 0.018, 'plastic_red', { color: 0xf06a30 }); mb.pop(); }
    mb.pop();
    mb.cylinder(0, 1.98, 0.36, 0.11, 0.27, 8, { sides: 'p_net', top: 'p_net', bottom: 'p_net' }, { rTop: 0.17, caps: false });
    mb.sphere(0.3, 0.12, 0.3, 0.12, 8, 5, 'white', { color: 0xd8702a });
  },
});

defObj({
  key: 'library_shelf', name: 'Library Shelf', w: 2, d: 1, height: 1.95, block: 'solid', blocksSight: true, movable: 0,
  container: { capacity: 40, kind: 'shelf', loot: 'bookshelf' }, sound: 'wood', flammable: 0.8,
  disassemble: { tools: ['#hammer', '#saw'], time: 35, skill: 'carpentry', yields: [['plank', 4, 7], ['nails', 4, 9]] },
  tags: T('school', 'library', 'shelf', 'books'),
  model: (mb) => {
    const W = 1.9, D = 0.5, H = 1.92, sh = { color: 0xd8d0c0 };
    for (const sx of [-1, 1]) mb.box(sx * (W / 2 - 0.02), 0, 0, 0.04, H, D, 'wood_light', { color: 0xc8a880 });
    mb.box(0, H, 0, W + 0.04, 0.03, D + 0.04, 'wood_light', { color: 0xb89870 });
    mb.box(0, 0, 0, W - 0.08, 0.1, D - 0.02, 'metal_dark', { color: 0x6a6460 });
    mb.box(0, 0.1, 0, W - 0.08, H - 0.12, 0.02, 'metal_grey', sh);
    const ys = [0.1, 0.46, 0.82, 1.18, 1.54];
    ys.forEach((y, i) => {
      if (i > 0) mb.box(0, y - 0.02, 0, W - 0.08, 0.02, D - 0.02, 'metal_grey', sh);
      for (const side of [-1, 1]) {
        const w = i === 2 && side > 0 ? W * 0.55 : W - 0.1;
        const x = i === 2 && side > 0 ? -W / 2 + 0.05 + w / 2 : 0;
        mb.box(x, y, side * 0.13, w, 10 / 32, 0.2, { south: 'p_books_lib', north: 'p_books_lib', top: 'p_book_tops', all: 'paper' }, { uvOffset: [i * 0.31 + side, -y] });
      }
      if (i === 2) { mb.push().translate(0.55, y, 0.13).rotateZ(-0.4); mb.box(0.04, 0, 0, 0.04, 0.28, 0.2, 'wood_dark', { color: 0x2a4a6a }); mb.pop(); }
    });
    for (const sx of [-1, 1]) mb.box(sx * (W / 2 + 0.002), 1.5, 0, 0.004, 0.08, 0.3, 'p_shelf_label', { fit: true });
  },
});

defObj({
  key: 'globe', name: 'Globe', height: 0.45, block: 'none', movable: 2,
  sound: 'plastic', flammable: 0.4,
  tags: T('school', 'office', 'decor', 'surface_item'),
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.09, 0.03, 8, 'wood_dark');
    mb.cylinder(0, 0.03, 0, 0.015, 0.1, 6, 'metal_brass');
    mb.push().translate(0, 0.27, 0).rotateZ(0.41);
    mb.sphere(0, 0, 0, 0.14, 10, 7, 'p_globe', { fit: true });
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI / 2 + i / 8 * Math.PI;
      mb.push().rotateZ(a); mb.box(0.16, -0.016, 0, 0.012, 0.035, 0.012, 'metal_brass'); mb.pop();
    }
    mb.pop();
  },
});

void scaleHex; void txtC; void legs4; void mug; void ph; void scribble;
void ((_: ModelBuilder) => 0);
