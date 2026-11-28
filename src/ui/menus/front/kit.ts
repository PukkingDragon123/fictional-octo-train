// The front end's shared pieces (round 26): the title's hall, Dr. Calder's office and the facility map.
//   rainGlass(w, h, o)        a window pane at night: a soft skyline in the rain beyond, beads and running drops
//                             on the glass (each bead flips the view behind it), condensation low on the pane;
//                             u.uT (time), u.uFlash (lightning, 0..1)
//   beam(rect, dir, len)      a shaft of light swept from a window opening along dir (additive haze, fading out)
//   ease / easeIO / damp      slow cinematic easing
import * as THREE from 'three';

export const ease = (k: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, k)), 3);
/** smootherstep: slow in, slow out (camera moves) */
export const easeIO = (k: number) => { const x = Math.min(1, Math.max(0, k)); return x * x * x * (x * (x * 6 - 15) + 10); };
export const damp = (a: number, b: number, k: number, dt: number) => b + (a - b) * Math.exp(-k * dt);

const GLASS_VS = `varying vec2 vUv; varying vec3 vW;
void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
// (original shader: hashed cells for the beads, one running drop per column with its trail, a procedural skyline)
const GLASS_FS = `uniform float uT; uniform float uFlash; uniform vec2 uSize; uniform float uSeed; uniform float uBright; uniform vec3 uSky; uniform vec3 uFog;
varying vec2 vUv; varying vec3 vW;
float h1(float x){ return fract(sin(x * 91.3458 + uSeed) * 47453.5453); }
float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)) + uSeed) * 43758.5453); }
// the night beyond the glass, out of focus: sky, a far block of the institute with a few lit windows, a beacon
vec3 beyond(vec2 p){
  float y = p.y / uSize.y;
  vec3 c = mix(uFog, uSky, smoothstep(0.15, 0.95, y));
  float colW = 0.55;
  float ci = floor((p.x + uSeed * 3.0) / colW);
  float hgt = 0.22 + 0.32 * h1(ci) + 0.1 * step(0.8, h1(ci + 7.0));
  float edge = smoothstep(hgt + 0.03, hgt - 0.03, y);
  vec3 blockC = mix(uFog * 0.55, uSky * 0.45, 0.4);
  c = mix(c, blockC, edge * 0.85);
  // lit windows: soft warm squares on the blocks
  vec2 wc = vec2(p.x * 7.0, p.y * 9.0);
  vec2 wi = floor(wc); vec2 wf = fract(wc) - 0.5;
  float lit = step(0.86, h2(wi)) * edge * step(y, hgt - 0.05);
  float win = smoothstep(0.42, 0.18, max(abs(wf.x), abs(wf.y)));
  c += vec3(1.0, 0.78, 0.45) * lit * win * 0.55;
  // a red beacon on the tallest roof, slow
  float bx = fract((p.x + uSeed) / 3.7) - 0.5;
  float bd = length(vec2(bx * 3.7, y - 0.62));
  c += vec3(1.0, 0.15, 0.08) * smoothstep(0.09, 0.0, bd) * (0.5 + 0.5 * sin(uT * 2.2 + uSeed)) * 0.8;
  c += vec3(0.75, 0.82, 1.0) * uFlash * (0.6 + 0.4 * y);
  return c;
}
void main(){
  vec2 p = vUv * uSize; // metres on the pane
  vec3 col = beyond(p);
  vec2 off = vec2(0.0); float hi = 0.0; float wet = 0.0;
  // beads: one per small cell, some present
  vec2 g = p * 26.0; vec2 id = floor(g); vec2 f = fract(g) - 0.5;
  float pr = h2(id + 3.1);
  vec2 c0 = (vec2(h2(id + 1.7), h2(id + 9.2)) - 0.5) * 0.6;
  float r = 0.12 + 0.22 * h2(id + 5.5);
  float d = length(f - c0);
  float bead = step(0.55, pr) * smoothstep(r, r * 0.7, d);
  off += (f - c0) * bead * -0.12; hi += bead * smoothstep(r * 0.9, 0.0, length(f - c0 + vec2(r * 0.35, -r * 0.35))) ;
  wet += bead;
  // running drops: a column each, sliding down in stutters, a trail of film above them
  float cw = 1.0 / 9.0;
  float cx = floor(p.x / cw);
  float sp = 0.18 + 0.35 * h1(cx * 3.3);
  float tt = uT * sp + h1(cx);
  float yy = (1.0 - fract(tt)) * (uSize.y + 0.4) - 0.2 - 0.04 * sin(tt * 19.0) * step(0.5, h1(cx + 2.0));
  float lx = (fract(p.x / cw) - 0.5 - (h1(cx + 4.0) - 0.5) * 0.5) * cw;
  float dy = p.y - yy;
  float rr = 0.012 + 0.01 * h1(cx + 8.0);
  float drop = smoothstep(rr, rr * 0.6, length(vec2(lx, dy * 0.75))) * step(0.35, h1(cx + 11.0));
  float trail = smoothstep(rr * 0.45, 0.0, abs(lx)) * step(0.0, dy) * exp(-dy * 2.5) * step(0.35, h1(cx + 11.0));
  off += vec2(lx, dy) * drop * -2.5; hi += drop * smoothstep(rr * 0.8, 0.0, length(vec2(lx + rr * 0.35, dy - rr * 0.4)));
  wet += drop + trail;
  if (bead + drop > 0.01) col = mix(col, beyond(p + off * 6.0) * 1.25, clamp(bead + drop, 0.0, 1.0));
  // condensation: low on the pane a grey bloom, cleared where the drops ran
  float fogK = smoothstep(0.55, 0.0, p.y / uSize.y) * (1.0 - clamp(wet * 1.6, 0.0, 1.0));
  col = mix(col, uFog * 1.35 + 0.04, fogK * 0.55);
  col += vec3(0.9, 0.95, 1.0) * hi * 0.35;
  gl_FragColor = vec4(col * uBright, 1.0);
}`;

export interface RainGlass { mesh: THREE.Mesh; u: { uT: { value: number }; uFlash: { value: number }; uBright: { value: number } } }
/** a rain-streaked pane (w x h metres) facing +Z */
export function rainGlass(w: number, h: number, o: { seed?: number; sky?: number; fog?: number; bright?: number } = {}): RainGlass {
  const u = {
    uT: { value: 0 }, uFlash: { value: 0 }, uSize: { value: new THREE.Vector2(w, h) }, uSeed: { value: o.seed ?? 1.3 },
    uBright: { value: o.bright ?? 1 }, uSky: { value: new THREE.Color(o.sky ?? 0x1a2638) }, uFog: { value: new THREE.Color(o.fog ?? 0x55667e) },
  };
  const mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: GLASS_VS, fragmentShader: GLASS_FS, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.userData.noGlow = true;
  return { mesh, u };
}

/** a shaft of light: the window opening (four corners, in order round it) swept along dir for len metres */
export function beam(rect: THREE.Vector3[], dir: THREE.Vector3, len: number, color = 0xa8c0ff): { mesh: THREE.Mesh; u: { uInt: { value: number }; uColor: { value: THREE.Color } } } {
  const D = dir.clone().normalize().multiplyScalar(len);
  const pos: number[] = [], fade: number[] = [];
  for (let i = 0; i < 4; i++) {
    const a = rect[i], b = rect[(i + 1) % 4], c = b.clone().add(D), d = a.clone().add(D);
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
    fade.push(0, 0, 1, 0, 1, 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aFade', new THREE.Float32BufferAttribute(fade, 1));
  const u = { uInt: { value: 0.05 }, uColor: { value: new THREE.Color(color) } };
  const mat = new THREE.ShaderMaterial({
    uniforms: u,
    vertexShader: 'attribute float aFade; varying float vF; varying vec3 vV; void main(){ vF = aFade; vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = mv.xyz; gl_Position = projectionMatrix * mv; }',
    fragmentShader: `uniform float uInt; uniform vec3 uColor; varying float vF; varying vec3 vV;
      void main(){ vec3 n = normalize(cross(dFdx(vV), dFdy(vV))); float f = pow(abs(dot(n, normalize(-vV))), 1.6);
        float a = uInt * f * smoothstep(0.0, 0.08, vF) * pow(1.0 - vF, 1.4); gl_FragColor = vec4(uColor * a, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 2; mesh.userData.noGlow = true;
  return { mesh, u };
}

/** the Institute's crest as a texture (the pixel emblem, crisp) */
export async function crestTexture(N = 64): Promise<THREE.Texture> {
  const { emblemCanvas } = await import('../../brand/logo');
  const t = new THREE.CanvasTexture(emblemCanvas(N));
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
