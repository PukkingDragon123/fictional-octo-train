// Holographic text plates for the round-12 3D views (the quest broadcast,
// Inspect Yourself): a canvas drawn in "texel" units (one unit ~ one low-res
// pixel of the overlay, src/gfx/renderer.ts) at K x resolution with the game's
// face (--font-new, Alagard), shown on a plane in the first-person overlay scene
// with projected-light treatment: screen scanlines, 24 fps flicker, a scan-in
// wipe from the top with a bright leading edge, and a horizontal tear when the
// feed glitches. Plates can be lit glass (normal blending) or pure light (additive).
import * as THREE from 'three';
import { cssFont } from '../../gfx/crt';
import { fpCamera } from '../../fp/fp';
import { G } from '../../game/G';
import { shoot, disposeTree, mxOk } from '../machine/core';
import { panelSpec } from '../machine/kit';
import { housing } from '../machine/parts';

const K = 3;
let FACE = "'Alagard', monospace", faceAt = -1e9;
function face() { const n = performance.now(); if (n - faceAt > 3000) { faceAt = n; FACE = cssFont('--font-new', "'Alagard', monospace"); } return FACE; }

/** shared clock for every plate (seconds) */
export const PLATE_T = { value: 0 };

const VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FRAG = /* glsl */`
uniform sampler2D map; uniform float uShow, uT, uGlitch, uScan, uGain; uniform vec3 uEdge;
varying vec2 vUv;
void main() {
  vec2 uv = vUv;
  float fr = floor(uT * 24.0);
  float row = floor(uv.y * 90.0);
  float n = fract(sin(row * 12.9898 + fr * 78.233) * 43758.5453);
  uv.x += (n - 0.5) * 0.05 * uGlitch * step(0.82, n);
  vec4 c = texture2D(map, uv);
  float edge = (1.0 - vUv.y) - uShow * 1.12;
  if (edge > 0.0) discard;
  float scan = 1.0 - uScan + uScan * step(0.5, fract(gl_FragCoord.y * 0.5));
  float fl = 0.92 + 0.08 * fract(sin(fr * 91.7) * 43758.5);
  vec3 col = c.rgb * scan * fl * uGain;
  float lead = smoothstep(-0.05, 0.0, edge) * step(uShow, 0.999);
  col += uEdge * lead * 1.4;
  gl_FragColor = vec4(col, max(c.a, lead * 0.8) * min(1.0, uShow * 3.0));
  #include <colorspace_fragment>
}`;

export interface PlateOpts {
  additive?: boolean; scan?: number; edge?: number; gain?: number;
  /** round 16: hang the plate in a 3D machine housing (src/ui/machine) this many texels wide round the content; its nameplate */
  frame?: number; title?: string; seed?: number;
  /** a deeper hood on top (texels) for the nameplate and lamps */
  hood?: number;
  /** round 16: little 3D things painted on the housing at every clear (texel units over the whole plate) */
  deco?: (c: CanvasRenderingContext2D, W: number, H: number) => void;
}

export class Plate {
  readonly canvas = document.createElement('canvas');
  readonly ctx: CanvasRenderingContext2D;
  readonly tex: THREE.CanvasTexture;
  readonly mat: THREE.ShaderMaterial;
  readonly mesh: THREE.Mesh;
  private fg = document.createElement('canvas');
  private fx: CanvasRenderingContext2D;
  /** the housing's margin (texels) and its baked picture */
  readonly m: number;
  /** the hood's depth (texels; = m without one) */
  readonly mt: number;
  private bg: HTMLCanvasElement | null = null;

  constructor(readonly w: number, readonly h: number, private o: PlateOpts = {}) {
    this.m = o.frame && mxOk() ? o.frame : 0;
    this.mt = this.m ? Math.max(this.m, o.hood ?? 0) : 0;
    const m = this.m;
    this.canvas.width = this.fg.width = (w + m * 2) * K; this.canvas.height = this.fg.height = (h + m + this.mt) * K;
    this.ctx = this.canvas.getContext('2d')!;
    this.fx = this.fg.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.minFilter = THREE.LinearMipmapLinearFilter; this.tex.magFilter = THREE.LinearFilter;
    this.tex.anisotropy = 4;
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: this.tex }, uShow: { value: 1 }, uT: PLATE_T, uGlitch: { value: 0 }, uScan: { value: o.scan ?? 0.22 },
        uGain: { value: o.gain ?? 1 }, uEdge: { value: new THREE.Color(o.edge ?? 0x9fdcff) },
      },
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.mat);
    this.mesh.renderOrder = 30;
    this.mesh.frustumCulled = false;
  }
  set show(v: number) { this.mat.uniforms.uShow.value = v; }
  set glitch(v: number) { this.mat.uniforms.uGlitch.value = v; }
  /** world units per texel unit */
  scaleTo(t: number) { this.mesh.scale.set((this.w + this.m * 2) * t, (this.h + this.m + this.mt) * t, 1); }
  get framed() { return this.m > 0; }
  /** a hit's uv as content texels */
  uvToTexel(u: number, v: number): { x: number; y: number } { return { x: u * (this.w + this.m * 2) - this.m, y: (1 - v) * (this.h + this.m + this.mt) - this.mt }; }
  /** bake the 3D housing round the content (once) */
  private housingBg(): HTMLCanvasElement | null {
    if (this.bg || !this.m) return this.bg;
    const m = this.m, mt = this.mt, W = this.w + m * 2, H = this.h + m + mt;
    const spec = panelSpec(W, H, { title: this.o.title, seed: this.o.seed ?? 51, win: { l: m, t: mt, r: m, b: m, cut: 3, lip: Math.min(3, m * 0.4) }, glands: 0, vents: mt >= 18, hazard: H > 60, lamps: H > 40 ? ['green', 'amber'] : [], guards: H > 60 });
    if (spec.win) spec.win.back = true;
    spec.depth = Math.min(6, m * 0.6); spec.rivets = H > 40;
    const hs = housing(spec);
    const cv = document.createElement('canvas'); cv.width = W * K; cv.height = H * K;
    shoot(hs.root, W, H, 0, cv.getContext('2d')!, 0, 0, { k: K, shadow: [0, 0], edge: 0.8 });
    disposeTree(hs.root);
    this.bg = cv;
    return cv;
  }

  // ---- drawing (texel units; colours are CSS)
  clear() {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0); this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); this.fx.setTransform(1, 0, 0, 1, 0, 0); this.fx.clearRect(0, 0, this.fg.width, this.fg.height);
    const bg = this.housingBg();
    if (bg) this.ctx.drawImage(bg, 0, 0);
    if (bg && this.o.deco) { this.ctx.setTransform(K, 0, 0, K, 0, 0); try { this.o.deco(this.ctx, this.w + this.m * 2, this.h + this.m + this.mt); } catch { /* decor is optional */ } }
    const o = this.m * K, ot = this.mt * K;
    this.ctx.setTransform(K, 0, 0, K, o, ot); this.fx.setTransform(K, 0, 0, K, o, ot);
  }
  rect(x: number, y: number, w: number, h: number, col: string) { this.ctx.fillStyle = col; this.ctx.fillRect(x, y, w, h); }
  grad(x: number, y: number, w: number, h: number, a: string, b: string, vertical = true) {
    const g = vertical ? this.ctx.createLinearGradient(0, y, 0, y + h) : this.ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, a); g.addColorStop(1, b); this.ctx.fillStyle = g; this.ctx.fillRect(x, y, w, h);
  }
  frame(x: number, y: number, w: number, h: number, col: string, lw = 1) { this.ctx.strokeStyle = col; this.ctx.lineWidth = lw; this.ctx.strokeRect(x + lw / 2, y + lw / 2, w - lw, h - lw); }
  /** corner brackets */
  corners(x: number, y: number, w: number, h: number, col: string, l = 6) {
    const c = this.ctx; c.fillStyle = col;
    // machine corners in light (round 15b, the UI kit): the bracket, a 45-degree cut across it, a rivet inside
    for (const [px, py, sx, sy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]] as const) {
      c.fillRect(sx > 0 ? px : px - l, sy > 0 ? py : py - 1, l, 1); c.fillRect(sx > 0 ? px : px - 1, sy > 0 ? py : py - l, 1, l);
      const k = Math.max(2, Math.floor(l / 2));
      for (let i = 0; i < k; i++) c.fillRect(px + sx * (k - 1 - i) - (sx < 0 ? 1 : 0), py + sy * (i + 1) - (sy < 0 ? 1 : 0), 1, 1);
      c.fillRect(px + sx * (k + 1) - (sx < 0 ? 2 : 0), py + sy * (k + 1) - (sy < 0 ? 2 : 0), 2, 2);
    }
  }
  /** one line of text; returns its width (texels). size in texel units */
  text(s: string, x: number, y: number, col: string, size = 8, align: CanvasTextAlign = 'left', shadow = 'rgba(0,8,16,0.85)') {
    const c = this.fx;
    c.font = `${size}px ${face()}`; c.textAlign = align; c.textBaseline = 'top';
    if (shadow) { c.fillStyle = shadow; c.fillText(s, x + size / 12 + 0.35, y + size / 12 + 0.35); }
    c.fillStyle = col; c.fillText(s, x, y);
    return c.measureText(s).width;
  }
  measure(s: string, size = 8) { this.fx.font = `${size}px ${face()}`; return this.fx.measureText(s).width; }
  /** word-wrapped paragraph; returns the number of lines drawn */
  para(s: string, x: number, y: number, w: number, col: string, size = 8, lineH = 10, max = 99) {
    const lines = this.wrap(s, w, size);
    const n = Math.min(lines.length, max);
    for (let i = 0; i < n; i++) this.text(i === max - 1 && lines.length > max ? lines[i].replace(/\s*\S*$/, '…') : lines[i], x, y + i * lineH, col, size);
    return n;
  }
  wrap(s: string, w: number, size = 8): string[] {
    const out: string[] = [];
    for (const par of String(s).split('\n')) {
      let cur = '';
      for (const word of par.split(/\s+/)) {
        if (!word) continue;
        const t = cur ? cur + ' ' + word : word;
        if (this.measure(t, size) > w && cur) { out.push(cur); cur = word; } else cur = t;
      }
      out.push(cur);
    }
    return out;
  }
  /** fit a single line into w texels with an ellipsis */
  fit(s: string, w: number, size = 8) {
    if (this.measure(s, size) <= w) return s;
    let t = s; while (t.length > 1 && this.measure(t + '…', size) > w) t = t.slice(0, -1);
    return t + '…';
  }
  commit() {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.drawImage(this.fg, 0, 0);
    this.ctx.setTransform(K, 0, 0, K, this.m * K, this.mt * K);
    this.tex.needsUpdate = true;
  }
}

/** world units per low-res overlay pixel at distance d in front of the overlay camera */
export function texelAt(d: number): number {
  const cam = fpCamera();
  const pr = G.pr as unknown as { lowH?: number; margin?: number };
  const rh = (pr.lowH ?? 270) + (pr.margin ?? 0) * 2;
  return (2 * Math.tan((cam.fov * Math.PI) / 360) * d) / Math.max(120, rh);
}

/**
 * Light in the overlay: the overlay is laid over the world as mix(world, rgb, a), so plain additive
 * blending would leave a dark silhouette (alpha 1, dim colour). This adds the colour as it is and keeps
 * the alpha as coverage: a single layer composites to mix(world, colour, opacity).
 */
export function lightBlend<T extends THREE.Material>(m: T, premultiplied = false): T {
  m.blending = THREE.CustomBlending; m.blendEquation = THREE.AddEquation;
  // shaders of these views write their light at full strength with coverage in alpha (premultiplied);
  // plain materials write a colour and an opacity, so the colour is scaled by it
  m.blendSrc = premultiplied ? THREE.OneFactor : THREE.SrcAlphaFactor; m.blendDst = THREE.OneFactor;
  m.blendSrcAlpha = THREE.OneFactor; m.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
  m.transparent = true; m.depthWrite = false;
  return m;
}

/** a soft dark backdrop that sits behind a whole view (radial vignette, faint cool tint) */
export function backdrop(col = '#06121c', inner = 'rgba(10,26,40,0.55)', mid = 'rgba(4,12,20,0.78)'): THREE.Mesh {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(32, 30, 4, 32, 32, 46);
  g.addColorStop(0, inner); g.addColorStop(0.6, mid); g.addColorStop(1, col);
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, opacity: 0 }));
  m.renderOrder = 1; m.frustumCulled = false;
  return m;
}
