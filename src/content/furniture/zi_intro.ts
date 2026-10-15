// Props for the opening sequence (zone `reality`, src/world/gen/z_reality.ts):
// the night-shift break room of the Meridian Institute's Annex B before the
// player noclips out of it. A portable radio, the staff-room plaque and a
// wet-floor sign by the door where the rain gets in.
import { defObj } from '../../world/objects';
import { atlas, addTextureModule, makeRamp, scaleHex, ph, txt, txtC, txtW, WZ } from './a_lib';

const T = ['intro', 'zi'];

addTextureModule(() => {
  const A = atlas();

  // portable radio front: speaker grille on the left, lit tuning window on the right
  A.add('zi_radio_front', 24, 12, (pc) => {
    pc.wrap = false;
    const B = makeRamp(0x3a3532, 5, { spread: 0.3 });
    pc.fillRamp(B, (x, y) => 0.5 + (ph(x >> 1, y >> 1, 4401) - 0.5) * 0.2, 0.6);
    pc.strokeRect(0, 0, 24, 12, B[0]);
    pc.hline(1, 22, 1, B[4]);
    // grille: punched dots
    for (let y = 3; y < 10; y++) for (let x = 2; x < 11; x++) if ((x + y) % 2 === 0) pc.set(x, y, 0x141210);
    pc.strokeRect(1, 2, 11, 9, B[1]);
    // tuning window (the lit part is a separate emissive box on the model)
    pc.rect(13, 3, 9, 4, 0x1a1712);
    for (let x = 14; x < 21; x += 2) pc.set(x, 4, 0x6a5a40);
    // knobs
    pc.rect(14, 8, 2, 2, 0xb8b0a0); pc.rect(19, 8, 2, 2, 0xb8b0a0);
    pc.set(14, 8, 0xe8e0d0); pc.set(19, 8, 0xe8e0d0);
  });

  // glowing dial strip: amber backlight, frequency ticks and the red needle
  A.add('zi_radio_dial', 16, 4, (pc) => {
    pc.wrap = false;
    pc.fill(0xf0b050);
    for (let x = 0; x < 16; x++) pc.set(x, 0, 0xffd890);
    for (let x = 1; x < 16; x += 2) pc.set(x, 3, 0x8a5a20);
    pc.vline(9, 0, 3, 0xc02018);
  });

  // brass-on-brown plaque by the door
  A.add('zi_plaque', 40, 16, (pc) => {
    pc.wrap = false;
    const W = makeRamp(0x5a3a22, 5, { spread: 0.3 });
    pc.fillRamp(W, (x, y) => 0.45 + (ph(x >> 2, y, 4410) - 0.5) * 0.3 + (y < 2 ? 0.2 : 0), 0.6);
    pc.strokeRect(0, 0, 40, 16, W[0]);
    pc.strokeRect(1, 1, 38, 14, 0xb08a3a);
    const ink = 0xe8c66a, sh = 0x2a1a0e;
    txtC(pc, 'MERIDIAN INSTITUTE', 20, 3, ink);
    const s = 'ANNEX B - STAFF ROOM';
    txt(pc, s, Math.round(20 - txtW(s) / 2), 9, scaleHex(ink, 0.85));
    for (let x = 4; x < 36; x++) if (ph(x, 0, 4411) < 0.2) pc.set(x, 15, sh);
  });

  // a drop-ceiling tile (the void is full of them): off-white fibreboard, pinholes, a water ring
  A.add('zi_ceiling', 32, 32, (pc) => {
    pc.wrap = false;
    const C = makeRamp(0xd8d2bc, 4, { spread: 0.18 });
    pc.fillRamp(C, (x, y) => 0.62 + (ph(x >> 2, y >> 2, 4430) - 0.5) * 0.18, 0.5);
    for (let y = 2; y < 30; y++) for (let x = 2; x < 30; x++) if (ph(x, y, 4431) < 0.07) pc.set(x, y, C[0]);
    pc.strokeRect(0, 0, 32, 32, 0x8a8478);
    pc.hline(1, 30, 1, C[3]); pc.vline(1, 1, 30, C[3]);
    for (let a = 0; a < 40; a++) { const t = a / 40 * Math.PI * 2; pc.blend(Math.round(20 + Math.cos(t) * 6), Math.round(19 + Math.sin(t) * 5), 0xb09a5a, 0.55); }
  });

  // yellow caution card for the wet-floor sign
  A.add('zi_wet_card', 16, 24, (pc) => {
    pc.wrap = false;
    const Y = makeRamp(0xe2b81e, 4, { spread: 0.25 });
    pc.fillRamp(Y, (x, y) => 0.6 + (ph(x, y >> 2, 4420) - 0.5) * 0.15, 0.5);
    pc.strokeRect(0, 0, 16, 24, Y[0]);
    // warning triangle with a slipping figure
    for (let y = 0; y < 8; y++) { pc.set(8 - (y >> 1) - 1, 3 + y, 0x1a1608); pc.set(8 + (y >> 1), 3 + y, 0x1a1608); }
    pc.hline(3, 12, 11, 0x1a1608);
    pc.set(8, 6, 0x1a1608); pc.set(7, 7, 0x1a1608); pc.set(8, 8, 0x1a1608); pc.set(6, 9, 0x1a1608); pc.set(9, 9, 0x1a1608);
    txtC(pc, 'WET', 8, 14, 0x1a1608);
    txtC(pc, 'FLOOR', 8, 19, 0x1a1608);
  });
});

defObj({
  key: 'zi_radio', name: 'Portable Radio', height: 0.22, block: 'none', movable: 2, power: true,
  sound: 'plastic', flammable: 0.3, desc: 'Somebody\'s radio, left on the counter for the night shift. Tuned to a station that only plays slow songs after midnight.',
  tags: [...T, 'radio', 'surface_item', 'appliance'],
  disassemble: { tools: ['#screwdriver'], time: 6, skill: 'electrical', yields: [['electronics_scrap', 1, 1], ['wire', 0, 1]] },
  model: (mb) => {
    mb.box(0, 0, 0, 0.38, 0.19, 0.11, { south: 'zi_radio_front', all: 'plastic_black' }, { fit: { south: true }, color: 0xb0a090 });
    mb.box(0.075, 0.105, 0.056, 0.13, 0.035, 0.004, 'zi_radio_dial', { fit: true, emissive: 1.2 });
    // carry handle and a bent antenna
    mb.box(-0.15, 0.19, 0, 0.02, 0.05, 0.03, 'chrome');
    mb.box(0.15, 0.19, 0, 0.02, 0.05, 0.03, 'chrome');
    mb.box(0, 0.235, 0, 0.32, 0.018, 0.03, 'plastic_black');
    mb.push(); mb.translate(0.17, 0.19, -0.03); mb.rotateZ(-0.5);
    mb.box(0, 0, 0, 0.01, 0.34, 0.01, 'chrome');
    mb.pop();
    for (const x of [-0.15, 0.15]) mb.box(x, -0.005, 0, 0.05, 0.01, 0.08, 'rubber_black');
  },
});

defObj({
  key: 'zi_plaque', name: 'Room Plaque', height: 1.9, block: 'none', onWall: true, hp: 99999, sound: 'wood',
  desc: 'MERIDIAN INSTITUTE. ANNEX B. STAFF ROOM. Somebody has scratched a small smiley face into the varnish.',
  tags: [...T, 'sign', 'wall'],
  model: (mb) => {
    mb.box(0, 1.52, WZ + 0.012, 0.9, 0.36, 0.024, { south: 'zi_plaque', all: 'wood_dark' }, { fit: { south: true } });
    for (const x of [-0.4, 0.4]) mb.box(x, 1.68, WZ + 0.028, 0.025, 0.025, 0.008, 'metal_brass');
  },
});

defObj({
  key: 'zi_wet_sign', name: 'Wet Floor Sign', height: 0.62, block: 'low', movable: 1, sound: 'plastic', flammable: 0.4,
  desc: 'CAUTION. WET FLOOR. Rain comes in under the staff door every time it storms.',
  tags: [...T, 'sign'],
  model: (mb) => {
    // a folding A-frame: two cards leaning against each other
    for (const s of [1, -1]) {
      mb.push(); mb.translate(0, 0, s * 0.1); mb.rotateX(s * 0.2);
      mb.box(0, 0, 0, 0.3, 0.6, 0.02, { south: 'zi_wet_card', north: 'zi_wet_card', all: 'plastic_yellow' }, { fit: { south: true, north: true } });
      mb.pop();
    }
    mb.box(0, 0.58, 0, 0.3, 0.04, 0.06, 'plastic_yellow');
  },
});
