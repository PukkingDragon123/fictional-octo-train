// What the inhabitants pass leaves behind (src/creatures/lore.ts harvest lists):
// Stilt Gull eggs and blade feathers from the nest, Mulcher chitin and roe,
// a Seated chair's whisper written down, a strip of the King's robe, Wallpaper
// Grazer glue; and their corpse loot tables (`creature_<speciesKey>`).
import { defItem } from '../../items/item';
import { defLoot } from '../../items/loot';
import { T, prism } from './_kit';

defItem({
  key: 'gull_egg', name: 'Stilt Gull Egg', cat: 'food', weight: 0.45, value: 14, tags: ['egg', 'weird'],
  desc: 'Speckled grey-green, pointed, heavy as a stone and still warm. Something inside it knocks when you hold it to your ear. The parent will come for it.',
  food: { hunger: 26, calories: 620, raw: true, cookable: true, cookMins: 9, poison: 0.2, fresh: 4, rot: 9, ingredient: 'egg', cookedName: 'Boiled Gull Egg' },
  model: (mb) => {
    mb.sphere(0, 0.045, 0, 0.034, 8, 6, T.white, { color: 0xa8b088, sy: 1.35 });
    mb.sphere(0, 0.075, 0, 0.022, 6, 4, T.white, { color: 0x98a078, sy: 1.2 });
    for (let i = 0; i < 6; i++) { const a = i * 1.7; mb.sphere(Math.cos(a) * 0.031, 0.03 + (i % 3) * 0.018, Math.sin(a) * 0.031, 0.006, 4, 3, T.black, { color: 0x3a2a18 }); }
  },
});
defItem({
  key: 'gull_feather', name: 'Blade Feather', cat: 'material', weight: 0.08, value: 11, tags: ['sharp', 'feather', 'weird'],
  desc: 'A moulted primary from a Stilt Gull: grey vane, black tip, and a leading edge of fused bone sharper than a scalpel. Hold it by the quill.',
  model: (mb) => {
    prism(mb, [[-0.11, 0.0], [-0.04, 0.018], [0.06, 0.016], [0.12, 0.0], [0.05, -0.008], [-0.06, -0.006]], 0, 0.004, T.white, T.white, { color: 0x9aa0a8 });
    prism(mb, [[0.06, 0.016], [0.12, 0.0], [0.05, -0.008]], 0.004, 0.002, T.black, T.black, { color: 0x1c1c20 });
    mb.box(-0.02, 0.003, 0.0, 0.2, 0.004, 0.004, T.white, { color: 0xe8e0d0 });
  },
});
defItem({
  key: 'mulcher_chitin', name: 'Mulcher Chitin', cat: 'material', weight: 0.15, value: 6, tags: ['shell', 'weird'],
  desc: 'A curved plate of split carapace, glossy brown-black and harder than it looks. The Institute buys it by the kilo; nobody says what for.',
  model: (mb) => {
    prism(mb, [[-0.05, -0.02], [0.0, -0.035], [0.05, -0.02], [0.045, 0.025], [0.0, 0.035], [-0.045, 0.025]], 0, 0.012, T.black, T.black, { color: 0x4a3020, sideColor: 0x2a1a10 });
    prism(mb, [[-0.03, -0.012], [0.03, -0.012], [0.028, 0.02], [-0.028, 0.02]], 0.012, 0.004, T.black, T.black, { color: 0x7a5a3a });
  },
});
defItem({
  key: 'mulcher_roe', name: 'Mulcher Roe', cat: 'food', weight: 0.2, value: 5, tags: ['rawmeat', 'weird'],
  desc: 'A fist of glistening, pale amber eggs in their glue, scooped off a chair. They twitch in the cold. Cook it until they stop.',
  food: { hunger: 12, calories: 340, raw: true, cookable: true, cookMins: 10, poison: 0.45, unhappy: 10, stress: 2, fresh: 1, rot: 2, ingredient: 'weird', cookedName: 'Fried Roe' },
  model: (mb) => {
    for (let i = 0; i < 9; i++) { const a = i * 2.4, r = 0.012 + (i % 3) * 0.01; mb.sphere(Math.cos(a) * r, 0.014 + (i % 2) * 0.012, Math.sin(a) * r, 0.013, 6, 4, 'i_glass', { color: 0xe8c070, emissive: 0.1 }); }
  },
});
defItem({
  key: 'seated_whisper', name: 'Written Whisper', cat: 'lore', weight: 0.01, value: 2, tags: ['paper'], noStack: true,
  desc: 'A page torn from your notebook, written fast and badly, of what a chair told you while you sat in it. It is true. You do not know how you know.',
  model: (mb) => {
    mb.box(0, 0.001, 0, 0.1, 0.002, 0.13, T.pages, { color: 0xf0e8d0, fit: true });
    mb.box(0.03, 0.003, 0.02, 0.03, 0.002, 0.04, T.pages, { color: 0xd8c890, fit: true });
  },
});
defItem({
  key: 'yellow_tatter', name: 'Yellow Tatter', cat: 'misc', weight: 0.05, value: 40, tags: ['cloth', 'weird'], rare: true,
  desc: 'A strip torn from the King\'s robe. It will not stay in focus, even in your hand. Folded small, it is warm, and very slightly heavier each time you check.',
  model: (mb) => {
    prism(mb, [[-0.08, -0.02], [-0.02, -0.03], [0.06, -0.025], [0.09, 0.0], [0.04, 0.03], [-0.05, 0.025]], 0, 0.004, T.cloth, T.cloth, { color: 0xd8b030, emissive: 0.15 });
  },
});
defItem({
  key: 'grazer_mucus', name: 'Grazer Glue', cat: 'material', weight: 0.12, value: 4, tags: ['glue', 'weird'],
  desc: 'Clear mucus scraped off a wallpaper trail. It sets in a minute into a glue stronger than anything in the stores.',
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.025, 0.05, 8, 'i_glass', { color: 0xe8f0d8, emissive: 0.05 });
    mb.cylinder(0, 0.05, 0, 0.018, 0.012, 8, T.plastic, { color: 0x3a6a3a });
  },
});

// ---- the Ledge: the Gummy Bear's jelly and fur, the Giant Bumble Bee's fuzz and wax
defItem({
  key: 'ledge_gel', name: 'Ledge Gel', cat: 'food', weight: 0.35, value: 18, tags: ['weird', 'glue'],
  desc: 'A trembling lump of a Gummy Bear\'s body: clear red jelly with a few drifting hairs in it. It smells of sugar and wet animal. It is still, very slowly, digesting the dust on its surface.',
  food: { hunger: 10, thirst: 4, calories: 260, raw: true, cookable: true, cookMins: 6, poison: 0.35, lucidity: -4, stress: 4, fresh: 3, rot: 8, ingredient: 'sweet', cookedName: 'Rendered Ledge Gel' },
  model: (mb) => {
    mb.sphere(0, 0.03, 0, 0.04, 8, 6, 'i_glass', { color: 0xd8401a, sy: 0.75, emissive: 0.08 });
    mb.sphere(0.022, 0.05, 0.01, 0.022, 6, 4, 'i_glass', { color: 0xe86030, emissive: 0.08 });
    mb.box(-0.01, 0.035, 0.0, 0.03, 0.003, 0.003, T.black, { color: 0x3a2010 });
  },
});
defItem({
  key: 'matted_fur', name: 'Matted Bear Fur', cat: 'material', weight: 0.2, value: 7, tags: ['cloth', 'fur', 'weird'],
  desc: 'A wet island of brown bear fur peeled off a Gummy Bear, the underside still glazed with jelly. Dried, it is thick, warm and almost impossible to tear.',
  model: (mb) => {
    prism(mb, [[-0.07, -0.03], [-0.02, -0.05], [0.06, -0.035], [0.08, 0.01], [0.03, 0.05], [-0.05, 0.035]], 0, 0.012, T.knit, T.knit, { color: 0x5a3a22, sideColor: 0xc8401a });
  },
});
defItem({
  key: 'bee_fuzz', name: 'Bee Fuzz', cat: 'material', weight: 0.04, value: 5, tags: ['cloth', 'tinder', 'weird'],
  desc: 'A warm handful of yellow and black fuzz plucked off a Giant Bumble Bee. Softer than down, it packs into a jacket lining or lights at a spark.',
  model: (mb) => {
    mb.sphere(0, 0.025, 0, 0.03, 6, 4, T.knit, { color: 0xe8b62a, sy: 0.7 });
    mb.sphere(0.02, 0.03, 0.01, 0.018, 5, 3, T.knit, { color: 0x1e1a16 });
  },
});
defItem({
  key: 'honey_wax', name: 'Honey Wax', cat: 'material', weight: 0.1, value: 9, tags: ['wax', 'fuel', 'weird'],
  desc: 'Thin, warm sheets of wax scraped off a Giant Bumble Bee\'s belly, pressed into a cake. It smells of honey and old candles. Burns slow and clean; seals a jar; softens leather.',
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.035, 0.02, 8, T.white, { color: 0xe8c060 });
    mb.cylinder(0, 0.02, 0, 0.028, 0.006, 8, T.white, { color: 0xf0d080 });
  },
});
defItem({
  key: 'pigeon_tallow', name: 'Pigeon Tallow', cat: 'material', weight: 0.12, value: 6, tags: ['wax', 'fuel', 'weird'],
  desc: 'Warm curls of tallow scraped off a Tallow Pigeon, with a grey feather or two still in them. It smells like a church. It burns slow and steady.',
  model: (mb) => {
    mb.sphere(0, 0.02, 0, 0.03, 6, 4, T.white, { color: 0xe8dcc0, sy: 0.6 });
    mb.sphere(0.02, 0.025, 0.01, 0.015, 5, 3, T.white, { color: 0x8a90a0 });
  },
});

// corpses
defLoot('creature_mulcher', [1, 2], [['mulcher_chitin', 6], ['mulcher_roe', 1.5]], 0.25);
defLoot('creature_stilt_gull', [2, 4], [['gull_feather', 6], ['meat_raw', 3], ['bone', 2]], 0);
defLoot('creature_seated', [0, 1], [['bone', 2], ['seated_whisper', 1]], 0.5);
defLoot('creature_gummy_bear', [2, 4], [['ledge_gel', 6], ['matted_fur', 3], ['bone', 2]], 0);
defLoot('creature_bumble_bee', [1, 3], [['bee_fuzz', 5], ['honey_wax', 3]], 0.1);
defLoot('creature_tallow_pigeon', [1, 2], [['pigeon_tallow', 4], ['small_meat_raw', 1]], 0.1);
defLoot('creature_moon_calf', [1, 2], [['moon_meat', 4]], 0);
