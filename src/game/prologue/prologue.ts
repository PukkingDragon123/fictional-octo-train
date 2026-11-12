// The prologue: the first time the game starts (and again from the replay
// entry, or ?prologue). There is no link room any more: the first run starts
// straight away, and its intro (src/game/intro.ts) is the whole prologue:
//   signal  the link comes up on the unit like an old set switching on,
//           the shock, the CRT collapse (./signal.ts)
//   intake  the old drag cinematic through the unit's own eyes: hauled down
//           the processing wing, beaten, the band driven through the wrist,
//           shoved through the taped wall
//   wake    Level 0, in the normal game view: it gets up, and Dr. Calder's
//           hologram flickers onto your screen for the tutorial
// Skippable at any moment (Esc, the plate, a pad's Start): a skip goes
// straight to the wake.
//
//   prologueWanted()   first launch (localStorage), ?prologue forces, ?noprologue skips
//   runPrologue()      start the first run here (no reload: the loader is already up)
//   replayPrologue()   from a menu: reload into it
import type { ChipVoice } from '../../social/chipVoice';
import { randomAppearance } from '../../entities/humanRig';

const KEY = 'noclip.prologue.seen';
/** (kept for callers) where the run's intro used to pick up after the old link room */
export const INTRO_FROM_KEY = 'noclip.intro.from';
export const CALDER_VOICE: ChipVoice = { base: 205, wave: 'pulse', duty: 0.3, wobble: 0.06, range: 3.4, bits: 4, vol: 0.85, grain: 'vg_fstd' } as ChipVoice;

export function prologueWanted(): boolean {
  const q = new URLSearchParams(location.search);
  if (q.has('prologue')) return q.get('prologue') !== '0';
  if (q.has('noprologue') || q.has('quick') || q.has('gallery') || q.has('sandbox') || q.has('surgery')) return false;
  if (navigator.webdriver && !q.has('prologue')) return false;
  try { return !localStorage.getItem(KEY); } catch { return false; }
}
/** from a menu: back to the start of the prologue */
export function replayPrologue() {
  const u = new URL(location.href);
  u.searchParams.set('prologue', '1');
  location.href = u.toString();
}
/** the first link has been played on this browser (the title's New unit runs it the first time) */
export function prologueSeen(): boolean { try { return !!localStorage.getItem(KEY); } catch { return true; } }
function markSeen() { try { localStorage.setItem(KEY, '1'); } catch { /* private mode */ } }

const FIRST = ['Robin', 'Sam', 'Alex', 'Jordan', 'Casey', 'Morgan', 'Riley', 'Quinn', 'Noor', 'Emil', 'Ines', 'Tomas', 'Aiko', 'Mara', 'Felix', 'Rosa', 'Theo', 'Wren', 'Priya', 'Kofi', 'Elena', 'Otis', 'Hana', 'Cyril'];
const LAST = ['Okonkwo', 'Varga', 'Lindqvist', 'Moreau', 'Halloran', 'Petrov', 'Nakamura', 'Silva', 'Brennan', 'Kowalski', 'Haugen', 'Duarte', 'Novak', 'Reyes', 'Lund', 'Ashdown', 'Pell', 'Osei', 'Whitlock', 'Doyle'];
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

/** the first run, here and now: a fresh contract whose intro is the link and the intake */
export async function runPrologue(): Promise<void> {
  markSeen();
  // a reload from here is an ordinary boot (the title), not the prologue again
  const u = new URL(location.href);
  u.searchParams.delete('prologue');
  try { history.replaceState(null, '', u.toString()); } catch { /* sandboxed */ }
  try { sessionStorage.removeItem(INTRO_FROM_KEY); } catch { /* blocked */ }
  const L = await import('../launch');
  await L.launch({
    mode: 'new', name: `${pick(FIRST)} ${pick(LAST)}`, app: randomAppearance(Math.random), occupation: 'unemployed', traits: [],
    sandbox: {}, seed: Math.floor(Math.random() * 1e9), directives: true,
  });
}
