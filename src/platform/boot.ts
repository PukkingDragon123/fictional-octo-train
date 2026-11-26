// Platform start-up, imported first by src/main.ts: the desktop bridge and its save mirror
// (./desktop.ts installs itself on import), the error log, then (once the page is up) Steam,
// the first-launch performance check and the pause when the window loses focus.
import { desktopBridge } from './desktop';
import { installErrorLog } from './errlog';
import { G } from '../game/G';
import { bus } from '../core/events';

installErrorLog();

function wantPause(): boolean {
  if (navigator.webdriver) return false; // headless checks drive the page without focus
  try { if (JSON.parse(localStorage.getItem('noclip.ui') || '{}').focusPause === false) return false; } catch { /* default on */ }
  const g = G as unknown as { local?: { body?: { dead?: boolean } }; paused?: boolean } | null;
  if (!g?.local || g.local.body?.dead) return false;
  return !document.querySelector('.ps2');
}
function pauseNow() { if (wantPause()) bus.emit('pauseMenu'); }
window.addEventListener('blur', () => { setTimeout(() => { if (!document.hasFocus()) pauseNow(); }, 80); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') pauseNow(); });
(desktopBridge() as unknown as { onOverlay?: (fn: (on: boolean) => void) => void } | null)?.onOverlay?.((on) => { if (on) pauseNow(); });

setTimeout(() => {
  void import('./steam').then((m) => m.startSteam()).catch((e) => console.warn('steam', e));
  void import('./perf').then((m) => m.firstLaunchPerf()).catch(() => undefined);
}, 1200);
