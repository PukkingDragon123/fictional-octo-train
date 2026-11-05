// THE EXPERIMENT LAB, bay B-2: tiled walls to the dado, a drain in the middle
// of a sloped floor, a steel experiment table under a three-headed surgical
// lamp on a ceiling arm, a sheet over what is on the table (a foot tag, a hand
// that slips out now and then), a floor-bolted hydraulic rig (the subject
// room's olive arm segments and claw) that works the table on its own, three
// specimen tanks of green fluid with real creatures from the game floating in
// them (their own models, src/creatures), a bench of glassware with a
// centrifuge and a burner, a tape-reel computer cabinet, a whiteboard of
// diagrams, a hazmat suit on its hook, cable runs, a fume hood.
// Interactions: poke a tank (bubbles boil up, the specimen kicks), the rig
// (it runs a routine), the lamp (heads swing on and off), the whiteboard (it
// flips), the centrifuge (spins up), the tape cabinet (the reels race), the
// sheet (something under it twitches).
import * as THREE from 'three';
import type { FMats } from '../scene/pixtex';
import { Puffs } from '../scene/fx';
import type { Hot, StageRoom, Grade } from '../monitor/stage';
import { species } from '../../../creatures/registry';
import '../../../creatures/species/ventling';
import '../../../creatures/species/cowerling';
import '../../../creatures/species/lumenmoth';
import type { Rig } from '../../../creatures/species';
import { armSegment, armBase, clawPalm, clawFinger } from '../roomParts';
import { bitText } from '../../../gfx/bitfont';
import {
  FacetBuilder, at, cbox, prism, lathe, extrude, gem, bolt, hull, tube, C, LedBank, blink, busy, plate, paper, slab, glowCard, Wobble, uiSound,
} from '../monitor/props';

const W = 3.2, BACK = -3.1, FRONT = 3.4, H = 3.0;
const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt));
const UP = new THREE.Vector3(0, 1, 0);
const TABLE = new THREE.Vector3(-0.2, 0.92, -0.7);

interface Tank { g: THREE.Group; fluid: THREE.MeshBasicMaterial; light: THREE.PointLight; rig: Rig | null; def: any; fc: any; boil: number; kick: number; base: THREE.Vector3; seed: number }

export class LabRoom implements StageRoom {
  id = 'lab';
  scene = new THREE.Scene();
  cam = new THREE.PerspectiveCamera(50, 16 / 9, 0.05, 30);
  feedCam = new THREE.PerspectiveCamera(66, 4 / 3, 0.05, 30);
  hots: Hot[] = [];
  grade: Grade = { exposure: 1.95, lift: [0.97, 0.98, 1.0], gain: [1.02, 1.0, 0.97], vig: 0.6, sat: 0.74, contrast: 1.05 };
  deco = new THREE.Group();
  floor = { minX: -W + 0.8, maxX: W - 0.6, minZ: 0.2, maxZ: 1.6, y: 0 };
  surfaces = [{ minX: -W + 0.05, maxX: -W + 0.7, minZ: -1.4, maxZ: 1.8, y: 0.92 }, { minX: 1.6, maxX: 2.9, minZ: -2.95, maxZ: -2.45, y: 0.92 }];
  guideSpot = { pos: new THREE.Vector3(0.9, 0, 0.6), look: new THREE.Vector3(-0.2, 1.1, -0.7) };
  actions: { key: string; label: string; run: () => void }[] = [];
  private mats: FMats;
  private leds = new LedBank(120);
  private puffs = new Puffs(90);
  private hemi = new THREE.HemisphereLight(0xc8ccc8, 0x3a3830, 0.7);
  private surg = new THREE.SpotLight(0xfff0d8, 0, 0, 0.8, 0.55, 2);
  private surgOn = 1; private surgLvl = 1;
  private surgMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  private lampArm = new THREE.Group(); private lampW = new Wobble(30, 1.6);
  private strip = new THREE.PointLight(0xf0f4ff, 0.4, 7, 2);
  private hood = new THREE.SpotLight(0xd8f0e0, 2.2, 3.5, 0.7, 0.6, 1.8);
  private wash = new THREE.SpotLight(0xffe0b8, 2.0, 5, 0.45, 0.7, 1.8);
  private stripMat = new THREE.MeshBasicMaterial({ color: 0x9aa8b0, toneMapped: false });
  private tanks: Tank[] = [];
  // the rig
  private arm: { base: THREE.Vector3; L1: number; L2: number; seg1: THREE.Object3D; seg2: THREE.Object3D; head: THREE.Group; fingers: THREE.Object3D[]; tip: THREE.Vector3; vel: THREE.Vector3; goal: THREE.Vector3; grip: number; gripT: number; step: number; stepT: number; routine: THREE.Vector3[]; busy: number } | null = null;
  // props
  private board!: { mesh: THREE.Mesh; tex: THREE.CanvasTexture; cv: HTMLCanvasElement; page: number; flip: number };
  private boardG = new THREE.Group();
  private centri = new THREE.Group(); private centriV = 0.4; private centriA = 0;
  private reels: THREE.Object3D[] = []; private reelV = 1;
  private sheet = new THREE.Group(); private sheetW = new Wobble(260, 5); private hand = new THREE.Group(); private handT = 0;
  private flame!: THREE.Mesh;
  private camPos = new THREE.Vector3(1.05, 1.68, 3.3); private camLook = new THREE.Vector3(-0.25, 1.12, -0.9);
  private ptr = new THREE.Vector2(); private ptrS = new THREE.Vector2();
  private v = new THREE.Vector3(); private v2 = new THREE.Vector3(); private v3 = new THREE.Vector3(); private q = new THREE.Quaternion();
  private t = 0;
  private build = 0; private buildT = 0;
  private buildPos = new THREE.Vector3(1.2, 2.7, 3.15); private buildLook = new THREE.Vector3(-0.1, 0.3, 0.2);

  constructor(mats: FMats) {
    this.mats = mats;
    const S = this.scene;
    S.background = new THREE.Color(0x000000);
    S.add(this.shell(), this.benches(), this.table(), this.leds.mesh, this.puffs.mesh, this.deco);
    this.deco.name = 'deco';
    S.add(this.hemi, this.strip, this.hood, this.hood.target, this.wash, this.wash.target);
    this.hood.position.set(-0.5, 1.95, BACK + 0.35); this.hood.target.position.set(-0.5, 0, BACK + 0.6);
    this.wash.position.set(1.0, 2.8, -0.6); this.wash.target.position.set(1.65, 1.6, BACK);
    this.strip.position.set(0, H - 0.3, 0.6);
    this.buildTanks();
    this.buildRig();
    this.feedCam.position.set(-2.85, 2.65, 2.75); this.feedCam.lookAt(0.2, 0.9, -1.1);
    this.cam.position.copy(this.camPos); this.cam.lookAt(this.camLook);
    this.actions = [
      { key: 'rig', label: 'Run the rig', run: () => this.runRig() },
      { key: 'tank', label: 'Wake a specimen', run: () => this.pokeTank(this.tanks[Math.floor(Math.random() * this.tanks.length)]) },
      { key: 'lamp', label: 'Surgical lamp', run: () => this.toggleLamp() },
      { key: 'board', label: 'Whiteboard', run: () => this.flipBoard() },
    ];
  }

  // ================================================================== the shell
  private shell(): THREE.Group {
    const b = new FacetBuilder();
    const g = new THREE.Group();
    const TILE = 0xc8d4c4, CONC = 0x9a9890;
    slab(b, 'tile', -W, W, -0.1, 0, BACK - 0.2, FRONT, 0x8a9488, 0.004, 0.9);
    slab(b, 'concrete', -W, W, H, H + 0.12, BACK - 0.2, FRONT, 0x4a4a46);
    const wall = (x0: number, x1: number, z0: number, z1: number) => { slab(b, 'tile', x0, x1, 0, 1.4, z0, z1, TILE); slab(b, 'concrete', x0, x1, 1.4, H, z0, z1, CONC); };
    wall(-W, W, BACK - 0.2, BACK);
    wall(-W - 0.2, -W, BACK, FRONT); wall(W, W + 0.2, BACK, FRONT);
    wall(-W, W, FRONT, FRONT + 0.2);
    const cap = (x0: number, x1: number, z0: number, z1: number) => { slab(b, 'tile', x0, x1, 1.38, 1.44, z0, z1, 0x4a6a5a, 0.01); slab(b, 'tile', x0, x1, 0, 0.1, z0, z1, 0x4a5a4a, 0.008); };
    cap(-W, W, BACK, BACK + 0.04); cap(-W, -W + 0.04, BACK, FRONT); cap(W - 0.04, W, BACK, FRONT);
    // the drain and the floor's fall toward it
    b.add('rust', extrude([[-0.22, -0.22], [0.22, -0.22], [0.22, 0.22], [-0.22, 0.22]], 0.02, 0.004, [[[-0.18, -0.18], [0.18, -0.18], [0.18, 0.18], [-0.18, 0.18]]]), 0xb0a090, at(0.4, 0.005, 0.5, Math.PI / 2));
    for (let i = 0; i < 6; i++) b.add('rust', cbox(0.36, 0.012, 0.02, 0.003), 0x9a8a7a, at(0.4, 0.005, 0.34 + i * 0.065));
    // strip lights overhead: long enamel troughs
    for (const x of [-1.6, 1.6]) {
      b.add('enamel', hull([[x - 0.1, 0, -2.4], [x + 0.1, 0, -2.4], [x - 0.1, 0, 2.4], [x + 0.1, 0, 2.4], [x - 0.13, -0.08, -2.42], [x + 0.13, -0.08, -2.42], [x - 0.13, -0.08, 2.42], [x + 0.13, -0.08, 2.42]]), 0xb8b4a0, at(0, H - 0.02, 0));
    }
    // pipes, a fume hood, a cable tray
    b.add('paint', prism(0.06, FRONT - BACK, 8), 0x4a6a8a, at(-W + 0.3, H - 0.25, (FRONT + BACK) / 2, Math.PI / 2), { rep: 0.4 });
    b.add('paint', prism(0.045, FRONT - BACK, 8), 0xb0a040, at(-W + 0.48, H - 0.2, (FRONT + BACK) / 2, Math.PI / 2), { rep: 0.4 });
    b.add('metal', cbox(W * 2, 0.06, 0.3, 0.008), C.dark, at(0, H - 0.2, BACK + 0.5));
    b.add('metal', hull([[-1.2, 2.0, BACK], [0.2, 2.0, BACK], [-1.2, 2.0, BACK + 0.75], [0.2, 2.0, BACK + 0.75], [-1.0, H, BACK], [0.0, H, BACK], [-1.0, H, BACK + 0.4], [0.0, H, BACK + 0.4]]), 0x8a8e88, undefined, { rep: 0.6 });
    b.add('hazard', cbox(1.42, 0.05, 0.02, 0.005), 0xffffff, at(-0.5, 2.0, BACK + 0.76), { rep: 0.2 });
    g.add(b.build(this.mats));
    // the strip tubes
    for (const x of [-1.6, 1.6]) { const tg = prism(0.02, 4.6, 6); tg.rotateX(Math.PI / 2); const m = new THREE.Mesh(tg, this.stripMat); m.position.set(x, H - 0.11, 0); g.add(m); }
    // signs
    const s1 = plate(this.mats, ['BAY B-2', 'EXPERIMENTAL'], 0.6, 0.2, { bg: 0xc8c0a0 });
    s1.position.set(1.2, 2.3, BACK + 0.012); g.add(s1);
    const s2 = plate(this.mats, ['BIOHAZARD'], 0.4, 0.11, { bg: 0xc8a030 });
    s2.position.set(-0.5, 1.86, BACK + 0.77); g.add(s2);
    // a wash of green from the tanks on the floor
    const wash = glowCard(4, 1.2, 0x8aff9a, 0.03); wash.rotation.x = -Math.PI / 2; wash.position.set(-1.0, 0.006, BACK + 0.9); g.add(wash);
    const pool = glowCard(2.0, 2.0, 0xffe8c0, 0.14); pool.rotation.x = -Math.PI / 2; pool.position.set(TABLE.x, 0.006, TABLE.z); pool.name = 'surgPool'; g.add(pool);
    return g;
  }

  // ================================================================== benches and machines
  private benches(): THREE.Group {
    const g = new THREE.Group();
    const b = new FacetBuilder();
    // the long bench on the left wall: a black epoxy top on steel cupboards
    const BX = -W + 0.38;
    b.add('bakelite', cbox(0.72, 0.05, 3.4, 0.01), 0x2a2a2a, at(BX, 0.9, 0.2), { grain: 'z' });
    b.add('paint', cbox(0.66, 0.86, 3.3, 0.012), 0x6e7a6a, at(BX + 0.02, 0.43, 0.2), { rep: 0.5 });
    for (let i = 0; i < 5; i++) { b.add('metal', cbox(0.01, 0.7, 0.6, 0.004), C.darker, at(BX + 0.36, 0.45, -1.2 + i * 0.66)); b.add('chrome', cbox(0.02, 0.1, 0.02, 0.005), 0xffffff, at(BX + 0.37, 0.65, -0.95 + i * 0.66)); }
    // glassware: beakers, a flask rack, test tubes, a microscope
    const glass: [number, number, number, number][] = [[BX - 0.1, 0.925, -1.2, 0.05], [BX + 0.05, 0.925, -1.05, 0.04], [BX - 0.05, 0.925, 0.9, 0.06], [BX + 0.12, 0.925, 1.4, 0.035]];
    for (const [x, y, z, r] of glass) {
      b.add('chrome', lathe([[0, 0], [r, 0], [r * 1.02, r * 2.6], [r * 1.1, r * 2.7], [0, r * 2.7]], 7), 0x8a9a98, at(x, y, z));
    }
    for (let i = 0; i < 6; i++) b.add('chrome', prism(0.012, 0.12, 5), 0x9aa8a8, at(BX + 0.1, 0.99, 0.2 + i * 0.035));
    b.add('wood', cbox(0.08, 0.04, 0.24, 0.008), 0x8a6a48, at(BX + 0.1, 0.95, 0.29));
    // the microscope
    b.add('enamel', cbox(0.14, 0.03, 0.18, 0.008), 0x2a2a2a, at(BX + 0.05, 0.94, -0.35));
    b.add('enamel', hull([[-0.03, 0, -0.06], [0.03, 0, -0.06], [-0.03, 0, -0.02], [0.03, 0, -0.02], [-0.025, 0.3, -0.02], [0.025, 0.3, -0.02], [-0.025, 0.26, 0.05], [0.025, 0.26, 0.05]]), 0xe0dccc, at(BX + 0.05, 0.95, -0.35));
    b.add('chrome', prism(0.018, 0.12, 6), 0xffffff, at(BX + 0.05, 1.18, -0.31, 0.4));
    // the burner
    b.add('brass', lathe([[0, 0], [0.04, 0], [0.04, 0.01], [0.012, 0.02], [0.01, 0.12], [0, 0.12]], 6), 0xffffff, at(BX - 0.05, 0.925, 1.15));
    // the tape cabinet on the right wall: two reels behind glass, a lamp panel
    const TX = W - 0.38, TZ = -1.4;
    b.add('paint', cbox(0.66, 1.9, 0.9, 0.02), 0xc8c0a8, at(TX, 0.95, TZ), { rep: 0.4 });
    b.add('rubber', cbox(0.02, 0.6, 0.76, 0.006), 0x0e0e0e, at(TX - 0.33, 1.45, TZ));
    b.add('metal', cbox(0.02, 0.3, 0.76, 0.006), 0x3a3e3a, at(TX - 0.335, 0.9, TZ));
    b.add('paint', cbox(0.66, 1.9, 0.9, 0.02), 0xbab49a, at(TX, 0.95, TZ + 0.95), { rep: 0.4 });
    b.add('metal', cbox(0.02, 1.2, 0.7, 0.006), 0x3a3e3a, at(TX - 0.335, 1.05, TZ + 0.95));
    // the oscilloscope cart and a gurney by the right wall
    b.add('metal', cbox(0.5, 0.03, 0.4, 0.006), C.steel, at(1.9, 0.82, 1.1));
    for (const [x, z] of [[1.68, 0.92], [2.12, 0.92], [1.68, 1.28], [2.12, 1.28]]) b.add('metal', prism(0.014, 0.8, 6), C.steel, at(x, 0.41, z));
    b.add('paint', cbox(0.4, 0.28, 0.34, 0.02), 0x5a6a5a, at(1.9, 0.98, 1.1));
    // a bench on the back wall right with the centrifuge
    b.add('bakelite', cbox(1.4, 0.05, 0.6, 0.01), 0x2a2a2a, at(2.2, 0.9, BACK + 0.4));
    b.add('paint', cbox(1.36, 0.86, 0.56, 0.012), 0x6e7a6a, at(2.2, 0.43, BACK + 0.4), { rep: 0.5 });
    b.add('enamel', lathe([[0, 0], [0.18, 0], [0.19, 0.04], [0.19, 0.16], [0.16, 0.2], [0, 0.2]], 8), 0xd8d4c4, at(2.0, 0.925, BACK + 0.4));
    // the hazmat suit on its hook (left of the door)
    b.add('metal', cbox(0.04, 0.04, 0.12, 0.008), C.dark, at(-W + 0.03, 2.05, 2.5));
    b.add('rubber', hull([[-0.03, 2.0, 2.3], [-0.03, 2.0, 2.7], [-0.16, 1.2, 2.25], [-0.16, 1.2, 2.75], [-0.14, 0.5, 2.3], [-0.14, 0.5, 2.7], [-0.02, 0.5, 2.35], [-0.02, 0.5, 2.65]]), 0xd8b030, at(-W + 0.03, 0, 0));
    b.add('rubber', hull([[-0.02, 2.0, 2.4], [-0.02, 2.0, 2.6], [-0.14, 2.15, 2.38], [-0.14, 2.15, 2.62], [-0.08, 2.32, 2.5]]), 0xd8b030, at(-W + 0.03, 0, 0));
    b.add('rubber', cbox(0.02, 0.12, 0.16, 0.01), 0x1a2a2a, at(-W + 0.18, 2.12, 2.5, 0, 0, 0.3));
    g.add(b.build(this.mats));
    // the reels (they turn), the cabinet's lamps
    for (const dz of [-0.2, 0.2]) {
      const rb = new FacetBuilder();
      rb.add('chrome', extrude([[0, 0.14], [0.121, 0.07], [0.121, -0.07], [0, -0.14], [-0.121, -0.07], [-0.121, 0.07]], 0.012, 0.002, [[[0, 0.04], [0.035, 0.02], [0.035, -0.02], [0, -0.04], [-0.035, -0.02], [-0.035, 0.02]]]), 0xb8b8b8);
      for (let i = 0; i < 3; i++) rb.add('metal', cbox(0.02, 0.07, 0.006, 0.002), C.darker, at(Math.cos(i * 2.09) * 0.07, Math.sin(i * 2.09) * 0.07, 0.008, 0, 0, i * 2.09 + Math.PI / 2));
      rb.add('rubber', prism(0.09, 0.008, 12), 0x3a2a1a, at(0, 0, -0.004, Math.PI / 2));
      const r = rb.build(this.mats, { cast: false });
      r.position.set(TX - 0.345, 1.55, TZ + dz); r.rotation.y = -Math.PI / 2;
      g.add(r); this.reels.push(r);
    }
    for (let r = 0; r < 4; r++) for (let i = 0; i < 8; i++) this.leds.add([TX - 0.346, 0.82 + r * 0.06, TZ - 0.3 + i * 0.085], [0xff3a20, 0xffb030, 0x40ff60][(i + r) % 3], { size: 0.012, pattern: (i + r) % 2 ? busy(i + r * 8, 4) : blink(0.5 + i * 0.1, 0.5, r * 0.25), facing: new THREE.Euler(0, -Math.PI / 2, 0) });
    for (let r = 0; r < 10; r++) for (let i = 0; i < 4; i++) this.leds.add([TX - 0.346, 0.6 + r * 0.1, TZ + 0.75 + i * 0.12], [0x40ff60, 0xffb030][(r + i) % 2], { size: 0.01, pattern: busy(r * 4 + i + 40, 2 + (i % 3)), facing: new THREE.Euler(0, -Math.PI / 2, 0) });
    const tapes = new THREE.Group();
    this.hots.push({ key: 'tapes', objs: [tapes, ...this.reels], label: 'Tape drive', sub: 'the data off the cells', press: () => { this.reelV = 14; uiSound('servo', 0.8); setTimeout(() => uiSound('relay', 0.7), 300); } });
    // the centrifuge lid and its rotor
    const cb = new FacetBuilder();
    cb.add('chrome', lathe([[0, 0], [0.15, 0], [0.15, 0.015], [0, 0.02]], 8), 0xb0b0b0);
    for (let i = 0; i < 6; i++) cb.add('chrome', prism(0.018, 0.06, 5), 0x9aa8a8, at(Math.cos(i * 1.047) * 0.1, 0.03, Math.sin(i * 1.047) * 0.1));
    this.centri.add(cb.build(this.mats, { cast: false }));
    this.centri.position.set(2.0, 1.125, BACK + 0.4);
    g.add(this.centri);
    this.leds.add([2.0, 1.03, BACK + 0.6], 0x40ff60, { size: 0.01, pattern: blink(2) });
    this.hots.push({ key: 'centrifuge', objs: [this.centri], label: 'Centrifuge', sub: 'spin the samples', press: () => { this.centriV = 30; uiSound('grind', 0.6); } });
    // the burner's flame: a small faceted blue-white cone
    this.flame = new THREE.Mesh(lathe([[0, 0], [0.012, 0.015], [0.008, 0.05], [0, 0.07]], 5), new THREE.MeshBasicMaterial({ color: 0x6a9aff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.flame.position.set(-W + 0.33, 1.045, 1.15);
    this.flame.userData.noGlow = true;
    g.add(this.flame);
    // fluid in the beakers
    for (const [x, y, z, r] of glass) {
      const f = new THREE.Mesh(lathe([[0, 0.004], [r * 0.95, 0.004], [r * 0.97, r * 1.4], [0, r * 1.4]], 7), new THREE.MeshBasicMaterial({ color: [0x6ad04a, 0xd0a040, 0x4ab0a0, 0xc84a3a][Math.round(z * 10) & 3], transparent: true, opacity: 0.5, toneMapped: false, depthWrite: false }));
      f.position.set(x, y, z); f.userData.noGlow = true;
      g.add(f);
    }
    // the whiteboard on the back wall
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
    const tex = new THREE.CanvasTexture(cv);
    tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace;
    const wb = new FacetBuilder();
    wb.add('chrome', cbox(1.64, 0.88, 0.03, 0.008), 0xa8a8a8, at(0, 0, -0.016));
    wb.add('metal', cbox(1.5, 0.03, 0.06, 0.008), C.steel, at(0, -0.46, 0.02));
    for (let i = 0; i < 3; i++) wb.add('paint', prism(0.008, 0.11, 6), [0x2a4aa0, 0xb82a1e, 0x1a1a1a][i], at(-0.3 + i * 0.14, -0.43, 0.03, 0, 0, Math.PI / 2));
    this.boardG.add(wb.build(this.mats));
    const bm = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.84), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35, metalness: 0.05 }));
    bm.position.z = 0.001; bm.receiveShadow = true;
    this.boardG.add(bm);
    this.boardG.position.set(1.65, 1.75, BACK + 0.02);
    g.add(this.boardG);
    this.board = { mesh: bm, tex, cv, page: 0, flip: 0 };
    this.drawBoard();
    this.hots.push({ key: 'board', objs: [this.boardG], label: 'Whiteboard', sub: 'the night\'s working', press: () => this.flipBoard() });
    // pinned notes by the board
    for (const [x, y, r, s] of [[2.65, 1.95, 0.08, 1], [2.62, 1.55, -0.05, 2], [0.68, 2.05, 0.04, 3]] as [number, number, number, number][]) { const p = paper(['~', '~', '~', '~'], 0.16, 0.2, { seed: s * 13 }); p.position.set(x, y, BACK + 0.015); p.rotation.z = r; g.add(p); }
    return g;
  }

  // ================================================================== the experiment table, its lamp
  private table(): THREE.Group {
    const g = new THREE.Group();
    const b = new FacetBuilder();
    const { x, y, z } = TABLE;
    b.add('chrome', cbox(0.8, 0.05, 2.0, 0.012), 0xb8bcbc, at(x, y, z), { rep: 0.6 });
    b.add('chrome', extrude([[-0.42, -1.02], [0.42, -1.02], [0.42, 1.02], [-0.42, 1.02]], 0.04, 0.006, [[[-0.38, -0.98], [0.38, -0.98], [0.38, 0.98], [-0.38, 0.98]]]), 0x9a9e9e, at(x, y + 0.03, z, Math.PI / 2));
    b.add('metal', prism(0.09, y - 0.1, 8), C.dark, at(x, (y - 0.1) / 2, z));
    b.add('metal', cbox(0.6, 0.06, 0.8, 0.02), C.darker, at(x, 0.03, z));
    b.add('metal', hull([[x - 0.12, 0, z - 0.12], [x + 0.12, 0, z - 0.12], [x - 0.12, 0, z + 0.12], [x + 0.12, 0, z + 0.12], [x - 0.3, y - 0.05, z - 0.4], [x + 0.3, y - 0.05, z - 0.4], [x - 0.3, y - 0.05, z + 0.4], [x + 0.3, y - 0.05, z + 0.4]]), 0x5a5e5a);
    // the drip tray, an instrument tray on a stand beside it
    b.add('chrome', cbox(0.5, 0.02, 0.36, 0.006), 0xa8a8a8, at(x + 0.75, 1.0, z + 0.5));
    b.add('metal', prism(0.016, 1.0, 6), C.steel, at(x + 0.75, 0.5, z + 0.5));
    for (let i = 0; i < 5; i++) b.add('chrome', cbox(0.16, 0.008, 0.012, 0.003), 0xffffff, at(x + 0.72, 1.015, z + 0.38 + i * 0.05, 0, 0.2 * (i - 2)));
    g.add(b.build(this.mats));
    // the sheet over the body: a draped hull with a head, a chest, the feet
    const sb = new FacetBuilder();
    sb.add('enamel', hull([[x - 0.26, y + 0.03, z - 0.85], [x + 0.26, y + 0.03, z - 0.85], [x - 0.3, y + 0.03, z + 0.9], [x + 0.3, y + 0.03, z + 0.9], [x - 0.12, y + 0.2, z - 0.7], [x + 0.12, y + 0.2, z - 0.7], [x - 0.18, y + 0.24, z - 0.35], [x + 0.18, y + 0.24, z - 0.35], [x - 0.15, y + 0.17, z + 0.1], [x + 0.15, y + 0.17, z + 0.1], [x - 0.12, y + 0.14, z + 0.65], [x + 0.12, y + 0.14, z + 0.65]]), 0xd8d8cc);
    sb.add('enamel', hull([[x - 0.1, y + 0.03, z - 1.0], [x + 0.1, y + 0.03, z - 1.0], [x - 0.11, y + 0.2, z - 0.9], [x + 0.11, y + 0.2, z - 0.9], [x, y + 0.27, z - 0.95], [x - 0.12, y + 0.08, z - 0.78], [x + 0.12, y + 0.08, z - 0.78]]), 0xd0d0c4);
    for (const k of [-1, 1]) sb.add('enamel', hull([[x + k * 0.05, y + 0.03, z + 0.86], [x + k * 0.15, y + 0.03, z + 0.86], [x + k * 0.06, y + 0.2, z + 0.96], [x + k * 0.13, y + 0.2, z + 0.96], [x + k * 0.1, y + 0.03, z + 1.0]]), 0xd8d8cc);
    this.sheet.add(sb.build(this.mats));
    // the foot tag
    const tag = paper(['B-2', '~'], 0.06, 0.035, { seed: 5, ppm: 600 });
    tag.position.set(x + 0.13, y + 0.15, z + 1.03); tag.rotation.set(0.3, 0, 0.2);
    this.sheet.add(tag);
    g.add(this.sheet);
    // the hand that slips out from under it
    const hb = new FacetBuilder();
    hb.add('leather', hull([[0, 0, -0.025], [0, 0, 0.025], [-0.02, -0.02, 0], [0.02, -0.02, 0], [0, -0.28, -0.02], [0, -0.28, 0.02], [-0.015, -0.28, 0], [0.015, -0.28, 0]]), 0xb8a090);
    hb.add('leather', hull([[-0.03, -0.28, -0.012], [0.03, -0.28, -0.012], [-0.03, -0.28, 0.012], [0.03, -0.28, 0.012], [-0.035, -0.4, -0.008], [0.035, -0.4, -0.008], [-0.03, -0.4, 0.01], [0.03, -0.4, 0.01]]), 0xa89080);
    this.hand.add(hb.build(this.mats));
    this.hand.position.set(x + 0.31, y + 0.06, z - 0.15);
    this.hand.rotation.z = 0.15;
    g.add(this.hand);
    this.hots.push({ key: 'sheet', objs: [this.sheet], label: 'The table', sub: 'specimen B-2 · under the sheet', press: () => { this.sheetW.kick(6); this.handT = 2.5; uiSound('squelch', 0.6); } });
    // the surgical lamp: a ceiling column, two arms, three faceted heads
    const lb = new FacetBuilder();
    lb.add('metal', prism(0.05, 0.5, 8), 0xd8d4c4, at(0, -0.25, 0));
    lb.add('metal', cbox(0.9, 0.06, 0.08, 0.02), 0xd8d4c4, at(0.45, -0.5, 0));
    const heads = [[-0.22, -0.62, 0.18], [0.22, -0.62, 0.18], [0, -0.62, -0.2]];
    for (const [hx, hy, hz] of heads) {
      lb.add('enamel', lathe([[0, 0.06], [0.06, 0.06], [0.16, 0.0], [0.18, -0.03], [0, -0.03]], 8), 0xe0dcd0, at(0.9 + hx, hy, hz));
      lb.add('metal', prism(0.012, 0.15, 6), 0xb8b4a8, at(0.9 + hx * 0.5, hy + 0.08, hz * 0.5, hz * 2, 0, -hx * 2));
    }
    this.lampArm.add(lb.build(this.mats));
    for (const [hx, hy, hz] of heads) { const gl = new THREE.Mesh(lathe([[0, -0.03], [0.16, -0.03], [0, -0.032]], 8), this.surgMat); gl.position.set(0.9 + hx, hy, hz); gl.userData.noGlow = true; this.lampArm.add(gl); }
    this.lampArm.position.set(x - 0.9, H, z);
    this.surg.position.set(0.9, -0.7, 0);
    this.surg.target.position.set(0.9, -3, 0.05);
    this.lampArm.add(this.surg, this.surg.target);
    this.surg.castShadow = true;
    this.surg.shadow.mapSize.set(1024, 1024);
    this.surg.shadow.camera.near = 0.1; this.surg.shadow.camera.far = 4;
    this.surg.shadow.bias = -0.0008; this.surg.shadow.normalBias = 0.012;
    g.add(this.lampArm);
    this.hots.push({ key: 'lamp', objs: [this.lampArm], label: 'Surgical lamp', sub: 'swing it, switch it', press: () => this.toggleLamp() });
    return g;
  }

  // ================================================================== the tanks
  private buildTanks() {
    const specs: [string, number, number][] = [['cowerling', -2.2, 0.62], ['ventling', -1.2, 1.4], ['lumenmoth', -0.2, 1.4]];
    specs.forEach(([key, x, scale], i) => {
      const g = new THREE.Group();
      const b = new FacetBuilder();
      const R = 0.36, TH = 1.9;
      // a plinth with hoses, the steel cap, the glass cylinder
      b.add('metal', lathe([[0, 0], [R + 0.08, 0], [R + 0.08, 0.3], [R + 0.04, 0.34], [0, 0.34]], 10), 0x5a5e5a);
      b.add('metal', lathe([[0, 0], [R + 0.06, 0], [R + 0.06, 0.18], [R - 0.05, 0.26], [0, 0.26]], 10), 0x5a5e5a, at(0, 0.34 + TH, 0));
      b.add('hazard', lathe([[R + 0.081, 0.24], [R + 0.081, 0.3]], 10), 0xffffff, at(0, 0, 0), { rep: 0.2 });
      for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4; b.add('metal', prism(0.02, TH, 6), C.dark, at(Math.cos(a) * (R + 0.03), 0.34 + TH / 2, Math.sin(a) * (R + 0.03))); }
      b.add('rubber', tube([[0, 0.34 + TH + 0.2, 0], [0.15, H - 0.1, -0.1], [0.4, H, -0.4]], 0.03, 8, 5), 0x1a1a1a);
      b.add('rubber', tube([[R + 0.06, 0.12, 0], [R + 0.3, 0.05, 0.1], [R + 0.6, 0.02, 0.1]], 0.025, 8, 4), 0x1a1a1a);
      g.add(b.build(this.mats));
      const fluid = new THREE.MeshBasicMaterial({ color: 0x2a8a3a, transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false });
      const fm = new THREE.Mesh(lathe([[0, 0.34], [R - 0.01, 0.34], [R - 0.01, 0.34 + TH * 0.93], [0, 0.34 + TH * 0.93]], 10), fluid);
      fm.userData.noGlow = true; fm.renderOrder = 3;
      g.add(fm);
      const gm = new THREE.Mesh(lathe([[R, 0.34], [R, 0.34 + TH]], 10), new THREE.MeshBasicMaterial({ color: 0x3a6a5a, transparent: true, opacity: 0.12, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      gm.userData.noGlow = true; gm.renderOrder = 4;
      g.add(gm);
      const light = new THREE.PointLight(0xb0f0c0, 1.1, 2.6, 2);
      light.position.set(0, 1.2, 0.5);
      g.add(light);
      g.position.set(x, 0, BACK + 0.55);
      this.scene.add(g);
      const lab = plate(this.mats, [`TANK ${i + 1} · ${key.toUpperCase()}`], 0.5, 0.07, { bg: 0xc8c0a0, px: 480 });
      lab.position.set(x, 0.2, BACK + 0.55 + R + 0.085);
      this.scene.add(lab);
      this.leds.add([x + 0.3, 0.27, BACK + 0.55 + R + 0.085], 0x40ff60, { size: 0.012, pattern: blink(0.7 + i * 0.2) });
      // the specimen
      let rig: Rig | null = null, def: any = null, fc: any = null;
      try {
        def = species(key);
        if (def) {
          rig = def.build() as Rig;
          rig.root.scale.setScalar(scale);
          rig.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = false; m.receiveShadow = false; } });
          g.add(rig.root);
          fc = { id: 'menu-tank-' + i, x: 0, z: 0, y: 0, facing: 0, speed: 0, state: 'idle', mem: { netMem: {} }, attackPhase: 0, hp: 10, hitFlash: 0, dead: false, deathT: 0, targetId: null, tamedBy: null, phase: 0, observed: false, stateT: 0, zoneKey: 'menu', attackT: 0, sp: def, noiseCooldown: 99 };
        }
      } catch (e) { console.warn('tank specimen', key, e); rig = null; }
      const tank: Tank = { g, fluid, light, rig, def, fc, boil: 0, kick: 0, base: new THREE.Vector3(0, 1.0, 0), seed: i * 1.7 };
      this.tanks.push(tank);
      this.hots.push({ key: 'tank' + i, objs: [fm, gm], glow: [], label: `Specimen tank ${i + 1}`, sub: `${def?.name ?? key} · suspended`, press: () => this.pokeTank(tank) });
    });
  }
  private pokeTank(t: Tank) {
    t.boil = 2.2; t.kick = 1;
    uiSound('hiss', 0.7); setTimeout(() => uiSound('tink', 0.6), 80);
    if (t.fc) t.fc.hitFlash = 1;
  }

  // ================================================================== the rig
  private buildRig() {
    const base = new THREE.Vector3(1.15, 0.12, -1.25);
    const b = new FacetBuilder();
    b.add('metal', cbox(0.5, 0.12, 0.5, 0.02), C.darker, at(base.x, 0.06, base.z));
    b.add('hazard', cbox(0.56, 0.02, 0.56, 0.006), 0xffffff, at(base.x, 0.005, base.z), { rep: 0.2 });
    for (const [dx, dz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) b.add('metal', bolt(0.02, 0.014), C.steel, at(base.x + dx, 0.12, base.z + dz));
    this.scene.add(b.build(this.mats));
    const mount = armBase(this.mats);
    mount.position.copy(base); mount.position.y = 0.12;
    this.scene.add(mount);
    const seg1 = armSegment(this.mats, 1.0, 0.13), seg2 = armSegment(this.mats, 0.9, 0.11);
    const head = new THREE.Group();
    head.add(clawPalm(this.mats));
    const fingers: THREE.Object3D[] = [];
    for (const [k, ry] of [[-1, Math.PI], [1, 0]] as const) { const f = clawFinger(this.mats); f.position.set(k * 0.06, 0.12, 0); f.rotation.y = ry; f.userData.k = k; head.add(f); fingers.push(f); }
    this.scene.add(seg1, seg2, head);
    const B = base.clone().setY(0.38);
    const routine = [new THREE.Vector3(0.35, 1.45, -0.9), new THREE.Vector3(0.05, 1.12, -0.95), new THREE.Vector3(0.2, 1.35, -0.4), new THREE.Vector3(0.55, 1.08, -0.2), new THREE.Vector3(0.9, 1.6, -0.6), new THREE.Vector3(0.0, 1.3, -1.3)];
    this.arm = { base: B, L1: 1.0, L2: 0.9, seg1, seg2, head, fingers, tip: routine[0].clone(), vel: new THREE.Vector3(), goal: routine[0].clone(), grip: 0, gripT: 0, step: 0, stepT: 0, routine, busy: 0 };
    this.hots.push({ key: 'rig', objs: [seg1, seg2, head], label: 'Hydraulic rig', sub: 'run its routine', press: () => this.runRig() });
  }
  private runRig() { if (!this.arm) return; this.arm.busy = 6; this.arm.stepT = 0; uiSound('servo', 0.9); }
  private updateRig(dt: number, t: number) {
    const a = this.arm;
    if (!a) return;
    a.busy = Math.max(0, a.busy - dt);
    a.stepT -= dt;
    if (a.stepT <= 0) {
      a.step = (a.step + 1) % a.routine.length;
      a.goal.copy(a.routine[a.step]);
      a.stepT = a.busy > 0 ? 0.55 : 2.2 + Math.sin(t) * 0.6;
      a.gripT = a.step % 2;
      if (a.busy > 0) uiSound('servo', 0.4);
    }
    const k = a.busy > 0 ? 90 : 26, c = a.busy > 0 ? 14 : 8;
    for (let rem = dt; rem > 1e-5; rem -= 1 / 90) {
      const h = Math.min(rem, 1 / 90);
      a.vel.x += ((a.goal.x - a.tip.x) * k - a.vel.x * c) * h; a.vel.y += ((a.goal.y - a.tip.y) * k - a.vel.y * c) * h; a.vel.z += ((a.goal.z - a.tip.z) * k - a.vel.z * c) * h;
      a.tip.addScaledVector(a.vel, h);
    }
    a.grip = damp(a.grip, a.gripT, 10, dt);
    // two-bone IK, elbow up and back
    const d = this.v.subVectors(a.tip, a.base);
    let len = d.length();
    len = Math.max(Math.abs(a.L1 - a.L2) + 0.05, Math.min(a.L1 + a.L2 - 0.01, len));
    const dir = d.normalize();
    const ax = (a.L1 * a.L1 - a.L2 * a.L2 + len * len) / (2 * len);
    const hgt = Math.sqrt(Math.max(0, a.L1 * a.L1 - ax * ax));
    const pole = this.v2.set(0.3, 1, 0.4).normalize();
    pole.addScaledVector(dir, -pole.dot(dir)).normalize();
    const elbow = this.v3.copy(a.base).addScaledVector(dir, ax).addScaledVector(pole, hgt);
    const tmpD = new THREE.Vector3();
    const place = (o: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3) => { o.position.copy(from); o.quaternion.setFromUnitVectors(UP, tmpD.subVectors(to, from).normalize()); };
    const tipP = a.base.clone().addScaledVector(dir, len);
    place(a.seg1, a.base, elbow);
    place(a.seg2, elbow, tipP);
    a.head.position.copy(tipP);
    a.head.quaternion.setFromUnitVectors(UP, new THREE.Vector3().subVectors(tipP, elbow).normalize());
    for (const f of a.fingers) f.rotation.z = (f.userData.k as number) * (0.15 + (1 - a.grip) * 0.5);
  }

  // ================================================================== the board
  private drawBoard() {
    const { cv, tex, page } = this.board;
    const c = cv.getContext('2d')!;
    c.fillStyle = '#e8ece4'; c.fillRect(0, 0, 256, 128);
    // ghost smears of old work
    c.fillStyle = 'rgba(120,130,150,0.12)';
    for (let i = 0; i < 30; i++) c.fillRect(Math.floor(Math.random() * 240), Math.floor(Math.random() * 120), 12 + Math.floor(Math.random() * 30), 2);
    const blue = '#2a4aa0', red = '#b82a1e', ink = '#1a1a22';
    const line = (pts: [number, number][], col: string) => { c.fillStyle = col; for (let i = 0; i + 1 < pts.length; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[i + 1]; const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)); for (let k = 0; k <= n; k++) c.fillRect(Math.round(x0 + (x1 - x0) * k / n), Math.round(y0 + (y1 - y0) * k / n), 1, 1); } };
    if (page === 0) {
      bitText(c, 'RB-17 HUSH', 8, 4, { color: blue, outline: null });
      // the sketch: a stick body with the horn
      line([[40, 40], [40, 80], [30, 110]], ink); line([[40, 80], [50, 110]], ink); line([[40, 48], [26, 70]], ink); line([[40, 48], [52, 36], [50, 30]], ink);
      line([[40, 40], [44, 32], [52, 28], [62, 26]], ink); line([[62, 18], [62, 34], [54, 30]], ink); line([[62, 18], [52, 28]], ink);
      line([[70, 26], [96, 26]], red); line([[92, 22], [96, 26], [92, 30]], red);
      bitText(c, 'SOUND', 100, 18, { color: red, outline: null });
      bitText(c, 'BLIND', 100, 40, { color: ink, outline: null });
      bitText(c, 'NO TAPPING', 100, 62, { color: red, outline: null });
      line([[100, 78], [180, 78]], red);
      // a graph
      line([[190, 110], [190, 40], [190, 110], [250, 110]], ink);
      line([[192, 100], [200, 96], [208, 90], [216, 70], [224, 72], [232, 50], [240, 46], [248, 30]], blue);
      bitText(c, 'DEBT', 200, 22, { color: blue, outline: null });
      bitText(c, '?', 120, 90, { color: ink, outline: null, scale: 2 });
    } else {
      bitText(c, 'INTAKE FLOW', 8, 4, { color: blue, outline: null });
      const box = (x: number, y: number, w: number, s: string, col: string) => { line([[x, y], [x + w, y], [x + w, y + 22], [x, y + 22], [x, y]], col); bitText(c, s, x + 4, y + 3, { color: col, outline: null }); };
      box(8, 30, 50, 'RM 4', ink); box(98, 30, 46, 'B-2', ink); box(184, 30, 46, 'C-1', red);
      line([[60, 41], [96, 41]], blue); line([[146, 41], [182, 41]], blue);
      line([[92, 37], [96, 41], [92, 45]], blue); line([[178, 37], [182, 41], [178, 45]], blue);
      bitText(c, 'CHAIR', 8, 62, { color: ink, outline: null });
      bitText(c, 'PRESS', 98, 62, { color: ink, outline: null });
      bitText(c, 'FEED', 184, 62, { color: red, outline: null });
      line([[30, 86], [30, 104], [220, 104], [220, 86]], red);
      bitText(c, 'THROUGH THE WALL', 60, 106, { color: red, outline: null });
    }
    tex.needsUpdate = true;
  }
  private flipBoard() { this.board.flip = 1; uiSound('creak', 0.7); }
  private toggleLamp() { this.surgOn = this.surgOn ? 0 : 1; this.lampW.kick(0.8); uiSound('click', 1); }
  pointer(nx: number, ny: number) { this.ptr.set(nx, ny); }
  /** the decorator's build mode: up and back, looking down on the floor */
  setBuild(on: boolean) { this.buildT = on ? 1 : 0; }

  // ================================================================== frame
  frame(aspect: number, portrait: boolean) {
    const c = this.cam;
    c.aspect = aspect;
    c.fov = portrait ? Math.min(88, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(31)) / aspect)) * 0.9) : 50;
    c.updateProjectionMatrix();
    const e = c.projectionMatrix.elements;
    e[9] = portrait ? -0.12 : 0;
    c.projectionMatrixInverse.copy(c.projectionMatrix).invert();
  }

  update(dt: number, t: number, full: boolean) {
    this.t = t;
    // ---- lights
    this.surgLvl = damp(this.surgLvl, this.surgOn, 14, dt);
    this.surg.intensity = 30 * this.surgLvl * (0.97 + Math.random() * 0.03);
    this.surgMat.color.setScalar(0.25 + 2.4 * this.surgLvl);
    const pool = this.scene.getObjectByName('surgPool'); if (pool) pool.visible = this.surgLvl > 0.1;
    const sw = this.lampW.update(dt);
    this.lampArm.rotation.y = sw * 0.25;
    const stripK = Math.sin(t * 23) + Math.sin(t * 7.7) > 1.7 ? 0.3 : 1;
    this.strip.intensity = 3.2 * stripK;
    this.stripMat.color.setScalar(0.25 + 1.2 * stripK);
    this.leds.update(t);
    // ---- tanks: the fluid breathes, bubbles rise, the specimens drift and turn
    for (const tk of this.tanks) {
      tk.boil = Math.max(0, tk.boil - dt);
      tk.kick = Math.max(0, tk.kick - dt * 1.5);
      const pulse = 0.85 + 0.15 * Math.sin(t * 1.3 + tk.seed);
      tk.light.intensity = 0.45 * pulse + tk.boil * 0.8;
      tk.fluid.color.setRGB(0.03 + tk.boil * 0.1, 0.22 * pulse + tk.boil * 0.2, 0.09);
      if (full && Math.random() < dt * (2 + tk.boil * 30)) this.puffs.emit(this.v.set(tk.g.position.x + (Math.random() - 0.5) * 0.5, 0.45, tk.g.position.z + (Math.random() - 0.5) * 0.5), new THREE.Vector3(0, 0.2 + tk.boil * 0.3, 0), { life: 2.6, s0: 0.006, s1: 0.016, color: 0x8aff9a, rise: 0.25 });
      const r = tk.rig;
      if (r) {
        try { if (tk.fc && tk.def?.animateGallery) tk.def.animateGallery(r, t * (1 + tk.kick * 3)); else if (tk.fc) tk.def.animate(r, tk.fc, t, dt); } catch { /* the specimen's own code */ }
        r.root.position.set(Math.sin(t * 0.4 + tk.seed) * 0.05 + (Math.random() - 0.5) * tk.kick * 0.06, tk.base.y + Math.sin(t * 0.6 + tk.seed) * 0.06, Math.cos(t * 0.33 + tk.seed) * 0.04);
        r.root.rotation.set(Math.sin(t * 0.21 + tk.seed) * 0.25 + tk.kick * 0.4, t * 0.15 + tk.seed, Math.sin(t * 0.27) * 0.2);
      }
    }
    if (full) this.puffs.update(dt, this.cam, () => 0.9);
    // ---- machines
    this.centriV = damp(this.centriV, 0.4, 0.5, dt);
    this.centriA += this.centriV * dt;
    this.centri.rotation.y = this.centriA;
    this.reelV = damp(this.reelV, 1, 0.6, dt);
    this.reels.forEach((r, i) => { r.rotation.z += dt * this.reelV * (i ? -1.1 : 0.9) * (Math.sin(t * 0.5 + i) > -0.3 ? 1 : 0); });
    this.flame.scale.set(1, 0.85 + Math.random() * 0.3, 1);
    // the board flips round its vertical axis
    if (this.board.flip > 0) {
      this.board.flip = Math.max(0, this.board.flip - dt * 1.8);
      const k = 1 - this.board.flip;
      if (k > 0.5 && this.board.flip + dt * 1.8 >= 0.5 && this.board.flip < 0.5) { this.board.page = 1 - this.board.page; this.drawBoard(); }
      this.boardG.scale.x = Math.abs(Math.cos(k * Math.PI)) * 0.98 + 0.02;
    } else this.boardG.scale.x = 1;
    // the sheet and the hand under it
    const sx = this.sheetW.update(dt);
    this.sheet.position.y = Math.abs(sx) * 0.01; this.sheet.rotation.z = sx * 0.01;
    this.handT = Math.max(0, this.handT - dt);
    const hk = this.handT > 0 ? 1 : Math.max(0, Math.sin(t * 0.21) - 0.92) * 12;
    this.hand.rotation.z = 0.15 + Math.min(1, hk) * 0.5 + (this.handT > 0 ? Math.sin(t * 30) * 0.08 : 0);
    this.updateRig(dt, t);
    if (!full) return;
    this.ptrS.x = damp(this.ptrS.x, this.ptr.x, 3, dt); this.ptrS.y = damp(this.ptrS.y, this.ptr.y, 3, dt);
    this.build = damp(this.build, this.buildT, 3, dt);
    if (this.build > 0.002) {
      const k = this.build;
      this.cam.position.lerpVectors(this.camPos, this.buildPos, k);
      this.cam.lookAt(this.v.lerpVectors(this.camLook, this.buildLook, k));
      return;
    }
    this.cam.position.set(this.camPos.x - this.ptrS.x * 0.2 + Math.sin(t * 0.27) * 0.012, this.camPos.y + this.ptrS.y * 0.06 + Math.sin(t * 0.39) * 0.008, this.camPos.z);
    this.cam.lookAt(this.v.set(this.camLook.x + this.ptrS.x * 0.3, this.camLook.y - this.ptrS.y * 0.12, this.camLook.z));
  }
}
