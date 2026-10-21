// Sound recipes for cyberware (src/survival/cyber.ts) and the operating table
// (src/ui/surgery): scrap clanks, servo whine, the bone saw, weld crackle,
// bolt ratchets, hydraulic hiss, monitor beeps. Synthesised on first use.
import { defSound, kit } from './sounds';
import { Buf, noise, osc, lowpass, highpass, bandpass, decay, adsr, rnd, setSeed } from './synth';

const { thump, burst } = kit;

/** scrap metal knocking at every other step */
defSound('cy_clank', (v) => {
  setSeed(9100 + v * 17);
  const b = new Buf(0.4);
  for (const f of [420, 1130, 1870, 2950]) b.mix(osc(0.35, 'sine', f * (0.96 + rnd() * 0.08)).env(decay(14 + rnd() * 12)), 0, 0.22);
  b.mix(burst(0.04, 'white', 5000, 900, 90), 0, 0.5);
  b.mix(thump(0.12, 160, 60, 30), 0, 0.5);
  return b.drive(1.4).normalize(0.75);
});
/** a rusted joint: a squeal over the clank */
defSound('cy_squeal', (v) => {
  setSeed(9200 + v * 7);
  const b = new Buf(0.5);
  const f0 = 1400 + rnd() * 900;
  b.mix(osc(0.42, 'saw', (t) => f0 + Math.sin(t * 60) * 120 + t * 800).env(adsr(0.03, 0.1, 0.5, 0.2, 0.42)), 0.02, 0.18);
  b.mix(burst(0.05, 'white', 4000, 800, 70), 0, 0.4);
  const r = b; bandpass(r, 2200, 0.8);
  return r.drive(1.6).normalize(0.6);
});
/** servo whine (short) */
defSound('cy_servo', (v) => {
  setSeed(9300 + v);
  const b = new Buf(0.55);
  const up = v % 2 === 0;
  b.mix(osc(0.5, 'square', (t) => (up ? 380 + t * 900 : 820 - t * 700)).env(adsr(0.04, 0.1, 0.6, 0.15, 0.5)), 0, 0.12);
  b.mix(osc(0.5, 'sine', (t) => (up ? 760 + t * 1800 : 1640 - t * 1400)).env(adsr(0.04, 0.1, 0.6, 0.15, 0.5)), 0, 0.2);
  const n = noise(0.5, 'pink'); bandpass(n, 1200, 2); n.env(adsr(0.04, 0.1, 0.5, 0.15, 0.5)); b.mix(n, 0, 0.15);
  return b.normalize(0.55);
});
/** the bone saw biting: a howling disc, meat and bone in it */
defSound('cy_saw', (v) => {
  setSeed(9400 + v * 3);
  const L = 1.6;
  const b = new Buf(L);
  const f = (t: number) => 210 - Math.min(1, t / 0.25) * 40 + Math.sin(t * 9) * 12 - (t > 0.3 ? 30 : 0);
  b.mix(osc(L, 'saw', f).env(adsr(0.05, 0.2, 0.8, 0.3, L)), 0, 0.3);
  b.mix(osc(L, 'saw', (t) => f(t) * 2.01).env(adsr(0.05, 0.2, 0.7, 0.3, L)), 0, 0.18);
  const grind = noise(L, 'white'); bandpass(grind, (t) => 2400 + Math.sin(t * 13) * 600, 1.3); grind.env(adsr(0.25, 0.2, 0.7, 0.3, L)); b.mix(grind, 0, 0.5);
  const wet = noise(L, 'brown'); lowpass(wet, 700); wet.env((t) => (t > 0.25 ? 0.6 + 0.4 * Math.sin(t * 31) : 0) * Math.exp(-Math.max(0, t - 1.1) * 4)); b.mix(wet, 0, 0.55);
  for (let i = 0; i < 6; i++) { const c = noise(0.015, 'white'); bandpass(c, 2600 + rnd() * 2400, 3); c.env(decay(200)); b.mix(c, 0.35 + i * 0.12 + rnd() * 0.05, 0.5); }
  return b.drive(2.2).normalize(0.85);
});
/** a wet slap: a limb landing in a steel tray */
defSound('cy_splat', (v) => {
  setSeed(9500 + v * 5);
  const b = new Buf(0.6);
  b.mix(thump(0.3, 140, 50, 14), 0, 0.9);
  const sl = burst(0.12, 'white', 3000, 400, 30); bandpass(sl, 1200, 0.8); b.mix(sl, 0, 0.8);
  for (const f of [620, 1480, 2630]) b.mix(osc(0.5, 'sine', f).env(decay(9)), 0.005, 0.12);
  return b.drive(1.5).normalize(0.85);
});
/** weld / bolt-in crackle */
defSound('cy_spark', (v) => {
  setSeed(9600 + v * 11);
  const b = new Buf(0.7);
  for (let i = 0; i < 26; i++) { const c = noise(0.006 + rnd() * 0.01, 'white'); highpass(c, 2500); c.env(decay(300)); b.mix(c, rnd() * 0.65, 0.4 + rnd() * 0.6); }
  const hum = osc(0.7, 'saw', 100); lowpass(hum, 400); hum.env(adsr(0.02, 0.1, 0.5, 0.2, 0.7)); b.mix(hum, 0, 0.2);
  return b.normalize(0.7);
});
/** a power driver running a bolt home */
defSound('cy_bolt', (v) => {
  setSeed(9700 + v * 13);
  const b = new Buf(0.6);
  b.mix(osc(0.45, 'square', (t) => 260 + t * 300).env(adsr(0.02, 0.05, 0.7, 0.1, 0.45)), 0, 0.12);
  for (let i = 0; i < 9; i++) b.mix(burst(0.02, 'white', 6000, 1500, 200), 0.02 + i * 0.045, 0.35);
  b.mix(thump(0.1, 300, 120, 40), 0.46, 0.7);
  for (const f of [900, 2300]) b.mix(osc(0.2, 'sine', f).env(decay(25)), 0.46, 0.2);
  return b.normalize(0.7);
});
/** hydraulic hiss / clamp */
defSound('cy_hiss', (v) => {
  setSeed(9800 + v);
  const b = new Buf(0.7);
  const n = noise(0.7, 'white'); highpass(n, 1800); n.env(adsr(0.01, 0.1, 0.5, 0.3, 0.7)); b.mix(n, 0, 0.35);
  b.mix(thump(0.15, 120, 50, 25), 0, 0.6);
  b.mix(osc(0.12, 'square', 90).env(decay(30)), 0.02, 0.2);
  return b.normalize(0.65);
});
/** a monitor beep */
defSound('cy_beep', () => {
  const b = new Buf(0.14);
  b.mix(osc(0.12, 'square', 1240).env(adsr(0.003, 0.02, 0.6, 0.04, 0.12)), 0, 0.2);
  b.mix(osc(0.12, 'sine', 2480).env(decay(30)), 0, 0.1);
  return b.normalize(0.4);
});
/** hardware torn off at the socket */
defSound('cy_rip', (v) => {
  setSeed(9900 + v * 3);
  const b = new Buf(0.9);
  b.mix(osc(0.35, 'saw', (t) => 900 - t * 2000).env(decay(9)), 0, 0.3);
  for (let i = 0; i < 18; i++) { const c = noise(0.008, 'white'); highpass(c, 3000); c.env(decay(250)); b.mix(c, rnd() * 0.5, 0.5); }
  for (const f of [310, 870, 1650]) b.mix(osc(0.8, 'sine', f).env(decay(8)), 0.04, 0.2);
  b.mix(thump(0.2, 200, 60, 18), 0, 0.8);
  return b.drive(1.8).normalize(0.85);
});
defSound('cy_powerdown', () => {
  const b = new Buf(0.9);
  b.mix(osc(0.85, 'sine', (t) => 900 * Math.exp(-t * 3) + 60).env(adsr(0.01, 0.2, 0.6, 0.4, 0.85)), 0, 0.3);
  b.mix(osc(0.85, 'square', (t) => 450 * Math.exp(-t * 3) + 30).env(adsr(0.01, 0.2, 0.4, 0.4, 0.85)), 0, 0.08);
  return b.normalize(0.5);
});
defSound('cy_powerup', () => {
  const b = new Buf(0.7);
  b.mix(osc(0.6, 'sine', (t) => 120 + t * 1600).env(adsr(0.02, 0.2, 0.6, 0.2, 0.6)), 0, 0.3);
  b.mix(osc(0.6, 'square', (t) => 60 + t * 800).env(adsr(0.02, 0.2, 0.4, 0.2, 0.6)), 0, 0.06);
  b.mix(osc(0.1, 'sine', 1760).env(decay(30)), 0.55, 0.2);
  return b.normalize(0.5);
});
/** the robot's heavy step / gantry clunk */
defSound('cy_thunk', (v) => {
  setSeed(10000 + v);
  const b = new Buf(0.5);
  b.mix(thump(0.4, 90, 35, 10), 0, 1);
  b.mix(burst(0.06, 'pink', 1500, 100, 40), 0, 0.5);
  for (const f of [210, 530]) b.mix(osc(0.4, 'sine', f).env(decay(12)), 0.005, 0.15);
  return b.drive(1.3).normalize(0.8);
});
