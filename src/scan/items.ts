// The Phosphor Scope (key data_probe): a bakelite handheld scanner the
// Sprocket Congregation solders together from dead televisions. With it (or the watch's SCAN research) hold N on
// anything to read it for DATA.
import { defItem } from '../items/item';

defItem({
  key: 'data_probe', name: 'Phosphor Scope', cat: 'electronics', weight: 0.9, value: 90, durability: 400, noStack: true, tags: ['data_probe', 'scanner'],
  desc: 'A cream bakelite box with a round green screen, a needle meter, a carrying handle and a card slot. Hold N and point it at something: it sweeps it for data and types you a punch card. Slower than a watch that knows how.',
  model: (mb) => {
    mb.box(0, 0, 0, 0.12, 0.08, 0.07, 'plastic_beige', { color: 0xe2d4b4 });
    mb.box(0, 0.0, 0.0, 0.124, 0.014, 0.074, 'plastic_beige', { color: 0x5a3a22 });
    mb.push().translate(-0.02, 0.04, 0.036).rotateX(Math.PI / 2); mb.cylinder(0, 0, 0, 0.024, 0.006, 12, 'chrome'); mb.cylinder(0, 0.004, 0, 0.02, 0.002, 12, 'white', { color: 0x4ab03a, emissive: 0.9 }); mb.pop();
    mb.box(0.035, 0.05, 0.036, 0.03, 0.018, 0.004, 'paper', { color: 0xe8dcb8 });
    mb.box(0.035, 0.05, 0.039, 0.001, 0.014, 0.001, 'plastic_black');
    for (const x of [-0.045, 0.045]) mb.box(x, 0.095, 0, 0.008, 0.03, 0.01, 'chrome');
    mb.box(0, 0.11, 0, 0.1, 0.01, 0.014, 'leather_black');
    mb.box(0, 0.081, -0.01, 0.06, 0.003, 0.008, 'metal_dark');
  },
});
