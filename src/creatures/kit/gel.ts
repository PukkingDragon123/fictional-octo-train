// Translucent skinned shells for kit rigs (src/creatures/kit/humanoids.ts): a
// second KitDef built on the same skeleton (a gel body, insect wings, a
// membrane) and drawn after the opaque kit mesh with a glossy, fresnel-weighted
// transparent material, so whatever the kit mesh holds inside (bones, organs,
// a swallowed meal) shows through it. The shell shares the rig's KitFx, so the
// hit flash and the dithered dissolve reach it too.
//   attachFilm(rig, def, variant, opts)   in a KitDef's decorate()
//   filmPersonalize(rig, variant)         after kitPersonalize() switches individuals
import * as THREE from 'three';
import { worldMaterial } from '../../gfx/materials';
import { patchShader, kitEntry, type KitDef, type KitRig, type KitFx } from './humanoids';
import type { Creature } from '../creature';
import { markFaceted } from './horror';

export interface FilmOpts {
  /** base opacity looking straight through (0..1) */
  opacity?: number;
  /** extra opacity toward grazing angles (thick at the silhouette, like real jelly) */
  edge?: number;
  /** hard wet highlight strength */
  spec?: number;
  /** self-coloured rim glow (light scattering inside the gel) */
  rim?: number;
  doubleSide?: boolean;
  /**
   * 0..1: also draw a colour-filter pass under the surface (multiplies what is
   * behind the shell by the page colour, stronger toward the silhouette), so
   * the bones and organs inside, and the floor seen through it, take the
   * jelly's colour the way light through a sweet does.
   */
  tint?: number;
}

const glsl = (o: { edge: number; spec: number; rim: number }) => /* glsl */`
{
  vec3 gV = normalize(cameraPosition - vWPos);
  vec3 gN = normalize(vWNormal);
  float gFr = 1.0 - abs(dot(gN, gV));
  vec3 gL = normalize(vec3(-0.35, 0.85, 0.4));
  float gS = pow(max(abs(dot(gN, normalize(gL + gV))), 0.0), 34.0);
  float gHi = step(0.3, gS) * gS * ${o.spec.toFixed(3)};
  outgoingLight += vec3(1.0, 0.96, 0.9) * gHi + diffuseColor.rgb * gFr * ${o.rim.toFixed(3)};
  diffuseColor.a = clamp(diffuseColor.a * (1.0 + ${o.edge.toFixed(3)} * gFr * gFr) + gHi * 0.6, 0.0, 0.97);
}
`;

/** the transparent kit material over a page texture (one per rig: it carries that rig's fx uniforms) */
export function filmKitMaterial(map: THREE.Texture, F: KitFx, o: FilmOpts = {}): THREE.MeshLambertMaterial {
  const base = worldMaterial({ transparent: true, outline: 0, depthWrite: false }) as any;
  const full = { edge: o.edge ?? 1.4, spec: o.spec ?? 0.9, rim: o.rim ?? 0.35 };
  const m = new THREE.MeshLambertMaterial({
    map, vertexColors: true, transparent: true, opacity: o.opacity ?? 0.55, depthWrite: false,
    side: o.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
  });
  const key = (base.customProgramCacheKey ? base.customProgramCacheKey() : 'base') + '|film:' + JSON.stringify(full);
  m.onBeforeCompile = (shader, renderer) => {
    base.onBeforeCompile?.(shader, renderer);
    patchShader(shader as any, F);
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', glsl(full) + '#include <opaque_fragment>');
  };
  m.customProgramCacheKey = () => key;
  markFaceted(m);
  return m;
}

const tintGlsl = (k: number) => /* glsl */`
{
  vec3 tV = normalize(cameraPosition - vWPos);
  float tFr = 1.0 - abs(dot(normalize(vWNormal), tV));
  vec3 tC = max(diffuseColor.rgb, vec3(1e-3));
  vec3 tT = tC / max(max(tC.r, tC.g), tC.b);
  // Beer-Lambert: light through more jelly (toward the silhouette) comes out deeper
  gl_FragColor = vec4(pow(tT, vec3(${k.toFixed(3)} * (0.75 + 1.3 * tFr * tFr))), 1.0);
  gNormal = vec4(1.0);
}
`;
/** the colour-filter pass: dst * colour (normal buffer untouched) */
export function tintKitMaterial(map: THREE.Texture, F: KitFx, k: number, doubleSide = false): THREE.MeshLambertMaterial {
  const base = worldMaterial({ transparent: true, outline: 0, depthWrite: false }) as any;
  const m = new THREE.MeshLambertMaterial({ map, vertexColors: true, transparent: true, depthWrite: false, side: doubleSide ? THREE.DoubleSide : THREE.FrontSide });
  m.blending = THREE.CustomBlending;
  m.blendEquation = THREE.AddEquation; m.blendSrc = THREE.ZeroFactor; m.blendDst = THREE.SrcColorFactor;
  m.blendEquationAlpha = THREE.AddEquation; m.blendSrcAlpha = THREE.ZeroFactor; m.blendDstAlpha = THREE.OneFactor;
  const key = (base.customProgramCacheKey ? base.customProgramCacheKey() : 'base') + '|tint:' + k.toFixed(3);
  m.onBeforeCompile = (shader, renderer) => {
    base.onBeforeCompile?.(shader, renderer);
    patchShader(shader as any, F);
    const fs = shader.fragmentShader, i = fs.lastIndexOf('}');
    shader.fragmentShader = fs.slice(0, i) + tintGlsl(k) + fs.slice(i);
  };
  m.customProgramCacheKey = () => key;
  markFaceted(m);
  return m;
}

/** build a film KitDef's shell on an existing kit rig's skeleton and add it to the body */
export function attachFilm(rig: KitRig, def: KitDef, variant: number, o: FilmOpts = {}): THREE.SkinnedMesh {
  const e = kitEntry(def, variant);
  if (o.tint) {
    const tm = new THREE.SkinnedMesh(e.geo, tintKitMaterial(e.tex, rig.kit.F, o.tint, o.doubleSide));
    tm.name = 'tint:' + def.key; tm.renderOrder = 1; tm.castShadow = false; tm.receiveShadow = false;
    tm.boundingBox = new THREE.Box3();
    tm.boundingSphere = new THREE.Sphere(new THREE.Vector3(def.sphere[0], def.sphere[1], def.sphere[2]), def.sphere[3]);
    (tm as any).clone = () => new THREE.Group();
    rig.body.add(tm);
    tm.bind(rig.kit.skeleton, new THREE.Matrix4());
    ((rig.kit.m.films ??= []) as { mesh: THREE.SkinnedMesh; def: KitDef; tint?: boolean }[]).push({ mesh: tm, def, tint: true });
  }
  const mesh = new THREE.SkinnedMesh(e.geo, filmKitMaterial(e.tex, rig.kit.F, o));
  mesh.name = 'film:' + def.key;
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.renderOrder = 2;
  mesh.boundingBox = new THREE.Box3();
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(def.sphere[0], def.sphere[1], def.sphere[2]), def.sphere[3]);
  // gore clones rig sub-trees into gibs: the shell is not one of the pieces
  (mesh as any).clone = () => new THREE.Group();
  rig.body.add(mesh);
  mesh.bind(rig.kit.skeleton, new THREE.Matrix4());
  const films = (rig.kit.m.films ??= []) as { mesh: THREE.SkinnedMesh; def: KitDef }[];
  films.push({ mesh, def });
  return mesh;
}

/**
 * An extra opaque kit mesh on the same skeleton drawn without ink outlines:
 * the things inside a translucent body (bones, organs) that should read as
 * seen through it rather than sitting on top of it.
 */
export function attachInner(rig: KitRig, def: KitDef, variant: number): THREE.SkinnedMesh {
  const e = kitEntry(def, variant);
  const base = worldMaterial({ outline: 0 }) as any;
  const m = new THREE.MeshLambertMaterial({ map: e.tex, vertexColors: true, flatShading: true });
  const F = rig.kit.F;
  m.onBeforeCompile = (shader, renderer) => { base.onBeforeCompile?.(shader, renderer); patchShader(shader as any, F); };
  const key = (base.customProgramCacheKey ? base.customProgramCacheKey() : 'base') + '|inner';
  m.customProgramCacheKey = () => key;
  markFaceted(m);
  const mesh = new THREE.SkinnedMesh(e.geo, m);
  mesh.name = 'inner:' + def.key;
  mesh.castShadow = false; mesh.receiveShadow = true;
  mesh.boundingBox = new THREE.Box3();
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(def.sphere[0], def.sphere[1], def.sphere[2]), def.sphere[3]);
  (mesh as any).clone = () => new THREE.Group();
  rig.body.add(mesh);
  mesh.bind(rig.kit.skeleton, new THREE.Matrix4());
  ((rig.kit.m.films ??= []) as { mesh: THREE.SkinnedMesh; def: KitDef; tint?: boolean }[]).push({ mesh, def, tint: true });
  return mesh;
}

/** keep the shells in step when kitPersonalize() switched the rig to another individual */
export function filmPersonalize(rig: KitRig, variant: number) {
  for (const f of (rig.kit.m.films ?? []) as { mesh: THREE.SkinnedMesh; def: KitDef }[]) {
    const e = kitEntry(f.def, variant);
    if (f.mesh.geometry === e.geo) continue;
    f.mesh.geometry = e.geo;
    (f.mesh.material as THREE.MeshLambertMaterial).map = e.tex;
    (f.mesh.material as THREE.MeshLambertMaterial).needsUpdate = true;
  }
}

/** the surface shells of a rig (for per-frame opacity tweaks: digesting, dying, splitting) */
export function films(rig: KitRig): THREE.SkinnedMesh[] { return ((rig.kit.m.films ?? []) as { mesh: THREE.SkinnedMesh; tint?: boolean }[]).filter((f) => !f.tint).map((f) => f.mesh); }

/**
 * The creature manager lays every dead non-flying creature on its side
 * (body.rotation.z = pi/2) and lifts flying ones by a measured rest height
 * (src/creatures/manager.ts updateVisuals). Blobs and things that pose their
 * own deaths call this at the end of animate(): it pre-applies the exact
 * inverse on the kit's root bone, so the death pose is what the species set.
 * The root bone must sit at the body origin (at: [0, 0, 0]); the species'
 * own offset and roll (about z) of it are kept. Set that pose afresh every
 * frame before calling this (it composes onto whatever the bone holds).
 */
export function uprightDead(rig: KitRig, c: Creature, rootBone = 'base') {
  const b = rig.parts[rootBone];
  if (!b || !c.dead || rig.root.userData.creature !== c) return;
  const k = Math.min(1, Math.min(1, c.deathT * 2 + (c.deathT > 0 ? 0 : 1)) + 0.01);
  const th = (c.sp.flags?.flying ? 0 : Math.PI / 2) * k;
  const h = ((rig.root.userData.restY as number | undefined) ?? 0) * k;
  // manager M = T(0, h) Rz(th); the species set S = T(px, py) Rz(rz) on the bone; we want M X = S:
  // X = Rz(-th) T(px, py - h) Rz(rz) = T(Rz(-th) (px, py - h)) Rz(rz - th)
  const px = b.position.x, py = b.position.y - h, rz = b.rotation.z;
  const ct = Math.cos(th), st = Math.sin(th);
  b.position.set(px * ct + py * st, -px * st + py * ct, b.position.z);
  b.rotation.z = rz - th;
}
