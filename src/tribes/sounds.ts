// A trade: chalk squeaking on the slate, a tin clink.
import { defSound } from '../audio/sounds';
import { Buf, osc, noise, bandpass, decay, adsr } from '../audio/synth';

let done = false;
export function tribeSounds() {
  if (done) return; done = true;
  defSound('tribe_trade', (v) => {
    const b = new Buf(0.5);
    const chalk = noise(0.18, 'white'); bandpass(chalk, (t) => 2600 + Math.sin(t * 60) * 900, 4); chalk.env(adsr(0.01, 0.03, 0.6, 0.05, 0.18));
    b.mix(chalk, 0, 0.5);
    b.mix(osc(0.25, 'sine', 2350 + v * 60).env(decay(16)), 0.2, 0.25);
    b.mix(osc(0.2, 'sine', 3520 + v * 80).env(decay(22)), 0.21, 0.15);
    return b.normalize(0.45);
  });
}
