// Effects in pixel art (the art pass, wave 3). Nothing here is smooth: alphas
// come in four dithered steps on the low-res pixel grid, motion advances in
// frames (12 a second, like a sprite), and edges are hard.
//   PX_GLSL           helpers any effect shader can use: pxA() (dithered alpha
//                     steps on the art-pixel grid) and pxT() (time in frames)
//   pxShaderMat()     an additive / alpha effect material safe for the main
//                     two-target pass, with PX_GLSL in it
//   soundRings        a whistle, a shout, a ring of a bell: stepped pixel rings
//                     of sound spreading over the floor from where it was made
//   pixelNote()       a little pixel-art music note sprite (whistles)
import * as THREE from 'three';
import { G } from '../game/G';

/** dithered alpha steps (4x4 Bayer on the low-res grid) and frame-stepped time */
export const PX_GLSL = /* glsl */`
float pxBayer(vec2 p) {
  vec2 q = mod(floor(p), 4.0);
  float i = q.x + q.y * 4.0;
  // 4x4 ordered dither matrix, 0..15
  float b = 0.0;
  if (i < 0.5) b = 0.0; else if (i < 1.5) b = 8.0; else if (i < 2.5) b = 2.0; else if (i < 3.5) b = 10.0;
  else if (i < 4.5) b = 12.0; else if (i < 5.5) b = 4.0; else if (i < 6.5) b = 14.0; else if (i < 7.5) b = 6.0;
  else if (i < 8.5) b = 3.0; else if (i < 9.5) b = 11.0; else if (i < 10.5) b = 1.0; else if (i < 11.5) b = 9.0;
  else if (i < 12.5) b = 15.0; else if (i < 13.5) b = 7.0; else if (i < 14.5) b = 13.0; else b = 5.0;
  return (b + 0.5) / 16.0;
}
/** an alpha snapped to 0, 1/3, 2/3, 1, the steps between dithered on the pixel grid */
float pxA(float a) {
  a = clamp(a, 0.0, 1.0) * 3.0;
  return (floor(a) + step(pxBayer(gl_FragCoord.xy), fract(a))) / 3.0;
}
/** time advanced in whole frames (12 a second) */
float pxT(float t) { return floor(t * 12.0) / 12.0; }
`;

/** an effect material for the main pass (it draws to colour + the normal buffer; this leaves the normals alone) */
export function pxShaderMat(vert: string, frag: string, uniforms: Record<string, THREE.IUniform>, o: { additive?: boolean; side?: THREE.Side } = {}): THREE.ShaderMaterial {
  frag = 'layout(location = 1) out highp vec4 gNormal;\n' + PX_GLSL + frag.replace(/\}\s*$/, '  gNormal = vec4(0.0);\n}\n');
  return new THREE.ShaderMaterial({
    uniforms, vertexShader: vert, fragmentShader: frag,
    transparent: true, depthWrite: false, depthTest: true, side: o.side ?? THREE.DoubleSide,
    blending: o.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending, fog: false,
  });
}

// ---------------------------------------------------------------- rings of sound
const RING_VERT = 'varying vec2 vUv; void main(){ vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const RING_FRAG = /* glsl */`
uniform float uAge, uLife, uCount; uniform vec3 uCol;
varying vec2 vUv;
void main(){
  float t = pxT(uAge) / uLife;
  float r = length(vUv), ang = atan(vUv.y, vUv.x);
  float a = 0.0;
  // up to three rings leave one after the other; each a band two art pixels thick, broken into dashes
  for (int i = 0; i < 3; i++) {
    if (float(i) >= uCount) break;
    float k = clamp(t * 1.25 - float(i) * 0.22, 0.0, 1.0);
    if (k <= 0.0 || k >= 1.0) continue;
    float R = 0.12 + k * 0.86;
    float w = fwidth(r) * 1.2 + 0.007;
    float band = step(abs(r - R), w);
    float dash = step(0.35, fract(ang * (5.0 + float(i) * 2.0) / 6.28318 + k * 0.5 * (mod(float(i), 2.0) * 2.0 - 1.0)));
    a = max(a, band * dash * (1.0 - k * k) * 0.85);
  }
  a = pxA(a);
  if (a <= 0.0) discard;
  gl_FragColor = vec4(uCol * a, a);
}`;

interface Ring { m: THREE.Mesh; U: { uAge: THREE.IUniform<number>; uLife: THREE.IUniform<number>; uCount: THREE.IUniform<number>; uCol: THREE.IUniform<THREE.Color> }; t0: number; on: boolean }

class SoundRings {
  private pool: Ring[] = [];
  private geo: THREE.PlaneGeometry | null = null;

  /** a sound made at (x, y, z): `radius` metres across the floor; `count` rings; colour */
  emit(x: number, y: number, z: number, radius = 2.4, count = 2, color = 0xfff0b8, life = 0.9) {
    const scene = G.pr?.scene;
    if (!scene) return;
    let r = this.pool.find((q) => !q.on);
    if (!r) {
      if (this.pool.length >= 6) r = this.pool[0];
      else {
        this.geo ??= new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
        const U = { uAge: { value: 0 }, uLife: { value: 1 }, uCount: { value: 2 }, uCol: { value: new THREE.Color() } };
        const m = new THREE.Mesh(this.geo, pxShaderMat(RING_VERT, RING_FRAG, U));
        m.frustumCulled = false; m.renderOrder = 18;
        const ring: Ring = { m, U, t0: 0, on: false };
        // it runs itself: the age is read from the game clock when it is drawn
        m.onBeforeRender = () => {
          const age = (G.time ?? 0) - ring.t0;
          ring.U.uAge.value = age;
          if (age > ring.U.uLife.value) { ring.on = false; m.visible = false; }
        };
        this.pool.push(ring);
        r = ring;
      }
    }
    if (r.m.parent !== scene) scene.add(r.m);
    r.on = true; r.t0 = G.time ?? 0;
    r.U.uLife.value = life; r.U.uCount.value = count; r.U.uCol.value.setHex(color);
    r.m.position.set(x, y + 0.04, z);
    r.m.scale.setScalar(radius);
    r.m.visible = true;
  }
}
export const soundRings = new SoundRings();

// ---------------------------------------------------------------- pixel sprites
const NOTES: string[][] = [
  // a single quaver
  ['....##...', '....###..', '....#.##.', '....#..#.', '....#....', '....#....', '..###....', '.#####...', '.#####...', '..###....'],
  // two beamed quavers
  ['..#######', '..#######', '..#....#.', '..#....#.', '..#....#.', '###..###.', '###.####.', '###.####.', '.#...##..', '.........'],
];
const cache = new Map<string, HTMLCanvasElement>();
/** a pixel-art music note (ink outline, a lit edge), 11 x 12 art pixels, drawn once and reused as an image */
export function pixelNote(kind: number, col = 0xfff0c4): HTMLCanvasElement {
  const key = kind + ':' + col;
  const src = cache.get(key);
  const cv = document.createElement('canvas');
  cv.width = 11; cv.height = 12;
  const c = cv.getContext('2d')!;
  if (src) { c.drawImage(src, 0, 0); return cv; }
  const rows = NOTES[kind % NOTES.length];
  const on = (x: number, y: number) => y >= 0 && y < rows.length && x >= 0 && x < rows[y].length && rows[y][x] === '#';
  const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
  const lit = (n: number, k: number) => { const ch = (s: number) => Math.min(255, Math.round(((n >> s) & 255) + (255 - ((n >> s) & 255)) * k)); return (ch(16) << 16) | (ch(8) << 8) | ch(0); };
  const dim = (n: number, k: number) => { const ch = (s: number) => Math.round(((n >> s) & 255) * k); return (ch(16) << 16) | (ch(8) << 8) | ch(0); };
  // ink outline first (one pixel round the shape, offset into the 11 x 12 box)
  c.fillStyle = '#1a1208';
  for (let y = -1; y <= rows.length; y++) for (let x = -1; x <= 9; x++) {
    if (on(x, y)) continue;
    if (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1)) c.fillRect(x + 1, y + 1, 1, 1);
  }
  for (let y = 0; y < rows.length; y++) for (let x = 0; x < 9; x++) {
    if (!on(x, y)) continue;
    // lit from the top left, shaded bottom right
    const tone = !on(x - 1, y) || !on(x, y - 1) ? lit(col, 0.45) : !on(x + 1, y) || !on(x, y + 1) ? dim(col, 0.72) : col;
    c.fillStyle = hex(tone);
    c.fillRect(x + 1, y + 1, 1, 1);
  }
  cache.set(key, cv);
  const out = document.createElement('canvas'); out.width = 11; out.height = 12; out.getContext('2d')!.drawImage(cv, 0, 0);
  return out;
}
