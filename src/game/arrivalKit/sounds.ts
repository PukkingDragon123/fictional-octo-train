// Sounds for the arrival (src/game/arrival.ts): the jelly wall taking the arm
// (a wet contact, a slow viscous slide, the gulp when it pulls you through,
// the muffled inside), the Seam spitting you out in the Lobby, the pneumatic
// delivery chute, the pack, the mission upload and the projection collapsing.
import { defSound, defLoopSound, kit } from '../../audio/sounds';
import { Buf, noise, osc, lowpass, highpass, bandpass, decay, perc, adsr, rnd, setSeed } from '../../audio/synth';

const { thump, burst, clickS } = kit;

/** a viscous blop: a short pitch-falling bubble */
function blop(f0: number, f1: number, len: number, k: number) {
  const o = osc(len, 'sine', (t) => f1 + (f0 - f1) * Math.exp(-t * 40));
  return o.env(perc(0.003, k));
}

// fingertips into the membrane: a wet kiss, suction, a couple of bubbles
defSound('arv_squelch', (v) => {
  setSeed(9100 + v * 7);
  const b = new Buf(0.9);
  const wet = noise(0.35, 'pink'); bandpass(wet, (t) => 1600 - t * 2600, 1.4); wet.env(adsr(0.004, 0.06, 0.35, 0.2, 0.35));
  b.mix(wet, 0, 0.8);
  const suck = noise(0.5, 'brown'); lowpass(suck, (t) => 300 + t * 900); suck.env((t) => Math.sin(Math.min(1, t / 0.5) * Math.PI) * 0.8);
  b.mix(suck, 0.05, 0.7);
  for (let i = 0; i < 4; i++) b.mix(blop(500 + rnd() * 700, 140 + rnd() * 80, 0.12, 30), 0.05 + i * 0.09 + rnd() * 0.05, 0.35 + rnd() * 0.2);
  b.mix(thump(0.2, 140, 60, 18), 0, 0.5);
  return b.drive(1.4).normalize(0.85);
});

// the arm sliding in: a long, slow, wet drag with bubbles squeezing past (loop)
defLoopSound('arv_slide', () => {
  setSeed(9200);
  const len = 2.6;
  const b = noise(len, 'brown');
  bandpass(b, (t) => 260 + Math.sin(t * 2.3) * 90 + Math.sin(t * 7.1) * 40, 0.8);
  b.env((t) => 0.6 + 0.4 * Math.sin(t * Math.PI * 2 / len * 3));
  const sq = noise(len, 'pink'); bandpass(sq, (t) => 900 + Math.sin(t * 3.7) * 300, 2.2); sq.env((t) => Math.max(0, Math.sin(t * 5.3)) ** 4);
  b.mix(sq, 0, 0.35);
  for (let i = 0; i < 14; i++) b.mix(blop(300 + rnd() * 900, 90 + rnd() * 60, 0.1, 26), rnd() * (len - 0.2), 0.12 + rnd() * 0.18);
  return b.normalize(0.6);
});

// it takes you: a deep swallow, pressure, the sound shut off as if a door closed
defSound('arv_gulp', () => {
  setSeed(9300);
  const len = 2.0;
  const b = new Buf(len);
  const down = osc(1.2, 'sine', (t) => 40 + 110 * Math.exp(-t * 3)); down.env(adsr(0.02, 0.2, 0.7, 0.6, 1.2));
  b.mix(down, 0, 1.0);
  const gul = noise(0.5, 'pink'); bandpass(gul, (t) => 700 - t * 900, 1.2); gul.env(perc(0.01, 7));
  b.mix(gul, 0, 0.8);
  b.mix(thump(0.6, 90, 30, 6), 0.08, 1.0);
  const rush = noise(1.4, 'brown'); lowpass(rush, (t) => 900 * Math.exp(-t * 2.5) + 80); rush.env((t) => Math.min(1, t * 6) * Math.exp(-t * 1.6));
  b.mix(rush, 0.1, 0.9);
  for (let i = 0; i < 6; i++) b.mix(blop(220 + rnd() * 300, 70, 0.16, 18), 0.2 + i * 0.12 + rnd() * 0.06, 0.25);
  return b.drive(1.6).normalize(0.9);
});

// inside the gel: the heart through water, a low pressure hum, bubbles rising past the ears
defSound('arv_inside', () => {
  setSeed(9400);
  const len = 2.4;
  const b = new Buf(len);
  const hum = osc(len, 'sine', (t) => 38 + Math.sin(t * 1.3) * 3); hum.env((t) => Math.min(1, t * 2) * (1 - t / len) ** 0.6);
  b.mix(hum, 0, 0.7);
  for (let i = 0; i < 3; i++) {
    const at = 0.15 + i * 0.72;
    b.mix(thump(0.18, 70, 40, 14), at, 1.0);
    b.mix(thump(0.16, 64, 36, 16), at + 0.22, 0.7);
  }
  const mud = noise(len, 'brown'); lowpass(mud, 160); mud.env((t) => 0.5 + 0.5 * Math.sin(t * 3.1)); b.mix(mud, 0, 0.5);
  for (let i = 0; i < 18; i++) { const o = osc(0.06, 'sine', (t) => 400 + rnd() * 500 + t * 3000); o.env(perc(0.002, 50)); lowpass(o, 1200); b.mix(o, rnd() * (len - 0.1), 0.08 + rnd() * 0.1); }
  return b.normalize(0.75);
});

// the Lobby's Seam spits you out: a wet tearing push, the body slapping the floor
defSound('arv_spit', () => {
  setSeed(9500);
  const b = new Buf(1.3);
  const tear = noise(0.4, 'pink'); bandpass(tear, (t) => 400 + t * 2200, 1.1); tear.env((t) => (t / 0.4) ** 2);
  b.mix(tear, 0, 0.6);
  const pop = noise(0.12, 'white'); bandpass(pop, 1300, 1.2); pop.env(decay(30)); b.mix(pop, 0.38, 0.8);
  b.mix(thump(0.5, 110, 38, 9), 0.42, 1.0);
  const slap = burst(0.18, 'white', 3000, 500, 26); b.mix(slap, 0.44, 0.6);
  const splat = noise(0.5, 'pink'); bandpass(splat, 900, 0.9); splat.env(perc(0.005, 9)); b.mix(splat, 0.45, 0.7);
  for (let i = 0; i < 6; i++) { const d = burst(0.03, 'white', 4000, 1200, 120); b.mix(d, 0.55 + rnd() * 0.6, 0.15 + rnd() * 0.15); }
  return b.drive(1.4).normalize(0.85);
});

// one heartbeat (lub-dub)
defSound('arv_heart', (v) => {
  setSeed(9550 + v);
  const b = new Buf(0.5);
  b.mix(thump(0.2, 72, 42, 16), 0, 1.0);
  b.mix(thump(0.18, 66, 38, 18), 0.2, 0.65);
  lowpass(b, 220);
  return b.normalize(0.8);
});

// ---------------------------------------------------------------- the delivery chute
defSound('arv_hiss', () => {
  setSeed(9600);
  const len = 1.6;
  const b = noise(len, 'white'); highpass(b, 1800); bandpass(b, (t) => 4200 - t * 1200, 0.7);
  b.env(adsr(0.03, 0.2, 0.6, 0.7, len));
  const thk = new Buf(len);
  for (let i = 0; i < 3; i++) thk.mix(clickS(900 + i * 140, 0.02), 0.25 + i * 0.32, 0.6);
  b.mix(thk, 0, 1);
  return b.normalize(0.55);
});
defSound('arv_clank', (v) => {
  setSeed(9650 + v * 5);
  const b = new Buf(0.8);
  b.mix(thump(0.25, 260, 120, 22), 0, 0.8);
  for (const f of [523, 811, 1247, 1873]) { const o = osc(0.7, 'sine', f * (1 + (rnd() - 0.5) * 0.04)); o.env(perc(0.002, 7 + rnd() * 4)); b.mix(o, 0, 0.18); }
  const n = burst(0.05, 'white', 5000, 900, 70); b.mix(n, 0, 0.5);
  return b.drive(1.2).normalize(0.7);
});
defSound('arv_packdrop', () => {
  setSeed(9700);
  const b = new Buf(0.9);
  b.mix(thump(0.4, 120, 48, 11), 0, 1.0);
  const cloth = burst(0.25, 'pink', 2200, 200, 16); b.mix(cloth, 0.005, 0.7);
  for (let i = 0; i < 5; i++) { const o = osc(0.12, 'sine', 2400 + rnd() * 1800); o.env(perc(0.001, 40)); b.mix(o, 0.02 + rnd() * 0.12, 0.12); }
  b.mix(thump(0.2, 140, 70, 20), 0.22, 0.25);
  return b.drive(1.3).normalize(0.8);
});
defSound('arv_rustle', (v) => {
  setSeed(9750 + v * 3);
  const len = 0.7;
  const b = noise(len, 'pink'); bandpass(b, (t) => 1800 + Math.sin(t * 19) * 600, 0.9);
  b.env((t) => Math.max(0, Math.sin(t / len * Math.PI)) * (0.6 + 0.4 * Math.abs(Math.sin(t * 23))));
  for (let i = 0; i < 3; i++) { const o = osc(0.08, 'sine', 3100 + rnd() * 1500); o.env(perc(0.001, 45)); b.mix(o, rnd() * 0.5, 0.15); }
  return b.normalize(0.55);
});
defSound('arv_ratchet', () => {
  setSeed(9800);
  const b = new Buf(0.45);
  for (let i = 0; i < 7; i++) b.mix(clickS(1500 + (i % 2) * 300, 0.012), i * 0.045, 0.6);
  const web = noise(0.35, 'pink'); bandpass(web, 2400, 1.5); web.env(perc(0.01, 9)); b.mix(web, 0, 0.35);
  return b.normalize(0.5);
});

// ---------------------------------------------------------------- the watch and the projection
defSound('arv_upload', () => {
  setSeed(9850);
  const len = 1.6;
  const b = new Buf(len);
  for (let i = 0; i < 16; i++) { const f = 900 + (i % 4) * 300 + Math.floor(rnd() * 3) * 150; const o = osc(0.05, 'square', f); o.env(perc(0.002, 50)); b.mix(o, i * 0.06, 0.18); }
  const sweep = osc(0.6, 'tri', (t) => 600 + t * 1400); sweep.env(adsr(0.02, 0.1, 0.6, 0.3, 0.6)); b.mix(sweep, 0.95, 0.25);
  const done = osc(0.25, 'sine', 1760); done.env(perc(0.004, 12)); b.mix(done, 1.32, 0.35);
  return b.crush(7, 2).normalize(0.5);
});
defSound('arv_collapse', () => {
  setSeed(9900);
  const len = 1.2;
  const b = new Buf(len);
  const thwip = osc(0.3, 'saw', (t) => 2600 * Math.exp(-t * 14) + 80); bandpass(thwip, 1500, 1.5); thwip.env(perc(0.003, 10));
  b.mix(thwip, 0, 0.7);
  const whine = osc(len, 'sine', (t) => 15600 - t * 3000); whine.env((t) => Math.exp(-t * 3) * 0.3); b.mix(whine, 0.05, 0.15);
  const pop = burst(0.04, 'white', 6000, 1500, 90); b.mix(pop, 0.28, 0.5);
  b.mix(thump(0.3, 160, 50, 14), 0.28, 0.4);
  return b.normalize(0.6);
});
void highpass;
