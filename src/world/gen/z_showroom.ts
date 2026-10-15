// The Showroom (176×128). A furniture store the size of a district, laid out
// as one long path you are meant to follow: room sets on both sides — living
// rooms, kitchens, bedrooms, dining rooms, offices, nurseries, bathrooms —
// each one priced, each one repeated further on with something small changed:
// someone is sitting on the sofa now, the dinner is served, everything has
// been hung from the ceiling, the bed is occupied. Then the cafeteria, then
// the self-serve warehouse, whose racking aisles run east and west forever.
// One living room set has a front door in its back wall, under a banner
// that says YOU ARE HOME.
import { defZone } from '../worldGraph';
import { Zone, TF } from '../zone';
import { ZoneBuilder } from './builder';
import { Furnisher } from './furnish';
import { Rng } from '../../core/rng';
import {
  Ctx, Rot, Side, FACE, arrive, put, force, mount, decal, hh, hopperAt, lamp, isOpen, floorRect, unitFrame,
  itemAtW, objCentre, rotLocal, loopSeamsX,
} from './weird_kit';
import { objDef } from '../objects';

const W = 176, H = 128;
const C_ENT = 1, C_FLOOR = 2, C_CAFE = 3, C_WARE = 4, C_SETS = 5;
// the room-set floor: set rows and the aisles between them (y)
const SET_X0 = 5, SET_W = 8, SET_N = 11;          // sets at x 5..92
const ROWS: { y0: number; open: Side }[] = [
  { y0: 15, open: 's' }, { y0: 24, open: 'n' }, { y0: 30, open: 's' }, { y0: 39, open: 'n' }, { y0: 45, open: 's' }, { y0: 54, open: 'n' },
];
const SET_D = 6;
const AISLES = [{ y0: 21, y1: 23, dir: 1 }, { y0: 36, y1: 38, dir: -1 }, { y0: 51, y1: 53, dir: 1 }];
const WARE_Y0 = 64, WARE_Y1 = 125;
const WX = 24, EX = 151, WD = 128;                 // warehouse seams: 24 → 152, 151 → 23

type Kind = 'living' | 'kitchen' | 'bedroom' | 'dining' | 'office' | 'nursery' | 'bathroom';
const KINDS: Kind[] = ['living', 'kitchen', 'bedroom', 'dining', 'office', 'nursery', 'living', 'bathroom', 'dining', 'bedroom', 'kitchen'];
const KIT: Record<Kind, { floor: string; paper: string; banner: number; price: number[] }> = {
  living: { floor: 'carpet_hotel', paper: 'wall_house_floral', banner: 0, price: [0, 7, 1] },
  kitchen: { floor: 'tile_kitchen', paper: 'wall_kitchen', banner: 1, price: [2, 4, 8] },
  bedroom: { floor: 'carpet_office', paper: 'wall_house_stripe', banner: 2, price: [1, 3, 7] },
  dining: { floor: 'wood', paper: 'wall_paneling', banner: 5, price: [5, 2, 6] },
  office: { floor: 'carpet_office', paper: 'wall_office', banner: 3, price: [4, 6, 2] },
  nursery: { floor: 'carpet_kids', paper: 'wall_kids', banner: 4, price: [8, 6, 9] },
  bathroom: { floor: 'tile_white', paper: 'wall_bathroom', banner: 9, price: [6, 10, 11] },
};

export function generateShowroom(z: Zone, seed: number) {
  const rng = new Rng(seed);
  const b = new ZoneBuilder(z, rng);
  const f = new Furnisher(b, rng);
  const c: Ctx = { z, b, f, rng, seed };
  z.name = 'The Showroom';

  // ============================================================ the shop floor shell
  floorRect(b, 2, 2, 141, 60, 'concrete', 'zw_wall_showroom');
  b.roomWalls(2, 2, 141, 60, 'cinder');
  b.addRoom('Showroom', 'showroom', 2, 2, 141, 60, { circuit: C_FLOOR, temp: 19 });

  // ============================================================ entrance hall (north-west): from Westgate
  floorRect(b, 2, 2, 60, 12, 'terrazzo', 'zw_wall_showroom');
  b.hwall(2, 60, 13, 'cinder');
  b.vwall(61, 2, 12, 'cinder');
  b.addRoom('Entrance', 'entrance', 2, 2, 60, 12, { circuit: C_ENT });
  for (const y of [6, 7, 8]) b.door(2, y, 1, 'door_glass', { portal: y === 7 ? 'r_mall_showroom' : undefined, open: false });
  b.portal({ id: 'r_mall_showroom', x: 2, y: 7, kind: 'door', to: 'mall', tx: 184, ty: 77, label: 'Go back out into Westgate Mall' });
  arrive(b, 'p_mall_showroom', 4, 7, 'e', 3);
  // the way into the path: the entrance opens onto aisle 1's west end
  for (let x = 3; x <= 4; x++) b.gap(x, 13, 0);
  b.obj('zw_banner', 8, 5, 0, { v: 9 });
  b.obj('zw_banner', 24, 6, 0, { v: 8 });
  put(c, 'reception_desk', 12, 2, 0, {}); put(c, 'chair_office', 12, 3, 2, {});
  mount(b, 'zg_directory', 16, 2, 'n');
  for (let x = 20; x <= 26; x++) for (let k = 0; k < 2; k++) if (hh(x, k, 5001) < 0.8) put(c, 'shopping_cart', x, 10 + k, 1, {});
  for (let x = 30; x <= 44; x += 3) put(c, 'zw_flat_trolley', x, 3, 0, {});
  put(c, 'plant_tall', 3, 2, 0, {}); put(c, 'plant_tall', 3, 12, 0, {});
  put(c, 'vending_soda', 50, 2, 0, {}); put(c, 'vending_snack', 51, 2, 0, {});
  put(c, 'zw_bargain_bin', 55, 8, 0, {}); put(c, 'zw_bargain_bin', 57, 8, 0, {});
  mount(b, 'zw_plate', 6, 13, 's', { label: 'THIS WAY' });
  f.floorItem('note', 13, 5, { lore: 'zw_showroom_memo' });
  for (let x = 6; x <= 58; x += 6) lamp(b, x, 7, 'fluoro', C_ENT, { intensity: 0.7, radius: 6 });
  hopperAt(c, 8, 9, 0);

  // ============================================================ the path: room sets along three aisles
  const sets: { x0: number; y0: number; x1: number; y1: number; open: Side; kind: Kind; v: number; idx: number }[] = [];
  let idx = 0;
  ROWS.forEach((r, ri) => {
    for (let k = 0; k < SET_N; k++) {
      const x0 = SET_X0 + k * SET_W, x1 = x0 + SET_W - 1, y0 = r.y0, y1 = r.y0 + SET_D - 1;
      const kind = KINDS[(k + ri * 3) % KINDS.length];
      // variants climb as you go deeper: the first time is normal, later ones are wrong
      const depth = ri * SET_N + k;
      const v = depth < 6 ? 0 : 1 + Math.floor(hh(k, ri, 5011) * 4);
      sets.push({ x0, y0, x1, y1, open: r.open, kind, v, idx: idx++ });
    }
  });
  // the door home: a living room set in row 4
  const homeSet = sets.find((s) => s.y0 === ROWS[3].y0 && s.kind === 'living' && s.x0 > 40) || sets[3 * SET_N + 6];
  homeSet.kind = 'living'; homeSet.v = 9;
  for (const s of sets) roomSet(c, s.x0, s.y0, s.x1, s.y1, s.open, s.kind, s.v, s.idx);
  // aisles: painted path edges and arrows; the shortcuts at alternate ends
  AISLES.forEach((a, i) => {
    floorRect(b, 3, a.y0, 100, a.y1, 'linoleum');
    b.addRoom('The Path', 'path', 3, a.y0, 100, a.y1, { circuit: C_FLOOR });
    for (let x = 3; x <= 100; x++) {
      decal(z, 'zw_walk_path', x + 0.5, a.y0 + 0.1, 1.0, 0.14, 0, undefined, 1);
      decal(z, 'zw_walk_path', x + 0.5, a.y1 + 0.9, 1.0, 0.14, 0, undefined, 1);
      if (x % 6 === 3) decal(z, 'decal_arrow_floor', x + 0.5, a.y0 + 1.5, 1.1, 1.1, a.dir > 0 ? Math.PI / 2 : -Math.PI / 2, 0x8aa8d8, 0.9);
      if (x % 4 === 1) lamp(b, x, a.y0 + 1, 'fluoro', C_FLOOR, { intensity: 0.75, radius: 6, flicker: hh(x, i, 5021) < 0.06 ? 0.2 : 0, broken: hh(x, i, 5022) < 0.05 });
      if (x % 9 === 0 && x > 4 && x < 99) put(c, 'zw_price_stand', x, a.y0 + (i % 2 ? 2 : 0), 0, { v: (x + i) % 12 });
    }
    // wrongness on the path itself: an armchair in the middle of the aisle, facing back the way you came
    put(c, 'armchair', 40 + i * 17, a.y0 + 1, a.dir > 0 ? 3 : 1, {});
  });
  // connectors: aisle 1 → 2 at the east end, aisle 2 → 3 at the west end (the "shortcuts")
  floorRect(b, 97, 21, 100, 38, 'linoleum'); b.addRoom('Shortcut', 'path', 97, 21, 100, 38, { circuit: C_FLOOR });
  floorRect(b, 1, 36, 4, 53, 'linoleum'); b.addRoom('Shortcut', 'path', 2, 36, 4, 53, { circuit: C_FLOOR });
  mount(b, 'zw_plate', 98, 21, 'n', { label: 'THIS WAY' });
  mount(b, 'zw_plate', 3, 36, 'n', { label: 'THAT WAY' });
  // the path's end: aisle 3 runs on east into the cafeteria corridor
  floorRect(b, 101, 51, 103, 53, 'linoleum');

  // ============================================================ the cafeteria (east)
  floorRect(b, 101, 2, 141, 40, 'linoleum_school', 'wall_kitchen');
  b.roomWalls(101, 2, 141, 40, 'cinder');
  b.addRoom('Cafe', 'cafeteria', 101, 2, 141, 40, { circuit: C_CAFE, temp: 21 });
  for (let y = 21; y <= 23; y++) b.gap(101, y, 1);       // from aisle 1's east end
  for (let x = 120; x <= 122; x++) b.gap(x, 41, 0);      // down to the warehouse corridor
  put(c, 'food_court_counter', 106, 2, 0, {}); put(c, 'food_court_counter', 110, 2, 0, {}); put(c, 'food_court_counter', 114, 2, 0, {});
  mount(b, 'zw_cafe_menu', 118, 2, 'n'); mount(b, 'zw_cafe_menu', 104, 2, 'n');
  put(c, 'fridge', 121, 2, 0, {}); put(c, 'fridge', 122, 2, 0, {}); put(c, 'vending_soda', 124, 2, 0, {});
  const FOODS = ['sandwich', 'salad', 'soup_pot', 'bread_slice', 'apple', 'cookies', 'juice_box', 'donut', 'birthday_cake'];
  for (let y = 8; y <= 34; y += 4) for (let x = 104; x <= 136; x += 4) {
    const t = put(c, 'cafeteria_table', x, y, 0, {});
    if (!t) continue;
    // the child meal is free, and there is one on every table
    const [cx, cy] = objCentre(t);
    if (hh(x, y, 5031) < 0.6) itemAtW(z, rng, FOODS[Math.floor(hh(x, y, 5032) * FOODS.length)], cx - 0.4, cy - 0.3, 0.75);
    if (hh(x, y, 5033) < 0.4) itemAtW(z, rng, 'juice_box', cx + 0.3, cy + 0.2, 0.75);
    if (hh(x, y, 5034) < 0.12) put(c, 'replica_seated', x - 1, y + 1, 1, { pose: 'sit_table', seat: 'chair_plastic' });
    else if (hh(x, y, 5035) < 0.1) put(c, 'replica_child', x + 2, y, 3, { pose: 'child' });
  }
  // the children's corner: a little table, little chairs, crayon drawings of the house
  put(c, 'zw_kids_table', 132, 36, 0, {});
  for (const [x, y, r] of [[132, 35, 0], [133, 35, 0], [132, 37, 2], [133, 37, 2]] as const) put(c, 'zw_kids_chair', x, y, r as Rot, { v: x + y });
  put(c, 'replica_child', 134, 36, 3, { pose: 'child' });
  put(c, 'teddy_giant', 139, 39, 3, {});
  f.floorItem('note', 131, 36, { lore: 'zw_home_child' });
  for (let y = 6; y <= 38; y += 6) for (let x = 105; x <= 139; x += 6) lamp(b, x, y, 'fluoro', C_CAFE, { color: 0xfff0d8, flicker: hh(x, y, 5036) < 0.1 ? 0.2 : 0 });

  // ============================================================ corridor to the warehouse
  floorRect(b, 101, 41, 141, 60, 'concrete', 'zw_wall_showroom');
  b.hwall(101, 141, 41, 'cinder');
  b.addRoom('Collection Point', 'collection', 101, 41, 141, 60, { circuit: C_FLOOR });
  for (let y = 51; y <= 53; y++) b.gap(101, y, 1);
  b.obj('zw_banner', 112, 46, 0, { v: 7 });
  for (let x = 104; x <= 138; x += 4) put(c, 'zw_flatpack', x, 58, 0, { v: x % 4 });
  for (let x = 106; x <= 134; x += 7) put(c, 'zw_flat_trolley', x, 48, 1, {});
  put(c, 'zw_bargain_bin', 130, 44, 0, {}); put(c, 'zw_bargain_bin', 132, 44, 0, {});
  for (let x = 104; x <= 140; x += 6) lamp(b, x, 50, 'fluoro', C_FLOOR, { intensity: 0.6 });
  mount(b, 'zw_plate', 118, 60, 's', { label: 'WAREHOUSE' });

  // ============================================================ the self-serve warehouse (endless east-west)
  floorRect(b, 0, WARE_Y0 - 3, W - 1, WARE_Y1, 'concrete', 'zw_wall_showroom');
  b.hwall(0, W - 1, 61, 'cinder');
  b.hwall(0, W - 1, WARE_Y1 + 1, 'cinder');
  b.vwall(0, 61, WARE_Y1, 'cinder'); b.vwall(W, 61, WARE_Y1, 'cinder');
  b.addRoom('Self-serve Warehouse', 'warehouse', 0, 61, W - 1, WARE_Y1, { circuit: C_WARE, temp: 14, lootMul: 1.3 });
  // the ramp down from the collection point: a wide opening in the warehouse's north wall
  for (let x = 120; x <= 123; x++) b.gap(x, 61, 0);
  // periodic racking (period 16): rows of back-to-back racks with cross aisles every 16
  const PU = (x: number) => ((x % 16) + 16) % 16;
  for (let y = WARE_Y0 + 2; y + 1 <= WARE_Y1 - 4; y += 6) for (let x = 0; x < W; x++) {
    const u = PU(x);
    if (u >= 12) continue; // cross aisles (4 wide)
    if (u % 2 !== 0) continue;
    if (x >= 52 && x <= 92 && y <= WARE_Y0 + 3) continue; // the checkouts' clearing
    put(c, 'zw_rack', x, y, 0, { v: Math.floor(hh(u, y, 5041) * 3) });
    put(c, 'zw_rack', x, y + 1, 2, { v: Math.floor(hh(u, y + 1, 5042) * 3) });
    if (hh(u, y, 5043) < 0.18) put(c, 'zw_flatpack', x, y + 3, 0, { v: u % 4 });
  }
  for (let x = 0; x < W; x++) {
    const u = PU(x);
    if (u === 13) for (let y = WARE_Y0 + 2; y <= WARE_Y1 - 4; y += 6) b.obj('zg_aisle_sign', x, y + 3, 0, { label: String(((y - WARE_Y0) / 6) | 0), cat: (y >> 2) % 4 });
    if (u % 8 === 2) for (let y = WARE_Y0; y <= WARE_Y1; y += 6) b.obj('zw_highbay', x, y, 0, {});
    if (u === 14 && hh(u, 0, 5044) < 1) for (let y = WARE_Y0 + 4; y <= WARE_Y1 - 2; y += 12) put(c, 'zw_flat_trolley', x, y, 0, {});
  }
  // the checkouts (unique window, well away from the seams)
  for (let x = 54; x <= 90; x += 4) {
    put(c, 'checkout_counter', x, WARE_Y0 + 1, 0, {});
    const reg = z.objectsAt(x, WARE_Y0 + 1).find((o) => o.key === 'checkout_counter');
    if (reg) f.onTop('cash_register', reg, {});
  }
  f.floorItem('note', 70, WARE_Y0 + 3, { lore: 'zw_showroom_receipt' });
  f.floorItem('note', 60, 80, { lore: 'zw_assembly' });
  for (let i = 0; i < 26; i++) { const x = rng.int(40, 104), y = rng.int(WARE_Y0, WARE_Y1); if (isOpen(z, x, y)) f.floorLoot('zw_floor_showroom', x, y); }
  b.flag(0, 61, WX, WARE_Y1, TF.NOSPAWN); b.flag(EX, 61, W - 1, WARE_Y1, TF.NOSPAWN);
  loopSeamsX(b, WX, EX, WD, 61, WARE_Y1, 'ware_loop');

  // ============================================================ env
  for (const cc of [C_ENT, C_FLOOR, C_CAFE, C_WARE, C_SETS]) z.power.set(cc, true);
  z.env = {
    ...z.env,
    ambient: 0x3a3a38, ambientI: 0.6, fog: 0x1e1e1c, fogNear: 16, fogFar: 38, void: 0x0a0a09, temp: 19,
    grade: 'market', reverb: 'mall', ambience: 'market', music: 'muzak',
  };
  z.spawnTable = [['still_life', 4], ['davenport', 1.5], ['hollow', 1], ['employee', 1.5], ['swivel', 1], ['plushkin', 0.6], ['plenum', 0.8], ['stammer', 0.6]];
  z.creatureCap = 8;
  z.meta.terminalLore = ['zw_showroom_memo', 'zw_assembly', 'terminal_generic'];
}

// ============================================================ a room set
function roomSet(c: Ctx, x0: number, y0: number, x1: number, y1: number, open: Side, kind: Kind, v: number, idx: number) {
  const { b, z, f } = c;
  const K = KIT[kind];
  floorRect(b, x0, y0, x1, y1, K.floor, K.paper);
  // three walls; the open side faces the aisle
  if (open !== 'n') b.hwall(x0, x1, y0, 'drywall');
  if (open !== 's') b.hwall(x0, x1, y1 + 1, 'drywall');
  b.vwall(x0, y0, y1, 'drywall'); b.vwall(x1 + 1, y0, y1, 'drywall');
  const F = unitFrame(x0, y0, x1, y1, open);
  const label = kind === 'living' && v === 9 ? 'Living Room 14' : kind[0].toUpperCase() + kind.slice(1) + ' Set';
  b.addRoom(label, 'roomset_' + kind, x0, y0, x1, y1, { circuit: C_SETS, lootMul: 1.2 });
  const putU = (key: string, u: number, vv: number, r: Rot, state: Record<string, any> = {}, w = 1, d = 1) => {
    const along = F.alongU(r);
    const [x, y] = F.span(u, vv, along ? w : d, along ? d : w);
    return put(c, key, x, y, r, state);
  };
  const forceU = (key: string, u: number, vv: number, r: Rot, state: Record<string, any> = {}) => { const [x, y] = F.P(u, vv); return c.b.obj(key, x, y, r, state); };
  const upside = (key: string, u: number, vv: number, r: Rot, st: Record<string, any> = {}) => { const [x, y] = F.P(u, vv); return b.obj('zw_upside_down', x, y, r, { of: key, ofState: st }); };
  const front = F.toFront, back = F.toBack;
  const lf = FACE[F.left], rf = FACE[F.right];
  const D = F.D;
  // banner over the open side, price stands at the front corners
  const [bx, by] = F.P(3, 1);
  b.obj('zw_banner', bx, by, 0, { v: v === 9 ? 9 : KIT[kind].banner });
  putU('zw_price_stand', 0, 0, front, { v: K.price[v % 3] });
  if (v === 3) putU('zw_price_stand', 7, 0, front, { v: 9 });
  else if (v === 4) putU('zw_price_stand', 7, 0, front, { v: 11 });
  // the floor of the set: a rug where it suits
  const [rx, ry] = F.P(3.5, 3);
  if (kind === 'living' || kind === 'bedroom' || kind === 'dining') decal(z, 'carpet_rug', rx + 0.5, ry + 0.5, 3.6, 2.6, 0, [0xb87a5a, 0x7a8ab0, 0x9a6a48][idx % 3], 0.95);
  // warm lamps inside every set
  const [lx, ly] = F.P(3, 3);
  lamp(b, lx, ly, 'bulb', C_SETS, { color: 0xffd8a8, intensity: 0.75, radius: 4.5, flicker: v === 2 ? 0.25 : 0 });

  if (kind === 'living') {
    if (v === 1) { // everything hung from the ceiling, exactly where it would stand
      upside('sofa', 3, D - 1, front); upside('armchair', 1, 3, rf); upside('armchair', 6, 3, lf);
      upside('coffee_table', 3, 3, front); upside('tv_stand', 3, 1, back); upside('lamp_floor', 0, D - 1, front);
      return;
    }
    putU('sofa', 3, D - 1, front, {}, 2, 1);
    putU('armchair', 1, 3, rf); putU('armchair', 6, 3, lf);
    putU('coffee_table', 3, 3, front); putU('coffee_table', 4, 3, front);
    const tv = putU('tv_stand', 3, 1, back);
    if (tv) f.onTop(v === 2 || v === 9 ? 'zw_tv_console' : 'tv_crt', tv, { on: v >= 2 });
    putU('lamp_floor', 0, D - 1, front); putU('bookshelf', 7, D - 1, front); putU('plant_potted', 5, D - 1, front);
    const [px, py] = F.P(1, D - 1); mount(b, 'zw_portrait', px, py, open === 's' ? 'n' : 's', { v: idx % 4 });
    if (v === 2 || v === 4 || v === 9) {
      // someone is already sitting here, watching
      const [sx, sy] = F.P(3, D - 1); c.b.obj('replica_seated', sx, sy, front, { pose: 'sit', seat: 'none' });
      if (v === 9) { const [s2x, s2y] = F.P(4, D - 1); c.b.obj('replica_seated', s2x, s2y, front, { pose: 'sit', seat: 'none' }); putU('replica_child', 6, 2, lf, { pose: 'child' }); }
    }
    if (v === 3) { // the armchair has been turned to face the wall
      const ac = z.objectsAt(...F.P(6, 3)).find((o) => o.key === 'armchair'); if (ac) ac.rot = FACE[open === 's' ? 'n' : 's'];
    }
    if (v === 9) {
      // the front door in the back wall of the set: it opens onto a hallway that is not in this building
      const [dx, dy] = F.P(5, D - 1);
      const side = open === 's' ? 0 : 0;
      const ey = open === 's' ? dy : dy + 1;
      b.clearObjects(dx, dy, dx, dy);
      b.door(dx, ey, side as 0, 'door_red', { portal: 'p_showroom_home' });
      b.portal({ id: 'p_showroom_home', x: dx, y: dy, kind: 'door', to: 'homestead', tx: 20, ty: 20, label: 'Open the front door' });
      const [ax, ay] = F.P(5, D - 2);
      arrive(b, 'r_showroom_home', ax, ay, open === 's' ? 's' : 'n', 1);
      putU('zw_coat_hooks', 6, D - 1, back);
      f.floorItem('note', ax, ay, { lore: 'zw_home_note' });
    }
  } else if (kind === 'kitchen') {
    const keys = ['counter_kitchen', 'stove', 'counter_kitchen', 'counter_sink', 'counter_kitchen', 'counter_kitchen', 'fridge'];
    keys.forEach((k, i) => {
      const o = putU(k, 1 + i, D - 1, front);
      if (k !== 'fridge') { const [wx, wy] = F.P(1 + i, D - 1); mount(b, 'kitchen_cabinet_wall', wx, wy, open === 's' ? 'n' : 's'); }
      if (o && i === 0) f.onTop('microwave', o, {}); if (o && i === 4) f.onTop('toaster', o, {}); if (o && i === 5) f.onTop('coffee_maker', o, {});
    });
    if (v >= 2) {
      const t = putU('table_dining', 3, 2, front, {}, 2, 1);
      if (t) { f.onTop('zw_table_setting', t, { v: 2 }); dinner(c, t, 2); }
      for (const [u, vv, r] of [[3, 1, back], [4, 1, back], [3, 3, front], [4, 3, front]] as const) putU('chair_wood', u, vv, r as Rot);
      if (v === 4) { const [sx, sy] = F.P(3, 3); z.objectsAt(sx, sy).filter((o) => o.key === 'chair_wood').forEach((o) => z.removeObject(o)); c.b.obj('replica_seated', sx, sy, front, { pose: 'sit_table', seat: 'chair_wood' }); }
    } else {
      putU('table_round', 3, 2, front); putU('chair_wood', 2, 2, rf); putU('chair_wood', 4, 2, lf); putU('chair_wood', 3, 1, back);
    }
    putU('trash_can', 0, D - 1, front);
  } else if (kind === 'bedroom') {
    if (v === 2 || v === 4) putU('replica_lying', 3, D - 2, front, { bed: 'bed_single' }, 1, 2);
    else putU('bed_double', 3, D - 2, front, {}, 2, 2);
    const n1 = putU('nightstand', 2, D - 1, front), n2 = putU('nightstand', 5, D - 1, front);
    if (n1) f.onTop('lamp_table', n1, {}); if (n2) f.onTop('lamp_table', n2, {});
    putU('wardrobe', 7, D - 1, front); putU('dresser', 0, 2, rf);
    if (v === 3) { putU('bed_single', 6, 1, lf, {}, 1, 2); }
    const [px, py] = F.P(4, D - 1); mount(b, 'zw_portrait', px, py, open === 's' ? 'n' : 's', { v: (idx + 1) % 4 });
  } else if (kind === 'dining') {
    const t = putU('table_dining', 3, 3, front, {}, 2, 1);
    if (t) { f.onTop('zw_table_setting', t, { v: v === 3 ? 1 : 0 }); if (v >= 1) dinner(c, t, v === 3 ? 1 : 0); }
    const chairs: [number, number, Rot][] = [[3, 2, back], [4, 2, back], [3, 4, front], [4, 4, front], [2, 3, rf], [5, 3, lf]];
    chairs.forEach(([u, vv, r], i) => {
      if (v >= 1 && v !== 3 && i < 4 && hh(idx, i, 5051) < 0.7) putU('replica_seated', u, vv, r, { pose: 'sit_table', seat: 'chair_wood' });
      else if (v >= 1 && i === 5) putU('replica_child', u, vv, r, { pose: 'sit_table', seat: 'zw_highchair' });
      else putU('chair_wood', u, vv, r);
    });
    putU('dresser', 3, D - 1, front, { loot: 'kitchen_cabinet' }); putU('plant_potted', 7, D - 1, front);
    const [px, py] = F.P(2, D - 1); mount(b, 'zw_portrait', px, py, open === 's' ? 'n' : 's', { v: (idx + 2) % 4 });
  } else if (kind === 'office') {
    const d = putU('desk_office', 3, 3, front, {}, 2, 1);
    if (d) f.onTop('computer', d, {});
    putU('chair_office', 3, 4, v === 3 ? back : back);
    if (v === 3) { const [cx, cy] = F.P(3, 4); const ch = z.objectsAt(cx, cy).find((o) => o.key === 'chair_office'); if (ch) ch.rot = front; }
    putU('bookshelf', 1, D - 1, front); putU('bookshelf', 2, D - 1, front); putU('filing_cabinet', 6, D - 1, front); putU('filing_cabinet', 7, D - 1, front);
    putU('lamp_floor', 0, 2, front); putU('plant_potted', 7, 1, front);
    if (v === 2) putU('replica_seated', 4, 4, back, { pose: 'sit_table', seat: 'chair_office' });
  } else if (kind === 'nursery') {
    putU('crib', 1, D - 1, front); putU('toy_box', 3, D - 1, front); putU('dollhouse', 5, D - 1, front);
    putU('rocking_horse', 6, 2, lf); putU('zw_kids_table', 2, 2, front, {}, 2, 1);
    putU('zw_kids_chair', 2, 1, back, { v: idx }); putU('zw_kids_chair', 3, 3, front, { v: idx + 1 });
    if (v >= 2) putU('replica_child', 2, 3, front, { pose: 'child' });
    putU('teddy_giant', 7, D - 1, front);
  } else if (kind === 'bathroom') {
    if (v >= 2) { // the bathroom has been turned on its side: everything stands on the back wall
      const wall: Side = open === 's' ? 'n' : 's';
      const at = (u: number, key: string, h: number) => { const [x, y] = F.P(u, D - 1); return mount(b, 'zw_on_wall', x, y, wall, { of: key, h }); };
      at(1, 'toilet', 1.3); at(3, 'sink_bathroom', 1.2); at(6, 'bathtub', 1.1);
      const [mx, my] = F.P(3, 2); b.obj('zw_upside_down', mx, my, 0, { of: 'towel_rack' });
      f.floorItem('toilet_paper', mx, my);
    } else {
      putU('bathtub', 5, D - 1, front, {}, 2, 1); putU('toilet', 1, D - 1, front); putU('sink_bathroom', 3, D - 1, front);
      const [mx, my] = F.P(3, D - 1); mount(b, 'mirror', mx, my, open === 's' ? 'n' : 's');
    }
    putU('laundry_basket', 7, 1, front);
  }
  void forceU; void objDef;
}

/** real food on the plates of a zw_table_setting on table `t` (variant v of the setting) */
function dinner(c: Ctx, t: ReturnType<typeof put>, v: number) {
  if (!t) return;
  const [cx, cy] = objCentre(t);
  const seats: [number, number][] = [[-0.5, 0.27], [0.5, 0.27], [-0.5, -0.27], [0.5, -0.27], [-0.82, 0], [0.82, 0]];
  const menu = v === 1 ? ['birthday_cake', 'cookies', 'juice_box', 'candy_bar'] : v === 2 ? ['bread_slice', 'apple', 'eggs', 'milk'] : ['stew', 'sandwich', 'salad', 'bread_slice', 'potato'];
  seats.forEach(([lx, lz], i) => {
    const [wx, wz] = rotLocal(t.rot, lx, lz);
    if (hh(t.x + i, t.y, 5061) < 0.85) itemAtW(c.z, c.rng, menu[i % menu.length], cx + wx, cz(cy, wz), 0.79);
  });
  if (v === 1) itemAtW(c.z, c.rng, 'birthday_cake', cx, cy, 0.79);
}
const cz = (cy: number, wz: number) => cy + wz;

defZone({
  key: 'showroom', name: 'The Showroom', W, H, depth: 2,
  blurb: 'Warehouse light, the smell of new carpet and sawdust. Follow the arrows. Every room is for sale, and somebody is already living in some of them.',
  gen: (z, s) => { generateShowroom(z, s); },
});
void ZoneBuilder; void force;
