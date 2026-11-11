// THE SURVEY MAP'S UPGRADES (round 15), bought in the lab's research lattice
// (src/game/treeData.ts treeOffer: category 'device', lane 'Survey Map'). The
// map itself is the suit's survey plot on M (src/ui/map/surveyMap.ts): what the
// unit has seen of this level. The upgrades:
//   map_echo     ×3  survey echo: the suit maps everything within 5 / 9 / 14 tiles of the
//                    unit, through walls, as it walks (the fog lifts round it)
//   map_plant        facility overlay: exits, presses, checkpoints, generators, terminals
//                    and locks get their icons on the plot
//   map_ping     ×2  inhabitant pings: living things within 16 / 34 tiles blip on the plot
//                    (rank 2: their heading, and the dangerous ones ringed red)
//   map_pins         survey pins: click the plot to drop up to 8 numbered pins per level
//   map_trace        task trace: the tracked task's next step is marked on the plot
// rank(key) is how many ranks are owned (0 = none).
import { treeOffers, type TreeOffer } from './treeData';
import { hasUnlock } from './research';

export const MAP_ECHO_R = [0, 5, 9, 14];
export const MAP_PING_R = [0, 16, 34];

/** how many ranks of a map upgrade are owned */
export function mapRank(key: string, max = 3): number {
  let n = 0;
  for (let r = 1; r <= max; r++) if (hasUnlock(r === 1 ? key : `${key}~${r}`)) n = r; else break;
  return n;
}

const L = 'Survey Map';
const OFFERS: TreeOffer[] = [
  { key: 'map_echo', category: 'device', lane: L, title: 'Survey Echo', cost: [2, 4, 7], ranks: 3, item: 'tape_measure', alt: ['compass'],
    desc: 'The suit pings the walls round the unit and plots them, seen or not. The fog lifts in a ring as it walks.',
    gives: ['the plot fills in 5 tiles round the unit', 'the plot fills in 9 tiles round the unit', 'the plot fills in 14 tiles round the unit'] },
  { key: 'map_plant', category: 'device', lane: L, title: 'Facility Overlay', cost: 3, requires: ['map_echo'], item: 'map_lobby', alt: ['notebook'],
    desc: 'Company plans laid over the survey: exits, presses, checkpoints, generators, terminals and locks get their marks.',
    gives: 'facility icons on the survey map' },
  { key: 'map_ping', category: 'device', lane: L, title: 'Inhabitant Pings', cost: [4, 6], ranks: 2, requires: ['map_echo'], item: 'walkie_talkie', alt: ['binoculars'],
    desc: 'A motion return on the plot. Whatever is alive and moving nearby blips.',
    gives: ['inhabitants within 16 tiles blip on the map', 'within 34 tiles, with their heading; the dangerous ones ringed red'] },
  { key: 'map_pins', category: 'device', lane: L, title: 'Survey Pins', cost: 2, requires: ['map_echo'], item: 'marker', alt: ['chalk'],
    desc: 'Click the plot to drop a numbered pin. Eight per level, kept for the run.',
    gives: 'place up to 8 pins on each level\'s map' },
  { key: 'map_trace', category: 'device', lane: L, title: 'Task Trace', cost: 3, requires: ['map_plant'], item: 'compass', alt: ['marker'],
    desc: 'Dr. Calder\'s board writes to the plot: the tracked task\'s next step is marked where it is.',
    gives: 'the tracked task\'s next step on the map' },
];
treeOffers(OFFERS);
