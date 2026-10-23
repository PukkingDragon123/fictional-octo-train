// The Lobby's surgical theatre table: where you build and replace limbs in a
// run (lie down on it: src/survival/cyber.ts worldMenu → src/ui/surgery/field.ts).
// A heavy table on a bellows column with a green vinyl pad and straps, its own
// three-pod lamp and a little green CRT on a boom, a folded saw arm clamped to
// the rail and a crafting jig behind. One is set down in the Lobby near the
// Remittance Hopper after the zone is generated (deterministic, inside the
// generator's uid range), so a new survivor finds it in the first minute.
import { defObj } from '../../world/objects';
import type { ModelBuilder } from '../../gfx/modelBuilder';
import { onZoneGenerated } from '../../world/worldGraph';
import { findHopperSpot } from '../../game/debt/hopperPlace';
import { ZoneBuilder } from '../../world/gen/builder';
import { TF, type Zone } from '../../world/zone';
import { Rng } from '../../core/rng';

const all = (t: string) => ({ sides: t, top: t, bottom: t });

function tableModel(mb: ModelBuilder) {
  // foot plate with hazard edges and two pedals
  mb.box(0, 0, 0.1, 0.62, 0.05, 1.0, 'metal_brushed', { color: 0x8a8e90 });
  for (const z of [-0.39, 0.59]) mb.box(0, 0.05, z, 0.62, 0.012, 0.05, 'i_cy_hazard');
  for (const x of [-0.12, 0.12]) mb.box(x, 0.05, 0.52, 0.12, 0.03, 0.08, 'chrome');
  // bellows column: rubber pleats round a chrome ram, a cream head unit
  for (let i = 0; i < 7; i++) mb.cylinder(0, 0.06 + i * 0.05, 0.1, i % 2 ? 0.12 : 0.15, 0.05, 8, all('leather_black'), { color: 0x2a2a28 });
  mb.cylinder(0, 0.41, 0.1, 0.07, 0.2, 8, all('chrome'));
  mb.box(0, 0.6, 0.1, 0.5, 0.14, 0.42, 'i_cy_shell');
  mb.box(0, 0.62, 0.32, 0.18, 0.06, 0.012, 'i_cy_black');
  // slab, side rails with strap anchors, a drain lip at the foot
  mb.box(0, 0.74, 0, 0.64, 0.07, 1.92, 'metal_brushed', { color: 0x7a7e82 });
  for (const s of [-1, 1]) {
    mb.box(s * 0.34, 0.76, 0, 0.03, 0.035, 1.88, 'chrome');
    for (const z of [-0.5, 0.1, 0.55]) mb.box(s * 0.335, 0.74, z, 0.05, 0.06, 0.05, 'chrome');
  }
  mb.box(0, 0.7, 0.98, 0.5, 0.06, 0.06, 'metal_brushed');
  // the pad: three green vinyl cushions and a headrest
  for (const [z, d] of [[-0.78, 0.32], [-0.2, 0.8], [0.58, 0.72]] as const) mb.box(0, 0.81, z, 0.6, 0.08, d - 0.03, 'leather_black', { color: 0x3e6a52 });
  mb.box(0, 0.89, -0.82, 0.36, 0.03, 0.18, 'leather_black', { color: 0x3e6a52 });
  // straps across the pad, brass buckles
  for (const z of [-0.36, 0.18, 0.62]) { mb.box(0, 0.895, z, 0.64, 0.012, 0.07, 'leather_brown'); mb.box(0.16, 0.9, z, 0.07, 0.014, 0.08, 'metal_brass'); }
  // a folded saw arm clamped to the near rail at the head end
  mb.box(0.38, 0.74, -0.62, 0.1, 0.1, 0.12, 'i_cy_black');
  mb.push().translate(0.4, 0.84, -0.62).rotateX(-0.9);
  mb.box(0, 0.22, 0, 0.07, 0.44, 0.07, 'i_cy_paint');
  mb.box(0, 0.44, 0, 0.09, 0.09, 0.09, 'i_cy_black');
  mb.push().translate(0, 0.44, 0).rotateX(2.1);
  mb.box(0, 0.16, 0, 0.055, 0.32, 0.055, 'i_cy_paint');
  mb.cylinderX(0, 0.34, 0, 0.11, 0.012, 10, all('chrome'), { fit: true });
  mb.box(0, 0.34, -0.05, 0.03, 0.06, 0.12, 'i_cy_hazard');
  mb.pop(); mb.pop();
  // lamp boom at the head end: an olive pole, a little green CRT, three pods over the pad
  mb.box(-0.44, 0, -0.98, 0.18, 0.04, 0.18, 'metal_brushed', { color: 0x5a5e44 });
  mb.cylinder(-0.44, 0.04, -0.98, 0.035, 2.06, 6, all('i_cy_paint'), { color: 0x8a8e60 });
  mb.box(-0.44, 1.28, -0.86, 0.3, 0.24, 0.22, 'i_cy_shell');
  mb.box(-0.44, 1.29, -0.746, 0.22, 0.16, 0.01, 'plastic_black', { color: 0x40ff80, emissive: 1.1 });
  mb.box(-0.44, 1.15, -0.75, 0.24, 0.03, 0.02, 'metal_brass');
  mb.box(-0.2, 2.06, -0.62, 0.52, 0.05, 0.05, 'i_cy_paint', { color: 0x8a8e60 });
  mb.box(0.02, 2.0, -0.42, 0.06, 0.12, 0.06, 'i_cy_black');
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4, x = 0.02 + Math.cos(a) * 0.17, z = -0.42 + Math.sin(a) * 0.17;
    mb.cylinder(x, 1.82, z, 0.11, 0.13, 8, { sides: 'i_cy_shell', top: 'i_cy_shell', bottom: 'p_surg_light' }, { fit: true, rTop: 0.07, emissive: 0.9 });
    mb.box((x + 0.02) / 2, 1.97, (z - 0.42) / 2, 0.16, 0.025, 0.03, 'i_cy_shell');
  }
}

defObj({
  key: 'cyber_table', name: 'Surgical Theatre Table', w: 1, d: 2, height: 2.1, block: 'table', surface: 0.9, movable: 0, tall: true,
  light: { color: 0xfff2dc, intensity: 1.25, radius: 3.4, y: 1.8, kind: 'lamp' },
  sound: 'metal', flammable: 0.05,
  tags: ['setA', 'medical', 'table', 'surgery'],
  desc: 'A theatre table with its own lamp and machines. Lie down on it to build hardware from scrap and to take limbs off and bolt parts on.',
  model: (mb) => tableModel(mb),
});

/** the Lobby gets one table, near the Hopper (or the spawn) */
export function placeCyberTable(z: Zone, seed: number) {
  if (z.key !== 'lobby' || [...z.objects.values()].some((o) => o.key === 'cyber_table')) return;
  const hop = [...z.objects.values()].find((o) => o.key === 'hopper');
  const from: [number, number] | undefined = hop ? [hop.x + 3, hop.y + 2] : undefined;
  const spot = findHopperSpot(z, from, 2);
  if (!spot) return;
  const b = new ZoneBuilder(z, new Rng(seed ^ 0x0be7ab1e));
  const o = b.obj('cyber_table', spot[0], spot[1], 0, {});
  if (!o) return;
  for (const [x, y] of z.footprint(o, { w: 1, d: 2 })) if (z.inb(x, y)) z.flags[z.idx(x, y)] |= TF.NOSPAWN | TF.NOBUILD;
  const anchors: Record<string, number[]> = (z.meta.anchors ||= {});
  anchors.cyber_table = [o.x, o.y + 2];
}

onZoneGenerated(placeCyberTable);
