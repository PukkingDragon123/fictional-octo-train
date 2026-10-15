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

/** the art-pixel scale to aim for on this viewport, in CSS pixels: 2 on laptops and 1080p, 3 on big desktop screens, a little under 2 on phones */
export function autoPx(): number {
  const w = window.innerWidth || 1280, h = window.innerHeight || 720;
  if (Math.min(w, h * 1.78) >= 2100 && h >= 1150) return 3;
  if (Math.min(w, h) < 500 && (window.devicePixelRatio || 1) >= 2) return 1.67;
  return 2;
}
/**
 * CSS pixels per art pixel. Always a whole number of *device* pixels, so on
 * a 3x phone it can be 5/3 and on a 1.25x laptop 2.4: every art pixel (and
 * every font pixel) lands on the device grid and nothing blurs.
 */
export function currentPx(s = uiSettings()): number {
  const dpr = Math.max(1, Math.min(4, window.devicePixelRatio || 1));
  let target = s.px && s.px >= 2 ? s.px : autoPx();
  // older saves stored a free scale; honour "large" there
  if (!s.px && s.scale >= 1.25) target += 1;
  const w = window.innerWidth || 1280, h = window.innerHeight || 720;
  let k = Math.max(2, Math.round(target * dpr));
  // never let the interface outgrow a small screen
  while (k > 2 && (Math.min(w, h) / (k / dpr) < 190 || w / (k / dpr) < 300)) k--;
  return k / dpr;
}

let lastApplied = '';
export function applyUiSettings(s = uiSettings()) {
  const de = document.documentElement;
  const px = currentPx(s);
  const dpr = Math.max(1, Math.min(4, window.devicePixelRatio || 1));
  // the "one step up" type size: (art pixel + one more device-rounded CSS pixel) x native size
  const step = (Math.round(px * dpr) + Math.max(1, Math.round(dpr))) / dpr;
  de.dataset.uiTheme = s.theme;
  de.style.setProperty('--px', px + 'px');
  de.style.setProperty('--pxn', String(px));
  de.style.setProperty('--fs', px * 8 + 'px');
  de.style.setProperty('--t-big', step * 11 + 'px');
  de.style.setProperty('--lh-big', step * 8 + 'px');
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
