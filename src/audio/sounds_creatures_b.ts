// Creature pack B sound recipes (lumenmoth, wrongbird, echo, sentinel,
// occupant, lifeguard, lamplighter, plushkin). Registered through the public
// recipe hooks so the core library stays untouched. Imported by the species
// modules; every recipe is deterministic per variant.
import { defSound } from './sounds';
import { kit } from './sounds';
import { Buf, noise, osc, lowpass, highpass, bandpass, comb, decay, perc, adsr, voice, rnd } from './synth';

const { thump, burst, clickS } = kit;

// ---------------------------------------------------------------- lumenmoth
/** a soft dusty puff with a faint glassy shimmer (moths scattering / dying) */
defSound('lumen_puff', (v) => {
  const b = new Buf(0.9);
  const p = noise(0.5, 'pink'); bandpass(p, 900 + v * 120, 0.7); p.env(perc(0.02, 7)); b.mix(p, 0, 0.6);
  for (let i = 0; i < 7; i++) b.mix(osc(0.35, 'sine', 3200 + rnd() * 2600).env(decay(14)), 0.03 + rnd() * 0.4, 0.07);
  return b.normalize(0.35);
});

// ---------------------------------------------------------------- wrongbird
/** a caw played backwards and bit-crushed: the bird is hurt (or dying) incorrectly */
defSound('wrongbird_caw', (v) => {
  const b = voice(0.45, (t) => 620 - t * 500 + v * 30 + Math.sin(t * 70) * 40, [[1300, 1], [2600, 0.5]], 0.45, 'saw');
  b.env(perc(0.01, 6)); b.reverse();
  return b.crush(5, 3).normalize(0.5);
});

// ---------------------------------------------------------------- echo
/** wet tongue clicks: the echo listening for you */
defSound('echo_click', (v) => {
  const b = new Buf(0.9);
  const n = 2 + (v % 3);
  for (let i = 0; i < n; i++) {
    const at = i * (0.11 + rnd() * 0.07);
    b.mix(clickS(1700 + rnd() * 700, 0.012), at, 0.7);
    const w = noise(0.05, 'white'); bandpass(w, 2600, 3); w.env(decay(90)); b.mix(w, at, 0.4);
  }
  return b.normalize(0.42);
});
/** a human scream sampled wrong: reversed, formant-shifted, cut short */
defSound('echo_shriek', (v) => {
  const b = voice(0.8, (t) => 340 + t * 420 + v * 25 + Math.sin(t * 38) * 30, [[900, 1], [1500, 0.7], [3100, 0.35]], 0.35, 'saw');
  b.env(adsr(0.02, 0.1, 0.8, 0.12, 0.8)); b.reverse();
  return b.drive(2.2).normalize(0.7);
});
/** several voices at once, collapsing into a gurgle */
defSound('echo_death', () => {
  const b = new Buf(2.2);
  for (let k = 0; k < 4; k++) {
    const p0 = 140 + k * 55 + rnd() * 20;
    const w = voice(1.6, (t) => p0 * (1 - t * 0.35), [[500 + k * 160, 1], [1200 + k * 200, 0.6]], 0.3, 'saw');
    w.env(adsr(0.05, 0.3, 0.6, 0.8, 1.6)); b.mix(w, k * 0.09, 0.35);
  }
  const g = noise(1.0, 'brown'); bandpass(g, (t) => 300 + Math.sin(t * 40) * 120, 2); g.env(decay(3)); b.mix(g, 1.0, 0.6);
  return b.normalize(0.6);
});

// ---------------------------------------------------------------- sentinel
/** the hum swelling backwards into nothing (it is gone) */
defSound('sentinel_vanish', () => {
  const b = osc(1.4, 'sine', (t) => 47 + t * 60); b.mix(osc(1.4, 'sine', (t) => 94 + t * 120), 0, 0.4);
  const n = noise(1.4, 'pink'); bandpass(n, 300, 1); b.mix(n, 0, 0.15);
  b.env((t) => Math.pow(Math.min(1, t / 1.3), 3));
  return b.normalize(0.5);
});

// ---------------------------------------------------------------- occupant
/** one "step" of the procession: a wet carpet drag and a slow deep thump */
defSound('occupant_drag', (v) => {
  const b = new Buf(1.6);
  const d = noise(1.3, 'brown'); bandpass(d, (t) => 160 + Math.sin(t * 5 + v) * 60, 1.2); d.env(adsr(0.25, 0.2, 0.7, 0.5, 1.3)); b.mix(d, 0, 0.8);
  b.mix(thump(0.6, 70 + v * 4, 28, 6), 0.45, 1);
  const s = noise(0.8, 'pink'); bandpass(s, 1100, 2); s.env((t) => Math.max(0, Math.sin(t * 9)) * Math.exp(-t * 3)); b.mix(s, 0.1, 0.15);
  lowpass(b, 700);
  return b.normalize(0.75);
});
/** the crush: something enormous closing on a person */
defSound('occupant_crush', () => {
  const b = new Buf(1.4);
  b.mix(thump(0.7, 90, 30, 6), 0, 1);
  b.mix(burst(0.4, 'brown', 900, 40, 7), 0, 0.9);
  for (let i = 0; i < 9; i++) b.mix(burst(0.04, 'white', 4000, 700, 90), 0.05 + rnd() * 0.3, 0.35);
  const g = voice(0.9, (t) => 55 - t * 20, [[260, 1], [520, 0.6]], 0.6, 'saw'); g.env(adsr(0.05, 0.2, 0.6, 0.4, 0.9)); b.mix(g, 0.15, 0.6);
  return b.drive(2.5).normalize(0.9);
});
/** a groan from far inside it (bullets annoy it, nothing more) */
defSound('occupant_groan', (v) => {
  const b = voice(2.2, (t) => 42 + Math.sin(t * 1.6) * 5 + v * 2, [[220, 1], [480, 0.7], [900, 0.2]], 0.5, 'saw');
  b.env(adsr(0.4, 0.4, 0.7, 0.9, 2.2));
  lowpass(b, 600);
  return b.normalize(0.7);
});

// ---------------------------------------------------------------- lifeguard
/** a pea whistle: two sharp trilled blasts, the second cut short */
defSound('lifeguard_whistle', (v) => {
  const b = new Buf(1.3);
  const blast = (len: number) => {
    const w = osc(len, 'square', (t) => 2850 + v * 40 + Math.sin(t * 2 * Math.PI * 34) * 160);
    bandpass(w, 3000, 2.5);
    const n = noise(len, 'white'); bandpass(n, 3200, 4); w.mix(n, 0, 0.25);
    return w.env(adsr(0.01, 0.03, 0.85, 0.05, len));
  };
  b.mix(blast(0.42), 0, 0.8);
  b.mix(blast(0.22), 0.6, 0.75);
  return b.normalize(0.55);
});
/** slow bubbles rising from deep water */
defSound('lifeguard_bubbles', (v) => {
  const b = new Buf(1.6);
  const n = 5 + (v % 3) * 2;
  for (let i = 0; i < n; i++) {
    const f0 = 380 + rnd() * 500;
    const bb = osc(0.09, 'sine', (t) => f0 + t * 2600); bb.env(perc(0.004, 40));
    b.mix(bb, rnd() * 1.4, 0.35 + rnd() * 0.4);
  }
  lowpass(b, 2400);
  return b.normalize(0.4);
});
/** something heavy going under for good */
defSound('lifeguard_sink', () => {
  const b = new Buf(2.4);
  const s = burst(0.6, 'white', 2600, 200, 5); b.mix(s, 0, 0.6);
  for (let i = 0; i < 14; i++) { const f0 = 260 + rnd() * 300; const bb = osc(0.12, 'sine', (t) => f0 + t * 1800); bb.env(perc(0.004, 30)); b.mix(bb, 0.3 + i * 0.12 + rnd() * 0.05, 0.4 * (1 - i / 14)); }
  b.mix(thump(0.8, 60, 25, 4), 0.2, 0.5);
  lowpass(b, 2000);
  return b.normalize(0.55);
});

// ---------------------------------------------------------------- lamplighter
/** a tiny frightened descending peep */
defSound('lamp_whimper', (v) => {
  const b = osc(0.5, 'sine', (t) => 1700 - t * 1400 + v * 40 + Math.sin(t * 50) * 60);
  b.env(adsr(0.02, 0.1, 0.6, 0.2, 0.5));
  b.mix(osc(0.5, 'sine', (t) => 3400 - t * 2600).env(decay(9)), 0, 0.15);
  return b.normalize(0.32);
});
/** a little bulb going out: a pop, a tinkle of glass, a last chirp */
defSound('lamp_pop', () => {
  const b = new Buf(1.6);
  b.mix(burst(0.05, 'white', 7000, 900, 90), 0, 0.9);
  b.mix(thump(0.1, 400, 180, 50), 0, 0.4);
  for (let i = 0; i < 8; i++) b.mix(osc(0.25, 'sine', 3800 + rnd() * 3500).env(decay(25)), 0.05 + rnd() * 0.35, 0.18);
  b.mix(osc(0.6, 'sine', (t) => 1500 - t * 1800).env(adsr(0.01, 0.1, 0.4, 0.3, 0.6)), 0.6, 0.25);
  return b.normalize(0.45);
});

// ---------------------------------------------------------------- plushkin
/** fabric tearing open and a squeaker giving up */
defSound('plush_rip', () => {
  const b = new Buf(1.0);
  const r = noise(0.45, 'white'); bandpass(r, (t) => 1500 + t * 3000, 0.9); r.env((t) => (0.5 + 0.5 * Math.sin(t * 160)) * Math.exp(-t * 4)); b.mix(r, 0, 0.7);
  const s = osc(0.5, 'sine', (t) => 1100 - t * 1500); s.env(adsr(0.01, 0.1, 0.5, 0.2, 0.5)); b.mix(s, 0.35, 0.35);
  const air = noise(0.4, 'pink'); highpass(air, 1500); air.env(decay(7)); b.mix(air, 0.35, 0.2);
  comb(b, 0.0021, 0.3, 0.15);
  return b.normalize(0.45);
});
