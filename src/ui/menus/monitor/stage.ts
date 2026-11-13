// The menu stage: ONE small WebGL renderer for the main menu's own rooms (the
// monitor room, the codex archive, the control room). Only the room on
// screen renders at full rate, small (a low-res half-float target), and is
// composited by the subject room's post pass (scene/post.ts: a black 1px
// silhouette line, filmic grade, light dither) onto a canvas that CSS blows up
// by a whole number with hard pixels. The other rooms keep living at a low
// rate: each feeds a tiny render target that the monitor bank shows.
//
//   stage.add(room)            a StageRoom (scene + camera + hot props)
//   stage.show(id)             which room is on screen (the others only feed)
//   stage.feed(id, w, h, fps)  a low-rate render target of a room's feed camera
//   stage.paused               draw nothing (another full-screen view is up)
//   stage.onHot                hover / press callbacks for the room's hot props
import * as THREE from 'three';
import { U } from '../../../gfx/materials';
import { makePost, Bloom } from '../scene/post';
import { gfxSettings } from '../common';

/** a prop the pointer can hover and press */
export interface Hot {
  key: string;
  /** the objects whose meshes take the pointer */
  objs: THREE.Object3D[];
  /** caption (floating words under the pointer) */
  label: string;
  sub?: string;
  /** meshes that glow while hovered (defaults to every mesh under objs) */
  glow?: THREE.Object3D[];
  press?: (p: THREE.Vector3) => void;
  hover?: (on: boolean) => void;
  /** not pressable right now */
  off?: boolean;
}

export interface Grade {
  exposure?: number; lift?: [number, number, number]; gain?: [number, number, number]; vig?: number; sat?: number; contrast?: number; side?: [number, number, number, number]; haze?: number; hazeColor?: number;
  /** depth ambient occlusion strength (default 0.8) and radius in metres */
  ao?: number; aoRad?: number;
  /** the lamps' glow scattered into the air (default 0.35) */
  scatter?: number;
  /** bounce light: the room's own light spilled back onto every surface (default 0.22) */
  bounce?: number;
  /** world points of up to three lamps that throw screen-space shafts (scene/post.ts), their strength (default 0.6) and colour */
  shafts?: THREE.Vector3[]; shaftK?: number; shaftColor?: number;
}

/** a room the stage can show */
export interface StageRoom {
  id: string;
  scene: THREE.Scene;
  cam: THREE.PerspectiveCamera;
  /** the CCTV camera for the monitor bank (defaults to cam) */
  feedCam?: THREE.PerspectiveCamera;
  hots: Hot[];
  grade?: Grade;
  /** run the room: full = it is on screen (camera, every effect), else it is only a feed */
  update(dt: number, t: number, full: boolean): void;
  /** before a full render: the camera's aspect (and any off-centre framing) */
  frame?(aspect: number, portrait: boolean): void;
  /** a feed is about to render */
  feedFrame?(): void;
  enter?(): void;
  leave?(): void;
}

interface Feed { room: StageRoom; rt: THREE.WebGLRenderTarget; every: number; acc: number }

const hotMats = new WeakMap<THREE.Material, THREE.Material>();
const HOT_EMIS = new THREE.Color(0x3a2c14);

export class MenuStage {
  canvas = document.createElement('canvas');
  renderer: THREE.WebGLRenderer | null = null;
  readonly host: HTMLElement;
  rooms = new Map<string, StageRoom>();
  active: StageRoom | null = null;
  paused = false;
  /** called every animation frame (before the stage draws), even while paused */
  onTick?: (dt: number, t: number) => void;
  /** a hot prop gained / lost the pointer (x, y = client point) */
  onHot?: (h: Hot | null, x: number, y: number) => void;
  /** the pointer moved over the stage (client coords) */
  onPointer?: (x: number, y: number) => void;
  /** a press that hit no hot prop */
  onMiss?: () => void;
  t = 0;
  lowW = 0; lowH = 0;
  quality = 'high';
  private rt: THREE.WebGLRenderTarget | null = null;
  private post = makePost();
  /** the cutscenes' bloom (scene/post.ts) */
  private bloom = Object.assign(new Bloom(), { thr: 1.7, knee: 0.5 }); // only true emitters (lamps, tubes, screens) bloom, not white coats
  /** the whole lit room blurred wide: bounce light and the light shafts' source (scene/post.ts tFill) */
  private fill = Object.assign(new Bloom(), { thr: 0.06, knee: 0.05 });
  private shaftV = new THREE.Vector3();
  private feeds = new Map<string, Feed>();
  private raf = 0; private last = 0;
  private ro: ResizeObserver;
  private ray = new THREE.Raycaster(); private ndc = new THREE.Vector2();
  private hover: Hot | null = null;
  private down: { x: number; y: number; t: number; id: number } | null = null;
  private glowK = 0;
  private swapped: { m: THREE.Mesh; base: THREE.Material | THREE.Material[] }[] = [];

  constructor(host: HTMLElement) {
    this.host = host;
    this.canvas.className = 'rm-cv mr-cv';
    Object.assign(this.canvas.style, { position: 'absolute', right: 'auto', bottom: 'auto', imageRendering: 'pixelated' });
    host.append(this.canvas);
    const gs = gfxSettings();
    const coarse = matchMedia('(pointer: coarse)').matches;
    this.quality = gs.quality === 'auto' ? (coarse ? 'low' : 'high') : gs.quality;
    try {
      const r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, alpha: false, powerPreference: coarse ? 'low-power' : 'default' });
      r.outputColorSpace = THREE.SRGBColorSpace;
      r.setPixelRatio(1);
      r.setClearColor(0x000000, 1);
      r.shadowMap.enabled = true;
      r.shadowMap.type = THREE.PCFShadowMap;
      r.info.autoReset = false;
      this.renderer = r;
    } catch (e) { console.warn('menu stage renderer unavailable', e); }
    this.bindInput();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  get low() { return this.quality === 'low'; }
  add(room: StageRoom) {
    this.rooms.set(room.id, room);
    // soft shadows: a wider PCF disk on every shadow-casting lamp (penumbrae, not hard pixel edges)
    room.scene.traverse((o) => { const L = o as THREE.SpotLight; if (L.isLight && L.castShadow && L.shadow) L.shadow.radius = Math.max(L.shadow.radius, 3.5); });
    return room;
  }
  show(id: string) {
    const r = this.rooms.get(id) ?? null;
    if (r === this.active) return;
    this.setHover(null, 0, 0);
    this.active?.leave?.();
    this.active = r;
    r?.enter?.();
  }
  /** compile every room's shaders ahead of time (in parallel where the driver can), so the first look at a room does not hitch */
  async warm(between?: () => Promise<void>): Promise<void> {
    const r = this.renderer;
    if (!r) return;
    // with KHR_parallel_shader_compile the driver builds them off the main thread; without it each
    // room is compiled in its own task (a breath between) so the loading screen keeps moving
    const par = !!(r as any).compileAsync && r.extensions.has('KHR_parallel_shader_compile');
    const jobs: Promise<unknown>[] = [];
    for (const room of this.rooms.values()) {
      try {
        if (par) jobs.push((r as any).compileAsync(room.scene, room.cam));
        else { r.compile(room.scene, room.cam); if (between) await between(); }
      } catch { /* compiled on first use instead */ }
    }
    await Promise.all(jobs).catch(() => undefined);
  }
  /** a low-rate feed of a room (its feedCam) into a small target; returns the texture */
  feed(id: string, w: number, h: number, fps: number): THREE.Texture | null {
    const room = this.rooms.get(id);
    if (!room) return null;
    let f = this.feeds.get(id);
    if (!f) {
      const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
      f = { room, rt, every: 1 / fps, acc: Math.random() / fps };
      this.feeds.set(id, f);
    }
    return f.rt.texture;
  }
  /** client point of a world point in the active room (null if behind the camera) */
  project(p: THREE.Vector3, out = { x: 0, y: 0 }): { x: number; y: number } | null {
    const a = this.active;
    if (!a) return null;
    const v = p.clone().project(a.cam);
    if (v.z > 1) return null;
    const r = this.canvas.getBoundingClientRect();
    out.x = r.left + (v.x * 0.5 + 0.5) * r.width;
    out.y = r.top + (-v.y * 0.5 + 0.5) * r.height;
    return out;
  }
  /** a world ray from a client point through the active room's camera */
  rayAt(x: number, y: number): THREE.Ray | null {
    const a = this.active;
    if (!a) return null;
    const r = this.canvas.getBoundingClientRect();
    this.ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, a.cam);
    return this.ray.ray;
  }

  // ---------------------------------------------------------------- input
  private hotAt(x: number, y: number): { h: Hot; p: THREE.Vector3 } | null {
    const a = this.active;
    if (!a || !a.hots.length || !this.rayAt(x, y)) return null;
    let best: { h: Hot; p: THREE.Vector3; d: number } | null = null;
    for (const h of a.hots) {
      if (h.off) continue;
      for (const o of h.objs) {
        if (!o.visible) continue;
        const hit = this.ray.intersectObject(o, true)[0];
        if (hit && (!best || hit.distance < best.d)) best = { h, p: hit.point, d: hit.distance };
      }
    }
    return best;
  }
  private bindInput() {
    const cv = this.canvas;
    cv.addEventListener('pointermove', (e) => {
      if (this.paused) return;
      this.onPointer?.(e.clientX, e.clientY);
      if (e.pointerType !== 'mouse' && !this.down) return;
      const hit = this.hotAt(e.clientX, e.clientY);
      this.setHover(hit?.h ?? null, e.clientX, e.clientY);
    });
    cv.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') this.setHover(null, 0, 0); });
    cv.addEventListener('pointerdown', (e) => {
      if (this.paused) return;
      this.down = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
      if (e.pointerType !== 'mouse') { const hit = this.hotAt(e.clientX, e.clientY); this.setHover(hit?.h ?? null, e.clientX, e.clientY); }
    });
    const up = (e: PointerEvent) => {
      const d = this.down;
      this.down = null;
      if (!d || d.id !== e.pointerId || e.type !== 'pointerup' || this.paused) return;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 14 || performance.now() - d.t > 900) return;
      const hit = this.hotAt(e.clientX, e.clientY);
      if (hit) hit.h.press?.(hit.p); else this.onMiss?.();
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
  }
  /** hover a hot prop by key (keyboard focus on its DOM twin) */
  hoverKey(key: string | null) {
    const h = key ? this.active?.hots.find((q) => q.key === key) ?? null : null;
    this.setHover(h, -1, -1);
  }
  private setHover(h: Hot | null, x: number, y: number) {
    if (h === this.hover) { if (h && x >= 0) this.onHot?.(h, x, y); return; }
    if (this.hover) { this.hover.hover?.(false); this.unglow(); }
    this.hover = h;
    this.canvas.classList.toggle('over', !!h);
    if (h) { h.hover?.(true); this.glow(h); }
    this.onHot?.(h, x, y);
  }
  get hovered() { return this.hover; }
  /** the hovered prop's meshes swap to a warm-lit twin of their material */
  private glow(h: Hot) {
    this.glowK = 0;
    for (const o of h.glow ?? h.objs) o.traverse((m) => {
      const mesh = m as THREE.Mesh;
      if (!mesh.isMesh || mesh.userData.noGlow) return;
      const base = mesh.material;
      if (Array.isArray(base)) return;
      const std = base as THREE.MeshStandardMaterial;
      if (!('emissive' in std) || (base as THREE.MeshBasicMaterial).isMeshBasicMaterial) return;
      let hm = hotMats.get(base);
      if (!hm) { hm = base.clone(); (hm as THREE.MeshStandardMaterial).emissive = HOT_EMIS.clone(); hotMats.set(base, hm); }
      this.swapped.push({ m: mesh, base });
      mesh.material = hm;
    });
  }
  private unglow() { for (const s of this.swapped) s.m.material = s.base; this.swapped = []; }

  // ---------------------------------------------------------------- frame
  private resize() {
    const r = this.renderer;
    if (!r) return;
    const w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight);
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const dw = w * dpr, dh = h * dpr;
    // near the screen's own resolution (a realistic image, not a chunky pixel filter); low quality halves it
    const target = this.quality === 'low' ? 960 * 540 : this.quality === 'medium' ? 1280 * 720 : 1920 * 1080;
    const S = Math.max(1, Math.round(Math.sqrt((dw * dh) / target)));
    const lw = Math.max(32, Math.ceil(dw / S)), lh = Math.max(32, Math.ceil(dh / S));
    const cw = (lw * S) / dpr, ch = (lh * S) / dpr;
    Object.assign(this.canvas.style, { width: cw + 'px', height: ch + 'px', left: Math.floor((w - cw) / 2) + 'px', top: Math.floor((h - ch) / 2) + 'px' });
    if (lw === this.lowW && lh === this.lowH) return;
    this.lowW = lw; this.lowH = lh;
    r.setSize(lw, lh, false);
    this.rt?.dispose();
    this.rt = new THREE.WebGLRenderTarget(lw, lh, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, depthTexture: new THREE.DepthTexture(lw, lh) });
    const u = this.post.u;
    u.tColor.value = this.rt.texture; u.tDepth.value = this.rt.depthTexture; u.uRes.value.set(lw, lh);
  }

  private loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop);
    const raw = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    if (document.hidden) return;
    this.t += raw;
    this.onTick?.(raw, this.t);
    if (this.paused || !this.renderer || !this.rt) return;
    const a = this.active;
    // the feeds: at most one per frame, the most overdue
    if (a) {
      let due: Feed | null = null;
      for (const f of this.feeds.values()) {
        if (f.room === a) continue;
        f.acc += raw;
        if (f.acc >= f.every && (!due || f.acc - f.every > due.acc - due.every)) due = f;
      }
      if (due) { due.room.update(Math.min(0.12, due.acc), this.t, false); this.renderFeed(due); due.acc = 0; }
    }
    if (!a) return;
    a.update(Math.min(0.05, raw), this.t, true);
    this.glowK += raw;
    for (const s of this.swapped) { const e = (s.m.material as THREE.MeshStandardMaterial).emissive; if (e) e.copy(HOT_EMIS).multiplyScalar(0.75 + 0.35 * Math.sin(this.glowK * 6)); }
    this.renderMain(a);
  };

  private withWorldUniforms(fn: () => void) {
    const saved = { cut: U.uCutOn.value, vis: U.uVisOn.value, fn: U.uFogNear.value, ff: U.uFogFar.value, gs: U.uGridScale.value, col: U.uCollapse.value, snap: U.uSnapOn.value };
    U.uCutOn.value = 0; U.uVisOn.value = 0; U.uFogNear.value = 1e4; U.uFogFar.value = 2e4; U.uGridScale.value = 0; U.uCollapse.value = 0; U.uSnapOn.value = 0;
    try { fn(); } finally {
      U.uCutOn.value = saved.cut; U.uVisOn.value = saved.vis; U.uFogNear.value = saved.fn; U.uFogFar.value = saved.ff; U.uGridScale.value = saved.gs; U.uCollapse.value = saved.col; U.uSnapOn.value = saved.snap;
    }
  }
  private renderFeed(f: Feed) {
    const r = this.renderer!;
    const cam = f.room.feedCam ?? f.room.cam;
    f.room.feedFrame?.();
    cam.aspect = f.rt.width / f.rt.height; cam.updateProjectionMatrix();
    this.withWorldUniforms(() => {
      r.setRenderTarget(f.rt);
      r.setClearColor(0x000000, 1);
      r.clear(true, true, true);
      r.render(f.room.scene, cam);
      r.setRenderTarget(null);
    });
  }
  private renderMain(a: StageRoom) {
    const r = this.renderer!;
    const portrait = this.lowW < this.lowH * 0.95;
    a.frame?.(this.lowW / Math.max(1, this.lowH), portrait);
    const u = this.post.u, g = a.grade ?? {};
    u.uTime.value = this.t;
    u.uExposure.value = g.exposure ?? 1.15;
    // the intake drag cinematic's grade (introKit/stage.ts LOOKS.wing): cold fluorescent shadows, amber spill in
    // the highlights, a firm S-curve, full colour; each room's own grade is pulled most of the way toward it
    const W = { lift: [0.74, 0.94, 1.16], gain: [1.1, 1.0, 0.86], vig: 0.65, contrast: 1.2 };
    const lf = g.lift ?? W.lift, gn = g.gain ?? W.gain, k = 0.7;
    u.uLift.value.set(lf[0] + (W.lift[0] - lf[0]) * k, lf[1] + (W.lift[1] - lf[1]) * k, lf[2] + (W.lift[2] - lf[2]) * k);
    u.uGain.value.set(gn[0] + (W.gain[0] - gn[0]) * k, gn[1] + (W.gain[1] - gn[1]) * k, gn[2] + (W.gain[2] - gn[2]) * k);
    u.uVig.value = Math.min(g.vig ?? W.vig, W.vig);
    u.uSat.value = Math.max(1, g.sat ?? 1);
    u.uContrast.value = Math.max(W.contrast, g.contrast ?? W.contrast);
    u.uBloom.value = 0.95;
    // the air in the room (dust far off), crisp pixels, saturated emitters
    const hc = g.hazeColor ?? 0x6a7a98;
    u.uHaze.value.set(((hc >> 16) & 255) / 255, ((hc >> 8) & 255) / 255, (hc & 255) / 255, g.haze ?? 0.35);
    u.uSharp.value = 0.08; u.uKeepSat.value = 0.5; u.uHalation.value = 0.4;
    u.uOutline.value = 0.28; u.uAA.value = 1; u.uLevels.value = 255;
    u.uSide.value.set(...(g.side ?? [1, 0, 0, 0.4]));
    u.uNear.value = a.cam.near; u.uFar.value = a.cam.far;
    // shading: contact occlusion from depth, the lamps' glow in the air (the rooms' own cones and dust carry the shafts), the lens
    u.uAO.value = this.low ? 0 : g.ao ?? 0.8; u.uAORad.value = g.aoRad ?? 0.3;
    u.uFocal.value = this.lowH / (2 * Math.tan(THREE.MathUtils.degToRad(a.cam.fov) / 2));
    u.uScatter.value = g.scatter ?? 0.35;
    u.uCA.value = 0.9;
    u.uBounce.value = g.bounce ?? 0.22;
    const sc = g.shaftColor ?? 0xfff0d8;
    u.uShaftCol.value.set(((sc >> 16) & 255) / 255, ((sc >> 8) & 255) / 255, (sc & 255) / 255);
    for (let i = 0; i < 3; i++) {
      const s = u.uShaft.value[i], w = g.shafts?.[i];
      s.set(0, 0, 0, 0);
      if (!w || this.low) continue;
      const v = this.shaftV.copy(w).project(a.cam);
      if (v.z > 1 || v.z < -1) continue;
      const x = v.x * 0.5 + 0.5, y = v.y * 0.5 + 0.5;
      // fade as the lamp leaves the frame (one just off the top still throws its rays down)
      const off = Math.max(0, Math.max(-x, x - 1, -y, y - 1.15));
      s.set(x, y, (g.shaftK ?? 0.6) * Math.max(0, 1 - off * 4), 0.8);
    }
    u.uFlash.value = 0; u.uRed.value = 0; u.uFloor.value = 0; u.uLensOn.value = 0;
    this.withWorldUniforms(() => {
      r.info.reset();
      r.setRenderTarget(this.rt);
      r.setClearColor(0x000000, 1);
      r.clear(true, true, true);
      r.render(a.scene, a.cam);
      this.bloom.run(r, this.rt!.texture, this.rt!.width, this.rt!.height, u.uExposure.value);
      this.fill.run(r, this.rt!.texture, this.rt!.width, this.rt!.height, 1);
      u.tFill.value = this.fill.tex[2];
      u.tB1.value = this.bloom.tex[0]; u.tB2.value = this.bloom.tex[1]; u.tB3.value = this.bloom.tex[2];
      r.setRenderTarget(null);
      r.render(this.post.scene, this.post.cam);
    });
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    for (const f of this.feeds.values()) f.rt.dispose();
    this.rt?.dispose();
    this.bloom.dispose(); this.fill.dispose();
    this.post.mat.dispose();
    if (this.renderer) { this.renderer.dispose(); this.renderer.forceContextLoss(); this.renderer = null; }
    this.canvas.remove();
  }
}
