// The Moon (96×96, outdoor): grey dust under a black sky, a hard white sun,
// craters with sharp rims, and long cracks you can see straight through:
// the Earth is down there, under the ground, too close and the wrong way up
// (src/social/dims.ts hangs it). Everything is light; every step is a bound
// (low gravity, src/social/dims.ts). The Institute landed a debtor here to
// plant a flag. The lander is still here. So is his jumpsuit. Moon wisps
// drift over the mare and something thin and tall walks the big crater's rim.
import { defZone } from '../worldGraph';
import { Zone, TF } from '../zone';
import { ZoneBuilder } from './builder';
import { Furnisher } from './furnish';
import { Rng } from '../../core/rng';
import { type Ctx, force, put, isOpen, arrive } from './mall_kit';
import { pit, landing, findOpenRect } from './void_kit';
import { hh } from './weird_kit';
import { deeperFloor } from './z_floors';

const W = 96, H = 96;

export function generateMoon(z: Zone, seed: number) {
  const rng = new Rng(seed);
  const b = new ZoneBuilder(z, rng);
  const f = new Furnisher(b, rng);
  const c: Ctx = { z, b, f, rng, seed };
  z.name = 'The Moon';
  const cx = W / 2, cy = H / 2;

  // ---- a plate of grey dust with a ragged edge, dark mare in the low ground
  const hgt = new Float32Array(W * H);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const a = Math.atan2(y - cy, x - cx), d = Math.hypot(x - cx, y - cy);
    const edge = 43 + Math.sin(a * 5 + 0.4) * 2.5 + (hh(Math.floor(a * 16), 1, 7401) - 0.5) * 3;
    if (d > edge) continue;
    const mare = hh(x >> 4, y >> 4, 7402) * 0.6 + hh(x >> 3, y >> 3, 7403) * 0.4;
    b.fillFloor(x, y, x, y, mare < 0.33 ? 'vx_mare' : 'vx_regolith');
    hgt[y * W + x] = Math.sin(x * 0.07 + 1) * Math.cos(y * 0.06) * 0.6;
  }
  // ---- craters: bowls with raised rims; one big one with a hole at the bottom
  const craters: [number, number, number][] = [[cx + 14, cy - 12, 11]];
  for (let i = 0; i < 16; i++) craters.push([rng.int(10, W - 11), rng.int(10, H - 11), rng.float(2.5, 6)]);
  for (const [qx, qy, r] of craters) {
    for (let y = Math.floor(qy - r - 3); y <= qy + r + 3; y++) for (let x = Math.floor(qx - r - 3); x <= qx + r + 3; x++) {
      if (!z.inb(x, y)) continue;
      const d = Math.hypot(x - qx, y - qy) / r;
      if (d < 1) hgt[y * W + x] -= (1 - d * d) * Math.min(3.2, r * 0.32);
      else if (d < 1.35) hgt[y * W + x] += (1 - (d - 1) / 0.35) * Math.min(0.9, r * 0.1);
    }
  }
  for (let i = 0; i < W * H; i++) if (z.floor[i]) z.height[i] = Math.max(-40, Math.min(20, Math.round(hgt[i] * 5) * 2));
  b.addRoom('The Moon', 'moon', 2, 2, W - 3, H - 3, { circuit: 0, outdoor: true, temp: -20 });
  b.flag(0, 0, W - 1, H - 1, TF.OUTDOOR);

  // ---- cracks straight through: the Earth shows underneath
  for (let k = 0; k < 7; k++) {
    let x = rng.float(14, W - 14), y = rng.float(14, H - 14), a = rng.float(0, Math.PI * 2);
    const len = rng.int(10, 24);
    for (let s = 0; s < len; s++) {
      a += rng.float(-0.35, 0.35); x += Math.cos(a); y += Math.sin(a);
      const X = Math.round(x), Y = Math.round(y);
      if (!z.inb(X, Y) || Math.hypot(X - cx, Y - (cy + 18)) < 7) continue;
      z.floor[z.idx(X, Y)] = 0;
      if (s % 3 === 0 && z.inb(X + 1, Y)) z.floor[z.idx(X + 1, Y)] = 0;
    }
  }
  // one long crack right past where you land (north-west of it): look down
  {
    let x = cx - 18, y = cy + 4;
    for (let s = 0; s < 24; s++) {
      x += 0.2 + Math.sin(s * 0.9) * 0.5; y += 0.9;
      const X = Math.round(x), Y = Math.round(y);
      if (!z.inb(X, Y)) break;
      z.floor[z.idx(X, Y)] = 0;
      if (s % 2 === 0 && z.inb(X + 1, Y)) z.floor[z.idx(X + 1, Y)] = 0;
      if (s > 6 && s < 14 && z.inb(X - 1, Y)) z.floor[z.idx(X - 1, Y)] = 0;
    }
  }
  b.flag(0, 0, W - 1, H - 1, TF.OUTDOOR);

  // ---- where the lander came down
  const lx = Math.round(cx - 6), ly = Math.round(cy + 18);
  for (let y = ly - 6; y <= ly + 6; y++) for (let x = lx - 8; x <= lx + 8; x++) if (z.inb(x, y)) { if (!z.floor[z.idx(x, y)]) b.fillFloor(x, y, x, y, 'vx_regolith'); z.height[z.idx(x, y)] = 0; }
  force(c, 'vx_lander', lx, ly - 3, 0, {});
  put(c, 'vx_flag', lx + 4, ly - 3, 0, {});
  force(c, 'vx_sign', lx - 3, ly - 2, 0, { text: 'SEA OF REMITTANCE|PROPERTY OF THE INSTITUTE', c: 0xd8d4c8, ink: 0x14161c });
  put(c, 'vx_suit_empty', lx + 3, ly + 2, 1, {});
  f.floorItem('journal', lx + 2, ly + 1, { lore: 'vx_moon_log' });
  landing(c, 'fall', lx, ly + 3, 3);
  arrive(b, 'r_moon_return', lx - 3, ly + 3, 's', 2);
  force(c, 'zw_rope_hanging', lx - 5, ly, 0, { v: 1, portal: 'vx_moon_up' });
  b.portal({ id: 'vx_moon_up', x: lx - 5, y: ly, kind: 'ladder', to: 'lobby', tx: 80, ty: 80, anchor: 'vx_return', label: 'Climb the rope out of the sky' });
  // the footprints go one way only: toward the big crater
  const [bx, by] = [craters[0][0], craters[0][1]];
  for (let t = 0.1; t < 0.8; t += 0.05) { const x = lx + (bx - lx) * t, y = ly + (by - ly) * t; f.decal('decal_footprints', Math.floor(x), Math.floor(y), 1.1, 1.1, Math.atan2(by - ly, bx - lx) + Math.PI / 2, 0x707070); }

  // ---- the big crater's floor has a hole in it
  pit(c, bx + 0.5, by + 0.5, 1.6, { to: deeperFloor('moon', 3), shared: true, label: 'Jump into the crater hole' }, 'vx_moon_hole');

  // ---- rocks everywhere, boulders on the rims
  for (let i = 0; i < 90; i++) { const x = rng.int(4, W - 5), y = rng.int(4, H - 5); if (isOpen(z, x, y) && Math.hypot(x - lx, y - ly) > 6) put(c, 'vx_moon_rock', x, y, rng.int(0, 3) as any, { v: rng.int(0, 5) }); }
  for (const [qx, qy, r] of craters.slice(0, 8)) {
    const a = rng.float(0, Math.PI * 2), x = Math.round(qx + Math.cos(a) * (r + 1.5)), y = Math.round(qy + Math.sin(a) * (r + 1.5));
    if (isOpen(z, x, y) && isOpen(z, x + 1, y + 1) && isOpen(z, x + 1, y) && isOpen(z, x, y + 1)) put(c, 'vx_boulder', x, y, 0, { v: rng.int(0, 2) });
  }
  for (let i = 0; i < 10; i++) { const x = rng.int(6, W - 7), y = rng.int(6, H - 7); if (isOpen(z, x, y)) f.floorLoot('floor_generic', x, y); }
  const extra = findOpenRect(z, 1, 1, rng, 200, 1);
  if (extra) put(c, 'vx_suit_empty', extra[0], extra[1], 2, {});

  // the sun lights everything; the shadows are black
  z.env = {
    ...z.env,
    ambient: 0x3a4050, ambientI: 0.34, fog: 0x000000, fogNear: 40, fogFar: 110, void: 0x000000, temp: -20,
    sky: true, sun: 0xffffff, sunI: 1.7, skyColor: 0x404858, outdoorAmbient: 0x505868,
    grade: 'moon', reverb: 'void', ambience: 'void', music: '', weather: 'none',
  };
  z.spawnTable = [['moon_wisp', 3], ['moon_strider', 1.5]];
  z.creatureCap = 5;
  z.meta.dimension = 'moon';
  z.meta.lowGravity = 0.28;
}

defZone({
  key: 'moon', name: 'The Moon', W, H, depth: 6,
  blurb: 'Black sky, grey dust, a sun with no air around it. The Earth is under your feet, through the cracks. Every step is a leap.',
  gen: (z, s) => { generateMoon(z, s); },
});
