// The 8-bit voice: every spoken line is a run of chiptune blips, one per
// letter, timed to the floating text (src/social/floatText.ts uses the same
// letter clock). Each speaker has a voice from their looks: pitch from body
// shape, height and build, waveform and duty from the face, a wobble with
// age. Vowels sing (their pitch moves with the vowel), consonants tick
// (noise from a little LFSR), spaces breathe, punctuation pauses, a question
// rises at the end and a shout clips. Rendered offline into one buffer per
// line and played on the voice bus, panned and faded by distance.
import { G } from '../game/G';
import type { Appearance } from '../entities/humanRig';

const SR = 22050;
/** seconds per letter: the floating text uses the same clock */
export const LETTER = 0.042;
export const SPACE = 0.03;
export const PAUSE = 0.16;

export interface ChipVoice {
  /** base pitch in Hz */
  base: number;
  wave: 'square' | 'pulse' | 'tri' | 'saw';
  /** pulse duty 0.1..0.5 */
  duty: number;
  /** vibrato depth (semitones) */
  wobble: number;
  /** pitch spread per syllable (semitones) */
  range: number;
  /** bit depth of the crusher */
  bits: number;
  /** extra volume */
  vol: number;
}

function hashStr(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

/** a voice from a survivor's appearance (pitch from body shape, height, build; timbre from face; wobble from age) */
export function voiceFromApp(app?: Partial<Appearance> | null, salt = ''): ChipVoice {
  const a = app || {};
  const fem = a.bodyShape ?? 0.3;
  const h = a.height ?? 1;
  const build = a.build === 'broad' ? -2.5 : a.build === 'slim' ? 1.5 : 0;
  const semis = (fem - 0.3) * 14 - (h - 1) * 30 + build + (((hashStr(salt) % 7) - 3) * 0.6);
  const base = 150 * Math.pow(2, semis / 12);
  const face = (a.face ?? hashStr(salt)) % 4;
  return {
    base, wave: (['square', 'pulse', 'tri', 'saw'] as const)[face], duty: [0.5, 0.25, 0.5, 0.5][face],
    wobble: 0.15 + (a.age ?? 0.2) * 0.9, range: 4 + fem * 3, bits: 5, vol: 1,
  };
}

/** voices for the lines that are not a survivor's */
export function voiceForStyle(style: string, who = ''): ChipVoice {
  switch (style) {
    case 'voss': return { base: 118, wave: 'pulse', duty: 0.18, wobble: 0.1, range: 3, bits: 4, vol: 0.9 };
    case 'bailiff': return { base: 92, wave: 'square', duty: 0.5, wobble: 0, range: 1.5, bits: 3, vol: 0.9 };
    case 'guard': return { base: 98, wave: 'saw', duty: 0.5, wobble: 0.05, range: 2.5, bits: 4, vol: 1.1 };
    case 'radio': return { base: 140 + (hashStr(who) % 60), wave: 'pulse', duty: 0.12, wobble: 0.3, range: 5, bits: 3, vol: 0.7 };
    default: return voiceFromApp(null, who || style);
  }
}

/** when each character starts (seconds), and the whole line's length */
export function letterTimes(text: string): { t: number[]; dur: number } {
  const t: number[] = [];
  let at = 0;
  for (const ch of text) {
    t.push(at);
    if (ch === ' ') at += SPACE;
    else if ('.!?'.includes(ch)) at += PAUSE;
    else if (',;:—-'.includes(ch)) at += PAUSE * 0.6;
    else at += LETTER;
  }
  return { t, dur: at + 0.12 };
}

const VOWEL_SEMI: Record<string, number> = { a: 0, e: 4, i: 7, o: -3, u: -5, y: 5 };

/** render one line to samples */
export function renderLine(text: string, v: ChipVoice, opts: { shout?: boolean; whisper?: boolean } = {}): Float32Array {
  const { t, dur } = letterTimes(text);
  const n = Math.max(1, Math.floor(dur * SR));
  const out = new Float32Array(n);
  const q = /\?\s*$/.test(text), bang = /!\s*$/.test(text) || opts.shout;
  let lfsr = 0x7ace;
  let phase = 0;
  const chars = [...text];
  for (let k = 0; k < chars.length; k++) {
    const ch = chars[k].toLowerCase();
    if (!/[a-z0-9]/.test(ch)) continue;
    const vowel = ch in VOWEL_SEMI;
    const t0 = t[k];
    const len = vowel ? LETTER * 1.25 : LETTER * 0.55;
    // the melody: vowels by vowel, consonants hover, a slow arc over the line, a rise for a question
    const prog = k / Math.max(1, chars.length - 1);
    let semi = vowel ? VOWEL_SEMI[ch] * (v.range / 7) : ((ch.charCodeAt(0) * 7) % 5 - 2) * 0.5;
    semi += Math.sin(prog * Math.PI) * 1.5 - prog * 1.2;
    if (q && prog > 0.75) semi += (prog - 0.75) * 24;
    if (bang) semi += 3;
    const f = v.base * Math.pow(2, semi / 12);
    const s0 = Math.floor(t0 * SR), s1 = Math.min(n, s0 + Math.floor(len * SR));
    for (let i = s0; i < s1; i++) {
      const lt = (i - s0) / SR;
      const vib = Math.sin(lt * 38) * v.wobble;
      const fi = f * Math.pow(2, vib / 12);
      phase += fi / SR; phase -= Math.floor(phase);
      let s: number;
      if (!vowel && lt < 0.012) {
        // consonant tick: a burst of LFSR noise
        const bit = ((lfsr >> 0) ^ (lfsr >> 1)) & 1; lfsr = (lfsr >> 1) | (bit << 14);
        s = (lfsr & 1 ? 1 : -1) * 0.55;
      } else switch (v.wave) {
        case 'tri': s = 1 - 4 * Math.abs(phase - 0.5); break;
        case 'saw': s = 2 * phase - 1; break;
        case 'pulse': s = phase < v.duty ? 0.8 : -0.8; break;
        default: s = phase < 0.5 ? 0.7 : -0.7;
      }
      // envelope: snap on, short decay
      const env = Math.min(1, lt / 0.004) * Math.max(0, 1 - lt / len) ** 0.6;
      out[i] += s * env * (opts.whisper ? 0.4 : 1) * (bang ? 1.15 : 1);
    }
  }
  // crush to a few bits and hold every other sample: the cheap speaker sound
  const qn = Math.pow(2, v.bits - 1);
  let hold = 0;
  for (let i = 0; i < n; i++) {
    if ((i & 1) === 0) hold = Math.round(out[i] * qn) / qn;
    out[i] = Math.max(-1, Math.min(1, hold * (bang ? 1.4 : 1))) * 0.32;
  }
  return out;
}

// ---------------------------------------------------------------- playback
let live = 0;
/** play a line; position (x, z) fades and pans it by distance from the listener. Returns its duration. */
export function playLine(text: string, v: ChipVoice, at?: { x: number; z: number } | null, opts: { shout?: boolean; whisper?: boolean; vol?: number } = {}): number {
  const dur = letterTimes(text).dur;
  const a = G?.audio as any;
  const ctx: AudioContext | null = a?.ctx ?? null;
  if (!ctx || ctx.state !== 'running' || live >= 5 || !text.trim()) return dur;
  let vol = (opts.vol ?? 1) * v.vol, pan = 0;
  if (at && G.local) {
    const dx = at.x - G.local.x, dz = at.z - G.local.z, d = Math.hypot(dx, dz);
    const range = opts.shout ? 40 : 24;
    if (d > range) return dur;
    vol *= Math.max(0, 1 - d / range) ** 0.7;
    const yaw = G.pr?.yaw ?? 0;
    pan = Math.max(-0.8, Math.min(0.8, (dx * Math.cos(yaw) - dz * Math.sin(yaw)) / 10));
  }
  if (vol < 0.02) return dur;
  try {
    const samples = renderLine(text, v, opts);
    const buf = ctx.createBuffer(1, samples.length, SR);
    buf.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const g = ctx.createGain(); g.gain.value = vol;
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    src.connect(g); g.connect(p);
    p.connect(a.buses?.voice || ctx.destination);
    live++;
    src.onended = () => { live--; try { p.disconnect(); } catch { /* gone */ } };
    src.start();
  } catch { /* audio unavailable */ }
  return dur;
}
