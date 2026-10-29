// The things set down round the open Meridian Field Pack (src/ui/inventory.ts),
// all of them lying on the real floor in front of you, never hanging in the air:
// the container you are looting rebuilt as the actual drawer / crate / box / bin
// set down beside the pack, the manila tags tied to each container you could
// show (tap one to bring it), the luggage tag tied to whatever you point at, the
// strip of label tape that feeds out of the packing remote with a short note,
// and the canvas kit mat your worn clothes lie on.
import * as THREE from 'three';
import { ModelBuilder } from '../../gfx/modelBuilder';
import { fpMat } from '../../craft/fpKit';
import { pixTag, tagString, setString, stamp, disposeTag, type PixTag } from '../../craft/tags';
import type { Item } from '../../items/item';
import { itemDef, itemName, itemWeight } from '../../items/item';
import { size3 } from '../../items/grid';
import { PixelCanvas, makeRamp } from '../../gfx/pixel';
import { cssFont } from '../../gfx/crt';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();

// ---------------------------------------------------------------- the container, set down
/**
 * Walls round a flat container's tray (tray-local units: the tray's floor is y = 0, its
 * cells span w x d centred): a drawer pulled out and set down, a slatted crate, a
 * cardboard box with its flaps open, a painted steel bin, a white plastic tub.
 */
export function containerShell(style: string, w: number, d: number): THREE.Object3D | null {
  const mb = new ModelBuilder();
  const rim = 0.016;
  const W = w + rim * 2 + 0.01, D = d + rim * 2 + 0.01;
  const wall = (h: number, t: number, tex: string, color: number, x = 0, z = 0) => {
    mb.box(x, -0.012, z - D / 2 + t / 2, W, h, t, tex, { color });
    mb.box(x, -0.012, z + D / 2 - t / 2, W, h, t, tex, { color });
    mb.box(x - W / 2 + t / 2, -0.012, z, t, h, D - t * 2, tex, { color });
    mb.box(x + W / 2 - t / 2, -0.012, z, t, h, D - t * 2, tex, { color });
  };
  switch (style) {
    case 'wood': case 'laminate': case 'shelf': {
      // a drawer: thin sides, a thick front with a brass cup pull, the runner slots
      const front = style === 'laminate' ? 'plastic_white' : 'wood_dark';
      wall(0.075, 0.012, 'wood_light', style === 'laminate' ? 0xd8d0c0 : 0xc09868);
      mb.box(0, -0.016, D / 2 + 0.008, W + 0.03, 0.095, 0.022, front, { color: style === 'laminate' ? 0xe0d8c8 : 0x8a6038 });
      mb.box(0, 0.022, D / 2 + 0.024, 0.08, 0.016, 0.014, 'metal_brass', { color: 0xd0a850 });
      mb.box(0, 0.018, D / 2 + 0.03, 0.06, 0.008, 0.006, 'metal_dark', { color: 0x3a2a1a });
      for (const s of [-1, 1]) mb.box(s * (W / 2 + 0.002), 0.02, 0, 0.006, 0.012, D * 0.9, 'metal_grey', { color: 0x9aa0a6 });
      mb.box(0, -0.014, 0, W, 0.006, D, 'wood_light', { color: 0xa88458 });
      break;
    }
    case 'crate': {
      // slatted pine with dark nail heads and a stencilled lot number band
      for (const z of [-D / 2 + 0.008, D / 2 - 0.008]) for (const y of [-0.012, 0.03]) mb.box(0, y, z, W, 0.034, 0.014, 'wood_light', { color: 0xb89a62 });
      for (const x of [-W / 2 + 0.008, W / 2 - 0.008]) for (const y of [-0.012, 0.03]) mb.box(x, y, 0, 0.014, 0.034, D, 'wood_light', { color: 0xa88a52 });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) mb.box(sx * (W / 2 - 0.01), -0.012, sz * (D / 2 - 0.01), 0.022, 0.08, 0.022, 'wood_dark', { color: 0x7a5a32 });
      mb.box(0, -0.014, 0, W, 0.006, D, 'wood_light', { color: 0x9a7a48 });
      break;
    }
    case 'cardboard': {
      wall(0.09, 0.006, 'cardboard', 0xc8a070);
      // the four flaps folded out onto the floor
      mb.box(0, -0.013, D / 2 + 0.05, W, 0.004, 0.1, 'cardboard', { color: 0xb89060 });
      mb.box(0, -0.013, -D / 2 - 0.05, W, 0.004, 0.1, 'cardboard', { color: 0xb89060 });
      mb.box(W / 2 + 0.045, -0.013, 0, 0.09, 0.004, D, 'cardboard', { color: 0xc09868 });
      mb.box(-W / 2 - 0.045, -0.013, 0, 0.09, 0.004, D, 'cardboard', { color: 0xc09868 });
      mb.box(0, 0.05, D / 2 + 0.0005, W * 0.5, 0.02, 0.002, 'cardboard', { color: 0x8a5a28 });
      break;
    }
    case 'steel': case 'toolbox': case 'vending': case 'oven': {
      const c = style === 'toolbox' ? 0xb83a2a : style === 'oven' ? 0x5a5a5a : 0x8a9096;
      wall(0.07, 0.008, style === 'toolbox' ? 'metal_painted_green' : 'metal_grey', c);
      for (const s of [-1, 1]) mb.box(s * (W / 2 + 0.006), 0.03, 0, 0.012, 0.012, 0.06, 'metal_dark', { color: 0x3a3a3c });
      break;
    }
    case 'fridge': case 'freezer': case 'cooler': case 'medical': {
      const c = style === 'cooler' ? 0x4a8ac8 : style === 'medical' ? 0xf0f0ea : 0xe8eef0;
      wall(0.08, 0.01, 'plastic_white', c);
      mb.box(0, 0.06, D / 2 + 0.006, W * 0.4, 0.014, 0.01, 'plastic_white', { color: 0xc8d0d4 });
      break;
    }
    case 'trash': {
      wall(0.1, 0.01, 'rubber_black', 0x4a4e4a);
      break;
    }
    default: return null;
  }
  const m = new THREE.Mesh(mb.build(), fpMat());
  m.raycast = () => { /* the tray picks, not the walls */ };
  return m;
}

// ---------------------------------------------------------------- tags on the floor
/**
 * lay a tag down at `at` (parent space): flat on the floor with its writing the right way up for the
 * eye (the parent's origin), its face tipped `tilt` radians up toward you (a little on the floor,
 * more when it leans against a wall), turned `roll` about its own face
 */
const _n = new THREE.Vector3(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _d = new THREE.Vector3(), _mb = new THREE.Matrix4();
function laySurface(m: THREE.Object3D, at: THREE.Vector3, parent: THREE.Object3D, tilt = 0.3, roll = 0) {
  parent.updateWorldMatrix(true, false);
  _m.copy(parent.matrixWorld).invert();
  const cam = _w.set(0, 0, 0).applyMatrix4(_m);
  _d.subVectors(cam, at).setY(0);
  if (_d.lengthSq() < 1e-8) _d.set(0, 0, 1);
  _d.normalize();
  _n.set(0, 1, 0).multiplyScalar(Math.cos(tilt)).addScaledVector(_d, Math.sin(tilt)).normalize();
  _y.copy(_d).negate().addScaledVector(_n, _d.dot(_n)).normalize();
  _x.crossVectors(_y, _n).normalize();
  _mb.makeBasis(_x, _y, _n);
  m.quaternion.setFromRotationMatrix(_mb);
  m.rotateZ(roll);
  m.position.copy(at);
}

/**
 * The luggage tag on a string that says what you are pointing at: it lies on the pack's rim or
 * the floor beside the thing, tied to it.
 */
export class GroundTag {
  readonly tag = pixTag('tag', 84, 50, 0.17);
  readonly line = tagString(0x6a5a3a);
  private key = '';
  /** how far the tag is tipped up toward you (more when it leans on the pack's wall) */
  lean = 0.4;
  constructor(readonly parent: THREE.Object3D) { parent.add(this.tag.mesh, this.line); this.tag.mesh.renderOrder = 6; this.hide(); }
  hide() { this.tag.mesh.visible = false; this.line.visible = false; this.key = ''; }
  item(it: Item, n: number, at: THREE.Vector3, rest: THREE.Vector3) {
    const k = it.uid + ':' + n + ':' + Math.round(it.cond * 20);
    if (k !== this.key) {
      this.key = k;
      const d = itemDef(it.key);
      const t = this.tag;
      t.clear();
      const lines = t.para(itemName(it) + (n > 1 ? ' x' + n : ''), 6, 11, 74, undefined, 8.5, 2, 8);
      const s = size3(it.key);
      const y = 13 + lines * 8.5;
      t.type(itemWeight(it).toFixed(1) + ' kg  ' + s[0] + 'x' + s[1] + 'x' + s[2], 6, y, '#5a3418', 6.5);
      const extra = d.durability || d.weapon ? 'condition ' + Math.round(it.cond * 100) + '%' : d.value ? d.value + ' scrip' : (d.cat || '');
      t.type(extra, 6, y + 8, '#5a3418', 6.5);
      t.flush();
    }
    this.place(at, rest);
  }
  text(lines: string[], at: THREE.Vector3, rest: THREE.Vector3) {
    const k = lines.join('|');
    if (k !== this.key) {
      this.key = k;
      const t = this.tag;
      t.clear();
      lines.slice(0, 4).forEach((l, i) => t.type(l, 6, 11 + i * 9, i === 0 ? undefined : '#5a3418', i === 0 ? 8 : 6.5));
      t.flush();
    }
    this.place(at, rest);
  }
  private place(at: THREE.Vector3, rest: THREE.Vector3) {
    const m = this.tag.mesh;
    m.visible = true; this.line.visible = true;
    laySurface(m, rest, this.parent, this.lean, rest.x > at.x ? -0.1 : 0.1);
    m.updateMatrix();
    // the eyelet at the top of the tag, the string back to the thing
    const eye = _v.set(0, 0.17 * 50 / 84 / 2 - 0.01, 0.001).applyMatrix4(m.matrix);
    setString(this.line, eye, at);
  }
}

/** one tag per container you could show, tied on a string to the container on the floor */
export class TagRow {
  readonly g = new THREE.Group();
  readonly tags: { t: PixTag; i: number; line: THREE.Line }[] = [];
  private sig = '';
  constructor(readonly parent: THREE.Object3D) { parent.add(this.g); }
  /** names: what each tag says; sel: the one showing; spots: where each lies (parent space); knot: the container */
  set(names: { name: string; i: number; n: number }[], sel: number, spots: THREE.Vector3[], knot: THREE.Vector3) {
    const sig = names.map((e) => e.name + e.i).join('|') + '#' + sel;
    if (sig !== this.sig) {
      this.sig = sig;
      for (const s of this.tags) { disposeTag(s.t); this.g.remove(s.t.mesh, s.line); }
      this.tags.length = 0;
      for (const e of names) {
        const t = pixTag('tag', 62, 30, 0.135);
        t.clear();
        t.para(e.name, 6, 11, 52, undefined, 7.5, 2, 7.5);
        if (e.i === sel) stamp(t, 'OPEN', 34, 2, '#b8281c');
        t.flush();
        t.mesh.userData.side = e.i;
        t.mesh.renderOrder = 5;
        const line = tagString(0x6a5a3a);
        line.raycast = () => { /* the string is not a target */ };
        this.g.add(t.mesh, line);
        this.tags.push({ t, i: e.i, line });
      }
    }
    this.tags.forEach((s, k) => {
      const at = spots[k] ?? spots[spots.length - 1];
      laySurface(s.t.mesh, at, this.parent, 0.42, (k % 2 ? 1 : -1) * 0.12 + (s.i === sel ? 0.06 : 0));
      if (s.i === sel) s.t.mesh.position.y += 0.004;
      s.t.mesh.updateMatrix();
      setString(s.line, _v.set(0, 0.135 * 30 / 62 / 2 - 0.008, 0.001).applyMatrix4(s.t.mesh.matrix), knot);
    });
  }
  meshes() { return this.tags.map((s) => s.t.mesh); }
  tagOf(mesh: THREE.Object3D) { return this.tags.find((s) => s.t.mesh === mesh) ?? null; }
  highlight(i: number | null) { for (const s of this.tags) s.t.mesh.scale.setScalar(i === s.i ? 1.2 : 1); }
}

/** label tape feeding out of the packing remote's printer slot: a short note */
export class NoteTape {
  readonly tag = pixTag('dymo', 120, 11, 0.2);
  private t = 0;
  constructor(readonly parent: THREE.Object3D, private slot: THREE.Vector3) {
    parent.add(this.tag.mesh);
    this.tag.mesh.rotation.x = -Math.PI / 2;
    this.tag.mesh.geometry.translate(0.1, 0, 0);
    this.tag.mesh.visible = false;
    this.tag.mesh.renderOrder = 7;
  }
  show(text: string, bad = false) {
    const t = this.tag;
    t.clear();
    const s = text.toUpperCase().slice(0, 20);
    t.type(s, 4, 2, bad ? 0xffe0a0 : undefined);
    t.flush();
    this.t = 2.6;
    t.mesh.visible = true;
    t.mesh.scale.x = 0.01;
  }
  update(dt: number) {
    const m = this.tag.mesh;
    if (this.t <= 0) { m.visible = false; return; }
    this.t -= dt;
    // it feeds out, waits, and is torn off
    const out = this.t > 0.35 ? Math.min(1, (2.6 - this.t) / 0.45) : this.t / 0.35;
    m.scale.x = Math.max(0.01, out);
    m.position.copy(this.slot);
    m.rotation.z = Math.sin(this.t * 7) * 0.02 - 0.08;
  }
}

/** the canvas kit mat your worn clothes lie on (drag clothes onto it to put them on) */
let matTex: THREE.Texture | null = null;
function kitTex(): THREE.Texture {
  if (matTex) return matTex;
  const pc = new PixelCanvas(96, 56);
  const R = makeRamp(0x6a6448, 6, { spread: 0.4 });
  pc.each((x, y) => {
    let i = 3 + ((x + y * 2) % 5 < 2 ? 0.5 : -0.3) + (Math.sin(x * 12.9 + y * 7.1) * 0.5) * 0.5;
    if (x < 2 || y < 2 || x > 93 || y > 53) i = 1;
    if ((x === 3 || x === 92 || y === 3 || y === 52) && (x + y) % 3 !== 0) i = 5;
    pc.set(x, y, R[Math.max(0, Math.min(5, Math.round(i)))]);
  });
  for (let k = 0; k < 6; k++) { const x = 10 + k * 15; for (let y = 6; y < 14; y++) { pc.set(x, y, 0x2a2618); pc.set(x + 1, y, 0x2a2618); } }
  const cv = document.createElement('canvas'); cv.width = 96; cv.height = 56;
  const ctx = cv.getContext('2d')!;
  ctx.putImageData(pc.toImageData(), 0, 0);
  ctx.font = `700 12px ${cssFont('--font-new', 'monospace')}`;
  ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(232,224,200,0.85)';
  ctx.fillText('WORN', 48, 50);
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  matTex = t;
  return t;
}
export function kitMat(): THREE.Mesh {
  const g = new THREE.PlaneGeometry(0.3, 0.175, 4, 2);
  g.rotateX(-Math.PI / 2);
  const P = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < P.count; i++) P.setY(i, 0.003 + Math.abs(Math.sin(P.getX(i) * 40 + P.getZ(i) * 31)) * 0.004);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: kitTex(), roughness: 0.95, metalness: 0, flatShading: true }));
  return m;
}

/** a couple of faceted dust motes kicked up where something lands */
export class Dust {
  readonly points: THREE.Points;
  private vel: Float32Array; private life: Float32Array; private pos: Float32Array;
  constructor(n = 48) {
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 3); this.vel = new Float32Array(n * 3); this.life = new Float32Array(n);
    for (let i = 0; i < n; i++) this.pos[i * 3 + 1] = -99;
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xb8ac90, size: 2, sizeAttenuation: false, transparent: true, opacity: 0.7, depthWrite: false }));
    this.points.frustumCulled = false;
  }
  puff(cx: number, cz: number, w: number, d: number) {
    const n = this.life.length;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.pos[i * 3] = cx + Math.cos(a) * w * 0.55; this.pos[i * 3 + 1] = 0.01; this.pos[i * 3 + 2] = cz + Math.sin(a) * d * 0.55;
      const s = 0.25 + Math.random() * 0.35;
      this.vel[i * 3] = Math.cos(a) * s; this.vel[i * 3 + 1] = 0.12 + Math.random() * 0.25; this.vel[i * 3 + 2] = Math.sin(a) * s;
      this.life[i] = 0.4 + Math.random() * 0.4;
    }
  }
  update(dt: number) {
    let any = false;
    for (let i = 0; i < this.life.length; i++) {
      if (this.life[i] <= 0) continue;
      any = true;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -99; continue; }
      for (let k = 0; k < 3; k++) { this.vel[i * 3 + k] *= Math.exp(-dt * 5); this.pos[i * 3 + k] += this.vel[i * 3 + k] * dt; }
      this.vel[i * 3 + 1] -= dt * 0.3;
    }
    if (any) (this.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }
}
void _q;
