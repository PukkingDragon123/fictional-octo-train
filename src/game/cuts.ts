// The cutscene settings (Options > INTERFACE): each short cut (the sleep, the close-ups on what the hands are
// doing, going back to the lab) plays full, short or not at all. Per player, kept in this browser.
export type CutMode = 'full' | 'short' | 'off';
export const CUT_KINDS: [string, string][] = [
  ['sleep', 'Sleep cut'], ['medical', 'Treating wounds'], ['lock', 'Locks and doors'], ['barricade', 'Barricading'],
  ['repair', 'Repairs'], ['read', 'Reading'], ['unlink', 'Back to the lab'],
];
const KEY = 'noclip.cuts';
let cache: Record<string, CutMode> | null = null;
function all(): Record<string, CutMode> {
  if (cache) return cache;
  try { cache = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { cache = {}; }
  return cache!;
}
export function cutMode(kind: string): CutMode {
  const v = all()[kind];
  return v === 'short' || v === 'off' ? v : 'full';
}
export function setCutMode(kind: string, m: CutMode) {
  const a = all();
  a[kind] = m;
  try { localStorage.setItem(KEY, JSON.stringify(a)); } catch { /* storage blocked: this session only */ }
}
/** the length multiplier for a mode (short cuts run at about half) */
export const cutLen = (m: CutMode) => (m === 'short' ? 0.5 : m === 'off' ? 0 : 1);
