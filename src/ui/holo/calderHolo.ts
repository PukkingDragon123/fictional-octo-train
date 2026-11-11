// Dr. Iris Calder on your screen: a full-colour hologram over the normal game
// view (the tutorial's guide, src/game/tutorial/tutorial.ts). Not a meeting:
// she is a projection from the band, standing on the glass in front of the
// picture, and she points at what she is talking about: a part of the body
// console, the hotbar, the watch, a chair in the room, the press, a door.
//
// Her body is the menu guide's researcher (src/entities/researcher.ts, through
// src/game/prologue/calder.ts: her own badge, glasses and make-up) in her real
// colours, lit like a person (a warm key, a soft fill, a cold rim), drawn by its
// own little renderer onto a transparent canvas over the game and composited
// through a projection pass: scanlines, a slow roll, a 24 fps flicker, a cyan
// edge glow and inner rim, a little chromatic split, rows tearing when the
// signal glitches, and a materialise sweep (feet to head on, head to feet off)
// with a sparkle band on the front. A light disc of projector light under her
// feet. The canvas maps straight onto the screen (a plane at her depth is the
// screen in CSS px), so pointing at a screen spot is pointing at it.
//
//   const h = calderHolo()            the one hologram (lazy)
//   h.appear() / h.dissolve()        shimmer on / off (holo_on / holo_off)
//   h.standAt(fx, fy)                where her feet are (screen fractions); far moves blink
//   h.point(() => {x, y} | null)     aim the right arm (screen CSS px, follows a moving target)
//   h.talk(secs), h.gesture(name)    mouth and hands; h.face('viewer' | 'target')
//   h.update(dt)                     every frame (a GameSystem: g.addSystem(h))
//   h.dispose()
import * as THREE from 'three';
import { G } from '../../game/G';
import { worldMaterial } from '../../gfx/materials';
import { calderRig } from '../../game/prologue/calder';
import type { Researcher, ResearcherGesture } from '../../entities/researcher';

/** world height of the screen at her depth (her 1.7 m is ~40% of the picture) */
const HW = 4.3;
const FOV = 20;
const D = HW / 2 / Math.tan((FOV / 2) * Math.PI / 180);
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const smooth = (t: number) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

const VERT = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const FRAG = `
uniform sampler2D tCol; uniform vec2 uRes; uniform float uT, uShow, uGlitch, uFeet, uHead, uOff;
varying vec2 vUv;
float h21(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec2 uv = vUv;
  vec2 px = 1.0 / uRes;
  // rows tear sideways when the signal glitches
  float row = floor(uv.y * uRes.y / 3.0);
  float jr = h21(vec2(row, floor(uT * 30.0)));
  uv.x += (jr - 0.5) * 0.03 * uGlitch * step(0.72, jr);
  float ca = (0.7 + 3.0 * uGlitch) * px.x;
  vec4 c = texture2D(tCol, uv);
  float r = texture2D(tCol, uv + vec2(ca, 0.0)).r, b = texture2D(tCol, uv - vec2(ca, 0.0)).b;
  c.r = mix(c.r, r, 0.65); c.b = mix(c.b, b, 0.65);
  // the silhouette's edge: a glow outside it, a rim inside it
  float a1 = texture2D(tCol, uv + vec2(px.x * 2.0, 0.0)).a, a2 = texture2D(tCol, uv - vec2(px.x * 2.0, 0.0)).a;
  float a3 = texture2D(tCol, uv + vec2(0.0, px.y * 2.0)).a, a4 = texture2D(tCol, uv - vec2(0.0, px.y * 2.0)).a;
  float o1 = texture2D(tCol, uv + vec2(px.x * 5.0, 0.0)).a, o2 = texture2D(tCol, uv - vec2(px.x * 5.0, 0.0)).a;
  float o3 = texture2D(tCol, uv + vec2(0.0, px.y * 5.0)).a, o4 = texture2D(tCol, uv - vec2(0.0, px.y * 5.0)).a;
  // her body is solid wherever the cutout kept it (its texture's alpha is not coverage); the projector's light is additive
  float body = step(0.3, c.a);
  a1 = step(0.3, a1); a2 = step(0.3, a2); a3 = step(0.3, a3); a4 = step(0.3, a4);
  o1 = step(0.3, o1); o2 = step(0.3, o2); o3 = step(0.3, o3); o4 = step(0.3, o4);
  float outer = clamp(max(max(a1, a2), max(a3, a4)) * 0.7 + max(max(o1, o2), max(o3, o4)) * 0.3 - body, 0.0, 1.0);
  float inner = clamp(body - min(min(a1, a2), min(a3, a4)), 0.0, 1.0);
  // the materialise sweep (0 at the feet, 1 over the head)
  float k = (uv.y - uFeet) / max(0.001, uHead - uFeet);
  float front = uShow * 1.3 - 0.15;
  float sp = h21(floor(gl_FragCoord.xy / 3.0) + floor(uT * 14.0));
  float vis = step(k + sp * 0.16, front);
  float band = smoothstep(0.1, 0.0, abs(k - front)) * (1.0 - step(0.999, uShow)) * step(0.001, uShow);
  // scanlines, a slow roll, the flicker
  float sl = 0.84 + 0.16 * step(1.5, mod(gl_FragCoord.y + uOff, 3.0));
  float roll = 0.93 + 0.07 * sin(uv.y * 34.0 - uT * 5.0);
  float flick = 0.95 + 0.05 * h21(vec2(floor(uT * 24.0), 7.0));
  vec3 col = c.rgb * vec3(0.95, 1.0, 1.05) * sl * roll * flick;
  col += vec3(0.32, 0.78, 1.0) * inner * 0.35;
  // a sparse light dust over the body
  col += vec3(0.5, 0.9, 1.0) * step(0.985, h21(floor(gl_FragCoord.xy / 2.0) + floor(uT * 8.0))) * 0.25 * body;
  float a = body * 0.95 * vis;
  vec3 glow = vec3(0.35, 0.85, 1.0) * (outer * 0.5 * vis + band * (body + outer) * 1.1);
  float ga = (outer * 0.35 * vis + band * (body + outer) * 0.7);
  vec3 light = c.rgb * (1.0 - body) * step(0.02, uShow);
  gl_FragColor = vec4(col * a + light + glow, clamp(a + ga * 0.5, 0.0, 1.0));
  #include <colorspace_fragment>
}`;

let one: CalderHolo | null = null;
/** the hologram (one per page, made on first use) */
export function calderHolo(): CalderHolo { return one ??= new CalderHolo(); }
export function calderHoloIf(): CalderHolo | null { return one; }

export class CalderHolo {
  name = 'calderHolo';
  readonly canvas: HTMLCanvasElement;
  readonly rig: Researcher;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private cam: THREE.PerspectiveCamera;
  private rt: THREE.WebGLRenderTarget;
  private fs = new THREE.Scene(); private fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private comp: THREE.ShaderMaterial;
  private pad: THREE.Mesh; private beam: THREE.Mesh;
  private show = 0; private showGoal = 0;
  private glitch = 0;
  private T = 0;
  /** her feet, screen fractions: where she is, where she is going */
  private at = { x: 0.84, y: 0.93 }; private goal = { x: 0.84, y: 0.93 };
  private blinkT = -1;
  private yaw = 0; private yawGoal = 0;
  private aimFn: (() => { x: number; y: number } | null) | null = null;
  private aimW = new THREE.Vector3();
  /** the right arm is on a target */
  pointing = false;
  private faceMode: 'viewer' | 'target' = 'viewer';
  private lookV = new THREE.Vector3();
  private talkT = 0;
  private W = 0; private H = 0;
  private disposed = false;

  constructor() {
    const c = this.canvas = document.createElement('canvas');
    c.className = 'cal-holo';
    c.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:50;pointer-events:none;opacity:0;transition:opacity .2s';
    document.body.appendChild(c);
    const r = this.renderer = new THREE.WebGLRenderer({ canvas: c, alpha: true, antialias: false, premultipliedAlpha: true, powerPreference: 'low-power' });
    r.setClearColor(0x000000, 0);
    r.outputColorSpace = THREE.SRGBColorSpace;
    this.cam = new THREE.PerspectiveCamera(FOV, 16 / 9, 1, D * 3);
    this.cam.position.set(0, 0, D);
    this.cam.lookAt(0, 0, 0);
    this.rt = new THREE.WebGLRenderTarget(4, 4, { depthBuffer: true });
    this.comp = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthTest: false, depthWrite: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      uniforms: { tCol: { value: this.rt.texture }, uRes: { value: new THREE.Vector2(4, 4) }, uT: { value: 0 }, uShow: { value: 0 }, uGlitch: { value: 0 }, uFeet: { value: 0 }, uHead: { value: 1 }, uOff: { value: 0 } },
    });
    const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.comp);
    q.frustumCulled = false;
    this.fs.add(q);
    // her light: a person's, not a phosphor ghost's
    this.scene.add(new THREE.HemisphereLight(0xdfe6f4, 0x4a3e38, 1.1));
    const key = new THREE.DirectionalLight(0xfff0dc, 1.7); key.position.set(-2.5, 4, 5); this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xc8dcff, 0.45); fill.position.set(3, 1, 4); this.scene.add(fill);
    const rim = new THREE.DirectionalLight(0x7fe0ff, 1.6); rim.position.set(1.5, 3, -4); this.scene.add(rim);
    // her body
    this.rig = calderRig(worldMaterial({ noVis: true, noFog: true, noGrid: true }));
    this.rig.root.traverse((o) => { o.frustumCulled = false; });
    this.scene.add(this.rig.root);
    // the projector's light under her feet and its faint beam
    this.pad = new THREE.Mesh(new THREE.CircleGeometry(0.42, 40), new THREE.MeshBasicMaterial({ map: radial(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: 0x7fd8ff }));
    this.pad.rotation.x = -Math.PI / 2;
    this.scene.add(this.pad);
    const bg = new THREE.CylinderGeometry(0.22, 0.42, 1.7, 28, 1, true); bg.translate(0, 0.85, 0);
    this.beam = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ map: fade(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, color: 0x6fcfff, opacity: 0.32 }));
    this.scene.add(this.beam);
    this.resize();
    this.place(true);
  }

  // ============================================================== API
  get visible() { return this.show > 0.02 || this.showGoal > 0; }
  /** fully there (the sweep is over) */
  get solid() { return this.show >= 0.999; }
  appear() {
    if (this.showGoal === 1 && this.blinkT < 0) return;
    this.showGoal = 1; this.glitch = Math.max(this.glitch, 0.9);
    this.canvas.style.opacity = '1';
    G.audio?.flat?.('holo_on', 'sfx', 0.45);
  }
  dissolve() {
    if (this.showGoal === 0) return;
    this.showGoal = 0; this.glitch = Math.max(this.glitch, 0.7); this.blinkT = -1;
    G.audio?.flat?.('holo_off', 'sfx', 0.4);
  }
  /** gone at once */
  hide() { this.show = this.showGoal = 0; this.canvas.style.opacity = '0'; }
  /** where her feet are (fractions of the screen); a long way is a blink (off, across, on) */
  standAt(fx: number, fy = 0.93) {
    fx = clamp(fx, 0.08, 0.92); fy = clamp(fy, 0.5, 0.97);
    if (Math.abs(fx - this.goal.x) < 0.005 && Math.abs(fy - this.goal.y) < 0.005) return;
    this.goal = { x: fx, y: fy };
    if (this.show > 0.5 && Math.abs(fx - this.at.x) > 0.22) { this.blinkT = 0; G.audio?.flat?.('static_burst', 'sfx', 0.12); }
    else if (this.show < 0.05) { this.at = { ...this.goal }; this.place(true); }
  }
  /** point the right arm at a screen spot (a function: targets move); null puts the arm down */
  point(fn: (() => { x: number; y: number } | null) | null) {
    this.aimFn = fn;
    if (!fn) { if (this.pointing) { this.rig.clearGesture(); this.pointing = false; } this.faceMode = 'viewer'; return; }
    this.faceMode = 'target';
    const s = fn();
    if (s) this.toWorld(s.x, s.y, this.aimW);
    this.rig.gesture('point', { at: this.aimW, hold: true });
    this.pointing = true;
  }
  /** a hand gesture (the point keeps its target when it ends) */
  gesture(name: ResearcherGesture, dur?: number) {
    if (this.pointing && name !== 'point') { this.pointing = false; this.aimFn = null; this.faceMode = 'viewer'; }
    this.rig.gesture(name, dur ? { dur } : {});
  }
  talk(secs: number) { this.talkT = Math.max(this.talkT, secs); this.rig.talk(secs); }
  expression(name: string, secs = 2.5) { this.rig.setExpression(name, secs); }
  /** where her feet are going (screen fractions) */
  get spot() { return { ...this.goal }; }
  /** dev: all there, where she is going, now (screenshots) */
  snap() { if (this.showGoal > 0) { this.show = 1; this.blinkT = -1; this.at = { ...this.goal }; this.place(true); this.canvas.style.opacity = '1'; } }
  /** a hiccup in the signal */
  jolt(k = 0.6) { this.glitch = Math.max(this.glitch, k); }
  /** her head on screen (CSS px), for whatever wants to hang by it */
  headScreen(): { x: number; y: number } {
    const v = this.rig.j.head.getWorldPosition(new THREE.Vector3());
    return { x: (v.x / this.k() + this.W / 2), y: this.H / 2 - v.y / this.k() };
  }

  // ============================================================== per frame
  update(dt0: number) {
    if (this.disposed) return;
    const dt = Math.min(0.05, dt0);
    this.T += dt;
    if (innerWidth !== this.W || innerHeight !== this.H) this.resize();
    // the blink across: off fast, jump, on fast
    let goalShow = this.showGoal;
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      this.glitch = Math.max(this.glitch, 0.8);
      if (this.blinkT < 0.22) goalShow = 0;
      else if (this.at.x !== this.goal.x || this.at.y !== this.goal.y) { this.at = { ...this.goal }; this.place(true); G.audio?.flat?.('holo_on', 'sfx', 0.25); }
      if (this.blinkT > 0.5) this.blinkT = -1;
    }
    const rate = this.blinkT >= 0 ? 6 : goalShow > this.show ? 1.15 : 1.6;
    this.show = goalShow > this.show ? Math.min(goalShow, this.show + dt * rate) : Math.max(goalShow, this.show - dt * rate);
    if (this.show <= 0.001 && this.showGoal === 0) { this.canvas.style.opacity = '0'; return; }
    this.canvas.style.opacity = '1';
    // glide toward a near spot
    if (this.blinkT < 0) { const k = 1 - Math.exp(-dt * 3.2); this.at.x += (this.goal.x - this.at.x) * k; this.at.y += (this.goal.y - this.at.y) * k; }
    this.place(false);
    // the signal: now and then a hiccup, more of them while she materialises
    if (Math.random() < dt * (this.show < 1 ? 3 : 0.12)) this.glitch = Math.max(this.glitch, 0.25 + Math.random() * 0.45);
    this.glitch = Math.max(0, this.glitch - dt * 2.4);
    // where she looks and turns: at you while she talks to you, at the thing while she points
    const tgt = this.aimFn?.() ?? null;
    if (tgt) this.toWorld(tgt.x, tgt.y, this.aimW);
    const root = this.rig.root;
    if (this.faceMode === 'target' && tgt) {
      const dx = this.aimW.x - root.position.x;
      // her right arm reaches to the viewer's left; a target on the right turns her toward it
      this.yawGoal = dx > 0.15 ? clamp(0.5 + dx * 0.25, 0.5, 1.15) : clamp(-0.15 + dx * 0.12, -0.55, -0.1);
      this.lookV.copy(this.aimW);
    } else {
      this.yawGoal = clamp((0.5 - this.at.x) * 0.5, -0.25, 0.25);
      this.lookV.set(this.cam.position.x * 0.3, root.position.y + 1.55, D);
    }
    this.yaw += (this.yawGoal - this.yaw) * (1 - Math.exp(-dt * 4));
    root.rotation.y = this.yaw;
    this.rig.lookAt(this.lookV);
    this.talkT = Math.max(0, this.talkT - dt);
    this.rig.update(dt, { speed: 0, stance: 'stand', fidget: !this.pointing && this.talkT <= 0, talking: this.talkT > 0 } as never);
    this.render();
  }

  private k() { return HW / Math.max(1, this.H); }
  /** a screen spot (CSS px) on her plane (world) */
  private toWorld(sx: number, sy: number, out: THREE.Vector3) {
    const k = this.k();
    return out.set((sx - this.W / 2) * k, (this.H / 2 - sy) * k, 0.25);
  }
  private place(snap: boolean) {
    const k = this.k(), root = this.rig.root;
    const x = (this.at.x - 0.5) * this.W * k, y = (0.5 - this.at.y) * this.H * k;
    const bob = Math.sin(this.T * 1.3) * 0.012;
    root.position.set(x, y + bob, 0);
    this.pad.position.set(x, y + 0.004, 0);
    this.beam.position.set(x, y, 0);
    void snap;
  }
  private resize() {
    this.W = innerWidth; this.H = innerHeight;
    const pr = Math.min(2, devicePixelRatio || 1);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(this.W, this.H, false);
    const w = Math.max(4, Math.round(this.W * pr)), h = Math.max(4, Math.round(this.H * pr));
    this.rt.setSize(w, h);
    this.comp.uniforms.uRes.value.set(w, h);
    this.cam.aspect = this.W / this.H;
    this.cam.updateProjectionMatrix();
  }
  private render() {
    const u = this.comp.uniforms, root = this.rig.root;
    u.uT.value = this.T; u.uShow.value = smooth(this.show); u.uGlitch.value = this.glitch; u.uOff.value = Math.floor(this.T * 20) % 3;
    u.uFeet.value = 0.5 + (root.position.y - 0.05) / HW; u.uHead.value = 0.5 + (root.position.y + 1.85) / HW;
    const pm = this.pad.material as THREE.MeshBasicMaterial, bm = this.beam.material as THREE.MeshBasicMaterial;
    pm.opacity = 0.75 * Math.min(1, this.show * 2) * (0.9 + 0.1 * Math.sin(this.T * 7));
    bm.opacity = 0.07 * Math.min(1, this.show * 2);
    const r = this.renderer;
    r.setRenderTarget(this.rt);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(this.scene, this.cam);
    r.setRenderTarget(null);
    r.clear();
    r.render(this.fs, this.fsCam);
  }

  dispose() {
    this.disposed = true;
    try { this.rig.dispose(); } catch { /* ignore */ }
    this.rt.dispose(); this.comp.dispose();
    this.renderer.dispose();
    try { (this.renderer as unknown as { forceContextLoss?: () => void }).forceContextLoss?.(); } catch { /* ignore */ }
    this.canvas.remove();
    if (one === this) one = null;
  }
}

/** a soft radial glow (the projector's light on the floor of the glass) */
function radial(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.35, 'rgba(160,230,255,0.45)'); g.addColorStop(0.75, 'rgba(90,190,255,0.25)'); g.addColorStop(0.9, 'rgba(140,220,255,0.6)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/** a vertical fade for the beam (bright at the pad, gone by her shoulders) */
function fade(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = 4; c.height = 64;
  const x = c.getContext('2d')!;
  const g = x.createLinearGradient(0, 64, 0, 0);
  g.addColorStop(0, 'rgba(255,255,255,0.8)'); g.addColorStop(0.5, 'rgba(255,255,255,0.18)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 4, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
