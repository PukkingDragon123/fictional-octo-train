// Sounds for the social layer and the shared floors: four whistles (a hey-o,
// a come-here, an alarm trill, a little tune), the wind of a hole, the fall,
// the landing, and the chessboard (tick, tock, slam, a piece shattering), and
// the pop of a bubble.
import { defSound, defLoopSound } from '../audio/sounds';
import { Buf, noise, osc, lowpass, bandpass, highpass, decay } from '../audio/synth';

/** a whistled note sequence: [freq, secs, slideTo?] */
function whistle(notes: [number, number, number?][], vib = 5, breath = 0.12) {
  return (v: number) => {
    const total = notes.reduce((s, n) => s + n[1], 0) + 0.15;
    const b = new Buf(total);
    let at = 0;
    for (const [f0, len, f1] of notes) {
      const det = 1 + (v % 5 - 2) * 0.006;
      const tone = osc(len, 'sine', (t) => (f0 + ((f1 ?? f0) - f0) * Math.min(1, t / len)) * det * (1 + Math.sin(t * Math.PI * 2 * vib) * 0.008));
      const env = (t: number) => Math.min(1, t / 0.03) * Math.min(1, (len - t) / 0.05);
      tone.env(env);
      const air = noise(len, 'white'); bandpass(air, f0 * det, 4); air.env(env);
      b.mix(tone, at, 0.8); b.mix(air, at, breath);
      at += len;
    }
    return b.fade(0.005, 0.05).normalize(0.7);
  };
}
defSound('vx_whistle_0', whistle([[1650, 0.16, 2100], [2100, 0.05], [1500, 0.28, 1180]]));          // hey-o
defSound('vx_whistle_1', whistle([[1200, 0.12], [1500, 0.12], [1900, 0.32, 2300]]));                // come here
defSound('vx_whistle_2', whistle([[2200, 0.07], [1800, 0.07], [2200, 0.07], [1800, 0.07], [2200, 0.07], [1800, 0.07], [2400, 0.2]], 9)); // alarm trill
defSound('vx_whistle_3', whistle([[1320, 0.14], [1480, 0.14], [1660, 0.14], [1320, 0.14], [1980, 0.3], [1760, 0.36]])); // a tune

// the draft out of a hole: low, breathing wind
defLoopSound('vx_hole_wind', () => {
  const b = noise(4, 'brown');
  lowpass(b, (t) => 260 + Math.sin(t * Math.PI * 0.5) * 120, 0.8);
  const hiss = noise(4, 'pink'); bandpass(hiss, (t) => 700 + Math.sin(t * Math.PI) * 200, 0.7);
  b.mix(hiss, 0, 0.25);
  return b.env((t) => 0.75 + Math.sin(t * Math.PI * 0.5) * 0.25).normalize(0.6);
});
// falling: a rising roar
defSound('vx_fall_wind', () => {
  const b = noise(3.2, 'pink');
  bandpass(b, (t) => 300 + t * t * 260, 0.6);
  const low = noise(3.2, 'brown'); lowpass(low, 180);
  b.mix(low, 0, 0.8);
  return b.env((t) => Math.min(1, t / 0.6) * (0.6 + t * 0.15)).fade(0.01, 0.4).normalize(0.8);
});
defSound('vx_land', () => {
  const b = new Buf(1.0);
  b.mix(osc(0.5, 'sine', (t) => 40 + 70 * Math.exp(-t * 14)).env(decay(7)), 0, 1);
  const crack = noise(0.3, 'white'); lowpass(crack, 1800); b.mix(crack.env(decay(22)), 0, 0.6);
  const dust = noise(0.9, 'pink'); highpass(dust, 600); b.mix(dust.env(decay(4)), 0.03, 0.25);
  return b.normalize(0.9);
});
// the chessboard
defSound('vx_tick', () => { const b = noise(0.06, 'white'); bandpass(b, 3200, 6); return b.env(decay(90)).normalize(0.6); });
defSound('vx_tock', () => { const b = noise(0.08, 'white'); bandpass(b, 1900, 5); return b.env(decay(70)).normalize(0.6); });
defSound('vx_slam', () => {
  const b = new Buf(2.2);
  b.mix(osc(1.4, 'sine', (t) => 32 + 60 * Math.exp(-t * 9)).env(decay(3)), 0, 1);
  const stone = noise(0.5, 'white'); lowpass(stone, 2400); b.mix(stone.env(decay(14)), 0, 0.7);
  const rumble = noise(2.2, 'brown'); lowpass(rumble, 140); b.mix(rumble.env(decay(2)), 0, 0.6);
  return b.normalize(0.95);
});
defSound('vx_lift', () => { const b = noise(0.9, 'brown'); lowpass(b, (t) => 120 + t * 300); return b.env((t) => Math.sin(Math.min(1, t / 0.9) * Math.PI)).normalize(0.5); });
defSound('vx_shatter', () => {
  const b = new Buf(1.6);
  for (let i = 0; i < 9; i++) { const n = noise(0.2, 'white'); bandpass(n, 900 + i * 380, 3); b.mix(n.env(decay(18)), i * 0.05 + (i % 3) * 0.02, 0.5); }
  b.mix(osc(0.8, 'sine', (t) => 60 * Math.exp(-t * 3) + 30).env(decay(5)), 0, 0.8);
  return b.normalize(0.9);
});
defSound('vx_pop', (v) => {
  const b = new Buf(0.25);
  b.mix(osc(0.12, 'sine', (t) => 900 + v * 40 - t * 5000).env(decay(40)), 0, 0.9);
  const sp = noise(0.08, 'white'); highpass(sp, 3000); b.mix(sp.env(decay(70)), 0, 0.5);
  return b.normalize(0.75);
});
