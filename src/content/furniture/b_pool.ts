// Furniture B — pool halls: ladders, lifeguard stand, loungers, diving board,
// water slide, tiled columns, floats, towels, showers and storage.
// Mood: damp white tile, chlorine, blue-green light bouncing off the ceiling.
import { defObj } from '../../world/objects';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { ModelBuilder } from '../../gfx/modelBuilder';
import {
  makeRamp, mixHex, scaleHex, bayer, ph, tileFbm, hashf, text, textC, scribble, fillNoise, chips, stripes,
  rivet, screw, gauge, glow, poly, rod, torus, disc, discY, pushSeg, mirroredStamp,
} from './b_common';

const T = ['setB', 'pool'];

// ---------------------------------------------------------------------------
// textures
// ---------------------------------------------------------------------------
function tileWall(pc: import('../../gfx/pixel').PixelCanvas, base: number, grout: number, seed: number, size = 4) {
  const R = makeRamp(base, 5, { spread: 0.28 });
  const W = pc.w, H = pc.h;
  pc.each((x, y) => {
    const tx = Math.floor(x / size), ty = Math.floor(y / size);
    const lx = x % size, ly = y % size;
    if (lx === size - 1 || ly === size - 1) {
      const g = tileFbm(x, y, W, H, 3, 2, seed + 4);
      pc.set(x, y, g > 0.6 ? scaleHex(grout, 0.78) : grout);
      return;
    }
    const v = hashf(tx, ty, seed);
    let k = v < 0.15 ? 1 : v > 0.85 ? 3 : 2;
    if (lx === 0 && ly === 0) k = 4;
    else if (lx === size - 2 && ly === size - 2) k = Math.max(0, k - 1);
    pc.set(x, y, R[k]);
  });
  // water staining in clusters
  pc.each((x, y) => {
    const n = tileFbm(x, y, W, H, 2, 3, seed + 9);
    if (n > 0.64 && bayer(x, y) < (n - 0.64) * 4) pc.blend(x, y, 0x8a9a7a, 0.35);
  });
}

addTextureModule(() => {
  const A = atlas();

  A.add('q_pool_tile', 32, 32, (pc) => {
    tileWall(pc, 0xdde6e4, 0x9aaaaa, 501);
    // one cracked tile
    pc.line(9, 13, 11, 15, 0x6a7a7a); pc.set(10, 13, 0x6a7a7a);
  });
  A.add('q_pool_tile_blue', 32, 32, (pc) => {
    tileWall(pc, 0x3f92b8, 0x2a5a70, 503);
  });
  A.add('q_pool_tile_band', 16, 4, (pc) => {
    pc.each((x, y) => {
      if (x % 4 === 3 || y === 3) { pc.set(x, y, 0x2a5a70); return; }
      const c = (Math.floor(x / 4) % 2) ? 0x3f92b8 : 0x2f7aa0;
      pc.set(x, y, x % 4 === 0 && y === 0 ? mixHex(c, 0xffffff, 0.35) : c);
    });
  });
  A.add('q_lounger_slats', 16, 16, (pc) => {
    const r = makeRamp(0xe2e2da, 5, { spread: 0.3 });
    pc.each((x, y) => {
      const k = y % 4;
      pc.set(x, y, k === 3 ? 0x5a6066 : k === 0 ? r[4] : k === 2 ? r[1] : r[2 + (ph(x, y, 7) < 0.15 ? 1 : 0)]);
    });
    pc.grime(0xb0a480, 0.4, 2, 511, 0.62);
  });
  A.add('q_diving_board', 16, 64, (pc, rng) => {
    pc.wrap = false;
    const r = makeRamp(0x8ec8d8, 5, { spread: 0.3 });
    pc.fillRamp(r, (x, y) => 0.55 + (ph(x, y, 9) - 0.5) * 0.35, 1);
    for (let y = 0; y < 64; y++) { pc.set(0, y, 0x2a6a9a); pc.set(15, y, 0x1e527a); pc.set(1, y, 0x3a82b2); }
    pc.rect(0, 0, 16, 5, 0xc8322a); pc.hline(0, 15, 5, 0x8a2018);
    pc.speckle(rng, [r[0]], 0.05);
    pc.grime(0x6a8a8a, 0.4, 3, 513, 0.6);
  });
  A.add('q_slide_chute', 32, 32, (pc, rng) => {
    const r = makeRamp(0x3ab0b4, 6, { spread: 0.42 });
    fillNoise(pc, r, 0.55, 0.1, 2, 521, 0.03);
    for (let x = 0; x < 32; x += 8) for (let y = 0; y < 32; y++) { pc.blend(x + 2, y, r[5], 0.5); pc.blend(x + 3, y, r[5], 0.25); }
    pc.drips(rng, 0x2a8088, 4, 0, 30, 0.3);
    for (let k = 0; k < 4; k++) { const x = rng.int(0, 31), y = rng.int(0, 31); pc.line(x, y, x + rng.int(2, 5), y + rng.int(-1, 1), r[1]); }
  });
  const towels = (name: string, a: number, b: number, seed: number) => A.add(name, 16, 8, (pc) => {
    pc.each((x, y) => {
      const k = y % 4;
      const stripe = Math.floor((x + seed) / 3) % 2 === 0 ? a : b;
      const c = k === 0 ? mixHex(stripe, 0xffffff, 0.25) : k === 3 ? scaleHex(stripe, 0.62) : (ph(x, y, seed) < 0.2 ? scaleHex(stripe, 0.9) : stripe);
      pc.set(x, y, c);
    });
  });
  towels('q_towels_blue', 0x3a7ac8, 0xe8e6e0, 1);
  towels('q_towels_pink', 0xe88aa8, 0xf0d860, 2);
  towels('q_towels_teal', 0x40b0a8, 0xe8e6e0, 3);
  A.add('q_towel_top', 10, 8, (pc) => {
    pc.wrap = false;
    pc.each((x, y) => pc.set(x, y, Math.floor(x / 2) % 2 === 0 ? 0xe8e6e0 : 0x3a7ac8));
    pc.hline(0, 9, 4, 0xb8b6b0); pc.hline(0, 9, 0, 0xffffff);
  });
  A.add('q_float_ring', 32, 8, (pc) => {
    pc.wrap = false;
    pc.each((x, y) => {
      const red = Math.floor(x / 8) % 2 === 0;
      const base = red ? 0xd8362a : 0xf0ece6;
      pc.set(x, y, y === 0 || y === 7 ? scaleHex(base, 0.8) : base);
    });
    for (const x of [0, 8, 16, 24]) for (let y = 0; y < 8; y++) pc.set(x, y, y % 2 ? 0xd8c8a0 : 0x9a8a68);
  });
  A.add('q_guard_sign', 20, 7, (pc) => {
    pc.wrap = false;
    pc.fill(0xc8281e); pc.bevel(0, 0, 20, 7, 0xe8584a, 0x7a1810);
    textC(pc, 'GUARD', 10, 1, 0xffffff);
  });
  A.add('q_first_aid', 8, 8, (pc) => {
    pc.wrap = false;
    pc.fill(0xece8e0); pc.bevel(0, 0, 8, 8, 0xffffff, 0xa8a49c);
    pc.rect(3, 1, 2, 6, 0xc8281e); pc.rect(1, 3, 6, 2, 0xc8281e);
  });
  A.add('q_drain', 16, 16, (pc) => {
    pc.wrap = false;
    const r = makeRamp(0xb8bcbe, 5, { spread: 0.4 });
    pc.fill(r[2]); pc.bevel(0, 0, 16, 16, r[4], r[0]);
    for (let y = 3; y < 13; y += 2) pc.hline(3, 12, y, 0x1a1c1e);
    pc.blend(5, 5, 0x6a8a6a, 0.6); pc.blend(10, 9, 0x8a7a5a, 0.5);
  });
  A.add('q_kickboard', 8, 12, (pc) => {
    pc.wrap = false;
    pc.fill(0x2e7ad0);
    pc.bevel(0, 0, 8, 12, 0x5a9ae0, 0x1a5aa8);
    pc.set(0, 0, 0x1a4a88); pc.set(7, 0, 0x1a4a88);
    pc.rect(2, 4, 4, 3, 0xf0d040); pc.set(3, 5, 0xe0503a);
  });
  A.add('q_foam', 8, 8, (pc, rng) => {
    const r = makeRamp(0xe8e8e8, 4, { spread: 0.2 });
    pc.fillRamp(r, (x, y) => 0.6 + (ph(x, y, 531) - 0.5) * 0.4, 1);
    pc.speckle(rng, [r[0]], 0.08);
  });
  A.add('q_chlorine', 18, 8, (pc) => {
    pc.wrap = false;
    pc.fill(0xecebe6);
    pc.rect(0, 2, 18, 4, 0x2a6ab8);
    mirroredStamp(pc, 11, 5, 1, 2, (s) => text(s, 'CL2', 0, 0, 0xffffff));
    pc.set(14, 3, 0xf0c020); pc.set(13, 4, 0xf0c020); pc.set(15, 4, 0xf0c020); pc.set(14, 5, 0xf0c020);
    pc.hline(0, 17, 0, 0xffffff);
  });
  A.add('q_umbrella', 32, 8, (pc) => {
    pc.wrap = false;
    pc.each((x, y) => {
      const red = Math.floor(x / 4) % 2 === 0;
      const base = red ? 0xc8322a : 0xf0ece0;
      pc.set(x, y, y === 0 ? scaleHex(base, 0.75) : base);
    });
  });
  A.add('q_shower_head', 8, 8, (pc) => {
    pc.wrap = false;
    pc.fill(0xb8bcc0);
    for (let y = 1; y < 7; y += 2) for (let x = 1; x < 7; x += 2) pc.set(x, y, 0x2a2c2e);
  });
});

// ---------------------------------------------------------------------------
// objects
// ---------------------------------------------------------------------------
defObj({
  key: 'pool_ladder', name: 'Pool Ladder', w: 1, d: 1, height: 0.95, block: 'none', onWall: true,
  sound: 'metal',
  desc: 'Chrome rails curving over the edge and down into the water. The bottom rung is further down than the pool is deep.',
  tags: [...T, 'ladder'],
  model: (mb) => {
    const C = 'chrome', r = 0.024;
    for (const x of [-0.24, 0.24]) {
      // deck anchor → arc over the edge → down into the pool
      const pts: [number, number, number][] = [[x, 0.0, -0.78], [x, 0.62, -0.76], [x, 0.86, -0.68], [x, 0.9, -0.55], [x, 0.8, -0.42], [x, 0.55, -0.37], [x, -1.7, -0.37]];
      for (let i = 0; i + 1 < pts.length; i++) {
        const [a, b] = [pts[i], pts[i + 1]];
        rod(mb, a[0], a[1], a[2], b[0], b[1], b[2], r, 6, C);
        if (i > 0 && i < pts.length - 1) mb.sphere(a[0], a[1], a[2], r * 1.05, 6, 3, C);
      }
      mb.cylinder(x, 0, -0.78, 0.05, 0.015, 8, 'metal_brushed');
    }
    // treads below deck level
    for (const y of [-0.28, -0.58, -0.88, -1.18]) mb.box(0, y, -0.42, 0.46, 0.035, 0.12, 'metal_brushed');
  },
});

defObj({
  key: 'lifeguard_chair', name: 'Lifeguard Stand', w: 1, d: 1, height: 2.55, block: 'solid', tall: true,
  container: { capacity: 10, kind: 'box', loot: 'lifeguard' },
  sound: 'wood', flammable: 0.4,
  desc: 'A tall white stand overlooking the water. The whistle on the seat is still warm.',
  tags: [...T, 'lifeguard'],
  model: (mb) => {
    const P = 'q_paint_white';
    const seatY = 1.45;
    // splayed legs
    const legs: [number, number, number, number][] = [[-0.42, 0.4, -0.3, 0.22], [0.42, 0.4, 0.3, 0.22], [-0.42, -0.4, -0.3, -0.24], [0.42, -0.4, 0.3, -0.24]];
    for (const [fx, fz, tx, tz] of legs) rod(mb, fx, 0, fz, tx, seatY, tz, 0.035, 4, P);
    // ladder rungs between the front legs
    for (let k = 1; k <= 4; k++) {
      const t = k / 5, y = seatY * t, x = 0.42 - (0.42 - 0.3) * t, z = 0.4 - (0.4 - 0.22) * t;
      mb.box(0, y, z, x * 2, 0.035, 0.08, P);
    }
    // side braces (X)
    for (const s of [-1, 1]) {
      rod(mb, s * 0.41, 0.15, -0.38, s * 0.33, 1.1, 0.27, 0.018, 4, P);
      rod(mb, s * 0.41, 0.15, 0.38, s * 0.33, 1.1, -0.29, 0.018, 4, P);
    }
    // platform, seat, backrest, armrests
    mb.box(0, seatY, -0.01, 0.7, 0.05, 0.56, { top: 'q_pallet_wood', sides: P });
    mb.box(0, seatY - 0.16, 0.25, 0.62, 0.16, 0.025, 'q_guard_sign', { fit: true });
    mb.box(0, seatY + 0.18, -0.06, 0.52, 0.05, 0.4, { top: 'q_pallet_wood', sides: P });
    for (const x of [-0.22, 0.22]) mb.box(x, seatY + 0.05, -0.06, 0.04, 0.13, 0.04, P);
    mb.push(); mb.translate(0, seatY + 0.2, -0.27); mb.rotateX(-0.18);
    mb.box(0, 0, 0, 0.52, 0.5, 0.05, P);
    mb.pop();
    for (const x of [-0.27, 0.27]) {
      mb.box(x, seatY + 0.36, -0.08, 0.04, 0.04, 0.4, P);
      mb.box(x, seatY + 0.05, 0.1, 0.035, 0.32, 0.035, P);
    }
    // rescue tube hanging from the armrest, whistle on the seat
    mb.box(0.31, seatY - 0.32, 0.12, 0.09, 0.62, 0.07, 'plastic_red');
    mb.box(0.31, seatY + 0.18, 0.12, 0.02, 0.2, 0.02, 'plastic_black');
    mb.box(-0.1, seatY + 0.23, 0.0, 0.05, 0.03, 0.03, 'plastic_yellow');
    // first aid box strapped to a leg
    mb.box(-0.38, 0.75, 0.33, 0.16, 0.16, 0.08, { south: 'q_first_aid', sides: 'plastic_white' }, { fit: { south: true } });
    // umbrella
    rod(mb, 0.0, seatY + 0.2, -0.32, 0.0, 2.38, -0.32, 0.018, 6, 'metal_grey');
    mb.cylinder(0.0, 2.2, -0.32, 0.72, 0.2, 8, { sides: 'q_umbrella', top: 'q_umbrella' }, { fit: true, rTop: 0.06 });
    mb.cylinder(0.0, 2.4, -0.32, 0.03, 0.06, 5, 'plastic_white');
  },
});

defObj({
  key: 'pool_lounger', name: 'Pool Lounger', w: 1, d: 2, height: 0.9, block: 'low', sit: true, sleep: 0.4,
  movable: 9, sound: 'plastic',
  desc: 'A white plastic sun lounger. There is no sun.',
  tags: [...T, 'sit', 'sleep'],
  model: (mb) => {
    const W = 'plastic_white';
    // legs
    for (const x of [-0.3, 0.3]) {
      mb.box(x, 0, 0.85, 0.05, 0.32, 0.06, W);
      mb.box(x, 0, 0.1, 0.05, 0.32, 0.06, W);
      mb.cylinderX(x, 0.06, -0.62, 0.06, 0.05, 8, 'plastic_black');
      mb.box(x, 0.06, -0.62, 0.05, 0.26, 0.06, W);
      mb.box(x, 0.3, 0.12, 0.05, 0.05, 1.68, W);
    }
    // seat bed (slatted)
    mb.box(0, 0.33, 0.37, 0.62, 0.04, 1.1, { top: 'q_lounger_slats', sides: W }, { rotTop: false });
    // reclined backrest
    mb.push(); mb.translate(0, 0.35, -0.2); mb.rotateX(0.95);
    mb.box(0, 0, -0.34, 0.62, 0.04, 0.68, { top: 'q_lounger_slats', sides: W, bottom: W });
    mb.pop();
    mb.box(0, 0.25, -0.38, 0.5, 0.04, 0.04, W);
    // folded towel at the foot
    mb.box(0.05, 0.37, 0.72, 0.42, 0.06, 0.3, { sides: 'q_towels_blue', top: 'q_towel_top' }, { fit: { top: true } });
  },
});

defObj({
  key: 'diving_board', name: 'Diving Board', w: 1, d: 2, height: 1.1, block: 'low',
  sound: 'plastic',
  desc: 'A springboard over the deep end. Place it so the tip hangs out over the water.',
  tags: [...T],
  model: (mb) => {
    // concrete pedestal with steps at the back
    mb.box(0, 0, -0.625, 0.6, 0.36, 0.45, 'concrete', { skip: ['bottom'] });
    mb.box(0, 0, -0.925, 0.5, 0.18, 0.15, 'concrete', { skip: ['bottom'] });
    // fulcrum stand
    mb.box(0, 0, -0.12, 0.5, 0.3, 0.18, 'q_steel_blue', { skip: ['bottom'] });
    mb.cylinderX(0, 0.36, -0.12, 0.05, 0.52, 8, 'metal_grey');
    // board, rising slightly toward the tip
    mb.push(); mb.translate(0, 0.42, -0.85); mb.rotateX(-0.05);
    mb.box(0, 0, 0.95, 0.5, 0.06, 1.95, { top: 'q_diving_board', sides: 'plastic_white' }, { fit: { top: true } });
    mb.pop();
    // handrails at the back
    for (const x of [-0.34, 0.34]) {
      rod(mb, x, 0.36, -0.9, x, 0.95, -0.9, 0.022, 6, 'chrome');
      rod(mb, x, 0.95, -0.9, x, 0.95, -0.45, 0.022, 6, 'chrome');
      rod(mb, x, 0.95, -0.45, x, 0.5, -0.3, 0.022, 6, 'chrome');
      mb.sphere(x, 0.95, -0.9, 0.024, 5, 3, 'chrome');
      mb.sphere(x, 0.95, -0.45, 0.024, 5, 3, 'chrome');
    }
  },
});

defObj({
  key: 'pool_slide', name: 'Water Slide', w: 2, d: 3, height: 2.6, block: 'solid', tall: true,
  sound: 'plastic',
  desc: 'A teal water slide that curls back on itself. The water at the bottom is perfectly still.',
  tags: [...T, 'decor'],
  model: (mb) => {
    const S = 'q_slide_chute';
    // ladder up to the platform
    const lx = -0.5, lz = -1.45;
    for (const x of [lx - 0.25, lx + 0.25]) rod(mb, x, 0, lz, x, 2.3, lz + 0.05, 0.025, 6, 'chrome');
    for (let y = 0.3; y < 2.0; y += 0.3) mb.box(lx, y, lz + y * 0.02, 0.5, 0.03, 0.05, 'metal_brushed');
    // platform with rails
    mb.box(lx, 2.0, -1.1, 0.72, 0.07, 0.62, { top: 'q_lounger_slats', sides: 'plastic_white' });
    for (const x of [lx - 0.34, lx + 0.34]) for (const z of [-1.36, -0.84]) rod(mb, x, 0.0, z, x, 2.0, z, 0.03, 6, 'q_paint_white');
    for (const x of [lx - 0.34, lx + 0.34]) { rod(mb, x, 2.07, -1.36, x, 2.55, -1.36, 0.02, 6, 'chrome'); rod(mb, x, 2.55, -1.36, x, 2.55, -0.84, 0.02, 6, 'chrome'); rod(mb, x, 2.55, -0.84, x, 2.2, -0.78, 0.02, 6, 'chrome'); }
    // chute along a curving path
    const path: [number, number, number][] = [[-0.5, 2.03, -0.8], [-0.5, 1.7, -0.3], [-0.35, 1.38, 0.12], [0.05, 1.1, 0.32], [0.45, 0.85, 0.4], [0.62, 0.6, 0.75], [0.6, 0.38, 1.15], [0.55, 0.26, 1.45]];
    for (let i = 0; i + 1 < path.length; i++) {
      const a = path[i], b = path[i + 1];
      const len = pushSeg(mb, a[0], a[1], a[2], b[0], b[1], b[2]);
      mb.box(0, 0, len / 2, 0.5, 0.035, len + 0.08, S);
      mb.box(-0.26, 0, len / 2, 0.035, 0.17, len + 0.08, S);
      mb.box(0.26, 0, len / 2, 0.035, 0.17, len + 0.08, S);
      mb.pop();
    }
    // supports
    for (const k of [2, 4, 6]) { const p = path[k]; rod(mb, p[0], 0, p[2], p[0], p[1] - 0.02, p[2], 0.035, 6, 'q_paint_white'); mb.cylinder(p[0], 0, p[2], 0.07, 0.03, 6, 'metal_grey'); }
    // splash pool lip at the bottom
    mb.box(0.55, 0, 1.45, 0.8, 0.12, 0.08, 'q_pool_tile');
    discY(mb, 0.55, 0.004, 1.2, 0.36, 10, 'water');
  },
});

defObj({
  key: 'column_round', name: 'Tiled Column', w: 1, d: 1, height: 2.7, block: 'solid', blocksSight: false,
  sound: 'ceramic', hp: 5000,
  desc: 'A round pillar wrapped in small white tiles. Count them and the number changes.',
  tags: [...T, 'column', 'structure'],
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.36, 0.16, 12, { sides: 'q_pool_tile_blue', top: 'q_pool_tile' });
    mb.cylinder(0, 0.16, 0, 0.32, 2.42, 12, { sides: 'q_pool_tile', top: 'q_pool_tile' }, { caps: false });
    mb.cylinder(0, 1.22, 0, 0.325, 0.125, 12, 'q_pool_tile_band', { caps: false });
    mb.cylinder(0, 2.58, 0, 0.37, 0.12, 12, { sides: 'q_pool_tile', top: 'q_pool_tile' });
  },
});

defObj({
  key: 'column_square', name: 'Tiled Pillar', w: 1, d: 1, height: 2.7, block: 'solid',
  sound: 'ceramic', hp: 5000,
  desc: 'A square pillar of white tile, damp at the base.',
  tags: [...T, 'column', 'structure'],
  model: (mb) => {
    mb.box(0, 0, 0, 0.7, 0.16, 0.7, { sides: 'q_pool_tile_blue', top: 'q_pool_tile' }, { skip: ['bottom'] });
    mb.box(0, 0.16, 0, 0.62, 2.42, 0.62, 'q_pool_tile', { skip: ['bottom', 'top'] });
    mb.box(0, 1.22, 0, 0.63, 0.125, 0.63, 'q_pool_tile_band', { skip: ['bottom', 'top'], uvOffset: [0, -1.22] });
    for (const x of [-0.31, 0.31]) for (const z of [-0.31, 0.31]) mb.box(x, 0.16, z, 0.04, 2.42, 0.04, 'plastic_white', { skip: ['bottom'] });
    mb.box(0, 2.58, 0, 0.72, 0.12, 0.72, { sides: 'q_pool_tile', top: 'q_pool_tile' }, { skip: ['bottom'] });
  },
});

defObj({
  key: 'float_ring', name: 'Life Ring', w: 1, d: 1, height: 0.16, block: 'none',
  movable: 2, sound: 'plastic',
  desc: 'A red and white life ring, floating where there is no water.',
  tags: [...T, 'decor'],
  model: (mb) => {
    mb.push(); mb.rotateY(0.4);
    torus(mb, 0.0, 0.08, 0.0, 0.26, 0.08, 14, 6, 'q_float_ring');
    // grab rope
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2 + Math.PI / 4;
      mb.box(Math.cos(a) * 0.35, 0.07, Math.sin(a) * 0.35, 0.03, 0.03, 0.03, 'fabric_grey');
    }
    mb.pop();
  },
});

defObj({
  key: 'towel_stack', name: 'Towel Rack', w: 1, d: 1, height: 0.85, block: 'table', surface: 0.48,
  container: { capacity: 20, kind: 'shelf', loot: 'pool_storage' },
  sound: 'fabric', flammable: 0.6,
  desc: 'Fresh towels, folded to a precision no tired attendant manages.',
  tags: [...T, 'storage'],
  model: (mb) => {
    const W = 'q_pallet_wood';
    for (const x of [-0.42, 0.42]) for (const z of [-0.18, 0.18]) mb.box(x, 0, z, 0.05, 0.46, 0.05, W, { skip: ['bottom'] });
    for (let i = 0; i < 4; i++) mb.box(0, 0.44, -0.15 + i * 0.1, 0.9, 0.025, 0.07, W);
    for (let i = 0; i < 4; i++) mb.box(0, 0.1, -0.15 + i * 0.1, 0.9, 0.02, 0.07, W);
    const stack = (x: number, y: number, n: number, tex: string, rot = 0) => {
      mb.push(); mb.translate(x, y, 0); mb.rotateY(rot);
      mb.box(0, 0, 0, 0.3, n * 0.06, 0.26, { sides: tex, top: 'q_towel_top' }, { fit: { top: true } });
      mb.pop();
    };
    stack(-0.24, 0.465, 5, 'q_towels_blue', 0.03); stack(0.16, 0.465, 4, 'q_towels_pink', -0.05);
    stack(-0.2, 0.12, 4, 'q_towels_teal'); stack(0.2, 0.12, 3, 'q_towels_blue', 0.08);
    mb.cylinderX(0.33, 0.8, 0.02, 0.06, 0.24, 7, 'q_towels_pink');
  },
});

defObj({
  key: 'shower_pool', name: 'Poolside Shower', w: 1, d: 1, height: 2.3, block: 'low',
  water: { capacity: 60, tap: true, tainted: false },
  sound: 'metal',
  desc: 'A chrome shower post. The water runs warm, then cold, then warm again.',
  tags: [...T, 'water'],
  model: (mb) => {
    mb.box(0, 0, 0, 0.62, 0.02, 0.62, { top: 'q_pool_tile_blue', sides: 'q_pool_tile_blue' }, { skip: ['bottom'] });
    mb.box(0, 0.02, 0.05, 0.22, 0.006, 0.22, 'q_drain', { fit: true });
    mb.cylinder(0, 0.02, -0.28, 0.07, 0.04, 8, 'metal_brushed');
    mb.cylinder(0, 0.02, -0.28, 0.035, 2.2, 8, 'chrome');
    mb.sphere(0, 2.22, -0.28, 0.04, 6, 3, 'chrome');
    rod(mb, 0, 2.22, -0.28, 0, 2.22, 0.05, 0.028, 6, 'chrome');
    mb.cylinder(0, 2.12, 0.08, 0.09, 0.08, 9, 'chrome', { rTop: 0.03 });
    discY(mb, 0, 2.115, 0.08, 0.085, 9, 'q_shower_head');
    // push valve and foot rinse
    mb.box(0, 1.15, -0.23, 0.08, 0.14, 0.06, 'metal_brushed');
    mb.cylinderZ(0, 1.17, -0.19, 0.025, 0.03, 8, 'plastic_blue');
    rod(mb, 0, 0.55, -0.28, 0, 0.55, -0.12, 0.02, 6, 'chrome');
    mb.box(0, 0.5, -0.11, 0.04, 0.06, 0.03, 'chrome');
    // puddle
    discY(mb, 0.05, 0.026, 0.1, 0.26, 10, 'water', { color: 0xc8e8f0 });
  },
});

defObj({
  key: 'pool_storage_shelf', name: 'Pool Equipment Shelf', w: 1, d: 1, height: 1.85, block: 'solid', blocksSight: true,
  container: { capacity: 35, kind: 'shelf', loot: 'pool_storage' },
  sound: 'metal',
  desc: 'Kickboards, noodles and tubs of chlorine tablets. Everything smells of the deep end.',
  tags: [...T, 'storage', 'shelf'],
  model: (mb) => {
    const zc = -0.16, P = 'q_paint_white';
    for (const x of [-0.46, 0.46]) for (const z of [zc - 0.24, zc + 0.24]) mb.box(x, 0, z, 0.04, 1.85, 0.04, P, { skip: ['bottom'] });
    for (const y of [0.08, 0.55, 1.05, 1.55]) mb.box(0, y, zc, 0.92, 0.03, 0.5, { top: 'metal_grey', sides: P }, { skip: ['bottom'] });
    // chlorine tubs
    for (const x of [-0.28, 0.0]) {
      mb.cylinder(x, 0.11, zc + 0.02, 0.13, 0.3, 9, { sides: 'q_chlorine', top: 'plastic_white' }, { fit: true });
      mb.cylinder(x, 0.41, zc + 0.02, 0.135, 0.03, 9, 'plastic_blue');
    }
    mb.box(0.3, 0.11, zc, 0.22, 0.22, 0.3, { sides: 'q_cardboard_a', top: 'q_cardboard_top' }, { fit: true });
    // kickboards stacked flat and leaning
    for (let i = 0; i < 4; i++) mb.box(-0.2 + (i % 2) * 0.02, 0.58 + i * 0.035, zc + 0.02, 0.26, 0.03, 0.38, { top: 'q_kickboard', sides: 'plastic_blue' }, { fit: { top: true } });
    for (let i = 0; i < 3; i++) {
      mb.push(); mb.translate(0.12 + i * 0.07, 0.58, zc - 0.05); mb.rotateZ(-0.25);
      mb.box(0, 0, 0, 0.03, 0.4, 0.28, { east: 'q_kickboard', west: 'q_kickboard', sides: 'plastic_blue' }, { fit: { east: true, west: true }, color: [0xffffff, 0xffb0d0, 0xb0ffd0][i] });
      mb.pop();
    }
    // pool noodles standing on the top shelf
    const nc = [0xff8ac0, 0x8ae0ff, 0xfff07a, 0x9aff9a, 0xc8a0ff];
    for (let i = 0; i < 5; i++) mb.cylinder(-0.34 + i * 0.075, 1.08, zc + 0.08 - (i % 2) * 0.08, 0.035, 0.75, 6, 'q_foam', { color: nc[i] });
    // goggles + whistle bits, life ring on the side
    mb.box(0.25, 1.08, zc + 0.05, 0.25, 0.04, 0.12, 'plastic_black');
    mb.box(0.25, 1.12, zc + 0.05, 0.08, 0.02, 0.06, 'plastic_blue', { emissive: 0.1 });
    mb.push(); mb.translate(0.49, 1.0, zc); mb.rotateZ(Math.PI / 2);
    torus(mb, 0, 0, 0, 0.2, 0.055, 12, 5, 'q_float_ring');
    mb.pop();
    // pool net pole leaning
    rod(mb, -0.52, 0.0, zc + 0.2, -0.4, 1.95, zc + 0.15, 0.015, 5, 'metal_brushed');
    mb.box(-0.4, 1.95, zc + 0.15, 0.3, 0.04, 0.16, 'plastic_blue');
  },
});
