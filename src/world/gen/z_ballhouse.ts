// The Ball House (116×100, depth 3): a nostalgic indoor kids' play-place that
// goes on too long. Faded primary vinyl under bright fluorescent tubes, the
// arcade carpet with its confetti shapes, foam mats, and the smell of feet and
// sugar. West: the lobby (shoe cubbies, the rules board, the height giraffe,
// the glass doors back out into Westgate Mall's food court), the staff kitchen
// and office (the closing procedure, the PA script), the toilets. Middle: the
// Big Pit Hall, a sunken ball pit you wade through, ringed by play-frame towers
// with wave slides into the balls, crawl tubes overhead and net bridges, and a
// toddler pit. North: the party corridor, twenty-five identical party rooms
// with a table laid for Timmy in every one (the numbers do not quite go up).
// East: the prize counter and the arcade; the soft-play room with its own pit.
// South: the Crawl, a padded maze that is longer than the building, ending in
// the Deep End. The Timmies (src/creatures/species/timmy.ts) live here: they
// float about, hide in the pits with only their hats showing, and come for the
// sweets at the prize counter and the cakes in the party rooms.
//
// Links: glass doors in the east wall of Westgate Mall's food court (both
// ways: p_mall_ballhouse -> anchor bh_from_mall; bh_to_mall -> mall anchor
// r_mall_ballhouse); a fire exit in the soft-play room out to the Nostalgic
// Playground (bh_to_pg -> playground anchor r_pg_ballhouse) when that level
// exists. The playground's soft-play hut (pg_ballhouse) lands at the fire exit
// (anchor pg_from_playground); its crawl tube back is added by z_playground.ts.
import { defZone, onZoneGenerated, zoneSpec } from '../worldGraph';
import { Zone, TF } from '../zone';
import { ZoneBuilder } from './builder';
import { Furnisher } from './furnish';
import { Rng, hash3 } from '../../core/rng';
import { type Ctx, type Rot, force, put, isOpen, arrive, mount, decal } from './mall_kit';
import { findOpenRect } from './void_kit';
import { hh } from './weird_kit';
import { connectRegions } from './connect';
import { BX_PAPERS } from '../../content/furniture/zt_ballhouse';

const W = 116, H = 100;
const C_MAIN = 1, C_PARTY = 2, C_STAFF = 3, C_CRAWL = 4;
interface Rect { x0: number; y0: number; x1: number; y1: number }
const STAFF: Rect = { x0: 2, y0: 2, x1: 21, y1: 39 };
const LOBBY: Rect = { x0: 2, y0: 40, x1: 21, y1: 57 };
const LOO: Rect = { x0: 2, y0: 58, x1: 21, y1: 75 };
const PARTY: Rect = { x0: 22, y0: 2, x1: 113, y1: 23 };
const CORR = { y0: 10, y1: 13 };
const HALL: Rect = { x0: 22, y0: 24, x1: 69, y1: 75 };
const ARCADE: Rect = { x0: 70, y0: 24, x1: 113, y1: 49 };
const SOFT: Rect = { x0: 70, y0: 50, x1: 113, y1: 75 };
const CRAWL: Rect = { x0: 2, y0: 76, x1: 113, y1: 97 };
/** the pits (even sizes: the ball fill comes in 2×2 pieces) */
const PIT: Rect = { x0: 34, y0: 39, x1: 51, y1: 52 };
const TOT: Rect = { x0: 26, y0: 64, x1: 31, y1: 69 };
const SOFTPIT: Rect = { x0: 96, y0: 58, x1: 105, y1: 67 };
const DEEP: Rect = { x0: 98, y0: 82, x1: 111, y1: 95 };
/** where you come in from the mall, and where the fire exit to the playground is */
const ENTRY = { x: 2, y: 48 }, FIRE = { x: 113, y: 62 };
const LIGHT = 0xf4f8ff;

function room(b: ZoneBuilder, r: Rect, floor: string, paper: string, name: string, type: string, circuit: number) {
  b.fillFloor(r.x0, r.y0, r.x1, r.y1, floor);
  b.paper(r.x0, r.y0, r.x1, r.y1, paper);
  b.roomWalls(r.x0, r.y0, r.x1, r.y1, 'drywall');
  return b.addRoom(name, type, r.x0, r.y0, r.x1, r.y1, { circuit, temp: 22 });
}
function lights(b: ZoneBuilder, r: Rect, step: number, circuit: number, rng: Rng, flick = 0.06) {
  for (let y = r.y0 + 2; y <= r.y1 - 1; y += step) for (let x = r.x0 + 2; x <= r.x1 - 1; x += step) {
    const q = hh(x, y, 9101);
    b.light(x + 0.5, y + 0.5, 'fluoro', { color: LIGHT, intensity: 0.88, radius: step + 1.6, circuit, flicker: q < flick ? 0.18 : 0 });
  }
  void rng;
}
/** a sunken ball pit: padded rim (or netting), the ball surface, a few ways in */
function ballPit(c: Ctx, P: Rect, nets: ('n' | 's' | 'e' | 'w')[] = []) {
  const { b, z, rng } = c;
  b.fillFloor(P.x0, P.y0, P.x1, P.y1, 'bx_pit', -0.5);
  for (let y = P.y0; y < P.y1; y += 2) for (let x = P.x0; x < P.x1; x += 2) {
    const v = rng.weighted([[0, 3], [1, 3], [2, 3], [3, 3], [4, 3], [5, 0.45], [6, 0.3], [7, 0.6]] as [number, number][]);
    b.obj('bx_ballfill', x, y, 0, { v });
  }
  const wall = (s: 'n' | 's' | 'e' | 'w') => (nets.includes(s) ? 'bx_net' : 'bx_pad');
  b.hwall(P.x0, P.x1, P.y0, wall('n')); b.hwall(P.x0, P.x1, P.y1 + 1, wall('s'));
  b.vwall(P.x0, P.y0, P.y1, wall('w')); b.vwall(P.x1 + 1, P.y0, P.y1, wall('e'));
  // ways in: two on each side
  const wx = P.x1 - P.x0, wy = P.y1 - P.y0;
  for (const f of [0.28, 0.7]) {
    const gx = P.x0 + Math.round(wx * f), gy = P.y0 + Math.round(wy * f);
    b.clearN(gx, P.y0); b.clearN(gx, P.y1 + 1); b.clearW(P.x0, gy); b.clearW(P.x1 + 1, gy);
  }
  ((z.meta as any).bxPits ||= []).push([P.x0, P.y0, P.x1, P.y1]);
}
/** recursive division for the Crawl: narrow padded passages */
function crawlSplit(b: ZoneBuilder, rng: Rng, x0: number, y0: number, x1: number, y1: number, depth: number, rooms: Rect[]) {
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const canV = w >= 7, canH = h >= 7;
  if ((!canV && !canH) || depth > 7 || (depth > 3 && rng.chance(0.15))) { rooms.push({ x0, y0, x1, y1 }); return; }
  const vert = canV && (!canH || (w > h ? rng.chance(0.8) : rng.chance(0.25)));
  if (vert) {
    const sx = rng.int(x0 + 3, x1 - 2);
    b.vwall(sx, y0, y1, 'drywall');
    const gy = rng.int(y0, y1 - 1); b.clearW(sx, gy); b.clearW(sx, gy + 1);
    crawlSplit(b, rng, x0, y0, sx - 1, y1, depth + 1, rooms); crawlSplit(b, rng, sx, y0, x1, y1, depth + 1, rooms);
  } else {
    const sy = rng.int(y0 + 3, y1 - 2);
    b.hwall(x0, x1, sy, 'drywall');
    const gx = rng.int(x0, x1 - 1); b.clearN(gx, sy); b.clearN(gx + 1, sy);
    crawlSplit(b, rng, x0, y0, x1, sy - 1, depth + 1, rooms); crawlSplit(b, rng, x0, sy, x1, y1, depth + 1, rooms);
  }
}

export function generateBallHouse(z: Zone, seed: number) {
  const rng = new Rng(seed);
  const b = new ZoneBuilder(z, rng);
  const f = new Furnisher(b, rng);
  const c: Ctx = { z, b, f, rng, seed };
  z.name = 'The Ball House';
  (z.meta as any).bxPits = [];
  const softColour = () => rng.int(0, 3);

  // ============================================================ the lobby: where you come in, take your shoes off, read the rules
  room(b, LOBBY, 'bx_carpet', BX_PAPERS.mural, 'Ball House Lobby', 'bh_lobby', C_MAIN);
  for (const y of [ENTRY.y, ENTRY.y + 1]) b.door(ENTRY.x, y, 1, 'door_glass', { portal: 'bh_to_mall', sign: 'exit' });
  b.portal({ id: 'bh_to_mall', x: ENTRY.x, y: ENTRY.y, kind: 'door', to: 'mall', tx: 183, ty: 25, anchor: 'r_mall_ballhouse', label: 'Go back out into the mall' });
  arrive(b, 'bh_from_mall', ENTRY.x + 3, ENTRY.y, 'e', 3);
  force(c, 'vx_sign', ENTRY.x + 4, ENTRY.y - 4, 0, { text: 'BALL HOUSE|PLAY * PARTIES * PRIZES', c: 0xd8584a, ink: 0xfff4e0 });
  for (let x = LOBBY.x0 + 2; x <= LOBBY.x1 - 3; x += 2) force(c, 'bx_cubby', x, LOBBY.y0, 0, { v: (x >> 1) & 1 });
  mount(b, 'bx_rules', LOBBY.x0 + 1, LOBBY.y0 + 3, 'w', {});
  mount(b, 'bx_giraffe', LOBBY.x0 + 9, LOBBY.y1, 's', {});
  mount(b, 'party_banner', LOBBY.x0 + 12, LOBBY.y1, 's', {});
  force(c, 'checkout_counter', LOBBY.x0 + 9, LOBBY.y0 + 4, 0, {});
  put(c, 'ticket_kiosk', LOBBY.x0 + 13, LOBBY.y0 + 4, 0, {});
  for (const x of [LOBBY.x0 + 2, LOBBY.x0 + 5]) put(c, 'bench', x, LOBBY.y1 - 1, 2, {});
  put(c, 'gumball_machine', LOBBY.x1 - 1, LOBBY.y0 + 3, 3, { loot: 'bx_candy_jar' });
  put(c, 'coin_ride', LOBBY.x1 - 1, LOBBY.y1 - 2, 3, {});
  put(c, 'toy_box', LOBBY.x0 + 15, LOBBY.y1 - 1, 2, { loot: 'bx_lost' });
  mount(b, 'zw_plate', LOBBY.x0 + 15, LOBBY.y1, 's', { label: 'LOST + FOUND' });
  f.floorItem('note', LOBBY.x0 + 10, LOBBY.y0 + 5, { lore: 'bx_invite' });
  // wide open into the hall
  for (let y = LOBBY.y0 + 5; y <= LOBBY.y0 + 12; y++) b.clearW(HALL.x0, y);
  lights(b, LOBBY, 4, C_MAIN, rng);

  // ============================================================ the staff side: the kitchen (party food), the office (the PA, the logs)
  const KIT: Rect = { x0: STAFF.x0, y0: STAFF.y0, x1: STAFF.x1, y1: 20 }, OFF: Rect = { x0: STAFF.x0, y0: 21, x1: STAFF.x1, y1: STAFF.y1 };
  room(b, KIT, 'tile_kitchen', 'wall_kitchen', 'Party Kitchen', 'kitchen', C_STAFF);
  room(b, OFF, 'linoleum', 'wall_office', 'Staff Office', 'office', C_STAFF);
  b.door(LOBBY.x0 + 6, LOBBY.y0, 0, 'door_office', { sign: 'staff' });
  b.door(KIT.x0 + 10, OFF.y0, 0, 'door_office', {});
  for (let x = KIT.x0 + 1; x <= KIT.x0 + 8; x++) put(c, x === KIT.x0 + 4 ? 'counter_sink' : 'counter_kitchen', x, KIT.y0, 0, { loot: 'kitchen_counter' });
  put(c, 'fridge', KIT.x0 + 10, KIT.y0, 0, { loot: 'bx_party' }); put(c, 'fridge', KIT.x0 + 11, KIT.y0, 0, { loot: 'bx_party' });
  put(c, 'stove', KIT.x0 + 13, KIT.y0, 0, {});
  const kt = force(c, 'table_dining', KIT.x0 + 7, KIT.y0 + 8, 0, {});
  if (kt && rng.chance(0.9)) f.floorItem('birthday_cake', KIT.x0 + 8, KIT.y0 + 8);
  for (let i = 0; i < 4; i++) put(c, 'bx_presents', KIT.x0 + 2 + i * 2, KIT.y1 - 1, 0, {});
  for (let x = OFF.x0 + 1; x <= OFF.x0 + 6; x++) put(c, 'locker', x, OFF.y0, 0, {});
  put(c, 'desk_office', OFF.x0 + 10, OFF.y0 + 6, 0, {}); put(c, 'chair_office', OFF.x0 + 10, OFF.y0 + 7, 2, {});
  put(c, 'desk_office', OFF.x0 + 14, OFF.y0 + 11, 0, {}); put(c, 'chair_office', OFF.x0 + 14, OFF.y0 + 12, 2, {});
  put(c, 'filing_cabinet', OFF.x1 - 1, OFF.y0 + 1, 3, {}); put(c, 'filing_cabinet', OFF.x1 - 1, OFF.y0 + 2, 3, {});
  put(c, 'tv_crt', OFF.x0 + 16, OFF.y0 + 1, 0, {});
  f.floorItem('note', OFF.x0 + 10, OFF.y0 + 5, { lore: 'bx_pa_script' });
  f.floorItem('note', OFF.x0 + 12, OFF.y0 + 8, { lore: 'bx_closing' });
  f.floorItem('note', OFF.x0 + 14, OFF.y0 + 10, { lore: 'bx_wristbands' });
  f.floorItem('note', OFF.x0 + 4, OFF.y0 + 12, { lore: 'bx_calder' });
  for (const [x, y] of [[KIT.x0 + 5, KIT.y0 + 4], [KIT.x0 + 14, KIT.y0 + 12], [OFF.x0 + 5, OFF.y0 + 5], [OFF.x0 + 14, OFF.y0 + 13]]) b.light(x + 0.5, y + 0.5, 'fluoro', { color: 0xfff6e8, intensity: 0.85, radius: 6, circuit: C_STAFF });

  // ============================================================ the toilets: little toilets, little sinks, a mirror at a child's height
  room(b, LOO, 'tile_white', 'wall_bathroom', "Children's Toilets", 'restroom', C_MAIN);
  b.door(LOBBY.x0 + 9, LOO.y0, 0, 'door_wood', {});
  for (let i = 0; i < 5; i++) {
    const x = LOO.x0 + 2 + i * 3;
    b.vwall(x, LOO.y1 - 3, LOO.y1, 'cubicle'); b.vwall(x + 3, LOO.y1 - 3, LOO.y1, 'cubicle');
    put(c, 'toilet', x + 1, LOO.y1, 2, {});
  }
  for (let i = 0; i < 4; i++) { put(c, 'sink_bathroom', LOO.x0 + 3 + i * 3, LOO.y0, 0, {}); mount(b, 'mirror', LOO.x0 + 3 + i * 3, LOO.y0, 'n', {}); }
  lights(b, LOO, 5, C_MAIN, rng, 0.2);

  // ============================================================ the Big Pit Hall
  room(b, HALL, 'bx_mat', BX_PAPERS.blue, 'The Big Pit', 'bh_hall', C_MAIN);
  b.paper(HALL.x0, HALL.y0, HALL.x1, HALL.y0 + 8, BX_PAPERS.red);
  b.paper(HALL.x0, HALL.y1 - 8, HALL.x1, HALL.y1, BX_PAPERS.yellow);
  ballPit(c, PIT, ['e', 'w']);
  // the play frame: towers round the pit, slides into it, tubes over it, a rope bridge
  const tower = (x: number, y: number, v: number) => { b.clearObjects(x, y, x + 1, y + 1); return b.obj('bx_tower', x, y, 0, { v }); };
  tower(36, 35, 0); tower(46, 35, 1); tower(36, 54, 2); tower(44, 54, 3); tower(30, 44, 1); tower(54, 44, 2);
  b.obj('bx_slide', 36, 37, 0, {}); b.obj('bx_slide', 47, 37, 0, {});
  b.obj('bx_slide', 37, 51, 2, {}); b.obj('bx_slide', 45, 51, 2, {});
  b.obj('bx_slide', 32, 45, 3, {}); b.obj('bx_slide', 51, 45, 1, {});
  for (const x of [36, 47]) b.clearN(x, PIT.y0);
  for (const x of [37, 45]) b.clearN(x, PIT.y1 + 1);
  b.clearW(PIT.x0, 45); b.clearW(PIT.x1 + 1, 45);
  for (let x = 38; x <= 44; x += 2) b.obj('bx_tube', x, 35, 1, { v: (x >> 1) & 3 });
  b.obj('bx_netbridge', 38, 54, 1, {}); b.obj('bx_netbridge', 41, 54, 1, {});
  for (const [x, y] of [[33, 38], [52, 38], [33, 53], [52, 53]]) put(c, 'bx_post', x, y, 0, { v: (x + y) & 3 });
  // the toddler pit, soft blocks, a snack corner
  ballPit(c, TOT, []);
  for (let i = 0; i < 18; i++) { const x = rng.int(HALL.x0 + 2, HALL.x1 - 2), y = rng.int(HALL.y0 + 2, HALL.y1 - 2); if (x >= PIT.x0 - 4 && x <= PIT.x1 + 4 && y >= PIT.y0 - 5 && y <= PIT.y1 + 4) continue; put(c, 'bx_softblock', x, y, rng.int(0, 3) as Rot, { v: rng.int(0, 5), c: softColour() }); }
  for (let k = 0; k < 2; k++) {
    const tx = HALL.x0 + 3 + k * 4, ty = HALL.y0 + 4;
    put(c, 'zw_kids_table', tx, ty, 0, {});
    for (const [dx, dy, r] of [[0, -1, 0], [1, -1, 0], [0, 1, 2], [1, 1, 2]] as [number, number, Rot][]) put(c, 'zw_kids_chair', tx + dx, ty + dy, r, { v: rng.int(0, 3) });
  }
  put(c, 'vending_snack', HALL.x0 + 1, HALL.y0 + 10, 1, {}); put(c, 'gumball_machine', HALL.x0 + 1, HALL.y0 + 12, 1, { loot: 'bx_candy_jar' });
  put(c, 'teddy_giant', HALL.x1 - 2, HALL.y1 - 2, 2, {});
  for (let i = 0; i < 6; i++) { const x = rng.int(HALL.x0 + 3, HALL.x1 - 3), y = rng.int(HALL.y0 + 3, HALL.y1 - 3); b.obj('bx_balloons', x, y, 0, { v: rng.int(0, 3) }); }
  for (let i = 0; i < 7; i++) { const x = rng.int(HALL.x0 + 2, HALL.x1 - 2), y = rng.int(HALL.y0 + 2, HALL.y1 - 2); if (isOpen(z, x, y)) put(c, 'bx_balloon_floor', x, y, 0, { v: rng.int(0, 2) }); }
  lights(b, HALL, 5, C_MAIN, rng);

  // ============================================================ the party corridor: twenty-five party rooms, all laid for Timmy
  b.fillFloor(PARTY.x0, PARTY.y0, PARTY.x1, PARTY.y1, 'bx_tile');
  b.fillFloor(PARTY.x0, CORR.y0, PARTY.x1, CORR.y1, 'bx_carpet');
  b.paper(PARTY.x0, PARTY.y0, PARTY.x1, PARTY.y1, BX_PAPERS.party);
  b.roomWalls(PARTY.x0, PARTY.y0, PARTY.x1, PARTY.y1, 'drywall');
  b.addRoom('Party Corridor', 'bh_corridor', PARTY.x0, CORR.y0, PARTY.x1, CORR.y1, { circuit: C_PARTY, temp: 22 });
  b.hwall(PARTY.x0, PARTY.x1, CORR.y0, 'drywall'); b.hwall(PARTY.x0, PARTY.x1, CORR.y1 + 1, 'drywall');
  // the way up from the hall: the first south slot is a hallway, not a room
  const PASS: Rect = { x0: PARTY.x0, y0: CORR.y1 + 1, x1: PARTY.x0 + 6, y1: PARTY.y1 };
  b.fillFloor(PASS.x0, PASS.y0, PASS.x1, PASS.y1, 'bx_carpet');
  for (let x = PASS.x0 + 2; x <= PASS.x0 + 5; x++) { b.clearN(x, CORR.y1 + 1); b.clearN(x, HALL.y0); }
  b.addRoom('Party Corridor', 'bh_corridor', PASS.x0, PASS.y0, PASS.x1, PASS.y1, { circuit: C_PARTY, temp: 22 });
  const NUMS = [1, 2, 3, 4, 5, 6, 7, 7, 8, 7, 9, 7, 10, 11, 12, 7, 13, 14, 7, 7, 15, 7, 16, 7, 7];
  let ni = 0;
  for (const side of [0, 1]) for (let i = 0; i < 13; i++) {
    if (side === 1 && i === 0) continue;
    const x0 = PARTY.x0 + i * 7, x1 = i === 12 ? PARTY.x1 : x0 + 6;
    const y0 = side ? CORR.y1 + 1 : PARTY.y0, y1 = side ? PARTY.y1 : CORR.y0 - 1;
    if (i > 0) b.vwall(x0, y0, y1, 'drywall');
    if (side === 1 && i === 1) b.vwall(x0, y0, y1, 'drywall');
    const num = NUMS[ni++ % NUMS.length];
    b.addRoom('Party Room ' + num, 'party_room', x0, y0, x1, y1, { circuit: C_PARTY, temp: 22 });
    const dx = x0 + 3, dy = side ? CORR.y1 + 1 : CORR.y0;
    b.door(dx, dy, 0, 'door_wood', { open: rng.chance(0.55) });
    mount(b, 'zw_plate', dx + 2, side ? CORR.y1 : CORR.y0, side ? 's' : 'n', { label: 'PARTY ROOM ' + num });
    // the table, the chairs, the balloons, the banner, the presents
    const ty = side ? y0 + 4 : y0 + 3, tx = x0 + 2;
    const cake = hh(i, side, 9201) < 0.4;
    b.obj('bx_party_table', tx, ty, 0, { cake: cake ? 1 : 0, v: (i + side) % 3 });
    for (let k = 0; k < 3; k++) { put(c, 'zw_kids_chair', tx + k, ty - 1, 2, { v: (k + i) & 3 }); put(c, 'zw_kids_chair', tx + k, ty + 1, 0, { v: (k + i + 1) & 3 }); }
    b.obj('bx_balloons', x0 + 1 + (i % 2) * 4, side ? y1 - 1 : y0 + 1, 0, { v: (i + side) & 3 });
    if (hh(i, side, 9203) < 0.5) b.obj('bx_balloons', x0 + 5 - (i % 2) * 4, ty, 0, { v: (i + 2) & 3 });
    mount(b, 'party_banner', x0 + 2, side ? y1 : y0, side ? 's' : 'n', {});
    if (hh(i, side, 9205) < 0.6) put(c, 'bx_presents', side ? x0 + 5 : x0 + 1, side ? y1 - 1 : y0 + 1, 0, {});
    if (!cake && hh(i, side, 9207) < 0.35) f.floorItem('birthday_cake', tx + 1, ty);
    if (hh(i, side, 9209) < 0.45) f.floorLoot('bx_party', x0 + rng.int(1, 5), side ? y1 - 2 : y0 + 2);
    if (hh(i, side, 9211) < 0.5) put(c, 'bx_balloon_floor', x0 + rng.int(1, 5), side ? y1 - 1 : y0 + 1, 0, { v: rng.int(0, 2) });
    b.light(x0 + 3.5, (y0 + y1) / 2 + 0.5, 'fluoro', { color: 0xfff8ec, intensity: 0.92, radius: 5.4, circuit: C_PARTY, flicker: hh(i, side, 9213) < 0.12 ? 0.25 : 0 });
  }
  if (ni) f.floorItem('note', PARTY.x0 + 3 * 7 + 3, CORR.y0 + 1, { lore: 'bx_invite' });
  for (let x = PARTY.x0 + 2; x < PARTY.x1; x += 4) b.light(x + 0.5, CORR.y0 + 2, 'fluoro', { color: LIGHT, intensity: 0.9, radius: 4.6, circuit: C_PARTY });
  // the corridor ends in a mirror; a long way down it, a little figure that is you
  mount(b, 'mirror', PARTY.x1, CORR.y0 + 1, 'e', {});
  mount(b, 'mirror', PARTY.x1, CORR.y0 + 2, 'e', {});

  // ============================================================ the arcade and the prize counter (the candy is here)
  room(b, ARCADE, 'bx_carpet', BX_PAPERS.mural, 'Prize Counter', 'bh_prizes', C_MAIN);
  for (const [a, z1] of [[28, 33], [42, 46]]) for (let y = a; y <= z1; y++) b.clearW(ARCADE.x0, y);
  const pc = force(c, 'bx_prize_counter', 89, ARCADE.y0 + 3, 0, {});
  void pc;
  mount(b, 'bx_prize_wall', 89, ARCADE.y0, 'n', {});
  force(c, 'bx_candy_jar', 87, ARCADE.y0 + 1, 0, { v: 0 }); force(c, 'bx_candy_jar', 93, ARCADE.y0 + 1, 0, { v: 1 });
  force(c, 'bx_candy_jar', 86, ARCADE.y0 + 4, 0, { v: 1 }); force(c, 'bx_candy_jar', 94, ARCADE.y0 + 4, 0, { v: 0 });
  put(c, 'gumball_machine', 84, ARCADE.y0 + 1, 0, { loot: 'bx_candy_jar' }); put(c, 'gumball_machine', 96, ARCADE.y0 + 1, 0, { loot: 'bx_candy_jar' });
  put(c, 'ticket_kiosk', 99, ARCADE.y0 + 1, 0, {}); put(c, 'teddy_giant', 81, ARCADE.y0 + 1, 0, {});
  for (const y of [ARCADE.y0 + 10, ARCADE.y0 + 16]) for (let x = ARCADE.x0 + 4; x <= ARCADE.x1 - 4; x += 2) put(c, 'arcade_machine', x, y, y === ARCADE.y0 + 10 ? 0 : 2, {});
  for (const y of [ARCADE.y1 - 4, ARCADE.y1 - 2]) put(c, 'coin_ride', ARCADE.x1 - 1, y, 3, {});
  for (let i = 0; i < 3; i++) b.obj('bx_balloons', 80 + i * 9, ARCADE.y0 + 6, 0, { v: i });
  for (let i = 0; i < 4; i++) f.floorItem(rng.pick(['prize_tickets', 'prize_tickets', 'gumball', 'lollipop']), rng.int(ARCADE.x0 + 3, ARCADE.x1 - 3), rng.int(ARCADE.y0 + 6, ARCADE.y1 - 2));
  lights(b, ARCADE, 4, C_MAIN, rng);

  // ============================================================ soft play: foam, a pit, a tower and a slide, tubes overhead
  room(b, SOFT, 'bx_mat', BX_PAPERS.yellow, 'Soft Play', 'bh_softplay', C_MAIN);
  b.paper(SOFT.x0, SOFT.y0, SOFT.x0 + 12, SOFT.y1, BX_PAPERS.green);
  for (let y = 56; y <= 61; y++) b.clearW(SOFT.x0, y);
  for (let x = 90; x <= 95; x++) b.clearN(x, SOFT.y0);
  ballPit(c, SOFTPIT, ['n']);
  tower(92, 60, 3); b.obj('bx_slide', 94, 61, 3, {}); b.clearW(SOFTPIT.x0, 61);
  for (let y = 52; y <= 58; y += 2) b.obj('bx_tube', 80, y, 0, { v: (y >> 1) & 3 });
  for (let i = 0; i < 26; i++) { const x = rng.int(SOFT.x0 + 2, SOFT.x1 - 2), y = rng.int(SOFT.y0 + 2, SOFT.y1 - 2); if (x >= SOFTPIT.x0 - 5 && x <= SOFTPIT.x1 + 1 && y >= SOFTPIT.y0 - 1 && y <= SOFTPIT.y1 + 1) continue; put(c, 'bx_softblock', x, y, rng.int(0, 3) as Rot, { v: rng.int(0, 5), c: softColour() }); }
  for (let i = 0; i < 4; i++) mount(b, 'mirror', SOFT.x0 + 3 + i, SOFT.y1, 's', {});
  for (let i = 0; i < 4; i++) b.obj('bx_balloons', rng.int(SOFT.x0 + 3, SOFT.x1 - 3), rng.int(SOFT.y0 + 3, SOFT.y1 - 3), 0, { v: rng.int(0, 3) });
  lights(b, SOFT, 5, C_MAIN, rng);

  // ============================================================ the Crawl: a padded maze longer than the building, and the Deep End
  b.fillFloor(CRAWL.x0, CRAWL.y0, CRAWL.x1, CRAWL.y1, 'bx_mat');
  b.roomWalls(CRAWL.x0, CRAWL.y0, CRAWL.x1, CRAWL.y1, 'drywall');
  const papers = [BX_PAPERS.red, BX_PAPERS.blue, BX_PAPERS.yellow, BX_PAPERS.green];
  const crooms: Rect[] = [];
  crawlSplit(b, rng, CRAWL.x0, CRAWL.y0, DEEP.x0 - 3, CRAWL.y1, 0, crooms);
  crooms.forEach((r, i) => { b.paper(r.x0, r.y0, r.x1, r.y1, papers[(i + (r.x0 >> 2)) % 4]); b.addRoom('The Crawl', 'bh_crawl', r.x0, r.y0, r.x1, r.y1, { circuit: C_CRAWL, temp: 23 }); });
  // the Deep End: a big pit at the far end of the maze, netted all round, one way in
  const DE: Rect = { x0: DEEP.x0 - 2, y0: CRAWL.y0, x1: CRAWL.x1, y1: CRAWL.y1 };
  b.vwall(DE.x0, DE.y0, DE.y1, 'drywall');
  for (const y of [86, 87]) b.clearW(DE.x0, y);
  b.paper(DE.x0, DE.y0, DE.x1, DE.y1, BX_PAPERS.mural);
  b.addRoom('The Deep End', 'bh_deep', DE.x0, DE.y0, DE.x1, DE.y1, { circuit: C_CRAWL, temp: 23 });
  ballPit(c, DEEP, ['n', 's', 'e', 'w']);
  for (let x = 41; x <= 44; x++) b.clearN(x, CRAWL.y0);
  for (let x = 100; x <= 102; x++) b.clearN(x, CRAWL.y0);
  crooms.forEach((r, i) => {
    if (hh(i, 1, 9301) < 0.45) put(c, 'bx_softblock', rng.int(r.x0, r.x1), rng.int(r.y0, r.y1), rng.int(0, 3) as Rot, { v: rng.int(0, 5), c: softColour() });
    if (hh(i, 2, 9301) < 0.25) put(c, 'bx_balloon_floor', rng.int(r.x0, r.x1), rng.int(r.y0, r.y1), 0, { v: rng.int(0, 2) });
    if (hh(i, 3, 9301) < 0.18) f.floorItem(rng.pick(['socks', 'gumball', 'prize_tickets', 'lollipop']), rng.int(r.x0, r.x1), rng.int(r.y0, r.y1));
    const lx = (r.x0 + r.x1) >> 1, ly = (r.y0 + r.y1) >> 1;
    b.light(lx + 0.5, ly + 0.5, 'fluoro', { color: LIGHT, intensity: 0.9, radius: Math.max(4, Math.min(6.5, (r.x1 - r.x0 + r.y1 - r.y0) * 0.4)), circuit: C_CRAWL, flicker: hh(i, 4, 9301) < 0.15 ? 0.3 : 0 });
  });
  lights(b, DE, 5, C_CRAWL, rng, 0.25);
  f.floorItem('note', DE.x0 + 2, DE.y1 - 2, { lore: 'bx_wristbands' });

  // ============================================================ the fire exit to the playground (when there is one)
  if (zoneSpec('playground')) {
    for (const y of [FIRE.y, FIRE.y + 1]) b.door(FIRE.x + 1, y, 1, 'door_metal', { portal: 'bh_to_pg', sign: 'exit' });
    b.portal({ id: 'bh_to_pg', x: FIRE.x, y: FIRE.y, kind: 'door', to: 'playground', tx: 10, ty: 10, anchor: 'r_pg_ballhouse', label: 'Go out to the playground' });
    arrive(b, 'bh_from_pg', FIRE.x - 2, FIRE.y, 'w', 2);
    // the playground's soft-play hut (src/world/gen/z_playground.ts, portal pg_ballhouse) lands here too
    arrive(b, 'pg_from_playground', FIRE.x - 2, FIRE.y + 1, 'w', 0);
    b.clearObjects(FIRE.x - 3, FIRE.y - 2, FIRE.x, FIRE.y + 2);
    mount(b, 'zw_plate', FIRE.x, FIRE.y - 1, 'e', { label: 'FIRE EXIT - PLAYGROUND' });
  }

  // ============================================================ wear: confetti trodden in, juice, scuffs
  for (let i = 0; i < 70; i++) {
    const x = rng.int(3, W - 4), y = rng.int(3, H - 4);
    if (!z.floor[z.idx(x, y)] || z.height[z.idx(x, y)] < 0) continue;
    decal(z, rng.pick(['bx_confetti', 'bx_confetti', 'bx_juice', 'decal_stain_dark']), x + 0.5, y + 0.5, rng.float(0.7, 1.5), rng.float(0.7, 1.5), rng.float(0, 6.28), undefined, 0.75);
  }

  connectRegions(z, b, ENTRY.x + 3, ENTRY.y, rng, { keep: [] });
  b.flag(ENTRY.x, ENTRY.y - 4, ENTRY.x + 6, ENTRY.y + 4, TF.NOSPAWN);
  for (const k of [C_MAIN, C_PARTY, C_STAFF, C_CRAWL]) z.power.set(k, true);
  z.env = {
    ...z.env,
    ambient: 0xe0ded8, ambientI: 0.66, fog: 0xd8d6e0, fogNear: 26, fogFar: 64, void: 0x1a1a24, temp: 22,
    sky: false, grade: 'mall', reverb: 'mall', ambience: 'ballhouse', music: 'muzak', weather: 'none',
  } as Zone['env'];
  // the kids (src/creatures/species/timmy.ts), and the odd stuffed toy that got left behind
  z.spawnTable = [['timmy', 8], ['plushkin', 0.4]];
  z.creatureCap = 9;
  z.meta.terminalLore = ['bx_calder', 'bx_closing'];
}

defZone({
  key: 'ballhouse', name: 'The Ball House', W, H, depth: 3,
  blurb: 'An indoor play-place: ball pits, padded tubes, party rooms, a prize counter. It smells of socks and sugar. It goes on further than the building does, and the kids never went home.',
  gen: (z, s) => { generateBallHouse(z, s); },
});

// ---------------------------------------------------------------- the ways in: Westgate Mall's food court, and the playground
onZoneGenerated((z, seed) => {
  if (z.key === 'mall') {
    const rng = new Rng(hash3(seed, 9401, 3));
    const b = new ZoneBuilder(z, rng);
    const c: Ctx = { z, b, f: new Furnisher(b, rng), rng, seed };
    // glass doors in the food court's east wall, a sign, somewhere to land
    b.clearObjects(181, 20, 185, 28);
    for (const y of [24, 25]) b.door(186, y, 1, 'door_glass', { portal: 'p_mall_ballhouse' });
    b.portal({ id: 'p_mall_ballhouse', x: 185, y: 24, kind: 'door', to: 'ballhouse', tx: ENTRY.x + 3, ty: ENTRY.y, anchor: 'bh_from_mall', label: 'Go into the Ball House' });
    arrive(b, 'r_mall_ballhouse', 183, 25, 'w', 2);
    force(c, 'vx_sign', 183, 21, 0, { text: 'BALL HOUSE|PLAY * PARTIES * PRIZES', c: 0xd8584a, ink: 0xfff4e0 });
    b.obj('bx_balloons', 184, 27, 0, { v: 2 });
    return;
  }
  if (z.key === 'playground') {
    // the playground's own generator may already have a way in; if not, a padded arch
    if (z.portals.some((p) => p.to === 'ballhouse')) {
      const a = z.meta.anchors || {};
      if (!a.r_pg_ballhouse) { const p = z.portals.find((q) => q.to === 'ballhouse')!; arrive(new ZoneBuilder(z, new Rng(seed)), 'r_pg_ballhouse', p.x, p.y + 2 < z.H ? p.y + 2 : p.y - 2, 's', 1); }
      return;
    }
    const rng = new Rng(hash3(seed, 9403, 5));
    const b = new ZoneBuilder(z, rng);
    const c: Ctx = { z, b, f: new Furnisher(b, rng), rng, seed };
    const p = findOpenRect(z, 4, 4, rng, 900, 2);
    if (!p) return;
    const [x, y] = p;
    force(c, 'bx_arch', x + 1, y + 1, 0, { portal: 'pg_to_ballhouse' });
    b.portal({ id: 'pg_to_ballhouse', x: x + 1, y: y + 1, kind: 'door', to: 'ballhouse', tx: FIRE.x - 2, ty: FIRE.y, anchor: 'bh_from_pg', label: 'Go into the Ball House' });
    arrive(b, 'r_pg_ballhouse', x + 1, y + 3, 's', 1);
  }
});
