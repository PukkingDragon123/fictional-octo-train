// THE RESEARCH LATTICE: the control room's research tree (data: src/game/unitTree.ts)
// as a physical rig on the main computer's housing (rooms/research.ts), not a
// screen. Nothing here is a 2D overlay: every word is drawn into the scene.
//   the board     the housing's phosphor glass behind the rig: lane names, each
//                 node's name under its socket, the key strip along the bottom
//   the ticker    a lit strip across the top: the branches, the node under
//                 the pointer, the points banked, the codex
//   the sockets   one per node: a bolted steel plate, a holo shelf, and on it a
//                 small 3D model of what the node unlocks (research/models.ts)
//                 turning slowly in the field. Locked: the model dark behind a
//                 cage. Affordable: the frame and the shelf pulse amber. Owned:
//                 green, the cage gone. Hover / selection lifts and lights it.
//   the conduits  square steel runs between the sockets. Their cores carry the
//                 tree's power: dark (nothing feeds them), dim amber (fed, the next
//                 node not yet affordable), pulsing amber with fast beads (fed into a
//                 node you can research now), green (both ends owned). The inspected
//                 node's runs light up: white where they are live, a pulsing red-orange
//                 where a requirement is still missing. Researching sends a charge down
//                 each run out of the node, and the node it reaches flashes
//   the reader    an XY gantry on a rail over the housing: a small CRT with a
//                 RESEARCH lever. Pick a node and the camera closes on it while
//                 the reader drives over beside it and prints the node's file
//   the keys      a key per branch of the deck on the console under the housing, the DECK key (the trades or
//                 the lab's research), LOG OFF
//   the bay       round 25: a machine-kit monitor at the rig's right whose tube plays a live 3D scene of a unit
//                 doing what the node under the pointer is about (research/preview.ts, the menu's own post
//                 pass), the trade's level and XP on an amber readout under it, and the 3D toggle (V, pad Y, or a
//                 press on the tube): the scene fills the screen in the machine kit's housing; drag turns round it
// The trades (src/game/professions.ts: Combat, Medic, Engineer, Scavenger, Cook, Botanist, Handler, Researcher) are
// the first deck: their nodes also wait on the trade's level, earned in the runs by doing the work.
// The branches are the categories of src/game/treeData.ts (designs, recipes,
// building, devices, chips, limbs, and any registered as data): each open
// re-reads them and rebuilds a branch whose nodes changed.
// Mouse / touch: hover or tap a node, tap the lever. Keys: arrows move, Enter
// inspects (again: research), R researches, Q / E branch, Esc back. Gamepad:
// d-pad, A, X research, LB / RB, B. A hidden focus key carries keyboard and pad
// focus and a polite live region reads the node out for screen readers.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FocusNav } from '../nav';
import { sfx } from '../sfx';
import { bitText, bitMeasure } from '../../../gfx/bitfont';
import { researchPoints } from '../../../game/research';
import { codexStats } from '../../../game/codex';
import { nodeQuest } from '../../../game/reqQuests';
import { G } from '../../../game/G';
import type { QuestRuntime } from '../../../missions/questRuntime';
import {
  BRANCHES, treeNodes, treeNode, treeLanes, rankOf, rankPlanned, nodeState, stage, clearPlan, confirmPlan, researchFor, pointsLeft, syncTree,
  type Branch, type TreeNode,
} from '../../../game/unitTree';
import type { Hot, StageView } from '../monitor/stage';
import { FacetBuilder, at, cbox, prism, bolt, tube, lathe, C, glowCard, gameSound } from '../monitor/props';
import type { FMats } from '../scene/pixtex';
import { nodeModel, matFor, type Look, type Exhibit } from './models';
import { ActionPreview, shotFor } from './preview';
import { crtMaterial, type CrtMaterial } from '../../../gfx/crt';
import { branchProf, profProgress, profGate, type ProfKey } from '../../../game/professions';
import { floatIcon, type FloatIcon } from '../../floatIcon';
import type { IconKind } from '../../machine/decor';
import './tradeIcons';
import { mxFrame, panelSpec, type MxFrame } from '../../machine/kit';
import { mxOk } from '../../machine/core';
import { Toggle } from '../monitor/props';
import '../../crt/crt.css';

const HEADER = 0.12, FOOT = 0.075, LABEL_W = 0.46, PPM = 440;
/** round 25: the bay on the rig's right: the action feed's monitor, the trade's readout, the 3D mode toggle */
const BAY_W = 1.0;
/** the two decks of branches on the console: the trades (professions) and the lab's research */
const isProf = (k: string) => k.startsWith('p_');
const ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V'];
const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt));
type Vis = 'max' | 'owned' | 'open' | 'poor' | 'locked';
const BEADS = 160;
const STATE_COL: Record<Vis, number> = { max: 0x5aff8a, owned: 0x5aff8a, open: 0xffb030, poor: 0x8a5a1c, locked: 0x2a1610 };
export interface Pose { pos: THREE.Vector3; look: THREE.Vector3; fov: number }

interface NodeV {
  n: TreeNode; br: Branch; li: number;
  p: THREE.Vector3; s: number;
  spin: THREE.Group; ex: Exhibit; hold: THREE.Group;
  frame: THREE.Mesh; emit: THREE.Mesh; cage: THREE.Mesh;
  hit: THREE.Mesh; hot: Hot;
  vis: Vis; look: Look; hover: boolean; lift: number; cageK: number; burst: number; deny: number; ph: number; plunge: number;
}
/** lit: 0 dead, 1 fed, 2 fed into a node open now, 3 both ends owned. charge: a pulse running down the run after a
 *  research (0..1 while it runs, below 0 waiting its turn, 1 settled); ping: flash the node it reaches */
interface LinkV { from: NodeV; to: NodeV; pts: THREE.Vector3[]; len: number; core: THREE.Mesh; lit: 0 | 1 | 2 | 3; charge: number; ping: boolean }
interface BranchV { key: Branch; root: THREE.Group; nodes: NodeV[]; links: LinkV[]; lanes: { row: number; label: string; y: number }[]; colW: number; rowH: number; s: number }

export interface LatticeOpts {
  /** the rig's rectangle on the housing (centre x, y; width, height) and the glass plane's z */
  x: number; y: number; w: number; h: number; z: number;
  /** the reader's rail height (just under the ceiling) */
  railY: number;
  /** the console under the housing: where the branch keys sit (left end x, top y and z at the keys, the desk's rake) */
  keys: { x: number; y: number; z: number; tilt: number };
}

export class TreeLattice {
  group = new THREE.Group();
  /** the glass (the room's own hot for the main computer rides it) */
  board: THREE.Mesh;
  active = false;
  /** the light the rig is lit by while it is up */
  light = new THREE.PointLight(0xfff0dc, 0, 3.4, 1.6);
  private o: LatticeOpts;
  private X0: number; private X1: number; private Y0: number; private Y1: number; private Z: number;
  private mats: FMats;
  private hots: Hot[];
  private boardCv = document.createElement('canvas'); private boardTex: THREE.CanvasTexture;
  private tickCv = document.createElement('canvas'); private tickTex: THREE.CanvasTexture;
  private headCv = document.createElement('canvas'); private headTex: THREE.CanvasTexture;
  private branches = new Map<Branch, BranchV>();
  private bi = 0;
  private cur: BranchV | null = null;
  private swap: { t: number; to: number; done: boolean } | null = null;
  private sel: NodeV | null = null;
  private focused: NodeV | null = null;
  // the reader
  private head = new THREE.Group(); private carriage = new THREE.Group(); private mast: THREE.Mesh;
  private hx = 0; private hy = 0; private lever = new THREE.Group(); private leverA = 0; private leverT = 0;
  private headLamp = new THREE.MeshBasicMaterial({ color: 0x40ff60, toneMapped: false });
  private headMsg: { text: string; col: string; t: number } | null = null;
  private moving = 0;
  private keySig = '';
  // the console keys
  private keys: { g: THREE.Group; cap: THREE.Mesh; lit: THREE.MeshBasicMaterial; tex: THREE.CanvasTexture; cv: HTMLCanvasElement; label: string; dip: number; br: number }[] = [];
  // shared materials
  private frameMats = new Map<Vis, THREE.MeshBasicMaterial>();
  // the conduit cores: dead, fed, open (pulses), owned, the inspected node's live runs (pulse), its missing requirements (pulse)
  private coreMats = [0x241c12, 0x6a4a1c, 0xb87a28, 0x48dc70, 0xfff0c0, 0xff6a3a].map((c) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false }));
  private cageMat = new THREE.MeshStandardMaterial({ color: 0x6a6e70, metalness: 0.75, roughness: 0.35, flatShading: true });
  private hitMat = new THREE.MeshBasicMaterial({ visible: false });
  private beads: THREE.InstancedMesh;
  private burstCard = glowCard(0.6, 0.6, 0xfff0b0, 1.0);
  private flashMsg: { text: string; t: number } | null = null;
  // focus, keys, screen reader
  private layer: HTMLElement | null = null; private btn: HTMLButtonElement | null = null; private live: HTMLElement | null = null;
  private nav: FocusNav | null = null;
  private onClose: (() => void) | null = null;
  private padX = false; private padY = false;
  private dirty = true; private tickDirty = true; private headDirty = true;
  private t = 0;
  private m4 = new THREE.Matrix4(); private v = new THREE.Vector3(); private col = new THREE.Color();
  // round 25: the bay (the action feed's monitor, the trade readout, the 3D toggle) and the decks
  private deck = 0;
  private preview: ActionPreview | null = null;
  private shown: TreeNode | null = null;
  private feedMat: CrtMaterial;
  private feedLamp = new THREE.MeshBasicMaterial({ color: 0x40ff60, toneMapped: false });
  private readCv = document.createElement('canvas'); private readTex: THREE.CanvasTexture; private readSig = '';
  private tog3d!: Toggle;
  private full: { layer: HTMLElement; frame: MxFrame | null; drag: { x: number; y: number; id: number } | null } | null = null;
  /** round 25: the deck's branches as floating keys under the rig (an icon, its short name under it) */
  private tabs: { layer: HTMLElement; keys: Map<number, FloatIcon>; sig: string } | null = null;

  constructor(mats: FMats, hots: Hot[], o: LatticeOpts) {
    this.mats = mats; this.hots = hots; this.o = o;
    this.X0 = o.x - o.w / 2; this.X1 = o.x + o.w / 2; this.Y0 = o.y - o.h / 2; this.Y1 = o.y + o.h / 2; this.Z = o.z;
    for (const k of Object.keys(STATE_COL) as Vis[]) this.frameMats.set(k, new THREE.MeshBasicMaterial({ color: new THREE.Color(STATE_COL[k]).multiplyScalar(0.8), toneMapped: false }));
    // the glass and its strips
    this.boardCv.width = Math.round(o.w * PPM); this.boardCv.height = Math.round(o.h * PPM);
    this.boardTex = canvasTex(this.boardCv);
    this.board = new THREE.Mesh(new THREE.PlaneGeometry(o.w, o.h), new THREE.MeshBasicMaterial({ map: this.boardTex, toneMapped: false, color: 0xd8d8d0 }));
    this.board.position.set(o.x, o.y, o.z); this.board.userData.noGlow = true;
    this.tickCv.width = Math.round((o.w - 0.08) * 400); this.tickCv.height = 44;
    this.tickTex = canvasTex(this.tickCv);
    const tick = new THREE.Mesh(new THREE.PlaneGeometry(o.w - 0.08, 0.11), new THREE.MeshBasicMaterial({ map: this.tickTex, toneMapped: false }));
    tick.position.set(o.x, this.Y1 - HEADER / 2, o.z + 0.004); tick.userData.noGlow = true;
    this.headCv.width = 400; this.headCv.height = 300;
    this.headTex = canvasTex(this.headCv);
    this.group.add(this.board, tick, this.frameRig(), this.light);
    // (round 25: a broad soft wash from well back over the console, not a hot spot on the nearest exhibits)
    this.light.position.set(o.x, o.y + 0.8, o.z + 3.0); this.light.distance = 7; this.light.decay = 1;
    // the beads that run the lit conduits
    this.beads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.018, 0.018, 0.018), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), BEADS);
    this.beads.count = 0; this.beads.frustumCulled = false; this.beads.userData.noGlow = true;
    this.group.add(this.beads);
    this.burstCard.visible = false; this.group.add(this.burstCard);
    this.mast = this.reader();
    this.readCv.width = 320; this.readCv.height = 96;
    this.readTex = canvasTex(this.readCv);
    this.feedMat = crtMaterial(BLACK_TEX, { curvature: 0.12, scan: 0.38, mask: 0.18, glow: 0.45, noise: 0.015, flicker: 0.15, vignette: 0.55, reflect: 0.18, tint: 0x9a9a96 }, [384, 288]);
    this.feedMat.crt.on = 0; this.feedMat.crt.target = 0;
    this.bay();
    this.deck = BRANCHES.length && isProf(BRANCHES[0].key) ? 0 : 1;
    this.consoleKeys();
    this.show(0, true);
  }

  /** the bay at the rig's right: a machine-kit monitor (olive enamel, hazard foot, vents, glands) whose tube shows the
   *  action feed (research/preview.ts), the trade's readout under it, and the 3D toggle that puts the feed on the screen */
  private bay() {
    const X = this.X1 - BAY_W / 2 - 0.02, Z = this.Z, top = this.Y1 - HEADER - 0.025;
    const MW = BAY_W - 0.06, MH = 0.74, my = top - MH / 2, fz = Z + 0.2;
    const b = new FacetBuilder();
    // the housing: a deep olive enamel box, a dark bezel plate, the tube's black funnel
    b.add('enamel', cbox(MW, MH, 0.2, 0.03), C.olive, at(X, my, Z + 0.1));
    b.add('enamel', cbox(MW - 0.06, MH - 0.08, 0.02, 0.012), C.oliveDark, at(X, my + 0.012, fz + 0.005));
    b.add('rubber', cbox(0.83, 0.62, 0.012, 0.004), 0x080808, at(X, my + 0.02, fz + 0.012));
    // vents on the hood, bolts at the corners, a hazard foot, handles on the flanks, cable glands under it
    for (let i = 0; i < 9; i++) b.add('metal', cbox(0.06, 0.008, 0.012, 0.002), C.darker, at(X - 0.3 + i * 0.075, my + MH / 2 - 0.022, fz + 0.012));
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.add('chrome', bolt(0.012, 0.008), C.steel, at(X + dx * (MW / 2 - 0.035), my + dy * (MH / 2 - 0.035), fz + 0.016, Math.PI / 2));
    b.add('hazard', cbox(MW - 0.1, 0.03, 0.008, 0.002), 0xffffff, at(X, my - MH / 2 + 0.03, fz + 0.016), { rep: 0.16 });
    for (const sx of [-1, 1]) { b.add('chrome', prism(0.012, 0.36, 6), 0xffffff, at(X + sx * (MW / 2 + 0.03), my, Z + 0.16)); for (const dy of [-0.18, 0.18]) b.add('metal', cbox(0.05, 0.03, 0.03, 0.006), C.dark, at(X + sx * (MW / 2 + 0.012), my + dy, Z + 0.16)); }
    for (const dx of [-0.25, 0.22]) { b.add('metal', prism(0.022, 0.04, 6), C.dark, at(X + dx, my - MH / 2 - 0.02, Z + 0.12)); b.add('rubber', tube([[X + dx, my - MH / 2 - 0.04, Z + 0.12], [X + dx + 0.02, my - MH / 2 - 0.2, Z + 0.08], [X + dx + 0.1, this.Y0 + FOOT + 0.01, Z + 0.04]], 0.012, 8, 5), dx < 0 ? 0x1a1a18 : 0xc8a020); }
    // the readout under it: a steel plate with a sunk amber window, the 3D toggle on its right
    const ry = this.Y0 + FOOT + 0.2;
    b.add('metal', cbox(MW, 0.3, 0.07, 0.012), 0x4a5052, at(X, ry, Z + 0.035));
    b.add('rubber', cbox(0.66, 0.2, 0.01, 0.003), 0x0a0604, at(X - 0.1, ry, Z + 0.072));
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.add('chrome', bolt(0.008, 0.006), C.steel, at(X + dx * (MW / 2 - 0.025), ry + dy * 0.12, Z + 0.072, Math.PI / 2));
    b.add('hazard', cbox(0.16, 0.2, 0.006, 0.002), 0xffffff, at(X + 0.355, ry, Z + 0.072), { rep: 0.12 });
    this.group.add(b.build(this.mats, { cast: false }));
    // the tube: a bulged pane of glass over the feed
    const geo = new THREE.PlaneGeometry(0.8, 0.6, 12, 9);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) { const x = pos.getX(i) / 0.4, y = pos.getY(i) / 0.3; pos.setZ(i, 0.018 * (1 - Math.min(1, (x * x + y * y) * 0.5))); }
    geo.computeVertexNormals();
    const tubeM = new THREE.Mesh(geo, this.feedMat);
    tubeM.position.set(X, my + 0.02, fz + 0.02); tubeM.userData.noGlow = true;
    this.group.add(tubeM);
    // a pilot lamp on the bezel (green: a feed; amber: the 3D mode)
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.016, 0.01), this.feedLamp);
    lamp.position.set(X + MW / 2 - 0.08, my - MH / 2 + 0.03, fz + 0.022); lamp.userData.noGlow = true;
    this.group.add(lamp);
    const rd = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.19), new THREE.MeshBasicMaterial({ map: this.readTex, toneMapped: false, color: 0xd8d0c0 }));
    rd.position.set(X - 0.1, ry, Z + 0.078); rd.userData.noGlow = true;
    this.group.add(rd);
    // the 3D toggle: a bat-handle switch on its plate, stood on the hazard panel facing the room
    this.tog3d = new Toggle(this.mats, { cap: 0xd8a030 });
    this.tog3d.group.scale.setScalar(2.2);
    this.tog3d.group.rotation.x = Math.PI / 2;
    this.tog3d.group.position.set(X + 0.355, ry, Z + 0.08);
    this.group.add(this.tog3d.group);
    this.hots.push({ key: 'lt:3d', objs: [this.tog3d.group], label: '', off: true, press: () => this.toggle3d() });
    // the tube is a hot too: a press on the feed puts it on the screen
    this.hots.push({ key: 'lt:feed', objs: [tubeM], glow: [], label: '', off: true, press: () => this.toggle3d(true) });
  }

  // ================================================================== building
  /** the steel lattice frame round the glass: rails, header and foot bars, cross bracing in the label column */
  private frameRig(): THREE.Group {
    const b = new FacetBuilder(), { X0, X1, Y0, Y1, Z } = this, w = X1 - X0, h = Y1 - Y0;
    const beam = 0x4a5052;
    b.add('metal', cbox(w + 0.06, 0.05, 0.05, 0.008), beam, at((X0 + X1) / 2, Y1 + 0.005, Z + 0.025));
    b.add('metal', cbox(w + 0.06, 0.05, 0.05, 0.008), beam, at((X0 + X1) / 2, Y0 - 0.005, Z + 0.025));
    for (const x of [X0 - 0.005, X1 + 0.005]) b.add('metal', cbox(0.05, h + 0.06, 0.05, 0.008), beam, at(x, (Y0 + Y1) / 2, Z + 0.025));
    b.add('metal', cbox(w, 0.018, 0.03, 0.004), C.dark, at((X0 + X1) / 2, Y1 - HEADER, Z + 0.015));
    b.add('metal', cbox(w, 0.018, 0.03, 0.004), C.dark, at((X0 + X1) / 2, Y0 + FOOT, Z + 0.015));
    const lx = X0 + LABEL_W - 0.01;
    b.add('metal', cbox(0.022, h - HEADER - FOOT, 0.03, 0.004), C.dark, at(lx, (Y0 + FOOT + Y1 - HEADER) / 2, Z + 0.015));
    for (const [x, y] of [[X0, Y0], [X1, Y0], [X0, Y1], [X1, Y1]]) {
      b.add('metal', cbox(0.11, 0.11, 0.012, 0.004), 0x5a6062, at(x, y, Z + 0.052));
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.add('chrome', bolt(0.008, 0.008), C.steel, at(x + dx * 0.035, y + dy * 0.035, Z + 0.058, Math.PI / 2));
    }
    // rivets along the header and foot bars
    for (let x = X0 + 0.2; x < X1 - 0.1; x += 0.3) for (const y of [Y1 - HEADER, Y0 + FOOT]) b.add('chrome', bolt(0.006, 0.006), C.steel, at(x, y, Z + 0.031, Math.PI / 2));
    return b.build(this.mats, { cast: false });
  }

  /** the reader: a rail over the housing, a carriage, a telescoping mast, the CRT head with its lever */
  private reader(): THREE.Mesh {
    const { X0, X1, Z } = this, ry = this.o.railY, rz = Z + 0.33;
    const b = new FacetBuilder();
    b.add('metal', cbox(X1 - X0 + 0.5, 0.06, 0.05, 0.008), 0x5a6062, at((X0 + X1) / 2, ry, rz));
    b.add('metal', cbox(X1 - X0 + 0.5, 0.012, 0.07, 0.003), C.dark, at((X0 + X1) / 2, ry - 0.036, rz));
    for (let x = X0 - 0.1; x <= X1 + 0.15; x += (X1 - X0 + 0.25) / 4) {
      b.add('metal', cbox(0.04, 0.04, rz - this.Z + 0.34, 0.006), C.dark, at(x, ry + 0.02, (rz + this.Z - 0.34) / 2));
      b.add('metal', cbox(0.1, 0.1, 0.012, 0.004), 0x5a6062, at(x, ry + 0.02, this.Z - 0.334));
    }
    // a cable carrier chain lying along the rail
    for (let x = X0; x < X1; x += 0.05) b.add('rubber', cbox(0.044, 0.02, 0.03, 0.004), 0x1a1a1a, at(x, ry + 0.042, rz - 0.01));
    this.group.add(b.build(this.mats, { cast: false }));
    // the carriage
    const cb = new FacetBuilder();
    cb.add('paint', cbox(0.16, 0.1, 0.1, 0.012), 0xd8a030, at(0, 0, 0), { rep: 0.3 });
    cb.add('hazard', cbox(0.162, 0.02, 0.102, 0.003), 0xffffff, at(0, -0.04, 0), { rep: 0.15 });
    for (const s of [-1, 1]) cb.add('rubber', prism(0.022, 0.03, 8), 0x1a1a1a, at(s * 0.05, 0.055, 0, Math.PI / 2));
    this.carriage.add(cb.build(this.mats, { cast: false }));
    this.group.add(this.carriage);
    const mast = new THREE.Mesh(new THREE.BoxGeometry(0.032, 1, 0.032).translate(0, -0.5, 0), new THREE.MeshStandardMaterial({ color: 0x9aa0a4, metalness: 0.7, roughness: 0.35, flatShading: true }));
    this.group.add(mast);
    // the head: an enamel CRT housing, the glass, a status lamp, the RESEARCH lever and its slot plate
    const hb = new FacetBuilder();
    hb.add('enamel', cbox(0.44, 0.36, 0.12, 0.03), 0xc4bc9e, at(0, 0, 0));
    hb.add('enamel', cbox(0.392, 0.296, 0.02, 0.012), 0x2a2620, at(0, 0, 0.055));
    for (let i = 0; i < 7; i++) hb.add('metal', cbox(0.04, 0.008, 0.01, 0.002), C.darker, at(-0.15 + i * 0.05, 0.165, 0.058));
    hb.add('metal', cbox(0.08, 0.04, 0.06, 0.008), C.dark, at(0, 0.2, 0));
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) hb.add('chrome', bolt(0.008, 0.006), C.steel, at(dx * 0.2, dy * 0.16, 0.061, Math.PI / 2));
    // the lever's slot housing on the right flank
    hb.add('metal', cbox(0.06, 0.2, 0.08, 0.01), 0x3a3e40, at(0.25, -0.04, 0.0));
    hb.add('hazard', cbox(0.062, 0.03, 0.082, 0.003), 0xffffff, at(0.25, -0.15, 0.0), { rep: 0.12 });
    this.head.add(hb.build(this.mats, { cast: false }));
    // (dimmed under the bloom threshold: a readable glass, not a glare)
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.27), new THREE.MeshBasicMaterial({ map: this.headTex, toneMapped: false, color: 0xb4b4ac }));
    screen.position.z = 0.0662; screen.userData.noGlow = true; this.head.add(screen);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.016, 0.01), this.headLamp);
    lamp.position.set(0.17, -0.163, 0.062); lamp.userData.noGlow = true; this.head.add(lamp);
    // the lever: pivot in the slot, a steel arm, a red bakelite grip
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.17, 0.018).translate(0, 0.085, 0), new THREE.MeshStandardMaterial({ color: 0xc8ccd0, metalness: 0.8, roughness: 0.3, flatShading: true }));
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.05).translate(0, 0.19, 0), new THREE.MeshStandardMaterial({ color: 0xc8261e, roughness: 0.4, flatShading: true }));
    const hub = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.05), new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.5, flatShading: true }));
    for (const m of [arm, grip, hub]) m.castShadow = true;
    this.lever.add(arm, grip, hub);
    this.lever.position.set(0.25, 0.02, 0.05);
    this.head.add(this.lever);
    // a stencilled RESEARCH plate under the slot
    const pc = document.createElement('canvas'); pc.width = 96; pc.height = 22;
    { const c = pc.getContext('2d')!; c.fillStyle = '#c8261e'; c.fillRect(0, 0, 96, 22); c.fillStyle = '#7a140e'; c.fillRect(0, 20, 96, 2); bitText(c, 'RESEARCH', 48, 3, { color: '#fff0e0', outline: null, align: 'center' }); }
    const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.023), new THREE.MeshBasicMaterial({ map: canvasTex(pc), toneMapped: false }));
    lab.position.set(0.25, -0.19, 0.0); lab.rotation.y = 0; lab.position.z = 0.041; lab.userData.noGlow = true;
    this.head.add(lab);
    this.group.add(this.head);
    const park = this.park();
    this.hx = park.x; this.hy = park.y;
    this.hots.push({ key: 'lt:lever', objs: [this.lever, lab], label: '', off: true, press: () => this.pull() });
    return mast;
  }
  private park() { return { x: this.X1 - 0.26, y: this.o.railY - 0.26 }; }

  /** the current deck's branches as keys on the console's left (two rows of up to five), the DECK key that swaps the
   *  trades for the lab's research, and LOG OFF on its right; rebuilt when branches are added or the deck turns */
  private consoleKeys() {
    const K = this.o.keys;
    for (const k of this.keys) { this.group.remove(k.g); const i = this.hots.findIndex((h) => h.key === 'lt:key' + k.br); if (i >= 0) this.hots.splice(i, 1); }
    this.keys = [];
    this.keySig = this.deck + ':' + BRANCHES.map((b) => b.key).join();
    const OFF = 99, DECK = 98;
    const mine = BRANCHES.map((b, i) => [b, i] as const).filter(([b]) => (isProf(b.key) ? 0 : 1) === this.deck);
    const n = mine.length, per = n > 8 ? Math.ceil(n / 2) : 4, step = per > 4 ? Math.max(0.1, 0.448 / (per - 1)) : 0.125;
    const word = (name: string) => { const w = name.split(' '); return (name.length <= 8 ? name : w[w.length - 1]).toUpperCase().slice(0, 8); };
    const labels: [string, number, number][] = [...mine.map(([b, i], j) => [word(b.name), i, j] as [string, number, number]), [this.deck ? 'TRADES' : 'LAB', DECK, 0], ['LOG OFF', OFF, 0]];
    labels.forEach(([label, i, j]) => {
      const g = new THREE.Group();
      // two rows down the rake (back row higher); DECK and LOG OFF beside the tape reader
      const row = i >= DECK ? (i === OFF ? 0 : 1) : Math.floor(j / per), col = i >= DECK ? 0 : j % per, dz = n > per || i >= DECK ? (row ? 0.075 : -0.07) : 0;
      g.position.set(i >= DECK ? K.x + 1.72 : K.x - (per > 4 ? 0.06 + (per - 5) * 0.1 : 0) + col * step, K.y - dz * Math.tan(K.tilt), K.z + dz);
      g.rotation.x = K.tilt;
      const b = new FacetBuilder();
      b.add('metal', cbox(0.118, 0.012, 0.08, 0.003), C.darker, at(0, 0.004, 0));
      g.add(b.build(this.mats, { cast: false }));
      const cap = new THREE.Mesh(cbox(per > 4 && i < DECK ? Math.min(0.098, step - 0.008) : 0.1, 0.032, 0.062, 0.008), new THREE.MeshStandardMaterial({ color: i === OFF ? 0xa8261e : i === DECK ? 0xc89a20 : 0x2a2622, roughness: 0.45, flatShading: true }));
      cap.position.y = 0.026; cap.castShadow = true;
      const cv = document.createElement('canvas'); cv.width = 96; cv.height = 24;
      const tex = canvasTex(cv);
      const lit = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.088, 0.022), lit);
      win.rotation.x = -Math.PI / 2; win.position.set(0, 0.0425, 0.004); win.userData.noGlow = true;
      cap.add(win);
      g.add(cap);
      this.group.add(g);
      const k = { g, cap, lit, tex, cv, label, dip: 0, br: i };
      this.keys.push(k);
      this.hots.push({ key: 'lt:key' + i, objs: [cap], label: '', off: !this.active, press: () => { k.dip = 1; if (i === OFF) this.close(); else if (i === DECK) this.turnDeck(); else this.setBranch(i); } });
    });
    this.paintKeys();
  }
  /** the DECK key: the trades or the lab's research on the keys, the ticker and the rig (the first branch of the other deck) */
  turnDeck() {
    const to = this.deck ? 0 : 1;
    const i = BRANCHES.findIndex((b) => (isProf(b.key) ? 0 : 1) === to);
    if (i < 0) return;
    sfx('lever', 0.7); gameSound('cy_clank', 0.5);
    this.setBranch(i);
  }
  private paintKeys() {
    for (const k of this.keys) {
      const c = k.cv.getContext('2d')!, on = k.br === this.bi, off = k.br === 99, dk = k.br === 98;
      c.fillStyle = off ? '#3a0a08' : dk ? '#2a1e04' : on ? '#ffb030' : '#1a140c'; c.fillRect(0, 0, 96, 24);
      c.fillStyle = off ? '#5a1410' : dk ? '#6a4a10' : on ? '#fff0b0' : '#2a2014'; c.fillRect(0, 0, 96, 2);
      bitText(c, k.label, 48, 4, { color: off ? '#ff9a80' : dk ? '#ffd060' : on ? '#2a1404' : '#b88a40', outline: null, align: 'center' });
      k.tex.needsUpdate = true;
    }
  }

  /** a branch's sockets, models, conduits (built the first time it is shown) */
  private buildBranch(br: Branch): BranchV {
    const ns = treeNodes(br);
    const rows = [...new Set([...treeLanes(br).map((l) => l.row), ...ns.map((n) => n.row)])].filter((r) => ns.some((n) => n.row === r)).sort((a, b) => a - b);
    const nc = Math.max(1, ...ns.map((n) => n.col + 1)), nl = Math.max(1, rows.length);
    const L0 = this.X0 + LABEL_W, R0 = this.X1 - BAY_W - 0.05, T0 = this.Y1 - HEADER - 0.025, B0 = this.Y0 + FOOT + 0.02;
    const trade = isProf(br);
    // (a trade's grid keeps a strip free at the foot: the bottom row's names sit under its plinths)
    const B1 = B0 + (trade ? 0.075 : 0);
    const colW = Math.min(0.52, (R0 - L0) / nc), rowH = Math.min(trade ? 0.42 : 0.34, (T0 - B1) / nl);
    const gx = L0 + ((R0 - L0) - colW * nc) / 2, gy = T0 - ((T0 - B1) - rowH * nl) / 2;
    // round 25: the trades' nodes are specimen plinths standing off the glass on bracket arms (no plate, no frame);
    // the lab's sockets sit high in their cells so a name gets two readable lines under each
    const s = Math.min(colW * 0.6, rowH * (trade ? 0.66 : 0.56), trade ? 0.24 : 0.21);
    const lift = trade ? 0 : rowH * 0.14;
    const root = new THREE.Group(); root.visible = false;
    const Z = this.Z;
    const fb = new FacetBuilder();
    const frameGeo = squareRing(s, s * 0.09);
    const cageGeo = cage(trade ? s * 0.85 : s);
    const lanes = rows.map((r, li) => ({ row: r, label: treeLanes(br).find((l) => l.row === r)?.label ?? '', y: gy - (li + 0.5) * rowH }));
    const nodes: NodeV[] = [];
    for (const n of ns) {
      const li = rows.indexOf(n.row);
      const px = gx + (n.col + 0.5) * colW, py = gy - (li + 0.5) * rowH + lift;
      let frame: THREE.Mesh, emit: THREE.Mesh, hold: THREE.Group, cg: THREE.Mesh, hit: THREE.Mesh, pz = Z + 0.075, cy = py;
      const spin = new THREE.Group();
      const ex = nodeModel(n);
      if (trade) {
        // a hex flange on the glass, a gusseted arm out to the plinth (staggered in depth: the lattice has relief),
        // an octagonal steel drum with a brass collar and a lit state band round its rim, the exhibit turning on top
        const depth = 0.09 + ((li + n.col) % 2) * 0.07, base = py - s * 0.36, z1 = Z + depth;
        fb.add('metal', prism(0.05, 0.022, 6), 0x3a3e40, at(px, base - 0.03, Z + 0.011, Math.PI / 2));
        for (let k = 0; k < 6; k++) fb.add('chrome', bolt(0.005, 0.005), C.steel, at(px + Math.cos(k * 1.047) * 0.036, base - 0.03 + Math.sin(k * 1.047) * 0.036, Z + 0.022, Math.PI / 2));
        fb.add('metal', cbox(0.05, 0.034, depth, 0.008), 0x5a6062, at(px, base - 0.03, Z + depth / 2 + 0.01));
        fb.add('metal', cbox(0.014, 0.05, depth * 0.75, 0.003), C.dark, at(px, base - 0.058, Z + depth * 0.42, 0.45));
        fb.add('metal', lathe([[0, 0], [s * 0.42, 0], [s * 0.44, 0.012], [s * 0.44, 0.034], [s * 0.38, 0.05], [0, 0.05]], 8), 0x6a7072, at(px, base - 0.05, z1));
        fb.add('brass', lathe([[s * 0.36, 0], [s * 0.39, 0], [s * 0.39, 0.014], [s * 0.36, 0.014]], 8), 0xc8a050, at(px, base, z1));
        fb.add('metal', lathe([[0, 0], [s * 0.34, 0], [s * 0.34, 0.008], [0, 0.008]], 8), 0x3a3e40, at(px, base + 0.004, z1));
        frame = new THREE.Mesh(lathe([[s * 0.445, 0], [s * 0.455, 0], [s * 0.455, 0.014], [s * 0.445, 0.014]], 8), this.frameMats.get('locked')!);
        frame.position.set(px, base - 0.035, z1); frame.userData.noGlow = true;
        emit = new THREE.Mesh(new THREE.CircleGeometry(s * 0.3, 8), this.frameMats.get('locked')!);
        emit.rotation.x = -Math.PI / 2; emit.position.set(px, base + 0.0125, z1); emit.userData.noGlow = true;
        cy = base + s * 0.36; pz = z1;
        hold = new THREE.Group(); hold.position.set(px, cy + s * 0.05, pz);
        ex.root.scale.setScalar(s * 0.8);
        cg = new THREE.Mesh(cageGeo, this.cageMat);
        cg.position.set(px, base + 0.03, z1 + s * 0.34); cg.castShadow = false;
        hit = new THREE.Mesh(new THREE.BoxGeometry(s * 1.05, s * 1.15, depth + 0.3), this.hitMat);
        hit.position.set(px, py, Z + (depth + 0.3) / 2);
      } else {
        // the socket: a bolted back plate, a holo shelf on a strut
        fb.add('metal', cbox(s, s, 0.014, 0.004), 0x3a3e40, at(px, py, Z + 0.008));
        for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) fb.add('chrome', bolt(0.006, 0.006), C.steel, at(px + dx * (s / 2 - 0.014), py + dy * (s / 2 - 0.014), Z + 0.015, Math.PI / 2));
        const shY = py - s * 0.36;
        fb.add('metal', cbox(s * 0.72, 0.014, 0.1, 0.003), 0x6a7072, at(px, shY, Z + 0.06));
        fb.add('metal', cbox(0.012, 0.012, 0.11, 0.002), C.dark, at(px, shY - 0.03, Z + 0.05, -0.5));
        frame = new THREE.Mesh(frameGeo, this.frameMats.get('locked')!);
        frame.position.set(px, py, Z + 0.0155); frame.userData.noGlow = true;
        emit = new THREE.Mesh(new THREE.PlaneGeometry(s * 0.6, 0.08), this.frameMats.get('locked')!);
        emit.rotation.x = -Math.PI / 2; emit.position.set(px, shY + 0.0075, Z + 0.062); emit.userData.noGlow = true;
        hold = new THREE.Group(); hold.position.set(px, py + s * 0.05, Z + 0.075);
        ex.root.scale.setScalar(s * 0.62);
        cg = new THREE.Mesh(cageGeo, this.cageMat);
        cg.position.set(px, py - s * 0.42, Z + 0.135); cg.castShadow = false;
        hit = new THREE.Mesh(new THREE.BoxGeometry(s * 1.05, s * 1.05, 0.22), this.hitMat);
        hit.position.set(px, py, Z + 0.11);
      }
      hold.add(spin);
      spin.add(ex.root);
      root.add(frame, emit, hold, cg, hit);
      const v: NodeV = {
        n, br, li, p: new THREE.Vector3(px, cy, pz), s, spin, ex, hold, frame, emit, cage: cg, hit, hot: null as unknown as Hot,
        vis: 'locked', look: 'lit', hover: false, lift: 0, cageK: 1, burst: 0, deny: 0, ph: Math.random() * 6.28, plunge: 1,
      };
      v.hot = { key: 'lt:n:' + n.key, objs: [hit], glow: [], label: '', off: true, press: () => this.pressNode(v), hover: (on) => this.hoverNode(v, on) };
      this.hots.push(v.hot);
      nodes.push(v);
    }
    // the conduits: square steel runs, a core strip along the front of each
    const links: LinkV[] = [];
    const gap = (colW - s) / 2;
    for (const to of nodes) for (const rk of to.n.req) {
      const from = nodes.find((q) => q.n.key === rk);
      if (!from) continue;
      const a = from.p, b2 = to.p, h = s / 2, pts: THREE.Vector3[] = [];
      const P = (x: number, y: number) => new THREE.Vector3(x, y, Z + 0.024);
      if (from.li === to.li) pts.push(P(a.x + (b2.x > a.x ? h : -h), a.y), P(b2.x + (b2.x > a.x ? -h : h), b2.y));
      else if (from.n.col === to.n.col) { const dn = b2.y < a.y; pts.push(P(a.x, a.y + (dn ? -h : h)), P(b2.x, b2.y + (dn ? h : -h))); }
      else {
        const right = b2.x > a.x, xm = right ? b2.x - h - gap : b2.x + h + gap;
        pts.push(P(a.x + (right ? h : -h), a.y), P(xm, a.y), P(xm, b2.y), P(b2.x + (right ? -h : h), b2.y));
      }
      const segs: THREE.BufferGeometry[] = [];
      let len = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i], p1 = pts[i + 1], L = p0.distanceTo(p1);
        if (L < 1e-3) continue;
        len += L;
        const horiz = Math.abs(p1.x - p0.x) > Math.abs(p1.y - p0.y);
        const mx = (p0.x + p1.x) / 2, my = (p0.y + p1.y) / 2;
        fb.add('metal', cbox(horiz ? L + 0.024 : 0.024, horiz ? 0.024 : L + 0.024, 0.024, 0.004), 0x2e3234, at(mx, my, Z + 0.012));
        segs.push(new THREE.BoxGeometry(horiz ? L + 0.008 : 0.008, horiz ? 0.008 : L + 0.008, 0.004).translate(mx, my, Z + 0.0262));
      }
      // clamps every so often
      for (let i = 0; i < pts.length - 1; i++) { const m = pts[i].clone().lerp(pts[i + 1], 0.5); fb.add('metal', cbox(0.034, 0.034, 0.03, 0.004), 0x5a6062, at(m.x, m.y, Z + 0.014)); }
      const g = segs.length ? mergeGeometries(segs, false) : new THREE.BufferGeometry();
      const core = new THREE.Mesh(g ?? new THREE.BufferGeometry(), this.coreMats[0]);
      core.userData.noGlow = true;
      root.add(core);
      links.push({ from, to, pts, len, core, lit: 0, charge: 1, ping: false });
    }
    root.add(fb.build(this.mats, { cast: false }));
    this.group.add(root);
    const bv: BranchV = { key: br, root, nodes, links, lanes, colW, rowH, s };
    this.branches.set(br, bv);
    return bv;
  }

  // ================================================================== state
  /** re-read the tree: every node's state, the conduits, the board, the ticker, the reader */
  refresh() { this.dirty = true; this.tickDirty = true; this.headDirty = true; }
  private applyState() {
    const bv = this.cur;
    if (!bv) return;
    this.dirty = false;
    for (const v of bv.nodes) {
      const st = nodeState(v.n), r = rankOf(v.n);
      v.vis = r >= v.n.ranks ? 'max' : st === 'open' ? 'open' : r > 0 ? 'owned' : st === 'poor' ? 'poor' : st === 'locked' ? 'locked' : 'open';
    }
    for (const L of bv.links) {
      const fed = rankOf(L.from.n) > 0;
      L.lit = fed && rankOf(L.to.n) > 0 ? 3 : fed && L.to.vis === 'open' ? 2 : fed ? 1 : 0;
    }
    this.drawBoard();
  }
  private setLook(v: NodeV) {
    const look: Look = v.hover || v === this.sel || v === this.focused ? 'hot' : v.vis === 'locked' ? 'dark' : v.vis === 'poor' ? 'dim' : 'lit';
    if (look === v.look) return;
    v.look = look;
    for (const m of v.ex.meshes) m.material = matFor(m.userData.base as THREE.Material, look);
  }

  // ================================================================== the glass
  private toPx(x: number, y: number) { return [((x - this.X0) / (this.X1 - this.X0)) * this.boardCv.width, ((this.Y1 - y) / (this.Y1 - this.Y0)) * this.boardCv.height] as const; }
  private drawBoard() {
    const bv = this.cur;
    const c = this.boardCv.getContext('2d')!, W = this.boardCv.width, H = this.boardCv.height;
    c.imageSmoothingEnabled = false;
    const g = c.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.62);
    g.addColorStop(0, '#12281a'); g.addColorStop(1, '#040a06');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    // a fine graticule burnt into the phosphor, firmer every fourth line
    for (let x = 0, i = 0; x < W; x += 22, i++) { c.fillStyle = i % 4 ? 'rgba(110,255,150,0.045)' : 'rgba(110,255,150,0.09)'; c.fillRect(x, 0, 1, H); }
    for (let y = 0, i = 0; y < H; y += 22, i++) { c.fillStyle = i % 4 ? 'rgba(110,255,150,0.045)' : 'rgba(110,255,150,0.09)'; c.fillRect(0, y, W, 1); }
    const [, hy] = this.toPx(0, this.Y1 - HEADER), [, fy] = this.toPx(0, this.Y0 + FOOT), [lx] = this.toPx(this.X0 + LABEL_W, 0);
    c.fillStyle = '#020604'; c.fillRect(0, 0, W, hy); c.fillRect(0, fy, W, H - fy);
    if (bv) {
      const br = BRANCHES[this.bi];
      // the branch's code burnt huge and faint across the glass
      bitText(c, br.code, lx + (W - lx) / 2, hy + 40, { color: 'rgba(255,184,72,0.06)', outline: null, align: 'center', scale: 12 });
      // lanes: a band each, the name down the left in amber
      bv.lanes.forEach((L, i) => {
        const [, y0] = this.toPx(0, L.y + bv.rowH / 2), [, y1] = this.toPx(0, L.y - bv.rowH / 2);
        if (i % 2 === 0) { c.fillStyle = 'rgba(255,184,72,0.035)'; c.fillRect(0, y0, W, y1 - y0); }
        c.fillStyle = 'rgba(255,184,72,0.25)'; c.fillRect(8, y1 - 1, W - 16, 1);
        // (round 25: a word too wide for the column at twice the size is drawn a little smaller, never cut by the beam)
        const lab = L.label.toUpperCase(), avail = lx - 34;
        const widest = Math.max(...lab.split(' ').map((w) => bitMeasure(w)));
        const k = Math.max(1.25, Math.min(2, avail / Math.max(1, widest)));
        c.save(); c.translate(16, Math.round((y0 + y1) / 2 - 7 * k)); c.scale(k, k);
        bitText(c, lab, 0, 0, { color: '#ffc860', outline: '#0a0602', maxW: avail / k, lh: 13 });
        c.restore();
      });
      // each socket's name under it, coloured by its state
      const trade = isProf(bv.key);
      // a trade's names share one size on one line: the largest that fits every name in its column
      const tk = [2, 1.75, 1.5].find((q) => bv.nodes.every((v) => bitMeasure(v.n.title.toUpperCase()) <= (bv.colW * PPM - 6) / q)) ?? 1.5;
      for (const v of bv.nodes) {
        // round 25: the names readable from the console: the trades' at twice the size on one line, the lab's at one
        // and a half on up to two lines (a word too long for the column is cut)
        const k = trade ? tk : 1.5;
        // (a trade's name sits under its plinth's drum, clear of it even seen from above the rig)
        const [x, y] = this.toPx(v.p.x, trade ? v.p.y - v.s * 0.36 - 0.095 : v.p.y - v.s * 0.5 - 0.006);
        const lines = fitLines(v.n.title.toUpperCase(), (bv.colW * PPM - 6) / k, trade ? 1 : 2);
        const col = v.vis === 'max' || v.vis === 'owned' ? '#7aff9a' : v.vis === 'open' ? '#ffd890' : v.vis === 'poor' ? '#c8a060' : '#8aa894';
        lines.forEach((ln, i) => { c.save(); c.translate(Math.round(x), Math.round(y + i * 14 * k)); c.scale(k, k); bitText(c, ln, 0, 0, { color: col, outline: '#020403', align: 'center' }); c.restore(); });
        const rank = v.n.ranks > 1 ? `${rankOf(v.n)}/${v.n.ranks}` : rankOf(v.n) ? 'OWNED' : `${v.n.costs[rankPlanned(v.n)] ?? '-'} RP`;
        // (a trade's beside its plinth on the right, clear of the exhibit; a lab socket's on its plate's corner)
        const rc = v.vis === 'open' ? '#ffb030' : '#7a9a82';
        if (trade) {
          const [rx, ry] = this.toPx(v.p.x + bv.colW / 2 - 0.012, v.p.y + v.s * 0.46);
          c.save(); c.translate(Math.round(rx), Math.round(ry)); c.scale(1.5, 1.5); bitText(c, rank, 0, 0, { color: rc, outline: '#020403', align: 'right' }); c.restore();
        } else {
          const [rx, ry] = this.toPx(v.p.x + v.s / 2 - 0.004, v.p.y + v.s / 2 - 0.004);
          bitText(c, rank, rx, ry, { color: rc, outline: '#020403', align: 'right' });
        }
        // round 17: a requirement quest still open (src/game/reqQuests.ts): amber cells and the count, top left of the socket
        const rq = rankOf(v.n) < 1 ? nodeQuest(v.n.rn[0]) : null;
        if (rq && !rq.done) {
          const [qx, qy] = this.toPx(v.p.x - v.s / 2 + 0.004, v.p.y + v.s / 2 - 0.004);
          const cells = Math.min(10, rq.goal), lit = Math.floor((rq.progress / rq.goal) * cells), cw = 5;
          c.fillStyle = '#020403'; c.fillRect(qx - 1, qy - 1, cells * cw + 1, 7);
          for (let i = 0; i < cells; i++) { c.fillStyle = i < lit ? '#f2ad32' : '#2a3a2e'; c.fillRect(qx + i * cw, qy, cw - 1, 5); }
          bitText(c, `${rq.progress}/${rq.goal}`, qx, qy + 8, { color: '#ffb030', outline: '#020403' });
        } else if (!rq) {
          const fr = fieldReq(v.n);
          if (fr && !fr.done) {
            const [qx, qy] = this.toPx(v.p.x - v.s / 2 + 0.004, v.p.y + v.s / 2 - 0.004);
            c.fillStyle = '#020403'; c.fillRect(qx - 1, qy - 1, 8, 8); c.fillStyle = '#f2ad32'; c.fillRect(qx + 1, qy + 1, 4, 4);
            bitText(c, fr.lvl ? `LV ${fr.goal}` : 'QUEST', qx + 10, qy - 1, { color: '#ffb030', outline: '#020403' });
          }
        }
      }
    }
    // scanlines and a roll bar
    c.fillStyle = 'rgba(0,0,0,0.2)';
    for (let y = 0; y < H; y += 2) c.fillRect(0, y, W, 1);
    this.boardTex.needsUpdate = true;
  }
  /** the ticker: the points banked and the codex on the right; a flash when a sample is filed. (Round 25: the
   *  branch tabs are floating keys under the rig and the node is named on the glass, so the strip stays quiet.) */
  private drawTicker() {
    this.tickDirty = false;
    const c = this.tickCv.getContext('2d')!, W = this.tickCv.width, H = this.tickCv.height;
    c.fillStyle = '#080402'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#2a1a08'; c.fillRect(0, H - 2, W, 2);
    const st = codexStats();
    const right = `${researchPoints()} RP  ·  CODEX ${st.pct}%`;
    bitText(c, right, W - 12, 8, { color: '#6aff8e', outline: null, scale: 2, align: 'right' });
    if (this.flashMsg) {
      let msg = this.flashMsg.text;
      const room = W - 12 - bitMeasure(right) * 2 - 40;
      while (msg.length > 4 && bitMeasure(msg) * 2 > room) msg = msg.slice(0, -2);
      c.fillStyle = '#080402'; c.fillRect(0, 0, room + 20, H - 2);
      bitText(c, msg, 12, 8, { color: Math.floor(this.flashMsg.t * 4) % 2 ? '#ffffff' : '#7aff9a', outline: null, scale: 2 });
    }
    this.tickTex.needsUpdate = true;
  }
  /** the reader's CRT: the focused node's file, or standby */
  private drawHead() {
    this.headDirty = false;
    const c = this.headCv.getContext('2d')!, W = this.headCv.width, H = this.headCv.height;
    c.imageSmoothingEnabled = false;
    const g = c.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, W * 0.7);
    g.addColorStop(0, '#142a1a'); g.addColorStop(1, '#040a06');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    const v = this.focused;
    bitText(c, 'R-NET 7 · READER', 10, 6, { color: '#ffb848', outline: null });
    if (!v) {
      bitText(c, 'STANDBY', W / 2, H / 2 - 24, { color: '#7aff9a', outline: null, scale: 2, align: 'center' });
      bitText(c, 'PICK A NODE ON THE LATTICE', W / 2, H / 2 + 14, { color: '#4aa86a', outline: null, align: 'center' });
    } else {
      const n = v.n, st = nodeState(n), r = rankOf(n), rp = rankPlanned(n);
      const lane = this.cur?.lanes.find((l) => l.row === n.row)?.label ?? '';
      bitText(c, `${BRANCHES[this.bi].code}-${String(n.col + 1).padStart(2, '0')}`, W - 10, 6, { color: '#8a6a30', outline: null, align: 'right' });
      c.fillStyle = '#ffb848'; c.fillRect(10, 24, W - 20, 1);
      const title = n.title.toUpperCase();
      bitText(c, title, 10, 30, { color: '#fff4d8', outline: '#060302', scale: 2, maxW: (W - 20) / 2 });
      let y = 30 + 30 * Math.max(1, Math.ceil((bitMeasure(title) * 2) / (W - 20))) + 2;
      bitText(c, `${lane.toUpperCase()} · RANK ${r}/${n.ranks}`, 10, y, { color: '#8ac89a', outline: null }); y += 18;
      const status = st === 'max' ? 'COMPLETE · EVERY RANK OWNED' : st === 'open' ? `OPEN · RANK ${ROMAN[rp + 1] ?? rp + 1} FOR ${n.costs[rp]} RP` : st === 'poor' ? `SHORT · NEEDS ${n.costs[rp]} RP · ${pointsLeft()} BANKED` : `LOCKED · NEEDS ${clip(missing(n).toUpperCase(), W - 40, 2)}`;
      const scol = st === 'open' ? '#ffd040' : st === 'max' ? '#7aff9a' : st === 'poor' ? '#d89a58' : '#ff6a4a';
      c.fillStyle = scol; c.fillRect(10, y + 2, 6, 12);
      bitText(c, status, 22, y, { color: scol, outline: null, maxW: W - 32 });
      y += 15 * Math.max(1, Math.ceil(bitMeasure(status) / (W - 40))) + 6;
      // round 17: a requirement quest (src/game/reqQuests.ts): what the field must see first, and how far along
      // (also a quest named by the research itself, or a gate's own hint: whatever the node waits on in the field)
      const rq0 = fieldReq(n), rq = rq0 && (rp < 1 || rq0.lvl) ? rq0 : null;
      if (rq) {
        const qc = rq.done ? '#7aff9a' : '#ffd040', qt = rq.lvl ? `${rq.text.toUpperCase()} · NOW ${rq.progress}` : `${rq.done ? 'FIELD DONE' : 'FIELD QUEST'} · ${rq.text.toUpperCase()}`;
        // a lamp: lit amber while the field still owes it, green once done
        c.fillStyle = '#020403'; c.fillRect(9, y + 1, 10, 10); c.fillStyle = rq.done ? '#48dc70' : Math.floor(this.t * 2) % 2 ? '#ffb030' : '#7a4a10'; c.fillRect(11, y + 3, 6, 6);
        bitText(c, qt, 24, y, { color: qc, outline: null, maxW: W - 34 });
        y += 15 * Math.max(1, Math.ceil(bitMeasure(qt) / (W - 34))) + 2;
        if (rq.goal > 0 && !rq.lvl) {
          const cells = Math.min(20, rq.goal), cw = Math.max(3, Math.floor((W - 70) / cells)), lit = Math.round((rq.progress / rq.goal) * cells);
          for (let i = 0; i < cells; i++) { c.fillStyle = i < lit ? (rq.done ? '#48dc70' : '#f2ad32') : '#1a2a1e'; c.fillRect(10 + i * cw, y + 2, cw - 1, 8); }
          bitText(c, `${rq.progress}/${rq.goal}`, W - 12, y - 1, { color: qc, outline: null, align: 'right' });
          y += 16;
        }
      }
      c.fillStyle = 'rgba(255,184,72,0.4)'; c.fillRect(10, y - 2, W - 20, 1); y += 4;
      n.gives.forEach((gv, i) => {
        if (y > H - 70) return;
        const own = i < r;
        bitText(c, ROMAN[i + 1] ?? String(i + 1), 12, y, { color: own ? '#7aff9a' : '#8a6a30', outline: null });
        const lines = Math.max(1, Math.ceil(bitMeasure(gv) / (W - 52)));
        bitText(c, gv, 40, y, { color: own ? '#c8ffd0' : '#e8dcb8', outline: null, maxW: W - 52 }); y += 18 * lines;
      });
      const where = n.branch === 'chip' || n.branch === 'limb' ? 'FIT IT ON THE UNIT IN UNIT ROOM 4' : n.branch === 'design' ? 'DRESS THE UNIT IN IT IN UNIT ROOM 4' : isProf(n.branch) ? 'THE TRADE LEVELS BY DOING THE WORK' : 'KNOWN ON EVERY NEW RUN';
      bitText(c, where, 10, H - 42, { color: '#5a8a6a', outline: null });
      const blink = Math.floor(this.t * 2) % 2 === 0;
      c.fillStyle = st === 'open' ? (blink ? '#ffb030' : '#5a3a10') : '#1a120a'; c.fillRect(8, H - 24, W - 16, 18);
      bitText(c, st === 'open' ? 'PULL THE LEVER  ·  RESEARCH' : st === 'max' ? 'NOTHING LEFT TO RESEARCH' : 'NOT AVAILABLE', W / 2, H - 23, { color: st === 'open' ? '#1a0c02' : '#6a5a40', outline: null, align: 'center' });
    }
    if (this.headMsg) {
      // a stamped band across the glass
      c.fillStyle = 'rgba(2,6,3,0.92)'; c.fillRect(0, H / 2 - 26, W, 44);
      c.fillStyle = this.headMsg.col; c.fillRect(0, H / 2 - 26, W, 2); c.fillRect(0, H / 2 + 16, W, 2);
      bitText(c, this.headMsg.text, W / 2, H / 2 - 18, { color: this.headMsg.col, outline: '#000000', scale: 2, align: 'center' });
    }
    c.fillStyle = 'rgba(0,0,0,0.25)';
    for (let yy = 0; yy < H; yy += 2) c.fillRect(0, yy, W, 1);
    this.headTex.needsUpdate = true;
  }

  // ================================================================== opening, closing
  open(o: { onClose?: () => void; branch?: Branch } = {}) {
    if (this.active) return;
    this.active = true;
    this.onClose = o.onClose ?? null;
    clearPlan();
    this.resync();
    if (o.branch) { const i = BRANCHES.findIndex((b) => b.key === o.branch); if (i >= 0 && i !== this.bi) this.show(i, true); }
    this.refresh();
    this.applyState();
    this.sel = this.cur?.nodes.find((v) => v.vis === 'open') ?? this.cur?.nodes[0] ?? null;
    this.focused = null;
    // the focus key (keyboard and pad focus), and a polite live region
    const layer = document.createElement('div');
    layer.className = 'lt-layer';
    layer.innerHTML = '<button type="button" class="lt-key"></button><div class="lt-live" aria-live="polite"></div>';
    document.body.append(layer);
    this.layer = layer;
    this.btn = layer.querySelector('.lt-key') as HTMLButtonElement;
    this.live = layer.querySelector('.lt-live') as HTMLElement;
    this.btn.addEventListener('click', () => this.enterKey());
    this.nav = new FocusNav(layer, { onBack: () => this.back(), onTab: (d) => this.setBranch((this.bi + d + BRANCHES.length) % BRANCHES.length), onArrow: (dx, dy) => { this.moveSel(dx, dy); return true; } });
    this.btn.focus({ preventScroll: true });
    window.addEventListener('keydown', this.onKey, true);
    this.announce();
    sfx('boot', 0.6); gameSound('cy_powerup', 0.4);
    this.tickDirty = true; this.headDirty = true;
    // the action feed: one preview scene while the rig is up (disposed on close)
    this.preview = new ActionPreview(this.mats);
    this.shown = null;
    this.feedMat.crt.target = 1;
    this.readSig = '';
    this.buildTabs();
  }
  close() {
    if (!this.active) return;
    if (this.full) this.toggle3d(false);
    this.active = false;
    clearPlan();
    this.feedMat.crt.target = 0;
    this.feedMat.uniforms.uTex.value = BLACK_TEX;
    this.preview?.dispose(); this.preview = null; this.shown = null;
    this.tabs?.layer.remove(); this.tabs = null;
    this.focused = null;
    if (this.sel) { this.sel = null; }
    this.nav?.destroy(); this.nav = null;
    this.layer?.remove(); this.layer = null; this.btn = null; this.live = null;
    window.removeEventListener('keydown', this.onKey, true);
    for (const h of this.hots) if (h.key.startsWith('lt:')) h.off = true;
    sfx('back'); gameSound('cy_powerdown', 0.35);
    this.headDirty = true; this.tickDirty = true;
    const cb = this.onClose; this.onClose = null;
    cb?.();
  }
  /** Esc / B / a tap on nothing: out of the close-up, then off the lattice */
  back() {
    if (this.full) { this.toggle3d(false); return; }
    if (this.focused) { this.focused = null; this.headDirty = true; this.tickDirty = true; sfx('back', 0.6); gameSound('cy_servo', 0.3); return; }
    this.close();
  }
  private onKey = (e: KeyboardEvent) => {
    if (!this.active) return;
    if (e.key === 'r' || e.key === 'R') { e.preventDefault(); e.stopPropagation(); this.pull(); }
    else if (e.key === 'v' || e.key === 'V') { e.preventDefault(); e.stopPropagation(); this.toggle3d(); }
    else if (e.key === 'Backspace') { e.preventDefault(); e.stopPropagation(); this.back(); }
  };
  /** Enter / A / the focus key: inspect the selected node; on the one inspected, research it */
  private enterKey() {
    const v = this.sel;
    if (!v) return;
    if (this.focused === v) this.pull(); else this.focusNode(v);
  }

  // ================================================================== the nodes
  private hoverNode(v: NodeV, on: boolean) {
    v.hover = on;
    if (on) {
      sfx('tick', 0.25);
      if (!this.focused && v !== this.sel) { this.sel = v; this.tickDirty = true; this.announce(); }
    }
  }
  private pressNode(v: NodeV) {
    if (this.swap) return;
    if (this.focused === v) { this.pull(); return; }
    this.sel = v;
    this.focusNode(v);
  }
  private focusNode(v: NodeV) {
    this.focused = v; this.sel = v;
    this.headDirty = true; this.tickDirty = true;
    sfx('click', 0.7); gameSound('cy_servo', 0.45);
    this.moving = 1;
    this.announce(true);
  }
  /** the arrows: the nearest node that way on the lattice (same lane first) */
  private moveSel(dx: number, dy: number) {
    const bv = this.cur;
    if (!bv || this.swap) return;
    const c = this.sel ?? bv.nodes[0];
    if (!c) return;
    let best: NodeV | null = null, bs = Infinity;
    for (const v of bv.nodes) {
      if (v === c) continue;
      const ddx = v.n.col - c.n.col, ddy = v.li - c.li;
      if (dx && Math.sign(ddx) !== dx) continue;
      if (dy && Math.sign(ddy) !== dy) continue;
      const s = dx ? Math.abs(ddx) + Math.abs(ddy) * 3 : Math.abs(ddy) * 2 + Math.abs(ddx);
      if (s < bs) { bs = s; best = v; }
    }
    if (!best) { sfx('error', 0.3); return; }
    this.sel = best;
    sfx('hover', 0.5);
    if (this.focused) this.focusNode(best); else { this.tickDirty = true; this.announce(); }
  }
  /** the lever: research the inspected (or selected) node's next rank */
  pull() {
    const v = this.focused ?? this.sel;
    if (!v || !this.active) return;
    if (!this.focused) { this.focusNode(v); return; }
    this.leverT = 1;
    sfx('lever', 0.9);
    const st = nodeState(v.n);
    if (st !== 'open') {
      v.deny = 1;
      // a node still waiting on its field quest answers in amber with the count, not a red refusal
      const rq = st === 'locked' ? fieldReq(v.n) : null;
      this.headMsg = rq && !rq.done ? { text: rq.lvl ? `LEVEL ${rq.goal}` : rq.goal ? `FIELD QUEST ${rq.progress}/${rq.goal}` : 'FIELD QUEST', col: '#ffb030', t: 1.4 } : { text: st === 'max' ? 'COMPLETE' : st === 'poor' ? 'NOT ENOUGH RP' : 'LOCKED', col: '#ff6a4a', t: 1.4 };
      setTimeout(() => { sfx('error', 0.6); gameSound('buzzer', 0.35); }, 140);
      this.headDirty = true;
      return;
    }
    clearPlan();
    const ok = stage(v.n.key) && confirmPlan().includes(v.n.key);
    if (!ok) { sfx('error', 0.6); return; }
    v.burst = 1;
    // the charge: down every run into the node first, then out of it to the nodes it feeds (each flashes as it lands)
    for (const L of this.cur?.links ?? []) {
      if (L.to === v) { L.charge = 0; L.ping = false; }
      else if (L.from === v) { L.charge = -0.55; L.ping = true; }
    }
    this.headMsg = { text: 'RESEARCHED', col: '#7aff9a', t: 1.6 };
    setTimeout(() => { sfx('stamp'); gameSound('cy_thunk', 0.6); }, 120);
    setTimeout(() => { sfx('relay', 0.7); gameSound('cy_powerup', 0.5); }, 320);
    this.refresh();
    this.announce(true);
  }
  private announce(full = false) {
    const v = this.focused ?? this.sel;
    if (!this.live || !this.btn) return;
    if (!v) { this.btn.setAttribute('aria-label', 'Research lattice'); return; }
    const st = nodeState(v.n), r = rankPlanned(v.n);
    const s = `${v.n.title}: rank ${rankOf(v.n)} of ${v.n.ranks}, ${st === 'open' ? `research for ${v.n.costs[r]} points` : st === 'max' ? 'complete' : st === 'poor' ? `needs ${v.n.costs[r]} points` : 'locked'}`;
    this.btn.setAttribute('aria-label', s + (this.focused === v ? '. Enter or R to research.' : '. Enter to inspect.'));
    this.live.textContent = full ? `${s}. ${v.n.gives[Math.min(v.n.gives.length - 1, rankOf(v.n))] ?? ''}` : s;
  }

  // ================================================================== branches
  /** the tree's data may have grown (src/game/treeData.ts): rebuild any branch whose nodes changed, and the keys */
  private resync() {
    syncTree();
    const curKey = this.cur?.key;
    for (const [k, bv] of [...this.branches]) {
      const ns = treeNodes(k);
      if (ns.length === bv.nodes.length && ns.every((n, i) => bv.nodes[i]?.n === n)) continue;
      this.group.remove(bv.root);
      const keys = new Set(bv.nodes.map((v) => v.hot.key));
      for (let i = this.hots.length - 1; i >= 0; i--) if (keys.has(this.hots[i].key)) this.hots.splice(i, 1);
      this.branches.delete(k);
      if (this.cur === bv) this.cur = null;
    }
    if (this.keySig !== this.deck + ':' + BRANCHES.map((b) => b.key).join()) this.consoleKeys();
    const i = Math.max(0, BRANCHES.findIndex((b) => b.key === curKey));
    this.show(i, true);
  }
  setBranch(i: number) {
    if (i === this.bi || this.swap) return;
    this.focused = null;
    this.swap = { t: 0, to: i, done: false };
    sfx('ratchet', 0.7); gameSound('cy_clank', 0.45);
    this.headDirty = true;
  }
  /** put a branch on the rig (instantly: no plunge) */
  private show(i: number, instant = false) {
    i = Math.max(0, Math.min(BRANCHES.length - 1, i));
    this.bi = i;
    const br = BRANCHES[i].key;
    const dk = isProf(br) ? 0 : 1;
    if (dk !== this.deck) { this.deck = dk; this.consoleKeys(); }
    if (this.cur) this.cur.root.visible = false;
    this.cur = this.branches.get(br) ?? this.buildBranch(br);
    this.cur.root.visible = true;
    for (const v of this.cur.nodes) v.plunge = instant ? 0 : 1;
    this.sel = this.active ? this.cur.nodes.find((v) => v.vis === 'open') ?? this.cur.nodes[0] ?? null : null;
    this.paintKeys();
    this.buildTabs();
    this.refresh();
    this.applyState();
    if (this.active) this.announce();
    if (this.live) this.live.textContent = BRANCHES[i].name + ' — ' + BRANCHES[i].sub;
  }
  /** a sample was filed (after a bench run): the ticker says so */
  flash(text: string) { this.flashMsg = { text, t: 0 }; this.tickDirty = true; this.refresh(); }

  // ================================================================== round 25: the floating branch keys
  /** the current deck's branches as floating keys (icon and short name) under the rig, and the deck swap */
  private buildTabs() {
    if (!this.active) return;
    const sig = this.deck + ':' + BRANCHES.map((b) => b.key).join();
    if (this.tabs?.sig === sig) { this.lightTabs(); return; }
    this.tabs?.layer.remove();
    const layer = document.createElement('div');
    layer.className = 'lt-tabs';
    const keys = new Map<number, FloatIcon>();
    BRANCHES.forEach((b, i) => {
      if ((isProf(b.key) ? 0 : 1) !== this.deck) return;
      const k = floatIcon(BRANCH_ICON[b.key] ?? 'lattice', shortName(b.name), () => this.setBranch(i), { size: 40, aria: b.name });
      keys.set(i, k);
      layer.append(k);
    });
    const sw = floatIcon(this.deck ? 'club' : 'lattice', this.deck ? 'Trades' : 'Lab', () => this.turnDeck(), { size: 40, aria: this.deck ? 'The trades' : "The lab's research" });
    sw.classList.add('lt-deck');
    layer.append(sw);
    document.body.append(layer);
    this.tabs = { layer, keys, sig };
    this.lightTabs();
  }
  private lightTabs() { for (const [i, k] of this.tabs?.keys ?? []) k.setOn(i === this.bi); }

  // ================================================================== round 25: the action feed and the 3D mode
  /** the stage's preRender: the feed's scene through the menu's post pass into the monitor's tube */
  preRender(r: THREE.WebGLRenderer, t: number, low: boolean) {
    if (!this.active || !this.preview || this.full) return;
    this.preview.render(r, t, low);
    const tex = this.preview.texture;
    if (tex && this.feedMat.uniforms.uTex.value !== tex) this.feedMat.uniforms.uTex.value = tex;
  }
  /** the 3D mode: the feed's own scene on the whole screen (the stage renders it through its own post pass) */
  fullView(): StageView | null { return this.active && this.full && this.preview ? this.preview : null; }
  get in3d() { return !!this.full; }
  /** the 3D mode on or off: the feed fills the screen in the machine kit's housing; drag turns round it, the wheel
   *  moves in, the arrows still walk the lattice (the feed follows), Esc / B / the floating key come back */
  toggle3d(on = !this.full) {
    if (!this.active || on === !!this.full) return;
    this.tog3d.flip(on);
    sfx(on ? 'lever' : 'back', 0.8); gameSound(on ? 'cy_powerup' : 'cy_powerdown', 0.4);
    if (on) {
      if (!this.preview) return;
      const layer = document.createElement('div');
      layer.className = 'lt3d';
      layer.innerHTML = '<div class="crt lt3d-tube"><i class="crt-scan"></i><i class="crt-roll"></i><i class="crt-vig"></i></div><div class="lt3d-keys"></div>';
      document.body.append(layer);
      let frame: MxFrame | null = null;
      if (mxOk()) frame = mxFrame(layer, (w, h) => { const sp = panelSpec(w, h, { seed: 25, lamps: ['green', 'amber'], glands: 2, hazard: true, vents: true, guards: true, win: { l: 18, t: 18, r: 18, b: 84, cut: 9, lip: 5 } }); return sp; }, { over: true, pad: 0 });
      const keys = layer.querySelector('.lt3d-keys') as HTMLElement;
      keys.append(floatIcon('lattice', 'Lattice', () => this.toggle3d(false), { hint: 'Esc', size: 46 }));
      const F = { layer, frame, drag: null as { x: number; y: number; id: number } | null };
      layer.addEventListener('pointerdown', (e) => { if ((e.target as HTMLElement).closest('.fi')) return; F.drag = { x: e.clientX, y: e.clientY, id: e.pointerId }; layer.setPointerCapture?.(e.pointerId); });
      layer.addEventListener('pointermove', (e) => { const d = F.drag; if (!d || d.id !== e.pointerId) return; this.preview?.orbit(e.clientX - d.x, e.clientY - d.y); d.x = e.clientX; d.y = e.clientY; });
      const up = (e: PointerEvent) => { if (F.drag?.id === e.pointerId) F.drag = null; };
      layer.addEventListener('pointerup', up); layer.addEventListener('pointercancel', up);
      layer.addEventListener('wheel', (e) => { e.preventDefault(); this.preview?.zoom(e.deltaY > 0 ? 1.08 : 1 / 1.08); }, { passive: false });
      this.full = F;
      this.preview.audible = true;
    } else {
      const F = this.full!;
      this.full = null;
      F.frame?.dispose(); F.layer.remove();
      this.preview?.resetView();
      if (this.preview) this.preview.audible = false;
      this.btn?.focus({ preventScroll: true });
    }
    this.feedLamp.color.setHex(on ? 0xffb030 : 0x40ff60);
  }
  /** the trade's readout under the monitor: the level huge in amber, the XP bar to the next; the lab's branches show the points */
  private drawReadout() {
    const br = BRANCHES[this.bi];
    if (!br) return;
    const pd = branchProf(br.key);
    const pp = pd ? profProgress(pd.key as ProfKey) : null;
    const sig = br.key + ':' + (pp ? `${pp.level}:${Math.floor(pp.xp)}` : researchPoints());
    if (sig === this.readSig) return;
    this.readSig = sig;
    const c = this.readCv.getContext('2d')!, W = this.readCv.width, H = this.readCv.height;
    c.imageSmoothingEnabled = false;
    c.fillStyle = '#0a0602'; c.fillRect(0, 0, W, H);
    c.fillStyle = 'rgba(255,160,40,0.06)'; for (let x = 0; x < W; x += 4) c.fillRect(x, 0, 1, H);
    bitText(c, br.code, 10, 12, { color: '#8a5a18', outline: null });
    if (pp && pd) {
      bitText(c, 'LV', 10, 62, { color: '#c87a20', outline: null, scale: 2 });
      seg7(c, String(pp.level).padStart(2, '0'), 52, 18, 24, 58);
      // the bar to the next level: one continuous lit strip in a sunk channel
      const bx = 128, bw = W - bx - 12, by = 56, bh = 14, f = Math.max(0, Math.min(1, pp.xp / pp.need));
      c.fillStyle = '#1a0e04'; c.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
      c.fillStyle = '#3a2208'; c.fillRect(bx, by, bw, bh);
      const g = c.createLinearGradient(bx, 0, bx + bw, 0); g.addColorStop(0, '#c86a10'); g.addColorStop(1, '#ffd060');
      c.fillStyle = g; c.fillRect(bx, by, Math.round(bw * f), bh);
      c.fillStyle = 'rgba(255,240,200,0.35)'; c.fillRect(bx, by, Math.round(bw * f), 3);
      bitText(c, pp.level >= 10 ? 'MAX' : `${Math.floor(pp.xp)}/${pp.need}`, bx + bw, 26, { color: '#ffb030', outline: null, scale: 2, align: 'right' });
    } else {
      seg7(c, String(Math.min(9999, researchPoints())).padStart(4, ' '), 52, 18, 24, 58);
      bitText(c, 'RP', W - 14, 52, { color: '#c87a20', outline: null, scale: 2, align: 'right' });
    }
    c.fillStyle = 'rgba(0,0,0,0.22)'; for (let y = 0; y < H; y += 2) c.fillRect(0, y, W, 1);
    this.readTex.needsUpdate = true;
  }

  // ================================================================== the camera
  /** where the camera should be while the rig is up (null: the room decides) */
  camGoal(): Pose | null {
    if (!this.active) return null;
    const v = this.focused;
    if (!v) return { pos: new THREE.Vector3(this.o.x, this.o.y - 0.06, this.Z + 2.55), look: new THREE.Vector3(this.o.x, this.o.y - 0.12, this.Z), fov: 50 };
    // round 25: the close-up keeps the bay's monitor in frame: the node, the reader docked beside it and the
    // monitor, fitted (a node near the bay is a tight shot, one far across the rig a wider one)
    const side = this.dockSide(v), rx = v.p.x + side * 0.42;
    const x0 = Math.min(v.p.x - v.s * 0.7, rx - 0.26), x1 = this.X1 + 0.02;
    // (down to the console's edge: the floating keys and Dr. Calder's line keep the strip under the rig to themselves)
    const y0 = Math.min(v.p.y - v.s * 0.75, this.readerGoal().y - 0.2, this.Y0 - 0.22), y1 = Math.max(v.p.y + v.s * 0.6, this.Y1 - HEADER + 0.02);
    const fov = 46, t = Math.tan(THREE.MathUtils.degToRad(fov / 2));
    const d = Math.max((y1 - y0) / 2 / t, (x1 - x0) / 2 / (t * 1.7)) * 1.06 + 0.15;
    const look = new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, this.Z + 0.15);
    return { pos: look.clone().add(new THREE.Vector3(0, 0.04, d)), look, fov };
  }
  /** the reader docks on the node's left (away from the bay), or on its right at the rig's left edge */
  private dockSide(v: NodeV) { return v.p.x < this.X0 + LABEL_W + 0.45 ? 1 : -1; }
  /** a node is inspected (the camera is in close) */
  get inspecting() { return !!this.focused; }
  /** where the reader parks beside the inspected node (or its rest spot) */
  private readerGoal() {
    const fv = this.focused, park = this.park();
    return fv ? { x: fv.p.x + this.dockSide(fv) * 0.42, y: Math.min(this.o.railY - 0.3, Math.max(this.Y0 + 0.12, fv.p.y - 0.02)) } : park;
  }
  /** dev / screenshots: the reader jumps to its spot, the exhibits finish their swap */
  settle() { const g = this.readerGoal(); this.hx = g.x; this.hy = g.y; for (const v of this.cur?.nodes ?? []) { v.plunge = 0; v.lift = v === this.sel || v === this.focused ? 1 : 0; } this.swap = null; }

  // ================================================================== frame
  update(dt: number, t: number, full: boolean) {
    this.t = t;
    if (this.dirty) this.applyState();
    const bv = this.cur;
    // hots: only while the rig is up, not while the rig swaps branches
    for (const h of this.hots) if (h.key.startsWith('lt:')) h.off = !this.active || (!!this.swap && h.key.startsWith('lt:n:'));
    if (this.active && bv) for (const br of this.branches.values()) if (br !== bv) for (const v of br.nodes) v.hot.off = true;
    // the branch swap: the exhibits plunge into their sockets, the next branch rises out of its own
    if (this.swap) {
      const s = this.swap;
      s.t += dt;
      if (!s.done) { for (const v of bv?.nodes ?? []) v.plunge = Math.min(1, Math.max(v.plunge, (s.t - v.n.col * 0.03) / 0.25)); if (s.t > 0.5) { s.done = true; s.t = 0; this.show(s.to); sfx('relay', 0.6); } }
      else { for (const v of this.cur?.nodes ?? []) v.plunge = Math.max(0, Math.min(v.plunge, 1 - (s.t - v.n.col * 0.03) / 0.3)); if (s.t > 0.7) this.swap = null; }
    }
    // keep keyboard and pad focus on the focus key; the pad's X researches
    if (this.active && this.btn && document.activeElement !== this.btn && !(document.activeElement instanceof HTMLInputElement)) this.btn.focus({ preventScroll: true });
    if (this.active) { try { const p = navigator.getGamepads?.()[0]; const x = !!p?.buttons[2]?.pressed, y = !!p?.buttons[3]?.pressed; if (x && !this.padX) this.pull(); if (y && !this.padY) this.toggle3d(); this.padX = x; this.padY = y; } catch { /* no pads */ } }
    this.light.intensity = damp(this.light.intensity, this.active ? 1.8 : 0.5, 3, dt);
    if (!full && !this.active) return;
    const cur = this.cur;
    if (cur) {
      const pulse = 0.55 + 0.45 * Math.sin(t * 4.2);
      this.frameMats.get('open')!.color.setHex(STATE_COL.open).multiplyScalar(0.4 + 0.65 * pulse);
      this.coreMats[2].color.setHex(0xb87a28).multiplyScalar(0.55 + 0.6 * pulse);
      this.coreMats[3].color.setHex(0x48dc70).multiplyScalar(0.85 + 0.15 * Math.sin(t * 1.6));
      const fast = 0.5 + 0.5 * Math.sin(t * 7);
      this.coreMats[4].color.setHex(0xfff0c0).multiplyScalar(0.7 + 0.4 * fast);
      this.coreMats[5].color.setHex(0xff6a3a).multiplyScalar(0.35 + 0.75 * fast);
      // each run's core: the inspected (or selected) node's runs lit, a charge in flight dims it until it lands
      const fv0 = this.active ? this.focused ?? this.sel : null;
      for (const L of cur.links) {
        if (L.charge < 1) {
          L.charge = Math.min(1, L.charge + dt * 1.7);
          if (L.charge >= 1 && L.ping) { L.ping = false; L.to.burst = Math.max(L.to.burst, 0.55); sfx('tick', 0.35); }
        }
        const hot = !!fv0 && (L.to === fv0 || L.from === fv0);
        const m = this.coreMats[L.charge < 1 ? 1 : hot ? (L.lit ? 4 : 5) : L.lit];
        if (L.core.material !== m) L.core.material = m;
      }
      for (const v of cur.nodes) {
        const on = v.hover || v === this.sel || v === this.focused;
        v.lift = damp(v.lift, on && this.active ? 1 : 0, 9, dt);
        v.cageK = damp(v.cageK, v.vis === 'locked' ? 1 : 0, 6, dt);
        v.burst = Math.max(0, v.burst - dt * 0.8);
        v.deny = Math.max(0, v.deny - dt * 2.5);
        this.setLook(v);
        const fm = this.frameMats.get(v.vis)!;
        v.frame.material = v.emit.material = fm;
        const k = 1 - v.plunge;
        const shake = v.deny > 0 ? Math.sin(t * 60) * 0.01 * v.deny : 0;
        v.hold.position.set(v.p.x + shake, v.p.y + v.s * 0.05 + Math.sin(t * 1.3 + v.ph) * 0.004 * k, v.p.z + v.lift * 0.06 - v.plunge * 0.07);
        const sc = (1 + v.lift * 0.2 + v.burst * 0.35 + (v.vis === 'open' ? 0.04 * Math.sin(t * 4.2) : 0)) * Math.max(0.02, k);
        v.hold.scale.setScalar(sc);
        v.spin.rotation.set(0.18, t * (0.55 + v.lift * 0.9) + v.ph, Math.sin(t * 0.7 + v.ph) * 0.06);
        v.cage.visible = v.cageK > 0.02;
        v.cage.scale.set(1, Math.max(0.02, v.cageK), 1);
        if (v.burst > 0) { const bc = this.burstCard; bc.visible = true; bc.position.set(v.p.x, v.p.y, v.p.z + 0.02); bc.scale.setScalar(0.4 + (1 - v.burst) * 1.6); (bc.material as THREE.MeshBasicMaterial).opacity = v.burst; }
      }
      if (!cur.nodes.some((v) => v.burst > 0)) this.burstCard.visible = false;
      // beads down the live conduits: green and slow on owned runs, amber and quick into a node open now,
      // white on the inspected node's runs, red-orange up its missing requirements, and a big charge head after a research
      let bi = 0;
      const put = (L: LinkV, f: number, col: number, sz: number) => {
        if (bi >= BEADS) return;
        let d = f * L.len, p = L.pts[0];
        for (let i = 0; i < L.pts.length - 1; i++) { const sl = L.pts[i].distanceTo(L.pts[i + 1]); if (d <= sl) { p = this.v.copy(L.pts[i]).lerp(L.pts[i + 1], d / Math.max(1e-4, sl)); break; } d -= sl; p = L.pts[i + 1]; }
        this.m4.makeScale(sz, sz, sz).setPosition(p.x, p.y, p.z + 0.006);
        this.beads.setMatrixAt(bi, this.m4);
        this.beads.setColorAt(bi++, this.col.setHex(col));
      };
      for (const L of cur.links) {
        if (L.len < 0.02) continue;
        if (L.charge >= 0 && L.charge < 1) { put(L, L.charge, 0xffffff, 2.4); put(L, Math.max(0, L.charge - 0.06), 0xfff0b0, 1.6); continue; }
        const hot = !!fv0 && (L.to === fv0 || L.from === fv0);
        const [n, sp, col] = hot ? (L.lit ? [3, 0.5, 0xfff4d8] : [2, 0.32, 0xff7a4a]) : L.lit === 3 ? [1, 0.18, 0x8affa8] : L.lit === 2 ? [2, 0.42, 0xffd070] : L.lit === 1 ? [1, 0.12, 0xb88a40] : [0, 0, 0];
        for (let j = 0; j < n; j++) put(L, (t * sp * (0.3 / Math.max(0.15, L.len)) + L.from.ph + j / n) % 1, col, hot ? 1.25 : 1);
      }
      this.beads.count = bi;
      this.beads.instanceMatrix.needsUpdate = true;
      if (this.beads.instanceColor) this.beads.instanceColor.needsUpdate = true;
    }
    // round 25: the action feed follows the node under the pointer (or the inspected one); the readout and the toggle
    if (this.active && this.preview) {
      const fv1 = this.focused ?? this.sel;
      if (fv1 && fv1.n !== this.shown && !this.swap) { this.shown = fv1.n; this.preview.show(shotFor(fv1.n)); }
      this.preview.update(dt, t);
    }
    if (full || this.active) { this.drawReadout(); this.tog3d.update(dt); }
    // the reader drives over beside the inspected node (or back to its park)
    const fv = this.focused;
    const { x: tx, y: ty } = this.readerGoal();
    const ox = this.hx, oy = this.hy;
    this.hx = damp(this.hx, tx, 5, dt); this.hy = damp(this.hy, ty, 5, dt);
    const sp = Math.hypot(this.hx - ox, this.hy - oy) / Math.max(1e-4, dt);
    if (sp > 0.25 && this.moving <= 0) this.moving = 0.4;
    this.moving = Math.max(0, this.moving - dt);
    const hz = this.Z + 0.33;
    this.head.position.set(this.hx, this.hy, hz);
    this.head.rotation.z = Math.sin(t * 9) * 0.004 * Math.min(1, sp);
    this.carriage.position.set(this.hx, this.o.railY - 0.02, hz);
    const top = this.hy + 0.22;
    this.mast.position.set(this.hx, this.o.railY - 0.06, hz);
    this.mast.scale.set(1, Math.max(0.01, this.o.railY - 0.06 - top), 1);
    // the lever: pulled down hard, springs back
    this.leverT = Math.max(0, this.leverT - dt * 2.4);
    this.leverA = damp(this.leverA, this.leverT > 0.55 ? 1 : 0, 16, dt);
    this.lever.rotation.x = 0.35 + this.leverA * 1.5;
    this.headLamp.color.setHex(this.headMsg?.col === '#ff6a4a' ? (Math.floor(t * 8) % 2 ? 0xff2a1a : 0x2a0806) : fv && nodeState(fv.n) === 'open' ? (Math.floor(t * 2) % 2 ? 0xffb030 : 0x3a2008) : 0x40ff60);
    if (this.headMsg) { this.headMsg.t -= dt; if (this.headMsg.t <= 0) { this.headMsg = null; this.headDirty = true; } }
    // console keys dip when pressed
    for (const k of this.keys) { k.dip = Math.max(0, k.dip - dt * 4); k.cap.position.y = 0.026 - k.dip * 0.012; }
    // the strips
    if (this.flashMsg) { this.flashMsg.t += dt; if (Math.floor(this.flashMsg.t * 4) !== Math.floor((this.flashMsg.t - dt) * 4)) this.tickDirty = true; if (this.flashMsg.t > 2.2) { this.flashMsg = null; this.tickDirty = true; } }
    if (this.tickDirty) this.drawTicker();
    // the reader's blinking prompt redraws twice a second while it shows a file
    if (fv && Math.floor(t * 2) !== Math.floor((t - dt) * 2)) this.headDirty = true;
    if (this.headDirty) this.drawHead();
  }
}

// ================================================================== helpers
/** the floating keys' models: the trades (research/tradeIcons.ts) and the lab's branches */
const BRANCH_ICON: Record<string, IconKind> = {
  p_combat: 'club', p_medic: 'medkit', p_engineer: 'wrench', p_scavenger: 'crate', p_cook: 'pot', p_botanist: 'sprout', p_handler: 'pail', p_researcher: 'flask',
  design: 'boot', recipe: 'clipboard', build: 'blueprint', matter: 'spool', device: 'compass', farm: 'sprout', chip: 'plug', talent: 'scale', limb: 'gear',
};
/** a branch's short name for its floating key ('Unit designs' -> 'Designs', 'The Printer' -> 'Printer') */
const shortName = (name: string) => { const w = name.split(' '); return w.length > 1 ? w[w.length - 1].charAt(0).toUpperCase() + w[w.length - 1].slice(1) : name; };
/** amber seven-segment digits (the readout's tubes): lit segments over their dark ghosts */
const SEG: Record<string, string> = { '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd', '6': 'afgedc', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg', ' ': '' };
function seg7(c: CanvasRenderingContext2D, txt: string, x0: number, y0: number, w: number, h: number) {
  const t = Math.max(3, Math.round(w * 0.2)), hh = Math.round(h / 2);
  const bars: Record<string, [number, number, number, number]> = {
    a: [t, 0, w - 2 * t, t], g: [t, hh - t / 2, w - 2 * t, t], d: [t, h - t, w - 2 * t, t],
    f: [0, t, t, hh - t * 1.5], b: [w - t, t, t, hh - t * 1.5], e: [0, hh + t / 2, t, hh - t * 1.5], c: [w - t, hh + t / 2, t, hh - t * 1.5],
  };
  [...txt].forEach((ch, i) => {
    const x = x0 + i * (w + 8), on = SEG[ch] ?? '';
    for (const [k, [bx, by, bw, bh]] of Object.entries(bars)) {
      const lit = on.includes(k);
      c.fillStyle = lit ? '#ffb83a' : 'rgba(255,150,40,0.08)';
      c.fillRect(x + bx + (h - by) * 0.08, y0 + by, bw, bh);
      if (lit) { c.fillStyle = 'rgba(255,240,190,0.55)'; c.fillRect(x + bx + (h - by) * 0.08, y0 + by, bw, Math.max(1, bh / 3)); }
    }
  });
}
const BLACK_TEX = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
BLACK_TEX.needsUpdate = true;
function canvasTex(cv: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/** a square lit frame with cut corners (never rounded), s across, bar thickness t */
function squareRing(s: number, t: number): THREE.BufferGeometry {
  const o = s / 2, i = o - t, c = t * 1.2;
  const sh = new THREE.Shape([[-o + c, -o], [o - c, -o], [o, -o + c], [o, o - c], [o - c, o], [-o + c, o], [-o, o - c], [-o, -o + c]].map(([x, y]) => new THREE.Vector2(x, y)));
  sh.holes.push(new THREE.Path([[-i, -i], [-i, i], [i, i], [i, -i]].map(([x, y]) => new THREE.Vector2(x, y))));
  return new THREE.ShapeGeometry(sh);
}
/** the lock cage over a socket: a top and bottom rail and four bars, anchored at its foot (scales down into the shelf) */
function cage(s: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const h = s * 0.88, w = s * 0.86;
  parts.push(new THREE.BoxGeometry(w, 0.012, 0.016).translate(0, 0, 0), new THREE.BoxGeometry(w, 0.012, 0.016).translate(0, h, 0));
  // four thin bars (the exhibit stays visible behind them, dark)
  for (let i = 0; i < 4; i++) parts.push(new THREE.BoxGeometry(0.005, h, 0.005).translate(-w / 2 + 0.01 + (i * (w - 0.02)) / 3, h / 2, 0));
  // a padlock hanging off the top rail
  parts.push(new THREE.BoxGeometry(0.034, 0.03, 0.014).translate(w * 0.3, h * 0.72, 0.012), new THREE.BoxGeometry(0.022, 0.016, 0.006).translate(w * 0.3, h * 0.72 + 0.022, 0.012));
  return mergeGeometries(parts, false) ?? new THREE.BoxGeometry(w, h, 0.01);
}
function missing(n: TreeNode): string {
  const need = n.req.map((k) => treeNode(k)).filter((m) => m && rankPlanned(m) < 1).map((m) => m!.title);
  const rn = researchFor(n, rankPlanned(n) + 1);
  for (const q of rn?.requires ?? []) { const m = treeNodes().find((t) => t.rn.includes(q)); if (m && rankPlanned(m) < 1 && !need.includes(m.title)) need.push(m.title); }
  const q = fieldReq(n);
  return need.length ? need.join(', ') : q && !q.done ? (q.lvl ? q.text : 'a field quest') : 'an earlier node';
}
/** what a node still waits on outside research: a requirement quest's count (src/game/reqQuests.ts), a quest named by
 *  the research (quest / reqQuest, read from the quest runtime), or its gate's hint (goal 0: no count to show) */
function fieldReq(n: TreeNode): { text: string; progress: number; goal: number; done: boolean; lvl?: boolean } | null {
  // round 25: a trade's node waits on the trade's level (src/game/professions.ts), every rank
  const pg = profGate(n.key);
  if (pg) return { text: `${pg.prof.name} level ${pg.level}`, progress: pg.have, goal: pg.level, done: false, lvl: true };
  if (rankOf(n) >= 1) return null;
  const rq = nodeQuest(n.rn[0]);
  if (rq) return { text: rq.text, progress: rq.progress, goal: rq.goal, done: rq.done };
  const rn = researchFor(n, 1) as (ReturnType<typeof researchFor> & { quest?: string; reqQuest?: string }) | undefined;
  if (!rn) return null;
  const qk = rn.quest ?? rn.reqQuest;
  if (qk) {
    const v = (G.missions?.quests as QuestRuntime | undefined)?.view?.(qk);
    const objs = v?.objectives ?? [];
    return { text: v?.title ?? qk, progress: objs.filter((o) => o.done).length, goal: objs.length, done: v?.status === 'done' };
  }
  if (rn.gate && !rn.gate()) return { text: rn.gateHint || 'not yet earned', progress: 0, goal: 0, done: false };
  return null;
}
/** a name in at most n lines of maxW (font px at scale 1): whole words, a word too long cut with a full stop */
function fitLines(t: string, maxW: number, n: number): string[] {
  const cut = (w: string) => { while (w.length > 3 && bitMeasure(w) > maxW) w = w.slice(0, -2) + '.'; return w; };
  const out: string[] = [];
  let cur = '';
  for (const w of t.split(' ')) {
    const nx = cur ? cur + ' ' + w : w;
    if (bitMeasure(nx) <= maxW) { cur = nx; continue; }
    if (cur) out.push(cur);
    cur = bitMeasure(w) > maxW ? cut(w) : w;
  }
  if (cur) out.push(cur);
  if (out.length > n) { const rest = out.slice(n - 1).join(' '); out.length = n; out[n - 1] = cut(rest); }
  return out;
}
/** cut a text to at most `lines` wrapped lines of maxW font px (an ellipsis on the last) */
function clip(s: string, maxW: number, lines: number): string {
  const words = s.split(' ');
  const out: string[] = []; let cur = '';
  for (const w of words) {
    const nx = cur ? cur + ' ' + w : w;
    if (bitMeasure(nx) > maxW && cur) { out.push(cur); cur = w; if (out.length >= lines) break; } else cur = nx;
  }
  if (out.length < lines && cur) out.push(cur);
  if (out.length >= lines && out.join(' ').length < s.length) out[lines - 1] = out[lines - 1].replace(/\s*\S*$/, '') + '...';
  return out.slice(0, lines).join(' ');
}
