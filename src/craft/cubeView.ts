// The Remittance cube in first person: riveted iron walls in real metal
// (mill scale, scratches, grime, rust at the seams, proper speculars), a
// hinged lid held shut by four steel bolts, and an electromechanical thumb
// reader on the front — a little green-phosphor tube behind a brass bezel,
// two relays that clack. Inside, a 5x5x5 grid of fist-sized cells: stamped
// steel dividers on the floor, chalked lines up the walls, a bulb in the lid.
// Items sit in their cells as their models; layers peel off the top.
import * as THREE from 'three';
import type { Item } from '../items/item';
import { type GridSpec, type Rot, dropSpot, extentIn } from '../items/grid';
import { Shape } from './shapes';
import { crtScreen, phosphorText, cssFont, type CrtScreen } from '../gfx/crt';
const CRT = () => cssFont('--font-crt', 'monospace');
import { GridView3, type DropAt } from './gridView3';
import { pixTag, type PixTag } from './tags';
import { metalMat } from './metal';

export const CELL = 0.085;
const W = 0.024;

export class CubeView extends GridView3 {
  readonly body = new THREE.Group();
  readonly lid = new THREE.Group();
  readonly bolts: THREE.Mesh[] = [];
  /** the reader's tube (its mesh is `pad`, where the thumb goes) */
  readonly reader: CrtScreen;
  readonly pad: THREE.Mesh;
  readonly light = new THREE.PointLight(0xffd49a, 0, 0.9, 2);
  /** the engraved brass plate on the front, and the maker's plate inside the lid */
  readonly plate: PixTag;
  readonly lidPlate: PixTag;
  private shell: THREE.Object3D[] = [];
  private grid: THREE.LineSegments | null = null;
  private gridMat = new THREE.LineBasicMaterial({ color: 0xe8dcc0, transparent: true, opacity: 0.0, depthWrite: false });
  private peelPlane: THREE.Mesh;
  private peelGrid: THREE.LineSegments | null = null;
  private boltRest: number[] = [];
  private no = '----';
  private scanState = '';

  constructor() {
    super();
    this.root.add(this.body);
    this.body.add(this.lid);
    this.reader = crtScreen(0.062, 0.062, { res: [128, 128], tint: 0x8cffb0, curvature: 0.3, glow: 1.1, noise: 0.05, scan: 0.7, mask: 0.25, reflect: 0.8 });
    this.pad = this.reader.mesh;
    this.reader.power(false, true);
    this.body.add(this.pad, this.light);
    this.plate = pixTag('plate', 72, 22, 0.15);
    this.body.add(this.plate.mesh);
    this.lidPlate = pixTag('plate', 100, 34, 0.4);
    this.lid.add(this.lidPlate.mesh);
    this.setPlate('----');
    const lp = this.lidPlate;
    lp.clear();
    lp.type('R turn · T tip · Y roll', 7, 5, undefined, 8.5);
    lp.type('Double-click: work on it', 7, 18, '#4a3410', 7.5);
    lp.flush();
    this.peelPlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x1a1612, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }));
    this.peelPlane.rotation.x = -Math.PI / 2;
    this.peelPlane.visible = false;
    this.space.add(this.peelPlane);
    this.drawReader(0, 'idle');
  }

  cellSize(): [number, number, number] { return [CELL, CELL, CELL]; }

  protected buildShell(spec: GridSpec) {
    const I = spec.w * CELL;
    const H = spec.d * CELL;
    this.space.position.set(-I / 2, 0, -I / 2);
    for (const m of this.shell) m.parent?.remove(m);
    this.shell = [];
    const O = I + 2 * W;
    const add = (sh: Shape, mat: THREE.Material, parent: THREE.Object3D = this.body) => { const m = new THREE.Mesh(sh.build(), mat); parent.add(m); this.shell.push(m); return m; };
    // iron: the walls and floor, edges rolled
    const iron = new Shape(2);
    iron.box(0, -W, 0, O, W, O, 0xffffff, 0.006);
    iron.box(0, -W, -I / 2 - W / 2, O, H + W, W, 0xffffff, 0.006);
    iron.box(0, -W, I / 2 + W / 2, O, H + W, W, 0xffffff, 0.006);
    for (const s2 of [-1, 1]) iron.box(s2 * (I / 2 + W / 2), -W, 0, W, H + W, I, 0xf0f0f0, 0.006);
    add(iron, metalMat('iron', 1));
    // rust bloom on the floor of the box where damp things sat
    const rust = new Shape(3);
    rust.box(0, 0.0005, 0, I, 0.002, I, 0xffffff, 0.0008);
    add(rust, metalMat('rust', 1));
    // steel: corner posts, the rim band, domed rivets, the stamped dividers on the floor, bolt housings
    const steel = new Shape(3);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) steel.box(sx * (O / 2), -W - 0.002, sz * (O / 2), 0.03, H + W + 0.006, 0.03, 0xc8ccd0, 0.008);
    for (const sz of [-1, 1]) steel.box(0, H - 0.012, sz * (O / 2 + 0.002), O + 0.01, 0.016, 0.008, 0xffffff, 0.003);
    for (const sx of [-1, 1]) steel.box(sx * (O / 2 + 0.002), H - 0.012, 0, 0.008, 0.016, O + 0.01, 0xffffff, 0.003);
    for (let i = 0; i < 7; i++) {
      const x = -O / 2 + 0.03 + i * ((O - 0.06) / 6);
      for (const y of [-W / 2, H - 0.022]) { steel.dome(x, y, O / 2 + 0.001, 0.0058); steel.dome(x, y, -O / 2 - 0.001, 0.0058, 0xffffff, [-Math.PI / 2, 0, 0]); }
    }
    for (let i = 1; i < spec.w; i++) { steel.box(-I / 2 + i * CELL, 0, 0, 0.003, 0.005, I, 0xb0b4b8, 0.0012); steel.box(0, 0, -I / 2 + i * CELL, I, 0.005, 0.003, 0xb0b4b8, 0.0012); }
    const boltPos: [number, number, number, number][] = [[-0.14, H - 0.05, O / 2 + 0.012, 0], [0.04, H - 0.05, O / 2 + 0.012, 0], [-O / 2 - 0.012, H - 0.05, 0.05, 1], [O / 2 + 0.012, H - 0.05, -0.05, 1]];
    for (const [x, y, z, side] of boltPos) steel.box(x, y - 0.012, z, side ? 0.016 : 0.034, 0.036, side ? 0.034 : 0.016, 0x9a9ea2, 0.004);
    steel.box(-0.1, H * 0.46, O / 2 + 0.003, 0.16, 0.054, 0.004, 0x606468, 0.0015);
    add(steel, metalMat('steel', 1));
    // the reader: a bakelite housing, a brass bezel round the tube, two relays with copper coils
    const bak = new Shape(4);
    bak.box(0.11, H * 0.42, O / 2 + 0.004, 0.1, 0.1, 0.01, 0xffffff, 0.005);
    for (const dy of [0.02, 0.07]) bak.box(0.175, H * 0.42 + dy, O / 2 + 0.008, 0.022, 0.022, 0.016, 0x707070, 0.004);
    add(bak, metalMat('bakelite', 1));
    const brass = new Shape(4);
    brass.ring(0.11, H * 0.42 + 0.05, O / 2 + 0.0105, 0.044, 0.0042, 0xffffff, 4, [0, 0, Math.PI / 4]);
    for (const dy of [0.02, 0.07]) brass.cyl(0.175, H * 0.42 + dy + 0.022, O / 2 + 0.012, 0.006, 0.01, 0xd88a50, 12);
    for (const [dx, dy] of [[-0.04, -0.04], [0.04, -0.04], [-0.04, 0.04], [0.04, 0.04]]) brass.dome(0.11 + dx, H * 0.42 + 0.05 + dy, O / 2 + 0.0095, 0.004);
    add(brass, metalMat('brass', 1));
    // the bolt pins: round-ended chrome rods (they ride up into the lid when locked)
    const bg = new Shape(4);
    bg.capsule(0, 0, 0, 0.0068, 0.05);
    const bgeo = bg.build();
    this.bolts.length = 0; this.boltRest.length = 0;
    for (const [x, y, z] of boltPos) {
      const m = new THREE.Mesh(bgeo, metalMat('chrome', 1));
      m.position.set(x, y - 0.006, z);
      this.body.add(m); this.shell.push(m); this.bolts.push(m); this.boltRest.push(y - 0.006);
    }
    // the lid, hinged along the back top edge: a rolled-edge iron slab, two steel straps, a handle
    this.lid.position.set(0, H, -O / 2);
    const li = new Shape(2);
    li.box(0, 0, O / 2, O + 0.008, W * 1.1, O + 0.008, 0xffffff, 0.007);
    add(li, metalMat('iron', 1), this.lid);
    const ls = new Shape(3);
    ls.box(0, W * 1.1 - 0.001, O / 2, O - 0.05, 0.006, O - 0.05, 0xb8bcc0, 0.0025);
    ls.capsule(-0.08, W * 1.1 + 0.022, O / 2 + 0.04, 0.007, 0.16, 0x8a8e92, [0, 0, -Math.PI / 2]);
    for (const x of [-0.08, 0.08]) ls.cyl(x, W * 1.1, O / 2 + 0.04, 0.006, 0.024, 0x8a8e92, 10);
    for (const x of [-0.19, 0.19]) ls.box(x, -0.004, O / 2, 0.012, 0.004, O - 0.02, 0x9a9ea2, 0.0018);
    add(ls, metalMat('steel', 1), this.lid);
    // a bulb in a wire cage under the lid
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.01, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffd890 }));
    bulb.position.set(0, -0.016, O * 0.62);
    this.lid.add(bulb); this.shell.push(bulb);
    // the tube, the plates
    this.pad.position.set(0.11, H * 0.42 + 0.05, O / 2 + 0.0085);
    this.plate.mesh.position.set(-0.1, H * 0.46 + 0.027, O / 2 + 0.0058);
    this.lidPlate.mesh.position.set(0, -0.0065, O * 0.42);
    this.lidPlate.mesh.rotation.set(Math.PI / 2, 0, 0);
    this.light.position.set(0, H * 0.85, 0);
    // the grid inside: chalk on the walls, every cell edge
    const pts: number[] = [];
    const L = (a: number[], b: number[]) => pts.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    for (let i = 0; i <= spec.d; i++) { const y = i * CELL; L([0, y, 0.002], [I, y, 0.002]); L([0.002, y, 0], [0.002, y, I]); L([I - 0.002, y, 0], [I - 0.002, y, I]); }
    for (let i = 0; i <= spec.w; i++) { const t = i * CELL; L([t, 0, 0.002], [t, H, 0.002]); L([0.002, 0, t], [0.002, H, t]); L([I - 0.002, 0, t], [I - 0.002, H, t]); }
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    if (this.grid) this.space.remove(this.grid);
    this.grid = new THREE.LineSegments(gg, this.gridMat);
    this.space.add(this.grid);
    // the cut drawn where layers are peeled away
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

  /** the reader reading a thumb: sweep 0..1 (0 = idle, 1 = done), glow 0..1 */
  setScan(sweep: number, glow: number, ok = true) {
    const state = sweep <= 0 ? (glow > 0.12 ? 'idle' : 'off') : sweep >= 1 ? (ok ? 'ok' : 'bad') : 'read';
    if (state === 'off') { if (this.scanState !== 'off') { this.reader.power(false); this.scanState = 'off'; } return; }
    if (this.scanState === 'off' || this.scanState === '') this.reader.power(true);
    if (state === 'read' || state !== this.scanState) this.drawReader(sweep, state);
    this.scanState = state;
  }
  private drawReader(sweep: number, state: string) {
    const { ctx, canvas } = this.reader;
    const w = canvas.width, h = canvas.height;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
    // the print burnt into the phosphor
    ctx.save();
    ctx.strokeStyle = state === 'read' ? '#2c7a3a' : '#16401e'; ctx.lineWidth = 2;
    for (let r = 6; r < 46; r += 6) { ctx.beginPath(); ctx.ellipse(w / 2, h * 0.5, r * 0.78, r, 0.15, Math.PI * 0.12, Math.PI * 1.88); ctx.stroke(); }
    ctx.restore();
    if (state === 'read') {
      const y = 10 + sweep * (h - 20);
      const g = ctx.createLinearGradient(0, y - 10, 0, y + 3);
      g.addColorStop(0, 'rgba(120,255,150,0)'); g.addColorStop(0.8, 'rgba(150,255,170,0.55)'); g.addColorStop(1, 'rgba(220,255,225,1)');
      ctx.fillStyle = g; ctx.fillRect(4, y - 10, w - 8, 13);
      phosphorText(ctx, 'READING', w / 2, h - 22, { size: 15, align: 'center', color: '#9dffb5', font: CRT() });
    } else if (state === 'ok') {
      phosphorText(ctx, 'ACCEPTED', w / 2, 30, { size: 17, align: 'center', color: '#c8ffd4', glow: 9, font: CRT() });
      phosphorText(ctx, 'No.' + this.no, w / 2, 62, { size: 15, align: 'center', color: '#9dffb5', font: CRT() });
    } else if (state === 'bad') {
      phosphorText(ctx, 'NO MATCH', w / 2, 46, { size: 16, align: 'center', color: '#ffb080', glow: 9, font: CRT() });
    } else {
      phosphorText(ctx, 'THUMB', w / 2, h - 24, { size: 14, align: 'center', color: '#5ad87a', font: CRT() });
    }
    this.reader.flush();
  }

  /** the debtor's number engraved on the front plate */
  setPlate(no: string) {
    this.no = no;
    const t = this.plate;
    t.clear();
    t.type('Remittance', 6, 3, undefined, 7.5);
    t.type('No. ' + no, 6, 12, '#4a3410', 6.5);
    t.flush();
  }
  /** the inside: chalk lines and the bulb */
  setInside(k: number, flicker = 0) {
    this.gridMat.opacity = 0.42 * k;
    this.light.intensity = (0.55 + flicker * 0.3) * k;
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
