// Level 0 — the wrong rooms, and two new ways out. Carved into the yellow
// maze after the landmarks and districts, well away from where you wake:
// the Underpass (stairs down to Interchange 0, the Depot), a hole into the
// dark (down to the Undercroft), and a scatter of rooms that are wrong in one
// specific way each.
import { Zone, TF } from '../zone';
import { ZoneBuilder } from './builder';
import { Rng, hash3 } from '../../core/rng';
import { stampRoom } from './lobbyRooms';
import { carveWrong, type WrongKind, type WRect, WRONG_SIZE } from './wrong_kit';
import { arrive, mount, decal } from './weird_kit';

export function lobbyWrongRooms(z: Zone, b: ZoneBuilder, seed: number) {
  const rng = new Rng(hash3(seed, 0x3a77, 11));
  const cx = Math.floor(z.W / 2), cy = Math.floor(z.H / 2);
  const taken: WRect[] = [];
  const sealed: WRect[] = (z.meta.sealed ||= []);
  const lamp = (x: number, y: number) => b.obj('light_fluoro', x, y, 0, { circuit: 1 + Math.floor(x / 16) + Math.floor(y / 16) * 16, flicker: rng.chance(0.25) ? 0.2 : 0 });
  void lamp;
  const ok = (r: WRect) => {
    if (r.x0 < 4 || r.y0 < 4 || r.x1 > z.W - 5 || r.y1 > z.H - 5) return false;
    if (Math.max(Math.abs((r.x0 + r.x1) / 2 - cx), Math.abs((r.y0 + r.y1) / 2 - cy)) < 16) return false;
    if (taken.some((t) => r.x0 <= t.x1 + 4 && r.x1 >= t.x0 - 4 && r.y0 <= t.y1 + 4 && r.y1 >= t.y0 - 4)) return false;
    for (let y = r.y0 - 1; y <= r.y1 + 1; y++) for (let x = r.x0 - 1; x <= r.x1 + 1; x++) {
      const i = z.idx(x, y);
      if (z.room[i] !== 0 || (z.flags[i] & TF.SHIFT)) return false;
    }
    if (z.portals.some((p) => p.x >= r.x0 - 3 && p.x <= r.x1 + 3 && p.y >= r.y0 - 3 && p.y <= r.y1 + 3)) return false;
    const anchors = Object.values(z.meta.anchors || {}) as number[][];
    if (anchors.some((a) => Array.isArray(a) && a[0] >= r.x0 - 3 && a[0] <= r.x1 + 3 && a[1] >= r.y0 - 3 && a[1] <= r.y1 + 3)) return false;
    return true;
  };
  const site = (w: number, h: number, minD = 18, maxD = 76): WRect | null => {
    for (let t = 0; t < 600; t++) {
      const a = rng.float(0, Math.PI * 2), d = rng.float(minD, maxD);
      const x0 = Math.floor(cx + Math.cos(a) * d - w / 2), y0 = Math.floor(cy + Math.sin(a) * d - h / 2);
      const r = { x0, y0, x1: x0 + w - 1, y1: y0 + h - 1 };
      if (ok(r)) { taken.push(r); return r; }
    }
    return null;
  };

  // ---------------------------------------------------------------- the Underpass: stairs down to the Depot
  {
    const r = site(7, 6, 24, 60);
    if (r) {
      stampRoom(b, r.x0, r.y0, r.x1, r.y1, { name: 'Underpass', type: 'underpass', wall: 'cinder', floor: 'concrete', paper: 'zw_wall_depot', arches: 2, circuit: 0 });
      z.lights = z.lights.filter((l) => !(l.x >= r.x0 && l.x < r.x1 + 1 && l.z >= r.y0 && l.z < r.y1 + 1));
      const sx = r.x0 + 3, sy = r.y0;
      b.clearObjects(sx, sy, sx, sy + 1);
      b.obj('staircase_down', sx, sy, 0, { portal: 'p_lobby_depot' });
      b.portal({ id: 'p_lobby_depot', x: sx, y: sy, kind: 'stairs_down', to: 'depot', tx: 60, ty: 50, label: 'Go down to the trains' });
      arrive(b, 'r_lobby_depot', sx, sy + 3, 's', 3);
      b.obj('zw_platform_sign', sx - 1, sy + 2, 0, { label: 'DEPARTURES' });
      mount(b, 'zw_plate', r.x0 + 1, r.y0, 'n', { label: 'THIS WAY' });
      mount(b, 'zw_timetable', r.x1, r.y0, 'n');
      b.light(sx + 0.5, sy + 2.5, 'sodium', { circuit: 0, intensity: 0.8, radius: 5, y: 2.6, flicker: 0.05 });
      b.obj('light_fluoro', r.x0 + 1, r.y1 - 1, 0, { circuit: 0, flicker: 0.3 });
      for (let i = 0; i < 4; i++) decal(z, 'zw_tactile', sx + 0.5, sy + 2.2 + i * 0.01, 1.0, 0.5, 0, undefined, 1);
      b.obj('zw_luggage_pile', r.x1, r.y1, 0, { v: 1 });
      sealed.push(r);
      z.meta.underpass = [sx, sy];
    }
  }

  // ---------------------------------------------------------------- a hole into the dark: down to the Undercroft
  {
    const r = site(9, 7, 26, 66);
    if (r) {
      carveWrong(z, b, rng, 'dark_hole', r, { circuit: 0, paper: 'wall_yellow', floor: 'carpet_yellow', openings: 2, hole: { portal: 'p_lobby_under', to: 'undercroft', label: 'Drop into the dark', anchor: 'r_lobby_under' } });
      sealed.push(r);
    }
  }

  // ---------------------------------------------------------------- the wrong rooms
  const plan: [WrongKind, number, number, Partial<{ sides: ('s' | 'e' | 'w')[]; openings: number; floor: string; paper: string }>][] = [
    ['high_door', 7, 6, {}], ['ceiling_stairs', 6, 6, {}], ['chairs_corner', 8, 7, {}], ['narrowing', 14, 3, { sides: ['w'], openings: 1 }],
    ['tiny_door', 5, 5, {}], ['same_thrice', 18, 5, { sides: ['w', 'e'] }], ['upside_down', 8, 6, {}], ['sideways_bath', 6, 4, { floor: 'tile_white', paper: 'wall_bathroom' }],
    ['phones', 8, 6, { floor: 'carpet_office', paper: 'wall_office' }], ['wet', 8, 6, {}], ['bed_still', 5, 5, {}],
    ['poster_corridor', 16, 3, { sides: ['w', 'e'], openings: 2 }], ['tv_backs', 7, 6, {}], ['loop_stairs', 6, 7, {}],
  ];
  let n = 0;
  for (const [kind, w, h, o] of plan) {
    const [mw, mh] = WRONG_SIZE[kind];
    const r = site(Math.max(w, mw), Math.max(h, mh));
    if (!r) continue;
    carveWrong(z, b, rng, kind, r, { circuit: 1 + Math.floor(r.x0 / 16) + Math.floor(r.y0 / 16) * 16, paper: o.paper || 'wall_yellow', floor: o.floor, openings: o.openings ?? 2, sides: o.sides, id: 'lobby_loop_stairs' });
    // set pieces whose shape is the point stay sealed (connectivity repair may not cut into them)
    if (kind === 'narrowing' || kind === 'poster_corridor' || kind === 'loop_stairs' || kind === 'same_thrice') sealed.push(r);
    n++;
  }
  z.meta.wrongRooms = n;
}
