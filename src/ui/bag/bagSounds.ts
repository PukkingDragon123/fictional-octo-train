import { defSound, kit } from '../../audio/sounds';
import { Buf, noise, osc, lowpass, bandpass, highpass, decay, rnd } from '../../audio/synth';

/** zipper, rattle, soft thunk, a tick for turning and a dull "no" for the backpack inventory */
let done = false;
export function registerBagSounds() {
  if (done) return;
  done = true;
  defSound('bag_zip', () => {
    const L = 0.42;
    const b = new Buf(L);
    // teeth: a fast run of tiny clicks that speeds up, over a scratchy hiss
    let t = 0, i = 0;
    while (t < L - 0.02) { b.mix(kit.clickS(2200 + i * 70 + rnd() * 300, 0.004), t, 0.22 + rnd() * 0.12); t += 0.019 - Math.min(0.009, i * 0.0004); i++; }
    const n = noise(L, 'white'); bandpass(n, (tt) => 2600 + tt * 5000, 1.4); n.env((tt) => Math.sin(Math.PI * Math.min(1, tt / L)) * 0.9);
    b.mix(n, 0, 0.32);
    return b.normalize(0.42);
  });
  defSound('bag_shake', () => {
    const b = new Buf(0.6);
    for (let k = 0; k < 16; k++) {
      const at = k * 0.034 + rnd() * 0.02;
      b.mix(kit.burst(0.05, 'pink', 2200, 180, 50), at, 0.35 + rnd() * 0.2);
      if (k % 3 === 0) b.mix(kit.clickS(1500 + rnd() * 1800, 0.012), at + 0.01, 0.25);
      if (k % 5 === 0) b.mix(kit.thump(0.08, 160 + rnd() * 60, 80, 30), at, 0.35);
    }
    return b.normalize(0.45);
  });
  defSound('bag_place', () => {
    const b = new Buf(0.14);
    b.mix(kit.thump(0.1, 210, 95, 38), 0, 0.7);
    b.mix(kit.burst(0.06, 'pink', 1800, 250, 70), 0.004, 0.45);
    return b.normalize(0.38);
  });
  defSound('bag_rot', () => {
    const b = new Buf(0.08);
    b.mix(kit.clickS(1900, 0.008), 0, 0.6); b.mix(kit.clickS(1300, 0.006), 0.03, 0.4);
    const n = noise(0.05, 'pink'); highpass(n, 900); n.env(decay(70)); b.mix(n, 0, 0.3);
    return b.normalize(0.3);
  });
  defSound('bag_bad', () => {
    const b = osc(0.16, 'square', (t) => 120 - t * 120);
    lowpass(b, 700); b.env(decay(18));
    b.mix(kit.thump(0.1, 140, 70, 30), 0, 0.6);
    return b.normalize(0.32);
  });
}
