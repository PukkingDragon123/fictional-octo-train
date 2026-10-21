// BAILIFF: the debtor's monitor band. The hologram vitals projection is retired:
// the body HUD (src/ui/body: IV blood bag, lungs, acid-jar stomach) shows the
// body now, and the watch shows quests. What stays here is the band itself:
//
// - the steel cuff bolted through the wrist (band3d.ts) on every survivor who
//   wears one, its status lens blinking with the real pulse and going red on
//   warnings, shocks and detonation;
// - the band's cold billing voice: boot lines, warnings, shocks, deposits, due
//   installments, state remarks and the odd thing it should not say. Lines go
//   out as bus 'subtitle' events in the 'bailiff' style (the speech layer
//   renders and voices them).
//
// API (G.holo), kept for older callers: boot(), ping(kind, value?), say(text,
// opts?), toast() -> false (callers fall back to their own toast), expand() /
// collapse() / toggle() / warm() are no-ops, visible / expanded are false,
// lensPos(p, out).
import './holoSounds';
import * as THREE from 'three';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import { clamp01 } from '../../core/math';
import type { Player } from '../../entities/player';
import { Bands } from './band3d';
import * as L from './lines';
import { rigNumber } from '../../content/items/prisoner';

export interface DebtView { owed: number; paid: number; due: number; dueDay: number; cleared: boolean; hoursLeft: number | null }
type VoiceKind = 'band' | 'alarm' | 'leak';

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
/** the survivor's prisoner number: the one stencilled on the jumpsuit (content/items/prisoner.ts), so patch, band and HUD agree */
export function debtorNo(p: Player | null | undefined): string {
  if (!p) return 'D-4471';
  const given = (p as any).prisonerNo;
  if (typeof given === 'string' && given) return given;
  try { return rigNumber(p.rig); } catch { return 'D-4471'; }
}

export class Holo {
  name = 'holo';
  /** the band is on this survivor's wrist */
  fitted = false;
  /** the projection is gone: always false (kept for callers that check) */
  readonly expanded = false;
  readonly visible = false;
  screenSide = 1;
  autoOff = false;
  private booted = false;
  private sessionStart = -1;
  private bands = new Bands();
  private bandT = 0;
  private beat = 0;
  private warn: { level: number; reason: string; t: number } | null = null;
  private shockT = 0;
  private detonT = -1;
  private detonated = new Set<string>();
  private remoteRed = new Map<string, number>();
  private lastDebt: any = null;
  private dueSaid = '';
  private clearedSaid = false;
  private dead = false;
  private deadT = 0;
  private lastDepositFx = -10;
  private nearT = 0;
  // ---- voice pacing
  private queue: { text: string; kind: VoiceKind; pri: number }[] = [];
  private cds = new Map<string, number>();
  private nextLine = 0;
  private sayUntil = 0;
  private leakT = 240 + Math.random() * 200;

  constructor() {
    bus.on('bandWarning', (w: any) => this.onWarning(w));
    bus.on('bandShock', (s: any) => this.onShock(s));
    bus.on('bandDetonate', (d: any) => this.onDetonate(d));
    bus.on('debtChanged', (st: any) => this.onDebt(st));
    bus.on('deposited', (d: any) => this.depositFx(Number(d?.value) || 0, d?.by === G.local?.id));
    bus.on('moodle', (p: Player, key: string, level: number, prev: number) => { if (p?.isLocal) this.onMoodle(key, level, prev); });
    bus.on('death', (p: Player) => { if (p?.isLocal) { this.dead = true; this.queue.length = 0; } });
    G.addSystem({ name: 'holo', update: (dt) => this.update(dt) });
    (G as any).holo = this;
  }

  // =================================================================== API
  /** the intro fitted the band: boot it */
  boot() {
    this.fitted = true; this.booted = true;
    G.audio?.ui?.('band_boot', 0.7);
    const owed = this.debtNow()?.owed;
    setTimeout(() => this.say(L.BOOT_LINES[0], { pri: 3, key: 'boot0' }), 900);
    setTimeout(() => this.say(L.fill(L.BOOT_LINES[1], { id: debtorNo(G.local) }), { pri: 3, key: 'boot1' }), 1200);
    if (owed) setTimeout(() => this.say(L.fill(L.BOOT_LINES[2], { owed: fmt(owed) }), { pri: 3, key: 'boot2' }), 1500);
  }
  /** something happened the band reacts to (deposit, warn, shock, boot, anything else = a tick) */
  ping(kind: string, value?: any) {
    switch (kind) {
      case 'deposit': this.depositFx(typeof value === 'number' ? value : Number(value?.value) || 0, true); break;
      case 'warn': this.onWarning({ id: G.local?.id, level: typeof value === 'number' ? value : 0.6, reason: String(value?.reason ?? 'default') }); break;
      case 'shock': this.onShock({ id: G.local?.id, strength: Number(value) || 0.7 }); break;
      case 'boot': this.boot(); break;
      default: G.audio?.ui?.('band_tick', 0.4);
    }
  }
  expand() { /* retired */ }
  collapse() { /* retired */ }
  toggle() { /* retired */ }
  warm(_secs = 3) { /* retired */ }
  /** no projection to write on: callers use their own toast */
  toast(_title: string, _sub = '', _secs = 3.5): boolean { return false; }
  get speaking(): boolean { return (G.time ?? 0) < this.sayUntil; }
  lensPos(p: Player, out: THREE.Vector3): boolean { return this.bands.lensWorld(p.id, out); }

  /** make the band speak (a 'bailiff' subtitle; the speech layer voices it) */
  say(text: string, o: { pri?: number; key?: string; cd?: number; voice?: VoiceKind; glitch?: number } = {}): boolean {
    if (!text) return false;
    const now = G.time ?? 0;
    const pri = o.pri ?? 1;
    if (pri < 2 && now < this.nextLine) return false;
    if (o.key) { const until = this.cds.get(o.key) ?? -1; if (now < until) return false; this.cds.set(o.key, now + (o.cd ?? 0)); }
    this.queue = this.queue.filter((q) => q.pri >= pri).slice(-1);
    this.queue.push({ text, kind: o.voice ?? 'band', pri });
    return true;
  }

  // =================================================================== events
  private onWarning(w: any) {
    if (!w) return;
    const local = G.local;
    if (w.id && local && w.id !== local.id) { this.remoteRed.set(w.id, (G.time ?? 0) + 2); return; }
    const level = clamp01(Number(w.level) || 0);
    if (level <= 0.01) { this.warn = null; return; }
    const prev = this.warn;
    this.warn = { level, reason: String(w.reason || 'default'), t: 0 };
    if (!prev || prev.reason !== this.warn.reason || level - prev.level > 0.25) {
      G.audio?.ui?.('band_warn', 0.5 + level * 0.4);
      this.say(L.pick(L.WARN[this.warn.reason] || L.WARN.default), { pri: 3, key: 'warn:' + this.warn.reason, cd: 4, voice: level > 0.7 ? 'alarm' : 'band' });
    }
  }
  private onShock(s: any) {
    const local = G.local;
    if (s?.id && local && s.id !== local.id) { this.remoteRed.set(s.id, (G.time ?? 0) + 1); return; }
    const k = clamp01(Number(s?.strength) || 0.7);
    this.shockT = 0.6 + k * 0.8;
    G.audio?.ui?.('band_shock', 0.6 + k * 0.4);
    this.say(L.pick(L.SHOCK), { pri: 3, key: 'shock', cd: 3 });
  }
  private onDetonate(d: any) {
    const local = G.local;
    if (d?.id && local && d.id !== local.id) { const p = G.players.get(d.id); if (p) this.bands.sync(p, false); this.detonated.add(d.id); return; }
    this.detonT = 0;
    this.say(L.pick(L.DETONATE), { pri: 4 });
  }
  private onDebt(st: any) {
    if (!st || typeof st !== 'object') return;
    this.lastDebt = st;
    const d = this.debtNow();
    if (d?.cleared && !this.clearedSaid) { this.clearedSaid = true; this.say(L.pick(L.CLEARED), { pri: 3 }); }
  }
  private depositFx(value: number, mine: boolean) {
    const now = G.time ?? 0;
    if (now - this.lastDepositFx < 0.4) return;
    this.lastDepositFx = now;
    G.audio?.ui?.('band_ping', 0.55);
    const owed = this.debtNow()?.owed;
    if (mine || Math.random() < 0.5) this.say(L.fill(L.pick(L.DEPOSIT), { value: fmt(value), owed: owed != null ? fmt(owed) : 'pending' }), { pri: 2, key: 'deposit', cd: 7 });
  }
  private onMoodle(key: string, level: number, prev: number) {
    if (level <= prev) return;
    const lines = L.STATE[key];
    if (!lines) return;
    const need = key === 'bleeding' || key === 'attack' || key === 'fever' ? 1 : key === 'panic' || key === 'pain' ? 3 : 2;
    if (level < need) return;
    this.say(L.pick(lines), { pri: key === 'bleeding' || key === 'attack' ? 2 : 1, key: 'st:' + key, cd: 200 });
  }

  // =================================================================== debt
  private debtNow(): DebtView | null {
    const g = (G as any).debt;
    let st: any = this.lastDebt;
    if (!st && g) st = (typeof g.state === 'function' ? g.state() : g.state) ?? g.snapshot?.() ?? (typeof g.owed === 'number' ? g : null);
    if (!st || typeof st.owed !== 'number' || st.on === false) return null;
    let left: number | null = null;
    try {
      const hl = g?.hoursLeft;
      if (typeof st.dueH === 'number') left = st.dueH - G.clock.hours;
      else if (typeof hl === 'number') left = hl;
      else if (typeof hl === 'function') left = hl.call(g);
      else if (typeof st.dueAt === 'number') left = st.dueAt - G.clock.hours;
      else if (typeof st.dueDay === 'number' && st.dueDay > 0) left = (st.dueDay - G.clock.startDay + 1) * 24 - G.clock.hours;
    } catch { left = null; }
    const paid = st.paid ?? 0;
    const remaining = typeof st.remaining === 'number' ? st.remaining : Math.max(0, st.owed - paid);
    return { owed: remaining, paid, due: st.due ?? 0, dueDay: st.dueDay ?? 0, cleared: !!st.cleared || remaining <= 0, hoursLeft: left };
  }
  private debtTalk() {
    const d = this.debtNow();
    if (!d || d.cleared || d.hoursLeft == null) return;
    const tag = String(d.dueDay);
    if (d.hoursLeft > 0 && d.hoursLeft < 6 && this.dueSaid !== tag + 's') {
      this.dueSaid = tag + 's';
      this.say(L.fill(L.pick(L.DUE_SOON), { h: Math.max(1, Math.round(d.hoursLeft)), due: fmt(d.due) }), { pri: 2 });
    } else if (d.hoursLeft <= 0 && this.dueSaid !== tag + 'o') {
      this.dueSaid = tag + 'o';
      this.say(L.pick(L.OVERDUE), { pri: 2 });
    }
  }

  // =================================================================== per frame
  private update(dt: number) {
    const p = G.local;
    if (!p) return;
    this.sessionGate(p);
    if (this.dead) this.deadT += dt;
    // the 3D cuffs on everyone wearing one
    this.bandT -= dt;
    if (this.bandT <= 0) {
      this.bandT = 0.5;
      const alive = new Set<string>();
      const contract = G.missions?.enabled !== false;
      for (const q of G.players.values()) {
        alive.add(q.id);
        const st = this.bandState(q.id);
        if (st === 'armed') this.detonated.delete(q.id);
        const on = !this.detonated.has(q.id) && !this.gone(st) && (st === 'armed' || this.wearsBand(q) || (contract && (q.isLocal ? this.fitted && this.detonT < 0 : this.fitted)));
        this.bands.sync(q, on);
      }
      this.bands.prune(alive);
      this.debtTalk();
      this.nearTalk(p);
    }
    if (this.shockT > 0) this.shockT -= dt;
    if (this.detonT >= 0) { this.detonT += dt; if (this.detonT > 2 && this.bandState(p.id) === 'armed') { this.detonT = -1; this.boot(); } }
    if (this.warn) { this.warn.t += dt; if (this.warn.t > 12 && this.warn.level < 0.9) this.warn = null; }
    this.updateLens(p, dt);
    this.talk(dt, p);
  }

  private updateLens(p: Player, dt: number) {
    const now = G.time;
    for (const [id, until] of this.remoteRed) { if (now > until) { this.remoteRed.delete(id); this.bands.setLens(id, 1); } else this.bands.setLens(id, Math.floor(now * 6) % 2 ? 2 : 0); }
    if (!this.bands.has(p.id)) return;
    const bpm = this.dead ? 0 : (G.survival?.mind?.bpm ?? 70);
    this.beat += dt * bpm / 60;
    const blink = (this.beat % 1) < 0.08;
    if (this.beat > 1e6) this.beat = 0;
    const red = !!this.warn || this.shockT > 0 || this.detonT >= 0 || p.body.health < 25;
    this.bands.setLens(p.id, blink || (this.shockT > 0 && Math.random() < 0.3) ? 0 : red ? 2 : 1);
  }

  private talk(dt: number, p: Player) {
    if (!this.fitted || (this.dead && this.detonT < 0 && this.deadT > 1)) { this.queue.length = 0; return; }
    const now = G.time;
    this.leakT -= dt * (1 + (p.body.lucidity < 60 ? 2 : 0));
    if (this.leakT <= 0) {
      this.leakT = 260 + Math.random() * 300;
      this.say(L.fill(L.pick(L.LEAKS), { id: debtorNo(p) }).replace('D-4471', debtorNo(p)), { voice: 'leak', pri: 1 });
    }
    if (this.bands.side(p.id) < 0) this.say(L.RELOCATED[0], { key: 'relocated', cd: 1e9, pri: 2 });
    if (!this.queue.length || now < this.sayUntil) return;
    const q = this.queue.shift()!;
    const dur = 1 + q.text.length * 0.06;
    this.sayUntil = now + dur + 0.35;
    this.nextLine = now + dur + 10;
    bus.emit('subtitle', { who: 'BAILIFF', text: q.text, dur: dur + 0.8, style: 'bailiff', voice: q.kind, leak: q.kind === 'leak' });
  }
  private nearTalk(p: Player) {
    this.nearT -= 0.5;
    if (this.nearT > 0) return;
    for (const c of G.creatures?.creatures?.values?.() || []) {
      if (!c || c.dead || c.tamedBy || c.zoneKey !== p.zoneKey) continue;
      const t = c.sp?.temperament;
      if ((t === 'hostile' || t === 'stalker' || t === 'ambush') && Math.hypot(c.x - p.x, c.z - p.z) < 7) { this.say(L.pick(L.CREATURE), { key: 'creature', cd: 150 }); this.nearT = 5; return; }
    }
  }

  /** the band is fitted once the intro has done it (boot), or straight away when there is no intro */
  private sessionGate(p: Player) {
    if (this.fitted) return;
    if (this.sessionStart < 0) this.sessionStart = G.time;
    const intro: any = G.systems.find((s) => s.name === 'intro');
    const introOn = !!intro && intro.phase !== 'done' && !intro.done && !intro.finished;
    if (introOn) return;
    const flagged = !!G.missions?.flags?.has?.('contract:intake') || this.bandState(p.id) === 'armed';
    if (flagged || this.wearsBand(p) || G.time - this.sessionStart > 0.3) this.fitted = true;
  }
  private bandState(id: string): string { try { const s = (G as any).band?.get?.(id); return typeof s === 'string' && s !== 'none' ? s : ''; } catch { return ''; } }
  private gone(st: string) { return st === 'removed' || st === 'blown' || st === 'lost'; }
  private wearsBand(p: Player): boolean {
    try {
      if (p.worn?.get?.('wrist' as any)?.key === 'bailiff_band') return true;
      if ((p.rig as any)?.outfit?.wrist?.item === 'bailiff_band') return true;
      for (const it of p.worn?.values?.() || []) if (it.key === 'bailiff_band') return true;
    } catch { /* ignore */ }
    return false;
  }
}
