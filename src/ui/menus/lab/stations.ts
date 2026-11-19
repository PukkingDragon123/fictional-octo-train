// THE LAB FROM ZERO (round 19): a new operator's lab starts nearly empty: a bare control room, the link chair in unit
// room 4, the desk and Dr. Calder's telephone. Every station is FUNDED (in the researcher's dollars) and BUILT, one at a
// time, as the runs earn it: the codex archive once something has been scanned, the research lattice once research
// points have come in, the sample fridge and its benches once a sample has been banked, the talent bench after the
// first run, the requisition board, the commissary, the emote jukebox, decorating. Each build is a short moment (the
// crates come open, the station rises, sparks, the install cinematic). Saves from before keep everything they had.
//   built(k)  can(k) -> '' | why not   buildStation(k)  onLab(fn)
import { bus } from '../../../core/events';
import { isUnlocked, unlock, stat, unlockedIds } from '../../../game/profile';
import { dollars, spendDollars } from '../../../game/economy/money';
import { file } from '../../../game/meridian';
import { bankTotal } from '../../../game/economy/matter';
import type { IconKind } from '../../machine/decor';
import { hasUnlock } from '../../../game/research';

export type StationKey = 'archive' | 'lattice' | 'fridge' | 'talent' | 'req' | 'commissary' | 'jukebox' | 'decorate' | 'filament' | 'printer' | 'clone';
export interface StationDef {
  key: StationKey; name: string; cost: number; icon: IconKind;
  /** what it does, in a few words (the install's line) */
  gives: string;
  /** progress that makes it buildable */
  ready: () => boolean;
  /** what is still missing, in a few words */
  need: string;
}
const runs = () => file().runs ?? 0;
export const STATIONS: StationDef[] = [
  { key: 'archive', name: 'Codex archive', cost: 40, icon: 'clipboard', gives: 'every scan and sample, on file', ready: () => unlockedIds('scan:').length > 0 || runs() > 0, need: 'scan something in a run' },
  { key: 'lattice', name: 'Research lattice', cost: 60, icon: 'gear', gives: 'research points into kit and recipes', ready: () => stat('rp_total') > 0 || stat('rp') > 0, need: 'earn research points' },
  { key: 'fridge', name: 'Sample fridge', cost: 30, icon: 'jar', gives: 'samples into research points', ready: () => (file().bank?.length ?? 0) > 0 || isUnlocked('lab:lattice'), need: 'bring back a sample' },
  { key: 'talent', name: 'Talent bench', cost: 50, icon: 'key', gives: 'gifts and flaws for the next unit', ready: () => runs() > 0, need: 'finish a run' },
  { key: 'req', name: 'Requisition board', cost: 30, icon: 'wrench', gives: 'research tools for the next run', ready: () => isUnlocked('lab:archive'), need: 'build the archive' },
  { key: 'commissary', name: 'Commissary', cost: 25, icon: 'coin', gives: 'collectibles for the lab', ready: () => runs() > 0, need: 'finish a run' },
  { key: 'jukebox', name: 'Emote jukebox', cost: 35, icon: 'radio', gives: 'emotes for the wheel', ready: () => isUnlocked('lab:commissary'), need: 'build the commissary' },
  { key: 'decorate', name: 'Decorating', cost: 20, icon: 'lamp', gives: 'arrange the lab your way', ready: () => isUnlocked('lab:commissary'), need: 'build the commissary' },
  // round 20: the fab bay in the control room (src/ui/menus/fab): the press only takes now; these two make things
  { key: 'filament', name: 'Filament maker', cost: 45, icon: 'reel', gives: 'banked matter into spools', ready: () => runs() > 0 || bankTotal() > 0, need: 'bank matter at the press' },
  { key: 'printer', name: 'Printer', cost: 70, icon: 'gear', gives: 'spools into researched patterns', ready: () => isUnlocked('lab:filament'), need: 'build the filament maker' },
  // round 21: the clone vat (src/game/clone): researched on the lattice first; a spare body for the next death
  { key: 'clone', name: 'Clone vat', cost: 90, icon: 'jar', gives: 'a spare body: the next death walks out of the vat', ready: () => hasUnlock('clone_vat'), need: 'research the clone vat' },
];
/** round 20: stations an old save never had, so the round 19 catch-up does not hand them over (they are built) */
const NEW_IN_20 = new Set<StationKey>(['filament', 'printer', 'clone']);
export const station = (k: StationKey) => STATIONS.find((s) => s.key === k)!;

/** saves from before this round keep everything: any progress on file means the lab was already built */
function migrate() {
  if (isUnlocked('lab:v19')) return;
  unlock('lab:v19');
  const old = runs() > 0 || stat('rp_total') > 0 || unlockedIds('scan:').length > 0 || stat('dollars_total') > 150;
  if (old) for (const s of STATIONS) if (!NEW_IN_20.has(s.key)) unlock('lab:' + s.key);
}
export function built(k: StationKey): boolean { migrate(); return isUnlocked('lab:' + k); }
/** '' when it can be built now; otherwise what is missing ('built' when it is already up) */
export function can(k: StationKey): string {
  if (built(k)) return 'built';
  const s = station(k);
  if (!s.ready()) return s.need;
  if (dollars() < s.cost) return `$${s.cost}`;
  return '';
}
/** fund and build it (the caller plays the moment); false when it cannot be built now */
export function buildStation(k: StationKey): boolean {
  if (can(k)) return false;
  const s = station(k);
  if (!spendDollars(s.cost, 'lab:' + k)) return false;
  unlock('lab:' + k);
  bus.emit('labBuilt', k);
  return true;
}
export function onLab(fn: (k: StationKey) => void): () => void { return bus.on('labBuilt', fn); }
