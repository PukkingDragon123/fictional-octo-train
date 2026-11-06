// THE MERIDIAN FILE: the roguelike record between runs. One small record in the
// browser (localStorage 'lp.meridian.v1', every access guarded) that outlives
// saves and deaths, next to the profile (src/game/profile.ts: research points,
// deaths, scans) it reads instead of copying:
//   seen        every species the survivor has met (seen or scanned in any run)
//   the codex   samples banked in the lab fridge, research per entry, the
//               completed entries, the tools they earned and the requisition
//               for the next run (src/game/codex.ts keeps that half)
//   runs        runs started, deaths, what ended them, what the last run filed
//   cos         the designs the unit wears into the next intake (dyes, visors, helmets...)
//   fit         the unit's chips and limbs (src/game/unitTree.ts, fitted in the unit room)
//   places      levels the units have walked, items the units have carried (the codex archive)
// Achievements (src/game/achievements.ts) keep their records in the same file.
import { bus } from '../core/events';
import { allSpecies, species } from '../creatures/registry';
import { stat, isUnlocked } from './profile';

const KEY = 'lp.meridian.v1';

export type SampleKind = 'tissue' | 'fluid' | 'spores' | 'residue';
/** a sample in the lab fridge: what it is, what it came from, how good it is (0..1) */
export interface Sample { id: number; kind: SampleKind; src: string; q: number; at: number }
export interface RunSummary { discovered: string[]; banked: number; lost: number; ach: string[]; at: number }
export interface FileData {
  v: 1;
  seen: Record<string, number>;
  runs: number;
  deaths: number;
  /** achievements: key -> earned at (ms) */
  ach: Record<string, number>;
  /** achievement counters */
  n: Record<string, number>;
  /** what ended the last runs (cause text), newest last */
  killers: string[];
  milestones: string[];
  last: RunSummary | null;
  /** the commendation suit dye worn into the next intake (profile unlock 'cos:<key>') */
  cos: string[];
  // ---- the codex (src/game/codex.ts)
  /** samples banked and not processed yet */
  bank: Sample[];
  /** samples ever banked, by entry */
  sampled: Record<string, number>;
  /** research progress by entry, 0..100 */
  research: Record<string, number>;
  /** entries completed (their prize paid) */
  done: string[];
  /** research tools earned: key -> level (1..3) */
  tools: Record<string, number>;
  /** the requisition: tools picked for the next run */
  req: string[];
  /** next sample id */
  sid: number;
  // ---- the unit room and the codex archive
  /** chips in sockets, limbs on slots (src/game/unitTree.ts) */
  fit: { chips: string[]; limbs: Record<string, string> };
  /** zones walked into, by key: times */
  places: Record<string, number>;
  /** items carried, by key: times seen in a pack */
  found: Record<string, number>;
}

let data: FileData | null = null;
const blank = (): FileData => ({
  v: 1, seen: {}, runs: 0, deaths: 0, ach: {}, n: {}, killers: [], milestones: [], last: null, cos: [],
  bank: [], sampled: {}, research: {}, done: [], tools: {}, req: [], sid: 1,
  fit: { chips: [], limbs: {} }, places: {}, found: {},
});
export function file(): FileData {
  if (data) return data;
  let d: any = null;
  try { const s = localStorage.getItem(KEY); if (s) d = JSON.parse(s); } catch { d = null; }
  const b = blank();
  if (!d || typeof d !== 'object' || d.v !== 1) d = b;
  // the old file kept the dye on its loadout
  if (!Array.isArray(d.cos) && Array.isArray(d.loadout?.cos)) d.cos = d.loadout.cos;
  for (const k of ['study', 'powers', 'loadout'] as const) delete d[k];
  for (const k of Object.keys(b) as (keyof FileData)[]) if (d[k] === undefined || d[k] === null && k !== 'last') d[k] = (b as any)[k];
  if (!Array.isArray(d.bank)) d.bank = [];
  data = d as FileData;
  return data;
}
const subs = new Set<() => void>();
export function saveFile() {
  try { localStorage.setItem(KEY, JSON.stringify(file())); } catch { /* storage blocked: this visit only */ }
  for (const cb of subs) { try { cb(); } catch (e) { console.warn('meridian', e); } }
}
/** a level a unit walked into, an item a unit carried (the codex archive's Places and Items) */
export function notePlace(key: string) { if (!key || key.startsWith('intro')) return; const f = file(); const first = !f.places[key]; f.places[key] = (f.places[key] || 0) + 1; saveFile(); if (first) bus.emit('placeFiled', key); }
export function noteFound(keys: string[]) { const f = file(); let n = 0; for (const k of keys) if (!f.found[k]) { f.found[k] = 1; n++; } if (n) saveFile(); }
/** cb() after every change to the file; returns an unsubscribe */
export function onFile(cb: () => void): () => void { subs.add(cb); return () => subs.delete(cb); }
export function counter(k: string) { return file().n[k] || 0; }
export function bump(k: string, n = 1) { const f = file(); f.n[k] = (f.n[k] || 0) + n; saveFile(); return f.n[k]; }

// ================================================================== species
/** the species the codex keeps an entry for (not the survivor factions) */
export function catalogue(): any[] {
  return allSpecies().filter((s: any) => s.scan && !s.key.startsWith('tribe_')).sort((a: any, b: any) => (a.threat ?? 0) - (b.threat ?? 0) || String(a.name).localeCompare(String(b.name)));
}
export function isDiscovered(key: string): boolean { return (file().seen[key] || 0) > 0 || isUnlocked('scan:creature:' + key) || (file().sampled[key] || 0) > 0; }
export function discoveredCount() { return catalogue().filter((s) => isDiscovered(s.key)).length; }
export function deathCount() { return Math.max(file().deaths, stat('deaths')); }

/** what this run filed (the death report reads it) */
const run = { discovered: [] as string[], banked: 0, ach: [] as string[], live: false };
export function runLog() { return run; }

export function discover(key: string) {
  if (key.startsWith('anom:')) { const f = file(); const first = !(f.seen[key] > 0); f.seen[key] = (f.seen[key] || 0) + 1; saveFile(); if (first) bus.emit('specimenDiscovered', key); return; }
  if (!species(key) || key.startsWith('tribe_')) return;
  const f = file();
  const first = !isDiscovered(key);
  f.seen[key] = (f.seen[key] || 0) + 1;
  saveFile();
  if (first) { if (run.live && !run.discovered.includes(key)) run.discovered.push(key); bus.emit('specimenDiscovered', key); }
}

// ================================================================== the unit's designs
/** the designs the unit wears into the next intake (researched or earned: profile unlock 'cos:<key>') */
export function setWornCos(keys: string[]) { file().cos = keys.filter((k) => isUnlocked('cos:' + k)); saveFile(); }
export function wornCos(): string[] { return file().cos.filter((k) => isUnlocked('cos:' + k)); }

// ================================================================== the run
let wired = false;
/** the field files what it meets: sightings and scans (installed once per page) */
export function wireField() {
  run.live = true;
  if (wired) return;
  wired = true;
  bus.on('creatureSeen', (c: any) => { const k = c?.sp?.key; if (k && !c.tamedBy) discover(k); });
  bus.on('scanEntry', (e: { kind: string; key: string }) => { if (e?.kind === 'creature') discover(e.key); });
}
/** a run started (new world, not a loaded one) */
export function noteRunStart() { const f = file(); f.runs++; run.banked = 0; saveFile(); bus.emit('meridianRun'); }
/** the local survivor died: the file remembers what this run filed and what ended it */
export function noteRunEnd(cause: string, lost = 0) {
  const f = file();
  f.deaths = Math.max(f.deaths + 1, stat('deaths'));
  f.killers = [...f.killers, cause].slice(-5);
  f.last = { discovered: [...run.discovered], banked: run.banked, lost, ach: [...run.ach], at: Date.now() };
  saveFile();
  bus.emit('meridianRun');
}
export function lastRun(): RunSummary | null { return file().last; }
