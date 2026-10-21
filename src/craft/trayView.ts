// Flat containers in first person: a drawer's wooden tray, fridge shelves, a
// trunk's carpet, the floor at your feet, your jumpsuit's pockets laid out as
// pouches, and the tool roll's canvas loops with the brass quick-draw holster.
import * as THREE from 'three';
import type { Item } from '../items/item';
import { type GridSpec, type Rot, testFit, extentIn } from '../items/grid';
import { ModelBuilder } from '../gfx/modelBuilder';
import { GridView3, type DropAt } from './gridView3';
import { fpMat } from './fpKit';

const LOOK: Record<string, { tex: string; color: number; rim: string; rimColor: number; cell?: number }> = {
  wood: { tex: 'wood_light', color: 0xc8a070, rim: 'wood_dark', rimColor: 0x8a6a42 },
  laminate: { tex: 'plastic_white', color: 0xd8d0c0, rim: 'wood_dark', rimColor: 0x7a5a3a },
  shelf: { tex: 'wood_light', color: 0xb89060, rim: 'metal_grey', rimColor: 0x8a9096 },
  steel: { tex: 'metal_grey', color: 0x9aa0a6, rim: 'metal_dark', rimColor: 0x6a7076 },
  fridge: { tex: 'plastic_white', color: 0xe8eef0, rim: 'metal_brushed', rimColor: 0xc8d0d4 },
  freezer: { tex: 'plastic_white', color: 0xd8eaf2, rim: 'metal_brushed', rimColor: 0xb8c8d0 },
  crate: { tex: 'wood_light', color: 0xa88a5a, rim: 'wood_dark', rimColor: 0x6a4a2a },
  cardboard: { tex: 'cardboard', color: 0xc8a070, rim: 'cardboard', rimColor: 0xa88050 },
  carpet: { tex: 'carpet_office', color: 0x8a8a90, rim: 'rubber_black', rimColor: 0x3a3a3a },
  trash: { tex: 'rubber_black', color: 0x4a4e4a, rim: 'rubber_black', rimColor: 0x2a2e2a },
  vending: { tex: 'metal_grey', color: 0xa8a8b0, rim: 'metal_dark', rimColor: 0x5a5a62 },
  oven: { tex: 'metal_dark', color: 0x6a6a6a, rim: 'metal_grey', rimColor: 0x9a9a9a },
  medical: { tex: 'plastic_white', color: 0xf0f0ea, rim: 'metal_grey', rimColor: 0xb0b6bc },
  toolbox: { tex: 'metal_painted_green', color: 0xc84a3a, rim: 'metal_dark', rimColor: 0x5a1a1a },
  pile: { tex: 'concrete', color: 0x8a8478, rim: 'concrete', rimColor: 0x6a6458 },
  cooler: { tex: 'plastic_white', color: 0x4a8ac8, rim: 'plastic_white', rimColor: 0xe8e8e8 },
  corpse: { tex: 'fabric_red', color: 0x5a2a2a, rim: 'fabric_brown', rimColor: 0x3a2018 },
  floor: { tex: 'carpet_yellow', color: 0xd8c890, rim: 'carpet_yellow', rimColor: 0xb8a870 },
  pocket: { tex: 'fabric_grey', color: 0xeeb415, rim: 'fabric_grey', rimColor: 0xb88a10 },
  canvas: { tex: 'fabric_grey', color: 0x8a8a6a, rim: 'fabric_brown', rimColor: 0x5a4a32 },
  loops: { tex: 'fabric_brown', color: 0x8a7650, rim: 'fabric_brown', rimColor: 0x5a4a30 },
};

export class TrayView extends GridView3 {
  /** cell size across (x and layers) */
  cw = 0.055;
  /** rows are longer in the tool roll (each loop holds a long tool) */
  ch = 0.055;
  /** region -> display offset in cells (pockets are laid out as separate pouches) */
  private off = new Map<number, [number, number]>();
  private dispW = 1;
  private dispH = 1;
  private shell: THREE.Mesh | null = null;
  /** where on the tray each region sits, for labels: region index -> local center */
  regionCenters: { label: string; x: number; z: number; manual?: boolean }[] = [];

  cellSize(): [number, number, number] { return [this.cw, this.ch, this.cw]; }
  protected maxScale() { return this.spec?.unit ? 1.6 : 1.2; }

  /** display size in scene units */
  size(): [number, number] { return [this.dispW * this.cw, this.dispH * this.ch]; }

  cellMin(gx: number, gy: number, gz: number, out: THREE.Vector3): THREE.Vector3 {
    const spec = this.spec;
    let dx = 0, dy = 0;
    if (spec && this.off.size) {
      const ri = spec.ri[Math.max(0, Math.min(spec.w - 1, gx)) + Math.max(0, Math.min(spec.h - 1, gy)) * spec.w];
      const r = spec.regions[ri];
      const o = this.off.get(ri);
      if (r && o) { dx = o[0] - r.x; dy = o[1] - r.y; }
    }
    return out.set((gx + dx) * this.cw, gz * this.cw, (gy + dy) * this.ch);
  }

  protected buildShell(spec: GridSpec) {
    this.ch = spec.unit ? this.cw * 3.2 : this.cw;
    // pouches: pockets are scattered over a wide sparse grid; lay them out side by side
    this.off.clear();
    if (spec.style === 'pocket') {
      let x = 0, y = 0, rowH = 0;
      const maxW = 9;
      spec.regions.forEach((r, i) => {
        if (x > 0 && x + r.w > maxW) { x = 0; y += rowH + 1; rowH = 0; }
        this.off.set(i, [x, y]); x += r.w + 1; rowH = Math.max(rowH, r.h);
      });
      this.dispW = Math.max(1, ...[...this.off.entries()].map(([i, o]) => o[0] + spec.regions[i].w));
      this.dispH = Math.max(1, y + rowH);
    } else { this.dispW = spec.w; this.dispH = spec.h; }
    const look = LOOK[spec.style] || LOOK.wood;
    const mb = new ModelBuilder();
    const cw = this.cw, ch = this.ch, rim = 0.012;
    this.regionCenters = [];
    const regs = spec.style === 'pocket' ? spec.regions.map((r, i) => ({ r, o: this.off.get(i)! })) : spec.regions.map((r) => ({ r, o: [r.x, r.y] as [number, number] }));
    for (const { r, o } of regs) {
      const x0 = o[0] * cw, z0 = o[1] * ch, w = r.w * cw, d = r.h * ch;
      const holster = !!r.manual;
      mb.box(x0 + w / 2, -0.008, z0 + d / 2, w, 0.008, d, look.tex, { color: holster ? 0x9a7a3a : look.color });
      // rims
      const rc = holster ? 0xc8a040 : look.rimColor, rt = holster ? 'metal_brass' : look.rim;
      mb.box(x0 + w / 2, -0.008, z0 - rim / 2, w + rim * 2, 0.02, rim, rt, { color: rc });
      mb.box(x0 + w / 2, -0.008, z0 + d + rim / 2, w + rim * 2, 0.02, rim, rt, { color: rc });
      mb.box(x0 - rim / 2, -0.008, z0 + d / 2, rim, 0.02, d, rt, { color: rc });
      mb.box(x0 + w + rim / 2, -0.008, z0 + d / 2, rim, 0.02, d, rt, { color: rc });
      // cell seams (stitching on canvas, joints on wood)
      for (let i = 1; i < r.w; i++) mb.box(x0 + i * cw, -0.0005, z0 + d / 2, 0.0025, 0.001, d, look.rim, { color: (look.rimColor & 0xfefefe) >> 1 });
      for (let j = 1; j < r.h; j++) mb.box(x0 + w / 2, -0.0005, z0 + j * ch, w, 0.001, 0.0025, look.rim, { color: (look.rimColor & 0xfefefe) >> 1 });
      // tool loops: a leather strap across each loop
      if (spec.unit) for (let i = 0; i < r.w; i++) mb.box(x0 + (i + 0.5) * cw, 0, z0 + d * 0.62, cw * 0.86, 0.006, 0.016, 'fabric_brown', { color: holster ? 0x6a4a20 : 0x4a3420 });
      this.regionCenters.push({ label: r.label, x: x0 + w / 2, z: z0 + d / 2, manual: r.manual });
    }
    if (this.shell) this.space.remove(this.shell);
    this.shell = new THREE.Mesh(mb.build(), fpMat());
    this.space.add(this.shell);
    const [W, D] = this.size();
    this.space.position.set(-W / 2, 0, -D / 2);
  }

  private inv = new THREE.Matrix4();
  private lr = new THREE.Ray();
  /** the cell under a ray on the tray's surface (local cell coords, or null) */
  private hitCell(ray: THREE.Ray): [number, number] | null {
    if (!this.root.visible || !this.spec) return null;
    this.space.updateWorldMatrix(true, false);
    this.inv.copy(this.space.matrixWorld).invert();
    const r = this.lr.copy(ray).applyMatrix4(this.inv);
    if (Math.abs(r.direction.y) < 1e-4) return null;
    const t = -r.origin.y / r.direction.y;
    if (t < 0) return null;
    const hx = (r.origin.x + r.direction.x * t) / this.cw, hz = (r.origin.z + r.direction.z * t) / this.ch;
    if (hx < -0.8 || hz < -0.8 || hx > this.dispW + 0.8 || hz > this.dispH + 0.8) return null;
    return [hx, hz];
  }

  targetAt(ray: THREE.Ray, it: Item, rot: Rot, count: number): DropAt | null {
    const spec = this.spec, occ = this.occ, c = this.c;
    if (!spec || !occ || !c) return null;
    const h = this.hitCell(ray);
    if (!h) return null;
    const flatRot = (rot === 1 ? 1 : 0) as Rot;
    const [ex, ey, ez] = extentIn(spec, it, flatRot);
    // the floor takes anything anywhere: it lays itself out
    if (spec.transient) return { view: this, c, at: { gx: 0, gy: 0, rot: flatRot }, fit: 'free', ex, ey, ez };
    // display cell -> grid cell (pockets: which pouch)
    let gx = Math.round(h[0] - ex / 2), gy = Math.round(h[1] - ey / 2);
    if (this.off.size) {
      let best = -1, bd = 1e9;
      for (const [i, o] of this.off) {
        const r = spec.regions[i];
        const cx = o[0] + r.w / 2, cy = o[1] + r.h / 2;
        const dd = Math.max(0, Math.abs(h[0] - cx) - r.w / 2) + Math.max(0, Math.abs(h[1] - cy) - r.h / 2);
        if (dd < bd) { bd = dd; best = i; }
      }
      if (best < 0 || bd > 1.2) return null;
      const r = spec.regions[best], o = this.off.get(best)!;
      gx = Math.max(r.x, Math.min(r.x + r.w - ex, Math.round(h[0] - ex / 2) - o[0] + r.x));
      gy = Math.max(r.y, Math.min(r.y + r.h - ey, Math.round(h[1] - ey / 2) - o[1] + r.y));
    } else {
      if (spec.unit) { gx = Math.floor(h[0]); gy = 0; }
      gx = Math.max(0, Math.min(spec.w - Math.min(ex, spec.w), gx));
      gy = Math.max(0, Math.min(spec.h - Math.min(ey, spec.h), gy));
    }
    const fit = testFit(occ, it, gx, gy, flatRot, count);
    return { view: this, c, at: { gx, gy, rot: flatRot }, fit, ex, ey, ez };
  }
}
