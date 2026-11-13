// Westgate Station — the Inner Loop (152×54, depth 3). A metro station kept
// exactly as it was the night the last train ran, some time around 1989: cream
// and teal glazed tile, the name in mosaic, tiled columns, wooden benches,
// fluorescent tubes on chains, a token booth and a row of token turnstiles,
// payphones, vending machines, adverts for things nobody can buy any more.
// From north to south:
//   y  2.. 4  the Return Tunnel (the loop's back half, behind the station)
//   y  6.. 9  Track 1, a dead-end siding: the dead train (three cars you can walk
//             through) stands at the east end of Platform 1
//   y 10..16  Platform 1
//   y 17..21  two stair passages up to the ticket hall
//   y 22..35  the Mezzanine (ticket hall, +1 m): unpaid side west of the turnstile
//             line (the token booth, payphones, the stairs up to the Depot), paid
//             side east (vending, benches, the stairs down to both platforms)
//   y 36..40  two stair passages down to Platform 2
//   y 41..47  Platform 2 (the staff door and the signal room at its west end:
//             the way through to the Service Tunnels)
//   y 48..50  Track 2, the live line. At both ends it runs into the tunnel mouths
//             (signals always on red), round the loop tunnels and back along the
//             Return Tunnel: one closed ring. The Worm Train runs it.
// z.meta.subway carries the ring (line), the egg pits, the booth and the
// turnstile line for the inhabitants (src/creatures/species/worm_train.ts,
// su_natives.ts).
import { defZone } from '../worldGraph';
import { Zone, TF } from '../zone';
import { ZoneBuilder } from './builder';
import { Furnisher } from './furnish';
import { Rng } from '../../core/rng';
import { type Ctx, type Rot, arrive, put, force, mount, decal, hh, lamp, isOpen } from './weird_kit';

const W = 152, H = 54;
// rows
const RT0 = 2, RT1 = 4;            // return tunnel
const T10 = 6, T11 = 9;            // track 1 (siding)
const P10 = 10, P11 = 16;          // platform 1
const S10 = 17, S11 = 21;          // stairs up
const M0 = 22, M1 = 35;            // mezzanine
const S20 = 36, S21 = 40;          // stairs down
const P20 = 41, P21 = 47;          // platform 2
const T20 = 48, T21 = 50;          // track 2 (the ring)
// columns
const LW0 = 5, LW1 = 7, LE0 = 144, LE1 = 146;   // the loop tunnels
const PX0 = 26, PX1 = 123;                      // platforms
const T1X0 = 22, T1X1 = 127;                    // the siding
const MX0 = 34, MX1 = 115;                      // mezzanine
const GATE_X = 58;                              // the turnstile line (west edge of this column)
const NORTH_STAIRS = [64, 96], SOUTH_STAIRS = [72, 104];
const TRACK_H = -1.1, MEZZ_H = 1.0;
// circuits
const C_PLAT = 1, C_MEZZ = 2, C_TUN = 3, C_CAR = 4, C_STAFF = 5;
// the dead train: three cars on Track 1
const CARS: [number, number][] = [[82, 94], [95, 107], [108, 120]];
const CAR_Y0 = 7, CAR_Y1 = 9;

type Kind = 0 | 1 | 2 | 3 | 4 | 5;  // 0 rock, 1 track/tunnel, 2 station floor, 3 car, 4 stairs, 5 staff
const K_ROCK = 0, K_TRACK = 1, K_STATION = 2, K_CAR = 3, K_STAIR = 4, K_STAFF = 5;

export function generateSubway(z: Zone, seed: number) {
  const rng = new Rng(seed);
  const b = new ZoneBuilder(z, rng);
  const f = new Furnisher(b, rng);
  const c: Ctx = { z, b, f, rng, seed };
  z.name = 'Westgate Station — The Inner Loop';
  const kind = new Uint8Array(W * H);
  const K = (x0: number, y0: number, x1: number, y1: number, k: Kind) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (z.inb(x, y)) kind[z.idx(x, y)] = k; };

  // ============================================================ the ring: tunnels and Track 2
  b.fillFloor(LW0, RT0, LE1, RT1, 'concrete', TRACK_H);
  b.fillFloor(LW0, RT0, LW1, T21, 'concrete', TRACK_H);
  b.fillFloor(LE0, RT0, LE1, T21, 'concrete', TRACK_H);
  b.fillFloor(LW0, T20, LE1, T21, 'concrete', TRACK_H);
  K(LW0, RT0, LE1, RT1, K_TRACK); K(LW0, RT0, LW1, T21, K_TRACK); K(LE0, RT0, LE1, T21, K_TRACK); K(LW0, T20, LE1, T21, K_TRACK);
  // Track 1, the siding
  b.fillFloor(T1X0, T10, T1X1, T11, 'concrete', TRACK_H);
  K(T1X0, T10, T1X1, T11, K_TRACK);
  // platforms
  b.fillFloor(PX0, P10, PX1, P11, 'terrazzo', 0);
  b.fillFloor(PX0, P20, PX1, P21, 'terrazzo', 0);
  K(PX0, P10, PX1, P11, K_STATION); K(PX0, P20, PX1, P21, K_STATION);
  // the mezzanine
  b.fillFloor(MX0, M0, MX1, M1, 'linoleum_school', MEZZ_H);
  K(MX0, M0, MX1, M1, K_STATION);
  // stair passages (4 wide), real steps
  for (const sx of NORTH_STAIRS) for (let i = 0; i < 5; i++) { b.fillFloor(sx, S10 + i, sx + 3, S10 + i, 'concrete', 0.2 * (i + 1)); K(sx, S10 + i, sx + 3, S10 + i, K_STAIR); }
  for (const sx of SOUTH_STAIRS) for (let i = 0; i < 5; i++) { b.fillFloor(sx, S20 + i, sx + 3, S20 + i, 'concrete', MEZZ_H - 0.2 * (i + 1)); K(sx, S20 + i, sx + 3, S20 + i, K_STAIR); }
  // the depot stair alcove off the mezzanine's west wall
  b.fillFloor(MX0 - 4, 27, MX0 - 1, 30, 'linoleum_school', MEZZ_H); K(MX0 - 4, 27, MX0 - 1, 30, K_STATION);
  // the signal room and its corridor (staff), off Platform 2's west end
  const SR = { x0: 12, y0: 41, x1: 24, y1: 46 };
  b.fillFloor(SR.x0, SR.y0, SR.x1, SR.y1, 'linoleum_green', 0); K(SR.x0, SR.y0, SR.x1, SR.y1, K_STAFF);
  b.fillFloor(SR.x1 + 1, 43, PX0 - 1, 44, 'linoleum_green', 0); K(SR.x1 + 1, 43, PX0 - 1, 44, K_STAFF);
  b.fillFloor(LW1 + 1, 44, SR.x0 - 1, 44, 'grate', 0); K(LW1 + 1, 44, SR.x0 - 1, 44, K_TRACK);
  // the dead train's cars stand at platform height on the siding
  for (const [x0, x1] of CARS) { b.fillFloor(x0, CAR_Y0, x1, CAR_Y1, 'rubber', 0); K(x0, CAR_Y0, x1, CAR_Y1, K_CAR); }

  // rock sits at track level, so the tunnel walls stand on the track bed
  for (let i = 0; i < W * H; i++) if (!z.floor[i]) z.height[i] = Math.round(TRACK_H * 10);

  // ============================================================ walls: wherever floor meets rock, and between kinds that do not open
  const kAt = (x: number, y: number) => (z.inb(x, y) ? kind[z.idx(x, y)] : K_ROCK);
  const wallFor = (a: number, b2: number) => {
    const k = a === K_ROCK ? b2 : a;
    if (k === K_TRACK) return 'su_trackside';
    if (k === K_CAR) return 'su_car';
    if (k === K_STAFF) return 'cinder';
    return 'tile';
  };
  const opens = (a: number, b2: number) => a === b2 || (a !== K_ROCK && b2 !== K_ROCK && !(a === K_CAR || b2 === K_CAR) && !(a === K_STAFF || b2 === K_STAFF));
  for (let y = 1; y < H; y++) for (let x = 1; x < W; x++) {
    const k = kAt(x, y), kn = kAt(x, y - 1), kw = kAt(x - 1, y);
    if (!opens(k, kn) && (k || kn)) b.hwall(x, x, y, wallFor(k, kn));
    if (!opens(k, kw) && (k || kw)) b.vwall(x, y, y, wallFor(k, kw));
  }
  // the track beds meet the platform edges with no wall; mezzanine and stairs, platform and stairs: open (done above).
  // The cars stand nose to tail: a bulkhead between each pair, with a gangway through it
  CARS.forEach(([x0], ci) => { if (ci > 0) { b.vwall(x0, CAR_Y0, CAR_Y1, 'su_car'); b.arch(x0, CAR_Y0 + 1, 1); } });

  // ============================================================ wallpaper
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = kind[z.idx(x, y)];
    if (k === K_TRACK) b.paper(x, y, x, y, 'su_wall_tunnel');
    else if (k === K_STATION || k === K_STAIR) b.paper(x, y, x, y, 'su_wall_tile');
    else if (k === K_CAR) b.paper(x, y, x, y, 'su_wall_car');
    else if (k === K_STAFF) b.paper(x, y, x, y, 'su_wall_staff');
  }
  // in the station the track walls are tiled too; platform 2's back wall is the teal-skirted variant
  b.paper(PX0, T10, PX1, T10, 'su_wall_tile');
  b.paper(PX0, P20, PX1, P20, 'su_wall_tile_b');
  b.paper(MX0, M0, MX1, M0, 'su_wall_tile_b');

  // ============================================================ rooms
  b.addRoom('The Inner Loop', 'tunnel', 0, 0, W - 1, H - 1, { circuit: C_TUN, temp: 13 });
  b.addRoom('Return Tunnel', 'tunnel', LW0, RT0, LE1, RT1, { circuit: C_TUN, temp: 12 });
  b.addRoom('Track 2', 'track', LW0, T20, LE1, T21, { circuit: C_TUN, temp: 12 });
  b.addRoom('Track 1 (Siding)', 'track', T1X0, T10, T1X1, T11, { circuit: C_PLAT, temp: 13 });
  b.addRoom('Platform 1', 'platform', PX0, P10, PX1, P11, { circuit: C_PLAT, temp: 15 });
  b.addRoom('Platform 2', 'platform', PX0, P20, PX1, P21, { circuit: C_PLAT, temp: 15 });
  b.addRoom('Ticket Hall', 'mezzanine', MX0, M0, MX1, M1, { circuit: C_MEZZ, temp: 17 });
  for (const sx of NORTH_STAIRS) b.addRoom('Stairs to Platform 1', 'stairs', sx, S10, sx + 3, S11, { circuit: C_MEZZ, temp: 16 });
  for (const sx of SOUTH_STAIRS) b.addRoom('Stairs to Platform 2', 'stairs', sx, S20, sx + 3, S21, { circuit: C_MEZZ, temp: 16 });
  b.addRoom('Stairs to the Interchange', 'stairs', MX0 - 4, 27, MX0 - 1, 30, { circuit: C_MEZZ, temp: 16 });
  b.addRoom('Signal Room', 'signal_room', SR.x0, SR.y0, SR.x1, SR.y1, { circuit: C_STAFF, temp: 18, lootMul: 1.4 });
  b.addRoom('Staff Passage', 'staff', SR.x1 + 1, 43, PX0 - 1, 44, { circuit: C_STAFF, temp: 15 });
  b.addRoom('Cable Passage', 'staff', LW1 + 1, 44, SR.x0 - 1, 44, { circuit: C_TUN, temp: 13 });
  CARS.forEach(([x0, x1], i) => b.addRoom(`Car ${3 - i}`, 'train_car', x0, CAR_Y0, x1, CAR_Y1, { circuit: C_CAR, temp: 14, lootMul: 1.2 }));

  // ============================================================ track, ballast, the ring
  const trackRow = (x0: number, x1: number, y: number, r: Rot) => { for (let x = x0; x <= x1; x++) b.obj('su_track', x, y, r, { v: hh(x, y, 9701) < 0.12 ? 1 + Math.floor(hh(x, y, 9702) * 3) : 0 }); };
  // (one sleeper per tile on the centre row; the rails sit at standard gauge either side of it)
  trackRow(LW0, LE1, T20 + 1, 0);
  trackRow(LW0, LE1, RT0 + 1, 0);
  for (let y = RT1 + 1; y < T20; y++) { b.obj('su_track', LW0 + 1, y, 1, {}); b.obj('su_track', LE0 + 1, y, 1, {}); }
  // the siding: rails where the train is not
  for (let x = T1X0 + 1; x <= T1X1 - 1; x++) {
    if (CARS.some(([a, bb]) => x >= a && x <= bb)) continue;
    b.obj('su_track', x, T10 + 1, 0, { v: hh(x, 3, 9703) < 0.15 ? 1 + Math.floor(hh(x, 4, 9704) * 3) : 0 }, { oz: 0.5 });
  }
  force(c, 'su_buffer', T1X0, T10 + 1, 0, {});
  force(c, 'su_buffer', T1X1, T10 + 1, 2, {});
  // the siding's tunnel stubs are bricked up
  for (const x of [T1X0 + 1, T1X1 - 1]) for (const y of [T10, T11]) put(c, 'trash_bags', x, y, 0, {});

  // ============================================================ the platforms
  for (const [y0, y1, edgeY, side] of [[P10, P11, P10, 'n'], [P20, P21, P21, 's']] as const) {
    const midY = Math.floor((y0 + y1) / 2);
    for (let x = PX0; x <= PX1; x++) {
      // the edge: coping, the yellow tactile strip, the gum
      const ey = side === 'n' ? edgeY + 0.12 : edgeY + 0.88;
      decal(z, 'su_coping', x + 0.5, ey, 1.0, 0.24, side === 'n' ? 0 : Math.PI, undefined, 1);
      decal(z, 'su_tactile', x + 0.5, side === 'n' ? edgeY + 0.5 : edgeY + 0.5, 1.0, 0.5, side === 'n' ? 0 : Math.PI, undefined, 1);
      if (hh(x, edgeY, 9711) < 0.5) decal(z, 'su_gum', x + 0.5, side === 'n' ? edgeY + 1.1 : edgeY - 0.1, 1.0, 1.0, hh(x, 1, 9712) * 6, undefined, 0.9);
      if (x % 16 === 6) decal(z, 'su_behind', x + 0.5, side === 'n' ? edgeY + 1.2 : edgeY - 0.2, 4, 0.22, side === 'n' ? 0 : Math.PI, undefined, 0.9);
      // gum everywhere, footprints, the odd stain
      for (let y = y0; y <= y1; y++) {
        const r = hh(x, y, 9713);
        if (r < 0.05) decal(z, 'su_gum', x + 0.5, y + 0.5, 1, 1, r * 90, undefined, 0.8);
        else if (r < 0.065) decal(z, 'decal_stain_water', x + 0.5, y + 0.5, 1.2, 1.0, r * 300, undefined, 0.5);
        else if (r < 0.075) decal(z, 'decal_footprints', x + 0.5, y + 0.5, 1, 1, r * 700, undefined, 0.6);
      }
      // tubes on chains, two rows
      if (x % 4 === 1) for (const ly of [y0 + 1, y1 - 1]) {
        const k = hh(x, ly, 9714);
        b.obj('su_tube', x, ly, 0, { circuit: C_PLAT, flicker: k < 0.12 ? 0.35 : k < 0.2 ? 0.08 : 0, broken: k > 0.96 });
      }
      // columns down the middle, benches between them, bins
      if ((x - PX0) % 8 === 4 && x < PX1 - 2) force(c, 'su_column', x, midY, 0, {});
      if ((x - PX0) % 8 === 0 && x > PX0 && x < PX1 - 3) put(c, 'su_bench', x, midY, side === 'n' ? 2 : 0, {});
      if ((x - PX0) % 16 === 10) put(c, 'trash_can', x, side === 'n' ? y1 : y0, 0, {});
    }
    // on the back wall (platform 2: visible), vending, adverts and maps, and the name band
    if (side === 's') {
      for (let x = PX0 + 4; x <= PX1; x += 18) put(c, x % 2 ? 'vending_soda' : 'vending_snack', x, y0, 0, {});
      for (let x = PX0 + 2; x <= PX1 - 3; x += 4) {
        const m = Math.floor((x - PX0 - 2) / 4) % 6;
        if (SOUTH_STAIRS.some((s) => x + 2 >= s && x <= s + 3)) continue;
        if (m === 0) mount(b, 'su_name_band', x, y0, 'n', {});
        else if (m === 3) mount(b, 'su_map', x, y0, 'n', {});
        else mount(b, 'su_advert', x, y0, 'n', { v: Math.floor(hh(x, 2, 9715) * 8) });
      }
      put(c, 'zw_newsstand', 88, y0, 0, {});
      put(c, 'gumball_machine', 92, y0, 0, {});
      put(c, 'photo_booth', 114, y0, 0, {});
    } else {
      for (let x = PX0 + 6; x <= PX1; x += 20) put(c, x % 3 ? 'vending_soda' : 'vending_snack', x, y1, 2, {});
    }
    // the platform number at both ends, hung from the ceiling, and a clock
    for (const x of [PX0 + 3, PX1 - 3]) b.obj('zw_station_clock', x, midY, 0, {});
  }
  // across the siding, the station wall shows its name: mosaic bands, adverts and maps above Track 1
  for (let x = PX0 + 1; x <= PX1 - 3; x += 4) {
    const m = Math.floor((x - PX0 - 1) / 4) % 5;
    if (m === 0) mount(b, 'su_name_band', x, T10, 'n', { y: 0 });
    else if (m === 2) mount(b, 'su_map', x, T10, 'n', { y: 0.1 });
    else mount(b, 'su_advert', x, T10, 'n', { v: Math.floor(hh(x, 5, 9716) * 8), y: 0.2 });
  }
  for (let x = PX0 + 2; x <= PX1; x += 12) mount(b, 'su_speaker', x, T10, 'n', { y: 0.2 });

  // ============================================================ the dead train
  CARS.forEach(([x0, x1], ci) => deadCar(c, x0, x1, ci));

  // ============================================================ the tunnel mouths, signals, the dark beyond
  for (const [x, side, g] of [[PX0 - 1, 'n', 0], [PX1 + 1, 'n', 1]] as const) {
    mount(b, 'su_signal', x, T20, side, { circuit: C_TUN, g });
    lamp(b, x, T20 + 1, 'emergency', C_TUN, { intensity: 0.45, radius: 4 });
  }
  for (const [x, y] of [[LW0 + 1, RT0 + 1], [LE0 + 1, RT0 + 1], [LW0 + 1, T20 + 1], [LE0 + 1, T20 + 1]]) lamp(b, x, y, 'bulb', C_TUN, { intensity: 0.7, radius: 6, color: 0xffd8a0 });
  // work lights along the ring every 9 m, some dead
  for (let x = LW0 + 6; x <= LE1 - 6; x += 9) {
    if (x < PX0 || x > PX1) lamp(b, x, T20 + 1, 'bulb', C_TUN, { intensity: 0.75, radius: 6, broken: hh(x, 1, 9721) < 0.15, flicker: hh(x, 2, 9722) < 0.25 ? 0.2 : 0 });
    lamp(b, x, RT0 + 1, 'bulb', C_TUN, { intensity: 0.7, radius: 6, broken: hh(x, 3, 9723) < 0.2, flicker: hh(x, 4, 9724) < 0.25 ? 0.2 : 0 });
  }
  for (let y = RT1 + 4; y < T20 - 2; y += 9) for (const x of [LW0 + 1, LE0 + 1]) lamp(b, x, y, 'bulb', C_TUN, { intensity: 0.7, radius: 6, broken: hh(x, y, 9725) < 0.2 });
  // the station over Track 2 is lit by the platform tubes; the siding too
  for (let x = PX0 + 2; x <= PX1; x += 6) lamp(b, x, T10 + 1, 'fluoro', C_PLAT, { intensity: 0.55, radius: 5, y: 2.6 });
  // signals and numbers in the tunnels
  for (const [x, y, s] of [[LW0, 24, 'w'], [LE1, 24, 'e'], [40, RT0, 'n'], [110, RT0, 'n']] as const) mount(b, 'su_signal', x, y, s, { circuit: C_TUN, g: (x + y) % 2 });

  // ============================================================ stairs
  for (const sx of NORTH_STAIRS) {
    for (let i = 0; i < 4; i++) for (let k = 0; k < 4; k++) b.obj('su_step', sx + k, S10 + i, 2, {});
    for (let i = 0; i < 5; i++) { mount(b, 'zg_handrail', sx, S10 + i, 'w'); mount(b, 'zg_handrail', sx + 3, S10 + i, 'e'); }
    b.obj('su_tube', sx + 1, S10 + 1, 0, { circuit: C_MEZZ, r: 1 }); b.obj('su_tube', sx + 2, S10 + 3, 0, { circuit: C_MEZZ, r: 1, flicker: hh(sx, 1, 9731) < 0.5 ? 0.3 : 0 });
  }
  for (const sx of SOUTH_STAIRS) {
    for (let i = 0; i < 4; i++) for (let k = 0; k < 4; k++) b.obj('su_step', sx + k, S20 + i, 0, {});
    for (let i = 0; i < 5; i++) { mount(b, 'zg_handrail', sx, S20 + i, 'w'); mount(b, 'zg_handrail', sx + 3, S20 + i, 'e'); }
    b.obj('su_tube', sx + 1, S20 + 1, 0, { circuit: C_MEZZ, r: 1 }); b.obj('su_tube', sx + 2, S20 + 3, 0, { circuit: C_MEZZ, r: 1, flicker: hh(sx, 2, 9732) < 0.5 ? 0.3 : 0 });
  }

  // ============================================================ the ticket hall
  mezzanine(c);

  // ============================================================ the signal room, the staff passage, the way to the Service Tunnels
  signalRoom(c, SR);

  // ============================================================ portals
  // up to the Depot: the stairs in the west alcove
  {
    const sx = MX0 - 4, sy = 28;
    force(c, 'staircase_up', sx, sy, 3, { portal: 'r_depot_subway' });
    b.portal({ id: 'r_depot_subway', x: sx, y: sy, kind: 'stairs_up', to: 'depot', tx: 95, ty: 60, label: 'Climb the stairs to the Interchange' });
    arrive(b, 'p_depot_subway', sx + 3, sy, 'e', 3);
    mount(b, 'su_advert', sx + 1, 27, 'n', { v: 4 });
    lamp(b, sx + 2, 29, 'fluoro', C_MEZZ, { flicker: 0.1 });
  }

  // ============================================================ the ring, for the Worm Train
  const L = ringLine();
  // egg pits: track-bed tiles in the tunnels and on the siding, away from the doors
  const pits: [number, number][] = [];
  for (let i = 0; i < 400 && pits.length < 18; i++) {
    const t = rng.int(0, 3);
    let x = 0, y = 0;
    if (t === 0) { x = rng.int(LW0 + 2, LE1 - 2); y = RT0 + rng.int(0, 2); }
    else if (t === 1) { x = rng.pick([LW0, LW1, LE0, LE1]); y = rng.int(RT1 + 2, T20 - 2); }
    else if (t === 2) { x = rng.pick([rng.int(LW0 + 2, PX0 - 3), rng.int(PX1 + 3, LE1 - 2)]); y = T20 + rng.pick([0, 2]); }
    else { x = rng.int(T1X0 + 2, CARS[0][0] - 3); y = rng.pick([T10, T11]); }
    if (!isOpen(z, x, y) && !z.objectsAt(x, y).every((o) => o.key === 'su_track')) continue;
    if (pits.some(([a, bb]) => Math.abs(a - x) + Math.abs(bb - y) < 6)) continue;
    pits.push([x, y]);
  }
  const booth = { x: GATE_X - 2.5, z: M0 + 2.4, ox: GATE_X - 4, oy: M0 };
  const turnstiles: [number, number][] = [];
  for (let y = 25; y <= M1; y++) if (z.objectsAt(GATE_X, y).some((o) => o.key === 'su_turnstile')) turnstiles.push([GATE_X, y]);
  z.meta.subway = {
    line: L, pits, booth, turnstiles, mantis: [GATE_X + 0.5, 32.5],
    /** where the Worm Train may leave the ring to hunt: the track beds, the platforms */
    hunt: [[LW0, RT0, LE1, T21], [PX0, P10, PX1, P11], [PX0, P20, PX1, P21]],
    trackY: TRACK_H,
  };

  // ============================================================ loot, notes
  for (let i = 0; i < 16; i++) {
    const x = rng.int(PX0 + 1, PX1 - 1), y = rng.pick([rng.int(P10 + 1, P11), rng.int(P20, P21 - 1)]);
    if (isOpen(z, x, y)) f.floorLoot('su_floor', x, y);
  }
  for (let i = 0; i < 10; i++) {
    const x = rng.int(MX0 + 1, MX1 - 1), y = rng.int(M0 + 1, M1 - 1);
    if (isOpen(z, x, y)) f.floorLoot('su_floor', x, y);
  }
  for (let i = 0; i < 6; i++) {
    const x = rng.int(LW0 + 2, LE1 - 2), y = rng.pick([RT0 + 1, T20 + 1]);
    if (x > PX0 && x < PX1 && y === T20 + 1) continue;
    f.floorLoot('su_track_junk', x, y);
  }
  f.floorItem('note', 40, P10 + 2, { lore: 'su_last_train' });
  f.floorItem('note', 100, P21 - 1, { lore: 'su_driver' });
  f.floorItem('newspaper', 61, P11);

  // ============================================================ env, power, inhabitants
  for (const cc of [C_PLAT, C_MEZZ, C_TUN, C_CAR, C_STAFF]) z.power.set(cc, true);
  b.flag(MX0 - 4, 26, MX0 + 4, 31, TF.NOSPAWN);
  z.env = {
    ...z.env,
    ambient: 0x4a4638, ambientI: 0.62, fog: 0x1a1812, fogNear: 18, fogFar: 46, void: 0x060504, temp: 15,
    grade: 'mall', reverb: 'tunnel', ambience: 'tunnels', music: 'muzak',
  };
  z.spawnTable = [['ringer', 2.4], ['worm_egg', 1.4], ['worm_larva', 0.5], ['stile_mantis', 0.4]];
  z.creatureCap = 7;
  z.meta.terminalLore = ['su_last_train', 'su_driver', 'su_booth_log'];
}

// ============================================================ the ring's centre line (closed, clockwise from the west end of Track 2)
function ringLine(): [number, number][] {
  const xw = (LW0 + LW1 + 1) / 2, xe = (LE0 + LE1 + 1) / 2, yn = (RT0 + RT1 + 1) / 2, ys = (T20 + T21 + 1) / 2;
  const r = 1.2, out: [number, number][] = [];
  const arc = (cx: number, cy: number, a0: number, a1: number) => { for (let k = 0; k <= 6; k++) { const a = a0 + (a1 - a0) * (k / 6); out.push([+(cx + Math.cos(a) * r).toFixed(3), +(cy + Math.sin(a) * r).toFixed(3)]); } };
  // west end of track 2 heading east, east loop north, return tunnel west, west loop south
  arc(xw + r, ys - r, Math.PI, Math.PI / 2);         // SW corner (coming down the west loop, turning east)
  arc(xe - r, ys - r, Math.PI / 2, 0);               // SE corner
  arc(xe - r, yn + r, 0, -Math.PI / 2);              // NE corner
  arc(xw + r, yn + r, -Math.PI / 2, -Math.PI);       // NW corner
  return out;
}

// ============================================================ the mezzanine
function mezzanine(c: Ctx) {
  const { z, b, f } = c;
  // the ceiling tubes
  for (let x = MX0 + 1; x <= MX1; x += 3) for (const y of [M0 + 2, M0 + 6, M0 + 10]) {
    const k = hh(x, y, 9741);
    b.obj('su_tube', x, y, 0, { circuit: C_MEZZ, flicker: k < 0.1 ? 0.4 : k < 0.18 ? 0.1 : 0, broken: k > 0.97 });
  }
  // the turnstile line: railings, turnstiles, a service gate
  // (row 32 has no turnstile: something stands there instead, su_natives.ts)
  const tRows = [26, 27, 28, 30, 31];
  for (let y = M0 + 3; y <= M1; y++) {
    if (tRows.includes(y)) { force(c, 'su_turnstile', GATE_X, y, 0, {}); continue; }
    if (y === 34) { b.edge(GATE_X, y, 1, { kind: 'gate', style: 'door_metal', open: false }); continue; }
    b.vwall(GATE_X, y, y, 'railing');
  }
  for (let y = M0; y < M0 + 3; y++) b.vwall(GATE_X, y, y, 'railing');
  // the token booth at the head of the line, windows to the unpaid side
  force(c, 'su_token_booth', GATE_X - 4, M0, 0, {});
  b.flag(GATE_X - 4, M0, GATE_X - 2, M0 + 2, TF.NOSPAWN);
  mount(b, 'su_name_band', GATE_X + 4, M0, 'n', {});
  mount(b, 'su_name_band', MX0 + 4, M0, 'n', {});
  // the unpaid side: payphones on the north wall, benches, the map, a bin, adverts
  for (const x of [MX0 + 9, MX0 + 10, MX0 + 11]) mount(b, 'payphone', x, M0, 'n', {});
  mount(b, 'su_map', MX0 + 13, M0, 'n', {});
  mount(b, 'su_advert', MX0 + 1, M0, 'n', { v: 5 });
  put(c, 'su_bench', MX0 + 6, M1, 2, {});
  put(c, 'su_bench', MX0 + 12, M1, 2, {});
  put(c, 'trash_can', MX0 + 9, M1, 0, {});
  put(c, 'newspaper_box', MX0 + 16, M1, 2, {});
  put(c, 'newspaper_box', MX0 + 17, M1, 2, {});
  f.floorItem('note', GATE_X - 3, M0 + 4, { lore: 'su_booth_log' });
  // the paid side
  for (let x = GATE_X + 8; x <= MX1 - 2; x += 14) {
    mount(b, 'su_advert', x, M0, 'n', { v: Math.floor(hh(x, 7, 9742) * 8) });
    mount(b, 'su_advert', x + 3, M0, 'n', { v: Math.floor(hh(x, 8, 9743) * 8) });
  }
  mount(b, 'su_map', 80, M0, 'n', {});
  mount(b, 'su_map', 110, M0, 'n', {});
  for (const x of [84, 86, 88]) mount(b, 'payphone', x, M0, 'n', {});
  for (let x = GATE_X + 5; x <= MX1 - 3; x += 9) {
    if (SOUTH_STAIRS.some((s) => x + 1 >= s - 1 && x <= s + 4) || NORTH_STAIRS.some((s) => x + 1 >= s - 1 && x <= s + 4)) continue;
    put(c, 'su_bench', x, 29, 2, {}); put(c, 'su_bench', x, 30, 0, {});
  }
  for (const [x, k] of [[GATE_X + 2, 'vending_soda'], [GATE_X + 3, 'vending_snack'], [MX1 - 1, 'vending_soda'], [MX1 - 2, 'vending_snack'], [99, 'vending_snack']] as const) put(c, k, x, M1, 2, {});
  put(c, 'photo_booth', MX1 - 5, M1, 2, {});
  put(c, 'gumball_machine', GATE_X + 5, M1, 2, {});
  put(c, 'trash_can', 92, M1, 0, {});
  for (const x of [GATE_X + 20, 100]) b.obj('zw_station_clock', x, M0 + 5, 0, {});
  for (const x of [MX0 + 20, 90]) mount(b, 'su_speaker', x, M0, 'n', {});
  // stair heads: signs and plates
  for (const sx of NORTH_STAIRS) b.obj('zw_platform_sign', sx + 1, M0 + 1, 0, { label: 'PLATFORM 1' });
  for (const sx of SOUTH_STAIRS) b.obj('zw_platform_sign', sx + 1, M1 - 1, 0, { label: 'PLATFORM 2' });
  // gum and footprints on the lino, the worn path between the stairs and the gates
  for (let y = M0; y <= M1; y++) for (let x = MX0; x <= MX1; x++) {
    const r = hh(x, y, 9744);
    if (r < 0.035) decal(z, 'su_gum', x + 0.5, y + 0.5, 1, 1, r * 90, undefined, 0.8);
    else if (r < 0.05) decal(z, 'decal_footprints', x + 0.5, y + 0.5, 1, 1, r * 600, undefined, 0.6);
  }
}

// ============================================================ a dead car on the siding
function deadCar(c: Ctx, x0: number, x1: number, ci: number) {
  const { b, z } = c;
  const len = x1 - x0 + 1;
  // the platform-side face of the car: the outside paper is on the platform edge tiles
  b.paper(x0, P10, x1, P10, 'su_wall_car_ext');
  // doors (two-leaf, two tiles) and windows on the platform side; windows on the far side
  const doors = [2, 3, 6, 7, 10, 11];
  for (let i = 0; i < len; i++) {
    const x = x0 + i;
    if (doors.includes(i)) b.door(x, P10, 0, 'door_glass', { open: !(ci === 2 && i >= 10) });
    else b.window(x, P10, 0, { curtains: 'none' });
    if (i % 2 === 1) b.window(x, CAR_Y0, 0, { curtains: 'none' });
  }
  // the gangways between the cars
  if (ci > 0) b.arch(x0, CAR_Y0 + 1, 1);
  mount(b, 'su_car_end', x0, CAR_Y0 + 1, 'w', {});
  // seats along both sides, poles down the middle
  for (let i = 0; i + 1 < len; i += 2) put(c, 'su_car_seat', x0 + i, CAR_Y0, 0, {});
  for (const i of [0, 4, 8]) if (i + 1 < len) put(c, 'su_car_seat', x0 + i, CAR_Y1, 2, {});
  for (const i of [2, 6, 10]) b.obj('su_grab_pole', x0 + i, CAR_Y0 + 1, 0, {});
  // one tube still on per car, the others dead or flickering
  b.obj('su_tube', x0 + 3, CAR_Y0 + 1, 0, { circuit: C_CAR, flicker: 0.12 });
  b.obj('su_tube', x0 + 9, CAR_Y0 + 1, 0, { circuit: C_CAR, flicker: ci === 1 ? 0.45 : 0, broken: ci === 2 });
  // what was left on the last train
  const r = c.rng;
  for (let k = 0; k < 3; k++) {
    const x = x0 + r.int(0, len - 1), y = CAR_Y0 + 1;
    if (isOpen(z, x, y)) c.f.floorLoot('su_train', x, y);
  }
  if (ci === 1) c.f.floorItem('note', x0 + 5, CAR_Y0 + 1, { lore: 'su_car_notice' });
  for (let k = 0; k < 6; k++) decal(z, r.pick(['decal_stain_water', 'decal_footprints', 'su_gum']), x0 + r.float(0.5, len - 0.5), CAR_Y0 + r.float(0.3, 2.7), 1, 1, r.float(0, 6), undefined, 0.6);
}

// ============================================================ the signal room
function signalRoom(c: Ctx, r: { x0: number; y0: number; x1: number; y1: number }) {
  const { b, f } = c;
  // the staff door from Platform 2
  b.door(PX0, 43, 1, 'door_metal', { sign: 'staff', open: false });
  mount(b, 'su_signal', PX0 - 1, 43, 'n', { circuit: C_STAFF, g: 1 });
  // the door into the signal room from the passage
  // the cable passage out to the west loop tunnel (a door straight onto the ring)
  b.door(r.x0, 44, 1, 'door_metal', { sign: 'danger', open: false });
  lamp(b, 9, 44, 'emergency', C_TUN, { intensity: 0.5, radius: 4 });
  // the way through to the Service Tunnels: a steel door in the room's north wall
  const dx = r.x0 + 4;
  b.door(dx, r.y0, 0, 'door_metal', { portal: 'r_tunnels_subway', sign: 'maintenance' });
  b.portal({ id: 'r_tunnels_subway', x: dx, y: r.y0, kind: 'door', to: 'tunnels', tx: 139, ty: 70, label: 'Go through to the Service Tunnels' });
  arrive(b, 'p_tunnels_subway', dx, r.y0 + 2, 's', 2);
  // the lever frame, the diagram, the desk, lockers
  put(c, 'electrical_cabinet', r.x0 + 1, r.y0, 0, {});
  put(c, 'electrical_cabinet', r.x0 + 2, r.y0, 0, {});
  for (let x = r.x0 + 7; x <= r.x1 - 1; x++) put(c, 'cctv_monitors', x, r.y0, 0, {});
  const d = put(c, 'desk_office', r.x0 + 8, r.y0 + 3, 0, {});
  if (d) f.onTop('computer', d, { lore: 'su_signal_log' });
  put(c, 'chair_office', r.x0 + 8, r.y0 + 4, 2, {});
  put(c, 'radio_console', r.x1, r.y1, 1, {});
  for (const y of [r.y0 + 2, r.y0 + 3]) put(c, 'locker', r.x0, y, 1, { loot: 'su_staff' });
  put(c, 'filing_cabinet', r.x1, r.y0 + 1, 1, {});
  put(c, 'first_aid_wall', r.x0 + 3, r.y0, 0, {});
  mount(b, 'su_map', r.x0 + 5, r.y0, 'n', {});
  mount(b, 'noticeboard', r.x1 - 2, r.y0, 'n', { lore: 'su_rules' });
  f.floorItem('note', r.x0 + 6, r.y1 - 1, { lore: 'su_signal_log' });
  lamp(b, r.x0 + 3, r.y0 + 3, 'fluoro', C_STAFF, { flicker: 0.05 });
  lamp(b, r.x0 + 9, r.y0 + 3, 'fluoro', C_STAFF);
  lamp(b, PX0 - 1, 43, 'fluoro', C_STAFF, { flicker: 0.2, intensity: 0.5 });
}

defZone({
  key: 'subway', name: 'Westgate Station — The Inner Loop', W, H, depth: 3,
  blurb: 'Cream tile, a name in mosaic, the hum of the tubes. The board says the next train is due. Something in the tunnel has been due for thirty years.',
  gen: (z, s) => { generateSubway(z, s); },
});
