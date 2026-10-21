// Physical props that carry information in the first-person close-ups: a
// spring-scale dial, a strip of embossed label tape that drops in with a
// note, a luggage tag tied to whatever you point at, a chalk slate with tally
// marks for work in progress, clickable typed tags, a bakelite control box.
import * as THREE from 'three';
import type { Item } from '../items/item';
import { itemDef, itemName, itemWeight } from '../items/item';
import { size3 } from '../items/grid';
import { ModelBuilder } from '../gfx/modelBuilder';
import { pixTag, dialFace, tagString, setString, type PixTag } from './tags';
import { fpMat, damp } from './fpKit';
import { Screen } from '../ui/font5x7';

const _v = new THREE.Vector3();

/** label tape that drops down from the top of view with a short message */
export class Dymo {
  readonly tag = pixTag('dymo', 132, 11, 0.42);
  private t = 0;
  private y0 = 0.36; private y1 = 0.25;
  constructor(parent: THREE.Object3D, z = -1.1) { this.tag.mesh.position.set(0, this.y0, z); this.tag.mesh.renderOrder = 20; parent.add(this.tag.mesh); this.tag.mesh.visible = false; }
  place(y: number, z: number) { this.y1 = y; this.y0 = y + 0.12; this.tag.mesh.position.z = z; }
  show(text: string, bad = false) {
    const t = this.tag;
    t.clear();
    const s = text.toUpperCase().slice(0, 21);
    t.type(s, Math.max(2, Math.floor((t.w - s.length * 6) / 2)), 2, bad ? 0xffe0a0 : undefined);
    t.flush();
    this.t = 2.2;
    t.mesh.visible = true;
  }
  update(dt: number) {
    if (this.t <= 0) { this.tag.mesh.visible = false; return; }
    this.t -= dt;
    const m = this.tag.mesh;
    const target = this.t > 0.3 ? this.y1 : this.y0;
    m.position.y = damp(m.position.y, target, 16, dt);
    m.rotation.z = Math.sin(this.t * 9) * 0.01;
  }
}

/** a manila tag on a string: what the thing you point at is */
export class HoverTag {
  readonly tag = pixTag('tag', 78, 46, 0.17);
  readonly line = tagString();
  private key = '';
  constructor(parent: THREE.Object3D) { parent.add(this.tag.mesh, this.line); this.hide(); this.tag.mesh.renderOrder = 18; }
  hide() { this.tag.mesh.visible = false; this.line.visible = false; this.key = ''; }
  /** describe an item (n = stack size); tied to `at` (camera space) */
  item(it: Item, n: number, at: THREE.Vector3) {
    const k = it.uid + ':' + n + ':' + Math.round(it.cond * 20);
    if (k !== this.key) {
      this.key = k;
      const d = itemDef(it.key);
      const t = this.tag;
      t.clear();
      t.para(itemName(it) + (n > 1 ? ' x' + n : ''), 4, 9, 70, undefined, 8, 2);
      const s = size3(it.key);
      t.type(itemWeight(it).toFixed(1) + 'KG ' + s[0] + 'x' + s[1] + 'x' + s[2], 4, 27);
      const extra = d.durability || d.weapon ? 'COND ' + Math.round(it.cond * 100) + '%' : d.value ? d.value + ' SCRIP' : (d.cat || '').toUpperCase();
      t.type(extra, 4, 36, 0x6a3a1a);
      t.flush();
    }
    this.place(at);
  }
  text(lines: string[], at: THREE.Vector3) {
    const k = lines.join('|');
    if (k !== this.key) {
      this.key = k;
      const t = this.tag;
      t.clear();
      lines.slice(0, 4).forEach((l, i) => t.type(l.slice(0, 12), 4, 9 + i * 9, i === 0 ? undefined : 0x6a3a1a));
      t.flush();
    }
    this.place(at);
  }
  private place(at: THREE.Vector3) {
    const m = this.tag.mesh;
    m.visible = true; this.line.visible = true;
    const tx = at.x + (at.x > 0.25 ? -0.14 : 0.13), ty = at.y + 0.1;
    m.position.set(tx, ty, at.z + 0.05);
    m.rotation.z = (at.x > 0.25 ? 0.12 : -0.12);
    _v.set(tx, ty + 0.06, at.z + 0.05);
    setString(this.line, _v, at);
  }
}

/** a school slate: what you're doing, chalked tallies of how far along */
export class Slate {
  readonly tag = pixTag('slate', 100, 42, 0.3);
  constructor(parent: THREE.Object3D) { parent.add(this.tag.mesh); this.tag.mesh.visible = false; this.tag.mesh.renderOrder = 15; }
  draw(title: string, done: number, need: number, hint: string) {
    const t = this.tag;
    t.clear();
    t.type(title.slice(0, 15), 6, 5);
    const n = Math.min(need, Math.floor(done));
    for (let i = 0; i < need; i++) {
      const g = Math.floor(i / 5), k = i % 5;
      const x = 7 + g * 16 + (k < 4 ? k * 3 : 0), on = i < n;
      const col = on ? 0xf0ece0 : 0x4a5450;
      if (k < 4) t.scr.vline(x, 15, 22, Screen32(col)); else t.scr.line(x - 1, 21, x + 11, 15, Screen32(col));
    }
    t.para(hint, 6, 26, 90, 0xc8d0c8, 7, 2);
    t.flush();
    t.mesh.visible = true;
  }
  hide() { this.tag.mesh.visible = false; }
}
const Screen32 = (rgb: number) => Screen.c(rgb);

/** a typed tag you can click: its mesh carries userData.click */
export function clickTag(text: string, kind: 'tag' | 'card' = 'tag', w = 54, size = 0.12, sub = ''): PixTag {
  const t = pixTag(kind, w, sub ? 28 : 20, size);
  t.clear();
  t.type(text.slice(0, Math.floor((w - 6) / 6)), 4, kind === 'tag' ? 9 : 6);
  if (sub) t.type(sub.slice(0, Math.floor((w - 6) / 6)), 4, 18, 0x8a3a1a);
  t.flush();
  return t;
}

/** a brass-rimmed spring scale: load against what you can carry, and a PACE sub-needle */
export class Gauge {
  readonly g = new THREE.Group();
  private face: PixTag;
  private needle: THREE.Mesh;
  private sub: THREE.Mesh;
  private max = -1;
  private v = 0; private pv = 1;
  constructor() {
    this.face = dialFace(20);
    const mb = new ModelBuilder();
    mb.push().rotateX(Math.PI / 2); mb.cylinder(0, -0.012, 0, 0.088, 0.012, 16, 'metal_brass', { color: 0xc8a050 }); mb.pop();
    mb.box(0, 0.085, -0.006, 0.02, 0.03, 0.012, 'metal_brass', { color: 0xa88030 });
    this.g.add(new THREE.Mesh(mb.build(), fpMat()));
    this.face.mesh.position.z = 0.001;
    this.g.add(this.face.mesh);
    const nm = new THREE.MeshBasicMaterial({ color: 0x1a1a1a });
    this.needle = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.062, 0.002), nm);
    this.needle.geometry.translate(0, 0.026, 0);
    this.needle.position.z = 0.004;
    this.sub = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.016, 0.002), new THREE.MeshBasicMaterial({ color: 0xb8281c }));
    this.sub.geometry.translate(0, 0.007, 0);
    this.sub.position.set(0, -0.0475, 0.004);
    this.g.add(this.needle, this.sub);
  }
  set(kg: number, cap: number, pace: number) {
    const m = Math.max(10, Math.ceil(cap * 1.25 / 5) * 5);
    if (m !== this.max) {
      this.max = m;
      const f = dialFace(m);
      (this.face.mesh.material as THREE.MeshBasicMaterial).map = (f.mesh.material as THREE.MeshBasicMaterial).map;
      (this.face.mesh.material as THREE.MeshBasicMaterial).needsUpdate = true;
    }
    this.v = Math.min(1.05, kg / this.max); this.pv = pace;
  }
  update(dt: number) {
    const a = Math.PI * 0.75 + this.v * Math.PI * 1.5;
    const cur = this.needle.rotation.z;
    // needles point up at rotation 0; dial angle runs clockwise on screen
    const tgt = -(a - Math.PI * 1.5);
    this.needle.rotation.z = damp(cur, tgt + Math.sin(performance.now() * 0.02) * 0.004, 6, dt);
    const sa = (1 - Math.max(0, Math.min(1, (this.pv - 0.5) / 0.5))) * Math.PI;
    this.sub.rotation.z = damp(this.sub.rotation.z, Math.PI / 2 - sa, 6, dt);
  }
}

/** the bakelite control box: toggles, a layer knob, a red mushroom button */
export class ControlBox {
  readonly g = new THREE.Group();
  readonly ctl: THREE.Object3D[] = [];
  private toggles: Record<string, THREE.Object3D> = {};
  private knob: THREE.Object3D;
  private button: THREE.Object3D;
  private face: PixTag;
  constructor() {
    const mb = new ModelBuilder();
    mb.box(0, -0.028, 0, 0.26, 0.028, 0.1, 'rubber_black', { color: 0x5a3a24 });
    mb.box(0, -0.004, 0, 0.27, 0.006, 0.11, 'metal_grey', { color: 0x8a8070 });
    this.g.add(new THREE.Mesh(mb.build(), fpMat()));
    this.face = pixTag('bakelite', 104, 40, 0.26);
    this.face.mesh.rotation.x = -Math.PI / 2;
    this.face.mesh.position.y = 0.0025;
    this.g.add(this.face.mesh);
    const t = this.face;
    t.clear();
    t.type('TURN', 4, 30); t.type('TIP', 30, 30); t.type('ROLL', 50, 30);
    t.type('LAYER', 74, 2); t.type('SHAKE', 74, 33);
    for (let i = 1; i <= 5; i++) { const a = -Math.PI * 0.9 + (i - 1) * 0.45; t.type(String(i), Math.round(84 + Math.cos(a) * 10), Math.round(16 + Math.sin(a) * 9)); }
    t.flush();
    const lever = new ModelBuilder();
    lever.cylinder(0, 0, 0, 0.009, 0.006, 8, 'metal_brushed', { color: 0xc8c8c0 });
    lever.cylinder(0, 0.004, 0, 0.003, 0.034, 6, 'metal_brushed', { color: 0xe0e0d8, rTop: 0.0025 });
    lever.sphere(0, 0.04, 0, 0.0055, 6, 4, 'metal_brushed', { color: 0xe8e8e0 });
    const lg = lever.build();
    const tx = [-0.09, -0.032, 0.025];
    ['turn', 'tip', 'roll'].forEach((k, i) => {
      const m = new THREE.Mesh(lg, fpMat());
      m.position.set(tx[i], 0.003, -0.005);
      m.rotation.x = -0.45;
      m.userData.ctl = k;
      this.g.add(m); this.ctl.push(m); this.toggles[k] = m;
    });
    const kb = new ModelBuilder();
    kb.cylinder(0, 0, 0, 0.02, 0.016, 12, 'rubber_black', { color: 0x2a1a10 });
    kb.box(0, 0.016, -0.01, 0.004, 0.003, 0.02, 'plastic_white', { color: 0xf0e8d0 });
    this.knob = new THREE.Mesh(kb.build(), fpMat());
    this.knob.position.set(0.075, 0.003, -0.012);
    this.knob.userData.ctl = 'layer';
    this.g.add(this.knob); this.ctl.push(this.knob);
    const bb = new ModelBuilder();
    bb.cylinder(0, 0, 0, 0.012, 0.012, 8, 'metal_grey', { color: 0x6a6a6a });
    bb.cylinder(0, 0.012, 0, 0.017, 0.012, 10, 'plastic_white', { color: 0xc8281c, rTop: 0.014 });
    this.button = new THREE.Mesh(bb.build(), fpMat());
    this.button.position.set(0.093, 0.003, 0.006);
    this.button.userData.ctl = 'shake';
    this.g.add(this.button); this.ctl.push(this.button);
  }
  /** a lever flicks over and back */
  flick(k: string) {
    const m = this.toggles[k];
    if (m) { m.rotation.x = 0.45; setTimeout(() => { m.rotation.x = -0.45; }, 160); }
    if (k === 'shake') { this.button.position.y = -0.006; setTimeout(() => { this.button.position.y = 0.003; }, 140); }
  }
  /** knob pointer: 1..5 layers (5 = all) */
  setLayer(n: number) { const a = -Math.PI * 0.9 + (n - 1) * 0.45; this.knob.rotation.y = Math.atan2(-Math.cos(a), -Math.sin(a)); }
}
