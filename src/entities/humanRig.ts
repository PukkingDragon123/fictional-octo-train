import * as THREE from 'three';
import { worldMaterial } from '../gfx/materials';
import { BONES, BoneName, BONE_PARENT, Dims, rigDims, buildBody } from './humanModel';
import { bakePage, makePageTexture, EYE_COLORS, BakeCache } from './humanPaint';
import { outfitShape } from './humanClothes';
import { HumanAnimator, AnimInput, EMOTES } from './humanAnim';
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
    skin: a.skin ?? SKIN_TONES[1], hair: a.hair ?? HAIR_COLORS[1], hairStyle: a.hairStyle ?? 'short', face: ((a.face ?? 0) % FACE_VARIANTS + FACE_VARIANTS) % FACE_VARIANTS,
    build: a.build ?? 'average', height: clampN(a.height ?? 1, 0.9, 1.1), beard: fh === 'beard',
    bodyShape: clampN(a.bodyShape ?? 0.3, 0, 1), eyeColor: a.eyeColor, facialHair: fh, freckles: clampN(a.freckles ?? (a.face === 3 ? 0.5 : 0), 0, 1),
    scars: Math.round(clampN(a.scars ?? 0, 0, 3)), age: clampN(a.age ?? 0, 0, 1),
  };
}
const clampN = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

// ------------------------------------------------------------------ material
let warnedMap = false;
function humanMaterial(map: THREE.Texture, base: THREE.Material, uHuman: { value: THREE.Vector4 }): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ map, vertexColors: true });
  const b = base as any;
  m.onBeforeCompile = (shader, renderer) => {
    b.onBeforeCompile?.(shader, renderer);
    shader.uniforms.uHuman = uHuman;
    let vs = shader.vertexShader, fs = shader.fragmentShader;
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
  m.customProgramCacheKey = () => key + '|human1';
  return m;
}
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

  constructor(app: Appearance, material?: THREE.Material) {
    this.app = normalizeAppearance(app);
    this.s = this.app.height;
    this.seed = hashApp(this.app);
    this.baseMat = isWorldMat(material) ? material! : worldMaterial({});
    this.material = humanMaterial(this.page.tex, this.baseMat, this.fx);
    this.root.add(this.body);
    for (const b of BONES) { const g = new THREE.Group(); g.name = b; this.bones[b] = g; }
    for (const b of BONES) { const p = BONE_PARENT[b]; (p ? this.bones[p] : this.body).add(this.bones[b]); }
    for (const jn of JOINTS) this.j[jn] = this.bones[jn];
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
    this.meshes.set('body', this.mesh);
    this.setOutfit({});
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
    return new THREE.Skeleton(BONES.map((b) => this.bones[b]) as unknown as THREE.Bone[], inv);
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
    this.geoKey = ''; this.texKey = '';
    this.setOutfit(this.outfit);
  }

  /** Rebuild the body for an outfit (cheap when nothing visible changed). */
  setOutfit(o: Outfit) {
    this.outfit = o || {};
    const full = withDefaults(this.outfit);
    const sh = outfitShape(full);
    const cond = this.outfit.cond || {};
    const appKey = JSON.stringify(this.app);
    const gk = appKey + JSON.stringify(sh) + (cond.splint || []).join(',');
    const { cond: _c, ...looks } = full;
    void _c;
    const tk = appKey + JSON.stringify(looks) + JSON.stringify({ ...cond, bleeding: undefined });
    if (gk !== this.geoKey) {
      this.geoKey = gk;
      const res = buildBody(this.app, full, sh, this.dims, { splints: new Set(cond.splint || []), bandages: new Set(Object.keys(cond.bandage || {})) });
      const old = this.mesh.geometry;
      this.mesh.geometry = res.geometry;
      old.dispose();
      this.tris = res.tris;
      this.sole = sh.sole;
      this.backSlot.position.z = -(0.14 + (sh.back ? 0.16 * sh.back : 0)) * this.s * this.dims.mass;
    }
    if (tk !== this.texKey) {
      this.texKey = tk;
      bakePage({ app: this.app, outfit: full, shape: sh, cond, seed: this.seed }, this.page.data, this.bakeCache);
      this.page.tex.needsUpdate = true;
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
  }

  /** Animate with the rig's own animator and apply the pose. */
  animate(dt: number, input: AnimInput) {
    const pose = this.anim.update(dt, input);
    this.fx.value.y += dt;
    this.applyPose(pose);
    return pose;
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
    for (const [part, rate] of Object.entries(b)) {
      const at = WOUND_AT[part]; if (!at || !rate) continue;
      if (!updated) { this.root.updateMatrixWorld(true); updated = true; }
      const s = this.s;
      const pos = new THREE.Vector3(at[1] * s, at[2] * s, at[3] * s).applyMatrix4(this.bones[at[0]].matrixWorld);
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
    this.meshes.clear();
  }
}

export type Pose = Partial<Record<JointName, [number, number, number]>> & {
  rootY?: number; rootZ?: number; rootX?: number; bodyPitch?: number; bodyRoll?: number; bodyYaw?: number; bodyY?: number;
  /** 0 open hand .. 1 fist */
  gripL?: number; gripR?: number;
  /** 0 eyes open .. 1 closed */
  blink?: number;
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
export function createPreviewRig(app: Appearance, outfit: Outfit = {}): HumanRig {
  const rig = new HumanRig(app, worldMaterial({ noVis: true, noFog: true, noGrid: true }));
  rig.setOutfit(outfit);
  return rig;
}
