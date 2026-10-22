// THE SUBJECT ROOM. One small three.js scene behind the title and the
// creator, rendered at low resolution into a half-float target and drawn to a
// canvas that CSS enlarges by a whole number with hard pixels (no blur, no
// depth of field): a black one-pixel silhouette line, a filmic grade, light
// dither (scene/post.ts). Every prop is a faceted low-poly model on pixel-art
// textures (roomParts.ts, roomKit.ts, scene/).
//  · TITLE    a slow push-in on the face of a man strapped into an electric
//             chair: electrode cap, chin strap, sweat on the brow, breath
//             vapour, a caged lamp swinging over him (hard key, moving
//             shadows of its cage), a cold rim from behind, green spill from
//             a heart monitor off to the side, dust turning in the cone, and
//             every few seconds a surge: arcs off the cap, sparks, the face
//             blown white, the lamp browning out, the body locking.
//  · CREATOR  the breaker is thrown, the tubes stutter on, the arms come out
//             of the walls, unbuckle him, lift him out of the chair and hold
//             him in mid-air; a tool arm goes to whatever is being edited.
//  · PRESS    the ceiling press drops on him and the arms fetch a clone.
// The menus are 2D (title.ts, intake.ts) and drive it.
//
// CAMERA API (for the 2D menus; all optional to call):
//   shot(name: 'title' | 'face' | 'body' | 'full' | 'feet', ms = 900): Promise<void>
//       ease the camera to a framing over ms (0 = cut). 'title' is the slow
//       push-in on the seated man's face; the others frame the floating
//       subject in the creator (head / torso / whole body / legs and feet).
//       Resolves when the move is done. setFocus(part) also picks a shot.
//   setFraming(dx: number | null, dy?: number | null)
//       where the subject sits on screen, as an offset of its centre in
//       normalised screen units (-1..1, +dx right, +dy up), so it stays in
//       the part of the screen the 2D UI leaves free. null = automatic
//       (title: face right of centre on landscape, upper half on portrait).
// The old 3D menu calls are kept as no-ops so callers still compile:
//   setMenu (stores the items, draws nothing), hoverItem (the lamp flares a
//   little), pressItem (a crackle off the cap; resolves quickly), itemRect
//   (null), menuKeys, pushTo.
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
import { sfx } from './sfx';
import { calm } from './settings';
import { facetMats, disposeFacetMats, type FMats } from './scene/pixtex';
import { makePost, LensBlood } from './scene/post';
import { Dust, shaftMesh, Puffs, Arcs, Cable, Chain, Sweat, catchlights, leakCards } from './scene/fx';
import { PhosphorScreen } from './scene/screen';
import { armSegment, armBase, clawPalm, clawFinger, toolHead, sawBlade, pressModel, shutterModel, chairModel, capModel, strapModel, bulbModel, leverModel, gem, prism, FacetBuilder } from './roomParts';
import { ROOM, SPOT, roomModel, fixtureTubes, monitorModel, canvasTex, bloodCanvas } from './roomKit';

export type { PartKey };
export type MenuKind = 'sign' | 'gear' | 'phone' | 'tape' | 'card' | 'key';
export interface MenuItem { key: string; label: string; sub?: string; kind?: MenuKind; primary?: boolean; color?: number }
export type ShotName = 'title' | 'face' | 'body' | 'full' | 'feet' | 'press';

const REGION_PART: [RegKey, PartKey][] = (Object.entries(PART_REGIONS) as [PartKey, RegKey[]][]).flatMap(([p, rs]) => rs.map((r) => [r, p] as [RegKey, PartKey]));
const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt));
const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const easeIO = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeIn = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * t);
const UP = new THREE.Vector3(0, 1, 0);
const FLOAT_Y = 0.34;
/** the lamp: pivot in the ceiling, cord length (bulb about 0.65 m over his head, a little in front) */
const LAMP = { x: 0.08, z: -0.16, L: 1.62 };
const CAP_ANCHOR = new THREE.Vector3(0.1, ROOM.H - 0.02, -0.62);
const JUNCTION = new THREE.Vector3(0.06, 0.93, ROOM.CHAIR_Z - 0.47);

// ------------------------------------------------------------------ the arms
interface Arm {
  name: string; base: THREE.Vector3; L1: number; L2: number; pole: THREE.Vector3;
  seg1: THREE.Object3D; seg2: THREE.Object3D; head: THREE.Group; fingers: THREE.Object3D[]; saw: THREE.Object3D | null;
  tip: THREE.Vector3; vel: THREE.Vector3; goal: THREE.Vector3; stow: THREE.Vector3;
  follow: { kind: 'stow' } | { kind: 'point'; p: THREE.Vector3 } | { kind: 'bone'; bone: string; off: THREE.Vector3 } | { kind: 'tool' };
  k: number; c: number; grip: number; gripT: number; spin: number;
}

const NP = 640;

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
  private host: HTMLElement;
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(32, 1, 0.03, 40);
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
  private hemi = new THREE.HemisphereLight(0x8a9ab8, 0x1a1410, 0.03);
  private key = new THREE.SpotLight(0xffc88a, 0, 0, 0.98, 0.45, 2);
  private rimL = new THREE.SpotLight(0x9ab2ff, 0, 0, 0.32, 0.6, 2);
  private rimR = new THREE.SpotLight(0x5a74d0, 0, 0, 0.3, 0.6, 2);
  private leakL = new THREE.SpotLight(0x7a94d8, 0, 0, 0.3, 0.5, 2);
  private leak!: ReturnType<typeof leakCards>;
  private crt = new THREE.PointLight(0x78e09a, 0, 3.6, 2);
  private surge = new THREE.PointLight(0xbfe0ff, 0, 5, 2);
  private hatchL = new THREE.PointLight(0xff2a10, 0.25, 3.2, 2);
  private sun = new THREE.DirectionalLight(0xe4ecff, 0);
  private fill = new THREE.DirectionalLight(0xb8c8e8, 0);
  private back = new THREE.DirectionalLight(0x8aa0ff, 0);
  private alarm = new THREE.SpotLight(0xff2a1a, 0, 9, 0.6, 0.6, 1.2);
  private tubeMat = new THREE.MeshBasicMaterial({ color: 0x0c0c0c, toneMapped: false });
  private bulbMat = new THREE.MeshBasicMaterial({ color: 0x302010, toneMapped: false });
  private hatchLampMat = new THREE.MeshBasicMaterial({ color: 0x3a0606, toneMapped: false });
  private bulbPivot = new THREE.Group();
  private bulbGlass!: THREE.Mesh;
  private swingA = 0.1; private swingB = 0.06;
  private shaft = shaftMesh(9);
  private dust: Dust;
  private puffs = new Puffs(56);
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
  private state: 'seat' | 'lift' | 'float' | 'gone' | 'carry' | 'drop' = 'seat';
  private stateT = 0;
  private liftFrom = new THREE.Vector3(); private liftTo = new THREE.Vector3(); private liftMid = new THREE.Vector3();
  private twitch = 0; private struggle = 0;
  private squash = 1;
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
  // ---- arms, press, hatch
  private arms: Arm[] = [];
  private toolPart = 'idle';
  private maulT = -1; private maulPt = new THREE.Vector3(); private maulN = new THREE.Vector3();
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
  private orbit = 0; private orbitT = 0; private zoom = 1;
  private shake = 0;
  private focusKey = 'full';
  // ---- fx
  private pPos = new Float32Array(NP * 3); private pVel = new Float32Array(NP * 3); private pCol = new Float32Array(NP * 3); private pLife = new Float32Array(NP); private pKind = new Uint8Array(NP);
  private pNext = 0;
  private sparkGeo = new THREE.BufferGeometry(); private sparkPos = new Float32Array(NP * 6); private sparkCol = new Float32Array(NP * 6);
  private bloodGeo = new THREE.BufferGeometry(); private bloodPos = new Float32Array(NP * 3); private bloodCol = new Float32Array(NP * 3);
  private decals: THREE.Mesh[] = []; private decalNext = 0; private decalMats: THREE.MeshLambertMaterial[] = []; private decalGeo = new THREE.PlaneGeometry(1, 1);
  private flash = 0; private redFlash = 0;
  // ---- input
  private ray = new THREE.Raycaster(); private ndc = new THREE.Vector2();
  private ptr = new Map<number, { x: number; y: number; x0: number; y0: number; t0: number; head: boolean; o0: number }>();
  private wheelAcc = 0; private wheelAt = 0;
  private hoverPart: PartKey | null = null;
  // ---- temps
  private v1 = new THREE.Vector3(); private v2 = new THREE.Vector3(); private v3 = new THREE.Vector3(); private v4 = new THREE.Vector3(); private q1 = new THREE.Quaternion();
  private P = new THREE.Vector3(); private LK = new THREE.Vector3();

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
    this.key.shadow.bias = -0.0008; this.key.shadow.normalBias = 0.012;
    S.add(this.bulbPivot);
    this.shaft.mesh.position.set(0, lamp.bulbY - 0.05, 0);
    this.bulbPivot.add(this.shaft.mesh);
    // rims from behind, the green spill, the surge
    this.rimL.position.set(-1.25, 2.55, -2.1); this.rimR.position.set(1.35, 2.2, -2.15);
    S.add(this.hemi, this.rimL, this.rimL.target, this.rimR, this.rimR.target, this.crt, this.surge, this.hatchL, this.sun, this.sun.target, this.fill, this.back, this.alarm, this.alarm.target);
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
    this.dust = new Dust(this.low ? 70 : 170, new THREE.Box3(new THREE.Vector3(-0.75, 0.55, -1.0), new THREE.Vector3(0.85, 2.0, 0.55)));
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
    // ---- arms: wrists from the back wall, a harness arm and a tool arm from the ceiling
    const mk = (name: string, base: [number, number, number], L1: number, L2: number, pole: [number, number, number], stow: [number, number, number], tool = false) => {
      const b = armBase(mats);
      b.position.set(...base);
      b.quaternion.setFromUnitVectors(UP, new THREE.Vector3(stow[0] - base[0], stow[1] - base[1], stow[2] - base[2]).normalize().negate());
      const seg1 = armSegment(mats, L1, 0.15), seg2 = armSegment(mats, L2, 0.12);
      const head = new THREE.Group();
      head.add(tool ? toolHead(mats) : clawPalm(mats));
      const fingers: THREE.Object3D[] = [];
      let saw: THREE.Object3D | null = null;
      if (tool) { saw = sawBlade(mats); saw.position.set(-0.02, 0.27, 0.02); head.add(saw); }
      else for (const [k, ry] of [[-1, Math.PI], [1, 0]] as const) { const f = clawFinger(mats); f.position.set(k * 0.06, 0.12, 0); f.rotation.y = ry; f.userData.k = k; head.add(f); fingers.push(f); }
      S.add(b, seg1, seg2, head);
      const sv = new THREE.Vector3(...stow);
      const arm: Arm = { name, base: new THREE.Vector3(...base), L1, L2, pole: new THREE.Vector3(...pole).normalize(), seg1, seg2, head, fingers, saw,
        tip: sv.clone(), vel: new THREE.Vector3(), goal: sv.clone(), stow: sv, follow: { kind: 'stow' }, k: 60, c: 12, grip: 0, gripT: 0, spin: 0 };
      this.arms.push(arm);
      return arm;
    };
    mk('L', [1.75, 2.75, ROOM.BACK + 0.02], 1.7, 1.6, [0.6, 0.8, -0.6], [1.75, 2.6, ROOM.BACK - 1.2]);
    mk('R', [-1.75, 2.75, ROOM.BACK + 0.02], 1.7, 1.6, [-0.6, 0.8, -0.6], [-1.75, 2.6, ROOM.BACK - 1.2]);
    mk('H', [0, ROOM.H - 0.02, -0.95], 1.35, 1.25, [0, 0.4, -1], [0, ROOM.H + 1.2, -0.95]);
    mk('T', [-1.75, ROOM.H - 0.02, 0.9], 1.75, 1.7, [-1, 0.4, 0.3], [-1.75, ROOM.H + 1.4, 0.9], true);
    // ---- particles: sparks as one-pixel streaks, blood as two-pixel drops
    this.sparkGeo.setAttribute('position', new THREE.BufferAttribute(this.sparkPos, 3));
    this.sparkGeo.setAttribute('color', new THREE.BufferAttribute(this.sparkCol, 3));
    this.bloodGeo.setAttribute('position', new THREE.BufferAttribute(this.bloodPos, 3));
    this.bloodGeo.setAttribute('color', new THREE.BufferAttribute(this.bloodCol, 3));
    for (let i = 0; i < NP; i++) { this.pPos[i * 3 + 1] = -50; this.bloodPos[i * 3 + 1] = -50; this.sparkPos[i * 6 + 1] = -50; this.sparkPos[i * 6 + 4] = -50; }
    const sparks = new THREE.LineSegments(this.sparkGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    const blood = new THREE.Points(this.bloodGeo, new THREE.PointsMaterial({ size: 2, sizeAttenuation: false, vertexColors: true }));
    sparks.frustumCulled = blood.frustumCulled = false;
    sparks.renderOrder = 6;
    S.add(sparks, blood);
    for (let i = 0; i < 4; i++) this.decalMats.push(new THREE.MeshLambertMaterial({ map: canvasTex(bloodCanvas(i * 13 + 5, 64, i % 2 === 1)), transparent: true, alphaTest: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 - i * 0.1 }));
    this.post.u.tLens.value = this.lensFx.tex;
    this.applyLight(0);
    this.bindInput();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  // ================================================================== subject
  setAppearance(app: Appearance) {
    this.app = { ...app };
    if (!this.rig) {
      this.rig = createPreviewRig(this.app, this.outfit);
      this.rig.skin.layers.enable(1);
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
  }
  setOutfit(o: Outfit) { this.outfit = o; this.rig?.setOutfit(this.dress()); }
  private dress(): Outfit {
    if (!this.extraBlood) return this.outfit;
    const cond = { ...(this.outfit.cond || {}) };
    cond.blood = { ...(cond.blood || {}), head: Math.max(cond.blood?.head || 0, this.extraBlood), neck: Math.max(cond.blood?.neck || 0, this.extraBlood - 1) };
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

  // ================================================================== sequences
  /** the breaker: lights on, arms out, the subject unbuckled, lifted out of the chair and held in mid-air */
  async lightsOn() {
    if (this.mode === 'lit') return;
    this.busy = true;
    this.mode = 'lit'; this.view = 'creator';
    this.hoverKey = null;
    this.surgeT = 0;
    sfx('breaker');
    this.leverT = Math.PI - 0.35;
    this.shake = Math.max(this.shake, 0.25);
    this.litT = 0.001;
    this.setFocus('full', 2200);
    await this.wait(500);
    sfx('servo');
    const [L, R, H, T] = this.arms;
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
    T.follow = { kind: 'tool' }; this.toolPart = 'idle';
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
    const [L, R, H, T] = this.arms;
    T.follow = { kind: 'stow' };
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
    if (this.mode === 'lit') this.setShot(this.shotFor(this.focusKey), ms);
  }
  private shotFor(k: string): ShotName {
    if (this.view === 'gender') return 'press';
    if (k === 'head' || k === 'face' || k === 'eyes' || k === 'hair') return 'face';
    if (k === 'torso' || k === 'body' || k === 'marks' || k === 'armL' || k === 'armR' || k === 'hands' || k === 'handL' || k === 'handR') return 'body';
    if (k === 'feet' || k === 'legs' || k === 'legL' || k === 'legR') return 'feet';
    return 'full';
  }
  setView(v: 'creator' | 'gender') { this.view = v; this.setFocus('full', 1200); }
  /** turn the camera round the subject (radians, clamped) */
  orbitTo(a: number) { this.orbitT = Math.max(-1.1, Math.min(1.1, a)); }
  /** a camera flash (the processing photo) */
  flashOnce() { this.flash = calm() ? 0.3 : 0.9; }

  /** the face maul: the tool arm goes in, saw screaming, blood and sparks; apply() swaps the face halfway */
  async maul(apply: () => void) {
    if (this.maulT >= 0 || !this.rig || this.state === 'gone') { apply(); return; }
    const T = this.arms[3];
    T.follow = { kind: 'tool' };
    this.maulT = 0;
    const prevFocus = this.focusKey;
    if (prevFocus !== 'head' && prevFocus !== 'hair') { this.focusKey = 'head'; this.setShot('face', 500); }
    sfx('servo');
    await this.wait(260);
    sfx('grind');
    this.extraBlood = 2; this.bloodT = 0;
    this.rig.setOutfit(this.dress());
    await this.wait(380);
    sfx('squelch'); sfx('grind');
    this.splatLens(2);
    apply();
    await this.wait(380);
    sfx('spark');
    await this.wait(220);
    this.maulT = -1;
    if (this.focusKey !== prevFocus) { this.focusKey = prevFocus; this.setShot(this.shotFor(prevFocus), 700); }
  }

  /** the gender press: alarm, the slab comes down, the room is painted; apply() makes the clone; the arms bring it in */
  async press(apply: () => void) {
    if (this.busy || !this.rig) return;
    this.busy = true;
    const [L, R, H, T] = this.arms;
    this.view = 'gender';
    this.setShot('press', 900);
    this.alarm.intensity = calm() ? 3 : 14;
    sfx('klaxon');
    T.follow = { kind: 'stow' };
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
    this.extraBlood = 0;
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
    T.follow = { kind: 'tool' };
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

  // ================================================================== blood & sparks
  private emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, kind: 0 | 1, life: number) {
    const i = this.pNext; this.pNext = (this.pNext + 1) % NP;
    const j = i * 3;
    this.pPos[j] = x; this.pPos[j + 1] = y; this.pPos[j + 2] = z;
    this.pVel[j] = vx; this.pVel[j + 1] = vy; this.pVel[j + 2] = vz;
    this.pLife[i] = life; this.pKind[i] = kind;
    const b = 0.5 + Math.random() * 0.5;
    if (kind === 0) { this.pCol[j] = 0.3 * b + 0.1; this.pCol[j + 1] = 0.01; this.pCol[j + 2] = 0.015; }
    else { this.pCol[j] = 2.2; this.pCol[j + 1] = 1.7 + 0.5 * b; this.pCol[j + 2] = 0.9 + 1.4 * b; }
  }
  private sparkBurst(p: THREE.Vector3, n: number, speed = 1) {
    for (let i = 0; i < n; i++) this.emit(p.x, p.y, p.z, (Math.random() - 0.5) * 3 * speed, (Math.random() * 2.2 + 0.2) * speed, (Math.random() - 0.3) * 2.5 * speed, 1, 0.25 + Math.random() * 0.45);
  }
  private bloodBurst(p: THREE.Vector3, dir: THREE.Vector3, n: number, spread: number, speed: number) {
    for (let i = 0; i < n; i++) {
      const s = speed * (0.4 + Math.random() * 0.8);
      this.emit(p.x, p.y, p.z, dir.x * s + (Math.random() - 0.5) * spread, dir.y * s + (Math.random() - 0.3) * spread, dir.z * s + (Math.random() - 0.5) * spread, 0, 1.4 + Math.random());
    }
  }
  private emitDrip() {
    const x = (Math.random() - 0.5) * 1.2, z = ROOM.FLOAT_Z + (Math.random() - 0.5) * 0.9;
    this.emit(x, this.pressY - 0.01, z, 0, -0.2, 0, 0, 2);
  }
  /** a decal on a surface: axis is the surface normal ('y' floor, '-y' ceiling, 'z' back wall, 'x' side walls) */
  private decal(x: number, y: number, z: number, axis: 'y' | 'z' | 'x' | '-y', size: number) {
    let m = this.decals[this.decalNext];
    if (!m) { m = new THREE.Mesh(this.decalGeo, this.decalMats[0]); m.receiveShadow = true; this.scene.add(m); this.decals[this.decalNext] = m; }
    this.decalNext = (this.decalNext + 1) % 70;
    m.material = this.decalMats[Math.floor(Math.random() * this.decalMats.length)];
    m.position.set(x, y, z);
    m.rotation.set(0, 0, 0);
    if (axis === 'y') m.rotation.set(-Math.PI / 2, 0, Math.random() * 6.28);
    else if (axis === '-y') m.rotation.set(Math.PI / 2, 0, Math.random() * 6.28);
    else if (axis === 'x') m.rotation.set(0, x < 0 ? Math.PI / 2 : -Math.PI / 2, Math.random() * 6.28);
    else m.rotation.set(0, 0, Math.random() * 6.28);
    m.scale.setScalar(size);
    m.visible = true;
  }
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
      if (this.mode !== 'lit') return;
      cv.setPointerCapture(e.pointerId);
      this.ptr.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now(), head: this.partAt(e.clientX, e.clientY) === 'head', o0: this.orbitT });
    });
    cv.addEventListener('pointermove', (e) => {
      if (this.mode !== 'lit') return;
      const p = this.ptr.get(e.pointerId);
      if (!p) { if (e.pointerType === 'mouse') this.setHoverPart(this.partAt(e.clientX, e.clientY), e.clientX, e.clientY); return; }
      p.x = e.clientX; p.y = e.clientY;
      const dx = p.x - p.x0, dy = p.y - p.y0;
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
      if (p && e.type === 'pointerup' && p.t0 && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) < 10 && performance.now() - p.t0 < 600) this.onPick?.(this.partAt(e.clientX, e.clientY));
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') this.setHoverPart(null, 0, 0); });
    cv.addEventListener('wheel', (e) => {
      if (this.mode !== 'lit') return;
      e.preventDefault();
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

  /** lighting for a level of "lit" (0 title dark .. 1 tubes full on) */
  private applyLight(l: number) {
    this.hemi.intensity = 0.035 + l * 0.55;
    this.sun.intensity = l * 2.1;
    this.fill.intensity = l * 0.55;
    this.back.intensity = l * 0.9;
    const c = 0.06 + l * 2.2;
    this.tubeMat.color.setRGB(c * 0.92, c, c * 1.04);
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
    this.applyLight(this.lit);
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
    // ---- the subject, his straps and cables, the arms, the press
    this.updateSubject(dt);
    for (const a of this.arms) this.updateArm(a, dt);
    this.pressG.position.y = this.pressY;
    this.pressG.visible = this.pressY < ROOM.H + 1.0;
    this.updateRigging();
    // ---- fx
    this.updateParticles(dt);
    this.arcs.update(dt);
    this.screen.update(dt, this.t, 1 - this.surgeK * 0.6);
    this.crt.intensity = (0.065 + 0.025 * this.screen.beat) * (1 - this.lit * 0.6) * (1 - this.surgeK * 0.5);
    if (this.extraBlood && this.maulT < 0) { this.bloodT += dt; if (this.bloodT > 5 && this.extraBlood > 1) { this.extraBlood = 1; this.rig?.setOutfit(this.dress()); } }
    // ---- camera, then the fx that face it
    this.updateCamera(dt);
    this.puffs.update(dt, this.cam, (p) => this.lightAt(p));
    // ---- composite
    this.flash = Math.max(0, this.flash - dt * 2.2);
    this.redFlash = Math.max(0, this.redFlash - dt * 0.8);
    const u = this.post.u;
    u.uTime.value = this.t; u.uFlash.value = this.flash + this.surgeK * 0.04; u.uRed.value = this.redFlash;
    const title = 1 - this.lit;
    u.uExposure.value = 1.05 + this.lit * 0.1;
    u.uVig.value = 0.6 + title * 0.9;
    const portrait = this.lowW < this.lowH;
    u.uSide.value.set(portrait ? 0 : 1, portrait ? 1 : 0, (this.mode === 'title' ? 0.6 : 0.0) * title, portrait ? 0.42 : 0.45);
    u.uLensOn.value = this.lensFx.update(dt) || this.lensFx.active ? 1 : 0;
    this.render();
  };

  /** how much light falls on a point (vapour and smoke only show where it does) */
  private lightAt(p: THREE.Vector3): number {
    const L = this.v4.setFromMatrixPosition(this.key.matrixWorld);
    const d = p.distanceTo(L);
    return Math.min(1.2, this.bulbLevel * (this.mode === 'title' ? 0.32 : 0.14) / (0.25 + d * d) + this.surgeK * 0.5 + this.lit * 0.08);
  }

  /** the caged lamp: a pendulum, a buzz, dropouts, browning out when the chair draws */
  private updateLamp(dt: number) {
    const t = this.t, calmNow = calm();
    this.swingA = damp(this.swingA, 0.085, 0.08, dt); this.swingB = damp(this.swingB, 0.05, 0.08, dt);
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
    this.key.intensity = this.bulbLevel * (0.3 + title * 0.62);
    const g = 0.5 + this.bulbLevel * 5;
    this.bulbMat.color.setRGB(g * 1.0, g * 0.72, g * 0.42);
    this.shaft.mesh.scale.set(Math.tan(0.52) * 1.7, 1.7, Math.tan(0.52) * 1.7);
    this.shaft.u.uInt.value = 0.02 * this.bulbLevel * (0.2 + title * 0.8);
    // the rims and the dust
    this.rimL.intensity = (5.5 + this.lit * 1.5) * (1 - this.surgeK * 0.3);
    this.rimR.intensity = 2.4 + this.lit * 0.8;
    this.leakL.intensity = 2.2 * (1 - this.lit * 0.7);
    this.leak.u.uInt.value = 0.09 * (0.3 + title * 0.7) * (0.9 + Math.sin(t * 0.7) * 0.1);
    if (this.rig) { this.rig.bones.head.getWorldPosition(this.v1); this.rimL.target.position.copy(this.v1); this.rimR.target.position.copy(this.v1); }
    else { this.rimL.target.position.set(0, 1.3, -0.55); this.rimR.target.position.set(0, 1.3, -0.55); }
    this.bulbPivot.updateMatrixWorld(true);
    const L = this.v2.setFromMatrixPosition(this.key.matrixWorld);
    const dir = this.v3.setFromMatrixPosition(this.key.target.matrixWorld).sub(L).normalize();
    this.dust.update(t, L, dir, Math.cos(this.key.angle), Math.cos(this.key.angle * (1 - this.key.penumbra)), this.bulbLevel * (0.5 + title * 1.4), this.key.color, this.lit);
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
    this.arcs.strike(from, to, 0.05 + Math.random() * 0.1, 0.4);
    if (Math.random() < 0.35) this.arcs.strike(from, this.v4.copy(from).add(this.v2.set((Math.random() - 0.5) * 0.25, 0.08 + Math.random() * 0.2, (Math.random() - 0.5) * 0.2)), 0.05, 0.5);
  }

  private updateSubject(dt: number) {
    const rig = this.rig;
    if (!rig) return;
    this.stateT += dt;
    this.twitch = Math.max(0, this.twitch - dt * 3);
    const t = this.t;
    let pose: Pose | null = null;
    const panic = this.state === 'float' || this.state === 'lift' || this.maulT >= 0 ? 0.6 + (this.maulT >= 0 ? 0.4 : 0) : 0;
    try { const r = (rig as any).update(dt, panic ? { panic } : undefined); pose = r && typeof r === 'object' ? r : null; } catch { pose = null; }
    if (!pose) pose = {};
    const seat = this.seatPose(t);
    const fl = this.floatPose(t);
    let p: Pose;
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
      if (this.state === 'float') this.subj.position.set(Math.sin(t * 0.7) * 0.015, FLOAT_Y + Math.sin(t * 1.1) * 0.012, ROOM.FLOAT_Z);
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
    // twitches, struggling, the maul, and the surge locking every muscle
    const tw = this.twitch * (calm() ? 0.3 : 1), st = this.struggle, ma = this.maulT >= 0 ? 1 : 0, sg = this.surgeK;
    const add = (k: keyof Pose, x: number, y: number, z: number) => { const v = (p as any)[k] || [0, 0, 0]; (p as any)[k] = [v[0] + x, v[1] + y, v[2] + z]; };
    if (tw > 0.01 || st > 0.01 || ma) {
      const n = (f: number, o: number) => Math.sin(t * f + o) * (tw * 0.25 + st * 0.12 + ma * 0.18) + (Math.random() - 0.5) * (tw * 0.22 + ma * 0.2);
      add('head', n(31, 0) - ma * 0.35, n(23, 1) * 1.5, n(19, 2));
      add('chest', n(17, 3) * 0.6, n(13, 4) * 0.6, n(11, 5) * 0.4);
      add('thighL', n(9, 6), 0, n(7, 7) * 0.3); add('thighR', n(8, 8), 0, n(10, 9) * 0.3);
      add('shinL', Math.abs(n(12, 10)), 0, 0); add('shinR', Math.abs(n(14, 11)), 0, 0);
      (p as any).gripL = 1; (p as any).gripR = 1;
    }
    if (sg > 0.01 && this.state === 'seat') {
      add('head', -0.32 * sg, (Math.random() - 0.5) * 0.06 * sg, (Math.random() - 0.5) * 0.08 * sg);
      add('chest', -0.1 * sg, 0, 0); add('neck', -0.12 * sg, 0, 0);
      add('handL', 0, 0, 0.3 * sg); add('handR', 0, 0, -0.3 * sg);
      (p as any).gripL = 1; (p as any).gripR = 1;
    }
    this.struggle = Math.max(0, this.struggle - dt * 0.25);
    rig.applyPose(p);
    // breath: on each out-breath a little vapour in the cold, lit where the lamp catches it
    const br = Math.sin(t * 1.4);
    if (this.breathPrev > 0.2 && br <= 0.2 && this.subj.visible && !calm()) {
      const head = rig.bones.head;
      for (let i = 0; i < 5; i++) {
        const mp = head.localToWorld(this.v1.set((Math.random() - 0.5) * 0.02, 0.035 * (this.app?.height || 1), 0.11 * (this.app?.height || 1)));
        const dir = this.v2.set(0, -0.15, 1).applyQuaternion(head.getWorldQuaternion(this.q1)).multiplyScalar(0.12 + Math.random() * 0.08);
        dir.x += (Math.random() - 0.5) * 0.04; dir.y += (Math.random() - 0.3) * 0.03;
        this.puffs.emit(mp, dir, { life: 1.4 + Math.random() * 0.6, s0: 0.005, s1: 0.03 + Math.random() * 0.025, color: 0x1e2428, rise: 0.03 });
      }
    }
    this.breathPrev = br;
    // sweat glints, the eyes catch the light
    this.sweat.group.visible = this.strapped && this.state === 'seat';
    const glint = this.bulbLevel * (this.mode === 'title' ? 1.2 : 0.5) + this.surgeK * 2.5 + this.pop;
    this.sweat.update(dt, glint);
    const e = Math.min(1.8, 0.35 + glint * 0.8);
    (this.eyes.material as THREE.PointsMaterial).color.setRGB(e, e, e * 0.95);
    this.eyes.visible = this.subj.visible && (t % 4.3) > 0.12;
    // the maul: the tool arm's target and the gore
    if (this.maulT >= 0) {
      this.maulT += dt;
      rig.bones.head.getWorldPosition(this.maulPt);
      const s = this.app?.height || 1;
      this.maulPt.y += 0.1 * s;
      this.maulN.set(0, 0, 1).applyQuaternion(rig.bones.head.getWorldQuaternion(this.q1));
      const fp = this.v1.copy(this.maulPt).addScaledVector(this.maulN, 0.1 * s);
      if (this.maulT > 0.25 && this.maulT < 1.0) {
        this.bloodBurst(fp, this.maulN, 5, 1.6, 2.6);
        if (Math.random() < 0.45) this.sparkBurst(fp, 4);
        if (Math.random() < 0.06) this.decal((Math.random() - 0.5) * 1.6, 0.006, ROOM.FLOAT_Z + 0.5 + Math.random(), 'y', 0.25 + Math.random() * 0.3);
      }
    }
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
    const look = Math.sin(t * 0.43) * 0.5 + Math.sin(t * 1.7) * 0.08;
    return {
      uarmL: [0.05, 0, 2.05], uarmR: [0.05, 0, -2.05], farmL: [-0.18, 0, 0.12], farmR: [-0.18, 0, -0.12], handL: [0, 0, 0.1], handR: [0, 0, -0.1],
      spine: [0.02, 0, 0], chest: [-0.04, look * 0.1, 0], head: [0.08 + Math.sin(t * 0.61) * 0.12, look, Math.sin(t * 0.37) * 0.06],
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

  private updateArm(a: Arm, dt: number) {
    const f = a.follow;
    if (f.kind === 'stow') a.goal.copy(a.stow);
    else if (f.kind === 'point') a.goal.copy(f.p);
    else if (f.kind === 'bone') {
      if (this.rig && this.subj.visible) { this.rig.bones[f.bone as 'head'].getWorldPosition(a.goal); a.goal.add(f.off); } else a.goal.copy(a.stow);
    } else this.toolTarget(a.goal);
    const k = a.k, c = a.c;
    for (let rem = dt; rem > 1e-5; rem -= 1 / 90) {
      const h = Math.min(rem, 1 / 90);
      a.vel.x += ((a.goal.x - a.tip.x) * k - a.vel.x * c) * h;
      a.vel.y += ((a.goal.y - a.tip.y) * k - a.vel.y * c) * h;
      a.vel.z += ((a.goal.z - a.tip.z) * k - a.vel.z * c) * h;
      a.tip.addScaledVector(a.vel, h);
    }
    if (f.kind === 'bone' && a.gripT > 0.5) a.tip.lerp(a.goal, Math.min(1, dt * 25));
    a.grip = damp(a.grip, a.gripT, 12, dt);
    // two-bone IK in the plane of the pole
    const d = this.v1.subVectors(a.tip, a.base);
    let len = d.length();
    const min = Math.abs(a.L1 - a.L2) + 0.05, max = a.L1 + a.L2 - 0.01;
    len = Math.max(min, Math.min(max, len));
    const dir = d.normalize();
    const ax = (a.L1 * a.L1 - a.L2 * a.L2 + len * len) / (2 * len);
    const hgt = Math.sqrt(Math.max(0, a.L1 * a.L1 - ax * ax));
    const perp = this.v2.copy(a.pole).addScaledVector(dir, -a.pole.dot(dir));
    if (perp.lengthSq() < 1e-6) perp.set(0, 0, 1);
    perp.normalize();
    const elbow = this.v3.copy(a.base).addScaledVector(dir, ax).addScaledVector(perp, hgt);
    const end = this.v4.copy(a.base).addScaledVector(dir, len);
    a.seg1.position.copy(a.base);
    a.seg1.quaternion.setFromUnitVectors(UP, this.v2.subVectors(elbow, a.base).normalize());
    a.seg2.position.copy(elbow);
    a.seg2.quaternion.setFromUnitVectors(UP, this.v2.subVectors(end, elbow).normalize());
    a.head.position.copy(end);
    a.head.quaternion.copy(a.seg2.quaternion);
    for (const fg of a.fingers) fg.rotation.z = a.grip * 0.62 - 0.55;
    if (a.saw) { a.spin = damp(a.spin, this.maulT >= 0 ? 40 : this.toolPart !== 'idle' ? 6 : 1.5, 4, dt); a.saw.rotation.z += a.spin * dt; }
  }
  /** where the tool arm wants to be */
  private toolTarget(out: THREE.Vector3) {
    const rig = this.rig;
    const s = this.app?.height || 1;
    if (!rig || !this.subj.visible || this.mode !== 'lit') { out.copy(this.arms[3].stow); return; }
    const t = this.t;
    if (this.maulT >= 0) {
      const jab = this.maulT < 0.25 ? 0.35 * (1 - this.maulT / 0.25) + 0.12 : 0.06 + Math.abs(Math.sin(this.maulT * 26)) * 0.07;
      out.copy(this.maulPt).addScaledVector(this.maulN, (0.1 + jab) * s);
      out.y += 0.05;
      return;
    }
    const part = this.toolPart;
    const bone = part === 'head' || part === 'face' || part === 'eyes' ? 'head' : part === 'hair' ? 'head' : part === 'torso' || part === 'body' || part === 'marks' ? 'chest'
      : part === 'handL' || part === 'hands' ? 'handL' : part === 'legL' || part === 'legs' || part === 'build' ? 'shinL' : part === 'feet' ? 'footR' : '';
    if (!bone) { rig.bones.head.getWorldPosition(out); out.x += -0.45; out.y += 0.25 + Math.sin(t * 0.8) * 0.06; out.z += 0.35 + Math.sin(t * 0.6) * 0.05; return; }
    rig.bones[bone as 'head'].getWorldPosition(out);
    if (part === 'hair') { out.y += 0.42 * s; out.z += 0.12; }
    else if (bone === 'head') { out.y += 0.12 * s; out.z += 0.42; out.x -= 0.18; }
    else out.z += 0.4;
    out.x += Math.sin(t * 1.3) * 0.03; out.y += Math.sin(t * 1.7) * 0.03;
  }

  private updateParticles(dt: number) {
    const P = this.pPos, V = this.pVel, SP = this.sparkPos, SC = this.sparkCol, BP = this.bloodPos, BC = this.bloodCol;
    let any = false;
    for (let i = 0; i < NP; i++) {
      const j = i * 3, s6 = i * 6;
      if (this.pLife[i] <= 0) {
        if (SP[s6 + 1] !== -50 || BP[j + 1] !== -50) { SP[s6 + 1] = SP[s6 + 4] = -50; BP[j + 1] = -50; any = true; }
        continue;
      }
      any = true;
      this.pLife[i] -= dt;
      const sp = this.pKind[i] === 1;
      V[j + 1] -= (sp ? 6 : 9.8) * dt;
      P[j] += V[j] * dt; P[j + 1] += V[j + 1] * dt; P[j + 2] += V[j + 2] * dt;
      const floor = Math.abs(P[j]) < 0.7 && Math.abs(P[j + 2] - ROOM.FLOAT_Z) < 0.55 ? ROOM.PLATE_Y : 0;
      let hit = '';
      if (P[j + 1] < floor) { if (sp && V[j + 1] < -0.6) { V[j + 1] *= -0.35; V[j] *= 0.5; V[j + 2] *= 0.5; P[j + 1] = floor + 0.001; } else hit = 'y'; }
      else if (P[j + 2] < ROOM.BACK + 0.01) hit = 'z';
      else if (Math.abs(P[j]) > ROOM.W - 0.01) hit = 'x';
      else if (P[j + 1] > ROOM.H - 0.02) hit = '-y';
      if (hit || this.pLife[i] <= 0) {
        if (hit && !sp && Math.random() < 0.05) this.decal(Math.max(-ROOM.W + 0.012, Math.min(ROOM.W - 0.012, P[j])), hit === 'y' ? floor + 0.004 + Math.random() * 0.002 : Math.max(0.02, Math.min(ROOM.H - 0.012, P[j + 1])), Math.max(ROOM.BACK + 0.012, P[j + 2]), hit as any, 0.1 + Math.random() * 0.18);
        this.pLife[i] = 0; SP[s6 + 1] = SP[s6 + 4] = -50; BP[j + 1] = -50;
        continue;
      }
      if (sp) {
        const k = Math.min(1, this.pLife[i] * 3);
        SP[s6] = P[j]; SP[s6 + 1] = P[j + 1]; SP[s6 + 2] = P[j + 2];
        SP[s6 + 3] = P[j] - V[j] * 0.022; SP[s6 + 4] = P[j + 1] - V[j + 1] * 0.022; SP[s6 + 5] = P[j + 2] - V[j + 2] * 0.022;
        SC[s6] = this.pCol[j] * k; SC[s6 + 1] = this.pCol[j + 1] * k; SC[s6 + 2] = this.pCol[j + 2] * k;
        SC[s6 + 3] = SC[s6] * 0.35; SC[s6 + 4] = SC[s6 + 1] * 0.2; SC[s6 + 5] = SC[s6 + 2] * 0.1;
      } else {
        BP[j] = P[j]; BP[j + 1] = P[j + 1]; BP[j + 2] = P[j + 2];
        BC[j] = this.pCol[j]; BC[j + 1] = this.pCol[j + 1]; BC[j + 2] = this.pCol[j + 2];
      }
    }
    if (any) {
      for (const g of [this.sparkGeo, this.bloodGeo]) { (g.attributes.position as THREE.BufferAttribute).needsUpdate = true; (g.attributes.color as THREE.BufferAttribute).needsUpdate = true; }
    }
  }

  // ================================================================== camera
  /** the framing a shot wants right now (it follows the subject); returns the fov */
  private shotTarget(name: ShotName, pos: THREE.Vector3, look: THREE.Vector3, portrait: boolean): number {
    const rig = this.rig, s = this.app?.height || 1;
    const bone = (b: string, x = 0, y = 0, z = 0) => rig ? rig.bones[b as 'head'].localToWorld(this.v1.set(x * s, y * s, z * s)) : this.v1.set(0, 1.2, ROOM.FLOAT_Z);
    if (name === 'title') {
      // the push: from head and shoulders to the eyes, over about forty seconds
      const k = easeIO(Math.min(1, Math.max(0, (this.t - this.titleT0) / 40)));
      const d = (portrait ? 1.95 - 0.75 * k : 1.3 - 0.58 * k) - this.nudge * 0.03 + Math.sin(this.t * 0.21) * 0.015;
      if (rig) look.copy(bone('head', 0, 0.105, 0.05)); else look.set(0, 1.3, -0.55);
      pos.copy(look).add(this.v2.set(0.24, -0.07, 1).normalize().multiplyScalar(d));
      return portrait ? 44 : 30;
    }
    if (name === 'press') { look.set(0, 1.05, ROOM.FLOAT_Z - 0.2); pos.set(0.1, 1.55, ROOM.FLOAT_Z + (portrait ? 5.6 : 4.5)); return portrait ? 56 : 40; }
    let at: THREE.Vector3, dist: number, lift: number, fov: number;
    if (name === 'face') { at = bone('head', 0, 0.1, 0.03); dist = portrait ? 1.25 : 0.95; lift = 0.04; fov = portrait ? 40 : 30; }
    else if (name === 'body') { at = bone('chest', 0, 0.06, 0); dist = portrait ? 2.5 : 1.85; lift = 0.06; fov = portrait ? 44 : 32; }
    else if (name === 'feet') { at = this.v1.lerpVectors(rig ? rig.bones.shinL.getWorldPosition(this.v3) : this.v3.set(0, 0.6, ROOM.FLOAT_Z), rig ? rig.bones.footR.getWorldPosition(this.v4) : this.v4.set(0, 0.4, ROOM.FLOAT_Z), 0.55); dist = portrait ? 2.0 : 1.55; lift = 0.32; fov = portrait ? 44 : 32; }
    else { at = bone('hips', 0, 0.3, 0); dist = portrait ? 4.6 : 3.7; lift = 0.12; fov = portrait ? 50 : 34; }
    look.copy(at);
    pos.copy(at).add(this.v2.set(0.06, lift, 1).normalize().multiplyScalar(dist * this.zoom));
    return fov;
  }

  private updateCamera(dt: number) {
    const portrait = this.lowW / Math.max(1, this.lowH) < 1;
    const t = this.t;
    if (this.mode === 'title' && this.shotName !== 'title' && this.lit < 0.05) this.setShot('title', 1500);
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
      const kk = this.shotName === 'title' ? 3 : 7;
      this.camPos.set(damp(this.camPos.x, this.P.x, kk, dt), damp(this.camPos.y, this.P.y, kk, dt), damp(this.camPos.z, this.P.z, kk, dt));
      this.camLook.set(damp(this.camLook.x, this.LK.x, kk + 2, dt), damp(this.camLook.y, this.LK.y, kk + 2, dt), damp(this.camLook.z, this.LK.z, kk + 2, dt));
      this.camFov = damp(this.camFov, fov, 6, dt);
    }
    // where the subject sits on screen
    const title = this.mode === 'title';
    const ax = title && !portrait ? 0.32 : 0, ay = portrait ? (title ? 0.42 : 0.14) : title ? 0.04 : 0;
    this.frX = damp(this.frX, this.frXSet ?? ax, 4, dt);
    this.frY = damp(this.frY, this.frYSet ?? ay, 4, dt);
    // a hand on the camera: slow drift, a little roll; shake
    this.shake = Math.max(0, this.shake - dt * 1.6);
    const sh = this.shake * this.shake * (calm() ? 0.3 : 1);
    const hh = title ? 1 : 0.6;
    const nx = (Math.sin(t * 0.31) * 0.6 + Math.sin(t * 0.73 + 1.3) * 0.3 + Math.sin(t * 1.7 + 0.4) * 0.1) * 0.012 * hh;
    const ny = (Math.sin(t * 0.43 + 2.1) * 0.6 + Math.sin(t * 0.97) * 0.3 + Math.sin(t * 2.3 + 1) * 0.1) * 0.008 * hh;
    this.cam.position.set(this.camPos.x + nx + (Math.random() - 0.5) * sh * 0.1, this.camPos.y + ny + (Math.random() - 0.5) * sh * 0.1, this.camPos.z);
    this.cam.lookAt(this.camLook.x + nx * 0.4, this.camLook.y + ny * 0.4, this.camLook.z);
    this.cam.rotateZ((Math.sin(t * 0.37) * 0.006 + Math.sin(t * 1.13) * 0.002) * hh + (Math.random() - 0.5) * sh * 0.02);
    this.cam.fov = this.camFov;
    this.cam.aspect = this.lowW / Math.max(1, this.lowH);
    this.cam.updateProjectionMatrix();
    // shift the picture (an off-centre frustum) so the subject sits in the free part of the screen
    const e = this.cam.projectionMatrix.elements;
    e[8] = -this.frX; e[9] = -this.frY;
    this.cam.projectionMatrixInverse.copy(this.cam.projectionMatrix).invert();
  }

  private render() {
    const r = this.renderer!;
    const saved = { cut: U.uCutOn.value, vis: U.uVisOn.value, fn: U.uFogNear.value, ff: U.uFogFar.value, gs: U.uGridScale.value, col: U.uCollapse.value, snap: U.uSnapOn.value };
    U.uCutOn.value = 0; U.uVisOn.value = 0; U.uFogNear.value = 1e4; U.uFogFar.value = 2e4; U.uGridScale.value = 0; U.uCollapse.value = 0; U.uSnapOn.value = 0;
    try {
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

  dispose() {
    cancelAnimationFrame(this.raf);
    for (const w of this.waiters) w.res();
    for (const tw of this.tweens) tw.res();
    this.waiters = []; this.tweens = [];
    this.ro.disconnect();
    if (this.rig) { this.subj.remove(this.rig.root); this.rig.dispose(); this.rig = null; }
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
