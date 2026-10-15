// The hologram look for Staff Sergeant Voss (src/game/handler.ts): a base
// material for a HumanRig that keeps the world shader (visibility mask, normal
// buffer) but throws the lit colour away and redraws the texels as projected
// light: cyan by luminance with amber where the texture is warm (beret badge,
// stripes, skin), screen-space scanlines, a bright band sweeping up the body,
// a fresnel rim, flicker, and horizontal slices of the body that jump sideways
// when the signal breaks up. Additive, no depth writes, no shadows. Plus the
// projector cone and the floor chevrons the handler draws.
import * as THREE from 'three';
import { worldMaterial, U } from '../gfx/materials';
import { atlas } from '../gfx/atlas';
import { addTextureModule } from '../gfx/textures/index';
import { ModelBuilder } from '../gfx/modelBuilder';
import type { HumanRig } from '../entities/humanRig';

/** x = brightness (0 hidden .. 1), y = slice glitch 0..1, z = unfold 0..1 (draws from the feet up), w = sweep speed */
export const HOLO = { uHolo: { value: new THREE.Vector4(1, 0, 1, 1) }, uHoloTint: { value: new THREE.Color(0x5ee6ff) }, uHoloWarm: { value: new THREE.Color(0xffa83a) } };

const VERT = /* glsl */`
{
  // the signal tears: whole horizontal bands of the body slide sideways for a frame or two
  float band = floor(transformed.y * 8.0);
  float ft = floor(uTime * 9.0);
  float gh = fract(sin(band * 12.9898 + ft * 78.233) * 43758.5453);
  if (gh < uHolo.y * 0.55) transformed.x += (fract(gh * 91.7) - 0.5) * 0.32 * uHolo.y;
  float gh2 = fract(sin(band * 3.17 + ft * 1.913) * 9631.7);
  if (gh2 < uHolo.y * 0.25) transformed.z += (fract(gh2 * 47.3) - 0.5) * 0.12 * uHolo.y;
}
`;
const FRAG = /* glsl */`
{
  vec3 alb = diffuseColor.rgb;
  float lum = dot(alb, vec3(0.3, 0.59, 0.11));
  float warm = clamp((alb.r - alb.b) * 2.4 - 0.25, 0.0, 1.0);
  vec3 col = mix(uHoloTint, uHoloWarm, warm * 0.85) * (0.45 + lum * 1.6);
  // rim: edges of the figure glow brighter
  vec3 vd = normalize(cameraPosition - vWPos);
  float rim = pow(1.0 - abs(dot(normalize(vWNormal), vd)), 2.0);
  col += uHoloTint * rim * 0.8;
  // scanlines (screen) and fine world bands
  float scan = 0.62 + 0.38 * step(0.5, fract(gl_FragCoord.y * 0.5));
  float bands = 0.85 + 0.15 * sin(vWPos.y * 90.0 - uTime * 6.0);
  col *= scan * bands;
  // a bright sweep climbing the body
  float sw = fract(vWPos.y * 0.42 - uTime * 0.38 * uHolo.w);
  col += uHoloTint * smoothstep(0.93, 1.0, sw) * 0.9;
  // unfolding from the floor up (appear / vanish)
  float top = uHolo.z * 2.3;
  float cut = vWPos.y - (uHoloBase + top);
  if (cut > 0.0) discard;
  col += uHoloTint * smoothstep(-0.06, 0.0, cut) * 2.0 * step(uHolo.z, 0.999);
  // flicker + visibility (only where the survivor can see)
  float fl = uHolo.x * (0.9 + 0.1 * sin(uTime * 37.0) * sin(uTime * 13.0));
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
      pc.setRGBA(x, y, Math.round(c * 0.35), Math.round(c * 0.9), c, 255);
    }
  });
  // a floor chevron (additive: black is nothing)
  A.add('zh_chevron', 16, 16, (pc) => {
    pc.wrap = false;
    pc.fill(0x000000);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const d = Math.abs(y - 4 - Math.abs(x - 7.5) * 0.9);
      if (d < 1.6 && y > 1 && y < 14) { const v = d < 0.8 ? 255 : 150; pc.setRGBA(x, y, Math.round(v * 0.35), Math.round(v * 0.9), v, 255); }
    }
  });
  A.add('zh_dot', 4, 4, (pc) => { pc.wrap = false; pc.fill(0x000000); pc.setRGBA(1, 1, 90, 230, 255, 255); pc.setRGBA(2, 1, 60, 160, 200, 255); pc.setRGBA(1, 2, 60, 160, 200, 255); pc.setRGBA(2, 2, 40, 110, 140, 255); });
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
