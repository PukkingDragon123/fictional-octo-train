// Sounds of the BAILIFF fitting station (src/game/introKit/stamp.ts, the
// intake's 'fit' beat): the arm slammed on the steel bed, the clamp jaws
// banging shut, the hydraulic groan of the crosshead coming down, steam
// venting, the two-tone alarm before the stamp, the stamp itself (a dead
// metal blow with a crack under it) and the band booting on the wrist.
import { defSound } from '../../audio/sounds';
import { kit } from '../../audio/sounds';
import { Buf, noise, osc, lowpass, highpass, bandpass, perc, adsr, rnd, setSeed } from '../../audio/synth';

const { thump, burst, clickS } = kit;

// the forearm slammed down on the bed: a dull slap on steel, the steel ringing a little
defSound('st_slam', (v) => {
  setSeed(7100 + v * 13);
  const b = new Buf(0.9);
  b.mix(thump(0.25, 170, 60, 16), 0, 0.9);
  b.mix(burst(0.08, 'pink', 2600, 200, 40), 0, 0.6);
  for (const [f, a] of [[612, 0.25], [1288, 0.14], [2071, 0.08]] as [number, number][]) { const r = osc(0.8, 'sine', f * (0.98 + rnd() * 0.04)); r.env(perc(0.002, 5)); b.mix(r, 0.005, a); }
  return b.drive(1.3).normalize(0.8);
});

// the jaws bang shut: two hard clanks a hair apart, a pneumatic spit
defSound('st_clamp', (v) => {
  setSeed(7200 + v * 7);
  const b = new Buf(0.9);
  for (const at of [0, 0.035]) {
    b.mix(thump(0.12, 420, 140, 30), at, 0.7);
    b.mix(burst(0.05, 'white', 7000, 900, 60), at, 0.6);
    const r = osc(0.5, 'square', 880 + rnd() * 120); lowpass(r, 2400); r.env(perc(0.001, 14)); b.mix(r, at, 0.18);
  }
  const s = noise(0.4, 'white'); highpass(s, 2500); s.env(adsr(0.005, 0.05, 0.4, 0.2, 0.4)); b.mix(s, 0.06, 0.35);
  return b.drive(1.6).normalize(0.85);
});

// the crosshead coming down: a hydraulic groan sliding down in pitch, a pump knocking under it
defSound('st_hydro', (v) => {
  setSeed(7300 + v);
  const b = new Buf(1.7);
  const g = osc(1.6, 'saw', (t) => 92 - t * 22 + Math.sin(t * 31) * 2); lowpass(g, 520, 2); g.env(adsr(0.08, 0.2, 0.75, 0.5, 1.6)); b.mix(g, 0, 0.6);
  const w = osc(1.6, 'sine', (t) => 340 - t * 90); w.env(adsr(0.2, 0.2, 0.5, 0.6, 1.6)); b.mix(w, 0, 0.18);
  for (let i = 0; i < 7; i++) b.mix(thump(0.08, 120, 60, 40), i * 0.22, 0.22);
  const h = noise(1.6, 'pink'); bandpass(h, 1800, 0.8); h.env(adsr(0.1, 0.3, 0.4, 0.6, 1.6)); b.mix(h, 0, 0.18);
  return b.normalize(0.6);
});

// steam venting off the crown
defSound('st_steam', (v) => {
  setSeed(7400 + v * 3);
  const b = new Buf(1.2);
  const s = noise(1.1, 'white'); highpass(s, 1800); bandpass(s, (t) => 4200 - t * 1500, 0.6); s.env(adsr(0.01, 0.1, 0.6, 0.8, 1.1)); b.mix(s, 0, 0.8);
  b.mix(burst(0.05, 'white', 9000, 2000, 50), 0, 0.4);
  return b.normalize(0.5);
});

// the warning before it comes down: two tones, harsh, twice
defSound('st_alarm', () => {
  const b = new Buf(1.3);
  for (let i = 0; i < 4; i++) { const o = osc(0.26, 'square', i % 2 ? 620 : 830); lowpass(o, 3000); o.env(adsr(0.005, 0.02, 0.8, 0.04, 0.26)); b.mix(o, i * 0.3, 0.35); }
  return b.normalize(0.5);
});

// the stamp: a dead heavy blow, metal on metal through something soft, the crack of the bolt going through
defSound('st_stamp', (v) => {
  setSeed(7500 + v * 11);
  const b = new Buf(1.6);
  b.mix(thump(0.4, 110, 38, 7), 0, 1);
  b.mix(burst(0.12, 'white', 9000, 400, 30), 0, 0.9);
  b.mix(burst(0.25, 'brown', 900, 0, 12), 0.01, 0.8);
  // the crack
  for (let i = 0; i < 5; i++) b.mix(clickS(1800 + rnd() * 2400, 0.004), 0.012 + i * 0.006, 0.5);
  // the steel rings after
  for (const [f, a] of [[318, 0.3], [741, 0.2], [1530, 0.1]] as [number, number][]) { const r = osc(1.4, 'sine', f); r.env(perc(0.002, 3.2)); b.mix(r, 0.01, a); }
  return b.drive(2.2).normalize(0.95);
});

// the band boots: a relay click, a rising chirp, the tube's whine
defSound('st_boot', (v) => {
  setSeed(7600 + v);
  const b = new Buf(1.0);
  b.mix(clickS(2400, 0.01), 0, 0.5);
  const c = osc(0.3, 'square', (t) => 600 + t * 2200); lowpass(c, 4000); c.env(adsr(0.01, 0.05, 0.6, 0.1, 0.3)); b.mix(c, 0.05, 0.25);
  const w = osc(0.8, 'sine', 15600); w.env(adsr(0.2, 0.2, 0.4, 0.3, 0.8)); b.mix(w, 0.1, 0.05);
  b.mix(clickS(1800, 0.008), 0.42, 0.3);
  return b.normalize(0.5);
});
