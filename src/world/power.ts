// Appliances (objects whose def needs power) show as dark when their room's
// circuit is dead and no running generator is close enough.
import type { Zone } from './zone';
import { objDef } from './objects';

export function refreshUnpowered(z: Zone) {
  for (const o of z.objects.values()) {
    const d = objDef(o.key);
    if (!d?.power) continue;
    const on = z.circuitPowered(z.roomAt(o.x, o.y).circuit) || !!z.extPower?.(o.x + 0.5, o.y + 0.5);
    if (!!o.state.unpowered === !on) continue;
    o.state.unpowered = !on;
    for (const [x, y] of z.footprint(o, d)) z.markDirty(x, y);
  }
}
