// Creature sound pack D: the dimension creatures (bubbles, chess pieces, moon
// things) and the rule-bound ones (tallyman, mirrorling, lintel, tithe, hush,
// cowerling). Deterministic recipes per variant, registered by key.
import { defSound, defLoopSound, kit } from './sounds';
import { Buf, noise, osc, lowpass, highpass, bandpass, comb, decay, perc, adsr, voice, rnd } from './synth';

const { thump, burst, clickS } = kit;
const chirp = (len: number, f0: number, f1: number, k = 8) => osc(len, 'sine', (t) => f0 + (f1 - f0) * (t / len)).env(perc(0.005, k));

// ---------------------------------------------------------------- bubbles
defSound('bubble_pop', (v) => {
  const b = new Buf(0.5);
  b.mix(chirp(0.05, 900 + v * 120, 2600, 60), 0, 0.9);
  b.mix(burst(0.08, 'white', 9000, 2500, 50), 0, 0.6);
  const s = noise(0.35, 'pink'); bandpass(s, 700, 1.4); s.env(decay(12)); b.mix(s, 0.02, 0.5); // the goo
  return b.normalize(0.6);
});
defSound('bubble_wob', (v) => { const b = osc(0.6, 'sine', (t) => 180 + v * 20 + Math.sin(t * 40) * 50); b.env(adsr(0.05, 0.2, 0.5, 0.3, 0.6)); lowpass(b, 900); return b.normalize(0.3); });
defLoopSound('bubble_drift', () => { const b = osc(2, 'sine', (t) => 140 + Math.sin(t * Math.PI * 3) * 30); b.mix(osc(2, 'sine', (t) => 213 + Math.sin(t * Math.PI * 2) * 20), 0, 0.5); b.env((t) => 0.6 + 0.4 * Math.sin(t * Math.PI)); return b.normalize(0.16); });
defSound('bubble_squeak', (v) => { const b = new Buf(0.4); b.mix(chirp(0.12, 1400 + v * 100, 2400, 14), 0, 0.8); b.mix(chirp(0.1, 1800, 1200, 18), 0.13, 0.6); return b.normalize(0.42); });
defSound('bubble_inflate', () => { const b = noise(1.2, 'pink'); bandpass(b, (t) => 300 + t * 1400, 4); b.env((t) => Math.min(1, t / 1.1)); b.mix(osc(1.2, 'sine', (t) => 200 + t * 600).env((t) => t / 1.2), 0, 0.4); return b.normalize(0.45); });

// ---------------------------------------------------------------- chess
defSound('chess_tick', (v) => { const b = new Buf(0.35); b.mix(clickS(2200 + v * 80, 0.012), 0, 1); b.mix(thump(0.12, 900, 400, 50), 0, 0.5); comb(b, 1 / 900, 0.4, 0.3); return b.normalize(0.4); });
defSound('chess_slide', () => { const b = noise(0.7, 'brown'); bandpass(b, 260, 1.2); b.env(adsr(0.03, 0.1, 0.8, 0.25, 0.7)); b.mix(noise(0.7, 'white').env(decay(4)), 0, 0.08); return b.normalize(0.55); });
defSound('chess_land', (v) => { const b = new Buf(0.9); b.mix(thump(0.6, 160 + v * 10, 45, 7), 0, 1); b.mix(clickS(1600, 0.02), 0, 0.6); b.mix(burst(0.3, 'brown', 900, 60, 10), 0, 0.5); comb(b, 1 / 220, 0.35, 0.2); return b.normalize(0.75); });
defSound('chess_take', () => { const b = new Buf(1.2); b.mix(thump(0.6, 120, 40, 6), 0, 1); b.mix(burst(0.4, 'white', 4000, 400, 9), 0.01, 0.6); for (let i = 0; i < 5; i++) b.mix(clickS(1800 + rnd() * 1600, 0.01), 0.05 + rnd() * 0.3, 0.4); return b.normalize(0.8); });
defSound('chess_grind', () => { const b = noise(1.0, 'brown'); bandpass(b, (t) => 120 + Math.sin(t * 9) * 40, 2); b.env(adsr(0.1, 0.2, 0.7, 0.4, 1)); return b.normalize(0.45); });

// ---------------------------------------------------------------- moon
defLoopSound('wisp_hum', () => { const b = osc(2, 'sine', (t) => 330 + Math.sin(t * Math.PI * 4) * 8); b.mix(osc(2, 'sine', 495), 0, 0.4); b.mix(osc(2, 'tri', 660 + 3), 0, 0.15); b.env((t) => 0.7 + 0.3 * Math.sin(t * Math.PI * 2)); return b.normalize(0.14); });
defSound('wisp_drink', () => { const b = osc(1.0, 'sine', (t) => 900 * Math.exp(-t * 2.2) + 120); b.env(perc(0.02, 3)); const s = noise(1.0, 'white'); bandpass(s, (t) => 4000 - t * 3000, 3); s.env(decay(4)); b.mix(s, 0, 0.4); return b.normalize(0.5); });
defSound('wisp_chime', (v) => { const b = new Buf(1.4); [1, 2.76, 5.4].forEach((r, j) => b.mix(osc(1.4, 'sine', (520 + v * 40) * r).env(decay(3 + j * 3)), 0, 0.5 / (j + 1))); return b.normalize(0.35); });
defSound('strider_charge', () => { const b = noise(0.7, 'brown'); lowpass(b, 400); b.env((t) => Math.min(1, t / 0.6)); b.mix(voice(0.7, (t) => 60 + t * 50, [[400, 1], [900, 0.4]], 0.5, 'saw').env((t) => t / 0.7), 0, 0.5); return b.normalize(0.55); });
defSound('strider_land', (v) => { const b = new Buf(1.0); b.mix(thump(0.8, 90 + v * 8, 30, 5), 0, 1); b.mix(burst(0.6, 'pink', 1200, 80, 5), 0, 0.6); return b.normalize(0.8); });
defSound('strider_call', () => { const b = voice(1.4, (t) => 140 - t * 60 + Math.sin(t * 30) * 6, [[500, 1], [1200, 0.5], [2600, 0.2]], 0.3, 'saw'); b.env(adsr(0.1, 0.3, 0.6, 0.6, 1.4)); comb(b, 1 / 70, 0.5, 0.4); return b.normalize(0.45); });
defSound('strider_die', () => { const b = voice(1.6, (t) => 120 * Math.exp(-t), [[400, 1], [900, 0.4]], 0.6, 'saw'); b.env(adsr(0.05, 0.4, 0.5, 0.8, 1.6)); return b.normalize(0.5); });

// ---------------------------------------------------------------- tallyman: beads on wire
defSound('tally_click', (v) => {
  // pitch climbs with the count (variant = bead number band)
  const f = 1100 + v * 160;
  const b = new Buf(0.25);
  b.mix(clickS(f, 0.01), 0, 1); b.mix(clickS(f * 1.5, 0.008), 0.03, 0.6);
  comb(b, 1 / (f / 3), 0.5, 0.4);
  return b.normalize(0.4 + v * 0.03);
});
defSound('tally_thirteen', () => { const b = new Buf(1.6); for (let i = 0; i < 13; i++) b.mix(clickS(1200 + i * 90, 0.01), i * 0.05, 0.6); b.mix(voice(1.0, (t) => 90 + t * 30, [[600, 1], [1400, 0.4]], 0.6, 'saw').env(perc(0.05, 2)), 0.6, 0.6); return b.normalize(0.65); });
defSound('tally_step', () => { const b = new Buf(0.3); b.mix(clickS(700, 0.02), 0, 0.8); b.mix(thump(0.15, 300, 120, 30), 0, 0.5); return b.normalize(0.3); });

// ---------------------------------------------------------------- mirrorling
defLoopSound('mirror_hum', () => { const b = osc(2, 'sine', 880); b.mix(osc(2, 'sine', 884), 0, 0.9); b.mix(osc(2, 'sine', 1320), 0, 0.2); return b.normalize(0.08); });
defSound('mirror_crack', (v) => { const b = new Buf(0.8); for (let i = 0; i < 6; i++) b.mix(clickS(3000 + rnd() * 3000, 0.006), i * 0.012, 0.8); b.mix(osc(0.7, 'sine', 1900 + v * 200).env(decay(6)), 0, 0.3); return b.normalize(0.6); });
defSound('mirror_shatter', () => { const b = new Buf(1.6); b.mix(burst(0.8, 'white', 12000, 2500, 5), 0, 0.8); for (let i = 0; i < 24; i++) b.mix(osc(0.3, 'sine', 2500 + rnd() * 5000).env(decay(18)), rnd() * 1.1, 0.25); return b.normalize(0.75); });

// ---------------------------------------------------------------- lintel: a door frame that wants you
defSound('lintel_rattle', (v) => { const b = new Buf(1.0); for (let i = 0; i < 9; i++) { b.mix(thump(0.08, 260 + v * 10, 120, 40), i * 0.09 + rnd() * 0.02, 0.8); b.mix(clickS(900 + rnd() * 400, 0.01), i * 0.09, 0.4); } return b.normalize(0.55); });
defSound('lintel_slam', () => { const b = new Buf(0.9); b.mix(thump(0.5, 140, 40, 8), 0, 1); b.mix(burst(0.2, 'brown', 1800, 100, 18), 0, 0.7); comb(b, 1 / 180, 0.4, 0.3); return b.normalize(0.85); });
defSound('lintel_creak', () => { const b = new Buf(1.1); let t = 0; while (t < 1.0) { b.mix(clickS(220 + t * 120, 0.004), t, 0.5); t += 1 / (30 + rnd() * 20); } bandpass(b, 400, 1.4); return b.normalize(0.4); });

// ---------------------------------------------------------------- tithe: coins and paper
defSound('tithe_jingle', (v) => { const b = new Buf(0.7); for (let i = 0; i < 7; i++) { const f = 2600 + rnd() * 2000 + v * 50; b.mix(osc(0.25, 'sine', f).env(decay(22)), rnd() * 0.4, 0.4); b.mix(osc(0.25, 'sine', f * 2.4).env(decay(30)), rnd() * 0.4, 0.15); } return b.normalize(0.45); });
defSound('tithe_chew', () => { const b = new Buf(1.0); for (let i = 0; i < 6; i++) { b.mix(burst(0.06, 'white', 3000, 500, 40), i * 0.15, 0.5); b.mix(osc(0.08, 'sine', 3200 + rnd() * 900).env(decay(40)), i * 0.15 + 0.02, 0.3); } return b.normalize(0.45); });
defSound('tithe_print', () => { const b = noise(0.9, 'white'); bandpass(b, (t) => 2200 + Math.sin(t * 80) * 400, 3); b.env((t) => (Math.floor(t * 28) % 2 ? 0.9 : 0.4) * Math.min(1, (0.9 - t) * 4)); return b.normalize(0.4); });
defSound('tithe_growl', () => { const b = voice(0.9, (t) => 70 + Math.sin(t * 25) * 8, [[300, 1], [700, 0.5]], 0.7, 'saw'); b.env(adsr(0.05, 0.2, 0.7, 0.3, 0.9)); return b.normalize(0.5); });

// ---------------------------------------------------------------- hush
defSound('hush_shh', (v) => { const b = noise(1.4, 'white'); highpass(b, 2400); bandpass(b, 4200 + v * 300, 0.8); b.env(adsr(0.25, 0.3, 0.7, 0.6, 1.4)); return b.normalize(0.4); });
defSound('hush_shriek', () => { const b = voice(0.9, (t) => 420 + t * 300, [[1200, 1], [2600, 0.7], [4000, 0.3]], 0.5, 'saw'); b.env(perc(0.03, 3)); b.drive(2); return b.normalize(0.6); });
defSound('hush_inhale', () => { const b = noise(1.2, 'pink'); bandpass(b, (t) => 600 + t * 900, 2); b.env((t) => Math.min(1, t / 1.0) * 0.8); b.reverse(); return b.normalize(0.35); });

// ---------------------------------------------------------------- cowerling
defSound('cower_squeak', (v) => { const b = new Buf(0.35); b.mix(chirp(0.08, 2400 + v * 150, 3400, 20), 0, 1); b.mix(chirp(0.06, 3200, 2600, 30), 0.1, 0.6); return b.normalize(0.38); });
defSound('cower_beg', (v) => { const b = new Buf(0.9); for (let i = 0; i < 3; i++) b.mix(voice(0.2, (t) => 520 + v * 30 + i * 40 - t * 300, [[1200, 1], [2600, 0.5]], 0.2, 'tri').env(perc(0.01, 10)), i * 0.25, 0.6); return b.normalize(0.35); });
defSound('cower_die', () => { const b = voice(0.7, (t) => 600 - t * 500, [[1400, 1], [2800, 0.4]], 0.3, 'tri'); b.env(perc(0.01, 4)); return b.normalize(0.4); });
