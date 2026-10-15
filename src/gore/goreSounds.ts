// Gore sounds, synthesised like everything else: wet impacts, squelches,
// cracking bone, tearing, bursts, gibs slapping the floor, arterial squirts,
// plus the dry versions (stuffing, plaster, fibreglass, static).
import { defSound, kit } from '../audio/sounds';
import { Buf, noise, osc, lowpass, highpass, bandpass, decay, perc, adsr, rnd } from '../audio/synth';

const { thump, burst } = kit;

/** a short wet "squish": filtered noise with a falling resonance */
function squish(len: number, f0: number, f1: number, q: number, k: number) {
  const b = noise(len, 'white');
  bandpass(b, (t) => f1 + (f0 - f1) * Math.exp(-t * 18), q);
  return b.env(perc(0.004, k));
}

/** sticky crackle: tiny clicks scattered over a span (tissue parting) */
function crackle(span: number, n: number, f: number, g = 0.4) {
  const b = new Buf(span + 0.03);
  for (let i = 0; i < n; i++) {
    const c = noise(0.012, 'white'); bandpass(c, f * (0.7 + rnd() * 0.8), 3); c.env(decay(260));
    b.mix(c, rnd() * span, g * (0.4 + rnd() * 0.6));
  }
  return b;
}

defSound('gore_wet_hit', (v) => {
  const b = new Buf(0.4);
  b.mix(thump(0.18, 150 + v * 12, 55, 22), 0, 0.8);
  b.mix(squish(0.22, 2200 + v * 200, 500, 2.2, 16), 0.004, 0.9);
  b.mix(burst(0.12, 'brown', 900, 60, 26), 0, 0.5);
  b.mix(crackle(0.12, 6, 3200, 0.25), 0.02, 1);
  return b.drive(1.6).normalize(0.85);
});

defSound('gore_squelch', (v) => {
  const b = new Buf(0.55);
  b.mix(squish(0.4, 1600 + v * 180, 320, 3, 7), 0, 1);
  b.mix(squish(0.2, 900, 260, 2, 14), 0.12 + v * 0.02, 0.6);
  b.mix(thump(0.12, 120, 50, 26), 0, 0.4);
  return b.normalize(0.7);
});

defSound('gore_bone_crack', (v) => {
  const b = new Buf(0.35);
  // the snap: a broadband click with a woody body, then splinters
  const snap = noise(0.03, 'white'); highpass(snap, 1800); snap.env(decay(160));
  b.mix(snap, 0, 1);
  b.mix(osc(0.08, 'tri', (t) => 620 + v * 40 - t * 2400).env(decay(55)), 0, 0.5);
  b.mix(crackle(0.09, 9, 4200, 0.5), 0.012, 1);
  b.mix(thump(0.12, 220, 80, 30), 0, 0.45);
  return b.drive(2.2).normalize(0.8);
});

defSound('gore_tear', (v) => {
  const b = new Buf(0.7);
  const t = noise(0.55, 'white');
  bandpass(t, (x) => 700 + x * 2600 + Math.sin(x * 70) * 300, 1.4);
  t.env(adsr(0.04, 0.1, 0.7, 0.2, 0.55));
  b.mix(t, 0, 0.7);
  b.mix(crackle(0.5, 22, 2800 + v * 200, 0.5), 0.02, 1);
  b.mix(squish(0.3, 1400, 300, 2.5, 9), 0.3, 0.7);
  return b.normalize(0.75);
});

defSound('gore_burst', (v) => {
  const b = new Buf(1.0);
  b.mix(thump(0.3, 110 + v * 8, 38, 10), 0, 1);
  b.mix(squish(0.5, 2600, 300, 1.4, 6), 0, 1);
  b.mix(burst(0.4, 'pink', 3200, 200, 8), 0.005, 0.6);
  b.mix(crackle(0.3, 14, 3800, 0.6), 0.01, 1);
  // splatter raining down afterwards
  for (let i = 0; i < 9; i++) b.mix(squish(0.07, 2400 + rnd() * 1500, 700, 2.5, 50), 0.15 + rnd() * 0.6, 0.25 + rnd() * 0.25);
  return b.drive(1.8).normalize(0.9);
});

defSound('gore_gib_land', (v) => {
  const b = new Buf(0.3);
  b.mix(thump(0.14, 170 + v * 25, 70, 30), 0, 0.9);
  b.mix(squish(0.16, 1800 + v * 300, 500, 2.4, 24), 0, 0.8);
  return b.normalize(0.55);
});

defSound('gore_chip_land', (v) => {
  const b = new Buf(0.15);
  b.mix(burst(0.05, 'white', 5000, 1200, 90), 0, 0.7);
  b.mix(osc(0.05, 'sine', 1400 + v * 300).env(decay(80)), 0, 0.25);
  return b.normalize(0.4);
});

defSound('gore_spurt', (v) => {
  const b = noise(0.3, 'white');
  bandpass(b, (t) => 2600 - t * 3000 + v * 100, 1.6);
  b.env(adsr(0.01, 0.05, 0.5, 0.15, 0.3));
  const out = new Buf(0.32);
  out.mix(b, 0, 0.7);
  out.mix(squish(0.12, 1200, 400, 2, 25), 0, 0.5);
  return out.normalize(0.45);
});

defSound('gore_drip', (v) => {
  const b = osc(0.08, 'sine', (t) => 1500 + v * 120 - t * 4000).env(decay(60));
  b.mix(squish(0.04, 2500, 1200, 3, 80), 0, 0.4);
  return b.normalize(0.25);
});

defSound('gore_crunch', (v) => {
  const b = new Buf(0.4);
  b.mix(crackle(0.16, 18, 3000 + v * 300, 0.8), 0, 1);
  b.mix(thump(0.12, 200, 90, 30), 0, 0.5);
  b.mix(burst(0.1, 'white', 6000, 1500, 40), 0, 0.4);
  return b.drive(1.8).normalize(0.75);
});

defSound('gore_crumble', (v) => {
  const b = new Buf(0.6);
  b.mix(burst(0.4, 'pink', 2500, 200, 8), 0, 0.6);
  for (let i = 0; i < 14; i++) b.mix(burst(0.03, 'white', 5000, 1000, 120), rnd() * 0.45, 0.3 + rnd() * 0.3);
  b.mix(thump(0.15, 160 + v * 10, 70, 22), 0, 0.5);
  return b.normalize(0.65);
});

defSound('gore_fluff', (v) => {
  const b = noise(0.35, 'white');
  bandpass(b, (t) => 900 + t * 1800 + v * 80, 0.9);
  b.env(adsr(0.02, 0.08, 0.5, 0.15, 0.35));
  const out = new Buf(0.4);
  out.mix(b, 0, 0.6);
  out.mix(burst(0.12, 'pink', 1200, 100, 20), 0, 0.5); // the soft "poof"
  return out.normalize(0.5);
});

defSound('gore_static', (v) => {
  const b = noise(0.35, 'white');
  b.crush(3, 30 + v * 10);
  b.env(adsr(0.005, 0.05, 0.6, 0.12, 0.35));
  const s = osc(0.3, 'square', 120 + v * 40).env(decay(10));
  lowpass(s, 2000);
  const out = new Buf(0.36);
  out.mix(b, 0, 0.7); out.mix(s, 0.02, 0.35);
  return out.normalize(0.6);
});
