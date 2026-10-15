// INTAKE PROCESSING: the prisoner stands in a tiled intake room under harsh
// mugshot lights, in front of a height chart, rendered by the exact in-game
// HumanRig at low resolution through its own WebGL context. Click or tap the
// body itself to examine a part: hovering lights that part up on the model
// (a mask pass reads the body's texture-page regions), the camera eases in,
// the subject presents it (arm out, hands up, head down...). Room props are
// clickable too: the height chart, the booking board, the folded uniform.
import * as THREE from 'three';
import { HumanRig, Appearance, Outfit, Pose, createPreviewRig } from '../../entities/humanRig';
import { REG, RegKey, PAGE, PAD } from '../../entities/humanModel';
import { U, worldMaterial } from '../../gfx/materials';
import { ModelBuilder } from '../../gfx/modelBuilder';
import { EMOTES, HOLD_POSES, INTAKE_IDLES, blendPose } from './emotes';
import { heightChart, bookingBoard } from './art';
import { gfxSettings } from './common';

export type PartKey = 'head' | 'hair' | 'torso' | 'armL' | 'armR' | 'handL' | 'handR' | 'legL' | 'legR' | 'feet';
export type PropKey = 'chart' | 'board' | 'uniform';
export type Pickable = PartKey | PropKey;

export const PART_REGIONS: Record<PartKey, RegKey[]> = {
  head: ['HEAD', 'LIDS', 'MASK'], hair: ['HAIR', 'HAT'], torso: ['TORSO', 'NECK', 'COLLAR', 'SKIRT', 'PACK'],
  armL: ['ARM_L', 'WATCH'], armR: ['ARM_R'], handL: ['HAND_L'], handR: ['HAND_R'], legL: ['LEG_L'], legR: ['LEG_R'], feet: ['FOOT_L', 'FOOT_R'],
};
const REGION_PART: [RegKey, PartKey][] = (Object.entries(PART_REGIONS) as [PartKey, RegKey[]][]).flatMap(([p, rs]) => rs.map((r) => [r, p] as [RegKey, PartKey]));

/** camera framing per focus: look-at (rig-local, metres at height 1), distance, subject yaw, pitch */
interface Frame { at: [number, number, number]; dist: number; yaw: number; pitch: number }
const FRAMES: Record<string, Frame> = {
  full: { at: [0, 0.98, 0], dist: 4.3, yaw: 0, pitch: 0.06 },
  head: { at: [0, 1.62, 0.02], dist: 1.05, yaw: 0, pitch: 0.02 },
  hair: { at: [0, 1.66, 0], dist: 1.25, yaw: 0.45, pitch: 0.2 },
  torso: { at: [0, 1.22, 0], dist: 2.0, yaw: 0, pitch: 0.04 },
  armL: { at: [0.12, 1.18, 0.05], dist: 1.55, yaw: -1.05, pitch: 0.04 },
  armR: { at: [-0.12, 1.18, 0.05], dist: 1.55, yaw: 1.05, pitch: 0.04 },
  hands: { at: [0, 1.12, 0.28], dist: 1.1, yaw: 0, pitch: 0.38 },
  legs: { at: [0, 0.55, 0], dist: 2.4, yaw: 0.25, pitch: 0.05 },
  feet: { at: [0, 0.1, 0.12], dist: 1.35, yaw: 0.3, pitch: 0.42 },
  chart: { at: [0, 1.05, -0.45], dist: 3.7, yaw: 0, pitch: 0.02 },
  board: { at: [1.35, 1.35, -0.58], dist: 1.5, yaw: 0, pitch: 0.02 },
  uniform: { at: [-1.55, 0.55, -0.15], dist: 1.9, yaw: 0, pitch: 0.4 },
  mugshot: { at: [0, 1.48, 0], dist: 1.9, yaw: 0, pitch: 0.0 },
};
export const focusFrameOf = (k: string) => (k === 'handL' || k === 'handR' ? 'hands' : k === 'legL' || k === 'legR' ? 'legs' : k);

const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt));

export class IntakeStage {
  canvas = document.createElement('canvas');
  renderer: THREE.WebGLRenderer | null = null;
  /** pointer over a part (null when off the subject); x, y are client coordinates */
  onHover?: (p: Pickable | null, x: number, y: number) => void;
  onPick?: (p: Pickable | null) => void;
  onEmote?: (label: string) => void;
  rig: HumanRig | null = null;
  visible = true;
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(30, 1, 0.1, 40);
  private rtColor: THREE.WebGLRenderTarget | null = null;
  private rtMask: THREE.WebGLRenderTarget | null = null;
  private post: { scene: THREE.Scene; cam: THREE.OrthographicCamera; mat: THREE.ShaderMaterial } | null = null;
  private maskMat: THREE.ShaderMaterial;
  private turn = new THREE.Group();
  private app: Appearance | null = null;
  private outfit: Outfit = {};
  private keyLight = new THREE.DirectionalLight(0xfff4e0, 2.3);
  private flashLight = new THREE.PointLight(0xffffff, 0, 9, 1.4);
  private room = new THREE.Group();
  private pickables: THREE.Object3D[] = [];
  private boardTex: THREE.CanvasTexture | null = null;
  private heldBoard: THREE.Mesh | null = null;
  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private t = 0; private last = 0; private raf = 0;
  private lowW = 0; private lowH = 0;
  // camera state
  private focusKey = 'full';
  private camAt = new THREE.Vector3(0, 0.98, 0);
  private camDist = 4.3; private camPitch = 0.06; private yaw = 0; private yawUser = 0; private yawVel = 0;
  private zoomMul = 1;
  private shiftX = 0; private shiftY = 0; private shiftTX = 0; private shiftTY = 0;
  // poses
  private holdKey = ''; private holdW = 0;
  private emoteName = ''; private emoteT = 0; private emoteDur = 0;
  private idleT = 4; private idleIdx = Math.floor(Math.random() * INTAKE_IDLES.length);
  private idleOn = true;
  // highlight
  private hover: Pickable | null = null;
  private selected: Pickable | null = null;
  private flash = 0;
  private pointers = new Map<number, { x: number; y: number; x0: number; y0: number; t0: number }>();
  private pinch0 = 0; private zoom0 = 1;
  private ro: ResizeObserver;
  private host: HTMLElement;
  private quality = 'high';

  constructor(host: HTMLElement) {
    this.host = host;
    this.canvas.className = 'ik-cv';
    this.canvas.setAttribute('aria-label', 'Intake room. Click or tap a part of the prisoner to examine it; drag to turn them, scroll or pinch to zoom.');
    host.append(this.canvas);
    const gs = gfxSettings();
    const coarse = matchMedia('(pointer: coarse)').matches;
    this.quality = gs.quality === 'auto' ? (coarse ? 'low' : 'high') : gs.quality;
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, alpha: false, powerPreference: coarse ? 'low-power' : 'default', preserveDrawingBuffer: false });
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.setPixelRatio(1);
      this.renderer.setClearColor(0x0a0b0a, 1);
      if (this.quality !== 'low') { this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFShadowMap; this.renderer.shadowMap.autoUpdate = false; }
    } catch (e) {
      console.warn('intake renderer unavailable', e);
      this.renderer = null;
    }
    this.maskMat = new THREE.ShaderMaterial({
      uniforms: { uHover: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] }, uHoverN: { value: 0 },
        uSel: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] }, uSelN: { value: 0 } },
      vertexShader: `
        #include <common>
        #include <skinning_pars_vertex>
        varying vec2 vUv;
        void main() {
          vUv = uv;
          #include <skinbase_vertex>
          #include <begin_vertex>
          #include <skinning_vertex>
          #include <project_vertex>
        }`,
      fragmentShader: `
        uniform vec4 uHover[5]; uniform float uHoverN; uniform vec4 uSel[5]; uniform float uSelN;
        varying vec2 vUv;
        float inR(vec4 r, vec2 p) { return step(r.x, p.x) * step(p.x, r.z) * step(r.y, p.y) * step(p.y, r.w); }
        void main() {
          vec2 p = vec2(vUv.x * ${PAGE.toFixed(1)}, (1.0 - vUv.y) * ${PAGE.toFixed(1)});
          float h = 0.0, s = 0.0;
          for (int i = 0; i < 5; i++) {
            if (float(i) < uHoverN) h = max(h, inR(uHover[i], p));
            if (float(i) < uSelN) s = max(s, inR(uSel[i], p));
          }
          gl_FragColor = vec4(1.0, h, s, 1.0);
        }`,
    });
    this.buildRoom();
    this.scene.add(this.room, this.turn);
    this.bindInput();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  // ---------------------------------------------------------------- room
  private buildRoom() {
    const mat = worldMaterial({ noVis: true, noFog: true, noGrid: true });
    const mb = new ModelBuilder();
    const W = 3.2, D0 = -0.72, H = 2.75, Z1 = 5.5;
    // floor: worn lab tiles with a drain and painted feet
    mb.box(0, -0.05, (D0 + Z1) / 2, W * 2, 0.05, Z1 - D0, { top: 'lab_floor', sides: 'concrete' }, {});
    // back wall: clinical tiles to shoulder height, scuffed paint above
    mb.box(0, 0, D0 - 0.05, W * 2, 1.25, 0.1, { south: 'p_tile_wall', all: 'concrete' }, { color: 0xc8ccc4 });
    mb.box(0, 1.25, D0 - 0.05, W * 2, H - 1.25, 0.1, { south: 'concrete_b', all: 'concrete' }, { color: 0x9a9e90 });
    // hazard skirting
    mb.box(0, 0, D0 + 0.005, W * 2, 0.12, 0.02, 'metal_painted_green', { color: 0x3a3c30 });
    // side walls
    for (const k of [-1, 1]) {
      mb.box(k * W, 0, (D0 + Z1) / 2, 0.1, H, Z1 - D0, { east: 'p_tile_wall', west: 'p_tile_wall', all: 'concrete' }, { color: 0xa8aca0 });
    }
    // ceiling with two harsh fixtures
    mb.box(0, H, (D0 + Z1) / 2, W * 2, 0.06, Z1 - D0, 'concrete', { color: 0x5a5c56 });
    for (const x of [-0.55, 0.55]) {
      mb.box(x, H - 0.1, 0.9, 0.5, 0.1, 0.3, 'metal_grey', {});
      mb.box(x, H - 0.11, 0.9, 0.44, 0.02, 0.24, 'plastic_white', { emissive: 1.6, color: 0xfff6e0 });
    }
    // bench along the left wall with the folded uniform on it
    mb.box(-1.75, 0.42, -0.2, 1.1, 0.06, 0.42, 'metal_brushed', {});
    for (const x of [-2.2, -1.3]) mb.box(x, 0, -0.2, 0.06, 0.42, 0.36, 'metal_dark', {});
    // drain grate + a stain under the subject
    mb.box(0.55, 0.002, 0.55, 0.28, 0.006, 0.28, 'q_floor_grate', { fit: true });
    // door frame on the right wall and the Seam: a too-tall rectangle of nothing
    mb.box(2.35, 0, D0 - 0.0, 0.7, 2.45, 0.04, 'metal_grey', { color: 0x4a4c48 });
    // camera tripod + flash umbrella at the edge of the frame (front-left)
    mb.box(-1.25, 0, 2.6, 0.04, 1.55, 0.04, 'metal_dark', {});
    mb.box(-1.25, 1.55, 2.6, 0.28, 0.2, 0.2, 'metal_dark', {});
    const roomGeo = mb.build();
    const roomMesh = new THREE.Mesh(roomGeo, mat);
    roomMesh.receiveShadow = true;
    this.room.add(roomMesh);
    // the Seam (pure black, unlit, faintly wrong)
    const seam = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 2.6), new THREE.MeshBasicMaterial({ color: 0x000000, fog: false }));
    seam.position.set(2.35, 1.3, D0 + 0.03);
    this.room.add(seam);
    // painted footprints
    const fp = new THREE.MeshBasicMaterial({ color: 0xc8a020, transparent: true, opacity: 0.55, depthWrite: false });
    for (const x of [-0.11, 0.11]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.27), fp);
      m.rotation.x = -Math.PI / 2; m.position.set(x, 0.004, 0.02);
      this.room.add(m);
    }
    // height chart (clickable)
    const chartPc = heightChart();
    const chartTex = this.texOf(chartPc);
    const chart = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.2), new THREE.MeshLambertMaterial({ map: chartTex }));
    chart.position.set(0, 1.1, D0 + 0.012);
    chart.receiveShadow = true;
    chart.userData.pick = 'chart';
    this.room.add(chart);
    this.pickables.push(chart);
    // booking board on a wall hook (clickable)
    this.boardTex = this.texOf(bookingBoard('', '', ''));
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.38, 0.03), [
      new THREE.MeshLambertMaterial({ color: 0x3a2e1e }), new THREE.MeshLambertMaterial({ color: 0x3a2e1e }), new THREE.MeshLambertMaterial({ color: 0x3a2e1e }),
      new THREE.MeshLambertMaterial({ color: 0x3a2e1e }), new THREE.MeshLambertMaterial({ map: this.boardTex }), new THREE.MeshLambertMaterial({ color: 0x2a2018 }),
    ]);
    board.position.set(1.35, 1.36, D0 + 0.03);
    board.rotation.z = 0.03;
    board.userData.pick = 'board';
    this.room.add(board);
    this.pickables.push(board);
    // the held copy for the mugshot
    const held = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.26, 0.02), new THREE.MeshLambertMaterial({ map: this.boardTex }));
    held.visible = false;
    this.heldBoard = held;
    this.turn.add(held);
    // folded uniform on the bench (clickable)
    const fold = new ModelBuilder();
    // a stack of folded jumpsuits, the top one with its number tape, and canvas slip-ons beside it
    for (let i = 0; i < 3; i++) fold.box(0.004 * (i % 2 ? 1 : -1), i * 0.055, 0, 0.34, 0.055, 0.28, { top: 'i_fold_jumpsuit', all: 'plastic_white' }, { color: i === 2 ? 0xffffff : 0xe8b028, fit: { top: true } });
    fold.box(0.0, 0.0, 0.2, 0.3, 0.012, 0.14, 'metal_grey', { color: 0x8a8c88 });
    for (const x of [-0.07, 0.07]) {
      fold.box(x, 0.012, 0.2, 0.1, 0.035, 0.24, 'plastic_white', { color: 0xe8e4d8 });
      fold.box(x, 0.047, 0.17, 0.09, 0.012, 0.14, 'plastic_white', { color: 0xd8d4c4 });
    }
    const foldMesh = new THREE.Mesh(fold.build(), mat);
    foldMesh.position.set(-1.6, 0.48, -0.25);
    foldMesh.rotation.y = 0.15;
    foldMesh.castShadow = true;
    foldMesh.userData.pick = 'uniform';
    this.room.add(foldMesh);
    this.pickables.push(foldMesh);
    // lights: harsh key from above the camera, a cold fill, a dirty bounce, the flash
    this.scene.add(new THREE.HemisphereLight(0xc8d0d8, 0x2a2618, 0.55));
    this.keyLight.position.set(-0.6, 3.4, 2.6);
    this.keyLight.target.position.set(0, 1.0, -0.6);
    this.scene.add(this.keyLight, this.keyLight.target);
    if (this.renderer?.shadowMap.enabled) {
      this.keyLight.castShadow = true;
      this.keyLight.shadow.mapSize.set(512, 512);
      const c = this.keyLight.shadow.camera as THREE.OrthographicCamera;
      c.left = -1.6; c.right = 1.6; c.top = 2.4; c.bottom = -0.4; c.near = 0.5; c.far = 8;
      this.keyLight.shadow.bias = -0.002;
    }
    const fill = new THREE.DirectionalLight(0x9ab8d8, 0.45); fill.position.set(3, 1.6, 2); this.scene.add(fill);
    // the camera-side fill: faces under the mugshot lights never go muddy
    const front = new THREE.DirectionalLight(0xfff0e0, 0.75); front.position.set(0.3, 1.5, 4); this.scene.add(front);
    const rim = new THREE.DirectionalLight(0xffe0a0, 0.7); rim.position.set(1.2, 2.4, -2.5); this.scene.add(rim);
    this.flashLight.position.set(-1.25, 1.7, 2.5);
    this.scene.add(this.flashLight);
  }
  private texOf(pc: { w: number; h: number; toImageData: () => ImageData }) {
    const c = document.createElement('canvas'); c.width = pc.w; c.height = pc.h;
    c.getContext('2d')!.putImageData(pc.toImageData(), 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  /** repaint the booking board (name, number, date) */
  setBoard(name: string, num: string, date: string) {
    if (!this.boardTex) return;
    const pc = bookingBoard(name, num, date);
    const c = this.boardTex.image as HTMLCanvasElement;
    c.getContext('2d')!.putImageData(pc.toImageData(), 0, 0);
    this.boardTex.needsUpdate = true;
  }

  // ---------------------------------------------------------------- character
  setAppearance(app: Appearance) {
    this.app = { ...app };
    if (this.rig) {
      try { this.rig.setAppearance(this.app); } catch (e) { console.warn('rig.setAppearance', e); }
    } else {
      this.rig = createPreviewRig(this.app, this.outfit);
      this.rig.skin.layers.enable(1);
      this.rig.skin.castShadow = true;
      this.turn.add(this.rig.root);
    }
    // older rigs dropped fields they did not know; keep the intake extras on the rig
    const r = this.rig as any;
    if (r.app && Object.keys(this.app).some((k) => !(k in r.app))) { r.app = { ...r.app, ...this.app }; this.rig.setOutfit(this.outfit); }
    this.placeHeldBoard();
  }
  setOutfit(o: Outfit) {
    this.outfit = o;
    this.rig?.setOutfit(o);
  }
  /** the number the uniform will carry (prisonerNumber of the rig seed, as the intro's monitors show it) */
  get rigSeed(): number { return (this.rig as any)?.seed ?? 0; }

  // ---------------------------------------------------------------- focus, poses, effects
  focus(key: string | null, panelSide: 'right' | 'bottom' | 'none' = 'right') {
    const k = key ? focusFrameOf(key) : 'full';
    this.focusKey = FRAMES[k] ? k : 'full';
    this.yawUser = 0;
    this.zoomMul = 1;
    const hk = key === 'handL' || key === 'handR' ? 'hands' : key === 'legL' || key === 'legR' ? 'legs' : key || '';
    this.holdKey = HOLD_POSES[hk] ? hk : '';
    // the subject slides aside to make room for the examination props
    const off = key ? 1 : 0;
    this.shiftTX = panelSide === 'right' ? 0.42 * off : 0;
    this.shiftTY = panelSide === 'bottom' ? -0.46 * off : 0;
    this.selected = (key as Pickable) || null;
    this.idleT = 5;
    // whatever they were doing, they stop and present the part
    if (this.emoteName) { this.emoteName = ''; this.onEmote?.(''); }
  }
  /** the frame the camera eases to while nothing is selected (e.g. mugshot) */
  frameKey(k: string) { if (FRAMES[k]) this.focusKey = k; }
  setHold(k: string) { this.holdKey = HOLD_POSES[k] ? k : ''; }
  holdBoard(on: boolean) { if (this.heldBoard) this.heldBoard.visible = on; this.setHold(on ? 'board' : ''); }
  private placeHeldBoard() {
    if (!this.heldBoard || !this.rig) return;
    const h = this.app?.height ?? 1;
    this.heldBoard.position.set(0, 1.12 * h, 0.27);
    this.heldBoard.rotation.set(-0.12, 0, 0);
  }
  /** turn the subject (radians, eased) */
  setYaw(y: number) { this.yaw = y; this.yawUser = 0; }
  emote(name: string) {
    const e = EMOTES[name];
    if (!e) return false;
    this.emoteName = name; this.emoteT = 0; this.emoteDur = e.dur;
    this.idleT = e.dur + 5 + Math.random() * 4;
    this.onEmote?.(e.label);
    return true;
  }
  react(name: string) { if (this.emoteName === name && this.emoteT < 0.5) return; this.emote(name); }
  set idle(on: boolean) { this.idleOn = on; }
  /** jump the eased camera and turn to their targets (screenshots, reduced motion) */
  settle() {
    const f = FRAMES[this.focusKey] || FRAMES.full;
    const H = this.app?.height ?? 1;
    this.camAt.set(f.at[0], f.at[1] * (f.at[1] > 0.4 ? H : 1), f.at[2]);
    this.camDist = f.dist * this.zoomMul; this.camPitch = f.pitch;
    this.shiftX = this.shiftTX; this.shiftY = this.shiftTY;
    this.turn.rotation.y = f.yaw + this.yawUser + this.yaw;
    this.holdW = this.holdKey ? 1 : 0;
  }
  /** camera flash: white-out, a real light burst, the subject flinches */
  doFlash(flinch = true) {
    this.flash = 1;
    if (flinch) this.emote('flinch');
  }

  // ---------------------------------------------------------------- input
  private bindInput() {
    const cv = this.canvas;
    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now() });
      if (this.pointers.size === 2) { const [a, b] = [...this.pointers.values()]; this.pinch0 = Math.hypot(a.x - b.x, a.y - b.y); this.zoom0 = this.zoomMul; }
    });
    cv.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) {
        if (e.pointerType === 'mouse') this.hoverAt(e.clientX, e.clientY);
        return;
      }
      const dx = e.clientX - p.x;
      p.x = e.clientX; p.y = e.clientY;
      if (this.pointers.size === 1) {
        if (Math.hypot(p.x - p.x0, p.y - p.y0) > 6) { this.yawUser += dx * 0.012; this.yawVel = dx * 0.4; cv.classList.add('drag'); this.setHover(null, 0, 0); }
      } else if (this.pointers.size === 2 && this.pinch0 > 0) {
        const [a, b] = [...this.pointers.values()];
        this.zoomMul = Math.max(0.45, Math.min(1.6, this.zoom0 * this.pinch0 / Math.max(10, Math.hypot(a.x - b.x, a.y - b.y))));
      }
    });
    const up = (e: PointerEvent) => {
      const p = this.pointers.get(e.pointerId);
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinch0 = 0;
      if (!this.pointers.size) cv.classList.remove('drag');
      if (p && e.type === 'pointerup' && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) < 8 && performance.now() - p.t0 < 600) {
        const hit = this.pickAt(e.clientX, e.clientY);
        this.onPick?.(hit);
      }
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') this.setHover(null, 0, 0); });
    cv.addEventListener('wheel', (e) => { e.preventDefault(); this.zoomMul = Math.max(0.45, Math.min(1.6, this.zoomMul * (e.deltaY > 0 ? 1.1 : 1 / 1.1))); }, { passive: false });
  }
  private hoverAt(x: number, y: number) { this.setHover(this.pickAt(x, y), x, y); }
  private setHover(p: Pickable | null, x: number, y: number) {
    if (p !== this.hover) this.canvas.classList.toggle('over', !!p);
    this.hover = p;
    this.onHover?.(p, x, y);
  }
  /** what is under a client point: a body part (by the texture-page region of the hit), a prop, or nothing */
  pickAt(x: number, y: number): Pickable | null {
    if (!this.rig || !this.lowW) return null;
    const r = this.canvas.getBoundingClientRect();
    this.ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.cam);
    const hits = this.raycaster.intersectObjects([this.rig.skin, ...this.pickables], false);
    for (const h of hits) {
      if (h.object === this.rig.skin) {
        if (!h.uv) continue;
        const px = h.uv.x * PAGE, py = (1 - h.uv.y) * PAGE;
        for (const [rk, part] of REGION_PART) {
          const g = REG[rk];
          if (px >= g.x - PAD && px <= g.x + g.w + PAD && py >= g.y - PAD && py <= g.y + g.h + PAD) return part;
        }
        continue;
      }
      const pk = h.object.userData.pick as PropKey | undefined;
      if (pk) return pk;
    }
    return null;
  }

  // ---------------------------------------------------------------- render
  private resize() {
    if (!this.renderer) return;
    const w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight);
    const target = Math.min(gfxSettings().pixelHeight || 360, this.quality === 'low' ? 300 : 400);
    const px = Math.max(1, h / target);
    const lw = Math.max(64, Math.round(w / px)), lh = Math.max(64, Math.round(h / px));
    if (lw === this.lowW && lh === this.lowH) return;
    this.lowW = lw; this.lowH = lh;
    this.renderer.setSize(lw, lh, false);
    this.cam.aspect = lw / lh;
    this.cam.fov = lw / lh < 0.8 ? 42 : 30;
    this.cam.updateProjectionMatrix();
    this.rtColor?.dispose(); this.rtMask?.dispose();
    const opt = { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true };
    this.rtColor = new THREE.WebGLRenderTarget(lw, lh, opt);
    this.rtMask = new THREE.WebGLRenderTarget(lw, lh, opt);
    if (!this.post) {
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          tex: { value: null }, mask: { value: null }, texel: { value: new THREE.Vector2() },
          uHov: { value: new THREE.Color(0xffd04a) }, uSelC: { value: new THREE.Color(0x6dffe0) }, uTime: { value: 0 }, uFlash: { value: 0 },
        },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
        fragmentShader: `
          uniform sampler2D tex; uniform sampler2D mask; uniform vec2 texel; uniform vec3 uHov; uniform vec3 uSelC; uniform float uTime; uniform float uFlash;
          varying vec2 vUv;
          void main(){
            vec3 c = texture2D(tex, vUv).rgb;
            vec4 m = texture2D(mask, vUv);
            vec4 a = texture2D(mask, vUv + vec2(texel.x, 0.0)), b = texture2D(mask, vUv - vec2(texel.x, 0.0));
            vec4 d = texture2D(mask, vUv + vec2(0.0, texel.y)), e = texture2D(mask, vUv - vec2(0.0, texel.y));
            vec4 mx = max(max(a, b), max(d, e)), mn = min(min(a, b), min(d, e));
            // the subject's dark pixel outline
            if (m.r < 0.5 && mx.r > 0.5) c = vec3(0.02, 0.022, 0.02);
            // selected part: a steady glow
            float pulse = 0.5 + 0.5 * sin(uTime * 4.0);
            if (m.b > 0.5) { if (mn.b < 0.5) c = mix(c, uSelC, 0.3); }
            else if (mx.b > 0.5 && m.r > 0.5) c = mix(c, uSelC, 0.75);
            else if (mx.b > 0.5) c = mix(c, uSelC, 0.55 + 0.3 * pulse);
            // hovered part: an amber rim inside, a bright line around
            if (m.g > 0.5) { c = mix(c, uHov, 0.1 + (mn.g < 0.5 ? 0.55 : 0.0)); }
            else if (mx.g > 0.5) c = mix(c, uHov, 0.9);
            // the flash burns everything out
            c = mix(c, vec3(1.0, 0.98, 0.94), clamp(uFlash, 0.0, 1.0));
            // grimy CCTV vignette
            vec2 q = vUv - 0.5;
            c *= 1.0 - dot(q, q) * 0.9;
            gl_FragColor = vec4(c, 1.0);
            #include <colorspace_fragment>
          }`,
        depthTest: false, depthWrite: false,
      });
      const scene = new THREE.Scene();
      scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
      this.post = { scene, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), mat };
    }
    this.post.mat.uniforms.tex.value = this.rtColor.texture;
    this.post.mat.uniforms.mask.value = this.rtMask.texture;
    this.post.mat.uniforms.texel.value.set(1 / lw, 1 / lh);
  }

  private setRects(u: THREE.Vector4[], nU: { value: number }, part: Pickable | null) {
    const regs = part && (PART_REGIONS as Record<string, RegKey[]>)[part];
    let n = 0;
    if (regs) for (const rk of regs) { if (n >= u.length) break; const g = REG[rk]; u[n++].set(g.x - PAD, g.y - PAD, g.x + g.w + PAD, g.y + g.h + PAD); }
    nU.value = n;
  }

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, (now - this.last) / 1000);
    if (dt < 1 / 50) return;
    this.last = now;
    if (!this.visible || document.hidden || !this.renderer || !this.rig || !this.rtColor || !this.rtMask || !this.post) return;
    this.t += dt;
    const rig = this.rig;
    const H = this.app?.height ?? 1;
    // ---- subject turn
    const f = FRAMES[this.focusKey] || FRAMES.full;
    this.yawUser += this.yawVel * dt * 0.01; this.yawVel *= Math.exp(-dt * 5);
    const yawT = f.yaw + this.yawUser + this.yaw;
    this.turn.rotation.y = damp(this.turn.rotation.y, yawT, 6, dt);
    // ---- pose: idle (rig), held stance, emote
    let pose: Pose | null = null;
    try { const r = (rig as any).update(dt); pose = r && typeof r === 'object' ? r : null; } catch { pose = null; }
    this.holdW = damp(this.holdW, this.holdKey ? 1 : 0, 5, dt);
    if (pose) {
      let p = pose;
      const hk = this.holdKey || this.lastHold;
      if (hk && HOLD_POSES[hk] && this.holdW > 0.01) { p = blendPose(p, HOLD_POSES[hk], this.holdW); this.lastHold = hk; }
      if (this.emoteName) {
        this.emoteT += dt;
        const e = EMOTES[this.emoteName];
        if (!e || this.emoteT >= this.emoteDur) { this.emoteName = ''; this.onEmote?.(''); }
        else {
          const w = Math.min(1, this.emoteT / 0.2, (this.emoteDur - this.emoteT) / 0.3);
          p = blendPose(p, e.pose(this.emoteT, this.emoteDur), Math.max(0, w));
        }
      } else if (this.idleOn && !this.holdKey) {
        this.idleT -= dt;
        if (this.idleT <= 0) this.emote(INTAKE_IDLES[this.idleIdx++ % INTAKE_IDLES.length]);
      }
      rig.applyPose(p);
    }
    // ---- camera
    this.camAt.set(damp(this.camAt.x, f.at[0], 4, dt), damp(this.camAt.y, f.at[1] * (f.at[1] > 0.4 ? H : 1), 4, dt), damp(this.camAt.z, f.at[2], 4, dt));
    const portrait = this.lowW / this.lowH < 0.8;
    const dist = f.dist * this.zoomMul * (portrait && this.focusKey === 'full' ? 1.35 : 1);
    this.camDist = damp(this.camDist, dist, 4, dt);
    this.camPitch = damp(this.camPitch, f.pitch, 4, dt);
    const sway = Math.sin(this.t * 0.4) * 0.015;
    this.cam.position.set(this.camAt.x + sway, this.camAt.y + Math.sin(this.camPitch) * this.camDist, this.camAt.z + Math.cos(this.camPitch) * this.camDist);
    this.cam.lookAt(this.camAt);
    this.shiftX = damp(this.shiftX, this.shiftTX, 5, dt);
    this.shiftY = damp(this.shiftY, this.shiftTY, 5, dt);
    if (Math.abs(this.shiftX) > 0.001 || Math.abs(this.shiftY) > 0.001) this.cam.setViewOffset(this.lowW, this.lowH, this.shiftX * this.lowW * 0.5, -this.shiftY * this.lowH * 0.5, this.lowW, this.lowH);
    else this.cam.clearViewOffset();
    // ---- flash
    this.flash = Math.max(0, this.flash - dt * 2.4);
    this.flashLight.intensity = this.flash * 40;
    this.keyLight.intensity = 2.3 + Math.sin(this.t * 37) * 0.04 + (Math.random() < 0.004 ? -0.8 : 0);
    // ---- highlight masks
    const mu = this.maskMat.uniforms;
    this.setRects(mu.uHover.value, mu.uHoverN, this.hover);
    this.setRects(mu.uSel.value, mu.uSelN, this.selected);
    const pu = this.post.mat.uniforms;
    pu.uTime.value = this.t;
    pu.uFlash.value = this.flash * this.flash;
    this.render();
  };
  private lastHold = '';

  private render() {
    const r = this.renderer!;
    const saved = { cut: U.uCutOn.value, vis: U.uVisOn.value, fn: U.uFogNear.value, ff: U.uFogFar.value, gs: U.uGridScale.value, col: U.uCollapse.value, snap: U.uSnapOn.value };
    U.uCutOn.value = 0; U.uVisOn.value = 0; U.uFogNear.value = 1e4; U.uFogFar.value = 2e4; U.uGridScale.value = 0; U.uCollapse.value = 0; U.uSnapOn.value = 0;
    try {
      if (r.shadowMap.enabled) r.shadowMap.needsUpdate = true;
      r.setRenderTarget(this.rtColor);
      r.setClearColor(0x0a0b0a, 1);
      r.clear(true, true, true);
      this.cam.layers.set(0);
      r.render(this.scene, this.cam);
      // mask pass: only the body, flat: r = body, g = hovered part, b = selected part
      r.setRenderTarget(this.rtMask);
      r.setClearColor(0x000000, 0);
      r.clear(true, true, true);
      this.scene.overrideMaterial = this.maskMat;
      this.cam.layers.set(1);
      r.render(this.scene, this.cam);
      this.cam.layers.set(0);
      this.scene.overrideMaterial = null;
      r.setRenderTarget(null);
      r.render(this.post!.scene, this.post!.cam);
    } finally {
      U.uCutOn.value = saved.cut; U.uVisOn.value = saved.vis; U.uFogNear.value = saved.fn; U.uFogFar.value = saved.ff; U.uGridScale.value = saved.gs; U.uCollapse.value = saved.col; U.uSnapOn.value = saved.snap;
    }
  }

  /** a head-and-shoulders portrait (sRGB pixels) for ID photos and case files */
  snapshot(w: number, h: number, profile = false): ImageData | null {
    const r = this.renderer;
    if (!r || !this.rig) return null;
    const W = w * 2, H = h * 2;
    const rt = new THREE.WebGLRenderTarget(W, H, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
    const cam = new THREE.PerspectiveCamera(18, W / H, 0.1, 20);
    const hh = 1.58 * (this.app?.height ?? 1);
    cam.position.set(0.0, hh + 0.06, 2.35); cam.lookAt(0, hh - 0.04, 0);
    const yaw = this.turn.rotation.y;
    this.turn.rotation.y = profile ? Math.PI / 2 : 0;
    this.room.visible = false;
    const saved = { cut: U.uCutOn.value, vis: U.uVisOn.value, fn: U.uFogNear.value, ff: U.uFogFar.value, gs: U.uGridScale.value };
    U.uCutOn.value = 0; U.uVisOn.value = 0; U.uFogNear.value = 1e4; U.uFogFar.value = 2e4; U.uGridScale.value = 0;
    const px = new Uint8Array(W * H * 4);
    try {
      r.setRenderTarget(rt);
      r.setClearColor(0x000000, 0);
      r.clear(true, true, true);
      r.render(this.scene, cam);
      r.readRenderTargetPixels(rt, 0, 0, W, H, px);
    } finally {
      r.setRenderTarget(null);
      U.uCutOn.value = saved.cut; U.uVisOn.value = saved.vis; U.uFogNear.value = saved.fn; U.uFogFar.value = saved.ff; U.uGridScale.value = saved.gs;
      this.turn.rotation.y = yaw;
      this.room.visible = true;
      rt.dispose();
    }
    const toS = (v: number) => { v /= 255; v = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055; return Math.max(0, Math.min(255, Math.round(v * 255))); };
    const out = new ImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let n = 0, R = 0, G = 0, B = 0;
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
        const si = ((H - 1 - (y * 2 + j)) * W + x * 2 + i) * 4;
        if (px[si + 3] > 100) { n++; R += px[si]; G += px[si + 1]; B += px[si + 2]; }
      }
      const di = (y * w + x) * 4;
      if (n >= 2) { out.data[di] = toS(R / n); out.data[di + 1] = toS(G / n); out.data[di + 2] = toS(B / n); out.data[di + 3] = 255; }
    }
    return out;
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    if (this.rig) { this.turn.remove(this.rig.root); this.rig.dispose(); this.rig = null; }
    this.scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry?.dispose(); });
    this.rtColor?.dispose(); this.rtMask?.dispose();
    this.maskMat.dispose();
    this.boardTex?.dispose();
    if (this.renderer) { this.renderer.dispose(); this.renderer.forceContextLoss(); this.renderer = null; }
    this.canvas.remove();
  }
}
