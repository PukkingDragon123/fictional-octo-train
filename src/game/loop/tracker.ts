// The loop, kept by Dr. Calder (no panel: the user wants no tracker plate on
// screen). Where the unit is in the loop and what the next step is are read
// here and SAID, by her voice on the subtitle strip, never drawn as a plate:
//
//   WAKE > WORK > PRESS > OUT > LAB > NEXT
//     wake   the link comes up in Level 0
//     work   furniture to the press, data, scans and samples
//     press  carrying something: feed it to the press, the debt goes down
//     out    the debt is clear: buy passage at the depot (or just survive)
//     lab    back at the Institute: spend the research the run earned
//     next   the next unit
//
// Rewards still pop: +SCRIP when the press takes something, +RP when research
// credit comes in, as Alagard type rising off the unit's head (no box). When
// the unit has been stuck on a step for a while, or after a deposit now and
// then, Calder names the next step. Nothing speaks while her tutorial runs
// (src/game/tutorial) or the intro plays.
//
//   installLoopTracker()  once per session (the handler calls it)
//   readLoop()            { stage, step, detail } in plain words (for whoever asks)
import * as THREE from 'three';
import { G } from '../G';
import { bus } from '../../core/events';
import { TUT } from '../tutorial/state';

export type LoopStage = 'wake' | 'work' | 'press' | 'out' | 'lab' | 'next';
export const LOOP: { key: LoopStage; label: string }[] = [
  { key: 'wake', label: 'WAKE' }, { key: 'work', label: 'WORK' }, { key: 'press', label: 'PRESS' },
  { key: 'out', label: 'OUT' }, { key: 'lab', label: 'LAB' }, { key: 'next', label: 'NEXT' },
];

const fmt = (n: number) => Math.round(n).toLocaleString('en-GB');
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);
const v1 = new THREE.Vector3();

const CSS = `
/* rewards: they rise off the unit's head and fade (type only, no plate) */
.lp-pop { position: fixed; z-index: 59; pointer-events: none; font-family: var(--font-new); text-align: center; white-space: nowrap; opacity: 0; transform: translate(-50%, -100%);
  animation: lp-pop 2.1s cubic-bezier(.2, 1.4, .4, 1) forwards; }
.lp-pop b { display: block; font-weight: 400; font-size: 32px; line-height: 32px; text-shadow: var(--text-ink-2), 0 0 10px var(--g, rgba(255, 200, 90, .55)); color: var(--c, #ffd890); }
.lp-pop small { display: block; font-size: 16px; line-height: 16px; margin-top: 2px; color: #e8eef4; text-shadow: var(--text-ink); }
@keyframes lp-pop { 0% { opacity: 0; transform: translate(-50%, -100%) translateY(10px) scale(.6); } 12% { opacity: 1; transform: translate(-50%, -100%) scale(1.15); } 22% { transform: translate(-50%, -100%) scale(1); } 75% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%, -100%) translateY(-40px); } }
`;

let installed: LoopTracker | null = null;
/** the loop's keeper (once per session; the handler installs it) */
export function installLoopTracker(): LoopTracker | null {
  if (installed) return installed;
  if (typeof document === 'undefined' || !G.local) return null;
  installed = new LoopTracker();
  G.addSystem?.(installed);
  if (import.meta.env.DEV) (window as unknown as { __loop: LoopTracker }).__loop = installed;
  return installed;
}

interface DebtSt { owed: number; paid: number; due: number; dueDay: number; cleared: boolean; surplus: number; n: number; count: number; remaining: number; dueH: number; on: boolean }
const debtSt = () => (G as unknown as { debt?: { state?: () => DebtSt } }).debt?.state?.();

/** the one thing the unit should do next, in plain words */
export function readLoop(): { stage: LoopStage; step: string; detail: string } {
  const m = G.missions as unknown as { enabled?: boolean; flags?: Set<string> } | null;
  const p = G.local;
  const flags = m?.flags ?? new Set<string>();
  if (!m || m.enabled === false) return { stage: 'work', step: 'survive, find data, scan', detail: '' };
  if (p?.body?.dead) return { stage: 'lab', step: 'run over: to the lab', detail: '' };
  const d = debtSt();
  const push = (G as unknown as { destruct?: { push?: { carryInfo?: () => { nearPress: boolean; tier: number; name: string } | null } } }).destruct?.push;
  const ci = push?.carryInfo?.() ?? null;
  if (d?.on && d.cleared) {
    if (flags.has('contract:transport')) return { stage: 'out', step: 'aboard: the run is over', detail: '' };
    return { stage: 'out', step: flags.has('contract:ticket') ? 'board before it leaves' : 'buy passage at the kiosk', detail: `${fmt(d.surplus)} surplus` };
  }
  if (ci) return { stage: 'press', step: ci.nearPress ? 'feed the press' : 'carry it to the press', detail: ci.name.toLowerCase() };
  if (!flags.has('contract:first_deposit') || !d?.on) return { stage: 'work', step: 'get a grip on furniture', detail: '' };
  return { stage: 'work', step: d.due > 0 ? 'furniture to the press' : 'keep feeding the press', detail: `${fmt(d.due)} due by day ${d.dueDay}` };
}

export class LoopTracker {
  name = 'loopTracker';
  private stage: LoopStage = 'wake';
  private step = '';
  private tickT = 0;
  private pops: HTMLElement[] = [];
  /** seconds on the same step without progress (Calder names it when it drags) */
  private stuckT = 0; private stuckKey = '';
  private offs: (() => void)[] = [];

  constructor() {
    if (!document.getElementById('lp-track-css')) { const s = document.createElement('style'); s.id = 'lp-track-css'; s.textContent = CSS; document.head.appendChild(s); }
    const on = (ev: string, fn: (...a: any[]) => void) => this.offs.push(bus.on(ev, fn));
    on('deposited', (d: { by?: string; value?: number }) => {
      if (!d || (d.by && d.by !== G.local?.id) || !(Number(d.value) > 0)) return;
      const v = Math.round(Number(d.value));
      this.pop('+' + fmt(v), 'SCRIP TO THE LEDGER', '#ffd890', 'rgba(255, 200, 90, .6)');
      this.stuckT = 0;
      setTimeout(() => G.audio?.ui?.('watchTick', 0.35), 120);
      this.nextStepLine('deposit');
    });
    on('research', (e: { n: number; reason?: string }) => {
      if (!(e?.n > 0)) return;
      const why = String(e.reason || '');
      this.pop('+' + e.n + ' RP', /^scan/.test(why) ? 'SCAN FILED' : /^quest/.test(why) ? 'JOB PAID' : 'RESEARCH CREDIT', '#8fe8ff', 'rgba(110, 220, 255, .6)');
      G.audio?.ui?.('questChime', 0.3);
    });
    on('debtChanged', () => { this.tickT = 0; });
    on('grabbed', () => { this.tickT = 0; this.stuckT = 0; });
  }

  update(dt: number) {
    this.tickT -= dt;
    if (this.tickT <= 0) { this.tickT = 0.5; const r = readLoop(); this.stage = r.stage; this.step = r.step; }
    // stuck on a step for a long while (not in a lesson, not in a cutscene): she names it
    const intro = (G.systems as { name: string; phase?: string }[] | undefined)?.find((s) => s.name === 'intro');
    if (!TUT.running && !(intro && intro.phase !== 'done') && G.local && !G.local.body?.dead) {
      const key = this.stage + '|' + this.step;
      if (key !== this.stuckKey) { this.stuckKey = key; this.stuckT = 0; }
      this.stuckT += dt;
      if (this.stuckT > 150) { this.stuckT = 0; this.nextStepLine('stuck'); }
    }
  }

  /** a reward rises off the unit's head */
  private pop(big: string, small: string, col: string, glow: string) {
    const p = G.local;
    let x = innerWidth / 2, y = innerHeight * 0.36;
    try {
      const pr = G.pr as unknown as { worldToScreen?: (v: THREE.Vector3) => { x: number; y: number } } | undefined;
      const s = p && pr?.worldToScreen ? pr.worldToScreen(v1.set(p.x, p.y + 2.3, p.z)) : null;
      if (s && isFinite(s.x) && isFinite(s.y)) { x = s.x; y = s.y; }
    } catch { /* off screen: the middle */ }
    const e = document.createElement('div');
    e.className = 'lp-pop';
    e.style.setProperty('--c', col); e.style.setProperty('--g', glow);
    e.innerHTML = `<b>${esc(big)}</b><small>${esc(small)}</small>`;
    e.style.left = Math.round(Math.max(80, Math.min(innerWidth - 80, x))) + 'px';
    e.style.top = Math.round(Math.max(60, y - this.pops.length * 52)) + 'px';
    document.body.appendChild(e);
    this.pops.push(e);
    setTimeout(() => { e.remove(); this.pops = this.pops.filter((q) => q !== e); }, 2200);
  }

  /** Dr. Calder names the next step (after a deposit now and then; when the unit has been stuck on one) */
  private nextStepLine(why: 'deposit' | 'stuck') {
    if (TUT.running) return;
    const h = G.handler as unknown as { say?: (t: string, o?: { key?: string; cd?: number }) => void; busy?: boolean } | null;
    if (!h?.say || h.busy) return;
    const r = readLoop();
    const d = debtSt();
    if (why === 'deposit') {
      // after the ledger has booked it (and only when it did not just close an installment: the ledger says that itself)
      const n0 = d?.n ?? -1;
      setTimeout(() => {
        const d2 = debtSt();
        if (!d2?.on || d2.cleared || d2.due <= 0 || d2.n !== n0 || TUT.running || h.busy) return;
        h.say(`Logged. ${fmt(d2.due)} more to the installment, by day ${d2.dueDay}. Next piece, please.`, { key: 'loop:dep', cd: 70 });
      }, 2600);
      return;
    }
    let text = '';
    switch (r.stage) {
      case 'work': text = r.step === 'get a grip on furniture' ? 'Next step, {n}: a piece of furniture. Get a grip on it and carry it whole to the press.' : d?.on && d.due > 0 ? `Next step: the press. ${fmt(d.due)} scrip by day ${d.dueDay}. Data and scans for the lab, when you can.` : 'Next step: more for the press. Or data. Or a scan. Anything but standing still.'; break;
      case 'press': text = 'Next step: the press. Set it on the plate and feed it in.'; break;
      case 'out': text = 'Next step: passage. The kiosk sells the ride out. After that, the lab, and the next unit.'; break;
      default: return;
    }
    h.say(text, { key: 'loop:stuck', cd: 140 });
  }

  dispose() {
    for (const o of this.offs.splice(0)) o();
    for (const p of this.pops.splice(0)) p.remove();
    installed = null;
  }
}
