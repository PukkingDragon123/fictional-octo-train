// Creature pack B loot: `creature_<key>` tables are rolled into a corpse when
// the creature dies; the other tables feed creature behaviours (plushkin gifts,
// what a wrongbird should never have swallowed).
import { defLoot } from '../../items/loot';

// what you find in a wrongbird that should not be inside a bird
defLoot('wrongbird_inside', [1, 1], [['key_generic', 3], ['coins', 3], ['marbles', 2], ['dice', 2], ['wristwatch', 1], ['necklace', 1], ['memory_shard', 2], ['broken_pixel', 2], ['photo_old', 1], ['battery', 1], ['seeds_dreamlily', 1], ['candy_dream', 1], ['keyring', 1], ['tape_cassette', 0.3]], 0);

defLoot('creature_lumenmoth', [1, 3], [['glow_dust', 10], ['memory_shard', 0.3]], 0);
defLoot('creature_wrongbird', [1, 2], [['small_meat_raw', 8], ['@wrongbird_inside', 2.2]], 0);
defLoot('creature_echo', [1, 3], [['bone', 4], ['memory_shard', 3], ['tape_cassette', 2], ['wristwatch', 1], ['id_badge', 1], ['necklace', 1], ['phone_dead', 1], ['static_jar', 0.5]], 0.1);
defLoot('creature_lifeguard', [1, 3], [['whistle', 4], ['swim_goggles', 3], ['coins', 4], ['wristwatch', 2], ['necklace', 2], ['key_generic', 2], ['toy_rubber_duck', 2], ['memory_shard', 1], ['photo_old', 1]], 0.1);
defLoot('creature_lamplighter', [1, 2], [['glow_dust', 6], ['lightbulb', 4], ['glass_shard', 3], ['candy_dream', 2], ['battery', 1]], 0);
defLoot('creature_plushkin', [2, 4], [['cotton_balls', 8], ['rag', 5], ['thread', 3], ['candy_bar', 2], ['candy_dream', 2], ['marbles', 1], ['memory_shard', 1], ['toy_rubber_duck', 0.6]], 0);
// sentinel and occupant leave no corpse (immortal); tables kept for completeness
defLoot('creature_sentinel', [0, 0], [], 1);
defLoot('creature_occupant', [0, 0], [], 1);

// plushkin gifts left near a player (wild) and things a tamed one "finds"
defLoot('plushkin_gift', [1, 1], [['candy_bar', 5], ['candy_dream', 3], ['battery', 4], ['toy_rubber_duck', 2], ['toy_car', 2], ['marbles', 2], ['crayons', 2], ['dice', 1], ['glowstick', 1.5], ['gum', 2], ['note', 3], ['almond_water', 1]], 0);
defLoot('plushkin_find', [1, 1], [['battery', 5], ['bandage', 3], ['candy_bar', 3], ['almond_water', 2], ['coins', 3], ['glowstick', 2], ['matches', 1], ['painkillers', 1], ['candy_dream', 2], ['memory_shard', 0.5], ['key_generic', 0.5], ['note', 1]], 0);
