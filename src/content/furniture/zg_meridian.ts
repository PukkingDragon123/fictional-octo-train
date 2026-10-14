// Zone props for the Meridian levels (office / stairwell / core / exit):
// stencilled stairwell level numbers, scrawled graffiti panels and the painted
// stair flights of the Stairwell (floors there are level: the stairs only look
// like they go down).
import { defObj } from '../../world/objects';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { makeRamp, mixHex, scaleHex } from '../../gfx/pixel';
import { bayer, ph, text, textC, textW, rod } from './b_common';

const T = ['meridian', 'zg'];

/** labels the stairwell level sign can show */
export const ZG_LEVEL_LABELS = ['4', '3', '2', '1', '13', '0', 'P1', 'P2', 'P3', 'P4', '5', '?'];

const SCRAWLS: { lines: string[]; ink: number }[] = [
  { lines: ['FLOOR 13', 'IS NOT ON', 'THE PLANS'], ink: 0xb02a22 },
  { lines: ['COUNT THE', 'LANDINGS'], ink: 0x1e1e22 },
  { lines: ['STOP', 'COUNTING'], ink: 0xb02a22 },
  { lines: ['IT SKIPS', 'ONE GOING', 'DOWN'], ink: 0x1e1e22 },
  { lines: ['4 3 2 1', '0 P1 P2', 'P3 2 1'], ink: 0x2a4aa0 },
  { lines: ['UP IS', 'NOT OUT'], ink: 0x1e1e22 },
];

addTextureModule(() => {
  const A = atlas();

  // stencilled level numbers: yellow safety paint, black stencil, chipped
  for (const L of ZG_LEVEL_LABELS) {
    A.add('zg_lvl_' + L, 32, 22, (pc) => {
      pc.wrap = false;
      const Y = makeRamp(0xd6a92e, 5, { spread: 0.32 });
      pc.fillRamp(Y, (x, y) => 0.55 + (ph(x >> 1, y >> 1, 9101 + L.length) - 0.5) * 0.35, 0.8);
      pc.strokeRect(0, 0, 32, 22, 0x2a2620);
      pc.strokeRect(1, 1, 30, 20, Y[1]);
      const scale = L.length > 2 ? 2 : 3;
      textC(pc, 'LEVEL', 16, 2, 0x2a2620, 1);
      textC(pc, L, 16, 8 + (scale === 2 ? 2 : 0), 0x18160f, scale);
      // stencil bridges and chips where the concrete shows through
      for (let x = 0; x < 32; x++) for (let y = 0; y < 22; y++) {
        if (ph(x, y, 9133) < 0.035) pc.set(x, y, 0x8c8a84);
        if (y > 17 && ph(x, y, 9134) < 0.12) pc.blend(x, y, 0x6a5a3a, 0.4);
      }
    });
  }

  // graffiti on a patch of grey primer somebody rolled over older writing
  SCRAWLS.forEach((s, i) => {
    A.add('zg_scrawl_' + i, 40, 28, (pc, rng) => {
      pc.wrap = false;
      const P = makeRamp(0x9a9890, 5, { spread: 0.25 });
      pc.fillRamp(P, (x, y) => 0.5 + (ph(x >> 2, y, 9150 + i) - 0.5) * 0.3, 0.7);
      // roller streaks + old writing ghosting through
      for (let y = 0; y < 28; y += 3) for (let x = 0; x < 40; x++) if (ph(x, y, 9160 + i) < 0.5) pc.blend(x, y, P[3], 0.4);
      for (let k = 0; k < 4; k++) { const y = 4 + k * 6; for (let x = 3; x < 36; x++) if (ph(x, y, 9170 + i) < 0.4) pc.blend(x, y, 0x5a5850, 0.25); }
      const lines = s.lines;
      const y0 = Math.max(1, Math.floor((28 - lines.length * 8) / 2));
      lines.forEach((ln, j) => {
        const w = textW(ln, 1);
        const x = Math.max(1, Math.floor((40 - w) / 2) + ((j * 3 + i) % 3) - 1);
        // sprayed: a fat soft line under the glyphs
        text(pc, ln, x + 1, y0 + j * 8 + 1, scaleHex(s.ink, 0.6));
        text(pc, ln, x, y0 + j * 8, s.ink);
      });
      pc.drips(rng, s.ink, 5, y0 + 5, 7, 0.55);
      for (let x = 0; x < 40; x++) for (let y = 0; y < 28; y++) if (bayer(x, y) < 0.06 && ph(x, y, 9181) < 0.3) pc.blend(x, y, s.ink, 0.5);
    });
  });

  // one stair tread seen from above: riser band at the top (north), tread, nosing at the south edge
  A.add('zg_flight', 32, 32, (pc, rng) => {
    pc.wrap = false;
    const R = makeRamp(0x8a8780, 6, { spread: 0.35 });
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const n = (ph(x, y, 9201) - 0.5) * 0.25;
      let v: number;
      if (y < 9) v = 0.22 + y * 0.012 + n;           // riser of the step above, in shadow
      else if (y === 9) v = 0.08;                       // crease
      else v = 0.52 + (y - 10) * 0.006 + n;             // tread, lit from the lamp above
      pc.set(x, y, R[Math.max(0, Math.min(5, Math.round(v * 5 + (bayer(x, y) - 0.5) * 0.5)))]);
    }
    // anti-slip nosing: hazard stripes, chipped
    for (let x = 0; x < 32; x++) {
      for (let y = 27; y < 30; y++) pc.set(x, y, ((x + y) >> 2) & 1 ? 0x24221e : 0xd8b030);
      pc.set(x, 30, R[5]);
      pc.set(x, 31, R[4]);
      if (ph(x, 28, 9203) < 0.12) pc.set(x, 28, R[2]);
    }
    // scuffs where everyone treads, worn in the middle
    for (let x = 9; x < 23; x++) for (let y = 13; y < 26; y++) if (ph(x, y, 9205) < 0.18) pc.blend(x, y, R[1], 0.35);
    pc.speckle(rng, [R[0]], 0.02);
    // dark side margins: the stringers
    for (let y = 0; y < 32; y++) { pc.set(0, y, mixHex(pc.get(0, y), 0x1a1916, 0.5)); pc.set(31, y, mixHex(pc.get(31, y), 0x1a1916, 0.5)); }
  });
});

defObj({
  key: 'zg_level_sign', name: 'Level Sign', height: 1.9, block: 'none', onWall: true, sound: 'metal', hp: 99999,
  desc: 'A stencilled level number. The paint looks newer than the wall it is on.',
  tags: [...T, 'sign', 'wall'],
  variant: (s) => String(s.label ?? '0'),
  model: (mb, s) => {
    const L = String(s.label ?? '0');
    const tex = ZG_LEVEL_LABELS.includes(L) ? 'zg_lvl_' + L : 'zg_lvl_?';
    mb.box(0, 1.05, -0.428, 1.0, 0.82, 0.02, { south: tex, sides: 'metal_dark', top: 'metal_dark', bottom: 'metal_dark' }, { fit: { south: true } });
    for (const x of [-0.45, 0.45]) mb.box(x, 1.8, -0.416, 0.03, 0.03, 0.01, 'metal_grey');
  },
});

defObj({
  key: 'zg_wall_scrawl', name: 'Graffiti', height: 1.9, block: 'none', onWall: true, sound: 'metal', hp: 99999,
  desc: 'Spray paint on a primer patch. More than one hand, more than one colour.',
  tags: [...T, 'graffiti', 'wall'],
  variant: (s) => String((s.v ?? 0) % SCRAWLS.length),
  model: (mb, s) => {
    const v = (s.v ?? 0) % SCRAWLS.length;
    mb.box(0, 0.78, -0.43, 1.12, 0.8, 0.012, { south: 'zg_scrawl_' + v, sides: 'concrete', top: 'concrete', bottom: 'concrete' }, { fit: { south: true } });
  },
});

defObj({
  key: 'zg_stair_flight', name: 'Stairs', height: 0.05, block: 'none', sound: 'metal', hp: 99999, noShadow: true,
  desc: 'Concrete steps going down. Your knees agree. Your inner ear is not so sure.',
  tags: [...T, 'stairs'],
  model: (mb) => {
    mb.box(0, 0, 0, 1.0, 0.014, 1.0, { top: 'zg_flight', sides: 'concrete' }, { fit: { top: true }, skip: ['bottom'] });
  },
});

defObj({
  key: 'zg_handrail', name: 'Handrail', height: 1.0, block: 'none', onWall: true, sound: 'metal', hp: 99999,
  desc: 'A painted steel handrail, worn bare where hands slide down it. Only down.',
  tags: [...T, 'wall'],
  model: (mb) => {
    rod(mb, -0.5, 0.92, -0.36, 0.5, 0.92, -0.36, 0.022, 6, 'q_paint_yellow');
    for (const x of [-0.25, 0.25]) rod(mb, x, 0.92, -0.36, x, 0.92, -0.44, 0.012, 4, 'metal_grey');
  },
});
