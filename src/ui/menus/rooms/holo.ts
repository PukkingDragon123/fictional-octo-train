// The codex archive's projector (rooms/archive.ts): whatever a file holds,
// rebuilt as a hologram over the projection table.
//   holoModel(model)   a group: the species rig, the item, a diorama of the
//                      place, a medal, or static for a file nobody has found
// The light is one shader for every surface: the model's own painted texels
// (the world atlas) read as phosphor luminance in the file's tint, a bright
// rim, a lambert hint, fine world-space scanlines, a sweep band, a 24 fps
// lamp flicker, slices that slip sideways when the feed glitches, and an
// unfold from the lens upward (uTop). Edges are traced in brighter lines.
import * as THREE from 'three';
import { species } from '../../../creatures/registry';
import { itemGeometry } from '../../../items/itemMeshes';
import { atlas } from '../../../gfx/atlas';
import { U } from '../../../gfx/materials';
import type { Model } from './archiveData';

export const HOLO_U = {
  uTime: { value: 0 }, uTint: { value: new THREE.Color(0x8af0ff) }, uTop: { value: 10 }, uSweep: { value: -10 }, uGlitch: { value: 0 }, uAlpha: { value: 1 },
  uMap: { value: null as THREE.Texture | null }, uAtlasSize: { value: 2048 },
};

const VERT = /* glsl */`
#include <common>
#include <skinning_pars_vertex>
uniform float uTime; uniform float uGlitch;
varying vec3 vWPos; varying vec3 vWN; varying vec3 vCol;
#ifdef TEX
attribute vec4 aAtlas; varying vec4 vAtlas; varying vec2 vUv2;
#endif
void main() {
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  vec4 wp = modelMatrix * vec4(transformed, 1.0);
  float fr = floor(uTime * 12.0);
  float band = floor(wp.y * 22.0);
  float h = fract(sin(band * 91.7 + fr * 3.17) * 4375.85);
  wp.x += step(1.0 - uGlitch * 0.3, h) * (h - 0.5) * 0.08;
  vWPos = wp.xyz;
  vWN = normalize(mat3(modelMatrix) * objectNormal);
  #ifdef USE_COLOR
  vCol = color;
  #else
  vCol = vec3(0.8);
  #endif
  #ifdef TEX
  vAtlas = aAtlas; vUv2 = uv;
  #endif
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const FRAG = /* glsl */`
uniform vec3 uTint; uniform float uTime, uTop, uSweep, uAlpha, uAtlasSize; uniform sampler2D uMap;
varying vec3 vWPos; varying vec3 vWN; varying vec3 vCol;
#ifdef TEX
varying vec4 vAtlas; varying vec2 vUv2;
#endif
void main() {
  if (vWPos.y > uTop) discard;
  vec3 N = normalize(vWN); vec3 V = normalize(cameraPosition - vWPos);
  #ifdef TEX
  vec2 texPx = max(vAtlas.zw * uAtlasSize, vec2(1.0));
  vec2 fuv = (floor(fract(vUv2) * texPx) + 0.5) / texPx;
  vec3 tc = texture2D(uMap, vAtlas.xy + vec2(fuv.x, 1.0 - fuv.y) * vAtlas.zw).rgb * vCol;
  #else
  vec3 tc = vCol;
  #endif
  float lum = dot(tc, vec3(0.3, 0.59, 0.11));
  float rim = pow(1.0 - abs(dot(N, V)), 2.4);
  float lamb = 0.4 + 0.6 * max(0.0, dot(N, normalize(vec3(-0.4, 0.85, 0.45))));
  vec3 col = uTint * (0.08 + lum * 0.95 * lamb) + uTint * rim * 1.1;
  float scan = 0.62 + 0.38 * step(0.5, fract(vWPos.y * 120.0 - uTime * 1.2));
  col *= scan;
  col += uTint * exp(-abs(vWPos.y - uSweep) * 34.0) * 1.6;
  col += uTint * smoothstep(-0.035, 0.0, vWPos.y - uTop) * 2.4;
  float fl = 0.86 + 0.14 * fract(sin(floor(uTime * 24.0) * 91.7) * 43758.5);
  gl_FragColor = vec4(col * fl * uAlpha, 1.0);
}`;
const LINE_V = /* glsl */`
#include <common>
uniform float uTime; uniform float uGlitch; varying vec3 vWPos;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  float h = fract(sin(floor(wp.y * 22.0) * 91.7 + floor(uTime * 12.0) * 3.17) * 4375.85);
  wp.x += step(1.0 - uGlitch * 0.3, h) * (h - 0.5) * 0.08;
  vWPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const LINE_F = /* glsl */`
uniform vec3 uTint; uniform float uTime, uTop, uAlpha; varying vec3 vWPos;
void main() {
  if (vWPos.y > uTop) discard;
  float fl = 0.8 + 0.2 * fract(sin(floor(uTime * 24.0) * 37.1) * 43758.5);
  gl_FragColor = vec4(uTint * 1.25 * fl * uAlpha, 1.0);
}`;

const mats = new Map<string, THREE.ShaderMaterial>();
function holoMat(tex: boolean, colors: boolean): THREE.ShaderMaterial {
  const k = `${tex}|${colors}`;
  let m = mats.get(k);
  if (m) return m;
  HOLO_U.uMap.value = atlas().texture;
  HOLO_U.uAtlasSize.value = (U as any).uAtlasSize?.value ?? 2048;
  m = new THREE.ShaderMaterial({
    uniforms: HOLO_U as unknown as Record<string, THREE.IUniform>, vertexShader: VERT, fragmentShader: FRAG, defines: tex ? { TEX: 1 } : {},
    vertexColors: colors, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  });
  mats.set(k, m);
  return m;
}
let lineMat: THREE.ShaderMaterial | null = null;
function lineMaterial() {
  return lineMat ??= new THREE.ShaderMaterial({ uniforms: HOLO_U as unknown as Record<string, THREE.IUniform>, vertexShader: LINE_V, fragmentShader: LINE_F, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
}

/** every mesh under o turns into projected light, with its creases traced */
export function holoify(o: THREE.Object3D, lines = true) {
  const add: [THREE.Object3D, THREE.Object3D][] = [];
  o.traverse((n) => {
    const m = n as THREE.Mesh;
    if (!m.isMesh && !(n as THREE.Points).isPoints) { if ((n as THREE.Light).isLight) n.visible = false; return; }
    if (!m.isMesh) { n.visible = false; return; }
    const g = m.geometry as THREE.BufferGeometry;
    m.material = holoMat(!!g.getAttribute('aAtlas') && !!g.getAttribute('uv'), !!g.getAttribute('color'));
    m.castShadow = false; m.receiveShadow = false; m.renderOrder = 20; m.frustumCulled = false;
    if (lines && !(m as THREE.SkinnedMesh).isSkinnedMesh && g.getAttribute('position') && g.getAttribute('position').count < 30000) {
      try { const e = new THREE.LineSegments(new THREE.EdgesGeometry(g, 38), lineMaterial()); e.renderOrder = 21; e.frustumCulled = false; add.push([m, e]); } catch { /* odd geometry */ }
    }
  });
  for (const [m, e] of add) m.add(e);
}

/** the hologram for a file, fitted into a box `size` tall (base at y = 0, centred on x / z) */
export function holoModel(model: Model, known: boolean, size = 0.72): { group: THREE.Group; tick: (t: number, rec: boolean) => void } {
  const group = new THREE.Group();
  const inner = new THREE.Group();
  group.add(inner);
  let tick = (_t: number, _rec: boolean) => { /* nothing to animate */ };
  let built = false;
  if (known) {
    try {
      if (model.kind === 'species') {
        const sp: any = species(model.key);
        const rig = sp?.build?.();
        if (rig?.root) {
          inner.add(rig.root);
          built = true;
          const anim = sp.animateGallery as ((r: any, t: number) => void) | undefined;
          let t0 = -1;
          tick = (t, rec) => {
            if (rec && anim) { if (t0 < 0) t0 = t; try { anim(rig, t - t0); } catch { /* a pose that needs the world */ } }
            else { t0 = -1; if (rig.body) { rig.body.position.y = Math.sin(t * 1.6) * 0.01; rig.body.rotation.z = Math.sin(t * 0.7) * 0.02; } }
          };
        }
      } else if (model.kind === 'item') {
        const g = itemGeometry(model.key);
        if (g) { inner.add(new THREE.Mesh(g)); built = true; tick = (t) => { inner.rotation.y = t * 0.6; }; }
      } else if (model.kind === 'place') { inner.add(diorama(model.key, model.depth)); built = true; }
      else if (model.kind === 'medal') { inner.add(medal()); built = true; tick = (t) => { inner.rotation.y = t * 0.9; }; }
    } catch (e) { console.warn('holo model', e); }
  }
  if (!built) {
    // static: a file nobody has filed. A tumbling knot of noise.
    const g = new THREE.IcosahedronGeometry(0.3, 1);
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) { const k = 0.75 + 0.5 * Math.abs(Math.sin(i * 12.9898) * 1.7 % 1); p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k); }
    g.computeVertexNormals();
    inner.add(new THREE.Mesh(g));
    tick = (t) => { inner.rotation.set(t * 0.7, t * 1.1, t * 0.3); };
  }
  // fit: the largest side to `size`, standing on y = 0
  inner.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(inner);
  const s = box.getSize(new THREE.Vector3());
  const k = size / Math.max(0.05, Math.max(s.y, Math.max(s.x, s.z) * 0.85));
  inner.scale.multiplyScalar(k);
  const c = box.getCenter(new THREE.Vector3());
  inner.position.set(-c.x * k, -box.min.y * k, -c.z * k);
  if (!built) inner.position.y = size * 0.5;
  holoify(inner);
  return { group, tick };
}

// ================================================================== a level, in miniature
function hash(s: string) { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; }
function diorama(key: string, depth: number): THREE.Object3D {
  const g = new THREE.Group();
  let s = hash(key);
  const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
  const geos: THREE.BufferGeometry[] = [];
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, ry = 0) => { const b = new THREE.BoxGeometry(w, h, d); b.rotateY(ry); b.translate(x, y + h / 2, z); geos.push(b); };
  const N = 7, cell = 0.3, H = 0.28;
  // the floor slab (cut like a core sample), the walls of a maze grown from the key
  box(N * cell + 0.04, 0.04, N * cell + 0.04, 0, -0.04, 0);
  const wobble = Math.min(0.5, depth * 0.06);
  for (let i = 0; i <= N; i++) for (let j = 0; j < N; j++) {
    const x = -N * cell / 2 + i * cell, z = -N * cell / 2 + j * cell + cell / 2;
    if ((i === 0 || i === N) ? rnd() < 0.85 : rnd() < 0.32) box(0.02, H * (1 - rnd() * wobble), cell, x, 0, z, (rnd() - 0.5) * wobble * 0.4);
    if ((j === 0) ? rnd() < 0.85 : rnd() < 0.3) box(cell, H * (1 - rnd() * wobble), 0.02, z, 0, x);
  }
  // lights in the ceiling grid, a few props by the level's kind
  for (let i = 0; i < 6; i++) box(0.12, 0.01, 0.04, (rnd() - 0.5) * N * cell * 0.8, H + 0.02, (rnd() - 0.5) * N * cell * 0.8);
  const k = key;
  const props = /pool/.test(k) ? 'pool' : /office|annex/.test(k) ? 'desk' : /park/.test(k) ? 'car' : /mall|market|showroom/.test(k) ? 'shop' : /hospital/.test(k) ? 'bed' : /field|homestead|suburb/.test(k) ? 'tree' : /server|lab/.test(k) ? 'rack' : 'chair';
  for (let i = 0; i < 6; i++) {
    const x = (rnd() - 0.5) * N * cell * 0.8, z = (rnd() - 0.5) * N * cell * 0.8, r = rnd() * Math.PI;
    if (props === 'pool') box(0.5, 0.02, 0.36, x * 0.5, 0, z * 0.5);
    else if (props === 'desk') { box(0.16, 0.08, 0.08, x, 0, z, r); box(0.05, 0.05, 0.02, x, 0.08, z, r); }
    else if (props === 'car') box(0.2, 0.07, 0.1, x, 0, z, r);
    else if (props === 'shop') box(0.24, 0.16, 0.05, x, 0, z, r);
    else if (props === 'bed') box(0.18, 0.05, 0.08, x, 0, z, r);
    else if (props === 'tree') { box(0.02, 0.12, 0.02, x, 0, z); box(0.1, 0.08, 0.1, x, 0.12, z); }
    else if (props === 'rack') box(0.08, 0.22, 0.08, x, 0, z, r);
    else { box(0.05, 0.04, 0.05, x, 0, z, r); box(0.05, 0.06, 0.01, x, 0.04, z - 0.02, r); }
  }
  // a tiny figure for scale
  box(0.03, 0.09, 0.02, 0.05, 0, 0.05);
  const merged = mergeBoxes(geos);
  g.add(new THREE.Mesh(merged));
  return g;
}
function mergeBoxes(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let n = 0;
  for (const b of list) n += (b.index ? b.index.count : b.getAttribute('position').count);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  let o = 0;
  for (const b0 of list) {
    const b = b0.index ? b0.toNonIndexed() : b0;
    pos.set(b.getAttribute('position').array as Float32Array, o * 3);
    nor.set(b.getAttribute('normal').array as Float32Array, o * 3);
    o += b.getAttribute('position').count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return g;
}
function medal(): THREE.Object3D {
  const g = new THREE.Group();
  const disc = new THREE.LatheGeometry([new THREE.Vector2(0, -0.02), new THREE.Vector2(0.2, -0.02), new THREE.Vector2(0.22, 0), new THREE.Vector2(0.2, 0.02), new THREE.Vector2(0.12, 0.025), new THREE.Vector2(0, 0.03)], 14);
  disc.rotateX(Math.PI / 2); disc.translate(0, 0.32, 0);
  g.add(new THREE.Mesh(disc));
  const star = new THREE.CylinderGeometry(0.09, 0.09, 0.02, 5); star.rotateX(Math.PI / 2); star.translate(0, 0.32, 0.03);
  g.add(new THREE.Mesh(star));
  for (const s of [-1, 1]) { const r = new THREE.BoxGeometry(0.07, 0.2, 0.01); r.rotateZ(s * 0.35); r.translate(s * 0.05, 0.6, 0); g.add(new THREE.Mesh(r)); }
  return g;
}
