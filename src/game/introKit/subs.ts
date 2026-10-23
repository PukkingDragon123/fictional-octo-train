// The intake's spoken lines, drawn by the cutscene itself (not the world's
// floating speech): Pixelify Sans, big and crisp, one line at a time (a new
// line pushes the last one off), the speaker's name small above it, the
// letters typed on in step with the voice's own clock (src/social/chipVoice:
// letterTimes / playLine, so the blips and the letters agree), shouted lines
// red and shaking, a line jolting and flaring red when a blow lands while it
// is up. Placed like film type: in the lower third, or beside the speaker
// when the wide shot can see them. No boxes: letters with a hard black halo.
import { G } from '../G';
import { letterTimes, playLine, voiceForStyle, voiceFromApp, type ChipVoice } from '../../social/chipVoice';

export type SubStyle = 'guard' | 'self';
export interface SubOpts {
  style?: SubStyle;
  /** force the shout look (otherwise: '!' or ALL CAPS or a cut-off dash) */
  shout?: boolean;
  /** where the speaker is on screen (CSS px) right now, or null for the lower third */
  at?: () => { x: number; y: number } | null;
  /** the voice (defaults by style) */
  voice?: ChipVoice | null;
  /** seconds to hold after the last letter */
  hold?: number;
}

interface Live { el: HTMLDivElement; chars: HTMLSpanElement[]; t: number[]; dur: number; age: number; hold: number; at?: SubOpts['at']; out: number }

export class Subs {
  readonly el: HTMLDivElement;
  private cur: Live | null = null;
  private dying: Live[] = [];

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'ix-subs';
    parent.appendChild(this.el);
  }

  /** say a line: it replaces whatever is up */
  show(who: string, text: string, o: SubOpts = {}) {
    const style = o.style ?? 'guard';
    const shout = o.shout ?? (/!/.test(text) || (text.length > 3 && text === text.toUpperCase() && /[A-Z]/.test(text)) || /-\s*$/.test(text));
    // one line at a time: the last one goes at once (a fade under the new one would stack two names, two lines)
    if (this.cur) { this.cur.el.remove(); this.cur = null; }
    for (const d of this.dying) d.el.remove();
    this.dying.length = 0;
    const el = document.createElement('div');
    el.className = `ix-sub ${style}${shout ? ' shout' : ''}`;
    if (who) {
      const n = document.createElement('div');
      n.className = 'ix-sub-who';
      n.textContent = who;
      el.appendChild(n);
    }
    const line = document.createElement('div');
    line.className = 'ix-sub-line';
    const { t, dur } = letterTimes(text);
    const chars: HTMLSpanElement[] = [];
    // words stay whole when the line wraps
    let word: HTMLSpanElement | null = null;
    [...text].forEach((ch, i) => {
      if (ch === ' ') { word = null; line.appendChild(document.createTextNode(' ')); chars.push(document.createElement('span')); return; }
      if (!word) { word = document.createElement('span'); word.className = 'w'; line.appendChild(word); }
      const c = document.createElement('span');
      c.className = 'c';
      c.textContent = ch;
      c.style.setProperty('--j', String((i * 37) % 7));
      word.appendChild(c);
      chars.push(c);
      void t[i];
    });
    el.appendChild(line);
    this.el.appendChild(el);
    const hold = o.hold ?? Math.max(1.1, Math.min(2.6, text.length * 0.045));
    this.cur = { el, chars, t, dur, age: 0, hold, at: o.at, out: -1 };
    // the voice, on the same clock
    try {
      const v = o.voice ?? (style === 'self' ? voiceFromApp(G.local?.app, G.local?.id ?? '') : voiceForStyle('guard', who));
      playLine(text, v, null, { shout, vol: style === 'self' ? 0.9 : 1 });
    } catch { /* no audio */ }
    this.place(this.cur);
  }

  /** a blow lands while a line is up: it jolts and flares red */
  hit(k = 1) {
    const c = this.cur;
    if (!c) return;
    c.el.classList.remove('hit');
    void c.el.offsetWidth;
    c.el.style.setProperty('--hk', String(Math.min(1.5, k)));
    c.el.classList.add('hit');
  }

  clear() { if (this.cur) this.retire(this.cur); this.cur = null; }

  private retire(l: Live) { l.out = 0; l.el.classList.add('out'); this.dying.push(l); }

  private place(l: Live) {
    const p = l.at?.();
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
      // beside the speaker, kept inside the frame
      const w = innerWidth, h = innerHeight;
      const x = Math.max(w * 0.22, Math.min(w * 0.78, p.x));
      const y = Math.max(h * 0.16, Math.min(h * 0.62, p.y));
      l.el.style.left = x + 'px'; l.el.style.top = y + 'px'; l.el.classList.add('placed');
    } else { l.el.style.left = ''; l.el.style.top = ''; l.el.classList.remove('placed'); }
  }

  update(dt: number) {
    const c = this.cur;
    if (c) {
      c.age += dt;
      for (let i = 0; i < c.chars.length; i++) if (c.age >= c.t[i] && !c.chars[i].classList.contains('on')) c.chars[i].classList.add('on');
      if (c.at) this.place(c);
      if (c.age > c.dur + c.hold) { this.retire(c); this.cur = null; }
    }
    for (let i = this.dying.length - 1; i >= 0; i--) {
      const d = this.dying[i];
      d.out += dt;
      if (d.out > 0.3) { d.el.remove(); this.dying.splice(i, 1); }
    }
  }

  destroy() { this.el.remove(); this.cur = null; this.dying.length = 0; }
}
