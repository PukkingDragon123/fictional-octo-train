// The player's profile on this browser: things unlocked across runs (occupations,
// traits, cosmetic extras) and a few lifetime stats. It outlives saves and deaths.
import { bus } from '../core/events';

export interface Profile { v: 1; unlocked: string[]; stats: Record<string, number>; }

const KEY = 'noclip.profile';
let cache: Profile | null = null;

export function profile(): Profile {
  if (cache) return cache;
  let p: Profile | null = null;
  try { const s = localStorage.getItem(KEY); if (s) p = JSON.parse(s); } catch { /* storage blocked: in-memory only */ }
  cache = p && p.v === 1 ? { v: 1, unlocked: p.unlocked || [], stats: p.stats || {} } : { v: 1, unlocked: [], stats: {} };
  return cache;
}
function persist() { try { localStorage.setItem(KEY, JSON.stringify(profile())); } catch { /* ignore */ } }

/** Unlock ids are namespaced: 'job:<occupationKey>', 'trait:<traitKey>', anything else is free-form. */
export function isUnlocked(id: string): boolean { return profile().unlocked.includes(id); }

/** Returns true the first time; emits bus 'unlocked' (id) so the UI can celebrate it. */
export function unlock(id: string): boolean {
  const p = profile();
  if (p.unlocked.includes(id)) return false;
  p.unlocked.push(id);
  persist();
  bus.emit('unlocked', id);
  return true;
}

export function addStat(key: string, n = 1) { const p = profile(); p.stats[key] = (p.stats[key] || 0) + n; persist(); }
export function stat(key: string) { return profile().stats[key] || 0; }

/** dev/testing helper */
export function resetProfile() { cache = { v: 1, unlocked: [], stats: {} }; persist(); }
