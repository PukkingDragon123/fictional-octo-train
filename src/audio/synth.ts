// Offline DSP toolkit: every sound in the game is synthesised into
// AudioBuffers from noise, oscillators, filters and envelopes.

export const SR = 44100;

export class Buf {
  d: Float32Array;
  constructor(public secs: number) { this.d = new Float32Array(Math.max(1, Math.floor(secs * SR))); }
  get n() { return this.d.length; }
  t(i: number) { return i / SR; }
  /** add another buffer at offset seconds with gain */
  mix(o: Buf, at = 0, g = 1) { const o0 = Math.floor(at * SR); for (let i = 0; i < o.n && o0 + i < this.n; i++) if (o0 + i >= 0) this.d[o0 + i] += o.d[i] * g; return this; }
  gain(g: number) { for (let i = 0; i < this.n; i++) this.d[i] *= g; return this; }
  /** multiply by envelope function of time */
  env(fn: (t: number) => number) { for (let i = 0; i < this.n; i++) this.d[i] *= fn(i / SR); return this; }
  normalize(peak = 0.9) { let m = 0; for (const v of this.d) m = Math.max(m, Math.abs(v)); if (m > 0) this.gain(peak / m); return this; }
  fade(inS = 0.002, outS = 0.01) { const a = Math.floor(inS * SR), b = Math.floor(outS * SR); for (let i = 0; i < a && i < this.n; i++) this.d[i] *= i / a; for (let i = 0; i < b && i < this.n; i++) this.d[this.n - 1 - i] *= i / b; return this; }
  drive(k = 2) { const t = Math.tanh(k); for (let i = 0; i < this.n; i++) this.d[i] = Math.tanh(this.d[i] * k) / t; return this; }
  reverse() { this.d.reverse(); return this; }
  crush(bits = 8, hold = 1) { const q = Math.pow(2, bits - 1); let last = 0; for (let i = 0; i < this.n; i++) { if (i % hold === 0) last = Math.round(this.d[i] * q) / q; this.d[i] = last; } return this; }
}

// ---------------- sources ----------------
let seed = 12345;
export function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
export function setSeed(s: number) { seed = s >>> 0; }

export function noise(secs: number, color: 'white' | 'pink' | 'brown' = 'white'): Buf {
  const b = new Buf(secs);
  let b0 = 0, b1 = 0, b2 = 0, last = 0;
  for (let i = 0; i < b.n; i++) {
    const w = rnd() * 2 - 1;
    if (color === 'white') b.d[i] = w;
    else if (color === 'pink') { b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; b.d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2; }
    else { last = (last + 0.02 * w) / 1.02; b.d[i] = last * 3.5; }
  }
  return b;
}

export type Wave = 'sine' | 'tri' | 'saw' | 'square' | 'pulse';
/** oscillator with frequency as function of time (Hz) */
export function osc(secs: number, wave: Wave, freq: number | ((t: number) => number), duty = 0.25): Buf {
  const b = new Buf(secs);
  let ph = 0;
  for (let i = 0; i < b.n; i++) {
    const f = typeof freq === 'number' ? freq : freq(i / SR);
    ph += f / SR; ph -= Math.floor(ph);
    let v: number;
    switch (wave) {
      case 'sine': v = Math.sin(ph * Math.PI * 2); break;
      case 'tri': v = 1 - 4 * Math.abs(ph - 0.5); break;
      case 'saw': v = 2 * ph - 1; break;
      case 'square': v = ph < 0.5 ? 1 : -1; break;
      default: v = ph < duty ? 1 : -1;
    }
    b.d[i] = v;
  }
  return b;
}

// ---------------- filters (in place) ----------------
export function lowpass(b: Buf, cutoff: number | ((t: number) => number), q = 0.7) { return biquad(b, 'lp', cutoff, q); }
export function highpass(b: Buf, cutoff: number | ((t: number) => number), q = 0.7) { return biquad(b, 'hp', cutoff, q); }
export function bandpass(b: Buf, f: number | ((t: number) => number), q = 1) { return biquad(b, 'bp', f, q); }

function biquad(b: Buf, type: 'lp' | 'hp' | 'bp', freq: number | ((t: number) => number), q: number) {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  let b0 = 0, b1 = 0, b2 = 0, a1 = 0, a2 = 0;
  let lastF = -1;
  for (let i = 0; i < b.n; i++) {
    const f = Math.min(SR * 0.45, Math.max(10, typeof freq === 'number' ? freq : freq(i / SR)));
    if (f !== lastF && (typeof freq === 'number' ? lastF < 0 : i % 32 === 0)) {
      lastF = f;
      const w0 = 2 * Math.PI * f / SR, cs = Math.cos(w0), al = Math.sin(w0) / (2 * q);
      let n0: number, n1: number, n2: number;
      const d0 = 1 + al;
      if (type === 'lp') { n0 = (1 - cs) / 2; n1 = 1 - cs; n2 = (1 - cs) / 2; }
      else if (type === 'hp') { n0 = (1 + cs) / 2; n1 = -(1 + cs); n2 = (1 + cs) / 2; }
      else { n0 = al; n1 = 0; n2 = -al; }
      b0 = n0 / d0; b1 = n1 / d0; b2 = n2 / d0; a1 = (-2 * cs) / d0; a2 = (1 - al) / d0;
    }
    const x = b.d[i];
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    b.d[i] = y;
  }
  return b;
}

/** simple feedback comb/echo for metallic resonance */
export function comb(b: Buf, delayS: number, fb: number, mix = 0.5) {
  const D = Math.max(1, Math.floor(delayS * SR));
  const line = new Float32Array(D);
  let p = 0;
  for (let i = 0; i < b.n; i++) { const out = line[p]; line[p] = b.d[i] + out * fb; b.d[i] = b.d[i] * (1 - mix) + out * mix; p = (p + 1) % D; }
  return b;
}

// ---------------- envelopes ----------------
export const decay = (k: number) => (t: number) => Math.exp(-t * k);
export const adsr = (a: number, d: number, s: number, r: number, len: number) => (t: number) => {
  if (t < a) return t / a;
  if (t < a + d) return 1 - (1 - s) * ((t - a) / d);
  if (t < len - r) return s;
  return Math.max(0, s * (1 - (t - (len - r)) / r));
};
export const perc = (a: number, k: number) => (t: number) => (t < a ? t / a : Math.exp(-(t - a) * k));

/** formant voice: sawtooth-ish source through vowel formants (creatures, mimic calls) */
export function voice(secs: number, pitch: (t: number) => number, formants: [number, number][], breath = 0.2, wave: Wave = 'saw'): Buf {
  const src = osc(secs, wave, pitch, 0.3);
  const n = noise(secs, 'white');
  for (let i = 0; i < src.n; i++) src.d[i] = src.d[i] * (1 - breath) + n.d[i] * breath;
  const out = new Buf(secs);
  for (const [f, g] of formants) {
    const c = new Buf(secs); c.d.set(src.d);
    bandpass(c, f, 6);
    out.mix(c, 0, g);
  }
  return out;
}

/** impulse response for convolution reverb */
export function impulse(secs: number, decayK: number, brightness: number, early = 0.02, stereo = true): Float32Array[] {
  const chans: Float32Array[] = [];
  for (let c = 0; c < (stereo ? 2 : 1); c++) {
    const b = noise(secs, 'white');
    b.env((t) => (t < early ? 0.3 + rnd() * 0.7 : Math.exp(-t * decayK)));
    lowpass(b, (t) => 600 + brightness * 9000 * Math.exp(-t * 2.5));
    chans.push(b.d);
  }
  return chans;
}
