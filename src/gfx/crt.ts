// A real-looking cathode-ray tube for every screen in the game: the watch, the
// menu's TV sets, surgery monitors, terminals. Draw into the screen's canvas,
// call flush(), and the tube does the rest: curved glass, beam scanlines, an
// aperture grille, phosphor bloom and convergence error, a slow rolling band,
// flicker, snow, vignette, power-on/off collapse and reflections on the glass.
// Works in the main (MRT) pass and in the first-person overlay.
import * as THREE from 'three';

export interface CrtOpts {
  /** glass bulge 0..0.35 */
  curvature?: number;
  /** scanline strength 0..1 */
  scan?: number;
  /** aperture grille strength 0..1 */
  mask?: number;
  /** phosphor bloom 0..2 */
  glow?: number;
  /** snow / jitter 0..0.2 */
  noise?: number;
  /** brightness flicker 0..1 */
  flicker?: number;
  vignette?: number;
  /** phosphor colour multiplier (0x8cffb0 green, 0xffc070 amber, 0xffffff white) */
  tint?: number;
  /** glass reflection 0..1 */
  reflect?: number;
}

const VERT = /* glsl */`
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  vV = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const FRAG = /* glsl */`
layout(location = 1) out highp vec4 gNormal;
uniform sampler2D uTex;
uniform vec2 uRes;
uniform float uTime, uCurv, uScan, uMask, uGlow, uNoise, uFlicker, uVig, uReflect, uOn, uRoll;
uniform vec3 uTint;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec2 bulge(vec2 uv) {
  uv = uv * 2.0 - 1.0;
  vec2 off = abs(uv.yx) * uCurv;
  uv += uv * off * off;
  return uv * 0.5 + 0.5;
}
void main() {
  vec2 uv = bulge(vUv);
  float on = clamp(uOn, 0.0, 1.0);
  // power: the picture collapses to a line, then a dot
  vec2 sz = vec2(mix(0.015, 1.0, smoothstep(0.0, 0.3, on)), mix(0.004, 1.0, smoothstep(0.25, 0.75, on)));
  vec2 p = (uv - 0.5) / sz + 0.5;
  bool inside = on > 0.001 && p.x > 0.0 && p.x < 1.0 && p.y > 0.0 && p.y < 1.0;
  vec3 col = vec3(0.018, 0.022, 0.02);
  if (inside) {
    float row = floor(p.y * uRes.y);
    float frame = floor(uTime * 24.0);
    // horizontal sync wobble and snow
    p.x += (hash(vec2(row, frame)) - 0.5) * uNoise * 0.006;
    p.x += sin(p.y * 40.0 + uTime * 3.0) * uNoise * 0.0015;
    float ca = 0.0008 + 0.004 * uCurv * length(p - 0.5);
    vec3 c;
    c.r = texture2D(uTex, p + vec2(ca, 0.0)).r;
    c.g = texture2D(uTex, p).g;
    c.b = texture2D(uTex, p - vec2(ca, 0.0)).b;
    vec2 px = 1.5 / uRes;
    vec3 b = texture2D(uTex, p + vec2(px.x, 0.0)).rgb + texture2D(uTex, p - vec2(px.x, 0.0)).rgb
           + texture2D(uTex, p + vec2(0.0, px.y)).rgb + texture2D(uTex, p - vec2(0.0, px.y)).rgb;
    c += b * 0.25 * uGlow;
    // beam profile: bright lines need less gap
    float lum = dot(c, vec3(0.3, 0.55, 0.15));
    float sl = 0.5 + 0.5 * cos(p.y * uRes.y * 6.2831853);
    c *= mix(1.0, mix(0.45, 0.85, clamp(lum, 0.0, 1.0)) + 0.55 * sl, uScan);
    float m = mod(floor(p.x * uRes.x * 3.0), 3.0);
    vec3 grille = m < 1.0 ? vec3(1.0, 0.72, 0.72) : m < 2.0 ? vec3(0.72, 1.0, 0.72) : vec3(0.72, 0.72, 1.0);
    c *= mix(vec3(1.0), grille, uMask);
    c *= uTint;
    float roll = fract(uTime * 0.06 + uRoll);
    c *= mix(0.9, 1.0, smoothstep(0.0, 0.07, abs(p.y - roll)));
    c *= 1.0 - uFlicker * 0.12 * hash(vec2(frame, 7.0));
    c += (hash(p * uRes + fract(uTime) * 91.7) - 0.5) * uNoise;
    vec2 d = p - 0.5;
    c *= 1.0 - uVig * dot(d, d) * 2.2;
    // switching on: an overbright flash
    c += vec3(0.8, 0.9, 1.0) * (1.0 - smoothstep(0.3, 0.9, on)) * 0.5;
    col = max(c, vec3(0.0));
  }
  // the glass: grazing-angle sheen and a soft window reflection
  float fres = pow(1.0 - clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0), 3.0);
  float streak = smoothstep(0.1, 0.0, abs(vUv.x + vUv.y - 1.35)) * 0.06 + smoothstep(0.3, 0.0, length(vUv - vec2(0.24, 0.78))) * 0.05;
  col += vec3(0.85, 0.9, 1.0) * (fres * 0.22 + streak) * uReflect;
  // the tube's edge falls off into the bezel
  vec2 e = abs(vUv - 0.5) * 2.0;
  col *= smoothstep(1.0, 0.94, max(e.x, e.y));
  gl_FragColor = vec4(col, 1.0);
  gNormal = vec4(normalize(vN) * 0.5 + 0.5, 0.5);
}`;

export type CrtMaterial = THREE.ShaderMaterial & { crt: { on: number; target: number } };

/** a tube material over any texture (canvas, render target...) */
export function crtMaterial(tex: THREE.Texture, o: CrtOpts = {}, res: [number, number] = [320, 240]): CrtMaterial {
  const m = new THREE.ShaderMaterial({
    // (no glslVersion: three then compiles ShaderMaterials as GLSL 3 and maps gl_FragColor to output 0)
    vertexShader: VERT,
    fragmentShader: FRAG,
    toneMapped: false,
    uniforms: {
      uTex: { value: tex },
      uRes: { value: new THREE.Vector2(res[0], res[1]) },
      uTime: { value: 0 },
      uCurv: { value: o.curvature ?? 0.22 },
      uScan: { value: o.scan ?? 0.6 },
      uMask: { value: o.mask ?? 0.35 },
      uGlow: { value: o.glow ?? 0.8 },
      uNoise: { value: o.noise ?? 0.035 },
      uFlicker: { value: o.flicker ?? 0.5 },
      uVig: { value: o.vignette ?? 0.9 },
      uReflect: { value: o.reflect ?? 0.7 },
      uOn: { value: 1 },
      uRoll: { value: Math.random() },
      uTint: { value: new THREE.Color(o.tint ?? 0xffffff) },
    },
  }) as CrtMaterial;
  m.crt = { on: 1, target: 1 };
  let last = performance.now();
  m.onBeforeRender = () => {
    const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    m.uniforms.uTime.value = now / 1000;
    // power eases toward its target (on: ~0.35 s, off: ~0.25 s)
    const c = m.crt;
    if (c.on !== c.target) c.on = c.target > c.on ? Math.min(c.target, c.on + dt / 0.35) : Math.max(c.target, c.on - dt / 0.25);
    m.uniforms.uOn.value = c.on;
  };
  return m;
}

export interface CrtScreen {
  mesh: THREE.Mesh;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  tex: THREE.CanvasTexture;
  mat: CrtMaterial;
  /** upload what you drew */
  flush(): void;
  /** switch the tube on or off (animated) */
  power(on: boolean, instant?: boolean): void;
}

/**
 * A ready screen: a slightly bulged pane of glass (w x h in metres) with its own
 * canvas. Draw with ctx (see phosphorText), then flush(). Put it in a bezel model.
 */
export function crtScreen(w: number, h: number, o: CrtOpts & { res?: [number, number]; bulge?: number } = {}): CrtScreen {
  const res = o.res ?? [320, 240];
  const canvas = document.createElement('canvas');
  canvas.width = res[0]; canvas.height = res[1];
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, res[0], res[1]);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  const geo = new THREE.PlaneGeometry(w, h, 12, 9);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const bulge = o.bulge ?? Math.min(w, h) * 0.06;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) / (w / 2), y = pos.getY(i) / (h / 2);
    pos.setZ(i, bulge * (1 - Math.min(1, (x * x + y * y) * 0.5)));
  }
  geo.computeVertexNormals();
  const mat = crtMaterial(tex, o, res);
  const mesh = new THREE.Mesh(geo, mat);
  return {
    mesh, canvas, ctx, tex, mat,
    flush() { tex.needsUpdate = true; },
    power(on, instant) { mat.crt.target = on ? 1 : 0; if (instant) mat.crt.on = mat.crt.target; },
  };
}

/** glowing phosphor text on a CRT canvas (the bloom comes from the tube) */
export function phosphorText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, o: { size?: number; color?: string; font?: string; align?: CanvasTextAlign; glow?: number } = {}) {
  ctx.save();
  ctx.font = `${o.size ?? 16}px ${o.font ?? cssFont('--font-crt', "'IBM Plex Mono', 'Courier Prime', monospace")}`;
  ctx.textAlign = o.align ?? 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = o.color ?? '#9dffb5';
  ctx.shadowColor = o.color ?? '#9dffb5';
  ctx.shadowBlur = o.glow ?? 6;
  ctx.fillText(text, x, y);
  ctx.shadowBlur = 0;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** canvas text must wait for the web fonts, or the first frames draw in a fallback face */
export function fontsReady(): Promise<unknown> {
  const f = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (!f) return Promise.resolve();
  return Promise.all(["16px 'IBM Plex Mono'", "16px 'Courier Prime'", "16px 'Special Elite'", "16px 'Nixie One'", "16px 'Oswald'", "16px 'Alfa Slab One'", "16px 'Caveat'"].map((s) => f.load(s).catch(() => null)));
}

/** the family list behind one of the type tokens in src/ui/fonts.css (so canvas text follows a font swap) */
export function cssFont(token: string, fallback = 'monospace'): string {
  try { const v = getComputedStyle(document.documentElement).getPropertyValue(token).trim(); return v || fallback; } catch { return fallback; }
}
