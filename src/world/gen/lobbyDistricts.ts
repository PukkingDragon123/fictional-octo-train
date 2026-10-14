// Level 0 districts: large set pieces carved into the yellow maze so the
// Lobby has places you remember and talk about, not just noise.
//  - The Endless Hallway: a long office corridor that silently loops
//  - The Pillar Hall: an oversized hall of square pillars
//  - The Warren: a farm of half-height cubicles
//  - The Blackout: a sector where the lights died, lit only by emergency lamps
//  - Rooms that rearrange themselves while nobody is looking
import { Zone, TF } from '../zone';
import { ZoneBuilder } from './builder';
import { Furnisher } from './furnish';
import { Rng } from '../../core/rng';
import { registerShift } from '../shift';

interface Rect { x0: number; y0: number; x1: number; y1: number }

const HALL_L = 128, HALL_H = 15;
/** Called before the landmarks: claims a strip along one edge of the zone for the Endless Hallway. */
export function reserveLobbyDistricts(z: Zone, rng: Rng) {
  const T = rng.chance(0.5), far = rng.chance(0.5);
  const span = T ? z.H : z.W, depth = T ? z.W : z.H;
  const u0 = rng.int(4, span - HALL_L - 5), v0 = far ? depth - 5 - HALL_H : 4;
  const r: Rect = T ? { x0: v0, y0: u0, x1: v0 + HALL_H - 1, y1: u0 + HALL_L - 1 } : { x0: u0, y0: v0, x1: u0 + HALL_L - 1, y1: v0 + HALL_H - 1 };
  z.meta.hallSite = { ...r, T, far };
  z.meta.reserved = [r];
}

export function lobbyDistricts(z: Zone, b: ZoneBuilder, rng: Rng) {
  const f = new Furnisher(b, rng);
  const taken: Rect[] = [];
  const sealed: Rect[] = (z.meta.sealed = []); // set pieces the connectivity pass must not cut into
  const cx = Math.floor(z.W / 2), cy = Math.floor(z.H / 2);
  taken.push({ x0: cx - 12, y0: cy - 12, x1: cx + 12, y1: cy + 12 });
  for (const l of (z.meta.landmarks as { x: number; y: number }[]) || []) taken.push({ x0: l.x - 3, y0: l.y - 3, x1: l.x + 13, y1: l.y + 13 });
  const overlaps = (r: Rect) => taken.some((t) => r.x0 <= t.x1 + 2 && r.x1 >= t.x0 - 2 && r.y0 <= t.y1 + 2 && r.y1 >= t.y0 - 2);
  const site = (w: number, h: number): Rect | null => {
    for (let t = 0; t < 400; t++) {
      const x0 = rng.int(3, z.W - w - 4), y0 = rng.int(3, z.H - h - 4);
      const r = { x0, y0, x1: x0 + w - 1, y1: y0 + h - 1 };
      if (overlaps(r)) continue;
      taken.push(r);
      return r;
    }
    return null;
  };
  const carve = (r: Rect, paper: string, floor = 'carpet_yellow') => {
    b.clearObjects(r.x0, r.y0, r.x1, r.y1);
    z.lights = z.lights.filter((l) => !(l.x >= r.x0 && l.x < r.x1 + 1 && l.z >= r.y0 && l.z < r.y1 + 1));
    b.clearWallsIn(r.x0, r.y0, r.x1, r.y1);
    b.fillFloor(r.x0, r.y0, r.x1, r.y1, floor);
    b.paper(r.x0, r.y0, r.x1, r.y1, paper);
  };
  const lamp = (x: number, y: number, o: Record<string, any> = {}) => b.obj('light_fluoro', x, y, 0, { circuit: 1 + Math.floor(x / 16) + Math.floor(y / 16) * 16, ...o });
  /** open the rect's outer wall at a few places so the maze connects */
  const openings = (r: Rect, n: number, width = 2) => {
    for (let k = 0; k < n; k++) {
      const side = rng.int(0, 3);
      for (let w = 0; w < width; w++) {
        if (side === 0) b.clearN(Math.min(r.x1, rng.int(r.x0 + 2, r.x1 - 2) + w), r.y0);
        else if (side === 1) b.clearN(Math.min(r.x1, rng.int(r.x0 + 2, r.x1 - 2) + w), r.y1 + 1);
        else if (side === 2) b.clearW(r.x0, Math.min(r.y1, rng.int(r.y0 + 2, r.y1 - 2) + w));
        else b.clearW(r.x1 + 1, Math.min(r.y1, rng.int(r.y0 + 2, r.y1 - 2) + w));
      }
    }
  };

  // ---------------------------------------------------------------- 1. the endless hallway
  // Laid out in (u, v) = (along, across) coordinates so it can run east-west or north-south,
  // whichever fits between the landmarks. Loop period is 64 tiles = 8 identical offices.
  {
    const Hh = HALL_H;
    let r: Rect | null = null, T = false, L = 0;
    const pre = z.meta.hallSite as (Rect & { T: boolean; far: boolean }) | undefined;
    const exitNear = !!pre?.far; // the back door must face into the maze, not the zone edge
    if (pre) { r = { x0: pre.x0, y0: pre.y0, x1: pre.x1, y1: pre.y1 }; T = pre.T; L = HALL_L; taken.push(r); }
    else for (const [len, vert] of [[128, false], [128, true], [112, false], [112, true], [104, false], [104, true]] as [number, boolean][]) {
      r = vert ? site(Hh, len) : site(len, Hh);
      if (r) { T = vert; L = len; break; }
    }
    delete z.meta.hallSite; delete z.meta.reserved;
    if (r) {
      const P = (u: number, v: number): [number, number] => (T ? [v, u] : [u, v]);
      const R = (u0: number, v0: number, u1: number, v1: number): [number, number, number, number] => (T ? [v0, u0, v1, u1] : [u0, v0, u1, v1]);
      const hw = (u0: number, u1: number, v: number) => (T ? b.vwall(v, u0, u1) : b.hwall(u0, u1, v));
      const vw = (u: number, v0: number, v1: number) => (T ? b.hwall(v0, v1, u) : b.vwall(u, v0, v1));
      const door = (u: number, v: number, open: boolean) => b.door(...P(u, v), (T ? 1 : 0) as 0 | 1, 'door_office', { open });
      const put = (key: string, u: number, v: number, rot: 0 | 1 | 2 | 3) => f.place(key, ...P(u, v), (T ? 3 - rot : rot) as 0 | 1 | 2 | 3);
      const u0 = T ? r.y0 : r.x0, v0 = T ? r.x0 : r.y0, v1 = T ? r.x1 : r.y1;
      carve(r, 'wall_yellow_b');
      b.roomWalls(r.x0, r.y0, r.x1, r.y1);
      sealed.push(r);
      const c0 = v0 + 6; // corridor rows c0..c0+2
      b.addRoom('The Endless Hallway', 'hallway', ...R(u0, c0, u0 + L - 1, c0 + 2), { circuit: 0 });
      hw(u0, u0 + L - 1, c0);
      hw(u0, u0 + L - 1, c0 + 3);
      b.fillFloor(...R(u0, c0, u0 + L - 1, c0 + 2), 'carpet_office');
      // offices every 8 tiles on both sides, identical so the loop is invisible
      for (let k = 0; k < L / 8; k++) {
        const ou = u0 + k * 8;
        if (k > 0) { vw(ou, v0, c0 - 1); vw(ou, c0 + 3, v1); }
        door(ou + 3, c0, false);
        door(ou + 4, c0 + 3, false);
        b.addRoom('Office', 'office', ...R(ou + (k ? 1 : 0), v0, ou + 7, c0 - 1));
        b.addRoom('Office', 'office', ...R(ou + (k ? 1 : 0), c0 + 3, ou + 7, v1));
        // corridor lights + the same few props in every office
        lamp(...P(ou + 2, c0 + 1), { flicker: k % 5 === 2 ? 0.25 : 0 });
        lamp(...P(ou + 6, c0 + 1));
        const desk = put('desk_office', ou + 3, v0 + 1, 2); if (desk) f.onTop('computer', desk);
        put('chair_office', ou + 3, v0 + 2, 0);
        put('filing_cabinet', ou + 6, v0 + 1, 2);
        const desk2 = put('desk_office', ou + 4, v1 - 1, 0); if (desk2) f.onTop('computer', desk2);
        put('chair_office', ou + 4, v1 - 2, 2);
        put('plant_potted', ou + 1 + (k ? 0 : 1), v1 - 1, 0);
        lamp(...P(ou + 4, v0 + 3)); lamp(...P(ou + 4, v1 - 3));
      }
      // the corridor loops: walking past either portal puts you 64 tiles back
      const m = Math.floor((L - 68) / 2), wU = u0 + m, eU = wU + 67;
      for (let row = 0; row < 3; row++) {
        const [wx, wy] = P(wU, c0 + row), [ex2, ey2] = P(eU, c0 + row);
        b.portal({ id: `loop_hall_w${row}`, x: wx, y: wy, kind: 'loop', to: z.key, tx: 0, ty: 0, loopDx: T ? 0 : 64, loopDy: T ? 64 : 0 });
        b.portal({ id: `loop_hall_e${row}`, x: ex2, y: ey2, kind: 'loop', to: z.key, tx: 0, ty: 0, loopDx: T ? 0 : -64, loopDy: T ? -64 : 0 });
      }
      // the one way in and out: an office inside the loop has a back door
      const kx = Math.floor((m + 26) / 8), exU = u0 + kx * 8 + 5;
      if (exitNear) { door(exU, v0, true); b.clearObjects(...R(exU, v0, exU, v0 + 1)); }
      else { door(exU, v1 + 1, true); b.clearObjects(...R(exU, v1 - 1, exU, v1)); }
      f.floorItem('note', ...P(exU, c0 + 1), { lore: 'note_generic' });
      z.meta.hallway = P(exU, exitNear ? v0 : v1);
    }
  }

  // ---------------------------------------------------------------- 2. the pillar hall
  {
    const r = site(34, 26);
    if (r) {
      carve(r, 'wall_yellow_c');
      b.roomWalls(r.x0, r.y0, r.x1, r.y1);
      openings(r, 5, 3);
      b.addRoom('The Pillar Hall', 'atrium', r.x0, r.y0, r.x1, r.y1);
      for (let y = r.y0 + 3; y <= r.y1 - 3; y += 5) for (let x = r.x0 + 3; x <= r.x1 - 3; x += 5) {
        b.roomWalls(x, y, x + 1, y + 1);
        for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) { z.floor[z.idx(x + i, y + j)] = 0; z.flags[z.idx(x + i, y + j)] |= TF.NOSPAWN; }
      }
      for (let y = r.y0 + 1; y <= r.y1 - 1; y += 3) for (let x = r.x0 + 1; x <= r.x1 - 1; x += 3) if (z.floor[z.idx(x, y)]) lamp(x, y, { broken: rng.chance(0.08), flicker: rng.chance(0.06) ? 0.2 : 0 });
      for (let i = 0; i < 18; i++) f.decal(rng.chance(0.6) ? 'decal_puddle' : 'decal_stain_water', rng.int(r.x0, r.x1), rng.int(r.y0, r.y1), rng.float(1, 2.4), rng.float(1, 2.4));
      f.anywhere('chair_office', r.x0 + 10, r.y0 + 10, r.x1 - 10, r.y1 - 10);
    }
  }

  // ---------------------------------------------------------------- 3. the warren (cubicle farm)
  {
    const r = site(31, 25);
    if (r) {
      carve(r, 'wall_office', 'carpet_office');
      b.roomWalls(r.x0, r.y0, r.x1, r.y1);
      openings(r, 4, 2);
      b.addRoom('The Warren', 'cubicles', r.x0, r.y0, r.x1, r.y1, { circuit: 200 });
      z.power.set(200, true);
      for (let y = r.y0 + 2; y + 2 <= r.y1 - 1; y += 4) for (let x = r.x0 + 2; x + 2 <= r.x1 - 1; x += 4) {
        // a 3x3 cubicle open on its south side
        b.hwall(x, x + 2, y, 'cubicle');
        b.vwall(x, y, y + 2, 'cubicle');
        b.vwall(x + 3, y, y + 2, 'cubicle');
        const d = f.place('desk_office', x + 1, y, 2); if (d && rng.chance(0.8)) f.onTop('computer', d);
        f.place('chair_office', x + 1, y + 1, rng.int(0, 3) as any);
        if (rng.chance(0.3)) f.place('plant_potted', x + 2, y, 0);
      }
      for (let y = r.y0 + 2; y <= r.y1 - 1; y += 4) for (let x = r.x0 + 2; x <= r.x1 - 1; x += 4) lamp(x + 1, y + 1, { circuit: 200, flicker: rng.chance(0.15) ? 0.3 : 0 });
      f.floorItem('note', r.x0 + 6, r.y0 + 3, { lore: 'terminal_mail_1' });
    }
  }

  // ---------------------------------------------------------------- 4. the blackout
  {
    const r = site(28, 28) || site(22, 22) || site(16, 16);
    if (r) {
      for (const l of z.lights) if (l.x >= r.x0 && l.x < r.x1 + 1 && l.z >= r.y0 && l.z < r.y1 + 1) l.broken = true;
      for (let i = 0; i < 3; i++) {
        const x = rng.int(r.x0 + 3, r.x1 - 3), y = rng.int(r.y0 + 3, r.y1 - 3);
        b.light(x + 0.5, y + 0.5, 'emergency', { circuit: 0, flicker: 0.05 });
      }
      for (let i = 0; i < 6; i++) f.anywhere(rng.chance(0.5) ? 'cardboard_box' : 'chair_office', r.x0, r.y0, r.x1, r.y1);
      for (let i = 0; i < 10; i++) f.decal('decal_footprints', rng.int(r.x0, r.x1), rng.int(r.y0, r.y1), 1, 1);
      z.meta.blackout = [r.x0, r.y0, r.x1, r.y1];
    }
  }

  // ---------------------------------------------------------------- 5. rooms that rearrange
  for (let k = 0; k < 4; k++) {
    const r = site(10, 10);
    if (!r) continue;
    carve(r, rng.pick(['wall_yellow', 'wall_yellow_d']));
    b.roomWalls(r.x0, r.y0, r.x1, r.y1);
    sealed.push(r);
    b.gap(r.x0 + 4, r.y0, 0); b.gap(r.x0 + 5, r.y0, 0);
    b.gap(r.x1 + 1, r.y0 + 5, 1);
    b.addRoom('A Room', 'shifting', r.x0, r.y0, r.x1, r.y1);
    registerShift(z, `lobby_room_${k}`, r.x0, r.y0, r.x1, r.y1, 4, (bb, rr, v, reg) => {
      const ff = new Furnisher(bb, rr);
      const { x0, y0, x1, y1 } = reg;
      const lampAt = (x: number, y: number) => bb.obj('light_fluoro', x, y, 0, { circuit: 1 + Math.floor(x / 16) + Math.floor(y / 16) * 16, flicker: rr.chance(0.2) ? 0.2 : 0 });
      if (v === 0) { // empty, one chair in the middle
        ff.place('chair_office', x0 + 5, y0 + 5, 0);
        lampAt(x0 + 5, y0 + 5);
      } else if (v === 1) { // four small rooms that should not fit
        bb.vwall(x0 + 5, y0 + 1, y1 - 1); bb.hwall(x0 + 1, x1 - 1, y0 + 5);
        bb.door(x0 + 5, y0 + 2, 1, 'door_office'); bb.door(x0 + 5, y0 + 7, 1, 'door_office');
        bb.door(x0 + 2, y0 + 5, 0, 'door_office'); bb.door(x0 + 7, y0 + 5, 0, 'door_office');
        for (const [lx, ly] of [[2, 2], [7, 2], [2, 7], [7, 7]]) lampAt(x0 + lx, y0 + ly);
      } else if (v === 2) { // rows of chairs facing the wall
        for (let y = y0 + 2; y <= y1 - 1; y += 2) for (let x = x0 + 1; x <= x1 - 1; x += 2) ff.place(ff.has('chair_folding') ? 'chair_folding' : 'chair_office', x, y, 0);
        lampAt(x0 + 3, y0 + 3); lampAt(x0 + 7, y0 + 7);
      } else { // a door standing in the middle of the room, leading nowhere
        ff.place('door_freestanding', x0 + 5, y0 + 4, 0);
        for (let i = 0; i < 4; i++) ff.decal('decal_stain_dark', x0 + rr.int(1, 8), y0 + rr.int(1, 8), 1.2, 1.2);
        lampAt(x0 + 2, y0 + 7);
      }
    });
  }
  z.meta.shiftRate = 1;
}
