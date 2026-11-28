// THE ROOM CLOSE-UP'S WORKS (round 26, part B): what the operator does down in a room of the facility map
// (front/facilityMap.ts). The wing starts derelict; each room is restored in physical stages, then furnished:
//   CLEAR    a skip is lowered into the corridor on chains; every piece of debris is picked up and carried into it
//            by hand (press, drag, let go: it falls, bounces and lands with its own sound; dropped short, it stays
//            where it lands). The last piece in, the skip is hoisted away.
//   REPAIR   a short cinematic: the crew (HumanRig, ./crew.ts) comes in, hammers the wall, welds the light up, the
//            lights stutter and come on. CLEAN: they mop and sweep, the water and the soot go, the room warms.
//   BUILD    the stores float in front of the camera as live 3D models (no tiles); one picked up becomes a ghost on
//            the room's grid (green where it fits, red where it does not), turned with the wheel (or R), dropped in
//            with a thud. A placed piece can be picked up again, moved, turned, or sent back (refunded).
//   FINISH   the same strip with the finishes: paint tins, tile, paper and carpet samples, bulbs; one press puts it on.
// Each stage is paid when it starts (src/game/facilityCatalog.ts: dollars and the press's matter), and Dr. Calder
// says a word in the subtitle strip. The room's totals float over its back wall as icons and numbers; the keys
// are floating icons with their cost under them. The cinematics honour Options > CUTSCENES (Facility works).
//   const w = new Works(host)   w.open(id) / w.close()   w.update(dt)   w.back() (Esc)   w.busy   w.press()
import * as THREE from 'three';
import './icons';
import { installFurnitureModels, modelOf } from './models';
import { extMats } from './kit';
import { Crew } from './crew';
import { HALF, WALL_H, CELL, GN, SKIP_AT, SKIP_W, SKIP_D, skipSlot, type DebrisPiece } from '../dioramas';
import type { FacilityMap, Diorama, Pose } from '../facilityMap';
import type { MenuStage } from '../../monitor/stage';
import type { FMats } from '../../scene/pixtex';
import { FacetBuilder, at, cbox, prism, lathe } from '../../scene/facet';
import { Puffs, Arcs, Chain } from '../../scene/fx';
import { Subs } from '../../../../game/introKit/subs';
import { iconKey } from '../../iconKey';
import { mxIcon, type IconKind } from '../../../machine/decor';
import { creditAmount } from '../../../creditIcon';
import { sfx, sample } from '../../sfx';
import { cutMode, cutLen } from '../../../../game/cuts';
import { room, roomDef, roomBonuses, screenOpen, moveFurniture, FIRST_ROOM, type RoomId, type FacilityStat, type Bonuses } from '../../../../game/facility';
import {
  stageOf, stageCost, gateOf, canPay, startStage, binDebris, buyFurniture, sellFurniture, applyFinish, debrisCount,
  FURN, FINISHES, ZOO, furnSpec, purposeOf, prestige, plotCost, plotGate, buildPlot, collectTakings,
  type Cost, type FurnSpec, type FinishSpec, type Stage,
} from '../../../../game/facilityCatalog';
import { tamedKeys } from '../../../../game/facilityFx';
import { file } from '../../../../game/meridian';
import { hasItemDef, itemDef } from '../../../../items/item';
import { touchFacility } from '../../../../game/facility';
import { itemGeometry } from '../../../../items/itemMeshes';
import { MAT, banked, type Mat } from '../../../../game/economy/matter';
import { dollars } from '../../../../game/economy/money';
import './build.css';

type Mode = 'off' | 'view' | 'clear' | 'build' | 'cine';
type Tab = 'furniture' | 'decor' | 'finish' | 'zoo' | 'museum';

export interface WorksHost {
  root: HTMLElement;
  stage: MenuStage;
  map: FacilityMap;
  mats: FMats;
  /** go into the room's own screen */
  enter(id: RoomId): void;
  /** up out of the close-up to the whole map */
  up(): void;
}

const STAT_ICON: Record<FacilityStat, IconKind> = {
  rest: 'bunk', health: 'medkit', craft: 'wrench', yield: 'sprout', melee: 'club', scan: 'lens', research: 'flask',
  morale: 'mug', sanity: 'pills', storage: 'crate', income: 'credit', prestige: 'laurel',
};
const STAT_ORDER: FacilityStat[] = ['prestige', 'rest', 'health', 'morale', 'sanity', 'craft', 'research', 'scan', 'yield', 'melee', 'storage', 'income'];
const STAGE_ICON: Record<Stage, IconKind> = { clear: 'skip', repair: 'wrench', clean: 'mop' };
const STAGE_NAME: Record<Stage, string> = { clear: 'Clear', repair: 'Repair', clean: 'Clean' };
const SCREEN_ICON: Partial<Record<RoomId, IconKind>> = { monitors: 'crt', control: 'crt', lattice: 'lattice', archive: 'cabinet', unit: 'plug', vault: 'jar', fab: 'spool', workshop: 'scale' };
const LINE = {
  first: 'The bunks first. Nobody does good work on no sleep.',
  skip: 'All of it goes in the skip. Start with the heavy pieces.',
  cleared: 'Clear. Now we can see what we are dealing with.',
  repaired: 'Power holds. That wiring was older than both of us.',
  money: 'We cannot cover that yet. Bring more back from the levels.',
  gate: 'Not that room yet. Finish what you have started.',
  build: 'It is yours now. Make it work for you.',
  locked: 'We have not brought one of those back yet. Catch one, tame one, bank a sample.',
  tier: 'The board will not sign for that until the Institute has more to show.',
  wing: 'The board approved the annex. Fill it with something worth seeing.',
  plotGate: 'The board wants more to show for itself before it funds another wing.',
  takings: 'The board sent money. The exhibits are being noticed.',
  zoo: 'A containment wing. Keep the glass clean and the keepers fed.',
  museum: 'A museum hall. Everything we brought back, where it can be seen.',
};
const RESTORED: Partial<Record<RoomId, string>> = {
  bunks: 'Beds that do not smell of mould. The crews will notice.', unit: 'Unit room four, as it should be.', control: 'The control room breathes again.',
  monitors: 'Every screen lit. Good.', workshop: 'A bench worth working at.', canteen: 'Hot food. Morale is a resource too.', archive: 'The archive is dry. The files will keep.',
  dress: 'Clean lockers. Small things matter.', fab: 'Fabrication is ours again.', lattice: 'The lattice. Handle it with care.', vault: 'Containment holds. Keep it that way.',
  clone: 'The vats are clean. I will not ask what for.',
};
const PIECE_SOUND: Record<DebrisPiece['kind'], string[]> = {
  stone: ['dmg_crumble', 'dmg_debris_metal'], wood: ['dmg_debris_wood', 'wood_hit'], metal: ['dmg_debris_metal', 'metal_clank'], soft: ['dmg_debris_soft', 'plastic_tap'], paper: ['paper', 'thud_soft'],
};

// ---------------------------------------------------------------- small drawn parts
const div = (cls: string) => { const d = document.createElement('div'); d.className = cls; return d; };
const MAT_SHAPE: Record<Mat, string> = { metal: 'ingot', polymer: 'pellet', fibre: 'skein', wood: 'plank', mineral: 'crystal', chem: 'flask', organic: 'leaf', exotic: 'orb' };
const matIcons = new Map<Mat, string>();
/** a matter's little pixel icon (12 x 12 art pixels, drawn once): an ingot, a plank, pellets, a skein, a crystal... */
function matIcon(m: Mat): string {
  const hit = matIcons.get(m);
  if (hit) return hit;
  const cv = document.createElement('canvas'); cv.width = cv.height = 12;
  const x = cv.getContext('2d')!;
  const base = MAT[m].color, c = new THREE.Color(base);
  const tone = (k: number) => '#' + c.clone().multiplyScalar(k).getHexString();
  const px = (X: number, Y: number, col: string) => { x.fillStyle = col; x.fillRect(X, Y, 1, 1); };
  const rect = (X: number, Y: number, w: number, h: number, col: string) => { x.fillStyle = col; x.fillRect(X, Y, w, h); };
  switch (MAT_SHAPE[m]) {
    case 'ingot': rect(1, 5, 10, 5, tone(0.6)); rect(2, 3, 8, 3, tone(1.1)); rect(3, 3, 6, 1, tone(1.4)); rect(1, 9, 10, 1, tone(0.4)); break;
    case 'plank': rect(0, 4, 12, 4, tone(0.85)); rect(0, 4, 12, 1, tone(1.2)); rect(0, 7, 12, 1, tone(0.55)); px(3, 5, tone(0.6)); px(8, 6, tone(0.6)); break;
    case 'pellet': for (const [a, b] of [[2, 6], [6, 4], [7, 8], [3, 9]]) { rect(a, b, 3, 2, tone(1)); px(a, b, tone(1.4)); } break;
    case 'skein': for (let i = 0; i < 4; i++) rect(2 + i * 2, 2, 1, 8, i % 2 ? tone(0.8) : tone(1.2)); rect(1, 5, 10, 2, tone(0.6)); break;
    case 'crystal': rect(4, 1, 4, 10, tone(1)); rect(3, 3, 6, 6, tone(0.9)); rect(5, 2, 1, 6, tone(1.5)); break;
    case 'flask': rect(5, 1, 2, 4, tone(0.7)); rect(3, 5, 6, 5, tone(1)); rect(3, 8, 6, 2, tone(1.3)); break;
    case 'leaf': rect(3, 3, 6, 6, tone(1)); rect(5, 2, 2, 8, tone(1.2)); rect(5, 9, 1, 2, tone(0.6)); break;
    default: rect(3, 3, 6, 6, tone(1)); rect(4, 4, 2, 2, tone(1.6));
  }
  // a one-pixel dark outline round the shape
  const im = x.getImageData(0, 0, 12, 12), d = im.data, o = new Uint8ClampedArray(d);
  for (let y = 0; y < 12; y++) for (let X = 0; X < 12; X++) {
    const i = (y * 12 + X) * 4;
    if (d[i + 3]) continue;
    const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => { const xx = X + a, yy = y + b; return xx >= 0 && yy >= 0 && xx < 12 && yy < 12 && d[(yy * 12 + xx) * 4 + 3]; });
    if (n) { o[i] = 11; o[i + 1] = 10; o[i + 2] = 7; o[i + 3] = 255; }
  }
  x.putImageData(new ImageData(o, 12, 12), 0, 0);
  const url = cv.toDataURL();
  matIcons.set(m, url);
  return url;
}
/** a price: the credit coin and the dollars, then each matter's icon and its kilograms; short ones go red */
function costEl(c: Cost, small = false): HTMLElement {
  const el = div('fw-cost' + (small ? ' sm' : ''));
  if (c.$ > 0) { const a = creditAmount(c.$, small ? 13 : 16); if (dollars() < c.$) a.classList.add('short'); el.append(a); }
  for (const [k, v] of Object.entries(c.m ?? {}) as [Mat, number][]) {
    if (!v) continue;
    const s = document.createElement('span'); s.className = 'fw-mat' + (banked(k) + 1e-6 < v ? ' short' : '');
    const img = document.createElement('img'); img.src = matIcon(k); img.alt = MAT[k].name;
    const b = document.createElement('b'); b.textContent = v < 1 ? v.toFixed(1) : String(Math.round(v * 10) / 10);
    s.append(img, b); s.title = MAT[k].name; el.append(s);
  }
  return el;
}
/** a row of stat chips: each stat's little icon and its number */
function statsEl(b: Bonuses, small = false): HTMLElement {
  const el = div('fw-chips' + (small ? ' sm' : ''));
  for (const s of STAT_ORDER) {
    const v = b[s];
    if (!v) continue;
    const c = document.createElement('span'); c.className = 'fw-chip';
    const ic = mxIcon(STAT_ICON[s], small ? 16 : 22); if (ic) c.append(ic);
    const n = document.createElement('b'); n.textContent = (v > 0 ? '+' : '') + v; c.append(n);
    c.title = s; el.append(c);
  }
  return el;
}

// ---------------------------------------------------------------- the finishes as samples
function swatch(f: FinishSpec, mats: FMats): THREE.Object3D {
  const b = new FacetBuilder(), X = extMats(mats);
  if (f.part === 'light') {
    b.add('brass', lathe([[0, 0], [0.045, 0], [0.05, 0.06], [0.04, 0.07], [0, 0.07]], 10), 0xc8a050, at(0, 0, 0));
    b.add('lamp', lathe([[0, 0.07], [0.04, 0.08], [0.09, 0.16], [0.08, 0.24], [0.04, 0.27], [0, 0.275]], 12), f.color, at(0, 0, 0));
    b.add('glass', lathe([[0, 0.07], [0.045, 0.08], [0.1, 0.16], [0.09, 0.25], [0.045, 0.285], [0, 0.29]], 12), 0xffffff, at(0, 0, 0));
  } else if (f.mat === 'paint') {
    // a paint tin, lid off and leaning on it, the colour up to the rim and down one side
    b.add('metal', lathe([[0, 0], [0.11, 0], [0.11, 0.16], [0.105, 0.17], [0, 0.17]], 14), 0xb8bcb8, at(0, 0, 0));
    b.add('paint', lathe([[0, 0], [0.1, 0], [0, 0.004]], 14), f.color, at(0, 0.168, 0));
    b.add('paint', cbox(0.03, 0.1, 0.006, 0.002), f.color, at(0.06, 0.12, 0.105));
    b.add('paint', cbox(0.12, 0.06, 0.004, 0.002), 0xe8e0c8, at(0, 0.07, 0.112));
    b.add('metal', lathe([[0, 0], [0.115, 0], [0.115, 0.01], [0, 0.01]], 14), 0xa8aca8, at(0.13, 0.08, -0.04, 0, 0, 1.2));
    b.add('chrome', prism(0.004, 0.2, 5), 0x8a8a84, at(0, 0.2, 0, 0, 0, 1.4));
  } else if (f.part === 'wall') {
    // a sample board: the finish over a skirting, on a little easel
    b.add(f.mat as never, cbox(0.26, 0.3, 0.02, 0.004), f.color, at(0, 0.18, 0), { rep: f.mat === 'tile' ? 0.15 : 0.25 });
    b.add('wood', cbox(0.27, 0.04, 0.03, 0.004), 0x5a4430, at(0, 0.04, 0.005));
    b.add('wood', cbox(0.02, 0.34, 0.02, 0.004), 0x6a4a2a, at(0, 0.16, -0.08, -0.35, 0, 0));
  } else {
    // a floor sample: a square of the floor on a slab, a corner turned up (a roll for carpet)
    if (f.mat === 'carpet') {
      b.add('carpet' as never, lathe([[0, 0], [0.07, 0], [0.07, 0.3], [0, 0.3]], 12), f.color, at(0, 0.07, 0, 0, 0, Math.PI / 2), { rep: 0.2 });
      b.add('carpet' as never, cbox(0.3, 0.01, 0.22, 0.002), f.color, at(0.02, 0.005, 0.14), { rep: 0.2 });
    } else {
      b.add(f.mat as never, cbox(0.3, 0.03, 0.3, 0.004), f.color, at(0, 0.015, 0), { rep: f.mat === 'check' ? 0.2 : f.mat === 'parquet' ? 0.3 : 0.3 });
      b.add(f.mat as never, cbox(0.14, 0.025, 0.14, 0.004), f.color, at(0.06, 0.06, 0.04, 0.3, 0.4, 0.2), { rep: 0.2 });
    }
  }
  return b.build(X as unknown as FMats);
}

// ---------------------------------------------------------------- the works
interface CatItem { key: string; furn?: FurnSpec; fin?: FinishSpec; holder: THREE.Group; spin: THREE.Group; fit: number; x: number; hot: number; tag: HTMLElement; ready: boolean; locked?: boolean; tier?: number; model: THREE.Object3D }
/** what rides along with a multi-piece move: its offset from the anchor, its turn, its height, its ghost */
interface Rider { uid: string; kind: string; dx: number; dz: number; rot: number; y?: number; ghost: THREE.Object3D }
interface Held { kind: string; uid?: string; rot: number; ghost: THREE.Object3D; x: number; z: number; y: number; ok: boolean; on: boolean; fromCat: boolean; press: number; riders: Rider[] }
interface Fall { p: DebrisPiece; v: THREE.Vector3; rest: THREE.Vector3; bin: boolean; spin: THREE.Vector3; hits: number; slot: number }
interface Drop { o: THREE.Object3D; t: number; heavy: number; foot: THREE.Vector3; y0: number }

const GHOST_OK = 0x7ad88a, GHOST_NO = 0xd85a3a;
/** what is not in hand yet: a dark bronze cast of itself */
const LOCKED_MAT = new THREE.MeshStandardMaterial({ color: 0x2a2620, roughness: 0.45, metalness: 0.6 });
/** an item with a model the case can show */
const itemModelOk = (k: string) => { try { return !!itemGeometry(k); } catch { return false; } };
const _v = new THREE.Vector3(), _r = new THREE.Raycaster();

export class Works {
  readonly el = div('fw');
  private keys = div('fw-keys');
  private stats = div('fw-stats');
  private tags = div('fw-tags');
  private tabs = div('fw-tabs');
  private heldKeys = div('fw-heldkeys');
  private subRoot = div('ix-root fw-subs');
  private subs: Subs;
  mode: Mode = 'off';
  id: RoomId | null = null;
  private tab: Tab = 'furniture';
  private crew: Crew | null = null;
  private puffs = new Puffs(80);
  private sparkP = new Puffs(40);
  private arcs = new Arcs(10);
  private chains: Chain[] = [];
  private fxHost: THREE.Object3D | null = null;
  private skipFx: { y: number; v: number; up: boolean; t: number } | null = null;
  // clearing
  private drag: { p: DebrisPiece; target: THREE.Vector3; prev: THREE.Vector3; vel: THREE.Vector3 } | null = null;
  private falls: Fall[] = [];
  private binned: number[] = [];
  // building
  private cat: CatItem[] = [];
  private scroll = 0; private scrollGoal = 0;
  private hot: CatItem | null = null;
  private held: Held | null = null;
  private grid: THREE.LineSegments | null = null;
  private foot: THREE.Mesh | null = null;
  private drops: Drop[] = [];
  private ptr = { x: 0, y: 0, down: false, dx: 0, dy: 0, moved: false, n: 0 };
  private t = 0;
  private said = new Set<string>();
  private skipCine = false;
  /** build mode: the grid snap (off: free placement and fine turns) and the pieces picked for a group move */
  private snap = true;
  private sel = new Set<string>();
  private selMarks: THREE.Mesh[] = [];
  private lb = div('fw-lb');

  constructor(private h: WorksHost) {
    installFurnitureModels();
    this.el.append(this.stats, this.tags, this.keys, this.tabs, this.heldKeys);
    this.el.hidden = true;
    this.lb.innerHTML = '<i></i><i></i>';
    h.root.append(this.el, this.lb, this.subRoot);
    this.subs = new Subs(this.subRoot);
    this.puffs.mesh.userData.noGlow = true; this.sparkP.mesh.userData.noGlow = true; this.arcs.lines.userData.noGlow = true;
    const cv = h.stage.canvas;
    cv.addEventListener('pointerdown', (e) => this.down(e));
    window.addEventListener('pointermove', (e) => this.move(e));
    window.addEventListener('pointerup', (e) => this.up(e));
    cv.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
    cv.addEventListener('contextmenu', (e) => { if (this.held) { e.preventDefault(); this.turn(1); } });
    window.addEventListener('keydown', (e) => this.key(e), true);
    if (import.meta.env.DEV) (window as unknown as { __works?: Works }).__works = this;
  }

  /** a mode owns the pointer (the map must not take a click as "back out") */
  get busy() { return this.mode === 'clear' || this.mode === 'build' || this.mode === 'cine'; }
  private get map() { return this.h.map; }
  private get frame() { return this.id ? this.map.roomFrame(this.id) : null; }
  private get dio(): Diorama | null { return this.id ? this.map.diorama(this.id) : null; }

  // ================================================================== in and out
  /** the camera is down in this room: its keys, its totals */
  open(id: RoomId) {
    if (this.id && this.id !== id) this.close();
    this.id = id;
    this.mode = 'view';
    this.el.hidden = false;
    this.map.setHotsOff(true);
    this.attachFx();
    this.viewShot();
    const r = room(id);
    // a clearing left half done: straight back into it
    if (r.work?.skip && r.condition === 0) { void this.beginClear(false); return; }
    this.render();
    if (id === FIRST_ROOM && r.condition === 0 && !this.said.has('first')) { this.said.add('first'); this.say(LINE.first); }
  }
  /** out of the close-up */
  close() {
    if (this.mode === 'off') return;
    this.endBuild();
    this.endClear(false);
    this.crew?.dispose(); this.crew = null;
    if (this.id) { this.map.hold(this.id, false); this.map.loosen(this.id, false); }
    this.map.setHotsOff(false);
    this.map.shotPose = null; this.map.lightMul = 1;
    this.detachFx();
    this.mode = 'off'; this.id = null;
    this.el.hidden = true;
    this.keys.innerHTML = ''; this.stats.innerHTML = ''; this.tags.innerHTML = ''; this.tabs.innerHTML = ''; this.heldKeys.innerHTML = '';
  }
  /** Esc: leave the mode (true when it did something) */
  back(): boolean {
    if (this.mode === 'cine') { this.skipCine = true; return true; }
    if (this.mode === 'build') { if (this.held) { this.cancelHeld(); return true; } if (this.sel.size) { this.clearSel(); return true; } this.endBuild(); this.mode = 'view'; this.viewShot(); this.render(); sfx('back'); return true; }
    if (this.mode === 'clear') { this.endClear(true); this.mode = 'view'; this.viewShot(); this.render(); sfx('back'); return true; }
    return false;
  }
  /** a press on the room in the close-up (or Enter): into its screen */
  press(): boolean {
    if (this.mode !== 'view' || !this.id || !screenOpen(this.id)) return false;
    this.h.enter(this.id);
    return true;
  }
  /** a click the map did not use: true when it landed on the room (so the map stays down in it) */
  miss(x = this.ptr.dx, y = this.ptr.dy): boolean {
    if (this.busy) return true;
    const d = this.dio, ray = this.h.stage.rayAt(x, y);
    if (!d || !ray) return false;
    _r.ray.copy(ray);
    const hit = _r.intersectObject(d.group, true)[0];
    if (!hit) return false;
    this.press();
    return true;
  }
  private say(text: string) { this.subs.show('Dr. Calder', text, { mute: true, hold: 2.6 }); }
  /** the film's bars for a key moment (a flight into a room, a cinematic) */
  letterbox(on: boolean) { this.lb.classList.toggle('on', on); }
  /** the room framed whole in the close-up, a little above the keys */
  private viewShot() { if (this.id) this.map.shotPose = this.map.closePose(this.id, { dist: 9.4, pitch: 0.9, look: new THREE.Vector3(0.05, 0.35, 0.3) }); }
  /** the exhibits' takings since the map was last open: paid now, a word from Calder */
  takings() {
    const r = collectTakings();
    if (!r.$ && !r.rp) return;
    sample('tithe_jingle', 0.6) || sample('kiosk_accept', 0.5);
    this.say(LINE.takings);
    const t = div('fw-take');
    t.append(costEl({ $: r.$ }));
    if (r.rp) { const b = document.createElement('b'); b.className = 'fw-rp'; const ic = mxIcon('flask', 22); if (ic) b.append(ic); b.append('+' + r.rp); t.append(b); }
    this.h.root.append(t);
    setTimeout(() => t.classList.add('out'), 3200); setTimeout(() => t.remove(), 4200);
  }

  private attachFx() {
    const f = this.frame;
    if (!f) return;
    this.fxHost = f;
    f.add(this.puffs.mesh, this.sparkP.mesh, this.arcs.lines);
  }
  private detachFx() { this.puffs.mesh.removeFromParent(); this.sparkP.mesh.removeFromParent(); this.arcs.lines.removeFromParent(); this.puffs.clear(); this.sparkP.clear(); for (const c of this.chains) c.mesh.removeFromParent(); this.chains = []; this.fxHost = null; }

  // ================================================================== the close-up's keys and totals
  private render() {
    const id = this.id;
    this.keys.innerHTML = ''; this.tabs.innerHTML = ''; this.heldKeys.innerHTML = '';
    this.el.dataset.mode = this.mode;
    if (!id) return;
    this.renderStats();
    if (this.mode === 'build') { this.renderTabs(); return; }
    if (this.mode !== 'view') return;
    const r = room(id), st = stageOf(id);
    const key = (kind: IconKind, name: string, fn: () => void, below?: HTMLElement, cls = '') => {
      const w = div('fw-k ' + cls);
      const b = iconKey(kind, name, fn, { model: 54, nameHover: true, cls: 'fw-ik' });
      w.append(b);
      if (below) w.append(below);
      w.style.setProperty('--ik-i', String(this.keys.childElementCount));
      this.keys.append(w);
      return b;
    };
    if (roomDef(id).plot && !r.built) {
      const g = plotGate(id), c = plotCost(id);
      if (g.rooms || g.prestige) {
        const gg = div('fw-gate');
        const ic = mxIcon(g.prestige ? 'laurel' : 'key', 18); if (ic) gg.append(ic);
        const n = document.createElement('b'); n.textContent = String(g.prestige || g.rooms); gg.append(n);
        key('blueprint', 'Annex', () => { sfx('error', 0.5); this.say(LINE.plotGate); }, gg, 'dim');
      } else key('blueprint', 'Build wing', () => this.wing(), costEl(c), canPay(c) ? 'warm' : 'dim');
      return;
    }
    if (screenOpen(id)) key(SCREEN_ICON[id] ?? 'door', roomDef(id).name, () => this.press(), undefined, 'warm');
    if (st) {
      const gate = gateOf(id);
      if (gate > 0) {
        const g = div('fw-gate'); const n = document.createElement('b'); n.textContent = String(gate); const ic = mxIcon('key', 16); if (ic) g.append(ic); g.append(n);
        key('key', 'Locked', () => { sfx('error', 0.5); this.say(LINE.gate); }, g, 'dim');
      } else {
        const c = stageCost(id, st)!;
        key(STAGE_ICON[st], STAGE_NAME[st], () => this.stage(), costEl(c), canPay(c) ? 'warm' : 'dim');
      }
    }
    if (r.condition >= 3) key('blueprint', 'Build', () => this.beginBuild(), undefined, 'warm');
  }
  private renderStats() {
    const id = this.id!;
    this.stats.innerHTML = '';
    const b = roomBonuses(id);
    const row = Object.values(b).some((v) => v) ? statsEl(b) : div('fw-chips');
    // what the room has become, by what is in it: a containment wing, a museum hall
    const pur = purposeOf(room(id).furniture.map((f) => f.kind));
    if (pur) { const ic = mxIcon(pur === 'zoo' ? 'cage' : 'vitrine', 34); if (ic) { const c = document.createElement('span'); c.className = 'fw-chip fw-pur'; c.append(ic); c.title = pur; row.prepend(c); } }
    if (row.childElementCount) this.stats.append(row);
  }

  // ================================================================== the stages
  private stage() {
    const id = this.id;
    if (!id || this.mode !== 'view') return;
    const st = stageOf(id);
    const why = startStage(id);
    if (why === 'money') { sfx('error', 0.6); this.say(LINE.money); this.render(); return; }
    if (why === 'gate') { sfx('error', 0.6); this.say(LINE.gate); return; }
    if (why === 'busy' && st === 'clear') { void this.beginClear(false); return; }
    if (why) return;
    sample('kiosk_accept', 0.5) || sfx('confirm', 0.6);
    if (st === 'clear') void this.beginClear(true);
    else if (st === 'repair') void this.repairCine();
    else if (st === 'clean') void this.cleanCine();
  }

  // ---------------------------------------------------------------- a cinematic's clock (any click or key skips)
  private k = 1;
  private wait(s: number): Promise<void> {
    const ms = s * 1000 * this.k;
    return new Promise((res) => { const t0 = performance.now(); const tick = () => { if (this.skipCine || performance.now() - t0 >= ms) res(); else requestAnimationFrame(tick); }; tick(); });
  }
  private beginCine() {
    this.mode = 'cine'; this.render(); this.skipCine = false;
    const m = cutMode('restore');
    this.k = cutLen(m);
    if (m === 'off') this.skipCine = true;
  }
  private shot(o: Parameters<FacilityMap['closePose']>[1]) { if (this.id) this.map.shotPose = this.map.closePose(this.id, o); }

  // ---------------------------------------------------------------- clear: the skip and the carrying
  private async beginClear(fresh: boolean) {
    const id = this.id!;
    this.map.loosen(id, true);
    this.map.hold(id, true);
    this.binned = [...(room(id).work?.binned ?? [])];
    this.mode = 'clear';
    this.render();
    this.shot({ dist: 7.6, pitch: 0.98, look: new THREE.Vector3(0.1, 0, 0.55) });
    if (fresh) {
      // the skip comes down on its chains into the corridor in front, and lands with a bang
      this.skipFx = { y: 4.5, v: 0, up: false, t: 0 };
      sample('tc_chain', 0.5);
      this.say(LINE.skip);
    }
  }
  private endClear(keep: boolean) {
    const id = this.id;
    if (!id || (this.mode !== 'clear' && !this.drag)) return;
    if (this.drag) { this.dropPiece(this.drag.p, false); this.drag = null; }
    for (const f of this.falls) this.settle(f);
    this.falls = [];
    this.skipFx = null;
    this.map.shotPose = null;
    if (keep) { this.map.hold(id, false); this.map.loosen(id, false); }
  }
  private pieces(): DebrisPiece[] { return this.dio?.debris ?? []; }
  private skipObj(): THREE.Object3D | null { return this.dio?.skip ?? null; }
  /** room-local point under the pointer on a horizontal plane at height y */
  private local(x: number, y: number, h: number): THREE.Vector3 | null {
    const f = this.frame, ray = this.h.stage.rayAt(x, y);
    if (!f || !ray) return null;
    const r = ray.clone(); r.origin.sub(f.position);
    return r.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -h), new THREE.Vector3());
  }
  private overSkip(p: THREE.Vector3, pad = 0.28) { return Math.abs(p.x - SKIP_AT.x) < SKIP_W / 2 + pad && Math.abs(p.z - SKIP_AT.z) < SKIP_D / 2 + pad; }
  private grabPiece(x: number, y: number): boolean {
    const ray = this.h.stage.rayAt(x, y);
    if (!ray) return false;
    _r.ray.copy(ray);
    const live = this.pieces().filter((p) => !p.binned && !this.falls.some((f) => f.p === p));
    let best: DebrisPiece | null = null, bd = 1e9;
    for (const p of live) { const hit = _r.intersectObject(p.o, true)[0]; if (hit && hit.distance < bd) { bd = hit.distance; best = p; } }
    // a near miss still picks up the piece closest to the pointer on the floor
    if (!best) { const q = this.local(x, y, 0.1); if (q) for (const p of live) { const d = Math.hypot(p.o.position.x - q.x, p.o.position.z - q.z); if (d < p.r + 0.12 && d < bd) { bd = d; best = p; } } }
    if (!best) return false;
    this.drag = { p: best, target: best.o.position.clone(), prev: best.o.position.clone(), vel: new THREE.Vector3() };
    sample(best.heavy > 0.6 ? 'dmg_grab' : 'grab', 0.5, 0.9 + Math.random() * 0.2) || sfx('click', 0.4);
    this.dust(best.o.position, 4, 0x9a907a);
    return true;
  }
  private dragTo(x: number, y: number) {
    const d = this.drag;
    if (!d) return;
    const lift = 0.62;
    const q = this.local(x, y, lift);
    if (!q) return;
    // inside the room, or out over the skip; never through the standing walls
    const r = d.p.r * 0.6;
    if (!this.overSkip(q, 0.4)) { q.x = Math.max(-HALF + r, Math.min(HALF - r + 0.5, q.x)); q.z = Math.max(-HALF + r, Math.min(HALF - r + 0.9, q.z)); }
    q.x = Math.max(-HALF + r, q.x); q.z = Math.max(-HALF + r, q.z);
    d.target.set(q.x, lift, q.z);
  }
  private dropPiece(p: DebrisPiece, fromDrag = true) {
    const pos = p.o.position;
    const bin = this.overSkip(pos);
    const v = fromDrag && this.drag ? this.drag.vel.clone().multiplyScalar(0.5) : new THREE.Vector3();
    let rest: THREE.Vector3, slot = -1;
    if (bin) { slot = this.binned.length; rest = skipSlot(slot).add(SKIP_AT); v.x *= 0.2; v.z *= 0.2; }
    else rest = this.freeSpot(pos.x, pos.z, p.r);
    this.falls.push({ p, v, rest, bin, spin: new THREE.Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 6), hits: 0, slot });
    if (bin) { p.binned = true; this.binned.push(p.n); }
  }
  /** the nearest floor spot clear of the room's fixtures */
  private freeSpot(x: number, z: number, r: number): THREE.Vector3 {
    const g = this.dio?.grid;
    const clampP = (v: number) => Math.max(-HALF + r * 0.7, Math.min(HALF - r * 0.7, v));
    x = clampP(x); z = clampP(z);
    if (!g) return new THREE.Vector3(x, 0, z);
    const cellFree = (px: number, pz: number) => { const gx = Math.floor((px + HALF) / CELL), gz = Math.floor((pz + HALF) / CELL); return gx >= 0 && gz >= 0 && gx < GN && gz < GN && !g[gz * GN + gx]; };
    if (cellFree(x, z)) return new THREE.Vector3(x, 0, z);
    for (let rad = CELL; rad < 2.5; rad += CELL) for (let a = 0; a < 16; a++) {
      const px = clampP(x + Math.cos(a / 16 * Math.PI * 2) * rad), pz = clampP(z + Math.sin(a / 16 * Math.PI * 2) * rad);
      if (cellFree(px, pz)) return new THREE.Vector3(px, 0, pz);
    }
    return new THREE.Vector3(x, 0, z);
  }
  private settle(f: Fall) { f.p.o.position.copy(f.rest); f.p.o.rotation.x = 0; f.p.o.rotation.z = 0; }
  private stepClear(dt: number) {
    const d = this.drag;
    if (d) {
      const o = d.p.o;
      d.prev.copy(o.position);
      const k = 1 - Math.exp(-dt * (16 - d.p.heavy * 7));
      o.position.lerp(d.target, k);
      d.vel.subVectors(o.position, d.prev).divideScalar(Math.max(dt, 1e-3));
      // it swings with the carrying
      o.rotation.z = THREE.MathUtils.lerp(o.rotation.z, -d.vel.x * 0.08, 1 - Math.exp(-dt * 8));
      o.rotation.x = THREE.MathUtils.lerp(o.rotation.x, d.vel.z * 0.08, 1 - Math.exp(-dt * 8));
      if (Math.random() < dt * 6) this.dust(o.position.clone().setY(o.position.y - 0.1), 1, 0x8a8070);
    }
    for (let i = this.falls.length - 1; i >= 0; i--) {
      const f = this.falls[i], o = f.p.o;
      f.v.y -= 9.8 * dt;
      o.position.addScaledVector(f.v, dt);
      // drift toward its rest spot as it falls
      o.position.x += (f.rest.x - o.position.x) * Math.min(1, dt * 6);
      o.position.z += (f.rest.z - o.position.z) * Math.min(1, dt * 6);
      o.rotation.x += f.spin.x * dt; o.rotation.z += f.spin.z * dt; o.rotation.y += f.spin.y * dt;
      if (o.position.y <= f.rest.y) {
        o.position.y = f.rest.y;
        if (f.hits === 0) {
          const vol = 0.35 + f.p.heavy * 0.45;
          const snd = PIECE_SOUND[f.p.kind];
          if (f.bin) sample('dmg_debris_metal', vol * 0.8, 0.85 + Math.random() * 0.2);
          sample(snd[Math.random() < 0.5 ? 0 : 1], vol, 0.85 + Math.random() * 0.3);
          this.map.shake = Math.max(this.map.shake, 0.18 + f.p.heavy * 0.3);
          this.dust(o.position, 6 + Math.round(f.p.heavy * 6), f.bin ? 0xa09880 : 0x9a907a);
        }
        f.hits++;
        if (f.hits < 3 && Math.abs(f.v.y) > 0.6) { f.v.y = -f.v.y * 0.28; f.v.x *= 0.5; f.v.z *= 0.5; f.spin.multiplyScalar(0.4); }
        else {
          this.settle(f);
          if (f.bin) o.rotation.y = f.slot * 1.3;
          this.falls.splice(i, 1);
          if (f.bin) this.binnedOne(f.p.n);
        }
      }
    }
    // the skip's chains: down at the start, up and away at the end
    const sf = this.skipFx, skip = this.skipObj();
    if (sf && skip) {
      sf.t += dt;
      if (!sf.up) {
        sf.v -= 9.8 * dt * 0.35; sf.y = Math.max(0, sf.y + sf.v * dt);
        if (sf.y <= 0 && sf.v < 0) {
          if (sf.v < -0.8) { sample('dmg_debris_metal', 0.8, 0.7); sample('craft_thud', 0.7); this.map.shake = 0.6; this.dust(SKIP_AT.clone().setY(0), 14, 0xa09a88); sf.v = -sf.v * 0.18; }
          else { sf.v = 0; sf.y = 0; if (sf.t > 1) { this.skipFx = null; } }
        }
      } else { sf.v += dt * 1.6; sf.y += sf.v * dt; }
      skip.position.y = SKIP_AT.y + (sf ? sf.y : 0);
      this.chainsTo(skip, sf.y > 0.02 || sf.up);
      if (sf.up && sf.y > 5) { this.chainsTo(skip, false); this.skipFx = null; this.cleared(); }
    }
  }
  private chainsTo(skip: THREE.Object3D, on: boolean) {
    if (!this.fxHost) return;
    if (!this.chains.length) for (let i = 0; i < 4; i++) { const c = new Chain(this.h.mats, 120); this.chains.push(c); }
    this.chains.forEach((c, i) => {
      if (!on) { c.mesh.removeFromParent(); return; }
      if (!c.mesh.parent) this.fxHost!.add(c.mesh);
      const sx = i % 2 ? 1 : -1, sz = i < 2 ? 1 : -1;
      const a = new THREE.Vector3(skip.position.x + sx * (SKIP_W / 2 - 0.05), skip.position.y + 0.38, skip.position.z + sz * (SKIP_D / 2 + 0.06));
      const b = new THREE.Vector3(skip.position.x, skip.position.y + 2.6, skip.position.z);
      c.update(a, b, 0.01);
    });
  }
  private binnedOne(n: number) {
    const id = this.id!;
    const done = binDebris(id, n);
    if (!done) return;
    // the last piece in: a beat, then the skip goes up on its chains
    this.mode = 'cine'; this.render();
    setTimeout(() => {
      const skip = this.skipObj();
      // what is in the skip goes up with it
      if (skip) for (const p of this.pieces()) if (p.binned) skip.attach(p.o);
      sample('tc_chain', 0.6); this.skipFx = { y: 0, v: 0, up: true, t: 0 };
    }, 700);
  }
  private cleared() {
    const id = this.id!;
    this.map.hold(id, false);
    this.map.loosen(id, false);
    this.viewShot();
    this.mode = 'view';
    sample('power_off', 0.2);
    this.say(LINE.cleared);
    this.render();
  }

  // ---------------------------------------------------------------- repair and clean: the crew's cinematics
  private crewAt(): Crew { this.crew?.dispose(); this.crew = new Crew(this.frame!); return this.crew; }
  /** a free spot on the floor near a point (the crew never stands in a bunk) */
  private spot(x: number, z: number) { return this.freeSpot(x, z, 0.2); }
  private async repairCine() {
    const id = this.id!;
    this.map.hold(id, true);
    this.beginCine();
    const crew = this.crewAt();
    const door = new THREE.Vector3(1.25, 0, -HALF + 0.35);
    const a = crew.hire(['hoodie', 'jeans', 'boots_work', 'gloves_work', 'hard_hat'], 'hammer', door.clone(), 41);
    const b = crew.hire(['janitor_uniform', 'boots_work', 'gloves_work'], 'welding_torch', door.clone().add(new THREE.Vector3(0.2, 0, 0.3)), 77);
    const wallAt = this.spot(-0.5, -HALF + 0.45), lightAt = this.spot(0.1, -0.5);
    this.shot({ dist: 6.4, pitch: 0.7, yaw: -0.15, look: new THREE.Vector3(0, 1.0, -0.9) });
    this.letterbox(true);
    sample('door_open', 0.5);
    await Promise.race([Promise.all([crew.walk(a, wallAt), crew.walk(b, lightAt)]), this.wait(2.2)]);
    crew.arrive();
    crew.work(a, 'hammer', 0.55, new THREE.Vector3(-0.5, 0, -HALF));
    crew.work(b, 'craft', 1.2, new THREE.Vector3(0, 0, -0.6));
    // the hammer lands, the torch spits at the fitting, the lights stutter
    const hit = new THREE.Vector3(-0.5, 1.5, -HALF + 0.05), spark = new THREE.Vector3(0, WALL_H - 0.6, -0.65);
    for (let i = 0; i < 6 && !this.skipCine; i++) {
      await this.wait(0.42);
      sample('hammer', 0.55, 0.9 + Math.random() * 0.2); this.map.shake = 0.32; this.dust(hit, 3, 0xd8d0c0);
      if (i % 2) { sample(i === 3 ? 'weld_crackle' : 'dmg_spark', 0.5); this.arcs.strike(spark, spark.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.5, -0.3, (Math.random() - 0.5) * 0.3)), 0.16); this.sparks(spark); this.map.lightMul = 0.3 + Math.random() * 0.9; }
      else this.map.lightMul = 1;
    }
    // the lights go, a breath of dark, then the room is powered
    this.map.lightMul = 0.08; sample('flicker_buzz', 0.4);
    await this.wait(0.35);
    this.map.hold(id, false);
    this.reattach();
    sample('power_on', 0.7); sample('fluoro_tick', 0.5);
    for (const k of [0.4, 1.3, 0.2, 1.1, 1]) { this.map.lightMul = k; await this.wait(0.09); }
    this.shot({ dist: 7.4, pitch: 0.82, look: new THREE.Vector3(0, 0.8, -0.4) });
    await Promise.race([Promise.all([crew.walk(a, door), crew.walk(b, door)]), this.wait(1.6)]);
    this.finishCine(LINE.repaired);
  }
  private async cleanCine() {
    const id = this.id!;
    this.map.hold(id, true);
    this.beginCine();
    const crew = this.crewAt();
    const door = new THREE.Vector3(1.25, 0, -HALF + 0.35);
    const a = crew.hire(['janitor_uniform', 'boots_work', 'gloves_rubber'], 'mop', door.clone(), 13);
    const b = crew.hire(['hoodie', 'jeans', 'sneakers', 'gloves_rubber'], 'broom', door.clone().add(new THREE.Vector3(0.25, 0, 0.3)), 59);
    this.shot({ dist: 7.0, pitch: 0.95, yaw: 0.1, look: new THREE.Vector3(0, 0.3, 0) });
    this.letterbox(true);
    sample('door_open', 0.5);
    const grime = this.dio?.grime ?? [];
    const path: [THREE.Vector3, THREE.Vector3][] = [
      [this.spot(-1.0, -0.6), this.spot(1.0, 0.8)],
      [this.spot(-1.2, 1.0), this.spot(0.6, -0.9)],
    ];
    for (let leg = 0; leg < 3 && !this.skipCine; leg++) {
      const pa = leg % 2 ? path[0][1] : path[0][0], pb = leg % 2 ? path[1][1] : path[1][0];
      await Promise.race([Promise.all([crew.walk(a, pa, 0.9), crew.walk(b, pb, 0.9)]), this.wait(2.0)]);
      crew.arrive();
      crew.work(a, 'dig', 0.9, pa.clone().add(new THREE.Vector3(0.5, 0, 0.3)));
      crew.work(b, 'dig', 0.7, pb.clone().add(new THREE.Vector3(-0.3, 0, 0.5)));
      sample(leg === 1 ? 'pour' : 'carpet_rustle', 0.45); sample('drip', 0.3);
      // the grime nearest them goes
      for (const g of grime) {
        if (g.name === 'grime') { if (leg >= 1) g.visible = false; continue; }
        const p = g.position;
        if (p.distanceTo(pa) < 1.6 || p.distanceTo(pb) < 1.6 || leg === 2) this.fade(g as THREE.Mesh);
      }
      await this.wait(1.1);
    }
    this.map.hold(id, false);
    this.reattach();
    sample('power_on', 0.4);
    this.map.lightMul = 0.85;
    this.shot({ dist: 8.2, pitch: 0.86, yaw: 0.05, look: new THREE.Vector3(0, 0.7, -0.3) });
    await Promise.race([Promise.all([crew.walk(a, door), crew.walk(b, door)]), this.wait(1.4)]);
    for (let i = 0; i < 20; i++) { this.map.lightMul = 0.85 + i * 0.0075; await this.wait(0.03); }
    this.finishCine(RESTORED[id] ?? LINE.cleared);
  }
  /** an annex plot bought: the crew raises the wing (the walls come up out of the slab in dust and sparks) */
  private async wing() {
    const id = this.id!;
    const why = buildPlot(id);
    if (why === 'money') { sfx('error', 0.6); this.say(LINE.money); return; }
    if (why === 'gate') { sfx('error', 0.6); this.say(LINE.plotGate); return; }
    if (why) return;
    sample('kiosk_accept', 0.5);
    this.map.hold(id, true);
    this.beginCine();
    this.letterbox(true);
    const crew = this.crewAt();
    const a = crew.hire(['hoodie', 'jeans', 'boots_work', 'gloves_work', 'hard_hat'], 'hammer', new THREE.Vector3(1.6, 0, 1.8), 23);
    const b = crew.hire(['janitor_uniform', 'boots_work', 'gloves_work', 'hard_hat'], 'welding_torch', new THREE.Vector3(-1.6, 0, 1.8), 61);
    this.shot({ dist: 7.6, pitch: 0.62, yaw: 0.25, look: new THREE.Vector3(0, 0.6, -0.2) });
    await Promise.race([Promise.all([crew.walk(a, new THREE.Vector3(1.0, 0, -1.2)), crew.walk(b, new THREE.Vector3(-1.4, 0, -0.6))]), this.wait(2)]);
    crew.arrive();
    crew.work(a, 'hammer', 0.5, new THREE.Vector3(1.0, 0, -HALF)); crew.work(b, 'craft', 1.0, new THREE.Vector3(-HALF, 0, -0.6));
    // the slab swaps for the new room, which rises out of it
    this.map.hold(id, false);
    this.reattach();
    if (this.crew && this.frame) this.frame.add(this.crew.group);
    const g = this.dio?.group;
    sample('slam_hydraulic', 0.6); sample('dmg_crumble', 0.6);
    for (let i = 0; i <= 24 && g; i++) {
      const k = i / 24;
      g.scale.y = 0.04 + 0.96 * (1 - (1 - k) ** 3);
      if (i % 4 === 0) { this.dust(new THREE.Vector3((Math.random() - 0.5) * 4, 0.1, -HALF + 0.2), 4, 0xa8a090); this.dust(new THREE.Vector3(-HALF + 0.2, 0.1, (Math.random() - 0.5) * 4), 4, 0xa8a090); this.map.shake = 0.3; sample(i % 8 ? 'hammer' : 'weld_crackle', 0.4); }
      if (i % 6 === 3) this.sparks(new THREE.Vector3(-HALF + 0.3, 1.2 * k, -0.6));
      await this.wait(0.08);
    }
    if (g) g.scale.y = 1;
    sample('power_on', 0.6);
    await Promise.race([Promise.all([crew.walk(a, new THREE.Vector3(1.25, 0, -HALF + 0.35)), crew.walk(b, new THREE.Vector3(1.25, 0, -HALF + 0.35))]), this.wait(1.6)]);
    this.finishCine(LINE.wing);
  }
  private fade(m: THREE.Mesh) {
    const mat = m.material as THREE.Material & { opacity: number };
    if (!mat || mat.opacity === undefined) { m.visible = false; return; }
    const o0 = mat.opacity, t0 = performance.now();
    const step = () => { const k = Math.min(1, (performance.now() - t0) / 900); mat.opacity = o0 * (1 - k); if (k < 1) requestAnimationFrame(step); else m.visible = false; };
    step();
  }
  /** the diorama was rebuilt under the effects: hang them on the new one */
  private reattach() { this.detachFx(); this.attachFx(); if (this.crew && this.frame) this.frame.add(this.crew.group); }
  private finishCine(line: string) {
    this.crew?.dispose(); this.crew = null;
    this.map.lightMul = 1;
    this.letterbox(false);
    this.viewShot();
    this.mode = 'view';
    this.skipCine = false;
    this.say(line);
    this.render();
  }

  // ---------------------------------------------------------------- the little effects
  private dust(p: THREE.Vector3, n: number, color: number) {
    for (let i = 0; i < n; i++) this.puffs.emit(p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.03, (Math.random() - 0.5) * 0.3)), new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.15 + Math.random() * 0.3, (Math.random() - 0.5) * 0.6), { life: 0.9 + Math.random() * 0.8, s0: 0.04, s1: 0.22, color, rise: 0.05 });
  }
  private sparks(p: THREE.Vector3) {
    for (let i = 0; i < 8; i++) this.sparkP.emit(p, new THREE.Vector3((Math.random() - 0.5) * 2.4, -0.5 - Math.random() * 1.5, (Math.random() - 0.5) * 2.4), { life: 0.35, s0: 0.014, s1: 0.005, color: 0xffd890, rise: -2 });
  }

  // ================================================================== build mode
  private beginBuild() {
    const id = this.id!;
    this.mode = 'build';
    this.map.hold(id, true);
    this.map.camLight.intensity = 0.9;
    // the room framed whole in the upper part of the screen, the strip of stores floating under it
    this.shot({ dist: 11.2, pitch: 0.98, look: new THREE.Vector3(0.1, -0.6, 0.85) });
    this.showGrid(true);
    this.fill();
    this.render();
    sample('paper', 0.4) || sfx('open', 0.5);
    if (!this.said.has('build')) { this.said.add('build'); this.say(LINE.build); }
  }
  private endBuild() {
    if (this.mode !== 'build' && !this.cat.length) return;
    this.cancelHeld();
    this.clearSel();
    for (const c of this.cat) { c.holder.removeFromParent(); c.tag.remove(); }
    this.cat = []; this.hot = null;
    this.map.camLight.intensity = 0;
    this.showGrid(false);
    if (this.id) this.map.hold(this.id, false);
  }
  private renderTabs() {
    this.tabs.innerHTML = '';
    const tab = (kind: IconKind, name: string, t: Tab) => {
      const b = iconKey(kind, name, () => { if (this.tab === t) return; this.tab = t; this.cancelHeld(); this.fill(); this.renderTabs(); }, { model: 40, nameHover: true, cls: 'fw-ik' + (this.tab === t ? ' on' : '') });
      this.tabs.append(b);
    };
    tab('crate', 'Furniture', 'furniture'); tab('sprout', 'Decor', 'decor'); tab('roller', 'Finishes', 'finish'); tab('cage', 'Inhabitants', 'zoo'); tab('vitrine', 'Artifacts', 'museum');
    const sn = iconKey('pin', this.snap ? 'Grid' : 'Free', () => this.toggleSnap(), { model: 40, nameHover: true, cls: 'fw-ik fw-snap' + (this.snap ? ' on' : '') });
    this.tabs.append(sn);
    this.tabs.append(iconKey('door', 'Done', () => this.back(), { model: 40, nameHover: true, cls: 'fw-ik fw-done' }));
  }
  private toggleSnap() {
    this.snap = !this.snap;
    sample('switch', 0.5) || sfx('toggle', 0.5);
    this.grid && (this.grid.visible = this.snap);
    if (this.held && this.snap) this.held.rot = Math.round(this.held.rot / (Math.PI / 2)) * (Math.PI / 2);
    this.renderTabs();
    this.aim(this.ptr.x, this.ptr.y);
  }
  /** what the operator has to show: the inhabitants caught, tamed or sampled; the finds brought back */
  private zooHas(key: string): boolean {
    try { const f = file(); return tamedKeys().includes(key) || (f.sampled[key] ?? 0) > 0 || (f.research[key] ?? 0) >= 100; } catch { return false; }
  }
  private finds(): string[] {
    let found: Record<string, number> = {};
    try { found = file().found ?? {}; } catch { /* none */ }
    const keys = Object.keys(found).filter((k) => { try { return hasItemDef(k) && !!itemModelOk(k); } catch { return false; } });
    const val = (k: string) => { try { return (itemDef(k) as { value?: number }).value ?? 0; } catch { return 0; } };
    return keys.sort((a, b) => val(b) - val(a)).slice(0, 14);
  }
  /** the strip of floating models for the tab */
  private fill() {
    for (const c of this.cat) { c.holder.removeFromParent(); c.tag.remove(); }
    this.cat = []; this.hot = null; this.scroll = this.scrollGoal = 0;
    const rig = this.map.camRig;
    let list: { key: string; furn?: FurnSpec; fin?: FinishSpec; locked?: boolean }[];
    if (this.tab === 'finish') list = FINISHES.map((f) => ({ key: f.key, fin: f }));
    else if (this.tab === 'zoo') list = ZOO.map((z) => ({ key: 'encl:' + z.key, furn: furnSpec('encl:' + z.key), locked: !this.zooHas(z.key) })).sort((a, b) => Number(a.locked) - Number(b.locked));
    else if (this.tab === 'museum') {
      const jars = ZOO.filter((z) => this.zooHas(z.key)).map((z) => ({ key: 'jar:' + z.key, furn: furnSpec('jar:' + z.key) }));
      const cases = this.finds().map((k) => ({ key: 'case:' + k, furn: furnSpec('case:' + k) }));
      list = [...cases, ...jars];
      if (!list.length) list = ['pipe', 'crowbar', 'flashlight'].map((k) => ({ key: 'case:' + k, furn: furnSpec('case:' + k), locked: true }));
    } else list = FURN.filter((f) => f.cat === (this.tab === 'decor' ? 'decor' : 'furniture')).map((f) => ({ key: f.kind, furn: f }));
    // a higher tier of the stores waits for the Institute's prestige
    const pres = prestige();
    for (const it of list) if (it.furn?.prestige && pres < it.furn.prestige && !it.locked) { it.locked = true; (it as { tier?: number }).tier = it.furn.prestige - pres; }
    list.forEach((it, i) => {
      const holder = new THREE.Group(), spin = new THREE.Group();
      holder.add(spin);
      const model = it.furn ? modelOf(it.furn.kind, this.h.mats) : swatch(it.fin!, this.h.mats);
      spin.add(model);
      const c: CatItem = { ...it, holder, spin, fit: 1, x: i * 0.3, hot: 0, tag: div('fw-tag'), ready: false, model };
      const refit = () => {
        model.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          m.castShadow = false; m.receiveShadow = false;
          // what is not in hand yet stands as a dark cast of itself
          if (c.locked && !m.userData.cast) { m.userData.cast = true; m.material = LOCKED_MAT; }
        });
        // measured in its own frame (off the strip, unmoved), then centred on its spin
        const par = model.parent;
        par?.remove(model);
        model.position.set(0, 0, 0); model.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(model);
        par?.add(model);
        if (box.isEmpty()) return;
        const size = box.getSize(new THREE.Vector3()), cen = box.getCenter(new THREE.Vector3());
        c.fit = 0.2 / Math.max(size.x, size.y * 0.9, size.z, 0.05);
        model.position.set(-cen.x, -cen.y, -cen.z);
        c.ready = true;
      };
      refit();
      model.addEventListener('loaded' as never, () => refit());
      setTimeout(refit, 600); setTimeout(refit, 1800); setTimeout(refit, 4000);
      rig.add(holder);
      this.tagOf(c);
      this.tags.append(c.tag);
      this.cat.push(c);
    });
  }
  private tagOf(c: CatItem) {
    c.tag.innerHTML = '';
    c.tag.classList.toggle('locked', !!c.locked);
    if (c.locked) {
      const g = div('fw-gate'); const ic = mxIcon(c.tier ? 'laurel' : 'key', 16); if (ic) g.append(ic);
      if (c.tier) { const n = document.createElement('b'); n.textContent = String(c.tier); g.append(n); }
      c.tag.append(g); c.tag.title = c.furn?.name ?? ''; return;
    }
    if (c.furn) { c.tag.append(costEl(c.furn.cost, true), statsEl(c.furn.stats, true)); c.tag.title = c.furn.name; }
    else if (c.fin) { c.tag.append(costEl(c.fin.cost, true)); c.tag.title = c.fin.name; c.tag.classList.toggle('on', !!this.id && room(this.id).finish?.[c.fin.part] === c.fin.key); }
  }
  /** scroll the strip to a store (the keyboard, a test) */
  focusCat(key: string) {
    const i = this.cat.findIndex((c) => c.key === key);
    if (i < 0) return;
    const cam = this.map.cam, hh = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * 2.1, hw = hh * cam.aspect;
    const step = Math.min(0.31, (hw * 2 - 0.2) / 7.5);
    this.scrollGoal = this.scroll = Math.max(0, i * step - hw);
  }
  private layoutCat(dt: number) {
    const cam = this.map.cam, D = 2.1;
    const hh = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * D, hw = hh * cam.aspect;
    const step = Math.min(0.31, (hw * 2 - 0.2) / 7.5);
    const maxScroll = Math.max(0, (this.cat.length - 1) * step - (hw * 2 - 0.5));
    this.scrollGoal = Math.max(0, Math.min(maxScroll, this.scrollGoal));
    this.scroll += (this.scrollGoal - this.scroll) * Math.min(1, dt * 8);
    const y0 = -hh + 0.24;
    this.cat.forEach((c, i) => {
      c.hot += ((this.hot === c ? 1 : 0) - c.hot) * Math.min(1, dt * 10);
      const x = -hw + 0.26 + i * step - this.scroll;
      const vis = x > -hw + 0.05 && x < hw - 0.05;
      c.holder.visible = vis && c.ready;
      const bob = Math.sin(this.t * 1.6 + i * 0.9) * 0.008;
      const on = this.held?.kind === c.key;
      c.holder.position.set(x, y0 + bob + c.hot * 0.03 + (on ? 0.02 : 0), -D);
      c.holder.scale.setScalar(c.fit * (1 + c.hot * 0.18));
      c.spin.rotation.set(0.42, this.t * 0.45 + i * 0.7 + c.hot * 0.6, 0);
      // an exhibit lives in the strip too: its inhabitant paces, its find turns
      if (vis) c.model.traverse((o) => { const tk = o.userData.tick as ((t: number, dt: number) => void) | undefined; if (tk) tk(this.t, dt); });
      const p = c.holder.getWorldPosition(_v);
      const s = this.h.stage.project(p);
      if (s && vis) { c.tag.style.transform = `translate(${Math.round(s.x)}px, ${Math.round(s.y + 34)}px) translateX(-50%)`; c.tag.style.opacity = String(0.82 + c.hot * 0.18); c.tag.hidden = false; }
      else c.tag.hidden = true;
      c.tag.classList.toggle('hot', this.hot === c);
    });
  }
  private catAt(x: number, y: number): CatItem | null {
    const ray = this.h.stage.rayAt(x, y);
    if (!ray) return null;
    _r.ray.copy(ray);
    let best: CatItem | null = null, bd = 1e9;
    for (const c of this.cat) {
      if (!c.holder.visible) continue;
      const hit = _r.intersectObject(c.holder, true)[0];
      if (hit && hit.distance < bd) { bd = hit.distance; best = c; }
    }
    if (!best) for (const c of this.cat) { if (!c.holder.visible) continue; const s = this.h.stage.project(c.holder.getWorldPosition(_v)); if (s && Math.hypot(s.x - x, s.y - y) < 44) { best = c; break; } }
    return best;
  }
  private showGrid(on: boolean) {
    const f = this.frame;
    if (!on) { this.grid?.removeFromParent(); this.foot?.removeFromParent(); return; }
    if (!this.grid) {
      const pts: number[] = [];
      for (let i = 0; i <= GN; i++) { const v = -HALF + i * CELL; pts.push(v, 0, -HALF, v, 0, HALF, -HALF, 0, v, HALF, 0, v); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      this.grid = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xe8f0b0, transparent: true, opacity: 0.16, depthWrite: false, toneMapped: false }));
      this.grid.position.y = 0.014; this.grid.renderOrder = 3; this.grid.userData.noGlow = true;
      this.foot = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: GHOST_OK, transparent: true, opacity: 0.22, depthWrite: false }));
      this.foot.rotation.x = -Math.PI / 2; this.foot.renderOrder = 3; this.foot.userData.noGlow = true;
    }
    this.grid.visible = this.snap;
    f?.add(this.grid);
  }

  // ---------------------------------------------------------------- holding pieces (new from the strip, one picked up, a group)
  private ghostOf(kind: string): THREE.Object3D {
    const model = modelOf(kind, this.h.mats);
    const tint = () => model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (!m.userData.ghost) { m.userData.ghost = true; m.material = new THREE.MeshBasicMaterial({ color: GHOST_OK, transparent: true, opacity: 0.38, depthWrite: false }); }
      m.castShadow = false; m.renderOrder = 4; m.userData.noGlow = true;
    });
    tint();
    model.addEventListener('loaded' as never, () => tint());
    setTimeout(tint, 700); setTimeout(tint, 1900); setTimeout(tint, 4000);
    return model;
  }
  private pick(kind: string, x: number, y: number, uid?: string, rot = 0) {
    this.cancelHeld();
    const ghost = new THREE.Group();
    const spec = furnSpec(kind);
    ghost.add(this.ghostOf(kind));
    this.frame?.add(ghost);
    if (this.foot) this.frame?.add(this.foot);
    const riders: Rider[] = [];
    const id = this.id!;
    if (uid && this.sel.has(uid) && this.sel.size > 1) {
      // a group move: everything selected rides along at its offset from the piece in hand
      const a = room(id).furniture.find((q) => q.uid === uid)!;
      for (const u of this.sel) {
        if (u === uid) continue;
        const f = room(id).furniture.find((q) => q.uid === u);
        if (!f) continue;
        const g = new THREE.Group(); g.add(this.ghostOf(f.kind)); this.frame?.add(g);
        riders.push({ uid: u, kind: f.kind, dx: f.x - a.x, dz: f.z - a.z, rot: f.rot, y: f.y, ghost: g });
        const o = this.furnObj(u); if (o) o.visible = false;
      }
    }
    this.held = { kind, uid, rot: spec?.layer === 'wall' ? 0 : rot, ghost, x: 0, z: 0, y: 0, ok: false, on: false, fromCat: !uid, press: this.ptr.n, riders };
    if (uid) { const o = this.furnObj(uid); if (o) o.visible = false; }
    this.clearSelMarks();
    sample('dmg_grab', 0.4) || sfx('click', 0.4);
    this.aim(x, y);
    this.renderHeldKeys();
  }
  private furnObj(uid: string): THREE.Object3D | null {
    let found: THREE.Object3D | null = null;
    this.dio?.group.children.forEach((o) => { if (o.userData.furniture === uid) found = o; });
    return found;
  }
  private cancelHeld() {
    const h = this.held;
    if (!h) return;
    h.ghost.removeFromParent();
    for (const r of h.riders) { r.ghost.removeFromParent(); const o = this.furnObj(r.uid); if (o) o.visible = true; }
    this.foot?.removeFromParent();
    if (h.uid) { const o = this.furnObj(h.uid); if (o) o.visible = true; }
    this.held = null;
    this.heldKeys.innerHTML = '';
    this.markSel();
  }
  private renderHeldKeys() {
    this.heldKeys.innerHTML = '';
    const h = this.held;
    if (!h) return;
    const spec = furnSpec(h.kind);
    if (spec?.layer !== 'wall' && !h.riders.length) this.heldKeys.append(iconKey('compass', 'Turn', () => this.turn(1), { model: 34, nameHover: true, cls: 'fw-ik' }));
    if (h.uid) this.heldKeys.append(iconKey('skip', 'Remove', () => this.removeHeld(), { model: 34, nameHover: true, cls: 'fw-ik' }));
  }
  /** a turn: a quarter on the grid, fifteen degrees free (five with Shift) */
  private turn(d: number, fine = false) {
    const h = this.held;
    if (!h || furnSpec(h.kind)?.layer === 'wall' || h.riders.length) return;
    const step = this.snap ? Math.PI / 2 : fine ? Math.PI / 36 : Math.PI / 12;
    h.rot = ((h.rot + d * step) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    sample('tc_ratchet', 0.4) || sfx('tick', 0.4);
    this.aim(this.ptr.x, this.ptr.y);
  }
  /** a piece's footprint turned to any angle, as the box it fills */
  private extent(kind: string, rot: number): [number, number] {
    const sp = furnSpec(kind)!;
    const c = Math.abs(Math.cos(rot)), s = Math.abs(Math.sin(rot));
    return [sp.w * c + sp.d * s, sp.w * s + sp.d * c];
  }
  /** whether a piece fits here: inside the room, off the fixtures, clear of the other pieces of its layer */
  private fits(kind: string, x: number, z: number, rot: number, skip: Set<string>, y = 0): boolean {
    const spec = furnSpec(kind), d = this.dio, id = this.id;
    if (!spec || !d || !id) return false;
    if (spec.layer === 'wall') {
      const onN = Math.abs(z + HALF) < 0.01;
      const a = onN ? x - spec.w / 2 : z - spec.w / 2, b = a + spec.w;
      if (a < -HALF - 1e-3 || b > HALF + 1e-3) return false;
      for (let k = Math.floor((a + HALF) / CELL + 0.05); k < Math.ceil((b + HALF) / CELL - 0.05); k++) if (d.wall[(onN ? 0 : GN) + k]) return false;
      for (const f of room(id).furniture) {
        if (skip.has(f.uid)) continue;
        const s = furnSpec(f.kind);
        if (s?.layer !== 'wall') continue;
        const fN = Math.abs(f.z + HALF) < 0.01;
        if (fN !== onN) continue;
        const fa = (fN ? f.x : f.z) - s.w / 2, fb = fa + s.w;
        if (fa < b - 1e-3 && a < fb - 1e-3) return false;
      }
      return true;
    }
    // a small thing up on a surface only minds the other small things there
    if (y > 0.05) {
      for (const f of room(id).furniture) { if (skip.has(f.uid) || !f.y) continue; if (Math.hypot(f.x - x, f.z - z) < 0.2 && Math.abs(f.y - y) < 0.2) return false; }
      return Math.abs(x) < HALF && Math.abs(z) < HALF;
    }
    const [w, dd] = this.extent(kind, rot);
    const x0 = x - w / 2, x1 = x + w / 2, z0 = z - dd / 2, z1 = z + dd / 2;
    if (x0 < -HALF - 1e-3 || x1 > HALF + 1e-3 || z0 < -HALF - 1e-3 || z1 > HALF + 1e-3) return false;
    const inset = 0.03;
    if (spec.layer === 'floor') for (let gz = Math.floor((z0 + inset + HALF) / CELL); gz < Math.ceil((z1 - inset + HALF) / CELL); gz++) for (let gx = Math.floor((x0 + inset + HALF) / CELL); gx < Math.ceil((x1 - inset + HALF) / CELL); gx++) if (d.grid[gz * GN + gx]) return false;
    for (const f of room(id).furniture) {
      if (skip.has(f.uid) || f.y) continue;
      const s = furnSpec(f.kind);
      if (!s || s.layer === 'wall' || (s.layer === 'rug') !== (spec.layer === 'rug')) continue;
      const [fw, fd] = this.extent(f.kind, f.rot);
      if (f.x - fw / 2 < x1 - inset && x0 < f.x + fw / 2 - inset && f.z - fd / 2 < z1 - inset && z0 < f.z + fd / 2 - inset) return false;
    }
    return true;
  }
  /** for a small thing: the surface under the pointer (a desk, a shelf, a counter, a bunk), if there is one */
  private surfaceAt(px: number, py: number): THREE.Vector3 | null {
    const ray = this.h.stage.rayAt(px, py), d = this.dio, f = this.frame;
    if (!ray || !d || !f) return null;
    _r.ray.copy(ray);
    const hide = this.held ? [this.held.ghost, ...this.held.riders.map((r) => r.ghost)] : [];
    for (const g of hide) g.visible = false;
    const hits = _r.intersectObject(d.group, true);
    for (const g of hide) g.visible = true;
    for (const hh of hits) {
      if (hh.object.userData.noGlow || !hh.face) continue;
      const n = hh.face.normal.clone().transformDirection(hh.object.matrixWorld);
      const p = hh.point.clone().sub(f.position);
      if (n.y > 0.7 && p.y > 0.25 && p.y < 2.0 && Math.abs(p.x) < HALF - 0.05 && Math.abs(p.z) < HALF - 0.05) return p;
      if (n.y > 0.7 && p.y < 0.05) return null;
      if (n.y <= 0.7) continue;
    }
    return null;
  }
  private aim(px: number, py: number) {
    const h = this.held, f = this.frame;
    if (!h || !f) return;
    const spec = furnSpec(h.kind)!;
    const q = this.local(px, py, 0);
    const inside = !!q && Math.abs(q.x) < HALF + 0.3 && Math.abs(q.z) < HALF + 0.3;
    h.on = inside && py < innerHeight * 0.76;
    h.ghost.visible = h.on;
    for (const r of h.riders) r.ghost.visible = h.on;
    if (!h.on || !q) { if (this.foot) this.foot.visible = false; return; }
    const snapTo = (v: number, size: number) => { const n = Math.max(1, Math.round(size / CELL)); const i0 = Math.round((v + HALF) / CELL - n / 2); return Math.max(0, Math.min(GN - n, i0)) * CELL + (n * CELL) / 2 - HALF; };
    const fine = (v: number, size: number) => Math.max(-HALF + size / 2, Math.min(HALF - size / 2, Math.round(v / 0.05) * 0.05));
    h.y = 0;
    if (spec.layer === 'wall') {
      const onN = q.z + HALF <= q.x + HALF;
      const along = onN ? q.x : q.z;
      const v = this.snap ? snapTo(along, spec.w) : fine(along, spec.w);
      if (onN) { h.x = v; h.z = -HALF; h.rot = 0; } else { h.x = -HALF; h.z = v; h.rot = Math.PI / 2; }
    } else {
      const sur = spec.small ? this.surfaceAt(px, py) : null;
      if (sur) { h.x = Math.round(sur.x / 0.05) * 0.05; h.z = Math.round(sur.z / 0.05) * 0.05; h.y = sur.y; }
      else {
        const [w, d] = this.extent(h.kind, h.rot);
        if (this.snap) { h.x = snapTo(q.x, w); h.z = snapTo(q.z, d); } else { h.x = fine(q.x, w); h.z = fine(q.z, d); }
      }
    }
    const skip = new Set<string>([...(h.uid ? [h.uid] : []), ...h.riders.map((r) => r.uid)]);
    h.ok = this.fits(h.kind, h.x, h.z, h.rot, skip, h.y) && (!!h.uid || canPay(spec.cost));
    for (const r of h.riders) {
      const ok = this.fits(r.kind, h.x + r.dx, h.z + r.dz, r.rot, skip, r.y ?? 0);
      r.ghost.position.set(h.x + r.dx, r.y ?? 0, h.z + r.dz); r.ghost.rotation.y = r.rot;
      if (!ok) h.ok = false;
    }
    h.ghost.position.set(h.x, h.y, h.z);
    h.ghost.rotation.y = h.rot;
    const col = h.ok ? GHOST_OK : GHOST_NO;
    for (const g of [h.ghost, ...h.riders.map((r) => r.ghost)]) g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.userData.ghost) (m.material as THREE.MeshBasicMaterial).color.setHex(col); });
    const foot = this.foot;
    if (foot) {
      foot.visible = true;
      if (spec.layer === 'wall') {
        foot.rotation.set(0, h.rot, 0); foot.scale.set(spec.w, 0.9, 1);
        foot.position.set(h.x + (h.rot ? 0.012 : 0), 1.55, h.z + (h.rot ? 0 : 0.012));
      } else { foot.rotation.set(-Math.PI / 2, 0, -h.rot); foot.scale.set(spec.w, spec.d, 1); foot.position.set(h.x, h.y + 0.016, h.z); }
      (foot.material as THREE.MeshBasicMaterial).color.setHex(col);
    }
  }
  private place() {
    const h = this.held, id = this.id;
    if (!h || !id) return;
    if (!h.on) { if (h.uid) return; this.cancelHeld(); return; }
    if (!h.ok) {
      sfx('error', 0.5);
      const spec = furnSpec(h.kind);
      if (!h.uid && spec && !canPay(spec.cost)) this.say(LINE.money);
      return;
    }
    let uid = h.uid ?? null;
    const moved: string[] = [];
    if (uid) {
      moveFurniture(id, uid, { x: h.x, z: h.z, rot: h.rot, y: h.y }, true);
      for (const r of h.riders) { moveFurniture(id, r.uid, { x: h.x + r.dx, z: h.z + r.dz, rot: r.rot, y: r.y }, true); moved.push(r.uid); }
      touchFacility();
    } else uid = buyFurniture(id, h.kind, { x: h.x, z: h.z, rot: h.rot, y: h.y });
    if (!uid) { sfx('error', 0.5); return; }
    const kind = h.kind, bought = !h.uid;
    const prevPur = purposeOf(room(id).furniture.filter((f) => f.uid !== uid).map((f) => f.kind));
    h.riders = [];
    this.cancelHeld();
    this.clearSel();
    this.map.rebuild(id);
    for (const u of [uid, ...moved]) {
      const o = this.furnObj(u), f = room(id).furniture.find((q) => q.uid === u);
      const spec = furnSpec(f?.kind ?? kind)!;
      if (o) this.drops.push({ o, t: 0, heavy: spec.layer === 'floor' && !spec.small ? Math.min(1, (spec.w * spec.d) / 2) : 0.1, foot: o.position.clone(), y0: o.position.y });
    }
    if (bought) sample('kiosk_accept', 0.25);
    const pur = purposeOf(room(id).furniture.map((f) => f.kind));
    if (pur && pur !== prevPur && !this.said.has('pur:' + id + pur)) { this.said.add('pur:' + id + pur); this.say(LINE[pur]); }
    this.renderStats();
    this.refreshTags();
  }
  private removeHeld() {
    const h = this.held, id = this.id;
    if (!h?.uid || !id) return;
    const p = new THREE.Vector3(h.x, 0.3, h.z);
    for (const u of [h.uid, ...h.riders.map((r) => r.uid)]) sellFurniture(id, u);
    h.uid = undefined; h.riders = [];
    this.cancelHeld();
    this.clearSel();
    this.map.rebuild(id);
    sample('dmg_scrape_metal', 0.4); sample('kiosk_accept', 0.2);
    this.dust(p, 8, 0xa09a88);
    this.renderStats();
    this.refreshTags();
  }
  private refreshTags() { for (const c of this.cat) this.tagOf(c); }
  // ---- the multi-select: Shift and a click on placed pieces marks them; picking one up then carries them all
  private toggleSel(uid: string) {
    if (this.sel.has(uid)) this.sel.delete(uid); else this.sel.add(uid);
    sample('cb_tick', 0.4) || sfx('tick', 0.4);
    this.markSel();
  }
  private clearSel() { this.sel.clear(); this.clearSelMarks(); }
  private clearSelMarks() { for (const m of this.selMarks) m.removeFromParent(); this.selMarks = []; }
  private markSel() {
    this.clearSelMarks();
    const id = this.id, f = this.frame;
    if (!id || !f) return;
    for (const u of this.sel) {
      const p = room(id).furniture.find((q) => q.uid === u);
      if (!p) continue;
      const sp = furnSpec(p.kind)!;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(sp.w + 0.1, sp.d + 0.1), new THREE.MeshBasicMaterial({ color: 0xffd870, transparent: true, opacity: 0.3, depthWrite: false }));
      m.rotation.set(-Math.PI / 2, 0, -p.rot); m.position.set(p.x, (p.y ?? 0) + 0.02, p.z); m.renderOrder = 3; m.userData.noGlow = true;
      f.add(m); this.selMarks.push(m);
    }
  }
  private finish(f: FinishSpec) {
    const id = this.id!;
    if (room(id).finish?.[f.part] === f.key) return;
    if (!applyFinish(id, f.key)) { sfx('error', 0.5); this.say(LINE.money); return; }
    this.map.rebuild(id);
    const snd = f.part === 'light' ? 'switch' : f.mat === 'paint' || f.mat === 'wallpaper' || f.mat === 'stripe' ? 'spray' : f.mat === 'carpet' ? 'carpet_rustle' : f.mat === 'tile' || f.mat === 'check' ? 'glass_clink' : 'wood_hit';
    sample(snd, 0.5); sample('kiosk_accept', 0.2);
    if (f.part === 'light') { this.map.lightMul = 0.2; setTimeout(() => { this.map.lightMul = 1; sample('fluoro_tick', 0.4); }, 120); }
    else for (let i = 0; i < 6; i++) this.dust(new THREE.Vector3(f.part === 'wall' ? -HALF + 0.3 : (Math.random() - 0.5) * 3, f.part === 'wall' ? 0.5 + Math.random() * 1.5 : 0.05, (Math.random() - 0.5) * 3), 2, 0xe8e0d0);
    this.refreshTags();
  }
  private stepBuild(dt: number) {
    this.layoutCat(dt);
    const h = this.held;
    if (h && h.on) { const lift = 0.06 + Math.sin(this.t * 5) * 0.015; h.ghost.position.y = h.y + lift; for (const r of h.riders) r.ghost.position.y = (r.y ?? 0) + lift; }
    if (h && this.heldKeys.childElementCount) {
      const f = this.frame;
      const p = f ? this.h.stage.project(_v.set(h.x, h.y + 1.0, h.z).add(f.position)) : null;
      if (p && h.on) { this.heldKeys.style.transform = `translate(${Math.round(p.x + 60)}px, ${Math.round(p.y - 40)}px)`; this.heldKeys.hidden = false; } else this.heldKeys.hidden = true;
    }
    // drops: a short fall, a thud, a settle
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      const t0 = d.t; d.t += dt;
      const T = 0.26;
      if (d.t < T) d.o.position.y = d.y0 + 0.5 * (1 - (d.t / T) ** 2);
      else if (d.t < T + 0.16) d.o.position.y = d.y0 + Math.sin(((d.t - T) / 0.16) * Math.PI) * 0.025 * (0.4 + d.heavy);
      else { d.o.position.y = d.y0; this.drops.splice(i, 1); }
      if (t0 < T && d.t >= T) {
        sample(d.heavy > 0.5 ? 'craft_thud' : d.heavy > 0.2 ? 'cube_place' : 'thud_soft', 0.45 + d.heavy * 0.35, 0.9 + Math.random() * 0.2);
        this.map.shake = Math.max(this.map.shake, 0.12 + d.heavy * 0.35);
        this.dust(d.foot, 4 + Math.round(d.heavy * 8), 0xa8a090);
      }
    }
  }

  // ================================================================== input
  private down(e: PointerEvent) {
    if (this.mode === 'off' || e.button === 2) return;
    this.ptr.down = true; this.ptr.dx = e.clientX; this.ptr.dy = e.clientY; this.ptr.moved = false; this.ptr.x = e.clientX; this.ptr.y = e.clientY; this.ptr.n++;
    if (this.mode === 'cine') { this.skipCine = true; return; }
    if (this.mode === 'clear') { this.grabPiece(e.clientX, e.clientY); return; }
    if (this.mode === 'build') {
      if (this.held) return;
      const c = this.catAt(e.clientX, e.clientY);
      if (c) {
        if (c.locked) { sfx('error', 0.5); this.say(c.tier ? LINE.tier : LINE.locked); return; }
        if (c.fin) { this.finish(c.fin); return; }
        this.pick(c.key, e.clientX, e.clientY);
        return;
      }
      // a placed piece: Shift marks it for a group move, a press picks it (and anything marked with it) up
      const ray = this.h.stage.rayAt(e.clientX, e.clientY), d = this.dio;
      if (!ray || !d) return;
      _r.ray.copy(ray);
      const hits = _r.intersectObject(d.group, true);
      for (const hh of hits) {
        let o: THREE.Object3D | null = hh.object;
        while (o && o.userData.furniture === undefined) o = o.parent;
        if (o && o.userData.furniture) {
          const f = room(this.id!).furniture.find((q) => q.uid === o!.userData.furniture);
          if (!f) break;
          if (e.shiftKey) { this.toggleSel(f.uid); return; }
          if (this.sel.size && !this.sel.has(f.uid)) this.clearSel();
          this.pick(f.kind, e.clientX, e.clientY, f.uid, f.rot);
          return;
        }
        break;
      }
      if (!e.shiftKey && this.sel.size) this.clearSel();
    }
  }
  private move(e: PointerEvent) {
    if (this.mode === 'off') return;
    this.ptr.x = e.clientX; this.ptr.y = e.clientY;
    if (this.ptr.down && Math.hypot(e.clientX - this.ptr.dx, e.clientY - this.ptr.dy) > 12) this.ptr.moved = true;
    if (this.mode === 'clear') { this.dragTo(e.clientX, e.clientY); return; }
    if (this.mode === 'build') {
      if (this.held) { this.aim(e.clientX, e.clientY); return; }
      const c = this.catAt(e.clientX, e.clientY);
      if (c !== this.hot) { this.hot = c; if (c) sfx('tick', 0.35); }
      this.h.stage.canvas.style.cursor = c ? 'pointer' : '';
    }
  }
  private up(e: PointerEvent) {
    if (this.mode === 'off') return;
    const was = this.ptr.down;
    this.ptr.down = false;
    if (!was) return;
    if (this.mode === 'clear' && this.drag) { const p = this.drag.p; this.dropPiece(p); this.drag = null; return; }
    if (this.mode === 'build' && this.held) {
      const h = this.held;
      // the press that picked it up, let go where it was: keep holding it until the next click (click, click)
      if (h.press === this.ptr.n && !this.ptr.moved) return;
      // dragged and let go (or a second click): dropped back on the strip, a placed piece goes back (refunded) and a
      // new one is put away; anywhere else it goes down
      if (e.clientY > innerHeight * 0.8) { if (h.uid) this.removeHeld(); else this.cancelHeld(); return; }
      this.place();
    }
  }
  private wheel(e: WheelEvent) {
    if (this.mode !== 'build') return;
    e.preventDefault();
    if (this.held && e.clientY < innerHeight * 0.76) { this.turn(e.deltaY > 0 ? 1 : -1, e.shiftKey); return; }
    this.scrollGoal += (e.deltaY + e.deltaX) * 0.0012;
  }
  private key(e: KeyboardEvent) {
    if (this.mode === 'off') return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    if (this.mode === 'cine' && (e.key === ' ' || e.key === 'Enter')) { this.skipCine = true; e.preventDefault(); e.stopPropagation(); return; }
    if (this.mode !== 'build') return;
    const k = e.key.toLowerCase();
    if (k === 'r') { this.turn(1, e.shiftKey); e.preventDefault(); e.stopPropagation(); }
    else if (k === 'g') { this.toggleSnap(); e.preventDefault(); e.stopPropagation(); }
    else if ((e.key === 'Delete' || e.key === 'Backspace' || k === 'x') && this.held?.uid) { this.removeHeld(); e.preventDefault(); e.stopPropagation(); }
    else if (k === 'q') { if (this.held) this.turn(-1, e.shiftKey); else this.scrollGoal -= 0.6; e.stopPropagation(); }
    else if (k === 'e') { if (this.held) this.turn(1, e.shiftKey); else this.scrollGoal += 0.6; e.stopPropagation(); }
  }

  // ================================================================== the frame
  update(dt: number) {
    if (this.mode === 'off') return;
    this.t += dt;
    this.subs.update(dt);
    if (this.mode === 'clear' || this.falls.length || this.skipFx || this.drag) this.stepClear(dt);
    if (this.mode === 'build' || this.drops.length) this.stepBuild(dt);
    this.crew?.update(dt);
    // dust only shows faintly (additive puffs: a grey haze, not a glow); sparks keep their heat
    this.puffs.update(dt, this.map.cam, () => 0.32);
    this.sparkP.update(dt, this.map.cam, () => 1.8);
    this.arcs.update(dt);
    // the room's totals float over its back wall
    const f = this.frame;
    if (f && this.stats.childElementCount) {
      const p = this.h.stage.project(_v.set(-0.4, WALL_H + 0.45, -HALF).add(f.position));
      if (p) { const y = Math.max(this.mode === 'build' ? 150 : 96, p.y); this.stats.style.transform = `translate(${Math.round(Math.max(200, Math.min(innerWidth - 200, p.x)))}px, ${Math.round(y)}px) translate(-50%, -100%)`; this.stats.hidden = false; } else this.stats.hidden = true;
    }
    this.stats.classList.toggle('dim', this.mode === 'cine');
  }
  /** test hook: how many debris pieces are still on the floor */
  get debrisLeft(): number { return this.id ? debrisCount(this.id) - (room(this.id).work?.binned.length ?? 0) : 0; }
}
export type { Pose };
