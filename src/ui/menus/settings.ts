// Interface preferences that live on this browser (not in saves): terminal
// colour, UI scale, reduced flashing, touch controls mode. Applied to <html>
// as data attributes / CSS variables so every stylesheet can follow them.
import { bus } from '../../core/events';

export type UiTheme = 'green' | 'amber';
export interface UiSettings { theme: UiTheme; scale: number; reduceFlash: boolean }
export type TouchMode = 'auto' | 'on' | 'off';

const KEY = 'noclip.ui';
const DEF: UiSettings = { theme: 'green', scale: 1, reduceFlash: false };

export function uiSettings(): UiSettings {
  try { return { ...DEF, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEF }; }
}

export function saveUiSettings(s: UiSettings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage blocked */ }
  applyUiSettings(s);
  bus.emit('uiSettings', s);
}

export function applyUiSettings(s = uiSettings()) {
  const de = document.documentElement;
  de.dataset.uiTheme = s.theme;
  de.style.setProperty('--ui-scale', String(Math.max(0.7, Math.min(1.5, s.scale || 1))));
  de.classList.toggle('reduce-flash', !!s.reduceFlash || reducedMotion());
  de.classList.toggle('coarse', coarsePointer());
}

export function reducedMotion(): boolean {
  try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}
export function coarsePointer(): boolean {
  try { return matchMedia('(pointer: coarse)').matches; } catch { return false; }
}
/** true when flicker / glitch / blinking effects should stay still */
export function calm(): boolean { return document.documentElement.classList.contains('reduce-flash'); }

// ---------------------------------------------------------------- touch controls (owned by the touch layer; we only edit the preference)
export function touchMode(): TouchMode {
  try { const v = localStorage.getItem('noclip.touch'); return v === 'on' || v === 'off' ? v : 'auto'; } catch { return 'auto'; }
}
export function setTouchMode(v: TouchMode) {
  try { localStorage.setItem('noclip.touch', v); } catch { /* ignore */ }
  bus.emit('touchSetting', v);
  window.dispatchEvent(new CustomEvent('noclip:touch', { detail: v }));
}

applyUiSettings();
