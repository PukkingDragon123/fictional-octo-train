// The Halcyon, third floor (src/world/gen/z_hotel.ts): a grand old hotel corridor
// that runs all the way round and back to where it started. The materials: the
// corridor carpet (a teal ground with gold and crimson medallions, worn into
// paths down the middle), the plush rose carpet of the rooms, the marble of the
// lift lobby with its brass inlay, white hex tile in the bathrooms, the damask
// corridor paper over a mahogany wainscot, sage pinstripe in the rooms, walnut
// panelling round the lifts, mint paint in the staff core, and the coffered
// plaster ceiling (first person). The fixtures: brass tulip sconces, brass room
// numbers, room-service trolleys under their cloches, the brass luggage cart,
// the ice machine, trays left outside doors, the key rack, linen shelving,
// laundry washers and hampers, the fire-hose cabinet, the lift call panel, the
// lobby chandelier, and the decal the corridor's inhabitant leaves: two long
// scuffs in the pile where something heavy is dragged round and round.
// Texture prefix: ht_
import { defObj } from '../../world/objects';
import { defFloor, wallpaperId } from '../../world/defs';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { WALL_PX } from '../../gfx/textures/lobby';
import { FLOOR_GLOSS } from '../../gfx/wetmap';
import { makeRamp, mixHex, ph, tileFbm, bayer } from './b_common';
import type { PixelCanvas } from '../../gfx/pixel';

const T = ['hotel', 'ht'];
/** the Halcyon's palette */
export const HT = {
  teal: 0x1f5a5c, tealD: 0x123a3c, gold: 0xd8a640, goldL: 0xf2d07a, crimson: 0x9a2a2e, cream: 0xefe2c4, rose: 0xc88a84,
  sage: 0x9aae8e, walnut: 0x5a3622, mahog: 0x6a2a1e, brass: 0xc8a050, mint: 0xb8d8c4, marble: 0xf0ebe0,
};

// ---------------------------------------------------------------- floors
defFloor({ key: 'ht_carpet', name: 'Corridor Carpet', tex: ['ht_carpet', 'ht_carpet_b', 'ht_carpet_c'], sound: 'carpet', flammable: 0.5 });
defFloor({ key: 'ht_room', name: 'Plush Carpet', tex: ['ht_room', 'ht_room_b'], sound: 'carpet', flammable: 0.6, rotate: true });
defFloor({ key: 'ht_marble', name: 'Lobby Marble', tex: ['ht_marble', 'ht_marble_b'], sound: 'tile' });
defFloor({ key: 'ht_hex', name: 'Bathroom Hex Tile', tex: ['ht_hex'], sound: 'tile' });
FLOOR_GLOSS.ht_marble = 0.55; FLOOR_GLOSS.ht_hex = 0.35;
/** the Halcyon's wallpapers (z_hotel.ts papers its rooms with these) */
export const HT_PAPERS = { hall: 'ht_paper_hall', room: 'ht_paper_room', lift: 'ht_paper_lift', bath: 'ht_paper_bath', staff: 'ht_paper_staff' };
for (const p of Object.values(HT_PAPERS)) wallpaperId(p);
/** the coffered plaster ceiling the first-person eye sees (z.env.ceilTex) */
export const HT_CEIL = 'ht_ceil';

// ---------------------------------------------------------------- floor textures
/** the corridor carpet: a teal ground, an octagon lattice of gold rope, crimson medallions, a worn path down the middle */
function corridorCarpet(pc: PixelCanvas, v: number) {
  const W = pc.w, H = pc.h;
  const G = makeRamp(HT.teal, 6, { spread: 0.3, hueShift: 0.02 });
  const Au = makeRamp(HT.gold, 5, { spread: 0.35 });
  const Cr = makeRamp(HT.crimson, 5, { spread: 0.3 });
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const n = tileFbm(x, y, W, H, 4, 2, 7101 + v) * 0.55 + ph(x, y, 7103 + v) * 0.45;
    // the lattice: an octagon/diamond net every 16 px
    const lx = x % 16, ly = y % 16, cx = lx - 7.5, cy = ly - 7.5;
    const oct = Math.max(Math.abs(cx), Math.abs(cy), (Math.abs(cx) + Math.abs(cy)) * 0.72);
    let c = G[n < 0.3 ? 1 : n < 0.62 ? 2 : n < 0.88 ? 3 : 4];
    if (oct > 6.6 && oct < 7.8) c = Au[(x + y) % 3 === 0 ? 3 : 2];                 // gold rope
    else if (oct < 2.2) c = Cr[oct < 1.1 ? 3 : 2];                                  // crimson boss
    else if (oct > 3.2 && oct < 4.1 && (Math.abs(cx) < 0.6 || Math.abs(cy) < 0.6)) c = Au[1]; // little gold spokes
    else if (oct > 3.2 && oct < 3.9) c = mixHex(c, HT.tealD, 0.45);
    // the corner diamonds between octagons
    const dx = Math.abs(lx - (lx < 8 ? -0.5 : 15.5)), dy = Math.abs(ly - (ly < 8 ? -0.5 : 15.5));
    if (dx + dy < 3.2) c = dx + dy < 1.6 ? Au[3] : Cr[1];
    pc.set(x, y, c);
  }
  // pile: a little crosswise texture
  for (let y = 0; y < H; y += 2) for (let x = (y >> 1) & 1; x < W; x += 3) pc.blend(x, y, 0x000000, 0.06);
  // worn: the middle of the corridor gone grey-green, a shine of crushed pile
  if (v === 1) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const k = 1 - Math.abs(x + 0.5 - W / 2) / (W / 2); if (bayer(x, y) < k * 0.45) pc.blend(x, y, 0x8a9a88, 0.28); }
  if (v === 2) pc.stain(10 + Math.floor(ph(1, 2, 7111) * 12), 18, 5, 0x5a3a2a, 0x3a2418, 7113);
}
/** the rooms' carpet: plush dusky rose, a faint trellis, flattened where the bed was moved */
function roomCarpet(pc: PixelCanvas, v: number) {
  const W = pc.w, H = pc.h;
  const R = makeRamp(HT.rose, 6, { spread: 0.22, hueShift: 0.02 });
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const n = tileFbm(x, y, W, H, 3, 3, 7121 + v) * 0.5 + ph(x, y, 7123 + v) * 0.5;
    let c = R[n < 0.25 ? 1 : n < 0.6 ? 2 : n < 0.9 ? 3 : 4];
    if ((x + y) % 8 === 0 || (x - y + 64) % 8 === 0) c = mixHex(c, R[0], 0.3);
    pc.set(x, y, c);
  }
  if (v === 1) for (let i = 0; i < 10; i++) pc.blend(Math.floor(ph(i, 3, 7131) * W), Math.floor(ph(i, 4, 7131) * H), 0x6a3a3a, 0.35);
}
/** the lift lobby's marble: cream with grey veins, big slabs, a brass inlay line */
function marbleFloor(pc: PixelCanvas, v: number) {
  const W = pc.w, H = pc.h;
  const M = makeRamp(HT.marble, 5, { spread: 0.12 });
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const n = tileFbm(x, y, W, H, 3, 3, 7141 + v);
    const vein = Math.abs(Math.sin((x * 0.21 + y * 0.13) + n * 7.5));
    let c = M[2 + (n > 0.62 ? 1 : 0) - (n < 0.3 ? 1 : 0)];
    if (vein < 0.08) c = mixHex(c, 0x8a8478, 0.55); else if (vein < 0.16) c = mixHex(c, 0xb0a898, 0.35);
    if (x === 0 || y === 0) c = mixHex(c, 0x9a9080, 0.4);              // slab joints
    if (v === 1 && (x === 3 || y === 3)) c = mixHex(HT.brass, 0xfff0c0, (x + y) % 5 === 0 ? 0.35 : 0); // the brass inlay
    pc.set(x, y, c);
  }
  pc.set(Math.floor(ph(1, 1, 7149 + v) * W), Math.floor(ph(2, 1, 7149 + v) * H), 0xffffff);
}
/** bathroom floor: small white hexagons, grey grout, one black hex in a rosette */
function hexTile(pc: PixelCanvas) {
  const W = pc.w, H = pc.h;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const row = Math.floor(y / 4), ox = (row & 1) ? 2 : 0;
    const lx = (x + ox) % 4, ly = y % 4;
    const grout = ly === 0 || lx === 0 || (ly === 1 && lx === 3) || (ly === 3 && lx === 3);
    const cell = Math.floor((x + ox) / 4) + row * 9;
    const dark = cell % 23 === 0;
    let c = grout ? 0xa8aca8 : dark ? 0x2a2a2e : mixHex(0xf4f2ec, 0xdedad0, ph(cell, 1, 7151) * 0.6);
    if (!grout && ly === 1 && lx === 1) c = mixHex(c, 0xffffff, 0.5);
    pc.set(x, y, c);
  }
}

// ---------------------------------------------------------------- wallpaper textures (32 x WALL_PX, 2.7 m)
const WH = WALL_PX;
const yAt = (m: number) => Math.round(WH - m * 32);
/** a damask flower (mirrored), cx/cy centre, s scale */
function damask(pc: PixelCanvas, cx: number, cy: number, c: number, hi: number) {
  const pts: [number, number][] = [
    [0, -6], [0, -5], [1, -5], [0, -4], [1, -4], [2, -4], [1, -3], [2, -2], [3, -2], [3, -1], [2, 0], [1, 0], [0, 1], [1, 1], [2, 2], [3, 2], [4, 3], [3, 4],
    [1, 3], [0, 4], [0, 5], [1, 6], [0, 7], [2, 5], [4, 0], [5, -1], [4, -3], [5, 1],
  ];
  for (const [dx, dy] of pts) for (const s of [-1, 1]) {
    const x = cx + dx * s, y = cy + dy;
    pc.set(((x % 32) + 32) % 32, y, dy < -3 || dx === 0 ? hi : c);
  }
}
/** the corridor: cream and gold damask above, a walnut dado rail at 0.9 m, mahogany raised panels below, a black skirting */
function hallPaper(pc: PixelCanvas, v: number) {
  const C = makeRamp(HT.cream, 5, { spread: 0.14, hueShift: 0.01 });
  const dado = yAt(0.92), dadoTop = dado - 3;
  for (let y = 0; y < dadoTop; y++) for (let x = 0; x < 32; x++) {
    const n = tileFbm(x, y, 32, WH, 3, 2, 7201 + v);
    pc.set(x, y, C[2 + (n > 0.7 ? 1 : 0) - (n < 0.25 ? 1 : 0)]);
  }
  // two staggered rows of damask in a deeper cream, picked out in gold
  for (let r = 0; r < 4; r++) damask(pc, (r & 1) ? 0 : 16, 10 + r * 14, mixHex(HT.cream, 0xb89a68, 0.55), mixHex(HT.gold, 0xffffff, 0.15));
  // the crown: a picture rail and a gilt band just under the ceiling
  for (let x = 0; x < 32; x++) { pc.set(x, 2, HT.walnut); pc.set(x, 3, mixHex(HT.walnut, 0xffffff, 0.25)); pc.set(x, 4, (x % 4 === 0) ? HT.gold : mixHex(HT.gold, HT.cream, 0.5)); }
  // the dado rail
  for (let x = 0; x < 32; x++) { pc.set(x, dadoTop, mixHex(HT.walnut, 0xffffff, 0.3)); pc.set(x, dadoTop + 1, HT.walnut); pc.set(x, dadoTop + 2, mixHex(HT.walnut, 0x000000, 0.35)); }
  // the wainscot: one raised mahogany panel per metre, bevel lit from above
  const M = makeRamp(HT.mahog, 5, { spread: 0.26 });
  for (let y = dadoTop + 3; y < WH; y++) for (let x = 0; x < 32; x++) {
    const grain = Math.sin(y * 0.9 + Math.sin(x * 0.3) * 1.2 + v) * 0.5 + 0.5;
    let c = M[2 + (grain > 0.75 ? 1 : 0) - (grain < 0.15 ? 1 : 0)];
    const py = y - (dadoTop + 3), ph2 = WH - 6 - (dadoTop + 3);
    const inPanel = x >= 4 && x <= 27 && py >= 3 && py <= ph2 - 3;
    if (inPanel && (x === 4 || py === 3)) c = M[4];
    else if (inPanel && (x === 27 || py === ph2 - 3)) c = M[0];
    else if (inPanel) c = mixHex(c, M[3], 0.25);
    pc.set(x, y, c);
  }
  // the skirting
  for (let y = WH - 6; y < WH; y++) for (let x = 0; x < 32; x++) pc.set(x, y, y === WH - 6 ? 0x4a3a32 : 0x1e1816);
  // age: a scuff line where trolleys have run along it, a little lift at a seam
  for (let x = 0; x < 32; x++) if (bayer(x, 3) < 0.5) pc.blend(x, WH - 14, 0x2a1a14, 0.35);
  if (v === 1) for (let y = 6; y < dadoTop - 2; y++) pc.blend(31, y, 0x8a7a5a, 0.35);
}
/** the rooms: sage green with a fine pinstripe, a picture rail, a white skirting */
function roomPaper(pc: PixelCanvas) {
  const S = makeRamp(HT.sage, 5, { spread: 0.14 });
  for (let y = 0; y < WH; y++) for (let x = 0; x < 32; x++) {
    const n = tileFbm(x, y, 32, WH, 3, 2, 7221);
    let c = S[2 + (n > 0.72 ? 1 : 0) - (n < 0.22 ? 1 : 0)];
    if (x % 8 === 0) c = mixHex(c, 0xf0f0e0, 0.35);
    if (x % 8 === 4) c = mixHex(c, S[0], 0.25);
    pc.set(x, y, c);
  }
  for (let x = 0; x < 32; x++) { pc.set(x, 9, 0xf2eee2); pc.set(x, 10, 0xc8c2b0); }
  for (let y = WH - 5; y < WH; y++) for (let x = 0; x < 32; x++) pc.set(x, y, y === WH - 5 ? 0xffffff : 0xe4e0d4);
}
/** the lift lobby: walnut panelling floor to ceiling with a brass strip at each seam */
function liftPaper(pc: PixelCanvas) {
  const R = makeRamp(HT.walnut, 6, { spread: 0.3 });
  for (let y = 0; y < WH; y++) for (let x = 0; x < 32; x++) {
    const g = Math.sin(x * 0.7 + Math.sin(y * 0.11) * 2.2) * 0.5 + 0.5;
    let c = R[2 + (g > 0.8 ? 2 : g > 0.55 ? 1 : 0) - (ph(x, y, 7231) < 0.08 ? 1 : 0)];
    if (x === 0) c = mixHex(HT.brass, 0xfff0c0, 0.25);
    if (x === 1) c = R[0];
    pc.set(x, y, c);
  }
  for (let x = 0; x < 32; x++) { pc.set(x, yAt(1.05), mixHex(HT.brass, 0xfff0c0, 0.3)); pc.set(x, yAt(1.05) + 1, R[0]); }
  for (let y = WH - 5; y < WH; y++) for (let x = 0; x < 32; x++) pc.set(x, y, 0x1a1210);
}
/** the bathrooms: white metro tile to 1.2 m, a black pencil tile, pale paint above */
function bathPaper(pc: PixelCanvas) {
  const top = yAt(1.25);
  for (let y = 0; y < top; y++) for (let x = 0; x < 32; x++) pc.set(x, y, mixHex(0xf2f0e8, 0xe4e0d4, tileFbm(x, y, 32, WH, 3, 2, 7241) * 0.7));
  for (let x = 0; x < 32; x++) { pc.set(x, top, 0x1a1a1e); pc.set(x, top + 1, 0x3a3a40); }
  for (let y = top + 2; y < WH; y++) for (let x = 0; x < 32; x++) {
    const row = Math.floor((y - top - 2) / 4), ly = (y - top - 2) % 4, lx = (x + (row & 1 ? 4 : 0)) % 8;
    let c = 0xf8f8f4;
    if (ly === 0 || lx === 0) c = 0xb8bcb8; else if (ly === 1) c = 0xffffff;
    pc.set(x, y, c);
  }
}
/** the staff core: mint gloss paint on block, a grey dado, scuffed */
function staffPaper(pc: PixelCanvas) {
  const M = makeRamp(HT.mint, 5, { spread: 0.14 });
  for (let y = 0; y < WH; y++) for (let x = 0; x < 32; x++) {
    const row = y >> 3, lx = (x + (row & 1 ? 8 : 0)) % 16;
    let c = M[2 + (ph(x >> 2, y >> 2, 7251) < 0.2 ? 1 : 0)];
    if ((y & 7) === 0 || lx === 0) c = mixHex(c, M[0], 0.5);
    if (y > yAt(1.0)) c = mixHex(c, 0x7a8a84, 0.55);
    pc.set(x, y, c);
  }
  for (let x = 0; x < 32; x++) pc.set(x, yAt(1.0), 0x4a5a54);
  for (let i = 0; i < 14; i++) pc.blend(Math.floor(ph(i, 1, 7253) * 32), WH - 10 + Math.floor(ph(i, 2, 7253) * 8), 0x2a2a2a, 0.4);
}
/** the coffered plaster ceiling: cream squares in moulded frames, a rose in every other coffer */
function ceiling(pc: PixelCanvas) {
  const W = pc.w, H = pc.h;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const lx = x % 16, ly = y % 16;
    let c = mixHex(0xf4ecd8, 0xe6dcc4, tileFbm(x, y, W, H, 3, 2, 7261) * 0.6);
    if (lx < 2 || ly < 2) c = lx === 0 || ly === 0 ? 0xc8bca0 : 0xfffaf0;   // the beam, lit edge
    else if (lx === 2 || ly === 2) c = 0xd8ccb0;
    const rose = ((x >> 4) + (y >> 4)) % 2 === 0 && Math.hypot(lx - 8.5, ly - 8.5) < 2.2;
    if (rose) c = Math.hypot(lx - 8.5, ly - 8.5) < 1 ? 0xd8a640 : 0xfff6e4;
    pc.set(x, y, c);
  }
}

// ---------------------------------------------------------------- prop and decal textures
const DIGITS: Record<string, string[]> = {
  '0': ['###', '#.#', '#.#', '#.#', '###'], '1': ['.#.', '##.', '.#.', '.#.', '###'], '2': ['##.', '..#', '.#.', '#..', '###'],
  '3': ['##.', '..#', '.#.', '..#', '##.'], '4': ['#.#', '#.#', '###', '..#', '..#'], '5': ['###', '#..', '##.', '..#', '##.'],
  '6': ['.##', '#..', '###', '#.#', '###'], '7': ['###', '..#', '.#.', '.#.', '.#.'], '8': ['###', '#.#', '###', '#.#', '###'],
  '9': ['###', '#.#', '###', '..#', '##.'],
};
/** one brass numeral on a black enamel ground (8 x 12) */
function digit(pc: PixelCanvas, d: string) {
  pc.wrap = false;
  pc.fill(0x16120e);
  const g = DIGITS[d];
  for (let y = 0; y < 5; y++) for (let x = 0; x < 3; x++) if (g[y][x] === '#') {
    pc.rect(1 + x * 2, 1 + y * 2, 2, 2, mixHex(HT.brass, 0xfff0c0, y < 2 ? 0.35 : 0.05));
    pc.set(1 + x * 2, 1 + y * 2, 0xfff4c8);
  }
}
function brassTex(pc: PixelCanvas) {
  const R = makeRamp(HT.brass, 5, { spread: 0.4 });
  pc.each((x, y) => pc.set(x, y, R[2 + (y % 5 === 0 ? 1 : 0) + (ph(x, y, 7301) < 0.1 ? 1 : 0) - (ph(x, y, 7302) < 0.12 ? 1 : 0)]));
}
function linenTex(pc: PixelCanvas) {
  pc.each((x, y) => pc.set(x, y, mixHex(0xfbfaf4, 0xe8e4d8, ((x + y) & 1) * 0.3 + ph(x, y, 7311) * 0.3)));
  for (let x = 0; x < pc.w; x++) { pc.set(x, pc.h - 1, 0xd8d0c0); pc.set(x, pc.h - 2, 0xece6d8); }
}
function silverTex(pc: PixelCanvas) {
  pc.each((x, y) => { const d = Math.hypot(x - 4, y - 3); pc.set(x, y, d < 1.5 ? 0xffffff : mixHex(0xd8dce0, 0x7a8088, Math.min(1, y / pc.h + ph(x, y, 7321) * 0.2))); });
}
function towelsTex(pc: PixelCanvas) {
  // stacks of folded towels and sheets, fronts showing the folds
  const cols = [0xf8f6f0, 0xf0eee6, 0xe8e4d8, 0xf4efe0];
  pc.each((x, y) => { const band = Math.floor(y / 4); let c = cols[band % cols.length]; if (y % 4 === 3) c = 0xc8c0b0; if (x % 16 === 0) c = 0xa89a80; pc.set(x, y, c); });
}
function iceFront(pc: PixelCanvas) {
  pc.wrap = false;
  const R = makeRamp(0xc8ccd0, 5, { spread: 0.25 });
  pc.each((x, y) => pc.set(x, y, R[2 + (x % 6 === 0 ? 1 : 0) - (y > pc.h - 4 ? 1 : 0)]));
  // the dispenser recess: dark, frosted, with a blue lamp
  pc.rect(6, 10, 20, 14, 0x1a2228);
  for (let x = 7; x < 25; x++) for (let y = 11; y < 23; y++) if (ph(x, y, 7331) < 0.3) pc.set(x, y, 0xd8eef8);
  pc.rect(12, 4, 8, 3, 0x2a3a48); pc.rect(13, 5, 6, 1, 0x60c8ff);
  for (let x = 4; x < 28; x += 2) pc.set(x, pc.h - 6, 0x6a7078);
}
function washerFront(pc: PixelCanvas) {
  pc.wrap = false;
  pc.fill(0xe8ecec);
  for (let x = 0; x < pc.w; x++) { pc.set(x, 0, 0xffffff); pc.set(x, pc.h - 1, 0x9aa0a0); }
  const cx = 16, cy = 18;
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
    if (d < 11) pc.set(x, y, d > 9.5 ? 0xa8b0b4 : d > 8.5 ? 0x5a6064 : mixHex(0x3a5a6a, 0x8ab8c8, Math.max(0, (x - y + 6) / 20)));
  }
  pc.rect(4, 3, 10, 3, 0x3a3a3e); pc.set(24, 4, 0xff7040); pc.set(26, 4, 0x60ff80);
}
function keyRack(pc: PixelCanvas) {
  pc.wrap = false;
  pc.fill(HT.walnut);
  for (let r = 0; r < 4; r++) for (let k = 0; k < 6; k++) {
    const x0 = 1 + k * 5, y0 = 1 + r * 6;
    pc.rect(x0, y0, 4, 5, 0x1e140e);
    if (ph(k, r, 7341) < 0.7) { pc.set(x0 + 1, y0 + 1, HT.brass); pc.set(x0 + 2, y0 + 1, HT.brass); pc.rect(x0 + 1, y0 + 2, 2, 2, HT.crimson); }
  }
}
function hoseFront(pc: PixelCanvas) {
  pc.wrap = false;
  pc.fill(0xb8261e);
  for (let x = 0; x < pc.w; x++) { pc.set(x, 0, 0xe85a4a); pc.set(x, pc.h - 1, 0x6a140e); }
  pc.rect(3, 3, pc.w - 6, pc.h - 10, 0x2a3a40);
  for (let y = 4; y < pc.h - 8; y++) for (let x = 4; x < pc.w - 4; x++) { const d = Math.hypot(x - pc.w / 2, y - (pc.h - 10) / 2 - 3); pc.set(x, y, Math.floor(d) % 2 ? 0xc8302a : 0x8a1a14); }
  for (let x = 6; x < pc.w - 6; x++) pc.set(x, pc.h - 5, 0xf0f0e8);
}
function liftPanel(pc: PixelCanvas) {
  pc.wrap = false;
  pc.fill(mixHex(HT.brass, 0x000000, 0.15));
  // the floor dial: a half-moon with numerals, the needle stuck between 3 and 4
  for (let y = 0; y < 14; y++) for (let x = 0; x < pc.w; x++) { const d = Math.hypot(x + 0.5 - pc.w / 2, y - 13); if (d < 11) pc.set(x, y, d > 10 ? 0x5a4220 : 0xf2e8cc); }
  for (let k = 0; k < 7; k++) { const a = Math.PI + (k / 6) * Math.PI; pc.set(Math.round(pc.w / 2 + Math.cos(a) * 8.5), Math.round(13 + Math.sin(a) * 8.5), 0x2a1a0a); }
  for (let r = 0; r < 8; r++) pc.set(Math.round(pc.w / 2 + Math.cos(-1.35) * r), Math.round(13 + Math.sin(-1.35) * r), 0x9a1a14);
  // the call buttons: up (lit amber) and down
  for (const [y, lit] of [[18, true], [24, false]] as const) for (let yy = 0; yy < 4; yy++) for (let xx = 0; xx < 4; xx++) { const d = Math.hypot(xx - 1.5, yy - 1.5); if (d < 2) pc.set(pc.w / 2 - 2 + xx, y + yy, lit ? (d < 1 ? 0xfff0a0 : 0xf0a030) : (d < 1 ? 0xe8e0c8 : 0xa89878)); }
}
/** the drag scuffs: two long flattened lines in the pile and a smear of brown between */
function dragDecal(pc: PixelCanvas) {
  pc.wrap = false; pc.clear();
  for (let x = 0; x < pc.w; x++) for (const yc of [4, 11]) for (let dy = -1; dy <= 1; dy++) {
    const a = (dy === 0 ? 120 : 60) * (0.6 + 0.4 * Math.sin(x * 0.4 + yc));
    if (ph(x, yc + dy, 7351) < 0.85) pc.set(x, yc + dy, 0x2a2018, Math.round(a));
  }
  for (let x = 0; x < pc.w; x += 3) if (ph(x, 7, 7353) < 0.35) pc.set(x, 7, 0x4a2a1a, 70);
}
/** a room-service stain: coffee, a dark wine ring */
function spillDecal(pc: PixelCanvas) {
  pc.wrap = false; pc.clear();
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) {
    const d = Math.hypot(x + 0.5 - pc.w / 2, (y + 0.5 - pc.h / 2) * 1.3) + (tileFbm(x, y, pc.w, pc.h, 3, 2, 7361) - 0.5) * 5;
    if (d < 7) pc.set(x, y, d > 6 ? 0x3a0a10 : 0x5a2418, d > 6 ? 170 : 100);
  }
}

/**
 * The Meridian clearance reader (machine kit): an olive steel face with hazard trim, the bishop of the
 * Institute in brass, a card slot, a big lamp and a padlock glyph. `ok` 0 = sealed (red lamp, shackle
 * shut), 1 = authorised (green lamp, shackle open). Icons only, no words.
 */
function readerFace(pc: PixelCanvas, ok: number) {
  pc.wrap = false;
  const W = pc.w, H = pc.h;
  const O = makeRamp(0x5a6a3a, 5, { spread: 0.3 });
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) pc.set(x, y, O[2 + (ph(x, y, 7371) < 0.15 ? 1 : 0) - (ph(x, y, 7372) < 0.1 ? 1 : 0)]);
  // hazard trim top and bottom
  for (let x = 0; x < W; x++) for (const y of [0, 1, H - 2, H - 1]) pc.set(x, y, ((x + y) >> 1) % 2 ? 0x1a1a14 : 0xf0c020);
  for (let y = 2; y < H - 2; y++) { pc.set(0, y, O[0]); pc.set(W - 1, y, O[4]); }
  // rivets
  for (const [x, y] of [[2, 3], [W - 3, 3], [2, H - 4], [W - 3, H - 4]]) { pc.set(x, y, 0xd8d8c8); pc.set(x + 1, y + 1, 0x2a2a20); }
  // the bishop: a little brass mitre on a plinth
  const bx = 5, by = 5;
  const bishop = ['..#..', '.###.', '.#.#.', '.###.', '..#..', '.###.', '#####'];
  bishop.forEach((row, j) => [...row].forEach((c2, i) => { if (c2 === '#') pc.set(bx + i, by + j, j < 2 ? 0xfff0b0 : HT.brass); }));
  // the lamp: a domed lens in a bezel
  const lx = W - 9, ly = 9, lc = ok ? 0x40e060 : 0xe83a2a, lh = ok ? 0xc8ffd0 : 0xffc0a8;
  for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++) {
    const d = Math.hypot(x, y);
    if (d > 5.2) continue;
    pc.set(lx + x, ly + y, d > 4.2 ? 0x2a2a24 : d < 1.5 && x < 0 && y < 0 ? lh : mixHex(lc, 0x000000, Math.max(0, (x + y) / 14)));
  }
  // the padlock under the lamp: body and shackle (shut over the body, or swung open)
  const px = W - 12, py = 19;
  pc.rect(px, py + 4, 7, 5, ok ? 0x9ad8a0 : 0xd8c8a0); pc.rect(px + 3, py + 5, 1, 2, 0x2a2a24);
  for (let k = 0; k < 4; k++) { pc.set(px + 1, py + k, 0xd8d8c8); pc.set(px + 5 + (ok ? 2 : 0), py + k + (ok ? 1 : 0), 0xd8d8c8); }
  for (let x = px + 1; x <= px + 5 + (ok ? 2 : 0); x++) pc.set(x, py, 0xd8d8c8);
  // the card slot with a card glyph beside it
  pc.rect(4, H - 9, 12, 2, 0x0a0a08); pc.rect(4, H - 7, 12, 1, 0x8a9a6a);
  pc.rect(5, H - 15, 7, 5, 0xe8e0c8); pc.rect(5, H - 13, 7, 1, HT.crimson); pc.set(10, H - 15, HT.brass);
}

addTextureModule(() => {
  const A = atlas();
  A.add('ht_reader_0', 32, 32, (pc) => readerFace(pc, 0));
  A.add('ht_reader_1', 32, 32, (pc) => readerFace(pc, 1));
  A.add('ht_carpet', 32, 32, (pc) => corridorCarpet(pc, 0));
  A.add('ht_carpet_b', 32, 32, (pc) => corridorCarpet(pc, 1));
  A.add('ht_carpet_c', 32, 32, (pc) => corridorCarpet(pc, 2));
  A.add('ht_room', 32, 32, (pc) => roomCarpet(pc, 0));
  A.add('ht_room_b', 32, 32, (pc) => roomCarpet(pc, 1));
  A.add('ht_marble', 32, 32, (pc) => marbleFloor(pc, 0));
  A.add('ht_marble_b', 32, 32, (pc) => marbleFloor(pc, 1));
  A.add('ht_hex', 32, 32, hexTile);
  A.add('ht_paper_hall', 32, WALL_PX, (pc) => hallPaper(pc, 0), 1, 2.7);
  A.add('ht_paper_room', 32, WALL_PX, roomPaper, 1, 2.7);
  A.add('ht_paper_lift', 32, WALL_PX, liftPaper, 1, 2.7);
  A.add('ht_paper_bath', 32, WALL_PX, bathPaper, 1, 2.7);
  A.add('ht_paper_staff', 32, WALL_PX, staffPaper, 1, 2.7);
  A.add('ht_ceil', 32, 32, ceiling);
  for (const d of Object.keys(DIGITS)) A.add('ht_digit_' + d, 8, 12, (pc) => digit(pc, d));
  A.add('ht_brass', 16, 16, brassTex);
  A.add('ht_linen', 16, 16, linenTex);
  A.add('ht_silver', 8, 8, silverTex);
  A.add('ht_towels', 32, 16, towelsTex);
  A.add('ht_ice_front', 32, 32, iceFront);
  A.add('ht_washer_front', 32, 32, washerFront);
  A.add('ht_keyrack', 32, 26, keyRack);
  A.add('ht_hose', 16, 24, hoseFront);
  A.add('ht_liftpanel', 16, 30, liftPanel);
  A.add('ht_drag', 32, 16, dragDecal);
  A.add('ht_spill', 16, 16, spillDecal);
});

// ============================================================ on the walls
defObj({
  key: 'ht_sconce', name: 'Tulip Sconce', height: 2.1, block: 'none', onWall: true, movable: 2, sound: 'glass', hp: 30, power: true,
  light: { color: 0xffd6a0, intensity: 0.85, radius: 4.6, y: 1.95, kind: 'lamp', power: true },
  desc: 'A brass wall arm holding a frosted glass tulip. The bulb inside is warm and very steady. There is one every three metres, all the way round.',
  tags: [...T, 'light', 'wall', 'brass'],
  disassemble: { tools: ['#screwdriver'], time: 4, skill: 'electrical', yields: [['wire', 1, 1], ['scrap_metal', 0, 1]] },
  model: (mb) => {
    mb.box(0, 1.62, -0.47, 0.12, 0.2, 0.03, 'ht_brass');                       // the back plate
    mb.cylinderZ(0, 1.72, -0.36, 0.018, 0.2, 6, 'ht_brass', { caps: true });     // the arm
    mb.cylinder(0, 1.7, -0.26, 0.03, 0.06, 8, 'ht_brass');                      // the cup
    mb.cylinder(0, 1.76, -0.26, 0.05, 0.16, 10, 'glass', { rTop: 0.1, color: 0xfff0d8, emissive: 0.9, caps: true });
  },
});
defObj({
  key: 'ht_number', name: 'Room Number', height: 1.7, block: 'none', onWall: true, movable: 0, sound: 'metal', hp: 40,
  desc: 'Three brass numerals screwed into a black enamel plate beside the door. The same numbers come round again further along.',
  tags: [...T, 'sign', 'wall', 'brass'],
  variant: (s) => String(s.n ?? 300),
  model: (mb, s) => {
    const n = String(s.n ?? 300).padStart(3, '0').slice(-3);
    mb.box(0, 1.46, -0.47, 0.34, 0.16, 0.025, 'ht_brass');
    for (let k = 0; k < 3; k++) mb.box(-0.1 + k * 0.1, 1.48, -0.455, 0.085, 0.12, 0.012, { south: 'ht_digit_' + n[k], all: 'plastic_black' }, { fit: { south: true }, bevel: false });
  },
});
defObj({
  key: 'ht_hose', name: 'Fire Hose Cabinet', height: 2.0, block: 'none', onWall: true, movable: 0, sound: 'metal', hp: 300,
  desc: 'A red cabinet with a glass front and a canvas hose wound on a reel inside. The glass is cracked from the inside.',
  tags: [...T, 'wall', 'safety'],
  container: { name: 'Hose Cabinet', kind: 'cabinet', capacity: 8, loot: 'ht_hose' },
  model: (mb) => { mb.box(0, 0.7, -0.4, 0.62, 0.92, 0.18, { south: 'ht_hose', all: 'plastic_red' }, { fit: { south: true } }); },
});
defObj({
  key: 'ht_keyrack', name: 'Key Rack', w: 1, height: 2.1, block: 'none', onWall: true, movable: 0, sound: 'wood', hp: 120,
  desc: 'A walnut board of pigeonholes, one per room, each with a brass key on a red tassel. Some of the holes have two keys in them. Some keys have no rooms.',
  tags: [...T, 'wall', 'keys'],
  container: { name: 'Key Rack', kind: 'cabinet', capacity: 10, loot: 'ht_keys' },
  model: (mb) => { mb.box(0, 1.1, -0.44, 0.92, 0.76, 0.09, { south: 'ht_keyrack', all: 'wood_dark' }, { fit: { south: true } }); },
});
defObj({
  key: 'ht_liftpanel', name: 'Lift Call Panel', height: 1.8, block: 'none', onWall: true, movable: 0, sound: 'metal', hp: 200,
  desc: 'A brass panel with the floor dial over it. The up button is lit. The needle is stuck between 3 and 4, where it has always been.',
  tags: [...T, 'wall', 'brass'],
  model: (mb) => { mb.box(0, 1.0, -0.46, 0.26, 0.5, 0.04, { south: 'ht_liftpanel', all: 'ht_brass' }, { fit: { south: true }, emissive: 0.15 }); },
});

defObj({
  key: 'ht_reader', name: 'Clearance Reader', height: 1.6,
  light: { color: 0xfff0c8, intensity: 0.55, radius: 2.6, y: 1.6, kind: 'lamp', power: false }, block: 'none', onWall: true, movable: 0, sound: 'metal', hp: 99999, power: true,
  desc: 'A Meridian Institute reader in olive steel with the bishop on it in brass. The lamp is red and the padlock is shut until the Institute says otherwise, and the Institute says otherwise to very few units.',
  tags: [...T, 'mission', 'security', 'keycard', 'machine'],
  variant: (s) => (s.ok ? '1' : '0'),
  model: (mb, s) => {
    mb.box(0, 0.78, -0.42, 0.64, 0.64, 0.08, { south: 'ht_reader_' + (s.ok ? 1 : 0), all: 'metal_painted_green' }, { fit: { south: true }, emissive: 0.25 });
    mb.box(0, 1.42, -0.42, 0.7, 0.05, 0.12, 'metal_dark');
    // the lamp proud of the face, lit: red and shut, or green and open
    mb.sphere(0.18, 1.2, -0.37, 0.07, 10, 6, 'glass', { color: s.ok ? 0x60ff80 : 0xff4030, emissive: 1.6, sy: 0.7 });
    mb.box(0, 1.5, -0.42, 0.04, 1.2, 0.04, 'metal_grey');
    mb.cylinderZ(0, 0.98, -0.47, 0.03, 0.04, 6, 'metal_dark', { caps: true });
  },
});

// ============================================================ the ceiling
defObj({
  key: 'ht_chandelier', name: 'Chandelier', height: 2.7, block: 'none', ceiling: true, movable: 18, sound: 'glass', hp: 60, power: true,
  light: { color: 0xfff0d0, intensity: 1.25, radius: 7.5, y: 2.2, kind: 'bulb', power: true },
  desc: 'Two tiers of brass arms dripping cut-glass drops, every candle bulb lit. It sways a little, very slowly, though there is no draught. Worth a great deal to anyone who can get it down in one piece.',
  tags: [...T, 'light', 'brass', 'antique', 'glass'],
  model: (mb) => {
    mb.cylinder(0, 2.35, 0, 0.012, 0.35, 5, 'ht_brass');
    mb.sphere(0, 2.2, 0, 0.09, 8, 6, 'ht_brass');
    for (const [r, y, n] of [[0.42, 2.12, 8], [0.26, 2.32, 6]] as const) for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2, x = Math.cos(a) * r, z = Math.sin(a) * r;
      mb.box(x / 2, y, z / 2, Math.abs(x) + 0.02, 0.02, Math.abs(z) + 0.02, 'ht_brass', { bevel: false });
      mb.cylinder(x, y, z, 0.022, 0.06, 6, 'ht_brass');
      mb.cylinder(x, y + 0.06, z, 0.014, 0.07, 5, 'glass', { color: 0xfff6dc, emissive: 1, rTop: 0.004 });
      mb.sphere(x, y - 0.08, z, 0.025, 5, 4, 'glass', { color: 0xf0f8ff, emissive: 0.35 });
    }
  },
});

// ============================================================ the corridor's furniture (all of it heavy, all of it worth the press)
defObj({
  key: 'ht_cart', name: 'Room Service Trolley', height: 1.05, block: 'low', movable: 46, sound: 'metal', hp: 160,
  desc: 'A linen-draped trolley with two silver cloches, a bud vase and a folded napkin. The food under the cloches is still warm. It was ordered for room 311. Every room on this floor is 311.',
  tags: [...T, 'antique', 'silver', 'cart', 'trolley'],
  container: { name: 'Under the Cloches', kind: 'shelf', capacity: 10, loot: 'ht_cart' },
  disassemble: { tools: ['#screwdriver'], time: 10, skill: 'mechanics', yields: [['scrap_metal', 2, 3], ['silverware_set', 0, 1], ['cloth', 1, 2]] },
  model: (mb) => {
    for (const [x, z] of [[-0.36, -0.28], [0.36, -0.28], [-0.36, 0.28], [0.36, 0.28]] as const) {
      mb.box(x, 0.06, z, 0.03, 0.7, 0.03, 'ht_brass');
      mb.cylinderX(x, 0.04, z, 0.04, 0.03, 8, 'rubber_black', { caps: true });
    }
    mb.box(0, 0.2, 0, 0.74, 0.02, 0.58, 'ht_brass');                             // the lower shelf
    mb.box(0, 0.74, 0, 0.86, 0.03, 0.66, 'ht_linen');                            // the top under the cloth
    for (const s of [-1, 1]) mb.box(0, 0.44, s * 0.33, 0.86, 0.32, 0.012, 'ht_linen', { bevel: false }); // the cloth drapes
    for (const s of [-1, 1]) mb.box(s * 0.43, 0.44, 0, 0.012, 0.32, 0.66, 'ht_linen', { bevel: false });
    mb.cylinderZ(0, 0.84, -0.36, 0.015, 0.7, 6, 'ht_brass', { caps: true });      // the push rail
    for (const x of [-0.18, 0.18]) {
      mb.cylinder(x, 0.77, 0.02, 0.15, 0.015, 12, 'ht_silver');
      mb.sphere(x, 0.78, 0.02, 0.13, 12, 6, 'ht_silver', { sy: 0.72 });
      mb.sphere(x, 0.88, 0.02, 0.018, 6, 4, 'ht_silver');
    }
    mb.cylinder(0, 0.77, -0.2, 0.025, 0.14, 6, 'glass', { color: 0xd8f0f0 });
    mb.sphere(0, 0.94, -0.2, 0.035, 6, 4, 'fabric_red');
  },
});
defObj({
  key: 'ht_brass_cart', name: 'Brass Luggage Cart', w: 1, d: 2, height: 1.95, block: 'low', movable: 72, sound: 'metal', hp: 300,
  desc: 'A bellhop\'s cart: a birdcage of brass hoops over a red carpeted deck, three suitcases still strapped on. The brass is polished where hands should be. The press would take it gladly; it is solid.',
  tags: [...T, 'antique', 'brass', 'cart', 'trolley'],
  container: { name: 'Strapped Luggage', kind: 'shelf', capacity: 14, loot: 'ht_luggage' },
  disassemble: { tools: ['#wrench'], time: 14, skill: 'mechanics', yields: [['scrap_metal', 3, 5], ['copper_bundle', 0, 1]] },
  model: (mb) => {
    mb.box(0, 0.12, 0, 0.78, 0.06, 1.7, 'carpet_rug', { color: 0xa83030 });
    mb.box(0, 0.1, 0, 0.82, 0.03, 1.74, 'ht_brass');
    for (const [x, z] of [[-0.34, -0.72], [0.34, -0.72], [-0.34, 0.72], [0.34, 0.72]] as const) mb.cylinderX(x, 0.07, z, 0.07, 0.04, 10, 'rubber_black', { caps: true });
    // the two uprights and the hoop over the top
    for (const z of [-0.8, 0.8]) for (const x of [-0.36, 0.36]) mb.cylinder(x, 0.15, z, 0.02, 1.6, 6, 'ht_brass');
    for (let k = 0; k <= 8; k++) {
      const a = (k / 8) * Math.PI, x = Math.cos(a) * 0.36, y = 1.75 + Math.sin(a) * 0.14;
      for (const z of [-0.8, 0.8]) mb.sphere(x, y, z, 0.025, 5, 3, 'ht_brass');
    }
    mb.cylinderZ(0, 1.88, 0, 0.022, 1.62, 6, 'ht_brass', { caps: true });          // the hanging rail
    for (const k of [-0.4, 0, 0.4]) { mb.cylinder(k, 1.62, 0.02, 0.006, 0.24, 4, 'ht_brass'); mb.box(k, 1.32, 0.02, 0.36, 0.3, 0.05, 'fabric_grey'); } // garment bags
    // the suitcases on the deck
    mb.box(0, 0.15, -0.45, 0.66, 0.26, 0.5, 'leather_brown');
    mb.box(0.02, 0.41, -0.42, 0.56, 0.2, 0.42, 'fabric_red', { color: 0xc8a888 });
    mb.box(0, 0.15, 0.35, 0.6, 0.42, 0.5, 'leather_black');
    for (const z of [-0.45, 0.35]) mb.box(0, 0.15, z, 0.04, 0.44, 0.52, 'ht_brass', { bevel: false });
  },
});
defObj({
  key: 'ht_tray', name: 'Room Service Tray', height: 0.16, block: 'none', movable: 3, sound: 'metal', hp: 20,
  desc: 'A silver tray left outside a door: a cloche, a plate wiped clean, a crumpled napkin, the bill signed in somebody else\'s name.',
  tags: [...T, 'silver', 'tray'],
  container: { name: 'Tray', kind: 'shelf', capacity: 4, loot: 'ht_tray' },
  model: (mb) => {
    mb.box(0, 0.0, 0, 0.5, 0.025, 0.36, 'ht_silver');
    mb.cylinder(-0.1, 0.025, 0, 0.11, 0.012, 12, 'porcelain');
    mb.sphere(0.12, 0.03, -0.02, 0.09, 10, 5, 'ht_silver', { sy: 0.7 });
    mb.box(0.05, 0.025, 0.12, 0.12, 0.02, 0.06, 'ht_linen');
  },
});
defObj({
  key: 'ht_ice', name: 'Ice Machine', height: 1.85, block: 'solid', movable: 120, sound: 'metal', hp: 600, power: true, hum: 'fridge_hum',
  desc: 'A steel ice machine in its own alcove, rattling as it drops another load. The scoop hangs on a chain. The ice is clear and very cold and tastes of nothing at all.',
  tags: [...T, 'appliance', 'ice'],
  container: { name: 'Ice Bin', kind: 'fridge', capacity: 16, loot: 'ht_ice', cooling: 'fridge' },
  disassemble: { tools: ['#screwdriver', '#wrench'], time: 20, skill: 'electrical', yields: [['scrap_metal', 3, 5], ['copper_bundle', 1, 2], ['wire', 1, 2]] },
  model: (mb) => {
    mb.box(0, 0, 0, 0.82, 1.8, 0.72, { south: 'ht_ice_front', all: 'metal_brushed' }, { fit: { south: true } });
    mb.box(0, 1.8, 0, 0.84, 0.04, 0.74, 'metal_grey');
    mb.box(0, 0.62, 0.37, 0.5, 0.04, 0.08, 'metal_brushed');
    mb.box(0.3, 0.7, 0.38, 0.05, 0.12, 0.03, 'metal_grey');
  },
});
defObj({
  key: 'ht_linen_shelf', name: 'Linen Shelves', w: 2, height: 2.2, block: 'solid', movable: 60, sound: 'wood', hp: 300,
  desc: 'Slatted shelving stacked with towels and sheets folded into perfect squares. They are all still warm from the press. Somebody is still pressing them.',
  tags: [...T, 'shelf', 'linen'],
  container: { name: 'Linen Shelves', kind: 'shelf', capacity: 24, loot: 'ht_linen' },
  model: (mb) => {
    for (const x of [-0.94, 0.94]) mb.box(x, 0, 0, 0.05, 2.2, 0.55, 'wood_light');
    for (let k = 0; k < 5; k++) { const y = 0.08 + k * 0.48; mb.box(0, y, 0, 1.86, 0.03, 0.55, 'wood_light'); if (k < 4) mb.box(0, y + 0.03, 0.02, 1.8, 0.3, 0.46, { south: 'ht_towels', all: 'ht_linen' }, { fit: { south: true } }); }
  },
});
defObj({
  key: 'ht_washer', name: 'Laundry Washer', height: 1.25, block: 'solid', movable: 140, sound: 'metal', hp: 700, power: true, hum: 'machine_hum',
  desc: 'An industrial front-loader with a porthole the size of a dinner plate. It is running. Through the glass, round and round, go sheets, and a coat, and a shoe.',
  tags: [...T, 'appliance', 'laundry'],
  container: { name: 'Drum', kind: 'cabinet', capacity: 12, loot: 'ht_laundry' },
  disassemble: { tools: ['#wrench'], time: 24, skill: 'mechanics', yields: [['scrap_metal', 4, 6], ['copper_bundle', 1, 2]] },
  model: (mb) => {
    mb.box(0, 0, 0, 0.9, 1.22, 0.86, { south: 'ht_washer_front', all: 'plastic_white' }, { fit: { south: true } });
    mb.cylinderZ(0, 0.7, 0.44, 0.27, 0.04, 14, 'ht_brass', { caps: false });
  },
});
defObj({
  key: 'ht_hamper', name: 'Laundry Hamper', height: 1.0, block: 'low', movable: 14, sound: 'fabric', hp: 60,
  desc: 'A canvas laundry hamper on castors, heaped with sheets. Something in the bottom of it is heavier than sheets.',
  tags: [...T, 'laundry', 'cart'],
  container: { name: 'Hamper', kind: 'shelf', capacity: 12, loot: 'ht_laundry' },
  model: (mb) => {
    for (const [x, z] of [[-0.3, -0.24], [0.3, -0.24], [-0.3, 0.24], [0.3, 0.24]] as const) mb.cylinderX(x, 0.03, z, 0.035, 0.03, 6, 'rubber_black', { caps: true });
    mb.box(0, 0.08, 0, 0.7, 0.72, 0.56, 'fabric_grey', { color: 0xd8d0b8 });
    mb.box(0, 0.8, 0, 0.66, 0.16, 0.52, 'ht_linen');
    mb.sphere(0.12, 0.9, -0.05, 0.18, 8, 5, 'ht_linen', { sy: 0.5 });
  },
});

// ============================================================ decals
// ht_drag (the scuffs the luggage leaves) and ht_spill are plain textures laid with decal()
void tileFbm;
