// Sound recipes for the Remittance Press (src/game/debt/hopper.ts) and the
// first-person intake (src/game/intro.ts): the lever's ratchet, the warning
// horn, the slam, the hydraulic hiss on the way back up, the wet crunch of
// whatever was alive under it, the seam swallowing the load, and the
// fluorescent buzz / heartbeat / ear ring of the processing wing.
import { defSound, defLoopSound, kit } from './sounds';
import { Buf, noise, osc, lowpass, highpass, bandpass, comb, decay, perc, adsr, rnd, setSeed } from './synth';

const { thump, burst, clickS } = kit;

/** a heavy lever thrown: ratchet teeth, a latch, a clunk in the column */
defSound('press_lever', (v) => {
  setSeed(9600 + v * 5);
  const b = new Buf(0.7);
  for (let i = 0; i < 6; i++) b.mix(clickS(1500 + rnd() * 600, 0.012), i * 0.04 + rnd() * 0.008, 0.35 + i * 0.05);
  b.mix(thump(0.25, 160, 60, 18), 0.26, 0.9);
  const clank = osc(0.35, 'sine', 420 + v * 15).env(decay(14)); comb(clank, 0.0042, 0.5, 0.35);
  b.mix(clank, 0.26, 0.35);
  return b.drive(1.3).normalize(0.7);
});
/** the warning horn before the ram drops: two flat blasts */
defSound('press_klaxon', () => {
  setSeed(9650);
  const b = new Buf(0.9);
  for (let i = 0; i < 2; i++) {
    const h = osc(0.3, 'saw', 196); const h2 = osc(0.3, 'saw', 247);
    lowpass(h, 1600); lowpass(h2, 1600);
    h.env(adsr(0.01, 0.04, 0.85, 0.06, 0.3)); h2.env(adsr(0.01, 0.04, 0.85, 0.06, 0.3));
    b.mix(h, i * 0.4, 0.5); b.mix(h2, i * 0.4, 0.35);
  }
  return b.drive(1.6).normalize(0.55);
});
/** the ram hits the plate: a cannon-shot of steel on steel, the frame ringing, grit raining */
defSound('press_slam', (v) => {
  setSeed(9700 + v * 13);
  const b = new Buf(2.0);
  b.mix(thump(0.9, 140, 30, 5), 0, 1.0);
  b.mix(burst(0.12, 'white', 4200, 400, 40), 0, 0.8);
  const ring = osc(1.6, 'sine', 182 + v * 6).env(decay(2.6)); comb(ring, 0.0067, 0.62, 0.45);
  b.mix(ring, 0.01, 0.35);
  const ring2 = osc(1.2, 'sine', 733).env(decay(4.5));
  b.mix(ring2, 0.01, 0.12);
  for (let i = 0; i < 14; i++) b.mix(clickS(2600 + rnd() * 2400, 0.006), 0.12 + rnd() * 0.7, 0.08 + rnd() * 0.08);
  return b.drive(2.2).normalize(0.95);
});
/** the ram climbing back: hydraulic hiss and a groaning pump */
defSound('press_hiss', (v) => {
  setSeed(9750 + v);
  const b = new Buf(1.8);
  const hiss = noise(1.6, 'white'); highpass(hiss, 3000); hiss.env(adsr(0.02, 0.2, 0.5, 0.9, 1.6));
  b.mix(hiss, 0, 0.45);
  const pump = osc(1.6, 'saw', (t) => 58 + t * 18 + Math.sin(t * 40) * 3); lowpass(pump, 320); pump.env(adsr(0.1, 0.2, 0.7, 0.5, 1.6));
  b.mix(pump, 0.05, 0.4);
  return b.normalize(0.55);
});
/** something alive under the ram: bone, wet, a gush */
defSound('press_crunch', (v) => {
  setSeed(9800 + v * 7);
  const b = new Buf(1.1);
  for (let i = 0; i < 14; i++) { const c = noise(0.01 + rnd() * 0.012, 'white'); bandpass(c, 1200 + rnd() * 2800, 2.2); c.env(decay(200)); b.mix(c, i * 0.018 + rnd() * 0.01, 0.6 + rnd() * 0.4); }
  const wet = noise(0.8, 'pink'); bandpass(wet, (t) => 900 - t * 500, 1.4); wet.env(adsr(0.01, 0.12, 0.5, 0.5, 0.8));
  b.mix(wet, 0.03, 0.8);
  b.mix(thump(0.3, 120, 50, 12), 0, 0.8);
  return b.drive(1.8).normalize(0.9);
});
/** the load goes through the seam: a reversed rush sucked down into nothing */
defSound('press_seam', (v) => {
  setSeed(9850 + v);
  const b = new Buf(1.5);
  const rush = noise(1.3, 'pink'); bandpass(rush, (t) => 300 + t * 1600, 1.3); rush.env((t) => Math.min(1, t * 1.6) * Math.max(0, 1 - Math.max(0, t - 1.0) * 4));
  b.mix(rush, 0, 0.55);
  const tone = osc(1.3, 'sine', (t) => 90 + t * 260); tone.env(adsr(0.3, 0.3, 0.6, 0.4, 1.3));
  b.mix(tone, 0, 0.3);
  const shim = osc(1.0, 'tri', (t) => 1400 + Math.sin(t * 60) * 120); lowpass(shim, 3000); shim.env(perc(0.5, 3));
  b.mix(shim, 0.2, 0.12);
  return b.normalize(0.6);
});

// ---------------------------------------------------------------- the intake (first person)
/** fluorescent tubes: mains hum and a ticking ballast (loop) */
defLoopSound('ix_fluoro', () => {
  setSeed(9900);
  const len = 2;
  const b = osc(len, 'saw', 100); lowpass(b, 900);
  b.env(() => 0.35);
  const buzz = noise(len, 'white'); bandpass(buzz, 4200, 8); buzz.env((t) => 0.15 + 0.1 * Math.abs(Math.sin(t * 50)));
  b.mix(buzz, 0, 0.3);
  return b.normalize(0.4);
});
/** your own heartbeat, heard from inside (one beat, played on a timer) */
defSound('ix_heart', (v) => {
  const b = new Buf(0.5);
  b.mix(thump(0.18, 70 + v * 3, 38, 18), 0, 1);
  b.mix(thump(0.16, 64 + v * 3, 34, 20), 0.16, 0.7);
  lowpass(b, 300);
  return b.normalize(0.8);
});
/** the ring in your ears after a blow to the head */
defSound('ix_ring', () => {
  const b = new Buf(3.0);
  const r = osc(3.0, 'sine', 3900).env(adsr(0.02, 0.4, 0.5, 2.2, 3.0));
  b.mix(r, 0, 0.5);
  const r2 = osc(3.0, 'sine', 3920).env(adsr(0.02, 0.4, 0.4, 2.2, 3.0));
  b.mix(r2, 0, 0.3);
  return b.normalize(0.3);
});
/** a boot on concrete, close (the officers walking) */
defSound('ix_boot', (v) => {
  setSeed(9950 + v);
  const b = burst(0.08, 'pink', 1800, 200, 50);
  b.mix(thump(0.08, 160, 70, 40), 0, 0.6);
  return b.normalize(0.5);
});
/** the wall turning to liquid around you: a deep wet suck, then pressure */
defSound('ix_liquid', () => {
  setSeed(9970);
  const b = new Buf(2.2);
  const suck = noise(1.6, 'brown'); lowpass(suck, (t) => 1400 - t * 800); suck.env(adsr(0.05, 0.3, 0.7, 0.8, 1.6));
  b.mix(suck, 0, 0.8);
  const gl = osc(1.8, 'sine', (t) => 140 - t * 60 + Math.sin(t * 22) * 12); gl.env(adsr(0.1, 0.3, 0.6, 0.8, 1.8));
  b.mix(gl, 0.1, 0.5);
  const bub = new Buf(1.6);
  for (let i = 0; i < 10; i++) bub.mix(osc(0.06, 'sine', (t) => 300 + rnd() * 500 + t * 2000).env(decay(40)), rnd() * 1.4, 0.3);
  b.mix(bub, 0.2, 0.4);
  return b.normalize(0.75);
});
void highpass;
