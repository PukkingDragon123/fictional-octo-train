// Combat sound recipes (synthesised like every other sound in the game).
import { defSound, kit } from '../audio/sounds';
import { Buf, noise, osc, lowpass, highpass, bandpass, decay, adsr, perc, voice } from '../audio/synth';

const { thump, burst } = kit;

// a rising whine while a heavy blow is wound up (plays in short steps)
defSound('cb_charge', (v) => {
  const b = osc(0.32, 'saw', (t) => 160 + v * 40 + t * 260);
  lowpass(b, 900 + v * 200);
  const n = noise(0.32, 'pink'); bandpass(n, 500 + v * 80, 2);
  b.mix(n, 0, 0.5);
  return b.env(adsr(0.04, 0.05, 0.7, 0.12, 0.32)).normalize(0.22);
});
// the moment it is full: a bright ping (release now)
defSound('cb_ready', () => {
  const b = new Buf(0.4);
  b.mix(osc(0.35, 'sine', 1320).env(decay(9)), 0, 0.6);
  b.mix(osc(0.3, 'sine', 1980).env(decay(12)), 0.01, 0.35);
  b.mix(burst(0.04, 'white', 9000, 3000, 80), 0, 0.3);
  return b.normalize(0.5);
});
// a big swing tearing the air
defSound('cb_whoosh_big', (v) => {
  const b = noise(0.45, 'pink');
  bandpass(b, (t) => 220 + t * 2000 + v * 60, 1.1);
  return b.env(adsr(0.06, 0.08, 0.7, 0.2, 0.45)).normalize(0.5);
});
// a heavy blow landing: low punch, crunch, ring-out
defSound('cb_impact', (v) => {
  const b = new Buf(0.7);
  b.mix(thump(0.45, 120 + v * 8, 32, 9), 0, 1);
  b.mix(burst(0.18, 'brown', 1100, 40, 18), 0, 0.9);
  const cr = noise(0.12, 'white'); bandpass(cr, 2400 + v * 300, 3); cr.env(perc(0.002, 40));
  b.mix(cr, 0.008, 0.6);
  return b.drive(3.2).normalize(0.95);
});
// boot heel into something on the floor
defSound('cb_stomp', (v) => {
  const b = new Buf(0.55);
  b.mix(thump(0.3, 95 + v * 6, 30, 14), 0, 1);
  b.mix(burst(0.1, 'brown', 800, 40, 30), 0, 0.8);
  const crack = noise(0.06, 'white'); highpass(crack, 1800); crack.env(perc(0.001, 70));
  b.mix(crack, 0.012, 0.7);
  return b.drive(2.6).normalize(0.9);
});
// a quick light connect (barrage jabs)
defSound('cb_jab', (v) => {
  const b = new Buf(0.15);
  b.mix(thump(0.1, 210 + v * 20, 90, 40), 0, 0.8);
  b.mix(burst(0.05, 'pink', 2400, 300, 70), 0, 0.5);
  return b.normalize(0.5);
});
// tearing loose from a grip
defSound('cb_break', () => {
  const b = new Buf(0.6);
  b.mix(burst(0.25, 'pink', 2500, 200, 12), 0, 0.8);
  b.mix(thump(0.25, 170, 60, 14), 0, 0.7);
  b.mix(voice(0.4, (t) => 180 - t * 60, [[600, 1], [1500, 0.5]], 0.3), 0.04, 0.5);
  return b.normalize(0.75);
});
// a well-timed dodge / perfect strike: a reversed chime, the world slows
defSound('cb_perfect', () => {
  const b = new Buf(0.8);
  const s = osc(0.7, 'sine', (t) => 520 + t * 900); s.env(adsr(0.25, 0.1, 0.5, 0.3, 0.7));
  b.mix(s, 0, 0.5);
  const s2 = osc(0.6, 'tri', (t) => 780 + t * 1300); s2.env(adsr(0.2, 0.1, 0.4, 0.3, 0.6));
  b.mix(s2, 0.05, 0.3);
  return b.normalize(0.45);
});
// QTE prompt tick / success / fail
defSound('cb_tick', () => osc(0.05, 'square', 1500).env(decay(90)).normalize(0.25));
defSound('cb_good', () => { const b = new Buf(0.2); b.mix(osc(0.12, 'square', 880).env(decay(30)), 0, 0.5); b.mix(osc(0.12, 'square', 1320).env(decay(30)), 0.05, 0.5); lowpass(b, 4000); return b.normalize(0.35); });
defSound('cb_miss', () => { const b = osc(0.25, 'saw', (t) => 220 - t * 300); lowpass(b, 1200); return b.env(decay(10)).normalize(0.35); });
// execution sting: a low drone swell with a metal scrape
defSound('cb_exec', (v) => {
  const b = new Buf(1.4);
  const d = osc(1.3, 'saw', 55 + v * 2); lowpass(d, 300); d.env(adsr(0.15, 0.3, 0.6, 0.7, 1.3));
  b.mix(d, 0, 0.7);
  const sc = noise(0.9, 'white'); bandpass(sc, (t) => 3000 - t * 1500, 6); sc.env(adsr(0.3, 0.2, 0.4, 0.3, 0.9));
  b.mix(sc, 0.1, 0.35);
  return b.normalize(0.6);
});
// a combat grunt (struggling, heavy effort)
defSound('cb_grunt', (v) => voice(0.32, (t) => 150 + v * 15 - t * 70, [[650, 1], [1150, 0.5], [2500, 0.2]], 0.35).env(perc(0.02, 7)).normalize(0.5));
