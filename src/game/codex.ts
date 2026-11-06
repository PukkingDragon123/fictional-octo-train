// THE CODEX: the research half of the Meridian file (src/game/meridian.ts).
// One loop: collect samples in a run (src/research/collect.ts) -> bank them
// (the Remittance Press tubes them to the lab, or carry them out of the
// building) -> process them at the research lab's benches (the menu's
// mini-games, src/ui/menus/rooms/research*.ts) -> each entry's research
// climbs to 100% -> a COMPLETE entry pays its prize: a research tool the
// subject can carry into the next run (src/research/tools.ts) and RP; whole
// codex milestones pay suit dyes, requisition slots, a collectible and RP.
//   entries()            every species (the scanner's catalogue) + six zone anomalies
//   entryState(key)      unknown | discovered | sampled | researching | complete
//   codexStats()         counts and the overall percentage the lab shows
//   bankSample(..)       a sample arrives in the fridge
//   processSample(id, s) a sample was worked at the benches (score 0..1)
//   TOOLS / toolLevel / reqSlots / req / setReq / requisitionKit
import { bus } from '../core/events';
import { species } from '../creatures/registry';
import { grantResearch } from './research';
import { unlock } from './profile';
import { file, saveFile, catalogue, isDiscovered, discover, discoveredCount, deathCount, runLog, type Sample, type SampleKind } from './meridian';
import { addOwned } from '../ui/menus/deco/store';

export type { Sample, SampleKind };
export type ToolKey = 'dart' | 'pinger' | 'lure' | 'foam' | 'filter' | 'inhaler' | 'kit2';
export interface ToolDef { key: ToolKey; name: string; item: string; text: string; passive?: boolean; color: number; count: (lvl: number) => number }
/** the research tools: real in-game items (src/content/items/research.ts) with working effects (src/research/tools.ts) */
export const TOOLS: Record<ToolKey, ToolDef> = {
  dart: { key: 'dart', name: 'Sedative Dart', item: 'tool_dart', color: 0xe8443a, count: (l) => l + 1, text: 'Fire at the nearest creature in front of you: it drops for ten seconds. Sample it while it sleeps.' },
  pinger: { key: 'pinger', name: 'Sonar Pinger', item: 'tool_pinger', color: 0x3ad8ff, count: (l) => Math.max(1, l - 1), text: 'Three pings. Each one shows everything that moves within 18 m, through walls, for eight seconds.' },
  lure: { key: 'lure', name: 'Lure Jar', item: 'tool_lure', color: 0xc8e040, count: (l) => l, text: 'Smash it a few metres ahead: it rattles and stinks for 25 seconds, and everything nearby goes to look.' },
  foam: { key: 'foam', name: 'Seam-Sealant Foam', item: 'tool_foam', color: 0xf0e8c8, count: (l) => Math.max(1, l - 1), text: 'Two blasts of expanding foam. Whatever stands in front of you is glued to the floor for six seconds.' },
  filter: { key: 'filter', name: 'Hazmat Filter', item: 'tool_filter', color: 0xe8c228, passive: true, count: () => 1, text: 'Carry it: most sickness never gets in, and what does clears twice as fast.' },
  inhaler: { key: 'inhaler', name: 'Calm-Inhaler', item: 'tool_inhaler', color: 0x7ab8ff, count: (l) => Math.max(1, l - 1), text: 'Three puffs. Each one takes the panic out of you and keeps it out for a while.' },
  kit2: { key: 'kit2', name: 'Sample Kit Mk II', item: 'tool_kit2', color: 0x4affb0, passive: true, count: () => 1, text: 'Carry it: field sampling windows are wider, samples come out cleaner, and a body gives two.' },
};
export const TOOL_KEYS = Object.keys(TOOLS) as ToolKey[];
export const TOOL_ITEMS = new Set(TOOL_KEYS.map((k) => TOOLS[k].item));

// ================================================================== entries
export interface Entry {
  key: string; kind: 'species' | 'anomaly'; name: string; code: string; cls: string; notes: string[]; threat: number;
  /** the tool its completion earns */
  tool: ToolKey;
  /** the sample kinds it gives */
  gives: SampleKind[];
}
/** the six zone anomalies (the `anomaly` hook on items, src/content/items/anomaly.ts) */
export const ANOMALIES: { key: string; name: string; code: string; cls: string; notes: string[]; threat: number; tool: ToolKey }[] = [
  { key: 'glow', name: 'Lepidopteran Glow', code: 'AN-01 // LUMINANCE', cls: 'Bioluminescent residue', threat: 0, tool: 'lure', notes: ['Scale dust from the big pale moths. It glows for days without a source.', 'Light emitted is cold: no heat at any wavelength we can measure.', 'Moths come to it. So do other things that like moths.', 'Mixed with water it paints marks that outlast the paint.'] },
  { key: 'static', name: 'Liquid Static', code: 'AN-02 // SIGNAL FLUID', cls: 'Electromagnetic fluid', threat: 1, tool: 'pinger', notes: ['Pours like water. Sounds like a dead channel.', 'It charges batteries left in it. It does not like being looked at.', 'Every reading of it returns the reading before.', 'In a sealed jar it hums a frequency the scanner can follow.'] },
  { key: 'memory', name: 'Crystallised Memory', code: 'AN-03 // RECALL', cls: 'Mnemonic crystal', threat: 1, tool: 'inhaler', notes: ['Slivers of recollection. Held to the light they show a room you remember.', 'Two researchers looking at the same shard see two different birthdays.', 'Prolonged handling lowers heart rate. The subjects call it calm.', 'Ground fine, it settles the nerves of anyone who breathes it.'] },
  { key: 'pixel', name: 'Unrendered Matter', code: 'AN-04 // NULL TEXTURE', cls: 'Failed geometry', threat: 2, tool: 'foam', notes: ['A cube of the world that failed to load. Exactly the wrong colour from every angle.', 'It has mass but no surface. Instruments slide off it.', 'Where it touches the floor the floor forgets it was a floor.', 'Sealant sets around it in seconds and never fully cures.'] },
  { key: 'signal', name: 'Signal Crystal', code: 'AN-05 // RESONANCE', cls: 'Resonant quartz', threat: 1, tool: 'pinger', notes: ['Violet quartz that hums when a radio is keyed nearby.', 'Louder near exits. Louder still near what guards them.', 'Its hum bends around walls the way sound should not.', 'Cut thin and driven, it pings back everything that moves.'] },
  { key: 'checksum', name: 'Checksum Fluid', code: 'AN-06 // CORRECTION', cls: 'Corrective agent', threat: 2, tool: 'filter', notes: ['Not a liquid. The injectors hold it anyway.', 'It halts simulation corruption completely, once, in one body.', 'Exposed tissue returns to an earlier, healthier state.', 'A filter soaked in it keeps sickness from taking hold.'] },
];
const TEMP_TOOL: Record<string, ToolKey> = { peaceful: 'inhaler', skittish: 'lure', curious: 'pinger', neutral: 'kit2', territorial: 'foam', hostile: 'dart', stalker: 'pinger', ambush: 'foam', hazard: 'filter' };
const TOOL_OVERRIDE: Record<string, ToolKey> = { hush: 'inhaler', echo: 'pinger', lumenmoth: 'lure', ventling: 'filter', surveyor: 'kit2', grinhound: 'dart', cowerling: 'kit2', stammer: 'dart', still_life: 'foam' };

let cache: Entry[] | null = null; let cacheN = -1;
export function entries(): Entry[] {
  const sp = catalogue();
  if (cache && cacheN === sp.length) return cache;
  const out: Entry[] = sp.map((s: any) => ({
    key: s.key, kind: 'species' as const, name: String(s.name), code: String(s.code ?? ''), cls: String(s.scan?.cls ?? 'Entity'), notes: [...(s.scan?.notes ?? [])], threat: s.threat ?? 1,
    tool: TOOL_OVERRIDE[s.key] ?? TEMP_TOOL[s.temperament] ?? 'kit2',
    gives: (/fung|spore|mould|mold|moss/i.test(String(s.scan?.cls ?? '')) ? ['spores', 'tissue'] : s.flags?.immortal || s.temperament === 'hazard' ? ['residue'] : ['tissue', 'fluid']) as SampleKind[],
  }));
  for (const a of ANOMALIES) out.push({ key: 'anom:' + a.key, kind: 'anomaly', name: a.name, code: a.code, cls: a.cls, notes: a.notes, threat: a.threat, tool: a.tool, gives: ['residue'] });
  cache = out; cacheN = sp.length;
  return out;
}
export function entry(key: string): Entry | null { return entries().find((e) => e.key === key) ?? null; }
export function entryName(key: string): string { return entry(key)?.name ?? (species(key) as any)?.name ?? key; }

export type EntryState = 'unknown' | 'discovered' | 'sampled' | 'researching' | 'complete';
export function researchPct(key: string): number { return Math.max(0, Math.min(100, Math.round(file().research[key] || 0))); }
export function sampledCount(key: string): number { return file().sampled[key] || 0; }
export function isComplete(key: string): boolean { return file().done.includes(key); }
export function entryKnown(key: string): boolean { return key.startsWith('anom:') ? (file().seen[key] || 0) > 0 || sampledCount(key) > 0 : isDiscovered(key); }
export function entryState(key: string): EntryState {
  if (isComplete(key)) return 'complete';
  if (researchPct(key) > 0) return 'researching';
  if (sampledCount(key) > 0) return 'sampled';
  return entryKnown(key) ? 'discovered' : 'unknown';
}
/** how many of an entry's notes the research has revealed (all of them when complete) */
export function notesShown(key: string): number { const e = entry(key); if (!e) return 0; return isComplete(key) ? e.notes.length : Math.floor((researchPct(key) / 100) * e.notes.length); }

export interface CodexStats { total: number; discovered: number; sampled: number; researched: number; complete: number; pct: number; samples: number }
export function codexStats(): CodexStats {
  const es = entries();
  let discovered = 0, sampled = 0, researched = 0, complete = 0, sum = 0;
  for (const e of es) {
    const s = entryState(e.key);
    if (s !== 'unknown') discovered++;
    if (sampledCount(e.key) > 0) sampled++;
    if (s === 'researching' || s === 'complete') researched++;
    if (s === 'complete') complete++;
    sum += researchPct(e.key);
  }
  return { total: es.length, discovered, sampled, researched, complete, pct: es.length ? Math.round(sum / es.length) : 0, samples: file().bank.length };
}

// ================================================================== samples
export const KIND_NAME: Record<SampleKind, string> = { tissue: 'Tissue', fluid: 'Fluid', spores: 'Spores', residue: 'Residue' };
/** the bench games a sample kind goes through (src/ui/menus/rooms/researchBench.ts) */
export type BenchGame = 'pipette' | 'centrifuge' | 'microscope' | 'dissect' | 'sequence';
export const KIND_GAMES: Record<SampleKind, BenchGame[]> = {
  tissue: ['dissect', 'microscope', 'sequence'],
  fluid: ['pipette', 'centrifuge', 'sequence'],
  spores: ['pipette', 'microscope', 'sequence'],
  residue: ['centrifuge', 'microscope', 'sequence'],
};
export function bankSample(kind: SampleKind, src: string, q: number): Sample {
  const f = file();
  const s: Sample = { id: f.sid++, kind, src, q: Math.max(0.05, Math.min(1, q)), at: Date.now() };
  f.bank.push(s);
  f.sampled[src] = (f.sampled[src] || 0) + 1;
  saveFile();
  discover(src);
  runLog().banked++;
  bus.emit('sampleBanked', s);
  return s;
}
export function bank(): Sample[] { return file().bank; }
export function sampleById(id: number): Sample | null { return file().bank.find((s) => s.id === id) ?? null; }

export interface Processed { gain: number; before: number; after: number; spoiled: boolean; completed: boolean; prize: Prize | null }
export interface Prize { tool: ToolKey; level: number; rp: number; text: string }
/** the sample was worked at the benches: score 0..1 (the games' average), spoiled = it broke */
export function processSample(id: number, score: number, spoiled: boolean): Processed | null {
  const f = file();
  const i = f.bank.findIndex((s) => s.id === id);
  if (i < 0) return null;
  const s = f.bank[i];
  f.bank.splice(i, 1);
  const before = researchPct(s.src);
  const base = { tissue: 58, fluid: 48, spores: 52, residue: 52 }[s.kind];
  const gain = spoiled ? 6 : Math.max(4, Math.round(base * (0.55 + 0.45 * s.q) * (0.3 + 0.95 * Math.max(0, Math.min(1.1, score)))));
  f.research[s.src] = Math.min(100, (f.research[s.src] || 0) + gain);
  const after = researchPct(s.src);
  bump('processed');
  if (spoiled) bump('spoiled');
  saveFile();
  bus.emit('sampleProcessed', { s, score, spoiled, gain, after });
  let prize: Prize | null = null;
  if (after >= 100 && !f.done.includes(s.src)) prize = complete(s.src);
  return { gain: after - before, before, after, spoiled, completed: !!prize, prize };
}
function bump(k: string) { const f = file(); f.n[k] = (f.n[k] || 0) + 1; }
/** the entry is complete: its prize */
function complete(key: string): Prize {
  const f = file();
  const e = entry(key)!;
  f.done.push(key);
  const tk = e.tool;
  const was = f.tools[tk] || 0;
  const level = Math.min(3, was + 1);
  f.tools[tk] = level;
  const rp = (6 + e.threat * 3) * (was >= 3 ? 2 : 1);
  saveFile();
  grantResearch(rp, 'codex:' + key);
  const t = TOOLS[tk];
  const text = was === 0 ? `${t.name} issued` : was >= 3 ? `${t.name} at full issue · double RP` : `${t.name} upgraded to issue ${level}`;
  const prize = { tool: tk, level, rp, text };
  bus.emit('codexComplete', { key, prize });
  checkMilestones();
  return prize;
}

// ================================================================== the requisition
export function toolLevel(k: ToolKey): number { return file().tools[k] || 0; }
export function toolUnlocked(k: ToolKey): boolean { return toolLevel(k) > 0; }
export function reqSlots(): number { return 1 + (hasMilestone('codex4') ? 1 : 0) + (hasMilestone('codex10') ? 1 : 0); }
export function req(): ToolKey[] { const f = file(); return (f.req as ToolKey[]).filter((k) => TOOLS[k] && toolUnlocked(k)).slice(0, reqSlots()); }
export function setReq(k: ToolKey, on: boolean): boolean {
  const f = file();
  const cur = req();
  if (!on) { f.req = cur.filter((q) => q !== k); saveFile(); return true; }
  if (!toolUnlocked(k) || cur.includes(k)) return cur.includes(k);
  if (cur.length >= reqSlots()) return false;
  f.req = [...cur, k];
  saveFile();
  return true;
}
/** the items a fresh run starts with: the milestones' allowance and the requisitioned tools */
export function startingKit(): string[] {
  const out = [...(hasMilestone('kit_torch') ? ['flashlight'] : []), ...(hasMilestone('kit_med') ? ['bandage', 'bandage'] : [])];
  for (const k of req()) { const t = TOOLS[k]; for (let i = 0; i < t.count(toolLevel(k)); i++) out.push(t.item); }
  return out;
}

// ================================================================== milestones
export interface Milestone { key: string; name: string; text: string; need: string; done: () => boolean; rp?: number; cos?: string; deco?: string }
const completeCount = () => file().done.length;
export const MILESTONES: Milestone[] = [
  { key: 'codex1', name: 'First entry filed', text: '+10 RP for the first finished page.', need: 'Complete 1 codex entry', done: () => completeCount() >= 1, rp: 10 },
  { key: 'grant10', name: 'Field grant', text: '+15 RP, once, for a catalogue worth funding.', need: 'Discover 10 entries', done: () => discoveredCount() >= 10, rp: 15 },
  { key: 'kit_torch', name: 'Issue torch', text: 'Every run starts with a flashlight in your pocket.', need: 'Start 3 runs', done: () => file().runs >= 3 },
  { key: 'codex4', name: 'Second requisition slot', text: 'Carry two research tools into a run.', need: 'Complete 4 codex entries', done: () => completeCount() >= 4 },
  { key: 'kit_med', name: 'First-aid allowance', text: 'Every run starts with two bandages.', need: 'Die 5 times', done: () => deathCount() >= 5 },
  { key: 'codex10', name: 'Third requisition slot', text: 'Carry three research tools. Lab White suit dye.', need: 'Complete 10 codex entries', done: () => completeCount() >= 10, cos: 'suit_lab' },
  { key: 'codex_half', name: 'Half the codex', text: 'Codex Teal suit dye, a pinned specimen for your rooms and +40 RP.', need: 'Complete half the codex', done: () => completeCount() >= Math.ceil(entries().length / 2), cos: 'suit_codex', deco: 'd_moth', rp: 40 },
  { key: 'codex_all', name: 'The complete codex', text: 'Curator Gold suit dye and +100 RP. There is nothing left to learn. Probably.', need: 'Complete every codex entry', done: () => completeCount() >= entries().length, cos: 'suit_curator', rp: 100 },
];
export function hasMilestone(k: string) { return file().milestones.includes(k); }
export function checkMilestones() {
  const f = file();
  let changed = false;
  for (const m of MILESTONES) {
    if (f.milestones.includes(m.key) || !m.done()) continue;
    f.milestones.push(m.key); changed = true;
    if (m.rp) grantResearch(m.rp, 'milestone:' + m.key);
    if (m.cos) unlock('cos:' + m.cos);
    if (m.deco) { try { addOwned(m.deco, 1); } catch { /* storage blocked */ } }
    bus.emit('milestone', m);
  }
  if (changed) saveFile();
}
bus.on('meridianRun', () => checkMilestones());
bus.on('specimenDiscovered', () => checkMilestones());

/** the anomaly entry an item carries (null = not anomalous) */
export function anomalyEntry(anomaly: string | undefined): string | null { return anomaly && ANOMALIES.some((a) => a.key === anomaly) ? 'anom:' + anomaly : null; }
