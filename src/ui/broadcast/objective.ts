// THE OBJECTIVE LINE (round 15): quest tracking as a film's caption, not a
// panel. When Dr. Calder assigns a task, when one of its steps is done, when
// it is ready to sign off or filed, one line of type comes up at the top of
// the screen between two hairlines that draw out from the middle (a small
// amber diamond, the kind of news in spaced capitals, the task, the step to do
// next), holds for a few seconds and fades. Nothing stays on screen: the full
// board is Calder's broadcast on J (src/ui/broadcast/broadcast.ts). On arrival
// in a level the tracked task's next step there is said once, the same way.
// Waits while the loading screen, her staged tutorial or the intro has the screen.
import { G } from '../../game/G';
import { bus } from '../../core/events';
import { TUT } from '../../game/tutorial/state';
import type { QuestRuntime, QView } from '../../missions/questRuntime';
import { isLoading } from '../loading';
import { isTouchMode } from '../touch/mode';
import './objective.css';

type Card = { kind: string; title: string; step?: string; done?: string; tone?: 'new' | 'up' | 'ok' | 'filed' };
const Q = () => G.missions?.quests as QuestRuntime | undefined;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);
const clean = (s: string) => s.replace(/\s*\([^)]*\)\s*$/, '').trim();

function nextStep(v: QView | null): string | undefined {
  if (!v) return undefined;
  const o = v.objectives.find((x) => !x.done && !x.optional) ?? v.objectives.find((x) => !x.done);
  if (!o) return undefined;
  const pct = o.prog > 0 && o.prog < 1 ? ` · ${Math.round(o.prog * 100)}%` : '';
  return clean(o.text) + pct;
}

export class ObjectiveLine {
  private el: HTMLDivElement;
  private queue: Card[] = [];
  private showing = 0;
  private hold = 0;
  private lastSig = '';
  private zoneSaid = '';

  constructor() {
    const el = this.el = document.createElement('div');
    el.className = 'obj15';
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
    bus.on('quest', (k: string, r: { s?: string } | null, prev: { s?: string } | undefined) => {
      if (!k || !r) return;
      if (r.s === 'act' && prev?.s !== 'act' && prev?.s !== 'ready') {
        const v = Q()?.view(k) ?? null;
        this.push({ kind: 'New task', title: v?.title || k, step: nextStep(v), tone: 'new' });
      }
    });
    bus.on('questNotice', (e: { key: string; kind: string; title: string; text?: string }) => {
      if (!e?.key) return;
      const v = Q()?.view(e.key) ?? null;
      if (e.kind === 'objective') this.push({ kind: 'Task updated', title: e.title, done: e.text ? clean(e.text) : undefined, step: nextStep(v), tone: 'up' });
      else if (e.kind === 'ready') this.push({ kind: 'Task complete', title: e.title, step: `Sign it off on the board · ${isTouchMode() ? 'QUESTS' : 'J'}`, tone: 'ok' });
      else if (e.kind === 'done') this.push({ kind: 'Filed', title: e.title, tone: 'filed' });
    });
    bus.on('travelEnd', (p: { isLocal?: boolean } | null, zone: string) => {
      if (p && !p.isLocal) return;
      const q = Q(), k = q?.focus?.();
      if (!q || !k || this.zoneSaid === k + ':' + zone) return;
      const t = q.target(k);
      if (!t || t.zone !== zone) return;
      this.zoneSaid = k + ':' + zone;
      const v = q.view(k);
      this.push({ kind: 'Tracked', title: v?.title || k, step: nextStep(v), tone: 'up' });
    });
    G.addSystem({ name: 'objectiveLine', update: (dt: number) => this.update(dt) });
  }

  private push(c: Card) {
    const sig = c.kind + '|' + c.title + '|' + (c.step || '') + '|' + (c.done || '');
    if (sig === this.lastSig) return;
    this.lastSig = sig;
    // a newer word about the same task replaces the waiting one
    this.queue = this.queue.filter((q) => q.title !== c.title);
    this.queue.push(c);
    if (this.queue.length > 3) this.queue.shift();
  }

  private blocked() {
    const g = G as unknown as { intro?: { running?: boolean }; pr?: { eyeCamera?: unknown } };
    return isLoading() || TUT.running || !!g.intro?.running || !G.local || !!G.local.body?.dead || !!G.paused;
  }

  private update(dt: number) {
    if (this.showing) {
      this.hold -= dt;
      if (this.hold <= 0) { this.el.classList.remove('on'); this.el.classList.add('out'); this.showing = 0; this.hold = 0.7; }
      return;
    }
    if (this.hold > 0) { this.hold -= dt; return; }
    if (!this.queue.length || this.blocked()) return;
    const c = this.queue.shift()!;
    const el = this.el;
    el.className = 'obj15 t-' + (c.tone || 'up');
    el.innerHTML = `<div class="obj15-k"><i></i><span>${esc(c.kind)}</span><i></i></div>`
      + `<div class="obj15-t">${esc(c.title)}</div>`
      + (c.done ? `<div class="obj15-d"><s>${esc(c.done)}</s></div>` : '')
      + (c.step ? `<div class="obj15-s"><b></b>${esc(c.step)}</div>` : '');
    void el.offsetWidth;
    el.classList.add('on');
    this.showing = 1;
    this.hold = 4.2 + (c.step ? 0.8 : 0) + (c.done ? 0.6 : 0);
    G.audio?.ui?.('bag_place', 0.18);
  }
}
