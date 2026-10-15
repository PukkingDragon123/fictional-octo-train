// The Undercroft (96×96). What is under the Lobby and under Annex B: a hall
// with no far wall, held up by pillars two metres across, wet concrete, a
// tide line on everything. Two ropes hang out of holes in the ceiling where
// people fell through (one blue, from Annex B's Sector 7; one tan, from Level
// 0). Debtors camped here and left their tallies scratched into the pillars.
// In the middle of the floor the concrete stops at the edge of a pit, and a
// rusted ladder goes down into it.
import { defZone } from '../worldGraph';
import { Zone, TF } from '../zone';
import { ZoneBuilder } from './builder';
import { Furnisher } from './furnish';
import { Rng } from '../../core/rng';
import { type Ctx, type Rot, arrive, put, force, mount, decal, hh, hopperAt, lamp, ropeLine, isOpen, floorRect } from './weird_kit';

const W = 96, H = 96;
const C_EM = 1, C_CAMP = 2;
const PIT = { x0: 42, y0: 56, x1: 55, y1: 67 };

export function generateUndercroft(z: Zone, seed: number) {
  const rng = new Rng(seed);
  const b = new ZoneBuilder(z, rng);
  const f = new Furnisher(b, rng);
  const c: Ctx = { z, b, f, rng, seed };
  z.name = 'The Undercroft';

  floorRect(b, 2, 2, W - 3, H - 3, 'concrete', 'zw_wall_under');
  b.roomWalls(2, 2, W - 3, H - 3, 'concrete');
  b.addRoom('The Undercroft', 'undercroft', 2, 2, W - 3, H - 3, { circuit: C_EM, temp: 9 });
  // standing water in the low parts
  for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
    const n = hh(x >> 2, y >> 2, 6001) * 0.6 + hh(x, y, 6002) * 0.4;
    if (n < 0.22) b.fillFloor(x, y, x, y, 'concrete_wet');
  }
  // ragged walls: the hall narrows and widens; void bites out of the edges
  for (let i = 0; i < 26; i++) {
    const side = rng.int(0, 3), len = rng.int(3, 9), dep = rng.int(1, 4);
    const t = rng.int(4, W - 12);
    for (let a = 0; a < len; a++) for (let d = 0; d < dep; d++) {
      const [x, y] = side === 0 ? [t + a, 2 + d] : side === 1 ? [t + a, H - 3 - d] : side === 2 ? [2 + d, t + a] : [W - 3 - d, t + a];
      if (z.inb(x, y)) z.floor[z.idx(x, y)] = 0;
    }
  }

  // ============================================================ pillars
  const pillars: [number, number][] = [];
  for (let y = 7; y < H - 8; y += 9) for (let x = 7; x < W - 8; x += 9) {
    const px = x + (hh(x, y, 6011) < 0.3 ? 1 : 0), py = y + (hh(x, y, 6012) < 0.3 ? 1 : 0);
    if (px + 1 >= PIT.x0 - 1 && px <= PIT.x1 + 1 && py + 1 >= PIT.y0 - 1 && py <= PIT.y1 + 1) continue;
    if (!z.floor[z.idx(px, py)] || !z.floor[z.idx(px + 1, py + 1)]) continue;
    if (force(c, 'zw_pillar_huge', px, py, 0, { v: (px + py) % 3 })) pillars.push([px, py]);
  }

  // ============================================================ the pit
  for (let y = PIT.y0; y <= PIT.y1; y++) for (let x = PIT.x0; x <= PIT.x1; x++) {
    const dx = (x - (PIT.x0 + PIT.x1) / 2) / ((PIT.x1 - PIT.x0) / 2 + 0.5), dy = (y - (PIT.y0 + PIT.y1) / 2) / ((PIT.y1 - PIT.y0) / 2 + 0.5);
    if (dx * dx + dy * dy < 0.85 + hh(x, y, 6021) * 0.25) { z.floor[z.idx(x, y)] = 0; b.clearObjects(x, y, x, y); }
  }
  // the ladder at the north lip, going down
  let lx = Math.floor((PIT.x0 + PIT.x1) / 2), ly = PIT.y0;
  while (ly < PIT.y1 && z.floor[z.idx(lx, ly + 1)]) ly++;
  // make sure the tile the ladder stands on is floor, with the drop right in front (south)
  b.fillFloor(lx, ly, lx, ly, 'concrete');
  z.floor[z.idx(lx, ly + 1)] = 0;
  b.clearObjects(lx - 1, ly - 2, lx + 1, ly);
  force(c, 'zw_pit_ladder', lx, ly, 2, { portal: 'p_under_tunnels' });
  b.portal({ id: 'p_under_tunnels', x: lx, y: ly, kind: 'ladder', to: 'tunnels', tx: 40, ty: 40, label: 'Climb down into the pit' });
  arrive(b, 'r_under_tunnels', lx, ly - 2, 's', 3);
  for (const [dx, dy] of [[-2, -1], [2, -1], [-3, 2], [3, 3], [0, -1]] as const) decal(z, 'decal_crack', lx + dx + 0.5, ly + dy + 0.5, 1.6, 1.6, hh(dx, dy, 6031) * 6);
  lamp(b, lx, ly - 1, 'lamp', C_CAMP, { color: 0xffb060, intensity: 0.7, radius: 5, y: 1.0, flicker: 0.1 });
  put(c, 'zw_floodlight', lx + 2, ly - 2, 3, {});
  put(c, 'replica_standing', lx - 3, ly, 0, { pose: 'stand' });
  f.floorItem('note', lx + 1, ly - 1, { lore: 'zw_under_scratch' });

  // ============================================================ where you come in: two ropes from two holes
  // from Annex B (blue rope), north-east
  const ax = 70, ay = 16;
  b.clearObjects(ax - 2, ay - 2, ax + 2, ay + 2);
  b.fillFloor(ax - 2, ay - 2, ax + 2, ay + 2, 'concrete');
  force(c, 'zw_rope_hanging', ax, ay, 0, { v: 1, portal: 'r_annex_under' });
  b.portal({ id: 'r_annex_under', x: ax, y: ay, kind: 'ladder', to: 'annex', tx: 108, ty: 56, label: 'Climb the blue rope' });
  arrive(b, 'p_annex_under', ax, ay + 2, 's', 3);
  b.light(ax + 0.5, ay + 0.5, 'sky', { color: 0xd8dcc8, intensity: 0.8, radius: 6, y: 6, circuit: 0 });
  ropeLine(z, [[ax + 0.6, ay + 0.6], [ax + 1.5, ay + 1.6], [ax + 1.1, ay + 3.2]], 'zw_rope_blue', 0.05);
  for (let i = 0; i < 5; i++) decal(z, 'zw_debris', ax + rng.float(-1.5, 1.5) + 0.5, ay + rng.float(-1.5, 1.5) + 0.5, 1.2, 1.2, rng.float(0, 6));
  // from Level 0 (tan rope), north-west
  const bx = 18, by = 14;
  b.clearObjects(bx - 2, by - 2, bx + 2, by + 2);
  b.fillFloor(bx - 2, by - 2, bx + 2, by + 2, 'concrete');
  force(c, 'zw_rope_hanging', bx, by, 0, { v: 0, portal: 'r_lobby_under' });
  b.portal({ id: 'r_lobby_under', x: bx, y: by, kind: 'ladder', to: 'lobby', tx: 80, ty: 80, label: 'Climb the rope back up' });
  arrive(b, 'p_lobby_under', bx, by + 2, 's', 3);
  b.light(bx + 0.5, by + 0.5, 'sky', { color: 0xe8d890, intensity: 0.85, radius: 6, y: 6, circuit: 0 });
  // a square of yellow carpet that fell with you
  decal(z, 'carpet_rug', bx + 1.5, by + 1.2, 1.4, 1.2, 0.3, 0xd8c060, 0.95);
  for (let i = 0; i < 4; i++) put(c, 'zw_rubble', bx - 2 + rng.int(0, 4), by - 2 + rng.int(0, 1), 0, { v: i });

  // ============================================================ the hopper (near where Level 0 drops you)
  hopperAt(c, bx + 4, by + 4, 0);

  // ============================================================ the debtors' camp, by a pillar
  const cp = pillars.find((p) => p[0] > 20 && p[0] < 40 && p[1] > 30 && p[1] < 50) || [27, 34];
  const [qx, qy] = [cp[0] + 3, cp[1]];
  put(c, 'sleeping_bag', qx, qy, 0, {}); put(c, 'sleeping_bag', qx + 1, qy + 2, 1, {});
  put(c, 'campfire_unlit', qx + 3, qy + 1, 0, {});
  put(c, 'survivor_stash', qx + 2, qy + 3, 0, { loot: 'zw_survivor' });
  put(c, 'zw_suitcase', qx + 4, qy, 0, { v: 4 }); put(c, 'zw_luggage_pile', qx + 5, qy + 2, 0, { v: 3 });
  put(c, 'skeleton', qx, qy + 3, 0, {});
  f.floorItem('journal', qx + 1, qy + 1, { lore: 'zw_under_ledger' });
  f.floorItem('empty_can', qx + 2, qy + 1); f.floorItem('candle', qx + 3, qy);
  lamp(b, qx + 2, qy + 1, 'lamp', C_CAMP, { color: 0xffa040, intensity: 0.55, radius: 4, y: 0.5, flicker: 0.3 });
  // scratched tallies on that pillar
  decal(z, 'decal_chalk_drawing', cp[0] + 2.3, cp[1] + 1, 0.6, 1.2, Math.PI / 2, 0xd8d0c0, 0.8);

  // ============================================================ black doorways in the outer walls, a few lost things
  for (const [x, y, s] of [[30, 2, 'n'], [58, 2, 'n'], [2, 40, 'w'], [2, 74, 'w'], [W - 3, 50, 'e']] as const) if (z.floor[z.idx(x, y)]) mount(b, 'zw_black_door', x, y, s as any);
  for (let i = 0; i < 14; i++) { const x = rng.int(4, W - 5), y = rng.int(4, H - 5); if (isOpen(z, x, y)) put(c, 'zw_rubble', x, y, 0, { v: i }); }
  for (let i = 0; i < 26; i++) { const x = rng.int(4, W - 5), y = rng.int(4, H - 5); if (isOpen(z, x, y)) f.floorLoot('zw_floor_under', x, y); }
  for (let i = 0; i < 6; i++) { const x = rng.int(6, W - 7), y = rng.int(6, H - 7); if (isOpen(z, x, y)) put(c, i % 2 ? 'zw_suitcase' : 'chair_office', x, y, (i % 4) as Rot, { v: i }); }
  for (let i = 0; i < 70; i++) { const x = rng.int(3, W - 4), y = rng.int(3, H - 4); if (z.floor[z.idx(x, y)]) f.decal(rng.weighted([['decal_puddle', 5], ['decal_stain_dark', 3], ['decal_mold', 2], ['zw_debris', 2], ['decal_footprints', 1]]), x, y, rng.float(1.2, 2.6), rng.float(1.2, 2.6)); }
  // emergency lamps, far apart and dim; most of the light here is what you bring
  for (const [x, y] of [[30, 26], [62, 34], [22, 62], [74, 70], [48, 84], [84, 30]] as const) lamp(b, x, y, 'emergency', C_EM, { intensity: 0.5, radius: 5, flicker: 0.15 });
  // thin grey light falling through cracks in the slab far above, onto wet concrete
  for (let i = 0; i < 12; i++) {
    const x = rng.int(6, W - 7), y = rng.int(6, H - 7);
    if (!z.floor[z.idx(x, y)]) continue;
    b.light(x + 0.5, y + 0.5, 'sky', { color: 0xb8c0c8, intensity: 0.6, radius: 5.5, y: 6, circuit: 0, flicker: i % 4 === 0 ? 0.05 : 0 });
    decal(z, 'decal_puddle', x + 0.5, y + 0.5, 1.8, 1.4, rng.float(0, 6));
  }
  // a door frame standing alone near the pit, and a single office chair facing the dark
  put(c, 'door_freestanding', PIT.x1 + 4, PIT.y0 - 3, 0, {});
  put(c, 'chair_office', PIT.x0 - 3, PIT.y1 - 2, 1, {});

  b.flag(PIT.x0 - 2, PIT.y0 - 2, PIT.x1 + 2, PIT.y1 + 2, TF.NOSPAWN);
  z.power.set(C_EM, true); z.power.set(C_CAMP, true);
  z.env = {
    ...z.env,
    ambient: 0x23272c, ambientI: 0.52, fog: 0x0b0c0e, fogNear: 10, fogFar: 26, void: 0x020203, temp: 9,
    grade: 'tunnels', reverb: 'void', ambience: 'tunnels', music: 'drone',
  };
  z.spawnTable = [['still_life', 2], ['hollow', 1.5], ['occupant', 1], ['underlay', 1], ['echo', 1], ['grinhound', 0.5], ['gloam', 1.5], ['surveyor', 0.8]];
  z.creatureCap = 6;
  z.meta.terminalLore = ['zw_under_scratch'];
}

defZone({
  key: 'undercroft', name: 'The Undercroft', W, H, depth: 4,
  blurb: 'Under the carpet, concrete. Under the concrete, this. Pillars wider than rooms, water at your ankles, a pit, and a ladder going down.',
  gen: (z, s) => { generateUndercroft(z, s); },
});
void ZoneBuilder;
