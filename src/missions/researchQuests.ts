// Research missions: Meridian R&D uploads paid field work to the watch.
// Couriering a sealed case to another level, pressing a quota of scrip,
// scanning entities and logging anomalies, bringing back samples, permits and
// bribes that cost scrip to complete, field tests for the multi-tool. Most pay
// research points (RP, the persistent currency the watch's research tree
// spends); several repeat after a cooldown.
//
// Counters ("scans", "dep_value"...) are crew-wide tallies on the quest
// runtime (op 'qtally'); a quest captures a baseline when accepted so its
// objective counts only what happened after.
import { bus } from '../core/events';
import { G } from '../game/G';
import { op } from '../game/ops';
import { defQuest } from '../game/quests';
import { hasUnlock } from '../game/research';
import { defItem, itemDef } from '../items/item';
import { zoneSpec } from '../world/worldGraph';
import type { QuestX, QuestRuntime } from './questRuntime';
import type { MissionSystem } from './missions';

const RD = 'MERIDIAN R&D';
/** "after the first haul" in the contract; free survival (no contract) gets R&D work from the start */
const q = (d: QuestX) => {
  if (d.requires?.includes('first_haul')) {
    d.requires = d.requires.filter((r) => r !== 'first_haul');
    const w = d.when;
    d.when = (m) => (!m.enabled || !!Q()?.completed('first_haul')) && (w ? w(m) : true);
  }
  return defQuest(d);
};
const Q = () => G.missions?.quests as QuestRuntime | undefined;
const T = (c: string) => Q()?.tally(c) ?? 0;
const B = (k: string, c: string) => Q()?.base(k, c) ?? 0;
const H = () => G.clock?.hours ?? 0;
const fmt = (n: number) => Math.round(n).toLocaleString('en-GB');
/** progress of a tally since the quest was accepted */
const since = (k: string, c: string, n: number) => () => (T(c) - B(k, c)) / n;
const flagCount = (m: MissionSystem, prefix: string) => { let k = 0; for (const f of m.flags) if (f.startsWith(prefix)) k++; return k; };
const carrying = (pred: (key: string) => boolean) => { const p = G.local; return p ? p.allItems().filter((it: any) => pred(it.key) && !p.isWorn(it)).length : 0; };
const tagged = (tag: string) => (key: string) => !!itemDef(key).tags?.includes(tag);

// ---------------------------------------------------------------- the tallies
const tally = (c: string, d = 1) => op('qtally', { c, d });
bus.on('scanned', (c: any) => { tally('scans'); if ((c?.sp?.threat ?? 0) >= 3) tally('scan_threat'); });
bus.on('anomalyLogged', () => tally('anomalies'));
bus.on('watchFab', () => tally('fab'));
bus.on('laserCut', () => tally('laser'));
bus.on('consumed', (p: any, key: string) => { if (p?.isLocal && itemDef(key).cat === 'food') tally('meals'); });
// the press is host business: every peer hears 'deposited', only the host counts it
bus.on('deposited', (e: { keys?: string[]; value?: number }) => {
  if (G.role === 'client' || !e) return;
  if (e.value) tally('dep_value', Math.round(e.value));
  const tags = new Set<string>();
  for (const k of e.keys || []) { for (const t of itemDef(k).tags || []) tags.add(t); if ((itemDef(k).value ?? 0) >= 300) tally('dep_big'); }
  for (const t of tags) tally('dept:' + t);
});

// ---------------------------------------------------------------- the courier's case
defItem({
  key: 'sealed_case', name: 'Sealed Sample Case', cat: 'misc', weight: 2.2, grid: [2, 2], noStack: true, rare: true,
  tags: ['mission', 'meridian'],
  desc: 'A grey Meridian case with a wax-and-wire seal and a barcode where the handle should be. Something inside ticks, slowly, like it is counting you.',
  model: (mb) => {
    mb.box(0, 0, 0, 0.32, 0.11, 0.22, 'i_tin', { color: 0x5a616a });
    mb.box(0, 0.11, 0, 0.33, 0.012, 0.012, 'i_tin', { color: 0xd8b02a });
    mb.box(0, 0.112, 0.07, 0.06, 0.01, 0.03, 'i_tin', { color: 0x9a2a22, emissive: 0.4 });
  },
});

/** where couriers go: other levels, picked in turn */
const DESTS = ['office', 'pools', 'stairwell', 'fields', 'mall', 'tunnels', 'depot', 'hospital', 'school'];
/** where the current courier run goes (a zone key) */
export const courierDest = () => destOf();
const destOf = () => { const list = DESTS.filter((k) => zoneSpec(k)); return list[(B('rd_courier', 'dest') | 0) % Math.max(1, list.length)] || 'office'; };
const zoneName = (k: string) => zoneSpec(k)?.name || k;

// ================================================================ the missions
q({
  key: 'rd_calibrate', title: 'Calibration Sweep', giver: RD, category: 'research', repeatable: true, cooldownH: 6, requires: ['first_haul'],
  desc: 'R&D wants field data to calibrate the anomaly scanner. Scan two entities with the watch. Any entity. From a respectful distance, ideally.',
  when: () => hasUnlock('watch_scan'),
  begin: () => ({ scans: T('scans') }),
  objectives: [{ id: 'scan', text: 'Scan 2 entities with the watch', check: since('rd_calibrate', 'scans', 2) }],
  reward: { rp: 4 },
});

q({
  key: 'rd_anomaly', title: 'Anomaly Survey', giver: RD, category: 'research', repeatable: true, cooldownH: 12, requires: ['first_haul'],
  desc: 'Anomalous objects distort the scanner sweep. Find three on the SCAN function and log them. Do not lick them.',
  when: () => hasUnlock('watch_scan'),
  begin: () => ({ n: T('anomalies') }),
  objectives: [{ id: 'log', text: 'Log 3 anomalies (SCAN function)', check: () => (T('anomalies') - B('rd_anomaly', 'n')) / 3 }],
  reward: { rp: 5 },
});

q({
  key: 'rd_threat', title: 'Threat Assessment', giver: RD, category: 'research', requires: ['first_haul'],
  desc: 'Our threat tables are out of date because the people who updated them are out of date. Complete a full scan of an entity rated THREAT 3 or worse.',
  when: () => hasUnlock('watch_scan'),
  begin: () => ({ n: T('scan_threat') }),
  objectives: [{ id: 'scan', text: 'Scan an entity rated threat 3+', check: since('rd_threat', 'scan_threat', 1) }],
  reward: { rp: 6, scrip: 250 },
});

q({
  key: 'rd_samples', title: 'Sample Return', giver: RD, category: 'research', repeatable: true, cooldownH: 12, requires: ['first_haul'],
  desc: 'Bring R&D two anomalous samples: dust that glows, pixels that failed, shards that remember. The watch takes custody when you hand them in.',
  objectives: [{ id: 'carry', text: 'Carry 2 anomalous samples', check: () => carrying(tagged('anomalous')) / 2 }],
  cost: { items: [['#anomalous', 2]] },
  reward: { rp: 6, scrip: 400 },
});

q({
  key: 'rd_press_proof', title: 'Press Proof', giver: RD, category: 'research', requires: ['first_haul'],
  desc: 'R&D is testing how the press values sentiment. Feed it one piece of jewellery: a ring, a chain, a necklace. Watch the needle.',
  begin: () => ({ n: T('dept:jewelry') }),
  objectives: [{ id: 'press', text: 'Press a piece of jewellery', check: since('rd_press_proof', 'dept:jewelry', 1) }],
  reward: { rp: 3, scrip: 150 },
});

q({
  key: 'rd_quota', title: 'Quota', giver: 'REMITTANCE LEDGER', category: 'research', repeatable: true, cooldownH: 10, requires: ['first_haul'],
  desc: 'Throughput is research too. Remit another 1,500 scrip through any press machine and R&D will log the yield.',
  begin: () => ({ v: T('dep_value') }),
  objectives: [{ id: 'remit', get text() { const left = Math.max(0, 1500 - (T('dep_value') - B('rd_quota', 'v'))); return `Remit 1,500 scrip (${fmt(left)} to go)`; }, check: () => (T('dep_value') - B('rd_quota', 'v')) / 1500 }],
  reward: { rp: 5 },
} as QuestX);

q({
  key: 'rd_courier', title: 'Courier Run', giver: RD, category: 'research', repeatable: true, cooldownH: 8, requires: ['first_haul'],
  get desc() { return `Carry a sealed sample case to ${zoneName(destOf())} and hand it over there. Do not open it. Do not let it get wet. Do not answer it.`; },
  begin: () => ({ dest: Q()?.rec('rd_courier')?.n ?? 0, h: H() }),
  give: [['sealed_case', 1]],
  objectives: [
    { id: 'carry', get text() { return `Carry the case to ${zoneName(destOf())}`; }, check: () => G.local?.zoneKey === destOf() && carrying((k) => k === 'sealed_case') > 0 },
  ],
  cost: { items: [['sealed_case', 1]] },
  reward: { rp: 6, scrip: 300 },
} as QuestX);

q({
  key: 'rd_expedition', title: 'Expedition', giver: RD, category: 'research', repeatable: true, cooldownH: 24, requires: ['first_haul'],
  desc: 'Every level you walk into is a level we can bill for. Reach two levels you have never set foot in.',
  begin: (m) => ({ n: flagCount(m, 'visit:') }),
  objectives: [{ id: 'go', text: 'Reach 2 new levels', check: (m) => (flagCount(m, 'visit:') - B('rd_expedition', 'n')) / 2 }],
  reward: { rp: 5 },
});

q({
  key: 'rd_licence', title: 'Survey Licence', giver: RD, category: 'permit', requires: ['first_haul'],
  desc: 'Cartography is a licensed function. Pay the licence fee and R&D uploads the CARTOGRAPHY function to your watch: a map that draws itself as you walk.',
  when: () => !hasUnlock('watch_map'),
  objectives: [{ id: 'auth', text: 'Authorise the transfer', check: () => true }],
  cost: { scrip: 600 },
  reward: { rp: 1, unlock: ['watch_map'] },
});

q({
  key: 'rd_permit_torch', title: 'Tool Permit', giver: RD, category: 'permit', requires: ['installment_1'],
  desc: 'Debtors may not carry a light source without a permit. Buy one and R&D flashes the WRIST TORCH firmware onto your watch.',
  when: () => !hasUnlock('tool_torch'),
  objectives: [{ id: 'auth', text: 'Authorise the transfer', check: () => true }],
  cost: { scrip: 900 },
  reward: { rp: 1, unlock: ['tool_torch'] },
});

q({
  key: 'rd_clerk', title: 'Clerical Error', giver: 'ACCOUNTS (UNOFFICIAL)', category: 'bribe', requires: ['first_haul'],
  desc: 'Someone in Accounts can lose a penalty for a fee. Wire the fee, give them an hour, and the ledger will discover a clerical error in your favour.',
  when: () => (G.debt?.s?.missed ?? 0) > 0 && !G.debt?.cleared,
  begin: () => ({ h: H() }),
  objectives: [{ id: 'wait', text: 'Give Accounts an hour', check: () => (H() - B('rd_clerk', 'h')) / 1 }],
  cost: { scrip: 400 },
  reward: { scrip: 900 },
});

q({
  key: 'rd_meals', title: 'Calorie Log', giver: RD, category: 'research', repeatable: true, cooldownH: 24, requires: ['first_haul'],
  desc: 'Your new calorie counter needs a baseline. Eat two meals with the watch on. Anything counts. R&D does not ask what.',
  when: () => hasUnlock('watch_calories'),
  begin: () => ({ n: T('meals') }),
  objectives: [{ id: 'eat', text: 'Eat 2 meals', check: since('rd_meals', 'meals', 2) }],
  reward: { rp: 3 },
});

q({
  key: 'rd_laser_test', title: 'Field Test: Cutter', giver: RD, category: 'research', requires: ['first_haul'],
  desc: 'The laser cutter is a prototype. R&D needs it used on something. Cut three pieces of furniture apart with it (arm it on the TOOL function, then point and click).',
  when: () => hasUnlock('tool_laser'),
  begin: () => ({ n: T('laser') }),
  objectives: [{ id: 'cut', text: 'Cut 3 pieces of furniture apart', check: since('rd_laser_test', 'laser', 3) }],
  reward: { rp: 4 },
});

q({
  key: 'rd_fab_test', title: 'Field Test: Fabricator', giver: RD, category: 'research', requires: ['first_haul'],
  desc: 'The field fabricator folds simple things out of what you carry. Make anything with it (FAB function) and send R&D the telemetry.',
  when: () => hasUnlock('tool_fab'),
  begin: () => ({ n: T('fab') }),
  objectives: [{ id: 'fab', text: 'Fabricate something with the watch', check: since('rd_fab_test', 'fab', 1) }],
  reward: { rp: 3 },
});
