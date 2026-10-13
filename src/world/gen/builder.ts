import { Zone, TileObject, EdgeObj, LightSource, Room, TF, Portal } from '../zone';
import { floorId, wallId, wallpaperId } from '../defs';
import { Rng, uid } from '../../core/rng';
import { objDef } from '../objects';
import { Container } from '../../items/container';

/**
 * Authoring helpers shared by every zone generator: carving rooms, drawing
 * edge walls, cutting doors/windows/arches, stamping furniture and lights.
 */
export class ZoneBuilder {
  z: Zone;
  rng: Rng;
  constructor(z: Zone, rng: Rng) { this.z = z; this.rng = rng; }

  fillFloor(x0: number, y0: number, x1: number, y1: number, floor: string, h = 0) {
    const f = floorId(floor);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (!this.z.inb(x, y)) continue;
      const i = this.z.idx(x, y);
      this.z.floor[i] = f;
      this.z.height[i] = Math.round(h * 10);
      this.z.floorVar[i] = 0;
    }
  }
  /** set wallpaper for wall faces facing into tiles of a rect */
  paper(x0: number, y0: number, x1: number, y1: number, tex: string) {
    const p = wallpaperId(tex);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (this.z.inb(x, y)) this.z.paper[this.z.idx(x, y)] = p;
  }
  flag(x0: number, y0: number, x1: number, y1: number, f: number, on = true) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (this.z.inb(x, y)) {
      const i = this.z.idx(x, y);
      this.z.flags[i] = on ? this.z.flags[i] | f : this.z.flags[i] & ~f;
    }
  }
  floorVar(x: number, y: number, v: number) { if (this.z.inb(x, y)) this.z.floorVar[this.z.idx(x, y)] = v; }

  /** Horizontal wall along the north edges of tiles x0..x1 at row y */
  hwall(x0: number, x1: number, y: number, wall = 'drywall') {
    const w = wallId(wall);
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) if (this.z.inb(x, y)) this.z.wallN[this.z.idx(x, y)] = w;
  }
  /** Vertical wall along the west edges of tiles at column x, rows y0..y1 */
  vwall(x: number, y0: number, y1: number, wall = 'drywall') {
    const w = wallId(wall);
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) if (this.z.inb(x, y)) this.z.wallW[this.z.idx(x, y)] = w;
  }
  clearN(x: number, y: number) { if (this.z.inb(x, y)) { this.z.wallN[this.z.idx(x, y)] = 0; this.z.edges.delete(this.z.edgeKey(x, y, 0)); } }
  clearW(x: number, y: number) { if (this.z.inb(x, y)) { this.z.wallW[this.z.idx(x, y)] = 0; this.z.edges.delete(this.z.edgeKey(x, y, 1)); } }

  /** Walls around a rectangular room (tiles x0..x1, y0..y1 inclusive) */
  roomWalls(x0: number, y0: number, x1: number, y1: number, wall = 'drywall') {
    this.hwall(x0, x1, y0, wall);
    this.hwall(x0, x1, y1 + 1, wall);
    this.vwall(x0, y0, y1, wall);
    this.vwall(x1 + 1, y0, y1, wall);
  }

  addRoom(name: string, type: string, x0: number, y0: number, x1: number, y1: number, opts: Partial<Room> = {}): Room {
    const r: Room = { id: this.z.rooms.length, name, type, x0, y0, x1, y1, circuit: opts.circuit ?? 0, ...opts };
    this.z.rooms.push(r);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (this.z.inb(x, y)) this.z.room[this.z.idx(x, y)] = r.id;
    return r;
  }

  edge(x: number, y: number, side: 0 | 1, e: Partial<EdgeObj> & { kind: EdgeObj['kind'] }) {
    const full: EdgeObj = {
      kind: e.kind, style: e.style ?? 'door_wood', open: e.open ?? false, locked: e.locked ?? false, keyId: e.keyId,
      hp: e.hp ?? (e.kind === 'window' ? 40 : 250), maxHp: e.maxHp ?? e.hp ?? (e.kind === 'window' ? 40 : 250), barricade: e.barricade ?? 0,
      glass: e.glass ?? (e.kind === 'window' ? 'intact' : undefined), curtains: e.curtains ?? (e.kind === 'window' ? 'none' : undefined),
      swing: e.swing ?? 1, hinge: e.hinge ?? 0, portal: e.portal, sign: e.sign, curtainSide: e.curtainSide, barricadeSide: e.barricadeSide,
    };
    this.z.edges.set(this.z.edgeKey(x, y, side), full);
    return full;
  }
  door(x: number, y: number, side: 0 | 1, style = 'door_wood', opts: Partial<EdgeObj> = {}) { return this.edge(x, y, side, { kind: 'door', style, ...opts }); }
  window(x: number, y: number, side: 0 | 1, opts: Partial<EdgeObj> = {}) { return this.edge(x, y, side, { kind: 'window', style: 'window_house', ...opts }); }
  arch(x: number, y: number, side: 0 | 1) { return this.edge(x, y, side, { kind: 'arch', style: 'arch' }); }
  /** remove wall entirely (open gap) */
  gap(x: number, y: number, side: 0 | 1) { if (side === 0) this.clearN(x, y); else this.clearW(x, y); }

  obj(key: string, x: number, y: number, rot: 0 | 1 | 2 | 3 = 0, state: Record<string, any> = {}, extra: Partial<TileObject> = {}): TileObject | null {
    const d = objDef(key);
    if (!d) { console.warn('unknown object', key); return null; }
    if (!this.z.inb(x, y)) return null;
    const o: TileObject = { uid: uid(), key, x, y, rot, state: { ...state }, ...extra };
    if (d.container || d.containers) {
      const spec = d.container || d.containers![0];
      const c = new Container(uid(), spec.name || d.name, spec.kind, spec.capacity);
      c.loot = state.loot ?? spec.loot;
      c.cooling = spec.cooling;
      c.heating = spec.heating;
      c.owner = 'obj:' + o.uid;
      o.inv = c;
    }
    if (d.hp) o.hp = d.hp;
    this.z.addObject(o);
    if (d.light) {
      const l = d.light;
      const w = d.w ?? 1, dd = d.d ?? 1;
      const rw = rot % 2 === 0 ? w : dd, rd = rot % 2 === 0 ? dd : w;
      this.light(x + rw / 2 + (o.ox ?? 0), y + rd / 2 + (o.oz ?? 0), l.kind, { color: l.color, intensity: l.intensity, radius: l.radius, y: l.y, flicker: state.flicker ?? l.flicker ?? 0, objUid: o.uid, circuit: state.circuit ?? (l.power === false ? 0 : this.z.roomAt(x, y).circuit), on: state.on ?? true, broken: state.broken ?? false });
    }
    return o;
  }

  /** can an object of footprint w x d be placed at x,y (free floor, no objects)? */
  free(x: number, y: number, w = 1, d = 1, allowWallEdges = true): boolean {
    for (let j = 0; j < d; j++) for (let i = 0; i < w; i++) {
      const X = x + i, Y = y + j;
      if (!this.z.inb(X, Y)) return false;
      const k = this.z.idx(X, Y);
      if (!this.z.floor[k]) return false;
      const objs = this.z.tileObjs.get(k);
      if (objs && objs.some((o) => !objDef(o.key)?.ceiling)) return false;
      if (!allowWallEdges) {
        if (i > 0 && this.z.wallW[k]) return false;
        if (j > 0 && this.z.wallN[k]) return false;
      } else {
        // multi-tile objects may not straddle internal walls
        if (i > 0 && this.z.wallW[k]) return false;
        if (j > 0 && this.z.wallN[k]) return false;
      }
    }
    return true;
  }

  light(x: number, z: number, kind: LightSource['kind'], o: Partial<LightSource> = {}): LightSource {
    const presets: Record<string, Partial<LightSource>> = {
      fluoro: { color: 0xf1edd0, intensity: 0.62, radius: 5.2, y: 2.65 },
      bulb: { color: 0xffc98a, intensity: 1.0, radius: 5.0, y: 2.3 },
      sodium: { color: 0xffa040, intensity: 1.15, radius: 9, y: 4 },
      lamp: { color: 0xffd8a0, intensity: 0.8, radius: 4.0, y: 1.4 },
      neon: { color: 0xff40c0, intensity: 0.7, radius: 4.5, y: 2.4 },
      sky: { color: 0xcfe2ff, intensity: 0.7, radius: 6, y: 3 },
      screen: { color: 0x7fd8ff, intensity: 0.35, radius: 2.5, y: 1.0 },
      fire: { color: 0xff8a3a, intensity: 1.2, radius: 6, y: 0.6 },
      emergency: { color: 0xff3020, intensity: 0.55, radius: 4, y: 2.4 },
    };
    const p = presets[kind] || {};
    const l: LightSource = {
      id: uid(), x, z, y: o.y ?? p.y ?? 2.6, color: o.color ?? p.color ?? 0xffffff, intensity: o.intensity ?? p.intensity ?? 1,
      radius: o.radius ?? p.radius ?? 5, kind, circuit: o.circuit ?? 0, on: o.on ?? true, broken: o.broken ?? false, flicker: o.flicker ?? 0, objUid: o.objUid,
    };
    this.z.lights.push(l);
    return l;
  }

  portal(p: Portal) { this.z.portals.push(p); return p; }

  /** outer boundary walls around the playable area [1..W-2]x[1..H-2] */
  boundary(wall = 'drywall') {
    const z = this.z;
    this.hwall(1, z.W - 2, 1, wall);
    this.hwall(1, z.W - 2, z.H - 1, wall);
    this.vwall(1, 1, z.H - 2, wall);
    this.vwall(z.W - 1, 1, z.H - 2, wall);
  }

  /** Bounding-box helper: is the rect inside zone and all floor */
  rectFree(x0: number, y0: number, x1: number, y1: number) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (!this.z.inb(x, y)) return false;
      const objs = this.z.tileObjs.get(this.z.idx(x, y));
      if (objs && objs.some((o) => !objDef(o.key)?.ceiling)) return false;
    }
    return true;
  }

  /** Clear walls inside rect (interior), keep boundary */
  clearWallsIn(x0: number, y0: number, x1: number, y1: number) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (!this.z.inb(x, y)) continue;
      if (y > y0) this.clearN(x, y);
      if (x > x0) this.clearW(x, y);
    }
  }

  /** remove objects in rect */
  clearObjects(x0: number, y0: number, x1: number, y1: number) {
    for (const o of [...this.z.objects.values()]) if (o.x >= x0 && o.x <= x1 && o.y >= y0 && o.y <= y1) this.z.removeObject(o);
  }
}
