// Sound recipes for the opening (src/game/intro.ts): a late-night radio song
// through a small speaker, rain ticking on the staff-room windows, the coffee
// machine, the hum that changes key, the noclip itself, the fall and the
// landing on wet carpet. Registered through the public recipe hooks.
import { defSound, defLoopSound, kit } from './sounds';
import { Buf, noise, osc, lowpass, highpass, bandpass, decay, perc, adsr, rnd, SR } from './synth';

const { thump } = kit;
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/**
 * Add a note made of decaying sine partials [freq multiple, amplitude, decay
 * per second] straight into `d` at time `at`. The partials run as recurrence
 * oscillators (no trig per sample) in a single pass, so the whole radio song
 * renders in a few milliseconds even on a phone. `trem` adds a slow tremolo.
 */
function note(d: Float32Array, at: number, f: number, len: number, parts: [number, number, number][], vel = 1, fin = 0.006, fout = 0.25, trem = 0) {
  const o = Math.floor(at * SR), n = Math.min(Math.floor(len * SR), d.length - o);
  if (n <= 0) return;
  const P = parts.filter(([m]) => 2 * Math.PI * f * m / SR < Math.PI).slice(0, 4);
  while (P.length < 4) P.push([0, 0, 0]);
  const osc4 = P.map(([m, a, k]) => { const w = 2 * Math.PI * f * m / SR; return { c: 2 * Math.cos(w), y1: Math.sin(-w), y2: Math.sin(-2 * w), e: a * vel, ed: Math.exp(-k / SR) }; });
  let [A, B, C, D] = osc4;
  let a0 = A.y1, b0 = A.y2, a1 = B.y1, b1 = B.y2, a2 = C.y1, b2 = C.y2, a3 = D.y1, b3 = D.y2;
  let e0 = A.e, e1 = B.e, e2 = C.e, e3 = D.e;
  const c0 = A.c, c1 = B.c, c2 = C.c, c3 = D.c, d0 = A.ed, d1 = B.ed, d2 = C.ed, d3 = D.ed;
  const tw = 2 * Math.PI * 5.2 / SR, tc = 2 * Math.cos(tw);
  let t1 = Math.sin(-tw), t2 = Math.sin(-2 * tw);
  const nin = Math.max(1, Math.floor(fin * SR)), nout = Math.max(1, Math.floor(fout * SR)), outAt = n - nout;
  void [A, B, C, D];
  for (let i = 0; i < n; i++) {
    const v0 = c0 * a0 - b0; b0 = a0; a0 = v0;
    const v1 = c1 * a1 - b1; b1 = a1; a1 = v1;
    const v2 = c2 * a2 - b2; b2 = a2; a2 = v2;
    const v3 = c3 * a3 - b3; b3 = a3; a3 = v3;
    let v = v0 * e0 + v1 * e1 + v2 * e2 + v3 * e3;
    e0 *= d0; e1 *= d1; e2 *= d2; e3 *= d3;
    if (i < nin) v *= i / nin; else if (i > outAt) v *= (n - i) / nout;
    if (trem) { const tv = tc * t1 - t2; t2 = t1; t1 = tv; v *= 1 - trem + trem * tv; }
    d[o + i] += v;
  }
}
const EP: [number, number, number][] = [[1, 1, 1.6], [2, 0.3, 4.5], [3, 0.1, 7], [4.02, 0.05, 10]];
const VIB: [number, number, number][] = [[1, 1, 1.9], [4, 0.18, 9]];
const BASS: [number, number, number][] = [[1, 1, 2.0], [2, 0.12, 3], [3, 0.04, 4]];

/**
 * A slow late-night song (ii-V-I-vi in C, 76 bpm, four bars) as heard from a
 * portable radio on a counter: thin speaker, a little hiss and crackle. Built
 * a beat longer than the loop so the engine's tail crossfade lands on bar one.
 */
defLoopSound('intro_radio', () => {
  const beat = 60 / 76, bar = beat * 4, len = bar * 4 + 0.3;
  const b = new Buf(len), d = b.d;
  const chords = [[53, 57, 60, 64], [53, 59, 64, 67], [52, 55, 59, 62], [55, 59, 60, 64]];
  const roots = [38, 43, 36, 45];
  const swish = noise(0.28, 'pink'); bandpass(swish, 3200, 0.8); swish.env(adsr(0.03, 0.08, 0.3, 0.12, 0.28));
  const tick = noise(0.12, 'pink'); bandpass(tick, 3600, 0.8); tick.env(perc(0.004, 40));
  const melody: [number, number, number][] = [[1, 2.5, 69], [1, 3.5, 67], [2, 1.5, 65], [2, 3, 64], [3, 0.5, 64], [3, 2, 62], [4, 1, 72], [4, 2.5, 71], [4, 3.5, 67]];
  for (let k = 0; k < 4; k++) {
    const t0 = k * bar;
    chords[k].forEach((m, j) => note(d, t0 + j * 0.012, mtof(m), 2.0, EP, 0.55));
    // a soft re-strike on beat 3
    chords[k].forEach((m) => note(d, t0 + beat * 2 + 0.02, mtof(m), 1.1, EP, 0.25));
    note(d, t0, mtof(roots[k]), beat * 1.9, BASS, 0.7, 0.01, 0.05);
    note(d, t0 + beat * 2, mtof(roots[k] + 7), beat * 1.9, BASS, 0.7, 0.01, 0.05);
    // brushes on 2 and 4, feathered eighths
    for (let e = 0; e < 8; e++) b.mix(e % 4 === 2 ? swish : tick, t0 + e * beat / 2 + (e % 2 ? 0.035 : 0), e % 4 === 2 ? 0.22 : 0.06);
  }
  for (const [bn, bt, m] of melody) note(d, (bn - 1) * bar + bt * beat, mtof(m), 1.3, VIB, 0.42, 0.003, 0.2, 0.18);
  // hiss and crackle, then a small speaker: no lows, no highs, a little breakup
  for (let i = 0; i < d.length; i++) {
    d[i] += (rnd() - 0.5) * 0.02;
    if (rnd() < 0.00012) { const a = (rnd() - 0.5) * 0.5; for (let j = 0, e = 1; j < 30 && i + j < d.length; j++, e *= 0.846) d[i + j] += a * e; }
  }
  highpass(b, 260); lowpass(b, 3300);
  let peak = 0;
  for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > peak) peak = v; }
  const g = peak > 0 ? 1.6 / peak : 1;
  for (let i = 0; i < d.length; i++) { const x = Math.max(-1.5, Math.min(1.5, d[i] * g)); d[i] = (x - x * x * x / 6.75) * 0.5; }
  return b;
});

/** the Level 0 hum: mains buzz with a slow beat in it, heavier than a single tube */
defLoopSound('intro_hum', () => {
  const len = 4, b = new Buf(len), d = b.d;
  note(d, 0, 120, len, [[1, 0.5, 0], [2, 0.2, 0]], 1, 0.001, 0.001);
  note(d, 0, 121.25, len, [[1, 0.28, 0]], 1, 0.001, 0.001);
  // a buzzy 60 Hz under it: the low harmonics of a sawtooth
  note(d, 0, 60, len, [[1, 0.22, 0], [2, 0.11, 0], [3, 0.073, 0], [4, 0.055, 0]], 1, 0.001, 0.001);
  note(d, 0, 60, len, [[5, 0.044, 0], [6, 0.037, 0], [7, 0.031, 0], [8, 0.027, 0]], 1, 0.001, 0.001);
  const buzz = noise(len, 'white'); bandpass(buzz, 3800, 2);
  const w = 2 * Math.PI * 120 / SR, c = 2 * Math.cos(w);
  let y1 = Math.sin(-w), y2 = Math.sin(-2 * w);
  for (let i = 0; i < buzz.n; i++) { const y = c * y1 - y2; y2 = y1; y1 = y; d[i] += buzz.d[i] * (0.5 + 0.5 * y) * 0.1; }
  return b.normalize(0.5);
});

/** rain ticking on window glass, now and then a drip from the frame */
defLoopSound('intro_drops', () => {
  const len = 6;
  const b = new Buf(len);
  for (let k = 0; k < 90; k++) {
    const d = osc(0.03, 'sine', 2600 + rnd() * 3200).env(decay(140));
    b.mix(d, rnd() * (len - 0.05), 0.15 + rnd() * 0.25);
  }
  for (let k = 0; k < 5; k++) {
    const d = osc(0.2, 'sine', (t) => 1300 + rnd() * 200 - t * 2600).env(decay(26));
    b.mix(d, rnd() * (len - 0.3), 0.35);
  }
  const wash = noise(len, 'pink'); bandpass(wash, 2400, 0.6); b.mix(wash, 0, 0.05);
  return b.normalize(0.35);
});

/** the coffee machine: gurgle, steam, pour */
defSound('intro_brew', () => {
  const len = 3.4;
  const b = new Buf(len);
  for (let k = 0; k < 46; k++) {
    const f0 = 160 + rnd() * 160;
    const bub = osc(0.07, 'sine', (t) => f0 + t * 3200).env(decay(45));
    b.mix(bub, 0.05 + Math.pow(rnd(), 0.8) * 2.4, 0.25 + rnd() * 0.25);
  }
  const steam = noise(2.6, 'white'); highpass(steam, 3200); steam.env(adsr(0.3, 0.4, 0.5, 0.8, 2.6)); b.mix(steam, 0.1, 0.12);
  const pour = noise(0.9, 'white'); bandpass(pour, (t) => 700 + Math.sin(t * 28) * 250 + t * 300, 2); pour.env(adsr(0.05, 0.1, 0.8, 0.3, 0.9)); b.mix(pour, 2.45, 0.45);
  return b.normalize(0.5);
});

/** something gives: a swell, a hard digital tear and everything dropping away */
defSound('intro_noclip', () => {
  const len = 3.4;
  const b = new Buf(len);
  const swell = noise(0.75, 'white'); highpass(swell, 1800); swell.env((t) => Math.pow(t / 0.75, 3)); b.mix(swell, 0, 0.35);
  b.mix(thump(1.2, 95, 28, 3), 0.72, 1);
  const tear = noise(0.35, 'white'); tear.crush(4, 6); tear.env(perc(0.002, 7)); b.mix(tear, 0.72, 0.6);
  const sweep = osc(2.2, 'saw', (t) => 30 + 900 * Math.exp(-t * 2.4)); lowpass(sweep, (t) => 300 + 3500 * Math.exp(-t * 2)); sweep.crush(5, 3); sweep.env(adsr(0.02, 0.4, 0.6, 1.0, 2.2));
  b.mix(sweep, 0.75, 0.45);
  const hum = osc(2.4, 'sine', (t) => 120 * Math.exp(-t * 0.55)); hum.mix(osc(2.4, 'sine', (t) => 240 * Math.exp(-t * 0.55)), 0, 0.3); hum.env(adsr(0.05, 0.2, 0.8, 0.8, 2.4)); b.mix(hum, 0.8, 0.5);
  for (let k = 0; k < 7; k++) { const z = osc(0.05, 'square', 400 + rnd() * 1800); z.env(perc(0.002, 50)); b.mix(z, 0.8 + rnd() * 1.4, 0.18); }
  return b.drive(1.4).normalize(0.85);
});

/** air rushing past while falling through nothing */
defLoopSound('intro_fall', () => {
  const len = 3;
  const b = new Buf(len);
  const air = noise(len, 'pink'); bandpass(air, (t) => 650 + 220 * Math.sin(t * 2 * Math.PI / len), 0.6); b.mix(air, 0, 0.8);
  const hiss = noise(len, 'white'); highpass(hiss, 4200); b.mix(hiss, 0, 0.12);
  const rumble = noise(len, 'brown'); lowpass(rumble, 120); b.mix(rumble, 0, 0.6);
  return b.normalize(0.5);
});

/** landing face-down on soaked carpet */
defSound('intro_land', () => {
  const b = new Buf(1.4);
  b.mix(thump(0.9, 78, 30, 5), 0, 1);
  const squelch = noise(0.5, 'pink'); bandpass(squelch, 520, 1.2); squelch.env(perc(0.005, 9)); b.mix(squelch, 0.01, 0.5);
  const splat = noise(0.25, 'white'); bandpass(splat, 1900, 1.5); splat.env(decay(25)); b.mix(splat, 0.02, 0.25);
  lowpass(b, 2200);
  return b.normalize(0.8);
});

/** a chord that is a quarter-tone wrong, swelling and cut off */
defSound('intro_sting', () => {
  const len = 3;
  const b = new Buf(len);
  for (const [f, g] of [[110, 0.4], [113.2, 0.35], [165, 0.25], [233, 0.15]] as const) b.mix(osc(len, 'saw', f), 0, g);
  lowpass(b, (t) => 260 + t * 700);
  b.env((t) => (t < 2.6 ? Math.pow(t / 2.6, 2) : Math.max(0, 1 - (t - 2.6) / 0.08)));
  return b.normalize(0.45);
});
