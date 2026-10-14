// Furniture B — anomalies and portal visuals: the Render Node, a glitching
// monolith, the glowing exit, freestanding doors, stairs into darkness, an
// elevator that should not be here and a hole in the floor.
//
// Portal objects face +z (south) at rot 0: walk toward -z to "use" them.
// staircase_up rises toward -z; staircase_down descends toward -z (painted pit,
// works on any floor); elevator_door is wall-mounted on the north edge.
import { defObj } from '../../world/objects';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { ModelBuilder } from '../../gfx/modelBuilder';
import {
  makeRamp, mixHex, scaleHex, bayer, ph, tileFbm, hashf, text, textC, scribble, fillNoise, rust, chips, stripes,
  grimeBottom, glow, poly, rod, fan, ringBand, rockBlob, gradV, discY,
} from './b_common';

const T = ['setB', 'liminal'];

// ---------------------------------------------------------------------------
// textures
// ---------------------------------------------------------------------------
addTextureModule(() => {
  const A = atlas();

  A.add('q_black_glass', 32, 32, (pc) => {
    const r = makeRamp(0x101418, 5, { spread: 0.5 });
    pc.fillRamp(r, (x, y) => 0.3 + (tileFbm(x, y, 32, 32, 2, 2, 1201) - 0.5) * 0.15, 0.6);
    for (let x = 0; x < 32; x++) for (let y = 0; y < 32; y++) {
      const t = (x + y) % 32;
      if (t < 1) pc.blend(x, y, 0x3a5a66, 0.5); else if (t > 7 && t < 9) pc.blend(x, y, 0x2a3e48, 0.35);
    }
    for (let y = 0; y < 32; y += 4) for (let x = 0; x < 32; x++) pc.blend(x, y, 0x1e2a30, 0.25);
    pc.set(9, 20, 0x40e8ff); pc.set(22, 7, 0x2ab0c8);
  });
  A.add('q_render_core', 16, 48, (pc) => {
    pc.wrap = false;
    for (let y = 0; y < 48; y++) for (let x = 0; x < 16; x++) {
      const d = Math.abs(x + 0.5 - 8) / 8;
      const band = (y % 6 < 1) ? 0.25 : 0;
      const v = 1 - d * 1.1 + band + (ph(x, y, 1211) - 0.5) * 0.2;
      pc.set(x, y, v > 0.85 ? 0xeaffff : v > 0.65 ? 0x8af4ff : v > 0.45 ? 0x30d8f0 : v > 0.25 ? 0x1890b8 : 0x0a3a5a);
    }
    for (let k = 0; k < 18; k++) pc.set(Math.floor(hashf(k, 1, 1212) * 16), Math.floor(hashf(k, 2, 1212) * 48), 0xffffff);
  });
  A.add('q_cyan_strip', 4, 4, (pc) => { pc.fill(0x40e8ff); pc.hline(0, 3, 0, 0xc8faff); pc.hline(0, 3, 3, 0x1aa8c8); });
  A.add('q_node_plate', 16, 6, (pc) => {
    pc.wrap = false;
    pc.fill(0x0c1014); pc.strokeRect(0, 0, 16, 6, 0x1a8aa8);
    text(pc, 'N-07', 1, 0, 0x60f0ff);
  });
  A.add('q_glitch_noise', 24, 32, (pc) => {
    const cols = [0xff3ad8, 0x30f0ff, 0xffffff, 0x8a2aff];
    pc.fill(0x050508);
    // clustered blocks of colour
    for (let y = 0; y < 32; y++) for (let x = 0; x < 24; x++) {
      const bx = Math.floor(x / 3), by = Math.floor(y / 2);
      const h = hashf(bx, by, 1221);
      const n = tileFbm(x, y, 24, 32, 3, 2, 1222);
      if (h > 0.82 && n > 0.45) pc.set(x, y, cols[Math.floor(hashf(bx, by, 1223) * 2)]);
      else if (ph(x, y, 1224) > 0.965) pc.set(x, y, cols[Math.floor(ph(x, y, 1225) * cols.length)]);
    }
    // horizontal tear lines
    for (const y of [5, 17, 26]) for (let x = 0; x < 24; x++) if (ph(x, y, 1226) < 0.6) pc.set(x, y, y === 17 ? 0x30f0ff : 0xff3ad8);
  });
  A.add('q_exit_light', 30, 66, (pc) => {
    pc.wrap = false;
    for (let y = 0; y < 66; y++) for (let x = 0; x < 30; x++) {
      const dx = Math.min(x, 29 - x) / 15, dy = Math.min(y, 65 - y) / 33;
      const e = Math.min(dx * 1.6, dy * 2.4, 1);
      const v = e + (bayer(x, y) - 0.5) * 0.22;
      pc.set(x, y, v > 0.8 ? 0xffffff : v > 0.6 ? 0xeef4ff : v > 0.42 ? 0xd2e2fa : v > 0.24 ? 0xa8c0e8 : 0x7e98c8);
    }
  });
  A.add('q_exit_sign', 17, 7, (pc) => { pc.wrap = false; pc.fill(0x1a9a4a); pc.strokeRect(0, 0, 17, 7, 0x0e6a30); text(pc, 'EXIT', 1, 1, 0xffffff); });
  A.add('q_door_white', 27, 65, (pc, rng) => {
    pc.wrap = false;
    const r = makeRamp(0xd8d2c4, 6, { spread: 0.4 });
    fillNoise(pc, r, 0.62, 0.06, 3, 1231, 0.03);
    pc.bevel(0, 0, 27, 65, r[5], r[1]);
    // four recessed panels with a dark shadow line on the top/left and a bright lip bottom/right
    for (const [x, y, w, h] of [[4, 4, 8, 24], [15, 4, 8, 24], [4, 33, 8, 28], [15, 33, 8, 28]]) {
      pc.rect(x, y, w, h, r[2]);
      pc.bevel(x, y, w, h, r[0], r[5]);
      pc.bevel(x + 1, y + 1, w - 2, h - 2, r[1], r[4]);
      pc.rect(x + 2, y + 2, w - 4, h - 4, r[3]);
    }
    pc.set(13, 20, 0x2a2a2a);
    // grime around the handle side, scuffs at the bottom
    pc.each((x, y) => { if (x > 20 && y > 25 && y < 40 && tileFbm(x, y, 27, 65, 3, 2, 1233) > 0.55 && bayer(x, y) < 0.5) pc.set(x, y, r[1]); });
    grimeBottom(pc, 0x8a8470, 6, 0.6, 1235);
    for (let k = 0; k < 3; k++) { const x = rng.int(2, 24), y = rng.int(55, 62); pc.hline(x, x + 2, y, r[0]); }
  });
  A.add('q_stair_tread', 32, 8, (pc, rng) => {
    pc.wrap = false;
    const r = makeRamp(0x8a8780, 5, { spread: 0.35 });
    pc.fillRamp(r, (x, y) => 0.55 + (ph(x, y, 1241) - 0.5) * 0.3, 1);
    stripes(pc, 0, 6, 32, 2, 0xd8b030, 0x24221e, 6);
    pc.hline(0, 31, 5, r[0]);
    pc.speckle(rng, [r[0]], 0.04);
    for (let x = 6; x < 26; x++) if (ph(x, 2, 1243) < 0.6) pc.set(x, 2 + (x % 3 === 0 ? 1 : 0), r[1]);
  });
  A.add('q_stair_riser', 32, 10, (pc, rng) => {
    pc.wrap = false;
    const r = makeRamp(0x7a7770, 5, { spread: 0.35 });
    pc.fillRamp(r, (x, y) => 0.45 + (ph(x, y, 1245) - 0.5) * 0.3, 1);
    pc.drips(rng, 0x4a4840, 4, 0, 9, 0.35);
    pc.hline(0, 31, 0, r[4]);
  });
  A.add('q_stair_pit', 32, 64, (pc, rng) => {
    pc.wrap = false;
    // painted stairwell descending away from the viewer (+z at the bottom of the image)
    const steps = 9;
    for (let y = 0; y < 64; y++) for (let x = 0; x < 32; x++) {
      const t = 1 - y / 64; // 0 at the near edge (bottom of image), 1 at the far end
      const s = Math.floor(t * steps);
      const local = t * steps - s;
      const dark = Math.min(1, s / (steps - 2));
      const isRiser = local > 0.62;
      const base = isRiser ? 0x5a5852 : 0x8a8780;
      let c = mixHex(base, 0x050508, Math.pow(dark, 0.7));
      if (!isRiser && local < 0.1 && s < 4) c = mixHex(((x >> 2) & 1) ? 0xd8b030 : 0x24221e, 0x050508, dark);
      if (x < 2 || x > 29) c = mixHex(0x6a6862, 0x050508, Math.min(1, dark * 1.3));
      if (ph(x, y, 1251) < 0.15) c = scaleHex(c, 0.85);
      pc.set(x, y, c);
    }
    for (let y = 0; y < 14; y++) for (let x = 0; x < 32; x++) if (bayer(x, y) < (14 - y) / 14) pc.set(x, y, 0x040406);
    pc.speckle(rng, [0x0a0a0e], 0.03);
  });
  A.add('q_elev_doors', 34, 69, (pc, rng) => {
    pc.wrap = false;
    const r = makeRamp(0xa8acae, 6, { spread: 0.35 });
    pc.fillRamp(r, (x, y) => 0.55 + (ph(x, Math.floor(y / 3), 1261) - 0.5) * 0.25 + Math.sin(x * 0.7) * 0.05, 0.7);
    for (let x = 0; x < 34; x++) for (let y = 0; y < 69; y++) { const t = (x * 0.6 + y) % 40; if (t < 3) pc.blend(x, y, 0xf0f4f6, 0.35); }
    pc.vline(16, 0, 68, 0x2a2c2e); pc.vline(17, 0, 68, 0x4a4c4e);
    pc.bevel(0, 0, 34, 69, r[5], r[0]);
    // finger smudges near the seam, a long scratch
    for (let k = 0; k < 6; k++) pc.blend(13 + rng.int(0, 7), 30 + rng.int(0, 10), 0x7a7c7e, 0.4);
    pc.line(4, 12, 11, 40, r[5]);
  });
  A.add('q_elev_frame', 16, 16, (pc) => {
    const r = makeRamp(0x8a8e90, 5, { spread: 0.35 });
    pc.fillRamp(r, (x, y) => 0.55 + (ph(x, Math.floor(y / 2), 1263) - 0.5) * 0.2, 0.7);
  });
  A.add('q_elev_indicator', 24, 6, (pc) => {
    pc.wrap = false;
    pc.fill(0x0a0806);
    text(pc, '1', 1, 0, 0x4a3010); text(pc, '2', 6, 0, 0x4a3010); text(pc, '3', 11, 0, 0x4a3010);
    text(pc, '?', 18, 0, 0xffb030);
    pc.set(16, 2, 0xffb030); pc.set(15, 3, 0xffb030); pc.set(16, 3, 0xffb030); pc.set(17, 3, 0xffb030);
  });
  A.add('q_elev_panel', 6, 12, (pc) => {
    pc.wrap = false;
    pc.fill(0xb8bcbe); pc.bevel(0, 0, 6, 12, 0xe0e4e6, 0x6a6e70);
    pc.circle(3, 4, 1.6, 0x4a4c4e); pc.circle(3, 8, 1.6, 0x4a4c4e);
    pc.set(3, 4, 0xffc040); pc.set(2, 4, 0xffc040);
  });
  A.add('q_hole', 32, 32, (pc) => {
    pc.wrap = false;
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const d = Math.hypot(x + 0.5 - 16, y + 0.5 - 16) / 16;
      const n = tileFbm(x, y, 32, 32, 4, 2, 1271);
      const v = d + (n - 0.5) * 0.25;
      let c: number;
      if (v > 0.92) c = 0x6a6660;
      else if (v > 0.84) c = 0x4a4640;
      else if (v > 0.76) c = (x + y) % 5 === 0 ? 0x7a4426 : 0x2e2a26;
      else if (v > 0.62) c = 0x16140f;
      else c = 0x050506;
      pc.set(x, y, c);
    }
    // faint glint of water far below
    for (const [x, y] of [[14, 15], [15, 15], [17, 16], [13, 17]]) pc.set(x, y, 0x1a3a40);
    pc.set(15, 16, 0x5a8a90);
  });
  A.add('q_rubble', 16, 16, (pc, rng) => {
    const r = makeRamp(0x7c7a74, 5, { spread: 0.4 });
    pc.fillRamp(r, (x, y) => 0.5 + (ph(x, y, 1281) - 0.5) * 0.6, 1);
    pc.speckle(rng, [0x3a3632, 0xb0aca0], 0.06);
  });
  A.add('q_sign_down', 8, 8, (pc) => {
    pc.wrap = false;
    pc.fill(0x1a7a3a);
    pc.vline(4, 1, 5, 0xffffff); pc.vline(3, 1, 5, 0xffffff);
    pc.hline(1, 6, 4, 0xffffff); pc.hline(2, 5, 5, 0xffffff); pc.hline(3, 4, 6, 0xffffff);
  });
});

// ---------------------------------------------------------------------------
// objects
// ---------------------------------------------------------------------------
defObj({
  key: 'render_node', name: 'Render Node', w: 2, d: 2, height: 2.6, block: 'solid', blocksSight: true, tall: true,
  power: true, hum: 'server', sound: 'glass', hp: 99999,
  light: { color: 0x40e8ff, intensity: 0.9, radius: 6, y: 1.5, kind: 'screen', power: true },
  desc: 'A monolithic simulation server of black glass. Its cyan core pulses in time with your heartbeat. Then slightly ahead of it.',
  tags: [...T, 'node', 'mission', 'anomaly', 'server'],
  model: (mb) => {
    mb.box(0, 0, 0, 1.9, 0.14, 1.9, { sides: 'q_steel_dark', top: 'q_black_glass' }, { skip: ['bottom'] });
    for (const s of [-1, 1]) {
      mb.box(0, 0.14, s * 0.94, 1.86, 0.025, 0.02, 'q_cyan_strip', { emissive: 1.5 });
      mb.box(s * 0.94, 0.14, 0, 0.02, 0.025, 1.86, 'q_cyan_strip', { emissive: 1.5 });
    }
    mb.box(0, 0.14, 0, 1.38, 2.28, 1.38, 'q_black_glass');
    // core slots on all four faces + top vent
    mb.box(0, 0.32, 0.692, 0.26, 1.85, 0.012, 'q_render_core', { fit: true, emissive: 1.6 });
    mb.box(0, 0.32, -0.692, 0.26, 1.85, 0.012, 'q_render_core', { fit: true, emissive: 1.6 });
    mb.box(0.692, 0.32, 0, 0.012, 1.85, 0.26, 'q_render_core', { fit: true, emissive: 1.6 });
    mb.box(-0.692, 0.32, 0, 0.012, 1.85, 0.26, 'q_render_core', { fit: true, emissive: 1.6 });
    mb.box(0, 2.42, 0, 0.5, 0.012, 0.5, 'q_render_core', { fit: true, emissive: 1.4 });
    for (const x of [-0.69, 0.69]) for (const z of [-0.69, 0.69]) mb.box(x, 0.14, z, 0.03, 2.28, 0.03, 'q_cyan_strip', { emissive: 0.9 });
    // hovering data fragments
    for (const [x, y, z, s] of [[0.2, 2.7, 0.1, 0.09], [-0.3, 2.85, -0.2, 0.06], [0.45, 3.0, -0.35, 0.05]]) mb.box(x, y, z, s, s, s, 'q_render_core', { fit: true, emissive: 1.5 });
    // floor cables
    const cables: [number, number, number, number][] = [[0.5, 0.95, 0.75, 0.98], [-0.6, 0.95, -0.98, 0.7], [0.95, -0.4, 0.98, -0.9], [-0.95, 0.3, -0.98, 0.95]];
    for (const [x0, z0, x1, z1] of cables) rod(mb, x0, 0.05, z0, x1, 0.04, z1, 0.035, 6, 'plastic_black');
    mb.box(0, 0.03, 0.951, 0.5, 0.09, 0.01, 'q_node_plate', { fit: true, emissive: 0.6 });
  },
});

defObj({
  key: 'glitch_monolith', name: 'Glitch Monolith', w: 1, d: 1, height: 2.5, block: 'solid', tall: true,
  sound: 'glass', hp: 99999,
  light: { color: 0xff40d0, intensity: 0.6, radius: 4, y: 1.4, kind: 'neon', power: false },
  desc: 'A black slab covered in crawling pixels. Looking at it too long makes the walls lag.',
  tags: [...T, 'anomaly', 'glitch'],
  model: (mb) => {
    mb.box(0, 0, 0, 0.9, 0.02, 0.5, 'q_void', { skip: ['bottom'] });
    const slices: [number, number, number, number][] = [[0, 0.5, 0, 0], [0.5, 0.35, 0.06, 0.01], [0.85, 0.5, -0.03, 0], [1.35, 0.18, 0.11, -0.02], [1.53, 0.55, 0.0, 0.02], [2.08, 0.32, -0.07, 0]];
    for (const [y, h, dx, dz] of slices) mb.box(dx, y, dz, 0.68, h, 0.2, 'q_glitch_noise', { emissive: 1.1, uvOffset: [dx * 3, y] });
    for (const [x, y, z, s] of [[0.5, 1.2, 0.2, 0.08], [-0.45, 1.9, -0.1, 0.06], [0.35, 2.55, 0.0, 0.05], [-0.3, 0.6, 0.3, 0.05]]) mb.box(x, y, z, s, s, s, 'q_glitch_noise', { emissive: 1.4, uvOffset: [x, y] });
  },
});

defObj({
  key: 'exit_doorway', name: 'Glowing Doorway', w: 1, d: 1, height: 2.5, block: 'solid', tall: true,
  sound: 'glass', hp: 99999,
  light: { color: 0xf4f8ff, intensity: 1.3, radius: 6, y: 1.2, kind: 'lamp', power: false },
  desc: 'A doorframe standing alone, full of white light. It feels like the way out. It feels like a test.',
  tags: [...T, 'portal', 'mission', 'exit'],
  model: (mb) => {
    const F = 'q_steel_dark';
    for (const x of [-0.5, 0.5]) mb.box(x, 0, 0, 0.1, 2.24, 0.2, F, { skip: ['bottom'] });
    mb.box(0, 2.22, 0, 1.1, 0.12, 0.2, F);
    mb.box(0, 0, 0, 1.0, 0.025, 0.22, 'metal_dark');
    mb.box(0, 0.025, 0, 0.9, 2.2, 0.03, 'q_exit_light', { fit: true, emissive: 1.1 });
    mb.box(0, 2.4, 0, 0.38, 0.15, 0.06, { south: 'q_exit_sign', north: 'q_exit_sign', sides: 'q_steel_dark' }, { fit: { south: true, north: true }, emissive: 1.1 });
    rod(mb, 0, 2.32, 0, 0, 2.4, 0, 0.01, 4, 'metal_dark');
  },
});

defObj({
  key: 'door_freestanding', name: 'Freestanding Door', w: 1, d: 1, height: 2.25, block: 'solid', tall: true,
  sound: 'wood', hp: 99999,
  desc: 'A door in its frame, standing alone. Light leaks from under it. Walking around it shows nothing behind.',
  tags: [...T, 'portal', 'door'],
  model: (mb) => {
    const F = 'q_paint_white';
    for (const x of [-0.47, 0.47]) mb.box(x, 0, 0, 0.08, 2.14, 0.16, F, { skip: ['bottom'] });
    mb.box(0, 2.12, 0, 1.03, 0.1, 0.16, F);
    mb.box(0, 0, 0, 0.94, 0.015, 0.18, 'wood_dark');
    // dark reveal between leaf and frame
    mb.box(0, 0.02, 0, 0.87, 2.1, 0.03, 'q_void');
    mb.box(0, 0.025, 0, 0.84, 2.06, 0.05, { south: 'q_door_white', north: 'q_door_white', sides: 'q_steel_cream', top: 'q_steel_cream' }, { fit: { south: true, north: true } });
    for (const z of [0.035, -0.035]) { mb.sphere(0.34, 1.0, z, 0.03, 6, 4, 'metal_brass'); }
    mb.box(0.34, 0.98, 0, 0.05, 0.08, 0.06, 'metal_brass');
    for (const y of [0.25, 1.05, 1.85]) mb.box(-0.44, y, 0.0, 0.025, 0.1, 0.05, 'metal_brass');
    // light leaking under the door, both sides
    for (const s of [-1, 1]) mb.box(0, 0.016, s * 0.06, 0.8, 0.01, 0.08, 'q_exit_light', { emissive: 1.5, color: 0xfff2d8 });
  },
});

defObj({
  key: 'staircase_up', name: 'Stairs Up', w: 1, d: 2, height: 2.7, block: 'solid', tall: true,
  sound: 'metal', hp: 99999,
  desc: 'Concrete stairs climbing into a darkness the lights do not reach.',
  tags: [...T, 'portal', 'stairs'],
  model: (mb) => {
    const n = 8, rise = 0.3, run = 0.24, z0 = 0.96;
    for (let i = 0; i < n; i++) {
      const k = Math.max(0.05, 1 - Math.max(0, i - 2) / (n - 2.5));
      const c = Math.round(255 * k);
      const col = (c << 16) | (c << 8) | c;
      const zc = z0 - (i + 0.5) * run;
      mb.box(0, 0, zc, 0.92, (i + 1) * rise, run, { top: 'q_stair_tread', south: 'q_stair_riser', sides: 'concrete' }, { fit: { top: true, south: true }, color: col, skip: ['bottom'], uvOffset: [0, -i * rise] });
    }
    // sloped stringers along the lower flight, a full-height mouth over the top
    // flight, a header and the dark void the stairs vanish into
    for (const s of [-1, 1]) {
      mb.wedge(s * 0.5, 0, 0.28, 0.07, 1.36, 2.3, 0.6, 'concrete');
      mb.box(s * 0.5, 0, -0.7, 0.07, 2.7, 0.6, 'concrete', { skip: ['bottom'], color: 0x8a8a8a });
    }
    mb.box(0, 2.3, -0.43, 1.07, 0.4, 0.1, 'concrete', { color: 0x8a8a8a });
    mb.box(0, 0.0, -0.98, 0.93, 2.7, 0.04, 'q_void');
    mb.box(0, 2.42, -0.7, 0.93, 0.28, 0.6, 'q_void', { skip: ['bottom'] });
    // handrail
    for (let i = 0; i < 3; i++) rod(mb, 0.42, 0.9 + i * 0.6, 0.85 - i * 0.48, 0.42, 1.5 + i * 0.6, 0.37 - i * 0.48, 0.02, 6, 'q_paint_yellow');
    rod(mb, 0.42, 0.0, 0.88, 0.42, 0.9, 0.85, 0.02, 6, 'q_paint_yellow');
  },
});

defObj({
  key: 'staircase_down', name: 'Stairs Down', w: 1, d: 2, height: 1.05, block: 'low',
  sound: 'metal', hp: 99999,
  desc: 'A stairwell dropping away into the dark. Counting the steps gives a different number each time.',
  tags: [...T, 'portal', 'stairs'],
  model: (mb) => {
    // painted pit (works on any floor) + concrete curb, rails and nosing
    mb.box(0, 0, -0.02, 0.86, 0.008, 1.9, { top: 'q_stair_pit', sides: 'q_void' }, { fit: { top: true } });
    for (const s of [-1, 1]) mb.box(s * 0.47, 0, -0.02, 0.07, 0.12, 1.96, 'concrete', { skip: ['bottom'] });
    mb.box(0, 0, -0.98, 1.01, 0.12, 0.06, 'concrete', { skip: ['bottom'] });
    mb.box(0, 0, 0.94, 0.86, 0.02, 0.06, 'q_hazard');
    for (const s of [-1, 1]) {
      for (const z of [0.85, 0.0, -0.9]) rod(mb, s * 0.47, 0.12, z, s * 0.47, 1.02, z, 0.02, 6, 'q_paint_yellow');
      rod(mb, s * 0.47, 1.02, 0.85, s * 0.47, 1.02, -0.9, 0.022, 6, 'q_paint_yellow');
    }
    rod(mb, -0.47, 1.02, -0.9, 0.47, 1.02, -0.9, 0.022, 6, 'q_paint_yellow');
    mb.box(0.47, 0.75, 0.6, 0.012, 0.22, 0.22, { east: 'q_sign_down', west: 'q_sign_down', sides: 'metal_grey' }, { fit: { east: true, west: true } });
  },
});

defObj({
  key: 'elevator_door', name: 'Elevator', w: 1, d: 1, height: 2.6, block: 'none', onWall: true,
  power: true, sound: 'metal', hp: 99999,
  desc: 'Brushed steel doors. The indicator shows floors 1, 2, 3 and one more that has no number.',
  tags: [...T, 'portal', 'elevator'],
  model: (mb) => {
    const z = -0.45;
    for (const x of [-0.56, 0.56]) mb.box(x, 0, z, 0.1, 2.38, 0.1, 'q_elev_frame', { skip: ['bottom'] });
    mb.box(0, 2.22, z, 1.22, 0.16, 0.1, 'q_elev_frame');
    mb.box(0, 0.0, z + 0.01, 1.02, 2.2, 0.03, 'q_elev_doors', { fit: { south: true } });
    mb.box(0, 0, z + 0.07, 1.04, 0.012, 0.14, 'metal_brushed');
    mb.box(0, 2.42, z + 0.01, 0.62, 0.18, 0.04, { south: 'q_elev_indicator', sides: 'metal_dark' }, { fit: { south: true }, emissive: 1.0 });
    mb.box(0.78, 1.0, -0.425, 0.11, 0.24, 0.03, { south: 'q_elev_panel', sides: 'metal_brushed' }, { fit: { south: true } });
    mb.box(0.78, 1.07, -0.405, 0.04, 0.04, 0.012, 'plastic_yellow', { emissive: 1.2 });
  },
});

defObj({
  key: 'hole_floor', name: 'Hole in the Floor', w: 1, d: 1, height: 0.12, block: 'none',
  sound: 'ceramic', hp: 99999,
  desc: 'The floor simply ends here. Far below, water catches a light that is not yours.',
  tags: [...T, 'portal', 'hole'],
  model: (mb) => {
    const n = 16;
    const inner: [number, number][] = [], outer: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = 0.3 + hashf(i, 1, 1291) * 0.12 + (i % 2 ? 0.04 : 0);
      inner.push([Math.cos(a) * r, Math.sin(a) * r]);
      const ro = r + 0.06 + hashf(i, 2, 1291) * 0.06;
      outer.push([Math.cos(a) * ro, Math.sin(a) * ro]);
    }
    fan(mb, 0, 0.01, 0, inner, 'q_hole', { fitR: 0.46 });
    ringBand(mb, 0.012, outer, inner, 'q_rubble', { color: 0x9a968c });
    // broken chunks and rebar
    for (let k = 0; k < 6; k++) {
      const [x, z] = outer[(k * 3) % n];
      rockBlob(mb, x * 1.05, 0, z * 1.05, 0.05 + hashf(k, 3, 1291) * 0.04, 0.05 + hashf(k, 4, 1291) * 0.05, 0.05, 1300 + k, 'q_rubble', 5, 3);
    }
    rod(mb, 0.38, 0.03, 0.12, 0.18, 0.06, 0.05, 0.008, 4, 'q_pipe_rust');
    rod(mb, 0.18, 0.06, 0.05, 0.12, -0.05, 0.02, 0.008, 4, 'q_pipe_rust');
    rod(mb, -0.3, 0.03, -0.3, -0.15, 0.04, -0.12, 0.008, 4, 'q_pipe_rust');
  },
});
