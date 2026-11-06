// What a run amounted to, for the death report: a small tracker that starts
// with the session (distance walked, rooms entered, valuables pressed,
// creatures killed, the last thing that hurt you) and, at the death, the
// cause and the research points the Institute pays for the data.
import { bus } from '../../core/events';
import { G } from '../../game/G';
import type { Game } from '../../game/game';
import type { Player } from '../../entities/player';
import { stat, addStat } from '../../game/profile';
import { species } from '../../creatures/registry';
import { runLog } from '../../game/meridian';
import { carriedSamples } from '../../research/bank';

export type CauseKey =
  | 'creature' | 'harmless' | 'wounds' | 'press' | 'band' | 'chess' | 'custody'
  | 'bleed' | 'thirst' | 'hunger' | 'cold' | 'heat' | 'infection' | 'corrupt' | 'sick' | 'downed' | 'other' | 'unknown';

export interface Cause {
  key: CauseKey;
  /** the report's line, e.g. "Mauled by the Drywall Man" */
  text: string;
  /** what did it (creature name, machine) */
  who?: string;
  /** scanner threat of the creature (0 harmless .. 5) */
  threat?: number;
}

export interface RpLine { key: string; label: string; short: string; value: string; num: number; rp: number }

export interface RunReport {
  name: string;
  file: string;
  hours: number;
  cause: Cause;
  newCause: boolean;
  debtOn: boolean;
  owed: number; paid: number; remaining: number; cleared: boolean;
  valuables: number; scrip: number; rooms: number; kills: number; metres: number;
  lines: RpLine[];
  rp: number;
  /** lifetime deaths including this one */
  deaths: number;
  zone: string;
  /** what this run filed with the Meridian file: new codex entries (species names), samples lost on the body */
  discovered?: string[];
  lostSamples?: number;
}

interface LastHit { by: string; kind: string; part: string; t: number; dmg: number }

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

export class RunTracker {
  readonly name = 'deathStats';
  private startH: number;
  private paid0: number | null = null;
  private valuables = 0; private scrip = 0; private kills = 0; private metres = 0;
  private rooms = new Set<string>();
  private last: LastHit | null = null;
  private lastCreature: LastHit | null = null;
  private bandAt = -1e9;
  private px = NaN; private pz = NaN; private pzone = '';
  private offs: (() => void)[] = [];

  constructor(private g: Game, private p: Player) {
    this.startH = g.clock.hours;
    const isMe = (k: any) => k === p || k === p.id;
    this.offs.push(
      bus.on('creatureKilled', (_c: any, killer: any) => { if (isMe(killer)) this.kills++; }),
      bus.on('deposited', (d: { by?: string; keys?: string[]; value?: number }) => {
        if (d?.by && d.by !== p.id) return;
        this.valuables += d?.keys?.length ?? 1; this.scrip += d?.value ?? 0;
      }),
      bus.on('playerHit', (pl: Player, part: string, kind: string, h: any) => {
        if (pl !== p) return;
        const hit = { by: String(h?.by ?? ''), kind: String(kind ?? ''), part: String(part ?? ''), t: performance.now(), dmg: Number(h?.dmg ?? 0) };
        this.last = hit;
        if (hit.by && species(hit.by)) this.lastCreature = hit;
      }),
      bus.on('bandDetonate', (e: { id?: string }) => { if (e?.id === p.id) this.bandAt = performance.now(); }),
    );
  }

  /** per frame: metres walked (teleports and zone changes don't count), rooms entered */
  update() {
    const p = this.p;
    if (this.paid0 === null && G.debt) this.paid0 = (G.debt as any).paid ?? 0;
    if (p.body.dead) return;
    if (p.zoneKey === this.pzone && Number.isFinite(this.px)) {
      const d = Math.hypot(p.x - this.px, p.z - this.pz);
      if (d < 1.5) this.metres += d;
    }
    this.px = p.x; this.pz = p.z; this.pzone = p.zoneKey;
    try {
      const z = this.g.zone;
      if (z && z.key === p.zoneKey) {
        const r = z.roomAt(p.tileX(), p.tileY());
        this.rooms.add(r && r.id > 0 ? `${z.key}:${r.id}` : `${z.key}:out`);
      }
    } catch { /* no zone yet */ }
  }

  dispose() { for (const f of this.offs) f(); this.offs = []; }

  /** what killed them, from the last blow and the state of the body */
  cause(): Cause {
    const p = this.p, b: any = p.body, now = performance.now();
    if (now - this.bandAt < 5000) return { key: 'band', text: 'Detonated by the BAILIFF band', who: 'the BAILIFF band' };
    const h = this.last;
    if (h && now - h.t < 6000) {
      if (/press/i.test(h.by)) return { key: 'press', text: 'Compacted by the Remittance Press', who: 'the Remittance Press' };
      if (/bailiff|band/i.test(h.by)) return { key: 'band', text: 'Detonated by the BAILIFF band', who: 'the BAILIFF band' };
      if (h.by === 'custody') return { key: 'custody', text: 'Died in Meridian custody', who: 'custody' };
      const sp: any = species(h.by);
      if (sp) {
        const nm = String(sp.name || h.by);
        const the = /^the\s/i.test(nm) ? nm : (sp.threat ?? 0) <= 1 ? `a ${nm}` : `the ${nm}`;
        if ((sp.threat ?? 0) <= 1) return { key: 'harmless', text: `Killed by ${the}`, who: the, threat: sp.threat ?? 0 };
        const verb = h.kind === 'bite' ? 'Mauled by' : h.kind === 'blunt' || h.kind === 'crush' || h.kind === 'fracture' ? 'Crushed by' : 'Torn apart by';
        return { key: 'creature', text: `${verb} ${the}`, who: the, threat: sp.threat ?? 3 };
      }
      if (h.by) return { key: 'other', text: `Killed by ${h.by}`, who: h.by };
    }
    if (p.zoneKey === 'chess') return { key: 'chess', text: 'Taken on the Board', who: 'a chess piece' };
    if (b.thirst >= 97) return { key: 'thirst', text: 'Dehydration' };
    if (b.hunger >= 97 || b.calories <= -1900) return { key: 'hunger', text: 'Starvation' };
    if (b.temp <= 33.5) return { key: 'cold', text: 'Hypothermia' };
    if (b.temp >= 40.8) return { key: 'heat', text: 'Heatstroke' };
    if (b.corruption >= 85) return { key: 'corrupt', text: 'Simulation corruption' };
    if (b.sickness >= 85) return { key: 'sick', text: 'Acute sickness' };
    if (Array.isArray(b.injuries) && b.injuries.some((i: any) => (i.infection ?? 0) > 0.55)) return { key: 'infection', text: 'Infected wounds' };
    const lc = this.lastCreature;
    if (lc && now - lc.t < 180000) {
      const sp: any = species(lc.by), nm = String(sp?.name || lc.by);
      return { key: 'wounds', text: `Died of wounds (${/^the\s/i.test(nm) ? nm : 'the ' + nm})`, who: /^the\s/i.test(nm) ? nm : 'the ' + nm, threat: sp?.threat };
    }
    if (b.blood <= 40) return { key: 'bleed', text: 'Bled out' };
    if (G.role !== 'solo' && b.downedTime > 80) return { key: 'downed', text: 'Left on the floor' };
    return { key: 'unknown', text: 'Undetermined' };
  }

  /** the numbers, the cause and the research points (does not grant them); `out`: the run ended alive (how) */
  report(out?: string): RunReport {
    const p = this.p, g = this.g;
    const hours = Math.max(0, g.clock.hours - this.startH);
    const d: any = G.debt;
    const debtOn = !!d?.on;
    const paid = d?.paid ?? 0, owed = d?.s?.owed ?? 0, remaining = d?.remaining ?? 0;
    const paidRun = Math.max(0, paid - (this.paid0 ?? 0));
    const cause: Cause = out ? { key: 'other', text: out } : this.cause();
    const newCause = !out && stat('deathcause:' + cause.key) <= 0;
    const rooms = this.rooms.size, metres = this.metres;
    const lines: RpLine[] = [];
    const dd = Math.floor(hours / 24), hh = Math.floor(hours % 24), mm = Math.floor((hours % 1) * 60);
    lines.push({ key: 'days', label: 'TIME SURVIVED', short: 'SURVIVED', value: dd ? `${dd}d ${String(hh).padStart(2, '0')}h` : `${hh}h ${String(mm).padStart(2, '0')}m`, num: hours, rp: Math.min(30, Math.floor(hours / 12)) });
    if (debtOn) lines.push({ key: 'debt', label: 'DEBT PAID', short: 'DEBT PAID', value: `${fmt(paid)} / ${fmt(owed)}`, num: paid, rp: Math.min(25, Math.floor(paidRun / 1000)) });
    lines.push({ key: 'press', label: 'VALUABLES PRESSED', short: 'PRESSED', value: fmt(this.valuables), num: this.valuables, rp: Math.min(15, Math.floor(this.valuables / 3)) });
    lines.push({ key: 'rooms', label: 'ROOMS EXPLORED', short: 'ROOMS', value: fmt(rooms), num: rooms, rp: Math.min(15, Math.floor(rooms / 5)) });
    lines.push({ key: 'kills', label: 'CREATURES KILLED', short: 'KILLS', value: fmt(this.kills), num: this.kills, rp: Math.min(12, this.kills) });
    lines.push({ key: 'dist', label: 'DISTANCE', short: 'DISTANCE', value: metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${fmt(metres)} m`, num: metres, rp: Math.min(10, Math.floor(metres / 400)) });
    if (newCause) lines.push({ key: 'novel', label: 'NEW WAY TO DIE', short: 'NEW DEATH', value: 'logged', num: 1, rp: 2 });
    // the codex (src/game/codex.ts): entries first met this run, samples that reached the lab, samples lost on the body
    const log = runLog();
    const nm = (k: string) => String((species(k) as any)?.name ?? k);
    const discovered = log.discovered.map(nm);
    const lost = carriedSamples(p).length;
    if (discovered.length) lines.push({ key: 'specimens', label: 'NEW CODEX ENTRIES', short: 'ENTRIES', value: `${discovered.length} new`, num: discovered.length, rp: Math.min(20, discovered.length * 2) });
    if (log.banked || lost) lines.push({ key: 'samples', label: 'SAMPLES BANKED', short: 'SAMPLES', value: `${log.banked} banked · ${lost} lost`, num: log.banked, rp: Math.min(15, log.banked * 2) });
    if (out) lines.unshift({ key: 'out', label: 'MADE IT OUT', short: 'OUT', value: 'yes', num: 1, rp: 15 });
    const rp = Math.max(1, lines.reduce((s, l) => s + l.rp, 0));
    const deaths = stat('deaths');
    let h = 0; for (const c of p.name + this.startH) h = (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0;
    return {
      name: p.name || 'Unit', file: `${4000 + (h % 900)}-${'ABCDEFGHJK'[h % 10]}`, hours, cause, newCause, debtOn, owed, paid, remaining, cleared: !!d?.s?.cleared,
      valuables: this.valuables, scrip: this.scrip, rooms, kills: this.kills, metres, lines, rp, deaths, zone: g.zone?.name || p.zoneKey, discovered, lostSamples: lost,
    };
  }

  /** remember this way of dying (the "new way to die" bonus is paid once per cause) */
  commit(r: RunReport) { addStat('deathcause:' + r.cause.key); }
}
