// Westgate Mall (192×160). A 1980s enclosed mall seeded from a child's
// Saturday afternoons. Main Street runs east–west from the parking entrance to
// the Foodland anchor store, through the Grand Atrium: a sunken fountain court
// under skylights, escalators up to a Level 2 that is "not open to the
// public", the information desk where Mia is still waiting. The North Arm leads
// to Cinema 6 (screen 6 shows snow; the door beside it opens onto the
// unrendered) and the Food Court with its carousel. The South Arm crosses the
// Repeating Row — a corridor of identical Dawn's Shoes that loops in both
// directions — and ends at the blue glass door to the water park.
// Most shutters are down. A few stores are lit. The music never stops.
import { defZone } from '../worldGraph';
import { Zone, TF, TileObject } from '../zone';
import { ZoneBuilder } from './builder';
import { Furnisher } from './furnish';
import { Rng, hash3 } from '../../core/rng';
import { registerShift } from '../shift';
import { connectRegions } from './connect';
import {
  Ctx, Rot, Side, BACK, FACE, arrive, put, force, mount, fascia, glow, skylight, decal, floorRect,
  itemAt, itemOn, scatterLoot, scatterDecals, unitFrame, UnitFrame, hf, isOpen, isFloor,
} from './mall_kit';

const W = 192, H = 160;
// circuits
const C_CONC = 1, C_ATR = 2, C_FOOD = 3, C_CIN = 4, C_AUD = 5, C_SERV = 6, C_ROW = 7, C_ARM = 8, C_OFF = 9, C_SCREEN = 10;
let circuitSeq = 20;
const dead = new Set<number>();

// layout
const MS_Y0 = 70, MS_Y1 = 83;                // Main Street
const NR_Y0 = 52, NR_Y1 = 69;                // north store row
const SR_Y0 = 84, SR_Y1 = 99;                // south store row
const NS_Y0 = 49, NS_Y1 = 51;                // north service corridor
const SS_Y0 = 100, SS_Y1 = 102;              // south service corridor
const ATR = { x0: 72, y0: 44, x1: 119, y1: 102 };
const NARM = { x0: 86, y0: 6, x1: 105, y1: 43 };
const SARM = { x0: 86, y0: 103, x1: 109, y1: 144 };
const VEST = { x0: 86, y0: 145, x1: 109, y1: 151 };
// the Repeating Row (loops with period ROW_D between the seams)
const ROW_Y0 = 121, ROW_Y1 = 126, ROWN_Y0 = 103, ROWN_Y1 = 120, ROWS_Y0 = 127, ROWS_Y1 = 144;
const ROW_X0 = 6, ROW_X1 = 185, ROW_SW = 30, ROW_D = 128, ROW_SE = ROW_SW + ROW_D + 3;
const S2_Y0 = 145, S2_Y1 = 147;

type Kind = 'clothes' | 'shoes' | 'toys' | 'electro' | 'books' | 'sports' | 'pharmacy' | 'photo' | 'arcade' | 'music' | 'jewel' | 'pets' | 'candy' | 'gifts' | 'kids' | 'optical' | 'worn' | 'food';
interface StoreDef { label: string; kind: Kind; open: boolean }
const KIT: Record<Kind, { floor: string; paper: string; neon: number }> = {
  clothes: { floor: 'wood', paper: 'wall_paneling', neon: 0xf0f0ff },
  shoes: { floor: 'carpet_red', paper: 'wall_mall', neon: 0xff70b0 },
  toys: { floor: 'carpet_kids', paper: 'wall_kids', neon: 0xffd040 },
  electro: { floor: 'linoleum', paper: 'wall_office', neon: 0x40e0f0 },
  books: { floor: 'carpet_office', paper: 'wall_paneling', neon: 0xffd8a0 },
  sports: { floor: 'rubber', paper: 'wall_school', neon: 0x5a9aff },
  pharmacy: { floor: 'tile_white', paper: 'wall_hospital', neon: 0x40ff90 },
  photo: { floor: 'linoleum', paper: 'wall_supermarket', neon: 0xfff060 },
  arcade: { floor: 'carpet_hotel', paper: 'wall_dream', neon: 0xff40c0 },
  music: { floor: 'checker', paper: 'wall_hotel', neon: 0xc890ff },
  jewel: { floor: 'carpet_red', paper: 'wall_hotel', neon: 0xffe0a0 },
  pets: { floor: 'linoleum_green', paper: 'wall_bathroom', neon: 0x70ffd0 },
  candy: { floor: 'checker', paper: 'wall_kids', neon: 0xff80c0 },
  gifts: { floor: 'carpet_hotel', paper: 'wall_house_floral', neon: 0xff90a0 },
  kids: { floor: 'carpet_kids', paper: 'wall_kids', neon: 0x80d0ff },
  optical: { floor: 'linoleum', paper: 'wall_office', neon: 0xa0c0ff },
  worn: { floor: 'concrete', paper: 'wall_concrete', neon: 0xffffff },
  food: { floor: 'tile_kitchen', paper: 'wall_kitchen', neon: 0xffb040 },
};

// ---------------------------------------------------------------- small helpers
/** wall on the edge between two orthogonally adjacent tiles */
function wallBetween(b: ZoneBuilder, a: [number, number], c: [number, number], wall = 'drywall') {
  if (a[0] === c[0]) b.hwall(a[0], a[0], Math.max(a[1], c[1]), wall);
  else b.vwall(Math.max(a[0], c[0]), a[1], a[1], wall);
}
function edgeBetween(a: [number, number], c: [number, number]): [number, number, 0 | 1] {
  return a[0] === c[0] ? [a[0], Math.max(a[1], c[1]), 0] : [Math.max(a[0], c[0]), a[1], 1];
}
function doorBetween(b: ZoneBuilder, a: [number, number], c: [number, number], style = 'door_office', o: Record<string, any> = {}) {
  const [x, y, s] = edgeBetween(a, c);
  if (s === 0) b.hwall(x, x, y, 'drywall'); else b.vwall(x, y, y, 'drywall');
  return b.door(x, y, s, style, o);
}
function gapBetween(b: ZoneBuilder, a: [number, number], c: [number, number]) {
  const [x, y, s] = edgeBetween(a, c);
  b.gap(x, y, s);
}
/** a 2×1 (w along u) object at (u,v) in frame F rotated `r` */
function putF(c: Ctx, F: UnitFrame, key: string, u: number, v: number, r: Rot, state: Record<string, any> = {}, w = 1, d = 1) {
  const along = F.alongU(r);
  const [x, y] = F.span(u, v, along ? w : d, along ? d : w);
  return put(c, key, x, y, r, state);
}

// ---------------------------------------------------------------- store units
function buildStore(c: Ctx, x0: number, y0: number, x1: number, y1: number, front: Side, s: StoreDef, opts: { backDoor?: boolean; entrance?: number[]; circuit?: number; lit?: boolean; stamp?: boolean } = {}) {
  const { b, z } = c;
  const kit = KIT[s.kind];
  const circuit = opts.circuit ?? circuitSeq++;
  if (!s.open) dead.add(circuit);
  const F = unitFrame(x0, y0, x1, y1, front);
  if (!opts.stamp) {
    floorRect(b, x0, y0, x1, y1, kit.floor, kit.paper);
    b.roomWalls(x0, y0, x1, y1, 'drywall');
    b.addRoom(ZLABEL[s.label] ?? 'Store', STORE_TYPE[s.kind], x0, y0, x1, y1, { circuit });
  }
  const back = F.D >= 12 ? 4 : 0;
  const salesD = F.D - back;
  // back room
  if (back && !opts.stamp) {
    for (let u = 0; u < F.W; u++) wallBetween(b, F.P(u, salesD - 1), F.P(u, salesD));
    doorBetween(b, F.P(1, salesD - 1), F.P(1, salesD), 'door_office', { open: c.rng.chance(0.4) });
    const [bx0, by0] = F.span(0, salesD, F.W, back), bw = F.alongU(0) ? F.W : back, bd = F.alongU(0) ? back : F.W;
    b.addRoom('Stockroom', 'stockroom', bx0, by0, bx0 + bw - 1, by0 + bd - 1, { circuit });
    b.fillFloor(bx0, by0, bx0 + bw - 1, by0 + bd - 1, 'concrete');
    b.paper(bx0, by0, bx0 + bw - 1, by0 + bd - 1, 'wall_concrete');
    if (opts.backDoor !== false) {
      const [ox, oy] = F.P(F.W - 2, F.D);
      if (isFloor(z, ox, oy)) doorBetween(b, F.P(F.W - 2, F.D - 1), [ox, oy], 'door_metal', { sign: 'staff', locked: c.rng.chance(0.25) });
    }
    putF(c, F, 'shelf_metal', 0, F.D - 1, F.toFront, { loot: 'crate_supplies' });
    putF(c, F, 'cardboard_stack', 2, F.D - 1, 0, {});
    putF(c, F, 'cardboard_box', 3, F.D - 1, 0, {});
    putF(c, F, 'shelf_metal', F.W - 1, F.D - 2, BACK[F.right], { loot: s.kind === 'food' ? 'pantry' : 'store_household' });
    if (c.rng.chance(0.5)) putF(c, F, 'mop_bucket', F.W - 3, salesD, 0, {});
    glow(b, ...F.P(Math.floor(F.W / 2), salesD + 1), 'bulb', circuit, { flicker: c.rng.chance(0.3) ? 0.2 : 0, intensity: 0.7 });
  }
  // storefront
  const ent = opts.entrance ?? (F.W >= 10 ? [Math.floor(F.W / 2) - 1, Math.floor(F.W / 2)] : [Math.floor(F.W / 2) - 1, Math.floor(F.W / 2)]);
  if (!opts.stamp) for (let u = 0; u < F.W; u++) {
    const inside = F.P(u, 0), outside = F.P(u, -1);
    const [ex, ey, es] = edgeBetween(inside, outside);
    if (s.open) {
      if (ent.includes(u)) b.gap(ex, ey, es);
      else if (es === 0) b.hwall(ex, ex, ey, 'glass'); else b.vwall(ex, ey, ey, 'glass');
    } else if (u > 0 && u < F.W - 1) {
      const p = (u * 7 + x0) % 5 === 0 ? 'zg_wall_shutter_b' : 'zg_wall_shutter';
      b.paper(inside[0], inside[1], inside[0], inside[1], p);
      b.paper(outside[0], outside[1], outside[0], outside[1], p);
    }
  }
  // sign: on the outside of north/west fronts, on the inside of south/east fronts (that face is the one the camera sees)
  if (!opts.stamp) {
    const mid = Math.floor((F.W - 1) / 2);
    if (front === 's' || front === 'e') { const [sx, sy] = F.P(mid, -1); fascia(b, s.label, sx, sy, front === 's' ? 'n' : 'w', s.open); }
    else { const [sx, sy] = F.P(mid, 0); fascia(b, s.label, sx, sy, front, s.open); }
    if (s.open) { const [nx, ny] = F.P(mid, -1); glow(b, nx, ny, 'neon', circuit, { color: kit.neon, intensity: 0.45, radius: 4, y: 2.4 }); }
  }
  furnishSales(c, F, s, salesD, circuit);
  // lights over the sales floor
  for (let v = 2; v < salesD; v += 4) for (let u = 1; u < F.W; u += 4) glow(b, ...F.P(u, v), 'fluoro', circuit, { flicker: s.open && c.rng.chance(0.08) ? 0.2 : 0 });
  if (!s.open) glow(b, ...F.P(Math.floor(F.W / 2), 1), 'bulb', 0, { intensity: 0.25, radius: 3.5, color: 0xa8c0ff });
  return { F, circuit, salesD };
}

/** sales floor furniture for a store kind (v 0..salesD-1) */
function furnishSales(c: Ctx, F: UnitFrame, s: StoreDef, salesD: number, circuit: number) {
  const { b, rng, z } = c;
  const Wd = F.W, last = salesD - 1;
  const sideShelves = (key: string, loot: string, v0: number, v1: number, step = 2) => {
    for (let v = v0; v + 1 <= v1; v += step) {
      putF(c, F, key, 0, v, BACK[F.left], { loot }, 2, 1);
      putF(c, F, key, Wd - 1, v, BACK[F.right], { loot }, 2, 1);
    }
  };
  const counter = (u: number, v: number, register = true) => {
    const o = putF(c, F, 'checkout_counter', u, v, F.toFront, {}, 2, 1);
    if (o && register) c.f.onTop('cash_register', o, {});
    return o;
  };
  const windowPair = (key: string, state: Record<string, any> = {}, rot: Rot = F.toFront) => { putF(c, F, key, 1, 0, rot, state); putF(c, F, key, Wd - 2, 0, rot, state); };
  switch (s.kind) {
    case 'clothes': case 'kids': {
      windowPair('mannequin', {}, F.toFront);
      if (Wd >= 10) putF(c, F, 'mannequin', 3, 0, F.toFront, {});
      for (let v = 3; v <= last - 3; v += 2) for (let u = 2; u <= Wd - 3; u += 2) if (rng.chance(0.85)) putF(c, F, 'clothing_rack', u, v, rng.pick([0, 1, 2, 3] as Rot[]), { loot: 'store_clothing' });
      putF(c, F, 'display_table', Math.floor(Wd / 2) - 1, 1, F.toFront, { loot: 'store_clothing' }, 2, 1);
      sideShelves('clothing_rack', 'store_clothing', 2, last - 3, 1);
      counter(1, last, true);
      if (s.kind === 'kids') { putF(c, F, 'rocking_horse', Wd - 2, last - 1, F.toFront); putF(c, F, 'toy_box', Wd - 3, last, 0); putF(c, F, 'crib', 2, last - 1, 0); }
      break;
    }
    case 'shoes': {
      windowPair('display_table', { loot: 'store_clothing' }, F.toFront);
      sideShelves('shelf_store', 'store_clothing', 3, last - 1, 3);
      for (let v = 4; v <= last - 2; v += 4) putF(c, F, 'bench', Math.floor(Wd / 2) - 1, v, F.toFront, {}, 2, 1);
      counter(Wd - 3, last, true);
      mount(b, 'mirror', ...F.P(Math.floor(Wd / 2), last), F.back);
      break;
    }
    case 'toys': {
      windowPair('teddy_giant', {}, F.toFront);
      for (let u = 2; u + 1 <= Wd - 3; u += 3) for (let v = 3; v + 1 <= last - 2; v += 4) putF(c, F, 'shelf_store', u, v, F.alongU(0) ? 1 : 0, { loot: 'store_toys' }, 2, 1);
      sideShelves('shelf_store', 'store_toys', 2, last - 2, 2);
      putF(c, F, 'rocking_horse', Math.floor(Wd / 2), 1, F.toFront);
      putF(c, F, 'dollhouse', Wd - 3, last, F.toFront);
      putF(c, F, 'toy_box', 2, last, F.toFront);
      counter(Math.floor(Wd / 2) - 1, last, true);
      break;
    }
    case 'electro': case 'music': {
      const loot = 'store_electronics';
      sideShelves('shelf_store', loot, 2, last - 2, 2);
      // a wall of televisions showing the same snow
      for (let u = 2; u <= Wd - 3; u++) { const t = putF(c, F, 'tv_stand', u, last - 1, F.toFront, {}); if (t) c.f.onTop(s.kind === 'electro' ? 'tv_static' : 'tv_crt', t, {}); }
      for (let v = 3; v <= last - 4; v += 3) putF(c, F, 'display_table', Math.floor(Wd / 2) - 1, v, F.toFront, { loot }, 2, 1);
      if (s.kind === 'music') { putF(c, F, 'piano', 2, 1, F.toFront, {}, 2, 1); putF(c, F, 'shelf_store_end', Wd - 2, 1, F.toFront, { loot }); }
      else windowPair('shelf_store_end', { loot });
      counter(1, last, true);
      break;
    }
    case 'books': {
      for (let v = 3; v <= last - 3; v += 3) for (let u = 2; u + 1 <= Wd - 3; u += 3) putF(c, F, 'library_shelf', u, v, F.toFront, {}, 2, 1);
      sideShelves('library_shelf', 'bookshelf', 1, last - 1, 2);
      putF(c, F, 'armchair', Math.floor(Wd / 2), 1, F.toBack);
      putF(c, F, 'table_round', Math.floor(Wd / 2) - 1, 1, 0);
      counter(Wd - 3, last, true);
      break;
    }
    case 'sports': {
      windowPair('mannequin', {}, F.toFront);
      sideShelves('shelf_store', 'store_sports', 2, last - 1, 2);
      for (let v = 3; v <= last - 3; v += 3) putF(c, F, 'display_table', Math.floor(Wd / 2) - 1, v, F.toFront, { loot: 'store_sports' }, 2, 1);
      putF(c, F, 'basketball_hoop', Math.floor(Wd / 2), last, F.toFront);
      counter(1, last, true);
      break;
    }
    case 'pharmacy': {
      for (let u = 2; u + 1 <= Wd - 3; u += 3) for (let v = 2; v + 1 <= last - 3; v += 4) putF(c, F, 'shelf_store', u, v, F.alongU(0) ? 1 : 0, { loot: 'store_pharmacy' }, 2, 1);
      sideShelves('shelf_store', 'store_pharmacy', 1, last - 3, 2);
      for (let u = 0; u < Wd; u++) if (u !== 1 && u !== 2) putF(c, F, 'pharmacy_shelf', u, last, F.toFront, { loot: 'store_pharmacy' });
      counter(1, last - 2, true);
      break;
    }
    case 'photo': {
      for (let u = 1; u < Wd - 1; u += 2) mount(b, 'photo_frames', ...F.P(u, last), F.back, { v: u, blank: true });
      counter(Math.floor(Wd / 2) - 1, last - 2, true);
      putF(c, F, 'photo_booth', 1, 1, F.toFront);
      putF(c, F, 'printer_desk', Wd - 2, last - 2, F.toFront);
      putF(c, F, 'display_table', Math.floor(Wd / 2) - 1, 2, F.toFront, { loot: 'store_electronics' }, 2, 1);
      if (!c.stamp) for (let i = 0; i < 5; i++) { const [px, py] = F.P(rng.int(1, Wd - 2), rng.int(1, last - 1)); if (isOpen(z, px, py)) c.f.floorItem('photo_old', px, py); }
      break;
    }
    case 'arcade': {
      for (let v = 1; v <= last - 1; v++) { putF(c, F, 'arcade_machine', 0, v, BACK[F.left]); putF(c, F, 'arcade_machine', Wd - 1, v, BACK[F.right]); }
      for (let v = 3; v <= last - 3; v += 3) for (let u = 3; u <= Wd - 4; u += 3) putF(c, F, 'arcade_machine', u, v, rng.pick([0, 1, 2, 3] as Rot[]));
      putF(c, F, 'photo_booth', Math.floor(Wd / 2), last, F.toFront);
      putF(c, F, 'gumball_machine', 2, 0, F.toFront); putF(c, F, 'gumball_machine', Wd - 3, 0, F.toFront);
      putF(c, F, 'vending_soda', 2, last, F.toFront); putF(c, F, 'vending_snack', 3, last, F.toFront);
      break;
    }
    case 'jewel': case 'optical': {
      for (let v = 2; v <= last - 3; v += 3) { putF(c, F, 'display_table', 1, v, F.toFront, { loot: 'generic' }, 2, 1); putF(c, F, 'display_table', Wd - 3, v, F.toFront, { loot: 'generic' }, 2, 1); }
      counter(Math.floor(Wd / 2) - 1, last - 1, true);
      mount(b, 'mirror', ...F.P(1, last), F.back); mount(b, 'mirror', ...F.P(Wd - 2, last), F.back);
      putF(c, F, 'chair_wood', Math.floor(Wd / 2), last - 3, F.toBack);
      putF(c, F, 'plant_tall', 0, 0, 0); putF(c, F, 'plant_tall', Wd - 1, 0, 0);
      break;
    }
    case 'pets': {
      // tanks with nothing in them, kennels with nothing in them
      for (let u = 0; u < Wd; u++) if (u % 2 === 0) putF(c, F, 'specimen_tank', u, last, F.toFront);
      sideShelves('shelf_store', 'store_food_canned', 2, last - 3, 3);
      for (let u = 2; u <= Wd - 3; u += 2) putF(c, F, 'kennel', u, 2, F.toFront);
      putF(c, F, 'cardboard_box', Math.floor(Wd / 2), last - 2, 0, { loot: 'store_food_canned' });
      counter(1, last - 2, true);
      break;
    }
    case 'candy': {
      for (let u = 1; u < Wd - 1; u += 2) putF(c, F, 'gumball_machine', u, 1, F.toFront);
      sideShelves('shelf_store', 'store_snacks', 3, last - 1, 2);
      for (let v = 4; v <= last - 3; v += 3) putF(c, F, 'display_table', Math.floor(Wd / 2) - 1, v, F.toFront, { loot: 'store_snacks' }, 2, 1);
      counter(Math.floor(Wd / 2) - 1, last, true);
      break;
    }
    case 'gifts': {
      sideShelves('shelf_store', 'store_household', 2, last - 1, 2);
      for (let v = 3; v <= last - 3; v += 3) putF(c, F, 'display_table', Math.floor(Wd / 2) - 1, v, F.toFront, { loot: 'store_toys' }, 2, 1);
      windowPair('teddy_giant', {});
      mount(b, 'party_banner', ...F.span(Math.floor(Wd / 2) - 1, last, 3, 1), F.back);
      counter(1, last, true);
      break;
    }
    case 'food': {
      putF(c, F, 'food_court_counter', Math.floor(Wd / 2) - 1, 2, F.toFront, {}, 3, 1);
      putF(c, F, 'stove', 1, last, F.toFront); putF(c, F, 'counter_kitchen', 2, last, F.toFront); putF(c, F, 'fridge', Wd - 2, last, F.toFront);
      putF(c, F, 'freezer_chest', 3, last, F.toFront, {}, 2, 1);
      for (const u of [1, Wd - 2]) putF(c, F, 'chair_plastic', u, 0, F.toBack);
      break;
    }
    case 'worn': {
      // the store that never reopened: a drop cloth, a ladder of boxes, one chair facing the back wall
      putF(c, F, 'chair_plastic', Math.floor(Wd / 2), Math.floor(last / 2), F.toBack);
      putF(c, F, 'cardboard_stack', 1, last, 0); putF(c, F, 'cardboard_box', 2, last, 0); putF(c, F, 'sawhorse', Wd - 3, last - 1, 0);
      if (!c.stamp) { const [dx, dy] = F.P(Math.floor(Wd / 2), Math.floor(last / 2) + 2); decal(z, 'decal_stain_dark', dx + 0.5, dy + 0.5, 2.6, 1.8, 0.3, 0x5a5048, 0.6); }
      break;
    }
  }
  void circuit;
}

const STORE_TYPE: Record<Kind, string> = {
  clothes: 'clothing_store', shoes: 'shoe_store', toys: 'toy_store', electro: 'electronics_store', books: 'bookstore', sports: 'sports_store',
  pharmacy: 'pharmacy', photo: 'photo_store', arcade: 'arcade', music: 'record_store', jewel: 'jewelry_store', pets: 'pet_store', candy: 'candy_store',
  gifts: 'gift_shop', kids: 'kids_store', optical: 'optician', worn: 'vacant_store', food: 'restaurant',
};
const ZLABEL: Record<string, string> = {
  mode: 'MODE', apparel: 'Westgate Apparel', electro: 'Soundwave Electronics', pretzel: 'Pretzel Hut', gifts: 'Cards & Gifts', jewel: 'Gold & Co',
  sports: 'Sport Zone', optical: 'Eye See Optical', books: 'Pages Booksellers', candy: 'Sweet Tooth', worn: '(store name worn off)', hallmark: 'Hallmark of the Heart',
  music: 'Music Box', pets: 'Pet Palace', toys: 'Toytown', arcade: 'Void Arcade', kids: 'Kids Korner', pharmacy: 'Westgate Pharmacy', dawns: "Dawn's Shoes", photo: '1 Hour Photo',
};

// ---------------------------------------------------------------- generator
export function generateMall(z: Zone, seed: number) {
  const rng = new Rng(seed);
  const b = new ZoneBuilder(z, rng);
  const f = new Furnisher(b, rng);
  const c: Ctx = { z, b, f, rng, seed };
  circuitSeq = 20; dead.clear();
  z.name = 'Westgate Mall';

  // ============================================================ arrival from the water park (first anchor)
  floorRect(b, VEST.x0, VEST.y0, VEST.x1, VEST.y1, 'tile_pool', 'wall_pool');
  b.roomWalls(VEST.x0, VEST.y0, VEST.x1, VEST.y1, 'tile');
  b.addRoom('Splash World Entrance', 'waterpark_entrance', VEST.x0, VEST.y0, VEST.x1, VEST.y1, { circuit: C_ARM, temp: 24 });
  for (const y of [148, 149]) b.door(VEST.x0, y, 1, 'door_glass', { portal: 'r_pools_mall', sign: 'pool' });
  b.portal({ id: 'r_pools_mall', x: VEST.x0, y: 148, kind: 'door', to: 'pools', tx: 86, ty: 5, label: 'Go through to Splash World' });
  arrive(b, 'p_pools_mall', VEST.x0 + 3, 148, 'e', 4);

  // ============================================================ shells (order matters: later carves win)
  // Main Street, west and east courts
  floorRect(b, 6, 62, 21, 91, 'terrazzo', 'wall_mall');
  floorRect(b, 170, 53, 185, 91, 'terrazzo', 'wall_mall');
  floorRect(b, 22, MS_Y0, 169, MS_Y1, 'terrazzo', 'wall_mall');
  b.roomWalls(6, 62, 21, 91, 'concrete');
  b.roomWalls(170, 53, 185, 91, 'concrete');
  b.hwall(22, 71, MS_Y0, 'drywall'); b.hwall(22, 71, MS_Y1 + 1, 'drywall');
  b.hwall(120, 169, MS_Y0, 'drywall'); b.hwall(120, 169, MS_Y1 + 1, 'drywall');
  for (let y = MS_Y0; y <= MS_Y1; y++) { b.gap(22, y, 1); b.gap(170, y, 1); }
  b.addRoom('Main Street (West)', 'concourse', 22, MS_Y0, 71, MS_Y1, { circuit: C_CONC });
  b.addRoom('Main Street (East)', 'concourse', 120, MS_Y0, 169, MS_Y1, { circuit: C_CONC });
  b.addRoom('West Court', 'court', 6, 62, 21, 91, { circuit: C_CONC });
  b.addRoom('East Court', 'court', 170, 53, 185, 91, { circuit: C_CONC });

  // service corridors
  for (const [x0, x1] of [[6, 71], [120, 185]] as const) {
    floorRect(b, x0, NS_Y0, x1, NS_Y1, 'concrete', 'wall_concrete'); b.roomWalls(x0, NS_Y0, x1, NS_Y1, 'cinder');
    floorRect(b, x0, SS_Y0, x1, SS_Y1, 'concrete', 'wall_concrete'); b.roomWalls(x0, SS_Y0, x1, SS_Y1, 'cinder');
    b.addRoom('Service Corridor', 'service', x0, NS_Y0, x1, NS_Y1, { circuit: C_SERV });
    b.addRoom('Service Corridor', 'service', x0, SS_Y0, x1, SS_Y1, { circuit: C_SERV });
  }
  for (const [x0, x1] of [[6, 85], [110, 185]] as const) {
    floorRect(b, x0, S2_Y0, x1, S2_Y1, 'concrete', 'wall_concrete'); b.roomWalls(x0, S2_Y0, x1, S2_Y1, 'cinder');
    b.addRoom('Service Corridor', 'service', x0, S2_Y0, x1, S2_Y1, { circuit: C_SERV });
  }

  // ============================================================ Main Street stores
  const westN: [number, StoreDef][] = [[10, { label: 'mode', kind: 'clothes', open: true }], [12, { label: 'electro', kind: 'electro', open: true }], [8, { label: 'pretzel', kind: 'food', open: true }], [10, { label: 'gifts', kind: 'gifts', open: false }], [10, { label: 'jewel', kind: 'jewel', open: false }]];
  const westS: [number, StoreDef][] = [[12, { label: 'sports', kind: 'sports', open: false }], [10, { label: 'optical', kind: 'optical', open: false }], [10, { label: 'books', kind: 'books', open: true }], [8, { label: 'candy', kind: 'candy', open: false }], [10, { label: 'worn', kind: 'worn', open: false }]];
  const eastN: [number, StoreDef][] = [[10, { label: 'hallmark', kind: 'gifts', open: false }], [10, { label: 'music', kind: 'music', open: true }], [8, { label: 'pets', kind: 'pets', open: false }], [12, { label: 'toys', kind: 'toys', open: true }], [10, { label: 'apparel', kind: 'clothes', open: false }]];
  const eastS: [number, StoreDef][] = [[10, { label: 'arcade', kind: 'arcade', open: true }], [8, { label: 'kids', kind: 'kids', open: false }], [12, { label: 'pharmacy', kind: 'pharmacy', open: true }], [10, { label: 'dawns', kind: 'shoes', open: false }], [10, { label: 'worn', kind: 'worn', open: false }]];
  const units: Record<string, { x0: number; y0: number; x1: number; y1: number; F: UnitFrame; circuit: number }> = {};
  const row = (list: [number, StoreDef][], xs: number, y0: number, y1: number, front: Side, tag: string) => {
    let x = xs;
    list.forEach(([w, s], i) => {
      const r = buildStore(c, x, y0, x + w - 1, y1, front, s);
      units[tag + i] = { x0: x, y0, x1: x + w - 1, y1, F: r.F, circuit: r.circuit };
      x += w;
    });
  };
  row(westN, 22, NR_Y0, NR_Y1, 's', 'wn'); row(westS, 22, SR_Y0, SR_Y1, 'n', 'ws');
  row(eastN, 120, NR_Y0, NR_Y1, 's', 'en'); row(eastS, 120, SR_Y0, SR_Y1, 'n', 'es');

  // MODE's fitting rooms: the left cubicle is ordinary. The right one is not.
  {
    const u = units.wn0;
    // cubicles in the sales floor's back corner: (x 28..31, y 56..58)
    c.b.clearObjects(28, 56, 31, 61);
    b.vwall(28, 56, 58, 'drywall'); b.vwall(30, 56, 58, 'drywall'); b.hwall(28, 31, 59, 'drywall');
    b.door(28, 59, 0, 'door_wood', { open: true }); b.door(30, 59, 0, 'door_wood', { portal: 'mall_fit_a' });
    mount(b, 'mirror', 28, 56, 'n'); mount(b, 'mirror', 30, 56, 'n');
    b.portal({ id: 'mall_fit_a', x: 30, y: 59, kind: 'door', to: 'mall', tx: 0, ty: 0, anchor: 'fit_b', label: 'Try the fitting room' });
    arrive(b, 'fit_a', 30, 61, 's', 1);
    void u;
  }

  // ============================================================ courts, arms, cinema, food court, the Row; the atrium last (it cuts the openings)
  buildWestCourt(c);
  buildEastCourt(c);
  buildNorthArm(c);
  buildCinema(c);
  buildFoodCourt(c);
  buildSouthArm(c);
  buildRow(c);
  buildAtrium(c);
  serviceDoors(c);
  mainStreetDressing(c);

  // ============================================================ shifting regions
  shiftToys(c, units.en3);
  shiftMode(c);
  shiftAuditorium(c);
  shiftService(c);
  shiftFoodCourt(c);
  shiftRowUnit(c);

  // nothing sealed off (the Row's seams and the cinema's screen 6 stay as they are)
  connectRegions(z, b, VEST.x0 + 3, 148, rng, { keep: [{ x0: ROW_X0, y0: ROWN_Y0, x1: ROW_X1, y1: ROWS_Y1 }] });

  // ============================================================ power, env, creatures
  for (let cc = 1; cc < circuitSeq; cc++) z.power.set(cc, !dead.has(cc));
  z.power.set(C_AUD, false);
  z.env = {
    ...z.env,
    ambient: 0x4a4040, ambientI: 0.7, fog: 0x2e262a, fogNear: 16, fogFar: 40, void: 0x120e12, temp: 20,
    grade: 'mall', reverb: 'mall', ambience: 'mall', music: 'muzak',
  };
  z.spawnTable = [['davenport', 2], ['hollow', 2], ['employee', 1], ['ventling', 1], ['lumenmoth', 1], ['custodian', 0.5]];
  z.creatureCap = 9;
  z.meta.terminalLore = ['terminal_generic', 'terminal'];
  z.meta.shiftRate = 1;
}

// ---------------------------------------------------------------- west court: parking entrance, security, management
function buildWestCourt(c: Ctx) {
  const { b, z, f } = c;
  // parking doors in the west wall
  for (const y of [75, 76, 78, 79]) b.door(6, y, 1, 'door_glass', { portal: 'p_mall_lot', sign: 'exit' });
  b.portal({ id: 'p_mall_lot', x: 6, y: 76, kind: 'door', to: 'parking', tx: 104, ty: 60, label: 'Go out to the parking garage' });
  arrive(b, 'r_mall_lot', 9, 77, 'e', 4);
  fascia(b, 'parking', 6, 72, 'w', true);
  fascia(b, 'parking', 6, 82, 'w', true);
  mount(b, 'exit_sign', 6, 77, 'w');
  for (const y of [74, 80]) force(c, 'plant_tall', 6, y, 0);
  force(c, 'zg_directory', 11, 72, 0, {});
  for (const y of [66, 87]) mount(b, 'payphone', 6, y, 'w');
  mount(b, 'payphone', 6, 67, 'w');
  for (const [x, y] of [[12, 64], [16, 64]] as const) put(c, 'bench', x, y, 0);
  for (const [x, y] of [[12, 89], [16, 89]] as const) put(c, 'bench', x, y, 2);
  put(c, 'trash_can', 10, 64, 0); put(c, 'trash_can', 20, 89, 0);
  put(c, 'gumball_machine', 19, 64, 0); put(c, 'coin_ride', 19, 66, 1);
  for (let y = 64; y <= 90; y += 6) for (const x of [9, 17]) glow(b, x, y, 'fluoro', C_CONC, { color: 0xfff0dc });
  skylight(b, 13, 70, 0.45, 9); skylight(b, 13, 83, 0.45, 9);
  // a parking ticket blown in through the doors
  f.floorItem('note', 8, 80, { lore: 'parking_ticket' });
  for (let i = 0; i < 8; i++) f.decal(c.rng.chance(0.5) ? 'decal_footprints' : 'decal_stain_water', 7 + c.rng.int(0, 5), 74 + c.rng.int(0, 7), 1, 1);

  // MALL SECURITY (north)
  floorRect(b, 6, 52, 21, 61, 'linoleum', 'wall_office');
  b.roomWalls(6, 52, 21, 61, 'concrete');
  b.addRoom('Mall Security', 'security', 6, 52, 21, 61, { circuit: C_OFF });
  b.door(13, 62, 0, 'door_office', { sign: 'staff' });
  fascia(b, 'security', 16, 62, 'n', false);
  b.door(18, 52, 0, 'door_metal', { sign: 'staff' });
  put(c, 'cctv_monitors', 8, 52, 0); put(c, 'security_desk', 8, 54, 2);
  put(c, 'chair_office', 9, 53, 0);
  put(c, 'locker', 20, 53, 1); put(c, 'locker', 20, 54, 1); put(c, 'locker', 20, 55, 1);
  put(c, 'filing_cabinet', 6, 60, 3); put(c, 'water_cooler', 12, 52, 0);
  put(c, 'table_round', 14, 57, 0); put(c, 'chair_plastic', 13, 57, 1); put(c, 'chair_plastic', 15, 57, 3);
  mount(b, 'noticeboard', 14, 52, 'n', { lore: 'muzak_memo' });
  mount(b, 'clock_wall', 10, 52, 'n'); mount(b, 'breaker_panel', 6, 57, 'w');
  f.floorItem('flashlight', 15, 57);
  glow(b, 10, 56, 'fluoro', C_OFF); glow(b, 17, 56, 'fluoro', C_OFF, { flicker: 0.2 });

  // MANAGEMENT (south)
  floorRect(b, 6, 92, 21, 99, 'carpet_office', 'wall_office');
  b.roomWalls(6, 92, 21, 99, 'concrete');
  b.addRoom('Mall Management', 'office', 6, 92, 21, 99, { circuit: C_OFF });
  b.door(14, 92, 0, 'door_office', { sign: 'office' });
  b.door(10, 100, 0, 'door_metal', { sign: 'staff' });
  const d1 = put(c, 'desk_office', 8, 94, 0); if (d1) f.onTop('computer', d1, {});
  put(c, 'chair_office', 8, 95, 2);
  const d2 = put(c, 'desk_office', 16, 96, 3); if (d2) itemOn(c, 'note', d2, { lore: 'muzak_memo' });
  put(c, 'chair_office', 15, 96, 1);
  put(c, 'radio_console', 18, 92, 0); put(c, 'filing_cabinet', 21, 94, 1); put(c, 'filing_cabinet', 21, 95, 1);
  put(c, 'bookshelf', 6, 98, 3); put(c, 'plant_potted', 21, 99, 0); put(c, 'copier', 12, 99, 2);
  mount(b, 'whiteboard', 9, 92, 'n'); mount(b, 'clock_wall', 12, 92, 'n');
  glow(b, 10, 95, 'fluoro', C_OFF); glow(b, 17, 95, 'fluoro', C_OFF);
  void z;
}

// ---------------------------------------------------------------- east court: Foodland
function buildEastCourt(c: Ctx) {
  const { b, f } = c;
  // the anchor store frontage is the court's north wall
  for (let x = 171; x <= 184; x++) b.paper(x, 53, x, 53, 'wall_supermarket');
  for (const x of [176, 177, 179, 180]) b.door(x, 53, 0, 'door_glass', { portal: 'p_mall_market' });
  b.portal({ id: 'p_mall_market', x: 177, y: 53, kind: 'door', to: 'market', tx: 6, ty: 47, label: 'Go into Foodland' });
  arrive(b, 'r_mall_market', 178, 56, 's', 4);
  fascia(b, 'foodland', 173, 53, 'n', true); fascia(b, 'foodland', 183, 53, 'n', true);
  glow(b, 178, 54, 'neon', C_CONC, { color: 0xff5040, intensity: 0.5, radius: 5, y: 2.4 });
  for (const x of [171, 172, 173]) for (let k = 0; k < 2; k++) put(c, 'shopping_cart', x, 55 + k, 2);
  put(c, 'shopping_cart', 183, 58, 1); put(c, 'shopping_cart', 175, 63, 3);
  force(c, 'zg_directory', 182, 66, 0, {});
  for (const [x, y] of [[172, 70], [172, 80]] as const) put(c, 'planter_box', x, y, 1);
  for (const [x, y] of [[180, 70], [180, 80]] as const) put(c, 'bench', x, y, 1);
  put(c, 'coin_ride', 184, 56, 1); put(c, 'gumball_machine', 184, 54, 1); put(c, 'trash_can', 171, 88, 0);
  mount(b, 'payphone', 185, 75, 'e');
  for (let y = 56; y <= 89; y += 6) for (const x of [173, 181]) glow(b, x, y, 'fluoro', C_CONC, { color: 0xfff0dc });
  skylight(b, 177, 64, 0.45, 9); skylight(b, 177, 80, 0.45, 9);
  for (let i = 0; i < 4; i++) f.floorLoot('mall_trash', 172 + c.rng.int(0, 12), 58 + c.rng.int(0, 30));
  // staff break room south of the court
  floorRect(b, 170, 92, 185, 99, 'linoleum', 'wall_office');
  b.roomWalls(170, 92, 185, 99, 'concrete');
  b.addRoom('Staff Room', 'breakroom', 170, 92, 185, 99, { circuit: C_OFF });
  b.door(176, 92, 0, 'door_office', { sign: 'staff' });
  b.door(181, 100, 0, 'door_metal', { sign: 'staff' });
  put(c, 'vending_snack', 171, 92, 0); put(c, 'vending_soda', 172, 92, 0);
  const ck = put(c, 'counter_kitchen', 183, 92, 0); f.onTop('microwave', ck, {}); put(c, 'fridge', 185, 92, 0); put(c, 'counter_sink', 184, 92, 0);
  put(c, 'table_round', 178, 96, 0); put(c, 'chair_plastic', 177, 96, 1); put(c, 'chair_plastic', 179, 96, 3); put(c, 'chair_plastic', 178, 97, 2);
  for (let y = 97; y <= 99; y++) put(c, 'locker', 170, y, 3);
  mount(b, 'noticeboard', 179, 92, 'n', { lore: 'note_generic' }); mount(b, 'clock_wall', 174, 92, 'n');
  glow(b, 174, 95, 'fluoro', C_OFF); glow(b, 181, 95, 'fluoro', C_OFF, { flicker: 0.25 });
}

// ---------------------------------------------------------------- grand atrium
function buildAtrium(c: Ctx) {
  const { b, z, f, rng } = c;
  const A = ATR;
  floorRect(b, A.x0, A.y0, A.x1, A.y1, 'terrazzo', 'wall_mall');
  b.clearWallsIn(A.x0, A.y0, A.x1, A.y1);
  b.roomWalls(A.x0, A.y0, A.x1, A.y1, 'concrete');
  b.addRoom('Grand Atrium', 'atrium', A.x0, A.y0, A.x1, A.y1, { circuit: C_ATR });
  // openings: Main Street both sides, the arms north and south
  for (let y = MS_Y0; y <= MS_Y1; y++) { b.gap(A.x0, y, 1); b.gap(A.x1 + 1, y, 1); }
  for (let x = NARM.x0; x <= NARM.x1; x++) b.gap(x, A.y0, 0);
  for (let x = 106; x <= A.x1; x++) b.gap(x, A.y0, 0); // into the food court
  for (let x = 81; x <= 84; x++) b.gap(x, A.y0, 0); // and up into the cinema lobby
  for (let x = SARM.x0; x <= SARM.x1; x++) b.gap(x, A.y1 + 1, 0);
  // the walls between the arms show storefronts that never opened
  for (const [x0, x1, y] of [[A.x0 + 1, NARM.x0 - 2, A.y0], [SARM.x1 + 2, A.x1 - 1, A.y1 + 1], [A.x0 + 1, SARM.x0 - 2, A.y1 + 1]] as const) {
    for (let x = x0; x <= x1; x++) b.paper(x, y === A.y0 ? y : y - 1, x, y === A.y0 ? y : y - 1, (x % 5) ? 'zg_wall_shutter' : 'zg_wall_shutter_b');
  }
  // sunken fountain court: three steps down (terrazzo risers)
  // centred on the fountain (96, 73): rings at Chebyshev distance 8, 6 and 4
  for (let y = 64; y <= 83; y++) for (let x = 86; x <= 106; x++) {
    const d = Math.max(Math.abs(x - 96), Math.abs(y - 73));
    const h = d <= 4 ? -0.45 : d <= 6 ? -0.3 : d <= 8 ? -0.15 : 0;
    if (h) z.height[z.idx(x, y)] = Math.round(h * 10);
  }
  force(c, 'fountain', 95, 72, 0, {});
  decal(z, 'zg_dc_star', 96.5, 73.5, 9, 9, 0, 0xffffff, 0.9);
  // a brass railing round the edge of the court, open where the steps go down
  for (let x = 88; x <= 104; x++) if (x < 94 || x > 98) { b.hwall(x, x, 65, 'railing'); b.hwall(x, x, 82, 'railing'); }
  for (let y = 65; y <= 81; y++) if (y < 71 || y > 75) { b.vwall(88, y, y, 'railing'); b.vwall(105, y, y, 'railing'); }
  // columns holding up the skylight frame, banners hanging from it
  for (const [x, y] of [[84, 62], [108, 62], [84, 84], [108, 84], [78, 50], [113, 50], [78, 96], [113, 96], [78, 58], [113, 58], [78, 88], [113, 88]] as const) force(c, 'zg_mall_column', x, y, 0, {});
  for (const [x, y, r, v] of [[92, 64, 0, 0], [100, 64, 0, 1], [92, 83, 0, 2], [100, 83, 0, 0], [86, 70, 1, 1], [86, 77, 1, 2], [106, 70, 1, 0], [106, 77, 1, 1]] as const) b.obj('zg_banner', x, y, r as Rot, { v });
  for (const [x, y] of [[88, 65], [103, 65], [88, 81], [103, 81]] as const) put(c, 'planter_box', x, y, 0);
  for (const [x, y, r] of [[95, 67, 0], [95, 79, 2], [90, 72, 3], [102, 72, 1]] as const) put(c, 'bench', x, y, r as Rot, {});
  for (const [x, y] of [[86, 64], [106, 64], [86, 82], [106, 82]] as const) put(c, 'plant_tall', x, y, 0);
  for (let i = 0; i < 9; i++) f.floorItem('coins', 92 + rng.int(0, 7), 70 + rng.int(0, 7));
  // escalators up to a Level 2 that is not open to the public
  for (const x of [75, 78, 110, 113]) {
    force(c, 'escalator', x, A.y0 + 1, 0, {});
    put(c, 'hazard_barrier', x, A.y0 + 5, 0); put(c, 'hazard_barrier', x + 1, A.y0 + 5, 0);
  }
  fascia(b, 'level2', 78, A.y0, 'n', true); fascia(b, 'level2', 112, A.y0, 'n', true);
  // information desk (Mia is waiting there)
  floorRect(b, 73, 56, 77, 62, 'carpet_red');
  const d1 = force(c, 'reception_desk', 75, 58, 3, {}); force(c, 'reception_desk', 75, 60, 3, {});
  put(c, 'chair_office', 73, 59, 1); put(c, 'chair_office', 73, 61, 1);
  mount(b, 'noticeboard', 72, 58, 'w', { lore: 'lost_child_notice' });
  fascia(b, 'info', 72, 61, 'w', true);
  itemOn(c, 'note', d1, { lore: 'lost_child_notice' });
  put(c, 'teddy_giant', 77, 57, 3);
  f.floorItem('backpack_school', 74, 57);
  put(c, 'radio_console', 73, 62, 1);
  mount(b, 'clock_wall', 72, 56, 'w');
  b.addRoom('Information Desk', 'info_desk', 73, 56, 77, 62, { circuit: C_ATR });
  // the photo kiosk: a hundred photographs of nobody
  const kx = 80, ky = 88;
  const k = force(c, 'kiosk', kx, ky, 0, { loot: 'lore_bits' });
  force(c, 'photo_booth', kx + 2, ky, 3, {});
  if (k) for (let i = 0; i < 6; i++) itemAt(z, rng, 'photo_old', kx + (i % 2), ky + (i >> 2), 1.13, {}, 0.35);
  for (let i = 0; i < 7; i++) { const x = kx - 2 + rng.int(0, 6), y = ky - 1 + rng.int(0, 4); if (isOpen(z, x, y)) f.floorItem('photo_old', x, y); }
  // a second kiosk (sunglasses), coin rides, gumballs, directories, payphones
  force(c, 'kiosk', 108, 88, 0, {});
  force(c, 'zg_directory', 84, 60, 0, {}); force(c, 'zg_directory', 107, 60, 0, {});
  put(c, 'coin_ride', 112, 92, 0); put(c, 'coin_ride', 114, 92, 0); put(c, 'gumball_machine', 116, 92, 0);
  for (const y of [86, 88, 90]) mount(b, 'payphone', A.x0, y, 'w');
  for (const [x, y] of [[76, 50], [115, 50], [76, 96], [115, 96], [84, 98], [107, 98]] as const) put(c, 'plant_tall', x, y, 0);
  for (const [x, y] of [[80, 66], [80, 80], [110, 66], [110, 80]] as const) put(c, 'planter_box', x, y, 1);
  for (const [x, y] of [[84, 66], [84, 80], [106, 66], [106, 80]] as const) put(c, 'trash_can', x, y, 0);
  for (const [x, y] of [[80, 54], [110, 54], [80, 94], [110, 94]] as const) put(c, 'bench', x, y, 0);
  // skylights over everything; warm lamps around the edge
  for (let y = A.y0 + 4; y <= A.y1 - 2; y += 8) for (let x = A.x0 + 4; x <= A.x1 - 2; x += 8) skylight(b, x, y, 0.5, 10);
  skylight(b, 95, 73, 0.9, 12, 0xeef4ff);
  for (let y = A.y0 + 2; y <= A.y1; y += 7) { glow(b, A.x0 + 1, y, 'lamp', C_ATR, { y: 2.6, radius: 5 }); glow(b, A.x1 - 1, y, 'lamp', C_ATR, { y: 2.6, radius: 5 }); }
  scatterLoot(c, 'mall_trash', A.x0, A.y0, A.x1, A.y1, 10);
  scatterDecals(c, A.x0, A.y0, A.x1, A.y1, 30, [['decal_stain_water', 3], ['decal_footprints', 3], ['decal_trash', 1], ['decal_crack', 1]]);
}

// ---------------------------------------------------------------- north arm
function buildNorthArm(c: Ctx) {
  const { b, z } = c;
  const A = NARM;
  floorRect(b, A.x0, A.y0, A.x1, A.y1, 'terrazzo', 'wall_mall');
  b.roomWalls(A.x0, A.y0, A.x1, A.y1, 'concrete');
  b.addRoom('North Arm', 'concourse', A.x0, A.y0, A.x1, A.y1, { circuit: C_ARM });
  // more escalators up to nowhere at the far end
  for (const x of [89, 101]) { force(c, 'escalator', x, A.y0, 0, {}); put(c, 'hazard_barrier', x, A.y0 + 4, 0); put(c, 'hazard_barrier', x + 1, A.y0 + 4, 0); }
  fascia(b, 'level2', 95, A.y0, 'n', true);
  mount(b, 'painting', 94, A.y0, 'n', { v: 3 }); mount(b, 'painting', 97, A.y0, 'n', { v: 1 });
  for (let y = A.y0 + 8; y <= A.y1 - 2; y += 9) { force(c, 'zg_mall_column', A.x0 + 3, y, 0, {}); force(c, 'zg_mall_column', A.x1 - 3, y, 0, {}); }
  for (let y = A.y0 + 10; y <= A.y1; y += 9) b.obj('zg_banner', 95, y, 0, { v: y % 3 });
  // the carousel, still lit, turning for nobody
  force(c, 'carousel', 94, 20, 0, {});
  for (const [x, y] of [[92, 19], [99, 19], [92, 24], [99, 24]] as const) put(c, 'coin_ride', x, y, 0);
  for (const y of [12, 30, 38]) { put(c, 'planter_box', 95, y, 0); put(c, 'bench', 92, y, 1); put(c, 'bench', 98, y, 3); }
  force(c, 'zg_directory', 103, 32, 0, {});
  put(c, 'kiosk', 88, 34, 0, { loot: 'store_toys' });
  put(c, 'trash_can', 88, 14, 0); put(c, 'trash_can', 104, 26, 0);
  for (let y = A.y0 + 3; y <= A.y1; y += 7) { skylight(b, 91, y, 0.45, 9); skylight(b, 100, y, 0.45, 9); }
  for (let y = A.y0 + 2; y <= A.y1; y += 6) { glow(b, A.x0 + 1, y, 'lamp', C_ARM, { y: 2.6, radius: 5 }); glow(b, A.x1 - 1, y, 'lamp', C_ARM, { y: 2.6, radius: 5 }); }
  scatterLoot(c, 'mall_trash', A.x0, A.y0, A.x1, A.y1, 4);
  scatterDecals(c, A.x0, A.y0, A.x1, A.y1, 10, [['decal_stain_water', 3], ['decal_footprints', 2], ['decal_trash', 1]]);
  void z;
}

// ---------------------------------------------------------------- cinema 6
const AUD: { n: number; x0: number; y0: number; x1: number; y1: number; north: boolean }[] = [
  { n: 6, x0: 8, y0: 6, x1: 25, y1: 24, north: true }, { n: 4, x0: 26, y0: 6, x1: 43, y1: 24, north: true }, { n: 2, x0: 44, y0: 6, x1: 61, y1: 24, north: true },
  { n: 5, x0: 8, y0: 29, x1: 25, y1: 48, north: false }, { n: 3, x0: 26, y0: 29, x1: 43, y1: 48, north: false }, { n: 1, x0: 44, y0: 29, x1: 61, y1: 48, north: false },
];
function seatsFor(c: Ctx, a: typeof AUD[number], keep: (x: number, y: number) => boolean = () => true, rotOverride?: Rot) {
  const { b } = c;
  if (a.north) {
    // screen on the north wall, rows facing north
    for (let y = a.y0 + 5; y <= a.y1 - 3; y += 2) for (const x of [a.x0 + 2, a.x0 + 5, a.x1 - 7, a.x1 - 4]) if (keep(x, y)) b.obj('waiting_chairs', x, y, rotOverride ?? 2, {});
  } else {
    // screen on the west wall, rows facing west
    for (let x = a.x0 + 5; x <= a.x1 - 3; x += 2) for (const y of [a.y0 + 3, a.y0 + 6, a.y1 - 8, a.y1 - 5]) if (keep(x, y)) b.obj('waiting_chairs', x, y, rotOverride ?? 1, {});
  }
}
function buildCinema(c: Ctx) {
  const { b, z, f, rng } = c;
  // lobby
  floorRect(b, 62, 6, 85, 43, 'carpet_hotel', 'wall_hotel');
  b.roomWalls(62, 6, 85, 43, 'concrete');
  b.addRoom('Cinema 6 Lobby', 'cinema', 62, 6, 85, 43, { circuit: C_CIN });
  for (let y = 10; y <= 40; y++) b.vwall(86, y, y, 'glass');
  for (const y of [22, 23, 26, 27]) b.door(86, y, 1, 'door_glass', { open: true });
  fascia(b, 'cinema', 86, 18, 'w', true); fascia(b, 'cinema', 86, 31, 'w', true);
  glow(b, 87, 24, 'neon', C_CIN, { color: 0xff4060, intensity: 0.6, radius: 6, y: 2.4 });
  // concessions along the north wall, ticket booth by the doors, arcade cabinets on the west wall
  for (const x of [66, 70, 74]) { const o = force(c, 'food_court_counter', x, 8, 0, { loot: 'store_snacks' }); void o; }
  fascia(b, 'candy', 71, 6, 'n', true);
  put(c, 'freezer_display', 77, 6, 0); put(c, 'freezer_display', 78, 6, 0); put(c, 'vending_soda', 79, 6, 0); put(c, 'vending_snack', 80, 6, 0);
  force(c, 'ticket_booth', 82, 33, 0, { lore: 'note_generic' });
  for (let y = 12; y <= 22; y += 2) put(c, 'arcade_machine', 62, y, 3);
  put(c, 'photo_booth', 62, 26, 3); put(c, 'gumball_machine', 62, 30, 3);
  for (let y = 9; y <= 42; y += 3) { if (y > 23 && y < 30) continue; mount(b, 'poster', 62, y, 'w', { v: y % 6 }); }
  for (const [x, y] of [[70, 36], [76, 36], [70, 40], [76, 40]] as const) put(c, 'waiting_chairs', x, y, 0);
  for (const [x, y] of [[67, 18], [80, 18]] as const) put(c, 'mannequin', x, y, 0); // cardboard standees of a film nobody remembers
  put(c, 'trash_can', 84, 20, 0); put(c, 'trash_can', 84, 29, 0); put(c, 'plant_tall', 85, 10, 0); put(c, 'plant_tall', 85, 41, 0);
  for (let y = 10; y <= 44; y += 6) for (const x of [66, 73, 80]) glow(b, x, y, 'fluoro', C_CIN, { color: 0xffe0c0, flicker: rng.chance(0.15) ? 0.2 : 0 });
  for (let i = 0; i < 12; i++) f.floorItem(rng.chance(0.5) ? 'soda_can_empty' : 'food_scraps', 64 + rng.int(0, 20), 10 + rng.int(0, 30));
  scatterDecals(c, 62, 6, 85, 43, 14, [['decal_stain_dark', 2], ['decal_trash', 2], ['decal_stain_water', 1]]);
  // corridor to the screens
  floorRect(b, 8, 25, 61, 28, 'carpet_red', 'wall_hotel');
  b.roomWalls(8, 25, 61, 28, 'concrete');
  for (let y = 25; y <= 28; y++) b.gap(62, y, 1);
  b.addRoom('Screens Corridor', 'cinema_corridor', 8, 25, 61, 28, { circuit: C_CIN });
  for (let x = 12; x <= 60; x += 8) glow(b, x, 26, 'bulb', C_CIN, { color: 0xffb070, intensity: 0.7, flicker: x === 12 ? 0.35 : 0 });
  for (let x = 10; x <= 58; x += 6) mount(b, 'poster', x, 25, 'n', { v: (x >> 1) % 6 });
  // auditoriums
  for (const a of AUD) {
    floorRect(b, a.x0, a.y0, a.x1, a.y1, 'carpet_red', 'wall_paneling');
    b.roomWalls(a.x0, a.y0, a.x1, a.y1, 'concrete');
    b.addRoom('Screen ' + a.n, 'auditorium', a.x0, a.y0, a.x1, a.y1, { circuit: C_AUD, temp: 18 });
    const dx = a.n === 6 ? a.x1 - 3 : a.x1 - 3;
    if (a.north) { b.door(dx, a.y1 + 1, 0, 'door_wood', { open: a.n !== 6 && rng.chance(0.5) }); fascia(b, 'scr' + a.n, dx - 3, a.y1 + 1, 'n', a.n !== 6); }
    else b.door(dx, a.y0, 0, 'door_wood', { open: rng.chance(0.5) });
    // screens 2 and 1 are still showing light; screen 6 is showing snow; the rest are dark
    const lit = a.n === 6 || a.n === 2 || a.n === 1;
    if (a.north) mount(b, 'zg_cinema_screen', a.x0 + 7, a.y0, 'n', { static: a.n === 6, circuit: lit ? C_SCREEN : C_AUD, on: lit });
    else mount(b, 'zg_cinema_screen', a.x0, a.y0 + 8, 'w', { circuit: lit ? C_SCREEN : C_AUD, on: lit });
    // dim aisle lights on the steps, mostly dead
    for (let k = 0; k < 3; k++) glow(b, a.north ? a.x0 + 8 : a.x0 + 6 + k * 4, a.north ? a.y0 + 6 + k * 5 : a.y0 + 9, 'bulb', k === 0 ? C_SCREEN : C_AUD, { intensity: 0.35, radius: 3.5, color: 0xff9060 });
    if (a.n !== 4) seatsFor(c, a);
    if (!c.stamp) {
      scatterDecals(c, a.x0, a.y0, a.x1, a.y1, 6, [['decal_stain_dark', 2], ['decal_trash', 1]]);
      for (let i = 0; i < 3; i++) { const x = rng.int(a.x0 + 1, a.x1 - 1), y = rng.int(a.y0 + 1, a.y1 - 1); if (isOpen(z, x, y)) f.floorItem(rng.pick(['soda_can_empty', 'food_scraps', 'candy_bar']), x, y); }
    }
  }
  // screen 6: the film ended in 1987 and something is still standing in the snow.
  // The exit door beside the screen opens onto the unrendered.
  b.door(8, 9, 1, 'door_metal', { portal: 'p_mall_cinema', sign: 'exit', locked: true });
  b.portal({ id: 'p_mall_cinema', x: 8, y: 9, kind: 'door', to: 'corrupt', tx: 64, ty: 64, label: 'Open the exit door', locked: 'stage:2' });
  arrive(b, 'r_mall_cinema', 10, 9, 'e', 3);
  b.clearObjects(9, 8, 11, 10);
  mount(b, 'exit_sign', 8, 8, 'w');
  f.floorItem('note', 12, 10, { lore: 'note_generic' });
  glow(b, 9, 9, 'emergency', C_SCREEN, { intensity: 0.4, radius: 3, flicker: 0.1 });
  // projection room behind the lobby's south end
  floorRect(b, 62, 45, 71, 48, 'concrete', 'wall_concrete');
  b.roomWalls(62, 45, 71, 48, 'concrete');
  b.addRoom('Projection Room', 'projection', 62, 45, 71, 48, { circuit: C_CIN });
  b.door(66, 45, 0, 'door_metal', { sign: 'staff' });
  b.door(64, 49, 0, 'door_metal', { sign: 'staff' });
  put(c, 'tape_mainframe', 62, 45, 0); put(c, 'shelf_metal', 69, 45, 0, { loot: 'store_electronics' }); put(c, 'workbench', 70, 47, 3);
  glow(b, 66, 47, 'bulb', C_CIN, { intensity: 0.6, flicker: 0.3 });
}

// ---------------------------------------------------------------- food court
const FOOD_NAMES = ['pizza', 'wok', 'burger', 'worn', 'taco', 'yogurt', 'cookie', 'hotdog', 'juice', 'chicken'];
function buildFoodCourt(c: Ctx) {
  const { b, z, f, rng } = c;
  const x0 = 106, y0 = 6, x1 = 185, y1 = 43;
  floorRect(b, x0, y0, x1, y1, 'checker', 'wall_mall');
  b.roomWalls(x0, y0, x1, y1, 'concrete');
  b.addRoom('Food Court', 'food_court', x0, y0, x1, y1, { circuit: C_FOOD });
  for (let y = 10; y <= y1; y++) b.gap(x0, y, 1);
  // restaurants along the north wall
  FOOD_NAMES.forEach((name, i) => {
    const ux = x0 + i * 8;
    b.vwall(ux, y0, y0 + 2, 'drywall'); if (i === FOOD_NAMES.length - 1) b.vwall(ux + 8, y0, y0 + 2, 'drywall');
    b.fillFloor(ux, y0, ux + 7, y0 + 1, 'tile_kitchen');
    const closed = name === 'worn';
    const cc = circuitSeq++;
    if (closed) dead.add(cc);
    b.addRoom(name === 'worn' ? 'Closed Counter' : 'Food Counter', 'restaurant', ux, y0, ux + 7, y0 + 2, { circuit: cc });
    if (closed) { b.hwall(ux, ux + 7, y0 + 3, 'drywall'); for (let x = ux + 1; x <= ux + 5; x++) b.paper(x, y0 + 3, x, y0 + 3, 'zg_wall_shutter'); b.door(ux + 6, y0 + 3, 0, 'door_metal', { sign: 'staff', locked: true }); }
    else {
      b.hwall(ux, ux + 1, y0 + 3, 'drywall'); b.hwall(ux + 5, ux + 7, y0 + 3, 'drywall');
      b.door(ux + 6, y0 + 3, 0, 'door_office', { sign: 'staff' });
      force(c, 'food_court_counter', ux + 2, y0 + 2, 0, {});
      put(c, 'stove', ux + 1, y0, 0); put(c, 'fridge', ux + 6, y0, 0); put(c, 'counter_kitchen', ux + 3, y0, 0, { loot: 'kitchen_counter' }); put(c, 'counter_sink', ux + 4, y0, 0);
      glow(b, ux + 3, y0 + 3, 'fluoro', cc, { color: 0xfff4e0 });
    }
    fascia(b, closed ? 'worn' : 'fc_' + name, ux + 3, closed ? y0 + 3 : y0, 'n', !closed);
  });
  // seating: rows of tables around the carousel-less middle (the carousel is in the North Arm)
  seatingField(c, 112, 14, 180, 40, false);
  put(c, 'zg_directory', 108, 40, 0, {});
  for (const x of [118, 140, 162, 182]) { put(c, 'trash_can', x, 12, 0); put(c, 'recycle_bin', x + 1, 12, 0); }
  for (let y = 16; y <= 40; y += 8) for (let x = 112; x <= 180; x += 10) skylight(b, x, y, 0.5, 10);
  for (let x = 110; x <= 182; x += 8) glow(b, x, 11, 'fluoro', C_FOOD, { color: 0xfff0dc });
  for (let x = 110; x <= 182; x += 12) glow(b, x, 42, 'lamp', C_FOOD, { y: 2.6, radius: 5 });
  scatterLoot(c, 'mall_trash', x0, 12, x1, y1, 14);
  for (let i = 0; i < 16; i++) { const x = rng.int(x0 + 2, x1 - 2), y = rng.int(12, y1 - 1); if (isOpen(z, x, y)) f.floorItem(rng.pick(['soda_can_empty', 'food_scraps', 'empty_can']), x, y); }
  scatterDecals(c, x0, 10, x1, y1, 30, [['decal_stain_dark', 3], ['decal_trash', 3], ['decal_stain_water', 1]]);
  // back of house strip: storage and a freezer room behind the food court, off the service corridor
  for (const [rx0, rx1, name, type] of [[120, 141, 'Food Court Storage', 'storage'], [142, 163, 'Walk-in Freezer', 'freezer'], [164, 185, 'Loading Hall', 'storage']] as const) {
    floorRect(b, rx0, 44, rx1, 48, 'concrete', 'wall_concrete');
    b.roomWalls(rx0, 44, rx1, 48, 'cinder');
    b.addRoom(name, type, rx0, 44, rx1, 48, { circuit: C_SERV, temp: type === 'freezer' ? -4 : undefined });
    b.door(rx0 + 3, 49, 0, 'door_metal', { sign: 'staff' });
    for (let x = rx0 + 1; x < rx1; x += 3) put(c, type === 'freezer' ? 'freezer_chest' : 'shelf_metal', x, 44, 0, { loot: type === 'freezer' ? 'store_frozen' : 'pantry' });
    for (let x = rx0 + 2; x < rx1; x += 5) put(c, rng.chance(0.5) ? 'pallet_boxes' : 'cardboard_stack', x, 47, 0);
    glow(b, rx0 + 6, 46, 'bulb', C_SERV, { flicker: rng.chance(0.4) ? 0.25 : 0 }); glow(b, rx1 - 6, 46, 'bulb', C_SERV);
  }
}
/** tables and chairs in a field; `stamp` variants use the same layout */
function seatingField(c: Ctx, x0: number, y0: number, x1: number, y1: number, sparse: boolean) {
  const { rng } = c;
  for (let y = y0; y + 1 <= y1; y += 5) for (let x = x0; x + 1 <= x1; x += 6) {
    if (sparse && rng.chance(0.4)) continue;
    if (rng.chance(0.55)) {
      const t = put(c, 'cafeteria_table', x, y, 0);
      if (t) { put(c, 'chair_plastic', x - 1, y, 1); put(c, 'chair_plastic', x + 2, y + 1, 3); put(c, 'chair_plastic', x, y + 2, 2); put(c, 'chair_plastic', x + 1, y - 1, 0); }
    } else {
      put(c, 'table_round', x, y, 0); put(c, 'chair_plastic', x - 1, y, 1); put(c, 'chair_plastic', x + 1, y, 3);
      put(c, 'table_round', x + 1, y + 2, 0); put(c, 'chair_plastic', x + 1, y + 3, 2);
      if (rng.chance(0.3)) put(c, 'chair_plastic', x + 3, y + 1, rng.int(0, 3) as Rot);
    }
  }
}

// ---------------------------------------------------------------- south arm, restrooms, photo store, vestibule
function buildSouthArm(c: Ctx) {
  const { b, z, f, rng } = c;
  const A = SARM;
  floorRect(b, A.x0, A.y0, A.x1, A.y1, 'terrazzo', 'wall_mall');
  b.roomWalls(A.x0, A.y0, A.x1, A.y1, 'concrete');
  b.addRoom('South Arm', 'concourse', A.x0, A.y0, A.x1, A.y1, { circuit: C_ARM });
  for (let x = A.x0; x <= A.x1; x++) { b.gap(x, A.y0, 0); b.gap(x, A.y1 + 1, 0); }
  for (let y = ROW_Y0; y <= ROW_Y1; y++) { b.gap(A.x0, y, 1); b.gap(A.x1 + 1, y, 1); }
  for (const y of [107, 116, 134, 141]) { put(c, 'planter_box', 97, y, 0); put(c, 'bench', 93, y, 1); put(c, 'bench', 101, y, 3); }
  for (const y of [111, 138]) { force(c, 'zg_mall_column', A.x0 + 3, y, 0, {}); force(c, 'zg_mall_column', A.x1 - 3, y, 0, {}); }
  for (const y of [110, 130, 140]) b.obj('zg_banner', 97, y, 0, { v: y % 3 });
  force(c, 'zg_directory', 88, 118, 0, {}); force(c, 'zg_directory', 107, 129, 0, {});
  put(c, 'kiosk', 96, 112, 0, { loot: 'store_clothing' });
  put(c, 'trash_can', 87, 110, 0); put(c, 'trash_can', 108, 138, 0);
  for (let y = A.y0 + 3; y <= A.y1; y += 7) { skylight(b, 91, y, 0.45, 9); skylight(b, 104, y, 0.45, 9); }
  for (let y = A.y0 + 2; y <= A.y1; y += 6) { glow(b, A.x0 + 1, y, 'lamp', C_ARM, { y: 2.6, radius: 5 }); glow(b, A.x1 - 1, y, 'lamp', C_ARM, { y: 2.6, radius: 5 }); }
  scatterLoot(c, 'mall_trash', A.x0, A.y0, A.x1, A.y1, 5);
  scatterDecals(c, A.x0, A.y0, A.x1, A.y1, 12, [['decal_stain_water', 3], ['decal_footprints', 3], ['decal_puddle', 1]]);

  // vestibule: towels, wet footprints coming in from the water park, the smell of chlorine
  fascia(b, 'splash', VEST.x0, 145 + 1, 'w', true);
  glow(b, VEST.x0 + 2, 148, 'sky', C_ARM, { color: 0x80d8ff, intensity: 0.7, radius: 7, y: 2.6 });
  glow(b, 98, 148, 'fluoro', C_ARM, { color: 0xe0f4ff });
  put(c, 'towel_stack', 107, 151, 0); put(c, 'towel_stack', 108, 151, 0); put(c, 'lifeguard_chair', 106, 145, 0);
  put(c, 'pool_lounger', 101, 150, 1); put(c, 'float_ring', 95, 151, 0);
  mount(b, 'pool_rules_sign', 92, 145, 'n', { lore: 'sign_pool_rules' });
  for (let i = 0; i < 6; i++) decal(z, 'decal_footprints', 89 + i * 2.2, 148.5 - i * 0.6, 1, 1, -0.3, 0x9ad0e8, 0.7);
  for (let i = 0; i < 5; i++) decal(z, 'decal_puddle', 88 + rng.int(0, 18) + 0.5, 146 + rng.int(0, 5) + 0.5, 1.6, 1.6, rng.float(0, 6), 0xd0f0ff);
  f.floorItem('toy_rubber_duck', 103, 147);
  // doors from the vestibule to the service corridors
  b.door(VEST.x0, 146, 1, 'door_metal', { sign: 'staff' }); b.door(VEST.x1 + 1, 146, 1, 'door_metal', { sign: 'staff' });

  // restrooms (west, facing the arm) in the Row's unit 9 north slot
  floorRect(b, 78, 103, 85, 120, 'tile_white', 'wall_bathroom');
  b.roomWalls(78, 103, 85, 111, 'tile'); b.roomWalls(78, 112, 85, 120, 'tile');
  b.addRoom("Women's Restroom", 'restroom', 78, 103, 85, 111, { circuit: C_OFF });
  b.addRoom("Men's Restroom", 'restroom', 78, 112, 85, 120, { circuit: C_OFF });
  b.door(86, 108, 1, 'door_white', { sign: 'restroom' }); b.door(86, 117, 1, 'door_white', { sign: 'restroom' });
  fascia(b, 'restrooms', 86, 113, 'w', true);
  for (const [ry0, uri] of [[103, false], [112, true]] as const) {
    for (let x = 78; x <= 82; x += 2) { b.vwall(x + 2, ry0, ry0 + 1, 'cubicle'); put(c, 'toilet', x, ry0, 0); }
    for (let y = ry0 + 4; y <= ry0 + 7; y++) { put(c, 'sink_bathroom', 78, y, 3); mount(b, 'mirror', 78, y, 'w'); }
    if (uri) for (const x of [83, 84]) mount(b, 'urinal', x, ry0 + 8, 's');
    put(c, 'trash_can', 85, ry0 + 4, 0);
    glow(b, 81, ry0 + 4, 'fluoro', C_OFF, { flicker: ry0 === 112 ? 0.3 : 0 });
  }
  // janitor room (west, south slot)
  floorRect(b, 78, 127, 85, 144, 'concrete', 'wall_concrete');
  b.roomWalls(78, 127, 85, 144, 'cinder');
  b.addRoom('Janitor', 'janitor', 78, 127, 85, 144, { circuit: C_SERV });
  b.door(86, 131, 1, 'door_metal', { sign: 'maintenance' }); b.door(80, 145, 0, 'door_metal', {});
  put(c, 'janitor_cart', 79, 128, 0); put(c, 'mop_bucket', 80, 128, 0); put(c, 'shelf_metal', 85, 128, 1, { loot: 'janitor' }); put(c, 'shelf_metal', 85, 129, 1, { loot: 'maintenance' });
  put(c, 'water_heater', 78, 143, 3); put(c, 'electrical_cabinet', 85, 143, 1);
  mount(b, 'breaker_panel', 78, 133, 'w'); mount(b, 'pipes_cluster', 81, 127, 'n');
  put(c, 'chair_folding', 82, 136, 2); put(c, 'radio_console', 84, 138, 1);
  f.floorItem('note', 82, 137, { lore: 'muzak_memo' });
  glow(b, 81, 132, 'bulb', C_SERV, { flicker: 0.3 }); glow(b, 81, 140, 'bulb', C_SERV);
  // 1 HOUR PHOTO (east, facing the arm): a hundred frames, nobody in them
  buildStore(c, 110, 103, 117, 120, 'w', { label: 'photo', kind: 'photo', open: true }, { backDoor: false });
  // staff room (east, south slot)
  floorRect(b, 110, 127, 117, 144, 'linoleum', 'wall_office');
  b.roomWalls(110, 127, 117, 144, 'drywall');
  b.addRoom('Lost & Found', 'lost_found', 110, 127, 117, 144, { circuit: C_OFF });
  b.door(110, 132, 1, 'door_office', { sign: 'office' }); b.door(114, 145, 0, 'door_metal', {});
  put(c, 'reception_desk', 111, 130, 3); put(c, 'chair_office', 112, 130, 1);
  for (let y = 135; y <= 143; y += 2) put(c, 'shelf_metal', 117, y, 1, { loot: 'generic' });
  for (const [x, y] of [[111, 140], [112, 142], [113, 139]] as const) put(c, 'cardboard_box', x, y, 0, { loot: 'generic' });
  put(c, 'teddy_giant', 115, 134, 3);
  f.floorItem('backpack_school', 112, 136); f.floorItem('teddy_bear', 113, 137);
  glow(b, 113, 132, 'fluoro', C_OFF); glow(b, 113, 140, 'fluoro', C_OFF, { flicker: 0.2 });
}

// ---------------------------------------------------------------- the Repeating Row
/** unit index of a Row unit starting at x0 */
const rowJ = (x0: number) => Math.round((x0 - ROW_X0) / 8);
function buildRow(c: Ctx) {
  const { b, z } = c;
  // corridor
  floorRect(b, ROW_X0, ROW_Y0, ROW_X1, ROW_Y1, 'terrazzo', 'wall_mall');
  b.hwall(ROW_X0, ROW_X1, ROW_Y0, 'drywall'); b.hwall(ROW_X0, ROW_X1, ROW_Y1 + 1, 'drywall');
  b.vwall(ROW_X0, ROW_Y0, ROW_Y1, 'concrete'); b.vwall(ROW_X1 + 1, ROW_Y0, ROW_Y1, 'concrete');
  b.addRoom('The Row', 'row', ROW_X0, ROW_Y0, SARM.x0 - 1, ROW_Y1, { circuit: C_ROW });
  b.addRoom('The Row', 'row', SARM.x1 + 1, ROW_Y0, ROW_X1, ROW_Y1, { circuit: C_ROW });
  for (let x = SARM.x0; x <= SARM.x1; x++) { b.gap(x, ROW_Y0, 0); b.gap(x, ROW_Y1 + 1, 0); }
  // units: everything is a pure function of the unit index mod 16, so the seams cannot be seen
  for (let x0 = ROW_X0; x0 <= ROW_X1; x0 += 8) {
    const j = rowJ(x0);
    if (j >= 10 && j <= 12) continue; // the arm crossing
    const x1 = Math.min(ROW_X1, x0 + 7);
    if (j !== 9 && j !== 13) rowUnit(c, x0, x1, 'n', j);
    if (j !== 9 && j !== 13) rowUnit(c, x0, x1, 's', j);
  }
  // corridor dressing (periodic)
  for (let x = ROW_X0; x <= ROW_X1; x++) {
    if (x >= SARM.x0 && x <= SARM.x1) continue;
    const p = ((x - ROW_X0) % ROW_D + ROW_D) % ROW_D;
    if (p % 16 === 4) glow(b, x, 123, 'fluoro', C_ROW, { color: 0xfff0e0, flicker: p % 48 === 20 ? 0.3 : 0, broken: p % 80 === 36 });
    if (p % 32 === 12) { b.obj('bench', x, 123, 0, {}); }
    if (p % 32 === 28) b.obj('planter_box', x, 124, 0, {});
    if (p % 64 === 44) b.obj('trash_can', x, 121, 0, {});
    const h = hash3(p, 7, 31) / 4294967296;
    if (h < 0.08) decal(z, h < 0.04 ? 'decal_stain_water' : 'decal_footprints', x + 0.5, 122.5 + (h * 100 % 3), 1.1, 1.0, h * 40, undefined, 0.8);
  }
  // the seams: walking past either one puts you 128 tiles back the other way
  for (let y = ROW_Y0; y <= ROW_Y1; y++) {
    b.portal({ id: 'loop_row_w' + y, x: ROW_SW, y, kind: 'loop', to: 'mall', tx: ROW_SW + ROW_D, ty: y, loopDx: ROW_D, hidden: true });
    b.portal({ id: 'loop_row_e' + y, x: ROW_SE, y, kind: 'loop', to: 'mall', tx: ROW_SE - ROW_D, ty: y, loopDx: -ROW_D, hidden: true });
  }
  // nothing spawns in the parts only the eye can reach
  b.flag(ROW_X0, ROWN_Y0, ROW_SW, ROWS_Y1, TF.NOSPAWN);
  b.flag(ROW_SE, ROWN_Y0, ROW_X1, ROWS_Y1, TF.NOSPAWN);
  // a few things on the floor of the real stretch
  scatterLoot(c, 'mall_trash', ROW_SW + 6, ROW_Y0, SARM.x0 - 4, ROW_Y1, 3);
  scatterLoot(c, 'mall_trash', SARM.x1 + 4, ROW_Y0, ROW_SE - 6, ROW_Y1, 3);
  c.f.floorItem('note', 66, 124, { lore: 'note_generic' });
  // the fitting room in MODE comes out of a Dawn's Shoes stockroom here (unit 14, south)
  {
    const x0 = ROW_X0 + 14 * 8; // 118
    b.door(x0 + 2, ROWS_Y1 - 3, 0, 'door_wood', { portal: 'mall_fit_b' });
    b.portal({ id: 'mall_fit_b', x: x0 + 2, y: ROWS_Y1 - 3, kind: 'door', to: 'mall', tx: 0, ty: 0, anchor: 'fit_a', label: 'Go back through the curtain' });
    arrive(b, 'fit_b', x0 + 2, ROWS_Y1 - 5, 'n', 1);
    b.clearObjects(x0 + 1, ROWS_Y1 - 6, x0 + 3, ROWS_Y1 - 3);
  }
}

/** one Dawn's Shoes unit of the Row: deterministic in (j mod 16) so every copy matches */
function rowUnit(c: Ctx, x0: number, x1: number, side: 'n' | 's', j: number, stamp = false) {
  const { b, z } = c;
  const jj = ((j % 16) + 16) % 16;
  const y0 = side === 'n' ? ROWN_Y0 : ROWS_Y0, y1 = side === 'n' ? ROWN_Y1 : ROWS_Y1;
  const front: Side = side === 'n' ? 's' : 'n';
  const F = unitFrame(x0, y0, x1, y1, front);
  const closed = jj === 11 && side === 'n';
  const darkUnit = jj === 5;
  const label = jj === 13 ? 'worn' : 'dawns';
  if (!stamp) {
    floorRect(b, x0, y0, x1, y1, 'carpet_red', 'wall_mall');
    b.roomWalls(x0, y0, x1, y1, 'drywall');
    b.addRoom(label === 'worn' ? 'A Shoe Store' : "Dawn's Shoes", 'store', x0, y0, x1, y1, { circuit: C_ROW });
    // stockroom (3 deep) with a door; storefront glass with a 2-wide gap
    const salesD = 14;
    for (let u = 0; u < F.W; u++) wallBetween(b, F.P(u, salesD - 1), F.P(u, salesD));
    if (F.W >= 3) doorBetween(b, F.P(2, salesD - 1), F.P(2, salesD), 'door_office', { open: jj % 3 === 0 });
    const [bx0, by0] = F.span(0, salesD, F.W, F.D - salesD);
    b.fillFloor(bx0, by0, bx0 + F.W - 1, by0 + F.D - salesD - 1, 'concrete');
    b.paper(bx0, by0, bx0 + F.W - 1, by0 + F.D - salesD - 1, 'wall_concrete');
    for (let u = 0; u < F.W; u++) {
      const [ex, ey, es] = edgeBetween(F.P(u, 0), F.P(u, -1));
      if (closed) { if (u > 0 && u < F.W - 1) { b.paper(...F.P(u, 0), ...F.P(u, 0), 'zg_wall_shutter'); b.paper(...F.P(u, -1), ...F.P(u, -1), 'zg_wall_shutter'); } }
      else if (u === 3 || u === 4) b.gap(ex, ey, es);
      else if (es === 0) b.hwall(ex, ex, ey, 'glass');
    }
    if (F.W >= 5) {
      if (front === 's') { const [sx, sy] = F.P(3, -1); fascia(b, label, sx, sy, 'n', !closed && !darkUnit); }
      else { const [sx, sy] = F.P(4, 0); fascia(b, label, sx, sy, 'n', !closed && !darkUnit); }
    }
    // the stockroom back door to the service corridor (only in the real stretch)
    if (x0 >= ROW_X0 + 56 && x1 < ROW_X0 + ROW_D && F.W >= 7) { // never inside the mirrored stretches either side of a seam
      const [ox, oy] = F.P(5, F.D);
      if (isFloor(z, ox, oy)) doorBetween(b, F.P(5, F.D - 1), [ox, oy], 'door_metal', { sign: 'staff', locked: jj % 4 === 1 });
    }
  }
  if (F.W < 7) return;
  // furniture: identical in every copy except the details keyed to jj
  const ro = (r: Rot) => r;
  const faceIn = jj % 4 === 3 ? F.toBack : F.toFront; // in every fourth store the mannequins have turned around
  putFx(c, F, 'mannequin', 0, 1, faceIn);
  putFx(c, F, 'mannequin', 7, 1, faceIn);
  putFx(c, F, 'display_table', 1, 1, F.toFront, { loot: stamp ? 'none' : 'store_clothing' }, 2);
  putFx(c, F, 'display_table', 5, 1, F.toFront, { loot: stamp ? 'none' : 'store_clothing' }, 2);
  for (const v of [4, 7, 10]) {
    putFx(c, F, 'shelf_store', 0, v, BACK[F.left], { loot: stamp ? 'none' : 'store_clothing' }, 2, true);
    putFx(c, F, 'shelf_store', 7, v, BACK[F.right], { loot: stamp ? 'none' : 'store_clothing' }, 2, true);
  }
  putFx(c, F, 'bench', 3, 5, ro(F.toFront), {}, 2);
  putFx(c, F, 'bench', 3, 9, ro(F.toBack), {}, 2);
  const ctr = putFx(c, F, 'checkout_counter', 4, 12, F.toFront, {}, 2);
  if (ctr) b.obj('cash_register', ctr.x, ctr.y, ctr.rot, { y: 0.9 });
  mount(b, 'mirror', ...F.P(1, 13), F.back);
  if (jj === 7) putFx(c, F, 'chair_plastic', 3, 7, F.toBack); // someone sat down to try a pair on and never stood up
  if (!stamp) {
    putFx(c, F, 'shelf_metal', 0, 15, F.toFront, { loot: 'store_clothing' });
    putFx(c, F, 'cardboard_stack', 6, 15, 0, {});
    putFx(c, F, 'cardboard_box', 7, 16, 0, { loot: 'store_clothing' });
  }
  // lights (periodic)
  const lc = darkUnit ? C_AUD : C_ROW;
  for (const v of [3, 9]) glow(b, ...F.P(4, v), 'fluoro', lc, { color: 0xfff4e8, flicker: jj === 2 && v === 9 ? 0.3 : 0 });
  if (!stamp) glow(b, ...F.P(4, 15), 'bulb', lc, { intensity: 0.5 });
}
/** frame placement without randomness; `along` = the object's width runs along v */
function putFx(c: Ctx, F: UnitFrame, key: string, u: number, v: number, r: Rot, state: Record<string, any> = {}, w = 1, along = false): TileObject | null {
  const [x, y] = along ? F.span(u, v, 1, w) : F.span(u, v, w, 1);
  return c.f.place(key, x, y, r, state) || c.b.obj(key, x, y, r, state);
}

// ---------------------------------------------------------------- service doors & dressing
function serviceDoors(c: Ctx) {
  const { b, rng } = c;
  // staff doors from the service corridors into the public areas
  b.door(ATR.x0, NS_Y0 + 1, 1, 'door_metal', { sign: 'staff' }); b.door(ATR.x1 + 1, NS_Y0 + 1, 1, 'door_metal', { sign: 'staff' });
  b.door(ATR.x0, SS_Y0 + 1, 1, 'door_metal', { sign: 'staff' }); b.door(ATR.x1 + 1, SS_Y0 + 1, 1, 'door_metal', { sign: 'staff' });
  b.door(18, NS_Y1 + 1, 0, 'door_metal', { sign: 'staff' });
  // service corridor dressing
  for (const [x0, x1, y] of [[6, 71, NS_Y0], [120, 185, NS_Y0], [6, 71, SS_Y0], [120, 185, SS_Y0], [6, 85, S2_Y0], [110, 185, S2_Y0]] as const) {
    for (let x = x0 + 2; x <= x1; x += 7) glow(b, x, y + 1, 'bulb', C_SERV, { intensity: 0.75, flicker: rng.chance(0.25) ? rng.float(0.1, 0.35) : 0, broken: rng.chance(0.15) });
    for (let x = x0 + 4; x <= x1; x += 13) mount(b, 'pipes_cluster', x, y, 'n');
    for (let i = 0; i < (x1 - x0) / 10; i++) { const x = rng.int(x0, x1); put(c, rng.pick(['cardboard_box', 'trash_bags', 'mop_bucket', 'pallet', 'cardboard_stack']), x, rng.int(y, y + 2), rng.int(0, 3) as Rot); }
    mount(b, 'fire_extinguisher_wall', x0 + 1, y, 'n');
    scatterDecals(c, x0, y, x1, y + 2, Math.floor((x1 - x0) / 5), [['decal_stain_dark', 3], ['decal_crack', 2], ['decal_stain_water', 2], ['decal_mold', 1]]);
    scatterLoot(c, 'floor_generic', x0, y, x1, y + 2, 3);
  }
  glow(b, 40, NS_Y0 + 1, 'emergency', 0, { intensity: 0.4 });
  glow(b, 150, SS_Y0 + 1, 'emergency', 0, { intensity: 0.4 });
}

function mainStreetDressing(c: Ctx) {
  const { b, rng } = c;
  for (const [x0, x1] of [[22, 71], [120, 169]] as const) {
    for (let x = x0 + 4; x <= x1 - 4; x += 12) {
      put(c, 'planter_box', x, 76, 0); put(c, 'bench', x, 75, 2); put(c, 'bench', x, 77, 0);
      put(c, 'trash_can', x + 3, 76, 0);
    }
    for (let x = x0 + 2; x <= x1; x += 6) { glow(b, x, MS_Y0 + 2, 'fluoro', C_CONC, { color: 0xfff0dc, flicker: rng.chance(0.06) ? 0.2 : 0 }); glow(b, x, MS_Y1 - 2, 'fluoro', C_CONC, { color: 0xfff0dc, broken: rng.chance(0.05) }); }
    for (let x = x0 + 5; x <= x1; x += 10) skylight(b, x, 76, 0.45, 9);
    put(c, 'kiosk', x0 + 10, 72, 0, { loot: rng.pick(['store_toys', 'store_clothing', 'generic']) });
    put(c, 'coin_ride', x1 - 6, 81, 0); put(c, 'gumball_machine', x1 - 4, 81, 0);
    force(c, 'zg_directory', x1 - 1, 72, 0, {});
    scatterLoot(c, 'mall_trash', x0, MS_Y0, x1, MS_Y1, 6);
    scatterDecals(c, x0, MS_Y0, x1, MS_Y1, 18, [['decal_stain_water', 3], ['decal_footprints', 3], ['decal_trash', 1], ['decal_crack', 1]]);
  }
}

// ---------------------------------------------------------------- shifting regions
function shiftToys(c: Ctx, u: { x0: number; y0: number; x1: number; y1: number; F: UnitFrame; circuit: number }) {
  const { z } = c;
  // the sales floor only (stockroom and storefront stay)
  const x0 = u.x0 + 1, x1 = u.x1 - 1, y0 = u.y0 + 5, y1 = u.y1 - 1;
  registerShift(z, 'mall_toys', x0, y0, x1, y1, 4, (sb, srng, v) => {
    const sc: Ctx = { ...c, b: sb, f: new Furnisher(sb, srng), rng: srng, stamp: true };
    const cx = Math.floor((x0 + x1) / 2), cy = Math.floor((y0 + y1) / 2);
    if (v === 0) { for (let x = x0 + 1; x + 1 <= x1 - 1; x += 3) for (let y = y0 + 1; y + 1 <= y1 - 1; y += 4) put(sc, 'shelf_store', x, y, 1, { loot: 'none' }); }
    else if (v === 1) {
      // every teddy in the store, in a circle, facing the middle
      for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; const x = Math.round(cx + Math.cos(a) * 3.5), y = Math.round(cy + Math.sin(a) * 3.5); put(sc, 'teddy_giant', x, y, (Math.abs(Math.cos(a)) > 0.7 ? (Math.cos(a) > 0 ? FACE.w : FACE.e) : (Math.sin(a) > 0 ? FACE.n : FACE.s)) as Rot); }
      put(sc, 'chair_plastic', cx, cy, 0);
    } else if (v === 2) {
      // the shelves are lying in a heap against the back wall
      for (let i = 0; i < 10; i++) put(sc, srng.chance(0.6) ? 'shelf_store_end' : 'toy_box', srng.int(x0, x1), srng.int(y0, y0 + 3), srng.int(0, 3) as Rot, { loot: 'none' });
      put(sc, 'rocking_horse', cx, y1 - 2, 0);
    } else {
      // empty, except for a dollhouse that has this mall inside it
      put(sc, 'dollhouse', cx, cy, 0); put(sc, 'lamp_floor', cx + 1, cy, 0);
    }
    glow(sb, cx, cy, 'fluoro', u.circuit, { flicker: v === 3 ? 0.3 : 0 });
  });
}
function shiftMode(c: Ctx) {
  const { z } = c;
  const x0 = 23, x1 = 27, y0 = 60, y1 = 68;
  registerShift(z, 'mall_mode', x0, y0, x1, y1, 3, (sb, srng, v) => {
    const sc: Ctx = { ...c, b: sb, f: new Furnisher(sb, srng), rng: srng, stamp: true };
    if (v === 0) { for (let y = y0 + 1; y <= y1 - 1; y += 2) for (let x = x0; x <= x1; x += 2) put(sc, 'clothing_rack', x, y, 0, { loot: 'none' }); }
    else if (v === 1) { for (let x = x0; x <= x1; x++) put(sc, 'mannequin', x, y0 + 4, 2, {}); } // a row of mannequins facing the fitting rooms
    else { for (let y = y0 + 1; y <= y1 - 1; y += 2) for (let x = x0; x <= x1; x += 2) put(sc, 'mannequin', x, y, srng.int(0, 3) as Rot, {}); }
  });
}
function shiftAuditorium(c: Ctx) {
  const a = AUD.find((q) => q.n === 4)!;
  const x0 = a.x0 + 1, y0 = a.y0 + 4, x1 = a.x1 - 1, y1 = a.y1 - 2;
  registerShift(c.z, 'mall_screen4', x0, y0, x1, y1, 4, (sb, srng, v) => {
    const sc: Ctx = { ...c, b: sb, f: new Furnisher(sb, srng), rng: srng, stamp: true };
    if (v === 0) seatsFor(sc, a);
    else if (v === 1) seatsFor(sc, a, () => true, 0); // every seat turned around, facing the door
    else if (v === 2) seatsFor(sc, a, (x, y) => (x + y) % 3 === 0);
    else { put(sc, 'chair_folding', a.x0 + 9, a.y0 + 12, 2); } // one chair, in the middle, facing the screen
  });
}
function shiftService(c: Ctx) {
  const x0 = 30, x1 = 60, y0 = NS_Y0, y1 = NS_Y1;
  registerShift(c.z, 'mall_service', x0, y0, x1, y1, 4, (sb, srng, v) => {
    const sc: Ctx = { ...c, b: sb, f: new Furnisher(sb, srng), rng: srng, stamp: true };
    if (v === 1) { sb.vwall(45, y0, y1, 'cinder'); sb.door(45, y0 + 1, 1, 'door_metal', { sign: 'danger' }); }
    else if (v === 2) { for (const x of [36, 37, 52, 53]) for (const y of [y0, y1]) put(sc, 'chair_stack', x, y, 0); }
    else if (v === 3) { put(sc, 'janitor_cart', 44, y0 + 1, 1, { loot: 'none' }); put(sc, 'mop_bucket', 46, y0 + 1, 0); }
    for (let x = x0 + 2; x <= x1; x += 7) glow(sb, x, y0 + 1, 'bulb', C_SERV, { intensity: 0.75, broken: v === 3 && x !== 44, flicker: v === 2 ? 0.3 : 0 });
  });
}
function shiftFoodCourt(c: Ctx) {
  const x0 = 112, x1 = 135, y0 = 14, y1 = 40;
  registerShift(c.z, 'mall_food_tables', x0, y0, x1, y1, 4, (sb, srng, v) => {
    const sc: Ctx = { ...c, b: sb, f: new Furnisher(sb, srng), rng: srng, stamp: true };
    if (v === 0) seatingField(sc, x0 + 1, y0 + 1, x1 - 2, y1 - 2, false);
    else if (v === 1) {
      // one long table, set for a birthday party
      for (let x = x0 + 2; x + 1 <= x1 - 2; x += 2) { put(sc, 'table_dining', x, 27, 0); put(sc, 'chair_plastic', x, 26, 0); put(sc, 'chair_plastic', x + 1, 28, 2); }
    } else if (v === 2) {
      // every chair stacked, every table folded away
      for (let x = x0 + 1; x <= x1 - 1; x += 3) for (const y of [y0 + 1, y1 - 1]) put(sc, 'chair_stack', x, y, 0);
    } else seatingField(sc, x0 + 1, y0 + 1, x1 - 2, y1 - 2, true);
  });
}
function shiftRowUnit(c: Ctx) {
  // unit 7 north of the Row (in the real stretch): it is not always the same store
  const x0 = ROW_X0 + 7 * 8, x1 = x0 + 7;
  const rx0 = x0 + 1, rx1 = x1 - 1, ry0 = ROWN_Y0 + 4, ry1 = ROWN_Y1 - 1;
  registerShift(c.z, 'mall_row_unit', rx0, ry0, rx1, ry1, 3, (sb, srng, v) => {
    const sc: Ctx = { ...c, b: sb, f: new Furnisher(sb, srng), rng: srng, stamp: true };
    const F = unitFrame(x0, ROWN_Y0, x1, ROWN_Y1, 's');
    if (v === 0) {
      putFx(sc, F, 'display_table', 1, 1, F.toFront, { loot: 'none' }, 2); putFx(sc, F, 'display_table', 5, 1, F.toFront, { loot: 'none' }, 2);
      putFx(sc, F, 'bench', 3, 5, F.toFront, {}, 2); putFx(sc, F, 'bench', 3, 9, F.toBack, {}, 2);
    } else if (v === 1) {
      // a single mannequin, facing the glass, closer than the others
      putFx(sc, F, 'mannequin', 3, 1, F.toFront);
    } else {
      // every shoebox in the store, stacked to the ceiling
      for (let i = 0; i < 14; i++) put(sc, 'cardboard_stack', srng.int(rx0, rx1), srng.int(ry0, ry1 - 2), 0, { loot: 'none' });
    }
    const ctr = putFx(sc, F, 'checkout_counter', 4, 12, F.toFront, {}, 2);
    if (ctr && v !== 1) sb.obj('cash_register', ctr.x, ctr.y, ctr.rot, { y: 0.9 });
    mount(sb, 'mirror', ...F.P(1, 13), F.back);
    glow(sb, ...F.P(4, 3), 'fluoro', C_ROW, { flicker: v === 1 ? 0.35 : 0 });
    glow(sb, ...F.P(4, 9), 'fluoro', C_ROW, { broken: v === 2 });
  });
}

defZone({
  key: 'mall', name: 'Westgate Mall', W, H, depth: 2,
  blurb: 'Terrazzo, skylights, the fountain still running. The music is from a radio station that stopped broadcasting before you were born.',
  gen: (z, s) => { generateMall(z, s); },
});
