// What the BAILIFF reads off its debtor: the survivor's body and mind boiled
// down to 0..1 signals that shape the heartbeat trace, plus the status tags of
// the expanded view (everything the old moodle stack said, renamed into the
// band's billing language, with a plain-language line for each).
import { clamp01 } from '../../core/math';
import { ensureMind, conditions, medsLines, halluPressure, dissociation } from '../../survival/mind';
import { PART_NAMES } from '../../survival/body';
import type { Player } from '../../entities/player';

export interface Vitals {
  dead: boolean; downed: boolean; asleep: boolean;
  hunger: number; thirst: number; fatigue: number; pain: number; bleed: number;
  cold: number; heat: number; panic: number; attack: boolean; sick: number; fever: number;
  /** poor mental state: low lucidity, depression, anxiety, trauma, dissociation */
  mental: number; drunk: number; corrupt: number; exhaust: number; lonely: number; wet: number;
  injured: number; halluc: number; dissoc: number; breathing: boolean;
  /** overall alarm 0..1 (drives colour) */
  severity: number;
}

export function emptyVitals(): Vitals {
  return {
    dead: false, downed: false, asleep: false, hunger: 0, thirst: 0, fatigue: 0, pain: 0, bleed: 0, cold: 0, heat: 0, panic: 0, attack: false,
    sick: 0, fever: 0, mental: 0, drunk: 0, corrupt: 0, exhaust: 0, lonely: 0, wet: 0, injured: 0, halluc: 0, dissoc: 0, breathing: false, severity: 0,
  };
}

/** sample the body (call a few times a second, not every frame) */
export function readVitals(p: Player, v: Vitals, breathing: boolean): Vitals {
  const b = p.body;
  const m = ensureMind(b);
  v.dead = b.dead; v.downed = b.downed; v.asleep = b.asleep;
  v.hunger = clamp01((b.hunger - 12) / 80);
  v.thirst = clamp01((b.thirst - 10) / 78);
  v.fatigue = clamp01((b.fatigue - 50) / 48);
  v.pain = clamp01(b.pain() / 90);
  v.bleed = clamp01(b.bleedRate() / 1.4);
  v.cold = b.temp < 36.6 ? clamp01((36.6 - b.temp) / 5) : 0;
  v.heat = b.temp > 37.4 ? clamp01((b.temp - 37.4) / 3) : 0;
  v.panic = clamp01(b.panic / 100);
  v.attack = m.attack > 0;
  v.sick = clamp01((b.sickness - 15) / 75);
  v.fever = clamp01(b.fever() * 1.25);
  v.dissoc = dissociation(b);
  v.halluc = halluPressure(b);
  v.mental = clamp01(Math.max((70 - b.lucidity) / 60, m.depression, m.anxiety * 0.85, m.trauma * 0.7, v.dissoc, b.unhappy > 60 ? (b.unhappy - 60) / 50 : 0));
  v.drunk = clamp01((b.drunk - 8) / 60);
  v.corrupt = clamp01(b.corruption / 80);
  v.exhaust = clamp01((0.55 - b.endurance) / 0.5);
  v.lonely = clamp01((m.loneliness - 40) / 50);
  v.wet = clamp01((b.wetness - 20) / 70);
  v.injured = clamp01((100 - b.health) / 80);
  v.breathing = breathing;
  v.severity = clamp01(Math.max(
    v.bleed * 1.3, v.injured * 1.1, v.attack ? 0.9 : 0, v.thirst > 0.75 ? v.thirst : v.thirst * 0.6, v.hunger > 0.75 ? v.hunger * 0.9 : v.hunger * 0.5,
    v.cold * 0.9, v.heat * 0.8, v.fever, v.corrupt, v.panic * 0.7, v.pain * 0.7, b.downed ? 1 : 0,
  ));
  return v;
}

// ------------------------------------------------------------------ status tags (expanded view)
export interface Tag {
  key: string;
  /** what the band calls it */
  label: string;
  /** what it means, in plain words */
  plain: string;
  /** what to do */
  desc: string;
  level: number;
  glyph: string;
  kind: 'body' | 'mind' | 'med' | 'limb';
}

/** the band's billing names for each moodle */
const BAND_NAMES: Record<string, string> = {
  hunger: 'NUTRIENT ARREARS', thirst: 'HYDRATION DEFICIT', fatigue: 'REST DEBT', endurance: 'LUNG CREDIT SPENT',
  panic: 'FEAR EVENT', stress: 'TENSION ACCRUAL', unhappy: 'MORALE WRITE-DOWN', boredom: 'IDLE ASSET',
  pain: 'NOCICEPTION', bleeding: 'FLUID LOSS', injured: 'ASSET DAMAGE', sick: 'GUT REJECTION',
  fever: 'SEPTIC LIEN', cold: 'THERMAL DEFICIT', hot: 'THERMAL SURPLUS', wet: 'SATURATED',
  drunk: 'IMPAIRED', lucidity: 'REALITY DRIFT', corruption: 'DATA ROT', heavy: 'LOAD EXCESS',
  lonely: 'SOCIAL VOID', attack: 'CARDIAC ALARM', stuffed: 'OVERCONSUMPTION',
};
const COND_BAND: Record<string, string> = {
  anxiety: 'CHRONIC ALARM', depression: 'GREY PROTOCOL', insomnia: 'NO-SLEEP CLAUSE',
  trauma: 'RECURRING FILE', loneliness: 'ISOLATION TERM', dissociation: 'UNTETHERED',
};

export function statusTags(p: Player): Tag[] {
  const b = p.body;
  const out: Tag[] = [];
  let list: { key: string; name: string; level: number; good?: boolean; desc: string }[] = [];
  try { list = b.moodles(p.heavyLoad()); } catch { /* older body */ }
  for (const m of list) {
    if (m.good) continue;
    out.push({ key: m.key, label: BAND_NAMES[m.key] || m.key.toUpperCase(), plain: m.name, desc: m.desc, level: m.level, glyph: m.key, kind: 'body' });
  }
  try {
    for (const c of conditions(b)) out.push({ key: 'c_' + c.key, label: COND_BAND[c.key] || c.key.toUpperCase(), plain: c.name, desc: c.desc, level: c.level, glyph: c.key === 'loneliness' ? 'lonely' : c.key === 'dissociation' ? 'lucidity' : c.key === 'trauma' ? 'panic' : c.key === 'insomnia' ? 'fatigue' : c.key === 'depression' ? 'unhappy' : 'stress', kind: 'mind' });
  } catch { /* ignore */ }
  try {
    for (const part of b.severed || []) {
      // only the most proximal missing part of each limb
      const parent = part.startsWith('hand') ? 'farm' + part.slice(4) : part.startsWith('farm') ? 'uarm' + part.slice(4) : part.startsWith('foot') ? 'shin' + part.slice(4) : part.startsWith('shin') ? 'thigh' + part.slice(4) : '';
      if (parent && (b.severed as string[]).includes(parent)) continue;
      out.push({ key: 'l_' + part, label: 'ASSET REDUCED', plain: `${PART_NAMES[part]} is gone`, desc: 'Keep the stump clean and closed. Crutches, a hook or a prosthetic help.', level: 3, glyph: 'injured', kind: 'limb' });
    }
  } catch { /* ignore */ }
  try { for (const line of medsLines(b)) out.push({ key: 'm_' + line, label: line, plain: line.toLowerCase(), desc: 'In your blood right now.', level: 1, glyph: 'drunk', kind: 'med' }); } catch { /* ignore */ }
  // worst first, but keep body before mind before meds at the same level
  const rank = { body: 0, limb: 1, mind: 2, med: 3 } as const;
  out.sort((a, c) => c.level - a.level || rank[a.kind] - rank[c.kind]);
  return out;
}
