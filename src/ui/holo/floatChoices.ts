// Choices as floating type in front of the scene (the same letters as cineText.ts): each option hangs at its own
// depth and slant and drifts; under the pointer it comes forward, brightens, and a thin thread of light runs from
// it to the speaker; picked, the others dissolve and it flies to the speaker. Keys 1-9 pick, Esc cancels.
// No panel, no boxes.
//
//   const c = floatChoices([{ id: 'a', label: 'The debt' }, ...], {
//     onPick: (id) => {...},        // after the pick animation has started
//     onCancel: () => {...},        // Esc (optional; without it Esc does nothing)
//     speaker: () => ({ x, y }),    // the speaker's head on screen, CSS px (the thread and the flight aim there)
//     side: 'right',                // where the options hang: 'right' (default), 'left', 'low'
//   });
//   c.close();                      // dissolve them without a pick
import { sfx } from '../menus/sfx';
import './cineText.css';
import './floatChoices.css';

export interface FloatChoice { id: string; label: string; tone?: 'calder' | 'warm' }
export interface FloatChoicesOpts {
  onPick: (id: string) => void;
  onCancel?: () => void;
  speaker?: () => { x: number; y: number } | null;
  side?: 'right' | 'left' | 'low';
}
export interface FloatChoicesHandle { close(): void; readonly open: boolean }

const SVG = 'http://www.w3.org/2000/svg';

export function floatChoices(list: FloatChoice[], o: FloatChoicesOpts): FloatChoicesHandle {
  const layer = document.createElement('div');
  layer.className = 'fc-layer';
  const svg = document.createElementNS(SVG, 'svg'); svg.setAttribute('class', 'fc-thread');
  const line = document.createElementNS(SVG, 'polyline'); svg.appendChild(line); layer.appendChild(svg);
  document.body.appendChild(layer);
  const items: { el: HTMLDivElement; c: FloatChoice }[] = [];
  let hot: HTMLDivElement | null = null, open = true, raf = 0;
  const phone = window.innerWidth < 700;
  const side = phone ? 'low' : o.side ?? 'right';

  list.forEach((c, i) => {
    const el = document.createElement('div');
    el.className = 'fc-c' + (c.tone === 'warm' ? ' fc-warm' : '');
    el.setAttribute('role', 'button'); el.tabIndex = 0; el.setAttribute('aria-label', c.label);
    const z = [-60, 10, -25, 35, -45, 0][i % 6], ry = (side === 'left' ? 1 : -1) * (14 - (i % 3) * 5);
    const n = list.length;
    const x = side === 'low' ? 50 + ((i % 2) * 2 - 1) * 9 : side === 'left' ? 8 + (i % 2) * 7 + (i % 3) * 2 : 66 + (i % 2) * 7 - (i % 3) * 2;
    const y = side === 'low' ? 56 + i * 6.5 : 27 + i * (46 / Math.max(1, n - 1));
    el.style.left = x + 'vw'; el.style.top = y + 'vh';
    el.style.setProperty('--z', z + 'px'); el.style.setProperty('--ry', ry + 'deg'); el.style.setProperty('--ph', `${-i * 1.3}s`);
    const num = document.createElement('span'); num.className = 'fc-n'; num.textContent = String(i + 1);
    const body = document.createElement('span'); body.className = 'fc-t';
    let k = 0;
    for (const word of c.label.split(' ')) {
      const w = document.createElement('span'); w.className = 'ct-w';
      for (const ch of word) {
        const g = document.createElement('span'); g.className = 'ct-g'; g.textContent = ch;
        g.style.setProperty('--d', `${i * 120 + k * 26}ms`); g.style.setProperty('--r', `${(((k * 7919) % 13) - 6) * 3}deg`); g.style.setProperty('--o', `${k * 10}ms`);
        w.appendChild(g); k++;
      }
      body.append(w, document.createTextNode(' '));
    }
    el.append(num, body);
    el.addEventListener('pointerenter', () => hover(el));
    el.addEventListener('pointerleave', () => { if (hot === el) hover(null); });
    el.addEventListener('focus', () => hover(el));
    el.addEventListener('click', () => pick(i));
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(i); } });
    layer.appendChild(el);
    items.push({ el, c });
  });

  function hover(el: HTMLDivElement | null) {
    if (hot === el) return;
    hot?.classList.remove('hot');
    hot = el;
    if (el) { el.classList.add('hot'); sfx('tick', 0.25); }
  }
  function thread() {
    raf = requestAnimationFrame(thread);
    const h = hot && o.speaker?.();
    if (!hot || !h) { svg.classList.remove('on'); return; }
    const r = hot.getBoundingClientRect();
    const ax = side === 'left' ? r.right + 6 : r.left - 6, ay = r.top + r.height / 2;
    line.setAttribute('points', `${ax},${ay} ${(ax + h.x) / 2},${Math.min(ay, h.y) - 24} ${h.x},${h.y + 30}`);
    svg.classList.add('on');
  }
  raf = requestAnimationFrame(thread);
  function finish(keep?: HTMLDivElement) {
    open = false;
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', keys, true);
    for (const { el } of items) { if (el !== keep) { el.classList.add('out'); el.style.pointerEvents = 'none'; } }
    if (keep) {
      const h = o.speaker?.(), r = keep.getBoundingClientRect();
      if (h) { keep.style.setProperty('--fx', `${h.x - (r.left + r.width / 2)}px`); keep.style.setProperty('--fy', `${h.y + 20 - (r.top + r.height / 2)}px`); }
      keep.classList.add('fly'); keep.style.pointerEvents = 'none';
    }
    svg.classList.remove('on');
    setTimeout(() => layer.remove(), 800);
  }
  function pick(i: number) {
    if (!open) return;
    sfx('tick', 0.5);
    finish(items[i].el);
    o.onPick(items[i].c.id);
  }
  function keys(e: KeyboardEvent) {
    if (!open) return;
    if (e.key === 'Escape' && o.onCancel) { e.stopPropagation(); e.preventDefault(); finish(); o.onCancel(); return; }
    const n = Number(e.key);
    if (n >= 1 && n <= items.length) { e.stopPropagation(); e.preventDefault(); pick(n - 1); }
  }
  window.addEventListener('keydown', keys, true);
  return { close: () => { if (open) finish(); }, get open() { return open; } };
}
