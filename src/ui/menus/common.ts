// Shared kit for the terminal menus: typed menu lines, segmented switches,
// sliders, tabs with a sliding cursor, in-page confirm dialogs, tooltips,
// teletype text, and the metal-framed CRT screen every menu sits in.
import { G } from '../../game/G';
import { sfx, Sfx } from './sfx';
import { FocusNav } from './nav';
import { uiSettings, saveUiSettings, calm, UiTheme, currentPx } from './settings';
import { getTouchSetting, setTouchSetting, TouchSetting } from '../touch/mode';

export { sfx } from './sfx';
export { FocusNav } from './nav';

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}
export function esc(s: string) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as any)[c]); }

/** hovering with a mouse moves the keyboard focus too, so there is only ever one highlight bar */
export function hoverFocus(el: HTMLElement, sound: Sfx | '' = 'hover') {
  el.addEventListener('pointerenter', (e) => {
    if (e.pointerType !== 'mouse') return;
    if ((el as any).disabled) return;
    const a = document.activeElement as HTMLElement | null;
    if (a && (a.tagName === 'INPUT' && (a as HTMLInputElement).type === 'text' || a.tagName === 'TEXTAREA')) return;
    if (a !== el) { el.focus({ preventScroll: true }); if (sound) sfx(sound); }
  });
}

/** a terminal menu line: "▸ LABEL ......... sub" with a highlight bar and a blinking block cursor */
export function mbtn(label: string, onClick: () => void, opts: { disabled?: boolean; sub?: string; danger?: boolean; primary?: boolean; key?: string; tip?: string } = {}) {
  const b = h('button', 't-btn' + (opts.danger ? ' danger' : '') + (opts.primary ? ' primary' : ''),
    `<span class="t-caret">▸</span><span class="lbl">${esc(label)}</span><span class="t-cur"></span>${opts.sub ? `<small>${esc(opts.sub)}</small>` : ''}${opts.key ? `<kbd>${esc(opts.key)}</kbd>` : ''}`);
  b.type = 'button';
  b.disabled = !!opts.disabled;
  if (opts.tip) b.dataset.tip = opts.tip;
  hoverFocus(b);
  b.addEventListener('click', () => {
    if (b.disabled) return;
    sfx(opts.primary ? 'confirm' : opts.danger ? 'back' : 'click');
    b.classList.remove('flash'); void b.offsetWidth; b.classList.add('flash');
    onClick();
  });
  return b;
}

/** small square key-like button */
export function kbtn(label: string, onClick: () => void, opts: { tip?: string; cls?: string; sound?: Sfx } = {}) {
  const b = h('button', 't-key' + (opts.cls ? ' ' + opts.cls : ''), label);
  b.type = 'button';
  if (opts.tip) { b.dataset.tip = opts.tip; b.setAttribute('aria-label', opts.tip); }
  hoverFocus(b);
  b.addEventListener('click', () => { sfx(opts.sound ?? 'click'); onClick(); });
  return b;
}

/** labelled range control with a segmented phosphor bar */
export function slider(label: string, value: number, min: number, max: number, step: number, fmt: (v: number) => string, onInput: (v: number) => void) {
  const row = h('label', 't-slider');
  const lab = h('span', 't-slider-l', esc(label));
  const inp = h('input') as HTMLInputElement;
  inp.type = 'range'; inp.min = String(min); inp.max = String(max); inp.step = String(step); inp.value = String(value);
  const out = h('span', 't-slider-v', esc(fmt(value)));
  const paint = () => inp.style.setProperty('--p', String((Number(inp.value) - min) / (max - min || 1)));
  paint();
  hoverFocus(inp);
  inp.addEventListener('input', () => { const v = Number(inp.value); out.textContent = fmt(v); paint(); sfx('tick'); onInput(v); });
  row.append(lab, inp, out);
  return row;
}

/** segmented switch: one of a few values (radio group) */
export function seg<T extends string | number | boolean>(label: string, vals: [T, string][], cur: T, onPick: (v: T) => void, opts: { tip?: (v: T) => string; cls?: string } = {}) {
  const row = h('div', 't-seg-row' + (opts.cls ? ' ' + opts.cls : ''));
  if (label) row.append(h('span', 't-seg-l', esc(label)));
  const box = h('div', 't-seg');
  box.setAttribute('role', 'radiogroup');
  const btns: HTMLButtonElement[] = [];
  for (const [v, l] of vals) {
    const b = h('button', 't-seg-b' + (v === cur ? ' on' : ''), esc(l));
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(v === cur));
    if (opts.tip) b.dataset.tip = opts.tip(v);
    hoverFocus(b);
    b.addEventListener('click', () => {
      for (const o of btns) { o.classList.toggle('on', o === b); o.setAttribute('aria-checked', String(o === b)); }
      sfx('toggle');
      onPick(v);
    });
    btns.push(b);
    box.append(b);
  }
  row.append(box);
  return row;
}

/** on/off switch */
export function toggle(label: string, on: boolean, onChange: (v: boolean) => void, sub = '') {
  const b = h('button', 't-toggle' + (on ? ' on' : ''), `<span class="t-toggle-l">${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ''}</span><span class="t-sw"><i></i><b>${on ? 'ON' : 'OFF'}</b></span>`);
  b.type = 'button';
  b.setAttribute('role', 'switch');
  b.setAttribute('aria-checked', String(on));
  hoverFocus(b);
  b.addEventListener('click', () => {
    on = !on;
    b.classList.toggle('on', on);
    b.setAttribute('aria-checked', String(on));
    (b.querySelector('.t-sw b') as HTMLElement).textContent = on ? 'ON' : 'OFF';
    sfx('toggle');
    onChange(on);
  });
  return b;
}

/** tab strip with a sliding cursor; returns the strip and a select(i) function */
export function tabs(names: string[], cur: number, onSelect: (i: number) => void, cls = '') {
  const strip = h('div', 't-tabs' + (cls ? ' ' + cls : ''));
  strip.setAttribute('role', 'tablist');
  const ind = h('i', 't-tabs-ind');
  const btns = names.map((n, i) => {
    const b = h('button', 't-tab' + (i === cur ? ' on' : ''), `<span>${esc(n)}</span>`);
    b.type = 'button';
    b.setAttribute('role', 'tab');
    hoverFocus(b, '');
    b.addEventListener('click', () => select(i));
    strip.append(b);
    return b;
  });
  strip.append(ind);
  const place = () => {
    const b = btns[cur];
    if (!b || !b.offsetWidth) return;
    ind.style.transform = `translateX(${b.offsetLeft}px)`;
    ind.style.width = b.offsetWidth + 'px';
  };
  const select = (i: number, quiet = false) => {
    i = (i + names.length) % names.length;
    if (i === cur && !quiet) { place(); return; }
    cur = i;
    btns.forEach((b, j) => { b.classList.toggle('on', j === i); b.setAttribute('aria-selected', String(j === i)); });
    place();
    btns[i].scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    if (!quiet) sfx('tab');
    onSelect(i);
  };
  requestAnimationFrame(place);
  new ResizeObserver(place).observe(strip);
  return { el: strip, select, get index() { return cur; }, buttons: btns };
}

/** swap a page's content with a quick CRT wipe */
export function swapPage(host: HTMLElement, content: HTMLElement | DocumentFragment, dir: 1 | -1 | 0 = 1) {
  host.innerHTML = '';
  host.append(content);
  host.classList.remove('t-page-in', 't-page-in-l');
  void host.offsetWidth;
  host.classList.add(dir < 0 ? 't-page-in-l' : 't-page-in');
}

/** metal frame with rivets, a stencilled plate and a CRT screen inside */
export function frame(label: string, cls = '', plateRight = '') {
  const el = h('div', 'mf ' + cls);
  const plate = h('div', 'mf-plate', `<span>${esc(label)}</span>${plateRight ? `<em>${esc(plateRight)}</em>` : ''}`);
  const screen = h('div', 'crt');
  const body = h('div', 'crt-in');
  screen.append(body, h('div', 'crt-fx'));
  el.append(plate, screen);
  return { el, plate, screen, body };
}

/** teletype text: types `text` into `el`; resolves when done (instant under reduce-flash / skip) */
export function typeText(el: HTMLElement, text: string, cps = 90, sound = true): Promise<void> & { skip: () => void } {
  let skip = false;
  const p = new Promise<void>((res) => {
    if (calm() || cps <= 0) { el.textContent = text; res(); return; }
    let i = 0, acc = 0, last = performance.now();
    const tick = (now: number) => {
      if (!el.isConnected) { res(); return; }
      if (skip) { el.textContent = text; res(); return; }
      acc += (now - last) / 1000 * cps; last = now;
      const n = Math.floor(acc);
      if (n > 0) { acc -= n; i = Math.min(text.length, i + n); el.textContent = text.slice(0, i); if (sound && text[i - 1] !== ' ') sfx('type', 0.5); }
      if (i >= text.length) { res(); return; }
      requestAnimationFrame(tick);
    };
    el.textContent = '';
    requestAnimationFrame(tick);
  }) as Promise<void> & { skip: () => void };
  p.skip = () => { skip = true; };
  return p;
}

/** staggered "print" of a list of elements (menu lines appear one after the other) */
export function printIn(els: HTMLElement[], step = 45) {
  if (calm()) return;
  els.forEach((e, i) => { e.style.animationDelay = (i * step) + 'ms'; e.classList.add('t-print'); });
}

// ---------------------------------------------------------------- in-page dialogs
export interface ConfirmOpts { title: string; body?: string; ok?: string; cancel?: string; danger?: boolean }
export function confirmDialog(o: ConfirmOpts): Promise<boolean> {
  return new Promise((resolve) => {
    const veil = h('div', 't-veil');
    const { el, body } = frame(o.title, 't-dialog' + (o.danger ? ' danger' : ''));
    veil.append(el);
    if (o.body) body.append(h('p', 't-dialog-p', o.body));
    const row = h('div', 't-dialog-row');
    let nav: FocusNav;
    const done = (v: boolean) => { nav.destroy(); veil.classList.add('out'); setTimeout(() => veil.remove(), 160); resolve(v); };
    const cancel = mbtn(o.cancel || 'Cancel', () => done(false));
    const ok = mbtn(o.ok || 'OK', () => done(true), { danger: o.danger, primary: !o.danger });
    row.append(cancel, ok);
    body.append(row);
    veil.addEventListener('pointerdown', (e) => { if (e.target === veil) done(false); });
    document.body.append(veil);
    sfx(o.danger ? 'error' : 'open', 0.6);
    nav = new FocusNav(el, { onBack: () => done(false), autofocus: o.danger ? cancel : ok });
  });
}

// ---------------------------------------------------------------- tooltips for anything with data-tip
let tipEl: HTMLDivElement | null = null;
let tipFor: HTMLElement | null = null;
function showTipFor(t: HTMLElement) {
  const text = t.dataset.tip;
  if (!text) return;
  if (!tipEl) { tipEl = h('div', 't-tip'); document.body.append(tipEl); }
  tipFor = t;
  tipEl.innerHTML = esc(text).replace(/\n/g, '<br>');
  tipEl.style.display = 'block';
  const r = t.getBoundingClientRect(), tr = tipEl.getBoundingClientRect();
  let x = r.left + r.width / 2 - tr.width / 2, y = r.top - tr.height - 8;
  if (y < 6) y = r.bottom + 8;
  x = Math.max(6, Math.min(innerWidth - tr.width - 6, x));
  tipEl.style.left = x + 'px'; tipEl.style.top = y + 'px';
}
function hideTip(t?: HTMLElement) { if (tipEl && (!t || t === tipFor)) { tipEl.style.display = 'none'; tipFor = null; } }
document.addEventListener('pointerover', (e) => {
  if (e.pointerType !== 'mouse') return;
  const t = (e.target as HTMLElement)?.closest?.('[data-tip]') as HTMLElement | null;
  if (t) showTipFor(t); else hideTip();
});
// focus tooltips only follow keyboard / gamepad travel, never a click or an autofocus
let lastKeyAt = 0;
window.addEventListener('keydown', () => { lastKeyAt = performance.now(); }, true);
document.addEventListener('focusin', (e) => { const t = (e.target as HTMLElement)?.closest?.('[data-tip]') as HTMLElement | null; if (t && performance.now() - lastKeyAt < 400) showTipFor(t); else hideTip(); });
document.addEventListener('focusout', () => hideTip());
document.addEventListener('pointerdown', () => hideTip(), true);

// ---------------------------------------------------------------- persistent graphics settings
export interface GfxSettings {
  pixelHeight: number; shake: boolean; grain: number;
  /** render quality: 'auto' picks by device (phones low, tablets medium, desktops high) and steps down when frames run slow */
  quality: 'auto' | 'low' | 'medium' | 'high';
  /** camera shake intensity 0..1.5 (shake: false turns it off entirely) */
  shakeAmt: number;
  /** the view drifts toward the cursor / aim and looks ahead of your movement */
  peek: boolean;
  /** motion comfort: almost no shake, no breathing sway, gentler punches, push-ins and peek (on by default with prefers-reduced-motion) */
  comfort: boolean;
  /** after a free orbit (middle mouse / Alt+drag) keep the angle instead of easing back to the nearest quarter turn */
  keepOrbit: boolean;
}
export function gfxSettings(): GfxSettings {
  let rm = false;
  try { rm = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* ignore */ }
  const d: GfxSettings = { pixelHeight: 360, shake: true, grain: 1, quality: 'auto', shakeAmt: 1, peek: true, comfort: rm, keepOrbit: false };
  try { return { ...d, ...JSON.parse(localStorage.getItem('noclip.gfx') || '{}') }; } catch { return d; }
}
export function saveGfx(s: GfxSettings) { try { localStorage.setItem('noclip.gfx', JSON.stringify(s)); } catch { /* ignore */ } applyGfx(s); }
export function applyGfx(s = gfxSettings()) {
  const pr = G?.pr as any;
  if (!pr) return;
  pr.targetLowH = s.pixelHeight;
  pr.resize?.();
  pr.applySettings?.(s);
  (G as any)?.camera?.applySettings?.(s);
}

const GFX_LABELS: Record<string, [string, string]> = {
  peek: ['Look ahead', 'the view drifts toward your aim and where you are heading'],
  comfort: ['Motion comfort', 'almost no shake or sway, gentler camera moves'],
  keepOrbit: ['Keep camera angle', 'after a free orbit, stay there instead of snapping back'],
};
const GFX_HANDLED = new Set(['pixelHeight', 'shake', 'shakeAmt', 'grain', 'quality', 'peek', 'comfort', 'keepOrbit']);
const humanizeKey = (k: string) => k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());

/** PICTURE: every field of GfxSettings gets a control (fields added later show up as generic switches / sliders) */
function picturePage(f: DocumentFragment) {
  const gs = gfxSettings() as GfxSettings & Record<string, any>;
  const save = () => saveGfx(gs);
  if ('quality' in gs) f.append(seg<string>('Quality', [['auto', 'Auto'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], gs.quality, (v) => { gs.quality = v as GfxSettings['quality']; save(); },
    { tip: (v) => ({ auto: 'Picked for this device, steps down when frames run slow', low: 'Fewest lights and effects: phones', medium: 'Balanced', high: 'Everything on' } as Record<string, string>)[v] || '' }));
  f.append(slider('Pixel size', gs.pixelHeight, 240, 540, 30, (v) => (v <= 300 ? 'chunky' : v <= 390 ? 'classic' : v <= 450 ? 'fine' : 'very fine') + ` ${v}p`, (v) => { gs.pixelHeight = v; save(); }));
  const shakeNow = gs.shake === false ? 0 : (gs.shakeAmt ?? 1);
  f.append(seg<number>('Camera shake', [[0, 'Off'], [0.5, 'Low'], [1, 'Normal'], [1.5, 'Strong']], [0, 0.5, 1, 1.5].reduce((a, b) => Math.abs(b - shakeNow) < Math.abs(a - shakeNow) ? b : a, 1),
    (v) => { gs.shake = v > 0; if (v > 0) gs.shakeAmt = v; save(); }));
  if ('grain' in gs && typeof gs.grain === 'number') f.append(seg<number>('Film grain', [[0, 'Off'], [0.5, 'Low'], [1, 'Normal']], gs.grain <= 0.25 ? 0 : gs.grain <= 0.75 ? 0.5 : 1, (v) => { gs.grain = v; save(); }));
  for (const k of ['peek', 'comfort', 'keepOrbit']) if (typeof gs[k] === 'boolean') {
    const [l, sub] = GFX_LABELS[k];
    f.append(toggle(l, gs[k], (v) => { gs[k] = v; save(); }, sub));
  }
  // anything the renderer adds later: booleans become switches, 0..1 numbers sliders, nested flag groups switches
  for (const [k, v] of Object.entries(gs)) {
    if (GFX_HANDLED.has(k)) continue;
    if (typeof v === 'boolean') f.append(toggle(humanizeKey(k), v, (nv) => { gs[k] = nv; save(); }));
    else if (typeof v === 'number' && v >= 0 && v <= 1) f.append(slider(humanizeKey(k), v, 0, 1, 0.05, (x) => Math.round(x * 100) + '%', (nv) => { gs[k] = nv; save(); }));
    else if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) if (typeof v2 === 'boolean') f.append(toggle(humanizeKey(k2), v2, (nv) => { (gs[k] as Record<string, unknown>)[k2] = nv; save(); }));
    }
  }
  f.append(h('p', 't-note', 'Lower pixel sizes and quality render fewer, bigger pixels and run faster on phones.'));
}

/** options content (sound, picture, interface, game), reused by the title and the pause menu */
export function optionsPanel(opts: { inGame?: boolean; onTab?: (fn: (d: -1 | 1) => void) => void } = {}): HTMLElement {
  const box = h('div', 't-options');
  const pages = ['SOUND', 'PICTURE', 'INTERFACE', ...(opts.inGame ? ['GAME'] : [])];
  const page = h('div', 't-opt-page');
  let cur = 0;
  try { cur = Math.min(pages.length - 1, Number(sessionStorage.getItem('noclip.optTab') || 0)); } catch { /* ignore */ }
  const render = (i: number, dir: 1 | -1 | 0) => {
    try { sessionStorage.setItem('noclip.optTab', String(i)); } catch { /* ignore */ }
    const f = document.createDocumentFragment();
    const name = pages[i];
    if (name === 'SOUND') {
      const vol = G?.audio?.vol || { master: 0.85, sfx: 1, amb: 0.8, music: 0.5, ui: 0.6, voice: 1 };
      const pct = (v: number) => Math.round(v * 100) + '%';
      for (const [k, lbl] of [['master', 'Master'], ['sfx', 'Effects'], ['amb', 'Ambience'], ['music', 'Music'], ['voice', 'Voices'], ['ui', 'Scanner & UI']] as const) {
        f.append(slider(lbl, (vol as any)[k], 0, 1, 0.05, pct, (v) => G?.audio?.setVolume?.(k, v)));
      }
    } else if (name === 'PICTURE') {
      picturePage(f);
    } else if (name === 'INTERFACE') {
      const us = uiSettings();
      f.append(seg<UiTheme>('Terminal', [['green', 'Phosphor green'], ['amber', 'Amber']], us.theme, (v) => { us.theme = v; saveUiSettings(us); }));
      f.append(seg<number>('UI size', [[0, 'Auto'], [2, '2×'], [3, '3×'], [4, '4×']], us.px ?? 0, (v) => { us.px = v; us.scale = 1; saveUiSettings(us); },
        { tip: (v) => v === 0 ? `Pick for this screen (now ${Math.round(currentPx({ ...us, px: 0 }) * 10) / 10}×)` : `Every interface pixel is ${v} screen pixels` }));
      f.append(toggle('Reduce flashing', us.reduceFlash, (v) => { us.reduceFlash = v; saveUiSettings(us); }, 'no flicker, glitches or blinking'));
      f.append(seg<TouchSetting>('Touch controls', [['auto', 'Auto'], ['on', 'On'], ['off', 'Off']], getTouchSetting(), (v) => setTouchSetting(v),
        { tip: (v) => v === 'auto' ? 'Show on-screen controls on touch screens' : v === 'on' ? 'Always show on-screen controls' : 'Never show on-screen controls' }));
    } else if (name === 'GAME' && G?.sandbox) {
      const client = G.role === 'client';
      const sbx = G.sandbox as Record<string, number>;
      const gore = seg<number>('Gore', [[0, 'Off'], [1, 'Normal'], [2, 'Heavy']], sbx.gore ?? 2, (v) => { sbx.gore = v; }, { tip: (v) => ['No blood or wounds shown', 'Blood and wounds', 'Dismemberment, gibs, arterial spray'][v as number] });
      if (client) gore.querySelectorAll('button').forEach((b) => { (b as HTMLButtonElement).disabled = true; });
      f.append(gore);
      const limbs = toggle('Limb loss', (sbx.limbLoss ?? 1) !== 0, (v) => { sbx.limbLoss = v ? 1 : 0; }, 'survivors can lose hands, arms, feet and legs');
      if (client) (limbs as HTMLButtonElement).disabled = true;
      f.append(limbs);
      f.append(h('p', 't-note', client ? 'Set by the host for everyone in this world.' : 'Saved with this world (co-op guests use your setting).'));
    }
    swapPage(page, f, dir);
  };
  const t = tabs(pages, cur, (i) => { const d = i > cur ? 1 : -1; cur = i; render(i, d); }, 'small');
  box.append(t.el, page);
  render(cur, 0);
  opts.onTab?.((d) => t.select(t.index + d));
  return box;
}

export const CONTROLS: [string, string][] = [
  ['WASD', 'walk'], ['Shift', 'run'], ['C / Ctrl', 'sneak'], ['Right mouse (hold)', 'aim / ready weapon'], ['Left mouse', 'attack while aiming · interact'],
  ['Right click', 'context menu'], ['E', 'interact with what is in front of you'], ['Space', 'shove'], ['F', 'flashlight'],
  ['Tab', 'raise the SEER-9 scanner'], ['1–6 / Q E / wheel', 'scanner pages · dial'], ['I', 'inventory'], ['M', 'map'],
  ['R', 'reload · rotate when placing'], ['Z / X', 'rotate camera'], ['Mouse wheel', 'zoom'], ['V (hold)', 'talk (co-op voice, walkie when switched on)'],
  ['Q', 'shout (scanner closed)'], ['H', 'breathing exercise (calms panic)'], ['Enter / T', 'chat (co-op)'], ['Esc', 'close · pause'],
];
export const TOUCH_CONTROLS: [string, string][] = [
  ['Stick', 'move · push fully or double-tap to run'], ['Tap', 'act on a thing · walk to a spot'], ['Hold', 'context menu'],
  ['Pinch', 'zoom'], ['Two-finger twist / swipe', 'turn the camera'], ['Hold ATTACK', 'aim, release to strike'],
];
export const MENU_CONTROLS: [string, string][] = [['↑ ↓ ← →', 'move the cursor'], ['Enter', 'select'], ['Esc', 'back'], ['Q / E', 'switch tabs'], ['Gamepad', 'd-pad, A select, B back, LB/RB tabs']];
export function controlsPanel(): HTMLElement {
  const box = h('div', 't-controls');
  for (const [k, v] of CONTROLS) box.append(h('div', 't-ctl', `<kbd>${esc(k)}</kbd><span>${esc(v)}</span>`));
  box.append(h('div', 't-ctl-h', 'TOUCH'));
  for (const [k, v] of TOUCH_CONTROLS) box.append(h('div', 't-ctl', `<kbd>${esc(k)}</kbd><span>${esc(v)}</span>`));
  box.append(h('div', 't-ctl-h', 'MENUS'));
  for (const [k, v] of MENU_CONTROLS) box.append(h('div', 't-ctl', `<kbd>${esc(k)}</kbd><span>${esc(v)}</span>`));
  box.append(h('div', 't-ctl-h', 'INVENTORY'));
  for (const [k, v] of [['Drag', 'move items · shift-drag moves the stack'], ['Double-click / double-tap', 'move to the other side'], ['Right click / long-press', 'item actions']]) box.append(h('div', 't-ctl', `<kbd>${esc(k)}</kbd><span>${esc(v)}</span>`));
  return box;
}
