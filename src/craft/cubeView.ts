// The Remittance cube in first person: riveted iron walls, a hinged lid held
// shut by four bolts, a thumb scanner on the front, and inside a 5x5x5 grid
// of fist-sized cells lit from within. Items sit in their cells as their
// models; layers can be peeled off the top to see what is underneath.
import * as THREE from 'three';
import type { Item } from '../items/item';
import { type GridSpec, type Rot, dropSpot, extentIn } from '../items/grid';
import { ModelBuilder } from '../gfx/modelBuilder';
import { GridView3, type DropAt } from './gridView3';
import { fpMat } from './fpKit';

export const CELL = 0.085;
const W = 0.024;

let printTex: THREE.Texture | null = null;
/** the scanner glass: a whorl of ridges */
function fingerprintTex(): THREE.Texture {
  if (printTex) return printTex;
  const c = document.createElement('canvas'); c.width = 32; c.height = 32;
  const x = c.getContext('2d')!;
  x.fillStyle = '#06181a'; x.fillRect(0, 0, 32, 32);
  for (let r = 2; r < 15; r += 2.2) {
    x.strokeStyle = r % 4 < 2 ? '#2fd6c4' : '#1a8a80'; x.lineWidth = 1;
    x.beginPath(); x.ellipse(16, 18, r * 0.8, r, 0.2, Math.PI * (0.1 + (r % 3) * 0.05), Math.PI * (1.9 - (r % 2) * 0.1)); x.stroke();
  }
  x.strokeStyle = '#9aa0a4'; x.strokeRect(0.5, 0.5, 31, 31);
  printTex = new THREE.CanvasTexture(c);
  printTex.magFilter = THREE.NearestFilter; printTex.minFilter = THREE.NearestFilter; printTex.colorSpace = THREE.SRGBColorSpace;
  return printTex;
}

export class CubeView extends GridView3 {
  readonly body = new THREE.Group();
  readonly lid = new THREE.Group();
  readonly bolts: THREE.Mesh[] = [];
  readonly pad: THREE.Mesh;
  readonly padMat: THREE.MeshBasicMaterial;
  readonly scan: THREE.Mesh;
  readonly light = new THREE.PointLight(0x9ff0ff, 0, 1.4, 1.6);
  private grid: THREE.LineSegments | null = null;
  private gridMat = new THREE.LineBasicMaterial({ color: 0x5ae0d0, transparent: true, opacity: 0.0, depthWrite: false });
  private peelPlane: THREE.Mesh;
  private peelGrid: THREE.LineSegments | null = null;
  private I = CELL * 5;
  private boltRest: number[] = [];

  constructor() {
    super();
    this.root.add(this.body);
    this.body.add(this.lid);
    this.padMat = new THREE.MeshBasicMaterial({ map: fingerprintTex(), color: 0x6a8a88 });
    this.pad = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.07), this.padMat);
    this.scan = new THREE.Mesh(new THREE.PlaneGeometry(0.072, 0.006), new THREE.MeshBasicMaterial({ color: 0x7affea, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.body.add(this.pad, this.scan, this.light);
    this.peelPlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x5ae0d0, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide }));
    this.peelPlane.rotation.x = -Math.PI / 2;
    this.peelPlane.visible = false;
    this.space.add(this.peelPlane);
  }

  cellSize(): [number, number, number] { return [CELL, CELL, CELL]; }

  protected buildShell(spec: GridSpec) {
    const I = (this.I = spec.w * CELL);
    const H = spec.d * CELL;
    this.space.position.set(-I / 2, 0, -I / 2);
    for (const ch of [...this.body.children]) if ((ch as any).userData.shell) this.body.remove(ch);
    const mat = fpMat();
    const iron = 'metal_dark', band = 'metal_grey', rust = 'metal_rusty';
    const mb = new ModelBuilder();
    const O = I + 2 * W;
    mb.box(0, -W, 0, O, W, O, iron, { color: 0x8a9096 });
    mb.box(0, -W, -I / 2 - W / 2, O, H + W, W, iron, { color: 0x9aa0a6 });
    mb.box(0, -W, I / 2 + W / 2, O, H + W, W, iron, { color: 0x9aa0a6 });
    for (const s of [-1, 1]) mb.box(s * (I / 2 + W / 2), -W, 0, W, H + W, I, iron, { color: 0x949aa0 });
    // inner lining: darker, with rust bloom at the floor seams
    mb.box(0, 0.0005, 0, I, 0.002, I, rust, { color: 0x6a5a50 });
    // corner posts, rim band, rivet rows
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mb.box(sx * (O / 2), -W - 0.002, sz * (O / 2), 0.03, H + W + 0.006, 0.03, band, { color: 0x6a7076 });
    for (const sz of [-1, 1]) mb.box(0, H - 0.012, sz * (O / 2 + 0.002), O + 0.01, 0.016, 0.008, band, { color: 0x7a8086 });
    for (const sx of [-1, 1]) mb.box(sx * (O / 2 + 0.002), H - 0.012, 0, 0.008, 0.016, O + 0.01, band, { color: 0x7a8086 });
    for (let i = 0; i < 7; i++) {
      const x = -O / 2 + 0.03 + i * ((O - 0.06) / 6);
      for (const y of [-W / 2, H - 0.03]) { mb.push().translate(x, y, O / 2 + 0.001).rotateX(Math.PI / 2); mb.cylinder(0, 0, 0, 0.0055, 0.006, 6, band, { color: 0xb0b6bc }); mb.pop(); }
    }
    // scanner housing on the front face
    mb.box(0.11, H * 0.42, O / 2 + 0.004, 0.1, 0.1, 0.008, band, { color: 0x3a3e42 });
    // stencil plate
    mb.box(-0.1, H * 0.46, O / 2 + 0.003, 0.15, 0.05, 0.004, 'metal_brushed', { color: 0xc8b048 });
    // bolt housings: two on the front, one each side
    const boltPos: [number, number, number, number][] = [[-0.14, H - 0.05, O / 2 + 0.012, 0], [0.04, H - 0.05, O / 2 + 0.012, 0], [-O / 2 - 0.012, H - 0.05, 0.05, 1], [O / 2 + 0.012, H - 0.05, -0.05, 1]];
    for (const [x, y, z, side] of boltPos) mb.box(x, y - 0.012, z, side ? 0.016 : 0.034, 0.036, side ? 0.034 : 0.016, band, { color: 0x4a4e52 });
    const shell = new THREE.Mesh(mb.build(), mat);
    shell.userData.shell = true;
    this.body.add(shell);
    // the bolt pins (they ride up into the lid when locked)
    const bg = new ModelBuilder();
    bg.cylinder(0, 0, 0, 0.007, 0.05, 6, 'metal_brushed', { color: 0xe0e4e8 });
    const bgeo = bg.build();
    this.bolts.length = 0; this.boltRest.length = 0;
    for (const [x, y, z] of boltPos) {
      const m = new THREE.Mesh(bgeo, mat);
      m.position.set(x, y - 0.006, z);
      m.userData.shell = true;
      this.body.add(m); this.bolts.push(m); this.boltRest.push(y - 0.006);
    }
    // the lid, hinged along the back top edge
    this.lid.position.set(0, H, -O / 2);
    for (const ch of [...this.lid.children]) this.lid.remove(ch);
    const lb = new ModelBuilder();
    lb.box(0, 0, O / 2, O + 0.008, W * 1.1, O + 0.008, iron, { color: 0x9aa0a6 });
    lb.box(0, W * 1.1, O / 2, O - 0.05, 0.006, O - 0.05, band, { color: 0x6a7076 });
    lb.box(0, W * 1.1 + 0.006, O / 2 + 0.04, 0.16, 0.022, 0.024, band, { color: 0x3a3e42 });
    for (let i = 0; i < 4; i++) lb.box(-0.15 + i * 0.1, -0.004, O / 2, 0.012, 0.004, O - 0.02, rust, { color: 0x8a7a6a });
    const lidMesh = new THREE.Mesh(lb.build(), mat);
    this.lid.add(lidMesh);
    // scanner glass and its sweep
    this.pad.position.set(0.11, H * 0.42 + 0.05, O / 2 + 0.0095);
    this.scan.position.copy(this.pad.position); this.scan.position.z += 0.001;
    this.light.position.set(0, H * 0.85, 0);
    // the grid inside: floor, back and side walls, every cell edge
    const pts: number[] = [];
    const L = (a: number[], b: number[]) => pts.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    for (let i = 0; i <= spec.w; i++) { const t = i * CELL; L([t, 0.002, 0], [t, 0.002, I]); L([0, 0.002, t], [I, 0.002, t]); }
    for (let i = 0; i <= spec.d; i++) { const y = i * CELL; L([0, y, 0.002], [I, y, 0.002]); L([0.002, y, 0], [0.002, y, I]); L([I - 0.002, y, 0], [I - 0.002, y, I]); }
    for (let i = 0; i <= spec.w; i++) { const t = i * CELL; L([t, 0, 0.002], [t, H, 0.002]); L([0.002, 0, t], [0.002, H, t]); L([I - 0.002, 0, t], [I - 0.002, H, t]); }
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    if (this.grid) this.space.remove(this.grid);
    this.grid = new THREE.LineSegments(gg, this.gridMat);
    this.space.add(this.grid);
    // the cut plane drawn where layers are peeled away
    const pp: number[] = [];
    for (let i = 0; i <= spec.w; i++) { const t = i * CELL; pp.push(t, 0, 0, t, 0, I, 0, 0, t, I, 0, t); }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3));
    if (this.peelGrid) this.space.remove(this.peelGrid);
    this.peelGrid = new THREE.LineSegments(pg, new THREE.LineBasicMaterial({ color: 0x9ff8ec, transparent: true, opacity: 0.45, depthWrite: false }));
    this.peelGrid.visible = false;
    this.space.add(this.peelGrid);
    this.peelPlane.scale.set(I, I, 1);
    this.peelPlane.position.set(I / 2, 0, I / 2);
  }

  // ---------------------------------------------------------------- moving parts
  /** 0 = shut, 1 = thrown back */
  setLid(k: number) { this.lid.rotation.x = -k * 1.95; }
  /** 0 = locked (pins up in the lid), 1 = withdrawn */
  setBolts(k: number) { this.bolts.forEach((b, i) => { b.position.y = this.boltRest[i] + 0.022 * (1 - Math.min(1, Math.max(0, k * 1.6 - i * 0.18))); }); }
  /** the scanner reading a thumb: sweep 0..1, glow 0..1 */
  setScan(sweep: number, glow: number, ok = true) {
    const m = this.scan.material as THREE.MeshBasicMaterial;
    m.opacity = sweep > 0 && sweep < 1 ? 0.95 : 0;
    m.color.setHex(ok ? 0x7affea : 0xff4a3a);
    this.scan.position.y = this.pad.position.y + 0.032 - sweep * 0.064;
    this.padMat.color.setRGB(0.42 + glow * 0.58, 0.55 + glow * 0.45, 0.54 + glow * 0.46);
  }
  /** the inside: grid lines and light */
  setInside(k: number, flicker = 0) {
    this.gridMat.opacity = 0.32 * k;
    this.light.intensity = (1.6 + flicker) * k;
    this.itemsG.visible = k > 0.05;
  }

  applyPeel() {
    super.applyPeel();
    const d = this.spec?.d ?? 5;
    const on = this.peel < d;
    this.peelPlane.visible = on; if (this.peelGrid) this.peelGrid.visible = on;
    const y = Math.min(this.peel, d) * CELL;
    this.peelPlane.position.y = y + 0.001; if (this.peelGrid) this.peelGrid.position.y = y + 0.001;
  }

  // ---------------------------------------------------------------- dropping in
  private inv = new THREE.Matrix4();
  private lr = new THREE.Ray();
  targetAt(ray: THREE.Ray, it: Item, rot: Rot, count: number): DropAt | null {
    const spec = this.spec, occ = this.occ, c = this.c;
    if (!spec || !occ || !c || !this.root.visible) return null;
    this.space.updateWorldMatrix(true, false);
    this.inv.copy(this.space.matrixWorld).invert();
    const r = this.lr.copy(ray).applyMatrix4(this.inv);
    const top = spec.d * CELL;
    if (Math.abs(r.direction.y) < 1e-4) return null;
    const t = (top - r.origin.y) / r.direction.y;
    if (t < 0) return null;
    const hx = r.origin.x + r.direction.x * t, hz = r.origin.z + r.direction.z * t;
    const I = spec.w * CELL;
    const m = CELL * 0.9;
    if (hx < -m || hz < -m || hx > I + m || hz > spec.h * CELL + m) return null;
    const [ex, ey, ez] = extentIn(spec, it, rot);
    const gx = Math.max(0, Math.min(spec.w - Math.min(ex, spec.w), Math.round(hx / CELL - ex / 2)));
    const gy = Math.max(0, Math.min(spec.h - Math.min(ey, spec.h), Math.round(hz / CELL - ey / 2)));
    const ds = ex <= spec.w && ey <= spec.h && ez <= spec.d ? dropSpot(occ, it, gx, gy, rot, count) : null;
    const gz = ds ? ds.gz : Math.max(0, spec.d - ez);
    return { view: this, c, at: { gx, gy, gz, rot }, fit: ds ? ds.fit : 'blocked', ex, ey, ez };
  }
}
