// Items stream — RECIPES.
//
// Conventions the crafting system should implement:
//  • `keep: true`  — tool / container required but not consumed (may lose condition).
//  • `uses`        — fraction of a drainable's ItemDef.uses consumed (nails 2/50 = 0.04).
//  • `fluid`       — input: the matched container must hold ≥ L litres of that fluid;
//                    those litres are consumed (boiled off / mixed in).
//  • In-place output — an output whose `item` string equals the `item` string of a
//                    `keep: true` input does NOT create a new item; it modifies that kept
//                    item: with `fluid` → convert ALL of the container's contents of the
//                    input fluid type into the output fluid (amount kept); without fluid
//                    → restore the item (condition → 1 and, for drainables, uses → full).
//  • `needs`: 'fire' = any lit heat source in reach (campfire, stove/oven, grill,
//    fireplace); 'water' = a water source in reach (sink, tap, bath, rain collector)
//    or carried clean water; 'surface' = table/counter; 'workbench' = placed workbench
//    (kit_workbench); 'power' = powered outlet nearby.
//  • Cooking recipes that need fire output finished (cooked) dishes.
//  • Drainable outputs (glow paint, alcohol wipes…) spawn full.
//  • learned:true recipes are taught by literature (see literature.recipes).
import { defRecipe, Recipe } from '../../items/recipes';
import { CLOTHING_RIPS } from '../items/clothing';

const R = (r: Recipe) => defRecipe(r);

// =====================================================================================
// TAILORING — ripping cloth into rags / strips
// =====================================================================================
for (const c of CLOTHING_RIPS) {
  R({
    key: 'rip_' + c.key, name: `Rip ${c.name}`, category: 'tailoring', time: 3 + c.count,
    inputs: c.cutter ? [{ item: c.key }, { item: '#sharp', keep: true }] : [{ item: c.key }],
    outputs: [{ item: c.rip, count: c.count }], anim: 'craft', xp: ['tailoring', 1],
    desc: c.cutter ? 'Tough material: needs a blade or scissors.' : undefined,
  });
}
R({ key: 'rip_sheet', name: 'Rip Bed Sheet', category: 'tailoring', time: 6, inputs: [{ item: 'bedsheet' }], outputs: [{ item: 'rag', count: 6 }], anim: 'craft', xp: ['tailoring', 1] });
R({ key: 'rip_towel', name: 'Rip Towel', category: 'tailoring', time: 5, inputs: [{ item: 'towel_item' }], outputs: [{ item: 'rag', count: 4 }], anim: 'craft', xp: ['tailoring', 1] });
R({ key: 'rip_blanket', name: 'Rip Blanket', category: 'tailoring', time: 8, inputs: [{ item: 'blanket' }], outputs: [{ item: 'rag', count: 8 }], anim: 'craft', xp: ['tailoring', 1] });
R({ key: 'rip_cloth', name: 'Cut Fabric into Rags', category: 'tailoring', time: 4, inputs: [{ item: 'cloth' }], outputs: [{ item: 'rag', count: 4 }], anim: 'craft' });
R({ key: 'make_cloth', name: 'Sew Rags into Fabric', category: 'tailoring', time: 20, inputs: [{ item: 'rag', count: 4 }, { item: '#needle', keep: true }, { item: '#thread', uses: 0.2 }], outputs: [{ item: 'cloth' }], anim: 'stitch', skill: ['tailoring', 1], xp: ['tailoring', 6] });
R({ key: 'patch_clothing', name: 'Patch Clothing', category: 'tailoring', time: 15, inputs: [{ item: '#patchable', keep: true }, { item: 'rag' }, { item: '#needle', keep: true }, { item: '#thread', uses: 0.1 }], outputs: [{ item: '#patchable' }], anim: 'stitch', xp: ['tailoring', 4], desc: 'Repairs a garment in place (restores its condition).' });
R({ key: 'sew_tote', name: 'Sew Tote Bag', category: 'tailoring', time: 30, inputs: [{ item: 'cloth', count: 2 }, { item: '#needle', keep: true }, { item: '#thread', uses: 0.3 }], outputs: [{ item: 'tote_bag' }], anim: 'stitch', skill: ['tailoring', 1], xp: ['tailoring', 10] });
R({ key: 'sew_backpack', name: 'Sew Backpack', category: 'tailoring', time: 60, learned: true, inputs: [{ item: 'cloth', count: 3 }, { item: 'leather_strips', count: 2 }, { item: 'rope' }, { item: '#needle', keep: true }, { item: '#thread', uses: 0.5 }], outputs: [{ item: 'backpack_crafted' }], anim: 'stitch', skill: ['tailoring', 3], xp: ['tailoring', 20] });
R({ key: 'make_sleeping_bag', name: 'Sew Sleeping Bag', category: 'tailoring', time: 50, learned: true, inputs: [{ item: 'blanket', count: 2 }, { item: 'cloth' }, { item: '#needle', keep: true }, { item: '#thread', uses: 0.4 }], outputs: [{ item: 'sleeping_bag_item' }], anim: 'stitch', skill: ['tailoring', 2], xp: ['tailoring', 15] });
R({ key: 'braid_rope', name: 'Braid Rope from Rags', category: 'survival', time: 20, inputs: [{ item: 'rag', count: 5 }], outputs: [{ item: 'rope' }], anim: 'craft' });
R({ key: 'knot_sheets', name: 'Knot Sheets into Rope', category: 'survival', time: 10, inputs: [{ item: 'bedsheet', count: 2 }], outputs: [{ item: 'rope' }], anim: 'craft' });
R({ key: 'cut_jump_rope', name: 'Salvage Jump Rope', category: 'survival', time: 4, inputs: [{ item: 'jump_rope' }, { item: '#sharp', keep: true }], outputs: [{ item: 'rope' }], anim: 'craft' });

// =====================================================================================
// MEDICAL
// =====================================================================================
R({ key: 'wash_rag', name: 'Wash Dirty Rag', category: 'medical', time: 5, needs: ['water'], inputs: [{ item: 'rag_dirty' }], outputs: [{ item: 'rag' }], anim: 'craft' });
R({ key: 'wash_bandage', name: 'Wash Dirty Bandage', category: 'medical', time: 5, needs: ['water'], inputs: [{ item: 'bandage_dirty' }], outputs: [{ item: 'rag' }], anim: 'craft', desc: 'Washed dressings come out as plain rags; sterilise them again to make bandages.' });
R({ key: 'boil_bandage', name: 'Boil Rags into Bandages', category: 'medical', time: 20, needs: ['fire'], inputs: [{ item: 'rag', count: 2 }, { item: '#boiler', keep: true, fluid: ['water', 0.5] }], outputs: [{ item: 'bandage', count: 2 }], anim: 'cook', xp: ['firstaid', 3] });
R({ key: 'disinfect_bandage', name: 'Sterilise Rags (Disinfectant)', category: 'medical', time: 6, inputs: [{ item: 'rag', count: 2 }, { item: '#disinfectant', uses: 0.1 }], outputs: [{ item: 'bandage', count: 2 }], anim: 'craft', xp: ['firstaid', 3] });
R({ key: 'alcohol_bandage', name: 'Sterilise Rags (Liquor)', category: 'medical', time: 6, inputs: [{ item: 'rag', count: 2 }, { item: 'whiskey', keep: true, fluid: ['alcohol', 0.1] }], outputs: [{ item: 'bandage', count: 2 }], anim: 'craft', xp: ['firstaid', 2] });
R({ key: 'make_suture', name: 'Make Suture Kit', category: 'medical', time: 15, learned: true, inputs: [{ item: 'needle' }, { item: '#thread', uses: 0.2 }, { item: '#disinfectant', uses: 0.1 }], outputs: [{ item: 'suture_needle' }], anim: 'stitch', skill: ['firstaid', 2], xp: ['firstaid', 6] });
R({ key: 'make_splint', name: 'Make Splint', category: 'medical', time: 10, inputs: [{ item: 'plank' }, { item: 'rag', count: 2 }], outputs: [{ item: 'splint' }], anim: 'craft', xp: ['firstaid', 3] });
R({ key: 'make_splint_twigs', name: 'Make Twig Splint', category: 'medical', time: 10, inputs: [{ item: 'twigs', count: 2 }, { item: 'rag', count: 2 }], outputs: [{ item: 'splint' }], anim: 'craft', xp: ['firstaid', 2] });
R({ key: 'make_alcohol_wipes', name: 'Make Alcohol Swabs', category: 'medical', time: 8, learned: true, inputs: [{ item: 'cotton_balls' }, { item: 'whiskey', keep: true, fluid: ['alcohol', 0.15] }], outputs: [{ item: 'alcohol_wipes' }], anim: 'craft', skill: ['firstaid', 1], xp: ['firstaid', 4] });
R({ key: 'make_poultice', name: 'Make Herbal Poultice', category: 'medical', time: 12, learned: true, inputs: [{ item: '#herb', count: 3 }, { item: 'rag' }, { item: 'stone', keep: true }], outputs: [{ item: 'poultice' }], anim: 'mix', skill: ['foraging', 1], xp: ['firstaid', 4] });

// =====================================================================================
// COOKING — opening cans
// =====================================================================================
const CANS: [string, string, string][] = [
  ['canned_beans', 'beans_open', 'Beans'], ['canned_soup', 'soup_open', 'Soup'], ['canned_peaches', 'peaches_open', 'Peaches'],
  ['canned_tuna', 'tuna_open', 'Tuna'], ['canned_corn', 'corn_open', 'Corn'], ['canned_spam', 'spam_open', 'Luncheon Meat'],
  ['canned_dogfood', 'dogfood_open', 'Dog Food'],
];
for (const [sealed, open, label] of CANS) {
  R({ key: 'open_' + sealed, name: `Open ${label} (Can Opener)`, category: 'cooking', time: 3, inputs: [{ item: sealed }, { item: '#canopener', keep: true }], outputs: [{ item: open }], anim: 'craft' });
  R({ key: 'pry_' + sealed, name: `Pry Open ${label} (Knife)`, category: 'cooking', time: 8, inputs: [{ item: sealed }, { item: '#knife', keep: true }], outputs: [{ item: open }], anim: 'craft', desc: 'Slow, and it dulls the blade (extra condition loss); small chance to cut yourself.' });
}

// =====================================================================================
// COOKING — dishes, water, drinks
// =====================================================================================
R({ key: 'make_stew', name: 'Cook Stew', category: 'cooking', time: 40, needs: ['fire'], inputs: [{ item: 'pot', fluid: ['water', 1.5] }, { item: '#stewmeat' }, { item: '#stewveg', count: 2 }], outputs: [{ item: 'stew' }], anim: 'cook', xp: ['cooking', 10], desc: 'Pot of water + meat + two vegetables. The pot comes back when the stew is eaten.' });
R({ key: 'make_soup_pot', name: 'Cook Vegetable Soup', category: 'cooking', time: 35, needs: ['fire'], inputs: [{ item: 'pot', fluid: ['water', 1.5] }, { item: '#stewveg', count: 3 }], outputs: [{ item: 'soup_pot' }], anim: 'cook', xp: ['cooking', 8] });
R({ key: 'cook_rice', name: 'Cook Rice', category: 'cooking', time: 30, needs: ['fire'], inputs: [{ item: 'pot', fluid: ['water', 1] }, { item: 'rice' }], outputs: [{ item: 'pot_rice' }], anim: 'cook', xp: ['cooking', 5] });
R({ key: 'cook_pasta', name: 'Cook Pasta', category: 'cooking', time: 25, needs: ['fire'], inputs: [{ item: 'pot', fluid: ['water', 1.5] }, { item: 'pasta' }], outputs: [{ item: 'pot_pasta' }], anim: 'cook', xp: ['cooking', 5] });
R({ key: 'cook_noodles', name: 'Make Instant Noodles', category: 'cooking', time: 10, needs: ['fire'], inputs: [{ item: 'instant_noodles' }, { item: 'bowl' }, { item: '#boiler', keep: true, fluid: ['water', 0.4] }], outputs: [{ item: 'noodles_cooked' }], anim: 'cook', xp: ['cooking', 2] });
R({ key: 'boil_water', name: 'Boil Water', category: 'survival', time: 20, needs: ['fire'], inputs: [{ item: '#boiler', keep: true, fluid: ['tainted', 0.25] }], outputs: [{ item: '#boiler', fluid: ['water', 0.25] }], anim: 'cook', desc: 'Boils every drop of tainted water in the pot, kettle or can — safe to drink.' });
R({ key: 'purify_tablets', name: 'Purify Water (Tablet)', category: 'survival', time: 30, inputs: [{ item: 'chlorine_tablets', uses: 0.1 }, { item: '#fluidcontainer', keep: true, fluid: ['tainted', 0.25] }], outputs: [{ item: '#fluidcontainer', fluid: ['water', 0.25] }], anim: 'mix' });
R({ key: 'purify_bleach', name: 'Purify Water (Bleach)', category: 'survival', time: 30, learned: true, inputs: [{ item: 'bleach', keep: true, fluid: ['bleach', 0.01] }, { item: '#fluidcontainer', keep: true, fluid: ['tainted', 0.25] }], outputs: [{ item: '#fluidcontainer', fluid: ['water', 0.25] }], anim: 'mix', desc: 'Two drops per litre, wait half an hour.' });
R({ key: 'brew_coffee', name: 'Brew Coffee', category: 'cooking', time: 8, needs: ['fire'], inputs: [{ item: 'mug' }, { item: 'coffee_beans', uses: 0.1 }, { item: '#boiler', keep: true, fluid: ['water', 0.3] }], outputs: [{ item: 'coffee_brewed' }], anim: 'cook', xp: ['cooking', 1] });
R({ key: 'brew_tea', name: 'Brew Tea', category: 'cooking', time: 8, needs: ['fire'], inputs: [{ item: 'mug' }, { item: 'tea_bags', uses: 0.05 }, { item: '#boiler', keep: true, fluid: ['water', 0.3] }], outputs: [{ item: 'tea_brewed' }], anim: 'cook', xp: ['cooking', 1] });
R({ key: 'make_lucid_tea', name: 'Brew Dreamlily Tea', category: 'anomaly', time: 10, needs: ['fire'], learned: true, inputs: [{ item: 'mug' }, { item: 'dreamlily_bloom' }, { item: '#boiler', keep: true, fluid: ['water', 0.3] }], outputs: [{ item: 'lucid_tea' }], anim: 'cook', xp: ['cooking', 4] });
R({ key: 'make_almond_water', name: 'Mix Almond Water', category: 'cooking', time: 4, learned: true, inputs: [{ item: 'almond_extract', uses: 0.25 }, { item: '#fluidcontainer', keep: true, fluid: ['water', 0.5] }], outputs: [{ item: '#fluidcontainer', fluid: ['almond', 0.5] }], anim: 'mix', desc: 'Per the Meridian hydration protocol: one measure of extract per half litre of clean water.' });
R({ key: 'make_salad', name: 'Make Salad', category: 'cooking', time: 8, needs: ['surface'], inputs: [{ item: 'bowl' }, { item: 'lettuce' }, { item: '#saladveg' }, { item: '#knife', keep: true }], outputs: [{ item: 'salad' }], anim: 'craft', xp: ['cooking', 3] });
R({ key: 'slice_bread', name: 'Slice Bread', category: 'cooking', time: 4, inputs: [{ item: 'bread' }, { item: '#knife', keep: true }], outputs: [{ item: 'bread_slice', count: 6 }], anim: 'craft' });
R({ key: 'make_sandwich', name: 'Make Sandwich', category: 'cooking', time: 4, inputs: [{ item: 'bread_slice', count: 2 }, { item: '#sandwichfill' }], outputs: [{ item: 'sandwich' }], anim: 'craft', xp: ['cooking', 2] });
R({ key: 'make_pb_sandwich', name: 'Make Peanut Butter Sandwich', category: 'cooking', time: 4, inputs: [{ item: 'bread_slice', count: 2 }, { item: 'peanut_butter', uses: 0.1 }], outputs: [{ item: 'sandwich' }], anim: 'craft', xp: ['cooking', 2] });
R({ key: 'make_jerky', name: 'Smoke Jerky', category: 'cooking', time: 60, needs: ['fire'], learned: true, inputs: [{ item: '#rawmeat' }, { item: 'salt', uses: 0.1 }], outputs: [{ item: 'jerky', count: 3 }], anim: 'cook', skill: ['cooking', 2], xp: ['cooking', 12], desc: 'Salt thin strips and dry them slowly over a low, smoky fire. Keeps for months.' });
R({ key: 'make_ration_bar', name: 'Press Ration Bars', category: 'cooking', time: 12, needs: ['surface'], learned: true, inputs: [{ item: 'granola_bar', count: 2 }, { item: 'peanut_butter', uses: 0.2 }, { item: 'sugar', uses: 0.1 }], outputs: [{ item: 'ration_bar', count: 2 }], anim: 'mix', skill: ['cooking', 1], xp: ['cooking', 6] });

// =====================================================================================
// CARPENTRY & BUILDING KITS
// =====================================================================================
R({ key: 'make_spear', name: 'Carve Wooden Spear', category: 'weapons', time: 10, inputs: [{ item: 'plank' }, { item: '#knife', keep: true }], outputs: [{ item: 'spear_wood' }], anim: 'craft', skill: ['carpentry', 1], xp: ['carpentry', 10] });
R({ key: 'make_bat_nailed', name: 'Nail a Bat', category: 'weapons', time: 12, inputs: [{ item: 'bat_baseball' }, { item: 'nails', uses: 0.1 }, { item: '#hammer', keep: true }], outputs: [{ item: 'bat_nailed' }], keepCondFrom: 'bat_baseball', anim: 'hammer', xp: ['carpentry', 5] });
R({ key: 'make_nailed_plank', name: 'Make Nailed Plank', category: 'weapons', time: 10, inputs: [{ item: 'plank' }, { item: 'nails', uses: 0.1 }, { item: '#hammer', keep: true }], outputs: [{ item: 'nailed_plank' }], anim: 'hammer', xp: ['carpentry', 5] });
R({ key: 'saw_firewood', name: 'Saw Plank into Firewood', category: 'carpentry', time: 8, inputs: [{ item: 'plank' }, { item: '#saw', keep: true }], outputs: [{ item: 'firewood', count: 2 }], anim: 'saw', xp: ['carpentry', 2] });
R({ key: 'split_kindling', name: 'Split Kindling', category: 'survival', time: 6, inputs: [{ item: 'firewood' }, { item: '#axe', keep: true }], outputs: [{ item: 'twigs', count: 3 }], anim: 'hammer' });
R({ key: 'make_kit_crate', name: 'Build Crate Kit', category: 'carpentry', time: 30, inputs: [{ item: 'plank', count: 4 }, { item: 'nails', uses: 0.16 }, { item: '#hammer', keep: true }, { item: '#saw', keep: true }], outputs: [{ item: 'kit_crate' }], anim: 'hammer', skill: ['carpentry', 2], xp: ['carpentry', 15] });
R({ key: 'make_kit_table', name: 'Build Table Kit', category: 'carpentry', time: 35, learned: true, inputs: [{ item: 'plank', count: 5 }, { item: 'nails', uses: 0.16 }, { item: '#hammer', keep: true }, { item: '#saw', keep: true }], outputs: [{ item: 'kit_table' }], anim: 'hammer', skill: ['carpentry', 2], xp: ['carpentry', 15] });
R({ key: 'make_kit_chair', name: 'Build Chair Kit', category: 'carpentry', time: 25, inputs: [{ item: 'plank', count: 3 }, { item: 'nails', uses: 0.12 }, { item: '#hammer', keep: true }, { item: '#saw', keep: true }], outputs: [{ item: 'kit_chair' }], anim: 'hammer', skill: ['carpentry', 1], xp: ['carpentry', 10] });
R({ key: 'make_kit_bed', name: 'Build Bed Frame Kit', category: 'carpentry', time: 50, learned: true, inputs: [{ item: 'plank', count: 6 }, { item: 'nails', uses: 0.2 }, { item: 'bedsheet', count: 2 }, { item: '#hammer', keep: true }, { item: '#saw', keep: true }], outputs: [{ item: 'kit_bed' }], anim: 'hammer', skill: ['carpentry', 3], xp: ['carpentry', 25] });
R({ key: 'make_kit_planter', name: 'Build Planter Box Kit', category: 'farming', time: 30, inputs: [{ item: 'plank', count: 4 }, { item: 'nails', uses: 0.12 }, { item: '#hammer', keep: true }, { item: '#saw', keep: true }], outputs: [{ item: 'kit_planter' }], anim: 'hammer', skill: ['carpentry', 1], xp: ['carpentry', 10] });
R({ key: 'make_workbench', name: 'Build Workbench Kit', category: 'carpentry', time: 50, inputs: [{ item: 'plank', count: 6 }, { item: 'nails', uses: 0.24 }, { item: '#hammer', keep: true }, { item: '#saw', keep: true }], outputs: [{ item: 'kit_workbench' }], anim: 'hammer', skill: ['carpentry', 2], xp: ['carpentry', 20] });
R({ key: 'make_rain_collector', name: 'Build Rain Collector Kit', category: 'carpentry', time: 40, learned: true, inputs: [{ item: 'tarp' }, { item: 'plank', count: 2 }, { item: 'nails', uses: 0.08 }, { item: 'bucket' }, { item: '#hammer', keep: true }], outputs: [{ item: 'rain_collector_kit' }], anim: 'hammer', skill: ['carpentry', 2], xp: ['carpentry', 15] });

// =====================================================================================
// SURVIVAL — fire, light, traps
// =====================================================================================
R({ key: 'make_campfire_kit', name: 'Make Campfire Kit', category: 'survival', time: 10, inputs: [{ item: 'stone', count: 6 }, { item: 'firewood', count: 2 }], outputs: [{ item: 'campfire_kit' }], anim: 'craft', xp: ['foraging', 2] });
R({ key: 'make_campfire_kit_twigs', name: 'Make Campfire Kit (Kindling)', category: 'survival', time: 10, inputs: [{ item: 'stone', count: 6 }, { item: 'twigs', count: 4 }], outputs: [{ item: 'campfire_kit' }], anim: 'craft', xp: ['foraging', 2] });
R({ key: 'make_torch', name: 'Make Torch (Oil)', category: 'survival', time: 6, inputs: [{ item: 'twigs' }, { item: 'rag' }, { item: 'cooking_oil', uses: 0.1 }], outputs: [{ item: 'torch' }], anim: 'craft' });
R({ key: 'make_torch_gas', name: 'Make Torch (Gasoline)', category: 'survival', time: 6, inputs: [{ item: 'twigs' }, { item: 'rag' }, { item: '#fluidcontainer', keep: true, fluid: ['gasoline', 0.1] }], outputs: [{ item: 'torch' }], anim: 'craft' });
R({ key: 'make_trap_box', name: 'Build Box Trap', category: 'trapping', time: 25, learned: true, inputs: [{ item: 'plank', count: 3 }, { item: 'nails', uses: 0.1 }, { item: '#hammer', keep: true }], outputs: [{ item: 'trap_box_item' }], anim: 'hammer', skill: ['trapping', 1], xp: ['trapping', 10] });
R({ key: 'make_snare', name: 'Make Rope Snares', category: 'trapping', time: 10, inputs: [{ item: 'rope' }, { item: 'twigs' }], outputs: [{ item: 'trap_snare_item', count: 3 }], anim: 'craft', xp: ['trapping', 6] });
R({ key: 'make_snare_wire', name: 'Make Wire Snares', category: 'trapping', time: 10, learned: true, inputs: [{ item: 'wire' }, { item: 'twigs' }, { item: '#pliers', keep: true }], outputs: [{ item: 'trap_snare_item', count: 4 }], anim: 'craft', skill: ['trapping', 1], xp: ['trapping', 8] });
R({ key: 'make_bait', name: 'Make Bait', category: 'trapping', time: 3, inputs: [{ item: 'food_scraps' }], outputs: [{ item: 'bait', count: 3 }], anim: 'mix', xp: ['trapping', 1] });
R({ key: 'carve_bone_needle', name: 'Carve Bone Needle', category: 'survival', time: 20, inputs: [{ item: 'bone' }, { item: '#knife', keep: true }], outputs: [{ item: 'needle' }], anim: 'craft', skill: ['tailoring', 1], xp: ['tailoring', 5] });

// =====================================================================================
// WEAPONS
// =====================================================================================
R({ key: 'make_spear_knife', name: 'Lash Knife to Spear', category: 'weapons', time: 10, inputs: [{ item: 'spear_wood' }, { item: 'knife_kitchen' }, { item: '#tape', uses: 0.2 }], outputs: [{ item: 'spear_knife' }], anim: 'craft', xp: ['carpentry', 4] });
R({ key: 'make_pipe_club', name: 'Tape a Pipe Grip', category: 'weapons', time: 5, inputs: [{ item: 'pipe' }, { item: '#tape', uses: 0.1 }], outputs: [{ item: 'pipe_lead' }], anim: 'craft' });
R({ key: 'make_shiv', name: 'Make Glass Shiv', category: 'weapons', time: 4, inputs: [{ item: 'glass_shard' }, { item: 'rag' }], outputs: [{ item: 'shiv' }], anim: 'craft' });
R({ key: 'make_molotov', name: 'Make Molotov', category: 'weapons', time: 6, inputs: [{ item: 'empty_bottle' }, { item: 'rag' }, { item: '#fluidcontainer', keep: true, fluid: ['gasoline', 0.4] }], outputs: [{ item: 'molotov' }], anim: 'mix' });
R({ key: 'make_slingshot', name: 'Make Slingshot', category: 'weapons', time: 12, learned: true, inputs: [{ item: 'twigs' }, { item: 'gloves_rubber' }, { item: 'leather_strips' }, { item: '#sharp', keep: true }], outputs: [{ item: 'slingshot' }], anim: 'craft', skill: ['foraging', 1] });
for (const [blade, label] of [['knife_kitchen', 'Kitchen Knife'], ['knife_hunting', 'Hunting Knife'], ['pocket_knife', 'Pocket Knife'], ['machete', 'Machete'], ['axe', 'Axe'], ['fire_axe', 'Fire Axe'], ['spear_knife', 'Knife Spear']] as [string, string][]) {
  R({ key: 'sharpen_' + blade, name: `Sharpen ${label}`, category: 'weapons', time: 10, inputs: [{ item: blade }, { item: '#whetstone', keep: true }], outputs: [{ item: blade }], keepCondFrom: blade, anim: 'craft', desc: 'Restores the edge (sharpness); durability is unchanged.' });
}

// =====================================================================================
// ELECTRICAL
// =====================================================================================
R({ key: 'make_noisemaker', name: 'Rig Noisemaker', category: 'electrical', time: 20, learned: true, inputs: [{ item: 'alarm_clock' }, { item: 'electronics_scrap' }, { item: '#screwdriver', keep: true }], outputs: [{ item: 'noisemaker' }], anim: 'craft', skill: ['electrical', 1], xp: ['electrical', 10] });
R({ key: 'make_lantern', name: 'Build Lantern', category: 'electrical', time: 30, learned: true, inputs: [{ item: 'lightbulb' }, { item: 'battery' }, { item: 'wire' }, { item: 'scrap_metal' }, { item: '#screwdriver', keep: true }], outputs: [{ item: 'lantern' }], anim: 'craft', skill: ['electrical', 2], xp: ['electrical', 15] });
R({ key: 'jury_rig_fuse', name: 'Jury-Rig Fuse', category: 'electrical', time: 15, learned: true, inputs: [{ item: 'electronics_scrap', count: 2 }, { item: '#pliers', keep: true }], outputs: [{ item: 'fuse' }], anim: 'craft', skill: ['electrical', 2], xp: ['electrical', 8] });
R({ key: 'repair_flashlight', name: 'Repair Flashlight', category: 'electrical', time: 15, inputs: [{ item: 'flashlight', keep: true }, { item: 'electronics_scrap' }, { item: '#screwdriver', keep: true }], outputs: [{ item: 'flashlight' }], anim: 'craft', skill: ['electrical', 1], xp: ['electrical', 5] });
R({ key: 'repair_radio', name: 'Repair Radio', category: 'electrical', time: 25, inputs: [{ item: 'radio_portable', keep: true }, { item: 'electronics_scrap', count: 2 }, { item: '#screwdriver', keep: true }], outputs: [{ item: 'radio_portable' }], anim: 'craft', skill: ['electrical', 2], xp: ['electrical', 8] });
R({ key: 'repair_walkie', name: 'Repair Walkie-Talkie', category: 'electrical', time: 30, needs: ['power'], inputs: [{ item: 'walkie_talkie', keep: true }, { item: 'electronics_scrap' }, { item: 'wire' }, { item: '#solder', keep: true }], outputs: [{ item: 'walkie_talkie' }], anim: 'craft', skill: ['electrical', 3], xp: ['electrical', 10] });
R({ key: 'repair_nail_gun', name: 'Repair Nail Gun', category: 'electrical', time: 30, learned: true, needs: ['workbench'], inputs: [{ item: 'nail_gun', keep: true }, { item: 'scrap_metal' }, { item: 'spring' }, { item: '#screwdriver', keep: true }], outputs: [{ item: 'nail_gun' }], anim: 'craft', skill: ['mechanics', 2], xp: ['mechanics', 10] });
R({ key: 'charge_battery', name: 'Recharge Battery', category: 'electrical', time: 60, needs: ['power'], inputs: [{ item: '#battery', keep: true }], outputs: [{ item: '#battery' }], anim: 'craft', desc: 'Plug it in and wait. Restores full charge.' });
R({ key: 'recharge_powerbank', name: 'Recharge Power Bank', category: 'electrical', time: 60, needs: ['power'], inputs: [{ item: 'power_bank', keep: true }], outputs: [{ item: 'power_bank' }], anim: 'craft' });
R({ key: 'charge_battery_static', name: 'Charge Battery in Static', category: 'anomaly', time: 20, learned: true, inputs: [{ item: '#battery', keep: true }, { item: 'static_jar', keep: true, fluid: ['static', 0.1] }], outputs: [{ item: '#battery' }], anim: 'mix', xp: ['electrical', 5], desc: 'Drop the cell into the jar and wait for the crackling to stop.' });

// =====================================================================================
// MECHANICS
// =====================================================================================
R({ key: 'make_sheet_metal', name: 'Hammer Out Sheet Metal', category: 'misc', time: 30, learned: true, needs: ['workbench'], inputs: [{ item: 'scrap_metal', count: 4 }, { item: '#hammer', keep: true }], outputs: [{ item: 'sheet_metal' }], anim: 'hammer', skill: ['mechanics', 1], xp: ['mechanics', 10] });

// =====================================================================================
// FARMING
// =====================================================================================
R({ key: 'make_compost', name: 'Make Compost', category: 'farming', time: 10, learned: true, inputs: [{ item: 'food_scraps', count: 3 }, { item: 'garbage_bag' }], outputs: [{ item: 'compost' }], anim: 'mix', skill: ['farming', 1], xp: ['farming', 5] });
R({ key: 'cut_seed_potato', name: 'Cut Seed Potatoes', category: 'farming', time: 6, learned: true, inputs: [{ item: 'potato', count: 2 }, { item: '#knife', keep: true }], outputs: [{ item: 'seeds_potato' }], anim: 'craft', skill: ['farming', 1], xp: ['farming', 3] });
R({ key: 'seeds_from_tomato', name: 'Save Tomato Seeds', category: 'farming', time: 6, learned: true, inputs: [{ item: 'tomato', count: 2 }, { item: '#knife', keep: true }], outputs: [{ item: 'seeds_tomato' }], anim: 'craft', skill: ['farming', 1], xp: ['farming', 3] });
R({ key: 'seeds_from_strawberries', name: 'Save Strawberry Seeds', category: 'farming', time: 6, learned: true, inputs: [{ item: 'strawberries' }], outputs: [{ item: 'seeds_strawberry' }], anim: 'craft', skill: ['farming', 1], xp: ['farming', 3] });
R({ key: 'seeds_from_dreamfruit', name: 'Extract Dreamlily Seeds', category: 'anomaly', time: 10, inputs: [{ item: 'dream_fruit' }, { item: '#knife', keep: true }], outputs: [{ item: 'seeds_dreamlily' }], anim: 'craft', skill: ['farming', 3], xp: ['farming', 8], desc: 'The pits of a dream fruit are not pits. Plant them under a painted sky.' });

// =====================================================================================
// ANOMALY
// =====================================================================================
R({ key: 'make_glow_paint', name: 'Mix Glow Paint', category: 'anomaly', time: 6, inputs: [{ item: 'glow_dust' }, { item: 'empty_bottle' }, { item: '#fluidcontainer', keep: true, fluid: ['water', 0.25] }], outputs: [{ item: 'glow_paint' }], anim: 'mix', xp: ['foraging', 3], desc: 'Moth dust in water. Paint glowing arrows that last for days.' });
R({ key: 'make_glow_jar', name: 'Make Glow Jar', category: 'anomaly', time: 6, learned: true, inputs: [{ item: 'glow_dust', count: 2 }, { item: 'empty_bottle' }], outputs: [{ item: 'glow_jar' }], anim: 'mix', xp: ['foraging', 4] });
R({ key: 'make_checksum_pills', name: 'Compile Checksum Pills', category: 'anomaly', time: 30, learned: true, inputs: [{ item: 'memory_shard', count: 3 }, { item: 'vitamins' }], outputs: [{ item: 'checksum_pills' }], anim: 'mix', skill: ['firstaid', 2], xp: ['firstaid', 15], desc: 'Grind the shards into the capsules. Each one re-verifies a little of you.' });
R({ key: 'make_sim_patch', name: 'Build Sim Patch', category: 'anomaly', time: 45, learned: true, needs: ['power'], inputs: [{ item: 'static_jar' }, { item: 'needle' }, { item: 'data_drive' }], outputs: [{ item: 'sim_patch' }], anim: 'craft', skill: ['electrical', 4], xp: ['electrical', 30], desc: 'Flash the snapshot through the static and into something you can inject.' });

// =====================================================================================
// TRAPPING — butchering small game caught in traps
// =====================================================================================
R({ key: 'butcher_rabbit', name: 'Butcher Rabbit', category: 'trapping', time: 20, inputs: [{ item: 'rabbit_dead' }, { item: '#knife', keep: true }], outputs: [{ item: 'meat_raw' }, { item: 'bone' }], anim: 'craft', xp: ['trapping', 6] });
R({ key: 'butcher_squirrel', name: 'Butcher Squirrel', category: 'trapping', time: 12, inputs: [{ item: 'squirrel_dead' }, { item: '#knife', keep: true }], outputs: [{ item: 'small_meat_raw' }], anim: 'craft', xp: ['trapping', 4] });
R({ key: 'butcher_rat', name: 'Butcher Rat', category: 'trapping', time: 10, inputs: [{ item: 'rat_dead' }, { item: '#knife', keep: true }], outputs: [{ item: 'small_meat_raw' }], anim: 'craft', xp: ['trapping', 3] });
R({ key: 'butcher_bird', name: 'Pluck & Butcher Bird', category: 'trapping', time: 15, inputs: [{ item: 'bird_dead' }, { item: '#knife', keep: true }], outputs: [{ item: 'bird_meat_raw' }], anim: 'craft', xp: ['trapping', 4] });
