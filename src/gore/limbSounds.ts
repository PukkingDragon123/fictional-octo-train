// Limb loss sounds: the long wet rip of a limb coming away (sinew snapping,
// joint giving, a final pop), a scream that cracks, the hiss of flesh seared
// shut, and the drone of flies over something left too long.
import { defSound, defLoopSound, kit } from '../audio/sounds';
import { Buf, noise, osc, lowpass, highpass, bandpass, decay, perc, adsr, voice, rnd } from '../audio/synth';

const { thump, burst } = kit;

function squish(len: number, f0: number, f1: number, q: number, k: number) {
  const b = noise(len, 'white');
  bandpass(b, (t) => f1 + (f0 - f1) * Math.exp(-t * 18), q);
  return b.env(perc(0.004, k));
}
function snap(f: number, g = 1) {
  const b = new Buf(0.08);
  const c = noise(0.03, 'white'); highpass(c, f); c.env(decay(170));
  b.mix(c, 0, g);
  b.mix(osc(0.05, 'tri', (t) => f * 0.3 - t * 2000).env(decay(70)), 0, g * 0.4);
  return b;
}

defSound('limb_rip', (v) => {
  const b = new Buf(1.5);
  // the pull: a stretching, creaking wet tear that rises as it gives
  const tear = noise(0.95, 'white');
  bandpass(tear, (x) => 500 + x * 2600 + Math.sin(x * 55 + v) * 280, 1.2);
  tear.env(adsr(0.12, 0.2, 0.75, 0.25, 0.95));
  b.mix(tear, 0, 0.75);
  // tendons and sinew going one after another
  for (let i = 0; i < 9; i++) b.mix(snap(2600 + rnd() * 3000, 0.4 + rnd() * 0.4), 0.18 + i * 0.07 + rnd() * 0.04, 0.55);
  // the joint dislocating: a deep crack
  b.mix(snap(1400, 1), 0.72, 1);
  b.mix(thump(0.25, 160, 50, 12), 0.72, 0.9);
  // it comes away: a wet pop and a gush
  b.mix(squish(0.45, 2600, 300, 1.6, 6), 0.86, 1);
  b.mix(burst(0.4, 'brown', 900, 60, 8), 0.86, 0.6);
  for (let i = 0; i < 6; i++) b.mix(squish(0.08, 2000 + rnd() * 1500, 600, 2.4, 40), 1.0 + rnd() * 0.45, 0.25 + rnd() * 0.2);
  return b.drive(1.7).normalize(0.95);
});

defSound('limb_crush', (v) => {
  const b = new Buf(1.0);
  b.mix(thump(0.35, 120 + v * 6, 35, 9), 0, 1);
  for (let i = 0; i < 12; i++) b.mix(snap(1800 + rnd() * 3200, 0.5 + rnd() * 0.5), rnd() * 0.25, 0.6);
  b.mix(squish(0.5, 1800, 250, 1.4, 6), 0.05, 1);
  b.mix(burst(0.5, 'brown', 600, 40, 6), 0.02, 0.8);
  return b.drive(2).normalize(0.95);
});

defSound('limb_scream', (v) => {
  // a human scream that breaks into a sob: pitch rises, cracks, falls
  const len = 1.6;
  const b = voice(len, (t) => (t < 0.9 ? 300 + t * 240 + Math.sin(t * 38) * 22 : 520 - (t - 0.9) * 380 + Math.sin(t * 60) * 30) + v * 14,
    [[850, 1], [1350, 0.7], [2900, 0.35]], 0.35);
  b.env(adsr(0.05, 0.3, 0.8, 0.5, len));
  const rasp = noise(len, 'pink'); bandpass(rasp, 1800, 1); rasp.env(adsr(0.05, 0.2, 0.5, 0.6, len));
  b.mix(rasp, 0, 0.35);
  return b.drive(1.4).normalize(0.85);
});

defSound('limb_sizzle', (v) => {
  const b = new Buf(1.8);
  const h = noise(1.7, 'white'); highpass(h, 2600 + v * 150); h.env(adsr(0.05, 0.3, 0.6, 0.9, 1.7));
  b.mix(h, 0, 0.6);
  for (let i = 0; i < 40; i++) { const c = noise(0.01, 'white'); bandpass(c, 4000 + rnd() * 3000, 3); c.env(decay(300)); b.mix(c, rnd() * 1.6, 0.3 + rnd() * 0.4); }
  b.mix(squish(0.3, 1200, 300, 2, 10), 0.05, 0.5);
  return b.normalize(0.7);
});

defLoopSound('limb_flies', () => {
  const len = 3;
  const b = new Buf(len);
  for (let i = 0; i < 4; i++) {
    const f0 = 180 + rnd() * 80;
    const fly = osc(len, 'saw', (t) => f0 + Math.sin(t * (3 + i) + i) * 25 + Math.sin(t * 17 + i * 2) * 8);
    lowpass(fly, 1400);
    fly.env((t) => 0.4 + 0.6 * Math.max(0, Math.sin(t * (0.9 + i * 0.4) + i)));
    b.mix(fly, 0, 0.25);
  }
  return b.normalize(0.35);
});
