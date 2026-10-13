import { Zone, TF } from '../zone';
import { ZoneBuilder } from './builder';
import { Rng } from '../../core/rng';

/**
 * Level 0 — "The Lobby". Irregular office-like maze produced by recursive
 * division with generous gaps, then roughened: random wall removal, free
 * standing wall stubs, pillars and wide halls. Handcrafted landmark rooms are
 * stamped on top by the world script.
 */
export function generateLobby(z: Zone, seed: number) {
  const rng = new Rng(seed);
  const b = new ZoneBuilder(z, rng);
  const W = z.W, H = z.H;
  z.name = 'Level 0 — The Lobby';
  b.fillFloor(1, 1, W - 2, H - 2, 'carpet_yellow');
  b.paper(0, 0, W - 1, H - 1, 'wall_yellow');
  // floor variations
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const r = rng.next();
    b.floorVar(x, y, r < 0.08 ? 1 : r < 0.13 ? 2 : 0);
  }
  b.boundary('drywall');

  // recursive division with gaps
  const divide = (x0: number, y0: number, x1: number, y1: number, depth: number) => {
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    const minS = 3;
    if (w < minS * 2 + 1 && h < minS * 2 + 1) return;
    // occasionally leave large open halls
    if (depth > 2 && w * h < 220 && rng.chance(0.18)) return;
    if (depth > 3 && w * h < 90 && rng.chance(0.35)) return;
    const vertical = w > h ? true : h > w ? false : rng.chance(0.5);
    if (vertical && w >= minS * 2 + 1) {
      const sx = rng.int(x0 + minS, x1 - minS + 1);
      // the wall may stop short (irregular rooms)
      let ya = y0, yb = y1;
      if (rng.chance(0.25)) { if (rng.chance(0.5)) ya += rng.int(1, Math.max(1, Math.floor(h / 3))); else yb -= rng.int(1, Math.max(1, Math.floor(h / 3))); }
      b.vwall(sx, ya, yb);
      const gaps = 1 + Math.floor(h / 7) + (rng.chance(0.4) ? 1 : 0);
      for (let g = 0; g < gaps; g++) {
        const gy = rng.int(ya, yb); const gw = rng.weighted([[1, 5], [2, 3], [3, 1]]);
        for (let k = 0; k < gw; k++) b.clearW(sx, Math.min(yb, gy + k));
      }
      divide(x0, y0, sx - 1, y1, depth + 1);
      divide(sx, y0, x1, y1, depth + 1);
    } else if (h >= minS * 2 + 1) {
      const sy = rng.int(y0 + minS, y1 - minS + 1);
      let xa = x0, xb = x1;
      if (rng.chance(0.25)) { if (rng.chance(0.5)) xa += rng.int(1, Math.max(1, Math.floor(w / 3))); else xb -= rng.int(1, Math.max(1, Math.floor(w / 3))); }
      b.hwall(xa, xb, sy);
      const gaps = 1 + Math.floor(w / 7) + (rng.chance(0.4) ? 1 : 0);
      for (let g = 0; g < gaps; g++) {
        const gx = rng.int(xa, xb); const gw = rng.weighted([[1, 5], [2, 3], [3, 1]]);
        for (let k = 0; k < gw; k++) b.clearN(Math.min(xb, gx + k), sy);
      }
      divide(x0, y0, x1, sy - 1, depth + 1);
      divide(x0, sy, x1, y1, depth + 1);
    }
  };
  divide(2, 2, W - 3, H - 3, 0);

  // roughen: knock out random wall pieces, add stubs and pillars
  for (let i = 0; i < W * H * 0.012; i++) {
    const x = rng.int(2, W - 3), y = rng.int(2, H - 3);
    if (rng.chance(0.5)) b.clearN(x, y); else b.clearW(x, y);
  }
  for (let i = 0; i < W * H * 0.004; i++) {
    const x = rng.int(3, W - 4), y = rng.int(3, H - 4);
    const len = rng.int(1, 4);
    if (rng.chance(0.5)) b.hwall(x, x + len, y); else b.vwall(x, y, y + len);
  }
  // pillars: tiny closed 1x1 wall boxes in open areas
  for (let i = 0; i < W * H * 0.003; i++) {
    const x = rng.int(3, W - 4), y = rng.int(3, H - 4);
    b.roomWalls(x, y, x, y);
    z.flags[z.idx(x, y)] |= TF.NOSPAWN;
    // keep pillars solid: mark tile as non-walkable via void floor
    z.floor[z.idx(x, y)] = 0;
  }

  // lights: fluorescent panels on a 3x3 grid with dead and flickering sectors
  const sectorSize = 16;
  const sectors = new Map<string, { dead: boolean; flicker: number }>();
  for (let y = 2; y < H - 2; y += 3) for (let x = 2; x < W - 2; x += 3) {
    const sk = Math.floor(x / sectorSize) + ',' + Math.floor(y / sectorSize);
    let s = sectors.get(sk);
    if (!s) { s = { dead: rng.chance(0.12), flicker: rng.chance(0.2) ? rng.float(0.05, 0.25) : 0 }; sectors.set(sk, s); }
    if (!z.floor[z.idx(x, y)]) continue;
    const broken = s.dead ? rng.chance(0.85) : rng.chance(0.06);
    const fl = broken ? 0 : (s.flicker > 0 ? (rng.chance(0.4) ? s.flicker : 0) : rng.chance(0.03) ? 0.15 : 0);
    b.obj('light_fluoro', x, y, 0, { broken, flicker: fl });
  }
  z.env = {
    ...z.env,
    ambient: 0x3a3420, ambientI: 0.55, fog: 0x2b2512, fogNear: 13, fogFar: 27, void: 0x070603, temp: 22,
    grade: 'lobby', reverb: 'office', ambience: 'hum',
  };
  return b;
}
