// Creature sound pack A: the office/home furniture things, wall and vent
// dwellers, the hollows and the Custodian. Registered through the public
// defSound/defLoopSound hooks so the core recipe table stays untouched.
import { Buf, noise, osc, lowpass, highpass, bandpass, comb, decay, perc, adsr, voice, rnd } from './synth';
import { defSound, defLoopSound, kit } from './sounds';

const { thump, burst, clickS } = kit;

/** a coil spring being plucked (sofas and office chairs) */
function spring(len: number, f: number, k = 7) {
  const b = osc(len, 'sine', (t) => f * (1 + Math.sin(t * 38) * 0.04 * Math.exp(-t * 3)) * (1 - t * 0.05));
  b.mix(osc(len, 'sine', (t) => f * 2.7 * (1 - t * 0.04)), 0, 0.25);
  comb(b, 0.0021, 0.6, 0.3);
  return b.env(perc(0.002, k));
}

/** hollow plastic knock (mannequin shell) */
function knock(f: number, k = 22) {
  const b = thump(0.3, f * 1.6, f, k);
  b.mix(burst(0.08, 'pink', 2400, 300, 60), 0, 0.5);
  comb(b, 1 / (f * 2.1), 0.55, 0.45);
  return b;
}

// ---------------------------------------------------------------- the Employee
defSound('employee_crack', (v) => {
  const b = new Buf(0.4);
  b.mix(clickS(2600 + v * 90, 0.012), 0, 0.8);
  b.mix(knock(240 + v * 12, 30), 0.006, 0.7);
  b.mix(clickS(1900, 0.01), 0.07 + (v % 3) * 0.02, 0.4);
  return b.normalize(0.6);
});
defSound('mannequin_knock', (v) => knock(190 + v * 14).normalize(0.65));
defSound('mannequin_fall', (v) => {
  const b = new Buf(1.4);
  for (let i = 0; i < 6; i++) b.mix(knock(150 + rnd() * 160 + v * 6, 16 + rnd() * 10), i * 0.13 + rnd() * 0.08 + (i > 3 ? 0.25 : 0), 0.9 - i * 0.11);
  b.mix(thump(0.4, 110, 45, 9), 0.05, 0.6);
  return b.normalize(0.7);
});

// ---------------------------------------------------------------- Swivel
defSound('swivel_bite', (v) => {
  const b = new Buf(0.5);
  b.mix(clickS(3200, 0.01), 0, 0.9);
  b.mix(clickS(2700, 0.01), 0.035, 0.8);
  const sq = osc(0.22, 'saw', (t) => 900 - t * 900 + v * 40); bandpass(sq, 1300, 4); sq.env(perc(0.01, 14));
  b.mix(sq, 0.05, 0.6);
  b.mix(burst(0.1, 'white', 5000, 1200, 40), 0.03, 0.3);
  return b.normalize(0.55);
});
defSound('swivel_die', (v) => {
  const b = new Buf(1.6);
  const hiss = noise(1.3, 'white'); highpass(hiss, 2500); hiss.env((t) => Math.exp(-t * 2.4) * (t < 0.02 ? t / 0.02 : 1));
  b.mix(hiss, 0, 0.35);
  b.mix(spring(1.1, 320 + v * 10, 4), 0.1, 0.8);
  b.mix(knock(160, 18), 0.35, 0.6);
  for (let i = 0; i < 4; i++) b.mix(clickS(1600 + rnd() * 1200, 0.01), 0.5 + i * 0.09, 0.4);
  return b.normalize(0.6);
});

// ---------------------------------------------------------------- Davenport
defSound('davenport_roar', (v) => {
  const len = 1.3;
  const b = voice(len, (t) => 58 + Math.sin(t * 7) * 6 - t * 10 + v * 2, [[260, 1], [520, 0.7], [900, 0.25]], 0.55, 'saw');
  b.env(adsr(0.06, 0.25, 0.75, 0.5, len)); b.drive(2.2);
  const out = new Buf(len + 0.2);
  out.mix(b, 0, 1);
  out.mix(spring(0.7, 210 + v * 8, 6), 0.05, 0.35);
  out.mix(spring(0.6, 290, 7), 0.22, 0.25);
  out.mix(burst(0.4, 'brown', 700, 40, 6), 0, 0.5); // cushion whump
  lowpass(out, 2600);
  return out.normalize(0.8);
});
defSound('davenport_hurt', (v) => {
  const b = new Buf(0.9);
  b.mix(spring(0.7, 240 + v * 15, 6), 0, 0.7);
  const g = voice(0.6, (t) => 80 - t * 30, [[300, 1], [650, 0.5]], 0.5, 'saw'); g.env(adsr(0.02, 0.1, 0.6, 0.3, 0.6));
  b.mix(g, 0.03, 0.8);
  b.mix(burst(0.2, 'brown', 500, 30, 12), 0, 0.6);
  return b.normalize(0.7);
});
defSound('davenport_die', (v) => {
  const b = new Buf(3.0);
  const ex = noise(2.6, 'pink'); lowpass(ex, (t) => 900 * Math.exp(-t * 0.9) + 120); ex.env(adsr(0.1, 0.4, 0.6, 1.6, 2.6));
  b.mix(ex, 0.2, 0.8);
  const g = voice(1.6, (t) => 62 - t * 18 + v, [[250, 1], [480, 0.6]], 0.5, 'saw'); g.env(adsr(0.05, 0.3, 0.6, 0.9, 1.6));
  b.mix(g, 0, 0.7);
  for (let i = 0; i < 5; i++) b.mix(spring(0.8, 180 + rnd() * 220, 5 + rnd() * 3), 0.4 + i * 0.27 + rnd() * 0.1, 0.4);
  b.mix(thump(0.6, 90, 35, 6), 1.1, 0.9);
  return b.normalize(0.75);
});

// ---------------------------------------------------------------- Underlay
defSound('underlay_grab', (v) => {
  const b = new Buf(0.9);
  // carpet tearing: a burst of fibres, amplitude-chopped
  const tear = noise(0.45, 'white'); bandpass(tear, 2200 + v * 100, 0.9);
  tear.env((t) => (0.4 + 0.6 * (Math.sin(t * 190 + rnd()) > 0.2 ? 1 : 0.25)) * Math.exp(-t * 5));
  b.mix(tear, 0, 0.7);
  b.mix(thump(0.25, 160, 60, 14), 0.02, 0.8); // the lunge
  const wet = noise(0.12, 'pink'); lowpass(wet, 1400); wet.env(perc(0.003, 30));
  b.mix(wet, 0.12, 0.7);
  return b.normalize(0.7);
});
defSound('underlay_hiss', (v) => {
  const b = noise(0.9, 'pink'); bandpass(b, (t) => 900 + Math.sin(t * 9 + v) * 300, 0.9);
  return b.env(adsr(0.05, 0.1, 0.6, 0.4, 0.9)).normalize(0.4);
});
defSound('underlay_die', (v) => {
  const b = noise(2.2, 'brown'); lowpass(b, (t) => 1200 * Math.exp(-t * 1.6) + 60);
  b.env(adsr(0.02, 0.3, 0.7, 1.2, 2.2));
  const out = new Buf(2.4); out.mix(b, 0, 1);
  const r = noise(1.2, 'pink'); bandpass(r, 700 + v * 30, 0.8); r.env((t) => (0.5 + 0.5 * Math.sin(t * 20)) * Math.exp(-t * 2));
  out.mix(r, 0.1, 0.5);
  return out.normalize(0.6);
});

// ---------------------------------------------------------------- Drywall Man
defSound('plaster_crack', (v) => {
  const b = new Buf(1.2);
  b.mix(burst(0.05, 'white', 7000, 800, 90), 0, 1);
  b.mix(thump(0.2, 220, 80, 18), 0, 0.5);
  for (let i = 0; i < 9; i++) b.mix(burst(0.03 + rnd() * 0.03, 'white', 4000 + rnd() * 3000, 600, 80), 0.06 + i * 0.07 + rnd() * 0.05, 0.6 - i * 0.05);
  const dust = noise(0.8, 'pink'); bandpass(dust, 3000 + v * 100, 0.6); dust.env(adsr(0.05, 0.1, 0.4, 0.5, 0.8));
  b.mix(dust, 0.2, 0.25);
  return b.normalize(0.65);
});
defSound('drywall_wheeze', (v) => {
  const b = voice(1.0, (t) => 95 + Math.sin(t * 13) * 8 + v * 3, [[700, 1], [1250, 0.6], [2800, 0.3]], 0.85, 'saw');
  b.env(adsr(0.15, 0.2, 0.5, 0.45, 1.0));
  highpass(b, 300);
  return b.normalize(0.45);
});
defSound('drywall_die', (v) => {
  const b = new Buf(2.0);
  for (let i = 0; i < 16; i++) b.mix(burst(0.04 + rnd() * 0.05, 'white', 2500 + rnd() * 4000, 300, 50), i * 0.06 + rnd() * 0.06, 0.7 - i * 0.03);
  b.mix(thump(0.5, 120, 40, 7), 0.55 + v * 0.01, 0.8);
  const dust = noise(1.2, 'pink'); lowpass(dust, 2000); dust.env(adsr(0.1, 0.2, 0.4, 0.8, 1.2));
  b.mix(dust, 0.6, 0.4);
  return b.normalize(0.7);
});

// ---------------------------------------------------------------- Ventling
defSound('ventling_chitter', (v) => {
  const b = new Buf(0.9);
  const n = 6 + (v % 4);
  for (let i = 0; i < n; i++) {
    b.mix(clickS(3000 + rnd() * 1800, 0.006), i * 0.06 + rnd() * 0.02, 0.5);
    if (i % 3 === 1) { const c = osc(0.07, 'sine', (t) => 2600 + t * 4000 + v * 80); c.env(perc(0.005, 40)); b.mix(c, i * 0.06 + 0.01, 0.35); }
  }
  return b.normalize(0.4);
});
defSound('ventling_squeal', (v) => {
  const b = voice(0.45, (t) => 1300 + Math.sin(t * 60) * 160 - t * 500 + v * 40, [[2500, 1], [4200, 0.5]], 0.25, 'saw');
  b.env(perc(0.01, 6));
  return b.normalize(0.45);
});
defSound('ventling_die', (v) => {
  const b = voice(0.9, (t) => 1100 - t * 900 + v * 20, [[2200, 1], [3800, 0.4]], 0.3, 'saw');
  b.env(adsr(0.01, 0.2, 0.6, 0.5, 0.9));
  const out = new Buf(1.1); out.mix(b, 0, 0.8); out.mix(knock(420, 30), 0.55, 0.4);
  return out.normalize(0.5);
});

// ---------------------------------------------------------------- Hollow
defSound('hollow_mutter', (v) => {
  // half-heard office small talk: vowel formants with no consonants
  const vowels: [number, number][][] = [[[650, 1], [1100, 0.6]], [[420, 1], [2000, 0.5]], [[330, 1], [900, 0.6]], [[560, 1], [1700, 0.5]], [[480, 1], [1300, 0.5]]];
  const len = 2.2;
  const b = new Buf(len);
  let t0 = 0.05; let i = 0;
  while (t0 < len - 0.35) {
    const d = 0.12 + rnd() * 0.22;
    const w = voice(d, (t) => 120 + v * 3 + Math.sin(t * 9) * 8 - t * 20, vowels[(i + v) % vowels.length], 0.35, 'saw');
    w.env(adsr(0.02, 0.03, 0.8, 0.05, d));
    b.mix(w, t0, 0.5 + rnd() * 0.3);
    t0 += d + (rnd() < 0.2 ? 0.3 : 0.03); i++;
  }
  lowpass(b, 2200);
  return b.crush(7, 3).normalize(0.4);
});
defSound('hollow_shriek', (v) => {
  const b = voice(1.0, (t) => 240 + Math.sin(t * 31) * 30 + t * 180 + v * 6, [[800, 1], [1400, 0.8], [2600, 0.4]], 0.4, 'saw');
  b.env(adsr(0.02, 0.15, 0.7, 0.4, 1.0)); b.drive(3);
  const st = noise(1.0, 'white'); st.crush(3, 6); st.env((t) => (Math.sin(t * 47) > 0.3 ? 0.4 : 0) * Math.exp(-t * 2));
  b.mix(st, 0, 0.5);
  return b.crush(5, 4).normalize(0.6);
});
defSound('hollow_die', (v) => {
  const b = voice(1.6, (t) => 140 - t * 60 + v * 2, [[520, 1], [880, 0.6]], 0.4, 'saw');
  b.env(adsr(0.05, 0.3, 0.6, 0.9, 1.6));
  const st = noise(1.6, 'white'); st.crush(3, 8); st.env((t) => Math.min(1, t * 1.5) * Math.exp(-(t - 1) * (t - 1) * 3) * 0.6);
  b.mix(st, 0, 0.6);
  return b.crush(4, 6).normalize(0.55);
});

// ---------------------------------------------------------------- Custodian
defLoopSound('custodian_hum', () => {
  const len = 4;
  const b = new Buf(len);
  b.mix(osc(len, 'sine', 55), 0, 0.5);
  b.mix(osc(len, 'sine', 110.25), 0, 0.22);
  b.mix(osc(len, 'tri', 165.5), 0, 0.06);
  // slow "breathing" amplitude and a faint servo whine
  for (let i = 0; i < b.n; i++) b.d[i] *= 0.8 + 0.2 * Math.sin((i / b.n) * Math.PI * 2 * 2);
  const wh = osc(len, 'sine', (t) => 3150 + Math.sin(t * Math.PI * 0.5) * 40); wh.env((t) => 0.5 + 0.5 * Math.sin(t * Math.PI));
  b.mix(wh, 0, 0.025);
  return b.normalize(0.4);
});
defSound('custodian_alarm', (v) => {
  const b = new Buf(1.0);
  [990, 660, 440].forEach((f, i) => { const s = osc(0.22, 'square', f + v * 3); s.env(adsr(0.005, 0.05, 0.7, 0.08, 0.22)); b.mix(s, i * 0.25, 0.35); });
  lowpass(b, 2400);
  return b.normalize(0.45);
});
defSound('custodian_strike', (v) => {
  const b = new Buf(0.8);
  b.mix(thump(0.35, 140, 50, 12), 0, 1);
  b.mix(burst(0.1, 'pink', 1800, 200, 30), 0, 0.6);
  const ring = osc(0.6, 'sine', 1240 + v * 20); ring.mix(osc(0.6, 'sine', 1870), 0, 0.5); ring.env(decay(7));
  b.mix(ring, 0.01, 0.12);
  return b.normalize(0.7);
});
defSound('custodian_glitch', (v) => {
  const b = new Buf(0.7);
  const st = noise(0.5, 'white'); st.crush(3, 5 + (v % 3)); st.env(perc(0.005, 7));
  b.mix(st, 0, 0.6);
  const tone = osc(0.5, 'square', (t) => (Math.floor(t * 24) % 2 ? 880 : 440) + v * 10); tone.env(perc(0.005, 6)); lowpass(tone, 2500);
  b.mix(tone, 0.02, 0.35);
  return b.normalize(0.5);
});
