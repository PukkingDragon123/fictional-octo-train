// The quick-time assists (Settings, Interface: "Hold, don't mash" and "Slower timing"), read by game
// logic (src/actions/skillCheck.ts, src/combat/qte.ts, the scanner's lock) without importing any UI.
// They live in the interface settings blob in localStorage ('noclip.ui', src/ui/menus/settings.ts
// writes it and emits 'uiSettings'); safe to import anywhere, including node-side checks.
import { bus } from './events';

let cache: { hold: boolean; slow: boolean } | null = null;
bus.on('uiSettings', () => { cache = null; });
export function qteAssist(): { hold: boolean; slow: boolean } {
  if (cache) return cache;
  let s: { qteHold?: boolean; qteSlow?: boolean } = {};
  try { s = JSON.parse((typeof localStorage !== 'undefined' && localStorage.getItem('noclip.ui')) || '{}'); } catch { /* storage blocked */ }
  return (cache = { hold: !!s.qteHold, slow: !!s.qteSlow });
}
