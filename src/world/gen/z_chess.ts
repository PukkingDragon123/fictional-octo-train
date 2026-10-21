// The Board (56×72): a chessboard floating in violet nothing, every square
// four metres across, the pieces taller than houses. A clock the size of a
// door ticks and on every tick a black piece moves (src/social/dims.ts runs
// the board): the square it lands on lights red first, and whatever is
// standing there when it lands is flattened. The white pieces are yours: push
// one into a black piece to take it. Take the black king and the board goes
// still. Squares from other boards hang in the dark at the wrong heights.
import { defZone } from '../worldGraph';
import { Zone, TF } from '../zone';
import { ZoneBuilder } from './builder';
import { Furnisher } from './furnish';
import { Rng } from '../../core/rng';
import { type Ctx, force, put, arrive } from './mall_kit';
import { pit, landing } from './void_kit';
import { hh } from './weird_kit';
import { deeperFloor } from './z_floors';

const W = 56, H = 72;
export const CHESS = { ox: 12, oy: 20, S: 4 };

export interface ChessPiece { t: 'K' | 'Q' | 'R' | 'B' | 'N' | 'P'; c: 'w' | 'b'; x: number; y: number; alive: boolean }

export function generateChess(z: Zone, seed: number) {
  const rng = new Rng(seed);
  const b = new ZoneBuilder(z, rng);
  const f = new Furnisher(b, rng);
  const c: Ctx = { z, b, f, rng, seed };
  z.name = 'The Board';
  const { ox, oy, S } = CHESS;

  // ---- the board: 8×8 squares, a1 is bottom-left (white's side is the south)
  for (let r = 0; r < 8; r++) for (let q = 0; q < 8; q++) {
    const dark = (r + q) % 2 === 1;
    b.fillFloor(ox + q * S, oy + r * S, ox + q * S + S - 1, oy + r * S + S - 1, dark ? 'vx_chess_b' : 'vx_chess_w');
  }
  b.addRoom('The Board', 'chessboard', ox, oy, ox + 8 * S - 1, oy + 8 * S - 1, { circuit: 0, outdoor: true });
  // the start: a stone landing south of white's rank
  b.fillFloor(ox + 6, oy + 8 * S, ox + 8 * S - 7, oy + 8 * S + 9, 'terrazzo');
  b.addRoom('The Gallery', 'chess_start', ox + 6, oy + 8 * S, ox + 8 * S - 7, oy + 8 * S + 9, { circuit: 0 });
  // the far side: a landing past black's rank
  b.fillFloor(ox + 8, oy - 10, ox + 8 * S - 9, oy - 1, 'terrazzo');
  b.addRoom('The Far Side', 'chess_end', ox + 8, oy - 10, ox + 8 * S - 9, oy - 1, { circuit: 0 });
  b.flag(0, 0, W - 1, H - 1, TF.OUTDOOR);

  // ---- arrivals
  const sx = ox + 16, sy = oy + 8 * S + 5;
  landing(c, 'fall', sx, sy, 3);
  arrive(b, 'r_chess_return', sx - 4, sy + 2, 'n', 2);
  force(c, 'zw_rope_hanging', sx + 5, sy + 3, 0, { v: 1, portal: 'vx_chess_up' });
  b.portal({ id: 'vx_chess_up', x: sx + 5, y: sy + 3, kind: 'ladder', to: 'lobby', tx: 80, ty: 80, anchor: 'vx_return', label: 'Climb the rope out of the board' });
  force(c, 'vx_chess_clock', sx - 7, oy + 8 * S + 1, 0, {});
  force(c, 'vx_sign', sx - 2, sy + 4, 0, { text: 'THE BOARD|MIND THE RED SQUARE', c: 0x16131c, ink: 0xece4d0 });
  put(c, 'chair_wood', sx - 5, sy + 1, 1, {});
  f.floorItem('note', sx - 4, sy, { lore: 'vx_chess_note' });

  // ---- the far side: a stash, and a hole further down
  put(c, 'survivor_stash', ox + 14, oy - 8, 0, {});
  put(c, 'vx_stair_sign', ox + 17, oy - 8, 0, {});
  pit(c, ox + 20.5, oy - 6.5, 1.4, { to: deeperFloor('chess', 1), shared: true, label: 'Jump off the far side' }, 'vx_chess_hole');

  // ---- squares from other boards, hanging in the dark at the wrong heights
  for (let i = 0; i < 26; i++) {
    const x = rng.int(1, W - 3), y = rng.int(1, H - 3);
    if (x >= ox - 2 && x <= ox + 8 * S + 1 && y >= oy - 12 && y <= oy + 8 * S + 11) continue;
    const s2 = rng.int(1, 2);
    b.fillFloor(x, y, x + s2 - 1, y + s2 - 1, (x + y) % 2 ? 'vx_chess_b' : 'vx_chess_w');
    for (let yy = y; yy < y + s2; yy++) for (let xx = x; xx < x + s2; xx++) if (z.inb(xx, yy)) z.height[z.idx(xx, yy)] = Math.floor(hh(x, y, 7201) * 100) - 40;
    b.flag(x, y, x + s2, y + s2, TF.NOSPAWN);
  }

  // ---- the pieces (the board runtime owns them): an endgame, different every world
  const pieces: ChessPiece[] = [];
  const taken = new Set<string>();
  const place = (t: ChessPiece['t'], col: 'w' | 'b', x: number, y: number) => { if (taken.has(x + ',' + y)) return false; taken.add(x + ',' + y); pieces.push({ t, c: col, x, y, alive: true }); return true; };
  const kx = rng.int(2, 5);
  place('K', 'b', kx, 0);
  const tryPlace = (t: ChessPiece['t'], col: 'w' | 'b', rows: [number, number]) => { for (let k = 0; k < 20; k++) if (place(t, col, rng.int(0, 7), rng.int(rows[0], rows[1]))) return; };
  tryPlace('R', 'b', [0, 1]); tryPlace('N', 'b', [0, 2]); tryPlace('B', 'b', [0, 2]);
  for (let i = 0; i < 3; i++) tryPlace('P', 'b', [1, 2]);
  if (rng.chance(0.5)) tryPlace('N', 'b', [1, 3]);
  tryPlace('Q', 'w', [6, 7]); tryPlace('R', 'w', [6, 7]); tryPlace('B', 'w', [6, 7]); tryPlace('N', 'w', [6, 7]);
  for (let i = 0; i < 2; i++) tryPlace('P', 'w', [5, 6]);
  z.meta.chess = { ...CHESS, pieces, turn: 0 };
  for (const p of pieces) b.flag(ox + p.x * S, oy + p.y * S, ox + p.x * S + S - 1, oy + p.y * S + S - 1, TF.NOSPAWN);

  // ---- light: hard white from nowhere, and a cold violet ambience
  for (let r = 0; r < 8; r += 2) for (let q = 0; q < 8; q += 2) b.light(ox + q * S + S, oy + r * S + S, 'sky', { color: 0xf0eaff, intensity: 0.55, radius: 9, y: 9, circuit: 0 });
  b.light(sx + 0.5, sy + 0.5, 'lamp', { color: 0xffd8a0, intensity: 0.7, radius: 6, y: 2, circuit: 0 });

  z.env = {
    ...z.env,
    ambient: 0x8a84a8, ambientI: 0.62, fog: 0x1a1030, fogNear: 22, fogFar: 64, void: 0x0a0618, temp: 16,
    sky: true, sun: 0xf4eeff, sunI: 1.05, skyColor: 0xb8a8ff, outdoorAmbient: 0x9890c0,
    grade: 'chess', reverb: 'void', ambience: 'void', music: '', weather: 'none',
  };
  z.spawnTable = [['chess_rook', 2], ['chess_knight', 2]];
  z.creatureCap = 3;
  z.meta.dimension = 'chess';
}

defZone({
  key: 'chess', name: 'The Board', W, H, depth: 5,
  blurb: 'A chessboard the size of a town, floating in violet nothing. The clock is running. It is not your move.',
  gen: (z, s) => { generateChess(z, s); },
});
