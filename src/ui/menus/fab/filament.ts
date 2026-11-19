// THE FILAMENT MAKER (round 20): a small extrusion line on a steel skid, built in the lab's fab bay
// (./bay.ts) or at a camp (./camp.ts). Left to right, in its own frame (front +Z, the line along +X):
//   the SEAM FEED   a lagged pipe down from the ceiling ending in a knife gate over the hopper; a rotary
//                   SELECTOR on the shredder's face picks which material comes down (a lamp per material,
//                   lit when there is a spool's worth to take)
//   the SHREDDER    a hopper over two counter-rotating cutter shafts; the big LEVER on its face runs it
//   the EXTRUDER    a gearbox with a spoked HANDWHEEL driving the screw through a bolted coupling, the
//                   water-jacketed feed throat, the barrel under three copper heater bands (they glow as
//                   they heat), the brass die; the heater KNOB and the barrel's gauge on the control box
//   the BATH        a stainless trough of water with two guide rollers; a red VALVE on the riser runs
//                   cold water from a swan-neck spout; its own gauge reads the bath
//   the WINDER      rubber puller rollers, the spool on its axle under a traverse guide, the green
//                   mushroom BUTTON that runs it, the cutter; full spools roll down the rack below
// Every step is a physical act: pull the gate (the chunks tumble in), pull the lever (the cutters chew),
// turn the knob into the green and hold it there (the bands glow), crank the handwheel round (the strand
// comes out of the die and sags into the water), hold the valve (the steam stops), hold the button (it
// winds; the spool is cut free and rolls off). Space does the next step's act; a pilot lamp blinks by
// the control that is next. One run: 1 kg of one material -> one spool (src/game/economy/fab.ts).
import * as THREE from 'three';
import { FacetBuilder, at, cbox, prism, lathe, tube, bolt, C, type V3 } from '../monitor/props';
import { band, starGeo } from '../scene/facet';
import { Puffs } from '../scene/fx';
import { MAT, type Mat } from '../../../game/economy/matter';
import { FILAMENT, feedable, takeFeed, windSpool, spools } from '../../../game/economy/fab';
import { gauge, spoolModel, pilot, glowMat, makerPlate, picto, damp, clamp01, ease, hitAny, under, SPOOL, type FabCtx, type Gauge, type Hum, type Pilot, type Pose, type SpoolModel } from './kit';

type Step = 'idle' | 'load' | 'shred' | 'melt' | 'extrude' | 'cool' | 'spool' | 'done';
const MATS_ORDER: Mat[] = ['metal', 'polymer', 'fibre', 'wood', 'mineral', 'chem', 'organic', 'exotic'];

// the line's landmarks (local metres)
const Y_BAR = 1.0, X_THROAT = -0.7, X_BAR0 = -0.8, X_BAR1 = 0.26, X_DIE = 0.38;
const HOP = { x: -0.7, y0: 1.4, y1: 1.7 };
const BATH = { x0: 0.44, x1: 0.98, y: 0.86, water: 0.82, w: 0.2 };
const AXLE = new THREE.Vector3(1.15, 1.05, 0.0);
const WHEEL = new THREE.Vector3(-0.935, 1.0, 0.205);
const KNOB = new THREE.Vector3(-0.08, 0.58, 0.215);
const VALVE = new THREE.Vector3(0.88, 0.99, 0.17);
const BUTTON = new THREE.Vector3(1.15, 0.62, 0.22);
const LEVER = new THREE.Vector3(-0.5, 1.27, 0.19);
const RACK = { x0: 0.5, x1: 1.28, y0: 0.16, y1: 0.2, z: 0.2 };
// the strand's way: out of the die, down into the water, under two rollers, up through the puller, onto the spool
const PATH: V3[] = [[X_DIE, Y_BAR, 0], [0.45, 0.93, 0], [0.52, 0.8, 0], [0.58, 0.775, 0], [0.75, 0.772, 0], [0.9, 0.775, 0], [0.96, 0.84, 0], [1.03, 0.935, 0], [1.08, 0.99, 0]];
// what each step needs, in seconds (held) or turns
const MELT_HOLD = 1.5, CRANK_TURNS = 3, COOL_HOLD = 1.7, WIND_HOLD = 2.4;
const MELT_LO = 0.6, MELT_HI = 0.8;

export class FilamentMaker {
  group = new THREE.Group();
  step: Step = 'idle';
  /** the operator is at it (the camera is in) */
  active = false;
  /** the material in the hopper now, and the selector's setting */
  mat: Mat | null = null;
  sel: Mat = 'polymer';
  onOpen?: () => void;
  onClose?: () => void;
  private ctx: FabCtx;
  // moving parts
  private gate = new THREE.Group(); private gateT = 0;
  private selKnob = new THREE.Group(); private selLamps: { m: Mat; mat: THREE.MeshBasicMaterial }[] = [];
  private lever = new THREE.Group(); private leverA = 0.3; private leverV = 0; private leverHeld = false;
  private rotors: THREE.Group[] = []; private rotorV = 0;
  private chunks: { mesh: THREE.Mesh; from: THREE.Vector3; to: THREE.Vector3; t: number; delay: number }[] = [];
  private chunkMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.7, metalness: 0.1, flatShading: true });
  private flakes = new THREE.Group();
  private shredT = 0;
  private bands: THREE.MeshStandardMaterial;
  private heatL = new THREE.PointLight(0xff7a2a, 0, 1.4, 1.8);
  private knob = new THREE.Group(); private dial = 0; private temp = 0; private meltT = 0; private knobHeld = false;
  private barrelG!: Gauge; private bathG!: Gauge;
  private wheel = new THREE.Group(); private coupling = new THREE.Group(); private turns = 0; private wheelV = 0;
  private strandMat: THREE.MeshStandardMaterial;
  private strand: THREE.Mesh;
  private strandTex: THREE.CanvasTexture;
  private curve = new THREE.CatmullRomCurve3(PATH.map((p) => new THREE.Vector3(...p)), false, 'centripetal');
  private shown = -1;
  private valve = new THREE.Group(); private valveA = 0; private flow = 0; private bathHeat = 0; private coolT = 0; private valveHeld = false;
  private stream: THREE.Mesh; private water: THREE.Mesh;
  private puller: THREE.Group[] = [];
  private spool!: SpoolModel; private spoolA = 0; private spoolV = 0; private windT = 0; private btnHeld = false;
  private btn = new THREE.Group(); private btnCap!: THREE.Mesh;
  private guide = new THREE.Group();
  private cutter = new THREE.Group(); private cutT = 0;
  private rack = new THREE.Group(); private rackKey = '';
  private flying: { s: SpoolModel; t: number; from: THREE.Vector3; to: THREE.Vector3 } | null = null;
  private pilots: Record<'gate' | 'lever' | 'knob' | 'wheel' | 'valve' | 'button', Pilot>;
  private puffs = new Puffs(60);
  private hums: Partial<Record<'shred' | 'heat' | 'water' | 'wind' | 'steam', Hum | null>> = {};
  private drag: { kind: 'lever' | 'knob' | 'wheel'; x: number; y: number; a0: number; last: number } | null = null;
  private body: THREE.Group;
  private t = 0;
  private said = new Set<string>();
  private selT = 0;
  private v = new THREE.Vector3();

  constructor(ctx: FabCtx) {
    this.ctx = ctx;
    this.group.name = 'filamentMaker';
    this.bands = glowMat(0xb87333, 0.45, 0.6);
    // the strand: the filament's colour with faint rings (they scroll while it runs)
    const cv = document.createElement('canvas'); cv.width = 32; cv.height = 4;
    const cg = cv.getContext('2d')!; cg.fillStyle = '#ffffff'; cg.fillRect(0, 0, 32, 4); cg.fillStyle = '#c8c8c8'; for (let i = 0; i < 32; i += 8) cg.fillRect(i, 0, 2, 4);
    this.strandTex = new THREE.CanvasTexture(cv); this.strandTex.wrapS = this.strandTex.wrapT = THREE.RepeatWrapping; this.strandTex.repeat.set(30, 1); this.strandTex.magFilter = THREE.NearestFilter;
    this.strandMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: this.strandTex, roughness: 0.3, metalness: 0.05, emissive: new THREE.Color(0) });
    this.strand = new THREE.Mesh(new THREE.BufferGeometry(), this.strandMat);
    this.strand.castShadow = true;
    this.pilots = { gate: pilot(), lever: pilot(), knob: pilot(), wheel: pilot(), valve: pilot(), button: pilot(0x60ff60) };
    this.body = this.build();
    this.group.add(this.body, this.strand, this.flakes, this.rack, this.heatL);
    for (const p of Object.values(this.pilots)) this.group.add(p.mesh);
    ctx.world.add(this.puffs.mesh);
    this.stream = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.009, 1, 6, 4, true), new THREE.MeshStandardMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.55, roughness: 0.05, metalness: 0.1, emissive: new THREE.Color(0x10303a) }));
    this.stream.userData.noGlow = true;
    this.group.add(this.stream);
    this.water = this.group.getObjectByName('water') as THREE.Mesh;
    this.placePilots();
    this.setMat(this.firstFeedable() ?? 'polymer');
    this.refreshRack();
    this.showStrand(0);
    this.hotList();
    window.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
    window.addEventListener('keydown', this.onKey, true);
    window.addEventListener('keyup', this.onKeyUp, true);
  }
  dispose() {
    window.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onUp);
    window.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('keyup', this.onKeyUp, true);
    this.stopHums();
    this.puffs.mesh.removeFromParent();
  }

  // ================================================================== the model
  private build(): THREE.Group {
    const { mats } = this.ctx;
    const g = new THREE.Group();
    const b = new FacetBuilder();
    const GREEN = 0x4e6a48, YEL = 0xd8a828, STEEL = C.steel, DARK = C.dark;
    // ---- the skid: two channel rails, a checker deck, hazard ends, levelling feet
    for (const z of [-0.2, 0.2]) b.add('metal', cbox(2.36, 0.09, 0.06, 0.006), DARK, at(0.08, 0.045, z));
    b.add('metal', cbox(2.3, 0.02, 0.44, 0.004), 0x5a5e5a, at(0.08, 0.1, 0), { rep: 0.12 });
    for (let i = 0; i < 46; i++) b.add('metal', cbox(0.03, 0.006, 0.008, 0.002), 0x6e726c, at(-1.05 + i * 0.05, 0.112, -0.17 + (i % 6) * 0.07, 0, (i % 2 ? 0.7 : -0.7)));
    for (const x of [-1.08, 1.24]) b.add('hazard', cbox(0.08, 0.092, 0.46, 0.004), 0xffffff, at(x, 0.046, 0), { rep: 0.2 });
    for (const x of [-1.0, 1.15]) for (const z of [-0.2, 0.2]) b.add('metal', lathe([[0, 0], [0.035, 0], [0.03, 0.02], [0.012, 0.03], [0, 0.03]], 6), DARK, at(x, -0.01, z));
    // ---- the gearbox, its motor, the coupling's guard
    b.add('paint', cbox(0.24, 0.38, 0.34, 0.02), GREEN, at(-0.935, 1.0, 0), { rep: 0.3 });
    b.add('paint', cbox(0.28, 0.06, 0.38, 0.01), GREEN, at(-0.935, 0.79, 0));
    for (const z of [-0.12, 0.12]) b.add('metal', cbox(0.05, 0.68, 0.05, 0.006), DARK, at(-0.935, 0.44, z));
    for (let i = 0; i < 8; i++) b.add('chrome', bolt(0.008, 0.006), 0xc8ccc8, at(-0.935 + (i % 4 - 1.5) * 0.06, 1.0 + (i < 4 ? 0.17 : -0.17), 0.172, Math.PI / 2));
    b.add('paint', prism(0.085, 0.3, 12), GREEN, at(-0.935, 1.27, -0.06, 0, 0, Math.PI / 2));
    for (let i = 0; i < 7; i++) b.add('metal', prism(0.092, 0.012, 12), 0x3a4a36, at(-1.06 + i * 0.04, 1.27, -0.06, 0, 0, Math.PI / 2));
    b.add('metal', cbox(0.1, 0.07, 0.08, 0.01), DARK, at(-0.935, 1.27, 0.06));
    b.add('rubber', tube([[-0.935, 1.27, 0.1], [-0.935, 1.33, 0.18], [-1.05, 1.4, 0.0], [-1.1, 1.6, -0.25], [-1.1, 2.4, -0.3]], 0.012, 12, 5), 0x1a1a1a);
    // the oil sight glass and a filler cap on the gearbox
    b.add('glass', prism(0.018, 0.01, 10), 0xffc040, at(-0.88, 0.9, 0.172, Math.PI / 2));
    b.add('brass', prism(0.022, 0.02, 8), 0xffffff, at(-0.935, 1.2, 0.08));
    // the coupling guard (an open cage over the turning flange)
    for (const a of [0, 1, 2, 3]) { const yy = Y_BAR + Math.cos(a * Math.PI / 2) * 0.1, zz = Math.sin(a * Math.PI / 2) * 0.1; b.add('paint', cbox(0.06, 0.012, 0.012, 0.003), YEL, at(-0.8, yy, zz)); }
    // ---- the barrel, the feed throat, the bands' terminal boxes and wires
    b.add('metal', prism(0.075, X_BAR1 - X_BAR0, 14), 0x9a9e9a, at((X_BAR0 + X_BAR1) / 2, Y_BAR, 0, 0, 0, Math.PI / 2), { rep: 0.3 });
    b.add('paint', cbox(0.16, 0.2, 0.22, 0.012), 0x3a5a7a, at(X_THROAT, Y_BAR, 0));
    for (const z of [-0.11, 0.11]) b.add('copper', prism(0.012, 0.08, 6), 0xffffff, at(X_THROAT, Y_BAR - 0.04, z * 1.06, Math.PI / 2));
    b.add('rubber', tube([[X_THROAT, Y_BAR - 0.04, 0.13], [X_THROAT + 0.03, 0.75, 0.2], [X_THROAT - 0.05, 0.3, 0.18], [X_THROAT, 0.12, 0.12]], 0.012, 10, 5), 0x2a4a8a);
    // the chute from the shredder into the throat
    b.add('paint', cbox(0.13, 0.08, 0.13, 0.006, -0.15), YEL, at(X_THROAT, 1.13, 0));
    const BANDS = [-0.47, -0.17, 0.12];
    for (const x of BANDS) {
      b.add('paint', cbox(0.05, 0.04, 0.05, 0.006), 0x2a2a2a, at(x, Y_BAR + 0.105, 0));
      b.add('rubber', tube([[x, Y_BAR + 0.125, 0], [x - 0.02, Y_BAR + 0.2, -0.08], [x - 0.08, Y_BAR + 0.18, -0.2], [-0.12, 0.8, -0.2], [-0.12, 0.72, -0.14]], 0.008, 12, 4), x === BANDS[1] ? 0x8a2a1a : 0x1a1a1a);
    }
    // the die: a stepped brass cone, its clamp ring, a breaker plate
    b.add('metal', prism(0.095, 0.03, 12), DARK, at(X_BAR1 + 0.015, Y_BAR, 0, 0, 0, Math.PI / 2));
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; b.add('chrome', bolt(0.009, 0.008), 0xc8ccc8, at(X_BAR1 + 0.032, Y_BAR + Math.cos(a) * 0.075, Math.sin(a) * 0.075, 0, 0, -Math.PI / 2)); }
    b.add('brass', lathe([[0.075, 0], [0.075, 0.025], [0.045, 0.07], [0.018, 0.1], [0.008, 0.11], [0, 0.11]], 12), 0xffffff, at(X_BAR1 + 0.03, Y_BAR, 0, 0, 0, -Math.PI / 2));
    // ---- the shredder on its frame, the hopper, its motor
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add('metal', cbox(0.04, 1.06, 0.04, 0.005), DARK, at(HOP.x + sx * 0.2, 0.62, sz * 0.17));
    for (const y of [0.42, 1.12]) for (const sz of [-1, 1]) b.add('metal', cbox(0.44, 0.03, 0.03, 0.004), DARK, at(HOP.x, y, sz * 0.17));
    b.add('paint', cbox(0.38, 0.26, 0.32, 0.02), YEL, at(HOP.x, 1.27, 0), { rep: 0.3 });
    for (let i = 0; i < 10; i++) b.add('chrome', bolt(0.007, 0.005), 0xc8ccc8, at(HOP.x - 0.17 + (i % 5) * 0.085, 1.27 + (i < 5 ? 0.115 : -0.115), 0.162, Math.PI / 2));
    // the hopper: a sheet frustum with a rolled lip, open to the cutters below
    b.add('chrome', lathe([[0.21, 0], [0.38, 0.3], [0.395, 0.3], [0.395, 0.315], [0.37, 0.315], [0.2, 0.012]], 4, 0.5), 0xc8ccc4, at(HOP.x, HOP.y0, 0), { rep: 0.25 });
    // a caged inspection lamp clamped to the seam pipe, over the hopper
    b.add('metal', cbox(0.03, 0.05, 0.08, 0.006), DARK, at(HOP.x + 0.06, 2.12, 0.05));
    b.add('paint', prism(0.04, 0.07, 8, { rTop: 0.025 }), YEL, at(HOP.x + 0.1, 2.08, 0.1, 0.6, 0, -0.5));
    b.add('lamp', prism(0.026, 0.02, 8), 0xfff0c8, at(HOP.x + 0.12, 2.04, 0.13, 0.6, 0, -0.5));
    for (let i = 0; i < 4; i++) b.add('metal', cbox(0.004, 0.06, 0.004, 0.001), 0x2a2a2a, at(HOP.x + 0.12 + Math.cos(i * 1.57) * 0.03, 2.03, 0.13 + Math.sin(i * 1.57) * 0.03, 0.6, 0, -0.5));
    b.add('hazard', lathe([[0.396, 0.27], [0.397, 0.3]], 4, 0.5), 0xffffff, at(HOP.x, HOP.y0, 0), { rep: 0.15 });
    // the shredder motor and its belt guard
    b.add('paint', prism(0.075, 0.26, 12), GREEN, at(HOP.x, 1.25, -0.25, 0, 0, Math.PI / 2));
    for (let i = 0; i < 6; i++) b.add('metal', prism(0.082, 0.01, 12), 0x3a4a36, at(HOP.x - 0.1 + i * 0.04, 1.25, -0.25, 0, 0, Math.PI / 2));
    b.add('paint', cbox(0.06, 0.24, 0.2, 0.01), YEL, at(HOP.x + 0.21, 1.27, -0.12));
    // ---- the seam feed: a lagged pipe down from above, a yellow band, the knife gate's body, a spout
    const top = this.ctx.lab ? 3.0 : 2.6;
    b.add('paint', prism(0.06, top - 1.92, 10), 0x7a6a3a, at(HOP.x, (top + 1.92) / 2, -0.02), { rep: 0.35 });
    b.add('sponge', prism(0.075, 0.5, 10), 0xd8d0b8, at(HOP.x, 2.35, -0.02));
    b.add('paint', prism(0.064, 0.05, 10), YEL, at(HOP.x, 2.05, -0.02));
    b.add('metal', cbox(0.2, 0.08, 0.16, 0.01), DARK, at(HOP.x, 1.9, -0.02));
    for (const sx of [-1, 1]) b.add('chrome', bolt(0.01, 0.008), 0xc8ccc8, at(HOP.x + sx * 0.08, 1.945, -0.02));
    b.add('metal', prism(0.05, 0.12, 8, { rTop: 0.045 }), 0x8a8e8a, at(HOP.x, 1.81, -0.02));
    // ---- the control box under the barrel: knob, gauge (separate), a mains isolator, lamps, a cable gland
    b.add('paint', cbox(0.5, 0.6, 0.3, 0.02), GREEN, at(-0.2, 0.42, 0.05), { rep: 0.3 });
    b.add('metal', cbox(0.46, 0.56, 0.01, 0.003), 0x3a4a36, at(-0.2, 0.42, 0.205));
    b.add('paint', cbox(0.07, 0.1, 0.04, 0.008), 0xc8301c, at(-0.38, 0.32, 0.22));
    b.add('paint', cbox(0.014, 0.06, 0.03, 0.004), 0xe8c030, at(-0.38, 0.32, 0.245, 0, 0, 0.4));
    for (let i = 0; i < 3; i++) b.add('chrome', lathe([[0, 0], [0.016, 0], [0.016, 0.01], [0, 0.012]], 8), 0xc8ccc8, at(-0.27 + i * 0.05, 0.28, 0.21, Math.PI / 2));
    b.add('rubber', tube([[-0.2, 0.12, 0.08], [-0.25, 0.06, -0.1], [-0.4, 0.04, -0.28]], 0.015, 8, 5), 0x1a1a1a);
    // ---- the water bath: stainless trough on legs, the rollers' brackets, a drain cock, the riser and spout
    const bx = (BATH.x0 + BATH.x1) / 2, bw = BATH.x1 - BATH.x0;
    b.add('chrome', cbox(bw, 0.012, BATH.w, 0.003), 0xb8c0c4, at(bx, BATH.y - 0.2, 0));
    for (const z of [-1, 1]) b.add('chrome', cbox(bw, 0.2, 0.012, 0.003), 0xb8c0c4, at(bx, BATH.y - 0.1, z * BATH.w / 2));
    for (const x of [BATH.x0, BATH.x1]) b.add('chrome', cbox(0.012, 0.2, BATH.w, 0.003), 0xb8c0c4, at(x, BATH.y - 0.1, 0));
    for (const x of [BATH.x0, BATH.x1]) b.add('chrome', cbox(0.02, 0.012, BATH.w + 0.02, 0.003), 0xd8dcdc, at(x, BATH.y, 0));
    for (const z of [-1, 1]) b.add('chrome', cbox(bw + 0.02, 0.012, 0.02, 0.003), 0xd8dcdc, at(bx, BATH.y, z * (BATH.w / 2 + 0.005)));
    for (const x of [BATH.x0 + 0.04, BATH.x1 - 0.04]) for (const z of [-1, 1]) b.add('metal', cbox(0.03, BATH.y - 0.32, 0.03, 0.004), DARK, at(x, (BATH.y - 0.2 + 0.1) / 2, z * 0.08));
    for (const x of [0.58, 0.9]) { b.add('chrome', prism(0.012, BATH.w - 0.02, 8), 0xd8dcdc, at(x, 0.775 - 0.018, 0, Math.PI / 2)); for (const z of [-1, 1]) b.add('metal', cbox(0.02, 0.1, 0.01, 0.003), DARK, at(x, 0.8, z * 0.085)); }
    b.add('brass', prism(0.012, 0.05, 8), 0xffffff, at(BATH.x0 + 0.06, BATH.y - 0.21, 0.08));
    b.add('copper', tube([[0.88, 0.12, 0.17], [0.88, 0.9, 0.17], [0.88, 1.12, 0.12], [0.82, 1.15, 0.03], [0.76, 1.13, 0.0]], 0.014, 14, 6), 0xffffff);
    b.add('copper', prism(0.016, 0.06, 8), 0xffffff, at(0.76, 1.1, 0.0));
    b.add('brass', cbox(0.05, 0.07, 0.05, 0.008), 0xffffff, at(0.88, 0.99, 0.17));
    // ---- the puller and the winder: a column, a motor, the spool's axle, the traverse rod, the button pedestal
    b.add('paint', cbox(0.12, 0.1, 0.08, 0.01), GREEN, at(1.03, 0.935, -0.07));
    b.add('metal', cbox(0.03, 0.82, 0.03, 0.004), DARK, at(1.03, 0.5, -0.07));
    b.add('paint', cbox(0.14, 1.0, 0.1, 0.012), GREEN, at(AXLE.x, 0.6, -0.14), { rep: 0.3 });
    b.add('paint', prism(0.06, 0.16, 12), 0x3a4a36, at(AXLE.x, AXLE.y, -0.24, Math.PI / 2));
    b.add('chrome', prism(0.01, 0.2, 8), 0xd8dcdc, at(AXLE.x, AXLE.y, 0.0, Math.PI / 2));
    b.add('metal', prism(0.022, 0.03, 8), DARK, at(AXLE.x, AXLE.y, -0.085, Math.PI / 2));
    b.add('chrome', prism(0.006, 0.2, 6), 0xd8dcdc, at(AXLE.x, AXLE.y + 0.14, 0.0, Math.PI / 2));
    b.add('metal', cbox(0.03, 0.05, 0.03, 0.005), DARK, at(AXLE.x, AXLE.y + 0.14, -0.11));
    b.add('paint', cbox(0.16, 0.12, 0.12, 0.012), YEL, at(BUTTON.x, BUTTON.y - 0.07, BUTTON.z - 0.02));
    b.add('metal', cbox(0.04, BUTTON.y - 0.2, 0.04, 0.005), DARK, at(BUTTON.x, (BUTTON.y - 0.13 + 0.1) / 2 + 0.03, BUTTON.z - 0.02));
    b.add('metal', prism(0.04, 0.02, 12), 0x2a2a2a, at(BUTTON.x, BUTTON.y, BUTTON.z - 0.02));
    // the spool rack: a sloped rail with a lip, two stands
    const rl = RACK.x1 - RACK.x0, ra = Math.atan2(RACK.y1 - RACK.y0, rl);
    b.add('metal', cbox(rl, 0.02, 0.09, 0.004), 0x6a6e6a, at((RACK.x0 + RACK.x1) / 2, (RACK.y0 + RACK.y1) / 2, RACK.z, 0, 0, ra));
    for (const z of [-1, 1]) b.add('paint', cbox(rl, 0.03, 0.008, 0.003), YEL, at((RACK.x0 + RACK.x1) / 2, (RACK.y0 + RACK.y1) / 2 + 0.02, RACK.z + z * 0.045, 0, 0, ra));
    b.add('paint', cbox(0.02, 0.08, 0.09, 0.004), YEL, at(RACK.x0 - 0.01, RACK.y0 + 0.04, RACK.z));
    // ---- more of the works: the shredder's access door (hinges, a T-latch), a hazard band, the gearbox's breather,
    // conduit from the control box up to the bands' junction, tie-down brackets on the skid
    b.add('paint', cbox(0.012, 0.18, 0.22, 0.006), 0xc89818, at(HOP.x - 0.195, 1.27, 0));
    for (const y of [1.2, 1.34]) b.add('metal', cbox(0.016, 0.03, 0.02, 0.004), DARK, at(HOP.x - 0.2, y, -0.1));
    b.add('chrome', cbox(0.012, 0.012, 0.05, 0.003), 0xd8dcd8, at(HOP.x - 0.205, 1.27, 0.08));
    b.add('hazard', cbox(0.385, 0.03, 0.325, 0.004), 0xffffff, at(HOP.x, 1.155, 0), { rep: 0.15 });
    b.add('brass', prism(0.01, 0.05, 6), 0xffffff, at(-0.98, 1.21, -0.1));
    b.add('metal', tube([[-0.05, 0.72, -0.05], [-0.05, 0.86, -0.12], [-0.17, 0.92, -0.16], [-0.17, 1.08, -0.16]], 0.014, 10, 6), 0x6a6e6a);
    b.add('metal', cbox(0.1, 0.08, 0.06, 0.008), 0x6a6e6a, at(-0.17, 1.12, -0.16));
    for (const x of [-0.6, 0.2, 0.9]) for (const z of [-1, 1]) b.add('metal', cbox(0.06, 0.04, 0.03, 0.006), DARK, at(x, 0.13, z * 0.205));
    // a drip of cold strand on the skid under the die (a short stub that broke off)
    b.add('rubber', tube([[0.4, 0.115, 0.05], [0.44, 0.112, 0.08], [0.5, 0.113, 0.06]], 0.005, 6, 4), 0x2ab4e8);
    g.add(b.build(mats));
    // the maker's plates and the warning pictograms (no words)
    const plate1 = makerPlate(mats, 0.06); plate1.position.set(HOP.x + 0.08, 1.335, 0.163); g.add(plate1);
    const plate2 = makerPlate(mats, 0.07); plate2.position.set(-0.935, 1.13, 0.173); g.add(plate2);
    const plate3 = makerPlate(mats, 0.06); plate3.position.set(-0.03, 0.31, 0.21); g.add(plate3);
    const w1 = picto('hand', 0.07); w1.position.set(HOP.x + 0.1, 1.21, 0.163); g.add(w1);
    const w2 = picto('hot', 0.07); w2.position.set(-0.32, 1.2, 0.05); w2.rotation.x = -0.4; g.add(w2);
    const w3 = picto('shock', 0.06); w3.position.set(-0.2, 0.68, 0.207); g.add(w3);
    // ---- the moving parts
    // knife gate: a slide plate and its T-handle
    { const gb = new FacetBuilder();
      gb.add('chrome', cbox(0.12, 0.012, 0.16, 0.003), 0xc8ccc8, at(0, 0, 0.03));
      gb.add('metal', prism(0.008, 0.14, 6), DARK, at(0, 0, 0.16, Math.PI / 2));
      gb.add('paint', prism(0.014, 0.12, 8), 0xc8301c, at(0, 0, 0.235, 0, 0, Math.PI / 2));
      this.gate.add(gb.build(mats)); this.gate.position.set(HOP.x, 1.9, -0.02); g.add(this.gate); }
    // the selector: a round plate, eight lamps in an arc, a pointer knob
    { const sb = new FacetBuilder();
      sb.add('metal', prism(0.06, 0.01, 16), 0x2a2a2a, at(0, 0, 0, Math.PI / 2));
      sb.add('chrome', lathe([[0.058, -0.006], [0.064, -0.006], [0.064, 0.006], [0.058, 0.006]], 16), 0xd8dcd8, at(0, 0, 0, Math.PI / 2));
      const plateG = sb.build(mats); plateG.position.set(HOP.x - 0.09, 1.27, 0.168); g.add(plateG);
      MATS_ORDER.forEach((m, i) => {
        const a = Math.PI * (0.95 - i * 0.27);
        const lm = new THREE.MeshBasicMaterial({ color: 0x202020, toneMapped: false });
        const L = new THREE.Mesh(new THREE.SphereGeometry(0.0075, 8, 6), lm); L.userData.noGlow = true;
        L.position.set(HOP.x - 0.09 + Math.cos(a) * 0.045, 1.27 + Math.sin(a) * 0.045, 0.176);
        g.add(L); this.selLamps.push({ m, mat: lm });
      });
      const kb = new FacetBuilder();
      kb.add('bakelite', lathe([[0, 0], [0.022, 0], [0.022, 0.012], [0.016, 0.022], [0, 0.024]], 10), 0xffffff, at(0, 0, 0, Math.PI / 2));
      kb.add('enamel', cbox(0.006, 0.024, 0.006, 0.002), 0xf0e8d0, at(0, 0.012, 0.026));
      this.selKnob.add(kb.build(mats)); this.selKnob.position.set(HOP.x - 0.09, 1.27, 0.172); g.add(this.selKnob); }
    // the lever (pivot on the shredder's face): a steel arm with a red ball
    { const lb = new FacetBuilder();
      lb.add('metal', prism(0.03, 0.03, 10), DARK, at(0, 0, 0, Math.PI / 2));
      lb.add('chrome', prism(0.011, 0.3, 8), 0xd0d4d0, at(0, 0.15, 0.02));
      lb.add('paint', lathe([[0, 0], [0.024, 0.006], [0.032, 0.03], [0.028, 0.054], [0, 0.064]], 10), 0xc8281c, at(0, 0.29, 0.02));
      this.lever.add(lb.build(mats)); this.lever.position.copy(LEVER); g.add(this.lever); }
    // the cutter shafts (seen from above through the hopper's throat)
    for (const z of [-0.048, 0.048]) {
      const r = new THREE.Group(); const rb = new FacetBuilder();
      rb.add('metal', prism(0.012, 0.3, 6), DARK, at(0, 0, 0, 0, 0, Math.PI / 2));
      for (let i = 0; i < 6; i++) rb.add('chrome', starGeo(0.045, 0.03, 7, 0.022), 0xb8bcb8, at(-0.13 + i * 0.052, 0, 0, 0, Math.PI / 2, i * 0.4));
      r.add(rb.build(mats)); r.position.set(HOP.x, HOP.y0 - 0.02, z); g.add(r); this.rotors.push(r);
    }
    // heater bands (one shared glowing material), the barrel's heat light
    for (const x of BANDS) {
      const m = new THREE.Mesh(band(0.084, 0.084, 0.07, 0.014, 16), this.bands);
      m.rotation.z = Math.PI / 2; m.position.set(x, Y_BAR, 0); m.castShadow = true; g.add(m);
      const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.03), this.bands); clamp.position.set(x, Y_BAR - 0.095, 0); g.add(clamp);
    }
    this.heatL.position.set(-0.17, Y_BAR + 0.05, 0.25);
    const hl = new THREE.PointLight(0xffe8c0, 1.6, 1.3, 1.4); hl.position.set(HOP.x + 0.13, 1.98, 0.16); g.add(hl);
    // the gauges: the barrel's on the control box, the bath's on its face
    this.barrelG = gauge(mats, 0.055, 'barrel', [[0, 0.55, '#3a7ac8'], [MELT_LO, MELT_HI, '#3aa84a'], [0.88, 1, '#c8281c']]);
    this.barrelG.group.position.set(-0.3, 0.58, 0.21); g.add(this.barrelG.group);
    this.bathG = gauge(mats, 0.042, 'bath', [[0, 0.3, '#3a7ac8'], [0.3, 0.6, '#3aa84a'], [0.75, 1, '#c8281c']]);
    this.bathG.group.position.set(0.66, BATH.y - 0.09, BATH.w / 2 + 0.008); g.add(this.bathG.group);
    // the heater knob: a big fluted bakelite knob with a white line and a skirt
    { const kb = new FacetBuilder();
      kb.add('metal', prism(0.05, 0.006, 16), 0xd8d4c4, at(0, 0, -0.002, Math.PI / 2));
      kb.add('bakelite', lathe([[0, 0], [0.04, 0], [0.04, 0.012], [0.032, 0.02], [0.03, 0.04], [0, 0.044]], 12), 0xffffff, at(0, 0, 0, Math.PI / 2));
      kb.add('enamel', cbox(0.006, 0.03, 0.004, 0.001), 0xf4ecd8, at(0, 0.016, 0.045));
      this.knob.add(kb.build(mats)); this.knob.position.copy(KNOB); g.add(this.knob); }
    // the handwheel: rim, five spokes, a hub, a spinning handle
    { const wb = new FacetBuilder();
      wb.add('paint', band(0.12, 0.12, 0.022, 0.018, 18), 0xc8301c, at(0, 0, 0, Math.PI / 2));
      for (let i = 0; i < 5; i++) { const a = i * Math.PI * 2 / 5; wb.add('paint', cbox(0.012, 0.11, 0.012, 0.003), 0xb02818, at(Math.sin(a) * 0.058, Math.cos(a) * 0.058, 0, 0, 0, -a)); }
      wb.add('metal', prism(0.026, 0.04, 10), DARK, at(0, 0, 0, Math.PI / 2));
      wb.add('chrome', bolt(0.012, 0.01), 0xd8dcd8, at(0, 0, 0.02, Math.PI / 2));
      wb.add('wood', prism(0.013, 0.07, 8), 0x7a4a2a, at(0, 0.12, 0.045, Math.PI / 2));
      this.wheel.add(wb.build(mats)); this.wheel.position.copy(WHEEL); g.add(this.wheel); }
    // the coupling between gearbox and barrel (bolted flanges that turn with the screw)
    { const cb = new FacetBuilder();
      cb.add('metal', prism(0.06, 0.04, 10), 0x6a6e6a, at(0, 0, 0, 0, 0, Math.PI / 2));
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; cb.add('chrome', bolt(0.008, 0.008), 0xd8dcd8, at(0.02, Math.cos(a) * 0.045, Math.sin(a) * 0.045, 0, 0, -Math.PI / 2)); }
      this.coupling.add(cb.build(mats)); this.coupling.position.set(-0.8, Y_BAR, 0); g.add(this.coupling); }
    // the water (a translucent block) and its riser valve's red handwheel
    { const water = new THREE.Mesh(new THREE.BoxGeometry(BATH.x1 - BATH.x0 - 0.02, 0.15, BATH.w - 0.02), new THREE.MeshStandardMaterial({ color: 0x3a8ab0, transparent: true, opacity: 0.42, roughness: 0.04, metalness: 0.2, depthWrite: false }));
      water.name = 'water'; water.position.set((BATH.x0 + BATH.x1) / 2, BATH.water - 0.075, 0); water.userData.noGlow = true; water.renderOrder = 3; g.add(water);
      const vb = new FacetBuilder();
      vb.add('paint', band(0.045, 0.045, 0.012, 0.01, 12), 0xc8281c, at(0, 0, 0, Math.PI / 2));
      for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3; vb.add('paint', cbox(0.008, 0.045, 0.006, 0.002), 0xb02818, at(Math.sin(a) * 0.022, Math.cos(a) * 0.022, 0, 0, 0, -a)); }
      vb.add('brass', prism(0.012, 0.03, 8), 0xffffff, at(0, 0, -0.01, Math.PI / 2));
      this.valve.add(vb.build(mats)); this.valve.position.copy(VALVE).add(new THREE.Vector3(0, 0, 0.045)); g.add(this.valve); }
    // the puller's two rubber rollers
    for (const dy of [-0.022, 0.022]) {
      const r = new THREE.Group(); const pb = new FacetBuilder();
      pb.add('rubber', prism(0.02, 0.05, 12), 0x2a2a2a, at(0, 0, 0, Math.PI / 2));
      pb.add('chrome', prism(0.006, 0.07, 6), 0xd8dcd8, at(0, 0, 0, Math.PI / 2));
      r.add(pb.build(mats)); r.position.set(1.03, 0.935 + dy, 0); g.add(r); this.puller.push(r);
    }
    // the spool on the axle, the traverse guide's eyelet, the cutter
    this.spool = spoolModel(mats, 0xffffff, 0);
    this.spool.group.position.copy(AXLE); g.add(this.spool.group);
    { const eb = new FacetBuilder();
      eb.add('metal', cbox(0.03, 0.03, 0.02, 0.005), 0x2a2a2a, at(0, 0, 0));
      eb.add('chrome', band(0.008, 0.008, 0.006, 0.004, 8), 0xd8dcd8, at(0, -0.03, 0));
      eb.add('metal', cbox(0.006, 0.03, 0.006, 0.002), DARK, at(0, -0.016, 0));
      this.guide.add(eb.build(mats)); this.guide.position.set(AXLE.x, AXLE.y + 0.14, 0); g.add(this.guide); }
    { const cb = new FacetBuilder();
      cb.add('metal', cbox(0.08, 0.012, 0.012, 0.003), DARK, at(0.04, 0, 0));
      cb.add('chrome', cbox(0.03, 0.018, 0.004, 0.001), 0xe8ecec, at(0.085, 0, 0));
      this.cutter.add(cb.build(mats)); this.cutter.position.set(1.06, 0.88, 0.04); this.cutter.rotation.z = 0.5; g.add(this.cutter); }
    // the button: a green mushroom cap on its collar
    { const bb = new FacetBuilder();
      bb.add('chrome', prism(0.03, 0.02, 12), 0xd8dcd8, at(0, 0.01, 0));
      this.btn.add(bb.build(mats));
      this.btnCap = new THREE.Mesh(lathe([[0, 0], [0.042, 0], [0.044, 0.012], [0.036, 0.026], [0, 0.03]], 14), new THREE.MeshStandardMaterial({ color: 0x2ac84a, roughness: 0.35, metalness: 0, emissive: new THREE.Color(0x0a3010), flatShading: true }));
      this.btnCap.position.y = 0.02; this.btnCap.castShadow = true;
      this.btn.add(this.btnCap); this.btn.position.copy(BUTTON).add(new THREE.Vector3(0, 0.0, -0.02)); g.add(this.btn); }
    return g;
  }
  private placePilots() {
    const P = this.pilots;
    P.gate.mesh.position.set(HOP.x + 0.13, 1.9, 0.07);
    P.lever.mesh.position.set(LEVER.x + 0.05, LEVER.y - 0.08, LEVER.z + 0.01);
    P.knob.mesh.position.set(KNOB.x + 0.07, KNOB.y + 0.06, KNOB.z);
    P.wheel.mesh.position.set(WHEEL.x + 0.1, WHEEL.y + 0.17, 0.18);
    P.valve.mesh.position.set(VALVE.x - 0.05, VALVE.y + 0.06, VALVE.z + 0.03);
    P.button.mesh.position.set(BUTTON.x + 0.065, BUTTON.y - 0.04, BUTTON.z + 0.045);
  }
  private hotList() {
    const H = this.ctx.hots;
    H.push({ key: 'fm:body', objs: [this.body], glow: [], label: 'Filament maker', sub: '', press: () => this.open() });
    H.push({ key: 'fm:gate', objs: [this.gate], label: 'Seam feed', sub: '', press: () => this.pullGate() });
    H.push({ key: 'fm:sel', objs: [this.selKnob], label: 'Material', sub: '', press: () => this.cycleSel(1) });
    H.push({ key: 'fm:lever', objs: [this.lever], label: 'Shredder', sub: '', press: () => { if (this.step === 'shred' && !this.leverHeld) this.leverV = 9; } });
    H.push({ key: 'fm:knob', objs: [this.knob], label: 'Heater', sub: '', press: () => { if (this.step === 'melt') this.dial = clamp01(this.dial + 0.12); } });
    H.push({ key: 'fm:wheel', objs: [this.wheel], label: 'Screw drive', sub: '', press: () => { if (this.step === 'extrude') this.crank(Math.PI / 2); } });
    H.push({ key: 'fm:valve', objs: [this.valve], label: 'Cold water', sub: '' });
    H.push({ key: 'fm:button', objs: [this.btn], label: 'Winder', sub: '' });
    H.push({ key: 'fm:rack', objs: [this.rack], label: 'Spools', sub: '' });
  }
  /** each hot's sub line: a number where it helps (kilos, spools) */
  private subs() {
    for (const h of this.ctx.hots) {
      if (!h.key.startsWith('fm:')) continue;
      if (h.key === 'fm:body') h.off = this.active;
      else h.off = !this.active;
      if (h.key === 'fm:sel') h.sub = MAT[this.sel].name.toLowerCase();
      if (h.key === 'fm:rack') { const n = spools().length; h.sub = n ? `${n}` : '0'; h.off = false; }
    }
  }

  // ================================================================== state
  private firstFeedable(): Mat | null { const f = feedable(this.ctx.who()); return f.includes('polymer') ? 'polymer' : f[0] ?? null; }
  private setMat(m: Mat) {
    this.sel = m;
    const i = MATS_ORDER.indexOf(m);
    this.selKnob.rotation.z = Math.PI * (0.95 - i * 0.27) - Math.PI / 2;
  }
  private paintSel() {
    const f = new Set(feedable(this.ctx.who()));
    for (const L of this.selLamps) {
      const c = new THREE.Color(FILAMENT[L.m]);
      if (L.m === this.sel) L.mat.color.copy(c).multiplyScalar(f.has(L.m) ? 2.4 : 0.6);
      else L.mat.color.copy(c).multiplyScalar(f.has(L.m) ? 0.9 : 0.12);
    }
  }
  private colour(): number { return FILAMENT[this.mat ?? this.sel]; }
  private sayOnce(k: string, t: string) { if (this.said.has(k)) return; this.said.add(k); this.ctx.say(t); }

  /** the operator steps up to it */
  open() {
    if (this.active) return;
    this.active = true;
    if (this.step === 'idle' || this.step === 'done') { this.step = 'load'; const f = this.firstFeedable(); if (f && !feedable(this.ctx.who()).includes(this.sel)) this.setMat(f); }
    this.ctx.sound('tc_clunk', 0.4);
    // the loops are fetched now, so the first pull of the lever already has its motor
    for (const k of ['sg_loop_drill', 'machine_hum', 'fill', 'mn_loop_motor', 'sizzle']) this.ctx.sound(k, 0.0001);
    this.onOpen?.();
  }
  close() {
    if (!this.active) return;
    this.active = false;
    this.drag = null; this.leverHeld = this.knobHeld = this.valveHeld = this.btnHeld = false;
    // stepping away: the motors and the water are switched off (a shred under way finishes quietly)
    this.stopHums();
    this.ctx.sound('tc_toggle', 0.3);
    this.onClose?.();
  }
  /** Esc: off the machine (a charge in the hopper waits there) */
  back(): boolean { if (!this.active) return false; this.close(); return true; }
  get busyStep() { return this.step; }

  private cycleSel(d: number) {
    if (!this.active) { this.open(); return; }
    if (this.step !== 'load') { this.ctx.sound('cube_deny', 0.35); return; }
    const f = feedable(this.ctx.who());
    if (!f.length) { this.ctx.sound('cube_deny', 0.4); this.ctx.say(this.ctx.lab ? 'Nothing banked to spin. Keep a load at the press first.' : 'Nothing here to feed it. I need a kilo of scrap of one kind.'); return; }
    const i = MATS_ORDER.indexOf(this.sel);
    for (let k = 1; k <= 8; k++) { const m = MATS_ORDER[(i + d * k + 16) % 8]; if (f.includes(m)) { this.setMat(m); break; } }
    this.ctx.sound('tc_knob', 0.6);
  }
  private pullGate() {
    if (!this.active) { this.open(); return; }
    if (this.step !== 'load') return;
    if (!feedable(this.ctx.who()).includes(this.sel)) {
      const f = feedable(this.ctx.who());
      if (f.length) this.setMat(f[0]);
      else { this.ctx.sound('cube_deny', 0.4); this.ctx.say(this.ctx.lab ? 'Nothing banked to spin. Keep a load at the press first.' : 'Nothing here to feed it. I need a kilo of scrap of one kind.'); return; }
    }
    if (!takeFeed(this.sel, this.ctx.who())) { this.ctx.sound('cube_deny', 0.4); return; }
    this.mat = this.sel;
    this.chunkMat.color.setHex(FILAMENT[this.mat]).multiplyScalar(0.85);
    this.gateT = 1;
    this.ctx.sound('sg_clunk', 0.6);
    this.ctx.sound('tc_shutter', 0.4, 0.8);
    // the chunks tumble out of the spout onto a heap in the hopper
    for (const c of this.chunks) c.mesh.removeFromParent();
    this.chunks = [];
    for (let i = 0; i < 14; i++) {
      const s = 0.026 + Math.random() * 0.026;
      const geo = i % 3 ? new THREE.BoxGeometry(s, s * (0.6 + Math.random() * 0.6), s * (0.7 + Math.random() * 0.5)) : new THREE.DodecahedronGeometry(s * 0.6, 0);
      const mesh = new THREE.Mesh(geo, this.chunkMat); mesh.castShadow = true;
      const a = Math.random() * Math.PI * 2, r = Math.random() * 0.13;
      const to = new THREE.Vector3(HOP.x + Math.cos(a) * r, HOP.y0 + 0.07 + (0.13 - r) * 0.8 + Math.random() * 0.03, Math.sin(a) * r * 0.9);
      const from = new THREE.Vector3(HOP.x + (Math.random() - 0.5) * 0.03, 1.78, -0.02);
      mesh.position.copy(from); mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6); mesh.visible = false;
      this.group.add(mesh);
      this.chunks.push({ mesh, from, to, t: 0, delay: i * 0.06 });
    }
    window.setTimeout(() => this.ctx.sound(this.mat === 'metal' ? 'dmg_debris_metal' : this.mat === 'mineral' ? 'dmg_debris_glass' : this.mat === 'wood' ? 'dmg_debris_wood' : 'dmg_debris_soft', 0.55), 200);
    window.setTimeout(() => this.ctx.sound('metal_clank', 0.3, 1.2), 520);
    this.step = 'shred';
  }

  // ================================================================== the acts
  /** the lever came all the way down: the cutters run */
  private engage() {
    if (this.step !== 'shred' || this.shredT > 0) return;
    this.shredT = 0.001;
    this.ctx.sound('press_lever', 0.5, 1.2);
    this.ctx.sound('sg_clunk', 0.5);
    this.hums.shred = this.ctx.loop('sg_loop_drill', 0.35, 0.7);
    window.setTimeout(() => this.ctx.sound('craft_grind', 0.6, 0.9), 120);
    window.setTimeout(() => this.ctx.sound('mn_grind', 0.5), 900);
  }
  private crank(da: number) {
    if (this.step !== 'extrude') return;
    const before = Math.floor(this.turns * 4);
    this.turns = Math.min(CRANK_TURNS, this.turns + Math.max(0, da) / (Math.PI * 2));
    this.wheelV = Math.max(this.wheelV, da * 30);
    const after = Math.floor(this.turns * 4);
    if (after > before) { this.ctx.sound('tc_ratchet', 0.45, 0.9 + Math.random() * 0.2); if (after % 3 === 0) this.ctx.sound('ix_liquid', 0.25, 1.4); }
    if (this.turns >= CRANK_TURNS - 1e-4) { this.step = 'cool'; this.ctx.sound('cube_ok', 0.45); this.hums.steam = this.ctx.loop('sizzle', 0.3, 0.8); }
  }
  private finishSpool() {
    const m = this.mat ?? this.sel;
    this.cutT = 1;
    this.ctx.sound('mn_clip', 0.6);
    windSpool(m);
    // the full spool comes off the axle and rolls down the rack; a fresh core goes on
    const s = spoolModel(this.ctx.mats, FILAMENT[m], 1);
    s.group.position.copy(AXLE);
    this.group.add(s.group);
    const n = Math.min(5, spools().length) - 1;
    const to = this.rackSlot(Math.max(0, n));
    this.flying = { s, t: 0, from: AXLE.clone(), to };
    this.spool.setFill(0);
    this.windT = 0; this.mat = null;
    this.hums.wind?.stop(); this.hums.wind = null;
    window.setTimeout(() => this.ctx.sound('tc_cover', 0.4), 300);
    window.setTimeout(() => this.ctx.sound('metal_clank', 0.35, 0.8), 760);
    window.setTimeout(() => this.ctx.sound('cube_beep', 0.4), 900);
    this.step = 'done';
    this.sayOnce('spool', this.ctx.lab ? 'One kilo on a spool. The printer draws a print\'s matter off it, kilo for kilo.' : 'A spool. The printer eats these.');
    window.setTimeout(() => { if (this.step === 'done') { this.step = 'load'; this.shown = -1; this.turns = 0; this.temp *= 0.6; this.meltT = 0; this.coolT = 0; this.bathHeat = 0; this.showStrand(0); } }, 1400);
  }
  private rackSlot(i: number): THREE.Vector3 {
    const r = SPOOL.flange * 0.8;
    const x = RACK.x0 + 0.1 + i * 0.165, k = (x - RACK.x0) / (RACK.x1 - RACK.x0);
    return new THREE.Vector3(x, RACK.y0 + (RACK.y1 - RACK.y0) * k + r + 0.01, RACK.z);
  }
  /** the rack shows the newest spools on file (up to five), each wound as full as it is */
  refreshRack() {
    const sp = spools();
    const key = sp.slice(-5).map((s) => s.m + Math.round(s.kg * 20)).join(',');
    if (key === this.rackKey) return;
    this.rackKey = key;
    for (const c of [...this.rack.children]) { c.removeFromParent(); c.traverse((o) => (o as THREE.Mesh).geometry?.dispose()); }
    sp.slice(-5).forEach((s, i) => {
      const m = spoolModel(this.ctx.mats, FILAMENT[s.m], s.kg, 0.8);
      m.group.position.copy(this.rackSlot(i));
      m.group.rotation.z = i * 0.9;
      this.rack.add(m.group);
    });
  }

  // ================================================================== input
  private hitPart(x: number, y: number): 'lever' | 'knob' | 'wheel' | 'valve' | 'button' | null {
    const r = this.ctx.rayAt(x, y);
    if (!r) return null;
    const h = hitAny(r, [this.lever, this.knob, this.wheel, this.valve, this.btn]);
    if (!h) return null;
    return under(h.object, this.lever) ? 'lever' : under(h.object, this.knob) ? 'knob' : under(h.object, this.wheel) ? 'wheel' : under(h.object, this.valve) ? 'valve' : 'button';
  }
  private onDown = (e: PointerEvent) => {
    if (!this.active || e.button > 0 || (e.target as HTMLElement | null)?.tagName !== 'CANVAS') return;
    const part = this.hitPart(e.clientX, e.clientY);
    if (!part) return;
    if (part === 'lever' && this.step === 'shred' && this.shredT <= 0) { this.leverHeld = true; this.drag = { kind: 'lever', x: e.clientX, y: e.clientY, a0: this.leverA, last: 0 }; this.ctx.sound('tc_creak', 0.3); }
    else if (part === 'knob' && this.step === 'melt') { this.knobHeld = true; this.drag = { kind: 'knob', x: e.clientX, y: e.clientY, a0: this.dial, last: 0 }; this.ctx.sound('tc_knob', 0.4); }
    else if (part === 'wheel' && this.step === 'extrude') {
      const c = this.wheelScreen();
      this.drag = { kind: 'wheel', x: c?.x ?? e.clientX, y: c?.y ?? e.clientY, a0: 0, last: Math.atan2(e.clientY - (c?.y ?? e.clientY), e.clientX - (c?.x ?? e.clientX)) };
    }
    else if (part === 'valve' && this.step === 'cool') { this.valveHeld = true; this.ctx.sound('tc_squeak', 0.4); }
    else if (part === 'button' && this.step === 'spool') this.pressButton(true);
  };
  private onMove = (e: PointerEvent) => {
    const d = this.drag; if (!d || !this.active) return;
    if (d.kind === 'lever') this.leverA = Math.max(0.3, Math.min(2.45, d.a0 + (e.clientY - d.y) / 110 + Math.max(0, e.clientX - d.x) / 260));
    else if (d.kind === 'knob') this.dial = clamp01(d.a0 + ((e.clientX - d.x) - (e.clientY - d.y)) / 220);
    else if (d.kind === 'wheel') {
      const a = Math.atan2(e.clientY - d.y, e.clientX - d.x);
      let da = a - d.last; if (da > Math.PI) da -= Math.PI * 2; if (da < -Math.PI) da += Math.PI * 2;
      d.last = a;
      // clockwise on screen (y down) drives the screw forward
      if (da > 0) this.crank(da);
    }
  };
  private onUp = () => {
    const d = this.drag; this.drag = null;
    if (d?.kind === 'lever') { this.leverHeld = false; if (this.leverA > 2.1) this.engage(); }
    if (d?.kind === 'knob') this.knobHeld = false;
    if (this.valveHeld) { this.valveHeld = false; this.ctx.sound('tc_squeak', 0.25, 1.2); }
    if (this.btnHeld) this.pressButton(false);
  };
  /** the handwheel's centre on screen (for the crank's circle) */
  private wheelScreen(): { x: number; y: number } | null { return this.ctx.project(this.wheel.getWorldPosition(new THREE.Vector3())); }
  private pressButton(on: boolean) {
    if (on === this.btnHeld) return;
    this.btnHeld = on;
    if (on) { this.ctx.sound('sg_rocker', 0.5); this.hums.wind = this.hums.wind ?? this.ctx.loop('mn_loop_motor', 0.3, 0.9); }
    else { this.ctx.sound('tc_toggle', 0.3); this.hums.wind?.stop(); this.hums.wind = null; }
  }
  private spaceDown = false;
  private onKey = (e: KeyboardEvent) => {
    if (!this.active) return;
    const tg = e.target as HTMLElement | null;
    if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA')) return;
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
      const d = e.code === 'ArrowLeft' ? -1 : 1;
      if (this.step === 'load') this.cycleSel(d); else if (this.step === 'melt') this.dial = clamp01(this.dial + d * 0.06);
      e.preventDefault(); e.stopPropagation(); return;
    }
    if (e.code !== 'Space' && e.code !== 'Enter') return;
    e.preventDefault(); e.stopPropagation();
    if (e.repeat && this.step !== 'extrude') return;
    this.spaceDown = true;
    switch (this.step) {
      case 'load': this.pullGate(); break;
      case 'shred': if (this.shredT <= 0) { this.leverV = 9; } break;
      case 'melt': this.knobHeld = true; break;
      case 'extrude': this.crank(Math.PI / 3); break;
      case 'cool': this.valveHeld = true; this.ctx.sound('tc_squeak', 0.35); break;
      case 'spool': this.pressButton(true); break;
    }
  };
  private onKeyUp = (e: KeyboardEvent) => {
    if (e.code !== 'Space' && e.code !== 'Enter') return;
    if (!this.spaceDown) return;
    this.spaceDown = false;
    this.knobHeld = false;
    if (this.valveHeld) this.valveHeld = false;
    if (this.btnHeld) this.pressButton(false);
  };

  // ================================================================== camera
  camGoal(port: boolean): Pose | null {
    if (!this.active) return null;
    const P = (px: number, py: number, pz: number, lx: number, ly: number, lz: number, fov: number): Pose => {
      const k = port ? 1.55 : 1;
      const look = new THREE.Vector3(lx, ly, lz);
      const pos = new THREE.Vector3(px, py, pz).sub(look).multiplyScalar(k).add(look);
      return { pos: this.group.localToWorld(pos), look: this.group.localToWorld(look.clone()), fov: port ? fov + 14 : fov };
    };
    switch (this.step) {
      case 'load': case 'shred': return P(-0.36, 2.26, 0.86, -0.7, 1.36, 0.0, 52);
      case 'melt': return P(-0.18, 1.32, 1.0, -0.2, 0.82, 0.05, 50);
      case 'extrude': return P(-0.3, 1.38, 1.15, -0.26, 0.98, 0.05, 50);
      case 'cool': return P(0.74, 1.42, 0.92, 0.74, 0.86, 0.02, 46);
      default: return P(1.3, 1.34, 0.9, 1.12, 0.92, 0.05, 46);
    }
  }

  // ================================================================== frame
  private showStrand(k: number) {
    const q = Math.round(clamp01(k) * 60);
    if (q === this.shown) return;
    this.shown = q;
    this.strand.geometry.dispose();
    if (q < 2) { this.strand.geometry = new THREE.BufferGeometry(); return; }
    const pts = this.curve.getSpacedPoints(60).slice(0, q + 1);
    const c = new THREE.CatmullRomCurve3(pts);
    this.strand.geometry = new THREE.TubeGeometry(c, Math.max(2, q), 0.0055, 5, false);
    this.strandTex.repeat.set(q * 0.5, 1);
  }
  private stopHums() { for (const k of Object.keys(this.hums) as (keyof FilamentMaker['hums'])[]) { this.hums[k]?.stop(); this.hums[k] = null; } }

  update(dt: number, t: number, cam: THREE.Camera) {
    this.t = t;
    this.subs();
    if ((this.selT -= dt) <= 0) { this.selT = 0.4; this.paintSel(); }
    const P = this.pilots;
    P.gate.on = this.active && this.step === 'load';
    P.lever.on = this.active && this.step === 'shred' && this.shredT <= 0;
    P.knob.on = this.active && this.step === 'melt';
    P.wheel.on = this.active && this.step === 'extrude';
    P.valve.on = this.active && this.step === 'cool';
    P.button.on = this.active && this.step === 'spool';
    for (const p of Object.values(P)) p.tick(t);
    // ---- the gate slides out and back
    this.gateT = Math.max(0, this.gateT - dt * 0.9);
    this.gate.position.z = -0.02 + Math.sin(Math.min(1, this.gateT * 1.4) * Math.PI) * 0.11;
    // ---- the chunks: fall, bounce once, settle; while shredding they sink into the cutters
    for (const c of this.chunks) {
      if (c.delay > 0) { c.delay -= dt; continue; }
      c.mesh.visible = true;
      if (c.t < 1) {
        c.t = Math.min(1, c.t + dt / 0.42);
        const k = c.t, y = c.from.y + (c.to.y - c.from.y) * k * k;
        const bounce = k > 0.82 ? Math.sin((k - 0.82) / 0.18 * Math.PI) * 0.02 : 0;
        c.mesh.position.set(c.from.x + (c.to.x - c.from.x) * k, y + bounce, c.from.z + (c.to.z - c.from.z) * k);
        c.mesh.rotation.x += dt * 9; c.mesh.rotation.z += dt * 7;
        if (k >= 1) this.puffs.emit(this.group.localToWorld(c.mesh.position.clone()), new THREE.Vector3((Math.random() - 0.5) * 0.1, 0.12, 0), { life: 0.6, s0: 0.006, s1: 0.025, color: 0x8a8070, rise: 0.05 });
      }
    }
    // ---- the lever: dragged, or flung down by Space; springs back up when let go
    if (!this.leverHeld) {
      if (this.leverV > 0) { this.leverA += this.leverV * dt; if (this.leverA >= 2.4) { this.leverA = 2.4; this.leverV = 0; this.engage(); } }
      else if (this.shredT <= 0 || this.shredT > 2.2) this.leverA = damp(this.leverA, 0.3, 5, dt);
    }
    this.lever.rotation.z = -this.leverA;
    // ---- shredding: the cutters turn, the heap sinks, flakes, a shudder
    if (this.shredT > 0) {
      this.shredT += dt;
      const k = clamp01(this.shredT / 2.4);
      this.rotorV = damp(this.rotorV, 26, 6, dt);
      for (const c of this.chunks) { c.mesh.position.y = Math.max(HOP.y0 - 0.02, c.to.y - k * 0.2 + Math.sin(t * 40 + c.to.x * 50) * 0.004); c.mesh.scale.setScalar(Math.max(0.01, 1 - k * 1.1)); c.mesh.rotation.y += dt * 5; }
      this.body.position.x = Math.sin(t * 70) * 0.0015 * (1 - k);
      if (Math.random() < dt * 14) this.puffs.emit(this.group.localToWorld(new THREE.Vector3(HOP.x + (Math.random() - 0.5) * 0.2, HOP.y0 + 0.08, (Math.random() - 0.5) * 0.15)), new THREE.Vector3(0, 0.3, 0), { life: 0.8, s0: 0.008, s1: 0.03, color: this.colour(), rise: 0.1 });
      if (k >= 1) {
        this.shredT = 0; this.body.position.x = 0;
        for (const c of this.chunks) c.mesh.removeFromParent();
        this.chunks = [];
        this.hums.shred?.stop(); this.hums.shred = null;
        this.ctx.sound('sg_clunk', 0.4);
        this.step = 'melt';
      }
    } else this.rotorV = damp(this.rotorV, 0, 2.5, dt);
    this.rotors[0].rotation.x += this.rotorV * dt; this.rotors[1].rotation.x -= this.rotorV * dt;
    // ---- heat: the barrel follows the dial (slowly), the bands glow, the needle; in the green long enough and it melts
    if (this.step === 'melt' && this.knobHeld && this.spaceDown) this.dial = clamp01(this.dial + dt * 0.45);
    const heating = this.step === 'melt' || this.step === 'extrude' || this.step === 'cool' || this.step === 'spool';
    const goal = this.step === 'melt' ? this.dial * 1.05 : heating ? 0.7 : 0;
    this.temp = damp(this.temp, goal, this.step === 'melt' ? 1.1 : 0.4, dt);
    this.knob.rotation.z = -this.dial * Math.PI * 1.5 + Math.PI * 0.75;
    this.barrelG.set(this.temp + Math.sin(t * 13) * 0.004 * this.temp);
    const glow = clamp01((this.temp - 0.25) / 0.75);
    this.bands.emissive.setRGB(glow * 1.6, glow * glow * 0.55, glow * glow * glow * 0.12);
    this.heatL.intensity = glow * 1.6;
    if (this.step === 'melt') {
      const inBand = this.temp >= MELT_LO && this.temp <= MELT_HI;
      if (inBand) this.meltT += dt; else this.meltT = Math.max(0, this.meltT - dt * 0.6);
      if (this.temp > 0.9 && Math.random() < dt * 10) this.puffs.emit(this.group.localToWorld(new THREE.Vector3(-0.2 + (Math.random() - 0.5) * 0.6, Y_BAR + 0.1, 0)), new THREE.Vector3(0, 0.25, 0), { life: 1.4, s0: 0.01, s1: 0.06, color: 0x6a6a6a, rise: 0.15 });
      if (!this.hums.heat && this.active && this.dial > 0.05) this.hums.heat = this.ctx.loop('machine_hum', 0.25, 0.8);
      this.hums.heat?.rate(0.8 + this.dial * 0.5);
      if (this.meltT >= MELT_HOLD) {
        this.step = 'extrude'; this.meltT = 0;
        this.ctx.sound('cube_ok', 0.5); this.ctx.sound('tc_hiss', 0.35);
      }
    } else if (!heating) { this.hums.heat?.stop(); this.hums.heat = null; }
    // ---- the screw: the handwheel, the coupling, the strand out of the die
    this.wheelV = damp(this.wheelV, 0, 4, dt);
    const spin = this.wheelV * dt;
    this.wheel.rotation.z -= spin; this.coupling.rotation.x += spin * 0.6;
    if (this.step === 'extrude' || this.step === 'cool' || this.step === 'spool' || this.step === 'done') this.showStrand(this.step === 'extrude' ? this.turns / CRANK_TURNS : 1);
    this.strandMat.color.setHex(this.colour());
    const hotStrand = this.step === 'extrude' ? 1 : this.step === 'cool' ? 1 - clamp01(this.coolT / COOL_HOLD) : 0;
    this.strandMat.emissive.setRGB(hotStrand * 0.5, hotStrand * 0.16, 0);
    if (this.wheelV > 0.5) this.strandTex.offset.x -= this.wheelV * dt * 0.08;
    // ---- the bath: hot from the strand until the valve runs cold water through
    if (this.step === 'cool') {
      // let go and the strand warms it again
      if (this.valveHeld) this.coolT += dt; else this.coolT = Math.max(0, this.coolT - dt * 0.25);
      this.bathHeat = 0.85 * (1 - clamp01(this.coolT / COOL_HOLD));
      if (this.coolT >= COOL_HOLD) { this.step = 'spool'; this.ctx.sound('cube_ok', 0.45); this.hums.steam?.stop(); this.hums.steam = null; }
    } else if (this.step === 'extrude') this.bathHeat = Math.min(0.85, this.bathHeat + dt * 0.4 * (this.wheelV > 0.3 ? 1 : 0));
    else this.bathHeat = damp(this.bathHeat, 0.15, 0.5, dt);
    this.bathG.set(this.bathHeat + 0.12);
    if (this.bathHeat > 0.35 && Math.random() < dt * 18 * this.bathHeat) this.puffs.emit(this.group.localToWorld(new THREE.Vector3(BATH.x0 + 0.05 + Math.random() * (BATH.x1 - BATH.x0 - 0.1), BATH.water + 0.01, (Math.random() - 0.5) * 0.15)), new THREE.Vector3(0, 0.2, 0), { life: 1.3, s0: 0.01, s1: 0.045, color: 0x8a9298, rise: 0.2 });
    const flowing = this.valveHeld && this.step === 'cool';
    this.flow = damp(this.flow, flowing ? 1 : 0, 8, dt);
    // held, the wheel winds open (a turn and a half); let go, it is spun shut
    this.valveA = flowing ? Math.min(3, this.valveA + dt * 7) : Math.max(0, this.valveA - dt * 5);
    this.valve.rotation.z = this.valveA;
    if (flowing && !this.hums.water) this.hums.water = this.ctx.loop('fill', 0.4, 1);
    if (!flowing && this.hums.water) { this.hums.water.stop(); this.hums.water = null; }
    this.stream.visible = this.flow > 0.05;
    const top = 1.07, bot = BATH.water;
    this.stream.scale.set(this.flow, top - bot, this.flow); this.stream.position.set(0.76, (top + bot) / 2, 0.0);
    if (this.water) { this.water.position.y = BATH.water - 0.075 + this.flow * 0.006 + Math.sin(t * 3) * 0.001; (this.water.material as THREE.MeshStandardMaterial).color.setRGB(0.22 + this.bathHeat * 0.12, 0.54 - this.bathHeat * 0.05, 0.69 - this.bathHeat * 0.12); }
    if (this.flow > 0.3 && Math.random() < dt * 20) this.puffs.emit(this.group.localToWorld(new THREE.Vector3(0.76 + (Math.random() - 0.5) * 0.04, BATH.water + 0.01, (Math.random() - 0.5) * 0.04)), new THREE.Vector3((Math.random() - 0.5) * 0.2, 0.15, (Math.random() - 0.5) * 0.2), { life: 0.4, s0: 0.006, s1: 0.02, color: 0xd8f0ff, rise: 0 });
    // ---- the winder: held, it spins up and winds; the guide runs to and fro; the puller turns
    if (this.btnHeld && this.step === 'spool') this.windT += dt;
    this.spoolV = damp(this.spoolV, this.btnHeld && this.step === 'spool' ? 14 : 0, this.btnHeld ? 3 : 1.5, dt);
    this.spoolA += this.spoolV * dt;
    this.spool.group.rotation.z = -this.spoolA;
    this.spool.setColor(FILAMENT[this.mat ?? this.sel]);
    if (this.step === 'spool') this.spool.setFill(clamp01(this.windT / WIND_HOLD));
    this.guide.position.z = Math.sin(this.spoolA * 0.35) * 0.022;
    for (let i = 0; i < 2; i++) this.puller[i].rotation.z += (i ? 1 : -1) * (this.spoolV * 2.6 + this.wheelV * 0.4) * dt;
    if (this.spoolV > 0.5) this.strandTex.offset.x -= this.spoolV * dt * 0.05;
    this.btnCap.position.y = this.btnHeld ? 0.008 : 0.02;
    (this.btnCap.material as THREE.MeshStandardMaterial).emissive.setRGB(0.04, this.btnHeld ? 0.5 : P.button.on && Math.sin(t * 6) > 0 ? 0.3 : 0.12, 0.06);
    this.hums.wind?.rate(0.6 + this.spoolV / 20);
    if (this.step === 'spool' && this.windT >= WIND_HOLD) this.finishSpool();
    // ---- the cutter snaps down and back
    this.cutT = Math.max(0, this.cutT - dt * 4);
    this.cutter.rotation.z = 0.5 - Math.sin(this.cutT * Math.PI) * 0.6;
    // ---- a finished spool slides off the axle and rolls down the rack
    const f = this.flying;
    if (f) {
      f.t += dt;
      const s = f.s.group;
      if (f.t < 0.3) s.position.set(f.from.x, f.from.y, f.from.z + ease(f.t / 0.3) * 0.12);
      else {
        const k = clamp01((f.t - 0.3) / 0.55);
        s.position.set(f.from.x + (f.to.x - f.from.x) * ease(k), f.from.y + (f.to.y - f.from.y) * k * k, 0.12 + (f.to.z - 0.12) * k);
        s.scale.setScalar(1 - 0.2 * k);
        s.rotation.z += dt * 9;
      }
      if (f.t > 0.95) { s.removeFromParent(); s.traverse((o) => (o as THREE.Mesh).geometry?.dispose()); this.flying = null; this.rackKey = ''; }
    }
    if (!this.flying) this.refreshRack();
    this.puffs.update(dt, cam, () => 0.8);
  }
}
