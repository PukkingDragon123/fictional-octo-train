// Zone props for the dreamcore regions (pools, fields, 14 Alder Lane): the
// dog house, the washing line, pump-hall valves, the pool drain, the pool
// rules sign, family photo frames, the birthday banner and a door keypad.
// Texture prefix: zg_
import { defObj, objDef } from '../../world/objects';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { makeRamp, scaleHex, mixHex, fillNoise, text, textC, woodFill, chips, scribble, rod, torus, discY, hashf, poly } from './b_common';

const T = ['zg', 'dream'];
const WZ = -0.44; // wall face (0.12 m walls) in model space at rot 0

addTextureModule(() => {
  const A = atlas();
  // red painted planks, chipped (kennel)
  A.add('zg_kennel_planks', 32, 32, (pc, rng) => {
    const R = makeRamp(0xa83a2c, 5, { spread: 0.32 });
    woodFill(pc, R, 811, 6, false, true);
    chips(pc, rng, 7, 0xd8c8a8, R[0]);
  });
  A.add('zg_kennel_sign', 30, 7, (pc) => {
    pc.wrap = false;
    pc.fill(0xf0e6c8); pc.strokeRect(0, 0, 30, 7, 0x6a4a2a);
    textC(pc, 'BISCUIT', 15, 1, 0x2a3a7a);
  });
  // laundry
  A.add('zg_sheet', 16, 16, (pc) => {
    pc.wrap = false;
    pc.fill(0xf4f2ea);
    for (let y = 0; y < 16; y++) pc.blend(0, y, 0xc8ccd8, 0.4);
    for (let x = 0; x < 16; x += 4) for (let y = 0; y < 16; y++) pc.blend(x, y, 0xd8dae4, 0.35);
    for (let x = 0; x < 16; x++) pc.set(x, 15, 0xc0c4d0);
  });
  A.add('zg_dress', 12, 14, (pc) => {
    pc.wrap = false;
    pc.fill(0xf2cf4a);
    for (let y = 0; y < 14; y++) for (let x = 0; x < 12; x++) if ((x + y) % 4 === 0) pc.set(x, y, 0xf8e08a);
    pc.hline(0, 11, 5, 0xffffff); pc.hline(0, 11, 13, 0xc8a030);
  });
  A.add('zg_shirt', 12, 12, (pc) => {
    pc.wrap = false;
    pc.fill(0x8ab4d8);
    for (let x = 0; x < 12; x += 3) for (let y = 0; y < 12; y++) pc.set(x, y, 0x6a94b8);
    pc.vline(6, 0, 11, 0xe8eef4);
  });
  // valve tags A/B/C
  for (const L of ['A', 'B', 'C']) A.add('zg_valve_' + L, 8, 8, (pc) => {
    pc.wrap = false;
    pc.fill(0xe8d040); pc.strokeRect(0, 0, 8, 8, 0x2a2a2a);
    text(pc, L, 3, 2, 0x1a1a1a);
  });
  // pool rules sign
  A.add('zg_pool_rules', 24, 30, (pc) => {
    pc.wrap = false;
    pc.fill(0xf6f6f0);
    pc.rect(0, 0, 24, 8, 0x2a5aa8);
    textC(pc, 'POOL', 12, 1, 0xffffff);
    pc.hline(1, 22, 7, 0x1a3a78);
    for (let i = 0; i < 6; i++) { text(pc, String(i + 1), 2, 9 + i * 3.4 | 0, 0x1a3a78); scribble(pc, 6, 11 + Math.floor(i * 3.4), 14 - (i === 5 ? 6 : 0), 0x3a3a48, 31 + i, 1); }
    pc.rect(1, 28, 22, 1, 0xc83030);
    pc.strokeRect(0, 0, 24, 30, 0x9aa4b0);
  });
  // keypad
  A.add('zg_keypad', 10, 14, (pc) => {
    pc.wrap = false;
    pc.fill(0x3a3e44); pc.strokeRect(0, 0, 10, 14, 0x1a1c20);
    pc.rect(2, 1, 6, 2, 0x1a3a2a); pc.set(3, 2, 0x6aff9a); pc.set(5, 2, 0x6aff9a);
    for (let j = 0; j < 4; j++) for (let i = 0; i < 3; i++) { pc.set(2 + i * 2 + (i > 0 ? 0 : 0), 5 + j * 2, 0xc8ccd0); }
    pc.set(8, 1, 0xff3a2a);
  });
  // family photos: tiny pixel snapshots
  const photo = (name: string, draw: (pc: import('../../gfx/pixel').PixelCanvas) => void) => A.add(name, 8, 10, (pc) => {
    pc.wrap = false; pc.fill(0xf4f0e4); draw(pc); pc.strokeRect(0, 0, 8, 10, 0xe8e0cc);
  });
  photo('zg_photo_field', (pc) => { pc.rect(1, 1, 6, 5, 0x8ec8f0); pc.rect(1, 6, 6, 3, 0x7ab85a); pc.set(3, 4, 0xe0b090); pc.set(3, 5, 0x3a4a8a); pc.set(5, 5, 0xe0b090); pc.set(5, 6, 0xf2cf4a); pc.set(6, 2, 0xffe070); });
  photo('zg_photo_dog', (pc) => { pc.rect(1, 1, 6, 8, 0x9ab878); pc.rect(2, 4, 4, 3, 0x8a5a30); pc.set(5, 3, 0x8a5a30); pc.set(6, 3, 0x2a1a10); pc.set(2, 7, 0x8a5a30); pc.set(5, 7, 0x8a5a30); });
  photo('zg_photo_house', (pc) => { pc.rect(1, 1, 6, 8, 0x9ad0f0); pc.rect(1, 7, 6, 2, 0x7ab85a); pc.rect(2, 4, 4, 3, 0xe8e0d0); poly(pc, [[1.5, 4], [4, 1.5], [6.5, 4]], 0x8a3a2a); pc.set(4, 6, 0xc8302a); });
  photo('zg_photo_pool', (pc) => { pc.rect(1, 1, 6, 8, 0xe8f0f0); pc.rect(1, 5, 6, 4, 0x4ab0d8); pc.set(3, 4, 0xe0b090); pc.set(3, 5, 0xf2cf4a); pc.hline(1, 6, 7, 0x8ad8f0); });
  photo('zg_photo_cake', (pc) => { pc.rect(1, 1, 6, 8, 0xd8b8a0); pc.rect(2, 5, 4, 3, 0xf8f0f0); pc.hline(2, 5, 5, 0xf08ab0); for (let i = 0; i < 4; i++) { pc.set(2 + i, 4, 0xf0e070); pc.set(2 + i, 3, 0xffa040); } });
  photo('zg_photo_blank', (pc) => { pc.rect(1, 1, 6, 8, 0xf8f6f0); pc.set(3, 4, 0xeae6dc); pc.set(4, 5, 0xeae6dc); });
  photo('zg_photo_dad', (pc) => { pc.rect(1, 1, 6, 8, 0xb8c0c8); pc.rect(3, 3, 2, 2, 0xd8b090); pc.rect(2, 5, 4, 4, 0x4a5a6a); pc.hline(3, 4, 3, 0x2a2a2a); pc.set(3, 4, 0x8a9aa8); pc.set(4, 4, 0x8a9aa8); });
  A.add('zg_banner', 76, 9, (pc) => {
    pc.wrap = false;
    pc.fill(0xf8f0e0);
    pc.hline(0, 75, 0, 0xf08ab0); pc.hline(0, 75, 8, 0xf08ab0);
    const cols = [0x3a8ad8, 0xe84a6a, 0x3aa85a, 0xe8a030, 0x8a5ad8];
    const s = 'HAPPY BIRTHDAY MIA';
    let x = 2;
    for (let i = 0; i < s.length; i++) { x = text(pc, s[i], x, 2, cols[i % cols.length]); }
  });
  A.add('zg_pennant', 8, 8, (pc) => {
    pc.wrap = false;
    pc.fill(0xe84a6a);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if ((x >> 1) % 2 === (y >> 1) % 2) pc.set(x, y, 0xf2cf4a);
  });
  // drain grate (big square, deep shadows below)
  A.add('zg_drain', 16, 16, (pc) => {
    pc.wrap = false;
    const R = makeRamp(0x8a9098, 4, { spread: 0.3 });
    pc.fill(0x0c1012);
    pc.strokeRect(0, 0, 16, 16, R[3]); pc.strokeRect(1, 1, 14, 14, R[1]);
    for (let x = 3; x < 14; x += 2) { pc.vline(x, 2, 13, R[2]); }
    pc.hline(2, 13, 7, R[3]); pc.hline(2, 13, 8, R[1]);
    for (let i = 0; i < 6; i++) pc.blend(2 + i * 2, 12, 0x6a5a3a, 0.5);
  });
  A.add('zg_nameplate', 16, 4, (pc) => {
    pc.wrap = false;
    pc.fill(0xb89a50); pc.strokeRect(0, 0, 16, 4, 0x6a5420);
    scribble(pc, 2, 1, 12, 0x3a2a10, 5, 1);
  });
  void scaleHex; void mixHex; void fillNoise; void hashf;
});

// ---------------------------------------------------------------- kennel
defObj({
  key: 'kennel', name: 'Dog House', w: 1, d: 1, height: 1.05, block: 'low',
  sound: 'wood', flammable: 0.6,
  desc: 'A red dog house with a hand-painted sign: BISCUIT. The blanket inside is still warm and smells of grass.',
  tags: [...T, 'outdoor', 'kennel', 'dog'],
  model: (mb) => {
    const P = 'zg_kennel_planks';
    const wy = 0.06, wh = 0.56;
    mb.box(0, 0, 0, 0.86, 0.06, 0.82, 'q_pallet_wood', { skip: ['bottom'] });
    mb.box(0, wy, 0, 0.7, wh - 0.02, 0.66, 'q_void', { skip: ['bottom'] });
    mb.box(0, wy, -0.37, 0.8, wh, 0.05, P);
    for (const s of [-1, 1]) mb.box(s * 0.38, wy, 0, 0.05, wh, 0.78, P);
    for (const s of [-1, 1]) mb.box(s * 0.255, wy, 0.37, 0.29, wh, 0.05, P);
    mb.box(0, wy + 0.42, 0.37, 0.24, wh - 0.42, 0.05, P);
    // gables front & back
    for (const zz of [-0.37, 0.37]) {
      mb.push(); mb.translate(0, wy + wh, zz); mb.rotateY(Math.PI / 2);
      mb.wedge(0, 0, -0.205, 0.05, 0.41, 0, 0.3, P);
      mb.wedge(0, 0, 0.205, 0.05, 0.41, 0.3, 0, P);
      mb.pop();
    }
    // roof panels
    for (const s of [-1, 1]) {
      mb.push(); mb.translate(s * 0.215, wy + wh + 0.17, 0); mb.rotateZ(-s * 0.62);
      mb.box(0, 0, 0, 0.56, 0.04, 0.94, { top: 'p_shingles', sides: 'wood_dark', bottom: 'wood_dark' });
      mb.pop();
    }
    mb.box(0, wy + wh + 0.05, 0.4, 0.27, 0.07, 0.01, 'zg_kennel_sign', { fit: true });
    // blanket peeking out, bowl, chain stake
    mb.box(0.02, wy, 0.2, 0.4, 0.04, 0.3, 'fabric_blue', { color: 0xc8d0e8 });
    mb.cylinder(0.32, 0, 0.43, 0.08, 0.05, 10, 'plastic_red', { rTop: 0.1 });
    discY(mb, 0.32, 0.045, 0.43, 0.075, 10, 'water', { color: 0xd8f0ff });
    mb.cylinder(-0.34, 0, 0.44, 0.015, 0.12, 5, 'metal_grey');
  },
});

// ---------------------------------------------------------------- washing line
defObj({
  key: 'washing_line', name: 'Washing Line', w: 3, d: 1, height: 2.0, block: 'none', tall: true,
  sound: 'fabric', flammable: 0.8,
  desc: 'Sheets, a man\'s shirt and a small yellow dress, pegged out to dry. They never get any drier.',
  tags: [...T, 'outdoor', 'laundry'],
  model: (mb) => {
    const X = 1.36, Y = 1.82;
    for (const s of [-1, 1]) {
      mb.cylinder(s * X, 0, 0, 0.035, Y + 0.08, 6, 'metal_grey');
      mb.box(s * X, Y, 0, 0.05, 0.04, 0.5, 'metal_grey');
      mb.cylinder(s * X, 0, 0, 0.08, 0.03, 6, 'concrete');
    }
    for (const z of [-0.2, 0.2]) mb.box(0, Y + 0.02, z, X * 2, 0.012, 0.012, 'plastic_white');
    const hang = (x: number, z: number, w: number, h: number, tex: string, o: Record<string, unknown> = {}) => {
      mb.box(x, Y + 0.02 - h, z, w, h, 0.012, tex, { fit: true, ...o });
      for (const px of [x - w / 2 + 0.05, x + w / 2 - 0.05]) mb.box(px, Y - 0.01, z, 0.02, 0.06, 0.03, 'wood_light');
    };
    hang(-0.62, 0.2, 1.0, 1.05, 'zg_sheet');
    hang(0.38, 0.2, 0.42, 0.36, 'zg_dress');
    mb.box(0.38, Y - 0.62, 0.2, 0.56, 0.3, 0.012, 'zg_dress', { fit: true });
    hang(0.95, 0.2, 0.22, 0.2, 'fabric_red');
    hang(-0.75, -0.2, 0.62, 0.58, 'zg_shirt');
    hang(0.25, -0.2, 0.9, 0.85, 'zg_sheet', { color: 0xd8e4f4 });
    hang(1.0, -0.2, 0.14, 0.24, 'fabric_grey');
    hang(1.15, -0.2, 0.14, 0.22, 'fabric_grey');
  },
});

// ---------------------------------------------------------------- valves
defObj({
  key: 'valve_wheel', name: 'Gate Valve', w: 1, d: 1, height: 1.6, block: 'solid',
  sound: 'metal', hp: 2000,
  desc: 'A cast-iron gate valve on the main manifold. The handwheel is cold and beaded with condensation.',
  tags: [...T, 'pool', 'pump', 'valve', 'machine'],
  variant: (s) => (s.valve || '') + (s.open ? '1' : '0'),
  model: (mb, s) => {
    const open = !!s.open;
    const L = (s.valve as string) || 'A';
    const zc = -0.18;
    // header pipe running along the wall + riser from the floor
    mb.cylinderX(0, 1.32, zc - 0.12, 0.09, 1.0, 10, 'q_pipe_paint', { color: 0x6a90b8 });
    mb.cylinder(0, 0, zc, 0.085, 0.62, 10, 'q_pipe_paint', { color: 0x6a90b8 });
    mb.cylinder(0, 0, zc, 0.15, 0.06, 10, 'metal_dark');
    // valve body + bonnet
    mb.box(0, 0.6, zc, 0.3, 0.3, 0.3, 'metal_dark');
    for (const y of [0.6, 0.9]) mb.cylinder(0, y - 0.02, zc, 0.13, 0.04, 10, 'metal_grey');
    mb.cylinder(0, 0.92, zc, 0.085, 0.4, 10, 'q_pipe_paint', { color: 0x6a90b8 });
    mb.box(0, 1.24, zc, 0.24, 0.18, 0.24, 'metal_dark');
    // stem + handwheel facing the room
    mb.cylinderZ(0, 0.75, zc + 0.3, 0.02, 0.32, 6, 'metal_grey');
    mb.push(); mb.translate(0, 0.75, zc + 0.47); mb.rotateX(Math.PI / 2); if (open) mb.rotateY(0.6);
    torus(mb, 0, 0, 0, 0.21, 0.025, 14, 5, open ? 'plastic_blue' : 'plastic_red', { color: open ? 0x6ad08a : 0xffffff });
    for (let k = 0; k < 3; k++) { const a = k * Math.PI / 3; mb.push(); mb.rotateY(a); mb.box(0, -0.012, 0, 0.42, 0.024, 0.024, 'metal_grey'); mb.pop(); }
    mb.pop();
    // tag + position indicator
    mb.box(0.24, 1.0, zc + 0.12, 0.16, 0.16, 0.01, 'zg_valve_' + L, { fit: true });
    rod(mb, 0.24, 0.98, zc + 0.12, 0.24, 1.0, zc + 0.12, 0.004, 4, 'metal_grey');
    mb.box(-0.2, 1.06, zc + 0.16, 0.08, 0.05, 0.02, open ? 'led_green' : 'led_red', { emissive: 0.9 });
    // drip tray + condensation
    mb.box(0, 0, 0.12, 0.5, 0.025, 0.3, 'metal_grey', { skip: ['bottom'] });
    discY(mb, 0.05, 0.026, 0.14, 0.12, 8, 'water', { color: 0xc8e0e8 });
  },
});

// ---------------------------------------------------------------- pool drain (portal)
defObj({
  key: 'drain_manhole', name: 'Drain Grate', w: 1, d: 1, height: 0.06, block: 'none',
  sound: 'metal', hp: 99999,
  desc: 'The main drain of the empty pool, a grate the size of a door. Something far below is running water, or breathing.',
  tags: [...T, 'pool', 'portal', 'manhole'],
  model: (mb) => {
    mb.box(0, -0.4, 0, 0.9, 0.4, 0.9, 'q_void', { skip: ['top'] });
    mb.box(0, 0, 0, 0.98, 0.02, 0.98, { top: 'zg_drain', sides: 'metal_dark' }, { fit: { top: true } });
    for (const s of [-1, 1]) mb.box(s * 0.51, 0, 0, 0.04, 0.035, 1.02, 'metal_dark');
    for (const s of [-1, 1]) mb.box(0, 0, s * 0.51, 1.02, 0.035, 0.04, 'metal_dark');
  },
});

// ---------------------------------------------------------------- signage
defObj({
  key: 'pool_rules_sign', name: 'Pool Rules', w: 1, d: 1, height: 2.0, block: 'none', onWall: true,
  sound: 'ceramic', hp: 600,
  desc: 'A tiled sign listing the rules. The last one has been added in a different hand.',
  tags: [...T, 'pool', 'sign', 'wall'],
  model: (mb) => {
    mb.box(0, 1.0, WZ + 0.015, 0.78, 0.96, 0.03, { south: 'zg_pool_rules', all: 'q_pool_tile' }, { fit: { south: true } });
    mb.box(0, 0.96, WZ + 0.02, 0.84, 0.04, 0.04, 'q_pool_tile_blue');
    mb.box(0, 1.96, WZ + 0.02, 0.84, 0.04, 0.04, 'q_pool_tile_blue');
  },
});

defObj({
  key: 'photo_frames', name: 'Family Photos', w: 1, d: 1, height: 2.0, block: 'none', onWall: true,
  movable: 1, sound: 'glass', flammable: 0.6,
  desc: 'Family photographs in mismatched frames. A man, a girl, a dog. In some of them the girl is looking at the camera. In the others she is looking at you.',
  tags: [...T, 'home', 'decor', 'wall', 'photo'],
  variant: (s) => 'v' + (Math.abs(Math.floor(s.v ?? 0)) % 6) + (s.blank ? 'b' : ''),
  model: (mb, s) => {
    const v = Math.abs(Math.floor(s.v ?? 0)) % 6;
    const ALL = ['zg_photo_field', 'zg_photo_dog', 'zg_photo_house', 'zg_photo_pool', 'zg_photo_cake', 'zg_photo_dad'];
    const layouts: [number, number, number, number][][] = [
      [[-0.22, 1.35, 0.24, 0.3], [0.16, 1.45, 0.3, 0.24], [0.12, 1.1, 0.2, 0.25]],
      [[0, 1.3, 0.34, 0.42]],
      [[-0.18, 1.2, 0.22, 0.28], [0.18, 1.2, 0.22, 0.28]],
      [[-0.25, 1.5, 0.2, 0.24], [0.05, 1.42, 0.22, 0.3], [0.3, 1.5, 0.18, 0.22], [-0.05, 1.08, 0.3, 0.22]],
      [[0.05, 1.25, 0.28, 0.36], [-0.28, 1.6, 0.16, 0.2]],
      [[-0.15, 1.38, 0.26, 0.2], [0.2, 1.18, 0.2, 0.26]],
    ];
    const frames = ['wood_dark', 'metal_brass', 'plastic_white', 'wood_light'];
    layouts[v].forEach(([x, y, w, h], i) => {
      const tex = s.blank ? 'zg_photo_blank' : ALL[(v * 2 + i) % ALL.length];
      const fr = frames[(v + i) % frames.length];
      mb.box(x, y - 0.025, WZ + 0.012, w + 0.05, h + 0.05, 0.022, fr);
      mb.box(x, y, WZ + 0.025, w, h, 0.004, tex, { fit: true });
    });
  },
});

defObj({
  key: 'party_banner', name: 'Birthday Banner', w: 3, d: 1, height: 2.6, block: 'none', onWall: true,
  sound: 'paper', flammable: 1,
  desc: 'HAPPY BIRTHDAY MIA, in crayon colours. The tape holding it up is yellow with age, but the paper is new.',
  tags: [...T, 'home', 'decor', 'wall', 'party'],
  model: (mb) => {
    mb.box(0, 2.02, WZ + 0.01, 2.4, 0.3, 0.006, 'zg_banner', { fit: true });
    for (let i = 0; i < 11; i++) {
      const x = -1.38 + i * 0.276, y = 2.42 - Math.sin((i / 10) * Math.PI) * 0.06;
      mb.push(); mb.translate(x, y, WZ + 0.02); mb.rotateZ(Math.PI / 4);
      mb.box(0, -0.06, 0, 0.11, 0.11, 0.004, 'zg_pennant', { fit: true, color: [0xffffff, 0xa8d8ff, 0xc8ffb0, 0xffe0a0][i % 4] });
      mb.pop();
    }
    mb.box(0, 2.5, WZ + 0.015, 2.86, 0.008, 0.008, 'plastic_white');
  },
});

// a door keypad (only if no other content pack defines one)
if (!objDef('keypad')) defObj({
  key: 'keypad', name: 'Keypad', w: 1, d: 1, height: 1.5, block: 'none', onWall: true,
  sound: 'metal', hp: 2000, power: true,
  desc: 'A six-digit keypad. The 0, 1, 4, 6 and 8 keys are worn shiny.',
  tags: ['keypad', 'security', 'mission', 'wall'],
  model: (mb) => {
    mb.box(0, 1.1, WZ + 0.025, 0.2, 0.28, 0.05, { south: 'zg_keypad', all: 'metal_dark' }, { fit: { south: true } });
    mb.box(0.06, 1.33, WZ + 0.052, 0.03, 0.02, 0.01, 'led_red', { emissive: 1 });
    rod(mb, 0, 1.1, WZ + 0.01, 0, 0.0, WZ + 0.01, 0.01, 4, 'metal_grey');
  },
});

// brass door nameplate for the study
defObj({
  key: 'door_nameplate', name: 'Nameplate', w: 1, d: 1, height: 1.7, block: 'none', onWall: true,
  sound: 'metal',
  desc: 'DR. A. HALE — PLEASE KNOCK. Someone has added, in crayon: "OR DONT".',
  tags: [...T, 'home', 'wall', 'sign'],
  model: (mb) => { mb.box(0, 1.5, WZ + 0.01, 0.3, 0.08, 0.012, 'zg_nameplate', { fit: true }); },
});
