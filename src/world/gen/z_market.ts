// Foodland (112×96). The supermarket at the east end of Westgate Mall: a
// front end of fifteen checkout lanes, produce and bakery and a dairy wall,
// then eighteen rows of gondolas under fluorescent light. The hanging aisle
// signs read 1, 2, 3, 4, 4, 6, 7, 8, 9, 9 ... and the first aisle 9 is much
// longer than the building: it runs on through the back wall, through the
// warehouse, and never reaches its end. Behind the deli: staff corridor,
// office, break room, the cold room, a warehouse of racking and the loading
// dock whose middle door opens onto the parking garage.
import { defZone } from '../worldGraph';
import { Zone, TF } from '../zone';
import { ZoneBuilder } from './builder';
import { Furnisher } from './furnish';
import { Rng, hash3 } from '../../core/rng';
import { registerShift } from '../shift';
import { connectRegions } from './connect';
import { Ctx, Rot, arrive, put, force, mount, fascia, glow, decal, floorRect, itemOn, scatterLoot, scatterDecals, isOpen } from './mall_kit';
import { ZG_AISLE_CATS } from '../../content/furniture/zg_mall';

const W = 112, H = 96;
const BX0 = 4, BY0 = 4, BX1 = 107, BY1 = 91;     // building interior
const SX0 = 24, SX1 = 79;                         // sales floor
const ROW_Y = (k: number) => 17 + 4 * k;          // gondola rows k = 0..17
const NROWS = 18;
const A9 = 8;                                     // the walkway between rows 8 and 9 is "aisle 9"
const A9_Y0 = ROW_Y(A9) + 1, A9_Y1 = ROW_Y(A9) + 3;
const A9_SEAM = 92, A9_D = 40;
// circuits
const C_FLOOR = 1, C_FRONT = 2, C_BACK = 3, C_WARE = 4, C_A9 = 5, C_DEAD = 6, C_COLD = 7;

/** what each walkway (k = 0..16) is labelled and stocked with: the numbers skip and repeat */
const AISLES: { label: string; cat: string; loot: string }[] = [
  { label: '1', cat: 'CANNED', loot: 'store_food_canned' },
  { label: '2', cat: 'SOUP', loot: 'store_food_canned' },
  { label: '3', cat: 'PASTA', loot: 'store_food_dry' },
  { label: '4', cat: 'CEREAL', loot: 'store_food_dry' },
  { label: '4', cat: 'CEREAL', loot: 'store_food_dry' },
  { label: '6', cat: 'BAKING', loot: 'store_food_dry' },
  { label: '7', cat: 'COFFEE', loot: 'store_food_dry' },
  { label: '8', cat: 'SNACKS', loot: 'store_snacks' },
  { label: '9', cat: 'SOUP', loot: 'store_food_canned' },
  { label: '9', cat: 'DRINKS', loot: 'store_drinks' },
  { label: '11', cat: 'CANDY', loot: 'store_snacks' },
  { label: '12', cat: 'PET FOOD', loot: 'store_food_canned' },
  { label: '13', cat: 'HOUSEHOLD', loot: 'store_household' },
  { label: '13', cat: 'PAPER', loot: 'store_household' },
  { label: '0', cat: 'HEALTH', loot: 'store_pharmacy' },
  { label: '16', cat: 'FROZEN', loot: 'store_frozen' },
  { label: '?', cat: 'BIRTHDAY', loot: 'store_toys' },
];
const catIdx = (cat: string) => Math.max(0, ZG_AISLE_CATS.indexOf(cat));

export function generateMarket(z: Zone, seed: number) {
  const rng = new Rng(seed);
  const b = new ZoneBuilder(z, rng);
  const f = new Furnisher(b, rng);
  const c: Ctx = { z, b, f, rng, seed };
  z.name = 'Foodland';

  // ============================================================ shell
  floorRect(b, BX0, BY0, BX1, BY1, 'linoleum', 'wall_supermarket');
  b.roomWalls(BX0, BY0, BX1, BY1, 'brick');
  b.addRoom('Foodland', 'sales_floor', SX0, BY0, SX1, BY1, { circuit: C_FLOOR, temp: 17 });

  // ============================================================ vestibule (from the mall) — first anchor
  floorRect(b, BX0, 42, 9, 53, 'rubber');
  b.hwall(BX0, 9, 42, 'brick'); b.hwall(BX0, 9, 54, 'brick');
  for (let y = 42; y <= 53; y++) if (y !== 47 && y !== 48) b.vwall(10, y, y, 'glass');
  for (const y of [47, 48]) b.door(BX0, y, 1, 'door_glass', { portal: 'r_mall_market', sign: 'exit' });
  b.portal({ id: 'r_mall_market', x: BX0, y: 47, kind: 'door', to: 'mall', tx: 178, ty: 56, label: 'Go back out to the mall' });
  arrive(b, 'p_mall_market', 7, 47, 'e', 4);
  for (const y of [43, 44, 51, 52]) { put(c, 'shopping_cart', 4, y, 0); put(c, 'shopping_cart', 5, y, 0); }
  put(c, 'coin_ride', 8, 43, 1); put(c, 'gumball_machine', 8, 52, 1);
  mount(b, 'noticeboard', 6, 42, 'n', { lore: 'note_generic' });
  mount(b, 'exit_sign', BX0, 46, 'w');
  glow(b, 6, 45, 'fluoro', C_FRONT); glow(b, 6, 50, 'fluoro', C_FRONT, { flicker: 0.15 });
  for (let i = 0; i < 6; i++) f.decal('decal_footprints', 4 + rng.int(0, 5), 45 + rng.int(0, 4), 1, 1);
  // night-black windows along the front
  for (let y = 8; y <= 88; y += 3) if (y < 40 || y > 56) b.window(BX0, y, 1, { glass: 'intact' });

  // ============================================================ front end: customer service + checkouts
  floorRect(b, BX0, BY0, 23, 41, 'linoleum'); floorRect(b, BX0, 55, 23, BY1, 'linoleum'); floorRect(b, 10, 42, 23, 54, 'linoleum');
  b.addRoom('Checkouts', 'checkout', BX0, BY0, 23, BY1, { circuit: C_FRONT });
  b.addRoom('Entrance', 'vestibule', BX0, 42, 9, 53, { circuit: C_FRONT });
  // customer service: a counter with an office behind it
  floorRect(b, BX0, BY0, 13, 11, 'carpet_office', 'wall_office');
  b.vwall(14, BY0, 11, 'drywall'); b.door(14, 9, 1, 'door_office', { sign: 'staff' });
  b.addRoom('Customer Service', 'customer_service', BX0, BY0, 13, 11, { circuit: C_FRONT });
  const sd = force(c, 'reception_desk', 6, 12, 0, {}); force(c, 'reception_desk', 8, 12, 0, {}); force(c, 'reception_desk', 10, 12, 0, {});
  b.hwall(BX0, 5, 12, 'drywall'); b.hwall(12, 13, 12, 'drywall');
  fascia(b, 'service', 8, BY0, 'n', true);
  itemOn(c, 'note', sd, { lore: 'lost_child_notice' });
  put(c, 'chair_office', 8, 11, 0); put(c, 'filing_cabinet', 4, 6, 3); put(c, 'filing_cabinet', 4, 7, 3);
  const od = put(c, 'desk_office', 10, 5, 0); if (od) f.onTop('computer', od, {});
  put(c, 'chair_office', 10, 6, 2); put(c, 'cardboard_box', 12, 4, 0, { loot: 'generic' }); put(c, 'cardboard_box', 13, 4, 0, { loot: 'generic' });
  put(c, 'phone_desk', 5, 9, 1);
  mount(b, 'clock_wall', 6, BY0, 'n'); mount(b, 'noticeboard', BX0, 9, 'w', { lore: 'note_generic' });
  glow(b, 8, 7, 'fluoro', C_FRONT);
  // checkout lanes
  const lanes: number[] = [];
  for (let y = 16; y <= 40; y += 4) lanes.push(y);
  for (let y = 56; y <= 88; y += 4) lanes.push(y);
  checkoutLanes(c, lanes, false);
  // carts by the doors
  for (let y = 44; y <= 52; y += 2) for (const x of [20, 21]) put(c, 'shopping_cart', x, y, 1);
  for (let y = 18; y <= 88; y += 8) glow(b, 21, y, 'fluoro', C_FRONT, { flicker: rng.chance(0.1) ? 0.2 : 0 });
  for (let y = 18; y <= 88; y += 8) glow(b, 8, y, 'fluoro', C_FRONT);
  scatterLoot(c, 'trash', BX0, BY0, 23, BY1, 6);

  // ============================================================ sales floor
  // north strip: produce (west), dairy wall (middle), bakery (east)
  floorRect(b, SX0, BY0, 39, 13, 'tile_kitchen');
  b.addRoom('Produce', 'produce', SX0, BY0, 39, 13, { circuit: C_FLOOR });
  fascia(b, 'produce', 31, BY0, 'n', true);
  produceStands(c, false);
  for (let x = 40; x <= 63; x++) put(c, 'freezer_display', x, BY0, 0, { loot: x % 3 === 0 ? 'store_frozen' : 'fridge_house' });
  b.addRoom('Dairy', 'dairy', 40, BY0, 63, 13, { circuit: C_FLOOR });
  fascia(b, 'dairy', 46, BY0, 'n', false); fascia(b, 'frozen', 58, BY0, 'n', false);
  floorRect(b, 64, BY0, SX1, 13, 'tile_kitchen');
  b.addRoom('Bakery', 'bakery', 64, BY0, SX1, 13, { circuit: C_FLOOR });
  fascia(b, 'bakery', 71, BY0, 'n', true);
  for (const x of [65, 69, 73, 77]) { put(c, 'stove', x, BY0, 0); put(c, 'shelf_metal', x + 1, BY0, 0, { loot: 'store_food_dry' }); }
  for (let x = 65; x <= 77; x += 2) put(c, 'counter_kitchen', x, 9, 0, { loot: 'kitchen_counter' });
  put(c, 'display_table', 70, 12, 0, { loot: 'store_food_dry' });

  // gondola rows; frozen islands at the south end
  for (let k = 0; k < NROWS; k++) {
    const y = ROW_Y(k);
    if (k >= 9 + 3 && k <= 14) continue; // rows 12..14 belong to the shifting block (stamped below)
    gondolaRow(c, k, y, false);
  }
  // aisle signs over the front cross aisle (and the mouth of each walkway)
  for (let k = 0; k < NROWS - 1; k++) {
    const a = AISLES[k];
    b.obj('zg_aisle_sign', 27, ROW_Y(k) + 2, 1, { label: a.label, cat: catIdx(a.cat) });
  }
  b.obj('zg_aisle_sign', 27, 15, 1, { label: '0', cat: catIdx('BREAD') });
  // the south wall: seasonal shelves, a birthday aisle no one asked for
  for (let x = 26; x <= 76; x += 2) put(c, 'shelf_store', x, 91, 2, { loot: x < 50 ? 'store_household' : 'store_toys' });
  mount(b, 'party_banner', 50, 91, 's');

  // deli & meat along the back cross aisle
  floorRect(b, 78, 14, SX1, 46, 'tile_kitchen');
  b.addRoom('Deli & Meat', 'deli', 76, 14, SX1, 46, { circuit: C_FLOOR, temp: 15 });
  for (let y = 15; y <= 45; y += 1) if (y !== 30) put(c, 'counter_kitchen', 77, y, 1, { loot: y % 4 === 0 ? 'fridge_house' : 'kitchen_counter' });
  for (let y = 15; y <= 45; y += 2) put(c, 'freezer_display', SX1, y, 1, { loot: 'fridge_house' });
  put(c, 'stove', 78, 20, 1); put(c, 'stove', 78, 38, 1);
  fascia(b, 'deli', SX1, 24, 'e', true);
  for (let y = 56; y <= 88; y += 2) put(c, 'freezer_display', SX1, y, 1, { loot: 'store_frozen' });
  for (let y = 58; y <= 86; y += 4) put(c, 'freezer_chest', 75, y, 1, { loot: 'store_frozen' });
  fascia(b, 'frozen', SX1, 70, 'e', true);

  // lights: a fluorescent grid over the walkways; one sector died years ago
  for (let k = -1; k < NROWS; k++) {
    const y = k < 0 ? 15 : ROW_Y(k) + 2;
    for (let x = 26; x <= 76; x += 6) {
      const inDead = x >= 50 && x <= 70 && y >= 60 && y <= 76;
      if (k === A9 && x >= 30) continue;
      glow(b, x, y, 'fluoro', inDead ? C_DEAD : C_FLOOR, { color: 0xf4f8ff, flicker: inDead ? 0 : (hash3(x, y, 5) % 23 === 0 ? 0.25 : 0) });
    }
  }
  for (const x of [28, 36, 44, 52, 60, 70, 76]) glow(b, x, 9, 'fluoro', C_FLOOR, { color: 0xf4f8ff });
  glow(b, 60, 68, 'emergency', 0, { intensity: 0.35 });

  // ============================================================ aisle 9: longer than the building
  aisleNine(c);

  // ============================================================ back of house
  backOfHouse(c);
  warehouse(c);

  // aisle 9 is walled in by tall shelving along its whole length (the same on both sides of its seam)
  b.hwall(30, BX1, ROW_Y(A9), 'shelf_wall'); b.hwall(30, BX1, ROW_Y(A9 + 1) + 1, 'shelf_wall');
  b.paper(30, ROW_Y(A9), BX1, ROW_Y(A9 + 1), 'wall_supermarket');

  // ============================================================ shifting regions
  shiftAisleBlock(c);
  shiftProduce(c);
  shiftCheckouts(c, lanes);
  shiftRacks(c);
  shiftBreakRoom(c);

  // floor clutter
  scatterLoot(c, 'floor_generic', SX0, 14, SX1, BY1, 14, (x, y) => !(y >= A9_Y0 - 1 && y <= A9_Y1 + 1));
  scatterLoot(c, 'store_snacks', SX0, 14, SX1, BY1, 6, (x, y) => !(y >= A9_Y0 - 1 && y <= A9_Y1 + 1));
  for (let i = 0; i < 6; i++) { const x = rng.int(25, 76), y = rng.int(14, 88); if (isOpen(z, x, y) && !(y >= A9_Y0 - 1 && y <= A9_Y1 + 1)) put(c, 'shopping_cart', x, y, rng.int(0, 3) as Rot); }
  scatterDecals(c, SX0, 14, SX1, BY1, 60, [['decal_stain_water', 3], ['decal_stain_dark', 2], ['decal_footprints', 2], ['decal_trash', 1], ['decal_crack', 1]], 0.7, 1.4, undefined, (x, y) => !(x >= 30 && y >= A9_Y0 && y <= A9_Y1));

  connectRegions(z, b, 7, 47, rng, { keep: [{ x0: 30, y0: A9_Y0 - 1, x1: BX1, y1: A9_Y1 + 1 }] });

  // ============================================================ power, env, creatures
  for (const cc of [C_FLOOR, C_FRONT, C_BACK, C_WARE, C_A9, C_COLD]) z.power.set(cc, true);
  z.power.set(C_DEAD, false);
  z.env = {
    ...z.env,
    ambient: 0x343a3a, ambientI: 0.62, fog: 0x1e2424, fogNear: 14, fogFar: 34, void: 0x0a0c0c, temp: 17,
    grade: 'market', reverb: 'mall', ambience: 'market', music: 'muzak',
  };
  z.spawnTable = [['swivel', 1], ['ventling', 2], ['hollow', 1], ['grinhound', 1]];
  z.creatureCap = 6;
  z.meta.terminalLore = ['terminal_generic', 'terminal'];
  z.meta.shiftRate = 1;
}

// ---------------------------------------------------------------- pieces
function checkoutLanes(c: Ctx, lanes: number[], stamp: boolean, variant = 0) {
  const { b } = c;
  lanes.forEach((y, i) => {
    if (variant === 2 && i % 5 !== 2) return;
    const x = variant === 1 ? 15 + (i % 2) * 3 : 15;
    const o = put(c, 'checkout_counter', x, y, 0, {});
    if (o && variant !== 2) b.obj('cash_register', o.x, o.y, 0, { y: 0.9, loot: stamp ? 'none' : 'generic' });
    put(c, 'shelf_store_end', 14, y, 1, { loot: stamp ? 'none' : 'store_snacks' });
    if (variant === 0 && i % 3 === 0) put(c, 'trash_can', 18, y, 0);
    glow(b, 16, y, 'neon', C_FRONT, { color: i === 6 ? 0xff4040 : 0x40ff80, intensity: 0.25, radius: 2.2, y: 1.9, broken: variant === 2 && i !== 7 });
  });
}

function produceStands(c: Ctx, stamp: boolean, variant = 0) {
  if (variant === 0) for (let y = 6; y <= 12; y += 3) for (let x = 25; x <= 37; x += 4) put(c, 'produce_stand', x, y, 0, { loot: stamp ? 'none' : 'store_produce' });
  else if (variant === 1) for (let x = 25; x <= 38; x += 2) put(c, 'produce_stand', x, 7, 1, { loot: 'none' });
  else { for (let k = 0; k < 8; k++) put(c, 'produce_stand', 26 + (k % 4) * 3, 6 + Math.floor(k / 4) * 5, (k % 4) as Rot, { loot: 'none' }); put(c, 'chair_folding', 31, 9, 0); }
}

function gondolaRow(c: Ctx, k: number, y: number, stamp: boolean) {
  const { b } = c;
  const below = AISLES[Math.min(k, AISLES.length - 1)];
  const long = k === A9 || k === A9 + 1;
  if (k >= 15 && !stamp) {
    // the frozen islands: chest freezers humming in a row
    for (let x = 30; x + 1 <= 71; x += 2) put(c, 'freezer_chest', x, y, 0, { loot: 'store_frozen' });
    put(c, 'shelf_store_end', 29, y, 1, { loot: 'store_snacks' }); put(c, 'shelf_store_end', 72, y, 3, { loot: 'store_snacks' });
    return;
  }
  const xEnd = long ? BX1 : 71;
  for (let x = 30; x + 1 <= xEnd; x += 2) {
    if (long && x >= 30) continue; // aisle 9's rows are built by aisleNine()
    const loot = stamp ? (x % 6 === 0 ? below.loot : 'none') : (hash3(x, y, 3) % 17 === 0 ? 'none' : below.loot);
    put(c, 'shelf_store', x, y, 0, { loot });
  }
  put(c, 'shelf_store_end', 29, y, 1, { loot: stamp ? 'none' : below.loot });
  if (!long) put(c, 'shelf_store_end', 72, y, 3, { loot: stamp ? 'none' : below.loot });
  void b;
}

/** shelf loot along aisle 9, a pure function of (x mod 40) so the seam cannot be seen */
const A9_LOOT = ['store_food_canned', 'store_food_canned', 'store_food_dry', 'store_food_dry', 'store_snacks', 'store_food_canned', 'store_food_dry', 'store_food_dry', 'store_drinks', 'store_food_canned', 'store_food_canned', 'store_food_dry', 'store_food_dry', 'store_food_dry', 'none', 'none', 'store_food_canned', 'store_food_canned', 'store_household', 'store_food_canned'];
function aisleNine(c: Ctx) {
  const { b, z } = c;
  const yN = ROW_Y(A9), yS = ROW_Y(A9 + 1);
  // the rows run on through the back wall and the warehouse, all the way to the outer wall
  for (let x = 30; x + 1 <= BX1; x += 2) {
    const p = ((x - 30) % A9_D + A9_D) % A9_D;
    const loot = A9_LOOT[p / 2];
    b.obj('shelf_store', x, yN, 0, { loot });
    b.obj('shelf_store', x, yS, 0, { loot: A9_LOOT[(p / 2 + 7) % A9_LOOT.length] });
  }
  b.fillFloor(SX1 + 1, A9_Y0, BX1, A9_Y1, 'linoleum');
  b.paper(SX1 + 1, yN, BX1, yS, 'wall_supermarket');
  b.addRoom('Aisle 9', 'aisle_9', 30, A9_Y0, BX1, A9_Y1, { circuit: C_A9 });
  // the aisle is lit like every other aisle; it just keeps being lit
  for (let x = 30; x <= BX1; x++) {
    const p = ((x - 30) % A9_D + A9_D) % A9_D;
    if (p % 5 === 0) glow(b, x, A9_Y0 + 1, 'fluoro', C_A9, { color: 0xf4f8ff, flicker: p === 15 ? 0.3 : 0, broken: p === 35 });
    if (p % 10 === 0 && x >= 40) {
      const q = (p / 10) % 4;
      b.obj('zg_aisle_sign', x, A9_Y0 + 1, 1, { label: q === 3 ? '∞' : '9', cat: catIdx(['SOUP', 'CEREAL', 'BAKING', 'NOTHING'][q]) });
    }
    const h = hash3(p, 41, 9) / 4294967296;
    if (h < 0.1) decal(z, h < 0.05 ? 'decal_stain_water' : 'decal_footprints', x + 0.5, A9_Y0 + 0.5 + Math.floor(h * 300) % 3, 1, 1, h * 60, undefined, 0.75);
  }
  // seam: walking east past x = 92 puts you 40 tiles back down the aisle
  for (let y = A9_Y0; y <= A9_Y1; y++) b.portal({ id: 'loop_a9_' + y, x: A9_SEAM, y, kind: 'loop', to: 'market', tx: A9_SEAM - A9_D, ty: y, loopDx: -A9_D, hidden: true });
  b.flag(A9_SEAM + 1, A9_Y0 - 1, BX1, A9_Y1 + 1, TF.NOSPAWN);
  // a shopping list at the mouth of the aisle
  c.f.floorItem('note', 33, A9_Y0 + 1, { lore: 'note_generic' });
  put(c, 'shopping_cart', 31, A9_Y1, 0);
}

function backOfHouse(c: Ctx) {
  const { b, f, rng } = c;
  const x0 = SX1 + 1; // 80
  // the back wall of the sales floor, broken only by aisle 9 and the staff doors
  for (let y = BY0; y <= BY1; y++) if (y < A9_Y0 - 1 || y > A9_Y1 + 1) b.vwall(x0, y, y, 'cinder');
  b.paper(x0, BY0, BX1, BY1, 'wall_concrete');
  // south block: corridor x 80..82 with rooms off it
  const cy0 = ROW_Y(A9 + 1) + 1; // 54
  floorRect(b, x0, cy0, x0 + 2, BY1, 'concrete');
  b.vwall(x0 + 3, cy0, BY1, 'cinder');
  b.hwall(x0, BX1, cy0, 'cinder'); // south wall of the aisle-9 tunnel
  b.addRoom('Back Corridor', 'back_corridor', x0, cy0, x0 + 2, BY1, { circuit: C_BACK });
  b.door(x0, 62, 1, 'door_metal', { sign: 'staff' }); b.door(x0, 84, 1, 'door_metal', { sign: 'staff' });
  for (let y = cy0 + 2; y <= BY1; y += 6) glow(b, x0 + 1, y, 'bulb', C_BACK, { flicker: rng.chance(0.3) ? 0.25 : 0 });
  const rooms: [number, number, string, string, string][] = [
    [cy0, 62, 'Manager\'s Office', 'office', 'carpet_office'],
    [63, 72, 'Break Room', 'breakroom', 'linoleum'],
    [73, 78, 'Restrooms', 'restroom', 'tile_white'],
    [79, 85, 'Cold Room', 'cold_room', 'concrete'],
    [86, BY1, 'Dry Storage', 'storage', 'concrete'],
  ];
  const rx0 = x0 + 3;
  for (const [ry0, ry1, name, type, floor] of rooms) {
    floorRect(b, rx0, ry0, BX1, ry1, floor, type === 'office' || type === 'breakroom' ? 'wall_office' : type === 'restroom' ? 'wall_bathroom' : 'wall_concrete');
    b.roomWalls(rx0, ry0, BX1, ry1, 'cinder');
    b.addRoom(name, type, rx0, ry0, BX1, ry1, { circuit: type === 'cold_room' ? C_COLD : C_BACK, temp: type === 'cold_room' ? -6 : undefined });
    b.door(rx0, Math.floor((ry0 + ry1) / 2), 1, type === 'cold_room' ? 'door_metal' : 'door_office', { sign: type === 'restroom' ? 'restroom' : type === 'office' ? 'office' : type === 'cold_room' ? 'danger' : 'staff' });
    if (type !== 'breakroom') glow(b, Math.floor((rx0 + BX1) / 2), Math.floor((ry0 + ry1) / 2), 'fluoro', type === 'cold_room' ? C_COLD : C_BACK, { color: type === 'cold_room' ? 0xc8e8ff : 0xfff4e0, flicker: type === 'restroom' ? 0.3 : 0 });
  }
  // office: the manager watched the floor on four screens
  const d = put(c, 'desk_office', 90, 56, 0); if (d) f.onTop('computer', d, {});
  put(c, 'chair_office', 90, 57, 2); put(c, 'filing_cabinet', 86, cy0, 0); put(c, 'filing_cabinet', 87, cy0, 0); put(c, 'filing_cabinet', 88, cy0, 0);
  put(c, 'security_desk', 100, cy0, 0); put(c, 'cctv_monitors', 102, cy0, 0); put(c, 'chair_office', 101, 56, 2);
  put(c, 'bookshelf', 106, 58, 1); put(c, 'water_cooler', 106, 61, 1); put(c, 'plant_potted', 94, 62, 0);
  mount(b, 'whiteboard', 95, cy0, 'n'); mount(b, 'clock_wall', 92, cy0, 'n'); mount(b, 'noticeboard', 98, cy0, 'n', { lore: 'note_generic' });
  f.floorItem('note', 93, 58, { lore: 'note_generic' });
  // restrooms
  for (let x = 86; x <= 92; x += 2) put(c, 'toilet', x, 73, 0);
  for (let x = 96; x <= 104; x += 2) { put(c, 'sink_bathroom', x, 73, 0); mount(b, 'mirror', x, 73, 'n'); }
  b.vwall(94, 73, 78, 'tile');
  // cold room
  for (let x = 86; x <= 106; x += 2) { put(c, 'freezer_chest', x, 79, 0, { loot: 'store_frozen' }); put(c, 'freezer_chest', x, 85, 0, { loot: 'store_frozen' }); }
  put(c, 'pallet_boxes', 96, 82, 0, { loot: 'store_frozen' });
  // dry storage
  for (let x = 86; x <= 106; x += 3) { put(c, 'shelf_metal', x, 86, 0, { loot: 'pantry' }); put(c, 'pallet_boxes', x, BY1, 0, { loot: 'store_food_canned' }); }
  for (let i = 0; i < 5; i++) put(c, rng.pick(['cardboard_stack', 'cardboard_box', 'pallet']), rng.int(87, 105), rng.int(88, 89), 0);
}

function breakRoomFurniture(c: Ctx, variant: number, stamp: boolean) {
  const { b } = c;
  const y0 = 63;
  put(c, 'vending_snack', 86, y0, 0, { loot: stamp ? 'none' : 'vending_snack' }); put(c, 'vending_soda', 87, y0, 0, { loot: stamp ? 'none' : 'vending_soda' });
  const ck = put(c, 'counter_kitchen', 104, y0, 0); if (ck && !stamp) c.f.onTop('microwave', ck, {}); put(c, 'fridge', 106, y0, 0, { loot: stamp ? 'none' : 'fridge_office' });
  if (variant === 0) {
    put(c, 'table_round', 95, 67, 0); put(c, 'chair_plastic', 94, 67, 1); put(c, 'chair_plastic', 96, 67, 3); put(c, 'chair_plastic', 95, 68, 2);
    put(c, 'table_round', 100, 69, 0); put(c, 'chair_plastic', 99, 69, 1); put(c, 'chair_plastic', 101, 69, 3);
    for (let y = 69; y <= 71; y++) put(c, 'locker', BX1, y, 1);
  } else if (variant === 1) {
    // every chair turned to face the wall
    for (let x = 88; x <= 104; x += 2) put(c, 'chair_plastic', x, y0 + 1, 2);
  } else {
    // one long table, eight chairs, paper hats
    for (let x = 90; x + 1 <= 102; x += 2) { put(c, 'table_dining', x, 68, 0); put(c, 'chair_plastic', x, 67, 0); put(c, 'chair_plastic', x + 1, 69, 2); }
    mount(b, 'party_banner', 95, y0, 'n');
  }
}

function warehouse(c: Ctx) {
  const { b, z, f, rng } = c;
  const x0 = SX1 + 1, y0 = BY0, x1 = BX1, y1 = ROW_Y(A9) - 1;   // x 80..107, y 4..48
  floorRect(b, x0, y0, x1, y1, 'concrete', 'wall_concrete');
  b.hwall(x0, x1, y1 + 1, 'cinder'); // north wall of the aisle-9 tunnel
  b.addRoom('Warehouse', 'warehouse', x0, y0, x1, y1, { circuit: C_WARE, temp: 14 });
  for (const y of [14, 15, 36, 37]) b.door(x0, y, 1, 'door_metal', { open: y === 14 || y === 36, sign: y === 15 || y === 37 ? 'staff' : undefined });
  fascia(b, 'warehouse', x0, 25, 'w', false);
  // loading dock along the north wall: three bay doors; the middle one opens onto the garage
  for (const x of [88, 96, 104]) {
    if (x === 96) b.door(x, y0, 0, 'door_metal', { portal: 'p_market_dock', sign: 'exit' });
    else b.door(x, y0, 0, 'door_metal', { locked: true });
    decal(z, 'zg_dc_hatch', x + 0.5, y0 + 1, 2.6, 2.6, 0, 0xffffff, 0.85);
    put(c, 'hazard_barrier', x - 2, y0 + 1, 0); put(c, 'hazard_barrier', x + 2, y0 + 1, 0);
    glow(b, x, y0 + 1, 'sodium', C_WARE, { intensity: 0.85, radius: 6, y: 2.6, flicker: x === 104 ? 0.25 : 0 });
  }
  fascia(b, 'exit', 96, y0, 'n', true);
  b.portal({ id: 'p_market_dock', x: 96, y: y0, kind: 'door', to: 'parking', tx: 154, ty: 86, label: 'Go out onto the loading dock' });
  arrive(b, 'r_market_dock', 96, y0 + 3, 's', 4);
  b.addRoom('Loading Dock', 'loading_dock', 84, y0, x1, y0 + 6, { circuit: C_WARE, temp: 12 });
  for (const [x, y] of [[90, 7], [91, 7], [101, 7], [100, 8]] as const) put(c, rng.chance(0.5) ? 'pallet_boxes' : 'pallet', x, y, 0, { loot: 'crate_supplies' });
  put(c, 'dumpster', x1 - 1, y0 + 4, 1);
  // dock office in the far corner
  floorRect(b, 100, 40, x1, y1, 'linoleum', 'wall_office');
  b.roomWalls(100, 40, x1, y1, 'cinder');
  b.addRoom('Dock Office', 'dock_office', 100, 40, x1, y1, { circuit: C_WARE });
  b.door(100, 44, 1, 'door_office', { sign: 'office' });
  const dd = put(c, 'desk_office', 102, 46, 0); itemOn(c, 'note', dd, { lore: 'parking_ticket' });
  put(c, 'chair_office', 102, 45, 2); put(c, 'filing_cabinet', 106, 41, 1); put(c, 'locker', 106, 47, 1); put(c, 'locker', 106, 48, 1);
  mount(b, 'clock_wall', 103, 40, 'n'); mount(b, 'noticeboard', 101, 40, 'n', { lore: 'note_generic' });
  glow(b, 103, 44, 'fluoro', C_WARE);
  // racking: long rows of steel shelving with pallets on the floor between them
  rackRows(c, 0, false);
  for (let y = y0 + 3; y <= y1; y += 6) for (const x of [84, 92, 100]) if (!(x === 100 && y >= 40)) glow(b, x, y, 'fluoro', C_WARE, { color: 0xe8f0ff, flicker: rng.chance(0.15) ? 0.25 : 0, broken: rng.chance(0.08) });
  scatterDecals(c, x0, y0, x1, y1, 30, [['decal_stain_dark', 3], ['decal_crack', 2], ['decal_stain_water', 1], ['decal_trash', 1]]);
  scatterLoot(c, 'floor_generic', x0, y0, x1, y1, 5);
  f.floorItem('flashlight', 98, 9);
}

/** warehouse racking (x 82..98, y 12..38) */
function rackRows(c: Ctx, variant: number, stamp: boolean) {
  const loot = (x: number, y: number) => stamp ? 'none' : ['crate_supplies', 'pantry', 'store_household', 'store_hardware'][hash3(x, y, 77) % 4];
  if (variant === 0) {
    for (const x of [83, 86, 89, 92, 95]) for (let y = 12; y <= 38; y++) if (y !== 24 && y !== 25) put(c, (y % 5 === 0) ? 'pallet_boxes' : 'shelf_metal', x, y, 0, { loot: loot(x, y) });
  } else if (variant === 1) {
    for (const y of [13, 17, 21, 28, 32, 36]) for (let x = 82; x <= 97; x++) if (x !== 89 && x !== 90) put(c, 'shelf_metal', x, y, 0, { loot: loot(x, y) });
  } else if (variant === 2) {
    // the racking has become a maze
    for (let y = 12; y <= 38; y += 3) for (let x = 82; x <= 97; x++) if (hash3(x, y, 13 + variant) % 5 !== 0 && (x + y) % 7 !== 0) put(c, 'shelf_metal', x, y, 0, { loot: 'none' });
  } else {
    // everything moved into one tower of pallets in the middle
    for (let y = 21; y <= 28; y++) for (let x = 86; x <= 93; x++) put(c, 'pallet_boxes', x, y, 0, { loot: 'none' });
  }
}

// ---------------------------------------------------------------- shifting regions
function shiftAisleBlock(c: Ctx) {
  // rows 12..14 (y 65..73) and the walkways between them
  const x0 = 29, x1 = 72, y0 = ROW_Y(12), y1 = ROW_Y(14);
  registerShift(c.z, 'mkt_aisles', x0, y0, x1, y1, 4, (sb, srng, v) => {
    const sc: Ctx = { ...c, b: sb, f: new Furnisher(sb, srng), rng: srng, stamp: true };
    if (v === 0) {
      for (let k = 12; k <= 14; k++) gondolaRowPlain(sc, k, ROW_Y(k), false);
    } else if (v === 1) {
      // the shelves have turned ninety degrees
      for (let x = 32; x <= 70; x += 4) for (let y = y0; y + 1 <= y1; y += 3) put(sc, 'shelf_store', x, y, 1, { loot: 'none' });
    } else if (v === 2) {
      // only the endcaps are left, and a cart in the middle of the floor
      for (let k = 12; k <= 14; k++) { put(sc, 'shelf_store_end', 30, ROW_Y(k), 1, { loot: 'none' }); put(sc, 'shelf_store_end', 72, ROW_Y(k), 3, { loot: 'none' }); }
      put(sc, 'shopping_cart', 51, ROW_Y(13), 0);
    } else {
      // rows with no gaps between them, except the ones you can't see from here
      for (let k = 12; k <= 14; k++) for (let x = 30; x + 1 <= 71; x += 2) if (x !== 30 + ((k * 14) % 40)) put(sc, 'shelf_store', x, ROW_Y(k), 0, { loot: 'none' });
      for (let x = 30; x + 1 <= 71; x += 2) put(sc, 'shelf_store', x, ROW_Y(12) + 2, 0, { loot: 'none' });
    }
    for (const y of [ROW_Y(12) + 2, ROW_Y(13) + 2]) for (let x = 32; x <= 70; x += 6) glow(sb, x, y, 'fluoro', C_FLOOR, { color: 0xf4f8ff, flicker: v === 3 ? 0.3 : 0, broken: v === 2 && x !== 50 });
  });
}
function gondolaRowPlain(c: Ctx, k: number, y: number, stamp: boolean) {
  const below = AISLES[k];
  for (let x = 30; x + 1 <= 71; x += 2) put(c, 'shelf_store', x, y, 0, { loot: stamp || x % 4 === 0 ? below.loot : 'none' });
  put(c, 'shelf_store_end', 29, y, 1, { loot: below.loot }); put(c, 'shelf_store_end', 72, y, 3, { loot: below.loot });
}
function shiftProduce(c: Ctx) {
  registerShift(c.z, 'mkt_produce', 25, 5, 39, 13, 3, (sb, srng, v) => {
    const sc: Ctx = { ...c, b: sb, f: new Furnisher(sb, srng), rng: srng, stamp: true };
    produceStands(sc, v !== 0, v);
    glow(sb, 31, 9, 'fluoro', C_FLOOR, { color: 0xf4fff0, flicker: v === 2 ? 0.3 : 0 });
  });
}
function shiftCheckouts(c: Ctx, lanes: number[]) {
  registerShift(c.z, 'mkt_checkouts', 13, 15, 19, 89, 3, (sb, srng, v) => {
    const sc: Ctx = { ...c, b: sb, f: new Furnisher(sb, srng), rng: srng, stamp: true };
    checkoutLanes(sc, lanes, v !== 0, v);
  });
}
function shiftRacks(c: Ctx) {
  registerShift(c.z, 'mkt_racks', 82, 12, 98, 38, 4, (sb, srng, v) => {
    const sc: Ctx = { ...c, b: sb, f: new Furnisher(sb, srng), rng: srng, stamp: true };
    rackRows(sc, v, v !== 0);
    for (let y = 13; y <= 37; y += 6) glow(sb, 90, y, 'fluoro', C_WARE, { color: 0xe8f0ff, broken: v === 3 && y !== 25 });
  });
}
function shiftBreakRoom(c: Ctx) {
  registerShift(c.z, 'mkt_breakroom', 84, 63, BX1, 72, 3, (sb, srng, v) => {
    const sc: Ctx = { ...c, b: sb, f: new Furnisher(sb, srng), rng: srng, stamp: true };
    breakRoomFurniture(sc, v, v !== 0);
    glow(sb, 95, 68, 'fluoro', C_BACK, { flicker: v === 1 ? 0.35 : 0 });
  });
}

defZone({
  key: 'market', name: 'Foodland', W, H, depth: 2,
  blurb: 'Fluorescent light, cold air from the freezers, a price gun on the floor. Everything is in stock. Nothing has been bought since 1987.',
  gen: (z, s) => { generateMarket(z, s); },
});
