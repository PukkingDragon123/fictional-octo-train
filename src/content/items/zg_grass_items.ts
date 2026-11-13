// Cut grass (src/gfx/grass.ts): swing a blade or an axe through the grass on
// the open levels and the tops come off; now and then a handful drops to pick
// up. It burns fast and twists into a rough cord.
import { defItem } from '../../items/item';
import { defRecipe } from '../../items/recipes';
import { tex, ph, type MB } from './_kit';

const S_BLADES = tex('i_cut_grass', 8, 8, (pc) => {
  const R = [0x2f5a2c, 0x3f7638, 0x5a9446, 0x86b458, 0xc4d47a];
  pc.each((x, y) => pc.set(x, y, R[Math.min(4, Math.max(0, Math.floor((7 - y) / 2) + (ph(x, y >> 1, 9811) < 0.25 ? 1 : 0)))]));
  for (let y = 0; y < 8; y += 3) pc.set((y * 3) % 8, y, 0xd8c886);
}, true);
const S_CORD = tex('i_grass_cord', 8, 8, (pc) => {
  pc.each((x, y) => pc.set(x, y, (x + y) % 4 < 2 ? 0x8a9a52 : 0x6a7a3e));
  pc.each((x, y) => { if ((x + y) % 4 === 0) pc.set(x, y, 0xb8b86a); });
}, true);

defItem({
  key: 'cut_grass', name: 'Cut Grass', cat: 'material', weight: 0.05, value: 0, burn: 0.05, tags: ['plant', 'fiber', 'tinder'],
  desc: 'A handful of grass, cut green. It smells of a summer that never happened here. It dries into tinder and twists into cord.',
  model: (mb: MB) => {
    for (let i = 0; i < 9; i++) {
      const a = (i - 4) * 0.09, l = 0.13 + ph(i, 3, 9812) * 0.06;
      mb.push().translate(0, 0.006 + (i % 3) * 0.003, 0).rotateY(a);
      mb.box(0, 0, 0, 0.012, 0.004, l, S_BLADES);
      mb.pop();
    }
    mb.box(0, 0.012, -0.01, 0.05, 0.008, 0.014, S_BLADES, { color: 0x9aa860 });
  },
});

defItem({
  key: 'grass_cord', name: 'Grass Cord', cat: 'material', weight: 0.08, value: 1, burn: 0.1, tags: ['binding', 'strips', 'fiber', 'tinder'],
  desc: 'Green grass twisted back on itself into a rough cord, an arm long. It holds a splint, a snare, a bundle of sticks. It will not hold you.',
  model: (mb: MB) => {
    for (let i = 0; i < 6; i++) { mb.push().translate(0, 0.008, -0.06 + i * 0.024).rotateY(0.35 * (i % 2 ? 1 : -1)); mb.box(0, 0, 0, 0.014, 0.012, 0.03, S_CORD); mb.pop(); }
  },
});

defRecipe({
  key: 'twist_grass_cord', name: 'Twist Grass into Cord', category: 'survival', time: 8,
  inputs: [{ item: 'cut_grass', count: 5 }], outputs: [{ item: 'grass_cord' }], anim: 'craft',
  desc: 'Five handfuls of cut grass, twisted and doubled back.',
} as any);
