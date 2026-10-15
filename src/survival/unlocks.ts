// Earning occupations and traits. Every job except Between Jobs, Student and
// Night Janitor (and a few traits) starts locked on a fresh browser; doing
// things in a run unlocks them for every later run (profile.ts). Rules are
// either mission flags (replicated, so co-op partners earn them together) or
// lifetime profile stats counted for the local survivor.
import { G } from '../game/G';
import { bus } from '../core/events';
import { OCCUPATIONS, TRAITS } from './traits';
import { isUnlocked, unlock, stat, addStat, bumpStat, profile, resetProfile, flushStats } from '../game/profile';
import type { Player } from '../entities/player';
import type { Env } from './body';
import type { SkillKey } from './traits';
import { RehabEffects } from './rehab';

interface Rule {
  id: string;
  /** any of these mission flags */
  flags?: string[];
  /** at least n distinct flags with this prefix (in this run) */
  count?: [string, number];
  /** lifetime profile stat at least n */
  stat?: [string, number];
}

export const UNLOCK_RULES: Rule[] = [
  { id: 'job:electrician', flags: ['first_light'] },
  { id: 'job:lifeguard', flags: ['pumps_on'] },
  // the old render-node / exit chain gave way to the debt contract: these follow its flags now (the old flags still count)
  { id: 'job:developer', flags: ['band:removed', 'node:SRV-1'] },
  { id: 'job:lab_tech', flags: ['visit:lab'] },
  { id: 'job:returnee', flags: ['contract:transport', 'escaped'], stat: ['transports_bought', 1] },
  { id: 'job:fence', stat: ['scrip_deposited', 2000] },
  { id: 'job:mover', stat: ['furniture_smashed', 30] },
  { id: 'job:ex_officer', flags: ['contract:debt_cleared'] },
  { id: 'trait:lifer', stat: ['installments_paid', 3] },
  { id: 'job:investigator', flags: ['scanner_mk2'], count: ['scan:', 5] },
  { id: 'job:radio_host', count: ['sig:', 3] },
  { id: 'job:explorer', count: ['visit:', 8] },
  { id: 'job:exterminator', count: ['kill:', 3] },
  { id: 'job:nurse', stat: ['treated', 8] },
  { id: 'job:cook', stat: ['cooked', 6] },
  { id: 'job:carpenter', stat: ['carpentry', 10] },
  { id: 'job:security', stat: ['kills', 10] },
  { id: 'job:ranger', stat: ['outdoor_h', 24] },
  { id: 'job:mechanic', stat: ['drive_m', 300] },
  { id: 'job:barista', stat: ['caffeine', 4] },
  { id: 'job:mattress_tester', stat: ['sleep_h', 30] },
  { id: 'job:therapist', stat: ['panic_calmed', 3] },
  { id: 'job:mime', stat: ['sneak_s', 600] },
  { id: 'trait:iron_nerves', stat: ['panic_attacks', 5] },
  { id: 'trait:been_here_before', stat: ['deaths', 1] },
  { id: 'trait:creature_whisperer', count: ['tamed:', 1] },
  { id: 'trait:unbothered', flags: ['contract:debt_cleared', 'escaped'] },
];

/** display name of an unlock id ('job:nurse' -> 'Night-shift Nurse') */
export function unlockName(id: string): { kind: string; name: string; hint: string } {
  const [ns, key] = id.split(':');
  if (ns === 'job') { const o = OCCUPATIONS.find((x) => x.key === key); return { kind: 'OCCUPATION', name: o?.name || key, hint: o?.unlock?.hint || '' }; }
  if (ns === 'trait') { const t = TRAITS.find((x) => x.key === key); return { kind: 'TRAIT', name: t?.name || key, hint: t?.unlock?.hint || '' }; }
  return { kind: 'UNLOCK', name: key || id, hint: '' };
}

/** progress toward an unlock, 0..1 (intake form / profile page may show it) */
export function unlockProgress(id: string): number {
  if (isUnlocked(id)) return 1;
  const r = UNLOCK_RULES.find((x) => x.id === id); if (!r) return 0;
  let best = 0;
  const flags: Set<string> | undefined = G?.missions?.flags;
  if (r.stat) best = Math.max(best, Math.min(1, stat(r.stat[0]) / r.stat[1]));
  if (r.count && flags) { let n = 0; for (const f of flags) if (f.startsWith(r.count[0])) n++; best = Math.max(best, Math.min(1, n / r.count[1])); }
  return best;
}

export class Unlocks {
  private evalT = 1;
  private driveAcc = 0;
  /** upsides and downsides of the Rehab Section conditions and programmes */
  rehab = new RehabEffects();

  constructor() {
    bus.on('flag', (k: string, on: boolean) => { if (on !== false) this.onFlag(k); });
    bus.on('creatureKilled', (_c: any, killer: any) => { if (killer && killer === G.local) { addStat('kills'); this.evalT = 0; } });
    bus.on('death', (p: Player) => { if (p?.isLocal) { addStat('deaths'); this.evaluate(); } });
    bus.on('unlocked', (id: string) => this.celebrate(id));
    if (import.meta.env.DEV && typeof window !== 'undefined') {
      (window as any).__profile = { profile, unlock, resetProfile, stat, addStat, isUnlocked, rules: UNLOCK_RULES, evaluate: () => this.evaluate() };
    }
  }

  /** XP gains double as "did a thing" counters (set up by the survival system) */
  onXpGain(k: SkillKey) {
    if (k === 'firstaid') addStat('treated');
    else if (k === 'cooking') addStat('cooked');
    else if (k === 'carpentry') addStat('carpentry');
    else return;
    this.evalT = 0;
  }

  private onFlag(k: string) {
    for (const r of UNLOCK_RULES) {
      if (isUnlocked(r.id)) continue;
      if (r.flags?.includes(k)) { unlock(r.id); continue; }
      if (r.count && k.startsWith(r.count[0])) this.checkRule(r);
    }
  }

  private checkRule(r: Rule): boolean {
    if (isUnlocked(r.id)) return false;
    const flags: Set<string> | undefined = G?.missions?.flags;
    let ok = false;
    if (r.flags && flags) ok = r.flags.some((f) => flags.has(f));
    if (!ok && r.count && flags) { let n = 0; for (const f of flags) if (f.startsWith(r.count[0])) n++; ok = n >= r.count[1]; }
    if (!ok && r.stat) ok = stat(r.stat[0]) >= r.stat[1];
    if (ok) unlock(r.id);
    return ok;
  }

  evaluate() { for (const r of UNLOCK_RULES) this.checkRule(r); }

  update(p: Player, env: Env, dt: number, dh: number) {
    if (p.body.dead) return;
    try { this.rehab.update(p, env, dt, dh); } catch (e) { console.warn('rehab effects', e); }
    // lifetime counters
    if (env.outdoor && !p.inVehicle) bumpStat('outdoor_h', dh);
    if (p.sleeping) bumpStat('sleep_h', dh);
    if (p.sneaking && p.speed > 0.2) bumpStat('sneak_s', dt);
    if (p.inVehicle) {
      const v = (G as any).vehicles?.vehicles?.get?.(p.inVehicle);
      if (v) {
        this.driveAcc += Math.abs(v.speed ?? 0) * dt;
        if (this.driveAcc > 5) { bumpStat('drive_m', this.driveAcc); this.driveAcc = 0; }
        if (v.hotwired && !isUnlocked('job:mechanic')) unlock('job:mechanic');
      }
    }
    this.evalT -= dt;
    if (this.evalT <= 0) { this.evalT = 2; this.evaluate(); }
  }

  private celebrate(id: string) {
    const u = unlockName(id);
    flushStats();
    G.audio?.ui?.('scanDone', 0.6);
    // the UI layer may present unlocks itself (bus 'unlocked' -> UI.unlockToast); otherwise a plain toast
    if (typeof G.ui?.unlockToast === 'function') return;
    G.ui?.toast?.(`${u.kind} UNLOCKED`, `${u.name} is now on the intake form`, 5);
  }
}
