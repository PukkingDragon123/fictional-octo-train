// World stream 3 — loot tables for the film-mood zones (depot, showroom,
// homestead, annex, undercroft) and their props. Valuables (scrip value) are
// woven in sparingly: most of the money is in the furniture you smash.
import { defLoot } from '../../items/loot';

// ---- small groups
defLoot('zw_jewels', [1, 1], [['wedding_ring', 6], ['gold_chain', 3], ['pearl_necklace', 2], ['cameo_brooch', 3], ['diamond_earrings', 1], ['engagement_ring', 0.6], ['gold_watch', 2], ['pocket_watch', 2], ['necklace', 6]], 0);
defLoot('zw_heirloom', [1, 1], [['silverware_set', 4], ['silver_candlestick', 5], ['porcelain_doll', 3], ['antique_figurine', 4], ['crystal_decanter', 3], ['stamp_album', 2], ['medal_case', 1.5], ['jewellery_box', 2], ['typewriter', 1]], 0);
defLoot('zw_salvage_tech', [1, 1], [['circuit_board', 6], ['copper_bundle', 5], ['hard_drive_old', 4], ['vhs_stack', 4], ['camcorder', 1.2], ['boombox', 1.5], ['film_reel', 2], ['electronics_scrap', 8], ['wire', 6]], 0);

// ---- depot
defLoot('zw_luggage', [1, 5], [['@clothes_casual', 12], ['@clothes_outer', 5], ['@shoes', 3], ['@hygiene', 5], ['novel', 3], ['photo_old', 3], ['family_photo', 1], ['wallet', 2], ['umbrella', 2], ['camera_polaroid', 1], ['cassette_player', 1], ['@snacks', 2], ['@zw_jewels', 1.6], ['@zw_heirloom', 1], ['cash_roll', 0.4], ['gold_lighter', 0.4]], 0.08);
defLoot('zw_lost_property', [2, 6], [['umbrella', 8], ['glasses', 4], ['sunglasses', 4], ['gloves_work', 3], ['scarf', 4], ['hat_cap', 3], ['wallet', 4], ['keyring', 6], ['photo_old', 3], ['novel', 3], ['@toys', 2], ['@zw_jewels', 1.5], ['@zw_salvage_tech', 1.2], ['pocket_watch', 0.6], ['gold_lighter', 0.5]], 0.05);
defLoot('zw_coin_box', [1, 3], [['coins', 20], ['coin_jar', 2], ['silver_dollars', 1.2], ['cash_roll', 0.6]], 0.15);
defLoot('zw_newsstand', [2, 6], [['newspaper', 10], ['@magazines', 6], ['comic', 4], ['candy_bar', 5], ['gum', 4], ['chips', 3], ['cigarettes', 4], ['lighter', 3], ['soda_can', 3], ['coins', 4], ['coin_jar', 0.6], ['stamp_album', 0.4]], 0.08);
defLoot('zw_floor_depot', [1, 1], [['paper', 6], ['newspaper', 5], ['coins', 6], ['soda_can_empty', 4], ['empty_bottle', 2], ['wallet', 1], ['keyring', 1.5], ['umbrella', 1], ['note', 2], ['photo_old', 1], ['candy_bar', 1], ['glasses', 0.6], ['@zw_jewels', 0.25]], 0.3);

// ---- showroom
defLoot('zw_flatpack', [1, 4], [['plank', 8], ['screws', 8], ['nails', 4], ['paper', 4], ['@hardware', 3], ['@zw_heirloom', 1.4], ['candle', 2], ['mug', 2], ['bowl', 2], ['pillow_item', 1.5], ['blanket', 1]], 0.15);
defLoot('zw_bargain', [2, 5], [['pillow_item', 6], ['candle', 5], ['mug', 4], ['bowl', 3], ['photo_old', 3], ['blanket', 3], ['@zw_heirloom', 2.5], ['alarm_clock', 2], ['@toys', 2], ['crystal_decanter', 0.6]], 0.05);
defLoot('zw_floor_showroom', [1, 1], [['paper', 6], ['screws', 4], ['pencil', 4], ['tape_measure', 2], ['mug', 1], ['candle', 1], ['@toys', 1], ['coins', 3], ['note', 1.5], ['@zw_heirloom', 0.3]], 0.35);

// ---- homestead
defLoot('zw_coats', [1, 4], [['@clothes_outer', 8], ['wallet', 3], ['keyring', 4], ['coins', 4], ['cigarettes', 2], ['lighter', 2], ['photo_old', 2], ['gloves_work', 1], ['gold_lighter', 0.5], ['cash_roll', 0.3]], 0.15);
defLoot('zw_shoes', [1, 3], [['@shoes', 10], ['socks', 4], ['coins', 1]], 0.2);
defLoot('zw_floor_home', [1, 1], [['@toys', 6], ['crayons', 3], ['photo_old', 3], ['family_photo', 1.5], ['tv_remote', 2], ['comic', 2], ['childrens_book', 2], ['mug', 1], ['coins', 2], ['candle', 1], ['note', 1], ['@zw_jewels', 0.3], ['@zw_heirloom', 0.25]], 0.3);

// ---- annex / base camp
defLoot('zw_hazmat', [1, 3], [['gas_mask', 4], ['gloves_rubber', 6], ['face_mask', 5], ['duct_tape', 4], ['flashlight', 2], ['battery', 4], ['glowstick', 3], ['chalk', 2], ['note', 1]], 0.2);
defLoot('zw_expedition', [2, 6], [['rope', 6], ['flashlight', 5], ['battery', 8], ['walkie_talkie', 3], ['glowstick', 5], ['flare', 2], ['chalk', 4], ['duct_tape', 4], ['first_aid_kit', 2], ['almond_water', 3], ['mre', 3], ['compass', 1.5], ['binoculars', 1], ['vhs_tape', 2], ['tape_cassette', 2], ['@lore_bits', 3], ['@zw_salvage_tech', 2.5], ['camcorder', 0.5]], 0.06);
defLoot('zw_camcorder', [1, 2], [['vhs_tape', 6], ['vhs_stack', 2], ['battery', 4], ['camcorder', 1.5]], 0.1);
defLoot('zw_floor_annex', [1, 1], [['paper', 8], ['floppy_disk', 3], ['tape_cassette', 2], ['vhs_tape', 2], ['battery', 3], ['glowstick', 2], ['chalk', 2], ['pen', 3], ['mug', 1.5], ['note', 2], ['id_badge', 1], ['@zw_salvage_tech', 0.6]], 0.3);

// ---- undercroft
defLoot('zw_floor_under', [1, 1], [['bone', 6], ['rag_dirty', 5], ['rope', 2], ['glowstick', 2], ['flashlight', 1], ['photo_old', 2], ['wallet', 1.5], ['wristwatch', 1], ['gold_teeth', 0.6], ['dentures', 0.6], ['@zw_jewels', 0.5], ['note', 1.5], ['chalk', 1]], 0.25);
defLoot('zw_survivor', [2, 6], [['rope', 3], ['flashlight', 3], ['battery', 4], ['almond_water', 4], ['@canned_food', 4], ['bandage', 3], ['chalk', 3], ['glowstick', 3], ['note', 3], ['@zw_jewels', 2], ['cash_roll', 1], ['gold_watch', 0.8], ['silver_dollars', 0.8]], 0.05);
