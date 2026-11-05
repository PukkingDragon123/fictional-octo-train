// THE SUBJECT ROOM. One small three.js scene behind the title and the
// creator, rendered at low resolution into a half-float target and drawn to a
// canvas that CSS enlarges by a whole number with hard pixels (no blur, no
// depth of field): a black one-pixel silhouette line, a filmic grade, light
// dither (scene/post.ts). Every prop is a faceted low-poly model on pixel-art
// textures (roomParts.ts, roomKit.ts, scene/).
//  · TITLE    a man strapped into an electric chair under a swinging caged
//             lamp, the Meridian crew at work; the camera pushes in slowly
//             from the whole room to his face. Every few seconds a surge.
//  · CREATOR  the breaker is thrown, the tubes stutter on and the operating
//             lamp comes up; the arms come out of the walls, unbuckle him,
//             lift him out of the chair and hold him in mid-air. A tool arm
//             (saw, scalpel, laser, stamp, clipper, spray, injector, clamp,
//             welder) works on whatever is being edited while a scanner arm
//             sweeps it. The arms are physical (scene/arms.ts): springy joints
//             with inertia and overshoot, swinging hoses, tools that press into
//             him and recoil, his body swaying on its chains.
//  · PRESS    the ceiling press drops on him and the arms fetch a clone.
// The menus are 2D (title.ts, intake.ts) and drive it.
//
// CAMERA API
//   shot(name, ms = 900): Promise<void>   ease to a framing over ms (0 = cut)
//       'title'    the whole room, pushing in slowly to the prisoner's face
//       'prisoner' straight to a close-up of the seated prisoner's face
//       creator: 'full' (whole body) 'body' (torso) 'feet' 'press' and the
//       part close-ups 'face' 'eyes' 'nose' 'mouth' 'hair' 'beard' 'brows'
//       'ears' 'marks' 'skin' (scene/anchors.ts SHOTS)
//   setFraming(dx, dy?)  where the subject sits on screen (-1..1, +x right,
//       +y up; null = automatic). lightsOn()/lightsOff() reset it.
//   scene / camera       the three.js scene and the camera showing it
// OPERATING API (the creator's mini-games drive these)
//   useTool(kind | null, anchor?)  the tool arm takes up a tool and waits by an anchor
//   toolWork(0..1) toolRun(0..1) toolPress(0..1) toolAim(x, y) toolAnchor(name)
//   toolStrike(q) toolMishap() toolFlourish() scan(on, anchor?) setPaint(c)
//   project(v) anchorScreen(name) pathScreen(name)  screen positions (client px)
// The old 3D menu calls are kept as no-ops so callers still compile.
import * as THREE from 'three';
import type { Appearance, Outfit, Pose, HumanRig } from '../../entities/humanRig';
import { createPreviewRig } from '../../entities/humanRig';
import { REG, PAD, PAGE } from '../../entities/humanModel';
import type { RegKey } from '../../entities/humanModel';
import { cosmeticGeometry } from '../../entities/cosmetics3d';
import { COSMETIC } from '../../game/cosmetics';
import { U, worldMaterial } from '../../gfx/materials';
import { blendPose } from './emotes';
import { PART_REGIONS, type PartKey } from './preview3d';
import { gfxSettings } from './common';
import { sfx, loopSfx, type LoopSfx, type LoopKind } from './sfx';
import { calm } from './settings';
import { facetMats, disposeFacetMats, type FMats } from './scene/pixtex';
import { makePost, LensBlood } from './scene/post';
import { Dust, shaftMesh, Puffs, Arcs, Cable, Chain, Sweat, catchlights, leakCards } from './scene/fx';
import { PhosphorScreen } from './scene/screen';
import { Staff } from './scene/staff';
import { PhysArm, Rope } from './scene/arms';
import { Bits, Bit } from './scene/bits';
import { buildTool, animateTool, type ToolKind, type ToolModel } from './scene/tools3d';
import { ANCHORS, PATHS, SHOTS, type AnchorBone } from './scene/anchors';
import { armSegment, armBase, clawPalm, clawFinger, pressModel, shutterModel, chairModel, capModel, strapModel, bulbModel, leverModel, gem, prism, FacetBuilder, surgLampModel, surgArmModel } from './roomParts';
import { ROOM, SPOT, roomModel, fixtureTubes, monitorModel, canvasTex, bloodCanvas } from './roomKit';

export type { PartKey, ToolKind };
export type MenuKind = 'sign' | 'gear' | 'phone' | 'tape' | 'card' | 'key';
export interface MenuItem { key: string; label: string; sub?: string; kind?: MenuKind; primary?: boolean; color?: number }
/** how far the work lights stay up behind the title menu (0 = the old black cell) */
const TITLE_LIGHT = 0.58;

export type ShotName = 'title' | 'prisoner' | 'face' | 'body' | 'full' | 'feet' | 'press' | 'eyes' | 'nose' | 'mouth' | 'hair' | 'beard' | 'brows' | 'ears' | 'marks' | 'skin';

const REGION_PART: [RegKey, PartKey][] = (Object.entries(PART_REGIONS) as [PartKey, RegKey[]][]).flatMap(([p, rs]) => rs.map((r) => [r, p] as [RegKey, PartKey]));
const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt));
const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const easeIO = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeIn = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * t);
const UP = new THREE.Vector3(0, 1, 0);
const FLOAT_Y = 0.34;
/** the lamp: pivot in the ceiling, cord length (bulb about 0.65 m over his head, a little in front) */
const LAMP = { x: -0.16, z: -0.1, L: 1.64 };
const CAP_ANCHOR = new THREE.Vector3(0.1, ROOM.H - 0.02, -0.62);
const JUNCTION = new THREE.Vector3(0.06, 0.93, ROOM.CHAIR_Z - 0.47);
/** the operating lamp's dish (world) and where it points */
const SURG = { at: new THREE.Vector3(0.62, 2.78, ROOM.FLOAT_Z + 1.25), ceil: [0.9, ROOM.H, ROOM.FLOAT_Z + 1.6] as [number, number, number] };

// ------------------------------------------------------------------ the arms
type Follow = { kind: 'stow' } | { kind: 'point'; p: THREE.Vector3 } | { kind: 'bone'; bone: string; off: THREE.Vector3 } | { kind: 'tool' } | { kind: 'scan' };
interface Arm {
  name: string; phys: PhysArm; seg1: THREE.Object3D; seg2: THREE.Object3D; head: THREE.Group; mount: THREE.Group; fingers: THREE.Object3D[];
  stow: THREE.Vector3; follow: Follow; k: number; c: number; grip: number; gripT: number;
  hose: Rope | null; hoseA: THREE.Vector3; tool: ToolModel | null; side: THREE.Vector3;
}

/** tool kind -> its held sound */
const TOOL_LOOP: Partial<Record<ToolKind, LoopKind>> = { saw: 'saw', spray: 'spray', clipper: 'clipper', laser: 'laser', welder: 'weld' };
const NBITS = 900;

export class SubjectRoom {
  canvas = document.createElement('canvas');
  renderer: THREE.WebGLRenderer | null = null;
  rig: HumanRig | null = null;
  /** 'title' (dark, strapped in the chair) or 'lit' (creator) */
  mode: 'title' | 'lit' = 'title';
  view: 'title' | 'creator' | 'gender' = 'title';
  busy = false;
  /** stop drawing (another full-screen stage is up) */
  paused = false;
  /** frame clock multiplier (tests on software GL run it faster) */
  timeScale = 1;
  onPick?: (p: PartKey | null) => void;
  onHover?: (p: PartKey | null, x: number, y: number) => void;
  /** wheel / vertical swipe over the head: +1 next face, -1 previous */
  onHeadScroll?: (dir: 1 | -1) => void;
  /** when set (the creator's sections): a horizontal swipe or a wheel notch anywhere on the room, +1 = next look, -1 = previous (no orbit, no zoom) */
  onSwipe?: (dir: 1 | -1) => void;
  /** the room's own three.js scene (other menus may furnish it) */
  readonly scene = new THREE.Scene();
  private host: HTMLElement;
  private cam = new THREE.PerspectiveCamera(32, 1, 0.03, 40);
  /** the camera currently showing the room */
  get camera(): THREE.PerspectiveCamera { return this.cam; }
  private rt: THREE.WebGLRenderTarget | null = null;
  private post = makePost();
  private lensFx = new LensBlood();
  private lowW = 0; private lowH = 0;
  private raf = 0; private last = 0; private t = 0;
  private ro: ResizeObserver;
  private quality = 'high';
  private low = false;
  private mat = worldMaterial({ noVis: true, noFog: true, noGrid: true });
  private mats: FMats;
  // ---- lights
  /** the Meridian crew working in the room (title and creator) */
  private staff = new Staff();
  /** bounce fill: the concrete ceiling above, the worn slab floor and tile below (neutral, a touch warm from the floor) */
  private hemi = new THREE.HemisphereLight(0xb4b8bc, 0x5a524a, 0.3);
  private hemiDark = new THREE.Color(0xa8b0ba); private hemiLit = new THREE.Color(0xc4c6c4);
  private key = new THREE.SpotLight(0xffc88a, 0, 0, 0.98, 0.45, 2);
  private rimL = new THREE.SpotLight(0x9ab2ff, 0, 0, 0.32, 0.6, 2);
  private rimR = new THREE.SpotLight(0x5a74d0, 0, 0, 0.3, 0.6, 2);
  private leakL = new THREE.SpotLight(0x7a94d8, 0, 0, 0.3, 0.5, 2);
  private leak!: ReturnType<typeof leakCards>;
  private crt = new THREE.PointLight(0x78e09a, 0, 3.6, 2);
  private surge = new THREE.PointLight(0xbfe0ff, 0, 5, 2);
  private hatchL = new THREE.PointLight(0xff2a10, 0.25, 3.2, 2);
  /** the lamp's light coming back up off his lap: a whisper of warm under the jaw */
  private bounce = new THREE.PointLight(0xff9a60, 0, 1.6, 2);
  private sun = new THREE.DirectionalLight(0xf0f4e6, 0);
  private fill = new THREE.DirectionalLight(0xc8d4c8, 0);
  private back = new THREE.DirectionalLight(0xa0b4d8, 0);
  private alarm = new THREE.SpotLight(0xff2a1a, 0, 10, 0.6, 0.6, 2);
  /** the operating lamp over the subject (the creator's key), a soft beauty key for the close-ups, a cold fill */
  private surg = new THREE.SpotLight(0xfff4e8, 0, 8, 0.5, 0.7, 2);
  private faceKey = new THREE.SpotLight(0xfff0e0, 0, 4, 0.55, 0.9, 2);
  private faceFill = new THREE.PointLight(0x8aa8d8, 0, 2.6, 2);
  /** practical light at the working tool (sparks, flame, laser), and the scanner's green */
  private toolL = new THREE.PointLight(0xffa040, 0, 1.4, 2);
  private scanL = new THREE.PointLight(0x5aff7a, 0, 1.1, 2);
  private surgBulbMat = new THREE.MeshBasicMaterial({ color: 0x101010, toneMapped: false });
  private surgLevel = 0;
  private tubeMat = new THREE.MeshBasicMaterial({ color: 0x0c0c0c, toneMapped: false });
  private bulbMat = new THREE.MeshBasicMaterial({ color: 0x302010, toneMapped: false });
  private hatchLampMat = new THREE.MeshBasicMaterial({ color: 0x3a0606, toneMapped: false });
  private bulbPivot = new THREE.Group();
  private bulbGlass!: THREE.Mesh;
  private swingA = 0.1; private swingB = 0.06;
  private shaft = shaftMesh(9);
  private surgShaft = shaftMesh(7);
  private dust: Dust;
  private puffs = new Puffs(72);
  private arcs = new Arcs(10);
  private sweat = new Sweat(7);
  private eyes = catchlights();
  private screen: PhosphorScreen;
  private monitor = new THREE.Group();
  private bulbLevel = 1; private flk = 1; private dropT = 0;
  private surgeT = 0; private surgeLen = 1; private nextSurge = 4.5; private crackle = 1.5; private surgeK = 0; private pop = 0;
  private nudge = 0;
  private lit = 0; private litT = 0;
  private lever = new THREE.Group(); private leverA = 0.2; private leverT = 0.2;
  // ---- the subject
  private subj = new THREE.Group();
  private app: Appearance | null = null;
  private outfit: Outfit = {};
  private extraBlood = 0; private bloodT = 0;
  /** blood left by mishaps, per body part (0..3), and soot from the welder */
  private gore: Record<string, number> = {}; private soot = 0;
  private state: 'seat' | 'lift' | 'float' | 'gone' | 'carry' | 'drop' = 'seat';
  private stateT = 0;
  private liftFrom = new THREE.Vector3(); private liftTo = new THREE.Vector3(); private liftMid = new THREE.Vector3();
  private twitch = 0; private struggle = 0;
  private squash = 1;
  /** the body swinging in its restraints (pushed by the tools) and the head's flinch and jelly squash */
  private sway = new THREE.Vector3(); private swayV = new THREE.Vector3();
  private flinch = 0; private flinchDir = new THREE.Vector3();
  private headSq = 1; private headSqV = 0;
  private breathPrev = 0;
  /** buckled into the chair: cap, chin strap, chest, wrist and ankle straps, leg electrode */
  private strapped = true;
  private capOn: THREE.Group; private capHang: THREE.Group;
  private capTip = new THREE.Object3D(); private capHangTip = new THREE.Object3D();
  private chestStrap: THREE.Group; private wristStraps: THREE.Group[] = []; private ankleStraps: THREE.Group[] = []; private legEl: THREE.Group;
  private legTip = new THREE.Object3D();
  private capCable: Cable; private legCable: Cable;
  private cuffs: THREE.Group[] = [];
  private harness: THREE.Group;
  private chains: Chain[] = [];
  private chainsOn = 0;
  private chairStraps: THREE.Object3D; private chairBare: THREE.Object3D;
  // ---- arms, tools, press, hatch
  private arms: Arm[] = [];
  private toolPart = 'idle';
  private tools = new Map<ToolKind, ToolModel>();
  private toolWant: ToolKind | null = 'saw';
  private swapT = 0;
  /** the operation in progress (the creator's mini-games drive it) */
  private op = {
    anchor: 'face', manual: false, bone: 'head' as AnchorBone, local: new THREE.Vector3(), localN: new THREE.Vector3(0, 0, 1), resolveT: 0, resolved: false,
    wp: new THREE.Vector3(), wn: new THREE.Vector3(0, 0, 1), app: new THREE.Vector3(0, 0, 1),
    work: 0, workT: 0, press: 0, pressT: 0, run: 0, runT: 0,
    hit: 0, strikeT: -1, strikeQ: 1, struck: false, strikeRes: null as null | (() => void),
    paint: 0xc08060, wild: 0, spin: 0, emitAcc: 0, touching: false,
  };
  private scanOn = false; private scanAnchor = 'face'; private scanLevel = 0;
  private loop: LoopSfx | null = null; private loopKind: LoopKind | null = null;
  private maulT = -1;
  private pressG = new THREE.Group(); private pressY = ROOM.H + 0.05; private pressBloody: THREE.Mesh;
  private shutter: THREE.Object3D; private hatchOpen = 0; private hatchT = 0;
  // ---- the old menu (kept for callers)
  private menuItems: MenuItem[] = [];
  private hoverKey: string | null = null;
  // ---- camera
  private shotName: ShotName = 'title';
  private shotFrom = { pos: new THREE.Vector3(0.25, 1.25, 0.9), look: new THREE.Vector3(0, 1.3, -0.55), fov: 32 };
  private shotT0 = -10; private shotDur = 0.001;
  private titleT0 = 0;
  private camPos = new THREE.Vector3(0.25, 1.25, 0.9); private camLook = new THREE.Vector3(0, 1.3, -0.55); private camFov = 32;
  private frX = 0; private frY = 0; private frXSet: number | null = null; private frYSet: number | null = null;
  private orbit = 0; private orbitT = 0; private zoom = 1; private punch = 0;
  private shake = 0;
  private focusKey = 'full';
  private closeK = 0;
  // ---- fx
  private bits: Bits;
  private decals: THREE.Mesh[] = []; private decalNext = 0; private decalMats: THREE.MeshLambertMaterial[] = []; private decalGeo = new THREE.PlaneGeometry(1, 1);
  private scorchMat = new THREE.MeshLambertMaterial({ color: 0x050403, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  private flash = 0; private redFlash = 0;
  // ---- input
  private ray = new THREE.Raycaster(); private ndc = new THREE.Vector2();
  private ptr = new Map<number, { x: number; y: number; x0: number; y0: number; t0: number; head: boolean; o0: number }>();
  private wheelAcc = 0; private wheelAt = 0;
  private hoverPart: PartKey | null = null;
  /** while a mini-game owns the pointer the room ignores swipes and picks */
  inputLocked = false;
  // ---- temps
  private v1 = new THREE.Vector3(); private v2 = new THREE.Vector3(); private v3 = new THREE.Vector3(); private v4 = new THREE.Vector3(); private v5 = new THREE.Vector3(); private q1 = new THREE.Quaternion();
  private P = new THREE.Vector3(); private LK = new THREE.Vector3(); private m1 = new THREE.Matrix4();

  constructor(host: HTMLElement) {
    this.host = host;
    this.canvas.className = 'rm-cv';
    Object.assign(this.canvas.style, { position: 'absolute', right: 'auto', bottom: 'auto', imageRendering: 'pixelated' });
    host.style.overflow = 'hidden';
    host.append(this.canvas);
    const gs = gfxSettings();
    const coarse = matchMedia('(pointer: coarse)').matches;
    this.quality = gs.quality === 'auto' ? (coarse ? 'low' : 'high') : gs.quality;
    this.low = this.quality === 'low';
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, alpha: false, powerPreference: coarse ? 'low-power' : 'default' });
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.setPixelRatio(1);
      this.renderer.setClearColor(0x000000, 1);
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFShadowMap;
      this.renderer.info.autoReset = false;
    } catch (e) { console.warn('room renderer unavailable', e); this.renderer = null; }
    const S = this.scene, mats = this.mats = facetMats(this.low);
    // ---- the cell, the chair, the fixtures
    S.add(roomModel(mats));
    this.chairStraps = chairModel(mats, true);
    this.chairBare = chairModel(mats, false);
    this.chairBare.visible = false;
    S.add(this.chairStraps, this.chairBare);
    S.add(new THREE.Mesh(fixtureTubes(mats), this.tubeMat));
    const hl = new THREE.Mesh((new FacetBuilder().add('lamp', gem(0.05, 6, 0.035), 0xffffff).build(mats).children[0] as THREE.Mesh).geometry, this.hatchLampMat);
    hl.position.copy(SPOT.hatchLamp); hl.rotation.x = Math.PI / 2; hl.scale.set(2.4, 1, 1);
    S.add(hl);
    this.hatchL.position.copy(SPOT.hatchLamp).add(new THREE.Vector3(0, -0.1, 0.25));
    // the breaker's knife switch
    this.lever.add(leverModel(mats));
    this.lever.position.copy(SPOT.lever);
    S.add(this.lever);
    // the heart monitor on its cart, off to his left
    const mon = monitorModel(mats);
    this.monitor.add(mon.group);
    this.screen = new PhosphorScreen(mon.sw, mon.sh);
    this.screen.mesh.applyMatrix4(mon.screenAt);
    this.monitor.add(this.screen.mesh);
    this.monitor.position.set(SPOT.monitor.x, 0, SPOT.monitor.z);
    this.monitor.rotation.y = SPOT.monitor.ry;
    S.add(this.monitor);
    this.monitor.updateMatrixWorld(true);
    this.crt.position.set(0, 1.02, 0.45).applyMatrix4(this.monitor.matrixWorld);
    // the swinging caged lamp
    const lamp = bulbModel(mats, LAMP.L);
    this.bulbPivot.position.set(LAMP.x, ROOM.H, LAMP.z);
    this.bulbPivot.add(lamp.group);
    this.bulbGlass = new THREE.Mesh(lamp.bulbGeo, this.bulbMat);
    this.bulbGlass.position.y = lamp.bulbY;
    this.bulbPivot.add(this.bulbGlass);
    this.key.position.set(0, lamp.bulbY - 0.05, 0);
    this.bulbPivot.add(this.key);
    this.key.target.position.set(0, -10, 0);
    this.bulbPivot.add(this.key.target);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(this.low ? 512 : 1024, this.low ? 512 : 1024);
    this.key.shadow.camera.near = 0.04; this.key.shadow.camera.far = 7;
    this.key.shadow.bias = -0.0008; this.key.shadow.normalBias = 0.012; this.key.shadow.radius = 2.5;
    S.add(this.bulbPivot);
    this.shaft.mesh.position.set(0, lamp.bulbY - 0.05, 0);
    this.bulbPivot.add(this.shaft.mesh);
    // the operating lamp: ceiling post, jointed arm, the dish of bulbs aimed at the subject
    const sl = surgLampModel(mats);
    const dish = new THREE.Group();
    dish.add(sl.dish);
    dish.add(new THREE.Mesh(sl.bulbs, this.surgBulbMat));
    dish.position.copy(SURG.at);
    dish.lookAt(0, 1.6, ROOM.FLOAT_Z);
    dish.rotateX(-Math.PI / 2);
    S.add(dish);
    S.add(surgArmModel(mats, SURG.ceil, [SURG.at.x, SURG.at.y + 0.12, SURG.at.z]));
    this.surg.position.copy(SURG.at);
    this.surg.target.position.set(0, 1.62, ROOM.FLOAT_Z);
    this.surg.castShadow = true;
    this.surg.shadow.mapSize.set(this.low ? 512 : 1024, this.low ? 512 : 1024);
    this.surg.shadow.camera.near = 0.3; this.surg.shadow.camera.far = 6;
    this.surg.shadow.bias = -0.0006; this.surg.shadow.normalBias = 0.015; this.surg.shadow.radius = 3;
    this.surgShaft.u.uColor.value.set(0xfff0d8);
    this.surgShaft.mesh.position.copy(SURG.at);
    this.surgShaft.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), this.v1.set(0, 1.45, ROOM.FLOAT_Z).sub(SURG.at).normalize());
    this.surgShaft.mesh.scale.set(0.55, 2.6, 0.55);
    S.add(this.surg, this.surg.target, this.surgShaft.mesh, this.faceKey, this.faceKey.target, this.faceFill, this.toolL, this.scanL);
    // rims from behind, the green spill, the surge
    this.rimL.position.set(1.3, 2.5, -2.05); this.rimR.position.set(-1.35, 2.2, -2.15);
    this.bounce.position.set(0.12, 0.92, -0.1);
    S.add(this.bounce, this.hemi, this.rimL, this.rimL.target, this.rimR, this.rimR.target, this.crt, this.surge, this.hatchL, this.sun, this.sun.target, this.fill, this.back, this.alarm, this.alarm.target);
    this.sun.position.set(0.8, 3.4, 3.4); this.sun.target.position.set(0, 1.0, ROOM.FLOAT_Z);
    this.fill.position.set(-2.5, 1.4, 2.0);
    this.back.position.set(0.5, 2.6, -3.0);
    this.alarm.position.set(-1.5, ROOM.H - 0.2, 0.5); this.alarm.target.position.set(0, 0, ROOM.FLOAT_Z);
    // cold corridor light leaking in through the louvre high on the right wall
    const gaps: [THREE.Vector3, THREE.Vector3][] = [];
    for (let i = 0; i < 6; i++) { const y = 2.6 + i * 0.056; gaps.push([new THREE.Vector3(ROOM.W - 0.04, y, -0.47), new THREE.Vector3(ROOM.W - 0.04, y + 0.006, 0.07)]); }
    const leakDir = new THREE.Vector3(-2.8, -1.35, -2.1).normalize();
    this.leak = leakCards(gaps, leakDir, 3.6);
    S.add(this.leak.mesh);
    this.leakL.position.set(ROOM.W - 0.1, 2.75, -0.2);
    this.leakL.target.position.copy(this.leakL.position).addScaledVector(leakDir, 3.6);
    S.add(this.leakL, this.leakL.target);
    // dust in the lamp's cone
    this.dust = new Dust(this.low ? 70 : 170, new THREE.Box3(new THREE.Vector3(-0.75, 0.55, -1.0), new THREE.Vector3(0.85, 2.3, 1.1)));
    S.add(this.dust.points, this.puffs.mesh, this.arcs.lines);
    // ---- hatch shutter and the press
    this.shutter = shutterModel(mats);
    this.shutter.position.set(0, 0, ROOM.BACK - 0.02);
    S.add(this.shutter);
    this.pressG.add(pressModel(mats));
    const bm = new THREE.MeshLambertMaterial({ map: canvasTex(bloodCanvas(77, 96, true)), transparent: true, alphaTest: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.pressBloody = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 0.95), bm);
    this.pressBloody.rotation.x = Math.PI / 2; this.pressBloody.position.y = -0.003; this.pressBloody.visible = false;
    this.pressG.add(this.pressBloody);
    this.pressG.position.set(0, this.pressY, ROOM.FLOAT_Z);
    S.add(this.pressG);
    // ---- what he wears in the chair, the cuffs and chains for the arms
    S.add(this.subj);
    this.staff.build();
    S.add(this.staff.group);
    this.capOn = capModel(mats, true); this.capHang = capModel(mats, false);
    const tip = new THREE.Vector3(0, 0.33, -0.004).applyMatrix4(new THREE.Matrix4().makeRotationX(-0.2)).add(new THREE.Vector3(0, -0.012, -0.002));
    this.capTip.position.copy(tip); this.capOn.add(this.capTip);
    this.capHangTip.position.copy(tip); this.capHang.add(this.capHangTip);
    this.capHang.position.set(0, 1.18, ROOM.CHAIR_Z - 0.24); this.capHang.rotation.set(0.5, 0, 0.1); this.capHang.visible = false;
    S.add(this.capHang);
    this.chestStrap = strapModel(mats, 0.19, 0.13, 0.075);
    for (let i = 0; i < 2; i++) { this.wristStraps.push(strapModel(mats, 0.05, 0.046, 0.055)); this.ankleStraps.push(strapModel(mats, 0.056, 0.054, 0.05)); }
    this.legEl = strapModel(mats, 0.06, 0.058, 0.04, false);
    const elb = new FacetBuilder();
    elb.add('copper', prism(0.03, 0.012, 6), 0xffffff, new THREE.Matrix4().makeTranslation(0, 0, 0.066).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)));
    elb.add('brass', prism(0.008, 0.04, 6), 0xffffff, new THREE.Matrix4().makeTranslation(0, 0, 0.08).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)));
    this.legEl.add(elb.build(mats));
    this.legTip.position.set(0, 0, 0.1); this.legEl.add(this.legTip);
    this.capCable = new Cable(mats.rubber, 0.016, 16, 5, 0x707070);
    this.capCable.mesh.castShadow = false;
    this.legCable = new Cable(mats.rubber, 0.011, 10, 4, 0x707070);
    S.add(this.capCable.mesh, this.legCable.mesh);
    for (let i = 0; i < 4; i++) { const c = strapModel(mats, 0.048, 0.046, 0.06, false, true); c.visible = false; this.cuffs.push(c); }
    this.harness = strapModel(mats, 0.2, 0.15, 0.09, false, true);
    this.harness.visible = false;
    for (let i = 0; i < 2; i++) { const ch = new Chain(mats, 30); ch.mesh.visible = false; this.chains.push(ch); S.add(ch.mesh); }
    // ---- arms: wrists from the back wall, a harness arm, the tool arm and the scanner arm from the ceiling
    const mk = (name: string, base: [number, number, number], L1: number, L2: number, pole: [number, number, number], stow: [number, number, number], kind: 'claw' | 'tool' | 'scan', side: [number, number, number]) => {
      const b = armBase(mats); b.name = 'base';
      b.position.set(...base);
      b.quaternion.setFromUnitVectors(UP, new THREE.Vector3(stow[0] - base[0], stow[1] - base[1], stow[2] - base[2]).normalize().negate());
      const seg1 = armSegment(mats, L1, 0.15), seg2 = armSegment(mats, L2, 0.12);
      const head = new THREE.Group(), mount = new THREE.Group();
      head.add(mount);
      const fingers: THREE.Object3D[] = [];
      if (kind === 'claw') {
        mount.add(clawPalm(mats));
        for (const [k, ry] of [[-1, Math.PI], [1, 0]] as const) { const f = clawFinger(mats); f.position.set(k * 0.06, 0.12, 0); f.rotation.y = ry; f.userData.k = k; mount.add(f); fingers.push(f); }
      }
      S.add(b, seg1, seg2, head);
      const sv = new THREE.Vector3(...stow);
      const phys = new PhysArm(new THREE.Vector3(...base), L1, L2, new THREE.Vector3(...pole).normalize(), sv);
      const hose = new Rope(mats.rubber, 12, (L1 + L2) * 0.62, kind === 'claw' ? 0.016 : 0.013, 5, 0x6a6a6a);
      hose.mesh.castShadow = false;
      S.add(hose.mesh);
      const arm: Arm = { name, phys, seg1, seg2, head, mount, fingers, stow: sv, follow: { kind: 'stow' }, k: 60, c: 12, grip: 0, gripT: 0, hose, hoseA: new THREE.Vector3(0.1, L1 * 0.12, 0.04), tool: null, side: new THREE.Vector3(...side).normalize() };
      this.arms.push(arm);
      return arm;
    };
    mk('L', [1.75, 2.75, ROOM.BACK + 0.02], 1.7, 1.6, [0.6, 0.8, -0.6], [1.75, 2.6, ROOM.BACK - 1.2], 'claw', [1, 0, 0]);
    mk('R', [-1.75, 2.75, ROOM.BACK + 0.02], 1.7, 1.6, [-0.6, 0.8, -0.6], [-1.75, 2.6, ROOM.BACK - 1.2], 'claw', [-1, 0, 0]);
    mk('H', [0, ROOM.H - 0.02, -0.95], 1.35, 1.25, [0, 0.4, -1], [0, ROOM.H + 1.2, -0.95], 'claw', [0, 1, -1]);
    mk('T', [-1.55, ROOM.H - 0.02, 0.15], 1.75, 1.7, [-1, 0.5, -0.2], [-1.55, ROOM.H + 1.4, 0.15], 'tool', [-1, 0.2, 0.25]);
    mk('S', [1.55, ROOM.H - 0.02, 0.2], 1.7, 1.6, [1, 0.5, -0.2], [1.55, ROOM.H + 1.3, 0.2], 'scan', [1, 0.35, 0.4]);
    // the scanner arm always carries the scanner
    const sc = this.toolModel('scanner');
    this.arms[4].mount.add(sc.group); this.arms[4].tool = sc;
    // ---- loose bits: blood, sparks, mist, hair
    this.bits = new Bits(NBITS, { w: ROOM.W, back: ROOM.BACK, h: ROOM.H, plate: (x, z) => (Math.abs(x) < 0.7 && Math.abs(z - ROOM.FLOAT_Z) < 0.55 ? ROOM.PLATE_Y : 0) });
    this.bits.onLand = (x, y, z, axis) => this.decal(Math.max(-ROOM.W + 0.012, Math.min(ROOM.W - 0.012, x)), axis === 'y' ? y + 0.004 + Math.random() * 0.002 : Math.max(0.02, Math.min(ROOM.H - 0.012, y)), Math.max(ROOM.BACK + 0.012, z), axis, 0.1 + Math.random() * 0.18);
    S.add(this.bits.group);
    for (let i = 0; i < 4; i++) this.decalMats.push(new THREE.MeshLambertMaterial({ map: canvasTex(bloodCanvas(i * 13 + 5, 64, i % 2 === 1)), transparent: true, alphaTest: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 - i * 0.1 }));
    this.post.u.tLens.value = this.lensFx.tex;
    // only what the lamps throw a shadow worth seeing from casts one: him, the chair, the cap, the cage
    const noCast = (o: THREE.Object3D) => o.traverse((m) => { m.castShadow = false; });
    for (const a of this.arms) [a.seg1, a.seg2, a.head].forEach(noCast);
    [this.pressG, this.shutter, this.monitor, this.lever, ...this.cuffs, this.harness, ...this.chains.map((c) => c.mesh), dish].forEach(noCast);
    this.scene.children.forEach((o) => { if (o.name === 'base') noCast(o); });
    this.applyLight(0);
    this.bindInput();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private toolModel(k: ToolKind): ToolModel {
    let m = this.tools.get(k);
    if (!m) { m = buildTool(k, this.mats); this.tools.set(k, m); }
    return m;
  }

  // ================================================================== subject
  setAppearance(app: Appearance) {
    this.app = { ...app };
    if (!this.rig) {
      // the room draws its own 1px edges (scene/post.ts): no hull outline on the rig
      this.rig = createPreviewRig(this.app, this.outfit, { outline: false });
      this.rig.skin.layers.enable(1);
      this.looseBounds();
      this.subj.add(this.rig.root);
      const B = this.rig.bones;
      B.handL.add(this.cuffs[0]); B.handR.add(this.cuffs[1]); B.shinL.add(this.cuffs[2]); B.shinR.add(this.cuffs[3]);
      B.chest.add(this.harness, this.chestStrap);
      B.head.add(this.capOn, this.sweat.group, this.eyes);
      B.farmL.add(this.wristStraps[0]); B.farmR.add(this.wristStraps[1]);
      B.shinL.add(this.ankleStraps[0]); B.shinR.add(this.ankleStraps[1], this.legEl);
    } else {
      try { this.rig.setAppearance(this.app); } catch (e) { console.warn('rig.setAppearance', e); }
      this.rig.setOutfit(this.dress());
      this.looseBounds();
    }
    const s = this.app.height || 1, d = this.rig.dims, hs = s * (d.headS ?? 1), m = d.mass ?? 1;
    for (const c of this.cuffs) c.scale.setScalar(s);
    this.cuffs[0].position.set(0, -0.02 * s, 0); this.cuffs[1].position.set(0, -0.02 * s, 0);
    this.cuffs[2].position.set(0, -0.36 * s, 0); this.cuffs[3].position.set(0, -0.36 * s, 0);
    this.harness.position.set(0, 0.12 * s, 0);
    this.harness.scale.set(s * (0.8 + 0.2 * m), s, s * (0.7 + 0.3 * m));
    this.chestStrap.position.set(0, 0.07 * s, -0.005 * s);
    this.chestStrap.scale.set(s * (0.86 + 0.18 * m) * (d.bw ?? 1), s, s * (0.78 + 0.3 * m));
    for (const w of this.wristStraps) { w.position.set(0, -0.19 * s, 0); w.scale.setScalar(s * (0.9 + 0.1 * m)); }
    for (const a of this.ankleStraps) { a.position.set(0, -0.35 * s, 0); a.scale.setScalar(s * (0.92 + 0.1 * m)); }
    this.legEl.position.set(0, -0.2 * s, 0); this.legEl.scale.setScalar(s * (0.95 + 0.12 * m));
    this.legEl.rotation.y = -0.5;
    for (const g of [this.capOn, this.sweat.group, this.eyes]) g.scale.setScalar(hs);
    this.applyStraps();
    this.op.resolveT = 0;
  }
  /** the skinned body's bounds, generous and fixed (a cached sphere from another pose would make rays miss him) */
  private looseBounds() {
    const sk = this.rig?.skin as THREE.SkinnedMesh | undefined;
    if (!sk) return;
    sk.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.95, 0), 1.7);
    sk.boundingBox = new THREE.Box3(new THREE.Vector3(-1.6, -0.6, -1.6), new THREE.Vector3(1.6, 2.6, 1.6));
  }
  setOutfit(o: Outfit) { this.outfit = o; this.rig?.setOutfit(this.dress()); }
  private dress(): Outfit {
    const gk = Object.keys(this.gore);
    if (!this.extraBlood && !gk.length && !this.soot) return this.outfit;
    const cond = { ...(this.outfit.cond || {}) };
    const blood = { ...(cond.blood || {}) };
    if (this.extraBlood) { blood.head = Math.max(blood.head || 0, this.extraBlood); blood.neck = Math.max(blood.neck || 0, this.extraBlood - 1); }
    for (const k of gk) blood[k] = Math.max(blood[k] || 0, this.gore[k]);
    cond.blood = blood;
    if (this.soot) cond.dirt = Math.max(cond.dirt || 0, this.soot);
    return { ...this.outfit, cond };
  }
  get rigSeed(): number { return (this.rig as any)?.seed ?? 0; }
  private applyStraps() {
    const on = this.strapped;
    for (const o of [this.capOn, this.chestStrap, this.legEl, ...this.wristStraps, ...this.ankleStraps]) o.visible = on;
    this.capHang.visible = !on;
    this.chairStraps.visible = on; this.chairBare.visible = !on;
    this.legCable.mesh.visible = on;
  }
  /** blood on a body part (0..3) from a mishap (item part keys: head, neck, torso_u, uarm_l, ...); 0 clears all */
  bleed(part: string, level: number) {
    if (level <= 0 && part === '*') this.gore = {};
    else this.gore[part] = Math.max(this.gore[part] || 0, Math.min(3, level));
    this.rig?.setOutfit(this.dress());
  }
  /** wash the subject (blood and soot from the mishaps) */
  clean() { this.gore = {}; this.soot = 0; this.extraBlood = 0; this.rig?.setOutfit(this.dress()); }

  // ================================================================== the old 3D menu (kept as quiet stubs)
  /** stores the items; the menu is drawn in 2D now */
  setMenu(items: MenuItem[]) { this.menuItems = items.slice(); }
  /** a menu entry has focus: the lamp catches a little */
  hoverItem(key: string | null) {
    if (key && key !== this.hoverKey) { this.nudge = 1; this.swingA = Math.min(0.16, this.swingA + 0.01); }
    this.hoverKey = key;
  }
  /** a menu entry was pressed: a crackle off the cap */
  async pressItem(_key: string) {
    this.crackleNow(true);
    await this.wait(140);
  }
  itemRect(_key: string): { x: number; y: number; r: number } | null { return null; }
  menuKeys() { return this.menuItems.map((m) => m.key); }
  pushTo(_key: string | null) { /* no 3D menu to push to */ }

  // ================================================================== camera API
  /** ease the camera to a framing (see the header); resolves when the move is done */
  shot(name: ShotName, ms = 900): Promise<void> {
    this.setShot(name, ms);
    return new Promise((res) => {
      let done = false;
      const fin = () => { if (!done) { done = true; res(); } };
      this.waiters.push({ t: this.t + ms / 1000, res: fin });
      setTimeout(fin, ms + 350);
    });
  }
  /** where the subject sits on screen: normalised offsets (-1..1, +x right, +y up); null = automatic */
  setFraming(dx: number | null, dy?: number | null) {
    this.frXSet = dx === null || dx === undefined || !isFinite(dx) ? null : Math.max(-1, Math.min(1, dx));
    if (dy !== undefined) this.frYSet = dy === null || !isFinite(dy) ? null : Math.max(-1, Math.min(1, dy));
  }
  private setShot(name: ShotName, ms: number) {
    if (name === this.shotName && this.t - this.shotT0 < this.shotDur) return;
    const same = name === this.shotName;
    this.shotFrom.pos.copy(this.camPos); this.shotFrom.look.copy(this.camLook); this.shotFrom.fov = this.camFov;
    if (name === 'title' && !same) this.titleT0 = this.t;
    this.shotName = name;
    this.shotT0 = this.t; this.shotDur = Math.max(0.001, ms / 1000);
    if (ms <= 0) { this.shotT0 = -10; }
  }
  /** pull the close-ups back a little (1 = as framed; the operations use ~1.3 so the tool is in the picture) */
  setZoom(z: number) { this.zoom = Math.max(0.6, Math.min(1.8, z)); }
  /** a little push in (a flourish, a hit) */
  bump(k = 0.05) { this.punch = Math.max(this.punch, k); }

  // ================================================================== sequences
  /** the breaker: lights on, arms out, the subject unbuckled, lifted out of the chair and held in mid-air */
  async lightsOn() {
    if (this.mode === 'lit') return;
    this.busy = true;
    this.mode = 'lit'; this.view = 'creator';
    this.frXSet = this.frYSet = null;
    this.hoverKey = null;
    this.surgeT = 0;
    sfx('breaker');
    this.leverT = Math.PI - 0.35;
    this.shake = Math.max(this.shake, 0.25);
    this.litT = 0.001;
    this.setFocus('full', 2200);
    await this.wait(500);
    sfx('servo');
    const [L, R, H, T, Sc] = this.arms;
    L.follow = { kind: 'bone', bone: 'handL', off: new THREE.Vector3(0.05, 0.25, -0.05) };
    R.follow = { kind: 'bone', bone: 'handR', off: new THREE.Vector3(-0.05, 0.25, -0.05) };
    L.k = R.k = 45; L.c = R.c = 10;
    await this.wait(850);
    for (const a of [L, R]) (a.follow as any).off.set(0, 0, 0);
    await this.wait(250);
    sfx('clamp'); L.gripT = R.gripT = 1;
    this.cuffs[0].visible = this.cuffs[1].visible = true;
    this.strapped = false; this.applyStraps();
    this.twitch = 1;
    await this.wait(250);
    this.beginLift();
    sfx('servo');
    await this.wait(900);
    H.follow = { kind: 'bone', bone: 'chest', off: new THREE.Vector3(0, 0.15, -0.28) }; H.k = 40;
    sfx('servo');
    await this.wait(700);
    H.gripT = 1; this.harness.visible = true; sfx('clamp');
    T.follow = { kind: 'tool' }; this.toolPart = 'idle'; T.k = 55; T.c = 9;
    Sc.follow = { kind: 'scan' }; Sc.k = 40; Sc.c = 8;
    await this.wait(400);
    this.chainsOn = 1; this.cuffs[2].visible = this.cuffs[3].visible = true; sfx('clamp');
    await this.wait(300);
    this.busy = false;
  }
  private beginLift() {
    if (!this.rig) return;
    this.state = 'lift'; this.stateT = 0;
    this.liftFrom.copy(this.subj.position);
    this.liftTo.set(0, FLOAT_Y, ROOM.FLOAT_Z);
    this.liftMid.set(0, Math.max(this.liftFrom.y, FLOAT_Y) + 0.55, (this.liftFrom.z + ROOM.FLOAT_Z) / 2);
  }
  /** back to the dark: he is put back in the chair and buckled in, the arms withdraw */
  async lightsOff() {
    if (this.mode === 'title') return;
    this.busy = true;
    this.frXSet = this.frYSet = null;
    const [L, R, H, T, Sc] = this.arms;
    this.useTool(null); this.scan(false);
    T.follow = { kind: 'stow' }; Sc.follow = { kind: 'stow' };
    H.gripT = 0; this.harness.visible = false; H.follow = { kind: 'stow' };
    this.chainsOn = 0; this.cuffs[2].visible = this.cuffs[3].visible = false;
    sfx('servo');
    this.state = 'carry'; this.stateT = 0;
    this.liftFrom.copy(this.subj.position);
    this.seatPos(this.liftTo);
    this.liftMid.set(0, this.liftFrom.y + 0.5, (this.liftFrom.z + this.liftTo.z) / 2);
    this.subj.visible = true; this.squash = 1;
    await this.wait(1450);
    this.state = 'seat';
    L.gripT = R.gripT = 0; this.cuffs[0].visible = this.cuffs[1].visible = false;
    this.strapped = true; this.applyStraps();
    sfx('clamp');
    L.follow = R.follow = { kind: 'stow' }; L.k = R.k = 60;
    await this.wait(400);
    sfx('breaker');
    this.leverT = 0.2;
    this.mode = 'title'; this.view = 'title';
    this.litT = 0;
    this.focusKey = 'full';
    this.nextSurge = 3;
    this.toolWant = 'saw';
    this.setShot('title', 1800);
    await this.wait(500);
    this.busy = false;
  }
  private seatPos(out: THREE.Vector3) {
    const hip = this.rig?.dims.hipY ?? 0.94;
    return out.set(0, ROOM.SEAT_Y + 0.11 - hip, ROOM.CHAIR_Z - 0.16);
  }

  /** the tool arm goes to the part being edited (null = hover by the shoulder); the camera frames it */
  setFocus(k: string | null, ms = 900) {
    this.focusKey = k || 'full';
    this.toolPart = k || 'idle';
    this.orbitT = 0; this.zoom = 1;
    const anc = this.anchorFor(this.focusKey);
    if (anc) { this.op.anchor = anc; this.op.resolveT = 0; this.scanAnchor = anc; }
    if (this.mode === 'lit') this.setShot(this.shotFor(this.focusKey), ms);
  }
  private anchorFor(k: string): string | null {
    if (ANCHORS[k]) return k;
    if (k === 'head' || k === 'face') return 'face';
    if (k === 'hair') return 'scalp';
    if (k === 'torso' || k === 'body' || k === 'marks') return 'chest';
    if (k === 'armL' || k === 'handL' || k === 'hands') return 'armL';
    if (k === 'armR' || k === 'handR') return 'armR';
    if (k === 'legL' || k === 'legR' || k === 'legs' || k === 'feet') return 'shin';
    if (k === 'full') return 'chest';
    return null;
  }
  private shotFor(k: string): ShotName {
    if (this.view === 'gender') return 'press';
    if (SHOTS[k]) return k as ShotName;
    if (k === 'head' || k === 'face') return 'face';
    if (k === 'hair') return 'hair';
    if (k === 'torso' || k === 'body' || k === 'marks' || k === 'armL' || k === 'armR' || k === 'hands' || k === 'handL' || k === 'handR') return 'body';
    if (k === 'feet' || k === 'legs' || k === 'legL' || k === 'legR') return 'feet';
    return 'full';
  }
  setView(v: 'creator' | 'gender') { this.view = v; this.setFocus('full', 1200); }
  /** turn the camera round the subject (radians, clamped) */
  orbitTo(a: number) { this.orbitT = Math.max(-1.1, Math.min(1.1, a)); }
  /** a camera flash (the processing photo) */
  flashOnce() { this.flash = calm() ? 0.3 : 0.9; }

  // ================================================================== operating
  /** the tool arm takes up a tool (null: it keeps its saw and folds away beside him) and waits by an anchor */
  useTool(kind: ToolKind | null, anchor?: string) {
    if (anchor && anchor !== this.op.anchor) { this.op.anchor = anchor; this.op.resolveT = 0; this.op.manual = false; }
    if (kind) this.toolWant = kind;
    const T = this.arms[3];
    if (this.mode === 'lit' && T.follow.kind !== 'tool') T.follow = { kind: 'tool' };
    if (!kind) { this.op.workT = 0; this.op.runT = 0; this.op.pressT = 0; this.toolPart = 'idle'; }
    else this.toolPart = 'op';
  }
  get toolKind(): ToolKind | null { return this.arms[3].tool?.kind ?? null; }
  /** has the tool arm finished changing tools and reached its part? */
  get toolReady(): boolean { const T = this.arms[3]; return !!T.tool && T.tool.kind === this.toolWant && this.swapT <= 0 && T.phys.tip.distanceTo(T.phys.goal) < 0.12; }
  /** 0 = waiting beside the part, 1 = on the skin */
  toolWork(k: number) { this.op.workT = Math.max(0, Math.min(1, k)); }
  /** the motor (saw, spray, clipper, laser, welder): 0..1 */
  toolRun(k: number) { this.op.runT = Math.max(0, Math.min(1, k)); }
  /** push into the skin (0 touching .. 1 hard) */
  toolPress(k: number) { this.op.pressT = Math.max(0, Math.min(1, k)); }
  /** steer the tool to the body under a screen point (client px); false when the point misses him */
  toolAim(x: number, y: number): boolean {
    const hit = this.hitAt(x, y);
    if (!hit || !this.rig) return false;
    const bone = this.rig.bones[this.op.bone] ?? this.rig.bones.head;
    this.op.manual = true;
    this.op.local.copy(hit.point); bone.worldToLocal(this.op.local);
    const n = hit.face ? this.v1.copy(hit.face.normal).transformDirection(this.rig.skin.matrixWorld) : this.v1.set(0, 0, 1);
    n.lerp(this.v2.copy(this.cam.position).sub(hit.point).normalize(), 0.25).normalize();
    this.op.localN.copy(n).transformDirection(this.m1.copy(bone.matrixWorld).invert());
    this.op.resolved = true;
    return true;
  }
  /** back to the named anchor (the end of manual steering) */
  toolAnchor(name: string) { this.op.anchor = name; this.op.manual = false; this.op.resolveT = 0; }
  /** the paint / serum the tool carries */
  setPaint(c: number) { this.op.paint = c; for (const k of ['spray', 'injector'] as ToolKind[]) this.tools.get(k)?.setColor?.(c); }
  /** one stroke (stamp, clamp, injector, a weld tack, a clipper pass, a cut): resolves when it lands. q: 0 sloppy .. 1 clean */
  toolStrike(q = 1): Promise<void> {
    return new Promise((res) => {
      this.op.strikeRes?.();
      this.op.strikeT = 0; this.op.strikeQ = q; this.op.struck = false; this.op.strikeRes = res;
      setTimeout(() => { if (this.op.strikeRes === res) { this.op.strikeRes = null; res(); } }, 900);
    });
  }
  /** the clean finish: the tool twirls and kicks back, a ding */
  async toolFlourish() {
    const T = this.arms[3];
    sfx('ding');
    this.op.spin = 1;
    T.phys.kick(this.v1.copy(this.op.app).add(this.v2.set(0, 0.6, 0)).normalize(), 2.2);
    T.hose?.shove(this.v1.set(0, 1.5, 0));
    this.bump(0.04);
    if (this.op.touching || this.op.work > 0.3) this.bits.burst(this.v3.copy(this.op.wp).addScaledVector(this.op.app, 0.05), this.op.app, 10, Bit.Spark, 1.6, 1.2, 0.5);
    await this.wait(520);
    this.op.spin = 0;
  }
  /** a mishap with the current tool: comedic and nasty. apply() runs at the worst moment */
  async toolMishap(apply?: () => void) {
    const T = this.arms[3], kind = T.tool?.kind ?? 'saw', C = calm();
    const p = this.v5.copy(this.op.wp), n = this.op.app.clone();
    const gore = (lvl: number, part = 'head') => { if (!C) { this.gore[part] = Math.max(this.gore[part] || 0, lvl); this.rig?.setOutfit(this.dress()); } };
    const yelp = () => { sfx('scream', 0.9); this.twitch = 1.4; this.struggle = Math.max(this.struggle, 1.2); this.flinchAt(n, 1.2); };
    this.shake = Math.max(this.shake, C ? 0.2 : 0.55);
    switch (kind) {
      case 'saw': {
        this.op.runT = 1; this.op.pressT = 1; this.op.wild = 1;
        sfx('grind'); sfx('squelch');
        await this.wait(220);
        yelp();
        this.bits.burst(p, n, C ? 10 : 70, Bit.Blood, 3.2, 2.4, 1.8);
        this.bits.burst(p, n, 26, Bit.Spark, 2.4, 2, 0.6);
        this.bits.burst(p, n, 14, Bit.Chip, 2, 1.6, 1.2);
        this.splatLens(4); this.redFlash = C ? 0.1 : 0.5;
        gore(3); gore(2, 'neck');
        apply?.();
        T.phys.kick(this.v1.copy(n).add(this.v2.set(0, 0.8, 0)).normalize(), 5);
        await this.wait(500);
        this.op.wild = 0; this.op.pressT = 0;
        break;
      }
      case 'scalpel': {
        sfx('slice'); yelp();
        // an artery: a jet that pulses
        for (let i = 0; i < 7; i++) { this.bits.burst(p, this.v1.copy(n).add(this.v2.set(Math.random() - 0.5, 0.6, 0)).normalize(), C ? 3 : 16, Bit.Blood, 3.6, 0.6, 1.6); if (i === 2) { this.splatLens(2); apply?.(); } await this.wait(90); }
        gore(3); gore(2, 'neck'); gore(1, 'torso_u');
        break;
      }
      case 'laser': {
        this.op.runT = 1; this.op.wild = 1.4;
        sfx('zap'); sfx('buzz');
        for (let i = 0; i < 6; i++) {
          // the beam swings off him and burns the walls
          this.scorch((Math.random() - 0.5) * 4, 0.5 + Math.random() * 2.4, ROOM.BACK + 0.012, 'z', 0.12 + Math.random() * 0.2);
          this.bits.burst(p, n, 8, Bit.Ember, 1.6, 1.4, 0.8);
          if (i === 2) { yelp(); apply?.(); this.soot = 2; this.rig?.setOutfit(this.dress()); }
          await this.wait(110);
        }
        for (let i = 0; i < 8; i++) this.puffs.emit(this.v2.copy(p).addScaledVector(n, 0.03), this.v3.set((Math.random() - 0.5) * 0.1, 0.12, (Math.random() - 0.5) * 0.1), { life: 2.2, s0: 0.02, s1: 0.12, color: 0x403830, rise: 0.08 });
        this.op.wild = 0; this.op.runT = 0;
        break;
      }
      case 'stamp': {
        sfx('thunk'); sfx('crack');
        this.op.strikeT = 0; this.op.strikeQ = 0; this.op.struck = false;
        await this.wait(140);
        this.headSqV = -9; this.headSq = 0.72;
        sfx('boing');
        this.bits.burst(p, n, 14, Bit.Spark, 1.4, 1.6, 0.5);
        this.bits.burst(p, n, C ? 4 : 18, Bit.Blood, 1.6, 1.8, 1.2);
        gore(1);
        apply?.();
        this.twitch = 1.2; this.flinchAt(n, 1.5);
        await this.wait(400);
        break;
      }
      case 'clipper': {
        this.op.runT = 1; this.op.wild = 1.6;
        sfx('boing');
        const hair = this.app?.hair ?? 0x3b2a1e;
        for (let i = 0; i < 8; i++) { this.bits.burst(p, this.v1.set(Math.random() - 0.5, 0.8, Math.random() - 0.3).normalize(), 18, Bit.Hair, 1.8, 1.4, 3, hair); if (i === 3) { apply?.(); this.flinchAt(n, 0.8); sfx('gasp'); } await this.wait(70); }
        this.op.wild = 0; this.op.runT = 0;
        break;
      }
      case 'spray': {
        this.op.runT = 1; this.op.wild = 0.8;
        sfx('spray'); sfx('hiss');
        for (let i = 0; i < 5; i++) { this.bits.burst(p, this.v1.copy(n).negate().add(this.v2.set(Math.random() - 0.5, Math.random() * 0.5, 0)).normalize(), 40, Bit.Mist, 1.4, 1.2, 1.6, this.op.paint); await this.wait(70); }
        this.lensFx.splat(3, this.op.paint);
        apply?.();
        sfx('gasp'); this.twitch = 0.8;
        await this.wait(260);
        this.op.wild = 0; this.op.runT = 0;
        break;
      }
      case 'injector': {
        this.op.strikeT = 0; this.op.strikeQ = 0; this.op.struck = false;
        await this.wait(150);
        sfx('crack'); sfx('inject');
        for (let i = 0; i < 6; i++) { this.bits.burst(p, this.v1.copy(n).add(this.v2.set(Math.random() - 0.5, 0.5, 0)).normalize(), 12, Bit.Drop, 2.6, 1, 1.4, this.op.paint); await this.wait(60); }
        this.lensFx.splat(2, this.op.paint);
        apply?.(); yelp();
        break;
      }
      case 'clamp': {
        this.op.strikeT = 0; this.op.strikeQ = 0; this.op.struck = false;
        sfx('squeeze');
        await this.wait(220);
        sfx('crack'); yelp();
        this.bits.burst(p, n, C ? 4 : 20, Bit.Blood, 1.5, 1.8, 1.3);
        gore(2, 'torso_u');
        apply?.();
        await this.wait(300);
        break;
      }
      case 'welder': {
        this.op.runT = 1; this.op.wild = 1;
        sfx('weld'); sfx('zap');
        this.flash = C ? 0.2 : 0.6;
        for (let i = 0; i < 6; i++) { this.bits.burst(p, n, 26, Bit.Spark, 2.8, 2.4, 0.7); this.bits.burst(p, n, 8, Bit.Ember, 1.2, 1.6, 1.2); await this.wait(70); }
        for (let i = 0; i < 12; i++) this.puffs.emit(this.v2.copy(p).addScaledVector(n, 0.04), this.v3.set((Math.random() - 0.5) * 0.14, 0.14 + Math.random() * 0.1, (Math.random() - 0.5) * 0.14), { life: 2.6, s0: 0.03, s1: 0.16, color: 0x3a3a3a, rise: 0.1 });
        this.soot = 3; this.rig?.setOutfit(this.dress());
        apply?.(); yelp();
        this.op.wild = 0; this.op.runT = 0;
        break;
      }
      case 'scanner': apply?.(); break;
    }
    T.hose?.shove(this.v1.set((Math.random() - 0.5) * 3, 2, 0));
    sfx('flub', 0.8);
  }
  /** the scanner arm sweeps an anchor (the live preview); off folds it away */
  scan(on: boolean, anchor?: string) {
    this.scanOn = on;
    if (anchor) this.scanAnchor = anchor;
    if (on && this.mode === 'lit') sfx('scan', 0.5);
  }
  /** a jolt to the subject from a direction (the head jerks away, the body swings) */
  private flinchAt(dir: THREE.Vector3, k: number) {
    this.flinch = Math.min(1.5, this.flinch + k);
    this.flinchDir.copy(dir);
    this.swayV.addScaledVector(dir, -0.25 * k);
  }

  // ---- screen positions for the 2D mini-games
  /** world -> client px (and whether it is in front of the camera) */
  project(v: THREE.Vector3): { x: number; y: number; vis: boolean } {
    const r = this.canvas.getBoundingClientRect();
    const p = this.v4.copy(v).project(this.cam);
    return { x: r.left + (p.x * 0.5 + 0.5) * r.width, y: r.top + (-p.y * 0.5 + 0.5) * r.height, vis: p.z < 1 };
  }
  private anchorWorld(name: string, out: THREE.Vector3): THREE.Vector3 | null {
    const a = ANCHORS[name];
    if (!a || !this.rig) return null;
    const s = this.headScale(a.bone);
    return this.rig.bones[a.bone].localToWorld(out.set(a.p[0] * s, a.p[1] * s, a.p[2] * s));
  }
  private headScale(bone: AnchorBone) {
    const s = this.app?.height || 1;
    return bone === 'head' ? s * (this.rig?.dims.headS ?? 1) : s;
  }
  /** where an anchor is on screen */
  anchorScreen(name: string): { x: number; y: number } | null {
    const w = this.anchorWorld(name, this.v5);
    return w ? this.project(w) : null;
  }
  /** a cut line on screen (client px), following the moving head */
  pathScreen(name: string): { x: number; y: number }[] {
    const P = PATHS[name];
    if (!P || !this.rig) return [];
    const bone = this.rig.bones[P.bone], s = this.headScale(P.bone);
    return P.pts.map((p) => { const w = bone.localToWorld(this.v5.set(p[0] * s, p[1] * s, p[2] * s)); const q = this.project(w); return { x: q.x, y: q.y }; });
  }
  /** where the tool's working point is on screen right now */
  toolScreen(): { x: number; y: number } | null {
    const T = this.arms[3];
    if (!T.tool) return null;
    return this.project(T.head.localToWorld(this.v5.set(0, T.tool.len, 0)));
  }
  private hitAt(x: number, y: number): THREE.Intersection | null {
    if (!this.rig || !this.lowW || !this.subj.visible) return null;
    const r = this.canvas.getBoundingClientRect();
    this.ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.cam);
    return this.ray.intersectObject(this.rig.skin, false)[0] ?? null;
  }

  /** the face maul: the saw goes in, screaming, blood and sparks; apply() swaps the face halfway (kept for callers) */
  async maul(apply: () => void) {
    if (this.maulT >= 0 || !this.rig || this.state === 'gone' || this.mode !== 'lit') { apply(); return; }
    this.maulT = 0;
    const prevShot = this.shotName;
    if (prevShot !== 'face') this.setShot('face', 500);
    this.useTool('saw', 'face');
    this.extraBlood = 2; this.bloodT = 0;
    this.rig.setOutfit(this.dress());
    await this.wait(420);
    this.toolWork(1); this.toolRun(1); this.toolPress(0.6);
    sfx('grind');
    await this.wait(380);
    sfx('squelch');
    this.splatLens(2);
    apply();
    await this.wait(420);
    this.toolWork(0); this.toolRun(0); this.toolPress(0);
    sfx('spark');
    this.maulT = -1;
    if (prevShot !== 'face') this.setShot(prevShot, 700);
  }

  /** the gender press: alarm, the slab comes down, the room is painted; apply() makes the clone; the arms bring it in */
  async press(apply: () => void) {
    if (this.busy || !this.rig) return;
    this.busy = true;
    const [L, R, H, T, Sc] = this.arms;
    this.view = 'gender';
    this.setShot('press', 900);
    this.alarm.intensity = calm() ? 3 : 14;
    sfx('klaxon');
    T.follow = { kind: 'stow' }; Sc.follow = { kind: 'stow' };
    const headTop = this.subj.position.y + 1.82 * (this.app?.height || 1);
    await this.animate(1100, (t) => { this.pressY = THREE.MathUtils.lerp(ROOM.H + 0.05, headTop + 0.12, ease(t)); this.struggle = t; });
    sfx('klaxon'); sfx('hiss');
    this.struggle = 1.5;
    await this.wait(500);
    H.gripT = 0; this.harness.visible = false; H.follow = { kind: 'stow' }; H.k = 120;
    L.gripT = R.gripT = 0; this.cuffs[0].visible = this.cuffs[1].visible = false;
    L.follow = { kind: 'point', p: new THREE.Vector3(1.5, 2.9, ROOM.BACK + 0.6) }; R.follow = { kind: 'point', p: new THREE.Vector3(-1.5, 2.9, ROOM.BACK + 0.6) };
    L.k = R.k = 140; L.c = R.c = 18;
    this.state = 'drop'; this.stateT = 0;
    sfx('clamp');
    await this.wait(120);
    const top0 = this.pressY;
    await this.animate(150, (t) => { this.pressY = THREE.MathUtils.lerp(top0, ROOM.PLATE_Y, easeIn(t)); });
    this.pressY = ROOM.PLATE_Y;
    this.state = 'gone'; this.subj.visible = false; this.chainsOn = 0; this.cuffs[2].visible = this.cuffs[3].visible = false;
    sfx('slam'); sfx('squelch');
    this.shake = calm() ? 0.3 : 1.2;
    this.flash = calm() ? 0.15 : 0.45; this.redFlash = calm() ? 0.25 : 0.7;
    this.splatter();
    this.pressBloody.visible = true;
    await this.wait(650);
    sfx('hiss');
    await this.animate(1500, (t) => { this.pressY = THREE.MathUtils.lerp(ROOM.PLATE_Y, ROOM.H + 0.05, ease(t)); if (Math.random() < 0.5) this.emitDrip(); });
    this.alarm.intensity = 0;
    apply();
    this.extraBlood = 0; this.gore = {}; this.soot = 0;
    this.rig?.setOutfit(this.dress());
    this.hatchT = 1; sfx('servo');
    await this.wait(600);
    this.subj.visible = true; this.squash = 1;
    this.subj.position.set(0, 1.25, ROOM.BACK - 2.2);
    this.state = 'carry'; this.stateT = -99;
    L.follow = { kind: 'bone', bone: 'handL', off: new THREE.Vector3(0, 0, 0) }; R.follow = { kind: 'bone', bone: 'handR', off: new THREE.Vector3(0, 0, 0) };
    L.k = R.k = 50; L.c = R.c = 11;
    await this.wait(700);
    L.gripT = R.gripT = 1; this.cuffs[0].visible = this.cuffs[1].visible = true; sfx('clamp');
    L.k = R.k = 400; L.c = R.c = 40;
    this.stateT = 0;
    this.liftFrom.copy(this.subj.position);
    this.liftTo.set(0, FLOAT_Y, ROOM.FLOAT_Z);
    this.liftMid.set(0, 2.0, -1.2);
    sfx('servo');
    await this.wait(1500);
    this.state = 'float'; this.stateT = 0;
    this.hatchT = 0;
    H.follow = { kind: 'bone', bone: 'chest', off: new THREE.Vector3(0, 0.15, -0.28) }; H.k = 40; H.c = 10;
    await this.wait(600);
    H.gripT = 1; this.harness.visible = true; sfx('clamp');
    this.chainsOn = 1; this.cuffs[2].visible = this.cuffs[3].visible = true;
    T.follow = { kind: 'tool' }; Sc.follow = { kind: 'scan' };
    await this.wait(300);
    this.busy = false;
  }
  // sequences run on the frame clock, so a slow device sees every beat of them
  private waiters: { t: number; res: () => void }[] = [];
  private tweens: { t0: number; dur: number; f: (t: number) => void; res: () => void }[] = [];
  private wait(ms: number) { return new Promise<void>((res) => this.waiters.push({ t: this.t + ms / 1000, res })); }
  private animate(ms: number, f: (t: number) => void) { return new Promise<void>((res) => this.tweens.push({ t0: this.t, dur: ms / 1000, f, res })); }
  private runClock() {
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i];
      const k = Math.min(1, (this.t - tw.t0) / tw.dur);
      tw.f(k);
      if (k >= 1) { this.tweens.splice(i, 1); tw.res(); }
    }
    for (let i = this.waiters.length - 1; i >= 0; i--) if (this.t >= this.waiters[i].t) this.waiters.splice(i, 1)[0].res();
  }

  // ================================================================== blood & decals
  private sparkBurst(p: THREE.Vector3, n: number, speed = 1) {
    for (let i = 0; i < n; i++) this.bits.emit(p.x, p.y, p.z, (Math.random() - 0.5) * 3 * speed, (Math.random() * 2.2 + 0.2) * speed, (Math.random() - 0.3) * 2.5 * speed, Bit.Spark, 0.25 + Math.random() * 0.45);
  }
  private bloodBurst(p: THREE.Vector3, dir: THREE.Vector3, n: number, spread: number, speed: number) {
    this.bits.burst(p, dir, n, Bit.Blood, speed, spread, 2);
  }
  private emitDrip() {
    const x = (Math.random() - 0.5) * 1.2, z = ROOM.FLOAT_Z + (Math.random() - 0.5) * 0.9;
    this.bits.emit(x, this.pressY - 0.01, z, 0, -0.2, 0, Bit.Blood, 2);
  }
  /** a decal on a surface: axis is the surface normal ('y' floor, '-y' ceiling, 'z' back wall, 'x' side walls) */
  private decal(x: number, y: number, z: number, axis: 'y' | 'z' | 'x' | '-y', size: number, mat?: THREE.Material) {
    let m = this.decals[this.decalNext];
    if (!m) { m = new THREE.Mesh(this.decalGeo, this.decalMats[0]); m.receiveShadow = true; this.scene.add(m); this.decals[this.decalNext] = m; }
    this.decalNext = (this.decalNext + 1) % 80;
    m.material = mat ?? this.decalMats[Math.floor(Math.random() * this.decalMats.length)];
    m.position.set(x, y, z);
    m.rotation.set(0, 0, 0);
    if (axis === 'y') m.rotation.set(-Math.PI / 2, 0, Math.random() * 6.28);
    else if (axis === '-y') m.rotation.set(Math.PI / 2, 0, Math.random() * 6.28);
    else if (axis === 'x') m.rotation.set(0, x < 0 ? Math.PI / 2 : -Math.PI / 2, Math.random() * 6.28);
    else m.rotation.set(0, 0, Math.random() * 6.28);
    m.scale.setScalar(size);
    m.visible = true;
  }
  private scorch(x: number, y: number, z: number, axis: 'y' | 'z' | 'x', size: number) { this.decal(x, y, z, axis, size, this.scorchMat); }
  /** the press has landed: everything in reach is painted */
  private splatter() {
    const z0 = ROOM.FLOAT_Z, Y = ROOM.PLATE_Y + 0.005;
    this.decal(0, Y + 0.002, z0, 'y', 1.6);
    for (let i = 0; i < 8; i++) { const a = Math.random() * 6.28, d = 0.8 + Math.random() * 1.6; this.decal(Math.cos(a) * d, 0.006 + i * 0.0004, z0 + Math.sin(a) * d * 0.8, 'y', 0.4 + Math.random() * 0.9); }
    for (let i = 0; i < 5; i++) this.decal((Math.random() - 0.5) * 4, 0.3 + Math.random() * 2.4, ROOM.BACK + 0.012 + i * 0.001, 'z', 0.4 + Math.random() * 0.9);
    for (const k of [-1, 1]) for (let i = 0; i < 2; i++) this.decal(k * (ROOM.W - 0.012 - i * 0.001), 0.3 + Math.random() * 1.8, -1 + Math.random() * 3, 'x', 0.5 + Math.random() * 0.7);
    for (let i = 0; i < 2; i++) this.decal((Math.random() - 0.5) * 3, ROOM.H - 0.01, z0 + (Math.random() - 0.5) * 2.5, '-y', 0.5 + Math.random() * 0.6);
    for (let i = 0; i < 6; i++) this.decal((Math.random() - 0.5) * 0.4, 0.4 + Math.random() * 1.6, ROOM.CHAIR_Z + 0.32 + i * 0.001, 'z', 0.15 + Math.random() * 0.25);
    const p = this.v1.set(0, ROOM.PLATE_Y + 0.12, z0);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * 6.28;
      this.bloodBurst(p, this.v2.set(Math.cos(a), 0.35, Math.sin(a)), 22, 1.6, 6);
    }
    this.splatLens(6);
  }
  /** drops on the lens (pixel drops that run and fade) */
  splatLens(n: number) {
    if (calm()) n = Math.min(n, 2);
    if (document.documentElement.classList.contains('reduce-flash')) return;
    this.lensFx.splat(n);
  }

  // ================================================================== input
  private bindInput() {
    const cv = this.canvas;
    cv.addEventListener('pointerdown', (e) => {
      if (this.mode !== 'lit' || this.inputLocked) return;
      cv.setPointerCapture(e.pointerId);
      this.ptr.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now(), head: this.partAt(e.clientX, e.clientY) === 'head', o0: this.orbitT });
    });
    cv.addEventListener('pointermove', (e) => {
      if (this.mode !== 'lit' || this.inputLocked) return;
      const p = this.ptr.get(e.pointerId);
      if (!p) { if (e.pointerType === 'mouse') this.setHoverPart(this.partAt(e.clientX, e.clientY), e.clientX, e.clientY); return; }
      p.x = e.clientX; p.y = e.clientY;
      const dx = p.x - p.x0, dy = p.y - p.y0;
      if (this.onSwipe) {
        if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.2) { p.x0 = p.x; p.y0 = p.y; p.t0 = 0; this.onSwipe(dx < 0 ? 1 : -1); }
        return;
      }
      if (p.head && Math.abs(dy) > 46 && Math.abs(dy) > Math.abs(dx) * 1.3) {
        p.y0 = p.y; p.t0 = 0;
        this.onHeadScroll?.(dy < 0 ? 1 : -1);
      } else if (!p.head || Math.abs(dx) > 30) {
        this.orbitT = Math.max(-1.1, Math.min(1.1, p.o0 + dx * 0.006));
        if (Math.abs(dx) > 6) { p.t0 = 0; this.setHoverPart(null, 0, 0); }
      }
    });
    const up = (e: PointerEvent) => {
      const p = this.ptr.get(e.pointerId);
      this.ptr.delete(e.pointerId);
      if (this.inputLocked) return;
      if (p && e.type === 'pointerup' && p.t0 && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) < 10 && performance.now() - p.t0 < 600) this.onPick?.(this.partAt(e.clientX, e.clientY));
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') this.setHoverPart(null, 0, 0); });
    cv.addEventListener('wheel', (e) => {
      if (this.mode !== 'lit' || this.inputLocked) return;
      e.preventDefault();
      if (this.onSwipe) {
        const now = performance.now();
        this.wheelAcc += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        if (Math.abs(this.wheelAcc) > 40 && now - this.wheelAt > 260) { this.wheelAt = now; this.onSwipe(this.wheelAcc > 0 ? 1 : -1); this.wheelAcc = 0; }
        return;
      }
      if (this.partAt(e.clientX, e.clientY) === 'head' || this.focusKey === 'head') {
        const now = performance.now();
        this.wheelAcc += e.deltaY;
        if (Math.abs(this.wheelAcc) > 40 && now - this.wheelAt > 450) { this.wheelAt = now; this.onHeadScroll?.(this.wheelAcc < 0 ? 1 : -1); this.wheelAcc = 0; }
      } else this.zoom = Math.max(0.55, Math.min(1.35, this.zoom * (e.deltaY > 0 ? 1.08 : 1 / 1.08)));
    }, { passive: false });
  }
  private setHoverPart(p: PartKey | null, x: number, y: number) {
    if (p !== this.hoverPart) this.canvas.classList.toggle('over', !!p);
    this.hoverPart = p;
    this.onHover?.(p, x, y);
  }
  /** the body part under a client point (by the texture-page region the ray hits) */
  partAt(x: number, y: number): PartKey | null {
    if (!this.rig || !this.lowW || !this.subj.visible) return null;
    const r = this.canvas.getBoundingClientRect();
    this.ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.cam);
    const hits = this.ray.intersectObject(this.rig.skin, false);
    for (const h of hits) {
      if (!h.uv) continue;
      const px = h.uv.x * PAGE, py = (1 - h.uv.y) * PAGE;
      for (const [rk, part] of REGION_PART) { const g = REG[rk]; if (px >= g.x - PAD && px <= g.x + g.w + PAD && py >= g.y - PAD && py <= g.y + g.h + PAD) return part; }
    }
    return null;
  }

  // ================================================================== frame
  /** low-res buffer, enlarged by a whole number of device pixels (hard pixels, never a fractional scale) */
  private resize() {
    if (!this.renderer) return;
    const w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight);
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const dw = w * dpr, dh = h * dpr;
    const target = this.quality === 'low' ? 480 * 270 : this.quality === 'medium' ? 560 * 315 : 640 * 360;
    const S = Math.max(2, Math.round(Math.sqrt((dw * dh) / target)));
    const lw = Math.max(32, Math.ceil(dw / S)), lh = Math.max(32, Math.ceil(dh / S));
    const cw = (lw * S) / dpr, ch = (lh * S) / dpr;
    Object.assign(this.canvas.style, { width: cw + 'px', height: ch + 'px', left: Math.floor((w - cw) / 2) + 'px', top: Math.floor((h - ch) / 2) + 'px' });
    if (lw === this.lowW && lh === this.lowH) return;
    this.lowW = lw; this.lowH = lh;
    this.renderer.setSize(lw, lh, false);
    this.rt?.dispose();
    this.rt = new THREE.WebGLRenderTarget(lw, lh, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, depthTexture: new THREE.DepthTexture(lw, lh) });
    const u = this.post.u;
    u.tColor.value = this.rt.texture; u.tDepth.value = this.rt.depthTexture; u.uRes.value.set(lw, lh);
    u.uNear.value = this.cam.near; u.uFar.value = this.cam.far;
    this.lensFx.resize(lw, lh);
    u.tLens.value = this.lensFx.tex;
  }

  /** lighting for a level of "lit" (0 title dark .. 1 tubes full on); the creator keeps the room dim and lights him */
  private applyLight(l: number) {
    const lit = this.mode === 'lit' ? l : 0;
    // a realistic floor of bounce light (shadows sit near 10% grey, never crushed); the creator keeps the room a step below him
    this.hemi.intensity = 0.32 + l * 0.6 - lit * 0.22;
    this.hemi.color.lerpColors(this.hemiDark, this.hemiLit, l);
    const u = this.post.u;
    // the cartoony colour stays (cool shadows, warm highlights, full saturation); only the gloom is gone
    u.uLift.value.set(0.88 + l * 0.08, 0.97 + l * 0.03, 1.14 - l * 0.1);
    u.uGain.value.set(1.08 - l * 0.04, 1.0 + l * 0.02, 0.88 + l * 0.06);
    u.uSat.value = 0.98; u.uContrast.value = 1.05;
    this.sun.intensity = l * 2.1 - lit * 1.2;
    this.fill.intensity = l * 0.7 - lit * 0.25;
    this.back.intensity = l * 0.9 - lit * 0.2;
    const c = 0.06 + l * 2.2;
    this.tubeMat.color.setRGB(c * 0.92, c, c * 1.04);
    this.surgLevel = lit;
  }

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, (now - this.last) / 1000) * this.timeScale;
    if (dt < this.timeScale / 62) return;
    this.last = now;
    if (document.hidden || this.paused || !this.renderer || !this.rt) return;
    this.t += dt;
    this.runClock();
    // ---- lights on / off
    if (this.litT > 0) {
      this.litT += dt;
      const k = this.litT;
      const on = k > 0.42 || (k > 0.05 && k < 0.12) || (k > 0.2 && k < 0.27) || (k > 0.33 && k < 0.36);
      this.lit = damp(this.lit, on ? 1 : 0.08, on ? 30 : 40, dt);
    } else this.lit = damp(this.lit, 0, 5, dt);
    // the title keeps the room's work lights half up (cool, readable); the creator brings them to full
    this.applyLight(this.mode === 'title' ? Math.max(this.lit, TITLE_LIGHT) : this.lit);
    this.updateLamp(dt);
    this.updateSurge(dt);
    // ---- hatch, alarm, lever
    this.hatchOpen = damp(this.hatchOpen, this.hatchT, 3, dt);
    this.shutter.position.y = this.hatchOpen * (ROOM.HATCH_H - 0.05);
    const hl = 0.35 + this.hatchOpen * (0.8 + 0.6 * Math.sin(this.t * 9));
    this.hatchLampMat.color.setRGB(hl * 1.6, hl * 0.12, hl * 0.06);
    this.hatchL.intensity = 0.22 + this.hatchOpen * 0.9 * (0.5 + 0.5 * Math.sin(this.t * 9));
    if (this.alarm.intensity > 0) this.alarm.target.position.set(Math.sin(this.t * 7) * 2.5, 0, ROOM.FLOAT_Z + Math.cos(this.t * 7) * 2);
    this.leverA = damp(this.leverA, this.leverT, 14, dt);
    this.lever.rotation.z = -this.leverA;
    // ---- the subject, his straps and cables, the arms and tools, the press
    this.updateSubject(dt);
    this.updateOp(dt);
    for (const a of this.arms) this.updateArm(a, dt);
    this.updateToolFx(dt);
    this.pressG.position.y = this.pressY;
    this.pressG.visible = this.pressY < ROOM.H + 1.0;
    this.updateRigging();
    this.staff.update(dt, this.rig ? this.rig.bones.head.getWorldPosition(this.v3) : undefined);
    // ---- fx
    this.bits.update(dt);
    this.arcs.update(dt);
    this.screen.update(dt, this.t, 1 - this.surgeK * 0.6);
    this.crt.intensity = (0.065 + 0.025 * this.screen.beat) * (1 - this.lit * 0.6) * (1 - this.surgeK * 0.5);
    if (this.extraBlood && this.maulT < 0) { this.bloodT += dt; if (this.bloodT > 5 && this.extraBlood > 1) { this.extraBlood = 1; this.rig?.setOutfit(this.dress()); } }
    // ---- camera, then the fx that face it
    this.updateCamera(dt);
    this.updateCloseLights(dt);
    this.puffs.update(dt, this.cam, (p) => this.lightAt(p));
    // ---- composite
    this.flash = Math.max(0, this.flash - dt * 2.2);
    this.redFlash = Math.max(0, this.redFlash - dt * 0.8);
    const u = this.post.u;
    u.uTime.value = this.t; u.uFlash.value = this.flash + this.surgeK * 0.04; u.uRed.value = this.redFlash;
    const title = 1 - this.lit;
    u.uExposure.value = ((this.mode === 'title' ? 1.18 : 1.12) + this.lit * 0.1) * 1.38;
    u.uVig.value = 0.22 + title * 0.1 + (this.mode === 'lit' ? 0.08 + this.closeK * 0.1 : 0);
    const portrait = this.lowW < this.lowH;
    // no dark side panel, no dark floor band: the 2D words carry their own ink outline
    u.uSide.value.set(portrait ? 0 : 1, portrait ? 1 : 0, (this.mode === 'title' ? 0.08 : 0.0) * title, portrait ? 0.42 : 0.45);
    u.uFloor.value = 0;
    u.uLensOn.value = this.lensFx.update(dt) || this.lensFx.active ? 1 : 0;
    this.render();
  };

  /** how much light falls on a point (vapour and smoke only show where it does) */
  private lightAt(p: THREE.Vector3): number {
    const L = this.v4.setFromMatrixPosition(this.key.matrixWorld);
    const d = p.distanceTo(L);
    return Math.min(1.2, this.bulbLevel * (this.mode === 'title' ? 0.32 : 0.14) / (0.25 + d * d) + this.surgeK * 0.5 + this.lit * 0.1 + this.toolL.intensity * 0.05);
  }

  /** the caged lamp: a pendulum, a buzz, dropouts, browning out when the chair draws */
  private updateLamp(dt: number) {
    const t = this.t, calmNow = calm();
    this.swingA = damp(this.swingA, 0.085, 0.08, dt); this.swingB = damp(this.swingB, 0.05, 0.08, dt);
    this.bulbPivot.position.y = ROOM.H + this.lit * 0.85;
    const w = Math.sqrt(9.8 / LAMP.L);
    this.bulbPivot.rotation.set(Math.sin(t * w + 1.1) * this.swingB, 0, Math.sin(t * w) * this.swingA);
    this.flk -= dt;
    if (this.flk < 0) {
      if (!calmNow && Math.random() < 0.12) { this.dropT = 0.04 + Math.random() * 0.16; this.flk = this.dropT + 0.3; }
      else this.flk = 0.6 + Math.random() * 2.4;
    }
    this.dropT = Math.max(0, this.dropT - dt);
    this.nudge = Math.max(0, this.nudge - dt * 2.5);
    const buzz = 0.94 + Math.random() * 0.06;
    const drop = this.dropT > 0 ? (Math.random() < 0.5 ? 0.06 : 0.35) : 1;
    const brown = 1 - this.surgeK * (0.75 + Math.random() * 0.2);
    this.bulbLevel = Math.max(0.02, buzz * drop * brown + this.nudge * 0.25);
    const title = this.mode === 'title' ? 1 - this.lit : 0;
    this.key.intensity = this.bulbLevel * (0.3 + title * 0.78);
    this.bounce.intensity = this.bulbLevel * title * 0.05;
    const g = 0.5 + this.bulbLevel * 5;
    this.bulbMat.color.setRGB(g * 1.0, g * 0.72, g * 0.42);
    this.shaft.mesh.scale.set(Math.tan(0.52) * 1.7, 1.7, Math.tan(0.52) * 1.7);
    this.shaft.u.uInt.value = 0.02 * this.bulbLevel * (0.2 + title * 0.8);
    // the operating lamp: it stutters on with the tubes, then a steady white
    const sl = this.surgLevel * (this.litT > 0 && this.litT < 0.9 ? (Math.random() < 0.6 ? 1 : 0.2) : 1);
    this.surg.intensity = sl * 24 * (1 - this.surgeK * 0.3);
    const sb = 0.1 + sl * 3.2;
    this.surgBulbMat.color.setRGB(sb, sb * 0.95, sb * 0.86);
    this.surgShaft.u.uInt.value = 0.012 * sl;
    // the rims and the dust
    this.rimL.intensity = (8 + this.lit * 5) * (1 - this.surgeK * 0.3);
    this.rimR.intensity = 4.5 + this.lit * 3.5;
    this.leakL.intensity = 3.4 * (1 - this.lit * 0.7);
    this.leak.u.uInt.value = 0.14 * (0.3 + title * 0.7) * (0.9 + Math.sin(t * 0.7) * 0.1);
    if (this.rig) { this.rig.bones.head.getWorldPosition(this.v1); this.rimL.target.position.copy(this.v1); this.rimR.target.position.copy(this.v1); this.surg.target.position.lerpVectors(this.v1, this.rig.bones.chest.getWorldPosition(this.v2), 0.4); }
    else { this.rimL.target.position.set(0, 1.3, -0.55); this.rimR.target.position.set(0, 1.3, -0.55); }
    this.bulbPivot.updateMatrixWorld(true);
    if (this.mode === 'lit' && this.lit > 0.5) {
      // in the creator the motes turn in the operating lamp's cone
      const dir = this.v3.subVectors(this.surg.target.position, SURG.at).normalize();
      this.dust.update(t, SURG.at, dir, Math.cos(0.5), Math.cos(0.3), sl * 0.9, this.surg.color, 0);
    } else {
      const L = this.v2.setFromMatrixPosition(this.key.matrixWorld);
      const dir = this.v3.setFromMatrixPosition(this.key.target.matrixWorld).sub(L).normalize();
      this.dust.update(t, L, dir, Math.cos(0.5), Math.cos(0.3), this.bulbLevel * (0.25 + title * 0.9), this.key.color, 0);
    }
  }

  /** the close-up lights: a soft key camera-left and a cold fill camera-right, stronger the closer the shot */
  private updateCloseLights(dt: number) {
    const close = this.shotName === 'title' ? 0 : SHOTS[this.shotName] && this.shotName !== 'skin' ? 1 : this.shotName === 'prisoner' ? 0.7 : this.shotName === 'body' || this.shotName === 'skin' ? 0.45 : 0;
    this.closeK = damp(this.closeK, close, 3, dt);
    const head = this.rig ? this.rig.bones.head.getWorldPosition(this.v1) : this.v1.set(0, 1.6, ROOM.FLOAT_Z);
    const right = this.v2.setFromMatrixColumn(this.cam.matrixWorld, 0);
    const fwd = this.v3.setFromMatrixColumn(this.cam.matrixWorld, 2);
    // the key: up and to the camera's left, a metre out
    this.faceKey.position.copy(head).addScaledVector(right, -0.75).addScaledVector(fwd, 0.7).add(this.v4.set(0, 0.45, 0));
    this.faceKey.target.position.copy(head);
    const lvl = this.mode === 'lit' ? this.lit : 0.35;
    this.faceKey.intensity = this.closeK * lvl * 7;
    this.faceFill.position.copy(head).addScaledVector(right, 0.7).addScaledVector(fwd, 0.5).add(this.v4.set(0, -0.1, 0));
    this.faceFill.intensity = this.closeK * lvl * 0.9 + (this.mode === 'title' ? 0.12 * (1 - this.lit) : 0);
  }

  /** the chair at work: a full surge every several seconds, small crackles between */
  private updateSurge(dt: number) {
    const seated = this.state === 'seat' && this.strapped && this.mode === 'title' && this.lit < 0.2;
    const calmNow = calm();
    if (seated) {
      this.nextSurge -= dt;
      if (this.nextSurge < 0) this.startSurge();
      this.crackle -= dt;
      if (this.crackle < 0) { this.crackle = 0.8 + Math.random() * 2.6; this.crackleNow(false); }
    }
    if (this.surgeT > 0) {
      this.surgeT -= dt;
      const k = 1 - this.surgeT / this.surgeLen;
      const env = Math.min(1, k * 8) * (1 - easeIn(k));
      // stuttering: the current comes in hits
      this.surgeK = env * (Math.random() < 0.6 ? 1 : 0.3) * (calmNow ? 0.45 : 1);
      this.twitch = Math.max(this.twitch, env);
      if (this.capOn.visible) {
        this.capTip.getWorldPosition(this.v1);
        if (Math.random() < dt * 30) this.arcToCap(this.v1);
        if (Math.random() < dt * 18) this.sparkBurst(this.v1, 4 + Math.floor(Math.random() * 6), 0.9);
        if (Math.random() < dt * 10 && this.rig) { this.capRimPoint(this.v2); this.sparkBurst(this.v2, 3, 0.7); }
      }
      if (this.surgeT <= 0) {
        this.surgeT = 0;
        // a breath of smoke off the cap
        if (this.capOn.visible) for (let i = 0; i < 6; i++) { this.capTip.getWorldPosition(this.v1); this.v1.y -= 0.05 + Math.random() * 0.05; this.puffs.emit(this.v1, this.v2.set((Math.random() - 0.5) * 0.06, 0.08 + Math.random() * 0.06, (Math.random() - 0.5) * 0.06), { life: 2.6, s0: 0.02, s1: 0.14, color: 0x1a1a1a, rise: 0.04 }); }
      }
    } else this.surgeK = 0;
    this.pop = Math.max(0, this.pop - dt * 9);
    this.surge.intensity = this.surgeK * 0.85 + this.pop * 0.3;
    if (this.capOn.visible) this.capTip.getWorldPosition(this.surge.position); else this.capHangTip.getWorldPosition(this.surge.position);
    this.surge.position.z += 0.12;
  }
  private startSurge() {
    const calmNow = calm();
    this.surgeLen = this.surgeT = 0.7 + Math.random() * 0.7;
    this.nextSurge = 6.5 + Math.random() * 6.5 + (calmNow ? 8 : 0);
    this.shake = Math.max(this.shake, calmNow ? 0 : 0.2);
    this.swingA = Math.min(0.17, this.swingA + 0.05); this.swingB = Math.min(0.12, this.swingB + 0.03);
    this.struggle = Math.max(this.struggle, 0.6);
    sfx('buzz', 0.55); sfx('spark', 0.6);
  }
  /** a small crackle off the cap (also the menu press) */
  private crackleNow(loud: boolean) {
    if (!this.capOn.visible && !this.capHang.visible) return;
    (this.capOn.visible ? this.capTip : this.capHangTip).getWorldPosition(this.v1);
    this.arcToCap(this.v1);
    this.sparkBurst(this.v1, loud ? 9 : 3, 0.6);
    this.pop = loud ? 1 : 0.45;
    if (loud || Math.random() < 0.4) sfx('spark', loud ? 0.5 : 0.25);
    if (loud) this.twitch = Math.max(this.twitch, 0.5);
  }
  private capRimPoint(out: THREE.Vector3) {
    const a = Math.random() * Math.PI * 2;
    out.set(Math.sin(a) * 0.125, 0.14 - Math.cos(a) * 0.03, Math.cos(a) * 0.125);
    return this.capOn.localToWorld(out);
  }
  private arcToCap(from: THREE.Vector3) {
    // from the terminal to the rim, or down the chin strap's buckle
    const to = Math.random() < 0.7 ? this.capRimPoint(this.v3) : this.capOn.localToWorld(this.v3.set(0.1, 0.055, 0.03));
    this.arcs.strike(from, to, 0.05 + Math.random() * 0.1, 0.3);
    if (Math.random() < 0.3) this.arcs.strike(from, this.v4.copy(from).add(this.v2.set((Math.random() - 0.5) * 0.14, 0.04 + Math.random() * 0.1, (Math.random() - 0.5) * 0.12)), 0.04, 0.35);
  }

  private updateSubject(dt: number) {
    const rig = this.rig;
    if (!rig) return;
    this.stateT += dt;
    this.twitch = Math.max(0, this.twitch - dt * 3);
    const t = this.t;
    let pose: Pose | null = null;
    const working = this.op.work > 0.5 && this.op.run > 0.3;
    const panic = this.state === 'float' || this.state === 'lift' || this.maulT >= 0 ? 0.6 + (this.maulT >= 0 || working ? 0.4 : 0) : 0;
    try { const r = (rig as any).update(dt, panic ? { panic } : undefined); pose = r && typeof r === 'object' ? r : null; } catch { pose = null; }
    if (!pose) pose = {};
    const seat = this.seatPose(t);
    const fl = this.floatPose(t);
    let p: Pose;
    // the body swinging in its restraints
    this.swayV.addScaledVector(this.sway, -26 * dt).multiplyScalar(Math.exp(-2.4 * dt));
    this.sway.addScaledVector(this.swayV, dt);
    this.sway.clampLength(0, 0.12);
    if (this.state === 'seat') {
      p = blendPose(pose, seat, 1);
      this.seatPos(this.subj.position);
    } else if (this.state === 'lift' || this.state === 'carry') {
      const k = ease(Math.max(0, Math.min(1, this.stateT / 1.4)));
      const back = this.state === 'carry' && this.mode === 'lit' && this.liftTo.y < 0;
      if (this.stateT >= 0) {
        const a = this.v1.copy(this.liftFrom).lerp(this.liftMid, k), b = this.v2.copy(this.liftMid).lerp(this.liftTo, k);
        this.subj.position.copy(a.lerp(b, k));
      }
      const limp = this.state === 'carry' && !back ? this.limpPose() : null;
      p = back ? blendPose(blendPose(pose, fl, 1), seat, k) : limp ? blendPose(blendPose(pose, limp, 1), fl, k) : blendPose(blendPose(pose, seat, 1), fl, k);
      if (k >= 1 && this.state === 'lift') { this.state = 'float'; this.stateT = 0; }
    } else if (this.state === 'drop') {
      p = blendPose(pose, fl, 1);
      const y = this.subj.position.y;
      this.subj.position.y = Math.max(ROOM.PLATE_Y, y - dt * (1 + this.stateT * 9));
    } else {
      p = blendPose(pose, fl, 1);
      if (this.state === 'float') this.subj.position.set(Math.sin(t * 0.7) * 0.015 + this.sway.x, FLOAT_Y + Math.sin(t * 1.1) * 0.012 + this.sway.y * 0.3, ROOM.FLOAT_Z + this.sway.z);
    }
    // the slab coming down squashes whatever is under it
    const H = (this.app?.height || 1) * 1.8;
    const top = this.subj.position.y + H;
    if (this.pressY < top && this.subj.visible) {
      const room = Math.max(0.02, this.pressY - this.subj.position.y);
      this.squash = Math.max(0.03, room / H);
      if (this.squash < 0.97 && Math.random() < 0.5) this.bloodBurst(this.v3.set(0, this.pressY - 0.05, ROOM.FLOAT_Z), this.v4.set((Math.random() - 0.5), 0.2, (Math.random() - 0.5)), 3, 2.5, 3);
    } else this.squash = damp(this.squash, 1, 8, dt);
    this.subj.scale.set(1 + (1 - this.squash) * 0.9, this.squash, 1 + (1 - this.squash) * 0.9);
    // twitches, struggling, the work on him, and the surge locking every muscle
    const tw = this.twitch * (calm() ? 0.3 : 1), st = this.struggle, ma = this.maulT >= 0 || working ? 1 : 0, sg = this.surgeK;
    const add = (k: keyof Pose, x: number, y: number, z: number) => { const v = (p as any)[k] || [0, 0, 0]; (p as any)[k] = [v[0] + x, v[1] + y, v[2] + z]; };
    if (tw > 0.01 || st > 0.01 || ma) {
      const n = (f: number, o: number) => Math.sin(t * f + o) * (tw * 0.25 + st * 0.12 + ma * 0.1) + (Math.random() - 0.5) * (tw * 0.22 + ma * 0.08);
      add('head', n(31, 0) - (this.maulT >= 0 ? 0.35 : 0), n(23, 1) * 1.5, n(19, 2));
      add('chest', n(17, 3) * 0.6, n(13, 4) * 0.6, n(11, 5) * 0.4);
      add('thighL', n(9, 6), 0, n(7, 7) * 0.3); add('thighR', n(8, 8), 0, n(10, 9) * 0.3);
      add('shinL', Math.abs(n(12, 10)), 0, 0); add('shinR', Math.abs(n(14, 11)), 0, 0);
      (p as any).gripL = 1; (p as any).gripR = 1;
    }
    // a flinch away from the tool
    if (this.flinch > 0.01) {
      this.flinch = Math.max(0, this.flinch - dt * 2.4);
      const f = this.flinch * this.flinch * 0.5, d = this.flinchDir;
      add('head', -d.y * f * 0.6 - f * 0.25, -d.x * f * 0.8, d.x * f * 0.4);
      add('chest', -f * 0.15, -d.x * f * 0.2, 0);
    }
    if (sg > 0.01 && this.state === 'seat') {
      add('head', -0.32 * sg, (Math.random() - 0.5) * 0.06 * sg, (Math.random() - 0.5) * 0.08 * sg);
      add('chest', -0.1 * sg, 0, 0); add('neck', -0.12 * sg, 0, 0);
      add('handL', 0, 0, 0.3 * sg); add('handR', 0, 0, -0.3 * sg);
      (p as any).gripL = 1; (p as any).gripR = 1;
    }
    this.struggle = Math.max(0, this.struggle - dt * 0.25);
    rig.applyPose(p);
    // the head's jelly squash (the stamp)
    this.headSqV += ((1 - this.headSq) * 220 - this.headSqV * 9) * dt;
    this.headSq += this.headSqV * dt;
    if (Math.abs(this.headSq - 1) > 0.002 || Math.abs(this.headSqV) > 0.01) { const q = this.headSq; rig.bones.head.scale.set(1 + (1 - q) * 0.6, q, 1 + (1 - q) * 0.6); }
    else if (rig.bones.head.scale.y !== 1) rig.bones.head.scale.set(1, 1, 1);
    // breath: on each out-breath a little vapour in the cold, lit where the lamp catches it
    const br = Math.sin(t * 1.4);
    if (this.breathPrev > 0.2 && br <= 0.2 && this.subj.visible && !calm()) {
      const head = rig.bones.head;
      for (let i = 0; i < 5; i++) {
        const mp = head.localToWorld(this.v1.set((Math.random() - 0.5) * 0.02, 0.035 * (this.app?.height || 1), 0.11 * (this.app?.height || 1)));
        const dir = this.v2.set(0, -0.15, 1).applyQuaternion(head.getWorldQuaternion(this.q1)).multiplyScalar(0.12 + Math.random() * 0.08);
        dir.x += (Math.random() - 0.5) * 0.04; dir.y += (Math.random() - 0.3) * 0.03;
        this.puffs.emit(mp, dir, { life: 1.4 + Math.random() * 0.6, s0: 0.005, s1: 0.03 + Math.random() * 0.025, color: 0x2c343a, rise: 0.03 });
      }
    }
    this.breathPrev = br;
    // sweat glints, the eyes catch the light
    this.sweat.group.visible = this.strapped && this.state === 'seat';
    const glint = this.bulbLevel * (this.mode === 'title' ? 1.2 : 0.5) + this.surgeK * 2.5 + this.pop + this.closeK * 0.6;
    this.sweat.update(dt, glint);
    const e = Math.min(1.8, 0.35 + glint * 0.8);
    (this.eyes.material as THREE.PointsMaterial).color.setRGB(e, e, e * 0.95);
    this.eyes.visible = this.subj.visible && (t % 4.3) > 0.12;
  }
  private seatPose(t: number): Pose {
    const br = Math.sin(t * 1.4) * 0.02;
    return {
      spine: [0.06 + br, 0, 0], chest: [0.03 - br * 0.5, 0, 0.02], neck: [0.04, 0, 0], head: [0.05 + Math.sin(t * 0.3) * 0.04, 0.24 + Math.sin(t * 0.17) * 0.06, 0.04],
      thighL: [-1.5, 0, 0.07], thighR: [-1.5, 0, -0.07], shinL: [1.45, 0, 0], shinR: [1.45, 0, 0], footL: [0.12, 0, 0], footR: [0.12, 0, 0],
      uarmL: [-0.32, 0, 0.32], uarmR: [-0.32, 0, -0.32], farmL: [-1.28, 0, -0.05], farmR: [-1.28, 0, 0.05], handL: [0.1, 0, 0.2], handR: [0.1, 0, -0.2],
      gripL: 0.85, gripR: 0.85,
    };
  }
  private floatPose(t: number): Pose {
    // under the knife he holds his head still and looks at the camera; otherwise he looks round
    const still = this.op.work > 0.3 || this.closeK > 0.6 ? 0.25 : 1;
    const look = (Math.sin(t * 0.43) * 0.5 + Math.sin(t * 1.7) * 0.08) * still;
    return {
      uarmL: [0.05, 0, 1.55], uarmR: [0.05, 0, -1.55], farmL: [-0.12, 0, 0.1], farmR: [-0.12, 0, -0.1], handL: [0, 0, 0.1], handR: [0, 0, -0.1],
      spine: [0.02, 0, 0], chest: [-0.04, look * 0.1, 0], head: [0.04 + Math.sin(t * 0.61) * 0.1 * still, look, Math.sin(t * 0.37) * 0.06 * still],
      thighL: [-0.05 + Math.max(0, Math.sin(t * 0.9)) * 0.12, 0, 0.11], thighR: [-0.05 + Math.max(0, Math.sin(t * 0.9 + 2)) * 0.12, 0, -0.11],
      shinL: [0.12, 0, 0], shinR: [0.14, 0, 0], footL: [0.55, 0, 0], footR: [0.55, 0, 0],
      gripL: 0.9, gripR: 0.9,
    };
  }
  private limpPose(): Pose {
    return { head: [0.7, 0.2, 0.15], chest: [0.15, 0, 0], spine: [0.1, 0, 0], thighL: [0.06, 0, 0.05], thighR: [0.02, 0, -0.05], shinL: [0.2, 0, 0], shinR: [0.25, 0, 0], footL: [0.7, 0, 0], footR: [0.7, 0, 0], gripL: 0.2, gripR: 0.2 };
  }

  /** the cables to the cap and the leg, the ankle chains */
  private updateRigging() {
    if (this.capOn.visible && this.rig) this.capTip.getWorldPosition(this.v1); else this.capHangTip.getWorldPosition(this.v1);
    this.capCable.update(this.v1, CAP_ANCHOR, 0.12 + Math.sin(this.t * 0.6) * 0.01, 0.06);
    if (this.legCable.mesh.visible && this.rig) { this.legTip.getWorldPosition(this.v1); this.legCable.update(this.v1, JUNCTION, 0.25, -0.05); }
    for (let i = 0; i < 2; i++) {
      const ch = this.chains[i];
      ch.mesh.visible = this.chainsOn > 0 && this.subj.visible && !!this.rig;
      if (!ch.mesh.visible) continue;
      this.cuffs[2 + i].getWorldPosition(this.v1);
      this.v2.set(i ? -0.34 : 0.34, ROOM.PLATE_Y + 0.05, ROOM.FLOAT_Z + 0.1);
      ch.update(this.v2, this.v1, 0.03);
    }
  }

  // ---- the operation: where the tool goes, what it does
  /** resolve the anchor on the real skin (a ray from outside along its normal), kept in bone space */
  private resolveAnchor() {
    const op = this.op, rig = this.rig;
    if (!rig) return;
    const a = ANCHORS[op.anchor] ?? ANCHORS.face;
    op.bone = a.bone;
    const bone = rig.bones[a.bone];
    const s = this.headScale(a.bone);
    const p = bone.localToWorld(this.v1.set(a.p[0] * s, a.p[1] * s, a.p[2] * s));
    const n = this.v2.set(a.n[0], a.n[1], a.n[2]).normalize().transformDirection(bone.matrixWorld);
    this.ray.set(this.v3.copy(p).addScaledVector(n, 0.25), this.v4.copy(n).negate());
    this.ray.far = 0.45;
    const hit = this.ray.intersectObject(rig.skin, false)[0];
    this.ray.far = Infinity;
    if (hit) p.copy(hit.point);
    op.local.copy(p); bone.worldToLocal(op.local);
    op.localN.set(a.n[0], a.n[1], a.n[2]).normalize();
    op.resolved = true;
  }
  private updateOp(dt: number) {
    const op = this.op, rig = this.rig;
    op.work = damp(op.work, op.workT, 7, dt);
    op.press = damp(op.press, op.pressT, 10, dt);
    op.run = damp(op.run, op.runT, op.runT > op.run ? 14 : 6, dt);
    if (!rig) return;
    if (!op.manual) { op.resolveT -= dt; if (op.resolveT <= 0) { this.resolveAnchor(); op.resolveT = 0.25; } }
    else op.bone = op.bone || 'head';
    const bone = rig.bones[op.bone] ?? rig.bones.head;
    op.wp.copy(op.local); bone.localToWorld(op.wp);
    op.wn.copy(op.localN).transformDirection(bone.matrixWorld);
    // the tool comes in from the left of the picture and a little above (never between the lens and him, never through him)
    const T = this.arms[3];
    const cr = this.v2.setFromMatrixColumn(this.cam.matrixWorld, 0), cu = this.v3.setFromMatrixColumn(this.cam.matrixWorld, 1), cb = this.v4.setFromMatrixColumn(this.cam.matrixWorld, 2);
    const app = op.app.copy(op.wn).multiplyScalar(0.45).addScaledVector(cr, -0.95).addScaledVector(cu, 0.42).addScaledVector(cb, -0.12);
    if (op.wild > 0) app.add(this.v1.set(Math.sin(this.t * 23) * op.wild, Math.cos(this.t * 17) * op.wild * 0.6, Math.sin(this.t * 13) * op.wild * 0.4));
    app.normalize();
    if (app.dot(op.wn) < 0.15) app.addScaledVector(op.wn, 0.5).normalize();
    // the strike: lunge in, land, back out
    if (op.strikeT >= 0) {
      op.strikeT += dt / 0.32;
      const k = op.strikeT;
      op.hit = k < 0.4 ? easeIn(k / 0.4) : Math.max(0, 1 - (k - 0.4) / 0.6);
      if (!op.struck && k >= 0.4) { op.struck = true; this.strikeLand(op.strikeQ); }
      if (k >= 1) { op.strikeT = -1; op.hit = 0; const r = op.strikeRes; op.strikeRes = null; r?.(); }
    }
    // music to the motor
    const lk = T.tool ? TOOL_LOOP[T.tool.kind] ?? null : null;
    const want = op.run > 0.05 && this.mode === 'lit' ? lk : null;
    if (want !== this.loopKind) { this.loop?.stop(); this.loop = want ? loopSfx(want) : null; this.loopKind = want; }
    this.loop?.set(op.run * (0.6 + (op.touching ? 0.4 : 0)), 1 + (op.touching ? -0.12 : 0) + op.press * -0.1);
  }
  /** a strike landed: per tool, a thump and its debris */
  private strikeLand(q: number) {
    const T = this.arms[3], kind = T.tool?.kind;
    const p = this.v5.copy(this.op.wp), n = this.op.app;
    const clean = q > 0.5;
    switch (kind) {
      case 'stamp': sfx('thunk'); this.bits.burst(p, n, 8, Bit.Chip, 1.2, 1.4, 0.8, 0xa89880); this.headSqV -= clean ? 2.2 : 5; this.flinchAt(n, 0.4); this.shake = Math.max(this.shake, 0.25); break;
      case 'clamp': sfx('squeeze'); this.flinchAt(n, 0.3); break;
      case 'injector': sfx('inject'); this.bits.burst(p, n, clean ? 4 : 10, Bit.Drop, 1, 0.8, 0.8, this.op.paint); this.flinchAt(n, 0.5); if (!clean) sfx('gasp'); break;
      case 'welder': sfx('weld'); this.bits.burst(p, n, 18, Bit.Spark, 2.2, 2, 0.5); this.bits.burst(p, n, 4, Bit.Ember, 0.8, 1, 1); this.flash = Math.max(this.flash, 0.12); this.flinchAt(n, 0.3); break;
      case 'clipper': sfx('clip'); this.bits.burst(p, this.v4.copy(n).add(this.v1.set(0, 0.5, 0)).normalize(), 22, Bit.Hair, 1.1, 1.2, 3, this.app?.hair ?? 0x3b2a1e); break;
      case 'scalpel': sfx('slice'); this.bits.burst(p, n, calm() ? 2 : 8, Bit.Blood, 1.3, 0.9, 1); this.flinchAt(n, 0.4); break;
      case 'saw': sfx('saw'); this.bits.burst(p, n, 14, Bit.Spark, 2, 1.6, 0.5); this.bits.burst(p, n, calm() ? 2 : 10, Bit.Blood, 1.8, 1.6, 1.2); break;
      case 'laser': sfx('zap'); this.bits.burst(p, n, 8, Bit.Ember, 1, 1, 0.8); break;
      case 'spray': sfx('spray'); this.bits.burst(p, this.v4.copy(n).negate(), 30, Bit.Mist, 1.2, 0.6, 1.2, this.op.paint); break;
      default: sfx('press');
    }
    T.phys.kick(n, 1.2 + (clean ? 0 : 1.5));
    T.hose?.shove(this.v4.copy(n).multiplyScalar(1.5));
    this.swayV.addScaledVector(n, -0.12);
  }
  /** what the working tool throws while it runs on the skin */
  private updateToolFx(dt: number) {
    const T = this.arms[3], S = this.arms[4], op = this.op;
    const tm = T.tool;
    // the scanner's light and fan
    if (S.tool) {
      const tip = S.head.localToWorld(this.v1.set(0, S.tool.len, 0));
      const reach = Math.max(0.05, tip.distanceTo(this.scanPoint(this.v2)) * 1.05);
      this.scanLevel = damp(this.scanLevel, this.scanOn && this.mode === 'lit' && S.follow.kind === 'scan' ? 1 : 0, 6, dt);
      animateTool(S.tool, dt, this.t, this.scanLevel, 0, reach);
      this.scanL.position.copy(tip);
      this.scanL.intensity = this.scanLevel * (0.35 + Math.sin(this.t * 31) * 0.05);
    }
    if (!tm) { this.toolL.intensity = 0; return; }
    const tip = T.head.localToWorld(this.v1.set(0, tm.len, 0));
    const dist = tip.distanceTo(op.wp);
    const touch = dist < tm.standoff + 0.035 && op.work > 0.6;
    op.touching = touch;
    animateTool(tm, dt, this.t, op.run, Math.max(op.hit, tm.kind === 'clamp' || tm.kind === 'injector' ? op.press : 0), Math.max(0.02, dist + 0.01));
    // the practical light at the tip
    const lt = tm.kind === 'welder' ? op.run * (1.2 + Math.random() * 1.6) : tm.kind === 'laser' ? op.run * (0.6 + Math.random() * 0.3) : tm.kind === 'saw' && touch ? op.run * (0.4 + Math.random() * 0.8) : 0;
    this.toolL.color.setHex(tm.glow || 0xffa040);
    this.toolL.intensity = damp(this.toolL.intensity, lt, 20, dt);
    this.toolL.position.copy(touch ? op.wp : tip).addScaledVector(op.app, 0.05);
    if (op.run < 0.1 || !touch) { op.emitAcc = 0; return; }
    // continuous debris at the working point
    op.emitAcc += dt * op.run;
    const p = this.v2.copy(op.wp).addScaledVector(op.app, 0.004), n = op.app;
    const C = calm();
    while (op.emitAcc > 1 / 60) {
      op.emitAcc -= 1 / 60;
      switch (tm.kind) {
        case 'saw': this.bits.burst(p, n, 3, Bit.Spark, 2, 1.4, 0.4); if (!C && Math.random() < 0.6) this.bits.burst(p, n, 2, Bit.Blood, 1.6, 1.2, 1.2); if (Math.random() < 0.2) this.bits.burst(p, n, 1, Bit.Chip, 1.2, 1, 1); break;
        case 'laser': if (Math.random() < 0.5) this.bits.burst(p, n, 1, Bit.Ember, 0.6, 0.6, 0.6); if (Math.random() < 0.15) this.puffs.emit(p, this.v3.set((Math.random() - 0.5) * 0.04, 0.08, (Math.random() - 0.5) * 0.04), { life: 1.6, s0: 0.006, s1: 0.04, color: 0x4a4038, rise: 0.06 }); break;
        case 'welder': this.bits.burst(p, n, 3, Bit.Spark, 2.4, 2, 0.45); if (Math.random() < 0.2) this.puffs.emit(p, this.v3.set((Math.random() - 0.5) * 0.05, 0.1, (Math.random() - 0.5) * 0.05), { life: 1.8, s0: 0.01, s1: 0.06, color: 0x404040, rise: 0.08 }); break;
        case 'clipper': this.bits.burst(p, this.v3.copy(n).add(this.v4.set(0, 0.4, 0)).normalize(), 2, Bit.Hair, 0.9, 1, 2.6, this.app?.hair ?? 0x3b2a1e); break;
        case 'spray': {
          const tp = T.head.localToWorld(this.v3.set(0, tm.len + 0.01, 0));
          const d = this.v4.subVectors(op.wp, tp).normalize();
          this.bits.burst(tp, d, 4, Bit.Mist, 1.6, 0.35, 0.9, op.paint);
          break;
        }
        case 'scalpel': if (!C && Math.random() < 0.5) this.bits.burst(p, n, 1, Bit.Blood, 0.8, 0.6, 1); break;
      }
    }
  }
  /** where the scanner looks (the anchor it sweeps, or the tool's work) */
  private scanPoint(out: THREE.Vector3) {
    if (!this.rig) return out.set(0, 1.6, ROOM.FLOAT_Z);
    return this.anchorWorld(this.scanAnchor, out) ?? out.set(0, 1.6, ROOM.FLOAT_Z);
  }

  private updateArm(a: Arm, dt: number) {
    const ph = a.phys;
    // tucked away inside the wall in the dark: not drawn at all
    const hidden = this.mode === 'title' && this.lit < 0.02 && a.follow.kind === 'stow' && ph.tip.distanceToSquared(a.stow) < 0.003;
    a.seg1.visible = a.seg2.visible = a.head.visible = !hidden;
    if (a.hose) a.hose.mesh.visible = !hidden;
    // the tool arm: change tools (fold up into the ceiling, swap, come back)
    if (a.name === 'T') {
      const want = this.toolWant;
      if (want && a.tool?.kind !== want) {
        if (!a.tool || hidden) this.mountTool(a, want);
        else {
          this.swapT += dt;
          if (this.swapT > 0.55 || ph.tip.distanceTo(this.v1.copy(a.stow).lerp(a.phys.base, 0.75)) < 0.2) { this.mountTool(a, want); sfx('swap', 0.8); this.swapT = 0; }
        }
      } else this.swapT = 0;
    }
    const f = a.follow;
    ph.aimGoal = null;
    ph.contact.on = false;
    ph.roll = 0;
    if (a.name === 'T' && this.swapT > 0) ph.goal.copy(a.stow).lerp(ph.base, 0.75);
    else if (f.kind === 'stow') ph.goal.copy(a.stow);
    else if (f.kind === 'point') ph.goal.copy(f.p);
    else if (f.kind === 'bone') {
      if (this.rig && this.subj.visible) { this.rig.bones[f.bone as 'head'].getWorldPosition(ph.goal); ph.goal.add(f.off); } else ph.goal.copy(a.stow);
    } else if (f.kind === 'tool') this.toolTarget(a);
    else this.scanTarget(a);
    ph.k = a.k; ph.c = a.c * 0.62;
    ph.update(dt);
    if (f.kind === 'bone' && a.gripT > 0.5) { ph.tip.lerp(ph.goal, Math.min(1, dt * 25)); }
    // the tool arm leans on him: push the body
    if (a.name === 'T' && ph.press > 0.004) this.swayV.addScaledVector(this.op.app, -ph.press * 6 * dt);
    if (a.name === 'T' && ph.impact > 0.4) { this.flinchAt(this.op.app, Math.min(0.6, ph.impact * 0.3)); }
    a.grip = damp(a.grip, a.gripT, 12, dt);
    ph.pose(a.seg1, a.seg2, a.head);
    if (a.name === 'T' && this.op.spin > 0) { this.op.spin = Math.max(0, this.op.spin - dt * 1.9); a.head.rotateY((1 - this.op.spin) * Math.PI * 2); }
    for (const fg of a.fingers) fg.rotation.z = a.grip * 0.62 - 0.55;
    if (a.hose && !hidden) {
      a.seg1.updateMatrixWorld(); a.head.updateMatrixWorld();
      a.hose.update(a.seg1.localToWorld(this.v1.copy(a.hoseA)), a.head.localToWorld(this.v2.set(0.0, -0.03, -0.07)), dt);
    }
  }
  private mountTool(a: Arm, k: ToolKind) {
    if (a.tool) a.mount.remove(a.tool.group);
    const m = this.toolModel(k);
    a.mount.add(m.group);
    a.tool = m;
    m.setColor?.(this.op.paint);
  }
  /** where the tool arm wants to be: waiting by its anchor, or on it, aimed in */
  private toolTarget(a: Arm) {
    const rig = this.rig, ph = a.phys, op = this.op;
    const tm = a.tool;
    if (!rig || !this.subj.visible || this.mode !== 'lit' || !tm) { ph.goal.copy(a.stow); return; }
    const t = this.t;
    if (this.toolPart === 'idle' && this.maulT < 0) {
      // folded beside his shoulder, the saw ticking over
      rig.bones.head.getWorldPosition(ph.goal);
      ph.goal.x += -0.62; ph.goal.y += 0.32 + Math.sin(t * 0.8) * 0.05; ph.goal.z += 0.04 + Math.sin(t * 0.6) * 0.04;
      ph.aimGoal = this.v3.subVectors(rig.bones.head.getWorldPosition(this.v4), ph.goal).normalize().lerp(this.v4.set(0, -1, 0), 0.5).normalize();
      return;
    }
    const s = this.app?.height || 1;
    // the gap off the skin: waiting (a hand's width), working (its standoff), pressed (into him), struck (a lunge)
    const wait = 0.16 * s;
    const gap = THREE.MathUtils.lerp(wait, tm.standoff, op.work) - op.press * 0.03 - op.hit * (tm.kind === 'stamp' ? 0.02 : 0.03) + (1 - op.work) * Math.sin(t * 1.7) * 0.015;
    ph.goal.copy(op.wp).addScaledVector(op.app, tm.len + gap);
    // a working tool trembles a little
    if (op.run > 0.1 && op.work > 0.5) { const j = op.run * 0.004; ph.goal.x += (Math.random() - 0.5) * j; ph.goal.y += (Math.random() - 0.5) * j; ph.goal.z += (Math.random() - 0.5) * j; }
    ph.aimGoal = this.v3.copy(op.app).negate();
    // the skin is a wall it can only sink a little into
    ph.contact.on = op.work > 0.3;
    ph.contact.p.copy(op.wp).addScaledVector(op.app, tm.len - 0.008);
    ph.contact.n.copy(op.app);
    ph.contact.give = 0.006 + op.press * 0.01;
  }
  /** the scanner arm: a foot off the part, sweeping it */
  private scanTarget(a: Arm) {
    const ph = a.phys;
    if (!this.rig || !this.subj.visible || this.mode !== 'lit' || !a.tool) { ph.goal.copy(a.stow); return; }
    const p = this.scanPoint(this.v1);
    const t = this.t;
    const dir = this.v2.setFromMatrixColumn(this.cam.matrixWorld, 0).multiplyScalar(0.85).addScaledVector(this.v3.setFromMatrixColumn(this.cam.matrixWorld, 1), 0.5).addScaledVector(this.v5.setFromMatrixColumn(this.cam.matrixWorld, 2), 0.3).normalize();
    const d = this.scanOn ? a.tool.standoff + a.tool.len : 0.75;
    ph.goal.copy(p).addScaledVector(dir, d);
    if (!this.scanOn) ph.goal.y += 0.35;
    const sweep = this.scanOn ? Math.sin(t * 3.1) * 0.09 : 0;
    ph.aimGoal = this.v4.copy(p).add(this.v3.set(0, sweep, 0)).sub(ph.goal).normalize();
  }

  // ================================================================== camera
  /** the framing a shot wants right now (it follows the subject); returns the fov */
  private shotTarget(name: ShotName, pos: THREE.Vector3, look: THREE.Vector3, portrait: boolean): number {
    const rig = this.rig, s = this.app?.height || 1;
    const bone = (b: string, x = 0, y = 0, z = 0) => rig ? rig.bones[b as 'head'].localToWorld(this.v1.set(x * s, y * s, z * s)) : this.v1.set(0, 1.2, ROOM.FLOAT_Z);
    if (name === 'title' || name === 'prisoner') {
      // the whole room from the front corner, the crew at work, pushing in over forty seconds to his face
      const k = name === 'prisoner' ? 1 : easeIO(Math.min(1, Math.max(0, (this.t - this.titleT0) / 42)));
      const wideLook = this.v3.set(0.15, portrait ? 1.25 : 1.05, -0.05);
      const face = rig ? rig.bones.head.localToWorld(this.v4.set(0, 0.07 * s, 0.04 * s)) : this.v4.set(0, 1.3, -0.55);
      look.lerpVectors(wideLook, face, k);
      const dw = portrait ? 5.1 : 6.3, dc = portrait ? 1.35 : 1.05;
      const d = THREE.MathUtils.lerp(dw, dc, k) + Math.sin(this.t * 0.21) * 0.03 * (1 - k);
      const dir = this.v2.set(THREE.MathUtils.lerp(0.5, 0.36, k), THREE.MathUtils.lerp(0.3, 0.06, k), 1).normalize();
      pos.copy(look).addScaledVector(dir, d);
      return THREE.MathUtils.lerp(portrait ? 74 : 44, portrait ? 44 : 30, k);
    }
    if (name === 'press') { look.set(0, 1.05, ROOM.FLOAT_Z - 0.2); pos.set(0.1, 1.55, ROOM.FLOAT_Z + (portrait ? 5.6 : 4.5)); return portrait ? 56 : 40; }
    const def = SHOTS[name];
    if (def && rig) {
      const b = rig.bones[def.bone];
      const hs = this.headScale(def.bone);
      look.copy(b.localToWorld(this.v1.set(def.at[0] * hs, def.at[1] * hs, def.at[2] * hs)));
      // his yaw (the body turns a little as it swings) is ignored: the shot is in room space
      const dist = (portrait ? def.pDist : def.dist) * this.zoom * (1 - this.punch);
      const cp = Math.cos(def.pitch);
      pos.copy(look).add(this.v2.set(Math.sin(def.yaw) * cp, Math.sin(def.pitch), Math.cos(def.yaw) * cp).multiplyScalar(dist));
      return portrait ? def.pFov : def.fov;
    }
    let at: THREE.Vector3, dist: number, lift: number, fov: number;
    if (name === 'face') { at = bone('head', 0, 0.1, 0.03); dist = portrait ? 1.65 : 0.95; lift = 0.04; fov = portrait ? 40 : 30; }
    else if (name === 'body') { at = bone('chest', 0, 0.14, 0); dist = portrait ? 3.0 : 2.05; lift = 0.06; fov = portrait ? 44 : 32; }
    else if (name === 'feet') { at = this.v1.lerpVectors(rig ? rig.bones.shinL.getWorldPosition(this.v3) : this.v3.set(0, 0.6, ROOM.FLOAT_Z), rig ? rig.bones.footR.getWorldPosition(this.v4) : this.v4.set(0, 0.4, ROOM.FLOAT_Z), 0.55); dist = portrait ? 2.6 : 1.55; lift = 0.32; fov = portrait ? 44 : 32; }
    else { at = bone('hips', 0, 0.12, 0); dist = portrait ? 5.0 : 4.2; lift = 0.1; fov = portrait ? 50 : 34; }
    look.copy(at);
    pos.copy(at).add(this.v2.set(0.1, lift, 1).normalize().multiplyScalar(dist * this.zoom * (1 - this.punch)));
    return fov;
  }

  /** dev: pin the camera somewhere ({ pos, look, fov }) to inspect the set */
  debugCam: { pos: [number, number, number]; look: [number, number, number]; fov?: number } | null = null;
  private updateCamera(dt: number) {
    if (this.debugCam) {
      const d = this.debugCam;
      this.cam.position.set(...d.pos); this.cam.lookAt(...d.look); this.cam.fov = d.fov ?? 40;
      this.cam.aspect = this.lowW / Math.max(1, this.lowH); this.cam.updateProjectionMatrix();
      return;
    }
    const portrait = this.lowW / Math.max(1, this.lowH) < 1;
    const t = this.t;
    this.punch = Math.max(0, this.punch - dt * 0.25);
    if (this.mode === 'title' && this.shotName !== 'title' && this.shotName !== 'prisoner' && this.lit < 0.05) this.setShot('title', 1500);
    const fov = this.shotTarget(this.shotName, this.P, this.LK, portrait);
    if (this.mode === 'lit' && this.shotName !== 'title') {
      this.orbit = damp(this.orbit, this.orbitT, 6, dt);
      const dx = this.P.x - this.LK.x, dz = this.P.z - this.LK.z;
      const c = Math.cos(this.orbit), s = Math.sin(this.orbit);
      this.P.x = this.LK.x + dx * c + dz * s;
      this.P.z = this.LK.z - dx * s + dz * c;
    }
    const k = (this.t - this.shotT0) / this.shotDur;
    if (k < 1) {
      const e = easeIO(k);
      this.camPos.lerpVectors(this.shotFrom.pos, this.P, e);
      this.camLook.lerpVectors(this.shotFrom.look, this.LK, e);
      this.camFov = THREE.MathUtils.lerp(this.shotFrom.fov, fov, e);
    } else {
      // close-ups follow the head tightly; wide shots float
      const close = SHOTS[this.shotName] ? 1 : 0;
      const kk = this.shotName === 'title' ? 3 : 7 + close * 5;
      this.camPos.set(damp(this.camPos.x, this.P.x, kk, dt), damp(this.camPos.y, this.P.y, kk, dt), damp(this.camPos.z, this.P.z, kk, dt));
      this.camLook.set(damp(this.camLook.x, this.LK.x, kk + 2, dt), damp(this.camLook.y, this.LK.y, kk + 2, dt), damp(this.camLook.z, this.LK.z, kk + 2, dt));
      this.camFov = damp(this.camFov, fov, 6, dt);
    }
    // where the subject sits on screen
    const title = this.mode === 'title';
    const ax = title && !portrait ? 0.2 : 0, ay = portrait ? (title ? 0.3 : 0.14) : title ? 0.02 : 0;
    this.frX = damp(this.frX, this.frXSet ?? ax, 4, dt);
    this.frY = damp(this.frY, this.frYSet ?? ay, 4, dt);
    // a hand on the camera: slow drift, a little roll; shake
    this.shake = Math.max(0, this.shake - dt * 1.6);
    const sh = this.shake * this.shake * (calm() ? 0.3 : 1);
    const hh = (title ? 1 : 0.6) * (SHOTS[this.shotName] ? 0.35 : 1);
    const nx = (Math.sin(t * 0.31) * 0.6 + Math.sin(t * 0.73 + 1.3) * 0.3 + Math.sin(t * 1.7 + 0.4) * 0.1) * 0.012 * hh;
    const ny = (Math.sin(t * 0.43 + 2.1) * 0.6 + Math.sin(t * 0.97) * 0.3 + Math.sin(t * 2.3 + 1) * 0.1) * 0.008 * hh;
    const shk = SHOTS[this.shotName] ? 0.035 : 0.1;
    this.cam.position.set(this.camPos.x + nx + (Math.random() - 0.5) * sh * shk, this.camPos.y + ny + (Math.random() - 0.5) * sh * shk, this.camPos.z);
    this.cam.lookAt(this.camLook.x + nx * 0.4, this.camLook.y + ny * 0.4, this.camLook.z);
    this.cam.rotateZ((Math.sin(t * 0.37) * 0.006 + Math.sin(t * 1.13) * 0.002) * hh + (Math.random() - 0.5) * sh * 0.02);
    this.cam.fov = this.camFov;
    this.cam.aspect = this.lowW / Math.max(1, this.lowH);
    this.cam.updateProjectionMatrix();
    // shift the picture (an off-centre frustum) so the subject sits in the free part of the screen
    const e = this.cam.projectionMatrix.elements;
    e[8] = -this.frX; e[9] = -this.frY;
    this.cam.projectionMatrixInverse.copy(this.cam.projectionMatrix).invert();
    this.cam.updateMatrixWorld();
  }

  private render() {
    const r = this.renderer!;
    const saved = { cut: U.uCutOn.value, vis: U.uVisOn.value, fn: U.uFogNear.value, ff: U.uFogFar.value, gs: U.uGridScale.value, col: U.uCollapse.value, snap: U.uSnapOn.value };
    U.uCutOn.value = 0; U.uVisOn.value = 0; U.uFogNear.value = 1e4; U.uFogFar.value = 2e4; U.uGridScale.value = 0; U.uCollapse.value = 0; U.uSnapOn.value = 0;
    try {
      r.info.reset();
      r.setRenderTarget(this.rt);
      r.setClearColor(0x000000, 1);
      r.clear(true, true, true);
      r.render(this.scene, this.cam);
      r.setRenderTarget(null);
      r.render(this.post.scene, this.post.cam);
    } finally {
      U.uCutOn.value = saved.cut; U.uVisOn.value = saved.vis; U.uFogNear.value = saved.fn; U.uFogFar.value = saved.ff; U.uGridScale.value = saved.gs; U.uCollapse.value = saved.col; U.uSnapOn.value = saved.snap;
    }
  }

  // ================================================================== portraits & thumbnails
  /** head-and-shoulders portrait (sRGB pixels) for ID photos and case files */
  snapshot(w: number, h: number): ImageData | null {
    const r = this.renderer;
    if (!r || !this.rig) return null;
    const W = w * 2, H = h * 2;
    const rt = new THREE.WebGLRenderTarget(W, H, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
    const cam = new THREE.PerspectiveCamera(18, W / H, 0.05, 20);
    const head = this.rig.bones.head.getWorldPosition(new THREE.Vector3());
    const s = this.app?.height || 1;
    cam.position.set(head.x, head.y + 0.08 * s, head.z + 1.6); cam.lookAt(head.x, head.y + 0.08 * s, head.z);
    const px = new Uint8Array(W * H * 4);
    const hid: THREE.Object3D[] = [];
    this.scene.children.forEach((o) => { if (o !== this.subj && o.visible && !(o as THREE.Light).isLight) { o.visible = false; hid.push(o); } });
    const saved = { cut: U.uCutOn.value, vis: U.uVisOn.value, fn: U.uFogNear.value, ff: U.uFogFar.value, gs: U.uGridScale.value };
    U.uCutOn.value = 0; U.uVisOn.value = 0; U.uFogNear.value = 1e4; U.uFogFar.value = 2e4; U.uGridScale.value = 0;
    try {
      r.setRenderTarget(rt); r.setClearColor(0x000000, 0); r.clear(true, true, true);
      r.render(this.scene, cam);
      r.readRenderTargetPixels(rt, 0, 0, W, H, px);
    } finally {
      r.setRenderTarget(null); for (const o of hid) o.visible = true; rt.dispose();
      U.uCutOn.value = saved.cut; U.uVisOn.value = saved.vis; U.uFogNear.value = saved.fn; U.uFogFar.value = saved.ff; U.uGridScale.value = saved.gs;
    }
    return downsample(px, W, H, w, h);
  }
  private thumbs = new Map<string, string>();
  /** a cosmetic piece, rendered once on its own for the wardrobe cards (a data URL; '' if it has no model) */
  thumb(key: string): string {
    const hit = this.thumbs.get(key);
    if (hit !== undefined) return hit;
    const r = this.renderer;
    const g = cosmeticGeometry(key);
    if (!r || !g || (!g.geo && !g.glow)) { this.thumbs.set(key, ''); return ''; }
    const W = 48, H = 48;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 1.3));
    const dl = new THREE.DirectionalLight(0xffffff, 1.4); dl.position.set(1, 2, 3); scene.add(dl);
    const grp = new THREE.Group();
    if (g.geo) grp.add(new THREE.Mesh(g.geo, this.mat));
    if (g.glow) grp.add(new THREE.Mesh(g.glow, new THREE.MeshBasicMaterial({ color: COSMETIC.get(key)?.color ?? 0xffffff })));
    grp.rotation.y = 0.55;
    scene.add(grp);
    const box = new THREE.Box3().setFromObject(grp);
    const sph = box.getBoundingSphere(new THREE.Sphere());
    const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 10);
    const dist = sph.radius / Math.sin(THREE.MathUtils.degToRad(15)) * 1.05;
    cam.position.set(sph.center.x, sph.center.y + dist * 0.35, sph.center.z + dist * 0.94); cam.lookAt(sph.center);
    const rt = new THREE.WebGLRenderTarget(W * 2, H * 2, { depthBuffer: true });
    const px = new Uint8Array(W * H * 16);
    const saved = { cut: U.uCutOn.value, vis: U.uVisOn.value, fn: U.uFogNear.value, ff: U.uFogFar.value, gs: U.uGridScale.value };
    U.uCutOn.value = 0; U.uVisOn.value = 0; U.uFogNear.value = 1e4; U.uFogFar.value = 2e4; U.uGridScale.value = 0;
    try { r.setRenderTarget(rt); r.setClearColor(0x000000, 0); r.clear(true, true, true); r.render(scene, cam); r.readRenderTargetPixels(rt, 0, 0, W * 2, H * 2, px); }
    finally { r.setRenderTarget(null); rt.dispose(); U.uCutOn.value = saved.cut; U.uVisOn.value = saved.vis; U.uFogNear.value = saved.fn; U.uFogFar.value = saved.ff; U.uGridScale.value = saved.gs; }
    const img = downsample(px, W * 2, H * 2, W, H);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    cv.getContext('2d')!.putImageData(img, 0, 0);
    const url = cv.toDataURL();
    this.thumbs.set(key, url);
    return url;
  }

  /** a tool on its own as a little pixel icon with an ink outline (data URL, cached) */
  toolThumb(kind: ToolKind, size = 36): string {
    const key = 'tool:' + kind + ':' + size;
    const hit = this.thumbs.get(key);
    if (hit !== undefined) return hit;
    const r = this.renderer;
    if (!r) return '';
    const W = size, H = size;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xdde4ff, 0x302820, 1.4));
    const dl = new THREE.DirectionalLight(0xfff0dc, 2.4); dl.position.set(-1, 2, 2.5); scene.add(dl);
    const grp = this.toolModel(kind).group.clone();
    grp.traverse((o) => { o.visible = true; });
    for (const k of ['beam', 'fan', 'line', 'flame']) grp.getObjectByName(k)?.removeFromParent();
    grp.children.forEach((c) => { if ((c as THREE.LineSegments).isLineSegments) c.visible = false; });
    grp.rotation.set(0, 0.5, -0.75);
    scene.add(grp);
    grp.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(grp);
    const sph = box.getBoundingSphere(new THREE.Sphere());
    const cam = new THREE.PerspectiveCamera(26, 1, 0.01, 10);
    const dist = sph.radius / Math.sin(THREE.MathUtils.degToRad(13)) * 1.02;
    cam.position.set(sph.center.x, sph.center.y, sph.center.z + dist); cam.lookAt(sph.center);
    const rt = new THREE.WebGLRenderTarget(W * 2, H * 2, { depthBuffer: true });
    const px = new Uint8Array(W * H * 16);
    const saved = { cut: U.uCutOn.value, vis: U.uVisOn.value, fn: U.uFogNear.value, ff: U.uFogFar.value, gs: U.uGridScale.value };
    U.uCutOn.value = 0; U.uVisOn.value = 0; U.uFogNear.value = 1e4; U.uFogFar.value = 2e4; U.uGridScale.value = 0;
    try { r.setRenderTarget(rt); r.setClearColor(0x000000, 0); r.clear(true, true, true); r.render(scene, cam); r.readRenderTargetPixels(rt, 0, 0, W * 2, H * 2, px); }
    finally { r.setRenderTarget(null); rt.dispose(); U.uCutOn.value = saved.cut; U.uVisOn.value = saved.vis; U.uFogNear.value = saved.fn; U.uFogFar.value = saved.ff; U.uGridScale.value = saved.gs; }
    const img = downsample(px, W * 2, H * 2, W, H);
    // the ink line round the silhouette
    const D = img.data, out = new Uint8ClampedArray(D);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (D[i + 3]) continue;
      let n = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < W && Y < H && D[(Y * W + X) * 4 + 3]) n = true; }
      if (n) { out[i] = 10; out[i + 1] = 11; out[i + 2] = 16; out[i + 3] = 255; }
    }
    img.data.set(out);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    cv.getContext('2d')!.putImageData(img, 0, 0);
    const url = cv.toDataURL();
    this.thumbs.set(key, url);
    return url;
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    for (const w of this.waiters) w.res();
    for (const tw of this.tweens) tw.res();
    this.waiters = []; this.tweens = [];
    this.loop?.stop(); this.loop = null;
    this.ro.disconnect();
    if (this.rig) { this.subj.remove(this.rig.root); this.rig.dispose(); this.rig = null; }
    // tools not on an arm are not in the scene: put them in so they are disposed with it
    for (const m of this.tools.values()) if (!m.group.parent) this.scene.add(m.group);
    const shared = new Set<THREE.Material>(Object.values(this.mats));
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh || (o as THREE.Points).isPoints || (o as THREE.LineSegments).isLineSegments) {
        if (m.geometry !== this.decalGeo) m.geometry?.dispose();
        const mm = m.material as THREE.Material | THREE.Material[];
        for (const x of Array.isArray(mm) ? mm : [mm]) if (x && !shared.has(x)) { (x as THREE.MeshLambertMaterial).map?.dispose(); x.dispose(); }
      }
    });
    disposeFacetMats();
    this.screen.dispose();
    this.decalGeo.dispose();
    this.rt?.dispose();
    this.lensFx.dispose();
    this.post.mat.dispose();
    if (this.renderer) { this.renderer.dispose(); this.renderer.forceContextLoss(); this.renderer = null; }
    this.canvas.remove();
  }
}

function downsample(px: Uint8Array, W: number, H: number, w: number, h: number): ImageData {
  const toS = (v: number) => { v /= 255; v = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055; return Math.max(0, Math.min(255, Math.round(v * 255))); };
  const out = new ImageData(w, h);
  const fx = W / w, fy = H / h;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let n = 0, R = 0, G = 0, B = 0;
    for (let j = 0; j < fy; j++) for (let i = 0; i < fx; i++) {
      const si = ((H - 1 - (y * fy + j)) * W + x * fx + i) * 4;
      if (px[si + 3] > 100) { n++; R += px[si]; G += px[si + 1]; B += px[si + 2]; }
    }
    const di = (y * w + x) * 4;
    if (n * 2 >= fx * fy) { out.data[di] = toS(R / n); out.data[di + 1] = toS(G / n); out.data[di + 2] = toS(B / n); out.data[di + 3] = 255; }
  }
  return out;
}
