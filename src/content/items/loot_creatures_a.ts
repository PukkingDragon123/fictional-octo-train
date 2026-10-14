// Creature loot, pack A (rolled into the corpse container on death: `creature_<speciesKey>`).
// Entry: [itemKey | '@table', weight, minCount?, maxCount?].
import { defLoot } from '../../items/loot';

// The Employee: what is left in the pockets of a suit nobody wore
defLoot('creature_employee', [1, 3], [
  ['id_badge', 4], ['pen', 5], ['sticky_notes', 3], ['keyring', 2], ['wallet', 2], ['coins', 3, 1, 3],
  ['floppy_disk', 1.5], ['calculator', 1], ['wristwatch', 1], ['glasses', 1], ['memory_shard', 0.6], ['broken_pixel', 0.8],
], 0.1);

// Swivel: screws, a spring, and whatever was down the side of the seat
defLoot('creature_swivel', [1, 3], [
  ['screws', 6, 1, 3], ['spring', 5], ['scrap_metal', 3], ['rag', 3], ['coins', 3, 1, 2], ['pen', 2], ['sticky_notes', 1], ['glass_shard', 1], ['bone', 1],
], 0.1);

// Davenport: everything ever lost down the back of a sofa
defLoot('creature_davenport', [3, 6], [
  ['coins', 10, 2, 6], ['tv_remote', 3], ['key_generic', 3], ['pen', 3], ['gum', 3], ['lighter', 2], ['dice', 2], ['marbles', 1],
  ['necklace', 1], ['wristwatch', 1], ['wallet', 1.5], ['photo_old', 1], ['id_badge', 1], ['bone', 4, 1, 3], ['spring', 5, 1, 3],
  ['rag', 4, 1, 2], ['food_scraps', 2], ['deck_of_cards', 1], ['toy_car', 1],
], 0);

// Underlay: what fell through the carpet
defLoot('creature_underlay', [1, 4], [
  ['rag_dirty', 4], ['coins', 5, 1, 4], ['key_generic', 2], ['keyring', 2], ['necklace', 1], ['wristwatch', 1], ['bone', 5, 1, 3],
  ['glass_shard', 2], ['id_badge', 1], ['photo_old', 1], ['memory_shard', 0.6], ['dice', 1], ['marbles', 1],
], 0.05);

// Drywall Man: things sealed into walls
defLoot('creature_drywall_man', [1, 4], [
  ['nails', 6, 1, 4], ['screws', 5, 1, 4], ['paper', 4], ['photo_old', 2], ['coins', 3, 1, 3], ['keyring', 1.5], ['tape_cassette', 1],
  ['wire', 3], ['glass_shard', 2], ['broken_pixel', 1], ['memory_shard', 0.7], ['id_badge', 1], ['bone', 1.5],
], 0.1);

// Ventling: its own scraps (whatever it stole is dropped separately)
defLoot('creature_ventling', [0, 2], [
  ['coins', 4, 1, 3], ['battery', 2], ['glass_shard', 2], ['marbles', 1], ['necklace', 0.8], ['key_generic', 1], ['glow_dust', 1], ['bone', 1],
], 0.3);

// Hollow: an office worker's pockets, slightly out of sync
defLoot('creature_hollow', [1, 3], [
  ['wallet', 3], ['keyring', 2], ['pen', 4], ['sticky_notes', 3], ['coins', 4, 1, 3], ['photo_old', 2], ['wristwatch', 1.5],
  ['glasses', 1.5], ['memory_shard', 1.2], ['broken_pixel', 1], ['phone_dead', 1.5], ['floppy_disk', 1], ['gum', 1],
  ['painkillers', 1], ['id_badge', 0.5], ['shirt_office', 1], ['dress_shoes', 0.5],
], 0.1);

// The Custodian cannot die; this exists so nothing breaks if something ever kills it.
defLoot('creature_custodian', [1, 2], [
  ['keyring', 4], ['key_generic', 3], ['gloves_rubber', 2], ['rag', 2], ['static_jar', 0.5],
], 0);
