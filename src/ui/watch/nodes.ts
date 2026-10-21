// The watch's own research branch: functions uploaded to the wrist computer
// and the multi-tool modules bolted onto it. Other systems file their nodes
// under 'blueprint', 'recipe', 'cyber', 'tame' and 'cosmetic'; the watch's
// R&D page shows every branch in one tree.
import { defNode, researchNode } from '../../game/research';

/** branches as the R&D page lists them (tabs), with a 4-letter label */
export const BRANCHES: { key: string; label: string; name: string }[] = [
  { key: 'watch', label: 'WTCH', name: 'WATCH FUNCTIONS' },
  { key: 'blueprint', label: 'BLPR', name: 'BLUEPRINTS' },
  { key: 'recipe', label: 'RCPE', name: 'RECIPES & KNOWLEDGE' },
  { key: 'cyber', label: 'CYBR', name: 'CYBERWARE' },
  { key: 'tame', label: 'TAME', name: 'DOMINION' },
  { key: 'cosmetic', label: 'COSM', name: 'COSMETICS' },
];

const W = (key: string, title: string, cost: number, desc: string, requires?: string[], icon?: string) =>
  defNode({ key, branch: 'watch', title, cost, desc, requires, icon });

// ---- the base function (free, always owned)
W('watch_quests', 'QUEST UPLINK', 0, 'The one thing the band was built to do for you: receive work. Quests, objectives, rewards.', undefined, 'Q');
// ---- navigation
W('watch_map', 'CARTOGRAPHY', 3, 'A map that draws itself as you walk. Quest targets, friends and doors marked. Click to drop a marker.', undefined, 'MP');
W('watch_survey', 'DEEP SURVEY', 5, 'Sonar mapping: the map fills in the rooms around you through walls.', ['watch_map'], 'DS');
// ---- sensors
// (the scan system, src/scan, may file its own 'watch_scan': theirs wins)
if (!researchNode('watch_scan')) W('watch_scan', 'ANOMALY SCAN', 3, 'Radar sweep for entities and anomalous objects. Scan creatures for the codex, log anomalies for R&D. Scans earn RP.', undefined, 'SC');
W('watch_radar', 'THREAT RADAR', 4, 'Buzzes your wrist and flashes the glance view when something hostile is close. Works with the watch down.', ['watch_scan'], 'TR');
W('watch_signals', 'SIGNAL TRACE', 3, 'A radio receiver: tune frequencies, find transmitters by bearing. The presses beacon on 77.7 MHz.', ['watch_scan'], 'SG');
// ---- body
W('watch_vitals', 'BIOMONITOR', 2, 'Health, blood, temperature, pulse, lucidity and your worst moodles at a glance.', undefined, 'BI');
W('watch_calories', 'CALORIE COUNT', 2, 'Hunger, thirst and energy as numbers: calories in, calories burned, litres short.', ['watch_vitals'], 'KC');
W('watch_bp', 'BLOOD PRESSURE', 3, 'A cuff in the band squeezes your wrist: systolic, diastolic, shock warning.', ['watch_vitals'], 'BP');
W('watch_diag', 'DIAGNOSIS AI', 5, 'A body map of every wound with the AI\'s triage advice, and TREAT from the watch.', ['watch_bp'], 'AI');
W('watch_mind', 'MIND MONITOR', 3, 'Breathing, mood, panic, lasting conditions, medication and the breathing coach.', ['watch_vitals'], 'MD');
// ---- records
W('watch_log', 'LOGBOOK', 2, 'Skills, the entity codex and your file.', undefined, 'LG');
W('watch_notes', 'FIELD NOTES', 2, 'Every entity here obeys one rule. The rules you have learned (by scanning, watching, surviving) typed up; the rest redacted until you do.', undefined, 'FN');
// ---- the multi-tool
W('tool_torch', 'WRIST TORCH', 3, 'A white LED in the bezel. F toggles it when you have no other light.', undefined, 'TO');
W('tool_beam', 'SCANNER BEAM', 4, 'Scans reach twice as far and finish twice as fast, with a visible beam.', ['watch_scan', 'tool_torch'], 'BM');
W('tool_laser', 'LASER CUTTER', 6, 'Turns the watch into a multi-tool: a cutting laser for furniture, doors and anything that bleeds. Arm it on TOOL, point, click.', ['tool_torch'], 'LZ');
W('tool_weld', 'ARC WELDER', 5, 'The laser at low power: welds metal. Builders want this.', ['tool_laser'], 'WD');
W('tool_cell', 'GRAPHENE CELL', 4, 'Doubles the multi-tool\'s charge and recharge.', ['tool_laser'], 'CE');
W('tool_fab', 'FIELD FABRICATOR', 5, 'Craft simple things on the move: the watch folds what you carry into what you need (FAB function).', ['tool_laser'], 'FB');
