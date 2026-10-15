// Creature sound pack C: the Still Lifes, the four 1990-expedition things
// (stammer, surveyor, plenum, gloam) and the dread layer's stingers (VHS
// stabs, tape stops, flashlight buzz). Registered through the public recipe
// hooks; every recipe is deterministic per variant.
import { defSound, defLoopSound, kit } from './sounds';
import { Buf, noise, osc, lowpass, highpass, bandpass, comb, decay, perc, adsr, voice, rnd } from './synth';

const { thump, burst, clickS } = kit;

/** a slow creak: wax or old joints taking weight */
function creak(len: number, f0: number, f1: number, rough = 40) {
  const b = new Buf(len);
  let t = 0;
  while (t < len - 0.01) {
    const f = f0 + (f1 - f0) * (t / len);
    b.mix(clickS(f * (0.9 + rnd() * 0.2), 0.004), t, 0.35 + rnd() * 0.4);
    t += 1 / (rough + rnd() * rough * 0.6);
  }
  bandpass(b, (f0 + f1) / 2, 1.1);
  comb(b, 1 / Math.max(80, f0), 0.45, 0.35);
  return b;
}
/** bone popping in sequence */
function cracks(n: number, gap: number, f = 2200) {
  const b = new Buf(n * gap + 0.2);
  for (let i = 0; i < n; i++) {
    const at = i * gap * (0.6 + rnd() * 0.8);
    b.mix(clickS(f * (0.7 + rnd() * 0.6), 0.008), at, 0.9);
    b.mix(thump(0.06, 500 + rnd() * 300, 200, 70), at, 0.4);
  }
  return b;
}

// ---------------------------------------------------------------- Still Lifes
defSound('still_creak', (v) => creak(0.55 + v * 0.05, 300 + v * 30, 180, 30).env(adsr(0.08, 0.1, 0.8, 0.2, 0.6)).normalize(0.35));
defSound('still_neck', (v) => {
  const b = creak(0.9, 220 + v * 20, 120, 22);
  b.mix(cracks(3 + (v % 3), 0.12, 1500), 0.15, 0.5);
  return b.env(adsr(0.12, 0.2, 0.8, 0.3, 0.95)).normalize(0.42);
});
defSound('still_crack', (v) => {
  // a wax cast splitting: a brittle snap, a hollow knock, a trickle of flakes
  const b = new Buf(0.8);
  b.mix(clickS(3400 + v * 200, 0.01), 0, 1);
  b.mix(thump(0.3, 260 + v * 20, 120, 18), 0.004, 0.8);
  comb(b, 1 / 340, 0.5, 0.4);
  for (let i = 0; i < 8; i++) b.mix(burst(0.02, 'white', 6000, 2500, 160), 0.1 + rnd() * 0.5, 0.15 + rnd() * 0.15);
  return b.normalize(0.6);
});
defSound('still_fall', () => {
  const b = new Buf(1.8);
  b.mix(creak(0.5, 260, 140, 26), 0, 0.5);
  b.mix(thump(0.9, 120, 38, 6), 0.5, 1);
  b.mix(burst(0.4, 'brown', 900, 40, 8), 0.5, 0.6);
  for (let i = 0; i < 14; i++) b.mix(burst(0.03, 'white', 5000, 1600, 120), 0.55 + rnd() * 0.9, 0.1 + rnd() * 0.2);
  return b.normalize(0.7);
});
defSound('still_choke', () => {
  // throat squeezed shut: a strangled gag, wax hands creaking tight
  const len = 2.2;
  const b = new Buf(len);
  const g = voice(1.6, (t) => 150 + Math.sin(t * 31) * 25 + t * 20, [[500, 1], [1100, 0.5], [2400, 0.25]], 0.65, 'saw');
  g.env((t) => (Math.max(0, Math.sin(t * 11)) * 0.7 + 0.3) * Math.min(1, t / 0.1) * Math.max(0, 1 - t / 1.6));
  b.mix(g.crush(7, 2), 0.05, 0.55);
  b.mix(creak(1.8, 380, 300, 50), 0, 0.45);
  const s = noise(1.2, 'pink'); bandpass(s, 1600, 3); s.env((t) => Math.max(0, Math.sin(t * 7)) * Math.exp(-t * 1.2)); b.mix(s, 0.2, 0.3);
  return b.normalize(0.65);
});
defSound('gasp_recover', () => {
  const b = new Buf(1.6);
  for (let i = 0; i < 3; i++) {
    const n = noise(0.42 - i * 0.05, 'pink'); bandpass(n, 900 - i * 120, 1.4); n.env(adsr(0.04, 0.1, 0.7, 0.18, 0.42 - i * 0.05));
    b.mix(n, i * 0.48, 0.8 - i * 0.18);
  }
  b.mix(voice(0.3, (t) => 190 - t * 60, [[700, 1], [1300, 0.4]], 0.8, 'saw').env(perc(0.02, 8)), 0.02, 0.25);
  return b.normalize(0.5);
});
/** quiet, close: you notice it moved */
defSound('still_moved', () => {
  const len = 2.6;
  const b = new Buf(len);
  for (const [f, g] of [[110, 0.4], [116.5, 0.35], [164.8, 0.2], [233, 0.12]] as [number, number][]) b.mix(osc(len, 'tri', (t) => f * (1 - t * 0.012)), 0, g);
  lowpass(b, 900);
  b.env((t) => Math.min(1, t / 0.05) * Math.exp(-t * 1.6));
  b.mix(creak(0.6, 240, 150, 24), 0.05, 0.4);
  return b.normalize(0.45);
});

// ---------------------------------------------------------------- dread layer: stingers and interference
/** a VHS stab: dissonant cluster that hits and tears */
defSound('dread_hit', (v) => {
  const len = 2.4;
  const b = new Buf(len);
  const root = 55 * Math.pow(2, (v % 4) / 12);
  for (const r of [1, 1.06, 1.41, 2.02, 2.83, 4.24]) b.mix(osc(len, 'saw', (t) => root * r * (1 - t * 0.03)), 0, 0.2);
  lowpass(b, (t) => 2400 * Math.exp(-t * 1.4) + 200);
  b.drive(2.4);
  b.env((t) => Math.min(1, t / 0.008) * Math.exp(-t * 1.2));
  const n = noise(0.5, 'white'); highpass(n, 3000); n.env(decay(10)); b.mix(n.crush(4, 6), 0, 0.35);
  return b.normalize(0.8);
});
/** a swelling cluster, rising as something comes closer */
defSound('dread_swell', () => {
  const len = 4;
  const b = new Buf(len);
  for (const f of [73.4, 77.8, 110, 155.6, 207.7]) b.mix(osc(len, 'saw', (t) => f * (1 + t * 0.02)), 0, 0.16);
  const n = noise(len, 'pink'); bandpass(n, (t) => 300 + t * 500, 0.8); b.mix(n, 0, 0.35);
  lowpass(b, (t) => 300 + t * 900);
  b.env((t) => Math.pow(Math.min(1, t / 3.6), 2.4) * (t > 3.7 ? Math.max(0, 1 - (t - 3.7) / 0.3) : 1));
  return b.normalize(0.6);
});
/** chase begins: a low pulse and a screech of tape */
defSound('dread_chase', (v) => {
  const len = 2.2;
  const b = new Buf(len);
  for (let i = 0; i < 4; i++) b.mix(thump(0.4, 90, 34, 9), i * 0.42, 1 - i * 0.12);
  const s = osc(1.2, 'saw', (t) => 1800 + v * 90 - t * 1200 + Math.sin(t * 60) * 80); bandpass(s, 2200, 2.5); s.env(adsr(0.02, 0.2, 0.6, 0.6, 1.2));
  b.mix(s.crush(6, 3), 0.05, 0.35);
  lowpass(b, 4500);
  return b.normalize(0.75);
});
/** tape slowing to a stop (time skipping) */
defSound('tape_stop', () => {
  const len = 1.1;
  const b = osc(len, 'saw', (t) => 220 * Math.max(0.05, 1 - t / len));
  b.mix(osc(len, 'saw', (t) => 330 * Math.max(0.05, 1 - t / len)), 0, 0.6);
  lowpass(b, (t) => 3000 * Math.max(0.05, 1 - t / len));
  b.env((t) => Math.max(0, 1 - t / len));
  return b.normalize(0.4);
});
/** a flashlight browning out: filament buzz and contact clicks */
defSound('flicker_buzz', (v) => {
  const b = new Buf(0.7);
  const hum = osc(0.6, 'square', 120 + v * 5); lowpass(hum, 900); hum.env((t) => (Math.sin(t * 90) > 0 ? 0.6 : 0.15) * Math.exp(-t * 3));
  b.mix(hum, 0, 0.4);
  for (let i = 0; i < 5; i++) b.mix(clickS(2400 + rnd() * 1200, 0.006), rnd() * 0.5, 0.5);
  return b.normalize(0.32);
});

// ---------------------------------------------------------------- Stammer (the tall figure that skips frames)
defSound('stammer_click', (v) => {
  // a projector gate jumping: dry rapid clicks in uneven bursts
  const b = new Buf(0.6);
  let t = 0;
  for (let i = 0; i < 6 + (v % 4); i++) { b.mix(clickS(900 + rnd() * 500, 0.006), t, 0.8); b.mix(thump(0.03, 300, 120, 120), t, 0.3); t += 0.035 + (i % 3 === 2 ? 0.09 : 0) + rnd() * 0.02; }
  return b.normalize(0.45);
});
defSound('stammer_unfold', () => {
  // long arms unfolding: a run of joints cracking open, and a stretched groan of gristle
  const b = new Buf(1.6);
  b.mix(cracks(9, 0.11, 1600), 0, 0.8);
  b.mix(creak(1.3, 160, 70, 18), 0.1, 0.6);
  return b.normalize(0.65);
});
defSound('stammer_shriek', (v) => {
  const b = voice(1.1, (t) => 420 + v * 30 + Math.sin(t * 9) * 40 - t * 180, [[1100, 1], [2600, 0.8], [4200, 0.4]], 0.45, 'saw');
  b.env(adsr(0.01, 0.1, 0.8, 0.4, 1.1));
  // chopped like dropped frames
  b.env((t) => (Math.floor(t * 23) % 3 === 1 ? 0.08 : 1));
  return b.drive(2.6).crush(6, 2).normalize(0.7);
});
defSound('stammer_step', (v) => {
  const b = burst(0.12, 'pink', 1400 + v * 80, 200, 40);
  b.mix(clickS(700 + v * 40, 0.01), 0, 0.3);
  return b.normalize(0.35);
});
defSound('stammer_die', () => {
  const b = new Buf(2.0);
  b.mix(cracks(14, 0.07, 1300), 0, 0.8);
  b.mix(thump(0.8, 100, 34, 5), 0.9, 1);
  const n = noise(1.2, 'pink'); bandpass(n, 400, 1); n.env(decay(3)); b.mix(n, 0.9, 0.4);
  return b.normalize(0.7);
});

// ---------------------------------------------------------------- Surveyor (the thing in the hazmat suit)
/** a radio voice that is almost words: a crackle, a carrier, syllables in the noise */
defSound('surveyor_radio', (v) => {
  const len = 2.4;
  const b = new Buf(len);
  b.mix(clickS(1500, 0.02), 0, 0.6);
  const sy = 4 + (v % 4);
  let t = 0.15;
  for (let i = 0; i < sy; i++) {
    const d = 0.14 + rnd() * 0.16;
    const f0 = 130 + rnd() * 40;
    const s = voice(d, (tt) => f0 * (1 + Math.sin(tt * 18) * 0.05) - tt * 40, [[600 + rnd() * 500, 1], [1500 + rnd() * 700, 0.6], [2600, 0.3]], 0.3, 'saw');
    s.env(adsr(0.02, 0.04, 0.8, 0.05, d));
    b.mix(s, t, 0.8);
    t += d + (i % 3 === 2 ? 0.25 : 0.04);
  }
  const hiss = noise(len, 'white'); bandpass(hiss, 2200, 0.7); b.mix(hiss, 0, 0.25);
  bandpass(b, 1400, 0.6);
  b.drive(3);
  b.mix(clickS(1300, 0.02), Math.min(len - 0.1, t + 0.05), 0.6);
  return b.crush(6, 3).normalize(0.55);
});
defLoopSound('surveyor_breath', () => {
  // respirator: inhale valve, exhale valve, a wet catch that should not be there
  const len = 3.2;
  const b = new Buf(len);
  const inh = noise(1.1, 'pink'); bandpass(inh, 700, 1.6); inh.env(adsr(0.25, 0.3, 0.7, 0.4, 1.1));
  const exh = noise(1.3, 'pink'); bandpass(exh, 450, 1.2); exh.env(adsr(0.15, 0.3, 0.6, 0.6, 1.3));
  b.mix(inh, 0.1, 0.8); b.mix(clickS(2000, 0.008), 1.25, 0.4); b.mix(exh, 1.4, 0.9); b.mix(clickS(1600, 0.008), 2.75, 0.3);
  const gurgle = noise(0.4, 'brown'); bandpass(gurgle, (t) => 200 + Math.sin(t * 60) * 80, 3); gurgle.env(perc(0.05, 6)); b.mix(gurgle, 2.2, 0.35);
  b.fade(0.05, 0.05);
  return b.normalize(0.4);
});
defSound('surveyor_tether', (v) => {
  // rope dragging over carpet / concrete, snagging
  const b = noise(0.9, 'pink'); bandpass(b, 800 + v * 60, 1.2);
  b.env((t) => (0.4 + Math.max(0, Math.sin(t * 13)) * 0.6) * Math.min(1, t / 0.1) * Math.max(0, 1 - t / 0.9));
  return b.normalize(0.32);
});
defSound('surveyor_scream', () => {
  // the suit's speaker overdriven by something that is not a voice
  const b = voice(1.4, (t) => 90 + Math.sin(t * 7) * 15 + t * 30, [[500, 1], [900, 0.8], [2400, 0.6]], 0.6, 'square');
  b.env(adsr(0.03, 0.2, 0.9, 0.4, 1.4));
  bandpass(b, 1300, 0.5);
  const s = noise(1.4, 'white'); highpass(s, 3000); s.env(decay(2)); b.mix(s, 0, 0.3);
  return b.drive(4).crush(5, 4).normalize(0.75);
});
defSound('surveyor_hurt', () => {
  const b = new Buf(0.7);
  b.mix(burst(0.15, 'white', 4000, 800, 30), 0, 0.7); // rubberised fabric tearing
  b.mix(voice(0.4, (t) => 110 - t * 40, [[500, 1], [1200, 0.5]], 0.4, 'square').env(perc(0.02, 7)), 0.03, 0.5);
  bandpass(b, 1500, 0.6);
  return b.drive(2).normalize(0.55);
});
defSound('surveyor_die', () => {
  const b = new Buf(2.4);
  b.mix(clickS(1500, 0.02), 0, 0.6);
  const hiss = noise(2.2, 'white'); bandpass(hiss, 2000, 0.6); hiss.env((t) => Math.exp(-t * 1.2)); b.mix(hiss, 0.05, 0.6);
  b.mix(thump(0.7, 110, 36, 6), 0.4, 1);
  const g = noise(1.0, 'brown'); bandpass(g, (t) => 220 + Math.sin(t * 50) * 90, 3); g.env(decay(2.5)); b.mix(g, 0.6, 0.6);
  return b.normalize(0.65);
});

// ---------------------------------------------------------------- Plenum (the many-jointed thing in the ceiling)
defSound('plenum_tile', (v) => {
  // a ceiling tile lifting / falling: a dry slap and grit
  const b = new Buf(0.9);
  b.mix(burst(0.12, 'pink', 2200 + v * 100, 300, 30), 0, 0.9);
  b.mix(thump(0.2, 220, 90, 20), 0, 0.5);
  for (let i = 0; i < 10; i++) b.mix(burst(0.02, 'white', 7000, 2500, 180), 0.04 + rnd() * 0.6, 0.12 + rnd() * 0.15);
  return b.normalize(0.55);
});
defSound('plenum_skitter', (v) => {
  // many hard joints, too many legs, moving at once
  const b = new Buf(0.9);
  for (let i = 0; i < 26; i++) b.mix(clickS(1800 + rnd() * 2400, 0.004), (i / 26) * 0.8 + rnd() * 0.02, 0.3 + rnd() * 0.5);
  comb(b, 1 / (420 + v * 30), 0.4, 0.3);
  return b.normalize(0.5);
});
defSound('plenum_shriek', () => {
  const b = voice(0.9, (t) => 800 + Math.sin(t * 120) * 200 - t * 300, [[2100, 1], [3400, 0.7]], 0.4, 'saw');
  b.env(adsr(0.005, 0.1, 0.7, 0.3, 0.9));
  b.mix(cracks(6, 0.06, 2400), 0, 0.6);
  return b.drive(2.2).normalize(0.7);
});
defSound('plenum_drop', () => {
  const b = new Buf(1.2);
  b.mix(burst(0.15, 'pink', 2400, 300, 25), 0, 0.8);
  b.mix(thump(0.4, 160, 50, 10), 0.32, 1);
  b.mix(cracks(8, 0.04, 2000), 0.33, 0.6);
  return b.normalize(0.75);
});
defSound('plenum_die', () => {
  const b = new Buf(1.6);
  b.mix(cracks(18, 0.05, 1800), 0, 0.9);
  b.mix(burst(0.6, 'brown', 600, 40, 5), 0.2, 0.6);
  return b.normalize(0.65);
});

// ---------------------------------------------------------------- Gloam (eyes and teeth in the dark)
defLoopSound('gloam_breath', () => {
  const len = 2.8;
  const b = new Buf(len);
  const a = noise(1.1, 'brown'); bandpass(a, 260, 1.4); a.env(adsr(0.3, 0.2, 0.8, 0.4, 1.1));
  const c = noise(1.2, 'brown'); bandpass(c, 190, 1.2); c.env(adsr(0.2, 0.3, 0.7, 0.5, 1.2));
  b.mix(a, 0.1, 0.9); b.mix(c, 1.4, 1);
  const wet = noise(0.3, 'pink'); bandpass(wet, 1300, 4); wet.env(perc(0.02, 12)); b.mix(wet, 1.35, 0.3);
  b.fade(0.05, 0.05);
  return b.normalize(0.4);
});
defSound('gloam_click', (v) => {
  // teeth meeting, many of them, slowly
  const b = new Buf(0.8);
  for (let i = 0; i < 3 + (v % 3); i++) { const at = i * (0.12 + rnd() * 0.08); b.mix(clickS(2600 + rnd() * 900, 0.006), at, 0.8); b.mix(thump(0.04, 900, 400, 90), at, 0.3); }
  return b.normalize(0.42);
});
defSound('gloam_hiss', () => {
  const b = noise(1.0, 'white'); bandpass(b, 3200, 0.8); b.env(adsr(0.02, 0.2, 0.6, 0.6, 1.0));
  b.mix(voice(0.6, (t) => 70 - t * 20, [[300, 1], [700, 0.5]], 0.7, 'saw').env(perc(0.05, 4)), 0, 0.5);
  return b.normalize(0.55);
});
defSound('gloam_bite', () => {
  const b = new Buf(0.6);
  b.mix(clickS(3000, 0.01), 0, 1); b.mix(clickS(2500, 0.01), 0.012, 0.9);
  b.mix(thump(0.2, 300, 100, 25), 0, 0.7);
  const w = noise(0.3, 'pink'); bandpass(w, 1100, 2); w.env(decay(14)); b.mix(w, 0.02, 0.6);
  return b.normalize(0.7);
});
defSound('gloam_die', () => {
  const b = new Buf(1.8);
  b.mix(voice(1.2, (t) => 120 - t * 60, [[400, 1], [900, 0.6]], 0.6, 'saw').env(adsr(0.05, 0.3, 0.6, 0.6, 1.2)), 0, 0.7);
  for (let i = 0; i < 6; i++) b.mix(clickS(2400 + rnd() * 600, 0.006), 0.2 + i * 0.15, 0.4);
  lowpass(b, 2400);
  return b.normalize(0.6);
});
void perc; void decay; void highpass;
