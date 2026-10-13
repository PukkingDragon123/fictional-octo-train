// Furniture A — office, lobby & utility props.
import { defObj } from '../../world/objects';
import {
  atlas, addTextureModule, PixelCanvas, makeRamp, mixHex, scaleHex, ph, tileFbm, Rng, WZ,
  txt, txtC, scribble, fillR, plate, screw, border, crtGlass, legs4, caster, hbar, knob, frontGrid,
  crtMonitor, keyboard, papers, mug, flipV, leafCard,
} from './a_lib';
import type { ModelBuilder } from './a_lib';

const T = (...t: string[]) => ['setA', ...t];
const scrOn = (s: any) => !(s.on === false || s.broken || s.unpowered);

// ============================================================ textures
/** one-point perspective corridor (paintings, CCTV feeds) */
function corridor(pc: PixelCanvas, x0: number, y0: number, w: number, h: number, o: {
  vx: number; vy: number; ew: number; eh: number; wall: number[]; floor: number[]; ceil: number[]; end: number;
  light?: number; doors?: boolean; seams?: boolean;
}) {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = x + 0.5 - o.vx, dy = y + 0.5 - o.vy;
    if (Math.abs(dx) <= o.ew && Math.abs(dy) <= o.eh) { pc.set(x0 + x, y0 + y, o.end); continue; }
    const fc = Math.abs(dy) * o.ew > Math.abs(dx) * o.eh;
    const s = fc ? Math.abs(dy) / o.eh : Math.abs(dx) / o.ew;
    const Z = 10 / s;
    const R = fc ? (dy > 0 ? o.floor : o.ceil) : o.wall;
    let v = 0.15 + (1 - 1 / s) * 0.85;
    if (fc && dy < 0 && o.light !== undefined && Z % 2.2 < 0.7 && Math.abs(dx) < s * o.ew * 0.5) { pc.set(x0 + x, y0 + y, o.light); continue; }
    if (!fc && o.doors && Z % 3.1 < 0.5) v -= 0.3;
    if (fc && dy > 0 && o.seams && Z % 1.5 < 0.25) v -= 0.15;
    const n = R.length, f = Math.max(0, Math.min(1, v)) * (n - 1);
    let i = Math.floor(f);
    if (f - i > ph(x0 + x, y0 + y, 77) * 0.6 + 0.2) i++;
    pc.set(x0 + x, y0 + y, R[Math.min(n - 1, i)]);
  }
}

/** monochrome surveillance feed */
function cctv(pc: PixelCanvas, kind: number) {
  pc.wrap = false;
  const G = [0x0e140f, 0x223024, 0x3a4c3c, 0x5e745e, 0x8ea48c, 0xc4d4c0];
  const W = pc.w, H = pc.h;
  if (kind === 0 || kind === 3) {
    corridor(pc, 0, 0, W, H, { vx: W / 2 + (kind === 3 ? 1 : 0), vy: H / 2 - 1, ew: 1.5, eh: 1.5, wall: G.slice(1, 5), floor: G.slice(0, 4), ceil: G.slice(1, 5), end: G[0], light: G[5], doors: true });
    if (kind === 3) { // someone standing far down the hall
      pc.set(W / 2 + 1, H / 2 - 2, G[0]); pc.set(W / 2 + 1, H / 2 - 1, G[0]); pc.set(W / 2 + 1, H / 2, G[0]); pc.set(W / 2 + 1, H / 2 + 1, G[0]);
      pc.set(W / 2 + 2, H / 2, G[1]);
    }
  } else if (kind === 1) { // top-down empty room with a chair
    fillR(pc, 0, 0, W, H, G, (x, y) => 0.45 + (tileFbm(x, y, 16, 16, 2, 2, 5) - 0.5) * 0.3, 1);
    pc.rect(5, 4, 3, 3, G[1]); pc.rect(5, 3, 3, 1, G[2]); pc.set(8, 5, G[0]);
    pc.hline(0, W - 1, 1, G[2]); pc.vline(1, 0, H - 1, G[2]);
  } else if (kind === 2) { // parking garage pillars
    fillR(pc, 0, 0, W, H, G, (x, y) => 0.25 + y / H * 0.35, 1);
    for (const px of [2, 7, 11]) { pc.rect(px, 2, 2, H - 4, G[3]); pc.vline(px, 2, H - 3, G[4]); }
    pc.hline(0, W - 1, H - 3, G[4]);
  } else if (kind === 4) { // no signal
    pc.fill(0x1a2a8a); pc.rect(3, 4, 8, 3, 0x2a3aa0); pc.hline(4, 9, 5, 0xc8d0f0);
  } else { // static
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const n = tileFbm(x * 3, y, W * 3, H, 6, 1, 99 + y);
      pc.set(x, y, G[1 + Math.floor(n * 4.5)]);
    }
    pc.hline(0, W - 1, 6, G[5]); pc.hline(0, W - 1, 7, G[4]);
  }
  // timestamp + REC dot
  for (let i = 0; i < 5; i++) if (i !== 2) pc.set(1 + i, H - 2, G[5]);
  if (kind !== 4) pc.set(W - 2, 1, 0xd04040);
  crtGlass(pc, 0, 0, W, H, 0x050805, 0.55);
}

addTextureModule(() => {
  const A = atlas();

  // ---------- painted steel (tint per object) + matching drawer fronts
  A.add('p_steel', 16, 16, (pc, rng) => {
    const R = makeRamp(0xb8b4aa, 5, { spread: 0.3 });
    pc.fillRamp(R, (x, y) => 0.55 + (tileFbm(x, y, 16, 16, 4, 2, 21) - 0.5) * 0.35 + (ph(x, y, 4) - 0.5) * 0.06, 0.8);
    for (let i = 0; i < 3; i++) { const x = rng.int(0, 15), y = rng.int(0, 15); pc.set(x, y, R[4]); pc.set(x + 1, y, R[3]); }
    pc.set(rng.int(0, 15), rng.int(0, 15), R[1]);
  });
  A.add('p_steel_drawer', 15, 9, (pc) => {
    pc.wrap = false;
    const R = makeRamp(0xb8b4aa, 6, { spread: 0.42 });
    fillR(pc, 0, 0, 15, 9, R, (x, y) => 0.56 - y * 0.012 + (ph(x, y, 3) - 0.5) * 0.07, 0.6);
    pc.hline(0, 14, 0, R[5]); pc.vline(0, 1, 7, R[4]); pc.hline(0, 14, 8, R[1]); pc.vline(14, 1, 7, R[2]);
    // label holder with card
    pc.hline(5, 9, 1, R[1]); pc.vline(5, 1, 3, R[1]); pc.vline(9, 1, 3, R[1]); pc.hline(5, 9, 3, R[4]);
    pc.hline(6, 8, 2, 0xe8e2cc); pc.set(7, 2, 0x9a98a0);
    // recessed pull
    pc.hline(5, 9, 5, 0x24221e); pc.hline(5, 9, 6, R[5]); pc.set(4, 5, R[2]); pc.set(10, 5, R[2]);
    pc.set(2, 7, R[3]); pc.set(12, 2, R[2]);
  });

  // ---------- desk items
  A.add('p_desk_blotter', 19, 13, (pc) => {
    pc.wrap = false;
    pc.fill(0x2f4a36);
    const L = makeRamp(0x2f4a36, 4);
    pc.rect(3, 1, 13, 11, 0xe4dfcf);
    pc.rect(3, 1, 13, 2, 0xa83030); pc.hline(5, 13, 2, 0xd88070);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) pc.set(4 + c * 2, 4 + r * 2, 0x8a8890);
    pc.strokeRect(9, 7, 3, 3, 0xc02020); // the circled date
    // leather corners
    for (const [x, y] of [[2, 0], [16, 0], [2, 12], [16, 12]]) { pc.set(x, y, L[0]); }
    pc.vline(2, 0, 12, L[1]); pc.vline(16, 0, 12, L[1]); pc.hline(0, 18, 0, L[2]);
    scribble(pc, 4, 11, 6, 1, 0x3050a0, 9);
  });
  A.add('p_pc_case', 14, 4, (pc) => {
    pc.wrap = false;
    const R = makeRamp(0xc8bfa4, 5, { spread: 0.35 });
    pc.fill(R[2]);
    pc.hline(0, 13, 0, R[4]); pc.hline(0, 13, 3, R[0]);
    pc.hline(1, 6, 1, R[1]); pc.hline(1, 6, 2, R[3]); // 5.25" bay
    pc.hline(8, 11, 1, 0x2a2824); pc.set(12, 1, R[1]); // 3.5" floppy
    pc.set(9, 2, R[0]);
    pc.set(1, 2, 0x5ad060); pc.set(3, 2, 0xd0a030); // leds
    pc.set(12, 2, R[4]); pc.set(13, 2, R[1]); // power
  });
  A.add('p_logbook', 9, 6, (pc) => {
    pc.wrap = false;
    pc.fill(0xe8e4d4);
    pc.vline(4, 0, 5, 0xa8a090);
    scribble(pc, 0, 1, 4, 3, 0x30408a, 4, 1);
    scribble(pc, 5, 1, 4, 2, 0x30408a, 5, 1);
    pc.hline(0, 8, 5, 0x6a3020);
  });
  A.add('p_copier_panel', 12, 6, (pc) => {
    pc.wrap = false;
    pc.fill(0x8e8c86); pc.hline(0, 11, 0, 0xb4b2aa); pc.hline(0, 11, 5, 0x6a6862);
    pc.rect(1, 1, 5, 3, 0x2c3828); pc.rect(2, 2, 3, 1, 0x7a9a6a);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) pc.set(7 + c, 1 + r, 0xd0cec6);
    pc.set(11, 2, 0x3ab04a); pc.set(11, 4, 0xe08a20); pc.set(7, 4, 0xd0cec6);
  });
  A.add('p_copier_tray', 19, 6, (pc) => {
    pc.wrap = false;
    const R = makeRamp(0xcfc9ba, 5, { spread: 0.3 });
    pc.fill(R[2]); pc.hline(0, 18, 0, R[4]); pc.hline(0, 18, 5, R[0]);
    pc.hline(6, 12, 1, 0x3a3834); pc.hline(6, 12, 2, R[0]);
    pc.rect(1, 2, 3, 2, 0xf0f0ea); pc.set(2, 2, 0x202020);
    pc.set(15, 3, R[1]); pc.set(16, 3, R[1]);
  });
  A.add('p_tractor_paper', 10, 16, (pc) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 10; x++) {
      const band = (y >> 2) % 2 === 0;
      pc.set(x, y, band ? 0xcfe2c8 : 0xeceee6);
    }
    for (let y = 0; y < 16; y += 2) { pc.set(0, y, 0x8a8a84); pc.set(9, y, 0x8a8a84); }
    for (let x = 1; x < 9; x += 2) pc.set(x, 15, 0xb4b6ae);
    scribble(pc, 2, 1, 6, 4, 0x6a6a72, 31, 2, 0.6);
  });
  A.add('p_dotmatrix', 16, 5, (pc) => {
    pc.wrap = false;
    const R = makeRamp(0xc4bba0, 5, { spread: 0.35 });
    pc.fill(R[2]); pc.hline(0, 15, 0, R[4]);
    pc.hline(1, 14, 1, 0x2a2622); pc.hline(1, 14, 2, R[1]);
    pc.set(11, 3, 0x50d050); pc.set(12, 3, R[0]); pc.set(13, 3, R[0]); pc.set(14, 3, R[4]);
    pc.hline(0, 15, 4, R[0]);
  });
  A.add('p_water_bottle', 16, 12, (pc) => {
    pc.wrap = false;
    for (let y = 0; y < 12; y++) for (let x = 0; x < 16; x++) {
      const water = y >= 3;
      let c = water ? 0x4f8fc8 : 0x9ccbe8;
      if (water && (x + y) % 5 === 0) c = 0x5f9fd4;
      if (y === 5 || y === 9) c = mixHex(c, 0xffffff, 0.25);
      if (x === 3 || x === 11) c = mixHex(c, 0xffffff, 0.45);
      if (x === 4) c = mixHex(c, 0xffffff, 0.2);
      if (x >= 13 || x <= 0) c = scaleHex(c, 0.8);
      pc.set(x, y, c);
    }
    pc.hline(0, 15, 3, 0x7ab4e0);
  });
  A.add('p_carafe', 8, 6, (pc) => {
    pc.wrap = false;
    for (let y = 0; y < 6; y++) for (let x = 0; x < 8; x++) pc.set(x, y, y < 2 ? 0x4a5458 : y === 2 ? 0x5a3a22 : 0x2a180c);
    pc.vline(2, 0, 5, 0x8a9a9c); pc.set(6, 3, 0x4a3018);
  });

  // ---------- boards
  A.add('p_whiteboard', 58, 32, (pc, rng) => {
    pc.wrap = false;
    const W = 58, H = 32;
    fillR(pc, 0, 0, W, H, [0xc4c8cc, 0xd4d7da, 0xe0e2e4, 0xeaebec, 0xf4f4f2], (x, y) => 0.72 + (tileFbm(x, y, 64, 64, 4, 2, 9) - 0.5) * 0.3 - y * 0.004, 1);
    for (let i = 0; i < 7; i++) { const cx = rng.int(4, W - 8), cy = rng.int(3, H - 6); for (let k = 0; k < 16; k++) pc.blend(cx + rng.int(-6, 6), cy + rng.int(-1, 2), 0xa4acb8, 0.22); }
    // ghost of erased writing — something somebody tried to wipe away
    txt(pc, 'WAKE UP', 33, 25, 0xd2d6dc);
    scribble(pc, 3, 4, 20, 3, 0xbcc2cc, 77, 3, 0.6);
    const blue = 0x2a4a9a, red = 0xb02a2a, ink = 0x2a2a30;
    // org chart
    pc.strokeRect(28, 3, 9, 5, blue); scribble(pc, 30, 5, 5, 1, blue, 3);
    pc.strokeRect(21, 13, 9, 5, blue); pc.strokeRect(35, 13, 9, 5, blue); pc.strokeRect(47, 13, 8, 5, blue);
    pc.line(32, 8, 25, 12, blue); pc.line(33, 8, 39, 12, blue); pc.line(34, 8, 50, 12, blue);
    scribble(pc, 23, 15, 5, 1, blue, 5); scribble(pc, 37, 15, 5, 1, blue, 6); scribble(pc, 49, 15, 4, 1, red, 7);
    pc.line(50, 18, 50, 20, red); pc.set(50, 22, red); // "?" under the last box
    // bullet list
    for (let i = 0; i < 4; i++) { pc.set(3, 12 + i * 3, ink); scribble(pc, 5, 12 + i * 3, 10 + (i % 2) * 4, 1, ink, 40 + i); }
    pc.hline(5, 12, 13, red);
    txt(pc, 'DO NOT ERASE', 3, 25, red);
    pc.hline(3, 47, 31, mixHex(red, 0xffffff, 0.3));
    txt(pc, '10/13', 37, 1, ink);
    // gloss streaks
    for (let k = 0; k < 2; k++) for (let i = 0; i < 26; i++) { pc.blend(8 + k * 22 + i, 30 - i, 0xffffff, 0.28); pc.blend(9 + k * 22 + i, 30 - i, 0xffffff, 0.14); }
  });
  A.add('p_corkboard', 26, 19, (pc, rng) => {
    pc.wrap = false;
    const C = makeRamp(0xb08654, 6, { hueShift: 0.03 });
    pc.fillRamp(C, (x, y) => 0.5 + (ph(x, y, 13) - 0.5) * 0.5 + (tileFbm(x, y, 32, 32, 4, 2, 4) - 0.5) * 0.3, 1);
    pc.speckle(rng, [C[0], C[1]], 0.06);
    const pin = (x: number, y: number, c: number) => { pc.set(x, y, c); pc.set(x + 1, y + 1, 0x3a2a18); };
    // memo
    pc.rect(2, 2, 8, 7, 0xeeeae0); scribble(pc, 3, 4, 6, 3, 0x6a6a7a, 12, 2); pc.hline(2, 9, 8, 0xc8c2b4); pin(5, 2, 0xd03030);
    // sticky note
    pc.rect(12, 1, 5, 5, 0xf0dc58); pc.hline(12, 16, 5, 0xc8b440); scribble(pc, 13, 2, 3, 2, 0x5a5040, 3, 2); pin(14, 1, 0x3060d0);
    // calendar stuck on one date
    pc.rect(17, 6, 8, 9, 0xf4f2ec); pc.rect(17, 6, 8, 2, 0xb83a3a);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) pc.set(18 + c * 2, 9 + r * 2, 0x8a8a92);
    pc.strokeRect(19, 10, 3, 3, 0xd02020); pin(20, 6, 0x30a050);
    // pink flyer with tear-off tabs
    pc.rect(3, 10, 7, 8, 0xe8b4c4); pc.rect(4, 11, 5, 3, 0xf8f0f2); pc.set(6, 12, 0x6a5a6a);
    for (let x = 3; x < 10; x += 2) pc.vline(x, 15, 17, 0xf4dce4);
    pin(6, 10, 0xe0c020);
    // polaroid with a figure where no-one should be
    pc.rect(11, 9, 5, 6, 0xf4f4f0); pc.rect(12, 10, 3, 3, 0x7a8a7a); pc.set(13, 11, 0x1a1a1a); pc.set(13, 12, 0x2a2a2a);
    pin(13, 9, 0xd03030);
    // business card
    pc.rect(11, 16, 5, 2, 0xffffff); pc.set(12, 16, 0x2a5aa0);
  });
  A.add('p_clock', 10, 10, (pc) => {
    pc.wrap = false;
    pc.fill(0x2a2a2a);
    pc.circle(5, 5, 4.6, 0xd8d4c8); pc.circle(5, 5, 4.2, 0xf2efe6);
    for (const [x, y] of [[4, 1], [5, 1], [8, 4], [8, 5], [4, 8], [5, 8], [1, 4], [1, 5]]) pc.set(x, y, 0x2a2a30);
    pc.line(5, 5, 3, 3, 0x1a1a20); // hour
    pc.line(5, 5, 7, 2, 0x1a1a20); // minute
    pc.line(5, 5, 4, 8, 0xc02020); // second hand, frozen
    pc.set(5, 5, 0x1a1a20);
    flipV(pc);
  });

  // ---------- paintings (26x20 canvases)
  A.add('p_paint_field', 26, 20, (pc) => {
    pc.wrap = false;
    const sky = [0x8eaac4, 0xa4bcd0, 0xbccbd8, 0xd4dad8, 0xe8e2cc];
    fillR(pc, 0, 0, 26, 12, sky, (x, y) => y / 12 + (ph(x, y, 2) - 0.5) * 0.12, 1);
    pc.ditherBlob(7, 3, 5, 1.6, 0xf2f0e8, 1.2); pc.ditherBlob(19, 5, 4, 1.2, 0xe8e8e2, 1);
    const field = makeRamp(0xa4a050, 6, { hueShift: 0.05 });
    fillR(pc, 0, 12, 26, 8, field, (x, y) => 0.35 + y / 8 * 0.45 + (ph(x, y, 9) - 0.5) * 0.3 + ((x + y * 3) % 7 === 0 ? 0.15 : 0), 1);
    for (let x = 0; x < 26; x++) { pc.set(x, 11, 0x6a7a68); if (ph(x, 0, 5) < 0.4) pc.set(x, 10, 0x7a8a76); }
    pc.vline(20, 6, 11, 0x4a4038); pc.hline(19, 21, 7, 0x4a4038); // distant pole
    for (let x = 0; x < 26; x += 3) pc.set(x, 13, 0x7a7038);
  });
  A.add('p_paint_door', 26, 20, (pc) => {
    pc.wrap = false;
    const wall = makeRamp(0xd8ccb0, 5, { spread: 0.25 });
    fillR(pc, 0, 0, 26, 15, wall, (x, y) => 0.55 + (ph(x, y, 3) - 0.5) * 0.15 - y * 0.01, 1);
    const fl = makeRamp(0xb89a88, 5);
    fillR(pc, 0, 15, 26, 5, fl, (x, y) => 0.5 + y * 0.08 + (ph(x, y, 4) - 0.5) * 0.2, 1);
    pc.hline(0, 25, 15, wall[1]);
    const D = makeRamp(0xb02a2a, 5, { hueShift: 0.03 });
    pc.rect(10, 3, 7, 12, D[2]); pc.vline(10, 3, 14, D[3]); pc.vline(16, 3, 14, D[1]); pc.hline(10, 16, 3, D[4]);
    pc.strokeRect(11, 5, 5, 4, D[1]); pc.strokeRect(11, 10, 5, 4, D[1]);
    pc.set(15, 9, 0xe8c050);
    pc.strokeRect(9, 2, 9, 14, wall[0]);
    for (let x = 17; x < 22; x++) pc.blend(x, 15 + ((x - 17) >> 1), 0x5a4a40, 0.35);
    pc.rectBlend(17, 15, 4, 2, 0x5a4a40, 0.3);
  });
  A.add('p_paint_hall', 26, 20, (pc) => {
    pc.wrap = false;
    corridor(pc, 0, 0, 26, 20, {
      vx: 13, vy: 9, ew: 2, eh: 2.5,
      wall: makeRamp(0xc8b45a, 5), floor: makeRamp(0x8a7a44, 5), ceil: makeRamp(0xd8d4c0, 4),
      end: 0x1a140a, light: 0xfffbe8, doors: true, seams: true,
    });
  });
  A.add('p_paint_eye', 26, 20, (pc) => {
    pc.wrap = false;
    fillR(pc, 0, 0, 26, 20, [0x6a5a8a, 0x8a74a4, 0xa88cb8, 0xc8a4c4, 0xe4c4d0], (x, y) => 0.25 + y / 20 * 0.7 + (ph(x, y, 6) - 0.5) * 0.1, 1);
    pc.ditherBlob(5, 16, 6, 3, 0xf0d8e0, 1); pc.ditherBlob(21, 17, 6, 2.5, 0xf0d8e0, 1);
    // eye white
    for (let y = 4; y <= 15; y++) for (let x = 3; x <= 22; x++) {
      const u = (x - 12.5) / 9.6, v = (y - 9.5) / (5.2 * (1 - u * u) + 0.01);
      if (Math.abs(v) <= 1 && Math.abs(u) <= 1) pc.set(x, y, Math.abs(v) > 0.7 ? 0xd8ccd0 : 0xf4ecec);
    }
    pc.circle(13, 9.5, 4.2, 0x2a6a7a); pc.circle(13, 9.5, 3.4, 0x3a8a8a); pc.circle(13, 9.5, 2.4, 0x5aa89a);
    pc.circle(13, 9.5, 1.6, 0x0a0a10); pc.set(11, 8, 0xffffff); pc.set(12, 8, 0xd0f0f0);
    for (let x = 4; x <= 21; x++) { const u = (x - 12.5) / 9.6; const y = Math.round(9.5 - 5.2 * (1 - u * u)); pc.set(x, y, 0x2a1a2a); if (x % 3 === 0) pc.set(x + (x < 12 ? -1 : 1), y - 1, 0x2a1a2a); }
    pc.set(20, 10, 0xc87070); pc.set(19, 11, 0xd89090); pc.set(6, 9, 0xd89090);
  });
  A.add('p_paint_sun', 26, 20, (pc) => {
    pc.wrap = false;
    fillR(pc, 0, 0, 26, 20, [0x8ec4e8, 0xa4d0ec, 0xbcdcf0, 0xd4e8f4], (x, y) => 0.2 + y / 20 * 0.8, 1);
    for (let a = 0; a < 12; a++) { const an = a / 12 * Math.PI * 2; pc.line(13 + Math.cos(an) * 5, 8 + Math.sin(an) * 5, 13 + Math.cos(an) * 7.5, 8 + Math.sin(an) * 7.5, 0xf8e070); }
    pc.circle(13, 8, 4.4, 0xf8d848); pc.circle(13, 8, 3.6, 0xfce468);
    pc.set(11, 7, 0x4a3a20); pc.set(15, 7, 0x4a3a20);
    pc.set(11, 9, 0x8a4a30); pc.hline(12, 14, 10, 0x8a4a30); pc.set(15, 9, 0x8a4a30);
    pc.set(10, 9, 0xf0a0a0); pc.set(16, 9, 0xf0a0a0);
    pc.ditherBlob(4, 4, 3.5, 1.5, 0xffffff, 1.3); pc.ditherBlob(22, 3, 3, 1.2, 0xffffff, 1.3);
    const g = makeRamp(0x8ac87a, 5);
    for (let x = 0; x < 26; x++) { const top = 15 + Math.round(Math.sin(x / 26 * Math.PI * 1.5 + 0.5) * 2); for (let y = top; y < 20; y++) pc.set(x, y, g[y === top ? 4 : y < top + 2 ? 3 : 2]); }
    pc.set(6, 16, 0xffffff); pc.set(7, 17, 0xf8d0e0); pc.set(19, 16, 0xfff080);
  });
  A.add('p_paint_pool', 26, 20, (pc) => {
    pc.wrap = false;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 26; x++) pc.set(x, y, (x % 4 === 0 || y % 3 === 0) ? 0xb8c8cc : 0xe8f0f0);
    pc.hline(0, 25, 8, 0xf4f8f8); pc.hline(0, 25, 9, 0x8aa8b0);
    const W = makeRamp(0x3aa8c0, 6, { hueShift: 0.02 });
    fillR(pc, 0, 10, 26, 10, W, (x, y) => 0.75 - y / 10 * 0.5 + (Math.abs(Math.sin(x * 0.9 + y * 1.7) * Math.cos(x * 0.4 - y)) > 0.8 ? 0.25 : 0), 1);
    for (let y = 4; y < 15; y++) { pc.set(18, y, 0xe0e8ea); pc.set(21, y, 0xe0e8ea); }
    for (const y of [10, 12, 14]) pc.hline(18, 21, y, 0xc8d4d8);
    for (let x = 0; x < 26; x++) pc.blend(x, 10, 0xffffff, 0.3);
  });

  // ---------- posters (22x30)
  A.add('p_poster_focus', 22, 30, (pc) => {
    pc.wrap = false;
    pc.fill(0x101012);
    fillR(pc, 2, 2, 18, 15, [0x3a2a5a, 0x7a3a6a, 0xc0546a, 0xe88a5a, 0xf4c46a], (x, y) => 1 - y / 15 * 0.95 + (ph(x, y, 4) - 0.5) * 0.08, 1);
    pc.circle(11, 11, 2.5, 0xfff0b0);
    for (let x = 2; x < 20; x++) { const h = 11 + Math.round(Math.abs(Math.sin(x * 0.55)) * 3 + (x > 9 && x < 15 ? -3 + Math.abs(x - 12) : 0)); for (let y = h; y < 17; y++) pc.set(x, y, y === h ? 0x3a2a40 : 0x1a1420); }
    pc.strokeRect(1, 1, 20, 17, 0x4a4a50);
    txtC(pc, 'FOCUS', 11, 20, 0xf0ece0);
    scribble(pc, 4, 27, 14, 1, 0x8a8a90, 8);
  });
  A.add('p_poster_missing', 22, 30, (pc, rng) => {
    pc.wrap = false;
    const P = makeRamp(0xe8e2c8, 4, { spread: 0.2 });
    pc.fillRamp(P, (x, y) => 0.6 + (ph(x, y, 8) - 0.5) * 0.2 - (y > 25 ? 0.1 : 0), 1);
    // MISSING (narrow I's)
    let x = 1;
    for (const ch of 'MISSING') { if (ch === 'I') { for (let j = 0; j < 5; j++) pc.set(x, 2 + j, 0x1a1414); x += 2; } else { x += txt(pc, ch, x, 2, 0x1a1414) + 1; } }
    // photo with a smeared face
    pc.rect(6, 9, 10, 11, 0x7a7a7a); pc.rect(7, 10, 8, 9, 0xa8a8a0);
    pc.ellipse(11, 14, 2.6, 3.2, 0xc8a890); pc.rect(8, 10, 6, 2, 0x3a2a20);
    for (let yy = 12; yy < 18; yy++) for (let xx = 8; xx < 14; xx++) if (ph(xx, yy, 3) < 0.5) pc.set(xx, yy, mixHex(pc.get(xx, yy), pc.get(xx + 1, yy - 1), 0.6));
    pc.rect(9, 17, 5, 2, 0x4a4a6a);
    scribble(pc, 3, 22, 16, 2, 0x3a3a3a, 21, 2);
    for (let i = 0; i < 6; i++) { const tx = 2 + i * 3; pc.vline(tx + 2, 26, 29, 0xb8b298); pc.hline(tx, tx + 1, 27, 0x6a6a6a); }
    pc.grime(0x8a7a50, 0.5, 3, 5, 0.6);
    void rng;
  });
  A.add('p_poster_calm', 22, 30, (pc) => {
    pc.wrap = false;
    pc.fill(0xf0c828);
    for (let y = 0; y < 30; y++) for (let x = 0; x < 22; x++) {
      if (y < 3 || y > 26) pc.set(x, y, ((x + y) >> 1) % 2 === 0 ? 0x1a1a1a : 0xf0c828);
    }
    txtC(pc, 'STAY', 11, 5, 0x141414);
    txtC(pc, 'CALM', 11, 11, 0x141414);
    // pictogram: a figure standing still
    pc.circle(11, 18.5, 1.3, 0x141414); pc.rect(10, 20, 3, 4, 0x141414); pc.vline(9, 20, 23, 0x141414); pc.vline(13, 20, 23, 0x141414);
    pc.vline(10, 24, 25, 0x141414); pc.vline(12, 24, 25, 0x141414);
    pc.hline(3, 18, 17, 0xc8a018);
  });
  A.add('p_poster_kind', 22, 30, (pc) => {
    pc.wrap = false;
    pc.fill(0xf8e0e8);
    const bands = [0xf4a0a8, 0xf8c898, 0xf8ec9c, 0xb4e4a8, 0xa8d0f0, 0xc8b0e8];
    for (let y = 0; y < 30; y++) for (let x = 0; x < 22; x++) {
      const d = Math.hypot(x + 0.5 - 11, y + 0.5 - 22);
      const b = Math.floor((10 - d) / 1.2);
      if (d <= 10 && d > 10 - bands.length * 1.2 && y < 22) pc.set(x, y, bands[b]);
    }
    pc.ditherBlob(3, 21, 3.5, 2, 0xffffff, 1.5); pc.ditherBlob(19, 21, 3.5, 2, 0xffffff, 1.5);
    txtC(pc, 'BE', 11, 23, 0x8a6ab0);
    pc.rect(0, 0, 22, 2, 0xf8e0e8);
    txtC(pc, 'KIND', 11, 3, 0x8a6ab0);
    for (const [hx, hy] of [[3, 3], [18, 4], [5, 13]]) { pc.set(hx, hy, 0xe86a8a); pc.set(hx + 2, hy, 0xe86a8a); pc.hline(hx, hx + 2, hy + 1, 0xe86a8a); pc.set(hx + 1, hy + 2, 0xe86a8a); }
  });

  // ---------- plants
  A.add('p_leaves_a', 24, 28, (pc, rng) => leafCard(pc, rng, { base: 0x4a7a3a, n: 9, len: [16, 26], width: 1.4, spread: 1.6, droop: 0.004 }));
  A.add('p_leaves_ficus', 32, 32, (pc, rng) => {
    const R = makeRamp(0x4e7a38, 6, { hueShift: 0.06, spread: 0.55 });
    // branches
    for (let b = 0; b < 5; b++) { const ex = rng.int(3, 28), ey = rng.int(2, 18); pc.line(16, 31, ex, ey, 0x5a4430); }
    for (let i = 0; i < 95; i++) {
      const cx = 16 + (rng.next() - 0.5) * 28, cy = 3 + rng.next() * 24;
      if (Math.hypot((cx - 16) / 14, (cy - 13) / 12) > 1.05) continue;
      const lit = cy < 12 || cx > 18 ? 1 : 0;
      const c = R[2 + lit + (rng.chance(0.3) ? 1 : 0)];
      pc.set(cx, cy, c); pc.set(cx + 1, cy, c); pc.set(cx, cy + 1, R[1 + lit]);
      if (rng.chance(0.5)) pc.set(cx + 1, cy - 1, R[3 + lit]);
    }
  });
  A.add('p_soil', 8, 8, (pc, rng) => {
    pc.fillRamp(makeRamp(0x3a2a1c, 4), (x, y) => 0.5 + (ph(x, y, 2) - 0.5) * 0.6, 1);
    pc.speckle(rng, [0x6a5a48, 0x24180e], 0.08);
  });
  A.add('p_wicker', 16, 16, (pc) => {
    const R = makeRamp(0xa8804a, 5, { hueShift: 0.04 });
    pc.each((x, y) => {
      const cell = ((x >> 2) + (y >> 2)) % 2;
      const u = cell ? x % 4 : y % 4;
      pc.set(x, y, R[u === 0 ? 0 : u === 3 ? 1 : u === 1 ? 4 : 3]);
    });
  });
  A.add('p_mesh', 16, 16, (pc) => {
    pc.each((x, y) => pc.set(x, y, (x % 3 === 0 || y % 3 === 0) ? ((x + y) % 2 ? 0x5a5c5e : 0x6e7072) : 0x16171a));
  });
  A.add('p_recycle', 12, 12, (pc) => {
    pc.wrap = false;
    pc.fill(0x2a5aa8);
    const c = 0xf0f4f8;
    pc.line(6, 2, 2, 9, c); pc.line(6, 2, 10, 9, c); pc.hline(2, 10, 9, c);
    pc.set(4, 3, c); pc.set(3, 3, c); pc.set(10, 7, c); pc.set(11, 8, c); pc.set(1, 10, c); pc.set(1, 8, c);
    pc.set(6, 6, 0x2a5aa8); pc.rect(5, 5, 3, 2, 0x2a5aa8);
  });

  // ---------- vending machines
  A.add('p_vend_snack', 29, 56, (pc) => {
    pc.wrap = false;
    const frame = makeRamp(0x3a3c44, 5);
    pc.fill(frame[1]);
    // header
    fillR(pc, 1, 1, 27, 6, [0x1a2a7a, 0x2a3a9a, 0x3a4ab8], (x, y) => 1 - y / 6, 1);
    txtC(pc, 'SNACKS', 14, 1, 0xf8d848);
    pc.hline(1, 27, 6, 0xf8d848);
    // glass window
    pc.rect(1, 8, 20, 36, 0x22262e);
    const prods = [
      [0xd03a2a, 0xf0c838], [0x2a5ad0, 0xe8e8f0], [0x6a3a1a, 0xc83030], [0xe08a2a, 0x8a3a1a],
      [0x3aa04a, 0xf0f0e0], [0xb02a7a, 0xf0d0e0], [0xd8c040, 0x8a2a2a], [0x2a8aa8, 0xf8f0a0],
    ];
    for (let r = 0; r < 6; r++) {
      const sy = 9 + r * 6;
      for (let c = 0; c < 5; c++) {
        const sx = 2 + c * 4;
        const empty = (r === 4 && c === 2) || (r === 1 && c === 4) || (r === 5 && c > 2);
        const odd = r === 3 && c === 3;
        const p = odd ? [0xf2f2ee, 0xd8d8d0] : prods[(r * 3 + c * 5) % prods.length];
        if (!empty) {
          pc.rect(sx, sy, 3, 4, p[0]); pc.hline(sx, sx + 2, sy + 1, p[1]); pc.set(sx, sy, mixHex(p[0], 0xffffff, 0.35)); pc.vline(sx + 2, sy + 1, sy + 3, scaleHex(p[0], 0.7));
        }
        // coil + price tag
        pc.set(sx, sy + 4, 0x8a8c90); pc.set(sx + 2, sy + 4, 0x8a8c90); pc.set(sx + 1, sy + 4, 0x5a5c60);
        pc.set(sx + 1, sy + 5, 0xe8e4d0);
      }
      pc.hline(1, 20, sy + 5, 0x5a5e66);
    }
    // glass reflections
    for (let i = 0; i < 30; i++) { pc.blend(2 + i * 0.6, 43 - i, 0xffffff, 0.16); pc.blend(10 + i * 0.6, 43 - i, 0xffffff, 0.1); }
    pc.vline(0, 8, 43, frame[3]); pc.vline(21, 8, 43, frame[0]);
    // control panel
    fillR(pc, 22, 8, 6, 36, makeRamp(0x8a8e94, 4), (x, y) => 0.6 - x * 0.05 + (ph(x, y, 2) - 0.5) * 0.1, 1);
    pc.rect(23, 9, 4, 2, 0x1a0a0a); pc.set(23, 9, 0xe03a2a); pc.set(25, 9, 0xe03a2a); pc.set(26, 9, 0xe03a2a);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) pc.set(23 + c * 1.5 | 0, 13 + r * 2, r === 3 && c === 2 ? 0xd04040 : 0xe0e0dc);
    pc.rect(24, 22, 2, 3, 0xb4b8bc); pc.vline(25, 22, 24, 0x101010);
    pc.set(23, 27, 0xb4b8bc); pc.set(26, 27, 0x4a4c50);
    pc.rect(23, 30, 4, 5, 0x2a2c30); pc.hline(23, 26, 32, 0x8a8a8a); pc.set(26, 30, 0x40e060);
    pc.rect(22, 37, 6, 3, 0xf0d040); pc.hline(23, 26, 38, 0x6a5010);
    // delivery flap
    pc.rect(1, 45, 27, 11, frame[2]);
    pc.rect(2, 46, 18, 6, 0x101114); pc.hline(2, 19, 46, 0x3a3c44);
    txtC(pc, 'PUSH', 11, 47, 0xc8ccd4);
    pc.rect(22, 46, 5, 4, 0x101114); pc.hline(22, 26, 49, 0x5a5c60);
    pc.rect(1, 53, 27, 3, frame[0]);
    for (let x = 3; x < 27; x += 3) pc.set(x, 54, frame[2]);
  });
  A.add('p_vend_soda', 29, 56, (pc) => {
    pc.wrap = false;
    const red = makeRamp(0xc42a2a, 6, { hueShift: 0.03 });
    pc.fill(red[1]);
    // lit panel: deep red backdrop so the can pops
    fillR(pc, 1, 1, 20, 43, [0x5a1212, 0x741818, 0x8e1e1e, 0xa82424, 0xc02a2a], (x, y) => 0.95 - Math.abs(x - 10.5) / 16 - y / 43 * 0.35 + (ph(x, y, 4) - 0.5) * 0.05, 1);
    for (let x = 1; x < 21; x++) { const y = 33 + Math.round(Math.sin(x * 0.35) * 2); pc.set(x, y, 0xf4f0ec); pc.set(x, y + 1, 0xf4f0ec); pc.set(x, y + 2, red[4]); }
    txtC(pc, 'COLA', 11, 3, 0xfaf6f0);
    pc.ellipseBlend(11, 20, 7, 11, 0xff9a7a, 0.45);
    const canCols = [0xa82820, 0xf06a54, 0xe8402e, 0xe03a2c, 0xe03a2c, 0xd0342a, 0xa82820, 0x7a1a16];
    for (let x = 0; x < 8; x++) for (let y = 11; y < 29; y++) pc.set(7 + x, y, canCols[x]);
    pc.hline(8, 13, 10, 0xb8bcc0); pc.hline(7, 14, 11, 0xdfe3e6); pc.set(7, 11, 0x9a9ea2); pc.set(14, 11, 0x8a8e92);
    pc.hline(7, 14, 28, 0xa8acb0); pc.hline(8, 13, 29, 0x7a7e82);
    for (let x = 7; x < 15; x++) { const y = 19 + Math.round(Math.sin((x - 7) * 0.9) * 1.5); pc.set(x, y, 0xfaf6f0); pc.set(x, y + 1, x === 7 || x === 14 ? 0xd8d0cc : 0xfaf6f0); }
    pc.set(9, 14, 0xffd8d0); pc.set(12, 24, 0xffe0d8); pc.set(10, 26, 0xffffff); pc.set(13, 15, 0xffd0c8);
    txtC(pc, 'COLD', 11, 37, 0xfaf6f0);
    for (let i = 0; i < 26; i++) pc.blend(2 + i * 0.7, 43 - i, 0xffffff, 0.12);
    // selection buttons
    const drinks = [0xc42a2a, 0x3a2416, 0x8ad040, 0xf08a20, 0x7a3aa0, 0xe8e8e0];
    pc.rect(22, 1, 6, 43, 0x2a2a2e);
    drinks.forEach((c, i) => {
      const by = 3 + i * 5;
      pc.rect(23, by, 4, 4, 0xe4e0d8); pc.rect(23, by + 1, 4, 2, c); pc.set(26, by + 3, 0x40e060);
      if (i === 5) pc.set(24, by + 1, 0x1a1a1a);
    });
    pc.rect(23, 34, 3, 3, 0xb4b8bc); pc.vline(24, 34, 36, 0x101010);
    pc.rect(23, 38, 4, 4, 0x1a1a1e); pc.hline(23, 26, 40, 0x8a8a8a);
    // dispenser
    pc.rect(1, 45, 27, 11, red[0]);
    pc.rect(3, 46, 16, 6, 0x0e0808); pc.hline(3, 18, 46, red[2]); pc.hline(4, 17, 51, 0x3a2a2a);
    pc.rect(22, 46, 4, 4, 0x0e0808);
    pc.rect(1, 53, 27, 3, scaleHex(red[0], 0.7));
  });
  A.add('p_vend_soda_side', 26, 58, (pc) => {
    pc.wrap = false;
    const red = makeRamp(0xb42828, 5);
    fillR(pc, 0, 0, 26, 58, red, (x, y) => 0.55 + (tileFbm(x, y, 32, 64, 4, 2, 3) - 0.5) * 0.15, 1);
    for (let y = 0; y < 58; y++) { const x = Math.round(13 + Math.sin(y * 0.12 + 1) * 8); for (let k = -1; k <= 1; k++) pc.set(x + k, y, 0xf0ece8); pc.set(x + 2, y, red[4]); }
    pc.hline(0, 25, 0, red[4]); pc.rect(0, 54, 26, 4, red[0]);
  });

  // ---------- signs & small wall things
  A.add('p_sign_reception', 38, 7, (pc) => {
    pc.wrap = false;
    pc.fill(0x2a2420); pc.hline(0, 37, 0, 0x4a4038); pc.hline(0, 37, 6, 0x1a1410);
    txtC(pc, 'RECEPTION', 19, 1, 0xd8b45a);
    for (let x = 2; x < 36; x += 4) if (pc.get(x, 1) === 0xd8b45a) pc.set(x, 1, 0xf8e8a0);
  });
  A.add('p_sign_security', 32, 7, (pc) => {
    pc.wrap = false;
    pc.fill(0x1a2a4a); pc.hline(0, 31, 0, 0x3a4a6a); pc.hline(0, 31, 6, 0x0a1428);
    txtC(pc, 'SECURITY', 16, 1, 0xf0f0f4);
  });
  A.add('p_exit', 17, 7, (pc) => {
    pc.wrap = false;
    pc.fill(0x0a1a0e);
    txt(pc, 'EXIT', 1, 1, 0x5aff7a);
    pc.strokeRect(0, 0, 17, 7, 0x1a3a22);
    pc.set(16, 3, 0x5aff7a);
  });
  A.add('p_sign_fire', 8, 8, (pc) => {
    pc.wrap = false;
    pc.fill(0xc82a2a);
    pc.rect(3, 3, 2, 4, 0xf4f0ec); pc.set(3, 2, 0xf4f0ec); pc.set(5, 2, 0xf4f0ec); pc.set(5, 3, 0xf4f0ec); pc.set(6, 4, 0xf4f0ec);
    pc.set(1, 6, 0xf4c040); pc.set(1, 5, 0xf8e070); pc.set(2, 6, 0xf4c040);
    border(pc, 0x8a1a1a);
  });
  A.add('p_breaker', 13, 19, (pc) => {
    pc.wrap = false;
    const G = makeRamp(0x8e9290, 5, { spread: 0.3 });
    pc.fill(G[2]);
    border(pc, G[0]); pc.hline(1, 11, 1, G[4]);
    pc.rect(4, 2, 5, 3, 0x1e1e20); pc.hline(5, 7, 3, 0x5a5a5e); // main
    for (let i = 0; i < 6; i++) {
      for (const cx of [3, 7]) {
        const y = 6 + i * 2;
        pc.rect(cx, y, 3, 1, 0x26262a);
        const tripped = i === 3 && cx === 7;
        pc.set(cx + (tripped ? 2 : 0), y, tripped ? 0xd03030 : 0x6a6a70);
        pc.set(cx === 3 ? 1 : 11, y, 0xe8e4d8);
      }
    }
    pc.vline(6, 5, 17, G[1]);
    screw(pc, 2, 17, G[4], G[0]); screw(pc, 10, 17, G[4], G[0]);
  });
  A.add('p_breaker_door', 13, 19, (pc) => {
    pc.wrap = false;
    const G = makeRamp(0x8e9290, 5, { spread: 0.3 });
    pc.fill(G[2]); border(pc, G[1]);
    pc.rect(2, 2, 9, 14, 0xeeeae0);
    for (let r = 0; r < 6; r++) { pc.hline(2, 10, 3 + r * 2 + 1, 0xc8c4b8); scribble(pc, 3, 3 + r * 2, 6, 1, 0x2a3a8a, 50 + r); }
    pc.set(9, 9, 0xd02020); pc.set(9, 11, 0xd02020);
    pc.rect(1, 1, 3, 1, 0xe8d890); pc.rect(9, 15, 3, 1, 0xe8d890);
  });
  A.add('p_fusebox', 10, 13, (pc) => {
    pc.wrap = false;
    const B = makeRamp(0x4a3426, 5);
    pc.fill(B[2]); border(pc, B[0]); pc.hline(1, 8, 1, B[4]);
    pc.rect(2, 2, 6, 3, B[0]); pc.hline(3, 6, 3, 0xb8b4ac); // pull-out main
    const fuse = (x: number, y: number, blown: boolean) => {
      pc.rect(x, y, 3, 3, 0xb87a3a); pc.set(x + 1, y + 1, blown ? 0x101010 : 0xe8c870);
      pc.set(x, y, 0xd8a060);
    };
    fuse(1, 6, false); fuse(6, 6, false); fuse(1, 9, true); fuse(6, 9, false);
    pc.set(5, 12, 0xd02020); pc.set(4, 11, 0xd02020); pc.set(5, 11, 0xf0d040); pc.set(6, 11, 0xd02020);
  });
  A.add('p_switch', 4, 6, (pc) => {
    pc.wrap = false;
    pc.fill(0xe0d8c4); pc.vline(3, 0, 5, 0xb8b09c); pc.hline(0, 3, 5, 0xb8b09c);
    pc.set(1, 0, 0x8a8478); pc.set(1, 5, 0x8a8478);
    pc.rect(1, 2, 2, 2, 0xc8c0aa);
  });

  // ---------- CCTV feeds
  for (let i = 0; i < 6; i++) A.add('p_cctv_' + i, 14, 11, (pc) => cctv(pc, i));
});

// ============================================================ models
function steelTint(c: number) { return { color: c }; }

defObj({
  key: 'chair_office', name: 'Office Chair', height: 1.05, block: 'low', sit: true, movable: 14,
  sound: 'plastic', flammable: 0.3,
  disassemble: { tools: ['#screwdriver'], time: 10, skill: 'mechanics', yields: [['scrap_metal', 1, 2], ['screws', 2, 4], ['rag', 1, 2], ['spring', 0, 1]] },
  tags: T('office', 'chair', 'sit'),
  model: (mb) => {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.31;
      mb.push().rotateY(a); mb.box(0.14, 0.045, 0, 0.27, 0.035, 0.045, 'plastic_black'); mb.pop();
      caster(mb, Math.cos(a) * 0.27, -Math.sin(a) * 0.27, 0.026);
    }
    mb.cylinder(0, 0.035, 0, 0.05, 0.05, 6, 'plastic_black');
    mb.cylinder(0, 0.08, 0, 0.022, 0.3, 6, 'chrome');
    mb.box(0, 0.36, 0, 0.2, 0.05, 0.22, 'metal_dark');
    mb.box(0.12, 0.37, 0.08, 0.1, 0.012, 0.02, 'plastic_black');
    mb.box(0, 0.41, 0.01, 0.5, 0.03, 0.48, 'plastic_black');
    mb.box(0, 0.44, 0.02, 0.48, 0.07, 0.45, 'fabric_blue', { color: 0xb4b8c4 });
    mb.box(0, 0.38, -0.2, 0.08, 0.04, 0.16, 'metal_dark');
    mb.box(0, 0.38, -0.29, 0.07, 0.3, 0.03, 'metal_dark');
    mb.push().translate(0, 0.6, -0.29).rotateX(-0.13);
    mb.box(0, 0, 0, 0.45, 0.44, 0.07, 'fabric_blue', { color: 0xb4b8c4 });
    mb.box(0, 0.03, -0.045, 0.41, 0.38, 0.02, 'plastic_black');
    mb.pop();
    for (const sx of [-1, 1]) {
      mb.box(sx * 0.255, 0.41, -0.03, 0.035, 0.24, 0.045, 'plastic_black');
      mb.box(sx * 0.255, 0.65, -0.01, 0.065, 0.03, 0.27, 'plastic_black');
    }
  },
});

defObj({
  key: 'desk_office', name: 'Office Desk', w: 2, d: 1, height: 0.78, block: 'table', surface: 0.75, movable: 60,
  container: { capacity: 20, kind: 'desk', loot: 'office_desk' }, sound: 'metal', flammable: 0.2,
  disassemble: { tools: ['#screwdriver', '#hammer'], time: 25, skill: 'mechanics', yields: [['sheet_metal', 1, 3], ['scrap_metal', 1, 3], ['screws', 3, 6], ['plank', 0, 1]] },
  tags: T('office', 'desk', 'table'),
  model: (mb) => {
    const top = 0.75, D = 0.8, zc = -0.04, zf = zc + D / 2 - 0.04;
    const st = steelTint(0xb8c4b0);
    mb.box(0, top - 0.032, zc, 1.92, 0.03, D + 0.02, 'rubber_black');
    mb.box(0, top - 0.031, zc, 1.9, 0.031, D, { top: 'wood_light', all: 'rubber_black' });
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? -0.93 : 0.47, x1 = side < 0 ? -0.47 : 0.93;
      mb.boxMinMax(x0, 0.04, zc - D / 2 + 0.03, x1, top - 0.032, zf, 'p_steel', st);
      mb.boxMinMax(x0 + 0.02, 0, zc - D / 2 + 0.06, x1 - 0.02, 0.04, zf - 0.04, 'metal_dark');
      const cells = frontGrid(mb, x0 + 0.02, x1 - 0.02, 0.07, top - 0.05, zf, [1], side < 0 ? [1, 1.9] : [1, 1, 1.9], 'p_steel_drawer', { ...st, fit: { south: true } }, 0.03, 'metal_dark');
      for (const c of cells) hbar(mb, (c.x0 + c.x1) / 2, c.y1 - 0.06, zf + 0.02, 0.13, 'metal_brushed');
    }
    // pencil drawer + modesty panel
    mb.boxMinMax(-0.46, top - 0.12, zf - 0.03, 0.46, top - 0.033, zf - 0.01, 'p_steel', st);
    hbar(mb, 0, top - 0.08, zf - 0.01, 0.2, 'metal_brushed');
    mb.boxMinMax(-0.47, 0.18, zc - D / 2 + 0.04, 0.47, top - 0.033, zc - D / 2 + 0.06, 'p_steel', { color: 0x9aa494 });
    // desk things kept to the edges so surface items fit
    mb.flat(0, top + 0.002, zc + 0.12, 0.6, 0.42, 'p_desk_blotter');
    mb.cylinder(-0.82, top, zc - 0.27, 0.045, 0.1, 6, 'plastic_black', { rTop: 0.05 });
    for (const [dx, dz, c] of [[-0.01, 0.01, 0x2a4ab0], [0.015, -0.01, 0xc02a2a], [0, 0.015, 0x1a1a1a]] as const) mb.box(-0.82 + dx, top + 0.08, zc - 0.27 + dz, 0.008, 0.07, 0.008, 'white', { color: c });
    papers(mb, 0.8, top, zc + 0.16, 3, 11);
    mug(mb, -0.75, top, zc + 0.2, 0xe8e2d4);
  },
});

defObj({
  key: 'desk_cubicle', name: 'Cubicle Desk', height: 1.42, block: 'table', surface: 0.75, movable: 45,
  container: { capacity: 14, kind: 'desk', loot: 'office_desk' }, sound: 'wood', flammable: 0.4,
  disassemble: { tools: ['#screwdriver'], time: 18, skill: 'carpentry', yields: [['plank', 1, 2], ['screws', 2, 5], ['scrap_metal', 0, 2]] },
  tags: T('office', 'desk', 'table'),
  model: (mb) => {
    const top = 0.75, lam = { color: 0xd8d4cc };
    mb.box(0, top - 0.03, -0.05, 0.96, 0.03, 0.78, { top: 'wood_light', all: 'plastic_black' }, lam);
    mb.box(-0.455, 0, -0.05, 0.03, top - 0.03, 0.72, 'plastic_white', { color: 0xa8a8a4 });
    mb.box(0, 0.25, -0.42, 0.88, 0.45, 0.02, 'plastic_white', { color: 0x9a9a96 });
    // mobile pedestal on casters
    mb.box(0.24, 0.06, -0.08, 0.4, 0.55, 0.55, 'p_steel', { color: 0x9a9c9a });
    const zf = -0.08 + 0.275;
    const cells = frontGrid(mb, 0.06, 0.42, 0.08, 0.6, zf, [1], [1, 1.8], 'p_steel_drawer', { color: 0x9a9c9a, fit: { south: true } });
    for (const c of cells) hbar(mb, 0.24, c.y1 - 0.06, zf + 0.02, 0.12, 'metal_brushed');
    for (const [x, z] of [[0.08, -0.32], [0.4, -0.32], [0.08, 0.16], [0.4, 0.16]]) caster(mb, x, z, 0.025);
    // hutch shelf with binders
    for (const sx of [-0.44, 0.44]) mb.box(sx, top, -0.39, 0.03, 0.4, 0.1, 'plastic_white', { color: 0xa8a8a4 });
    mb.box(0, top + 0.38, -0.36, 0.92, 0.025, 0.18, 'wood_light', lam);
    const bc = [0x2a4a8a, 0x8a2a2a, 0x2a6a4a, 0x2a2a2a, 0xc8a030];
    for (let i = 0; i < 5; i++) {
      const x = -0.38 + i * 0.07 + (i > 2 ? 0.05 : 0);
      mb.push().translate(x, top + 0.405, -0.36);
      if (i === 4) mb.rotateZ(-0.35);
      mb.box(0, 0, 0, 0.055, 0.27, 0.2, { south: 'p_binder', all: 'plastic_black' }, { color: bc[i], fit: { south: true } });
      mb.pop();
    }
    mb.box(0.28, top + 0.405, -0.36, 0.2, 0.07, 0.15, 'cardboard');
    papers(mb, -0.3, top, 0.18, 2, 4);
  },
});

defObj({
  key: 'filing_cabinet', name: 'Filing Cabinet', height: 1.32, block: 'solid', movable: 40,
  container: { capacity: 25, kind: 'drawer', loot: 'filing' }, sound: 'metal', flammable: 0,
  disassemble: { tools: ['#screwdriver'], time: 14, skill: 'mechanics', yields: [['sheet_metal', 1, 3], ['scrap_metal', 1, 2], ['screws', 2, 5]] },
  tags: T('office', 'cabinet'),
  model: (mb) => {
    const W = 0.47, H = 1.32, D = 0.62, zc = WZ + D / 2 + 0.01, zf = zc + D / 2;
    const st = steelTint(0xcfc3ac);
    mb.box(0, 0.03, zc, W, H - 0.03, D, 'p_steel', st);
    mb.box(0, 0, zc + 0.02, W - 0.04, 0.03, D - 0.06, 'metal_dark');
    mb.box(0, H - 0.01, zc, W + 0.01, 0.012, D + 0.01, 'p_steel', { color: 0xc8bfae });
    const ys = [1.0, 0.69, 0.38, 0.07];
    ys.forEach((y, i) => {
      const out = i === 1 ? 0.07 : 0;
      if (out) mb.box(0, y + 0.03, zf + out / 2 - 0.02, W - 0.08, 0.24, out + 0.02, 'p_steel', { color: 0xa89e8e });
      mb.box(0, y, zf + out, W - 0.03, 0.29, 0.02, { south: 'p_steel_drawer', all: 'p_steel' }, { ...st, fit: { south: true } });
      if (out) papers(mb, 0, y + 0.27, zf + 0.02, 1, 7);
    });
    // a dent and a sticker on the side
    mb.box(W / 2 + 0.002, 0.95, zc + 0.12, 0.004, 0.08, 0.12, 'p_label');
  },
});

function bookBlock(mb: ModelBuilder, x: number, y: number, z: number, w: number, d: number, tex: string, ou = 0) {
  mb.box(x, y, z, w, 10 / 32, d, { south: tex, north: tex, top: 'p_book_tops', all: 'paper' }, { uvOffset: [ou, -y] });
}

defObj({
  key: 'bookshelf', name: 'Bookshelf', height: 2.0, block: 'solid', blocksSight: true, movable: 45,
  container: { capacity: 30, kind: 'shelf', loot: 'bookshelf' }, sound: 'wood', flammable: 0.8,
  disassemble: { tools: ['#hammer'], time: 20, skill: 'carpentry', yields: [['plank', 2, 4], ['nails', 3, 8]] },
  tags: T('office', 'home', 'shelf', 'books'),
  model: (mb) => {
    const W = 0.92, H = 2.0, D = 0.34, zc = WZ + D / 2 + 0.005, zf = zc + D / 2;
    mb.box(-W / 2 + 0.013, 0, zc, 0.026, H - 0.04, D, 'wood_dark');
    mb.box(W / 2 - 0.013, 0, zc, 0.026, H - 0.04, D, 'wood_dark');
    mb.box(0, H - 0.045, zc + 0.005, W + 0.05, 0.045, D + 0.02, 'wood_dark');
    mb.box(0, H - 0.075, zf - 0.01, W - 0.05, 0.03, 0.02, 'wood_trim');
    mb.box(0, 0, zc, W - 0.05, 0.08, D, 'wood_dark', { color: 0xc8c0b8 });
    mb.box(0, 0.08, zc - D / 2 + 0.006, W - 0.05, H - 0.13, 0.012, 'wood_dark', { color: 0x8a8078 });
    const shelfY = [0.08, 0.44, 0.8, 1.16, 1.52];
    const inner = W - 0.052;
    shelfY.forEach((y, i) => {
      if (i > 0) mb.box(0, y - 0.022, zc + 0.005, inner, 0.022, D - 0.01, 'wood_dark');
      const bz = zf - 0.13;
      if (i === 1) {
        bookBlock(mb, -0.12, y, bz, inner - 0.25, 0.22, 'p_books_a', 0.3);
        mb.push().translate(0.27, y, bz).rotateZ(-0.38); mb.box(0.03, 0, 0, 0.045, 0.27, 0.2, 'wood_dark', { color: 0x6a2a2a }); mb.pop();
        mb.box(0.37, y, bz, 0.05, 0.22, 0.17, 'cardboard');
      } else if (i === 3) {
        bookBlock(mb, -0.2, y, bz, inner * 0.5, 0.22, 'p_books_b', 0.1);
        mb.box(0.2, y, bz - 0.02, 0.3, 0.16, 0.22, 'cardboard');
        mb.box(0.2, y + 0.16, bz - 0.02, 0.31, 0.012, 0.23, 'cardboard', { color: 0xd8c8a8 });
      } else {
        bookBlock(mb, 0, y, bz, inner, 0.22, ['p_books_a', 'p_books_c', 'p_books_b', 'p_books_c', 'p_books_a'][i], i * 0.37);
      }
    });
  },
});

defObj({
  key: 'copier', name: 'Photocopier', height: 1.06, block: 'solid', movable: 90, power: true, hum: 'machine',
  sound: 'plastic', flammable: 0.2,
  disassemble: { tools: ['#screwdriver'], time: 30, skill: 'electrical', yields: [['electronics_scrap', 2, 4], ['scrap_metal', 2, 4], ['screws', 3, 8], ['glass_shard', 0, 1], ['wire', 1, 2]] },
  tags: T('office', 'machine'),
  model: (mb) => {
    const body = { color: 0xdcd8cc }, zc = -0.06, zf = zc + 0.28;
    mb.box(0, 0, zc, 0.6, 0.05, 0.52, 'metal_dark');
    mb.box(0, 0.05, zc, 0.62, 0.56, 0.56, 'plastic_white', body);
    for (let i = 0; i < 3; i++) mb.box(0, 0.075 + i * 0.175, zf + 0.008, 0.58, 0.16, 0.02, { south: 'p_copier_tray', all: 'plastic_white' }, { ...body, fit: { south: true } });
    mb.box(0, 0.61, zc, 0.66, 0.36, 0.6, 'plastic_white', { color: 0xc8c4b8 });
    mb.box(-0.05, 0.75, zf + 0.025, 0.4, 0.04, 0.012, 'metal_dark');
    mb.box(0.36, 0.62, zc, 0.06, 0.3, 0.4, 'p_vent');
    // output tray + copies on the left
    mb.wedge(-0.43, 0.68, zc, 0.22, 0.4, 0.02, 0.02, 'plastic_white', { color: 0xa8a49a });
    mb.push().translate(-0.43, 0.7, zc).rotateZ(-0.12);
    mb.box(0, 0, 0, 0.2, 0.025, 0.3, { top: 'p_paper_doc', all: 'paper' }, { fit: { top: true } });
    mb.pop();
    // platen lid + control panel
    mb.box(0, 0.97, zc - 0.02, 0.64, 0.05, 0.54, 'plastic_white', { color: 0xa6a49e });
    mb.box(0, 1.02, zc - 0.02, 0.58, 0.012, 0.48, 'plastic_white', { color: 0x8a8884 });
    mb.wedge(0.12, 0.97, zf + 0.02, 0.38, 0.14, 0.07, 0.03, { top: 'p_copier_panel', all: 'plastic_white' }, { color: 0xd0ccc0 });
    // jammed sheet sticking out
    mb.push().translate(0.33, 0.85, zc + 0.05).rotateZ(0.5);
    mb.box(0.05, 0, 0, 0.12, 0.004, 0.21, 'paper'); mb.pop();
  },
});

defObj({
  key: 'printer_desk', name: 'Printer Stand', height: 1.0, block: 'table', surface: 0.65, movable: 30, power: true,
  sound: 'metal', flammable: 0.3,
  container: { capacity: 10, kind: 'shelf', loot: 'office_drawer' },
  disassemble: { tools: ['#screwdriver'], time: 15, skill: 'electrical', yields: [['electronics_scrap', 1, 3], ['scrap_metal', 1, 3], ['screws', 2, 4], ['wire', 0, 1]] },
  tags: T('office', 'table'),
  model: (mb) => {
    const zc = -0.08;
    mb.box(0, 0.62, zc, 0.72, 0.03, 0.52, 'metal_grey');
    legs4(mb, 0.7, 0.5, 0.62, 0.03, 'metal_dark', {}, 0, zc);
    mb.box(0, 0.14, zc, 0.66, 0.02, 0.46, 'p_mesh');
    // fanfold paper stack below
    mb.box(0, 0.16, zc, 0.38, 0.12, 0.26, { top: 'p_tractor_paper', all: 'paper' });
    // dot matrix printer
    mb.box(0, 0.65, zc, 0.5, 0.13, 0.32, { south: 'p_dotmatrix', all: 'plastic_beige' }, { fit: { south: true } });
    mb.box(0, 0.78, zc - 0.03, 0.44, 0.03, 0.18, 'plastic_beige', { color: 0xc8c0a8 });
    mb.box(0, 0.78, zc + 0.08, 0.42, 0.02, 0.06, 'glass_dark');
    mb.cylinderX(0.27, 0.73, zc, 0.03, 0.04, 6, 'plastic_black');
    // paper feeding out of the top, curling back
    mb.push().translate(0, 0.8, zc + 0.02).rotateX(-0.35);
    mb.box(0, 0, 0, 0.38, 0.24, 0.004, { south: 'p_tractor_paper', north: 'p_tractor_paper', all: 'paper' }, { fit: { south: true, north: true } });
    mb.pop();
    mb.cylinderX(-0.31, 0.7, zc + 0.1, 0.012, 0.06, 4, 'metal_dark');
  },
});

defObj({
  key: 'computer', name: 'Computer', height: 0.6, block: 'none', movable: 14, power: true, hum: 'computer',
  light: { color: 0x8affa8, intensity: 0.22, radius: 2.0, y: 1.05, kind: 'screen', power: true },
  sound: 'plastic', flammable: 0.2, lore: 'terminal',
  disassemble: { tools: ['#screwdriver'], time: 16, skill: 'electrical', yields: [['electronics_scrap', 2, 5], ['wire', 1, 2], ['glass_shard', 0, 2], ['screws', 2, 4]] },
  tags: T('office', 'terminal', 'surface_item', 'electronics'),
  variant: (s) => (scrOn(s) ? 'on' : 'off'),
  model: (mb, s) => {
    const on = scrOn(s);
    mb.box(0, 0, -0.04, 0.42, 0.13, 0.38, { south: 'p_pc_case', all: 'plastic_beige' }, { fit: { south: true } });
    crtMonitor(mb, 0, 0.13, -0.05, 0.95, on ? 'p_crt_term' : 'p_crt_off', on ? 0.9 : 0);
    keyboard(mb, -0.02, 0, 0.26, 0.42);
    mb.box(0.28, 0, 0.24, 0.05, 0.025, 0.08, 'plastic_beige');
    mb.box(0.28, 0.005, 0.18, 0.006, 0.006, 0.05, 'plastic_black');
    mb.box(-0.02, 0.005, 0.165, 0.006, 0.006, 0.03, 'plastic_black');
    mb.box(-0.15, 0.13, -0.1, 0.08, 0.004, 0.06, 'p_label');
  },
});

defObj({
  key: 'water_cooler', name: 'Water Cooler', height: 1.42, block: 'solid', movable: 25,
  water: { capacity: 18, tap: true, tainted: false }, sound: 'plastic', flammable: 0.1,
  disassemble: { tools: ['#screwdriver'], time: 10, skill: 'mechanics', yields: [['scrap_metal', 1, 2], ['pipe', 0, 1], ['screws', 1, 3]] },
  tags: T('office', 'water'),
  model: (mb) => {
    const zc = WZ + 0.2, zf = zc + 0.16, body = { color: 0xe8e4da };
    mb.box(0, 0, zc, 0.34, 0.04, 0.34, 'plastic_black');
    mb.box(0, 0.04, zc, 0.32, 0.92, 0.32, 'plastic_white', body);
    mb.box(0, 0.58, zf + 0.004, 0.24, 0.26, 0.012, 'plastic_white', { color: 0x9a968e });
    mb.box(0, 0.56, zf + 0.04, 0.22, 0.03, 0.08, 'p_perf');
    mb.box(-0.06, 0.76, zf + 0.025, 0.04, 0.05, 0.05, 'plastic_blue');
    mb.box(0.06, 0.76, zf + 0.025, 0.04, 0.05, 0.05, 'plastic_red');
    mb.box(0, 0.88, zf + 0.004, 0.2, 0.05, 0.012, 'p_label');
    mb.box(0, 0.3, zc - 0.161, 0.2, 0.2, 0.004, 'p_vent');
    mb.cylinder(0, 0.96, zc, 0.11, 0.04, 8, 'plastic_white', { color: 0xd8d4ca });
    mb.cylinder(0, 1.0, zc, 0.05, 0.06, 8, 'p_water_bottle', { rTop: 0.135, fit: true });
    mb.cylinder(0, 1.06, zc, 0.135, 0.32, 10, { sides: 'p_water_bottle', top: 'glass', bottom: 'glass' }, { fit: true });
    mb.cylinder(0, 1.38, zc, 0.135, 0.03, 10, 'glass', { rTop: 0.11, color: 0x9ccbe8 });
    mb.cylinder(0.205, 0.5, zc + 0.05, 0.04, 0.28, 6, 'plastic_white');
    mb.cylinder(0.205, 0.46, zc + 0.05, 0.034, 0.04, 6, 'paper');
  },
});

defObj({
  key: 'coffee_maker', name: 'Coffee Maker', height: 0.4, block: 'none', movable: 3, power: true,
  heat: 'kettle', sound: 'plastic', flammable: 0.2,
  disassemble: { tools: ['#screwdriver'], time: 6, skill: 'electrical', yields: [['electronics_scrap', 1, 1], ['wire', 0, 1], ['glass_shard', 0, 1]] },
  tags: T('office', 'kitchen', 'surface_item', 'appliance'),
  model: (mb) => {
    mb.box(0, 0, 0, 0.22, 0.04, 0.26, 'plastic_black');
    mb.box(0, 0.04, -0.085, 0.22, 0.3, 0.09, 'plastic_black');
    mb.box(0, 0.3, 0.005, 0.23, 0.08, 0.25, 'plastic_black', { color: 0xd0d0d0 });
    mb.cylinder(0, 0.27, 0.04, 0.07, 0.03, 8, 'plastic_black', { rTop: 0.05 });
    mb.cylinder(0, 0.04, 0.04, 0.07, 0.006, 8, 'metal_dark');
    mb.cylinder(0, 0.046, 0.04, 0.066, 0.13, 8, { sides: 'p_carafe', top: 'plastic_black', bottom: 'glass_dark' }, { fit: true });
    mb.box(0.085, 0.07, 0.04, 0.02, 0.08, 0.025, 'plastic_black');
    mb.box(0.075, 0.015, 0.13, 0.03, 0.018, 0.006, 'led_red', { emissive: 1.1 });
  },
});

defObj({
  key: 'whiteboard', name: 'Whiteboard', w: 2, d: 1, height: 1.95, block: 'none', onWall: true, movable: 12,
  sound: 'metal', flammable: 0.1, tags: T('office', 'school', 'board', 'wall'),
  disassemble: { tools: ['#screwdriver'], time: 8, yields: [['scrap_metal', 1, 2], ['screws', 2, 4]] },
  model: (mb) => {
    const z = WZ + 0.012, y0 = 0.95, H = 0.98, W = 1.8;
    mb.box(0, y0, z, W, H, 0.02, { south: 'p_whiteboard', all: 'plastic_white' }, { fit: { south: true } });
    const fz = WZ + 0.02;
    mb.box(0, y0 + H - 0.01, fz, W + 0.04, 0.035, 0.04, 'metal_brushed');
    mb.box(0, y0 - 0.025, fz, W + 0.04, 0.035, 0.04, 'metal_brushed');
    mb.box(-W / 2 - 0.005, y0, fz, 0.03, H, 0.04, 'metal_brushed');
    mb.box(W / 2 + 0.005, y0, fz, 0.03, H, 0.04, 'metal_brushed');
    mb.box(0, y0 - 0.05, WZ + 0.055, 1.3, 0.025, 0.08, 'metal_brushed');
    const mk: [number, number][] = [[-0.3, 0x1a1a1a], [-0.18, 0x2a4ab0], [0.05, 0xc02a2a]];
    for (const [x, c] of mk) { mb.box(x, y0 - 0.025, WZ + 0.07, 0.11, 0.02, 0.02, 'plastic_white'); mb.box(x + 0.06, y0 - 0.025, WZ + 0.07, 0.025, 0.022, 0.022, 'white', { color: c }); }
    mb.box(0.35, y0 - 0.025, WZ + 0.065, 0.13, 0.04, 0.05, 'plastic_black');
    mb.box(0.35, y0 - 0.025, WZ + 0.065, 0.13, 0.012, 0.05, 'fabric_grey');
  },
});

defObj({
  key: 'noticeboard', name: 'Notice Board', height: 1.75, block: 'none', onWall: true, movable: 4,
  sound: 'wood', flammable: 0.8, tags: T('office', 'school', 'board', 'wall'),
  disassemble: { tools: [], time: 4, yields: [['plank', 0, 1]] },
  model: (mb) => {
    const z = WZ + 0.012, y0 = 1.12, W = 0.81, H = 0.6;
    mb.box(0, y0, z, W, H, 0.02, { south: 'p_corkboard', all: 'wood_trim' }, { fit: { south: true } });
    const fz = WZ + 0.018;
    mb.box(0, y0 + H - 0.005, fz, W + 0.06, 0.04, 0.035, 'wood_trim');
    mb.box(0, y0 - 0.035, fz, W + 0.06, 0.04, 0.035, 'wood_trim');
    mb.box(-W / 2 - 0.015, y0, fz, 0.035, H, 0.035, 'wood_trim');
    mb.box(W / 2 + 0.015, y0, fz, 0.035, H, 0.035, 'wood_trim');
  },
});

defObj({
  key: 'clock_wall', name: 'Wall Clock', height: 2.1, block: 'none', onWall: true, movable: 1,
  sound: 'plastic', flammable: 0.3, tags: T('office', 'school', 'clock', 'wall'),
  disassemble: { tools: [], time: 3, yields: [['electronics_scrap', 0, 1]] },
  model: (mb) => {
    mb.cylinderZ(0, 1.95, WZ + 0.025, 0.16, 0.05, 12, { top: 'p_clock', bottom: 'plastic_black', sides: 'plastic_black' }, { fit: true });
    mb.cylinderZ(0, 1.95, WZ + 0.025, 0.168, 0.042, 12, 'plastic_black');
  },
});

const PAINTINGS = ['p_paint_field', 'p_paint_door', 'p_paint_hall', 'p_paint_eye', 'p_paint_sun', 'p_paint_pool'];
defObj({
  key: 'painting', name: 'Painting', height: 1.95, block: 'none', onWall: true, movable: 4,
  sound: 'wood', flammable: 0.9, tags: T('office', 'home', 'painting', 'wall', 'decor'),
  disassemble: { tools: [], time: 4, yields: [['plank', 0, 1], ['rag', 0, 1]] },
  variant: (s) => 'v' + (Math.abs(Math.floor(s.v ?? 0)) % 6),
  model: (mb, s) => {
    const v = Math.abs(Math.floor(s.v ?? 0)) % 6;
    const W = 0.82, H = 0.63, y0 = 1.22, z = WZ + 0.015;
    mb.box(0, y0, z, W, H, 0.02, { south: PAINTINGS[v], all: 'wood_dark' }, { fit: { south: true } });
    const gilt = v === 1 || v === 3;
    const ft = gilt ? 'metal_brass' : 'wood_dark';
    const fz = WZ + 0.025, t = 0.055;
    mb.box(0, y0 + H, fz, W + t * 2, t, 0.05, ft);
    mb.box(0, y0 - t, fz, W + t * 2, t, 0.05, ft);
    mb.box(-W / 2 - t / 2, y0, fz, t, H, 0.05, ft);
    mb.box(W / 2 + t / 2, y0, fz, t, H, 0.05, ft);
    mb.box(0, y0 + H - 0.006, fz + 0.026, W + 0.02, 0.012, 0.004, gilt ? 'metal_brass' : 'wood_trim', { color: 0xfff0d0 });
  },
});

const POSTERS = ['p_poster_focus', 'p_poster_missing', 'p_poster_calm', 'p_poster_kind'];
defObj({
  key: 'poster', name: 'Poster', height: 1.95, block: 'none', onWall: true, movable: 0.2,
  sound: 'paper', flammable: 1, tags: T('office', 'school', 'poster', 'wall', 'decor'),
  variant: (s) => 'v' + (Math.abs(Math.floor(s.v ?? 0)) % 4),
  model: (mb, s) => {
    const v = Math.abs(Math.floor(s.v ?? 0)) % 4;
    const W = 0.69, H = 0.94, y0 = 1.0;
    mb.box(0, y0, WZ + 0.004, W, H, 0.006, { south: POSTERS[v], all: 'paper' }, { fit: { south: true } });
    const tape = v === 1 ? 'metal_grey' : 'paper';
    for (const [x, y] of [[-W / 2 + 0.03, y0 + H - 0.03], [W / 2 - 0.03, y0 + H - 0.03], [-W / 2 + 0.03, y0 + 0.01], [W / 2 - 0.03, y0 + 0.01]]) {
      if (v === 1) mb.box(x, y, WZ + 0.008, 0.02, 0.006, 0.004, tape);
      else mb.box(x, y - 0.01, WZ + 0.008, 0.07, 0.04, 0.003, 'paper', { color: 0xf0e8c0 });
    }
  },
});

defObj({
  key: 'plant_potted', name: 'Potted Plant', height: 0.95, block: 'low', foliage: true, movable: 6,
  sound: 'ceramic', flammable: 0.4, tags: T('office', 'home', 'plant', 'decor'),
  disassemble: { tools: [], time: 3, yields: [['glass_shard', 0, 1]] },
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.14, 0.3, 8, 'porcelain', { rTop: 0.17, color: 0xe8e4dc });
    mb.cylinder(0, 0.28, 0, 0.18, 0.04, 8, 'porcelain', { color: 0xd8d2c8 });
    mb.cylinder(0, 0.3, 0, 0.16, 0.012, 8, { top: 'p_soil', all: 'p_soil' }, { fit: true });
    mb.cross(0, 0.28, 0, 0.62, 0.66, 'p_leaves_a', { sway: 0.4 });
    mb.cross(0, 0.28, 0, 0.56, 0.6, 'p_leaves_a', { rot: Math.PI / 4, sway: 0.4 });
  },
});

defObj({
  key: 'plant_tall', name: 'Tall Plant', height: 1.85, block: 'solid', foliage: true, movable: 14,
  sound: 'wood', flammable: 0.5, tags: T('office', 'mall', 'plant', 'decor'),
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.19, 0.4, 8, 'p_wicker', { rTop: 0.23 });
    mb.cylinder(0, 0.4, 0, 0.24, 0.035, 8, 'p_wicker', { color: 0xc8b090 });
    mb.cylinder(0, 0.425, 0, 0.21, 0.012, 8, 'p_soil', { fit: true });
    for (const [rz, rx] of [[0.12, 0.05], [-0.1, -0.06], [0.02, 0.12]]) {
      mb.push().translate(0, 0.42, 0).rotateZ(rz).rotateX(rx);
      mb.cylinder(0, 0, 0, 0.02, 0.85, 4, 'wood_dark', { rTop: 0.012 }); mb.pop();
    }
    mb.cross(0, 0.62, 0, 0.9, 0.75, 'p_leaves_ficus', { sway: 0.5 });
    mb.cross(0, 0.98, 0, 0.85, 0.85, 'p_leaves_ficus', { rot: Math.PI / 4, sway: 0.7 });
    mb.cross(0.05, 1.25, -0.03, 0.6, 0.6, 'p_leaves_ficus', { rot: 0.3, sway: 0.9 });
  },
});

defObj({
  key: 'trash_can', name: 'Waste Basket', height: 0.4, block: 'low', movable: 2,
  container: { capacity: 8, kind: 'trash', loot: 'trash' }, sound: 'metal', flammable: 0.3,
  tags: T('office', 'home', 'trash'),
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.14, 0.36, 8, { sides: 'p_mesh', top: 'rubber_black', bottom: 'metal_dark' }, { rTop: 0.165 });
    mb.cylinder(0, 0.34, 0, 0.172, 0.035, 8, 'rubber_black', { caps: false });
    mb.cylinder(0, 0, 0, 0.15, 0.02, 8, 'metal_dark');
    mb.sphere(0.04, 0.37, 0.03, 0.05, 5, 3, 'paper');
    mb.sphere(-0.05, 0.36, -0.03, 0.045, 5, 3, 'paper', { color: 0xf0e8b0 });
    mb.sphere(0.0, 0.4, -0.06, 0.04, 5, 3, 'paper');
  },
});

defObj({
  key: 'recycle_bin', name: 'Recycling Bin', height: 0.78, block: 'low', movable: 6,
  container: { capacity: 18, kind: 'bin', loot: 'trash' }, sound: 'plastic', flammable: 0.3,
  tags: T('office', 'school', 'trash'),
  model: (mb) => {
    const zc = -0.1;
    mb.box(0, 0, zc, 0.4, 0.72, 0.4, 'plastic_blue');
    mb.box(0, 0.72, zc, 0.43, 0.05, 0.43, 'plastic_blue', { color: 0xc0d0e8 });
    mb.box(0, 0.77, zc - 0.02, 0.28, 0.006, 0.05, 'plastic_black');
    mb.box(0, 0.32, zc + 0.201, 0.24, 0.2, 0.004, 'p_recycle', { fit: true });
    mb.box(0, 0.66, zc + 0.205, 0.3, 0.025, 0.012, 'plastic_blue', { color: 0x9ab0d0 });
  },
});

defObj({
  key: 'conference_table', name: 'Conference Table', w: 3, d: 2, height: 0.78, block: 'table', surface: 0.75, movable: 0,
  sound: 'wood', flammable: 0.6,
  disassemble: { tools: ['#saw', '#hammer'], time: 40, skill: 'carpentry', yields: [['plank', 4, 7], ['nails', 4, 10], ['scrap_metal', 0, 2]] },
  tags: T('office', 'table'),
  model: (mb) => {
    const top = 0.75;
    mb.box(0, top - 0.04, 0, 1.6, 0.04, 1.22, 'wood_dark');
    mb.box(0, top - 0.039, 0, 1.6, 0.04, 1.22, { top: 'wood_dark', all: 'wood_trim' });
    for (const sx of [-1, 1]) {
      mb.cylinder(sx * 0.8, top - 0.041, 0, 0.61, 0.04, 14, { top: 'wood_dark', all: 'wood_trim' });
      mb.box(sx * 0.78, 0, 0, 0.36, 0.03, 0.75, 'metal_dark');
      mb.box(sx * 0.78, 0.03, 0, 0.18, top - 0.07, 0.5, 'wood_dark', { color: 0x9a8a7a });
    }
    // cable port & speakerphone
    mb.box(0, top, 0, 0.22, 0.008, 0.12, 'metal_brushed');
    mb.push().translate(0.1, top, -0.2).rotateY(0.4);
    mb.cylinder(0, 0, 0, 0.13, 0.04, 3, 'plastic_black', { rTop: 0.1 });
    mb.box(0, 0.04, 0, 0.05, 0.005, 0.03, 'led_green', { emissive: 0.8 });
    mb.pop();
    // water jug + glasses, a forgotten folder
    mb.cylinder(-0.55, top, 0.1, 0.06, 0.2, 8, 'glass', { rTop: 0.05, color: 0xd0e8f0 });
    mb.cylinder(-0.42, top, 0.18, 0.03, 0.1, 6, 'glass', { color: 0xe0f0f4 });
    mb.cylinder(-0.66, top, 0.24, 0.03, 0.1, 6, 'glass', { color: 0xe0f0f4 });
    mb.push().translate(0.85, top + 0.004, 0.25).rotateY(-0.2);
    mb.box(0, 0, 0, 0.24, 0.012, 0.32, 'cardboard', { color: 0xf0d080 }); mb.pop();
    papers(mb, 0.85, top + 0.016, 0.25, 2, 19);
  },
});

defObj({
  key: 'reception_desk', name: 'Reception Desk', w: 2, d: 1, height: 1.15, block: 'solid', surface: 1.12, movable: 0,
  container: { capacity: 20, kind: 'desk', loot: 'office_desk' }, sound: 'wood', flammable: 0.6,
  disassemble: { tools: ['#saw', '#hammer'], time: 35, skill: 'carpentry', yields: [['plank', 3, 6], ['nails', 4, 9]] },
  tags: T('office', 'desk', 'mall', 'hotel'),
  model: (mb) => {
    const zf = 0.38;
    mb.box(0, 0, zf - 0.03, 1.96, 1.08, 0.06, 'wood_light');
    mb.box(0, 0, zf + 0.0, 1.9, 0.08, 0.02, 'wood_dark');
    mb.box(0, 0.63, zf + 0.012, 1.96, 0.26, 0.03, 'wood_dark');
    mb.box(0, 0.66, zf + 0.03, 1.2, 0.2, 0.008, 'p_sign_reception', { fit: true });
    mb.box(0, 1.08, zf - 0.08, 2.0, 0.045, 0.28, 'wood_dark');
    for (const sx of [-1, 1]) mb.box(sx * 0.965, 0, -0.07, 0.07, 1.08, 0.82, 'wood_light');
    mb.box(0, 0.72, -0.08, 1.86, 0.03, 0.72, 'wood_light', { color: 0xe0d8c8 });
    // the bell, a visitor log and a dying plant
    mb.cylinder(-0.55, 1.125, zf - 0.07, 0.045, 0.012, 8, 'metal_dark');
    mb.sphere(-0.55, 1.137, zf - 0.07, 0.035, 6, 3, 'chrome', { sy: 0.8 });
    mb.box(0.3, 1.125, zf - 0.08, 0.28, 0.012, 0.2, { top: 'p_logbook', all: 'paper' }, { fit: { top: true } });
    mb.box(0.47, 1.13, zf - 0.04, 0.12, 0.006, 0.006, 'plastic_black');
    // receptionist side: monitor facing the empty chair
    mb.push().translate(-0.3, 0.75, -0.15).rotateY(Math.PI);
    crtMonitor(mb, 0, 0, 0, 0.9, 'p_crt_blue', 0.6);
    mb.pop();
    mb.box(0.55, 0.75, -0.2, 0.3, 0.06, 0.22, 'cardboard', { color: 0xc8b090 });
  },
});

defObj({
  key: 'waiting_chairs', name: 'Waiting Room Seats', w: 3, d: 1, height: 0.85, block: 'low', sit: true, movable: 0,
  sound: 'metal', flammable: 0.2,
  disassemble: { tools: ['#wrench', '#screwdriver'], time: 25, skill: 'mechanics', yields: [['scrap_metal', 3, 5], ['screws', 4, 8], ['pipe', 1, 2]] },
  tags: T('office', 'mall', 'hospital', 'chair', 'sit'),
  model: (mb) => {
    const zc = -0.05;
    mb.box(0, 0.3, zc - 0.05, 2.9, 0.06, 0.07, 'metal_brushed');
    for (const sx of [-1.25, 1.25]) {
      mb.box(sx, 0, zc - 0.05, 0.06, 0.3, 0.06, 'metal_brushed');
      mb.box(sx, 0, zc - 0.05, 0.06, 0.03, 0.55, 'metal_brushed');
    }
    const cols = [0xe08a4a, 0xe08a4a, 0x4a9aa0, 0xe08a4a];
    for (let i = 0; i < 4; i++) {
      const x = -1.05 + i * 0.7;
      const c = { color: cols[i] };
      mb.box(x, 0.36, zc - 0.05, 0.06, 0.06, 0.12, 'metal_dark');
      mb.box(x, 0.4, zc + 0.02, 0.5, 0.05, 0.44, 'plastic_white', c);
      mb.box(x, 0.43, zc + 0.24, 0.5, 0.02, 0.03, 'plastic_white', c);
      mb.push().translate(x, 0.47, zc - 0.21).rotateX(-0.18);
      mb.box(0, 0, 0, 0.5, 0.4, 0.04, 'plastic_white', c);
      mb.pop();
      if (i < 3) {
        mb.box(x + 0.35, 0.36, zc - 0.05, 0.04, 0.27, 0.05, 'metal_brushed');
        mb.box(x + 0.35, 0.63, zc + 0.0, 0.05, 0.03, 0.3, 'plastic_black');
      }
    }
    mb.push().translate(-0.35, 0.452, zc + 0.05).rotateY(0.3);
    mb.box(0, 0, 0, 0.21, 0.008, 0.28, { top: 'p_magazine', all: 'paper' }, { fit: { top: true } });
    mb.pop();
  },
});

function vending(mb: ModelBuilder, front: string, on: boolean, side: string, sideCol: number, body: string) {
  const W = 0.95, H = 1.83, D = 0.82, zc = WZ + D / 2 + 0.01, zf = zc + D / 2;
  mb.box(0, 0, zc, W - 0.04, 0.06, D - 0.06, 'metal_dark');
  mb.box(0, 0.06, zc - 0.02, W, H - 0.06, D - 0.04, { east: side, west: side, all: body }, { color: sideCol, fit: side.startsWith('p_') ? { east: true, west: true } : undefined });
  mb.box(0, 0.06, zf - 0.03, W - 0.04, H - 0.1, 0.04, { south: front, all: body }, { fit: { south: true }, emissive: on ? 0.55 : 0 });
  mb.box(0, H - 0.04, zc, W + 0.01, 0.04, D, body, { color: sideCol });
  mb.box(0.33, 0.95, zf + 0.012, 0.07, 0.06, 0.02, 'chrome');
  mb.box(-W / 2 + 0.02, 0.06, zf - 0.005, 0.03, H - 0.1, 0.03, body, { color: sideCol });
}

defObj({
  key: 'vending_snack', name: 'Snack Machine', height: 1.83, block: 'solid', movable: 0, power: true, hum: 'fridge',
  container: { capacity: 30, kind: 'vending', loot: 'vending_snack', lockable: true },
  light: { color: 0xe4ecff, intensity: 0.42, radius: 2.6, y: 1.2, kind: 'screen', power: true },
  sound: 'metal', flammable: 0.1,
  disassemble: { tools: ['#screwdriver', '#wrench'], time: 45, skill: 'electrical', yields: [['sheet_metal', 2, 4], ['scrap_metal', 3, 6], ['electronics_scrap', 1, 3], ['glass_shard', 1, 3], ['wire', 1, 3]] },
  tags: T('office', 'mall', 'school', 'vending'),
  variant: (s) => (scrOn(s) ? 'on' : 'off'),
  model: (mb, s) => vending(mb, 'p_vend_snack', scrOn(s), 'metal_dark', 0x6a6e78, 'metal_dark'),
});

defObj({
  key: 'vending_soda', name: 'Soda Machine', height: 1.83, block: 'solid', movable: 0, power: true, hum: 'fridge',
  container: { capacity: 30, kind: 'vending', loot: 'vending_soda', lockable: true, cooling: 'fridge' },
  light: { color: 0xffd4cc, intensity: 0.42, radius: 2.6, y: 1.2, kind: 'screen', power: true },
  sound: 'metal', flammable: 0.1,
  disassemble: { tools: ['#screwdriver', '#wrench'], time: 45, skill: 'electrical', yields: [['sheet_metal', 2, 4], ['scrap_metal', 3, 6], ['electronics_scrap', 1, 3], ['wire', 1, 3]] },
  tags: T('office', 'mall', 'school', 'vending'),
  variant: (s) => (scrOn(s) ? 'on' : 'off'),
  model: (mb, s) => vending(mb, 'p_vend_soda', scrOn(s), 'p_vend_soda_side', 0xffffff, 'plastic_red'),
});

defObj({
  key: 'security_desk', name: 'Security Desk', w: 2, d: 1, height: 1.12, block: 'solid', surface: 1.08, movable: 0,
  container: { capacity: 16, kind: 'desk', loot: 'security_office' }, sound: 'metal', flammable: 0.2,
  disassemble: { tools: ['#screwdriver', '#hammer'], time: 30, skill: 'mechanics', yields: [['sheet_metal', 2, 3], ['scrap_metal', 1, 3], ['screws', 3, 6]] },
  tags: T('office', 'mall', 'desk', 'security'),
  model: (mb) => {
    const zf = 0.38, st = { color: 0x8a94a8 };
    mb.box(0, 0.04, zf - 0.03, 1.94, 1.0, 0.06, 'p_steel', st);
    mb.box(0, 0, zf - 0.03, 1.9, 0.04, 0.05, 'metal_dark');
    mb.box(0, 0.78, zf + 0.002, 1.0, 0.22, 0.006, 'p_sign_security', { fit: true });
    mb.box(0, 1.04, zf - 0.07, 1.98, 0.04, 0.24, 'wood_dark');
    for (const sx of [-1, 1]) mb.box(sx * 0.95, 0, -0.07, 0.06, 1.04, 0.84, 'p_steel', st);
    mb.box(0, 0.72, -0.1, 1.84, 0.03, 0.66, 'wood_light', { color: 0xc8c0b0 });
    mb.box(0.6, 0.04, -0.12, 0.42, 0.68, 0.56, 'p_steel', st);
    const cells = frontGrid(mb, 0.41, 0.79, 0.08, 0.7, -0.12 + 0.28, [1], [1, 1.5], 'p_steel_drawer', { ...st, fit: { south: true } });
    void cells;
    // logbook, radio, lamp
    mb.box(-0.45, 1.08, zf - 0.07, 0.3, 0.014, 0.2, { top: 'p_logbook', all: 'paper' }, { fit: { top: true } });
    mb.box(0.55, 0.75, -0.25, 0.1, 0.2, 0.06, 'plastic_black');
    mb.box(0.57, 0.95, -0.25, 0.012, 0.12, 0.012, 'plastic_black');
    mb.box(0.53, 0.88, -0.219, 0.04, 0.04, 0.004, 'p_perf');
    mb.push().translate(-0.2, 0.75, -0.2).rotateY(Math.PI);
    crtMonitor(mb, 0, 0, 0, 0.75, 'p_cctv_0', 0.7, 'plastic_black', 0x5a5a5a);
    mb.pop();
    mb.cylinder(-0.75, 0.75, -0.3, 0.07, 0.02, 6, 'metal_dark');
    mb.box(-0.75, 0.77, -0.3, 0.015, 0.3, 0.015, 'metal_dark');
    mb.cylinder(-0.75, 1.0, -0.22, 0.07, 0.09, 6, 'metal_dark', { rTop: 0.04 });
    mug(mb, 0.15, 0.75, -0.15, 0x3a3a40);
  },
});

defObj({
  key: 'cctv_monitors', name: 'CCTV Monitor Bank', w: 2, d: 1, height: 1.78, block: 'solid', movable: 0, power: true, hum: 'computer',
  light: { color: 0xa8d4bc, intensity: 0.38, radius: 3.0, y: 1.2, kind: 'screen', power: true },
  sound: 'metal', flammable: 0.2,
  disassemble: { tools: ['#screwdriver'], time: 40, skill: 'electrical', yields: [['electronics_scrap', 3, 6], ['glass_shard', 2, 4], ['wire', 2, 4], ['scrap_metal', 2, 4]] },
  tags: T('office', 'mall', 'security', 'electronics'),
  variant: (s) => (scrOn(s) ? 'on' : 'off'),
  model: (mb, s) => {
    const on = scrOn(s), zc = WZ + 0.26;
    for (const sx of [-0.95, 0.95]) for (const sz of [-0.2, 0.2]) mb.box(sx, 0, zc + sz, 0.04, 1.75, 0.04, 'metal_dark');
    for (const y of [0.02, 0.62, 1.2]) mb.box(0, y, zc, 1.94, 0.03, 0.46, 'metal_grey');
    mb.box(0, 1.74, zc, 1.96, 0.04, 0.48, 'metal_grey');
    for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
      const x = -0.6 + c * 0.6, y = 0.65 + r * 0.58, i = r * 3 + c;
      mb.box(x, y, zc - 0.03, 0.5, 0.48, 0.36, 'plastic_black', { color: 0x9a9a98 });
      mb.box(x, y + 0.04, zc - 0.25, 0.36, 0.36, 0.12, 'plastic_black', { color: 0x8a8a88 });
      mb.box(x - 0.04, y + 0.06, zc + 0.152, 0.38, 0.33, 0.006, { south: 'p_cctv_' + i, all: 'glass_dark' }, { fit: { south: true }, emissive: on ? 0.75 : 0 });
      mb.box(x + 0.2, y + 0.06, zc + 0.152, 0.03, 0.02, 0.006, 'led_green', { emissive: on ? 1 : 0 });
    }
    // switcher console + cable bundle
    mb.box(0, 0.05, zc + 0.05, 0.9, 0.12, 0.34, 'plastic_black', { color: 0x7a7a78 });
    mb.box(0, 0.17, zc + 0.12, 0.8, 0.012, 0.16, 'p_perf');
    for (let i = 0; i < 4; i++) mb.box(-0.7 + i * 0.47, 0.05, zc - 0.22, 0.025, 1.6, 0.025, 'rubber_black');
  },
});

defObj({
  key: 'fire_extinguisher_wall', name: 'Fire Extinguisher', height: 1.45, block: 'none', onWall: true, movable: 9,
  sound: 'metal', flammable: 0, tags: T('office', 'school', 'mall', 'wall', 'safety'),
  disassemble: { tools: [], time: 3, yields: [['scrap_metal', 1, 1]] },
  model: (mb) => {
    const z = WZ + 0.1;
    mb.box(0, 1.27, WZ + 0.004, 0.24, 0.24, 0.008, 'p_sign_fire', { fit: true });
    mb.box(0, 0.62, WZ + 0.01, 0.08, 0.5, 0.02, 'metal_dark');
    mb.box(0, 0.86, WZ + 0.04, 0.06, 0.04, 0.06, 'metal_dark');
    mb.cylinder(0, 0.5, z, 0.075, 0.42, 8, 'plastic_red', { color: 0xffd0c8 });
    mb.cylinder(0, 0.92, z, 0.05, 0.03, 6, 'plastic_red');
    mb.box(0, 0.95, z, 0.05, 0.06, 0.05, 'plastic_black');
    mb.box(0.02, 1.0, z, 0.12, 0.015, 0.03, 'chrome');
    mb.box(0, 0.94, z + 0.03, 0.02, 0.02, 0.008, 'p_label');
    mb.box(-0.06, 0.66, z, 0.02, 0.32, 0.02, 'rubber_black');
    mb.box(-0.06, 0.62, z + 0.02, 0.03, 0.06, 0.03, 'plastic_black');
    mb.box(0, 0.62, z + 0.074, 0.09, 0.14, 0.004, 'p_label');
  },
});

defObj({
  key: 'exit_sign', name: 'Exit Sign', height: 2.45, block: 'none', onWall: true, movable: 1,
  light: { color: 0x48ff78, intensity: 0.22, radius: 2.4, y: 2.2, kind: 'emergency', power: false },
  sound: 'plastic', flammable: 0.2, tags: T('office', 'school', 'mall', 'hospital', 'wall', 'sign'),
  disassemble: { tools: ['#screwdriver'], time: 5, skill: 'electrical', yields: [['electronics_scrap', 1, 1], ['wire', 0, 1]] },
  model: (mb) => {
    mb.box(0, 2.18, WZ + 0.035, 0.6, 0.27, 0.07, { south: 'p_exit', all: 'plastic_white' }, { fit: { south: true }, emissive: 0.9 });
    mb.box(0, 2.18, WZ + 0.035, 0.62, 0.27, 0.06, 'plastic_white', { color: 0xe8e8e0 });
    mb.box(0, 2.45, WZ + 0.02, 0.1, 0.06, 0.04, 'plastic_white');
  },
});

defObj({
  key: 'light_switch', name: 'Light Switch', height: 1.3, block: 'none', onWall: true,
  sound: 'plastic', flammable: 0, tags: T('switch', 'wall', 'electric'),
  variant: (s) => (s.on === false ? 'off' : 'on'),
  model: (mb, s) => {
    mb.box(0.35, 1.1, WZ + 0.004, 0.08, 0.12, 0.008, 'p_switch', { fit: true });
    mb.push().translate(0.35, 1.16, WZ + 0.012).rotateX(s.on === false ? 0.5 : -0.5);
    mb.box(0, -0.015, 0.008, 0.018, 0.03, 0.016, 'plastic_white', { color: 0xe8e0cc });
    mb.pop();
  },
});

defObj({
  key: 'breaker_panel', name: 'Breaker Panel', height: 1.8, block: 'none', onWall: true,
  sound: 'metal', flammable: 0, tags: T('breaker', 'wall', 'electric', 'utility'),
  disassemble: { tools: ['#screwdriver'], time: 25, skill: 'electrical', yields: [['wire', 2, 5], ['electronics_scrap', 1, 3], ['sheet_metal', 1, 1]] },
  model: (mb) => {
    const W = 0.42, H = 0.62, y0 = 1.08;
    mb.box(0, y0, WZ + 0.05, W, H, 0.1, { south: 'p_breaker', all: 'metal_grey' }, { fit: { south: true } });
    mb.box(0, y0 + H, WZ + 0.05, W + 0.02, 0.015, 0.1, 'metal_grey');
    mb.cylinder(0.1, y0 + H, WZ + 0.05, 0.022, 2.7 - y0 - H, 6, 'metal_brushed');
    mb.cylinder(-0.1, y0 + H, WZ + 0.05, 0.016, 2.7 - y0 - H, 6, 'metal_brushed');
    // door swung open ~110° on the left hinge
    mb.push().translate(-W / 2, y0, WZ + 0.1).rotateY(-1.95);
    mb.box(W / 2, 0, 0.006, W, H, 0.012, { north: 'p_breaker_door', south: 'metal_grey', all: 'metal_grey' }, { fit: { north: true } });
    mb.box(W - 0.03, H / 2 - 0.04, 0.02, 0.02, 0.08, 0.02, 'metal_dark');
    mb.pop();
  },
});

defObj({
  key: 'fuse_box', name: 'Fuse Box', height: 1.8, block: 'none', onWall: true,
  sound: 'metal', flammable: 0.1, tags: T('fusebox', 'wall', 'electric', 'utility'),
  disassemble: { tools: ['#screwdriver'], time: 15, skill: 'electrical', yields: [['wire', 1, 3], ['electronics_scrap', 0, 2], ['scrap_metal', 1, 1]] },
  model: (mb) => {
    const y0 = 1.25;
    mb.box(0, y0 - 0.02, WZ + 0.004, 0.42, 0.5, 0.012, 'wood_dark');
    mb.box(0, y0, WZ + 0.07, 0.31, 0.41, 0.12, { south: 'p_fusebox', all: 'metal_dark' }, { fit: { south: true }, color: 0xffffff });
    mb.box(0.19, y0 + 0.12, WZ + 0.08, 0.04, 0.16, 0.06, 'metal_dark');
    mb.push().translate(0.22, y0 + 0.2, WZ + 0.08).rotateZ(0.6);
    mb.box(0.05, -0.01, 0, 0.12, 0.024, 0.024, 'plastic_red'); mb.pop();
    mb.cylinder(-0.05, y0 + 0.41, WZ + 0.06, 0.018, 2.7 - y0 - 0.41, 6, 'metal_brushed');
  },
});

// textures used above that are small enough to live with the models
addTextureModule(() => {
  const A = atlas();
  A.add('p_book_tops', 32, 7, (pc) => {
    for (let x = 0; x < 32; x++) {
      const k = Math.floor(ph(Math.floor(x / 2.5), 1, 51) * 7);
      for (let y = 0; y < 7; y++) pc.set(x, y, y >= 1 && y <= 5 && x % 3 !== 0 ? [0xd8d0b8, 0xe4dcc4, 0xc8bea4][k % 3] : [0x6a2a2a, 0x2a3a5a, 0x3a4a2a, 0x5a4a2a, 0x3a3a3a, 0x7a6a4a, 0x4a2a4a][k]);
    }
  });
  A.add('p_binder', 3, 9, (pc) => {
    pc.wrap = false;
    pc.fill(0xb4b4b4); pc.vline(0, 0, 8, 0xd4d4d4); pc.vline(2, 0, 8, 0x8a8a8a);
    pc.rect(0, 2, 3, 3, 0xf0ece0); pc.set(1, 3, 0x6a6a7a); pc.set(1, 7, 0x6a6a6a);
  });
  A.add('p_magazine', 7, 9, (pc) => {
    pc.wrap = false;
    fillR(pc, 0, 0, 7, 9, [0x5a8ab8, 0x8ab4d8, 0xd8e8f0], (x, y) => 1 - y / 9, 1);
    pc.hline(0, 6, 0, 0xc83a3a); pc.hline(1, 5, 1, 0xf0f0f0);
    pc.ellipse(3.5, 5.5, 1.6, 2.4, 0xd8b090); pc.rect(2, 3, 3, 1, 0x3a2a1a);
    pc.rect(1, 7, 5, 2, 0x2a3a5a);
  });
});

void Rng; void scaleHex; void mixHex; void plate; void tileFbm;
