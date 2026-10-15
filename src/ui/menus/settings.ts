// Interface preferences that live on this browser (not in saves): terminal
// colour, UI pixel size, reduced flashing (the touch-controls preference lives in ../touch/mode.ts). Applied to <html>
// as data attributes / CSS variables so every stylesheet can follow them.
//
// The whole interface is pixel art drawn at 1 art pixel and shown at an
// integer scale: --px (CSS px per art pixel, e.g. "2px") and --pxn (the same as
// a bare number). --fs is 8 art pixels, the em every layout is measured in.
import { bus } from '../../core/events';
import { installPixelKit } from '../pixelkit';

export type UiTheme = 'green' | 'amber';
export interface UiSettings { theme: UiTheme; scale: number; reduceFlash: boolean; /** 0 = auto, else art-pixel scale 2..4 */ px?: number }

const KEY = 'noclip.ui';
const DEF: UiSettings = { theme: 'green', scale: 1, reduceFlash: false, px: 0 };

export function uiSettings(): UiSettings {
  try { return { ...DEF, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEF }; }
}

export function saveUiSettings(s: UiSettings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage blocked */ }
  applyUiSettings(s);
  bus.emit('uiSettings', s);
}

/** art-pixel scale for this viewport: 2 on phones, laptops and 1080p, 3 on big desktop screens */
export function autoPx(): number {
  const w = window.innerWidth || 1280, h = window.innerHeight || 720;
  return Math.min(w, h * 1.78) >= 2100 && h >= 1150 ? 3 : 2;
}
export function currentPx(s = uiSettings()): number {
  let px = s.px && s.px >= 2 ? Math.round(s.px) : autoPx();
  // older saves stored a free scale; honour "large" there
  if (!s.px && s.scale >= 1.25) px += 1;
  // never let the interface outgrow a small screen
  const w = window.innerWidth || 1280, h = window.innerHeight || 720;
  while (px > 2 && (Math.min(w, h) / px < 200 || w / px < 300)) px--;
  return Math.max(2, Math.min(4, px));
}

let lastApplied = '';
export function applyUiSettings(s = uiSettings()) {
  const de = document.documentElement;
  const px = currentPx(s);
  de.dataset.uiTheme = s.theme;
  de.style.setProperty('--px', px + 'px');
  de.style.setProperty('--pxn', String(px));
  de.style.setProperty('--fs', px * 8 + 'px');
  // legacy multiplier other layers may read (kept proportional to the pixel scale)
  de.style.setProperty('--ui-scale', String(px / 2));
  de.classList.toggle('reduce-flash', !!s.reduceFlash || reducedMotion());
  de.classList.toggle('coarse', coarsePointer());
  try { installPixelKit(s.theme, px); } catch (e) { console.warn('pixel kit', e); }
  const k = s.theme + px;
  if (k !== lastApplied && lastApplied) bus.emit('uiScale', px);
  lastApplied = k;
}

export function reducedMotion(): boolean {
  try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}
export function coarsePointer(): boolean {
  try { return matchMedia('(pointer: coarse)').matches; } catch { return false; }
}
/** true when flicker / glitch / blinking effects should stay still */
export function calm(): boolean { return document.documentElement.classList.contains('reduce-flash'); }

applyUiSettings();
let rt = 0;
window.addEventListener('resize', () => { clearTimeout(rt); rt = window.setTimeout(() => applyUiSettings(), 120); });
