// Zone props for Alder Lane Estates, Meadowbrook Elementary and St. Aldric:
// PA speakers, street name signs, house numbers, sectional garage doors, dog
// bowls, the waiting-room ticket dispenser and NOW SERVING display, wall signs
// (room plates and corridor direction signs), monument signs, a flagpole and
// the crayon drawing that turns up on every desk.
// Texture prefix: zgs_
import { defObj } from '../../world/objects';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { makeRamp, mixHex, scaleHex } from '../../gfx/pixel';
import { ph, text, textC, textW, rod, discY, poly, scribble } from './b_common';

const T = ['zg', 'suburbs'];
const WZ = -0.44; // wall face (0.12 m walls) in model space at rot 0

/** street names the blade signs can show */
export const ZGS_STREETS = ['ALDER LN', 'ELM ST', 'OAK DR', 'MAPLE CT', 'WILLOW WAY', 'BIRCH AVE', 'SCHOOL RD', 'ALDER LN', 'ELM ST'];
/** house numbers (plates) */
export const ZGS_NUMBERS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24', '41', '404', '14A', '0', '?'];
/** wall sign labels and their colour scheme: h hospital, s school, k shop, r warning */
export const ZGS_SIGNS: [string, 'h' | 's' | 'k' | 'r'][] = [
  // hospital
  ['WARD 7', 'h'], ['WARD 7 >', 'h'], ['< WARD 7', 'h'], ['WARD 9', 'h'], ['< WARD 9', 'h'], ['WARD 9 >', 'h'],
  ['PAEDIATRICS', 'h'], ['PAEDIATRICS >', 'h'], ['< PAEDIATRICS', 'h'], ['WARD 11 >', 'h'], ['< WARD 4B', 'h'], ['WARD 13 >', 'h'],
  ['< WARD 0', 'h'], ['MATERNITY >', 'h'], ['< RADIOLOGY', 'h'], ['RADIOLOGY', 'h'], ['EMERGENCY', 'r'], ['< EMERGENCY', 'h'],
  ['EMERGENCY >', 'h'], ['PHARMACY', 'h'], ['RECORDS', 'h'], ['MORGUE', 'h'], ['WAITING AREA', 'h'], ['THEATRE 1', 'h'],
  ['THEATRE 2', 'h'], ['CAFETERIA', 'h'], ['CHAPEL >', 'h'], ['NO ENTRY', 'r'], ['STAFF ONLY', 'r'], ['ICU', 'h'],
  ['EXIT >', 'h'], ['< EXIT', 'h'], ['GENERATOR', 'r'], ['BASEMENT', 'h'], ['LAUNDRY', 'h'], ['ADMISSIONS', 'h'],
  ['X-RAY', 'h'], ['WARD 12', 'h'], ['ICU >', 'h'], ['< THEATRES', 'h'], ['SURGERY >', 'h'], ['RECEPTION', 'h'],
  ['STAIRS', 'h'], ['TAKE A NUMBER', 'h'],
  // school
  ['OFFICE', 's'], ['NURSE', 's'], ['LIBRARY', 's'], ['GYM', 's'], ['LUNCHROOM', 's'], ['MUSIC', 's'], ['PRINCIPAL', 's'],
  ['ART', 's'], ['KINDERGARTEN', 's'], ['BOYS', 's'], ['GIRLS', 's'], ['TEACHERS', 's'], ['KITCHEN', 's'], ['STORAGE', 's'],
  ['< GYM', 's'], ['LIBRARY >', 's'], ['< LUNCHROOM', 's'], ['OFFICE >', 's'], ['< NURSE', 's'], ['ROOM 0', 's'],
  ...['1', '2', '3'].flatMap((r) => ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'].map((c) => ['ROOM ' + r + c, 's'] as [string, 's'])),
  // shops
  ['KWIK STOP', 'k'], ['OPEN', 'k'],
];
const SIGN_IDX = new Map(ZGS_SIGNS.map(([s], i) => [s, i]));
/** monument sign texts */
const MONUMENTS = [['ALDER LANE', 'ESTATES'], ['MEADOWBROOK', 'ELEMENTARY'], ['ST. ALDRIC', 'HOSPITAL']];

const signW = (s: string) => textW(s) + 8;

addTextureModule(() => {
  const A = atlas();
  // PA speaker grille
  A.add('zgs_pa_grille', 10, 10, (pc) => {
    pc.wrap = false;
    const R = makeRamp(0xc8c0a8, 4, { spread: 0.25 });
    pc.fill(R[2]);
    for (let y = 1; y < 9; y++) for (let x = 1; x < 9; x++) if ((x + y) % 2 === 0 && Math.hypot(x - 4.5, y - 4.5) < 4.2) pc.set(x, y, 0x2a2824);
    pc.strokeRect(0, 0, 10, 10, R[1]);
    pc.hline(0, 9, 0, R[3]);
  });
  // street blades: reflective green, white letters, border
  ZGS_STREETS.forEach((s, i) => A.add('zgs_street_' + i, 44, 7, (pc) => {
    pc.wrap = false;
    pc.fill(0x1f6a3a);
    pc.strokeRect(0, 0, 44, 7, 0xd8e8dc);
    textC(pc, s, 22, 1, 0xf4f8f0);
    for (let x = 1; x < 43; x++) if (ph(x, 3, 7300 + i) < 0.08) pc.blend(x, 5, 0x0a2a14, 0.4);
  }));
  // house numbers: black on cream enamel
  ZGS_NUMBERS.forEach((n, i) => A.add('zgs_num_' + i, 16, 9, (pc) => {
    pc.wrap = false;
    pc.fill(0xeee6cc);
    pc.strokeRect(0, 0, 16, 9, 0x6a5a3a);
    textC(pc, n, 8, 2, 0x1a1a1a);
    pc.set(1, 1, 0xb8a070); pc.set(14, 7, 0xb8a070);
  }));
  // garage door: four white panel courses, top course with little windows
  A.add('zgs_garage', 64, 40, (pc) => {
    pc.wrap = false;
    const R = makeRamp(0xe2ddd0, 5, { spread: 0.22 });
    pc.fill(R[3]);
    for (let k = 0; k < 4; k++) {
      const y0 = k * 10;
      pc.hline(0, 63, y0, R[1]); pc.hline(0, 63, y0 + 1, R[4]);
      for (let p = 0; p < 4; p++) {
        const x0 = 2 + p * 15;
        if (k === 0) { pc.rect(x0 + 1, y0 + 3, 12, 5, 0x3a4450); pc.hline(x0 + 1, x0 + 12, y0 + 3, 0x6a7888); }
        else { pc.strokeRect(x0, y0 + 2, 14, 7, R[2]); pc.hline(x0 + 1, x0 + 13, y0 + 3, R[4]); }
      }
    }
    for (let x = 0; x < 64; x++) for (let y = 30; y < 40; y++) if (ph(x, y, 7311) < 0.06 + (y - 30) * 0.012) pc.blend(x, y, 0x6a6050, 0.35);
    pc.rect(30, 34, 4, 2, 0x5a5a5a);
  });
  // waiting room displays
  A.add('zgs_serving', 40, 12, (pc) => {
    pc.wrap = false;
    pc.fill(0x0c0b0a);
    pc.strokeRect(0, 0, 40, 12, 0x3a3a3a);
    text(pc, 'NOW', 2, 1, 0xd8d8d0);
    text(pc, '0410', 18, 3, 0xff3a22, 1);
    text(pc, 'SERVING', 2, 6, 0xd8d8d0);
    for (let x = 17; x < 38; x++) for (let y = 2; y < 10; y++) if (pc.get(x, y) === 0x0c0b0a && (x + y) % 3 === 0) pc.set(x, y, 0x2a0c08);
  });
  A.add('zgs_ticket', 8, 10, (pc) => {
    pc.wrap = false;
    pc.fill(0xf4f0e0);
    text(pc, '41', 0, 1, 0xc0201a);
    text(pc, '1', 2, 5, 0xc0201a);
  });
  A.add('zgs_dispenser', 12, 8, (pc) => {
    pc.wrap = false;
    pc.fill(0xc8281e);
    pc.strokeRect(0, 0, 12, 8, 0x7a1410);
    textC(pc, 'TAKE', 6, 1, 0xf8f0e0);
    pc.hline(2, 9, 7, 0xf8f0e0);
  });
  // wall signs
  ZGS_SIGNS.forEach(([s, st], i) => {
    const w = signW(s);
    A.add('zgs_sign_' + i, w, 9, (pc) => {
      pc.wrap = false;
      const bg = st === 'h' ? 0x1e4a8a : st === 's' ? 0x2a5a3a : st === 'k' ? 0xc82a1e : 0xb8261e;
      const fg = st === 'k' ? 0xffe060 : 0xf6f6ee;
      pc.fill(bg);
      pc.strokeRect(0, 0, w, 9, st === 's' ? 0xc8a860 : scaleHex(bg, 0.6));
      pc.hline(1, w - 2, 1, mixHex(bg, 0xffffff, 0.2));
      textC(pc, s, w / 2, 2, fg);
    });
  });
  // monument signs
  MONUMENTS.forEach(([a, b], i) => A.add('zgs_mon_' + i, 64, 20, (pc) => {
    pc.wrap = false;
    pc.fill(0xece6d6);
    pc.strokeRect(0, 0, 64, 20, 0x5a4a32);
    pc.strokeRect(1, 1, 62, 18, 0xb8aa88);
    textC(pc, a, 32, 3, i === 2 ? 0x1e4a8a : 0x2a4a2a, 1);
    textC(pc, b, 32, 11, i === 2 ? 0x1e4a8a : 0x6a2a1a, 1);
  }));
  // a child's crayon drawing: house, red door, girl, big brown dog, sun
  A.add('zgs_drawing', 20, 15, (pc) => {
    pc.wrap = false;
    pc.fill(0xf8f6ee);
    for (let x = 0; x < 20; x++) if (ph(x, 13, 7401) < 0.7) pc.set(x, 13, 0x5ab84a);
    pc.rect(3, 6, 7, 6, 0xe8c070);
    poly(pc, [[2, 6.5], [6.5, 2.5], [11, 6.5]], 0xb83a2a);
    pc.rect(6, 9, 2, 3, 0xe02a1e);
    pc.set(4, 8, 0x3a8ad8); pc.set(9, 8, 0x3a8ad8);
    pc.set(13, 9, 0xe0b090); pc.vline(13, 10, 11, 0xf2cf4a); pc.set(12, 12, 0x2a2a2a); pc.set(14, 12, 0x2a2a2a);
    pc.rect(15, 10, 3, 2, 0x8a5a30); pc.set(18, 9, 0x8a5a30); pc.set(18, 10, 0x2a1a10); pc.set(15, 12, 0x8a5a30); pc.set(17, 12, 0x8a5a30);
    pc.set(16, 9, 0x2a2a2a);
    pc.rect(16, 1, 3, 3, 0xffd030); pc.set(15, 2, 0xffd030); pc.set(19, 2, 0xffd030);
    scribble(pc, 1, 1, 8, 0x3a3ad8, 7402, 1);
  });
  void scaleHex;
});

// ---------------------------------------------------------------- PA speaker
defObj({
  key: 'zg_pa_speaker', name: 'PA Speaker', w: 1, d: 1, height: 2.5, block: 'none', onWall: true,
  sound: 'plastic', hp: 300,
  desc: 'A beige public-address speaker. Every so often it clears its throat, and then says nothing.',
  tags: [...T, 'school', 'speaker', 'wall'],
  model: (mb) => {
    mb.box(0, 2.08, WZ + 0.07, 0.34, 0.34, 0.14, { south: 'zgs_pa_grille', all: 'plastic_beige' }, { fit: { south: true } });
    mb.box(0, 2.42, WZ + 0.03, 0.08, 0.06, 0.06, 'metal_grey');
    rod(mb, 0.12, 2.42, WZ + 0.01, 0.12, 2.68, WZ + 0.01, 0.008, 4, 'plastic_black');
  },
});

// ---------------------------------------------------------------- street name sign
defObj({
  key: 'zg_street_sign', name: 'Street Sign', w: 1, d: 1, height: 2.75, block: 'solid', tall: true,
  sound: 'metal', hp: 600,
  desc: 'A street sign. You are fairly sure it named a different street a moment ago.',
  tags: [...T, 'street', 'sign'],
  variant: (s) => `${(s.a ?? 0) % ZGS_STREETS.length}|${(s.b ?? 1) % ZGS_STREETS.length}`,
  model: (mb, s) => {
    const a = (s.a ?? 0) % ZGS_STREETS.length, b = (s.b ?? 1) % ZGS_STREETS.length;
    mb.cylinder(0, 0, 0, 0.045, 2.62, 6, 'metal_grey');
    mb.cylinder(0, 0, 0, 0.09, 0.05, 6, 'concrete');
    mb.box(0, 2.42, 0, 1.24, 0.2, 0.025, { south: 'zgs_street_' + a, north: 'zgs_street_' + a, all: 'metal_painted_green' }, { fit: { south: true, north: true } });
    mb.box(0, 2.18, 0, 0.025, 0.2, 1.24, { east: 'zgs_street_' + b, west: 'zgs_street_' + b, all: 'metal_painted_green' }, { fit: { east: true, west: true } });
    mb.box(0, 2.64, 0, 0.07, 0.04, 0.07, 'metal_dark');
  },
});

// ---------------------------------------------------------------- house number
defObj({
  key: 'zg_house_number', name: 'House Number', w: 1, d: 1, height: 1.8, block: 'none', onWall: true,
  sound: 'metal', hp: 400,
  desc: 'An enamel house number. The house next door has the same one.',
  tags: [...T, 'house', 'sign', 'wall'],
  variant: (s) => String(s.label ?? '14'),
  model: (mb, s) => {
    const k = ZGS_NUMBERS.indexOf(String(s.label ?? '14'));
    const i = k < 0 ? ZGS_NUMBERS.length - 1 : k;
    mb.box(0.18, 1.55, WZ + 0.012, 0.36, 0.2, 0.02, { south: 'zgs_num_' + i, all: 'metal_brass' }, { fit: { south: true } });
  },
});

// ---------------------------------------------------------------- garage door
defObj({
  key: 'zg_garage_door', name: 'Garage Door', w: 4, d: 1, height: 2.3, block: 'none', onWall: true,
  sound: 'metal', hp: 99999,
  desc: 'A sectional garage door, pulled down and locked from inside. There is a side door.',
  tags: [...T, 'house', 'garage', 'wall'],
  model: (mb) => {
    mb.box(0, 0.02, WZ + 0.03, 3.6, 2.2, 0.05, { south: 'zgs_garage', all: 'plastic_white' }, { fit: { south: true } });
    mb.box(0, 2.22, WZ + 0.04, 3.84, 0.12, 0.07, 'wood_trim', { color: 0xf0ece0 });
    for (const sx of [-1, 1]) mb.box(sx * 1.86, 0, WZ + 0.04, 0.12, 2.28, 0.07, 'wood_trim', { color: 0xf0ece0 });
    mb.box(0.3, 0.32, WZ + 0.065, 0.24, 0.05, 0.03, 'metal_grey');
  },
});

// ---------------------------------------------------------------- dog bowl
defObj({
  key: 'zg_dog_bowl', name: 'Dog Bowl', w: 1, d: 1, height: 0.1, block: 'none',
  sound: 'plastic', movable: 1,
  desc: 'A red dog bowl. BISCUIT, in marker on the side. The water in it is fresh.',
  tags: [...T, 'dog', 'outdoor'],
  model: (mb) => {
    mb.cylinder(0.05, 0, 0.1, 0.13, 0.07, 10, 'plastic_red', { rTop: 0.16 });
    discY(mb, 0.05, 0.066, 0.1, 0.13, 10, 'water', { color: 0xd8f0ff });
    mb.cylinder(-0.22, 0, -0.05, 0.1, 0.05, 8, 'plastic_blue', { rTop: 0.12 });
    mb.box(-0.22, 0.05, -0.05, 0.14, 0.03, 0.08, 'cardboard', { color: 0x8a5a30 });
  },
});

// ---------------------------------------------------------------- waiting room: take a number
defObj({
  key: 'zg_ticket_dispenser', name: 'Ticket Dispenser', w: 1, d: 1, height: 1.35, block: 'low',
  sound: 'metal', hp: 600,
  desc: 'TAKE A NUMBER. The paper tongue sticking out says 0411. It always says 0411, however many you pull.',
  tags: [...T, 'hospital', 'waiting'],
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.18, 0.04, 10, 'metal_dark');
    mb.cylinder(0, 0.04, 0, 0.03, 1.05, 6, 'chrome');
    mb.box(0, 1.08, 0, 0.26, 0.22, 0.2, { south: 'zgs_dispenser', all: 'plastic_red' }, { fit: { south: true } });
    mb.box(0, 1.02, 0.11, 0.07, 0.09, 0.006, 'zgs_ticket', { fit: true });
  },
});
defObj({
  key: 'zg_now_serving', name: 'Queue Display', w: 1, d: 1, height: 2.5, block: 'none', onWall: true,
  sound: 'plastic', hp: 300, power: true,
  light: { color: 0xff4a30, intensity: 0.25, radius: 2.2, y: 2.1, kind: 'screen', power: true },
  desc: 'NOW SERVING 0410. It has said 0410 since you came in. Your ticket says 0411.',
  tags: [...T, 'hospital', 'waiting', 'wall'],
  model: (mb) => {
    mb.box(0, 1.9, WZ + 0.04, 1.0, 0.32, 0.08, { south: 'zgs_serving', all: 'plastic_black' }, { fit: { south: true }, emissive: 0.6 });
    for (const sx of [-0.4, 0.4]) rod(mb, sx, 2.06, WZ + 0.04, sx, 2.7, WZ + 0.04, 0.008, 4, 'metal_grey');
  },
});

// ---------------------------------------------------------------- wall sign (room plates, direction signs)
defObj({
  key: 'zg_sign', name: 'Sign', w: 1, d: 1, height: 2.5, block: 'none', onWall: true,
  sound: 'plastic', hp: 300,
  desc: 'A sign, screwed to the wall. It points with total confidence.',
  tags: [...T, 'sign', 'wall'],
  variant: (s) => String(s.label ?? 'NO ENTRY'),
  model: (mb, s) => {
    const label = String(s.label ?? 'NO ENTRY');
    const i = SIGN_IDX.get(label) ?? SIGN_IDX.get('NO ENTRY')!;
    const w = Math.min(2.6, signW(ZGS_SIGNS[i][0]) / 32);
    const y = s.h ?? 2.12;
    mb.box(0, y, WZ + 0.02, w, 9 / 32, 0.03, { south: 'zgs_sign_' + i, all: 'plastic_white' }, { fit: { south: true }, emissive: ZGS_SIGNS[i][1] === 'k' ? 0.5 : 0 });
  },
});

// ---------------------------------------------------------------- monument sign
defObj({
  key: 'zg_monument_sign', name: 'Sign', w: 3, d: 1, height: 1.35, block: 'solid',
  sound: 'ceramic', hp: 3000,
  desc: 'A low brick sign with white letters. The flowerbed in front of it is perfectly kept.',
  tags: [...T, 'sign', 'outdoor'],
  variant: (s) => String((s.v ?? 0) % MONUMENTS.length),
  model: (mb, s) => {
    const v = (s.v ?? 0) % MONUMENTS.length;
    mb.box(0, 0, 0, 2.7, 0.35, 0.5, 'wall_brick');
    mb.box(0, 0.35, 0, 2.5, 0.85, 0.3, { south: 'zgs_mon_' + v, north: 'zgs_mon_' + v, all: 'plastic_white' }, { fit: { south: true, north: true } });
    mb.box(0, 1.2, 0, 2.7, 0.1, 0.42, 'wall_brick');
    for (const sx of [-1.25, 1.25]) mb.box(sx, 0.35, 0, 0.22, 0.85, 0.42, 'wall_brick');
  },
});

// ---------------------------------------------------------------- flagpole
defObj({
  key: 'zg_flagpole', name: 'Flagpole', w: 1, d: 1, height: 6.2, block: 'solid', tall: true,
  sound: 'metal', hp: 2000,
  desc: 'A white flagpole. The flag hangs straight down, though you can hear the rope ticking in a wind.',
  tags: [...T, 'outdoor', 'school'],
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.22, 0.2, 8, 'concrete');
    mb.cylinder(0, 0.2, 0, 0.06, 5.9, 6, 'plastic_white', { rTop: 0.035 });
    mb.sphere(0, 6.12, 0, 0.07, 6, 3, 'metal_brass');
    mb.box(0.36, 4.7, 0, 0.62, 1.2, 0.02, 'fabric_blue', { color: 0xc8d8f0 });
    mb.box(0.36, 5.2, 0, 0.5, 0.12, 0.024, 'plastic_white');
    rod(mb, 0.07, 1.2, 0.02, 0.07, 6.0, 0.02, 0.006, 3, 'plastic_white');
  },
});

// ---------------------------------------------------------------- crayon drawings
defObj({
  key: 'zg_crayon_drawing', name: 'Crayon Drawing', w: 1, d: 1, height: 0.02, block: 'none',
  sound: 'paper', flammable: 1, movable: 0.05, lore: 'drawing_family',
  desc: 'A crayon drawing: a house with a red door, a girl, a big brown dog with a big smile. The same drawing as on the desk next to it.',
  tags: [...T, 'school', 'drawing'],
  model: (mb) => {
    mb.box(0.04, 0, 0.06, 0.34, 0.006, 0.26, { top: 'zgs_drawing', all: 'paper' }, { fit: { top: true } });
  },
});
defObj({
  key: 'zg_wall_drawing', name: 'Crayon Drawing', w: 1, d: 1, height: 1.6, block: 'none', onWall: true,
  sound: 'paper', flammable: 1, lore: 'drawing_family',
  desc: 'A crayon drawing taped to the wall: the house, the red door, the girl, the dog. Somebody has drawn it many times.',
  tags: [...T, 'school', 'drawing', 'wall'],
  model: (mb, s) => {
    const dx = ((s.v ?? 0) % 3 - 1) * 0.18;
    mb.box(dx, 1.32, WZ + 0.008, 0.4, 0.3, 0.006, 'zgs_drawing', { fit: true });
    mb.box(dx, 1.47, WZ + 0.012, 0.08, 0.03, 0.004, 'plastic_yellow', { color: 0xf0e8b0 });
  },
});
