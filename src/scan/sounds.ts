// Scanner voice: a rising servo chirp to start, dry ticks while it sweeps, a
// two-note 8-bit fanfare for something new.
import { defSound } from '../audio/sounds';
import { Buf, osc, noise, lowpass, bandpass, decay, adsr } from '../audio/synth';

let done = false;
export function scanSounds() {
  if (done) return; done = true;
  defSound('scan_start', () => {
    const b = new Buf(0.35);
    b.mix(osc(0.25, 'square', (t) => 600 + t * 2600).env(adsr(0.005, 0.05, 0.6, 0.1, 0.25)), 0, 0.25);
    const n = noise(0.2, 'white'); bandpass(n, 3200, 3); b.mix(n.env(decay(25)), 0, 0.2);
    lowpass(b, 6000);
    return b.normalize(0.4);
  });
  defSound('scan_tick', (v) => { const b = osc(0.03, 'square', 2400 + (v % 4) * 180).env(decay(140)); return b.normalize(0.25); });
  defSound('scan_new', () => {
    const b = new Buf(0.6);
    b.mix(osc(0.09, 'square', 988).env(decay(18)), 0, 0.3);
    b.mix(osc(0.09, 'square', 1319).env(decay(18)), 0.09, 0.3);
    b.mix(osc(0.3, 'square', 1976, 0.125).env(decay(9)), 0.18, 0.28);
    lowpass(b, 5000);
    return b.normalize(0.45);
  });
}
