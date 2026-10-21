// What is left of the context menu: one word. Any system that still hands a
// list of options to G.ui.openMenu (an item in the backpack, a radio, a
// treat-this-wound picker) gets free text at the pointer (a real typeface, no
// box) showing ONE verb at a time with its stencil pictogram and a row of
// rivets for where it is in the list: the wheel, the arrow keys or ‹ › step,
// a click / Enter does it, Esc or a click elsewhere puts it away. No list.
import './grab.css';
import { G } from '../game/G';
import type { MenuOption } from '../ui/ui';
import { flatten, Verb } from './verbs';
import { verbGlyph, glyphUrl } from './signs';

export interface VerbTagHandle { el: HTMLDivElement; close: () => void }

export function openVerbTag(x: number, y: number, title: string, opts: MenuOption[], icon: string, onClose: () => void): VerbTagHandle | null {
  const verbs: (Verb & { danger?: boolean })[] = [];
  const dangers = new Set<string>();
  for (const o of opts) if (o?.danger) dangers.add(o.label);
  for (const v of flatten(opts)) verbs.push({ ...v, danger: dangers.has(v.label.split(': ')[0]) });
  if (!verbs.length) return null;
  let sel = Math.max(0, verbs.findIndex((v) => !v.why));
  const el = document.createElement('div');
  el.className = 'gx-tag nc-free-text';
  el.setAttribute('role', 'listbox');
  el.setAttribute('aria-label', title || 'Actions');
  const draw = () => {
    const v = verbs[sel];
    el.classList.toggle('dis', !!v.why);
    el.classList.toggle('danger', !!v.danger);
    const n = verbs.length;
    const pip = n > 1 ? `<span class="gx-pips">${Array.from({ length: Math.min(n, 12) }, (_, j) => `<i${j === (n > 12 ? Math.round(sel / (n - 1) * 11) : sel) ? ' class="on"' : ''}></i>`).join('')}</span>` : '';
    el.innerHTML = `${title ? `<span class="gx-t">${esc(title)}</span>` : ''}<span class="gx-row"><span class="gx-cyc">${n > 1 ? '<i data-d="-1">‹</i>' : ''}<img class="gx-g" src="${glyphUrl(verbGlyph(v.label))}" alt=""><b role="option" aria-selected="true">${esc(v.label.replace(/\s*\(.*?\)/g, ''))}</b>${n > 1 ? '<i data-d="1">›</i>' : ''}</span>${pip}</span>${v.why ? `<em class="gx-why">${esc(String(v.why))}</em>` : ''}`;
  };
  const step = (d: number) => { sel = (sel + d + verbs.length) % verbs.length; draw(); G.audio?.ui?.('hover', 0.5); };
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    el.remove();
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('wheel', onWheel, true);
    onClose();
  };
  const run = () => {
    const v = verbs[sel];
    if (v.why) { G.audio?.ui?.('error', 0.6); return; }
    close();
    G.audio?.ui?.('click');
    v.run();
  };
  const onKey = (e: KeyboardEvent) => {
    const k = e.key;
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape', ' '].includes(k)) return;
    e.stopPropagation(); e.preventDefault();
    if (k === 'Escape') close();
    else if (k === 'Enter' || k === ' ') run();
    else step(k === 'ArrowUp' || k === 'ArrowLeft' ? -1 : 1);
  };
  const onWheel = (e: WheelEvent) => { e.preventDefault(); e.stopImmediatePropagation(); step(Math.sign(e.deltaY) || 1); };
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    // ‹ › step, the word does it
    const d = (e.target as HTMLElement).dataset?.d;
    if (d) step(Number(d)); else run();
  });
  el.addEventListener('contextmenu', (e) => { e.preventDefault(); close(); });
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('wheel', onWheel, { capture: true, passive: false });
  draw();
  document.body.appendChild(el);
  const r = el.getBoundingClientRect();
  el.style.left = Math.max(4, Math.min(x + 10, window.innerWidth - r.width - 6)) + 'px';
  el.style.top = Math.max(4, Math.min(y + 10, window.innerHeight - r.height - 6)) + 'px';
  G.audio?.ui?.('menu', 0.5);
  return { el, close };
}


function esc(s: string) { return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as any)[c]); }
