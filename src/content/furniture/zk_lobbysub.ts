// Level 0's sub-stages (src/world/gen/z_lobbysub.ts): the long hallway, the tall
// stairwell, the empty void of floors and the chute. The doorway between them
// (a piece of yellow wall with an opening onto nothing, the way the old found
// footage cuts from one room to the next), the mouth of the chute, and the
// carpet ramp you go down it on. Prefix: lv_
import { defObj } from '../../world/objects';
import { defFloor } from '../../world/defs';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { FLOOR_GLOSS } from '../../gfx/wetmap';
import { makeRamp, mixHex, ph, tileFbm } from './b_common';
import type { PixelCanvas } from '../../gfx/pixel';

const T = ['lobby', 'lv'];

/** the chute: carpet worn to a sheen down the middle, scuffed where people have gone down it */
defFloor({ key: 'lv_chute', name: 'Chute Carpet', tex: ['lv_chute'], sound: 'carpet', slow: 1.1 });
FLOOR_GLOSS.lv_chute = 0.3;

/** the opening in a doorway: dark, with a dim yellow far wall a long way off */
function doorDark(pc: PixelCanvas) {
  pc.wrap = false;
  const W = pc.w, H = pc.h;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const cx = Math.abs(x + 0.5 - W / 2) / (W / 2), cy = (y + 0.5) / H;
    const far = Math.max(0, 1 - Math.max(cx * 1.8, Math.abs(cy - 0.62) * 2.6));
    pc.set(x, y, mixHex(0x0a0904, mixHex(0x6a5a20, 0xd8c060, far * 0.6), far * 0.85));
  }
  for (let x = Math.floor(W * 0.38); x < Math.ceil(W * 0.62); x++) pc.set(x, Math.floor(H * 0.4), 0xfff2b0);
}
/** the chute's mouth: a round hole in the carpet, fraying at the rim */
function mouth(pc: PixelCanvas) {
  pc.wrap = false; pc.clear();
  const W = pc.w;
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const d = Math.hypot(x + 0.5 - W / 2, y + 0.5 - W / 2) / (W / 2) + (tileFbm(x, y, W, W, 3, 2, 7501) - 0.5) * 0.15;
    if (d > 1) continue;
    pc.set(x, y, d > 0.86 ? 0x8a7a30 : d > 0.75 ? 0x2a2410 : mixHex(0x050402, 0x1a1608, Math.max(0, d - 0.3)), d > 0.86 ? 200 : 255);
  }
}
function chuteCarpet(pc: PixelCanvas) {
  const R = makeRamp(0xc8b45a, 6, { spread: 0.25, hueShift: 0.02 });
  for (let y = 0; y < pc.h; y++) for (let x = 0; x < pc.w; x++) {
    const n = tileFbm(x, y, pc.w, pc.h, 4, 2, 7511) * 0.6 + ph(x, y, 7513) * 0.4;
    let c = R[n < 0.3 ? 1 : n < 0.62 ? 2 : n < 0.88 ? 3 : 4];
    // the polished track down the middle (the chute runs along x)
    const k = 1 - Math.abs(y + 0.5 - pc.h / 2) / (pc.h / 2);
    if (k > 0.45) c = mixHex(c, 0xf4e8a8, (k - 0.45) * 0.7);
    if (y % 8 === 0) c = mixHex(c, R[0], 0.3);
    pc.set(x, y, c);
  }
}

addTextureModule(() => {
  const A = atlas();
  A.add('lv_dark', 24, 48, doorDark);
  A.add('lv_mouth', 32, 32, mouth);
  A.add('lv_chute', 32, 32, chuteCarpet);
});

defObj({
  key: 'lv_doorway', name: 'Doorway', w: 1, height: 2.7, block: 'none', onWall: true, movable: 0, sound: 'wood', hp: 99999,
  desc: 'A doorway in the yellow wall with no door in it. Through it the carpet carries on, and the light carries on, a lot further than the building does.',
  tags: [...T, 'portal'],
  model: (mb) => {
    // the opening, set back into the wall, with a yellow architrave round it
    mb.box(0, 0, -0.47, 0.82, 2.1, 0.02, { south: 'lv_dark', all: 'lv_dark' }, { fit: { south: true }, emissive: 0.2, bevel: false });
    for (const x of [-0.46, 0.46]) mb.box(x, 0, -0.44, 0.1, 2.2, 0.08, 'wood_trim', { color: 0xe8d890 });
    mb.box(0, 2.1, -0.44, 1.02, 0.1, 0.08, 'wood_trim', { color: 0xe8d890 });
  },
});
