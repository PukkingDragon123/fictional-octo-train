// Recipes — THE FARM, THE YARD AND THE LARDER (round 25). What the grow room and the pens make possible: farm tools,
// feed and seed, fibre from lint and silk, preserved food, herbal remedies, gear from silk and down, three hand-made
// weapons. Plain ones are known from the start; the rest (learned: true) are DISCOVERED: scan the thing in `discover`
// (an ingredient or the inhabitant it comes from) or find it by growing, picking, milking, shearing or collecting it
// (src/craft/stores.ts discoverFrom: a find teaches sometimes, more often with the 'discover' trade stat). The research
// lattice's Recovered Schematics / Pattern Cutting / Field Kit nodes teach them too.
import { defRecipe, type Recipe } from '../../items/recipes';

const R = (r: Recipe) => defRecipe(r);
const WATER = (l: number) => ({ item: '#fluidcontainer', keep: true, fluid: ['water', l] as [string, number] });

// ---------------------------------------------------------------- farm tools
R({ key: 'zf_hoe', name: 'Forge a Hoe', category: 'farming', time: 16, needs: ['workbench'], anim: 'hammer', xp: ['mechanics', 3],
  inputs: [{ item: 'plank' }, { item: 'scrap_metal' }, { item: 'nails', uses: 0.05 }, { item: '#hammer', keep: true }], outputs: [{ item: 'hoe' }],
  desc: 'Beat a strip of scrap flat and bent at the end, nail a collar round a plank handle.' });
R({ key: 'zf_shears', name: 'Grind a Pair of Shears', category: 'farming', time: 18, needs: ['workbench'], anim: 'hammer', xp: ['mechanics', 3],
  inputs: [{ item: 'scrap_metal', count: 2 }, { item: 'screws', uses: 0.05 }, { item: '#hammer', keep: true }], outputs: [{ item: 'shears' }],
  desc: 'Two blades cut from scrap, ground on the bench, a screw for a pivot.' });
R({ key: 'zf_can', name: 'Solder a Watering Can', category: 'farming', time: 14, needs: ['workbench'], anim: 'craft', xp: ['mechanics', 2],
  inputs: [{ item: 'empty_can', count: 2 }, { item: 'wire' }, { item: '#hammer', keep: true }], outputs: [{ item: 'watering_can' }],
  desc: 'One can for the body, one rolled into a spout, a rose punched with a nail. It soaks a bed with less water.' });
R({ key: 'zf_trowel', name: 'Bend a Trowel', category: 'farming', time: 10, anim: 'hammer', xp: ['mechanics', 1],
  inputs: [{ item: 'scrap_metal' }, { item: 'twigs' }, { item: '#hammer', keep: true }], outputs: [{ item: 'trowel' }] });
R({ key: 'zf_feed_sack', name: 'Fill a Feed Sack', category: 'farming', time: 6, anim: 'mix', xp: ['farming', 1],
  inputs: [{ item: 'feed_mash', count: 3 }, { item: 'cloth' }], outputs: [{ item: 'feed_sack' }],
  desc: 'Three bricks of mash broken into a sewn cloth sack. One sack fills a trough.' });
R({ key: 'zf_incubator', name: 'Build an Egg Incubator', category: 'farming', time: 30, needs: ['workbench'], anim: 'hammer', xp: ['carpentry', 4], learned: true,
  discover: ['pallid_egg', 'pale_hen', 'pigeon_egg'],
  inputs: [{ item: 'plank', count: 2 }, { item: 'glass_pane' }, { item: 'candle' }, { item: 'nails', uses: 0.08 }, { item: '#hammer', keep: true }], outputs: [{ item: 'incubator' }],
  desc: 'A plank box with a window lid and a candle in a tin reflector under a nest of straw. It holds thirty-eight degrees.' });
R({ key: 'zf_spray', name: 'Steep Mite Spray', category: 'farming', time: 12, anim: 'mix', xp: ['farming', 2], learned: true,
  discover: ['exit_pepper', 'seeds_pepper'],
  inputs: [{ item: 'exit_pepper', count: 2 }, { item: 'empty_bottle' }, WATER(0.4)], outputs: [{ item: 'mite_spray' }],
  desc: 'Crush two peppers into a bottle of water and leave it an hour. Lint mites drop off anything it touches.' });

// ---------------------------------------------------------------- feed and seed
R({ key: 'zf_feed_cress', name: 'Mash Cress Feed', category: 'farming', time: 6, anim: 'mix',
  inputs: [{ item: 'strip_cress', count: 2 }, { item: 'biomass' }], outputs: [{ item: 'feed_mash', count: 2 }], desc: 'Cress pounded into a biomass brick. Hens fight over it.' });
R({ key: 'zf_feed_seed', name: 'Grind Seed Feed', category: 'farming', time: 6, anim: 'mix',
  inputs: [{ item: 'seeds_cotton' }, { item: 'vent_tuber' }], outputs: [{ item: 'feed_mash', count: 2 }], desc: 'Lint seed and tuber ground together.' });
R({ key: 'zf_seed_pepper', name: 'Dry Pepper Seed', category: 'farming', time: 8, anim: 'craft',
  inputs: [{ item: 'exit_pepper', count: 2 }, { item: 'paper' }], outputs: [{ item: 'seeds_pepper' }], desc: 'Split two ripe pods and dry the seed in a paper twist.' });
R({ key: 'zf_seed_cotton', name: 'Gin Lint Seed', category: 'farming', time: 8, anim: 'craft',
  inputs: [{ item: 'lint_boll', count: 2 }], outputs: [{ item: 'seeds_cotton' }, { item: 'thread' }], desc: 'Roll the black seed out of the lint between two fingers; twist what is left into a thread.' });
R({ key: 'zf_spawn_bluecap', name: 'Spawn Bluecap', category: 'farming', time: 10, anim: 'craft', xp: ['farming', 2], learned: true,
  discover: ['bluecap', 'forage_bluecap'],
  inputs: [{ item: 'bluecap' }, { item: 'empty_jar' }, { item: 'biomass' }], outputs: [{ item: 'spawn_bluecap' }],
  desc: 'Press a ripe cap gills-down on damp biomass in a jar and close it. In a week the jar is white.' });
R({ key: 'zf_cuttings', name: 'Take Mint Cuttings', category: 'farming', time: 5, anim: 'craft',
  inputs: [{ item: 'hush_mint', count: 2 }, { item: 'paper' }], outputs: [{ item: 'seeds_mint' }], desc: 'Snip three stems below a node and fold them into damp paper.' });

// ---------------------------------------------------------------- fibre: lint and silk
R({ key: 'zf_lint_thread', name: 'Spin Lint Thread', category: 'tailoring', time: 10, anim: 'stitch', xp: ['tailoring', 1],
  inputs: [{ item: 'lint_boll', count: 2 }], outputs: [{ item: 'thread' }], desc: 'Draw the lint out and twist it on your thigh. Grey, fuzzy, strong enough.' });
R({ key: 'zf_lint_cloth', name: 'Weave Lint Cloth', category: 'tailoring', time: 30, anim: 'stitch', xp: ['tailoring', 3],
  inputs: [{ item: 'lint_boll', count: 4 }, { item: 'thread', uses: 0.1 }], outputs: [{ item: 'cloth' }], desc: 'A square of grey cloth on a frame of pencils.' });
R({ key: 'zf_silk_thread', name: 'Wind Silk Thread', category: 'tailoring', time: 8, anim: 'stitch', xp: ['tailoring', 1],
  inputs: [{ item: 'grub_silk' }], outputs: [{ item: 'thread', count: 2 }], desc: 'Unwind a skein onto two spools.' });
R({ key: 'zf_silk_rope', name: 'Lay Silk Cord', category: 'tailoring', time: 20, anim: 'stitch', xp: ['tailoring', 2],
  inputs: [{ item: 'grub_silk', count: 3 }], outputs: [{ item: 'rope' }], desc: 'Three skeins laid into a cord that does not stretch.' });
R({ key: 'zf_silk_bandage', name: 'Weave Silk Bandages', category: 'medical', time: 16, anim: 'stitch', xp: ['firstaid', 3], learned: true,
  discover: ['grub_silk', 'carpet_grub'],
  inputs: [{ item: 'grub_silk', count: 2 }], outputs: [{ item: 'silk_bandage', count: 2 }], desc: 'A loose gauze weave of grub silk. It does not stick to the wound.' });
R({ key: 'zf_down_liner', name: 'Quilt a Down Liner', category: 'tailoring', time: 45, anim: 'stitch', xp: ['tailoring', 5], learned: true,
  discover: ['hen_down', 'pale_hen'],
  inputs: [{ item: 'hen_down', count: 4 }, { item: 'grub_silk', count: 2 }, { item: 'thread', uses: 0.2 }, { item: '#needle', keep: true }], outputs: [{ item: 'down_liner' }],
  desc: 'Down sewn into silk in stitched diamonds, so it stays where it is put.' });

// ---------------------------------------------------------------- the larder
R({ key: 'zf_pickles', name: 'Pickle Peppers', category: 'cooking', time: 20, anim: 'mix', xp: ['cooking', 4], learned: true,
  discover: ['exit_pepper', 'strip_cress'],
  inputs: [{ item: 'exit_pepper', count: 3 }, { item: 'strip_cress' }, { item: 'salt', uses: 0.1 }, { item: 'empty_jar' }, WATER(0.3)], outputs: [{ item: 'pickle_jar' }],
  desc: 'Peppers and cress packed into a jar of brine, lid screwed down. It keeps a month.' });
R({ key: 'zf_salted_eggs', name: 'Salt Eggs', category: 'cooking', time: 12, anim: 'mix', xp: ['cooking', 3], learned: true,
  discover: ['pallid_egg'],
  inputs: [{ item: 'pallid_egg', count: 4 }, { item: 'salt', uses: 0.2 }, { item: 'empty_jar' }], outputs: [{ item: 'salted_eggs' }],
  desc: 'Four eggs buried in salt in a jar. In a week the yolks are firm and gold.' });
R({ key: 'zf_moon_cheese', name: 'Make Moon Cheese', category: 'cooking', time: 50, needs: ['fire'], anim: 'cook', xp: ['cooking', 6], learned: true,
  discover: ['moon_milk', 'moon_calf'],
  inputs: [{ item: 'moon_milk', count: 2 }, { item: 'salt', uses: 0.05 }, { item: 'cloth' }], outputs: [{ item: 'moon_cheese' }],
  desc: 'Warm the milk until it splits, hang the curd in a cloth overnight, press and salt it.' });
R({ key: 'zf_cheese', name: 'Make Cheese', category: 'cooking', time: 50, needs: ['fire'], anim: 'cook', xp: ['cooking', 5],
  inputs: [{ item: 'milk', count: 2 }, { item: 'salt', uses: 0.05 }, { item: 'cloth' }], outputs: [{ item: 'cheese' }] });
R({ key: 'zf_potted', name: 'Pot Meat in Tallow', category: 'cooking', time: 30, needs: ['fire'], anim: 'cook', xp: ['cooking', 4], learned: true,
  discover: ['pigeon_tallow', 'tallow_pigeon'],
  inputs: [{ item: '#rawmeat' }, { item: 'pigeon_tallow' }, { item: 'empty_can' }], outputs: [{ item: 'potted_meat' }],
  desc: 'Cook it down, press it into a tin, pour warm tallow over to seal it.' });
R({ key: 'zf_jerky_hen', name: 'Dry Peppered Jerky', category: 'cooking', time: 45, needs: ['fire'], anim: 'cook', xp: ['cooking', 6],
  inputs: [{ item: 'bird_meat_raw', count: 2 }, { item: 'exit_pepper' }, { item: 'salt', uses: 0.05 }], outputs: [{ item: 'jerky', count: 2 }],
  desc: 'Hen meat cut thin, rubbed with pepper and salt, dried over a low fire.' });
R({ key: 'zf_jerky_moon', name: 'Cure Moon Jerky', category: 'cooking', time: 50, needs: ['fire'], anim: 'cook', xp: ['cooking', 6], learned: true,
  discover: ['moon_meat', 'moon_calf'],
  inputs: [{ item: 'moon_meat' }, { item: 'salt', uses: 0.1 }], outputs: [{ item: 'jerky', count: 3 }],
  desc: 'Moon meat dries pale and sweet. It glows faintly in the pocket.' });

// ---------------------------------------------------------------- remedies
R({ key: 'zf_poultice_bluecap', name: 'Bind a Bluecap Poultice', category: 'medical', time: 8, anim: 'mix', xp: ['firstaid', 2],
  inputs: [{ item: 'bluecap' }, { item: 'lamp_moss' }, { item: 'rag' }], outputs: [{ item: 'poultice', count: 2 }], desc: 'Bruised cap and moss in a rag. It numbs.' });
R({ key: 'zf_poultice_mint', name: 'Bind a Mint Poultice', category: 'medical', time: 8, anim: 'mix', xp: ['firstaid', 2],
  inputs: [{ item: 'hush_mint', count: 2 }, { item: 'rag' }], outputs: [{ item: 'poultice' }] });
R({ key: 'zf_tincture_bluecap', name: 'Steep a Bluecap Tincture', category: 'medical', time: 20, anim: 'mix', xp: ['firstaid', 4], learned: true,
  discover: ['bluecap', 'spawn_bluecap'],
  inputs: [{ item: 'bluecap', count: 2 }, { item: 'empty_bottle' }, { item: '#fluidcontainer', keep: true, fluid: ['alcohol', 0.15] }], outputs: [{ item: 'tincture_bluecap' }],
  desc: 'Two caps chopped into spirit, shaken every hour, strained into a dropper.' });
R({ key: 'zf_tincture_hush', name: 'Steep a Hush Tincture', category: 'medical', time: 20, anim: 'mix', xp: ['firstaid', 4], learned: true,
  discover: ['hush_mint', 'seeds_mint'],
  inputs: [{ item: 'hush_mint', count: 3 }, { item: 'empty_bottle' }, WATER(0.2)], outputs: [{ item: 'tincture_hush' }],
  desc: 'The flowers and the top leaves steeped warm. A few drops quiet the heart.' });
R({ key: 'zf_salve', name: 'Work a Mint Salve', category: 'medical', time: 14, needs: ['fire'], anim: 'mix', xp: ['firstaid', 3], learned: true,
  discover: ['hush_mint', 'pigeon_tallow'],
  inputs: [{ item: 'hush_mint', count: 2 }, { item: 'pigeon_tallow' }, { item: 'empty_can' }], outputs: [{ item: 'herb_salve' }],
  desc: 'Melt the tallow, steep the mint in it, let it set in the tin.' });

// ---------------------------------------------------------------- hand-made weapons
R({ key: 'zf_spiked_club', name: 'Drive a Spiked Club', category: 'weapons', time: 18, anim: 'hammer', xp: ['blunt', 2],
  inputs: [{ item: 'chair_leg' }, { item: 'nails', uses: 0.2 }, { item: 'rag' }, { item: '#hammer', keep: true }], outputs: [{ item: 'spiked_club' }],
  desc: 'Eighteen nails through the head of a chair leg, a rag wound for a grip.' });
R({ key: 'zf_spiked_plank', name: 'Drive a Spiked Club (Plank)', category: 'weapons', time: 20, anim: 'hammer', xp: ['blunt', 2],
  inputs: [{ item: 'plank' }, { item: 'nails', uses: 0.2 }, { item: 'rag' }, { item: '#hammer', keep: true }], outputs: [{ item: 'spiked_club' }] });
R({ key: 'zf_sling', name: 'Plait a Silk Sling', category: 'weapons', time: 15, anim: 'stitch', xp: ['tailoring', 2], learned: true,
  discover: ['grub_silk', 'carpet_grub'],
  inputs: [{ item: 'grub_silk', count: 2 }, { item: 'leather_strips' }], outputs: [{ item: 'sling' }],
  desc: 'Two plaited cords and a leather pouch. It throws stones as far as you can see them.' });
R({ key: 'zf_bone_knife', name: 'Grind a Bone Knife', category: 'weapons', time: 24, anim: 'saw', xp: ['blade', 2], learned: true,
  discover: ['bone', 'long_bone'],
  inputs: [{ item: 'bone' }, { item: 'leather_strips' }, { item: 'stone', keep: true }], outputs: [{ item: 'bone_knife' }],
  desc: 'Split it, grind one edge on a stone until it takes it, bind the knuckle end.' });
