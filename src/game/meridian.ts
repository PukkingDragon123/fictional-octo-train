// THE MERIDIAN FILE: the roguelike layer between runs. One small record in the
// browser (localStorage 'lp.meridian.v1', every access guarded) that outlives
// saves and deaths, next to the profile (src/game/profile.ts: research points,
// deaths, scans) it reads instead of copying:
//   specimens   every species: DISCOVERED (seen or scanned in any run) and its
//               STUDY (0..100: sightings, scans, its rule learned, kills, or
//               research points spent in the containment wing)
//   powers      a studied species yields one run modifier, HARVESTED for RP
//   loadout     up to slots() powers and one pet, applied when a run starts
//   milestones  power slots and starting kit earned by studies / runs / deaths
//   the run     what this run discovered and studied (the death report shows it)
// Achievements (src/game/achievements.ts) keep their records in the same file.
import { bus } from '../core/events';
import { allSpecies, species } from '../creatures/registry';
import { researchPoints, spendResearch, grantResearch } from './research';
import { stat, isUnlocked, unlock } from './profile';

const KEY = 'lp.meridian.v1';
/** the starter specimen: catalogued, studied and deployable from the first run */
export const STARTER_PET = 'mutt_roach';

export interface Loadout { powers: string[]; pet: string | null; petHat: string | null; petTint: string | null; cos: string[] }
export interface RunSummary { discovered: string[]; studied: string[]; ach: string[]; at: number }
interface FileData {
  v: 1;
  seen: Record<string, number>;
  study: Record<string, number>;
  /** harvested powers (by species key) */
  powers: string[];
  loadout: Loadout;
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
}

let data: FileData | null = null;
const blank = (): FileData => ({ v: 1, seen: {}, study: {}, powers: [], loadout: { powers: [], pet: null, petHat: null, petTint: null, cos: [] }, runs: 0, deaths: 0, ach: {}, n: {}, killers: [], milestones: [], last: null });
export function file(): FileData {
  if (data) return data;
  let d: FileData | null = null;
  try { const s = localStorage.getItem(KEY); if (s) d = JSON.parse(s); } catch { d = null; }
  const b = blank();
  if (!d || d.v !== 1 || typeof d !== 'object') d = b;
  for (const k of Object.keys(b) as (keyof FileData)[]) if ((d as any)[k] === undefined) (d as any)[k] = (b as any)[k];
  d.loadout = { ...b.loadout, ...(d.loadout || {}) };
  data = d;
  return d;
}
const subs = new Set<() => void>();
export function saveFile() {
  try { localStorage.setItem(KEY, JSON.stringify(file())); } catch { /* storage blocked: this visit only */ }
  for (const cb of subs) { try { cb(); } catch (e) { console.warn('meridian', e); } }
}
/** cb() after every change to the file; returns an unsubscribe */
export function onFile(cb: () => void): () => void { subs.add(cb); return () => subs.delete(cb); }
export function counter(k: string) { return file().n[k] || 0; }
export function bump(k: string, n = 1) { const f = file(); f.n[k] = (f.n[k] || 0) + n; saveFile(); return f.n[k]; }

// ================================================================== specimens
/** species the containment wing holds a cell for (not the survivor factions) */
export function catalogue(): any[] {
  return allSpecies().filter((s: any) => s.scan && !s.key.startsWith('tribe_')).sort((a: any, b: any) => (a.key === STARTER_PET ? -1 : b.key === STARTER_PET ? 1 : (a.threat ?? 0) - (b.threat ?? 0) || String(a.name).localeCompare(String(b.name))));
}
export function studyPct(key: string): number { return key === STARTER_PET ? 100 : Math.min(100, Math.round(file().study[key] || 0)); }
export function isDiscovered(key: string): boolean { return key === STARTER_PET || (file().seen[key] || 0) > 0 || isUnlocked('scan:creature:' + key) || (file().study[key] || 0) > 0; }
export function isStudied(key: string): boolean { return studyPct(key) >= 100; }

/** what this run filed (the death report and the containment wing's NEW tags read it) */
const run = { discovered: [] as string[], studied: [] as string[], ach: [] as string[], live: false };
export function runLog() { return run; }

export function discover(key: string) {
  if (!species(key) || key.startsWith('tribe_')) return;
  const f = file();
  const first = !isDiscovered(key);
  f.seen[key] = (f.seen[key] || 0) + 1;
  saveFile();
  if (first) { if (run.live && !run.discovered.includes(key)) run.discovered.push(key); bus.emit('specimenDiscovered', key); }
}
/** study points from the field (cap: what that source can teach on its own) */
export function addStudy(key: string, pts: number, cap = 100) {
  if (!species(key) || key.startsWith('tribe_') || key === STARTER_PET) return;
  const f = file();
  const was = f.study[key] || 0;
  if (was >= cap) return;
  if (!isDiscovered(key)) discover(key);
  f.study[key] = Math.min(100, Math.max(was, Math.min(cap, was + pts)));
  saveFile();
  if (was < 100 && f.study[key] >= 100) studied(key);
}
function studied(key: string) {
  if (run.live && !run.studied.includes(key)) run.studied.push(key);
  bus.emit('specimenStudied', key);
  checkMilestones();
}
/** RP to finish a specimen's study from the desk (cheaper the more the field taught) */
export function studyCost(key: string): number {
  const sp: any = species(key);
  const left = 100 - studyPct(key);
  return left <= 0 ? 0 : Math.max(2, Math.ceil(((8 + (sp?.threat ?? 1) * 6) * left) / 100));
}
export function researchStudy(key: string): boolean {
  if (!isDiscovered(key) || isStudied(key)) return false;
  if (!spendResearch(studyCost(key), 'study:' + key)) return false;
  file().study[key] = 100;
  saveFile();
  studied(key);
  return true;
}

// ================================================================== powers
/**
 * A harvested power is a perk on the survivor's body for the run: the existing
 * perks the systems already read (lightstep, steady, seams, nightowl, explorer)
 * and a few new ones (mx_*: body.ts, creatures/manager.ts, debt/hopper.ts,
 * ui/death/stats.ts).
 */
export const PERKS: Record<string, { name: string; text: string }> = {
  mx_calm: { name: 'Calm heart', text: 'Panic builds 40% slower and fades faster.' },
  mx_ears: { name: 'Through walls', text: 'Hear moving things through walls, 9 m out.' },
  mx_wind: { name: 'Second wind', text: 'Stamina refills 60% faster.' },
  mx_press: { name: 'Press bonus', text: 'The Remittance Press pays 15% more.' },
  mx_ledger: { name: 'Hazard pay', text: 'The death report pays 25% more RP.' },
  lightstep: { name: 'Light step', text: 'Your footsteps carry 30% less far.' },
  steady: { name: 'Steady pulse', text: 'Fresh wounds barely raise your pulse.' },
  seams: { name: 'Seam sight', text: 'Lucidity drains slower; the scanner reads better.' },
  nightowl: { name: 'Night owl', text: 'Long nights tire you less.' },
  explorer: { name: 'Explorer', text: 'Every new room lifts your mood.' },
};
export interface Power { key: string; species: string; name: string; perk: string; cost: number; text: string }
const P: Record<string, [string, string]> = {
  mutt_roach: ['Roach Grit', 'explorer'],
  hush: ['Hush Breath', 'mx_calm'], lumenmoth: ['Moth Lullaby', 'mx_calm'], lamplighter: ['Night-light', 'mx_calm'], plushkin: ['Stuffing', 'mx_calm'],
  echo: ['Echo Ears', 'mx_ears'], swivel: ['Swivel Neck', 'mx_ears'], plenum: ['Ceiling Ears', 'mx_ears'], gloam: ['Gloam Sense', 'mx_ears'], wrongbird: ['Wrong Song', 'mx_ears'],
  stammer: ['Stammer Step', 'lightstep'], stilt_doe: ['Doe Hooves', 'lightstep'], drywall_man: ['Plaster Feet', 'lightstep'], underlay: ['Carpet Crawl', 'lightstep'],
  ventling: ['Vent Lungs', 'mx_wind'], grinhound: ['Hound Lungs', 'mx_wind'], goodboy: ['Good Boy Energy', 'mx_wind'], moon_strider: ['Long Stride', 'mx_wind'], bubble_rabbit: ['Bunny Hop', 'mx_wind'],
  tallyman: ['Tally Sense', 'mx_press'], chess_rook: ['Rook Weight', 'mx_press'], occupant: ['Dead Weight', 'mx_press'], custodian: ['Custodial Rate', 'mx_press'],
  tithe: ["Tithe's Cut", 'mx_ledger'], surveyor: ['Survey Bonus', 'mx_ledger'], employee: ['Overtime', 'mx_ledger'], sentinel: ['Far Report', 'mx_ledger'],
  cowerling: ['Play Dead', 'steady'], lifeguard: ['Lifeguard Calm', 'steady'], davenport: ['Upholstered', 'steady'], hollow: ['Hollow Chest', 'steady'],
  mirrorling: ['Mirror Sight', 'seams'], moon_wisp: ['Wisp Eyes', 'seams'], still_life: ['Still Mind', 'seams'],
  lintel: ['Doorframe Nights', 'nightowl'], bubble_mite: ['Mite Hours', 'nightowl'], chess_knight: ['Knight Shift', 'nightowl'],
};
const FALLBACK: Record<string, string> = { peaceful: 'mx_calm', skittish: 'mx_wind', curious: 'explorer', neutral: 'steady', territorial: 'nightowl', hostile: 'mx_wind', stalker: 'mx_ears', ambush: 'lightstep', hazard: 'mx_press' };
export function powerOf(key: string): Power | null {
  const sp: any = species(key);
  if (!sp) return null;
  const [name, perk] = P[key] ?? [`${sp.name} Essence`, FALLBACK[sp.temperament] ?? 'explorer'];
  const cost = key === STARTER_PET ? 6 : 10 + (sp.threat ?? 1) * 6;
  return { key, species: key, name, perk, cost, text: PERKS[perk]?.text ?? '' };
}
export function ownsPower(key: string) { return file().powers.includes(key); }
export function canHarvest(key: string) { const pw = powerOf(key); return !!pw && isStudied(key) && !ownsPower(key) && researchPoints() >= pw.cost; }
export function harvest(key: string): boolean {
  const pw = powerOf(key);
  if (!pw || !isStudied(key) || ownsPower(key)) return false;
  if (!spendResearch(pw.cost, 'harvest:' + key)) return false;
  file().powers.push(key);
  saveFile();
  bus.emit('powerHarvested', key);
  return true;
}

// ================================================================== pets
/** the pets: the roach, and the game's own tameable companions once studied */
export function isPetSpecies(key: string) { const sp: any = species(key); return key === STARTER_PET || !!sp?.flags?.companion; }
export function canDeploy(key: string) { return isPetSpecies(key) && isStudied(key); }
export const PET_HATS: { key: string; name: string }[] = [{ key: 'hat_party', name: 'Party Hat' }, { key: 'hat_crown', name: 'Tiny Crown' }, { key: 'hat_hard', name: 'Hard Hat' }, { key: 'hat_bow', name: 'Big Bow' }];
export const PET_TINTS: { key: string; name: string; color: number }[] = [{ key: 'tint_teal', name: 'Sump Teal', color: 0x4affc8 }, { key: 'tint_pink', name: 'Bubblegum', color: 0xff6ad8 }, { key: 'tint_gold', name: 'Hazard Gold', color: 0xffc23a }, { key: 'tint_violet', name: 'Seam Violet', color: 0xa87aff }];
/** pet hats and tints are achievement rewards (profile unlock 'pet:<key>'); teal is the roach's own */
export function petItemOwned(key: string) { return key === 'tint_teal' || isUnlocked('pet:' + key); }

// ================================================================== milestones
export interface Milestone { key: string; name: string; text: string; need: string; done: () => boolean }
export const MILESTONES: Milestone[] = [
  { key: 'slot2', name: 'Second power slot', text: 'Carry two harvested powers into a run.', need: 'Study 3 specimens', done: () => studiedCount() >= 3 },
  { key: 'kit_torch', name: 'Issue torch', text: 'Every run starts with a flashlight in your pocket.', need: 'Start 3 runs', done: () => file().runs >= 3 },
  { key: 'grant10', name: 'Field grant', text: '+15 RP, once, for a catalogue worth funding.', need: 'Discover 10 specimens', done: () => discoveredCount() >= 10 },
  { key: 'kit_med', name: 'First-aid allowance', text: 'Every run starts with two bandages.', need: 'Die 5 times', done: () => deathCount() >= 5 },
  { key: 'slot3', name: 'Third power slot', text: 'Carry three harvested powers into a run.', need: 'Study 8 specimens', done: () => studiedCount() >= 8 },
];
export function studiedCount() { return catalogue().filter((s) => isStudied(s.key)).length; }
export function discoveredCount() { return catalogue().filter((s) => isDiscovered(s.key)).length; }
export function deathCount() { return Math.max(file().deaths, stat('deaths')); }
export function hasMilestone(k: string) { return file().milestones.includes(k); }
export function checkMilestones() {
  const f = file();
  let changed = false;
  for (const m of MILESTONES) {
    if (f.milestones.includes(m.key) || !m.done()) continue;
    f.milestones.push(m.key); changed = true;
    if (m.key === 'grant10') grantResearch(15, 'milestone:grant10');
    bus.emit('milestone', m);
  }
  if (changed) saveFile();
}
export function slots(): number { return 1 + (hasMilestone('slot2') ? 1 : 0) + (hasMilestone('slot3') ? 1 : 0); }

// ================================================================== the loadout
export function loadout(): Loadout { return file().loadout; }
/** why a power cannot go on (null = it can) */
export function equipBlock(key: string): string | null {
  const L = loadout(), pw = powerOf(key);
  if (!pw || !ownsPower(key)) return 'not harvested';
  if (L.powers.includes(key)) return null;
  const same = L.powers.map(powerOf).find((q) => q && q.perk === pw.perk);
  if (same) return `same effect as ${same.name}`;
  if (L.powers.length >= slots()) return 'no free slot';
  return null;
}
export function setPower(key: string, on: boolean): boolean {
  const L = loadout();
  if (!on) { L.powers = L.powers.filter((k) => k !== key); saveFile(); return true; }
  if (equipBlock(key)) return false;
  if (!L.powers.includes(key)) L.powers.push(key);
  saveFile();
  return true;
}
export function setPet(key: string | null): boolean {
  if (key && !canDeploy(key)) return false;
  loadout().pet = key; saveFile();
  return true;
}
export function setPetLook(hat: string | null, tint: string | null) { const L = loadout(); L.petHat = hat && petItemOwned(hat) ? hat : null; L.petTint = tint && petItemOwned(tint) ? tint : null; saveFile(); }
/** the cosmetics the survivor wears into the next intake (achievement suits: profile unlock 'cos:<key>') */
export function setWornCos(keys: string[]) { loadout().cos = keys.filter((k) => isUnlocked('cos:' + k)); saveFile(); }
export function wornCos(): string[] { return loadout().cos.filter((k) => isUnlocked('cos:' + k)); }
/** keep the loadout honest (slots lost, pets unstudied, items not owned) */
export function cleanLoadout() {
  const L = loadout();
  L.powers = L.powers.filter((k) => ownsPower(k)).slice(0, slots());
  if (L.pet && !canDeploy(L.pet)) L.pet = null;
  if (L.petHat && !petItemOwned(L.petHat)) L.petHat = null;
  if (L.petTint && !petItemOwned(L.petTint)) L.petTint = null;
}

// ================================================================== the run
/** the starting kit the milestones have earned */
export function startingKit(): string[] { return [...(hasMilestone('kit_torch') ? ['flashlight'] : []), ...(hasMilestone('kit_med') ? ['bandage', 'bandage'] : [])]; }
/** perks of the equipped powers */
export function loadoutPerks(): string[] { cleanLoadout(); return [...new Set(loadout().powers.map((k) => powerOf(k)?.perk).filter((x): x is string => !!x))]; }

let wired = false;
/** the field teaches: sightings, scans, rules, kills (installed once per page) */
export function wireStudy(isLocal: (p: any) => boolean) {
  run.live = true;
  if (wired) return;
  wired = true;
  bus.on('creatureSeen', (c: any) => { const k = c?.sp?.key; if (!k || c.tamedBy) return; discover(k); addStudy(k, 6, 30); });
  bus.on('scanEntry', (e: { kind: string; key: string; first: boolean }) => { if (e?.kind === 'creature') addStudy(e.key, e.first ? 40 : 20); });
  bus.on('ruleLearned', (r: { key: string }) => { if (r?.key) addStudy(r.key, 25); });
  bus.on('creatureKilled', (c: any, killer: any) => { if (c?.sp?.key && isLocal(killer) && !c.mem?.pet) addStudy(c.sp.key, 15); });
}
/** a run started (new world, not a loaded one) */
export function noteRunStart() { const f = file(); f.runs++; saveFile(); checkMilestones(); }
/** the local survivor died: the file remembers what this run filed and what ended it */
export function noteRunEnd(cause: string) {
  const f = file();
  f.deaths = Math.max(f.deaths + 1, stat('deaths'));
  f.killers = [...f.killers, cause].slice(-5);
  f.last = { discovered: [...run.discovered], studied: [...run.studied], ach: [...run.ach], at: Date.now() };
  saveFile();
  checkMilestones();
}
export function lastRun(): RunSummary | null { return file().last; }
