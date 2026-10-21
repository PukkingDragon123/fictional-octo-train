// The quest runtime: everything defQuest registers (src/game/quests.ts) is
// offered ("uploaded to the watch"), accepted, tracked, paid for and rewarded
// here. Owned by the MissionSystem (G.missions.quests, also G.watch.quests).
//
// State is one small record per quest, replicated as an absolute 'quest' op
// (host-authoritative, logged, so co-op peers, late joiners and saves all
// replay it). The old directive flags are mirrored so anything that waited for
// 'start:<key>' / 'done:<key>' keeps working: accepted sets start:, completion
// sets done:, objectives latch as obj:<key>:<id> mission flags.
//
// Crew quests: the whole crew shares one record. Every peer evaluates the
// objectives it can see (its own position, inventory) and latches them; the
// host decides offers and completion and runs the ledger side (scrip costs and
// rewards); every peer grants its own RP / research unlocks / items when a
// quest completes (RP and research are per-profile).
import { bus } from '../core/events';
import { G } from '../game/G';
import { defOp, op, isReplaying } from '../game/ops';
import { questDefs, questDef, type QuestDef, type QuestObjective } from '../game/quests';
import { grantResearch, grantNode, researchNode } from '../game/research';
import { hasItemDef, itemDef, itemName } from '../items/item';
import { createItem } from '../items/factory';
import { voss } from '../game/debt/voice';
import type { MissionSystem, SignalDef } from './missions';
import type { Item } from '../items/item';
import type { Player } from '../entities/player';

export type QStatus = 'off' | 'act' | 'ready' | 'done' | 'decl';
/** s status · n completions · t clock hour of the last change · b baselines captured on accept · by who accepted */
export interface QRec { s: QStatus; n: number; t: number; b?: Record<string, number>; by?: string }

/** where an objective (or a quest) points: drawn on the watch's map and glance view */
export interface QWhere { zone: string; x: number; z: number; label?: string }

export interface QObjX extends QuestObjective { where?: () => QWhere | null }
/** optional extras this runtime understands on top of QuestDef (all additive) */
export interface QuestX extends QuestDef {
  objectives: QObjX[];
  /** extra availability test (research owned, a zone visited...) */
  when?: (m: MissionSystem) => boolean;
  /** the contract chain: listed first, cannot be abandoned or declined */
  main?: boolean;
  /** who reads the intro / outro: Voss (the handler) or a radio burst */
  voice?: 'handler' | 'radio';
  intro?: string;
  outro?: string;
  /** radio signals live while the quest is active (SIG function) */
  signals?: SignalDef[];
  /** repeatables: game hours before it is offered again (default 8) */
  cooldownH?: number;
  /** baselines captured when accepted (relative objectives: "remit 1,500 more scrip") */
  begin?: (m: MissionSystem) => Record<string, number>;
  /** handed to whoever accepts (a sealed case to carry) */
  give?: [string, number][];
  /** map / glance target while active */
  where?: () => QWhere | null;
  /** never offered by itself: someone hands it out (G.watch.acceptQuest). Tribe work is manual by default. */
  manual?: boolean;
}
export interface QView {
  key: string; def: QuestX; rec: QRec | null; status: QStatus | 'new';
  title: string; giver: string; desc: string; category: string;
  objectives: { id: string; text: string; done: boolean; prog: number; optional: boolean }[];
  rewardText: string; costText: string;
  /** can the local player pay what this needs right now (scrip, items) */
  affordable: boolean; payNote: string;
}

const HOUR = () => G.clock?.hours ?? 0;
const fmt = (n: number) => Math.round(n).toLocaleString('en-GB');
export const SCRIP = ' SCRIP';

// ---------------------------------------------------------------- replication
defOp('quest', (a: { k: string; r: QRec | null }) => { (G.missions?.quests as QuestRuntime | undefined)?.apply(a.k, a.r); });
/** a peer asks the host to accept / decline / pay / abandon (processed on the host only) */
defOp('questReq', (a: { k: string; act: string; by: string }, ctx) => {
  if (!ctx.host || isReplaying()) return;
  (G.missions?.quests as QuestRuntime | undefined)?.hostRequest(a.k, a.act, a.by);
});
/** crew-wide event counters (scans, anomalies logged, scrip pressed, laser cuts...): increments replay deterministically */
defOp('qtally', (a: { c: string; d: number }) => {
  const q = G.missions?.quests as QuestRuntime | undefined;
  if (q) q.tallies.set(a.c, (q.tallies.get(a.c) || 0) + (Number(a.d) || 0));
});

/** item cost / reward entries: an item key, or '#tag' for any item with that tag */
function matches(it: Item, key: string) { return key.startsWith('#') ? !!itemDef(it.key).tags?.includes(key.slice(1)) : it.key === key; }
function itemLabel(key: string) { return key.startsWith('#') ? key.slice(1) : hasItemDef(key) ? itemName({ key } as Item) : key; }

export class QuestRuntime {
  recs = new Map<string, QRec>();
  tallies = new Map<string, number>();
  /** local: what has been presented (status + completions per quest, objective flags) */
  private seen = new Map<string, string>();
  private seenObj = new Set<string>();
  /** local: the quest pinned to the glance view */
  tracked: string | null = null;
  /** local: newly uploaded quests the player has not opened yet */
  fresh = new Set<string>();

  constructor(private m: MissionSystem) {
    try { this.tracked = localStorage.getItem('noclip.trackedQuest'); } catch { /* private mode */ }
  }

  // ================================================================ read API
  def(k: string) { return questDef(k) as QuestX | undefined; }
  rec(k: string) { return this.recs.get(k) || null; }
  status(k: string): QStatus | null { return this.recs.get(k)?.s ?? null; }
  tally(c: string) { return this.tallies.get(c) || 0; }
  /** baseline captured on accept */
  base(k: string, c: string) { return this.recs.get(k)?.b?.[c] ?? 0; }
  /** completed at least once */
  completed(k: string) { const r = this.recs.get(k); return !!r && (r.n > 0 || r.s === 'done'); }

  private needsDebt(d: QuestX) { return !!(d.cost?.scrip || d.reward?.scrip); }
  /** requirements met (quest keys completed, 'flag:' mission flags, scrip quests need the contract) */
  available(d: QuestX): boolean {
    const m = this.m;
    if (!m.enabled && (d.main || this.needsDebt(d))) return false;
    if (this.needsDebt(d) && !G.debt?.on) return false;
    for (const r of d.requires || []) {
      if (r.startsWith('flag:')) { if (!m.flags.has(r.slice(5))) return false; }
      else if (!this.completed(r) && !m.flags.has('done:' + r)) return false;
    }
    try { return d.when ? d.when(m) : true; } catch { return false; }
  }

  objProgress(d: QuestX, o: QuestObjective): number {
    const r = this.recs.get(d.key);
    if (r?.s === 'done' || r?.s === 'ready') return 1;
    if (this.m.flags.has(`obj:${d.key}:${o.id}`)) return 1;
    try { const v = o.check(this.m); return v === true ? 1 : v === false ? 0 : Math.max(0, Math.min(1, Number(v) || 0)); } catch { return 0; }
  }

  /** quests by watch tab: active (accepted, ready to pay), offers (uploaded, declined), done */
  list(tab: 'active' | 'offers' | 'done'): QView[] {
    const out: QView[] = [];
    for (const d of questDefs() as QuestX[]) {
      const r = this.recs.get(d.key);
      if (!r) continue;
      const s = r.s;
      const ok = tab === 'active' ? s === 'act' || s === 'ready' : tab === 'offers' ? s === 'off' || s === 'decl' : s === 'done' || (r.n > 0 && s !== 'act' && s !== 'ready' && s !== 'off');
      if (ok) out.push(this.view(d.key)!);
    }
    const rank = (v: QView) => (v.def.main ? 0 : 1) * 10 + (v.status === 'ready' ? 0 : v.status === 'decl' ? 5 : 1);
    out.sort((a, b) => rank(a) - rank(b));
    if (tab === 'done') out.reverse();
    return out;
  }

  view(k: string): QView | null {
    const d = this.def(k); if (!d) return null;
    const r = this.recs.get(k) || null;
    const objectives = d.objectives.map((o) => {
      const prog = this.objProgress(d, o);
      return { id: o.id, text: o.text + (o.optional ? ' (optional)' : ''), done: prog >= 1, prog, optional: !!o.optional };
    });
    const { ok, note } = this.affordable(d);
    return {
      key: k, def: d, rec: r, status: r?.s ?? 'new',
      title: d.title, giver: d.giver || (d.main ? 'SSGT. VOSS' : 'UNKNOWN'), desc: typeof d.desc === 'string' ? d.desc : String(d.desc ?? ''),
      category: d.category || (d.main ? 'contract' : 'side'), objectives,
      rewardText: rewardText(d), costText: costText(d), affordable: ok, payNote: note,
    };
  }

  /** the local player's scrip / items against this quest's cost */
  affordable(d: QuestX): { ok: boolean; note: string } {
    const c = d.cost;
    if (!c) return { ok: true, note: '' };
    const debt = G.debt;
    if (c.scrip) {
      if (!debt?.on) return { ok: false, note: 'NO ACCOUNT' };
      if (debt.cleared && debt.surplus < c.scrip) return { ok: false, note: `NEED ${fmt(c.scrip)}${SCRIP} SURPLUS` };
    }
    const p = G.local;
    for (const [key, n] of c.items || []) {
      const have = p ? p.allItems().filter((it: Item) => matches(it, key) && !p.isWorn(it)).length : 0;
      if (have < n) return { ok: false, note: `NEED ${n}× ${itemLabel(key).toUpperCase()}` };
    }
    const billed = !!c.scrip && debt?.on && !debt.cleared;
    return { ok: true, note: billed ? 'BILLED TO YOUR BALANCE' : c.scrip ? 'FROM SURPLUS' : '' };
  }

  /** what the glance view follows: the pinned quest, else the first active one */
  focus(): string | null {
    const t = this.tracked, s = t ? this.status(t) : null;
    if (t && (s === 'act' || s === 'ready')) return t;
    return this.list('active')[0]?.key ?? null;
  }
  track(k: string | null) {
    this.tracked = k;
    try { if (k) localStorage.setItem('noclip.trackedQuest', k); else localStorage.removeItem('noclip.trackedQuest'); } catch { /* ignore */ }
  }
  /** first unfinished objective with a location, for the map / glance arrow */
  target(k: string | null): QWhere | null {
    if (!k) return null;
    const d = this.def(k); if (!d) return null;
    for (const o of d.objectives as QObjX[]) if (o.where && this.objProgress(d, o) < 1) { try { const w = o.where(); if (w) return w; } catch { /* ignore */ } }
    try { return d.where?.() ?? null; } catch { return null; }
  }
  signals(): SignalDef[] {
    const out: SignalDef[] = [];
    for (const d of questDefs() as QuestX[]) { const s = this.recs.get(d.key)?.s; if ((s === 'act' || s === 'ready') && d.signals) out.push(...d.signals); }
    return out;
  }

  // ================================================================ local actions (any peer)
  /** accept / decline / pay / abandon from the watch */
  request(k: string, act: 'accept' | 'decline' | 'pay' | 'abandon'): string | null {
    const d = this.def(k), r = this.recs.get(k), p = G.local;
    if (!d || !p) return 'NO SUCH QUEST';
    if (!r) {
      // handed out in person (a tribe's job board): accept straight onto the watch
      if (act !== 'accept' || !this.available(d)) return 'NOT AVAILABLE';
      if (d.cost?.payOnAccept) { const a = this.affordable(d); if (!a.ok) return a.note; this.takeItems(p, d); }
      op('questReq', { k, act, by: p.id });
      return null;
    }
    if (act === 'accept') {
      if (r.s !== 'off' && r.s !== 'decl') return null;
      if (d.cost?.payOnAccept) { const a = this.affordable(d); if (!a.ok) return a.note; this.takeItems(p, d); }
    } else if (act === 'pay') {
      if (r.s !== 'ready') return null;
      const a = this.affordable(d); if (!a.ok) return a.note;
      this.takeItems(p, d);
    } else if (act === 'decline') {
      if (r.s !== 'off' || d.main) return null;
    } else if (act === 'abandon') {
      if ((r.s !== 'act' && r.s !== 'ready') || d.main) return null;
    }
    this.fresh.delete(k);
    op('questReq', { k, act, by: p.id });
    return null;
  }

  private takeItems(p: Player, d: QuestX) {
    for (const [key, n] of d.cost?.items || []) {
      for (const it of p.allItems().filter((q: Item) => matches(q, key) && !p.isWorn(q)).slice(0, n)) p.removeItem(it);
    }
    bus.emit('inventoryChanged', p);
  }

  // ================================================================ host
  hostRequest(k: string, act: string, by: string) {
    const d = this.def(k);
    let r = this.recs.get(k);
    if (!d) return;
    if (!r) { if (act !== 'accept' || !this.available(d)) return; r = { s: 'off', n: 0, t: HOUR() }; }
    const now = HOUR();
    switch (act) {
      case 'accept':
        if (r.s !== 'off' && r.s !== 'decl') return;
        if (d.cost?.payOnAccept && d.cost.scrip && !this.charge(d.cost.scrip, d.title, by)) return;
        this.put(k, { s: 'act', n: r.n, t: now, b: this.baselines(d), by });
        break;
      case 'decline': if (r.s === 'off' && !d.main) this.put(k, { s: 'decl', n: r.n, t: now }); break;
      case 'abandon': if ((r.s === 'act' || r.s === 'ready') && !d.main) this.put(k, { s: d.repeatable ? 'decl' : 'off', n: r.n, t: now }); break;
      case 'pay':
        if (r.s !== 'ready') return;
        if (d.cost?.scrip && !d.cost.payOnAccept && !this.charge(d.cost.scrip, d.title, by)) return;
        this.complete(d, r, by);
        break;
    }
  }

  private baselines(d: QuestX) { try { return d.begin?.(this.m); } catch { return undefined; } }

  /** bill the shared account (quest fees, permits, bribes) */
  private charge(v: number, what: string, by: string): boolean {
    const debt = G.debt;
    if (!debt?.on) return false;
    if (typeof debt.charge === 'function') return debt.charge(v, what, by);
    return debt.spend?.(v, what, by) ?? false;
  }

  private put(k: string, r: QRec | null) { op('quest', { k, r }); }

  /** host: offers, auto-accepts, objective latches, completion, repeat cooldowns (twice a second) */
  evaluate() {
    const m = this.m, now = HOUR();
    for (const d of questDefs() as QuestX[]) {
      const r = this.recs.get(d.key);
      if (!r) {
        if (isManual(d) || !this.available(d)) continue;
        if (d.auto) this.put(d.key, { s: 'act', n: 0, t: now, b: this.baselines(d) });
        else this.put(d.key, { s: 'off', n: 0, t: now });
        continue;
      }
      if (r.s === 'act') {
        let all = true;
        for (const o of d.objectives) {
          if (this.objProgress(d, o) >= 1) { const f = `obj:${d.key}:${o.id}`; if (!m.flags.has(f)) m.set(f); }
          else if (!o.optional) all = false;
        }
        if (!all) continue;
        const c = d.cost;
        if (c && !c.payOnAccept && (c.scrip || c.items?.length)) this.put(d.key, { ...r, s: 'ready', t: now });
        else this.complete(d, r, r.by);
      } else if ((r.s === 'done' || r.s === 'decl') && d.repeatable) {
        if (now - r.t >= (d.cooldownH ?? 8) && this.available(d)) {
          if (d.auto) this.put(d.key, { s: 'act', n: r.n, t: now, b: this.baselines(d) });
          else this.put(d.key, { s: 'off', n: r.n, t: now });
        }
      }
    }
  }

  /** clients: latch the objectives this peer can see (its own position, pockets) for the host to count */
  latch() {
    for (const d of questDefs() as QuestX[]) {
      if (this.recs.get(d.key)?.s !== 'act') continue;
      for (const o of d.objectives) { const f = `obj:${d.key}:${o.id}`; if (!this.m.flags.has(f) && this.objProgress(d, o) >= 1) this.m.set(f); }
    }
  }

  private complete(d: QuestX, r: QRec, by?: string) {
    this.put(d.key, { s: 'done', n: r.n + 1, t: HOUR(), by });
    if (d.reward?.scrip) G.debt?.credit?.(d.reward.scrip, 'quest', by);
    try { d.onComplete?.(); } catch (e) { console.warn('quest onComplete', d.key, e); }
  }

  /** every peer, from the op: the record, the mirrored flags, local rewards */
  apply(k: string, r: QRec | null) {
    const prev = this.recs.get(k);
    if (r) this.recs.set(k, { ...r }); else this.recs.delete(k);
    const f = this.m.flags, s = r?.s;
    if (s === 'act' || s === 'ready' || s === 'done') f.add('start:' + k); else f.delete('start:' + k);
    if (r && (r.n > 0 || s === 'done')) f.add('done:' + k); else f.delete('done:' + k);
    if (s === 'off' || s === 'decl' || !r) for (const fl of [...f]) if (fl.startsWith(`obj:${k}:`)) { f.delete(fl); this.seenObj.delete(fl); }
    bus.emit('quest', k, r, prev);
    if (isReplaying()) { this.seen.set(k, sig(r)); for (const fl of f) if (fl.startsWith(`obj:${k}:`)) this.seenObj.add(fl); return; }
    const d = this.def(k);
    if (!d || !r || !G.local) return;
    // accepting hands over what the job needs
    if (s === 'act' && prev?.s !== 'act' && r.by && r.by === G.local.id) for (const [key, n] of d.give || []) giveItems(G.local, key, n);
    if (s === 'done' && prev?.s !== 'done') this.reward(d);
  }

  /** local rewards: RP, research unlocks ("new functions uploaded"), items */
  private reward(d: QuestX) {
    const w = d.reward;
    if (w?.rp) grantResearch(w.rp, 'quest:' + d.key);
    for (const u of w?.unlock || []) grantNode(u);
    for (const [key, n] of w?.items || []) giveItems(G.local, key, n);
    bus.emit('questComplete', d.key);
  }

  // ================================================================ presentation (every peer)
  present() {
    const flags = this.m.flags;
    for (const d of questDefs() as QuestX[]) {
      const r = this.recs.get(d.key);
      const now = sig(r), was = this.seen.get(d.key);
      if (now !== was) {
        this.seen.set(d.key, now);
        if (r) this.announce(d, r, was);
      }
      if (r?.s === 'act') for (const o of d.objectives) {
        const fk = `obj:${d.key}:${o.id}`;
        if (flags.has(fk) && !this.seenObj.has(fk)) {
          this.seenObj.add(fk);
          G.ui?.toast?.('✓ ' + o.text, d.title, 2.8);
          G.audio?.ui?.('watchTick', 0.5);
        }
      }
    }
  }

  private announce(d: QuestX, r: QRec, was: string | undefined) {
    const w = G.watch;
    const prevS = was?.split(':')[0];
    switch (r.s) {
      case 'off':
        this.fresh.add(d.key);
        this.m.unread = true;
        G.ui?.toast?.(d.main ? 'OBJECTIVE UPLOADED' : 'QUEST UPLOADED', `${d.title} — ${d.giver || 'UNKNOWN'}`, 4.5);
        G.audio?.ui?.('questChime', 0.6);
        w?.notify?.(d.key, 'offer');
        if (d.intro && d.voice) this.line(d, d.intro, 7);
        break;
      case 'act':
        if (prevS === 'off' || prevS === 'decl') { G.ui?.toast?.('QUEST ACCEPTED', d.title, 3); G.audio?.ui?.('watchTick', 0.6); }
        else {
          // auto quests (the contract) arrive already accepted
          this.fresh.add(d.key);
          this.m.unread = true;
          G.ui?.toast?.(d.main ? 'OBJECTIVE UPLOADED' : 'QUEST UPLOADED', d.title, 4.5);
          G.audio?.ui?.('questChime', 0.6);
          w?.notify?.(d.key, 'offer');
          if (d.intro) this.line(d, d.intro, 7);
        }
        // the objectives of a quest that was already done when it arrived are not news
        for (const o of d.objectives) { const fk = `obj:${d.key}:${o.id}`; if (this.m.flags.has(fk)) this.seenObj.add(fk); }
        break;
      case 'ready':
        G.ui?.toast?.('READY TO TURN IN', `${d.title} — ${costText(d)}`, 4);
        G.audio?.ui?.('questChime', 0.45);
        w?.notify?.(d.key, 'ready');
        break;
      case 'done': {
        G.ui?.toast?.('QUEST COMPLETE', `${d.title}${rewardText(d) ? ' — ' + rewardText(d) : ''}`, 5);
        G.audio?.ui?.('questDone', 0.6);
        w?.notify?.(d.key, 'done');
        if (d.outro) setTimeout(() => this.line(d, d.outro!, 8), 2200);
        if (this.tracked === d.key) this.track(null);
        break;
      }
      case 'decl': break;
    }
  }

  private line(d: QuestX, text: string, secs: number) {
    if (d.voice === 'handler') { voss(text); return; }
    this.m.radio(text, secs);
  }

  // ================================================================ persistence (the op log replays too)
  serialize() { return { recs: [...this.recs], tallies: [...this.tallies] }; }
  load(s: any) {
    if (!s) return;
    this.recs = new Map(s.recs || []);
    this.tallies = new Map(s.tallies || []);
    for (const [k, r] of this.recs) this.seen.set(k, sig(r));
  }
}

function sig(r: QRec | null | undefined) { return r ? `${r.s}:${r.n}` : ''; }
function isManual(d: QuestX) { return d.manual ?? d.category === 'tribe'; }

function giveItems(p: Player, key: string, n: number) {
  if (!hasItemDef(key)) return;
  for (let i = 0; i < n; i++) p.inv.add(createItem(key, undefined, { pristine: true }));
  bus.emit('inventoryChanged', p);
}

export function rewardText(d: QuestDef): string {
  const w = d.reward; if (!w) return '';
  const out: string[] = [];
  if (w.rp) out.push(`+${w.rp} RP`);
  if (w.scrip) out.push(`+${fmt(w.scrip)}${SCRIP}`);
  for (const u of w.unlock || []) out.push('↑' + (researchNode(u)?.title || u).toUpperCase());
  for (const [k, n] of w.items || []) out.push(`${n > 1 ? n + '× ' : ''}${itemLabel(k).toUpperCase()}`);
  return out.join('  ');
}
export function costText(d: QuestDef): string {
  const c = d.cost; if (!c) return '';
  const out: string[] = [];
  if (c.scrip) out.push(`PAY ${fmt(c.scrip)}${SCRIP}`);
  for (const [k, n] of c.items || []) out.push(`HAND IN ${n > 1 ? n + '× ' : ''}${itemLabel(k).toUpperCase()}`);
  return out.join(' + ') + (c.payOnAccept ? ' (ON ACCEPT)' : '');
}
