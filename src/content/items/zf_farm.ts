// Items stream — THE FARM AND THE YARD (round 25, src/build/farm.ts, src/game/economy): the grow room's five new
// crops and their seed, the pallid hens' eggs and down, the carpet grubs' silk, the farm tools (hoe, shears, feed
// sack, incubator, mite spray), the larder (pickles, moon cheese, salted eggs, potted meat), the herbal remedies
// (two tinctures and a salve), silk and down gear, and three hand-made weapons. Their models are the hand-detailed
// ones in src/items/detailModels4.ts (the world model, the close-up and the icon all come from there).
import { defItem, type ItemDef } from '../../items/item';
import { DETAIL4 } from '../../items/detailModels4';
import { lootTable } from '../../items/loot';

const D = (key: string) => (mb: Parameters<NonNullable<ItemDef['model']>>[0]) => DETAIL4[key]?.build?.(mb);
const I = (d: Omit<ItemDef, 'model'>) => defItem({ ...d, model: D(d.key) } as ItemDef);

// ---------------------------------------------------------------- crops
I({ key: 'bluecap', name: 'Bluecap', cat: 'food', weight: 0.06, value: 9, tags: ['mushroom', 'herb', 'organic', 'produce', 'medicinal'],
  desc: 'A blue mushroom from drowned carpet. Its gills glow cyan under the cap. Bitter and numbing raw; steeped, it is the base of every tincture the Institute stopped issuing.',
  food: { hunger: 4, calories: 40, unhappy: 4, poison: 0.05, fresh: 4, rot: 8, ingredient: 'veg' } });
I({ key: 'strip_cress', name: 'Strip Cress', cat: 'food', weight: 0.05, value: 5, tags: ['vegetable', 'produce', 'greens', 'feed'],
  desc: 'A square of felt with cress standing thick on it, grown in two days under a strip light. Peppery and crisp; hens and calves fight over it.',
  food: { hunger: 5, thirst: 2, calories: 25, unhappy: -2, fresh: 2, rot: 4, ingredient: 'veg' } });
I({ key: 'exit_pepper', name: 'Exit-Sign Pepper', cat: 'food', weight: 0.04, value: 7, tags: ['vegetable', 'produce', 'spice', 'hot'],
  desc: 'Three red chillies on a stalk, ripened under an exit sign. They glow a little in the dark. Hot enough to make your eyes run, and to keep mites off a crop.',
  food: { hunger: 2, thirst: -4, calories: 15, unhappy: 3, fresh: 6, rot: 12, ingredient: 'spice' } });
I({ key: 'lint_boll', name: 'Lint Boll', cat: 'material', weight: 0.03, value: 4, tags: ['fibre', 'tinder', 'organic', 'feed'], burn: 0.1,
  desc: 'A boll of grey duct lint from a Lint Cotton shrub, a thread of something blue caught in it. Spun, it is thread; woven, cloth; dry, it lights first time.' });
I({ key: 'hush_mint', name: 'Hush Mint', cat: 'food', weight: 0.03, value: 6, tags: ['herb', 'produce', 'medicinal', 'greens'],
  desc: 'A bunch of mint from under a vent grille, tied with thread. The leaves are cold on the tongue; the flowers hum. It quiets a racing heart.',
  food: { hunger: 1, calories: 5, stress: -6, unhappy: -3, fresh: 3, rot: 6, ingredient: 'veg' } });

// ---------------------------------------------------------------- seed
I({ key: 'spawn_bluecap', name: 'Bluecap Spawn', cat: 'seed', weight: 0.12, value: 7, seed: 'bluecap', uses: 2, tags: ['seed', 'spawn'],
  desc: 'A jar of grain gone white with bluecap mycelium, blue pins pushing at the glass. Break it into a fungus bed and keep the light off it.' });
I({ key: 'seeds_cress', name: 'Cress Seed', cat: 'seed', weight: 0.01, value: 2, seed: 'strip_cress', uses: 4, tags: ['seed'],
  desc: 'A twist of cress seed. Felt, water and a fluorescent tube; two days.' });
I({ key: 'seeds_pepper', name: 'Pepper Seed', cat: 'seed', weight: 0.02, value: 4, seed: 'exit_pepper', uses: 3, tags: ['seed'],
  desc: 'A dried exit-sign pepper split open over a twist of its own flat seed. It wants bright light, red if you can find it.' });
I({ key: 'seeds_cotton', name: 'Lint Cotton Seed', cat: 'seed', weight: 0.02, value: 3, seed: 'lint_cotton', uses: 3, tags: ['seed', 'feed'],
  desc: 'Black seed rolled out of a lint boll. Hens eat it; planted, it grows the boll back.' });
I({ key: 'seeds_mint', name: 'Mint Cuttings', cat: 'seed', weight: 0.02, value: 3, seed: 'hush_mint', uses: 3, tags: ['seed'],
  desc: 'Three hush mint cuttings in a fold of damp newspaper, the roots just starting. Any light, a lot of water.' });

// ---------------------------------------------------------------- the yard
I({ key: 'pallid_egg', name: 'Pallid Egg', cat: 'food', weight: 0.07, value: 8, tags: ['egg', 'specimen'],
  desc: 'A long, waxy egg from a pallid hen, warm as a hand, a web of pink veins under the shell. Fried, it is the best thing down here. Kept warm in an incubator, it hatches.',
  food: { hunger: 8, calories: 110, raw: true, cookable: true, cookMins: 5, poison: 0.06, fresh: 6, rot: 12, ingredient: 'egg', cookedName: 'Fried Pallid Egg' } });
I({ key: 'hen_down', name: 'Pallid Down', cat: 'material', weight: 0.02, value: 6, tags: ['down', 'wool', 'fibre', 'specimen'],
  desc: 'A double handful of the soft down from under a pallid hen\'s wings, tied with grub silk. Light, warm, nearly weightless: a liner\'s worth in four handfuls.' });
I({ key: 'grub_silk', name: 'Grub Silk', cat: 'material', weight: 0.03, value: 9, tags: ['silk', 'fibre', 'thread', 'specimen'],
  desc: 'A skein of pale silk wound off a carpet grub\'s sleeping cocoon. Stronger than cotton and clean: it makes a bandage that does not stick, a cord that does not stretch.' });

// ---------------------------------------------------------------- farm tools
I({ key: 'hoe', name: 'Garden Hoe', cat: 'tool', weight: 1.1, value: 14, durability: 120, tags: ['hoe', 'farming', 'dig'],
  weapon: { kind: 'spear', dmg: [3, 7], range: 1.6, speed: 0.9, endurance: 0.05, crit: 0.08, knock: 0.25, durability: 60, noise: 6, twoHanded: true },
  desc: 'A forged blade on an ash handle. Turn the soil of an empty planter with it before you sow: the next crop grows faster and gives more.' });
I({ key: 'shears', name: 'Shears', cat: 'tool', weight: 0.35, value: 12, durability: 140, tags: ['shears', 'sharp', 'scissors', 'farming'],
  weapon: { kind: 'blade', dmg: [2, 5], range: 0.8, speed: 1.6, endurance: 0.025, crit: 0.18, knock: 0, durability: 40, noise: 3 },
  desc: 'Long blades on a brass pivot. Cut blight out of a crop, shear down from a hen, take a harvest cleanly (one more off every plant).' });
I({ key: 'feed_sack', name: 'Feed Sack', cat: 'material', weight: 2, value: 14, tags: ['feed', 'organic'], grid: [2, 2],
  desc: 'A fat burlap sack of feed mash, tied at the neck. One sack fills a pen\'s trough to the brim.' });
I({ key: 'incubator', name: 'Egg Incubator', cat: 'tool', weight: 2.4, value: 30, tags: ['incubator', 'farming'], grid: [2, 2],
  desc: 'A plank box under a window lid, a warm bulb, a dial at thirty-eight degrees and a nest of straw. Set it in a pen with laying hens: their eggs hatch into chicks.' });
I({ key: 'mite_spray', name: 'Mite Spray', cat: 'tool', weight: 0.4, value: 9, uses: 6, tags: ['spray', 'pesticide', 'farming'],
  desc: 'A pump bottle of exit-sign pepper steeped in water. Spray a crop and the lint mites drop off it; spray it early and they never come.' });

// ---------------------------------------------------------------- the larder (preserved food keeps for weeks)
I({ key: 'empty_jar', name: 'Mason Jar', cat: 'container', weight: 0.35, value: 4, fluidCap: 0.6, tags: ['jar', 'fluidcontainer', 'glass'],
  desc: 'A clean glass jar with a two-piece screw lid. Everything worth keeping goes in one.' });
I({ key: 'pickle_jar', name: 'Jar of Pickles', cat: 'food', weight: 0.6, value: 18, tags: ['preserved', 'jar', 'vegetable'],
  desc: 'Exit-sign peppers and cress packed in brine under a screw lid. Sharp, hot and still crisp a month later.',
  food: { hunger: 14, thirst: -4, calories: 160, unhappy: -6, fresh: 30, rot: 60, ingredient: 'veg', leaves: 'empty_jar' } });
I({ key: 'moon_cheese', name: 'Moon Cheese', cat: 'food', weight: 0.4, value: 26, tags: ['preserved', 'dairy', 'weird'],
  desc: 'A small wheel of cheese made from moon milk, with a lilac rind. The paste glows faintly. It keeps; it tastes of cold almonds and old rooms.',
  food: { hunger: 22, calories: 520, unhappy: -12, stress: -4, fresh: 24, rot: 50, ingredient: 'dairy' } });
I({ key: 'salted_eggs', name: 'Salted Eggs', cat: 'food', weight: 0.5, value: 20, tags: ['preserved', 'jar', 'egg'],
  desc: 'Four pallid eggs packed in salt in a jar. The yolks go firm and gold. Eat them with something plain.',
  food: { hunger: 24, thirst: -8, calories: 380, unhappy: -4, fresh: 40, rot: 80, ingredient: 'egg', leaves: 'empty_jar' } });
I({ key: 'potted_meat', name: 'Potted Meat', cat: 'food', weight: 0.35, value: 22, tags: ['preserved', 'meat'],
  desc: 'Cooked meat pressed into a tin under a cap of pigeon tallow. Nothing gets in. It keeps a month.',
  food: { hunger: 28, calories: 640, unhappy: -6, fresh: 28, rot: 56, ingredient: 'meat' } });

// ---------------------------------------------------------------- remedies
I({ key: 'tincture_bluecap', name: 'Bluecap Tincture', cat: 'medical', weight: 0.08, value: 22, uses: 5, tags: ['tincture', 'disinfectant', 'painkiller'],
  medical: { type: 'disinfect', power: 1.3 },
  desc: 'Bluecap steeped in spirit in an amber dropper. Ten drops on a wound: it numbs, it cleans, and the cut goes cold and quiet.' });
I({ key: 'tincture_hush', name: 'Hush Tincture', cat: 'medical', weight: 0.08, value: 18, uses: 4, tags: ['tincture', 'sedative'],
  medical: { type: 'sedative', power: 0.8 },
  desc: 'Hush mint steeped in almond water. A few drops under the tongue and the heart slows; the panic goes somewhere else for a while.' });
I({ key: 'herb_salve', name: 'Mint Salve', cat: 'medical', weight: 0.06, value: 14, uses: 4, tags: ['salve', 'poultice'],
  medical: { type: 'disinfect', power: 0.8 },
  desc: 'A flat tin of hush mint worked into pigeon tallow. Cool on a burn, cold on a bruise, clean on a graze.' });

// ---------------------------------------------------------------- silk and down
I({ key: 'silk_bandage', name: 'Silk Bandage', cat: 'medical', weight: 0.03, value: 16, tags: ['bandage'],
  medical: { type: 'bandage', power: 4.5, sterile: true },
  desc: 'A roll of woven grub silk. It does not stick to a wound and it does not fray, and it stops bleeding better than cotton.' });
defItem({
  key: 'down_liner', name: 'Down Liner', cat: 'clothing', weight: 0.25, value: 34, tags: ['clothing', 'patchable', 'down'],
  desc: 'A quilted liner of pallid down sewn into grub silk. Worn under a coat it is the warmest thing in the building, and it weighs nothing.',
  clothing: { slot: 'sweater', covers: ['torso_u', 'torso_l', 'uarm_l', 'uarm_r'], insulation: 0.62, wind: 0.3, bite: 1, scratch: 6, water: 0, look: { part: 'torso', tex: 'c_sweater', color: 0xe8e0d0, sleeve: 'short' } },
  model: D('down_liner'),
} as ItemDef);

// ---------------------------------------------------------------- weapons
I({ key: 'spiked_club', name: 'Spiked Club', cat: 'weapon', weight: 1.4, value: 16, tags: ['blunt', 'club', 'nails'],
  weapon: { kind: 'blunt', dmg: [8, 15], range: 1.15, speed: 0.95, endurance: 0.06, crit: 0.2, knock: 0.35, durability: 70, noise: 8 },
  desc: 'A table leg with eighteen nails driven through the head and a cloth grip. It catches, it tears, and it is very hard to ignore.' });
I({ key: 'sling', name: 'Silk Sling', cat: 'weapon', weight: 0.08, value: 12, tags: ['sling', 'silk'],
  weapon: { kind: 'firearm', dmg: [4, 8], range: 12, speed: 0.8, endurance: 0.04, crit: 0.18, knock: 0.2, durability: 90, noise: 2, ammo: 'stone', mag: 1, reload: 1.4, spread: 0.12 },
  desc: 'Two plaited cords of grub silk and a leather pouch. Whirl it and let go of one cord: a stone, silently, at forty metres a second.' });
I({ key: 'bone_knife', name: 'Bone Knife', cat: 'weapon', weight: 0.15, value: 10, tags: ['sharp', 'knife', 'blade', 'bone'],
  weapon: { kind: 'blade', dmg: [4, 8], range: 0.85, speed: 1.7, endurance: 0.025, crit: 0.25, knock: 0, durability: 45, noise: 3 },
  desc: 'A split long bone ground to an edge on a kerb, the knuckle for a pommel, a grip of leather strip. Quiet, quick, and it holds an edge.' });

// ---------------------------------------------------------------- where they turn up (seeded once the tables exist)
function seed(table: string, entries: [string, number][]) {
  const t = lootTable(table); if (!t) return;
  for (const e of entries) if (!t.entries.some((x) => x[0] === e[0])) t.entries.push(e);
}
export function seedFarmLoot() {
  seed('kitchen_cabinet', [['empty_jar', 1.5], ['salt', 0.5]]);
  seed('cafeteria', [['empty_jar', 0.8]]);
  seed('garage_shelf', [['empty_jar', 0.8], ['shears', 0.3], ['hoe', 0.2]]);
  seed('store_hardware', [['shears', 0.6], ['hoe', 0.4]]);
  seed('store_produce', [['seeds_cress', 1], ['seeds_pepper', 0.6], ['exit_pepper', 0.6]]);
  seed('camp_supplies', [['seeds_cress', 0.8], ['seeds_mint', 0.6], ['seeds_cotton', 0.5], ['empty_jar', 0.6]]);
  seed('survivor_stash', [['spawn_bluecap', 0.5], ['seeds_pepper', 0.5], ['mite_spray', 0.3]]);
  seed('lab_cabinet', [['empty_jar', 1], ['spawn_bluecap', 0.3]]);
  seed('janitor', [['empty_jar', 0.6], ['mite_spray', 0.3]]);
}
queueMicrotask(seedFarmLoot);
