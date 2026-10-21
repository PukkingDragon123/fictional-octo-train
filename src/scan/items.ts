// The Data Probe: a handheld scanner the Sprocket Congregation solders
// together from dead phones. With it (or the watch's SCAN research) hold N on
// anything to read it for DATA.
import { defItem } from '../items/item';

defItem({
  key: 'data_probe', name: 'Data Probe', cat: 'electronics', weight: 0.35, value: 90, durability: 400, noStack: true, tags: ['data_probe', 'scanner'],
  desc: 'Three phone boards, a whip antenna and a cracked green screen. Hold N and point it at something to read it for data. Slower than a watch that knows how.',
  model: (mb) => {
    mb.box(0, 0, 0, 0.07, 0.022, 0.13, 'plastic_black', { color: 0x3a3e3a });
    mb.box(0, 0.012, 0.015, 0.05, 0.003, 0.06, 'white', { color: 0x2aff9a, emissive: 1.2 });
    for (let i = 0; i < 3; i++) mb.box(-0.018 + i * 0.018, 0.012, -0.04, 0.012, 0.004, 0.012, 'plastic_red', { color: i === 1 ? 0xe0c040 : 0xc03020 });
    mb.cylinder(0.026, 0.01, -0.06, 0.004, 0.12, 5, 'metal_grey');
    mb.box(-0.036, 0.0, 0.0, 0.006, 0.026, 0.1, 'metal_rusty');
  },
});
