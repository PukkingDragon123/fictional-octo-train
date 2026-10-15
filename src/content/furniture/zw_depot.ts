// World stream 3 — The Depot: a 1990 bus and rail interchange that goes on
// forever. Dot-matrix boards with places nobody can go, steel benches,
// lost luggage, platform signs, a ticket booth, ticket machines, a parked
// coach nobody has driven since the last timetable change.
import { defObj } from '../../world/objects';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { makeRamp, mixHex, scaleHex, ph, bayer } from '../../gfx/pixel';
import type { PixelCanvas } from '../../gfx/pixel';
import type { ModelBuilder } from '../../gfx/modelBuilder';
import { text, textC, textW, rod, scribble } from './b_common';
import { WZ, crtGlass } from './a_lib';

const T = ['depot', 'zw'];

/** departure boards: rows of [destination, time, status] — places nobody can go */
export const ZW_BOARDS: string[][][] = [
  [['LEVEL 0', '25:61', 'ON TIME'], ['HOME', '--:--', 'CANCELLED'], ['ALDER LN', '06:14', 'DELAYED'], ['YESTERDAY', '00:00', 'BOARDING']],
  [['OUTSIDE', '13:13', 'CANCELLED'], ['THE PARK', '19:87', 'WAIT'], ['YOUR ROAD', '07:45', 'GONE'], ['BACK', '88:88', 'ON TIME']],
  [['BELOW', '04:44', 'ON TIME'], ['WESTGATE', '16:30', 'NO SERVICE'], ['FACILITY 4', '06:14', 'STAFF ONLY'], ['NOWHERE', '--:--', 'ARRIVED']],
  [['REMITTANCE', '00:01', 'PAID ONLY'], ['HOME', '--:--', 'CANCELLED'], ['HOME', '--:--', 'CANCELLED'], ['HOME', '--:--', 'CANCELLED']],
];
export const ZW_PLATFORM_LABELS = ['PLATFORM 0', 'PLATFORM 1', 'PLATFORM 2', 'PLATFORM 9', 'BAY 0', 'BAY 7', 'BAY 13', 'ARRIVALS', 'DEPARTURES', 'NO EXIT'];
const CASE_COLS = [0x7a2a2a, 0x2a4a6a, 0x4a5a3a, 0x8a6a3a, 0x2a2a2e, 0x9a8a6a, 0x5a3a5a];

function dotMatrix(pc: PixelCanvas, rows: string[][], header: string) {
  pc.wrap = false;
  pc.fill(0x0c0a08);
  // faint unlit LED grid
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) if ((x & 1) === 0 && (y & 1) === 0) pc.set(x, y, 0x1c140c);
  const A = 0xffb028, D = 0xb87018;
  text(pc, header, 2, 2, 0xffd060);
  text(pc, '25:61', pc.w - 21, 2, 0xffd060);
  for (let x = 1; x < pc.w - 1; x++) pc.set(x, 8, 0x3a2410);
  rows.forEach((r, i) => {
    const y = 11 + i * 7;
    const blink = r[2] === 'BOARDING' || r[2] === 'CANCELLED';
    text(pc, r[0], 2, y, A);
    text(pc, r[1], 46, y, D);
    text(pc, r[2], pc.w - 2 - textW(r[2]), y, blink ? 0xff6030 : A);
  });
  // dead pixels and a dead column
  for (let i = 0; i < 6; i++) pc.set(Math.floor(ph(i, 3, 8101) * pc.w), Math.floor(ph(i, 4, 8102) * pc.h), 0x0c0a08);
  const dc = 30 + Math.floor(ph(rows.length, 1, 8103) * 30);
  for (let y = 9; y < pc.h; y++) if (pc.get(dc, y) !== 0x0c0a08) pc.set(dc, y, 0x2a1a0a);
}

addTextureModule(() => {
  const A = atlas();
  ZW_BOARDS.forEach((rows, i) => A.add('zw_board_' + i, 96, 40, (pc) => dotMatrix(pc, rows, i === 3 ? 'ARRIVALS' : 'DEPARTURES')));
  ZW_PLATFORM_LABELS.forEach((l, i) => A.add('zw_plat_' + i, 64, 14, (pc) => {
    pc.wrap = false;
    pc.fill(0x1a2a5a);
    for (let x = 0; x < 64; x++) { pc.set(x, 0, 0x3a4a7a); pc.set(x, 13, 0x0e1a3a); }
    pc.rect(2, 2, 8, 10, 0xf0f0e8);
    textC(pc, l.startsWith('BAY') ? 'B' : 'P', 6, 4, 0x1a2a5a);
    text(pc, l, 13, 4, 0xf4f0e0);
    // grime gathered on the top edge
    for (let x = 0; x < 64; x++) if (ph(x, 1, 8111) < 0.4) pc.blend(x, 1, 0x0a0a0a, 0.4);
  }));
  // perforated stainless (bench slats, bins)
  A.add('zw_perf', 16, 16, (pc) => {
    const R = makeRamp(0x9aa0a4, 5, { spread: 0.3 });
    pc.each((x, y) => pc.set(x, y, R[2 + ((x * 7 + y * 3) % 11 === 0 ? 1 : 0)]));
    for (let y = 1; y < 16; y += 3) for (let x = (y % 2) + 1; x < 16; x += 3) { pc.set(x, y, 0x2a2c2e); pc.set(x + 1, y + 1, R[4]); }
  });
  // hard-shell suitcase ribs
  A.add('zw_case_hard', 16, 16, (pc) => {
    const R = makeRamp(0x9a9a9a, 5, { spread: 0.3 });
    pc.each((x, y) => pc.set(x, y, x % 4 === 0 ? R[1] : x % 4 === 1 ? R[4] : R[3 - (ph(x, y, 8121) < 0.1 ? 1 : 0)]));
    for (let x = 0; x < 16; x++) { pc.set(x, 0, R[0]); pc.set(x, 15, R[0]); }
  });
  // tweed soft-case cloth
  A.add('zw_case_soft', 16, 16, (pc) => {
    pc.each((x, y) => pc.set(x, y, ((x + y) % 4 < 2) !== ((x - y + 32) % 6 < 3) ? 0xa89878 : 0x8a7a5a));
    for (let x = 0; x < 16; x += 5) for (let y = 0; y < 16; y++) pc.set(x, y, 0x6a5a3a);
  });
  A.add('zw_tag', 6, 9, (pc) => {
    pc.wrap = false; pc.fill(0xe8e0c8); pc.set(2, 1, 0x3a3a3a); pc.set(3, 1, 0x3a3a3a);
    for (let y = 3; y < 8; y += 2) for (let x = 1; x < 5; x++) if (ph(x, y, 8131) < 0.7) pc.set(x, y, 0x4a4a6a);
  });
  // ticket booth fascia
  A.add('zw_tickets', 64, 10, (pc) => {
    pc.wrap = false;
    pc.fill(0xc03a2a);
    for (let x = 0; x < 64; x++) { pc.set(x, 0, 0xe06048); pc.set(x, 9, 0x7a1a14); }
    textC(pc, 'TICKETS - SCRIP ONLY', 32, 3, 0xfff4e0);
  });
  // ticket machine face: CRT, coin slot, keypad, return tray
  A.add('zw_tvm', 20, 40, (pc) => {
    pc.wrap = false;
    const R = makeRamp(0x3a4a6a, 5, { spread: 0.3 });
    pc.fill(R[2]);
    pc.rect(1, 1, 18, 4, 0xe0b020); text(pc, 'TICKETS', 2, 0, 0x1a1a1a);
    pc.rect(3, 7, 14, 10, 0x0a140a);
    text(pc, 'DEST?', 4, 8, 0x50f070); text(pc, '25:61', 4, 14, 0x308a40);
    crtGlass(pc, 3, 7, 14, 10, 0x0a140a, 0.4);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) { pc.rect(4 + c * 4, 20 + r * 3, 3, 2, R[4]); pc.set(6 + c * 4, 21 + r * 3, R[0]); }
    pc.rect(16, 20, 2, 6, 0x1a1a1a); pc.set(16, 20, 0xa0a0a0);
    pc.rect(4, 33, 12, 4, 0x0e0e10); pc.hline(4, 15, 33, R[0]);
    for (let y = 0; y < 40; y++) { pc.set(0, y, R[4]); pc.set(19, y, R[0]); }
  });
  // network map: coloured lines that close on themselves
  A.add('zw_netmap', 64, 40, (pc) => {
    pc.wrap = false;
    pc.fill(0xf0ecdc);
    for (let y = 0; y < 40; y++) for (let x = 0; x < 64; x++) if (ph(x >> 2, y >> 2, 8141) < 0.08) pc.set(x, y, 0xe4dfcc);
    const lines: [number, [number, number][]][] = [
      [0xd03030, [[4, 8], [20, 8], [28, 16], [44, 16], [56, 8], [60, 20], [44, 32], [20, 32], [8, 20], [4, 8]]],
      [0x2a6ad0, [[6, 30], [24, 14], [40, 14], [52, 26], [36, 36], [24, 26], [24, 14]]],
      [0x2a9a4a, [[10, 4], [10, 36], [30, 36], [30, 24], [10, 24]]],
      [0xe0a020, [[34, 4], [34, 38], [58, 38], [58, 4], [34, 4]]],
    ];
    for (const [c, pts] of lines) for (let i = 1; i < pts.length; i++) {
      pc.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], c);
      pc.line(pts[i - 1][0] + 1, pts[i - 1][1], pts[i][0] + 1, pts[i][1], c);
    }
    for (const [, pts] of lines) for (const [x, y] of pts) { pc.rect(x - 1, y - 1, 3, 3, 0xffffff); pc.strokeRect(x - 1, y - 1, 3, 3, 0x1a1a1a); }
    pc.rect(46, 30, 3, 3, 0xff2020);
    text(pc, 'YOU', 50, 28, 0x1a1a1a); text(pc, 'ARE', 50, 34, 0x1a1a1a);
    pc.strokeRect(0, 0, 64, 40, 0x2a2a2a);
  });
  A.add('zw_timetable', 24, 34, (pc) => {
    pc.wrap = false;
    pc.fill(0xf4f0e0);
    pc.rect(0, 0, 24, 5, 0x1a2a5a); text(pc, 'TIMES', 2, 0, 0xffffff);
    for (let r = 0; r < 9; r++) {
      const y = 7 + r * 3;
      pc.hline(1, 22, y + 2, 0xd8d0b8);
      scribble(pc, 2, y, 7, 0x3a3a3a, 8150 + r, 1);
      scribble(pc, 12, y, 9, r === 4 ? 0xc02020 : 0x3a3a3a, 8160 + r, 1);
    }
    pc.blend(17, 22, 0xc02020, 0.6); pc.line(3, 26, 20, 30, 0xc02020); // someone crossed a row out
  });
  // station clock face with no hands
  A.add('zw_clockface', 16, 16, (pc) => {
    pc.wrap = false; pc.clear();
    pc.circle(7.5, 7.5, 7.6, 0x1a1a1a); pc.circle(7.5, 7.5, 6.8, 0xf4f0e4);
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; pc.set(Math.round(7.5 + Math.cos(a) * 5.6), Math.round(7.5 + Math.sin(a) * 5.6), 0x1a1a1a); }
    pc.set(7, 7, 0x1a1a1a); pc.set(8, 8, 0x1a1a1a);
  });
  // coach livery: cream over a burgundy skirt with a gold pinstripe
  A.add('zw_coach_side', 32, 32, (pc) => {
    const C = makeRamp(0xe8dcc0, 4, { spread: 0.18 }), Rr = makeRamp(0x7a2030, 4, { spread: 0.25 });
    pc.each((x, y) => pc.set(x, y, y < 20 ? C[2 + (ph(x >> 2, y >> 2, 8171) < 0.12 ? -1 : 0)] : Rr[2]));
    for (let x = 0; x < 32; x++) { pc.set(x, 19, 0xd8b040); pc.set(x, 21, 0xd8b040); pc.set(x, 31, Rr[0]); }
    for (let y = 22; y < 32; y++) for (let x = 0; x < 32; x++) if (bayer(x, y) < (y - 22) / 30) pc.blend(x, y, 0x1a1008, 0.4);
  });
  A.add('zw_coach_window', 16, 16, (pc) => {
    pc.each((x, y) => pc.set(x, y, mixHex(0x0c1014, 0x2a3440, (y / 16) * 0.4 + (bayer(x, y) < 0.1 ? 0.2 : 0))));
    for (let i = 0; i < 4; i++) pc.set(2 + i, 3 + i, 0x5a6a7a);
    for (let x = 0; x < 16; x++) pc.set(x, 15, 0x060808);
  });
  A.add('zw_coach_dest', 40, 8, (pc) => {
    pc.wrap = false; pc.fill(0x0a0806);
    textC(pc, 'NOT IN SERVICE', 20, 2, 0xffa020);
  });
  A.add('zw_coach_front', 32, 32, (pc) => {
    pc.wrap = false;
    const C = makeRamp(0xe8dcc0, 4, { spread: 0.18 });
    pc.fill(C[2]);
    pc.rect(2, 2, 28, 15, 0x10161c); for (let i = 0; i < 6; i++) pc.set(5 + i, 4 + i, 0x4a5a6a);
    pc.rect(3, 18, 26, 3, 0x0a0806); textC(pc, 'NOT IN SERVICE', 16, 17, 0xffa020);
    pc.rect(0, 23, 32, 9, 0x7a2030);
    pc.rect(2, 25, 5, 3, 0xf4f0c0); pc.rect(25, 25, 5, 3, 0xf4f0c0);
    pc.rect(11, 25, 10, 5, 0x2a2a2a); for (let x = 12; x < 21; x += 2) pc.vline(x, 26, 29, 0x5a5a5a);
  });
  A.add('zw_newsstand', 48, 20, (pc) => {
    pc.wrap = false;
    pc.fill(0x2a6a3a);
    textC(pc, 'NEWS - MAGAZINES', 24, 2, 0xf4f0d8);
    for (let x = 0; x < 48; x++) pc.set(x, 8, 0x1a4a2a);
    // roller shutter below the sign
    for (let y = 9; y < 20; y++) for (let x = 0; x < 48; x++) pc.set(x, y, y % 2 ? 0x8a8a84 : 0x6a6a64);
    for (let x = 4; x < 44; x++) if (ph(x, 1, 8181) < 0.5) pc.set(x, 14, 0x1a1a1a); // graffiti tag smudge
  });
});

// ============================================================ helpers
function legsBolt(mb: ModelBuilder, x: number, z: number, h: number) {
  mb.box(x, 0, z, 0.06, h, 0.06, 'metal_grey', { color: 0x9aa0a4 });
  mb.box(x, 0, z, 0.14, 0.012, 0.14, 'metal_grey', { color: 0x6a6e70 });
}
function suitcase(mb: ModelBuilder, x: number, y: number, z: number, w: number, h: number, d: number, col: number, hard: boolean, rotY = 0, tag = true) {
  mb.push().translate(x, y, z).rotateY(rotY);
  mb.box(0, 0, 0, w, h, d, hard ? 'zw_case_hard' : 'zw_case_soft', { color: col });
  // trim band + corner guards + handle
  mb.box(0, h * 0.48, 0, w + 0.01, 0.025, d + 0.01, 'plastic_black', { color: scaleHex(col, 0.5) });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) mb.box(sx * (w / 2 - 0.02), h - 0.04, sz * (d / 2 - 0.02), 0.05, 0.045, 0.05, 'metal_brass', { color: 0xc8b080 });
  mb.box(0, h, 0, 0.16, 0.035, 0.03, 'plastic_black');
  mb.box(-0.07, h - 0.01, 0, 0.02, 0.045, 0.03, 'plastic_black'); mb.box(0.07, h - 0.01, 0, 0.02, 0.045, 0.03, 'plastic_black');
  if (tag) { mb.push().translate(0.1, h + 0.01, 0.02).rotateZ(0.5); mb.box(0, -0.09, 0, 0.06, 0.09, 0.006, 'zw_tag', { fit: true }); mb.pop(); }
  mb.pop();
}

// ============================================================ boards and signs
defObj({
  key: 'zw_departures', name: 'Departure Board', w: 2, d: 1, height: 2.4, block: 'none', onWall: true,
  sound: 'metal', hp: 600, power: true, hum: 'computer',
  light: { color: 0xffa030, intensity: 0.32, radius: 3.2, y: 1.9, kind: 'screen', power: true, flicker: 0.02 },
  desc: 'Amber dots on black. Every row is a place you know. None of them have a platform.',
  tags: [...T, 'sign', 'wall', 'screens'],
  variant: (s) => String((s.v ?? 0) % ZW_BOARDS.length) + (s.unpowered ? 'x' : ''),
  model: (mb, s) => {
    const v = (s.v ?? 0) % ZW_BOARDS.length, lit = !s.unpowered;
    mb.box(0, 1.5, WZ + 0.09, 1.96, 0.86, 0.16, { south: 'zw_board_' + v, all: 'metal_dark' }, { fit: { south: true }, emissive: lit ? 1.0 : 0.05 });
    mb.box(0, 2.36, WZ + 0.09, 2.0, 0.05, 0.18, 'metal_dark');
    mb.box(0, 1.46, WZ + 0.09, 2.0, 0.05, 0.18, 'metal_dark');
    for (const x of [-0.8, 0.8]) mb.box(x, 2.41, WZ + 0.02, 0.05, 0.3, 0.05, 'metal_grey');
    // a little conduit dropping out of the ceiling to it
    mb.box(0.9, 2.41, WZ + 0.03, 0.04, 0.29, 0.04, 'metal_grey', { color: 0x8a8a8a });
  },
});

defObj({
  key: 'zw_board_hanging', name: 'Departure Board', w: 2, d: 1, height: 0, block: 'none', ceiling: true,
  sound: 'metal', hp: 600, power: true,
  light: { color: 0xffa030, intensity: 0.3, radius: 3.5, y: 2.0, kind: 'screen', power: true, flicker: 0.02 },
  desc: 'A double-sided board hanging over the concourse. Both sides disagree.',
  tags: [...T, 'sign', 'ceiling', 'screens'],
  variant: (s) => String((s.v ?? 0) % ZW_BOARDS.length) + (s.unpowered ? 'x' : ''),
  model: (mb, s) => {
    const v = (s.v ?? 0) % ZW_BOARDS.length, v2 = (v + 1) % ZW_BOARDS.length, lit = !s.unpowered;
    mb.box(0, 1.78, 0, 1.96, 0.8, 0.2, { south: 'zw_board_' + v, north: 'zw_board_' + v2, all: 'metal_dark' }, { fit: { south: true, north: true }, emissive: lit ? 1.0 : 0.05 });
    mb.box(0, 2.58, 0, 2.0, 0.05, 0.22, 'metal_dark');
    for (const x of [-0.7, 0.7]) mb.box(x, 2.63, 0, 0.03, 0.1, 0.03, 'metal_grey');
  },
});

defObj({
  key: 'zw_platform_sign', name: 'Platform Sign', w: 2, d: 1, height: 0, block: 'none', ceiling: true,
  sound: 'metal', hp: 400,
  desc: 'White letters on transit blue. The number is correct for a station that does not exist.',
  tags: [...T, 'sign', 'ceiling'],
  variant: (s) => String(s.label ?? 'PLATFORM 0'),
  model: (mb, s) => {
    const i = Math.max(0, ZW_PLATFORM_LABELS.indexOf(String(s.label ?? 'PLATFORM 0')));
    const tex = 'zw_plat_' + i;
    mb.box(0, 2.05, 0, 1.9, 0.42, 0.05, { south: tex, north: tex, all: 'metal_dark' }, { fit: { south: true, north: true } });
    for (const x of [-0.8, 0.8]) mb.box(x, 2.47, 0, 0.02, 0.23, 0.02, 'metal_grey');
  },
});

defObj({
  key: 'zw_network_map', name: 'Network Map', w: 2, d: 1, height: 2.1, block: 'none', onWall: true,
  sound: 'glass', hp: 300,
  desc: 'Four lines. Every one of them comes back to where it started. The red dot says YOU ARE.',
  tags: [...T, 'sign', 'wall'],
  model: (mb) => {
    mb.box(0, 0.95, WZ + 0.035, 1.9, 1.2, 0.05, { south: 'zw_netmap', all: 'metal_brushed' }, { fit: { south: true } });
    mb.box(0, 0.93, WZ + 0.035, 1.96, 0.03, 0.07, 'metal_brushed'); mb.box(0, 2.15, WZ + 0.035, 1.96, 0.03, 0.07, 'metal_brushed');
  },
});

defObj({
  key: 'zw_timetable', name: 'Timetable', height: 1.8, block: 'none', onWall: true,
  sound: 'glass', hp: 200,
  desc: 'A printed timetable behind scratched perspex. One row has been crossed out in red by hand, many times.',
  tags: [...T, 'sign', 'wall'],
  model: (mb) => {
    mb.box(0, 0.75, WZ + 0.03, 0.72, 1.0, 0.04, { south: 'zw_timetable', all: 'metal_dark' }, { fit: { south: true } });
    mb.box(0, 1.75, WZ + 0.05, 0.76, 0.03, 0.03, 'metal_dark');
  },
});

defObj({
  key: 'zw_station_clock', name: 'Station Clock', height: 0, block: 'none', ceiling: true,
  sound: 'metal', hp: 300,
  desc: 'A double-faced station clock. Both faces are perfectly clean. Neither has hands.',
  tags: [...T, 'clock', 'ceiling'],
  model: (mb) => {
    mb.box(0, 2.45, 0, 0.03, 0.25, 0.03, 'metal_dark');
    mb.cylinderZ(0, 2.18, 0, 0.27, 0.12, 14, { sides: 'metal_dark', all: 'zw_clockface' }, { caps: true, fit: true } as any);
  },
});

// ============================================================ seating, bins, poles
defObj({
  key: 'zw_bench_steel', name: 'Steel Bench', w: 2, d: 1, height: 0.82, block: 'low', sit: true, movable: 55,
  sound: 'metal', hp: 320, flammable: 0,
  disassemble: { tools: ['#wrench'], time: 18, skill: 'mechanics', yields: [['scrap_metal', 2, 5], ['screws', 2, 6]] },
  desc: 'Perforated steel, three seats, armrests so nobody can lie down. Someone has.',
  tags: [...T, 'sit', 'bench'],
  model: (mb) => {
    const z0 = -0.02;
    for (const x of [-0.8, 0, 0.8]) { legsBolt(mb, x, z0 - 0.12, 0.42); legsBolt(mb, x, z0 + 0.12, 0.42); mb.box(x, 0.4, z0, 0.06, 0.04, 0.42, 'metal_grey', { color: 0x9aa0a4 }); }
    mb.box(0, 0.44, z0, 1.94, 0.025, 0.42, 'zw_perf');
    mb.push().translate(0, 0.46, z0 - 0.22).rotateX(-0.18); mb.box(0, 0, 0, 1.94, 0.36, 0.025, 'zw_perf'); mb.pop();
    for (const x of [-0.97, -0.32, 0.32, 0.97]) {
      mb.box(x, 0.46, z0 + 0.02, 0.04, 0.2, 0.04, 'metal_grey', { color: 0xb0b4b8 });
      mb.box(x, 0.64, z0 - 0.04, 0.05, 0.03, 0.36, 'metal_grey', { color: 0xb0b4b8 });
    }
    // a newspaper left folded on one seat, and gum
    mb.box(0.55, 0.465, z0 + 0.05, 0.28, 0.02, 0.2, 'paper', { color: 0xd8d4c4 });
    mb.box(-0.4, 0.466, z0 + 0.1, 0.03, 0.004, 0.03, 'plastic_white', { color: 0xd8a0b0 });
  },
});

defObj({
  key: 'zw_stop_pole', name: 'Bus Stop', height: 2.6, block: 'low', movable: 0,
  sound: 'metal', hp: 400,
  desc: 'A stop flag on a pole. STOP 0 — ALL SERVICES. Below it, the timetable case is empty except for a moth.',
  tags: [...T, 'pole'],
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.04, 2.6, 8, 'metal_grey', { color: 0xb8bcc0 });
    mb.cylinder(0, 0, 0, 0.09, 0.05, 8, 'concrete');
    mb.box(0.2, 2.1, 0, 0.36, 0.42, 0.03, { south: 'zw_plat_4', north: 'zw_plat_4', all: 'plastic_white' }, { fit: { south: true, north: true } });
    mb.box(0, 1.1, 0.06, 0.32, 0.46, 0.06, { south: 'zw_timetable', all: 'metal_dark' }, { fit: { south: true } });
    // litter bin clipped to the pole
    mb.cylinder(0, 0.5, -0.12, 0.13, 0.4, 10, 'zw_perf', { rTop: 0.14 });
    mb.cylinder(0, 0.5, -0.12, 0.11, 0.02, 10, 'plastic_black');
  },
});

defObj({
  key: 'zw_turnstile', name: 'Turnstile', height: 1.05, block: 'low', movable: 0,
  sound: 'metal', hp: 500,
  disassemble: { tools: ['#wrench', '#screwdriver'], time: 30, skill: 'mechanics', yields: [['scrap_metal', 3, 6], ['electronics_scrap', 1, 2], ['screws', 2, 6]] },
  desc: 'A three-arm turnstile. The light says green. The arms will not move either way.',
  tags: [...T, 'gate'],
  model: (mb) => {
    mb.box(-0.36, 0, 0, 0.22, 0.98, 0.7, 'metal_brushed');
    mb.box(-0.36, 0.98, 0, 0.26, 0.04, 0.74, 'metal_dark');
    mb.box(-0.36, 0.86, 0.36, 0.1, 0.06, 0.012, 'led_green', { emissive: 1.4 });
    mb.box(-0.24, 0.8, 0.0, 0.03, 0.1, 0.3, 'plastic_black');
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      mb.push().translate(-0.24, 0.82, 0).rotateX(a).rotateZ(-0.6);
      mb.cylinder(0, 0, 0, 0.022, 0.52, 6, 'chrome'); mb.pop();
    }
    mb.cylinderX(-0.22, 0.82, 0, 0.05, 0.08, 8, 'chrome');
  },
});

defObj({
  key: 'zw_buffer_stop', name: 'Buffer Stop', w: 2, d: 1, height: 1.2, block: 'solid', movable: 0,
  sound: 'metal', hp: 2000,
  desc: 'The end of the line, painted red and white. Something has hit it hard from the other side.',
  tags: [...T, 'rail', 'fixed'],
  model: (mb) => {
    mb.box(0, 0, -0.1, 1.7, 0.12, 0.7, 'concrete');
    for (const x of [-0.6, 0.6]) {
      mb.push().translate(x, 0.1, -0.1).rotateX(0.5); mb.box(0, 0, 0, 0.12, 0.9, 0.12, 'metal_rusty'); mb.pop();
      mb.box(x, 0.1, -0.35, 0.12, 0.85, 0.12, 'metal_rusty');
    }
    mb.box(0, 0.78, 0.2, 1.8, 0.28, 0.14, { south: 'zw_hazard_tape', all: 'plastic_red' }, { fit: { south: true }, color: 0xffffff });
    for (const x of [-0.6, 0.6]) {
      mb.cylinderZ(x, 0.86, 0.33, 0.09, 0.12, 10, 'metal_dark', { caps: true });
      mb.cylinderZ(x, 0.86, 0.42, 0.14, 0.04, 12, 'metal_grey', { caps: true });
    }
    // the dent
    mb.box(0.62, 0.84, 0.45, 0.16, 0.12, 0.02, 'metal_rusty', { color: 0x6a4a3a });
  },
});

// ============================================================ luggage
defObj({
  key: 'zw_luggage_pile', name: 'Lost Luggage', height: 1.05, block: 'low', movable: 35,
  container: { capacity: 30, kind: 'trunk', loot: 'zw_luggage' },
  sound: 'fabric', hp: 160, flammable: 0.6,
  disassemble: { tools: ['#knife'], time: 10, yields: [['rag', 2, 5], ['leather_strips', 0, 2]] },
  desc: 'Suitcases stacked by somebody tidy. Every tag has the same handwriting, and every tag says HOME.',
  tags: [...T, 'luggage', 'container'],
  variant: (s) => String((s.v ?? 0) % 4),
  model: (mb, s) => {
    const v = (s.v ?? 0) % 4;
    const c = (k: number) => CASE_COLS[(v * 3 + k) % CASE_COLS.length];
    suitcase(mb, -0.05, 0, 0.02, 0.72, 0.26, 0.5, c(0), v % 2 === 0, 0.08);
    suitcase(mb, 0.02, 0.26, 0.0, 0.62, 0.22, 0.44, c(1), v % 2 === 1, -0.15);
    suitcase(mb, -0.04, 0.48, 0.03, 0.46, 0.18, 0.34, c(2), true, 0.3, false);
    if (v !== 2) suitcase(mb, 0.0, 0.66, 0.02, 0.36, 0.3, 0.14, c(3), false, -0.4);
    // a holdall slumped against the stack
    mb.push().translate(0.33, 0, 0.28).rotateY(0.6);
    mb.cylinderX(0, 0.13, 0, 0.13, 0.46, 8, 'zw_case_soft', { color: c(4), caps: true });
    mb.box(0, 0.26, 0, 0.3, 0.02, 0.03, 'leather_brown'); mb.pop();
  },
});

defObj({
  key: 'zw_suitcase', name: 'Suitcase', height: 0.3, block: 'none', movable: 14,
  container: { capacity: 18, kind: 'trunk', loot: 'zw_luggage' },
  sound: 'fabric', hp: 80, flammable: 0.6,
  desc: 'A suitcase on its side. The name tag is blank. The clothes inside are folded the way you fold yours.',
  tags: [...T, 'luggage', 'container'],
  variant: (s) => String((s.v ?? 0) % 6),
  model: (mb, s) => {
    const v = (s.v ?? 0) % 6;
    suitcase(mb, 0, 0, 0, 0.7, 0.24, 0.48, CASE_COLS[v % CASE_COLS.length], v % 2 === 0, (v - 3) * 0.25);
    if (v === 5) { // burst open, a sleeve hanging out
      mb.box(0.1, 0.24, 0.26, 0.2, 0.03, 0.12, 'fabric_blue', { color: 0xc8c8d0 });
    }
  },
});

defObj({
  key: 'zw_luggage_trolley', name: 'Luggage Trolley', height: 1.1, block: 'low', movable: 30,
  container: { capacity: 24, kind: 'trunk', loot: 'zw_luggage' },
  sound: 'metal', hp: 200,
  disassemble: { tools: ['#wrench'], time: 12, skill: 'mechanics', yields: [['scrap_metal', 2, 4], ['pipe', 1, 2]] },
  desc: 'A station trolley with one wheel that will not touch the floor. Still loaded.',
  tags: [...T, 'luggage', 'cart', 'container'],
  model: (mb) => {
    const m = 'chrome';
    mb.box(0, 0.12, 0.05, 0.6, 0.03, 0.8, 'metal_grey', { color: 0xb8bcc0 });
    for (const sx of [-1, 1]) {
      mb.box(sx * 0.29, 0.12, -0.35, 0.03, 0.96, 0.03, m);
      mb.box(sx * 0.29, 0.12, 0.05, 0.03, 0.03, 0.8, m);
      mb.cylinderX(sx * 0.3, 0.07, 0.38, 0.07, 0.04, 8, 'rubber_black', { caps: true });
      mb.cylinderX(sx * 0.3, 0.07, -0.3, 0.07, 0.04, 8, 'rubber_black', { caps: true });
    }
    mb.box(0, 1.05, -0.35, 0.64, 0.035, 0.035, m);
    mb.box(0, 0.6, -0.35, 0.58, 0.02, 0.02, m);
    suitcase(mb, 0, 0.15, 0.08, 0.56, 0.24, 0.62, CASE_COLS[1], true, 0, false);
    suitcase(mb, 0.02, 0.39, 0.06, 0.48, 0.2, 0.5, CASE_COLS[3], false, 0.12);
  },
});

defObj({
  key: 'zw_lost_property', name: 'Lost Property Shelf', w: 2, d: 1, height: 2.0, block: 'solid', blocksSight: true, movable: 70,
  container: { capacity: 60, kind: 'shelf', loot: 'zw_lost_property' },
  sound: 'metal', hp: 380,
  disassemble: { tools: ['#wrench'], time: 20, skill: 'mechanics', yields: [['scrap_metal', 3, 6], ['screws', 2, 6]] },
  desc: 'Steel racking, each item labelled with a date. All the dates are the same date.',
  tags: [...T, 'shelf', 'luggage', 'container'],
  model: (mb) => {
    const zc = WZ + 0.26, m = 'metal_grey', mc = { color: 0x8a9aa8 };
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mb.box(sx * 0.95, 0, zc + sz * 0.22, 0.04, 2.0, 0.04, m, mc);
    for (const y of [0.08, 0.7, 1.32, 1.94]) mb.box(0, y, zc, 1.94, 0.03, 0.5, 'metal_sheet', mc);
    suitcase(mb, -0.5, 0.11, zc, 0.7, 0.24, 0.44, CASE_COLS[0], true, 0, true);
    suitcase(mb, 0.42, 0.11, zc, 0.6, 0.3, 0.4, CASE_COLS[2], false, 0.1, true);
    suitcase(mb, 0.45, 0.41, zc, 0.5, 0.18, 0.36, CASE_COLS[5], true, -0.1, false);
    // umbrellas, a hat box, a child's backpack
    for (let i = 0; i < 5; i++) { mb.push().translate(-0.7 + i * 0.08, 0.73, zc + 0.1).rotateZ(0.12 * (i - 2)); mb.cylinder(0, 0, 0, 0.025, 0.6, 5, 'fabric_grey', { color: [0x2a2a2e, 0x7a2a2a, 0x2a3a6a, 0x4a4a2a, 0x2a2a2e][i] }); mb.pop(); }
    mb.cylinder(0.1, 0.73, zc, 0.16, 0.22, 10, 'cardboard', { color: 0xd8b0b8 });
    mb.box(0.62, 0.73, zc, 0.3, 0.36, 0.2, 'fabric_red', { color: 0xf0c040 });
    mb.box(-0.4, 1.35, zc, 0.5, 0.2, 0.36, 'cardboard');
    mb.box(0.35, 1.35, zc, 0.62, 0.3, 0.4, 'zw_case_soft', { color: CASE_COLS[3] });
    for (let i = 0; i < 6; i++) mb.box(-0.85 + i * 0.07, 1.35 + 0.31, zc + 0.24, 0.05, 0.08, 0.004, 'zw_tag', { fit: true });
  },
});

// ============================================================ ticket booth / machine / newsstand
defObj({
  key: 'zw_ticket_booth', name: 'Ticket Booth', w: 3, d: 2, height: 2.6, block: 'solid', blocksSight: true, tall: true, movable: 0,
  sound: 'metal', hp: 1500, power: true,
  light: { color: 0xffe0b0, intensity: 0.55, radius: 3.4, y: 1.9, kind: 'lamp', power: true, flicker: 0.04 },
  desc: 'A glass-fronted ticket office. A blind is half down. Behind it a desk lamp is on, and a chair is still turning.',
  tags: [...T, 'booth', 'kiosk', 'tickets'],
  model: (mb) => {
    const W = 2.9, D = 1.9;
    // plinth, back + sides
    mb.box(0, 0, 0, W, 0.1, D, 'concrete');
    mb.box(0, 0.1, -D / 2 + 0.06, W, 2.4, 0.12, 'zw_perf', { color: 0xb8a890 });
    for (const sx of [-1, 1]) mb.box(sx * (W / 2 - 0.06), 0.1, 0, 0.12, 2.4, D, 'metal_painted_green', { color: 0x9aa890 });
    // front: low counter wall, then glass up to the fascia
    mb.box(0, 0.1, D / 2 - 0.06, W, 1.0, 0.12, 'wood_dark', { color: 0x8a6a4a });
    mb.box(0, 1.1, D / 2 - 0.02, W - 0.1, 0.05, 0.36, 'wood_dark', { color: 0xc8a888 }); // counter ledge
    mb.box(0, 1.15, D / 2 - 0.06, W - 0.24, 1.0, 0.02, 'glass', { color: 0xb8d0d8 });
    for (const x of [-0.95, 0, 0.95]) mb.box(x, 1.15, D / 2 - 0.06, 0.05, 1.0, 0.06, 'metal_dark');
    // speaking grilles and the money trays under each window
    for (const x of [-0.48, 0.48]) {
      mb.cylinderZ(x, 1.45, D / 2 - 0.03, 0.07, 0.02, 10, 'zw_perf', { caps: true });
      mb.box(x, 1.12, D / 2 + 0.06, 0.32, 0.03, 0.14, 'metal_brushed');
    }
    // the blind half down on the left window
    mb.box(-0.48, 1.62, D / 2 - 0.09, 0.9, 0.52, 0.01, 'paper', { color: 0xd8d0b8 });
    mb.box(0, 2.15, D / 2 - 0.02, W, 0.36, 0.14, { south: 'zw_tickets', all: 'metal_dark' }, { fit: { south: true } });
    mb.box(0, 2.5, 0, W + 0.06, 0.1, D + 0.06, 'metal_dark');
    // inside: desk, lamp, stool, ticket printer
    mb.box(0, 0.1, D / 2 - 0.45, W - 0.3, 0.72, 0.5, 'wood_dark', { color: 0x9a8a7a });
    mb.box(0.75, 0.82, D / 2 - 0.45, 0.3, 0.18, 0.28, 'plastic_beige');
    mb.box(0.75, 1.0, D / 2 - 0.38, 0.06, 0.08, 0.05, 'paper', { color: 0xf0e8c8 });
    mb.cylinder(-0.8, 0.82, D / 2 - 0.5, 0.06, 0.02, 8, 'metal_dark');
    mb.box(-0.8, 0.84, D / 2 - 0.5, 0.02, 0.3, 0.02, 'metal_dark');
    mb.cylinder(-0.75, 1.1, D / 2 - 0.45, 0.04, 0.1, 8, 'metal_painted_green', { rTop: 0.1, emissive: 0.3 });
    mb.push().translate(0.1, 0.1, -0.15).rotateY(0.7);
    mb.cylinder(0, 0, 0, 0.03, 0.5, 6, 'metal_dark'); mb.cylinder(0, 0.5, 0, 0.2, 0.06, 10, 'leather_black'); mb.pop();
    // a rack of blank tickets on the back wall
    for (let i = 0; i < 6; i++) mb.box(-1.1 + i * 0.16, 1.3, -D / 2 + 0.14, 0.12, 0.2, 0.04, 'paper', { color: i % 2 ? 0xf0e0a0 : 0xe0f0d0 });
  },
});

defObj({
  key: 'zw_ticket_machine', name: 'Ticket Machine', height: 1.75, block: 'solid', movable: 120, power: true, hum: 'computer',
  light: { color: 0x60f080, intensity: 0.2, radius: 1.8, y: 1.3, kind: 'screen', power: true, flicker: 0.05 },
  container: { capacity: 10, kind: 'safe', loot: 'zw_coin_box' },
  sound: 'metal', hp: 450,
  disassemble: { tools: ['#screwdriver', '#wrench'], time: 30, skill: 'electrical', yields: [['electronics_scrap', 2, 4], ['scrap_metal', 2, 4], ['coins', 1, 4]] },
  desc: 'SELECT DESTINATION. The keypad has numbers. The screen wants a place.',
  tags: [...T, 'machine', 'tickets', 'electronics'],
  model: (mb) => {
    mb.box(0, 0, -0.05, 0.62, 0.08, 0.5, 'metal_dark');
    mb.box(0, 0.08, -0.05, 0.6, 1.6, 0.46, 'metal_painted_green', { color: 0x6a7aa8 });
    mb.box(0, 0.12, 0.185, 0.56, 1.5, 0.02, 'zw_tvm', { fit: true, emissive: 0.25 });
    mb.box(0, 1.68, -0.02, 0.64, 0.08, 0.54, 'metal_dark');
    mb.box(0, 1.15, 0.2, 0.42, 0.3, 0.012, 'glass_dark', { emissive: 0.2 });
  },
});

defObj({
  key: 'zw_newsstand', name: 'Newsstand', w: 2, d: 1, height: 2.3, block: 'solid', blocksSight: true, movable: 0,
  container: { capacity: 40, kind: 'shelf', loot: 'zw_newsstand' },
  sound: 'metal', hp: 700, flammable: 0.4,
  disassemble: { tools: ['#crowbar'], time: 25, yields: [['scrap_metal', 3, 6], ['newspaper', 2, 6], ['plank', 1, 3]] },
  desc: 'Shuttered. The headline pinned to the board outside is about a bus that left on time.',
  tags: [...T, 'kiosk', 'container'],
  model: (mb) => {
    mb.box(0, 0, -0.05, 1.96, 2.2, 0.82, 'metal_painted_green', { color: 0x4a7a5a });
    mb.box(0, 1.5, 0.37, 1.9, 0.75, 0.02, 'zw_newsstand', { fit: true });
    mb.box(0, 0.05, 0.37, 1.9, 1.43, 0.04, 'metal_grey', { color: 0x9a9a94 });
    for (let y = 0.15; y < 1.45; y += 0.1) mb.box(0, y, 0.395, 1.88, 0.012, 0.01, 'metal_dark');
    mb.box(0, 2.2, 0.02, 2.06, 0.08, 0.98, 'metal_dark');
    // the A-board outside with the headline
    mb.push().translate(0.7, 0, 0.55).rotateX(0.18);
    mb.box(0, 0, 0, 0.42, 0.7, 0.03, 'paper', { color: 0xf0ecdc }); mb.pop();
    mb.box(0.7, 0.55, 0.585, 0.36, 0.1, 0.005, 'plastic_black');
  },
});

// ============================================================ the coach
defObj({
  key: 'zw_coach', name: 'Coach', w: 3, d: 11, height: 3.2, block: 'solid', blocksSight: true, tall: true, movable: 0,
  container: { capacity: 80, kind: 'trunk', loot: 'zw_luggage', name: 'Luggage Hold' },
  sound: 'metal', hp: 5000, flammable: 0.3,
  desc: 'A 1990 touring coach, NOT IN SERVICE. The seats are full of folded coats. The engine is warm.',
  tags: [...T, 'vehicle', 'container'],
  model: (mb) => {
    const W = 2.5, L = 10.6, z0 = -L / 2, z1 = L / 2;
    // body: front faces +z
    mb.box(0, 0.42, 0, W, 2.55, L, { sides: 'zw_coach_side', top: 'metal_grey', south: 'zw_coach_front', north: 'zw_coach_side' }, { fit: { south: true } });
    mb.box(0, 2.97, 0, W - 0.16, 0.12, L - 0.2, 'metal_grey', { color: 0xd8d0c0 });
    // window band down both sides
    for (const sx of [-1, 1]) {
      mb.box(sx * (W / 2 + 0.005), 1.5, -0.4, 0.01, 1.1, L - 2.0, 'zw_coach_window', { emissive: 0.05 });
      for (let k = 0; k < 8; k++) mb.box(sx * (W / 2 + 0.012), 1.5, z0 + 1.2 + k * 1.2, 0.012, 1.1, 0.08, 'metal_dark');
      // wheel arches + wheels
      for (const wz of [z1 - 2.1, z0 + 2.6, z0 + 1.4]) {
        mb.box(sx * (W / 2 + 0.005), 0.42, wz, 0.012, 0.7, 1.1, 'metal_dark', { color: 0x1a1a1a });
        mb.cylinderX(sx * (W / 2 - 0.12), 0.48, wz, 0.48, 0.3, 12, 'rubber_black', { caps: true });
        mb.cylinderX(sx * (W / 2 + 0.03), 0.48, wz, 0.2, 0.02, 10, 'metal_grey', { caps: true, color: 0x8a8a88 });
      }
      // luggage hold doors
      for (let k = 0; k < 3; k++) mb.box(sx * (W / 2 + 0.008), 0.55, z0 + 3.6 + k * 1.45, 0.01, 0.6, 1.35, 'metal_grey', { color: 0xd0c4b0 });
    }
    // the door on the right side (east) near the front, open a crack
    mb.box(W / 2 + 0.012, 0.45, z1 - 1.0, 0.014, 2.3, 0.9, 'zw_coach_window', { emissive: 0.05 });
    // front details: bumper, mirrors, destination box
    mb.box(0, 0.25, z1 + 0.05, W + 0.06, 0.3, 0.12, 'metal_dark');
    for (const sx of [-1, 1]) { mb.box(sx * (W / 2 + 0.2), 2.2, z1 - 0.2, 0.04, 0.04, 0.3, 'metal_dark'); mb.box(sx * (W / 2 + 0.24), 1.8, z1 - 0.06, 0.06, 0.4, 0.22, 'metal_dark'); }
    // rear: engine grille, tail lights
    mb.box(0, 0.6, z0 - 0.01, W - 0.4, 0.9, 0.02, 'zw_perf', { color: 0x5a5a5a });
    for (const sx of [-1, 1]) mb.box(sx * (W / 2 - 0.2), 0.9, z0 - 0.015, 0.18, 0.4, 0.02, 'plastic_red', { emissive: 0.2 });
  },
});
void bayer; void rod;

// ============================================================ structure: pillars, track
defObj({
  key: 'zw_depot_pillar', name: 'Pillar', height: 2.7, block: 'solid', movable: 0,
  sound: 'ceramic', hp: 99999,
  desc: 'A tiled pillar with a bay number on it. Chewing gum, a lost-dog flyer, a scorch mark at shoulder height.',
  tags: [...T, 'column', 'fixed'],
  variant: (s) => String(s.label ?? ''),
  model: (mb, s) => {
    mb.box(0, 0, 0, 0.7, 2.7, 0.7, { sides: 'zw_wall_depot', top: 'wall_top_concrete' }, {});
    mb.box(0, 0, 0, 0.76, 0.08, 0.76, 'concrete', { color: 0x6a6458 });
    const L = String(s.label ?? '');
    const i = ZW_PLATFORM_LABELS.indexOf(L);
    if (i >= 0) for (const [rz, ry] of [[0.352, 0], [-0.352, Math.PI]] as const) {
      mb.push().translate(0, 0, 0).rotateY(ry);
      mb.box(0, 1.9, Math.abs(rz), 0.68, 0.16, 0.01, 'zw_plat_' + i, { fit: true }); mb.pop();
    }
  },
});

defObj({
  key: 'zw_track', name: 'Track', height: 0.2, block: 'solid', movable: 0,
  sound: 'metal', hp: 99999,
  desc: 'Rails on timber sleepers, polished bright on top. Something uses them. You have never heard it.',
  tags: [...T, 'rail', 'fixed'],
  variant: (s) => String((s.v ?? 0) % 2),
  model: (mb, s) => {
    const v = (s.v ?? 0) % 2;
    mb.box(0, 0, 0, 1.0, 0.06, 0.96, 'gravel', { color: 0x8a8478 });
    for (let k = 0; k < 2; k++) mb.box(-0.25 + k * 0.5, 0.06, 0, 0.18, 0.06, 0.92, 'wood_crate', { color: 0x6a5a48 });
    for (const z of [-0.3, 0.3]) {
      mb.box(0, 0.12, z, 1.0, 0.07, 0.05, 'metal_rusty', { color: 0x8a6a5a });
      mb.box(0, 0.19, z, 1.0, 0.012, 0.04, 'chrome', { color: 0xd8d8d8 });
    }
    if (v === 1) mb.box(0.1, 0.06, 0.1, 0.2, 0.04, 0.3, 'paper', { color: 0xd8d0b8 }); // something dropped
  },
});
