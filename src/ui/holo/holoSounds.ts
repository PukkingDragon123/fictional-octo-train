// Sounds of the BAILIFF band itself (the voice is rendered per line in
// voice.ts): boot, projector open/close, the scrip register, warning tones,
// the corrective shock, glitches and the countdown tick.
import { defSound } from '../../audio/sounds';
import { Buf, noise, osc, lowpass, highpass, bandpass, decay, perc, adsr, rnd } from '../../audio/synth';

defSound('band_boot', () => {
  const b = new Buf(1.6);
  // servo whine up, relay clicks, three rising tones, a low thunk as the lock seats
  const whine = osc(0.7, 'saw', (t) => 180 + t * 900); lowpass(whine, 1400); whine.env(adsr(0.05, 0.2, 0.5, 0.3, 0.7));
  b.mix(whine, 0, 0.12);
  for (let i = 0; i < 4; i++) { const c = osc(0.012, 'square', 2400 + i * 300).env(decay(400)); b.mix(c, 0.1 + i * 0.09, 0.4); }
  [523, 784, 1175].forEach((f, i) => { const t = osc(0.16, 'square', f, 0.3); lowpass(t, 3200); t.env(adsr(0.004, 0.04, 0.6, 0.08, 0.16)); b.mix(t, 0.62 + i * 0.13, 0.22); });
  const thunk = osc(0.25, 'sine', (t) => 60 + 140 * Math.exp(-t * 30)).env(decay(14));
  b.mix(thunk, 1.05, 0.9);
  const hiss = noise(0.3, 'white'); bandpass(hiss, 5000, 1.5); hiss.env(decay(12)); b.mix(hiss, 1.05, 0.15);
  return b.normalize(0.7);
});

defSound('band_open', () => {
  const b = noise(0.32, 'white'); bandpass(b, (t) => 800 + t * 9000, 3); b.env(adsr(0.02, 0.1, 0.5, 0.15, 0.32));
  const tone = osc(0.3, 'sine', (t) => 900 + t * 1800).env(decay(8)); b.mix(tone, 0, 0.15);
  return b.normalize(0.35);
});
defSound('band_close', () => {
  const b = noise(0.25, 'white'); bandpass(b, (t) => 7000 - t * 24000, 3); b.env(adsr(0.01, 0.08, 0.4, 0.12, 0.25));
  return b.normalize(0.3);
});

/** the scrip register: a cold digital coin roll */
defSound('band_ping', (v) => {
  const b = new Buf(0.7);
  for (let i = 0; i < 6; i++) { const f = 1800 + i * 160 + v * 40; const t = osc(0.06, 'square', f, 0.25); lowpass(t, 5000); t.env(decay(70)); b.mix(t, i * 0.045, 0.25 * (1 - i * 0.08)); }
  const bell = osc(0.5, 'sine', 2637).env(decay(7)); b.mix(bell, 0.28, 0.35);
  const bell2 = osc(0.5, 'sine', 3951).env(decay(9)); b.mix(bell2, 0.3, 0.15);
  return b.normalize(0.55);
});

defSound('band_tick', () => { const b = osc(0.03, 'square', 2900, 0.2).env(decay(220)); highpass(b, 900); return b.normalize(0.35); });

defSound('band_warn', () => {
  const b = new Buf(0.75);
  for (let i = 0; i < 2; i++) { const t = osc(0.26, 'square', i ? 620 : 880, 0.5); lowpass(t, 2600); t.env(adsr(0.005, 0.03, 0.8, 0.04, 0.26)); b.mix(t, i * 0.32, 0.5); }
  return b.normalize(0.6);
});

defSound('band_shock', () => {
  const b = new Buf(0.9);
  const hum = osc(0.8, 'square', (t) => 50 + rnd() * 6 + t * 10, 0.5); lowpass(hum, 900); hum.env(adsr(0.005, 0.1, 0.7, 0.3, 0.8));
  b.mix(hum, 0, 0.5);
  for (let i = 0; i < 26; i++) { const c = noise(0.012, 'white'); highpass(c, 2500); c.env(decay(300)); b.mix(c, rnd() * 0.75, 0.6 + rnd() * 0.5); }
  const crack = noise(0.12, 'white'); bandpass(crack, 3000, 0.7); crack.env(perc(0.001, 30)); b.mix(crack, 0, 1);
  return b.drive(2.5).normalize(0.8);
});

defSound('band_glitch', (v) => {
  const b = new Buf(0.22);
  const n = noise(0.22, 'white'); bandpass(n, 1800 + v * 700, 0.8);
  for (let i = 0; i < n.n; i++) if (((i / 400) | 0) % 3 === 0) n.d[i] = 0;
  b.mix(n, 0, 0.6);
  const tone = osc(0.1, 'square', 300 + v * 210); tone.env(decay(30)); b.mix(tone, 0.02, 0.3);
  return b.crush(4, 6).normalize(0.4);
});

/** the low, wet click of the band seating through the wrist (intro fitting) */
defSound('band_pierce', () => {
  const b = new Buf(0.8);
  const crunch = noise(0.2, 'brown'); lowpass(crunch, 900); crunch.env(perc(0.002, 18)); b.mix(crunch, 0, 1);
  const pop = osc(0.15, 'sine', (t) => 90 + 300 * Math.exp(-t * 40)).env(decay(20)); b.mix(pop, 0.01, 0.8);
  const bolt = osc(0.3, 'square', 1300, 0.15); bandpass(bolt, 2600, 2); bolt.env(decay(25)); b.mix(bolt, 0.18, 0.25);
  return b.normalize(0.85);
});
