// Build-mode world ops (replicated, logged, replayed with saves). Handlers are
// deterministic: every id they create comes in the args.
import { G } from '../game/G';
import { bus } from '../core/events';
import { defOp, applyOp } from '../game/ops';
import { objDef } from '../world/objects';
import { wallId } from '../world/defs';
import type { Zone } from '../world/zone';
import { piece } from './pieces';
import { resolveContainer } from '../game/worldOps';
import { deserializeItem } from '../items/factory';

export const edgeKey = (x: number, y: number, side: number) => `${x},${y},${side}`;
/** walls this crew welded, by edge: piece key (zone meta, rebuilt by replay) */
export const builtWalls = (z: Zone): Record<string, string> => (z.meta.bldWalls ||= {});

function containerFor(key: string, objUid: number, cu: number) {
  const d = objDef(key); const spec = d?.container || d?.containers?.[0];
  if (!spec) return null;
  return { uid: cu, name: spec.name || d!.name, kind: spec.kind, capacity: spec.capacity, reduction: 0, lootDone: true, locked: false, owner: 'obj:' + objUid, items: [] };
}

function setWall(z: Zone, x: number, y: number, side: number, id: number) {
  if (side === 0) z.setWallN(x, y, id); else z.setWallW(x, y, id);
}

/** a frame's weld is complete: swap it for the finished piece (object, wall or wall + hatch) */
defOp('bldFinish', (a: { z: string; uid: number; nu: number; cu: number; by?: string }, ctx) => {
  const z = G.zones.get(a.z); if (!z) return;
  const o = z.objects.get(a.uid); if (!o) return;
  const pc = piece(o.state.piece as string); if (!pc) return;
  applyOp('objRemove', { z: a.z, uid: o.uid }, ctx.from, false);
  if (pc.kind === 'obj' && pc.obj) {
    applyOp('objAdd', { z: a.z, obj: { uid: a.nu, key: pc.obj, x: o.x, y: o.y, rot: (o.state.prot ?? o.rot) & 3, state: { built: 1, by: a.by ?? null }, inv: containerFor(pc.obj, a.nu, a.cu) } }, ctx.from, false);
  } else if (pc.wall) {
    const side = o.state.side === 1 ? 1 : 0;
    setWall(z, o.x, o.y, side, wallId(pc.wall));
    if (pc.kind === 'door') {
      z.setEdge(o.x, o.y, side, { kind: 'door', style: 'door_metal', open: false, locked: false, hp: 400, maxHp: 400, barricade: 0, swing: 1, hinge: 0 });
    }
    builtWalls(z)[edgeKey(o.x, o.y, side)] = pc.key;
  }
  bus.emit('bldWelded', z, pc, o, a.by ?? null);
});

/** take a built wall (or hatch) back down */
defOp('bldWallDown', (a: { z: string; x: number; y: number; side: 0 | 1 }) => {
  const z = G.zones.get(a.z); if (!z) return;
  const k = edgeKey(a.x, a.y, a.side);
  const W = builtWalls(z);
  if (!W[k]) return;
  delete W[k];
  setWall(z, a.x, a.y, a.side, 0);
  if (z.edge(a.x, a.y, a.side)) z.setEdge(a.x, a.y, a.side, null);
  bus.emit('bldDemolished', z, a);
});

/** a station turns items in a container into something else (workers at a forge) */
defOp('bldCraft', (a: { z: string; ref: string; take: number[]; give: any }) => {
  const z = G.zones.get(a.z); if (!z) return;
  const c = resolveContainer(z, a.ref); if (!c) return;
  for (const u of a.take) { const it = c.items.find((i) => i.uid === u); if (it) c.remove(it); }
  if (a.give) c.add(deserializeItem(a.give));
  bus.emit('containerChanged', c);
});
