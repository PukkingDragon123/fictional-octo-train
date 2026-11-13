// POKES: the menu rooms' props answer a press. Each poke is a prop (its real
// meshes, or a hit box round a merged kit prop) that, when pressed, does
// something (a drawer slides, a valve turns with a hiss, a fan spins up, a
// lamp stutters, a jelly quivers) and / or puts up a NOTE: an in-scene
// readout plate (a riveted steel frame with cut corners, a phosphor face, the
// text typed out in Alagard, a stamp) that drops in between the camera and
// the prop and flicks off after a while. No speech bubbles, no tooltips.
// Hover shows square brackets round the prop (and the stage's warm glow on
// real meshes). Sounds are the recorded CC0 samples (menu sfx, game samples).
//   const pk = new Pokes(room.hots)        stage rooms: pokes become hot props
//   const pk = new Pokes(null)             a room with its own picking (unit room 4): pk.hitAt(ray)
//   pk.add({ key, label, sub, m, box, c, objs, notes, sounds, act, blip, puff })
//   pk.wobble(obj)                          a spring squash on an object; returns its kick()
//   pk.say(note, worldPoint)                put a note up for a prop that handles its own press
//   pk.update(dt, t, cam)                   every frame (the note faces the camera that is looking)
import * as THREE from 'three';
import type { Hot } from '../monitor/stage';
import { Wobble, uiSound, gameSound } from '../monitor/props';
import { Puffs } from '../scene/fx';
import { bitText, bitMeasure } from '../../../gfx/bitfont';
import type { Sfx } from '../sfx';

export interface PokeNote { head: string; lines: string[]; stamp?: string; tone?: 'memo' | 'red' | 'lore' }
export interface PokeSound { s?: Sfx; g?: string; v?: number; d?: number }
export interface PokeDef {
  key: string; label: string; sub?: string;
  /** the prop's transform (local +Z out of its wall, +Y up) and a hit box (w, h, d) about the local centre c */
  m?: THREE.Matrix4; box?: [number, number, number]; c?: [number, number, number];
  /** or real objects that take the pointer (they glow when hovered) */
  objs?: THREE.Object3D[];
  /** cycled, one per press */
  notes?: PokeNote[];
  sounds?: PokeSound[];
  /** the reaction (n = how many times it has been pressed) */
  act?: (n: number) => void;
  /** a short light blip at the prop (its colour) */
  blip?: number;
  /** a puff of vapour or dust from the prop */
  puff?: { color: number; n?: number; up?: number; at?: [number, number, number] };
}
interface Poke { def: PokeDef; hit: THREE.Object3D[]; centre: THREE.Vector3; size: THREE.Vector3; q: THREE.Quaternion; n: number; hot?: Hot }

const BR = 0xffc860;
export class Pokes {
  readonly group = new THREE.Group();
  private list: Poke[] = [];
  private hitMat = new THREE.MeshBasicMaterial({ visible: false });
  private note: NotePlate;
  private puffs = new Puffs(64);
  private blipL = new THREE.PointLight(0xffd8a0, 0, 1.8, 2);
  private blipT = 0;
  private bracket: THREE.LineSegments;
  private hov: Poke | null = null;
  private wobbles: { o: THREE.Object3D; w: Wobble; s0: THREE.Vector3; r0: THREE.Euler; k: number }[] = [];
  private ray = new THREE.Raycaster();

  constructor(private hots: Hot[] | null) {
    this.group.name = 'pokes';
    this.note = new NotePlate();
    this.bracket = new THREE.LineSegments(bracketGeo(), new THREE.LineBasicMaterial({ color: BR, toneMapped: false, transparent: true, depthTest: false }));
    this.bracket.visible = false; this.bracket.renderOrder = 9; this.bracket.userData.noGlow = true;
    this.puffs.mesh.userData.noGlow = true;
    this.group.add(this.note.group, this.puffs.mesh, this.blipL, this.bracket);
  }
  get count() { return this.list.length; }

  add(def: PokeDef) {
    if (this.list.some((p) => p.def.key === def.key)) def = { ...def, key: def.key + '~' + this.list.length };
    const m = def.m ?? new THREE.Matrix4();
    const c = new THREE.Vector3(...(def.c ?? [0, 0, 0]));
    const size = new THREE.Vector3(...(def.box ?? [0.3, 0.3, 0.2]));
    const pos = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    m.decompose(pos, q, sc);
    let hit = def.objs;
    if (!hit?.length) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), this.hitMat);
      box.position.copy(c).applyMatrix4(m); box.quaternion.copy(q);
      box.userData.noGlow = true;
      this.group.add(box);
      hit = [box];
    }
    const centre = def.objs?.length ? new THREE.Box3().setFromObject(def.objs[0]).getCenter(new THREE.Vector3()) : c.clone().applyMatrix4(m);
    if (def.objs?.length) { const b = new THREE.Box3(); for (const o of def.objs) b.expandByObject(o); b.getCenter(centre); b.getSize(size); q.identity(); }
    const p: Poke = { def, hit, centre, size, q, n: 0 };
    if (this.hots) {
      p.hot = { key: 'pk:' + def.key, objs: hit, label: def.label, sub: def.sub, glow: def.objs?.length ? undefined : [], press: () => this.press(p), hover: (on) => this.hover(on ? p : null) };
      this.hots.push(p.hot);
    }
    this.list.push(p);
    return p;
  }
  /** a spring squash (scale) and shake (rotation) on an object; returns the kick */
  wobble(o: THREE.Object3D, k = 1): (v?: number) => void {
    const e = { o, w: new Wobble(160, 5), s0: o.scale.clone(), r0: o.rotation.clone(), k };
    this.wobbles.push(e);
    return (v = 6) => e.w.kick(v);
  }
  /** the nearest poke along a ray (rooms that do their own picking) */
  hitAt(ray: THREE.Ray): { key: string; label: string; sub?: string; press: () => void; hover: (on: boolean) => void } | null {
    this.ray.ray.copy(ray);
    let best: Poke | null = null, bd = Infinity;
    for (const p of this.list) for (const o of p.hit) { const h = this.ray.intersectObject(o, true)[0]; if (h && h.distance < bd) { bd = h.distance; best = p; } }
    if (!best) return null;
    const b = best;
    return { key: b.def.key, label: b.def.label, sub: b.def.sub, press: () => this.press(b), hover: (on) => this.hover(on ? b : null) };
  }
  hover(p: Poke | null) {
    this.hov = p;
    if (p) uiSound('tick', 0.2);
  }
  press(p: Poke) {
    const n = p.n++;
    const d = p.def;
    for (const s of d.sounds ?? []) {
      const run = () => { if (s.s) uiSound(s.s, s.v ?? 0.7); if (s.g) gameSound(s.g, s.v ?? 0.6); };
      if (s.d) setTimeout(run, s.d); else run();
    }
    try { d.act?.(n); } catch (e) { console.warn('poke', d.key, e); }
    if (d.blip !== undefined) { this.blipL.color.setHex(d.blip); this.blipL.position.copy(p.centre); this.blipT = 0.5; }
    if (d.puff) {
      const at0 = d.puff.at ? new THREE.Vector3(...d.puff.at) : p.centre;
      for (let i = 0; i < (d.puff.n ?? 10); i++) this.puffs.emit(at0.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.06, (Math.random() - 0.5) * 0.06)), new THREE.Vector3((Math.random() - 0.5) * 0.4, (d.puff.up ?? 0.2) + Math.random() * 0.2, (Math.random() - 0.5) * 0.4), { life: 1.4 + Math.random(), s0: 0.02, s1: 0.12, color: d.puff.color, rise: 0.12 });
    }
    if (d.notes?.length) this.say(d.notes[n % d.notes.length], p.centre);
  }
  /** a note for a prop (shown near the point, facing the camera) */
  say(note: PokeNote, at: THREE.Vector3) { this.note.show(note, at); uiSound('type', 0.35); }
  hideNote() { this.note.hide(); }

  update(dt: number, t: number, cam: THREE.Camera) {
    this.note.update(dt, t, cam);
    this.puffs.update(dt, cam, () => 0.9);
    this.blipT = Math.max(0, this.blipT - dt);
    this.blipL.intensity = this.blipT > 0 ? 2.4 * (this.blipT / 0.5) * (Math.sin(t * 60) > -0.3 ? 1 : 0.4) : 0;
    for (const e of this.wobbles) {
      const x = e.w.update(dt) * 0.06 * e.k;
      e.o.scale.set(e.s0.x * (1 - x * 0.5), e.s0.y * (1 + x), e.s0.z * (1 - x * 0.5));
      e.o.rotation.set(e.r0.x + x * 0.4, e.r0.y, e.r0.z + x * 0.6);
    }
    // brackets round the hovered prop
    const h = this.hov;
    this.bracket.visible = !!h;
    if (h) {
      this.bracket.position.copy(h.centre); this.bracket.quaternion.copy(h.q);
      this.bracket.scale.copy(h.size).multiplyScalar(1.08 + Math.sin(t * 6) * 0.025);
      (this.bracket.material as THREE.LineBasicMaterial).opacity = 0.7 + Math.sin(t * 6) * 0.3;
    }
  }
}

/** the corners of a unit box as short square brackets (12 ticks, 24 segments) */
function bracketGeo(): THREE.BufferGeometry {
  const p: number[] = [], k = 0.22;
  for (const x of [-0.5, 0.5]) for (const y of [-0.5, 0.5]) for (const z of [-0.5, 0.5]) {
    p.push(x, y, z, x - Math.sign(x) * k, y, z);
    p.push(x, y, z, x, y - Math.sign(y) * k, z);
    p.push(x, y, z, x, y, z - Math.sign(z) * k);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  return g;
}

// ================================================================== the note plate
const NW = 0.6, NH = 0.3, CW = 384, CH = 192;
class NotePlate {
  group = new THREE.Group();
  private cv = document.createElement('canvas');
  private tex: THREE.CanvasTexture;
  private note: PokeNote | null = null;
  private at = new THREE.Vector3();
  private placed = false;
  private age = 0; private life = 0; private shown = -1; private redraw = 0;
  private open = 0;
  private lead: THREE.Line;
  constructor() {
    this.cv.width = CW; this.cv.height = CH;
    this.tex = new THREE.CanvasTexture(this.cv);
    this.tex.magFilter = THREE.NearestFilter; this.tex.minFilter = THREE.LinearFilter; this.tex.generateMipmaps = false; this.tex.colorSpace = THREE.SRGBColorSpace;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(NW, NH), new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false, depthTest: false, transparent: true }));
    face.renderOrder = 11; face.userData.noGlow = true;
    // the frame: a steel band with cut corners, two hanger tabs, rivets (all square)
    const o = { x: NW / 2 + 0.018, y: NH / 2 + 0.018 }, c = 0.03, i = { x: NW / 2, y: NH / 2 };
    const sh = new THREE.Shape([[-o.x + c, -o.y], [o.x - c, -o.y], [o.x, -o.y + c], [o.x, o.y - c], [o.x - c, o.y], [-o.x + c, o.y], [-o.x, o.y - c], [-o.x, -o.y + c]].map(([x, y]) => new THREE.Vector2(x, y)));
    sh.holes.push(new THREE.Path([[-i.x, -i.y], [-i.x, i.y], [i.x, i.y], [i.x, -i.y]].map(([x, y]) => new THREE.Vector2(x, y))));
    const frameM = new THREE.MeshBasicMaterial({ color: 0x3a3e40, toneMapped: false, depthTest: false });
    const frame = new THREE.Mesh(new THREE.ShapeGeometry(sh), frameM);
    frame.renderOrder = 10; frame.userData.noGlow = true;
    const tabs = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.002).translate(-NW * 0.32, NH / 2 + 0.03, 0), frameM);
    const tabs2 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.002).translate(NW * 0.32, NH / 2 + 0.03, 0), frameM);
    for (const m of [tabs, tabs2]) { m.renderOrder = 10; m.userData.noGlow = true; }
    const lg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    this.lead = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: BR, toneMapped: false, depthTest: false, transparent: true, opacity: 0.8 }));
    this.lead.renderOrder = 10; this.lead.frustumCulled = false; this.lead.userData.noGlow = true;
    const plate = new THREE.Group(); plate.name = 'plate';
    plate.add(frame, face, tabs, tabs2);
    this.group.add(plate);
    this.group.visible = false;
  }
  private get plate() { return this.group.getObjectByName('plate')!; }
  show(n: PokeNote, at: THREE.Vector3) {
    this.note = n; this.at.copy(at); this.placed = false;
    this.age = 0; this.shown = -1; this.redraw = 0;
    const chars = n.head.length + n.lines.join(' ').length;
    this.life = 3.4 + chars / 22;
    this.group.visible = true;
    if (!this.lead.parent) this.group.parent?.add(this.lead);
  }
  hide() { if (this.note) this.age = Math.max(this.age, this.life); }
  update(dt: number, t: number, cam: THREE.Camera) {
    if (!this.note) { this.group.visible = false; this.lead.visible = false; this.open = 0; return; }
    this.age += dt;
    // place it once (between the camera and the prop, a little above it, facing the lens): it then stays in the room
    if (!this.placed) {
      this.placed = true;
      const cp = cam.getWorldPosition(new THREE.Vector3()), cq = cam.getWorldQuaternion(new THREE.Quaternion());
      const dir = this.at.clone().sub(cp); const dist = dir.length(); dir.normalize();
      // far enough that the plate fills about a third of the frame's height, whatever the lens
      const fov = (cam as THREE.PerspectiveCamera).isPerspectiveCamera ? (cam as THREE.PerspectiveCamera).fov : 50;
      const d = Math.max(0.45, Math.min(dist * 0.75, NH / (0.62 * Math.tan(THREE.MathUtils.degToRad(fov / 2)))));
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cq), fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cq), right = new THREE.Vector3(1, 0, 0).applyQuaternion(cq);
      const p = cp.clone().addScaledVector(dir, d);
      // keep it inside the middle of the frame: pull it toward the view axis a little, lift it above the prop
      const ax = cp.clone().addScaledVector(fwd, d);
      p.lerp(ax, 0.35).addScaledVector(up, 0.12);
      const side = p.clone().sub(ax).dot(right);
      p.addScaledVector(right, -Math.sign(side) * Math.min(0.08, Math.abs(side) * 0.2));
      this.group.position.copy(p); this.group.quaternion.copy(cq);
      this.group.rotateZ((Math.random() - 0.5) * 0.04);
    }
    // a CRT flick on and off: the face opens from a line
    const out = this.age > this.life;
    this.open = damp(this.open, out ? 0 : 1, out ? 18 : 14, dt);
    this.plate.scale.set(1, Math.max(0.02, this.open), 1);
    if (out && this.open < 0.03) { this.note = null; this.group.visible = false; this.lead.visible = false; return; }
    // the leader from the plate's foot to the prop
    const lp = this.lead.geometry.attributes.position as THREE.BufferAttribute;
    const foot = new THREE.Vector3(0, -NH / 2 - 0.018, 0).applyMatrix4(this.group.matrixWorld);
    lp.setXYZ(0, foot.x, foot.y, foot.z); lp.setXYZ(1, this.at.x, this.at.y, this.at.z); lp.needsUpdate = true;
    this.lead.visible = this.open > 0.5;
    // type it out (redrawn at most 15 times a second)
    const total = this.note.head.length + this.note.lines.reduce((s, l) => s + l.length, 0);
    const shown = Math.min(total, Math.floor(this.age * 46));
    this.redraw -= dt;
    if (shown !== this.shown && (this.redraw <= 0 || shown === total)) { this.redraw = 1 / 15; this.shown = shown; this.draw(shown, t); }
  }
  private draw(n: number, t: number) {
    const c = this.cv.getContext('2d')!, N = this.note!;
    const red = N.tone === 'red', lore = N.tone === 'lore';
    const bg = red ? ['#1e0806', '#0a0302'] : lore ? ['#0e1820', '#04080c'] : ['#12241a', '#040a06'];
    const g = c.createLinearGradient(0, 0, 0, CH); g.addColorStop(0, bg[0]); g.addColorStop(1, bg[1]);
    c.fillStyle = g; c.fillRect(0, 0, CW, CH);
    // the header band
    const hc = red ? '#c8261e' : lore ? '#3a7aa8' : '#d89a30';
    c.fillStyle = hc; c.fillRect(0, 0, CW, 22);
    c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(0, 20, CW, 2);
    let left = n;
    const head = N.head.slice(0, Math.max(0, left)); left -= N.head.length;
    bitText(c, head.toUpperCase(), 8, 3, { color: '#0a0604', outline: null });
    // the body, wrapped to the face
    const ink = red ? '#ffb8a8' : lore ? '#b8e0ff' : '#c8ffd0';
    let y = 30;
    for (const ln of N.lines) {
      if (left <= 0) break;
      const s = ln.slice(0, left); left -= ln.length;
      const redact = s.includes('█');
      bitText(c, s, 10, y, { color: redact ? '#e8e0d0' : ink, outline: null, maxW: CW - 20 });
      y += 15 * Math.max(1, wrapCount(ln, CW - 20)) + 4;
    }
    // the cursor, the stamp
    if (n < N.head.length + N.lines.reduce((s, l) => s + l.length, 0) || Math.floor(t * 3) % 2) { c.fillStyle = ink; c.fillRect(10, Math.min(CH - 14, y), 8, 3); }
    if (N.stamp && left >= 0) {
      // a flat red strip along the foot of the note with its word (no rubber stamp)
      const sw = bitMeasure(N.stamp) * 2 + 16;
      c.fillStyle = '#7a1a12'; c.fillRect(CW - sw - 14, CH - 34, sw, 22);
      c.fillStyle = '#ff5a3a'; c.fillRect(CW - sw - 14, CH - 34, 3, 22);
      bitText(c, N.stamp, CW - sw / 2 - 12, CH - 31, { color: '#ffe8d8', outline: null, scale: 2, align: 'center' });
    }
    c.fillStyle = 'rgba(0,0,0,0.22)';
    for (let yy = 0; yy < CH; yy += 2) c.fillRect(0, yy, CW, 1);
    this.tex.needsUpdate = true;
  }
}
const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt));
function wrapCount(s: string, maxW: number) {
  let n = 1, cur = '';
  for (const w of s.split(' ')) { const nx = cur ? cur + ' ' + w : w; if (cur && bitMeasure(nx) > maxW) { n++; cur = w; } else cur = nx; }
  return n;
}
