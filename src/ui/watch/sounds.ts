// The watch's voice: servo whir on the raise, a two-tone upload chime, ticks,
// the research unlock arpeggio and the multi-tool's laser.
import { defSound, kit } from '../../audio/sounds';
import { Buf, noise, osc, lowpass, highpass, decay, adsr } from '../../audio/synth';

const chirp = (f: number, len = 0.09, k = 30) => osc(len, 'sine', f).env(decay(k));

defSound('watchUp', () => {
  const b = new Buf(0.5);
  const servo = osc(0.26, 'saw', (t) => 180 + t * 700); lowpass(servo, 1100); servo.env(adsr(0.02, 0.08, 0.5, 0.1, 0.26));
  b.mix(servo, 0, 0.14);
  b.mix(kit.clickS(2200, 0.015), 0.24, 0.5);
  b.mix(chirp(1320), 0.3, 0.22);
  b.mix(chirp(1980), 0.36, 0.18);
  return b.normalize(0.42);
});
defSound('watchDown', () => {
  const b = new Buf(0.36);
  const servo = osc(0.22, 'saw', (t) => 760 - t * 1500); lowpass(servo, 900); servo.env(adsr(0.01, 0.06, 0.5, 0.1, 0.22));
  b.mix(servo, 0, 0.12);
  b.mix(kit.clickS(1500, 0.02), 0.2, 0.5);
  return b.normalize(0.36);
});
defSound('watchTick', () => { const b = new Buf(0.1); b.mix(kit.clickS(3200, 0.01), 0, 0.5); b.mix(chirp(2600, 0.05, 60), 0.005, 0.25); return b.normalize(0.3); });
defSound('watchDeny', () => { const b = new Buf(0.25); b.mix(osc(0.09, 'square', 220).env(decay(25)), 0, 0.3); b.mix(osc(0.09, 'square', 180).env(decay(25)), 0.11, 0.3); lowpass(b, 1800); return b.normalize(0.3); });
// incoming quest: carrier hiss, then a rising two-tone and a data trill
defSound('questChime', () => {
  const b = new Buf(1.1);
  const hiss = noise(0.18, 'white'); highpass(hiss, 3000); hiss.env(decay(14)); b.mix(hiss, 0, 0.08);
  b.mix(chirp(880, 0.25, 9), 0.06, 0.32);
  b.mix(chirp(1318.5, 0.35, 7), 0.2, 0.32);
  for (let i = 0; i < 6; i++) b.mix(osc(0.03, 'square', 2400 + (i % 2) * 600).env(decay(90)), 0.42 + i * 0.045, 0.07);
  b.mix(chirp(1760, 0.4, 6), 0.72, 0.18);
  return b.normalize(0.5);
});
defSound('questDone', () => {
  const b = new Buf(1.2);
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => b.mix(chirp(f, 0.4, 7), i * 0.09, 0.28));
  b.mix(chirp(2093, 0.6, 5), 0.38, 0.12);
  return b.normalize(0.5);
});
defSound('nodeUnlock', () => {
  const b = new Buf(1.0);
  const sweep = osc(0.45, 'saw', (t) => 300 + t * 2400); lowpass(sweep, 2600); sweep.env(adsr(0.01, 0.1, 0.4, 0.2, 0.45));
  b.mix(sweep, 0, 0.12);
  [987.77, 1318.5, 1975.5].forEach((f, i) => b.mix(chirp(f, 0.3, 9), 0.18 + i * 0.07, 0.25));
  return b.normalize(0.48);
});
defSound('laserZap', () => {
  const b = new Buf(0.3);
  const z = osc(0.28, 'saw', (t) => 1400 - t * 2600); z.env(decay(10)); lowpass(z, 4000);
  b.mix(z, 0, 0.25);
  const n = noise(0.2, 'white'); highpass(n, 2500); n.env(decay(18)); b.mix(n, 0, 0.12);
  return b.normalize(0.4);
});
defSound('laserHum', () => {
  const b = new Buf(0.32);
  const h = osc(0.32, 'saw', (t) => 220 + Math.sin(t * 90) * 18); lowpass(h, 1500);
  b.mix(h, 0, 0.18);
  const n = noise(0.32, 'pink'); highpass(n, 1800); b.mix(n, 0, 0.06);
  return b.normalize(0.32);
});
