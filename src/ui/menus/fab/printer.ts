// THE PRINTER (round 20): an enclosed fabricator the operator builds (the lab's fab bay, ./bay.ts, or a camp,
// ./camp.ts). In its own frame (front +Z): a green enamel base cabinet (vents, a drawer, the job screen and
// its lamps, a key switch) under a glazed chamber of extrusion posts; two glass doors on piano hinges; inside,
// a gold-sheeted bed on a carriage that the two rear lead screws lower a layer at a time, a gantry beam on
// belted side rails and the print head riding it (cooling fan, copper heater block, brass nozzle); the
// spools on stub axles across the roof, the one in use feeding the head through a white Bowden tube.
// Press it: the camera steps up to it and its console slides in (./console.ts, the press's old shop of
// patterns). A pattern bought there is PRINTED here: the head heats, the bed rises to the nozzle, the head
// traces each layer while the bed drops away under it and the thing grows out of the filament's colour;
// a cure flash turns it into the real thing, the doors swing open and it slides out into the tray
// (the lab's tray sinks into the chute: it waits for the next run; a camp's is set down by the machine).
import * as THREE from 'three';
import { FacetBuilder, at, cbox, prism, lathe, tube, bolt, C } from '../monitor/props';
import { itemGeometry } from '../../../items/itemMeshes';
import { hasItemDef } from '../../../items/item';
import { spools, FILAMENT } from '../../../game/economy/fab';
import { spoolModel, makerPlate, picto, damp, clamp01, ease, type FabCtx, type Hum, type Pose, type SpoolModel } from './kit';

const NOZZLE_Y = 1.12;
const BED = { w: 0.5, d: 0.42, top0: NOZZLE_Y - 0.004 };
const RAIL_Y = 1.31;
const DOOR_W = 0.43;

interface Job { keys: string[]; color: number; t: number; phase: 'heat' | 'print' | 'cure' | 'out' | 'end'; dur: number; h: number; meshes: THREE.Mesh[]; real: THREE.Material; clip: { value: number }; edge: { value: number }; done: (keys: string[]) => void }

/** a standard material that is cut off above a world height (the print growing), with a hot line at the cut */
function clipMat(color: number, clip: { value: number }, edge: { value: number }): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.05, flatShading: true, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uClipY = clip; sh.uniforms.uEdge = edge;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vWY;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWY = (modelMatrix * vec4(transformed, 1.0)).y;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vWY; uniform float uClipY; uniform float uEdge;')
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (vWY > uClipY) discard;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\nfloat hotLine = uEdge * (1.0 - smoothstep(0.0, 0.004, uClipY - vWY));\ntotalEmissiveRadiance += vec3(0.9, 0.3, 0.06) * hotLine;');
  };
  m.customProgramCacheKey = () => 'fabclip';
  return m;
}

export class Printer3D {
  group = new THREE.Group();
  active = false;
  onOpen?: () => void;
  onClose?: () => void;
  private ctx: FabCtx;
  private body: THREE.Group;
  private bed = new THREE.Group(); private bedY = BED.top0 - 0.18;
  private beam = new THREE.Group(); private head = new THREE.Group(); private fan = new THREE.Group();
  private hx = 0; private hz = 0;
  private screws: THREE.Group[] = [];
  private doors: THREE.Group[] = []; private doorK = 0;
  private rack = new THREE.Group(); private rackKey = ''; private rackSpools: { m: string; s: SpoolModel }[] = [];
  private bowden: THREE.Mesh; private bowdenMat = new THREE.MeshStandardMaterial({ color: 0xf0f0e8, roughness: 0.3, metalness: 0, transparent: true, opacity: 0.8 });
  private nozzleGlow = new THREE.MeshBasicMaterial({ color: 0x301808, toneMapped: false });
  private inner = new THREE.PointLight(0xfff0d8, 1.4, 1.6, 1.6);
  private screen: { cv: HTMLCanvasElement; g: CanvasRenderingContext2D; tex: THREE.CanvasTexture; acc: number };
  private lamps: THREE.MeshBasicMaterial[] = [];
  private tray = new THREE.Group(); private trayHatch = new THREE.Group(); private hatchK = 0;
  private job: Job | null = null;
  private hum: Hum | null = null;
  private cure = 0;
  private t = 0;
  private bw = 0;

  constructor(ctx: FabCtx) {
    this.ctx = ctx;
    this.group.name = 'printer';
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 48;
    const tex = new THREE.CanvasTexture(cv); tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace;
    this.screen = { cv, g: cv.getContext('2d')!, tex, acc: 1 };
    this.body = this.build();
    this.bowden = new THREE.Mesh(new THREE.BufferGeometry(), this.bowdenMat);
    this.bowden.userData.noGlow = true;
    this.group.add(this.body, this.bed, this.beam, this.rack, this.bowden, this.inner, this.tray);
    this.inner.position.set(0, 1.36, 0.12);
    this.refreshRack();
    ctx.hots.push({ key: 'pr:body', objs: [this.body, this.beam, ...this.doors], glow: [], label: 'Printer', sub: '', press: () => this.open() });
    ctx.hots.push({ key: 'pr:rack', objs: [this.rack], label: 'Spools', sub: '' });
  }
  get busy() { return !!this.job; }

  // ================================================================== the model
  private build(): THREE.Group {
    const { mats } = this.ctx;
    const g = new THREE.Group();
    const b = new FacetBuilder();
    const GREEN = 0x4e6a48, YEL = 0xd8a828, AL = 0xc8ccd0, DARK = C.dark;
    // ---- the base cabinet: plinth, carcass, vents, a drawer, feet, the panel's bezel
    b.add('metal', cbox(0.92, 0.06, 0.68, 0.01), DARK, at(0, 0.03, 0));
    b.add('paint', cbox(0.9, 0.46, 0.66, 0.02), GREEN, at(0, 0.29, 0), { rep: 0.35 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add('metal', lathe([[0, 0], [0.03, 0], [0.026, 0.02], [0.01, 0.03], [0, 0.03]], 6), DARK, at(sx * 0.4, -0.015, sz * 0.28));
    for (let i = 0; i < 7; i++) b.add('metal', cbox(0.22, 0.008, 0.012, 0.002), 0x2a3428, at(-0.26, 0.42 - i * 0.022, 0.332));
    b.add('paint', cbox(0.36, 0.12, 0.02, 0.008), 0x56724e, at(-0.2, 0.18, 0.336));
    b.add('chrome', cbox(0.12, 0.016, 0.02, 0.005), 0xd8dcd8, at(-0.2, 0.18, 0.352));
    b.add('metal', cbox(0.34, 0.26, 0.012, 0.004), 0x2a2e2a, at(0.22, 0.34, 0.334));
    for (let i = 0; i < 4; i++) b.add('chrome', bolt(0.006, 0.004), 0xc8ccc8, at(0.22 + (i % 2 ? 0.155 : -0.155), 0.34 + (i < 2 ? 0.115 : -0.115), 0.341, Math.PI / 2));
    // the key switch and a mains isolator by the screen
    b.add('chrome', prism(0.018, 0.012, 10), 0xd8dcd8, at(0.34, 0.255, 0.344, Math.PI / 2));
    b.add('brass', cbox(0.006, 0.022, 0.012, 0.002), 0xffffff, at(0.34, 0.255, 0.356, 0, 0, 0.6));
    b.add('paint', cbox(0.06, 0.08, 0.04, 0.008), 0xc8301c, at(0.4, 0.13, 0.33));
    b.add('hazard', cbox(0.9, 0.03, 0.012, 0.003), 0xffffff, at(0, 0.075, 0.334), { rep: 0.2 });
    // ---- the chamber: extrusion posts, frames, the back sheet (perforated), glass sides, a roof
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      b.add('chrome', cbox(0.04, 0.92, 0.04, 0.004), AL, at(sx * 0.43, 0.98, sz * 0.31), { rep: 0.2 });
      b.add('metal', cbox(0.012, 0.9, 0.006, 0.002), 0x5a5e62, at(sx * 0.43, 0.98, sz * 0.31 + sz * 0.021));
    }
    for (const y of [0.535, 1.425]) {
      for (const sz of [-1, 1]) b.add('chrome', cbox(0.9, 0.04, 0.04, 0.004), AL, at(0, y, sz * 0.31));
      for (const sx of [-1, 1]) b.add('chrome', cbox(0.04, 0.04, 0.62, 0.004), AL, at(sx * 0.43, y, 0));
    }
    b.add('metal', cbox(0.84, 0.86, 0.01, 0.003), 0x3a3e3a, at(0, 0.98, -0.3), { rep: 0.15 });
    for (let r = 0; r < 12; r++) for (let c = 0; c < 14; c++) if ((r + c) % 2 === 0) b.add('rubber', cbox(0.012, 0.012, 0.004, 0.001), 0x101010, at(-0.33 + c * 0.05, 0.62 + r * 0.065, -0.293));
    for (const sx of [-1, 1]) b.add('glass', cbox(0.006, 0.84, 0.58, 0.002), 0xa8d8e8, at(sx * 0.432, 0.98, 0));
    b.add('paint', cbox(0.92, 0.03, 0.66, 0.01), GREEN, at(0, 1.46, 0));
    b.add('hazard', cbox(0.92, 0.012, 0.012, 0.003), 0xffffff, at(0, 1.465, 0.333), { rep: 0.2 });
    // the chamber floor (a drip tray) and the two lead screws, their bearings, the bed's carriage rails
    b.add('metal', cbox(0.82, 0.02, 0.58, 0.004), 0x4a4e4a, at(0, 0.565, 0));
    for (const sx of [-1, 1]) {
      b.add('metal', cbox(0.05, 0.04, 0.05, 0.006), DARK, at(sx * 0.36, 0.59, -0.24));
      b.add('metal', cbox(0.05, 0.04, 0.05, 0.006), DARK, at(sx * 0.36, 1.39, -0.24));
      b.add('chrome', prism(0.008, 0.8, 6), 0xe8ecec, at(sx * 0.3, 0.99, -0.26));
    }
    // the gantry's side rails along Z at the top, their belts, the stepper motors in the back corners
    for (const sx of [-1, 1]) {
      b.add('chrome', cbox(0.02, 0.02, 0.56, 0.004), AL, at(sx * 0.4, RAIL_Y, 0));
      b.add('rubber', cbox(0.006, 0.012, 0.54, 0.002), 0x1a1a1a, at(sx * 0.385, RAIL_Y + 0.02, 0));
      b.add('paint', cbox(0.06, 0.06, 0.06, 0.008), 0x2a2a2a, at(sx * 0.39, RAIL_Y + 0.02, -0.27));
    }
    // the work light: a strip under the roof's front edge
    b.add('metal', cbox(0.7, 0.02, 0.03, 0.004), DARK, at(0, 1.39, 0.27));
    b.add('lamp', cbox(0.66, 0.008, 0.016, 0.002), 0xfff4e0, at(0, 1.378, 0.27));
    // the roof rack for the spools: a rail with stub axles, a guide gland for the Bowden tube
    b.add('metal', cbox(0.84, 0.03, 0.05, 0.006), DARK, at(0, 1.5, -0.2));
    for (let i = 0; i < 4; i++) { b.add('metal', cbox(0.03, 0.14, 0.03, 0.004), DARK, at(-0.3 + i * 0.2, 1.57, -0.2)); b.add('chrome', prism(0.008, 0.12, 6), 0xd8dcd8, at(-0.3 + i * 0.2, 1.64, -0.14, Math.PI / 2)); }
    b.add('brass', prism(0.016, 0.03, 8), 0xffffff, at(0, 1.48, 0.0));
    // cable from the cabinet to the wall
    b.add('rubber', tube([[0.3, 0.1, -0.33], [0.32, 0.04, -0.4], [0.2, 0.02, -0.44]], 0.014, 8, 5), 0x1a1a1a);
    // the tray under the doors (the lab's: a hatch into the chute)
    b.add('metal', cbox(0.5, 0.04, 0.14, 0.006), 0x6a6e6a, at(0, 0.53, 0.4));
    for (const sx of [-1, 1]) b.add('metal', cbox(0.012, 0.06, 0.14, 0.003), DARK, at(sx * 0.25, 0.55, 0.4));
    b.add('paint', cbox(0.5, 0.012, 0.012, 0.003), YEL, at(0, 0.58, 0.47));
    g.add(b.build(mats));
    // the maker's plate on the cabinet, a hot-bed pictogram on the chamber's post
    const mp = makerPlate(mats, 0.07); mp.position.set(-0.32, 0.47, 0.342); g.add(mp);
    const hp = picto('hot', 0.05); hp.position.set(0.03, 0.455, 0.342); g.add(hp);
    // ---- the job screen (a canvas on the cabinet) and three lamps
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.21), new THREE.MeshBasicMaterial({ map: this.screen.tex, toneMapped: false }));
    scr.position.set(0.22, 0.345, 0.342); scr.userData.noGlow = true; g.add(scr);
    for (let i = 0; i < 3; i++) {
      const m = new THREE.MeshBasicMaterial({ color: 0x202020, toneMapped: false }); this.lamps.push(m);
      const L = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6), m); L.position.set(-0.04 + i * 0.035, 0.44, 0.34); L.userData.noGlow = true; g.add(L);
    }
    // ---- the doors (hinged at the front posts), each a steel frame round a pane, a pull handle
    for (const sx of [-1, 1]) {
      const d = new THREE.Group(); const db = new FacetBuilder();
      const cx = -sx * DOOR_W / 2;
      for (const y of [-0.42, 0.42]) db.add('chrome', cbox(DOOR_W, 0.03, 0.02, 0.004), AL, at(cx, y, 0));
      for (const x of [0.0, -sx * DOOR_W]) db.add('chrome', cbox(0.03, 0.87, 0.02, 0.004), AL, at(x, 0, 0));
      db.add('glass', cbox(DOOR_W - 0.03, 0.82, 0.006, 0.002), 0xb8e0f0, at(cx, 0, 0));
      db.add('metal', cbox(0.02, 0.16, 0.02, 0.004), DARK, at(-sx * (DOOR_W - 0.04), 0.0, 0.03));
      db.add('chrome', cbox(0.012, 0.18, 0.012, 0.003), 0xe8ecec, at(-sx * (DOOR_W - 0.04), 0.0, 0.05));
      for (const y of [-0.3, 0.3]) db.add('metal', cbox(0.02, 0.08, 0.025, 0.004), DARK, at(0, y, -0.005));
      d.add(db.build(mats)); d.position.set(sx * 0.43, 0.98, 0.335); g.add(d); this.doors.push(d);
    }
    // ---- the bed: an aluminium plate on a carriage arm to the screws, its gold sheet, the levelling knobs
    { const bb = new FacetBuilder();
      bb.add('chrome', cbox(BED.w, 0.016, BED.d, 0.003), 0xb8bcc0, at(0, -0.012, 0));
      bb.add('brass', cbox(BED.w - 0.01, 0.003, BED.d - 0.01, 0.001), 0xe8c070, at(0, -0.002, 0), { rep: 0.05 });
      bb.add('metal', cbox(0.66, 0.03, 0.05, 0.006), DARK, at(0, -0.04, -0.24));
      for (const sx of [-1, 1]) { bb.add('metal', cbox(0.04, 0.03, 0.26, 0.006), DARK, at(sx * 0.18, -0.04, -0.12)); bb.add('brass', prism(0.016, 0.03, 8), 0xffffff, at(sx * 0.3, -0.04, -0.26)); }
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) bb.add('bakelite', prism(0.014, 0.012, 8), 0xffffff, at(sx * 0.22, -0.03, sz * 0.18));
      this.bed.add(bb.build(mats)); }
    // ---- the gantry beam (moves in Z) and the head (moves in X along it)
    { const gb = new FacetBuilder();
      gb.add('chrome', cbox(0.8, 0.025, 0.03, 0.004), AL, at(0, 0, 0));
      for (const sx of [-1, 1]) gb.add('metal', cbox(0.05, 0.04, 0.05, 0.006), DARK, at(sx * 0.4, 0, 0));
      gb.add('rubber', cbox(0.76, 0.006, 0.006, 0.001), 0x1a1a1a, at(0, 0.016, 0.012));
      this.beam.add(gb.build(mats)); this.beam.position.y = RAIL_Y; }
    { const hb = new FacetBuilder();
      hb.add('paint', cbox(0.07, 0.08, 0.06, 0.008), 0x2a2a2a, at(0, -0.02, 0.02));
      hb.add('paint', cbox(0.04, 0.03, 0.04, 0.004), YEL, at(0, 0.03, 0.02));
      hb.add('copper', cbox(0.03, 0.022, 0.03, 0.003), 0xffffff, at(0, -0.075, 0.015));
      hb.add('brass', lathe([[0, 0], [0.003, 0], [0.012, 0.012], [0.012, 0.022], [0, 0.022]], 6), 0xffffff, at(0, NOZZLE_Y - RAIL_Y + 0.0, 0.015));
      hb.add('metal', cbox(0.05, 0.05, 0.012, 0.004), 0x3a3a3a, at(0, -0.04, 0.056));
      this.head.add(hb.build(mats));
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.004, 6, 4), this.nozzleGlow); tip.position.set(0, NOZZLE_Y - RAIL_Y + 0.002, 0.015); tip.userData.noGlow = true; this.head.add(tip);
      const fb = new FacetBuilder();
      for (let i = 0; i < 5; i++) fb.add('metal', cbox(0.008, 0.018, 0.002, 0.001), 0x8a8e8a, at(0, 0.01, 0, 0, 0, i * Math.PI * 2 / 5).multiply(new THREE.Matrix4().makeRotationY(0.4)));
      this.fan.add(fb.build(mats, { cast: false })); this.fan.position.set(0, -0.04, 0.064); this.head.add(this.fan);
      this.beam.add(this.head); }
    // ---- the lead screws' visible threads turn (thin spirals stand in: a group per screw that rotates)
    for (const sx of [-1, 1]) {
      const s = new THREE.Group(); const sb = new FacetBuilder();
      for (let i = 0; i < 20; i++) sb.add('chrome', cbox(0.02, 0.004, 0.004, 0.001), 0xc8ccd0, at(0, -0.38 + i * 0.04, 0, 0, i * 0.9));
      s.add(sb.build(mats, { cast: false })); s.position.set(sx * 0.3, 0.99, -0.26); g.add(s); this.screws.push(s);
    }
    // ---- the tray's hatch (the lab's chute)
    { const tb = new FacetBuilder(); tb.add('metal', cbox(0.46, 0.008, 0.12, 0.002), 0x8a8e8a, at(0, 0, 0.06)); this.trayHatch.add(tb.build(mats)); this.trayHatch.position.set(0, 0.555, 0.34); g.add(this.trayHatch); }
    return g;
  }

  // ================================================================== spools on the roof
  /** the roof shows a spool per material on file (the four with the most), each as full as its kilos */
  refreshRack() {
    const by = new Map<string, number>();
    for (const s of spools()) by.set(s.m, (by.get(s.m) ?? 0) + s.kg);
    const top = [...by].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const key = top.map(([m, kg]) => m + Math.round(kg * 10)).join(',');
    if (key === this.rackKey) return;
    this.rackKey = key;
    for (const r of this.rackSpools) { r.s.group.removeFromParent(); r.s.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose()); }
    this.rackSpools = top.map(([m, kg], i) => {
      const s = spoolModel(this.ctx.mats, FILAMENT[m as keyof typeof FILAMENT], Math.min(1, kg), 0.92);
      s.group.position.set(-0.3 + i * 0.2, 1.64, -0.1);
      this.rack.add(s.group);
      return { m, s };
    });
  }
  private spoolOf(color: number): SpoolModel | null { return this.rackSpools.find((r) => FILAMENT[r.m as keyof typeof FILAMENT] === color)?.s ?? this.rackSpools[0]?.s ?? null; }

  // ================================================================== open / close
  open() {
    if (this.active) return;
    this.active = true;
    this.ctx.sound('tc_clunk', 0.4);
    this.ctx.sound('sg_loop_whine', 0.0001);
    this.onOpen?.();
  }
  close() {
    if (!this.active) return;
    this.active = false;
    this.ctx.sound('tc_toggle', 0.3);
    this.onClose?.();
  }
  back(): boolean { if (!this.active) return false; this.close(); return true; }

  // ================================================================== a print
  /** print these item keys in this filament colour; done(keys) once it is out in the tray */
  print(keys: string[], color: number, done: (keys: string[]) => void) {
    if (this.job || !keys.length) return false;
    const clip = { value: -1 }, edge = { value: 1 };
    const pm = clipMat(color, clip, edge);
    const real = pm;
    const show = keys.slice(0, 3);
    const meshes: THREE.Mesh[] = [];
    let h = 0.02;
    show.forEach((k, i) => {
      const geo = hasItemDef(k) ? itemGeometry(k) : null;
      const m = new THREE.Mesh(geo ?? new THREE.BoxGeometry(0.06, 0.04, 0.06).translate(0, 0.02, 0), pm);
      m.castShadow = true;
      const bb = (geo?.boundingBox ?? new THREE.Box3(new THREE.Vector3(-0.03, 0, -0.03), new THREE.Vector3(0.03, 0.04, 0.03)));
      const sz = bb.getSize(new THREE.Vector3());
      const big = Math.max(sz.x, sz.y, sz.z);
      const s = big > 0.26 ? 0.26 / big : big < 0.13 ? 0.13 / big : 1;
      m.scale.setScalar(s);
      const n = show.length, x = n > 1 ? (i - (n - 1) / 2) * Math.min(0.15, 0.42 / n) : 0;
      m.position.set(x - (bb.min.x + sz.x / 2) * s, -bb.min.y * s, -(bb.min.z + sz.z / 2) * s);
      h = Math.max(h, sz.y * s);
      this.bed.add(m); meshes.push(m);
    });
    this.job = { keys, color, t: 0, phase: 'heat', dur: 3.2 + h * 9, h, meshes, real, clip, edge, done };
    this.ctx.sound('cube_beep', 0.4);
    this.ctx.sound('cy_servo', 0.4);
    return true;
  }

  camGoal(port: boolean): Pose | null {
    if (!this.active) return null;
    const k = port ? 1.5 : 1;
    // printing: in close on the bed and the tray; otherwise the printer on the left, the console on the right
    // (the console stands on the right: the printer is framed in the left half; on a phone, in the top half)
    const close = !!this.job, out = this.job?.phase === 'out' || this.job?.phase === 'end';
    const ly = out ? 0.7 : 1.02;
    const look = close ? new THREE.Vector3(port ? 0 : 0.27, port ? ly - 0.2 : ly, out ? 0.25 : 0.05) : new THREE.Vector3(port ? 0 : 0.5, port ? 0.75 : 0.95, 0.0);
    const pos = (close ? new THREE.Vector3(port ? 0.02 : 0.4, out ? 1.28 : 1.5, out ? 1.25 : 1.15) : new THREE.Vector3(port ? 0 : 0.56, 1.38, 1.95)).sub(look).multiplyScalar(k).add(look);
    return { pos: this.group.localToWorld(pos), look: this.group.localToWorld(look.clone()), fov: port ? 62 : close ? 46 : 50 };
  }

  // ================================================================== frame
  private drawScreen(dt: number) {
    const S = this.screen;
    S.acc += dt;
    if (S.acc < 0.2) return;
    S.acc = 0;
    const g = S.g, W = 64, H = 48;
    g.fillStyle = '#04140a'; g.fillRect(0, 0, W, H);
    const j = this.job;
    const ph = '#3aff6a', dim = '#0e4a22', hi = '#c8ffd0';
    // the bed seen from the front: the layers so far as bars, the head over them
    g.fillStyle = dim; g.fillRect(6, 38, 52, 2);
    const k = j ? (j.phase === 'heat' ? 0 : j.phase === 'print' ? clamp01(j.t / j.dur) : 1) : 0;
    const rows = Math.round(k * 14);
    for (let r = 0; r < rows; r++) { g.fillStyle = r === rows - 1 && j?.phase === 'print' ? hi : ph; g.fillRect(20 - (r % 2), 36 - r * 2, 24 + (r % 3), 1); }
    if (j && j.phase === 'print') { const hx = 18 + Math.round((Math.sin(this.t * 9) * 0.5 + 0.5) * 26); g.fillStyle = hi; g.fillRect(hx, 34 - rows * 2 - 4, 4, 3); g.fillRect(hx + 1, 34 - rows * 2 - 1, 2, 1); }
    // progress pips along the top, a heat lamp, the spool count as pips
    for (let i = 0; i < 10; i++) { g.fillStyle = i < Math.round(k * 10) ? ph : dim; g.fillRect(6 + i * 5, 4, 4, 3); }
    g.fillStyle = j && j.phase !== 'end' ? '#ff8a2a' : dim; g.fillRect(56, 4, 3, 3);
    const n = Math.min(10, spools().length);
    for (let i = 0; i < 10; i++) { g.fillStyle = i < n ? '#ffd23a' : dim; g.fillRect(6 + i * 5, 43, 3, 2); }
    for (let y = 0; y < H; y += 2) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, y, W, 1); }
    S.tex.needsUpdate = true;
  }

  update(dt: number, t: number) {
    this.t = t;
    for (const h of this.ctx.hots) {
      if (h.key === 'pr:body') { h.off = this.active; h.sub = ''; }
      if (h.key === 'pr:rack') h.sub = `${spools().length}`;
    }
    if (!this.job) this.refreshRack();
    this.drawScreen(dt);
    const j = this.job;
    let gx = 0, gz = 0, bedGoal = BED.top0 - 0.18, nozzle = 0;
    let doors = 0, hatch = 0;
    if (j) {
      j.t += dt;
      if (j.phase === 'heat') {
        nozzle = clamp01(j.t / 0.9); bedGoal = BED.top0; gx = -0.15; gz = -0.12;
        if (j.t > 1.0) { j.phase = 'print'; j.t = 0; this.hum = this.ctx.loop('sg_loop_whine', 0.22, 0.9); this.ctx.sound('tc_tick', 0.3); }
      } else if (j.phase === 'print') {
        const k = clamp01(j.t / j.dur);
        nozzle = 1;
        // each layer: the head zigzags over the part, the bed drops by the layer
        const lay = k * j.h;
        bedGoal = BED.top0 - lay;
        // the cut is the layer just laid: the bed's sheet plus what has been printed on it
        j.clip.value = this.group.localToWorld(new THREE.Vector3(0, this.bedY + lay, 0)).y;
        const f = t * 7.5;
        gx = Math.sin(f) * 0.11 * (j.meshes.length > 1 ? 1.8 : 1);
        gz = Math.sin(f * 0.31 + Math.sin(f * 0.11)) * 0.08;
        this.hum?.rate(0.85 + Math.abs(Math.cos(f)) * 0.3);
        if (Math.random() < dt * 1.2) this.ctx.sound('tc_tick', 0.12, 1.4);
        if (k >= 1) { j.phase = 'cure'; j.t = 0; this.hum?.stop(); this.hum = null; this.ctx.sound('cube_hiss', 0.45); this.ctx.sound('cube_ok', 0.4); }
      } else if (j.phase === 'cure') {
        nozzle = 1 - clamp01(j.t / 0.6); bedGoal = BED.top0 - j.h; gx = -0.3; gz = -0.2;
        j.edge.value = 0; j.clip.value = 99;
        this.cure = Math.sin(clamp01(j.t / 0.6) * Math.PI);
        // cured: the hot line goes, the surface settles to a satin finish
        if (j.t > 0.32) for (const m of j.meshes) { const mm = m.material as THREE.MeshStandardMaterial; mm.roughness = 0.55; }
        if (j.t > 0.7) { j.phase = 'out'; j.t = 0; this.ctx.sound('door_open', 0.35); this.ctx.sound('cube_relay', 0.3); }
      } else if (j.phase === 'out') {
        bedGoal = BED.top0 - 0.42; gx = -0.3; gz = -0.2;
        // the bed drops to the tray's lip; the doors swing; the parts slide forward off the sheet into the tray
        doors = j.t < 1.9 ? 1 : 0;
        const k = clamp01((j.t - 0.55) / 0.6);
        for (const m of j.meshes) {
          if (!m.userData.p0) m.userData.p0 = m.position.clone();
          const p0 = m.userData.p0 as THREE.Vector3;
          m.position.z = p0.z + ease(k) * 0.42;
          // off the sheet's lip into the tray; in the lab the tray's hatch then lets it down the chute
          m.position.y = p0.y - Math.max(0, k - 0.6) * 0.5 - (this.ctx.lab ? Math.max(0, j.t - 1.7) * 0.6 : 0);
        }
        if (j.t > 0.6 && !j.meshes[0].userData.slid) { j.meshes[0].userData.slid = true; this.ctx.sound('dmg_scrape_metal', 0.3); }
        if (j.t > 1.2 && !j.meshes[0].userData.land) { j.meshes[0].userData.land = true; this.ctx.sound('thud_soft', 0.5); }
        hatch = this.ctx.lab && j.t > 1.6 ? 1 : 0;
        if (j.t > 2.4) { j.phase = 'end'; j.t = 0; }
      } else {
        for (const m of j.meshes) { m.removeFromParent(); }
        (j.meshes[0]?.material as THREE.Material | undefined)?.dispose();
        const keys = j.keys, done = j.done;
        this.job = null;
        if (this.ctx.lab) this.ctx.sound('tc_cover', 0.4);
        done(keys);
        this.rackKey = '';
      }
    }
    // the bed (the screws turn as it moves), the gantry and head, the nozzle's heat, the doors, the hatch
    const by0 = this.bedY;
    this.bedY = damp(this.bedY, bedGoal, j?.phase === 'print' ? 20 : 3, dt);
    this.bed.position.y = this.bedY;
    for (const s of this.screws) s.rotation.y += (this.bedY - by0) * 220;
    this.hx = damp(this.hx, gx, j?.phase === 'print' ? 30 : 4, dt);
    this.hz = damp(this.hz, gz, j?.phase === 'print' ? 30 : 4, dt);
    this.beam.position.z = this.hz; this.head.position.x = this.hx;
    this.fan.rotation.z += (nozzle > 0 ? 40 : 2) * dt;
    this.nozzleGlow.color.setRGB(0.2 + nozzle * 2.0, 0.08 + nozzle * 0.6, 0.03);
    this.doorK = damp(this.doorK, doors, 5, dt);
    this.doors[0].rotation.y = -this.doorK * 1.7; this.doors[1].rotation.y = this.doorK * 1.7;
    this.hatchK = damp(this.hatchK, hatch, 6, dt);
    this.trayHatch.rotation.x = this.hatchK * 1.1;
    // the light: the work strip, a cure flash, the lamps
    this.cure = j?.phase === 'cure' ? this.cure : damp(this.cure, 0, 6, dt);
    this.inner.intensity = 1.0 + this.cure * 2.2 + (j?.phase === 'print' ? 0.25 : 0);
    this.inner.color.setRGB(1, 0.94 + this.cure * 0.06, 0.85 + this.cure * 0.15);
    const L = this.lamps;
    L[0].color.setRGB(0.15, 1.6, 0.4);
    L[1].color.setRGB(j && j.phase !== 'end' ? 2 : 0.15, j && j.phase !== 'end' ? 1.0 : 0.1, 0.05).multiplyScalar(j && Math.sin(t * 8) > 0 ? 1 : 0.6);
    L[2].color.setRGB(spools().length ? 1.8 : 0.4, spools().length ? 1.3 : 0.05, 0.1);
    // the spool in use turns while it prints; the Bowden tube runs from it to the head
    const sp = j ? this.spoolOf(j.color) : this.rackSpools[0]?.s ?? null;
    if (sp && j?.phase === 'print') sp.group.rotation.z -= dt * 3;
    if (sp && (this.bw++ % 2 === 0 || !this.bowden.geometry.attributes.position)) {
      const a = sp.group.position.clone().add(new THREE.Vector3(0, 0, 0.05));
      const hp = new THREE.Vector3(this.hx, RAIL_Y + 0.05, this.hz + 0.02);
      const pts = [a, new THREE.Vector3(a.x * 0.6, 1.55, 0.06), new THREE.Vector3(0, 1.49, 0.0), new THREE.Vector3((hp.x) * 0.5, 1.42, hp.z * 0.5), hp];
      this.bowden.geometry.dispose();
      this.bowden.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.006, 5, false);
    }
    this.bowden.visible = !!sp;
  }
}
