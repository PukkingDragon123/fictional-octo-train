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
import { damp } from './fpKit';
import { metalMat, metalEnv } from './metal';
import { Shape } from './shapes';
import { plate as polyPlate, face as polyFace, ngon } from '../ui/touch/facet';

const _v = new THREE.Vector3();

/**
 * Embossed label tape with a short message. 'drop': it drops into view from the top (legacy);
 * 'stick': a strip is pressed onto a surface from its left end (place(x, y, z) in the parent's
 * space), stays a moment, then is peeled off again.
 */
export class Dymo {
  readonly tag = pixTag('dymo', 132, 11, 0.42);
  private t = 0;
  private y0 = 0.36; private y1 = 0.25;
  constructor(parent: THREE.Object3D, z = -1.1, private mode: 'drop' | 'stick' = 'drop') {
    this.tag.mesh.position.set(0, this.y0, z); this.tag.mesh.renderOrder = 20; parent.add(this.tag.mesh); this.tag.mesh.visible = false;
    if (mode === 'stick') this.tag.mesh.geometry.translate(0.21, 0, 0);
  }
  /** drop: rest height y at depth z. stick: the strip's left end at x, y, z */
  place(a: number, b: number, c?: number) {
    if (this.mode === 'stick') { this.tag.mesh.position.set(a, b, c ?? 0); return; }
    this.y1 = a; this.y0 = a + 0.12; this.tag.mesh.position.z = b;
  }
  hide() { this.t = 0; this.tag.mesh.visible = false; }
  show(text: string, bad = false) {
    const t = this.tag;
    t.clear();
    const s = text.toUpperCase().slice(0, 21);
    t.type(s, Math.max(2, Math.floor((t.w - s.length * 6) / 2)), 2, bad ? 0xffe0a0 : undefined);
    t.flush();
    this.t = 2.4;
    t.mesh.visible = true;
    if (this.mode === 'stick') { t.mesh.scale.set(0.05, 1, 1); t.mesh.rotation.z = (Math.random() - 0.5) * 0.04; }
  }
  update(dt: number) {
    if (this.t <= 0) { this.tag.mesh.visible = false; return; }
    this.t -= dt;
    const m = this.tag.mesh;
    if (this.mode === 'stick') {
      // pressed on left to right, peeled back off at the end
      const on = Math.min(1, (2.4 - this.t) / 0.22), off = this.t < 0.25 ? this.t / 0.25 : 1;
      m.scale.x = Math.max(0.02, Math.min(on, off));
      return;
    }
    const target = this.t > 0.3 ? this.y1 : this.y0;
    m.position.y = damp(m.position.y, target, 16, dt);
    m.rotation.z = Math.sin(this.t * 9) * 0.01;
  }
}

/** a manila tag on a string: what the thing you point at is (hung at arm's length, tied back to it) */
export class HoverTag {
  readonly tag = pixTag('tag', 80, 50, 0.25);
  readonly line = tagString();
  private key = '';
  /** lay: the tag lies on a work surface (parent space, y up) instead of hanging at arm's length in camera space */
  constructor(parent: THREE.Object3D, private lay = false) { parent.add(this.tag.mesh, this.line); this.hide(); this.tag.mesh.renderOrder = 18; }
  hide() { this.tag.mesh.visible = false; this.line.visible = false; this.key = ''; }
  /** describe an item (n = stack size); tied to `at` (camera space) */
  item(it: Item, n: number, at: THREE.Vector3) {
    const k = it.uid + ':' + n + ':' + Math.round(it.cond * 20);
    if (k !== this.key) {
      this.key = k;
      const d = itemDef(it.key);
      const t = this.tag;
      t.clear();
      const lines = t.para(itemName(it) + (n > 1 ? ' ×' + n : ''), 6, 10, 70, undefined, 8.5, 2, 8);
      const s = size3(it.key);
      const y = 12 + lines * 8.5;
      t.type(itemWeight(it).toFixed(1) + ' kg · ' + s[0] + '×' + s[1] + '×' + s[2], 6, y, '#5a3418', 6.5);
      const extra = d.durability || d.weapon ? 'condition ' + Math.round(it.cond * 100) + '%' : d.value ? d.value + ' scrip' : (d.cat || '');
      t.type(extra, 6, y + 8, '#5a3418', 6.5);
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
      lines.slice(0, 4).forEach((l, i) => t.type(l, 6, 10 + i * 9, i === 0 ? undefined : '#5a3418', i === 0 ? 8 : 6.5));
      t.flush();
    }
    this.place(at);
  }
  private place(at: THREE.Vector3) {
    const m = this.tag.mesh;
    if (this.lay) {
      // lying on the boards in front of the thing, propped on its edge toward you, the string tied back to it
      m.visible = true; this.line.visible = true;
      const right = at.x > 0.25;
      m.position.set(at.x + (right ? -0.2 : 0.2), 0.03, Math.min(0.24, at.z + 0.12));
      m.rotation.set(-0.5, 0, right ? 0.07 : -0.07);
      _v.set(m.position.x, m.position.y + 0.05, m.position.z - 0.03);
      setString(this.line, _v, at);
      return;
    }
    m.visible = true; this.line.visible = true;
    // same spot on screen as the thing, pulled to arm's length so the type is big enough to read
    const k = -1.0 / Math.min(-0.2, at.z);
    _v.copy(at).multiplyScalar(k);
    const right = _v.x > 0.2;
    m.position.set(_v.x + (right ? -0.17 : 0.17), _v.y + 0.09, -1.0);
    m.rotation.z = right ? 0.08 : -0.08;
    _v.set(m.position.x, m.position.y + 0.1, -1.0);
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
    t.type(title, 6, 4, undefined, 9);
    const n = Math.min(need, Math.floor(done));
    for (let i = 0; i < need; i++) {
      const g = Math.floor(i / 5), k = i % 5;
      const x = 7 + g * 15 + (k < 4 ? k * 2.6 : 0), on = i < n;
      const col = on ? '#f2f0e6' : 'rgba(200,210,200,0.22)';
      if (k < 4) t.line(x, 16, x + 0.4, 24, col, 0.9); else t.line(x - 1.2, 23, x + 9.5, 16.5, col, 0.9);
    }
    t.para(hint, 6, 27, 90, '#c8d0c8', 6.5, 2, 6.5);
    t.flush();
    t.mesh.visible = true;
  }
  hide() { this.tag.mesh.visible = false; }
}

/** a typed tag you can click: its mesh carries userData.click */
export function clickTag(text: string, kind: 'tag' | 'card' = 'tag', w = 54, size = 0.12, sub = ''): PixTag {
  const t = pixTag(kind, w, sub ? 28 : 21, size);
  t.clear();
  t.type(text, 6, kind === 'tag' ? 9.5 : 6, undefined, 7.5);
  if (sub) t.type(sub, 6, 18.5, '#7a3a1a', 6);
  t.flush();
  return t;
}

/** a brass spring scale in an octagonal case: load against what you can carry, and a PACE sub-needle */
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
    mb.setFaceShading(false);
    mb.push().rotateX(Math.PI / 2); mb.cylinder(0, -0.012, 0, 0.09, 0.012, 8, 'metal_brass'); mb.pop();
    mb.box(0, 0.085, -0.006, 0.02, 0.03, 0.012, 'metal_brass', { color: 0xc8b090 });
    this.g.add(new THREE.Mesh(mb.build(), metalMat('brass', 3)));
    // an octagonal brass bezel with an octagonal window (the dial shows through it, never a round face)
    const bez = new THREE.Mesh(polyPlate(ngon(8, 0.092, 0), 0.006, 0.0018, [ngon(8, 0.066, 0)]), metalMat('brass', 3));
    bez.position.z = 0.003;
    this.g.add(bez);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const sc = new Shape(4); sc.cyl(0, 0, 0, 0.0032, 0.0016, 0xb89a50, 6, [Math.PI / 2, 0, 0]);
      const m = new THREE.Mesh(sc.build(), metalMat('brass', 3)); m.position.set(Math.cos(a) * 0.079, Math.sin(a) * 0.079, 0.009); this.g.add(m);
    }
    // the glass over the face: a faint specular sheen
    const glass = new THREE.Mesh(polyFace(ngon(8, 0.066, 0)), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.08, roughness: 0.05, metalness: 0, envMap: metalEnv(), envMapIntensity: 1.5, flatShading: true }));
    glass.position.z = 0.0085;
    this.g.add(glass);
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
    const body = new Shape(4);
    body.box(0, -0.03, 0, 0.26, 0.03, 0.1, 0xffffff, 0.009);
    this.g.add(new THREE.Mesh(body.build(), metalMat('bakelite', 1)));
    const rim = new Shape(4);
    rim.box(0, -0.004, 0, 0.27, 0.006, 0.11, 0xffffff, 0.0028);
    for (const [x, z] of [[-0.125, -0.045], [0.125, -0.045], [-0.125, 0.045], [0.125, 0.045]]) rim.dome(x, 0.002, z, 0.0042, 0xd0d0c8, [0, 0, 0]);
    this.g.add(new THREE.Mesh(rim.build(), metalMat('steel', 1)));
    this.face = pixTag('bakelite', 104, 40, 0.26);
    this.face.mesh.rotation.x = -Math.PI / 2;
    this.face.mesh.position.y = 0.0025;
    this.g.add(this.face.mesh);
    const t = this.face;
    t.clear();
    t.type('TURN', 6, 29, undefined, 7.5); t.type('TIP', 30, 29, undefined, 7.5); t.type('ROLL', 50, 29, undefined, 7.5);
    t.type('LAYER', 72, 1.5, undefined, 6.5); t.type('SHAKE', 76, 31, undefined, 6.5);
    for (let i = 1; i <= 5; i++) { const a = -Math.PI * 0.9 + (i - 1) * 0.45; t.type(String(i), 82 + Math.cos(a) * 11, 13 + Math.sin(a) * 9.5, undefined, 5.5); }
    t.flush();
    const lever = new ModelBuilder();
    lever.setFaceShading(false);
    lever.cylinder(0, 0, 0, 0.009, 0.006, 6, 'metal_brushed', { color: 0xc8c8c0 });
    lever.cylinder(0, 0.004, 0, 0.003, 0.034, 6, 'metal_brushed', { color: 0xe0e0d8, rTop: 0.0025 });
    lever.sphere(0, 0.04, 0, 0.0055, 6, 4, 'metal_brushed', { color: 0xe8e8e0 });
    const lg = lever.build();
    const tx = [-0.09, -0.032, 0.025];
    ['turn', 'tip', 'roll'].forEach((k, i) => {
      const m = new THREE.Mesh(lg, metalMat('chrome', 2));
      m.position.set(tx[i], 0.003, -0.005);
      m.rotation.x = -0.45;
      m.userData.ctl = k;
      this.g.add(m); this.ctl.push(m); this.toggles[k] = m;
    });
    const kb = new ModelBuilder();
    kb.setFaceShading(false);
    kb.cylinder(0, 0, 0, 0.02, 0.016, 8, 'rubber_black', { color: 0x2a1a10, rTop: 0.017 });
    kb.box(0, 0.016, -0.01, 0.004, 0.003, 0.02, 'plastic_white', { color: 0xf0e8d0 });
    this.knob = new THREE.Mesh(kb.build(), metalMat('bakelite', 2));
    this.knob.position.set(0.075, 0.003, -0.012);
    this.knob.userData.ctl = 'layer';
    this.g.add(this.knob); this.ctl.push(this.knob);
    const bb = new ModelBuilder();
    bb.setFaceShading(false);
    bb.cylinder(0, 0, 0, 0.012, 0.012, 6, 'metal_grey', { color: 0x6a6a6a });
    bb.cylinder(0, 0.012, 0, 0.017, 0.008, 8, 'plastic_white', { color: 0xc8281c, rTop: 0.0165 });
    bb.push().translate(0, 0.02, 0).scale(1, 0.45, 1); bb.sphere(0, 0, 0, 0.0165, 8, 3, 'plastic_white', { color: 0xc8281c }); bb.pop();
    this.button = new THREE.Mesh(bb.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0, envMap: metalEnv(), envMapIntensity: 0.7, flatShading: true }));
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
