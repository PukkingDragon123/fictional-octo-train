// Steam achievements, earned from game events on the bus. Every unlock is recorded locally first
// (localStorage 'noclip.steamach', mirrored to the save folder on desktop) and then sent to Steam
// through the desktop wrapper (steamworks.js) when Steam is running. Unlocks made offline, in a browser
// build or before Steam was up are sent again at the next start (steamSync), so nothing is lost.
// Without Steam the band shows the unlock as a commendation line, the same as the Meridian commendations.
import { bus } from '../core/events';
import { G } from '../game/G';
import { STEAM_ACHIEVEMENTS, type SteamAchDef } from './achievementDefs';
import { steamAchieve, steamStatus, steamSync, type SteamStatus } from './desktop';

const KEY = 'noclip.steamach';
const DEF = new Map(STEAM_ACHIEVEMENTS.map((a) => [a.api, a]));
/** Meridian commendations (src/game/achievements.ts) that are also Steam achievements */
const FROM_COMMENDATION: Record<string, string> = { custody: 'ACH_CUSTODY', peer_review: 'ACH_CODEX', noise: 'ACH_NOISE', hr_compliant: 'ACH_HR' };
const STATION_ACH: Record<string, string> = { archive: 'ACH_LAB_ARCHIVE', lattice: 'ACH_LAB_LATTICE', fridge: 'ACH_LAB_FRIDGE', talent: 'ACH_LAB_TALENT', clone: 'ACH_LAB_CLONE' };

function load(): Record<string, number> { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } }
function store(o: Record<string, number>) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch { /* storage blocked */ } }
export function steamUnlocked(api: string): boolean { return !!load()[api]; }
export function steamAchList(): (SteamAchDef & { at: number })[] { const o = load(); return STEAM_ACHIEVEMENTS.map((a) => ({ ...a, at: o[a.api] || 0 })); }

let status: SteamStatus = { on: false, appId: 0 };
export function steamOn() { return status.on; }

/** unlock (once): local record, then Steam; quiet = no band line (the commendation already showed one) */
export function unlockSteam(api: string, quiet = false): boolean {
  const a = DEF.get(api);
  if (!a) return false;
  const o = load();
  if (o[api]) return false;
  o[api] = Date.now();
  store(o);
  void steamAchieve(api);
  bus.emit('steamAchievement', a);
  if (!quiet && !status.on) {
    void import('../game/achievements').then((m) => m.toast({ name: a.name }, 'ACHIEVEMENT')).catch(() => undefined);
  }
  return true;
}

const isLocal = (x: unknown): boolean => {
  const L = G?.local as { id?: string } | undefined;
  if (!L) return false;
  if (x == null) return !G?.net; // solo events without an owner
  if (x === L) return true;
  if (typeof x === 'string') return x === L.id;
  return (x as { id?: string }).id === L.id;
};

async function censusDone(): Promise<boolean> {
  const [{ catalogue }, { isUnlocked }] = await Promise.all([import('../game/meridian'), import('../game/profile')]);
  const all = catalogue();
  return all.length > 0 && all.every((s: { key: string }) => isUnlocked('scan:creature:' + s.key));
}
async function labCheck(quiet = false) {
  const S = await import('../ui/menus/lab/stations');
  let any = false, every = true;
  for (const s of S.STATIONS) {
    const b = S.built(s.key);
    any ||= b; every &&= b;
    if (b && STATION_ACH[s.key]) unlockSteam(STATION_ACH[s.key], quiet);
  }
  if (any) unlockSteam('ACH_LAB_FIRST', quiet);
  if (S.built('filament' as never) && S.built('printer' as never)) unlockSteam('ACH_LAB_PRINTER', quiet);
  if (every) unlockSteam('ACH_LAB_ALL', quiet);
}

let wired = false;
/** listen for the events (once per page; called at boot) */
export function wireSteam() {
  if (wired) return;
  wired = true;
  bus.on('enterZone', (_z: unknown, p: unknown) => { if (p && isLocal(p)) unlockSteam('ACH_FIRST_LINK'); });
  bus.on('questComplete', (k: string) => { if (k === 'first_signal') unlockSteam('ACH_DEAD_AIR'); });
  bus.on('crafted', (p: unknown) => { if (isLocal(p)) unlockSteam('ACH_FIRST_CRAFT'); });
  bus.on('handCrafted', (p: unknown) => { if (isLocal(p)) unlockSteam('ACH_FIRST_CRAFT'); });
  bus.on('scanEntry', (e: { kind?: string }) => {
    if (e?.kind !== 'creature') return;
    unlockSteam('ACH_FIRST_SCAN');
    void censusDone().then((ok) => { if (ok) unlockSteam('ACH_CENSUS'); }).catch(() => undefined);
  });
  bus.on('death', (p: unknown) => { if (isLocal(p)) unlockSteam('ACH_UNIT_LOST'); });
  bus.on('cloneRevived', (p: unknown) => { if (!p || isLocal(p)) unlockSteam('ACH_CLONE_REVIVE'); });
  bus.on('labBuilt', () => { void labCheck().catch(() => undefined); });
  bus.on('researchUnlocked', () => unlockSteam('ACH_RESEARCH'));
  bus.on('bldWelded', (_z: unknown, _pc: unknown, _o: unknown, by: unknown) => { if (isLocal(by)) unlockSteam('ACH_BUILD'); });
  bus.on('bldUpgraded', (_z: unknown, _pc: unknown, by: unknown) => { if (isLocal(by)) unlockSteam('ACH_UPGRADE'); });
  bus.on('cropHarvested', (p: unknown) => { if (isLocal(p)) unlockSteam('ACH_HARVEST'); });
  bus.on('dishPlated', (p: unknown) => { if (isLocal(p)) unlockSteam('ACH_COOK'); });
  bus.on('tamed', (p: unknown) => { if (isLocal(p)) unlockSteam('ACH_TAME'); });
  bus.on('stitched', (e: { by?: string }) => { if (isLocal(e?.by ?? null)) unlockSteam('ACH_SURGEON'); });
  bus.on('pressJackpot', (e: { by?: string }) => { if (isLocal(e?.by ?? null)) unlockSteam('ACH_JACKPOT'); });
  bus.on('debtChanged', (s: { cleared?: boolean; on?: boolean }) => { if (s?.cleared && G?.local) unlockSteam('ACH_PAID'); });
  bus.on('runEnded', () => unlockSteam('ACH_WAY_OUT'));
  bus.on('facilityFound', () => unlockSteam('ACH_FACILITY'));
  bus.on('achievement', (a: { key?: string }) => { const s = a?.key && FROM_COMMENDATION[a.key]; if (s) unlockSteam(s, true); });
}

/** boot: wire the events, find Steam, carry over what was earned before (commendations, lab), resend offline unlocks */
export async function startSteam() {
  wireSteam();
  status = await steamStatus();
  try {
    const { file } = await import('../game/meridian');
    for (const [k, api] of Object.entries(FROM_COMMENDATION)) if (file().ach?.[k]) unlockSteam(api, true);
  } catch { /* no file yet */ }
  try { await labCheck(true); } catch { /* lab not loaded */ }
  if (status.on) {
    const have = Object.keys(load()).filter((k) => DEF.has(k));
    if (have.length) await steamSync(have);
  }
}
