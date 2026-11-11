// Items stream — THE HOMESTEAD (round 15, src/game/economy): raw resources
// the Remittance Press weighs as matter (polymer scrap, reagent, glass pane,
// biomass), livestock produce (honeycomb, moon milk, pigeon eggs, feed mash),
// and the backrooms crops and fungi with their seed twists and spawn plugs.
// Every one has a real model, so the icon pipeline (src/ui/icons.ts) renders
// its high-res icon from it.
import { defItem } from '../../items/item';
import { lootTable } from '../../items/loot';
import { tex, T, rp, ph, bayer, prism, type MB } from './_kit';

// ---------------------------------------------------------------- textures
const S_REAGENT = tex('i_ec_reagent', 16, 12, (pc) => {
  pc.fill(0x6a3a14);
  pc.each((x, y) => { if (ph(x, y, 5) < 0.18) pc.set(x, y, 0x8a5222); if (x === 1 || x === 2) pc.set(x, y, 0xb07a3a); });
  // a peeling typed label: hazard diamond, a hand-written code
  pc.rect(5, 2, 9, 8, 0xe8dcc0); pc.strokeRect(5, 2, 9, 8, 0xb8a888);
  pc.set(7, 4, 0xc8301e); pc.set(6, 5, 0xc8301e); pc.set(8, 5, 0xc8301e); pc.set(7, 6, 0xc8301e); pc.set(7, 5, 0xffd060);
  pc.hline(10, 12, 4, 0x2a2a3a); pc.hline(10, 13, 6, 0x2a2a3a); pc.hline(6, 11, 8, 0x5a5a6a);
  pc.set(13, 9, 0x8a5222); pc.set(12, 9, 0xd8ccb0);
}, true);
const S_POLY = tex('i_ec_poly', 12, 12, (pc) => {
  const R = rp(0x5ab8d8, 5, 0.6);
  pc.each((x, y) => pc.set(x, y, R[1 + Math.floor(ph(x >> 1, y, 7) * 3)]));
  for (let i = 0; i < 4; i++) pc.line(ph(i, 1, 9) * 11, 0, ph(i, 2, 9) * 11, 11, 0xd8f4ff);
}, true);
const S_TRAY = tex('i_ec_tray', 12, 12, (pc) => {
  pc.fill(0xe8d8b0);
  pc.each((x, y) => { if (ph(x, y, 11) < 0.1) pc.set(x, y, 0xc8b890); });
  pc.line(2, 0, 7, 11, 0x6a5a40); pc.line(7, 11, 9, 6, 0x6a5a40);
});
const S_BIOMASS = tex('i_ec_biomass', 12, 12, (pc) => {
  pc.each((x, y) => { const n = ph(x, y, 13); pc.set(x, y, n < 0.15 ? 0x8a2a1e : n < 0.35 ? 0x6a8a3a : n < 0.6 ? 0x4a3422 : n < 0.8 ? 0x5a4a2a : 0xa89060); });
}, true);
const S_SACK = tex('i_ec_sack', 12, 16, (pc) => {
  pc.each((x, y) => pc.set(x, y, (x + y) % 2 ? 0xc8a870 : 0xb89860));
  pc.rect(2, 5, 8, 6, 0xe8dcc0);
  pc.hline(3, 8, 6, 0x3a6a2a); pc.hline(3, 7, 8, 0x3a6a2a); pc.set(5, 9, 0xc83a1e); pc.set(6, 9, 0xc83a1e);
}, true);
const S_COMB = tex('i_ec_comb', 16, 16, (pc) => {
  pc.each((x, y) => {
    const cx = (x + (Math.floor(y / 3) % 2) * 2) % 4, cy = y % 3;
    const wall = cx === 0 || cy === 0;
    pc.set(x, y, wall ? (bayer(x, y) > 0.5 ? 0xf0c860 : 0xd8a840) : ph(x, y, 17) < 0.3 ? 0xffd870 : 0xe89a1a);
  });
});
const S_MILK = tex('i_ec_milk', 12, 12, (pc) => {
  pc.each((x, y) => pc.set(x, y, x < 2 ? 0xf8f4ff : ph(x, y, 19) < 0.15 ? 0xd8d0f0 : 0xe8e4f8));
  pc.hline(0, 11, 2, 0xa8a0c8);
}, true);
const S_PAPER = tex('i_ec_twist', 8, 8, (pc) => { pc.each((x, y) => pc.set(x, y, (x * 3 + y) % 5 === 0 ? 0xc8b890 : 0xe8dcc0)); pc.hline(0, 7, 3, 0x6a5a40); }, true);
const S_MYC = tex('i_ec_mycelium', 8, 8, (pc) => { pc.each((x, y) => pc.set(x, y, ph(x, y, 23) < 0.35 ? 0xf8f4ec : 0xd8d0c0)); });
const S_TUBER = tex('i_ec_tuber', 8, 8, (pc) => { pc.each((x, y) => pc.set(x, y, ph(x, y, 29) < 0.12 ? 0x8a7050 : ph(x, y, 31) < 0.3 ? 0xd8c8a0 : 0xe8dcc0)); }, true);
const S_EAR = tex('i_ec_ear', 12, 12, (pc) => {
  const R = rp(0xa8784a, 6, 0.55);
  pc.each((x, y) => { const d = Math.hypot(x - 6, y - 11); pc.set(x, y, d > 10 ? 0xe8d8b0 : R[1 + (Math.floor(d + ph(x, y, 37)) % 4)]); });
});
const S_MOREL = tex('i_ec_morel', 8, 8, (pc) => { pc.each((x, y) => { const ridge = (x + (y >> 1) * 2) % 3 === 0 || y % 3 === 0; pc.set(x, y, ridge ? 0xc8a878 : 0x4a2c1a); }); }, true);
const S_HUM = tex('i_ec_hum', 8, 8, (pc) => { pc.each((x, y) => pc.set(x, y, ph(x, y, 41) < 0.18 ? 0xd8e8f8 : 0x4a6a98)); });
const S_PUFF = tex('i_ec_puff', 8, 8, (pc) => { pc.each((x, y) => pc.set(x, y, (x + y * 3) % 7 === 0 ? 0xc8c0b0 : 0xf2eee4)); }, true);
const S_MOSS = tex('i_ec_moss', 8, 8, (pc) => { pc.each((x, y) => pc.set(x, y, ph(x, y, 43) < 0.15 ? 0xd8f0a0 : ph(x, y, 47) < 0.4 ? 0x3a6a2a : 0x5a8a3a)); }, true);
const S_GLASS = tex('i_ec_pane', 12, 12, (pc) => {
  pc.each((x, y) => pc.set(x, y, (x - y + 12) % 12 < 2 ? 0xf0fbff : 0xb8d4dc));
  pc.strokeRect(0, 0, 12, 12, 0x8a7a5a);
}, false);

// ---------------------------------------------------------------- raw resources (the press weighs these by material)
defItem({
  key: 'plastic_scrap', name: 'Polymer Scrap', cat: 'material', weight: 0.25, value: 3, tags: ['plastic', 'polymer', 'fuel'], burn: 0.2,
  desc: 'A crushed blue bottle, a cracked cafeteria tray and a coil of chair-leg cap. It melts into anything and outlives everyone.',
  model: (mb) => {
    mb.push().rotateZ(1.5708).translate(0.025, 0, 0);
    mb.cylinder(0, -0.06, 0, 0.026, 0.1, 9, S_POLY, { color: 0xffffff });
    mb.cylinder(0, 0.04, 0, 0.026, 0.025, 9, S_POLY, { rTop: 0.01 });
    mb.cylinder(0, 0.065, 0, 0.011, 0.012, 8, T.plastic, { color: 0xd8302a });
    mb.pop();
    prism(mb, [[-0.07, -0.06], [0.02, -0.07], [0.05, -0.02], [-0.02, 0.03], [-0.08, -0.01]], 0, 0.01, S_TRAY, S_TRAY, { color: 0xffffff, sideColor: 0xc8b890 });
    mb.cylinder(0.05, 0, 0.04, 0.012, 0.02, 7, T.rubber, { rTop: 0.014 });
  },
});
defItem({
  key: 'chem_reagent', name: 'Reagent Jar', cat: 'material', weight: 0.45, value: 14, tags: ['chem', 'flammable', 'glass'],
  desc: 'A stoppered brown jar of something that was a solvent once. The label is a hazard diamond and a hand-written code nobody alive can read. The press calls it Chemical.',
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.035, 0.085, 10, S_REAGENT, { color: 0xffffff });
    mb.cylinder(0, 0.085, 0, 0.035, 0.018, 10, T.glass, { rTop: 0.02, color: 0x8a5222 });
    mb.cylinder(0, 0.102, 0, 0.019, 0.022, 8, T.leather, { color: 0xc8a070, rTop: 0.021 });
    mb.box(0, 0.124, 0, 0.044, 0.004, 0.006, T.white, { color: 0xe8dcc0 });
  },
});
defItem({
  key: 'glass_pane', name: 'Glass Pane', cat: 'material', weight: 1.2, value: 6, tags: ['glass', 'mineral'],
  desc: 'A clean square of window glass with its edges taped so it cannot open you. A greenhouse wall, a lantern, a lens, or a lot of shards.',
  model: (mb) => {
    mb.push().rotateX(-0.12);
    mb.box(0, 0, 0, 0.24, 0.004, 0.24, { all: T.glass, top: S_GLASS }, { color: 0xd8f0f8, fit: true });
    for (const [x, z, w, d] of [[0, -0.12, 0.25, 0.01], [0, 0.12, 0.25, 0.01], [-0.12, 0, 0.01, 0.25], [0.12, 0, 0.01, 0.25]]) mb.box(x, 0.003, z, w, 0.003, d, T.white, { color: 0xd8c890 });
    mb.pop();
  },
});
defItem({
  key: 'biomass', name: 'Biomass Brick', cat: 'material', weight: 0.5, value: 2, tags: ['organic', 'fuel', 'compost', 'feed'], burn: 0.6,
  desc: 'Leaves, peel, gristle and moss pressed into a damp brick. It feeds a planter, a fire or anything in a pen that is not fussy.',
  model: (mb) => {
    mb.box(0, 0, 0, 0.12, 0.05, 0.08, S_BIOMASS, { uvScale: 2 });
    mb.sphere(0.03, 0.05, 0.01, 0.014, 5, 3, T.white, { color: 0x6a8a3a });
    mb.sphere(-0.04, 0.048, -0.02, 0.01, 5, 3, T.white, { color: 0x8a2a1e });
  },
});
defItem({
  key: 'feed_mash', name: 'Feed Mash', cat: 'material', weight: 0.5, value: 4, tags: ['feed', 'organic'],
  desc: 'A paper sack of ground tuber, moss and grit. Penned animals eat it; so would you, once.',
  model: (mb) => {
    mb.box(0, 0, 0, 0.09, 0.13, 0.06, S_SACK, { fit: true });
    mb.box(0, 0.13, 0, 0.08, 0.025, 0.05, T.card, { color: 0xc8a870 });
    mb.box(0, 0.152, 0, 0.07, 0.008, 0.03, T.card, { color: 0xb89860 });
  },
});

// ---------------------------------------------------------------- livestock produce
defItem({
  key: 'honeycomb', name: 'Honeycomb', cat: 'food', weight: 0.3, value: 22, tags: ['honey', 'sweet', 'wax'],
  desc: 'A slab of comb from a penned Bumble Bee, heavy with honey that tastes faintly of old candles and the inside of a church. The wax chews into something you can seal a jar with.',
  food: { hunger: 10, calories: 420, unhappy: -14, stress: -4 },
  model: (mb) => {
    mb.box(0, 0, 0, 0.12, 0.03, 0.08, { all: T.white, top: S_COMB }, { color: 0xffffff, fit: { top: true } });
    mb.box(0, 0.002, 0, 0.122, 0.024, 0.082, T.white, { color: 0xe8a02a, skip: ['top', 'bottom'] });
    mb.sphere(0.05, 0.003, 0.04, 0.012, 6, 3, T.white, { color: 0xffb830, sy: 0.4, emissive: 0.2 });
  },
});
defItem({
  key: 'moon_milk', name: 'Moon Milk', cat: 'food', weight: 0.5, value: 16, tags: ['milk', 'weird'],
  desc: 'Pale lilac milk from a penned Moon Calf, in a stoppered jar. It glows in the dark for an hour after milking and tastes like cold almonds.',
  food: { hunger: 6, thirst: 22, calories: 260, unhappy: -6, fresh: 3, rot: 6 },
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.032, 0.09, 10, S_MILK, { color: 0xffffff, emissive: 0.15 });
    mb.cylinder(0, 0.09, 0, 0.032, 0.015, 10, T.glass, { rTop: 0.022, color: 0xe8e4f8 });
    mb.cylinder(0, 0.105, 0, 0.022, 0.018, 8, T.leather, { color: 0xc8a070 });
  },
});
defItem({
  key: 'pigeon_egg', name: 'Tallow Pigeon Egg', cat: 'food', weight: 0.06, value: 7, tags: ['egg'],
  desc: 'A small waxy egg, warm as a hand, laid in the straw of a pen. The shell smells of candle smoke.',
  food: { hunger: 6, calories: 90, raw: true, cookable: true, cookMins: 5, poison: 0.08, fresh: 6, rot: 12, ingredient: 'egg', cookedName: 'Fried Pigeon Egg' } as any,
  model: (mb) => {
    mb.sphere(0, 0.025, 0, 0.02, 8, 6, T.white, { color: 0xf0e8d0, sy: 1.3 });
    for (let i = 0; i < 4; i++) { const a = i * 1.9; mb.sphere(Math.cos(a) * 0.018, 0.02 + (i % 2) * 0.012, Math.sin(a) * 0.018, 0.004, 4, 3, T.black, { color: 0xc8b890 }); }
  },
});

// ---------------------------------------------------------------- crops and fungi
const cluster = (mb: MB, n: number, fn: (i: number, a: number) => void) => { for (let i = 0; i < n; i++) fn(i, i * 2.39); };
defItem({
  key: 'lamp_moss', name: 'Lamp Moss', cat: 'food', weight: 0.08, value: 6, tags: ['moss', 'tinder', 'organic'],
  desc: 'A damp cushion of moss that grows on ceiling-tile dust under the strip lights and keeps a faint green glow when you close your hand round it. Bitter. Packs into a wound; lights a fire.',
  food: { hunger: 2, calories: 20, unhappy: 6, fresh: 5, rot: 10 },
  model: (mb) => {
    cluster(mb, 6, (i, a) => mb.sphere(Math.cos(a) * 0.03 * (i ? 1 : 0), 0.012, Math.sin(a) * 0.03 * (i ? 1 : 0), 0.028 - i * 0.002, 7, 4, S_MOSS, { sy: 0.55, emissive: 0.2 }));
    cluster(mb, 5, (i, a) => mb.sphere(Math.cos(a) * 0.035, 0.035, Math.sin(a) * 0.035, 0.004, 4, 3, T.white, { color: 0xe8ffc0, emissive: 1.2 }));
  },
});
defItem({
  key: 'almond_burr', name: 'Almond Burr', cat: 'food', weight: 0.06, value: 9, tags: ['plant', 'weird'],
  desc: 'The seed head of an Almond Thistle, swollen with the sweet water the plant pulls out of the carpet. Suck it dry, mind the spines.',
  food: { hunger: 2, thirst: 14, calories: 45, unhappy: -2, fresh: 3, rot: 6 },
  model: (mb) => {
    mb.sphere(0, 0.03, 0, 0.026, 8, 6, S_MOSS, { color: 0x9ab080 });
    mb.sphere(0, 0.055, 0, 0.022, 8, 4, T.white, { color: 0xf2ecd8, sy: 0.7 });
    cluster(mb, 8, (i, a) => mb.box(Math.cos(a) * 0.026, 0.02 + (i % 3) * 0.01, Math.sin(a) * 0.026, 0.004, 0.004, 0.014, T.white, { color: 0xb8c8a0 }));
    mb.cylinder(0, 0, 0, 0.004, 0.02, 4, T.white, { color: 0x7a9a6a });
  },
});
defItem({
  key: 'vent_tuber', name: 'Vent Tuber', cat: 'food', weight: 0.2, value: 4, tags: ['vegetable', 'plant'],
  desc: 'A pale, knuckled tuber that grows in the dust behind air vents. Starchy and bland raw, good roasted. Every eye on it is a new plant.',
  food: { hunger: 14, calories: 180, cookable: true, cookMins: 12, fresh: 20, rot: 40, unhappy: 2 },
  model: (mb) => {
    mb.push().scale(1.4, 1, 1); mb.sphere(0, 0.026, 0, 0.03, 8, 6, S_TUBER, { sy: 0.8 }); mb.pop();
    mb.sphere(0.035, 0.03, 0.01, 0.018, 6, 4, S_TUBER, { sy: 0.8 });
    cluster(mb, 4, (i, a) => mb.sphere(Math.cos(a) * 0.04, 0.03, Math.sin(a) * 0.026, 0.004, 4, 3, T.white, { color: 0x8a7050 }));
  },
});
defItem({
  key: 'wallpaper_ear', name: 'Wallpaper Ear', cat: 'food', weight: 0.1, value: 6, tags: ['fungus', 'mushroom'],
  desc: 'A shelf fungus peeled off damp wallpaper, the old pattern still printed on its back. Woody raw; fried in its own juice it tastes like bacon and paste.',
  food: { hunger: 8, calories: 70, raw: true, cookable: true, cookMins: 6, poison: 0.15, fresh: 4, rot: 8 },
  model: (mb) => {
    for (let k = 0; k < 3; k++) { mb.push().translate(0, 0.006 + k * 0.012, -k * 0.012).rotateY(k * 0.35 - 0.3); mb.sphere(0, 0, 0.02, 0.05 - k * 0.01, 10, 4, S_EAR, { sy: 0.22 }); mb.pop(); }
    mb.box(0, 0.015, -0.03, 0.05, 0.03, 0.012, T.card, { color: 0xc8b8d8 });
  },
});
defItem({
  key: 'carpet_morel', name: 'Carpet Morel', cat: 'food', weight: 0.05, value: 9, tags: ['fungus', 'mushroom'],
  desc: 'A honeycombed cap pushed up through wet carpet, still trailing a tuft of beige pile. Rich and meaty cooked. Raw it turns your stomach for a day.',
  food: { hunger: 6, calories: 50, raw: true, cookable: true, cookMins: 5, poison: 0.35, fresh: 3, rot: 6, unhappy: -4 },
  model: (mb) => {
    mb.cylinder(0, 0, 0, 0.012, 0.03, 7, T.white, { rTop: 0.01, color: 0xf0e8d4 });
    mb.sphere(0, 0.055, 0, 0.022, 8, 6, S_MOREL, { sy: 1.6 });
    mb.box(0, 0.002, 0, 0.03, 0.004, 0.03, T.knit, { color: 0xc8b890 });
  },
});
defItem({
  key: 'hum_cap', name: 'Hum Cap', cat: 'food', weight: 0.03, value: 12, tags: ['fungus', 'mushroom', 'weird'],
  desc: 'Slate-blue caps that cluster where the wiring hums and lean toward it. Eaten raw they quiet the sixty-cycle note in your head for a while. Too many and they quiet everything else.',
  food: { hunger: 2, calories: 15, stress: -18, unhappy: -6, fresh: 3, rot: 7 },
  model: (mb) => {
    cluster(mb, 7, (i, a) => { const r = i ? 0.016 : 0, h = 0.03 + (i % 3) * 0.008; mb.cylinder(Math.cos(a) * r, 0, Math.sin(a) * r, 0.003, h, 4, T.white, { color: 0xd8e0e8 }); mb.sphere(Math.cos(a) * r, h, Math.sin(a) * r, 0.01, 7, 4, S_HUM, { sy: 0.5, emissive: 0.25 }); });
  },
});
defItem({
  key: 'puffball', name: 'Tallow Puffball', cat: 'food', weight: 0.35, value: 8, tags: ['fungus', 'mushroom'],
  desc: 'A white ball of fungus the size of a fist with flesh like cold tofu. Slice and fry it while it is white; once it browns it is a bag of spores.',
  food: { hunger: 18, calories: 140, cookable: true, cookMins: 8, fresh: 2, rot: 4 },
  model: (mb) => {
    mb.sphere(0, 0.045, 0, 0.05, 10, 7, S_PUFF, { sy: 0.85 });
    mb.sphere(0, 0.004, 0, 0.022, 6, 3, T.white, { color: 0xc8b890, sy: 0.3 });
  },
});
defItem({
  key: 'ceiling_truffle', name: 'Ceiling Truffle', cat: 'food', weight: 0.06, value: 45, tags: ['fungus', 'rare_food', 'shiny'],
  desc: 'A black, knuckled truffle that fruits inside fallen ceiling tiles. Smells of pepper and wet plaster. Nobody has ever grown one on purpose; Meridian pays well for them.',
  food: { hunger: 5, calories: 60, unhappy: -22, stress: -6, fresh: 6, rot: 14 },
  model: (mb) => {
    mb.sphere(0, 0.022, 0, 0.026, 8, 6, S_MOREL, { color: 0x3a2e2a, sy: 0.8 });
    mb.sphere(0.018, 0.03, 0.01, 0.014, 6, 4, S_MOREL, { color: 0x2a2220, sy: 0.9 });
    mb.box(-0.01, 0.002, 0.018, 0.03, 0.004, 0.02, T.white, { color: 0xd8d0c0 });
  },
});

// ---------------------------------------------------------------- seeds and spawn
const twist = (color: number, dots: number) => (mb: MB) => {
  mb.cylinder(0, 0, 0, 0.022, 0.05, 8, S_PAPER, { rTop: 0.016, color: 0xffffff });
  mb.cylinder(0, 0.05, 0, 0.016, 0.02, 6, S_PAPER, { rTop: 0.004 });
  mb.box(0, 0.025, 0.021, 0.026, 0.016, 0.002, T.white, { color });
  for (let i = 0; i < dots; i++) mb.box(-0.008 + i * 0.006, 0.028, 0.0225, 0.003, 0.003, 0.001, T.black, { color: 0x2a2a2a });
};
const plug = (cap: number, tex2: string) => (mb: MB) => {
  // a wooden dowel bag: three dowels furred with mycelium, a cap pinning out of one
  mb.box(0, 0, 0, 0.07, 0.06, 0.04, T.white, { color: 0xe8e4dc, emissive: 0.05 });
  for (let i = 0; i < 3; i++) { mb.cylinder(-0.02 + i * 0.02, 0.01, 0, 0.007, 0.045, 6, S_MYC); }
  mb.sphere(0.02, 0.058, 0, 0.012, 7, 4, tex2, { sy: 0.6, color: cap });
  mb.box(0, 0.062, 0, 0.074, 0.006, 0.044, T.white, { color: 0xf0ece4 });
};
defItem({ key: 'seeds_lamp_moss', name: 'Lamp Moss Spores', cat: 'seed', weight: 0.02, value: 3, seed: 'lamp_moss', uses: 3, tags: ['seed'], desc: 'A paper twist of green dust scraped from under a strip light. Sow it under the tubes and keep it damp.', model: twist(0x6ab04a, 2) });
defItem({ key: 'seeds_thistle', name: 'Almond Thistle Seed', cat: 'seed', weight: 0.02, value: 4, seed: 'almond_thistle', uses: 3, tags: ['seed'], desc: 'Silky seed tufts from an Almond Thistle. Wants bright light and a lot of water to give the water back.', model: twist(0xb88ad8, 3) });
defItem({ key: 'seeds_vent_tuber', name: 'Vent Tuber Eyes', cat: 'seed', weight: 0.1, value: 2, seed: 'vent_tuber', uses: 3, tags: ['seed'], desc: 'Chunks of Vent Tuber, an eye in each. They grow in nearly any light.', model: (mb) => { for (const [x, z] of [[-0.02, 0], [0.02, 0.01], [0, -0.02]]) mb.sphere(x, 0.016, z, 0.018, 7, 5, S_TUBER, { sy: 0.7 }); } });
defItem({ key: 'spawn_ear', name: 'Wallpaper Ear Spawn', cat: 'seed', weight: 0.08, value: 4, seed: 'wallpaper_ear', uses: 2, tags: ['seed', 'spawn'], desc: 'Dowels furred white with Wallpaper Ear mycelium. Push them into something damp and keep the light off it.', model: plug(0xc89860, 'ec_ear') });
defItem({ key: 'spawn_morel', name: 'Carpet Morel Spawn', cat: 'seed', weight: 0.08, value: 6, seed: 'carpet_morel', uses: 2, tags: ['seed', 'spawn'], desc: 'Morel mycelium in a bag of wet carpet fibre. Dark, damp, patient.', model: plug(0x5a3a22, 'ec_morel') });
defItem({ key: 'spawn_humcap', name: 'Hum Cap Spawn', cat: 'seed', weight: 0.08, value: 8, seed: 'hum_cap', uses: 2, tags: ['seed', 'spawn'], desc: 'Hum Cap mycelium. It grows faster next to a generator; nobody knows why and nobody likes it.', model: plug(0x5a7aa8, 'ec_humcap') });
defItem({ key: 'spawn_puffball', name: 'Puffball Spawn', cat: 'seed', weight: 0.08, value: 4, seed: 'tallow_puffball', uses: 2, tags: ['seed', 'spawn'], desc: 'Spawn dowels for Tallow Puffballs. Harvest them white.', model: plug(0xf2eee4, 'ec_puff') });

// ---------------------------------------------------------------- where they turn up
function seedLoot(table: string, entries: [string, number][]) {
  const t = lootTable(table); if (!t) return;
  for (const e of entries) if (!t.entries.some((x) => x[0] === e[0])) t.entries.push(e);
}
/** loot tables are defined by other modules: seeded once everything has loaded (and again at session start) */
export function seedEconomyLoot() {
  seedLoot('maintenance', [['chem_reagent', 1.2], ['plastic_scrap', 1.5]]);
  seedLoot('janitor', [['chem_reagent', 2], ['plastic_scrap', 1]]);
  seedLoot('lab_cabinet', [['chem_reagent', 2.5], ['spawn_humcap', 0.4]]);
  seedLoot('lab_bench', [['chem_reagent', 2]]);
  seedLoot('garage_shelf', [['chem_reagent', 1.5], ['glass_pane', 0.6]]);
  seedLoot('store_hardware', [['chem_reagent', 1], ['glass_pane', 1], ['plastic_scrap', 1]]);
  seedLoot('trash', [['plastic_scrap', 3], ['biomass', 0.8]]);
  seedLoot('dumpster', [['plastic_scrap', 3], ['biomass', 1.2]]);
  seedLoot('mall_trash', [['plastic_scrap', 3]]);
  seedLoot('kitchen_cabinet', [['plastic_scrap', 1]]);
  seedLoot('store_produce', [['seeds_vent_tuber', 1.5], ['vent_tuber', 1]]);
  seedLoot('camp_supplies', [['seeds_lamp_moss', 1], ['seeds_vent_tuber', 1], ['feed_mash', 0.6], ['spawn_ear', 0.5]]);
  seedLoot('survivor_stash', [['seeds_thistle', 0.8], ['spawn_morel', 0.5], ['spawn_puffball', 0.6]]);
  seedLoot('creature_nest', [['biomass', 2]]);
  seedLoot('floor_lobby', [['plastic_scrap', 0.6], ['seeds_lamp_moss', 0.2]]);
  seedLoot('floor_generic', [['plastic_scrap', 0.6]]);
  // smashed furniture sheds its material
  seedLoot('debris_plastic', [['plastic_scrap', 4]]);
  seedLoot('debris_glass', [['glass_pane', 1.2]]);
  seedLoot('debris_flesh', [['biomass', 3]]);
  seedLoot('debris_elec', [['chem_reagent', 0.5]]);
}
queueMicrotask(seedEconomyLoot);
