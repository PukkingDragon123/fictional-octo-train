// Where the emotes are shown off outside the game: the unit itself (a HumanRig in
// the debtor's hazmat suit, the operator's own face when a game is running) on a
// little stage, doing the emote on a loop with its props and its sparks, lit like
// a shop window. One shared WebGL context draws every stage into 2D canvases:
//
//   EmoteStage            a live stage (the shop's turntable): play(anim), tick(dt), draw(ctx, w, h)
//   emoteSheet(anim, px)  a cached strip of frames of the emote (the wheel's and the selector's tiny
//                         live previews: played back by sheetFrame, no 3D per frame)
import * as THREE from 'three';
import { G } from '../../game/G';
import { createPreviewRig, randomAppearance, type HumanRig, type Appearance } from '../../entities/humanRig';
import { hazmatOutfit } from '../../entities/player';
import { ModelBuilder } from '../../gfx/modelBuilder';
import { worldMaterial } from '../../gfx/materials';
import { EmoteParticles, type FxHost } from './fx';
import { EmoteRigFx } from './props';
import { EXT_EMOTES } from '../../entities/humanAnim';
import { playSample } from './sound';

let renderer: THREE.WebGLRenderer | null = null;
let failed = false;
function gl(): THREE.WebGLRenderer | null {
  if (renderer || failed) return renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(1);
    renderer.setClearColor(0x000000, 0);
  } catch (e) { console.warn('emote stage: no WebGL', e); failed = true; renderer = null; }
  return renderer;
}
export const stageOk = () => !!gl();

/** the operator's unit: their own appearance in a game, a fixed one in the menus */
function unitApp(): Appearance {
  const a = (G as unknown as { local?: { app?: Appearance } })?.local?.app;
  if (a) return a;
  let s = 7331;
  return randomAppearance(() => { s = (s * 9301 + 49297) % 233280; return s / 233280; });
}

const DUR_BUILTIN: Record<string, number> = { wave: 2.4, point: 2.2, shrug: 1.8, sit_wait: 4 };
export const emoteDur = (anim: string) => EXT_EMOTES.get(anim)?.dur ?? DUR_BUILTIN[anim] ?? 2.5;

export class EmoteStage {
  readonly scene = new THREE.Scene();
  readonly cam = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
  rig: HumanRig;
  parts = new EmoteParticles(600, { standalone: true });
  fx: EmoteRigFx;
  private flashL = new THREE.PointLight(0xffffff, 0, 8, 1.4);
  private flashT = 0; private flashI = 0; private flashD = 1;
  private top: THREE.Object3D | null = null;
  anim = '';
  private gap = 0;
  yaw = 0;
  spin = 0.35;
  /** sounds from the stage (the shop's turntable is audible, the thumbnails are not) */
  audible = false;
  constructor(o: { turntable?: boolean } = {}) {
    const S = this.scene;
    S.add(new THREE.HemisphereLight(0xfff4e0, 0x3a3428, 1.25));
    const key = new THREE.DirectionalLight(0xfff0d8, 2.1); key.position.set(2.2, 4, 3.2); S.add(key);
    const rim = new THREE.DirectionalLight(0x9fd8ff, 1.0); rim.position.set(-3, 2.5, -2.5); S.add(rim);
    S.add(this.flashL); this.flashL.position.set(0, 2.4, 0.6);
    this.rig = createPreviewRig(unitApp(), hazmatOutfit({}));
    S.add(this.rig.root);
    S.add(this.parts.root);
    const host: FxHost = {
      parts: this.parts,
      sound: (k, v, _at, rate) => { if (this.audible) playSample(k, v * 0.8, rate); },
      flash: (at, col, i, secs) => { this.flashL.position.copy(at); this.flashL.color.setHex(col); this.flashI = i; this.flashT = secs; this.flashD = secs; },
    };
    this.fx = new EmoteRigFx(this.rig, host, { standalone: true, floorY: () => 0 });
    if (o.turntable) this.top = turntable(S);
    this.cam.position.set(0, 1.25, 5.2);
    this.cam.lookAt(0, 1.05, 0);
  }
  play(anim: string) {
    this.anim = anim;
    this.parts.clear();
    this.rig.playEmote(anim, false);
    this.gap = 0;
  }
  /** advance the stage: the emote replays after a short breath */
  tick(dt: number) {
    const st = this.rig.anim.emoteState;
    if (!st && this.anim) { this.gap += dt; if (this.gap > 0.7) this.play(this.anim); }
    this.rig.update(dt, { speed: 0, fidget: false } as never);
    this.fx.update(st ? st.name : null, st ? st.t : 0, dt);
    this.parts.update(dt);
    if (this.top) { this.yaw += dt * this.spin; this.top.rotation.y = this.yaw; this.rig.root.rotation.y = this.yaw; }
    if (this.flashT > 0) { this.flashT -= dt; this.flashL.intensity = this.flashI * Math.max(0, this.flashT / this.flashD); } else this.flashL.intensity = 0;
  }
  /** frame the camera: look at height `y`, `dist` away, slightly above */
  frame(y = 1.0, dist = 5.2, fov = 30, lift = 0.25) { this.cam.fov = fov; this.cam.position.set(0, y + lift, dist); this.cam.lookAt(0, y, 0); this.cam.updateProjectionMatrix(); }
  /** render into a 2D canvas context (w x h device px) */
  draw(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
    const r = gl(); if (!r) return false;
    if (r.domElement.width !== w || r.domElement.height !== h) r.setSize(w, h, false);
    this.cam.aspect = w / h; this.cam.updateProjectionMatrix();
    r.render(this.scene, this.cam);
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(r.domElement, 0, 0, w, h);
    return true;
  }
  dispose() { this.fx.dispose(); this.parts.dispose(); this.rig.root.removeFromParent(); this.rig.dispose?.(); }
}

/** a jukebox turntable: a steel plinth with a hazard band, a rubber-matted platter that turns */
function turntable(S: THREE.Scene): THREE.Object3D {
  const mb = new ModelBuilder();
  mb.cylinder(0, -0.22, 0, 0.82, 0.16, 28, 'metal_grey', { color: 0x4a4e44 });
  mb.cylinder(0, -0.06, 0, 0.78, 0.04, 28, 'white', { color: 0x1a1c18 });
  const base = new THREE.Mesh(mb.build(), worldMaterial({ noVis: true, noFog: true, noGrid: true }));
  S.add(base);
  const top = new THREE.Group();
  const mt = new ModelBuilder();
  mt.cylinder(0, -0.02, 0, 0.72, 0.02, 28, 'white', { color: 0x2a2c26 });
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; mt.box(Math.cos(a) * 0.6, 0.0, Math.sin(a) * 0.6, 0.1, 0.008, 0.03, 'white', { color: i % 2 ? 0xe8b418 : 0x1a1a14 }); }
  top.add(new THREE.Mesh(mt.build(), worldMaterial({ noVis: true, noFog: true, noGrid: true })));
  S.add(top);
  return top;
}

// ---------------------------------------------------------------- cached frame strips
interface Sheet { cv: HTMLCanvasElement; n: number; w: number; h: number; dur: number }
const sheets = new Map<string, Sheet>();
const queue: { key: string; anim: string; w: number; h: number; res: ((s: Sheet | null) => void)[] }[] = [];
let thumbStage: EmoteStage | null = null;
let pumping = false;
/** a strip of `n` frames of the emote at w x h (rendered a little at a time, cached for good) */
export function emoteSheet(anim: string, w: number, h: number): Promise<Sheet | null> {
  const key = `${anim}|${w}|${h}`;
  const have = sheets.get(key);
  if (have) return Promise.resolve(have);
  return new Promise((res) => {
    const q = queue.find((x) => x.key === key);
    if (q) q.res.push(res); else queue.push({ key, anim, w, h, res: [res] });
    if (!pumping) { pumping = true; requestAnimationFrame(pump); }
  });
}
export function sheetNow(anim: string, w: number, h: number): Sheet | null { return sheets.get(`${anim}|${w}|${h}`) ?? null; }
const N_FRAMES = 20;
function pump() {
  const job = queue.shift();
  if (!job) { pumping = false; return; }
  const sh = buildSheet(job.anim, job.w, job.h);
  if (sh) sheets.set(job.key, sh);
  for (const r of job.res) r(sh);
  requestAnimationFrame(pump);
}
function buildSheet(anim: string, w: number, h: number): Sheet | null {
  if (!gl()) return null;
  const st = (thumbStage ??= new EmoteStage());
  st.frame(1.0, 5.4, 30, 0.2);
  st.parts.clear();
  st.fx.update(null, 0, 0);
  // settle into the idle, then run the emote and grab frames spread over it
  st.anim = '';
  for (let i = 0; i < 20; i++) st.tick(1 / 30);
  const dur = Math.min(emoteDur(anim), 7);
  st.play(anim);
  const cv = document.createElement('canvas');
  cv.width = w * N_FRAMES; cv.height = h;
  const ctx = cv.getContext('2d')!;
  const one = document.createElement('canvas'); one.width = w; one.height = h;
  const oc = one.getContext('2d')!;
  const step = dur / N_FRAMES;
  for (let f = 0; f < N_FRAMES; f++) {
    for (let k = 0; k < 4; k++) st.tick(step / 4);
    st.draw(oc, w, h);
    ctx.drawImage(one, f * w, 0);
  }
  st.anim = '';
  st.rig.stopEmote();
  st.fx.update(null, 0, 0);
  st.parts.clear();
  return { cv, n: N_FRAMES, w, h, dur };
}
/** draw the strip's frame for time `t` (seconds, it loops) */
export function sheetFrame(ctx: CanvasRenderingContext2D, sh: Sheet, t: number, dw = sh.w, dh = sh.h) {
  const f = Math.floor(((t % (sh.dur + 0.6)) / sh.dur) * sh.n);
  const i = Math.max(0, Math.min(sh.n - 1, f));
  ctx.clearRect(0, 0, dw, dh);
  ctx.drawImage(sh.cv, i * sh.w, 0, sh.w, sh.h, 0, 0, dw, dh);
}
