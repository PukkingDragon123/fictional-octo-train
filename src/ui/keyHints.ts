// FIRST-RUN KEY HINTS (round 18): the core keys, each shown once, at the moment it is needed, small and low over
// the hotbar: pixel key caps (src/ui/menus/guide/tourArt.ts; the cap sinks when the key is pressed) and a word or
// two in floating type. Move at the start; E the first time something can be used; Q when the first new thing
// that can be scanned is near; F the first time it is dark round the unit; the build kit the first time the unit
// picks something up (there is now something to build with); Tab for the wrist terminal a while in. Each goes
// when its key is pressed (or after a few seconds) and never comes back (localStorage). Not on touch (the pad has
// its own), not while a cinematic, the tutorial or a menu has the screen.
import { G } from '../game/G';
import { bus } from '../core/events';
import { TUT } from '../game/tutorial/state';
import { isTouchMode } from './touch/mode';
import { capEl } from './menus/guide/tourArt';

interface Hint { id: string; keys: string[]; word: string; done: string[]; when: (t: number) => boolean }
const STORE = 'noclip.keyHints';
const seen = (): Set<string> => { try { return new Set(JSON.parse(localStorage.getItem(STORE) || '[]')); } catch { return new Set(); } };
const mark = (id: string) => { try { const s = seen(); s.add(id); localStorage.setItem(STORE, JSON.stringify([...s])); } catch { /* storage blocked */ } };
const tagText = () => [...document.querySelectorAll('#wprompt .wp-tag.vis')].map((e) => e.textContent || '').join(' ');
let pickedUp = false;
const dark = () => { const p = G.local, f = (G as unknown as { lightLevelAt?: (x: number, z: number) => number }).lightLevelAt; return !!p && !!f && f(p.x, p.z) < 0.22; };

const HINTS: Hint[] = [
  { id: 'move', keys: ['W', 'A', 'S', 'D'], word: 'move', done: ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'], when: (t) => t > 3 },
  { id: 'use', keys: ['E'], word: 'use', done: ['KeyE'], when: () => !!document.querySelector('#wprompt .wp-tag.prim.vis') },
  { id: 'scan', keys: ['Q'], word: 'hold: scan', done: ['KeyQ'], when: () => /Scan/.test(tagText()) },
  { id: 'lamp', keys: ['F'], word: 'lamp', done: ['KeyF'], when: () => dark() },
  { id: 'build', keys: ['1'], word: 'build kit', done: ['Digit1'], when: () => pickedUp && !!G.local?.allItems?.().some((i) => i.key === 'build_kit') && !(G.build as { active?: boolean } | undefined)?.active },
  { id: 'watch', keys: ['Tab'], word: 'wrist terminal', done: ['Tab'], when: (t) => t > 90 },
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
  style.textContent = `.kh { position: fixed; left: 50%; bottom: 96px; transform: translate(-50%, 6px); z-index: 25; display: flex; align-items: center; gap: 6px; pointer-events: none;
  font-family: var(--font-new); font-size: 17px; color: #f6ecd0; text-shadow: 2px 2px 0 #0b0a07, -1px -1px 0 #0b0a07, 1px -1px 0 #0b0a07, -1px 1px 0 #0b0a07; opacity: 0; transition: opacity .25s ease, transform .25s ease; }
.kh.on { opacity: 1; transform: translate(-50%, 0); }
.kh .tcap { background-position: 0 0; filter: drop-shadow(0 3px 0 rgba(11, 10, 7, 0.6)); }
.kh .tcap.hot { background-position: 0 calc(var(--ch) * -1); }
.kh .tcap.down { background-position: 0 calc(var(--ch) * -2); }
.kh span { margin-left: 6px; }`;
  document.head.append(style);
  let cur: Hint | null = null, shownT = 0, gap = 0, runT = 0, last = performance.now();
  const hide = (id: string) => { if (cur?.id === id) { el.classList.remove('on'); cur = null; gap = 4; } };
  bus.on('itemPickedUp', (p: { isLocal?: boolean } | null) => { if (!p || p.isLocal !== false) pickedUp = true; });
  window.addEventListener('keydown', (e) => {
    if (!G.local || runT < 1) return;
    for (const h of HINTS) if (h.done.includes(e.code) && !seen().has(h.id)) {
      // the cap on screen sinks under the finger, then the hint goes; a key already known needs no hint later
      if (cur?.id === h.id) { const caps = el.querySelectorAll('.tcap'); caps[Math.max(0, h.keys.indexOf(e.key.toUpperCase()))]?.classList.add('down'); setTimeout(() => hide(h.id), 260); }
      mark(h.id);
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
      // a slow glow on the caps while it waits
      const lit = Math.floor(shownT * 1.6) % 2 === 0;
      el.querySelectorAll('.tcap:not(.down)').forEach((c) => c.classList.toggle('hot', lit));
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
    el.replaceChildren(...h.keys.map((k) => capEl(k, 2)), Object.assign(document.createElement('span'), { textContent: h.word }));
    void el.offsetWidth;
    el.classList.add('on');
  } });
}
