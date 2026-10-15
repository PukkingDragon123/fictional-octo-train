// Live 3D subject viewer for the personnel file: the exact in-game HumanRig on
// a turntable, lit like a studio, rendered at low resolution through its own
// small WebGL context and composited with a pixel outline so it reads like
// the game. Drag to rotate, wheel / pinch to zoom, double-click for an emote.
import * as THREE from 'three';
import * as RigMod from '../../entities/humanRig';
import { HumanRig, Appearance, Outfit, Pose } from '../../entities/humanRig';
import { HumanAnimator, AnimInput } from '../../entities/humanAnim';
import { U } from '../../gfx/materials';
import { makeHeldMesh } from '../../items/itemMeshes';
import { EMOTES, EMOTE_CYCLE, blendPose } from './emotes';
import { bus } from '../../core/events';

export interface ViewInfo { yaw: number; zoom: number; emote: string }

const MIN_D = 2.2, MAX_D = 7.2;
/** our emote names -> the rig's names where they differ */
const NATIVE_NAMES: Record<string, string> = { jacks: 'jumping_jacks' };
const IDLE_INPUT: AnimInput = {
  speed: 0, stance: 'stand', full: '', action: '', actionT: 0, actionDur: 1, twoHanded: false, limp: 0, tired: 0, panic: 0, cold: 0,
  aimPitch: 0, holdingLight: false, holding: false, lookYaw: 0,
};

function themeColor(name: string, fallback: number): THREE.Color {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (v) return new THREE.Color(v);
  } catch { /* ignore */ }
  return new THREE.Color(fallback);
}

export class RigPreview {
  canvas = document.createElement('canvas');
  renderer: THREE.WebGLRenderer | null = null;
  onInfo?: (i: ViewInfo) => void;
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(26, 1, 0.1, 40);
  private rt: THREE.WebGLRenderTarget | null = null;
  private post: { scene: THREE.Scene; cam: THREE.OrthographicCamera; mat: THREE.ShaderMaterial } | null = null;
  private stage = new THREE.Group();
  private turn = new THREE.Group();
  private rig: HumanRig | null = null;
  private anim = new HumanAnimator();
  private app: Appearance | null = null;
  private outfit: Outfit = {};
  private held: string | null = null;
  private heldMesh: THREE.Object3D | null = null;
  private rimLight = new THREE.DirectionalLight(0x6dff8e, 1.8);
  private ring: THREE.Mesh;
  private scanRing: THREE.Mesh;
  private pads: THREE.Mesh[] = [];
  private yaw = 0.5; private yawVel = 0; private pitch = 0.1; private dist = 5.6; private distT = 5.6;
  private lastUser = -10;
  private t = 0;
  private raf = 0;
  private last = 0;
  private emoteName = ''; private emoteT = 0; private emoteDur = 0;
  private cycleIdx = Math.floor(Math.random() * EMOTE_CYCLE.length);
  private nextAuto = 3.5;
  private scanT = -1;
  private spin = 0;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinch0 = 0; private dist0 = 0;
  private visible = true;
  private ro: ResizeObserver;
  private io: IntersectionObserver | null = null;
  private offTheme: () => void;
  private lowW = 0; private lowH = 0;
  private host: HTMLElement;
  private infoKey = '';

  constructor(host: HTMLElement) {
    this.host = host;
    this.canvas.className = 'pf-cv';
    this.canvas.setAttribute('aria-label', 'Character preview. Drag to rotate, scroll or pinch to zoom, double-click for an emote.');
    host.append(this.canvas);
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, alpha: true, premultipliedAlpha: false, powerPreference: 'low-power', preserveDrawingBuffer: false });
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.setPixelRatio(1);
      this.renderer.setClearColor(0x000000, 0);
    } catch (e) {
      console.warn('preview renderer unavailable', e);
      this.renderer = null;
    }
    this.buildStage();
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.66, 48), new THREE.MeshBasicMaterial({ color: 0x6dff8e, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.061;
    this.ring = ring;
    this.stage.add(ring);
    const scan = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.56, 40), new THREE.MeshBasicMaterial({ color: 0x6dff8e, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    scan.rotation.x = -Math.PI / 2;
    this.scanRing = scan;
    this.stage.add(scan);
    this.scene.add(this.stage);
    this.stage.add(this.turn);
    this.applyTheme();
    this.offTheme = bus.on('uiSettings', () => this.applyTheme());
    this.bindInput();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    try {
      this.io = new IntersectionObserver((es) => { this.visible = es.some((e) => e.isIntersecting); });
      this.io.observe(host);
    } catch { /* old browser: always visible */ }
    this.resize();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private buildStage() {
    // studio: key, fill, phosphor rim from behind, cool bounce from below
    this.scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x1a2418, 0.75));
    const key = new THREE.DirectionalLight(0xfff1dc, 1.7); key.position.set(-2.2, 3.4, 3.2); this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xa8c4ff, 0.45); fill.position.set(3, 1.2, 2); this.scene.add(fill);
    this.rimLight.position.set(1.5, 2.6, -3.2); this.scene.add(this.rimLight);
    // platform: dark metal disc with a bevel and four lamp pads
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.78, 0.06, 40), new THREE.MeshLambertMaterial({ color: 0x2b2f29 }));
    disc.position.y = 0.03;
    this.stage.add(disc);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.004, 40), new THREE.MeshLambertMaterial({ color: 0x151813 }));
    top.position.y = 0.062;
    this.stage.add(top);
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4;
      const pad = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.02, 0.07), new THREE.MeshBasicMaterial({ color: 0x6dff8e }));
      pad.position.set(Math.cos(a) * 0.69, 0.065, Math.sin(a) * 0.69);
      this.pads.push(pad);
      this.stage.add(pad);
    }
    // soft contact shadow
    const sc = document.createElement('canvas'); sc.width = sc.height = 64;
    const g = sc.getContext('2d')!;
    const grd = g.createRadialGradient(32, 32, 2, 32, 32, 31); grd.addColorStop(0, 'rgba(0,0,0,0.75)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.95), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2; sh.position.y = 0.066;
    this.turn.add(sh);
  }

  private applyTheme() {
    const ph = themeColor('--ph', 0x6dff8e);
    this.rimLight.color.copy(ph);
    (this.ring.material as THREE.MeshBasicMaterial).color.copy(ph);
    (this.scanRing.material as THREE.MeshBasicMaterial).color.copy(ph);
    for (const p of this.pads) (p.material as THREE.MeshBasicMaterial).color.copy(ph);
    if (this.post) this.post.mat.uniforms.uRim.value.copy(ph);
  }

  // ---------------------------------------------------------------- character
  /** apply a new appearance (rebuilds the body; the rig keeps its animation state when it can) */
  setAppearance(app: Appearance) {
    this.app = { ...app };
    const cur = this.rig as any;
    if (cur && typeof cur.setAppearance === 'function') {
      try { cur.setAppearance(this.app); return; } catch (e) { console.warn('rig.setAppearance failed', e); }
    }
    if (this.rig) { this.turn.remove(this.rig.root); this.rig.dispose(); this.rig = null; }
    const mod = RigMod as any;
    let rig: HumanRig | null = null;
    try { rig = typeof mod.createPreviewRig === 'function' ? mod.createPreviewRig(this.app, this.outfit) : null; } catch (e) { console.warn('createPreviewRig failed', e); }
    if (!rig) { rig = new HumanRig(this.app); rig.setOutfit(this.outfit); }
    this.rig = rig;
    this.turn.add(rig.root);
    this.heldMesh = null;
    this.setHeld(this.held, true);
  }

  setOutfit(o: Outfit, held: string | null) {
    this.outfit = o;
    if (this.rig) this.rig.setOutfit(o);
    this.setHeld(held);
  }

  private setHeld(key: string | null, force = false) {
    if (key === this.held && !force) return;
    this.held = key;
    if (!this.rig) return;
    let m: THREE.Object3D | null = null;
    try { m = key ? makeHeldMesh(key) : null; } catch { m = null; }
    this.heldMesh = m;
    this.rig.hold('R', m);
  }

  // ---------------------------------------------------------------- animation
  /** true when the rig animates itself (upgraded HumanRig: update() + playEmote()) */
  private get selfAnimated() { const r = this.rig as any; return !!r && typeof r.update === 'function' && typeof r.playEmote === 'function'; }
  private nativeEmote = false;

  /** play an emote now (or the next one in the cycle) */
  emote(name?: string) {
    const rig = this.rig as any;
    const list: readonly string[] = (rig?.emotes as string[]) || [];
    let n = name;
    if (!n) {
      // the cycle, plus a few extras the rig may know
      const cyc = [...EMOTE_CYCLE, ...['clap', 'bow', 'point', 'cheer'].filter((e) => list.includes(e))];
      n = cyc[this.cycleIdx++ % cyc.length];
    }
    const nativeName = NATIVE_NAMES[n] || n;
    this.nativeEmote = false;
    try { rig?.stopEmote?.(); } catch { /* ignore */ }
    if (this.selfAnimated && list.includes(nativeName)) {
      try {
        if (rig.playEmote(nativeName, false) !== false) this.nativeEmote = true;
      } catch { /* fall back to our own pose */ }
    }
    if (!this.nativeEmote && !EMOTES[n]) return;
    this.emoteName = n; this.emoteT = 0; this.emoteDur = EMOTES[n]?.dur ?? 2.4;
    this.nextAuto = this.emoteDur + 4 + Math.random() * 2;
    this.info(true);
  }
  /** short reaction to an edit; a burst of clicks doesn't restart it every time */
  react(kind: 'nod' | 'look' | 'cheer' | 'spin' | 'scan' | string) {
    if (kind === 'spin') { this.spin = Math.PI * 2; this.scan(); return; }
    if (kind === 'scan') { this.scan(); return; }
    if (this.emoteName === kind && this.emoteT < 0.4) return;
    this.emote(kind);
  }
  scan() { this.scanT = 0; }

  /** advance the idle animation + emote and pose the rig */
  private animate(dt: number) {
    const rig = this.rig as any;
    let base: Pose | null = null;
    if (this.selfAnimated) { const r = rig.update(dt); base = r && typeof r === 'object' ? r : null; }
    else base = this.anim.update(dt, IDLE_INPUT);
    if (this.emoteName) {
      this.emoteT += dt;
      if (this.emoteT >= this.emoteDur) { if (this.nativeEmote) rig.stopEmote?.(); this.emoteName = ''; this.nativeEmote = false; this.info(true); }
    } else {
      this.nextAuto -= dt;
      if (this.nextAuto <= 0) this.emote();
    }
    const e = this.emoteName && !this.nativeEmote ? EMOTES[this.emoteName] : null;
    if (e && base) {
      const w = Math.min(1, this.emoteT / 0.28, (this.emoteDur - this.emoteT) / 0.32);
      this.rig!.applyPose(blendPose(base, e.pose(this.emoteT, this.emoteDur), Math.max(0, w)));
    } else if (!this.selfAnimated && base) this.rig!.applyPose(base);
  }

  // ---------------------------------------------------------------- input
  private bindInput() {
    const cv = this.canvas;
    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      cv.classList.add('drag');
      if (this.pointers.size === 2) { const [a, b] = [...this.pointers.values()]; this.pinch0 = Math.hypot(a.x - b.x, a.y - b.y); this.dist0 = this.distT; }
      this.lastUser = this.t;
    });
    cv.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (this.pointers.size === 1) {
        const k = 0.011;
        this.yaw += dx * k; this.yawVel = dx * k / Math.max(0.016, 1 / 60) * 0.5;
        this.pitch = Math.max(-0.15, Math.min(0.55, this.pitch + dy * 0.005));
      } else if (this.pointers.size === 2 && this.pinch0 > 0) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        this.distT = Math.max(MIN_D, Math.min(MAX_D, this.dist0 * this.pinch0 / Math.max(10, d)));
      }
      this.lastUser = this.t;
    });
    const up = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinch0 = 0;
      if (!this.pointers.size) cv.classList.remove('drag');
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', (e) => { e.preventDefault(); this.zoomBy(e.deltaY > 0 ? 1.1 : 1 / 1.1); }, { passive: false });
    cv.addEventListener('dblclick', () => this.emote());
  }
  zoomBy(f: number) { this.distT = Math.max(MIN_D, Math.min(MAX_D, this.distT * f)); this.lastUser = this.t; this.info(); }
  rotateBy(a: number) { this.yawVel += a * 3; this.lastUser = this.t; }

  // ---------------------------------------------------------------- render
  private resize() {
    if (!this.renderer) return;
    const w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight);
    // render pixels are whole UI art pixels (or a multiple of them on big screens)
    const ui = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--pxn')) || 2;
    const px = ui * Math.max(1, Math.round(Math.max(2, Math.round(Math.min(w, h * 0.8) / 200)) / ui));
    const lw = Math.max(32, Math.round(w / px)), lh = Math.max(32, Math.round(h / px));
    if (lw === this.lowW && lh === this.lowH) return;
    this.lowW = lw; this.lowH = lh;
    this.renderer.setSize(lw, lh, false);
    this.cam.aspect = lw / lh;
    this.cam.updateProjectionMatrix();
    this.rt?.dispose();
    this.rt = new THREE.WebGLRenderTarget(lw, lh, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
    if (!this.post) {
      const mat = new THREE.ShaderMaterial({
        uniforms: { tex: { value: null }, texel: { value: new THREE.Vector2() }, uRim: { value: themeColor('--ph', 0x6dff8e) } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
        fragmentShader: `
          uniform sampler2D tex; uniform vec2 texel; uniform vec3 uRim; varying vec2 vUv;
          void main(){
            vec4 c = texture2D(tex, vUv);
            float n = 0.0, far = 0.0;
            n = max(n, texture2D(tex, vUv + vec2(texel.x, 0.0)).a);
            n = max(n, texture2D(tex, vUv - vec2(texel.x, 0.0)).a);
            n = max(n, texture2D(tex, vUv + vec2(0.0, texel.y)).a);
            n = max(n, texture2D(tex, vUv - vec2(0.0, texel.y)).a);
            far = max(far, texture2D(tex, vUv + vec2(texel.x * 2.0, 0.0)).a);
            far = max(far, texture2D(tex, vUv - vec2(texel.x * 2.0, 0.0)).a);
            far = max(far, texture2D(tex, vUv + vec2(0.0, texel.y * 2.0)).a);
            far = max(far, texture2D(tex, vUv - vec2(0.0, texel.y * 2.0)).a);
            if (c.a > 0.5) { gl_FragColor = vec4(c.rgb, 1.0); }
            else if (n > 0.5) { gl_FragColor = vec4(0.012, 0.03, 0.016, 1.0); }
            else if (far > 0.5) { gl_FragColor = vec4(uRim * 0.55, 0.35); }
            else { gl_FragColor = vec4(0.0); }
            #include <colorspace_fragment>
          }`,
        transparent: true, depthTest: false, depthWrite: false,
      });
      const scene = new THREE.Scene();
      scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
      this.post = { scene, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), mat };
    }
    this.post.mat.uniforms.tex.value = this.rt.texture;
    this.post.mat.uniforms.texel.value.set(1 / lw, 1 / lh);
  }

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, (now - this.last) / 1000);
    if (dt < 1 / 45) return; // ~30-40 fps is plenty for a preview
    this.last = now;
    if (!this.visible || document.hidden || !this.renderer || !this.rig || !this.rt) return;
    this.t += dt;
    // turntable
    const idle = this.t - this.lastUser > 2.5;
    this.yaw += this.yawVel * dt;
    this.yawVel *= Math.exp(-dt * 4);
    if (this.spin > 0) { const s = Math.min(this.spin, dt * 9); this.spin -= s; this.yaw += s; }
    else if (idle) {
      if (this.emoteName) {
        // face the camera for the show
        const target = Math.round(this.yaw / (Math.PI * 2)) * Math.PI * 2;
        this.yaw += (target - this.yaw) * (1 - Math.exp(-dt * 2.2));
      } else this.yaw += dt * 0.32;
    }
    this.dist += (this.distT - this.dist) * (1 - Math.exp(-dt * 10));
    this.turn.rotation.y = this.yaw;
    // pose
    this.animate(dt);
    this.rig.heldR.visible = !this.emoteName;
    // scan ring sweep
    const H = 1.85 * (this.app?.height ?? 1);
    const sm = this.scanRing.material as THREE.MeshBasicMaterial;
    if (this.scanT >= 0) {
      this.scanT += dt;
      const k = this.scanT / 0.9;
      this.scanRing.position.y = 0.07 + k * H;
      sm.opacity = k < 1 ? Math.sin(k * Math.PI) * 0.9 : 0;
      if (k >= 1) this.scanT = -1;
    } else sm.opacity = 0;
    for (const p of this.pads) p.scale.y = 1 + 0.4 * Math.sin(this.t * 3 + p.position.x * 5);
    // camera: closer zoom frames the head
    // default framing keeps the feet above the ID strip; zooming in slides up to the face
    const zoomK = Math.max(0, Math.min(1, (5.6 - this.dist) / (5.6 - MIN_D)));
    const ty = (0.74 + zoomK * 0.8) * (this.app?.height ?? 1);
    this.cam.position.set(0, ty + Math.sin(this.pitch) * this.dist, Math.cos(this.pitch) * this.dist);
    this.cam.lookAt(0, ty, 0);
    this.render();
    this.info();
  };

  private render() {
    const r = this.renderer!;
    // world-only shader features off while we draw (shared uniforms with the main renderer)
    const saved = { cut: U.uCutOn.value, vis: U.uVisOn.value, fn: U.uFogNear.value, ff: U.uFogFar.value, gs: U.uGridScale.value, col: U.uCollapse.value, snap: U.uSnapOn.value };
    U.uCutOn.value = 0; U.uVisOn.value = 0; U.uFogNear.value = 1e4; U.uFogFar.value = 2e4; U.uGridScale.value = 0; U.uCollapse.value = 0; U.uSnapOn.value = 0;
    try {
      r.setRenderTarget(this.rt);
      r.setClearColor(0x000000, 0);
      r.clear(true, true, true);
      r.render(this.scene, this.cam);
      r.setRenderTarget(null);
      r.clear(true, true, true);
      r.render(this.post!.scene, this.post!.cam);
    } finally {
      U.uCutOn.value = saved.cut; U.uVisOn.value = saved.vis; U.uFogNear.value = saved.fn; U.uFogFar.value = saved.ff; U.uGridScale.value = saved.gs; U.uCollapse.value = saved.col; U.uSnapOn.value = saved.snap;
    }
  }

  private info(force = false) {
    if (!this.onInfo) return;
    const deg = Math.round(((this.yaw * 180 / Math.PI) % 360 + 360) % 360);
    const zoom = Math.round((5.6 / this.dist) * 10) / 10;
    const key = deg + '|' + zoom + '|' + this.emoteName;
    if (!force && key === this.infoKey) return;
    this.infoKey = key;
    this.onInfo({ yaw: deg, zoom, emote: this.emoteName ? (EMOTES[this.emoteName]?.label ?? this.emoteName.toUpperCase()) : '' });
  }

  /**
   * A small head-and-shoulders portrait of the subject (for the ID photo):
   * rendered face-on at 2x and box-filtered down, returned as sRGB pixels.
   */
  snapshot(w: number, h: number): ImageData | null {
    const r = this.renderer;
    if (!r || !this.rig) return null;
    const W = w * 2, H = h * 2;
    const rt = new THREE.WebGLRenderTarget(W, H, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
    const cam = new THREE.PerspectiveCamera(18, W / H, 0.1, 20);
    const hh = 1.58 * (this.app?.height ?? 1);
    cam.position.set(0.25, hh + 0.08, 2.35); cam.lookAt(0, hh - 0.04, 0);
    const yaw = this.turn.rotation.y, stageVis = this.stage.children.map((c) => c.visible);
    this.turn.rotation.y = 0;
    this.stage.children.forEach((c) => { if (c !== this.turn) c.visible = false; });
    const saved = { cut: U.uCutOn.value, vis: U.uVisOn.value, fn: U.uFogNear.value, ff: U.uFogFar.value, gs: U.uGridScale.value };
    U.uCutOn.value = 0; U.uVisOn.value = 0; U.uFogNear.value = 1e4; U.uFogFar.value = 2e4; U.uGridScale.value = 0;
    const px = new Uint8Array(W * H * 4);
    try {
      r.setRenderTarget(rt);
      r.setClearColor(0x000000, 0);
      r.clear(true, true, true);
      r.render(this.scene, cam);
      r.readRenderTargetPixels(rt, 0, 0, W, H, px);
    } finally {
      r.setRenderTarget(null);
      U.uCutOn.value = saved.cut; U.uVisOn.value = saved.vis; U.uFogNear.value = saved.fn; U.uFogFar.value = saved.ff; U.uGridScale.value = saved.gs;
      this.turn.rotation.y = yaw;
      this.stage.children.forEach((c, i) => { c.visible = stageVis[i]; });
      rt.dispose();
    }
    const toS = (v: number) => { v /= 255; v = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055; return Math.max(0, Math.min(255, Math.round(v * 255))); };
    const out = new ImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let n = 0, R = 0, G = 0, B = 0;
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
        const si = ((H - 1 - (y * 2 + j)) * W + x * 2 + i) * 4;
        if (px[si + 3] > 100) { n++; R += px[si]; G += px[si + 1]; B += px[si + 2]; }
      }
      const di = (y * w + x) * 4;
      if (n >= 2) { out.data[di] = toS(R / n); out.data[di + 1] = toS(G / n); out.data[di + 2] = toS(B / n); out.data[di + 3] = 255; }
    }
    return out;
  }

  /** debug/screenshot hook: freeze into a given emote at time t */
  debugPose(name: string, t: number) { this.emoteName = name; this.emoteT = t; this.emoteDur = EMOTES[name]?.dur ?? 2; this.nativeEmote = false; }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.io?.disconnect();
    this.offTheme();
    if (this.rig) { this.turn.remove(this.rig.root); this.rig.dispose(); this.rig = null; }
    this.scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry?.dispose(); });
    this.rt?.dispose();
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      this.renderer = null;
    }
    this.canvas.remove();
  }
}
