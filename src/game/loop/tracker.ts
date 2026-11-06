// The job, always written down: a compact plate at the top right of the HUD
// that says where the unit is in the loop and what the next step is.
//
//   WAKE > WORK > PRESS > OUT > LAB > NEXT
//     wake   the link comes up in Level 0 (done by the time you see this)
//     work   furniture to the press, data, scans and samples
//     press  carrying something: feed it to the press, the debt goes down
//     out    the debt is clear: buy passage at the depot (or just survive)
//     lab    back at the Institute: spend the research the run earned
//     next   the next unit
//
// The plate (src/game/loop/plate.ts: brushed gunmetal, screws, a sunk tube)
// carries Dr. Calder's channel: her waveform swings on its tube whenever she
// talks (bus 'calderSpeak' from src/game/handler.ts). Under it, the step in
// plain words, a detail line (what is owed, what is due and by when, the data
// and scans the field work wants), and the loop's pips. Rewards pop off it:
// +SCRIP when the press takes something, +RP when research credit comes in.
// When the unit has been stuck on a step for a while, Calder names it.
//
//   installLoopTracker()  once per session (the handler calls it)
import { G } from '../G';
import { bus } from '../../core/events';
import { drawPlate, drawRecess, screw, hiCanvas, Scope } from './plate';
import { bitText } from '../../gfx/bitfont';
import { TUT } from '../tutorial/state';

export type LoopStage = 'wake' | 'work' | 'press' | 'out' | 'lab' | 'next';
export const LOOP: { key: LoopStage; label: string }[] = [
  { key: 'wake', label: 'WAKE' }, { key: 'work', label: 'WORK' }, { key: 'press', label: 'PRESS' },
  { key: 'out', label: 'OUT' }, { key: 'lab', label: 'LAB' }, { key: 'next', label: 'NEXT' },
];

const fmt = (n: number) => Math.round(n).toLocaleString('en-GB');
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);
const isTouch = () => document.documentElement.classList.contains('nc-touch') || (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);

const W = 360, H = 100;
/** the compact plate (after the tutorial): the tube, the step and the pips; the detail line shows for a while when the step changes */
const HC = 78;
const CSS = `
.lp-track { position: fixed; right: calc(12px + env(safe-area-inset-right)); top: calc(12px + env(safe-area-inset-top)); width: ${W}px; height: ${H}px; z-index: 58; pointer-events: none;
  font-family: var(--font-new); opacity: 0; transform: translateY(-8px); transition: opacity .4s, transform .4s; filter: drop-shadow(0 3px 0 rgba(0,0,0,.4)) drop-shadow(0 6px 10px rgba(0,0,0,.35)); }
.lp-track.on { opacity: 1; transform: none; }
body.noclip-cine .lp-track.on:not(.tour), .lp-track.hush { opacity: 0; }
.lp-track > canvas { position: absolute; left: 0; top: 0; }
.lp-track .lp-t { position: absolute; left: 96px; right: 12px; white-space: nowrap; overflow: hidden; text-overflow: clip; font-size: 16px; line-height: 16px; text-shadow: var(--text-ink); }
.lp-track .lp-h { top: 9px; color: #8fd8ff; letter-spacing: 1px; display: flex; justify-content: space-between; }
.lp-track .lp-h em { font-style: normal; color: #9cff8a; }
.lp-track .lp-s { top: 29px; color: #ffe7a8; }
.lp-track .lp-s.flash { animation: lp-flash .9s steps(3) 2; }
@keyframes lp-flash { 50% { color: #ffffff; } }
.lp-track .lp-d { top: 49px; color: #c8c2b2; }
.lp-track .lp-d b { font-weight: 400; color: #f4f1e8; }
.lp-track .lp-pips { position: absolute; left: 16px; right: 16px; top: 77px; height: 16px; display: flex; justify-content: space-between; font-size: 16px; line-height: 16px; }
.lp-track .lp-pips span { color: #5f6a66; text-shadow: 1px 1px 0 #0a0b10; }
.lp-track .lp-pips span.done { color: #6fb88a; }
.lp-track .lp-pips span.cur { color: #ffd890; text-shadow: var(--text-ink), 0 0 6px rgba(255, 190, 90, .8); animation: lp-cur 1.2s steps(2) infinite; }
.lp-track .lp-pips i { font-style: normal; color: #3c4643; text-shadow: 1px 1px 0 #0a0b10; }
@keyframes lp-cur { 50% { opacity: .55; } }
html.nc-touch .lp-track { top: calc(64px + env(safe-area-inset-top)); }
.lp-track .lp-bgc { display: none; }
.lp-track.compact { height: ${HC}px; }
.lp-track.compact .lp-bgf, .lp-track.compact .lp-d { display: none; }
.lp-track.compact .lp-bgc { display: block; }
.lp-track.compact .lp-pips { top: 57px; }
@media (max-width: 760px) { .lp-track { transform-origin: top right; scale: .75; } .lp-track.on { transform: none; } }
/* rewards: they pop off the plate and rise */
.lp-pop { position: fixed; z-index: 59; pointer-events: none; font-family: var(--font-new); text-align: right; white-space: nowrap; opacity: 0;
  animation: lp-pop 2.1s cubic-bezier(.2, 1.4, .4, 1) forwards; }
.lp-pop b { display: block; font-weight: 400; font-size: 32px; line-height: 32px; text-shadow: var(--text-ink-2), 0 0 10px var(--g, rgba(255, 200, 90, .55)); color: var(--c, #ffd890); }
.lp-pop small { display: block; font-size: 16px; line-height: 16px; margin-top: 2px; color: #e8eef4; text-shadow: var(--text-ink); }
@keyframes lp-pop { 0% { opacity: 0; transform: translateY(10px) scale(.6); } 12% { opacity: 1; transform: translateY(0) scale(1.15); } 22% { transform: scale(1); } 75% { opacity: 1; } 100% { opacity: 0; transform: translateY(-26px); } }
`;

let installed: LoopTracker | null = null;
/** the HUD's loop tracker (once per session; the handler installs it) */
export function installLoopTracker(): LoopTracker | null {
  if (installed) return installed;
  if (typeof document === 'undefined' || !G.local) return null;
  installed = new LoopTracker();
  G.addSystem?.(installed);
  if (import.meta.env.DEV) (window as unknown as { __loop: LoopTracker }).__loop = installed;
  return installed;
}

interface DebtSt { owed: number; paid: number; due: number; dueDay: number; cleared: boolean; surplus: number; n: number; count: number; remaining: number; dueH: number; on: boolean }

export class LoopTracker {
  name = 'loopTracker';
  readonly el: HTMLDivElement;
  private scope: Scope;
  private hEl: HTMLDivElement; private sEl: HTMLDivElement; private dEl: HTMLDivElement; private pipEl: HTMLDivElement;
  private stage: LoopStage = 'wake';
  private stepText = ''; private detail = ''; private head = '';
  private tickT = 0; private altT = 0;
  private runRp = 0; private runScrip = 0;
  private pops: HTMLElement[] = [];
  /** seconds on the same step without progress (Calder names it when it drags) */
  private stuckT = 0; private stuckKey = '';
  /** the whole plate (with its detail line) until then; compact after */
  private fullUntil = 0;
  private offs: (() => void)[] = [];

  constructor() {
    if (!document.getElementById('lp-track-css')) { const s = document.createElement('style'); s.id = 'lp-track-css'; s.textContent = CSS; document.head.appendChild(s); }
    const el = this.el = document.createElement('div');
    el.className = 'lp-track';
    el.setAttribute('aria-live', 'polite');
    // the plate: gunmetal, four screws, the sunk tube, the engraved name under it, the pip strip
    const bg = hiCanvas(W, H);
    const x = bg.x;
    drawPlate(x, W, H, 1213);
    for (const [sx, sy] of [[5, 5], [W - 6, 5], [5, H - 6], [W - 6, H - 6]] as const) screw(x, sx, sy);
    drawRecess(x, 10, 7, 76, 48);
    bitText(x, 'CALDER', 48, 57, { font: 'small', color: '#1a1e20', shadow: 'rgba(255,255,255,.2)', outline: null, align: 'center' });
    drawRecess(x, 8, 75, W - 16, 20, '#141819');
    bg.c.classList.add('lp-bgf');
    el.appendChild(bg.c);
    // the compact plate: no engraved name, the pip strip right under the tube
    const bc = hiCanvas(W, HC);
    drawPlate(bc.x, W, HC, 1213);
    for (const [sx, sy] of [[5, 5], [W - 6, 5], [5, HC - 6], [W - 6, HC - 6]] as const) screw(bc.x, sx, sy);
    drawRecess(bc.x, 10, 7, 76, 48);
    drawRecess(bc.x, 8, 55, W - 16, 20, '#141819');
    bc.c.classList.add('lp-bgc');
    el.appendChild(bc.c);
    this.scope = new Scope(72, 44);
    this.scope.c.style.position = 'absolute'; this.scope.c.style.left = '12px'; this.scope.c.style.top = '9px';
    el.appendChild(this.scope.c);
    const div = (cls: string) => { const d = document.createElement('div'); d.className = cls; el.appendChild(d); return d; };
    this.hEl = div('lp-t lp-h'); this.sEl = div('lp-t lp-s'); this.dEl = div('lp-t lp-d'); this.pipEl = div('lp-pips');
    document.body.appendChild(el);
    const on = (ev: string, fn: (...a: any[]) => void) => this.offs.push(bus.on(ev, fn));
    on('calderSpeak', (e: { text: string; dur: number }) => { if (e?.text) this.scope.talk(e.text, e.dur); });
    on('deposited', (d: { by?: string; value?: number }) => {
      if (!d || (d.by && d.by !== G.local?.id) || !(Number(d.value) > 0)) return;
      const v = Math.round(Number(d.value));
      this.runScrip += v;
      this.pop('+' + fmt(v), 'SCRIP TO THE LEDGER', '#ffd890', 'rgba(255, 200, 90, .6)');
      this.stuckT = 0;
      setTimeout(() => G.audio?.ui?.('watchTick', 0.35), 120);
      this.nextStepLine('deposit');
    });
    on('research', (e: { n: number; reason?: string }) => {
      if (!(e?.n > 0)) return;
      this.runRp += e.n;
      const why = String(e.reason || '');
      this.pop('+' + e.n + ' RP', /^scan/.test(why) ? 'SCAN FILED · RESEARCH' : /^quest/.test(why) ? 'JOB PAID · RESEARCH' : 'RESEARCH CREDIT', '#8fe8ff', 'rgba(110, 220, 255, .6)');
      G.audio?.ui?.('questChime', 0.3);
    });
    on('debtChanged', () => { this.tickT = 0; });
    on('grabbed', () => { this.tickT = 0; this.stuckT = 0; });
    this.refresh(true);
  }

  // ================================================================ per frame
  update(dt: number) {
    this.scope.update(dt);
    this.tickT -= dt; this.altT += dt;
    if (this.tickT <= 0) { this.tickT = 0.5; this.refresh(false); }
    // stuck on a step for a long while (not in a lesson, not in a cutscene): she names it
    if (!TUT.running && this.el.classList.contains('on') && !G.local?.body?.dead) {
      const key = this.stage + '|' + this.stepText;
      if (key !== this.stuckKey) { this.stuckKey = key; this.stuckT = 0; }
      this.stuckT += dt;
      if (this.stuckT > 150) { this.stuckT = 0; this.nextStepLine('stuck'); }
    }
  }

  /** the one thing the unit should do next, in plain words */
  private read(): { stage: LoopStage; step: string; detail: string } {
    const m = G.missions as unknown as { enabled?: boolean; flags?: Set<string>; quests?: { status: (k: string) => string | null } } | null;
    const p = G.local;
    const touch = isTouch();
    const flags = m?.flags ?? new Set<string>();
    const count = (pre: string) => { let n = 0; for (const f of flags) if (f.startsWith(pre)) n++; return n; };
    const field = () => `data <b>${count('read:')}</b> · scans <b>${count('scan:')}</b>${touch ? ' · watch to scan' : ' · hold N to scan'}`;
    if (!m || m.enabled === false) return { stage: 'work', step: 'SURVIVE. FIND DATA. SCAN.', detail: field() };
    if (p?.body?.dead) return { stage: 'lab', step: 'RUN OVER. TO THE LAB.', detail: 'spend the research it earned' };
    const d = (G as unknown as { debt?: { state?: () => DebtSt } }).debt?.state?.();
    const push = (G as unknown as { destruct?: { push?: { carryInfo?: () => { nearPress: boolean; tier: number; name: string } | null } } }).destruct?.push;
    const ci = push?.carryInfo?.() ?? null;
    if (d?.on && d.cleared) {
      if (flags.has('contract:transport')) return { stage: 'out', step: 'ABOARD. THE RUN IS OVER.', detail: 'the lab is next' };
      const ticket = flags.has('contract:ticket');
      return { stage: 'out', step: ticket ? 'BOARD BEFORE IT LEAVES' : 'BUY PASSAGE AT THE KIOSK', detail: ticket ? 'the ride out is at the depot' : `debt clear · <b>${fmt(d.surplus)}</b> surplus toward the ticket` };
    }
    if (ci) {
      const owe = d?.on ? ` · <b>${fmt(d.remaining)}</b> owed` : '';
      if (ci.nearPress) return { stage: 'press', step: touch ? 'FEED THE PRESS: TAP FEED' : 'FEED THE PRESS: PRESS E', detail: `the ${esc(ci.name.toLowerCase())} pays the debt down${owe}` };
      return { stage: 'press', step: 'CARRY IT TO THE PRESS', detail: (ci.tier >= 2 ? 'heavy: slow and steady' : `the ${esc(ci.name.toLowerCase())}, whole`) + owe };
    }
    if (!flags.has('contract:first_deposit') || !d?.on) {
      return { stage: 'work', step: 'GET A GRIP ON FURNITURE', detail: touch ? 'tap a chair or cabinet, then CARRY' : 'hold right click on it, or press G' };
    }
    // working the debt: the installment, and the field work alongside it
    const fieldOpen = m.quests?.status?.('field_work') === 'act';
    const hrs = Math.max(0, Math.floor(d.dueH - (G.clock?.hours ?? 0)));
    const inst = `installment ${d.n + 1}/${d.count} · <b>${fmt(d.due)}</b> due in ${hrs} h`;
    const showField = fieldOpen && Math.floor(this.altT / 6) % 2 === 1;
    return { stage: 'work', step: d.due > 0 ? 'FURNITURE TO THE PRESS' : 'KEEP FEEDING THE PRESS', detail: showField ? field() : inst };
  }

  private refresh(force: boolean) {
    const intro = (G.systems as { name: string; phase?: string }[] | undefined)?.find((s) => s.name === 'intro');
    const introOn = !!intro && intro.phase !== 'done';
    const tour = introOn && intro!.phase === 'tour';
    const watchUp = !!(G as unknown as { watch?: { open?: boolean } }).watch?.open;
    const cine = watchUp || !!document.querySelector('.tut-root.cine') || !!document.querySelector('.dz-root');
    // hidden while Dr. Calder teaches (her lessons say it all); compact after, the whole plate for a while when the step changes
    const show = (!introOn || tour) && !cine && !!G.local && !TUT.running;
    this.el.classList.toggle('on', show);
    this.el.classList.toggle('compact', performance.now() > this.fullUntil);
    this.el.classList.toggle('tour', tour);
    if (!show && !force) return;
    const r = this.read();
    const headR = this.runRp > 0 || this.runScrip > 0 ? `<em>RUN ${this.runScrip ? fmt(this.runScrip) + ' SCRIP' : ''}${this.runScrip && this.runRp ? ' · ' : ''}${this.runRp ? '+' + this.runRp + ' RP' : ''}</em>` : `<em>DAY ${(G.clock as { day?: number } | undefined)?.day ?? 1}</em>`;
    const head = `<span>THE JOB</span>${headR}`;
    if (head !== this.head) { this.head = head; this.hEl.innerHTML = head; }
    if (r.step !== this.stepText) {
      const first = !this.stepText;
      this.fullUntil = performance.now() + 9000;
      this.stepText = r.step; this.sEl.textContent = r.step;
      if (!first) { this.sEl.classList.remove('flash'); void this.sEl.offsetWidth; this.sEl.classList.add('flash'); G.audio?.ui?.('watchTick', 0.25); }
    }
    if (r.detail !== this.detail) { this.detail = r.detail; this.dEl.innerHTML = r.detail; }
    if (r.stage !== this.stage || force) {
      this.stage = r.stage;
      const ci = LOOP.findIndex((s) => s.key === r.stage);
      this.pipEl.innerHTML = LOOP.map((s, i) => `<span class="${i < ci ? 'done' : i === ci ? 'cur' : ''}">${s.label}</span>`).join('<i>›</i>');
    }
  }

  /** a reward pops off the plate */
  private pop(big: string, small: string, col: string, glow: string) {
    const r = this.el.getBoundingClientRect();
    const e = document.createElement('div');
    e.className = 'lp-pop';
    e.style.setProperty('--c', col); e.style.setProperty('--g', glow);
    e.innerHTML = `<b>${esc(big)}</b><small>${esc(small)}</small>`;
    const shown = this.el.classList.contains('on') && r.width > 0;
    const right = shown ? innerWidth - r.right + 8 : 16;
    const top = (shown ? r.bottom + 6 : 80) + this.pops.length * 52;
    e.style.right = Math.round(right) + 'px'; e.style.top = Math.round(top) + 'px';
    document.body.appendChild(e);
    this.pops.push(e);
    setTimeout(() => { e.remove(); this.pops = this.pops.filter((x) => x !== e); }, 2200);
  }

  /** Dr. Calder names the next step (after a deposit now and then; when the unit has been stuck on one) */
  private nextStepLine(why: 'deposit' | 'stuck') {
    if (TUT.running) return;
    const h = G.handler as unknown as { say?: (t: string, o?: { key?: string; cd?: number }) => void; busy?: boolean } | null;
    if (!h?.say || h.busy) return;
    const r = this.read();
    const d = (G as unknown as { debt?: { state?: () => DebtSt } }).debt?.state?.();
    let text = '';
    if (why === 'deposit') {
      // after the ledger has booked it (and only when it did not just close an installment: the ledger says that itself)
      const n0 = d?.n ?? -1;
      setTimeout(() => {
        const d2 = (G as unknown as { debt?: { state?: () => DebtSt } }).debt?.state?.();
        if (!d2?.on || d2.cleared || d2.due <= 0 || d2.n !== n0 || TUT.running || h.busy) return;
        h.say(`Logged. ${fmt(d2.due)} more to the installment, by day ${d2.dueDay}. Next piece, please.`, { key: 'loop:dep', cd: 70 });
      }, 2600);
      return;
    }
    switch (r.stage) {
      case 'work': text = r.step === 'GET A GRIP ON FURNITURE' ? 'Next step, {n}: a piece of furniture. Get a grip on it and carry it whole to the press.' : d?.on && d.due > 0 ? `Next step: the press. ${fmt(d.due)} scrip by day ${d.dueDay}. It is written top right, in case you forget.` : 'Next step: more for the press. Or data. Or a scan. Anything but standing still.'; break;
      case 'press': text = 'Next step: the press. Set it on the plate and feed it in.'; break;
      case 'out': text = 'Next step: passage. The kiosk sells the ride out. After that, the lab.'; break;
      default: return;
    }
    h.say(text, { key: 'loop:stuck', cd: 140 });
  }

  dispose() {
    for (const o of this.offs.splice(0)) o();
    this.el.remove();
    for (const p of this.pops.splice(0)) p.remove();
    installed = null;
  }
}
