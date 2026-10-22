// THE SUBJECT ROOM. One small three.js scene, rendered at low resolution and
// blown up with hard pixels like the game, that is the whole front end:
//  · TITLE    near-black concrete cell, one weak bulb, a figure strapped in an
//             electric chair that is mostly shadow; the cap hums and sparks and
//             for a frame you see him. The menu floats in front of him: voxel
//             NOCLIP letters, smoked-glass neon signs, a gear, a handset, a
//             tape, a card, a keycap. Each bobs, drifts and glitches on its own.
//  · CREATOR  the breaker slams, the tubes stutter on, four arms unfold out of
//             the walls and ceiling, unbuckle him, lift him out of the chair and
//             hold him in mid-air by the wrists and a chest harness, ankles
//             chained to the press die. A tool arm (saw, drill, lamp) goes to
//             whatever is being edited and mauls the face when it changes.
//  · PRESS    the ceiling press drops on him, the room is painted, and the arms
//             fetch a fresh clone out of the hatch in the back wall.
// The DOM menus (title.ts, intake.ts) sit over it and drive it.
import * as THREE from 'three';
import type { Appearance, Outfit, Pose, HumanRig } from '../../entities/humanRig';
import { createPreviewRig } from '../../entities/humanRig';
import { REG, PAD, PAGE } from '../../entities/humanModel';
import type { RegKey } from '../../entities/humanModel';
import { cosmeticGeometry } from '../../entities/cosmetics3d';
import { crtScreen, phosphorText, fontsReady, cssFont, type CrtScreen } from '../../gfx/crt';
import { makeMats, type Mats } from './smoothKit';
import { armSegment, armBase, clawPalm, clawFinger, toolHead, sawBlade, pressModel, shutterModel, chairModel, tvModel, propModel, dialPanelModel, tubeBaseModel } from './roomParts';
import { COSMETIC } from '../../game/cosmetics';
import { U, worldMaterial } from '../../gfx/materials';
import { blendPose } from './emotes';
import { PART_REGIONS, type PartKey } from './preview3d';
import { gfxSettings } from './common';
import { sfx } from './sfx';
import { calm } from './settings';
import {
  ROOM, PHOS, roomGeometry, gearGeometry,
  paintNixie, paintTape, paintBrass, paintGauge, canvasTex, bloodCanvas,
} from './roomKit';

export type { PartKey };
export type MenuKind = 'sign' | 'gear' | 'phone' | 'tape' | 'card' | 'key';
export interface MenuItem { key: string; label: string; sub?: string; kind: MenuKind; primary?: boolean; color?: number }

const REGION_PART: [RegKey, PartKey][] = (Object.entries(PART_REGIONS) as [PartKey, RegKey[]][]).flatMap(([p, rs]) => rs.map((r) => [r, p] as [RegKey, PartKey]));
const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt));
const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const easeIn = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * t);
const UP = new THREE.Vector3(0, 1, 0);
const FLOAT_Y = 0.34;

// ------------------------------------------------------------------ the arms
interface Arm {
  name: string; base: THREE.Vector3; L1: number; L2: number; pole: THREE.Vector3;
  seg1: THREE.Object3D; seg2: THREE.Object3D; head: THREE.Group; fingers: THREE.Object3D[]; saw: THREE.Object3D | null;
  tip: THREE.Vector3; vel: THREE.Vector3; goal: THREE.Vector3; stow: THREE.Vector3;
  /** what the goal follows */
  follow: { kind: 'stow' } | { kind: 'point'; p: THREE.Vector3 } | { kind: 'bone'; bone: string; off: THREE.Vector3 } | { kind: 'tool' };
  k: number; c: number; grip: number; gripT: number; spin: number;
}

// ------------------------------------------------------------------ menu objects
interface MenuObj {
  item: MenuItem; group: THREE.Group; body: THREE.Object3D; mats: THREE.MeshBasicMaterial[]; crts: CrtScreen[]; needles: THREE.Object3D[]; anchor: THREE.Vector3; r: number;
  phase: number; hover: number; hoverT: number; press: number; glitch: number; nextGlitch: number; out: number; color: number;
}

// ------------------------------------------------------------------ particles
const NP = 640;

export class SubjectRoom {
  canvas = document.createElement('canvas');
  renderer: THREE.WebGLRenderer | null = null;
  rig: HumanRig | null = null;
  /** 'title' (dark, menu signs) or 'lit' (creator) */
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
  private cam = new THREE.PerspectiveCamera(42, 1, 0.05, 40);
  private rt: THREE.WebGLRenderTarget | null = null;
  private post: { scene: THREE.Scene; cam: THREE.OrthographicCamera; mat: THREE.ShaderMaterial } | null = null;
  private lowW = 0; private lowH = 0;
  private raf = 0; private last = 0; private t = 0;
  private ro: ResizeObserver;
  private quality = 'high';
  private mat = worldMaterial({ noVis: true, noFog: true, noGrid: true });
  private mats!: Mats;
  // lights
  private hemi = new THREE.HemisphereLight(0x9aa8c0, 0x201810, 0.05);
  private key = new THREE.DirectionalLight(0xfff2e0, 0);
  private fill = new THREE.DirectionalLight(0x9ab8ff, 0);
  private rim = new THREE.DirectionalLight(0x5a7aff, 0.35);
  private bulb = new THREE.PointLight(0xffb070, 0.6, 3.6, 2);
  private spark = new THREE.PointLight(0x9ad8ff, 0, 5, 1.5);
  private glow = new THREE.PointLight(0x7ff6ff, 0, 3.2, 1.8);
  private alarm = new THREE.SpotLight(0xff2a1a, 0, 9, 0.6, 0.6, 1.2);
  private tubeMat = new THREE.MeshBasicMaterial({ color: 0x0c0c0c, fog: false });
  private bulbMat = new THREE.MeshBasicMaterial({ color: 0x302010, fog: false });
  private hatchLightMat = new THREE.MeshBasicMaterial({ color: 0x3a0606, fog: false });
  private faceSpot = new THREE.SpotLight(0xfff0d8, 0, 7, 0.12, 0.4, 1.2);
  private bulbPivot = new THREE.Group();
  private bulbMesh!: THREE.Mesh;
  private shaft!: THREE.Mesh;
  private dust!: THREE.Points; private dustPos!: Float32Array; private dustP!: Float32Array; private dustN = 0;
  private flare = 0;
  private focus = 4.8; private focusT = 4.8; private focusNext = 6; private focusOnMan = true;
  private pushKey: string | null = null;
  private lit = 0; private litT = 0;
  private flicker = 0;
  // the subject
  private subj = new THREE.Group();
  private app: Appearance | null = null;
  private outfit: Outfit = {};
  private extraBlood = 0; private bloodT = 0;
  private state: 'seat' | 'lift' | 'float' | 'gone' | 'carry' | 'drop' = 'seat';
  private stateT = 0;
  private liftFrom = new THREE.Vector3(); private liftTo = new THREE.Vector3(); private liftMid = new THREE.Vector3();
  private twitch = 0; private struggle = 0; private jerk = 0;
  private squash = 1;
  private cuffs: THREE.Mesh[] = [];
  private harness: THREE.Mesh;
  private chains: THREE.Mesh[] = [];
  private chainsOn = 0;
  private chairStraps: THREE.Object3D; private chairBare: THREE.Object3D;
  // arms
  private arms: Arm[] = [];
  private toolGoal = new THREE.Vector3(); private toolPart = 'idle';
  private maulT = -1; private maulPt = new THREE.Vector3(); private maulN = new THREE.Vector3();
  // press, hatch
  private pressG = new THREE.Group(); private pressY = ROOM.H + 0.05; private pressBloody: THREE.Mesh;
  private shutter: THREE.Object3D; private hatchOpen = 0; private hatchT = 0;
  // menu
  private menu: MenuObj[] = [];
  private letters: THREE.Group[] = [];
  private titleG = new THREE.Group();
  private menuG = new THREE.Group();
  private hoverKey: string | null = null;
  private menuOut = 0; private menuOutT = 0;
  private parX = 0; private parY = 0; private parTX = 0; private parTY = 0;
  // camera
  private camPos = new THREE.Vector3(0, 1.5, 4.4); private camLook = new THREE.Vector3(0, 1.15, -0.4);
  private camPosT = new THREE.Vector3(0, 1.5, 4.4); private camLookT = new THREE.Vector3(0, 1.15, -0.4);
  private orbit = 0; private orbitT = 0; private zoom = 1;
  private shake = 0;
  private focusKey = 'full';
  // fx
  private pPos = new Float32Array(NP * 3); private pVel = new Float32Array(NP * 3); private pCol = new Float32Array(NP * 3); private pLife = new Float32Array(NP); private pKind = new Uint8Array(NP);
  private pGeo = new THREE.BufferGeometry(); private pNext = 0;
  private decals: THREE.Mesh[] = []; private decalNext = 0; private decalMats: THREE.MeshLambertMaterial[] = []; private decalGeo = new THREE.PlaneGeometry(1, 1);
  private lens: HTMLElement;
  private flash = 0; private redFlash = 0;
  // input
  private ray = new THREE.Raycaster(); private ndc = new THREE.Vector2();
  private ptr = new Map<number, { x: number; y: number; x0: number; y0: number; t0: number; head: boolean; o0: number }>();
  private wheelAcc = 0; private wheelAt = 0;
  private hoverPart: PartKey | null = null;
  private selPart: string | null = null;
  // temps
  private v1 = new THREE.Vector3(); private v2 = new THREE.Vector3(); private v3 = new THREE.Vector3(); private v4 = new THREE.Vector3(); private q1 = new THREE.Quaternion();

  constructor(host: HTMLElement) {
    this.host = host;
    this.canvas.className = 'rm-cv';
    host.append(this.canvas);
    this.lens = document.createElement('div');
    this.lens.className = 'rm-lens';
    host.append(this.lens);
    const gs = gfxSettings();
    const coarse = matchMedia('(pointer: coarse)').matches;
    this.quality = gs.quality === 'auto' ? (coarse ? 'low' : 'high') : gs.quality;
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, alpha: false, powerPreference: coarse ? 'low-power' : 'default' });
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.setPixelRatio(1);
      this.renderer.setClearColor(0x000000, 1);
    } catch (e) { console.warn('room renderer unavailable', e); this.renderer = null; }
    // ---- room
    const room = new THREE.Mesh(roomGeometry(), this.mat);
    this.scene.add(room);
    this.mats = makeMats(this.quality === 'low');
    this.chairStraps = chairModel(this.mats, true);
    this.chairBare = chairModel(this.mats, false);
    this.chairBare.visible = false;
    this.scene.add(this.chairStraps, this.chairBare);
    // tube fixtures and the bulb
    for (const [x, z] of [[-1.6, -1.2], [1.6, -1.2], [-1.6, 1.6], [1.6, 1.6]]) {
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 1.3, 10).rotateX(Math.PI / 2), this.tubeMat);
      for (const k of [-1, 1]) { const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.05, 10).rotateX(Math.PI / 2), this.mats.metal); cap.position.set(x, ROOM.H - 0.05, z + k * 0.66); this.scene.add(cap); }
      tube.position.set(x, ROOM.H - 0.05, z);
      this.scene.add(tube);
    }
    // a bare bulb on a long cord, swinging slowly over the chair
    this.bulbPivot.position.set(0.95, ROOM.H, -0.85);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.95, 5), new THREE.MeshBasicMaterial({ color: 0x080808 }));
    cord.position.y = -0.475;
    this.bulbMesh = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), this.bulbMat);
    this.bulbMesh.position.y = -1.0;
    this.bulbPivot.add(cord, this.bulbMesh);
    this.scene.add(this.bulbPivot);
    // the hard key: a narrow beam from a louvre high on the left, laid across his eyes, with dust in it
    this.faceSpot.position.set(-1.35, 2.15, 1.25);
    this.scene.add(this.faceSpot, this.faceSpot.target);
    this.shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 1, 1, 16, 1, true).translate(0, -0.5, 0), new THREE.ShaderMaterial({
      uniforms: { uInt: { value: 0 }, uColor: { value: new THREE.Color(0xfff0d8) } },
      vertexShader: 'varying vec3 vN; varying vec3 vV; varying float vY; void main(){ vY = -position.y; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalMatrix * normal; vV = -mv.xyz; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform float uInt; uniform vec3 uColor; varying vec3 vN; varying vec3 vV; varying float vY; void main(){ float f = pow(abs(dot(normalize(vN), normalize(vV))), 2.0); float a = f * uInt * smoothstep(0.0, 0.25, vY) * (1.0 - smoothstep(0.75, 1.0, vY)); gl_FragColor = vec4(uColor * a, 1.0); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    this.shaft.frustumCulled = false;
    this.scene.add(this.shaft);
    this.dustN = this.quality === 'low' ? 40 : 140;
    this.dustPos = new Float32Array(this.dustN * 3);
    this.dustP = new Float32Array(this.dustN * 4);
    for (let i = 0; i < this.dustN; i++) { this.dustP[i * 4] = Math.random(); this.dustP[i * 4 + 1] = Math.random() * 6.28; this.dustP[i * 4 + 2] = Math.sqrt(Math.random()); this.dustP[i * 4 + 3] = 0.01 + Math.random() * 0.03; }
    const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(this.dustPos, 3));
    this.dust = new THREE.Points(dg, new THREE.PointsMaterial({ size: this.quality === 'low' ? 1 : 1.5, sizeAttenuation: false, color: 0xfff0d0, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.dust.frustumCulled = false;
    this.scene.add(this.dust);
    const hatchLamp = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.24, 3, 8).rotateZ(Math.PI / 2), this.hatchLightMat);
    hatchLamp.position.set(0, ROOM.HATCH_H - 0.1, ROOM.BACK - 2.9);
    this.scene.add(hatchLamp);
    this.shutter = shutterModel(this.mats);
    this.shutter.position.set(0, 0, ROOM.BACK - 0.02);
    this.scene.add(this.shutter);
    // lights
    this.key.position.set(-1.2, 3.4, 3.0); this.key.target.position.set(0, 1.0, 0);
    this.fill.position.set(2.5, 1.8, 2.0);
    this.rim.position.set(0.6, 2.6, -3.0); this.rim.target.position.set(0, 1.0, -0.3);
    this.spark.position.set(0, ROOM.SEAT_Y + 0.95, ROOM.CHAIR_Z - 0.1);
    this.alarm.position.set(-1.5, ROOM.H - 0.2, 0.5); this.alarm.target.position.set(0, 0, ROOM.FLOAT_Z);
    this.scene.add(this.hemi, this.key, this.key.target, this.fill, this.rim, this.rim.target, this.bulb, this.spark, this.glow, this.alarm, this.alarm.target);
    // ---- the press, its bloody underside
    this.pressG.add(pressModel(this.mats));
    const bm = new THREE.MeshLambertMaterial({ map: canvasTex(bloodCanvas(77, 96, true)), transparent: true, alphaTest: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.pressBloody = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 0.95), bm);
    this.pressBloody.rotation.x = Math.PI / 2; this.pressBloody.position.y = -0.003; this.pressBloody.visible = false;
    this.pressG.add(this.pressBloody);
    this.pressG.position.set(0, this.pressY, ROOM.FLOAT_Z);
    this.scene.add(this.pressG);
    // ---- the subject holder, cuffs, harness, chains
    this.scene.add(this.subj);
    const cuffGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.07, 8, 1, true);
    const cuffMat = new THREE.MeshLambertMaterial({ color: 0x3a3c3e, side: THREE.DoubleSide });
    for (let i = 0; i < 4; i++) { const c = new THREE.Mesh(cuffGeo, cuffMat); c.visible = false; this.cuffs.push(c); }
    this.harness = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 10, 1, true), cuffMat);
    this.harness.visible = false;
    const chainMat = new THREE.MeshLambertMaterial({ color: 0x6a6e70 });
    for (let i = 0; i < 2; i++) { const ch = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 6), chainMat); ch.visible = false; this.chains.push(ch); this.scene.add(ch); }
    // ---- arms: wrists from the back wall, a harness arm and a tool arm from the ceiling
    const mk = (name: string, base: [number, number, number], L1: number, L2: number, pole: [number, number, number], stow: [number, number, number], tool = false) => {
      const b = armBase(this.mats);
      b.position.set(...base);
      b.quaternion.setFromUnitVectors(UP, new THREE.Vector3(stow[0] - base[0], stow[1] - base[1], stow[2] - base[2]).normalize().negate());
      const seg1 = armSegment(this.mats, L1, 0.15), seg2 = armSegment(this.mats, L2, 0.12);
      const head = new THREE.Group();
      head.add(tool ? toolHead(this.mats) : clawPalm(this.mats));
      const fingers: THREE.Object3D[] = [];
      let saw: THREE.Object3D | null = null;
      if (tool) { saw = sawBlade(this.mats); saw.position.set(-0.02, 0.27, 0.02); head.add(saw); }
      else for (const k of [-1, 1]) { const f = clawFinger(this.mats); f.position.set(k * 0.06, 0.1, 0); head.add(f); fingers.push(f); }
      this.scene.add(b, seg1, seg2, head);
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
    // ---- particles
    this.pGeo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    this.pGeo.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
    for (let i = 0; i < NP; i++) this.pPos[i * 3 + 1] = -50;
    const pts = new THREE.Points(this.pGeo, new THREE.PointsMaterial({ size: this.quality === 'low' ? 3 : 4, sizeAttenuation: false, vertexColors: true, fog: false }));
    pts.frustumCulled = false;
    this.scene.add(pts);
    for (let i = 0; i < 4; i++) this.decalMats.push(new THREE.MeshLambertMaterial({ map: canvasTex(bloodCanvas(i * 13 + 5, 64, i % 2 === 1)), transparent: true, alphaTest: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 - i * 0.1 }));
    // ---- menu holders
    this.scene.add(this.titleG, this.menuG);
    this.buildTitle();
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
      this.cuffs.forEach((c, i) => this.rig!.bones[(['handL', 'handR', 'footL', 'footR'] as const)[i]].add(c));
      this.rig.bones.chest.add(this.harness);
    } else {
      try { this.rig.setAppearance(this.app); } catch (e) { console.warn('rig.setAppearance', e); }
      this.rig.setOutfit(this.dress());
    }
    const s = this.app.height || 1;
    for (const c of this.cuffs) { c.scale.setScalar(s); }
    this.cuffs[0].position.set(0, -0.02 * s, 0); this.cuffs[1].position.set(0, -0.02 * s, 0);
    this.cuffs[2].position.set(0, -0.36 * s, 0); this.cuffs[3].position.set(0, -0.36 * s, 0);
    this.cuffs[2].scale.set(s * 0.95, s, s * 0.95); this.cuffs[3].scale.set(s * 0.95, s, s * 0.95);
    this.harness.position.set(0, 0.12 * s, 0);
    this.harness.scale.set(s * (0.75 + 0.25 * ((this.rig.dims.mass ?? 1))), s, s * (0.62 + 0.2 * (this.rig.dims.mass ?? 1)));
  }
  setOutfit(o: Outfit) { this.outfit = o; this.rig?.setOutfit(this.dress()); }
  private dress(): Outfit {
    if (!this.extraBlood) return this.outfit;
    const cond = { ...(this.outfit.cond || {}) };
    cond.blood = { ...(cond.blood || {}), head: Math.max(cond.blood?.head || 0, this.extraBlood), neck: Math.max(cond.blood?.neck || 0, this.extraBlood - 1) };
    return { ...this.outfit, cond };
  }
  get rigSeed(): number { return (this.rig as any)?.seed ?? 0; }

  // ================================================================== title menu
  /** NOCLIP in six Nixie tubes on bakelite sockets, over an engraved brass plate */
  private buildTitle() {
    const r = 0.2;
    const glass = new THREE.MeshBasicMaterial({ color: 0xa8b8c0, transparent: true, opacity: 0.05, depthWrite: false, fog: false, side: THREE.DoubleSide });
    const tubeGeo = new THREE.CylinderGeometry(r, r, 0.6, 14, 1, true);
    const domeGeo = new THREE.SphereGeometry(r, 14, 5, 0, Math.PI * 2, 0, Math.PI / 2);
    const baseModel = tubeBaseModel(this.mats, r);
    const glyphs: (() => void)[] = [];
    'NOCLIP'.split('').forEach((ch, i) => {
      const g = new THREE.Group();
      const gc = document.createElement('canvas');
      paintNixie(gc, ch);
      const gt = canvasTex(gc);
      gt.magFilter = THREE.LinearFilter; gt.minFilter = THREE.LinearFilter;
      glyphs.push(() => { paintNixie(gc, ch); gt.needsUpdate = true; });
      const glyph = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.4), new THREE.MeshBasicMaterial({ map: gt, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, toneMapped: false }));
      glyph.position.y = 0.32;
      const tube = new THREE.Mesh(tubeGeo, glass); tube.position.y = 0.3;
      const dome = new THREE.Mesh(domeGeo, glass); dome.position.y = 0.6;
      g.add(baseModel.clone(), glyph, tube, dome);
      g.userData.home = new THREE.Vector3((i - 2.5) * 0.47, 0, 0);
      g.userData.glyph = glyph;
      g.position.copy(g.userData.home);
      this.titleG.add(g);
      this.letters.push(g);
    });
    const cv = document.createElement('canvas');
    const paint = () => paintBrass(cv, 'REMITTANCE PROGRAMME', 'MERIDIAN INSTITUTE \u00B7 SUBJECT ROOM 4 \u00B7 DO NOT RESIST', 256, 40);
    paint();
    const plateMat = new THREE.MeshBasicMaterial({ map: canvasTex(cv), fog: false });
    plateMat.color.setScalar(0.55);
    const sub = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.3), plateMat);
    sub.position.set(0, -0.28, 0.05);
    this.titleG.add(sub);
    this.titleG.userData.sub = sub;
    this.nixieLight.position.set(0, 0.35, 0.35);
    this.titleG.add(this.nixieLight);
    // fonts may arrive late: repaint everything painted with them
    fontsReady().then(() => { paint(); plateMat.map!.needsUpdate = true; for (const f of glyphs) f(); this.repaintSigns(); }).catch(() => {});
  }
  private nixieLight = new THREE.PointLight(PHOS.nixie, 0.5, 3.2, 2);

  /** (re)build the floating menu objects */
  setMenu(items: MenuItem[]) {
    for (const m of this.menu) { this.menuG.remove(m.group); m.group.traverse((o) => { const me = o as THREE.Mesh; if (me.isMesh && me.geometry) me.geometry.dispose(); }); }
    this.menu = [];
    const left = items.filter((i) => i.kind === 'sign'), right = items.filter((i) => i.kind !== 'sign');
    left.forEach((it, i) => this.addMenuObj(it, 'L', i, left.length));
    right.forEach((it, i) => this.addMenuObj(it, 'R', i, right.length));
    this.layoutMenu();
  }
  private addMenuObj(item: MenuItem, side: 'L' | 'R', i: number, n: number) {
    const g = new THREE.Group();
    const color = item.color ?? (item.primary ? PHOS.amber : i % 2 ? PHOS.green : PHOS.amber);
    const mats: THREE.MeshBasicMaterial[] = [], crts: CrtScreen[] = [], needles: THREE.Object3D[] = [];
    const repaint: (() => void)[] = [];
    const body = new THREE.Group();
    let r = 0.4;
    if (item.kind === 'sign') {
      // a floating television set, the option glowing on its picture tube
      const kind = item.primary ? 'console' : i % 2 ? 'portable' : 'monitor';
      const sw = item.primary ? 0.78 : 0.6, sh = item.primary ? 0.54 : 0.42;
      const W = 320, H = Math.round(320 * sh / sw);
      const scr = crtScreen(sw, sh, { tint: color, res: [W, H], curvature: 0.16, glow: 0.9, noise: 0.04, reflect: 0.85, flicker: 0.6 });
      scr.mesh.position.z = 0.012;
      const paint = () => {
        const c = scr.ctx;
        c.fillStyle = '#020302'; c.fillRect(0, 0, W, H);
        // two lines at most, big, centred
        const words = item.label.split(' ');
        let lines = [item.label];
        c.font = `${Math.round(H * 0.2)}px ${cssFont('--font-crt')}`;
        if (c.measureText(item.label).width > W * 0.86 && words.length > 1) {
          let best = 1, bestD = 1e9;
          for (let k = 1; k < words.length; k++) { const d = Math.abs(words.slice(0, k).join(' ').length - words.slice(k).join(' ').length); if (d < bestD) { bestD = d; best = k; } }
          lines = [words.slice(0, best).join(' '), words.slice(best).join(' ')];
        }
        let size = Math.round(H * (lines.length > 1 ? 0.17 : 0.2));
        c.font = `${size}px ${cssFont('--font-crt')}`;
        while (Math.max(...lines.map((l) => c.measureText(l).width)) > W * 0.88 && size > 10) { size -= 1; c.font = `${size}px ${cssFont('--font-crt')}`; }
        const y0 = H / 2 - (lines.length * size * 1.15) / 2;
        lines.forEach((l, k) => phosphorText(c, l, W / 2, y0 + k * size * 1.15, { size, color: '#ffffff', align: 'center', glow: 8 }));
        phosphorText(c, 'CH ' + (i + 2), 10, 8, { size: 12, color: '#6a6a6a', glow: 2 });
        phosphorText(c, item.primary ? 'ON AIR' : 'SIGNAL', W - 10, H - 20, { size: 11, color: '#5a5a5a', align: 'right', glow: 2 });
        c.fillStyle = '#9a9a9a'; c.fillRect(W / 2 + Math.max(...lines.map((l) => c.measureText(l).width)) / 2 + 6, y0 + (lines.length - 1) * size * 1.15 + size * 0.15, size * 0.5, size * 0.85);
        scr.flush();
      };
      paint();
      repaint.push(paint);
      crts.push(scr);
      body.add(tvModel(this.mats, kind, sw, sh), scr.mesh);
      r = Math.max(sw, sh) * 0.85;
    } else {
      let m: THREE.Object3D;
      if (item.kind === 'gear') {
        // a heavy steel gear on a panel of dials
        const steel = this.quality === 'low' ? new THREE.MeshLambertMaterial({ color: 0x8a8e90, emissive: 0x1a1c1c }) : new THREE.MeshStandardMaterial({ color: 0x9a9ea2, metalness: 0.75, roughness: 0.35, emissive: 0x101214 });
        const brass = this.quality === 'low' ? new THREE.MeshLambertMaterial({ color: 0xa8843a, emissive: 0x201400 }) : new THREE.MeshStandardMaterial({ color: 0xc89a48, metalness: 0.8, roughness: 0.3, emissive: 0x140a00 });
        m = new THREE.Mesh(gearGeometry(0.2, 16, 0.07), steel);
        const hub = new THREE.Mesh(gearGeometry(0.09, 10, 0.1), brass);
        hub.position.set(0.21, 0.13, 0.03);
        const panel = dialPanelModel(this.mats);
        panel.position.set(0, 0.17, -0.06);
        body.add(hub, panel);
        body.userData.hub = hub;
        ['PSI', 'VOLT', 'HUM'].forEach((lab, k) => {
          const gc = document.createElement('canvas'); paintGauge(gc, lab);
          const gm = new THREE.MeshBasicMaterial({ map: canvasTex(gc), fog: false });
          gm.color.setScalar(0.6); mats.push(gm);
          const face = new THREE.Mesh(new THREE.CircleGeometry(0.085, 14), gm);
          face.position.set(-0.26 + k * 0.26, 0.34, -0.065);
          const needle = new THREE.Mesh(new THREE.ConeGeometry(0.005, 0.07, 4), new THREE.MeshBasicMaterial({ color: 0x9a1a10 }));
          needle.geometry.translate(0, 0.03, 0);
          needle.position.set(-0.26 + k * 0.26, 0.34, -0.06);
          needles.push(needle);
          body.add(face, needle);
        });
        m.position.z = 0.02;
      } else m = propModel(this.mats, item.kind);
      body.add(m);
      body.userData.spin = m;
      // the name on a strip of embossed label tape stuck under it
      const tapeColor = item.kind === 'phone' ? 0x8a1a14 : item.kind === 'gear' ? 0x1a1a1a : item.kind === 'tape' ? 0x1e3470 : item.kind === 'key' ? 0x1e4a24 : 0x2a2a2a;
      const tc = document.createElement('canvas');
      const paint = () => paintTape(tc, item.label, tapeColor, 112, 20);
      paint();
      const tm = new THREE.MeshBasicMaterial({ map: canvasTex(tc), transparent: true, alphaTest: 0.5, fog: false });
      mats.push(tm);
      repaint.push(() => { paint(); tm.map!.needsUpdate = true; });
      const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.11), tm);
      lab.position.set(0, item.kind === 'gear' ? -0.3 : -0.36, 0.03);
      lab.rotation.z = (Math.random() - 0.5) * 0.08;
      g.add(lab);
      r = 0.32;
    }
    g.add(body);
    g.userData.repaint = repaint;
    const o: MenuObj = { item, group: g, body, mats, crts, needles, anchor: new THREE.Vector3(), r, phase: Math.random() * 10, hover: 0, hoverT: 0, press: 0, glitch: 0, nextGlitch: 4 + Math.random() * 8, out: 0, color };
    g.userData.side = side; g.userData.i = i; g.userData.n = n;
    this.menuG.add(g);
    this.menu.push(o);
  }
  private repaintSigns() { for (const m of this.menu) for (const f of (m.group.userData.repaint || []) as (() => void)[]) f(); }
  /** spread the menu over the visible frustum (works from phones to ultrawide) */
  private layoutMenu() {
    const aspect = this.lowW && this.lowH ? this.lowW / this.lowH : 16 / 9;
    const portrait = aspect < 1;
    // a stand-in for the title camera's resting pose: menu positions are picked in its screen space
    const cam = this.layCam;
    cam.fov = this.cam.fov; cam.aspect = aspect; cam.updateProjectionMatrix();
    cam.position.set(0, 1.5, portrait ? 5.2 : 4.4); cam.lookAt(0, portrait ? 1.35 : 1.15, -0.4); cam.updateMatrixWorld(true);
    const at = (nx: number, ny: number, dist: number, out: THREE.Vector3) => {
      out.set(nx, ny, 0.5).unproject(cam).sub(cam.position).normalize();
      return out.multiplyScalar(dist).add(cam.position);
    };
    // world width visible at a distance, to size things to the screen
    const widthAt = (dist: number) => 2 * dist * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * aspect;
    const nL = this.menu.filter((m) => m.group.userData.side === 'L').length;
    for (const m of this.menu) {
      const side = m.group.userData.side as 'L' | 'R', i = m.group.userData.i as number;
      let nx: number, ny: number, d: number;
      if (portrait) {
        const idx = this.menu.indexOf(m), rows = Math.ceil(this.menu.length / 2);
        nx = idx % 2 ? 0.48 : -0.48; ny = 0.38 - (Math.floor(idx / 2) / Math.max(1, rows - 1)) * 1.12; d = 3.4;
      } else if (side === 'L') {
        nx = -0.62 + (i % 2) * 0.05; ny = (nL <= 1 ? 0 : 0.3 - (i / (nL - 1)) * 0.75); d = 3.3 - (i % 2) * 0.15;
      } else {
        const spots: [number, number, number][] = [[0.6, 0.36, 3.4], [0.84, 0.08, 3.7], [0.56, -0.2, 3.2], [0.84, -0.48, 3.6], [0.6, -0.72, 3.3], [0.82, 0.62, 3.8]];
        [nx, ny, d] = spots[i % spots.length];
      }
      at(nx, ny, d, m.anchor);
      const sc = portrait ? Math.max(0.36, Math.min(0.6, widthAt(d) / 4.2)) : Math.max(0.45, Math.min(0.85, widthAt(d) / 6));
      m.group.userData.sc0 = sc;
      m.group.position.copy(m.anchor);
      m.group.scale.setScalar(sc);
    }
    at(0, portrait ? 0.62 : 0.5, 4.0, this.titleG.position);
    this.titleG.scale.setScalar(Math.max(0.45, Math.min(0.85, widthAt(4.0) / (portrait ? 3.2 : 5.6))));
  }
  private layCam = new THREE.PerspectiveCamera(42, 1, 0.05, 40);
  /** highlight a menu object (DOM focus or pointer) */
  hoverItem(key: string | null) {
    if (key && key !== this.hoverKey) sfx('hover');
    this.hoverKey = key;
  }
  /** the satisfying press: the object shoves back, flares, springs out */
  async pressItem(key: string) {
    const m = this.menu.find((o) => o.item.key === key);
    if (!m) return;
    m.press = 1;
    this.pushKey = key;
    sfx('press');
    if (m.item.kind === 'gear') { (m.body.userData as any).kick = 14; sfx('gear'); }
    this.flash = Math.max(this.flash, calm() ? 0.05 : 0.12);
    await this.wait(260);
  }
  /** screen rectangle (client px) of a menu object for the DOM hit boxes */
  itemRect(key: string): { x: number; y: number; r: number } | null {
    const m = this.menu.find((o) => o.item.key === key);
    if (!m || !this.lowW) return null;
    const c = this.canvas.getBoundingClientRect();
    m.group.getWorldPosition(this.v1);
    this.v1.project(this.cam);
    const d = this.cam.position.distanceTo(m.group.getWorldPosition(this.v2));
    const r = (m.r * m.group.scale.x / (d * Math.tan(THREE.MathUtils.degToRad(this.cam.fov / 2)))) * c.height / 2;
    return { x: c.left + (this.v1.x * 0.5 + 0.5) * c.width, y: c.top + (-this.v1.y * 0.5 + 0.5) * c.height, r };
  }
  menuKeys() { return this.menu.map((m) => m.item.key); }
  /** ease the camera in toward a menu object (null: back to the slow creep) */
  pushTo(key: string | null) { this.pushKey = key; }

  // ================================================================== sequences
  /** the breaker: lights on, signs away, arms out, the subject lifted out of the chair and strapped in mid-air */
  async lightsOn() {
    if (this.mode === 'lit') return;
    this.busy = true;
    this.mode = 'lit'; this.view = 'creator';
    this.pushKey = null;
    this.hoverKey = null;
    sfx('breaker');
    this.shake = Math.max(this.shake, 0.25);
    this.litT = 0.001; // flicker sequence runs in frame()
    this.menuOutT = 1;
    this.setFocus('full');
    await this.wait(500);
    sfx('servo');
    const [L, R, H, T] = this.arms;
    // reach for the wrists on the armrests
    L.follow = { kind: 'bone', bone: 'handL', off: new THREE.Vector3(0.05, 0.25, -0.05) };
    R.follow = { kind: 'bone', bone: 'handR', off: new THREE.Vector3(-0.05, 0.25, -0.05) };
    L.k = R.k = 45; L.c = R.c = 10;
    await this.wait(850);
    for (const a of [L, R]) { (a.follow as any).off.set(0, 0, 0); }
    await this.wait(250);
    sfx('clamp'); L.gripT = R.gripT = 1;
    this.cuffs[0].visible = this.cuffs[1].visible = true;
    this.chairStraps.visible = false; this.chairBare.visible = true;
    this.twitch = 1;
    await this.wait(250);
    // lift
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
  /** back to the dark: he is put back in the chair, the arms withdraw, the signs return */
  async lightsOff() {
    if (this.mode === 'title') return;
    this.busy = true;
    const [L, R, H, T] = this.arms;
    T.follow = { kind: 'stow' };
    H.gripT = 0; this.harness.visible = false; H.follow = { kind: 'stow' };
    this.chainsOn = 0; this.cuffs[2].visible = this.cuffs[3].visible = false;
    sfx('servo');
    // carry back to the chair
    this.state = 'carry'; this.stateT = 0;
    this.liftFrom.copy(this.subj.position);
    this.seatPos(this.liftTo);
    this.liftMid.set(0, this.liftFrom.y + 0.5, (this.liftFrom.z + this.liftTo.z) / 2);
    this.subj.visible = true; this.squash = 1;
    await this.wait(1450);
    this.state = 'seat';
    L.gripT = R.gripT = 0; this.cuffs[0].visible = this.cuffs[1].visible = false;
    this.chairStraps.visible = true; this.chairBare.visible = false;
    sfx('clamp');
    L.follow = R.follow = { kind: 'stow' }; L.k = R.k = 60;
    await this.wait(400);
    sfx('breaker');
    this.mode = 'title'; this.view = 'title';
    this.litT = 0;
    this.menuOutT = 0;
    this.setFocus('full');
    await this.wait(500);
    this.busy = false;
  }
  private seatPos(out: THREE.Vector3) {
    const hip = this.rig?.dims.hipY ?? 0.94;
    return out.set(0, ROOM.SEAT_Y + 0.11 - hip, ROOM.CHAIR_Z - 0.16);
  }

  /** the tool arm goes to the part being edited (null = hover by the shoulder) */
  setFocus(k: string | null) {
    this.focusKey = k || 'full';
    this.toolPart = k || 'idle';
    this.selPart = k;
    this.orbitT = 0; this.zoom = 1;
  }
  setView(v: 'creator' | 'gender') { this.view = v; this.setFocus('full'); }
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
    if (prevFocus !== 'head' && prevFocus !== 'hair') this.focusKey = 'head';
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
    this.focusKey = prevFocus;
  }

  /** the gender press: alarm, the slab comes down, the room is painted; apply() makes the clone; the arms bring it in */
  async press(apply: () => void) {
    if (this.busy || !this.rig) return;
    this.busy = true;
    const [L, R, H, T] = this.arms;
    this.view = 'gender';
    this.alarm.intensity = calm() ? 3 : 14;
    sfx('klaxon');
    T.follow = { kind: 'stow' };
    // the slab creeps down to just over his head
    const headTop = this.subj.position.y + 1.82 * (this.app?.height || 1);
    await this.animate(1100, (t) => { this.pressY = THREE.MathUtils.lerp(ROOM.H + 0.05, headTop + 0.12, ease(t)); this.struggle = t; });
    sfx('klaxon'); sfx('hiss');
    this.struggle = 1.5;
    await this.wait(500);
    // the harness and wrist arms let go and snap back
    H.gripT = 0; this.harness.visible = false; H.follow = { kind: 'stow' }; H.k = 120;
    L.gripT = R.gripT = 0; this.cuffs[0].visible = this.cuffs[1].visible = false;
    L.follow = { kind: 'point', p: new THREE.Vector3(1.5, 2.9, ROOM.BACK + 0.6) }; R.follow = { kind: 'point', p: new THREE.Vector3(-1.5, 2.9, ROOM.BACK + 0.6) };
    L.k = R.k = 140; L.c = R.c = 18;
    this.state = 'drop'; this.stateT = 0;
    sfx('clamp');
    await this.wait(120);
    // SLAM
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
    // up again, dripping
    sfx('hiss');
    await this.animate(1500, (t) => { this.pressY = THREE.MathUtils.lerp(ROOM.PLATE_Y, ROOM.H + 0.05, ease(t)); if (Math.random() < 0.5) this.emitDrip(); });
    this.alarm.intensity = 0;
    // the clone, out of the hatch
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
    if (kind === 0) { this.pCol[j] = 0.45 * b + 0.12; this.pCol[j + 1] = 0.01; this.pCol[j + 2] = 0.02; }
    else { this.pCol[j] = 1; this.pCol[j + 1] = 0.75 + 0.25 * b; this.pCol[j + 2] = 0.35 + 0.6 * b; }
  }
  private sparkBurst(p: THREE.Vector3, n: number) {
    for (let i = 0; i < n; i++) this.emit(p.x, p.y, p.z, (Math.random() - 0.5) * 3, Math.random() * 2.5, (Math.random() - 0.3) * 2.5, 1, 0.3 + Math.random() * 0.4);
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
  /** a decal on a surface: n is the surface normal axis ('y' floor / ceiling, 'z' back wall, 'x' side walls) */
  private decal(x: number, y: number, z: number, axis: 'y' | 'z' | 'x' | '-y', size: number) {
    let m = this.decals[this.decalNext];
    if (!m) { m = new THREE.Mesh(this.decalGeo, this.decalMats[0]); this.scene.add(m); this.decals[this.decalNext] = m; }
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
  /** drops on the lens (a DOM overlay; they run and fade) */
  splatLens(n: number) {
    if (calm()) n = Math.min(n, 2);
    for (let i = 0; i < n; i++) {
      const d = document.createElement('i');
      const s = 30 + Math.random() * 110;
      d.style.cssText = `left:${Math.random() * 100}%;top:${Math.random() * 90}%;width:${s}px;height:${s}px;animation-delay:${Math.random() * 0.2}s`;
      this.lens.append(d);
      setTimeout(() => d.remove(), 6000);
    }
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
      const r = cv.getBoundingClientRect();
      this.parTX = ((e.clientX - r.left) / r.width - 0.5); this.parTY = ((e.clientY - r.top) / r.height - 0.5);
      if (this.mode !== 'lit') return;
      const p = this.ptr.get(e.pointerId);
      if (!p) { if (e.pointerType === 'mouse') this.setHoverPart(this.partAt(e.clientX, e.clientY), e.clientX, e.clientY); return; }
      p.x = e.clientX; p.y = e.clientY;
      const dx = p.x - p.x0, dy = p.y - p.y0;
      if (p.head && Math.abs(dy) > 46 && Math.abs(dy) > Math.abs(dx) * 1.3) {
        // a swipe up or down the face changes it
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
  private resize() {
    if (!this.renderer) return;
    const w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight);
    const target = this.quality === 'low' ? 270 : this.quality === 'medium' ? 400 : 480;
    const px = Math.max(1, h / target);
    const lw = Math.max(64, Math.round(w / px)), lh = Math.max(64, Math.round(h / px));
    if (lw === this.lowW && lh === this.lowH) return;
    this.lowW = lw; this.lowH = lh;
    this.renderer.setSize(lw, lh, false);
    this.cam.aspect = lw / lh;
    this.cam.fov = lw / lh < 1 ? 62 : 42;
    this.cam.updateProjectionMatrix();
    this.rt?.dispose();
    this.rt = new THREE.WebGLRenderTarget(lw, lh, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, depthTexture: new THREE.DepthTexture(lw, lh) });
    if (!this.post) {
      const mat = new THREE.ShaderMaterial({
        uniforms: { tex: { value: null }, tDepth: { value: null }, uNear: { value: 0.05 }, uFar: { value: 40 }, uFocus: { value: 4 }, uAperture: { value: 1 }, uMaxBlur: { value: 0 }, uTime: { value: 0 }, uFlash: { value: 0 }, uRed: { value: 0 }, uVig: { value: 1.2 }, uRes: { value: new THREE.Vector2() } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
        fragmentShader: `
          uniform sampler2D tex; uniform sampler2D tDepth; uniform float uNear; uniform float uFar; uniform float uFocus; uniform float uAperture; uniform float uMaxBlur; uniform float uTime; uniform float uFlash; uniform float uRed; uniform float uVig; uniform vec2 uRes;
          float linD(vec2 uv) { float z = texture2D(tDepth, uv).x * 2.0 - 1.0; return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear)); }
          varying vec2 vUv;
          float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
          void main(){
            vec3 c = texture2D(tex, vUv).rgb;
            // the lens: whatever is not at the focus distance goes soft (a cheap 8-tap disc)
            if (uMaxBlur > 0.01) {
              float d = linD(vUv);
              float coc = clamp(abs(d - uFocus) / max(d, 0.1) * 2.6 * uAperture, 0.0, 1.0) * uMaxBlur;
              if (coc > 0.25) {
                vec3 acc = c;
                for (int i = 0; i < 8; i++) { float a = float(i) * 0.785398; acc += texture2D(tex, vUv + vec2(cos(a), sin(a)) * coc / uRes).rgb; }
                c = acc / 9.0;
              }
            }
            vec2 q = vUv - 0.5;
            c *= clamp(1.0 - dot(q, q) * uVig, 0.0, 1.0);
            // ordered grain, per art pixel
            vec2 px = floor(vUv * uRes);
            c += (hash(px + floor(uTime * 24.0)) - 0.5) * 0.016;
            c *= 0.97 + 0.03 * mod(px.y, 2.0);
            c = mix(c, vec3(1.0, 0.97, 0.92), clamp(uFlash, 0.0, 1.0));
            c = mix(c, c * vec3(1.5, 0.3, 0.25) + vec3(0.1, 0.0, 0.0), clamp(uRed, 0.0, 1.0) * 0.45);
            gl_FragColor = vec4(max(c, 0.0), 1.0);
            #include <colorspace_fragment>
          }`,
        depthTest: false, depthWrite: false,
      });
      const scene = new THREE.Scene();
      scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
      this.post = { scene, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), mat };
    }
    this.post.mat.uniforms.tex.value = this.rt.texture;
    this.post.mat.uniforms.uRes.value.set(lw, lh);
    this.post.mat.uniforms.tDepth.value = this.rt.depthTexture;
    this.post.mat.uniforms.uMaxBlur.value = this.quality === 'low' ? 0 : 1.8;
    this.layoutMenu();
  }

  /** lighting for a level of "lit" (0 title dark .. 1 tubes full on) */
  private applyLight(l: number) {
    this.hemi.intensity = 0.05 + l * 0.65;
    this.key.intensity = l * 1.7;
    this.fill.intensity = l * 0.45;
    this.rim.intensity = 0.35 + l * 0.2;
    const c = 0.05 + l * 0.95;
    this.tubeMat.color.setRGB(c, c * 0.98, c * 0.92);
  }

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, (now - this.last) / 1000) * this.timeScale;
    if (dt < this.timeScale / 62) return;
    this.last = now;
    if (document.hidden || this.paused || !this.renderer || !this.rt || !this.post) return;
    this.t += dt;
    const t = this.t;
    this.runClock();
    // ---- lights
    if (this.litT > 0) {
      this.litT += dt;
      const k = this.litT;
      // the tubes stutter on
      const on = k > 0.42 || (k > 0.05 && k < 0.12) || (k > 0.2 && k < 0.27) || (k > 0.33 && k < 0.36);
      this.lit = damp(this.lit, on ? 1 : 0.08, on ? 30 : 40, dt);
    } else this.lit = damp(this.lit, 0, 5, dt);
    this.applyLight(this.lit);
    const calmNow = calm();
    // the bulb: weak, buzzing, sometimes out
    this.flicker -= dt;
    if (this.flicker < 0) this.flicker = Math.random() < 0.08 ? 0.05 + Math.random() * 0.25 : 0.4 + Math.random() * 2;
    const dark = this.mode === 'title';
    const bulbOn = dark ? (this.flicker < 0.12 && !calmNow ? 0.02 : 0.3 + Math.sin(t * 50) * 0.04) : 0.25;
    this.bulb.intensity = bulbOn;
    this.bulbPivot.rotation.set(Math.sin(t * 0.83 + 1) * 0.1, 0, Math.sin(t * 1.27) * 0.2);
    this.bulbMesh.getWorldPosition(this.bulb.position);
    this.bulb.position.y -= 0.08;
    this.updateBeam(dt);
    const bc = 0.15 + bulbOn * 1.4;
    this.bulbMat.color.setRGB(bc, bc * 0.7, bc * 0.4);
    // sparks from the cap while he sits in it
    if (dark && this.state === 'seat' && Math.random() < dt * (calmNow ? 0.12 : 0.35)) this.zap();
    this.spark.intensity = damp(this.spark.intensity, 0, 14, dt);
    // hatch light pulses when it is open
    this.hatchOpen = damp(this.hatchOpen, this.hatchT, 3, dt);
    this.shutter.position.y = this.hatchOpen * (ROOM.HATCH_H - 0.05);
    const hl = 0.2 + this.hatchOpen * (0.6 + 0.4 * Math.sin(t * 9));
    this.hatchLightMat.color.setRGB(hl, hl * 0.08, hl * 0.06);
    // alarm sweeps
    if (this.alarm.intensity > 0) { this.alarm.target.position.set(Math.sin(t * 7) * 2.5, 0, ROOM.FLOAT_Z + Math.cos(t * 7) * 2); }
    // ---- menu
    this.menuOut = damp(this.menuOut, this.menuOutT, this.menuOutT ? 5 : 3, dt);
    this.updateMenu(dt);
    // ---- subject
    this.updateSubject(dt);
    // ---- arms
    for (const a of this.arms) this.updateArm(a, dt);
    // ---- press
    this.pressG.position.y = this.pressY;
    this.pressG.visible = this.pressY < ROOM.H + 1.0;
    // ---- chains
    for (let i = 0; i < 2; i++) {
      const ch = this.chains[i];
      ch.visible = this.chainsOn > 0 && this.subj.visible && !!this.rig;
      if (!ch.visible) continue;
      this.rig!.bones[i ? 'footR' : 'footL'].getWorldPosition(this.v1);
      this.v1.y += 0.0;
      this.v2.set(i ? -0.34 : 0.34, ROOM.PLATE_Y + 0.05, ROOM.FLOAT_Z + 0.1);
      this.placeRod(ch, this.v2, this.v1);
    }
    // ---- particles
    this.updateParticles(dt);
    // ---- blood on the face fades
    if (this.extraBlood && this.maulT < 0) { this.bloodT += dt; if (this.bloodT > 5 && this.extraBlood > 1) { this.extraBlood = 1; this.rig?.setOutfit(this.dress()); } }
    // ---- camera
    this.updateCamera(dt);
    // ---- post
    this.flash = Math.max(0, this.flash - dt * 2.2);
    this.redFlash = Math.max(0, this.redFlash - dt * 0.8);
    const pu = this.post.mat.uniforms;
    pu.uTime.value = t; pu.uFlash.value = this.flash; pu.uRed.value = this.redFlash;
    pu.uVig.value = 2.2 - this.lit * 1.1;
    pu.uFocus.value = this.focus; pu.uAperture.value = this.mode === 'title' ? 1 : 0.35;
    this.render();
  };

  /** the key light on his face, its visible shaft and the dust turning in it */
  private updateBeam(dt: number) {
    const t = this.t;
    this.flare = Math.max(0, this.flare - dt * 2.5);
    const dark = this.mode === 'title' ? 1 - this.lit : 0;
    const head = this.v1;
    if (this.rig) { this.rig.bones.head.getWorldPosition(head); head.y += 0.1 * (this.app?.height || 1); head.z += 0.04; } else head.set(0, 1.3, -0.5);
    this.faceSpot.target.position.copy(head);
    // it breathes a little (a fan turning in front of the louvre)
    const fan = 0.82 + 0.18 * Math.abs(Math.sin(t * 2.1));
    this.faceSpot.intensity = dark * (7 * fan + this.flare * 18);
    this.faceSpot.angle = 0.12 + this.flare * 0.12;
    const sh = this.shaft;
    sh.visible = dark > 0.02;
    if (!sh.visible) { this.dust.visible = false; return; }
    const from = this.faceSpot.position;
    const dir = this.v2.subVectors(head, from);
    const len = dir.length() + 0.25;
    dir.normalize();
    const R = Math.tan(this.faceSpot.angle) * len;
    sh.position.copy(from);
    sh.quaternion.setFromUnitVectors(this.v3.set(0, -1, 0), dir);
    sh.scale.set(R, len, R);
    (sh.material as THREE.ShaderMaterial).uniforms.uInt.value = dark * (0.07 * fan + this.flare * 0.12);
    // dust motes: drift along and round the beam
    this.dust.visible = true;
    const a = this.v3.set(0, 1, 0).cross(dir).normalize(), b = this.v4.crossVectors(dir, a);
    const P = this.dustPos, D = this.dustP;
    for (let i = 0; i < this.dustN; i++) {
      const j = i * 4;
      D[j] += D[j + 3] * dt * 0.4; if (D[j] > 1) D[j] -= 0.95;
      D[j + 1] += dt * (0.2 + D[j + 3] * 4);
      const u = 0.08 + D[j] * 0.92, rr = D[j + 2] * R * u * 0.9;
      const ca = Math.cos(D[j + 1]) * rr, sa = Math.sin(D[j + 1]) * rr;
      P[i * 3] = from.x + dir.x * u * len + a.x * ca + b.x * sa;
      P[i * 3 + 1] = from.y + dir.y * u * len + a.y * ca + b.y * sa + Math.sin(t * 0.7 + i) * 0.01;
      P[i * 3 + 2] = from.z + dir.z * u * len + a.z * ca + b.z * sa;
    }
    (this.dust.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.dust.material as THREE.PointsMaterial).opacity = 0.75 * dark;
  }

  private zap() {
    this.spark.intensity = 6 + Math.random() * 6;
    this.flare = calm() ? 0.4 : 1;
    this.shake = Math.max(this.shake, calm() ? 0 : 0.18);
    this.twitch = 1;
    this.sparkBurst(this.spark.position, 14);
    if (Math.random() < 0.7) { sfx('buzz', 0.5); sfx('spark', 0.6); }
  }

  private updateMenu(dt: number) {
    const t = this.t;
    const out = this.menuOut;
    this.menuG.visible = this.titleG.visible = out < 0.98;
    if (!this.menuG.visible) return;
    const calmNow = calm();
    this.parX = damp(this.parX, this.parTX, 3, dt); this.parY = damp(this.parY, this.parTY, 3, dt);
    // the Nixie tubes: a soft hum of brightness, now and then one gutters
    this.letters.forEach((g, i) => {
      const h = g.userData.home as THREE.Vector3;
      g.position.set(h.x, h.y + Math.sin(t * 0.9 + i * 0.7) * 0.025 + out * (1.5 + i * 0.2), h.z + Math.sin(t * 0.6 + i * 1.7) * 0.03);
      g.rotation.set(Math.sin(t * 0.5 + i) * 0.04, Math.sin(t * 0.4 + i * 2.1) * 0.12 + out * 3, Math.sin(t * 0.45 + i) * 0.03);
      const glyph = g.userData.glyph as THREE.Mesh;
      const ud = g.userData;
      ud.gut = Math.max(0, (ud.gut || 0) - dt);
      if (!calmNow && Math.random() < dt * 0.05) ud.gut = 0.08 + Math.random() * 0.2;
      glyph.visible = !(ud.gut > 0 && Math.sin(t * 90 + i) > -0.2);
    });
    this.nixieLight.intensity = (0.45 + Math.sin(t * 7.3) * 0.03) * (1 - out);
    const sub = this.titleG.userData.sub as THREE.Mesh;
    sub.position.y = -0.28 + Math.sin(t * 1.1) * 0.012 - out;
    for (const m of this.menu) {
      const hov = m.item.key === this.hoverKey ? 1 : 0;
      m.hover = damp(m.hover, hov, 8, dt);
      m.press = Math.max(0, m.press - dt * 3);
      // interference: a burst of static and a roll on a set now and then
      m.nextGlitch -= dt;
      if (m.nextGlitch < 0) { m.glitch = 0.15 + Math.random() * 0.3; m.nextGlitch = 5 + Math.random() * 10; }
      m.glitch = Math.max(0, m.glitch - dt);
      const g = m.group;
      const ph = m.phase;
      const pressK = Math.sin(Math.min(1, 1 - m.press) * Math.PI) * m.press;
      const dir = g.userData.side === 'L' ? -1 : 1;
      // floating: a slow bob and drift, a lean toward you when chosen
      g.position.set(
        m.anchor.x + Math.sin(t * 0.31 + ph) * 0.05 + dir * out * 3 - this.parX * 0.06,
        m.anchor.y + Math.sin(t * 0.7 + ph) * 0.045 + m.hover * 0.025 + this.parY * 0.04,
        m.anchor.z + Math.sin(t * 0.43 + ph * 1.3) * 0.07 + m.hover * 0.16 - m.press * 0.2,
      );
      const base = g.userData.side === 'L' ? 0.32 : -0.34;
      g.rotation.set(Math.sin(t * 0.55 + ph) * 0.05 - m.hover * 0.04 + pressK * 0.18, base * (1 - m.hover * 0.6) + Math.sin(t * 0.37 + ph) * 0.12, Math.sin(t * 0.5 + ph * 0.7) * 0.05 + out * dir);
      const sc0 = g.userData.sc0 ?? 1;
      g.scale.setScalar(sc0 * (1 + m.hover * 0.06 - m.press * 0.08) * (1 - out * 0.6));
      for (const sc of m.crts) {
        const u = sc.mat.uniforms;
        (u.uTint.value as THREE.Color).setHex(m.color).multiplyScalar(0.62 + m.hover * 0.6 + m.press * 1.2);
        u.uNoise.value = m.glitch > 0 && !calmNow ? 0.35 : 0.04 + m.press * 0.2;
        sc.power(out < 0.2);
      }
      const k = 0.5 + m.hover * 0.5 + m.press * 0.6;
      for (const mat of m.mats) mat.color.setRGB(k, k, k);
      m.needles.forEach((nd, j) => { nd.rotation.z = -0.9 + Math.sin(t * (0.6 + j * 0.37) + j) * 0.5 + Math.sin(t * 13 + j) * 0.03 + m.hover * 0.6 - m.press * 1.2; });
      const spin = m.body.userData.spin as THREE.Object3D | undefined;
      if (m.item.kind === 'gear') {
        const ud = m.body.userData as any;
        ud.kick = Math.max(0, (ud.kick || 0) - dt * 10);
        ud.ang = (ud.ang || 0) + dt * (0.25 + m.hover * 1.2 + ud.kick);
        spin!.rotation.z = -ud.ang;
        (ud.hub as THREE.Object3D).rotation.z = ud.ang * 12 / 8 + 0.2;
      } else if (spin) {
        m.body.rotation.y = Math.sin(t * 0.45 + ph) * 0.45 + m.hover * Math.sin(t * 5) * 0.1;
        m.body.rotation.x = 0.3 + Math.sin(t * 0.4 + ph) * 0.1;
      }
    }
    // the sets' glow flickers on him: the chosen one, or the cluster on the left
    const hm = this.menu.find((m) => m.item.key === this.hoverKey);
    const tvs = this.menu.filter((m) => m.item.kind === 'sign');
    const src = hm || tvs[0];
    if (src && out < 0.5) {
      src.group.getWorldPosition(this.v1);
      this.glow.position.lerp(this.v1.add(this.v2.set(0, 0, -0.15)), Math.min(1, dt * 6));
      this.glow.color.setHex(src.color);
      const fl = 0.9 + Math.sin(t * 31) * 0.05 + (Math.random() < 0.05 ? -0.3 : 0);
      this.glow.intensity = damp(this.glow.intensity, (hm ? 0.6 : 0.25) * fl, 6, dt);
    } else this.glow.intensity = damp(this.glow.intensity, 0, 4, dt);
  }

  private updateSubject(dt: number) {
    const rig = this.rig;
    if (!rig) return;
    this.stateT += dt;
    this.twitch = Math.max(0, this.twitch - dt * 3);
    this.jerk = Math.max(0, this.jerk - dt * 4);
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
      const back = this.state === 'carry' && this.mode === 'lit' && this.liftTo.y < 0 ? true : false;
      if (this.stateT >= 0) {
        // bezier from -> mid -> to
        const a = this.v1.copy(this.liftFrom).lerp(this.liftMid, k), b = this.v2.copy(this.liftMid).lerp(this.liftTo, k);
        this.subj.position.copy(a.lerp(b, k));
      }
      const limp = this.state === 'carry' && !back ? this.limpPose() : null;
      p = back ? blendPose(blendPose(pose, fl, 1), seat, k) : limp ? blendPose(blendPose(pose, limp, 1), fl, k) : blendPose(blendPose(pose, seat, 1), fl, k);
      if (k >= 1 && this.state === 'lift') { this.state = 'float'; this.stateT = 0; }
    } else if (this.state === 'drop') {
      p = blendPose(pose, fl, 1);
      // nothing holds him now: he drops onto the die and the slab finds him there
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
    // twitches (sparks), struggling (strapped, press coming), the maul
    const tw = this.twitch * (calm() ? 0.3 : 1), st = this.struggle, ma = this.maulT >= 0 ? 1 : 0;
    if (tw > 0.01 || st > 0.01 || ma) {
      const n = (f: number, o: number) => Math.sin(t * f + o) * (tw * 0.25 + st * 0.12 + ma * 0.18) + (Math.random() - 0.5) * (tw * 0.25 + ma * 0.2);
      const add = (k: keyof Pose, x: number, y: number, z: number) => { const v = (p as any)[k] || [0, 0, 0]; (p as any)[k] = [v[0] + x, v[1] + y, v[2] + z]; };
      add('head', n(31, 0) - ma * 0.35, n(23, 1) * 1.5, n(19, 2));
      add('chest', n(17, 3) * 0.6, n(13, 4) * 0.6, n(11, 5) * 0.4);
      add('thighL', n(9, 6), 0, n(7, 7) * 0.3); add('thighR', n(8, 8), 0, n(10, 9) * 0.3);
      add('shinL', Math.abs(n(12, 10)), 0, 0); add('shinR', Math.abs(n(14, 11)), 0, 0);
      (p as any).gripL = 1; (p as any).gripR = 1;
    }
    this.struggle = Math.max(0, this.struggle - dt * 0.25);
    rig.applyPose(p);
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
      spine: [0.06 + br, 0, 0], chest: [0.04, 0, 0.02], neck: [0.06, 0, 0], head: [0.16 + Math.sin(t * 0.3) * 0.05, 0.1 + Math.sin(t * 0.17) * 0.08, 0.06],
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

  private updateArm(a: Arm, dt: number) {
    // ---- goal
    const f = a.follow;
    if (f.kind === 'stow') a.goal.copy(a.stow);
    else if (f.kind === 'point') a.goal.copy(f.p);
    else if (f.kind === 'bone') {
      if (this.rig && this.subj.visible) { this.rig.bones[f.bone as 'head'].getWorldPosition(a.goal); a.goal.add(f.off); } else a.goal.copy(a.stow);
    } else this.toolTarget(a.goal);
    // ---- spring (sub-stepped: stiff grips and slow frames stay stable)
    const k = a.k, c = a.c;
    for (let rem = dt; rem > 1e-5; rem -= 1 / 90) {
      const h = Math.min(rem, 1 / 90);
      a.vel.x += ((a.goal.x - a.tip.x) * k - a.vel.x * c) * h;
      a.vel.y += ((a.goal.y - a.tip.y) * k - a.vel.y * c) * h;
      a.vel.z += ((a.goal.z - a.tip.z) * k - a.vel.z * c) * h;
      a.tip.addScaledVector(a.vel, h);
    }
    // gripping a wrist: stick to it
    if (f.kind === 'bone' && a.gripT > 0.5) a.tip.lerp(a.goal, Math.min(1, dt * 25));
    a.grip = damp(a.grip, a.gripT, 12, dt);
    // ---- two-bone IK in the plane of the pole
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
    // a stowed arm is inside the wall: do not draw what would poke out behind the camera
    for (const fg of a.fingers) fg.rotation.z = (fg.position.x > 0 ? -1 : 1) * (0.55 - a.grip * 0.62);
    if (a.saw) { a.spin = damp(a.spin, this.maulT >= 0 ? 40 : this.toolPart !== 'idle' ? 6 : 1.5, 4, dt); a.saw.rotation.z += a.spin * dt; }
  }
  /** where the tool arm wants to be */
  private toolTarget(out: THREE.Vector3) {
    const rig = this.rig;
    const s = this.app?.height || 1;
    if (!rig || !this.subj.visible || this.mode !== 'lit') { out.copy(this.arms[3].stow); return; }
    const t = this.t;
    if (this.maulT >= 0) {
      // in, out, in: the saw goes at the face
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

  private placeRod(m: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3) {
    const d = this.v3.subVectors(b, a);
    const L = d.length();
    m.position.copy(a).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(UP, d.normalize());
    m.scale.set(1, Math.max(0.01, L), 1);
  }

  private updateParticles(dt: number) {
    const P = this.pPos, V = this.pVel;
    let any = false;
    for (let i = 0; i < NP; i++) {
      if (this.pLife[i] <= 0) continue;
      any = true;
      const j = i * 3;
      this.pLife[i] -= dt;
      const sp = this.pKind[i] === 1;
      V[j + 1] -= (sp ? 6 : 9.8) * dt;
      P[j] += V[j] * dt; P[j + 1] += V[j + 1] * dt; P[j + 2] += V[j + 2] * dt;
      const floor = Math.abs(P[j]) < 0.7 && Math.abs(P[j + 2] - ROOM.FLOAT_Z) < 0.55 ? ROOM.PLATE_Y : 0;
      let hit = '';
      if (P[j + 1] < floor) hit = 'y';
      else if (P[j + 2] < ROOM.BACK + 0.01) hit = 'z';
      else if (Math.abs(P[j]) > ROOM.W - 0.01) hit = 'x';
      else if (P[j + 1] > ROOM.H - 0.02) hit = '-y';
      if (hit || this.pLife[i] <= 0) {
        if (hit && !sp && Math.random() < 0.05) this.decal(Math.max(-ROOM.W + 0.012, Math.min(ROOM.W - 0.012, P[j])), hit === 'y' ? floor + 0.004 + Math.random() * 0.002 : Math.max(0.02, Math.min(ROOM.H - 0.012, P[j + 1])), Math.max(ROOM.BACK + 0.012, P[j + 2]), hit as any, 0.1 + Math.random() * 0.18);
        this.pLife[i] = 0; P[j + 1] = -50;
      }
    }
    if (any || this.pNext) { (this.pGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true; (this.pGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true; }
  }

  private updateCamera(dt: number) {
    const portrait = this.lowW / Math.max(1, this.lowH) < 1;
    const H = this.app?.height || 1;
    const sy = this.subj.position.y;
    if (this.mode === 'title') {
      const t = this.t;
      const creep = 0.5 - 0.5 * Math.cos(t * 0.04);
      this.camPosT.set(Math.sin(t * 0.055) * 0.2, 1.5 + Math.sin(t * 0.07) * 0.05, (portrait ? 5.4 : 4.75) - creep * 0.5);
      this.camLookT.set(Math.sin(t * 0.045) * 0.08, portrait ? 1.3 : 1.12, -0.45);
      const pm = this.pushKey ? this.menu.find((m) => m.item.key === this.pushKey) : null;
      if (pm) { pm.group.getWorldPosition(this.v1); this.camLookT.lerp(this.v1, 0.8); this.camPosT.lerp(this.v1, 0.4); }
      // focus: on the chosen set, otherwise a slow pull between him and the sets
      this.focusNext -= dt;
      if (this.focusNext < 0) { this.focusOnMan = !this.focusOnMan; this.focusNext = 6 + Math.random() * 6; }
      const hm = this.hoverKey ? this.menu.find((m) => m.item.key === this.hoverKey) : null;
      if (pm || hm) this.focusT = this.cam.position.distanceTo((pm || hm)!.group.getWorldPosition(this.v1));
      else if (this.focusOnMan && this.rig) this.focusT = this.cam.position.distanceTo(this.rig.bones.head.getWorldPosition(this.v1));
      else this.focusT = 3.4;
    } else if (this.view === 'gender') {
      this.camPosT.set(0, 1.55, portrait ? 6.0 : 4.9); this.camLookT.set(0, portrait ? 1.0 : 0.95, ROOM.FLOAT_Z - 0.2);
    } else {
      const fk = this.focusKey;
      const cy = sy + 0.95 * H;
      if (fk === 'head' || fk === 'face' || fk === 'eyes' || fk === 'hair') { const hy = sy + 1.66 * H; this.camLookT.set(0, hy, ROOM.FLOAT_Z); this.camPosT.set(0, hy + 0.08, ROOM.FLOAT_Z + (portrait ? 2.1 : 1.45)); }
      else if (fk === 'torso' || fk === 'body' || fk === 'marks') { this.camLookT.set(0, sy + 1.25 * H, ROOM.FLOAT_Z); this.camPosT.set(0, sy + 1.3 * H, ROOM.FLOAT_Z + (portrait ? 3.2 : 2.3)); }
      else if (fk === 'feet' || fk === 'legs') { this.camLookT.set(0, sy + 0.45 * H, ROOM.FLOAT_Z); this.camPosT.set(0, sy + 0.9 * H, ROOM.FLOAT_Z + (portrait ? 3.2 : 2.4)); }
      else { this.camLookT.set(0, cy + 0.12, ROOM.FLOAT_Z); this.camPosT.set(0, cy + 0.3, ROOM.FLOAT_Z + (portrait ? 5.2 : 3.9)); }
      // orbit and zoom round the subject
      this.orbit = damp(this.orbit, this.orbitT, 6, dt);
      const dx = this.camPosT.x - this.camLookT.x, dz = (this.camPosT.z - this.camLookT.z) * this.zoom;
      const c = Math.cos(this.orbit), s = Math.sin(this.orbit);
      this.camPosT.x = this.camLookT.x + dx * c + dz * s;
      this.camPosT.z = this.camLookT.z - dx * s + dz * c;
    }
    if (this.mode !== 'title' && this.rig) this.focusT = this.cam.position.distanceTo(this.rig.bones.chest.getWorldPosition(this.v1));
    this.focus = damp(this.focus, this.focusT, 1.6, dt);
    const k = this.mode === 'title' ? (this.pushKey ? 3 : 1.1) : 3.2;
    this.camPos.set(damp(this.camPos.x, this.camPosT.x, k, dt), damp(this.camPos.y, this.camPosT.y, k, dt), damp(this.camPos.z, this.camPosT.z, k, dt));
    this.camLook.set(damp(this.camLook.x, this.camLookT.x, k, dt), damp(this.camLook.y, this.camLookT.y, k, dt), damp(this.camLook.z, this.camLookT.z, k, dt));
    // handheld drift, parallax, shake
    this.shake = Math.max(0, this.shake - dt * 1.6);
    const sh = this.shake * this.shake * (calm() ? 0.3 : 1);
    const t = this.t;
    this.cam.position.set(
      this.camPos.x + Math.sin(t * 0.31) * 0.03 + (this.mode === 'title' ? this.parX * 0.25 : 0) + (Math.random() - 0.5) * sh * 0.12,
      this.camPos.y + Math.sin(t * 0.43) * 0.02 - (this.mode === 'title' ? this.parY * 0.12 : 0) + (Math.random() - 0.5) * sh * 0.12,
      this.camPos.z,
    );
    this.cam.lookAt(this.camLook);
    this.cam.rotateZ(Math.sin(t * 0.37) * 0.006 + Math.sin(t * 1.13) * 0.002);
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
      r.render(this.post!.scene, this.post!.cam);
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
    try {
      r.setRenderTarget(rt); r.setClearColor(0x000000, 0); r.clear(true, true, true);
      r.render(this.scene, cam);
      r.readRenderTargetPixels(rt, 0, 0, W, H, px);
    } finally { r.setRenderTarget(null); for (const o of hid) o.visible = true; rt.dispose(); }
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
    this.scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.geometry !== this.decalGeo) m.geometry?.dispose(); });
    this.decalGeo.dispose();
    this.pGeo.dispose();
    this.rt?.dispose();
    if (this.renderer) { this.renderer.dispose(); this.renderer.forceContextLoss(); this.renderer = null; }
    this.canvas.remove();
    this.lens.remove();
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
