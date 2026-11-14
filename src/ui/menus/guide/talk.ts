// Talking to Dr. Calder in the lab: click her and the picture letterboxes, she steps up close and turns to
// the lens (a two-shot: her near, the room behind), and a list of questions comes up on the right. Her
// answers are her recorded voice where there is a recording (./talkLines.ts) and her line in the subtitle
// strip; some answers open follow-ups, new topics open as the file grows (runs, deaths, inhabitants filed),
// and a few answers give something once: a hint, a blueprint for the room, some research points.
import { mxButton } from '../../machine/kit';
import { sfx } from '../sfx';
import { flag, setFlag, addOwned } from '../deco/store';
import { bump } from '../../../game/meridian';
import { grantResearch } from '../../../game/research';
import { TOPICS, HINTS, talks, type Topic } from './talkLines';
import './talk.css';

export interface TalkHost {
  layer: HTMLElement;
  /** she says these lines (queued, interrupting), `done` after the last */
  speak(lines: { text: string; emote?: string }[], done: () => void): void;
  /** stand close to the lens (true) or go back to her spot */
  twoShot(on: boolean): void;
  /** the conversation ended */
  closed(): void;
}

const ROOTS = ['debt', 'last', 'creature', 'research', 'institute', 'odd', 'room'];
const topic = (id: string) => TOPICS.find((t) => t.id === id)!;

export class Talk {
  private bars: HTMLDivElement[] = [];
  private panel: HTMLDivElement;
  private asked = new Set<string>();
  private keys = (e: KeyboardEvent) => this.key(e);
  open = true;

  constructor(private host: TalkHost) {
    for (const k of ['top', 'bot']) { const b = document.createElement('div'); b.className = 'tk-bar tk-' + k; host.layer.appendChild(b); this.bars.push(b); }
    this.panel = document.createElement('div');
    this.panel.className = 'tk-panel';
    host.layer.appendChild(this.panel);
    requestAnimationFrame(() => { for (const b of this.bars) b.classList.add('on'); });
    host.twoShot(true);
    window.addEventListener('keydown', this.keys, true);
    const n = bump('talk.n');
    const hello = n <= 1 ? 'What would you like to know?' : n % 2 ? 'Ask me anything. Within reason.' : 'Anything else?';
    host.speak([{ text: hello, emote: 'wave' }], () => this.menu(ROOTS));
  }

  /** the questions on offer: the given ones that are open, plus a way back and a goodbye */
  private menu(ids: string[]) {
    if (!this.open) return;
    this.panel.innerHTML = '';
    const list = ids.map(topic).filter((t) => t && (!t.open || t.open()) && !(t.once && flag('talk.once.' + t.id, false)) && !(ids !== ROOTS && this.asked.has(t.id)));
    const shown = list.slice(0, 4);
    if (ids !== ROOTS) shown.push({ id: '_back', label: 'Something else', say: () => [] } as Topic);
    shown.push(topic('bye'));
    const head = document.createElement('div'); head.className = 'tk-head'; head.textContent = 'ASK DR. CALDER';
    this.panel.appendChild(head);
    shown.forEach((t, i) => {
      const b = mxButton(`${i + 1}  ${t.label.toUpperCase()}`, () => this.pick(t), { w: 330, h: 40, tone: t.id === 'bye' ? 'dark' : 'olive', lamp: t.id === 'bye' ? 'amber' : 'green', cls: 'tk-q' });
      this.panel.appendChild(b);
    });
    this.panel.classList.add('on');
    void talks;
  }

  private pick(t: Topic) {
    if (!this.open) return;
    sfx('tick', 0.5);
    this.panel.classList.remove('on');
    if (t.id === '_back') { this.menu(ROOTS); return; }
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
    if (n >= 1 && n <= 6 && this.panel.classList.contains('on')) {
      const b = this.panel.querySelectorAll<HTMLButtonElement>('.tk-q')[n - 1];
      if (b) { e.stopPropagation(); e.preventDefault(); b.click(); }
    }
  }

  close() {
    if (!this.open) return;
    this.open = false;
    window.removeEventListener('keydown', this.keys, true);
    this.panel.classList.remove('on');
    for (const b of this.bars) b.classList.remove('on');
    setTimeout(() => { this.panel.remove(); for (const b of this.bars) b.remove(); }, 450);
    this.host.twoShot(false);
    this.host.closed();
  }
}
