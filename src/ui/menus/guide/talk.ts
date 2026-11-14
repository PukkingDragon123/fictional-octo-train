// Talking to Dr. Calder in the lab: click her and she steps up close and turns to the lens (a two-shot: her
// near, the room behind). The questions you can ask hang in the air beside her as floating type with depth,
// the same cinematic text the people of the levels speak in (src/ui/holo/cineText.ts): each drifts at its own
// depth; under the pointer it comes forward, brightens, and a thin thread of light runs from it to her; picked,
// the others dissolve and it flies to her. No panel, no boxes. Her answers are her recorded voice where there
// is a recording (./talkLines.ts) with her line in the subtitle strip. Some answers open follow-ups, new topics
// open as the file grows (runs, deaths, inhabitants filed), and a few answers give something once: a hint, a
// blueprint for the room, some research points.
import { sfx } from '../sfx';
import { flag, setFlag, addOwned } from '../deco/store';
import { bump } from '../../../game/meridian';
import { grantResearch } from '../../../game/research';
import { TOPICS, HINTS, type Topic } from './talkLines';
import '../../holo/cineText.css';
import './talk.css';

export interface TalkHost {
  /** she says these lines (queued, interrupting), `done` after the last */
  speak(lines: { text: string; emote?: string }[], done: () => void): void;
  /** stand close to the lens (true) or go back to her spot */
  twoShot(on: boolean): void;
  /** her head on screen (CSS px), or null */
  head(): { x: number; y: number } | null;
  /** the conversation ended */
  closed(): void;
}

const ROOTS = ['debt', 'last', 'creature', 'research', 'institute', 'odd', 'room'];
const topic = (id: string) => TOPICS.find((t) => t.id === id)!;
const SVG = 'http://www.w3.org/2000/svg';

export class Talk {
  private layer: HTMLDivElement;
  private thread: SVGSVGElement;
  private line: SVGPolylineElement;
  private items: { el: HTMLDivElement; t: Topic }[] = [];
  private hot: HTMLDivElement | null = null;
  private asked = new Set<string>();
  private keys = (e: KeyboardEvent) => this.key(e);
  private raf = 0;
  open = true;

  constructor(private host: TalkHost) {
    this.layer = document.createElement('div');
    this.layer.className = 'tk-layer';
    this.thread = document.createElementNS(SVG, 'svg');
    this.thread.setAttribute('class', 'tk-thread');
    this.line = document.createElementNS(SVG, 'polyline');
    this.thread.appendChild(this.line);
    this.layer.appendChild(this.thread);
    document.body.appendChild(this.layer);
    host.twoShot(true);
    window.addEventListener('keydown', this.keys, true);
    const n = bump('talk.n');
    const hello = n <= 1 ? 'What would you like to know?' : n % 2 ? 'Ask me anything. Within reason.' : 'Anything else?';
    host.speak([{ text: hello, emote: 'wave' }], () => this.menu(ROOTS));
    const tick = () => { this.raf = requestAnimationFrame(tick); this.drawThread(); };
    this.raf = requestAnimationFrame(tick);
  }

  /** the questions on offer, floating beside her */
  private menu(ids: string[]) {
    if (!this.open) return;
    this.clearItems(false);
    const list = ids.map(topic).filter((t) => t && (!t.open || t.open()) && !(t.once && flag('talk.once.' + t.id, false)) && !(ids !== ROOTS && this.asked.has(t.id)));
    const shown: Topic[] = list.slice(0, 4);
    if (ids !== ROOTS) shown.push({ id: '_back', label: 'Something else', say: () => [] } as Topic);
    shown.push(topic('bye'));
    const phone = window.innerWidth < 700;
    shown.forEach((t, i) => {
      const el = document.createElement('div');
      el.className = 'tk-c' + (t.id === 'bye' ? ' tk-bye' : '');
      el.setAttribute('role', 'button'); el.tabIndex = 0;
      el.setAttribute('aria-label', t.label);
      // each at its own depth and slant, staggered down the right of the picture (the lower half on a phone)
      const z = [-60, 10, -25, 35, -45, 0][i % 6], ry = -14 + (i % 3) * 5;
      const x = phone ? 50 + ((i % 2) * 2 - 1) * 9 : 66 + (i % 2) * 7 - (i % 3) * 2;
      const y = phone ? 56 + i * 6.5 : 27 + i * (46 / Math.max(1, shown.length - 1));
      el.style.left = x + 'vw'; el.style.top = y + 'vh';
      el.style.setProperty('--z', z + 'px'); el.style.setProperty('--ry', ry + 'deg'); el.style.setProperty('--ph', `${-i * 1.3}s`);
      const num = document.createElement('span'); num.className = 'tk-n'; num.textContent = String(i + 1);
      const body = document.createElement('span'); body.className = 'tk-t';
      let k = 0;
      for (const word of t.label.split(' ')) {
        const w = document.createElement('span'); w.className = 'ct-w';
        for (const ch of word) {
          const g = document.createElement('span'); g.className = 'ct-g'; g.textContent = ch;
          g.style.setProperty('--d', `${i * 120 + k * 26}ms`); g.style.setProperty('--r', `${(((k * 7919) % 13) - 6) * 3}deg`); g.style.setProperty('--o', `${k * 10}ms`);
          w.appendChild(g); k++;
        }
        body.append(w, document.createTextNode(' '));
      }
      el.append(num, body);
      el.addEventListener('pointerenter', () => this.hover(el));
      el.addEventListener('pointerleave', () => { if (this.hot === el) this.hover(null); });
      el.addEventListener('focus', () => this.hover(el));
      el.addEventListener('click', () => this.pick(t, el));
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.pick(t, el); } });
      this.layer.appendChild(el);
      this.items.push({ el, t });
    });
  }

  private hover(el: HTMLDivElement | null) {
    if (this.hot === el) return;
    this.hot?.classList.remove('hot');
    this.hot = el;
    if (el) { el.classList.add('hot'); sfx('tick', 0.25); }
  }

  /** a thin thread of light from the hovered question to her */
  private drawThread() {
    const h = this.hot && this.host.head();
    if (!this.hot || !h) { this.thread.classList.remove('on'); return; }
    const r = this.hot.getBoundingClientRect();
    const ax = r.left - 6, ay = r.top + r.height / 2;
    const mx = (ax + h.x) / 2, my = Math.min(ay, h.y) - 24;
    this.line.setAttribute('points', `${ax},${ay} ${mx},${my} ${h.x + 14},${h.y + 30}`);
    this.thread.classList.add('on');
  }

  private clearItems(fly: boolean, keep?: HTMLDivElement) {
    for (const { el } of this.items) {
      if (el === keep) continue;
      el.classList.add('out'); el.style.pointerEvents = 'none';
      setTimeout(() => el.remove(), 700);
    }
    if (keep && fly) {
      // the picked question flies to her and goes out
      const h = this.host.head();
      const r = keep.getBoundingClientRect();
      if (h) { keep.style.setProperty('--fx', `${h.x - (r.left + r.width / 2)}px`); keep.style.setProperty('--fy', `${h.y + 20 - (r.top + r.height / 2)}px`); }
      keep.classList.add('fly'); keep.style.pointerEvents = 'none';
      setTimeout(() => keep.remove(), 750);
    }
    this.items = [];
    this.hover(null);
  }

  private pick(t: Topic, el: HTMLDivElement) {
    if (!this.open || !this.items.length) return;
    sfx('tick', 0.5);
    this.clearItems(true, el);
    if (t.id === '_back') { setTimeout(() => this.menu(ROOTS), 450); return; }
    this.asked.add(t.id);
    const lines = t.say();
    // the rewards, each once
    if (t.reward === 'hint') {
      const i = flag<number>('talk.hint', 0);
      lines.push({ text: HINTS[i % HINTS.length] });
      setFlag('talk.hint', i + 1);
    } else if (t.reward === 'rp' && !flag('talk.rp', false) && bump('talk.oddRp') >= 3) {
      setFlag('talk.rp', true);
      lines.push({ text: 'Here. Some research points I found in a drawer. Do not tell accounting.', emote: 'bow' });
      grantResearch(15, 'calder');
    } else if (t.reward === 'blueprint') {
      addOwned('d_jar', 1);
    }
    if (t.once) setFlag('talk.once.' + t.id, true);
    this.host.speak(lines, () => (t.id === 'bye' ? this.close() : this.menu(t.then?.length ? t.then : ROOTS)));
  }

  private key(e: KeyboardEvent) {
    if (!this.open) return;
    if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); this.close(); return; }
    const n = Number(e.key);
    const it = n >= 1 ? this.items[n - 1] : undefined;
    if (it) { e.stopPropagation(); e.preventDefault(); this.pick(it.t, it.el); }
  }

  close() {
    if (!this.open) return;
    this.open = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.keys, true);
    this.clearItems(false);
    setTimeout(() => this.layer.remove(), 750);
    this.host.twoShot(false);
    this.host.closed();
  }
}
