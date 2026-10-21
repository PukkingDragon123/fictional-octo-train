// Effects of the Remittance-era conditions and programmes, installed as wares
// through the brain at the operating table (src/ui/surgery; data in traits.ts):
// each one has an upside and a downside. Everything here
// touches only the local survivor's own body and mind, so it is the same on
// every peer. Driven by Unlocks.update (once per frame for the local player)
// and by the contract bus events ('deposited', 'debtChanged', 'objBroken',
// 'subtitle', 'handlerSay', 'bandWarning', 'bandShock').
import { G } from '../game/G';
import { bus } from '../core/events';
import { itemDef, hasItemDef } from '../items/item';
import { ensureMind } from './mind';
import type { Player } from '../entities/player';
import type { Env } from './body';

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];

export class RehabEffects {
  private lastPanic = 0;
  private lastVoss = -1;
  private debt: { due: number; dueDay: number; dueH: number; cleared: boolean } | null = null;
  private thinkCd = 0;
  private cackleT = 120 + Math.random() * 240;
  private pickT = 5 + Math.random() * 6;
  private scarePeak = 0;
  private valueT = 0;
  private carryingValue = true;
  private bandT = 0;
  private banded = false;
  private pending: { at: number; fn: (p: Player) => void }[] = [];
  private t = 0;

  constructor() {
    const mine = (id: unknown) => !!G.local && id === G.local.id;
    bus.on('deposited', (d: any) => {
      if (!mine(d?.by)) return;
      const p = G.local, b = p.body;
      if (b.has('hoarder')) { b.stress = clamp(b.stress + 7, 0, 100); b.unhappy = clamp(b.unhappy + 5, 0, 100); this.think(p, ['That was MINE.', 'I could have kept that.', 'Goodbye, little thing.'], true); }
      if (b.has('born_in_debt')) { b.panic = Math.max(0, b.panic - 22); b.stress = Math.max(0, b.stress - 9); this.think(p, ['Paid. Breathe.', 'A little less owed.', 'That feels better than food.']); }
    });
    bus.on('debtChanged', (st: any) => { if (st && typeof st === 'object') this.debt = { due: Number(st.due) || 0, dueDay: Number(st.dueDay) || 0, dueH: Number(st.dueH) || 0, cleared: !!st.cleared }; });
    // Fence: the host pays a fence's deposits 15% on top (the ledger is host-only, so this runs once)
    bus.on('deposited', (d: any) => {
      if (G.role === 'client' || !(d?.value > 0) || !d.by) return;
      const p = G.players?.get?.(d.by) as Player | undefined;
      if (!p || !(p.body?.perks?.has('fence') || p.occupation === 'fence')) return;
      try { G.debt?.credit?.(Math.round(d.value * (scripRate(p) - 1)), 'fence', d.by); } catch { /* no contract */ }
    });
    bus.on('objBroken', (_z: unknown, _o: unknown, by: unknown) => {
      if (!mine(by)) return;
      const p = G.local, b = p.body;
      if (b.has('wrecking_ball')) {
        b.stress = Math.max(0, b.stress - 8); b.boredom = Math.max(0, b.boredom - 12); b.unhappy = Math.max(0, b.unhappy - 4);
        this.think(p, ['Ahh. Better.', 'Again.', 'That felt incredible.', 'Therapy.']);
      }
    });
    const voss = () => {
      const p = G.local; if (!p) return;
      this.lastVoss = G.clock?.hours ?? 0;
      if (p.body.has('sweet_on_sarge')) { p.body.panic = Math.max(0, p.body.panic - 10); const m = ensureMind(p.body); m.loneliness = Math.max(0, m.loneliness - 4); }
    };
    bus.on('subtitle', (s: any) => { if (s?.style === 'voss' || /voss/i.test(String(s?.who || ''))) voss(); });
    bus.on('handlerSay', () => voss());
    const officer = (strength: number) => (p: Player) => { if (p.body.perks.has('ex_officer')) { p.body.panic = Math.max(0, p.body.panic - 14 * strength); p.body.stress = Math.max(0, p.body.stress - 4 * strength); } };
    bus.on('bandWarning', (w: any) => { if (mine(w?.id)) this.later(0.35, officer(0.6)); });
    bus.on('bandShock', (s: any) => { if (mine(s?.id)) this.later(0.35, officer(1.2)); });
  }

  private later(sec: number, fn: (p: Player) => void) { this.pending.push({ at: this.t + sec, fn }); }
  private think(p: Player, lines: string[], force = false) {
    if (this.thinkCd > 0 && !force) return;
    this.thinkCd = 40;
    bus.emit('think', p, pick(lines));
  }

  update(p: Player, env: Env, dt: number, dh: number) {
    const b = p.body;
    this.t += dt;
    this.thinkCd -= dt;
    if (this.pending.length) for (let i = this.pending.length - 1; i >= 0; i--) if (this.pending[i].at <= this.t) { const f = this.pending[i].fn; this.pending.splice(i, 1); f(p); }
    const T = (k: string) => b.has(k);
    const hours = G.clock?.hours ?? 0;
    const hungerBase = (env.asleep ? 1.7 : 3.4) * (1 + env.exertion * 0.6);
    const thirstBase = (env.asleep ? 2.4 : 4.6) * (1 + env.exertion * 0.8);
    const panicRise = Math.max(0, b.panic - this.lastPanic);

    // ---- Fresh Fish: too green to panic properly, but always hungry
    if (T('fresh_fish')) {
      const start = (G.sandbox as any)?.startHour ?? 8.5;
      if (hours - start < 48 && panicRise > 0) b.panic = Math.max(0, b.panic - panicRise * 0.3);
      b.hunger = clamp(b.hunger + hungerBase * 0.25 * dh, 0, 100);
      b.thirst = clamp(b.thirst + thirstBase * 0.25 * dh, 0, 100);
    }
    // ---- Snitch: fed by everybody, sleeps badly
    if (T('snitch')) {
      b.hunger = clamp(b.hunger - hungerBase * 0.2 * dh, 0, 100);
      if (env.asleep) b.fatigue = clamp(b.fatigue + (6 + env.bedQuality * 9) * 0.2 * dh, 0, 100);
    }
    // ---- Lifer: the inside is home, the outside is terror
    if (T('lifer')) {
      b.boredom = Math.max(0, b.boredom - (env.moving ? 1.1 : 2.6) * dh);
      if (env.smallRoom) { b.stress = Math.max(0, b.stress - 1.5 * dh); if (panicRise > 0) b.panic = Math.max(0, b.panic - panicRise * 0.3); }
      if (env.openSpace || env.outdoor) { b.stress = clamp(b.stress + 3 * dh, 0, 100); if (Math.random() < dt * 0.01) this.think(p, ['Too much space. Too much sky.', 'Where are the walls?']); }
    }
    // ---- Wrecking Ball: restless hands
    if (T('wrecking_ball')) b.boredom = clamp(b.boredom + 1.0 * dh, 0, 100);
    // ---- Sweet on the Sergeant: his silence hurts
    if (T('sweet_on_sarge') && this.lastVoss >= 0 && hours - this.lastVoss > 1) b.unhappy = clamp(b.unhappy + 1.2 * dh, 0, 100);
    // ---- Gallows Humour: laughs off the scares (out loud)
    if (T('gallows_humour')) {
      if (env.threat < 0.05 && b.panic > 0) b.panic = Math.max(0, b.panic - 2.5 * dt);
      this.scarePeak = Math.max(this.scarePeak, b.panic);
      if (this.scarePeak > 40 && b.panic < 8) { this.scarePeak = 0; b.unhappy = Math.max(0, b.unhappy - 6); this.think(p, ['Ha. Ha ha. Ha.', 'Well that was horrible.', 'I nearly wet myself. Ha!'], true); }
      if (b.panic > 25 && !p.sleeping) {
        this.cackleT -= dt;
        if (this.cackleT <= 0) {
          this.cackleT = 150 + Math.random() * 260;
          G.ui?.say?.(p, pick(['HA! HA HA HA!', 'hehehe... HAHAHA', 'HAHA! oh no']), 'shout', 1.8);
          bus.emit('noise', { x: p.x, z: p.z, radius: 14, kind: 'shout', zone: p.zoneKey, by: p.id });
        }
      }
    }
    // ---- Picks at the Band: soothing, until it bleeds
    if (T('band_picker')) {
      b.stress = Math.max(0, b.stress - 0.65 * dh);
      this.bandT -= dt;
      if (this.bandT <= 0) { this.bandT = 3; this.banded = (G as any).band ? !!(G as any).band.armed?.(p.id) : [...p.worn.values()].some((it) => it.key === 'bailiff_band'); }
      if (this.banded && !p.sleeping) {
        this.pickT -= dh;
        if (this.pickT <= 0) {
          this.pickT = 6 + Math.random() * 8;
          try { b.addInjury('farm_l', 'scratch', 0.22, { dirty: true }); } catch { /* body part gone */ }
          this.think(p, ['Stop picking at it.', 'It is bleeding again.', 'Ow. Why do I do that.'], true);
        }
      }
    }
    // ---- Hoarder: a full pack is safety
    if (T('hoarder')) {
      let load = 0;
      try { load = p.carriedWeight() / Math.max(1, b.carryCapacity()); } catch { /* ignore */ }
      if (load > 0.7) { b.stress = Math.max(0, b.stress - 1.5 * dh); b.unhappy = Math.max(0, b.unhappy - 0.8 * dh); }
    }
    // ---- programmes
    if (b.perks.has('fence')) {
      this.valueT -= dt;
      if (this.valueT <= 0) {
        this.valueT = 2;
        this.carryingValue = p.allItems().some((it) => hasItemDef(it.key) && (itemDef(it.key).value ?? 0) >= 3 && !(itemDef(it.key).clothing));
      }
      if (!this.carryingValue) b.unhappy = clamp(b.unhappy + 1 * dh, 0, 100);
    }
    if (b.perks.has('mover')) {
      let load = env.heavyLoad;
      try { load = Math.max(load, p.carriedWeight() / Math.max(1, b.carryCapacity()) - 0.85); } catch { /* ignore */ }
      if (load > 0) { b.fatigue = clamp(b.fatigue + 2.5 * dh, 0, 100); b.unhappy = clamp(b.unhappy + 0.8 * dh, 0, 100); }
    }
    if (b.perks.has('ex_officer')) b.unhappy = clamp(b.unhappy + 0.35 * dh, 0, 100);
    // ---- Born in Debt: the deadline is a weight
    if (T('born_in_debt') && this.debt && !this.debt.cleared && this.debt.due > 0 && this.debt.dueH > 0) {
      const left = this.debt.dueH - hours;
      if (left > 0 && left < 24) b.stress = clamp(b.stress + 2.2 * dh, 0, 100);
    }
    this.lastPanic = b.panic;
  }
}

/** scrip multiplier for a depositor's programme (the debt contract may call this when it credits a deposit) */
export function scripRate(p: Player | null | undefined): number {
  return p?.body?.perks?.has('fence') || p?.occupation === 'fence' ? 1.15 : 1;
}
