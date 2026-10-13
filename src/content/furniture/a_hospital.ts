// Furniture A — hospital & clinic.
import { defObj } from '../../world/objects';
import {
  atlas, addTextureModule, PixelCanvas, makeRamp, mixHex, scaleHex, ph, tileFbm, WZ,
  txt, txtC, scribble, fillR, crtGlass, caster, hbar, knob, crtMonitor, papers, mug, bookRow,
} from './a_lib';
import type { ModelBuilder } from './a_lib';

const T = (...t: string[]) => ['setA', ...t];
const on = (s: any) => !(s.on === false || s.broken || s.unpowered);
const WZ2 = WZ - 0.5;

// ============================================================ textures
/** a row of medicine on a shelf: boxes and pill bottles (tileable horizontally) */
function pharmaRow(pc: PixelCanvas, seed: number) {
  pc.rect(0, 0, pc.w, pc.h, 0x2a2c30);
  let x = 0, k = 0;
  while (x < pc.w) {
    const r = ph(k, seed, 3);
    if (r < 0.45) { // pill bottle
      const amber = ph(k, seed, 5) < 0.6;
      const bw = 2, bh = 4 + Math.floor(ph(k, seed, 7) * 2);
      for (let i = 0; i < bw; i++) for (let j = pc.h - bh; j < pc.h; j++) pc.set(x + i, j, amber ? (i === 0 ? 0xd88a3a : 0xb86a2a) : (i === 0 ? 0xf0f0ec : 0xc8c8c4));
      for (let i = 0; i < bw; i++) pc.set(x + i, pc.h - bh - 1, 0xf4f4f0);
      pc.set(x, pc.h - 2, 0xf4f0e0);
      x += bw + 1;
    } else if (r < 0.9) { // carton
      const bw = 3 + Math.floor(ph(k, seed, 9) * 3), bh = 4 + Math.floor(ph(k, seed, 11) * 4);
      const stripe = [0x3a6ab0, 0xc03a3a, 0x3a9a5a, 0xe0a030, 0x8a4ab0][Math.floor(ph(k, seed, 13) * 5)];
      for (let i = 0; i < bw && x + i < pc.w; i++) for (let j = pc.h - bh; j < pc.h; j++) pc.set(x + i, j, i === bw - 1 ? 0xc8c8c4 : 0xeeeeea);
      for (let i = 0; i < bw - 1 && x + i < pc.w; i++) pc.set(x + i, pc.h - bh + 1, stripe);
      if (bh > 5) pc.set(x + 1, pc.h - 2, stripe);
      x += bw;
    } else x += 2; // gap
    k++;
  }
}

addTextureModule(() => {
  const A = atlas();
  A.add('p_ecg', 14, 10, (pc) => {
    pc.wrap = false;
    pc.fill(0x050a08);
    // waveform with one strange double beat
    const ys = [6, 6, 6, 5, 6, 2, 8, 6, 6, 5, 2, 9, 6, 6];
    for (let x = 0; x < 11; x++) pc.line(x, ys[x], x + 1, ys[x + 1], 0x40f070);
    for (let x = 0; x < 11; x++) pc.set(x, 9, x % 2 ? 0x204a30 : 0x102a18);
    txt(pc, '7', 11, 1, 0x40f070, 0); pc.set(13, 2, 0x40f070); pc.set(13, 4, 0x40f070);
    pc.rect(11, 6, 3, 2, 0x10202a); pc.set(11, 6, 0x40d0f0); pc.set(13, 7, 0x40d0f0);
    pc.set(12, 9, 0xf04040);
    crtGlass(pc, 0, 0, 14, 10, 0x020403, 0.4);
  });
  A.add('p_xray', 30, 19, (pc) => {
    pc.wrap = false;
    pc.fill(0xe8f0f4);
    // left film: chest
    fillR(pc, 1, 1, 14, 17, [0x101820, 0x1a2630, 0x24343e], (x, y) => 0.5 + (ph(x, y, 3) - 0.5) * 0.3, 1);
    for (let r = 0; r < 6; r++) {
      for (let x = 2; x < 14; x++) {
        const d = Math.abs(x - 7.5);
        const y = 4 + r * 2 + Math.round(d * d * 0.05);
        if (d > 1) pc.set(x, y, mixHex(0xc8d4dc, 0x24343e, d / 10));
      }
    }
    pc.vline(7, 2, 16, 0xb8c4cc); pc.vline(8, 2, 16, 0x8a98a4);
    pc.ellipse(9.5, 11, 2, 2.5, 0x5a6a74);
    // right film: a hand with six fingers
    fillR(pc, 15, 1, 14, 17, [0x101820, 0x1a2630, 0x24343e], (x, y) => 0.5 + (ph(x, y, 5) - 0.5) * 0.3, 1);
    pc.rect(19, 10, 6, 6, 0x9aa8b0); pc.rect(20, 11, 4, 4, 0xb8c4cc);
    for (let f = 0; f < 6; f++) { const fx = 18 + f * 1.4; pc.vline(Math.round(fx), 4 + (f === 0 || f === 5 ? 2 : 0), 9, 0xc8d4dc); pc.set(Math.round(fx), 6, 0x5a6a74); }
    pc.line(25, 12, 27, 9, 0xc8d4dc);
    pc.vline(21, 16, 17, 0xa8b4bc); pc.vline(23, 16, 17, 0xa8b4bc);
    pc.rect(2, 1, 3, 1, 0xf0f0f0); pc.rect(16, 1, 3, 1, 0xf0f0f0);
  });
  A.add('p_morgue_door', 14, 14, (pc) => {
    pc.wrap = false;
    const S = makeRamp(0xb4bcc0, 5, { spread: 0.35 });
    fillR(pc, 0, 0, 14, 14, S, (x, y) => 0.55 + (x - 7) * 0.012 + Math.sin(x * 1.3) * 0.05 + (ph(x, y, 9) - 0.5) * 0.05, 1);
    pc.hline(0, 13, 0, S[4]); pc.vline(0, 0, 13, S[4]); pc.hline(0, 13, 13, S[0]); pc.vline(13, 0, 13, S[1]);
    pc.rect(4, 2, 6, 3, 0xf0ece0); pc.strokeRect(3, 1, 8, 5, S[1]); scribble(pc, 5, 3, 4, 1, 0x3a3a3a, 3);
  });
  A.add('p_morgue_door_b', 14, 14, (pc) => {
    pc.wrap = false;
    const S = makeRamp(0xb4bcc0, 5, { spread: 0.35 });
    fillR(pc, 0, 0, 14, 14, S, (x, y) => 0.55 + (x - 7) * 0.012 + Math.sin(x * 1.3) * 0.05 + (ph(x, y, 11) - 0.5) * 0.05, 1);
    pc.hline(0, 13, 0, S[4]); pc.vline(0, 0, 13, S[4]); pc.hline(0, 13, 13, S[0]); pc.vline(13, 0, 13, S[1]);
    pc.strokeRect(3, 1, 8, 5, S[1]); // empty card holder
  });
  A.add('p_med_glass', 13, 18, (pc) => {
    pc.wrap = false;
    pc.fill(0xd8e4e8);
    for (let r = 0; r < 3; r++) {
      const y = 1 + r * 6;
      for (let x = 1; x < 12; x++) { const k = Math.floor(ph(Math.floor(x / 2), r, 5) * 4); const h = 2 + (k % 2); for (let j = 0; j < h; j++) pc.set(x, y + 4 - j, [0xb86a2a, 0xf0f0ec, 0x5a8ac8, 0x8ab06a][k]); }
      pc.hline(0, 12, y + 5, 0x9aa4a8);
    }
    for (let i = 0; i < 16; i++) pc.blend(i * 0.6 + 2, 17 - i, 0xffffff, 0.35);
    pc.strokeRect(0, 0, 13, 18, 0xa8b0b4);
  });
  A.add('p_red_cross', 6, 6, (pc) => {
    pc.wrap = false; pc.fill(0xf4f4f0); pc.rect(2, 1, 2, 4, 0xd02a2a); pc.rect(1, 2, 4, 2, 0xd02a2a);
  });
  A.add('p_curtain_hosp', 16, 32, (pc) => {
    const R = makeRamp(0xa8d0c8, 5, { spread: 0.3 });
    pc.fillRamp(R, (x, y) => 0.55 + Math.sin(x / 16 * Math.PI * 6) * 0.28 + (ph(x, y, 4) - 0.5) * 0.05, 0.6);
    for (let y = 0; y < 32; y += 4) for (let x = (y % 8) / 2; x < 16; x += 4) pc.blend(x, y, 0xffffff, 0.3);
  });
  A.add('p_curtain_mesh', 16, 6, (pc) => {
    pc.fill(0xd8e8e4);
    pc.each((x, y) => { if ((x + y) % 2 === 0) pc.set(x, y, 0x6a7a78); });
  });
  A.add('p_iv_bag', 6, 9, (pc) => {
    pc.wrap = false;
    pc.fill(0xd8ecf0); pc.rect(0, 0, 6, 3, 0xe8f4f6);
    pc.rect(1, 4, 4, 3, 0xf4f4f0); scribble(pc, 1, 5, 4, 1, 0x3a5aa0, 2);
    pc.vline(0, 0, 8, 0xb8ccd0); pc.set(2, 8, 0xa8bcc0); pc.set(3, 8, 0xa8bcc0);
  });
  A.add('p_wheel', 12, 12, (pc) => {
    pc.wrap = false;
    pc.fill(0x1a1a1c);
    pc.circle(6, 6, 5.2, 0x8a8e92); pc.circle(6, 6, 4.3, 0x2a2c30);
    for (let a = 0; a < 8; a++) pc.line(6, 6, 6 + Math.cos(a * Math.PI / 4) * 4, 6 + Math.sin(a * Math.PI / 4) * 4, 0xb8bcc0);
    pc.circle(6, 6, 1.2, 0xd0d4d8);
  });
  A.add('p_surg_light', 12, 12, (pc) => {
    pc.wrap = false;
    pc.fill(0xd8dcdc);
    for (let r = 0; r < 3; r++) for (let a = 0; a < 6 + r * 2; a++) {
      const an = a / (6 + r * 2) * Math.PI * 2;
      pc.set(6 + Math.cos(an) * (1.5 + r * 1.6), 6 + Math.sin(an) * (1.5 + r * 1.6), 0xfffef0);
    }
    pc.circle(6, 6, 1, 0xa8acac);
  });
  A.add('p_nurse_sign', 22, 7, (pc) => {
    pc.wrap = false;
    pc.fill(0x2a7a8a); pc.hline(0, 21, 0, 0x4a9aaa); pc.hline(0, 21, 6, 0x1a5a6a);
    txtC(pc, 'NURSES', 11, 1, 0xf0f8f8);
  });
  A.add('p_pharma_a', 32, 10, (pc) => pharmaRow(pc, 31));
  A.add('p_pharma_b', 32, 10, (pc) => pharmaRow(pc, 57));
  A.add('p_chart', 6, 8, (pc) => {
    pc.wrap = false;
    pc.fill(0x8a6a40); pc.rect(1, 1, 4, 7, 0xf4f0e4); pc.hline(2, 3, 0, 0xc0c4c8);
    scribble(pc, 1, 3, 4, 3, 0x3a3a6a, 9, 1);
  });
  A.add('p_rx', 8, 6, (pc) => {
    pc.wrap = false; pc.fill(0x2a6ab0); txt(pc, 'RX', 1, 0, 0xf0f4f8);
  });
});

// ============================================================ helpers
function starBase(mb: ModelBuilder, r: number, legs = 5, tex = 'metal_grey') {
  for (let i = 0; i < legs; i++) {
    const a = (i / legs) * Math.PI * 2 + 0.3;
    mb.push().rotateY(a); mb.box(r / 2, 0.04, 0, r, 0.03, 0.035, tex); mb.pop();
    caster(mb, Math.cos(a) * r, -Math.sin(a) * r, 0.025);
  }
  mb.cylinder(0, 0.03, 0, 0.04, 0.05, 6, tex);
}

// ============================================================ models
defObj({
  key: 'bed_hospital', name: 'Hospital Bed', w: 1, d: 2, height: 1.05, block: 'low', sleep: 0.7, sit: true, movable: 70,
  sound: 'metal', flammable: 0.4,
  disassemble: { tools: ['#wrench', '#screwdriver'], time: 35, skill: 'mechanics', yields: [['scrap_metal', 3, 6], ['pipe', 1, 3], ['electronics_scrap', 0, 2], ['rag', 2, 3]] },
  tags: T('hospital', 'bed', 'sleep'),
  model: (mb) => {
    const W = 0.92, z0 = WZ2 + 0.04, z1 = z0 + 1.96, zc = (z0 + z1) / 2, m = 'metal_grey', mc = { color: 0xd0d4d8 };
    for (const sx of [-1, 1]) for (const z of [z0 + 0.12, z1 - 0.12]) { mb.box(sx * 0.36, 0.06, z, 0.04, 0.32, 0.04, m, mc); caster(mb, sx * 0.36, z, 0.04); }
    mb.box(0, 0.36, zc, W - 0.08, 0.08, z1 - z0 - 0.1, m, mc);
    mb.box(0, 0.3, zc, 0.12, 0.06, 1.2, 'metal_dark');
    // head & foot panels
    mb.box(0, 0.36, z0 + 0.02, W, 0.62, 0.04, 'plastic_beige', { color: 0xe8e4dc });
    mb.box(0, 0.36, z1 - 0.02, W, 0.42, 0.04, 'plastic_beige', { color: 0xe8e4dc });
    mb.box(0, 0.6, z1 + 0.005, 0.16, 0.2, 0.012, 'p_chart', { fit: true });
    // mattress: raised head section + flat rest
    mb.box(0, 0.44, zc + 0.3, W - 0.1, 0.14, 1.25, 'mattress', { color: 0xd8e8f0 });
    mb.push().translate(0, 0.46, z0 + 0.66).rotateX(0.5);
    mb.box(0, 0, -0.29, W - 0.1, 0.14, 0.62, 'mattress', { color: 0xd8e8f0 });
    mb.box(0, 0.14, -0.38, W - 0.3, 0.1, 0.32, 'pillow'); mb.pop();
    mb.box(0, 0.58, zc + 0.55, W - 0.08, 0.04, 0.65, 'pillow', { color: 0xc8dce8 });
    // side rails (one raised, one lowered) + call pendant
    mb.box(W / 2 + 0.01, 0.62, zc - 0.25, 0.03, 0.04, 0.8, m, mc);
    for (const z of [zc - 0.6, zc + 0.1]) mb.box(W / 2 + 0.01, 0.44, z, 0.03, 0.2, 0.03, m, mc);
    mb.box(-W / 2 - 0.01, 0.42, zc - 0.25, 0.03, 0.04, 0.8, m, mc);
    mb.box(W / 2 + 0.03, 0.46, zc + 0.2, 0.03, 0.12, 0.05, 'plastic_beige');
    mb.box(W / 2 + 0.03, 0.58, zc + 0.2, 0.006, 0.06, 0.006, 'plastic_black');
  },
});

defObj({
  key: 'iv_stand', name: 'IV Stand', height: 2.0, block: 'low', movable: 6, tall: true,
  sound: 'metal', flammable: 0,
  disassemble: { tools: [], time: 5, yields: [['pipe', 1, 1], ['scrap_metal', 1, 1]] },
  tags: T('hospital', 'medical'),
  model: (mb) => {
    starBase(mb, 0.26);
    mb.cylinder(0, 0.06, 0, 0.014, 1.88, 6, 'chrome');
    mb.box(0, 1.9, 0, 0.32, 0.015, 0.015, 'chrome');
    for (const sx of [-0.15, 0.15]) mb.box(sx, 1.86, 0, 0.012, 0.05, 0.012, 'chrome');
    mb.box(-0.15, 1.6, 0, 0.13, 0.26, 0.05, 'p_iv_bag', { fit: true, emissive: 0.05 });
    mb.cylinder(-0.15, 1.5, 0, 0.012, 0.1, 6, 'glass', { color: 0xd8f0f4 });
    mb.box(-0.15, 0.95, 0.0, 0.006, 0.55, 0.006, 'plastic_white', { color: 0xe8f4f8 });
    mb.push().translate(-0.15, 0.95, 0).rotateZ(-0.9); mb.box(0, -0.25, 0, 0.006, 0.25, 0.006, 'plastic_white'); mb.pop();
    mb.box(0.03, 1.1, 0, 0.08, 0.1, 0.06, 'plastic_white', { color: 0xd8d8d0 });
  },
});

defObj({
  key: 'gurney', name: 'Gurney', w: 1, d: 2, height: 0.95, block: 'low', sleep: 0.3, movable: 40,
  sound: 'metal', flammable: 0.2,
  disassemble: { tools: ['#wrench'], time: 20, skill: 'mechanics', yields: [['scrap_metal', 2, 4], ['pipe', 1, 2], ['rag', 1, 2]] },
  tags: T('hospital', 'medical'),
  variant: (s) => 'v' + ((s.v ?? 0) % 2),
  model: (mb, s) => {
    const z0 = -0.92, z1 = 0.92, m = 'chrome';
    for (const sz of [z0 + 0.15, z1 - 0.15]) {
      for (const sx of [-0.24, 0.24]) { mb.box(sx, 0.07, sz, 0.035, 0.68, 0.035, m); caster(mb, sx, sz, 0.045); }
      mb.box(0, 0.25, sz, 0.48, 0.03, 0.03, m);
    }
    mb.box(0, 0.28, 0, 0.44, 0.02, 1.4, 'metal_grey');
    mb.box(0, 0.75, 0, 0.6, 0.04, z1 - z0, m);
    mb.box(0, 0.79, 0, 0.56, 0.08, z1 - z0 - 0.04, 'mattress', { color: 0xc8dce0 });
    for (const sx of [-0.31, 0.31]) mb.box(sx, 0.82, 0, 0.025, 0.025, 1.3, m);
    for (const z of [z0 + 0.02, z1 - 0.02]) mb.box(0, 0.8, z, 0.5, 0.25, 0.025, m);
    if ((s.v ?? 0) % 2 === 1) {
      // something under the sheet
      mb.box(0, 0.87, 0.1, 0.4, 0.12, 1.3, 'pillow', { color: 0xf0f0ec });
      mb.sphere(0, 0.93, -0.6, 0.12, 7, 4, 'pillow', { sy: 0.8, color: 0xf0f0ec });
      mb.box(0, 0.87, -0.1, 0.56, 0.04, 1.75, 'pillow', { color: 0xf4f4f0 });
      mb.box(0.12, 0.98, 0.72, 0.08, 0.06, 0.1, 'pillow', { color: 0xf0f0ec });
      mb.box(-0.12, 0.98, 0.72, 0.08, 0.06, 0.1, 'pillow', { color: 0xf0f0ec });
    } else {
      mb.box(0, 0.87, -0.68, 0.36, 0.08, 0.24, 'pillow');
      mb.box(0, 0.87, 0.5, 0.5, 0.06, 0.36, 'fabric_blue', { color: 0xb8c8e8 });
    }
  },
});

defObj({
  key: 'wheelchair', name: 'Wheelchair', height: 0.95, block: 'low', sit: true, movable: 15,
  sound: 'metal', flammable: 0.2,
  disassemble: { tools: ['#wrench'], time: 15, skill: 'mechanics', yields: [['pipe', 1, 3], ['scrap_metal', 1, 3], ['rag', 1, 1]] },
  tags: T('hospital', 'sit', 'chair', 'medical'),
  model: (mb) => {
    const m = 'chrome';
    for (const sx of [-1, 1]) {
      mb.cylinderX(sx * 0.29, 0.3, -0.08, 0.3, 0.035, 12, { sides: 'rubber_black', top: 'p_wheel', bottom: 'p_wheel' }, { fit: true });
      mb.cylinderX(sx * 0.315, 0.3, -0.08, 0.27, 0.012, 12, m, { caps: false });
      mb.box(sx * 0.22, 0.02, 0.24, 0.025, 0.12, 0.025, m);
      mb.cylinderX(sx * 0.22, 0.06, 0.26, 0.06, 0.025, 8, 'rubber_black');
      mb.box(sx * 0.22, 0.12, 0.08, 0.03, 0.4, 0.03, m);
      mb.box(sx * 0.22, 0.48, -0.02, 0.03, 0.03, 0.5, m);
      mb.box(sx * 0.22, 0.5, -0.24, 0.03, 0.46, 0.03, m);
      mb.box(sx * 0.22, 0.9, -0.3, 0.035, 0.03, 0.14, 'rubber_black');
      mb.box(sx * 0.22, 0.66, -0.0, 0.05, 0.03, 0.34, 'leather_black');
      mb.box(sx * 0.22, 0.5, 0.0, 0.03, 0.16, 0.03, m);
      mb.push().translate(sx * 0.13, 0.12, 0.32).rotateX(0.3); mb.box(0, 0, 0, 0.13, 0.015, 0.12, 'plastic_black'); mb.pop();
      mb.box(sx * 0.13, 0.13, 0.27, 0.025, 0.36, 0.025, m);
    }
    mb.box(0, 0.47, 0.0, 0.42, 0.025, 0.42, 'leather_black');
    mb.box(0, 0.52, -0.24, 0.42, 0.36, 0.02, 'leather_black');
  },
});

defObj({
  key: 'curtain_screen', name: 'Privacy Curtain', height: 1.85, block: 'solid', blocksSight: true, movable: 10,
  sound: 'fabric', flammable: 0.7,
  disassemble: { tools: [], time: 6, yields: [['pipe', 1, 2], ['rag', 2, 4]] },
  tags: T('hospital', 'curtain'),
  model: (mb) => {
    const m = 'chrome';
    for (const sx of [-0.47, 0.47]) {
      mb.box(sx, 0.06, 0, 0.03, 1.78, 0.03, m);
      mb.box(sx, 0.03, 0, 0.04, 0.03, 0.4, m);
      caster(mb, sx, -0.18, 0.03); caster(mb, sx, 0.18, 0.03);
    }
    mb.box(0, 1.82, 0, 0.98, 0.03, 0.03, m);
    for (let i = 0; i < 9; i++) {
      const x = -0.42 + i * 0.105, z = (i % 2 ? 0.025 : -0.02);
      mb.box(x, 0.2, z, 0.11, 1.42, 0.02, 'p_curtain_hosp', { uvOffset: [i * 0.11, 0] });
      mb.box(x, 1.62, z, 0.11, 0.18, 0.02, 'p_curtain_mesh');
    }
  },
});

defObj({
  key: 'medical_cabinet', name: 'Medical Cabinet', height: 1.95, block: 'solid', blocksSight: true, movable: 50,
  container: { capacity: 30, kind: 'medical', loot: 'hospital_cabinet', lockable: true }, sound: 'metal', flammable: 0,
  disassemble: { tools: ['#screwdriver'], time: 25, skill: 'mechanics', yields: [['sheet_metal', 2, 3], ['glass_shard', 1, 3], ['screws', 2, 6]] },
  tags: T('hospital', 'cabinet', 'medical'),
  model: (mb) => {
    const W = 0.9, D = 0.44, zc = WZ + D / 2 + 0.01, zf = zc + D / 2, wh = { color: 0xeef0f0 };
    mb.box(0, 0, zc, W - 0.04, 0.08, D - 0.04, 'metal_dark');
    mb.box(0, 0.08, zc, W, 1.84, D, 'p_steel', wh);
    for (const sx of [-1, 1]) {
      const cx = sx * (W / 4 - 0.005);
      mb.box(cx, 1.0, zf + 0.008, W / 2 - 0.02, 0.86, 0.016, { south: 'p_med_glass', all: 'p_steel' }, { fit: { south: true } });
      mb.box(cx, 0.12, zf + 0.008, W / 2 - 0.02, 0.84, 0.016, 'p_steel', { color: 0xe4e6e6 });
      mb.box(sx * 0.03, 0.85, zf + 0.03, 0.02, 0.14, 0.025, 'chrome');
    }
    mb.box(-W / 4, 0.55, zf + 0.018, 0.16, 0.16, 0.004, 'p_red_cross', { fit: true });
    mb.box(0.02, 0.92, zf + 0.035, 0.05, 0.06, 0.02, 'metal_brass');
  },
});

defObj({
  key: 'operating_table', name: 'Operating Table', w: 1, d: 2, height: 1.0, block: 'table', surface: 0.95, movable: 0,
  sound: 'metal', flammable: 0.1,
  disassemble: { tools: ['#wrench', '#screwdriver'], time: 40, skill: 'mechanics', yields: [['scrap_metal', 3, 6], ['electronics_scrap', 1, 2], ['pipe', 1, 2]] },
  tags: T('hospital', 'medical', 'table'),
  model: (mb) => {
    mb.box(0, 0, 0.1, 0.5, 0.06, 0.9, 'metal_brushed');
    mb.box(0, 0.06, 0.1, 0.24, 0.64, 0.3, 'plastic_white', { color: 0xd8dce0 });
    mb.box(0, 0.7, 0, 0.5, 0.08, 1.4, 'metal_brushed');
    mb.box(0, 0.78, 0.15, 0.52, 0.08, 1.2, 'leather_black', { color: 0x4a5a6a });
    mb.box(0, 0.78, -0.62, 0.36, 0.07, 0.32, 'leather_black', { color: 0x4a5a6a });
    for (const sx of [-1, 1]) {
      mb.push().translate(sx * 0.26, 0.8, -0.25).rotateY(sx * 0.35);
      mb.box(sx * 0.25, 0, 0, 0.5, 0.05, 0.12, 'leather_black', { color: 0x4a5a6a }); mb.pop();
      mb.box(sx * 0.27, 0.72, 0.15, 0.02, 0.04, 1.2, 'chrome');
    }
    // restraint straps that seem unnecessary
    for (const z of [0.1, 0.55]) mb.box(0, 0.86, z, 0.56, 0.012, 0.06, 'leather_brown');
    mb.box(0.12, 0.0, 0.62, 0.16, 0.05, 0.12, 'plastic_black');
  },
});

defObj({
  key: 'surgical_light', name: 'Surgical Lamp', height: 2.2, block: 'low', tall: true, movable: 30, power: true,
  light: { color: 0xeef6ff, intensity: 1.1, radius: 3.2, y: 1.8, kind: 'lamp', power: true },
  sound: 'metal', flammable: 0,
  disassemble: { tools: ['#screwdriver'], time: 20, skill: 'electrical', yields: [['electronics_scrap', 1, 3], ['scrap_metal', 2, 3], ['wire', 1, 2], ['glass_shard', 1, 2]] },
  tags: T('hospital', 'light', 'medical'),
  variant: (s) => (on(s) ? 'on' : 'off'),
  model: (mb, s) => {
    starBase(mb, 0.32, 5, 'metal_brushed');
    mb.cylinder(0, 0.06, -0.15, 0.03, 1.8, 6, 'metal_brushed');
    mb.box(0, 1.84, -0.03, 0.06, 0.06, 0.32, 'plastic_white');
    mb.push().translate(0, 1.84, 0.18).rotateX(0.5);
    mb.cylinder(0, -0.2, 0, 0.03, 0.2, 6, 'plastic_white');
    mb.cylinder(0, -0.32, 0, 0.32, 0.12, 12, { sides: 'plastic_white', top: 'plastic_white', bottom: 'p_surg_light' }, { rTop: 0.2, fit: true, emissive: on(s) ? 0.9 : 0 });
    mb.cylinder(0, -0.34, 0, 0.05, 0.03, 6, 'chrome');
    mb.pop();
  },
});

defObj({
  key: 'morgue_drawers', name: 'Morgue Cabinet', w: 2, d: 1, height: 1.95, block: 'solid', blocksSight: true, movable: 0, power: true, hum: 'fridge',
  container: { capacity: 120, kind: 'freezer', loot: 'morgue', cooling: 'freezer' }, sound: 'metal', flammable: 0,
  disassemble: { tools: ['#wrench', '#screwdriver'], time: 60, skill: 'mechanics', yields: [['sheet_metal', 4, 8], ['scrap_metal', 3, 6], ['pipe', 1, 3]] },
  tags: T('hospital', 'morgue', 'freezer'),
  model: (mb) => {
    const W = 1.94, D = 0.84, H = 1.92, zc = WZ + D / 2 + 0.01, zf = zc + D / 2;
    mb.box(0, 0, zc, W, H, D, 'metal_brushed', { color: 0xc8ccd0 });
    mb.box(0, H, zc, W + 0.02, 0.03, D + 0.01, 'metal_brushed');
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      const x = -W / 3 + c * W / 3, y = 0.1 + r * 0.6;
      const tex = (r + c) % 3 === 0 ? 'p_morgue_door' : 'p_morgue_door_b';
      const ajar = r === 0 && c === 2;
      if (ajar) {
        mb.box(x, y + 0.02, zf - 0.004, W / 3 - 0.06, 0.52, 0.004, 'metal_dark', { color: 0x101214 });
        mb.push().translate(x - W / 6 + 0.03, y, zf).rotateY(-0.25);
        mb.box(W / 6 - 0.025, 0, 0.012, W / 3 - 0.05, 0.56, 0.024, { south: tex, all: 'metal_brushed' }, { fit: { south: true } }); mb.pop();
      } else {
        mb.box(x, y, zf + 0.012, W / 3 - 0.05, 0.56, 0.024, { south: tex, all: 'metal_brushed' }, { fit: { south: true } });
        mb.box(x + 0.18, y + 0.25, zf + 0.04, 0.03, 0.12, 0.04, 'chrome');
        mb.box(x + 0.18, y + 0.36, zf + 0.04, 0.08, 0.025, 0.04, 'chrome');
      }
    }
    mb.box(0, H - 0.04, zf + 0.004, 0.6, 0.02, 0.006, 'p_vent');
    mb.box(0.85, 1.75, zf + 0.004, 0.06, 0.03, 0.006, 'led_green', { emissive: 1 });
  },
});

defObj({
  key: 'xray_lightbox', name: 'X-Ray Lightbox', height: 1.85, block: 'none', onWall: true, movable: 6, power: true,
  light: { color: 0xd8ecff, intensity: 0.25, radius: 2.0, y: 1.5, kind: 'screen', power: true },
  sound: 'plastic', flammable: 0.2, tags: T('hospital', 'wall', 'medical'),
  disassemble: { tools: ['#screwdriver'], time: 10, skill: 'electrical', yields: [['electronics_scrap', 1, 1], ['wire', 1, 1], ['glass_shard', 0, 1]] },
  variant: (s) => (on(s) ? 'on' : 'off'),
  model: (mb, s) => {
    mb.box(0, 1.2, WZ + 0.04, 0.98, 0.62, 0.08, 'plastic_white', { color: 0xe0e4e8 });
    mb.box(0, 1.23, WZ + 0.081, 0.94, 0.58, 0.004, 'p_xray', { fit: true, emissive: on(s) ? 1.0 : 0.05 });
    mb.box(0.52, 1.3, WZ + 0.05, 0.04, 0.08, 0.06, 'plastic_white');
    mb.box(0.52, 1.33, WZ + 0.08, 0.02, 0.03, 0.01, 'led_red', { emissive: on(s) ? 1 : 0 });
    for (const x of [-0.42, -0.0, 0.05, 0.42]) mb.box(x, 1.78, WZ + 0.085, 0.04, 0.025, 0.012, 'chrome');
  },
});

defObj({
  key: 'hospital_monitor', name: 'Patient Monitor', height: 1.45, block: 'low', movable: 18, power: true, hum: 'beep',
  light: { color: 0x7affa0, intensity: 0.25, radius: 2.0, y: 1.2, kind: 'screen', power: true },
  sound: 'plastic', flammable: 0.2,
  disassemble: { tools: ['#screwdriver'], time: 15, skill: 'electrical', yields: [['electronics_scrap', 2, 4], ['wire', 1, 3], ['glass_shard', 0, 1]] },
  tags: T('hospital', 'medical', 'electronics'),
  variant: (s) => (on(s) ? 'on' : 'off'),
  model: (mb, s) => {
    starBase(mb, 0.24);
    mb.cylinder(0, 0.06, 0, 0.02, 1.0, 6, 'metal_grey');
    mb.box(0, 0.55, 0.04, 0.2, 0.12, 0.14, 'p_mesh');
    mb.box(0, 1.06, -0.02, 0.36, 0.3, 0.2, 'plastic_white', { color: 0xd8dcd8 });
    mb.box(-0.03, 1.09, 0.081, 0.26, 0.23, 0.006, { south: on(s) ? 'p_ecg' : 'p_crt_off', all: 'glass_dark' }, { fit: { south: true }, emissive: on(s) ? 0.9 : 0 });
    for (let i = 0; i < 3; i++) mb.box(0.135, 1.12 + i * 0.06, 0.081, 0.04, 0.03, 0.006, 'plastic_white', { color: [0xd04040, 0xe0e0e0, 0x40a0d0][i] });
    mb.box(0, 1.36, -0.02, 0.06, 0.04, 0.06, 'plastic_white');
    for (const [x, c] of [[-0.1, 0x3a8ad0], [0.0, 0xe0e0e0], [0.08, 0xd04040]] as const) mb.box(x, 0.65, 0.07, 0.008, 0.4, 0.008, 'plastic_white', { color: c });
  },
});

defObj({
  key: 'pharmacy_shelf', name: 'Pharmacy Shelf', height: 2.0, block: 'solid', blocksSight: true, movable: 40,
  container: { capacity: 35, kind: 'shelf', loot: 'hospital_pharmacy' }, sound: 'metal', flammable: 0.2,
  disassemble: { tools: ['#screwdriver', '#wrench'], time: 20, skill: 'mechanics', yields: [['sheet_metal', 2, 3], ['scrap_metal', 1, 3], ['screws', 2, 6]] },
  tags: T('hospital', 'store', 'pharmacy', 'shelf'),
  model: (mb) => {
    const W = 0.98, D = 0.4, zc = WZ + D / 2 + 0.01, zf = zc + D / 2, wh = { color: 0xf0f2f2 };
    for (const sx of [-1, 1]) mb.box(sx * (W / 2 - 0.015), 0, zc, 0.03, 1.98, D, 'p_steel', wh);
    mb.box(0, 0, zc, W - 0.04, 0.1, D, 'p_steel', { color: 0xc8cccc });
    mb.box(0, 0.1, zc - D / 2 + 0.01, W - 0.04, 1.86, 0.02, 'p_steel', { color: 0xd8dcdc });
    mb.box(0, 1.96, zc, W, 0.04, D, 'p_steel', wh);
    const ys = [0.1, 0.48, 0.86, 1.24, 1.6];
    ys.forEach((y, i) => {
      if (i > 0) mb.box(0, y - 0.02, zc, W - 0.04, 0.02, D, 'p_steel', wh);
      mb.box(0, y - 0.035, zf - 0.005, W - 0.04, 0.035, 0.01, 'plastic_white', { color: 0xe8f0f8 });
      const w = i === 3 ? (W - 0.06) * 0.6 : W - 0.06;
      mb.box(-(W - 0.06 - w) / 2, y, zf - 0.13, w, 10 / 32, 0.2, { south: i % 2 ? 'p_pharma_b' : 'p_pharma_a', top: 'paper', all: 'paper' }, { uvOffset: [i * 0.27, -y] });
    });
    mb.box(W / 2 + 0.002, 1.7, zc, 0.004, 0.16, 0.22, 'p_rx', { fit: true });
  },
});

defObj({
  key: 'nurse_station', name: 'Nurse Station', w: 2, d: 1, height: 1.15, block: 'solid', surface: 1.1, movable: 0,
  container: { capacity: 20, kind: 'desk', loot: 'nurse_office' }, sound: 'wood', flammable: 0.4,
  disassemble: { tools: ['#saw', '#hammer'], time: 35, skill: 'carpentry', yields: [['plank', 3, 6], ['nails', 3, 7]] },
  tags: T('hospital', 'desk'),
  model: (mb) => {
    const zf = 0.36, lam = { color: 0xd8ece8 };
    mb.box(0, 0, zf - 0.03, 1.96, 1.06, 0.06, 'plastic_white', lam);
    mb.box(0, 0, zf + 0.0, 1.94, 0.1, 0.02, 'plastic_black', { color: 0x5a7a78 });
    mb.box(0, 0.62, zf + 0.004, 1.96, 0.05, 0.02, 'plastic_white', { color: 0x7ab0a8 });
    mb.box(0, 0.78, zf + 0.004, 0.7, 0.22, 0.008, 'p_nurse_sign', { fit: true });
    mb.box(0, 1.06, zf - 0.07, 2.0, 0.04, 0.26, 'wood_light', { color: 0xe8e0d0 });
    for (const sx of [-1, 1]) mb.box(sx * 0.965, 0, -0.08, 0.07, 1.06, 0.8, 'plastic_white', lam);
    mb.box(0, 0.72, -0.1, 1.86, 0.03, 0.66, 'wood_light', { color: 0xe8e0d0 });
    // behind the counter: monitor, phone, files, call board light
    mb.push().translate(-0.35, 0.75, -0.15).rotateY(Math.PI);
    crtMonitor(mb, 0, 0, 0, 0.85, 'p_crt_blue', 0.5, 'plastic_white', 0xe0e0dc);
    mb.pop();
    mb.box(0.25, 0.75, -0.25, 0.2, 0.06, 0.18, 'plastic_beige');
    mb.box(0.25, 0.81, -0.25, 0.2, 0.035, 0.05, 'plastic_beige', { color: 0xc8c0a8 });
    for (let i = 0; i < 4; i++) mb.box(0.62 + i * 0.05, 0.75, -0.3, 0.035, 0.3, 0.24, 'plastic_white', { color: [0xd04040, 0x4070c0, 0x40a060, 0xe0c040][i] });
    papers(mb, -0.7, 1.1, zf - 0.08, 2, 31);
    mb.box(0.55, 1.1, zf - 0.08, 0.16, 0.012, 0.22, { top: 'p_chart', all: 'cardboard' }, { fit: { top: true } });
    mug(mb, -0.05, 0.75, -0.3, 0xd8f0e8);
  },
});

void scaleHex; void tileFbm; void hbar; void knob; void bookRow;
