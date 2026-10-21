// Items — DISHES plated at a cooking station (src/cook/cooking.ts). They are
// ordinary food: eating them goes through the normal eating flow into the
// stomach. Plating stamps item.cooked (1 = done, 1.7 = burnt) and data.q
// (0..1 quality), which src/cook adds as a mood bonus when the dish is eaten.
import { defItem, type FoodProps } from '../../items/item';
import { tex, type MB } from './_kit';

const D_PLATE = tex('i_dish_plate', 12, 12, (pc) => {
  pc.each((x, y) => {
    const d = Math.hypot(x + 0.5 - 6, y + 0.5 - 6);
    pc.set(x, y, d > 5.6 ? 0x9a948a : d > 4.6 ? 0xf2eee4 : d > 4.2 ? 0xc8c2b4 : 0xe8e2d6);
  });
  pc.set(3, 3, 0xffffff); pc.set(4, 2, 0xffffff);
});
const D_BOWL = tex('i_dish_bowl', 12, 12, (pc) => {
  pc.each((x, y) => { const d = Math.hypot(x + 0.5 - 6, y + 0.5 - 6); pc.set(x, y, d > 5.4 ? 0x6a4a3a : 0x8a6a52); });
});

function plate(mb: MB) { mb.cylinder(0, 0, 0, 0.11, 0.012, 12, { sides: 'porcelain', top: D_PLATE, bottom: 'porcelain' }, { fit: { top: true } }); }
function bowl(mb: MB, soup: number) {
  mb.cylinder(0, 0, 0, 0.07, 0.05, 10, { sides: D_BOWL, top: D_BOWL, bottom: D_BOWL }, { rTop: 0.09 });
  mb.cylinder(0, 0.042, 0, 0.082, 0.004, 10, 'plastic_white', { color: soup });
}
const lumps = (mb: MB, cols: number[], r = 0.03) => { cols.forEach((c, i) => { const a = i * 2.4; mb.sphere(Math.cos(a) * 0.04, 0.025, Math.sin(a) * 0.04, r, 6, 4, 'plastic_white', { color: c, sy: 0.7 }); }); };

function dish(key: string, name: string, f: FoodProps, model: (mb: MB) => void, desc: string, value = 18) {
  defItem({ key, name, cat: 'food', weight: 0.5, food: { fresh: 2, rot: 4, ...f }, model, desc, value, tags: ['dish', 'meal'] });
}

dish('dish_seared', 'Seared Cutlet', { hunger: 30, calories: 900, unhappy: -8, ingredient: 'meat' }, (mb) => { plate(mb); mb.box(0, 0.012, 0, 0.12, 0.025, 0.08, 'i_meat_dark', { color: 0x9a5a3a }); }, 'Meat, fire, salt you found in a vending machine. A crust you can hear.');
dish('dish_hash', 'Skillet Hash', { hunger: 34, calories: 950, unhappy: -10, ingredient: 'meat' }, (mb) => { plate(mb); lumps(mb, [0x9a5a3a, 0xc89040, 0x8a6a2a, 0xd8a050, 0x7a4a2a]); }, 'Everything chopped small and fried together until it agrees.');
dish('dish_garden', 'Fluorescent Garden Fry', { hunger: 24, thirst: 4, calories: 420, unhappy: -9, ingredient: 'veg' }, (mb) => { plate(mb); lumps(mb, [0x6ab04a, 0xe8802a, 0xd83a2a, 0x9ad070]); }, 'Vegetables grown under strip lights, blistered in a hot pan. Tastes like a window.');
dish('dish_stew', 'Backrooms Stew', { hunger: 46, thirst: 10, calories: 1300, unhappy: -16, stress: -6, ingredient: 'meat' }, (mb) => bowl(mb, 0x8a4a22), 'Simmered until the carpet smell goes away. It never quite does.', 30);
dish('dish_skewer', 'Grill Skewers', { hunger: 30, calories: 1000, unhappy: -12, ingredient: 'meat' }, (mb) => { plate(mb); for (const z of [-0.03, 0.03]) { mb.box(0, 0.02, z, 0.2, 0.004, 0.004, 'wood_light'); lumps(mb, [0x8a4a2a, 0x9a5a3a, 0x7a3a22], 0.018); } }, 'Charred chunks on a coat-hanger wire. Eat it off the wire like an animal.', 24);
dish('dish_offal', 'Offal Fry-Up', { hunger: 30, calories: 820, unhappy: -2, ingredient: 'meat' }, (mb) => { plate(mb); lumps(mb, [0x5a1420, 0x7a2a2a, 0x6a4a2a, 0x4a1a1a]); }, 'Heart, liver, coil, onion. Iron and grease. You feel briefly invincible.', 22);
dish('dish_glow_broth', 'Glow Broth', { hunger: 18, thirst: 20, calories: 300, unhappy: -6, lucidity: 0.25, stress: -10, ingredient: 'weird' }, (mb) => { bowl(mb, 0x9aff8a); mb.cylinder(0, 0.046, 0, 0.05, 0.001, 8, 'plastic_white', { color: 0xd8ffd0, emissive: 1.5 }); }, 'It glows in the bowl and then, for a while, behind your eyes. Things are very clear.', 60);
dish('dish_wax_candy', 'Tallow Candy', { hunger: 10, calories: 700, unhappy: -14, boredom: -20, stress: 4, ingredient: 'sweet' }, (mb) => { plate(mb); for (let i = 0; i < 4; i++) mb.box(-0.045 + i * 0.03, 0.012, 0, 0.022, 0.02, 0.022, 'plastic_white', { color: 0xf2d890, emissive: 0.2 }); }, 'Wax-fat boiled with sugar until it sets glassy. Tastes like a candle that loves you.', 40);
dish('dish_gristle_stew', 'Long Ration', { hunger: 40, calories: 1100, unhappy: 18, stress: 14, ingredient: 'meat' }, (mb) => bowl(mb, 0x9a6a5a), 'You did what you had to. The stew does not judge you. Something in the walls does.', 12);
dish('dish_marrow', 'Roast Marrow Toast', { hunger: 22, calories: 800, unhappy: -14, ingredient: 'meat' }, (mb) => { plate(mb); mb.box(0, 0.012, 0, 0.1, 0.018, 0.07, 'wood_light', { color: 0xd8a860 }); mb.box(0, 0.03, 0, 0.12, 0.016, 0.022, 'plastic_white', { color: 0xf2e0c0 }); }, 'Sweet yellow marrow on scorched cracker. The best thing you have eaten in here.', 34);
dish('dish_burnt', 'Charcoal Surprise', { hunger: 10, calories: 300, unhappy: 14, poison: 0.1, ingredient: 'weird' }, (mb) => { plate(mb); lumps(mb, [0x1a1412, 0x2a2018, 0x141010]); }, 'It was food once. Now it is a lesson.', 2);
dish('dish_raw_mess', 'Lukewarm Mess', { hunger: 14, calories: 400, unhappy: 10, poison: 0.35, raw: true, ingredient: 'meat' }, (mb) => { plate(mb); lumps(mb, [0xb83030, 0xc84a4a, 0xa83a3a]); }, 'Plated too early. Grey outside, pink and cold inside.', 3);
