// What the new things leave behind: food from the hunted passive ones, salvage
// from the rule-bound monsters and the dimension creatures, and their corpse
// loot tables (`creature_<speciesKey>`).
import { defItem } from '../../items/item';
import { defLoot } from '../../items/loot';
import { T, prism } from './_kit';

defItem({
  key: 'bubble_jelly', name: 'Bubble Jelly', cat: 'food', weight: 0.2, value: 4, tags: ['rawmeat', 'weird'],
  desc: 'The inside of a bubble rabbit: cool, wobbling, faintly sweet. It fizzes on the tongue. Better cooked.',
  food: { hunger: 14, thirst: 6, calories: 380, raw: true, cookable: true, cookMins: 8, poison: 0.15, fresh: 1, rot: 2, ingredient: 'weird', cookedName: 'Set Bubble Jelly' },
  model: (mb) => {
    mb.sphere(0, 0.03, 0, 0.035, 8, 5, 'i_glass', { color: 0xf0b8e8, sy: 0.7, fit: true, emissive: 0.25 });
    mb.sphere(0.03, 0.02, 0.01, 0.02, 6, 4, 'i_glass', { color: 0xb8e0f8, sy: 0.7, fit: true, emissive: 0.25 });
  },
});
defItem({
  key: 'moon_meat', name: 'Strider Haunch', cat: 'food', weight: 0.7, value: 6, tags: ['rawmeat', 'stewmeat'],
  desc: 'Grey, dense, cold as stone even fresh. Cook it a long time. It tastes of dust and pennies.',
  food: { hunger: 30, calories: 900, raw: true, cookable: true, cookMins: 35, poison: 0.35, fresh: 2, rot: 5, ingredient: 'meat', cookedName: 'Roast Strider' },
  model: (mb) => {
    mb.box(0, 0, 0, 0.16, 0.05, 0.1, T.white, { color: 0x9a9aa4 });
    mb.box(0.05, 0.05, 0, 0.05, 0.02, 0.06, T.white, { color: 0xc8c4cc });
    mb.cylinder(-0.1, 0.025, 0, 0.012, 0.06, 6, T.white, { color: 0xe8e0d0 });
  },
});
defItem({
  key: 'marble_chip', name: 'Board Marble', cat: 'material', weight: 0.3, value: 9, tags: ['stone'],
  desc: 'A chip of a living chess piece: polished, heavy, still warm. Someone will pay for it.',
  model: (mb) => {
    prism(mb, [[-0.04, 0.0], [0.03, -0.02], [0.05, 0.02], [-0.01, 0.04]], 0, 0.03, T.white, T.white, { color: 0xe8e2d4 });
  },
});
defItem({
  key: 'mirror_shard', name: 'Mirror Shard', cat: 'material', weight: 0.05, value: 7, tags: ['sharp', 'glass'],
  desc: 'Silvered glass from a mirrorling. Your reflection in it is a half-second late.',
  model: (mb) => {
    prism(mb, [[-0.04, 0.02], [0.05, 0.0], [-0.02, -0.03]], 0, 0.004, 'i_glass', 'i_glass', { color: 0xe8f4ff, emissive: 0.2 });
  },
});
defItem({
  key: 'tally_bead', name: 'Tally Bead', cat: 'material', weight: 0.02, value: 5, tags: ['anomalous'],
  desc: 'A bone bead off the tallyman\'s rack, drilled through. It clicks by itself when you take a step.',
  model: (mb) => { mb.sphere(0, 0.012, 0, 0.012, 6, 4, T.white, { color: 0xe0d4b8 }); },
});

// ---------------------------------------------------------------- corpse loot
defLoot('creature_bubble_rabbit', [1, 2], [['bubble_jelly', 5]], 0);
defLoot('creature_bubble_mite', [0, 1], [['glow_dust', 2]], 0.6);
defLoot('creature_chess_rook', [2, 4], [['marble_chip', 6], ['stone', 2]], 0);
defLoot('creature_chess_knight', [1, 3], [['marble_chip', 6], ['stone', 1]], 0);
defLoot('creature_moon_wisp', [0, 2], [['glow_dust', 4], ['battery', 1]], 0.3);
defLoot('creature_moon_strider', [1, 3], [['moon_meat', 5], ['bone', 2]], 0);
defLoot('creature_tallyman', [2, 5], [['tally_bead', 6, 1, 3], ['bone', 2], ['pencil', 1]], 0);
defLoot('creature_mirrorling', [1, 3], [['mirror_shard', 6, 1, 2], ['glass_shard', 3]], 0);
defLoot('creature_lintel', [1, 3], [['plank', 4], ['screws', 3, 1, 3], ['key_generic', 1], ['bone', 2]], 0.1);
defLoot('creature_tithe', [2, 5], [['coins', 8, 2, 6], ['wallet', 1], ['necklace', 0.6], ['wristwatch', 0.6]], 0);
defLoot('creature_hush', [0, 2], [['bone', 3], ['rag', 2]], 0.4);
defLoot('creature_cowerling', [0, 2], [['meat_raw', 3], ['bone', 2]], 0.3);
