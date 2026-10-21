// The projection look for Staff Sergeant Voss (src/game/handler.ts): an old
// projector / CRT image, not a sci-fi hologram. A base material for a HumanRig
// that keeps the world shader (visibility mask, normal buffer) but throws the
// lit colour away and redraws the texels as warm phosphor light (pale amber by
// luminance, deeper orange where the texture is warm), screen-space scanlines,
// 24 fps film flicker, grain, the odd vertical scratch, a soft bright rim, the
// gate weaving the whole picture a hair sideways, and, when the feed is bad,
// the frame slipping. Additive, no depth writes, no shadows. Plus the dusty
// projector beam and the floor arrows the handler draws, in the same light.
import * as THREE from 'three';
import { worldMaterial, U } from '../gfx/materials';
import { atlas } from '../gfx/atlas';
import { addTextureModule } from '../gfx/textures/index';
import { ModelBuilder } from '../gfx/modelBuilder';
import type { HumanRig } from '../entities/humanRig';

/** x = brightness (0 hidden .. 1), y = slice glitch 0..1, z = unfold 0..1 (draws from the feet up), w = sweep speed */
export const HOLO = { uHolo: { value: new THREE.Vector4(1, 0, 1, 1) }, uHoloTint: { value: new THREE.Color(0xffdca0) }, uHoloWarm: { value: new THREE.Color(0xff8a30) } };

const VERT = /* glsl */`
{
  // film in the gate: the whole picture weaves a hair sideways every frame (24 fps);
  // a bad feed makes the frame slip up and judder
  float ft = floor(uTime * 24.0);
  float wv = fract(sin(ft * 12.9898) * 43758.5453) - 0.5;
  transformed.x += wv * 0.008 + wv * 0.05 * uHolo.y;
  float slip = fract(sin(ft * 3.17) * 9631.7);
  if (slip < uHolo.y * 0.4) transformed.y += (fract(slip * 47.3) - 0.5) * 0.08 * uHolo.y;
}
`;
const FRAG = /* glsl */`
{
  vec3 alb = diffuseColor.rgb;
  float lum = dot(alb, vec3(0.3, 0.59, 0.11));
  float warm = clamp((alb.r - alb.b) * 2.4 - 0.25, 0.0, 1.0);
  vec3 col = mix(uHoloTint, uHoloWarm, warm * 0.85) * (0.4 + lum * 1.5);
  // rim: edges of the figure glow brighter
  vec3 vd = normalize(cameraPosition - vWPos);
  float rim = pow(1.0 - abs(dot(normalize(vWNormal), vd)), 2.0);
  col += uHoloTint * rim * 0.45;
  // scanlines (screen), a slow rolling hum bar, grain, a scratch now and then
  float scan = 0.66 + 0.34 * step(0.5, fract(gl_FragCoord.y * 0.5));
  float hum = 0.9 + 0.1 * sin(vWPos.y * 3.0 - uTime * 1.3);
  float fr = floor(uTime * 24.0);
  float grain = fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233)) + fr * 1.618) * 43758.5453);
  col *= scan * hum * (0.88 + grain * 0.24);
  float scr = step(0.992, fract(sin(floor(gl_FragCoord.x * 0.5) * 7.13 + fr * 0.37) * 4375.85));
  col = mix(col, uHoloTint * 1.4, scr * 0.5);
  // the lamp breathes: 24 fps flicker
  col *= 0.86 + 0.14 * fract(sin(fr * 91.7) * 43758.5);
  // unfolding from the floor up (appear / vanish)
  float top = uHolo.z * 2.3;
  float cut = vWPos.y - (uHoloBase + top);
  if (cut > 0.0) discard;
  col += uHoloTint * smoothstep(-0.06, 0.0, cut) * 2.0 * step(uHolo.z, 0.999);
  // flicker + visibility (only where the survivor can see)
  float fl = uHolo.x;
  #ifndef NOVIS
  if (uVisOn > 0.5) { vec2 vis = texture2D(uVisTex, (vWPos.xz - uVisInfo.xy) * uVisInfo.zw).rg; fl *= clamp(vis.r * 1.4, 0.0, 1.0); }
  #endif
  gl_FragColor = vec4(col * fl, 1.0);
}
`;

export const HOLO_BASE = { uHoloBase: { value: 0 } };

let baseMat: THREE.Material | null = null;
/** the base material to build the handler's HumanRig with */
export function holoBaseMaterial(): THREE.Material {
  if (baseMat) return baseMat;
  const world = worldMaterial({ outline: 0, noFog: true }) as THREE.MeshLambertMaterial;
  const m = new THREE.MeshLambertMaterial({ map: atlas().texture, vertexColors: true });
  m.onBeforeCompile = (shader, r) => {
    world.onBeforeCompile(shader, r);
    shader.uniforms.uHolo = HOLO.uHolo; shader.uniforms.uHoloTint = HOLO.uHoloTint; shader.uniforms.uHoloWarm = HOLO.uHoloWarm; shader.uniforms.uHoloBase = HOLO_BASE.uHoloBase;
    shader.uniforms.uTime = U.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec4 uHolo;')
      .replace('#include <skinning_vertex>', '#include <skinning_vertex>\n' + VERT);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec4 uHolo;\nuniform vec3 uHoloTint;\nuniform vec3 uHoloWarm;\nuniform float uHoloBase;')
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n' + FRAG);
  };
  m.customProgramCacheKey = () => 'noclip:holo1';
  baseMat = m;
  return m;
}

let propMat: THREE.Material | null = null;
/** the same light for plain (unskinned) meshes textured from the atlas: the beret */
export function holoPropMaterial(): THREE.Material {
  if (propMat) return propMat;
  const base = holoBaseMaterial();
  const m = new THREE.MeshLambertMaterial({ map: atlas().texture, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  m.onBeforeCompile = (shader, r) => base.onBeforeCompile(shader, r);
  m.customProgramCacheKey = () => 'noclip:holo1p';
  propMat = m;
  return m;
}

/** turn a rig built on holoBaseMaterial into projected light */
export function makeHologram(rig: HumanRig) {
  const m = rig.material as THREE.Material & { blending: THREE.Blending };
  m.transparent = true;
  m.blending = THREE.AdditiveBlending;
  m.depthWrite = false;
  m.needsUpdate = true;
  rig.skin.castShadow = false; rig.skin.receiveShadow = false;
  rig.skin.renderOrder = 20;
  rig.root.traverse((o) => { o.castShadow = false; (o as THREE.Mesh).renderOrder = 20; });
}

// ------------------------------------------------------------------ projector cone and floor guide
addTextureModule(() => {
  const A = atlas();
  // the cone: brightest at the source, scanlines, thinning toward the figure
  A.add('zh_cone', 8, 32, (pc) => {
    pc.wrap = false;
    for (let y = 0; y < 32; y++) for (let x = 0; x < 8; x++) {
      const t = y / 31, a = Math.pow(1 - t, 1.6) * 0.75 + 0.06;
      const s = y % 3 === 0 ? 0.55 : 1;
      const c = Math.round(255 * a * s);
      pc.setRGBA(x, y, c, Math.round(c * 0.8), Math.round(c * 0.5), 255);
    }
    // dust in the beam
    for (let i = 0; i < 9; i++) { const x = (i * 5) % 8, y = (i * 11) % 32; pc.setRGBA(x, y, 255, 230, 190, 255); }
  });
  // a floor chevron (additive: black is nothing)
  A.add('zh_chevron', 16, 16, (pc) => {
    pc.wrap = false;
    pc.fill(0x000000);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const d = Math.abs(y - 4 - Math.abs(x - 7.5) * 0.9);
      if (d < 1.6 && y > 1 && y < 14) { const v = d < 0.8 ? 255 : 150; pc.setRGBA(x, y, v, Math.round(v * 0.74), Math.round(v * 0.42), 255); }
    }
  });
  A.add('zh_dot', 4, 4, (pc) => { pc.wrap = false; pc.fill(0x000000); pc.setRGBA(1, 1, 255, 210, 140, 255); pc.setRGBA(2, 1, 200, 150, 90, 255); pc.setRGBA(1, 2, 200, 150, 90, 255); pc.setRGBA(2, 2, 140, 100, 60, 255); });
  // the target marker: a bracketed square
  A.add('zh_mark', 16, 16, (pc) => {
    pc.wrap = false; pc.fill(0x000000);
    const c = (x: number, y: number) => pc.setRGBA(x, y, 255, 170, 60, 255);
    for (let i = 0; i < 5; i++) { c(i, 0); c(0, i); c(15 - i, 0); c(15, i); c(i, 15); c(0, 15 - i); c(15 - i, 15); c(15, 15 - i); }
  });
});

/** a unit cone: apex at the origin, base radius 1 at y = 1 (scaled / aimed per frame) */
export function coneMesh(): THREE.Mesh {
  const mb = new ModelBuilder();
  mb.cylinder(0, 0, 0, 0.02, 1, 10, 'zh_cone', { rTop: 1, caps: false, fit: true, emissive: 1.6, ao: false });
  const mat = worldMaterial({ additive: true, outline: 0, noFog: true, unlit: true, noGrid: true, doubleSide: true, depthWrite: false, opacity: 0.9971 });
  const m = new THREE.Mesh(mb.build(), mat);
  m.renderOrder = 19; m.castShadow = false; m.frustumCulled = false;
  return m;
}
/** a flat quad lying on the floor (for instancing) */
export function floorQuadGeo(tex: string, w: number, d: number): THREE.BufferGeometry {
  const mb = new ModelBuilder();
  mb.flat(0, 0.02, 0, w, d, tex, { emissive: 1.4, ao: false } as never);
  return mb.build();
}
export function additiveMat() { return worldMaterial({ additive: true, outline: 0, noFog: true, unlit: true, noGrid: true, depthWrite: false }); }
