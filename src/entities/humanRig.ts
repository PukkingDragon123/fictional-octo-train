import * as THREE from 'three';
import { cosmeticOutfit, syncCosmetics } from './cosmetics3d';
import { worldMaterial } from '../gfx/materials';
import { BONES, BoneName, BONE_PARENT, BI, Dims, rigDims, buildBody, cutSpec, REG, PAGE } from './humanModel';
import { ModelBuilder } from '../gfx/modelBuilder';
import { stumpModel, pegModel, hookModel, prostHandModel, prostLegModel, footShell } from './limbGear';
import { cutParts, StumpCond, PROSTHETICS, chainOf } from '../survival/limbs';
import { cyberPieces } from './cyberGear';
import { coveredParts } from '../survival/cyberParts';
import { bakePage, makePageTexture, EYE_COLORS, BakeCache } from './humanPaint';
import { outfitShape } from './humanClothes';
import { HumanAnimator, AnimInput, EMOTES } from './humanAnim';
import { legDimsFrom } from './humanGait';
import { Ragdoll, RagWorld } from './humanRagdoll';
import './humanTextures';

export type JointName =
  | 'hips' | 'spine' | 'chest' | 'neck' | 'head'
  | 'uarmL' | 'farmL' | 'handL' | 'uarmR' | 'farmR' | 'handR'
  | 'thighL' | 'shinL' | 'footL' | 'thighR' | 'shinR' | 'footR';

export const JOINTS: JointName[] = ['hips', 'spine', 'chest', 'neck', 'head', 'uarmL', 'farmL', 'handL', 'uarmR', 'farmR', 'handR', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'];

export type HairStyle = 'short' | 'long' | 'buzz' | 'bald' | 'ponytail' | 'curly' | 'bob';
export type FacialHair = 'none' | 'stubble' | 'moustache' | 'goatee' | 'beard';

export interface Appearance {
  skin: number;
  hair: number;
  hairStyle: HairStyle;
  face: number;           // 0..5 face variant (0..3 in old saves)
  build: 'slim' | 'average' | 'broad';
  height: number;         // 0.94 .. 1.06 scale
  beard?: boolean;        // legacy: full beard
  // ---- optional (older saves lack them; defaults apply)
  /** 0 = masculine .. 1 = feminine proportions (default 0.3) */
  bodyShape?: number;
  eyeColor?: number;
  facialHair?: FacialHair;
  /** 0..1 */
  freckles?: number;
  /** 0..3 small facial scars */
  scars?: number;
  /** 0..1 age lines */
  age?: number;
}

export interface LookPart {
  tex: string; color: number; sleeve?: 'none' | 'short' | 'long';
  /** item key that produced this look (picks shape variants: slippers, sunglasses, gas mask...) */
  item?: string;
  /** 0..1 blood soaked into the garment (Item.bloody) */
  blood?: number;
  /** 0..1 wear (1 - condition): frays and holes */
  wear?: number;
}
export interface Outfit {
  torso?: LookPart;       // innermost visible top
  torsoOuter?: LookPart;  // jacket/coat (drawn over torso)
  legs?: LookPart;
  legsKind?: 'pants' | 'shorts' | 'skirt';
  feet?: LookPart;
  hands?: LookPart;
  head?: LookPart & { hat?: 'cap' | 'beanie' | 'hardhat' | 'helmet' };
  eyes?: LookPart;
  face?: LookPart;
  back?: LookPart & { size?: number };
  /** wrist monitor / watch on the left wrist */
  wrist?: LookPart;
  /** visible condition (blood, bandages, splints, wet, dirt, pallor, corruption) */
  cond?: RigCondition;
}

/** Visible condition. Body part keys as in items (head, neck, torso_u, torso_l, groin, uarm_l, ..., foot_r). */
export interface RigCondition {
  /** blood stains per body part, 0..3 */
  blood?: Record<string, number>;
  /** bandaged parts: 1 clean, 1.5 spotted, 2 soaked */
  bandage?: Record<string, number>;
  /** splinted parts */
  splint?: string[];
  /** actively bleeding parts -> bleed level 1..3 (drives woundPoints, never repaints) */
  bleeding?: Record<string, number>;
  /** 0..3 */
  wet?: number; dirt?: number; pale?: number; corrupt?: number;
  /** baked facial expression */
  expr?: '' | 'pain' | 'fear';
  /** severed body parts (src/survival/limbs.ts): the mesh drops them and caps the cut */
  sev?: string[];
  /** each cut (the most proximal missing part of a limb): how the stump looks, a tourniquet, the owner's injury id */
  stump?: Record<string, StumpCond & { id?: number }>;
  /** fitted prosthetics by limb ('arm_l' | 'arm_r' | 'leg_l' | 'leg_r' → item key) */
  prost?: Record<string, string>;
  /** installed cyberware ({slot: part key}, src/survival/cyberParts.ts): the flesh it replaces is dropped, the hardware hangs on the bones */
  cyber?: Record<string, string>;
}

/** stump / prosthetic geometry, shared between rigs (bucketed radius, look, skin tint) */
const GEAR_GEO = new Map<string, THREE.BufferGeometry>();
function gearGeo(key: string, fn: (mb: ModelBuilder) => void): THREE.BufferGeometry {
  let g = GEAR_GEO.get(key);
  if (!g) { const mb = new ModelBuilder(); fn(mb); g = mb.build(); GEAR_GEO.set(key, g); }
  return g;
}

export const SKIN_TONES = [0xf3d2b8, 0xe8b98f, 0xd39b6c, 0xb67a4c, 0x8d5634, 0x5e3a24];
export const HAIR_COLORS = [0x1c1612, 0x3b2a1e, 0x6a4628, 0x9c7a46, 0xd8c08a, 0xa8a49e, 0x8a3a1c, 0xe8e2d6];
export { EYE_COLORS, EMOTES };
export const HAIR_STYLES: HairStyle[] = ['short', 'long', 'buzz', 'bald', 'ponytail', 'curly', 'bob'];
export const FACIAL_HAIR: FacialHair[] = ['none', 'stubble', 'moustache', 'goatee', 'beard'];
export const FACE_VARIANTS = 6;
export const FACE_COUNT = FACE_VARIANTS;
export const FACIAL_HAIRS = FACIAL_HAIR;
/** option lists for character creators (numbers in [0,1] are sliders: bodyShape, freckles, age; scars is 0..3) */
export const APPEARANCE_OPTIONS = {
  skin: SKIN_TONES, hair: HAIR_COLORS, hairStyle: HAIR_STYLES, build: ['slim', 'average', 'broad'], facialHair: FACIAL_HAIR, eyeColor: EYE_COLORS,
  bodyShape: [0, 0.25, 0.5, 0.75, 1], freckles: [0, 0.35, 0.7, 1], scars: [0, 1, 2, 3], age: [0, 0.3, 0.6, 0.9],
};

/** Fill in defaults for appearance fields older saves don't have (returns a new object). */
export function normalizeAppearance(a: Partial<Appearance>): Appearance {
  const fh = a.beard === false && a.facialHair === 'beard' ? 'none' : a.beard && (!a.facialHair || a.facialHair === 'none') ? 'beard' : a.facialHair || 'none';
  return {
    ...a,
    skin: a.skin ?? SKIN_TONES[1], hair: a.hair ?? HAIR_COLORS[1], hairStyle: a.hairStyle ?? 'short', face: ((a.face ?? 0) % FACE_VARIANTS + FACE_VARIANTS) % FACE_VARIANTS,
    build: a.build ?? 'average', height: clampN(a.height ?? 1, 0.9, 1.1), beard: fh === 'beard',
    bodyShape: clampN(a.bodyShape ?? 0.3, 0, 1), eyeColor: a.eyeColor, facialHair: fh, freckles: clampN(a.freckles ?? (a.face === 3 ? 0.5 : 0), 0, 1),
    scars: Math.round(clampN(a.scars ?? 0, 0, 3)), age: clampN(a.age ?? 0, 0, 1),
  };
}
const clampN = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

// ------------------------------------------------------------------ material
let warnedMap = false;
/**
 * Faceted shading for the low-poly body: lights shade every polygon flat
 * (flatShading), and the room's ambient / light-grid term is modulated per
 * facet against a fixed overhead key so the planes of the face, the folds of
 * the clothes and the chamfers of the boots read even under flat indoor light.
 */
const FACET_GLSL = /* glsl */`
{
  vec3 fN = normalize(cross(dFdx(vWPos), dFdy(vWPos)));
  float fk = dot(fN, vec3(-0.38, 0.8, 0.46));
  float fr = 1.0 - abs(dot(fN, normalize(cameraPosition - vWPos)));
  float facet = 0.82 + 0.24 * fk + 0.06 * fN.y - 0.08 * fr * fr;
  irradiance *= clamp(facet, 0.42, 1.3);
}
`;
function humanMaterial(map: THREE.Texture, base: THREE.Material, uHuman: { value: THREE.Vector4 }): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ map, vertexColors: true, flatShading: true });
  const b = base as any;
  m.onBeforeCompile = (shader, renderer) => {
    b.onBeforeCompile?.(shader, renderer);
    shader.uniforms.uHuman = uHuman;
    let vs = shader.vertexShader, fs = shader.fragmentShader;
    if (fs.includes('#include <lights_fragment_end>')) fs = fs.replace('#include <lights_fragment_end>', FACET_GLSL + '#include <lights_fragment_end>');
    vs = vs.replace('#include <common>', '#include <common>\nuniform vec4 uHuman;');
    vs = vs.replace('vec4 nWp = vec4( transformed, 1.0 );', `
if (uHuman.x > 0.001) {
  float band = floor(transformed.y * 14.0);
  float gt = floor(uHuman.y * 11.0);
  float gh = fract(sin(band * 12.9898 + gt * 78.233) * 43758.5453);
  if (gh < uHuman.x * 0.22) transformed.x += (fract(gh * 91.7) - 0.5) * 0.14 * uHuman.x;
}
vec4 nWp = vec4( transformed, 1.0 );`);
    fs = fs.replace('#include <common>', '#include <common>\nuniform vec4 uHuman;');
    const grad = 'textureGrad( map, auv, dFdx( vMapUv ), dFdy( vMapUv ) )';
    if (fs.includes('texture2D( map, auv )')) fs = fs.replace('texture2D( map, auv )', grad);
    else if (!warnedMap) { warnedMap = true; console.warn('humanRig: world map chunk changed; character mipmaps may shimmer'); }
    fs = fs.replace('diffuseColor *= sampledDiffuseColor;', `diffuseColor *= sampledDiffuseColor;
if (uHuman.x > 0.001) {
  float gb = floor(vWPos.y * 22.0 + floor(uHuman.y * 9.0) * 3.0);
  float gh = fract(sin(gb * 7.13 + floor(uHuman.y * 10.0) * 3.71) * 4375.85);
  if (gh < uHuman.x * 0.28) diffuseColor.rgb = mix(diffuseColor.rgb, gh < uHuman.x * 0.1 ? vec3(1.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.9), 0.7);
}
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.3, 0.25), uHuman.z);`);
    shader.vertexShader = vs; shader.fragmentShader = fs;
  };
  const key = b.customProgramCacheKey ? b.customProgramCacheKey() : 'base';
  m.customProgramCacheKey = () => key + '|human2';
  return m;
}

// ------------------------------------------------------------------ outline hull (standalone scenes)
/**
 * A black silhouette outline for scenes that do not run the world renderer's
 * edge pass (menus, the operating table, cutscenes): an inverted hull drawn
 * with back faces only, its vertices pushed out along the skinned normal by a
 * constant number of render-target pixels, so it stays one crisp low-res
 * pixel wide at any distance.
 */
const OUTLINE_VS_DECL = 'uniform vec3 uOutline;\n';
const OUTLINE_VS = /* glsl */`
{
#if defined( USE_ENVMAP ) || defined( USE_SKINNING )
  vec3 oObjN = objectNormal;
#else
  vec3 oObjN = normal;
#endif
  vec3 oN = normalize(mat3(modelMatrix) * oObjN);
  vec4 cN = projectionMatrix * (viewMatrix * vec4(oN, 0.0));
  float l = length(cN.xy);
  if (l > 1e-6) gl_Position.xy += cN.xy / l * uOutline.xy * gl_Position.w;
  gl_Position.z += uOutline.z * gl_Position.w;
}
`;
const _osz = new THREE.Vector2();
/** an outline material (skinned or rigid); px = width in render-target pixels */
export function outlineMaterial(px = 1, color = 0x050404): THREE.MeshBasicMaterial {
  const u = { value: new THREE.Vector3(0, 0, 0.0004) };
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide, fog: false });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uOutline = u;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + OUTLINE_VS_DECL)
      .replace('#include <project_vertex>', '#include <project_vertex>\n' + OUTLINE_VS);
  };
  m.customProgramCacheKey = () => 'human-outline';
  (m as any).userData = { px, u };
  return m;
}
/** keep an outline material's pixel width right for whatever target it renders into */
function outlineSize(mesh: THREE.Object3D, mat: THREE.MeshBasicMaterial) {
  mesh.onBeforeRender = (renderer) => {
    const rt = renderer.getRenderTarget();
    if (rt) _osz.set(rt.width, rt.height); else renderer.getDrawingBufferSize(_osz);
    const d = (mat as any).userData as { px: number; u: { value: THREE.Vector3 } };
    d.u.value.x = (2 * d.px) / Math.max(1, _osz.x);
    d.u.value.y = (2 * d.px) / Math.max(1, _osz.y);
  };
}
const EMPTY_GEO = new THREE.BufferGeometry();
const _rv = new THREE.Vector3();
const _rq = new THREE.Quaternion();
const isWorldMat = (m: THREE.Material | undefined) => !!m && typeof (m as any).customProgramCacheKey === 'function' && String((m as any).customProgramCacheKey()).startsWith('noclip:');

// where wounds sit for woundPoints(): bone + local offset (scaled by height)
const WOUND_AT: Record<string, [BoneName, number, number, number]> = {
  head: ['head', 0, 0.13, 0.07], neck: ['neck', 0, 0.03, 0.045], torso_u: ['chest', 0, 0.12, 0.1], torso_l: ['spine', 0, 0.07, 0.095], groin: ['hips', 0, -0.06, 0.08],
  uarm_l: ['uarmL', 0.03, -0.14, 0.03], uarm_r: ['uarmR', -0.03, -0.14, 0.03], farm_l: ['farmL', 0.02, -0.12, 0.03], farm_r: ['farmR', -0.02, -0.12, 0.03],
  hand_l: ['handL', 0.01, -0.05, 0.0], hand_r: ['handR', -0.01, -0.05, 0.0], thigh_l: ['thighL', 0.02, -0.2, 0.07], thigh_r: ['thighR', -0.02, -0.2, 0.07],
  shin_l: ['shinL', 0, -0.2, 0.05], shin_r: ['shinR', 0, -0.2, 0.05], foot_l: ['footL', 0, -0.03, 0.07], foot_r: ['footR', 0, -0.03, 0.07],
};
export interface WoundPoint { part: string; pos: THREE.Vector3; rate: number }
export type HeldGrip = 'perp' | 'along' | 'auto' | 'raw';

/** Re-seat an item mesh (e.g. from makeHeldMesh) so it sits in a closed fist. */
function orientHeld(obj: THREE.Object3D, grip: HeldGrip, k: number): THREE.Object3D {
  let src: THREE.Mesh | null = null;
  obj.traverse((o) => { if (!src && (o as THREE.Mesh).isMesh) src = o as THREE.Mesh; });
  const m = src as THREE.Mesh | null;
  if (!m) return obj;
  const geo = m.geometry;
  if (!geo.boundingBox) geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const size = new THREE.Vector3(); bb.getSize(size);
  const L = Math.max(size.x, size.y, size.z);
  const long = size.x >= size.y && size.x >= size.z ? 'x' : size.z >= size.y ? 'z' : 'y';
  if (grip === 'auto') grip = L > 0.22 ? 'perp' : 'small' as HeldGrip;
  // 1. bring the long axis onto +x (handle end at -x)
  const toX = new THREE.Matrix4();
  if (long === 'y') toX.makeRotationZ(-Math.PI / 2);
  else if (long === 'z') toX.makeRotationY(Math.PI / 2);
  const box = bb.clone().applyMatrix4(toX);
  const holder = new THREE.Group();
  const mesh = new THREE.Mesh(geo, m.material);
  mesh.castShadow = true;
  if ((grip as string) === 'small') {
    // small things sit in the palm, centred
    const c = new THREE.Vector3(); bb.getCenter(c);
    mesh.position.copy(c).multiplyScalar(-1);
    holder.add(mesh);
    holder.position.set(0, 0.01, 0.01);
    return holder;
  }
  // 2. grip point: a fifth of the way up from the handle end (a third for short items), mid-height
  const gx = box.min.x + (box.max.x - box.min.x) * (L > 0.3 ? 0.2 : 0.3);
  const gy = (box.min.y + box.max.y) / 2 - (grip === 'along' ? (box.max.y - box.min.y) * 0.25 : 0);
  const gz = (box.min.z + box.max.z) / 2;
  const place = new THREE.Matrix4().makeTranslation(-gx, -gy, -gz).multiply(toX);
  // 3. orient: along the forearm (+x -> -y, top -> +z) or through the fist (+x -> +z, tilted down a little)
  const orient = new THREE.Matrix4();
  if (grip === 'along') orient.makeBasis(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(-1, 0, 0));
  else {
    const d = new THREE.Vector3(0, -0.28, 0.96).normalize();
    const up = new THREE.Vector3(-k, 0, 0);
    const z = new THREE.Vector3().crossVectors(d, up).normalize();
    up.crossVectors(z, d).normalize();
    orient.makeBasis(d, up, z);
  }
  mesh.matrixAutoUpdate = false;
  mesh.matrix.copy(orient).multiply(place);
  holder.add(mesh);
  return holder;
}

/**
 * A survivor: one skinned low-poly mesh (about 2-2.5k triangles, a single
 * draw call) on the classic joint hierarchy, textured from its own pixel-art
 * page. Joints are plain Groups (`j`) posed with Euler angles, so existing
 * poses, held items (`heldR` / `heldL`) and attachments keep working.
 */
export class HumanRig {
  root = new THREE.Group();
  /** body pivot (rotated for lying / swimming poses) */
  body = new THREE.Group();
  j = {} as Record<JointName, THREE.Group>;
  /** all skeleton nodes including finger / eyelid bones */
  bones = {} as Record<BoneName, THREE.Group>;
  /**
   * One stand-in per body segment, parented to its joint. They draw nothing,
   * but clone() bakes that segment of the current body into a standalone mesh
   * (gore uses this to throw survivor gibs). The visible body is `skin`.
   */
  meshes = new Map<string, THREE.Mesh>();
  heldR = new THREE.Group();
  heldL = new THREE.Group();
  backSlot = new THREE.Group();
  app: Appearance;
  outfit: Outfit = {};
  s: number;
  material: THREE.Material;
  /** the rig's own animator (Player uses it; preview rigs too) */
  anim = new HumanAnimator();
  /** names accepted by playEmote */
  readonly emotes: readonly string[] = EMOTES;
  /** triangles in the current body mesh */
  tris = 0;
  /** shader effects: x corruption glitch 0..1, y time, z hit flash 0..1 */
  fx = { value: new THREE.Vector4(0, 0, 0, 0) };
  dims: Dims;
  private mesh: THREE.SkinnedMesh;
  private skeleton: THREE.Skeleton;
  private page = makePageTexture();
  private bakeCache: BakeCache = { key: '', base: [] };
  private geoKey = ''; private texKey = '';
  private sole = 0;
  private seed: number;
  private baseMat: THREE.Material;
  /** stumps, tourniquets and prosthetics hung on the bones (limb loss) */
  private gear: THREE.Mesh[] = [];
  private gearKey = '';
  /** gore is off: stumps are drawn as closed skin, never raw (set by the limb system) */
  static gentle = false;
  /** extra bones for secondary motion (a swinging backpack, hair) — rigs built with { secondary: true } */
  private extra: { pack: THREE.Group; hair: THREE.Group; packY: number } | null = null;
  /** a ragdoll that takes the body over (deaths, knockdowns): see startRagdoll() */
  ragdoll: Ragdoll | null = null;
  /** 0..1 how much of the body the ragdoll drives right now */
  ragW = 0;
  /** what the ragdoll collides with (floor heights, walls); flat ground at the start height when unset */
  ragWorld: RagWorld | null = null;
  private ragRecover = Infinity;
  private flat = { y: 0, ground: (_x: number, _z: number) => this.flat.y };
  /** black silhouette outline for standalone scenes (setOutline) */
  private hull: THREE.SkinnedMesh | null = null;
  private hullMat: THREE.MeshBasicMaterial | null = null;
  private hullRigid: THREE.MeshBasicMaterial | null = null;

  constructor(app: Appearance, material?: THREE.Material, opts: { secondary?: boolean } = {}) {
    this.app = normalizeAppearance(app);
    this.s = this.app.height;
    this.seed = hashApp(this.app);
    this.baseMat = isWorldMat(material) ? material! : worldMaterial({});
    this.material = humanMaterial(this.page.tex, this.baseMat, this.fx);
    this.root.add(this.body);
    for (const b of BONES) { const g = new THREE.Group(); g.name = b; this.bones[b] = g; }
    for (const b of BONES) { const p = BONE_PARENT[b]; (p ? this.bones[p] : this.body).add(this.bones[b]); }
    for (const jn of JOINTS) this.j[jn] = this.bones[jn];
    if (opts.secondary) {
      const pack = new THREE.Group(), hair = new THREE.Group();
      pack.name = 'pack'; hair.name = 'hair';
      this.bones.chest.add(pack); this.bones.head.add(hair);
      this.extra = { pack, hair, packY: 0 };
    }
    this.dims = rigDims(this.app);
    this.placeBones();
    this.j.handR.add(this.heldR);
    this.j.handL.add(this.heldL);
    this.j.chest.add(this.backSlot);
    this.placeAttach();
    const geo = new THREE.BufferGeometry();
    this.mesh = new THREE.SkinnedMesh(geo, this.material);
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1.7);
    this.body.add(this.mesh);
    this.skeleton = this.makeSkeleton();
    this.mesh.bind(this.skeleton, new THREE.Matrix4());
    for (const jn of JOINTS) {
      const proxy = new THREE.Mesh(EMPTY_GEO, this.material);
      proxy.visible = false; proxy.name = 'seg:' + jn;
      (proxy as any).clone = () => this.segmentMesh(jn);
      this.j[jn].add(proxy);
      this.meshes.set(jn, proxy);
    }
    this.setOutfit({});
  }

  /**
   * Draw a black outline round the silhouette (an inverted hull that follows
   * the skin, plus the rigid pieces hung on the bones). For scenes that do not
   * run the world renderer's edge pass: menus, the operating table,
   * cutscenes. px is the width in render-target pixels; false removes it.
   */
  setOutline(px: number | false = 1) {
    if (px === false || px <= 0) {
      if (this.hull) { this.hull.removeFromParent(); this.hull = null; }
      this.body.traverse((o) => { if ((o as any).userData?.isHull) o.visible = false; });
      return;
    }
    if (!this.hullMat) { this.hullMat = outlineMaterial(px); this.hullRigid = outlineMaterial(px); }
    (this.hullMat as any).userData.px = px; (this.hullRigid as any).userData.px = px;
    if (!this.hull) {
      const h = new THREE.SkinnedMesh(this.mesh.geometry, this.hullMat);
      h.name = 'outline'; h.userData.isHull = true;
      h.frustumCulled = false; h.castShadow = false; h.receiveShadow = false;
      h.bind(this.skeleton, new THREE.Matrix4());
      outlineSize(h, this.hullMat);
      this.body.add(h);
      this.hull = h;
    }
    this.refreshOutlines();
  }
  get outlined() { return !!this.hull; }

  /** give every rigid piece on the bones (cosmetics, stumps, cyberware) an outline child */
  private refreshOutlines() {
    const mat = this.hullRigid;
    if (!this.hull || !mat) return;
    const add: THREE.Mesh[] = [];
    this.body.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || (m as THREE.SkinnedMesh).isSkinnedMesh || m.userData.isHull || m.userData.hull || !m.visible) return;
      if (!/^(cosmetic:|limbgear|cybergear)/.test(m.name)) return;
      if ((m.material as THREE.Material & { isMeshBasicMaterial?: boolean }).isMeshBasicMaterial) return;
      add.push(m);
    });
    for (const m of add) {
      const h = new THREE.Mesh(m.geometry, mat);
      h.userData.isHull = true; h.name = 'outline';
      outlineSize(h, mat);
      m.add(h); m.userData.hull = h;
    }
  }

  /** the visible skinned body mesh */
  get skin(): THREE.SkinnedMesh { return this.mesh; }

  /** a static mesh of one body segment (bind pose, joint-local), e.g. for gibs */
  segmentMesh(jn: JointName): THREE.Mesh {
    const g = this.mesh.geometry;
    const P = g.getAttribute('position'), SI = g.getAttribute('skinIndex'), SW = g.getAttribute('skinWeight'), I = g.getIndex();
    const owner = (b: number): JointName => { if (b >= BONES.length) return b === BONES.length ? 'chest' : 'head'; let n = BONES[b] as BoneName; while (n && !(JOINTS as string[]).includes(n)) n = BONE_PARENT[n] as BoneName; return (n || 'chest') as JointName; };
    const dom = (v: number) => { let best = 0, bw = -1; for (let k = 0; k < 4; k++) { const w = SW.getComponent(v, k); if (w > bw) { bw = w; best = SI.getComponent(v, k); } } return owner(best); };
    const keep: number[] = [];
    if (I) for (let t = 0; t < I.count; t += 3) { const a = I.getX(t); if (dom(a) === jn && dom(I.getX(t + 1)) === jn) keep.push(I.getX(t), I.getX(t + 1), I.getX(t + 2)); }
    const r = this.dims.rest[jn];
    const geo = new THREE.BufferGeometry();
    const map = new Map<number, number>();
    const attrs: Record<string, number[]> = { position: [], normal: [], uv: [], color: [], aAtlas: [], aFx: [] };
    const idx: number[] = [];
    for (const v of keep) {
      let ni = map.get(v);
      if (ni === undefined) {
        ni = map.size; map.set(v, ni);
        for (const name of Object.keys(attrs)) {
          const at = g.getAttribute(name); if (!at) continue;
          for (let c = 0; c < at.itemSize; c++) attrs[name].push(at.getComponent(v, c) - (name === 'position' ? r[c] : 0));
        }
      }
      idx.push(ni);
    }
    for (const [name, arr] of Object.entries(attrs)) { const at = g.getAttribute(name); if (at) geo.setAttribute(name, new THREE.Float32BufferAttribute(arr, at.itemSize)); }
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, this.material);
    m.castShadow = true;
    return m;
  }

  private placeBones() {
    for (const b of BONES) { const o = this.dims.off[b]; this.bones[b].position.set(o[0], o[1], o[2]); }
  }
  private placeAttach() {
    const s = this.s;
    this.heldR.position.set(0.008 * s, -0.078 * s, 0.006 * s);
    this.heldL.position.set(-0.008 * s, -0.078 * s, 0.006 * s);
    this.backSlot.position.set(0, 0.1 * s, -0.14 * s * (this.dims.mass));
  }
  private makeSkeleton() {
    // bind pose: bones are pure translations from the body origin
    const inv = BONES.map((b) => { const r = this.dims.rest[b]; return new THREE.Matrix4().makeTranslation(-r[0], -r[1], -r[2]); });
    const bones = BONES.map((b) => this.bones[b]) as THREE.Object3D[];
    if (this.extra) {
      // pivots: the top of the backpack (moved to the real bag on each rebuild), the back of the skull
      const d = this.dims, s = d.s, c = d.rest.chest, h = d.rest.head;
      const pk = [0, 1.42 * s, -0.14 * s], hp = [0, h[1] + 0.03 * s, h[2] - 0.05 * s];
      this.extra.pack.position.set(pk[0] - c[0], pk[1] - c[1], pk[2] - c[2]); this.extra.packY = pk[1] - c[1];
      this.extra.hair.position.set(hp[0] - h[0], hp[1] - h[1], hp[2] - h[2]);
      bones.push(this.extra.pack, this.extra.hair);
      inv.push(new THREE.Matrix4().makeTranslation(-pk[0], -pk[1], -pk[2]), new THREE.Matrix4().makeTranslation(-hp[0], -hp[1], -hp[2]));
    }
    return new THREE.Skeleton(bones as unknown as THREE.Bone[], inv);
  }

  /** secondary bones: the bag (not its straps) rides the pack bone; hanging hair shares the head's weight with the hair bone */
  private reweightSecondary(g: THREE.BufferGeometry) {
    const E = this.extra; if (!E) return;
    const uv = g.getAttribute('uv'), P = g.getAttribute('position'), SI = g.getAttribute('skinIndex'), SW = g.getAttribute('skinWeight');
    if (!uv || !P || !SI || !SW) return;
    const iPack = BONES.length, iHair = BONES.length + 1, iHead = BI.head;
    const pk = REG.PACK, hr = REG.HAIR, d = this.dims;
    const headY = d.rest.head[1], hs = d.s * d.headS;
    let topY = -1e9, frontZ = -1e9, n = 0;
    for (let v = 0; v < uv.count; v++) {
      const px = uv.getX(v) * PAGE, py = (1 - uv.getY(v)) * PAGE;
      if (px >= pk.x - 0.5 && px <= pk.x + pk.w + 0.5 && py >= pk.y - 0.5 && py <= pk.y + pk.h + 0.5) {
        const fu = (px - pk.x) / pk.w, fv = (py - pk.y) / pk.h;
        if (fu > 0.6 && fv > 0.72) continue; // shoulder straps stay on the chest
        SI.setXYZW(v, iPack, 0, 0, 0); SW.setXYZW(v, 1, 0, 0, 0);
        topY = Math.max(topY, P.getY(v)); frontZ = Math.max(frontZ, P.getZ(v)); n++;
      } else if (px >= hr.x - 0.5 && px <= hr.x + hr.w + 0.5 && py >= hr.y - 0.5 && py <= hr.y + hr.h + 0.5) {
        const ly = (P.getY(v) - headY) / hs;
        const t = clampN((0.07 - ly) / 0.22, 0, 1) * 0.85;
        if (t <= 0.01) continue;
        let hk = -1, free = -1;
        for (let k = 0; k < 4; k++) { const b = SI.getComponent(v, k), w = SW.getComponent(v, k); if (b === iHead && w > 0) hk = k; else if (w <= 0 && free < 0) free = k; }
        if (hk < 0 || free < 0) continue;
        const w = SW.getComponent(v, hk);
        SW.setComponent(v, hk, w * (1 - t)); SI.setComponent(v, free, iHair); SW.setComponent(v, free, w * t);
      }
    }
    SI.needsUpdate = true; SW.needsUpdate = true;
    if (n) {
      // hinge the bag at its top, against the wearer's back
      const c = d.rest.chest, py = topY - 0.025 * d.s, pz = frontZ - 0.01;
      E.pack.position.set(-c[0], py - c[1], pz - c[2]); E.packY = py - c[1];
      this.skeleton.boneInverses[iPack].makeTranslation(0, -py, -pz);
    }
  }

  /** Change the body / face (rebuilds the mesh and texture). */
  setAppearance(app: Appearance) {
    this.app = normalizeAppearance(app);
    this.s = this.app.height;
    this.seed = hashApp(this.app);
    this.dims = rigDims(this.app);
    this.placeBones();
    this.placeAttach();
    this.skeleton.dispose();
    this.skeleton = this.makeSkeleton();
    this.mesh.bind(this.skeleton, new THREE.Matrix4());
    this.hull?.bind(this.skeleton, new THREE.Matrix4());
    this.geoKey = ''; this.texKey = '';
    this.setOutfit(this.outfit);
  }

  /** Rebuild the body for an outfit (cheap when nothing visible changed). */
  setOutfit(o: Outfit) {
    this.outfit = o || {};
    const full = cosmeticOutfit(withDefaults(this.outfit), this.app);
    const sh = outfitShape(full);
    const cond = this.outfit.cond || {};
    const appKey = JSON.stringify(this.app);
    const gk = appKey + JSON.stringify(sh) + (cond.splint || []).join(',') + (full.wrist ? '|w' : '') + (cond.sev?.length ? '|s:' + cond.sev.join(',') : '') + (cond.cyber ? '|c:' + coveredParts(cond.cyber).join(',') : '');
    const { cond: _c, ...looks } = full;
    void _c;
    const tk = appKey + JSON.stringify(looks) + JSON.stringify({ ...cond, bleeding: undefined, stump: undefined, prost: undefined, sev: undefined, cyber: undefined });
    if (gk !== this.geoKey) {
      this.geoKey = gk;
      const res = buildBody(this.app, full, sh, this.dims, { splints: new Set(cond.splint || []), bandages: new Set(Object.keys(cond.bandage || {})), severed: new Set([...(cond.sev || []), ...coveredParts(cond.cyber)]) });
      const old = this.mesh.geometry;
      this.mesh.geometry = res.geometry;
      if (this.hull) this.hull.geometry = res.geometry;
      old.dispose();
      this.tris = res.tris;
      this.sole = sh.sole;
      if (this.extra) this.reweightSecondary(res.geometry);
      this.anim.dims = legDimsFrom(this.dims, this.sole);
      this.backSlot.position.z = -(0.14 + (sh.back ? 0.16 * sh.back : 0)) * this.s * this.dims.mass;
    }
    if (tk !== this.texKey) {
      this.texKey = tk;
      bakePage({ app: this.app, outfit: full, shape: sh, cond, seed: this.seed }, this.page.data, this.bakeCache);
      this.page.tex.needsUpdate = true;
    }
    this.updateGear(cond, sh);
    syncCosmetics(this, full, this.baseMat);
    if (this.hull) this.refreshOutlines();
  }

  /** limb loss: a cap on every stump (raw, seared, stitched, bandaged, healed; a tourniquet), and the prosthetics */
  private updateGear(cond: RigCondition, sh: ReturnType<typeof outfitShape>) {
    const sev = cond.sev || [];
    const stumpKey = (st: StumpCond | undefined) => st ? st.s + (st.tq ? '+tq' : '') : 'healed';
    const key = sev.length || cond.cyber ? JSON.stringify([cond.cyber, sev, Object.entries(cond.stump || {}).map(([k, v]) => k + ':' + stumpKey(v)), cond.prost, this.app.skin, this.s, this.app.build, sh.sleeve, sh.legKind, HumanRig.gentle]) : '';
    if (key === this.gearKey) return;
    this.gearKey = key;
    for (const m of this.gear) m.removeFromParent();
    this.gear.length = 0;
    // cyberware: every piece rides its bone
    for (const pc of cyberPieces(cond.cyber, this.dims)) {
      const m = new THREE.Mesh(pc.geo, this.baseMat);
      m.castShadow = true; m.name = 'cybergear';
      this.bones[pc.bone].add(m);
      this.gear.push(m);
    }
    if (!sev.length) return;
    const skin = this.app.skin;
    const q = (r: number) => Math.round(r * 200) / 200;
    for (const cut of cutParts(sev)) {
      const spec = cutSpec(cut, this.dims, sh);
      if (!spec) continue;
      const ch = chainOf(cut)!;
      const pk = cond.prost?.[`${ch.kind}_${ch.side}`];
      const pd = pk ? PROSTHETICS[pk] : null;
      const level = 3 - ch.idx;
      const fits = !!pd && level <= pd.maxLevel;
      const st = cond.stump?.[cut];
      let look = st?.s ?? 'healed';
      if (HumanRig.gentle && (look === 'raw' || look === 'caut')) look = 'clean';
      const r = q(spec.r);
      const add = (geo: THREE.BufferGeometry, bone: BoneName, pos: [number, number, number]) => {
        const m = new THREE.Mesh(geo, this.baseMat);
        m.castShadow = true; m.position.set(pos[0], pos[1], pos[2]);
        m.name = 'limbgear';
        this.bones[bone].add(m);
        this.gear.push(m);
      };
      // the stump itself (hidden inside a prosthetic socket, unless it is bandaged)
      if (!fits || look === 'band' || look === 'bandb') add(gearGeo(`st:${look}:${st?.tq ? 1 : 0}:${r}:${skin}`, (mb) => stumpModel(mb, r, look as any, !!st?.tq, skin)), spec.bone, spec.pos);
      if (!fits || !pd) continue;
      const s = this.s;
      if (pd.kind === 'peg') {
        // to the floor: from the cut down (ankle cut: the rest of the shin and the foot; knee cut: the whole shin and the foot)
        const len = (cut.startsWith('foot') ? 0.42 - 0.37 + 0.07 : 0.43 + 0.42 - 0.42 + 0.07) * s + 0.02;
        add(gearGeo(`peg:${r}:${q(len)}`, (mb) => pegModel(mb, r, len)), spec.bone, spec.pos);
      } else if (pd.kind === 'leg') {
        if (cut.startsWith('foot')) add(gearGeo(`pl:f:${r}`, (mb) => prostLegModel(mb, r, 0, false)), spec.bone, spec.pos);
        else {
          // above the knee the socket rides the thigh (which still swings); below, it caps the knee stump
          const above = cut.startsWith('thigh');
          const lenToKnee = above ? 0.34 * s : 0.02;
          add(gearGeo(`pl:s:${r}:${q(lenToKnee)}`, (mb) => prostLegModel(mb, r, lenToKnee, false)), above ? ('thigh' + spec.side) as BoneName : spec.bone, above ? [0, -0.07 * s, 0] : spec.pos);
          // the shin pylon hangs off the knee and bends with it
          const sb = ('shin' + spec.side) as BoneName;
          add(gearGeo(`pl:p:${q(s)}`, (mb) => { mb.cylinder(0, -0.36 * s, 0, 0.016, 0.36 * s, 6, { sides: 'i_steel', top: 'i_steel', bottom: 'i_steel' }, { fit: true }); mb.cylinder(0, -0.04 * s, 0, 0.034, 0.05, 7, 'i_carbon', { fit: true }); }), sb, [0, 0, 0]);
        }
        add(gearGeo(`pl:foot`, (mb) => footShell(mb, 0)), ('foot' + spec.side) as BoneName, [0, 0, 0]);
      } else if (pd.kind === 'hook') add(gearGeo(`hook:${r}:${cut.startsWith('farm') ? 1 : 0}`, (mb) => hookModel(mb, r, cut.startsWith('farm'))), spec.bone, spec.pos);
      else if (pd.kind === 'hand') add(gearGeo(`ph:${r}:${cut.startsWith('farm') ? 1 : 0}`, (mb) => prostHandModel(mb, r, cut.startsWith('farm'))), spec.bone, spec.pos);
    }
  }

  /** Update only the visible condition (blood, bandages, wet...). */
  setCondition(c: RigCondition | undefined) { this.setOutfit({ ...this.outfit, cond: c }); }

  /**
   * Place an item mesh in a hand (null clears). Item models follow the usual
   * convention (handle toward -x, business end toward +x). grip:
   * 'perp' = through the fist out of the thumb side (bats, axes, tools, knives),
   * 'along' = pointing along the forearm (guns, flashlights), 'auto' picks by
   * size, 'raw' attaches the mesh untouched.
   */
  hold(side: 'R' | 'L', mesh: THREE.Object3D | null, grip: HeldGrip = 'auto') {
    const g = side === 'R' ? this.heldR : this.heldL;
    g.clear();
    if (!mesh) return;
    g.add(grip === 'raw' ? mesh : orientHeld(mesh, grip, side === 'R' ? -1 : 1));
  }

  setVisible(v: boolean) { this.root.visible = v; }

  /** Apply a pose (Euler angles per joint, radians) */
  applyPose(p: Pose) {
    for (const k of JOINTS) {
      const r = p[k];
      const g = this.j[k];
      if (r) g.rotation.set(r[0], r[1], r[2]); else g.rotation.set(0, 0, 0);
    }
    this.j.hips.position.set(p.rootX ?? 0, this.dims.hipY + this.sole + (p.rootY ?? 0), p.rootZ ?? 0);
    this.body.rotation.set(p.bodyPitch ?? 0, p.bodyYaw ?? 0, p.bodyRoll ?? 0);
    this.body.position.y = p.bodyY ?? 0;
    // fingers curl into a fist around the grip; eyelids close for blinks / sleep
    for (const [side, k] of [['L', 1], ['R', -1]] as const) {
      const g = clampN((side === 'L' ? p.gripL : p.gripR) ?? 0.3, 0, 1);
      this.bones[('fing1' + side) as BoneName].rotation.set(0, 0, -k * g * 1.45);
      this.bones[('fing2' + side) as BoneName].rotation.set(0, 0, -k * g * 1.6);
      this.bones[('thumb' + side) as BoneName].rotation.set(g * 0.5, k * g * 0.6, -k * g * 0.55);
    }
    this.bones.lids.scale.set(1, Math.max(0.02, p.blink ?? 0), 1);
    const E = this.extra;
    if (E) {
      const a = p.pack, h = p.hair;
      if (a) E.pack.rotation.set(a[0], a[1], a[2]); else E.pack.rotation.set(0, 0, 0);
      E.pack.position.y = E.packY + (p.packY ?? 0);
      if (h) E.hair.rotation.set(h[0], h[1], h[2]); else E.hair.rotation.set(0, 0, 0);
    }
  }

  /** Animate with the rig's own animator and apply the pose. */
  animate(dt: number, input: AnimInput) {
    const pose = this.anim.update(dt, input);
    this.fx.value.y += dt;
    this.applyPose(pose);
    if (this.hull) { this.hull.layers.mask = this.mesh.layers.mask; this.hull.visible = this.mesh.visible; }
    if (this.ragdoll?.active) this.driveRagdoll(dt);
    return pose;
  }

  /**
   * Hand the body to a ragdoll, starting from the current pose. vel: the
   * body's world velocity; imp: extra world velocity for the struck part;
   * recoverAfter: seconds before it blends back into the animation (deaths
   * pass Infinity and stay down).
   */
  startRagdoll(vel: THREE.Vector3, imp: THREE.Vector3, part = '', recoverAfter = Infinity) {
    if (!this.ragdoll) this.ragdoll = new Ragdoll();
    this.root.updateMatrixWorld(true);
    this.flat.y = this.root.getWorldPosition(_rv).y;
    this.ragdoll.start(this.bones, this.dims, vel, imp, part);
    this.ragW = 1; this.ragRecover = recoverAfter;
  }
  /** back to pure animation at once (revived, respawned) */
  stopRagdoll() { this.ragdoll?.stop(); this.ragW = 0; this.ragRecover = Infinity; this.anim.resetFeet(); }
  get ragdolling() { return !!this.ragdoll?.active; }

  private driveRagdoll(dt: number) {
    const R = this.ragdoll!;
    R.step(dt, this.ragWorld ?? this.flat);
    if (R.t > this.ragRecover) {
      this.ragW = Math.max(0, this.ragW - dt / 0.65);
      if (this.ragW <= 0) { R.stop(); this.ragRecover = Infinity; this.anim.resetFeet(); return; }
    }
    this.root.updateWorldMatrix(true, false);
    R.solve(this.root.matrixWorld);
    const w = this.ragW;
    for (const jn of JOINTS) { const b = this.j[jn]; if (w >= 0.999) b.quaternion.copy(R.q[jn]); else b.quaternion.slerp(R.q[jn], w); }
    this.j.hips.position.lerp(R.hips, w);
    if (w >= 0.999) { this.body.rotation.set(0, 0, 0); this.body.position.y = 0; }
    else { this.body.quaternion.slerp(_rq.identity(), w); this.body.position.y *= 1 - w; }
  }

  /** a blow: (dx, dz) the WORLD direction it pushes the body, part an item body-part key, strength 0..1.5 */
  hit(dx: number, dz: number, part: string, strength: number) {
    const th = this.root.rotation.y, c = Math.cos(th), s = Math.sin(th);
    this.anim.hit(c * dx - s * dz, s * dx + c * dz, part, strength);
  }

  /**
   * Self-driven animation (previews, menus, cutscenes): idle with fidgets,
   * blinking and emotes. Pass AnimInput fields to walk / act / pose; a Pose
   * argument (from another animator) is ignored. Holding is detected from
   * what is attached to heldR / heldL.
   */
  update(dt: number, input?: Partial<AnimInput> | Pose) {
    const isInput = !!input && ('speed' in input || 'stance' in input || 'action' in input || 'full' in input || 'panic' in input);
    const inp: AnimInput = {
      speed: 0, stance: 'stand', full: '', action: '', actionT: 0, actionDur: 1, twoHanded: false, limp: 0, tired: 0, panic: 0, cold: 0,
      aimPitch: 0, holdingLight: false, holding: this.heldR.children.length > 0, heldL: this.heldL.children.length > 0, lookYaw: 0, fidget: true,
      ...(isInput ? (input as Partial<AnimInput>) : {}),
    };
    if (inp.action && !(isInput && 'actionT' in (input as object))) { this.selfT += dt; inp.actionT = this.selfT % (inp.actionDur || 1); }
    return this.animate(dt, inp);
  }
  private selfT = 0;

  /** Play an emote by name (see `emotes`); returns false for unknown names. Looping emotes stop when the character moves or acts. */
  playEmote(name: string, loop?: boolean) { return this.anim.playEmote(name, loop); }
  stopEmote() { this.anim.stopEmote(); }

  /** World positions of actively bleeding body parts (from outfit.cond.bleeding). */
  woundPoints(out: WoundPoint[] = []): WoundPoint[] {
    out.length = 0;
    const b = this.outfit.cond?.bleeding;
    if (!b) return out;
    let updated = false;
    const sev = this.outfit.cond?.sev;
    for (const [part, rate] of Object.entries(b)) {
      const at = WOUND_AT[part]; if (!at || !rate) continue;
      if (!updated) { this.root.updateMatrixWorld(true); updated = true; }
      const s = this.s;
      // a stump bleeds from the cut, not from where the missing part used to hang
      const cs = sev?.includes(part) ? cutSpec(part, this.dims) : null;
      const pos = cs ? new THREE.Vector3(cs.pos[0], cs.pos[1], cs.pos[2]).applyMatrix4(this.bones[cs.bone].matrixWorld)
        : new THREE.Vector3(at[1] * s, at[2] * s, at[3] * s).applyMatrix4(this.bones[at[0]].matrixWorld);
      out.push({ part, pos, rate });
    }
    return out;
  }

  /** world position of a joint */
  jointWorld(name: JointName, out = new THREE.Vector3()) { this.root.updateMatrixWorld(true); return this.j[name].getWorldPosition(out); }

  dispose() {
    this.mesh.geometry.dispose();
    this.page.tex.dispose();
    this.material.dispose();
    this.skeleton.dispose();
    this.hullMat?.dispose(); this.hullRigid?.dispose();
  }
}

export type Pose = Partial<Record<JointName, [number, number, number]>> & {
  rootY?: number; rootZ?: number; rootX?: number; bodyPitch?: number; bodyRoll?: number; bodyYaw?: number; bodyY?: number;
  /** 0 open hand .. 1 fist */
  gripL?: number; gripR?: number;
  /** 0 eyes open .. 1 closed */
  blink?: number;
  /** secondary motion (rigs built with secondary bones): backpack swing (pitch, yaw, roll) and bounce, hair swing */
  pack?: [number, number, number]; packY?: number;
  hair?: [number, number, number];
};

/** visible defaults: underwear when nothing is worn */
function withDefaults(o: Outfit): Outfit {
  const f: Outfit = { ...o };
  if (!f.torso && !f.torsoOuter) f.torso = { tex: 'c_underwear', color: 0xd8d4c8, sleeve: 'none' };
  if (!f.legs) f.legs = { tex: 'c_underwear', color: 0xd8d4c8 };
  return f;
}
function hashApp(a: Appearance) { const s = JSON.stringify(a); let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) % 100000; }

export function randomAppearance(rnd: () => number): Appearance {
  const fem = rnd() < 0.5;
  const bodyShape = fem ? 0.72 + rnd() * 0.28 : rnd() * 0.3;
  const styles: HairStyle[] = fem ? ['long', 'ponytail', 'bob', 'curly', 'short', 'long', 'bob', 'buzz'] : ['short', 'buzz', 'curly', 'short', 'bald', 'long', 'ponytail', 'short'];
  const fhRoll = rnd();
  const facialHair: FacialHair = fem ? 'none' : fhRoll < 0.18 ? 'beard' : fhRoll < 0.32 ? 'stubble' : fhRoll < 0.4 ? 'moustache' : fhRoll < 0.46 ? 'goatee' : 'none';
  return {
    skin: SKIN_TONES[Math.floor(rnd() * SKIN_TONES.length)],
    hair: HAIR_COLORS[Math.floor(rnd() * HAIR_COLORS.length)],
    hairStyle: styles[Math.floor(rnd() * styles.length)],
    face: Math.floor(rnd() * FACE_VARIANTS),
    build: (['slim', 'average', 'broad'] as const)[Math.floor(rnd() * 3)],
    height: fem ? 0.94 + rnd() * 0.08 : 0.97 + rnd() * 0.09,
    beard: facialHair === 'beard',
    bodyShape: Math.round(bodyShape * 100) / 100,
    eyeColor: EYE_COLORS[Math.floor(rnd() * EYE_COLORS.length)],
    facialHair,
    freckles: rnd() < 0.15 ? Math.round((0.3 + rnd() * 0.6) * 100) / 100 : 0,
    scars: rnd() < 0.1 ? 1 + Math.floor(rnd() * 2) : 0,
    age: Math.round(rnd() * rnd() * 70) / 100,
  };
}

// ------------------------------------------------------------------ standalone preview
/**
 * A rig that works outside a running game (character creator, menus). It is
 * an ordinary HumanRig whose material ignores the zone light grid, the
 * visibility mask and the fog, so it is lit only by ordinary three.js lights:
 * add `rig.root` to any THREE.Scene with e.g. an AmbientLight / HemisphereLight
 * (~0.8-1.2) plus a DirectionalLight key (~1.5-2), call `rig.update(dt)` every
 * frame (idle breathing, fidgets, blinking, emotes via `rig.playEmote(name)`),
 * and `rig.dispose()` when done.
 */
export function createPreviewRig(app: Appearance, outfit: Outfit = {}, opts: { outline?: number | false } = {}): HumanRig {
  const rig = new HumanRig(app, worldMaterial({ noVis: true, noFog: true, noGrid: true }), { secondary: true });
  rig.setOutfit(outfit);
  // standalone scenes have no edge pass of their own: the rig brings its black outline
  rig.setOutline(opts.outline ?? 1);
  return rig;
}
