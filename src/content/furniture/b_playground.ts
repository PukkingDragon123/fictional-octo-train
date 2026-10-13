// Furniture B — playground (dreamcore childhood): swings that are still
// moving, a slide, seesaw, sandbox, merry-go-round, spring horse and a jungle
// gym. Chipped primary paint, pastel accents, small wrong details.
import { defObj } from '../../world/objects';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { ModelBuilder } from '../../gfx/modelBuilder';
import { makeRamp, mixHex, scaleHex, bayer, ph, tileFbm, hashf, chips, rust, rod, torus, discY, pushSeg } from './b_common';

const T = ['setB', 'playground', 'dream'];

addTextureModule(() => {
  const A = atlas();
  A.add('q_swing_seat', 16, 6, (pc, rng) => {
    const r = makeRamp(0x2a2a2e, 5, { spread: 0.45 });
    pc.each((x, y) => pc.set(x, y, y === 0 ? r[3] : y === 5 ? r[0] : r[1 + (ph(x, y, 901) < 0.2 ? 1 : 0)]));
    for (let k = 0; k < 3; k++) pc.hline(rng.int(0, 12), rng.int(2, 15), rng.int(1, 4), r[4]);
  });
  A.add('q_slide_steel', 16, 32, (pc, rng) => {
    const r = makeRamp(0xb8bec2, 6, { spread: 0.4 });
    pc.fillRamp(r, (x, y) => 0.55 + Math.sin(x / 16 * Math.PI * 2) * 0.15 + (tileFbm(x, y, 16, 32, 2, 2, 911) - 0.5) * 0.15, 0.6);
    for (let x = 3; x < 16; x += 6) for (let y = 0; y < 32; y++) pc.blend(x, y, 0xffffff, 0.45);
    for (let k = 0; k < 5; k++) { const x = rng.int(0, 15), y = rng.int(0, 31); pc.vline(x, y, y + rng.int(2, 6), r[1]); }
  });
  A.add('q_sandpit', 32, 32, (pc, rng) => {
    const r = makeRamp(0xd8c08a, 6, { hueShift: 0.04, spread: 0.4 });
    pc.fillRamp(r, (x, y) => 0.55 + (ph(x, y, 921) - 0.5) * 0.4 + (tileFbm(x, y, 32, 32, 2, 3, 922) - 0.5) * 0.4, 1);
    // damp patches, bucket-mould rings and a drag line from a little shoe
    pc.each((x, y) => { if (tileFbm(x, y, 32, 32, 2, 2, 923) > 0.63) pc.blend(x, y, 0xa08a5a, 0.4); });
    for (const [cx, cy] of [[8, 9], [22, 20]]) for (let a = 0; a < 20; a++) { const t = a / 20 * Math.PI * 2; pc.set(Math.round(cx + Math.cos(t) * 3), Math.round(cy + Math.sin(t) * 3), r[1]); }
    for (let x = 4; x < 28; x++) pc.set(x, 27 + Math.round(Math.sin(x * 0.4)), r[1]);
    pc.speckle(rng, [0x8a8070, 0xf0e0b0], 0.02);
  });
  A.add('q_merry_top', 58, 58, (pc, rng) => {
    pc.wrap = false;
    const cols = [0xc8382e, 0xe2b437, 0x3f6fb8, 0x4c9a52];
    const ramps = cols.map((c) => makeRamp(c, 4, { spread: 0.35 }));
    pc.each((x, y) => {
      const dx = x + 0.5 - 29, dy = y + 0.5 - 29;
      const d = Math.hypot(dx, dy);
      let a = Math.atan2(dy, dx); if (a < 0) a += Math.PI * 2;
      const seg = Math.floor(a / (Math.PI / 4));
      const R = ramps[seg % 4];
      let c = R[2];
      if ((x + y * 3) % 7 === 0 && d < 27) c = R[1];
      if (Math.abs(a - Math.round(a / (Math.PI / 4)) * (Math.PI / 4)) * d < 0.7) c = 0x3a3a3c;
      if (d < 6) c = 0x8a8c8e;
      if (d < 5 && (x + y) % 3 === 0) c = 0x6a6c6e;
      if (d > 27.5) c = 0x5a5c5e;
      pc.set(x, y, c);
    });
    chips(pc, rng, 30, 0x8a8a84, 0x4a4a48, [4, 4, 50, 50]);
    rust(pc, 931, 0.18, 4);
  });
  A.add('q_spring', 8, 8, (pc) => {
    pc.each((x, y) => { const v = (x + y * 2) % 8; pc.set(x, y, v < 3 ? 0x6a6e72 : v < 5 ? 0x9a9ea2 : v < 6 ? 0xc8ccd0 : 0x1a1a1c); });
  });
});

// ---------------------------------------------------------------------------
function chainPair(mb: ModelBuilder, x: number, top: number, bottom: number, spread = 0.2) {
  for (const s of [-1, 1]) mb.box(x + s * spread, bottom, 0, 0.018, top - bottom, 0.018, 'q_chain');
}

defObj({
  key: 'swing_set', name: 'Swing Set', w: 3, d: 2, height: 2.35, block: 'solid', tall: true,
  sound: 'metal',
  desc: 'Two swings. One is still moving. The chain of the third hangs snapped and swaying.',
  tags: [...T],
  model: (mb) => {
    const top = 2.22;
    for (const x of [-1.38, 1.38]) for (const z of [-0.78, 0.78]) rod(mb, x, top, 0, x + Math.sign(x) * 0.08, 0, z, 0.04, 7, 'q_paint_blue');
    for (const x of [-1.38, 1.38]) mb.box(x, 0.9, 0, 0.05, 0.05, 0.75, 'q_paint_blue');
    mb.cylinderX(0, top, 0, 0.052, 2.95, 8, 'q_paint_red');
    // swing 1: hanging still
    chainPair(mb, -0.75, top, 0.47);
    mb.box(-0.75, 0.44, 0, 0.46, 0.035, 0.17, 'q_swing_seat');
    // swing 2: caught mid-arc
    mb.push(); mb.translate(0.25, top, 0); mb.rotateX(0.42);
    chainPair(mb, 0, 0, -1.75);
    mb.box(0, -1.78, 0, 0.46, 0.035, 0.17, 'q_swing_seat');
    mb.pop();
    // third: snapped chain
    mb.box(1.0, top - 0.7, 0, 0.018, 0.7, 0.018, 'q_chain');
    mb.box(0.96, top - 1.6, 0, 0.018, 1.6, 0.018, 'q_chain');
    for (const x of [-0.95, -0.55, 0.05, 0.45, 0.8, 1.2]) mb.box(x, top - 0.08, 0, 0.04, 0.06, 0.12, 'metal_dark');
  },
});

defObj({
  key: 'slide_playground', name: 'Playground Slide', w: 1, d: 3, height: 2.2, block: 'solid', tall: true,
  sound: 'metal',
  desc: 'A steel slide with a little red roof. The bottom is polished by years of children.',
  tags: [...T],
  model: (mb) => {
    const lz0 = -1.45, lz1 = -1.12;
    for (const x of [-0.24, 0.24]) rod(mb, x, 0, lz0, x, 1.78, lz1, 0.03, 7, 'q_paint_teal');
    for (let i = 1; i <= 5; i++) { const t = i / 6; mb.box(0, 1.75 * t, lz0 + (lz1 - lz0) * t, 0.46, 0.03, 0.04, 'metal_grey'); }
    // platform + posts + roof
    mb.box(0, 1.3, -0.92, 0.62, 0.05, 0.42, { top: 'q_paint_yellow', sides: 'q_paint_yellow' });
    for (const x of [-0.29, 0.29]) for (const z of [-1.1, -0.74]) rod(mb, x, 0, z, x, 2.0, z, 0.03, 7, 'q_paint_teal');
    for (const x of [-0.29, 0.29]) mb.box(x, 1.55, -0.92, 0.03, 0.03, 0.36, 'q_paint_teal');
    const ry = 2.0;
    mb.push(); mb.translate(0, ry, -0.92); mb.rotateZ(0.55); mb.box(-0.2, 0, 0, 0.44, 0.03, 0.56, 'q_paint_red'); mb.pop();
    mb.push(); mb.translate(0, ry, -0.92); mb.rotateZ(-0.55); mb.box(0.2, 0, 0, 0.44, 0.03, 0.56, 'q_paint_red'); mb.pop();
    // chute
    const path: [number, number, number][] = [[0, 1.33, -0.72], [0, 0.95, -0.25], [0, 0.5, 0.55], [0, 0.32, 1.1], [0, 0.3, 1.45]];
    for (let i = 0; i + 1 < path.length; i++) {
      const a = path[i], b = path[i + 1];
      const len = pushSeg(mb, a[0], a[1], a[2], b[0], b[1], b[2]);
      mb.box(0, 0, len / 2, 0.44, 0.025, len + 0.06, 'q_slide_steel');
      for (const s of [-1, 1]) mb.box(s * 0.23, 0, len / 2, 0.03, 0.14, len + 0.06, 'q_paint_yellow');
      mb.pop();
    }
    for (const z of [0.55, 1.4]) for (const x of [-0.2, 0.2]) rod(mb, x, 0, z, x, z > 1 ? 0.3 : 0.5, z, 0.025, 6, 'q_paint_teal');
  },
});

defObj({
  key: 'seesaw', name: 'Seesaw', w: 3, d: 1, height: 0.95, block: 'low',
  sound: 'metal',
  desc: 'A seesaw resting with one end down, as if someone heavy just got off the other end.',
  tags: [...T],
  model: (mb) => {
    // pivot stand
    for (const s of [-1, 1]) rod(mb, 0, 0.45, s * 0.08, 0, 0, s * 0.3, 0.035, 6, 'q_paint_green');
    mb.box(0, 0, 0, 0.12, 0.04, 0.7, 'q_paint_green');
    mb.cylinderZ(0, 0.46, 0, 0.04, 0.3, 8, 'metal_dark');
    // tilted plank with seats and handles
    mb.push(); mb.translate(0, 0.48, 0); mb.rotateZ(0.27);
    mb.box(0, 0, 0, 2.9, 0.05, 0.22, 'q_paint_yellow');
    for (const s of [-1, 1]) {
      mb.box(s * 1.28, 0.05, 0, 0.3, 0.05, 0.26, 'q_paint_red');
      rod(mb, s * 1.05, 0.05, -0.08, s * 1.05, 0.3, -0.08, 0.016, 6, 'q_paint_red');
      rod(mb, s * 1.05, 0.05, 0.08, s * 1.05, 0.3, 0.08, 0.016, 6, 'q_paint_red');
      rod(mb, s * 1.05, 0.3, -0.08, s * 1.05, 0.3, 0.08, 0.016, 6, 'q_paint_red');
    }
    mb.pop();
    torus(mb, -1.36, 0.06, 0, 0.16, 0.06, 10, 4, 'rubber_black');
  },
});

defObj({
  key: 'sandbox', name: 'Sandbox', w: 2, d: 2, height: 0.32, block: 'none',
  sound: 'wood',
  desc: 'A sandbox with a half-finished castle. A doll\'s face watches from the sand.',
  tags: [...T],
  model: (mb) => {
    const W = 'q_paint_green';
    for (const s of [-1, 1]) {
      mb.box(0, 0, s * 0.94, 1.96, 0.3, 0.08, W);
      mb.box(s * 0.94, 0, 0, 0.08, 0.3, 1.8, W);
    }
    for (const x of [-0.83, 0.83]) for (const z of [-0.83, 0.83]) mb.box(x, 0.3, z, 0.22, 0.03, 0.22, 'q_paint_yellow');
    mb.box(0, 0, 0, 1.8, 0.2, 1.8, { top: 'q_sandpit', sides: 'q_sandpit' }, { skip: ['bottom'] });
    // castle
    const S = 'q_sandpit';
    mb.cylinder(-0.35, 0.2, -0.3, 0.1, 0.18, 7, S, { rTop: 0.085 });
    mb.cylinder(-0.05, 0.2, -0.35, 0.1, 0.14, 7, S, { rTop: 0.085 });
    mb.box(-0.2, 0.2, -0.32, 0.3, 0.08, 0.06, S);
    mb.cylinder(-0.35, 0.38, -0.3, 0.06, 0.08, 6, S, { rTop: 0.0 });
    // bucket on its side + spade
    mb.push(); mb.translate(0.35, 0.29, 0.25); mb.rotateZ(Math.PI / 2 + 0.2);
    mb.cylinder(0, -0.08, 0, 0.07, 0.16, 8, 'plastic_red', { rTop: 0.09 });
    mb.pop();
    mb.box(0.1, 0.2, 0.45, 0.06, 0.012, 0.2, 'plastic_blue');
    mb.box(0.1, 0.2, 0.62, 0.02, 0.02, 0.18, 'plastic_blue');
    // doll head half-buried
    mb.sphere(-0.45, 0.2, 0.4, 0.065, 7, 4, 'q_paint_pink', { color: 0xfff0e8 });
    for (const x of [-0.475, -0.43]) mb.box(x, 0.235, 0.455, 0.014, 0.014, 0.01, 'plastic_black');
    mb.box(-0.45, 0.26, 0.38, 0.1, 0.03, 0.08, 'fabric_brown', { color: 0xf0d070 });
  },
});

defObj({
  key: 'merry_go_round', name: 'Merry-Go-Round', w: 2, d: 2, height: 0.95, block: 'low',
  sound: 'metal',
  desc: 'A painted roundabout. It turns slowly on its own, a quarter turn whenever you look away.',
  tags: [...T],
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.14, 0.2, 8, 'metal_dark');
    mb.cylinder(0, 0.18, 0, 0.9, 0.07, 16, 'q_paint_yellow', { caps: false });
    discY(mb, 0, 0.25, 0, 0.9, 16, 'q_merry_top');
    const n = 6;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + 0.2;
      const cx = Math.cos(a), cz = Math.sin(a);
      rod(mb, cx * 0.12, 0.88, cz * 0.12, cx * 0.8, 0.55, cz * 0.8, 0.022, 6, k % 2 ? 'q_paint_red' : 'q_paint_blue');
      rod(mb, cx * 0.8, 0.25, cz * 0.8, cx * 0.8, 0.55, cz * 0.8, 0.022, 6, k % 2 ? 'q_paint_red' : 'q_paint_blue');
    }
    for (let k = 0; k < 12; k++) {
      const a0 = (k / 12) * Math.PI * 2 + 0.2, a1 = ((k + 1) / 12) * Math.PI * 2 + 0.2;
      rod(mb, Math.cos(a0) * 0.8, 0.55, Math.sin(a0) * 0.8, Math.cos(a1) * 0.8, 0.55, Math.sin(a1) * 0.8, 0.02, 4, 'metal_grey');
    }
    mb.cylinder(0, 0.25, 0, 0.12, 0.66, 8, 'q_paint_red', { rTop: 0.06 });
    mb.sphere(0, 0.92, 0, 0.07, 7, 4, 'q_paint_yellow');
  },
});

defObj({
  key: 'spring_rider', name: 'Spring Horse', w: 1, d: 1, height: 0.98, block: 'low', sit: true,
  sound: 'metal',
  desc: 'A pastel horse on a coiled spring. Its painted eyes are slightly too far apart.',
  tags: [...T, 'sit'],
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.26, 0.03, 10, 'concrete');
    mb.cylinder(0, 0.03, 0, 0.11, 0.36, 8, 'q_spring', { caps: false });
    mb.cylinder(0, 0.38, 0, 0.12, 0.03, 8, 'metal_dark');
    const P = 'q_paint_pink';
    mb.push(); mb.translate(0, 0.41, 0); mb.rotateY(0.15);
    mb.box(0, 0.04, 0, 0.22, 0.2, 0.52, P);
    for (const x of [-0.09, 0.09]) for (const z of [-0.2, 0.2]) mb.box(x, -0.04, z, 0.06, 0.1, 0.07, P);
    mb.box(0, 0.24, -0.02, 0.24, 0.04, 0.22, 'q_paint_teal');
    // neck + head
    mb.push(); mb.translate(0, 0.18, 0.2); mb.rotateX(-0.5);
    mb.box(0, 0, 0.05, 0.14, 0.3, 0.14, P);
    mb.pop();
    mb.box(0, 0.38, 0.33, 0.15, 0.15, 0.26, P);
    mb.box(0, 0.36, 0.47, 0.12, 0.1, 0.05, P, { color: 0xffd8e0 });
    for (const x of [-0.08, 0.08]) {
      mb.box(x, 0.43, 0.38, 0.012, 0.04, 0.04, 'plastic_black');
      mb.box(x * 0.6, 0.53, 0.26, 0.04, 0.07, 0.03, P);
    }
    // mane + tail
    for (let i = 0; i < 5; i++) mb.box(0, 0.32 + i * 0.03, 0.18 + i * 0.035, 0.05, 0.06, 0.05, 'q_paint_lilac');
    mb.push(); mb.translate(0, 0.16, -0.27); mb.rotateX(0.6); mb.box(0, -0.18, 0, 0.06, 0.2, 0.05, 'q_paint_lilac'); mb.pop();
    // handles + footrests
    mb.box(0, 0.42, 0.3, 0.32, 0.025, 0.025, 'metal_grey');
    for (const s of [-1, 1]) mb.box(s * 0.16, 0.42, 0.3, 0.03, 0.05, 0.05, 'plastic_red');
    mb.box(0, 0.0, 0.08, 0.4, 0.02, 0.02, 'metal_grey');
    mb.pop();
  },
});

defObj({
  key: 'jungle_gym', name: 'Jungle Gym', w: 2, d: 2, height: 2.45, block: 'solid', tall: true,
  sound: 'metal',
  desc: 'A climbing frame of coloured bars. A deflated party balloon is still tied to the top.',
  tags: [...T],
  model: (mb) => {
    const xs = [-0.85, 0, 0.85];
    const levels: [number, string][] = [[0.55, 'q_paint_red'], [1.1, 'q_paint_yellow'], [1.62, 'q_paint_green']];
    for (const x of xs) for (const z of xs) rod(mb, x, 0, z, x, 1.64, z, 0.03, 6, 'q_paint_blue');
    for (const [y, tex] of levels) {
      for (const z of xs) rod(mb, -0.85, y, z, 0.85, y, z, 0.022, 6, tex);
      for (const x of xs) rod(mb, x, y, -0.85, x, y, 0.85, 0.022, 6, tex);
    }
    for (const x of xs) for (const z of xs) mb.sphere(x, 1.64, z, 0.04, 6, 3, 'q_paint_blue');
    // balloon on a string
    rod(mb, 0.85, 1.62, 0.85, 0.7, 2.15, 0.7, 0.004, 4, 'paper');
    mb.sphere(0.68, 2.28, 0.68, 0.13, 8, 5, 'q_paint_pink', { sy: 1.15, color: 0xffe0f0 });
    mb.cylinder(0.69, 2.12, 0.69, 0.02, 0.03, 5, 'q_paint_pink');
  },
});
