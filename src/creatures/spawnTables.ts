// Where the new things live. Zone generators own their spawn tables; this
// only adds the inhabitant passes' species to zones that do not already list them
// (a generator that names a species keeps its own weight), right after the
// zone is generated, identically on every peer.
import { bus } from '../core/events';
import type { Zone } from '../world/zone';
import './rules';

/** species removed in the round-15 cull (old saves may still name them: they are skipped on load) */
export const RETIRED = new Set(['grinhound', 'goodboy', 'stilt_doe', 'tallyman', 'lintel', 'drywall_man', 'employee', 'occupant', 'custodian', 'gloam', 'echo', 'cowerling', 'ventling', 'plenum', 'underlay', 'swivel', 'stammer', 'wrongbird', 'mirrorling', 'surveyor', 'tithe', 'davenport', 'hush', 'sentinel']);
// Round 15 (the cull): the old monster pass and the rule-bound pass are gone (their species were
// removed); the zone generators now list the new natives themselves (the Driller, the Hum Possum,
// the Partition Hermit). These are the passes that are still added on top.
const ADD: Record<string, [string, number][]> = {
  lobby: [['still_life', 0.6]],
  house: [['still_life', 3]],
  suburbs: [['still_life', 1.2]],
  school: [['still_life', 0.8]],
  office: [['still_life', 0.5]],
  hospital: [['still_life', 0.8], ['mulcher', 0.4]],
  mall: [['still_life', 0.6]],
  lab: [['still_life', 0.5]],
  corrupt: [['still_life', 1]],
};
// the inhabitants pass (src/creatures/lore.ts): Mulchers in anything furnished, Stilt Gulls
// where the rooms are big and open, the Seated where people sat and asked, the King deepest down
const INHABIT: Record<string, [string, number][]> = {
  lobby: [['mulcher', 1.4], ['stilt_gull', 0.45], ['seated', 0.2], ['paper_grazer', 1.2]],
  house: [['mulcher', 1.6], ['paper_grazer', 0.6]],
  suburbs: [['mulcher', 1], ['stilt_gull', 0.3]],
  school: [['mulcher', 0.6]],
  office: [['mulcher', 1], ['seated', 0.6], ['paper_grazer', 0.6]],
  hospital: [['mulcher', 0.8], ['seated', 0.5]],
  mall: [['mulcher', 1], ['stilt_gull', 0.6]],
  pools: [['stilt_gull', 1.2]],
  parking: [['stilt_gull', 0.8]],
  fields: [['stilt_gull', 0.9]],
  lab: [['seated', 0.5]],
  showroom: [['mulcher', 1.2]],
  undercroft: [['king_in_yellow', 0.15], ['seated', 0.6], ['mulcher', 0.5]],
  corrupt: [['king_in_yellow', 0.1], ['mulcher', 0.6]],
};
for (const k in INHABIT) ADD[k] = (ADD[k] || []).concat(INHABIT[k]);
// the Ledge pass: the Gummy Bear and its bees (src/creatures/species/gummy_bear.ts, bumble_bee.ts),
// the Tallow Pigeons; strays in the softer levels; and a third native for the thin dimensions
// (round 14: the Bee Keepers; the Queen Bee is never rolled, she lives in her comb: queen_bee.ts spawns her)
const LEDGE: [string, number][] = [['bumble_bee', 3], ['gummy_bear', 1.3], ['tallow_pigeon', 1.8], ['bee_keeper', 0.45]];
const STRAYS: Record<string, [string, number][]> = {
  fields: [['bumble_bee', 0.7], ['gummy_bear', 0.22]],
  meadow: [['bumble_bee', 1], ['gummy_bear', 0.2]],
  corrupt: [['gummy_bear', 0.2], ['tallow_pigeon', 0.5]],
  suburbs: [['tallow_pigeon', 0.5]],
  parking: [['tallow_pigeon', 0.4]],
  chess: [['chess_bishop', 2]],
  moon: [['moon_calf', 2.5]],
};
for (const k in STRAYS) ADD[k] = (ADD[k] || []).concat(STRAYS[k]);
// the predators (round 14): Whip Rats in the dark levels and the dark edges of Level 0
// (src/creatures/species/whip_rat.ts), and the Strider, rare, only in the Yellow Room (strider.ts)
const PREDATORS: Record<string, [string, number][]> = {
  tunnels: [['whip_rat', 1.5]],
  undercroft: [['whip_rat', 1.1]],
  server: [['whip_rat', 1.0]],
  stairwell: [['whip_rat', 0.9]],
  lobby: [['whip_rat', 0.45], ['strider', 0.3]],
  parking: [['whip_rat', 0.4]],
};
for (const k in PREDATORS) ADD[k] = (ADD[k] || []).concat(PREDATORS[k]);
// the Ball House kids (src/creatures/species/timmy.ts): they live in the Ball House (z_ballhouse.ts
// lists them itself) and drift out to the playground, the mall's food court and the suburbs' parks
const TIMMY: Record<string, [string, number][]> = {
  playground: [['timmy', 1.2]],
  mall: [['timmy', 0.25]],
  suburbs: [['timmy', 0.15]],
  school: [['timmy', 0.2]],
};
for (const k in TIMMY) ADD[k] = (ADD[k] || []).concat(TIMMY[k]);
// round 16: the Stalker, the unit's own copy (src/creatures/species/stalker.ts): rare, Level 0 and the
// beige levels that look like it
const STALKER: Record<string, [string, number][]> = {
  lobby: [['stalker', 0.3]],
  annex: [['stalker', 0.28]],
  office: [['stalker', 0.12]],
};
for (const k in STALKER) ADD[k] = (ADD[k] || []).concat(STALKER[k]);
// round 17: the Gaunt Wolf (rare, the big open levels: src/creatures/species/gaunt_wolf.ts) and the Parasite
// Salamander (the damp dark levels, where the dead lie: salamander.ts)
const GROTESQUE: Record<string, [string, number][]> = {
  fields: [['gaunt_wolf', 0.12], ['battering_hare', 0.1]], parking: [['gaunt_wolf', 0.08], ['battering_hare', 0.05]], meadow: [['gaunt_wolf', 0.14], ['battering_hare', 0.12]], suburbs: [['gaunt_wolf', 0.05], ['battering_hare', 0.05]],
  homestead: [['battering_hare', 0.08]],
  undercroft: [['parasite_salamander', 0.6]], tunnels: [['parasite_salamander', 0.5]], pools: [['parasite_salamander', 0.55]], hospital: [['parasite_salamander', 0.25]],
};
for (const k in GROTESQUE) ADD[k] = (ADD[k] || []).concat(GROTESQUE[k]);
// the damp levels (round 15): Spore Rat packs (most hatch from a Fungus Mind's nodes), Land Jellyfish
// on the ceilings, Bacteria Masses where the dead lie, Sea Worms scavenging round the pools. The
// Fungus Mind and the Whale Corpse are set pieces their own files place (fungus_mind.ts, whale_corpse.ts).
const DAMP: Record<string, [string, number][]> = {
  undercroft: [['spore_rat', 0.8], ['land_jelly', 0.9], ['bacteria_mass', 0.7], ['sea_worm', 0.7]],
  tunnels: [['spore_rat', 1.0], ['land_jelly', 0.8], ['bacteria_mass', 0.5], ['sea_worm', 0.4]],
  pools: [['land_jelly', 1.4], ['sea_worm', 1.3], ['spore_rat', 0.35]],
  hospital: [['bacteria_mass', 0.4], ['land_jelly', 0.25]],
  parking: [['bacteria_mass', 0.25], ['spore_rat', 0.3]],
  stairwell: [['land_jelly', 0.4]],
  server: [['spore_rat', 0.3]],
};
for (const k in DAMP) ADD[k] = (ADD[k] || []).concat(DAMP[k]);
// Westgate Station (round 16, src/world/gen/z_subway.ts lists its own; the Worm Train, the Token Whelk and
// the Stile Mantis are set pieces their files place): larvae stray into the Service Tunnels, a Ringer up to the Depot
const SUBWAY: Record<string, [string, number][]> = {
  tunnels: [['worm_larva', 0.35]],
  depot: [['ringer', 0.5]],
};
for (const k in SUBWAY) ADD[k] = (ADD[k] || []).concat(SUBWAY[k]);
// the Plunge (round 17, src/world/gen/z_plunge.ts lists its own; the Gulper is a set piece pl_pool.ts places):
// tadpoles, frog piranhas and balloon puffers have got through into the Poolrooms
const PLUNGE: Record<string, [string, number][]> = {
  pools: [['gulper_tadpole', 0.8], ['frog_piranha', 0.5], ['balloon_puffer', 0.6]],
};
for (const k in PLUNGE) ADD[k] = (ADD[k] || []).concat(PLUNGE[k]);
/**
 * The new dimensions (src/world: shared floors) list these themselves; when a
 * dimension zone's key or name says which one it is and its table is missing
 * them, they are added here.
 */
const DIMS: [RegExp, [string, number][]][] = [
  [/chess|board/i, [['chess_rook', 2], ['chess_knight', 2], ['chess_pawn', 2.2], ['chess_clock', 1.2], ['chess_case', 1.4]]],
  [/moon|lunar/i, [['moon_wisp', 3], ['moon_strider', 1.5]]],
  [/grass|meadow|future|field_?2|bubble/i, [['bubble_mite', 3], ['bubble_rabbit', 4]]],
];

bus.on('zoneGenerated', (z: Zone) => {
  if (!Array.isArray(z.spawnTable)) return;
  // species retired in the round-15 cull never come back through an old table (or an old save's zone)
  for (let i = z.spawnTable.length - 1; i >= 0; i--) if (RETIRED.has(z.spawnTable[i][0])) z.spawnTable.splice(i, 1);
  // the Ledge (however its generator names it) always gets its natives, even from an empty table
  if (/ledge/i.test(z.key + ' ' + (z.name || '') + ' ' + ((z.meta as any)?.dimension ?? ''))) {
    for (const [k, w] of LEDGE) if (!z.spawnTable.some(([s]) => s === k)) z.spawnTable.push([k, w]);
    if (!(z.creatureCap > 0)) z.creatureCap = 7;
  }
  const add = ADD[z.key];
  if (add && z.spawnTable.length) for (const [k, w] of add) if (!z.spawnTable.some(([s]) => s === k)) z.spawnTable.push([k, w]);
  if (ADD[z.key]) return;
  const id = z.key + ' ' + (z.name || '') + ' ' + ((z.meta as any)?.dimension ?? '');
  for (const [re, list] of DIMS) {
    if (!re.test(id)) continue;
    for (const [k, w] of list) if (!z.spawnTable.some(([s]) => s === k)) z.spawnTable.push([k, w]);
    break;
  }
});
