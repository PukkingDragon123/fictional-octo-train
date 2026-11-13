// THE PRESS, LIVE (round 17): the FEED page of the press terminal is a little 3D
// machine instead of a list. Its own small WebGL view (drawn at half resolution,
// pixelated, nearest filtering) in the terminal's body:
//   - the shelf: every kind of thing the unit carries spins on its own steel turntable
//     (hover: it spins faster, lifts, and a little dial shows its value in credits);
//     tap it and it flies in an arc into the hopper;
//   - the hopper: a cut-away of the press throat; loaded things tumble in, stack and
//     jostle (spheres in a box), a fill gauge rises; tap one to take it back out;
//   - the lever: pull it (or Space) and the ram slams down: shake, sparks, dust, the load
//     squashes flat and sinks; what the crusher gives back pours out of the chute into the
//     tray as spinning chunks, and the flip-digit counter rolls up the payout. A jackpot
//     spins the lamps, overspins the counter and pours gold. About 2.5 s; a click skips it.
// The real deposit happens in the world (the terminal calls depositItems + the lever);
// payout(value, out, jack) is called when the press reports back.
import * as THREE from 'three';
import { atlas } from '../../gfx/atlas';
import { U } from '../../gfx/materials';
import { itemGeometry } from '../../items/itemMeshes';
import { G } from '../G';
import type { Item } from '../../items/item';

export interface ShelfEntry { it: Item; value: number; count: number }
export interface PressViewOpts {
  onLoad: (it: Item) => void;
  onUnload: (it: Item) => void;
  onCrush: () => void;
  /** may the lever be pulled right now */
  canCrush: () => boolean;
}

// ---------------------------------------------------------------- materials
/** the pixel atlas on a lit material: the item models' own textures (same mapping as the world shader) */
let itemMat: THREE.MeshLambertMaterial | null = null;
function itemMaterial(): THREE.MeshLambertMaterial {
  if (itemMat) return itemMat;
  const m = new THREE.MeshLambertMaterial({ map: atlas().texture, vertexColors: true });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uAtlasSize = U.uAtlasSize;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aAtlas;\nvarying vec4 vAtlas;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAtlas = aAtlas;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uAtlasSize;\nvarying vec4 vAtlas;')
      .replace('#include <map_fragment>', `#ifdef USE_MAP
  vec2 texPx = max(vAtlas.zw * uAtlasSize, vec2(1.0));
  vec2 tuv = fract(vMapUv) * texPx;
  vec2 fuv = (floor(tuv) + 0.5) / texPx;
  diffuseColor *= texture2D(map, vAtlas.xy + vec2(fuv.x, 1.0 - fuv.y) * vAtlas.zw);
#endif`);
  };
  m.customProgramCacheKey = () => 'press3d-item';
  itemMat = m;
  return m;
}
const M = (color: number, emissive = 0) => new THREE.MeshLambertMaterial({ color, emissive: emissive ? new THREE.Color(color).multiplyScalar(emissive) : 0x000000, flatShading: true });
const STEEL = 0x8a8e88, DARK = 0x2a2c28, OLIVE = 0x5a6440, YELLOW = 0xd8b030, RUST = 0x7a4a2a, BRASS = 0xb8903a;
// shared by every turntable (and every opening of the screen): never disposed
const GEO = {
  disc: new THREE.CylinderGeometry(0.42, 0.46, 0.08, 8),
  rim: new THREE.CylinderGeometry(0.47, 0.47, 0.03, 8),
  dial: new THREE.PlaneGeometry(0.86, 0.35),
  gold: new THREE.IcosahedronGeometry(0.11, 0),
  stub: new THREE.BoxGeometry(0.3, 0.2, 0.2),
};
const ROW = 1.18;
const MAT = { steel: M(STEEL), brass: M(BRASS), dark: M(DARK), yellow: M(YELLOW), gold: new THREE.MeshLambertMaterial({ color: 0xffc830, emissive: 0x6a4808, flatShading: true }) };

/** an item model, scaled to fit `size` units and centred on its base */
function itemMesh(key: string, size: number): THREE.Object3D | null {
  const g = itemGeometry(key);
  if (!g) return null;
  if (!g.boundingBox) g.computeBoundingBox();
  const b = g.boundingBox!;
  const dx = b.max.x - b.min.x, dy = b.max.y - b.min.y, dz = b.max.z - b.min.z;
  const k = size / Math.max(0.05, dx, dy, dz);
  const mesh = new THREE.Mesh(g, itemMaterial());
  mesh.position.set(-(b.min.x + dx / 2) * k, -(b.min.y + dy / 2) * k, -(b.min.z + dz / 2) * k);
  mesh.scale.setScalar(k);
  const o = new THREE.Group(); o.add(mesh);
  return o;
}

// ---------------------------------------------------------------- a flip digit
class Flip {
  readonly mesh: THREE.Mesh;
  private cv = document.createElement('canvas');
  private tex: THREE.CanvasTexture;
  private shown = -1; private want = 0; private t = 1; private col = '#ffc850';
  constructor(parent: THREE.Object3D, x: number) {
    this.cv.width = 24; this.cv.height = 36;
    this.tex = new THREE.CanvasTexture(this.cv);
    this.tex.magFilter = THREE.NearestFilter; this.tex.minFilter = THREE.NearestFilter;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.3), new THREE.MeshBasicMaterial({ map: this.tex }));
    this.mesh.position.set(x, 0, 0.051);
    parent.add(this.mesh);
    this.draw(0);
  }
  set(d: number, col = '#ffc850') { if (d !== this.want || col !== this.col) { this.want = d; this.col = col; this.t = 0; } }
  private draw(d: number) {
    const g = this.cv.getContext('2d')!;
    g.fillStyle = '#16140e'; g.fillRect(0, 0, 24, 36);
    g.fillStyle = '#0a0906'; g.fillRect(0, 17, 24, 2);
    g.fillStyle = this.col; g.font = 'bold 28px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(d), 12, 19);
    this.tex.needsUpdate = true;
    this.shown = d;
  }
  step(dt: number) {
    if (this.t >= 1) return;
    this.t = Math.min(1, this.t + dt / 0.07);
    // a card flips: squash to nothing, swap, open again
    const k = this.t < 0.5 ? 1 - this.t * 2 : (this.t - 0.5) * 2;
    if (this.t >= 0.5 && this.shown !== this.want) this.draw(this.want);
    this.mesh.scale.y = Math.max(0.05, k);
  }
}

interface Table { it: Item; g: THREE.Group; model: THREE.Object3D | null; spin: number; lift: number; hover: boolean; dial: THREE.Mesh; value: number; home: THREE.Vector3 }
interface Body { it: Item; g: THREE.Object3D; p: THREE.Vector3; v: THREE.Vector3; r: number; spin: THREE.Vector3; fly: number; from: THREE.Vector3; flatten: number }
interface Chunk { g: THREE.Object3D; p: THREE.Vector3; v: THREE.Vector3; spin: THREE.Vector3; t: number }
interface Spark { p: THREE.Vector3; v: THREE.Vector3; life: number }

export class PressView {
  readonly el: HTMLDivElement;
  private cv: HTMLCanvasElement;
  private r: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(32, 2, 0.1, 60);
  private ray = new THREE.Raycaster();
  private ptr = new THREE.Vector2(-9, -9);
  private shelf = new THREE.Group();
  private press = new THREE.Group();
  private tables: Table[] = [];
  private bodies: Body[] = [];
  private chunks: Chunk[] = [];
  private sparks: Spark[] = [];
  private sparkPts: THREE.Points;
  private dust: Spark[] = [];
  private dustPts: THREE.Points;
  private ram = new THREE.Group();
  private lever = new THREE.Group();
  private gauge: THREE.Mesh;
  private lamps: THREE.Group[] = [];
  private lampLights: THREE.PointLight[] = [];
  private digits: Flip[] = [];
  private shown = 0; private target = 0; private roll = 0; private rollT = 1; private over = 0;
  private phase: 'idle' | 'pull' | 'slam' | 'wait' | 'pour' = 'idle';
  private pt = 0; private shake = 0; private jackT = 0;
  private pending: { value: number; out: string[]; jack: number } | null = null;
  private pour: string[] = []; private pourT = 0;
  private raf = 0; private last = 0;
  private portrait = false;
  private sig = '';
  private ro: ResizeObserver | null = null;
  private dead = false;

  /** false when this browser gave no WebGL (the terminal falls back to its list) */
  get ok() { return !!this.r; }

  constructor(private o: PressViewOpts) {
    const el = this.el = document.createElement('div');
    el.className = 'p3d';
    this.cv = document.createElement('canvas');
    el.append(this.cv);
    try {
      this.r = new THREE.WebGLRenderer({ canvas: this.cv, antialias: false, alpha: false, powerPreference: 'low-power' });
      this.r.setPixelRatio(0.5);
      this.r.setClearColor(0x0d0c09, 1);
      this.r.outputColorSpace = THREE.SRGBColorSpace;
    } catch (e) { console.warn('press 3d: no WebGL', e); this.r = null; }
    // light: a warm work lamp over the machine, a cold fill, the room
    this.scene.add(new THREE.HemisphereLight(0xfff0d8, 0x2a2418, 1.1));
    const key = new THREE.DirectionalLight(0xffe8c0, 1.6); key.position.set(-3, 6, 5); this.scene.add(key);
    const fill = new THREE.DirectionalLight(0x9ab0c8, 0.5); fill.position.set(4, 2, 3); this.scene.add(fill);
    this.scene.add(this.shelf, this.press);
    this.buildPress();
    // particles
    const mkPts = (n: number, size: number, color: number, add: boolean) => {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3)); g.setDrawRange(0, 0);
      const p = new THREE.Points(g, new THREE.PointsMaterial({ size, color, sizeAttenuation: true, transparent: true, opacity: add ? 1 : 0.7, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: false }));
      p.frustumCulled = false; this.scene.add(p); return p;
    };
    this.sparkPts = mkPts(240, 0.07, 0xffd070, true);
    this.dustPts = mkPts(160, 0.14, 0x9a9282, false);
    this.gauge = this.press.getObjectByName('gauge') as THREE.Mesh;
    this.buildJackPlate();
    // input
    this.cv.addEventListener('pointermove', (e) => this.onMove(e));
    this.cv.addEventListener('pointerleave', () => this.ptr.set(-9, -9));
    this.cv.addEventListener('pointerdown', (e) => this.onDown(e));
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(el);
    this.last = performance.now();
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  // ================================================================ the machine
  private buildPress() {
    const P = this.press;
    const box = (w: number, h: number, d: number, col: number, x: number, y: number, z: number, name?: string, em = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M(col, em)); m.position.set(x, y, z); if (name) m.name = name; P.add(m); return m; };
    // the base and the floor of the throat
    box(2.4, 0.3, 1.5, DARK, 0, 0.15, 0);
    box(1.7, 0.06, 1.1, RUST, 0, 0.33, 0);
    // the cut-away walls: the back and the left; the front is glass, the right a frame
    box(1.8, 1.7, 0.08, OLIVE, 0, 1.15, -0.6);
    box(0.08, 1.7, 1.2, OLIVE, -0.9, 1.15, 0);
    for (const x of [-0.9, 0.9]) box(0.12, 2.6, 0.12, STEEL, x, 1.6, 0.6);
    box(0.12, 2.6, 0.12, STEEL, 0.9, 1.6, -0.6);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.4, 0.02), new THREE.MeshLambertMaterial({ color: 0x9ac8c0, transparent: true, opacity: 0.12, depthWrite: false }));
    glass.position.set(0, 1.05, 0.6); P.add(glass);
    // the crown and hazard band
    box(2.1, 0.32, 1.4, OLIVE, 0, 2.95, 0);
    const hz = document.createElement('canvas'); hz.width = 32; hz.height = 4; const hg = hz.getContext('2d')!;
    for (let x = 0; x < 32; x++) { hg.fillStyle = ((x >> 2) % 2) ? '#1a1a1a' : '#e8c020'; hg.fillRect(x, 0, 1, 4); }
    const ht = new THREE.CanvasTexture(hz); ht.magFilter = THREE.NearestFilter; ht.wrapS = THREE.RepeatWrapping; ht.repeat.set(3, 1);
    const band = new THREE.Mesh(new THREE.BoxGeometry(2.12, 0.08, 1.42), new THREE.MeshLambertMaterial({ map: ht })); band.position.set(0, 2.8, 0); P.add(band);
    // the ram: a heavy platen on two rods
    const plat = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.26, 1.05), M(0x6a6e6a)); this.ram.add(plat);
    const face = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.04, 1.0), M(0x9aa09a)); face.position.y = -0.15; this.ram.add(face);
    for (const x of [-0.5, 0.5]) { const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.4, 8), M(0xc8ccc8)); rod.position.set(x, 0.8, 0); this.ram.add(rod); }
    this.ram.position.set(0, 2.45, 0);
    P.add(this.ram);
    // the lever on the right: a pivot, a red-knobbed arm
    this.lever.position.set(1.18, 1.25, 0.25);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.9, 0.09), M(STEEL)); arm.position.y = 0.45; this.lever.add(arm);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), M(0xc0281e, 0.15)); knob.position.y = 0.92; knob.name = 'knob'; this.lever.add(knob);
    this.lever.rotation.z = -0.5;
    P.add(this.lever);
    box(0.28, 0.4, 0.3, DARK, 1.18, 1.15, 0.25);
    // the fill gauge on the left: a glass tube, the amber column rising
    box(0.18, 1.2, 0.18, DARK, -1.15, 1.05, 0.3);
    const gm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.1, 0.1), M(0xffb030, 0.7)); gm.position.set(-1.15, 0.5, 0.36); gm.name = 'gauge'; gm.scale.y = 0.001; gm.geometry.translate(0, 0.55, 0); P.add(gm);
    // the chute out of the front-right, the tray below
    const chute = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.9), M(STEEL)); chute.position.set(0.55, 0.5, 1.05); chute.rotation.x = 0.55; P.add(chute);
    box(1.6, 0.1, 0.8, DARK, 0.3, 0.05, 1.75);
    for (const [w, d, x, z] of [[1.6, 0.06, 0.3, 2.13], [1.6, 0.06, 0.3, 1.37], [0.06, 0.8, -0.48, 1.75], [0.06, 0.8, 1.08, 1.75]] as [number, number, number, number][]) box(w, 0.22, d, STEEL, x, 0.16, z);
    // the counter on the crown: six flip digits behind a brass bezel
    const ctr = new THREE.Group(); ctr.position.set(0, 2.95, 0.72);
    const bez = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.42, 0.1), M(BRASS)); ctr.add(bez);
    for (let i = 0; i < 6; i++) this.digits.push(new Flip(ctr, -0.6 + i * 0.24));
    P.add(ctr);
    // two lamps on the crown (they spin for a jackpot)
    for (const x of [-0.95, 0.95]) {
      const g = new THREE.Group(); g.position.set(x, 3.2, 0.3);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.1, 8), M(DARK)); g.add(base);
      const dome = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.18, 8), new THREE.MeshLambertMaterial({ color: 0xffa020, emissive: 0x401800 })); dome.position.y = 0.13; g.add(dome);
      const reflector = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.14, 0.16), M(0xfff0c0, 0.8)); reflector.position.set(0.05, 0.13, 0); g.add(reflector);
      P.add(g); this.lamps.push(g);
      const L = new THREE.PointLight(0xffb030, 0, 5); L.position.set(x, 3.4, 0.6); this.scene.add(L); this.lampLights.push(L);
    }
  }

  /** a flat plate on the crown that lights for a jackpot (never a stamp) */
  private jackPlate!: THREE.Mesh;
  private jackMat!: THREE.MeshBasicMaterial;
  private buildJackPlate() {
    const c = document.createElement('canvas'); c.width = 64; c.height = 14;
    const g = c.getContext('2d')!;
    g.fillStyle = '#1a1408'; g.fillRect(0, 0, 64, 14); g.fillStyle = '#ffd040'; g.font = 'bold 11px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('JACKPOT', 32, 8);
    const tex = new THREE.CanvasTexture(c); tex.magFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
    this.jackMat = new THREE.MeshBasicMaterial({ map: tex, color: 0x3a3020 });
    this.jackPlate = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.26), this.jackMat);
    this.jackPlate.position.set(0, 3.27, 0.5);
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.34, 0.08), MAT.dark); back.position.set(0, 3.27, 0.45);
    this.press.add(back, this.jackPlate);
  }

  // ================================================================ the shelf
  /** the things the unit can feed it (one turntable per kind; kept across refreshes so they keep spinning) */
  setPack(list: ShelfEntry[]) {
    const max = this.portrait ? 8 : 12;
    list = list.slice(0, max);
    const sig = list.map((e) => e.it.key + ':' + e.count + ':' + e.value).join(',') + (this.portrait ? 'P' : 'L');
    if (sig === this.sig) { list.forEach((e, i) => { if (this.tables[i]) this.tables[i].it = e.it; }); return; }
    this.sig = sig;
    const old = new Map(this.tables.map((t) => [t.it.key, t]));
    this.tables = [];
    for (const e of list) {
      let t = old.get(e.it.key);
      if (t) { old.delete(e.it.key); t.it = e.it; } else {
        const g = new THREE.Group();
        g.add(new THREE.Mesh(GEO.disc, MAT.steel));
        const rim = new THREE.Mesh(GEO.rim, MAT.brass); rim.position.y = -0.05; g.add(rim);
        const model = itemMesh(e.it.key, 0.6);
        if (model) { model.position.y = 0.36; g.add(model); }
        const dial = new THREE.Mesh(GEO.dial, new THREE.MeshBasicMaterial({ transparent: true, depthTest: false }));
        dial.renderOrder = 5; dial.position.set(0, -0.2, 0.6); dial.visible = false; g.add(dial);
        this.shelf.add(g);
        t = { it: e.it, g, model, spin: Math.random() * 6, lift: 0, hover: false, dial, value: -1, home: new THREE.Vector3() };
      }
      if (t.value !== e.value * 1000 + e.count) { t.value = e.value * 1000 + e.count; this.paintDial(t, e.value, e.count); }
      this.tables.push(t);
    }
    for (const t of old.values()) { this.shelf.remove(t.g); ((t.dial.material as THREE.MeshBasicMaterial).map)?.dispose(); }
    this.tables.forEach((t, i) => { const c = i % 4, r = Math.floor(i / 4); t.home.set(c * 1.05, -r * ROW, 0); t.g.position.copy(t.home); });
    this.planks();
    this.layout();
  }
  /** the dial over a hovered turntable: its value in credits, how many of it */
  private paintDial(t: Table, value: number, count: number) {
    const dc = document.createElement('canvas'); dc.width = 64; dc.height = 26;
    const dg = dc.getContext('2d')!;
    dg.fillStyle = '#16140e'; dg.fillRect(0, 0, 64, 26); dg.fillStyle = '#8a7238'; dg.fillRect(0, 0, 64, 2); dg.fillRect(0, 24, 64, 2);
    dg.fillStyle = value > 0 ? '#ffc850' : '#8a8470'; dg.font = 'bold 17px monospace'; dg.textAlign = 'center'; dg.textBaseline = 'middle';
    dg.fillText(value > 0 ? `${value > 9999 ? Math.round(value / 1000) + 'k' : value}cr` : '—', count > 1 ? 36 : 32, 14);
    if (count > 1) { dg.fillStyle = '#c8bca0'; dg.font = 'bold 11px monospace'; dg.textAlign = 'left'; dg.fillText('×' + Math.min(99, count), 2, 13); }
    const tex = new THREE.CanvasTexture(dc); tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
    const m = t.dial.material as THREE.MeshBasicMaterial;
    m.map?.dispose(); m.map = tex; m.needsUpdate = true;
  }
  /** a steel rack plank under each row of turntables */
  private plankGroup = new THREE.Group();
  private planks() {
    this.shelf.remove(this.plankGroup);
    this.plankGroup = new THREE.Group();
    const rows = Math.ceil(this.tables.length / 4);
    for (let r = 0; r < rows; r++) {
      const n = Math.min(4, this.tables.length - r * 4);
      const p = new THREE.Mesh(new THREE.BoxGeometry(n * 1.05 + 0.1, 0.1, 1.0), MAT.dark); p.position.set((n - 1) * 0.525, -r * ROW - 0.1, 0); this.plankGroup.add(p);
      const lip = new THREE.Mesh(new THREE.BoxGeometry(n * 1.05 + 0.1, 0.05, 0.05), MAT.yellow); lip.position.set((n - 1) * 0.525, -r * ROW - 0.1, 0.5); this.plankGroup.add(lip);
    }
    this.shelf.add(this.plankGroup);
  }

  /** what is in the hopper right now (in from the shelf: flies; out: flies back) */
  setQueue(items: Item[]) {
    for (const b of [...this.bodies]) if (!items.includes(b.it) && this.phase === 'idle') { this.press.remove(b.g); this.bodies.splice(this.bodies.indexOf(b), 1); }
    for (const it of items) {
      if (this.bodies.some((b) => b.it === it)) continue;
      const g = itemMesh(it.key, 0.42) ?? new THREE.Mesh(GEO.stub, MAT.steel);
      const t = this.tables.find((q) => q.it.key === it.key);
      const from = t ? this.press.worldToLocal(t.g.getWorldPosition(new THREE.Vector3())).add(new THREE.Vector3(0, 0.4, 0)) : new THREE.Vector3(0, 3, 0);
      const p = new THREE.Vector3((Math.random() - 0.5) * 0.9, 2.1, (Math.random() - 0.5) * 0.5);
      g.position.copy(from);
      this.press.add(g);
      this.bodies.push({ it, g, p, v: new THREE.Vector3(), r: 0.2, spin: new THREE.Vector3((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8), fly: 0, from, flatten: 0 });
      G.audio?.ui?.('cube_place', 0.45);
    }
    if (this.phase === 'idle') this.gaugeTo(items.length / 10);
  }
  /** the hopper's estimate on the counter while loading (dim amber) */
  estimate(v: number) { if (this.phase === 'idle') { this.target = v; this.shown = v; this.paintDigits(v, '#c89838'); } }
  private gaugeTo(k: number) { this.gaugeK = Math.max(0, Math.min(1, k)); }
  private gaugeK = 0;

  // ================================================================ the crush
  /** pull the lever (the terminal has already sent the load to the world press) */
  crush() {
    if (this.phase !== 'idle') return;
    this.phase = 'pull'; this.pt = 0;
    this.pending = null;
    G.audio?.ui?.('press_lever', 0.8);
  }
  /** the press reported back: the payout, the slag, the jackpot */
  payout(value: number, out: string[], jack: number) {
    this.pending = { value, out, jack };
    if (this.phase === 'wait') this.startPour();
  }
  /** a click during the show: straight to the end */
  skip() {
    if (this.phase === 'idle') return;
    if (this.phase !== 'pour' && !this.pending) return;
    if (this.phase !== 'pour') this.startPour();
    for (const k of this.pour.splice(0)) this.spawnChunk(k, true);
    for (const c of this.chunks) { c.p.y = Math.max(c.p.y, 0.25); c.v.set(0, 0, 0); }
    this.rollT = 1; this.shown = this.target; this.paintDigits(this.target, this.jackT > 0 ? '#ffe070' : '#7aff9a');
    this.ram.position.y = 2.45; this.phase = 'idle';
  }
  private startPour() {
    const pd = this.pending!; this.pending = null;
    this.phase = 'pour'; this.pt = 0;
    this.pour = [...pd.out];
    if (pd.jack) { this.jackT = 3; for (let i = 0; i < 6; i++) this.pour.push('#gold'); G.audio?.ui?.('press_klaxon', 0.8); G.audio?.ui?.('coins', 0.8); }
    this.counterTo(pd.value, true, pd.jack ? 1 : 0);
  }
  private counterTo(v: number, roll: boolean, over = 0) {
    this.target = Math.max(0, Math.round(v));
    if (!roll) { this.shown = this.target; this.paintDigits(this.target, '#c89838'); return; }
    this.roll = 0; this.rollT = 0; this.over = over; this.shown = 0;
  }
  private paintDigits(v: number, col: string) {
    const s = String(Math.min(999999, Math.max(0, Math.round(v)))).padStart(6, '0');
    this.digits.forEach((d, i) => d.set(Number(s[i]), col));
  }

  private spawnChunk(key: string, settled = false) {
    let g: THREE.Object3D | null;
    if (key === '#gold') g = new THREE.Mesh(GEO.gold, MAT.gold);
    else g = itemMesh(key, 0.3);
    if (!g) return;
    const p = settled ? new THREE.Vector3(0.3 + (Math.random() - 0.5) * 1.2, 0.25, 1.75 + (Math.random() - 0.5) * 0.5) : new THREE.Vector3(0.55 + (Math.random() - 0.5) * 0.2, 0.75, 0.75);
    g.position.copy(p);
    this.press.add(g);
    this.chunks.push({ g, p, v: settled ? new THREE.Vector3() : new THREE.Vector3((Math.random() - 0.5) * 0.8, 0.3, 1.4 + Math.random() * 0.6), spin: new THREE.Vector3(Math.random() * 9, Math.random() * 9, Math.random() * 9), t: 0 });
    if (this.chunks.length > 30) { const c = this.chunks.shift()!; this.press.remove(c.g); }
  }
  private burst(n: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 1.5 + Math.random() * 3;
      this.sparks.push({ p: new THREE.Vector3((Math.random() - 0.5) * 1.6, 0.45, (Math.random() - 0.5) * 1.0), v: new THREE.Vector3(Math.cos(a) * s, 1 + Math.random() * 3, Math.sin(a) * s * 0.6 + 1), life: 0.4 + Math.random() * 0.5 });
    }
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      this.dust.push({ p: new THREE.Vector3(Math.cos(a) * 0.8, 0.4, Math.sin(a) * 0.5), v: new THREE.Vector3(Math.cos(a) * (0.6 + Math.random()), 0.3 + Math.random() * 0.6, Math.sin(a) * 0.4 + 0.3), life: 0.8 + Math.random() * 0.8 });
    }
  }

  // ================================================================ per frame
  private frame(now: number) {
    if (this.dead) return;
    this.raf = requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    if (!this.el.isConnected || !this.r) return;
    this.hoverPick();
    const T = now / 1000;
    // turntables
    for (const t of this.tables) {
      t.spin += dt * (t.hover ? 3.2 : 0.7);
      t.lift += ((t.hover ? 1 : 0) - t.lift) * Math.min(1, dt * 10);
      if (t.model) { t.model.rotation.y = t.spin; t.model.position.y = 0.34 + t.lift * 0.25 + Math.sin(T * 2 + t.home.x) * 0.02; }
      t.dial.visible = this.portrait || t.lift > 0.3;
      t.dial.quaternion.copy(this.cam.quaternion);
    }
    // the hopper's load: flying in, then tumbling and stacking
    const floor = 0.36;
    for (const b of this.bodies) {
      if (b.fly < 1) {
        b.fly = Math.min(1, b.fly + dt / 0.45);
        const k = b.fly, mid = new THREE.Vector3().addVectors(b.from, b.p).multiplyScalar(0.5).add(new THREE.Vector3(0, 1.4, 0));
        const a = b.from.clone().lerp(mid, k), c = mid.clone().lerp(b.p, k);
        b.g.position.copy(a.lerp(c, k));
        b.g.rotation.x += b.spin.x * dt; b.g.rotation.z += b.spin.z * dt;
        if (b.fly >= 1) b.v.set(0, -1.5, 0);
        continue;
      }
      if (b.flatten > 0) { b.g.scale.set(1 + b.flatten * 0.4, Math.max(0.12, 1 - b.flatten * 0.9), 1 + b.flatten * 0.4); continue; }
      b.v.y -= 9.8 * dt;
      b.p.addScaledVector(b.v, dt);
      if (b.p.y < floor + b.r) { b.p.y = floor + b.r; if (b.v.y < -0.5) { b.v.y *= -0.32; b.v.x += (Math.random() - 0.5) * 0.6; b.v.z += (Math.random() - 0.5) * 0.4; } else b.v.y = 0; b.v.x *= 0.9; b.v.z *= 0.9; b.spin.multiplyScalar(0.92); }
      for (const [ax, lim] of [['x', 0.78], ['z', 0.46]] as ['x' | 'z', number][]) if (Math.abs(b.p[ax]) > lim - b.r) { b.p[ax] = Math.sign(b.p[ax]) * (lim - b.r); b.v[ax] *= -0.4; }
      b.g.position.copy(b.p);
      b.g.rotation.x += b.spin.x * dt; b.g.rotation.y += b.spin.y * dt; b.g.rotation.z += b.spin.z * dt;
    }
    // they push each other apart (and jostle when something lands)
    for (let i = 0; i < this.bodies.length; i++) for (let j = i + 1; j < this.bodies.length; j++) {
      const A = this.bodies[i], B = this.bodies[j];
      if (A.fly < 1 || B.fly < 1 || A.flatten > 0) continue;
      const d = A.p.distanceTo(B.p), m = A.r + B.r;
      if (d > 0.0001 && d < m) {
        const n = new THREE.Vector3().subVectors(B.p, A.p).divideScalar(d), push = (m - d) * 0.5;
        A.p.addScaledVector(n, -push); B.p.addScaledVector(n, push);
        const rel = new THREE.Vector3().subVectors(B.v, A.v).dot(n);
        if (rel < 0) { A.v.addScaledVector(n, rel * 0.6); B.v.addScaledVector(n, -rel * 0.6); }
      }
    }
    // the gauge
    this.gauge.scale.y += (Math.max(0.001, this.gaugeK) - this.gauge.scale.y) * Math.min(1, dt * 6);
    // the cycle
    this.pt += dt;
    if (this.phase === 'pull') {
      this.lever.rotation.z = -0.5 + Math.min(1, this.pt / 0.22) * 1.4;
      if (this.pt >= 0.22) { this.phase = 'slam'; this.pt = 0; }
    } else if (this.phase === 'slam') {
      const k = Math.min(1, this.pt / 0.2);
      this.ram.position.y = 2.45 - (k * k) * 1.85;
      if (k >= 1 && this.shake <= 0 && this.bodies.every((b) => b.flatten === 0)) {
        this.shake = 0.35; this.burst(90);
        G.audio?.ui?.('press_slam', 1);
        for (const b of this.bodies) b.flatten = 1;
        this.gaugeTo(0);
      }
      if (this.pt > 0.55) {
        this.ram.position.y += (2.45 - this.ram.position.y) * Math.min(1, dt * 6);
        for (const b of this.bodies) { b.g.position.y -= dt * 0.6; }
      }
      if (this.pt > 0.95) {
        for (const b of this.bodies) this.press.remove(b.g);
        this.bodies = [];
        G.audio?.ui?.('press_hiss', 0.6);
        this.phase = 'wait'; this.pt = 0;
        if (this.pending) this.startPour();
      }
    } else if (this.phase === 'wait') {
      this.ram.position.y += (2.45 - this.ram.position.y) * Math.min(1, dt * 6);
      this.paintDigits(Math.floor(Math.random() * 999999), '#5a4a28');
    } else if (this.phase === 'pour') {
      this.ram.position.y += (2.45 - this.ram.position.y) * Math.min(1, dt * 6);
      this.pourT -= dt;
      if (this.pour.length && this.pourT <= 0) { this.pourT = 0.11; this.spawnChunk(this.pour.shift()!); G.audio?.ui?.(Math.random() < 0.5 ? 'dmg_debris_metal' : 'cube_place', 0.35); }
      if (!this.pour.length && this.rollT >= 1 && this.pt > 1.2) this.phase = 'idle';
    }
    if (this.phase !== 'pull' && this.phase !== 'slam') this.lever.rotation.z += (-0.5 - this.lever.rotation.z) * Math.min(1, dt * 5);
    // the counter rolls (a jackpot overspins: past the figure and back)
    if (this.rollT < 1) {
      this.rollT = Math.min(1, this.rollT + dt / 1.3);
      const e = 1 - Math.pow(1 - this.rollT, 3);
      const v = this.over ? this.target * (e < 0.8 ? e / 0.8 * 1.35 : 1.35 - (e - 0.8) / 0.2 * 0.35) : this.target * e;
      if (Math.floor(v) !== Math.floor(this.shown)) { this.shown = v; this.paintDigits(v, this.jackT > 0 ? '#ffe070' : '#7aff9a'); if (Math.random() < 0.4) G.audio?.ui?.('cb_tick', 0.2); }
      if (this.rollT >= 1) { this.shown = this.target; this.paintDigits(this.target, this.jackT > 0 ? '#ffe070' : '#7aff9a'); }
    }
    for (const d of this.digits) d.step(dt);
    // chunks: down the chute into the tray
    for (const c of this.chunks) {
      c.t += dt;
      c.v.y -= 9.8 * dt;
      c.p.addScaledVector(c.v, dt);
      const inTray = c.p.z > 1.38;
      const fl = inTray ? 0.22 : 0.36;
      if (c.p.y < fl) { c.p.y = fl; c.v.y *= -0.3; c.v.x *= 0.7; c.v.z *= 0.7; c.spin.multiplyScalar(0.85); }
      if (inTray) { c.p.x = Math.max(-0.4, Math.min(1.0, c.p.x)); if (c.p.z > 2.05) { c.p.z = 2.05; c.v.z *= -0.3; } }
      c.g.position.copy(c.p);
      c.g.rotation.x += c.spin.x * dt; c.g.rotation.y += c.spin.y * dt; c.g.rotation.z += c.spin.z * dt;
    }
    // jackpot: the lamps spin and flare
    this.jackT = Math.max(0, this.jackT - dt);
    this.jackMat.color.setHex(this.jackT > 0 ? (Math.floor(T * 8) % 2 ? 0xffffff : 0xffd080) : 0x3a3020);
    this.lamps.forEach((l, i) => { l.rotation.y += dt * (this.jackT > 0 ? 14 : 0.6); this.lampLights[i].intensity = this.jackT > 0 ? 6 + Math.sin(T * 20 + i * 3) * 4 : 0; });
    // particles
    this.stepPts(this.sparks, this.sparkPts, dt, 6);
    this.stepPts(this.dust, this.dustPts, dt, -0.5);
    // camera: framed on the layout, a slam shakes it
    this.shake = Math.max(0, this.shake - dt);
    const s = this.shake * 0.25;
    this.cam.position.copy(this.camBase).add(new THREE.Vector3((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, 0));
    this.cam.lookAt(this.camLook);
    this.r.render(this.scene, this.cam);
  }
  private stepPts(list: Spark[], pts: THREE.Points, dt: number, grav: number) {
    for (const s of list) { s.life -= dt; s.v.y -= grav * dt; s.p.addScaledVector(s.v, dt); if (s.p.y < 0.36 && grav > 0) { s.p.y = 0.36; s.v.y *= -0.3; s.v.x *= 0.6; } }
    for (let i = list.length - 1; i >= 0; i--) if (list[i].life <= 0) list.splice(i, 1);
    const a = pts.geometry.getAttribute('position') as THREE.BufferAttribute;
    const n = Math.min(list.length, a.count);
    const o = this.press.position;
    for (let i = 0; i < n; i++) a.setXYZ(i, list[i].p.x + o.x, list[i].p.y + o.y, list[i].p.z + o.z);
    a.needsUpdate = true;
    pts.geometry.setDrawRange(0, n);
  }

  // ================================================================ layout, picking
  private camBase = new THREE.Vector3(0, 4, 9);
  private camLook = new THREE.Vector3(0, 1.2, 0);
  private resize() {
    if (!this.r) return;
    const w = Math.max(1, this.el.clientWidth), h = Math.max(1, this.el.clientHeight);
    this.r.setSize(w, h, false);
    this.cv.style.width = w + 'px'; this.cv.style.height = h + 'px';
    this.cam.aspect = w / h; this.cam.updateProjectionMatrix();
    const p = w < h * 0.95;
    if (p !== this.portrait) { this.portrait = p; this.sig = ''; }
    this.layout();
  }
  private layout() {
    const n = Math.max(1, this.tables.length), rows = Math.ceil(n / 4), cols = Math.min(4, n);
    // content bounds (x0, x1, y0, y1) the camera must hold
    let x0: number, x1: number, y0: number, y1: number;
    if (this.portrait) {
      // the rack above, the machine below
      const top = 4.0 + (rows - 1) * ROW;
      this.shelf.position.set(-(cols - 1) * 0.525, top, -0.3);
      this.press.position.set(-0.1, 0, 0);
      x0 = -2.05; x1 = 2.05; y0 = -0.2; y1 = top + 1.25;
    } else {
      // the rack on the left, the machine on the right
      const top = 0.9 + (rows - 1) * ROW;
      this.shelf.position.set(-5.2, top, 0.2);
      this.press.position.set(1.4, 0, 0);
      x0 = -5.75; x1 = 3.0; y0 = -0.2; y1 = Math.max(3.6, top + 1.3);
    }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, hw = (x1 - x0) / 2, hh = (y1 - y0) / 2;
    const t = Math.tan(THREE.MathUtils.degToRad(this.cam.fov / 2));
    const d = Math.max(hh / t, hw / (t * this.cam.aspect)) * 1.12 + 1.2;
    const pitch = THREE.MathUtils.degToRad(this.portrait ? 12 : 16);
    this.camLook.set(cx, cy, 0.4);
    this.camBase.set(cx, cy + Math.sin(pitch) * d, 0.4 + Math.cos(pitch) * d);
  }
  private onMove(e: PointerEvent) {
    const r = this.cv.getBoundingClientRect();
    this.ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }
  private hit(): { kind: 'table'; t: Table } | { kind: 'body'; b: Body } | { kind: 'lever' } | null {
    if (this.ptr.x < -2) return null;
    this.ray.setFromCamera(this.ptr, this.cam);
    const objs: THREE.Object3D[] = [...this.tables.map((t) => t.g), ...this.bodies.map((b) => b.g), this.lever];
    const h = this.ray.intersectObjects(objs, true)[0];
    if (!h) return null;
    let o: THREE.Object3D | null = h.object;
    while (o) {
      if (o === this.lever) return { kind: 'lever' };
      const t = this.tables.find((q) => q.g === o); if (t) return { kind: 'table', t };
      const b = this.bodies.find((q) => q.g === o); if (b) return { kind: 'body', b };
      o = o.parent;
    }
    return null;
  }
  private hoverPick() {
    const h = this.phase === 'idle' ? this.hit() : null;
    let any = false;
    for (const t of this.tables) { const on = h?.kind === 'table' && h.t === t; if (on && !t.hover) G.audio?.ui?.('tab', 0.25); t.hover = on; any ||= on; }
    const lever = h?.kind === 'lever' && this.o.canCrush();
    (this.lever.getObjectByName('knob') as THREE.Mesh).scale.setScalar(lever ? 1.25 : 1);
    this.cv.style.cursor = any || lever || h?.kind === 'body' ? 'pointer' : 'default';
  }
  private onDown(e: PointerEvent) {
    e.preventDefault();
    this.onMove(e);
    if (this.phase !== 'idle') { this.skip(); return; }
    const h = this.hit();
    if (!h) return;
    if (h.kind === 'table') this.o.onLoad(h.t.it);
    else if (h.kind === 'body') this.o.onUnload(h.b.it);
    else if (h.kind === 'lever' && this.o.canCrush()) this.o.onCrush();
  }
  /** keyboard: Space / Enter pulls the lever */
  key(code: string): boolean { if ((code === 'Space' || code === 'Enter') && this.phase === 'idle' && this.o.canCrush()) { this.o.onCrush(); return true; } if (this.phase !== 'idle') { this.skip(); return true; } return false; }

  destroy() {
    this.dead = true;
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    // this view's own geometry, canvases and materials; the shared ones (GEO, MAT, the item models) stay
    const keepG = new Set<THREE.BufferGeometry>(Object.values(GEO)), keepM = new Set<THREE.Material>([...Object.values(MAT), itemMaterial()]);
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry && !keepG.has(m.geometry) && !this.isShared(m.geometry)) m.geometry.dispose();
      for (const mat of (Array.isArray(m.material) ? m.material : m.material ? [m.material] : []) as (THREE.Material & { map?: THREE.Texture | null })[]) {
        if (keepM.has(mat)) continue;
        if (mat.map && !(mat.map as THREE.DataTexture).isDataTexture) mat.map.dispose();
        mat.dispose();
      }
    });
    try { this.r?.dispose(); this.r?.forceContextLoss(); } catch { /* gone */ }
    this.r = null;
    this.el.remove();
  }
  /** item geometries are shared with the rest of the game (itemGeometry's cache): never disposed here */
  private isShared(g: THREE.BufferGeometry) { return !!g.getAttribute('aAtlas'); }
}
