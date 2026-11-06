// The Nostalgic Playground (112x112, depth 5, outdoor): an endless 1990s park
// at a golden hour that never ends. Sun-bleached lawn, bark chips under the
// climbing frames, faded rubber tiles under the swings, a blacktop with
// hopscotch and four-square painted on it, sandpits, picnic tables, oaks. The
// swings creak and swing with no wind; the roundabouts turn by themselves
// (src/world/pg_playgroundFx.ts). In the north-east corner stands Bright Hour
// Television's Studio B, closed for thirty years, its set still dressed: a
// cardboard sky, the five programmes' title boards and set pieces, dead
// cameras, lamps that are on, an ON AIR sign that is lit. Walk off any edge and
// you come back in at the opposite one: the park goes on for ever.
// Its five inhabitants came out of those programmes (src/creatures/species/pg_*.ts).
//
// Links: a red crawl tube in the suburbs park (p `pg_suburbs_tube`, anchor
// `pg_tube_in`) and back (`pg_tube_back` -> suburbs anchor `r_pg_tube`); a hole
// in some deep generated floors drops you here (`fall`); a sandpit here goes
// down (deeper floors); and when the Ball House exists (src/world/gen/z_ballhouse.ts),
// its soft-play hut (`pg_ballhouse` -> ballhouse anchor `pg_from_playground`, and
// back `pg_ballhouse_back` -> anchor `r_pg_ballhouse` here).
import { defZone, onZoneGenerated, zoneSpec } from '../worldGraph';
import { Zone, TF } from '../zone';
import { ZoneBuilder } from './builder';
import { Furnisher } from './furnish';
import { Rng, hash3 } from '../../core/rng';
import { type Ctx, type Rot, force, put, isOpen, arrive, mount, decal } from './mall_kit';
import { pit, findOpenRect } from './void_kit';
import { hh, loopSeamsX, loopSeamsY } from './weird_kit';
import { deeperFloor, floorNum } from './z_floors';

const W = 112, H = 112;
const CX = 56, CY = 56;
/** the studio: Bright Hour Television, Studio B */
const ST = { x0: 66, y0: 18, x1: 92, y1: 36 };
/** the blacktop court */
const BT = { x0: 20, y0: 20, x1: 40, y1: 33 };

/** an open w x h rect within r of (cx, cy) */
function near(z: Zone, cx: number, cy: number, w: number, h: number, rng: Rng, r = 8): [number, number] | null {
  for (let t = 0; t < 160; t++) {
    const x = Math.round(cx + rng.float(-r, r)), y = Math.round(cy + rng.float(-r, r));
    let ok = true;
    for (let yy = y - 1; yy <= y + h && ok; yy++) for (let xx = x - 1; xx <= x + w && ok; xx++) if (!isOpen(z, xx, yy)) ok = false;
    if (ok) return [x, y];
  }
  return null;
}
const ellipse = (x: number, y: number, cx: number, cy: number, rx: number, ry: number) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;

export function generatePlayground(z: Zone, seed: number) {
  const rng = new Rng(seed);
  const b = new ZoneBuilder(z, rng);
  const f = new Furnisher(b, rng);
  const c: Ctx = { z, b, f, rng, seed };
  z.name = 'The Nostalgic Playground';

  // ---- the lawn, edge to edge (the edges loop: it goes on for ever)
  b.fillFloor(1, 1, W - 2, H - 2, 'pg_grass');
  b.addRoom('The Playground', 'pg_park', 1, 1, W - 2, H - 2, { circuit: 0, outdoor: true, temp: 24 });
  b.flag(0, 0, W - 1, H - 1, TF.OUTDOOR);

  // ---- paths: a ring round the middle, four straight paths out to the edges (they meet themselves across the seams)
  const path = (x: number, y: number) => { if (x > 0 && y > 0 && x < W - 1 && y < H - 1 && z.floorAt(x, y)?.key === 'pg_grass') b.fillFloor(x, y, x, y, 'sidewalk'); };
  for (let a = 0; a < 720; a++) {
    const t = (a / 720) * Math.PI * 2, r = 31 + Math.sin(t * 3) * 2;
    const x = Math.round(CX + Math.cos(t) * r), y = Math.round(CY + Math.sin(t) * r);
    path(x, y); path(x + 1, y); path(x, y + 1);
  }
  for (let i = 1; i < W - 1; i++) { if (Math.abs(i - CX) > 12) { path(i, CY); path(i, CY + 1); path(CX, i); path(CX + 1, i); } }

  // ---- the middle: the big toy on bark chips; slides, a jungle gym, a dome
  for (let y = CY - 12; y <= CY + 12; y++) for (let x = CX - 12; x <= CX + 12; x++) if (ellipse(x, y, CX, CY, 11 + hh(x >> 2, y >> 2, 7301) * 1.5, 10.5)) b.fillFloor(x, y, x, y, 'pg_chips');
  force(c, 'pg_wave_slide', CX - 1, CY - 4, 0);
  put(c, 'jungle_gym', CX + 4, CY - 2, 0);
  put(c, 'slide_playground', CX - 6, CY - 3, 0);
  put(c, 'pg_dome', CX + 3, CY + 3, 0);
  put(c, 'seesaw', CX - 7, CY + 4, 0);
  put(c, 'spring_rider', CX - 3, CY + 6, 0); put(c, 'spring_rider', CX - 1, CY + 7, 1);
  put(c, 'tree_oak', CX + 9, CY - 7, 0);
  b.clearObjects(CX, CY, CX + 2, CY + 2);
  arrive(b, 'fall', CX + 1, CY + 1, 's', 2);

  // ---- east: the swings, three frames on faded rubber, and another row behind
  for (let y = CY - 9; y <= CY + 3; y++) for (let x = CX + 14; x <= CX + 28; x++) b.fillFloor(x, y, x, y, 'pg_rubber');
  for (let k = 0; k < 4; k++) { force(c, 'pg_swing_frame', CX + 15 + k * 3, CY - 7, 0, { v: k }); }
  for (let k = 0; k < 3; k++) put(c, 'pg_swing_frame', CX + 16 + k * 4, CY - 1, 0, { v: k + 1 });
  put(c, 'bench_park', CX + 18, CY + 5, 2); put(c, 'bench_park', CX + 23, CY + 5, 2);

  // ---- west: the roundabouts, spring riders, seesaws on blacktop and rubber
  for (let y = CY - 8; y <= CY + 10; y++) for (let x = CX - 30; x <= CX - 15; x++) if (ellipse(x, y, CX - 22, CY + 1, 8.5, 9.5)) b.fillFloor(x, y, x, y, 'pg_rubber');
  force(c, 'pg_merry', CX - 25, CY - 4, 0); force(c, 'pg_merry', CX - 19, CY + 1, 0);
  for (let k = 0; k < 4; k++) put(c, 'spring_rider', CX - 27 + k * 2, CY + 6, (k % 4) as Rot);
  put(c, 'seesaw', CX - 24, CY + 9, 0); put(c, 'seesaw', CX - 19, CY + 8, 0);

  // ---- the blacktop court: hopscotch, four-square, a painted snake, chalk drawings, a hoop
  for (let y = BT.y0; y <= BT.y1; y++) for (let x = BT.x0; x <= BT.x1; x++) b.fillFloor(x, y, x, y, 'pg_blacktop');
  decal(z, 'pg_hopscotch', BT.x0 + 3.5, BT.y0 + 6.5, 1.6, 4.4, 0);
  decal(z, 'pg_hopscotch', BT.x0 + 7, BT.y0 + 7, 1.6, 4.4, 0.05);
  decal(z, 'pg_foursquare', BT.x0 + 13.5, BT.y0 + 6.5, 4.5, 4.5, 0);
  decal(z, 'pg_snake', BT.x0 + 10.5, BT.y1 - 2.5, 7, 3.4, 0);
  decal(z, 'pg_chalk', BT.x1 - 3.5, BT.y0 + 3, 3.2, 2.1, 0.1);
  decal(z, 'pg_chalk', BT.x0 + 4, BT.y1 - 2, 3.2, 2.1, -0.2);
  put(c, 'basketball_hoop', BT.x1 - 1, BT.y0 + 7, 3);
  put(c, 'bench_park', BT.x0 + 2, BT.y0 - 2, 0); put(c, 'bench_park', BT.x0 + 8, BT.y0 - 2, 0);
  f.floorItem('note', BT.x0 + 5, BT.y0 + 10, { lore: 'pg_crayon' });

  // ---- sandpits: damp sand, buckets, a castle somebody is still building; one of them goes down
  const pits: [number, number, number, number][] = [[CX - 15, CY + 19, 5.5, 4], [CX + 13, CY + 21, 4.5, 3.5], [CX + 30, CY + 12, 3.5, 3]];
  pits.forEach(([px, py, rx, ry], i) => {
    for (let y = Math.floor(py - ry - 1); y <= py + ry + 1; y++) for (let x = Math.floor(px - rx - 1); x <= px + rx + 1; x++) if (ellipse(x, y, px, py, rx + hh(x, y, 7311) * 0.6, ry)) b.fillFloor(x, y, x, y, 'sand');
    put(c, 'sandbox', Math.round(px) - 1, Math.round(py) - 1, 0);
    for (let k = 0; k < 3; k++) { const x = Math.round(px + rng.float(-rx + 1, rx - 1)), y = Math.round(py + rng.float(-ry + 1, ry - 1)); if (isOpen(z, x, y)) put(c, 'pg_bucket', x, y, (k % 4) as Rot, { v: k + i }); }
    decal(z, 'decal_footprints', px + 0.5, py + 0.5, 2.2, 2.2, rng.float(0, 6), 0xd8c090, 0.7);
  });
  {
    const [px, py] = pits[0];
    pit(c, px + 3.5, py + 1.5, 1.2, { to: deeperFloor('playground', 1), shared: true, label: 'The sand pours down into the dark. Slide down after it.' }, 'pg_sand_hole');
  }

  // ---- the picnic lawn to the south, with oaks; where the crawl tube brings you in
  for (const [x, y] of [[CX - 8, CY + 26], [CX - 3, CY + 28], [CX + 3, CY + 26], [CX + 8, CY + 28]]) put(c, 'picnic_table', x, y, 0);
  for (const [x, y] of [[CX - 12, CY + 24], [CX + 12, CY + 25], [CX - 6, CY + 32], [CX + 6, CY + 33]]) put(c, 'tree_oak', x, y, 0);
  put(c, 'trash_can', CX - 1, CY + 25, 0); put(c, 'trash_can', CX + 10, CY + 30, 0);
  const tx = CX + 3, ty = CY + 38;
  b.clearObjects(tx - 3, ty - 3, tx + 3, ty + 3);
  force(c, 'pg_crawl_tube', tx - 2, ty - 1, 0, { portal: 'pg_tube_back' });
  b.portal({ id: 'pg_tube_back', x: tx - 2, y: ty - 1, kind: 'door', to: 'suburbs', tx: 40, ty: 40, anchor: 'r_pg_tube', label: 'Crawl back through the tube' });
  arrive(b, 'pg_tube_in', tx, ty, 'n', 3);
  force(c, 'vx_sign', tx + 1, ty + 2, 0, { text: 'BRIGHT HOUR PLAYGROUND|OPEN DAWN TILL DUSK', c: 0xe8b830, ink: 0x2a3a6a });
  f.floorItem('note', tx + 1, ty - 1, { lore: 'pg_rules' });
  f.floorItem('note', tx - 1, ty + 1, { lore: 'pg_calder' });

  // ---- climbing domes out on the lawns, more swings, a lone roundabout in the long grass
  for (const [x, y] of [[CX + 26, CY + 20], [CX - 34, CY + 16], [CX - 8, CY - 30], [CX + 34, CY + 40]]) { const p = near(z, x, y, 3, 3, rng, 3); if (p) put(c, 'pg_dome', p[0], p[1], 0); }
  for (const [x, y] of [[CX - 36, CY - 10], [CX + 36, CY + 30]]) { const p = near(z, x, y, 3, 2, rng, 4); if (p) put(c, 'pg_swing_frame', p[0], p[1], 0, { v: rng.int(0, 2) }); }
  { const p = near(z, CX - 40, CY + 36, 2, 2, rng, 4); if (p) put(c, 'pg_merry', p[0], p[1], 0); }
  { const p = near(z, CX + 20, CY + 36, 2, 4, rng, 4); if (p) put(c, 'pg_wave_slide', p[0], p[1], 2); }

  // ---- Studio B: Bright Hour Television's children's studio, closed, the set still dressed
  studio(c);

  // ---- the Ball House, if it is in this world: its soft-play hut on the west lawn
  if (zoneSpec('ballhouse')) {
    const p = near(z, CX - 34, CY + 26, 3, 3, rng, 3) ?? findOpenRect(z, 3, 3, rng, 400, 1);
    if (p) {
      const [hx, hy] = p;
      force(c, 'pg_softplay_hut', hx, hy, 0, { portal: 'pg_ballhouse' });
      b.portal({ id: 'pg_ballhouse', x: hx + 1, y: hy + 2, kind: 'door', to: 'ballhouse', tx: 10, ty: 10, anchor: 'pg_from_playground', label: 'Go into the Ball House (socks only)' });
      arrive(b, 'r_pg_ballhouse', hx + 1, hy + 3, 's', 2);
    }
  }

  // ---- trees round the edge band (thin, so the seams stay open), lamp posts on the ring, benches
  for (let i = 0; i < 70; i++) {
    const x = rng.int(6, W - 7), y = rng.int(6, H - 7);
    const edge = Math.min(x, y, W - 1 - x, H - 1 - y) < 14, mid = Math.hypot(x - CX, y - CY) > 40;
    if (!(edge || mid) || inStudio(x, y, 2) || z.floorAt(x, y)?.key !== 'pg_grass') continue;
    put(c, rng.chance(0.8) ? 'tree_oak' : 'tree_pine', x, y, 0);
  }
  for (let i = 0; i < 26; i++) { const x = rng.int(6, W - 7), y = rng.int(6, H - 7); if (!inStudio(x, y, 2) && z.floorAt(x, y)?.key === 'pg_grass') put(c, rng.chance(0.6) ? 'bush' : 'flowers', x, y, 0); }
  for (let a = 0; a < 12; a++) {
    const t = (a / 12) * Math.PI * 2 + 0.13, r = 33.5;
    const x = Math.round(CX + Math.cos(t) * r), y = Math.round(CY + Math.sin(t) * r);
    if (!inStudio(x, y, 1)) { if (a % 2) put(c, 'lamp_post', x, y, 0); else put(c, 'bench_park', x, y, ((a >> 1) % 4) as Rot); }
  }

  // ---- lost things: shoes, balls, buckets, tapes, juice boxes; leaves; chalk on the paths
  for (let i = 0; i < 26; i++) { const x = rng.int(6, W - 7), y = rng.int(6, H - 7); if (isOpen(z, x, y) && !inStudio(x, y, 0)) put(c, rng.pick(['pg_shoe', 'pg_ball', 'pg_bucket', 'pg_ball']), x, y, rng.int(0, 3) as Rot, { v: i }); }
  for (let i = 0; i < 36; i++) { const x = rng.int(5, W - 6), y = rng.int(5, H - 6); if (isOpen(z, x, y) && !inStudio(x, y, 0)) f.floorLoot('pg_floor', x, y); }
  for (let i = 0; i < 60; i++) { const x = rng.int(4, W - 5), y = rng.int(4, H - 5); if (z.floor[z.idx(x, y)] && !inStudio(x, y, 0)) decal(z, 'decal_leaves', x + 0.5, y + 0.5, rng.float(1.4, 2.6), rng.float(1.4, 2.6), rng.float(0, 6.28), 0xd8a050, 0.75); }
  for (let i = 0; i < 6; i++) { const t = rng.float(0, Math.PI * 2), r = 31 + Math.sin(t * 3) * 2; decal(z, i % 2 ? 'pg_hopscotch' : 'pg_chalk', CX + Math.cos(t) * r + 0.5, CY + Math.sin(t) * r + 0.5, i % 2 ? 1.4 : 2.6, i % 2 ? 3.8 : 1.7, t + Math.PI / 2); }

  // ---- the edges loop: off the east edge and back in at the west, off the north and in at the south
  b.clearObjects(1, 1, 2, H - 2); b.clearObjects(W - 3, 1, W - 2, H - 2); b.clearObjects(1, 1, W - 2, 2); b.clearObjects(1, H - 3, W - 2, H - 2);
  loopSeamsX(b, 1, W - 2, W - 4, 3, H - 4, 'pg_loop');
  loopSeamsY(b, 1, H - 2, H - 4, 3, W - 4, 'pg_loopy');

  b.flag(tx - 3, ty - 3, tx + 3, ty + 3, TF.NOSPAWN);
  z.env = {
    ...z.env,
    ambient: 0xf0c8a0, ambientI: 0.58, fog: 0xf2c494, fogNear: 30, fogFar: 84, void: 0xf0b884, temp: 24,
    sky: true, sun: 0xffc27a, sunI: 1.15, skyColor: 0xffd6a4, outdoorAmbient: 0xffe0c0,
    grade: 'fields', reverb: 'outdoor', ambience: 'suburbs', music: 'musicbox', weather: 'none',
  } as Zone['env'];
  z.meta.noWeather = true;
  // the five from Bright Hour's children's programmes (src/creatures/species/pg_*.ts)
  z.spawnTable = [['pg_doodlewump', 2.6], ['pg_dooley', 1.3], ['pg_lefty', 1.1], ['pg_petula', 1.0], ['pg_counto', 0.9], ['tallow_pigeon', 0.3]];
  z.creatureCap = 9;
  z.meta.dimension = 'playground';
  z.meta.terminalLore = ['pg_studio_memo', 'pg_survey'];
}
function inStudio(x: number, y: number, m: number) { return x >= ST.x0 - m && x <= ST.x1 + m && y >= ST.y0 - m && y <= ST.y1 + m; }

/** Studio B: brick shell, stage-board floor, the five sets along the back wall, cameras and bleachers facing them */
function studio(c: Ctx) {
  const { z, b, f, rng } = c;
  const { x0, y0, x1, y1 } = ST;
  b.clearObjects(x0 - 1, y0 - 1, x1 + 1, y1 + 1);
  b.fillFloor(x0, y0, x1, y1, 'pg_stage');
  b.roomWalls(x0, y0, x1, y1, 'brick');
  b.flag(x0, y0, x1, y1, TF.OUTDOOR, false);
  b.addRoom('Studio B', 'pg_studio', x0, y0, x1, y1, { circuit: 0, temp: 23, lootMul: 1.2 });
  // the way in: the big scenery door (open) and the audience door with the ON AIR box over it
  for (let x = x0 + 4; x <= x0 + 7; x++) b.gap(x, y1 + 1, 0);
  b.door(x1 - 5, y1 + 1, 0, 'door_wood');
  mount(b, 'pg_onair', x1 - 5, y1 + 1, 'n', {});
  force(c, 'vx_sign', x0 + 9, y1 + 3, 0, { text: 'BRIGHT HOUR TELEVISION|STUDIO B - CHILDREN\'S', c: 0x2a3a6a, ink: 0xf0c040 });
  // the back wall: five sets side by side, a title board in front of each
  const sets = [x0 + 1, x0 + 6, x0 + 11, x0 + 16, x0 + 21];
  force(c, 'pg_sky_flat', sets[0], y0, 0); force(c, 'pg_cave', sets[0] + 0, y0 + 2, 0);
  force(c, 'pg_sky_flat', sets[1], y0, 0); force(c, 'pg_card_hill', sets[1], y0 + 2, 0); put(c, 'pg_monitor', sets[1] + 3, y0 + 3, 0);
  force(c, 'pg_puppet_booth', sets[2] + 1, y0 + 1, 0); put(c, 'pg_basket', sets[2], y0 + 3, 0); put(c, 'pg_basket', sets[2] + 3, y0 + 3, 0);
  force(c, 'pg_sky_flat', sets[3], y0, 0); force(c, 'pg_card_hill', sets[3], y0 + 2, 0); put(c, 'flowers', sets[3] + 3, y0 + 3, 0); put(c, 'flowers', sets[3], y0 + 4, 0);
  force(c, 'pg_number_hut', sets[4], y0 + 1, 0);
  sets.forEach((sx, i) => force(c, 'pg_title', sx, y0 + 5, 0, { v: i }));
  // the floor: cameras and lamps facing the sets, cables everywhere, monitors, the bleachers behind
  for (const [x, rot] of [[x0 + 5, 2], [x0 + 13, 2], [x0 + 21, 2]] as [number, Rot][]) force(c, 'pg_tv_camera', x, y0 + 9, rot);
  for (const x of [x0 + 2, x0 + 9, x0 + 17, x0 + 24]) force(c, 'pg_studio_lamp', x, y0 + 8, 2);
  for (let i = 0; i < 14; i++) decal(z, 'pg_cables', x0 + 2 + rng.float(0, x1 - x0 - 3), y0 + 7 + rng.float(0, 5), rng.float(2, 3.5), 1.2, rng.float(-0.6, 0.6), undefined, 0.95);
  put(c, 'pg_monitor', x0 + 9, y0 + 10, 2); put(c, 'pg_monitor', x0 + 17, y0 + 10, 2);
  force(c, 'pg_bleachers', x0 + 3, y0 + 12, 2); force(c, 'pg_bleachers', x0 + 9, y0 + 12, 2); force(c, 'pg_bleachers', x0 + 17, y0 + 12, 2);
  // the gallery corner: lockers, a shelf of tapes, the memo, a survey unit's log
  for (let k = 0; k < 3; k++) put(c, 'locker', x1 - 1 - k, y1, 2);
  put(c, 'shelf_metal', x0, y1 - 2, 1, { loot: 'pg_studio' } as any);
  put(c, 'pg_basket', x0 + 1, y1, 0);
  f.floorItem('note', x1 - 3, y1 - 2, { lore: 'pg_studio_memo' });
  f.floorItem('note', x0 + 12, y0 + 11, { lore: 'pg_survey' });
  f.floorItem('note', sets[3] + 1, y0 + 6, { lore: 'pg_tape' });
  for (let i = 0; i < 3; i++) f.floorItem('pg_vhs', x0 + 2 + i * 7, y1 - 1);
  // house lights: dim working lights, every one of them on
  for (let y = y0 + 2; y < y1; y += 5) for (let x = x0 + 2; x < x1; x += 5) b.light(x + 0.5, y + 0.5, 'fluoro', { color: 0xfff0d8, intensity: 0.75, radius: 6.5, circuit: 0, flicker: hh(x, y, 7331) < 0.15 ? 0.15 : 0 });
  b.flag(x0 + 4, y1 - 1, x0 + 7, y1, TF.NOSPAWN);
}

defZone({
  key: 'playground', name: 'The Nostalgic Playground', W, H, depth: 5,
  blurb: 'A park at golden hour, and the sun is not going down. The swings are moving. There is nobody on them. Somewhere a television audience is laughing.',
  gen: (z, s) => { generatePlayground(z, s); },
});

// ---------------------------------------------------------------- the ways in: the suburbs park, deep floors, the Ball House
onZoneGenerated((z, seed) => {
  if (z.key === 'suburbs') {
    const rng = new Rng(hash3(seed, 7341, 3));
    const b = new ZoneBuilder(z, rng);
    const c: Ctx = { z, b, f: new Furnisher(b, rng), rng, seed };
    // next to the park's sandbox if it has one, else any quiet patch of lawn
    let p: [number, number] | null = null;
    for (const o of z.objects.values()) if (o.key === 'sandbox' || o.key === 'jungle_gym') { p = near(z, o.x + 1, o.y + 1, 2, 4, rng, 7); if (p) break; }
    p ??= findOpenRect(z, 2, 4, rng, 600, 1);
    if (!p) return;
    const [x, y] = p;
    force(c, 'pg_crawl_tube', x, y, 0, { portal: 'pg_suburbs_tube' });
    b.portal({ id: 'pg_suburbs_tube', x, y, kind: 'door', to: 'playground', tx: CX + 3, ty: CY + 38, anchor: 'pg_tube_in', label: 'Crawl into the tube. There is golden light at the other end.' });
    arrive(b, 'r_pg_tube', x, y + 2, 's', 1);
    return;
  }
  if (z.key === 'ballhouse') {
    const rng = new Rng(hash3(seed, 7351, 5));
    const b = new ZoneBuilder(z, rng);
    const c: Ctx = { z, b, f: new Furnisher(b, rng), rng, seed };
    const p = findOpenRect(z, 1, 2, rng, 600, 1);
    if (!p) return;
    const [x, y] = p;
    force(c, 'pg_crawl_tube', x, y, 0, { portal: 'pg_ballhouse_back' });
    b.portal({ id: 'pg_ballhouse_back', x, y, kind: 'door', to: 'playground', tx: CX - 34, ty: CY + 28, anchor: 'r_pg_ballhouse', label: 'Crawl out to the playground' });
    if (!(z.meta.anchors ||= {}).pg_from_playground) arrive(b, 'pg_from_playground', x, y + 2, 's', 1);
    return;
  }
  if (z.key.startsWith('floor~')) {
    const n = floorNum(z.key);
    if (n < 40 || hash3(n, 31, 7361) % 7 !== 0) return;
    const rng = new Rng(hash3(seed, 7362, 5));
    const b = new ZoneBuilder(z, rng);
    const c: Ctx = { z, b, f: new Furnisher(b, rng), rng, seed };
    const p = findOpenRect(z, 3, 3, rng, 400, 1);
    if (p) pit(c, p[0] + 1.5, p[1] + 1.5, 1.4, { to: 'playground', anchor: 'fall', label: 'Warm gold light comes up out of this hole, and children laughing.' }, 'pg_floor_hole');
  }
});
