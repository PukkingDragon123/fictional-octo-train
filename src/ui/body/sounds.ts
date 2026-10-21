// Sounds for the body HUD and first-person eating: bites, chewing, gulps, the
// acid jar, the lungs and the bag. All synthesised (src/audio/synth.ts).
import { defSound } from '../../audio/sounds';
import { Buf, noise, osc, lowpass, highpass, bandpass, decay, perc, adsr, rnd } from '../../audio/synth';

defSound('bh_crunch', (v) => {
  const b = new Buf(0.32);
  // a hard snap, then the crackle of it breaking up
  const snap = noise(0.03, 'white'); highpass(snap, 1800); snap.env(decay(160)); b.mix(snap, 0, 1);
  for (let i = 0; i < 9; i++) { const c = noise(0.025, 'white'); bandpass(c, 2200 + rnd() * 4000 + v * 150, 1.6); c.env(decay(140 + rnd() * 80)); b.mix(c, 0.015 + i * 0.022 + rnd() * 0.012, 0.35 + rnd() * 0.5); }
  const body = noise(0.12, 'pink'); lowpass(body, 900); body.env(decay(30)); b.mix(body, 0, 0.5);
  return b.normalize(0.75);
});
defSound('bh_soft', (v) => {
  const b = new Buf(0.3);
  const sq = noise(0.22, 'pink'); lowpass(sq, (t) => 1800 - t * 5000 + v * 60); sq.env(adsr(0.01, 0.06, 0.4, 0.12, 0.22)); b.mix(sq, 0, 0.9);
  const wet = noise(0.12, 'white'); bandpass(wet, 3200, 4); wet.env(decay(40)); b.mix(wet, 0.03, 0.25);
  return b.normalize(0.6);
});
defSound('bh_chew', (v) => {
  const b = noise(0.11, 'brown'); lowpass(b, 500 + v * 40); b.env(perc(0.01, 30));
  const k = noise(0.04, 'white'); bandpass(k, 2600, 2); k.env(decay(90)); b.mix(k, 0.01, 0.2);
  return b.normalize(0.45);
});
defSound('bh_gulp', (v) => {
  const b = new Buf(0.38);
  const g = osc(0.2, 'sine', (t) => 260 + v * 8 - t * 700); g.env(perc(0.01, 14)); b.mix(g, 0.02, 0.9);
  const click = noise(0.02, 'white'); bandpass(click, 1400, 3); click.env(decay(200)); b.mix(click, 0, 0.4);
  const bub = osc(0.08, 'sine', (t) => 500 + t * 2200); bub.env(decay(40)); b.mix(bub, 0.2, 0.3);
  return b.normalize(0.6);
});
defSound('bh_swallow', () => {
  const b = osc(0.3, 'sine', (t) => 180 - t * 200); b.env(adsr(0.03, 0.1, 0.5, 0.12, 0.3));
  const n = noise(0.3, 'pink'); lowpass(n, 600); n.env(adsr(0.05, 0.1, 0.3, 0.1, 0.3)); b.mix(n, 0, 0.3);
  return b.normalize(0.4);
});
defSound('bh_plop', (v) => {
  const b = new Buf(0.5);
  const p = osc(0.09, 'sine', (t) => 300 + v * 20 + t * 2600); p.env(decay(36)); b.mix(p, 0, 0.8);
  const fz = noise(0.4, 'white'); highpass(fz, 4500); fz.env((t) => Math.exp(-t * 7) * (0.5 + 0.5 * Math.sin(t * 160))); b.mix(fz, 0.04, 0.25);
  return b.normalize(0.45);
});
defSound('bh_crack', () => {
  const b = new Buf(0.4);
  const c = noise(0.015, 'white'); highpass(c, 3000); c.env(decay(300)); b.mix(c, 0, 1);
  for (let i = 0; i < 5; i++) { const t = osc(0.12, 'sine', 3200 + rnd() * 2400); t.env(decay(40)); b.mix(t, 0.01 + i * 0.03, 0.15); }
  const tick = noise(0.2, 'white'); bandpass(tick, 6000, 3); tick.env(decay(25)); b.mix(tick, 0.03, 0.3);
  return b.normalize(0.6);
});
defSound('bh_vomit', () => {
  const b = new Buf(1.4);
  const retch = noise(0.5, 'pink'); bandpass(retch, (t) => 500 + Math.sin(t * 30) * 120, 2); retch.env(adsr(0.05, 0.1, 0.7, 0.2, 0.5)); b.mix(retch, 0, 0.8);
  const gush = noise(0.8, 'brown'); lowpass(gush, 1200); gush.env(adsr(0.02, 0.2, 0.6, 0.4, 0.8)); b.mix(gush, 0.35, 0.9);
  for (let i = 0; i < 8; i++) { const s = noise(0.05, 'white'); bandpass(s, 1500 + rnd() * 1500, 2); s.env(decay(60)); b.mix(s, 0.5 + rnd() * 0.7, 0.35); }
  return b.normalize(0.7);
});
defSound('bh_gurgle', () => {
  const b = new Buf(1.1);
  for (let i = 0; i < 6; i++) { const g = osc(0.18, 'sine', (t) => 90 + rnd() * 60 + Math.sin(t * 40) * 25); g.env(adsr(0.03, 0.05, 0.5, 0.1, 0.18)); b.mix(g, i * 0.15 + rnd() * 0.05, 0.5); }
  lowpass(b, 400);
  return b.normalize(0.5);
});
defSound('bh_in', (v) => { const b = noise(0.55, 'pink'); bandpass(b, (t) => 700 + t * 1400 + v * 30, 1.2); return b.env((t) => Math.sin(Math.min(1, t / 0.55) * Math.PI) ** 2).normalize(0.35); });
defSound('bh_out', (v) => { const b = noise(0.6, 'pink'); bandpass(b, (t) => 1300 - t * 900 + v * 30, 1); return b.env((t) => Math.sin(Math.min(1, t / 0.6) * Math.PI) ** 1.5).normalize(0.38); });
defSound('bh_good', (v) => {
  const b = new Buf(0.3);
  [660, 990].forEach((f, i) => { const t = osc(0.14, 'square', f * (1 + v * 0.02), 0.3); lowpass(t, 2400); t.env(adsr(0.003, 0.04, 0.4, 0.08, 0.14)); b.mix(t, i * 0.05, 0.3); });
  return b.normalize(0.4);
});
defSound('bh_perfect', () => {
  const b = new Buf(0.45);
  [784, 1175, 1568].forEach((f, i) => { const t = osc(0.18, 'square', f, 0.25); lowpass(t, 3200); t.env(adsr(0.003, 0.05, 0.4, 0.1, 0.18)); b.mix(t, i * 0.05, 0.28); });
  return b.normalize(0.45);
});
defSound('bh_squelch', () => {
  const b = noise(0.25, 'pink'); lowpass(b, (t) => 1400 - t * 4000); b.env(perc(0.01, 14));
  const w = osc(0.15, 'sine', (t) => 160 + t * 300); w.env(decay(20)); b.mix(w, 0, 0.3);
  return b.normalize(0.45);
});
defSound('bh_tape', () => {
  const b = noise(0.35, 'white'); bandpass(b, (t) => 2500 + t * 3000, 1.5); b.env((t) => (t < 0.3 ? 0.6 + 0.4 * Math.sin(t * 220) : Math.exp(-(t - 0.3) * 60)));
  return b.normalize(0.35);
});
defSound('bh_drip', (v) => { const b = osc(0.06, 'sine', (t) => 900 + v * 40 + t * 3000); b.env(decay(70)); return b.normalize(0.25); });
defSound('bh_wrap', () => { const b = noise(0.3, 'white'); bandpass(b, 4200, 0.8); b.env((t) => (0.4 + 0.6 * Math.abs(Math.sin(t * 90))) * Math.exp(-t * 6)); return b.normalize(0.3); });
