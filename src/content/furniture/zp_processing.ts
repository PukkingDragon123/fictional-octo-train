// The Meridian Institute processing wing (zone `reality`, src/world/gen/z_reality.ts)
// and the Seam. Props: the Seam itself ('seam_door': a flat, perfectly black,
// slightly-too-tall rectangle in a wall), wall CRTs that show the new debtor's
// mugshot (the screen texture is repainted per survivor by paintMugshot), the
// hand-painted REMITTANCE PROGRAMME board, a rolling rack of yellow
// jumpsuits, a doorway somebody bricked over in a hurry, the humming process
// unit, stencilled wall notices, a floor drain, a hose reel, and the
// observers: still silhouettes standing behind the observation glass.
import { defObj } from '../../world/objects';
import { atlas, addTextureModule, makeRamp, mixHex, scaleHex, ph, txt, txtC, txtW, WZ, crtGlass, plate, screw, border } from './a_lib';
import type { PixelCanvas } from './a_lib';

const T = (...t: string[]) => ['processing', 'zp', ...t];

// ------------------------------------------------------------------ the mugshot (repainted per survivor)
export interface MugshotLook { skin: number; hair: number; hairStyle: string; number: string; frame?: number }
const MUG: MugshotLook = { skin: 0xe8b98f, hair: 0x3b2a1e, hairStyle: 'short', number: 'D-4471' };

function drawMugshot(pc: PixelCanvas, m: MugshotLook) {
  pc.wrap = false;
  const W = pc.w, H = pc.h;
  // phosphor blue-grey field with a height chart behind the head
  const BG = makeRamp(0x2c3a46, 5, { spread: 0.35 });
  pc.fillRamp(BG, (x, y) => 0.45 + (ph(x >> 2, y >> 2, 901) - 0.5) * 0.15 - y / H * 0.15, 0.6);
  for (let y = 6; y < H - 6; y += 3) pc.hline(14, W - 15, y, y % 6 === 0 ? 0x6a7c88 : 0x4a5a66);
  // head and shoulders, front view: jumpsuit collar, neck, face, hair
  const cx = Math.floor(W / 2), sk = makeRamp(m.skin, 5, { spread: 0.45 }), hr = makeRamp(m.hair, 4, { spread: 0.4 });
  const Y = makeRamp(0xd9a826, 5, { spread: 0.45 });
  for (let y = H - 9; y < H - 3; y++) for (let x = cx - 12 + (H - 3 - y); x <= cx + 12 - (H - 3 - y); x++) pc.set(x, y, Y[y > H - 7 ? 2 : 3]);
  pc.rect(cx - 2, H - 12, 5, 4, sk[1]);
  for (let y = 8; y < H - 11; y++) {
    const t = (y - 8) / (H - 19);
    const hw = Math.round(5.5 - Math.max(0, t - 0.65) * 7);
    for (let x = cx - hw; x <= cx + hw; x++) pc.set(x, y, sk[x < cx - hw + 2 ? 2 : x > cx + hw - 2 ? 1 : 3]);
  }
  // hair
  const bald = m.hairStyle === 'bald', long = m.hairStyle === 'long' || m.hairStyle === 'ponytail' || m.hairStyle === 'bob' || m.hairStyle === 'curly';
  if (!bald) {
    for (let y = 6; y < 11; y++) for (let x = cx - 6; x <= cx + 6; x++) if (y > 6 || Math.abs(x - cx) < 5) pc.set(x, y, hr[y < 8 ? 2 : 1]);
    if (long) for (let y = 10; y < H - 12; y++) { pc.set(cx - 7, y, hr[1]); pc.set(cx - 6, y, hr[2]); pc.set(cx + 6, y, hr[1]); pc.set(cx + 7, y, hr[0]); }
  }
  // eyes (dead tired), bruise, mouth, the number board held at the chest
  pc.set(cx - 3, 13, 0x1a1412); pc.set(cx + 3, 13, 0x1a1412);
  pc.blend(cx - 3, 14, 0x4a2a3a, 0.5); pc.blend(cx + 3, 14, 0x4a2a3a, 0.5);
  pc.blend(cx + 3, 12, 0x5a3a5a, 0.45); pc.blend(cx + 4, 13, 0x5a3a5a, 0.4);
  pc.hline(cx - 1, cx + 1, 18, sk[0]);
  pc.rect(cx - 13, H - 9, 27, 7, 0x141414);
  pc.strokeRect(cx - 13, H - 9, 27, 7, 0x9a9a92);
  txtC(pc, m.number, cx, H - 8, 0xe8e8e0);
  // header and record code
  pc.rect(0, 0, W, 5, 0x0e1418);
  txt(pc, 'REMIT', 1, 0, 0xd8b048);
  txt(pc, 'INTAKE', W - txtW('INTAKE') - 1, 0, 0x8ab0c0);
  crtGlass(pc, 0, 0, W, H, 0x0a1014, 0.6, true);
}
/** show this survivor's face and number on every mugshot monitor */
export function paintMugshot(m: Partial<MugshotLook>) {
  Object.assign(MUG, m);
  atlas().repaint('zp_crt_mugshot', (pc) => drawMugshot(pc, MUG));
}

// ------------------------------------------------------------------ textures
addTextureModule(() => {
  const A = atlas();

  // the Seam: nothing at all
  A.add('zp_void', 4, 4, (pc) => pc.fill(0x000000));
  // its rim: plaster gone grey-black and flaking, as if the wall had been burnt from the inside
  A.add('zp_seam_edge', 8, 32, (pc) => {
    const R = makeRamp(0x2a2622, 5, { spread: 0.5 });
    pc.fillRamp(R, (x, y) => 0.25 + ph(x, y >> 1, 911) * 0.35 + (x > 5 ? 0.3 : 0), 0.7);
    for (let y = 0; y < 32; y++) if (ph(7, y, 912) < 0.35) pc.set(7, y, R[4]);
    for (let y = 0; y < 32; y++) pc.set(0, y, 0x050505);
  });
  // soot on the wall around it: darkest at the rim, thinning out into the paint (alpha decal)
  A.add('zp_seam_halo', 40, 56, (pc) => {
    pc.wrap = false;
    for (let y = 0; y < 56; y++) for (let x = 0; x < 40; x++) {
      // distance outside the slab rectangle (slab = central 22x46 px, bottom flush)
      const dx = Math.max(0, Math.abs(x + 0.5 - 20) - 11), dy = Math.max(0, 9.5 - (y + 0.5));
      const d = Math.hypot(dx, dy * 1.2) + (ph(x >> 1, y >> 1, 916) - 0.5) * 2.2;
      const a = Math.max(0, 1 - d / 8.5);
      if (a <= 0.02) continue;
      const k = a * a;
      pc.setRGBA(x, y, 6, 5, 5, Math.round(Math.min(1, k * 1.15) * 235));
    }
  });
  A.add('zp_seam_dust', 32, 16, (pc) => {
    pc.wrap = false;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) {
      const t = 1 - y / 16, w = Math.abs(x + 0.5 - 16) / 16;
      const a = Math.max(0, t * (1 - w * w) - ph(x, y, 917) * 0.35);
      if (a > 0.05) pc.setRGBA(x, y, 8, 7, 6, Math.round(a * 200));
    }
  });
  // a sealed Seam: still black, but hairline cracks catch the light
  A.add('zp_seam_scar', 16, 32, (pc) => {
    pc.wrap = false;
    pc.fill(0x020202);
    let x = 5, y = 0;
    while (y < 32) { pc.set(x, y, 0x1c1a18); if (ph(x, y, 913) < 0.3) pc.set(x + 1, y, 0x121110); x += ph(y, 1, 914) < 0.5 ? -1 : 1; x = Math.max(1, Math.min(14, x)); y++; }
    for (let i = 0; i < 6; i++) { const yy = 6 + i * 4, xx = 2 + Math.floor(ph(i, 2, 915) * 11); pc.set(xx, yy, 0x24201c); pc.set(xx + 1, yy + 1, 0x161412); }
  });

  // mugshot CRT screen (48x36 at monitor scale; repainted at the start of the intro)
  A.add('zp_crt_mugshot', 48, 36, (pc) => drawMugshot(pc, MUG));
  A.add('zp_crt_body', 16, 16, (pc) => plate(pc, 0, 0, 16, 16, 0x3a3c3a, 921, { noise: 0.1 }));

  // REMITTANCE PROGRAMME, hand-painted on a plywood board
  A.add('zp_sign_remit', 96, 32, (pc) => {
    pc.wrap = false;
    const B = makeRamp(0xd8d0b8, 5, { spread: 0.25 });
    pc.fillRamp(B, (x, y) => 0.6 + (ph(x >> 3, y, 931) - 0.5) * 0.25 + Math.sin(x * 0.45 + y * 0.1) * 0.04, 0.6);
    // plywood grain showing through
    for (let y = 1; y < 31; y += 3) for (let x = 0; x < 96; x++) if (ph(x >> 2, y, 932) < 0.25) pc.blend(x, y, 0x9a8a68, 0.25);
    const red = 0xa8241c, ink = 0x1c1816;
    // brush letters with a little wobble per glyph
    const brush = (s: string, x0: number, y0: number, c: number, scale: number, seed: number) => {
      let x = x0;
      for (let i = 0; i < s.length; i++) {
        const dy = ph(i, seed, 933) < 0.3 ? 1 : 0;
        x += txt(pc, s[i], x, y0 + dy, c, 1, scale) + scale;
      }
      return x;
    };
    brush('REMITTANCE', Math.round(48 - (txtW('REMITTANCE') * 2) / 2) - 1, 2, red, 2, 1);
    brush('PROGRAMME', Math.round(48 - (txtW('PROGRAMME') * 2) / 2) - 1, 14, red, 2, 2);
    pc.hline(8, 88, 25, scaleHex(red, 0.8));
    txtC(pc, 'AUTHORISED DEBTORS ONLY', 48, 26, ink);
    // drips from the wet paint
    for (const [dx, len] of [[14, 3], [30, 2], [55, 4], [71, 2], [40, 2]] as [number, number][]) for (let i = 0; i < len; i++) pc.set(dx, 12 + i, i === len - 1 ? scaleHex(red, 0.75) : red);
    border(pc, 0x6a5a42, 1);
    for (const [sx, sy] of [[2, 2], [93, 2], [2, 29], [93, 29]]) screw(pc, sx, sy, 0xc8c0a8, 0x3a3428);
  });

  // a yellow jumpsuit on a hanger (front view)
  A.add('zp_hang_jumpsuit', 16, 40, (pc) => {
    pc.wrap = false;
    const Y = makeRamp(0xd9a826, 5, { spread: 0.45 });
    for (let y = 0; y < 40; y++) for (let x = 0; x < 16; x++) {
      const torso = y < 20 ? x >= 3 && x <= 12 : (x >= 3 && x <= 7) || (x >= 8 && x <= 12);
      const sleeve = y >= 2 && y < 22 && (x < 3 || x > 12);
      if (!torso && !sleeve) continue;
      pc.set(x, y, Y[2 + (ph(x >> 1, y >> 2, 941) < 0.2 ? 1 : 0) - (sleeve && (x === 0 || x === 15) ? 1 : 0)]);
    }
    for (let y = 2; y < 30; y++) pc.set(7 + (y % 2), y, y % 2 ? 0x8a8478 : Y[1]);
    pc.rect(3, 6, 4, 3, 0xe8e4d6); pc.hline(4, 6, 7, 0x1c1a18);
    pc.rect(5, 0, 6, 2, Y[1]);
    for (let y = 20; y < 40; y++) pc.set(7, y, Y[0]);
  });

  // brickwork crammed into an old doorway: mismatched bricks, mortar smeared on in a hurry
  A.add('zp_bricks', 32, 64, (pc) => {
    pc.wrap = false;
    pc.fill(0x8a867a);
    const reds = [0x8a3a2a, 0x7a3426, 0x9a4a32, 0x6a3024, 0xa05a3c, 0x5a2a20];
    for (let row = 0; row < 16; row++) {
      const y0 = row * 4, off = row % 2 ? 4 : 0;
      for (let bx = -off; bx < 32; bx += 8) {
        const c = reds[Math.floor(ph(bx, row, 951) * reds.length)];
        const R = makeRamp(c, 4, { spread: 0.3 });
        for (let y = y0; y < y0 + 3; y++) for (let x = Math.max(0, bx); x < Math.min(32, bx + 7); x++) pc.set(x, y, R[y === y0 ? 2 : ph(x, y, 952) < 0.2 ? 0 : 1]);
      }
    }
    for (let i = 0; i < 9; i++) { const x = Math.floor(ph(i, 1, 953) * 28), y = Math.floor(ph(i, 2, 954) * 60); pc.ditherBlob(x + 2, y + 2, 3, 2, 0xa8a496, 0.8); }
    for (let x = 0; x < 32; x++) for (let y = 60; y < 64; y++) if (ph(x, y, 955) < 0.4) pc.set(x, y, 0x6a665a);
  });
  A.add('zp_stencil_intake', 32, 8, (pc) => {
    pc.wrap = false; pc.fill(0x000000); pc.data.fill(0);
    txtC(pc, 'INTAKE 2', 16, 1, 0xd8d4c4);
  });

  // institutional two-tone wall: green-grey gloss below, cream above, a painted line, water damage
  A.add('zp_wall_inst', 32, 86, (pc) => {
    const lo = makeRamp(0x4e5e54, 5, { spread: 0.3 }), hi = makeRamp(0xc8c2a6, 5, { spread: 0.25 });
    for (let y = 0; y < 86; y++) for (let x = 0; x < 32; x++) {
      const low = y > 52;
      const n = (ph(x >> 2, y >> 3, 961) - 0.5) * 0.2;
      const R = low ? lo : hi;
      pc.set(x, y, R[Math.max(0, Math.min(4, Math.round(2 + n * 4 + (low ? 0.2 : 0))))]);
    }
    pc.hline(0, 31, 52, 0x2a3430); pc.hline(0, 31, 51, 0x9a2a22); pc.hline(0, 31, 50, 0x7a221c);
    pc.hline(0, 31, 85, 0x26302c);
    for (let x = 0; x < 32; x++) if (ph(x, 0, 962) < 0.5) for (let y = 0; y < 6 + Math.floor(ph(x, 1, 963) * 14); y++) pc.blend(x, y, 0x7a6a3a, 0.18);
    for (let i = 0; i < 4; i++) { const x = Math.floor(ph(i, 3, 964) * 32), y = 54 + Math.floor(ph(i, 4, 965) * 28); pc.set(x, y, 0x8a9a8e); pc.set(x + 1, y, 0x3a443e); }
  }, 1, 2.7);
  A.add('zp_wall_dark', 32, 86, (pc) => {
    const R = makeRamp(0x1c1c1e, 4, { spread: 0.3 });
    pc.fillRamp(R, (x, y) => 0.4 + (ph(x >> 2, y >> 2, 971) - 0.5) * 0.25, 0.6);
    for (let x = 0; x < 32; x++) if (ph(x, 0, 972) < 0.3) for (let y = 0; y < 20; y++) pc.blend(x, y + Math.floor(ph(x, 1, 973) * 40), 0x0a0a0a, 0.4);
  }, 1, 2.7);

  // stencilled notices (white paint on the wall, edges a little overspray)
  const notices = ['DEBTORS FACE THE WALL', 'PROCESSING', 'NO EYE CONTACT', 'ROOM 0 - ESCORT ONLY', 'HOLD HERE'];
  notices.forEach((s, i) => A.add('zp_notice_' + i, 96, 9, (pc) => {
    pc.wrap = false; pc.data.fill(0);
    const w = txtW(s);
    txt(pc, s, Math.round(48 - w / 2), 2, 0xe8e4d4);
    for (let x = 0; x < 96; x++) for (let y = 0; y < 9; y++) if (pc.get(x, y) === 0 && ph(x, y, 980 + i) < 0.04 && Math.abs(x - 48) < w / 2 + 2) pc.blend(x, y, 0xe8e4d4, 0.4);
    if (i === 1) { for (let k = 0; k < 6; k++) pc.set(Math.round(48 + w / 2) + 3 + k, 4, 0xe8e4d4); pc.set(Math.round(48 + w / 2) + 7, 3, 0xe8e4d4); pc.set(Math.round(48 + w / 2) + 7, 5, 0xe8e4d4); }
  }));

  // the process unit's front: gauges, a stencilled plate, hazard stripes
  A.add('zp_machine_front', 64, 64, (pc) => {
    pc.wrap = false;
    plate(pc, 0, 0, 64, 64, 0x5a6458, 991, { noise: 0.14 });
    for (let x = 0; x < 64; x++) for (let y = 56; y < 64; y++) pc.set(x, y, ((x + y) >> 2) % 2 ? 0xd8b030 : 0x1c1c1a);
    for (const [gx, gy] of [[12, 12], [30, 12]]) {
      pc.circle(gx, gy, 6, 0x1c1e1c); pc.circle(gx, gy, 5, 0xe8e0c0);
      pc.line(gx, gy, gx + 3, gy - 3, 0xa82418);
      for (let a = 0; a < 7; a++) { const an = Math.PI * (0.8 + a * 0.23); pc.set(Math.round(gx + Math.cos(an) * 4), Math.round(gy + Math.sin(an) * 4), 0x3a3a34); }
    }
    pc.rect(42, 6, 18, 12, 0x2a2c28); txtC(pc, 'PU-4', 51, 9, 0xd8d0b0);
    pc.rect(6, 26, 52, 10, 0xd8d2bc); txtC(pc, 'MERIDIAN', 32, 27, 0x2a2622); txtC(pc, 'PROCESS UNIT', 32, 31, 0x7a2018);
    for (let i = 0; i < 5; i++) { pc.rect(8 + i * 10, 42, 6, 6, 0x2a2c28); pc.set(10 + i * 10, 44, i === 2 ? 0xff9a30 : 0x3a5a30); }
    for (const [sx, sy] of [[2, 2], [61, 2], [2, 53], [61, 53]]) screw(pc, sx, sy, 0xb8c0b0, 0x2a2e28, true);
  });

  // the observers: unlit silhouettes, a hint of a lab coat
  A.add('zp_silhouette', 8, 8, (pc) => pc.fillRamp(makeRamp(0x14161a, 3, { spread: 0.3 }), (x, y) => 0.4 + ph(x, y, 995) * 0.2, 0.5));
  A.add('zp_silhouette_coat', 8, 8, (pc) => pc.fillRamp(makeRamp(0x30343a, 3, { spread: 0.3 }), (x, y) => 0.4 + ph(x, y, 996) * 0.2, 0.5));

  // floor drain grate with a rust ring
  A.add('zp_drain', 16, 16, (pc) => {
    pc.wrap = false;
    pc.fill(0x3a3a38);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const d = Math.hypot(x - 7.5, y - 7.5); if (d > 7.5) pc.set(x, y, 0x5a4a3a); else if (d > 6.5) pc.set(x, y, 0x4a3426); }
    for (let x = 3; x < 13; x += 2) for (let y = 3; y < 13; y++) pc.set(x, y, 0x0e0e0e);
    pc.ellipse(9, 9, 2, 2, 0x5a1a14, 160);
  });
  A.add('zp_hose', 8, 8, (pc) => { pc.fill(0x8a2a22); for (let y = 0; y < 8; y += 2) pc.hline(0, 7, y, 0x6a1c18); pc.vline(1, 0, 7, 0xb84a3a); });
});

// ------------------------------------------------------------------ the Seam
defObj({
  key: 'seam_door', name: 'The Seam', w: 1, d: 1, height: 2.46, block: 'none', onWall: true, hp: 999999, noShadow: true,
  sound: 'metal', flammable: 0, movable: 0, tags: T('seam', 'anomaly', 'nobreak'),
  desc: 'A doorway-shaped absence in the wall. Too tall by a hand. Light goes into it and does not come back.',
  variant: (s) => (s.sealed ? 'sealed' : ''),
  model: (mb, s) => {
    const z0 = WZ + 0.004;
    // the black: flat, a hair proud of the wall so nothing z-fights with it
    mb.box(0, 0.0, z0 + 0.006, 1.12, 2.46, 0.012, s.sealed ? { south: 'zp_seam_scar', all: 'zp_void' } : 'zp_void', { ao: false, fit: { south: true } });
    // the rim: plaster scorched grey-black where the wall meets it
    mb.box(-0.6, 0.0, z0 + 0.003, 0.08, 2.5, 0.006, 'zp_seam_edge', { fit: true, ao: false });
    mb.box(0.6, 0.0, z0 + 0.003, 0.08, 2.5, 0.006, 'zp_seam_edge', { fit: true, ao: false });
    mb.box(0, 2.46, z0 + 0.003, 1.28, 0.05, 0.006, 'zp_seam_edge', { fit: true, ao: false });
  },
});

// ------------------------------------------------------------------ processing wing props
defObj({
  key: 'zp_crt_wall', name: 'Intake Monitor', w: 1, d: 1, height: 2.2, block: 'none', onWall: true, power: true, hum: 'computer',
  light: { color: 0x9ac8e8, intensity: 0.42, radius: 2.8, y: 1.85, kind: 'screen', power: true },
  sound: 'metal', flammable: 0.1, movable: 0, tags: T('electronics', 'monitor'),
  desc: 'A ceiling-hung monitor. The face on it is yours. Underneath: your number.',
  model: (mb) => {
    const z0 = WZ;
    // wall plate + bracket arm
    mb.box(0, 2.18, z0 + 0.02, 0.22, 0.14, 0.04, 'metal_dark');
    mb.box(0, 2.1, z0 + 0.22, 0.05, 0.05, 0.42, 'metal_dark');
    mb.box(0, 2.1, z0 + 0.42, 0.05, 0.12, 0.05, 'metal_dark');
    mb.push().translate(0, 1.52, z0 + 0.42).rotateX(0.14);
    // housing: deep industrial tube
    mb.box(0, 0, -0.06, 0.84, 0.66, 0.4, 'zp_crt_body');
    mb.box(0, 0.06, -0.34, 0.6, 0.48, 0.2, 'zp_crt_body', { color: 0xc8c8c8 });
    // screen
    mb.box(0, 0.06, 0.142, 0.72, 0.54, 0.006, { south: 'zp_crt_mugshot', all: 'glass_dark' }, { fit: { south: true }, emissive: 0.95 });
    mb.box(0.36, 0.025, 0.14, 0.025, 0.015, 0.006, 'led_green', { emissive: 1.2 });
    mb.pop();
  },
});
defObj({
  key: 'zp_sign_remit', name: 'Painted Board', w: 2, d: 1, height: 2.2, block: 'none', onWall: true,
  sound: 'wood', flammable: 0.7, movable: 0, tags: T('sign'),
  desc: 'REMITTANCE PROGRAMME — AUTHORISED DEBTORS ONLY. The paint ran before it dried.',
  model: (mb) => {
    mb.box(-0.5, 1.28, WZ + 0.02, 2.0, 0.66, 0.03, { south: 'zp_sign_remit', all: 'wood_light' }, { fit: { south: true } });
    for (const x of [-1.38, 0.38]) mb.box(x, 1.24, WZ + 0.01, 0.06, 0.06, 0.02, 'metal_dark');
  },
});
defObj({
  key: 'zp_jumpsuit_rack', name: 'Jumpsuit Rack', w: 2, d: 1, height: 1.8, block: 'solid', movable: 28,
  sound: 'metal', flammable: 0.3, tags: T('rack', 'clothing'),
  container: { capacity: 12, kind: 'shelf', loot: '' },
  desc: 'Rolling rail of yellow jumpsuits, every size, every one with a number already on it.',
  model: (mb) => {
    // T-legs on casters, the rail
    for (const x of [-0.92, 0.92]) {
      mb.box(x, 0.04, 0, 0.04, 1.66, 0.04, 'chrome');
      mb.box(x, 0.02, 0, 0.06, 0.03, 0.5, 'chrome');
      for (const z of [-0.22, 0.22]) mb.cylinder(x, 0, z, 0.03, 0.04, 6, 'rubber_black');
    }
    mb.box(0, 1.68, 0, 1.9, 0.03, 0.03, 'chrome');
    // the jumpsuits, a little uneven, one fallen half off its hanger
    for (let i = 0; i < 7; i++) {
      const x = -0.78 + i * 0.26, yaw = (ph(i, 1, 1001) - 0.5) * 0.5;
      mb.push().translate(x, 0.42, 0).rotateY(yaw + Math.PI / 2 * 0.15);
      if (i === 5) mb.rotateZ(0.22);
      mb.box(0, 0, 0, 0.36, 1.2, 0.05, { south: 'zp_hang_jumpsuit', north: 'zp_hang_jumpsuit', all: 'fabric_grey' }, { color: i === 5 ? 0xffffff : 0xffffff, fit: { south: true, north: true } });
      mb.pop();
      mb.box(x, 1.62, 0, 0.3, 0.012, 0.012, 'chrome');
      mb.box(x, 1.64, 0, 0.012, 0.05, 0.012, 'chrome');
    }
  },
});
defObj({
  key: 'zp_bricked_door', name: 'Bricked-up Doorway', w: 1, d: 1, height: 2.2, block: 'none', onWall: true, hp: 999999,
  sound: 'metal', flammable: 0, movable: 0, tags: T('door', 'nobreak'),
  desc: 'A doorway filled with bricks that don\'t match. The handle is still there, sticking out of the mortar. It is warm.',
  model: (mb) => {
    const z = WZ + 0.02;
    mb.box(0, 0, z, 1.0, 2.08, 0.03, { south: 'zp_bricks', all: 'metal_dark' }, { fit: { south: true } });
    // steel frame left proud of the infill
    mb.box(-0.53, 0, z + 0.01, 0.07, 2.14, 0.06, 'metal_grey');
    mb.box(0.53, 0, z + 0.01, 0.07, 2.14, 0.06, 'metal_grey');
    mb.box(0, 2.08, z + 0.01, 1.13, 0.07, 0.06, 'metal_grey');
    // the handle, still in the wall
    mb.box(0.3, 1.0, z + 0.04, 0.14, 0.025, 0.05, 'chrome');
    mb.box(0.36, 0.98, z + 0.02, 0.04, 0.06, 0.04, 'chrome');
    mb.box(0, 2.18, z, 0.7, 0.18, 0.006, { south: 'zp_stencil_intake', all: 'metal_dark' }, { fit: { south: true } });
  },
});
defObj({
  key: 'zp_machine', name: 'Process Unit', w: 2, d: 1, height: 2.3, block: 'solid', movable: 0, power: true, hum: 'machine', hp: 3000,
  light: { color: 0xffa040, intensity: 0.25, radius: 2.2, y: 1.2, kind: 'screen', power: true },
  sound: 'metal', flammable: 0, tags: T('machine', 'industrial'),
  desc: 'It hums at a pitch you feel in your fillings. A brass plate: PROCESS UNIT 4. There is no slot, no hopper, no door. Just the hum.',
  model: (mb) => {
    mb.box(0, 0, -0.05, 1.86, 1.62, 0.8, { south: 'zp_machine_front', all: 'metal_grey' }, { fit: { south: true }, color: 0xa8b0a0 });
    mb.box(0, 0, -0.05, 1.92, 0.08, 0.86, 'metal_dark');
    // motor housing and flywheel on top
    mb.push().translate(-0.3, 1.95, -0.1).rotateZ(Math.PI / 2);
    mb.cylinder(0, -0.55, 0, 0.3, 1.1, 10, 'metal_grey', { color: 0x8a9488 });
    mb.pop();
    mb.cylinder(0.62, 1.62, -0.1, 0.32, 0.12, 12, 'metal_dark');
    // pipes into the wall and floor, warning lamp
    for (const x of [-0.7, -0.5]) mb.box(x, 1.62, -0.42, 0.08, 0.66, 0.08, 'metal_rusty');
    mb.box(0.85, 0.2, 0.28, 0.06, 1.2, 0.06, 'metal_rusty');
    mb.cylinder(0.75, 1.64, 0.2, 0.05, 0.08, 8, 'plastic_black');
    mb.sphere(0.75, 1.75, 0.2, 0.05, 6, 4, 'white', { color: 0xff9a30, emissive: 1.4 });
  },
});
defObj({
  key: 'zp_notice', name: 'Stencilled Notice', w: 1, d: 1, height: 2.0, block: 'none', onWall: true, noShadow: true,
  sound: 'metal', flammable: 0, movable: 0, tags: T('sign', 'nobreak'), hp: 999999,
  variant: (s) => String(s.v ?? 0),
  model: (mb, s) => {
    mb.box(0, 1.55, WZ + 0.003, 2.9, 0.27, 0.004, { south: 'zp_notice_' + ((s.v ?? 0) % 5), all: 'zp_void' }, { fit: { south: true }, ao: false });
  },
});
defObj({
  key: 'zp_observer', name: 'Observer', w: 1, d: 1, height: 1.98, block: 'solid', movable: 0, noShadow: false, hp: 999999,
  sound: 'flesh', flammable: 0, tags: T('figure', 'nobreak'),
  desc: 'Somebody standing very still on the other side of the glass. Clipboard. No face you can make out.',
  variant: (s) => String(s.v ?? 0),
  model: (mb, s) => {
    const v = (s.v ?? 0) % 3, C = 'zp_silhouette', K = 'zp_silhouette_coat';
    // legs, long coat, narrow shoulders, slightly too long arms, head tilted
    for (const x of [-0.08, 0.08]) mb.box(x, 0, 0, 0.1, 0.86, 0.12, C);
    mb.box(0, 0.62, 0, 0.42, 0.72, 0.24, K);
    mb.box(0, 1.3, 0, 0.36, 0.42, 0.22, K);
    mb.box(0, 1.7, 0, 0.1, 0.08, 0.1, C);
    mb.push().translate(0, 1.76, 0.02).rotateZ(v === 1 ? 0.28 : v === 2 ? -0.12 : 0.06);
    mb.box(0, 0, 0, 0.2, 0.25, 0.22, C);
    mb.pop();
    if (v === 0) {
      // clipboard held at the chest
      for (const x of [-0.2, 0.2]) mb.box(x, 1.12, 0.08, 0.08, 0.45, 0.09, K);
      mb.box(0, 1.16, 0.16, 0.26, 0.32, 0.02, 'white', { color: 0x8a8a84 });
    } else if (v === 1) {
      // arms hanging, too long
      for (const x of [-0.24, 0.24]) mb.box(x, 0.66, 0, 0.08, 0.86, 0.09, K);
    } else {
      // hands behind the back
      for (const x of [-0.22, 0.22]) mb.box(x, 1.08, -0.06, 0.08, 0.46, 0.09, K);
    }
  },
});
defObj({
  key: 'zp_floor_drain', name: 'Floor Drain', w: 1, d: 1, height: 0.01, block: 'none', noShadow: true, hp: 999999,
  sound: 'metal', flammable: 0, movable: 0, tags: T('drain', 'nobreak'),
  desc: 'The floor slopes toward it from every side. The rust ring is not all rust.',
  model: (mb) => { mb.flat(0, 0.006, 0, 0.6, 0.6, 'zp_drain'); },
});
defObj({
  key: 'zp_hose_reel', name: 'Hose Reel', w: 1, d: 1, height: 1.6, block: 'none', onWall: true, movable: 0,
  sound: 'metal', flammable: 0.2, tags: T('hose'),
  desc: 'For washing the floor down afterwards. The nozzle is still dripping.',
  model: (mb) => {
    mb.box(0, 1.0, WZ + 0.02, 0.3, 0.3, 0.04, 'metal_dark');
    mb.push().translate(0, 1.15, WZ + 0.16).rotateX(Math.PI / 2);
    mb.cylinder(0, -0.1, 0, 0.24, 0.2, 12, 'zp_hose');
    mb.cylinder(0, -0.12, 0, 0.26, 0.02, 12, 'metal_grey');
    mb.cylinder(0, 0.1, 0, 0.26, 0.02, 12, 'metal_grey');
    mb.pop();
    mb.box(0.24, 0.5, WZ + 0.2, 0.04, 0.6, 0.04, 'zp_hose');
    mb.box(0.24, 0.42, WZ + 0.2, 0.05, 0.1, 0.05, 'metal_grey');
  },
});
void mixHex;
