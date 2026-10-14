// Shared bits for the paper-and-clipboard menus.
import { G } from '../../game/G';

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}
export function esc(s: string) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as any)[c]); }

/** a typed menu line: "▸ LABEL" with a hover caret and click sound */
export function mbtn(label: string, onClick: () => void, opts: { disabled?: boolean; sub?: string; danger?: boolean } = {}) {
  const b = h('button', 'k-mbtn' + (opts.danger ? ' danger' : ''), `<span class="caret">▸</span><span class="lbl">${esc(label)}</span>${opts.sub ? `<small>${esc(opts.sub)}</small>` : ''}`);
  b.disabled = !!opts.disabled;
  b.addEventListener('mouseenter', () => { if (!b.disabled) G?.audio?.ui?.('tab', 0.25); });
  b.addEventListener('click', () => { if (b.disabled) return; G?.audio?.ui?.('click'); onClick(); });
  return b;
}

/** labelled range control */
export function slider(label: string, value: number, min: number, max: number, step: number, fmt: (v: number) => string, onInput: (v: number) => void) {
  const row = h('label', 'k-slider');
  const lab = h('span', 'k-slider-l', esc(label));
  const inp = h('input') as HTMLInputElement;
  inp.type = 'range'; inp.min = String(min); inp.max = String(max); inp.step = String(step); inp.value = String(value);
  const out = h('span', 'k-slider-v', fmt(value));
  inp.addEventListener('input', () => { const v = Number(inp.value); out.textContent = fmt(v); onInput(v); });
  row.append(lab, inp, out);
  return row;
}

// ---------------------------------------------------------------- persistent graphics settings
export interface GfxSettings { pixelHeight: number; shake: boolean; grain: number }
export function gfxSettings(): GfxSettings {
  const d: GfxSettings = { pixelHeight: 360, shake: true, grain: 1 };
  try { return { ...d, ...JSON.parse(localStorage.getItem('noclip.gfx') || '{}') }; } catch { return d; }
}
export function saveGfx(s: GfxSettings) { try { localStorage.setItem('noclip.gfx', JSON.stringify(s)); } catch { /* ignore */ } applyGfx(s); }
export function applyGfx(s = gfxSettings()) {
  const pr = G?.pr as any;
  if (!pr) return;
  pr.targetLowH = s.pixelHeight;
  pr.resize?.();
}

/** options panel content (audio + graphics), reused by title and pause menus */
export function optionsPanel(): HTMLElement {
  const box = h('div', 'k-options');
  box.append(h('h3', '', 'SOUND'));
  const vol = G?.audio?.vol || { master: 0.85, sfx: 1, amb: 0.8, music: 0.5, ui: 0.6, voice: 1 };
  const pct = (v: number) => Math.round(v * 100) + '%';
  for (const [k, lbl] of [['master', 'Master'], ['sfx', 'Effects'], ['amb', 'Ambience'], ['music', 'Music'], ['voice', 'Voices'], ['ui', 'Scanner & UI']] as const) {
    box.append(slider(lbl, (vol as any)[k], 0, 1, 0.05, pct, (v) => G?.audio?.setVolume?.(k, v)));
  }
  box.append(h('h3', '', 'PICTURE'));
  const gs = gfxSettings();
  box.append(slider('Pixel size', gs.pixelHeight, 240, 540, 30, (v) => (v <= 300 ? 'chunky' : v <= 390 ? 'classic' : v <= 450 ? 'fine' : 'very fine') + ` (${v}p)`, (v) => { gs.pixelHeight = v; saveGfx(gs); }));
  return box;
}

export const CONTROLS: [string, string][] = [
  ['WASD', 'walk'], ['Shift', 'run'], ['C / Ctrl', 'sneak'], ['Right mouse (hold)', 'aim / ready weapon'], ['Left mouse', 'attack while aiming · interact'],
  ['Right click', 'context menu'], ['E', 'interact with what is in front of you'], ['Space', 'shove'], ['F', 'flashlight'],
  ['Tab', 'raise the SEER-9 scanner'], ['1–6 / Q E / wheel', 'scanner pages · dial'], ['I', 'inventory'], ['M', 'map'],
  ['R', 'reload · rotate when placing'], ['Z / X', 'rotate camera'], ['Mouse wheel', 'zoom'], ['V (hold)', 'talk (co-op voice, walkie when switched on)'],
  ['Q', 'shout (scanner closed)'], ['Enter / T', 'chat (co-op)'], ['Esc', 'close · pause'],
];
export function controlsPanel(): HTMLElement {
  const box = h('div', 'k-controls');
  for (const [k, v] of CONTROLS) box.append(h('div', 'k-ctl', `<kbd>${esc(k)}</kbd><span>${esc(v)}</span>`));
  return box;
}
