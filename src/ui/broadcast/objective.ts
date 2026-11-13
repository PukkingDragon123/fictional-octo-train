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
import { mxOk } from '../machine/core';
import { mxDecor, type MxDecor } from '../machine/decor';

type Card = { kind: string; title: string; step?: string; done?: string; tone?: 'new' | 'up' | 'ok' | 'filed' };
const Q = () => G.missions?.quests as QuestRuntime | undefined;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);
// round 17: a step in a few words: no parenthesised hints, only the part before a colon or a semicolon
const clean = (s: string) => s.replace(/\s*\([^)]*\)/g, '').split(/\s*[:;]\s*/)[0].trim();

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
  private cur: Card | null = null;
  private beacons: Partial<Record<'amber' | 'green', MxDecor | null>> = {};
  private beacon: MxDecor | null = null;

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
    // real time: a caption fades on the clock, whatever the world's time is doing (a tutorial beat may hold it)
    let last = performance.now();
    G.addSystem({ name: 'objectiveLine', update: () => { const now = performance.now(); this.update(Math.min(0.25, (now - last) / 1000)); last = now; } });
  }

  private push(c: Card) {
    const sig = c.kind + '|' + c.title + '|' + (c.step || '') + '|' + (c.done || '');
    if (sig === this.lastSig) return;
    this.lastSig = sig;
    // a newer word about the same task replaces the waiting one
    // round 17: never stacked: only the newest word waits its turn
    this.queue = [c];
  }

  private blocked() {
    const g = G as unknown as { intro?: { running?: boolean }; pr?: { eyeCamera?: unknown } };
    return document.body.classList.contains('noclip-cine') || document.documentElement.classList.contains('lp-busy') || isLoading() || TUT.running || !!g.intro?.running || !G.local || !!G.local.body?.dead || !!G.paused;
  }

  private update(dt: number) {
    // a cinematic takes the screen: the caption steps out and comes back after it, in full
    if (this.showing && document.body.classList.contains('noclip-cine')) {
      this.el.classList.remove('on', 'out'); this.showing = 0; this.hold = 0;
      if (this.cur) { this.queue.unshift(this.cur); this.cur = null; }
      return;
    }
    if (this.showing) {
      // round 17: the unit is busy (html.lp-busy): the caption is faded out and keeps its time for after
      if (document.documentElement.classList.contains('lp-busy')) return;
      this.hold -= dt;
      if (this.hold <= 0) { this.el.classList.remove('on'); this.el.classList.add('out'); this.showing = 0; this.hold = 0.4; this.cur = null; this.beacon?.alert(false); }
      return;
    }
    if (this.hold > 0) { this.hold -= dt; return; }
    if (!this.queue.length || this.blocked()) return;
    const c = this.queue.shift()!;
    this.cur = c;
    const el = this.el;
    el.className = 'obj15 t-' + (c.tone || 'up');
    // round 17: one line: the beacon, the task, the next step after an arrow; the kind of news is the beacon's
    // colour (and read out to assistive tech), the struck-out step and the full board stay on J
    el.setAttribute('aria-label', `${c.kind}: ${c.title}${c.step ? '. ' + c.step : ''}`);
    el.innerHTML = `<div class="obj15-k obj15-1"><span></span><b class="obj15-t1">${esc(c.title)}</b>${c.step ? `<em class="obj15-s1">▸ ${esc(c.step)}</em>` : ''}</div>`;
    // round 16: a little 3D beacon instead of the diamond, turning while the caption is up (green for done work)
    const col = c.tone === 'ok' ? 'green' : 'amber';
    if (c.tone !== 'filed' && mxOk()) {
      const b = this.beacons[col] ??= mxDecor('beacon', { col, s: 0.7, cls: 'obj15-b' });
      const k = el.querySelector('.obj15-k span');
      if (b && k) { k.prepend(b.el); el.classList.add('has-b'); b.alert(true); this.beacon = b; }
    }
    void el.offsetWidth;
    el.classList.add('on');
    this.showing = 1;
    this.hold = 2.6 + (c.step ? 0.6 : 0);
    G.audio?.ui?.('bag_place', 0.18);
  }
}
