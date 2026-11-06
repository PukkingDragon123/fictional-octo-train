// Where the new things live. Zone generators own their spawn tables; this
// only adds the monster pass's species to zones that do not already list them
// (a generator that names a species keeps its own weight), right after the
// zone is generated, identically on every peer.
import { bus } from '../core/events';
import type { Zone } from '../world/zone';
import './rules';

const ADD: Record<string, [string, number][]> = {
  lobby: [['stammer', 1], ['plenum', 1.2], ['gloam', 0.9], ['surveyor', 0.7], ['still_life', 0.6]],
  house: [['still_life', 3], ['gloam', 0.6], ['stammer', 0.4]],
  suburbs: [['still_life', 1.2], ['gloam', 1], ['stammer', 0.8], ['surveyor', 0.4]],
  school: [['plenum', 1.4], ['still_life', 0.8], ['stammer', 0.6]],
  office: [['plenum', 1.6], ['stammer', 1], ['still_life', 0.5], ['surveyor', 0.4]],
  hospital: [['plenum', 1.2], ['stammer', 1.2], ['still_life', 0.8], ['gloam', 0.6]],
  stairwell: [['stammer', 1.4], ['gloam', 1.2]],
  parking: [['gloam', 1.4], ['stammer', 1], ['surveyor', 0.6]],
  tunnels: [['surveyor', 1.6], ['gloam', 1.6], ['plenum', 0.6]],
  pools: [['surveyor', 0.8], ['stammer', 0.5]],
  fields: [['surveyor', 0.6], ['stammer', 0.4]],
  mall: [['plenum', 0.9], ['still_life', 0.6], ['gloam', 0.6]],
  market: [['plenum', 0.9], ['gloam', 0.6]],
  lab: [['surveyor', 1.4], ['plenum', 0.9], ['still_life', 0.5]],
  corrupt: [['stammer', 1.5], ['still_life', 1], ['gloam', 1], ['plenum', 0.8]],
  server: [['stammer', 0.6], ['hush', 0.8]],
};
// the rule-bound pass (tallyman, mirrorling, lintel, tithe, hush) and the timid cowerlings
const RULES: Record<string, [string, number][]> = {
  lobby: [['tallyman', 0.4], ['mirrorling', 0.35], ['tithe', 0.5], ['cowerling', 1.2]],
  house: [['mirrorling', 0.8], ['lintel', 1], ['cowerling', 1]],
  suburbs: [['mirrorling', 0.5], ['cowerling', 1.2]],
  school: [['tallyman', 0.8], ['lintel', 0.8], ['cowerling', 0.8]],
  office: [['tallyman', 1], ['lintel', 0.6], ['tithe', 0.6]],
  hospital: [['tallyman', 0.7], ['mirrorling', 0.7], ['lintel', 0.7]],
  stairwell: [['hush', 1]],
  parking: [['tithe', 0.6], ['cowerling', 1]],
  tunnels: [['hush', 1.4], ['cowerling', 0.8]],
  pools: [['hush', 0.8]],
  fields: [['cowerling', 1.2]],
  mall: [['tithe', 1], ['mirrorling', 0.6], ['tallyman', 0.5]],
  market: [['tithe', 1.2]],
  lab: [['lintel', 0.6], ['hush', 0.7]],
  corrupt: [['hush', 1], ['mirrorling', 0.6], ['tallyman', 0.6]],
};
for (const k in RULES) ADD[k] = (ADD[k] || []).concat(RULES[k]);
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
/**
 * The new dimensions (src/world: shared floors) list these themselves; when a
 * dimension zone's key or name says which one it is and its table is missing
 * them, they are added here.
 */
const DIMS: [RegExp, [string, number][]][] = [
  [/chess|board/i, [['chess_rook', 2], ['chess_knight', 2]]],
  [/moon|lunar/i, [['moon_wisp', 3], ['moon_strider', 1.5]]],
  [/grass|meadow|future|field_?2|bubble/i, [['bubble_mite', 3], ['bubble_rabbit', 4]]],
];

bus.on('zoneGenerated', (z: Zone) => {
  if (!Array.isArray(z.spawnTable)) return;
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
