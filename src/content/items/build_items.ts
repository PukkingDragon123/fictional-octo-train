// Items — BUILD MODE salvage and the welder. Frames and motors come out of
// smashed furniture (src/world/destruction.ts debris tables); the welding torch
// fuses salvage into build-mode pieces (src/build). Uses = litres of gas.
import { defItem } from '../../items/item';
import { tex, T, rodX, rodZ } from './_kit';

const S_RUSTFRAME = tex('i_bld_rustframe', 8, 8, (pc) => {
  pc.each((x, y) => pc.set(x, y, (x * 7 + y * 3) % 5 === 0 ? 0x7a3e22 : (x + y) % 3 === 0 ? 0x5a5e62 : 0x6e7276));
}, true);
const D_MOTOR = tex('i_bld_motor', 12, 8, (pc) => {
  pc.fill(0x2a5a8a);
  for (let x = 0; x < 12; x += 2) pc.vline(x, 1, 6, 0x1e4268);
  pc.rect(4, 2, 4, 4, 0xd8a040); pc.set(5, 3, 0xf2e2a0); pc.hline(0, 11, 0, 0x4a7aa8);
}, true);
const D_TORCH_GAUGE = tex('i_bld_gauge', 6, 6, (pc) => {
  pc.fill(0xf2eee0); pc.strokeRect(0, 0, 6, 6, 0x2a2a2a); pc.line(1, 4, 4, 1, 0xc8302a);
});

defItem({
  key: 'steel_frame', name: 'Bent Steel Frame', cat: 'material', weight: 3.5, tags: ['frame', 'metal', 'salvage'], value: 14, grid: [2, 2],
  desc: 'The skeleton of a chair, a rack, a bed. Bent, but it will take a weld.',
  model: (mb) => {
    for (const z of [-0.14, 0.14]) rodX(mb, -0.2, 0.2, 0.02, 0.015, 0.015, 6, S_RUSTFRAME, { cz: z });
    for (const x of [-0.19, 0.19]) rodZ(mb, -0.14, 0.14, 0.02, 0.015, 0.015, 6, S_RUSTFRAME, { cx: x });
    mb.push().translate(0, 0.02, 0).rotateY(0.6); rodX(mb, -0.22, 0.22, 0, 0.012, 0.012, 5, S_RUSTFRAME); mb.pop();
  },
});

defItem({
  key: 'motor', name: 'Salvaged Motor', cat: 'material', weight: 2.4, tags: ['motor', 'electronics', 'salvage'], value: 28, grid: [2, 2],
  desc: 'An electric motor torn out of something that used to spin. Copper inside, still warm.',
  model: (mb) => {
    mb.cylinder(0, 0.0, 0, 0.07, 0.16, 10, { sides: D_MOTOR, top: 'metal_dark', bottom: 'metal_dark' }, { fit: { north: true } });
    mb.cylinder(0, 0.16, 0, 0.012, 0.05, 6, T.steel);
    mb.box(0, 0, 0, 0.17, 0.012, 0.1, 'metal_dark');
  },
});

defItem({
  key: 'welding_torch', name: 'Welding Torch', cat: 'tool', weight: 1.8, uses: 60, tags: ['welder', 'tool', 'fire'], value: 45, grid: [2, 2],
  desc: 'A gas torch with a cracked visor clipped to the hose. Fuses salvage into anything. Hold it to a frame in build mode (B).',
  model: (mb) => {
    mb.cylinder(-0.06, 0, 0, 0.045, 0.22, 10, 'plastic_red');
    mb.cylinder(-0.06, 0.22, 0, 0.02, 0.03, 8, 'metal_brass');
    mb.box(-0.06, 0.12, 0.046, 0.026, 0.026, 0.004, D_TORCH_GAUGE, { fit: true });
    mb.push().translate(0.06, 0.03, 0).rotateZ(-0.35);
    mb.cylinder(0, 0, 0, 0.016, 0.12, 6, 'rubber_black');
    mb.cylinder(0, 0.12, 0, 0.01, 0.09, 6, 'metal_brass');
    mb.cylinder(0, 0.21, 0, 0.006, 0.03, 6, T.steel);
    mb.pop();
  },
});
