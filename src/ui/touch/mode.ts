// Touch mode: decides whether the on-screen controls are shown.
//
// Setting (localStorage 'noclip.touch'):
//   'auto' (default) on when the primary pointer is coarse (phones, tablets),
//          and on hybrid devices whenever the screen was touched last
//          (a real mouse click switches it back off);
//   'on'   always show the touch controls (also handy for testing on desktop);
//   'off'  never show them.
// While active, <html> carries the class `nc-touch` and the bus emits
// 'touchMode' (boolean) whenever it changes. Keyboard and mouse always keep working.
import { bus } from '../../core/events';

export type TouchSetting = 'auto' | 'on' | 'off';
const KEY = 'noclip.touch';

let active = false;
let lastTouch = 0;
/** in auto mode on hybrid devices: what was used last */
let lastKind: 'touch' | 'mouse' | null = null;

function mq(q: string) { try { return window.matchMedia(q).matches; } catch { return false; } }
/** phones and tablets: the primary pointer is a finger */
export function coarsePrimary() { return mq('(pointer: coarse)') || (mq('(any-pointer: coarse)') && !mq('(any-pointer: fine)')); }

export function getTouchSetting(): TouchSetting {
  try { const v = localStorage.getItem(KEY); if (v === 'on' || v === 'off' || v === 'auto') return v; } catch { /* storage blocked */ }
  return 'auto';
}
export function setTouchSetting(v: TouchSetting) {
  try { localStorage.setItem(KEY, v); } catch { /* storage blocked */ }
  refresh();
}
export function isTouchMode() { return active; }
/** ms timestamp of the last finger on the screen (to tell real mouse events from touch-emulated ones) */
export function lastTouchTime() { return lastTouch; }

export function refresh() {
  const s = getTouchSetting();
  const want = s === 'on' || (s === 'auto' && (lastKind ? lastKind === 'touch' : coarsePrimary()));
  if (want === active) return;
  active = want;
  document.documentElement.classList.toggle('nc-touch', active);
  bus.emit('touchMode', active);
}

/** light haptic feedback where supported (touch mode only) */
export function buzz(ms: number | number[]) {
  if (!active) return;
  try { (navigator as any).vibrate?.(ms); } catch { /* not allowed */ }
}

let installed = false;
export function installTouchMode() {
  if (installed) return;
  installed = true;
  window.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch' || e.pointerType === 'pen') {
      lastTouch = performance.now();
      if (lastKind !== 'touch') { lastKind = 'touch'; refresh(); }
    } else if (e.pointerType === 'mouse' && performance.now() - lastTouch > 1000 && !coarsePrimary()) {
      if (lastKind !== 'mouse') { lastKind = 'mouse'; refresh(); }
    }
  }, true);
  window.addEventListener('touchstart', () => { lastTouch = performance.now(); }, { capture: true, passive: true });
  // iOS Safari ignores user-scalable=no: stop page pinch-zoom over the game
  document.addEventListener('gesturestart', (e) => { if (active) e.preventDefault(); });
  try { window.matchMedia('(pointer: coarse)').addEventListener('change', () => refresh()); } catch { /* old browsers */ }
  refresh();
}

installTouchMode();
