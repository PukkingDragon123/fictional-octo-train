// The Remittance cube in first person: riveted iron walls, a hinged lid held
// shut by four bolts, an electromechanical thumb reader on the front (brass
// bezel, green phosphor glass, relays that clack), and inside a 5x5x5 grid
// of fist-sized cells: stamped steel dividers on the floor, chalked lines up
// the walls, a bulb in the lid. Items sit in their cells as their
// models; layers can be peeled off the top to see what is underneath.
import * as THREE from 'three';
import type { Item } from '../items/item';
import { type GridSpec, type Rot, dropSpot, extentIn } from '../items/grid';
import { ModelBuilder } from '../gfx/modelBuilder';
import { GridView3, type DropAt } from './gridView3';
import { fpMat } from './fpKit';
import { pixTag, type PixTag } from './tags';

export const CELL = 0.085;
const W = 0.024;

let printTex: THREE.Texture | null = null;
/** the reader's glass: a little round-cornered phosphor tube, ridges of an old print burnt in */
function fingerprintTex(): THREE.Texture {
  if (printTex) return printTex;
  const c = document.createElement('canvas'); c.width = 24; c.height = 24;
  const x = c.getContext('2d')!;
  x.fillStyle = '#071208'; x.fillRect(0, 0, 24, 24);
  for (let r = 2; r < 11; r += 1.8) {
    x.strokeStyle = r % 3.6 < 1.8 ? '#1f4a22' : '#143018'; x.lineWidth = 1;
    x.beginPath(); x.ellipse(12, 13, r * 0.8, r, 0.15, Math.PI * 0.1, Math.PI * 1.9); x.stroke();
  }
  // curved-glass highlight
  x.fillStyle = 'rgba(200,255,200,0.18)'; x.fillRect(4, 3, 6, 2); x.fillRect(3, 5, 2, 4);
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
  readonly light = new THREE.PointLight(0xffd49a, 0, 1.4, 1.6);
  /** the engraved brass plate on the front, and the instructions riveted inside the lid */
  readonly plate: PixTag;
  readonly lidPlate: PixTag;
  private grid: THREE.LineSegments | null = null;
  private gridMat = new THREE.LineBasicMaterial({ color: 0xe8dcc0, transparent: true, opacity: 0.0, depthWrite: false });
  private peelPlane: THREE.Mesh;
  private peelGrid: THREE.LineSegments | null = null;
  private I = CELL * 5;
  private boltRest: number[] = [];

  constructor() {
    super();
    this.root.add(this.body);
    this.body.add(this.lid);
    this.padMat = new THREE.MeshBasicMaterial({ map: fingerprintTex(), color: 0x7a8a7a });
    this.pad = new THREE.Mesh(new THREE.PlaneGeometry(0.062, 0.062), this.padMat);
    this.scan = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.005), new THREE.MeshBasicMaterial({ color: 0x8dff7a, transparent: true, opacity: 0, depthWrite: false }));
    this.body.add(this.pad, this.scan, this.light);
    this.plate = pixTag('plate', 72, 22, 0.15);
    this.plate.mesh.renderOrder = 2;
    this.body.add(this.plate.mesh);
    this.lidPlate = pixTag('plate', 96, 40, 0.3);
    this.lid.add(this.lidPlate.mesh);
    this.setPlate('----');
    this.lidPlate.clear();
    this.lidPlate.type('REMITTANCE CARRIER MK.II', 6, 4, undefined);
    this.lidPlate.para('DRAG TO STOW. R TURN, T TIP, Y ROLL. WHEEL: LAYERS. DOUBLE-CLICK: INSPECT. SHIFT-CLICK: SWAP SIDES.', 6, 13, 86, undefined, 8, 3);
    this.lidPlate.flush();
    this.peelPlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x3a3428, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }));
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
    // stamped steel dividers raised along every cell seam on the floor of the box
    for (let i = 1; i < spec.w; i++) { mb.box(-I / 2 + i * CELL, 0, 0, 0.003, 0.004, I, band, { color: 0x8a9096 }); mb.box(0, 0, -I / 2 + i * CELL, I, 0.004, 0.003, band, { color: 0x8a9096 }); }
    // the thumb reader: a bakelite housing, a brass bezel round the phosphor glass, two relays on the side
    mb.box(0.11, H * 0.42, O / 2 + 0.004, 0.1, 0.1, 0.008, 'rubber_black', { color: 0x4a3020 });
    for (const [dx, dy, w, h] of [[0, 0.036, 0.08, 0.008], [0, -0.036, 0.08, 0.008], [0.036, 0, 0.008, 0.08], [-0.036, 0, 0.008, 0.08]] as [number, number, number, number][]) mb.box(0.11 + dx, H * 0.42 + 0.05 + dy - h / 2, O / 2 + 0.01, w, h, 0.006, 'metal_brass', { color: 0xd8b060 });
    for (const dy of [0.02, 0.07]) { mb.box(0.175, H * 0.42 + dy, O / 2 + 0.008, 0.022, 0.022, 0.016, 'rubber_black', { color: 0x2a2a2a }); mb.push().translate(0.175, H * 0.42 + dy + 0.022, O / 2 + 0.012); mb.cylinder(0, 0, 0, 0.006, 0.01, 6, 'metal_brass', { color: 0xc87a3a }); mb.pop(); }
    // the engraved plate sits on a dark backing
    mb.box(-0.1, H * 0.46, O / 2 + 0.003, 0.16, 0.054, 0.004, 'metal_dark', { color: 0x3a3e42 });
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
    // scanner glass and its sweep, the plates
    this.pad.position.set(0.11, H * 0.42 + 0.05, O / 2 + 0.0095);
    this.scan.position.copy(this.pad.position); this.scan.position.z += 0.001;
    this.plate.mesh.position.set(-0.1, H * 0.46 + 0.027, O / 2 + 0.0058);
    this.lidPlate.mesh.position.set(0, -0.003, O / 2);
    this.lidPlate.mesh.rotation.set(Math.PI / 2, 0, 0);
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
    this.peelGrid = new THREE.LineSegments(pg, new THREE.LineBasicMaterial({ color: 0xf0e8d0, transparent: true, opacity: 0.6, depthWrite: false }));
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
    m.color.setHex(ok ? 0x8dff7a : 0xff7a3a);
    this.scan.position.y = this.pad.position.y + 0.028 - sweep * 0.056;
    this.padMat.color.setRGB(0.45 + glow * 0.3, 0.52 + glow * 0.48, 0.45 + glow * 0.25);
  }
  /** the debtor's number engraved on the front plate */
  setPlate(no: string) {
    const t = this.plate;
    t.clear();
    t.type('REMITTANCE', 6, 3);
    t.type('No.' + no, 6, 12);
    t.flush();
  }
  /** the inside: grid lines and light */
  setInside(k: number, flicker = 0) {
    this.gridMat.opacity = 0.42 * k;
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
