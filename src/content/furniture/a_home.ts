// Furniture A — home: bedroom, living room, nursery.
import { defObj } from '../../world/objects';
import {
  atlas, addTextureModule, PixelCanvas, makeRamp, mixHex, scaleHex, ph, tileFbm, Rng, WZ,
  txt, txtC, scribble, fillR, crtGlass, legs4, rlegs4, knob, frontGrid, flipH,
} from './a_lib';
import type { ModelBuilder } from './a_lib';

const T = (...t: string[]) => ['setA', ...t];
const on = (s: any) => !(s.on === false || s.broken || s.unpowered);
/** wall face z for objects two tiles deep (footprint centred at z=0) */
const WZ2 = WZ - 0.5;

// ============================================================ textures
function fur(pc: PixelCanvas, base: number, seed: number) {
  const R = makeRamp(base, 6, { hueShift: 0.04, spread: 0.5 });
  pc.fillRamp(R, (x, y) => 0.5 + (tileFbm(x, y, pc.w, pc.h, 4, 3, seed) - 0.5) * 0.7 + ((x * 3 + y * 5) % 7 === 0 ? 0.12 : 0) - ((x + y * 2) % 5 === 0 ? 0.1 : 0), 1);
}

addTextureModule(() => {
  const A = atlas();
  A.add('p_quilt', 32, 32, (pc) => {
    const cols = [0xd89a9a, 0xa8c4d8, 0xe8d4a0, 0xb4d0a8, 0xc8b0d8, 0xf0e4d4, 0x9ab4c4, 0xe0b890];
    for (let by = 0; by < 4; by++) for (let bx = 0; bx < 4; bx++) {
      const c = cols[Math.floor(ph(bx, by, 17) * cols.length)];
      const R = makeRamp(c, 4, { spread: 0.25 });
      const pat = Math.floor(ph(bx, by, 23) * 3);
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        let v = 2;
        if (pat === 1 && (x + y) % 4 === 0) v = 1;
        if (pat === 2 && x % 3 === 1 && y % 3 === 1) v = 3;
        if (x === 0 || y === 0) v = 3; if (x === 7 || y === 7) v = 0;
        pc.set(bx * 8 + x, by * 8 + y, R[v]);
      }
      for (let k = 1; k < 7; k += 2) pc.set(bx * 8 + k, by * 8 + 7, 0xf4f0e8); // stitching
    }
  });
  A.add('p_bedspread', 32, 32, (pc) => {
    const R = makeRamp(0xd8a8b4, 5, { spread: 0.3 });
    pc.fillRamp(R, (x, y) => 0.55 + (tileFbm(x, y, 32, 32, 2, 2, 4) - 0.5) * 0.2, 0.8);
    for (let y = 0; y < 32; y += 8) for (let x = 0; x < 32; x += 8) {
      const ox = (y % 16 === 0 ? 0 : 4);
      const cx = x + ox + 3, cy = y + 3;
      pc.set(cx, cy - 1, R[4]); pc.set(cx - 1, cy, R[4]); pc.set(cx + 1, cy, R[4]); pc.set(cx, cy + 1, R[4]); pc.set(cx, cy, 0xf0e070);
      pc.set(cx + 1, cy + 2, 0x7aa86a); pc.set(cx + 2, cy + 2, 0x7aa86a);
    }
  });
  A.add('p_plush', 16, 16, (pc) => fur(pc, 0x9a6a42, 3));
  A.add('p_plush_light', 16, 16, (pc) => fur(pc, 0xd8b890, 5));
  A.add('p_afghan', 16, 16, (pc) => {
    const cols = [0xc85050, 0xe8b040, 0x5a9a6a, 0x5070b0, 0xa060a0, 0xe08040];
    for (let by = 0; by < 2; by++) for (let bx = 0; bx < 2; bx++) for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const r = Math.max(Math.abs(x - 3.5), Math.abs(y - 3.5));
      const ring = Math.floor(r);
      const c = ring >= 3 ? 0x2a2a2a : cols[(ring + bx * 2 + by * 3) % cols.length];
      pc.set(bx * 8 + x, by * 8 + y, (x + y) % 2 === 0 ? c : mixHex(c, 0xffffff, 0.15));
    }
  });
  A.add('p_denim', 16, 16, (pc) => {
    const R = makeRamp(0x4a6a9a, 5, { spread: 0.35 });
    pc.fillRamp(R, (x, y) => 0.5 + ((x + y) % 4 < 2 ? 0.1 : -0.05) + (tileFbm(x, y, 16, 16, 2, 2, 6) - 0.5) * 0.4, 0.7);
  });
  A.add('p_basket', 16, 16, (pc) => {
    pc.fill(0xe8e8ec);
    for (let y = 2; y < 16; y += 5) for (let x = 1; x < 16; x += 4) { pc.rect(x, y, 2, 3, 0x6a6e78); pc.set(x, y, 0x4a4e58); }
    pc.hline(0, 15, 0, 0xffffff); pc.hline(0, 15, 1, 0xc8c8d0);
  });
  A.add('p_tv_bars', 16, 12, (pc) => {
    pc.wrap = false;
    const bars = [0xc0c0c0, 0xc0c000, 0x00c0c0, 0x00c000, 0xc000c0, 0xc00000, 0x0000c0];
    for (let x = 0; x < 16; x++) for (let y = 0; y < 12; y++) {
      const b = bars[Math.min(6, Math.floor(x / 16 * 7))];
      pc.set(x, y, y < 8 ? b : y < 9 ? bars[6 - Math.min(6, Math.floor(x / 16 * 7))] : (x < 4 ? 0x10205a : x < 8 ? 0xf0f0f0 : x < 12 ? 0x3a1a6a : 0x0a0a0a));
    }
    txt(pc, 'CH3', 1, 1, 0xf0f0f0);
    crtGlass(pc, 0, 0, 16, 12, 0x06080a, 0.55);
  });
  A.add('p_speaker_cloth', 8, 8, (pc) => {
    pc.each((x, y) => pc.set(x, y, (x + y) % 2 === 0 ? 0x5a4632 : (x % 2 ? 0x4a3828 : 0x6a5440)));
  });
  A.add('p_vhs', 32, 6, (pc) => {
    for (let x = 0; x < 32; x++) {
      const k = Math.floor(x / 2.3);
      const sleeve = [0x1a1a1c, 0x2a2a30, 0xd8d0b8, 0x1a1a1c, 0x3a2a2a][k % 5];
      for (let y = 0; y < 6; y++) pc.set(x, y, sleeve);
      if (Math.floor((x + 1) / 2.3) !== k) for (let y = 0; y < 6; y++) pc.set(x, y, 0x0a0a0c);
      else if (sleeve !== 0xd8d0b8) { pc.set(x, 2, 0xe8e4d8); pc.set(x, 3, ph(k, 2, 4) < 0.5 ? 0xe8e4d8 : 0xc04040); }
    }
  });
  A.add('p_vcr', 14, 3, (pc) => {
    pc.wrap = false;
    pc.fill(0x1e1e22); pc.hline(0, 13, 0, 0x3a3a40);
    pc.hline(1, 6, 1, 0x0a0a0c);
    pc.set(9, 1, 0x50f070); pc.set(10, 1, 0x50f070); pc.set(12, 1, 0x50f070); pc.set(13, 1, 0x50f070); // the flashing 12:00
    pc.set(8, 2, 0xc8c8c8);
  });
  A.add('p_lampshade', 16, 9, (pc) => {
    pc.wrap = false;
    const R = makeRamp(0xe8d8b0, 5, { spread: 0.3 });
    fillR(pc, 0, 0, 16, 9, R, (x, y) => 0.45 + y * 0.06 + (x % 4 === 0 ? -0.15 : 0), 1);
    pc.hline(0, 15, 0, R[1]); pc.hline(0, 15, 8, R[2]);
    pc.stain(11, 5, 1.5, 0xc8b080, 0xa89060, 2);
  });
  A.add('p_shade_top', 8, 8, (pc) => {
    pc.wrap = false;
    pc.fill(0xd8c8a0);
    pc.circle(4, 4, 3.6, 0xfff4c8); pc.circle(4, 4, 2, 0xffffff);
  });
  A.add('p_brick_fire', 16, 16, (pc) => {
    const R = makeRamp(0x9a4a34, 5, { hueShift: 0.03 });
    pc.each((x, y) => {
      const row = y >> 2, off = (row % 2) * 4;
      const mortar = y % 4 === 3 || (x + off) % 8 === 7;
      const b = Math.floor(ph(Math.floor((x + off) / 8), row, 5) * 3);
      pc.set(x, y, mortar ? 0x8a8070 : R[1 + b + (y % 4 === 0 ? 1 : 0) > 4 ? 4 : 1 + b + (y % 4 === 0 ? 1 : 0)]);
    });
  });
  A.add('p_soot', 16, 16, (pc) => {
    pc.fillRamp([0x0e0c0a, 0x1a1612, 0x262018, 0x322a20], (x, y) => 0.4 + (tileFbm(x, y, 16, 16, 3, 2, 9) - 0.5) * 0.6 + y / 40, 1);
  });
  A.add('p_flames', 16, 10, (pc) => {
    pc.wrap = false;
    pc.fill(0x140804);
    const F = [0x5a1a08, 0xb83a10, 0xf07a20, 0xf8c040, 0xfff0a0];
    for (let x = 0; x < 16; x++) {
      const h = 3 + Math.floor((Math.sin(x * 1.3) * 0.5 + 0.5) * 6 * (1 - Math.abs(x - 7.5) / 10)) + (ph(x, 1, 3) < 0.3 ? 1 : 0);
      for (let k = 0; k < h; k++) pc.set(x, 9 - k, F[Math.min(4, Math.floor((1 - k / h) * 4.5))]);
    }
  });
  A.add('p_log_end', 6, 6, (pc) => {
    pc.wrap = false;
    pc.fill(0x5a3a22); pc.circle(3, 3, 2.6, 0xb8946a); pc.circle(3, 3, 1.6, 0xa07a52); pc.set(3, 3, 0x6a4a2a);
  });
  A.add('p_piano_keys', 48, 5, (pc) => {
    pc.wrap = false;
    for (let x = 0; x < 48; x++) for (let y = 0; y < 5; y++) pc.set(x, y, x % 2 === 1 ? 0xc8c4b8 : 0xf4f0e2);
    for (let x = 0; x < 48; x++) pc.set(x, 4, 0xa8a498);
    for (let w = 0; w < 23; w++) {
      const k = w % 7;
      if (k === 0 || k === 1 || k === 3 || k === 4 || k === 5) for (let y = 0; y < 3; y++) pc.set(w * 2 + 1, y, 0x141210);
    }
    pc.set(20, 3, 0x9a9a90); // a chipped key
  });
  A.add('p_sheet_music', 10, 7, (pc) => {
    pc.wrap = false;
    pc.fill(0xf0ead8);
    for (let r = 0; r < 3; r++) { pc.hline(1, 8, 1 + r * 2, 0xa8a090); for (let k = 0; k < 4; k++) if (ph(k, r, 3) < 0.7) pc.set(2 + k * 2, 1 + r * 2 - (ph(k, r, 5) < 0.5 ? 1 : 0), 0x2a2a2a); }
    pc.vline(9, 0, 6, 0xd8d0b8);
  });
  A.add('p_toybox', 26, 14, (pc) => {
    pc.wrap = false;
    const R = makeRamp(0x9ac8e0, 5, { spread: 0.3 });
    fillR(pc, 0, 0, 26, 14, R, (x, y) => 0.55 + (ph(x, y, 3) - 0.5) * 0.1, 1);
    pc.hline(0, 25, 0, R[4]); pc.hline(0, 25, 13, R[0]);
    const blk = (x: number, y: number, c: number, ch: string) => { pc.rect(x, y, 6, 7, c); pc.hline(x, x + 5, y, mixHex(c, 0xffffff, 0.4)); pc.vline(x + 5, y, y + 6, scaleHex(c, 0.7)); txt(pc, ch, x + 1, y + 1, 0xffffff); };
    blk(2, 4, 0xe86a6a, 'A'); blk(10, 4, 0xf0c050, 'B'); blk(18, 4, 0x70b870, 'C');
    for (const [sx, sy] of [[1, 1], [9, 2], [24, 2], [16, 12]]) { pc.set(sx, sy, 0xfff8c0); }
    pc.hline(3, 22, 12, R[2]);
  });
  A.add('p_horse', 16, 16, (pc) => {
    pc.fill(0xf0ece4);
    for (let i = 0; i < 9; i++) { const x = (i * 7) % 16, y = (i * 11) % 16; pc.ditherBlob(x, y, 2.2, 1.8, 0xb8b4ac, 1); pc.set(x, y, 0xa8a49c); }
  });
  A.add('p_dollhouse', 26, 22, (pc) => {
    pc.wrap = false;
    const W = makeRamp(0xf0b8c4, 5, { spread: 0.25 });
    fillR(pc, 0, 0, 26, 22, W, (x, y) => 0.55 + ((y % 3) === 0 ? -0.08 : 0) + (ph(x, y, 2) - 0.5) * 0.05, 1);
    pc.hline(0, 25, 10, 0xffffff); pc.hline(0, 25, 11, 0xd8c8c8);
    const win = (x: number, y: number, lit: boolean) => {
      pc.rect(x, y, 5, 5, lit ? 0xf8e08a : 0x5a6a8a); pc.strokeRect(x - 1, y - 1, 7, 7, 0xffffff);
      pc.vline(x + 2, y, y + 4, 0xffffff); pc.hline(x, x + 4, y + 2, 0xffffff);
      pc.set(x, y, 0xe8a0b0); pc.set(x + 4, y, 0xe8a0b0);
    };
    win(3, 3, false); win(18, 3, true); win(3, 14, false); win(18, 14, false);
    pc.set(19, 4, 0x2a1a1a); pc.set(19, 5, 0x2a1a1a); // a tiny figure in the lit window
    pc.rect(10, 13, 6, 9, 0xb84040); pc.strokeRect(9, 12, 8, 10, 0xffffff); pc.set(14, 17, 0xf0d060);
    pc.rect(11, 3, 4, 5, 0xffffff); pc.circle(13, 5, 1.2, 0x8ab4d8);
  });
  A.add('p_shingles', 16, 16, (pc) => {
    const R = makeRamp(0x7a8ab0, 5);
    pc.each((x, y) => { const row = y >> 2, off = (row % 2) * 3; const e = (x + off) % 6 === 0; pc.set(x, y, y % 4 === 3 ? R[0] : e ? R[1] : R[2 + (y % 4 === 0 ? 1 : 0)]); });
  });
  A.add('p_alarm', 6, 3, (pc) => {
    pc.wrap = false;
    pc.fill(0x1a1414); pc.set(1, 1, 0xff3030); pc.set(2, 1, 0xff3030); pc.set(4, 1, 0xff3030); pc.set(3, 0, 0x5a1a1a); pc.set(3, 2, 0x5a1a1a);
  });
  A.add('p_photo_frame', 5, 6, (pc) => {
    pc.wrap = false;
    pc.fill(0xc8a050); pc.rect(1, 1, 3, 4, 0x8ab0c8); pc.set(2, 2, 0xd8b090); pc.set(2, 3, 0x6a5a8a); pc.set(1, 4, 0x6a8a5a); pc.set(3, 4, 0x6a8a5a);
  });
  A.add('p_wall_photo', 9, 7, (pc) => {
    pc.wrap = false;
    pc.fill(0x9ab4c8); pc.rect(0, 4, 9, 3, 0x7a9a6a);
    // a family of four; the last face never came out right
    for (const [x, c] of [[1, 0xd8b090], [3, 0xd8b090], [5, 0xe0c0a0], [7, 0x9aa4ac]] as const) { pc.set(x, 2, c); pc.set(x, 3, 0x5a4a6a); pc.set(x, 4, 0x3a3a5a); }
    pc.set(7, 1, 0xb8c0c8); pc.set(8, 2, 0xb8c0c8);
  });
});

// ============================================================ builders
function bedFrame(mb: ModelBuilder, W: number, L: number, headH: number, footH: number, wood = 'wood_dark') {
  const z0 = WZ2 + 0.02, z1 = z0 + L;
  // headboard posts + panel
  for (const sx of [-1, 1]) {
    mb.box(sx * (W / 2 - 0.03), 0, z0 + 0.03, 0.06, headH, 0.06, wood);
    mb.box(sx * (W / 2 - 0.03), headH, z0 + 0.03, 0.075, 0.04, 0.075, wood);
    mb.box(sx * (W / 2 - 0.03), 0, z1 - 0.03, 0.06, footH, 0.06, wood);
    mb.box(sx * (W / 2 - 0.03), footH, z1 - 0.03, 0.07, 0.035, 0.07, wood);
  }
  mb.box(0, 0.32, z0 + 0.03, W - 0.1, headH - 0.42, 0.035, wood);
  mb.box(0, headH - 0.12, z0 + 0.03, W - 0.06, 0.08, 0.05, wood);
  mb.box(0, 0.3, z1 - 0.03, W - 0.1, footH - 0.38, 0.03, wood);
  mb.box(0, footH - 0.1, z1 - 0.03, W - 0.06, 0.06, 0.045, wood);
  // side rails
  for (const sx of [-1, 1]) mb.box(sx * (W / 2 - 0.03), 0.18, (z0 + z1) / 2, 0.04, 0.14, L - 0.1, wood);
  return { z0, z1 };
}

function bedding(mb: ModelBuilder, W: number, z0: number, z1: number, quilt: string, pillows: number, sheetCol = 0xf0eee8) {
  const mw = W - 0.1, y = 0.3;
  mb.box(0, y, (z0 + z1) / 2, mw, 0.18, z1 - z0 - 0.08, 'mattress');
  // quilt over the lower 70%, draping over the sides
  const qz0 = z0 + (z1 - z0) * 0.3;
  mb.box(0, y + 0.18, (qz0 + z1 - 0.03) / 2, mw + 0.02, 0.04, z1 - 0.04 - qz0, { top: quilt, all: quilt });
  for (const sx of [-1, 1]) mb.box(sx * (mw / 2 + 0.02), y - 0.06, (qz0 + z1 - 0.03) / 2, 0.025, 0.28, z1 - 0.04 - qz0, quilt);
  mb.box(0, y - 0.06, z1 - 0.04, mw + 0.06, 0.28, 0.025, quilt);
  // folded sheet edge
  mb.box(0, y + 0.18, qz0 + 0.06, mw + 0.025, 0.05, 0.13, 'pillow', { color: sheetCol });
  const pw = (mw - 0.08) / pillows;
  for (let i = 0; i < pillows; i++) {
    const x = -mw / 2 + 0.04 + pw * (i + 0.5);
    mb.push().translate(x, y + 0.18, z0 + 0.25).rotateX(-0.25);
    mb.box(0, 0, 0, pw - 0.04, 0.1, 0.36, 'pillow'); mb.pop();
  }
}

// ============================================================ models
defObj({
  key: 'bed_single', name: 'Single Bed', w: 1, d: 2, height: 0.95, block: 'low', sleep: 0.8, sit: true, movable: 40,
  sound: 'fabric', flammable: 0.8,
  disassemble: { tools: ['#hammer', '#screwdriver'], time: 25, skill: 'carpentry', yields: [['plank', 2, 4], ['nails', 2, 5], ['spring', 1, 3], ['rag', 2, 4]] },
  tags: T('home', 'bed', 'sleep', 'bedroom', 'sit'),
  model: (mb) => {
    const { z0, z1 } = bedFrame(mb, 0.98, 1.98, 0.95, 0.6);
    bedding(mb, 0.98, z0, z1, 'p_quilt', 1);
  },
});

defObj({
  key: 'bed_double', name: 'Double Bed', w: 2, d: 2, height: 1.05, block: 'low', sleep: 0.9, sit: true, movable: 70,
  sound: 'fabric', flammable: 0.8,
  disassemble: { tools: ['#hammer', '#screwdriver'], time: 35, skill: 'carpentry', yields: [['plank', 3, 6], ['nails', 3, 8], ['spring', 2, 5], ['rag', 3, 6]] },
  tags: T('home', 'bed', 'sleep', 'bedroom', 'sit'),
  model: (mb) => {
    const { z0, z1 } = bedFrame(mb, 1.62, 2.0, 1.05, 0.6);
    bedding(mb, 1.62, z0, z1, 'p_bedspread', 2);
    // turned-back corner on one side, as if someone just got up
    mb.push().translate(0.42, 0.53, z0 + 0.72).rotateY(0.6);
    mb.box(0, 0, 0, 0.5, 0.02, 0.36, 'pillow', { color: 0xe8e4dc }); mb.pop();
  },
});

defObj({
  key: 'bunk_bed', name: 'Bunk Bed', w: 1, d: 2, height: 1.8, block: 'solid', sleep: 0.7, sit: true, movable: 60,
  sound: 'metal', flammable: 0.5,
  disassemble: { tools: ['#wrench', '#screwdriver'], time: 30, skill: 'mechanics', yields: [['pipe', 2, 4], ['scrap_metal', 2, 4], ['spring', 1, 4], ['rag', 2, 4]] },
  tags: T('home', 'bed', 'sleep', 'bedroom', 'school', 'sit'),
  model: (mb) => {
    const W = 0.96, z0 = WZ2 + 0.03, z1 = z0 + 1.96, m = 'metal_grey', mc = { color: 0x8aa0b8 };
    for (const sx of [-1, 1]) for (const z of [z0 + 0.025, z1 - 0.025]) mb.cylinder(sx * (W / 2 - 0.025), 0, z, 0.022, 1.8, 6, m, mc);
    for (const y of [0.28, 1.25]) {
      for (const sx of [-1, 1]) mb.box(sx * (W / 2 - 0.025), y, (z0 + z1) / 2, 0.035, 0.05, z1 - z0, m, mc);
      for (const z of [z0 + 0.025, z1 - 0.025]) mb.box(0, y, z, W - 0.05, 0.05, 0.035, m, mc);
      mb.box(0, y + 0.05, (z0 + z1) / 2, W - 0.1, 0.14, z1 - z0 - 0.1, 'mattress');
      mb.box(0, y + 0.19, z0 + 0.62 + (y > 1 ? 0 : 0.1), W - 0.1, 0.035, (z1 - z0) * 0.6, { top: y > 1 ? 'p_quilt' : 'fabric_blue', all: y > 1 ? 'p_quilt' : 'fabric_blue' }, y > 1 ? {} : { color: 0xa8b8d0 });
      mb.push().translate(0, y + 0.19, z0 + 0.22).rotateX(-0.2); mb.box(0, 0, 0, W - 0.24, 0.09, 0.3, 'pillow'); mb.pop();
    }
    for (const z of [z0 + 0.025, z1 - 0.025]) for (const y of [0.62, 1.62]) mb.box(0, y, z, W - 0.05, 0.035, 0.03, m, mc);
    // guard rail on the top bunk
    mb.box(W / 2 - 0.025, 1.5, (z0 + z1) / 2 - 0.25, 0.03, 0.03, 1.2, m, mc);
    for (const z of [-0.8, 0.35]) mb.box(W / 2 - 0.025, 1.3, z, 0.03, 0.22, 0.03, m, mc);
    // ladder at the foot end
    for (const dz of [0.0, 0.32]) mb.box(W / 2 + 0.02, 0, z1 - 0.42 + dz, 0.03, 1.5, 0.03, m, mc);
    for (let i = 0; i < 4; i++) mb.box(W / 2 + 0.02, 0.32 + i * 0.32, z1 - 0.26, 0.03, 0.025, 0.32, m, mc);
  },
});

defObj({
  key: 'crib', name: 'Crib', height: 1.0, block: 'solid', sleep: 0.2, movable: 20,
  sound: 'wood', flammable: 0.8,
  disassemble: { tools: ['#hammer'], time: 15, skill: 'carpentry', yields: [['plank', 2, 3], ['nails', 2, 5], ['rag', 1, 2]] },
  tags: T('home', 'nursery', 'decor', 'sleep'),
  model: (mb) => {
    const W = 0.94, D = 0.64, zc = WZ + D / 2 + 0.02, w = 'wood_light', wc = { color: 0xfff4ec };
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mb.box(sx * (W / 2 - 0.025), 0, zc + sz * (D / 2 - 0.025), 0.05, 1.0, 0.05, w, wc);
    for (const sz of [-1, 1]) {
      for (const y of [0.25, 0.86]) mb.box(0, y, zc + sz * (D / 2 - 0.025), W - 0.05, 0.04, 0.035, w, wc);
      for (let i = 0; i < 9; i++) mb.box(-W / 2 + 0.1 + i * 0.093, 0.29, zc + sz * (D / 2 - 0.025), 0.022, 0.57, 0.022, w, wc);
    }
    for (const sx of [-1, 1]) {
      mb.box(sx * (W / 2 - 0.025), 0.25, zc, 0.035, 0.66, D - 0.05, w, wc);
      mb.box(sx * (W / 2 - 0.025), 0.9, zc, 0.04, 0.06, D - 0.02, w, wc);
    }
    mb.box(0, 0.3, zc, W - 0.08, 0.1, D - 0.08, 'mattress', { color: 0xe0ecf0 });
    mb.box(0.12, 0.4, zc + 0.04, 0.4, 0.03, 0.42, 'p_quilt');
    // a small worn bear lying face down
    mb.sphere(-0.24, 0.47, zc, 0.07, 6, 4, 'p_plush', { sy: 0.7 });
    mb.sphere(-0.33, 0.46, zc + 0.02, 0.05, 6, 4, 'p_plush');
    // the mobile, no longer turning
    mb.box(W / 2 - 0.025, 1.0, zc, 0.02, 0.3, 0.02, w, wc);
    mb.box(W / 2 - 0.13, 1.28, zc, 0.22, 0.02, 0.02, w, wc);
    for (const [dx, dz, c] of [[-0.1, 0.06, 0xf0c0c8], [-0.16, -0.05, 0xb8d8f0], [-0.06, -0.06, 0xf8e8a0]] as const) {
      mb.box(W / 2 - 0.24 - dx * 0.1, 1.12, zc + dz, 0.004, 0.16, 0.004, 'paper');
      mb.sphere(W / 2 - 0.24 - dx * 0.1, 1.1, zc + dz, 0.03, 5, 3, 'white', { color: c });
    }
  },
});

defObj({
  key: 'nightstand', name: 'Nightstand', height: 0.58, block: 'table', surface: 0.56, movable: 12,
  container: { capacity: 8, kind: 'drawer', loot: 'nightstand' }, sound: 'wood', flammable: 0.8,
  disassemble: { tools: ['#hammer'], time: 8, skill: 'carpentry', yields: [['plank', 1, 2], ['nails', 1, 3]] },
  tags: T('home', 'bedroom', 'table'),
  model: (mb) => {
    const W = 0.46, D = 0.38, zc = WZ + D / 2 + 0.02, zf = zc + D / 2;
    rlegs4(mb, W - 0.02, D - 0.02, 0.1, 0.02, 'wood_dark', { rTop: 0.016 }, 0, zc);
    mb.box(0, 0.1, zc, W, 0.42, D, 'wood_dark');
    mb.box(0, 0.52, zc, W + 0.03, 0.035, D + 0.02, 'wood_dark', { color: 0xd8c8b8 });
    mb.box(0, 0.36, zf + 0.008, W - 0.05, 0.14, 0.016, 'wood_dark', { color: 0xe8d8c8 });
    knob(mb, 0, 0.43, zf + 0.016, 0.025, 'metal_brass');
    mb.box(0, 0.13, zf - 0.02, W - 0.05, 0.2, 0.012, 'wood_dark', { color: 0x4a3a30 });
    mb.box(0.02, 0.13, zf - 0.08, 0.26, 0.04, 0.18, 'p_books_a', { color: 0xd0d0d0 });
    // alarm clock stuck blinking
    mb.box(-0.13, 0.555, zc - 0.08, 0.12, 0.07, 0.07, { south: 'p_alarm', all: 'plastic_black' }, { fit: { south: true }, emissive: 0.6 });
  },
});

defObj({
  key: 'dresser', name: 'Dresser', height: 1.0, block: 'solid', surface: 0.86, movable: 45,
  container: { capacity: 25, kind: 'drawer', loot: 'bedroom_dresser' }, sound: 'wood', flammable: 0.8,
  disassemble: { tools: ['#hammer', '#saw'], time: 18, skill: 'carpentry', yields: [['plank', 2, 4], ['nails', 2, 6]] },
  tags: T('home', 'bedroom', 'cabinet'),
  model: (mb) => {
    const W = 1.0, D = 0.48, zc = WZ + D / 2 + 0.01, zf = zc + D / 2;
    mb.box(0, 0, zc, W - 0.04, 0.08, D - 0.04, 'wood_dark', { color: 0x9a8a7a });
    mb.box(0, 0.06, zc, W, 0.76, D, 'wood_dark');
    mb.box(0, 0.82, zc + 0.01, W + 0.04, 0.04, D + 0.03, 'wood_dark', { color: 0xd8c8b8 });
    const cells = frontGrid(mb, -W / 2 + 0.03, W / 2 - 0.03, 0.09, 0.8, zf, [1, 1], [1, 1.25, 1.25], 'wood_dark', { color: 0xe8dcd0 }, 0.025, 'wood_dark');
    for (const c of cells) { const cx = (c.x0 + c.x1) / 2, cy = (c.y0 + c.y1) / 2; knob(mb, cx, cy + 0.01, zf + 0.02, 0.03, 'metal_brass'); }
    // a doily, a framed photo, a little dish of hairpins
    mb.box(-0.1, 0.861, zc, 0.36, 0.003, 0.3, 'p_lace');
    mb.push().translate(0.3, 0.86, zc - 0.08).rotateY(-0.25).rotateX(-0.15);
    mb.box(0, 0, 0, 0.13, 0.17, 0.015, { south: 'p_photo_frame', all: 'metal_brass' }, { fit: { south: true } }); mb.pop();
    mb.cylinder(-0.1, 0.864, zc, 0.06, 0.02, 8, 'porcelain', { rTop: 0.08, color: 0xd8e8f0 });
  },
});

defObj({
  key: 'wardrobe', name: 'Wardrobe', height: 2.0, block: 'solid', blocksSight: true, movable: 70,
  container: { capacity: 40, kind: 'wardrobe', loot: 'wardrobe' }, sound: 'wood', flammable: 0.8,
  disassemble: { tools: ['#hammer', '#saw'], time: 30, skill: 'carpentry', yields: [['plank', 4, 7], ['nails', 4, 9]] },
  tags: T('home', 'bedroom', 'cabinet'),
  model: (mb) => {
    const W = 1.02, D = 0.58, zc = WZ + D / 2 + 0.01, zf = zc + D / 2, H = 1.92;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mb.box(sx * (W / 2 - 0.05), 0, zc + sz * (D / 2 - 0.05), 0.06, 0.08, 0.06, 'wood_dark');
    mb.box(0, 0.08, zc, W, H - 0.08, D, 'wood_dark');
    mb.box(0, H, zc + 0.01, W + 0.06, 0.05, D + 0.04, 'wood_dark', { color: 0xc8b8a8 });
    mb.box(0, H - 0.04, zc + 0.01, W + 0.03, 0.04, D + 0.02, 'wood_trim');
    mb.box(0, 0.08, zf + 0.008, W - 0.04, 0.14, 0.016, 'wood_dark', { color: 0xe0d0c0 });
    for (const sx of [-1, 1]) {
      const cx = sx * (W / 4 - 0.005);
      mb.box(cx, 0.24, zf + 0.008, W / 2 - 0.03, H - 0.3, 0.016, 'wood_dark', { color: 0xf0e4d8 });
      mb.box(cx, 1.15, zf + 0.018, W / 2 - 0.15, 0.62, 0.012, 'wood_dark', { color: 0xd8c8b8 });
      mb.box(cx, 0.36, zf + 0.018, W / 2 - 0.15, 0.68, 0.012, 'wood_dark', { color: 0xd8c8b8 });
      mb.box(sx * 0.04, 1.0, zf + 0.03, 0.02, 0.16, 0.025, 'metal_brass');
    }
    // the left door does not quite close
    mb.box(-0.005, 0.26, zf + 0.02, 0.006, H - 0.34, 0.012, 'wood_dark', { color: 0x2a2018 });
  },
});

function sofaBody(mb: ModelBuilder, W: number, seats: number, fab: string, col: number) {
  const D = 0.86, zc = WZ + D / 2 + 0.02, c = { color: col };
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) mb.cylinder(sx * (W / 2 - 0.08), 0, zc + sz * (D / 2 - 0.08), 0.025, 0.1, 6, 'wood_dark', { rTop: 0.03 });
  mb.box(0, 0.1, zc, W, 0.3, D, fab, c);
  mb.box(0, 0.4, zc - D / 2 + 0.12, W - 0.02, 0.48, 0.24, fab, c);
  for (const sx of [-1, 1]) {
    mb.box(sx * (W / 2 - 0.09), 0.4, zc + 0.03, 0.18, 0.24, D - 0.06, fab, c);
    mb.cylinderZ(sx * (W / 2 - 0.09), 0.64, zc + 0.03, 0.09, D - 0.06, 8, fab, { ...c, caps: true });
  }
  const sw = (W - 0.36) / seats;
  for (let i = 0; i < seats; i++) {
    const x = -W / 2 + 0.18 + sw * (i + 0.5);
    mb.box(x, 0.4, zc + 0.1, sw - 0.02, 0.14, D - 0.28, fab, { color: scaleHex(col, 1.04) });
    mb.push().translate(x, 0.54, zc - D / 2 + 0.3).rotateX(-0.2);
    mb.box(0, 0, 0, sw - 0.03, 0.36, 0.16, fab, { color: scaleHex(col, 0.98) }); mb.pop();
  }
  return { zc, D };
}

defObj({
  key: 'sofa', name: 'Sofa', w: 2, d: 1, height: 0.9, block: 'low', sit: true, sleep: 0.5, movable: 55,
  sound: 'fabric', flammable: 0.9,
  disassemble: { tools: ['#hammer', '#knife'], time: 25, skill: 'carpentry', yields: [['plank', 2, 4], ['rag', 3, 6], ['spring', 2, 5], ['nails', 2, 5]] },
  tags: T('home', 'living', 'sit', 'sofa', 'sleep'),
  model: (mb) => {
    const { zc } = sofaBody(mb, 1.96, 3, 'fabric_floral', 0xffffff);
    // crocheted throw over the back and a lost remote between cushions
    mb.box(0.45, 0.82, zc - 0.34, 0.5, 0.05, 0.24, 'p_afghan');
    mb.box(0.45, 0.5, zc - 0.21, 0.5, 0.33, 0.03, 'p_afghan');
    mb.box(-0.22, 0.545, zc + 0.12, 0.05, 0.02, 0.16, 'plastic_black');
  },
});

defObj({
  key: 'armchair', name: 'Armchair', height: 0.9, block: 'low', sit: true, movable: 30,
  sound: 'fabric', flammable: 0.9,
  disassemble: { tools: ['#hammer', '#knife'], time: 15, skill: 'carpentry', yields: [['plank', 1, 2], ['rag', 2, 4], ['spring', 1, 3]] },
  tags: T('home', 'living', 'sit'),
  model: (mb) => {
    // wingback armchair with an antimacassar
    const f = 'fabric_green', zc = WZ + 0.44, c = { color: 0xd8e0c8 };
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mb.cylinder(sx * 0.33, 0, zc + sz * 0.3, 0.025, 0.12, 6, 'wood_dark', { rTop: 0.032 });
    mb.box(0, 0.12, zc, 0.84, 0.3, 0.76, f, c);
    mb.box(0, 0.1, zc + 0.385, 0.84, 0.08, 0.012, f, { color: 0xb8c4a8 });
    mb.box(0, 0.42, zc + 0.07, 0.58, 0.12, 0.6, f, { color: 0xe4ecd4 });
    mb.push().translate(0, 0.42, zc - 0.3).rotateX(-0.12);
    mb.box(0, 0, 0, 0.84, 0.66, 0.16, f, c);
    for (const sx of [-1, 1]) mb.box(sx * 0.37, 0.28, 0.14, 0.1, 0.38, 0.3, f, c);
    mb.box(0, 0.42, 0.085, 0.36, 0.2, 0.01, 'p_lace');
    mb.pop();
    for (const sx of [-1, 1]) {
      mb.box(sx * 0.35, 0.42, zc + 0.06, 0.14, 0.18, 0.66, f, c);
      mb.cylinderZ(sx * 0.35, 0.6, zc + 0.06, 0.08, 0.68, 8, f, { ...c, caps: true });
    }
  },
});

defObj({
  key: 'coffee_table', name: 'Coffee Table', height: 0.45, block: 'table', surface: 0.44, movable: 18,
  sound: 'wood', flammable: 0.8,
  disassemble: { tools: ['#hammer'], time: 10, skill: 'carpentry', yields: [['plank', 1, 3], ['nails', 1, 4]] },
  tags: T('home', 'living', 'table'),
  model: (mb) => {
    rlegs4(mb, 0.96, 0.5, 0.41, 0.025, 'wood_dark', { rTop: 0.018 });
    mb.box(0, 0.4, 0, 1.0, 0.04, 0.54, 'wood_dark', { color: 0xe0d0c0 });
    mb.box(0, 0.1, 0, 0.9, 0.025, 0.44, 'wood_dark');
    for (let i = 0; i < 3; i++) { mb.push().translate(-0.2 + i * 0.03, 0.125 + i * 0.01, 0.02).rotateY(i * 0.2 - 0.1); mb.box(0, 0, 0, 0.21, 0.008, 0.28, { top: 'p_magazine', all: 'paper' }, { fit: { top: true } }); mb.pop(); }
    mb.box(0.3, 0.44, 0.08, 0.05, 0.02, 0.16, 'plastic_black');
    mb.cylinder(-0.3, 0.44, -0.06, 0.08, 0.025, 8, 'glass', { color: 0xa8b8a0 });
    mb.box(-0.3, 0.465, -0.06, 0.05, 0.008, 0.008, 'paper', { color: 0xf0e8d8 });
  },
});

defObj({
  key: 'tv_crt', name: 'Television', height: 1.15, block: 'low', movable: 30, power: true, hum: 'tv',
  light: { color: 0xa8c8ff, intensity: 0.4, radius: 3.0, y: 0.75, kind: 'screen', power: true, flicker: 0.05 },
  sound: 'wood', flammable: 0.5,
  disassemble: { tools: ['#screwdriver'], time: 20, skill: 'electrical', yields: [['electronics_scrap', 2, 4], ['glass_shard', 2, 3], ['wire', 1, 2], ['plank', 0, 1]] },
  tags: T('home', 'living', 'tv', 'electronics'),
  variant: (s) => (on(s) ? 'on' : 'off'),
  model: (mb, s) => {
    const zc = -0.05, lit = on(s);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      mb.push().translate(sx * 0.3, 0, zc + sz * 0.17).rotateZ(-sx * 0.15).rotateX(sz * 0.15);
      mb.cylinder(0, 0, 0, 0.018, 0.3, 6, 'wood_dark', { rTop: 0.025 }); mb.pop();
    }
    mb.box(0, 0.28, zc, 0.8, 0.58, 0.5, 'wood_dark');
    mb.box(0, 0.28, zc - 0.32, 0.52, 0.4, 0.16, 'plastic_black', { color: 0x6a6058 });
    mb.box(-0.09, 0.33, zc + 0.252, 0.54, 0.46, 0.012, 'plastic_black', { color: 0x8a847a });
    mb.box(-0.09, 0.36, zc + 0.26, 0.48, 0.4, 0.012, { south: lit ? 'p_tv_bars' : 'p_crt_off', all: 'glass_dark' }, { fit: { south: true }, emissive: lit ? 0.85 : 0 });
    mb.box(0.29, 0.33, zc + 0.252, 0.18, 0.46, 0.01, 'p_speaker_cloth');
    mb.cylinderZ(0.29, 0.7, zc + 0.27, 0.035, 0.03, 8, 'chrome');
    mb.cylinderZ(0.29, 0.6, zc + 0.27, 0.03, 0.03, 8, 'chrome');
    // rabbit ears
    mb.cylinder(0.1, 0.86, zc - 0.05, 0.05, 0.04, 8, 'plastic_black');
    for (const a of [-0.45, 0.55]) { mb.push().translate(0.1, 0.9, zc - 0.05).rotateZ(a); mb.cylinder(0, 0, 0, 0.006, 0.36, 4, 'chrome'); mb.pop(); }
  },
});

defObj({
  key: 'tv_stand', name: 'TV Stand', height: 0.52, block: 'table', surface: 0.5, movable: 20,
  container: { capacity: 15, kind: 'cabinet', loot: 'generic' }, sound: 'wood', flammable: 0.7,
  disassemble: { tools: ['#hammer'], time: 10, skill: 'carpentry', yields: [['plank', 1, 3], ['nails', 1, 4], ['glass_shard', 0, 1]] },
  tags: T('home', 'living', 'cabinet', 'table'),
  model: (mb) => {
    const W = 1.0, D = 0.45, zc = WZ + D / 2 + 0.02, zf = zc + D / 2;
    mb.box(0, 0, zc, W, 0.05, D, 'wood_dark', { color: 0x8a7a6a });
    mb.box(0, 0.47, zc, W + 0.02, 0.035, D + 0.02, 'wood_dark', { color: 0xd8c8b8 });
    for (const x of [-W / 2 + 0.015, 0, W / 2 - 0.015]) mb.box(x, 0.05, zc, 0.03, 0.42, D, 'wood_dark');
    mb.box(0, 0.05, zc - D / 2 + 0.01, W, 0.42, 0.02, 'wood_dark', { color: 0x5a4a3a });
    mb.box(0, 0.26, zc, W - 0.04, 0.02, D - 0.02, 'wood_dark');
    // left: VCR + tapes behind smoky glass; right: open shelf of tapes
    mb.box(-0.25, 0.05, zc + 0.02, 0.42, 0.08, 0.32, { south: 'p_vcr', all: 'plastic_black' }, { fit: { south: true }, emissive: 0.3 });
    mb.box(-0.25, 0.28, zc, 0.44, 0.13, 0.2, { south: 'p_vhs', all: 'plastic_black' });
    mb.box(-0.25, 0.06, zf - 0.005, 0.46, 0.4, 0.008, 'glass_dark', { color: 0x9aa0a0 });
    knob(mb, -0.06, 0.25, zf, 0.025, 'metal_brass');
    mb.box(0.25, 0.07, zc, 0.44, 0.13, 0.2, { south: 'p_vhs', all: 'plastic_black' }, { uvOffset: [0.4, 0] });
    mb.push().translate(0.2, 0.28, zc + 0.02).rotateZ(0.3); mb.box(0, 0, 0, 0.03, 0.19, 0.11, 'plastic_black'); mb.pop();
  },
});

function lampShade(mb: ModelBuilder, x: number, y: number, z: number, r: number, h: number, lit: boolean) {
  mb.cylinder(x, y, z, r, h, 8, { sides: 'p_lampshade', top: 'p_shade_top', bottom: 'p_shade_top' }, { rTop: r * 0.7, fit: true, emissive: lit ? 0.4 : 0 });
}

defObj({
  key: 'lamp_floor', name: 'Floor Lamp', height: 1.65, block: 'low', movable: 6, power: true,
  light: { color: 0xffd8a0, intensity: 0.8, radius: 4.0, y: 1.45, kind: 'lamp', power: true },
  sound: 'metal', flammable: 0.3,
  disassemble: { tools: ['#screwdriver'], time: 6, skill: 'electrical', yields: [['wire', 1, 1], ['scrap_metal', 1, 1], ['rag', 0, 1]] },
  tags: T('home', 'living', 'light', 'lamp'),
  variant: (s) => (on(s) ? 'on' : 'off'),
  model: (mb, s) => {
    mb.cylinder(0, 0, 0, 0.15, 0.03, 10, 'metal_brass', { rTop: 0.12 });
    mb.cylinder(0, 0.03, 0, 0.022, 1.33, 6, 'metal_brass', { color: 0xb8a070 });
    mb.cylinder(0, 0.7, 0, 0.022, 0.05, 6, 'metal_brass');
    lampShade(mb, 0, 1.33, 0, 0.23, 0.3, on(s));
    mb.box(0.03, 1.2, 0.0, 0.008, 0.12, 0.008, 'metal_brass');
  },
});

defObj({
  key: 'lamp_table', name: 'Table Lamp', height: 0.55, block: 'none', movable: 2, power: true,
  light: { color: 0xffd8a0, intensity: 0.6, radius: 3.0, y: 1.2, kind: 'lamp', power: true },
  sound: 'ceramic', flammable: 0.3,
  disassemble: { tools: ['#screwdriver'], time: 4, skill: 'electrical', yields: [['wire', 1, 1], ['glass_shard', 0, 1]] },
  tags: T('home', 'bedroom', 'light', 'lamp', 'surface_item'),
  variant: (s) => (on(s) ? 'on' : 'off'),
  model: (mb, s) => {
    mb.cylinder(0, 0, 0, 0.07, 0.02, 8, 'wood_dark');
    mb.sphere(0, 0.13, 0, 0.1, 8, 5, 'porcelain', { sy: 1.1, color: 0xa8c8c0 });
    mb.cylinder(0, 0.24, 0, 0.012, 0.08, 6, 'metal_brass');
    lampShade(mb, 0, 0.3, 0, 0.16, 0.2, on(s));
  },
});

defObj({
  key: 'fireplace', name: 'Fireplace', w: 2, d: 1, height: 1.35, block: 'solid', heat: 'fire', movable: 0,
  sound: 'ceramic', flammable: 0,
  tags: T('home', 'living', 'fire', 'heat'),
  variant: (s) => (s.lit ? 'lit' : 'cold'),
  model: (mb, s) => {
    const W = 1.7, D = 0.5, zc = WZ + D / 2, zf = zc + D / 2;
    mb.box(0, 0, zf + 0.2, W + 0.1, 0.06, 0.42, 'marble', { color: 0xb8b4ac });
    mb.box(-W / 2 + 0.3, 0, zc, 0.6, 1.12, D, 'p_brick_fire');
    mb.box(W / 2 - 0.3, 0, zc, 0.6, 1.12, D, 'p_brick_fire');
    mb.box(0, 0.78, zc, 0.5, 0.34, D, 'p_brick_fire');
    mb.box(0, 0.74, zf + 0.005, 0.52, 0.06, 0.02, 'metal_dark');
    mb.box(0, 0.0, zc - 0.05, 0.5, 0.78, D - 0.1, 'p_soot');
    mb.box(0, 1.12, zc + 0.03, W + 0.16, 0.07, D + 0.14, 'wood_dark');
    mb.box(0, 1.08, zf + 0.06, W + 0.08, 0.04, 0.04, 'wood_trim');
    // grate and logs
    for (const sx of [-0.17, 0.17]) mb.box(sx, 0.0, zc + 0.08, 0.03, 0.14, 0.3, 'metal_dark');
    mb.box(0, 0.08, zc + 0.08, 0.38, 0.02, 0.22, 'metal_dark');
    mb.cylinderX(-0.02, 0.15, zc + 0.04, 0.05, 0.36, 6, { sides: 'wood_dark', top: 'p_log_end', bottom: 'p_log_end' }, { color: 0x8a6a50 });
    mb.cylinderX(0.03, 0.15, zc + 0.15, 0.045, 0.34, 6, { sides: 'wood_dark', top: 'p_log_end', bottom: 'p_log_end' }, { color: 0x6a5040 });
    mb.cylinderX(0.0, 0.24, zc + 0.1, 0.045, 0.3, 6, { sides: 'wood_dark', top: 'p_log_end', bottom: 'p_log_end' }, { color: 0x5a4030 });
    if (s.lit) {
      mb.box(0, 0.1, zc + 0.1, 0.36, 0.3, 0.004, 'p_flames', { fit: true, emissive: 1.4 });
      mb.box(0.02, 0.12, zc + 0.02, 0.3, 0.26, 0.004, 'p_flames', { fit: true, emissive: 1.2 });
    }
    // mantel: clock, candlesticks, a photo turned toward the wall
    mb.box(0, 1.19, zc, 0.24, 0.2, 0.1, 'wood_dark', { color: 0xc8a888 });
    mb.box(0, 1.23, zc + 0.051, 0.12, 0.12, 0.004, 'p_clock', { fit: true });
    for (const sx of [-0.6, 0.6]) { mb.cylinder(sx, 1.19, zc, 0.03, 0.02, 6, 'metal_brass'); mb.cylinder(sx, 1.21, zc, 0.012, 0.16, 6, 'paper', { color: 0xf0e8d0 }); }
    mb.push().translate(0.35, 1.19, zc - 0.05).rotateX(0.12);
    mb.box(0, 0, 0, 0.16, 0.2, 0.015, { north: 'p_wall_photo', all: 'wood_dark' }, { fit: { north: true } }); mb.pop();
  },
});

defObj({
  key: 'piano', name: 'Upright Piano', w: 2, d: 1, height: 1.3, block: 'solid', sit: true, movable: 0,
  sound: 'wood', flammable: 0.8,
  disassemble: { tools: ['#hammer', '#screwdriver', '#saw'], time: 60, skill: 'carpentry', yields: [['plank', 4, 8], ['wire', 3, 6], ['nails', 4, 9], ['screws', 2, 6]] },
  tags: T('home', 'school', 'piano', 'sit'),
  model: (mb) => {
    const W = 1.52, D = 0.58, zc = WZ + D / 2, zf = zc + D / 2, lac = { color: 0x7a6a62 };
    mb.box(0, 0, zc, W, 0.08, D, 'wood_dark', { color: 0x5a4a42 });
    mb.box(0, 0.08, zc - 0.08, W - 0.08, 1.2, D - 0.16, 'wood_dark', lac);
    for (const sx of [-1, 1]) mb.box(sx * (W / 2 - 0.035), 0.08, zc + 0.05, 0.07, 1.14, D - 0.1, 'wood_dark', lac);
    mb.box(0, 1.28, zc - 0.06, W + 0.02, 0.04, D - 0.1, 'wood_dark', { color: 0x9a8a80 });
    mb.box(0, 0.68, zc + 0.12, W - 0.14, 0.06, D - 0.2, 'wood_dark', lac);
    mb.box(0, 0.74, zc + 0.15, W - 0.16, 0.025, 0.17, { top: 'p_piano_keys', all: 'wood_dark' }, { fit: { top: true } });
    mb.box(0, 0.74, zc + 0.01, W - 0.14, 0.12, 0.08, 'wood_dark', lac);
    mb.push().translate(0, 0.95, zc - 0.02).rotateX(-0.3);
    mb.box(0, 0, 0, 0.5, 0.2, 0.012, { south: 'p_sheet_music', all: 'paper' }, { fit: { south: true } }); mb.pop();
    for (const sx of [-0.05, 0.0, 0.05]) mb.box(sx, 0.08, zf - 0.06, 0.03, 0.015, 0.08, 'metal_brass');
    mb.box(0, 0.08, zf - 0.08, 0.5, 0.25, 0.02, 'wood_dark', { color: 0x5a4a42 });
    // the bench
    mb.box(0, 0.42, zf + 0.15, 0.8, 0.05, 0.3, 'wood_dark', lac);
    legs4(mb, 0.76, 0.26, 0.42, 0.04, 'wood_dark', lac, 0, zf + 0.15);
    mb.box(0, 0.43, zf + 0.15, 0.7, 0.04, 0.25, 'leather_black');
  },
});

function rocker(mb: ModelBuilder, x: number, zc: number, len: number, tex: string) {
  const n = 4;
  for (let i = 0; i < n; i++) {
    const t0 = i / n - 0.5, t1 = (i + 1) / n - 0.5;
    const z0 = zc + t0 * len, z1 = zc + t1 * len;
    const y0 = (t0 * 2) ** 2 * 0.08, y1 = (t1 * 2) ** 2 * 0.08;
    const ang = Math.atan2(y1 - y0, z1 - z0);
    mb.push().translate(x, (y0 + y1) / 2, (z0 + z1) / 2).rotateX(-ang);
    mb.box(0, 0, 0, 0.035, 0.04, Math.hypot(z1 - z0, y1 - y0) + 0.01, tex); mb.pop();
  }
}

defObj({
  key: 'rocking_chair', name: 'Rocking Chair', height: 1.1, block: 'low', sit: true, movable: 9,
  sound: 'wood', flammable: 0.8,
  disassemble: { tools: ['#hammer'], time: 10, skill: 'carpentry', yields: [['plank', 1, 3], ['nails', 1, 3], ['rag', 0, 1]] },
  tags: T('home', 'living', 'sit', 'chair'),
  model: (mb) => {
    const w = 'wood_dark', wc = { color: 0xc8a888 };
    for (const sx of [-0.22, 0.22]) rocker(mb, sx, 0.0, 0.8, w);
    for (const sx of [-1, 1]) for (const z of [-0.2, 0.18]) mb.box(sx * 0.22, 0.04, z, 0.035, 0.38, 0.035, w, wc);
    mb.box(0, 0.42, 0.0, 0.48, 0.04, 0.44, w, wc);
    mb.box(0, 0.46, 0.0, 0.42, 0.04, 0.38, 'fabric_red', { color: 0xd8b0a0 });
    mb.push().translate(0, 0.44, -0.21).rotateX(-0.2);
    for (const sx of [-0.21, 0.21]) mb.box(sx, 0, 0, 0.04, 0.66, 0.04, w, wc);
    mb.box(0, 0.6, 0, 0.46, 0.08, 0.04, w, wc);
    for (let i = 0; i < 5; i++) mb.box(-0.14 + i * 0.07, 0.05, 0, 0.02, 0.56, 0.02, w, wc);
    mb.box(0.05, 0.25, 0.035, 0.36, 0.42, 0.02, 'p_afghan');
    mb.pop();
    for (const sx of [-0.25, 0.25]) mb.box(sx, 0.64, -0.0, 0.05, 0.03, 0.44, w, wc);
    for (const sx of [-0.25, 0.25]) mb.box(sx, 0.44, 0.18, 0.03, 0.2, 0.03, w, wc);
  },
});

defObj({
  key: 'toy_box', name: 'Toy Box', height: 0.6, block: 'low', movable: 15,
  container: { capacity: 20, kind: 'box', loot: 'toy_box' }, sound: 'wood', flammable: 0.8,
  disassemble: { tools: ['#hammer'], time: 8, skill: 'carpentry', yields: [['plank', 1, 3], ['nails', 1, 4]] },
  tags: T('home', 'nursery', 'kids', 'container'),
  model: (mb) => {
    const W = 0.82, D = 0.46, zc = WZ + D / 2 + 0.04, zf = zc + D / 2;
    mb.box(0, 0, zc, W, 0.44, D, { south: 'p_toybox', all: 'wood_light' }, { fit: { south: true }, color: 0xffffff });
    mb.box(0, 0.0, zc, W + 0.02, 0.04, D + 0.02, 'wood_light', { color: 0xf0d0d8 });
    // lid propped open, toys spilling over the rim
    mb.push().translate(0, 0.44, zc - D / 2).rotateX(-1.2);
    mb.box(0, 0, D / 2, W + 0.02, 0.035, D + 0.02, 'wood_light', { color: 0xc8e0f0 }); mb.pop();
    mb.box(0, 0.38, zc, W - 0.04, 0.04, D - 0.04, 'wood_dark', { color: 0x5a4a3a });
    mb.sphere(-0.2, 0.47, zc + 0.04, 0.09, 8, 4, 'white', { color: 0xe05050 });
    mb.box(0.05, 0.42, zc + 0.05, 0.1, 0.1, 0.1, 'wood_light', { color: 0xf0d060 });
    mb.push().translate(0.25, 0.44, zf - 0.02).rotateZ(0.9); mb.box(0, 0, 0, 0.04, 0.2, 0.04, 'white', { color: 0xf0c8b0 }); mb.pop();
    mb.box(0.2, 0.42, zc - 0.08, 0.12, 0.05, 0.16, 'plastic_blue');
  },
});

defObj({
  key: 'rocking_horse', name: 'Rocking Horse', height: 0.9, block: 'low', movable: 10, sit: true,
  sound: 'wood', flammable: 0.8,
  disassemble: { tools: ['#hammer', '#saw'], time: 10, skill: 'carpentry', yields: [['plank', 1, 3], ['nails', 1, 3]] },
  tags: T('home', 'nursery', 'kids', 'decor', 'sit'),
  model: (mb) => {
    const h = 'p_horse';
    for (const sx of [-0.14, 0.14]) {
      mb.push().rotateY(Math.PI / 2); rocker(mb, sx, 0, 0.9, 'wood_dark'); mb.pop();
    }
    for (const sx of [-0.32, 0.32]) mb.box(sx, 0.08, 0, 0.03, 0.03, 0.32, 'wood_dark');
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      mb.push().translate(sx * 0.24, 0.1, sz * 0.12).rotateZ(sx * 0.25);
      mb.box(0, 0, 0, 0.05, 0.36, 0.05, h); mb.pop();
    }
    mb.box(0, 0.44, 0, 0.6, 0.2, 0.22, h);
    mb.box(0.02, 0.64, 0, 0.18, 0.02, 0.24, 'fabric_red');
    mb.push().translate(-0.28, 0.5, 0).rotateZ(-0.7);
    mb.box(0, 0, 0, 0.14, 0.32, 0.14, h); mb.pop();
    mb.push().translate(-0.48, 0.74, 0).rotateZ(0.5);
    mb.box(0, 0, 0, 0.24, 0.12, 0.12, h);
    mb.box(-0.1, 0.0, 0.0, 0.06, 0.08, 0.1, h, { color: 0xd8d0c8 });
    for (const sz of [-1, 1]) mb.box(0.04, 0.07, sz * 0.062, 0.025, 0.025, 0.006, 'plastic_black');
    mb.box(0.08, 0.12, 0, 0.04, 0.06, 0.08, h);
    mb.pop();
    mb.push().translate(-0.36, 0.7, 0).rotateZ(-0.7); mb.box(0.06, 0, 0, 0.04, 0.3, 0.05, 'wood_dark', { color: 0x4a3020 }); mb.pop();
    mb.box(0.32, 0.38, 0, 0.06, 0.24, 0.05, 'wood_dark', { color: 0x4a3020 });
    mb.cylinderZ(-0.36, 0.78, 0, 0.012, 0.3, 4, 'wood_dark', { color: 0x8a6a40 });
  },
});

defObj({
  key: 'dollhouse', name: 'Dollhouse', height: 1.05, block: 'low', movable: 12,
  container: { capacity: 4, kind: 'box', loot: 'kids_room' }, sound: 'wood', flammable: 0.8,
  disassemble: { tools: ['#hammer'], time: 10, skill: 'carpentry', yields: [['plank', 1, 2], ['nails', 1, 3]] },
  tags: T('home', 'nursery', 'kids', 'decor'),
  model: (mb) => {
    const W = 0.78, D = 0.4, zc = WZ + D / 2 + 0.03, zf = zc + D / 2;
    mb.box(0, 0, zc, W + 0.08, 0.04, D + 0.1, 'wood_light', { color: 0x9ac890 });
    mb.box(0, 0.04, zc, W, 0.68, D, { south: 'p_dollhouse', all: 'wood_light' }, { fit: { south: true }, color: 0xffffff });
    // roof
    mb.push().translate(0, 0.72, zc);
    mb.wedge(0, 0, -D / 4 - 0.02, W + 0.08, D / 2 + 0.04, 0.0, 0.3, { top: 'p_shingles', all: 'wood_light' }, { color: 0xffffff });
    mb.push().rotateY(Math.PI); mb.wedge(0, 0, -D / 4 - 0.02, W + 0.08, D / 2 + 0.04, 0.0, 0.3, { top: 'p_shingles', all: 'wood_light' }); mb.pop();
    mb.pop();
    mb.box(0.24, 0.85, zc, 0.08, 0.22, 0.08, 'wood_light', { color: 0xe8a0a0 });
    mb.box(0, 0.04, zf + 0.02, 0.24, 0.025, 0.06, 'wood_light', { color: 0xf8f0f0 });
  },
});

defObj({
  key: 'teddy_giant', name: 'Giant Teddy Bear', height: 1.4, block: 'low', sit: true, movable: 12,
  sound: 'fabric', flammable: 1,
  disassemble: { tools: ['#knife'], time: 8, yields: [['rag', 4, 8]] },
  tags: T('home', 'nursery', 'kids', 'decor', 'mall', 'sit'),
  model: (mb) => {
    const f = 'p_plush', fl = 'p_plush_light', zc = -0.12;
    mb.push().scale(1.1, 1.1, 1.1);
    // legs stretched forward, sitting
    for (const sx of [-0.2, 0.2]) {
      mb.cylinderZ(sx, 0.16, zc + 0.24, 0.13, 0.42, 8, f);
      mb.cylinderZ(sx, 0.16, zc + 0.46, 0.12, 0.04, 8, { sides: fl, top: fl, bottom: fl }, { fit: true });
    }
    mb.sphere(0, 0.42, zc - 0.02, 0.33, 9, 6, f, { sy: 1.15 });
    mb.sphere(0, 0.42, zc + 0.12, 0.22, 8, 5, fl, { sy: 1.1 });
    // arms resting at the sides
    for (const sx of [-1, 1]) {
      mb.push().translate(sx * 0.32, 0.62, zc + 0.02).rotateZ(sx * 0.5).rotateX(0.35);
      mb.cylinder(0, -0.34, 0, 0.09, 0.36, 7, f, { rTop: 0.1 }); mb.pop();
    }
    // head
    mb.sphere(0, 0.98, zc + 0.02, 0.26, 9, 6, f);
    mb.sphere(0, 0.92, zc + 0.22, 0.11, 8, 4, fl, { sy: 0.8 });
    mb.box(0, 0.95, zc + 0.315, 0.06, 0.04, 0.03, 'leather_black');
    for (const sx of [-1, 1]) mb.sphere(sx * 0.19, 1.2, zc - 0.02, 0.09, 7, 4, f);
    for (const sx of [-1, 1]) mb.sphere(sx * 0.19, 1.2, zc + 0.02, 0.05, 6, 3, fl);
    // one button eye; the other was stitched shut
    mb.box(-0.09, 1.04, zc + 0.24, 0.05, 0.05, 0.02, 'plastic_black');
    mb.box(0.09, 1.04, zc + 0.245, 0.06, 0.012, 0.012, 'leather_black');
    mb.box(0.09, 1.04, zc + 0.245, 0.012, 0.06, 0.012, 'leather_black');
    // red bow
    mb.box(0, 0.74, zc + 0.2, 0.08, 0.07, 0.06, 'fabric_red');
    for (const sx of [-1, 1]) mb.wedge(sx * 0.09, 0.72, zc + 0.2, 0.1, 0.05, 0.11, 0.11, 'fabric_red');
    mb.pop();
  },
});

defObj({
  key: 'clothes_pile', name: 'Pile of Clothes', height: 0.3, block: 'none', movable: 0,
  container: { capacity: 15, kind: 'pile', loot: 'wardrobe' }, sound: 'fabric', flammable: 1,
  tags: T('home', 'bedroom', 'pile', 'container'),
  model: (mb) => {
    const items: [number, number, number, number, number, number, string, number][] = [
      [0.0, 0.0, 0.0, 0.6, 0.06, 0.5, 'p_denim', 0xffffff],
      [-0.1, 0.06, 0.08, 0.5, 0.05, 0.42, 'fabric_red', 0xe0b0a0],
      [0.12, 0.1, -0.05, 0.42, 0.05, 0.36, 'fabric_grey', 0xd0d0d8],
      [0.0, 0.15, 0.02, 0.34, 0.05, 0.3, 'fabric_blue', 0xc8d8f0],
      [-0.18, 0.04, -0.15, 0.3, 0.04, 0.22, 'fabric_green', 0xffffff],
      [0.05, 0.2, 0.0, 0.24, 0.04, 0.2, 'p_quilt', 0xffffff],
      [0.25, 0.02, 0.2, 0.08, 0.03, 0.2, 'fabric_grey', 0xffffff],
    ];
    items.forEach(([x, y, z, w, h, d, t, c], i) => {
      mb.push().translate(x, y, z).rotateY(i * 1.3).rotateZ((i % 2 ? 1 : -1) * 0.08);
      mb.box(0, 0, 0, w, h, d, t, { color: c }); mb.pop();
    });
  },
});

defObj({
  key: 'laundry_basket', name: 'Laundry Basket', height: 0.5, block: 'low', movable: 3,
  container: { capacity: 15, kind: 'bin', loot: 'wardrobe' }, sound: 'plastic', flammable: 0.5,
  tags: T('home', 'bedroom', 'bathroom', 'container'),
  model: (mb) => {
    const W = 0.56, D = 0.4, H = 0.36;
    mb.box(0, 0, 0, W - 0.04, 0.03, D - 0.04, 'plastic_white');
    mb.box(0, 0.02, D / 2 - 0.015, W, H, 0.025, 'p_basket');
    mb.box(0, 0.02, -D / 2 + 0.015, W, H, 0.025, 'p_basket');
    mb.box(W / 2 - 0.015, 0.02, 0, 0.025, H, D - 0.05, 'p_basket');
    mb.box(-W / 2 + 0.015, 0.02, 0, 0.025, H, D - 0.05, 'p_basket');
    mb.box(0, 0.25, 0, W - 0.05, 0.12, D - 0.05, 'p_denim', { color: 0xc0c8d0 });
    mb.push().translate(0.05, 0.37, 0.03).rotateY(0.4); mb.box(0, 0, 0, 0.4, 0.06, 0.28, 'pillow', { color: 0xf0e8e0 }); mb.pop();
    mb.push().translate(-0.15, 0.4, -0.05).rotateY(-0.3).rotateZ(0.3); mb.box(0, 0, 0, 0.3, 0.05, 0.2, 'fabric_red', { color: 0xe8c8c0 }); mb.pop();
    mb.push().translate(0.22, 0.32, 0.12).rotateZ(-0.9); mb.box(0, 0, 0, 0.06, 0.2, 0.06, 'fabric_grey'); mb.pop();
  },
});

void Rng; void txtC; void scribble; void flipH;
