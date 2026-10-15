// The crew's debt ledger (G.debt). One shared debt for everyone in the world:
// the host owns it and publishes every change as an absolute 'ledger' op, so
// co-op peers, late joiners (op log replay) and save games all see the same
// numbers. Installments fall due every N in-game days (sandbox.debtDays);
// paying one sets 'contract:installment:<n>', missing one shocks every band,
// adds penalty interest and earns a dressing-down from the handler. Clearing
// the balance sets 'contract:debt_cleared'; credit after that is surplus,
// which buys passage out at the depot kiosk (src/game/debt/transport.ts).
import { bus } from '../../core/events';
import { G } from '../G';
import { defOp, op, isReplaying } from '../ops';
import { addStat } from '../profile';
import type { GameSystem } from '../game';
import type { Item } from '../../items/item';
import { itemValue } from './values';
import { voss, bailiff, pick, L } from './voice';

export const INSTALLMENTS = 5;

export interface LedgerState {
  /** contract running (directives on, intake done) */
  on: boolean;
  principal: number;
  /** principal + penalties */
  owed: number;
  /** credited toward the debt (never above owed) */
  paid: number;
  /** credit after the debt was cleared (spent on passage) */
  surplus: number;
  count: number;
  /** installments paid */
  n: number;
  startH: number;
  /** deadline of installment n + 1, in clock hours */
  dueH: number;
  missed: number;
  cleared: boolean;
  /** lifetime scrip deposited */
  total: number;
  deposits: number;
}
export type LedgerEv =
  | { k: 'start' }
  | { k: 'credit'; v: number; by?: string; why?: string }
  | { k: 'inst'; n: number; by?: string }
  | { k: 'missed'; n: number; pen: number }
  | { k: 'cleared'; by?: string }
  | { k: 'spend'; v: number; by?: string; what?: string }
  | { k: 'default' };

/** what everyone listens to ('debtChanged') */
export interface DebtPublic { owed: number; paid: number; due: number; dueDay: number; cleared: boolean; surplus: number; n: number; count: number; remaining: number; dueH: number; on: boolean }

const blank = (): LedgerState => ({ on: false, principal: 0, owed: 0, paid: 0, surplus: 0, count: INSTALLMENTS, n: 0, startH: 0, dueH: 0, missed: 0, cleared: false, total: 0, deposits: 0 });

defOp('ledger', (a: { s: LedgerState; ev?: LedgerEv[] }, ctx) => {
  // only the host originates ledger changes; a client request is ignored
  if (ctx.host && !ctx.local && ctx.from !== 'replay') return;
  (G.debt as DebtSystem | null)?.apply(a.s, a.ev || []);
});

export class DebtSystem implements GameSystem {
  name = 'debt';
  s: LedgerState = blank();
  private checkT = 0;
  /** sub-systems (set by src/game/debt/index.ts) */
  hoppers: any = null;
  transport: any = null;

  constructor() { G.debt = this; }

  // ---------------------------------------------------------------- read API
  get on() { return this.s.on; }
  get owed() { return this.s.owed; }
  get paid() { return this.s.paid; }
  get surplus() { return this.s.surplus; }
  get cleared() { return this.s.cleared; }
  get remaining() { return Math.max(0, this.s.owed - this.s.paid); }
  /** cumulative amount that must have been paid when installment k is settled */
  target(k: number) { return k >= this.s.count ? this.s.owed : Math.round((this.s.owed * k) / this.s.count / 50) * 50; }
  /** amount due for the current installment */
  get due() { return this.s.cleared || !this.s.on ? 0 : Math.max(0, this.target(this.s.n + 1) - this.s.paid); }
  /** calendar day (as the clock shows it) of the current deadline */
  get dueDay() { return Math.floor(this.s.dueH / 24) + (G.clock?.startDay ?? 1); }
  /** in-game hours left until the deadline */
  get hoursLeft() { return Math.max(0, this.s.dueH - (G.clock?.hours ?? 0)); }
  /** the installment being paid now (1-based) */
  get installment() { return Math.min(this.s.count, this.s.n + 1); }
  get count() { return this.s.count; }
  valueOf(it: Item) { return itemValue(it); }
  state(): DebtPublic {
    const s = this.s;
    return { owed: s.owed, paid: s.paid, due: this.due, dueDay: this.dueDay, cleared: s.cleared, surplus: s.surplus, n: s.n, count: s.count, remaining: this.remaining, dueH: s.dueH, on: s.on };
  }

  // ---------------------------------------------------------------- host API
  private get host() { return G.role !== 'client'; }
  private get interval() { return Math.max(0.25, Number(G.sandbox.debtDays ?? 2)) * 24; }
  private publish(ev: LedgerEv[]) { op('ledger', { s: { ...this.s }, ev }); }

  /** host: start the contract (called once intake is done) */
  begin() {
    if (!this.host || this.s.on) return;
    const principal = Math.max(1000, Math.round(Number(G.sandbox.debt ?? 25000)));
    const h = G.clock.hours;
    this.s = { ...blank(), on: true, principal, owed: principal, startH: h, dueH: h + this.interval };
    this.publish([{ k: 'start' }]);
  }

  /** host: put scrip on the account (deposits). Returns the amount applied. */
  credit(value: number, why = 'deposit', by?: string): number {
    if (!this.host || !this.s.on || !(value > 0)) return 0;
    const s = this.s, ev: LedgerEv[] = [{ k: 'credit', v: Math.round(value), by, why }];
    value = Math.round(value);
    s.total += value; s.deposits++;
    if (!s.cleared) {
      const room = s.owed - s.paid;
      s.paid += Math.min(room, value);
      if (value > room) s.surplus += value - room;
      while (s.n < s.count && s.paid >= this.target(s.n + 1)) {
        s.n++;
        s.dueH += this.interval;
        ev.push({ k: 'inst', n: s.n, by });
      }
      if (s.paid >= s.owed) { s.cleared = true; s.n = s.count; ev.push({ k: 'cleared', by }); }
    } else s.surplus += value;
    this.publish(ev);
    return value;
  }

  /** host: spend surplus (passage). Returns false when there is not enough. */
  spend(v: number, what = '', by?: string): boolean {
    if (!this.host || !this.s.on || this.s.surplus < v) return false;
    this.s.surplus -= v;
    this.publish([{ k: 'spend', v, by, what }]);
    return true;
  }

  /** dev / pacing helper: set the remaining balance (host) */
  devCredit(v: number) { return this.credit(v, 'dev'); }

  // ---------------------------------------------------------------- every peer
  apply(s: LedgerState, ev: LedgerEv[]) {
    const prev = this.s;
    this.s = { ...blank(), ...s };
    bus.emit('debtChanged', this.state());
    if (isReplaying()) return;
    const m = G.missions;
    let instShown = false;
    for (const e of ev) {
      switch (e.k) {
        case 'start': break;
        case 'credit':
          if (e.by && e.by === G.local?.id && e.why === 'deposit') addStat('scrip_deposited', e.v);
          if (this.host && e.why === 'deposit') m?.set?.('contract:first_deposit');
          break;
        case 'inst':
          addStat('installments_paid');
          if (this.host) m?.set?.('contract:installment:' + e.n);
          if (!instShown && !ev.some((x) => x.k === 'cleared')) {
            instShown = true;
            const last = [...ev].reverse().find((x) => x.k === 'inst') as Extract<LedgerEv, { k: 'inst' }>;
            setTimeout(() => { bailiff(L.installmentBailiff(last.n)); G.audio?.ui?.('hopper_tally', 0.5); }, 1600);
            setTimeout(() => voss(L.installment(last.n, this.s.count)), 3600);
          }
          break;
        case 'cleared':
          if (this.host) m?.set?.('contract:debt_cleared');
          setTimeout(() => { bailiff(L.clearedBailiff); G.audio?.ui?.('hopper_tally', 0.6); }, 1600);
          setTimeout(() => voss(L.cleared), 4200);
          break;
        case 'missed':
          bailiff(L.missedBailiff(e.pen));
          G.band?.shock?.(1, 'missed');
          setTimeout(() => voss(pick(L.missed)), 2600);
          break;
        case 'default':
          voss(L.defaultLethal);
          setTimeout(() => G.band?.detonate?.('default', true), 2500);
          break;
        case 'spend': break;
      }
    }
    void prev;
  }

  // ---------------------------------------------------------------- per frame
  update(dt: number) {
    if (!this.host) return;
    this.checkT -= dt;
    if (this.checkT > 0) return;
    this.checkT = 1;
    const m = G.missions;
    if (!m?.enabled) return;
    if (!this.s.on) { if (m.flags.has('contract:intake')) this.begin(); return; }
    const s = this.s;
    if (s.cleared || G.clock.hours < s.dueH) return;
    // deadline passed: penalty, a shock for every band, a fresh period
    const pen = Math.max(250, Math.round((s.owed - s.paid) * 0.08 / 50) * 50);
    const finalOne = s.n + 1 >= s.count;
    s.owed += pen; s.missed++;
    s.dueH = G.clock.hours + this.interval;
    const ev: LedgerEv[] = [{ k: 'missed', n: s.n + 1, pen }];
    if (finalOne && Number(G.sandbox.finalLethal ?? 0)) ev.push({ k: 'default' });
    this.publish(ev);
  }

  serialize() { return { ...this.s }; }
  load(s: any) { if (s && typeof s === 'object') { this.s = { ...blank(), ...s }; bus.emit('debtChanged', this.state()); } }
}
