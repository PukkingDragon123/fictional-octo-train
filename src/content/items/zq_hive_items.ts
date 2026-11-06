// Items of the hive at the Honey Pools (the Queen Bee and her Bee Keepers,
// src/creatures/species/queen_bee.ts, bee_keeper.ts) and of the remains the
// bees forage from (src/world/remains): royal jelly, brood comb, the Bee
// Keeper's compound-eye cluster, and the ID strips off dead units.
import { defItem } from '../../items/item';
import { defLoot } from '../../items/loot';
import { tex, rp, ph, type MB } from './_kit';
import { blob, tube } from '../../creatures/kit/anomalies';

const S_JELLY = tex('i_royal_jelly', 8, 8, (pc) => { const R = rp(0xf0e0b0, 6, 0.4); pc.each((x, y) => pc.set(x, y, R[2 + (ph(x, y, 401) < 0.3 ? 1 : 0) + (ph(x >> 1, y >> 1, 402) < 0.2 ? 2 : 0)])); pc.set(2, 2, 0xffffff); pc.set(5, 3, 0xfff8e8); }, true);
const S_COMB = tex('i_brood_comb', 12, 12, (pc) => {
  pc.fill(0xc89a3a);
  for (let y = 0; y < 12; y += 3) for (let x = (y / 3) % 2 ? 1 : 0; x < 12; x += 3) {
    pc.set(x, y, 0x8a5a1a); pc.set(x + 1, y, 0xe8c060);
    const grub = ph(x, y, 411) < 0.6;
    pc.set(x + 1, y + 1, grub ? 0xf4ecd8 : 0x6a3a10); pc.set(x, y + 1, grub ? 0xe0d4b8 : 0x8a5a1a);
  }
}, true);
const S_TAG = tex('i_meridian_tag', 12, 6, (pc) => {
  pc.fill(0xe8e4d8);
  pc.rect(1, 1, 3, 4, 0x8a6a4a);
  pc.set(6, 2, 0x2a3a6a); pc.set(7, 2, 0x2a3a6a); pc.set(6, 3, 0x2a3a6a); pc.set(7, 3, 0x2a3a6a);
  for (let x = 5; x < 11; x += 2) pc.set(x, 4, 0x2a2a2a);
  pc.set(10, 1, 0x5a2418); pc.set(9, 1, 0x7a3a28); pc.set(10, 2, 0x5a2418);
});
const S_EYE = tex('i_keeper_eye', 8, 8, (pc) => { pc.fill(0x14161c); pc.each((x, y) => { if ((x + (y & 1)) % 2 === 0) pc.set(x, y, 0x262a34); }); pc.set(2, 2, 0xc8d0e0); pc.set(3, 2, 0x8890a8); }, true);
const S_WAX = tex('i_keeper_wax', 8, 8, (pc) => { const R = rp(0xd89a30, 6, 0.5); pc.each((x, y) => pc.set(x, y, R[2 + (ph(x, y, 421) < 0.35 ? 1 : 0)])); pc.set(3, 2, 0xfff0c8); }, true);

defItem({
  key: 'meridian_tag', name: 'Unit ID Strip', cat: 'lore', weight: 0.01, value: 6, tags: ['lore', 'meridian', 'badge'],
  desc: 'A Meridian ID strip cut off the chest of a dead unit\'s hazmat: a number, a photo gone brown, the M in its circle. The Institute pays a small bounty for every one returned. Nobody asks what happened to the rest.',
  model: (mb: MB) => {
    mb.box(0, 0, 0, 0.07, 0.004, 0.035, { top: S_TAG, sides: 'white' }, { fit: { top: true }, bevel: false });
    tube(mb, [[0.035, 0.002, 0.0], [0.05, 0.003, 0.012], [0.058, 0.002, 0.026]], 0.002, 4, 'metal_grey', { capEnd: true });
  },
});
defItem({
  key: 'royal_jelly', name: 'Royal Jelly', cat: 'food', weight: 0.15, value: 40, tags: ['weird', 'sweet', 'hive'],
  food: { hunger: 22, thirst: 4, calories: 640, unhappy: -18, stress: -12, ingredient: 'weird', fresh: 6, rot: 14 },
  desc: 'A warm, pearly paste scraped from the Queen\'s brood cells, the stuff her grubs grow fat on. It tastes of nothing at all, then of everything sweet you have ever eaten. Units who eat it sleep well and dream about being fed.',
  model: (mb: MB) => {
    blob(mb, [0, 0.025, 0], [0.04, 0.025, 0.035], 10, 5, S_JELLY, { disp: (d, u) => 1 + 0.08 * Math.sin(u * 18) * (d[1] + 0.5) });
    blob(mb, [0.02, 0.045, 0.01], [0.015, 0.012, 0.015], 7, 4, S_JELLY);
  },
});
defItem({
  key: 'brood_comb', name: 'Brood Comb', cat: 'food', weight: 0.35, value: 14, tags: ['weird', 'hive'],
  food: { hunger: 30, calories: 900, raw: true, cookable: true, cookMins: 12, poison: 0.15, fresh: 2, rot: 4, unhappy: 6, ingredient: 'meat', cookedName: 'Roasted Brood' },
  desc: 'A slab of the hive\'s wax comb, every cell capped over a fat white grub the length of your thumb. They are still moving. Roasted they taste of nuts and butter.',
  model: (mb: MB) => {
    mb.box(0, 0, 0, 0.14, 0.035, 0.1, { top: S_COMB, sides: S_WAX, bottom: S_WAX }, { fit: { top: true } });
    for (let i = 0; i < 3; i++) blob(mb, [-0.04 + i * 0.04, 0.04, 0.02 - (i % 2) * 0.03], [0.012, 0.008, 0.02], 6, 3, S_JELLY);
  },
});
defItem({
  key: 'keeper_eye', name: 'Compound-Eye Cluster', cat: 'anomaly', weight: 0.08, value: 55, anomaly: 'ledge', tags: ['anomalous', 'hive', 'research'],
  desc: 'A knot of glossy black compound eyes cut out of a Bee Keeper\'s face, each the size of a grape, still wet. The facets catch light the way a living eye does. The lab wants to know how a human face grew them.',
  model: (mb: MB) => {
    for (let i = 0; i < 5; i++) { const a = i * 1.26; blob(mb, [Math.cos(a) * 0.02, 0.02 + (i % 2) * 0.008, Math.sin(a) * 0.02], [0.016, 0.014, 0.016], 8, 5, S_EYE); }
    blob(mb, [0, 0.008, 0], [0.03, 0.01, 0.03], 8, 3, S_WAX);
  },
});
defItem({
  key: 'keeper_wax', name: 'Keeper Wax', cat: 'material', weight: 0.12, value: 12, tags: ['wax', 'fuel', 'weird'],
  desc: 'Honey wax that seeped out of a Bee Keeper\'s skin and set in drips. Darker than the bees\' and it smells of a person\'s sweat as well as honey. It burns slow and clean.',
  model: (mb: MB) => {
    blob(mb, [0, 0.02, 0], [0.035, 0.02, 0.03], 8, 4, S_WAX);
    tube(mb, [[0.02, 0.03, 0], [0.03, 0.01, 0.005], [0.032, -0.005, 0.006]], (t) => 0.008 - t * 0.004, 5, S_WAX, { capEnd: true });
  },
});

// corpses (src/creatures/species/queen_bee.ts, bee_keeper.ts): the manager rolls creature_<key>
defLoot('creature_queen_bee', [4, 7], [['royal_jelly', 4], ['brood_comb', 4], ['honey_wax', 5], ['bee_fuzz', 5], ['meridian_tag', 1]], 0);
defLoot('creature_bee_keeper', [1, 3], [['keeper_wax', 4], ['keeper_eye', 2], ['bee_fuzz', 3], ['honey_wax', 2]], 0);
// the hive's brood comb (src/content/furniture/zq_hive.ts)
defLoot('qb_brood', [1, 2], [['brood_comb', 4], ['royal_jelly', 1], ['honey_wax', 3]], 0.2);
