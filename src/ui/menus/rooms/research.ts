// THE CONTROL ROOM, C-1 (internal id 'research': it grew out of the research
// lab and keeps its benches). A long tiled room under three cold fluorescent
// troughs (real light cones, the two big ones throw shadows) with warm
// practicals (a gooseneck lamp on the microscope bench, the surgical lamp over
// the dissection table), screens that glow and cast, and everything a night
// shift leaves: pipes, conduit, cable runs, grime, labels.
//   back wall      THE MAIN COMPUTER: R-NET 7, a wall of phosphor in an enamel
//                  housing over its console (keys, a tape reader, pilot lamps).
//                  The screen shows the research tree live; press it and the
//                  camera flies into the glass (research/tree.ts).
//   back left      the SAMPLE FRIDGE: a glass door, racks of the samples banked
//                  (jars, vials, swab tubes, slide boxes) filling as you collect
//   left wall      the MICROSCOPE BENCH (gooseneck lamp, slide boxes); the FUME
//                  HOOD with its specimen tray and the red alarm handle
//   centre         the DISSECTION TABLE under the surgical lamp
//   right wall     the CENTRIFUGE bench (pipettes, the jar you must not tap)
//   back right     the SEQUENCER rig: tape reels and CRT readouts of the codex
//   front right    the REQUISITION pegboard: the research tools you have earned
// Pressing the fridge picks a sample and runs it through the benches (the
// first-person mini-games, researchBench.ts); the pegboard opens the
// requisition, the clipboard the Meridian file (research/panel.ts). The codex
// itself is filed in the codex archive next door (rooms/archive.ts).
import * as THREE from 'three';
import type { FMats } from '../scene/pixtex';
import { Puffs, Dust, shaftMesh } from '../scene/fx';
import type { Hot, StageRoom, Grade } from '../monitor/stage';
import { bitText, bitMeasure } from '../../../gfx/bitfont';
import {
  FacetBuilder, at, cbox, prism, lathe, extrude, hull, tube, bolt, C, LedBank, blink, busy, plate, paper, slab, glowCard, Wobble, crtSet, uiSound,
} from '../monitor/props';
import { codexStats, bank, TOOLS, TOOL_KEYS, toolLevel, req } from '../../../game/codex';
import { BRANCHES, treeNodes, rankOf, nodeState } from '../../../game/unitTree';
import { researchPoints } from '../../../game/research';
import { onFile } from '../../../game/meridian';
import { bus } from '../../../core/events';
import { menuEvent } from '../../../game/achievements';
import { BenchRun, type BenchHost, type Station } from './researchBench';
import { Dresser } from './dress';
import { Vault, blob, frostCard } from './vault';
import type { Sample } from '../../../game/codex';

const W = 3.6, BACK = -3.0, FRONT = 3.3, H = 3.05;
const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt));
const WALL = { x: 0.15, y: 1.86, w: 3.3, h: 1.3 };
const FRIDGE = new THREE.Vector3(-W + 0.62, 0, BACK + 0.36);
const HOOD = new THREE.Vector3(-W + 0.46, 0, 0.55);
const SCOPE = new THREE.Vector3(-W + 0.4, 0.92, -1.15);
const TABLE = new THREE.Vector3(0.35, 0.94, -0.55);
const CENTRI = new THREE.Vector3(W - 0.42, 0.92, -0.95);
const SEQ = new THREE.Vector3(2.05, 0, BACK + 0.4);
const PEG = new THREE.Vector3(W - 0.03, 1.45, 1.55);
/** the observation window in the right wall over the centrifuge bench, and the holding chamber behind it */
const OBS = { z: -1.5, y: 1.78, w: 1.6, h: 1.05 };
// (it runs back past the room's own back wall: from the room's camera the window looks into its far end)
const CH = { x0: W + 0.2, x1: W + 2.8, z0: -4.6, z1: -0.3, h: 2.9, px: W + 1.35, pz: -3.0 };
type Pose = { pos: THREE.Vector3; look: THREE.Vector3; fov: number };
const P = (p: [number, number, number], l: [number, number, number], fov = 50): Pose => ({ pos: new THREE.Vector3(...p), look: new THREE.Vector3(...l), fov });
const POSES: Record<string, Pose> = {
  // turned a little right of the main computer, so the window onto HOLDING 2 is in the shot
  room: P([0.05, 1.72, 3.05], [0.4, 1.2, -1.2], 56),
  codex: P([WALL.x, 1.86, -0.35], [WALL.x, 1.84, BACK], 54),
  fridge: P([-2.0, 1.45, -0.8], [FRIDGE.x - 0.1, 1.05, FRIDGE.z], 52),
  req: P([1.75, 1.5, 1.35], [PEG.x, 1.35, PEG.z], 50),
  // up at the observation window, looking through it at what is held in HOLDING 2
  obs: P([2.35, 1.72, -0.35], [W + 1.35, 1.25, -2.95], 50),
  build: P([1.2, 2.8, 3.1], [-0.1, 0.3, 0.2], 54),
};

interface Readout { cv: HTMLCanvasElement; ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture; draw: (c: CanvasRenderingContext2D, t: number) => void; every: number; acc: number }

export class ResearchLab implements StageRoom {
  id = 'research';
  scene = new THREE.Scene();
  cam = new THREE.PerspectiveCamera(54, 16 / 9, 0.03, 30);
  feedCam = new THREE.PerspectiveCamera(70, 4 / 3, 0.05, 30);
  hots: Hot[] = [];
  // the intake drag's look (introKit/stage.ts LOOKS.wing): cold blue shadows, warm highlights, readable
  grade: Grade = { exposure: 1.72, lift: [0.82, 0.94, 1.14], gain: [1.1, 1.0, 0.88], vig: 0.6, sat: 1.12, contrast: 1.14, side: [1, 0, 0, 0.3], haze: 0.45, hazeColor: 0x4a5a7a, ao: 0.85, scatter: 0.4, bounce: 0.24, shafts: [new THREE.Vector3(-1.5, H - 0.4, -1.3), new THREE.Vector3(1.2, H - 0.4, -1.3), new THREE.Vector3(0, H - 0.4, 1.3)], shaftK: 0.42, shaftColor: 0xe8f0ff };
  deco = new THREE.Group();
  floor = { minX: -W + 1.2, maxX: W - 1.0, minZ: 0.4, maxZ: 2.4, y: 0 };
  surfaces = [{ minX: SCOPE.x - 0.25, maxX: SCOPE.x + 0.25, minZ: SCOPE.z - 0.75, maxZ: SCOPE.z + 0.75, y: 0.92 }, { minX: CENTRI.x - 0.3, maxX: CENTRI.x + 0.3, minZ: CENTRI.z - 0.8, maxZ: CENTRI.z + 0.8, y: 0.92 }];
  guideSpot = { pos: new THREE.Vector3(2.15, 0, 1.25), look: new THREE.Vector3(0, 1.6, BACK) };
  actions: { key: string; label: string; run: () => void }[] = [];
  /** the room wants a panel (title.ts opens research/panel.ts) */
  onPanel?: (w: 'tree' | 'codex' | 'fridge' | 'req' | 'file' | 'entry', key?: string) => void;
  /** the benches started / finished (title.ts hides its HUD while the hands are up) */
  onBench?: (on: boolean) => void;
  bench: BenchRun | null = null;
  /** a world ray through a client point (title.ts hands over the stage's) */
  rayAt?: (x: number, y: number) => THREE.Ray | null;
  private mats: FMats;
  private leds = new LedBank(240);
  /** the set dressing: gauges, breaker boxes, cabinets, trays, the clock (rooms/dress.ts) */
  private dress!: Dresser;
  /** the containment kit (rooms/vault.ts): the observation window, the cold store, the restraints, the beacon */
  private vault!: Vault;
  /** the holding chamber behind the window: its cold lamp, its red alarm light, and what is held there */
  // (a spot straight down, and a short red: no light of theirs leaks through the wall into the control room)
  private chamL = new THREE.SpotLight(0xc8e8ff, 18, 4.0, 0.52, 0.65, 1.4);
  private chamRed = new THREE.PointLight(0xff2a14, 0, 2.4, 1.6);
  private redL = new THREE.PointLight(0xff2a14, 0, 3.2, 1.7);
  private held = new THREE.Group();
  private heldTick: ((t: number, dt: number) => void) | null = null;
  private puffs = new Puffs(80);
  private hemi = new THREE.HemisphereLight(0xb0c4dc, 0x3a3230, 0.62);
  private tubes: { light: THREE.SpotLight; mat: THREE.MeshBasicMaterial; base: number; seed: number; flick: number; shaft?: ReturnType<typeof shaftMesh> }[] = [];
  private dust = new Dust(220, new THREE.Box3(new THREE.Vector3(-W + 0.5, 0.2, BACK + 0.5), new THREE.Vector3(W - 0.5, H - 0.4, FRONT - 0.8)));
  private surg = new THREE.SpotLight(0xfff0dc, 0, 4.2, 0.55, 0.6, 1.6);
  private surgMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  /** the scope bench group (turned to the left wall) */
  private surgOn = 1; private surgLvl = 1;
  private desk = new THREE.PointLight(0xffb066, 2.2, 2.4, 1.7);
  private wallGlow = new THREE.PointLight(0xd8ecff, 4.5, 5.5, 1.6);
  private fridgeGlow = new THREE.PointLight(0x9adcff, 0.9, 1.6, 2);
  private screenGlow = new THREE.PointLight(0x7aff9a, 0.9, 2.6, 1.8);
  // the codex wall
  private wallCv = document.createElement('canvas');
  private wallTex: THREE.CanvasTexture;
  private wallMesh!: THREE.Mesh;
  private wallMat = new THREE.MeshBasicMaterial({ toneMapped: false, color: 0xd8d0c0 });
  private flash: { key: string; t: number } | null = null;
  // the fridge's racks
  private racks: { mesh: THREE.InstancedMesh; kind: string }[] = [];
  private rackSlots: THREE.Vector3[] = [];
  private fridgeDoor = new THREE.Group(); private doorA = 0; private doorT = 0;
  private caps: THREE.InstancedMesh | null = null;
  // the pegboard's tools
  private peg = new THREE.Group();
  private pegTools = new Map<string, THREE.Object3D>();
  // machines and readouts
  private reels: THREE.Object3D[] = []; private reelV = 1;
  private rotor = new THREE.Group(); private rotorV = 0.3; private rotorA = 0;
  private readouts: Readout[] = [];
  private jar = new THREE.Group(); private jarW = new Wobble(180, 4); private jarTaps = 0;
  private alarm = new THREE.Group(); private alarmT = 0; private alarmLed: ReturnType<LedBank['add']> | null = null;
  private lampHead = new THREE.Group();
  /** the pinned specimen on the dissection tray (hidden while the benches use the tray) */
  private trayProps: THREE.Object3D[] = [];
  // camera
  private pose = 'room'; private camP = POSES.room.pos.clone(); private camL = POSES.room.look.clone(); private camF = POSES.room.fov;
  private ptr = new THREE.Vector2(); private ptrS = new THREE.Vector2();
  private build = 0; private buildT = 0;
  private dirty = true;
  private t = 0;
  private v = new THREE.Vector3();

  constructor(mats: FMats) {
    this.mats = mats;
    const S = this.scene;
    S.background = new THREE.Color(0x000000);
    this.wallCv.width = 768; this.wallCv.height = 316;
    this.wallTex = new THREE.CanvasTexture(this.wallCv);
    this.wallTex.magFilter = this.wallTex.minFilter = THREE.NearestFilter; this.wallTex.generateMipmaps = false; this.wallTex.colorSpace = THREE.SRGBColorSpace;
    this.wallMat.map = this.wallTex;
    S.add(this.shell(), this.fixtures(), this.codexWall(), this.fridge(), this.hood(), this.scopeBench(), this.table(), this.centrifuge(), this.sequencer(), this.pegboard(), this.clutter(), this.chamber(), this.dressing());
    S.add(this.chamL, this.chamL.target, this.chamRed, this.redL);
    S.add(this.leds.mesh, this.puffs.mesh, this.deco, this.hemi, this.dust.points);
    // wet floor: dark specular puddles that pick up the troughs and the screen
    for (const [x, z, w, d] of [[TABLE.x + 0.9, TABLE.z + 0.75, 1.1, 0.7], [-1.6, 1.4, 0.8, 1.2], [1.9, 1.8, 0.6, 0.5]] as [number, number, number, number][]) {
      const wet = new THREE.Mesh(new THREE.CircleGeometry(0.5, 9), new THREE.MeshStandardMaterial({ color: 0x0a0c0c, roughness: 0.04, metalness: 0.6, transparent: true, opacity: 0.5, depthWrite: false }));
      wet.rotation.x = -Math.PI / 2; wet.scale.set(w, d, 1); wet.position.set(x, 0.006, z); wet.renderOrder = 2; wet.userData.noGlow = true; S.add(wet);
    }
    this.deco.name = 'deco';
    this.feedCam.position.set(W - 0.35, H - 0.3, FRONT - 0.4); this.feedCam.lookAt(-0.6, 0.9, -1.4);
    this.cam.position.copy(this.camP); this.cam.lookAt(this.camL);
    this.actions = [
      { key: 'tree', label: 'Research tree', run: () => this.focus('codex', () => this.onPanel?.('tree')) },
      { key: 'process', label: 'Process a sample', run: () => this.focus('fridge', () => this.onPanel?.('fridge')) },
      { key: 'req', label: 'Requisition', run: () => this.focus('req', () => this.onPanel?.('req')) },
      { key: 'file', label: 'Meridian file', run: () => this.onPanel?.('file') },
    ];
    onFile(() => { this.dirty = true; });
    bus.on('research', () => { this.dirty = true; });
    this.refresh();
  }

  /** re-read the Meridian file: the wall, the fridge, the pegboard, the readouts */
  refresh() { this.dirty = false; this.drawWall(); this.fillFridge(); this.hangTools(); for (const r of this.readouts) r.acc = r.every; }
  /** the main computer flashes the news (after a bench run) */
  flashEntry(key: string) { this.flash = { key, t: 0 }; }

  // ================================================================== the shell
  private shell(): THREE.Group {
    const g = new THREE.Group();
    const b = new FacetBuilder();
    const TILE = 0xd8e2dc, CONC = 0xa8aaa4;
    slab(b, 'floor', -W, W, -0.1, 0, BACK - 0.2, FRONT, 0x9aa49c, 0.004, 0.6);
    slab(b, 'concrete', -W, W, H, H + 0.12, BACK - 0.2, FRONT, 0x5a5c58);
    const wall = (x0: number, x1: number, z0: number, z1: number) => { slab(b, 'tile', x0, x1, 0, 1.3, z0, z1, TILE); slab(b, 'concrete', x0, x1, 1.3, H, z0, z1, CONC); };
    wall(-W, W, BACK - 0.2, BACK); wall(-W - 0.2, -W, BACK, FRONT); wall(-W, W, FRONT, FRONT + 0.2);
    // the right wall runs round the observation window
    const oz0 = OBS.z - OBS.w / 2, oz1 = OBS.z + OBS.w / 2, oy0 = OBS.y - OBS.h / 2, oy1 = OBS.y + OBS.h / 2;
    wall(W, W + 0.2, BACK, oz0); wall(W, W + 0.2, oz1, FRONT);
    slab(b, 'tile', W, W + 0.2, 0, Math.min(1.3, oy0), oz0, oz1, TILE); if (oy0 > 1.3) slab(b, 'concrete', W, W + 0.2, 1.3, oy0, oz0, oz1, CONC);
    slab(b, 'concrete', W, W + 0.2, oy1, H, oz0, oz1, CONC);
    // the dado cap and the cove skirting, in hospital green
    const cap = (x0: number, x1: number, z0: number, z1: number) => { slab(b, 'tile', x0, x1, 1.28, 1.34, z0, z1, 0x3a7a62, 0.01); slab(b, 'tile', x0, x1, 0, 0.12, z0, z1, 0x2e5a4a, 0.008); };
    cap(-W, W, BACK, BACK + 0.04); cap(-W, -W + 0.04, BACK, FRONT); cap(W - 0.04, W, BACK, oz0 - 0.12); cap(W - 0.04, W, oz1 + 0.12, FRONT);
    slab(b, 'tile', W - 0.04, W, 0, 0.12, oz0 - 0.12, oz1 + 0.12, 0x2e5a4a, 0.008);
    // floor: a drain, a hazard-taped work zone round the table, worn lino patches
    b.add('rust', extrude([[-0.2, -0.2], [0.2, -0.2], [0.2, 0.2], [-0.2, 0.2]], 0.015, 0.004, [[[-0.16, -0.16], [0.16, -0.16], [0.16, 0.16], [-0.16, 0.16]]]), 0xb0a090, at(TABLE.x + 0.9, 0.004, TABLE.z + 0.7, Math.PI / 2));
    for (let i = 0; i < 5; i++) b.add('rust', cbox(0.32, 0.01, 0.018, 0.003), 0x8a7a6a, at(TABLE.x + 0.9, 0.004, TABLE.z + 0.56 + i * 0.07));
    for (const [x0, z0, x1, z1] of [[TABLE.x - 0.9, TABLE.z - 1.35, TABLE.x + 0.9, TABLE.z - 1.29], [TABLE.x - 0.9, TABLE.z + 1.29, TABLE.x + 0.9, TABLE.z + 1.35], [TABLE.x - 0.9, TABLE.z - 1.35, TABLE.x - 0.84, TABLE.z + 1.35], [TABLE.x + 0.84, TABLE.z - 1.35, TABLE.x + 0.9, TABLE.z + 1.35]] as [number, number, number, number][]) b.add('hazard', cbox(x1 - x0, 0.004, z1 - z0, 0.001), 0xffffff, at((x0 + x1) / 2, 0.002, (z0 + z1) / 2), { rep: 0.25 });
    // a door (front left) with a wired window, its push plate
    b.add('paint', cbox(1.0, 2.15, 0.06, 0.01), 0x4a6a62, at(-1.9, 1.075, FRONT - 0.03));
    b.add('metal', cbox(0.3, 0.4, 0.02, 0.005), 0x22282a, at(-1.9, 1.6, FRONT - 0.065));
    b.add('chrome', cbox(0.08, 0.3, 0.02, 0.004), 0xffffff, at(-1.55, 1.05, FRONT - 0.07));
    // the ceiling services: two pipes (one lagged), a cable tray, conduit drops, a duct
    b.add('paint', prism(0.07, FRONT - BACK, 8), 0x4a6a8a, at(-W + 0.32, H - 0.24, (FRONT + BACK) / 2, Math.PI / 2), { rep: 0.4 });
    b.add('sponge', prism(0.09, 2.2, 8), 0xd8d0b8, at(-W + 0.32, H - 0.24, -0.4, Math.PI / 2));
    for (const z of [-1.6, 0.8]) b.add('metal', cbox(0.03, 0.06, 0.2, 0.006), C.dark, at(-W + 0.32, H - 0.24, z));
    b.add('paint', prism(0.05, FRONT - BACK, 8), 0xb8a040, at(-W + 0.55, H - 0.18, (FRONT + BACK) / 2, Math.PI / 2), { rep: 0.4 });
    b.add('metal', cbox(0.42, 0.06, FRONT - BACK - 0.2, 0.008), C.dark, at(W - 0.55, H - 0.22, (FRONT + BACK) / 2));
    for (let i = 0; i < 14; i++) b.add('rubber', cbox(0.38, 0.03, 0.02, 0.006), [0x1a1a1a, 0x8a2a1a, 0x2a4a8a, 0x1a1a1a][i % 4], at(W - 0.55, H - 0.18, BACK + 0.3 + i * 0.42));
    b.add('metal', hull([[W - 0.3, H - 0.02, BACK], [W, H - 0.02, BACK], [W - 0.3, H - 0.4, BACK], [W, H - 0.4, BACK], [W - 0.3, H - 0.02, FRONT], [W, H - 0.02, FRONT], [W - 0.3, H - 0.4, FRONT], [W, H - 0.4, FRONT]]), 0x8a8e8a, undefined, { rep: 0.6 });
    for (const x of [-1.95, 2.05]) b.add('metal', prism(0.014, H - 1.95, 6), C.steel, at(x, (H + 1.95) / 2 + 0.05, BACK + 0.03));
    g.add(b.build(this.mats));
    // grime: dark stains under the benches and down the walls, a wet patch by the drain
    g.add(grime(5.6, 0.9, 11, 0.5).translateX(0).translateY(0.5).translateZ(BACK + 0.012));
    const fl = grime(3.0, 3.0, 23, 0.45); fl.rotation.x = -Math.PI / 2; fl.position.set(TABLE.x + 0.5, 0.004, TABLE.z + 0.4); g.add(fl);
    const lw = grime(4.5, 1.0, 37, 0.4); lw.rotation.y = Math.PI / 2; lw.position.set(-W + 0.012, 0.6, 0.0); g.add(lw);
    // labels
    const sign = (lines: string[], w: number, h: number, x: number, y: number, z: number, ry = 0, bg = 0xc8c0a0, ink?: number) => { const s = plate(this.mats, lines, w, h, { bg, ink }); s.position.set(x, y, z); s.rotation.y = ry; g.add(s); return s; };
    sign(['CONTROL ROOM C-1', 'MERIDIAN INSTITUTE'], 0.86, 0.2, -1.9, 2.4, FRONT - 0.01, Math.PI);
    sign(['BIOHAZARD', 'LEVEL 2'], 0.4, 0.15, -2.05, 1.78, BACK + 0.012, 0, 0xd8a030, 0x1a1208);
    sign(['NO FOOD', 'IN THE STORE'], 0.3, 0.11, FRIDGE.x + 0.28, 1.8, FRIDGE.z + 0.36, 0, 0xe8e2d0);
    sign(['WASH HANDS'], 0.32, 0.08, W - 0.012, 1.55, 2.7, -Math.PI / 2, 0x7ab8a0, 0x0a1a12);
    return g;
  }

  // ================================================================== light: troughs, cones, practicals
  private fixtures(): THREE.Group {
    const g = new THREE.Group();
    const b = new FacetBuilder();
    // three enamel troughs on chains, each with two tubes; the outer two throw shadows
    const rows: [number, number, boolean][] = [[-1.5, -1.3, true], [1.2, -1.3, true], [0, 1.3, false]];
    rows.forEach(([x, z, shadow], i) => {
      const y = H - 0.42;
      b.add('enamel', hull([[x - 0.14, 0, z - 0.75], [x + 0.14, 0, z - 0.75], [x - 0.14, 0, z + 0.75], [x + 0.14, 0, z + 0.75], [x - 0.19, -0.1, z - 0.78], [x + 0.19, -0.1, z - 0.78], [x - 0.19, -0.1, z + 0.78], [x + 0.19, -0.1, z + 0.78]]), 0xd8d4c4, at(0, y + 0.1, 0));
      for (const dz of [-0.6, 0.6]) b.add('metal', prism(0.005, 0.32, 4), C.dark, at(x, y + 0.26, z + dz));
      b.add('metal', cbox(0.36, 0.012, 0.02, 0.003), C.dark, at(x, y + 0.005, z - 0.4));
      b.add('metal', cbox(0.36, 0.012, 0.02, 0.003), C.dark, at(x, y + 0.005, z + 0.4));
      const mat = new THREE.MeshBasicMaterial({ color: 0xf2f6ff, toneMapped: false });
      for (const dx of [-0.06, 0.06]) { const tg = prism(0.016, 1.42, 6); tg.rotateX(Math.PI / 2); const m = new THREE.Mesh(tg, mat); m.position.set(x + dx, y + 0.035, z); m.userData.noGlow = true; g.add(m); }
      const L = new THREE.SpotLight(0xe8f0ff, 0, 7.5, 1.12, 0.85, 1.55);
      L.position.set(x, y, z); L.target.position.set(x, 0, z + 0.05);
      if (shadow) { L.castShadow = true; L.shadow.mapSize.set(1024, 1024); L.shadow.camera.near = 0.2; L.shadow.camera.far = 4; L.shadow.bias = -0.0006; L.shadow.normalBias = 0.02; }
      g.add(L, L.target);
      // the cone itself: additive haze under the trough, dust turning in it
      const sh = shaftMesh(10);
      sh.mesh.position.set(x, y - 0.02, z); sh.mesh.scale.set(0.75, y - 0.1, 1.05); sh.u.uColor.value.setHex(0xd4e4ff); sh.u.uInt.value = 0.02;
      g.add(sh.mesh);
      this.tubes.push({ light: L, mat, base: shadow ? 25 : 15, seed: i * 3.1, flick: 0, shaft: sh });
      // the light pool each casts on the floor (a soft bounce card)
      const pool = glowCard(2.6, 3.2, 0xdfe8ff, 0.05); pool.rotation.x = -Math.PI / 2; pool.position.set(x, 0.005, z); g.add(pool);
    });
    g.add(b.build(this.mats, { cast: false }));
    this.wallGlow.position.set(0, 1.7, BACK + 0.9); g.add(this.wallGlow);
    return g;
  }

  // ================================================================== the main computer
  private codexWall(): THREE.Group {
    const g = new THREE.Group();
    const b = new FacetBuilder();
    const { x, y, w, h } = WALL;
    // the enamel housing: a deep bezel, vents along the top, the maker's plate
    b.add('enamel', cbox(w + 0.34, h + 0.36, 0.3, 0.05), 0xc4bc9e, at(x, y, BACK + 0.15));
    b.add('enamel', cbox(w + 0.18, h + 0.2, 0.06, 0.03), 0x8a8470, at(x, y, BACK + 0.3));
    for (let i = 0; i < 18; i++) b.add('metal', cbox(0.1, 0.012, 0.02, 0.003), C.darker, at(x - w / 2 + 0.2 + i * (w - 0.3) / 17, y + h / 2 + 0.14, BACK + 0.305));
    for (const [bx, by] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.add('chrome', bolt(0.014, 0.01), C.steel, at(x + bx * (w / 2 + 0.12), y + by * (h / 2 + 0.12), BACK + 0.3, Math.PI / 2));
    // the console under it: a raked desk of keys, the tape reader, a row of pilot lamps and toggles
    const cy = 0.92, cz = BACK + 0.62;
    b.add('paint', cbox(w * 0.78, cy - 0.04, 0.5, 0.014), 0x6e7660, at(x, (cy - 0.04) / 2, cz), { rep: 0.5 });
    b.add('enamel', hull([[x - w * 0.4, cy - 0.04, cz - 0.27], [x + w * 0.4, cy - 0.04, cz - 0.27], [x - w * 0.4, cy - 0.04, cz + 0.27], [x + w * 0.4, cy - 0.04, cz + 0.27], [x - w * 0.4, cy + 0.16, cz - 0.27], [x + w * 0.4, cy + 0.16, cz - 0.27], [x - w * 0.4, cy + 0.02, cz + 0.27], [x + w * 0.4, cy + 0.02, cz + 0.27]]), 0xc4bc9e);
    for (let r = 0; r < 3; r++) for (let k = 0; k < 16; k++) b.add('bakelite', cbox(0.05, 0.025, 0.05, 0.008), r === 0 && k > 12 ? 0xa83a2a : 0x2a2622, at(x - 0.6 + k * 0.075, cy + 0.06 + (2 - r) * 0.038 + 0.02, cz + 0.12 - r * 0.07));
    b.add('metal', cbox(0.42, 0.12, 0.26, 0.02), 0x3a3e3a, at(x + 0.95, cy + 0.12, cz - 0.08));
    b.add('chrome', prism(0.05, 0.03, 10), 0xd8dcdc, at(x + 0.85, cy + 0.2, cz - 0.08, Math.PI / 2));
    b.add('chrome', prism(0.05, 0.03, 10), 0xd8dcdc, at(x + 1.05, cy + 0.2, cz - 0.08, Math.PI / 2));
    b.add('sponge', cbox(0.04, 0.5, 0.004, 0.001), 0xe2d8b4, at(x + 0.95, cy - 0.12, cz + 0.06));
    g.add(b.build(this.mats));
    for (let k = 0; k < 14; k++) this.leds.add([x - 0.95 + k * 0.08, cy + 0.165, cz - 0.24], [0xffb030, 0x40ff60, 0xff3a2a][k % 3], { size: 0.012, pattern: busy(k + 40, 2 + (k % 4)) });
    const head = plate(this.mats, ['R-NET 7 · MAIN COMPUTER'], 1.3, 0.1, { bg: 0x2a2014, ink: 0xffd890, emissive: true, px: 420 });
    head.position.set(x, y + h / 2 + 0.1, BACK + 0.32); g.add(head);
    this.wallMesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.wallMat);
    this.wallMesh.position.set(x, y, BACK + 0.335);
    this.wallMesh.userData.noGlow = true;
    g.add(this.wallMesh);
    this.hots.push({ key: 'codex', objs: [this.wallMesh], glow: [], label: 'The main computer', sub: 'the research tree · designs, recipes, chips, limbs', press: () => { uiSound('tick', 0.6); this.focus('codex', () => this.onPanel?.('tree')); } });
    return g;
  }
  /** the main computer's glass: the research tree live, in phosphor amber on green-black */
  private drawWall() {
    const c = this.wallCv.getContext('2d')!;
    const Wd = this.wallCv.width, Hd = this.wallCv.height;
    c.imageSmoothingEnabled = false;
    const g = c.createRadialGradient(Wd / 2, Hd / 2, 20, Wd / 2, Hd / 2, Wd * 0.62);
    g.addColorStop(0, '#16301c'); g.addColorStop(1, '#06100a');
    c.fillStyle = g; c.fillRect(0, 0, Wd, Hd);
    // a faint graticule
    c.fillStyle = 'rgba(120,255,150,0.06)';
    for (let x = 0; x < Wd; x += 24) c.fillRect(x, 0, 1, Hd);
    for (let y = 0; y < Hd; y += 24) c.fillRect(0, y, Wd, 1);
    bitText(c, 'R-NET 7 · RESEARCH DIRECTORY', 10, 4, { color: '#ffd890', outline: null });
    const pts = `${researchPoints()} RP`;
    bitText(c, pts, Wd - 12 - bitMeasure(pts), 4, { color: '#6aff8e', outline: null });
    const st = codexStats();
    const cx = `CODEX ${st.pct}%`;
    bitText(c, cx, Wd - 30 - bitMeasure(pts) - bitMeasure(cx), 4, { color: '#ffb848', outline: null });
    c.fillStyle = '#ffb848'; c.fillRect(10, 24, Wd - 20, 1);
    const pw = Math.floor((Wd - 20) / 4);
    BRANCHES.forEach((br, i) => {
      const px = 10 + i * pw, py = 32, ph = Hd - py - 26;
      c.fillStyle = 'rgba(255,184,72,0.07)'; c.fillRect(px + 3, py, pw - 8, ph);
      c.fillStyle = 'rgba(255,184,72,0.45)'; c.fillRect(px + 3, py, pw - 8, 1); c.fillRect(px + 3, py + ph - 1, pw - 8, 1); c.fillRect(px + 3, py, 1, ph); c.fillRect(px + pw - 6, py, 1, ph);
      bitText(c, br.name.toUpperCase(), px + 8, py + 3, { color: '#ffc860', outline: null });
      const ns = treeNodes(br.key);
      const maxC = Math.max(...ns.map((n) => n.col)) + 1, maxR = Math.max(...ns.map((n) => n.row)) + 2;
      const cw = Math.min(26, Math.floor((pw - 22) / maxC)), rh = Math.floor((ph - 30) / maxR);
      const sz = Math.max(8, Math.min(cw - 6, rh * 2 - 6, 16));
      const at = (n: { col: number; row: number }) => [px + 10 + n.col * cw, py + 26 + n.row * rh] as const;
      // the pipes first
      for (const n of ns) for (const rk of n.req) {
        const m = ns.find((q) => q.key === rk); if (!m) continue;
        const [ax, ay] = at(m), [bx, by] = at(n);
        c.fillStyle = rankOf(m) ? '#ffb848' : '#4a3a20';
        if (m.row === n.row) c.fillRect(ax + sz, ay + sz / 2, bx - ax - sz, 2);
        else { const xm = m.col === n.col ? ax + sz / 2 : bx - 3; c.fillRect(Math.min(ax + sz / 2, xm), ay + sz / 2, Math.abs(xm - ax - sz / 2) + 1, 2); c.fillRect(xm, Math.min(ay, by) + sz / 2, 2, Math.abs(by - ay)); c.fillRect(xm, by + sz / 2, bx - xm, 2); }
      }
      for (const n of ns) {
        const [nx, ny] = at(n);
        const r = rankOf(n), s2 = nodeState(n);
        const blink = s2 === 'open' && Math.floor(this.t * 2) % 2 === 0;
        c.fillStyle = r ? '#ffb848' : s2 === 'open' ? (blink ? '#8a6a20' : '#5a4010') : '#1e1a10';
        c.fillRect(nx, ny, sz, sz);
        c.fillStyle = r ? '#fff0c0' : s2 === 'open' ? '#ffd890' : '#4a3e28';
        c.fillRect(nx, ny, sz, 1); c.fillRect(nx, ny, 1, sz);
        if (r && n.ranks > 1) { c.fillStyle = '#103a18'; for (let k = 0; k < r; k++) c.fillRect(nx + 2 + k * 3, ny + sz - 4, 2, 2); }
      }
    });
    const tip = Math.floor(this.t * 1.5) % 2 ? 'TAP THE GLASS TO LOG IN_' : 'TAP THE GLASS TO LOG IN';
    bitText(c, tip, 10, Hd - 20, { color: '#6aff8e', outline: null });
    if (this.flash) {
      const a = Math.max(0, 1 - this.flash.t / 1.6);
      c.fillStyle = `rgba(106,255,142,${a * 0.25})`; c.fillRect(0, 0, Wd, Hd);
      bitText(c, 'SAMPLE FILED · CODEX UPDATED', Wd / 2 - 110, Hd / 2 - 8, { color: '#e8ffe8', outline: '#071008' });
    }
    // scanlines
    c.fillStyle = 'rgba(0,0,0,0.22)';
    for (let y = 0; y < Hd; y += 2) c.fillRect(0, y, Wd, 1);
    this.wallTex.needsUpdate = true;
  }

  // ================================================================== the sample fridge
  private fridge(): THREE.Group {
    const g = new THREE.Group();
    const b = new FacetBuilder();
    const { x, z } = FRIDGE;
    // facing the room (+Z): FW across, FD deep
    const FW = 1.0, FH = 2.05, FD = 0.62, FZ = z + FD / 2;
    // the carcass (white enamel), a compressor grille under the door, the seal, a thermometer dial
    // an open-fronted carcass: sides, top, plinth, back
    for (const sx of [-1, 1]) b.add('enamel', cbox(0.05, FH, FD, 0.01), 0xe8ece6, at(x + sx * (FW / 2 - 0.025), FH / 2, z));
    b.add('enamel', cbox(FW, 0.1, FD, 0.01), 0xe8ece6, at(x, FH - 0.05, z));
    b.add('enamel', cbox(FW, 0.2, FD, 0.01), 0xd8dcd6, at(x, 0.1, z));
    b.add('enamel', cbox(FW, FH, 0.04, 0.01), 0xd8dcd6, at(x, FH / 2, z - FD / 2 + 0.02));
    for (let i = 0; i < 6; i++) b.add('metal', cbox(FW * 0.8, 0.012, 0.012, 0.003), C.darker, at(x, 0.05 + i * 0.022, FZ + 0.012));
    b.add('metal', extrude([[-FW / 2 + 0.04, 0.2], [FW / 2 - 0.04, 0.2], [FW / 2 - 0.04, FH - 0.08], [-FW / 2 + 0.04, FH - 0.08]], 0.01, 0.003, [[[-FW / 2 + 0.08, 0.24], [FW / 2 - 0.08, 0.24], [FW / 2 - 0.08, FH - 0.12], [-FW / 2 + 0.08, FH - 0.12]]]), 0x8a9294, at(x, 0, FZ));
    b.add('metal', lathe([[0, 0], [0.05, 0], [0.05, 0.012], [0, 0.012]], 8), 0x3a3e40, at(x + FW / 2 - 0.12, FH - 0.04, FZ + 0.012, Math.PI / 2));
    // inside: the back wall (dark), the wire shelves
    b.add('metal', cbox(FW - 0.16, FH - 0.34, 0.02, 0.003), 0x2a3236, at(x, FH / 2 + 0.07, z - FD / 2 + 0.06));
    const shelfY = [0.42, 0.74, 1.06, 1.38, 1.7];
    for (const sy of shelfY) {
      b.add('chrome', cbox(FW - 0.18, 0.01, FD - 0.14, 0.003), 0xa8b0b4, at(x, sy, z + 0.01));
      for (let k = 0; k < 9; k++) b.add('chrome', cbox(0.006, 0.006, FD - 0.14, 0.002), 0xb8c0c4, at(x - FW / 2 + 0.12 + k * 0.095, sy + 0.008, z + 0.01));
    }
    g.add(b.build(this.mats));
    // the inside light: a cold LED strip down each side, the glow it spills
    for (const sx of [-1, 1]) { const led = new THREE.Mesh(new THREE.BoxGeometry(0.015, FH - 0.5, 0.015), new THREE.MeshBasicMaterial({ color: 0x7ab0c8, toneMapped: false })); led.position.set(x + sx * (FW / 2 - 0.07), FH / 2 + 0.05, FZ - 0.06); led.userData.noGlow = true; g.add(led); }
    this.fridgeGlow.position.set(x, 1.15, FZ - 0.1); g.add(this.fridgeGlow);
    // the rack slots: 5 shelves x 2 rows deep x 7 across
    for (const sy of [1.38, 1.06, 1.7, 0.74, 0.42]) for (let r = 0; r < 2; r++) for (let k = 0; k < 7; k++) this.rackSlots.push(new THREE.Vector3(x - FW / 2 + 0.17 + k * 0.111 + (r ? 0.05 : 0), sy + 0.012, FZ - 0.14 - r * 0.2));
    const mk = (geo: THREE.BufferGeometry, kind: string, color: number, emis: number) => {
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.05, flatShading: true, emissive: new THREE.Color(color).multiplyScalar(emis) });
      const m = new THREE.InstancedMesh(geo, mat, this.rackSlots.length);
      m.count = 0; m.castShadow = false; m.receiveShadow = false; m.frustumCulled = false;
      g.add(m); this.racks.push({ mesh: m, kind });
    };
    const jarG = new THREE.CylinderGeometry(0.04, 0.04, 0.1, 7); jarG.translate(0, 0.05, 0);
    const vialG = new THREE.CylinderGeometry(0.016, 0.016, 0.13, 6); vialG.translate(0, 0.065, 0);
    const tubeG = new THREE.CylinderGeometry(0.012, 0.012, 0.16, 5); tubeG.translate(0, 0.08, 0);
    const boxG = new THREE.BoxGeometry(0.09, 0.03, 0.07); boxG.translate(0, 0.015, 0);
    mk(jarG, 'tissue', 0xd85a6a, 0.3); mk(vialG, 'fluid', 0x3ad888, 0.5); mk(tubeG, 'spores', 0xe8d050, 0.4); mk(boxG, 'residue', 0xa87aff, 0.55);
    // caps on every vial and jar: one more instanced draw, matched to the racks each refresh
    const capG = new THREE.CylinderGeometry(0.02, 0.02, 0.02, 6);
    this.caps = new THREE.InstancedMesh(capG, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, flatShading: true }), this.rackSlots.length);
    this.caps.count = 0; this.caps.frustumCulled = false; g.add(this.caps);
    // the glass door: a frame and a pane, hinged at the left edge
    const db = new FacetBuilder();
    db.add('enamel', extrude([[0, 0.14], [FW, 0.14], [FW, FH - 0.04], [0, FH - 0.04]], 0.04, 0.006, [[[0.06, 0.2], [FW - 0.06, 0.2], [FW - 0.06, FH - 0.1], [0.06, FH - 0.1]]]), 0xe8ece6);
    db.add('chrome', cbox(0.03, 0.6, 0.04, 0.008), 0xffffff, at(FW - 0.08, 1.1, 0.05));
    this.fridgeDoor.add(db.build(this.mats));
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(FW - 0.12, FH - 0.3), new THREE.MeshBasicMaterial({ color: 0x8ab8c8, transparent: true, opacity: 0.09, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
    pane.position.set(FW / 2, FH / 2 + 0.05, 0.02); pane.userData.noGlow = true;
    this.fridgeDoor.add(pane);
    this.fridgeDoor.position.set(x - FW / 2, 0, FZ + 0.004);
    g.add(this.fridgeDoor);
    const lab = plate(this.mats, ['SAMPLE COLD STORE', 'BIOHAZARD · SEALED'], 0.44, 0.12, { bg: 0x7ab8d8, ink: 0x0a1a24 });
    lab.position.set(x - 0.15, 1.98, FZ + 0.05); g.add(lab);
    this.leds.add([x + 0.2, 1.98, FZ + 0.05], 0x40ff60, { size: 0.01, pattern: blink(0.5, 0.9) });
    const sheet = paper(['TEMP LOG', '~', '~', '~', '~'], 0.18, 0.24, { seed: 41, rule: true });
    sheet.position.set(x + FW / 2 + 0.005, 1.5, z); sheet.rotation.y = Math.PI / 2; g.add(sheet);
    this.hots.push({ key: 'fridge', objs: [this.fridgeDoor, ...this.racks.map((r) => r.mesh)], label: 'Sample fridge', sub: 'pick a sample · process it at the benches', press: () => { this.doorT = 1; uiSound('creak', 0.6); this.onPanel?.('fridge'); } });
    return g;
  }
  private fillFridge() {
    const s = bank();
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), sc2 = new THREE.Vector3(), cc = new THREE.Color();
    for (const r of this.racks) r.mesh.count = 0;
    if (this.caps) this.caps.count = 0;
    s.slice(0, this.rackSlots.length).forEach((smp, i) => {
      const r = this.racks.find((q2) => q2.kind === smp.kind) ?? this.racks[0];
      const p = this.rackSlots[i];
      q.setFromAxisAngle(this.v.set(0, 1, 0), (smp.id * 1.7) % 6.28);
      sc.setScalar(0.9 + smp.q * 0.2);
      m.compose(p, q, sc);
      r.mesh.setMatrixAt(r.mesh.count++, m);
      // a cap on the jars and vials, colour-coded by kind
      if (smp.kind !== 'residue' && this.caps) {
        const top = { tissue: 0.1, fluid: 0.13, spores: 0.16 }[smp.kind] * sc.x;
        m.compose(this.v.copy(p).setY(p.y + top + 0.008), q, sc2.set(smp.kind === 'tissue' ? 2.1 : smp.kind === 'fluid' ? 0.9 : 0.65, 0.8, smp.kind === 'tissue' ? 2.1 : smp.kind === 'fluid' ? 0.9 : 0.65));
        this.caps.setMatrixAt(this.caps.count, m);
        this.caps.setColorAt(this.caps.count++, cc.setHex(smp.kind === 'tissue' ? 0x2a6ac8 : smp.kind === 'fluid' ? 0xc8302a : 0xe8c228));
      }
    });
    for (const r of this.racks) { r.mesh.instanceMatrix.needsUpdate = true; r.mesh.computeBoundingSphere(); }
    if (this.caps) { this.caps.instanceMatrix.needsUpdate = true; if (this.caps.instanceColor) this.caps.instanceColor.needsUpdate = true; }
  }

  // ================================================================== the fume hood
  private hood(): THREE.Group {
    const g = new THREE.Group();
    const b = new FacetBuilder();
    const { x, z } = HOOD;
    // a base cabinet, the work surface, the hood's box with its sash, the duct up into the ceiling
    b.add('paint', cbox(0.8, 0.86, 1.3, 0.012), 0x6e7a6a, at(x, 0.43, z), { rep: 0.5 });
    b.add('bakelite', cbox(0.84, 0.05, 1.36, 0.01), 0x262826, at(x, 0.885, z));
    b.add('enamel', cbox(0.8, 0.08, 1.36, 0.01), 0xd8dcd4, at(x, 2.06, z));
    for (const dz of [-0.66, 0.66]) b.add('enamel', cbox(0.8, 1.14, 0.04, 0.008), 0xd8dcd4, at(x, 1.47, z + dz));
    b.add('enamel', cbox(0.04, 1.14, 1.36, 0.008), 0xc8ccc4, at(x - 0.38, 1.47, z));
    b.add('chrome', cbox(0.03, 0.04, 1.24, 0.008), 0xffffff, at(x + 0.4, 1.32, z));
    b.add('metal', prism(0.16, H - 2.1, 8), 0x9aa09a, at(x - 0.1, (H + 2.1) / 2, z), { rep: 0.4 });
    b.add('hazard', cbox(0.02, 0.05, 1.3, 0.004), 0xffffff, at(x + 0.41, 2.0, z), { rep: 0.2 });
    // the specimen tray inside: a steel tray, a few beakers, a ring stand
    b.add('chrome', cbox(0.42, 0.03, 0.56, 0.006), 0xb8bcbc, at(x + 0.02, 0.925, z - 0.18));
    for (const [dx, dz, r] of [[0.15, 0.3, 0.04], [0.05, 0.42, 0.03], [-0.15, 0.36, 0.05]] as [number, number, number][]) b.add('chrome', lathe([[0, 0], [r, 0], [r * 1.02, r * 2.4], [r * 1.12, r * 2.5], [0, r * 2.5]], 7), 0x9aaeb0, at(x + dx, 0.91, z + dz));
    b.add('metal', prism(0.006, 0.5, 5), C.steel, at(x - 0.2, 1.16, z + 0.12));
    b.add('metal', cbox(0.16, 0.012, 0.12, 0.003), C.dark, at(x - 0.2, 0.915, z + 0.12));
    b.add('chrome', band2(0.04), 0xb8bcbc, at(x - 0.14, 1.25, z + 0.12));
    g.add(b.build(this.mats));
    // the sash glass and the hood's own lamp
    const sash = new THREE.Mesh(new THREE.PlaneGeometry(1.24, 0.6), new THREE.MeshBasicMaterial({ color: 0x9ac8c8, transparent: true, opacity: 0.08, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    sash.rotation.y = Math.PI / 2; sash.position.set(x + 0.41, 1.66, z); sash.userData.noGlow = true; g.add(sash);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 1.1), new THREE.MeshBasicMaterial({ color: 0xe8fff0, toneMapped: false })); lamp.position.set(x - 0.05, 2.0, z); lamp.userData.noGlow = true; g.add(lamp);
    const pool = glowCard(0.7, 1.2, 0xd8ffe8, 0.14); pool.rotation.x = -Math.PI / 2; pool.position.set(x, 0.915, z); g.add(pool);
    // a specimen in the tray: something pale and folded under a watch glass
    const sp = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 1), new THREE.MeshStandardMaterial({ color: 0xd8a8a0, roughness: 0.6, flatShading: true }));
    sp.scale.set(1.4, 0.45, 1); sp.position.set(x + 0.02, 0.955, z - 0.2); g.add(sp);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xa8d8e8, transparent: true, opacity: 0.12, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
    dome.position.set(x + 0.02, 0.94, z - 0.2); dome.userData.noGlow = true; g.add(dome);
    const lab = plate(this.mats, ['FUME HOOD 2', 'SASH BELOW LINE'], 0.36, 0.1, { bg: 0xe8e2d0 });
    lab.position.set(x + 0.42, 2.06, z - 0.3); lab.rotation.y = Math.PI / 2; g.add(lab);
    // the red alarm handle on the side
    const ab = new FacetBuilder();
    ab.add('paint', cbox(0.03, 0.18, 0.12, 0.008), 0xc82a1a, at(0, 0, 0));
    ab.add('chrome', cbox(0.05, 0.03, 0.03, 0.006), 0xffffff, at(0.03, -0.04, 0));
    this.alarm.add(ab.build(this.mats));
    this.alarm.position.set(x + 0.42, 1.25, z + 0.78);
    g.add(this.alarm);
    this.alarmLed = this.leds.add([x + 0.43, 1.4, z + 0.78], 0xff2a1a, { size: 0.014, level: 0 });
    const al = plate(this.mats, ['HOOD ALARM'], 0.16, 0.05, { bg: 0xc82a1a, ink: 0xfff0e0, px: 520 });
    al.position.set(x + 0.43, 1.46, z + 0.78); al.rotation.y = Math.PI / 2; g.add(al);
    this.hots.push({ key: 'alarm', objs: [this.alarm], label: 'Hood alarm', sub: 'for emergencies only', press: () => { this.alarmT = 2.5; uiSound('klaxon', 0.5); menuEvent('alarm'); } });
    this.hots.push({ key: 'hood', objs: [sash], glow: [], label: 'Fume hood', sub: 'the specimen tray · process a sample', press: () => this.onPanel?.('fridge') });
    return g;
  }

  // ================================================================== the microscope bench
  private scopeBench(): THREE.Group {
    const g = new THREE.Group();
    const b = new FacetBuilder(), b2 = new FacetBuilder();
    const x = 0, y = SCOPE.y, z = 0;
    g.position.set(SCOPE.x, 0, SCOPE.z); g.rotation.y = Math.PI / 2;
    b.add('bakelite', cbox(1.6, 0.05, 0.66, 0.01), 0x262826, at(x, y - 0.025, z), { grain: 'x' });
    b.add('paint', cbox(1.54, 0.86, 0.6, 0.012), 0x6e7a6a, at(x, 0.43, z), { rep: 0.5 });
    for (let i = 0; i < 3; i++) { b.add('metal', cbox(0.5, 0.01, 0.6, 0.004), C.darker, at(x - 0.5 + i * 0.5, 0.6, z + 0.002)); b.add('chrome', cbox(0.12, 0.02, 0.02, 0.005), 0xffffff, at(x - 0.5 + i * 0.5, 0.66, z + 0.31)); }
    // the microscope: a heavy cream base, the arm, the head with twin eyepieces, the stage, two objectives
    const M = (m: THREE.Matrix4) => at(x + 0.05, y, z).multiply(m);
    b.add('enamel', cbox(0.2, 0.04, 0.24, 0.01), 0xe8e2d0, M(at(0, 0.02, 0)));
    b.add('enamel', hull([[-0.035, 0.04, -0.1], [0.035, 0.04, -0.1], [-0.035, 0.04, -0.04], [0.035, 0.04, -0.04], [-0.03, 0.34, -0.06], [0.03, 0.34, -0.06], [-0.03, 0.3, 0.02], [0.03, 0.3, 0.02]]), 0xe8e2d0, M(at(0, 0, 0)));
    b.add('metal', cbox(0.14, 0.012, 0.12, 0.004), 0x2a2a2a, M(at(0, 0.16, 0.02)));
    b.add('enamel', cbox(0.08, 0.06, 0.12, 0.012), 0xe8e2d0, M(at(0, 0.36, 0.0)));
    for (const s of [-1, 1]) b.add('metal', prism(0.012, 0.1, 6), 0x2a2a2a, M(at(s * 0.022, 0.42, 0.05, -0.6)));
    for (const s of [-1, 1]) b.add('chrome', prism(0.01, 0.06, 6), 0xffffff, M(at(s * 0.02, 0.28, 0.04)));
    for (const s of [-1, 1]) b.add('metal', lathe([[0, -0.012], [0.026, -0.012], [0.026, 0.012], [0, 0.012]], 8), 0x3a3a3a, M(at(s * 0.045, 0.21, -0.07, 0, 0, Math.PI / 2)));
    // slide boxes, a rack of slides, a notebook, a mug
    for (let i = 0; i < 3; i++) b.add('paint', cbox(0.14, 0.035, 0.09, 0.006), [0x2a4a8a, 0xc8302a, 0x2a6a4a][i], at(x - 0.55, y + 0.018 + i * 0.036, z + 0.08, 0, 0.1 * i));
    for (let i = 0; i < 8; i++) b.add('chrome', cbox(0.002, 0.026, 0.075, 0.001), 0xe8f4f4, at(x - 0.3 + i * 0.012, y + 0.014, z + 0.18));
    b.add('enamel', lathe([[0, 0], [0.04, 0], [0.042, 0.09], [0, 0.09]], 8), 0xe8e2d0, at(x + 0.6, y, z + 0.18));
    // the gooseneck desk lamp
    b.add('metal', lathe([[0, 0], [0.08, 0], [0.07, 0.02], [0, 0.03]], 8), 0x2a2a2a, at(x + 0.45, y, z - 0.18));
    b.add('metal', tube([[x + 0.45, y + 0.02, z - 0.18], [x + 0.42, y + 0.3, z - 0.2], [x + 0.32, y + 0.45, z - 0.08], [x + 0.2, y + 0.42, z + 0.02]], 0.008, 10, 4), 0x2a2a2a);
    g.add(b.build(this.mats));
    const lb = new FacetBuilder();
    lb.add('paint', lathe([[0, 0.05], [0.03, 0.05], [0.07, -0.02], [0.072, -0.03], [0, -0.03]], 8), 0x2a6a4a);
    this.lampHead.add(lb.build(this.mats, { cast: false }));
    const bulb = new THREE.Mesh(new THREE.CircleGeometry(0.06, 8), new THREE.MeshBasicMaterial({ color: 0xfff0c8, toneMapped: false })); bulb.rotation.x = Math.PI / 2; bulb.position.y = -0.031; bulb.userData.noGlow = true;
    this.lampHead.add(bulb);
    this.lampHead.position.set(x + 0.2, y + 0.42, z + 0.02); this.lampHead.rotation.set(0.5, 0, 0.6);
    g.add(this.lampHead);
    this.desk.position.set(x + 0.16, y + 0.3, z + 0.06); g.add(this.desk);
    const pool = glowCard(1.0, 0.7, 0xffc078, 0.3); pool.rotation.x = -Math.PI / 2; pool.position.set(x + 0.05, y + 0.003, z + 0.05); g.add(pool);
    const note = paper(['SLIDES', '~', '~'], 0.16, 0.12, { seed: 61 }); note.rotation.x = -Math.PI / 2; note.position.set(x - 0.15, y + 0.004, z + 0.2); note.rotation.z = 0.2; g.add(note);
    const lab = plate(this.mats, ['MICROSCOPY'], 0.32, 0.07, { bg: 0xc8c0a0 });
    lab.position.set(x, 1.5, -0.4 + 0.012); g.add(lab);
    for (let i = 0; i < 9; i++) b2.add('paint', cbox(0.05, 0.26 + (i % 3) * 0.02, 0.22, 0.006), [0x2a4a8a, 0x8a2a2a, 0x2a6a4a, 0xc8a030, 0x5a3a7a][i % 5], at(x + 0.35 + i * 0.052, y + 0.13 + (i % 3) * 0.01, z - 0.18, 0, 0, i === 8 ? -0.3 : 0));
    g.add(b2.build(this.mats));
    this.hots.push({ key: 'scope', objs: [g], glow: [], label: 'Microscope bench', sub: 'process a sample', press: () => this.onPanel?.('fridge') });
    return g;
  }

  // ================================================================== the dissection table, its lamp
  private table(): THREE.Group {
    const g = new THREE.Group();
    const b = new FacetBuilder();
    const { x, y, z } = TABLE;
    b.add('metal', cbox(0.8, 0.05, 1.8, 0.012), 0x7a8284, at(x, y, z), { rep: 0.6 });
    b.add('metal', extrude([[-0.42, -0.92], [0.42, -0.92], [0.42, 0.92], [-0.42, 0.92]], 0.04, 0.006, [[[-0.38, -0.88], [0.38, -0.88], [0.38, 0.88], [-0.38, 0.88]]]), 0x8a9294, at(x, y + 0.03, z, Math.PI / 2));
    b.add('metal', prism(0.09, y - 0.1, 8), C.dark, at(x, (y - 0.1) / 2, z));
    b.add('metal', cbox(0.6, 0.06, 0.8, 0.02), C.darker, at(x, 0.03, z));
    // the dissection tray (wax-bottomed), pins, a towel, the instrument tray on its stand
    b.add('metal', cbox(0.5, 0.04, 0.62, 0.008), 0x8a9294, at(x, y + 0.045, z - 0.2));
    b.add('rubber', cbox(0.44, 0.012, 0.56, 0.004), 0x2a2a2a, at(x, y + 0.062, z - 0.2));
    b.add('sponge', cbox(0.3, 0.02, 0.24, 0.01), 0x6a9ab8, at(x + 0.15, y + 0.035, z + 0.55, 0, 0.2));
    b.add('chrome', cbox(0.5, 0.02, 0.32, 0.006), 0xa8a8a8, at(x + 0.78, 1.02, z + 0.3));
    b.add('metal', prism(0.016, 1.02, 6), C.steel, at(x + 0.78, 0.51, z + 0.3));
    for (let i = 0; i < 6; i++) b.add('chrome', cbox(0.16, 0.008, 0.012, 0.003), 0xffffff, at(x + 0.75, 1.035, z + 0.18 + i * 0.045, 0, 0.2 * (i - 2)));
    g.add(b.build(this.mats));
    // the specimen on the tray: a pale pinned thing, its flap
    const sp = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 1), new THREE.MeshStandardMaterial({ color: 0xd89a90, roughness: 0.55, flatShading: true }));
    sp.scale.set(1.2, 0.3, 2.0); sp.position.set(x, y + 0.085, z - 0.2); sp.castShadow = true; g.add(sp);
    this.trayProps.push(sp);
    for (const [dx, dz] of [[-0.12, -0.36], [0.12, -0.36], [-0.12, -0.02], [0.12, -0.02]]) { const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.05, 4), new THREE.MeshStandardMaterial({ color: 0xd8d8d8, metalness: 0.7, roughness: 0.3 })); pin.position.set(x + dx, y + 0.09, z + dz); g.add(pin); const head = new THREE.Mesh(new THREE.SphereGeometry(0.006, 5, 3), new THREE.MeshStandardMaterial({ color: 0xc8302a })); head.position.set(x + dx, y + 0.115, z + dz); g.add(head); this.trayProps.push(pin, head); }
    // the surgical lamp on its ceiling arm
    const lb = new FacetBuilder();
    lb.add('metal', prism(0.04, 0.5, 8), 0xd8d4c4, at(0, -0.25, 0));
    lb.add('metal', cbox(0.7, 0.05, 0.07, 0.02), 0xd8d4c4, at(0.35, -0.5, 0));
    lb.add('enamel', lathe([[0, 0.07], [0.07, 0.07], [0.22, 0.0], [0.24, -0.04], [0, -0.04]], 10), 0xe0dcd0, at(0.7, -0.62, 0));
    lb.add('chrome', cbox(0.04, 0.14, 0.04, 0.01), 0xffffff, at(0.7, -0.52, 0));
    const arm = new THREE.Group();
    arm.add(lb.build(this.mats));
    const gl = new THREE.Mesh(lathe([[0, -0.04], [0.22, -0.04], [0, -0.042]], 10), this.surgMat); gl.position.set(0.7, -0.62, 0); gl.userData.noGlow = true; arm.add(gl);
    arm.position.set(x - 0.7, H, z - 0.2);
    this.surg.position.set(0.7, -0.68, 0); this.surg.target.position.set(0.7, -3, 0.02);
    this.surg.castShadow = true; this.surg.shadow.mapSize.set(1024, 1024); this.surg.shadow.camera.near = 0.1; this.surg.shadow.camera.far = 3.5; this.surg.shadow.bias = -0.0008; this.surg.shadow.normalBias = 0.012;
    arm.add(this.surg, this.surg.target);
    g.add(arm);
    const pool = glowCard(1.5, 1.5, 0xffe8c8, 0.16); pool.rotation.x = -Math.PI / 2; pool.position.set(x, 0.006, z - 0.2); pool.name = 'surgPool'; g.add(pool);
    this.hots.push({ key: 'table', objs: [sp], label: 'Dissection table', sub: 'process a sample', press: () => this.onPanel?.('fridge') });
    this.hots.push({ key: 'lamp', objs: [arm], label: 'Surgical lamp', sub: 'switch it', press: () => { this.surgOn = this.surgOn ? 0 : 1; uiSound('click', 1); } });
    return g;
  }

  // ================================================================== the centrifuge bench
  private centrifuge(): THREE.Group {
    const g = new THREE.Group();
    const b = new FacetBuilder();
    const { x, y, z } = CENTRI;
    b.add('bakelite', cbox(0.7, 0.05, 2.0, 0.01), 0x262826, at(x, y - 0.025, z), { grain: 'z' });
    b.add('paint', cbox(0.64, 0.86, 1.94, 0.012), 0x6e7a6a, at(x, 0.43, z), { rep: 0.5 });
    for (let i = 0; i < 3; i++) b.add('chrome', cbox(0.02, 0.1, 0.02, 0.005), 0xffffff, at(x - 0.33, 0.66, z - 0.6 + i * 0.6));
    // the centrifuge: a cream drum with a lid, its panel
    b.add('enamel', lathe([[0, 0], [0.2, 0], [0.21, 0.04], [0.21, 0.2], [0.18, 0.24], [0, 0.24]], 10), 0xe0dccc, at(x, y, z - 0.35));
    b.add('metal', cbox(0.14, 0.08, 0.02, 0.006), 0x2a2e2c, at(x - 0.18, y + 0.1, z - 0.35, 0, -Math.PI / 2));
    // pipettes in a rack, reagent bottles, a beaker of something
    b.add('metal', cbox(0.08, 0.04, 0.3, 0.006), C.dark, at(x + 0.05, y + 0.02, z + 0.3));
    for (let i = 0; i < 5; i++) b.add('chrome', prism(0.004, 0.22, 5), 0xd8e8e8, at(x + 0.05, y + 0.13, z + 0.18 + i * 0.06));
    for (let i = 0; i < 4; i++) b.add('glass', lathe([[0, 0], [0.035, 0], [0.035, 0.1], [0.014, 0.13], [0.014, 0.16], [0, 0.16]], 7), [0x8a5a2a, 0x2a6a4a, 0xd8d8c8, 0x2a2a6a][i], at(x + 0.12, y, z + 0.6 + i * 0.09));
    g.add(b.build(this.mats));
    // the rotor under the lid (spins)
    const rb = new FacetBuilder();
    rb.add('chrome', lathe([[0, 0], [0.17, 0], [0.17, 0.015], [0, 0.02]], 10), 0xb0b0b0);
    for (let i = 0; i < 6; i++) rb.add('chrome', prism(0.018, 0.05, 5), 0x9aa8a8, at(Math.cos(i * 1.047) * 0.11, 0.02, Math.sin(i * 1.047) * 0.11));
    this.rotor.add(rb.build(this.mats, { cast: false }));
    this.rotor.position.set(x, y + 0.245, z - 0.35);
    g.add(this.rotor);
    for (let i = 0; i < 3; i++) this.leds.add([x - 0.195, y + 0.11, z - 0.39 + i * 0.03], [0x40ff60, 0xffb030, 0xff3a20][i], { size: 0.008, pattern: busy(i + 5, 3), facing: new THREE.Euler(0, -Math.PI / 2, 0) });
    // the jar you must not tap: a big specimen jar with something curled up in it
    const jb = new FacetBuilder();
    jb.add('metal', lathe([[0, 0], [0.1, 0], [0.1, 0.03], [0, 0.03]], 10), 0x5a5e5a);
    jb.add('metal', lathe([[0, 0.34], [0.1, 0.34], [0.1, 0.38], [0, 0.38]], 10), 0x5a5e5a);
    this.jar.add(jb.build(this.mats));
    const fluid = new THREE.Mesh(lathe([[0, 0.03], [0.092, 0.03], [0.092, 0.32], [0, 0.32]], 10), new THREE.MeshBasicMaterial({ color: 0xc8a040, transparent: true, opacity: 0.45, depthWrite: false, toneMapped: false })); fluid.userData.noGlow = true; fluid.renderOrder = 3; this.jar.add(fluid);
    const thing = new THREE.Mesh(new THREE.TorusKnotGeometry(0.04, 0.018, 24, 5, 2, 3), new THREE.MeshStandardMaterial({ color: 0xd8c0a8, roughness: 0.6, flatShading: true })); thing.position.y = 0.18; thing.name = 'thing'; this.jar.add(thing);
    const jg = new THREE.Mesh(lathe([[0.1, 0.03], [0.1, 0.34]], 10), new THREE.MeshBasicMaterial({ color: 0x5a7a6a, transparent: true, opacity: 0.12, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); jg.userData.noGlow = true; jg.renderOrder = 4; this.jar.add(jg);
    this.jar.position.set(x + 0.08, y, z + 0.0);
    g.add(this.jar);
    const sign = paper(['DO NOT', 'TAP'], 0.09, 0.07, { seed: 71, ppm: 500, stamp: '!' });
    sign.position.set(x - 0.03, y + 0.2, z + 0.0); sign.rotation.y = -Math.PI / 2; g.add(sign);
    const lab = plate(this.mats, ['CENTRIFUGE · PIPETTES'], 0.5, 0.07, { bg: 0xc8c0a0, px: 480 });
    lab.position.set(W - 0.012, 1.07, z + 0.3); lab.rotation.y = -Math.PI / 2; g.add(lab);
    this.hots.push({ key: 'jar', objs: [this.jar], label: 'Specimen jar', sub: 'do not tap', press: () => { this.jarW.kick(5); uiSound('tink', 0.8); if (++this.jarTaps >= 6) { this.jarTaps = 0; uiSound('slam', 0.7); menuEvent('slam'); } } });
    this.hots.push({ key: 'centrifuge', objs: [this.rotor], label: 'Centrifuge', sub: 'process a sample', press: () => { this.rotorV = 22; uiSound('grind', 0.6); } });
    return g;
  }

  // ================================================================== the sequencer rig
  private sequencer(): THREE.Group {
    const g = new THREE.Group();
    const b = new FacetBuilder();
    const { x, z } = SEQ;
    // two tape cabinets and a console desk with two CRTs
    for (const dx of [0.55, 1.1]) {
      b.add('paint', cbox(0.52, 1.95, 0.6, 0.02), 0xc8c0a8, at(x + dx, 0.975, z), { rep: 0.4 });
      b.add('rubber', cbox(0.44, 0.62, 0.02, 0.006), 0x0e0e0e, at(x + dx, 1.42, z + 0.3));
      b.add('metal', cbox(0.44, 0.3, 0.02, 0.006), 0x3a3e3a, at(x + dx, 0.86, z + 0.3));
    }
    b.add('paint', cbox(0.9, 0.74, 0.6, 0.015), 0x5a6a5a, at(x - 0.25, 0.37, z + 0.02), { rep: 0.5 });
    b.add('bakelite', cbox(0.96, 0.04, 0.66, 0.01), 0x262826, at(x - 0.25, 0.76, z + 0.02));
    const spots = [crtSet(b, x - 0.48, 1.06, z + 0.0, 0.42, 0.32, { color: C.beige, depth: 0.36, seed: 3 }), crtSet(b, x - 0.02, 1.06, z + 0.0, 0.42, 0.32, { color: 0xc8c0a0, depth: 0.36, seed: 5 })];
    // the keyboard, the printout spilling to the floor
    b.add('paint', cbox(0.4, 0.03, 0.14, 0.006), 0xd8d0b8, at(x - 0.3, 0.795, z + 0.24, -0.1));
    for (let i = 0; i < 24; i++) b.add('paint', cbox(0.022, 0.012, 0.022, 0.004), 0x8a8478, at(x - 0.46 + (i % 12) * 0.028, 0.815, z + 0.21 + Math.floor(i / 12) * 0.035, -0.1));
    b.add('enamel', cbox(0.3, 0.003, 0.5, 0.001), 0xf2f0e4, at(x + 0.2, 0.765, z + 0.25));
    b.add('enamel', hull([[x + 0.05, 0.76, z + 0.5], [x + 0.35, 0.76, z + 0.5], [x + 0.05, 0.0, z + 0.7], [x + 0.35, 0.0, z + 0.7], [x + 0.05, 0.002, z + 1.0], [x + 0.35, 0.002, z + 1.0]]), 0xf2f0e4);
    b.add('rubber', tube([[x - 0.48, 1.06, z - 0.36], [x - 0.6, 0.6, z - 0.3], [x - 0.7, 0.02, z - 0.1], [x - 1.0, 0.02, z + 0.2]], 0.014, 10, 4), 0x1a1a1a);
    g.add(b.build(this.mats));
    // the readout screens: codex numbers, and a scrolling base read
    spots.forEach((sp, i) => {
      // 3x the old 96 x 72 (the bench games draw their own art at this density: researchBench.ts drawSeq)
      const cv = document.createElement('canvas'); cv.width = 288; cv.height = 216;
      const ctx = cv.getContext('2d')!;
      const tex = new THREE.CanvasTexture(cv); tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(sp.sw, sp.sh), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
      m.applyMatrix4(sp.m); m.translateZ(0.004); m.userData.noGlow = true;
      g.add(m);
      this.readouts.push({ cv, ctx, tex, every: i ? 0.12 : 1, acc: 9, draw: i ? drawBases : drawStats });
    });
    this.screenGlow.position.set(x - 0.25, 1.1, z + 0.55); g.add(this.screenGlow);
    // the reels
    for (const dx of [0.55, 1.1]) for (const dy of [-0.14, 0.14]) {
      const rb = new FacetBuilder();
      rb.add('chrome', extrude([[0, 0.12], [0.104, 0.06], [0.104, -0.06], [0, -0.12], [-0.104, -0.06], [-0.104, 0.06]], 0.012, 0.002, [[[0, 0.035], [0.03, 0.017], [0.03, -0.017], [0, -0.035], [-0.03, -0.017], [-0.03, 0.017]]]), 0xb8b8b8);
      rb.add('rubber', prism(0.08, 0.008, 12), 0x3a2a1a, at(0, 0, -0.004, Math.PI / 2));
      const r = rb.build(this.mats, { cast: false });
      r.position.set(x + dx + dy * 0.0, 1.42 + dy, z + 0.31);
      g.add(r); this.reels.push(r);
    }
    for (let r = 0; r < 4; r++) for (let i = 0; i < 7; i++) this.leds.add([x + 0.36 + i * 0.12, 0.82 + r * 0.055, z + 0.315], [0xff3a20, 0xffb030, 0x40ff60][(i + r) % 3], { size: 0.01, pattern: (i + r) % 2 ? busy(i + r * 8, 4) : blink(0.5 + i * 0.1, 0.5, r * 0.25) });
    const lab = plate(this.mats, ['SEQUENCER · ANALYSIS'], 0.5, 0.08, { bg: 0xc8c0a0, px: 480 });
    lab.position.set(x - 0.25, 1.42, BACK + 0.012); g.add(lab);
    this.hots.push({ key: 'seq', objs: [g], glow: [], label: 'Sequencer', sub: 'the codex in numbers · process a sample', press: () => { this.reelV = 14; uiSound('servo', 0.7); this.onPanel?.('fridge'); } });
    return g;
  }

  // ================================================================== the requisition pegboard
  private pegboard(): THREE.Group {
    const g = new THREE.Group();
    const b = new FacetBuilder();
    const { x, y, z } = PEG;
    b.add('wood', cbox(0.02, 1.0, 1.3, 0.004), 0xb89a6a, at(x - 0.01, y, z));
    for (let r = 0; r < 9; r++) for (let k = 0; k < 12; k++) b.add('metal', cbox(0.004, 0.012, 0.012, 0.002), 0x3a2a1a, at(x - 0.021, y - 0.44 + r * 0.11, z - 0.6 + k * 0.11));
    b.add('metal', cbox(0.06, 0.04, 1.36, 0.008), C.dark, at(x - 0.04, y - 0.52, z));
    b.add('paint', cbox(0.5, 0.95, 1.3, 0.015), 0x6a7a8a, at(x - 0.26, 0.475, z), { rep: 0.5 });
    for (let i = 0; i < 2; i++) b.add('chrome', cbox(0.02, 0.1, 0.02, 0.005), 0xffffff, at(x - 0.52, 0.7, z - 0.3 + i * 0.6));
    g.add(b.build(this.mats));
    const lab = plate(this.mats, ['REQUISITION', 'RESEARCH ISSUE'], 0.42, 0.11, { bg: 0xe8c228, ink: 0x1a1208 });
    lab.position.set(x - 0.03, y + 0.6, z); lab.rotation.y = -Math.PI / 2; g.add(lab);
    this.peg.position.set(x - 0.05, y, z);
    g.add(this.peg);
    this.hots.push({ key: 'req', objs: [g], glow: [], label: 'Requisition', sub: 'the tools you have earned · pick your kit', press: () => this.focus('req', () => this.onPanel?.('req')) });
    return g;
  }
  private hangTools() {
    // dispose the last hanging (plates carry their own canvas textures)
    this.peg.traverse((o) => { const m = o as THREE.Mesh; if (!m.isMesh) return; m.geometry.dispose(); const mm = m.material as THREE.Material & { map?: THREE.Texture | null }; mm.map?.dispose(); mm.dispose(); });
    this.peg.clear(); this.pegTools.clear();
    const picked = req();
    TOOL_KEYS.forEach((k, i) => {
      const t = TOOLS[k], lvl = toolLevel(k);
      const z = -0.48 + (i % 4) * 0.32, y = i < 4 ? 0.22 : -0.2;
      const o = new THREE.Group();
      o.position.set(0, y, z);
      if (lvl > 0) {
        const m = toolMesh(k, t.color);
        o.add(m);
        if (picked.includes(k)) { const tag = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.04, 0.08), new THREE.MeshBasicMaterial({ color: 0x3aff8a, toneMapped: false })); tag.position.set(-0.01, -0.13, 0); o.add(tag); }
      } else {
        // a painted outline where the tool will hang
        const out = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.18), new THREE.MeshBasicMaterial({ color: 0x2a2018, transparent: true, opacity: 0.55 }));
        out.rotation.y = -Math.PI / 2; out.position.x = -0.006; o.add(out);
      }
      const card = plate(this.mats, [lvl ? `${t.name.toUpperCase()}${lvl > 1 ? ' ×' + lvl : ''}` : '???'], 0.26, 0.04, { bg: lvl ? 0xf2f0e4 : 0x8a8478, px: 520 });
      card.rotation.y = -Math.PI / 2; card.position.set(-0.01, -0.13, 0.06); o.add(card);
      this.peg.add(o); this.pegTools.set(k, o);
    });
  }

  // ================================================================== bits and pieces
  private clutter(): THREE.Group {
    const g = new THREE.Group();
    const b = new FacetBuilder();
    // a trolley of glassware by the table, a gas bottle chained to the wall, a bin, a stool, the clipboard
    b.add('metal', cbox(0.5, 0.02, 0.4, 0.006), C.steel, at(-0.9, 0.82, 0.2));
    b.add('metal', cbox(0.5, 0.02, 0.4, 0.006), C.steel, at(-0.9, 0.3, 0.2));
    for (const [dx, dz] of [[-0.23, -0.18], [0.23, -0.18], [-0.23, 0.18], [0.23, 0.18]]) b.add('metal', prism(0.01, 0.82, 5), C.steel, at(-0.9 + dx, 0.41, 0.2 + dz));
    for (let i = 0; i < 5; i++) b.add('glass', lathe([[0, 0], [0.03, 0], [0.03, 0.08], [0.012, 0.11], [0.012, 0.14], [0, 0.14]], 7), [0x6ad8a0, 0xd8a040, 0x8ac8f0, 0xe86a5a, 0xc8c8b8][i], at(-1.08 + i * 0.09, 0.83, 0.15 + (i % 2) * 0.1));
    b.add('paint', prism(0.12, 1.3, 8), 0x2a5a3a, at(W - 0.25, 0.65, BACK + 0.8), { rep: 0.4 });
    b.add('chrome', prism(0.03, 0.12, 6), 0xffffff, at(W - 0.25, 1.36, BACK + 0.8));
    b.add('metal', band2(0.13), C.dark, at(W - 0.25, 1.0, BACK + 0.8));
    b.add('paint', lathe([[0, 0], [0.16, 0], [0.19, 0.5], [0, 0.5]], 8), 0xc8302a, at(-0.55, 0, BACK + 0.4));
    b.add('hazard', lathe([[0.19, 0.42], [0.195, 0.48]], 8), 0xffffff, at(-0.55, 0, BACK + 0.4), { rep: 0.2 });
    b.add('leather', lathe([[0, 0.6], [0.17, 0.6], [0.17, 0.66], [0, 0.68]], 8), 0x3a2a2a, at(-1.3, 0, -1.9));
    b.add('metal', prism(0.02, 0.6, 6), C.steel, at(-1.3, 0.3, -1.9));
    b.add('metal', lathe([[0, 0], [0.22, 0], [0.2, 0.03], [0, 0.03]], 6), C.dark, at(-1.3, 0, -1.9));
    // the clipboard terminal on a wall shelf by the door
    b.add('wood', cbox(0.5, 0.03, 0.26, 0.006), 0x8a6a48, at(-W + 0.16, 1.2, 2.1, 0, Math.PI / 2));
    b.add('paint', cbox(0.3, 0.22, 0.24, 0.015), 0xc8c0a8, at(-W + 0.18, 1.33, 2.0));
    g.add(b.build(this.mats));
    const clip = paper(['MERIDIAN FILE', '~', '~', '~'], 0.22, 0.3, { seed: 91, stamp: 'R-1' });
    clip.position.set(-W + 0.02, 1.62, 2.4); clip.rotation.y = Math.PI / 2; g.add(clip);
    const cs = paper(['CODEX', 'AUDIT', '~', '~'], 0.22, 0.3, { seed: 93, rule: true });
    cs.position.set(-W + 0.02, 1.62, 1.95); cs.rotation.y = Math.PI / 2; g.add(cs);
    this.hots.push({ key: 'file', objs: [clip], label: 'The Meridian file', sub: 'your record · commendations', press: () => this.onPanel?.('file') });
    return g;
  }

  // ================================================================== the holding chamber behind the window
  /**
   * HOLDING 2: a wet white-tiled chamber behind the observation window. A raised steel grate under a caged lamp,
   * chained down at the corners, and on it the thing the Institute brought back from the Ledge: a gummy bear
   * (creatures/species/gummy_bear.ts, idling, now and then pinching itself in two). A red alarm lamp, a feeding
   * chute, a hose reel, fog on the floor. Loaded lazily; a jelly stand-in until it comes (rooms/vault.ts blob).
   */
  private chamber(): THREE.Group {
    const g = new THREE.Group();
    const b = new FacetBuilder();
    const { x0, x1, z0, z1, h } = CH;
    const cx = CH.px, cz = CH.pz;
    slab(b, 'floor', x0, x1, -0.1, 0, z0, z1, 0x6a7470, 0.004, 0.6);
    slab(b, 'concrete', x0, x1, h, h + 0.1, z0 - 0.1, z1 + 0.1, 0x3a3c3a);
    slab(b, 'tile', x1, x1 + 0.12, 0, h, z0 - 0.1, z1 + 0.1, 0xa8b4b0);
    slab(b, 'tile', x0, x1, 0, h, z0 - 0.12, z0, 0xa8b4b0);
    slab(b, 'tile', x0, x1, 0, h, z1, z1 + 0.12, 0xa8b4b0);
    // the chamber's own near wall where it runs on behind the control room's back corner
    slab(b, 'concrete', x0 - 0.2, x0, 0, h, z0, BACK, 0x8a8c88);
    // a gutter round the floor, the drain
    for (const z of [z0 + 0.08, z1 - 0.08]) b.add('metal', cbox(x1 - x0, 0.01, 0.08, 0.002), 0x3a3e3c, at((x0 + x1) / 2, 0.004, z));
    b.add('metal', extrude([[-0.2, -0.2], [0.2, -0.2], [0.2, 0.2], [-0.2, 0.2]], 0.015, 0.004, [[[-0.16, -0.16], [0.16, -0.16], [0.16, 0.16], [-0.16, 0.16]]]), 0x6a6e6a, at(x1 - 0.5, 0.004, z1 - 0.5, Math.PI / 2));
    // the raised grate: legs, slats, a hazard edge, ring bolts at the corners
    const PY = 0.86, PS = 1.7;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.add('metal', cbox(0.08, PY, 0.08, 0.01), 0x5a6062, at(cx + sx * (PS / 2 - 0.1), PY / 2, cz + sz * (PS / 2 - 0.1)));
    b.add('metal', cbox(PS, 0.06, PS, 0.01), 0x4a5052, at(cx, PY - 0.03, cz));
    for (let i = 0; i < 16; i++) b.add('metal', cbox(PS - 0.06, 0.012, 0.04, 0.003), 0x7a8284, at(cx, PY + 0.006, cz - PS / 2 + 0.06 + i * (PS - 0.12) / 15));
    for (const s of [-1, 1]) { b.add('hazard', cbox(PS + 0.02, 0.07, 0.02, 0.003), 0xffffff, at(cx, PY - 0.03, cz + s * (PS / 2 + 0.01)), { rep: 0.2 }); b.add('hazard', cbox(0.02, 0.07, PS + 0.02, 0.003), 0xffffff, at(cx + s * (PS / 2 + 0.01), PY - 0.03, cz), { rep: 0.2 }); }
    // chains from the floor rings up onto it
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const ax = cx + sx * (PS / 2 + 0.3), az = cz + sz * (PS / 2 + 0.3);
      b.add('metal', bolt(0.04, 0.03), C.steel, at(ax, 0, az));
      b.add('metal', band2(0.03), C.steel, at(ax, 0.04, az));
      const n = 14;
      for (let k = 0; k < n; k++) {
        const f = (k + 0.5) / n, x = ax + (cx + sx * 0.3 - ax) * f, z = az + (cz + sz * 0.25 - az) * f, y = 0.05 + (PY + 0.35 - 0.05) * f - Math.sin(f * Math.PI) * 0.12;
        b.add('metal', ring2(0.022, 0.012), 0x8a8e90, at(x, y, z, k % 2 ? Math.PI / 2 : 0, Math.atan2(cx - ax, cz - az), 0));
      }
    }
    // the caged lamp, the feeding chute through the far wall, a hose reel, slime on the tiles
    b.add('metal', prism(0.006, 0.3, 4), C.dark, at(cx, h - 0.15, cz));
    b.add('enamel', lathe([[0.24, -0.12], [0.2, -0.06], [0.1, -0.01], [0, 0]], 10), 0x3a4a42, at(cx, h - 0.3, cz));
    b.add('lamp', lathe([[0, -0.15], [0.09, -0.13], [0.12, -0.12], [0, -0.12]], 8), 0xe8f4ff, at(cx, h - 0.3, cz));
    b.add('metal', hull([[x1, 2.2, cz - 0.3], [x1, 2.2, cz + 0.3], [x1, 1.7, cz - 0.3], [x1, 1.7, cz + 0.3], [x1 - 0.6, 1.5, cz - 0.22], [x1 - 0.6, 1.5, cz + 0.22], [x1 - 0.6, 1.4, cz - 0.22], [x1 - 0.6, 1.4, cz + 0.22]]), 0x8a9294);
    b.add('hazard', cbox(0.04, 0.5, 0.64, 0.004), 0xffffff, at(x1 - 0.01, 1.95, cz), { rep: 0.2 });
    b.add('paint', prism(0.2, 0.12, 12), 0xc8a028, at(x0 + 0.3, 1.5, z0 + 0.12, Math.PI / 2));
    b.add('rubber', prism(0.17, 0.11, 12), 0x2a2a2a, at(x0 + 0.3, 1.5, z0 + 0.13, Math.PI / 2));
    b.add('rubber', tube([[x0 + 0.42, 1.4, z0 + 0.15], [x0 + 0.7, 0.6, z0 + 0.4], [x0 + 0.9, 0.02, z0 + 0.6], [x0 + 1.4, 0.02, z0 + 0.5]], 0.022, 12, 5), 0x2a2a2a);
    g.add(b.build(this.mats));
    // what it has left: candy-red jelly smeared on the grate and pooled on the floor
    const ja: { o: THREE.Object3D; f: (o: THREE.Object3D, t: number, dt: number) => void }[] = [];
    const jel = new THREE.MeshStandardMaterial({ color: 0xb8301e, roughness: 0.12, metalness: 0, emissive: new THREE.Color(0x601408), transparent: true, opacity: 0.8, flatShading: true });
    for (const [x, y, z, r] of [[cx - 0.7, 0.01, cz + 0.9, 0.3], [cx + 0.85, 0.01, cz - 0.6, 0.22], [cx - 0.3, PY + 0.01, cz - 0.6, 0.18]] as [number, number, number, number][]) {
      const p = new THREE.Mesh(new THREE.CircleGeometry(r, 9), jel); p.rotation.x = -Math.PI / 2; p.scale.set(1, 0.7, 1); p.position.set(x, y + 0.003, z); g.add(p);
    }
    const sign = plate(this.mats, ['HOLDING 2', 'FEED FROM THE CHUTE ONLY'], 0.6, 0.12, { bg: 0xe8b828, ink: 0x141210, px: 420 });
    sign.position.set(x1 - 0.005, 2.45, cz); sign.rotation.y = -Math.PI / 2; g.add(sign);
    // its lamps
    this.chamL.position.set(cx + 0.15, h - 0.45, cz); this.chamL.target.position.set(cx + 0.25, 0, cz);
    this.chamRed.position.set(x1 - 0.3, h - 0.4, z0 + 0.4);
    const rl = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff2a14, toneMapped: false })); rl.position.set(x1 - 0.08, h - 0.4, z0 + 0.4); rl.userData.noGlow = true; rl.name = 'chamRedBulb'; g.add(rl);
    const pool = glowCard(PS * 1.3, PS * 1.3, 0xd8ecff, 0.16); pool.rotation.x = -Math.PI / 2; pool.position.set(cx, PY + 0.02, cz); g.add(pool);
    // the occupant
    this.held.position.set(cx, PY + 0.01, cz);
    this.held.rotation.y = -0.68;
    g.add(this.held);
    const fallback = () => {
      if (this.held.children.length) return;
      this.held.add(blob(this.mats, ja, 0.5));
      this.heldTick = (t, dt) => { for (const a of ja) a.f(a.o, t, dt); };
    };
    import('../../../creatures/species/gummy_bear').then((m) => {
      try {
        const rig = m.buildGummyBear(1);
        rig.root.traverse((o) => { const me = o as THREE.Mesh; if (me.isMesh) { me.castShadow = true; me.frustumCulled = false; } });
        this.held.add(rig.root);
        // idle, and every so often it pinches itself in two
        this.heldTick = (t, dt) => { const k = t % 40; m.poseGummyBear(rig, t, dt, k > 30 ? 'split' : 'idle', k > 30 ? { fs: Math.min(1, (k - 30) / 9) } : {}); };
      } catch (e) { console.warn('holding 2: no gummy bear', e); fallback(); }
    }).catch((e) => { console.warn('holding 2: no gummy bear', e); fallback(); });
    return g;
  }

  /** the night shift's room: services, instruments, secrets and leavings on every wall (rooms/dress.ts, rooms/vault.ts) */
  private dressing(): THREE.Group {
    const d = this.dress = new Dresser(this.mats, this.leds);
    const v = this.vault = new Vault(d, this.mats);
    const L = Math.PI / 2;
    // back wall: the conduit at -1.95 feeds a gauge panel; the dewar by the cold store; the crest over the main computer
    d.gauges(at(-1.95, 2.3, BACK + 0.01), 2, 1, { labels: ['MAINS', 'R-NET 7'], seed: 11 });
    d.fuseBox(at(3.05, 1.75, BACK + 0.01), H, { color: 0x7a827a });
    v.dewar(at(-2.12, 0, BACK + 0.42, 0, 0.35));
    d.streaks(at(0, H - 0.75, BACK + 0.014), 6.6, 0.9, 0.35);
    v.crest(at(WALL.x, 2.87, BACK + 0.01), 0.15);
    // a cable tray over the room, a loose loop from it down to the computer's housing
    d.tray([-W + 0.6, H - 0.3, 0.15], [W - 0.9, H - 0.3, 0.15], H, { seed: 3, cables: 8 });
    d.droop([0.6, H - 0.32, 0.15], [1.1, 2.62, BACK + 0.2], 0.25, 0.012, 0x1a1a1a);
    d.droop([0.75, H - 0.32, 0.15], [1.3, 2.62, BACK + 0.2], 0.32, 0.008, 0x8a2a1a);
    v.cables([W - 1.0, H - 0.32, 0.15], [W - 0.15, OBS.y + OBS.h / 2 + 0.35, OBS.z + 0.5], 3, 0.18, 0.009);
    // the cold store: frost on the glass, a red readout, its palm reader, the cryo warning
    const FW = 1.0, FH = 2.05, FZ = FRIDGE.z + 0.31;
    const fr = frostCard(FW - 0.12, FH - 0.3); fr.position.set(FW / 2, FH / 2 + 0.05, 0.026); this.fridgeDoor.add(fr);
    v.coldStore(at(FRIDGE.x - 0.08, 1.0, FZ + 0.03), FW - 0.12, 1.86, { frost: false, readout: '-80°C' });
    v.biolock(at(FRIDGE.x + FW / 2 + 0.001, 1.2, FRIDGE.z + 0.18, 0, L));
    v.sign(at(FRIDGE.x + FW / 2 + 0.001, 0.8, FRIDGE.z + 0.06, 0, L), 'bio', 0.16);
    // left wall: the clock over the store, an evidence board over the microscope, a terminal on its arm, a valve on the blue main
    d.clock(at(-W + 0.01, 2.62, -2.5, 0, L));
    v.corkboard(at(-W + 0.01, 1.98, -1.62, 0, L), 1.0, 0.62);
    v.terminal(at(-W + 0.01, 1.58, -0.72, 0, L - 0.55), { arm: 0.34, w: 0.3, head: 'R-NET 7 · AUDIT', i: 1 });
    v.pipe([[-W + 0.32, H - 0.24, -2.05], [-W + 0.32, 2.28, -2.05], [-W - 0.1, 2.28, -2.05]], 0.032, 0x4a6a8a, { valves: [0], gauges: [0], out: [1, 0, 0] });
    d.gauges(at(-W + 0.01, 2.35, -0.25, 0, L), 3, 1, { color: 0x3e5a54, labels: ['CENTRIFUGE', 'COOLANT'], seed: 23 });
    d.vent(at(-W + 0.01, 2.45, 0.6, 0, L), 0.56, 0.3);
    d.extinguisher(at(-W + 0.01, 1.05, 1.45, 0, L));
    d.streaks(at(-W + 0.014, H - 0.75, -0.6, 0, L), 3.6, 1.0, 0.4);
    // right wall: the observation window onto HOLDING 2, its beacon, its placard, the pipe into the chamber
    const pane = v.obsWindow(at(W, OBS.y, OBS.z, 0, -L), { w: OBS.w, h: OBS.h, shutter: 0.2, intercom: 'side', label: ['OBSERVATION · HOLDING 2', 'DO NOT TAP THE GLASS'] });
    this.hots.push({ key: 'obs', objs: [pane], glow: [], label: 'Observation window', sub: 'HOLDING 2 · what came back from the Ledge', press: () => { uiSound('tick', 0.6); this.pose = this.pose === 'obs' ? 'room' : 'obs'; } });
    v.beacon(at(W, OBS.y + OBS.h / 2 + 0.42, OBS.z + 0.62, 0, -L));
    this.redL.position.copy(v.lamps.find((q) => q.kind === 'beacon')!.p).add(new THREE.Vector3(-0.7, -0.5, 0));
    v.placard(at(W - 0.01, 2.32, -2.62, 0, -L), 'gluttony', { cls: 'Fauna', cell: 'H-02', w: 0.26 });
    v.sign(at(W - 0.01, 1.98, 0.02, 0, -L), 'look', 0.18);
    v.pipe([[W - 0.1, 2.82, FRONT - 0.2], [W - 0.1, 2.82, -0.42], [W - 0.1, 2.02, -0.42], [W + 0.25, 2.02, -0.42]], 0.04, 0x3a6a5a, { band: ['HOLDING AIR', 0x6ad8a8], out: [-1, 0, 0], valves: [1], gauges: [1] });
    d.vent(at(W - 0.01, 2.45, 0.45, 0, -L), 0.5, 0.3);
    d.filing(at(W - 0.33, 0, 0.5, 0, -L), { open: 1, seed: 7, labels: ['UNITS', 'UNITS', 'VOID', 'TREE'] });
    d.streaks(at(W - 0.014, H - 0.7, 1.4, 0, -L), 2.8, 0.9, 0.35);
    // the dissection table's restraints: straps across, cuffs on the rails
    const ty = TABLE.y;
    for (const dz of [0.3, 0.75]) {
      const z = TABLE.z + dz;
      d.b.add('leather', cbox(0.86, 0.012, 0.08, 0.004), 0x4a2a1a, at(TABLE.x, ty + 0.06, z));
      for (const s of [-1, 1]) {
        d.b.add('leather', tube([[TABLE.x + s * 0.43, ty + 0.06, z], [TABLE.x + s * 0.46, ty - 0.05, z + 0.01], [TABLE.x + s * 0.45, ty - 0.24 - (s > 0 ? 0.08 : 0), z + 0.02]], 0.014, 6, 4), 0x4a2a1a);
        d.b.add('chrome', cbox(0.012, 0.05, 0.06, 0.003), 0xd8dcdc, at(TABLE.x + s * 0.455, ty - 0.12, z + 0.015));
      }
    }
    for (const s of [-1, 1]) for (const dz of [-0.7, 0.85]) {
      d.b.add('metal', band2(0.03), C.steel, at(TABLE.x + s * 0.43, ty + 0.01, TABLE.z + dz, 0, 0, Math.PI / 2));
      d.b.add('leather', tube([[TABLE.x + s * 0.44, ty, TABLE.z + dz], [TABLE.x + s * 0.47, ty - 0.12, TABLE.z + dz + 0.02], [TABLE.x + s * 0.46, ty - 0.2, TABLE.z + dz + 0.05]], 0.01, 6, 4), 0x5a3a22);
      d.b.add('leather', band2(0.045), 0x5a3a22, at(TABLE.x + s * 0.47, ty - 0.24, TABLE.z + dz + 0.05, 0.3, 0, Math.PI / 2));
    }
    // the leavings: on the filing cabinet, dossiers on the console ledge and the scope bench
    d.clutter(at(W - 0.33, 1.3, 0.5, 0, L), 0.36, 0.5, { seed: 17, binder: false, floppies: true });
    v.dossiers(at(SCOPE.x + 0.05, SCOPE.y + 0.001, SCOPE.z + 0.45, 0, L), 0.5, 0.6, { n: 2, seed: 44 });
    // the floor: bands and stencils, wet patches, fog
    v.stripes(W - 0.75, OBS.z - OBS.w / 2 - 0.2, W - 0.63, OBS.z + OBS.w / 2 + 0.2);
    v.stencil(W - 0.42 - 0.4, OBS.z, 'HOLDING 2', 0.1, L);
    v.stencil(-1.15, 1.3, 'C-1', 0.3, 0.1);
    d.puddle(-0.6, 2.2, 0.9, 0.6);
    v.fog(-W + 0.2, W - 0.2, BACK + 0.5, FRONT - 0.3, { k: 0.24, color: 0x7a90b0 });
    v.fog(CH.x0, CH.x1, CH.z0, CH.z1, { k: 0.45, color: 0xd8e8ff, layers: 3 });
    return d.done();
  }

  // ================================================================== the benches
  /** process a sample: the first-person bench games, then the result */
  async process(s: Sample): Promise<void> {
    if (this.bench) return;
    const host: BenchHost = { scene: this.scene, cam: this.cam, mats: this.mats, station: (k) => this.station(k), readout: this.readouts[0]?.ctx ?? null, root: document.body, rayAt: this.rayAt };
    this.onBench?.(true);
    this.bench = new BenchRun(host, s);
    try { const r = await this.bench.run(); if (r?.completed || r) this.flashEntry(s.src); this.refresh(); } finally { this.bench = null; this.pose = 'room'; this.onBench?.(false); }
  }
  /** where each bench game happens (its close first-person camera and the work's anchor) */
  private station(k: string): Station {
    switch (k) {
      case 'pipette': return { eye: new THREE.Vector3(CENTRI.x - 0.5, 1.32, CENTRI.z + 0.5), at: new THREE.Vector3(CENTRI.x - 0.08, CENTRI.y + 0.17, CENTRI.z + 0.5), surf: CENTRI.y };
      case 'centrifuge': return { eye: new THREE.Vector3(CENTRI.x - 0.5, 1.58, CENTRI.z - 0.33), at: new THREE.Vector3(CENTRI.x, CENTRI.y + 0.25, CENTRI.z - 0.35), surf: CENTRI.y, rotor: this.rotor };
      case 'microscope': return { eye: new THREE.Vector3(SCOPE.x + 0.52, 1.5, SCOPE.z - 0.05), at: new THREE.Vector3(SCOPE.x, SCOPE.y + 0.2, SCOPE.z - 0.05), surf: SCOPE.y };
      case 'dissect': return { eye: new THREE.Vector3(TABLE.x, 1.42, TABLE.z + 0.2), at: new THREE.Vector3(TABLE.x, TABLE.y + 0.08, TABLE.z - 0.26), surf: TABLE.y + 0.07, props: this.trayProps };
      default: return { eye: new THREE.Vector3(SEQ.x - 0.4, 1.22, SEQ.z + 0.68), at: new THREE.Vector3(SEQ.x - 0.46, 1.0, SEQ.z), surf: 0.78 };
    }
  }

  // ================================================================== camera
  /** fly to a pose, then run cb */
  private focus(k: string, cb?: () => void) { this.pose = k; if (cb) setTimeout(cb, 520); }
  /** back to the room view (a panel closed) */
  unfocus() { if (!this.bench) this.pose = 'room'; }
  /** the stage switched away: come back to the room view next time */
  leave() { this.unfocus(); }
  pointer(nx: number, ny: number) { this.ptr.set(nx, ny); this.bench?.pointer(nx, ny); }
  setBuild(on: boolean) { this.buildT = on ? 1 : 0; }

  frame(aspect: number, portrait: boolean) {
    const c = this.cam;
    c.aspect = aspect;
    const f = this.bench ? this.bench.fov : this.camF;
    c.fov = portrait ? Math.min(92, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(f / 2)) / aspect)) * 0.95) : f;
    c.updateProjectionMatrix();
  }

  update(dt: number, t: number, full: boolean) {
    this.t = t;
    if (this.dirty) this.refresh();
    // ---- light: the tubes hum and now and then one stutters
    for (const tb of this.tubes) {
      if (tb.flick <= 0 && Math.random() < dt * 0.04) tb.flick = 0.25 + Math.random() * 0.4;
      tb.flick = Math.max(0, tb.flick - dt);
      const k = tb.flick > 0 ? (Math.sin(t * 60 + tb.seed) > 0 ? 0.25 : 1) : 0.97 + Math.sin(t * 100 + tb.seed) * 0.03;
      tb.light.intensity = tb.base * k;
      tb.mat.color.setRGB(0.95 * (0.3 + 0.9 * k), 0.97 * (0.3 + 0.9 * k), 1.0 * (0.3 + 0.9 * k));
      if (tb.shaft) tb.shaft.u.uInt.value = 0.022 * k;
    }
    if (full && !this.bench) { const L0 = this.tubes[0].light; this.dust.update(t, L0.position, this.v.set(0, -1, 0), Math.cos(1.12), Math.cos(0.5), 2.6, new THREE.Color(0xdfe8ff), 0.12); }
    this.surgLvl = damp(this.surgLvl, this.surgOn, 14, dt);
    this.surg.intensity = 1.8 * this.surgLvl;
    this.surgMat.color.setScalar(0.2 + 1.1 * this.surgLvl);
    const pool = this.scene.getObjectByName('surgPool'); if (pool) pool.visible = this.surgLvl > 0.1;
    this.desk.intensity = 2.1 + Math.sin(t * 3.1) * 0.04;
    this.alarmT = Math.max(0, this.alarmT - dt);
    if (this.alarmLed) this.alarmLed.level = this.alarmT > 0 ? (Math.sin(t * 20) > 0 ? 1 : 0) : 0.05;
    this.wallGlow.color.setHex(this.alarmT > 0 && Math.sin(t * 20) > 0 ? 0xff4a3a : 0xffc890);
    this.leds.update(t);
    if (full) this.dress.update(t);
    this.vault.update(t, dt);
    if (full) this.heldTick?.(t, Math.min(dt, 0.05));
    // the beacon over the window sweeps red; in the chamber the alarm lamp throbs and the cage lamp hums
    this.redL.intensity = 0.2 + this.vault.beaconK(t) * 2.6;
    const al = Math.pow(Math.max(0, Math.sin(t * 2.2)), 2);
    this.chamRed.intensity = 0.6 + al * 3.2;
    this.chamL.intensity = 18 + Math.sin(t * 47) * 0.5 + (Math.sin(t * 0.29) > 0.99 ? -14 : 0);
    // ---- machines
    this.rotorV = damp(this.rotorV, this.bench?.rotorSpin ?? 0.3, 0.6, dt);
    this.rotorA += this.rotorV * dt; this.rotor.rotation.y = this.rotorA;
    this.reelV = damp(this.reelV, 1, 0.6, dt);
    this.reels.forEach((r, i) => { r.rotation.z += dt * this.reelV * (i % 2 ? -1.1 : 0.9) * (Math.sin(t * 0.5 + i) > -0.3 ? 1 : 0); });
    const jw = this.jarW.update(dt);
    this.jar.rotation.z = jw * 0.02;
    const th = this.jar.getObjectByName('thing'); if (th) { th.rotation.y = t * 0.2 + jw * 0.3; th.position.y = 0.18 + Math.sin(t * 0.7) * 0.01 + Math.abs(jw) * 0.01; }
    this.doorT = Math.max(0, this.doorT - dt * 0.6);
    this.doorA = damp(this.doorA, this.doorT > 0.2 ? 0.7 : 0, 5, dt);
    this.fridgeDoor.rotation.y = -this.doorA * 1.2;
    for (const r of this.readouts) { r.acc += dt; if (r.acc >= r.every && !(this.bench && r === this.readouts[0] && this.bench.usesScreen)) { r.acc = 0; r.draw(r.ctx, t); r.tex.needsUpdate = true; } }
    if (this.bench?.usesScreen && this.readouts[0]) this.readouts[0].tex.needsUpdate = true;
    if (this.flash) { this.flash.t += dt; if (Math.floor(this.flash.t * 6) !== Math.floor((this.flash.t - dt) * 6)) this.drawWall(); if (this.flash.t > 1.6) { this.flash = null; this.drawWall(); } }
    else if (Math.floor(t * 2) !== Math.floor((t - dt) * 2)) this.drawWall();
    if (full && Math.random() < dt * 0.8) this.puffs.emit(this.v.set(HOOD.x + 0.1, 1.95, HOOD.z + (Math.random() - 0.5) * 0.8), new THREE.Vector3(0, 0.25, 0), { life: 2.2, s0: 0.01, s1: 0.03, color: 0xd8f0e8, rise: 0.3 });
    if (full) this.puffs.update(dt, this.cam, () => 0.6);
    if (!full) return;
    // ---- camera: the benches drive it while a sample is worked (the close-ups get a gentler exposure)
    this.grade.exposure = damp(this.grade.exposure ?? 1.75, this.bench && !this.bench.done ? 1.3 : 1.75, 4, dt);
    if (this.bench) { this.bench.update(dt, t); return; }
    this.ptrS.x = damp(this.ptrS.x, this.ptr.x, 3, dt); this.ptrS.y = damp(this.ptrS.y, this.ptr.y, 3, dt);
    this.build = damp(this.build, this.buildT, 3, dt);
    const goal = this.build > 0.5 ? POSES.build : POSES[this.pose] ?? POSES.room;
    const k = 1 - Math.exp(-dt * 4.5);
    this.camP.lerp(goal.pos, k); this.camL.lerp(goal.look, k); this.camF += (goal.fov - this.camF) * k;
    const par = this.pose === 'room' ? 1 : this.pose === 'obs' ? 0.45 : 0.25;
    this.cam.position.set(this.camP.x - this.ptrS.x * 0.18 * par + Math.sin(t * 0.27) * 0.01, this.camP.y + this.ptrS.y * 0.06 * par + Math.sin(t * 0.39) * 0.006, this.camP.z);
    this.cam.lookAt(this.v.set(this.camL.x + this.ptrS.x * 0.3 * par, this.camL.y - this.ptrS.y * 0.12 * par, this.camL.z));
  }
}

// ================================================================== helpers
/** a ring (clamps, bands) */
function band2(r: number): THREE.BufferGeometry { const g = new THREE.TorusGeometry(r, 0.008, 4, 10); g.rotateX(Math.PI / 2); return g; }
/** a chain link (an oval ring standing in XY) */
function ring2(r: number, t: number): THREE.BufferGeometry { const g = new THREE.TorusGeometry(r, t * 0.5, 4, 8); g.scale(1, 1.5, 1); return g; }
/** a grime card: dark multiplied stains (pixel blobs and drips) */
export function grime(w: number, h: number, seed: number, k: number): THREE.Mesh {
  const cv = document.createElement('canvas'); cv.width = Math.round(w * 24); cv.height = Math.round(h * 24);
  const c = cv.getContext('2d')!;
  let s = seed;
  const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
  c.fillStyle = '#ffffff'; c.fillRect(0, 0, cv.width, cv.height);
  for (let i = 0; i < cv.width * 0.8; i++) {
    const x = rnd() * cv.width, y = rnd() * cv.height, r = 1 + rnd() * 5, v = Math.round(255 * (1 - k * (0.3 + rnd() * 0.7)));
    c.fillStyle = `rgb(${v},${Math.round(v * 0.97)},${Math.round(v * 0.9)})`;
    c.fillRect(Math.round(x), Math.round(y), Math.round(r), Math.round(r * (0.6 + rnd())));
    if (rnd() < 0.15) c.fillRect(Math.round(x), Math.round(y), 1, Math.round(4 + rnd() * 18));
  }
  const tex = new THREE.CanvasTexture(cv); tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.MultiplyBlending, premultipliedAlpha: true, depthWrite: false }));
  m.userData.noGlow = true; m.renderOrder = 1;
  return m;
}
/** the left CRT: the codex in numbers */
function drawStats(c: CanvasRenderingContext2D, t: number) {
  // laid out in 96 x 72 units, drawn at the canvas's density (288 x 216): a lit edge on every bar, fine scanlines
  const st = codexStats();
  const Wd = c.canvas.width, Hd = c.canvas.height, k = Wd / 96, X = (v: number) => Math.round(v * k);
  c.fillStyle = '#04140a'; c.fillRect(0, 0, Wd, Hd);
  const rows: [string, number, number][] = [['DSC', st.discovered, st.total], ['SMP', st.sampled, st.total], ['RES', st.researched, st.total], ['CMP', st.complete, st.total]];
  rows.forEach(([key, n, of], i) => {
    const y = 6 + i * 13;
    bitText(c, key, X(3), X(y) - 3, { color: '#2ac85a', outline: null });
    c.fillStyle = '#0a3a1a'; c.fillRect(X(24), X(y + 1), X(52), X(5));
    const fw = Math.round(X(52) * n / Math.max(1, of));
    c.fillStyle = i === 3 ? '#ffd23a' : '#3aff6a'; c.fillRect(X(24), X(y + 1), fw, X(5));
    if (fw > 2) { c.fillStyle = i === 3 ? '#fff0a0' : '#b8ffc8'; c.fillRect(X(24), X(y + 1), fw, 1); c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(X(24), X(y + 6) - 1, fw, 1); }
    for (let q = 1; q < 10; q++) { c.fillStyle = 'rgba(0,0,0,0.4)'; c.fillRect(X(24) + Math.round(X(52) * q / 10), X(y + 1), 1, X(5)); }
    bitText(c, String(n), X(93), X(y) - 3, { color: '#9affb0', outline: null, align: 'right' });
  });
  const pct = st.pct;
  for (let i = 0; i < 20; i++) {
    const x = X(4 + i * 4.5);
    c.fillStyle = i < pct / 5 ? '#ffd23a' : '#0a3a1a'; c.fillRect(x, X(60), X(3), X(6));
    if (i < pct / 5) { c.fillStyle = '#fff0a0'; c.fillRect(x, X(60), X(3), 1); }
  }
  if (Math.floor(t * 2) % 2) { c.fillStyle = '#3aff6a'; c.fillRect(X(88), X(62), X(4), X(4)); }
  for (let y = 0; y < Hd; y += 2) { c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(0, y, Wd, 1); }
}
/** the right CRT: a base read scrolling by (A T G C as four colours), at the canvas's density */
function drawBases(c: CanvasRenderingContext2D, t: number) {
  const Wd = c.canvas.width, Hd = c.canvas.height, k = Wd / 96, X = (v: number) => Math.round(v * k);
  c.fillStyle = '#040a14'; c.fillRect(0, 0, Wd, Hd);
  const cols = ['#3aff6a', '#ff5a3a', '#3ac8ff', '#ffd23a'], lit = ['#c8ffd0', '#ffc8b8', '#c8f0ff', '#fff0b0'];
  const off = Math.floor(t * 20);
  for (let r = 0; r < 8; r++) for (let i = 0; i < 12; i++) {
    const n = off + i + r * 13;
    const h = Math.sin(n * 12.9898) * 43758.5453; const v = Math.floor((h - Math.floor(h)) * 4);
    const x = X(4 + i * 7.5), y = X(4 + r * 8), s = X(5);
    c.fillStyle = cols[v]; c.fillRect(x, y, s, s);
    c.fillStyle = lit[v]; c.fillRect(x, y, s, 1); c.fillRect(x, y, 1, s);
    c.fillStyle = 'rgba(0,0,0,0.4)'; c.fillRect(x, y + s - 1, s, 1); c.fillRect(x + s - 1, y, 1, s);
  }
  for (let y = 0; y < Hd; y += 2) { c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(0, y, Wd, 1); }
}
/** a hanging tool on the pegboard (a quick model per kind, facing -X) */
function toolMesh(k: string, color: number): THREE.Object3D {
  const g = new THREE.Group();
  const M = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.5, metalness: 0.1, ...o });
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, rx = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, 0, rz); m.castShadow = true; g.add(m); return m; };
  const main = M({ color }), dark = M({ color: 0x2a2a2a }), steel = M({ color: 0xc8ccd2, metalness: 0.6, roughness: 0.3 });
  switch (k) {
    case 'dart': for (let i = 0; i < 3; i++) { add(new THREE.CylinderGeometry(0.008, 0.008, 0.1, 6), M({ color: 0xd8f0f4, transparent: true, opacity: 0.6 }), -0.02, 0.02, -0.04 + i * 0.04, 0, 0.3); add(new THREE.ConeGeometry(0.014, 0.03, 4), main, -0.02, 0.07, -0.04 + i * 0.04); } break;
    case 'pinger': add(new THREE.BoxGeometry(0.04, 0.12, 0.08), dark, -0.02); add(new THREE.CircleGeometry(0.025, 8), M({ color, emissive: new THREE.Color(color).multiplyScalar(0.8) }), -0.041, 0.02, 0, 0, 0).rotation.y = -Math.PI / 2; add(new THREE.CylinderGeometry(0.003, 0.003, 0.08, 4), steel, -0.02, 0.09, 0.03); break;
    case 'lure': add(new THREE.CylinderGeometry(0.035, 0.035, 0.1, 8), M({ color, transparent: true, opacity: 0.8 }), -0.04); add(new THREE.CylinderGeometry(0.037, 0.037, 0.02, 8), steel, -0.04, 0.06); break;
    case 'foam': add(new THREE.CylinderGeometry(0.032, 0.032, 0.17, 10), main, -0.04); add(new THREE.BoxGeometry(0.02, 0.02, 0.05), M({ color: 0xe8a020 }), -0.04, 0.1, 0.02); break;
    case 'filter': add(new THREE.CylinderGeometry(0.045, 0.045, 0.04, 10), dark, -0.03, 0, 0, 0, Math.PI / 2); add(new THREE.CylinderGeometry(0.046, 0.046, 0.01, 10), main, -0.052, 0, 0, 0, Math.PI / 2); break;
    case 'inhaler': add(new THREE.BoxGeometry(0.03, 0.09, 0.04), main, -0.02); add(new THREE.BoxGeometry(0.03, 0.025, 0.04), M({ color: 0xe8e8e0 }), -0.03, -0.05, 0, 0, 0.5); break;
    default: add(new THREE.BoxGeometry(0.06, 0.12, 0.18), M({ color: 0xd8dcd8 }), -0.035); add(new THREE.BoxGeometry(0.004, 0.03, 0.18), main, -0.066, 0.04); add(new THREE.BoxGeometry(0.004, 0.04, 0.012), M({ color: 0xc8302a }), -0.067, -0.01, 0);
  }
  return g;
}
