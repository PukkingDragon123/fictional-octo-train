// The theatre's instruments, as physical objects in the stage's full-resolution
// foreground layer (stage.fg): a green-enamel tele-diagnostic CRT (a real tube
// from src/gfx/crt.ts, phosphor text in the --font-crt face, two bakelite knobs), a
// riveted control desk with Nixie-tube credits, a drum counter for research
// points, the DEAL lever and the red DISCHARGE mushroom button under engraved
// brass plates, the typewritten manila tag that hangs off whatever part of the
// subject the pointer is on, and the discharge slip with its rubber stamp.
// Plates, tags and slips are printed with the craft kit (src/craft/tags.ts),
// metals are physically based (src/craft/metal.ts via stage.pbr).
import * as THREE from 'three';
import { crtScreen, phosphorText, fontsReady, cssFont, type CrtScreen } from '../../gfx/crt';
import { pixTag, tagString, setString, stamp, type PixTag, type TagKind } from '../../craft/tags';
import { ModelBuilder } from '../../gfx/modelBuilder';
import { shapes, smoothNormals } from '../../entities/cyberGear';
import { pbr } from './stage';
import { fpArm, type FpArm, type HandPose } from '../../fp/hands';
import { csfx } from './audio';

// type comes from the font tokens (src/ui/fonts.css), read when drawn so a face swap just works
const fCrt = () => cssFont('--font-crt');
const fNixie = () => cssFont('--font-nixie');
const fType = () => cssFont('--font-typeset');
export const PH = { hi: '#c8ffd4', mid: '#62e48e', dim: '#23743e', inv: '#06140a' };

/** a printed sheet / plate whose material is lit by this stage (the craft kit's env belongs to the game's renderer) */
function sheet(kind: TagKind, w: number, h: number, size: number): PixTag {
  const t = pixTag(kind, w, h, size);
  const m = t.mesh.material as THREE.MeshStandardMaterial;
  if (m.envMap) { m.envMap = null; m.needsUpdate = true; }
  return t;
}
/** a front-facing slab with rounded corners: x, y centre, from z0 back to z0 - depth, radius r */
function panel(mb: ModelBuilder, x: number, y: number, z0: number, w: number, h: number, depth: number, r: number, t = 'metal_grey', o: { color?: number } = {}) {
  mb.push().translate(x, y, z0).rotateX(Math.PI / 2);
  shapes.rbox(mb, 0, -depth, 0, w, depth, h, r, t, o);
  mb.pop();
}
function mesh(fn: (mb: ModelBuilder) => void, mat: THREE.Material) { const mb = new ModelBuilder(); fn(mb); const m = new THREE.Mesh(smoothNormals(mb.build()), mat); m.castShadow = true; m.receiveShadow = true; return m; }

// ------------------------------------------------------------------ the CRT
export interface CrtRegion { id: string; x: number; y: number; w: number; h: number }
/** what a screen draws with: phosphor type, rules, buttons and hit regions in canvas pixels */
export class CrtPen {
  regions: CrtRegion[] = [];
  constructor(public ctx: CanvasRenderingContext2D, public W: number, public H: number, public hover: string) {}
  font(size: number, weight = 500) { return `${weight} ${size}px ${fCrt()}`; }
  width(s: string, size = 15, weight = 500) { this.ctx.font = this.font(size, weight); return this.ctx.measureText(s).width; }
  text(s: string, x: number, y: number, c = PH.mid, size = 15, align: CanvasTextAlign = 'left', weight = 500) {
    phosphorText(this.ctx, s, x, y, { size, color: c, font: fCrt(), align, glow: c === PH.hi ? 7 : 4 });
    void weight;
  }
  /** wrapped text; returns lines drawn */
  para(s: string, x: number, y: number, w: number, c = PH.mid, size = 14, lh = 17, max = 99): number {
    const words = s.split(/\s+/);
    let line = '', n = 0;
    this.ctx.font = this.font(size);
    const out: string[] = [];
    for (const wd of words) {
      const t = line ? line + ' ' + wd : wd;
      if (this.ctx.measureText(t).width > w && line) { out.push(line); line = wd; } else line = t;
    }
    if (line) out.push(line);
    for (const l of out) { if (n >= max) break; this.text(n === max - 1 && out.length > max ? l.replace(/.{0,2}$/, '…') : l, x, y + n * lh, c, size); n++; }
    return n;
  }
  rule(y: number, c = PH.dim) { const g = this.ctx; g.fillStyle = c; g.shadowBlur = 0; g.fillRect(10, y, this.W - 20, 1.5); }
  fill(x: number, y: number, w: number, h: number, c: string) { this.ctx.fillStyle = c; this.ctx.fillRect(x, y, w, h); }
  frame(x: number, y: number, w: number, h: number, c: string) { const g = this.ctx; g.strokeStyle = c; g.lineWidth = 1.5; g.shadowColor = c; g.shadowBlur = 5; g.strokeRect(x + 0.5, y + 0.5, w, h); g.shadowBlur = 0; }
  hit(id: string, x: number, y: number, w: number, h: number) { this.regions.push({ id, x, y, w, h }); }
  /** a framed phosphor key; inverse video when hot */
  button(id: string, label: string, x: number, y: number, w: number, on = false) {
    const hot = on || this.hover === id;
    this.hit(id, x, y, w, 24);
    if (hot) { this.fill(x, y, w, 24, PH.hi); this.ctx.fillStyle = PH.inv; this.ctx.font = this.font(15, 600); this.ctx.textBaseline = 'top'; this.ctx.textAlign = 'center'; this.ctx.fillText(label, x + w / 2, y + 4); this.ctx.textAlign = 'left'; }
    else { this.frame(x, y, w, 24, PH.mid); this.text(label, x + w / 2, y + 4, PH.hi, 15, 'center'); }
  }
  bar(x: number, y: number, w: number, h: number, v: number) {
    this.frame(x, y, w, h, PH.mid);
    const n = Math.round((w - 4) * Math.max(0, Math.min(1, v)) / 4);
    for (let i = 0; i < n; i++) this.fill(x + 2 + i * 4, y + 2, 3, h - 3, PH.hi);
  }
  /** a plug-in cartridge, in phosphor line art */
  cart(x: number, y: number, c: string) {
    const g = this.ctx; g.strokeStyle = c; g.lineWidth = 1.5; g.shadowColor = c; g.shadowBlur = 4;
    g.strokeRect(x, y, 18, 13); g.strokeRect(x + 3, y + 3, 12, 4);
    for (let i = 0; i < 5; i++) g.fillRect(x + 2 + i * 3.4, y + 13, 1.6, 3);
    g.shadowBlur = 0;
  }
  /** a punch card: clipped corner, rows of holes */
  card(x: number, y: number, c: string, seed: number) {
    const g = this.ctx; g.strokeStyle = c; g.fillStyle = c; g.lineWidth = 1.5; g.shadowColor = c; g.shadowBlur = 4;
    g.beginPath(); g.moveTo(x + 4, y); g.lineTo(x + 20, y); g.lineTo(x + 20, y + 14); g.lineTo(x, y + 14); g.lineTo(x, y + 4); g.closePath(); g.stroke();
    for (let j = 0; j < 2; j++) for (let i = 0; i < 6; i++) if (((seed * 31 + i * 7 + j * 13) % 10) < 6) g.fillRect(x + 3 + i * 2.8, y + 5 + j * 4, 1.6, 2.4);
    g.shadowBlur = 0;
  }
}

export class Crt3D {
  group = new THREE.Group();
  scr: CrtScreen;
  W = 420; H = 316;
  hover = '';
  scroll = 0; maxScroll = 0;
  regions: CrtRegion[] = [];
  private knobs: THREE.Object3D[] = [];
  private knobTurn = [0, 0];
  private lamp: THREE.Mesh;
  private acc = 1;
  private ready = false;
  private curv = 0.16;
  t = 0;
  constructor(public draw: (p: CrtPen, t: number) => void, public onPick: (id: string) => void) {
    const enamel = pbr('enamel'), bake = pbr('bakelite'), chrome = pbr('chrome'), brass = pbr('brass');
    const CW = 1.02, CH = 0.86, CD = 0.5;
    // the cabinet: green enamel with a radiused front, a bakelite surround round the tube, chrome trim
    this.group.add(mesh((mb) => {
      panel(mb, 0, 0, -0.02, CW, CH, CD, 0.09);
      panel(mb, 0, 0, 0.0, CW - 0.05, CH - 0.05, 0.03, 0.075);
      // splayed tapered feet
      for (const x of [-0.4, 0.4]) { mb.push().translate(x, -CH / 2 - 0.0, -CD * 0.4).rotateZ(x < 0 ? 0.12 : -0.12); shapes.rod(mb, 0, 0, -0.08, 0, 0.02, 'metal_grey', { rTop: 0.026 }); mb.pop(); }
      // speaker slots
      for (let i = 0; i < 5; i++) panel(mb, 0.36, -0.355 + i * 0.016, 0.033, 0.11, 0.007, 0.004, 0.003, 'metal_dark', { color: 0x101010 });
    }, enamel));
    this.group.add(mesh((mb) => {
      panel(mb, 0, 0.02, 0.03, 0.84, 0.66, 0.035, 0.07);
    }, bake));
    this.group.add(mesh((mb) => {
      for (const y of [-0.315, 0.355]) mb.cylinderX(0, y, 0.034, 0.007, 0.8, 8, 'metal_grey', { fit: true });
    }, chrome));
    const sw = 0.76, sh = 0.57;
    this.scr = crtScreen(sw, sh, { tint: 0xa8ffc0, res: [this.W, this.H], scan: 0.42, mask: 0.22, glow: 0.7, curvature: this.curv, noise: 0.03, reflect: 0.55 });
    this.scr.mesh.position.set(0, 0.02, 0.036);
    this.scr.mesh.userData.pick = 'crt';
    this.group.add(this.scr.mesh);
    // two knobs under the tube, a pilot lamp and the maker's plate
    for (const [i, x] of [[0, -0.36], [1, 0.36]] as const) {
      const k = new THREE.Group();
      k.add(mesh((mb) => { mb.cylinderZ(0, 0, 0.0, 0.045, 0.05, 14, 'metal_grey', { fit: true }); shapes.lump(mb, 0, 0.022, 0.026, 0.004, 0.012, 0.003, 'metal_grey', { color: 0xe8dcc0 }); }, bake));
      k.add(mesh((mb) => { mb.cylinderZ(0, 0, 0.027, 0.018, 0.006, 12, 'metal_grey', { fit: true }); }, chrome));
      k.position.set(x, -0.38, 0.03);
      k.userData.pick = i ? 'down' : 'up';
      this.group.add(k); this.knobs.push(k);
    }
    this.lamp = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 8), new THREE.MeshStandardMaterial({ color: 0x3a0804, emissive: 0xff3010, emissiveIntensity: 1.6, roughness: 0.3 }));
    this.lamp.position.set(-0.26, -0.38, 0.03);
    this.group.add(this.lamp);
    const plate = sheet('plate', 70, 12, 0.32);
    plate.type('TELE-DIAGNOSTIC  MK II', 7, 2.4, undefined, 6.2);
    plate.flush();
    plate.mesh.position.set(0.02, -0.385, 0.026);
    this.group.add(plate.mesh);
    void brass;
    fontsReady().then(() => { this.ready = true; this.acc = 1; });
  }
  /** the canvas point under a raycast hit on the tube (the shader bulges the picture) */
  regionAt(hit: THREE.Intersection): string {
    const uv = hit.uv; if (!uv) return '';
    let x = uv.x * 2 - 1, y = uv.y * 2 - 1;
    const ox = Math.abs(y) * this.curv, oy = Math.abs(x) * this.curv;
    x += x * ox * ox; y += y * oy * oy;
    const px = (x * 0.5 + 0.5) * this.W, py = (1 - (y * 0.5 + 0.5)) * this.H;
    for (let i = this.regions.length - 1; i >= 0; i--) { const r = this.regions[i]; if (px >= r.x && py >= r.y && px < r.x + r.w && py < r.y + r.h) return r.id; }
    return '';
  }
  pointer(id: string | null, hit: THREE.Intersection | null) {
    const h = id === 'crt' && hit ? this.regionAt(hit) : id === 'up' || id === 'down' ? id : '';
    if (h !== this.hover) { this.hover = h; if (h && h !== 'up' && h !== 'down') csfx('cy_beep', 0.05, 1.7); this.acc = 1; }
  }
  click(id: string, hit: THREE.Intersection | null): boolean {
    if (id === 'up' || id === 'down') { this.scrollBy(id === 'up' ? -1 : 1); return true; }
    if (id !== 'crt' || !hit) return false;
    const r = this.regionAt(hit);
    if (r) { csfx('cy_beep', 0.18); this.onPick(r); this.acc = 1; }
    return true;
  }
  scrollBy(d: number) {
    const n = Math.max(0, Math.min(this.maxScroll, this.scroll + d));
    this.knobTurn[d < 0 ? 0 : 1] += d < 0 ? -0.7 : 0.7;
    if (n === this.scroll) return;
    this.scroll = n; this.acc = 1;
    csfx('cy_servo', 0.08, 2.2);
  }
  frame(dt: number, busy = false) {
    this.t += dt;
    for (let i = 0; i < 2; i++) this.knobs[i].rotation.z += (this.knobTurn[i] - this.knobs[i].rotation.z) * Math.min(1, dt * 12);
    (this.lamp.material as THREE.MeshStandardMaterial).emissiveIntensity = busy ? 1.2 + Math.sin(this.t * 14) * 0.8 : 1.4;
    this.acc += dt;
    if (this.acc < 1 / 12) return;
    this.acc = 0;
    const g = this.scr.ctx;
    g.fillStyle = '#000'; g.fillRect(0, 0, this.W, this.H);
    if (!this.ready) return;
    const pen = new CrtPen(g, this.W, this.H, this.hover);
    this.draw(pen, this.t);
    this.regions = pen.regions;
    this.scr.flush();
  }
}

// ------------------------------------------------------------------ the control desk
function nixieDigit(): { tex: THREE.CanvasTexture; set: (ch: string, lit: boolean) => void } {
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 96;
  const g = cv.getContext('2d')!;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  let last = '';
  const set = (ch: string, lit: boolean) => {
    const k = ch + (lit ? 1 : 0);
    if (k === last) return;
    last = k;
    g.clearRect(0, 0, 64, 96);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `80px ${fNixie()}`;
    // the unlit cathodes stacked behind
    g.globalAlpha = 0.16; g.fillStyle = '#6a5040';
    for (const c of ['8', '0']) g.fillText(c, 32, 50);
    g.globalAlpha = 1;
    if (lit) {
      g.shadowColor = '#ff6a10'; g.shadowBlur = 14; g.fillStyle = '#ffb060';
      g.fillText(ch, 32, 50);
      g.shadowBlur = 4; g.fillStyle = '#fff0c8'; g.fillText(ch, 32, 50);
    }
    tex.needsUpdate = true;
  };
  return { tex, set };
}
function drumTex(): THREE.CanvasTexture {
  // the strip wraps round the drum: u runs round the circumference, so each digit stands sideways in it
  const cv = document.createElement('canvas'); cv.width = 400; cv.height = 64;
  const g = cv.getContext('2d')!;
  const paint = () => {
    g.fillStyle = '#ece4cc'; g.fillRect(0, 0, 400, 64);
    g.font = `700 34px ${fType()}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let d = 0; d < 10; d++) {
      g.save(); g.translate(d * 40 + 20, 32); g.rotate(Math.PI / 2); g.fillStyle = '#1a1612'; g.fillText(String(d), 0, 2); g.restore();
      g.fillStyle = 'rgba(0,0,0,0.14)'; g.fillRect(d * 40, 0, 1, 64);
    }
    tex.needsUpdate = true;
  };
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  paint(); fontsReady().then(paint);
  return tex;
}

export class Console3D {
  group = new THREE.Group();
  hover = '';
  private nix: { set: (ch: string, lit: boolean) => void }[] = [];
  private drums: THREE.Mesh[] = [];
  private drumT = [0, 0, 0];
  private lever = new THREE.Group();
  private leverT = 0; private leverV = 0;
  private button = new THREE.Group();
  /** the lever's knob and the button's dome: where a hand goes */
  ball!: THREE.Mesh;
  get buttonTop() { return this.button; }
  private press = 0;
  private glow: THREE.PointLight;
  private credits = 0;
  private t = 0;
  constructor(title: string, subtitle: string) {
    const enamel = pbr('enamel'), chrome = pbr('chrome'), bake = pbr('bakelite'), steel = pbr('steel');
    const W = 1.56, H = 0.62;
    // the desk: a slanted green-enamel panel with a chrome edge and rivets
    this.group.add(mesh((mb) => {
      panel(mb, 0, 0, 0, W, H, 0.12, 0.07);
      panel(mb, 0, -H / 2 - 0.03, -0.14, W + 0.04, 0.1, 0.4, 0.04);
    }, enamel));
    this.group.add(mesh((mb) => {
      mb.cylinderX(0, H / 2 - 0.012, -0.002, 0.01, W - 0.1, 10, 'metal_grey', { fit: true });
      for (const x of [-W / 2 + 0.04, W / 2 - 0.04]) for (const y of [-H / 2 + 0.04, H / 2 - 0.05]) mb.cylinderZ(x, y, 0.002, 0.012, 0.008, 8, 'metal_grey', { fit: true });
    }, chrome));
    // the title plate
    const tp = sheet('plate', 150, 22, 0.98);
    tp.type(title, 8, 3, undefined, 7.6);
    tp.type(subtitle, 8, 12.4, undefined, 5.4);
    tp.flush();
    tp.mesh.position.set(-0.22, H / 2 - 0.1, 0.004);
    this.group.add(tp.mesh);
    const label = (s: string, x: number, y: number, w = 40) => { const p = sheet('plate', w, 9, w * 0.0062); p.type(s, 4, 1.9, undefined, 5.2); p.flush(); p.mesh.position.set(x, y, 0.004); this.group.add(p.mesh); };
    // ---- three Nixie tubes: the sign and two digits
    label('WARE CREDITS', -0.5, 0.07, 46);
    const glass = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.1, depthWrite: false, envMapIntensity: 0.45 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x140c08, roughness: 0.85, metalness: 0.3, side: THREE.DoubleSide });
    for (let i = 0; i < 3; i++) {
      const x = -0.63 + i * 0.13, y = -0.11;
      const tube = new THREE.Group(); tube.position.set(x, y, 0.06);
      tube.add(mesh((mb) => { mb.cylinder(0, -0.115, 0, 0.055, 0.03, 14, 'metal_grey', { fit: true }); }, bake));
      // the anode mesh: a dark cage the cathodes glow in front of
      // (the back half of the tube: the cathodes glow against it, not against the bright desk)
      const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.047, 0.047, 0.18, 16, 1, true, Math.PI * 0.5, Math.PI), dark);
      cage.position.y = -0.005; tube.add(cage);
      const floor = new THREE.Mesh(new THREE.CircleGeometry(0.047, 16), dark); floor.rotation.x = -Math.PI / 2; floor.position.y = -0.095; tube.add(floor);
      const d = nixieDigit();
      const face = new THREE.Mesh(new THREE.PlaneGeometry(0.085, 0.128), new THREE.MeshBasicMaterial({ map: d.tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      face.renderOrder = 2;
      face.position.set(0, -0.005, 0);
      tube.add(face);
      const mesh2 = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.19, 18, 1, true), glass);
      mesh2.position.y = -0.0; mesh2.renderOrder = 3; tube.add(mesh2);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.05, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), glass); cap.position.y = 0.095; cap.renderOrder = 3; tube.add(cap);
      this.group.add(tube);
      this.nix.push(d);
    }
    this.glow = new THREE.PointLight(0xff7a20, 0.25, 0.6, 2);
    this.glow.position.set(-0.5, -0.1, 0.18);
    this.group.add(this.glow);
    // ---- research points: a three-drum counter behind a window
    label('RESEARCH', -0.06, 0.07, 36);
    this.group.add(mesh((mb) => { panel(mb, -0.06, -0.12, -0.03, 0.29, 0.17, 0.04, 0.03, 'metal_grey', { color: 0x303030 }); // a slot that shows one digit per drum
      for (const y0 of [-0.225, -0.096]) { mb.push().translate(-0.06, y0, 0.004).rotateX(Math.PI / 2); shapes.rbox(mb, 0, -0.04, -0.04, 0.29, 0.04, 0.08, 0.012, 'metal_grey'); mb.pop(); } }, bake));
    const dt = drumTex();
    for (let i = 0; i < 3; i++) {
      const dm = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.068, 0.072, 28, 1), [new THREE.MeshStandardMaterial({ map: dt, roughness: 0.55 }), steel, steel]);
      dm.rotation.z = Math.PI / 2;
      dm.position.set(-0.14 + i * 0.08, -0.12, -0.045);
      this.group.add(dm); this.drums.push(dm);
    }
    // ---- the DEAL lever in a brass quadrant
    label('DEAL', 0.24, 0.07, 24);
    this.group.add(mesh((mb) => { panel(mb, 0.24, -0.13, 0.025, 0.08, 0.24, 0.025, 0.035); }, pbr('brass')));
    this.group.add(mesh((mb) => { panel(mb, 0.24, -0.14, 0.029, 0.018, 0.2, 0.004, 0.008, 'metal_grey', { color: 0x101010 }); }, bake));
    this.lever.position.set(0.24, -0.24, 0.03);
    this.lever.add(mesh((mb) => { mb.cylinder(0, 0, 0, 0.011, 0.21, 8, 'metal_grey', { fit: true }); }, chrome));
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.034, 16, 12), new THREE.MeshPhysicalMaterial({ color: 0xb01808, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08 }));
    ball.position.y = 0.22; ball.castShadow = true;
    this.ball = ball;
    this.lever.add(ball);
    this.lever.rotation.x = 0.3;
    this.lever.userData.pick = 'lever';
    this.group.add(this.lever);
    // ---- DISCHARGE: the red mushroom button on a hazard collar
    label('DISCHARGE', 0.55, 0.07, 38);
    const hz = document.createElement('canvas'); hz.width = 128; hz.height = 16;
    const hg = hz.getContext('2d')!;
    for (let i = 0; i < 16; i++) { hg.fillStyle = i % 2 ? '#1a1814' : '#e8b828'; hg.beginPath(); hg.moveTo(i * 8, 0); hg.lineTo(i * 8 + 8, 0); hg.lineTo(i * 8, 16); hg.lineTo(i * 8 - 8, 16); hg.fill(); }
    const hzt = new THREE.CanvasTexture(hz); hzt.colorSpace = THREE.SRGBColorSpace; hzt.wrapS = THREE.RepeatWrapping;
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.135, 0.04, 28, 1), [steel, new THREE.MeshStandardMaterial({ map: hzt, roughness: 0.6 }), steel]);
    collar.rotation.x = Math.PI / 2; collar.position.set(0.55, -0.15, 0.02);
    this.group.add(collar);
    this.button.position.set(0.55, -0.15, 0.04);
    const red = new THREE.MeshPhysicalMaterial({ color: 0xc81a0c, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.1 });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.1, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), red);
    dome.rotation.x = Math.PI / 2; dome.scale.set(1, 0.55, 1); dome.position.z = 0.03; dome.castShadow = true;
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.035, 28, 1), red);
    skirt.rotation.x = Math.PI / 2; skirt.position.z = 0.012;
    this.button.add(dome, skirt);
    this.button.userData.pick = 'go';
    this.group.add(this.button);
    this.set(0, 0);
  }
  set(credits: number, rp: number) {
    this.credits = credits;
    const s = (credits < 0 ? '-' : '+') + String(Math.min(99, Math.abs(credits))).padStart(2, '0');
    const r = String(Math.min(999, Math.max(0, rp))).padStart(3, '0');
    for (let i = 0; i < 3; i++) this.drumT[i] = Number(r[i]);
    this.sign = s;
  }
  private sign = '+00';
  pull() { this.leverV = 1; csfx('cy_thunk', 0.7); }
  push() { this.press = 0.35; csfx('cy_thunk', 0.8); }
  frame(dt: number) {
    this.t += dt;
    const blinkOff = this.credits < 0 && (this.t * 2) % 1 > 0.5;
    for (let i = 0; i < 3; i++) this.nix[i].set(this.sign[i], !blinkOff);
    this.glow.intensity = blinkOff ? 0.05 : 0.25 + Math.sin(this.t * 31) * 0.02;
    // drums roll to their digits (digit d faces the window)
    for (let i = 0; i < 3; i++) {
      const target = ((this.drumT[i] + 0.5) / 10) * Math.PI * 2;
      const dm = this.drums[i];
      dm.rotation.x += (target - dm.rotation.x) * Math.min(1, dt * 6);
    }
    // lever: pulled down, springs back
    this.leverT += (this.leverV - this.leverT) * Math.min(1, dt * 16);
    if (this.leverT > 0.95) this.leverV = 0;
    this.lever.rotation.x = 0.3 + this.leverT * 0.9;
    this.press = Math.max(0, this.press - dt);
    this.button.position.z = 0.04 - (this.press > 0 ? 0.018 : 0) + (this.hover === 'go' ? 0.004 : 0);
  }
}

// ------------------------------------------------------------------ the manila tag on a string
export class Tag3D {
  t: PixTag;
  string: THREE.Line;
  group = new THREE.Group();
  private key = '';
  private swing = 0;
  constructor() {
    this.t = sheet('tag', 62, 34, 0.36);
    this.string = tagString(0xc8c0a8);
    this.group.add(this.t.mesh, this.string);
    this.group.visible = false;
  }
  write(a: string, b: string, c: string) {
    const k = a + '|' + b + '|' + c;
    if (k === this.key) return;
    this.key = k;
    const t = this.t;
    t.clear();
    t.type(a, 14, 9, '#25201b', 8);
    t.type(b, 14, 18.5, '#6a1a10', 6.2);
    if (c) t.type(c, 14, 26, '#4a3a2a', 5);
    t.flush();
    this.swing = 0.35;
  }
  /** hang it near a point in the layer's space (the string runs to the point) */
  place(at: THREE.Vector3, dt: number) {
    this.swing *= Math.exp(-dt * 2.5);
    const m = this.t.mesh;
    m.position.set(at.x + 0.2, at.y + 0.2, at.z);
    m.rotation.z = Math.sin(performance.now() / 260) * 0.05 * (0.3 + this.swing) - 0.12;
    const eye = new THREE.Vector3(0, 0.085, 0).applyEuler(m.rotation).add(m.position);
    setString(this.string, at, eye);
  }
}

// ------------------------------------------------------------------ the discharge slip
export function dischargeSlip(lines: string[]): PixTag {
  const t = sheet('card', 120, 76, 1.1);
  t.type('MERIDIAN INSTITUTE · REMITTANCE PROGRAMME', 8, 6, '#25201b', 5.6);
  t.type('DISCHARGE SLIP — THEATRE No.3', 8, 13, '#25201b', 6.4);
  t.line(8, 21.5, 112, 21.5, '#7a6a5a', 0.5);
  lines.slice(0, 7).forEach((l, i) => t.type(l, 8, 25 + i * 6.6, '#25201b', 5.4));
  stamp(t, 'DISCHARGED', 62, 56, '#b81c12');
  t.flush();
  return t;
}

// ------------------------------------------------------------------ hands near the camera (src/fp/hands.ts)
const _t = new THREE.Vector3(), _w = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const easeOut = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const easeIn = (t: number) => Math.pow(Math.min(1, Math.max(0, t)), 2);
/**
 * The theatre operator's gloved hand: it reaches in from below the frame to
 * press DISCHARGE with a fingertip or take the DEAL lever by the knob, does the
 * thing at the moment of contact, and withdraws. The fingertip (or grip) is
 * steered onto its target every frame, so it lands wherever the desk sits.
 */
export class OperatorHand {
  arm: FpArm;
  private t = -1;
  private target: () => THREE.Vector3 = () => _t;
  private kind: 'press' | 'grip' = 'press';
  private contact?: () => void;
  private fired = false;
  private from = new THREE.Vector3(0.42, -0.62, 0.55);
  constructor(scene: THREE.Object3D) {
    this.arm = fpArm('right', { skin: 0xd8ceb0, sleeve: 0xe8e4d8, sleeveStyle: 'long' });
    this.arm.root.visible = false;
    scene.add(this.arm.root);
  }
  get busy() { return this.t >= 0; }
  reach(target: () => THREE.Vector3, kind: 'press' | 'grip', contact: () => void, scale = 1) {
    this.target = target; this.kind = kind; this.contact = contact; this.fired = false; this.t = 0;
    this.arm.root.scale.setScalar(scale);
    this.arm.pose(kind === 'press' ? 'point' : 'open', true);
    this.arm.root.visible = true;
  }
  frame(dt: number) {
    if (this.t < 0) return;
    this.t += dt;
    const IN = 0.34, HOLD = this.kind === 'grip' ? 0.45 : 0.28, OUT = 0.36;
    const t = this.t;
    let k = 1;
    if (t < IN) k = easeOut(t / IN); else if (t > IN + HOLD) k = 1 - easeIn((t - IN - HOLD) / OUT);
    if (t >= IN && !this.fired) { this.fired = true; this.arm.pose(this.kind === 'press' ? 'press' : 'grip'); this.contact?.(); }
    if (t > IN + HOLD + OUT) { this.t = -1; this.arm.root.visible = false; return; }
    const r = this.arm.root;
    // the forearm points from below-front at the target
    r.quaternion.setFromUnitVectors(_up, _w.copy(this.from).multiplyScalar(-1).normalize());
    this.arm.update(dt);
    const goal = _t.copy(this.target()).addScaledVector(this.from, (1 - k) * 0.9 * r.scale.x);
    r.updateMatrixWorld(true);
    const tip = (this.kind === 'press' ? this.arm.tip : this.arm.grip).getWorldPosition(_w);
    r.position.add(goal.sub(tip));
  }
}

/** the patient's own hand at the edge of the view, clenched on the table (field surgery's point of view) */
export function patientHand(scene: THREE.Object3D, skin: number, sleeve: number | null, pose: HandPose = 'fist'): FpArm {
  const a = fpArm('left', { skin, sleeve, sleeveStyle: sleeve === null ? 'none' : 'long' });
  a.root.position.set(-0.42, -0.62, -0.95);
  a.root.rotation.set(-1.05, 0.2, 0.5);
  a.pose(pose, true);
  scene.add(a.root);
  return a;
}
