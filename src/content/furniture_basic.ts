import { defObj } from '../world/objects';

// Ceiling fixtures: no visible model from the isometric camera; they exist as
// light sources that can be broken, repaired and powered.
defObj({
  key: 'light_fluoro', name: 'Fluorescent Light', height: 0, block: 'none', ceiling: true,
  model: () => { /* light only */ },
  light: { color: 0xf1edd0, intensity: 0.62, radius: 5.2, y: 2.65, kind: 'fluoro' },
  hum: 'fluoro', tags: ['light', 'ceiling'],
});

defObj({
  key: 'light_bulb', name: 'Ceiling Bulb', height: 0, block: 'none', ceiling: true,
  model: () => { /* light only */ },
  light: { color: 0xffc98a, intensity: 1.0, radius: 5, y: 2.3, kind: 'bulb' },
  tags: ['light', 'ceiling'],
});

defObj({
  key: 'test_crate', name: 'Crate', height: 0.8, block: 'solid',
  model: (mb) => { mb.box(0, 0, 0, 0.8, 0.8, 0.8, 'wood_crate'); },
  container: { capacity: 30, kind: 'crate', loot: 'generic' },
});
