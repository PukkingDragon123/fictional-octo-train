// Creature loot, pack A (rolled into the corpse container on death: `creature_<speciesKey>`).
// Entry: [itemKey | '@table', weight, minCount?, maxCount?].
import { defLoot } from '../../items/loot';

// Hollow: an office worker's pockets, slightly out of sync
defLoot('creature_hollow', [1, 3], [
  ['wallet', 3], ['keyring', 2], ['pen', 4], ['sticky_notes', 3], ['coins', 4, 1, 3], ['photo_old', 2], ['wristwatch', 1.5],
  ['glasses', 1.5], ['memory_shard', 1.2], ['broken_pixel', 1], ['phone_dead', 1.5], ['floppy_disk', 1], ['gum', 1],
  ['painkillers', 1], ['id_badge', 0.5], ['shirt_office', 1], ['dress_shoes', 0.5],
], 0.1);

