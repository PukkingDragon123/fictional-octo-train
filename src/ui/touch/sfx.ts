// Mechanical sounds for the physical touch controls: valve creaks and ratchet
// clicks, arcade-button clacks, toggle snaps, a bottle cap's tin "tonk",
// ball-chain rattles... all synthesised like every other sound in the game.
import { Buf, noise, osc, lowpass, highpass, bandpass, comb, decay, perc, rnd } from '../../audio/synth';
import { defSound } from '../../audio/sounds';
import { G } from '../../game/G';
import { buzz } from './mode';

const burst = (len: number, color: 'white' | 'pink' | 'brown', lp: number, hp: number, k: number) => { const b = noise(len, color); lowpass(b, lp); if (hp) highpass(b, hp); return b.env(decay(k)); };
const thump = (len: number, f0: number, f1: number, k: number) => osc(len, 'sine', (t) => f1 + (f0 - f1) * Math.exp(-t * 30)).env(decay(k));
const tick = (f: number, len = 0.015) => osc(len, 'square', f).env(decay(380));
/** metallic ring: a few inharmonic partials */
const ring = (f: number, len: number, k: number, parts = [1, 2.76, 5.4]) => {
  const b = new Buf(len);
  parts.forEach((m, i) => b.mix(osc(len, 'sine', f * m).env(decay(k * (1 + i * 0.8))), 0, 1 / (1 + i)));
  return b;
};

// ---- valve wheel
defSound('tc_creak', (v) => {
  // stick-slip friction: a train of tiny grabs at a wandering rate, through a woody body resonance
  const len = 0.42 + v * 0.06;
  const b = new Buf(len);
  let t = 0;
  const base = 38 + v * 9;
  while (t < len - 0.02) {
    const rate = base * (1 + 0.5 * Math.sin(t * 9 + v) + (rnd() - 0.5) * 0.3);
    b.mix(burst(0.012, 'white', 3000, 300, 260), t, 0.5 + rnd() * 0.5);
    t += 1 / rate;
  }
  bandpass(b, (tt) => 420 + v * 60 + Math.sin(tt * 7) * 80, 2.2);
  b.env((tt) => Math.sin(Math.PI * Math.min(1, tt / len)) ** 0.6);
  comb(b, 0.0061 + v * 0.0007, 0.55, 0.4);
  return b.normalize(0.55);
});
defSound('tc_squeak', (v) => {
  const len = 0.16 + v * 0.05;
  const f0 = 1500 + v * 260;
  const b = osc(len, 'tri', (t) => f0 + Math.sin(t * 70) * 90 + t * 900 * (v % 2 ? -1 : 1));
  bandpass(b, f0, 3);
  b.env(perc(0.02, 10));
  return b.normalize(0.32);
});
defSound('tc_ratchet', (v) => {
  const b = new Buf(0.06);
  b.mix(tick(2600 + v * 300, 0.008), 0, 0.8);
  b.mix(burst(0.02, 'white', 9000, 2000, 300), 0, 0.5);
  b.mix(ring(3400 + v * 200, 0.05, 90), 0.002, 0.25);
  return b.normalize(0.5);
});
defSound('tc_clunk', (v) => {
  const b = new Buf(0.2);
  b.mix(thump(0.16, 160 + v * 12, 70, 30), 0, 0.9);
  b.mix(burst(0.04, 'pink', 2400, 200, 90), 0, 0.5);
  b.mix(ring(620 + v * 40, 0.15, 30), 0.003, 0.18);
  return b.normalize(0.6);
});
defSound('tc_hiss', (v) => {
  const b = noise(0.7, 'white');
  highpass(b, 2400 + v * 300); bandpass(b, 5200, 0.7);
  b.env((t) => Math.min(1, t / 0.03) * Math.exp(-t * 3.2));
  return b.normalize(0.35);
});

// ---- buttons
defSound('tc_clack', (v) => {
  // a heavy arcade microswitch: plunger hits the housing, the switch snaps, the plastic body rings
  const b = new Buf(0.16);
  b.mix(thump(0.1, 210 + v * 15, 90, 42), 0, 0.9);
  b.mix(tick(1900 + v * 120, 0.012), 0.004, 0.7);
  b.mix(burst(0.03, 'white', 6000, 900, 140), 0.003, 0.55);
  const body = burst(0.08, 'pink', 2000, 400, 45); bandpass(body, 900 + v * 80, 4);
  b.mix(body, 0.005, 0.6);
  return b.normalize(0.75);
});
defSound('tc_clack_up', (v) => {
  const b = new Buf(0.08);
  b.mix(tick(2400 + v * 150, 0.008), 0, 0.6);
  b.mix(burst(0.02, 'white', 7000, 1200, 200), 0, 0.4);
  b.mix(thump(0.05, 300, 160, 70), 0.002, 0.35);
  return b.normalize(0.45);
});
defSound('tc_toggle', (v) => {
  // toggle snap: a hard click and a short spring twang
  const b = new Buf(0.22);
  b.mix(tick(3100 + v * 200, 0.006), 0, 0.9);
  b.mix(burst(0.015, 'white', 9000, 2500, 260), 0, 0.7);
  const tw = osc(0.2, 'saw', 410 + v * 30); lowpass(tw, 1800); tw.env(decay(26));
  b.mix(tw, 0.004, 0.18);
  b.mix(thump(0.06, 260, 120, 60), 0, 0.4);
  return b.normalize(0.65);
});
defSound('tc_cover', (v) => {
  const b = new Buf(0.12);
  b.mix(burst(0.05, 'pink', 3500, 400, 70), 0, 0.8);
  b.mix(tick(1200 + v * 100, 0.01), 0.01, 0.5);
  b.mix(thump(0.06, 340, 180, 60), 0.008, 0.5);
  return b.normalize(0.5);
});
defSound('tc_cap', (v) => {
  // an oil-can "tonk": a thin tin disc snapping through
  const b = new Buf(0.14);
  b.mix(ring(1750 + v * 140, 0.12, 38, [1, 1.62, 2.9, 4.2]), 0, 0.7);
  b.mix(tick(4200, 0.004), 0, 0.6);
  b.mix(burst(0.01, 'white', 9000, 3000, 300), 0, 0.4);
  return b.normalize(0.5);
});
defSound('tc_bar', (v) => {
  // fire-exit crash bar: the bar bottoms out, the latch rattles
  const b = new Buf(0.32);
  b.mix(thump(0.2, 140 + v * 10, 60, 18), 0, 1);
  b.mix(ring(480 + v * 30, 0.28, 14), 0.002, 0.25);
  for (let i = 0; i < 4; i++) b.mix(tick(1600 + rnd() * 900, 0.006), 0.03 + i * 0.022 + rnd() * 0.01, 0.35 - i * 0.06);
  b.mix(burst(0.06, 'pink', 3000, 200, 50), 0, 0.5);
  return b.normalize(0.75);
});
defSound('tc_squish', (v) => {
  const b = burst(0.16, 'pink', 1400 + v * 200, 120, 22);
  b.mix(burst(0.1, 'brown', 600, 0, 30), 0.02, 0.6);
  return b.normalize(0.45);
});
defSound('tc_chain', (v) => {
  // ball chain rattle, then the socket switch: click-CLUNK
  const b = new Buf(0.34);
  for (let i = 0; i < 9; i++) b.mix(tick(4000 + rnd() * 3000, 0.004), i * 0.012 + rnd() * 0.006, 0.25 + rnd() * 0.2);
  b.mix(tick(2100 + v * 100, 0.01), 0.1, 0.9);
  b.mix(thump(0.08, 300, 140, 50), 0.1, 0.5);
  b.mix(ring(2600, 0.1, 50), 0.1, 0.2);
  return b.normalize(0.6);
});
defSound('tc_pea', (v) => {
  // the pea rattling inside a whistle that nobody blew
  const b = new Buf(0.24);
  for (let i = 0; i < 7; i++) b.mix(ring(3300 + rnd() * 900 + v * 100, 0.04, 120), i * 0.028 + rnd() * 0.01, 0.6 - i * 0.07);
  return b.normalize(0.4);
});
defSound('tc_key', (v) => {
  // tape-deck piano key: a long lever, a latch, the mechanism thunk
  const b = new Buf(0.2);
  b.mix(thump(0.12, 180 + v * 10, 80, 32), 0.01, 0.9);
  b.mix(tick(1400 + v * 120, 0.012), 0, 0.6);
  b.mix(burst(0.05, 'pink', 2600, 300, 70), 0.008, 0.5);
  b.mix(ring(900, 0.12, 35), 0.012, 0.15);
  return b.normalize(0.6);
});
defSound('tc_shutter', (v) => {
  const b = new Buf(0.32);
  b.mix(tick(2600 + v * 100, 0.006), 0, 0.8);
  b.mix(burst(0.03, 'white', 8000, 1500, 120), 0.004, 0.7);
  // the thumbwheel's ratchet afterwards
  for (let i = 0; i < 4; i++) b.mix(tick(3200 + rnd() * 600, 0.004), 0.14 + i * 0.035, 0.3);
  return b.normalize(0.55);
});
defSound('tc_paper', (v) => {
  const b = new Buf(0.3);
  for (let i = 0; i < 6; i++) { const c = burst(0.05, 'white', 7000, 1200 + rnd() * 800, 40); b.mix(c, i * 0.035 + rnd() * 0.02, 0.4 + rnd() * 0.5); }
  void v;
  return b.normalize(0.4);
});
defSound('tc_zip', (v) => {
  const b = new Buf(0.3);
  let t = 0;
  while (t < 0.26) { b.mix(tick(1800 + rnd() * 1400, 0.003), t, 0.35); t += 0.006 + rnd() * 0.004; }
  bandpass(b, 2600 + v * 200, 1.2);
  b.env((tt) => Math.sin(Math.PI * Math.min(1, tt / 0.28)));
  return b.normalize(0.4);
});
defSound('tc_ign', (v) => {
  // a key turning in a worn lock: two detents
  const b = new Buf(0.24);
  b.mix(tick(2200 + v * 100, 0.01), 0, 0.7);
  b.mix(ring(2900, 0.06, 80), 0, 0.2);
  b.mix(tick(1800 + v * 100, 0.012), 0.11, 0.8);
  b.mix(thump(0.06, 280, 150, 60), 0.11, 0.4);
  return b.normalize(0.55);
});
defSound('tc_knob', (v) => {
  const b = new Buf(0.14);
  b.mix(tick(1500 + v * 90, 0.012), 0, 0.8);
  b.mix(thump(0.08, 320, 150, 50), 0, 0.6);
  b.mix(burst(0.02, 'white', 7000, 1500, 200), 0, 0.3);
  return b.normalize(0.5);
});
defSound('tc_zap', (v) => {
  // the band's shock jumping into the controls
  const b = new Buf(0.4);
  const buzzW = osc(0.38, 'square', (t) => 110 + Math.sin(t * 90) * 30 + v * 8); lowpass(buzzW, 3000); buzzW.env(perc(0.005, 7));
  b.mix(buzzW, 0, 0.4);
  for (let i = 0; i < 10; i++) b.mix(burst(0.012, 'white', 12000, 3000, 300), rnd() * 0.32, 0.5 + rnd() * 0.5);
  return b.normalize(0.6);
});
defSound('tc_tick', (v) => tick(3400 + v * 300, 0.006).normalize(0.3));

let lastAt: Record<string, number> = {};
/** play a control sound on the UI bus (rate-limited per key) */
export function sfx(key: string, vol = 0.5, rate = 1, minGap = 0.025) {
  const now = performance.now() / 1000;
  if (now - (lastAt[key] ?? -1) < minGap) return;
  lastAt[key] = now;
  try { G.audio?.flat?.(key, 'ui', vol, rate * (1 + (Math.random() - 0.5) * 0.06)); } catch { /* audio not ready */ }
}
export function resetSfx() { lastAt = {}; }
/** haptics (touch mode only) */
export function haptic(ms: number | number[]) {
  // browsers refuse (and log) vibration before the first tap
  const ua = (navigator as any).userActivation;
  if (ua && !ua.hasBeenActive) return;
  buzz(ms);
}
