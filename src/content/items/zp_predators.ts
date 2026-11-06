// What the round-14 predators leave behind (src/creatures/lore.ts harvest lists):
// the Whip Rat's eye stalks, its tail hand, incisors and hide; the Strider's
// tendons, stretched skin and long finger bones; and their corpse loot tables
// (`creature_<speciesKey>`).
import { defItem } from '../../items/item';
import { defLoot } from '../../items/loot';
import { T, prism } from './_kit';

// ---- the Whip Rat (src/creatures/species/whip_rat.ts)
defItem({
  key: 'rat_eyestalk', name: 'Whip Rat Eye Stalk', cat: 'material', weight: 0.15, value: 16, tags: ['weird', 'tissue'],
  desc: 'Eighty centimetres of ringed red muscle with an eye on the end, cut from a Whip Rat. It keeps twitching for an hour. The eye follows the light while it does. The Institute pays well for a fresh one.',
  model: (mb) => {
    for (let i = 0; i < 7; i++) { const a = i * 0.7; mb.cylinder(Math.cos(a) * 0.02 + i * 0.012, 0.012, Math.sin(a) * 0.02, 0.009 - i * 0.0006, 0.012, 6, T.rubber, { color: 0xa83a48 }); }
    mb.sphere(0.09, 0.018, 0.01, 0.017, 8, 6, T.white, { color: 0xe8dcc8 });
    mb.sphere(0.104, 0.02, 0.012, 0.008, 6, 4, T.black, { color: 0x1a0a06 });
  },
});
defItem({
  key: 'rat_hand', name: 'Hand (from a Whip Rat\'s Tail)', cat: 'misc', weight: 0.4, value: 22, tags: ['weird', 'tissue'],
  desc: 'A human hand, a man\'s, cut from the end of a Whip Rat\'s tail with a hand\'s length of forearm and a few rings of scaly tail still on it. The nails are clean and short. The fingers close slowly if you put something in the palm.',
  model: (mb) => {
    mb.box(0, 0.012, 0, 0.07, 0.022, 0.09, T.leather, { color: 0xd8a890 });
    for (let i = 0; i < 4; i++) mb.box(-0.027 + i * 0.018, 0.01, 0.075, 0.013, 0.014, 0.06, T.leather, { color: 0xd0a088 });
    mb.box(-0.045, 0.01, 0.01, 0.014, 0.014, 0.05, T.leather, { color: 0xd0a088 });
    mb.cylinder(0, 0.014, -0.08, 0.02, 0.07, 6, T.rubber, { color: 0xa08880, rTop: 0.018 });
  },
});
defItem({
  key: 'rat_incisor', name: 'Whip Rat Incisor', cat: 'material', weight: 0.03, value: 8, tags: ['sharp', 'bone', 'weird'],
  desc: 'A curved yellow-orange rat\'s incisor as long as your finger, chisel-edged and self-sharpening. It goes through tin. Lashed to a stick it is a decent awl.',
  model: (mb) => {
    prism(mb, [[-0.006, -0.04], [0.006, -0.04], [0.007, 0.0], [0.004, 0.03], [-0.003, 0.038], [-0.006, 0.0]], 0, 0.008, T.white, T.white, { color: 0xd8a038 });
  },
});
defItem({
  key: 'mangy_hide', name: 'Mangy Rat Hide', cat: 'material', weight: 0.35, value: 5, tags: ['leather', 'weird'],
  desc: 'A ragged pelt of greasy brown rat fur, bald in patches, scabbed in others. Scraped and dried it makes a usable, ugly leather.',
  model: (mb) => {
    prism(mb, [[-0.09, -0.04], [-0.03, -0.06], [0.07, -0.045], [0.1, 0.01], [0.04, 0.06], [-0.06, 0.045]], 0, 0.01, T.knit, T.knit, { color: 0x5a4a3c, sideColor: 0x8a6a64 });
  },
});

// ---- the Strider (src/creatures/species/strider.ts)
defItem({
  key: 'strider_tendon', name: 'Strider Tendon', cat: 'material', weight: 0.25, value: 18, tags: ['binding', 'weird'],
  desc: 'A tendon out of a Strider\'s leg, nearly two metres of it, dried to a pale cord as strong as wire rope. It is a person\'s tendon. It has been pulled.',
  model: (mb) => {
    for (let i = 0; i < 3; i++) mb.cylinder(0, 0.01 + i * 0.012, 0, 0.05 - i * 0.008, 0.01, 10, T.leather, { color: 0xe0d0b0, rTop: 0.05 - i * 0.008 });
  },
});
defItem({
  key: 'strider_skin', name: 'Stretched Skin', cat: 'material', weight: 0.2, value: 12, tags: ['leather', 'weird'],
  desc: 'A long strip of a Strider\'s skin: pale, smooth, hairless and thin as paper, striped with silvery stretch marks. Tanned, it is the finest leather anyone has seen. Nobody at the Institute will wear it.',
  model: (mb) => {
    prism(mb, [[-0.12, -0.02], [-0.04, -0.03], [0.1, -0.025], [0.13, 0.0], [0.08, 0.025], [-0.1, 0.022]], 0, 0.004, T.leather, T.leather, { color: 0xd6c6a6, sideColor: 0xb8303a });
  },
});
defItem({
  key: 'long_bone', name: 'Strider Finger Bone', cat: 'material', weight: 0.3, value: 14, tags: ['bone', 'weird'],
  desc: 'One bone out of a Strider\'s finger, longer than your forearm, with a knuckle at each end. It is a human finger bone. It makes a good club, if you can stand holding it.',
  model: (mb) => {
    mb.cylinder(0, 0.012, 0, 0.011, 0.24, 6, T.white, { color: 0xe8dcc0, rTop: 0.009 });
    mb.sphere(0, 0.012, 0, 0.018, 6, 4, T.white, { color: 0xe0d4b8 });
    mb.sphere(0, 0.25, 0, 0.015, 6, 4, T.white, { color: 0xe0d4b8 });
  },
});

// corpses
defLoot('creature_whip_rat', [2, 4], [['rat_eyestalk', 4], ['rat_incisor', 4], ['mangy_hide', 4], ['rat_hand', 1.5], ['meat_raw', 2]], 0);
defLoot('creature_strider', [3, 5], [['strider_tendon', 5], ['strider_skin', 4], ['long_bone', 4], ['bone', 3]], 0);
