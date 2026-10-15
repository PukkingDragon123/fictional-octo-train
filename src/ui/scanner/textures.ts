// Pixel-art textures for the SEER-9 handheld scanner.
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { makeRamp, ph, PixelCanvas } from '../../gfx/pixel';
import { tileFbm, Rng } from '../../core/rng';

function scratches(pc: PixelCanvas, rng: Rng, n: number, c: number) {
  for (let i = 0; i < n; i++) {
    const x = rng.int(0, pc.w - 1), y = rng.int(0, pc.h - 1), len = rng.int(3, 9), dx = rng.chance(0.5) ? 1 : -1;
    for (let k = 0; k < len; k++) pc.blend(x + k * dx, y + Math.floor(k * 0.4), c, 0.6);
  }
}

addTextureModule(() => {
  const A = atlas();
  // worn olive-drab enamel over aluminium: chipped edges show bare metal
  A.add('c_scanner_case', 32, 32, (pc, rng) => {
    const R = makeRamp(0x55603e, 7, { hueShift: 0.03, spread: 0.45 });
    pc.fillRamp(R, (x, y) => 0.52 + (tileFbm(x, y, 32, 32, 3, 3, 2) - 0.5) * 0.2 + (ph(x, y, 1) - 0.5) * 0.05, 0.6);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const n = tileFbm(x, y, 32, 32, 4, 2, 9);
      if (n > 0.68) pc.set(x, y, n > 0.74 ? 0xb8b6a8 : 0x8a8a7c); // paint chips -> aluminium
    }
    scratches(pc, rng, 10, 0xa6a28c);
    pc.grime(0x2a2a1c, 0.6, 3, 4, 0.6);
  });
  // close-up surfaces: the device fills a third of the screen, so these are
  // painted at ~450 px/m and mapped once per face ("fit")
  const enamel = (pc: PixelCanvas, rng: Rng, chipEdges: boolean) => {
    const R = makeRamp(0x4f5a3a, 7, { hueShift: 0.03, spread: 0.42 });
    pc.fillRamp(R, (x, y) => 0.5 + (tileFbm(x, y, pc.w, pc.h, 5, 4, 3) - 0.5) * 0.16 + (ph(x, y, 5) - 0.5) * 0.05, 0.5);
    // orange-peel speckle of the paint
    for (let i = 0; i < pc.w * pc.h * 0.03; i++) pc.blend(rng.int(0, pc.w - 1), rng.int(0, pc.h - 1), rng.chance(0.5) ? R[5] : R[2], 0.35);
    if (chipEdges) {
      for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) {
        const e = Math.min(x, y, pc.w - 1 - x, pc.h - 1 - y);
        const n = tileFbm(x, y, pc.w, pc.h, 9, 2, 11);
        if (e < 3 && n > 0.55 - e * 0.05) pc.set(x, y, n > 0.66 ? 0xc4c2b4 : 0x8e8c80); // worn to aluminium
        else if (e === 0) pc.blend(x, y, R[1], 0.6);
      }
      for (let i = 0; i < 7; i++) { // chips in the field
        const cx = rng.int(4, pc.w - 5), cy = rng.int(4, pc.h - 5), r = rng.float(0.8, 2.2);
        for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) if (x * x + y * y < r * r * (0.6 + rng.next() * 0.6)) pc.set(cx + x, cy + y, 0x9a988a);
      }
    }
    scratches(pc, rng, Math.floor(pc.w * pc.h / 260), 0x7a8064);
    pc.grime(0x262a18, 0.5, 4, 5, 0.6);
  };
  A.add('c_scanner_front', 128, 100, (pc, rng) => {
    pc.wrap = false;
    enamel(pc, rng, true);
    // panel seam and stencilled maker line along the bottom
    pc.hline(6, 121, 90, 0x343a26); pc.hline(6, 121, 91, 0x6a7450);
    for (const [rx, ry] of [[4, 4], [123, 4], [4, 95], [123, 95]]) { pc.set(rx, ry, 0x2a2a22); pc.set(rx + 1, ry, 0x9a9a90); }
  });
  A.add('c_scanner_side', 64, 18, (pc, rng) => { pc.wrap = false; enamel(pc, rng, true); for (let x = 2; x < 62; x += 3) pc.set(x, 9, 0x2e3422); });
  A.add('c_scanner_back', 96, 76, (pc, rng) => {
    pc.wrap = false; enamel(pc, rng, false);
    pc.strokeRect(30, 22, 36, 30, 0x2e3422); pc.rect(31, 23, 34, 28, 0x56603c); // battery door
    pc.rect(40, 28, 16, 6, 0xcfc7a8); pc.hline(41, 54, 31, 0x2a2618);
  });
  // screen surround: moulded black rubber with a stepped lip into the tube, moulded tick marks and screws
  A.add('c_scanner_bezel', 72, 56, (pc) => {
    pc.wrap = false;
    const R = makeRamp(0x22201c, 6, { spread: 0.34 });
    pc.fillRamp(R, (x, y) => 0.46 + ((x * 3 + y) % 7 === 0 ? 0.06 : 0) + (ph(x >> 1, y >> 1, 4) - 0.5) * 0.08 - y / 56 * 0.08, 0.5);
    pc.strokeRect(0, 0, 72, 56, 0x0c0b0a);
    pc.hline(1, 70, 1, R[5]); pc.vline(1, 1, 54, R[4]); pc.hline(1, 70, 54, R[1]); pc.vline(70, 1, 54, R[1]);
    // stepped lip around the glass opening (the glass sits inside ~x 5..66, y 5..50)
    for (let i = 0; i < 3; i++) {
      const c = i === 0 ? R[0] : i === 1 ? 0x080706 : R[1];
      pc.strokeRect(4 - i, 4 - i, 64 + i * 2, 48 + i * 2, c);
    }
    pc.hline(3, 68, 53 - 1, R[4]); pc.vline(68, 3, 52, R[3]);
    // moulded ticks along the bottom
    for (let x = 10; x < 62; x += 4) pc.set(x, 54, R[4]);
    // corner screws
    for (const [sx, sy] of [[2, 2], [68, 2], [2, 52], [68, 52]]) { pc.set(sx, sy, 0x8a8a80); pc.set(sx + 1, sy, 0x4a4a44); pc.set(sx, sy + 1, 0x4a4a44); }
  });
  A.add('c_scanner_rubber', 16, 16, (pc) => {
    const R = makeRamp(0x2a2826, 5, { spread: 0.3 });
    pc.fillRamp(R, (x, y) => 0.5 + ((x + y) % 4 === 0 ? 0.15 : 0) + (ph(x, y, 3) - 0.5) * 0.1, 0.5);
  });
  A.add('c_scanner_knob', 48, 8, (pc) => {
    const R = makeRamp(0x5a5a56, 6);
    pc.fillRamp(R, (x, y) => (x % 3 === 0 ? 0.25 : x % 3 === 1 ? 0.75 : 0.55) - y * 0.02, 0);
  });
  A.add('c_scanner_knobtop', 40, 40, (pc) => {
    pc.wrap = false;
    const R = makeRamp(0x6e6e68, 7, { spread: 0.5 });
    pc.fillRamp(R, (x, y) => { const d = Math.hypot(x - 19.5, y - 19.5); return d > 18 ? 0.15 : d > 16 ? 0.35 : 0.62 - d * 0.012 + ((Math.atan2(y - 19.5, x - 19.5) * 6) % 1 < 0.5 ? 0.04 : 0); }, 0.4);
    pc.circle(19.5, 19.5, 7, R[2]); pc.circle(19.5, 19.5, 5.5, R[4]);
    for (let y = 3; y < 14; y++) { pc.set(19, y, 0xf2b33d); pc.set(20, y, 0xf2b33d); } // pointer
    for (let a = 0; a < 12; a++) { const t = a / 12 * Math.PI * 2; pc.set(Math.round(19.5 + Math.cos(t) * 17), Math.round(19.5 + Math.sin(t) * 17), R[6]); }
  });
  A.add('c_scanner_grille', 16, 16, (pc) => {
    pc.fill(0x3a3a2e);
    for (let y = 1; y < 16; y += 3) for (let x = 1; x < 16; x += 3) { pc.set(x, y, 0x0c0c08); pc.set(x + 1, y, 0x0c0c08); pc.set(x, y + 1, 0x14140e); }
  });
  A.add('c_scanner_label', 48, 12, (pc) => {
    pc.wrap = false;
    pc.fill(0xcfc7a8);
    pc.strokeRect(0, 0, 48, 12, 0x2a2618);
    // "SEER-9" in tiny pixel letters (3x5)
    const glyph: Record<string, string> = { S: '111100111001111', E: '111100110100111', R: '110101110101101', '-': '000000111000000', '9': '111101111001111', M: '101111101101101', F: '111100110100100', I: '111010010010111' };
    let x = 3;
    for (const ch of 'SEER-9') { const g = glyph[ch]; for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (g[j * 3 + i] === '1') pc.set(x + i, 3 + j, 0x1a1608); x += 4; }
    pc.rect(28, 3, 17, 5, 0x8c1d14);
    pc.hline(29, 43, 5, 0xe9dfc3);
  });
  A.add('c_scanner_plate', 32, 8, (pc) => {
    pc.wrap = false;
    pc.fill(0x9a9a88);
    for (let x = 2; x < 30; x += 2) pc.set(x, 4, 0x5a5a4c);
    pc.set(1, 1, 0x3a3a30); pc.set(30, 1, 0x3a3a30); pc.set(1, 6, 0x3a3a30); pc.set(30, 6, 0x3a3a30);
  });
  // button caps with stencilled icons
  const icons: Record<string, string[]> = {
    stat: ['..#..', '.###.', '..#..', '.#.#.', '#...#'],
    scan: ['.###.', '#...#', '#.#.#', '#...#', '.###.'],
    sig: ['#...#', '.#.#.', '..#..', '..#..', '..#..'],
    map: ['##.##', '#.#.#', '##.##', '#.#.#', '##.##'],
    log: ['#####', '#....', '####.', '#....', '#####'],
    data: ['.###.', '#...#', '#####', '#...#', '.###.'],
  };
  for (const [k, ic] of Object.entries(icons)) {
    A.add('c_btn_' + k, 12, 8, (pc) => {
      pc.wrap = false;
      const R = makeRamp(0x34342c, 5, { spread: 0.4 });
      pc.fillRamp(R, (x, y) => 0.55 - y * 0.03, 0.4);
      pc.hline(0, 11, 0, R[4]); pc.hline(0, 11, 7, R[0]);
      for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) if (ic[j][i] === '#') pc.set(4 + i, 1 + j, 0xd8d0b0);
    });
  }
  A.add('c_led_green', 4, 4, (pc) => { pc.fill(0x6aff5a); pc.set(1, 1, 0xe0ffd0); });
  A.add('c_led_red', 4, 4, (pc) => { pc.fill(0xff3a2a); pc.set(1, 1, 0xffd0c0); });
  A.add('c_led_amber', 4, 4, (pc) => { pc.fill(0xffb030); pc.set(1, 1, 0xfff0c0); });
  A.add('c_led_off', 4, 4, (pc) => { pc.fill(0x1c1a14); pc.set(1, 1, 0x3a362a); });
  A.add('c_screen_glass', 8, 8, (pc) => { pc.fill(0x0a140c); });
});
