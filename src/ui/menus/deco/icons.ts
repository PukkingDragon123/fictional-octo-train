// The little pixel-art keys that float in the menu's corner: the BLUEPRINT
// (a rolled-out plan with a pencil: enter build mode), the COMMISSARY (a tiny
// vending machine: the collectibles shop) and the GUIDE (a speech cloud; a
// red slash when muted). Each is drawn once at 24x24 art pixels into a
// three-frame sheet (rest, hot, pressed), black one-pixel outline, and shown
// at a whole number of device pixels per art pixel (crisp, no circles).
import { PixelCanvas, makeRamp } from '../../../gfx/pixel';

const N = 24;
const K = 0x0a0806;

function sheet(draw: (pc: PixelCanvas, hot: boolean) => void): string {
  const pc = new PixelCanvas(N, N * 3);
  pc.wrap = false;
  for (let f = 0; f < 3; f++) {
    const fr = new PixelCanvas(N, N);
    fr.wrap = false;
    draw(fr, f === 1);
    outline(fr);
    // pressed: one pixel down, a touch darker
    const dy = f === 2 ? 1 : 0;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const a = fr.alpha(x, y);
      if (!a || y + dy >= N) continue;
      let c = fr.get(x, y);
      if (f === 2) c = ((((c >> 16) & 255) * 0.82) << 16) | ((((c >> 8) & 255) * 0.82) << 8) | ((c & 255) * 0.82);
      pc.set(x, f * N + y + dy, c, a);
    }
  }
  const cv = document.createElement('canvas');
  cv.width = N; cv.height = N * 3;
  cv.getContext('2d')!.putImageData(pc.toImageData(), 0, 0);
  return cv.toDataURL();
}
/** a black line round every opaque shape, then a soft drop pixel under it */
function outline(pc: PixelCanvas) {
  const W = pc.w, H = pc.h, solid = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) solid[y * W + x] = pc.alpha(x, y) > 0 ? 1 : 0;
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && solid[y * W + x] === 1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (solid[y * W + x]) continue;
    if (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) pc.set(x, y, K);
    else if (at(x - 1, y - 1) || at(x - 1, y - 2)) pc.set(x, y, 0x000000, 90);
  }
}

// ------------------------------------------------------------------ the blueprint
export function blueprintSheet(): string {
  return sheet((pc, hot) => {
    const B = makeRamp(hot ? 0x2f6cc0 : 0x245aa8, 6, { spread: 0.55, hueShift: 0.03 });
    // the sheet (dog-eared top right corner)
    for (let y = 3; y <= 18; y++) for (let x = 7; x <= 21; x++) {
      if (x - 17 > y - 3) continue; // the folded corner
      const v = 0.5 + (x + y) * 0.004 - (y > 15 ? 0.08 : 0);
      pc.set(x, y, B[Math.round(v * 5) - ((x * 7 + y * 13) % 11 === 0 ? 1 : 0)]);
    }
    // the grid
    for (let y = 4; y <= 18; y++) for (let x = 8; x <= 21; x++) if (pc.alpha(x, y) && ((x - 8) % 3 === 0 || (y - 4) % 3 === 0)) pc.set(x, y, B[4]);
    // the plan: rooms, a door gap, a wall stub
    const W = hot ? 0xffffff : 0xe6f0ff;
    pc.hline(9, 18, 6, W); pc.vline(9, 6, 16, W); pc.hline(9, 19, 16, W); pc.vline(19, 9, 16, W);
    pc.vline(14, 6, 11, W); pc.hline(14, 16, 11, W);
    pc.set(11, 16, B[3]); pc.set(12, 16, B[3]);
    pc.set(16, 13, W); pc.set(17, 13, W); pc.set(16, 14, W);
    // the folded corner's back
    for (let y = 3; y <= 6; y++) for (let x = 18; x <= 21; x++) if (x - 17 <= y - 3 + 1 && x - 17 >= y - 3) pc.set(x, y, B[5]);
    pc.set(18, 4, B[2]); pc.set(19, 5, B[2]); pc.set(20, 6, B[2]);
    // the roll on the left: a shaded cylinder with its spiral end
    const R = [0x0e2a58, 0x1a4488, 0x2a62b0, 0x5a8ed0, 0x9ac0ee, 0x3a72bc];
    for (let y = 4; y <= 20; y++) for (let x = 2; x <= 7; x++) pc.set(x, y, R[x - 2]);
    for (let x = 2; x <= 7; x++) { pc.set(x, 3, B[5]); pc.set(x, 21, R[0]); }
    pc.set(4, 3, 0xd8e8ff); pc.set(5, 3, 0xd8e8ff); pc.set(4, 2, B[5]); pc.set(5, 2, B[4]);
    for (let y = 6; y <= 19; y += 4) pc.set(6, y, R[2]);
    // the pencil, across the corner
    for (let i = 0; i < 10; i++) {
      const x = 12 + i, y = 22 - i;
      pc.set(x, y, 0xe8b020); pc.set(x + 1, y, 0xf8d050); pc.set(x, y - 1, 0xb07a10);
    }
    pc.set(11, 22, 0xe8c890); pc.set(10, 23, 0x303030); pc.set(11, 23, 0xc8a870); pc.set(12, 23, 0xe8c890);
    pc.set(22, 12, 0xb0b0b0); pc.set(21, 12, 0xd8d8d8); pc.set(22, 11, 0xe07a7a); pc.set(23, 11, 0xc05a5a); pc.set(22, 10, 0xe07a7a);
    if (hot) { pc.set(20, 1, 0xffffff); pc.set(19, 1, 0x9ad0ff); pc.set(21, 1, 0x9ad0ff); pc.set(20, 0, 0x9ad0ff); pc.set(20, 2, 0x9ad0ff); }
  });
}

// ------------------------------------------------------------------ the commissary (a tiny vending machine)
export function shopSheet(): string {
  return sheet((pc, hot) => {
    const O = makeRamp(0x8a2a1c, 6, { spread: 0.6, hueShift: 0.02 });
    for (let y = 2; y <= 22; y++) for (let x = 4; x <= 19; x++) pc.set(x, y, O[x < 6 ? 4 : x > 17 ? 1 : y < 4 ? 4 : 2 + ((x * 3 + y * 5) % 9 === 0 ? 1 : 0)]);
    // the lit marquee
    for (let x = 6; x <= 17; x++) { pc.set(x, 3, hot ? 0xfff0c0 : 0xf0d890); pc.set(x, 4, hot ? 0xffe0a0 : 0xd8b870); }
    for (const x of [8, 10, 11, 13, 15]) pc.set(x, 4, 0x6a3a10);
    // the glass and the rows of goods
    for (let y = 6; y <= 15; y++) for (let x = 6; x <= 14; x++) pc.set(x, y, 0x101820);
    const goods = [0xe2b21e, 0x6ad0c0, 0xd8402a, 0xe8e0d0, 0x8a5a30, 0x6a8ad0];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) { const g = goods[(r * 3 + c) % goods.length]; pc.set(7 + c * 3, 7 + r * 3, g); pc.set(8 + c * 3, 7 + r * 3, g); pc.set(7 + c * 3, 8 + r * 3, g); }
      pc.hline(6, 14, 9 + r * 3, 0x5a6066);
    }
    pc.set(7, 6, 0x9ab0c0); pc.set(6, 7, 0x9ab0c0); pc.set(13, 14, 0x3a4a58);
    // the keypad and the coin slot
    for (let y = 7; y <= 12; y += 2) for (let x = 16; x <= 17; x++) pc.set(x, y, 0xd8d0b8);
    pc.vline(17, 14, 15, K); pc.set(16, 14, O[5]);
    // the delivery flap
    for (let x = 6; x <= 17; x++) { pc.set(x, 18, K); pc.set(x, 19, 0x2a2622); pc.set(x, 20, 0x3a3630); }
    pc.hline(6, 17, 21, O[1]);
    if (hot) { pc.set(2, 3, 0xfff0c0); pc.set(21, 2, 0xfff0c0); }
  });
}

// ------------------------------------------------------------------ the guide (speech cloud)
export function guideSheet(muted: boolean): string {
  return sheet((pc, hot) => {
    const F = hot ? 0xfffaf0 : 0xf2ead8, S = 0xc8c0b0;
    // a lumpy cloud body with a tail (no circles: hand-cut steps)
    const rows: [number, number][] = [[7, 16], [5, 18], [4, 19], [3, 20], [3, 20], [3, 20], [3, 20], [3, 20], [4, 19], [5, 18], [7, 15]];
    rows.forEach(([a, b], i) => { for (let x = a; x <= b; x++) pc.set(x, 4 + i, i >= rows.length - 2 ? S : F); });
    for (let x = 9; x <= 13; x++) pc.set(x, 3, F);
    pc.set(7, 15, F); pc.set(6, 16, F); pc.set(7, 16, S); pc.set(5, 17, S);
    // three dots, or the slash
    if (!muted) for (const x of [7, 11, 15]) { pc.set(x, 9, 0x2a2018); pc.set(x + 1, 9, 0x2a2018); pc.set(x, 10, 0x2a2018); pc.set(x + 1, 10, 0x4a3a2a); }
    else {
      for (const x of [7, 11, 15]) { pc.set(x, 9, 0x8a8070); pc.set(x + 1, 9, 0x8a8070); }
      for (let i = 0; i < 18; i++) { pc.set(3 + i, 18 - i, 0xd02818); pc.set(4 + i, 18 - i, 0xa01808); }
    }
  });
}
