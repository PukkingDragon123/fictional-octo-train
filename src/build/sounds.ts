// Sound recipes for build mode, butchery and cooking (synthesised on first use).
import { defSound } from '../audio/sounds';
import { Buf, noise, osc, highpass, bandpass, lowpass, decay, adsr, rnd, setSeed } from '../audio/synth';

/** arc welding: a dry crackle of tiny pops over a hiss */
defSound('weld_crackle', (v) => {
  setSeed(9100 + v * 17);
  const b = new Buf(0.22);
  const h = noise(0.22, 'white'); highpass(h, 3200); h.env(adsr(0.005, 0.03, 0.5, 0.08, 0.22)); b.mix(h, 0, 0.35);
  for (let i = 0; i < 14; i++) { const c = noise(0.004 + rnd() * 0.004, 'white'); highpass(c, 1800 + rnd() * 3000); c.env(decay(600)); b.mix(c, rnd() * 0.2, 0.5 + rnd() * 0.5); }
  return b.normalize(0.42);
});
/** a heavy press / turret: hydraulic slam */
defSound('slam_hydraulic', () => {
  const b = new Buf(0.9);
  const hiss = noise(0.35, 'white'); bandpass(hiss, 2400, 0.8); hiss.env(adsr(0.02, 0.1, 0.4, 0.2, 0.35)); b.mix(hiss, 0, 0.4);
  const t = osc(0.6, 'sine', (x) => 90 - x * 60); t.env(decay(8)); b.mix(t, 0.3, 1);
  const k = noise(0.12, 'brown'); lowpass(k, 500); k.env(decay(30)); b.mix(k, 0.3, 0.9);
  return b.normalize(0.8);
});
defSound('nail_shot', (v) => {
  setSeed(9200 + v * 5);
  const b = new Buf(0.3);
  const p = noise(0.06, 'white'); bandpass(p, 1600 + rnd() * 600, 1.2); p.env(decay(60)); b.mix(p, 0, 1);
  const t = osc(0.25, 'sine', (x) => 220 - x * 300); t.env(decay(18)); b.mix(t, 0, 0.6);
  return b.normalize(0.7);
});
/** a blade through meat: wet tear + gristle clicks */
defSound('flesh_cut', (v) => {
  setSeed(9300 + v * 11);
  const b = new Buf(0.45);
  const w = noise(0.35, 'pink'); bandpass(w, 700 + rnd() * 400, 1.4); w.env(adsr(0.01, 0.06, 0.6, 0.2, 0.35)); b.mix(w, 0, 0.9);
  for (let i = 0; i < 5; i++) { const c = noise(0.008, 'white'); bandpass(c, 2200 + rnd() * 1800, 3); c.env(decay(300)); b.mix(c, 0.03 + rnd() * 0.25, 0.4); }
  return b.normalize(0.7);
});
/** pan toss: a scrape and a soft landing */
defSound('pan_toss', () => {
  const b = new Buf(0.5);
  const s = noise(0.18, 'white'); bandpass(s, 3000, 1); s.env(adsr(0.01, 0.05, 0.3, 0.1, 0.18)); b.mix(s, 0, 0.5);
  const l = noise(0.1, 'pink'); lowpass(l, 1400); l.env(decay(40)); b.mix(l, 0.32, 0.8);
  const r = osc(0.3, 'sine', 900); r.env(decay(14)); b.mix(r, 0.32, 0.15);
  return b.normalize(0.5);
});
/** a pot simmering: low bubbles */
defSound('pot_bubble', (v) => {
  setSeed(9400 + v * 3);
  const b = new Buf(0.8);
  for (let i = 0; i < 6; i++) { const f = 180 + rnd() * 260; const o = osc(0.06, 'sine', (x) => f + x * 900); o.env(decay(50)); b.mix(o, rnd() * 0.7, 0.4 + rnd() * 0.4); }
  return b.normalize(0.35);
});
