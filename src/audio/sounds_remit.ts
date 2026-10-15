// Sound recipes for the Remittance Programme: the processing-wing intro
// (src/game/intro.ts), the Seam (src/game/seam.ts), the BAILIFF fitting and
// Staff Sergeant Voss's projector and radio (src/game/handler.ts). Registered
// through the public recipe hooks; synthesised on first use.
import { defSound, defLoopSound, kit } from './sounds';
import { Buf, noise, osc, lowpass, highpass, bandpass, comb, decay, perc, adsr, voice, rnd, setSeed, SR } from './synth';

const { thump, burst, clickS } = kit;

// ---------------------------------------------------------------- bodies, batons, bone
/** a baton landing on a body: a dull meaty thump, a slap of cloth, sometimes a crack */
defSound('baton_hit', (v) => {
  setSeed(7100 + v * 13);
  const b = new Buf(0.45);
  b.mix(thump(0.3, 150 + v * 12, 52, 16), 0, 1.0);
  const slap = burst(0.07, 'white', 3200, 500, 60); bandpass(slap, 1400 + v * 120, 0.9);
  b.mix(slap, 0.002, 0.7);
  const meat = burst(0.16, 'pink', 900, 80, 24); b.mix(meat, 0.004, 0.55);
  if (v % 3 === 2) { const c = burst(0.03, 'white', 6000, 1800, 160); b.mix(c, 0.01, 0.45); }
  return b.drive(1.6).normalize(0.9);
});
defSound('body_thud', (v) => {
  setSeed(7200 + v * 11);
  const b = new Buf(0.7);
  b.mix(thump(0.5, 120, 40, 9), 0, 1);
  b.mix(burst(0.25, 'pink', 700, 60, 14), 0.01, 0.6);
  const slap = burst(0.12, 'white', 2600, 600, 30); b.mix(slap, 0.02, 0.35);
  for (let i = 0; i < 3; i++) b.mix(burst(0.04, 'pink', 1400, 200, 80), 0.08 + i * 0.07 + rnd() * 0.03, 0.2);
  return b.drive(1.3).normalize(0.85);
});
defSound('bone_crunch', (v) => {
  setSeed(7300 + v * 7);
  const b = new Buf(0.6);
  for (let i = 0; i < 9; i++) { const c = noise(0.012 + rnd() * 0.01, 'white'); bandpass(c, 1800 + rnd() * 2600, 2.5); c.env(decay(220)); b.mix(c, i * 0.022 + rnd() * 0.012, 0.6 + rnd() * 0.4); }
  b.mix(thump(0.2, 220, 80, 22), 0, 0.7);
  const grind = noise(0.35, 'brown'); bandpass(grind, 600, 1.2); grind.env(adsr(0.02, 0.1, 0.5, 0.15, 0.35)); b.mix(grind, 0.05, 0.6);
  return b.drive(1.8).normalize(0.9);
});
/** a wet body dragged over concrete (loop) */
defLoopSound('drag_scrape', () => {
  setSeed(7400);
  const len = 2.4;
  const b = noise(len, 'pink');
  bandpass(b, (t) => 700 + Math.sin(t * 5.1) * 240 + Math.sin(t * 13) * 120, 0.9);
  b.env((t) => 0.55 + 0.45 * Math.abs(Math.sin(t * Math.PI * 1.25)));
  const squeak = noise(len, 'white'); bandpass(squeak, 2400, 6); squeak.env((t) => Math.max(0, Math.sin(t * 7.3)) ** 6);
  b.mix(squeak, 0, 0.25);
  return b.normalize(0.55);
});
/** the debtor: short pain sounds, and the scream when the band goes in */
defSound('debtor_grunt', (v) => {
  setSeed(7500 + v * 17);
  const len = 0.38 + (v % 3) * 0.08;
  const p0 = 140 + v * 9;
  const b = voice(len, (t) => p0 + 40 * Math.exp(-t * 9) - t * 60 + Math.sin(t * 40) * 6, [[620, 1], [1050, 0.6], [2500, 0.25]], 0.45);
  b.env(adsr(0.015, 0.08, 0.6, 0.18, len));
  return b.drive(1.6).normalize(0.7);
});
defSound('debtor_scream', (v) => {
  setSeed(7600 + v);
  const len = 2.1;
  const b = voice(len, (t) => (t < 0.15 ? 260 + t * 900 : t < 1.2 ? 395 + Math.sin(t * 31) * 26 + t * 40 : 440 - (t - 1.2) * 300 + Math.sin(t * 55) * 34) + v * 10,
    [[800, 1], [1250, 0.75], [2800, 0.4], [3500, 0.15]], 0.4);
  b.env(adsr(0.03, 0.2, 0.85, 0.7, len));
  const rasp = noise(len, 'pink'); bandpass(rasp, 1900, 0.9); rasp.env(adsr(0.03, 0.3, 0.55, 0.8, len));
  b.mix(rasp, 0, 0.45);
  return b.drive(2.2).normalize(0.9);
});
defSound('debtor_gasp', (v) => {
  setSeed(7650 + v);
  const len = 0.7;
  const b = noise(len, 'pink'); bandpass(b, (t) => 1200 + t * 1500, 1.2);
  b.env((t) => (t < 0.35 ? Math.sin(t / 0.35 * Math.PI / 2) : Math.exp(-(t - 0.35) * 9)));
  return b.normalize(0.5);
});

// ---------------------------------------------------------------- guards' kit
defSound('taser', (v) => {
  setSeed(7700 + v);
  const len = 1.0;
  const b = new Buf(len);
  const buzz = osc(len, 'square', (t) => 52 + Math.sin(t * 90) * 6 + rnd() * 4);
  const hiss = noise(len, 'white'); highpass(hiss, 3000);
  for (let i = 0; i < b.n; i++) b.d[i] = buzz.d[i] * 0.5 + hiss.d[i] * (0.4 + 0.6 * (rnd() < 0.02 ? 1 : 0));
  for (let i = 0; i < 26; i++) b.mix(clickS(2400 + rnd() * 3000, 0.008), rnd() * (len - 0.05), 0.8);
  b.env(adsr(0.004, 0.05, 0.85, 0.12, len));
  return b.drive(2.5).normalize(0.75);
});
defSound('buzzer', () => {
  setSeed(7750);
  const len = 0.9;
  const b = osc(len, 'square', 118); lowpass(b, 1800);
  const r = osc(len, 'saw', 236); lowpass(r, 1400); b.mix(r, 0, 0.5);
  b.env(adsr(0.01, 0.02, 0.9, 0.05, len));
  return b.drive(1.8).normalize(0.5);
});
defSound('cuff_click', (v) => {
  setSeed(7800 + v);
  const b = new Buf(0.4);
  for (let i = 0; i < 6; i++) b.mix(clickS(2600 + rnd() * 900, 0.012), i * 0.028, 0.6);
  const ring = osc(0.3, 'sine', 2900 + v * 80).env(decay(18)); b.mix(ring, 0.17, 0.3);
  comb(b, 0.0019, 0.5, 0.3);
  return b.normalize(0.5);
});
defSound('guard_bark', (v) => {
  // muffled through a visor: a clipped, chesty two-syllable order
  setSeed(7850 + v * 5);
  const len = 0.62;
  const p = 112 + v * 6;
  const b = voice(len, (t) => p + (t < 0.3 ? 14 : -8) - t * 20, [[540, 1], [920, 0.55], [2300, 0.18]], 0.3);
  b.env((t) => (t < 0.26 ? Math.min(1, t / 0.02) * Math.exp(-t * 2) : t < 0.32 ? 0.15 : Math.min(1, (t - 0.32) / 0.02) * Math.exp(-(t - 0.32) * 4)));
  lowpass(b, 1600);
  return b.drive(1.4).normalize(0.55);
});

// ---------------------------------------------------------------- the Seam
defLoopSound('seam_drone', () => {
  // a low tone that beats against itself, pressure in the ears, dust hiss drawn inward
  setSeed(7900);
  const len = 4;
  const b = new Buf(len);
  const parts: [number, number][] = [[41.2, 1], [41.9, 0.8], [61.7, 0.45], [82.4, 0.3], [123.5, 0.12]];
  for (const [f, a] of parts) { const o = osc(len, 'sine', (t) => f + Math.sin(t * 0.5 * Math.PI) * 0.3); b.mix(o, 0, a); }
  const air = noise(len, 'brown'); lowpass(air, 220); b.mix(air, 0, 0.6);
  const hiss = noise(len, 'pink'); bandpass(hiss, (t) => 900 - t * 120, 0.7); hiss.env((t) => 0.3 + 0.25 * Math.sin(t * Math.PI / 2)); b.mix(hiss, 0, 0.12);
  return b.normalize(0.7);
});
defSound('seam_ripple', (v) => {
  setSeed(7950 + v);
  const len = 1.4;
  const b = new Buf(len);
  const swell = noise(0.6, 'pink'); lowpass(swell, (t) => 200 + t * 1400); swell.env((t) => (t / 0.6) ** 2);
  b.mix(swell, 0, 0.5);
  const whomp = osc(len, 'sine', (t) => 70 + 60 * Math.exp(-(t - 0.55) * 6) * (t > 0.55 ? 1 : 0)); whomp.env((t) => (t < 0.55 ? 0 : Math.exp(-(t - 0.55) * 4)));
  b.mix(whomp, 0, 1);
  const wob = osc(len, 'sine', (t) => 240 + Math.sin(t * 22) * 60); wob.env((t) => (t < 0.58 ? 0 : Math.exp(-(t - 0.58) * 5) * 0.4));
  b.mix(wob, 0, 0.5);
  return b.drive(1.2).normalize(0.8);
});
defSound('seam_reject', (v) => {
  setSeed(7980 + v);
  const b = new Buf(0.9);
  b.mix(thump(0.6, 95, 32, 7), 0, 1);
  const sp = osc(0.6, 'sine', (t) => 180 * Math.exp(-t * 3) + 60); sp.env(decay(8)); b.mix(sp, 0.02, 0.5);
  const air = noise(0.3, 'brown'); lowpass(air, 400); air.env(decay(10)); b.mix(air, 0, 0.6);
  return b.drive(1.5).normalize(0.85);
});
defSound('seam_seal', () => {
  setSeed(8000);
  const len = 2.2;
  const b = new Buf(len);
  const suck = noise(1.6, 'pink'); bandpass(suck, (t) => 300 + t * 2400, 0.8); suck.env((t) => (t / 1.6) ** 3);
  b.mix(suck, 0, 0.7);
  b.mix(thump(0.6, 70, 28, 6), 1.6, 1.2);
  const cut = noise(0.05, 'white'); cut.env(decay(90)); b.mix(cut, 1.6, 0.5);
  const tail = osc(0.6, 'sine', 41).env(decay(5)); b.mix(tail, 1.62, 0.6);
  return b.drive(1.3).normalize(0.85);
});
defSound('seam_through', () => {
  // going through: pressure, the sound cut off as if a door closed on it, a long fall of air
  setSeed(8050);
  const len = 2.6;
  const b = new Buf(len);
  const press = osc(0.5, 'sine', (t) => 50 + t * 30); press.env((t) => (t / 0.5)); b.mix(press, 0, 0.8);
  const rush = noise(2.0, 'pink'); bandpass(rush, (t) => 400 + t * 300, 0.6); rush.env((t) => Math.min(1, t * 2) * (1 - t / 2.0)); b.mix(rush, 0.5, 0.8);
  const wind = noise(2.0, 'white'); highpass(wind, 2000); wind.env((t) => Math.min(1, t * 3) * (1 - t / 2.0) * 0.4); b.mix(wind, 0.5, 0.4);
  return b.normalize(0.8);
});

// ---------------------------------------------------------------- the BAILIFF band
defSound('remit_pierce', () => {
  setSeed(8100);
  const len = 1.2;
  const b = new Buf(len);
  // the gun: a pneumatic punch, a steel pin through, the clamp ratchets shut
  const punch = noise(0.06, 'white'); bandpass(punch, 1600, 0.8); punch.env(decay(60));
  b.mix(punch, 0, 1);
  b.mix(thump(0.25, 260, 90, 18), 0, 0.8);
  const ring = osc(0.6, 'sine', 3400).env(decay(9)); b.mix(ring, 0.01, 0.25);
  const ring2 = osc(0.6, 'sine', 5120).env(decay(12)); b.mix(ring2, 0.01, 0.15);
  for (let i = 0; i < 8; i++) b.mix(clickS(1800 + i * 90, 0.01), 0.28 + i * 0.045, 0.55);
  const whine = osc(0.5, 'saw', (t) => 900 + t * 2600); lowpass(whine, 3000); whine.env(adsr(0.02, 0.1, 0.5, 0.2, 0.5)); b.mix(whine, 0.62, 0.18);
  return b.drive(1.6).normalize(0.9);
});
defSound('remit_chirp', () => {
  // corporate boot chime, with one note that comes out wrong
  setSeed(8150);
  const b = new Buf(1.3);
  const notes = [1318.5, 1760, 2093, 1975.5];
  notes.forEach((f, i) => {
    const o = osc(0.22, 'sine', (t) => f * (i === 3 ? 1 - t * 0.12 : 1)); o.env(perc(0.004, 14));
    const o2 = osc(0.22, 'sine', f * 2.01); o2.env(perc(0.004, 22));
    b.mix(o, i * 0.16, 0.6); b.mix(o2, i * 0.16, 0.15);
  });
  const glitch = noise(0.06, 'white'); bandpass(glitch, 3000, 2); glitch.env(decay(50)); b.mix(glitch, 0.5, 0.25);
  return b.crush(7, 2).normalize(0.55);
});

// ---------------------------------------------------------------- Voss: the projector and the radio
defSound('holo_on', () => {
  setSeed(8200);
  const len = 1.1;
  const b = new Buf(len);
  const spin = osc(len, 'saw', (t) => 120 + t * 900); bandpass(spin, (t) => 400 + t * 2600, 3); spin.env(adsr(0.05, 0.3, 0.6, 0.4, len));
  b.mix(spin, 0, 0.35);
  for (let i = 0; i < 5; i++) { const o = osc(0.18, 'tri', 880 * Math.pow(1.335, i)); o.env(perc(0.004, 18)); b.mix(o, 0.15 + i * 0.09, 0.22); }
  const sh = noise(len, 'white'); highpass(sh, 5000); sh.env((t) => Math.max(0, Math.sin(t * Math.PI / len)) * 0.3); b.mix(sh, 0, 0.3);
  return b.normalize(0.5);
});
defSound('holo_off', () => {
  setSeed(8250);
  const len = 0.6;
  const b = osc(len, 'saw', (t) => 1400 * Math.exp(-t * 5) + 60); bandpass(b, 1200, 2); b.env(adsr(0.005, 0.1, 0.5, 0.3, len));
  const z = noise(0.1, 'white'); highpass(z, 3000); z.env(decay(40)); b.mix(z, 0, 0.4);
  return b.normalize(0.45);
});
defSound('radio_on', () => {
  setSeed(8300);
  const b = new Buf(0.32);
  b.mix(clickS(1700, 0.01), 0, 0.9);
  const sq = noise(0.28, 'white'); bandpass(sq, (t) => 2800 - t * 4000, 2.2); sq.env((t) => Math.exp(-t * 14)); b.mix(sq, 0.012, 0.55);
  return b.normalize(0.5);
});
defSound('radio_off', () => {
  setSeed(8350);
  const b = new Buf(0.5);
  const sq = noise(0.42, 'white'); bandpass(sq, (t) => 1400 + t * 2600, 1.8); sq.env((t) => (t < 0.05 ? t / 0.05 : Math.exp(-(t - 0.05) * 7))); b.mix(sq, 0, 0.7);
  b.mix(clickS(1300, 0.012), 0.36, 0.8);
  return b.normalize(0.5);
});
/** the projection glitches: a burst of digital tearing */
defSound('holo_glitch', (v) => {
  setSeed(8400 + v);
  const b = new Buf(0.25);
  for (let i = 0; i < 7; i++) { const s = osc(0.02 + rnd() * 0.02, 'square', 300 + rnd() * 2400); b.mix(s, i * 0.03 + rnd() * 0.01, 0.3); }
  return b.crush(5, 3).normalize(0.35);
});
void SR; void highpass;
