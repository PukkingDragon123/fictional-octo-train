// What the damp-level inhabitants leave behind (round 15, src/creatures/lore_fungus_sea.ts
// harvest lists): the Fungus Mind and its nodes, Spore Rats, the Bacteria Mass, the
// Land Jellyfish, the Whale Corpse (cut from it through its menu) and Sea Worms;
// and their corpse loot tables (`creature_<speciesKey>`).
import { defItem } from '../../items/item';
import { defLoot } from '../../items/loot';
import { tex, rp, ph, type MB } from './_kit';
import { blob, tube } from '../../creatures/kit/anomalies';

const S_RIND = tex('i_fs_rind', 8, 8, (pc) => { const R = rp(0x3a2a48, 6, 0.6); pc.each((x, y) => pc.set(x, y, R[1 + (ph(x, y, 801) < 0.3 ? 2 : 0) + (ph(x >> 1, y, 802) < 0.15 ? 3 : 0)])); pc.set(2, 2, 0xe0d0ff); }, true);
const S_GREY = tex('i_fs_grey', 8, 8, (pc) => { const R = rp(0xa098a8, 5, 0.4); pc.each((x, y) => pc.set(x, y, R[2 + (ph(x, y, 803) < 0.3 ? 1 : 0) - (ph(x, y, 804) < 0.12 ? 2 : 0)])); }, true);
const S_SAC = tex('i_fs_sac', 8, 8, (pc) => { const R = rp(0x8a7a8a, 5, 0.5); pc.each((x, y) => pc.set(x, y, ph(x, y, 805) < 0.14 ? 0x2a2030 : R[2 + (ph(x, y, 806) < 0.3 ? 1 : 0)])); }, true);
const S_FELT = tex('i_fs_felt', 8, 8, (pc) => { pc.each((x, y) => pc.set(x, y, ph(x, y, 807) < 0.4 ? 0xf2eef2 : ph(x, y, 808) < 0.3 ? 0xc8c0cc : 0xdcd6de)); }, true);
const S_INK = tex('i_fs_ink', 8, 8, (pc) => { const R = rp(0xe0dad6, 5, 0.6); pc.each((x, y) => pc.set(x, y, y > 5 && ph(x, 0, 809) < 0.6 ? 0x1a1418 : R[2 + (ph(x, y, 810) < 0.3 ? 1 : -1)])); }, true);
const S_TAN = tex('i_fs_tan', 8, 8, (pc) => { const R = rp(0xc89a50, 5, 0.6); pc.each((x, y) => pc.set(x, y, ph(x, y, 811) < 0.15 ? 0xf0e0b8 : R[2 + (ph(x, y, 812) < 0.3 ? 1 : 0)])); }, true);
const S_SLIME = tex('i_fs_slime', 8, 8, (pc) => { const R = rp(0xc8c088, 5, 0.5); pc.each((x, y) => pc.set(x, y, ph(x, y, 813) < 0.08 ? 0xffffff : ph(x >> 1, y >> 1, 814) < 0.2 ? 0x8aa030 : R[2 + (ph(x, y, 815) < 0.3 ? 1 : 0)])); }, true);
const S_GLASS = tex('i_fs_jar', 8, 8, (pc) => { pc.each((x, y) => pc.set(x, y, x === 1 ? 0xffffff : x > 5 ? 0xa8b8bc : 0xd0dcdc)); }, true);
const S_JELLY = tex('i_fs_jelly', 8, 8, (pc) => { const R = rp(0xc8c8f8, 5, 0.4); pc.each((x, y) => pc.set(x, y, R[2 + (ph(x, y, 816) < 0.25 ? 1 : 0)])); pc.set(3, 3, 0xb01828); pc.set(4, 3, 0x8a1020); pc.set(2, 1, 0xffffff); }, true);
const S_STING = tex('i_fs_sting', 8, 8, (pc) => { pc.each((x, y) => pc.set(x, y, y % 3 === 0 ? 0x8a4a7a : 0xe8c8e0)); }, true);
const S_BLUB = tex('i_fs_blubber', 8, 8, (pc) => { pc.each((x, y) => pc.set(x, y, y < 2 ? (y ? 0x5a6270 : 0x3e4652) : y > 6 ? 0xb84848 : ph(x, y, 817) < 0.2 ? 0xe8d0b8 : 0xf0dcc8)); }, true);
const S_MEAT = tex('i_fs_whalemeat', 8, 8, (pc) => { const R = rp(0x5a1428, 5, 0.6); pc.each((x, y) => pc.set(x, y, ph(x, y, 818) < 0.15 ? 0xe8c8c0 : R[2 + (ph(x, y, 819) < 0.3 ? 1 : 0)])); }, true);
const S_BONE = tex('i_fs_bone', 8, 8, (pc) => { const R = rp(0xe0d4b0, 5, 0.4); pc.each((x, y) => pc.set(x, y, R[2 + (ph(x, y, 820) < 0.2 ? 1 : 0) - (ph(x, y, 821) < 0.08 ? 2 : 0)])); }, true);
const S_BALEEN = tex('i_fs_baleen', 8, 8, (pc) => { pc.each((x, y) => pc.set(x, y, x % 2 ? 0x2a221c : y > 5 ? 0x6a5a48 : 0x3a3028)); }, true);
const S_AMBER = tex('i_fs_amber', 8, 8, (pc) => { const R = rp(0x9a9080, 5, 0.5); pc.each((x, y) => pc.set(x, y, R[2 + (ph(x, y, 822) < 0.3 ? 1 : 0) - (ph(x >> 1, y >> 1, 823) < 0.2 ? 1 : 0)])); }, true);
const S_WORM = tex('i_fs_worm', 8, 8, (pc) => { const R = rp(0xe0b0b0, 5, 0.5); pc.each((x, y) => pc.set(x, y, y % 3 === 0 ? R[1] : R[3])); pc.set(2, 1, 0xffffff); }, true);
const S_JAW = tex('i_fs_jaw', 8, 8, (pc) => { pc.each((x, y) => pc.set(x, y, y < 2 ? 0x6a5a50 : ph(x, y, 824) < 0.2 ? 0x3a2a24 : 0x140c0a)); }, true);
const S_BRISTLE = tex('i_fs_bristle', 8, 8, (pc) => { pc.each((x, y) => pc.set(x, y, x % 2 ? 0xe8d8a0 : 0xb8a070)); }, true);

// ---- the Fungus Mind and its nodes (src/creatures/species/fungus_mind.ts)
defItem({
  key: 'mind_tissue', name: 'Fungus Mind Tissue', cat: 'material', weight: 0.4, value: 30, tags: ['weird', 'tissue', 'fungus', 'research'],
  desc: 'A fist of grey, wet tissue cut from under the black rind of a Fungus Mind. It is folded like a brain and it is still, faintly, warm. The Institute will want it. In a jar it keeps a slow pulse for a day.',
  model: (mb: MB) => {
    blob(mb, [0, 0.035, 0], [0.06, 0.035, 0.05], 10, 6, S_GREY, { disp: (d) => 1 + 0.12 * Math.abs(Math.sin(d[0] * 9 + Math.sin(d[2] * 7) * 2)) });
    blob(mb, [0.02, 0.05, 0.01], [0.045, 0.02, 0.04], 8, 4, S_RIND, { v1: 0.5 });
  },
});
defItem({
  key: 'spore_sac', name: 'Spore Sac', cat: 'material', weight: 0.12, value: 12, tags: ['weird', 'fungus', 'spores'],
  desc: 'A puffball sac from a Fungus Mind\'s network, as big as an orange and taut with spores. Squeeze it and it breathes out a cloud that clouds the head. Somebody will think of a use for that. Keep it away from your face.',
  model: (mb: MB) => { blob(mb, [0, 0.04, 0], [0.045, 0.04, 0.045], 10, 6, S_SAC, { disp: (d) => (d[1] > 0.85 ? 0.85 : 1) }); },
});
defItem({
  key: 'mycelium_felt', name: 'Mycelium Felt', cat: 'material', weight: 0.08, value: 4, tags: ['fungus', 'fabric', 'tinder'],
  desc: 'A sheet of white fungal felt peeled off the floor round a node: light, tough, faintly sticky. It burns like paper. Some units pack it into wounds; the Institute advises against it.',
  model: (mb: MB) => { blob(mb, [0, 0.008, 0], [0.09, 0.008, 0.07], 10, 3, S_FELT, { disp: (d) => 1 + 0.15 * Math.sin(Math.atan2(d[2], d[0]) * 5) }); },
});
defItem({
  key: 'ink_cap', name: 'Ink Cap', cat: 'food', weight: 0.05, value: 3, tags: ['fungus', 'forage'],
  food: { hunger: 6, calories: 30, fresh: 0.5, rot: 1, cookable: true, cookMins: 5, poison: 0.05, lucidity: -2, ingredient: 'veg', cookedName: 'Fried Ink Cap' },
  desc: 'A shaggy white cap off a Fungus Mind\'s node. Young, it is edible and tastes of very little. Leave it a day and it melts into black ink from the rim up. Some say eating one lets you feel the network. Some say a lot of things.',
  model: (mb: MB) => {
    mb.cylinder(0, 0, 0, 0.007, 0.06, 6, S_FELT, { rTop: 0.006 });
    blob(mb, [0, 0.075, 0], [0.018, 0.035, 0.018], 8, 5, S_INK, { v1: 0.75 });
  },
});
defItem({
  key: 'rat_cap', name: 'Spore Rat Cap', cat: 'food', weight: 0.04, value: 5, tags: ['fungus', 'weird', 'spores'],
  food: { hunger: 4, calories: 20, raw: true, cookable: true, cookMins: 6, poison: 0.25, lucidity: -6, fresh: 1, rot: 2, ingredient: 'veg', cookedName: 'Roast Rat Cap' },
  desc: 'An ochre cap off the crest of a Spore Rat, its gills grey with spores. Cooked, the spores die and it is a mushroom like any other. Raw, it is not.',
  model: (mb: MB) => {
    mb.cylinder(0, 0, 0, 0.005, 0.03, 5, S_FELT);
    blob(mb, [0, 0.035, 0], [0.024, 0.014, 0.024], 8, 4, S_TAN, { v1: 0.6 });
  },
});

// ---- the Bacteria Mass (src/creatures/species/bacteria_mass.ts)
defItem({
  key: 'culture_jelly', name: 'Colony Culture', cat: 'material', weight: 0.3, value: 18, tags: ['weird', 'research', 'biological'],
  desc: 'A jar of the Bacteria Mass\'s slime, yellow-grey, crusted with rings of colour on the surface. It moves in the jar when you are not watching it. It eats anything dead you put in with it. The lab cultures it for sterile dressings; the lab does not say how.',
  model: (mb: MB) => {
    mb.cylinder(0, 0, 0, 0.035, 0.08, 10, S_GLASS);
    blob(mb, [0, 0.03, 0], [0.03, 0.028, 0.03], 8, 5, S_SLIME);
    mb.cylinder(0, 0.08, 0, 0.037, 0.012, 10, S_BONE, { color: 0x8a8a90 });
  },
});

// ---- the Land Jellyfish (src/creatures/species/land_jelly.ts)
defItem({
  key: 'jelly_bell', name: 'Jellyfish Bell', cat: 'food', weight: 0.35, value: 8, tags: ['weird', 'meat', 'sea'],
  food: { hunger: 10, thirst: 8, calories: 60, raw: true, cookable: true, cookMins: 10, poison: 0.2, fresh: 0.5, rot: 1.5, ingredient: 'meat', cookedName: 'Blanched Jellyfish' },
  desc: 'The clear bell of a Land Jellyfish, stripped of its tentacles. Blanched and sliced it is crunchy, salty and almost pleasant. Raw, the last stinging cells will find your tongue. If it had fed, there is blood in the middle of it. Yours, possibly.',
  model: (mb: MB) => { blob(mb, [0, 0.025, 0], [0.07, 0.035, 0.07], 12, 5, S_JELLY, { v1: 0.55 }); },
});
defItem({
  key: 'stinger_thread', name: 'Stinging Tentacle', cat: 'material', weight: 0.06, value: 9, tags: ['weird', 'binding', 'sea'],
  desc: 'A metre of Land Jellyfish tentacle, ringed with stinging cells, dried to a tough pink cord. It still stings through thin gloves. Wound round a weapon\'s grip or a snare it makes a nasty trap.',
  model: (mb: MB) => {
    const path: [number, number, number][] = [];
    for (let i = 0; i <= 14; i++) { const a = i * 0.9; path.push([Math.cos(a) * (0.02 + i * 0.003), 0.008, Math.sin(a) * (0.02 + i * 0.003)]); }
    tube(mb, path, 0.006, 5, S_STING);
  },
});

// ---- the Whale Corpse (src/creatures/species/whale_corpse.ts): cut from it through its menu
defItem({
  key: 'whale_blubber', name: 'Whale Blubber', cat: 'food', weight: 1.2, value: 10, tags: ['fat', 'fuel', 'sea'],
  food: { hunger: 18, calories: 2600, raw: true, cookable: true, cookMins: 25, poison: 0.15, unhappy: 8, fresh: 4, rot: 10, ingredient: 'meat', cookedName: 'Rendered Blubber' },
  desc: 'A slab of blubber with the grey skin still on one side: cream-coloured fat a hand thick, pink where it meets the meat. Render it and it gives lamp oil; eat it and it gives more calories than anything else down here, and a feeling in your stomach like a held breath.',
  model: (mb: MB) => { mb.box(0, 0.025, 0, 0.16, 0.05, 0.1, S_BLUB); },
});
defItem({
  key: 'whale_meat', name: 'Whale Meat', cat: 'food', weight: 1.0, value: 12, tags: ['meat', 'sea'],
  food: { hunger: 40, calories: 1500, raw: true, cookable: true, cookMins: 22, poison: 0.25, fresh: 2, rot: 4, ingredient: 'meat', cookedName: 'Whale Steak' },
  desc: 'Meat from under the blubber: so dark red it is nearly black, dense, strong-tasting, like liver crossed with beef. The whale has been dead a long time but the inside of the carcass is cold. Cook it right through.',
  model: (mb: MB) => { blob(mb, [0, 0.03, 0], [0.08, 0.03, 0.06], 8, 4, S_MEAT); },
});
defItem({
  key: 'whale_rib', name: 'Whale Rib', cat: 'material', weight: 6, value: 22, tags: ['bone', 'weird', 'building'],
  desc: 'A rib out of the Whale Corpse, longer than you are tall and as thick as your arm, curved like a bow. It is the best beam there is down here: light for its strength, and it does not rot. Sawn, it is bone stock for anything.',
  model: (mb: MB) => {
    const path: [number, number, number][] = [];
    for (let i = 0; i <= 10; i++) { const t = i / 10; path.push([-0.45 + t * 0.9, 0.03 + Math.sin(t * Math.PI) * 0.12, 0]); }
    tube(mb, path, (t) => 0.035 - t * 0.012, 6, S_BONE);
  },
});
defItem({
  key: 'baleen_plate', name: 'Baleen Plate', cat: 'material', weight: 0.4, value: 14, tags: ['weird', 'sea', 'flexible'],
  desc: 'A plate of baleen pulled from the whale\'s upper jaw: black, horny, flexible as a ruler, with a fringe of bristles down one edge. It makes springs, bows, a decent comb. Sailors once made corsets of it.',
  model: (mb: MB) => { mb.box(0, 0.004, 0, 0.05, 0.008, 0.26, S_BALEEN); mb.box(0.03, 0.004, 0, 0.012, 0.004, 0.24, S_BALEEN, { color: 0x8a7a68 }); },
});
defItem({
  key: 'ambergris', name: 'Ambergris', cat: 'misc', weight: 0.5, value: 160, tags: ['valuable', 'weird', 'sea'],
  desc: 'A lump of grey, waxy stuff from the whale\'s gut, marbled and light for its size. It smells of musk, old wood and the sea. Perfumers once paid more for it than for gold. The Institute pays well too, and does not say what for.',
  model: (mb: MB) => { blob(mb, [0, 0.03, 0], [0.05, 0.03, 0.04], 9, 5, S_AMBER, { disp: (d) => 1 + 0.15 * Math.sin(d[0] * 7 + d[2] * 5) }); },
});

// ---- Sea Worms (src/creatures/species/sea_worm.ts)
defItem({
  key: 'worm_meat', name: 'Sea Worm Meat', cat: 'food', weight: 0.4, value: 6, tags: ['meat', 'sea'],
  food: { hunger: 16, calories: 380, raw: true, cookable: true, cookMins: 12, poison: 0.2, unhappy: 6, fresh: 1, rot: 2.5, ingredient: 'meat', cookedName: 'Grilled Worm' },
  desc: 'A ringed length of sea worm, pale and rubbery, with the paddle-legs cut off. Grilled it tastes of the sea and of prawns, if you do not look at it.',
  model: (mb: MB) => {
    const path: [number, number, number][] = [];
    for (let i = 0; i <= 8; i++) path.push([-0.08 + i * 0.02, 0.015, Math.sin(i * 0.9) * 0.02]);
    tube(mb, path, 0.014, 6, S_WORM);
  },
});
defItem({
  key: 'worm_jaw', name: 'Sea Worm Jaw', cat: 'material', weight: 0.03, value: 9, tags: ['sharp', 'weird', 'sea'],
  desc: 'One of the two black hooked jaws off a sea worm\'s proboscis: chitin, curved like a thorn, hard enough to scratch glass. Bound to a stick it is a gutting hook.',
  model: (mb: MB) => {
    const path: [number, number, number][] = [];
    for (let i = 0; i <= 6; i++) { const t = i / 6; path.push([Math.sin(t * 2) * 0.03, 0.006, -0.03 + t * 0.06]); }
    tube(mb, path, (t) => 0.008 * (1 - t) + 0.001, 5, S_JAW);
  },
});
defItem({
  key: 'bristle_tuft', name: 'Bristle Fan', cat: 'material', weight: 0.02, value: 4, tags: ['fiber', 'sea'],
  desc: 'A fan of golden bristles cut from a sea worm\'s paddle-leg. Each bristle is fine and stiff as wire and barbed at the tip. They make brushes, and they make splinters.',
  model: (mb: MB) => { for (let i = 0; i < 7; i++) { const a = -0.5 + i * 0.17; mb.box(Math.sin(a) * 0.03, 0.003, Math.cos(a) * 0.03, 0.003, 0.003, 0.06, S_BRISTLE); } },
});

// corpses
defLoot('creature_fungus_mind', [4, 7], [['mind_tissue', 6], ['spore_sac', 4], ['mycelium_felt', 4], ['ink_cap', 3]], 0);
defLoot('creature_fungus_node', [1, 3], [['ink_cap', 5], ['spore_sac', 3], ['mycelium_felt', 3]], 0);
defLoot('creature_spore_rat', [1, 2], [['rat_cap', 5], ['meat_raw', 2], ['spore_sac', 1]], 0.1);
defLoot('creature_bacteria_mass', [2, 4], [['culture_jelly', 5], ['bone', 4], ['coins', 1], ['meat_raw', 1]], 0);
defLoot('creature_land_jelly', [1, 2], [['jelly_bell', 4], ['stinger_thread', 4]], 0);
defLoot('creature_sea_worm', [1, 3], [['worm_meat', 5], ['worm_jaw', 3], ['bristle_tuft', 3]], 0);
