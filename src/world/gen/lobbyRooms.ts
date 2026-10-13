import { Zone, TF } from '../zone';
import { ZoneBuilder } from './builder';
import { Furnisher } from './furnish';
import { Rng } from '../../core/rng';
import { floorId } from '../defs';

/**
 * Carve a rectangular room into the Level 0 maze: clears interior walls,
 * draws its own walls with a few openings, assigns a room id/circuit.
 */
export function stampRoom(b: ZoneBuilder, x0: number, y0: number, x1: number, y1: number, opts: { name: string; type: string; wall?: string; floor?: string; paper?: string; doors?: number; doorStyle?: string; arches?: number; circuit?: number; temp?: number }) {
  const z = b.z, rng = b.rng;
  b.clearObjects(x0, y0, x1, y1);
  b.clearWallsIn(x0, y0, x1, y1);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { if (!z.floor[z.idx(x, y)]) z.floor[z.idx(x, y)] = floorId('carpet_yellow'); }
  if (opts.floor) b.fillFloor(x0, y0, x1, y1, opts.floor);
  if (opts.paper) b.paper(x0, y0, x1, y1, opts.paper);
  b.roomWalls(x0, y0, x1, y1, opts.wall || 'drywall');
  const room = b.addRoom(opts.name, opts.type, x0, y0, x1, y1, { circuit: opts.circuit ?? 0, temp: opts.temp });
  // openings
  const perim: [number, number, 0 | 1][] = [];
  for (let x = x0 + 1; x < x1; x++) { perim.push([x, y0, 0]); perim.push([x, y1 + 1, 0]); }
  for (let y = y0 + 1; y < y1; y++) { perim.push([x0, y, 1]); perim.push([x1 + 1, y, 1]); }
  rng.shuffle(perim);
  let made = 0;
  for (const [x, y, side] of perim) {
    // only open toward walkable floor on the other side
    const ox = side === 1 ? (x === x0 ? x - 1 : x) : x, oy = side === 0 ? (y === y0 ? y - 1 : y) : y;
    const inX = side === 1 ? (x === x0 ? x : x - 1) : x, inY = side === 0 ? (y === y0 ? y : y - 1) : y;
    if (!z.inb(ox, oy) || !z.floor[z.idx(ox, oy)]) continue;
    void inX; void inY;
    if (made < (opts.doors ?? 0)) b.door(x, y, side, opts.doorStyle || 'door_office', { open: rng.chance(0.3) });
    else if (made < (opts.doors ?? 0) + (opts.arches ?? 1)) b.gap(x, y, side);
    else break;
    made++;
  }
  return room;
}

export function lobbyLandmarks(z: Zone, b: ZoneBuilder, rng: Rng) {
  const f = new Furnisher(b, rng);
  const W = z.W, H = z.H;
  const cx = Math.floor(W / 2), cy = Math.floor(H / 2);
  const placed: { name: string; x: number; y: number }[] = [];
  const landmark = (name: string, x: number, y: number) => { placed.push({ name, x, y }); };

  // ---------- 1. the waking room (spawn) ----------
  {
    const x0 = cx - 2, y0 = cy - 2, x1 = cx + 2, y1 = cy + 1;
    stampRoom(b, x0, y0, x1, y1, { name: 'Somewhere', type: 'wake', arches: 1 });
    f.place('chair_office', cx, y0, 2, {});
    b.obj('light_fluoro', cx, cy - 1, 0, { flicker: 0.35 });
    f.floorItem('note', cx + 1, cy, { lore: 'note_wake' });
    f.floorItem('almond_water', cx - 1, cy + 1);
    f.decal('decal_stain_water', cx - 1, y0, 1.3, 1.3);
    z.meta.spawn = [cx, cy];
    landmark('wake', cx, cy);
  }

  // helper to find a site away from the centre
  const site = (w: number, h: number, minDist: number, maxDist: number): [number, number] => {
    for (let t = 0; t < 200; t++) {
      const a = rng.float(0, Math.PI * 2), d = rng.float(minDist, maxDist);
      const x = Math.floor(cx + Math.cos(a) * d - w / 2), y = Math.floor(cy + Math.sin(a) * d - h / 2);
      if (x < 4 || y < 4 || x + w > W - 5 || y + h > H - 5) continue;
      if (placed.some((p) => Math.abs(p.x - x) < w + 6 && Math.abs(p.y - y) < h + 6)) continue;
      return [x, y];
    }
    return [rng.int(5, W - w - 6), rng.int(5, H - h - 6)];
  };

  // ---------- 2. break room ----------
  {
    const [x, y] = site(8, 6, 10, 22);
    stampRoom(b, x, y, x + 7, y + 5, { name: 'Break Room', type: 'breakroom', paper: 'wall_office', floor: 'linoleum', arches: 2 });
    f.place('vending_snack', x + 1, y, 0); f.place('vending_soda', x + 2, y, 0);
    const counter = f.place('counter_kitchen', x + 4, y, 0);
    f.onTop('microwave', counter, { on: false });
    const sinkc = f.place('counter_sink', x + 5, y, 0); void sinkc;
    f.place('fridge', x + 6, y, 0);
    f.place('water_cooler', x + 7, y + 1, 1);
    const tbl = f.place('table_round', x + 3, y + 3, 0); void tbl;
    f.place('chair_plastic', x + 2, y + 3, 1); f.place('chair_plastic', x + 4, y + 3, 3); f.place('chair_plastic', x + 3, y + 4, 2);
    f.place('trash_can', x, y + 5, 0);
    f.onWall('noticeboard', x, y + 1, x + 7, y + 4);
    f.onWall('clock_wall', x, y + 1, x + 7, y + 4);
    f.onWall('light_switch', x, y + 1, x + 1, y + 4);
    for (let i = 0; i < 2; i++) b.obj('light_fluoro', x + 2 + i * 4, y + 2, 0, { flicker: 0 });
    landmark('breakroom', x, y);
  }

  // ---------- 3. maintenance room (power mission) ----------
  {
    const [x, y] = site(7, 6, 26, 50);
    stampRoom(b, x, y, x + 6, y + 5, { name: 'Maintenance', type: 'maintenance', wall: 'concrete', floor: 'concrete', paper: 'wall_concrete', doors: 1, doorStyle: 'door_metal', arches: 0, temp: 18 });
    // label the door
    for (const e of z.edges.values()) if (e.style === 'door_metal' && !e.sign) { e.sign = 'maintenance'; e.locked = false; }
    f.onWall('breaker_panel', x, y, x + 6, y + 1, 40, { mission: 'first_light' });
    f.againstWall('shelf_metal', x, y, x + 6, y + 5);
    f.againstWall('tool_chest', x, y, x + 6, y + 5);
    f.againstWall('water_heater', x, y, x + 6, y + 5);
    f.anywhere('mop_bucket', x, y, x + 6, y + 5);
    f.againstWall('janitor_cart', x, y, x + 6, y + 5);
    f.anywhere('cardboard_box', x, y, x + 6, y + 5);
    f.onWall('pipes_cluster', x, y, x + 6, y + 5);
    b.obj('light_bulb', x + 3, y + 2, 0, { flicker: 0.4 });
    z.meta.maintenance = [x + 3, y + 3];
    landmark('maintenance', x, y);
  }

  // ---------- 4. the room of chairs ----------
  {
    const [x, y] = site(9, 8, 18, 45);
    stampRoom(b, x, y, x + 8, y + 7, { name: 'Seminar Room', type: 'chairs', paper: 'wall_yellow', arches: 2 });
    for (let yy = y + 2; yy <= y + 6; yy += 1) for (let xx = x + 1; xx <= x + 7; xx += 2) f.place(f.has('chair_folding') ? 'chair_folding' : 'chair_office', xx, yy, 2);
    f.onWall('whiteboard', x + 3, y, x + 5, y, 10);
    f.floorItem('note', x + 4, y + 1, { lore: 'note_chairs' });
    landmark('chairs', x, y);
  }

  // ---------- 5. abandoned survivor camp ----------
  {
    const [x, y] = site(6, 5, 30, 60);
    stampRoom(b, x, y, x + 5, y + 4, { name: 'Somebody\'s Camp', type: 'camp', arches: 1 });
    f.anywhere('sleeping_bag', x, y, x + 5, y + 4);
    f.anywhere('campfire_unlit', x + 1, y + 1, x + 4, y + 3);
    f.anywhere('survivor_stash', x, y, x + 5, y + 4);
    f.anywhere('cardboard_box', x, y, x + 5, y + 4);
    f.anywhere('crate_wood', x, y, x + 5, y + 4);
    f.anywhere('trash_bags', x, y, x + 5, y + 4);
    f.floorItem('journal', x + 2, y + 2, { lore: 'journal_camp' });
    f.floorItem('empty_can', x + 1, y + 3); f.floorItem('empty_can', x + 3, y + 1);
    for (let i = 0; i < 3; i++) f.decal('decal_trash', x + rng.int(0, 5), y + rng.int(0, 4), 1, 1);
    landmark('camp', x, y);
  }

  // ---------- 6. office pockets ----------
  for (let k = 0; k < 6; k++) {
    const [x, y] = site(6, 5, 12, 70);
    stampRoom(b, x, y, x + 5, y + 4, { name: 'Office', type: 'office', paper: rng.chance(0.5) ? 'wall_office' : 'wall_yellow', floor: rng.chance(0.5) ? 'carpet_office' : undefined, doors: rng.chance(0.6) ? 1 : 0, arches: 1 });
    const desk = f.againstWall('desk_office', x, y, x + 5, y + 4);
    if (desk) f.onTop('computer', desk);
    f.anywhere('chair_office', x + 1, y + 1, x + 4, y + 3);
    f.againstWall('filing_cabinet', x, y, x + 5, y + 4);
    if (rng.chance(0.5)) f.againstWall('bookshelf', x, y, x + 5, y + 4);
    if (rng.chance(0.4)) f.againstWall('plant_potted', x, y, x + 5, y + 4);
    if (rng.chance(0.5)) f.onWall('painting', x, y, x + 5, y + 4, 20, { v: rng.int(0, 5) });
    f.onWall('light_switch', x, y, x + 5, y + 4);
    f.anywhere('trash_can', x, y, x + 5, y + 4);
    b.obj('light_fluoro', x + 2, y + 2, 0, { flicker: rng.chance(0.3) ? 0.2 : 0 });
    landmark('office', x, y);
  }

  // ---------- 7. the lonely door (to the dreamcore fields) ----------
  {
    const [x, y] = site(9, 9, 40, 70);
    stampRoom(b, x, y, x + 8, y + 8, { name: 'Empty Room', type: 'empty', arches: 2 });
    const o = f.place('door_freestanding', x + 4, y + 4, 0, { portal: 'p_fields' });
    if (o) b.portal({ id: 'p_fields', x: x + 4, y: y + 4, kind: 'door', to: 'fields', tx: 40, ty: 40, label: 'Open the red door' });
    z.meta.lonelyDoor = [x + 4, y + 4];
    landmark('lonelydoor', x, y);
  }

  // ---------- 8. flooded section (to the Poolrooms) ----------
  {
    const [x, y] = site(8, 8, 35, 65);
    for (let yy = y; yy <= y + 7; yy++) for (let xx = x; xx <= x + 7; xx++) {
      if (!z.inb(xx, yy) || !z.floor[z.idx(xx, yy)]) continue;
      const d = Math.hypot(xx - x - 3.5, yy - y - 3.5);
      if (d < 3.8 + rng.next()) z.floor[z.idx(xx, yy)] = floorId('carpet_wet');
    }
    b.clearObjects(x + 3, y + 3, x + 4, y + 4);
    const o = f.place('hole_floor', x + 3, y + 3, 0, { portal: 'p_pools' });
    if (o) b.portal({ id: 'p_pools', x: x + 3, y: y + 3, kind: 'hole', to: 'pools', tx: 30, ty: 30, label: 'Drop into the water' });
    for (let i = 0; i < 6; i++) f.decal('decal_puddle', x + rng.int(1, 6), y + rng.int(1, 6), 1.4, 1.4);
    landmark('flood', x, y);
  }

  // ---------- 9. stairwell exit (to the stairwell hub) ----------
  {
    const [x, y] = site(4, 5, 45, 70);
    stampRoom(b, x, y, x + 3, y + 4, { name: 'Stairwell Access', type: 'stairs', wall: 'cinder', floor: 'concrete', paper: 'wall_cinder', doors: 1, doorStyle: 'door_metal', arches: 0 });
    for (const e of z.edges.values()) if (e.style === 'door_metal' && !e.sign) e.sign = 'stairs';
    const o = f.place('staircase_down', x + 1, y + 1, 0, { portal: 'p_stair' });
    if (o) b.portal({ id: 'p_stair', x: x + 1, y: y + 1, kind: 'stairs_down', to: 'stairwell', tx: 10, ty: 10, label: 'Take the stairs' });
    b.obj('light_bulb', x + 2, y + 2, 0, { flicker: 0.1 });
    f.onWall('exit_sign', x, y, x + 3, y + 4);
    landmark('stairs', x, y);
  }

  // ---------- 10. office annex entrance ----------
  {
    const [x, y] = site(5, 4, 30, 60);
    stampRoom(b, x, y, x + 4, y + 3, { name: 'Elevator Lobby', type: 'elevator', floor: 'carpet_office', paper: 'wall_office', arches: 2, circuit: 99 });
    z.power.set(99, false);
    b.obj('light_fluoro', x + 2, y + 2, 0, { circuit: 99 });
    const o = f.onWall('elevator_door', x + 1, y, x + 3, y, 20, { portal: 'p_office' });
    if (o) b.portal({ id: 'p_office', x: o.x, y: o.y, kind: 'elevator', to: 'office', tx: 20, ty: 20, label: 'Take the elevator', locked: 'power:lobby:99' });
    f.place('plant_tall', x, y + 3, 0);
    f.place('waiting_chairs', x + 1, y + 3, 2);
    landmark('elevator', x, y);
  }

  // ---------- scatter: lonely props, wall clutter, floor loot ----------
  const props: [string, number][] = [['chair_office', 6], ['cardboard_box', 5], ['trash_can', 3], ['water_cooler', 1], ['plant_potted', 2], ['filing_cabinet', 2], ['chair_plastic', 2], ['cardboard_stack', 1], ['vent_floor', 1]];
  for (let i = 0; i < W * H * 0.0035; i++) {
    const x = rng.int(3, W - 4), y = rng.int(3, H - 4);
    if (!z.floor[z.idx(x, y)] || z.room[z.idx(x, y)]) continue;
    const key = rng.weighted(props);
    if (key === 'chair_office' && rng.chance(0.4)) { f.place(key, x, y, rng.int(0, 3) as any); continue; }
    const r = (f as any).place(key, x, y, rng.int(0, 3));
    void r;
  }
  for (let i = 0; i < W * H * 0.004; i++) {
    const x = rng.int(3, W - 4), y = rng.int(3, H - 4);
    const r = rng.next();
    f.onWall(r < 0.3 ? 'clock_wall' : r < 0.55 ? 'poster' : r < 0.75 ? 'vent_wall' : r < 0.85 ? 'exit_sign' : 'painting', x, y, x, y, 1, { v: rng.int(0, 5) });
  }
  for (let i = 0; i < W * H * 0.0045; i++) {
    const x = rng.int(3, W - 4), y = rng.int(3, H - 4);
    if (!z.floor[z.idx(x, y)] || z.solid[z.idx(x, y)]) continue;
    f.floorLoot('floor_lobby', x, y);
  }
  for (let i = 0; i < W * H * 0.01; i++) {
    const x = rng.int(2, W - 3), y = rng.int(2, H - 3);
    if (!z.floor[z.idx(x, y)]) continue;
    const r = rng.next();
    f.decal(r < 0.45 ? 'decal_stain_water' : r < 0.7 ? 'decal_stain_dark' : r < 0.85 ? 'decal_mold' : r < 0.95 ? 'decal_footprints' : 'decal_crack', x, y, rng.float(0.8, 1.8), rng.float(0.8, 1.8));
  }
  // lights: fixtures above a room's interior use its circuit (break room/offices have switches)
  z.meta.landmarks = placed;
  void TF;
}
