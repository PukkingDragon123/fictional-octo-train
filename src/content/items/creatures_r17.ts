// What the round-17 grotesques leave behind: the Parasite Salamander (cut out of a
// body, or killed), its egg clutch, and the Gaunt Wolf's meat, hide and teeth; with
// their corpse loot tables (`creature_<speciesKey>`).
import { defItem } from '../../items/item';
import { defLoot } from '../../items/loot';
import { T, tex, ph, prism } from './_kit';

const PALE = tex('i_sala_skin', 8, 8, (pc) => pc.each((x, y) => pc.set(x, y, ph(x, y, 5) < 0.12 ? 0x7a2a3a : ph(x, y, 9) < 0.2 ? 0xb0a0c8 : (x + y) % 5 === 0 ? 0xf4e4dc : 0xe0c4bc)), true);
const EGGS = tex('i_sala_eggs', 8, 8, (pc) => pc.each((x, y) => pc.set(x, y, ((x >> 1) + (y >> 1)) % 2 ? 0xf0e4a8 : ph(x, y, 4) < 0.3 ? 0x4a2a2a : 0xe8d8b0)), true);
const HIDE = tex('i_matted_hide', 8, 8, (pc) => pc.each((x, y) => pc.set(x, y, ph(x, y, 6) < 0.18 ? 0x2a2220 : ph(x, y, 8) < 0.12 ? 0x7a2a22 : (y % 3 === 0 ? 0x3e3430 : 0x4a4038))), true);

defItem({
  key: 'parasite_salamander', name: 'Parasite Salamander', cat: 'material', weight: 0.3, value: 16, tags: ['weird', 'specimen', 'bait'],
  desc: 'A pale, see-through salamander as long as your forearm, its organs dark shapes inside it, a round mouth of hooked teeth under a flat shovel of a snout, eight or nine little fingers to a foot. It came out of something. The lab pays well for them, and does not say what for.',
  model: (mb) => {
    mb.push().rotateY(0.2);
    mb.box(0, 0.012, 0, 0.16, 0.022, 0.05, PALE, { uvScale: 2 });
    mb.box(0.1, 0.01, 0, 0.05, 0.014, 0.06, PALE, { uvScale: 2 });
    mb.box(-0.13, 0.008, 0.01, 0.11, 0.01, 0.02, PALE, { uvScale: 2 });
    for (const s of [-1, 1]) for (const x of [-0.05, 0.05]) mb.box(x, 0.004, s * 0.035, 0.015, 0.006, 0.03, PALE, {});
    mb.box(0.075, 0.022, 0, 0.02, 0.012, 0.07, T.white, { color: 0xc8303c });
    mb.pop();
  },
});
defItem({
  key: 'salamander_eggs', name: 'Salamander Clutch', cat: 'food', weight: 0.25, value: 10, tags: ['weird', 'rawmeat', 'specimen'],
  desc: 'A clutch of yellowish eggs in a skin, cut out of a body. In each one something curls and uncurls. Edible, raw, if you are desperate and do not think about it.',
  food: { hunger: 10, thirst: 2, calories: 240, raw: true, cookable: true, cookMins: 6, poison: 0.5, fresh: 0.5, rot: 1, ingredient: 'weird', cookedName: 'Boiled Clutch' },
  model: (mb) => {
    for (let i = 0; i < 7; i++) { const a = i * 0.9, r = i ? 0.025 : 0; mb.sphere(Math.cos(a) * r, 0.016, Math.sin(a) * r, 0.016, 6, 4, EGGS, { color: 0xffffff }); }
  },
});
defItem({
  key: 'wolf_meat', name: 'Gaunt Wolf Meat', cat: 'food', weight: 1.2, value: 8, tags: ['rawmeat', 'stewmeat'],
  desc: 'Dark, stringy meat off a starved giant. There is not much fat on it and it smells of iron. Cook it through.',
  food: { hunger: 34, calories: 950, raw: true, cookable: true, cookMins: 30, poison: 0.45, fresh: 2, rot: 4, ingredient: 'meat', cookedName: 'Roast Wolf' },
  model: (mb) => { mb.box(0, 0.025, 0, 0.18, 0.05, 0.11, 'i_meat_raw', { uvScale: 3 }); mb.box(0.06, 0.05, 0, 0.06, 0.02, 0.07, 'i_meat_raw', { uvScale: 3 }); },
});
defItem({
  key: 'matted_hide', name: 'Matted Hide', cat: 'material', weight: 2.2, value: 14, tags: ['leather', 'hide', 'cloth'],
  desc: 'A sheet of the Gaunt Wolf\'s coat, mange and scab and long greasy hair. Scraped and dried, it is the warmest thing on the level. It never stops smelling of dog.',
  model: (mb) => { prism(mb, [[-0.16, -0.1], [0.05, -0.12], [0.17, -0.04], [0.14, 0.09], [-0.02, 0.12], [-0.15, 0.06]], 0, 0.012, HIDE, HIDE, { color: 0xffffff, sideColor: 0x7a2a22 }); },
});
defItem({
  key: 'wolf_fang', name: 'Gaunt Wolf Fang', cat: 'material', weight: 0.15, value: 12, tags: ['bone', 'sharp', 'weird'],
  desc: 'One of the teeth from the third row, as long as a finger, yellow-brown and hooked. Lashed to a stick it is a spear point.',
  model: (mb) => { mb.cylinder(0, 0, 0, 0.012, 0.09, 6, { sides: T.white, top: T.white, bottom: T.white }, { color: 0xd8c898, rTop: 0.002 } as any); },
});

const FUR = tex('i_hare_fur', 8, 8, (pc) => pc.each((x, y) => pc.set(x, y, ph(x, y, 7) < 0.16 ? 0x5a1a14 : ph(x, y, 3) < 0.2 ? 0x4e4236 : (x + 2 * y) % 4 === 0 ? 0xa89880 : 0x8a7a66)), true);
defItem({
  key: 'hare_haunch', name: 'Battering Hare Haunch', cat: 'food', weight: 2.5, value: 12, tags: ['rawmeat', 'stewmeat'],
  desc: 'A slab off the good hind leg of the giant hare, the one that did all the work: dark, dense, ropy with muscle. It feeds a camp. Cook it for a long time.',
  food: { hunger: 46, calories: 1400, raw: true, cookable: true, cookMins: 40, poison: 0.4, fresh: 2, rot: 4, ingredient: 'meat', cookedName: 'Roast Haunch' },
  model: (mb) => { mb.box(0, 0.035, 0, 0.22, 0.07, 0.13, 'i_meat_raw', { uvScale: 3 }); mb.box(-0.1, 0.04, 0, 0.06, 0.05, 0.08, FUR, { uvScale: 2 }); mb.box(0.12, 0.03, 0, 0.05, 0.025, 0.025, T.white, { color: 0xe8dcc0 }); },
});
defItem({
  key: 'hare_incisor', name: 'Hare Incisor', cat: 'material', weight: 0.6, value: 18, tags: ['bone', 'sharp', 'weird'],
  desc: 'One of the giant hare\'s front teeth: a yellow chisel as long as your forearm, worn to a bevel you could shave with. It still grows, a little, for a day or two after.',
  model: (mb) => { mb.box(0, 0.012, 0, 0.2, 0.022, 0.045, T.white, { color: 0xd8c070 }); mb.box(0.1, 0.012, 0, 0.02, 0.018, 0.045, T.white, { color: 0xf0e0a0 }); },
});
defItem({
  key: 'horn_boss', name: 'Horn Boss', cat: 'material', weight: 3.5, value: 22, tags: ['bone', 'heavy', 'weird'],
  desc: 'The knot of horn that grew on the giant hare\'s forehead from all the things it hit, sawn off: ridged, grey-brown, heavy as a brick. Bolted to a pole it makes a ram of your own.',
  model: (mb) => { mb.sphere(0, 0.05, 0, 0.07, 7, 5, T.white, { color: 0x8a7a60 }); mb.sphere(0.03, 0.08, 0.02, 0.035, 6, 4, T.white, { color: 0x9a8a70 }); },
});

defLoot('creature_parasite_salamander', [1, 1], [['parasite_salamander', 5]], 0);
defLoot('creature_salamander_larva', [0, 1], [['salamander_eggs', 1]], 0.7);
defLoot('creature_gaunt_wolf', [3, 6], [['wolf_meat', 6], ['matted_hide', 3], ['wolf_fang', 4], ['bone', 4]], 0);
defLoot('creature_battering_hare', [3, 5], [['hare_haunch', 6], ['hare_incisor', 3], ['horn_boss', 2], ['bone', 3]], 0);
