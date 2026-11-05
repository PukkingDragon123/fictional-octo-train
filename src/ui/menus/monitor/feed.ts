// A security-monitor tube for the monitor bank: shows a room's live feed (a
// small render target, or a canvas copied from another renderer) as green
// phosphor in hard pixels: luminance through a filmic curve, an ordered
// dither down to a few phosphor levels, dark gaps between the feed's scan
// rows, a slow rolling hum bar, sync jitter, snow, a bulge and a vignette,
// with the camera's caption (Alagard, bitfont) burnt in on top. A hovered tube
// brightens; a switching tube tears into static. Any canvas can be shown too
// (aux monitors: graphs, text) with the same tube.
import * as THREE from 'three';
import { bitText, bitReady } from '../../../gfx/bitfont';

export interface FeedTube {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  /** the burnt-in caption canvas (redraw + flushOver()) */
  over: HTMLCanvasElement;
  overCtx: CanvasRenderingContext2D;
  flushOver(): void;
  setFeed(tex: THREE.Texture | null, linear: boolean): void;
  /** 0..1 */
  hover: number;
  /** 0..1 snow / tearing */
  snow: number;
  /** tube brightness (power) 0..1 */
  power: number;
  update(dt: number, t: number): void;
  /** average brightness of the picture (drives its spill light), smoothed */
  glow: number;
}

const VERT = /* glsl */`
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  vV = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const FRAG = /* glsl */`
uniform sampler2D tFeed; uniform sampler2D tOver;
uniform vec2 uRes; uniform float uTime, uHover, uSnow, uPower, uLinear, uGain, uHasFeed, uRoll, uColor;
uniform vec3 uTint;
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float bayer2(vec2 a) { a = floor(a); return fract(a.x / 2.0 + a.y * a.y * 0.75); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
void main() {
  vec2 uv = vUv * 2.0 - 1.0;
  uv += uv * dot(uv, uv) * 0.045;
  uv = uv * 0.5 + 0.5;
  vec2 e = abs(uv - 0.5) * 2.0;
  float inside = step(max(e.x, e.y), 1.0);
  float frame = floor(uTime * 12.0);
  vec2 cell = floor(uv * uRes);
  float row = cell.y;
  // sync jitter (more while switching), whole feed pixels
  float tear = (hash(vec2(row, frame)) - 0.5) * (0.002 + uSnow * 0.08) + step(0.985 - uSnow * 0.2, hash(vec2(floor(row / 6.0), frame))) * 0.012;
  vec2 p = (floor(vec2(uv.x + tear, uv.y) * uRes) + 0.5) / uRes;
  vec3 src = texture2D(tFeed, p).rgb * uHasFeed;
  if (uLinear < 0.5) src = pow(src, vec3(2.2));
  float l = dot(src, vec3(0.3, 0.55, 0.15)) * uGain;
  l = 1.0 - exp(-l * 2.2);
  l = pow(l, 0.8);
  // a few phosphor levels, ordered dither in feed pixels
  float lv = 6.0;
  l = floor(l * lv + bayer4(cell)) / lv;
  // scan rows: every other feed row is darker
  l *= mod(row, 2.0) < 1.0 ? 1.0 : 0.72;
  // the hum bar rolling up the tube
  float roll = fract(uTime * 0.09 + uRoll);
  l *= 0.88 + 0.12 * smoothstep(0.0, 0.12, abs(uv.y - roll));
  // snow
  float sn = hash(cell + frame * 13.1);
  l = mix(l, sn * 0.9, clamp(uSnow, 0.0, 1.0));
  l += (sn - 0.5) * 0.06;
  vec3 col = mix(uTint * l, mix(vec3(l), src * 2.0, 0.5) * uTint * 0.6 + uTint * l * 0.4, uColor);
  // the caption burnt into the picture
  vec4 o = texture2D(tOver, vUv);
  col = mix(col, o.rgb * 1.6, o.a);
  col += uTint * 0.035;
  vec2 d = uv - 0.5;
  col *= 1.0 - dot(d, d) * 1.4;
  col *= (0.92 + uHover * 0.55) * uPower;
  col *= inside;
  // the glass: grazing sheen and a pane of the room reflected
  float fres = pow(1.0 - clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0), 3.0);
  float streak = smoothstep(0.07, 0.0, abs(vUv.x * 0.8 + vUv.y - 1.18)) * 0.05;
  col += vec3(0.5, 0.62, 0.55) * (fres * 0.12 + streak);
  gl_FragColor = vec4(col * 1.25, 1.0);
}`;

/** a tube of w x h metres (4:3 feeds), feed resolution fw x fh */
export function feedTube(w: number, h: number, fw = 160, fh = 120, tint = 0x9dff9a): FeedTube {
  const over = document.createElement('canvas');
  over.width = fw; over.height = fh;
  const overCtx = over.getContext('2d')!;
  const overTex = new THREE.CanvasTexture(over);
  overTex.magFilter = overTex.minFilter = THREE.NearestFilter; overTex.generateMipmaps = false;
  const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  blank.needsUpdate = true;
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG,
    uniforms: {
      tFeed: { value: blank }, tOver: { value: overTex },
      uRes: { value: new THREE.Vector2(fw, fh) }, uTime: { value: 0 }, uHover: { value: 0 }, uSnow: { value: 0 }, uPower: { value: 1 },
      uLinear: { value: 1 }, uGain: { value: 1 }, uHasFeed: { value: 0 }, uRoll: { value: Math.random() }, uColor: { value: 0.12 },
      uTint: { value: new THREE.Color(tint) },
    },
  });
  // a slightly bulged faceted pane
  const g = new THREE.PlaneGeometry(w, h, 6, 4);
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) { const x = pos.getX(i) / (w / 2), y = pos.getY(i) / (h / 2); pos.setZ(i, Math.min(w, h) * 0.05 * (1 - Math.min(1, (x * x + y * y) * 0.5))); }
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, mat);
  mesh.userData.noGlow = true;
  let glowAcc = 0.4;
  const tube: FeedTube = {
    mesh, mat, over, overCtx, hover: 0, snow: 0, power: 1, glow: 0.4,
    flushOver() { overTex.needsUpdate = true; },
    setFeed(tex, linear) { mat.uniforms.tFeed.value = tex ?? blank; mat.uniforms.uHasFeed.value = tex ? 1 : 0; mat.uniforms.uLinear.value = linear ? 1 : 0; },
    update(dt, t) {
      const u = mat.uniforms;
      u.uTime.value = t;
      u.uHover.value += (tube.hover - u.uHover.value) * Math.min(1, dt * 10);
      u.uSnow.value = tube.snow;
      u.uPower.value = tube.power;
      glowAcc += ((0.35 + tube.hover * 0.4 + tube.snow * 0.3) * tube.power - glowAcc) * Math.min(1, dt * 4);
      tube.glow = glowAcc * (0.94 + Math.random() * 0.06);
    },
  };
  return tube;
}

/** the caption for a feed: camera number and name top left, a blinking REC and the clock */
export function drawCaption(t: FeedTube, cam: string, name: string, blink: boolean) {
  const c = t.overCtx, W = t.over.width, H = t.over.height;
  c.clearRect(0, 0, W, H);
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0'), mm = String(now.getMinutes()).padStart(2, '0'), ss = String(now.getSeconds()).padStart(2, '0');
  bitText(c, cam, 6, 4, { color: '#d8ffd0', outline: '#020802' });
  bitText(c, name, 6, H - 19, { color: '#b8f0b0', outline: '#020802' });
  bitText(c, `${hh}:${mm}:${ss}`, W - 6, 4, { color: '#d8ffd0', outline: '#020802', align: 'right' });
  if (blink) { c.fillStyle = '#020802'; c.fillRect(W - 37, H - 17, 9, 9); c.fillStyle = '#ff5a3a'; c.fillRect(W - 36, H - 16, 7, 7); bitText(c, 'REC', W - 6, H - 19, { color: '#ffb0a0', outline: '#020802', align: 'right' }); }
  t.flushOver();
}
export { bitReady };
