// Items stream — DRINKS. Sealed single-serve drinks are food items (cat
// 'drink') that leave an empty container. Bottled water / Bluecap /
// liquor are fluid containers: thirst comes from the fluid (0.25 L ≈ 12 thirst).
// FoodProps.alcohol is the drunkenness added by the whole item on a 0..1 scale.
import { defItem } from '../../items/item';
import { tex, labelTex, decal, T, K, rp, dk, lt, txtC, stamp, stampC, dashes, band, panels, can, bottle, pack, ph, MB } from './_kit';
import { IN, mug } from './_vessels';

// ---------------------------------------------------------------- textures
const L_SODA = tex('i_soda_label', 24, 14, (pc) => {
  pc.fill(0xc8202a);
  panels(pc, 2, (x0, pw) => {
    // white wave ribbon
    for (let i = 0; i < pw; i++) {
      const y = 8 + Math.round(Math.sin((i / pw) * Math.PI * 2) * 1.5);
      pc.set(x0 + i, y, 0xf6f2ea); pc.set(x0 + i, y + 1, 0xf6f2ea);
    }
    dashes(pc, x0 + 2, 4, pw - 4, 0xf6f2ea, 2); dashes(pc, x0 + 3, 5, pw - 6, 0xf6f2ea, 7);
  });
  band(pc, 0, 1, 0xa8181e); band(pc, 13, 1, 0xa8181e);
}, true);
const L_ENERGY = tex('i_energy_label', 24, 16, (pc) => {
  pc.fill(0x1c1c20);
  panels(pc, 2, (x0, pw) => {
    const cx = Math.round(x0 + pw / 2);
    for (let k = -1; k <= 1; k++) for (let j = 0; j < 9; j++) pc.set(cx + k * 2 + (j >> 2) - 1, 3 + j, 0x8af04a);
    dashes(pc, cx - 4, 14, 9, 0x8af04a, 3);
  });
  band(pc, 0, 1, 0x4a4a52);
}, true);
const D_JUICE = decal('i_juice_front', 10, 16, (pc) => {
  pc.fill(0xf0a030); pc.rect(0, 0, 10, 3, 0x3a8a3a);
  pc.circle(5, 8, 3, 0xf6c040); pc.circle(5, 8, 2, 0xf08020); pc.set(4, 7, 0xffe0a0);
  pc.rect(6, 4, 2, 1, 0x3a8a3a);
  dashes(pc, 1, 13, 8, 0x8a4a10, 2);
});
const L_ALMOND = labelTex('i_almond_water_label', 24, 10, {
  bg: 0xe8eef2, band: 0x7ab0d8, bandB: 0x7ab0d8, iconY: 3, icon: ['.bb..', 'bBBb.', 'bBBbb', '.bbb.'], pal: { b: 0x9a6a3a, B: 0xd0a070 },
});
const L_BEER = labelTex('i_beer_label', 16, 8, { bg: 0xe8d8a8, band: 0xc8302a, iconY: 3, icon: ['.yy.', 'yYYy', '.yy.'], pal: { y: 0xd8a020, Y: 0xf6d860 } });
const L_WINE = labelTex('i_wine_label', 16, 10, { bg: 0xefe6d0, band: 0x6a1a28, iconY: 3, icon: ['.p.p.', 'ppppp', '.ppp.', '..p..'], pal: { p: 0x6a1a3a }, panelsN: 1 });
const L_WHISKEY = decal('i_whiskey_label', 8, 10, (pc) => {
  pc.fill(0x1a1a1a); pc.strokeRect(0, 0, 8, 10, 0xc8a050); pc.rect(2, 2, 4, 1, 0xc8a050); dashes(pc, 1, 5, 6, 0xe8d8b0, 3); dashes(pc, 2, 7, 4, 0xe8d8b0, 4);
});
export const S_PBOTTLE = tex('i_pbottle', 8, 16, (pc) => {
  pc.fill(0xe2eef4);
  for (let y = 0; y < 16; y += 3) pc.hline(0, 7, y, 0xc8d8e2);
  for (let y = 1; y < 15; y++) pc.set(1, y, 0xffffff);
  pc.vline(6, 0, 15, 0xbccad4);
});
const L_WATER = labelTex('i_water_label', 24, 8, { bg: 0x2a7ad0, iconY: 2, icon: ['..w..', '.www.', 'wwwww', '.www.'], pal: { w: 0xe8f4ff }, stripe: 0x8ac8f8 });
const L_2L = labelTex('i_2l_label', 24, 10, { bg: 0xc8202a, band: 0xf6f2ea, bandB: 0xf6f2ea, iconY: 3, icon: ['w...w', '.w.w.', '..w..'], pal: { w: 0xf6f2ea } });

// ---------------------------------------------------------------- sealed drinks
defItem({
  key: 'soda_can', name: 'Can of Soda', cat: 'drink', weight: 0.37, tags: ['soda', 'caffeine', 'sweet'],
  food: { hunger: 1, thirst: 16, calories: 140, unhappy: -5, boredom: -2, ingredient: 'sweet', leaves: 'soda_can_empty' },
  model: (mb) => can(mb, L_SODA, 0.033, 0.122, { top: T.aluTop }),
});
defItem({
  key: 'soda_can_empty', name: 'Empty Soda Can', cat: 'misc', weight: 0.015, tags: ['can', 'scrap'],
  desc: 'Crushed aluminium. Makes a racket when kicked.',
  model: (mb) => { mb.push().translate(0, 0.033, 0).rotateZ(Math.PI / 2).scale(1, 0.55, 1); can(mb, L_SODA, 0.033, 0.07, { y: -0.035, top: T.aluTop }); mb.pop(); },
});
defItem({
  key: 'juice_box', name: 'Juice Box', cat: 'drink', weight: 0.22, tags: ['juice', 'sweet'],
  food: { hunger: 1, thirst: 12, calories: 100, unhappy: -3, ingredient: 'fruit' },
  model: (mb) => {
    pack(mb, 0.062, 0.1, 0.04, D_JUICE, 0xf0a030);
    mb.push().translate(0.018, 0.1, 0).rotateZ(-0.25); mb.cylinder(0, 0, 0, 0.003, 0.05, 4, T.white, { color: 0xf6f6f2 }); mb.pop();
  },
});
defItem({
  key: 'energy_drink', name: 'Energy Drink', cat: 'drink', weight: 0.27, tags: ['caffeine', 'sweet'],
  food: { hunger: 1, thirst: 10, calories: 110, stress: 5, boredom: -5, unhappy: -2, ingredient: 'sweet', leaves: 'soda_can_empty' },
  desc: 'Keeps you awake. Your heart has opinions about it.',
  model: (mb) => can(mb, L_ENERGY, 0.027, 0.16, { top: T.aluTop }),
});
defItem({
  key: 'beer', name: 'Bottle of Beer', cat: 'drink', weight: 0.55, tags: ['alcohol'],
  food: { hunger: 2, thirst: 10, calories: 150, alcohol: 0.15, unhappy: -6, stress: -6, leaves: 'empty_bottle' },
  model: (mb) => bottle(mb, { r: 0.03, h: 0.23, neckR: 0.011, neckH: 0.06, shoulder: 0.035, body: T.glass, bodyColor: 0x7a4a1a, label: L_BEER, labelY: 0.04, labelH: 0.06, cap: 0xd8b04a, capH: 0.008 }),
});
defItem({
  key: 'wine', name: 'Bottle of Wine', cat: 'drink', weight: 1.25, tags: ['alcohol'],
  food: { hunger: 2, thirst: 18, calories: 600, alcohol: 0.6, unhappy: -12, stress: -10, leaves: 'empty_bottle' },
  model: (mb) => bottle(mb, { r: 0.037, h: 0.3, neckR: 0.013, neckH: 0.08, shoulder: 0.04, body: T.glass, bodyColor: 0x2e4a2a, label: L_WINE, labelY: 0.05, labelH: 0.075, cap: 0x8a1a2a, capH: 0.04 }),
});

// ---------------------------------------------------------------- fluid-container drinks
defItem({
  key: 'almond_water', name: 'Bluecap Water', cat: 'drink', weight: 0.03, fluidCap: 0.5, startFluid: ['almond', 0.5],
  tags: ['fluidcontainer', 'bottle', 'almond'],
  desc: 'Meridian staff water with a pale blue cap. Faintly sweet, vanilla and pennies. Steadies the mind; the only thing down here that tastes like it was meant for you.',
  model: (mb) => bottle(mb, { r: 0.033, h: 0.21, neckR: 0.013, neckH: 0.02, shoulder: 0.04, body: S_PBOTTLE, bodyColor: 0xf4eedc, label: L_ALMOND, labelY: 0.055, labelH: 0.06, cap: 0x7ab0d8, capH: 0.016 }),
});
defItem({
  key: 'whiskey', name: 'Whiskey', cat: 'drink', weight: 0.6, fluidCap: 0.75, startFluid: ['alcohol', 0.75],
  tags: ['fluidcontainer', 'bottle', 'alcohol', 'glass'],
  desc: '40% proof. Disinfects in a pinch, burns going down either way.',
  model: (mb) => {
    bottle(mb, { r: 0.035, h: 0.26, neckR: 0.013, neckH: 0.05, shoulder: 0.03, body: T.glass, bodyColor: 0xb06a1e, square: true, cap: 0x2a1a10, capH: 0.022 });
    mb.panel(-0.025, 0.0331, 0.025, 0.0331, 0.05, 0.13, L_WHISKEY, { fit: true });
  },
});

// ---------------------------------------------------------------- brewed (recipe results, leave the mug)
defItem({
  key: 'coffee_brewed', name: 'Mug of Coffee', cat: 'drink', weight: 0.55, tags: ['caffeine', 'hot_drink'],
  food: { hunger: 0, thirst: 12, calories: 5, unhappy: -4, boredom: -2, fresh: 1, rot: 3, leaves: 'mug' },
  desc: 'Hot, black, bitter. Pushes sleep back a few hours.',
  model: (mb) => mug(mb, IN.coffee, 0xf0ece4),
});
defItem({
  key: 'tea_brewed', name: 'Mug of Tea', cat: 'drink', weight: 0.55, tags: ['hot_drink'],
  food: { hunger: 0, thirst: 14, calories: 2, stress: -5, unhappy: -3, fresh: 1, rot: 3, leaves: 'mug' },
  model: (mb) => mug(mb, IN.tea, 0xd8e8f0),
});
defItem({
  key: 'lucid_tea', name: 'Dreamlily Tea', cat: 'drink', weight: 0.55, tags: ['hot_drink', 'anomalous'],
  food: { hunger: 0, thirst: 10, calories: 10, lucidity: 20, stress: -8, unhappy: -4, fresh: 1, rot: 2, leaves: 'mug' },
  desc: 'Lavender-coloured and smells of rain on a playground. The walls stop breathing for a while.',
  model: (mb) => mug(mb, IN.lucid, 0xf2e2f6),
});

// ---------------------------------------------------------------- shared bottle textures used by containers.ts
export const BOTTLE_TEX = { L_WATER, L_2L };
export function waterBottle(mb: MB) {
  bottle(mb, { r: 0.033, h: 0.21, neckR: 0.013, neckH: 0.02, shoulder: 0.04, body: S_PBOTTLE, bodyColor: 0xd4ecf8, label: L_WATER, labelY: 0.06, labelH: 0.05, cap: 0x2a6ac8, capH: 0.016 });
}
