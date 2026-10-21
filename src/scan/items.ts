// The Phosphor Scope (key data_probe): a bakelite handheld scanner the
// Sprocket Congregation solders together from dead televisions. With it (or the watch's SCAN research) hold N on
// anything to read it for DATA.
import { defItem } from '../items/item';
import { rbox, capsule } from './shapes';

defItem({
  key: 'data_probe', name: 'Phosphor Scope', cat: 'electronics', weight: 0.9, value: 90, durability: 400, noStack: true, tags: ['data_probe', 'scanner'],
  desc: 'A cream bakelite box with a round green screen, a needle meter, a carrying handle and a card slot. Hold N and point it at something: it sweeps it for data and types you a punch card. Slower than a watch that knows how.',
  model: (mb) => {
    rbox(mb, 0, 0, 0, 0.12, 0.08, 0.07, 'plastic_beige', { color: 0xe2d4b4 }, 0.012, 2);
    rbox(mb, 0, 0.0, 0.0, 0.124, 0.016, 0.074, 'plastic_beige', { color: 0x5a3a22 }, 0.006, 2);
    mb.push().translate(-0.02, 0.04, 0.036).rotateX(Math.PI / 2); mb.cylinder(0, 0, 0, 0.024, 0.006, 12, 'chrome'); mb.cylinder(0, 0.004, 0, 0.02, 0.002, 12, 'white', { color: 0x4ab03a, emissive: 0.9 }); mb.pop();
    rbox(mb, 0.035, 0.05, 0.034, 0.032, 0.02, 0.006, 'paper', { color: 0xe8dcb8 }, 0.0025, 1);
    capsule(mb, [0.035, 0.052, 0.038], [0.04, 0.066, 0.038], 0.0008, 'plastic_black', {}, 4);
    for (const x of [-0.045, 0.045]) capsule(mb, [x, 0.08, 0], [x, 0.108, 0], 0.004, 'chrome', {}, 6);
    capsule(mb, [-0.045, 0.112, 0], [0.045, 0.112, 0], 0.007, 'leather_black', {}, 8);
    rbox(mb, 0, 0.08, -0.01, 0.06, 0.003, 0.008, 'metal_dark', {}, 0.0014, 1);
  },
});
