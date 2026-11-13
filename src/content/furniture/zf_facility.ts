// Round 15 (WORLD): the companies' facilities in the backrooms. The Meridian
// Institute is not the first outfit down here and not the only one: Argent-Vale
// Biosecure runs rival containment depots, the Halcyon Survey Company left its
// camps behind when it went under, and Ostrander Lift & Freight built cargo
// lifts nobody services any more. This file holds what those sets need that
// the existing kits do not have:
//   fac_sign       a wall-mounted company sign (state.sign picks the plate)
//   fac_sign_post  the same plates on a free-standing post (camps, open floors)
//   cp_relay       the Meridian relay booth: a checkpoint station (src/game/checkpoint.ts)
//   fac_lift_cage  an Ostrander cargo lift cage, jammed between floors
// plus the plates' textures, the facility loot tables and the lore notes left
// on the desks. The sets themselves are laid out by src/world/gen/facilities.ts
// (a late post-generation hook, installed at the bottom of this file).
import { defObj } from '../../world/objects';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { PixelCanvas, makeRamp, mixHex, scaleHex, bayer, ph } from '../../gfx/pixel';
import { text, textC, textW } from './b_common';
import { defLoot } from '../../items/loot';
import { defLore } from '../loreRegistry';
import { installFacilities } from '../../world/gen/facilities';
import '../../game/introKit/tex';
import { emblemPixels } from '../../ui/brand/logo';

const T = ['facility', 'zf'];

// ------------------------------------------------------------------ the plates
export interface SignSpec {
  /** company line (small, in the band) */
  co: string;
  /** the big words */
  title: string;
  /** small print under the title */
  sub: string;
  base: number; band: number; ink: number; bandInk: number;
  logo: 'meridian' | 'argent' | 'halcyon' | 'ostrander' | 'none';
  hazard?: boolean;
  rust?: number;
  /** spray paint over a dead company's name */
  defaced?: string;
}
export const SIGNS: Record<string, SignSpec> = {
  meridian_outpost: { co: 'M.I. OF LIMINALITY', title: 'FIELD OUTPOST', sub: 'RESEARCH  SAMPLE INTAKE', base: 0xe6dfc8, band: 0x2f6f6a, ink: 0x1c2a28, bandInk: 0xf0ead6, logo: 'meridian' },
  argent_depot: { co: 'ARGENT-VALE BIOSECURE', title: 'CONTAINMENT', sub: 'CLASS II  DO NOT OPEN', base: 0x24221f, band: 0xa8261e, ink: 0xe8e0cc, bandInk: 0xf4ece0, logo: 'argent', hazard: true },
  meridian_maint: { co: 'MERIDIAN FACILITIES', title: 'MAINTENANCE 7', sub: 'HARD HATS  NO NAKED FLAME', base: 0xe2b23a, band: 0x1d1b17, ink: 0x1d1b17, bandInk: 0xe2b23a, logo: 'meridian', hazard: true },
  halcyon_camp: { co: 'HALCYON SURVEY CO', title: 'CAMP ELEVEN', sub: 'EST 1979  ALL CREWS SIGN IN', base: 0x6d7f58, band: 0x3c4a30, ink: 0xe8e2c4, bandInk: 0xd8d0a8, logo: 'halcyon', rust: 0.5, defaced: 'CLOSED' },
  meridian_checkpoint: { co: 'MERIDIAN CUSTODY', title: 'CHECKPOINT', sub: 'HALT  PRESENT YOUR BAND', base: 0xece8e0, band: 0xb5281f, ink: 0x1c1a18, bandInk: 0xf6f0e6, logo: 'meridian' },
  ostrander_lift: { co: 'OSTRANDER LIFT AND FREIGHT', title: 'CARGO LIFT 2', sub: 'MAX 2000 KG  NO RIDERS', base: 0x2c4f86, band: 0x13203a, ink: 0xeef0f2, bandInk: 0xc9d4e6, logo: 'ostrander', rust: 0.8, defaced: 'DEAD' },
  meridian_server: { co: 'MERIDIAN I.T.', title: 'SERVER ROOM 4C', sub: 'AUTHORISED STAFF ONLY', base: 0x8c9196, band: 0x2a2e33, ink: 0x15181b, bandInk: 0xd6dade, logo: 'meridian' },
  meridian_relay: { co: 'M.I. OF LIMINALITY', title: 'RELAY BOOTH', sub: 'CHECKPOINT  HOLD THE LINK', base: 0x1e3b3a, band: 0x52c4a8, ink: 0xd8f4e8, bandInk: 0x0e1c1b, logo: 'meridian' },
};
export const SIGN_KEYS = Object.keys(SIGNS);

const SW = 128, SH = 40;

function logo(pc: PixelCanvas, kind: SignSpec['logo'], x: number, y: number, c: number, bg: number) {
  if (kind === 'meridian') {
    // the Institute's bishop (src/ui/brand/logo.ts), in the band's ink
    const N = 11, p = emblemPixels(N, { roundel: false });
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const col = p[j * N + i]; if (col >= 0) pc.set(x + i, y + j, col === 0x0d0a07 ? bg : c); }
  } else if (kind === 'argent') {
    // a shield with the three-lobed seal
    for (let j = 0; j < 11; j++) { const w = j < 6 ? 5 : Math.max(0, 5 - (j - 5)); pc.hline(x + 5 - w, x + 5 + w, y + j, c); }
    pc.circle(x + 5, y + 3, 1.6, bg); pc.circle(x + 3, y + 6, 1.6, bg); pc.circle(x + 7, y + 6, 1.6, bg); pc.set(x + 5, y + 5, c);
  } else if (kind === 'halcyon') {
    // a half sun over three waves
    for (let a = 0; a < 7; a++) { const ang = Math.PI + (a / 6) * Math.PI; pc.set(Math.round(x + 5 + Math.cos(ang) * 5), Math.round(y + 5 + Math.sin(ang) * 5), c); }
    pc.ellipse(x + 5, y + 5, 2.6, 2.6, c); pc.rect(x, y + 6, 11, 5, bg);
    for (let k = 0; k < 3; k++) for (let i = 0; i < 11; i++) if ((i + k) % 4 !== 3) pc.set(x + i, y + 7 + k * 1 + ((i + k) % 2), c);
  } else if (kind === 'ostrander') {
    // a crane hook on its block
    pc.rect(x + 3, y, 5, 3, c); pc.vline(x + 5, y + 3, y + 6, c);
    pc.ellipse(x + 5, y + 8, 3, 2.4, c); pc.ellipse(x + 5, y + 7.6, 1.6, 1.4, bg); pc.rect(x + 6, y + 6, 3, 2, bg); pc.set(x + 8, y + 7, c);
  }
}

function drawSign(pc: PixelCanvas, s: SignSpec, seed: number) {
  pc.wrap = false;
  const R = makeRamp(s.base, 6, { spread: 0.3 });
  pc.fillRamp(R, (x, y) => 0.55 + (ph(x >> 2, y >> 1, seed) - 0.5) * 0.18 + (ph(x, y, seed + 1) - 0.5) * 0.08, 0.7);
  // the band along the top with the company's name and mark
  const B = makeRamp(s.band, 5, { spread: 0.25 });
  for (let y = 0; y < 12; y++) for (let x = 0; x < SW; x++) pc.set(x, y, B[2 + ((ph(x >> 1, y, seed + 3) < 0.2) ? 1 : 0)]);
  pc.hline(0, SW - 1, 12, scaleHex(s.band, 0.55));
  logo(pc, s.logo, 4, 1, s.bandInk, B[2]);
  text(pc, s.co, 18, 4, s.bandInk);
  // hazard flanks
  if (s.hazard) for (let y = 13; y < SH; y++) for (let x = 0; x < 6; x++) {
    const on = ((x + y) >> 2) % 2 === 0;
    pc.set(x, y, on ? 0xe2b23a : 0x1d1b17); pc.set(SW - 1 - x, y, on ? 0xe2b23a : 0x1d1b17);
  }
  // the title, the small print
  const tw = textW(s.title, 2);
  const tx = Math.max(8, Math.floor((SW - tw) / 2));
  text(pc, s.title, tx + 1, 16, scaleHex(s.base, 0.7));
  text(pc, s.title, tx, 15, s.ink, 2);
  textC(pc, s.sub, SW / 2, 30, mixHex(s.ink, s.base, 0.25));
  // enamel chips, screw holes, an outline
  for (let x = 0; x < SW; x++) for (let y = 0; y < SH; y++) {
    if (ph(x, y, seed + 7) < 0.012) pc.set(x, y, 0x3a3630);
    if ((x < 2 || y < 2 || x > SW - 3 || y > SH - 3) && ph(x, y, seed + 8) < 0.25) pc.blend(x, y, 0x2a2620, 0.5);
  }
  for (const [x, y] of [[2, 2], [SW - 4, 2], [2, SH - 4], [SW - 4, SH - 4]]) { pc.rect(x, y, 2, 2, 0x8a8a86); pc.set(x + 1, y + 1, 0x3a3a36); }
  pc.strokeRect(0, 0, SW, SH, scaleHex(s.base, 0.45));
  // rust bleeding from the screws, grime along the bottom
  const rust = s.rust ?? 0.15;
  for (let x = 0; x < SW; x++) for (let y = 0; y < SH; y++) {
    const r = ph(x >> 1, y >> 2, seed + 11);
    if (r < rust * 0.18) pc.blend(x, y, 0x7a3e1c, 0.55);
    if (y > SH - 8 && ph(x, y, seed + 12) < 0.3 + (y - SH + 8) * 0.06) pc.blend(x, y, 0x3a3226, 0.35);
  }
  for (const sx of [3, SW - 3]) for (let y = 4; y < 4 + 10 * rust; y++) if (bayer(sx, y) < 0.7) pc.blend(sx, y, 0x8a4a22, 0.6);
  // a dead company's name sprayed over
  if (s.defaced) {
    const w = textW(s.defaced, 2), x0 = SW - w - 14, y0 = 20;
    text(pc, s.defaced, x0 + 1, y0 + 1, 0x5a1010, 2);
    text(pc, s.defaced, x0, y0, 0xc0281e, 2);
    for (let i = 0; i < 4; i++) { const dx = x0 + 3 + i * 7; for (let y = y0 + 10; y < y0 + 10 + 2 + ((i * 5) % 4); y++) pc.set(dx, y, 0xb0261c); }
    pc.line(x0 - 4, y0 + 4, x0 + w + 2, y0 + 3, 0xc0281e);
  }
}

addTextureModule(() => {
  const A = atlas();
  SIGN_KEYS.forEach((k, i) => A.add('zf_sign_' + k, SW, SH, (pc) => drawSign(pc, SIGNS[k], 6100 + i * 17)));

  // the relay booth: the front panel (keypad, the handset's cradle, stencil), the CRT, the side
  A.add('zf_relay_face', 48, 72, (pc) => {
    pc.wrap = false;
    const E = makeRamp(0x2f5a56, 6, { spread: 0.3 });
    pc.fillRamp(E, (x, y) => 0.5 + (ph(x >> 2, y >> 2, 6301) - 0.5) * 0.2 + (y / 72) * -0.12, 0.8);
    // the screen bezel (the screen itself is its own lit face)
    pc.rect(6, 6, 36, 26, 0x121414); pc.strokeRect(5, 5, 38, 28, 0x0a0c0c); pc.hline(6, 41, 33, E[4]);
    // stencil
    textC(pc, 'RELAY', 24, 36, 0xd8f4e8);
    textC(pc, '0-A', 24, 42, 0x9ad8c4);
    // keypad: 3 x 4 caps
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
      const x = 13 + c * 8, y = 49 + r * 5;
      pc.rect(x, y, 6, 4, 0xc8c4b4); pc.hline(x, x + 5, y + 3, 0x7a786e); pc.vline(x + 5, y, y + 3, 0x8a887e); pc.set(x + 2, y + 1, 0x3a3a36);
    }
    // a lit LINK lamp, the card slot
    pc.rect(39, 50, 4, 4, 0x3cd8a0); pc.set(40, 51, 0xc8ffe8);
    pc.rect(5, 50, 6, 1, 0x0a0c0c); pc.rect(5, 52, 6, 1, 0x0a0c0c);
    // hazard foot
    for (let y = 68; y < 72; y++) for (let x = 0; x < 48; x++) pc.set(x, y, ((x + y) >> 2) % 2 ? 0xe2b23a : 0x1d1b17);
    for (let x = 0; x < 48; x++) for (let y = 0; y < 72; y++) if (ph(x, y, 6303) < 0.015) pc.set(x, y, 0x1a2a28);
    pc.strokeRect(0, 0, 48, 72, 0x13201f);
  });
  A.add('zf_relay_screen', 32, 24, (pc) => {
    pc.wrap = false;
    pc.fill(0x06140e);
    // phosphor: a held waveform, the word LINK, a bar meter
    for (let x = 1; x < 31; x++) { const y = Math.round(9 + Math.sin(x * 0.7) * 3 * Math.exp(-((x - 15) ** 2) / 90)); pc.set(x, y, 0x7affc0); pc.blend(x, y + 1, 0x3acf88, 0.5); }
    text(pc, 'LINK', 2, 16, 0x9affd0);
    for (let i = 0; i < 5; i++) pc.rect(19 + i * 2, 21 - i, 1, 1 + i, 0x6af0b0);
    for (let y = 0; y < 24; y += 2) for (let x = 0; x < 32; x++) pc.blend(x, y, 0x000000, 0.25);
    for (let x = 0; x < 32; x++) for (let y = 0; y < 24; y++) { const d = Math.hypot((x - 16) / 16, (y - 12) / 12); if (d > 0.8) pc.blend(x, y, 0x000000, Math.min(0.7, (d - 0.8) * 2)); }
  });
  A.add('zf_relay_side', 32, 72, (pc) => {
    pc.wrap = false;
    const E = makeRamp(0x2f5a56, 6, { spread: 0.3 });
    pc.fillRamp(E, (x, y) => 0.45 + (ph(x >> 2, y >> 2, 6311) - 0.5) * 0.2, 0.8);
    // louvres, a stencilled MERIDIAN, grime
    for (let k = 0; k < 6; k++) { const y = 8 + k * 3; pc.hline(8, 23, y, 0x0e1a19); pc.hline(8, 23, y + 1, E[4]); }
    textC(pc, 'MERIDIAN', 16, 34, 0xc4e4da);
    pc.vline(1, 0, 71, E[4]); pc.vline(30, 0, 71, E[1]);
    for (let x = 0; x < 32; x++) for (let y = 50; y < 72; y++) if (ph(x, y, 6312) < (y - 50) / 40) pc.blend(x, y, 0x1c1610, 0.3);
  });
  // the cargo lift's car: a riveted steel plate with Ostrander's stencil
  A.add('zf_lift_plate', 48, 48, (pc) => {
    pc.wrap = true;
    const S = makeRamp(0x5c6670, 6, { spread: 0.3 });
    pc.fillRamp(S, (x, y) => 0.5 + (ph(x >> 3, y >> 2, 6321) - 0.5) * 0.25, 0.8);
    for (const y of [0, 24]) { pc.hline(0, 47, y, S[1]); pc.hline(0, 47, y + 1, S[4]); }
    for (const y of [3, 21, 27, 45]) for (let x = 3; x < 48; x += 6) { pc.set(x, y, S[5]); pc.set(x + 1, y + 1, S[0]); }
    for (let x = 0; x < 48; x++) for (let y = 0; y < 48; y++) if (ph(x >> 1, y >> 2, 6322) < 0.08) pc.blend(x, y, 0x7a3e1c, 0.5);
    text(pc, 'OSTRANDER', 6, 10, 0xd8dce2);
  });
});

// ------------------------------------------------------------------ objects
defObj({
  key: 'fac_sign', name: 'Company Sign', height: 2.6, block: 'none', onWall: true, sound: 'metal', hp: 99999,
  desc: 'An enamelled plate screwed to the wall. Somebody meant this place to be found again.',
  tags: [...T, 'sign', 'wall'],
  variant: (s) => String(s.sign ?? 'meridian_outpost'),
  model: (mb, s) => {
    const k = SIGNS[String(s.sign)] ? String(s.sign) : 'meridian_outpost';
    // high on the wall, over the tallest racks and booths of the set under it
    mb.box(0, 2.06, -0.43, 1.28, 0.4, 0.035, { south: 'zf_sign_' + k, sides: 'metal_dark', top: 'metal_dark', bottom: 'metal_dark' }, { fit: { south: true } });
    for (const x of [-0.56, 0.56]) for (const y of [2.1, 2.4]) mb.box(x, y, -0.405, 0.035, 0.035, 0.02, 'metal_grey');
    // a little hooded lamp over it on its conduit
    mb.box(0, 2.5, -0.44, 0.03, 0.2, 0.03, 'metal_grey');
    mb.box(0, 2.49, -0.39, 0.32, 0.05, 0.1, 'metal_dark');
    mb.box(0, 2.475, -0.36, 0.28, 0.015, 0.05, 'q_glow_green', { emissive: 0.5, color: 0xfff2d0 });
  },
});

defObj({
  key: 'fac_sign_post', name: 'Company Sign', w: 1, d: 1, height: 2.0, block: 'low', sound: 'metal', hp: 400,
  desc: 'A plate on two posts driven into the floor. The paint on the posts is older than the plate.',
  tags: [...T, 'sign'],
  variant: (s) => String(s.sign ?? 'halcyon_camp'),
  model: (mb, s) => {
    const k = SIGNS[String(s.sign)] ? String(s.sign) : 'halcyon_camp';
    for (const x of [-0.6, 0.6]) { mb.box(x, 0, 0, 0.07, 1.6, 0.07, 'metal_rusty'); mb.box(x, 0, 0, 0.16, 0.05, 0.16, 'concrete'); }
    mb.box(0, 1.0, 0.02, 1.4, 0.45, 0.03, { south: 'zf_sign_' + k, north: 'metal_dark', sides: 'metal_dark', top: 'metal_dark', bottom: 'metal_dark' }, { fit: { south: true } });
    mb.box(0, 1.47, 0.02, 1.3, 0.025, 0.05, 'metal_dark');
  },
});

defObj({
  key: 'cp_relay', name: 'Relay Booth', w: 1, d: 1, height: 2.45, block: 'solid', tall: true, sound: 'metal', hp: 99999,
  light: { color: 0x7affc0, intensity: 0.55, radius: 3.2, y: 1.45, kind: 'screen', power: false, flicker: 0.02 },
  desc: 'A Meridian relay booth: a steel cabinet with a handset, a keypad and a green tube. It hums on its own cell. The plate says it holds the line for any unit that keys in.',
  tags: [...T, 'meridian', 'relay', 'checkpoint'],
  model: (mb) => {
    const zc = -0.1;
    // plinth, body, hood
    mb.box(0, 0, zc, 0.86, 0.08, 0.7, 'metal_dark');
    mb.box(0, 0.08, zc, 0.8, 2.0, 0.62, { south: 'zf_relay_face', north: 'zf_relay_side', sides: 'zf_relay_side', top: 'metal_dark' }, { fit: { south: true, east: true, west: true, north: true } });
    mb.box(0, 2.08, zc + 0.04, 0.9, 0.12, 0.74, 'metal_dark');
    mb.box(0, 2.2, zc + 0.04, 0.8, 0.05, 0.64, 'metal_grey');
    // the lit tube, set in its bezel (face texture: bezel at 6..42 x 6..32 of 48 x 72)
    mb.box(0, 0.08 + 2.0 * (1 - 32 / 72), zc + 0.312, 0.62, 2.0 * (26 / 72), 0.01, 'zf_relay_screen', { fit: true, emissive: 1.2 });
    // the handset on its hook, the coiled cord
    mb.box(0.47, 1.2, zc + 0.12, 0.08, 0.34, 0.12, 'plastic_black');
    mb.box(0.5, 1.48, zc + 0.12, 0.05, 0.08, 0.06, 'metal_grey');
    for (let i = 0; i < 6; i++) mb.box(0.46, 0.84 + i * 0.06, zc + 0.2, 0.05, 0.03, 0.05, 'plastic_black');
    // a shelf for the hand, a stencilled number plate
    mb.box(0, 0.98, zc + 0.36, 0.7, 0.04, 0.16, 'metal_grey');
    // antenna whip and its amber lamp
    mb.cylinder(-0.28, 2.25, zc - 0.15, 0.025, 0.85, 5, 'metal_grey');
    mb.cylinder(-0.28, 3.1, zc - 0.15, 0.04, 0.04, 6, 'plastic_yellow', { emissive: 1.4 });
    mb.cylinder(0.25, 2.25, zc, 0.07, 0.12, 8, 'plastic_yellow', { emissive: 0.9 });
    // the conduit to the floor
    mb.box(-0.36, 0.0, zc - 0.3, 0.06, 2.1, 0.06, 'metal_grey');
  },
});

defObj({
  key: 'fac_lift_cage', name: 'Cargo Lift', w: 2, d: 2, height: 3.0, block: 'solid', sound: 'metal', hp: 99999, tall: true,
  desc: 'An Ostrander cargo lift, its car jammed a hand\'s width below the floor. The cables still twitch now and then, as if somebody below keeps pressing the button.',
  tags: [...T, 'lift', 'ostrander'],
  model: (mb) => {
    // the car's floor (tread plate, hazard edge) sunk a little into the shaft
    mb.box(0, 0, 0, 1.9, 0.06, 1.9, { top: 'ix_tread', sides: 'ix_haz', bottom: 'metal_dark' });
    // four corner posts and the head frame
    for (const x of [-0.9, 0.9]) for (const z of [-0.9, 0.9]) mb.box(x, 0, z, 0.1, 2.9, 0.1, 'ix_steel');
    for (const z of [-0.9, 0.9]) mb.box(0, 2.82, z, 1.9, 0.12, 0.12, 'ix_steel');
    for (const x of [-0.9, 0.9]) mb.box(x, 2.82, 0, 0.12, 0.12, 1.9, 'ix_steel');
    mb.box(0, 2.94, 0, 0.5, 0.18, 0.5, 'metal_dark');
    // cables up into the dark
    for (const x of [-0.12, 0.12]) mb.cylinder(x, 3.1, 0, 0.025, 1.4, 5, 'metal_grey', { caps: false });
    // back and side walls: riveted plate to waist height, mesh above
    mb.box(0, 0.06, -0.9, 1.8, 1.1, 0.03, 'zf_lift_plate');
    for (const x of [-0.9, 0.9]) mb.box(x, 0.06, 0, 0.03, 1.1, 1.8, 'zf_lift_plate');
    for (let i = 0; i < 9; i++) { const y = 1.25 + i * 0.17; mb.box(0, y, -0.9, 1.8, 0.02, 0.02, 'metal_dark'); for (const x of [-0.9, 0.9]) mb.box(x, y, 0, 0.02, 0.02, 1.8, 'metal_dark'); }
    for (let i = 0; i < 10; i++) { const x = -0.81 + i * 0.18; mb.box(x, 1.16, -0.9, 0.02, 1.66, 0.02, 'metal_dark'); }
    // the scissor gate across the front, half drawn
    for (let i = 0; i < 7; i++) {
      const x = -0.85 + i * 0.16;
      mb.push(); mb.translate(x, 1.2, 0.92); mb.rotateZ(0.5); mb.box(0, -1.1, 0, 0.025, 2.2, 0.02, 'ix_steel'); mb.pop();
      mb.push(); mb.translate(x, 1.2, 0.92); mb.rotateZ(-0.5); mb.box(0, -1.1, 0, 0.025, 2.2, 0.02, 'ix_steel'); mb.pop();
    }
    mb.box(-0.2, 2.24, 0.92, 1.4, 0.05, 0.05, 'ix_steel');
    // the control box with its lever and a dead lamp
    mb.box(0.95, 1.0, 0.75, 0.12, 0.42, 0.22, 'metal_painted_green');
    mb.box(1.02, 1.3, 0.75, 0.04, 0.2, 0.03, 'plastic_red');
    mb.cylinder(1.0, 1.44, 0.75, 0.035, 0.04, 6, 'plastic_red', { emissive: 0.2 });
  },
});

// ------------------------------------------------------------------ loot
defLoot('fac_outpost', [2, 4], [['specimen_jar', 3], ['syringe', 2], ['gloves_rubber', 2], ['lab_coat', 1], ['bandage', 2], ['battery', 2], ['circuit_board', 1], ['floppy_disk', 2], ['water_bottle', 1], ['@lab_cabinet', 2]], 0.1);
defLoot('fac_containment', [2, 4], [['specimen_jar', 4], ['gas_mask', 1], ['gloves_rubber', 2], ['zip_ties', 2], ['syringe', 2], ['first_aid_kit', 1], ['duct_tape', 1], ['flare', 1]], 0.15);
defLoot('fac_maint', [2, 5], [['screwdriver', 2], ['wrench', 2], ['pliers', 2], ['multitool', 1], ['duct_tape', 3], ['wire', 3], ['fuse', 3], ['screws', 3], ['battery', 2], ['hard_hat', 1], ['gloves_work', 2], ['crowbar', 1]], 0.1);
defLoot('fac_survey', [2, 4], [['compass', 2], ['binoculars', 1], ['rope', 2], ['flare', 2], ['matches', 2], ['lighter', 1], ['canteen', 2], ['ration_bar', 3], ['chalk', 2], ['walkie_talkie', 1], ['tape_cassette', 1]], 0.15);
defLoot('fac_checkpoint', [1, 3], [['flashlight', 2], ['battery', 3], ['walkie_talkie', 1], ['zip_ties', 3], ['bandage', 2], ['ration_bar', 2], ['almond_water', 1]], 0.2);
defLoot('fac_cargo', [2, 5], [['rope', 2], ['scrap_metal', 3], ['sheet_metal', 2], ['screws', 2], ['duct_tape', 2], ['ration_bar', 2], ['water_bottle', 2], ['pipe', 1], ['hammer', 1]], 0.15);
defLoot('fac_server', [1, 3], [['circuit_board', 3], ['electronics_scrap', 3], ['wire', 3], ['floppy_disk', 2], ['battery', 2], ['screwdriver', 1]], 0.15);

// ------------------------------------------------------------------ lore left on the desks
defLore({ id: 'zf_outpost_log', title: 'FIELD OUTPOST: DUTY LOG', style: 'terminal', text: `> MERIDIAN INSTITUTE OF LIMINALITY / FIELD OUTPOST / LOCAL LOG

0614  Outpost powered from its own cell. Relay to Processing: GOOD.
0640  Two samples banked (wall tissue, carpet mycelium). Labels in the cabinet.
0912  Unit 4471 did not come back from the east corridor. Band telemetry ends mid-step.
0915  Dr. Calder asks that we stop writing "did not come back". Preferred: "left coverage".
1300  The specimen tank turned to face the door again. Nobody touched it.
1301  Outpost relocated twice this quarter. The corridors relocate faster.

> END OF LOCAL LOG. SYNC PENDING.` });
defLore({ id: 'zf_outpost_memo', title: 'Memo: on the outposts', style: 'paper', text: `To all field staff,

An outpost is a lab bench, a cabinet, a tank and a relay. It is not a home. Do not sleep in it. Do not name it.

Samples go in the cabinet, labelled with the level and the hour. If the hour on your watch and the hour on the wall disagree, write both.

If an Argent-Vale crew asks to share the outpost, the answer is no. If they insist, the answer is still no, and you will log their badge numbers.

— Facilities & Field Operations, Meridian Institute of Liminality` });
defLore({ id: 'zf_argent_manifest', title: 'ARGENT-VALE: CONTAINMENT MANIFEST', style: 'paper', text: `ARGENT-VALE BIOSECURE · DEPOT MANIFEST · CLASS II

POD 1   carpet mycelium, living, 40 kg      SEALED
POD 2   "wall tissue", source unknown        SEALED
TANK    juvenile inhabitant, unnamed          FEEDING
CRATES  sundries, rations, field kit          OPEN

Note from the depot lead: Meridian claims everything below Level 0 is theirs by contract. We found this place first. We will be here when their contract runs out.

Do not feed the tank by hand.` });
defLore({ id: 'zf_argent_memo', title: 'Argent-Vale: staff notice', style: 'paper', text: `NOTICE TO ALL ARGENT-VALE STAFF

1. Meridian "units" are not staff. Do not share food, water or the depot code with them.
2. If a unit keys a Meridian relay inside our perimeter, report it. Their relays copy the room. That includes our pods.
3. The pods hum louder when someone is lying to them. This is not a joke and it is not in the training.

Thank you for choosing containment.` });
defLore({ id: 'zf_maint_order', title: 'Work order #7-0412', style: 'paper', text: `MERIDIAN FACILITIES · WORK ORDER 7-0412

Location: Maintenance 7 (this one).
Fault: generator coughs, lights dim when it does. The walls dim too.
Parts: 3 fuses, 1 belt, wire (lots).
Status: OPEN since — (the date has been rubbed out and rewritten four times).

Tech's note: don't run the bench grinder after the lights flicker twice. Something in the walls likes the noise.` });
defLore({ id: 'zf_halcyon_journal', title: 'Halcyon Survey: field journal', style: 'paper', text: `HALCYON SURVEY CO. · CAMP ELEVEN · JOURNAL

Day 3. Pegged the hall from the tent to the lights. 214 paces. Walked it back: 190.
Day 5. Pegged it again. 260. Ruiz says the tape is stretching. The tape is steel.
Day 9. Head office radioed: the company has been sold. To whom, they would not say. Survey to continue.
Day 12. Head office does not answer. The radio still hisses when we talk about leaving.
Day 13. Someone in a Meridian jumpsuit walked through camp, looked at the map, and laughed.

(the last page is a map of the camp. There is a tent on it that is not here.)` });
defLore({ id: 'zf_halcyon_notice', title: 'Halcyon Survey Co.: notice of closure', style: 'paper', text: `NOTICE

The Halcyon Survey Company has ceased trading. All camps are to be struck and all crews recalled.

Equipment remaining in the field is now the property of the receiver.

Crews unable to return should wait at camp for collection.

(Underneath, in pencil:) Waiting. Day 40.` });
defLore({ id: 'zf_checkpoint_orders', title: 'CHECKPOINT: POST ORDERS', style: 'terminal', text: `> MERIDIAN CUSTODY / CHECKPOINT POST ORDERS

1. Every unit presents its band at the barrier.
2. The relay booth beside the post holds the line for any unit that keys in. A keyed unit can be put back here if it is lost: same level, same room, the world exactly as the relay saw it.
3. A re-entry is a new file on the old world. The world does not reset. Only the unit does.
4. Officers do not key in. Officers do not get lost.

> POST UNMANNED SINCE: [NO DATA]` });
defLore({ id: 'zf_relay_manual', title: 'RELAY BOOTH: OPERATOR CARD', style: 'terminal', text: `> MERIDIAN RELAY 0-A · OPERATOR CARD

PICK UP THE HANDSET. KEY IN. HOLD THE LINE UNTIL THE TUBE SHOWS LINK.

The relay takes a full copy: the unit, what it carries, and the level around it as it stands.
If the unit is deleted, the operator may RE-ENTER from the last relay held.
The Remittance Presses log a unit the same way when it feeds them.

The relay does not take requests. The relay does not take complaints.

> LINK READY` });
defLore({ id: 'zf_ostrander_notice', title: 'Ostrander Lift & Freight', style: 'paper', text: `OSTRANDER LIFT & FREIGHT · SAFETY NOTICE

This lift is rated for 2000 kg of freight. It is NOT rated for riders.
Riders who have used the lift anyway report arriving on floors that are not on the indicator.
Riders who have used the lift anyway report arriving.

Ostrander Lift & Freight went into administration in the spring. The lifts did not get the letter.` });
defLore({ id: 'zf_server_note', title: 'Taped to the rack', style: 'paper', text: `If the rack lights blink in a pattern that repeats every seven seconds, DO NOT write the pattern down.

If you have already written the pattern down, DO NOT read it aloud.

If you have already read it aloud, the relay on the next floor is still working. Use it.

— IT` });

/** the notes each facility kind leaves about (the generator picks from these) */
export const FAC_NOTES: Record<string, string[]> = {
  outpost: ['zf_outpost_memo'], containment: ['zf_argent_manifest', 'zf_argent_memo'], maint: ['zf_maint_order'],
  survey: ['zf_halcyon_journal', 'zf_halcyon_notice'], checkpoint: ['zf_relay_manual'], cargo: ['zf_ostrander_notice'], server: ['zf_server_note'], relay: ['zf_relay_manual'],
};

installFacilities();
