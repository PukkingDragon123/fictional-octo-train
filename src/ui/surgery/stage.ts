// THE OPERATING TABLE. A dark surgical theatre rendered through a private
// WebGL context at a low pixel resolution and blown up by an INTEGER factor
// (nearest neighbour, image-rendering: pixelated), with its own composite:
// black one-pixel outlines from the depth buffers (the room and the
// instrument layer each), a lit rim on silhouettes, filmic tone mapping, a
// cold-shadow / warm-light grade, vignette, pain and flash, letterbox bars and
// an ordered dither. No blur of any kind.
//
// The room (room.ts) is lit by the six-pod surgical lamp (key, shadows), a
// cold fill, the green vitals cart, a flickering tube, the watchers' red booth;
// haze shafts and dust hang under the lamp. Two industrial manipulators
// (arm.ts) do the work: the ORDERLY grips, carries and fetches; the SURGEON
// saws, drills, welds and clamps. The subject (the game's HumanRig) is carried
// in on the ceiling gantry hanging limp in two slings, dropped on the pad and
// let go to the rig's Verlet ragdoll (it slumps, the head lolls, an arm slides
// off the edge), then strapped down; it convulses under the saw, jolts at
// every bolt and arches when the hardware wakes. Camera cuts, punch-ins and
// hit-stops land on the big moments. A full-resolution 2D overlay canvas
// carries every readable word (instruments.ts draws on it).
// Used by the intake (surgery.ts) and, from the player's own eyes, by field
// surgery in a run (field.ts).
import * as THREE from 'three';
import { HumanRig, Appearance, Outfit, Pose, createPreviewRig, JOINTS, type JointName } from '../../entities/humanRig';
import type { RigCondition } from '../../entities/humanRig';
import type { BoneName } from '../../entities/humanModel';
import { Ragdoll } from '../../entities/humanRagdoll';
import { U, worldMaterial } from '../../gfx/materials';
import { ModelBuilder } from '../../gfx/modelBuilder';
import { limbItemModel } from '../../entities/limbGear';
import { loosePartGeo } from '../../entities/cyberGear';
import { CyberSlot, SLOT_KIND, SLOT_COVERS, CYBER_SLOTS } from '../../survival/cyberParts';
import type { StumpCond } from '../../survival/limbs';
import { csfx, csfxVoice, audioKick, type Voice } from './audio';
import { makeMats, type Mats } from './pix';
import { buildRoom, Gantry, Straps, TABLE_Y, TABLE_HALF_X, TABLE_HALF_Z, LAMP_POS, TRAY_POS, HATCH_POS, VENT_POS, type Room } from './room';
import { IndustrialArm } from './arm';
import { FX, surfaceY } from './fx';

export type Pick = CyberSlot | 'brain';
export type CyberLoad = Partial<Record<CyberSlot, string>>;
export { TABLE_Y };

const ROOT_X = 0.9, SUBJ_Y = TABLE_Y + 0.1;
const ease = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t));
const easeOut = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt));
const _ndc = new THREE.Vector2();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _m = new THREE.Matrix4();
const Q_LIE = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0)));
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export function gfxQuality(): 'low' | 'high' {
  let q = 'auto';
  try { q = JSON.parse(localStorage.getItem('noclip.gfx') || '{}').quality || 'auto'; } catch { /* default */ }
  if (q === 'auto') return matchMedia('(pointer: coarse)').matches ? 'low' : 'high';
  return q === 'low' ? 'low' : 'high';
}

// ------------------------------------------------------------------ composite
const POST_VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const POST_FS = `
uniform sampler2D tS; uniform sampler2D dS; uniform sampler2D tF; uniform sampler2D dF;
uniform vec2 texel; uniform vec2 nfS; uniform vec2 nfF;
uniform float uTime; uniform float uHurt; uniform float uFlash; uniform float uBars; uniform float uExpo; uniform float uFade; uniform float uFgOn;
varying vec2 vUv;
float lin(float z, vec2 nf) { return nf.x * nf.y / (nf.y - z * (nf.y - nf.x)); }
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
float bayer4(vec2 p) { int x = int(mod(p.x, 4.0)), y = int(mod(p.y, 4.0)); int i = x + y * 4;
  float m[16]; m[0]=0.;m[1]=8.;m[2]=2.;m[3]=10.;m[4]=12.;m[5]=4.;m[6]=14.;m[7]=6.;m[8]=3.;m[9]=11.;m[10]=1.;m[11]=9.;m[12]=15.;m[13]=7.;m[14]=13.;m[15]=5.;
  for (int k = 0; k < 16; k++) if (k == i) return (m[k] + 0.5) / 16.0; return 0.5; }
void main() {
  vec2 o[4]; o[0] = vec2(texel.x, 0.0); o[1] = vec2(-texel.x, 0.0); o[2] = vec2(0.0, texel.y); o[3] = vec2(0.0, -texel.y);
  float zf = uFgOn > 0.5 ? texture2D(dF, vUv).r : 1.0;
  bool fg = zf < 1.0;
  vec3 c = fg ? texture2D(tF, vUv).rgb : texture2D(tS, vUv).rgb;
  float edge = 0.0, rim = 0.0;
  if (!fg) {
    float L = lin(texture2D(dS, vUv).r, nfS);
    for (int i = 0; i < 4; i++) {
      float Ln = lin(texture2D(dS, vUv + o[i]).r, nfS);
      float th = 0.05 + L * 0.055;
      if (L - Ln > th) edge = 1.0;
      if (Ln - L > th) rim = 1.0;
    }
  }
  if (uFgOn > 0.5) {
    float L = fg ? lin(zf, nfF) : 1e4;
    for (int i = 0; i < 4; i++) {
      float zn = texture2D(dF, vUv + o[i]).r;
      if (zn < 1.0) { float Ln = lin(zn, nfF); if (L - Ln > 0.03 + Ln * 0.05) edge = 1.0; }
      if (fg && zn >= 1.0) rim = 1.0;
    }
  }
  c *= 1.0 + rim * 0.22;
  c = mix(c, vec3(0.008, 0.006, 0.01), edge);
  // film: exposure, filmic curve, cold shadows and warm light
  c = aces(c * uExpo);
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, 1.12);
  c += vec3(-0.004, 0.006, 0.012) * (1.0 - l) * 1.4;
  c *= mix(vec3(0.94, 0.98, 1.04), vec3(1.05, 1.0, 0.92), smoothstep(0.15, 0.85, l));
  vec2 q = vUv - 0.5;
  float v = dot(q, q);
  c = mix(c, vec3(0.42, 0.0, 0.015), clamp(uHurt * smoothstep(0.03, 0.4, v) * 1.1, 0.0, 0.85));
  c = mix(c, vec3(1.0, 0.97, 0.92), clamp(uFlash, 0.0, 1.0));
  c *= 1.0 - v * 0.9;
  c *= 1.0 - uFade;
  float bh = uBars * 0.1;
  if (vUv.y < bh || vUv.y > 1.0 - bh) c = vec3(0.0);
  // a light ordered dither (keeps the dark gradients from banding)
  c += (bayer4(gl_FragCoord.xy) - 0.5) / 64.0;
  gl_FragColor = vec4(max(c, 0.0), 1.0);
  #include <colorspace_fragment>
}`;

/** a little dark room with a hot lamp panel overhead and a green screen to the side (metal reflections) */
function envScene(): THREE.Scene {
  const s = new THREE.Scene();
  const box = new THREE.Mesh(new THREE.BoxGeometry(10, 6, 10), new THREE.MeshBasicMaterial({ color: 0x0b0b0c, side: THREE.BackSide }));
  s.add(box);
  const panel = (c: number, k: number, w: number, h: number, p: THREE.Vector3, r: THREE.Euler) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), side: THREE.DoubleSide })); m.position.copy(p); m.rotation.copy(r); s.add(m); };
  panel(0xfff0d8, 9, 1.6, 1.6, V(0, 2.9, 0), new THREE.Euler(Math.PI / 2, 0, 0));
  panel(0x60ff98, 1.2, 1.4, 1.0, V(4.9, 0.4, -1), new THREE.Euler(0, -Math.PI / 2, 0));
  panel(0x8ab0ff, 0.6, 3, 1.5, V(-4.9, 1.2, 0), new THREE.Euler(0, Math.PI / 2, 0));
  panel(0xd8ffe8, 2.5, 2.0, 0.2, V(1, 2.3, -4.9), new THREE.Euler(0, 0, 0));
  return s;
}

interface Loose { mesh: THREE.Object3D; v: THREE.Vector3; spin: THREE.Vector3; rest: boolean; }
interface Off { x: THREE.Vector3; v: THREE.Vector3; t: THREE.Vector3 }
export interface OverlayInfo { w: number; h: number; dpr: number; art: number; t: number }

export class SurgeryStage {
  canvas = document.createElement('canvas');
  /** full-resolution 2D layer for every readable word */
  overlay = document.createElement('canvas');
  octx: CanvasRenderingContext2D;
  renderer: THREE.WebGLRenderer | null = null;
  rig: HumanRig | null = null;
  mode: 'intake' | 'field';
  busy = false;
  /** 0..1 heart-rate excitement (monitor) */
  stress = 0.15;
  onHover?: (p: Pick | null) => void;
  scene = new THREE.Scene();
  cam = new THREE.PerspectiveCamera(36, 1, 0.05, 30);
  mats: Mats;
  private wmat = worldMaterial({ noVis: true, noFog: true, noGrid: true });
  /** the instruments' layer, drawn over the room in the same pixel grid */
  fg = new THREE.Scene();
  fgCam = new THREE.PerspectiveCamera(24, 1, 0.5, 12);
  onFrame?: (dt: number) => void;
  /** a 2D hook first in line for pointers (CSS px in the host); true = consumed */
  onPointer2D?: (x: number, y: number, kind: 'move' | 'click' | 'leave') => boolean;
  /** a click: on an instrument (id + hit), else on the subject (pick) */
  onClick?: (id: string | null, hit: THREE.Intersection | null, pick: Pick | null) => void;
  onFgHover?: (id: string | null, hit: THREE.Intersection | null) => void;
  /** draw the overlay (device pixels) */
  onOverlay?: (ctx: CanvasRenderingContext2D, o: OverlayInfo) => void;
  private fgRay = new THREE.Raycaster();
  private fgHoverId: string | null = null;
  private env: THREE.Texture | null = null;
  private rtS: THREE.WebGLRenderTarget | null = null;
  private rtF: THREE.WebGLRenderTarget | null = null;
  private post: { scene: THREE.Scene; cam: THREE.OrthographicCamera; mat: THREE.ShaderMaterial } | null = null;
  room: Room;
  gantry: Gantry;
  straps: Straps;
  surgeon: IndustrialArm; orderly: IndustrialArm;
  fx: FX;
  private lamp: THREE.SpotLight; private alarm: THREE.PointLight; private weld: THREE.PointLight; private fluoroL: THREE.PointLight; private vitalsL: THREE.PointLight;
  private inspect = new THREE.PointLight(0xffe0a0, 0, 1.2, 1.6);
  private loose: Loose[] = [];
  private app: Appearance | null = null;
  private outfit: Outfit = {};
  load: CyberLoad = {};
  sev: string[] = [];
  private stump: Record<string, StumpCond> = {};
  t = 0; private last = 0; private raf = 0;
  lowW = 0; lowH = 0; art = 2; dpr = 1;
  private ro: ResizeObserver;
  private host: HTMLElement;
  quality: 'low' | 'high';
  portrait = false;
  // camera
  private camPos = V(1.3, 2.05, 2.25); private camAt = V(-0.08, 0.95, -0.05);
  private camPosT = V(1.3, 2.05, 2.25); private camAtT = V(-0.08, 0.95, -0.05);
  private camVel = new THREE.Vector3(); private atVel = new THREE.Vector3();
  private camW = 3.2;
  private shakeT = 0; private flash = 0; hurt = 0;
  private punchK = 0; private stopT = 0; bars = 0; private baseFov = 36; fade = 1;
  /** bars wanted (cinematic moments) */
  cinematic = false;
  /** field mode: 0..1 how far the view has come in (synced to the game's first-person cut) */
  entrance = 1;
  // subject
  private subj = new THREE.Group();
  private carry = 0; private hangK = 0; private lowerK = 0;
  private restQ: Record<string, THREE.Quaternion> | null = null;
  private restHips = new THREE.Vector3();
  private off: Record<string, Off> = {};
  private convT = 0; private convAmp = 0;
  private archK = 0;
  private flex: Record<string, number> = {};
  private hoverP: Pick | null = null; selected: Pick | null = null;
  private beat = 0; private lastPh = 0;
  private voices: Voice[] = [];
  private wS: Voice | null = null; private wO: Voice | null = null; private hum: Voice | null = null;
  speed = 1;
  disposed = false;

  constructor(host: HTMLElement, mode: 'intake' | 'field' = 'intake') {
    this.host = host; this.mode = mode;
    this.canvas.className = 'sg-cv';
    this.overlay.className = 'sg-ov';
    host.append(this.canvas, this.overlay);
    this.octx = this.overlay.getContext('2d')!;
    this.quality = gfxQuality();
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, alpha: false, powerPreference: this.quality === 'low' ? 'low-power' : 'default' });
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.setPixelRatio(1);
      this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFShadowMap;
      const pm = new THREE.PMREMGenerator(this.renderer);
      this.env = pm.fromScene(envScene(), 0.02).texture;
      pm.dispose();
    } catch (e) { console.warn('surgery renderer unavailable', e); this.renderer = null; }
    this.mats = makeMats(this.env);
    this.scene.background = new THREE.Color(0x020203);
    // ---- the room, the machines, the effects
    this.room = buildRoom(this.mats);
    this.scene.add(this.room.group);
    this.gantry = new Gantry(this.mats);
    this.scene.add(this.gantry.group);
    this.straps = new Straps(this.mats, [{ x: -0.42, h: 0.2 }, { x: 0.14, h: 0.17 }, { x: 0.66, h: 0.12 }]);
    this.scene.add(this.straps.group);
    this.surgeon = new IndustrialArm('surgeon', this.mats, this.mats.yellow);
    this.orderly = new IndustrialArm('orderly', this.mats, this.mats.olive);
    this.surgeon.root.position.set(-0.72, 0, -0.98); this.surgeon.root.rotation.y = 0.15;
    this.orderly.root.position.set(0.78, 0, -0.98); this.orderly.root.rotation.y = -0.15;
    this.scene.add(this.surgeon.root, this.surgeon.world, this.orderly.root, this.orderly.world);
    this.fx = new FX(this.quality === 'low');
    this.scene.add(this.fx.group, this.subj);
    this.restArms(true);
    // ---- light
    this.scene.add(new THREE.HemisphereLight(0x5a6a84, 0x140e0a, 0.55));
    const rim = new THREE.DirectionalLight(0x7aa0d8, 0.55); rim.position.set(-2.5, 3, -2.5); this.scene.add(rim);
    this.lamp = new THREE.SpotLight(0xfff0d8, 0, 0, 0.6, 0.5, 2);
    this.lamp.position.copy(LAMP_POS).add(V(0, -0.1, 0));
    this.lamp.target.position.set(0, TABLE_Y, 0);
    this.lamp.castShadow = true;
    this.lamp.shadow.mapSize.set(this.quality === 'low' ? 512 : 1024, this.quality === 'low' ? 512 : 1024);
    this.lamp.shadow.bias = -0.0015; this.lamp.shadow.normalBias = 0.02; this.lamp.shadow.camera.near = 0.3; this.lamp.shadow.camera.far = 4;
    this.scene.add(this.lamp, this.lamp.target);
    this.fluoroL = new THREE.PointLight(0xc8ffe0, 3.5, 5, 2); this.fluoroL.position.set(1.15, 2.1, -2.05); this.scene.add(this.fluoroL);
    this.vitalsL = new THREE.PointLight(0x50ff88, 2.2, 3, 2); this.vitalsL.position.set(1.85, 1.35, -0.45); this.scene.add(this.vitalsL);
    const bulb = new THREE.PointLight(0xffa850, 2.5, 4, 2); bulb.position.set(-3.2, 2.1, 1.0); this.scene.add(bulb);
    this.alarm = new THREE.PointLight(0xff2010, 0, 6, 1.8); this.alarm.position.set(-0.4, 2.55, -2.1); this.scene.add(this.alarm);
    this.weld = new THREE.PointLight(0xa8c8ff, 0, 3, 1.8); this.scene.add(this.weld, this.inspect);
    // ---- the instrument layer's own light (instruments add their practicals)
    const fk = new THREE.DirectionalLight(0xffe8cc, 1.6); fk.position.set(-1, 3, 2); this.fg.add(fk);
    this.fg.add(new THREE.HemisphereLight(0x8090a8, 0x201810, 0.7));
    const fr = new THREE.DirectionalLight(0x90b0e0, 0.6); fr.position.set(2, 1, -1); this.fg.add(fr);
    this.fg.environment = this.env;
    this.bindInput();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
    if (mode === 'intake') {
      this.wS = csfxVoice('whine'); this.wO = csfxVoice('whine'); this.hum = csfxVoice('hum');
      this.voices.push(this.wS, this.wO, this.hum);
    }
  }

  // ---------------------------------------------------------------- the subject
  private app0: Appearance | null = null;
  setSubject(app: Appearance, outfit: Outfit, load: CyberLoad = {}, sev: string[] = []) {
    this.app = app; this.app0 = app; this.outfit = outfit; this.load = { ...load }; this.sev = [...sev];
    for (const s of sev) this.stump[s] = { s: 'healed' };
    if (this.rig) { this.subj.remove(this.rig.root); this.rig.dispose(); }
    this.rig = createPreviewRig(app, outfit);
    this.rig.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    this.subj.add(this.rig.root);
    for (const j of JOINTS) this.off[j] = { x: new THREE.Vector3(), v: new THREE.Vector3(), t: new THREE.Vector3() };
    this.off.lift = { x: new THREE.Vector3(), v: new THREE.Vector3(), t: new THREE.Vector3() };
    this.applyCond();
    this.placeOnTable();
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
    this.rig.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.castShadow = true; });
  }
  private bleeding = '';
  private bloodOn: Record<string, number> = {};
  private condT = 0;
  private applyCondSoon() { if (this.t - this.condT > 0.3) { this.condT = this.t; this.applyCond(); } }

  private placeOnTable() { this.subj.position.set(ROOT_X, SUBJ_Y, 0); this.subj.quaternion.copy(Q_LIE); }
  /** the base pose: lying, or hanging in the slings (hang) and coming down (lower) */
  private basePose(): Pose {
    const h = this.hangK, lo = this.lowerK, sw = this.gantry.swing * 2.2 + this.gantry.swingV * 0.25;
    const t = this.t, br = Math.sin(t * (1.3 + this.stress * 2.2)) * 0.025;
    // arms: hanging down past the slings while carried, the right one falls off the edge as it lands
    const armL = h * (1 - lo);
    const armR = h * (1 - lo * 0.55);
    const legs = h * (1 - lo);
    return {
      hips: [0, 0, 0], spine: [-0.12 * h, 0, 0], chest: [br - 0.1 * h, 0, 0],
      neck: [-0.75 * h + 0.05 * (1 - h), 0.35 * (1 - h) + Math.sin(t * 1.3) * 0.08 * h, 0.1 * h], head: [-0.45 * h, 0.15 * (1 - h), 0],
      uarmL: [(Math.PI / 2 - 0.1) * armL + sw * armL, 0, 0.16 + 0.08 * h],
      uarmR: [(Math.PI / 2 - 0.1) * armR + sw * armR, 0, -0.22 - 0.42 * h * lo],
      farmL: [-0.25 * h - 0.12, 0, 0], farmR: [-0.3 * h - 0.12, 0, 0],
      handL: [0.2 * h, 0, 0], handR: [0.25 * h, 0, 0],
      thighL: [0.06 * h, 0, 0.05], thighR: [0.06 * h, 0, -0.05],
      shinL: [1.35 * legs + sw * 0.6 * legs + 0.04, 0, 0], shinR: [1.25 * legs + sw * 0.7 * legs + 0.04, 0, 0],
      footL: [0.55, 0, 0.12], footR: [0.55, 0, -0.12],
      gripL: 0.32, gripR: 0.38,
      blink: this.mode === 'field' ? 0 : this.archK > 0.3 ? 0 : 0.88,
    };
  }
  private poseRig(dt: number) {
    const r = this.rig!;
    if (r.ragdolling) {
      r.update(dt);
      const R = r.ragdoll!;
      if (R.asleep || R.t > 2.4) this.freezeRest();
      return;
    }
    const p = this.basePose();
    // limbs flex for the servo test
    const fl = (k: string) => this.flex[k] ?? 0;
    p.farmL![0] -= fl('farmL'); p.farmR![0] -= fl('farmR'); p.shinL![0] += fl('shinL'); p.shinR![0] += fl('shinR');
    p.gripL = Math.min(1, (p.gripL ?? 0.3) + fl('gripL')) * (1 - this.archK * 0.9); p.gripR = Math.min(1, (p.gripR ?? 0.3) + fl('gripR')) * (1 - this.archK * 0.9);
    r.applyPose(p);
    if (this.restQ) {
      for (const j of JOINTS) { const q = this.restQ[j]; if (q) r.j[j].quaternion.copy(q); }
      r.j.hips.position.copy(this.restHips);
      // breathing and the flex test ride on the settled pose
      _q.setFromEuler(_e.set(Math.sin(this.t * (1.3 + this.stress * 2.2)) * 0.02, 0, 0)); r.j.chest.quaternion.multiply(_q);
      for (const k of ['farmL', 'farmR', 'shinL', 'shinR'] as JointName[]) { const f = fl(k); if (f) { _q.setFromEuler(_e.set(k.startsWith('farm') ? -f : f, 0, 0)); r.j[k].quaternion.multiply(_q); } }
    }
    // offsets: springs for jolts, convulsions and the arch
    this.convT -= dt;
    const sd = Math.min(dt, 0.033);
    for (const k of Object.keys(this.off)) {
      const o = this.off[k];
      if (this.convT > 0 && Math.random() < sd * 18) o.v.add(_v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(this.convAmp * (k === 'head' || k === 'neck' ? 9 : k.startsWith('hand') || k.startsWith('farm') || k.startsWith('foot') ? 14 : 7)));
      const w = k === 'lift' ? 14 : 12, z = 0.3;
      o.v.addScaledVector(_v.subVectors(o.t, o.x), w * w * sd).addScaledVector(o.v, -2 * z * w * sd);
      o.x.addScaledVector(o.v, sd);
      if (k === 'lift') continue;
      if (o.x.lengthSq() > 1e-6) { _q.setFromEuler(_e.set(o.x.x, o.x.y, o.x.z)); r.j[k as JointName].quaternion.multiply(_q); }
    }
    r.j.hips.position.z += Math.max(-0.01, this.off.lift.x.y);
  }
  /** the ragdoll has settled: keep that pose as the body's rest */
  private freezeRest() {
    const r = this.rig!;
    this.restQ = {};
    for (const j of JOINTS) this.restQ[j] = r.j[j].quaternion.clone();
    this.restHips.copy(r.j.hips.position);
    r.stopRagdoll();
    this.hangK = 0; this.lowerK = 1;
  }
  /** a jolt through the body (0..1) */
  jolt(k: number, bones: string[] = JOINTS) {
    for (const b of bones) { const o = this.off[b]; if (o) o.v.add(_v.set(Math.random() - 0.5, (Math.random() - 0.5) * 0.6, Math.random() - 0.5).multiplyScalar(k * 14)); }
    this.off.lift.v.y += k * 0.9;
  }
  convulse(secs: number, amp: number) { this.convT = Math.max(this.convT, secs); this.convAmp = amp; }
  /** the hardware wakes: the back arches off the pad, then lets go */
  async arch(secs = 0.7) {
    const o = this.off;
    const set = (k: string, x: number, y = 0, z = 0) => o[k]?.t.set(x, y, z);
    this.archK = 1;
    set('spine', -0.32); set('chest', -0.26); set('neck', -0.45); set('head', -0.35, 0.1);
    set('uarmL', 0, 0, 0.45); set('uarmR', 0, 0, -0.45); set('farmL', -0.35); set('farmR', -0.35);
    set('thighL', 0.12); set('thighR', 0.12); set('shinL', -0.2); set('shinR', -0.2); set('footL', -0.4); set('footR', -0.4);
    o.lift.t.y = 0.075;
    for (const k of Object.keys(o)) o[k].v.addScaledVector(o[k].t, 10);
    await this.wait(secs * 1000);
    for (const k of Object.keys(o)) o[k].t.set(0, 0, 0);
    this.archK = 0;
  }

  // ---------------------------------------------------------------- anchors
  anchor(p: Pick, out = new THREE.Vector3()): THREE.Vector3 {
    const r = this.rig; if (!r) return out.set(0, TABLE_Y, 0);
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
  /** CSS px (relative to the host) of a world point in the room; null behind the camera */
  toScreen(w: THREE.Vector3): { x: number; y: number } | null {
    const v = _v2.copy(w).project(this.cam);
    if (v.z > 1) return null;
    const cw = this.lowW * this.art, ch = this.lowH * this.art;
    return { x: (v.x * 0.5 + 0.5) * cw, y: (-v.y * 0.5 + 0.5) * ch };
  }
  /** CSS px of a point in the instrument layer */
  fgToScreen(w: THREE.Vector3): { x: number; y: number } {
    const v = _v2.copy(w).project(this.fgCam);
    const cw = this.lowW * this.art, ch = this.lowH * this.art;
    return { x: (v.x * 0.5 + 0.5) * cw, y: (-v.y * 0.5 + 0.5) * ch };
  }
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
  get hovered() { return this.hoverP; }
  select(p: Pick | null) { this.selected = p; this.focus(p); }

  private local(e: PointerEvent | MouseEvent) { const r = this.host.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  private bindInput() {
    const el = this.overlay;
    el.addEventListener('pointermove', (e) => {
      const l = this.local(e);
      if (this.onPointer2D?.(l.x, l.y, 'move')) { this.setFgHover(null, null); this.hoverSubj(null); el.style.cursor = 'pointer'; return; }
      if (e.pointerType === 'touch') return;
      const fh = this.fgHit(l.x, l.y);
      this.setFgHover(fh?.id ?? null, fh?.hit ?? null);
      const p = fh ? null : this.pickAt(l.x, l.y, 46);
      this.hoverSubj(p);
      el.style.cursor = fh || p ? 'pointer' : '';
    });
    el.addEventListener('pointerleave', () => { this.onPointer2D?.(-1, -1, 'leave'); this.hoverSubj(null); this.setFgHover(null, null); });
    el.addEventListener('pointerdown', () => audioKick());
    el.addEventListener('click', (e) => {
      const l = this.local(e);
      if (this.onPointer2D?.(l.x, l.y, 'click')) return;
      const fh = this.fgHit(l.x, l.y);
      if (fh) { this.onClick?.(fh.id, fh.hit, null); return; }
      if (this.busy) { this.hurry = true; return; }
      this.onClick?.(null, null, this.pickAt(l.x, l.y));
    });
  }
  private setFgHover(id: string | null, hit: THREE.Intersection | null) { if (id !== this.fgHoverId || id) { this.fgHoverId = id; this.onFgHover?.(id, hit); } }
  private hoverSubj(p: Pick | null) { if (p !== this.hoverP) { this.hoverP = p; this.onHover?.(p); } }
  /** the instrument under a point (CSS px in the host): the nearest object carrying userData.pick */
  fgHit(x: number, y: number): { id: string; hit: THREE.Intersection } | null {
    const cw = this.lowW * this.art, ch = this.lowH * this.art;
    if (!cw) return null;
    this.fgRay.setFromCamera(_ndc.set((x / cw) * 2 - 1, -(y / ch) * 2 + 1), this.fgCam);
    const hits = this.fgRay.intersectObjects(this.fg.children, true);
    for (const h of hits) {
      if (!h.object.visible) continue;
      let o: THREE.Object3D | null = h.object;
      while (o && !o.userData.pick) o = o.parent;
      if (o) return { id: o.userData.pick as string, hit: h };
      if ((h.object as THREE.Mesh).isMesh) return null;
    }
    return null;
  }

  // ---------------------------------------------------------------- camera
  /** the resting wide shot */
  private home(): [THREE.Vector3, THREE.Vector3] {
    if (this.portrait) return [V(2.15, 2.35, 0.95), V(-0.12, 0.95, -0.05)];
    return [V(1.32, 2.05, 2.3), V(-0.1, 0.96, -0.08)];
  }
  focus(p: Pick | null) {
    if (this.mode === 'field') return;
    if (!p || !this.rig) { const [a, b] = this.home(); this.camPosT.copy(a); this.camAtT.copy(b); return; }
    const a = this.anchor(p, new THREE.Vector3());
    const close = p === 'eyes' || p === 'jaw' || p === 'brain' || p === 'hand_l' || p === 'hand_r';
    this.camAtT.copy(a);
    if (this.portrait) { this.camPosT.set(a.x + (close ? 0.75 : 1.05), a.y + (close ? 0.95 : 1.3), a.z + (close ? 0.3 : 0.45)); return; }
    const side = p.endsWith('_l') ? -1 : 1;
    this.camPosT.set(a.x + (close ? 0.45 : 0.65), a.y + (close ? 0.75 : 1.05), a.z + (side < 0 ? 0.95 : 1.15) * (close ? 0.85 : 1.25));
  }
  /** a hard cut to a new angle (springs reset) */
  cut(pos: THREE.Vector3, at: THREE.Vector3, punch = 0) {
    this.camPos.copy(pos); this.camPosT.copy(pos); this.camAt.copy(at); this.camAtT.copy(at);
    this.camVel.set(0, 0, 0); this.atVel.set(0, 0, 0);
    if (punch) this.punchK = Math.max(this.punchK, punch);
  }
  dolly(pos: THREE.Vector3, at: THREE.Vector3, w = 3.2) { this.camPosT.copy(pos); this.camAtT.copy(at); this.camW = w; }
  private povAt(p: Pick | null) {
    if (!this.rig) return;
    const head = this.anchor('eyes', new THREE.Vector3());
    this.camPosT.set(head.x - 0.1, head.y + 0.16, head.z);
    this.camAtT.copy(p ? this.anchor(p, new THREE.Vector3()) : V(0.6, TABLE_Y + 0.2, 0));
  }
  shake(a: number) { this.shakeT = Math.max(this.shakeT, a); }
  /** a hit: camera punch, a beat of frozen time, a little flash */
  impact(k: number, stopMs = 0) { this.punchK = Math.max(this.punchK, k * 0.8); this.stopT = Math.max(this.stopT, stopMs / 1000); this.flash = Math.max(this.flash, k * 0.1); this.shake(k * 0.55); }

  // ---------------------------------------------------------------- arms at rest
  private restArms(snap = false) {
    const s = V(-0.95, 1.55, -0.55), o = V(1.05, 1.55, -0.55);
    if (snap) { this.surgeon.snapTo(s, -1.0); this.orderly.snapTo(o, -1.0); }
    else { this.surgeon.moveTo(s, -1.0, 0.04); this.orderly.moveTo(o, -1.0, 0.04); }
    this.surgeon.spinRate = 0; this.surgeon.flame = 0; this.orderly.grip = 0.15;
  }

  // ---------------------------------------------------------------- clocks
  private tweens: (() => void)[] = [];
  tween(ms: number, fn: (t: number) => void): Promise<void> {
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
  wait(ms: number): Promise<void> { return this.tween(ms, () => {}); }
  /** wait until an arm settles (or a timeout) */
  private async settle(a: IndustrialArm, maxMs = 900) { const t0 = this.t; while (!a.settled && this.t - t0 < maxMs / 1000) await this.wait(30); }
  private _phase = '';
  private onPhase?: (ph: string) => void;
  get phase() { return this._phase; }
  set phase(v: string) { if (v !== this._phase) { this._phase = v; if (v) this.onPhase?.(v); } }
  private viewShift = [0, 0];
  setViewShift(x: number, y: number) { this.viewShift = [x, y]; }
  /** speed the current sequence up (a click while busy) */
  get hurry() { return this.speed > 1; }
  set hurry(v: boolean) { this.speed = v ? 3 : 1; }

  // ---------------------------------------------------------------- the intro: lights, the gantry, the drop, the straps
  async intro(fast = false) {
    if (!this.rig) return;
    this.busy = true;
    if (this.mode === 'field' || fast) {
      for (const p of this.room.pods) p.color.setRGB(3.2, 3.0, 2.7);
      this.lampOn = 6; this.fade = 0;
      this.straps.snapAll(true);
      this.gantry.trolley.position.x = -3.6;
      this.placeOnTable(); this.hangK = 0; this.lowerK = 1;
      this.busy = false;
      return;
    }
    this.phase = 'intro';
    this.cinematic = true;
    const G = this.gantry;
    this.carry = 1; this.hangK = 1; this.lowerK = 0;
    G.trolley.position.x = -3.7; G.drop = 0.55;
    // dark: the practicals only; the camera low by the table, looking up at the dead lamp
    this.cut(V(1.0, 1.25, 1.55), V(0.0, 2.1, 0.0));
    this.dolly(V(0.85, 1.35, 1.35), V(0.0, 2.15, 0.0), 1.2);
    await this.tween(500, (t) => { this.fade = 1 - t; });
    // the pods come on one by one
    for (let i = 0; i < 6; i++) {
      await this.wait(170);
      this.podOn(i);
      csfx('sg_lamp', 0.55, 0.9 + i * 0.04);
      this.shake(0.05);
    }
    await this.wait(250);
    // the gantry brings the subject in, hanging limp in the slings
    this.cut(V(0.6, 1.85, 3.0), V(-1.6, 1.6, 0), 0.05);
    this.dolly(V(1.0, 1.9, 2.7), V(-0.2, 1.55, 0), 1.6);
    csfx('cy_servo', 0.5, 0.7);
    const from = -3.7, to = ROOT_X - 0.8;
    await this.tween(2100, (t) => { G.trolley.position.x = from + (to - from) * easeOut(t); });
    csfx('cy_thunk', 0.8); this.shake(0.12);
    await this.wait(500);
    // lowered onto the pad: the left arm and the legs fold onto it, the right arm stays over the edge
    this.cut(V(1.45, 1.5, 1.85), V(0.0, 1.05, 0.05));
    this.dolly(V(1.35, 1.45, 1.7), V(0.0, 1.0, 0.05), 1.4);
    csfx('cy_hiss', 0.6);
    const d0 = G.drop;
    await this.tween(1300, (t) => { const k = ease(t); G.drop = d0 + this.dropToTable() * k; this.lowerK = Math.min(1, k * 1.15); });
    // the slings let go: dead weight hits the pad
    G.slack = 0.01;
    csfx('cy_hiss', 0.8, 1.2);
    await this.tween(140, (t) => { G.slack = t; });
    this.releaseToRagdoll();
    csfx('sg_thud', 1.0);
    this.cut(V(0.2, 1.15, 1.05), V(-0.25, 0.98, 0.15), 0.25);
    this.impact(0.6, 110);
    this.dolly(V(0.4, 1.3, 1.25), V(-0.2, 0.98, 0.1), 1.0);
    this.fx.steam(V(0.1, TABLE_Y + 0.05, 0.25), 3, 0.5);
    // the gantry pulls away
    const tx = G.trolley.position.x, dd = G.drop;
    this.tween(1600, (t) => { G.slack = 1; G.drop = dd - (dd - 0.55) * ease(t * 2); G.trolley.position.x = tx + (from - tx) * ease(Math.max(0, t - 0.25) / 0.75); });
    await this.wait(900);
    csfx('sg_bone', 0.25);
    await this.wait(700);
    // the straps snap shut, one, two, three
    const [hp, ha] = this.home();
    this.cut(V(0.9, 1.6, 1.6), V(0.1, 0.95, 0.0));
    for (let i = 0; i < 3; i++) {
      this.straps.shut(i);
      await this.wait(90);
      csfx('sg_strap', 0.9, 0.95 + i * 0.05);
      this.impact(0.35, 50);
      this.jolt(0.35);
      await this.wait(260);
    }
    await this.wait(200);
    this.dolly(hp, ha, 2.4);
    this.cinematic = false;
    this.carry = 0;
    this.phase = '';
    this.busy = false;
    this.hurry = false;
  }
  private lampOn = 0;
  private podOn(i: number) { this.room.pods[i].color.setRGB(3.2, 3.0, 2.7); this.lampOn = Math.max(this.lampOn, i + 1); this.flash = Math.max(this.flash, 0.05); }
  /** how much further the hoist must pay out to set the body on the pad */
  private dropToTable(): number {
    const G = this.gantry;
    const barY = G.trolley.position.y - 0.4 - G.drop;
    const want = SUBJ_Y + 0.035 - (-0.45 + 0.1);
    return Math.max(0, barY - want);
  }
  /** hand the body to the ragdoll for the slump */
  private releaseToRagdoll() {
    const r = this.rig!;
    this.carry = 0;
    this.placeOnTable();
    this.subj.position.y += 0.035;
    r.applyPose(this.basePose());
    r.ragWorld = { ground: (x, z) => (Math.abs(x) < TABLE_HALF_X && Math.abs(z) < TABLE_HALF_Z ? TABLE_Y : 0) };
    this.subj.updateMatrixWorld(true);
    if (!r.ragdoll) r.ragdoll = new Ragdoll();
    r.ragdoll.start(r.bones, r.dims, V(0, -0.9, 0), V(0.2, 0.25, 1.6), 'farm_r', 0.12);
    r.ragW = 1;
    this.restQ = null;
  }

  // ---------------------------------------------------------------- the operation
  /** take what is in a slot off (flesh or hardware) and fit a part, or flesh back (key null) */
  async swap(slot: CyberSlot, key: string | null, onPhase?: (ph: string) => void) {
    const r = this.rig;
    if (!r || this.busy) return;
    this.busy = true;
    this.onPhase = onPhase;
    this.hurry = false;
    this.cinematic = this.mode === 'intake';
    const kind = SLOT_KIND[slot];
    const S = slot.endsWith('_l') ? 'L' : 'R';
    const covers = SLOT_COVERS[slot];
    const had = this.load[slot] ?? null;
    const limb = kind === 'arm' || kind === 'hand' || kind === 'leg';
    const rootBone = ((kind === 'arm' ? 'uarm' : kind === 'hand' ? 'hand' : kind === 'leg' ? 'thigh' : kind === 'eyes' || kind === 'jaw' ? 'head' : 'chest') + (limb ? S : '')) as BoneName;
    const holdBone = ((kind === 'arm' ? 'farm' : kind === 'hand' ? 'hand' : kind === 'leg' ? 'shin' : 'head') + (limb ? S : '')) as BoneName;
    const joint = (out = new THREE.Vector3()) => { r.root.updateMatrixWorld(true); return r.bones[rootBone].getWorldPosition(out); };
    const boneAt = (b: BoneName, y: number, out = new THREE.Vector3()) => { r.root.updateMatrixWorld(true); return out.set(0, y * r.s, 0).applyMatrix4(r.bones[b].matrixWorld); };
    const Su = this.surgeon, Or = this.orderly;
    const BLOOD: Record<string, string[]> = { arm: ['torso_u', 'neck'], hand: ['farm_' + S.toLowerCase()], leg: ['groin', 'torso_l'], eyes: ['head', 'neck'], jaw: ['head', 'neck'], spine: ['torso_u'], skin: ['torso_u', 'torso_l'] };
    this.stress = Math.max(this.stress, 0.5);
    const missing = !had && covers.length > 0 && covers.every((c) => this.sev.includes(c));
    const cutAt = limb ? joint() : this.anchor(kind === 'eyes' ? 'eyes' : kind === 'jaw' ? 'jaw' : kind === 'spine' ? 'spine' : 'skin', new THREE.Vector3());
    if (kind === 'arm') cutAt.lerp(this.anchor(S === 'L' ? 'arm_l' : 'arm_r', new THREE.Vector3()), 0.15);
    const work = () => {
      if (this.mode === 'field') { this.povAt(slot); return; }
      const a = cutAt;
      if (this.portrait) this.dolly(V(a.x + 0.85, a.y + 0.95, a.z + 0.35), a.clone(), 2.6);
      else this.dolly(V(a.x + 0.42, a.y + 0.7, a.z + (S === 'L' && limb ? 0.95 : 1.05)), a.clone(), 2.6);
    };
    const closeCut = (k = 0.18) => {
      if (this.mode === 'field') return;
      const a = cutAt;
      if (this.portrait) this.cut(V(a.x + 0.55, a.y + 0.6, a.z + 0.25), a.clone(), k);
      else this.cut(V(a.x + 0.3, a.y + 0.42, a.z + 0.7), a.clone(), k);
    };
    // ---- 0. framing; the orderly takes hold of the limb (or the head)
    this.phase = 'approach';
    if (this.mode === 'intake') { closeCut(0.05); work(); }
    else this.povAt(slot);
    Su.setTool('saw'); csfx('sg_clunk', 0.6);
    const grip = limb && !missing ? boneAt(holdBone, kind === 'hand' ? -0.05 : -0.12) : this.anchor('brain', new THREE.Vector3());
    Or.grip = 0;
    Or.moveTo(_v.copy(grip).add(V(0.02, 0.3, -0.02)), -1.45);
    await this.wait(420);
    Or.moveTo(_v.copy(grip).add(V(0, 0.02, 0)), -1.5, 0.05);
    await this.settle(Or, 700);
    Or.grip = 1; csfx('cy_hiss', 0.4, 1.3); this.jolt(0.2, [holdBone, rootBone].filter((b) => this.off[b]));
    await this.wait(200);
    // ---- 1. the saw comes down
    Su.spinRate = 26;
    Su.moveTo(_v.copy(cutAt).add(V(0.02, 0.32, -0.02)), -1.3);
    await this.wait(650);
    Su.moveTo(_v.copy(cutAt).add(V(0, 0.015, 0)), -1.32, 0.09);
    await this.wait(260);
    // ---- 2. contact: convulsions, blood (or sparks off old hardware)
    this.phase = 'cut';
    const flesh = !had;
    closeCut(0.22);
    this.impact(0.9, 120);
    csfx('sg_bone', 0.6);
    const saw = csfxVoice(flesh ? 'saw' : 'drill'); saw.set(0.7, flesh ? 1 : 1.5);
    this.voices.push(saw);
    Su.spinRate = 70;
    this.stress = 1; this.alarm.intensity = 4;
    this.convulse(1.6, 0.6);
    const T0 = this.t, dur = limb ? 1.35 : 0.95;
    while (this.t - T0 < dur) {
      const p = Su.tipWorld(_v3);
      const dir = _v.subVectors(Su.tipWorld(_v), cutAt).normalize();
      if (flesh) {
        this.fx.blood(p, 7, 1.0, V(dir.x * 0.4 + 0.3, 0.3, 0.6)); if (Math.random() < 0.3) this.fx.mist(p, 1);
        for (const b of BLOOD[kind] || []) this.bloodOn[b] = Math.min(3, (this.bloodOn[b] ?? 0) + 0.2);
        this.applyCondSoon();
      } else this.fx.spark(p, 6, 'grind');
      this.shake(0.14); this.hurt = Math.max(this.hurt, flesh ? 0.55 : 0.25);
      Su.goal.y = cutAt.y + 0.012 + Math.sin(this.t * 19) * 0.016;
      saw.set(0.75, (flesh ? 0.9 : 1.4) + Math.sin(this.t * 7) * 0.08);
      await this.wait(55);
    }
    saw.stop();
    // ---- 3. it comes off: the orderly carries it to the tray
    this.phase = 'drop';
    let severed: THREE.Mesh | null = null;
    if (limb && !missing) {
      r.root.updateMatrixWorld(true);
      severed = new THREE.Mesh(had ? loosePartGeo(had, slot, r.dims) : fleshLimbGeo(kind, r), this.wmat);
      severed.castShadow = true;
      r.bones[rootBone].matrixWorld.decompose(severed.position, severed.quaternion, severed.scale);
      this.scene.add(severed);
      Or.hold.attach(severed);
      if (had) delete this.load[slot];
      for (const c of covers) if (!this.sev.includes(c)) this.sev.push(c);
      this.stump[covers[0]] = { s: had ? 'healed' : 'raw' };
      if (!had) this.bleeding = covers[0];
      this.applyCond();
      csfx(had ? 'cy_rip' : 'sg_squelch', 0.9);
      this.impact(1.1, 160);
      this.hurt = had ? 0.3 : 1; this.flash = 0.3;
      if (!had) { this.fx.blood(cutAt, 45, 1.5, V(0.2, 0.6, 0.5)); this.fx.mist(cutAt, 6); }
      else this.fx.spark(cutAt, 30, 'grind');
      this.jolt(1.0);
    } else if (had) {
      delete this.load[slot]; this.applyCond(); this.fx.spark(cutAt, 26, 'grind'); this.impact(0.7, 90);
    }
    Su.spinRate = 6;
    Su.moveTo(V(-0.9, 1.5, -0.45), -1.0, 0.04);
    if (severed) {
      Or.moveTo(_v.copy(grip).add(V(0.15, 0.55, 0.05)), -1.2, 0.04);
      await this.wait(650);
      this.work2(() => this.dolly(V(TRAY_POS.x + 0.6, TRAY_POS.y + 0.8, TRAY_POS.z + 1.4), V(TRAY_POS.x - 0.3, TRAY_POS.y + 0.1, TRAY_POS.z - 0.2), 2.4));
      Or.moveTo(_v.copy(TRAY_POS).add(V(0, 0.38, 0)), -1.35);
      await this.settle(Or, 1100);
      Or.grip = 0; csfx('cy_hiss', 0.4);
      this.scene.attach(severed);
      this.loose.push({ mesh: severed, v: V(0, -0.3, 0), spin: V((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 3), rest: false });
      await this.wait(350);
    } else await this.wait(450);
    Or.grip = 0.2;
    // ---- 4. the new part (or vat-grown flesh) from the hatch
    this.phase = 'bring';
    const rj = joint(new THREE.Vector3());
    let carried: THREE.Mesh | null = null;
    if (key || limb) {
      Or.moveTo(_v.copy(HATCH_POS).add(V(0, 0.0, 0.32)), -0.15);
      this.work2(() => { if (this.mode === 'intake') this.dolly(V(1.6, 1.7, 0.9), V(HATCH_POS.x - 0.3, HATCH_POS.y - 0.1, HATCH_POS.z + 0.5), 2.2); });
      await this.settle(Or, 1200);
      csfx('sg_clunk', 0.7, 0.8);
      carried = new THREE.Mesh(key ? loosePartGeo(key, slot, r.dims) : fleshLimbGeo(kind, r, true), this.wmat);
      carried.castShadow = true;
      Or.root.updateMatrixWorld(true);
      Or.hold.add(carried);
      carried.position.set(0.02, 0, 0); carried.rotation.set(0, 0, Math.PI / 2);
      Or.grip = 0.85;
      await this.wait(250);
      work();
      Or.moveTo(_v.copy(rj).add(V(0.12, 0.42, 0.02)), -1.2);
      await this.wait(900);
      // set it to the stump
      this.scene.attach(carried);
      const p0 = carried.position.clone(), q0 = carried.quaternion.clone();
      const pB = new THREE.Vector3(), qB = new THREE.Quaternion(), sB = new THREE.Vector3();
      Or.moveTo(_v.copy(rj).add(V(0.06, 0.12, 0.0)), -1.35, 0.03);
      await this.tween(650, (t) => {
        r.root.updateMatrixWorld(true);
        r.bones[rootBone].matrixWorld.decompose(pB, qB, sB);
        const k = easeOut(t);
        carried!.position.lerpVectors(p0, pB, k);
        carried!.quaternion.slerpQuaternions(q0, qB, k);
        carried!.scale.copy(sB);
      });
      csfx('cy_thunk', 0.8); this.impact(0.5, 70); this.jolt(0.5);
    }
    // ---- 5. bolted (drill), then welded (torch); flesh is clamped and sutured
    this.phase = 'bolt';
    Su.setTool(key ? 'drill' : 'clamp'); csfx('sg_clunk', 0.7);
    await this.wait(300);
    const bolts = limb ? 3 : 2;
    const ring = (i: number) => _v.copy(rj).add(V(Math.cos(i * 2.1) * 0.05, 0.05 + Math.abs(Math.sin(i * 2.1)) * 0.02, Math.sin(i * 2.1) * 0.05));
    const drill = csfxVoice('drill'); this.voices.push(drill);
    for (let i = 0; i < bolts; i++) {
      Su.moveTo(ring(i).clone().add(V(0, 0.18, 0)), -1.35);
      await this.wait(320);
      Su.moveTo(ring(i).clone(), -1.4, 0.06);
      Su.spinRate = key ? 50 : 0; Su.clampOpen = key ? 0 : 1;
      await this.wait(200);
      csfx(key ? 'cy_bolt' : 'sg_squelch', 0.85);
      this.impact(0.45, 70);
      if (i === 0) closeCut(0.12);
      drill.set(key ? 0.55 : 0, 1.2);
      const t1 = this.t + 0.42;
      while (this.t < t1) {
        const p = Su.tipWorld(_v3);
        if (key) { this.fx.spark(p, 4, 'grind'); this.weld.position.copy(p); this.weld.intensity = 1.5 + Math.random() * 2; }
        else { this.fx.blood(p, 2, 0.4); Su.clampOpen = 0.5 + Math.sin(this.t * 30) * 0.5; }
        this.shake(0.07);
        await this.wait(45);
      }
      drill.set(0, 1);
      this.jolt(0.45, [rootBone, holdBone, 'chest', 'neck', 'head'].filter((b) => this.off[b]));
      this.convulse(0.25, 0.25);
    }
    drill.stop();
    Su.spinRate = 0;
    this.weld.intensity = 0;
    if (key) {
      Su.setTool('weld'); csfx('sg_clunk', 0.7);
      await this.wait(320);
      Su.moveTo(_v.copy(rj).add(V(-0.05, 0.06, -0.06)), -1.3);
      await this.wait(380);
      const weldV = csfxVoice('weld'); weldV.set(0.6, 1); this.voices.push(weldV);
      const tw = this.t;
      while (this.t - tw < 1.0) {
        const k = (this.t - tw) / 1.0;
        Su.goal.copy(rj).add(V(-0.05 + k * 0.1, 0.06, -0.06 + k * 0.12));
        Su.flame = 1;
        const p = Su.tipWorld(_v3);
        this.fx.spark(p, 5, 'weld'); if (Math.random() < 0.4) this.fx.smoke(p, 1);
        this.weld.position.copy(p); this.weld.intensity = 4 + Math.random() * 6;
        this.flash = Math.max(this.flash, Math.random() < 0.08 ? 0.12 : 0);
        this.shake(0.03);
        await this.wait(40);
      }
      weldV.stop(); Su.flame = 0; this.weld.intensity = 0;
      this.fx.smoke(rj, 6);
    }
    // ---- 6. it is part of the subject now: the orderly lets go, the hardware wakes
    if (carried) this.scene.remove(carried);
    for (const c of covers) { const i = this.sev.indexOf(c); if (i >= 0) this.sev.splice(i, 1); delete this.stump[c]; }
    if (key) this.load[slot] = key; else delete this.load[slot];
    this.bleeding = '';
    this.applyCond();
    Or.grip = 0;
    this.restArms();
    this.alarm.intensity = 0;
    this.phase = 'test';
    if (key) {
      csfx('cy_powerup', 0.85);
      if (this.mode === 'intake') {
        const c = this.anchor('skin', new THREE.Vector3());
        this.cut(this.portrait ? V(c.x + 1.0, c.y + 1.0, c.z + 0.3) : V(c.x + 0.7, c.y + 0.75, c.z + 1.1), c.clone(), 0.35);
      }
      this.impact(1.0, 170);
      this.flash = 0.45;
      this.fx.steam(rj, 6, 1.2);
      csfx('cy_hiss', 0.8);
      await this.arch(0.75);
      this.convulse(0.4, 0.3);
      await this.wait(300);
      if (limb) {
        const fk = kind === 'leg' ? 'shin' + S : 'grip' + S;
        const fk2 = kind === 'arm' ? 'farm' + S : '';
        csfx('cy_servo', 0.6);
        await this.tween(800, (t) => { const w = Math.sin(t * Math.PI * 2) * (1 - t); this.flex[fk] = Math.max(0, w) * (kind === 'leg' ? 0.9 : 0.85); if (fk2) this.flex[fk2] = Math.max(0, w) * 1.2; });
        this.flex = {};
      }
    } else {
      this.fx.steam(rj, 3, 0.6);
      await this.wait(500);
    }
    this.stress = 0.35;
    if (this.mode === 'field') this.povAt(null); else this.focus(this.selected);
    this.cinematic = false;
    this.phase = '';
    this.busy = false;
    this.hurry = false;
  }
  private work2(fn: () => void) { if (this.mode === 'intake') fn(); }

  /** the finale: straps fly open, the lamp goes down pod by pod */
  async discharge() {
    this.busy = true; this.cinematic = true;
    for (let i = 0; i < 3; i++) { this.straps.open(i); csfx('sg_strap', 0.6, 1.2); await this.wait(110); }
    for (let i = 5; i >= 0; i--) { this.room.pods[i].color.setRGB(0.05, 0.05, 0.05); this.lampOn = i; csfx('sg_lamp', 0.4, 0.7); await this.wait(110); }
    await this.tween(400, (t) => { this.fade = t; });
  }

  // ---------------------------------------------------------------- vitals
  private drawVitals(dt: number) {
    const M = this.room.vitals, c = M.ctx;
    const bpm = 62 + this.stress * 115;
    this.beat += dt * bpm / 60;
    const ph = this.beat % 1;
    const y = ph < 0.06 ? -11 * Math.sin(ph / 0.06 * Math.PI) : ph < 0.1 ? 5 * Math.sin((ph - 0.06) / 0.04 * Math.PI) : ph > 0.3 && ph < 0.4 ? -2.5 * Math.sin((ph - 0.3) / 0.1 * Math.PI) : 0;
    const steps = Math.max(1, Math.round(dt * 34));
    const col = this.stress > 0.7 ? '#ff5a4a' : '#5aff92';
    for (let i = 0; i < steps; i++) {
      this.vx = (this.vx + 1) % 48;
      c.fillStyle = '#020a05'; c.fillRect(this.vx, 0, 3, 26);
      c.fillStyle = col; c.fillRect(this.vx, 14 + Math.round(y), 1, 1);
    }
    if (this.t - this.vLast > 0.3) {
      this.vLast = this.t;
      c.fillStyle = '#020a05'; c.fillRect(0, 26, 48, 8);
      c.fillStyle = col;
      // a bar for the pulse and one for the oxygen (no numbers at this size)
      c.fillRect(2, 28, Math.round(bpm / 8), 3);
      c.fillStyle = '#40e0ff'; c.fillRect(28, 28, Math.round((98 - this.stress * 9) / 6), 3);
    }
    if (ph < 0.05 && this.lastPh >= 0.05 && this.stress > 0.5) csfx('cy_beep', 0.18);
    this.lastPh = ph;
    M.tex.needsUpdate = true;
  }
  private vx = 0; private vLast = 0;

  // ---------------------------------------------------------------- per frame
  private resize() {
    if (!this.renderer) return;
    const w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight);
    const dpr = window.devicePixelRatio || 1;
    const pxCss = Math.max(2, Math.round(Math.sqrt((w * h) / (560 * 315))));
    const P = Math.max(1, Math.round(pxCss * dpr));
    const lw = Math.ceil((w * dpr) / P), lh = Math.ceil((h * dpr) / P);
    const ow = Math.round(w * dpr), oh = Math.round(h * dpr);
    if (this.overlay.width !== ow || this.overlay.height !== oh) { this.overlay.width = ow; this.overlay.height = oh; }
    this.dpr = dpr; this.art = P / dpr;
    this.portrait = w / h < 0.85;
    if (lw === this.lowW && lh === this.lowH) return;
    this.lowW = lw; this.lowH = lh;
    this.renderer.setSize(lw, lh, false);
    this.canvas.style.width = `${(lw * P) / dpr}px`; this.canvas.style.height = `${(lh * P) / dpr}px`;
    this.cam.aspect = lw / lh;
    this.baseFov = this.mode === 'field' ? 62 : this.portrait ? 50 : 36;
    this.cam.fov = this.baseFov; this.cam.updateProjectionMatrix();
    this.fgCam.aspect = lw / lh; this.fgCam.updateProjectionMatrix();
    const mk = () => {
      const rt = new THREE.WebGLRenderTarget(lw, lh, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, generateMipmaps: false });
      rt.depthTexture = new THREE.DepthTexture(lw, lh);
      rt.depthTexture.minFilter = THREE.NearestFilter; rt.depthTexture.magFilter = THREE.NearestFilter;
      return rt;
    };
    this.rtS?.dispose(); this.rtF?.dispose();
    this.rtS = mk(); this.rtF = mk();
    if (!this.post) {
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          tS: { value: null }, dS: { value: null }, tF: { value: null }, dF: { value: null }, texel: { value: new THREE.Vector2() },
          nfS: { value: new THREE.Vector2(0.05, 30) }, nfF: { value: new THREE.Vector2(0.5, 12) },
          uTime: { value: 0 }, uHurt: { value: 0 }, uFlash: { value: 0 }, uBars: { value: 0 }, uExpo: { value: 1.0 }, uFade: { value: 1 }, uFgOn: { value: 1 },
        },
        vertexShader: POST_VS, fragmentShader: POST_FS, depthTest: false, depthWrite: false,
      });
      const scene = new THREE.Scene();
      const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); q.frustumCulled = false;
      scene.add(q);
      this.post = { scene, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), mat };
    }
    const u = this.post.mat.uniforms;
    u.tS.value = this.rtS.texture; u.dS.value = this.rtS.depthTexture; u.tF.value = this.rtF.texture; u.dF.value = this.rtF.depthTexture;
    u.texel.value.set(1 / lw, 1 / lh);
  }

  private frame = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const rdt = Math.min(0.05, (now - this.last) / 1000);
    if (rdt < 1 / 65) return;
    this.last = now;
    if (document.hidden || !this.renderer || !this.rtS || !this.post) return;
    const dt = rdt * this.speed;
    // hit-stop: the world holds its breath, the camera does not
    const sdt = this.stopT > 0 ? 0 : dt;
    this.stopT -= rdt;
    this.t += sdt;
    if (sdt > 0) for (const f of this.tweens.splice(0)) f();
    // the gantry and what hangs from it
    this.gantry.update(sdt);
    if (this.rig) {
      if (this.carry) {
        const b = this.gantry.bar;
        b.updateMatrixWorld(true);
        this.subj.position.copy(b.localToWorld(_v.set(0.8, -0.45 + 0.1, 0)));
        this.subj.quaternion.copy(b.getWorldQuaternion(_q2)).multiply(Q_LIE);
      }
      if (sdt > 0 || this.rig.ragdolling) this.poseRig(Math.max(sdt, 0.0001));
    }
    this.straps.update(sdt);
    this.surgeon.update(sdt); this.orderly.update(sdt);
    // servo whine follows the effort
    this.wS?.set(Math.min(0.22, this.surgeon.effort * 0.3), 0.7 + this.surgeon.effort * 0.9);
    this.wO?.set(Math.min(0.22, this.orderly.effort * 0.3), 0.6 + this.orderly.effort * 0.8);
    this.hum?.set(0.16, 1);
    // loose limbs fall into the tray
    for (const l of this.loose) {
      if (l.rest) continue;
      l.v.y -= 9.8 * sdt;
      l.mesh.position.addScaledVector(l.v, sdt);
      l.mesh.rotation.x += l.spin.x * sdt; l.mesh.rotation.y += l.spin.y * sdt; l.mesh.rotation.z += l.spin.z * sdt;
      const fy = surfaceY(l.mesh.position.x, l.mesh.position.z, l.mesh.position.y + 0.1);
      if (l.mesh.position.y < fy + 0.04 && l.v.y < 0) {
        l.mesh.position.y = fy + 0.04; l.rest = true;
        l.mesh.quaternion.setFromEuler(_e.set(Math.PI / 2 + (Math.random() - 0.5) * 0.4, 0, Math.PI / 2 + (Math.random() - 0.5) * 0.6));
        csfx('cy_splat', 0.7); this.fx.blood(l.mesh.position, 12, 0.5); this.shake(0.08);
      }
    }
    while (this.loose.length > 5) { const o = this.loose.shift()!; this.scene.remove(o.mesh); }
    this.fx.update(sdt);
    if (this.bleeding && this.rig && Math.random() < sdt * 14) {
      const b = this.bleeding;
      const p = this.anchor(b.startsWith('thigh') ? (b.endsWith('_l') ? 'leg_l' : 'leg_r') : b.startsWith('hand') ? (b.endsWith('_l') ? 'hand_l' : 'hand_r') : (b.endsWith('_l') ? 'arm_l' : 'arm_r'), _v);
      this.fx.blood(p, 1, 0.3);
    }
    // ambient: steam from the vent, the tube flickers, the lamp breathes
    if (Math.random() < rdt * 2.2) this.fx.steam(VENT_POS, 1, 0.8);
    const fl = Math.random() < 0.012 ? 0.1 : Math.random() < 0.03 ? 0.6 : 1;
    this.fluoroK = damp(this.fluoroK, fl, 30, rdt);
    this.room.fluoro.color.setRGB(0.85, 1, 0.9).multiplyScalar(2.6 * this.fluoroK);
    this.fluoroL.intensity = 3.5 * this.fluoroK;
    const lampK = this.lampOn / 6;
    this.lamp.intensity = 42 * lampK * (1 + Math.sin(this.t * 37) * 0.01 + (Math.random() < 0.004 ? -0.25 : 0));
    this.alarm.intensity = this.alarm.intensity > 0 ? 2.5 + Math.sin(this.t * 14) * 2.5 : 0;
    this.room.beacon.color.setRGB(1, 0.2, 0.06).multiplyScalar(this.alarm.intensity > 0 ? 0.5 + Math.max(0, Math.sin(this.t * 14)) * 3 : 0.3);
    this.gantry.beacon.color.setRGB(1, 0.62, 0.1).multiplyScalar(this.carry && Math.sin(this.t * 9) > 0 ? 3 : 0.4);
    this.alarm.visible = this.alarm.intensity > 0.01; this.weld.visible = this.weld.intensity > 0.01; this.inspect.visible = this.inspect.intensity > 0.02;
    for (const h of this.room.haze) { h.uniforms.uTime.value = this.t; h.uniforms.uI.value = (h === this.room.haze[0] ? 0.11 : 0.07) * lampK; }
    this.room.motes.uniforms.uTime.value = this.t; this.room.motes.uniforms.uI.value = 0.9 * lampK;
    this.stress = Math.max(0.15, this.stress - rdt * 0.06);
    this.drawVitals(sdt);
    this.onFrame?.(rdt);
    // the hand lamp swings over the part under the pointer
    const lit = this.busy ? null : this.hoverP ?? this.selected;
    if (lit && this.rig) {
      const a = this.anchor(lit, _v2);
      this.inspect.position.lerp(_v.set(a.x + 0.1, a.y + 0.35, a.z + 0.15), 1 - Math.exp(-rdt * 10));
      this.inspect.intensity = damp(this.inspect.intensity, lit === this.hoverP ? 2.6 : 1.6, 8, rdt);
    } else this.inspect.intensity = damp(this.inspect.intensity, 0, 6, rdt);
    // camera: spring dolly, punch, shake
    if (this.mode === 'field' && this.rig && !this.busy) this.povAt(null);
    const spring = (p: THREE.Vector3, v: THREE.Vector3, t: THREE.Vector3, w: number) => {
      v.x += ((t.x - p.x) * w * w - 2 * w * v.x) * rdt; v.y += ((t.y - p.y) * w * w - 2 * w * v.y) * rdt; v.z += ((t.z - p.z) * w * w - 2 * w * v.z) * rdt;
      p.addScaledVector(v, rdt);
    };
    const W = this.camW * (this.speed > 1 ? 1.6 : 1);
    if (this.mode === 'field' && this.entrance < 1) { const k = 1 - this.entrance; _v.copy(this.camPosT).add(_v2.set(-0.5 * k, 0.9 * k, 0.6 * k)); spring(this.camPos, this.camVel, _v, 3.6); }
    else spring(this.camPos, this.camVel, this.camPosT, W);
    spring(this.camAt, this.atVel, this.camAtT, W * 1.15);
    this.punchK = Math.max(0, this.punchK - rdt * 2.6);
    const fov = this.baseFov * (1 - this.punchK * 0.2);
    if (Math.abs(this.cam.fov - fov) > 0.01) { this.cam.fov = fov; this.cam.updateProjectionMatrix(); }
    this.bars += ((this.cinematic ? 1 : 0) - this.bars) * Math.min(1, rdt * 5);
    this.shakeT = Math.max(0, this.shakeT - rdt * 1.7);
    const sh = this.shakeT * this.shakeT * 0.07;
    this.cam.position.set(this.camPos.x + (Math.random() - 0.5) * sh, this.camPos.y + (Math.random() - 0.5) * sh + Math.sin(this.t * 0.5) * 0.008, this.camPos.z + (Math.random() - 0.5) * sh);
    this.cam.lookAt(this.camAt);
    if (this.viewShift[0] || this.viewShift[1]) this.cam.setViewOffset(this.lowW, this.lowH, Math.round(this.viewShift[0] * this.lowW), Math.round(this.viewShift[1] * this.lowH), this.lowW, this.lowH);
    else if (this.cam.view) this.cam.clearViewOffset();
    this.hurt = Math.max(0, this.hurt - rdt * 0.8);
    this.flash = Math.max(0, this.flash - rdt * 3);
    const pu = this.post.mat.uniforms;
    pu.uTime.value = this.t; pu.uHurt.value = this.hurt; pu.uFlash.value = this.flash; pu.uBars.value = this.bars; pu.uFade.value = this.fade;
    pu.uExpo.value = 1.15; pu.uFgOn.value = this.fg.children.length > 3 ? 1 : 0;
    pu.nfS.value.set(this.cam.near, this.cam.far); pu.nfF.value.set(this.fgCam.near, this.fgCam.far);
    this.render();
    if (this.onOverlay) {
      const c = this.octx;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, this.overlay.width, this.overlay.height);
      this.onOverlay(c, { w: this.overlay.width, h: this.overlay.height, dpr: this.dpr, art: this.art * this.dpr, t: this.t });
    }
  };
  private fluoroK = 1;

  private render() {
    const r = this.renderer!;
    const saved = { cut: U.uCutOn.value, vis: U.uVisOn.value, fn: U.uFogNear.value, ff: U.uFogFar.value, gs: U.uGridScale.value, col: U.uCollapse.value, snap: U.uSnapOn.value };
    U.uCutOn.value = 0; U.uVisOn.value = 0; U.uFogNear.value = 1e4; U.uFogFar.value = 2e4; U.uGridScale.value = 0; U.uCollapse.value = 0; U.uSnapOn.value = 0;
    try {
      r.setRenderTarget(this.rtS);
      r.setClearColor(0x020203, 1);
      r.clear(true, true, true);
      r.render(this.scene, this.cam);
      r.setRenderTarget(this.rtF);
      r.setClearColor(0x000000, 0);
      r.clear(true, true, true);
      if (this.fg.children.length > 3) r.render(this.fg, this.fgCam);
      r.setRenderTarget(null);
      r.render(this.post!.scene, this.post!.cam);
    } finally {
      U.uCutOn.value = saved.cut; U.uVisOn.value = saved.vis; U.uFogNear.value = saved.fn; U.uFogFar.value = saved.ff; U.uGridScale.value = saved.gs; U.uCollapse.value = saved.col; U.uSnapOn.value = saved.snap;
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    for (const v of this.voices) v.stop();
    if (this.rig) { this.subj.remove(this.rig.root); this.rig.dispose(); this.rig = null; }
    this.room.vitals.tex.dispose();
    this.rtS?.dispose(); this.rtF?.dispose();
    this.fx.dispose(); this.surgeon.dispose(); this.orderly.dispose();
    this.scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.geometry) m.geometry.dispose(); });
    this.fg.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.geometry) m.geometry.dispose(); });
    for (const m of this.mats.all) m.dispose();
    if (this.renderer) { this.renderer.dispose(); this.renderer.forceContextLoss(); this.renderer = null; }
    this.canvas.remove(); this.overlay.remove();
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
