// The long-term mind of a survivor.
//
// body.ts keeps the fast "moodles" (panic, stress, unhappiness, boredom,
// lucidity) that swing from minute to minute. This file holds the slower
// conditions those moodles feed when they stay high for hours or days, the
// state of medication and coping, and the read-outs the watch and the scanner
// show. Everything here is plain data stored on Body.mind, so it is saved and
// loaded with the body. The runtime side (panic attacks, flashbacks,
// hallucinations, coping actions, thoughts, screen effects) lives in
// mindSystem.ts.
//
// The model is meant to be believable and respectful: conditions build from
// sustained circumstances, ease with the things that help real people (sleep,
// food, daylight, company, routine, breathing, writing things down, time) and
// never involve self-harm.
import { clamp, clamp01 } from '../core/math';
import type { Body } from './body';

export interface MindState {
  /** chronic anxiety 0..1: built by days of high stress; raises baseline panic, shakes aim, invites panic attacks */
  anxiety: number;
  /** low mood / depression 0..1: built by days of unhappiness; slows actions, dulls joy and learning, disturbs sleep */
  depression: number;
  /** insomnia 0..1: anxious, caffeinated or dark nights make sleep shallow and broken */
  insomnia: number;
  /** trauma load 0..1: near-death, being grabbed, seeing a friend go down */
  trauma: number;
  /** loneliness 0..100: time without another voice */
  loneliness: number;
  /** trauma associations: species key (or 'downed') -> strength 0..1 */
  triggers: Record<string, number>;
  /** active panic attack: real seconds remaining (0 = none) */
  attack: number;
  attackLen: number;
  /** real seconds until another attack can start */
  attackCd: number;
  /** attacks this run */
  attacks: number;
  /** dissociation episode: real seconds remaining */
  dissoc: number;
  /** flashback intensity 0..1 (decays in real time) */
  flash: number;
  // ---- medication & substances (in-game hours unless noted)
  /** days into an antidepressant course (effect ramps over ~3 days) */
  ssriDays: number;
  /** hours since the last dose while a course was running */
  ssriOff: number;
  anxiolytic: number;
  /** builds with repeated anxiolytic use; weakens them and brings rebound anxiety */
  tolerance: number;
  caffeine: number;
  /** hours since the last caffeine */
  sinceCaffeine: number;
  /** alcohol taken recently (decays), turns into a hangover */
  alcohol: number;
  hangover: number;
  /** hours of post-sleeping-pill grogginess */
  groggy: number;
  // ---- routine
  sinceSocial: number;
  sinceExercise: number;
  hoursAwake: number;
  /** quality of the last sleep 0..1 */
  lastSleep: number;
  sinceJournal: number;
  sinceBreath: number;
  /** hours since a proper (cooked or hearty) meal */
  sinceMeal: number;
  /** near-death latch so one scare counts once */
  nearDeath: boolean;
}

export function newMind(): MindState {
  return {
    anxiety: 0, depression: 0, insomnia: 0, trauma: 0, loneliness: 8, triggers: {},
    attack: 0, attackLen: 0, attackCd: 90, attacks: 0, dissoc: 0, flash: 0,
    ssriDays: 0, ssriOff: 99, anxiolytic: 0, tolerance: 0, caffeine: 0, sinceCaffeine: 6, alcohol: 0, hangover: 0, groggy: 0,
    sinceSocial: 0, sinceExercise: 0, hoursAwake: 2, lastSleep: 0.6, sinceJournal: 99, sinceBreath: 99, sinceMeal: 2, nearDeath: false,
  };
}

/** old saves (or remote mirrors) may miss fields: fill them in */
export function ensureMind(b: Body): MindState {
  const d = newMind();
  const m = (b.mind || ((b as any).mind = d)) as MindState;
  for (const k of Object.keys(d) as (keyof MindState)[]) if ((m as any)[k] === undefined) (m as any)[k] = (d as any)[k];
  if (!m.triggers || typeof m.triggers !== 'object') m.triggers = {};
  return m;
}

// ---------------------------------------------------------------- derived values

/** how far an antidepressant course has kicked in (0..1). Nothing for the first day, full after ~3. */
export function ssriEffect(m: MindState): number {
  const on = clamp01((m.ssriDays - 0.8) / 2.2);
  return m.ssriOff < 24 ? on : on * clamp01(1 - (m.ssriOff - 24) / 48);
}

/** effective anxiolytic strength right now (tolerance weakens it) */
export function anxiolyticEffect(m: MindState): number { return m.anxiolytic > 0 ? clamp(1 - m.tolerance * 0.6, 0.25, 1) : 0; }

/** dissociation 0..1: lucidity loss plus trauma under stress */
export function dissociation(b: Body): number {
  const m = b.mind;
  return clamp01(Math.max((55 - b.lucidity) / 55, m.trauma > 0.4 && b.stress > 70 ? (m.trauma - 0.3) * (b.stress - 60) / 40 : 0, m.dissoc > 0 ? 0.7 : 0));
}

/** pressure toward hallucinating 0..1 (extremes only) */
export function halluPressure(b: Body): number {
  const m = b.mind;
  const sleepless = b.fatigue > 88 ? ((b.fatigue - 88) / 12) * (0.5 + m.insomnia) : 0;
  return clamp01(Math.max((32 - b.lucidity) / 32, sleepless, m.attack > 0 ? 0.25 : 0, m.dissoc > 0 ? 0.35 : 0, b.corruption > 60 ? (b.corruption - 60) / 60 : 0, m.hoursAwake > 40 ? (m.hoursAwake - 40) / 30 : 0));
}

/** smoothed target heart rate (BPM) from exertion, fear, temperature, fever, blood loss, drugs, sleep */
export function heartTarget(b: Body, exertion = 0): number {
  const m = b.mind;
  let bpm = 64 - (b.skill('fitness') - 5) * 1.5;
  bpm += exertion * 68;
  bpm += b.panic * 0.62;
  bpm += m.attack > 0 ? 42 : 0;
  bpm += m.anxiety * 8 + m.flash * 30;
  if (b.temp > 37.4) bpm += (b.temp - 37.4) * 14;
  if (b.temp < 35.5) bpm -= (35.5 - b.temp) * 6;
  bpm += b.fever() * 22;
  bpm += Math.max(0, 85 - b.blood) * 0.9;
  bpm += m.caffeine > 0 ? 9 : 0;
  bpm += b.adrenaline > 0 ? 30 : 0;
  bpm -= m.anxiolytic > 0 ? 6 : 0;
  bpm -= b.sedated > 0 ? 8 : 0;
  if (b.asleep) bpm -= 12;
  return clamp(bpm, 38, 196);
}

export type BreathState = 'CALM' | 'SLOW' | 'DEEP' | 'FAST' | 'GASP' | 'HYPER' | 'SHALLOW' | 'NONE';
/** what the breathing looks like right now (watch / scanner) */
export function breathState(b: Body, running: boolean, breathing: boolean): BreathState {
  const m = b.mind;
  if (b.dead) return 'NONE';
  if (breathing) return 'DEEP';
  if (m.attack > 0) return 'HYPER';
  if (b.asleep) return 'SLOW';
  if (b.endurance < 0.2) return 'GASP';
  if (running || b.endurance < 0.55) return 'FAST';
  if (b.panic > 55 || b.blood < 60) return 'SHALLOW';
  return 'CALM';
}
/** breaths per minute for the breathing state */
export function breathRate(s: BreathState): number {
  return ({ CALM: 14, SLOW: 10, DEEP: 6, FAST: 26, GASP: 38, HYPER: 44, SHALLOW: 24, NONE: 0 } as Record<BreathState, number>)[s];
}

export type MoodGlyph = 'ok' | 'meh' | 'sad' | 'low' | 'fear' | 'attack' | 'dissoc' | 'sleep' | 'lonely' | 'tense';
/** a single face for the watch: the most pressing state of mind */
export function moodGlyph(b: Body): MoodGlyph {
  const m = b.mind;
  if (b.asleep) return 'sleep';
  if (m.attack > 0) return 'attack';
  if (m.dissoc > 0 || b.lucidity < 35) return 'dissoc';
  if (b.panic > 50) return 'fear';
  if (m.depression > 0.45 || b.unhappy > 70) return 'low';
  if (m.loneliness > 70) return 'lonely';
  if (b.stress > 60 || m.anxiety > 0.5) return 'tense';
  if (b.unhappy > 40 || m.depression > 0.2) return 'sad';
  if (b.boredom > 60 || b.stress > 35) return 'meh';
  return 'ok';
}

export interface Condition { key: string; name: string; level: number; value: number; desc: string; tips: string[]; }

const COND_NAMES: Record<string, string[]> = {
  anxiety: ['', 'Uneasy', 'Anxious', 'Very Anxious', 'Overwhelmed'],
  depression: ['', 'Low Mood', 'Depressed', 'Deeply Depressed', 'Numb'],
  insomnia: ['', 'Restless Nights', 'Insomnia', 'Severe Insomnia', 'Sleepless'],
  trauma: ['', 'Shaken', 'Traumatised', 'Haunted', 'Reliving It'],
  loneliness: ['', 'Missing People', 'Lonely', 'Very Lonely', 'Isolated'],
  dissociation: ['', 'Detached', 'Dissociating', 'Unreal', 'Adrift'],
};
const COND_DESC: Record<string, string> = {
  anxiety: 'Days of stress. Raises baseline panic and shakes your aim. Sleep, company, routine and breathing help.',
  depression: 'Days of unhappiness. Everything is slower and duller. Daylight, good food, company, small wins and time.',
  insomnia: 'Shallow, broken sleep. Avoid caffeine late, sleep somewhere safe and lit enough, calm down first.',
  trauma: 'Things that nearly ended you come back. Reminders can trigger flashbacks. Fades with safety and time.',
  loneliness: 'Too long without another voice. Talk to people, keep a companion, hold on to familiar things.',
  dissociation: 'Feeling unreal and far away. Ground yourself: light, breathing, Bluecap, people.',
};

/** two or three words of what helps, for small screens */
const COND_TIPS: Record<string, string[]> = {
  anxiety: ['BREATHE', 'SLEEP', 'COMPANY'],
  depression: ['DAYLIGHT', 'HOT FOOD', 'PEOPLE'],
  insomnia: ['NO LATE', 'COFFEE', 'CALM BED'],
  trauma: ['SAFETY', 'WRITING', 'TIME'],
  loneliness: ['TALK', 'PETS', 'PHOTOS'],
  dissociation: ['LIGHT', 'BREATHE', 'BLUECAP'],
};

function lvl(v: number, th: number[]) { let l = 0; for (let i = 0; i < th.length; i++) if (v >= th[i]) l = i + 1; return l; }

/** current long-term conditions, most severe first (only the ones present) */
export function conditions(b: Body): Condition[] {
  const m = b.mind;
  const out: Condition[] = [];
  const add = (key: string, v: number, th: number[]) => { const l = lvl(v, th); if (l > 0) out.push({ key, name: COND_NAMES[key][l], level: l, value: v, desc: COND_DESC[key], tips: COND_TIPS[key] }); };
  add('anxiety', m.anxiety, [0.15, 0.35, 0.6, 0.85]);
  add('depression', m.depression, [0.15, 0.35, 0.6, 0.85]);
  add('insomnia', m.insomnia, [0.15, 0.35, 0.6, 0.85]);
  add('trauma', m.trauma, [0.1, 0.3, 0.55, 0.8]);
  add('loneliness', m.loneliness / 100, [0.35, 0.55, 0.75, 0.9]);
  add('dissociation', dissociation(b), [0.2, 0.4, 0.65, 0.85]);
  return out.sort((a, c) => c.level - a.level || c.value - a.value);
}

/** strongest trauma trigger (for read-outs) */
export function topTrigger(m: MindState): [string, number] | null {
  let best: [string, number] | null = null;
  for (const [k, v] of Object.entries(m.triggers)) if (v > 0.12 && (!best || v > best[1])) best = [k, v];
  return best;
}

/** medication / substance lines for read-outs */
export function medsLines(b: Body): string[] {
  const m = b.mind;
  const out: string[] = [];
  if (b.antidep > 0 || m.ssriDays > 0.05) {
    const e = ssriEffect(m);
    out.push(m.ssriOff > 24 && m.ssriDays > 0.5 ? 'SSRI MISSED DOSES' : e < 0.05 ? `SSRI DAY ${Math.floor(m.ssriDays) + 1} (NOT YET)` : `SSRI ${Math.round(e * 100)}%`);
  }
  if (m.anxiolytic > 0) out.push(`ANXIOLYTIC ${m.anxiolytic.toFixed(1)}H`);
  if (b.sedated > 0) out.push(`SEDATED ${b.sedated.toFixed(1)}H`);
  if (m.caffeine > 0) out.push(`CAFFEINE ${m.caffeine.toFixed(1)}H`);
  if (b.nicotine > 0 && b.has('smoker')) out.push(`NICOTINE ${b.nicotine.toFixed(1)}H`);
  if (m.hangover > 0) out.push('HANGOVER');
  if (m.groggy > 0) out.push('GROGGY');
  if (b.drunk > 10) out.push('INTOXICATED');
  return out;
}
