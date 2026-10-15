import { refreshUnpowered } from '../world/power';
import { G } from './G';
import { defOp, op, isReplaying } from './ops';
import { Zone, TileObject, EdgeObj, Decal } from '../world/zone';
import { Container } from '../items/container';
import { Item } from '../items/item';
import { fillLoot, serializeItem, deserializeItem, serializeContainer, deserializeContainer } from '../items/factory';
import { dropItem, floorItems, removeFloorItem } from '../items/worldItems';
import { objDef } from '../world/objects';
import { bus } from '../core/events';
import { Player } from '../entities/player';
import { setUidBase } from '../core/rng';
import { Placement, setPlace, containerOcc, testFit, autoPack } from '../items/grid';

/** grid placement carried by item-moving ops (backpack inventory) */
type At = { gx?: number; gy?: number; rot?: 0 | 1 };
const atOf = (a: At): Placement | undefined => (a.gx === undefined || a.gy === undefined ? undefined : { gx: a.gx, gy: a.gy, rot: a.rot ?? 0 });
const atArgs = (p?: Placement | null): At => (p ? { gx: p.gx, gy: p.gy, rot: p.rot } : {});

// ---------------- container references ----------------
export function containerRef(c: Container): string { return c.owner; }

export function resolveContainer(z: Zone, ref: string): Container | null {
  if (ref.startsWith('obj:')) {
    const o = z.objects.get(Number(ref.slice(4)));
    return o?.inv ?? null;
  }
  if (ref.startsWith('item:')) {
    const uid = Number(ref.slice(5));
    // bag lying on the floor or inside a world container
    const wi = floorItems(z).get(uid);
    if (wi?.item.inv) return wi.item.inv;
    for (const o of z.objects.values()) { const it = o.inv?.items.find((i) => i.uid === uid); if (it?.inv) return it.inv; }
    return null;
  }
  if (ref.startsWith('corpse:')) return G.creatures?.corpseContainer?.(ref.slice(7)) ?? null;
  if (ref.startsWith('veh:')) return G.items?.vehicleContainer?.(ref) ?? null;
  return null;
}

export function isWorldContainer(c: Container): boolean {
  return !c.owner.startsWith('player:') && !isCarriedBag(c);
}
function isCarriedBag(c: Container): boolean {
  if (!c.owner.startsWith('item:')) return false;
  const uid = Number(c.owner.slice(5));
  for (const p of G.players.values()) if (p.isLocal && p.inv.items.some((i) => i.uid === uid)) return true;
  return false;
}

function playerById(id: string): Player | undefined { return G.players.get(id); }
function playerContainer(p: Player, uid: number | undefined): Container {
  if (uid !== undefined) for (const c of p.containers()) if (c.uid === uid) return c;
  return p.inv;
}

// ---------------- loot ----------------
defOp('openContainer', (a: { z: string; ref: string }, ctx) => {
  if (!ctx.host) return;
  const z = G.zones.get(a.z); if (!z) return;
  const c = resolveContainer(z, a.ref); if (!c || c.lootDone) return;
  // rooms can be richer or poorer than the zone average (Room.lootMul)
  const ou = c.owner?.startsWith('obj:') ? Number(c.owner.slice(4)) : NaN;
  const o = Number.isFinite(ou) ? z.objects.get(ou) : undefined;
  const roomMul = o ? (z.roomAt(o.x, o.y).lootMul ?? 1) : 1;
  fillLoot(c, z.seed, G.sandbox.loot * roomMul * (playerById(ctx.from)?.body.has('lucky') ? 1.2 : 1));
  if (G.role === 'host') G.net?.broadcastOp('lootFill', { z: a.z, ref: a.ref, items: c.items.map(serializeItem) });
});
defOp('lootFill', (a: { z: string; ref: string; items: any[] }, ctx) => {
  if (ctx.host) return;
  const z = G.zones.get(a.z); if (!z) return;
  const c = resolveContainer(z, a.ref); if (!c) return;
  c.items.length = 0;
  for (const io of a.items) { c.add(deserializeItem(io)); setUidBase(io.uid + 1); }
  c.lootDone = true;
  bus.emit('containerChanged', c);
});

/** request loot generation for containers about to be shown */
export function ensureLoot(z: Zone, c: Container) {
  if (c.lootDone || !c.loot) return;
  op('openContainer', { z: z.key, ref: containerRef(c) });
}

// ---------------- item transfer ----------------
defOp('take', (a: { z: string; ref: string; uid: number; to: string; dest?: number } & At, ctx) => {
  const z = G.zones.get(a.z); if (!z) return;
  const c = resolveContainer(z, a.ref); if (!c) return;
  const it = c.items.find((i) => i.uid === a.uid); if (!it) return;
  c.remove(it);
  bus.emit('containerChanged', c);
  const p = playerById(a.to);
  if (isReplaying()) return;
  if (p && p.isLocal) { if (!carries(p, it.uid)) { setPlace(it, atOf(a)); playerContainer(p, a.dest).add(it); bus.emit('inventoryChanged', p); } }
  else if (ctx.host && G.role === 'host') G.net?.sendTo(a.to, 'give', { item: serializeItem(it), dest: a.dest, ...atArgs(atOf(a)) });
});
/** a client gets a taken item twice (the host's 'give' and the broadcast op): keep one */
function carries(p: Player, uid: number): boolean { return p.allItems().some((i) => i.uid === uid); }
defOp('put', (a: { z: string; ref: string; item: any }) => {
  const z = G.zones.get(a.z); if (!z) return;
  const c = resolveContainer(z, a.ref); if (!c) return;
  const it = deserializeItem(a.item);
  setUidBase(it.uid + 1);
  if (!c.items.some((i) => i.uid === it.uid)) c.add(it);
  bus.emit('containerChanged', c);
});
defOp('move', (a: { z: string; from: string; to: string; uid: number } & At) => {
  const z = G.zones.get(a.z); if (!z) return;
  const f = a.from.startsWith('floor') ? null : resolveContainer(z, a.from);
  const t = a.to.startsWith('floor') ? null : resolveContainer(z, a.to);
  let it: Item | undefined;
  if (f) { it = f.items.find((i) => i.uid === a.uid); if (it) f.remove(it); }
  else { const wi = floorItems(z).get(a.uid); if (wi) { it = wi.item; removeFloorItem(z, it); } }
  if (!it) return;
  if (t) { setPlace(it, atOf(a)); t.add(it); }
  else { const [x, zz] = a.to.slice(6).split(',').map(Number); dropItem(z, it, x, zz); }
  bus.emit('containerChanged', f); bus.emit('containerChanged', t);
});
defOp('dropFloor', (a: { z: string; item: any; x: number; zz: number; y?: number; v?: [number, number, number] }) => {
  const z = G.zones.get(a.z); if (!z) return;
  const it = deserializeItem(a.item);
  setUidBase(it.uid + 1);
  const wi = dropItem(z, it, a.x, a.zz, a.y, a.v ? 0 : 0.3);
  if (a.v) { wi.vx = a.v[0]; wi.vy = a.v[1]; wi.vz = a.v[2]; wi.y = a.y ?? 1.2; }
  bus.emit('floorChanged', z);
});
defOp('takeFloor', (a: { z: string; uid: number; to: string; dest?: number } & At, ctx) => {
  const z = G.zones.get(a.z); if (!z) return;
  const wi = floorItems(z).get(a.uid); if (!wi) return;
  removeFloorItem(z, wi.item);
  bus.emit('floorChanged', z);
  const p = playerById(a.to);
  if (isReplaying()) return;
  if (p && p.isLocal) { if (!carries(p, wi.item.uid)) { setPlace(wi.item, atOf(a)); playerContainer(p, a.dest).add(wi.item); bus.emit('inventoryChanged', p); } }
  else if (ctx.host && G.role === 'host') G.net?.sendTo(a.to, 'give', { item: serializeItem(wi.item), dest: a.dest, ...atArgs(atOf(a)) });
});
/** host -> requesting client: receive an item into a container */
export function receiveGive(a: { item: any; dest?: number } & At) {
  const p = G.local; if (!p) return;
  const it = deserializeItem(a.item);
  setUidBase(it.uid + 1);
  if (carries(p, it.uid)) return;
  if (a.gx !== undefined) setPlace(it, atOf(a));
  else if (a.dest === undefined) setPlace(it, null);
  playerContainer(p, a.dest).add(it);
  bus.emit('inventoryChanged', p);
}

/** rearrange (or split a stack) inside a world container: every peer applies the same check */
defOp('gridPlace', (a: { z: string; ref: string; uids: number[]; gx: number; gy: number; rot: 0 | 1 }) => {
  const z = G.zones.get(a.z); if (!z) return;
  const c = resolveContainer(z, a.ref); if (!c) return;
  const items = a.uids.map((u) => c.items.find((i) => i.uid === u)).filter((i): i is Item => !!i);
  if (!items.length) return;
  const occ = containerOcc(c, new Set(items)); if (!occ) return;
  if (testFit(occ, items[0], a.gx, a.gy, a.rot, items.length) === 'blocked') return;
  for (const it of items) setPlace(it, { gx: a.gx, gy: a.gy, rot: a.rot });
  bus.emit('containerChanged', c);
});
/** shake a world container: deterministic re-pack */
defOp('gridPack', (a: { z: string; ref: string }) => {
  const z = G.zones.get(a.z); if (!z) return;
  const c = resolveContainer(z, a.ref); if (!c) return;
  autoPack(c);
  bus.emit('containerChanged', c);
});

/**
 * Move an item between any two containers on behalf of the local player,
 * routing through ops when world containers are involved.
 */
export function transferItem(p: Player, it: Item, from: Container, to: Container, at?: Placement | null) {
  if (from === to) { if (at && to.kind !== 'floor') { setPlace(it, at); bus.emit('inventoryChanged', p); } return; }
  const z = G.getZone(p.zoneKey);
  const fw = isWorldContainer(from) || from.kind === 'floor';
  const tw = isWorldContainer(to) || to.kind === 'floor';
  if (!fw && !tw) {
    if (p.isWorn(it)) p.unwear(it);
    if (p.handR === it || p.handL === it) { if (p.handR === it) p.equip(null, 'R'); if (p.handL === it) p.equip(null, 'L'); }
    from.remove(it); if (at !== undefined) setPlace(it, at); to.add(it);
    bus.emit('inventoryChanged', p);
    return;
  }
  if (fw && !tw) {
    if (from.kind === 'floor') op('takeFloor', { z: z.key, uid: it.uid, to: p.id, dest: to.uid, ...atArgs(at) });
    else op('take', { z: z.key, ref: containerRef(from), uid: it.uid, to: p.id, dest: to.uid, ...atArgs(at) });
    return;
  }
  if (!fw && tw) {
    p.removeItem(it);
    bus.emit('inventoryChanged', p);
    if (to.kind === 'floor') op('dropFloor', { z: z.key, item: serializeItem(it), x: p.x, zz: p.z });
    else { if (at !== undefined) setPlace(it, at); op('put', { z: z.key, ref: containerRef(to), item: serializeItem(it) }); }
    return;
  }
  op('move', { z: z.key, from: from.kind === 'floor' ? `floor:${p.x},${p.z}` : containerRef(from), to: to.kind === 'floor' ? `floor:${p.x},${p.z}` : containerRef(to), uid: it.uid, ...(to.kind === 'floor' ? {} : atArgs(at)) });
}

// ---------------- doors, windows & edges ----------------
defOp('edge', (a: { z: string; x: number; y: number; side: 0 | 1; patch: Partial<EdgeObj> | null; full?: EdgeObj }) => {
  const z = G.zones.get(a.z); if (!z) return;
  if (a.full) { z.setEdge(a.x, a.y, a.side, { ...a.full }); return; }
  const e = z.edge(a.x, a.y, a.side);
  if (!e) return;
  if (a.patch === null) { z.setEdge(a.x, a.y, a.side, null); return; }
  const geomChange = a.patch.glass !== undefined && a.patch.glass !== e.glass;
  Object.assign(e, a.patch);
  if (geomChange || a.patch.style !== undefined || a.patch.kind !== undefined) z.setEdge(a.x, a.y, a.side, e);
  else z.edgeChanged(a.x, a.y, a.side);
  bus.emit('edgeChanged', z, a.x, a.y, a.side, e, a.patch);
});
defOp('wall', (a: { z: string; x: number; y: number; side: 0 | 1; wall: number }) => {
  const z = G.zones.get(a.z); if (!z) return;
  if (a.side === 0) z.setWallN(a.x, a.y, a.wall); else z.setWallW(a.x, a.y, a.wall);
});
defOp('floor', (a: { z: string; x: number; y: number; floor: number; h?: number; flags?: number }) => {
  const z = G.zones.get(a.z); if (!z) return;
  z.setFloor(a.x, a.y, a.floor, a.h);
  if (a.flags !== undefined) z.flags[z.idx(a.x, a.y)] = a.flags;
});

// ---------------- objects ----------------
export function serializeObj(o: TileObject): any {
  return { uid: o.uid, key: o.key, x: o.x, y: o.y, rot: o.rot, state: o.state, inv: o.inv ? serializeContainer(o.inv) : null, hp: o.hp, ox: o.ox, oz: o.oz, tint: o.tint };
}
export function deserializeObj(a: any): TileObject {
  return { uid: a.uid, key: a.key, x: a.x, y: a.y, rot: a.rot, state: a.state || {}, inv: a.inv ? deserializeContainer(a.inv) : null, hp: a.hp, ox: a.ox, oz: a.oz, tint: a.tint };
}
defOp('objState', (a: { z: string; uid: number; patch: Record<string, any> }) => {
  const z = G.zones.get(a.z); if (!z) return;
  const o = z.objects.get(a.uid); if (!o) return;
  Object.assign(o.state, a.patch);
  const d = objDef(o.key);
  // appearance variant / blocking may change
  for (const [x, y] of z.footprint(o, d || {})) { z.recomputeTile(x, y); z.markDirty(x, y); }
  // lights tied to the object
  for (const l of z.lights) if (l.objUid === o.uid) {
    if ('on' in a.patch) l.on = !!a.patch.on;
    if ('broken' in a.patch) l.broken = !!a.patch.broken;
  }
  bus.emit('objChanged', z, o, a.patch);
});
/** lock or unlock an object's container (keys, prying, smashing the lock) */
defOp('invLock', (a: { z: string; uid: number; locked: boolean }) => {
  const z = G.zones.get(a.z); if (!z) return;
  const o = z.objects.get(a.uid); if (!o?.inv) return;
  o.inv.locked = a.locked;
  bus.emit('containerChanged', o.inv);
});
defOp('objAdd', (a: { z: string; obj: any }) => {
  const z = G.zones.get(a.z); if (!z) return;
  const o = deserializeObj(a.obj);
  setUidBase(o.uid + 1);
  if (z.objects.has(o.uid)) return;
  z.addObject(o);
  const d = objDef(o.key);
  if (d?.light) {
    const w = d.w ?? 1, dd = d.d ?? 1;
    const rw = o.rot % 2 === 0 ? w : dd, rd = o.rot % 2 === 0 ? dd : w;
    z.lights.push({ id: 100000 + o.uid, x: o.x + rw / 2, z: o.y + rd / 2, y: d.light.y, color: d.light.color, intensity: d.light.intensity, radius: d.light.radius, kind: d.light.kind, circuit: d.light.power === false || d.light.kind === 'fire' ? 0 : z.roomAt(o.x, o.y).circuit, on: o.state.on ?? true, broken: false, flicker: d.light.flicker ?? 0, objUid: o.uid });
  }
  bus.emit('objAdded', z, o);
});
defOp('objRemove', (a: { z: string; uid: number }) => {
  const z = G.zones.get(a.z); if (!z) return;
  const o = z.objects.get(a.uid); if (!o) return;
  z.removeObject(o);
  bus.emit('objRemoved', z, o);
});
defOp('objMove', (a: { z: string; uid: number; x: number; y: number; rot: 0 | 1 | 2 | 3 }) => {
  const z = G.zones.get(a.z); if (!z) return;
  const o = z.objects.get(a.uid); if (!o) return;
  z.removeObject(o);
  o.x = a.x; o.y = a.y; o.rot = a.rot;
  z.addObject(o);
  for (const l of z.lights) if (l.objUid === o.uid) { l.x = a.x + 0.5; l.z = a.y + 0.5; l.fp = null; }
  z.lightDirtyTiles.push([a.x, a.y]);
});

// ---------------- lights & power ----------------
defOp('light', (a: { z: string; id: number; patch: any }) => {
  const z = G.zones.get(a.z); if (!z) return;
  const l = z.lights.find((q) => q.id === a.id); if (!l) return;
  Object.assign(l, a.patch);
});
defOp('circuit', (a: { z: string; c: number; on: boolean }) => {
  const z = G.zones.get(a.z); if (!z) return;
  z.setCircuit(a.c, a.on);
  refreshUnpowered(z);
  bus.emit('circuit', z, a.c, a.on);
});
defOp('roomLights', (a: { z: string; room: number; on: boolean }) => {
  const z = G.zones.get(a.z); if (!z) return;
  for (const l of z.lights) {
    const tx = Math.floor(l.x), ty = Math.floor(l.z);
    if (z.inb(tx, ty) && z.room[z.idx(tx, ty)] === a.room && l.kind !== 'fire' && l.kind !== 'screen') l.on = a.on;
  }
});
defOp('decal', (a: { z: string; d: Decal }) => {
  const z = G.zones.get(a.z); if (!z) return;
  z.decals.push(a.d);
  if (z.decals.length > 4000) z.decals.splice(0, z.decals.length - 4000);
  z.markDirty(Math.floor(a.d.x), Math.floor(a.d.z));
});
defOp('zoneMeta', (a: { z: string; patch: any }) => {
  const z = G.zones.get(a.z); if (!z) return;
  Object.assign(z.meta, a.patch);
});
defOp('env', (a: { z: string; patch: any }) => {
  const z = G.zones.get(a.z); if (!z) return;
  Object.assign(z.env, a.patch);
  if (G.view?.zone === z) G.applyZoneEnv(z);
});
