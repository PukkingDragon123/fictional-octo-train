// Surgery sounds: the body hitting the floor, a bone saw's rasp, the skull
// cap cracking free, the wet rip, clamps biting, and the cortex booting up.
import { defSound, kit } from '../audio/sounds';
import { Buf, osc, noise, lowpass, highpass, bandpass, decay, adsr, rnd } from '../audio/synth';

let done = false;
export function domSounds() {
  if (done) return; done = true;
  const { thump, burst } = kit;
  defSound('dom_down', (v) => {
    const b = new Buf(0.7);
    b.mix(thump(0.3, 140 + v * 6, 40, 12), 0, 1);
    b.mix(burst(0.25, 'brown', 500, 40, 10), 0.01, 0.7);
    b.mix(burst(0.12, 'pink', 2400, 600, 30), 0.03, 0.25);
    return b.normalize(0.8);
  });
  defSound('dom_saw', (v) => {
    const b = noise(0.32, 'white');
    bandpass(b, (t) => 1100 + Math.sin(t * 40 + v) * 500 + t * 900, 2.4);
    const grit = noise(0.32, 'pink'); highpass(grit, 3000);
    b.mix(grit.env((t) => (Math.sin(t * 90) > 0.3 ? 0.6 : 0.1)), 0, 0.5);
    return b.env(adsr(0.02, 0.04, 0.8, 0.08, 0.32)).normalize(0.5);
  });
  defSound('dom_crack', () => {
    const b = new Buf(0.4);
    for (let i = 0; i < 5; i++) b.mix(burst(0.03, 'white', 6000, 900, 120), i * 0.018 + rnd() * 0.01, 0.6);
    b.mix(thump(0.2, 260, 90, 18), 0.02, 0.6);
    return b.normalize(0.7);
  });
  defSound('dom_rip', () => {
    const b = new Buf(0.9);
    const s = noise(0.7, 'pink'); bandpass(s, (t) => 300 + t * 1400, 1.2); s.env(adsr(0.01, 0.1, 0.7, 0.3, 0.7));
    b.mix(s, 0, 0.8);
    for (let i = 0; i < 8; i++) { const p = noise(0.06, 'brown'); lowpass(p, 900); b.mix(p.env(decay(40)), 0.08 + i * 0.07 + rnd() * 0.03, 0.5); }
    b.mix(thump(0.25, 180, 60, 14), 0.55, 0.6);
    return b.normalize(0.85);
  });
  defSound('dom_clamp', () => {
    const b = new Buf(0.5);
    b.mix(osc(0.18, 'square', 520).env(decay(30)), 0, 0.3);
    b.mix(burst(0.04, 'white', 7000, 2000, 90), 0.0, 0.5);
    const ring = osc(0.4, 'sine', 1840).env(decay(9)); b.mix(ring, 0.01, 0.25);
    b.mix(burst(0.04, 'white', 7000, 2000, 90), 0.12, 0.45);
    return b.normalize(0.6);
  });
  defSound('dom_boot', () => {
    const b = new Buf(1.6);
    const whine = osc(1.1, 'saw', (t) => 80 + t * t * 900); lowpass(whine, 2400); whine.env(adsr(0.05, 0.2, 0.7, 0.3, 1.1));
    b.mix(whine, 0, 0.35);
    for (let i = 0; i < 3; i++) b.mix(osc(0.08, 'square', 880 * (1 + i * 0.5)).env(decay(25)), 1.0 + i * 0.12, 0.35);
    const zap = noise(0.2, 'white'); highpass(zap, 2500); b.mix(zap.env(decay(16)), 0.95, 0.4);
    return b.normalize(0.7);
  });
  defSound('dom_order', (v) => {
    const b = new Buf(0.25);
    b.mix(osc(0.06, 'square', 660 + v * 40).env(decay(40)), 0, 0.4);
    b.mix(osc(0.08, 'square', 990 + v * 40).env(decay(30)), 0.07, 0.4);
    lowpass(b, 4000);
    return b.normalize(0.4);
  });
}
