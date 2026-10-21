// A container drawn in first person: its items as their 3D models sitting in
// their cells. CubeView (the iron cube) and TrayView (drawers, shelves,
// pockets, the floor, the tool roll) build the box around them and map
// cells to space; this base keeps one model per stack in step with the data.
import * as THREE from 'three';
import type { Container } from '../items/container';
import type { Item } from '../items/item';
import { type GridSpec, type Occ, type Anchor, type Rot, type Fit, type Placement, gridSpec, occupancy, packLayout, extentIn } from '../items/grid';
import { type ItemObj, makeItemObj, fitItemObj, boxEdges, damp, itemAlign } from './fpKit';

export interface DropAt { view: GridView3; c: Container; at: Placement; fit: Fit; ex: number; ey: number; ez: number }
interface Slot { obj: ItemObj; extra: ItemObj[]; a: Anchor; tgt: THREE.Vector3; seen: boolean }

const _v = new THREE.Vector3();

export abstract class GridView3 {
  readonly root = new THREE.Group();
  /** cell space: origin at cell (0,0,0)'s min corner; x = cols, -y... see cellCenter */
  readonly space = new THREE.Group();
  readonly itemsG = new THREE.Group();
  c: Container | null = null;
  spec: GridSpec | null = null;
  occ: Occ | null = null;
  /** items not drawn here (being dragged, laid on the bench) */
  hidden = new Set<Item>();
  /** layers drawn (the cube peels from the top) */
  peel = 99;
  private slots = new Map<number, Slot>();
  private hover: THREE.LineSegments;
  private hoverA: Anchor | null = null;
  private floorAt: Map<Item, Placement> | null = null;
  private sig = '';

  constructor() {
    this.root.add(this.space);
    this.space.add(this.itemsG);
    this.hover = boxEdges(0xfff2c0, 0.9);
    this.hover.visible = false;
    this.hover.renderOrder = 5;
    this.space.add(this.hover);
  }

  /** cell sizes in scene units: x, rows, layers */
  abstract cellSize(): [number, number, number];
  /** min corner of a cell in `space` coordinates */
  cellMin(gx: number, gy: number, gz: number, out: THREE.Vector3): THREE.Vector3 {
    const [cx, cy, cz] = this.cellSize();
    return out.set(gx * cx, gz * cz, gy * cy);
  }
  /** rebuild the box around the items when the grid's shape changes */
  protected abstract buildShell(spec: GridSpec): void;
  /** the drop spot under a ray for an item (null = not over this view) */
  abstract targetAt(ray: THREE.Ray, it: Item, rot: Rot, count: number): DropAt | null;

  /** show a container (null = nothing) */
  setContainer(c: Container | null) {
    if (c !== this.c) { this.c = c; this.clearSlots(); this.sig = ''; }
    this.refresh();
  }

  /** re-read the grid (call when the container changed) */
  refresh() {
    const c = this.c;
    this.spec = c ? gridSpec(c) : null;
    const spec = this.spec;
    if (!c || !spec) { this.occ = null; this.clearSlots(); this.root.visible = !!c; return; }
    this.root.visible = true;
    if (spec.sig + spec.style !== this.sig) { this.sig = spec.sig + spec.style; this.buildShell(spec); }
    // the floor lays itself out fresh each look; everything else has stored cells
    if (spec.transient) {
      const items = c.items.filter((i) => !this.hidden.has(i));
      this.floorAt = packLayout(items, spec).at;
      const at = this.floorAt;
      this.occ = occupancy(items, spec, null, (i) => at.get(i));
    } else {
      this.floorAt = null;
      this.occ = occupancy(c.items, spec, this.hidden);
    }
    const seen = new Set<number>();
    for (const a of this.occ.anchors) {
      const k = a.items[0].uid;
      seen.add(k);
      let s = this.slots.get(k);
      const fresh = !s || s.obj.key !== a.items[0].key;
      if (fresh) {
        if (s) this.dropSlot(k, s);
        s = { obj: makeItemObj(a.items[0].key), extra: [], a, tgt: new THREE.Vector3(), seen: true };
        s.obj.outer.userData.uid = k;
        this.itemsG.add(s.obj.outer);
        this.slots.set(k, s);
      }
      s!.a = a;
      this.placeSlot(s!, fresh);
    }
    for (const [k, s] of this.slots) if (!seen.has(k)) this.dropSlot(k, s);
    this.applyPeel();
    if (this.hoverA) this.setHover(this.hoverA.items[0]);
  }

  private placeSlot(s: Slot, fresh: boolean) {
    const spec = this.spec!;
    const a = s.a;
    const [cx, cy, cz] = this.cellSize();
    const [ex, ey, ez] = spec.unit ? [1, 1, 1] : extentIn(spec, a.items[0], a.rot);
    this.cellMin(a.gx, a.gy, a.gz, s.tgt);
    s.tgt.x += (ex * cx) / 2; s.tgt.y += (ez * cz) / 2; s.tgt.z += (ey * cy) / 2;
    fitItemObj(s.obj, a.rot, ex * cx, ey * cy, ez * cz, this.maxScale());
    if (fresh) { s.obj.outer.position.copy(s.tgt); s.obj.outer.position.y += cz * 1.5; }
    // a stack shows up to three of itself
    const n = Math.min(3, a.items.length);
    while (s.extra.length < n - 1) { const e = makeItemObj(a.items[0].key); s.obj.outer.add(e.outer); s.extra.push(e); }
    while (s.extra.length > n - 1) { const e = s.extra.pop()!; s.obj.outer.remove(e.outer); }
    const al = itemAlign(a.items[0].key);
    const th = al ? al.base[2] : 0.02, wd = al ? al.base[0] : 0.05;
    s.extra.forEach((e, i) => { e.outer.position.set(wd * 0.12 * (i + 1), th * 0.8 * (i + 1), 0); e.outer.rotation.set(0, 0.25 * (i + 1), 0); e.outer.scale.setScalar(1); });
  }

  protected maxScale() { return 1.25; }

  private dropSlot(k: number, s: Slot) { this.itemsG.remove(s.obj.outer); this.slots.delete(k); }
  private clearSlots() { for (const [k, s] of this.slots) this.dropSlot(k, s); this.hoverA = null; this.hover.visible = false; }

  /** hide the layers above `peel` */
  applyPeel() {
    for (const s of this.slots.values()) s.obj.outer.visible = s.a.gz < this.peel;
  }

  /** ease items toward their cells (falls, moves) */
  update(dt: number) {
    for (const s of this.slots.values()) {
      const p = s.obj.outer.position;
      if (p.distanceToSquared(s.tgt) < 1e-8) continue;
      p.x = damp(p.x, s.tgt.x, 18, dt); p.z = damp(p.z, s.tgt.z, 18, dt);
      // drop with a little gravity feel
      p.y = p.y > s.tgt.y ? Math.max(s.tgt.y, p.y - dt * 1.6) : damp(p.y, s.tgt.y, 18, dt);
    }
  }

  /** the stack under a ray */
  pickAt(rc: THREE.Raycaster): { a: Anchor; dist: number } | null {
    if (!this.root.visible || !this.occ) return null;
    const objs: THREE.Object3D[] = [];
    for (const s of this.slots.values()) if (s.obj.outer.visible) objs.push(s.obj.outer);
    const hits = rc.intersectObjects(objs, true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o && o.userData.uid === undefined) o = o.parent;
      const s = o ? this.slots.get(o.userData.uid) : null;
      if (s) return { a: s.a, dist: h.distance };
    }
    return null;
  }

  /** outline a stack (null = none) */
  setHover(it: Item | null) {
    const s = it ? [...this.slots.values()].find((q) => q.a.items.includes(it)) : null;
    this.hoverA = s?.a ?? null;
    if (!s || !this.spec) { this.hover.visible = false; return; }
    const [cx, cy, cz] = this.cellSize();
    const [ex, ey, ez] = this.spec.unit ? [1, 1, 1] : extentIn(this.spec, s.a.items[0], s.a.rot);
    this.cellMin(s.a.gx, s.a.gy, s.a.gz, _v);
    this.hover.position.set(_v.x + (ex * cx) / 2, _v.y + (ez * cz) / 2, _v.z + (ey * cy) / 2);
    this.hover.scale.set(ex * cx, ez * cz, ey * cy);
    this.hover.visible = true;
  }

  /** an item's model position in world space (for hands reaching for it) */
  itemWorldPos(it: Item, out: THREE.Vector3): THREE.Vector3 | null {
    for (const s of this.slots.values()) if (s.a.items.includes(it)) return s.obj.outer.getWorldPosition(out);
    return null;
  }

  /** a ghost box at a placement (space coordinates) */
  boxAt(at: Placement, ex: number, ey: number, ez: number, center: THREE.Vector3, size: THREE.Vector3) {
    const [cx, cy, cz] = this.cellSize();
    this.cellMin(at.gx, at.gy, at.gz ?? 0, center);
    size.set(ex * cx, ez * cz, ey * cy);
    center.x += size.x / 2; center.y += size.y / 2; center.z += size.z / 2;
  }
}
