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
import { COSMETIC } from '../../game/cosmetics';
import { U, worldMaterial } from '../../gfx/materials';
import { blendPose } from './emotes';
import { PART_REGIONS, type PartKey } from './preview3d';
import { gfxSettings } from './common';
import { sfx } from './sfx';
import { calm } from './settings';
import {
  ROOM, NEON, roomGeometry, chairGeometry, armSegment, armBase, clawPalm, clawFinger, toolHead, sawBlade, pressGeometry, shutterGeometry,
  gearGeometry, propGeometry, letterGeometry, paintSign, canvasTex, bloodCanvas,
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
  seg1: THREE.Mesh; seg2: THREE.Mesh; head: THREE.Group; fingers: THREE.Mesh[]; saw: THREE.Mesh | null;
  tip: THREE.Vector3; vel: THREE.Vector3; goal: THREE.Vector3; stow: THREE.Vector3;
  /** what the goal follows */
  follow: { kind: 'stow' } | { kind: 'point'; p: THREE.Vector3 } | { kind: 'bone'; bone: string; off: THREE.Vector3 } | { kind: 'tool' };
  k: number; c: number; grip: number; gripT: number; spin: number;
}

// ------------------------------------------------------------------ menu objects
interface MenuObj {
  item: MenuItem; group: THREE.Group; body: THREE.Object3D; mats: THREE.MeshBasicMaterial[]; anchor: THREE.Vector3; r: number;
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
  private chairStraps: THREE.Mesh; private chairBare: THREE.Mesh;
  // arms
  private arms: Arm[] = [];
  private toolGoal = new THREE.Vector3(); private toolPart = 'idle';
  private maulT = -1; private maulPt = new THREE.Vector3(); private maulN = new THREE.Vector3();
  // press, hatch
  private pressG = new THREE.Group(); private pressY = ROOM.H + 0.05; private pressBloody: THREE.Mesh;
  private shutter: THREE.Mesh; private hatchOpen = 0; private hatchT = 0;
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
    this.chairStraps = new THREE.Mesh(chairGeometry(true), this.mat);
    this.chairBare = new THREE.Mesh(chairGeometry(false), this.mat);
    this.chairBare.visible = false;
    this.scene.add(this.chairStraps, this.chairBare);
    // tube fixtures and the bulb
    for (const [x, z] of [[-1.6, -1.2], [1.6, -1.2], [-1.6, 1.6], [1.6, 1.6]]) {
      const tube = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 1.3), this.tubeMat);
      tube.position.set(x, ROOM.H - 0.05, z);
      this.scene.add(tube);
    }
    const bulbM = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), this.bulbMat);
    bulbM.position.set(0.3, 3.15, -0.55);
    const cord = new THREE.Mesh(new THREE.BoxGeometry(0.01, ROOM.H - 3.2, 0.01), new THREE.MeshBasicMaterial({ color: 0x080808 }));
    cord.position.set(0.3, (ROOM.H + 3.2) / 2, -0.55);
    this.scene.add(bulbM, cord);
    this.bulb.position.set(0.3, 3.05, -0.55);
    const hatchLamp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.06), this.hatchLightMat);
    hatchLamp.position.set(0, ROOM.HATCH_H - 0.1, ROOM.BACK - 2.9);
    this.scene.add(hatchLamp);
    this.shutter = new THREE.Mesh(shutterGeometry(), this.mat);
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
    this.pressG.add(new THREE.Mesh(pressGeometry(), this.mat));
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
    for (let i = 0; i < 2; i++) { const ch = new THREE.Mesh(new THREE.BoxGeometry(0.025, 1, 0.025), chainMat); ch.visible = false; this.chains.push(ch); this.scene.add(ch); }
    // ---- arms: wrists from the back wall, a harness arm and a tool arm from the ceiling
    const mk = (name: string, base: [number, number, number], L1: number, L2: number, pole: [number, number, number], stow: [number, number, number], tool = false) => {
      const b = new THREE.Mesh(armBase(), this.mat);
      b.position.set(...base);
      b.quaternion.setFromUnitVectors(UP, new THREE.Vector3(stow[0] - base[0], stow[1] - base[1], stow[2] - base[2]).normalize().negate());
      const seg1 = new THREE.Mesh(armSegment(L1, 0.15), this.mat), seg2 = new THREE.Mesh(armSegment(L2, 0.12), this.mat);
      const head = new THREE.Group();
      head.add(new THREE.Mesh(tool ? toolHead() : clawPalm(), this.mat));
      const fingers: THREE.Mesh[] = [];
      let saw: THREE.Mesh | null = null;
      if (tool) { saw = new THREE.Mesh(sawBlade(), this.mat); saw.position.set(-0.02, 0.27, 0.02); head.add(saw); }
      else for (const k of [-1, 1]) { const f = new THREE.Mesh(clawFinger(), this.mat); f.position.set(k * 0.06, 0.1, 0); head.add(f); fingers.push(f); }
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
    mk('T', [0, ROOM.H - 0.02, 1.75], 1.75, 1.7, [1, 0.5, 0.2], [0, ROOM.H + 1.4, 1.75], true);
    // ---- particles
    this.pGeo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    this.pGeo.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
    for (let i = 0; i < NP; i++) this.pPos[i * 3 + 1] = -50;
    const pts = new THREE.Points(this.pGeo, new THREE.PointsMaterial({ size: 3, sizeAttenuation: false, vertexColors: true, fog: false }));
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
  private buildTitle() {
    const cell = 0.068;
    'NOCLIP'.split('').forEach((ch, i) => {
      const g = new THREE.Group();
      const m = new THREE.Mesh(letterGeometry(ch, cell, i % 2 ? 0xd8fbff : 0x7ff6ff), this.mat);
      g.add(m);
      g.userData.home = new THREE.Vector3((i - 2.5) * cell * 6.4, 0, 0);
      g.position.copy(g.userData.home);
      this.titleG.add(g);
      this.letters.push(g);
    });
    // the line under the title
    const cv = document.createElement('canvas');
    paintSign(cv, 'REMITTANCE PROGRAMME', 'subject intake · wing b · do not resist', NEON.magenta, 256, 32);
    const sub = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.21), new THREE.MeshBasicMaterial({ map: canvasTex(cv), transparent: true, alphaTest: 0.5, fog: false }));
    sub.position.set(0, -0.42, 0.05);
    this.titleG.add(sub);
    this.titleG.userData.sub = sub;
    // fonts may arrive late: repaint the signs when they do
    document.fonts?.load?.('700 16px Silkscreen').then(() => { paintSign(cv, 'REMITTANCE PROGRAMME', 'subject intake · wing b · do not resist', NEON.magenta, 256, 32); ((sub.material as THREE.MeshBasicMaterial).map as THREE.Texture).needsUpdate = true; this.repaintSigns(); }).catch(() => {});
  }

  /** (re)build the floating menu objects */
  setMenu(items: MenuItem[]) {
    for (const m of this.menu) { this.menuG.remove(m.group); m.group.traverse((o) => { const me = o as THREE.Mesh; if (me.isMesh && me.geometry && !(me.geometry as any).__shared) me.geometry.dispose(); }); }
    this.menu = [];
    const left = items.filter((i) => i.kind === 'sign'), right = items.filter((i) => i.kind !== 'sign');
    left.forEach((it, i) => this.addMenuObj(it, 'L', i, left.length));
    right.forEach((it, i) => this.addMenuObj(it, 'R', i, right.length));
    this.layoutMenu();
  }
  private addMenuObj(item: MenuItem, side: 'L' | 'R', i: number, n: number) {
    const g = new THREE.Group();
    const color = item.color ?? (item.primary ? NEON.magenta : side === 'L' ? NEON.cyan : NEON.amber);
    const mats: THREE.MeshBasicMaterial[] = [];
    let body: THREE.Object3D;
    let r = 0.4;
    const face = (label: string, sub: string, w: number, h: number, pxW: number, pxH: number) => {
      const cv = document.createElement('canvas');
      paintSign(cv, label, sub, color, pxW, pxH);
      const mat = new THREE.MeshBasicMaterial({ map: canvasTex(cv), transparent: true, alphaTest: 0.5, fog: false });
      (mat as any).__cv = cv; (mat as any).__paint = () => paintSign(cv, label, sub, color, pxW, pxH);
      mats.push(mat);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      return m;
    };
    if (item.kind === 'sign') {
      const w = item.primary ? 1.5 : 1.22, h = item.primary ? 0.36 : 0.27;
      const slab = new THREE.Mesh(new THREE.BoxGeometry(w * 0.98, h * 0.94, 0.05), new THREE.MeshLambertMaterial({ color: 0x1a1c20 }));
      slab.position.z = -0.03;
      const f = face(item.label, '', w, h, item.primary ? 200 : 168, item.primary ? 40 : 32);
      body = new THREE.Group(); body.add(slab, f);
      // two hanging wires up into the dark, like the sign was lowered on cables
      for (const k of [-1, 1]) { const wire = new THREE.Mesh(new THREE.BoxGeometry(0.006, 3, 0.006), new THREE.MeshBasicMaterial({ color: 0x15171a })); wire.position.set(k * w * 0.42, 1.5 + h / 2, -0.03); body.add(wire); }
      r = w * 0.5;
    } else {
      body = new THREE.Group();
      let m: THREE.Mesh;
      if (item.kind === 'gear') {
        m = new THREE.Mesh(gearGeometry(0.2, 12, 0.07), new THREE.MeshLambertMaterial({ color: 0x9aa4ac, emissive: 0x24343c }));
        const hub = new THREE.Mesh(gearGeometry(0.09, 8, 0.1), new THREE.MeshLambertMaterial({ color: 0xc89a40, emissive: 0x3a2400 }));
        hub.position.set(0.21, 0.13, 0.03);
        body.add(hub);
        body.userData.hub = hub;
      } else m = new THREE.Mesh(propGeometry(item.kind), this.mat);
      body.add(m);
      body.userData.spin = m;
      const lab = face(item.label, '', 0.78, 0.17, 112, 24);
      lab.position.set(0, item.kind === 'gear' ? -0.33 : -0.36, 0.02);
      g.add(lab);
      r = 0.32;
    }
    g.add(body);
    const o: MenuObj = { item, group: g, body, mats, anchor: new THREE.Vector3(), r, phase: Math.random() * 10, hover: 0, hoverT: 0, press: 0, glitch: 0, nextGlitch: 2 + Math.random() * 6, out: 0, color };
    g.userData.side = side; g.userData.i = i; g.userData.n = n;
    this.menuG.add(g);
    this.menu.push(o);
  }
  private repaintSigns() { for (const m of this.menu) for (const mat of m.mats) { (mat as any).__paint?.(); if (mat.map) mat.map.needsUpdate = true; } }
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
    at(0, portrait ? 0.74 : 0.7, 4.0, this.titleG.position);
    this.titleG.scale.setScalar(Math.max(0.5, Math.min(1, widthAt(4.0) / (portrait ? 2.6 : 4.6))));
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

  // ================================================================== sequences
  /** the breaker: lights on, signs away, arms out, the subject lifted out of the chair and strapped in mid-air */
  async lightsOn() {
    if (this.mode === 'lit') return;
    this.busy = true;
    this.mode = 'lit'; this.view = 'creator';
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
    this.flash = calm() ? 0.15 : 0.5; this.redFlash = calm() ? 0.3 : 1;
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
    const target = Math.min(gfxSettings().pixelHeight || 360, this.quality === 'low' ? 250 : 330);
    const px = Math.max(1, h / target);
    const lw = Math.max(64, Math.round(w / px)), lh = Math.max(64, Math.round(h / px));
    if (lw === this.lowW && lh === this.lowH) return;
    this.lowW = lw; this.lowH = lh;
    this.renderer.setSize(lw, lh, false);
    this.cam.aspect = lw / lh;
    this.cam.fov = lw / lh < 1 ? 62 : 42;
    this.cam.updateProjectionMatrix();
    this.rt?.dispose();
    this.rt = new THREE.WebGLRenderTarget(lw, lh, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
    if (!this.post) {
      const mat = new THREE.ShaderMaterial({
        uniforms: { tex: { value: null }, uTime: { value: 0 }, uFlash: { value: 0 }, uRed: { value: 0 }, uVig: { value: 1.2 }, uRes: { value: new THREE.Vector2() } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
        fragmentShader: `
          uniform sampler2D tex; uniform float uTime; uniform float uFlash; uniform float uRed; uniform float uVig; uniform vec2 uRes;
          varying vec2 vUv;
          float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
          void main(){
            vec3 c = texture2D(tex, vUv).rgb;
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
    const dt = Math.min(0.05, (now - this.last) / 1000);
    if (dt < 1 / 62) return;
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
    this.render();
  };

  private zap() {
    this.spark.intensity = 6 + Math.random() * 6;
    this.twitch = 1;
    this.sparkBurst(this.spark.position, 14);
    if (Math.random() < 0.7) { sfx('buzz', 0.5); sfx('spark', 0.6); }
  }

  private updateMenu(dt: number) {
    const t = this.t;
    const out = this.menuOut;
    this.menuG.visible = this.titleG.visible = out < 0.98;
    if (!this.menuG.visible) return;
    // parallax with the pointer
    this.parX = damp(this.parX, this.parTX, 3, dt); this.parY = damp(this.parY, this.parTY, 3, dt);
    this.letters.forEach((g, i) => {
      const h = g.userData.home as THREE.Vector3;
      const gl = Math.random() < dt * 0.15 ? (Math.random() - 0.5) * 0.08 : 0;
      g.position.set(h.x + gl + Math.sin(t * 0.9 + i) * 0.015, h.y + Math.sin(t * 1.3 + i * 0.8) * 0.04 + out * (1.5 + i * 0.2), h.z + Math.sin(t * 0.7 + i * 1.7) * 0.05);
      g.rotation.set(Math.sin(t * 0.8 + i) * 0.12, Math.sin(t * 0.6 + i * 2.1) * 0.25 + out * 3, Math.sin(t * 0.5 + i) * 0.05);
    });
    const sub = this.titleG.userData.sub as THREE.Mesh;
    sub.position.y = -0.42 + Math.sin(t * 1.1) * 0.02 - out;
    for (const m of this.menu) {
      const hov = m.item.key === this.hoverKey ? 1 : 0;
      m.hover = damp(m.hover, hov, 10, dt);
      m.press = Math.max(0, m.press - dt * 3.5);
      // glitches: a short horizontal tear and a colour slip
      m.nextGlitch -= dt;
      if (m.nextGlitch < 0) { m.glitch = 0.12 + Math.random() * 0.18; m.nextGlitch = 2.5 + Math.random() * 7; }
      m.glitch = Math.max(0, m.glitch - dt);
      const g = m.group;
      const ph = m.phase;
      const pressK = Math.sin(Math.min(1, 1 - m.press) * Math.PI) * m.press;
      const dir = (g.userData.side === 'L' ? -1 : 1);
      g.position.set(
        m.anchor.x + Math.sin(t * 0.37 + ph) * 0.05 + (m.glitch > 0 && !calm() ? (Math.random() - 0.5) * 0.06 : 0) + dir * out * 3 - this.parX * 0.08,
        m.anchor.y + Math.sin(t * 0.9 + ph) * 0.05 + m.hover * 0.03 + this.parY * 0.05,
        m.anchor.z + Math.sin(t * 0.53 + ph * 1.3) * 0.08 + m.hover * 0.18 - m.press * 0.22,
      );
      const base = m.group.userData.side === 'L' ? 0.22 : -0.28;
      g.rotation.set(Math.sin(t * 0.7 + ph) * 0.06 - m.hover * 0.05 + pressK * 0.2, base * (1 - m.hover * 0.7) + Math.sin(t * 0.45 + ph) * 0.14, Math.sin(t * 0.6 + ph * 0.7) * 0.04 + out * dir);
      const sc0 = g.userData.sc0 ?? 1;
      g.scale.setScalar(sc0 * (1 + m.hover * 0.08 - m.press * 0.1) * (1 - out * 0.6));
      // the face: brighter when hovered, a colour slip in a glitch, a flare when pressed
      const k = 0.62 + m.hover * 0.55 + m.press * 0.8 + (Math.sin(t * 3 + ph) * 0.04);
      for (const mat of m.mats) {
        if (m.glitch > 0 && !calm()) mat.color.setRGB(k * (Math.random() < 0.5 ? 1.4 : 0.5), k * 0.4, k * 1.3);
        else mat.color.setRGB(k, k, k);
        if (mat.map) mat.map.offset.x = m.glitch > 0 && !calm() ? (Math.random() - 0.5) * 0.03 : 0;
      }
      // the props turn; the gear grinds round (faster when hovered, a kick when pressed)
      const spin = m.body.userData.spin as THREE.Object3D | undefined;
      if (m.item.kind === 'gear') {
        const ud = m.body.userData as any;
        ud.kick = Math.max(0, (ud.kick || 0) - dt * 10);
        ud.ang = (ud.ang || 0) + dt * (0.35 + m.hover * 1.6 + ud.kick);
        spin!.rotation.z = -ud.ang;
        (ud.hub as THREE.Object3D).rotation.z = ud.ang * 12 / 8 + 0.2;
        m.body.rotation.y = 0.35 + Math.sin(t * 0.4) * 0.2;
      } else if (spin) {
        m.body.rotation.y = Math.sin(t * 0.5 + ph) * 0.5 + m.hover * Math.sin(t * 6) * 0.15;
        m.body.rotation.x = 0.3 + Math.sin(t * 0.4 + ph) * 0.12;
      }
    }
    // the hovered object lights the dark (and him, a little)
    const hm = this.menu.find((m) => m.item.key === this.hoverKey);
    if (hm && out < 0.5) {
      hm.group.getWorldPosition(this.v1);
      this.glow.position.lerp(this.v1.add(this.v2.set(0, 0, 0.35)), Math.min(1, dt * 10));
      this.glow.color.setHex(hm.color);
      this.glow.intensity = damp(this.glow.intensity, 1.1, 6, dt);
    } else this.glow.intensity = damp(this.glow.intensity, out > 0.5 ? 0 : 0.3, 4, dt);
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
        if (Math.random() < 0.6) this.bloodBurst(fp, this.maulN, 3, 1.4, 2.2);
        if (Math.random() < 0.35) this.sparkBurst(fp, 3);
        if (Math.random() < 0.02) this.decal((Math.random() - 0.5) * 1.6, 0.006, ROOM.FLOAT_Z + 0.5 + Math.random(), 'y', 0.25 + Math.random() * 0.3);
      }
    }
  }
  private seatPose(t: number): Pose {
    const br = Math.sin(t * 1.4) * 0.02;
    return {
      spine: [0.08 + br, 0, 0], chest: [0.06, 0, 0.02], neck: [0.12, 0, 0], head: [0.34 + Math.sin(t * 0.3) * 0.04, 0.12, 0.08],
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
    // ---- spring
    const k = a.k, c = a.c;
    a.vel.x += ((a.goal.x - a.tip.x) * k - a.vel.x * c) * dt;
    a.vel.y += ((a.goal.y - a.tip.y) * k - a.vel.y * c) * dt;
    a.vel.z += ((a.goal.z - a.tip.z) * k - a.vel.z * c) * dt;
    a.tip.addScaledVector(a.vel, dt);
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
      this.camPosT.set(0, 1.5, portrait ? 5.2 : 4.4); this.camLookT.set(0, portrait ? 1.35 : 1.15, -0.4);
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
    const k = this.mode === 'title' ? 2 : 3.2;
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
