// One small shared renderer that draws a collectible live into any 2D canvas
// (the commissary's slots, the detail window, the build tray): the item
// stands in a vending slot (a dark steel back, a wire coil, a shelf lip)
// under a cold strip light, rendered low-res with the subject room's own
// composite (a black one-pixel line from depth steps, filmic grade, light
// dither) and copied into the target canvas, which CSS enlarges by a whole
// number with hard pixels.
import * as THREE from 'three';
import { makePost } from '../scene/post';
import { makeModel, ITEM } from './catalog';
import { decoMats, DecoBuilder, at, cbox, tube, prism } from './kit';
import type { DecoModel, V3 } from './parts';

interface Entry { model: DecoModel; t: number; last: number }

export class Preview {
  readonly ok: boolean;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(28, 1, 0.02, 30);
  private post = makePost();
  private rts = new Map<string, THREE.WebGLRenderTarget>();
  private holder = new THREE.Group();
  private slot = new THREE.Group();
  private models = new Map<string, Entry>();
  private maxW = 256; private maxH = 256;
  private key = new THREE.DirectionalLight(0xe8f0ff, 2.2);
  private rim = new THREE.DirectionalLight(0xffb070, 1.2);

  constructor() {
    try {
      const cv = document.createElement('canvas');
      this.renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: false, alpha: false, powerPreference: 'low-power' });
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(this.maxW, this.maxH, false);
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.ok = true;
    } catch (e) { console.warn('deco preview unavailable', e); this.ok = false; }
    const S = this.scene;
    S.add(new THREE.HemisphereLight(0x9aa8c0, 0x241c14, 0.9));
    this.key.position.set(0.3, 2, 1.6); S.add(this.key);
    this.rim.position.set(-1.6, 0.8, -1.2); S.add(this.rim);
    const fill = new THREE.DirectionalLight(0x8aa0d0, 0.5); fill.position.set(1.5, 0.3, 0.8); S.add(fill);
    S.add(this.holder, this.slot);
    this.slot.add(slotModel());
    const u = this.post.u;
    u.uSide.value.set(1, 0, 0, 0.4); u.uFloor.value = 0; u.uVig.value = 0.55; u.uExposure.value = 1.2; u.uGrain.value = 0.008; u.uLevels.value = 30;
    u.uNear.value = this.cam.near; u.uFar.value = this.cam.far;
  }

  /** a live model for a target (each canvas keeps its own instance so they animate independently) */
  private entry(tag: string, id: string): Entry | null {
    const k = tag + '|' + id;
    let e = this.models.get(k);
    if (!e) {
      const model = makeModel(id);
      if (!model) return null;
      e = { model, t: Math.random() * 3, last: 0 };
      this.models.set(k, e);
    }
    return e;
  }
  /** forget a target's models (when a card goes away) */
  drop(tag: string) { for (const k of [...this.models.keys()]) if (k.startsWith(tag + '|')) this.models.delete(k); }

  /**
   * Draw item `id` into ctx (w x h low-res pixels at dx, dy).
   * yaw: turn of the item; dt: advance its idle animation; slot: draw the vending slot behind it; drop: 0..1 delivery fall
   */
  draw(ctx: CanvasRenderingContext2D, tag: string, id: string, w: number, h: number, o: { dt?: number; yaw?: number; slot?: boolean; drop?: number; dx?: number; dy?: number; bg?: number } = {}) {
    const r = this.renderer;
    const it = ITEM.get(id);
    if (!r || !it) return;
    const e = this.entry(tag, id);
    if (!e) return;
    w = Math.min(this.maxW, Math.max(8, w | 0)); h = Math.min(this.maxH, Math.max(8, h | 0));
    const dt = o.dt ?? 0;
    e.t += dt;
    e.model.update?.(e.t, dt);
    // frame the item: tall things stand, flat things are seen from above
    const flat = it.h < 0.1;
    const size = Math.max(it.h, it.r * 2 * 0.9);
    const ty = flat ? 0 : it.h * 0.5;
    const elev = flat ? 0.75 : 0.16;
    const aspect = w / h;
    this.cam.aspect = aspect;
    const half = Math.max(size * 0.56, (it.r * 1.15) / Math.max(0.6, aspect));
    const dist = half / Math.tan(THREE.MathUtils.degToRad(this.cam.fov / 2)) + it.r * 0.6;
    this.cam.position.set(0, ty + Math.sin(elev) * dist, Math.cos(elev) * dist);
    this.cam.lookAt(0, ty, 0);
    this.cam.updateProjectionMatrix();
    this.holder.clear();
    const obj = e.model.obj;
    obj.rotation.y = o.yaw ?? 0;
    const fall = o.drop ?? 0;
    obj.position.set(0, fall > 0 ? -fall * fall * size * 2.2 : 0, fall > 0 ? fall * size * 0.35 : 0);
    obj.rotation.x = fall * 0.9;
    this.holder.add(obj);
    // the slot scales with the item
    this.slot.visible = o.slot !== false;
    this.slot.scale.setScalar(Math.max(size * 1.15, 0.35));
    this.scene.background = new THREE.Color(o.bg ?? 0x07080a);
    const rt = this.target(w, h);
    const u = this.post.u;
    u.tColor.value = rt.texture; u.tDepth.value = rt.depthTexture; u.uRes.value.set(w, h);
    u.uTime.value = e.t;
    r.setRenderTarget(rt);
    r.setClearColor(o.bg ?? 0x07080a, 1);
    r.clear(true, true, true);
    r.render(this.scene, this.cam);
    r.setRenderTarget(null);
    r.setViewport(0, 0, w, h);
    r.render(this.post.scene, this.post.cam);
    ctx.drawImage(r.domElement, 0, this.maxH - h, w, h, o.dx ?? 0, o.dy ?? 0, w, h);
    this.holder.remove(obj);
  }

  private target(w: number, h: number): THREE.WebGLRenderTarget {
    const k = w + 'x' + h;
    let rt = this.rts.get(k);
    if (!rt) {
      rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, depthTexture: new THREE.DepthTexture(w, h) });
      this.rts.set(k, rt);
    }
    return rt;
  }

  dispose() {
    for (const rt of this.rts.values()) rt.dispose();
    this.rts.clear(); this.models.clear();
    this.renderer?.dispose(); this.renderer = null;
  }
}

/** the vending slot, unit size (1 = the item's size): steel back and sides, a shelf, the wire coil */
function slotModel(): THREE.Group {
  const b = new DecoBuilder();
  // painted steel: the back with its punched slots, the side walls, the shelf and its chrome lip
  b.add('vinyl', cbox(1.6, 1.5, 0.04, 0.01), 0x3a4148, at(0, 0.6, -0.55));
  for (let i = 0; i < 5; i++) b.add('rubber', cbox(0.05, 0.22, 0.02, 0.006), 0x14171a, at(-0.5 + i * 0.25, 1.0, -0.53));
  for (const s of [-1, 1]) b.add('vinyl', cbox(0.04, 1.5, 1.0, 0.01), 0x30363c, at(s * 0.8, 0.6, -0.08));
  b.add('metal', cbox(1.6, 0.04, 1.1, 0.01), 0x5a6068, at(0, -0.02, -0.05));
  b.add('metal', cbox(1.6, 0.07, 0.03, 0.01), 0xb8bcc0, at(0, -0.04, 0.5));
  // the wire coil the item sits in, its motor boss on the back wall
  const pts: V3[] = [];
  for (let i = 0; i <= 26; i++) { const a = i * 0.62; pts.push([Math.cos(a) * 0.34, 0.06 + Math.sin(a) * 0.055, -0.5 + i * 0.034]); }
  b.add('metal', tube(pts, 0.008, 80, 4, false), 0xd0d4d8);
  b.add('metal', prism(0.05, 0.05, 6), 0x6a6e72, at(0, 0.06, -0.52, Math.PI / 2, 0, 0));
  const g = b.build(decoMats(), false);
  g.traverse((o) => { (o as THREE.Mesh).receiveShadow = false; });
  return g;
}
