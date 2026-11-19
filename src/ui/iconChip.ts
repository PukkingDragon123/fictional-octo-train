// ICON CHIPS (round 21): a menu key that is a small 3D model (src/ui/machine/decor.ts) instead of a word. It sways on
// its turntable, lifts, tilts and lights while the pointer is on it, sinks when pressed, with the recorded switchgear
// clicks (src/ui/menus/sfx.ts). Its name floats over it in slightly 3D Alagard only while it is hot (no plate, no box);
// a number (a count) can sit on its corner. Inside the band's tube (.wt) the model and the name take the phosphor.
//   iconChip(kind, name, fn, o)   -> { el, set(on), count(n), lock(v), ping(), name(t) }
//   floatName()                   a free-floating name for things drawn on a canvas (the survey map's markers)
import type { IconKind } from './machine/decor';
import { pixSprite } from './floatIcon';
import { sfx } from './menus/sfx';

export interface IconChip { el: HTMLButtonElement; set(on: boolean): void; count(n: number | string | null): void; lock(v: boolean): void; ping(): void; name(t: string): void }
export interface ChipOpts { size?: number; cls?: string; num?: number | string | null; on?: boolean; locked?: boolean; below?: boolean; quiet?: boolean; sound?: 'click' | 'toggle' | 'tab' | 'confirm' | 'back' }

let styled = false;
function style() {
  if (styled) return;
  styled = true;
  const st = document.createElement('style');
  st.textContent = `
.ic21 { position: relative; display: inline-flex; align-items: center; justify-content: center; flex: none; margin: 0; padding: 3px; border: 0; background: none; cursor: pointer; line-height: 0; color: #ffd27a;
  filter: drop-shadow(0 2px 0 rgba(8, 7, 4, .6)); transition: transform .14s cubic-bezier(.2, .9, .3, 1.5), filter .12s ease; transform-origin: 50% 80%; -webkit-tap-highlight-color: transparent; }
.ic21, .ic21 * { border-radius: 0 !important; }
.ic21 > canvas { display: block; image-rendering: pixelated; pointer-events: none; }
.ic21:hover, .ic21:focus-visible, .ic21.hot { transform: translateY(-4px) rotate(-5deg) scale(1.1); outline: none;
  filter: brightness(1.28) drop-shadow(0 0 6px rgba(255, 196, 90, .55)) drop-shadow(0 5px 0 rgba(8, 7, 4, .45)); }
.ic21:active, .ic21.down { transform: translateY(1px) scale(.92); transition-duration: .05s; filter: brightness(1.45) drop-shadow(0 0 9px rgba(255, 210, 110, .8)); }
.ic21.on::after { content: ''; position: absolute; left: 50%; bottom: -3px; width: 10px; height: 4px; transform: translateX(-50%);
  background: radial-gradient(ellipse at 50% 50%, #fff4c8 0 25%, #ffb030 55%, rgba(255, 176, 48, 0) 100%); box-shadow: 0 0 8px 2px rgba(255, 176, 48, .55); }
.ic21.off > canvas { filter: grayscale(.8) brightness(.6); }
.ic21.off:hover > canvas { filter: grayscale(.3) brightness(.9); }
.ic21.lock > canvas { filter: grayscale(.85) brightness(.68) contrast(1.05); }
.ic21.lock::before { content: ''; position: absolute; right: 0; bottom: 1px; width: 9px; height: 11px; z-index: 1; background: var(--ic21-lock) center / 100% 100% no-repeat; image-rendering: pixelated; }
.ic21.shake { animation: ic21-shake .32s steps(6) both; }
@keyframes ic21-shake { 20% { translate: -3px 0; } 40% { translate: 3px 0; } 60% { translate: -2px 0; } 80% { translate: 2px 0; } }
.ic21.ping > canvas { animation: ic21-ping .5s cubic-bezier(.2, .9, .3, 1.6) both; }
@keyframes ic21-ping { 0% { transform: scale(1); } 35% { transform: translateY(-5px) scale(1.22) rotate(8deg); } 100% { transform: none; } }
.ic21-c { position: absolute; right: -2px; bottom: -1px; z-index: 2; font: 13px/1 var(--font-new); color: #fff0c0; pointer-events: none;
  text-shadow: 1px 1px 0 #120e06, -1px -1px 0 #120e06, 1px -1px 0 #120e06, -1px 1px 0 #120e06, 0 2px 0 #120e06; }
.ic21-n, .fn21 { position: absolute; left: 50%; bottom: calc(100% + 2px); z-index: 30; transform: translate(-50%, 5px) scale(.92); opacity: 0; white-space: nowrap; pointer-events: none;
  font: 17px/1 var(--font-new); letter-spacing: .05em; color: #ffd98a; transition: opacity .12s ease, transform .16s cubic-bezier(.2, .9, .3, 1.4);
  text-shadow: 0 1px 0 #b0701c, 0 2px 0 #7a4a10, 0 3px 0 #4a2c08, 1px 1px 0 #1a1004, -1px -1px 0 #1a1004, 1px -1px 0 #1a1004, -1px 1px 0 #1a1004, 0 5px 6px rgba(0, 0, 0, .65), 0 0 12px rgba(255, 190, 80, .3); }
.ic21.below .ic21-n { bottom: auto; top: calc(100% + 2px); transform: translate(-50%, -5px) scale(.92); }
.ic21:hover .ic21-n, .ic21:focus-visible .ic21-n, .ic21.hot .ic21-n, .n21:hover > .ic21-n, .n21:focus-visible > .ic21-n, .n21.mx-hot > .ic21-n { opacity: 1; transform: translate(-50%, 0) scale(1); }
.n21.below > .ic21-n { bottom: auto; top: calc(100% + 2px); }
.ic21-fb { display: flex; align-items: center; justify-content: center; font: 15px/1 var(--font-new); box-shadow: inset 0 0 0 2px currentColor; }
.fn21 { position: fixed; left: 0; top: 0; bottom: auto; z-index: 990; }
.fn21.on { opacity: 1; }
/* in the band's tube: phosphor */
.wt .ic21 > canvas { filter: var(--mono) drop-shadow(0 0 4px var(--glow)); opacity: .82; }
.wt .ic21:hover > canvas, .wt .ic21.on > canvas, .wt .ic21.hot > canvas { opacity: 1; filter: var(--mono) brightness(1.3) drop-shadow(0 0 7px var(--glow)); }
.wt .ic21.off > canvas { opacity: .45; }
.wt .ic21 { color: var(--ph); filter: none; }
.wt .ic21:hover, .wt .ic21:focus-visible { filter: none; }
.wt .ic21-n { color: var(--ph-hi); text-shadow: 0 1px 0 var(--ph-dim), 0 2px 0 var(--ph-dark), 0 3px 0 #010302, 0 0 8px var(--glow); }
.wt .ic21-c { color: var(--ph-hi); text-shadow: 1px 1px 0 #010302, -1px -1px 0 #010302, 1px -1px 0 #010302, -1px 1px 0 #010302; }
.wt .ic21.on::after { background: var(--ph); box-shadow: 0 0 8px 2px var(--glow); }
`;
  document.head.append(st);
  // a pixel padlock for a key not researched yet
  const cv = document.createElement('canvas'); cv.width = 9; cv.height = 11;
  const c = cv.getContext('2d')!;
  const rows = ['..kkkkk..', '.kssss.k.', '.ks...sk.', '.ks...sk.', 'kkkkkkkkk', 'kbbbbbbbk', 'kbyyyyybk', 'kbyykyybk', 'kbyykyybk', 'kbbbbbbbk', 'kkkkkkkkk'];
  const pal: Record<string, string> = { k: '#120e06', s: '#c8ccc4', b: '#8a6a24', y: '#e0b040' };
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (pal[ch]) { c.fillStyle = pal[ch]; c.fillRect(x, y, 1, 1); } }));
  document.documentElement.style.setProperty('--ic21-lock', `url(${cv.toDataURL()})`);
}

export function iconChip(kind: IconKind, name: string, fn: (() => void) | null, o: ChipOpts = {}): IconChip {
  style();
  const size = o.size ?? 26;
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'ic21' + (o.cls ? ' ' + o.cls : '') + (o.below ? ' below' : '');
  b.setAttribute('aria-label', name);
  // round 22: the floating pixel sprite (./floatIcon.ts), not the old small decor render
  const ic = pixSprite(kind, size);
  if (ic) b.append(ic.cv);
  else { const f = document.createElement('span'); f.className = 'ic21-fb'; f.style.width = f.style.height = size + 'px'; f.textContent = name.slice(0, 1).toUpperCase(); b.append(f); }
  const nm = document.createElement('span'); nm.className = 'ic21-n'; nm.textContent = name;
  const cnt = document.createElement('span'); cnt.className = 'ic21-c';
  b.append(nm, cnt);
  let locked = !!o.locked;
  const hot = (v: boolean) => { ic?.hot(v); };
  b.addEventListener('pointerenter', () => { hot(true); if (!o.quiet) sfx('hover', 0.22); });
  b.addEventListener('pointerleave', () => { hot(false); b.classList.remove('down'); });
  b.addEventListener('focus', () => hot(true));
  b.addEventListener('blur', () => hot(false));
  b.addEventListener('pointerdown', () => b.classList.add('down'));
  b.addEventListener('pointerup', () => b.classList.remove('down'));
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    if (locked) { sfx('error', 0.35); b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); return; }
    sfx(o.sound ?? 'click', 0.5);
    api.ping();
    fn?.();
  });
  const api: IconChip = {
    el: b,
    set: (on) => { b.classList.toggle('on', on); b.classList.toggle('off', !on); },
    count: (n) => { const t = n === null || n === undefined || n === '' || n === 0 ? '' : String(n); if (cnt.textContent !== t) cnt.textContent = t; },
    lock: (v) => { locked = v; b.classList.toggle('lock', v); },
    ping: () => { b.classList.remove('ping'); void b.offsetWidth; b.classList.add('ping'); },
    name: (t) => { if (nm.textContent !== t) { nm.textContent = t; b.setAttribute('aria-label', t); } },
  };
  if (o.on !== undefined) api.set(o.on);
  if (o.locked) api.lock(true);
  if (o.num !== undefined) api.count(o.num);
  return api;
}

/** a hover name for any key (a machine key with a model on its cap): floats over it only while it is hot */
export function nameTag(host: HTMLElement, name: string, below = false) {
  style();
  host.classList.add('n21');
  if (below) host.classList.add('below');
  host.setAttribute('aria-label', name);
  const nm = document.createElement('span'); nm.className = 'ic21-n'; nm.textContent = name;
  host.append(nm);
  host.addEventListener('pointerenter', () => sfx('hover', 0.2));
  return nm;
}

/** a name floating at a screen point (for markers drawn on a canvas): show(text, x, y) / hide() */
export function floatName(): { el: HTMLElement; show(t: string, x: number, y: number): void; hide(): void } {
  style();
  const e = document.createElement('span');
  e.className = 'fn21';
  document.body.append(e);
  return {
    el: e,
    show: (t, x, y) => { if (e.textContent !== t) e.textContent = t; e.style.left = Math.round(x) + 'px'; e.style.top = Math.round(y - 30) + 'px'; e.classList.add('on'); e.style.transform = 'translate(-50%, 0)'; },
    hide: () => { e.classList.remove('on'); e.style.transform = ''; },
  };
}
