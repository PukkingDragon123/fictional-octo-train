// What the Nostalgic Playground's five leave behind (src/creatures/lore_playground.ts
// harvest lists) and what lies about the playground and its studio: plush
// scraps, googly eyes, a cathode-ray tube, a bent aerial, Lefty's sock and
// button eyes, Petula's seeds and petals, COUNT-O's metre-stick and gold star
// stickers, Bright Hour VHS tapes; their corpse loot tables (`creature_pg_*`)
// and the zone's floor and studio tables.
import { defItem } from '../../items/item';
import { defLoot } from '../../items/loot';
import { T, tex, rp, ph, prism, type MB } from './_kit';

const S_PLUSH = tex('i_pg_plush', 8, 8, (pc) => { const R = rp(0xd8823c, 5, 0.5); pc.each((x, y) => pc.set(x, y, R[2 + (ph(x, y >> 1, 11) < 0.3 ? 1 : 0) - (ph(x >> 1, y, 12) < 0.15 ? 1 : 0)])); }, true);
const S_STAR = tex('i_pg_star', 12, 12, (pc) => {
  pc.wrap = false;
  pc.each((x, y) => {
    const dx = x + 0.5 - 6, dy = y + 0.5 - 6, a = Math.atan2(dy, dx), d = Math.hypot(dx, dy);
    const r = 3 + 2.6 * Math.max(0, Math.cos(((a + Math.PI / 2) * 5) / 2)) ** 3;
    pc.set(x, y, d < r - 0.8 ? (dx + dy < 0 ? 0xfff0a0 : 0xf0c830) : d < r ? 0xb88a1a : 0xf4f0e6);
  });
});
const S_VHS = tex('i_pg_vhs', 16, 10, (pc) => {
  pc.wrap = false;
  pc.each((x, y) => pc.set(x, y, 0x1a1a1c));
  for (let y = 2; y < 8; y++) for (let x = 1; x < 15; x++) pc.set(x, y, y < 4 ? 0xe8b830 : 0xf4ecd8);
  for (let x = 2; x < 14; x++) if (ph(x, 1, 3) < 0.6) pc.set(x, 5 + (x % 2), 0x3a3a6a);
  pc.set(3, 3, 0xd8322a); pc.set(4, 3, 0x2a8ac8); pc.set(5, 3, 0x4ab83a);
});
const S_RULER = tex('i_pg_ruler', 4, 32, (pc) => {
  pc.each((x, y) => pc.set(x, y, y > 24 ? (ph(x, y, 5) < 0.6 ? 0x6a0e0e : 0x9a2a1a) : x === 0 && y % 2 === 0 ? 0x2a1a10 : 0xd8b070));
}, true);

defItem({
  key: 'pg_gold_star', name: 'Gold Star Sticker', cat: 'misc', weight: 0.005, value: 12, tags: ['paper', 'sticker', 'weird'],
  desc: 'A shiny gold star on a waxed backing, the kind a teacher gives you. COUNT-O hands one out when it cannot find you. It says GOOD HIDING in tiny letters round the edge. Holding it makes you feel, briefly and stupidly, proud.',
  literature: { unhappy: -12, stress: -6, boredom: -4, pages: 1, text: 'GOOD HIDING!\n\n— COUNT-O' },
  model: (mb: MB) => { mb.box(0, 0.001, 0, 0.05, 0.002, 0.05, S_STAR, { fit: true }); },
});
defItem({
  key: 'pg_plush_scrap', name: 'Costume Plush', cat: 'material', weight: 0.12, value: 5, tags: ['cloth', 'fabric', 'weird'],
  desc: 'A torn panel of faded costume fur, foam-backed, the kind walk-around mascots are made of. One side is soft and smells of old sweat and lavender spray. The other side is stained dark.',
  model: (mb: MB) => {
    prism(mb, [[-0.07, -0.04], [0.0, -0.06], [0.08, -0.03], [0.07, 0.04], [-0.01, 0.06], [-0.07, 0.03]], 0, 0.014, S_PLUSH, S_PLUSH, { color: 0xe08a44, sideColor: 0x6a1a14 });
  },
});
defItem({
  key: 'pg_googly_eye', name: 'Giant Googly Eye', cat: 'misc', weight: 0.08, value: 9, tags: ['plastic', 'weird'],
  desc: 'A googly eye the size of a saucer off Dooley Duckbill\'s head. The pupil rattles round inside. Whichever way you hold it, it ends up looking at you.',
  model: (mb: MB) => {
    mb.cylinder(0, 0, 0, 0.06, 0.018, 12, T.white, { color: 0xf4f2ec });
    mb.cylinder(0.015, 0.018, 0.01, 0.026, 0.004, 10, T.black, { color: 0x141414 });
  },
});
defItem({
  key: 'pg_crt_tube', name: 'Belly Picture Tube', cat: 'electronics', weight: 1.4, value: 26, tags: ['electronics', 'glass', 'weird'],
  desc: 'The small cathode-ray tube out of a Doodlewump\'s stomach, with a ribbon of plush still stuck to the yoke. Valuable salvage: copper, glass and a phosphor that glows faintly for hours after it has been unplugged.',
  model: (mb: MB) => {
    mb.box(0, 0.06, 0.02, 0.16, 0.12, 0.02, T.glass, { color: 0x3a4a44, emissive: 0.25 });
    mb.cylinder(0, 0.06, -0.06, 0.05, 0.14, 8, T.glass, { color: 0x6a7a74, rTop: 0.02 } as any);
    mb.box(0, 0.06, -0.02, 0.17, 0.13, 0.02, T.plastic, { color: 0xd8cca8 });
  },
});
defItem({
  key: 'pg_aerial', name: 'Bent Aerial', cat: 'material', weight: 0.15, value: 6, tags: ['metal', 'wire', 'weird'],
  desc: 'A set of telescopic rabbit-ear rods on a knob of black plastic, pulled off a Doodlewump\'s head. One rod is bent. Good thin metal; it still picks up something, faintly, if you hold it up.',
  model: (mb: MB) => {
    mb.sphere(0, 0.012, 0, 0.018, 6, 4, T.black, { color: 0x222222 });
    mb.push(); mb.translate(0, 0.01, 0); mb.rotateZ(0.5); mb.box(0, 0.11, 0, 0.006, 0.22, 0.006, T.steel, { color: 0xb8bcc4 }); mb.pop();
    mb.push(); mb.translate(0, 0.01, 0); mb.rotateZ(-0.7); mb.box(0, 0.09, 0, 0.006, 0.18, 0.006, T.steel, { color: 0xb8bcc4 }); mb.pop();
  },
});
defItem({
  key: 'pg_sock', name: 'Lefty\'s Sock', cat: 'misc', weight: 0.1, value: 14, tags: ['cloth', 'fabric', 'weird'], noStack: true,
  desc: 'A big striped tube sock with two mismatched buttons for eyes, a red pompom nose and a felt tongue. The inside is wet. It is warm, and it is the shape of a hand even when nothing is in it.',
  model: (mb: MB) => {
    mb.box(0, 0.02, 0, 0.09, 0.04, 0.26, T.knit, { color: 0xc89a2a });
    for (let i = 0; i < 4; i++) mb.box(0, 0.021, -0.1 + i * 0.06, 0.092, 0.041, 0.02, T.knit, { color: 0x7a2228 });
    mb.sphere(0, 0.03, 0.13, 0.018, 6, 4, T.cloth, { color: 0xd8322a });
    mb.cylinder(0.022, 0.04, 0.07, 0.016, 0.004, 10, T.white, { color: 0xeeeae0 });
  },
});
defItem({
  key: 'pg_button_eye', name: 'Shirt Button Eye', cat: 'misc', weight: 0.01, value: 3, tags: ['plastic', 'sewing'],
  desc: 'A big white four-hole shirt button with black thread still crossed through it. It was somebody\'s eye on television for six years.',
  model: (mb: MB) => { mb.cylinder(0, 0, 0, 0.018, 0.004, 10, T.white, { color: 0xeeeae0 }); },
});
defItem({
  key: 'pg_seeds', name: 'Petula\'s Seeds', cat: 'food', weight: 0.08, value: 6, tags: ['seed', 'weird'],
  desc: 'A double handful of fat striped sunflower seeds prised out of Petula\'s seed head, some from the rim, some from round the face. Raw, they taste of milk and soil and make you feel watched. Roasted, they are just sunflower seeds. Mostly.',
  food: { hunger: 10, calories: 290, raw: true, cookable: true, cookMins: 6, lucidity: -3, stress: 2, fresh: 20, rot: 60, ingredient: 'grain', cookedName: 'Roasted Seeds' },
  model: (mb: MB) => {
    for (let i = 0; i < 9; i++) { const a = i * 2.3, r = 0.008 + (i % 3) * 0.01; mb.sphere(Math.cos(a) * r, 0.006 + (i % 2) * 0.006, Math.sin(a) * r, 0.007, 5, 3, T.black, { color: i % 2 ? 0x2a2018 : 0xd8d0b8, sy: 0.5 }); }
  },
});
defItem({
  key: 'pg_petal', name: 'Sunflower Petal', cat: 'material', weight: 0.01, value: 2, tags: ['plant', 'tinder'],
  desc: 'A yellow petal as long as your forearm, brown at the tip. It does not wilt in the pocket. It turns, very slowly, toward whoever is nearest.',
  model: (mb: MB) => { prism(mb, [[-0.1, 0], [-0.03, 0.02], [0.08, 0.012], [0.11, 0], [0.08, -0.012], [-0.03, -0.02]], 0, 0.002, T.white, T.white, { color: 0xf0c430 }); },
});
defItem({
  key: 'pg_ruler', name: 'COUNT-O\'s Metre-Stick', cat: 'weapon', weight: 0.5, value: 16, tags: ['wood', 'weird'],
  desc: 'A varnished pine metre-stick, wrapped at one end in silver tape where it was taped to an oven mitt. The far end is dark and tacky. It counts, quietly, when you swing it.',
  weapon: { kind: 'blunt', dmg: [5, 9], range: 1.5, speed: 1.4, endurance: 0.03, crit: 0.12, knock: 0.45, durability: 160, noise: 5 },
  model: (mb: MB) => {
    mb.box(0, 0.006, 0, 1.0, 0.006, 0.028, S_RULER, { fit: true });
    mb.box(-0.44, 0.008, 0, 0.12, 0.01, 0.032, T.tin, { color: 0xb8bcc4 });
  },
});
defItem({
  key: 'pg_vhs', name: 'Bright Hour Tape', cat: 'misc', weight: 0.25, value: 4, tags: ['plastic', 'media'],
  desc: 'A VHS cassette with a Bright Hour Television label, handwritten: an episode number and a date in 1990-something. The tape inside has been wound and rewound until it is shiny. There is nothing in the playground to play it on except the bellies.',
  model: (mb: MB) => { mb.box(0, 0.013, 0, 0.19, 0.026, 0.105, { top: S_VHS, sides: T.black, bottom: T.black } as any, { color: 0xffffff, fit: true } as any); },
});

// ---- corpses
defLoot('creature_pg_dooley', [2, 4], [['pg_plush_scrap', 6], ['pg_googly_eye', 2], ['meat_raw', 3], ['rag', 2], ['bone', 1]], 0);
defLoot('creature_pg_doodlewump', [1, 3], [['pg_plush_scrap', 5], ['pg_crt_tube', 1.5], ['pg_aerial', 3], ['electronics_scrap', 2], ['rag', 2]], 0);
defLoot('creature_pg_lefty', [1, 2], [['pg_sock', 3], ['pg_button_eye', 3]], 0.1);
defLoot('creature_pg_petula', [2, 3], [['pg_seeds', 6], ['pg_petal', 4]], 0);
defLoot('creature_pg_counto', [2, 3], [['pg_ruler', 4], ['pg_gold_star', 3], ['duct_tape', 2], ['scrap_metal', 2], ['meat_raw', 1]], 0);
// ---- the playground: lost things in the grass and the sandpits; the studio's shelves and lockers
defLoot('pg_floor', [1, 1], [['juice_box', 3], ['lollipop', 2], ['toy_car', 2], ['toy_rubber_duck', 1], ['crayons', 2], ['candy_necklace', 1.5], ['pg_vhs', 1], ['pg_gold_star', 0.5], ['rag', 1], ['battery', 0.6]], 0.15);
defLoot('pg_studio', [2, 4], [['pg_vhs', 4], ['battery', 3], ['duct_tape', 2], ['wire', 2], ['electronics_scrap', 2], ['juice_box', 2], ['crayons', 1], ['pg_plush_scrap', 1.5], ['screws', 1]], 0.05);
