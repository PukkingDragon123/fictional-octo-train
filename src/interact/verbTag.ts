// What is left of the context menu: a one-word tag. Any system that still
// hands a list of options to G.ui.openMenu (an item in the backpack, a radio,
// a treat-this-wound picker) gets a small label at the pointer showing ONE verb
// at a time: the wheel, the arrow keys or the ‹ › marks step through them, a
// click / Enter does it, Esc or a click elsewhere puts it away. No list.
import './grab.css';
import { G } from '../game/G';
import type { MenuOption } from '../ui/ui';
import { flatten, Verb } from './verbs';

export interface VerbTagHandle { el: HTMLDivElement; close: () => void }

export function openVerbTag(x: number, y: number, title: string, opts: MenuOption[], icon: string, onClose: () => void): VerbTagHandle | null {
  const verbs: (Verb & { danger?: boolean })[] = [];
  const dangers = new Set<string>();
  for (const o of opts) if (o?.danger) dangers.add(o.label);
  for (const v of flatten(opts)) verbs.push({ ...v, danger: dangers.has(v.label.split(': ')[0]) });
  if (!verbs.length) return null;
  let sel = Math.max(0, verbs.findIndex((v) => !v.why));
  const el = document.createElement('div');
  el.className = 'gx-tag';
  el.setAttribute('role', 'listbox');
  el.setAttribute('aria-label', title || 'Actions');
  const draw = () => {
    const v = verbs[sel];
    el.classList.toggle('dis', !!v.why);
    el.classList.toggle('danger', !!v.danger);
    el.innerHTML = `${title ? `<div class="gx-t">${icon ? `<img src="${icon}" alt="">` : ''}${esc(title)}</div>` : ''}<div class="gx-row">${verbs.length > 1 ? '<i data-d="-1">‹</i>' : ''}<b role="option" aria-selected="true">${esc(v.label)}</b>${verbs.length > 1 ? `<i data-d="1">›</i><em>${sel + 1}/${verbs.length}</em>` : ''}</div>${v.why ? `<div class="gx-why">${esc(String(v.why))}</div>` : ''}`;
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
