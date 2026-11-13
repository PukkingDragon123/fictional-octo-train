// PORTRAITS: every 2D picture of a person in the game (ID photos, mugshot
// monitors, dossiers, polaroids, family frames, the wall of shame) is a render
// of the 3D HumanRig with its own paint pipeline, never a drawing. One small
// offscreen WebGL renderer builds the rig (any appearance, any uniform),
// lights it like a studio or an intake booth, frames the head / bust and reads
// the picture back; the result is box-filtered down to the surface's own pixel
// size and cached. The renderer is dropped again after a few idle seconds.
//
//   portraitCanvas({ seed: 7, w: 32, h: 40, outfit: 'jumpsuit', light: 'mugshot' })  -> canvas (or null: no WebGL)
//   portraitURL({ app, w: 48, h: 56 })                                               -> data URL ('' without WebGL)
//   drawPortrait(ctx, x, y, w, h, opts)      into any 2D canvas (pixel exact)
//   blitPortrait(pc, x, y, w, h, opts)       into a PixelCanvas (texture atlases), with a fallback fill
//   stockLook(seed)                          a seeded random person (the same seed is always the same face)
//
// Options: app | seed | who ('calder'), outfit (an Outfit or a uniform name), frame
// ('head' | 'bust' | 'chest'), light ('studio' | 'mugshot' | 'flash' | 'warm' | 'cold' | 'dim'),
// bg (a colour, or null for transparent), tone ('color' | 'grey' | 'sepia' | 'faded'),
// yaw (head turn), expr (painted expression), ink (a 1 px outline round a transparent cut-out).
import * as THREE from 'three';
import { HumanRig, randomAppearance, normalizeAppearance, type Appearance, type Outfit } from './humanRig';
import { randomLooks } from './humanLooks';
import { worldMaterial } from '../gfx/materials';
import { GLOWU } from '../gfx/postfx';
import { createResearcher } from './researcher';

export type Uniform = 'jumpsuit' | 'labcoat' | 'civilian' | 'staff' | 'scrubs' | 'guard' | 'bare';
export interface PortraitOpts {
  app?: Appearance;
  seed?: number;
  /** a special rig: Dr. Calder */
  who?: 'calder';
  outfit?: Outfit | Uniform;
  w?: number; h?: number;
  frame?: 'head' | 'bust' | 'chest';
  light?: 'studio' | 'mugshot' | 'flash' | 'warm' | 'cold' | 'dim';
  /** background colour; null = transparent (default 0x5a5e5a) */
  bg?: number | null;
  tone?: 'color' | 'grey' | 'sepia' | 'faded';
  /** head turn, radians (+ = toward the picture's left) */
  yaw?: number;
  expr?: string;
  /** a 1 px ink line round a transparent cut-out */
  ink?: boolean;
  /** cache key when app objects are not stable */
  key?: string;
}

// ------------------------------------------------------------------ people
function mulberry(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/** background people come from a cast of twelve (each render is a whole rig; the cast keeps them few); 4471 and up are kept as they are */
const castSeed = (seed: number) => (seed >= 4000 ? seed : seed % 12);
/** a seeded random person: the same seed is always the same face */
export function stockLook(seed: number): Appearance {
  const r = mulberry(seed * 7919 + 13);
  const fem = r() < 0.5;
  return normalizeAppearance({ ...randomAppearance(r), ...randomLooks(r, fem) } as Appearance);
}
const JUMPSUIT = 0xeeb415;
function uniformOutfit(u: Uniform, seed: number): Outfit {
  const r = mulberry(seed + 101);
  switch (u) {
    case 'jumpsuit': return { torso: { tex: 'c_jumpsuit', color: JUMPSUIT, sleeve: 'long' } };
    case 'labcoat': return { torso: { tex: 'c_shirt', color: [0xdcd8cc, 0x8a9ab0, 0xb8a888][Math.floor(r() * 3)], sleeve: 'long' }, torsoOuter: { tex: 'c_labcoat', color: 0xf2f2ee, sleeve: 'long' } };
    case 'staff': return { torso: { tex: 'c_shirt', color: [0xe8e4da, 0xc8d4e0, 0xd8c8b8][Math.floor(r() * 3)], sleeve: 'long' }, torsoOuter: { tex: 'c_coat', color: [0x2a3040, 0x3a3a3a, 0x4a3a2a][Math.floor(r() * 3)], sleeve: 'long' } };
    case 'scrubs': return { torso: { tex: 'c_shirt', color: 0x5a8a8a, sleeve: 'short' } };
    case 'guard': return { torso: { tex: 'c_shirt', color: 0x3a4a5a, sleeve: 'long' }, head: { tex: 'c_cap', color: 0x2a3440, hat: 'cap' } };
    case 'bare': return {};
    default: return { torso: { tex: [ 'c_shirt', 'c_sweater', 'c_hoodie'][Math.floor(r() * 3)], color: [0xe8e6de, 0x8a3a3a, 0x5a6a7a, 0x3a5a3a, 0x2a3a5a, 0xc8a060][Math.floor(r() * 6)], sleeve: 'long' } };
  }
}

// ------------------------------------------------------------------ the renderer
let R: THREE.WebGLRenderer | null = null;
let failed = false;
let idle: ReturnType<typeof setTimeout> | 0 = 0;
function renderer(): THREE.WebGLRenderer | null {
  if (R) return R;
  if (typeof document === 'undefined') failed = true;
  if (failed) return null;
  try {
    const cv = document.createElement('canvas');
    R = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
    R.outputColorSpace = THREE.SRGBColorSpace;
    R.toneMapping = THREE.ACESFilmicToneMapping;
    R.toneMappingExposure = 1.05;
    R.setPixelRatio(1);
  } catch (e) { console.warn('portrait renderer', e); failed = true; R = null; }
  return R;
}
/** drop the context a few seconds after the last portrait (browsers cap live WebGL contexts) */
function scheduleRelease() {
  if (idle) clearTimeout(idle);
  idle = setTimeout(() => { idle = 0; if (!R) return; try { R.dispose(); R.forceContextLoss(); } catch { /* gone */ } R = null; }, 6000);
}

const LIGHTS: Record<NonNullable<PortraitOpts['light']>, { hemi: [number, number, number]; key: [number, number, THREE.Vector3]; fill: [number, number, THREE.Vector3]; rim: [number, number, THREE.Vector3] }> = {
  studio: { hemi: [0xe8eef8, 0x4a4038, 1.05], key: [0xfff2e0, 2.3, new THREE.Vector3(-1.2, 1.5, 2.2)], fill: [0xc8d8ff, 0.8, new THREE.Vector3(1.6, 0.4, 1.8)], rim: [0xffffff, 1.4, new THREE.Vector3(0.6, 1.6, -2.2)] },
  mugshot: { hemi: [0xf0f4f8, 0x5a5a5a, 1.15], key: [0xffffff, 2.4, new THREE.Vector3(0.0, 0.9, 2.6)], fill: [0xdde8ff, 0.6, new THREE.Vector3(1.4, 0.2, 1.4)], rim: [0xe8f0ff, 0.6, new THREE.Vector3(0, 1.4, -2)] },
  flash: { hemi: [0xffffff, 0x404040, 0.85], key: [0xffffff, 3.0, new THREE.Vector3(0.15, 0.3, 3.0)], fill: [0xffffff, 0.2, new THREE.Vector3(-1, 0, 1)], rim: [0xffffff, 0.2, new THREE.Vector3(0, 1, -2)] },
  warm: { hemi: [0xffe8c8, 0x4a3020, 1.0], key: [0xffd8a0, 2.2, new THREE.Vector3(-1.4, 1.2, 2.0)], fill: [0xffc890, 0.5, new THREE.Vector3(1.6, 0.4, 1.6)], rim: [0xfff0d0, 1.0, new THREE.Vector3(1, 1.4, -2)] },
  cold: { hemi: [0xc8dcf0, 0x2a3440, 1.0], key: [0xdcecff, 2.2, new THREE.Vector3(1.2, 1.4, 2.0)], fill: [0x8aa8d0, 0.5, new THREE.Vector3(-1.6, 0.2, 1.6)], rim: [0xe0f0ff, 1.2, new THREE.Vector3(-0.6, 1.6, -2.2)] },
  dim: { hemi: [0xa8b0b8, 0x282420, 0.7], key: [0xe8e0d0, 1.5, new THREE.Vector3(-1.0, 1.6, 1.8)], fill: [0x8090a0, 0.3, new THREE.Vector3(1.6, 0.2, 1.6)], rim: [0xffffff, 0.5, new THREE.Vector3(0.6, 1.6, -2.2)] },
};

/** what makes a different render (person, clothes, light, framing); size, tone and ground are 2D work on top */
function baseKey(o: PortraitOpts): string {
  const a = o.key ?? (o.who ?? (o.app ? JSON.stringify(o.app) : 's' + castSeed(o.seed ?? 0)));
  const out = typeof o.outfit === 'object' ? JSON.stringify(o.outfit) : (o.outfit ?? '');
  return [a, out, o.frame ?? 'bust', o.light ?? 'studio', (o.yaw ?? 0).toFixed(2), o.expr ?? ''].join('|');
}
function keyOf(o: PortraitOpts, w: number, h: number): string {
  return [baseKey(o), w, h, o.bg === null ? 'none' : (o.bg ?? -1), o.tone ?? 'color', o.ink ? 1 : 0].join('|');
}
/** the renders: BASE x BASE, transparent ground (null = this machine cannot render) */
const BASE = 128;
const bases = new Map<string, HTMLCanvasElement | null>();
/** the derived pictures, per size / tone / ground */
const cache = new Map<string, HTMLCanvasElement | null>();

/** build the rig the options name */
function makeRig(o: PortraitOpts, hd: boolean): HumanRig {
  // Dr. Calder: her own rig (make-up, glasses, the coat, the badge)
  if (o.who === 'calder') return createResearcher({ glasses: true, name: 'Dr. Iris Calder' });
  const seed = castSeed(o.seed ?? 0);
  const app = o.app ? normalizeAppearance(o.app) : stockLook(seed);
  const rig = new HumanRig(app, worldMaterial({ noVis: true, noFog: true, noGrid: true }), { secondary: true, hd });
  const outfit = typeof o.outfit === 'object' ? o.outfit : uniformOutfit(o.outfit ?? 'civilian', seed);
  rig.setOutfit(outfit);
  return rig;
}

/** the 3D render: the rig lit and framed, supersampled 2x, box-filtered to BASE x BASE (alpha kept) */
function renderBase(o: PortraitOpts): HTMLCanvasElement | null {
  const r = renderer();
  if (!r) return null;
  const ss = 2, W = BASE * ss, H = BASE * ss;
  const scene = new THREE.Scene();
  const L = LIGHTS[o.light ?? 'studio'];
  scene.add(new THREE.HemisphereLight(L.hemi[0], L.hemi[1], L.hemi[2]));
  const lights: [number, number, THREE.Vector3][] = [L.key, L.fill, L.rim];
  for (const [c, i, p] of lights) { const d = new THREE.DirectionalLight(c, i); d.position.copy(p); scene.add(d); }
  let rig: HumanRig | null = null;
  const glowN = GLOWU.uGlowN.value;
  try {
    rig = makeRig(o, false);
    scene.add(rig.root);
    if (o.expr) rig.setExpression(o.expr, 99);
    for (let i = 0; i < 3; i++) rig.update(1 / 30);
    if (o.yaw) rig.root.rotation.y = o.yaw;
    rig.root.updateMatrixWorld(true);
    const head = rig.jointWorld('head'), chest = rig.jointWorld('chest');
    const s = Math.max(0.2, head.y - chest.y);
    const fr = o.frame ?? 'bust';
    // the picture's vertical span (m): the head bone sits at the jaw, the hair's crown ~0.8 s above it
    const top = head.y + s * 0.86, bot = head.y - (fr === 'head' ? s * 0.42 : fr === 'chest' ? s * 1.65 : s * 1.0);
    const span = top - bot, midY = (top + bot) / 2;
    const cam = new THREE.PerspectiveCamera(18, 1, 0.05, 20);
    const dist = (span / 2) / Math.tan(THREE.MathUtils.degToRad(9));
    cam.position.set(head.x, midY + s * 0.04, head.z + dist);
    cam.lookAt(head.x, midY, head.z);
    GLOWU.uGlowN.value = 0;
    r.setSize(W, H, false);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, true);
    r.render(scene, cam);
  } catch (e) {
    console.warn('portrait', e);
    return null;
  } finally {
    GLOWU.uGlowN.value = glowN;
    if (rig) { scene.remove(rig.root); try { rig.dispose(); } catch { /* ok */ } }
    scheduleRelease();
  }
  const big = document.createElement('canvas'); big.width = W; big.height = H;
  const bc = big.getContext('2d', { willReadFrequently: true })!;
  bc.drawImage(r.domElement, 0, 0);
  return boxDown(bc.getImageData(0, 0, W, H).data, W, H, 0, 0, W, H, BASE, BASE);
}
/** alpha-weighted box filter of a crop of src into a w x h canvas */
function boxDown(src: Uint8ClampedArray, SW: number, _SH: number, cx: number, cy: number, cw: number, ch: number, w: number, h: number): HTMLCanvasElement {
  const out = document.createElement('canvas'); out.width = w; out.height = h;
  const oc = out.getContext('2d', { willReadFrequently: true })!;
  const img = oc.createImageData(w, h), d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const x0 = cx + (x / w) * cw, x1 = cx + ((x + 1) / w) * cw, y0 = cy + (y / h) * ch, y1 = cy + ((y + 1) / h) * ch;
    let rr = 0, gg = 0, bb = 0, aa = 0, n = 0;
    for (let j = Math.floor(y0); j < Math.max(Math.floor(y0) + 1, Math.ceil(y1)); j++) for (let i = Math.floor(x0); i < Math.max(Math.floor(x0) + 1, Math.ceil(x1)); i++) {
      const k = (j * SW + i) * 4, a = src[k + 3];
      rr += src[k] * a; gg += src[k + 1] * a; bb += src[k + 2] * a; aa += a; n++;
    }
    const k = (y * w + x) * 4;
    if (aa > 0) { d[k] = rr / aa; d[k + 1] = gg / aa; d[k + 2] = bb / aa; }
    d[k + 3] = n ? aa / n : 0;
  }
  oc.putImageData(img, 0, 0);
  return out;
}
/** the picture at w x h from its render: cropped to the aspect (the head kept in), tone, ground, ink */
function derive(base: HTMLCanvasElement, o: PortraitOpts, w: number, h: number): HTMLCanvasElement {
  const src = base.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, BASE, BASE).data;
  const a = w / h;
  const cw = a <= 1 ? BASE * a : BASE, ch = a <= 1 ? BASE : BASE / a;
  const out = boxDown(src, BASE, BASE, (BASE - cw) / 2, a <= 1 ? 0 : (BASE - ch) * 0.3, cw, ch, w, h);
  const oc = out.getContext('2d', { willReadFrequently: true })!;
  const img = oc.getImageData(0, 0, w, h), d = img.data;
  const tone = o.tone ?? 'color', bg = o.bg === undefined ? 0x5a5e5a : o.bg;
  const br = bg === null ? 0 : (bg >> 16) & 255, bgc = bg === null ? 0 : (bg >> 8) & 255, bb = bg === null ? 0 : bg & 255;
  for (let k = 0; k < d.length; k += 4) {
    let R0 = d[k], G0 = d[k + 1], B0 = d[k + 2];
    const A = d[k + 3] / 255;
    if (bg !== null) { R0 = R0 * A + br * (1 - A); G0 = G0 * A + bgc * (1 - A); B0 = B0 * A + bb * (1 - A); }
    if (tone !== 'color') {
      const lum = R0 * 0.3 + G0 * 0.59 + B0 * 0.11;
      if (tone === 'grey') { R0 = G0 = B0 = lum; }
      else if (tone === 'sepia') { R0 = Math.min(255, lum * 1.08 + 18); G0 = lum * 0.92 + 8; B0 = lum * 0.72; }
      else { R0 = R0 * 0.55 + lum * 0.45 + 22; G0 = G0 * 0.55 + lum * 0.45 + 14; B0 = B0 * 0.5 + lum * 0.4 + 4; }
    }
    d[k] = R0; d[k + 1] = G0; d[k + 2] = B0;
    d[k + 3] = bg !== null ? 255 : (A > 0.45 ? 255 : 0);
  }
  if (o.ink && bg === null) {
    const on = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 0;
    const edge: number[] = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!on(x, y) && (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1))) edge.push((y * w + x) * 4);
    for (const k of edge) { d[k] = 12; d[k + 1] = 10; d[k + 2] = 9; d[k + 3] = 255; }
  }
  oc.putImageData(img, 0, 0);
  return out;
}
function baseOf(o: PortraitOpts): HTMLCanvasElement | null {
  const bk = baseKey(o);
  if (bases.has(bk)) return bases.get(bk)!;
  const b = renderBase(o);
  if (b || failed) bases.set(bk, b);
  return b;
}

// ------------------------------------------------------------------ later: renders queued off the frame
const queue = new Map<string, { o: PortraitOpts; cbs: (() => void)[] }>();
let pumping = false;
function pump() {
  if (pumping) return;
  pumping = true;
  const step = () => {
    const first = queue.entries().next();
    if (first.done) { pumping = false; return; }
    const [bk, job] = first.value;
    queue.delete(bk);
    if (!bases.has(bk)) { const b = renderBase(job.o); bases.set(bk, b); }
    for (const cb of job.cbs) { try { cb(); } catch (e) { console.warn('portrait ready', e); } }
    const ric = (globalThis as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    if (ric) ric(step, { timeout: 400 }); else setTimeout(step, 40);
  };
  // (a breath first: whatever queued them is usually still building its scene)
  setTimeout(step, 1200);
}
/** is the render for these options already made (drawing is then instant) */
export function portraitReady(o: PortraitOpts): boolean { return bases.has(baseKey(o)); }
/** have the render made off the frame; cb runs once it exists (at once if it does) */
export function portraitLater(o: PortraitOpts, cb: () => void) {
  if (portraitReady(o) || failed) { cb(); return; }
  const bk = baseKey(o);
  const j = queue.get(bk);
  if (j) j.cbs.push(cb); else queue.set(bk, { o, cbs: [cb] });
  pump();
}

/** the portrait as a canvas of exactly w x h pixels (cached); null where WebGL is unavailable */
export function portraitCanvas(o: PortraitOpts = {}): HTMLCanvasElement | null {
  const w = Math.max(2, Math.round(o.w ?? 48)), h = Math.max(2, Math.round(o.h ?? 56));
  const k = keyOf(o, w, h);
  if (cache.has(k)) return cache.get(k)!;
  const b = baseOf(o);
  const c = b ? derive(b, o, w, h) : null;
  if (c || failed) cache.set(k, c);
  if (cache.size > 600) { const first = cache.keys().next().value; if (first !== undefined) cache.delete(first); }
  return c;
}
/** a data URL of the portrait ('' without WebGL) */
const urls = new Map<string, string>();
export function portraitURL(o: PortraitOpts = {}): string {
  const w = Math.max(2, Math.round(o.w ?? 48)), h = Math.max(2, Math.round(o.h ?? 56));
  const k = keyOf(o, w, h);
  const hit = urls.get(k); if (hit !== undefined) return hit;
  const c = portraitCanvas(o);
  const u = c ? c.toDataURL() : '';
  urls.set(k, u);
  return u;
}
/**
 * draw the portrait into a 2D canvas, pixel for pixel. With `later`, a render that is not made yet is
 * queued instead (nothing is drawn now) and later() runs when it is ready, to repaint. false: nothing drawn.
 */
export function drawPortrait(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, o: PortraitOpts = {}, later?: () => void): boolean {
  w = Math.round(w); h = Math.round(h);
  if (later && !portraitReady(o)) { portraitLater(o, later); return false; }
  const c = portraitCanvas({ ...o, w, h });
  if (!c) return false;
  const sm = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(c, Math.round(x), Math.round(y));
  ctx.imageSmoothingEnabled = sm;
  return true;
}
/** anything with a w x h RGBA pixel store (the texture atlases' PixelCanvas) */
export interface PixelTarget { w: number; h: number; data: Uint8ClampedArray }
/**
 * copy the portrait into a pixel canvas. Until its render exists the box gets a plain photo-grey fill
 * (never a drawn face); with `later` the render is queued and later() repaints, without it it is made now.
 */
export function blitPortrait(pc: PixelTarget, x: number, y: number, w: number, h: number, o: PortraitOpts = {}, fallback = 0x4a4c48, later?: () => void): boolean {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  const put = (px: number, py: number, r: number, g: number, b: number) => {
    if (px < 0 || py < 0 || px >= pc.w || py >= pc.h) return;
    const k = (py * pc.w + px) * 4; pc.data[k] = r; pc.data[k + 1] = g; pc.data[k + 2] = b; pc.data[k + 3] = 255;
  };
  const wait = !!later && !portraitReady(o);
  if (wait) portraitLater(o, later!);
  const c = !wait && w > 1 && h > 1 ? portraitCanvas({ ...o, w, h }) : null;
  if (!c) {
    if (o.bg !== null) for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(x + i, y + j, (fallback >> 16) & 255, (fallback >> 8) & 255, fallback & 255);
    return false;
  }
  const d = c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, w, h).data;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = (j * w + i) * 4;
    if (d[k + 3] < 128) continue;
    put(x + i, y + j, d[k], d[k + 1], d[k + 2]);
  }
  return true;
}
/** a repaint for an atlas texture once its portraits are made (several portraits on one texture repaint it once) */
const atlasDue = new Set<string>();
let atlasT: ReturnType<typeof setTimeout> | 0 = 0;
export function atlasRepaint(name: string): () => void {
  return () => {
    atlasDue.add(name);
    if (atlasT) return;
    atlasT = setTimeout(() => {
      atlasT = 0;
      const names = [...atlasDue]; atlasDue.clear();
      void import('../gfx/atlas').then(({ atlas }) => { for (const n of names) try { atlas().repaint(n); } catch (e) { console.warn('portrait repaint', e); } });
    }, 120);
  };
}
/** dev: how many renders are made */
export function portraitCacheSize() { return bases.size; }
