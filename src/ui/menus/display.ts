// Settings > DISPLAY (the gear train's second page) and the rebinding half of CONTROLS.
//
// DISPLAY: a graphics preset (the first-launch check picks one; the lens runs it again), the window
// (windowed / borderless / fullscreen and the window size on desktop, fullscreen in a browser), vsync,
// a frame cap, the render scale, and whether losing the window pauses the game.
// CONTROLS: every rebindable action with its two key caps (click one, press the new key; Esc keeps the
// old one, Backspace clears it). A key that is already on another action moves over and the other action
// takes this one's old key (both rows flash); keys other screens own (J, M, Tab...) are refused. The pad's
// fixed layout is the third column (src/core/gamepad.ts).
import { G } from '../../game/G';
import { h, esc, seg, toggle, gfxSettings, saveGfx, sfx } from './common';
import { uiSettings, saveUiSettings } from './settings';
import { applyPreset, currentPreset, detectPerformance, lastPerf, type Preset } from '../../platform/perf';
import { setFpsCap } from '../../gfx/frameCap';
import { isDesktop, displayGet, displaySet, browserFullscreen, type DisplayInfo } from '../../platform/desktop';
import { DEFAULT_BINDINGS, REBINDABLE, RESERVED_KEYS, keyLabel, savedBindings, storeBindings, type Action } from '../../core/input';
import { padGlyph, PAD_EXTRA } from '../../core/gamepad';
import { floatIcon } from '../floatIcon';
import { mxIcon } from '../machine/decor';
import { navHoldKeys } from './nav';
import './display.css';

let info: DisplayInfo | null = null;
/** the title's settings may reload the window (borderless needs a new one); a run never does */
const inRun = () => !!G?.local;

export function displayPage(f: DocumentFragment, refresh: () => void) {
  const gs = gfxSettings();
  const cur = currentPreset(gs);
  const presets = seg<Preset | ''>('Preset', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['ultra', 'Ultra']], cur, (v) => { if (v) { applyPreset(v); refresh(); } });
  const detect = floatIcon('lens', 'Detect', () => {
    detect.lock(true); detect.classList.add('busy');
    void detectPerformance(true).then(() => { sfx('confirm'); refresh(); });
  }, { size: 30, cls: 'dp-detect', aria: 'Detect the best preset for this machine' });
  const lp = lastPerf();
  if (lp) detect.dataset.tip = `${lp.preset} · ${lp.ms} ms`;
  presets.append(detect);
  f.append(presets);

  if (isDesktop()) {
    const host = h('div', 'dp-win');
    f.append(host);
    const draw = () => {
      host.replaceChildren();
      const d = info;
      if (!d) return;
      host.append(seg<DisplayInfo['mode']>('Window', [['windowed', 'Windowed'], ['borderless', 'Borderless'], ['fullscreen', 'Fullscreen']], d.mode, (v) => {
        void displaySet({ mode: v }, !inRun()).then((r) => { if (r) { info = r; draw(); } });
      }));
      if (d.mode === 'windowed' && d.sizes.length) {
        const k = (w: number, hh: number) => `${w}x${hh}`;
        const now = k(d.width, d.height);
        const opts: [string, string][] = d.sizes.map(([w, hh]) => [k(w, hh), `${w}×${hh}`]);
        if (!opts.some(([v]) => v === now)) opts.unshift([now, `${d.width}×${d.height}`]);
        host.append(seg<string>('Size', opts.slice(-6), now, (v) => { const [w, hh] = v.split('x').map(Number); void displaySet({ width: w, height: hh }).then((r) => { if (r) info = r; }); }));
      }
      const vs = toggle('Vsync', d.vsync, (v) => { void displaySet({ vsync: v }).then((r) => { if (r) { info = r; draw(); } }); });
      host.append(vs);
      if (d.pending || d.restartFor?.length) host.append(h('div', 'dp-lamp', '<i></i><span>relaunch</span>'));
    };
    if (info) draw();
    void displayGet().then((r) => { info = r; draw(); });
  } else {
    const d = document as Document & { webkitFullscreenElement?: Element };
    f.append(toggle('Fullscreen', !!(d.fullscreenElement || d.webkitFullscreenElement), (v) => { browserFullscreen(v); }));
  }

  f.append(seg<number>('Frame cap', [[0, 'Off'], [30, '30'], [60, '60'], [120, '120'], [144, '144']], gs.fpsCap ?? 0, (v) => { const s = gfxSettings(); s.fpsCap = v; saveGfx(s); setFpsCap(v); }));
  f.append(seg<number>('Render scale', [[0.5, '50%'], [0.75, '75%'], [1, '100%']], gs.renderScale ?? 1, (v) => { const s = gfxSettings(); s.renderScale = v; saveGfx(s); refresh(); }));
  const us = uiSettings();
  f.append(toggle('Pause in background', us.focusPause !== false, (v) => { const u = uiSettings(); u.focusPause = v; saveUiSettings(u); }));
}

// ================================================================== rebinding
function liveBindings(): Record<Action, string[]> { return (G?.input?.bindings as Record<Action, string[]> | undefined) ?? savedBindings(); }
function commit(b: Record<Action, string[]>) {
  const inp = G?.input;
  if (inp) { Object.assign(inp.bindings, b); inp.saveBindings(); } else storeBindings(b);
}
const NAME = new Map(REBINDABLE);

export function rebindPanel(): HTMLElement {
  const box = h('div', 'rb');
  const b = liveBindings();
  const rows = new Map<Action, HTMLElement>();
  let listening: { a: Action; i: number; cap: HTMLElement } | null = null;

  const capText = (c: string | undefined) => (c ? keyLabel(c) : '·');
  const flash = (a: Action, cls: string) => { const r = rows.get(a); if (!r) return; r.classList.remove(cls); void r.offsetWidth; r.classList.add(cls); setTimeout(() => r.classList.remove(cls), 900); };
  const dupCheck = () => {
    const seen = new Map<string, Action>();
    for (const r of rows.values()) r.classList.remove('dup');
    for (const [a] of REBINDABLE) for (const c of b[a] || []) {
      const o = seen.get(c);
      if (o) { rows.get(a)?.classList.add('dup'); rows.get(o)?.classList.add('dup'); } else seen.set(c, a);
    }
  };
  const paint = (a: Action) => {
    const r = rows.get(a); if (!r) return;
    const caps = r.querySelectorAll<HTMLElement>('.rb-cap');
    caps.forEach((cap, i) => { cap.textContent = capText(b[a]?.[i]); cap.classList.toggle('none', !b[a]?.[i]); });
  };
  const stop = () => {
    if (!listening) return;
    listening.cap.classList.remove('listen');
    listening = null;
    navHoldKeys(null);
  };
  const assign = (a: Action, i: number, code: string) => {
    if (RESERVED_KEYS[code]) { sfx('error'); flash(a, 'bad'); const r = rows.get(a); if (r) r.dataset.tip = `${keyLabel(code)}: ${RESERVED_KEYS[code]}`; return; }
    const keys = [...(b[a] || [])];
    const old = keys[i];
    // the key is on another action: it moves here, that action takes this slot's old key
    for (const [o] of REBINDABLE) {
      if (o === a) continue;
      const j = (b[o] || []).indexOf(code);
      if (j < 0) continue;
      const ok = [...b[o]];
      if (old && !ok.includes(old)) ok[j] = old; else ok.splice(j, 1);
      b[o] = ok; paint(o); flash(o, 'moved');
    }
    const k2 = keys.filter((c, n) => c !== code || n === i);
    k2[Math.min(i, k2.length)] = code;
    b[a] = k2.filter(Boolean);
    commit(b); paint(a); flash(a, 'set'); dupCheck();
    sfx('toggle');
  };
  const listen = (a: Action, i: number, cap: HTMLElement) => {
    stop();
    listening = { a, i, cap };
    cap.classList.add('listen');
    cap.textContent = '…';
    sfx('click');
    navHoldKeys((e) => {
      if (e.type !== 'keydown' || !listening) return;
      const L = listening;
      stop();
      if (e.code === 'Escape') { paint(L.a); sfx('back'); return; }
      if (e.code === 'Backspace') { const k = [...(b[L.a] || [])]; k.splice(L.i, 1); b[L.a] = k; commit(b); paint(L.a); dupCheck(); sfx('back'); return; }
      assign(L.a, L.i, e.code);
      L.cap.focus({ preventScroll: true });
    });
  };

  // the column heads are little models (a key, a key, the pad), no words
  const head = h('div', 'rb-row rb-head', '<span></span>');
  for (const k of ['key', 'key', 'joystick'] as const) { const c = h('span', 'rb-col'); const cv = mxIcon(k, 18); if (cv) c.append(cv); head.append(c); }
  box.append(head);
  for (const [a, name] of REBINDABLE) {
    const r = h('div', 'rb-row');
    r.append(h('span', 'rb-n', esc(name)));
    for (let i = 0; i < 2; i++) {
      const cap = h('button', 'rb-cap') as HTMLButtonElement;
      cap.type = 'button';
      cap.setAttribute('aria-label', `${name}: key ${i + 1}`);
      cap.addEventListener('click', (e) => { e.stopPropagation(); if (listening?.cap === cap) { stop(); paint(a); } else listen(a, i, cap); });
      r.append(cap);
    }
    r.append(h('span', 'rb-pad', esc(padGlyph(a))));
    rows.set(a, r);
    box.append(r);
    paint(a);
  }
  dupCheck();
  const reset = floatIcon('wrench', 'Defaults', () => {
    stop();
    for (const [a] of REBINDABLE) { b[a] = [...DEFAULT_BINDINGS[a]]; paint(a); }
    commit(b); dupCheck(); sfx('confirm');
  }, { size: 30, cls: 'rb-reset' });
  box.append(reset);
  const pad = h('div', 'rb-padx');
  for (const [k, v] of PAD_EXTRA) pad.append(h('div', 't-ctl', `<kbd>${esc(k)}</kbd><span>${esc(v)}</span>`));
  box.append(pad);
  // leaving the page mid-listen gives the keys back to the menus
  const mo = new MutationObserver(() => { if (!box.isConnected) { stop(); mo.disconnect(); } });
  requestAnimationFrame(() => { if (box.parentElement) mo.observe(document.body, { childList: true, subtree: true }); });
  return box;
}
