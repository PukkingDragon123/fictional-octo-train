// The Meadow (96×96, outdoor): a field from a future that went well. The
// grass is too green and exactly ankle high everywhere, the hills are soft
// terraces, pastel paths curl between white pylons that hum a major chord,
// daisies stand taller than you, smiling kiosks wish you a nice forever.
// Bubbles live here: bubble mites drift in clouds and bubble rabbits bounce
// (both pop). The field ends at a soft edge where the pastel sky goes on
// underneath it.
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

export function generateMeadow(z: Zone, seed: number) {
  const rng = new Rng(seed);
  const b = new ZoneBuilder(z, rng);
  const f = new Furnisher(b, rng);
  const c: Ctx = { z, b, f, rng, seed };
  z.name = 'The Meadow';
  const cx = W / 2, cy = H / 2;

  // ---- an island of perfect grass with a soft, wobbly edge, on terraced hills
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const a = Math.atan2(y - cy, x - cx), d = Math.hypot(x - cx, y - cy);
    const edge = 41 + Math.sin(a * 3 + 1.3) * 3 + Math.sin(a * 7) * 1.6 + (hh(Math.floor(a * 12), 0, 7301) - 0.5) * 2;
    if (d > edge) continue;
    b.fillFloor(x, y, x, y, 'vx_grass');
    const hill = Math.sin(x * 0.11) * Math.cos(y * 0.09) * 9 + Math.sin((x + y) * 0.05) * 6 + 6;
    z.height[z.idx(x, y)] = Math.max(0, Math.min(40, Math.round(hill / 3) * 3));
  }
  b.addRoom('The Meadow', 'meadow_future', 2, 2, W - 3, H - 3, { circuit: 0, outdoor: true, temp: 22 });
  b.flag(0, 0, W - 1, H - 1, TF.OUTDOOR);

  // ---- pastel paths curling out from the middle, pylons along them
  const paths: [number, number][] = [];
  for (let k = 0; k < 5; k++) {
    let a = (k / 5) * Math.PI * 2 + rng.float(-0.3, 0.3), x = cx, y = cy;
    for (let s = 0; s < 46; s++) {
      a += Math.sin(s * 0.21 + k) * 0.12;
      x += Math.cos(a); y += Math.sin(a);
      const X = Math.round(x), Y = Math.round(y);
      if (!z.inb(X, Y) || !z.floor[z.idx(X, Y)]) break;
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1]]) if (z.inb(X + dx, Y + dy) && z.floor[z.idx(X + dx, Y + dy)]) { const hv = z.height[z.idx(X + dx, Y + dy)]; b.fillFloor(X + dx, Y + dy, X + dx, Y + dy, 'vx_path'); z.height[z.idx(X + dx, Y + dy)] = hv; }
      paths.push([X, Y]);
      if (s % 7 === 3) { const px = X + (s % 2 ? 2 : -2), py = Y; if (isOpen(z, px, py)) put(c, 'vx_pylon', px, py, 0, { v: (s + k) % 5 }); }
    }
  }

  // ---- the middle: a round plaza, a kiosk, benches facing nothing in particular
  for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) if (x * x + y * y <= 18) { const X = cx + x, Y = cy + y; b.fillFloor(X, Y, X, Y, 'vx_path'); z.height[z.idx(X, Y)] = z.height[z.idx(cx, cy)]; }
  landing(c, 'fall', cx, cy + 2, 3);
  arrive(b, 'r_meadow_return', cx - 3, cy + 2, 's', 2);
  force(c, 'vx_kiosk', cx + 3, cy - 3, 0, {});
  force(c, 'vx_sign', cx - 1, cy + 5, 0, { text: 'THE MEADOW|HAVE A NICE FOREVER', c: 0xf4e8f4, ink: 0x6a4a9a });
  f.floorItem('note', cx + 2, cy - 2, { lore: 'vx_meadow_kiosk' });
  put(c, 'vx_bench', cx - 4, cy - 3, 0, {}); put(c, 'vx_bench', cx + 2, cy + 4, 2, {});
  force(c, 'zw_rope_hanging', cx - 2, cy - 4, 0, { v: 1, portal: 'vx_meadow_up' });
  b.portal({ id: 'vx_meadow_up', x: cx - 2, y: cy - 4, kind: 'ladder', to: 'lobby', tx: 80, ty: 80, anchor: 'vx_return', label: 'Climb the rope out of the sky' });

  // ---- giant daisies in clumps, orbs on plinths, a few more kiosks
  for (let k = 0; k < 14; k++) {
    const px = rng.int(8, W - 9), py = rng.int(8, H - 9);
    for (let i = 0; i < rng.int(3, 7); i++) { const x = px + rng.int(-3, 3), y = py + rng.int(-3, 3); if (isOpen(z, x, y) && Math.hypot(x - cx, y - cy) > 7) put(c, 'vx_daisy', x, y, rng.int(0, 3) as any, { v: rng.int(0, 4) }); }
  }
  for (let i = 0; i < 18; i++) { const x = rng.int(6, W - 7), y = rng.int(6, H - 7); if (isOpen(z, x, y) && Math.hypot(x - cx, y - cy) > 6) put(c, 'vx_orb', x, y, 0, { v: i }); }
  for (let i = 0; i < 4; i++) { const x = rng.int(10, W - 11), y = rng.int(10, H - 11); if (isOpen(z, x, y) && isOpen(z, x, y + 1)) put(c, 'vx_kiosk', x, y, 0, {}); }
  for (let i = 0; i < 8; i++) { const x = rng.int(8, W - 9), y = rng.int(8, H - 9); if (isOpen(z, x, y) && isOpen(z, x + 1, y)) put(c, 'vx_bench', x, y, rng.int(0, 3) as any, {}); }

  // ---- a mint pond in a hollow
  const qx = Math.round(cx + 16), qy = Math.round(cy - 14);
  for (let y = -4; y <= 4; y++) for (let x = -6; x <= 6; x++) {
    const X = qx + x, Y = qy + y;
    if (!z.inb(X, Y) || !z.floor[z.idx(X, Y)] || (x * x) / 36 + (y * y) / 16 > 1) continue;
    b.clearObjects(X, Y, X, Y);
    b.fillFloor(X, Y, X, Y, 'water_shallow');
    z.height[z.idx(X, Y)] = 0;
  }

  // ---- a hole in the grass: the sky goes on under it, and further down there are more floors
  const hp = findOpenRect(z, 3, 3, rng, 400, 1);
  if (hp) pit(c, hp[0] + 1.5, hp[1] + 1.5, 1.4, { to: deeperFloor('meadow', 2), shared: true, label: 'Jump through the grass' }, 'vx_meadow_hole');

  // ---- forage: there is food here, it is just very clean
  for (let i = 0; i < 20; i++) { const x = rng.int(6, W - 7), y = rng.int(6, H - 7); if (isOpen(z, x, y)) f.floorLoot('floor_generic', x, y); }
  for (let i = 0; i < 40; i++) { const x = rng.int(4, W - 5), y = rng.int(4, H - 5); if (z.floor[z.idx(x, y)]) f.decal('decal_footprints', x, y, 1, 1, rng.float(0, 6), 0xffffff); }

  z.env = {
    ...z.env,
    ambient: 0xc8d8f0, ambientI: 0.4, fog: 0xf0d8ee, fogNear: 30, fogFar: 90, void: 0xe8c8e4, temp: 22,
    sky: true, sun: 0xfff0f4, sunI: 0.95, skyColor: 0xd8f0ff, outdoorAmbient: 0xe8e0ff,
    grade: 'meadow', reverb: 'outdoor', ambience: 'fields', music: '', weather: 'none',
  };
  z.spawnTable = [['bubble_mite', 4], ['bubble_rabbit', 3]];
  z.creatureCap = 9;
  z.meta.dimension = 'meadow';
}

defZone({
  key: 'meadow', name: 'The Meadow', W, H, depth: 5,
  blurb: 'Grass too green to be grass. Pylons humming a major chord. The bubbles are friendly. The bubbles are food.',
  gen: (z, s) => { generateMeadow(z, s); },
});
