// Talking to Dr. Calder in the lab: click her and she steps up close and turns to the lens (a two-shot: her
// near, the room behind). The questions hang in the air beside her as floating type with depth
// (src/ui/holo/floatChoices.ts, the same letters as the world text): under the pointer a question comes
// forward and a thread of light runs to her; picked, it flies to her. Her answers are her recorded voice where
// there is a recording (./talkLines.ts), her line in the subtitle strip. Some answers open follow-ups, new
// topics open as the file grows (runs, deaths, inhabitants filed), and a few answers give something once: a
// hint, a blueprint for the room, some research points.
import { flag, setFlag, addOwned } from '../deco/store';
import { bump } from '../../../game/meridian';
import { grantResearch } from '../../../game/research';
import { floatChoices, type FloatChoicesHandle } from '../../holo/floatChoices';
import { TOPICS, HINTS, type Topic } from './talkLines';

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

export class Talk {
  private asked = new Set<string>();
  private choices: FloatChoicesHandle | null = null;
  open = true;

  constructor(private host: TalkHost) {
    host.twoShot(true);
    const n = bump('talk.n');
    const hello = n <= 1 ? 'What would you like to know?' : n % 2 ? 'Ask me anything. Within reason.' : 'Anything else?';
    host.speak([{ text: hello, emote: 'wave' }], () => this.menu(ROOTS));
  }

  /** the questions on offer, floating beside her */
  private menu(ids: string[]) {
    if (!this.open) return;
    const list = ids.map(topic).filter((t) => t && (!t.open || t.open()) && !(t.once && flag('talk.once.' + t.id, false)) && !(ids !== ROOTS && this.asked.has(t.id)));
    const shown: Topic[] = list.slice(0, 4);
    if (ids !== ROOTS) shown.push({ id: '_back', label: 'Something else', say: () => [] } as Topic);
    shown.push(topic('bye'));
    this.choices = floatChoices(shown.map((t) => ({ id: t.id, label: t.label, tone: t.id === 'bye' ? 'warm' : 'calder' })), {
      speaker: () => this.host.head(),
      onPick: (id) => this.pick(id === '_back' ? null : topic(id)),
      onCancel: () => this.close(),
    });
  }

  private pick(t: Topic | null) {
    if (!this.open) return;
    if (!t) { setTimeout(() => this.menu(ROOTS), 450); return; }
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

  close() {
    if (!this.open) return;
    this.open = false;
    this.choices?.close();
    this.host.twoShot(false);
    this.host.closed();
  }
}
