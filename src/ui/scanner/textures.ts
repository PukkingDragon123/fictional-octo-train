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
  A.add('c_scanner_rubber', 16, 16, (pc) => {
    const R = makeRamp(0x2a2826, 5, { spread: 0.3 });
    pc.fillRamp(R, (x, y) => 0.5 + ((x + y) % 4 === 0 ? 0.15 : 0) + (ph(x, y, 3) - 0.5) * 0.1, 0.5);
  });
  A.add('c_scanner_knob', 16, 16, (pc) => {
    const R = makeRamp(0x6a6a66, 6);
    pc.fillRamp(R, (x) => (x % 2 === 0 ? 0.7 : 0.35), 0);
  });
  A.add('c_scanner_knobtop', 16, 16, (pc) => {
    pc.wrap = false;
    const R = makeRamp(0x7a7a74, 6);
    pc.fillRamp(R, (x, y) => 0.65 - Math.hypot(x - 7.5, y - 7.5) * 0.03, 0.6);
    pc.vline(7, 1, 6, 0xf2b33d); pc.vline(8, 1, 6, 0xf2b33d); // pointer
    pc.circle(7.5, 7.5, 7.6, R[1]);
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
