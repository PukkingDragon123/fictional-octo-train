// Items stream — LOOT TABLES. Group tables (rolls [1,1], empty 0) are nested
// with '@group' entries; container tables are what furniture `container.loot`
// references. Entry: [itemKey | '@table', weight, minCount?, maxCount?].
// Mission items (keycard_admin, fuse_special, exit_code_fragment) never appear here.
// `contents_<itemKey>` tables (first aid kit, sewing kit, toolbox) describe what
// a container ITEM holds when it spawns from loot.
import { defLoot } from '../../items/loot';

const G = (key: string, entries: [string, number, number?, number?][]) => defLoot(key, [1, 1], entries, 0);

// =====================================================================================
// GROUPS
// =====================================================================================
G('snacks', [['chips', 10], ['candy_bar', 12], ['crackers', 6], ['cookies', 6], ['granola_bar', 10], ['gum', 8], ['jerky', 3], ['donut', 2], ['candy_dream', 0.5]]);
G('drinks_any', [['soda_can', 12], ['juice_box', 6], ['energy_drink', 6], ['water_bottle', 10], ['beer', 2], ['almond_water', 1]]);
G('canned_food', [['canned_beans', 10], ['canned_soup', 10], ['canned_tuna', 8], ['canned_corn', 8], ['canned_peaches', 6], ['canned_spam', 5], ['canned_dogfood', 2]]);
G('dry_food', [['cereal', 6], ['pasta', 6], ['rice', 6], ['instant_noodles', 10], ['crackers', 6], ['peanut_butter', 4], ['coffee_beans', 3], ['tea_bags', 3], ['sugar', 3], ['salt', 3], ['cooking_oil', 2], ['almond_extract', 1]]);
G('produce', [['apple', 8], ['banana', 6], ['orange', 6], ['carrot', 6], ['potato', 8], ['tomato', 6], ['cabbage', 3], ['lettuce', 4], ['onion', 6], ['strawberries', 3]]);
G('fridge_food', [['milk', 8], ['eggs', 6], ['cheese', 6], ['meat_raw', 4], ['chicken_raw', 3], ['steak_raw', 2], ['@produce', 10], ['soda_can', 6], ['beer', 4], ['bread', 3], ['food_scraps', 3], ['juice_box', 3]]);
G('freezer_food', [['pizza_frozen', 8], ['ice_cream', 6], ['popsicle', 6], ['meat_raw', 5], ['chicken_raw', 5], ['steak_raw', 3]]);
G('meds_common', [['painkillers', 10], ['bandage', 10], ['alcohol_wipes', 6], ['disinfectant', 5], ['cold_pills', 6], ['vitamins', 5], ['gauze', 4], ['cotton_balls', 4]]);
G('meds_rx', [['antibiotics', 6], ['antidepressants', 5], ['sleeping_pills', 5], ['painkillers', 4]]);
G('office_supplies', [['pen', 12], ['pencil', 8], ['paper', 10], ['sticky_notes', 6], ['stapler', 4], ['marker', 5], ['scissors', 3], ['box_cutter', 2], ['calculator', 3], ['notebook', 4], ['floppy_disk', 1]]);
G('junk', [['coins', 8], ['paper', 6], ['empty_can', 4], ['soda_can_empty', 4], ['empty_bottle', 3], ['newspaper', 3], ['rag_dirty', 3], ['glass_shard', 2], ['battery', 2], ['lighter', 2], ['keyring', 1], ['key_generic', 1], ['wallet', 1], ['gum', 2], ['cigarettes', 2], ['matches', 1], ['tv_remote', 1], ['phone_dead', 1], ['dice', 1], ['marbles', 0.5], ['necklace', 0.5], ['toothbrush', 1], ['pen', 2]]);
G('tools_small', [['screwdriver', 8], ['pliers', 6], ['wrench', 5], ['hammer', 6], ['tape_measure', 5], ['duct_tape', 6], ['glue', 4], ['scissors', 3], ['box_cutter', 4], ['pocket_knife', 2], ['multitool', 1], ['flashlight', 3], ['can_opener', 2], ['whetstone', 1]]);
G('tools_big', [['saw', 6], ['crowbar', 4], ['axe', 3], ['shovel', 4], ['sledgehammer', 1], ['bolt_cutters', 2], ['fire_extinguisher', 2]]);
G('hardware', [['nails', 10], ['screws', 8], ['wire', 6], ['duct_tape', 8], ['glue', 5], ['zip_ties', 6], ['fuse', 3], ['lightbulb', 5], ['battery', 5], ['electronics_scrap', 3], ['spring', 2], ['rope', 3], ['padlock', 2], ['sheet_metal', 1], ['pipe', 2], ['scrap_metal', 3]]);
G('clothes_casual', [['tshirt', 10], ['tshirt_stripe', 6], ['hoodie', 6], ['sweater', 6], ['jeans', 8], ['shorts', 5], ['sweatpants', 5], ['skirt', 3], ['socks', 8], ['shirt_office', 3], ['jacket_denim', 2], ['pajamas', 2], ['beanie', 2], ['hat_cap', 3]]);
G('clothes_outer', [['jacket_denim', 5], ['jacket_leather', 2], ['coat_winter', 4], ['raincoat', 3], ['hoodie', 4], ['scarf', 3], ['gloves_work', 2], ['beanie', 3]]);
G('shoes', [['sneakers', 8], ['boots_work', 3], ['dress_shoes', 4], ['slippers', 3], ['socks', 6]]);
G('toys', [['teddy_bear', 4], ['toy_rubber_duck', 5], ['toy_car', 5], ['doll', 2], ['rubiks_cube', 4], ['marbles', 4], ['dice', 4], ['deck_of_cards', 4], ['crayons', 6], ['jump_rope', 3], ['comic', 4], ['childrens_book', 4], ['handheld_game', 1], ['candy_dream', 1], ['basketball', 2]]);
G('magazines', [['mag_carpentry', 3], ['mag_electrical', 3], ['mag_cooking', 3], ['mag_farming', 3], ['mag_firstaid', 3], ['mag_mechanics', 3], ['mag_tailoring', 3], ['mag_trapping', 2], ['mag_survival', 2]]);
G('skillbooks', [['book_carpentry', 1], ['book_electrical', 1], ['book_firstaid', 1], ['book_farming', 1], ['book_cooking', 1]]);
G('literature_any', [['novel', 8], ['comic', 6], ['newspaper', 8], ['@magazines', 4], ['childrens_book', 2], ['notebook', 3], ['paper', 4]]);
G('electronics_small', [['battery', 8], ['flashlight', 4], ['radio_portable', 2], ['walkie_talkie', 1], ['headphones', 3], ['mp3_player', 2], ['handheld_game', 2], ['calculator', 3], ['cassette_player', 1], ['power_bank', 2], ['timer', 2], ['alarm_clock', 2], ['wristwatch', 2], ['tv_remote', 2], ['electronics_scrap', 4], ['phone_dead', 2]]);
G('lore_bits', [['note', 10], ['photo_old', 4], ['floppy_disk', 3], ['tape_cassette', 2], ['vhs_tape', 1], ['journal', 1], ['id_badge', 2], ['memory_shard', 1]]);
G('anomaly_bits', [['glow_dust', 8], ['memory_shard', 6], ['broken_pixel', 4], ['static_jar', 3], ['signal_crystal', 2], ['candy_dream', 5], ['dream_fruit', 3], ['almond_water', 4], ['checksum_pills', 1], ['seeds_dreamlily', 1]]);
G('weapons_melee', [['bat_baseball', 5], ['golf_club', 4], ['pipe_lead', 4], ['crowbar', 2], ['machete', 1], ['knife_hunting', 2], ['hockey_stick', 2], ['baton', 2], ['tire_iron', 2], ['hammer', 3]]);
G('camping', [['tent_kit', 2], ['sleeping_bag_item', 3], ['lantern', 3], ['flashlight', 4], ['canteen', 4], ['matches', 5], ['lighter', 4], ['rope', 4], ['tarp', 3], ['mre', 5], ['jerky', 4], ['granola_bar', 5], ['chlorine_tablets', 4], ['knife_hunting', 2], ['axe', 2], ['compass', 3], ['campfire_kit', 1], ['backpack_hiking', 1], ['water_bottle', 5], ['battery', 4], ['glowstick', 3], ['flare', 2]]);
G('hygiene', [['soap', 8], ['toothbrush', 6], ['toothpaste', 6], ['toilet_paper', 8], ['towel_item', 4], ['sunscreen', 3]]);
G('seeds_any', [['seeds_carrot', 3], ['seeds_tomato', 3], ['seeds_cabbage', 3], ['seeds_lettuce', 3], ['seeds_strawberry', 2], ['seeds_potato', 3]]);

// =====================================================================================
// CONTAINER-ITEM CONTENTS
// =====================================================================================
defLoot('contents_first_aid_kit', [2, 4], [['bandage', 4], ['gauze', 3], ['alcohol_wipes', 3], ['painkillers', 2], ['disinfectant', 2], ['tweezers', 1], ['suture_needle', 1], ['cotton_balls', 2], ['scissors', 1]], 0);
defLoot('contents_sewing_kit', [2, 3], [['needle', 5], ['thread', 5], ['scissors', 2]], 0);
defLoot('contents_toolbox_item', [2, 4], [['@tools_small', 8], ['@hardware', 4]], 0);

// =====================================================================================
// GENERIC
// =====================================================================================
defLoot('generic', [1, 3], [['@junk', 6], ['@snacks', 3], ['@drinks_any', 2], ['@tools_small', 2], ['@hardware', 2], ['@clothes_casual', 2], ['@literature_any', 2], ['@meds_common', 1], ['@lore_bits', 1]], 0.25);

// =====================================================================================
// OFFICE
// =====================================================================================
defLoot('office_drawer', [1, 4], [['@office_supplies', 12], ['@snacks', 3], ['@junk', 3], ['painkillers', 1], ['@lore_bits', 2], ['keyring', 1], ['battery', 1], ['mug', 1]], 0.2);
defLoot('office_desk', [1, 4], [['@office_supplies', 10], ['mug', 4], ['coffee_beans', 1], ['@snacks', 3], ['@drinks_any', 2], ['calculator', 2], ['phone_dead', 1], ['@lore_bits', 3], ['laptop', 0.5], ['employee_handbook', 0.5], ['data_drive', 0.15]], 0.15);
defLoot('filing', [1, 3], [['paper', 10, 1, 3], ['notebook', 3], ['@lore_bits', 5], ['employee_handbook', 1], ['floppy_disk', 2], ['map_lobby', 0.5], ['sticky_notes', 2]], 0.3);
defLoot('break_room', [1, 4], [['mug', 6], ['coffee_beans', 4], ['tea_bags', 4], ['sugar', 3], ['@snacks', 8], ['@drinks_any', 6], ['instant_noodles', 5], ['bowl', 2], ['kettle', 1], ['cookies', 3], ['newspaper', 2], ['painkillers', 1], ['almond_water', 0.5]], 0.2);
defLoot('vending_snack', [2, 6], [['chips', 10], ['candy_bar', 12], ['crackers', 4], ['cookies', 6], ['granola_bar', 6], ['gum', 4], ['jerky', 3], ['candy_dream', 0.4]], 0.1);
defLoot('vending_soda', [2, 6], [['soda_can', 14], ['energy_drink', 6], ['juice_box', 4], ['water_bottle', 8], ['almond_water', 1.5]], 0.1);
defLoot('fridge_office', [1, 4], [['soda_can', 6], ['milk', 4], ['sandwich', 4], ['salad', 2], ['food_scraps', 5], ['cheese', 2], ['juice_box', 3], ['water_bottle', 4], ['beer', 1], ['apple', 3], ['@produce', 2], ['birthday_cake', 0.3]], 0.2);
defLoot('server_room', [1, 4], [['electronics_scrap', 8], ['wire', 6], ['fuse', 3], ['floppy_disk', 4], ['data_drive', 1], ['battery', 2], ['multimeter', 1], ['screwdriver', 2], ['zip_ties', 4], ['laptop', 0.4], ['broken_pixel', 1], ['static_jar', 0.5], ['@lore_bits', 2], ['power_bank', 2]], 0.2);
defLoot('security_office', [1, 5], [['flashlight', 5], ['walkie_talkie', 3], ['battery', 5], ['baton', 3], ['security_uniform', 2], ['keyring', 3], ['key_generic', 2], ['donut', 4], ['coffee_beans', 2], ['mug', 2], ['radio_portable', 2], ['binoculars', 1], ['@lore_bits', 3], ['id_badge', 1], ['map_lobby', 0.5], ['pistol', 0.25], ['ammo_9mm', 0.4], ['first_aid_kit', 1], ['vest_hiviz', 1], ['whistle', 2], ['padlock', 1]], 0.15);
defLoot('maintenance', [1, 5], [['@hardware', 10], ['fuse', 5], ['lightbulb', 5], ['fluoro_tube', 6], ['wire', 4], ['duct_tape', 4], ['multimeter', 2], ['flashlight', 3], ['battery', 4], ['screwdriver', 3], ['pliers', 3], ['wrench', 3], ['mop', 2], ['bucket', 2], ['bleach', 2], ['janitor_uniform', 1], ['vest_hiviz', 1], ['keyring', 2], ['gloves_rubber', 2], ['map_lobby', 0.3], ['@lore_bits', 1]], 0.15);
defLoot('janitor', [1, 5], [['mop', 4], ['broom', 4], ['bucket', 3], ['bleach', 5], ['soap', 3], ['gloves_rubber', 4], ['garbage_bag', 6], ['toilet_paper', 4], ['duct_tape', 2], ['fluoro_tube', 3], ['lightbulb', 3], ['keyring', 2], ['flashlight', 2], ['janitor_uniform', 2], ['rag', 3], ['spray_paint', 1], ['chalk', 1], ['@lore_bits', 1], ['map_lobby', 0.3]], 0.15);

// =====================================================================================
// HOME
// =====================================================================================
defLoot('fridge_house', [2, 6], [['@fridge_food', 14], ['birthday_cake', 0.3], ['salad', 1], ['sandwich', 1]], 0.12);
defLoot('freezer', [1, 4], [['@freezer_food', 10]], 0.25);
defLoot('kitchen_cabinet', [1, 5], [['@canned_food', 8], ['@dry_food', 10], ['pot', 2], ['frying_pan', 2], ['mug', 4], ['bowl', 4], ['kettle', 1], ['can_opener', 2], ['knife_kitchen', 2], ['rolling_pin', 1], ['bleach', 1], ['soap', 1], ['matches', 1], ['candle', 1]], 0.15);
defLoot('kitchen_counter', [1, 3], [['knife_kitchen', 4], ['can_opener', 3], ['bread', 3], ['mug', 3], ['bowl', 2], ['@produce', 3], ['coffee_beans', 2], ['frying_pan', 1], ['rolling_pin', 1], ['matches', 1], ['lighter', 1]], 0.3);
defLoot('pantry', [2, 7], [['@canned_food', 12], ['@dry_food', 12], ['peanut_butter', 3], ['cereal', 3], ['almond_extract', 1], ['candle', 1]], 0.1);
defLoot('bathroom_cabinet', [1, 4], [['@hygiene', 10], ['painkillers', 3], ['bandage', 3], ['disinfectant', 2], ['cotton_balls', 2], ['alcohol_wipes', 2], ['tweezers', 2], ['cold_pills', 2], ['sleeping_pills', 1], ['antidepressants', 1], ['vitamins', 1]], 0.2);
defLoot('medicine_cabinet', [1, 4], [['@meds_common', 10], ['@meds_rx', 4], ['tweezers', 2], ['suture_needle', 1], ['cotton_balls', 2], ['scissors', 1], ['adrenaline', 0.3]], 0.2);
defLoot('bedroom_dresser', [1, 5], [['@clothes_casual', 14], ['@shoes', 2], ['wallet', 1], ['wristwatch', 1], ['necklace', 1], ['@lore_bits', 1], ['coins', 2], ['glasses', 1], ['sunglasses', 1], ['blanket', 1], ['bedsheet', 2]], 0.15);
defLoot('wardrobe', [1, 5], [['@clothes_casual', 8], ['@clothes_outer', 8], ['@shoes', 5], ['shirt_office', 3], ['slacks', 3], ['dress_shoes', 2], ['umbrella', 2], ['blanket', 2], ['pillow_item', 1], ['bedsheet', 2], ['backpack_school', 1], ['duffel_bag', 1], ['briefcase', 0.5]], 0.15);
defLoot('nightstand', [1, 3], [['novel', 4], ['@literature_any', 3], ['alarm_clock', 4], ['glasses', 2], ['painkillers', 2], ['sleeping_pills', 2], ['candle', 2], ['lighter', 1], ['flashlight', 2], ['wristwatch', 1], ['@lore_bits', 2], ['cigarettes', 2], ['pistol', 0.08], ['ammo_9mm', 0.1]], 0.25);
defLoot('bookshelf', [1, 5], [['novel', 10], ['@literature_any', 6], ['@magazines', 4], ['@skillbooks', 2], ['childrens_book', 2], ['comic', 2], ['journal', 0.3], ['map_lobby', 0.3]], 0.15);
defLoot('kids_room', [1, 5], [['@toys', 12], ['crayons', 4], ['childrens_book', 4], ['comic', 3], ['pajamas', 2], ['juice_box', 2], ['candy_bar', 2], ['handheld_game', 1], ['teddy_bear', 2], ['flashlight', 1], ['@lore_bits', 1], ['photo_old', 0.5]], 0.15);
defLoot('toy_box', [1, 5], [['@toys', 20]], 0.15);
defLoot('garage_shelf', [1, 5], [['@tools_small', 6], ['@tools_big', 4], ['@hardware', 6], ['gas_can', 4], ['car_battery', 1], ['tire_iron', 3], ['tarp', 2], ['rope', 3], ['bucket', 2], ['gloves_work', 2], ['spray_paint', 2], ['fertilizer', 1], ['watering_can', 1], ['@camping', 2], ['bat_baseball', 1], ['helmet_bike', 1], ['car_key', 0.5]], 0.15);
defLoot('car_trunk', [1, 4], [['tire_iron', 4], ['gas_can', 3], ['car_battery', 1], ['tarp', 2], ['rope', 2], ['flashlight', 2], ['first_aid_kit', 2], ['blanket', 2], ['water_bottle', 3], ['duffel_bag', 2], ['@junk', 3], ['umbrella', 2], ['bat_baseball', 1], ['@camping', 2], ['jacket_denim', 1]], 0.25);
defLoot('car_glovebox', [1, 3], [['map_lobby', 0.5], ['flashlight', 3], ['car_key', 3], ['sunglasses', 3], ['gum', 3], ['cigarettes', 3], ['lighter', 3], ['coins', 4], ['pen', 2], ['wallet', 1], ['painkillers', 2], ['@lore_bits', 2], ['pistol', 0.08], ['ammo_9mm', 0.1]], 0.3);
defLoot('mailbox', [1, 2], [['newspaper', 8], ['paper', 6], ['note', 3], ['photo_old', 1], ['@lore_bits', 2], ['key_generic', 1]], 0.5);

// =====================================================================================
// SCHOOL
// =====================================================================================
defLoot('school_locker', [1, 4], [['backpack_school', 3], ['hoodie', 3], ['@snacks', 5], ['juice_box', 3], ['soda_can', 3], ['notebook', 4], ['pen', 3], ['pencil', 3], ['comic', 2], ['sneakers', 1], ['sweatpants', 1], ['hat_cap', 1], ['handheld_game', 1], ['mp3_player', 1], ['headphones', 1], ['@junk', 2], ['@lore_bits', 1]], 0.25);
defLoot('school_desk', [1, 2], [['pencil', 8], ['pen', 4], ['paper', 8], ['notebook', 5], ['crayons', 3], ['calculator', 2], ['gum', 2], ['candy_bar', 1], ['@lore_bits', 1]], 0.45);
defLoot('teacher_desk', [1, 4], [['@office_supplies', 8], ['mug', 3], ['coffee_beans', 1], ['apple', 3], ['painkillers', 2], ['chalk', 3], ['marker', 3], ['@literature_any', 2], ['keyring', 1], ['@lore_bits', 2], ['whistle', 1]], 0.2);
defLoot('classroom_supplies', [1, 5], [['chalk', 8], ['crayons', 6], ['paper', 10, 1, 3], ['pencil', 6], ['scissors', 4], ['glue', 4], ['marker', 3], ['notebook', 4], ['@magazines', 1], ['childrens_book', 2], ['tape_measure', 1]], 0.15);
defLoot('cafeteria', [2, 6], [['@canned_food', 8], ['@dry_food', 4], ['juice_box', 6], ['milk', 5], ['bread', 4], ['@produce', 5], ['bowl', 4], ['pot', 2], ['frying_pan', 2], ['knife_kitchen', 2], ['soda_can', 4], ['pizza_frozen', 2], ['apple', 3], ['banana', 2], ['sandwich', 2], ['salt', 1], ['sugar', 1], ['cooking_oil', 1]], 0.15);
defLoot('gym_locker', [1, 4], [['sweatpants', 4], ['shorts', 4], ['tshirt', 5], ['sneakers', 3], ['socks', 5], ['towel_item', 4], ['soap', 2], ['water_bottle', 3], ['energy_drink', 2], ['granola_bar', 2], ['basketball', 1], ['padlock', 2], ['sunscreen', 1], ['swim_goggles', 1], ['@junk', 2]], 0.25);
defLoot('nurse_office', [1, 4], [['@meds_common', 12], ['@meds_rx', 3], ['tweezers', 2], ['splint', 2], ['suture_needle', 1], ['gauze', 3], ['cotton_balls', 2], ['first_aid_kit', 2], ['juice_box', 2], ['crackers', 1]], 0.15);

// =====================================================================================
// HOSPITAL & LAB
// =====================================================================================
defLoot('hospital_cabinet', [1, 5], [['gauze', 8], ['bandage', 10], ['disinfectant', 6], ['alcohol_wipes', 6], ['cotton_balls', 4], ['suture_needle', 4], ['tweezers', 3], ['forceps', 2], ['scalpel', 2], ['syringe', 4], ['splint', 3], ['gloves_rubber', 3], ['face_mask', 4], ['scrubs_top', 2], ['scrubs_pants', 2], ['painkillers', 3], ['first_aid_kit', 1]], 0.12);
defLoot('hospital_pharmacy', [2, 6], [['@meds_rx', 12], ['@meds_common', 8], ['vitamins', 3], ['adrenaline', 1], ['checksum_pills', 0.2], ['syringe', 3], ['sleeping_pills', 3]], 0.1);
defLoot('morgue', [1, 3], [['scalpel', 4], ['forceps', 3], ['gloves_rubber', 4], ['face_mask', 3], ['syringe', 2], ['disinfectant', 2], ['bone', 2], ['wallet', 2], ['wristwatch', 1], ['keyring', 1], ['necklace', 1], ['@lore_bits', 3], ['id_badge', 1], ['lab_coat', 1], ['specimen_jar', 0.5], ['rag_dirty', 2], ['bandage_dirty', 2]], 0.35);
defLoot('lab_cabinet', [1, 5], [['beaker', 6], ['disinfectant', 3], ['gloves_rubber', 4], ['face_mask', 3], ['syringe', 4], ['specimen_jar', 1], ['lab_coat', 1], ['gas_mask', 1], ['glow_dust', 1], ['static_jar', 0.6], ['@lore_bits', 3], ['notebook', 2], ['floppy_disk', 2], ['alcohol_wipes', 2], ['bleach', 2], ['chlorine_tablets', 1]], 0.15);
defLoot('lab_bench', [1, 4], [['beaker', 5], ['notebook', 3], ['pen', 3], ['multimeter', 2], ['soldering_iron', 2], ['electronics_scrap', 3], ['@lore_bits', 4], ['memory_shard', 1], ['broken_pixel', 0.5], ['data_drive', 0.3], ['laptop', 0.4], ['glasses', 1], ['mug', 2], ['signal_crystal', 0.4]], 0.2);

// =====================================================================================
// STORES & MALL
// =====================================================================================
defLoot('store_food_canned', [3, 8], [['canned_beans', 10], ['canned_soup', 10], ['canned_tuna', 8], ['canned_corn', 8], ['canned_peaches', 6], ['canned_spam', 5], ['canned_dogfood', 3], ['baby_food', 2], ['peanut_butter', 2]], 0.12);
defLoot('store_food_dry', [3, 8], [['cereal', 8], ['pasta', 8], ['rice', 8], ['instant_noodles', 10], ['crackers', 6], ['coffee_beans', 4], ['tea_bags', 4], ['sugar', 4], ['salt', 3], ['cooking_oil', 3], ['peanut_butter', 4], ['almond_extract', 1], ['mre', 0.5]], 0.12);
defLoot('store_snacks', [3, 8], [['chips', 10], ['candy_bar', 12], ['cookies', 8], ['granola_bar', 6], ['gum', 6], ['jerky', 4], ['crackers', 4], ['candy_dream', 0.5], ['donut', 2]], 0.1);
defLoot('store_drinks', [3, 8], [['soda_can', 12], ['water_bottle', 12], ['juice_box', 6], ['energy_drink', 6], ['soda_bottle_2l', 5], ['water_jug', 3], ['beer', 4], ['wine', 2], ['whiskey', 1], ['almond_water', 1]], 0.1);
defLoot('store_produce', [2, 6], [['@produce', 20], ['food_scraps', 4]], 0.2);
defLoot('store_frozen', [2, 6], [['@freezer_food', 10]], 0.2);
defLoot('store_household', [2, 6], [['bleach', 6], ['soap', 6], ['toilet_paper', 8], ['garbage_bag', 6], ['plastic_bag', 4], ['candle', 5], ['matches', 5], ['lighter', 4], ['lightbulb', 4], ['battery', 6], ['duct_tape', 3], ['towel_item', 3], ['toothbrush', 3], ['toothpaste', 3], ['sunscreen', 2], ['mop', 2], ['broom', 2], ['bucket', 2], ['umbrella', 2], ['alarm_clock', 1], ['fluoro_tube', 1]], 0.12);
defLoot('store_hardware', [2, 7], [['@hardware', 14], ['@tools_small', 8], ['@tools_big', 4], ['gas_can', 2], ['tarp', 3], ['rope', 4], ['spray_paint', 4], ['chalk', 2], ['gloves_work', 3], ['hard_hat', 2], ['vest_hiviz', 2], ['boots_work', 1], ['nail_gun', 0.5], ['fertilizer', 2], ['@seeds_any', 3], ['watering_can', 2], ['trowel', 2], ['padlock', 3]], 0.1);
defLoot('store_pharmacy', [2, 6], [['@meds_common', 14], ['@meds_rx', 5], ['@hygiene', 6], ['vitamins', 3], ['first_aid_kit', 2], ['cotton_balls', 3], ['sunscreen', 2], ['glasses', 1], ['face_mask', 3], ['chlorine_tablets', 1]], 0.1);
defLoot('store_clothing', [2, 6], [['@clothes_casual', 12], ['@clothes_outer', 6], ['@shoes', 6], ['shirt_office', 3], ['slacks', 3], ['skirt', 3], ['pajamas', 3], ['sunglasses', 2], ['hat_cap', 3], ['beanie', 2], ['scarf', 2], ['purse', 2], ['tote_bag', 2], ['fanny_pack', 1], ['backpack_school', 2]], 0.12);
defLoot('store_toys', [2, 6], [['@toys', 20], ['handheld_game', 2], ['crayons', 3], ['comic', 3], ['candy_dream', 0.5], ['juice_box', 1]], 0.12);
defLoot('store_electronics', [2, 6], [['@electronics_small', 16], ['radio_portable', 3], ['walkie_talkie', 2], ['laptop', 1], ['camera_polaroid', 2], ['cassette_player', 2], ['headphones', 3], ['power_bank', 3], ['battery', 6]], 0.12);
defLoot('store_sports', [2, 6], [['bat_baseball', 5], ['golf_club', 3], ['tennis_racket', 4], ['basketball', 4], ['baseball', 5], ['hockey_stick', 3], ['helmet_bike', 3], ['swim_goggles', 3], ['sneakers', 4], ['sweatpants', 3], ['shorts', 3], ['water_bottle', 5], ['granola_bar', 3], ['energy_drink', 3], ['backpack_hiking', 1], ['compass', 1], ['@camping', 3], ['whistle', 2]], 0.12);
defLoot('mall_trash', [1, 4], [['@junk', 10], ['soda_can_empty', 6], ['food_scraps', 6], ['paper', 4], ['plastic_bag', 4], ['newspaper', 3], ['rag_dirty', 2], ['glass_shard', 2], ['comic', 1], ['@lore_bits', 1], ['coins', 2]], 0.3);

// =====================================================================================
// TRASH & SALVAGE
// =====================================================================================
defLoot('trash', [1, 3], [['food_scraps', 8], ['@junk', 8], ['empty_can', 5], ['soda_can_empty', 5], ['empty_bottle', 3], ['rag_dirty', 3], ['newspaper', 3], ['paper', 3], ['glass_shard', 2], ['bandage_dirty', 1], ['battery', 1], ['@lore_bits', 1]], 0.35);
defLoot('dumpster', [1, 5], [['food_scraps', 10], ['garbage_bag', 6], ['@junk', 8], ['empty_can', 4], ['empty_bottle', 4], ['rag_dirty', 3], ['scrap_metal', 3], ['plank', 2], ['pipe', 1], ['glass_shard', 2], ['@clothes_casual', 1], ['newspaper', 2], ['bone', 1], ['glass_bottle_throw', 2]], 0.25);
defLoot('toolbox', [2, 5], [['@tools_small', 14], ['@hardware', 8], ['hammer', 3], ['screwdriver', 4], ['wrench', 3], ['pliers', 3], ['duct_tape', 2], ['multimeter', 1], ['soldering_iron', 1], ['whetstone', 1]], 0.1);
defLoot('tool_shelf', [1, 5], [['@tools_small', 8], ['@tools_big', 6], ['@hardware', 8], ['gas_can', 1], ['spray_paint', 2], ['gloves_work', 2], ['fire_extinguisher', 1], ['toolbox_item', 1], ['nail_gun', 0.3]], 0.15);

// =====================================================================================
// POOL HALLS
// =====================================================================================
defLoot('pool_storage', [1, 4], [['chlorine_tablets', 6], ['pool_noodle', 6], ['swim_goggles', 4], ['towel_item', 6], ['toy_rubber_duck', 3], ['bucket', 2], ['bleach', 2], ['sunscreen', 2], ['slippers', 2], ['rope', 1], ['whistle', 1], ['gloves_rubber', 2], ['mop', 1]], 0.2);
defLoot('lifeguard', [1, 4], [['whistle', 5], ['first_aid_kit', 3], ['sunscreen', 4], ['towel_item', 4], ['swim_goggles', 3], ['water_bottle', 3], ['sunglasses', 3], ['hat_cap', 2], ['bandage', 2], ['binoculars', 1], ['radio_portable', 1], ['@lore_bits', 1]], 0.2);

// =====================================================================================
// SURVIVAL & ANOMALY
// =====================================================================================
defLoot('crate_supplies', [2, 6], [['@canned_food', 6], ['water_bottle', 6], ['almond_water', 3], ['mre', 3], ['@meds_common', 4], ['battery', 4], ['flashlight', 2], ['@hardware', 3], ['rope', 2], ['tarp', 1], ['duct_tape', 2], ['candle', 2], ['matches', 2], ['chlorine_tablets', 2], ['blanket', 1], ['@tools_small', 2], ['glowstick', 2], ['flare', 1]], 0.08);
defLoot('camp_supplies', [2, 6], [['@camping', 20], ['@canned_food', 3], ['rope', 2], ['tarp', 2], ['axe', 1], ['firewood', 3], ['twigs', 3]], 0.1);
defLoot('survivor_stash', [2, 6], [['@canned_food', 6], ['almond_water', 5], ['water_bottle', 4], ['bandage', 4], ['painkillers', 3], ['battery', 4], ['flashlight', 2], ['lighter', 2], ['chalk', 3], ['glow_paint', 2], ['glow_dust', 2], ['journal', 2], ['map_lobby', 1], ['note', 3], ['knife_hunting', 1], ['@weapons_melee', 2], ['ammo_9mm', 0.4], ['pistol', 0.15], ['jerky', 2], ['mre', 2], ['@anomaly_bits', 2], ['mag_debug', 0.5], ['@magazines', 1], ['checksum_pills', 0.3], ['walkie_talkie', 1], ['spray_paint', 1]], 0.05);
defLoot('survivor_corpse', [1, 4], [['rag_dirty', 4], ['bandage_dirty', 4], ['wallet', 3], ['keyring', 2], ['journal', 1], ['note', 4], ['photo_old', 2], ['flashlight', 2], ['battery', 2], ['water_bottle', 2], ['empty_bottle', 1], ['knife_kitchen', 1], ['@weapons_melee', 1], ['@snacks', 2], ['backpack_school', 1], ['@clothes_casual', 3], ['@lore_bits', 2], ['chalk', 1], ['glow_paint', 0.5], ['memory_shard', 0.5], ['cigarettes', 1], ['lighter', 1]], 0.1);
defLoot('anomaly_cache', [1, 4], [['@anomaly_bits', 16], ['almond_water', 4], ['checksum_pills', 1], ['sim_patch', 0.25], ['mag_debug', 1], ['glow_paint', 2], ['@lore_bits', 3], ['seeds_dreamlily', 1]], 0.05);
defLoot('creature_nest', [1, 5], [['bone', 12], ['rag_dirty', 6], ['coins', 5], ['keyring', 3], ['wallet', 3], ['necklace', 3], ['wristwatch', 2], ['glass_shard', 4], ['broken_pixel', 2], ['memory_shard', 2], ['glow_dust', 2], ['flashlight', 1], ['battery', 2], ['@canned_food', 2], ['bandage_dirty', 2], ['@clothes_casual', 2], ['backpack_school', 0.5], ['food_scraps', 4], ['photo_old', 1], ['id_badge', 0.5]], 0.05);

// =====================================================================================
// FLOOR SCATTER (one roll per call; world gen controls density)
// =====================================================================================
defLoot('floor_lobby', [1, 1], [['almond_water', 2], ['note', 5], ['paper', 5], ['@junk', 12], ['empty_bottle', 2], ['soda_can_empty', 3], ['rag_dirty', 2], ['chalk', 1], ['glow_dust', 1], ['memory_shard', 0.6], ['broken_pixel', 0.6], ['battery', 1], ['coins', 3], ['photo_old', 1], ['flashlight', 0.5], ['mug', 1], ['pen', 2], ['fluoro_tube', 1], ['@snacks', 1], ['sticky_notes', 1]], 0.3);
defLoot('floor_generic', [1, 1], [['@junk', 12], ['paper', 4], ['food_scraps', 2], ['glass_shard', 2], ['rag_dirty', 2], ['@snacks', 1], ['note', 2], ['coins', 2], ['battery', 1], ['plank', 1], ['scrap_metal', 1], ['twigs', 0.5], ['stone', 0.5]], 0.35);
