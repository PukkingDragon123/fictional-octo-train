// Runtime side of the mind (see mind.ts for the data model).
//
// Each frame the survival system hands the local survivor and the gathered
// environment to MindSystem.update(), which:
//  * moves the long-term conditions (anxiety, low mood, insomnia, trauma,
//    loneliness) from the moodles, routine and coping;
//  * runs panic attacks, flashbacks, dissociative episodes, nightmares and
//    broken sleep;
//  * turns medication and substances into effects with real costs;
//  * notices coping (company, chat, voice, pets, journaling, reading,
//    breathing, comfort objects, daylight, good meals, sleep);
//  * voices it all through thought bubbles and returns screen/audio effects.
// Everything here only touches the local player; hallucinations are local fakes.
import { G } from '../game/G';
import { bus } from '../core/events';
import { clamp, clamp01 } from '../core/math';
import { itemDef } from '../items/item';
import { TimedAction } from '../actions/action';
import type { Player } from '../entities/player';
import type { Body, Env } from './body';
import { ensureMind, MindState, ssriEffect, anxiolyticEffect, heartTarget, halluPressure, dissociation } from './mind';
import { Hallucinations } from './hallucinations';
import { addStat, bumpStat } from '../game/profile';

const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];

const LINES = {
  depression: ['Why bother.', "I can't make myself care about any of this.", 'Everything takes so much effort.', 'I just want to lie down and not think.', 'Nothing tastes like anything anymore.', 'Even the hum sounds tired.', 'I keep forgetting what I was doing.'],
  anxiety: ['Something bad is about to happen. I can feel it.', 'Did I check behind me? I should check behind me.', 'My chest is tight.', "I can't sit still.", 'What if the lights go out?', 'Count the exits. Count them again.'],
  lonely: ["I haven't heard another voice in so long.", "I'd give anything for a conversation.", 'Hello? ...No. Nobody.', 'I miss people. Even the annoying ones.', 'Is anyone else still in here?'],
  insomnia: ['My eyes burn.', 'Every time I close my eyes my brain switches on.', "I'll sleep when this is over."],
  dissoc: ['None of this feels real.', "I'm watching myself from somewhere behind my eyes.", "My hands don't look like mine.", 'How long have I been standing here?'],
  flash: ['Not again. Not again.', "It's not here. It's a memory. It's a memory.", 'I can still feel it grabbing me.', "Don't look at it. Breathe."],
  flashSound: ['That sound...', 'I know that sound.', 'No. Not that sound.'],
  downed: ["I saw them go down. I can't unsee it.", 'Get up. Please get up.'],
  attackStart: ["I can't breathe. I can't breathe.", 'My heart is going to burst.', "Something's wrong with me. Something's really wrong."],
  attackMid: ["It's a panic attack. It will pass.", 'Breathe. In... and out.', "I'm not dying. It just feels like it.", 'Name five things I can see. Carpet. Light. Wall...'],
  attackEnd: ["It's passing. I'm okay. I'm okay.", "...okay. That was a panic attack. I'm still here.", 'Shaky. But it passed.'],
  nightmare: ['Just a dream. Just a dream.', '*gasp* ...where am I?', 'It was in the room. It was in the room.'],
  wake: ['Wide awake again. Great.', 'Ceiling. Hum. Not sleeping.', 'Why is my brain like this.'],
  dark: ["It's too dark to sleep.", 'I need a light on. Any light.'],
  dramatic: ['THIS IS HOW IT ENDS!', "I'M TOO YOUNG TO BE DELETED!", 'Tell my houseplants I loved them!', 'Why is it ALWAYS me?!', 'I knew I should have stayed in bed!'],
  journal: ['Writing it down helps. A little.', 'Okay. It looks smaller on paper.', 'Day whatever. Still here. Still writing.'],
  breathe: ['In... hold... out. Better.', 'Four in. Four hold. Four out.', 'Okay. Okay. Breathing.'],
  ssriStart: ['These take a while to work, the label says.'],
  ssriWork: ['The grey is lifting. A little.', 'I almost laughed at something today.'],
  hangover: ['Never again.', 'My head. Oh, my head.'],
  caffeineCrave: ['I need coffee. I need coffee right now.', 'My head is pounding. Coffee.'],
  meal: ['That was a real meal. I feel human.'],
  daylight: ['Real light. It feels warm.'],
  socks: ['Where are my lucky socks...', 'No socks. Bad luck. Bad luck everywhere.'],
  furniture: ['Thanks for listening, chair.', 'You get me, sofa. You really do.', "Don't look at me like that, lamp.", 'Same time tomorrow, armchair?'],
};

/** Box breathing: 16 seconds of 4-in / 4-hold / 4-out / 4-hold. Calms panic, eases stress, cuts a panic attack short. */
export class BreatheAction extends TimedAction {
  private lastPh = -1;
  constructor(p: Player) {
    super(p);
    this.name = 'Breathe'; this.duration = 16; this.fixedTime = true; this.anim = 'pray'; this.canMove = false;
  }
  update() {
    const ph = Math.floor(this.t / 4) % 4;
    if (ph !== this.lastPh) { this.lastPh = ph; if (ph === 0 || ph === 2) G.audio?.flat?.('breath', 'voice', 0.22, ph === 0 ? 0.75 : 0.62); }
  }
  perform() {
    const b = this.p.body, m = ensureMind(b);
    let k = clamp(m.sinceBreath / 1.5, 0.35, 1);
    if (b.has('box_breather')) k *= 2;
    if (b.perks.has('therapist')) k *= 2;
    k = Math.min(k, 2.2);
    b.panic = Math.max(0, b.panic - 28 * k);
    b.stress = Math.max(0, b.stress - 7 * k);
    m.anxiety = Math.max(0, m.anxiety - 0.012 * k);
    m.flash = 0; m.dissoc = 0;
    if (m.attack > 0) {
      m.attack = Math.min(m.attack, 2.5);
      addStat('panic_calmed');
    }
    m.sinceBreath = 0;
    bus.emit('think', this.p, pick(LINES.breathe));
  }
}

/** queue a breathing exercise (watch button, scanner, H key) */
export function startBreathing(p: Player) {
  if (!p || p.body.dead || p.sleeping || p.inVehicle) return;
  if (p.actions.current?.name === 'Breathe') return;
  p.actions.set(new BreatheAction(p));
}
export function isBreathing(p: Player) { const a = p.actions.current; return !!a && a.started && a.name === 'Breathe'; }

export interface MindFx { panic: number; desat: number; wobble: number; dream: number; glitch: number; vignette: number; shake: number; deaf: number; }

export class MindSystem {
  /** smoothed heart rate (BPM) shown on the watch and scanner */
  bpm = 68;
  /** set while a breathing exercise runs (watch shows the guide) */
  breathing = false;
  breathT = 0;
  /** a fake line the watch shows during a hallucination (null = none) */
  watchGlitch: string | null = null;
  watchGlitchT = 0;
  hallu = new Hallucinations(this);
  private thinkT = 30;
  private checkT = 0;
  private trigCd = new Map<string, number>();
  private downSeen = new Map<string, number>();
  private lastChat = -999;
  private chatHooked = false;
  private audioHooked = false;
  private lastAction: TimedAction | null = null;
  private lastPanicLvl = 0;
  private nearSeat = false;
  private wakeCd = 0;
  private deafT = 0;
  private lastHitBy = '';
  private ssriNoted = 0;
  private fx: MindFx = { panic: 0, desat: 0, wobble: 0, dream: 0, glitch: 0, vignette: 0, shake: 0, deaf: 0 };

  constructor() {
    bus.on('playerHit', (p: Player, part: string, kind: string, h: any) => { if (p?.isLocal) this.onHit(p, part, kind, h); });
    bus.on('downed', (p: Player) => { if (p?.isLocal) this.addTrauma(p.body, 0.18, this.lastHitBy, 0.35); });
    bus.on('creatureReveal', (c: any) => { const p = G.local; if (p && c?.zoneKey === p.zoneKey && Math.hypot(c.x - p.x, c.z - p.z) < 8) this.addTrauma(p.body, 0.03, c.sp?.key, 0.1); });
    bus.on('consumed', (p: Player, key: string) => { if (p?.isLocal) this.onConsumed(p, key); });
    bus.on('crafted', (p: Player, r: any) => { if (p?.isLocal) this.onCrafted(p, r); });
    bus.on('read', (p: Player, it: any) => { if (p?.isLocal) this.onRead(p, it); });
    bus.on('sleepStart', (p: Player) => { if (p?.isLocal) { ensureMind(p.body); } });
    bus.on('sleepEnd', (p: Player, hours: number) => { if (p?.isLocal) this.onWake(p, hours ?? 0); });
    bus.on('loop', (p: Player) => {
      if (!p?.isLocal) return;
      const b = p.body;
      if (b.perks.has('explorer')) { b.unhappy = Math.max(0, b.unhappy - 2); return; }
      if (b.perks.has('deja_vu') || b.has('been_here_before')) return;
      b.stress = Math.min(100, b.stress + 2);
    });
    bus.on('enterZone', (z: any, p: Player) => {
      if (!p?.isLocal || !z) return;
      const first = !G.missions?.flags?.has?.('visit:' + z.key);
      if (first && p.body.perks.has('explorer')) { p.body.unhappy = Math.max(0, p.body.unhappy - 15); p.body.boredom = 0; bus.emit('think', p, 'Oh, this place is incredible.'); }
    });
    bus.on('scanned', (c: any) => {
      const p = G.local; if (!p) return;
      p.body.boredom = Math.max(0, p.body.boredom - 4);
      if (p.body.perks.has('investigator')) { p.body.unhappy = Math.max(0, p.body.unhappy - 6); p.body.boredom = Math.max(0, p.body.boredom - 10); bus.emit('think', p, pick(['Fascinating.', 'Nobody is going to believe this.', "I KNEW they were real."])); }
      void c;
    });
    bus.on('shout', (p: Player) => {
      if (!p?.isLocal) return;
      const b = p.body;
      if (b.perks.has('mime')) { b.stress = Math.min(100, b.stress + 6); bus.emit('think', p, 'I broke character. Ugh.'); }
      if (G.players.size > 1) this.lastChat = G.time;
    });
    bus.on('creatureKilled', (c: any, killer: any) => {
      const p = G.local; if (!p || killer !== p) return;
      const b = p.body;
      if (b.perks.has('exterminator')) { b.stress = Math.max(0, b.stress - 6); b.panic = Math.max(0, b.panic - 15); }
      if (c?.sp?.temperament === 'peaceful' || c?.sp?.temperament === 'skittish') { b.unhappy = Math.min(100, b.unhappy + 5); bus.emit('think', p, "It wasn't hurting anyone."); }
    });
    bus.on('tamed', (p: Player) => { if (p?.isLocal) { const m = ensureMind(p.body); m.loneliness = Math.max(0, m.loneliness - 15); p.body.unhappy = Math.max(0, p.body.unhappy - 10); } });
    bus.on('noise', (n: any) => {
      const p = G.local;
      if (!p || !p.sleeping || !n || n.by === p.id || n.zone !== p.zoneKey || this.wakeCd > 0) return;
      if (!p.body.has('light_sleeper') || p.body.has('heavy_sleeper')) return;
      if (Math.hypot(n.x - p.x, n.z - p.z) > (n.radius ?? 8) + 3) return;
      this.wakeCd = 20;
      setTimeout(() => { if (p.sleeping) { p.actions.clear(); bus.emit('think', p, 'What was that? ...I was asleep.'); } }, 200);
    });
  }

  get fxOut() { return this.fx; }

  // ---------------------------------------------------------------- events
  private onHit(p: Player, part: string, kind: string, h: any) {
    const b = p.body;
    const by: string = h?.by || '';
    this.lastHitBy = by;
    if (h?.grab) this.addTrauma(b, 0.1, by, 0.45);
    else if ((kind === 'bite' || kind === 'deep') && (h?.dmg ?? 0) > 14) this.addTrauma(b, 0.04, by, 0.2);
    else if (by) this.addTrauma(b, 0.01, by, 0.06);
    void part;
  }

  /** register a frightening event: general trauma load + an association with what caused it */
  addTrauma(b: Body, amount: number, trigger: string, assoc: number) {
    const m = ensureMind(b);
    let k = 1;
    if (b.has('brave')) k *= 0.6;
    if (b.has('cowardly')) k *= 1.3;
    if (b.has('iron_nerves')) k *= 0.5;
    if (b.perks.has('exterminator') && trigger && trigger !== 'downed') k *= 0.6;
    m.trauma = clamp01(m.trauma + amount * k);
    if (trigger) m.triggers[trigger] = clamp01((m.triggers[trigger] ?? 0) + assoc * k);
  }

  private onConsumed(p: Player, key: string) {
    const b = p.body, m = ensureMind(b);
    const d = itemDef(key);
    const tags = d.tags || [];
    if (tags.includes('caffeine') || key === 'tea_brewed') {
      const tea = key === 'tea_brewed';
      let hrs = tea ? 1.5 : key === 'energy_drink' ? 5 : 4;
      if (b.perks.has('barista')) hrs *= 2;
      if (b.has('coffee_dependent')) hrs *= 1.25;
      m.caffeine = Math.min(12, m.caffeine + hrs);
      m.sinceCaffeine = 0;
      b.fatigue = Math.max(0, b.fatigue - (tea ? 2 : b.has('coffee_dependent') ? 12 : 7));
      if (b.perks.has('barista') && !tea) b.unhappy = Math.max(0, b.unhappy - 4);
      if (!tea) addStat('caffeine');
    }
    if (tags.includes('alcohol')) {
      const a = d.food?.alcohol ?? 0.15;   // bottles of liquor are sipped: each sip counts a little
      m.alcohol += a;
      if (d.food) b.drunk = clamp(b.drunk + a * 60, 0, 100);
    }
    if (key === 'cigarettes') {
      b.nicotine = 8;
      if (!b.has('smoker')) { b.sickness = Math.min(100, b.sickness + 6); bus.emit('think', p, '*cough* ...why do people do this?'); }
      else b.unhappy = Math.max(0, b.unhappy - 3);
      b.endurance = Math.max(0, b.endurance - 0.1);
      G.audio?.play?.('cough', p.x, p.z, { flat: true, vol: 0.4 });
    }
    // pills swallowed through the "Take" food option: apply the medicine itself
    if (d.food?.pills) {
      if (b.has('hypochondriac')) { b.stress = Math.max(0, b.stress - 10); if (Math.random() < 0.4) bus.emit('think', p, "That's better. Probably."); }
      switch (d.medical?.type) {
        case 'painkiller': b.painkiller = 5; break;
        case 'antibiotic': b.antibiotics = 12; break;
        case 'sedative': b.sedated = 6; b.panic = 0; b.stress = Math.max(0, b.stress - 30); break;
        case 'antidepressant': b.antidep = 24; break;
        case 'vitamins': b.fatigue = Math.max(0, b.fatigue - 8); break;
        case 'cold': b.sickness = Math.max(0, b.sickness - 10); break;
        case 'checksum': b.corruption = Math.max(0, b.corruption - 28); b.lucidity = Math.min(100, b.lucidity + 15); break;
      }
      if (d.medical?.type === 'antidepressant' && m.ssriDays < 0.05 && this.ssriNoted < 1) { this.ssriNoted = 1; bus.emit('think', p, LINES.ssriStart[0]); }
    }
  }

  private onCrafted(p: Player, r: any) {
    const b = p.body, m = ensureMind(b);
    const key = typeof r === 'string' ? r : r?.key;
    if (key === 'journal_entry') {
      let k = clamp(m.sinceJournal / 8, 0.25, 1) * (b.perks.has('therapist') ? 2 : 1);
      b.stress = Math.max(0, b.stress - 16 * k);
      b.unhappy = Math.max(0, b.unhappy - 7 * k);
      b.boredom = Math.max(0, b.boredom - 12);
      m.anxiety = Math.max(0, m.anxiety - 0.04 * k);
      m.depression = Math.max(0, m.depression - 0.035 * k);
      m.trauma = Math.max(0, m.trauma - 0.03 * k);
      m.loneliness = Math.max(0, m.loneliness - 6 * k);
      m.sinceJournal = 0;
      addStat('journal');
      bus.emit('think', p, pick(LINES.journal));
      return;
    }
    if (key === 'listen_music') {
      const player = p.findItem((it) => (itemDef(it.key).tags || []).includes('music') && (it.uses ?? 1) > 0.02);
      if (player) player.uses = Math.max(0, (player.uses ?? 1) - 0.03);
      const k = player ? 1 : 0.3;   // a dead battery is just holding a box
      b.stress = Math.max(0, b.stress - 10 * k);
      b.unhappy = Math.max(0, b.unhappy - 8 * k);
      b.boredom = Math.max(0, b.boredom - 20 * k);
      m.anxiety = Math.max(0, m.anxiety - 0.02 * k);
      m.depression = Math.max(0, m.depression - 0.015 * k);
      m.loneliness = Math.max(0, m.loneliness - 3 * k);
      if (!player) bus.emit('think', p, 'The batteries are dead. Silence.');
      return;
    }
    // hobbies: making things is its own small reward
    b.boredom = Math.max(0, b.boredom - 3);
    b.unhappy = Math.max(0, b.unhappy - (b.has('handy') ? 2 : 1));
  }

  private onRead(p: Player, it: any) {
    const b = p.body, m = ensureMind(b);
    m.depression = Math.max(0, m.depression - 0.012);
    const tags: string[] = itemDef(it?.key || '').tags || [];
    if (tags.includes('fiction')) { b.unhappy = Math.max(0, b.unhappy - 3); m.loneliness = Math.max(0, m.loneliness - 3); }
  }

  private onWake(p: Player, hours: number) {
    const b = p.body, m = ensureMind(b);
    const q = clamp01((hours / 7) * (1 - m.insomnia * 0.5) * (b.fatigue < 30 ? 1 : 0.6));
    m.lastSleep = q;
    if (b.sedated > 0) m.groggy = 3;
    if (hours > 4 && q > 0.5) {
      m.anxiety = Math.max(0, m.anxiety - 0.03 * q);
      m.depression = Math.max(0, m.depression - 0.025 * q);
      m.trauma = Math.max(0, m.trauma - 0.015 * q * (b.has('iron_nerves') ? 2 : 1));
    }
    if (m.depression > 0.45 && hours > 9) setTimeout(() => bus.emit('think', p, 'I slept forever and I am still tired.'), 2500);
    if (m.hangover > 0) setTimeout(() => bus.emit('think', p, pick(LINES.hangover)), 2000);
  }

  private hookOnce() {
    // chat lines (local or remote) count as conversation
    if (!this.chatHooked && G.ui?.chatLine) {
      this.chatHooked = true;
      const ui = G.ui, orig = ui.chatLine.bind(ui);
      ui.chatLine = (...a: any[]) => { this.lastChat = G.time; return orig(...a); };
    }
    // creature calls heard nearby can bring a memory back
    if (!this.audioHooked && G.audio?.creature) {
      this.audioHooked = true;
      const au = G.audio, orig = au.creature.bind(au);
      au.creature = (snd: string, c: any) => { const r = orig(snd, c); try { this.onCreatureSound(c); } catch { /* never break audio */ } return r; };
    }
  }

  private onCreatureSound(c: any) {
    const p = G.local; if (!p || !c?.sp || c.zoneKey !== p.zoneKey || c.tamedBy) return;
    const m = ensureMind(p.body);
    const s = m.triggers[c.sp.key] ?? 0;
    if (s < 0.2 || c.visibleToLocal) return;
    if (Math.hypot(c.x - p.x, c.z - p.z) > 26) return;
    this.flashback(p, c.sp.key, s * 0.55, true);
  }

  /** a reminder of something terrible: sudden fear, the memory pushes in */
  private flashback(p: Player, key: string, s: number, sound = false) {
    const now = G.time;
    if ((this.trigCd.get(key) ?? -999) > now) return;
    this.trigCd.set(key, now + (sound ? 45 : 70));
    const b = p.body, m = ensureMind(b);
    const settled = b.panic < 30;
    const k = (b.has('brave') ? 0.6 : 1) * (b.has('cowardly') ? 1.3 : 1) * (b.has('dramatic') ? 1.3 : 1) * (1 - anxiolyticEffect(m) * 0.6);
    b.panic = Math.min(100, b.panic + 32 * s * k);
    b.stress = Math.min(100, b.stress + 8 * s * k);
    m.flash = Math.max(m.flash, clamp01(s * k));
    bus.emit('think', p, pick(key === 'downed' ? LINES.downed : sound ? LINES.flashSound : LINES.flash));
    G.audio?.flat?.('sting_low', 'music', 0.25 + s * 0.3);
    // facing a reminder while calm and supported slowly loosens it (exposure)
    if (settled && (G.players.size > 1 || G.lightLevelAt(p.x, p.z) > 0.5)) m.triggers[key] = (m.triggers[key] ?? 0) * 0.9;
  }

  // ---------------------------------------------------------------- per frame
  update(p: Player, env: Env, dt: number, dh: number) {
    const b = p.body;
    const m = ensureMind(b);
    if (b.dead) { this.fx = { panic: 0, desat: 0, wobble: 0, dream: 0, glitch: 0, vignette: 0, shake: 0, deaf: 0 }; return; }
    this.hookOnce();
    this.wakeCd = Math.max(0, this.wakeCd - dt);
    this.breathing = isBreathing(p);
    this.nearSeat = !!env.nearSeat;
    this.breathT = this.breathing ? (p.actions.current!.t) : 0;
    const T = (t: string) => b.has(t);
    const calm = anxiolyticEffect(m), ssri = ssriEffect(m);
    const asleep = env.asleep;
    // during scripted sequences (the intro) the mind keeps ticking but stages nothing
    const scripted = !!G.attract;

    // ---- routine clocks
    m.sinceSocial += dh; m.sinceExercise += dh; m.sinceJournal += dh; m.sinceBreath += dh; m.sinceMeal += dh; m.sinceCaffeine += dh;
    m.hoursAwake = asleep ? Math.max(0, m.hoursAwake - dh * 3) : m.hoursAwake + dh;
    if (env.exertion > 0.5) m.sinceExercise = 0;

    // ---- substances
    m.caffeine = Math.max(0, m.caffeine - dh);
    m.anxiolytic = Math.max(0, m.anxiolytic - dh);
    m.groggy = Math.max(0, m.groggy - dh);
    if (m.anxiolytic <= 0) m.tolerance = Math.max(0, m.tolerance - 0.01 * dh);
    if (m.anxiolytic <= 0 && m.tolerance > 0.35) { m.anxiety = clamp01(m.anxiety + 0.004 * m.tolerance * dh); b.stress = Math.min(100, b.stress + 0.8 * m.tolerance * dh); } // rebound
    if (m.alcohol > 0) {
      const leave = Math.min(m.alcohol, 0.06 * dh);
      m.alcohol -= leave;
      if (b.drunk < 8) m.hangover = Math.min(10, m.hangover + leave * 14);
    }
    if (m.hangover > 0 && b.drunk < 5) { m.hangover = Math.max(0, m.hangover - dh); m.anxiety = clamp01(m.anxiety + 0.002 * dh); }
    // antidepressant course: builds while doses keep coming, fades if they stop
    if (b.antidep > 0) { m.ssriDays += dh / 24; m.ssriOff = 0; }
    else if (m.ssriDays > 0) {
      m.ssriOff += dh;
      if (m.ssriOff > 48) m.ssriDays = Math.max(0, m.ssriDays - dh / 24);
      // stopping abruptly after it took hold: a few unsettled days
      if (m.ssriDays > 2 && m.ssriOff > 24 && m.ssriOff < 96) { b.stress = Math.min(100, b.stress + 0.6 * dh); }
    }
    if (b.antidep > 0 && m.ssriDays < 1.5 && b.sickness < 18) b.sickness = Math.min(18, b.sickness + 0.4 * dh); // early side effects: mild nausea
    if (ssri > 0.6 && this.ssriNoted < 2) { this.ssriNoted = 2; bus.emit('think', p, pick(LINES.ssriWork)); }
    if (T('coffee_dependent') && m.sinceCaffeine > 12) { b.unhappy = Math.min(100, b.unhappy + 0.8 * dh); b.stress = Math.min(100, b.stress + 0.6 * dh); }

    // ---- social contact
    let social = env.social ?? 0;
    if (G.time - this.lastChat < 45) social = Math.max(social, 1);
    const voice = G.net?.voice?.mode ?? 0;
    if (voice > 0 && G.players.size > 1) social = Math.max(social, 1);
    for (const o of G.players.values()) {
      if (o === p || o.zoneKey !== p.zoneKey) continue;
      const vc = (o.remote?.state as any)?.vc ?? 0;
      if (vc > 0 && (vc === 2 || Math.hypot(o.x - p.x, o.z - p.z) < 20)) social = Math.max(social, 1);
    }
    if (b.perks.has('radio_voice') && social > 0) social = Math.min(1, social * 1.5);
    const company = env.nearTeam > 0 ? 1 : 0;
    if (company || social > 0.5) m.sinceSocial = 0;

    // ---- loneliness
    // builds over a couple of days alone, ever more slowly (people adapt, a little)
    let lgain = company ? 0 : 1.4 * (1 - m.loneliness / 140);
    lgain *= (T('lonely') ? 1.8 : 1) * (b.perks.has('mime') ? 0.4 : 1) * (b.perks.has('radio_voice') ? 0.6 : 1) * ((env.comfort ?? 0) > 0 ? 0.75 : 1);
    if (T('talks_furniture') && env.nearSeat) lgain *= 0.1;
    const petMul = T('cat_person') || T('dog_person') || T('creature_whisperer') ? 2 : 1;
    const lrelief = company * 30 + social * 18 + Math.min(2, env.companion ?? 0) * 6 * petMul + (T('talks_furniture') && env.nearSeat ? 4 : 0);
    m.loneliness = clamp(m.loneliness + (lgain - lrelief) * dh, 0, 100);

    // ---- anxiety
    const sMul = (T('worrier') ? 2 : 1) * (T('unbothered') ? 0.6 : 1) * (T('brave') ? 0.8 : 1);
    let anx = 0;
    if (b.stress > 50) anx += (b.stress - 50) / 50 * 0.01 * sMul;
    if (b.panic > 60) anx += 0.004 * sMul;
    if (b.stress < 30) anx -= 0.006;
    if (asleep) anx -= 0.004 * env.bedQuality;
    if (company) anx -= 0.004;
    anx -= 0.008 * ssri;
    if (env.lightLevel > 0.6 && env.outdoor) anx -= 0.002;
    m.anxiety = clamp01(m.anxiety + anx * dh);

    // ---- low mood
    const melMul = T('melancholic') ? 1.5 : 1;
    let dep = 0;
    if (b.unhappy > 45) dep += (b.unhappy - 45) / 55 * 0.007 * melMul;
    if (m.loneliness > 70) dep += 0.002;
    if (m.insomnia > 0.5) dep += 0.0015;
    if (b.unhappy < 30) dep -= 0.005 / melMul;
    if (env.lightLevel > 0.6) dep -= env.outdoor ? 0.004 : 0.0015;
    if (company) dep -= 0.003;
    if (env.exertion > 0.5) dep -= 0.003;
    if (m.sinceMeal < 4) dep -= 0.001;
    dep -= 0.012 * ssri;
    m.depression = clamp01(m.depression + dep * dh);
    // a low mood keeps a floor of unhappiness
    if (b.unhappy < m.depression * 35) b.unhappy = Math.min(m.depression * 35, b.unhappy + 2 * dh);

    // ---- insomnia & sleep
    const nightLight = this.needsLight(p, env);
    if (asleep) {
      const bad = (b.stress > 50 ? (b.stress - 50) / 50 : 0) + m.anxiety * 0.6 + (m.caffeine > 0 ? 0.6 : 0) + (nightLight ? 0.7 : 0) + m.trauma * 0.3;
      m.insomnia = clamp01(m.insomnia + (bad > 0.2 ? bad * 0.02 : -0.03 * (b.perks.has('sleeper') ? 2 : 1)) * dh);
      if (nightLight) b.fatigue = Math.min(100, b.fatigue + 4.5 * dh);
      else if (T('night_light') && env.lightLevel < 0.2) {
        const nl = p.findItem((it) => it.key === 'nightlight' && (it.uses ?? 1) > 0.02);
        if (nl) nl.uses = Math.max(0, (nl.uses ?? 1) - 0.03 * dh);
      }
      if (b.sleepHours > 0.3 && this.wakeCd <= 0 && !scripted) {
        const heavy = T('heavy_sleeper') ? 0.3 : 1, light = T('light_sleeper') ? 1.6 : 1, sed = b.sedated > 0 ? 0.25 : 1;
        const hug = (env.comfort ?? 0) > 0 ? 0.6 : 1;   // sleeping with the teddy keeps the nightmares quieter
        const nightmare = (m.trauma * 0.3 + (T('nyctophobic') && env.darkness ? 0.2 : 0) + m.anxiety * 0.1) * (T('lucid_dreamer') ? 0.5 : 1) * heavy * light * sed * hug;
        const broken = (m.insomnia * 0.45 + (nightLight ? 0.9 : 0) + (m.caffeine > 0 && !b.perks.has('barista') ? 0.3 : 0)) * heavy * light * sed * (b.perks.has('sleeper') ? 0.4 : 1);
        if (Math.random() < nightmare * dh) {
          this.wakeCd = 30;
          b.panic = Math.min(100, b.panic + 40);
          m.insomnia = clamp01(m.insomnia + 0.04);
          p.actions.clear();
          setTimeout(() => bus.emit('think', p, pick(LINES.nightmare)), 300);
        } else if (Math.random() < broken * dh) {
          this.wakeCd = 30;
          p.actions.clear();
          setTimeout(() => bus.emit('think', p, pick(nightLight ? LINES.dark : LINES.wake)), 300);
        }
      }
    } else if (m.hoursAwake > 20) m.insomnia = clamp01(m.insomnia + 0.002 * dh);
    if (T('insomniac')) m.insomnia = Math.max(m.insomnia, 0.2);

    // ---- trauma
    if ((b.health < 15 || b.blood < 42) && !m.nearDeath) { m.nearDeath = true; this.addTrauma(b, 0.2, this.lastHitBy, 0.3); bumpStat('near_death', 1); }
    if (m.nearDeath && b.health > 55 && b.blood > 75) m.nearDeath = false;
    let tr = -0.0004;                       // ~1% a day by itself
    if (asleep) tr -= 0.002 * env.bedQuality;
    if (company) tr -= 0.002;
    if (b.panic < 20 && b.stress < 30) tr -= 0.001;
    if (T('iron_nerves')) tr *= 2;
    m.trauma = clamp01(m.trauma + tr * dh);
    for (const k of Object.keys(m.triggers)) { m.triggers[k] *= Math.pow(0.97, dh / 24); if (m.triggers[k] < 0.03) delete m.triggers[k]; }
    m.flash = Math.max(0, m.flash - dt * 0.25);

    // ---- periodic checks (2 Hz): reminders in sight, friends going down
    this.checkT -= dt;
    if (this.checkT <= 0) { this.checkT = 0.5; this.scan(p, m); }

    // ---- panic attacks
    if (!scripted || m.attack > 0) this.panicAttack(p, b, m, env, dt, calm);

    // ---- dissociation
    const dis = dissociation(b);
    if (m.dissoc > 0) {
      m.dissoc = Math.max(0, m.dissoc - dt * (this.breathing ? 3 : 1) * (env.nearTeam > 0 ? 1.5 : 1));
    } else if (dis > 0.35 && !asleep && !scripted && Math.random() < dis * 0.004 * dt * 10) {
      m.dissoc = 6 + Math.random() * 7;
      b.lucidity = Math.max(0, b.lucidity - 2);
      bus.emit('think', p, pick(LINES.dissoc));
    }

    // ---- habits & quirks with a mental side
    if (T('gym_rat') && m.sinceExercise > 24) b.unhappy = Math.min(100, b.unhappy + 1 * dh);
    if (T('pocket_hoarder') && p.carriedWeight() < 2) b.unhappy = Math.min(100, b.unhappy + 1 * dh);
    if (T('lucky_socks') && !b.wearingSocks) { b.stress = Math.min(100, b.stress + 2 * dh); m.anxiety = clamp01(m.anxiety + 0.002 * dh); }

    // ---- coping actions finishing (pets, games, sitting...)
    this.watchActions(p, m);

    // ---- heart rate
    const target = heartTarget(b, env.exertion) + Math.sin(G.time * 0.7) * 2;
    this.bpm += (target - this.bpm) * Math.min(1, dt * (target > this.bpm ? 1.6 : 0.5));

    // ---- thoughts
    if (!scripted) this.thoughts(p, b, m, dt);

    // ---- hallucinations (local only)
    this.hallu.update(p, dt, scripted ? 0 : halluPressure(b));
    this.watchGlitchT -= dt;
    if (this.watchGlitchT <= 0) this.watchGlitch = null;

    // ---- screen & sound
    const fx = this.fx;
    const atk = m.attack > 0 ? clamp01(Math.min(m.attack, m.attackLen - m.attack + 0.5) / 2) : 0;
    const beat = 0.5 + 0.5 * Math.sin(G.time * 9);
    fx.panic = atk * (0.75 + beat * 0.25);
    fx.vignette = atk * 0.42 + m.flash * 0.2 + (m.dissoc > 0 ? 0.12 : 0);
    fx.desat = m.depression * 0.35 + atk * 0.15 + m.flash * 0.35 + (m.dissoc > 0 ? 0.3 : 0);
    fx.wobble = (m.dissoc > 0 ? 0.35 : 0) + (m.hangover > 0 ? 0.15 : 0) + atk * 0.2 + (m.groggy > 0 ? 0.1 : 0);
    fx.dream = (m.dissoc > 0 ? 0.65 : 0) + m.flash * 0.3;
    fx.glitch = m.flash > 0.6 ? (m.flash - 0.6) * 0.5 : 0;
    fx.shake = atk * 0.18 + (m.anxiety > 0.7 ? 0.03 : 0);
    fx.deaf = Math.max(atk * 0.55, m.dissoc > 0 ? 0.28 : 0, m.flash * 0.3);
    this.deafT -= dt;
    if (fx.deaf > 0.05 && this.deafT <= 0) { this.deafT = 0.4; G.audio?.deafen?.(fx.deaf); }
  }

  private needsLight(p: Player, env: Env) {
    if (!p.body.has('night_light') || env.lightLevel >= 0.2) return false;
    if (p.flashlightOn && p.lightItem) return false;
    return !p.findItem((it) => it.key === 'nightlight' && (it.uses ?? 1) > 0.02);
  }

  private scan(p: Player, m: MindState) {
    // creatures that hurt you before
    for (const c of (G.creatures?.creatures?.values?.() || []) as Iterable<any>) {
      if (c.dead || c.tamedBy || c.zoneKey !== p.zoneKey || !c.visibleToLocal) continue;
      const s = m.triggers[c.sp?.key] ?? 0;
      if (s < 0.15) continue;
      if (Math.hypot(c.x - p.x, c.z - p.z) > 15) continue;
      this.flashback(p, c.sp.key, s);
      break;
    }
    // friends going down nearby
    for (const o of G.players.values()) {
      if (o === p) continue;
      const near = o.zoneKey === p.zoneKey && Math.hypot(o.x - p.x, o.z - p.z) < 18;
      const state = o.body.dead ? 2 : o.body.downed ? 1 : 0;
      const prev = this.downSeen.get(o.id) ?? 0;
      if (state > prev && near) {
        this.addTrauma(p.body, state === 2 ? 0.22 : 0.14, 'downed', 0.5);
        p.body.panic = Math.min(100, p.body.panic + 30);
        bus.emit('think', p, state === 2 ? `No. No, ${o.name}...` : `${o.name}! Get up!`);
      }
      this.downSeen.set(o.id, state);
    }
  }

  private panicAttack(p: Player, b: Body, m: MindState, env: Env, dt: number, calm: number) {
    if (m.attack > 0) {
      let rate = 1 * (this.breathing ? 2.2 : 1) * (b.has('box_breather') ? 1.4 : 1) * (b.perks.has('therapist') ? 1.3 : 1) * (env.nearTeam > 0 ? 1.3 : 1) * (1 + calm);
      m.attack = Math.max(0, m.attack - dt * rate);
      const floor = this.breathing ? 50 : 82;
      if (b.panic < floor) b.panic = Math.min(100, b.panic + 30 * dt);
      if (Math.random() < dt / 9) bus.emit('think', p, pick(LINES.attackMid));
      if (m.attack <= 0) {
        m.attackCd = 150 + Math.random() * 120;
        b.stress = Math.max(0, b.stress - 5);
        b.panic = Math.min(b.panic, 45);
        addStat('panic_attacks');
        bus.emit('think', p, pick(LINES.attackEnd));
      }
      return;
    }
    m.attackCd = Math.max(0, m.attackCd - dt);
    if (b.has('iron_nerves') || env.asleep || m.attackCd > 0) return;
    const overload = (b.panic > 62 ? (b.panic - 62) / 38 : 0) + (b.pain() > 50 ? 0.15 : 0) + (b.bleedRate() > 0.35 ? 0.15 : 0) + m.flash * 0.5 + (b.health < 30 ? 0.1 : 0);
    if (overload < 0.3) return;
    let chance = 0.012 * overload * (0.35 + m.anxiety * 1.3 + m.trauma * 0.8 + m.insomnia * 0.3);
    if (b.has('brave')) chance *= 0.5;
    if (b.has('cowardly')) chance *= 1.5;
    if (b.has('dramatic')) chance *= 1.3;
    if (b.sedated > 0) chance *= 0.3;
    if (env.nearTeam > 0) chance *= 0.6;
    chance *= 1 - calm * 0.85;
    if (Math.random() < chance * dt) this.startAttack(p, m);
  }

  /** begin a panic attack (also used by tests: __game.survival.mind.startAttack(__game.local)) */
  startAttack(p: Player, m = ensureMind(p.body)) {
    m.attackLen = m.attack = 22 + Math.random() * 18 + m.anxiety * 10;
    m.attacks++;
    m.anxiety = clamp01(m.anxiety + 0.04);     // fear of the fear
    p.body.panic = Math.max(p.body.panic, 85);
    bus.emit('think', p, pick(LINES.attackStart));
    G.ui?.toast?.('PANIC ATTACK', 'It will pass. Breathe: press H or tap BREATHE on the watch.', 4.5);
    bus.emit('panicAttack', p);
  }

  /** an anxiolytic dose: calm within minutes, drowsy for hours, tolerance builds */
  private anxiolytic(p: Player, m: MindState) {
    const b = p.body;
    const eff = clamp(1 - m.tolerance * 0.6, 0.25, 1);
    m.anxiolytic = 5;
    m.tolerance = Math.min(1, m.tolerance + 0.12);
    b.panic = Math.max(0, b.panic - 45 * eff);
    b.stress = Math.max(0, b.stress - 20 * eff);
    if (m.attack > 0) m.attack = Math.min(m.attack, 6);
    bus.emit('think', p, eff < 0.6 ? "They don't work like they used to." : 'The edges go soft. Better.');
  }

  private watchActions(p: Player, m: MindState) {
    const a = p.actions.current ?? null;
    const prev = this.lastAction;
    if (prev && prev !== a && prev.done && !prev.cancelled) {
      const b = p.body;
      if (prev.name.startsWith('Take ')) {
        if (prev.name === 'Take ' + itemDef('anxiolytics').name) this.anxiolytic(p, m);
        if (b.has('hypochondriac')) b.stress = Math.max(0, b.stress - 10);
      }
      const pet = T2(b, 'cat_person') || T2(b, 'dog_person') ? 2 : 1;
      switch (prev.name) {
        case 'Pet': m.loneliness = Math.max(0, m.loneliness - 12 * pet); m.anxiety = Math.max(0, m.anxiety - 0.015 * pet); m.depression = Math.max(0, m.depression - 0.012 * pet); b.stress = Math.max(0, b.stress - 5 * (pet - 1)); break;
        case 'Play':
          // toys, games, music, cards. Holding something familiar helps the most
          m.depression = Math.max(0, m.depression - 0.008);
          if ((p.allItems().some((it) => (itemDef(it.key).tags || []).includes('comfort')))) { m.loneliness = Math.max(0, m.loneliness - 5); b.stress = Math.max(0, b.stress - 4); m.anxiety = Math.max(0, m.anxiety - 0.008); }
          break;
      }
    }
    this.lastAction = a;
  }

  private thoughts(p: Player, b: Body, m: MindState, dt: number) {
    // dramatic narration as panic climbs
    const pl = b.panic >= 75 ? 3 : b.panic >= 50 ? 2 : b.panic >= 25 ? 1 : 0;
    if (pl > this.lastPanicLvl && pl >= 2 && b.has('dramatic') && m.attack <= 0) { G.ui?.say?.(p, pick(LINES.dramatic), 'shout', 2.5); }
    this.lastPanicLvl = pl;
    this.thinkT -= dt;
    if (this.thinkT > 0 || p.sleeping || m.attack > 0) return;
    this.thinkT = 50 + Math.random() * 70;
    const opts: [string[], number][] = [];
    if (m.depression > 0.2) opts.push([LINES.depression, m.depression]);
    if (m.anxiety > 0.25) opts.push([LINES.anxiety, m.anxiety]);
    if (m.loneliness > 55) opts.push([LINES.lonely, m.loneliness / 100]);
    if (m.insomnia > 0.35 && b.fatigue > 60) opts.push([LINES.insomnia, m.insomnia]);
    if (b.has('coffee_dependent') && m.sinceCaffeine > 12) opts.push([LINES.caffeineCrave, 0.6]);
    if (b.has('lucky_socks') && !b.wearingSocks) opts.push([LINES.socks, 0.7]);
    if (b.has('talks_furniture') && this.nearSeat) opts.push([LINES.furniture, 0.65]);
    if (!opts.length) return;
    opts.sort((x, y) => y[1] - x[1]);
    const [lines, w] = opts[Math.random() < 0.7 ? 0 : Math.floor(Math.random() * opts.length)];
    if (Math.random() < 0.35 + w * 0.6) bus.emit('think', p, pick(lines));
  }
}

const T2 = (b: Body, t: string) => b.has(t);
