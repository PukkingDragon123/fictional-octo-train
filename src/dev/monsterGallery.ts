// Dev staging for the monster pass (Still Lifes, the expedition things, the
// dread layer). Use from the console in a ?quick game:
//   const m = await import('/src/dev/monsterGallery.ts');
//   await m.toZone('house'); await m.dinner();          // a Still Life dinner
//   await m.spawnNear('stammer', 0, -6);                  // something at 6 m
//   m.lights(0.1)                                         // dim the zone (dark shots)
import { G } from '../game/G';
import { objDef } from '../world/objects';

let UID = 990000;

/** move the local survivor into a zone, onto its spawn / first anchor / any floor */
export async function toZone(key: string, at?: [number, number], facing?: number) {
  const z = G.getZone(key);
  let p = at;
  if (!p) {
    const a = z.meta.spawn || Object.values(z.meta.anchors || {})[0];
    p = a ? [a[0], a[1]] : (z.randomFloor((G.creatures as any).rng) as [number, number]);
  }
  G.placePlayer(G.local, key, p[0], p[1], facing);
  return p;
}

/** remove every creature (clean stage) */
export function clearCreatures() {
  for (const c of [...G.creatures.creatures.values()]) G.creatures.remove(c);
  G.sandbox.creatures = 0;
}

/** objects of a key in the current zone */
export function objs(key: string | RegExp) {
  const z = G.zone, out: any[] = [];
  for (const o of z.objects.values()) if (typeof key === 'string' ? o.key === key : key.test(o.key)) out.push(o);
  return out;
}

/** put a prop down (local only, for screenshots) */
export function prop(key: string, x: number, y: number, rot = 0, state: Record<string, any> = {}) {
  const o = { uid: UID++, key, x, y, rot, state };
  G.zone.addObject(o as any);
  return o;
}
export function unprop(o: any) { G.zone.removeObject(o); }

/**
 * The dinner: a dining table in this zone, every chair round it taken by a
 * replica prop except one, which a live still life sits down in. The survivor
 * stands a few metres off, looking at the table.
 */
export async function dinner(opts: { live?: number; dist?: number; mi?: number[] } = {}) {
  const z = G.zone;
  const tables = objs('table_dining');
  let best: any = null, chairs: any[] = [];
  for (const t of tables) {
    const ch = objs(/^chair_/).filter((c) => Math.abs(c.x - t.x) <= 2 && Math.abs(c.y - t.y) <= 2);
    if (ch.length > chairs.length) { best = t; chairs = ch; }
  }
  if (!best) return 'no table';
  const live = opts.live ?? 1;
  const mis = opts.mi ?? [2, 3, 0, 6, 1, 5];
  const placed: any[] = [];
  chairs.forEach((c, i) => {
    if (i < live) return;
    unprop(c);
    placed.push(prop('replica_seated', c.x, c.y, c.rot, { v: mis[i % mis.length], pose: 'sit_table', seat: c.key }));
  });
  const ids: string[] = [];
  for (let i = 0; i < live && i < chairs.length; i++) {
    const c = G.creatures.spawn('still_life', z.key, chairs[i].x + 0.5, chairs[i].y + 0.5);
    if (!c) continue;
    c.home = { x: chairs[i].x + 0.5, z: chairs[i].y + 0.5 };
    c.mem.role = 'still';
    c.mem.net = { mi: mis[(i + 3) % mis.length] };
    ids.push(c.id);
  }
  // stand back from the table
  const d = opts.dist ?? 3.5;
  const p = G.local;
  for (const [dx, dy] of [[0, d], [d, 0], [0, -d], [-d, 0], [d, d], [-d, d]]) {
    const x = best.x + 1 + dx, y = best.y + dy;
    if (z.inb(x, y) && z.floor[z.idx(x, y)] && !z.solid[z.idx(x, y)]) {
      p.x = x + 0.5; p.z = y + 0.5; p.facing = p.targetFacing = Math.atan2(best.y + 0.5 - p.z, best.x + 1 - p.x);
      break;
    }
  }
  return { table: [best.x, best.y], chairs: chairs.length, props: placed.length, live: ids };
}

/** spawn a creature at an offset from the survivor (brain on) */
export function spawnNear(key: string, dx: number, dz: number, mem: Record<string, any> = {}) {
  const p = G.local;
  const c = G.creatures.spawn(key, p.zoneKey, p.x + dx, p.z + dz);
  if (c) Object.assign(c.mem, mem);
  return c?.id ?? null;
}

/** dim (k < 1) or restore (k = 1) every light in the zone */
export function lights(k: number) {
  for (const l of G.zone.lights as any[]) { l.__i0 ??= l.intensity; l.intensity = l.__i0 * k; l.fp = null; l.level = undefined; }
  (G.zone as any).lightDirty = true;
  return G.zone.lights.length;
}
/** the flashlight on, with batteries */
export function torch(on = true) {
  const p = G.local as any;
  if (!p.lightItem) {
    const it = (window as any).__dev.newItem('flashlight');
    p.inv.add(it); p.handR = it; p.lightItem = it;
  }
  p.flashlightOn = on;
}
export function face(x: number, z: number) { const p = G.local; p.facing = p.targetFacing = Math.atan2(z - p.z, x - p.x); }
export function info() { return { zone: G.zone.key, x: G.local.x, z: G.local.z, objs: objDef('replica_seated') ? 'ok' : 'missing' }; }

/** pin the camera on a world point (null releases it): screenshots of things the survivor is not standing on */
export function frame(x: number | null, z = 0, zoom?: number) {
  const g = G as any;
  const cam = g.camera;
  if (!cam.__framed) {
    const orig = cam.update.bind(cam);
    cam.update = (dt: number) => { orig(dt); const f = g.__frame; if (f) { g.pr.target.x = f.x; g.pr.target.z = f.z; g.pr.updateCamera(dt); } };
    cam.__framed = true;
  }
  g.__frame = x === null ? null : { x, z };
  if (zoom) g.pr.pxSizeTarget = 1 / zoom;
}
