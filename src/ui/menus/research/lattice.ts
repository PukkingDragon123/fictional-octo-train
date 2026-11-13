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
//   the conduits  square steel runs between the sockets; their cores light and
//                 carry beads of light once the node they come from is owned
//   the reader    an XY gantry on a rail over the housing: a small CRT with a
//                 RESEARCH lever. Pick a node and the camera closes on it while
//                 the reader drives over beside it and prints the node's file
//   the keys      a key per branch and LOG OFF on the console under the housing
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
import {
  BRANCHES, treeNodes, treeNode, treeLanes, rankOf, rankPlanned, nodeState, stage, clearPlan, confirmPlan, researchFor, pointsLeft, syncTree,
  type Branch, type TreeNode,
} from '../../../game/unitTree';
import type { Hot } from '../monitor/stage';
import { FacetBuilder, at, cbox, prism, bolt, C, glowCard, gameSound } from '../monitor/props';
import type { FMats } from '../scene/pixtex';
import { nodeModel, matFor, type Look, type Exhibit } from './models';

const HEADER = 0.12, FOOT = 0.075, LABEL_W = 0.46, PPM = 440;
const ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V'];
const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt));
type Vis = 'max' | 'owned' | 'open' | 'poor' | 'locked';
const STATE_COL: Record<Vis, number> = { max: 0x5aff8a, owned: 0x5aff8a, open: 0xffb030, poor: 0x8a5a1c, locked: 0x2a1610 };
export interface Pose { pos: THREE.Vector3; look: THREE.Vector3; fov: number }

interface NodeV {
  n: TreeNode; br: Branch; li: number;
  p: THREE.Vector3; s: number;
  spin: THREE.Group; ex: Exhibit; hold: THREE.Group;
  frame: THREE.Mesh; emit: THREE.Mesh; cage: THREE.Mesh; pips: THREE.Mesh[];
  hit: THREE.Mesh; hot: Hot;
  vis: Vis; look: Look; hover: boolean; lift: number; cageK: number; burst: number; deny: number; ph: number; plunge: number;
}
interface LinkV { from: NodeV; to: NodeV; pts: THREE.Vector3[]; len: number; core: THREE.Mesh; lit: 0 | 1 | 2 }
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
  private coreMats = [0x241c12, 0xb87a28, 0xffc860].map((c) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false }));
  private pipMats = { on: new THREE.MeshBasicMaterial({ color: 0x5aff8a, toneMapped: false }), next: new THREE.MeshBasicMaterial({ color: 0xffb030, toneMapped: false }), off: new THREE.MeshBasicMaterial({ color: 0x1a1612, toneMapped: false }) };
  private cageMat = new THREE.MeshStandardMaterial({ color: 0x6a6e70, metalness: 0.75, roughness: 0.35, flatShading: true });
  private hitMat = new THREE.MeshBasicMaterial({ visible: false });
  private beads: THREE.InstancedMesh;
  private burstCard = glowCard(0.6, 0.6, 0xfff0b0, 1.0);
  private flashMsg: { text: string; t: number } | null = null;
  // focus, keys, screen reader
  private layer: HTMLElement | null = null; private btn: HTMLButtonElement | null = null; private live: HTMLElement | null = null;
  private nav: FocusNav | null = null;
  private onClose: (() => void) | null = null;
  private padX = false;
  private dirty = true; private tickDirty = true; private headDirty = true;
  private t = 0;
  private m4 = new THREE.Matrix4(); private v = new THREE.Vector3();

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
    this.light.position.set(o.x, o.y - 0.1, o.z + 1.3);
    // the beads that run the lit conduits
    this.beads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.018, 0.018, 0.018), new THREE.MeshBasicMaterial({ color: 0xfff0c0, toneMapped: false }), 96);
    this.beads.count = 0; this.beads.frustumCulled = false; this.beads.userData.noGlow = true;
    this.group.add(this.beads);
    this.burstCard.visible = false; this.group.add(this.burstCard);
    this.mast = this.reader();
    this.consoleKeys();
    this.show(0, true);
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

  /** a key per branch on the console's left (two rows of four) and LOG OFF on its right; rebuilt when branches are added */
  private consoleKeys() {
    const K = this.o.keys;
    for (const k of this.keys) { this.group.remove(k.g); const i = this.hots.findIndex((h) => h.key === 'lt:key' + k.br); if (i >= 0) this.hots.splice(i, 1); }
    this.keys = [];
    this.keySig = BRANCHES.map((b) => b.key).join();
    const n = BRANCHES.length, OFF = 99;
    const word = (name: string) => { const w = name.split(' '); return (name.length <= 8 ? name : w[w.length - 1]).toUpperCase().slice(0, 8); };
    const labels: [string, number][] = [...BRANCHES.map((b, i) => [word(b.name), i] as [string, number]), ['LOG OFF', OFF]];
    labels.forEach(([label, i]) => {
      const g = new THREE.Group();
      // two rows down the rake (back row higher), LOG OFF beside the tape reader
      const row = i === OFF ? 0 : Math.floor(i / 4), col = i === OFF ? 0 : i % 4, dz = n > 4 ? (row ? 0.075 : -0.07) : 0;
      g.position.set(i === OFF ? K.x + 1.72 : K.x + col * 0.125, K.y - dz * Math.tan(K.tilt), K.z + dz);
      g.rotation.x = K.tilt;
      const b = new FacetBuilder();
      b.add('metal', cbox(0.118, 0.012, 0.08, 0.003), C.darker, at(0, 0.004, 0));
      g.add(b.build(this.mats, { cast: false }));
      const cap = new THREE.Mesh(cbox(0.1, 0.032, 0.062, 0.008), new THREE.MeshStandardMaterial({ color: i === OFF ? 0xa8261e : 0x2a2622, roughness: 0.45, flatShading: true }));
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
      this.hots.push({ key: 'lt:key' + i, objs: [cap], label: '', off: !this.active, press: () => { k.dip = 1; if (i === OFF) this.close(); else this.setBranch(i); } });
    });
    this.paintKeys();
  }
  private paintKeys() {
    for (const k of this.keys) {
      const c = k.cv.getContext('2d')!, on = k.br === this.bi, off = k.br === 99;
      c.fillStyle = off ? '#3a0a08' : on ? '#ffb030' : '#1a140c'; c.fillRect(0, 0, 96, 24);
      c.fillStyle = off ? '#5a1410' : on ? '#fff0b0' : '#2a2014'; c.fillRect(0, 0, 96, 2);
      bitText(c, k.label, 48, 4, { color: off ? '#ff9a80' : on ? '#2a1404' : '#b88a40', outline: null, align: 'center' });
      k.tex.needsUpdate = true;
    }
  }

  /** a branch's sockets, models, conduits (built the first time it is shown) */
  private buildBranch(br: Branch): BranchV {
    const ns = treeNodes(br);
    const rows = [...new Set([...treeLanes(br).map((l) => l.row), ...ns.map((n) => n.row)])].filter((r) => ns.some((n) => n.row === r)).sort((a, b) => a - b);
    const nc = Math.max(1, ...ns.map((n) => n.col + 1)), nl = Math.max(1, rows.length);
    const L0 = this.X0 + LABEL_W, R0 = this.X1 - 0.06, T0 = this.Y1 - HEADER - 0.025, B0 = this.Y0 + FOOT + 0.02;
    const colW = Math.min(0.52, (R0 - L0) / nc), rowH = Math.min(0.34, (T0 - B0) / nl);
    const gx = L0 + ((R0 - L0) - colW * nc) / 2, gy = T0 - ((T0 - B0) - rowH * nl) / 2;
    const s = Math.min(colW * 0.6, rowH * 0.66, 0.21);
    const root = new THREE.Group(); root.visible = false;
    const Z = this.Z;
    const fb = new FacetBuilder();
    const frameGeo = squareRing(s, s * 0.09);
    const cageGeo = cage(s);
    const lanes = rows.map((r, li) => ({ row: r, label: treeLanes(br).find((l) => l.row === r)?.label ?? '', y: gy - (li + 0.5) * rowH }));
    const nodes: NodeV[] = [];
    for (const n of ns) {
      const li = rows.indexOf(n.row);
      const px = gx + (n.col + 0.5) * colW, py = gy - (li + 0.5) * rowH;
      // the socket: a bolted back plate, a holo shelf on a strut
      fb.add('metal', cbox(s, s, 0.014, 0.004), 0x3a3e40, at(px, py, Z + 0.008));
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) fb.add('chrome', bolt(0.006, 0.006), C.steel, at(px + dx * (s / 2 - 0.014), py + dy * (s / 2 - 0.014), Z + 0.015, Math.PI / 2));
      const shY = py - s * 0.36;
      fb.add('metal', cbox(s * 0.72, 0.014, 0.1, 0.003), 0x6a7072, at(px, shY, Z + 0.06));
      fb.add('metal', cbox(0.012, 0.012, 0.11, 0.002), C.dark, at(px, shY - 0.03, Z + 0.05, -0.5));
      const frame = new THREE.Mesh(frameGeo, this.frameMats.get('locked')!);
      frame.position.set(px, py, Z + 0.0155); frame.userData.noGlow = true;
      const emit = new THREE.Mesh(new THREE.PlaneGeometry(s * 0.6, 0.08), this.frameMats.get('locked')!);
      emit.rotation.x = -Math.PI / 2; emit.position.set(px, shY + 0.0075, Z + 0.062); emit.userData.noGlow = true;
      const hold = new THREE.Group(); hold.position.set(px, py + s * 0.05, Z + 0.075);
      const spin = new THREE.Group(); hold.add(spin);
      const ex = nodeModel(n);
      ex.root.scale.setScalar(s * 0.62);
      spin.add(ex.root);
      const cg = new THREE.Mesh(cageGeo, this.cageMat);
      cg.position.set(px, py - s * 0.42, Z + 0.135); cg.castShadow = false;
      const pips: THREE.Mesh[] = [];
      if (n.ranks > 1) for (let r = 0; r < n.ranks; r++) {
        const pp = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.01, 0.006), this.pipMats.off);
        pp.position.set(px + (r - (n.ranks - 1) / 2) * 0.026, shY - 0.004, Z + 0.112); pp.userData.noGlow = true;
        pips.push(pp);
      }
      const hit = new THREE.Mesh(new THREE.BoxGeometry(s * 1.05, s * 1.05, 0.22), this.hitMat);
      hit.position.set(px, py, Z + 0.11);
      root.add(frame, emit, hold, cg, hit, ...pips);
      const v: NodeV = {
        n, br, li, p: new THREE.Vector3(px, py, Z + 0.075), s, spin, ex, hold, frame, emit, cage: cg, pips, hit, hot: null as unknown as Hot,
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
      links.push({ from, to, pts, len, core, lit: 0 });
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
      v.pips.forEach((pp, i) => { pp.material = i < r ? this.pipMats.on : i === r && v.vis === 'open' ? this.pipMats.next : this.pipMats.off; });
    }
    for (const L of bv.links) {
      L.lit = rankOf(L.from.n) > 0 ? 2 : L.to.vis === 'open' ? 1 : 0;
      L.core.material = this.coreMats[L.lit];
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
        bitText(c, L.label.toUpperCase(), 16, (y0 + y1) / 2 - 14, { color: '#ffc860', outline: '#0a0602', maxW: (lx - 30) / 2, scale: 2, lh: 13 });
      });
      // each socket's name under it, coloured by its state
      for (const v of bv.nodes) {
        const [x, y] = this.toPx(v.p.x, v.p.y - v.s / 2 - 0.006);
        const maxW = (bv.colW * PPM - 8);
        let t = v.n.title.toUpperCase();
        while (t.length > 3 && bitMeasure(t) > maxW) t = t.slice(0, -2) + '.';
        const col = v.vis === 'max' || v.vis === 'owned' ? '#7aff9a' : v.vis === 'open' ? '#ffd890' : v.vis === 'poor' ? '#a88a58' : '#4a5a4e';
        bitText(c, t, x, y, { color: col, outline: '#020403', align: 'center' });
        const rank = v.n.ranks > 1 ? `${rankOf(v.n)}/${v.n.ranks}` : rankOf(v.n) ? 'OWNED' : `${v.n.costs[rankPlanned(v.n)] ?? '-'} RP`;
        const [rx, ry] = this.toPx(v.p.x + v.s / 2 - 0.004, v.p.y + v.s / 2 - 0.004);
        bitText(c, rank, rx, ry, { color: v.vis === 'open' ? '#ffb030' : '#5a7a62', outline: '#020403', align: 'right' });
        // round 17: a requirement quest still open (src/game/reqQuests.ts): amber cells and the count, top left of the socket
        const rq = rankOf(v.n) < 1 ? nodeQuest(v.n.rn[0]) : null;
        if (rq && !rq.done) {
          const [qx, qy] = this.toPx(v.p.x - v.s / 2 + 0.004, v.p.y + v.s / 2 - 0.004);
          const cells = Math.min(10, rq.goal), lit = Math.floor((rq.progress / rq.goal) * cells), cw = 5;
          c.fillStyle = '#020403'; c.fillRect(qx - 1, qy - 1, cells * cw + 1, 7);
          for (let i = 0; i < cells; i++) { c.fillStyle = i < lit ? '#f2ad32' : '#2a3a2e'; c.fillRect(qx + i * cw, qy, cw - 1, 5); }
          bitText(c, `${rq.progress}/${rq.goal}`, qx, qy + 8, { color: '#ffb030', outline: '#020403' });
        }
      }
    }
    // the key strip
    const hint = 'ARROWS MOVE   ENTER INSPECT   R / LEVER RESEARCH   Q E BRANCH   ESC BACK';
    bitText(c, hint, W / 2, fy + (H - fy) / 2 - 8, { color: '#6aff8e', outline: null, align: 'center' });
    // scanlines and a roll bar
    c.fillStyle = 'rgba(0,0,0,0.2)';
    for (let y = 0; y < H; y += 2) c.fillRect(0, y, W, 1);
    this.boardTex.needsUpdate = true;
  }
  private drawTicker() {
    this.tickDirty = false;
    const c = this.tickCv.getContext('2d')!, W = this.tickCv.width, H = this.tickCv.height;
    c.fillStyle = '#080402'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#2a1a08'; c.fillRect(0, H - 2, W, 2);
    let x = 10;
    BRANCHES.forEach((b, i) => {
      const on = i === this.bi, w = bitMeasure(b.code) * 2 + 16;
      c.fillStyle = on ? '#ffb030' : '#1e1408'; c.fillRect(x, 4, w, H - 10);
      bitText(c, b.code, x + 8, 8, { color: on ? '#1a0c02' : '#8a6a30', outline: null, scale: 2 });
      x += w + 6;
    });
    x += 14;
    const st = codexStats();
    const right = `${researchPoints()} RP  ·  CODEX ${st.pct}%`;
    bitText(c, right, W - 12, 8, { color: '#6aff8e', outline: null, scale: 2, align: 'right' });
    const room = W - 12 - bitMeasure(right) * 2 - 30 - x;
    let msg = '', col = '#ffd890';
    if (this.flashMsg) { msg = this.flashMsg.text; col = Math.floor(this.flashMsg.t * 4) % 2 ? '#ffffff' : '#7aff9a'; }
    else {
      const v = this.focused ?? this.sel;
      if (v) {
        const st2 = nodeState(v.n), r = rankPlanned(v.n);
        const rq2 = st2 === 'locked' && rankOf(v.n) < 1 ? nodeQuest(v.n.rn[0]) : null;
        msg = `${v.n.title.toUpperCase()} · ${st2 === 'max' ? 'COMPLETE' : st2 === 'open' ? `OPEN ${v.n.costs[r]} RP` : st2 === 'poor' ? `SHORT ${v.n.costs[r]} RP` : rq2 && !rq2.done ? `FIELD QUEST ${rq2.progress}/${rq2.goal}` : 'LOCKED'}`;
        col = st2 === 'open' ? '#ffd890' : st2 === 'max' ? '#7aff9a' : st2 === 'poor' ? '#c89a58' : '#7a8a7e';
      } else msg = `R-NET 7 · ${BRANCHES[this.bi].name.toUpperCase()} · ${BRANCHES[this.bi].sub.toUpperCase()}`;
    }
    while (msg.length > 4 && bitMeasure(msg) * 2 > room) msg = msg.slice(0, -2);
    bitText(c, msg, x, 8, { color: col, outline: null, scale: 2 });
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
      const rq = rp < 1 ? nodeQuest(n.rn[0]) : null;
      if (rq) {
        const qc = rq.done ? '#7aff9a' : '#ffd040', qt = `${rq.done ? 'FIELD DONE' : 'FIELD QUEST'} · ${rq.text.toUpperCase()}`;
        bitText(c, qt, 10, y, { color: qc, outline: null, maxW: W - 20 });
        y += 15 * Math.max(1, Math.ceil(bitMeasure(qt) / (W - 20))) + 2;
        const cells = Math.min(20, rq.goal), cw = Math.max(3, Math.floor((W - 70) / cells)), lit = Math.round((rq.progress / rq.goal) * cells);
        for (let i = 0; i < cells; i++) { c.fillStyle = i < lit ? (rq.done ? '#48dc70' : '#f2ad32') : '#1a2a1e'; c.fillRect(10 + i * cw, y + 2, cw - 1, 8); }
        bitText(c, `${rq.progress}/${rq.goal}`, W - 12, y - 1, { color: qc, outline: null, align: 'right' });
        y += 16;
      }
      c.fillStyle = 'rgba(255,184,72,0.4)'; c.fillRect(10, y - 2, W - 20, 1); y += 4;
      n.gives.forEach((gv, i) => {
        if (y > H - 70) return;
        const own = i < r;
        bitText(c, ROMAN[i + 1] ?? String(i + 1), 12, y, { color: own ? '#7aff9a' : '#8a6a30', outline: null });
        const lines = Math.max(1, Math.ceil(bitMeasure(gv) / (W - 52)));
        bitText(c, gv, 40, y, { color: own ? '#c8ffd0' : '#e8dcb8', outline: null, maxW: W - 52 }); y += 18 * lines;
      });
      const desc = n.desc || researchFor(n, Math.min(n.ranks, rp + 1))?.desc || '';
      if (desc && y < H - 60) { y += 4; bitText(c, clip(desc, W - 20, Math.max(1, Math.floor((H - 46 - y) / 18))), 10, y, { color: '#8aa890', outline: null, maxW: W - 20 }); }
      const where = n.branch === 'chip' || n.branch === 'limb' ? 'FIT IT ON THE UNIT IN UNIT ROOM 4' : n.branch === 'design' ? 'DRESS THE UNIT IN IT IN UNIT ROOM 4' : 'KNOWN ON EVERY NEW RUN';
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
  }
  close() {
    if (!this.active) return;
    this.active = false;
    clearPlan();
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
    if (this.focused) { this.focused = null; this.headDirty = true; this.tickDirty = true; sfx('back', 0.6); gameSound('cy_servo', 0.3); return; }
    this.close();
  }
  private onKey = (e: KeyboardEvent) => {
    if (!this.active) return;
    if (e.key === 'r' || e.key === 'R') { e.preventDefault(); e.stopPropagation(); this.pull(); }
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
      const rq = st === 'locked' && rankOf(v.n) < 1 ? nodeQuest(v.n.rn[0]) : null;
      this.headMsg = rq && !rq.done ? { text: `FIELD QUEST ${rq.progress}/${rq.goal}`, col: '#ffb030', t: 1.4 } : { text: st === 'max' ? 'COMPLETE' : st === 'poor' ? 'NOT ENOUGH RP' : 'LOCKED', col: '#ff6a4a', t: 1.4 };
      setTimeout(() => { sfx('error', 0.6); gameSound('buzzer', 0.35); }, 140);
      this.headDirty = true;
      return;
    }
    clearPlan();
    const ok = stage(v.n.key) && confirmPlan().includes(v.n.key);
    if (!ok) { sfx('error', 0.6); return; }
    v.burst = 1;
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
    if (this.keySig !== BRANCHES.map((b) => b.key).join()) this.consoleKeys();
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
    if (this.cur) this.cur.root.visible = false;
    this.cur = this.branches.get(br) ?? this.buildBranch(br);
    this.cur.root.visible = true;
    for (const v of this.cur.nodes) v.plunge = instant ? 0 : 1;
    this.sel = this.active ? this.cur.nodes.find((v) => v.vis === 'open') ?? this.cur.nodes[0] ?? null : null;
    this.paintKeys();
    this.refresh();
    this.applyState();
    if (this.active) this.announce();
    if (this.live) this.live.textContent = BRANCHES[i].name + ' — ' + BRANCHES[i].sub;
  }
  /** a sample was filed (after a bench run): the ticker says so */
  flash(text: string) { this.flashMsg = { text, t: 0 }; this.tickDirty = true; this.refresh(); }

  // ================================================================== the camera
  /** where the camera should be while the rig is up (null: the room decides) */
  camGoal(): Pose | null {
    if (!this.active) return null;
    const v = this.focused;
    if (!v) return { pos: new THREE.Vector3(this.o.x, this.o.y - 0.06, this.Z + 2.55), look: new THREE.Vector3(this.o.x, this.o.y - 0.12, this.Z), fov: 50 };
    const side = this.dockSide(v);
    const look = new THREE.Vector3(v.p.x + side * 0.22, v.p.y - 0.01, this.Z + 0.15);
    return { pos: look.clone().add(new THREE.Vector3(0, 0.05, 1.05)), look, fov: 46 };
  }
  private dockSide(v: NodeV) { return v.p.x > this.X1 - 0.75 ? -1 : 1; }
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
    if (this.active) { try { const p = navigator.getGamepads?.()[0]; const x = !!p?.buttons[2]?.pressed; if (x && !this.padX) this.pull(); this.padX = x; } catch { /* no pads */ } }
    this.light.intensity = damp(this.light.intensity, this.active ? 3.2 : 0.6, 3, dt);
    if (!full && !this.active) return;
    const cur = this.cur;
    if (cur) {
      const pulse = 0.55 + 0.45 * Math.sin(t * 4.2);
      this.frameMats.get('open')!.color.setHex(STATE_COL.open).multiplyScalar(0.4 + 0.65 * pulse);
      this.pipMats.next.color.setHex(0xffb030).multiplyScalar(Math.floor(t * 3) % 2 ? 1.2 : 0.25);
      this.coreMats[1].color.setHex(0xb87a28).multiplyScalar(0.55 + 0.45 * pulse);
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
      // beads down the lit conduits
      let bi = 0;
      for (const L of cur.links) {
        if (!L.lit || L.len < 0.02 || bi >= 96) continue;
        const f = ((t * (L.lit === 2 ? 0.35 : 0.2) + L.from.ph) % 1) * L.len;
        let d = f, p = L.pts[0];
        for (let i = 0; i < L.pts.length - 1; i++) { const sl = L.pts[i].distanceTo(L.pts[i + 1]); if (d <= sl) { p = this.v.copy(L.pts[i]).lerp(L.pts[i + 1], d / Math.max(1e-4, sl)); break; } d -= sl; p = L.pts[i + 1]; }
        this.m4.makeTranslation(p.x, p.y, p.z + 0.006);
        this.beads.setMatrixAt(bi++, this.m4);
      }
      this.beads.count = bi;
      this.beads.instanceMatrix.needsUpdate = true;
    }
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
  const q = nodeQuest(n.rn[0]);
  return need.length ? need.join(', ') : q && !q.done ? 'a field quest' : 'an earlier node';
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
