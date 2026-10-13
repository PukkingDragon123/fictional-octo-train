// Furniture A — supermarket & retail store fixtures.
import { defObj } from '../../world/objects';
import {
  atlas, addTextureModule, PixelCanvas, makeRamp, mixHex, scaleHex, ph, tileFbm, Rng, WZ,
  txt, txtC, scribble, fillR, border, caster, hbar, knob,
} from './a_lib';
import type { ModelBuilder } from './a_lib';

const T = (...t: string[]) => ['setA', ...t];
const on = (s: any) => !(s.on === false || s.broken || s.unpowered);

// ============================================================ product rows
// Every row texture is 32x10 px (1 m x 0.31 m), bottom-aligned, tiling horizontally.
type RowFn = (pc: PixelCanvas, rng: Rng) => void;
function rowBase(pc: PixelCanvas) { pc.rect(0, 0, pc.w, pc.h, 0x24262a); for (let x = 0; x < pc.w; x++) pc.set(x, 0, 0x1a1c1e); }
function shade3(c: number) { return [scaleHex(c, 0.72), c, mixHex(c, 0xffffff, 0.35)]; }

const ROWS: Record<string, RowFn> = {
  cans: (pc) => {
    rowBase(pc);
    const labels = [[0xc83a2a, 0xf0ece0], [0x3a8a3a, 0xe8d860], [0xe0a030, 0x6a3a1a], [0x2a5aa8, 0xf0f0f0], [0xd8d0b8, 0xc03030]];
    for (let x = 0, k = 0; x < 32; x += 4, k++) {
      const l = labels[Math.floor(ph(k >> 1, 3, 7) * labels.length)];
      for (const top of [5]) {
        for (let i = 0; i < 3; i++) for (let y = top; y < 10; y++) {
          let c = y === top ? 0xc8ccd0 : y === 9 ? 0x8a8e92 : y === top + 2 || y === top + 3 ? l[1] : l[0];
          if (i === 0) c = mixHex(c, 0xffffff, 0.25); if (i === 2) c = scaleHex(c, 0.75);
          pc.set(x + i, y, c);
        }
      }
      // stacked second tier on some
      if (ph(k, 1, 5) < 0.6) for (let i = 0; i < 3; i++) for (let y = 1; y < 5; y++) pc.set(x + i, y, y === 1 ? 0xc8ccd0 : y === 3 ? l[1] : (i === 2 ? scaleHex(l[0], 0.75) : l[0]));
    }
  },
  boxes: (pc) => {
    rowBase(pc);
    const cols = [0xe8c030, 0xc83a3a, 0x3a6ab0, 0xf0f0e8, 0x7ab040, 0xe07a30, 0x8a4ab0];
    let x = 0, k = 0;
    while (x < 32) {
      const w = 4 + Math.floor(ph(k, 2, 3) * 3), h = 6 + Math.floor(ph(k, 2, 5) * 4);
      const c = cols[Math.floor(ph(k, 2, 9) * cols.length)], S = shade3(c);
      for (let i = 0; i < w && x + i < 32; i++) for (let y = 10 - h; y < 10; y++) {
        let cc = i === 0 ? S[2] : i === w - 1 ? S[0] : S[1];
        if (y === 10 - h + 1 && i > 0 && i < w - 1) cc = 0xf8f4ec;
        if (y === 10 - h + 3 && i === 1) cc = mixHex(c, 0x000000, 0.4);
        pc.set(x + i, y, cc);
      }
      pc.set(x + Math.floor(w / 2), 10 - Math.floor(h / 2), 0xffffff);
      x += w; k++;
    }
  },
  bottles: (pc) => {
    rowBase(pc);
    const cols = [0x9ad0e8, 0x4a2414, 0xe07a20, 0x5ab040, 0xd04040, 0xe8e8f0];
    for (let x = 0, k = 0; x < 32; x += 3, k++) {
      const c = cols[Math.floor(ph(k >> 1, 4, 3) * cols.length)], S = shade3(c);
      for (let y = 2; y < 10; y++) for (let i = 0; i < 2; i++) {
        let cc = y < 4 ? (i === 0 ? S[1] : S[0]) : i === 0 ? S[2] : S[1];
        if (y === 6 || y === 7) cc = 0xf0ece0;
        if (y === 2) cc = [0xd02020, 0xf0f0f0, 0x2a5ab0][k % 3];
        if (y === 3 && i === 1) continue;
        pc.set(x + i, y, cc);
      }
    }
  },
  jars: (pc) => {
    rowBase(pc);
    const cols = [0xb83020, 0x6a8a30, 0xc89048, 0xe0c060, 0x6a2a4a];
    for (let x = 0, k = 0; x < 32; x += 4, k++) {
      const c = cols[Math.floor(ph(k, 6, 3) * cols.length)], S = shade3(c);
      for (let i = 0; i < 3; i++) for (let y = 4; y < 10; y++) pc.set(x + i, y, y === 4 ? 0xd8b850 : y === 6 || y === 7 ? 0xf0ead8 : i === 0 ? S[2] : S[1]);
      pc.set(x + 1, 3, 0xc8a840);
    }
  },
  snacks: (pc) => {
    rowBase(pc);
    const cols = [0xe8c030, 0xd03a2a, 0x3a7ad0, 0x40a050, 0xe07a30, 0xa040a0];
    for (let x = -1, k = 0; x < 32; x += 5, k++) {
      const c = cols[Math.floor(ph(k, 7, 3) * cols.length)], S = shade3(c);
      for (let i = 0; i < 5; i++) for (let y = 3; y < 10; y++) {
        const edge = (y === 3 || y === 9) && (i === 0 || i === 4);
        if (edge) continue;
        let cc = y === 3 ? S[2] : i === 4 ? S[0] : S[1];
        if (y === 5 && i > 0 && i < 4) cc = 0xf8f0e0;
        if (y === 7 && i === 2) cc = 0xf0d050;
        pc.set(x + i, y, cc);
      }
    }
  },
  household: (pc) => {
    rowBase(pc);
    const cols = [0xf07a20, 0x3a8ad8, 0xe8e8f0, 0x50b050, 0xd8406a];
    let x = 0, k = 0;
    while (x < 32) {
      if (ph(k, 8, 3) < 0.35) { // paper towels
        for (let i = 0; i < 3; i++) for (let y = 2; y < 10; y++) pc.set(x + i, y, y === 2 ? 0xffffff : i === 2 ? 0xc8c8c0 : 0xf4f4ec);
        pc.hline(x, x + 2, 6, 0x5a8ad8); x += 3;
      } else { // detergent jug
        const c = cols[Math.floor(ph(k, 8, 5) * cols.length)], S = shade3(c);
        for (let i = 0; i < 4; i++) for (let y = 3; y < 10; y++) pc.set(x + i, y, i === 0 ? S[2] : i === 3 ? S[0] : S[1]);
        pc.set(x + 3, 2, S[1]); pc.set(x + 2, 2, S[0]); pc.set(x + 1, 6, 0xffffff); pc.set(x + 2, 6, 0xf0e060);
        x += 4;
      }
      k++;
    }
  },
  tools: (pc) => {
    rowBase(pc);
    for (let x = 1, k = 0; x < 32; x += 4, k++) {
      pc.set(x + 1, 1, 0x8a8e92); // peg
      const c = [0xe8c030, 0xd03a2a, 0x3a6ab0][k % 3];
      pc.rect(x, 2, 3, 6, 0xd8dce0); pc.rect(x, 2, 3, 1, c); pc.set(x + 1, 4, 0x4a4a4a); pc.set(x + 1, 5, 0x6a6a6a);
    }
    pc.rect(0, 8, 32, 2, 0x5a5e62);
  },
  toys: (pc) => {
    rowBase(pc);
    const cols = [0xf0a0c8, 0x80b8f0, 0xf8d050, 0x90d080, 0xc8a0f0];
    for (let x = 0, k = 0; x < 32; x += 6, k++) {
      const c = cols[k % cols.length], S = shade3(c);
      for (let i = 0; i < 5; i++) for (let y = 2; y < 10; y++) pc.set(x + i, y, i === 4 ? S[0] : S[1]);
      pc.rect(x + 1, 4, 3, 4, 0xe8f0f8); pc.set(x + 2, 5, 0xd8b090); pc.set(x + 2, 6, c);
      pc.hline(x, x + 3, 2, S[2]);
    }
  },
  elec: (pc) => {
    rowBase(pc);
    for (let x = 0, k = 0; x < 32; x += 6, k++) {
      for (let i = 0; i < 5; i++) for (let y = 3; y < 10; y++) pc.set(x + i, y, i === 4 ? 0x1a1a1c : 0x2a2c30);
      pc.rect(x + 1, 4, 3, 3, [0x3a8ad8, 0x4ac080, 0xd84a4a][k % 3]); pc.hline(x, x + 3, 3, 0x4a4c50); pc.hline(x + 1, x + 3, 8, 0xd8d8d8);
    }
  },
  sports: (pc) => {
    rowBase(pc);
    for (let x = 0, k = 0; x < 32; x += 4, k++) {
      const c = [0xe0702a, 0xf0f0f0, 0xe8e040, 0xd03a2a][k % 4];
      pc.circle(x + 2, 7.5, 1.9, c); pc.set(x + 1, 6, mixHex(c, 0xffffff, 0.5)); pc.set(x + 2, 8, scaleHex(c, 0.6));
      if (k % 2) pc.circle(x + 2, 3.5, 1.6, [0x3a8ad8, 0xf0f0f0][k % 2]);
    }
  },
  clothes: (pc) => {
    rowBase(pc);
    const cols = [0x5a7ab0, 0xd0d0c8, 0xb04040, 0x404048, 0x8ab070, 0xe0c0a0];
    for (let x = 0, k = 0; x < 32; x += 8, k++) {
      for (let s = 0; s < 4; s++) {
        const c = cols[(k * 2 + s) % cols.length], S = shade3(c);
        for (let i = 0; i < 7; i++) { pc.set(x + i, 9 - s * 2, S[1]); pc.set(x + i, 8 - s * 2, i === 0 ? S[2] : S[1]); }
        pc.set(x + 6, 9 - s * 2, S[0]);
      }
    }
  },
};

/** product rows per shelf (top→bottom) chosen from the container's loot table */
function rowsFor(loot: string | undefined, side: number): string[] {
  const m: Record<string, string[][]> = {
    store_food_canned: [['cans', 'cans', 'jars', 'cans'], ['cans', 'jars', 'cans', 'cans']],
    store_food_dry: [['boxes', 'boxes', 'jars', 'boxes'], ['boxes', 'cans', 'boxes', 'boxes']],
    store_snacks: [['snacks', 'snacks', 'boxes', 'snacks'], ['snacks', 'boxes', 'snacks', 'snacks']],
    store_drinks: [['bottles', 'bottles', 'bottles', 'bottles'], ['bottles', 'cans', 'bottles', 'bottles']],
    store_household: [['household', 'household', 'boxes', 'household'], ['household', 'household', 'household', 'boxes']],
    store_hardware: [['tools', 'tools', 'household', 'tools'], ['tools', 'tools', 'tools', 'boxes']],
    store_pharmacy: [['pharma_a', 'pharma_b', 'pharma_a', 'boxes'], ['pharma_b', 'pharma_a', 'pharma_b', 'pharma_a']],
    store_toys: [['toys', 'toys', 'sports', 'toys'], ['toys', 'toys', 'toys', 'boxes']],
    store_electronics: [['elec', 'elec', 'boxes', 'elec'], ['elec', 'elec', 'elec', 'boxes']],
    store_sports: [['sports', 'sports', 'sports', 'boxes'], ['sports', 'tools', 'sports', 'sports']],
    store_clothing: [['clothes', 'clothes', 'clothes', 'clothes'], ['clothes', 'clothes', 'clothes', 'clothes']],
  };
  const r = m[loot ?? ''] ?? [['cans', 'boxes', 'jars', 'bottles'], ['snacks', 'boxes', 'cans', 'household']];
  return r[side > 0 ? 0 : 1].map((k) => (k.startsWith('pharma') ? 'p_' + k : 'p_prod_' + k));
}

// ============================================================ textures
addTextureModule(() => {
  const A = atlas();
  for (const [k, fn] of Object.entries(ROWS)) A.add('p_prod_' + k, 32, 10, fn);
  A.add('p_prod_top', 32, 11, (pc) => {
    pc.fill(0x2a2c30);
    for (let x = 0, k = 0; x < 32; k++) {
      const w = 2 + Math.floor(ph(k, 5, 3) * 3);
      const c = [0xc8ccd0, 0xd8b850, 0xe8e4d8, 0xc83a3a, 0x3a6ab0, 0xf0f0e8, 0x7ab040][Math.floor(ph(k, 5, 9) * 7)];
      for (let i = 0; i < w - 1 && x + i < 32; i++) for (let y = 0; y < 11; y++) if ((y + k) % 3 !== 2) pc.set(x + i, y, (y + k) % 3 === 0 ? mixHex(c, 0xffffff, 0.3) : c);
      x += w;
    }
  });
  A.add('p_price_strip', 32, 3, (pc) => {
    pc.fill(0xe8e8e4); pc.hline(0, 31, 2, 0xa8a8a4);
    for (let x = 1; x < 32; x += 4) { const sale = ph(x, 1, 3) < 0.2; pc.rect(x, 0, 2, 2, sale ? 0xf0d020 : 0xffffff); pc.set(x, 1, sale ? 0xd02020 : 0x3a3a3a); }
  });
  A.add('p_pegboard', 8, 8, (pc) => {
    pc.fill(0xc8bca0); pc.each((x, y) => { if (x % 4 === 1 && y % 4 === 1) pc.set(x, y, 0x5a5040); });
  });
  A.add('p_endcap_sign', 28, 10, (pc) => {
    pc.wrap = false;
    pc.fill(0xf0d020); border(pc, 0xd02020); border(pc, 0xf8f0a0, 1, 1, 1, 26, 8);
    txtC(pc, 'SALE!', 14, 2, 0xd02020);
    pc.set(3, 7, 0xd02020); pc.set(24, 7, 0xd02020);
  });
  A.add('p_freezer_glass', 26, 56, (pc) => {
    pc.wrap = false;
    fillR(pc, 0, 0, 26, 56, [0x2a4a6a, 0x3a6a8a, 0x5a8aaa, 0x8ab8d0], (x, y) => 0.5 + (ph(x, y, 4) - 0.5) * 0.1 - Math.abs(x - 13) / 40, 1);
    const prods = [[0xd83a5a, 0xf8e8f0], [0x3a6ad8, 0xe8f0f8], [0xe8a030, 0x6a2a10], [0x5ab060, 0xf0f0e8], [0xf0f0f4, 0x3a3a8a]];
    for (let r = 0; r < 5; r++) {
      const y0 = 3 + r * 10;
      for (let x = 2; x < 24; x += 5) {
        const p = prods[Math.floor(ph(x, r, 3) * prods.length)];
        if (ph(x, r, 9) < 0.15) continue; // a gap where something was taken
        pc.rect(x, y0 + 2, 4, 6, p[0]); pc.hline(x, x + 3, y0 + 4, p[1]); pc.set(x, y0 + 2, mixHex(p[0], 0xffffff, 0.4));
      }
      pc.hline(1, 24, y0 + 8, 0xc8dce8); pc.hline(1, 24, y0 + 9, 0x6a8aa0);
    }
    // frost creeping in from the edges
    for (let y = 0; y < 56; y++) for (let x = 0; x < 26; x++) {
      const e = Math.min(x, 25 - x, y, 55 - y);
      if (e < 3 && ph(x, y, 7) < 0.7 - e * 0.2) pc.blend(x, y, 0xeef6fa, 0.65 - e * 0.15);
    }
    for (let i = 0; i < 40; i++) pc.blend(3 + i * 0.4, 52 - i, 0xffffff, 0.18);
  });
  A.add('p_freezer_header', 30, 6, (pc) => {
    pc.wrap = false;
    pc.fill(0x1a3a6a); txtC(pc, 'FROZEN', 15, 0, 0xd8f0ff); pc.hline(0, 29, 5, 0x5a9ad0);
  });
  const fruit = (name: string, base: number, r: number, hi: number, leaf = -1) => A.add(name, 16, 16, (pc, rng) => {
    const R = makeRamp(base, 5, { hueShift: 0.05 });
    pc.fill(R[0]);
    for (let i = 0; i < 40; i++) {
      const cx = rng.int(0, 15), cy = rng.int(0, 15);
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
        const d = Math.hypot(x, y) / (r + 0.5);
        if (d <= 1) pc.set(cx + x, cy + y, R[d > 0.75 ? 1 : x + y < -1 ? 4 : 2 + (x < 0 ? 1 : 0)]);
      }
      pc.set(cx - 1, cy - 1, hi);
      if (leaf >= 0 && rng.chance(0.3)) pc.set(cx, cy - r, leaf);
    }
  });
  fruit('p_produce_apples', 0xc02a22, 2, 0xffd0c0, 0x4a8a30);
  fruit('p_produce_oranges', 0xe8862a, 2, 0xfff0c0);
  fruit('p_produce_limes', 0x6aaa3a, 1, 0xd0f0a0);
  fruit('p_produce_potatoes', 0xa88050, 2, 0xd8c0a0);
  A.add('p_produce_bananas', 16, 16, (pc) => {
    pc.fill(0x5a4a20);
    for (let k = 0; k < 6; k++) for (let i = 0; i < 12; i++) {
      const x = (k * 5 + i) % 16, y = (k * 3 + Math.round(Math.sin(i * 0.3) * 2) + 2) % 16;
      pc.set(x, y, 0xf0d040); pc.set(x, y + 1, 0xd8b030); pc.set(x, y + 2, 0xb89020);
      if (i === 0) pc.set(x, y, 0x5a4a20);
    }
  });
  A.add('p_produce_lettuce', 16, 16, (pc, rng) => {
    const R = makeRamp(0x5aa040, 5, { hueShift: 0.05 });
    pc.fillRamp(R, (x, y) => 0.4 + (tileFbm(x, y, 16, 16, 4, 2, 9) - 0.5) * 0.9, 1);
    for (let i = 0; i < 10; i++) { const x = rng.int(0, 15), y = rng.int(0, 15); pc.set(x, y, R[4]); pc.set(x + 1, y + 1, 0xe8f0c0); }
  });
  A.add('p_price_card', 6, 4, (pc) => {
    pc.wrap = false; pc.fill(0xf4f4ec); pc.strokeRect(0, 0, 6, 4, 0xd02020); pc.set(2, 1, 0x1a1a1a); pc.set(3, 2, 0x1a1a1a); pc.set(4, 1, 0x1a1a1a);
  });
  A.add('p_conveyor', 16, 8, (pc) => {
    pc.fill(0x26262a); for (let x = 0; x < 16; x += 4) pc.vline(x, 0, 7, 0x323236); pc.hline(0, 15, 0, 0x3a3a40);
    pc.set(6, 4, 0x2e2e32); pc.set(11, 2, 0x1e1e22);
  });
  A.add('p_scanner', 8, 6, (pc) => {
    pc.wrap = false; pc.fill(0x1a1214); pc.strokeRect(0, 0, 8, 6, 0x8a8e92);
    pc.line(1, 1, 6, 4, 0xff3030); pc.line(1, 4, 6, 1, 0xff3030); pc.hline(1, 6, 3, 0xd02020);
  });
  A.add('p_lane_light', 6, 8, (pc) => {
    pc.wrap = false; pc.fill(0x2a5ab0); pc.strokeRect(0, 0, 6, 8, 0xe8e8f0); txt(pc, '3', 2, 2, 0xffffff);
  });
  A.add('p_register_keys', 12, 9, (pc) => {
    pc.wrap = false; pc.fill(0x5a5e66);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) pc.set(1 + c * 2, 1 + r * 2, c === 4 ? 0xd8a030 : r === 3 && c < 2 ? 0x50a060 : 0xe0e0dc);
    pc.rect(1, 8, 10, 1, 0x3a3e46);
  });
  A.add('p_register_display', 8, 3, (pc) => {
    pc.wrap = false; pc.fill(0x0a140c); pc.set(2, 1, 0x50f070); pc.set(4, 1, 0x50f070); pc.set(5, 1, 0x50f070); pc.set(6, 1, 0x50f070); pc.set(3, 2, 0x50f070);
  });
  A.add('p_cart_wire', 8, 8, (pc) => {
    pc.fill(0x2a2c30);
    pc.each((x, y) => { if (x % 4 === 0 || y % 4 === 0) pc.set(x, y, (x + y) % 3 === 0 ? 0xe8ecf0 : 0xb8bcc0); });
  });
  A.add('p_garment', 6, 22, (pc) => {
    pc.wrap = false;
    const R = makeRamp(0xc8c8c8, 4, { spread: 0.3 });
    fillR(pc, 0, 0, 6, 22, R, (x, y) => 0.6 - (x === 5 ? 0.3 : 0) + (y % 5 === 0 ? -0.1 : 0), 1);
    pc.set(2, 0, 0x8a8e92); pc.set(3, 0, 0x8a8e92); pc.set(1, 1, R[3]); pc.set(4, 1, R[3]);
    pc.vline(3, 2, 12, R[1]); pc.set(3, 4, 0xf0f0f0); pc.set(3, 7, 0xf0f0f0); pc.set(3, 10, 0xf0f0f0);
    pc.rect(1, 3, 2, 1, 0xf4f4f0); // price tag
  });
  A.add('p_mannequin', 16, 16, (pc) => {
    const R = makeRamp(0xe8dcc8, 4, { spread: 0.18 });
    pc.fillRamp(R, (x, y) => 0.62 + (tileFbm(x, y, 16, 16, 2, 2, 3) - 0.5) * 0.2, 1);
    pc.set(5, 9, R[1]); pc.set(12, 3, R[3]);
  });
  A.add('p_mannequin_face', 8, 9, (pc) => {
    pc.wrap = false;
    const R = makeRamp(0xe8dcc8, 4, { spread: 0.2 });
    pc.fill(R[2]);
    // the barest suggestion of a face
    pc.set(2, 3, R[1]); pc.set(5, 3, R[1]); pc.set(2, 4, R[0]); pc.set(5, 4, R[0]);
    pc.set(3, 6, R[1]); pc.set(4, 6, R[1]); pc.set(4, 1, R[3]);
  });
  A.add('p_folded', 16, 8, (pc) => {
    const cols = [0x5a7ab0, 0xe0d8c8, 0xb05050, 0x6a9a6a];
    for (let y = 0; y < 8; y++) for (let x = 0; x < 16; x++) {
      const c = cols[(y >> 1) % cols.length];
      pc.set(x, y, y % 2 === 1 ? scaleHex(c, 0.75) : (x % 8 === 0 ? scaleHex(c, 0.85) : c));
    }
  });
  A.add('p_sale_card', 10, 7, (pc) => {
    pc.wrap = false; pc.fill(0xf8f4e8); border(pc, 0xd02020); txtC(pc, '50%', 5, 1, 0xd02020);
  });
});

// ============================================================ builders
function gondola(mb: ModelBuilder, W: number, loot: string | undefined, doubleSided: boolean, zc: number, D: number) {
  const mt = 'metal_grey', mc = { color: 0xd8dce0 }, H = 1.78;
  mb.box(0, 0, zc, W, 0.12, D, mt, { color: 0x9aa0a8 });
  mb.box(0, 0.12, zc, W, H - 0.12, 0.04, 'p_pegboard');
  for (const sx of [-1, 1]) mb.box(sx * (W / 2 - 0.015), 0, zc, 0.03, H, D, mt, mc);
  mb.box(0, H, zc, W + 0.02, 0.03, 0.08, mt, mc);
  const levels = [0.14, 0.52, 0.9, 1.28];
  for (const side of doubleSided ? [1, -1] : [1]) {
    const rows = rowsFor(loot, side);
    const zf = zc + side * (D / 2), zp = zc + side * (D / 2 - 0.19);
    levels.forEach((y, i) => {
      mb.box(0, y - 0.02, zc + side * (D / 4 + 0.01), W - 0.04, 0.02, D / 2 - 0.02, mt, mc);
      mb.box(0, y - 0.05, zf - side * 0.005, W - 0.04, 0.05, 0.01, 'p_price_strip', { uvOffset: [i * 0.3, 0] });
      const full = (W - 0.06) * (i === 2 && side < 0 ? 0.7 : 1);
      const tex = rows[i];
      mb.box(-(W - 0.06 - full) / 2 * side, y, zp, full, 10 / 32, 0.34, { south: tex, north: tex, top: 'p_prod_top', all: 'p_prod_top' }, { uvOffset: [i * 0.37 + (side > 0 ? 0 : 0.5), -y], color: 0xffffff });
    });
  }
}

// ============================================================ models
defObj({
  key: 'shelf_store', name: 'Store Shelves', w: 2, d: 1, height: 1.82, block: 'solid', blocksSight: true, movable: 0,
  container: { capacity: 60, kind: 'shelf', loot: 'store_food_canned' }, sound: 'metal', flammable: 0.3,
  disassemble: { tools: ['#wrench', '#screwdriver'], time: 40, skill: 'mechanics', yields: [['sheet_metal', 3, 5], ['scrap_metal', 2, 5], ['screws', 4, 8]] },
  tags: T('store', 'shelf', 'mall'),
  variant: (s) => String(s.loot ?? ''),
  model: (mb, s) => gondola(mb, 1.96, s.loot, true, 0, 0.9),
});

defObj({
  key: 'shelf_store_end', name: 'Endcap Display', w: 1, d: 1, height: 2.15, block: 'solid', blocksSight: true, movable: 0,
  container: { capacity: 30, kind: 'shelf', loot: 'store_food_canned' }, sound: 'metal', flammable: 0.3,
  disassemble: { tools: ['#wrench', '#screwdriver'], time: 25, skill: 'mechanics', yields: [['sheet_metal', 2, 3], ['scrap_metal', 1, 3], ['screws', 2, 5]] },
  tags: T('store', 'shelf', 'mall'),
  variant: (s) => String(s.loot ?? ''),
  model: (mb, s) => {
    gondola(mb, 0.96, s.loot, false, -0.05, 0.8);
    mb.box(0, 1.82, -0.05, 0.04, 0.12, 0.04, 'metal_grey');
    mb.box(0, 1.9, -0.03, 0.86, 0.3, 0.02, 'p_endcap_sign', { fit: true });
    mb.box(0.3, 0.12, 0.36, 0.2, 0.14, 0.02, 'p_sale_card', { fit: true });
  },
});

defObj({
  key: 'freezer_display', name: 'Display Freezer', height: 2.1, block: 'solid', blocksSight: true, movable: 0, power: true, hum: 'fridge',
  container: { capacity: 40, kind: 'freezer', loot: 'store_frozen', cooling: 'freezer' },
  light: { color: 0xa8d8ff, intensity: 0.45, radius: 2.8, y: 1.3, kind: 'screen', power: true },
  sound: 'glass', flammable: 0.1,
  disassemble: { tools: ['#screwdriver', '#wrench'], time: 40, skill: 'mechanics', yields: [['glass_shard', 2, 4], ['sheet_metal', 2, 3], ['pipe', 1, 2], ['wire', 1, 2]] },
  tags: T('store', 'freezer', 'mall'),
  variant: (s) => (on(s) ? 'on' : 'off'),
  model: (mb, s) => {
    const W = 0.98, D = 0.8, zc = WZ + D / 2 + 0.01, zf = zc + D / 2, lit = on(s);
    mb.box(0, 0, zc, W, 0.14, D, 'metal_dark', { color: 0x7a8088 });
    mb.box(0, 0.02, zf + 0.002, W - 0.1, 0.08, 0.004, 'p_vent');
    mb.box(0, 0.14, zc, W, 1.96, D, 'metal_grey', { color: 0xe0e4e8 });
    mb.box(0, 1.84, zf + 0.01, W - 0.02, 0.22, 0.03, 'p_freezer_header', { fit: true, emissive: lit ? 0.8 : 0 });
    mb.box(0, 0.18, zf + 0.012, W - 0.08, 1.62, 0.024, { south: 'p_freezer_glass', all: 'metal_grey' }, { fit: { south: true }, emissive: lit ? 0.5 : 0 });
    for (const sx of [-1, 1]) mb.box(sx * (W / 2 - 0.04), 0.18, zf + 0.025, 0.04, 1.62, 0.02, 'metal_brushed');
    mb.box(0, 0.18, zf + 0.025, W - 0.08, 0.03, 0.02, 'metal_brushed');
    mb.box(0, 1.77, zf + 0.025, W - 0.08, 0.03, 0.02, 'metal_brushed');
    mb.box(W / 2 - 0.1, 0.7, zf + 0.06, 0.03, 0.6, 0.03, 'chrome');
    for (const y of [0.72, 1.28]) mb.box(W / 2 - 0.1, y, zf + 0.045, 0.02, 0.02, 0.03, 'chrome');
  },
});

defObj({
  key: 'produce_stand', name: 'Produce Stand', w: 2, d: 1, height: 1.15, block: 'table', movable: 0,
  container: { capacity: 40, kind: 'shelf', loot: 'store_produce' }, sound: 'wood', flammable: 0.6,
  disassemble: { tools: ['#hammer', '#saw'], time: 25, skill: 'carpentry', yields: [['plank', 3, 6], ['nails', 3, 8]] },
  tags: T('store', 'produce', 'table'),
  model: (mb) => {
    const W = 1.94, zc = -0.02, w = 'wood_light', wc = { color: 0xd8c0a0 };
    mb.box(0, 0, zc, W, 0.62, 0.86, w, { color: 0xb89870 });
    mb.box(0, 0.05, zc + 0.432, W - 0.04, 0.5, 0.01, 'p_oak', { color: 0xd0b890 });
    // sloped bins
    const fruits = ['p_produce_apples', 'p_produce_oranges', 'p_produce_bananas', 'p_produce_lettuce', 'p_produce_limes', 'p_produce_potatoes'];
    for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
      const x = -W / 3 + c * W / 3, z = zc + 0.2 - r * 0.42, h0 = 0.62 + (1 - r) * 0.06, slope = 0.12;
      mb.wedge(x, h0, z, W / 3 - 0.04, 0.4, slope + 0.04, 0.02, { top: fruits[r * 3 + c], all: w }, wc);
      mb.box(x, h0, z + 0.2, W / 3 - 0.02, 0.06, 0.02, w, wc);
      mb.box(x - (W / 6 - 0.01), h0, z, 0.02, 0.14, 0.42, w, wc);
      // price card on a stick
      mb.box(x + 0.2, h0 + 0.1, z + 0.18, 0.006, 0.1, 0.006, 'wood_light');
      mb.box(x + 0.2, h0 + 0.2, z + 0.18, 0.12, 0.08, 0.006, 'p_price_card', { fit: true });
    }
    mb.box(W / 2 - 0.01, 0.62, zc - 0.43, 0.02, 0.5, 0.02, w, wc);
    mb.box(-W / 2 + 0.01, 0.62, zc - 0.43, 0.02, 0.5, 0.02, w, wc);
    mb.box(0, 1.1, zc - 0.43, W, 0.03, 0.03, 'chrome');
    for (let i = 0; i < 6; i++) mb.box(-0.8 + i * 0.32, 1.08, zc - 0.41, 0.03, 0.02, 0.02, 'metal_dark');
  },
});

defObj({
  key: 'checkout_counter', name: 'Checkout Counter', w: 2, d: 1, height: 1.9, block: 'table', surface: 0.9, movable: 0, power: true,
  sound: 'metal', flammable: 0.2,
  disassemble: { tools: ['#screwdriver', '#wrench'], time: 40, skill: 'electrical', yields: [['sheet_metal', 2, 4], ['electronics_scrap', 1, 3], ['wire', 1, 3]] },
  tags: T('store', 'counter'),
  model: (mb) => {
    const zc = 0.0, body = { color: 0xe8e4dc };
    mb.box(0, 0, zc, 1.96, 0.08, 0.66, 'metal_dark', { color: 0x5a5a60 });
    mb.box(0, 0.08, zc, 1.96, 0.78, 0.66, 'plastic_white', body);
    mb.box(0, 0.4, zc + 0.335, 1.9, 0.08, 0.01, 'plastic_red', { color: 0xd04040 });
    mb.box(0, 0.86, zc, 1.98, 0.04, 0.68, 'metal_brushed');
    // conveyor belt + divider stick
    mb.box(0.35, 0.9, zc + 0.02, 1.2, 0.02, 0.5, { top: 'p_conveyor', all: 'rubber_black' });
    for (const sz of [-0.27, 0.29]) mb.box(0.35, 0.9, zc + sz, 1.22, 0.05, 0.03, 'metal_brushed');
    mb.box(0.55, 0.92, zc + 0.05, 0.4, 0.03, 0.04, 'plastic_black', { color: 0x4a4a50 });
    // scanner window + scale
    mb.box(-0.42, 0.9, zc + 0.02, 0.32, 0.012, 0.32, { top: 'p_scanner', all: 'metal_dark' }, { fit: { top: true }, emissive: 0.6 });
    mb.box(-0.42, 0.9, zc - 0.2, 0.32, 0.16, 0.08, 'plastic_black', { color: 0x4a4a50 });
    mb.box(-0.42, 0.98, zc - 0.155, 0.2, 0.06, 0.006, 'p_scanner', { fit: true, emissive: 0.5 });
    // bagging area: plastic bags on a rack
    mb.box(-0.82, 0.9, zc, 0.3, 0.35, 0.02, 'metal_brushed');
    mb.box(-0.82, 0.92, zc + 0.08, 0.26, 0.3, 0.14, 'plastic_white', { color: 0xf4f4f0 });
    // card reader on a pole
    mb.box(-0.15, 0.9, zc + 0.27, 0.025, 0.2, 0.025, 'metal_dark');
    mb.box(-0.15, 1.1, zc + 0.27, 0.1, 0.14, 0.05, 'plastic_black');
    mb.box(-0.15, 1.18, zc + 0.296, 0.06, 0.04, 0.004, 'screen_on', { emissive: 0.6 });
    // lane light
    mb.box(0.93, 0.9, zc - 0.28, 0.04, 0.85, 0.04, 'metal_grey');
    mb.box(0.93, 1.72, zc - 0.28, 0.14, 0.18, 0.14, { south: 'p_lane_light', north: 'p_lane_light', east: 'p_lane_light', west: 'p_lane_light', all: 'plastic_white' }, { fit: true, emissive: 0.8 });
    // impulse rack facing the customer
    mb.box(0.3, 0.08, zc + 0.36, 0.6, 0.5, 0.06, 'metal_grey', { color: 0xc0c4c8 });
    for (let i = 0; i < 2; i++) mb.box(0.3, 0.14 + i * 0.22, zc + 0.4, 0.56, 10 / 32 * 0.6, 0.06, { south: 'p_prod_snacks', all: 'cardboard' }, { uvOffset: [i * 0.4, 0] });
  },
});

defObj({
  key: 'cash_register', name: 'Cash Register', height: 0.42, block: 'none', movable: 12, power: true,
  container: { capacity: 3, kind: 'drawer', loot: 'generic', lockable: true }, sound: 'metal', flammable: 0.1,
  disassemble: { tools: ['#screwdriver'], time: 15, skill: 'electrical', yields: [['electronics_scrap', 2, 3], ['scrap_metal', 1, 2], ['wire', 1, 1]] },
  tags: T('store', 'counter', 'surface_item', 'electronics'),
  model: (mb) => {
    mb.box(0, 0, 0, 0.42, 0.1, 0.42, 'plastic_beige', { color: 0xb8b4ac });
    mb.box(0, 0.015, 0.212, 0.38, 0.07, 0.008, 'plastic_beige', { color: 0x8a8680 });
    mb.box(0, 0.045, 0.218, 0.08, 0.012, 0.01, 'metal_dark');
    mb.wedge(0, 0.1, 0.05, 0.36, 0.26, 0.09, 0.03, { top: 'p_register_keys', all: 'plastic_beige' }, { color: 0xd0ccc4 });
    mb.box(0, 0.1, -0.14, 0.36, 0.1, 0.12, 'plastic_beige', { color: 0xc8c4bc });
    mb.box(0.12, 0.2, -0.14, 0.04, 0.12, 0.04, 'plastic_black');
    mb.box(0.12, 0.32, -0.14, 0.18, 0.08, 0.05, { south: 'p_register_display', north: 'p_register_display', all: 'plastic_black' }, { fit: true, emissive: 0.6 });
    mb.box(-0.1, 0.2, -0.13, 0.1, 0.03, 0.06, 'paper');
    mb.box(-0.1, 0.205, -0.1, 0.06, 0.004, 0.08, 'paper');
  },
});

defObj({
  key: 'shopping_cart', name: 'Shopping Cart', height: 1.05, block: 'low', dynamic: true, movable: 15,
  container: { capacity: 50, kind: 'bin', name: 'Cart' }, sound: 'metal', flammable: 0,
  disassemble: { tools: ['#wrench'], time: 15, skill: 'mechanics', yields: [['scrap_metal', 3, 6], ['pipe', 1, 2]] },
  tags: T('store', 'pushable', 'mall'),
  model: (mb) => {
    const ch = 'chrome', wire = 'p_cart_wire';
    // chassis + casters
    for (const sx of [-0.2, 0.2]) mb.box(sx, 0.1, 0.0, 0.03, 0.03, 0.82, ch);
    mb.box(0, 0.1, -0.38, 0.44, 0.03, 0.03, ch);
    mb.box(0, 0.1, 0.38, 0.36, 0.03, 0.03, ch);
    for (const [x, z] of [[-0.2, -0.36], [0.2, -0.36], [-0.17, 0.36], [0.17, 0.36]]) caster(mb, x, z, 0.05);
    mb.box(0, 0.16, 0.02, 0.38, 0.02, 0.62, wire);
    for (const sx of [-0.2, 0.2]) { mb.push().translate(sx, 0.12, -0.36).rotateX(-0.05); mb.box(0, 0, 0, 0.03, 0.82, 0.03, ch); mb.pop(); }
    // basket: tapered toward the front
    const by = 0.45, bh = 0.4;
    mb.box(0, by, 0.0, 0.46, 0.015, 0.76, wire);
    mb.box(0, by, 0.38, 0.4, bh, 0.015, wire);
    mb.box(0, by + 0.02, -0.37, 0.5, bh - 0.02, 0.015, wire);
    for (const sx of [-1, 1]) { mb.push().translate(sx * 0.24, by, 0).rotateY(sx * 0.04); mb.box(0, 0, 0, 0.015, bh, 0.78, wire); mb.pop(); }
    mb.box(0, by + bh, 0.38, 0.42, 0.025, 0.025, ch);
    for (const sx of [-1, 1]) mb.box(sx * 0.245, by + bh, 0, 0.025, 0.025, 0.78, ch);
    // child seat flap + handle
    mb.box(0, by + 0.18, -0.34, 0.42, 0.22, 0.015, 'plastic_red', { color: 0xd84040 });
    mb.box(0, by + bh + 0.06, -0.45, 0.54, 0.035, 0.035, 'plastic_red', { color: 0xd84040 });
    for (const sx of [-0.25, 0.25]) mb.box(sx, by + bh - 0.02, -0.42, 0.025, 0.1, 0.06, ch);
  },
});

defObj({
  key: 'clothing_rack', name: 'Clothing Rack', height: 1.6, block: 'solid', movable: 15,
  container: { capacity: 25, kind: 'shelf', loot: 'store_clothing' }, sound: 'fabric', flammable: 0.8,
  disassemble: { tools: ['#wrench'], time: 10, skill: 'mechanics', yields: [['pipe', 1, 2], ['scrap_metal', 1, 2], ['rag', 2, 5]] },
  tags: T('store', 'mall', 'clothing'),
  model: (mb) => {
    const ch = 'chrome';
    for (const sx of [-0.46, 0.46]) {
      mb.box(sx, 0.05, 0, 0.03, 1.5, 0.03, ch);
      mb.box(sx, 0.04, 0, 0.04, 0.03, 0.45, ch);
      caster(mb, sx, -0.2, 0.035); caster(mb, sx, 0.2, 0.035);
    }
    mb.box(0, 1.53, 0, 0.98, 0.03, 0.03, ch);
    const cols = [0x5a7ab0, 0xe0d0c0, 0xb04848, 0x3a3a42, 0x7ab070, 0xe8b8c8, 0xd8c050, 0x8a6aa8, 0x4a8a8a];
    for (let i = 0; i < 9; i++) {
      const x = -0.4 + i * 0.1, long = i % 3 === 1;
      mb.push().translate(x, 1.53, 0).rotateY((ph(i, 2, 5) - 0.5) * 0.2);
      mb.box(0, -0.02, 0, 0.012, 0.05, 0.012, ch);
      mb.box(0, -(long ? 0.95 : 0.68), 0, 0.05, long ? 0.92 : 0.65, 0.42, { east: 'p_garment', west: 'p_garment', all: 'fabric_grey' }, { fit: { east: true, west: true }, color: cols[i] });
      mb.pop();
    }
  },
});

defObj({
  key: 'mannequin', name: 'Mannequin', height: 1.85, block: 'solid', movable: 12,
  sound: 'plastic', flammable: 0.4,
  disassemble: { tools: [], time: 6, yields: [['scrap_metal', 0, 1]] },
  tags: T('store', 'mall', 'mannequin', 'decor'),
  model: (mb) => {
    const sk = 'p_mannequin';
    mb.cylinder(0, 0, 0, 0.18, 0.025, 10, 'chrome');
    mb.cylinder(0, 0.025, 0, 0.012, 0.25, 6, 'chrome');
    for (const sx of [-0.08, 0.08]) {
      mb.push().translate(sx, 0.1, 0).rotateZ(sx < 0 ? 0.02 : -0.03);
      mb.cylinder(0, 0, 0, 0.045, 0.82, 6, sk, { rTop: 0.065 }); mb.pop();
      mb.box(sx, 0.05, 0.04, 0.07, 0.05, 0.16, sk);
    }
    mb.box(0, 0.88, 0, 0.3, 0.2, 0.18, sk);
    // dress
    mb.cylinder(0, 0.62, 0, 0.24, 0.48, 8, 'fabric_red', { rTop: 0.15, color: 0xc8a8d8 });
    mb.box(0, 1.08, 0, 0.32, 0.34, 0.2, 'fabric_red', { color: 0xc8a8d8 });
    mb.box(0, 1.42, 0, 0.36, 0.06, 0.18, sk);
    mb.cylinder(0, 1.46, 0.0, 0.04, 0.12, 6, sk);
    // head: turned a little too far toward you
    mb.push().translate(0, 1.6, 0.0).rotateY(0.55).rotateZ(0.12);
    mb.sphere(0, 0.06, 0, 0.1, 8, 6, sk, { sy: 1.3 });
    mb.box(0, 0.0, 0.085, 0.09, 0.1, 0.02, 'p_mannequin_face', { fit: true });
    mb.pop();
    // arms: one at the side, one raised as if about to wave
    mb.push().translate(-0.2, 1.4, 0).rotateZ(-0.12);
    mb.cylinder(0, -0.62, 0, 0.032, 0.62, 6, sk, { rTop: 0.045 }); mb.pop();
    mb.push().translate(0.2, 1.4, 0).rotateZ(0.3).rotateX(-0.25);
    mb.cylinder(0, -0.3, 0, 0.04, 0.3, 6, sk); mb.pop();
    mb.push().translate(0.29, 1.12, -0.07).rotateZ(-0.9).rotateX(0.4);
    mb.cylinder(0, 0, 0, 0.032, 0.3, 6, sk); mb.pop();
  },
});

defObj({
  key: 'display_table', name: 'Display Table', w: 2, d: 1, height: 0.95, block: 'table', surface: 0.76, movable: 30,
  sound: 'wood', flammable: 0.7,
  container: { capacity: 25, kind: 'shelf', loot: 'store_clothing' },
  disassemble: { tools: ['#hammer', '#saw'], time: 20, skill: 'carpentry', yields: [['plank', 2, 4], ['nails', 2, 5]] },
  tags: T('store', 'mall', 'table'),
  model: (mb) => {
    mb.box(0, 0, 0, 1.7, 0.72, 0.8, 'wood_light', { color: 0xf0e8e0 });
    mb.box(0, 0.06, 0.401, 1.6, 0.6, 0.004, 'wood_light', { color: 0xd8ccc0 });
    mb.box(0, 0.72, 0, 1.78, 0.04, 0.86, 'wood_light', { color: 0xe0d0c0 });
    for (let i = 0; i < 5; i++) {
      const x = -0.65 + i * 0.32, h = 0.12 + (i % 3) * 0.04;
      mb.box(x, 0.76, -0.1, 0.28, h, 0.24, { top: 'fabric_grey', all: 'p_folded' }, { uvOffset: [i * 0.2, 0], color: 0xffffff });
      mb.box(x + 0.02, 0.76, 0.2, 0.26, h - 0.04, 0.22, { top: 'fabric_blue', all: 'p_folded' }, { uvOffset: [i * 0.3, 0.1] });
    }
    mb.box(0.6, 0.94, 0.25, 0.006, 0.1, 0.006, 'chrome');
    mb.box(0.6, 1.0, 0.25, 0.2, 0.14, 0.006, 'p_sale_card', { fit: true });
  },
});

void tileFbm; void scribble; void hbar; void knob; void fillR;
