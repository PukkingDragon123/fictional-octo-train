// FIRST-RUN KEY HINTS (round 18): the core keys, each shown once, small, low over the hotbar: a key cap and a
// word or two. They come one at a time when they matter (move at the start; E when something can be used; Q when
// something new can be scanned; F once the unit has been about a while; Tab for the wrist terminal; the build kit
// when it is on the hotbar), go when the key is pressed (or after a few seconds), and never come back
// (localStorage). Not on touch (the pad shows its own), not while a cinematic, the tutorial or a menu has the screen.
import { G } from '../game/G';
import { TUT } from '../game/tutorial/state';
import { isTouchMode } from './touch/mode';

interface Hint { id: string; keys: string[]; word: string; done: string[]; when: (t: number) => boolean }
const STORE = 'noclip.keyHints';
const seen = (): Set<string> => { try { return new Set(JSON.parse(localStorage.getItem(STORE) || '[]')); } catch { return new Set(); } };
const mark = (id: string) => { try { const s = seen(); s.add(id); localStorage.setItem(STORE, JSON.stringify([...s])); } catch { /* storage blocked */ } };
const tagText = () => [...document.querySelectorAll('#wprompt .wp-tag.vis')].map((e) => e.textContent || '').join(' ');

const HINTS: Hint[] = [
  { id: 'move', keys: ['W', 'A', 'S', 'D'], word: 'move', done: ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'], when: (t) => t > 3 },
  { id: 'use', keys: ['E'], word: 'use what is in reach', done: ['KeyE'], when: () => !!document.querySelector('#wprompt .wp-tag.prim.vis') },
  { id: 'scan', keys: ['Q'], word: 'hold: scan', done: ['KeyQ'], when: () => /Scan/.test(tagText()) },
  { id: 'lamp', keys: ['F'], word: 'suit lamp', done: ['KeyF'], when: (t) => t > 45 },
  { id: 'watch', keys: ['Tab'], word: 'wrist terminal', done: ['Tab'], when: (t) => t > 75 },
  { id: 'build', keys: ['1'], word: 'build kit', done: ['Digit1'], when: () => !!G.local?.allItems?.().some((i) => i.key === 'build_kit') && !(G.build as { active?: boolean } | undefined)?.active },
];

let installed = false;
export function installKeyHints() {
  if (installed) return;
  installed = true;
  const el = document.createElement('div');
  el.className = 'kh';
  el.setAttribute('aria-live', 'polite');
  document.body.append(el);
  const style = document.createElement('style');
  style.textContent = `.kh { position: fixed; left: 50%; bottom: 96px; transform: translate(-50%, 6px); z-index: 25; display: flex; align-items: center; gap: 8px; pointer-events: none;
  font-family: var(--font-new); font-size: 16px; color: #f2e8c8; text-shadow: 1px 1px 0 #0b0a07, -1px 0 0 #0b0a07, 0 -1px 0 #0b0a07; opacity: 0; transition: opacity .25s ease, transform .25s ease; }
.kh.on { opacity: 1; transform: translate(-50%, 0); }
.kh kbd { font: inherit; min-width: 14px; text-align: center; padding: 1px 6px 3px; color: #ffd768; background: rgba(11, 10, 7, 0.78); box-shadow: inset 0 0 0 1px #6a5a30, 0 2px 0 #0b0a07; text-shadow: none; }
.kh span { margin-left: 4px; }`;
  document.head.append(style);
  let cur: Hint | null = null, shownT = 0, gap = 0, runT = 0, last = performance.now();
  const done = (id: string) => { mark(id); if (cur?.id === id) { el.classList.remove('on'); cur = null; gap = 4; } };
  window.addEventListener('keydown', (e) => {
    for (const h of HINTS) if (h.done.includes(e.code) && !seen().has(h.id)) {
      // a key the unit already knows: no hint for it later either (only once the run has started)
      if (G.local && runT > 1) done(h.id);
    }
  }, true);
  const blocked = () => isTouchMode() || !G.local || !!G.paused || TUT.running || document.body.classList.contains('noclip-cine')
    || document.documentElement.classList.contains('lp-busy') || !!document.querySelector('.wt.on, .ptm, .ps2, .fpk.on');
  G.addSystem({ name: 'keyHints', update: () => {
    const now = performance.now(), dt = Math.min(0.25, (now - last) / 1000); last = now;
    if (!G.local) { runT = 0; return; }
    runT += dt;
    if (cur) {
      shownT += dt;
      if (shownT > 9 || blocked()) { if (shownT > 9) mark(cur.id); el.classList.remove('on'); cur = null; gap = 5; }
      return;
    }
    if (gap > 0) { gap -= dt; return; }
    if (blocked()) return;
    const s = seen();
    // move comes first; the rest wait for it (or a while)
    const h = HINTS.find((q) => !s.has(q.id) && (q.id === 'move' || s.has('move') || runT > 14) && q.when(runT));
    if (!h) return;
    cur = h; shownT = 0;
    el.innerHTML = h.keys.map((k) => `<kbd>${k}</kbd>`).join('') + `<span>${h.word}</span>`;
    void el.offsetWidth;
    el.classList.add('on');
  } });
}
