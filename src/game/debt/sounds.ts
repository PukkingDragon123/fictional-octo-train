// Sound recipes for the debt contract: the hopper (weigh, scan, pneumatic
// thunk, reject buzzer, tally counter), the BAILIFF band (warning beep,
// shock, detonation) and the transport ending (kiosk printer, coach horn and
// engine, lift cable, the quiet car). Synthesised on first use.
import { defSound, defLoopSound, kit } from '../../audio/sounds';
import { Buf, noise, osc, lowpass, highpass, bandpass, comb, decay, perc, adsr, rnd, setSeed } from '../../audio/synth';

const { thump, burst, clickS } = kit;

// ---------------------------------------------------------------- the hopper
/** the plate takes the weight: a spring groan, the needle rattling up its scale */
defSound('hopper_weigh', (v) => {
  setSeed(9100 + v * 7);
  const b = new Buf(1.2);
  const groan = osc(0.9, 'saw', (t) => 70 + t * 40 + Math.sin(t * 30) * 6); lowpass(groan, 420); groan.env(adsr(0.05, 0.2, 0.6, 0.4, 0.9));
  b.mix(groan, 0, 0.35);
  const spring = osc(0.7, 'sine', (t) => 180 + Math.sin(t * 44) * 30 * Math.exp(-t * 3)); spring.env(decay(5));
  b.mix(spring, 0.05, 0.25);
  for (let i = 0; i < 9; i++) b.mix(clickS(2400 + rnd() * 800, 0.008), 0.15 + i * 0.07 + rnd() * 0.02, 0.18 + i * 0.02);
  b.mix(thump(0.2, 160, 70, 24), 0, 0.6);
  return b.normalize(0.6);
});
/** the scan line passes: a rising electronic sweep with a buzzing edge */
defSound('hopper_scan', () => {
  setSeed(9201);
  const b = new Buf(1.1);
  const sw = osc(1.0, 'saw', (t) => 300 + t * 1400); bandpass(sw, (t) => 600 + t * 2800, 2.5); sw.env(adsr(0.04, 0.2, 0.7, 0.3, 1.0));
  b.mix(sw, 0, 0.5);
  const hum = osc(1.0, 'square', 120); lowpass(hum, 700); hum.env(adsr(0.02, 0.1, 0.4, 0.4, 1.0));
  b.mix(hum, 0, 0.18);
  for (let i = 0; i < 6; i++) b.mix(osc(0.03, 'sine', 3200 + i * 300).env(decay(90)), 0.12 + i * 0.13, 0.25);
  return b.normalize(0.55);
});
/** what is on the plate drops away: hydraulic hiss, a heavy steel thunk, a suction gulp down the chute */
defSound('hopper_thunk', (v) => {
  setSeed(9300 + v * 11);
  const b = new Buf(1.6);
  const hiss = noise(0.5, 'white'); highpass(hiss, 2500); hiss.env(adsr(0.01, 0.08, 0.4, 0.3, 0.5));
  b.mix(hiss, 0, 0.35);
  b.mix(thump(0.5, 110, 38, 9), 0.08, 1.0);
  const clang = osc(0.6, 'sine', 610 + v * 20).env(decay(9)); comb(clang, 0.0031, 0.55, 0.4);
  b.mix(clang, 0.08, 0.3);
  const gulp = noise(0.9, 'brown'); lowpass(gulp, (t) => 900 - t * 700); gulp.env(adsr(0.1, 0.2, 0.6, 0.5, 0.9));
  b.mix(gulp, 0.2, 0.6);
  const whoosh = noise(0.7, 'pink'); bandpass(whoosh, (t) => 1400 - t * 1100, 1.2); whoosh.env(perc(0.15, 4));
  b.mix(whoosh, 0.25, 0.4);
  return b.drive(1.3).normalize(0.85);
});
/** rejected: a flat two-tone buzzer */
defSound('hopper_reject', () => {
  const b = new Buf(0.7);
  for (let i = 0; i < 2; i++) { const z = osc(0.26, 'square', 140 - i * 30); lowpass(z, 1200); z.env(adsr(0.005, 0.05, 0.8, 0.05, 0.26)); b.mix(z, i * 0.32, 0.6); }
  return b.normalize(0.5);
});
/** the counter rolls over: mechanical ticks and a bell */
defSound('hopper_tally', (v) => {
  setSeed(9500 + v);
  const b = new Buf(1.4);
  for (let i = 0; i < 16; i++) { const t = i * 0.055 * (1 + i * 0.02); b.mix(clickS(1800 + rnd() * 500, 0.01), t, 0.3); b.mix(thump(0.03, 900, 500, 120), t, 0.12); }
  const bell = osc(1.0, 'sine', 1320).env(decay(4)); const bell2 = osc(1.0, 'sine', 1980).env(decay(6));
  b.mix(bell, 0.95, 0.3); b.mix(bell2, 0.95, 0.12);
  return b.normalize(0.5);
});

// ---------------------------------------------------------------- the band
/** a hard, close warning beep (pitch rises with v) */
defSound('band_beep', (v) => {
  const f = 2100 + v * 180;
  const b = new Buf(0.14);
  const s = osc(0.12, 'square', f); lowpass(s, 5200); s.env(adsr(0.002, 0.02, 0.8, 0.03, 0.12));
  b.mix(s, 0, 0.5);
  b.mix(osc(0.12, 'sine', f * 2).env(decay(30)), 0, 0.15);
  return b.normalize(0.55);
});
/** a long armed tone: the countdown has started */
defSound('band_arm_tone', () => {
  const b = new Buf(0.9);
  const s = osc(0.85, 'square', (t) => 1500 + t * 900); lowpass(s, 4000); s.env(adsr(0.01, 0.1, 0.8, 0.2, 0.85));
  b.mix(s, 0, 0.45);
  return b.normalize(0.5);
});
/** current through the wrist: crackle, buzz, a wet jolt */
defSound('band_shock', (v) => {
  setSeed(9700 + v * 5);
  const b = new Buf(1.1);
  const buzz = osc(0.9, 'saw', (t) => 60 + Math.sin(t * 90) * 8); highpass(buzz, 120); buzz.env(adsr(0.005, 0.1, 0.8, 0.3, 0.9));
  b.mix(buzz, 0, 0.5);
  for (let i = 0; i < 40; i++) { const c = burst(0.012, 'white', 9000, 2000, 300); b.mix(c, rnd() * 0.85, 0.3 + rnd() * 0.5); }
  const zap = noise(0.9, 'white'); bandpass(zap, 3400, 3); zap.env((t) => (Math.sin(t * 140) > 0.2 ? 1 : 0.2) * Math.exp(-t * 2.5));
  b.mix(zap, 0, 0.35);
  return b.drive(2.4).normalize(0.85);
});
/** the charge: a sharp crack, a deep body blow, a wet tear, debris pattering down */
defSound('band_boom', (v) => {
  setSeed(9800 + v * 3);
  const b = new Buf(2.6);
  const crack = noise(0.08, 'white'); crack.env(perc(0.001, 60)); b.mix(crack, 0, 1.0);
  b.mix(thump(1.2, 120, 28, 3.2), 0, 1.0);
  const body = noise(1.6, 'brown'); lowpass(body, (t) => 1800 * Math.exp(-t * 2) + 120); body.env(perc(0.004, 2.2));
  b.mix(body, 0.002, 1.0);
  const tear = noise(0.4, 'pink'); bandpass(tear, 900, 1.5); tear.env(perc(0.01, 9)); b.mix(tear, 0.03, 0.5);
  for (let i = 0; i < 14; i++) b.mix(burst(0.03, 'white', 5000, 900, 120), 0.5 + rnd() * 1.6, 0.06 + rnd() * 0.12);
  return b.drive(2.0).normalize(0.95);
});
/** ears ringing after the blast (local) */
defSound('band_tinnitus', () => {
  const b = new Buf(4.0);
  const t = osc(4, 'sine', 4150); t.env((x) => Math.min(1, x * 8) * Math.exp(-x * 0.7));
  b.mix(t, 0, 0.5);
  return b.normalize(0.25);
});

// ---------------------------------------------------------------- the ending
defSound('kiosk_print', () => {
  setSeed(9901);
  const b = new Buf(1.6);
  for (let line = 0; line < 4; line++) for (let i = 0; i < 18; i++) b.mix(clickS(1100 + rnd() * 300, 0.006), line * 0.33 + i * 0.016, 0.35);
  const feed = osc(0.3, 'saw', 160); lowpass(feed, 600); feed.env(adsr(0.02, 0.05, 0.6, 0.1, 0.3)); b.mix(feed, 1.3, 0.3);
  return b.normalize(0.55);
});
defSound('kiosk_accept', () => {
  const b = new Buf(0.6);
  b.mix(osc(0.12, 'sine', 880).env(decay(18)), 0, 0.5); b.mix(osc(0.25, 'sine', 1320).env(decay(10)), 0.12, 0.5);
  return b.normalize(0.5);
});
defSound('coach_horn', () => {
  const b = new Buf(1.3);
  for (const f of [233, 294]) { const h = osc(1.2, 'saw', f); lowpass(h, 1600); h.env(adsr(0.03, 0.1, 0.85, 0.15, 1.2)); b.mix(h, 0, 0.5); }
  return b.drive(1.6).normalize(0.75);
});
defLoopSound('coach_idle', () => {
  setSeed(9950);
  const b = new Buf(2.0);
  const e = osc(2.0, 'saw', (t) => 38 + Math.sin(t * Math.PI * 2 * 3) * 1.5); lowpass(e, 260);
  b.mix(e, 0, 0.6);
  const rum = noise(2.0, 'brown'); lowpass(rum, 180); b.mix(rum, 0, 0.5);
  return b.normalize(0.6);
});
defSound('coach_doors', () => {
  const b = new Buf(1.2);
  const hiss = noise(0.7, 'white'); highpass(hiss, 1800); hiss.env(adsr(0.01, 0.1, 0.6, 0.3, 0.7)); b.mix(hiss, 0, 0.5);
  b.mix(thump(0.2, 220, 90, 20), 0.75, 0.6);
  return b.normalize(0.6);
});
defSound('lift_rise', () => {
  setSeed(9960);
  const b = new Buf(4.0);
  const whine = osc(4.0, 'saw', (t) => 90 + t * 25); lowpass(whine, 700); whine.env(adsr(0.4, 0.5, 0.8, 0.8, 4));
  b.mix(whine, 0, 0.45);
  for (let i = 0; i < 12; i++) b.mix(thump(0.08, 300, 120, 30), i * 0.31 + rnd() * 0.05, 0.25); // cable clatter
  b.mix(thump(0.4, 120, 40, 8), 3.6, 0.9);
  return b.normalize(0.7);
});
defSound('carriage_glide', () => {
  setSeed(9970);
  const b = new Buf(4.5);
  const hum = osc(4.5, 'sine', 55); hum.env(adsr(1.0, 0.5, 0.8, 1.5, 4.5)); b.mix(hum, 0, 0.5);
  const air = noise(4.5, 'pink'); lowpass(air, 900); air.env(adsr(1.2, 0.5, 0.6, 1.5, 4.5)); b.mix(air, 0, 0.4);
  // and, faintly, a music box from inside
  const notes = [76, 79, 83, 81, 79, 76, 74, 76];
  notes.forEach((m, i) => { const f = 440 * Math.pow(2, (m - 69) / 12); b.mix(osc(0.6, 'sine', f).env(decay(5)), 1.0 + i * 0.4, 0.12); });
  return b.normalize(0.6);
});

void highpass;
