// The found objects that make up the touch controls. Each is a small low-poly
// model in "panel space" (x right, y out of the panel, z toward the viewer),
// built once from primitives into one or two meshes per moving part, with
// pixel decals (label tape, printed caps, gauge faces) redrawn at the exact
// on-screen pixel size so the 5x7 lettering stays crisp.
import * as THREE from 'three';
import { Screen } from '../font5x7';
import {
  Prop, Mold, M, DEG, Particles, C, pixTex,
  PAINT, STEEL, CHROME, BRASS, RUBBER, PLASTIC, CLOTH, PAPER, GLASS, CERAMIC, Surf,
} from './stage3d';
import { sfx, haptic } from './sfx';
import { clamp, wrapAngle } from '../../core/math';

const PI = Math.PI;
const cyl = (r: number, h: number, seg = 14, rb = r, open = false) => new THREE.CylinderGeometry(r, rb, h, seg, 1, open);
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const sph = (r: number, ws = 10, hs = 7, t0 = 0, tl = PI) => new THREE.SphereGeometry(r, ws, hs, 0, PI * 2, t0, tl);
const tor = (R: number, r: number, rs = 6, ts = 24) => new THREE.TorusGeometry(R, r, rs, ts);
const lathe = (pts: number[][], seg = 18) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y)), seg);
const smooth = (t: number) => { const x = clamp(t, 0, 1); return x * x * (3 - 2 * x); };
const hash = (x: number, y: number, z = 0) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
const _v = new THREE.Vector3(), _ax = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const SURF = (base: Surf, blood: number): Surf => [base[0], base[1], blood, base[3]];
/** chrome reads as chrome when it mirrors a bright ceiling and a dark floor */
const chromeC = (hi = 0xe4e6de, mid = 0x9ea19a, lo = 0x4f524d) => (_x: number, _y: number, _z: number, _nx: number, ny: number, nz: number) => (ny > 0.35 ? hi : ny < -0.25 || nz < -0.4 ? lo : mid);

/** a cylinder between two points */
function rod(m: Mold, a: [number, number, number], b: [number, number, number], r: number, color: number, surf: Surf, seg = 6) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = d.length();
  const q = new THREE.Quaternion().setFromUnitVectors(_up, d.clone().normalize());
  const mat = new THREE.Matrix4().compose(new THREE.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), q, new THREE.Vector3(1, len, 1));
  m.add(cyl(r, 1, seg), mat, color, surf);
}

let PARTS: Particles | null = null;
export function bindParticles(p: Particles) { PARTS = p; }
const spark = () => PARTS;

/** black embossing tape with raised letters */
function drawTape(s: Screen, text: string, fg = 0xe6e3d6, bg = 0x141311) {
  const w = s.w, h = s.h;
  s.rect(0, 0, w, h, C(bg));
  s.hline(1, w - 2, 0, C(0x2c2a26));
  s.hline(1, w - 2, h - 1, C(0x0a0a09));
  s.px(0, 0, 0); s.px(w - 1, 0, 0); s.px(0, h - 1, 0); s.px(w - 1, h - 1, 0);
  s.text(text, 3, 3, C(0x050505));
  s.text(text, 2, 2, C(fg));
}

interface Decal { mesh: THREE.Mesh; w: number; h: number; orient: 'up' | 'front'; tilt: number }

/** a prop with pixel-exact decals and screen-space helpers */
export class Thing extends Prop {
  s = 0; px = 1;
  decals: Decal[] = [];
  label = '';

  place(cx: number, cy: number, w: number, h: number, px: number) {
    super.place(cx, cy, w, h, px);
    this.px = px;
    const s = this.root.scale.x;
    if (Math.abs(s - this.s) > 0.01) {
      this.s = s;
      for (const d of this.decals) this.fitDecal(d);
      this.retex(s);
    }
  }
  private fitDecal(d: Decal) {
    const s = Math.max(1, this.s), e = this.elev + d.tilt;
    if (d.orient === 'up') d.mesh.scale.set(d.w / s, 1, d.h / (s * Math.max(0.25, Math.sin(e))));
    else d.mesh.scale.set(d.w / s, d.h / (s * Math.max(0.25, Math.cos(e))), 1);
  }
  /** a flat pixel decal of w x h low-res pixels at (x, y, z), lying on the panel ('up') or facing the viewer ('front') */
  decal(w: number, h: number, draw: (s: Screen) => void, x: number, y: number, z: number, orient: 'up' | 'front' = 'up', parent: THREE.Object3D = this.body, tilt = 0) {
    const t = pixTex(w, h, draw);
    const g = new THREE.PlaneGeometry(1, 1);
    if (orient === 'up') g.rotateX(-PI / 2);
    const mo = new Mold().add(g, null, 0xffffff, [0.1, 0.4, 0.6, 0]);
    const mesh = this.mesh(mo, this.mat({ map: t.tex, decal: true }), parent);
    mesh.position.set(x, y, z);
    const d: Decal = { mesh, w, h, orient, tilt };
    this.decals.push(d);
    if (this.s) this.fitDecal(d);
    return { mesh, redraw: t.redraw, scr: t.scr };
  }
  tape(text: string, x: number, y: number, z: number, orient: 'up' | 'front' = 'up', parent: THREE.Object3D = this.body, fg?: number, bg?: number, tilt = 0) {
    return this.decal([...text].length * 6 + 4, 11, (s) => drawTape(s, text, fg, bg), x, y, z, orient, parent, tilt);
  }
  /** size-dependent textures (printed caps, plates, dials) */
  protected retex(_s: number) { /* override */ }
  /** a point in an object's local space -> CSS px */
  screenOf(obj: THREE.Object3D, x: number, y: number, z: number): [number, number] {
    obj.updateWorldMatrix(true, false);
    _v.set(x, y, z);
    obj.localToWorld(_v);
    return [_v.x * this.px, -_v.y * this.px];
  }
  /** default physical dip on press */
  protected dip(amount = 0.03) { this.body.position.y = -this.press * amount; }
}

/** a size-dependent texture on a mesh (regenerated at pixel size) */
function liveTex(prop: Thing, mat: THREE.ShaderMaterial) {
  let cur: THREE.CanvasTexture | null = null;
  return (w: number, h: number, draw: (s: Screen) => void) => {
    w = Math.max(4, Math.round(w)); h = Math.max(4, Math.round(h));
    const t = pixTex(w, h, draw);
    cur?.dispose();
    cur = t.tex;
    mat.uniforms.uMap.value = t.tex;
    void prop;
    return t;
  };
}

/** a small panel lamp (dome lens on a chrome ring); returns the lens material */
function lamp(p: Thing, x: number, y: number, z: number, r: number, lens: number, parent: THREE.Object3D = p.body) {
  const ring = new Mold().add(cyl(r * 1.25, r * 0.5, 10), M(x, y + r * 0.25, z), 0x9a9d94, CHROME);
  p.mesh(ring, p.mat(), parent);
  const lm = p.mat();
  const lo = new Mold().add(sph(r, 10, 6, 0, PI / 2), M(x, y + r * 0.45, z), lens, GLASS, 1);
  p.mesh(lo, lm, parent);
  return lm;
}
const setGlow = (m: THREE.ShaderMaterial, rgb: number, k: number) => {
  (m.uniforms.uGlow.value as THREE.Vector3).set(((rgb >> 16) & 255) / 255 * k, ((rgb >> 8) & 255) / 255 * k, (rgb & 255) / 255 * k);
};

// =====================================================================
// VALVE WHEEL: the movement stick
// =====================================================================
const IRON = 0x3c4a3e, VRED = 0xa3241a;
export class Valve extends Thing {
  private wheel = new THREE.Group();
  private spin = new THREE.Group();
  private needle = new THREE.Group();
  private faceTex: ReturnType<typeof liveTex>;
  // input
  private kx = 0; private ky = 0; private live = false; private running = false; private wasLive = false;
  // tilt spring
  private wx = 0; private wz = 0; private wvx = 0; private wvz = 0;
  // spin
  spinA = 0; spinV = 0; private clickA = 0; private lastAng = NaN; private dirSign = 1; private clicks = 0;
  private gauge = 0; private steamT = 0; private dirX = 0; private dirY = 0; private dirT = 0;
  private creakT = 0; private squeakT = 0; private lastLen = 0; private wasRunning = false;
  /** a ghost hand turns it now and then (twitch) */
  ghost = 0;

  constructor() {
    super('stick');
    this.elev = 64 * DEG; this.fit = 1.0;
    // cast-iron valve body on a bolted flange
    const b = new Mold();
    b.add(cyl(0.3, 0.05, 18, 0.33), M(0, 0.025, 0), IRON, PAINT);
    for (let i = 0; i < 6; i++) { const a = i / 6 * PI * 2 + 0.3; b.add(cyl(0.03, 0.03, 6), M(Math.cos(a) * 0.27, 0.06, Math.sin(a) * 0.27), 0x8b8e86, STEEL); }
    b.add(cyl(0.1, 0.16, 12, 0.15), M(0, 0.13, 0), IRON, PAINT);
    b.add(cyl(0.085, 0.05, 6), M(0, 0.225, 0), 0xa9894a, BRASS);
    // a pipe out to the pressure gauge (upper right, clear of the thumb)
    rod(b, [0.3, 0.07, -0.2], [0.37, 0.08, -0.29], 0.024, 0x3a3e37, STEEL);
    b.add(cyl(0.13, 0.06, 18), M(0.42, 0.1, -0.35), 0xb7bab0, CHROME);
    b.add(cyl(0.02, 0.04, 6), M(0.42, 0.06, -0.21, PI / 2, 0, 0), 0x6f746b, STEEL);
    this.mesh(b, this.mat({ wear: 0.7 }));
    const face = this.mat();
    const fm = new Mold().add(new THREE.CircleGeometry(0.112, 18).rotateX(-PI / 2), M(0.42, 0.131, -0.35), 0xffffff, [0.1, 0.4, 0.3, 0]);
    const fmesh = this.mesh(fm, face);
    face.defines = { USE_MAP: '' }; face.needsUpdate = true;
    // UVs of a circle already span the square: the dial texture fills it
    void fmesh;
    this.faceTex = liveTex(this, face);
    const nd = new Mold().add(box(0.016, 0.012, 0.1), M(0, 0, -0.04), 0xc0281c, PLASTIC).add(cyl(0.018, 0.016, 8), M(0, 0.004, 0), 0x222222, STEEL);
    this.needle.position.set(0.42, 0.14, -0.35);
    this.body.add(this.needle);
    this.mesh(nd, this.mat(), this.needle);
    // the wheel: rim, five dished spokes, hub and a square stem nut
    this.wheel.position.set(0, 0.24, 0);
    this.body.add(this.wheel);
    this.wheel.add(this.spin);
    const w = new Mold();
    const rimSurf = SURF(PAINT, 1.2);
    w.add(tor(0.42, 0.052, 6, 30), M(0, 0.06, 0, PI / 2), (x, _y, z, _nx, ny) => (ny > 0.8 && hash(Math.round(x * 14), Math.round(z * 14)) > 0.78 ? 0x6d6a62 : hash(Math.round(x * 9), Math.round(z * 9), 3) > 0.75 ? 0x7c1a12 : VRED), rimSurf);
    for (let i = 0; i < 10; i++) { const a = (i + 0.5) / 10 * PI * 2; w.add(box(0.06, 0.03, 0.03), M(Math.cos(a) * 0.42, 0.11, Math.sin(a) * 0.42, 0, -a), 0x8a1d14, rimSurf); }
    for (let i = 0; i < 5; i++) { const a = i / 5 * PI * 2 + 0.2; w.add(box(0.36, 0.034, 0.05), M(Math.cos(a) * 0.25, 0.085, Math.sin(a) * 0.25, 0, -a, -0.11), VRED, rimSurf); }
    w.add(cyl(0.075, 0.08, 10, 0.09), M(0, 0.1, 0), VRED, rimSurf);
    w.add(cyl(0.03, 0.12, 8), M(0, 0.0, 0), 0x777b72, STEEL);
    w.add(box(0.066, 0.04, 0.066), M(0, 0.16, 0), 0x9a9d94, STEEL);
    this.mesh(w, this.mat({ wear: 0.8 }), this.spin);
    this.retex(60);
  }

  protected retex(s: number) {
    const d = 0.224 * s;
    this.faceTex(d, d * Math.sin(this.elev), (sc) => {
      const W = sc.w, H = sc.h, cx = (W - 1) / 2, cy = (H - 1) / 2;
      const rx = W / 2 - 0.5, ry = H / 2 - 0.5;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const nx = (x - cx) / rx, ny = (y - cy) / ry, r = Math.hypot(nx, ny);
        if (r > 1) continue;
        sc.px(x, y, C(r > 0.86 ? 0x8f8a78 : 0xd9d2b8));
      }
      // ticks over 270 degrees, the last fifth in red
      for (let i = 0; i <= 10; i++) {
        const v = i / 10, a = (135 + v * 270) * DEG;
        const red = v > 0.8;
        for (const k of [0.62, 0.74]) sc.px(Math.round(cx + Math.cos(a) * rx * k), Math.round(cy + Math.sin(a) * ry * k), C(red ? 0xb3261c : 0x2a2620));
      }
      for (let i = 0; i <= 12; i++) { const a = (135 + (0.8 + i / 60) * 270) * DEG; sc.px(Math.round(cx + Math.cos(a) * rx * 0.7), Math.round(cy + Math.sin(a) * ry * 0.7), C(0xb3261c)); }
    });
  }

  /** knob offset in px (screen, y down), stick radius px, finger on it, running */
  setStick(kx: number, ky: number, R: number, live: boolean, running: boolean) {
    this.kx = kx / R; this.ky = ky / R;
    if (live !== this.live) {
      this.live = live;
      if (live) { sfx('tc_creak', 0.32, 1 + Math.random() * 0.1, 0.2); haptic(6); this.lastAng = NaN; }
    }
    this.running = running;
    this.busy = true;
  }

  protected animate(dt: number): boolean {
    const live = this.live;
    const gx = live ? this.kx : 0, gz = live ? this.ky : 0;
    // tilt: firm under the thumb, wobbles back on release
    const k = live ? 620 : 210, c = 2 * Math.sqrt(k) * (live ? 0.85 : 0.26);
    this.wvx += (-k * (this.wx - gx) - c * this.wvx) * dt; this.wvz += (-k * (this.wz - gz) - c * this.wvz) * dt;
    this.wx += this.wvx * dt; this.wz += this.wvz * dt;
    const len = Math.hypot(this.wx, this.wz);
    if (len > 1e-4) {
      _ax.set(this.wz / len, 0, -this.wx / len);
      this.wheel.quaternion.setFromAxisAngle(_ax, Math.min(1.25, len) * 30 * DEG);
    } else this.wheel.quaternion.identity();
    this.wheel.position.set(this.wx * 0.06, 0.24 - Math.min(1, len) * 0.02, this.wz * 0.06);
    // spin: cranking the thumb around turns it; pushing keeps it turning
    const mag = Math.min(1, Math.hypot(this.kx, this.ky));
    if (live && mag > 0.12) {
      const ang = Math.atan2(this.ky, this.kx);
      if (!Number.isNaN(this.lastAng)) {
        const dA = wrapAngle(ang - this.lastAng);
        if (mag > 0.35) this.spinA -= dA * 0.9;
        if (Math.abs(dA) > 0.015) this.dirSign = Math.sign(dA);
      }
      this.lastAng = ang;
      const want = -this.dirSign * mag * (this.running ? 6.5 : 3.6);
      this.spinV += (want - this.spinV) * Math.min(1, dt * 5);
      // squeal when the push flips direction; groan when shoved hard
      const ux = this.kx / mag, uy = this.ky / mag;
      this.dirT -= dt;
      if (this.dirT <= 0) {
        if (this.dirX * ux + this.dirY * uy < -0.3 && mag > 0.5 && this.squeakT <= 0) { sfx('tc_squeak', 0.22); this.squeakT = 0.6; }
        this.dirX = ux; this.dirY = uy; this.dirT = 0.14;
      }
      const dl = Math.abs(len - this.lastLen) / Math.max(dt, 1e-3);
      if (dl > 5 && this.creakT <= 0) { sfx('tc_creak', 0.16, 1.2, 0.3); this.creakT = 0.9; }
    } else {
      this.lastAng = NaN;
      this.spinV *= Math.exp(-dt * (live ? 6 : 1.8));
    }
    if (this.ghost > 0) { this.spinV += this.ghost * (Math.random() < 0.5 ? -1 : 1) * 6; this.ghost = 0; }
    this.lastLen = len;
    this.creakT -= dt; this.squeakT -= dt;
    if (!live && this.wasLive) sfx('tc_clunk', 0.22, 1.1, 0.15);
    this.wasLive = live;
    this.spinA += this.spinV * dt;
    this.spin.rotation.y = this.spinA;
    // ratchet: a click every 30 degrees
    const step = 30 * DEG;
    let n = 0;
    while (Math.abs(this.spinA - this.clickA) >= step && n++ < 4) {
      this.clickA += Math.sign(this.spinA - this.clickA) * step;
      sfx('tc_ratchet', 0.1 + Math.min(0.22, Math.abs(this.spinV) * 0.04), 0.92 + Math.random() * 0.16, 0.035);
      if (live && (++this.clicks & 1)) haptic(3);
    }
    // gauge: push pressure; into the red when running
    const target = live ? (this.running ? 0.9 + Math.sin(performance.now() * 0.05) * 0.04 : mag * 0.78) : 0;
    this.gauge += (target - this.gauge) * Math.min(1, dt * 9);
    this.needle.rotation.y = (135 - this.gauge * 270) * DEG;
    // steam from the packing gland while running
    if (live && this.running) {
      if (!this.wasRunning) sfx('tc_hiss', 0.22, 1, 0.5);
      this.steamT -= dt;
      const P = spark();
      if (this.steamT <= 0 && P) {
        this.steamT = 0.05;
        const [sx, sy] = this.screenOf(this.body, 0, 0.26, 0);
        P.spawn(sx + (Math.random() - 0.5) * 4, sy - 2, (Math.random() - 0.5) * 50, -40 - Math.random() * 50, 0.45 + Math.random() * 0.4, 2, 2, 0xd9d8cf, { drag: 2.5, a: 0.55 });
      }
    }
    this.wasRunning = live && this.running;
    return live || Math.abs(this.spinV) > 0.04 || len > 0.004 || Math.abs(this.wvx) + Math.abs(this.wvz) > 0.02 || Math.abs(this.gauge - target) > 0.004;
  }

  /** the lowest point of the rim on screen (blood drips from here) */
  dripPoint(): [number, number] { return this.screenOf(this.wheel, 0, 0.04, 0.47); }
  /** the rim's top (a ghost hand grabs here) */
  topPoint(): [number, number] { return this.screenOf(this.wheel, 0, 0.12, -0.42); }
}

// =====================================================================
// STEERING WHEEL: the stick while driving
// =====================================================================
export class Steer extends Thing {
  private wheel = new THREE.Group();
  private steer = 0; private sv = 0; private goal = 0; private pitchG = 0; private live = false;
  constructor() {
    super('steer');
    this.elev = 60 * DEG; this.fit = 1.0;
    const col = new Mold().add(cyl(0.12, 0.2, 10, 0.16), M(0, 0.06, 0.05), 0x262522, PLASTIC).add(box(0.5, 0.06, 0.3), M(0, 0.02, 0.22), 0x1f1e1b, PLASTIC);
    this.mesh(col, this.mat());
    this.wheel.position.set(0, 0.2, 0);
    this.body.add(this.wheel);
    const w = new Mold();
    w.add(tor(0.43, 0.058, 6, 32), M(0, 0, 0, PI / 2), (x, _y, z) => (hash(Math.round(Math.atan2(z, x) * 14), 1) > 0.5 ? 0x1d1c1a : 0x2a2825), SURF(RUBBER, 1));
    for (const a of [0, PI, PI / 2]) w.add(box(0.32, 0.035, 0.08), M(Math.cos(a) * 0.27, -0.01, Math.sin(a) * 0.27, 0, -a, -0.08), 0x8f918b, STEEL);
    w.add(cyl(0.14, 0.08, 14, 0.16), M(0, 0.01, 0), 0x22211e, PLASTIC);
    w.add(cyl(0.065, 0.012, 12), M(0, 0.055, 0), 0xb4b7ae, CHROME);
    this.mesh(w, this.mat({ wear: 0.6 }), this.wheel);
  }
  setStick(kx: number, ky: number, R: number, live: boolean) {
    this.goal = live ? clamp(kx / R, -1, 1) : 0;
    this.pitchG = live ? clamp(ky / R, -1, 1) : 0;
    if (live && !this.live) sfx('tc_creak', 0.14, 1.7, 0.3);
    this.live = live;
    this.busy = true;
  }
  protected animate(dt: number) {
    const k = 260, c = 2 * Math.sqrt(k) * 0.55;
    this.sv += (-k * (this.steer - this.goal) - c * this.sv) * dt;
    this.steer += this.sv * dt;
    this.wheel.rotation.set(this.pitchG * 0.18, -this.steer * 1.9, 0);
    return this.live || Math.abs(this.sv) > 0.01 || Math.abs(this.steer - this.goal) > 0.002;
  }
}

// =====================================================================
// ATTACK: a big chunky arcade / machine button
// =====================================================================
export class Arcade extends Thing {
  private cap = new THREE.Group();
  private capMat: THREE.ShaderMaterial;
  private shadowM: THREE.Mesh;
  private plateTex: ReturnType<typeof liveTex>;
  armed = 0; lock = false; aimX = 0; aimY = 0;
  private atx = 0; private aty = 0;
  constructor(key = 'attack', private capColor = 0xc2271c, private stripes = true) {
    super(key);
    this.elev = 52 * DEG; this.fit = 1.0; this.k = 2600;
    const pm = this.mat({ wear: 0.6 });
    pm.defines = { USE_MAP: '' };
    const plate = new Mold().add(box(0.98, 0.07, 0.98), M(0, 0.035, 0), 0xffffff, SURF(PAINT, 0.5));
    this.mesh(plate, pm);
    this.plateTex = liveTex(this, pm);
    const hw = new Mold();
    for (const [x, z] of [[-0.41, -0.41], [0.41, -0.41], [-0.41, 0.41], [0.41, 0.41]]) hw.add(cyl(0.038, 0.03, 6), M(x, 0.08, z, 0, 0.4), 0x8e9189, STEEL);
    hw.add(lathe([[0.27, 0.07], [0.375, 0.07], [0.39, 0.11], [0.375, 0.19], [0.335, 0.208], [0.285, 0.205], [0.27, 0.17]], 24), null, chromeC(), CHROME);
    hw.add(cyl(0.272, 0.02, 20), M(0, 0.1, 0), 0x0e0d0c, RUBBER);
    this.mesh(hw, this.mat({ wear: 0.4 }));
    // contact shadow of the cap on the bezel: shrinks as the cap goes down
    this.shadowM = this.shadow(new THREE.CircleGeometry(0.27, 20).rotateX(-PI / 2), this.body, 0.55);
    this.shadowM.position.set(0.06, 0.212, 0.06);
    // the domed cap (lit from inside when armed)
    this.cap.position.set(0, 0.1, 0);
    this.body.add(this.cap);
    this.capMat = this.mat({ wear: 0.25 });
    const cm = new Mold().add(lathe([[0.262, 0.0], [0.266, 0.11], [0.256, 0.162], [0.226, 0.204], [0.17, 0.236], [0.09, 0.252], [0.0, 0.257]], 26), null, this.capColor, [0.55, 0, 1.1, 0], 1);
    cm.add(tor(0.25, 0.012, 4, 26), M(0, 0.15, 0, PI / 2), 0xe8e2d0, [0.4, 0, 0.6, 0], 0.4);
    this.mesh(cm, this.capMat, this.cap);
    this.retex(70);
  }
  protected retex(s: number) {
    const w = 0.98 * s, h = 0.98 * s * Math.sin(this.elev);
    const stripes = this.stripes;
    this.plateTex(w, h, (sc) => {
      const W = sc.w, H = sc.h;
      const sw = Math.max(3, Math.round(W / 9));
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const band = Math.floor((x + y) / sw) & 1;
        let c = stripes ? (band ? 0xd9a521 : 0x1c1914) : 0x3a3d36;
        const n = hash(x, y, 7);
        if (n > 0.93) c = stripes && band ? 0x9c7614 : 0x2c2a24;
        if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) c = 0x2a2924;
        sc.px(x, y, C(c));
      }
    });
  }
  protected onDown() { sfx('tc_clack', 0.62, 1, 0.04); haptic(22); this.armed = 0; }
  protected onUp(cancelled: boolean) { sfx('tc_clack_up', cancelled ? 0.2 : 0.42, 1, 0.04); }
  protected animate(dt: number) {
    const p = this.press;
    this.cap.position.y = 0.1 - p * 0.115;
    const sc = 1 - p * 0.18;
    this.shadowM.scale.set(sc, 1, sc);
    this.shadowM.position.set(0.06 - p * 0.04, 0.212, 0.06 - p * 0.04);
    // dragging aims: the cap leans after the thumb
    this.atx += (this.aimX - this.atx) * Math.min(1, dt * 16);
    this.aty += (this.aimY - this.aty) * Math.min(1, dt * 16);
    this.cap.rotation.set(this.aty * 0.25, 0, -this.atx * 0.25);
    if (this.held) this.armed = Math.min(1, this.armed + dt * 3); else this.armed = Math.max(0, this.armed - dt * 4);
    const pulse = this.lock ? 0.5 + 0.5 * Math.sin(performance.now() * 0.018) : 0;
    setGlow(this.capMat, 0xff3a22, this.armed * (0.35 + pulse * 0.35));
    return this.armed > 0.001 || Math.abs(this.atx - this.aimX) + Math.abs(this.aty - this.aimY) > 0.002 || this.lock;
  }
  dripPoint(): [number, number] { return this.screenOf(this.cap, 0.05, 0.05, 0.26); }
}

// =====================================================================
// RUN: a toggle switch under a flip-up safety cover
// =====================================================================
export class Toggle extends Thing {
  private cover = new THREE.Group();
  private lever = new THREE.Group();
  private lampM: THREE.ShaderMaterial;
  private t = 0;
  constructor(key = 'run', text = 'RUN') {
    super(key);
    this.elev = 42 * DEG; this.fit = 1.05;
    const b = new Mold();
    b.add(box(0.64, 0.05, 0.94), M(0, 0.025, 0), 0x474c45, SURF(STEEL, 0.5));
    for (const z of [-0.4, 0.4]) b.add(cyl(0.035, 0.02, 8), M(0.24, 0.055, z), 0x9a9c95, CHROME);
    b.add(cyl(0.1, 0.04, 6), M(0, 0.07, 0.07), 0xa9aca3, CHROME);
    b.add(cyl(0.06, 0.06, 10), M(0, 0.11, 0.07), 0x8f928a, STEEL);
    b.add(cyl(0.025, 0.36, 8), M(0, 0.09, -0.21, 0, 0, PI / 2), 0x7c1912, PLASTIC); // hinge barrel
    this.mesh(b, this.mat({ wear: 0.6 }));
    this.lever.position.set(0, 0.12, 0.07);
    this.body.add(this.lever);
    this.mesh(new Mold().add(lathe([[0.022, 0], [0.026, 0.12], [0.04, 0.22], [0.045, 0.25], [0.03, 0.28], [0, 0.285]], 10), null, chromeC(0xf0f2ea, 0xa9aca4, 0x55584f), CHROME), this.mat(), this.lever);
    this.cover.position.set(0, 0.09, -0.21);
    this.body.add(this.cover);
    const cv = new Mold();
    const RED = 0xa11c15;
    cv.add(box(0.38, 0.03, 0.5), M(0, 0.26, 0.25), RED, SURF(PLASTIC, 0.8));
    for (const x of [-0.175, 0.175]) cv.add(box(0.03, 0.26, 0.5), M(x, 0.13, 0.25), 0x8e1811, PLASTIC);
    cv.add(box(0.38, 0.26, 0.03), M(0, 0.13, 0.49), 0x93190f, PLASTIC);
    cv.add(box(0.2, 0.025, 0.06), M(0, 0.25, 0.53), 0xb8231a, PLASTIC); // finger lip
    this.mesh(cv, this.mat({ wear: 0.35 }), this.cover);
    this.lampM = lamp(this, 0.2, 0.05, -0.36, 0.055, 0x7a5a1c);
    this.tape(text, -0.02, 0.052, 0.36);
    this.apply();
  }
  private apply() {
    const t = this.t;
    this.cover.rotation.x = -1.95 * smooth(t / 0.55);
    this.lever.rotation.x = 0.9 - 1.6 * smooth((t - 0.55) / 0.45);
    setGlow(this.lampM, 0xffb030, this.on ? 0.9 : 0);
  }
  protected onDown() { haptic(10); }
  protected onToggle(_v: boolean, quiet: boolean) { if (quiet) { this.t = this.on ? 1 : 0; this.apply(); } }
  protected animate(dt: number) {
    const goal = this.on ? 1 : 0, t0 = this.t;
    this.t = goal > this.t ? Math.min(goal, this.t + dt * 4.2) : Math.max(goal, this.t - dt * 5.5);
    const t1 = this.t;
    if (t1 !== t0) {
      if (t1 > t0) { if (t0 <= 0.02 && t1 > 0.02) sfx('tc_cover', 0.4); if (t0 < 0.62 && t1 >= 0.62) { sfx('tc_toggle', 0.55); haptic(12); } }
      else { if (t0 > 0.6 && t1 <= 0.6) { sfx('tc_toggle', 0.5); haptic(12); } if (t0 > 0.06 && t1 <= 0.06) sfx('tc_cover', 0.45, 0.85); }
    }
    this.apply();
    this.dip(0.025);
    return t1 !== goal;
  }
}

// =====================================================================
// USE: a crimped bottle cap with a faded print and a word
// =====================================================================
function crown(): { top: THREE.BufferGeometry; skirt: THREE.BufferGeometry } {
  const N = 126, R0 = 0.37;
  const crimp = (a: number) => { const c = Math.cos(21 * a); return 0.026 * Math.sign(c) * Math.pow(Math.abs(c), 0.55); };
  // top: concentric rings, slightly domed
  const tp: number[] = [], tuv: number[] = [], ti: number[] = [];
  const rings = [0, 0.09, 0.18, 0.26, 0.32, R0];
  tp.push(0, 0.172, 0); tuv.push(0.5, 0.5);
  for (let r = 1; r < rings.length; r++) for (let i = 0; i < N; i++) {
    const a = i / N * PI * 2, rr = rings[r];
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    tp.push(x, 0.172 - 0.012 * (rr / R0) ** 2, z);
    tuv.push(0.5 + x / (R0 * 2), 0.5 - z / (R0 * 2));
  }
  for (let i = 0; i < N; i++) ti.push(0, 1 + (i + 1) % N, 1 + i);
  for (let r = 1; r < rings.length - 1; r++) for (let i = 0; i < N; i++) {
    const a = 1 + (r - 1) * N + i, b = 1 + (r - 1) * N + (i + 1) % N, c = 1 + r * N + i, d = 1 + r * N + (i + 1) % N;
    ti.push(a, b, d, a, d, c);
  }
  const top = new THREE.BufferGeometry();
  top.setAttribute('position', new THREE.Float32BufferAttribute(tp, 3));
  top.setAttribute('uv', new THREE.Float32BufferAttribute(tuv, 2));
  top.setIndex(ti); top.computeVertexNormals();
  // skirt: shoulder, then the crimped flutes flaring out
  const sp: number[] = [], si: number[] = [];
  const prof = (a: number) => [[R0, 0.16, 0], [0.4, 0.148, 0], [0.425, 0.12, 0.4], [0.44, 0.06, 0.9], [0.462, 0.0, 1.25]].map(([r, y, k]) => [r + crimp(a) * k, y]);
  const rows = 5;
  for (let i = 0; i < N; i++) { const a = i / N * PI * 2; for (const [r, y] of prof(a)) sp.push(Math.cos(a) * r, y, Math.sin(a) * r); }
  for (let i = 0; i < N; i++) for (let j = 0; j < rows - 1; j++) {
    const a = i * rows + j, b = ((i + 1) % N) * rows + j;
    si.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const skirt = new THREE.BufferGeometry();
  skirt.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  skirt.setIndex(si); skirt.computeVertexNormals();
  return { top, skirt };
}

const CAP_BRANDS = ['MERIDIAN', 'PALE', 'SOLACE'];
export class BottleCap extends Thing {
  private topM: THREE.ShaderMaterial;
  private tex: ReturnType<typeof liveTex>;
  private word = 'USE'; private shownWord = 'USE'; private weird = false;
  private dent = 0; private hop = 0; private hv = 0;
  private brand = CAP_BRANDS[Math.floor(Math.random() * CAP_BRANDS.length)];
  constructor() {
    super('use');
    this.elev = 60 * DEG; this.fit = 1.05; this.k = 2000;
    const g = crown();
    const tin = (x: number, _y: number, z: number) => (hash(Math.round(x * 30), Math.round(z * 30)) > 0.8 ? 0x8f8a74 : 0xc2bb9f);
    this.mesh(new Mold().add(g.skirt, null, tin, [0.9, 0.9, 0.6, 0]), this.mat({ wear: 0.5 }));
    this.topM = this.mat({ wear: 0.3 });
    this.topM.defines = { USE_MAP: '' };
    this.mesh(new Mold().add(g.top, null, 0xffffff, (x, _y, z) => [0.45, 0.6, 0.9, Math.max(0, 1 - (x * x + z * z) / (0.37 * 0.37))]), this.topM);
    this.tex = liveTex(this, this.topM);
    this.retex(60);
  }
  /** what the cap says (the target in reach), or a word that isn't there */
  setWord(word: string, weird = false) {
    if (word === this.shownWord && weird === this.weird) return;
    const fresh = !weird && word !== this.word && word !== 'USE';
    if (!weird) this.word = word;
    this.shownWord = word; this.weird = weird;
    this.retex(this.s || 60);
    if (fresh) { this.hv -= 2.2; this.busy = true; }
    this.busy = true;
  }
  protected retex(s: number) {
    const w = 0.74 * s, h = 0.74 * s * Math.sin(this.elev);
    const word = this.shownWord.slice(0, Math.max(3, Math.floor((w - 4) / 6)));
    const weird = this.weird, brand = this.brand;
    this.tex(w, h, (sc) => {
      const W = sc.w, H = sc.h, cx = (W - 1) / 2, cy = (H - 1) / 2, rx = W / 2, ry = H / 2;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const nx = (x - cx) / rx, ny = (y - cy) / ry, r = Math.hypot(nx, ny);
        let c = weird ? 0xcfc4a8 : 0xd8cdaa;
        if (r > 0.92) c = 0xa69c80;
        else if (r > 0.74 && r < 0.86) c = weird ? 0x5b1410 : 0xa5372a; // faded logo ring
        else if (r <= 0.74 && ny < -0.25 && ny > -0.62) c = weird ? 0x6a1712 : 0xb04a33; // red banner
        // fade and scratches
        const n = hash(x, y, 11);
        if (n > 0.86) c = 0xc9bea0;
        if (n < 0.05) c = 0x8c836a;
        sc.px(x, y, C(c));
      }
      // tiny brand on the banner (5x7 font, may not fit on small caps: then just a dotted line)
      const bw = sc.textW(brand);
      const by = Math.round(cy - ry * 0.44 - 3);
      if (bw < W * 0.6) sc.text(brand, Math.round(cx - bw / 2 + 0.5), by, C(0xe8dcc0, 200));
      else for (let x = Math.round(cx - rx * 0.4); x < cx + rx * 0.4; x += 2) sc.px(x, Math.round(cy - ry * 0.44), C(0xe8dcc0));
      const tw = sc.textW(word) - 1;
      const tx = Math.round(cx - tw / 2), ty = Math.round(cy - 1);
      sc.text(word, tx + 1, ty + 1, C(0xe9dfc4));
      sc.text(word, tx, ty, C(weird ? 0x2a0503 : 0x3b1d14));
    });
  }
  protected onDown() { sfx('tc_cap', 0.5, 1, 0.04); haptic(14); }
  protected onUp(cancelled: boolean) { if (!cancelled) sfx('tc_cap', 0.35, 1.3, 0.04); this.dent = Math.min(0.02, this.dent + 0.004); }
  protected animate(dt: number) {
    this.topM.uniforms.uDent.value = this.press * 0.07 + this.dent;
    // a little hop when something new comes into reach
    const k = 320, c = 2 * Math.sqrt(k) * 0.35;
    this.hv += (-k * this.hop - c * this.hv) * dt; this.hop += this.hv * dt;
    this.body.position.y = -this.hop * 0.05 - this.press * 0.02;
    this.body.rotation.z = this.hop * 0.08;
    return Math.abs(this.hop) + Math.abs(this.hv) > 0.002;
  }
}

// =====================================================================
// SHOVE: a fire-exit crash bar
// =====================================================================
export class CrashBar extends Thing {
  private bar = new THREE.Group();
  constructor() {
    super('shove');
    this.elev = 46 * DEG; this.fit = 1.0; this.k = 1800;
    const b = new Mold();
    b.add(box(1.96, 0.06, 0.34), M(0, 0.03, 0), 0x565a53, SURF(STEEL, 0.4));
    for (const x of [-0.86, 0.86]) {
      b.add(box(0.27, 0.22, 0.46), M(x, 0.11, 0), 0x666a62, PAINT);
      b.add(box(0.29, 0.03, 0.48), M(x, 0.225, 0), 0x777b72, PAINT);
      b.add(cyl(0.025, 0.02, 6), M(x, 0.245, 0.12), 0xa5a79f, CHROME);
    }
    b.add(box(0.06, 0.04, 0.1), M(0.95, 0.12, 0.25), 0x9a9c94, STEEL); // latch bolt
    this.mesh(b, this.mat({ wear: 0.7 }));
    this.bar.position.set(0, 0.2, 0.04);
    this.body.add(this.bar);
    const br = new Mold();
    br.add(cyl(0.085, 1.42, 12), M(0, 0, 0, 0, 0, PI / 2), (x) => (Math.abs(x) > 0.6 ? 0x8b1f15 : 0xa8291d), SURF(PAINT, 1));
    for (const x of [-0.72, 0.72]) br.add(box(0.1, 0.12, 0.18), M(x, -0.04, -0.02), 0x5f635c, STEEL);
    this.mesh(br, this.mat({ wear: 0.75 }), this.bar);
    this.tape('PUSH', 0, 0.088, 0.0, 'up', this.bar, 0xf2eee2, 0x9c1f15);
  }
  protected onDown() { sfx('tc_bar', 0.6, 1, 0.05); haptic(26); }
  protected onUp(c: boolean) { if (!c) sfx('tc_clack_up', 0.25, 0.7, 0.05); }
  protected animate() {
    this.bar.position.y = 0.2 - this.press * 0.08;
    this.bar.rotation.x = this.press * 0.12;
    return false;
  }
}

// =====================================================================
// SNEAK: a stained terry-cloth slipper (it stands on its toes while sneaking)
// =====================================================================
export class Slipper extends Thing {
  private shoe = new THREE.Group();
  private pomM: THREE.ShaderMaterial;
  private tip = 0;
  constructor() {
    super('sneak');
    this.elev = 58 * DEG; this.fit = 1.12; this.k = 900;
    this.shoe.rotation.y = -0.62;
    this.shoe.position.set(0.0, 0, 0.0);
    this.body.add(this.shoe);
    const terry = (x: number, y: number, z: number) => { const n = hash(Math.round(x * 14), Math.round(y * 14), Math.round(z * 14)); return n > 0.86 ? 0x8a6a5c : n > 0.72 ? 0xb58b8b : 0xcfa3a3; };
    const s = new Mold();
    // a thick, scuffed rubber sole and a cream insole, open at the heel
    s.add(cyl(1, 1, 18), M(0, 0.03, 0, 0, 0, 0, 0.21, 0.06, 0.47), 0x4d463d, RUBBER);
    s.add(cyl(1, 1, 18), M(0, 0.068, 0.01, 0, 0, 0, 0.19, 0.02, 0.44), (x, _y, z) => (hash(Math.round(x * 20), Math.round(z * 20), 2) > 0.8 ? 0xa89574 : 0xd9ccb2), CLOTH);
    // the toe cap: the front half of a dome, its open edge is the throat
    s.add(new THREE.SphereGeometry(1, 14, 7, PI, PI, 0, PI / 2), M(0, 0.07, 0.02, 0, 0, 0, 0.215, 0.2, 0.42), terry, SURF(CLOTH, 1));
    s.add(new THREE.TorusGeometry(0.205, 0.03, 4, 12, PI), M(0, 0.07, 0.02, 0, 0, 0, 1, 0.98, 1), 0x9c6f72, CLOTH);
    // a dark heel print in the insole
    s.add(cyl(1, 1, 12), M(0, 0.08, 0.27, 0, 0, 0, 0.1, 0.004, 0.12), 0x8a7558, CLOTH);
    this.mesh(s, this.mat({ wear: 0.9 }), this.shoe);
    this.pomM = this.mat();
    this.mesh(new Mold().add(sph(0.1, 8, 6), M(0, 0.25, -0.18), (x, y, z) => (hash(Math.round(x * 40), Math.round(y * 40), Math.round(z * 40)) > 0.6 ? 0xf0cfd2 : 0xd9aeb3), CLOTH, 1), this.pomM, this.shoe);
    this.tape('SNEAK', 0, 0.004, 0.47);
  }
  protected onDown() { sfx('tc_squish', 0.45); haptic(8); }
  protected animate(dt: number) {
    const goal = this.on ? 1 : 0;
    this.tip += (goal - this.tip) * Math.min(1, dt * 8);
    const sq = 1 - this.press * 0.4;
    this.shoe.scale.set(1 + this.press * 0.12, sq, 1 + this.press * 0.06);
    // up on its toes while sneaking
    this.shoe.rotation.x = this.tip * 0.5;
    this.shoe.position.y = this.tip * 0.12;
    setGlow(this.pomM, 0xffb84a, this.on ? 0.6 + Math.sin(performance.now() * 0.004) * 0.12 : 0);
    return Math.abs(goal - this.tip) > 0.003;
  }
}

// =====================================================================
// LIGHT: a bare bulb with a ball-chain pull
// =====================================================================
export class PullChain extends Thing {
  private chain = new THREE.Group();
  private lampG = new THREE.Group();
  private bulbM: THREE.ShaderMaterial;
  private halo: THREE.Mesh;
  private sw = 0; private swv = 0; private flick = 0; private lsw = 0; private lswv = 0;
  constructor() {
    super('light');
    this.elev = 12 * DEG; this.fit = 1.0; this.k = 900;
    // ceiling rose and a twisted flex
    const r = new Mold();
    r.add(cyl(0.3, 0.07, 16), M(0, 1.14, 0), 0xd8d3c6, CERAMIC);
    r.add(cyl(0.12, 0.06, 10), M(0, 1.08, 0), 0xc9c3b4, CERAMIC);
    this.mesh(r, this.mat({ wear: 0.9 }));
    this.lampG.position.set(0, 1.06, 0);
    this.body.add(this.lampG);
    const b = new Mold();
    for (let i = 0; i < 6; i++) b.add(cyl(0.022, 0.07, 5), M((i & 1) ? 0.012 : -0.012, -0.04 - i * 0.06, 0, 0, 0, (i & 1) ? 0.3 : -0.3), 0x2b2723, RUBBER);
    // bakelite socket, brass screw, then the glass
    b.add(cyl(0.12, 0.26, 12, 0.14), M(0, -0.5, 0), 0x2a2622, PLASTIC);
    b.add(cyl(0.035, 0.05, 6), M(0.15, -0.47, 0.0, 0, 0, PI / 2), 0x8c8a80, STEEL);
    for (let i = 0; i < 3; i++) b.add(cyl(0.095, 0.03, 12), M(0, -0.66 - i * 0.035, 0), i & 1 ? 0x8a6f38 : 0xb8994e, BRASS);
    this.mesh(b, this.mat({ wear: 0.6 }), this.lampG);
    this.halo = this.shadow(new THREE.CircleGeometry(0.62, 20), this.lampG, 0.3, 0xf5c463);
    this.halo.position.set(0, -0.98, -0.4);
    this.halo.visible = false;
    this.bulbM = this.mat();
    const bl = new Mold().add(lathe([[0, 0], [0.12, 0.02], [0.2, 0.09], [0.225, 0.19], [0.2, 0.29], [0.13, 0.37], [0.09, 0.42]], 14), M(0, -1.14, 0), (_x, y) => (y < -1.05 ? 0xb3ad94 : 0xa7a188), GLASS, 1)
      .add(cyl(0.008, 0.16, 4), M(-0.03, -0.92, 0.0, 0, 0, 0.5), 0x2a241c, STEEL, 0.9).add(cyl(0.008, 0.16, 4), M(0.03, -0.92, 0.0, 0, 0, -0.5), 0x2a241c, STEEL, 0.9);
    this.mesh(bl, this.bulbM, this.lampG);
    // the ball chain hangs from the socket's switch
    this.chain.position.set(0.19, 0.59, 0.02);
    this.body.add(this.chain);
    const ch = new Mold();
    for (let i = 0; i < 16; i++) ch.add(sph(0.03, 6, 4), M(0, -0.04 - i * 0.08, 0), 0xa08d58, BRASS);
    ch.add(lathe([[0, 0], [0.06, 0.015], [0.078, 0.09], [0.055, 0.17], [0.016, 0.2]], 10), M(0, -1.5, 0), 0xb0974f, SURF(BRASS, 1));
    this.mesh(ch, this.mat({ wear: 0.5 }), this.chain);
    this.tape('LIGHT', -0.18, -0.98, 0.15, 'front');
  }
  protected onDown() { sfx('tc_chain', 0.5); haptic(12); this.swv += (Math.random() - 0.5) * 2; this.lswv += 0.6; }
  protected onUp() { this.swv += (Math.random() - 0.5) * 3; }
  /** a knock sets it swinging */
  jolt(x: number, y: number, r: number) { super.jolt(x, y, r); this.swv += x * 0.4 + r * 6; this.lswv += x * 0.15 + r * 3; }
  protected animate(dt: number) {
    // pendulums: the chain, and the lamp on its flex
    this.swv += (-22 * this.sw - 0.9 * this.swv) * dt; this.sw += this.swv * dt;
    this.lswv += (-14 * this.lsw - 0.7 * this.lswv) * dt; this.lsw += this.lswv * dt;
    this.chain.rotation.z = this.sw * 0.35 + this.lsw * 0.3;
    this.chain.position.set(0.19 + this.lsw * 0.3, 0.59 - this.press * 0.24, 0.02);
    this.lampG.rotation.z = this.lsw * 0.3;
    // the bulb, with a dirty filament flutter
    this.flick -= dt;
    let k = this.on ? 1 : 0;
    if (this.on && this.flick < 0) { this.flick = 0.05 + Math.random() * 2.5; k = 0.55; }
    setGlow(this.bulbM, 0xffd27a, k);
    this.halo.visible = this.on;
    return Math.abs(this.sw) + Math.abs(this.swv) + Math.abs(this.lsw) + Math.abs(this.lswv) > 0.002;
  }
}

// =====================================================================
// SHOUT: a pea whistle on a lanyard
// =====================================================================
export class Whistle extends Thing {
  private wg = new THREE.Group();
  private shake = 0;
  constructor() {
    super('shout');
    this.elev = 16 * DEG; this.fit = 1.0;
    this.wg.position.set(0.06, 0.06, 0);
    this.body.add(this.wg);
    const m = new Mold();
    const cr = chromeC();
    // side view: the round chamber and the mouthpiece off its shoulder
    m.add(cyl(0.25, 0.3, 18), M(0.13, 0.0, 0, PI / 2), cr, SURF(CHROME, 1));
    m.add(box(0.48, 0.16, 0.26), M(-0.23, 0.17, 0), cr, CHROME);
    m.add(box(0.1, 0.12, 0.22), M(-0.5, 0.17, 0), chromeC(0xd0d2ca, 0x8a8d86, 0x434641), CHROME);
    m.add(box(0.12, 0.03, 0.2), M(0.0, 0.25, 0), 0x0d0d0d, RUBBER);
    m.add(cyl(0.12, 0.31, 14), M(0.13, 0.0, 0, PI / 2), 0x6c6f69, STEEL);
    m.add(tor(0.085, 0.02, 5, 14), M(-0.62, 0.17, 0), chromeC(), CHROME);
    const cord: [number, number, number][] = [[-0.68, 0.11, 0], [-0.7, -0.05, 0.05], [-0.6, -0.22, 0.08], [-0.42, -0.32, 0.1], [-0.2, -0.36, 0.1], [0.05, -0.4, 0.08], [0.32, -0.42, 0.05]];
    for (let i = 0; i < cord.length - 1; i++) rod(m, cord[i], cord[i + 1], 0.024, 0xa3261c, CLOTH, 5);
    this.mesh(m, this.mat({ wear: 0.45 }), this.wg);
    this.tape('SHOUT', 0.1, -0.33, 0.25, 'front');
  }
  protected onDown() {
    sfx('tc_pea', 0.45); haptic(10); this.shake = 1;
    const P = spark();
    if (P) {
      const [x, y] = this.screenOf(this.wg, -0.56, 0.17, 0);
      for (let i = 0; i < 6; i++) P.spawn(x, y, -40 - Math.random() * 70, (Math.random() - 0.5) * 40, 0.35 + Math.random() * 0.2, 2, 2, 0xe8e4d8, { drag: 3, a: 0.6 });
    }
  }
  protected animate(dt: number) {
    this.shake = Math.max(0, this.shake - dt * 3);
    const t = performance.now() * 0.06;
    this.wg.rotation.z = Math.sin(t) * 0.12 * this.shake;
    this.wg.position.y = 0.06 - this.press * 0.05;
    return this.shake > 0;
  }
}

// =====================================================================
// TALK: a CB hand mic (push to talk)
// =====================================================================
export class Mic extends Thing {
  private ledM: THREE.ShaderMaterial;
  constructor() {
    super('talk');
    this.elev = 52 * DEG; this.fit = 1.0;
    const m = new Mold();
    m.add(box(0.4, 0.15, 0.6), M(0, 0.1, -0.02), 0x23221f, SURF(PLASTIC, 1));
    m.add(sph(1, 12, 6, 0, PI / 2), M(0, 0.1, -0.32, 0, 0, 0, 0.2, 0.075, 0.08), 0x23221f, PLASTIC);
    for (let i = 0; i < 5; i++) m.add(box(0.26, 0.01, 0.025), M(0, 0.18, -0.24 + i * 0.05), 0x5a5853, STEEL);
    m.add(box(0.05, 0.08, 0.3), M(-0.22, 0.1, 0.02), 0x7d7b74, RUBBER);
    const coil: [number, number, number][] = [];
    for (let i = 0; i <= 14; i++) { const a = i * 1.3; coil.push([0.05 + Math.cos(a) * 0.05 + i * 0.02, 0.06 + Math.sin(a) * 0.04, 0.3 + i * 0.012]); }
    for (let i = 0; i < coil.length - 1; i++) rod(m, coil[i], coil[i + 1], 0.016, 0x191816, RUBBER, 4);
    this.mesh(m, this.mat({ wear: 0.4 }));
    this.ledM = lamp(this, 0.12, 0.175, 0.14, 0.035, 0x3a0d0a);
    this.tape('TALK', 0, 0.004, 0.44);
  }
  protected onDown() { sfx('tc_knob', 0.4, 1.3); haptic(8); }
  protected animate() { this.dip(0.03); setGlow(this.ledM, 0xff2a1a, this.held || this.on ? 1 : 0); return false; }
}

// =====================================================================
// top bar: tape-deck piano keys (MENU / FULL)
// =====================================================================
type Glyph = (s: Screen, c: number) => void;
const GLYPHS: Record<string, Glyph> = {
  pause: (s, c) => { const h = s.h - 2; s.rect(2, 1, 3, h, c); s.rect(s.w - 5, 1, 3, h, c); },
  full: (s, c) => { const w = s.w, h = s.h; for (const [x, y, dx, dy] of [[0, 0, 1, 1], [w - 1, 0, -1, 1], [0, h - 1, 1, -1], [w - 1, h - 1, -1, -1]]) { for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) { s.px(x + dx * i, y + dy * j, c); s.px(x + dx * j, y + dy * i, c); } } },
};
export class PianoKey extends Thing {
  private keyG = new THREE.Group();
  constructor(key: string, glyph: string) {
    super(key);
    this.elev = 50 * DEG; this.fit = 1.0; this.k = 1600;
    this.mesh(new Mold().add(box(0.92, 0.06, 0.96), M(0, 0.03, 0), 0x1d1d1b, PLASTIC).add(box(0.82, 0.02, 0.86), M(0, 0.065, 0), 0x0b0b0a, RUBBER), this.mat());
    this.keyG.position.set(0, 0.07, -0.42);
    this.body.add(this.keyG);
    const k = new Mold();
    k.add(box(0.76, 0.17, 0.8), M(0, 0.085, 0.42), 0xaeb2aa, SURF(STEEL, 0.5));
    k.add(box(0.76, 0.06, 0.05), M(0, 0.15, 0.82), 0xc6c9c1, CHROME);
    this.mesh(k, this.mat({ wear: 0.5 }), this.keyG);
    const g = GLYPHS[glyph];
    this.decal(13, 10, (s) => g?.(s, C(0x161614)), 0, 0.172, 0.44, 'up', this.keyG);
  }
  protected onDown() { sfx('tc_key', 0.5); haptic(10); }
  protected animate() { this.keyG.rotation.x = this.press * 0.17; return false; }
}

// =====================================================================
// PHOTO: a disposable camera
// =====================================================================
export class Camera extends Thing {
  private flashM: THREE.ShaderMaterial;
  private shutter = new THREE.Group();
  private flash = 0;
  constructor() {
    super('photo');
    this.elev = 22 * DEG; this.fit = 1.05;
    const m = new Mold();
    m.add(box(0.94, 0.52, 0.34), M(0, 0, 0), (_x, y, z) => (z > 0.16 ? (y > 0.1 ? 0xd2a72a : y > -0.12 ? 0x2f6b3a : 0x151515) : 0x1a1a1a), SURF(PLASTIC, 0.7));
    m.add(cyl(0.16, 0.06, 14), M(0.14, -0.02, 0.19, PI / 2), 0x9a9c95, CHROME);
    m.add(cyl(0.11, 0.07, 14), M(0.14, -0.02, 0.21, PI / 2), 0x14171c, GLASS);
    m.add(box(0.14, 0.09, 0.05), M(-0.33, 0.16, 0.17), 0x101214, GLASS);
    m.add(cyl(0.11, 0.05, 12), M(-0.32, 0.28, -0.05), 0x2a2a28, RUBBER);
    this.mesh(m, this.mat({ wear: 0.6 }));
    this.flashM = this.mat();
    this.mesh(new Mold().add(box(0.2, 0.08, 0.02), M(0.3, 0.17, 0.175), 0xbfc4c0, GLASS, 1), this.flashM);
    this.shutter.position.set(0.32, 0.27, -0.02);
    this.body.add(this.shutter);
    this.mesh(new Mold().add(cyl(0.05, 0.04, 8), null, 0xb22a20, PLASTIC), this.mat(), this.shutter);
  }
  protected onDown() { sfx('tc_shutter', 0.5); haptic(10); this.flash = 1; }
  protected animate(dt: number) {
    this.shutter.position.y = 0.27 - this.press * 0.025;
    this.flash = Math.max(0, this.flash - dt * 5);
    setGlow(this.flashM, 0xffffff, this.flash * 1.2);
    return this.flash > 0;
  }
}

// =====================================================================
// MAP: a folded paper map (it opens while the map is up)
// =====================================================================
export class FoldMap extends Thing {
  private panels: THREE.Mesh[] = [];
  private tex: ReturnType<typeof liveTex>;
  private open = 0;
  constructor() {
    super('map');
    this.elev = 58 * DEG; this.fit = 1.0;
    const mat = this.mat({ wear: 0.4 });
    mat.defines = { USE_MAP: '' };
    for (let i = 0; i < 3; i++) {
      const g = new THREE.PlaneGeometry(0.32, 0.86).rotateX(-PI / 2);
      const uv = g.getAttribute('uv') as THREE.BufferAttribute;
      for (let j = 0; j < uv.count; j++) uv.setX(j, (i + uv.getX(j)) / 3);
      const me = this.mesh(new Mold().add(g, null, 0xffffff, SURF(PAPER, 1)), mat);
      this.panels.push(me);
    }
    this.tex = liveTex(this, mat);
    this.retex(46);
    this.layout();
  }
  protected retex(s: number) {
    this.tex(0.96 * s, 0.86 * s * Math.sin(this.elev), (sc) => {
      const W = sc.w, H = sc.h;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let c = 0xcdbf96;
        if (x % 6 === 0 || y % 6 === 0) c = 0xb8aa82;
        if (hash(x >> 2, y >> 2, 5) > 0.86) c = 0x9aa786;
        if ((x - W * 0.7) ** 2 / 30 + (y - H * 0.25) ** 2 / 14 < 1) c = 0x7f98a0;
        sc.px(x, y, C(c));
      }
      let px = 2, py = H - 3;
      for (let i = 0; i < 40; i++) { if (i % 3 !== 2) sc.px(px, py, C(0xb3261c)); px += 0.6; py -= (i % 4 === 0 ? 1 : 0.3); if (px > W - 3 || py < 2) break; }
      sc.line(Math.round(W * 0.6) - 2, 3, Math.round(W * 0.6) + 2, 7, C(0x8a1a12));
      sc.line(Math.round(W * 0.6) + 2, 3, Math.round(W * 0.6) - 2, 7, C(0x8a1a12));
    });
  }
  private layout() {
    // a half-opened accordion: the middle panel on top, the outer ones sloping down to the table
    const f = (1 - this.open) * 0.45, w = 0.32;
    const c = Math.cos(f), sn = Math.sin(f);
    const lift = 0.02 + this.open * 0.04, H = lift + w * sn;
    this.panels[1].position.set(0, H, 0); this.panels[1].rotation.z = 0;
    this.panels[0].position.set(-w / 2 - (w / 2) * c, H - (w / 2) * sn, 0); this.panels[0].rotation.z = f;
    this.panels[2].position.set(w / 2 + (w / 2) * c, H - (w / 2) * sn, 0); this.panels[2].rotation.z = -f;
  }
  protected onDown() { sfx('tc_paper', 0.45); haptic(6); }
  protected animate(dt: number) {
    const goal = this.on ? 1 : 0;
    this.open += (goal - this.open) * Math.min(1, dt * 7);
    this.layout();
    this.dip(0.05);
    return Math.abs(goal - this.open) > 0.003;
  }
}

// =====================================================================
// SEER: the scanner in miniature
// =====================================================================
export class MiniSeer extends Thing {
  private scrM: THREE.ShaderMaterial;
  constructor() {
    super('scanner');
    this.elev = 56 * DEG; this.fit = 1.0;
    const m = new Mold();
    m.add(box(0.62, 0.14, 0.9), M(0, 0.07, 0), 0x5c6441, SURF(PAINT, 0.8));
    m.add(box(0.66, 0.1, 0.12), M(0, 0.06, 0.43), 0x2b2b27, RUBBER);
    m.add(box(0.5, 0.02, 0.44), M(0, 0.145, -0.12), 0x1c1f17, PLASTIC);
    m.add(cyl(0.022, 0.38, 6), M(-0.2, 0.3, -0.42, -0.5, 0, 0.1), 0x1a1a18, RUBBER);
    m.add(cyl(0.08, 0.05, 10), M(0.17, 0.165, 0.24), 0x22221f, RUBBER);
    for (let i = 0; i < 3; i++) m.add(box(0.08, 0.03, 0.06), M(-0.18 + i * 0.12, 0.155, 0.26), 0xd9d1b2, PLASTIC);
    this.mesh(m, this.mat({ wear: 0.7 }));
    this.scrM = this.mat();
    this.mesh(new Mold().add(box(0.42, 0.012, 0.36), M(0, 0.157, -0.12), (x, _y, z) => ((Math.round(z * 40) & 1) ? 0x5ec86a : 0x4bb35a), GLASS, 1), this.scrM);
  }
  protected onDown() { sfx('tc_key', 0.4, 1.4); haptic(8); }
  protected animate() {
    this.dip(0.03);
    const t = performance.now() * 0.001;
    setGlow(this.scrM, 0x7dff8a, this.on ? 0.8 + Math.sin(t * 9) * 0.08 : 0.22 + (Math.sin(t * 1.3) > 0.97 ? 0.3 : 0));
    return false;
  }
}

// =====================================================================
// PACK: a canvas rucksack (its flap is open while the pack is)
// =====================================================================
export class Rucksack extends Thing {
  private flap = new THREE.Group();
  private open = 0;
  constructor() {
    super('inv');
    this.elev = 24 * DEG; this.fit = 1.05; this.k = 900;
    const m = new Mold();
    const canvas = (x: number, y: number, z: number) => (hash(Math.round(x * 16), Math.round(y * 16), Math.round(z * 16)) > 0.82 ? 0x4c5030 : 0x5f6439);
    m.add(box(0.64, 0.6, 0.36), M(0, -0.12, 0), canvas, SURF(CLOTH, 0.8));
    m.add(sph(1, 12, 6, 0, PI / 2), M(0, 0.18, 0, 0, 0, 0, 0.32, 0.16, 0.18), canvas, CLOTH);
    m.add(box(0.46, 0.26, 0.12), M(0, -0.25, 0.22), 0x575c33, CLOTH);
    for (const x of [-0.36, 0.36]) m.add(box(0.1, 0.3, 0.26), M(x, -0.24, 0.0), 0x535830, CLOTH);
    m.add(new THREE.TorusGeometry(0.09, 0.022, 4, 10, PI), M(0, 0.32, 0), 0x3d2c1c, CLOTH);
    this.mesh(m, this.mat({ wear: 0.85 }));
    this.flap.position.set(0, 0.3, -0.16);
    this.body.add(this.flap);
    const f = new Mold();
    f.add(box(0.62, 0.05, 0.4), M(0, 0.0, 0.18), 0x4f5430, CLOTH);
    f.add(box(0.62, 0.3, 0.05), M(0, -0.13, 0.39), 0x4f5430, CLOTH);
    for (const x of [-0.17, 0.17]) {
      f.add(box(0.07, 0.48, 0.02), M(x, -0.22, 0.42), 0x3b2a1a, CLOTH);
      f.add(box(0.11, 0.07, 0.03), M(x, -0.3, 0.43), 0xc0a35a, BRASS);
    }
    this.mesh(f, this.mat({ wear: 0.85 }), this.flap);
  }
  protected onDown() { sfx('tc_zip', 0.4); haptic(8); }
  protected animate(dt: number) {
    const goal = this.on ? 1 : 0;
    this.open += (goal - this.open) * Math.min(1, dt * 8);
    this.flap.rotation.x = -this.open * 1.7;
    const sq = 1 - this.press * 0.15;
    this.body.scale.set(1 + this.press * 0.08, sq, 1);
    return Math.abs(goal - this.open) > 0.003;
  }
}

// =====================================================================
// CHAT: a bakelite telephone handset
// =====================================================================
export class Handset extends Thing {
  constructor() {
    super('chat');
    this.elev = 40 * DEG; this.fit = 1.0;
    const m = new Mold();
    m.add(box(0.62, 0.1, 0.16), M(0, 0.12, 0), 0x1b1a18, SURF(PLASTIC, 0.8));
    for (const x of [-0.32, 0.32]) m.add(cyl(0.15, 0.14, 12, 0.11), M(x, 0.06, 0.02), 0x1b1a18, PLASTIC);
    m.add(cyl(0.1, 0.01, 10), M(0.32, -0.015, 0.02), 0x3a3a36, STEEL);
    this.mesh(m, this.mat({ wear: 0.4 }));
  }
  protected onDown() { sfx('tc_knob', 0.4, 0.8); haptic(8); }
  protected animate() { this.body.position.y = this.press * 0.08; this.body.rotation.z = this.press * 0.15; return false; }
}

// =====================================================================
// vehicle: pedals, horn, headlight knob, ignition key, door handle
// =====================================================================
export class Pedal extends Thing {
  private pad = new THREE.Group();
  constructor(key: string, private wide: boolean) {
    super(key);
    this.elev = 34 * DEG; this.fit = 1.0; this.k = 700;
    this.mesh(new Mold().add(box(0.94, 0.04, 0.98), M(0, 0.02, 0), (x) => ((Math.round(x * 24) & 1) ? 0x2d2c29 : 0x24231f), RUBBER), this.mat());
    this.pad.position.set(0, 0.05, wide ? -0.3 : 0.38);
    this.body.add(this.pad);
    const p = new Mold();
    const W = wide ? 0.74 : 0.42, D = wide ? 0.5 : 0.82;
    const z0 = wide ? 0.35 : -0.42;
    p.add(box(W, 0.06, D), M(0, 0.05, z0), (x, _y, z) => ((Math.round((wide ? x : z) * 26) & 1) ? 0x34332f : 0x1c1b18), SURF(RUBBER, 0.8));
    p.add(box(W + 0.04, 0.03, D + 0.04), M(0, 0.015, z0), 0x8f918a, STEEL);
    if (wide) p.add(box(0.08, 0.05, 0.4), M(0, 0.03, 0.0), 0x6f726b, STEEL);
    this.mesh(p, this.mat({ wear: 0.5 }), this.pad);
    this.tape(wide ? 'BRAKE' : 'GAS', 0, 0.045, wide ? 0.4 : -0.38, 'up', this.body);
  }
  protected onDown() { sfx('tc_clunk', 0.3, this.wide ? 0.8 : 1.2); haptic(10); }
  protected animate() {
    // gas hinges at its heel, brake hangs from above
    this.pad.rotation.x = this.wide ? 0.32 - this.press * 0.3 : -0.42 + this.press * 0.36;
    return false;
  }
}

export class Horn extends Thing {
  private cap = new THREE.Group();
  constructor() {
    super('horn');
    this.elev = 56 * DEG; this.fit = 1.0; this.k = 1800;
    this.mesh(new Mold().add(lathe([[0.3, 0], [0.42, 0], [0.43, 0.06], [0.36, 0.12], [0.3, 0.1]], 22), null, 0xa5a8a0, CHROME), this.mat());
    this.cap.position.y = 0.06;
    this.body.add(this.cap);
    this.mesh(new Mold().add(lathe([[0.3, 0], [0.3, 0.06], [0.24, 0.13], [0.12, 0.16], [0, 0.165]], 20), null, 0x1c1b19, SURF(RUBBER, 1)), this.mat(), this.cap);
    this.decal(11, 7, (s) => {
      const c = C(0xb7b9b0);
      s.rect(0, 2, 3, 3, c); for (let i = 0; i < 6; i++) s.vline(3 + i, 3 - (i >> 1), 3 + (i >> 1), c);
      s.px(10, 1, c); s.px(10, 5, c); s.px(10, 3, c);
    }, 0, 0.168, 0.0, 'up', this.cap);
  }
  protected onDown() { haptic([18, 10, 18]); }
  protected animate() { this.cap.position.y = 0.06 - this.press * 0.06; return false; }
}

export class PullKnob extends Thing {
  private knob = new THREE.Group();
  private out = 0;
  constructor() {
    super('hlights');
    this.elev = 50 * DEG; this.fit = 1.0;
    this.mesh(new Mold().add(box(0.8, 0.04, 0.8), M(0, 0.02, 0), 0x22211e, PLASTIC).add(cyl(0.2, 0.03, 16), M(0, 0.05, -0.06), 0x9fa39b, CHROME), this.mat());
    this.knob.position.set(0, 0.05, -0.06);
    this.body.add(this.knob);
    this.mesh(new Mold().add(cyl(0.04, 0.2, 8), M(0, 0.1, 0), 0x8a8d86, STEEL).add(cyl(0.16, 0.1, 14, 0.18), M(0, 0.2, 0), 0xc0c3ba, CHROME), this.mat(), this.knob);
    this.decal(9, 7, (s) => {
      const c = C(0xe8b84a);
      s.rect(0, 1, 3, 5, c); s.px(3, 0, c); s.px(3, 6, c);
      for (let i = 0; i < 3; i++) s.hline(5, 8, 1 + i * 2, c);
    }, 0, 0.042, 0.3);
  }
  protected onDown() { haptic(8); }
  protected onToggle(_v: boolean, quiet: boolean) { if (!quiet) sfx('tc_knob', 0.45, this.on ? 1 : 0.85); else this.out = this.on ? 1 : 0; }
  protected animate(dt: number) {
    const goal = this.on ? 1 : 0;
    this.out += (goal - this.out) * Math.min(1, dt * 14);
    this.knob.position.y = 0.05 + this.out * 0.12 - this.press * 0.02;
    return Math.abs(goal - this.out) > 0.003;
  }
}

export class Ignition extends Thing {
  private keyG = new THREE.Group();
  private turn = 0;
  private lab: { redraw: (d?: (s: Screen) => void) => void } | null = null;
  private labText = '';
  constructor() {
    super('ign');
    this.elev = 54 * DEG; this.fit = 1.0;
    const b = new Mold();
    b.add(box(0.86, 0.04, 0.86), M(0, 0.02, 0), 0x22211e, PLASTIC);
    b.add(lathe([[0.18, 0.04], [0.3, 0.04], [0.31, 0.08], [0.24, 0.12], [0.18, 0.11]], 20), M(0, 0, -0.05), 0xaeb1a8, CHROME);
    b.add(cyl(0.18, 0.02, 18), M(0, 0.105, -0.05), 0x3b3b37, STEEL);
    this.mesh(b, this.mat());
    this.keyG.position.set(0, 0.11, -0.05);
    this.body.add(this.keyG);
    const k = new Mold();
    k.add(box(0.05, 0.1, 0.03), M(0, 0.05, 0), 0xb79c55, BRASS);
    k.add(cyl(0.14, 0.04, 14), M(0, 0.18, 0, 0, 0, PI / 2), 0xbca159, SURF(BRASS, 0.8));
    k.add(tor(0.05, 0.012, 4, 10), M(0, 0.32, 0.0), 0x8f918a, STEEL);
    this.mesh(k, this.mat({ wear: 0.4 }), this.keyG);
    this.setText('START');
  }
  setText(t: string) {
    if (t === this.labText) return;
    this.labText = t;
    if (!this.lab) this.lab = this.tape('START', 0, 0.042, 0.32);
    this.lab.redraw((s) => { s.data.fill(0); drawTape(s, t); });
  }
  protected onDown() { sfx('tc_ign', 0.5); haptic(12); }
  protected animate(dt: number) {
    const goal = (this.held ? 1.75 : this.on ? 1.2 : 0);
    this.turn += (goal - this.turn) * Math.min(1, dt * 16);
    this.keyG.rotation.y = -this.turn;
    return Math.abs(goal - this.turn) > 0.003;
  }
}

export class DoorHandle extends Thing {
  private lever = new THREE.Group();
  constructor(key: string) {
    super(key);
    this.elev = 50 * DEG; this.fit = 1.0;
    this.mesh(new Mold().add(box(0.84, 0.05, 0.56), M(0, 0.025, 0), 0x2a2926, PLASTIC).add(box(0.7, 0.02, 0.4), M(0, 0.055, 0), 0x121110, RUBBER), this.mat());
    this.lever.position.set(-0.3, 0.07, 0);
    this.body.add(this.lever);
    this.mesh(new Mold().add(box(0.62, 0.06, 0.14), M(0.3, 0.02, 0), 0xc0c3ba, SURF(CHROME, 0.8)).add(cyl(0.04, 0.1, 8), M(0, 0.0, 0), 0x8a8d86, STEEL), this.mat(), this.lever);
    this.tape('EXIT', 0, 0.052, 0.34);
  }
  protected onDown() { sfx('tc_knob', 0.45, 0.7); haptic(10); }
  protected animate() { this.lever.rotation.x = -this.press * 0.5; return false; }
}
