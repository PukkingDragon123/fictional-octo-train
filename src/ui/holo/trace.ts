// The heartbeat the BAILIFF projects: a sweeping monitor trace whose rate is
// the survivor's real pulse and whose shape carries everything else.
//
//   hunger   the line thins and fades, beats drop out, the trace goes dotted
//   thirst   jagged teeth on the line and a dry white crackle around it
//   fatigue  a slow, drooping baseline and a lazy, low complex
//   pain     sharp white spikes between beats
//   bleeding red drops shake loose from each beat and fall away (holo.ts)
//   panic    fast, irregular beats, the amplitude jitters
//   sickness the baseline wobbles like a seasick horizon
//   fever    the T wave flips and a hot ripple rides the line
//   mind     a ghost of the previous sweep and, alone or unmoored, a second,
//            fainter heart that is not yours
//   drunk    every beat smears into a double
//   breath   exhaustion heaves the baseline at the breathing rate
//
// The model writes one column per tick at a fixed sweep speed; the painter
// (holo.ts) draws it. No allocation per frame.
import type { Vitals } from './vitals';

/** PQRST-ish shape of one beat (phase 0..1), T wave sign flippable */
export function ecgWave(ph: number, tSign = 1): number {
  if (ph < 0.08) return 0.14 * Math.sin((ph / 0.08) * Math.PI);
  if (ph < 0.13) return 0;
  if (ph < 0.15) return -0.18;
  if (ph < 0.18) return 1;
  if (ph < 0.21) return -0.42;
  if (ph < 0.36) return 0;
  if (ph < 0.5) return 0.3 * tSign * Math.sin(((ph - 0.36) / 0.14) * Math.PI);
  return 0;
}

export const F_DROP = 1, F_SPIKE = 2, F_CRACKLE = 4, F_BEAT = 8, F_DOT = 16;

export class Trace {
  readonly w: number;
  /** column values (+ up, 1 = full QRS) */
  v: Float32Array;
  /** the previous sweep (ghost trace) */
  prev: Float32Array;
  /** a second, fainter heart (not yours) */
  other: Float32Array;
  /** baseline offset per column (fatigue droop, breathing, sickness wobble) */
  base: Float32Array;
  flags: Uint8Array;
  /** write head (column index) */
  head = 0;
  /** columns per second */
  speed = 34;
  private acc = 0;
  private phase = 0.6;
  private beatLen = 1;
  /** current beat is dropped (hunger) */
  private dropped = false;
  private amp = 1;
  private otherPh = 0.3;
  private t = 0;
  /** set when a beat starts this tick (the painter flashes the heart glyph, spawns drips) */
  beatAt = -1;
  beats = 0;
  /** for the eye: the trace can be told to flatten (the eye draws over it) */
  hush = 0;

  constructor(w: number) {
    this.w = w;
    this.v = new Float32Array(w); this.prev = new Float32Array(w); this.other = new Float32Array(w);
    this.base = new Float32Array(w); this.flags = new Uint8Array(w);
  }

  /** advance; returns the number of columns written */
  step(dt: number, bpm: number, s: Vitals): number {
    this.t += dt;
    this.acc += dt * this.speed;
    let n = 0;
    this.beatAt = -1;
    while (this.acc >= 1) {
      this.acc -= 1;
      this.column(bpm, s);
      n++;
    }
    return n;
  }

  private column(bpm: number, s: Vitals) {
    const dtc = 1 / this.speed;
    const x = this.head;
    let flags = 0;
    // ---- rhythm
    const rate = s.dead ? 0 : Math.max(0, bpm) / 60;
    this.phase += rate * dtc / this.beatLen;
    if (this.phase >= 1) {
      this.phase -= 1;
      // panic: irregular RR intervals; a panic attack is worse
      const irr = s.attack ? 0.35 : s.panic * 0.22 + s.fever * 0.08;
      this.beatLen = 1 + (Math.random() - 0.5) * 2 * irr;
      // hunger drops beats (a starving heart skips), thirst a little too
      this.dropped = Math.random() < s.hunger * s.hunger * 0.4 + s.thirst * 0.06;
      this.amp = (1 - s.hunger * 0.55 - s.fatigue * 0.2) * (1 + (Math.random() - 0.5) * (s.panic * 0.5 + (s.attack ? 0.5 : 0)));
      if (!this.dropped) { flags |= F_BEAT; this.beatAt = x; this.beats++; }
    }
    // ---- the complex
    const tSign = s.fever > 0.45 ? -1 : 1;
    let v = this.dropped ? ecgWave(this.phase, tSign) * 0.12 : ecgWave(this.phase, tSign) * this.amp;
    if (this.dropped) flags |= F_DROP;
    // drunk: a smeared echo of the complex a few columns late
    if (s.drunk > 0.05) v += ecgWave((this.phase + 0.93) % 1) * this.amp * s.drunk * 0.55;
    // thirst: jagged teeth and dry crackle
    if (s.thirst > 0.05) {
      if (Math.random() < s.thirst * 0.7) v += (Math.random() - 0.5) * 0.22 * s.thirst;
      if (Math.random() < s.thirst * 0.16) flags |= F_CRACKLE;
    }
    // pain: needle spikes between beats
    if (s.pain > 0.05 && this.phase > 0.4 && Math.random() < s.pain * 0.05) { v += (0.6 + Math.random() * 0.7) * (Math.random() < 0.5 ? 1 : -0.7); flags |= F_SPIKE; }
    // fever: a hot ripple
    if (s.fever > 0.05) v += Math.sin(this.t * 31) * 0.05 * s.fever;
    // corruption: the trace jumps to a wrong value now and then
    if (s.corrupt > 0.1 && Math.random() < s.corrupt * 0.04) v = (Math.random() - 0.5) * 2.2;
    // hunger: thin, dotted line
    if (s.hunger > 0.55 && (x & 1)) flags |= F_DOT;
    // dead: flat, with a little noise
    if (s.dead) { v = (Math.random() - 0.5) * 0.03; flags = 0; }
    if (this.hush > 0) v *= 0.15;
    // ---- baseline: fatigue droops, breathing heaves, sickness wobbles
    const breath = s.exhaust > 0.05 ? Math.sin(this.t * (s.exhaust > 0.6 ? 7 : 4.5)) * s.exhaust * 0.22 : 0;
    const droop = s.fatigue * (0.25 + 0.2 * Math.sin(this.t * 0.9));
    const wob = s.sick > 0.05 ? Math.sin(this.t * 2.3 + x * 0.12) * s.sick * 0.3 : 0;
    // ---- a second heart nobody else is wearing
    const otherOn = Math.max(s.lonely * 0.7, s.mental > 0.45 ? s.mental : 0, s.halluc);
    let o = 0;
    if (otherOn > 0.25) { this.otherPh = (this.otherPh + (47 / 60) * dtc) % 1; o = ecgWave(this.otherPh) * 0.55 * otherOn; }
    // ---- write
    this.prev[x] = this.v[x];
    this.v[x] = v;
    this.base[x] = breath - droop + wob;
    this.other[x] = o;
    this.flags[x] = flags;
    this.head = (x + 1) % this.w;
  }

  /** columns behind the head (0 = just written) */
  age(x: number) { return (this.head - 1 - x + this.w * 2) % this.w; }
}
