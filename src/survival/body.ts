import { BodyPart, BODY_PARTS } from '../items/item';
import { SkillKey, SKILLS, XP_PER_LEVEL } from './traits';
import { clamp, clamp01 } from '../core/math';
import { Rng, uid } from '../core/rng';
import { MindState, newMind, ssriEffect, anxiolyticEffect } from './mind';

export type InjuryType = 'scratch' | 'laceration' | 'deep' | 'bite' | 'burn' | 'fracture' | 'glass' | 'bullet' | 'bruise';

export interface Injury {
  id: number;
  type: InjuryType;
  part: BodyPart;
  sev: number;            // 0..1
  bleed: number;          // base bleed rate 0..1 (blood loss per hour = bleed * 12)
  heal: number;           // 0..1 healed
  healTime: number;       // game hours to heal fully under good conditions
  bandage: null | { clean: boolean; soak: number; sterile: boolean };
  disinfected: number;    // hours of protection remaining
  stitched: boolean;
  splinted: boolean;
  foreign: boolean;       // glass shard / bullet lodged
  infection: number;      // 0..1 wound infection
  corrupt: boolean;       // carries simulation corruption
  age: number;
}

export const INJURY_INFO: Record<InjuryType, { name: string; pain: number; bleed: number; heal: [number, number]; infect: number }> = {
  bruise: { name: 'Bruise', pain: 6, bleed: 0, heal: [4, 10], infect: 0 },
  scratch: { name: 'Scratch', pain: 6, bleed: 0.12, heal: [7, 15], infect: 0.02 },
  laceration: { name: 'Laceration', pain: 15, bleed: 0.4, heal: [10, 20], infect: 0.05 },
  deep: { name: 'Deep Wound', pain: 30, bleed: 0.9, heal: [15, 20], infect: 0.08 },
  bite: { name: 'Bite', pain: 25, bleed: 0.55, heal: [50, 80], infect: 0.12 },
  burn: { name: 'Burn', pain: 30, bleed: 0, heal: [50, 100], infect: 0.06 },
  fracture: { name: 'Fracture', pain: 40, bleed: 0, heal: [720, 1440], infect: 0 },
  glass: { name: 'Glass Shard', pain: 18, bleed: 0.3, heal: [10, 18], infect: 0.08 },
  bullet: { name: 'Bullet Wound', pain: 35, bleed: 0.8, heal: [40, 60], infect: 0.1 },
};

export const PART_NAMES: Record<BodyPart, string> = {
  head: 'Head', neck: 'Neck', torso_u: 'Upper Torso', torso_l: 'Lower Torso', groin: 'Groin',
  uarm_l: 'Left Upper Arm', uarm_r: 'Right Upper Arm', farm_l: 'Left Forearm', farm_r: 'Right Forearm',
  hand_l: 'Left Hand', hand_r: 'Right Hand', thigh_l: 'Left Thigh', thigh_r: 'Right Thigh',
  shin_l: 'Left Shin', shin_r: 'Right Shin', foot_l: 'Left Foot', foot_r: 'Right Foot',
};

export interface Env {
  ambient: number;        // °C
  insulation: number;     // 0..1 effective clothing insulation
  windExposed: boolean;
  raining: boolean;
  inWater: 'none' | 'shallow' | 'deep';
  floorWet: number;       // wetness gain per second from floor
  exertion: number;       // 0..1 (running/fighting)
  moving: boolean;
  running: boolean;
  resting: boolean;       // sitting
  asleep: boolean;
  bedQuality: number;     // 0..1
  nearFire: number;       // 0..1
  lightLevel: number;     // 0..1 at player
  darkness: boolean;
  nearTeam: number;       // count within 8m
  threat: number;         // 0..1 visible hostile threat this frame
  anomaly: number;        // 0..1 nearby anomaly strength
  corruptZone: number;    // 0..1 glitch exposure
  collapse: number;       // 0..1 simulation collapse
  smallRoom: boolean;
  openSpace: boolean;
  entertained: boolean;   // reading / music / games / conversation
  heavyLoad: number;      // 0..1+ over capacity fraction
  // ---- optional context gathered by the survival system for the mind
  zone?: string;          // zone key
  outdoor?: boolean;
  nearSeat?: boolean;     // a chair, sofa or bed within reach
  companion?: number;     // tamed creatures nearby
  social?: number;        // 0..1 recent conversation (chat, voice, voices on the radio)
  comfort?: number;       // comfort objects carried (plush, photo, charm)
  breathing?: boolean;    // doing the breathing exercise
}

export interface Moodle { key: string; name: string; level: number; good?: boolean; desc: string; }

const LEVEL_NAMES: Record<string, string[]> = {
  hunger: ['', 'Peckish', 'Hungry', 'Very Hungry', 'Starving'],
  thirst: ['', 'Slightly Thirsty', 'Thirsty', 'Parched', 'Dying of Thirst'],
  fatigue: ['', 'Drowsy', 'Tired', 'Very Tired', 'Ridiculously Tired'],
  endurance: ['', 'Moderate Exertion', 'High Exertion', 'Excessive Exertion', 'Exhausted'],
  panic: ['', 'Slight Panic', 'Panic', 'Strong Panic', 'Extreme Panic'],
  stress: ['', 'Anxious', 'Agitated', 'Nervous', 'Stressed'],
  unhappy: ['', 'Sad', 'Unhappy', 'Very Unhappy', 'Depressed'],
  boredom: ['', 'Uninterested', 'Bored', 'Very Bored', 'Extremely Bored'],
  pain: ['', 'Minor Pain', 'Pain', 'Severe Pain', 'Agony'],
  bleeding: ['', 'Bleeding', 'Heavy Bleeding', 'Severe Bleeding', 'Haemorrhaging'],
  injured: ['', 'Minor Injury', 'Injured', 'Severely Injured', 'Critically Injured'],
  sick: ['', 'Queasy', 'Nauseous', 'Sick', 'Fever'],
  fever: ['', 'Feverish', 'Fever', 'High Fever', 'Infected'],
  cold: ['', 'Chilly', 'Cold', 'Freezing', 'Hypothermic'],
  hot: ['', 'Warm', 'Hot', 'Overheated', 'Hyperthermic'],
  wet: ['', 'Damp', 'Wet', 'Soaking', 'Drenched'],
  drunk: ['', 'Tipsy', 'Drunk', 'Very Drunk', 'Wasted'],
  lucidity: ['', 'Disoriented', 'Dissociating', 'Unmoored', 'Unravelling'],
  corruption: ['', 'Static', 'Desyncing', 'Fragmenting', 'Deleting'],
  heavy: ['', 'Heavy Load', 'Very Heavy Load', 'Overloaded', 'Crushing Load'],
  stuffed: ['', 'Satiated', 'Full', 'Stuffed', 'Bloated'],
  lonely: ['', 'Missing People', 'Lonely', 'Very Lonely', 'Isolated'],
  attack: ['', '', '', '', 'Panic Attack'],
};

const DESC: Record<string, string> = {
  hunger: 'Eat something. Starving damages your health.',
  thirst: 'Drink water. Dehydration is deadly within days.',
  fatigue: 'Sleep. Tiredness slows actions and blurs vision.',
  endurance: 'Stop running and fighting to catch your breath.',
  panic: 'Hands shake. Aim and attacks suffer.',
  stress: 'Tension builds. Smoke, rest, find company.',
  unhappy: 'Good food, comfort and company help.',
  boredom: 'Read, play, talk, explore something new.',
  pain: 'Painkillers dull it. Treat the wounds.',
  bleeding: 'Bandage the wounds now.',
  injured: 'Treat wounds and rest.',
  sick: 'Food poisoning. Rest and drink clean water.',
  fever: 'An infected wound. Disinfect it, take antibiotics.',
  cold: 'Warm clothes, a fire, get dry.',
  hot: 'Remove layers, drink, find shade.',
  wet: 'Wet clothes chill you. Dry off by a fire.',
  drunk: 'Clumsy and slow.',
  lucidity: 'The simulation leaks in. Find light, people, Bluecap.',
  corruption: 'Your data is degrading. Find a cure before it completes.',
  heavy: 'Too much weight. You are slow and loud.',
  stuffed: 'Too full to eat more.',
  lonely: 'Talk to someone, keep a companion close, hold something familiar.',
  attack: 'It will pass. Breathe slowly: in four, hold four, out four.',
};

export function moodleLevel(v: number, th: number[]): number {
  let l = 0; for (let i = 0; i < th.length; i++) if (v >= th[i]) l = i + 1; return l;
}

/**
 * The whole simulated body of one survivor: 17 body parts with typed
 * injuries, blood, hunger/thirst/calories, fatigue, endurance, temperature,
 * wetness, mental state (panic, stress, unhappiness, boredom, lucidity),
 * sickness, wound infection and simulation corruption. Mirrors Project
 * Zomboid's systems, extended for the liminal setting.
 */
export class Body {
  parts = {} as Record<BodyPart, { injuries: Injury[] }>;
  hunger = 8; thirst = 8; fatigue = 12; endurance = 1;
  boredom = 10; unhappy = 5; stress = 8; panic = 0;
  lucidity = 100; corruption = 0; corruptInfected = false;
  sickness = 0; temp = 37; wetness = 0; drunk = 0; stuffed = 0;
  blood = 100; health = 100; calories = 1200; weight = 78;
  painkiller = 0; antibiotics = 0; sedated = 0; antidep = 0; adrenaline = 0; nicotine = 6;
  dead = false; downed = false; downedTime = 0;
  asleep = false; sleepHours = 0;
  traits = new Set<string>();
  perks = new Set<string>();
  skills = {} as Record<SkillKey, { level: number; xp: number }>;
  /** last computed moodle levels (for change detection) */
  private lastLevels: Record<string, number> = {};
  onMoodle?: (key: string, level: number, prev: number) => void;
  onXp?: (skill: SkillKey, level: number) => void;
  rng = new Rng(Math.random() * 1e9);
  hpLossRate = 0;   // for UI trend
  maxCarry = 12;
  /** long-term mental state (see mind.ts) */
  mind: MindState = newMind();
  /** set each frame by the survival system (Lucky Socks) */
  wearingSocks = true;
  /** every XP gain (for lifetime stats / unlocks) */
  onXpGain?: (skill: SkillKey, amount: number) => void;

  constructor() {
    for (const p of BODY_PARTS) this.parts[p] = { injuries: [] };
    for (const s of SKILLS) this.skills[s.key] = { level: 0, xp: 0 };
    this.skills.fitness.level = 5; this.skills.strength.level = 5;
  }

  has(t: string) { return this.traits.has(t); }

  // ---------------- derived values ----------------
  allInjuries(): Injury[] { const out: Injury[] = []; for (const p of BODY_PARTS) out.push(...this.parts[p].injuries); return out; }

  bleedRate(): number {
    let b = 0;
    for (const inj of this.allInjuries()) b += this.injuryBleed(inj);
    return b;
  }
  injuryBleed(inj: Injury): number {
    if (inj.heal > 0.8) return 0;
    let b = inj.bleed * (1 - inj.heal);
    if (inj.stitched) b *= 0.05;
    if (inj.bandage) b *= inj.bandage.soak > 0.95 ? 0.6 : 0.08;
    return b;
  }
  pain(): number {
    let p = 0;
    for (const inj of this.allInjuries()) {
      const info = INJURY_INFO[inj.type];
      let v = info.pain * (0.4 + inj.sev * 0.8) * (1 - inj.heal * 0.85);
      if (inj.splinted) v *= 0.5;
      if (inj.infection > 0.2) v += 15 * inj.infection;
      p += v;
    }
    p += this.sickness > 50 ? (this.sickness - 50) * 0.3 : 0;
    p += this.corruption > 30 ? (this.corruption - 30) * 0.2 : 0;
    // withdrawal headaches and hangovers (mind.ts)
    if (this.has('coffee_dependent') && this.mind.sinceCaffeine > 12) p += Math.min(22, (this.mind.sinceCaffeine - 12) * 3);
    if (this.mind.hangover > 0) p += 12;
    if (this.painkiller > 0) p -= 35;
    if (this.adrenaline > 0) p -= 25;
    return clamp(p, 0, 100);
  }
  partDamage(part: BodyPart): number {
    let d = 0;
    for (const inj of this.parts[part].injuries) d += (INJURY_INFO[inj.type].pain + 10) * (0.5 + inj.sev) * (1 - inj.heal);
    return clamp(d, 0, 100);
  }
  legPenalty(): number {
    let p = 0;
    for (const part of ['thigh_l', 'thigh_r', 'shin_l', 'shin_r', 'foot_l', 'foot_r'] as BodyPart[]) {
      for (const inj of this.parts[part].injuries) {
        let v = (inj.type === 'fracture' ? 0.55 : inj.type === 'deep' || inj.type === 'bite' ? 0.22 : inj.type === 'glass' && part.startsWith('foot') ? 0.3 : 0.08) * (1 - inj.heal);
        if (inj.splinted) v *= 0.5;
        p += v;
      }
    }
    return clamp(p, 0, 0.8);
  }
  armPenalty(): number {
    let p = 0;
    for (const part of ['uarm_l', 'uarm_r', 'farm_l', 'farm_r', 'hand_l', 'hand_r'] as BodyPart[]) {
      for (const inj of this.parts[part].injuries) p += (inj.type === 'fracture' ? 0.45 : inj.type === 'deep' ? 0.15 : 0.05) * (1 - inj.heal);
    }
    return clamp(p, 0, 0.8);
  }

  // ---------------- skills ----------------
  skill(k: SkillKey) { return this.skills[k]?.level ?? 0; }
  addXp(k: SkillKey, amount: number) {
    const s = this.skills[k]; if (!s || s.level >= 10) return;
    this.onXpGain?.(k, amount);
    let mul = 1;
    if (this.has('fast_learner')) mul *= 1.3;
    if (this.has('slow_learner')) mul *= 0.7;
    if (this.perks.has('learner')) mul *= 1.2;
    if (this.has('gym_rat') && (k === 'fitness' || k === 'sprinting')) mul *= 2;
    if (this.has('couch_potato') && k === 'fitness') mul *= 0.5;
    // a low mood makes everything harder to take in
    mul *= 1 - clamp01(this.mind.depression) * 0.45;
    if (SKILLS.find((x) => x.key === k)?.passive) mul *= 0.25;
    s.xp += amount * mul;
    while (s.level < 10 && s.xp >= XP_PER_LEVEL[s.level]) {
      s.xp -= XP_PER_LEVEL[s.level];
      s.level++;
      this.onXp?.(k, s.level);
    }
  }

  // ---------------- injuries ----------------
  addInjury(part: BodyPart, type: InjuryType, sev: number, opts: { corruptChance?: number; dirty?: boolean } = {}): Injury {
    const info = INJURY_INFO[type];
    if (this.has('thin_skinned')) sev = Math.min(1, sev * 1.25);
    // Lucky Socks: as long as they are on, fate pulls its punches
    if (this.has('lucky_socks') && this.wearingSocks && type !== 'fracture') {
      sev *= 0.78;
      if ((type === 'scratch' || type === 'laceration' || type === 'bite') && this.rng.chance(0.2)) type = 'bruise';
    }
    const inj: Injury = {
      id: uid(), type, part, sev: clamp01(sev), bleed: info.bleed * (0.6 + sev * 0.8),
      heal: 0, healTime: info.heal[0] + (info.heal[1] - info.heal[0]) * this.rng.next(),
      bandage: null, disinfected: 0, stitched: false, splinted: false,
      foreign: type === 'glass' || (type === 'bullet' && this.rng.chance(0.6)),
      infection: opts.dirty && this.rng.chance(info.infect * 2) ? 0.05 : 0,
      corrupt: !!opts.corruptChance && this.rng.chance(opts.corruptChance * (this.has('resilient') ? 0.7 : 1)),
      age: 0,
    };
    // stacking a new injury of same type on same part worsens it instead
    const same = this.parts[part].injuries.find((i) => i.type === type && i.heal < 0.5);
    if (same && type !== 'fracture') {
      same.sev = clamp01(same.sev + sev * 0.5);
      same.bleed = Math.max(same.bleed, inj.bleed);
      same.heal = Math.max(0, same.heal - 0.3);
      if (inj.corrupt) same.corrupt = true;
      if (same.corrupt) this.corruptInfected = true;
      return same;
    }
    this.parts[part].injuries.push(inj);
    if (inj.corrupt) this.corruptInfected = true;
    let scare = (10 + sev * 20) * (this.perks.has('steady') ? 0.45 : 1) * (this.has('hypochondriac') ? 2 : 1) * (this.has('dramatic') ? 1.5 : 1);
    if (this.mind.anxiolytic > 0) scare *= 0.5;
    this.panic = Math.min(100, this.panic + scare);
    this.stress = Math.min(100, this.stress + 5 * (this.has('hypochondriac') ? 2 : 1));
    return inj;
  }

  /** remove fully healed injuries */
  private cleanup() {
    for (const p of BODY_PARTS) this.parts[p].injuries = this.parts[p].injuries.filter((i) => i.heal < 1);
  }

  // ---------------- consumption ----------------
  eat(f: { hunger: number; thirst?: number; calories: number; unhappy?: number; boredom?: number; stress?: number; poison?: number; alcohol?: number; lucidity?: number; ingredient?: string }, fraction: number, quality: { rotten?: boolean; stale?: boolean; raw?: boolean; burnt?: boolean; cooked?: boolean }) {
    const k = fraction;
    this.hunger = clamp(this.hunger - f.hunger * k, 0, 100);
    if (f.thirst) this.thirst = clamp(this.thirst - f.thirst * k, 0, 100);
    this.calories += f.calories * k;
    this.stuffed = clamp(this.stuffed + Math.max(0, f.hunger * k - this.hunger * 0.2) * 0.6, 0, 100);
    let unhappy = (f.unhappy ?? 0) * k;
    const sweet = f.ingredient === 'sweet';
    if (this.has('snack_goblin') && sweet && unhappy < 0) unhappy *= 2;
    if (quality.stale) unhappy += 4 * k;
    if (quality.rotten) unhappy += 12 * k;
    if (quality.burnt) unhappy += 6 * k;
    if (quality.cooked) unhappy -= (this.perks.has('foodie') ? 9 : 4) * k;
    // low mood dulls the joy of food (but not the comfort of a proper meal)
    if (unhappy < 0) unhappy *= 1 - this.mind.depression * 0.45;
    this.unhappy = clamp(this.unhappy + unhappy, 0, 100);
    if (quality.cooked || f.calories * k >= 350) this.mind.sinceMeal = 0;
    if (f.boredom) this.boredom = clamp(this.boredom + f.boredom * k * (this.has('snack_goblin') && sweet ? 2 : 1), 0, 100);
    if (f.stress) this.stress = clamp(this.stress + f.stress * k, 0, 100);
    if (f.lucidity) this.lucidity = clamp(this.lucidity + f.lucidity * k, 0, 100);
    if (f.alcohol) this.drunk = clamp(this.drunk + f.alcohol * k, 0, 100);
    let poison = (f.poison ?? 0) * 100 * k;
    if (quality.rotten) poison += 35 * k;
    if (quality.raw) poison += 25 * k;
    if (this.has('iron_gut')) poison *= 0.4;
    if (this.has('weak_stomach')) poison *= 1.6;
    if (poison > 0 && this.rng.chance(Math.min(1, poison / 30))) this.sickness = clamp(this.sickness + poison, 0, 100);
  }

  drink(fluid: string, litres: number) {
    const thirstPerL = 48;
    switch (fluid) {
      case 'water': this.thirst = clamp(this.thirst - litres * thirstPerL, 0, 100); break;
      case 'tainted':
        this.thirst = clamp(this.thirst - litres * thirstPerL, 0, 100);
        if (this.rng.chance(this.has('iron_gut') ? 0.25 : 0.7)) this.sickness = clamp(this.sickness + litres * 70, 0, 100);
        break;
      case 'almond':
        this.thirst = clamp(this.thirst - litres * thirstPerL * 1.1, 0, 100);
        this.lucidity = clamp(this.lucidity + litres * 60, 0, 100);
        this.unhappy = clamp(this.unhappy - litres * 20, 0, 100);
        this.stress = clamp(this.stress - litres * 20, 0, 100);
        this.calories += litres * 200;
        break;
      case 'soda': case 'juice':
        this.thirst = clamp(this.thirst - litres * thirstPerL * 0.9, 0, 100);
        this.calories += litres * 420; this.unhappy = clamp(this.unhappy - litres * 15, 0, 100);
        break;
      case 'milk': this.thirst = clamp(this.thirst - litres * thirstPerL * 0.7, 0, 100); this.calories += litres * 600; this.hunger = clamp(this.hunger - litres * 15, 0, 100); break;
      case 'alcohol': this.drunk = clamp(this.drunk + litres * 160, 0, 100); this.thirst = clamp(this.thirst - litres * 10, 0, 100); this.stress = clamp(this.stress - litres * 60, 0, 100); break;
      case 'gasoline': case 'bleach': case 'coolant':
        this.sickness = clamp(this.sickness + litres * 300, 0, 100); this.health -= litres * 80; break;
      case 'static':
        this.corruption = clamp(this.corruption + litres * 40, 0, 100); this.lucidity = clamp(this.lucidity - 30, 0, 100); break;
      default: this.thirst = clamp(this.thirst - litres * thirstPerL * 0.8, 0, 100);
    }
  }

  // ---------------- simulation step ----------------
  /**
   * dh: in-game hours elapsed; dt: real seconds elapsed (for endurance & panic,
   * which run on real time like in Project Zomboid).
   */
  update(dh: number, dt: number, env: Env) {
    if (this.dead) return;
    const T = (t: string) => this.has(t);
    // ---- metabolism ----
    const exert = env.exertion;
    let hungerRate = (env.asleep ? 1.7 : 3.4) * (1 + exert * 0.6);
    if (T('light_eater')) hungerRate *= 0.75;
    if (T('hearty_appetite')) hungerRate *= 1.3;
    if (T('snack_goblin')) hungerRate *= 1.1;
    if (this.temp < 36) hungerRate *= 1.25;
    this.hunger = clamp(this.hunger + hungerRate * dh, 0, 100);
    let thirstRate = (env.asleep ? 2.4 : 4.6) * (1 + exert * 0.8) * (this.temp > 37.6 ? 1.6 : 1) * (this.drunk > 20 ? 1.3 : 1);
    this.thirst = clamp(this.thirst + thirstRate * dh, 0, 100);
    this.stuffed = clamp(this.stuffed - 14 * dh, 0, 100);
    this.calories -= (100 + exert * 140 + (this.temp < 36.3 ? 60 : 0)) * dh;
    // weight drifts with the calorie store (7700 kcal per kg)
    if (this.calories > 3500) { this.weight += (this.calories - 3500) / 7700; this.calories = 3500; }
    if (this.calories < -2000) { this.weight -= (-2000 - this.calories) / 7700; this.calories = -2000; }

    // ---- sleep / fatigue ----
    const mind = this.mind;
    const nightOwl = T('night_owl') || this.perks.has('nightowl');
    if (env.asleep) {
      const bed = this.perks.has('sleeper') ? Math.max(env.bedQuality, 0.65) : env.bedQuality;
      let rec = (6 + bed * 9) * (T('insomniac') ? 0.7 : 1) * (nightOwl ? 1.2 : 1) * (T('heavy_sleeper') ? 1.25 : 1);
      // the mind gets into bed too: broken sleep, caffeine, oversleeping with a low mood
      rec *= 1 - mind.insomnia * 0.5;
      if (mind.caffeine > 0) rec *= this.perks.has('barista') ? 0.9 : 0.7;
      rec *= 1 - mind.depression * 0.3;
      this.fatigue = clamp(this.fatigue - rec * dh, 0, 100);
      this.sleepHours += dh;
      this.unhappy = clamp(this.unhappy - 1.5 * dh * bed, 0, 100);
      this.stress = clamp(this.stress - 3 * dh * (1 - mind.insomnia * 0.4), 0, 100);
      this.lucidity = clamp(this.lucidity + (T('lucid_dreamer') ? 4 : 1.5) * dh, 0, 100);
    } else {
      let fr = (3.6 + exert * 3) * (nightOwl ? 0.8 : 1) * (this.sedated > 0 ? 3 : 1);
      if (this.drunk > 30) fr *= 1.4;
      if (mind.caffeine > 0) fr *= 0.55;
      if (mind.anxiolytic > 0) fr *= 1.35;            // calm, but drowsy
      fr *= 1 + mind.depression * 0.3 + mind.insomnia * 0.2;
      this.fatigue = clamp(this.fatigue + fr * dh, 0, 100);
      if (mind.groggy > 0) this.fatigue = Math.max(this.fatigue, 22);
      this.sleepHours = 0;
    }

    // ---- endurance (real time) ----
    const fit = this.skill('fitness');
    if (env.running) {
      this.endurance -= dt * (0.024 - fit * 0.0012) * (1 + env.heavyLoad * 0.8) * (T('gym_rat') ? 0.85 : 1) * (T('couch_potato') ? 1.25 : 1) * (mind.hangover > 0 ? 1.2 : 1);
      // running trains the legs and lungs (fitness is passive and slow)
      this.addXp('sprinting', dt * 0.25);
      this.addXp('fitness', dt * 0.15);
    } else {
      let regen = env.resting || env.asleep ? 0.06 : env.moving ? 0.022 : 0.04;
      if (this.fatigue > 60) regen *= 0.6;
      if (this.hunger > 45) regen *= 0.7;
      if (this.temp < 35.5) regen *= 0.6;
      if (env.heavyLoad > 0) regen *= Math.max(0.2, 1 - env.heavyLoad);
      this.endurance += dt * regen * (1 + fit * 0.04);
    }
    this.endurance = clamp01(this.endurance);

    // ---- temperature & wetness ----
    if (env.inWater === 'deep') this.wetness = 100;
    else if (env.inWater === 'shallow') this.wetness = Math.max(this.wetness, Math.min(60, this.wetness + 30 * dt));
    if (env.raining && env.windExposed) this.wetness = clamp(this.wetness + (T('outdoorsman') ? 12 : 22) * dh, 0, 100);
    this.wetness = clamp(this.wetness + env.floorWet * dt * 100, 0, 100);
    const dryRate = 10 + env.nearFire * 40 + Math.max(0, env.ambient - 20) * 1.5;
    if (env.inWater === 'none') this.wetness = clamp(this.wetness - dryRate * dh, 0, 100);
    const wetPenalty = this.wetness / 100;
    let comfort = env.ambient + env.insulation * (14 * (1 - wetPenalty * 0.6)) + exert * 9 + env.nearFire * 14 - wetPenalty * 7 - (env.windExposed ? 3 : 0);
    if (env.asleep) comfort += env.bedQuality * 4;
    if (T('outdoorsman')) comfort += 2;
    let tTarget = 37;
    if (comfort < 17) tTarget = 37 - (17 - comfort) * 0.55;
    else if (comfort > 31) tTarget = 37 + (comfort - 31) * 0.35;
    if (this.fever() > 0) tTarget += this.fever() * 2.2;
    tTarget = clamp(tTarget, 24, 42);
    // body temperature converges toward the target, at most ~1.2 °C per in-game hour
    const tRate = tTarget < this.temp ? 1.0 : 1.4;
    this.temp += clamp((tTarget - this.temp) * Math.min(1, dh * 0.8), -tRate * dh, tRate * dh);

    // ---- injuries: bleeding, healing, infection ----
    let bleedTotal = 0;
    const healMul = (T('fast_healer') ? 1.5 : 1) * (T('slow_healer') ? 0.6 : 1) * (env.asleep ? 1.6 : 1) * (this.hunger > 45 ? 0.6 : 1) * (this.thirst > 45 ? 0.6 : 1);
    for (const inj of this.allInjuries()) {
      inj.age += dh;
      const b = this.injuryBleed(inj);
      bleedTotal += b;
      // scratches & minor wounds clot on their own
      if (!inj.stitched && (inj.type === 'scratch' || inj.type === 'bruise') && inj.age > 1.2) inj.bleed *= Math.pow(0.4, dh);
      if (inj.type === 'laceration' && inj.age > 6) inj.bleed *= Math.pow(0.85, dh);
      if (inj.bandage) {
        inj.bandage.soak = clamp01(inj.bandage.soak + (b * 1.6 + 0.01) * dh);
        if (inj.bandage.soak > 0.6) inj.bandage.clean = false;
      }
      // infection chance per hour
      const info = INJURY_INFO[inj.type];
      if (inj.disinfected > 0) { inj.disinfected -= dh; inj.infection = Math.max(0, inj.infection - 0.3 * dh); }
      else if (inj.heal < 0.9) {
        let p = info.infect * dh * 0.25;
        if (!inj.bandage) p *= 1.6; else if (!inj.bandage.clean) p *= 3;
        if (inj.foreign) p *= 2;
        if (T('prone_illness')) p *= 1.5;
        if (inj.infection === 0 && this.rng.chance(p)) inj.infection = 0.05;
      }
      if (inj.infection > 0) {
        if (this.antibiotics > 0) inj.infection = Math.max(0, inj.infection - 0.25 * dh);
        else inj.infection = clamp01(inj.infection + 0.02 * dh);
      }
      // healing
      let canHeal = !inj.foreign && inj.infection < 0.3;
      if (inj.type === 'deep' && !inj.stitched && inj.heal > 0.55) canHeal = false;
      if (inj.type === 'fracture' && !inj.splinted) { if (inj.heal > 0.3) canHeal = false; }
      if (canHeal) {
        let rate = healMul / inj.healTime;
        if (inj.type === 'fracture' && inj.splinted) rate *= 2.2;
        if (inj.bandage?.clean) rate *= 1.2;
        inj.heal = clamp01(inj.heal + rate * dh);
      }
    }
    this.cleanup();
    this.blood = clamp(this.blood - bleedTotal * 12 * dh, 0, 100);
    if (bleedTotal < 0.01 && this.hunger < 60 && this.thirst < 60) this.blood = clamp(this.blood + 1.6 * dh, 0, 100);

    // ---- drugs ----
    this.painkiller = Math.max(0, this.painkiller - dh);
    this.antibiotics = Math.max(0, this.antibiotics - dh);
    this.sedated = Math.max(0, this.sedated - dh);
    this.antidep = Math.max(0, this.antidep - dh);
    this.adrenaline = Math.max(0, this.adrenaline - dh);
    this.drunk = Math.max(0, this.drunk - 8 * dh);
    if (T('smoker')) {
      this.nicotine = Math.max(0, this.nicotine - dh);
      if (this.nicotine <= 0) { this.stress = clamp(this.stress + 2.5 * dh, 0, 100); this.unhappy = clamp(this.unhappy + 0.8 * dh, 0, 100); }
    }

    // ---- sickness ----
    if (this.sickness > 0) {
      this.sickness = clamp(this.sickness - (env.asleep || env.resting ? 4 : 2.5) * dh, 0, 100);
      if (this.sickness > 50) this.thirst = clamp(this.thirst + 2 * dh, 0, 100);
    }

    // ---- corruption ----
    if (this.corruptInfected) this.corruption = clamp(this.corruption + 1.35 * dh * (this.has('resilient') ? 0.7 : 1), 0, 100);
    if (env.corruptZone > 0) this.corruption = clamp(this.corruption + env.corruptZone * 2 * dh, 0, 100);
    if (this.corruption > 0 && !this.corruptInfected && env.corruptZone === 0) this.corruption = Math.max(0, this.corruption - 0.5 * dh);

    // ---- mind (real-time panic) ----
    const ssri = ssriEffect(mind), calm = anxiolyticEffect(mind);
    let panicGain = env.threat * 55 * dt;
    if (env.darkness && T('nyctophobic')) panicGain += 6 * dt;
    if (env.smallRoom && T('claustrophobic')) panicGain += 5 * dt;
    if (env.openSpace && T('agoraphobic')) panicGain += 5 * dt;
    if (T('brave')) panicGain *= 0.5;
    if (T('cowardly')) panicGain *= 1.6;
    if (T('dramatic')) panicGain *= 2;
    if (this.perks.has('exterminator')) panicGain *= 0.7;
    if (env.nearTeam > 0) panicGain *= 0.7;
    if ((env.companion ?? 0) > 0) panicGain *= T('cat_person') || T('dog_person') ? 0.7 : 0.85;
    if ((env.comfort ?? 0) > 0) panicGain *= 0.88;
    if (this.sedated > 0) panicGain *= 0.4;
    panicGain *= (1 + mind.anxiety * 0.6) * (1 - calm * 0.65) * (mind.caffeine > 0 && !this.perks.has('barista') ? 1.15 : 1);
    let panicDecay = (env.threat > 0.05 ? 1.5 : 7) * (T('dramatic') ? 2 : 1) * (env.breathing ? 2.5 : 1);
    this.panic = clamp(this.panic + panicGain - panicDecay * dt, 0, 100);
    // chronic anxiety keeps a floor of unease under everything
    const floor = mind.anxiety * (T('brave') ? 12 : 24) * (1 - calm * 0.7) * (env.breathing ? 0.4 : 1);
    if (this.panic < floor) this.panic = Math.min(floor, this.panic + 4 * dt);
    // stress, unhappiness, boredom (game time)
    const lonely = mind.loneliness / 100;
    const stressUp = this.panic / 22 + this.pain() / 25 + (this.hunger > 45 ? 1 : 0) + (this.corruption > 25 ? 2 : 0) + mind.anxiety * 1.2 + (lonely > 0.7 ? 0.5 : 0) + (mind.hangover > 0 ? 0.6 : 0) + (mind.caffeine > 0 && !this.perks.has('barista') ? 0.4 : 0);
    let stressDown = 3.2 * (T('worrier') ? 0.7 : 1) * (this.perks.has('therapist') ? 1.25 : 1) + calm * 2 + (env.resting && T('couch_potato') ? 6 : 0);
    this.stress = clamp(this.stress + (stressUp * (T('unbothered') ? 0.7 : 1) - stressDown) * dh, 0, 100);
    const enjoy = 1 - mind.depression * 0.5;
    if (env.entertained) this.boredom = clamp(this.boredom - 12 * enjoy * dh, 0, 100);
    else if (env.resting && T('couch_potato')) this.boredom = clamp(this.boredom - 6 * dh, 0, 100);
    else if ((env.zone === 'mall' || env.zone === 'market') && T('mall_rat')) this.boredom = clamp(this.boredom - 4 * dh, 0, 100);
    else this.boredom = clamp(this.boredom + (env.moving ? 1.5 * (this.perks.has('explorer') ? 0.4 : 1) : 3.5) * dh * (env.nearTeam > 0 ? 0.5 : 1), 0, 100);
    let sad = (this.boredom > 50 ? (this.boredom - 50) / 25 : 0) + (this.stress > 60 ? 0.6 : 0)
      + (env.nearTeam > 0 ? -1.4 : 0.1) + lonely * 1.3 + mind.depression * 0.9 + (mind.hangover > 0 ? 0.5 : 0) - ssri * 2.5;
    if (sad > 0) sad *= (T('unbothered') ? 0.7 : 1) * (T('melancholic') ? 1.3 : 1);
    else sad *= T('melancholic') ? 0.6 : 1;
    if ((env.zone === 'mall' || env.zone === 'market') && T('mall_rat')) sad -= 0.6;
    if (env.lightLevel > 0.6) sad -= env.outdoor ? (this.perks.has('outdoors') ? 0.8 : 0.35) : 0.1;  // bright light, daylight above all, helps
    if (env.resting && T('couch_potato')) sad -= 1.2;
    this.unhappy = clamp(this.unhappy + sad * dh, 0, 100);
    // lucidity
    let luc = -0.4;
    if (env.darkness) luc -= T('nyctophobic') ? 5 : 2.5;
    if (env.lightLevel > 0.5) luc += 0.6;
    luc -= env.anomaly * 6 * (this.perks.has('investigator') ? 0.5 : 1) + env.corruptZone * 8 + env.collapse * 2.5;
    if (env.nearTeam > 0) luc += 2.5 + env.nearTeam * 0.5;
    else if (lonely > 0.5) luc -= (lonely - 0.5) * (T('lonely') ? 3 : 1.6);
    if (mind.trauma > 0.4 && this.stress > 70) luc -= (mind.trauma - 0.3) * 2;   // dissociating under pressure
    if (luc < 0) luc *= (this.perks.has('seams') ? 0.7 : 1) * (this.perks.has('deja_vu') ? 0.55 : 1) * (T('been_here_before') ? 0.75 : 1);
    if (env.asleep) luc = Math.max(luc, 1);
    this.lucidity = clamp(this.lucidity + luc * dh, 0, 100);

    // ---- health pool ----
    let dmg = 0;
    if (this.hunger >= 85) dmg += 1.6;
    if (this.thirst >= 90) dmg += 4;
    if (this.temp < 30) dmg += 6; else if (this.temp < 33) dmg += 1.5;
    if (this.temp > 41) dmg += 6; else if (this.temp > 40) dmg += 1.5;
    if (this.sickness > 80) dmg += 2.5;
    if (this.corruption > 85) dmg += 6;
    for (const inj of this.allInjuries()) if (inj.infection > 0.6) dmg += 1.5 * inj.infection;
    if (this.blood < 60) dmg += (60 - this.blood) * 0.35;
    let regen = 0;
    if (this.hunger < 45 && this.thirst < 45 && bleedTotal < 0.05 && this.sickness < 40 && this.temp > 35.5 && this.temp < 38.5) regen = env.asleep ? 4 : 2;
    const before = this.health;
    this.health = clamp(this.health + (regen - dmg) * dh, 0, this.maxHealth());
    this.hpLossRate = (before - this.health) / Math.max(dh, 1e-6);
    if (this.health <= 0 || this.blood <= 5) this.health = 0;
    // moodle change notifications
    this.checkMoodles();
  }

  /** health ceiling from current wounds (like PZ's overall health) */
  maxHealth(): number {
    let cap = 100;
    for (const p of BODY_PARTS) cap -= this.partDamage(p) * (p === 'head' || p === 'neck' || p.startsWith('torso') ? 0.35 : 0.18);
    cap -= (100 - this.blood) * 0.6;
    return clamp(cap, 0, 100);
  }

  fever(): number { let f = 0; for (const inj of this.allInjuries()) f = Math.max(f, inj.infection); return f; }

  carryCapacity(): number {
    let c = 6 + this.skill('strength') * 1.3;
    if (this.has('strong')) c += 2; if (this.has('weak')) c -= 2;
    if (this.has('pocket_hoarder')) c += 2;
    return c;
  }

  // ---------------- moodles ----------------
  moodles(heavy = 0): Moodle[] {
    const out: Moodle[] = [];
    const add = (key: string, level: number, good = false) => { if (level > 0) out.push({ key, name: LEVEL_NAMES[key]?.[level] ?? key, level, good, desc: DESC[key] || '' }); };
    add('hunger', moodleLevel(this.hunger, [15, 25, 45, 70]));
    add('thirst', moodleLevel(this.thirst, [13, 25, 70, 85]));
    add('fatigue', moodleLevel(this.fatigue, [60, 70, 80, 90]));
    add('endurance', moodleLevel(100 - this.endurance * 100, [25, 50, 75, 90]));
    add('panic', moodleLevel(this.panic, [25, 50, 75, 90]));
    add('stress', moodleLevel(this.stress, [25, 50, 75, 90]));
    add('unhappy', moodleLevel(this.unhappy, [20, 45, 60, 80]));
    add('boredom', moodleLevel(this.boredom, [25, 50, 75, 90]));
    add('pain', moodleLevel(this.pain(), [10, 25, 50, 75]));
    const br = this.bleedRate();
    add('bleeding', br > 0.02 ? moodleLevel(br, [0.02, 0.35, 0.8, 1.4]) : 0);
    add('injured', moodleLevel(100 - this.health, [10, 25, 50, 75]));
    add('sick', moodleLevel(this.sickness, [25, 50, 75, 90]));
    add('fever', moodleLevel(this.fever() * 100, [10, 30, 55, 80]));
    add('cold', this.temp < 36.5 ? moodleLevel(37 - this.temp, [0.5, 2, 7, 12]) : 0);
    add('hot', this.temp > 37.5 ? moodleLevel(this.temp - 37, [0.5, 2, 3, 4]) : 0);
    add('wet', moodleLevel(this.wetness, [15, 40, 70, 90]));
    add('drunk', moodleLevel(this.drunk, [10, 30, 50, 70]));
    add('lucidity', moodleLevel(100 - this.lucidity, [30, 50, 70, 88]));
    add('corruption', moodleLevel(this.corruption, [1, 25, 55, 85]));
    add('heavy', heavy > 0 ? moodleLevel(heavy * 100, [1, 25, 50, 75]) : 0);
    add('stuffed', moodleLevel(this.stuffed, [20, 40, 60, 80]), true);
    add('lonely', moodleLevel(this.mind.loneliness, [35, 55, 75, 90]));
    add('attack', this.mind.attack > 0 ? 4 : 0);
    return out;
  }

  private checkMoodles() {
    for (const m of this.moodles()) {
      const prev = this.lastLevels[m.key] ?? 0;
      if (m.level !== prev) { this.lastLevels[m.key] = m.level; this.onMoodle?.(m.key, m.level, prev); }
    }
    for (const k of Object.keys(this.lastLevels)) {
      if (this.lastLevels[k] > 0 && !this.moodles().some((m) => m.key === k)) { const prev = this.lastLevels[k]; this.lastLevels[k] = 0; this.onMoodle?.(k, 0, prev); }
    }
  }

  // ---------------- modifiers consumed by the controller / actions / combat ----------------
  mods(heavyLoad: number) {
    const fat = clamp01((this.fatigue - 50) / 50);
    const legs = this.legPenalty();
    const arms = this.armPenalty();
    const pain = this.pain() / 100;
    const panic = this.panic / 100;
    const drunk = this.drunk / 100;
    const cold = this.temp < 36.5 ? clamp01((36.5 - this.temp) / 8) : 0;
    let move = 1 - legs * 0.75 - fat * 0.15 - Math.max(0, heavyLoad) * 0.45 - cold * 0.25 - (this.endurance < 0.2 ? 0.2 : 0) - drunk * 0.2;
    if (this.wetness > 70) move -= 0.05;
    const mind = this.mind;
    const attackFit = mind.attack > 0 ? 1 : 0;
    const action = 1 + fat * 0.5 + arms * 0.8 + pain * 0.4 + panic * 0.3 + drunk * 0.5 + cold * 0.5 + (this.unhappy > 60 ? 0.25 : 0) + (this.boredom > 75 ? 0.15 : 0)
      + mind.depression * 0.35 + attackFit * 0.3 + (mind.groggy > 0 ? 0.15 : 0) + (mind.hangover > 0 ? 0.1 : 0);
    const attack = clamp(1 - arms * 0.6 - fat * 0.3 - pain * 0.3 - (this.endurance < 0.25 ? 0.35 : 0) - drunk * 0.2 - attackFit * 0.2, 0.15, 1.3) * (1 + (this.skill('strength') - 5) * 0.06);
    // shaking hands: chronic anxiety, a panic attack, too much coffee
    const jitter = mind.anxiety * 0.15 + attackFit * 0.35 + (mind.caffeine > 0 && !this.perks.has('barista') ? 0.05 : 0) - anxiolyticEffect(mind) * 0.05;
    const aim = clamp(1 - panic * 0.6 - fat * 0.3 - drunk * 0.5 - pain * 0.2 - cold * 0.3 - Math.max(0, jitter), 0.1, 1);
    const canRun = this.endurance > 0.05 && legs < 0.5 && heavyLoad < 0.75;
    return { move: clamp(move, 0.15, 1.2), action, attack, aim, canRun, tired: fat, limp: legs, panic, cold, drunk };
  }
}
