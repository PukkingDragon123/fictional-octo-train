// THE OPERATING TABLE. A cyberpunk-industrial surgery bay rendered by the
// game's own HumanRig and world materials at low resolution through a private
// WebGL context: wet grated floor, neon tubes, a ring lamp over a steel slab,
// two floor-bolted robot arms (a bone saw; a bolt driver with grippers), a
// ceiling gantry that carries the subject in, a kidney tray for what comes
// off, a parts rack and a vitals monitor. swap() plays the real thing: the saw
// comes down on the joint, blood sprays, the limb drops into the tray, the
// driver brings the hardware in and bolts it on in a shower of sparks.
// Used by the intake (src/ui/surgery/surgery.ts) and, from the player's own
// eyes, by field surgery in a run (src/ui/surgery/field.ts).
import * as THREE from 'three';
import { HumanRig, Appearance, Outfit, Pose, createPreviewRig } from '../../entities/humanRig';
import type { RigCondition } from '../../entities/humanRig';
import type { BoneName } from '../../entities/humanModel';
import { U, worldMaterial } from '../../gfx/materials';
import { ModelBuilder } from '../../gfx/modelBuilder';
import { limbItemModel } from '../../entities/limbGear';
import { CT, loosePartGeo, shapes, smoothNormals } from '../../entities/cyberGear';
import { CyberSlot, SLOT_KIND, SLOT_COVERS, cyberDef, CYBER_SLOTS } from '../../survival/cyberParts';
import type { StumpCond } from '../../survival/limbs';
import { csfx, csfxLoop } from './audio';
import { fontsReady, cssFont } from '../../gfx/crt';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { metalMat, type MetalKind } from '../../craft/metal';

export type Pick = CyberSlot | 'brain';
export type CyberLoad = Partial<Record<CyberSlot, string>>;

const TABLE_Y = 0.9;
const ease = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t));
const easeOut = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt));
/** a physically based metal from the craft kit, re-lit by this stage's own environment */
export function pbr(kind: MetalKind): THREE.MeshStandardMaterial { const m = metalMat(kind).clone(); m.envMap = null; return m; }
const _ndc = new THREE.Vector2();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3();

function gfxQuality(): 'low' | 'high' {
  let q = 'auto';
  try { q = JSON.parse(localStorage.getItem('noclip.gfx') || '{}').quality || 'auto'; } catch { /* default */ }
  if (q === 'auto') return matchMedia('(pointer: coarse)').matches ? 'low' : 'high';
  return q === 'low' ? 'low' : 'high';
}

// ------------------------------------------------------------------ particles (blood stays where it lands)
class Bits {
  mesh: THREE.InstancedMesh;
  n = 0;
  private p: Float32Array; private v: Float32Array; private life: Float32Array; private size: Float32Array; private rest: Uint8Array;
  private col = new THREE.Color();
  constructor(private cap: number, emissive: boolean, private grav = 9.8) {
    // round drops (low-poly spheres), so blood and sparks are never little cubes; resting drops squash into round splats
    const mb = new ModelBuilder();
    mb.sphere(0, 0, 0, 0.5, 6, 4, 'white', { emissive: emissive ? 1.2 : 0 });
    this.mesh = new THREE.InstancedMesh(smoothNormals(mb.build()), worldMaterial({ noVis: true, noFog: true, noGrid: true, outline: 0 }), cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, this.col.set(0xffffff));
    this.mesh.count = 0; this.mesh.frustumCulled = false;
    this.p = new Float32Array(cap * 3); this.v = new Float32Array(cap * 3); this.life = new Float32Array(cap); this.size = new Float32Array(cap); this.rest = new Uint8Array(cap);
  }
  add(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, life: number, col: number) {
    let i = this.n;
    if (i >= this.cap) i = (Math.random() * this.cap) | 0; else this.n++;
    this.p.set([x, y, z], i * 3); this.v.set([vx, vy, vz], i * 3);
    this.life[i] = life; this.size[i] = size; this.rest[i] = 0;
    this.mesh.setColorAt(i, this.col.set(col));
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  update(dt: number) {
    const P = this.p, V = this.v;
    for (let i = 0; i < this.n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        const j = --this.n;
        if (i !== j) {
          P[i * 3] = P[j * 3]; P[i * 3 + 1] = P[j * 3 + 1]; P[i * 3 + 2] = P[j * 3 + 2];
          V[i * 3] = V[j * 3]; V[i * 3 + 1] = V[j * 3 + 1]; V[i * 3 + 2] = V[j * 3 + 2];
          this.life[i] = this.life[j]; this.size[i] = this.size[j]; this.rest[i] = this.rest[j];
          this.mesh.getColorAt(j, this.col); this.mesh.setColorAt(i, this.col);
          if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
        }
        i--; continue;
      }
      if (this.rest[i]) continue;
      V[i * 3 + 1] -= this.grav * dt;
      const k = Math.exp(-0.6 * dt);
      V[i * 3] *= k; V[i * 3 + 2] *= k;
      P[i * 3] += V[i * 3] * dt; P[i * 3 + 1] += V[i * 3 + 1] * dt; P[i * 3 + 2] += V[i * 3 + 2] * dt;
      const x = P[i * 3], z = P[i * 3 + 2];
      const onTable = Math.abs(x) < 1.08 && Math.abs(z) < 0.38;
      const floor = onTable && P[i * 3 + 1] > TABLE_Y - 0.05 ? TABLE_Y + 0.004 : 0.004;
      if (P[i * 3 + 1] <= floor) {
        P[i * 3 + 1] = floor;
        if (this.grav < 8) { this.life[i] = Math.min(this.life[i], 0.12); V[i * 3 + 1] *= -0.3; }
        else { this.rest[i] = 1; this.size[i] *= 1.8; }
      }
    }
    const m = this.mesh;
    for (let i = 0; i < this.n; i++) {
      const s = this.size[i];
      _s.set(s * (this.rest[i] ? 1.6 : 1), this.rest[i] ? s * 0.12 : s, s * (this.rest[i] ? 1.6 : 1));
      _m.compose(_v.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]), _q.identity(), _s);
      m.setMatrixAt(i, _m);
    }
    m.count = this.n;
    m.instanceMatrix.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ a floor-bolted robot arm (two-link IK, tool on a wrist)
const L1 = 0.92, L2 = 0.86, BASE_H = 0.62;
class RobotArm {
  root = new THREE.Group();
  private yaw = new THREE.Group(); private sh = new THREE.Group(); private el = new THREE.Group(); private wr = new THREE.Group();
  tool = new THREE.Group();
  /** spinning part of the tool (saw disc / driver bit) */
  spin = new THREE.Group();
  fingers: THREE.Group[] = [];
  tip = new THREE.Object3D();
  target = new THREE.Vector3();
  cur = new THREE.Vector3();
  pitch = -Math.PI / 2;
  spinRate = 0;
  constructor(mat: THREE.Material, chrome: THREE.Material, glow: number, kind: 'saw' | 'driver', toolLen: number) {
    const part = (fn: (mb: ModelBuilder, cm: ModelBuilder) => void) => {
      const mb = new ModelBuilder(), cm = new ModelBuilder();
      fn(mb, cm);
      const g = new THREE.Group();
      for (const [b, m] of [[mb, mat], [cm, chrome]] as const) if (!b.isEmpty) { const me = new THREE.Mesh(smoothNormals(b.build()), m); me.castShadow = true; g.add(me); }
      return g;
    };
    const { hull, lump, capsule } = shapes;
    const paint = { sides: CT.mint, top: CT.mint, bottom: CT.black };
    /** a link along +x from 0 to len: a riveted, tapered hull with a rounded nose */
    const link = (mb: ModelBuilder, len: number, w: number, d: number, y: number) => {
      mb.push().translate(0, y, 0).rotateZ(-Math.PI / 2);
      hull(mb, 0, len, 0, 0, w, d, CT.mint, { taper: 1.12 });
      mb.pop();
      lump(mb, len, y, 0, w * 0.42, w * 0.5, d * 0.5, CT.mint);
      for (let i = 0; i < Math.floor(len / 0.15); i++) for (const z of [-d / 2 - 0.002, d / 2 + 0.002]) lump(mb, 0.1 + i * 0.15, y + w * 0.3, z, 0.007, 0.007, 0.004, CT.brass);
    };
    // base and turret: a lathed pedestal with a gauge, chrome bolts round the foot
    this.root.add(part((mb, cm) => {
      mb.cylinder(0, 0, 0, 0.32, 0.06, 16, { sides: CT.hazard, top: CT.steel, bottom: CT.steel }, { fit: true, rTop: 0.3 });
      mb.cylinder(0, 0.06, 0, 0.21, 0.36, 14, { sides: CT.mint, top: CT.steel, bottom: CT.steel }, { fit: true, rTop: 0.17 });
      lump(mb, 0, 0.42, 0, 0.17, 0.04, 0.17, CT.mint);
      mb.push().translate(0, 0.24, 0.185).rotateX(-0.1); mb.cylinderZ(0, 0, 0, 0.06, 0.02, 14, { sides: CT.brass, top: CT.gauge, bottom: CT.brass }, { fit: true }); mb.pop();
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; lump(cm, Math.cos(a) * 0.27, 0.07, Math.sin(a) * 0.27, 0.018, 0.012, 0.018, CT.chrome); }
    }));
    this.yaw.position.y = 0.44;
    this.root.add(this.yaw);
    this.yaw.add(part((mb) => {
      mb.cylinder(0, 0, 0, 0.19, 0.08, 14, paint, { fit: true });
      mb.cylinder(0, 0.08, 0, 0.16, 0.12, 14, { sides: CT.mint, top: CT.mint, bottom: CT.mint }, { fit: true, rTop: 0.12 });
      for (const z of [-0.12, 0.12]) { mb.push().translate(0, 0.18, z); mb.cylinderZ(0, 0, 0, 0.1, 0.05, 14, { sides: CT.mint, top: CT.steel, bottom: CT.steel }, { fit: true }); mb.pop(); }
      lump(mb, 0.08, 0.13, 0.15, 0.014, 0.014, 0.01, CT.glow, { color: glow, emissive: 1.6 });
      lump(mb, -0.06, 0.13, 0.15, 0.016, 0.016, 0.01, CT.brass);
    }));
    this.sh.position.y = BASE_H - 0.44;
    this.yaw.add(this.sh);
    this.sh.add(part((mb, cm) => {
      mb.cylinderZ(0, 0, 0, 0.13, 0.2, 16, { sides: CT.black, top: CT.steel, bottom: CT.steel }, { fit: true });
      for (const z of [-0.105, 0.105]) cm.cylinderZ(0, 0, z, 0.06, 0.02, 14, { sides: CT.chrome, top: CT.chrome, bottom: CT.chrome }, { fit: true });
      link(mb, L1, 0.16, 0.19, -0.02);
      mb.cylinderX(L1 * 0.45, 0.075, 0.0, 0.02, 0.6, 8, { sides: CT.hose, top: CT.brass, bottom: CT.brass }, { fit: true });
      cm.cylinderX(L1 * 0.5, 0.02, 0.07, 0.026, 0.36, 12, { sides: CT.chrome, top: CT.brass, bottom: CT.brass }, { fit: true });
      cm.cylinderX(L1 * 0.28, 0.02, 0.07, 0.034, 0.1, 12, { sides: CT.black, top: CT.brass, bottom: CT.brass }, { fit: true });
    }));
    this.el.position.x = L1;
    this.sh.add(this.el);
    this.el.add(part((mb, cm) => {
      mb.cylinderZ(0, 0, 0, 0.1, 0.17, 16, { sides: CT.black, top: CT.steel, bottom: CT.steel }, { fit: true });
      for (const z of [-0.09, 0.09]) cm.cylinderZ(0, 0, z, 0.045, 0.016, 14, { sides: CT.chrome, top: CT.chrome, bottom: CT.chrome }, { fit: true });
      link(mb, L2, 0.12, 0.13, -0.01);
      cm.cylinderX(L2 * 0.5, 0.07, 0, 0.02, L2 * 0.7, 12, { sides: CT.chrome, top: CT.chrome, bottom: CT.chrome }, { fit: true });
    }));
    this.wr.position.x = L2;
    this.el.add(this.wr);
    this.wr.add(part((mb, cm) => {
      lump(mb, 0, 0, 0, 0.075, 0.075, 0.08, CT.black);
      mb.cylinderX(0.08, 0, 0, 0.055, 0.12, 14, { sides: CT.steel, top: CT.steel, bottom: CT.steel }, { fit: true });
      cm.cylinderX(0.145, 0, 0, 0.06, 0.012, 14, { sides: CT.chrome, top: CT.chrome, bottom: CT.chrome }, { fit: true });
    }));
    this.tool.position.x = 0.14;
    this.wr.add(this.tool);
    if (kind === 'saw') {
      this.tool.add(part((mb) => {
        mb.push().rotateZ(-Math.PI / 2);
        hull(mb, 0, toolLen * 0.82, 0, 0, 0.085, 0.085, CT.black, { taper: 1.15 });
        mb.pop();
        // the blade guard: a hazard-striped half-shroud over the disc
        mb.push().translate(toolLen * 0.85, 0.012, 0);
        mb.cylinder(0, 0, 0, 0.175, 0.03, 16, { sides: CT.hazard, top: CT.hazard, bottom: CT.black }, { fit: true });
        mb.pop();
        mb.cylinderX(toolLen * 0.3, 0.06, 0, 0.035, 0.18, 12, { sides: CT.black, top: CT.brass, bottom: CT.brass }, { fit: true });
        lump(mb, toolLen * 0.3 + 0.09, 0.06, 0, 0.02, 0.035, 0.035, CT.brass);
      }));
      this.spin.position.set(toolLen * 0.85, -0.012, 0);
      this.spin.add(part((mb, cm) => {
        // the disc turns about the tool's y, so it faces whoever watches the arm come down
        cm.cylinder(0, -0.004, 0, 0.16, 0.008, 24, { sides: CT.steel, top: CT.chrome, bottom: CT.chrome }, { fit: true });
        for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; mb.push().translate(Math.cos(a) * 0.163, -0.004, Math.sin(a) * 0.163).rotateY(-a + 0.6); mb.cylinder(0, 0, 0, 0.009, 0.008, 3, { sides: CT.steel, top: CT.steel, bottom: CT.steel }, { fit: true }); mb.pop(); }
        mb.cylinder(0, -0.02, 0, 0.035, 0.04, 12, { sides: CT.black, top: CT.brass, bottom: CT.black }, { fit: true });
      }));
      this.tool.add(this.spin);
      this.tip.position.set(toolLen * 0.85 + 0.16, 0, 0);
    } else {
      this.tool.add(part((mb) => {
        mb.push().rotateZ(-Math.PI / 2);
        hull(mb, 0, toolLen * 0.7, 0, 0, 0.1, 0.12, CT.black, { taper: 1.1 });
        mb.pop();
        lump(mb, toolLen * 0.5, 0.06, 0, 0.06, 0.025, 0.05, CT.black);
        lump(mb, toolLen * 0.45, 0.085, 0, 0.012, 0.012, 0.012, CT.glow, { color: glow, emissive: 1.6 });
      }));
      this.spin.position.set(toolLen * 0.75, 0, 0);
      this.spin.add(part((mb, cm) => { cm.cylinderX(0.06, 0, 0, 0.012, 0.14, 10, { sides: CT.chrome, top: CT.chrome, bottom: CT.chrome }, { fit: true }); lump(mb, 0.13, 0, 0, 0.012, 0.012, 0.012, CT.glow, { color: 0xffffff, emissive: 2 }); }));
      this.tool.add(this.spin);
      for (const k of [-1, 1]) {
        const f = new THREE.Group();
        f.position.set(toolLen * 0.62, 0, k * 0.07);
        // a jointed claw finger: two capsules and a rubber pad
        f.add(part((mb) => {
          mb.push().rotateZ(-Math.PI / 2); capsule(mb, 0, 0.12, 0.0, 0, 0.016, CT.steel); mb.pop();
          mb.push().translate(0.12, 0, 0).rotateZ(-Math.PI / 2); capsule(mb, 0, 0.1, 0.0, -k * 0.012, 0.013, CT.steel); mb.pop();
          lump(mb, 0.21, 0, -k * 0.022, 0.022, 0.02, 0.012, CT.rust);
        }));
        this.tool.add(f);
        this.fingers.push(f);
      }
      this.tip.position.set(toolLen * 0.75 + 0.2, 0, 0);
    }
    this.tool.add(this.tip);
  }
  /** IK toward the current target (tool tip at the target, tool at this.pitch below horizontal) */
  solve(dt: number, k = 6) {
    this.cur.x = damp(this.cur.x, this.target.x, k, dt); this.cur.y = damp(this.cur.y, this.target.y, k, dt); this.cur.z = damp(this.cur.z, this.target.z, k, dt);
    this.root.updateWorldMatrix(true, false);
    const local = _v.copy(this.cur);
    this.root.worldToLocal(local);
    const toolReach = this.tip.position.x + 0.14;
    // wrist sits back along the tool's pitch from the tip
    const wx = local.x, wz = local.z;
    const yaw = Math.atan2(-wz, wx);
    this.yaw.rotation.y = yaw;
    const r = Math.hypot(wx, wz) - Math.cos(this.pitch) * toolReach;
    const y = local.y - Math.sin(this.pitch) * toolReach - BASE_H;
    const D = Math.min(L1 + L2 - 0.01, Math.max(Math.abs(L1 - L2) + 0.05, Math.hypot(r, y)));
    const c2 = (D * D - L1 * L1 - L2 * L2) / (2 * L1 * L2);
    const a2 = -Math.acos(Math.max(-1, Math.min(1, c2)));
    const a1 = Math.atan2(y, r) + Math.atan2(L2 * Math.sin(-a2), L1 + L2 * Math.cos(a2));
    this.sh.rotation.z = a1; this.el.rotation.z = a2; this.wr.rotation.z = this.pitch - a1 - a2;
    this.spin.rotation[this.fingers.length ? 'x' : 'y'] += this.spinRate * dt;
  }
  grip(open: number) { this.fingers.forEach((f, i) => { f.rotation.y = (i ? 1 : -1) * (0.15 + open * 0.5); }); }
  tipWorld(out = new THREE.Vector3()) { this.tip.updateWorldMatrix(true, false); return this.tip.getWorldPosition(out); }
}

// ------------------------------------------------------------------ the stage
interface Loose { mesh: THREE.Mesh; v: THREE.Vector3; spin: THREE.Vector3; t: number; tray: boolean; life: number }

export class SurgeryStage {
  canvas = document.createElement('canvas');
  renderer: THREE.WebGLRenderer | null = null;
  rig: HumanRig | null = null;
  mode: 'intake' | 'field';
  busy = false;
  /** 0..1 heart-rate excitement (monitor) */
  stress = 0.15;
  onHover?: (p: Pick | null) => void;
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(34, 1, 0.05, 40);
  private mat = worldMaterial({ noVis: true, noFog: true, noGrid: true });
  private chromeMat = pbr('chrome');
  private steelMat = pbr('steel');
  /** the instruments' layer: rendered at full resolution over the pixel-rendered room */
  fg = new THREE.Scene();
  fgCam = new THREE.PerspectiveCamera(30, 1, 0.05, 30);
  /** per-frame hook for the instruments */
  onFrame?: (dt: number) => void;
  /** a click: on an instrument (id + hit), else on the subject (pick) */
  onClick?: (id: string | null, hit: THREE.Intersection | null, pick: Pick | null) => void;
  onFgHover?: (id: string | null, hit: THREE.Intersection | null) => void;
  private fgRay = new THREE.Raycaster();
  private fgHoverId: string | null = null;
  private env: THREE.Texture | null = null;
  private glowMat = worldMaterial({ noVis: true, noFog: true, noGrid: true, unlit: true });
  private rt: THREE.WebGLRenderTarget | null = null;
  /** the graded picture, still at low resolution; one nearest-neighbour copy blows it up to the canvas */
  private rt2: THREE.WebGLRenderTarget | null = null;
  private blit: { scene: THREE.Scene; mat: THREE.MeshBasicMaterial } | null = null;
  private post: { scene: THREE.Scene; cam: THREE.OrthographicCamera; mat: THREE.ShaderMaterial } | null = null;
  private saw: RobotArm; private driver: RobotArm;
  private gantry = new THREE.Group(); private trolley = new THREE.Group(); private claw = new THREE.Group(); private clawFingers: THREE.Group[] = [];
  private straps: THREE.Mesh[] = [];
  private lamp: THREE.SpotLight; private alarm: THREE.PointLight; private weld: THREE.PointLight;
  /** a hand lamp that swings over whatever part the pointer is on */
  private inspect = new THREE.PointLight(0xffe0a0, 0, 0.9, 1.6);
  private blood: Bits; private sparks: Bits;
  private loose: Loose[] = [];
  private monitor: { cv: HTMLCanvasElement; ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture; t: number; x: number; last: number } ;
  private sign: THREE.Mesh | null = null;
  private app: Appearance | null = null;
  private outfit: Outfit = {};
  load: CyberLoad = {};
  sev: string[] = [];
  private stump: Record<string, StumpCond> = {};
  private t = 0; private last = 0; private raf = 0;
  private lowW = 0; private lowH = 0;
  private ro: ResizeObserver;
  private host: HTMLElement;
  private quality: 'low' | 'high';
  // camera
  private camPos = new THREE.Vector3(0.75, 2.35, 2.25); private camAt = new THREE.Vector3(0.05, 0.92, 0.05);
  private camPosT = new THREE.Vector3(0.75, 2.35, 2.25); private camAtT = new THREE.Vector3(0.05, 0.92, 0.05);
  private shakeT = 0; private flash = 0; private hurt = 0;
  // cinematography: spring dollies, a focus pull on whatever is framed, punches and hit-stops on the cuts, letterbox bars
  private camVel = new THREE.Vector3(); private atVel = new THREE.Vector3();
  private punchK = 0; private stopT = 0; private bars = 0; private baseFov = 34;
  /** field mode: 0..1 how far the view has come in (synced to the game's first-person cut) */
  entrance = 1;
  /** a hit: camera punch, a beat of frozen time, a little flash */
  impact(k: number, stopMs = 0) { this.punchK = Math.max(this.punchK, k); this.stopT = Math.max(this.stopT, stopMs / 1000); this.flash = Math.max(this.flash, k * 0.12); this.shake(k * 0.5); }
  // subject placement and pose
  private subj = new THREE.Group();
  private lying = 1;
  private hang = 0;
  private twitch: { bone: string; t: number; amp: number }[] = [];
  private flex: Record<string, number> = {};
  private hoverP: Pick | null = null; selected: Pick | null = null;
  private beat = 0;
  private trayPos = new THREE.Vector3(0.15, 0.82, 0.86);

  constructor(host: HTMLElement, mode: 'intake' | 'field' = 'intake') {
    this.host = host; this.mode = mode;
    this.canvas.className = 'sg-cv';
    host.append(this.canvas);
    this.quality = gfxQuality();
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, alpha: false, powerPreference: this.quality === 'low' ? 'low-power' : 'default' });
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, gfxQuality() === 'low' ? 1.25 : 1.75));
      if (this.quality !== 'low') { this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFShadowMap; }
      // a small prefiltered room for metal and glass reflections (this context's own)
      const pm = new THREE.PMREMGenerator(this.renderer);
      this.env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
      pm.dispose();
      // (not scene.environment for the room: three applies that to Lambert too and it would wash the pixel art out)
      for (const m of [this.chromeMat, this.steelMat]) { m.envMap = this.env; m.needsUpdate = true; }
      this.fg.environment = this.env;
    } catch (e) { console.warn('surgery renderer unavailable', e); this.renderer = null; }
    this.scene.background = new THREE.Color(0x0c0a08);
    this.scene.fog = new THREE.Fog(0x0c0a08, 6, 12);
    this.saw = new RobotArm(this.mat, this.chromeMat, 0xff3020, 'saw', 0.36);
    this.driver = new RobotArm(this.mat, this.chromeMat, 0x60ff60, 'driver', 0.3);
    this.saw.root.position.set(-0.55, 0, -1.25);
    this.driver.root.position.set(0.75, 0, -1.25);
    this.restArms(true);
    this.lamp = new THREE.SpotLight(0xfff2e0, 11, 6, 0.62, 0.6, 1.2);
    this.alarm = new THREE.PointLight(0xff3018, 0, 7, 1.6);
    this.weld = new THREE.PointLight(0xfff0c0, 0, 3.5, 1.8);
    this.blood = new Bits(this.quality === 'low' ? 260 : 520, false);
    this.sparks = new Bits(this.quality === 'low' ? 120 : 240, true, 6);
    this.monitor = this.makeMonitor();
    this.buildRoom();
    this.scene.add(this.saw.root, this.driver.root, this.subj, this.blood.mesh, this.sparks.mesh);
    this.bindInput();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  // ---------------------------------------------------------------- the room
  private buildRoom() {
    // a 1950s municipal theatre the Institute never finished paying for: mint tile to shoulder height,
    // cream paint above, a terrazzo floor with a drain, tungsten light, chrome, bakelite and riveted steel
    const mb = new ModelBuilder(), cm = new ModelBuilder(), sm = new ModelBuilder();
    const W = 3.4, D0 = -2.0, D1 = 3.6, H = 3.1;
    mb.box(0, -0.05, (D0 + D1) / 2, W * 2, 0.05, D1 - D0, { top: 'terrazzo', sides: 'concrete' }, { color: 0xb8b0a0 });
    mb.box(0.05, 0.0, 0, 0.5, 0.008, 0.5, 'grate', { color: 0x6a6a62 });
    mb.box(0, 0, D0 - 0.05, W * 2, 1.4, 0.1, { south: 'tile_white', all: 'concrete' }, { color: 0xa8d4bc });
    mb.box(0, 1.4, D0 - 0.05, W * 2, H - 1.4, 0.1, { south: 'concrete_b', all: 'concrete' }, { color: 0xd8ccb0 });
    mb.box(0, 1.38, D0 + 0.0, W * 2, 0.06, 0.04, CT.mint, {});
    for (const k of [-1, 1]) {
      mb.box(k * W, 0, (D0 + D1) / 2, 0.1, 1.4, D1 - D0, { east: 'tile_white', west: 'tile_white', all: 'concrete' }, { color: 0xa8d4bc });
      mb.box(k * W, 1.4, (D0 + D1) / 2, 0.1, H - 1.4, D1 - D0, { east: 'concrete_b', west: 'concrete_b', all: 'concrete' }, { color: 0xc8bca0 });
    }
    mb.box(0, H, (D0 + D1) / 2, W * 2, 0.06, D1 - D0, 'concrete_b', { color: 0x8a8274 });
    // pipes along the back wall, painted and lagged, with valve wheels
    for (let i = 0; i < 3; i++) mb.cylinderX(0, 2.3 + i * 0.16, D0 + 0.12, 0.05, W * 2, 8, { sides: i === 1 ? 'metal_painted_green' : CT.pipe, top: CT.steel, bottom: CT.steel }, {});
    for (const x of [-1.6, 1.9]) { mb.cylinderZ(x, 2.46, D0 + 0.22, 0.09, 0.02, 10, { sides: 'metal_rusty', top: 'metal_rusty', bottom: 'metal_rusty' }, { fit: true, color: 0xb02020 }); }
    // the operating table: mint enamel pedestal, chrome top, a drain lip
    mb.cylinder(0.05, 0, 0, 0.3, 0.08, 12, { sides: CT.mint, top: CT.mint, bottom: CT.steel }, { fit: true });
    cm.cylinder(0.05, 0.08, 0, 0.16, TABLE_Y - 0.2, 10, { sides: CT.chrome, top: CT.steel, bottom: CT.steel }, { fit: true });
    shapes.rbox(mb, 0.05, TABLE_Y - 0.26, 0, 0.6, 0.12, 0.4, 0.06, CT.mint);
    cm.cylinderZ(0.36, TABLE_Y - 0.2, 0.21, 0.05, 0.02, 10, { sides: CT.chrome, top: CT.chrome, bottom: CT.chrome }, { fit: true });
    shapes.rbox(sm, 0, TABLE_Y - 0.12, 0, 2.18, 0.08, 0.72, 0.12, 'metal_brushed');
    shapes.rbox(cm, 0, TABLE_Y - 0.04, 0, 2.12, 0.04, 0.68, 0.11, 'metal_brushed', { color: 0xd0d4d8 });
    for (const z of [-0.37, 0.37]) cm.box(0, TABLE_Y - 0.06, z, 2.14, 0.05, 0.02, CT.chrome, { fit: true });
    // the kidney tray on a chrome stand
    const T = this.trayPos;
    cm.cylinder(T.x, 0, T.z, 0.03, T.y - 0.05, 6, { sides: CT.chrome, top: CT.chrome, bottom: CT.chrome }, { fit: true });
    cm.cylinder(T.x, 0, T.z, 0.22, 0.03, 8, { sides: CT.chrome, top: CT.steel, bottom: CT.steel }, { fit: true });
    shapes.rbox(mb, T.x, T.y - 0.05, T.z, 0.95, 0.03, 0.42, 0.14, CT.steel);
    for (const [x, z, w, d] of [[0, 0.2, 0.95, 0.02], [0, -0.2, 0.95, 0.02], [0.47, 0, 0.02, 0.42], [-0.47, 0, 0.02, 0.42]]) cm.box(T.x + x, T.y - 0.02, T.z + z, w, 0.07, d, CT.chrome, { fit: true });
    // the parts rack: a pegboard on the back wall
    mb.box(-2.4, 0.95, D0 + 0.02, 1.5, 1.1, 0.03, 'wood_trim', { color: 0x8a7a5a });
    mb.box(-2.4, 0.85, D0 + 0.18, 1.5, 0.04, 0.3, CT.steel, {});
    // the instrument wall: a riveted panel of gauges and toggles
    mb.box(1.85, 1.05, D0 + 0.02, 1.3, 0.75, 0.06, CT.mint, {});
    for (let i = 0; i < 4; i++) mb.box(1.35 + i * 0.33, 1.42, D0 + 0.055, 0.24, 0.24, 0.01, CT.gauge, { fit: true });
    for (let i = 0; i < 8; i++) { mb.box(1.32 + i * 0.12, 1.14, D0 + 0.055, 0.05, 0.08, 0.012, 'metal_grey', { fit: true }); cm.box(1.32 + i * 0.12, 1.2, D0 + 0.07, 0.012, 0.035, 0.03, CT.chrome, { fit: true }); }
    // the vitals CRT on a trolley: bakelite cabinet, cream bezel, two knobs
    cm.box(-1.65, 0, 0.55, 0.06, 1.25, 0.06, CT.chrome, {});
    shapes.rbox(mb, -1.65, 0.0, 0.55, 0.5, 0.05, 0.4, 0.06, CT.mint);
    shapes.rbox(mb, -1.65, 1.25, 0.55, 0.62, 0.5, 0.44, 0.07, CT.black);
    mb.push().translate(-1.65, 1.25, 0.55).rotateY(0.35);
    mb.box(0, 0.04, 0.22, 0.58, 0.42, 0.03, CT.shell, { fit: true });
    for (const x of [-0.2, 0.2]) mb.cylinderZ(x, 0.1, 0.25, 0.03, 0.03, 8, { sides: CT.black, top: CT.brass, bottom: CT.brass }, { fit: true });
    mb.pop();
    // ceiling gantry: a riveted I-beam with a chain hoist
    mb.box(-0.6, H - 0.2, 0, 6.0, 0.14, 0.08, CT.steel, { fit: false });
    mb.box(-0.6, H - 0.22, 0, 6.0, 0.02, 0.2, CT.steel, { fit: false });
    mb.box(-0.6, H - 0.08, 0, 6.0, 0.02, 0.2, CT.steel, { fit: false });
    // the theatre lamp: a chrome dome on a counterweighted arm
    cm.cylinder(0.05, 2.28, 0, 0.5, 0.14, 14, { sides: CT.chrome, top: CT.chrome, bottom: CT.steel }, { fit: true, rTop: 0.28 });
    cm.cylinder(0.05, 2.42, 0, 0.04, H - 2.42, 6, { sides: CT.chrome, top: CT.chrome, bottom: CT.chrome }, { fit: true });
    cm.cylinderX(0.05, 2.5, 0, 0.03, 0.9, 6, { sides: CT.chrome, top: CT.chrome, bottom: CT.chrome }, { fit: true });
    mb.cylinder(0.5, 2.38, 0, 0.08, 0.14, 8, { sides: CT.black, top: CT.black, bottom: CT.black }, { fit: true });
    const room = new THREE.Mesh(smoothNormals(mb.build()), this.mat);
    room.receiveShadow = true;
    this.scene.add(room);
    // the chrome and the brushed steel get real metal (lit by a prefiltered room)
    for (const [b, m] of [[cm, this.chromeMat], [sm, this.steelMat]] as const) { const me = new THREE.Mesh(smoothNormals(b.build()), m); me.receiveShadow = true; me.castShadow = true; this.scene.add(me); }
    // tungsten: caged bulbs on the walls, the lamp's bulbs, pilot lamps, the IN USE box (unlit, they glow)
    const nb = new ModelBuilder();
    const bulb = (x: number, y: number, z: number) => {
      nb.box(x, y, z, 0.08, 0.1, 0.08, CT.glow, { color: 0xffd890, emissive: 1.5 });
      for (const k of [-1, 1]) { nb.box(x + k * 0.045, y - 0.01, z, 0.006, 0.13, 0.006, CT.steel, { fit: true }); nb.box(x, y - 0.01, z + k * 0.045, 0.006, 0.13, 0.006, CT.steel, { fit: true }); }
    };
    bulb(-1.2, 2.0, D0 + 0.1); bulb(0.6, 2.0, D0 + 0.1); bulb(-W + 0.1, 2.0, 0.6); bulb(W - 0.1, 2.0, -0.4);
    for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; nb.box(0.05 + Math.cos(a) * 0.32, 2.26, Math.sin(a) * 0.32, 0.1, 0.03, 0.1, CT.glow, { color: 0xfff0d0, emissive: 2 }); }
    nb.box(0.05, 2.255, 0, 0.12, 0.03, 0.12, CT.glow, { color: 0xffffff, emissive: 2 });
    for (let i = 0; i < 6; i++) nb.box(1.4 + i * 0.18, 0.9, D0 + 0.06, 0.03, 0.03, 0.02, CT.glow, { color: [0xff3020, 0x60ff60, 0xffb030][i % 3], emissive: 1.8 });
    const neon = new THREE.Mesh(nb.build(), this.glowMat);
    this.scene.add(neon);
    this.rack = new THREE.Group();
    this.rack.position.set(-3.0, 1.45, D0 + 0.12);
    this.scene.add(this.rack);
    // leather restraint straps across the slab (they buckle shut when the subject is down)
    for (const [x, hgt] of [[-0.22, 0.22], [0.4, 0.17], [0.78, 0.13]] as const) {
      const sb = new ModelBuilder();
      sb.box(0, hgt, 0, 0.065, 0.01, 0.64, { top: 'i_leather', sides: 'i_leather' }, { fit: true });
      for (const k of [-1, 1]) sb.box(0, 0, k * 0.322, 0.065, hgt + 0.008, 0.008, 'i_leather', { fit: true });
      sb.box(0, hgt + 0.008, 0.14, 0.075, 0.008, 0.05, CT.brass, { fit: true });
      sb.box(0, hgt + 0.012, 0.14, 0.012, 0.006, 0.03, CT.steel, { fit: true });
      const s = new THREE.Mesh(sb.build(), this.mat);
      s.position.set(x, TABLE_Y - 0.02, 0); s.scale.z = 0.01; s.visible = false;
      this.scene.add(s); this.straps.push(s);
    }
    // the vitals screen
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.33), new THREE.MeshBasicMaterial({ map: this.monitor.tex, fog: false }));
    scr.position.set(-1.65, 1.5, 0.55); scr.rotation.y = 0.35; scr.translateZ(0.24);
    this.scene.add(scr);
    // the IN USE lightbox over the door
    // a lightbox: red-lit glass with the words in an enamel-sign face
    const sc = document.createElement('canvas'); sc.width = 128; sc.height = 32;
    const sx = sc.getContext('2d')!;
    const paintSign = () => {
      const g = sx.createRadialGradient(64, 16, 4, 64, 16, 70); g.addColorStop(0, '#5a1208'); g.addColorStop(1, '#200604');
      sx.fillStyle = g; sx.fillRect(0, 0, 128, 32);
      sx.font = `600 22px ${cssFont('--font-sign', 'sans-serif')}`; sx.textAlign = 'center'; sx.textBaseline = 'middle';
      sx.shadowColor = '#ff6030'; sx.shadowBlur = 8; sx.fillStyle = '#ffb090'; sx.fillText('IN USE', 64, 17);
      st.needsUpdate = true;
    };
    const st = new THREE.CanvasTexture(sc); st.colorSpace = THREE.SRGBColorSpace;
    paintSign(); fontsReady().then(paintSign);
    this.sign = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.2, 0.08), [this.mat, this.mat, this.mat, this.mat, new THREE.MeshBasicMaterial({ map: st, fog: false }), this.mat]);
    this.sign.position.set(-0.4, 2.62, D0 + 0.06);
    this.scene.add(this.sign);
    // gantry: trolley on the beam, a chain hoist, a riveted claw
    this.trolley.position.set(-2.6, H - 0.24, 0);
    const tb = new ModelBuilder();
    shapes.rbox(tb, 0, -0.2, 0, 0.4, 0.2, 0.3, 0.06, CT.mint);
    for (const x of [-0.13, 0.13]) tb.cylinderZ(x, 0.0, 0, 0.05, 0.34, 12, { sides: CT.steel, top: CT.brass, bottom: CT.brass }, { fit: true });
    tb.cylinderZ(0, -0.1, 0, 0.09, 0.32, 10, { sides: CT.black, top: CT.brass, bottom: CT.brass }, { fit: true });
    for (let i = 0; i < 9; i++) tb.box(0, -0.3 - i * 0.075, 0, i % 2 ? 0.012 : 0.03, 0.07, i % 2 ? 0.03 : 0.012, CT.steel, { fit: true });
    this.trolley.add(new THREE.Mesh(smoothNormals(tb.build()), this.mat));
    this.claw.position.y = -1.0;
    const cb = new ModelBuilder();
    shapes.rbox(cb, 0, -0.08, 0, 0.36, 0.1, 0.16, 0.05, CT.mint);
    shapes.lump(cb, 0, 0.02, 0, 0.08, 0.04, 0.08, CT.mint);
    cb.box(0, -0.06, 0.081, 0.3, 0.06, 0.004, CT.hazard, { fit: true });
    this.claw.add(new THREE.Mesh(smoothNormals(cb.build()), this.mat));
    for (const k of [-1, 1]) {
      const f = new THREE.Group(); f.position.set(0, -0.08, k * 0.07);
      const fb = new ModelBuilder();
      shapes.hull(fb, 0, -0.1, -0.24, k * 0.06, 0.07, 0.03, CT.steel, { taper: 0.8 });
      shapes.lump(fb, 0, -0.1, k * 0.06, 0.03, 0.03, 0.03, CT.steel);
      shapes.capsule(fb, 0, -0.25, -0.25, k * 0.03, 0.02, CT.rust);
      f.add(new THREE.Mesh(smoothNormals(fb.build()), this.mat));
      this.claw.add(f); this.clawFingers.push(f);
    }
    this.trolley.add(this.claw);
    this.gantry.add(this.trolley);
    this.scene.add(this.gantry);
    // lights: tungsten key, a cool fill from the frosted window side, the wall bulbs
    this.scene.add(new THREE.AmbientLight(0x6a6458, 0.75));
    this.scene.add(new THREE.HemisphereLight(0xfff0d8, 0x2a2018, 0.45));
    const fill = new THREE.PointLight(0x9ac8ff, 4, 7, 1.5); fill.position.set(-2.6, 1.8, 1.4); this.scene.add(fill);
    const wall = new THREE.PointLight(0xffc070, 5, 6, 1.5); wall.position.set(1.2, 2.0, -1.5); this.scene.add(wall);
    this.lamp.position.set(0.05, 2.25, 0);
    this.lamp.target.position.set(0.05, 0, 0);
    if (this.quality !== 'low') { this.lamp.castShadow = true; this.lamp.shadow.mapSize.set(512, 512); this.lamp.shadow.bias = -0.002; }
    this.scene.add(this.lamp, this.lamp.target);
    this.alarm.position.set(-0.4, 2.5, -1.6); this.scene.add(this.alarm);
    this.scene.add(this.weld, this.inspect);
  }
  private rack!: THREE.Group;

  /** hang the hardware on the wall rack (available lit, locked dark) */
  setRack(parts: { key: string; slot: CyberSlot; unlocked: boolean }[]) {
    if (!this.rig) return;
    this.rack.clear();
    let i = 0;
    for (const p of parts) {
      if (i >= 6) break;
      const m = new THREE.Mesh(loosePartGeo(p.key, p.slot, this.rig.dims), this.mat);
      m.position.set(0.12 + i * 0.22, 0, 0);
      m.scale.setScalar(SLOT_KIND[p.slot] === 'leg' ? 0.85 : 1);
      if (!p.unlocked) m.material = worldMaterial({ noVis: true, noFog: true, noGrid: true, transparent: true, opacity: 0.3 });
      this.rack.add(m);
      i++;
    }
  }

  private makeMonitor() {
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 46;
    const ctx = cv.getContext('2d')!;
    ctx.fillStyle = '#020806'; ctx.fillRect(0, 0, 64, 46);
    const tex = new THREE.CanvasTexture(cv); tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
    return { cv, ctx, tex, t: 0, x: 0, last: 0 };
  }
  private drawMonitor(dt: number) {
    const M = this.monitor;
    M.t += dt;
    const bpm = 64 + this.stress * 110;
    this.beat += dt * bpm / 60;
    const ph = this.beat % 1;
    const y = ph < 0.06 ? -14 * Math.sin(ph / 0.06 * Math.PI) : ph < 0.1 ? 6 * Math.sin((ph - 0.06) / 0.04 * Math.PI) : ph > 0.3 && ph < 0.4 ? -3 * Math.sin((ph - 0.3) / 0.1 * Math.PI) : 0;
    const c = M.ctx;
    const steps = Math.max(1, Math.round(dt * 40));
    for (let i = 0; i < steps; i++) {
      M.x = (M.x + 1) % 64;
      c.fillStyle = '#020806'; c.fillRect(M.x, 0, 3, 34);
      c.fillStyle = this.stress > 0.7 ? '#ff4060' : '#40ff90';
      c.fillRect(M.x, 18 + Math.round(y), 1, 2);
    }
    if (M.t - M.last > 0.25) {
      M.last = M.t;
      c.fillStyle = '#020806'; c.fillRect(0, 34, 64, 12);
      c.fillStyle = this.stress > 0.7 ? '#ff4060' : '#40ff90';
      c.font = `8px ${cssFont('--font-crt')}`;
      c.fillText(`HR ${Math.round(bpm)}`, 2, 42);
      c.fillStyle = '#30ffe0'; c.fillText(`SpO2 ${Math.round(98 - this.stress * 9)}`, 32, 42);
    }
    if (ph < 0.05 && this.lastPh >= 0.05 && this.stress > 0.5) csfx('cy_beep', 0.25);
    this.lastPh = ph;
    M.tex.needsUpdate = true;
  }
  private lastPh = 0;

  // ---------------------------------------------------------------- the subject
  setSubject(app: Appearance, outfit: Outfit, load: CyberLoad = {}, sev: string[] = []) {
    this.app = app; this.outfit = outfit; this.load = { ...load }; this.sev = [...sev];
    for (const s of sev) this.stump[s] = { s: 'healed' };
    if (this.rig) { this.subj.remove(this.rig.root); this.rig.dispose(); }
    this.rig = createPreviewRig(app, outfit);
    this.rig.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    this.subj.add(this.rig.root);
    this.applyCond();
    this.placeSubject(1, 0);
  }
  private applyCond() {
    if (!this.rig) return;
    const cut = this.sev.filter((s) => !this.sev.includes(parentPart(s)));
    const stump: Record<string, StumpCond> = {};
    for (const c of cut) stump[c] = this.stump[c] ?? { s: 'healed' };
    const cond: RigCondition = { ...(this.outfit.cond || {}), sev: [...this.sev].sort(), stump, cyber: { ...this.load } as Record<string, string> };
    if (!this.sev.length) { delete cond.sev; delete cond.stump; }
    if (!Object.keys(this.load).length) delete cond.cyber;
    if (this.bleeding) cond.bleeding = { [this.bleeding]: 3 };
    const bl: Record<string, number> = { ...(cond.blood || {}) };
    for (const [k, v] of Object.entries(this.bloodOn)) if (v >= 1) bl[k] = Math.max(bl[k] ?? 0, Math.floor(v));
    if (Object.keys(bl).length) cond.blood = bl;
    this.rig.setOutfit({ ...this.outfit, cond });
    this.rig.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; } });
  }
  private bleeding = '';
  private bloodOn: Record<string, number> = {};
  private condT = 0;
  /** rebuild the rig's condition at most a few times a second (blood soaking in) */
  private applyCondSoon() { if (this.t - this.condT > 0.3) { this.condT = this.t; this.applyCond(); } }

  /** lying (1) or hanging from the claw (0); y lift above the slab */
  private placeSubject(lie: number, lift: number) {
    if (!this.rig) return;
    const qLie = _q.setFromRotationMatrix(_m.makeBasis(_v.set(0, 0, -1), _v2.set(-1, 0, 0), new THREE.Vector3(0, 1, 0)));
    const qUp = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    this.subj.quaternion.copy(qUp).slerp(qLie, lie);
    const hips = this.rig.dims.hipY;
    // standing it hangs from the claw under the trolley; lying, the back rests on the slab
    const lyingPos = new THREE.Vector3(1.0, TABLE_Y + 0.105 + lift, 0);
    const tp = this.trolley.position;
    const hangPos = new THREE.Vector3(tp.x, tp.y + this.claw.position.y - 0.2 - hips * 1.45, 0);
    this.subj.position.copy(hangPos).lerp(lyingPos, lie);
  }

  private pose(dt: number): Pose {
    const tw = (b: string) => { let a = 0; for (const t of this.twitch) if (t.bone === b || t.bone === '*') a += Math.sin(this.t * 47 + b.length) * t.amp * Math.min(1, t.t * 4); return a; };
    for (const t of this.twitch) t.t -= dt;
    this.twitch = this.twitch.filter((t) => t.t > 0);
    const hang = this.hang;
    const breath = Math.sin(this.t * (1.4 + this.stress * 2)) * 0.02;
    const fl = (k: string) => this.flex[k] ?? 0;
    const p: Pose = {
      chest: [breath + tw('chest') * 0.5, 0, 0], spine: [0, 0, 0],
      neck: [hang * 0.5 + tw('head') * 0.3, Math.sin(this.t * 0.3) * 0.15 * (1 - hang), 0], head: [hang * 0.3 + tw('head') * 0.4, tw('head') * 0.5, 0],
      uarmL: [hang * 0.1, 0, 0.18 + tw('uarmL') * 0.4 - hang * 0.15], uarmR: [hang * 0.1, 0, -0.18 - tw('uarmR') * 0.4 + hang * 0.15],
      farmL: [-0.15 - fl('farmL') + tw('farmL') * 0.5, 0, 0], farmR: [-0.15 - fl('farmR') + tw('farmR') * 0.5, 0, 0],
      handL: [tw('handL'), 0, 0], handR: [tw('handR'), 0, 0],
      thighL: [tw('thighL') * 0.3, 0, 0.04], thighR: [tw('thighR') * 0.3, 0, -0.04],
      shinL: [hang * 0.2 + fl('shinL') + Math.abs(tw('shinL')) * 0.4, 0, 0], shinR: [hang * 0.2 + fl('shinR') + Math.abs(tw('shinR')) * 0.4, 0, 0],
      footL: [0.4 * (1 - hang) - tw('footL'), 0, 0], footR: [0.4 * (1 - hang) - tw('footR'), 0, 0],
      gripL: 0.15 + fl('gripL') + Math.abs(tw('handL')), gripR: 0.15 + fl('gripR') + Math.abs(tw('handR')),
      blink: this.mode === 'field' ? 0 : this.stress > 0.6 ? 0 : Math.sin(this.t * 0.7) > 0.97 ? 1 : hang > 0.5 ? 0.85 : 0,
    };
    return p;
  }

  // ---------------------------------------------------------------- anchors
  /** world anchor of a pick target (for the DOM tags) */
  anchor(p: Pick, out = new THREE.Vector3()): THREE.Vector3 {
    const r = this.rig; if (!r) return out.set(0, 0, 0);
    r.root.updateMatrixWorld(true);
    const at = (b: BoneName, x: number, y: number, z: number) => out.set(x * r.s, y * r.s, z * r.s).applyMatrix4(r.bones[b].matrixWorld);
    switch (p) {
      case 'arm_l': return at('uarmL', 0, -0.2, 0); case 'arm_r': return at('uarmR', 0, -0.2, 0);
      case 'hand_l': return at('handL', 0, -0.06, 0); case 'hand_r': return at('handR', 0, -0.06, 0);
      case 'leg_l': return at('thighL', 0, -0.3, 0); case 'leg_r': return at('thighR', 0, -0.3, 0);
      case 'eyes': return at('head', 0, 0.1, 0.1); case 'jaw': return at('head', 0, 0.01, 0.08);
      case 'brain': return at('head', 0, 0.2, 0.0); case 'spine': return at('chest', 0, -0.05, -0.12); case 'skin': return at('chest', 0, 0.1, 0.1);
    }
    return out;
  }
  /** screen position (CSS px relative to the canvas) of a world point; null when behind the camera */
  toScreen(w: THREE.Vector3): { x: number; y: number } | null {
    const v = _v2.copy(w).project(this.cam);
    if (v.z > 1) return null;
    const r = this.canvas.getBoundingClientRect();
    return { x: (v.x * 0.5 + 0.5) * r.width, y: (-v.y * 0.5 + 0.5) * r.height };
  }
  /** nearest pick target to a screen point (CSS px relative to the canvas) */
  pickAt(x: number, y: number, maxPx = 56): Pick | null {
    if (!this.rig || this.busy) return null;
    let best: Pick | null = null, bd = maxPx;
    for (const p of [...CYBER_SLOTS, 'brain'] as Pick[]) {
      const s = this.toScreen(this.anchor(p, new THREE.Vector3()));
      if (!s) continue;
      const d = Math.hypot(s.x - x, s.y - y);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
  setHover(p: Pick | null) { this.hoverP = p; }
  select(p: Pick | null) { this.selected = p; this.focus(p); }

  private bindInput() {
    const local = (e: PointerEvent) => { const r = this.canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    this.canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      const l = local(e);
      const fh = this.fgHit(l.x, l.y);
      const id = fh ? fh.id : null;
      if (id !== this.fgHoverId || id) { this.fgHoverId = id; this.onFgHover?.(id, fh?.hit ?? null); }
      const p = fh ? null : this.pickAt(l.x, l.y, 46);
      if (p !== this.hoverP) { this.hoverP = p; this.onHover?.(p); }
      this.canvas.style.cursor = id || p ? 'pointer' : '';
    });
    this.canvas.addEventListener('pointerleave', () => { this.hoverP = null; this.onHover?.(null); this.fgHoverId = null; this.onFgHover?.(null, null); });
    this.canvas.addEventListener('click', (e) => {
      const l = local(e);
      const fh = this.fgHit(l.x, l.y);
      if (fh) { this.onClick?.(fh.id, fh.hit, null); return; }
      if (this.busy) { this.hurry = true; return; }
      this.onClick?.(null, null, this.pickAt(l.x, l.y));
    });
  }
  /** the instrument under a point (CSS px in the canvas): the nearest object carrying userData.pick */
  private fgHit(x: number, y: number): { id: string; hit: THREE.Intersection } | null {
    const r = this.canvas.getBoundingClientRect();
    this.fgRay.setFromCamera(_ndc.set((x / r.width) * 2 - 1, -(y / r.height) * 2 + 1), this.fgCam);
    const hits = this.fgRay.intersectObjects(this.fg.children, true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o && !o.userData.pick) o = o.parent;
      if (o) return { id: o.userData.pick as string, hit: h };
      if ((h.object as THREE.Mesh).isMesh && h.object.visible) return null;
    }
    return null;
  }

  // ---------------------------------------------------------------- camera
  focus(p: Pick | null) {
    if (this.mode === 'field') return;
    if (!p || !this.rig) { this.camPosT.set(0.75, 2.35, 2.25); this.camAtT.set(0.05, 0.92, 0.05); return; }
    const a = this.anchor(p, new THREE.Vector3());
    const close = p === 'eyes' || p === 'jaw' || p === 'brain' || p === 'hand_l' || p === 'hand_r';
    this.camAtT.copy(a);
    const side = p.endsWith('_r') ? 1 : p.endsWith('_l') ? -1 : 0;
    this.camPosT.set(a.x + (close ? 0.5 : 0.7), a.y + (close ? 0.85 : 1.25), a.z + (side < 0 ? -1 : 1) * (close ? 1.0 : 1.6) + (side === 0 ? 0.5 : 0));
    if (side < 0) this.camPosT.z = Math.max(this.camPosT.z, -0.6);
  }
  /** first-person framing for field surgery: from the subject's eyes toward a part */
  private povAt(p: Pick | null) {
    if (!this.rig) return;
    const head = this.anchor('eyes', new THREE.Vector3());
    this.camPosT.set(head.x - 0.12, head.y + 0.18, head.z);
    this.camAtT.copy(p ? this.anchor(p, new THREE.Vector3()) : new THREE.Vector3(0.6, TABLE_Y + 0.2, 0));
  }
  shake(a: number) { this.shakeT = Math.max(this.shakeT, a); }

  // ---------------------------------------------------------------- arms
  private restArms(snap = false) {
    this.saw.target.set(-0.75, 1.3, -0.62); this.saw.pitch = -1.3; this.saw.spinRate = 0;
    this.driver.target.set(1.05, 1.3, -0.62); this.driver.pitch = -1.3; this.driver.spinRate = 0; this.driver.grip(1);
    if (snap) { this.saw.cur.copy(this.saw.target); this.driver.cur.copy(this.driver.target); }
  }

  // ---------------------------------------------------------------- intro: the gantry carries the subject in
  async intro(fast = false) {
    if (!this.rig) return;
    this.busy = true;
    if (this.mode === 'field' || fast) {
      this.trolley.position.x = 0.25; this.claw.position.y = -0.4; this.lying = 1; this.hang = 0;
      for (const s of this.straps) { s.visible = true; s.scale.z = 1; }
      this.busy = false;
      return;
    }
    this.lying = 0; this.hang = 1; this.phase = 'intro';
    this.trolley.position.x = -2.6; this.claw.position.y = -1.0;
    this.camPosT.set(-0.4, 2.2, 3.6); this.camAtT.set(-1.0, 1.3, 0); this.camPos.copy(this.camPosT); this.camAt.copy(this.camAtT);
    this.clawFingers.forEach((f, i) => (f.rotation.x = (i ? -1 : 1) * 0.1));
    csfx('cy_servo', 0.6);
    await this.tween(1700, (t) => { this.trolley.position.x = -2.6 + 2.85 * ease(t); this.camAtT.set(-1.0 + 1.0 * ease(t), 1.3 - 0.3 * t, 0); });
    csfx('cy_thunk', 0.8);
    this.shake(0.15);
    csfx('cy_hiss', 0.6);
    await this.tween(900, (t) => { this.lying = ease(t); this.hang = 1 - ease(t); this.claw.position.y = -1.0 + 0.0 * t; });
    this.clawFingers.forEach((f, i) => (f.rotation.x = (i ? 1 : -1) * 0.6));
    csfx('cy_hiss', 0.7);
    for (const s of this.straps) s.visible = true;
    await this.tween(450, (t) => { for (const s of this.straps) s.scale.z = Math.max(0.01, easeOut(t)); });
    csfx('cy_thunk', 0.9); this.shake(0.1);
    this.focus(null);
    await this.tween(700, (t) => { this.claw.position.y = -1.0 + 0.6 * ease(t); this.trolley.position.x = 0.25 + 1.6 * ease(t); });
    this.phase = '';
    this.busy = false;
  }

  /** sequences run on the stage's own clock, so a slow device plays them slower instead of skipping them */
  private tween(ms: number, fn: (t: number) => void): Promise<void> {
    return new Promise((res) => {
      const t0 = this.t;
      const step = () => {
        const t = Math.min(1, (this.t - t0) / (ms / 1000));
        fn(t);
        if (t >= 1) res(); else this.tweens.push(step);
      };
      this.tweens.push(step);
    });
  }
  private wait(ms: number): Promise<void> { return this.tween(ms, () => {}); }
  private tweens: (() => void)[] = [];
  /** what the current sequence is doing ('' idle; intro, approach, cut, drop, bring, bolt, test) */
  private _phase = '';
  private onPhase?: (ph: string) => void;
  get phase() { return this._phase; }
  set phase(v: string) { if (v !== this._phase) { this._phase = v; if (v) this.onPhase?.(v); } }
  private viewShift = [0, 0];
  /** slide the picture so the subject sits clear of the instruments (fractions of the view) */
  setViewShift(x: number, y: number) { this.viewShift = [x, y]; }
  /** skip the rest of a sequence quickly (click while busy) */
  hurry = false;

  // ---------------------------------------------------------------- the swap
  /** take what is in a slot off (flesh or hardware) and fit a part, or flesh back (key null) */
  async swap(slot: CyberSlot, key: string | null, onPhase?: (ph: string) => void) {
    const r = this.rig;
    if (!r || this.busy) return;
    this.busy = true;
    this.onPhase = onPhase;
    this.hurry = false;
    const kind = SLOT_KIND[slot];
    const S = slot.endsWith('_l') ? 'L' : 'R';
    const covers = SLOT_COVERS[slot];
    const had = this.load[slot] ?? null;
    const limb = kind === 'arm' || kind === 'hand' || kind === 'leg';
    const rootBone = ((kind === 'arm' ? 'uarm' : kind === 'hand' ? 'hand' : kind === 'leg' ? 'thigh' : kind === 'eyes' || kind === 'jaw' ? 'head' : 'chest') + (limb ? S : '')) as BoneName;
    const joint = () => { r.root.updateMatrixWorld(true); return r.bones[rootBone].getWorldPosition(new THREE.Vector3()); };
    if (this.mode === 'field') this.povAt(slot);
    else {
      // in close for the work
      const a = this.anchor(slot, new THREE.Vector3());
      this.camAtT.copy(a);
      this.camPosT.set(a.x + 0.45, a.y + 0.85, a.z + (slot.endsWith('_l') ? -0.75 : 0.95));
      if (slot.endsWith('_l')) this.camPosT.z = Math.max(this.camPosT.z, -0.5);
    }
    // the work bloodies the subject around it (and it stays)
    const BLOOD: Record<string, string[]> = { arm: ['torso_u', 'neck'], hand: ['farm_' + S.toLowerCase()], leg: ['groin', 'torso_l'], eyes: ['head', 'neck'], jaw: ['head', 'neck'], spine: ['torso_u'], skin: ['torso_u', 'torso_l'] };
    this.stress = Math.max(this.stress, 0.45);
    const T = (ms: number) => (this.hurry ? ms * 0.25 : ms);
    // ---- 1. the saw (or the laser) comes down
    this.phase = 'approach';
    const j0 = joint();
    const cutAt = limb ? j0.clone() : this.anchor(kind === 'eyes' ? 'eyes' : kind === 'jaw' ? 'jaw' : kind === 'spine' ? 'spine' : 'skin', new THREE.Vector3());
    if (kind === 'arm') cutAt.add(new THREE.Vector3(0, 0, 0)).lerp(this.anchor(slot === 'arm_l' ? 'arm_l' : 'arm_r', new THREE.Vector3()), 0.12);
    this.saw.pitch = -1.25;
    this.saw.target.copy(cutAt).add(new THREE.Vector3(0, 0.38, -0.05));
    this.saw.spinRate = 12;
    csfx('cy_servo', 0.55);
    await this.wait(T(700));
    this.saw.spinRate = 60;
    this.saw.target.copy(cutAt).add(new THREE.Vector3(0, 0.05, -0.02));
    await this.wait(T(450));
    // ---- 2. cutting: blood (or sparks off old hardware), the subject fights the straps
    const flesh = !had && limb;
    const stopSaw = csfxLoop(had ? 'cy_spark' : 'cy_saw', 0.8);
    this.stress = 1;
    this.alarm.intensity = 4;
    this.twitch.push({ bone: '*', t: T(1300) / 1000, amp: 0.12 }, { bone: limb ? rootBone : 'head', t: T(1300) / 1000, amp: 0.5 });
    const cutEnd = this.t + T(limb ? 1250 : 900) / 1000;
    this.phase = 'cut';
    this.impact(0.6, 90);
    while (this.t < cutEnd) {
      const p = this.saw.tipWorld(new THREE.Vector3());
      if (flesh || (!limb && !had)) { this.spray(p, 9, 1.1); for (const b of BLOOD[kind] || []) this.bloodOn[b] = Math.min(3, (this.bloodOn[b] ?? 0) + 0.25); this.applyCondSoon(); } else this.spark(p, 6);
      this.shake(0.12); this.hurt = Math.max(this.hurt, flesh ? 0.55 : 0.2);
      this.saw.target.y = cutAt.y + 0.03 + Math.sin(this.t * 17) * 0.015;
      await this.wait(50);
    }
    stopSaw();
    // ---- 3. it comes off: into the tray
    this.phase = 'drop';
    // (a limb already lost in a run: the stump is trimmed and cleaned, nothing falls)
    const missing = !had && covers.length > 0 && covers.every((c) => this.sev.includes(c));
    if (limb && !missing) {
      r.root.updateMatrixWorld(true);
      const m = new THREE.Mesh(had ? loosePartGeo(had, slot, r.dims) : fleshLimbGeo(kind, r), this.mat);
      m.castShadow = true;
      r.bones[rootBone].matrixWorld.decompose(m.position, m.quaternion, m.scale);
      this.scene.add(m);
      const v = new THREE.Vector3().subVectors(this.trayPos, m.position).multiplyScalar(1.6); v.y = 2.4;
      this.loose.push({ mesh: m, v, spin: new THREE.Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 6), t: 0, tray: false, life: 1e9 });
      if (had) delete this.load[slot];
      for (const c of covers) if (!this.sev.includes(c)) this.sev.push(c);
      const cut = covers[0];
      this.stump[cut] = { s: had ? 'healed' : 'raw' };
      if (!had) this.bleeding = cut;
      this.applyCond();
      csfx(had ? 'cy_rip' : 'cy_splat', 0.9);
      this.impact(1, 150);
      this.shake(0.5); this.hurt = had ? 0.3 : 1; this.flash = 0.25;
      if (!had) this.spray(j0, 40, 1.6);
    } else if (had) {
      delete this.load[slot]; this.applyCond(); this.spark(cutAt, 24);
    }
    this.saw.spinRate = 8;
    this.restArms();
    await this.wait(T(650));
    // ---- 4. the driver brings the hardware (or a vat-grown limb) in and bolts it on
    const rj = joint();
    let carried: THREE.Mesh | null = null;
    if (key || limb) {
      carried = new THREE.Mesh(key ? loosePartGeo(key, slot, r.dims) : fleshLimbGeo(kind, r, true), this.mat);
      carried.castShadow = true;
      this.scene.add(carried);
    }
    this.driver.pitch = -1.1;
    this.driver.target.copy(rj).add(new THREE.Vector3(0.1, 0.45, -0.1));
    this.driver.grip(0.15);
    csfx('cy_servo', 0.6);
    const qBone = new THREE.Quaternion(), pBone = new THREE.Vector3(), sBone = new THREE.Vector3();
    const bring = this.t, bringS = T(1000) / 1000;
    this.phase = 'bring';
    while (this.t - bring < bringS) {
      if (carried) {
        r.root.updateMatrixWorld(true);
        r.bones[rootBone].matrixWorld.decompose(pBone, qBone, sBone);
        const tip = this.driver.tipWorld(new THREE.Vector3());
        const k = ease((this.t - bring) / bringS);
        carried.position.copy(tip).lerp(pBone, k);
        carried.quaternion.copy(qBone);
        carried.position.y += (1 - k) * 0.15;
      }
      await this.wait(16);
    }
    this.phase = 'bolt';
    this.driver.target.copy(rj).add(new THREE.Vector3(0.04, 0.12, -0.03));
    this.driver.spinRate = 40;
    const bolts = limb ? 3 : 2;
    for (let i = 0; i < bolts; i++) {
      csfx(key ? 'cy_bolt' : 'cy_splat', 0.8);
      this.impact(0.35, 60);
      const t1 = this.t + T(380) / 1000;
      while (this.t < t1) {
        const p = this.driver.tipWorld(new THREE.Vector3());
        if (key) { this.spark(p, 5); this.weld.position.copy(p); this.weld.intensity = 3 + Math.random() * 5; }
        else this.spray(p, 2, 0.4);
        this.shake(0.08);
        this.driver.target.x = rj.x + 0.04 + Math.sin(this.t * 25) * 0.02;
        await this.wait(40);
      }
      this.twitch.push({ bone: '*', t: 0.25, amp: 0.08 });
    }
    this.weld.intensity = 0;
    // ---- 5. done: it is part of the subject now
    if (carried) { this.scene.remove(carried); }
    for (const c of covers) { const i = this.sev.indexOf(c); if (i >= 0) this.sev.splice(i, 1); delete this.stump[c]; }
    if (key) this.load[slot] = key; else delete this.load[slot];
    this.bleeding = '';
    this.applyCond();
    this.driver.spinRate = 0; this.driver.grip(1);
    this.restArms();
    this.alarm.intensity = 0;
    if (key) csfx('cy_powerup', 0.8);
    // a servo test: the new part flexes
    if (key && limb) {
      this.phase = 'test';
      const fk = kind === 'leg' ? 'shin' + S : 'grip' + S;
      const fk2 = kind === 'arm' ? 'farm' + S : '';
      await this.tween(T(700), (t) => { const w = Math.sin(t * Math.PI * 2) * (1 - t); this.flex[fk] = Math.max(0, w) * (kind === 'leg' ? 0.9 : 0.85); if (fk2) this.flex[fk2] = Math.max(0, w) * 1.2; });
      this.flex = {};
    }
    this.stress = 0.35;
    if (this.mode === 'field') this.povAt(null); else this.focus(this.selected);
    this.phase = '';
    this.busy = false;
  }

  /** blood: a burst from p */
  spray(p: THREE.Vector3, n: number, power = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = (0.3 + Math.random() * 1.1) * power;
      this.blood.add(p.x, p.y, p.z, Math.cos(a) * s, 0.6 + Math.random() * 1.8 * power, Math.sin(a) * s, 0.012 + Math.random() * 0.026, 6 + Math.random() * 30, Math.random() < 0.3 ? 0x5a0808 : 0x8a0e12);
    }
  }
  spark(p: THREE.Vector3, n: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 3;
      this.sparks.add(p.x, p.y, p.z, Math.cos(a) * s, 0.5 + Math.random() * 2.5, Math.sin(a) * s, 0.006 + Math.random() * 0.01, 0.25 + Math.random() * 0.5, Math.random() < 0.35 ? 0xffffff : Math.random() < 0.5 ? 0xffc040 : 0x80e0ff);
    }
  }

  // ---------------------------------------------------------------- per frame
  private resize() {
    if (!this.renderer) return;
    const w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight);
    const target = this.quality === 'low' ? 240 : 300;
    const px = Math.max(1, h / target);
    const lw = Math.max(64, Math.round(w / px)), lh = Math.max(64, Math.round(h / px));
    if (lw === this.lowW && lh === this.lowH) return;
    this.lowW = lw; this.lowH = lh;
    this.renderer.setSize(w, h, false);
    this.cam.aspect = lw / lh;
    this.fgCam.aspect = w / h; this.fgCam.updateProjectionMatrix();
    this.cam.fov = this.baseFov = lw / lh < 0.8 ? 52 : this.mode === 'field' ? 62 : 34;
    this.cam.updateProjectionMatrix();
    this.rt?.dispose(); this.rt2?.dispose();
    this.rt = new THREE.WebGLRenderTarget(lw, lh, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
    this.rt.depthTexture = new THREE.DepthTexture(lw, lh);
    this.rt2 = new THREE.WebGLRenderTarget(lw, lh, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
    if (!this.blit) { const bm = new THREE.MeshBasicMaterial({ depthTest: false, depthWrite: false, toneMapped: false }); const bs = new THREE.Scene(); const bq = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bm); bq.position.z = -0.5; bq.frustumCulled = false; bs.add(bq); this.blit = { scene: bs, mat: bm }; }
    this.blit.mat.map = this.rt2.texture; this.blit.mat.needsUpdate = true;
    if (!this.post) {
      const mat = new THREE.ShaderMaterial({
        uniforms: { tex: { value: null }, uDepth: { value: null }, texel: { value: new THREE.Vector2() }, uTime: { value: 0 }, uHurt: { value: 0 }, uFlash: { value: 0 }, uNear: { value: 0.05 }, uFar: { value: 40 }, uFocus: { value: 3 }, uAperture: { value: 1 }, uBars: { value: 0 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
        fragmentShader: `
          uniform sampler2D tex; uniform sampler2D uDepth; uniform vec2 texel; uniform float uTime; uniform float uHurt; uniform float uFlash;
          uniform float uNear; uniform float uFar; uniform float uFocus; uniform float uAperture; uniform float uBars;
          float lin(vec2 uv) { float z = texture2D(uDepth, uv).r * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
          varying vec2 vUv;
          void main(){
            vec2 q = vUv - 0.5;
            vec3 c = texture2D(tex, vUv).rgb;
            // the lens: whatever is not at the focus distance goes soft (a focus pull follows the framing)
            float coc = clamp(abs(lin(vUv) - uFocus) / max(uFocus, 0.5) * uAperture, 0.0, 1.0);
            if (coc > 0.06) {
              vec3 acc = c; float wsum = 1.0;
              for (int k = 0; k < 10; k++) {
                float a = float(k) * 2.39996;
                vec2 o = vec2(cos(a), sin(a)) * sqrt(float(k) + 0.5) * 0.75 * coc * texel * 2.6;
                acc += texture2D(tex, vUv + o).rgb; wsum += 1.0;
              }
              c = acc / wsum;
            }
            // tungsten halation: the brightest neighbours bleed warm
            vec3 b = vec3(0.0);
            for (int i = -2; i <= 2; i++) for (int j = -2; j <= 2; j++) {
              vec3 s = texture2D(tex, vUv + vec2(float(i), float(j)) * texel * 1.5).rgb;
              b += max(s - 0.72, 0.0);
            }
            c += b * vec3(0.06, 0.045, 0.03);
            // film: a warm grade and a little grain
            c = c * vec3(1.04, 1.0, 0.92);
            float g = fract(sin(dot(floor(vUv / texel) + floor(uTime * 12.0), vec2(12.9898, 78.233))) * 43758.5453);
            c += (g - 0.5) * 0.035;
            // pain: the edges go red; the cut flashes white
            float v = dot(q, q);
            c = mix(c, vec3(0.55, 0.0, 0.02), clamp(uHurt * smoothstep(0.04, 0.42, v) * 0.95, 0.0, 0.85));
            c = mix(c, vec3(1.0, 0.96, 0.92), clamp(uFlash, 0.0, 1.0));
            c *= 1.0 - v * 1.15;
            // letterbox while the machines work
            float bh = uBars * 0.085;
            if (vUv.y < bh || vUv.y > 1.0 - bh) c = vec3(0.0);
            gl_FragColor = vec4(c, 1.0);
            #include <colorspace_fragment>
          }`,
        depthTest: false, depthWrite: false,
      });
      const scene = new THREE.Scene();
      scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
      this.post = { scene, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), mat };
    }
    this.post.mat.uniforms.tex.value = this.rt.texture;
    this.post.mat.uniforms.uDepth.value = this.rt.depthTexture;
    this.post.mat.uniforms.texel.value.set(1 / lw, 1 / lh);
  }

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, (now - this.last) / 1000);
    if (dt < 1 / 60) return;
    this.last = now;
    if (document.hidden || !this.renderer || !this.rt || !this.post) return;
    // hit-stop: the world holds its breath for a beat, the camera does not
    const sdt = this.stopT > 0 ? 0 : dt;
    this.stopT -= dt;
    this.t += sdt;
    if (sdt > 0) for (const f of this.tweens.splice(0)) f();
    if (this.rig) {
      this.placeSubject(this.lying, 0);
      this.rig.applyPose(this.pose(dt));
    }
    this.saw.solve(dt, 5); this.driver.solve(dt, 5);
    // loose limbs fall into the tray
    for (const l of this.loose) {
      if (l.tray) continue;
      l.t += dt;
      l.v.y -= 9.8 * dt;
      l.mesh.position.addScaledVector(l.v, dt);
      l.mesh.rotation.x += l.spin.x * dt; l.mesh.rotation.y += l.spin.y * dt; l.mesh.rotation.z += l.spin.z * dt;
      const T = this.trayPos;
      const over = Math.abs(l.mesh.position.x - T.x) < 0.5 && Math.abs(l.mesh.position.z - T.z) < 0.25;
      const fy = over ? T.y : 0.02;
      if (l.mesh.position.y < fy && l.v.y < 0) {
        l.mesh.position.y = fy; l.tray = true;
        // settle lying flat-ish
        l.mesh.quaternion.setFromEuler(new THREE.Euler(Math.PI / 2 + (Math.random() - 0.5) * 0.4, 0, Math.PI / 2 + (Math.random() - 0.5) * 0.6));
        l.mesh.position.y = fy + 0.06;
        if (over) { csfx('cy_splat', 0.7); this.spray(l.mesh.position, 10, 0.5); }
      }
    }
    while (this.loose.length > 6) { const o = this.loose.shift()!; this.scene.remove(o.mesh); }
    this.blood.update(dt); this.sparks.update(dt);
    if (this.bleeding && this.rig && Math.random() < dt * 14) {
      const p = this.anchor(this.bleeding.startsWith('thigh') ? (this.bleeding.endsWith('_l') ? 'leg_l' : 'leg_r') : this.bleeding.startsWith('hand') ? (this.bleeding.endsWith('_l') ? 'hand_l' : 'hand_r') : (this.bleeding.endsWith('_l') ? 'arm_l' : 'arm_r'), new THREE.Vector3());
      this.blood.add(p.x, p.y, p.z, (Math.random() - 0.5) * 0.6, 0.4, (Math.random() - 0.5) * 0.6, 0.012, 30, 0x7a0a0e);
    }
    // lights
    this.alarm.intensity = this.alarm.intensity > 0 ? 2 + Math.sin(this.t * 14) * 2 : 0;
    // dark lights cost as much as lit ones: take them out of the shaders while they are off
    this.alarm.visible = this.alarm.intensity > 0.01; this.weld.visible = this.weld.intensity > 0.01; this.inspect.visible = this.inspect.intensity > 0.02;
    this.lamp.intensity = 11 + Math.sin(this.t * 41) * 0.2 + (Math.random() < 0.003 ? -5 : 0);
    this.stress = Math.max(0.15, this.stress - dt * 0.06);
    this.drawMonitor(dt);
    this.onFrame?.(dt);
    // the hand lamp swings over the part under the pointer (or the one being worked on)
    const lit = this.busy ? null : this.hoverP ?? this.selected;
    if (lit && this.rig) {
      const a = this.anchor(lit, _v2);
      this.inspect.position.lerp(_v.set(a.x + 0.1, a.y + 0.32, a.z + 0.12), 1 - Math.exp(-dt * 10));
      this.inspect.intensity = damp(this.inspect.intensity, lit === this.hoverP ? 3.2 : 2, 8, dt);
    } else this.inspect.intensity = damp(this.inspect.intensity, 0, 6, dt);
    // camera
    if (this.mode === 'field' && this.rig && !this.busy) this.povAt(null);
    // spring dolly (eases in and out), the field view comes in with the game's cut
    const spring = (p: THREE.Vector3, v: THREE.Vector3, t: THREE.Vector3, w: number) => {
      v.x += ((t.x - p.x) * w * w - 2 * w * v.x) * dt; v.y += ((t.y - p.y) * w * w - 2 * w * v.y) * dt; v.z += ((t.z - p.z) * w * w - 2 * w * v.z) * dt;
      p.addScaledVector(v, dt);
    };
    if (this.mode === 'field' && this.entrance < 1) { const k = 1 - this.entrance; _v.copy(this.camPosT).add(_v2.set(-0.5 * k, 0.9 * k, 0.6 * k)); spring(this.camPos, this.camVel, _v, 3.6); }
    else spring(this.camPos, this.camVel, this.camPosT, 3.2);
    spring(this.camAt, this.atVel, this.camAtT, 3.8);
    this.punchK = Math.max(0, this.punchK - dt * 3.5);
    const fov = this.baseFov * (1 - this.punchK * 0.14);
    if (Math.abs(this.cam.fov - fov) > 0.01) { this.cam.fov = fov; this.cam.updateProjectionMatrix(); }
    this.bars += ((this.busy && this.phase && this.phase !== 'intro' ? 1 : 0) - this.bars) * Math.min(1, dt * 4);
    this.shakeT = Math.max(0, this.shakeT - dt * 1.6);
    const sh = this.shakeT * this.shakeT * 0.06;
    this.cam.position.set(this.camPos.x + (Math.random() - 0.5) * sh, this.camPos.y + (Math.random() - 0.5) * sh + Math.sin(this.t * 0.5) * 0.01, this.camPos.z + (Math.random() - 0.5) * sh);
    this.cam.lookAt(this.camAt);
    if (this.viewShift[0] || this.viewShift[1]) this.cam.setViewOffset(this.lowW, this.lowH, this.viewShift[0] * this.lowW, this.viewShift[1] * this.lowH, this.lowW, this.lowH);
    else if (this.cam.view) this.cam.clearViewOffset();
    this.hurt = Math.max(0, this.hurt - dt * 0.8);
    this.flash = Math.max(0, this.flash - dt * 3);
    const pu = this.post.mat.uniforms;
    pu.uTime.value = this.t; pu.uHurt.value = this.hurt; pu.uFlash.value = this.flash; pu.uBars.value = this.bars;
    pu.uFocus.value = this.camPos.distanceTo(this.camAt); pu.uAperture.value = this.mode === 'field' ? 0.7 : 1.1;
    pu.uNear.value = this.cam.near; pu.uFar.value = this.cam.far;
    this.render();
  };

  private render() {
    const r = this.renderer!;
    const saved = { cut: U.uCutOn.value, vis: U.uVisOn.value, fn: U.uFogNear.value, ff: U.uFogFar.value, gs: U.uGridScale.value, col: U.uCollapse.value, snap: U.uSnapOn.value };
    U.uCutOn.value = 0; U.uVisOn.value = 0; U.uFogNear.value = 1e4; U.uFogFar.value = 2e4; U.uGridScale.value = 0; U.uCollapse.value = 0; U.uSnapOn.value = 0;
    try {
      r.setRenderTarget(this.rt);
      r.setClearColor(0x05060a, 1);
      r.clear(true, true, true);
      r.render(this.scene, this.cam);
      r.setRenderTarget(null);
      r.setRenderTarget(this.rt2);
      r.render(this.post!.scene, this.post!.cam);
      r.setRenderTarget(null);
      r.render(this.blit!.scene, this.post!.cam);
      if (this.fg.children.length) { r.autoClear = false; r.clearDepth(); r.render(this.fg, this.fgCam); r.autoClear = true; }
    } finally {
      U.uCutOn.value = saved.cut; U.uVisOn.value = saved.vis; U.uFogNear.value = saved.fn; U.uFogFar.value = saved.ff; U.uGridScale.value = saved.gs; U.uCollapse.value = saved.col; U.uSnapOn.value = saved.snap;
    }
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    if (this.rig) { this.subj.remove(this.rig.root); this.rig.dispose(); this.rig = null; }
    this.monitor.tex.dispose();
    this.rt?.dispose(); this.rt2?.dispose();
    this.blood.mesh.geometry.dispose(); this.sparks.mesh.geometry.dispose();
    if (this.renderer) { this.renderer.dispose(); this.renderer.forceContextLoss(); this.renderer = null; }
    this.canvas.remove();
  }
}

function parentPart(p: string) {
  const side = p.slice(-2);
  if (p.startsWith('farm')) return 'uarm' + side; if (p.startsWith('hand')) return 'farm' + side;
  if (p.startsWith('shin')) return 'thigh' + side; if (p.startsWith('foot')) return 'shin' + side;
  return '';
}

const FLESH = new Map<string, THREE.BufferGeometry>();
/** a severed flesh limb in its bone's local frame (hanging along -y from the cut) */
function fleshLimbGeo(kind: string, r: HumanRig, fresh = false): THREE.BufferGeometry {
  const k = `${kind}:${fresh ? 1 : 0}:${Math.round(r.s * 20)}`;
  let g = FLESH.get(k);
  if (!g) {
    const mb = new ModelBuilder();
    mb.push().scale(r.s, r.s, r.s).rotateZ(-Math.PI / 2).translate(0, kind === 'leg' ? -0.06 : -0.045, 0);
    if (fresh) mb.tint = 0xffd8c8;
    limbItemModel(mb, kind === 'leg' ? 'leg' : kind === 'hand' ? 'hand' : 'arm', false);
    mb.pop();
    g = mb.build();
    FLESH.set(k, g);
  }
  return g;
}
