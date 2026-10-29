import '../craft/craft.css';
import * as THREE from 'three';
import { G } from '../game/G';
import type { UI } from './ui';
import type { Container } from '../items/container';
import { type Item, itemDef, itemName, itemWeight } from '../items/item';
import { queueTransfers, resolveTarget } from '../actions/transfer';
import { floorContainer } from '../items/worldItems';
import { objDef } from '../world/objects';
import { lineOfSight } from '../world/collision';
import { ensureLoot, isWorldContainer, containerRef, transferItem } from '../game/worldOps';
import { op } from '../game/ops';
import { bus } from '../core/events';
import { WearAction, EquipAction } from '../actions/basic';
import { gridSpec, autoPack, settleGravity, type Rot, TURN, TIP, ROLL, setPlace, isEquipped, type Placement, dropSpot, testFit, containerOcc } from '../items/grid';
import { isToolDef, TOOL_ROLL_LOOPS } from '../items/footprints';
import { settlePack, bestDest } from '../items/packResolver';
import { createItem } from '../items/factory';
import { fpGroup, fpClaim, fpRelease, fpOwner, fpCamera } from '../fp/fp';
import { eyeActive, eyeCamera, eyeEnter } from '../fp/eye';
import { TrayView } from '../craft/trayView';
import type { GridView3, DropAt } from '../craft/gridView3';
import { Tweens, easeOut, easeBack, easeInOut, makeArm, poseArm, type Arm, makeBackdrop, makeItemObj, fitItemObj, type ItemObj, boxEdges, pointerRay, damp } from '../craft/fpKit';
import { registerCraftSounds } from '../craft/craftSounds';
import { craftSystem } from '../craft/craft';
import { metalMat } from '../craft/metal';
import { Gauge, ControlBox } from '../craft/props';
import { debtorNo } from './holo/holo';
import { kick } from '../gfx/juice';
import { registerBagSounds } from './bag/bagSounds';
import { PackView, contactShadow } from './pack/packView';
import { containerShell, GroundTag, TagRow, NoteTape, kitMat, Dust } from './pack/packScene';
import { fcyl } from './touch/facet';
import { texturizeSleeves } from './pack/packTex';

/**
 * The backpack is the Meridian Field Pack: an institutional rucksack on a steel
 * frame. Opening it (I, the pack on the HUD, or a tap on yourself's Backpack
 * verb) goes into first person: you go down on one knee, swing the pack off your
 * shoulder and it lands on the real floor in front of you (the eye view: the room
 * you are in, src/fp/eye.ts). Your banded wrist goes to the seal (the padlock's
 * phosphor window reads the BAILIFF band, the shackle pops, the lock drops on its
 * lanyard), you snap the compression buckles, run both zip pulls round and throw
 * the flap back over the top: inside, a 5x5x5 grid stitched into the lining, lit
 * by the clip-on lamp. Everything you carry takes its real 3D size; drag it in and
 * it drops to rest on the floor of the pack or on what is under it (a green ghost
 * fits, a red one doesn't). R / T / Y, or the toggles on the packing remote on the
 * floor, turn, tip and roll it; the remote's knob (or the wheel) peels layers off
 * the top; its red button shakes everything tight. Drag the floor to turn the pack
 * and lean in.
 *
 * Round it, all on the floor: the tool roll unrolled on the left (six loops and the
 * brass quick-draw holster, drawn with ` or Y outside the pack); whatever you are
 * looting set down on the right as the real thing (the drawer, the crate, the
 * box), with a manila tag tied to it for every container in reach (pockets, other
 * bags, the floor): tap a tag to bring that one. The kit mat holds what you wear:
 * drop clothes on it to put them on, pull them off to take them off. Your hands rest
 * on the floor either side: put something in one to hold it. Drop on the bare floor
 * to leave it there. Double-click (long-press, right-click) an item to inspect it
 * close up (src/craft). The brass load gauge on the left strap reads the weight;
 * the heavier and fuller the pack, the slower you walk. Tap the flap to close.
 *
 * Nothing here is DOM but an invisible pointer catcher, and nothing hangs in the air:
 * every readout is a printed tag, a dial or label tape lying on something.
 *
 * World containers rearrange through ops, so co-op looters see the same layout; your
 * own pack is yours and is saved with you.
 */

interface Entry { c: Container; name: string; kind: 'pockets' | 'bag' | 'loot' | 'floor' }
type Target =
  | { k: 'grid'; d: DropAt }
  | { k: 'hand'; hand: 'R' | 'L'; ok: boolean }
  | { k: 'wear'; ok: boolean }
  | { k: 'tab'; c: Container; ok: boolean }
  | { k: 'floor'; at: THREE.Vector3 }
  | { k: 'none' };
interface Drag {
  stack: Item[]; count: number; from: Container; src: 'grid' | 'hand' | 'worn'; hand?: 'R' | 'L';
  rot: Rot; pointerId: number; over: Target; ghost: ItemObj; edges: THREE.LineSegments;
}
type Hit = { kind: 'item'; view: GridView3; items: Item[] } | { kind: 'held'; hand: 'R' | 'L'; it: Item } | { kind: 'worn'; it: Item } | { kind: 'ctl'; ctl: string; obj: THREE.Object3D; x: number } | { kind: 'side'; i: number } | { kind: 'lid' };
interface Press { pointerId: number; x0: number; y0: number; t: number; touch: boolean; hit: Hit | null; long: number; done: boolean; shift: boolean }
/** what a hand is doing: reaching for a part of the pack (w 0..1 from rest), its pose and palm roll */
interface Reach { o: THREE.Object3D | null; at: THREE.Vector3; w: number; pose: 'relaxed' | 'grip' | 'pinch' | 'open' | 'press' | 'flat'; roll: number }

const LONG_MS = 480;
const ghostOk = new THREE.MeshBasicMaterial({ color: 0x9ae890, transparent: true, opacity: 0.55, depthWrite: false });
const ghostBad = new THREE.MeshBasicMaterial({ color: 0xd84a32, transparent: true, opacity: 0.6, depthWrite: false });
const ghostNone = new THREE.MeshBasicMaterial({ color: 0xe8e0c8, transparent: true, opacity: 0.7, depthWrite: false });
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _s = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4();
const DEG = Math.PI / 180;
/** the eye's field of view while packing (narrower than walking: you are looking at something) */
const PACK_FOV = 54;
/** the kneeling eye (for when the eye camera is not up): height and how far ahead of the feet */
const KNEEL_EYE = { y: 1.18, fwd: 0.22 };
/** where the shoulders are, in camera space (the arms' upper arms run off-frame toward them) */
const SHOULDER = new THREE.Vector3(0.19, -0.3, -0.12);

export class InventoryUI {
  open = false;
  ui: UI;
  root: HTMLDivElement;
  private suspended = false;
  private built = false;
  private g!: THREE.Group;
  /** the real floor in front of you (local: x right, y up, -z ahead, origin at your feet), re-placed every frame from the eye */
  private world = new THREE.Group();
  /** the pack in camera space (blended from your shoulder to the floor) */
  private packG = new THREE.Group();
  private cube = new PackView();
  private roll = new TrayView();
  private tray = new TrayView();
  private rollHold = new THREE.Group();
  private trayHold = new THREE.Group();
  private trayShell: THREE.Object3D | null = null;
  private shellKey = '';
  private views: GridView3[] = [];
  private arms: Arm[] = [];
  private backdrop!: THREE.Mesh;
  private carpet!: THREE.Mesh;
  private packShadow!: THREE.Mesh;
  private rollShadow!: THREE.Mesh;
  private trayShadow!: THREE.Mesh;
  private dust = new Dust();
  private tw = new Tweens();
  private phase: 'off' | 'waiting' | 'opening' | 'open' | 'closing' = 'off';
  private waitT = 0;
  private lastClose = -1e9;
  /** the pack on your shoulder (1) or on the floor (0) */
  private held = 1;
  /** the things round it: 0 = not set down yet, 1 = in place */
  private setOut = 0;
  private yaw = 0; private yawT = 0;
  private pitch = 54; private pitchT = 54;
  private shakeT = 0;
  private hookFn: ((dt: number) => void) | null = null;
  private anchorM = new THREE.Matrix4();
  private synth = new THREE.PerspectiveCamera(54, 1, 0.05, 20);
  private packZ = 0.8;
  private kneeling = false;
  // props, all on the floor
  private gauge = new Gauge();
  private box = new ControlBox();
  private note!: NoteTape;
  private gtag!: GroundTag;
  private tags!: TagRow;
  private mat!: THREE.Mesh;
  private matG = new THREE.Group();
  private band: THREE.Group | null = null;

  private wornObjs: { it: Item; obj: ItemObj }[] = [];
  /** where the hands rest (world-local, on the floor either side of the pack) */
  private rest = { R: new THREE.Vector3(), L: new THREE.Vector3() };
  /** the same in camera space (drop targets) */
  private palm = { R: new THREE.Vector3(), L: new THREE.Vector3() };
  private reach: { L: Reach; R: Reach } = { L: this.mkReach(), R: this.mkReach() };
  private heldObjs: { R: ItemObj | null; L: ItemObj | null } = { R: null, L: null };
  private heldKey = { R: 0, L: 0 };
  // data
  private side: Entry[] = [];
  private sideSel = 0;
  private sideRef = 'pockets';
  private focusRef = '';
  private floorC: Container | null = null;
  private scanT = 0; private settleT = 0; private loadT = 0; private kitT = 2;
  private dirty = true;
  private drag: Drag | null = null;
  private press: Press | null = null;
  private orbit: { id: number; x: number; y: number } | null = null;
  private lastTap = { uid: 0, t: 0 };
  private sel: { it: Item; view: GridView3 } | null = null;
  private rc = new THREE.Raycaster();
  private lastT = performance.now();
  private lastPX = 0; private lastPY = 0;
  private sideSig = ''; private wornSig = '';

  constructor(ui: UI) {
    this.ui = ui;
    registerCraftSounds(); registerBagSounds();
    const r = document.createElement('div');
    r.className = 'fpk';
    r.id = 'bag-root';
    document.body.appendChild(r);
    this.root = r;
    r.addEventListener('pointerdown', (e) => this.onDown(e));
    window.addEventListener('pointermove', (e) => this.onMove(e), { passive: false });
    window.addEventListener('pointerup', (e) => this.onUp(e, false));
    window.addEventListener('pointercancel', (e) => this.onUp(e, true));
    window.addEventListener('keydown', (e) => this.onKey(e), true);
    r.addEventListener('contextmenu', (e) => { e.preventDefault(); this.onContext(e); });
    r.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    r.addEventListener('touchmove', (e) => { if (this.open) e.preventDefault(); }, { passive: false });
    bus.on('containerChanged', () => { this.dirty = true; });
    bus.on('inventoryChanged', () => { this.dirty = true; this.settleT = Math.min(this.settleT, 0.05); });
    bus.on('floorChanged', () => { this.scanT = 0; this.dirty = true; });
    bus.on('gridNoRoom', (it: Item) => { if (this.open) this.note_('no room: ' + itemName(it), true); });
    bus.on('gridOverflow', (it: Item, where: string) => { if (this.open) this.note_((where === 'hand' ? 'in hand: ' : 'dropped: ') + itemName(it), true); });
    bus.on('fpLost', (name: string) => { if (name === 'pack' && this.open) this.suspend(); });
    bus.on('fpChange', (name: string | null) => { if (name === null && this.open && this.suspended) setTimeout(() => this.resume(), 0); });
    // while the pack is out you are not walking anywhere
    const ui0 = ui as any;
    const orig = ui0.blocksMovement?.bind(ui0);
    if (orig) ui0.blocksMovement = () => orig() || (this.open && !this.suspended) || !!(G as any).craft?.busy?.();
    (G as any).pack = this;
    // hands-on crafting rides along with the pack (G.craft: inspect, workbench)
    try { (G as any).craft = craftSystem(); } catch (e) { console.warn('craft', e); }
  }

  private mkReach(): Reach { return { o: null, at: new THREE.Vector3(), w: 0, pose: 'relaxed', roll: 0 }; }

  // ================================================================ 3D scene
  private build() {
    if (this.built) return;
    this.built = true;
    const g = (this.g = fpGroup('pack'));
    // only when the eye is not up (a fallback): the room gone dark behind a patch of carpet
    this.backdrop = makeBackdrop();
    (this.backdrop.material as THREE.MeshBasicMaterial).opacity = 0.95;
    g.add(this.backdrop);
    this.world.matrixAutoUpdate = false;
    this.packG.matrixAutoUpdate = false;
    g.add(this.world, this.packG);
    this.packG.add(this.cube.root);
    // light like the room: a soft overhead key, a cool bounce off the floor, a warm kicker from the side
    const W = this.world;
    W.add(new THREE.HemisphereLight(0xcfc8b4, 0x2e2a22, 0.5));
    const key = new THREE.DirectionalLight(0xffe6c4, 1.7); key.position.set(-0.6, 3.2, 0.4); key.target.position.set(0, 0, -0.8); W.add(key, key.target);
    const fill = new THREE.DirectionalLight(0x8090a8, 0.22); fill.position.set(1.4, 0.6, 0.6); fill.target.position.set(0, 0, -0.8); W.add(fill, fill.target);
    const rim = new THREE.DirectionalLight(0xfff0d8, 0.45); rim.position.set(0.4, 1.2, -3); rim.target.position.set(0, 0, -0.8); W.add(rim, rim.target);
    // the carpet (fallback only: in the eye the real floor is there)
    const cg = new THREE.PlaneGeometry(3.4, 2.4, 1, 1); cg.rotateX(-Math.PI / 2);
    this.carpet = new THREE.Mesh(cg, new THREE.MeshStandardMaterial({ color: 0x8a7c4a, roughness: 1, metalness: 0 }));
    this.carpet.position.set(0, -0.001, -0.9);
    W.add(this.carpet);
    // contact shadows
    this.packShadow = contactShadow(0.78, 0.78, 0.55); W.add(this.packShadow);
    this.rollShadow = contactShadow(0.42, 0.36, 0.42); this.rollHold.add(this.rollShadow);
    this.trayShadow = contactShadow(0.6, 0.52, 0.45); this.trayHold.add(this.trayShadow);
    W.add(this.rollHold, this.trayHold, this.dust.points);
    this.rollHold.add(this.roll.root);
    this.trayHold.add(this.tray.root);
    this.views = [this.cube, this.roll, this.tray];
    // the load gauge on the left shoulder strap, the packing remote, the kit mat
    this.gauge.g.scale.setScalar(0.55);
    W.add(this.gauge.g);
    this.box.g.scale.setScalar(0.78);
    W.add(this.box.g);
    this.note = new NoteTape(this.box.g, new THREE.Vector3(0.137, -0.012, 0.03));
    this.mat = kitMat();
    this.matG.add(this.mat);
    W.add(this.matG);
    this.gtag = new GroundTag(W);
    this.tags = new TagRow(W);
    for (const s of [1, -1] as const) { const a = makeArm(s, 1.05); texturizeSleeves(a.root); g.add(a.root); this.arms.push(a); }
    // the BAILIFF band on the left wrist: a steel cuff with a hazard ring and a green lamp
    const band = new THREE.Group();
    const cuff = new THREE.Mesh(fcyl(0.034, 0.032, 8, 0.036, 0.2), metalMat('steel', 2));
    cuff.scale.set(1, 1, 0.84);
    const ring = new THREE.Mesh(fcyl(0.0352, 0.008, 8, 0.0372, 0.1, true), new THREE.MeshStandardMaterial({ color: 0xd8a42a, roughness: 0.5, metalness: 0.2, flatShading: true, side: THREE.DoubleSide }));
    ring.scale.set(1, 1, 0.84); ring.position.y = 0.004;
    const led = new THREE.Mesh(fcyl(0.004, 0.004, 6, 0.004, 0.2).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x5aff7a }));
    led.position.set(0, 0.008, -0.031);
    band.add(cuff, ring, led);
    band.position.y = -0.03;
    this.arms[1].fp.wrist.add(band);
    this.band = band;
  }

  /** where things sit on the floor for this aspect (world-local metres) */
  private layout() {
    const cam = fpCamera();
    const asp = cam.aspect || window.innerWidth / Math.max(1, window.innerHeight);
    const wide = asp >= 1.2;
    const sz = this.cube.size;
    const W2 = (sz.x || 0.5) / 2, L2 = (sz.z || 0.55) / 2;
    this.packZ = wide ? 0.64 : 0.8;
    const pz = -this.packZ;
    this.packShadow.position.set(0, 0.002, pz);
    if (wide) {
      this.rollHold.position.set(-(W2 + 0.37), 0.002, pz - 0.02); this.rollHold.rotation.set(0, 0.32, 0);
      this.trayHold.position.set(W2 + 0.4, 0.002, pz - 0.04); this.trayHold.rotation.set(0, -0.32, 0);
      this.fitSide(this.roll, this.rollHold, 0.38, 0.32);
      this.fitSide(this.tray, this.trayHold, 0.5, 0.44);
      this.gauge.g.position.set(-(W2 + 0.12), 0.03, pz - 0.06);
      this.box.g.position.set(W2 + 0.13, 0.026, pz + L2 + 0.0); this.box.g.rotation.set(0.3, -0.42, 0);
      this.matG.position.set(-(W2 + 0.2), 0, pz + L2 - 0.02); this.matG.rotation.set(0, 0.42, 0);
      this.rest.L.set(-(W2 + 0.07), 0.02, pz + L2 - 0.1); this.rest.R.set(W2 + 0.07, 0.02, pz + L2 - 0.1);
    } else {
      // portrait: the pack further off up the picture, the roll and the container nearer, below it;
      // the remote and the kit mat either side of the pack
      this.rollHold.position.set(-0.22, 0.002, -0.4); this.rollHold.rotation.set(0, 0.18, 0);
      this.trayHold.position.set(0.24, 0.002, -0.4); this.trayHold.rotation.set(0, -0.18, 0);
      this.fitSide(this.roll, this.rollHold, 0.26, 0.24);
      this.fitSide(this.tray, this.trayHold, 0.28, 0.26);
      this.gauge.g.position.set(-(W2 + 0.04), 0.03, pz - L2 + 0.06);
      this.box.g.position.set(W2 + 0.16, 0.026, pz + 0.04); this.box.g.rotation.set(0.25, -0.5, 0);
      this.matG.position.set(-(W2 + 0.17), 0, pz + 0.12); this.matG.rotation.set(0, 0.5, 0);
      this.rest.L.set(-(W2 - 0.02), 0.02, pz + L2 + 0.06); this.rest.R.set(W2 - 0.02, 0.02, pz + L2 + 0.06);
    }
    this.gauge.g.rotation.set(-Math.PI / 2 + 0.6, 0, 0.25);
    this.carpet.visible = this.backdrop.visible = !eyeActive();
  }
  private fitSide(v: TrayView, hold: THREE.Group, maxW: number, maxD: number) {
    const [w, d] = v.size();
    const s = Math.min(1.3, maxW / Math.max(0.05, w), maxD / Math.max(0.05, d));
    v.root.scale.setScalar(s);
    const shadow = hold === this.rollHold ? this.rollShadow : this.trayShadow;
    shadow.scale.set((w * s + 0.08) / (hold === this.rollHold ? 0.42 : 0.6), 1, (d * s + 0.08) / (hold === this.rollHold ? 0.36 : 0.52));
    if (hold === this.trayHold && this.trayShell) this.trayShell.scale.setScalar(s);
  }

  // ================================================================ the floor, from your eyes
  /** the eye's real field of view for this picture (the renderer widens it for portrait) */
  private eyeFovNow(): number {
    const cam = fpCamera();
    const asp = cam.aspect || 1;
    const base = (eyeActive() ? (G.pr as unknown as { eyeFov: number }).eyeFov : PACK_FOV) * DEG;
    const vf = asp >= 1.2 ? base : Math.min(104 * DEG, 2 * Math.atan(Math.tan(base / 2) * 1.2 / asp));
    return vf / DEG;
  }
  /** every frame, right after the eye has moved: put the floor where the eye sees it, the pack, the hands */
  private sync(dt: number) {
    if (!this.open || this.suspended || !this.built) return;
    const cam = fpCamera();
    cam.position.set(0, 0, 0); cam.rotation.set(0, 0, 0); cam.updateMatrixWorld();
    const fov = this.eyeFovNow();
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    // the eye (or, when it is not up, a kneeling eye of our own over the same spot)
    let inv: THREE.Matrix4;
    if (eyeActive()) {
      const e = eyeCamera(); e.updateMatrixWorld(); inv = e.matrixWorldInverse;
      const pr = G.pr as unknown as { eyeFov: number };
      if (pr.eyeFov !== PACK_FOV || Math.abs(this.pitch - this.pitchT) > 0.05) { this.pitch = damp(this.pitch, this.pitchT, 10, dt); eyeEnter({ pitchDeg: this.pitch, fov: PACK_FOV }); }
    } else {
      const s = this.synth;
      _v.set(0, KNEEL_EYE.y, -KNEEL_EYE.fwd).applyMatrix4(this.anchorM);
      s.position.copy(_v);
      _v2.set(0, KNEEL_EYE.y - Math.tan(this.pitch * DEG), -KNEEL_EYE.fwd - 1).applyMatrix4(this.anchorM);
      s.up.set(0, 1, 0); s.lookAt(_v2); s.updateMatrixWorld();
      inv = s.matrixWorldInverse;
      this.pitch = damp(this.pitch, this.pitchT, 10, dt);
    }
    this.world.matrix.multiplyMatrices(inv, this.anchorM);
    this.world.matrixWorldNeedsUpdate = true;
    this.world.updateMatrixWorld(true);
    // the pack: on your shoulder (camera space) blended down to its place on the floor
    _m.makeRotationY(this.yaw).setPosition(0, 0, -this.packZ);
    const floorM = _m.premultiply(this.world.matrix);
    const fp = _v.setFromMatrixPosition(floorM);
    _q.setFromRotationMatrix(floorM);
    const h = this.held;
    if (h > 0.001) {
      const shoulder = _v2.set(0.42, 0.18, -0.12);
      _q2.setFromEuler(new THREE.Euler(0.7, -0.9, -0.5));
      const e = h;
      const pos = fp.clone().lerp(shoulder, e);
      pos.y += Math.sin(e * Math.PI) * 0.12;
      _q.slerp(_q2, e);
      this.packG.matrix.compose(pos, _q, _s.set(1, 1, 1));
    } else this.packG.matrix.compose(fp, _q, _s.set(1, 1, 1));
    // a little shake when it lands or something heavy goes in
    if (this.shakeT > 0) { const k = Math.max(0, this.shakeT) * 0.03; this.packG.matrix.multiply(_m.makeTranslation((Math.random() - 0.5) * k, Math.abs(Math.random() - 0.5) * k, (Math.random() - 0.5) * k)); }
    this.packG.matrixWorldNeedsUpdate = true;
    this.packG.updateMatrixWorld(true);
    this.packShadow.visible = h < 0.3;
    (this.packShadow.material as THREE.MeshBasicMaterial).opacity = 0.55 * Math.max(0, 1 - h * 3.3);
    this.poseArms(dt);
    this.poseHeld(dt);
    this.placeWorn();
  }
  /** keep our per-frame hook last in the renderer's list (after the eye's own) */
  private hook() {
    const pr = G.pr as unknown as { beforeRender: ((dt: number) => void)[] };
    if (!this.hookFn) this.hookFn = (dt: number) => this.sync(dt);
    const arr = pr.beforeRender;
    const i = arr.indexOf(this.hookFn);
    if (i !== arr.length - 1) { if (i >= 0) arr.splice(i, 1); arr.push(this.hookFn); }
  }
  private unhook() {
    const pr = G.pr as unknown as { beforeRender: ((dt: number) => void)[] };
    const i = this.hookFn ? pr.beforeRender.indexOf(this.hookFn) : -1;
    if (i >= 0) pr.beforeRender.splice(i, 1);
    const cam = fpCamera();
    if (cam.fov !== 30) { cam.fov = 30; cam.updateProjectionMatrix(); }
  }

  // ================================================================ open / close
  toggle(v?: boolean) {
    const want = v ?? !(this.open && !this.suspended);
    if (want && this.open && this.suspended) { this.resume(); return; }
    if (want === this.open) { if (want && this.phase === 'closing') this.reopen(); return; }
    if (want) this.show(); else this.hide();
  }

  /** open and show a specific world container beside the pack */
  focus(c: Container) {
    this.focusRef = c.owner;
    if (!this.open) this.toggle(true);
    this.scanT = 0;
  }

  private cubeC(): Container | null {
    const back = G.local?.worn.get('back' as any);
    const sp = back?.inv ? gridSpec(back.inv) : null;
    return sp && sp.d > 1 ? back!.inv! : null;
  }
  private rollC(): Container | null {
    const p = G.local;
    if (!p) return null;
    for (const it of p.worn.values()) if (it.key === 'tool_roll' && it.inv) return it.inv;
    return null;
  }

  private show() {
    const p = G.local;
    if (!p || p.body?.dead) return;
    this.build();
    // a full close-up: it takes the stage from a passing glance or the watch held up (they rank 1)
    if (!fpClaim('pack', 1.5, { cinematic: 'full', eyePitch: this.pitchT })) return;
    this.open = true; this.suspended = false;
    this.phase = 'waiting'; this.waitT = 0;
    this.root.classList.add('on');
    G.hudBody?.setHidden?.('pack', true);
    G.input.pointerOverUI = true;
    // down on one knee, facing where you were facing
    this.anchorM.makeRotationY(-(p.facing ?? 0) - Math.PI / 2).setPosition(p.x, p.y ?? 0, p.z);
    if (!p.full && !p.sittingOn && !p.inVehicle && p.stance !== 'swim') { p.full = 'kneel'; this.kneeling = true; }
    this.scanNearby(); this.dirty = true;
    this.cube.setContainer(this.cubeC());
    this.roll.setContainer(this.rollC());
    this.syncTray();
    this.cube.setPlate(debtorNo(p) || '----');
    this.cube.peel = 99; this.cube.applyPeel(); this.box.setLayer(5);
    this.yaw = this.yawT = 0;
    this.pitch = this.pitchT = (fpCamera().aspect >= 1.2 ? 62 : 54);
    this.layout();
    this.sideSig = ''; this.wornSig = '';
    this.renderSide(); this.renderWorn();
    this.resetParts();
    this.hook();
  }

  /** everything back to how it is on your back: sealed, buckled, flap shut, nothing set out */
  private resetParts() {
    const c = this.cube;
    c.setLid(0); c.setBolts(0); c.setZip(0); c.setLock(0); c.setInside(0); c.setScan(0, 0);
    this.held = 1; this.setOut = 0;
    this.setOutK(0);
    for (const h of ['L', 'R'] as const) { const r = this.reach[h]; r.o = null; r.w = 1; r.pose = 'grip'; r.roll = 0; }
  }

  private hide() {
    this.cancelDrag(); this.cancelPress(); this.gtag.hide();
    const was = this.phase;
    this.phase = 'closing';
    this.tw.finish();
    this.phase = 'closing';
    const c = this.cube, tw = this.tw;
    if (was === 'waiting') { this.finishClose(); return; }
    G.audio?.ui?.('bag_zip', 0.45);
    // flap over, zips round, buckles, the seal back on, the things round it picked up, up onto the shoulder
    this.grab('L', null, 'relaxed'); this.grab('R', null, 'relaxed');
    tw.add(0.2, (k) => { c.setLid(1 - k); c.setInside(1 - k); }, easeInOut);
    tw.add(0.16, (k) => { c.setZip(1 - k); c.setBolts(1 - k); this.setOutK(1 - k); }, easeOut, () => { G.audio?.ui?.('cube_bolt', 0.35); }, 0.18);
    tw.add(0.1, (k) => c.setLock(1 - k), easeOut, () => G.audio?.ui?.('cube_clunk', 0.3), 0.3);
    tw.add(0.01, () => {}, easeOut, () => { this.grab('L', 'gripL', 'grip', -Math.PI / 2); this.grab('R', 'gripR', 'grip', -Math.PI / 2); }, 0.3);
    tw.add(0.3, (k) => { this.held = k; }, easeInOut, () => this.finishClose(), 0.38);
  }

  /** a close called off while it is still going: open it again from where it is */
  private reopen() {
    this.tw.clear();
    this.phase = 'opening';
    this.openSeq(true);
  }

  private finishClose() {
    this.open = false; this.suspended = false;
    this.phase = 'off';
    this.tw.clear();
    this.root.classList.remove('on');
    this.unhook();
    fpRelease('pack');
    G.input.pointerOverUI = false;
    this.lastClose = performance.now();
    this.cube.setScan(0, 0);
    this.gtag?.hide();
    const p = G.local;
    if (p && this.kneeling && p.full === 'kneel') p.full = '';
    this.kneeling = false;
    G.hudBody?.setHidden?.('pack', false);
    this.ui.closeMenu?.();
  }

  private suspend() {
    this.suspended = true;
    this.cancelDrag(); this.cancelPress(); this.gtag?.hide();
    this.root.classList.remove('on');
    const cam = fpCamera();
    if (cam.fov !== 30) { cam.fov = 30; cam.updateProjectionMatrix(); }
  }
  /** come back after an inspection let go of the stage: back into the eyes, the pack still open */
  resume() {
    if (!this.open || !this.suspended || fpOwner()) return;
    if (!fpClaim('pack', 1.5, { cinematic: 'full', eyePitch: this.pitch })) return;
    this.suspended = false;
    this.root.classList.add('on');
    G.input.pointerOverUI = true;
    this.dirty = true;
    this.hook();
  }

  /** the things round the pack set out (0..1): the roll unrolls, the container is set down, the remote, the mat */
  private setOutK(k: number) {
    this.setOut = k;
    const e = Math.max(0, Math.min(1, k));
    const on = e > 0.01;
    for (const o of [this.rollHold, this.trayHold, this.gauge.g, this.box.g, this.matG, this.tags?.g]) if (o) o.visible = on;
    this.rollHold.scale.set(Math.max(0.01, e), 1, 1);
    this.trayHold.position.y = 0.002 + (1 - e) * 0.18;
    this.box.g.position.y = 0.026 + (1 - e) * 0.1;
    this.matG.scale.set(1, 1, Math.max(0.01, e));
  }

  /** a hand reaches for a named part of the pack (null = back to rest on the floor) */
  private grab(h: 'L' | 'R', part: string | null, pose: Reach['pose'], roll = 0, off?: THREE.Vector3) {
    const r = this.reach[h];
    const c = this.cube;
    let o: THREE.Object3D | null = null;
    const at = r.at.set(0, 0, 0);
    switch (part) {
      case 'gripL': case 'gripR': {
        const s = part === 'gripL' ? -1 : 1;
        o = c.root; at.set(s * (c.size.x / 2 + 0.03), c.size.y * 0.5, 0.05); break;
      }
      case 'seal': o = c.pad; at.set(0.012, 0.075, 0.05); break;
      case 'pullL': o = c.pull(0); at.set(0, 0.03, 0.03); break;
      case 'pullR': o = c.pull(1); at.set(0, 0.03, 0.03); break;
      case 'flap': o = c.lid; at.set(h === 'L' ? -0.12 : 0.12, 0.08, c.size.z * 0.95); break;
      default:
        if (part?.startsWith('strap')) { o = c.strapEnd(+part.slice(5)); at.set(0, -0.06, 0.03); }
    }
    if (off) at.add(off);
    r.o = o; r.pose = pose; r.roll = roll;
  }

  /** the open: kneel, swing the pack off your shoulder onto the floor, the seal, buckles, zips, the flap */
  private openSeq(quick: boolean) {
    const tw = this.tw, c = this.cube;
    tw.clear();
    const sp = quick ? 0.45 : 0.72;
    const reachW = (h: 'L' | 'R', to: number, dur: number, at: number) => { const r = this.reach[h]; let from = r.w; tw.add(dur, (k) => { if (k === 0) from = r.w; r.w = from + (to - from) * k; }, easeInOut, undefined, at); };
    let t = 0;
    // the swing: off the right shoulder, down in an arc, a thump on the floor
    if (this.held > 0.5) {
      this.grab('L', 'gripL', 'grip', -Math.PI / 2); this.grab('R', 'gripR', 'grip', -Math.PI / 2);
      this.reach.L.w = this.reach.R.w = 1;
      tw.add(0.5 * sp + 0.12, (k) => { this.held = 1 - k; }, (x) => x * x * (1.6 - 0.6 * x), () => {
        this.held = 0;
        G.audio?.ui?.('cube_place', 0.6); G.audio?.ui?.('bag_place', 0.5);
        this.shakeT = 0.22; kick(0, 1, 0.07);
        this.dust.puff(0, -this.packZ, this.cube.size.x, this.cube.size.z);
      });
      t += 0.5 * sp + 0.12;
    } else this.held = 0;
    // the things round it are set out as it lands
    tw.add(0.32, (k) => this.setOutK(k), easeBack, undefined, t);
    // the banded wrist to the seal: the window reads the band, the shackle pops, the lock drops on its lanyard
    if (c.c) {
      tw.add(0.01, () => {}, easeOut, () => { this.grab('L', 'seal', 'relaxed', 0.4); this.grab('R', null, 'relaxed'); }, t);
      reachW('L', 1, 0.2 * sp, t); reachW('R', 0, 0.2 * sp, t);
      t += 0.2 * sp;
      const scan = 0.34 * sp;
      tw.add(0.01, () => {}, easeOut, () => G.audio?.ui?.('cube_relay', 0.45), t);
      tw.add(scan, (k) => c.setScan(k, 1), (x) => x, () => { c.setScan(1, 1); G.audio?.ui?.('cube_ok', 0.4); }, t);
      t += scan;
      tw.add(0.08, (k) => c.setLock(k * 0.3), easeOut, () => { G.audio?.ui?.('cube_bolt', 0.45); this.shakeT = Math.max(this.shakeT, 0.05); }, t);
      t += 0.08;
      tw.add(0.3 * sp, (k) => c.setLock(0.3 + k * 0.7), (x) => x * x, () => G.audio?.ui?.('cube_clunk', 0.25), t);
      reachW('L', 0, 0.18 * sp, t);
      t += 0.22 * sp;
      // the buckles: both hands, two clicks each
      tw.add(0.01, () => {}, easeOut, () => { this.grab('L', 'strap0', 'pinch', 0.2); this.grab('R', 'strap1', 'pinch', -0.2); }, t);
      reachW('L', 1, 0.14 * sp, t); reachW('R', 1, 0.14 * sp, t);
      t += 0.14 * sp;
      tw.add(0.22 * sp, (k) => c.setBolts(k), easeOut, undefined, t);
      for (let i = 0; i < 4; i++) tw.add(0.01, () => {}, easeOut, () => { G.audio?.ui?.('cube_bolt', 0.32); kick(i % 2 ? 1 : -1, 0, 0.02); }, t + i * 0.05 * sp);
      t += 0.22 * sp;
      // the zips: a pull in each hand, round the bottom end and up both sides
      tw.add(0.01, () => {}, easeOut, () => { this.grab('L', 'pullL', 'pinch', 0.3); this.grab('R', 'pullR', 'pinch', -0.3); G.audio?.ui?.('bag_zip', 0.6); }, t);
      tw.add(0.46 * sp, (k) => c.setZip(k), easeInOut, undefined, t);
      t += 0.46 * sp;
      // the flap: lift it and throw it back over the top end
      tw.add(0.01, () => {}, easeOut, () => { this.grab('L', 'flap', 'grip', -0.6); this.grab('R', 'flap', 'grip', 0.6); G.audio?.ui?.('cube_hiss', 0.35); }, t);
      tw.add(0.42 * sp, (k) => { c.setLid(k); c.setInside(Math.max(0, k * 1.4 - 0.4), Math.random() < 0.3 ? -1.2 : 0); }, easeInOut, () => { c.setInside(1); c.setScan(0, 0.15); }, t);
      reachW('L', 0, 0.2 * sp, t + 0.3 * sp); reachW('R', 0, 0.2 * sp, t + 0.3 * sp);
      t += 0.42 * sp;
    }
    tw.add(0.01, () => {}, easeOut, () => this.ready(), t);
  }

  private ready() {
    this.phase = 'open';
    this.held = 0;
    this.setOutK(1);
    const c = this.cube;
    if (c.c) { c.setLid(1); c.setBolts(1); c.setZip(1); c.setLock(1); c.setInside(1); }
    this.grab('L', null, 'relaxed'); this.grab('R', null, 'relaxed');
    this.reach.L.w = this.reach.R.w = 0;
    this.dirty = true;
    G.missions?.set?.('pack:opened');
  }

  // ================================================================ data
  private carriedBags(): Container[] {
    const p = G.local;
    const out: Container[] = [];
    const cube = this.cubeC(), roll = this.rollC();
    for (const c of p.containers()) if (c !== p.inv && c !== cube && c !== roll && !out.includes(c)) out.push(c);
    return out;
  }

  private scanNearby() {
    const p = G.local;
    const z = G.zone;
    if (!p || !z) return;
    const out: Entry[] = [{ c: p.inv, name: 'Pockets', kind: 'pockets' }];
    for (const c of this.carriedBags()) {
      const it = p.allItems().find((i) => i.inv === c);
      out.push({ c, name: it ? itemName(it) : c.name, kind: 'bag' });
    }
    const R = 1.75;
    const seen = new Set<number>();
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const tx = p.tileX() + dx, ty = p.tileY() + dy;
      if (!z.inb(tx, ty)) continue;
      for (const o of z.objectsAt(tx, ty)) {
        if (seen.has(o.uid) || !o.inv) continue;
        seen.add(o.uid);
        const d = objDef(o.key);
        const w = d?.w ?? 1, dd = d?.d ?? 1;
        const rw = o.rot % 2 === 0 ? w : dd, rd = o.rot % 2 === 0 ? dd : w;
        const nx = Math.max(o.x, Math.min(p.x, o.x + rw)), nz = Math.max(o.y, Math.min(p.z, o.y + rd));
        if (Math.hypot(nx - p.x, nz - p.z) > R) continue;
        if (!lineOfSight(z, p.x, p.z, Math.min(o.x + rw - 0.01, Math.max(o.x + 0.01, p.x)), Math.min(o.y + rd - 0.01, Math.max(o.y + 0.01, p.z)))) continue;
        ensureLoot(z, o.inv);
        out.push({ c: o.inv, name: d?.name || o.key, kind: 'loot' });
      }
    }
    const fresh = floorContainer(z, p.x, p.z, 1.3);
    for (const it of fresh.items) if (it.inv) out.push({ c: it.inv, name: itemName(it), kind: 'loot' });
    for (const corpse of G.creatures?.nearbyCorpses?.(p, R) || []) out.push({ c: corpse.inv, name: corpse.name, kind: 'loot' });
    for (const v of G.items?.nearbyTrunks?.(p) || []) out.push({ c: v.c, name: v.name, kind: 'loot' });
    // the floor view is rebuilt every look; keep one container so the view doesn't flicker
    if (!this.floorC) this.floorC = fresh;
    else { this.floorC.items = fresh.items; this.floorC.owner = fresh.owner; }
    out.push({ c: this.floorC, name: 'Floor', kind: 'floor' });
    this.side = out;
    let sel = -1;
    if (this.focusRef) { sel = out.findIndex((e) => e.c.owner === this.focusRef); this.focusRef = ''; }
    if (sel < 0) sel = out.findIndex((e) => this.refOf(e) === this.sideRef);
    if (sel < 0) sel = 0;
    this.sideSel = sel;
    this.sideRef = this.refOf(out[sel]);
  }
  private refOf(e: Entry) { return e.kind === 'pockets' ? 'pockets' : e.kind === 'floor' ? 'floor' : e.c.owner || String(e.c.uid); }
  private syncTray() {
    const e = this.side[this.sideSel];
    this.tray.setContainer(e ? e.c : null);
    this.dressTray();
  }
  /** the container set down for real: a drawer, a crate, a box... the floor itself shows no tray at all */
  private dressTray() {
    const spec = this.tray.spec;
    const [w, d] = this.tray.size();
    const style = spec?.style ?? '';
    const key = style + ':' + w.toFixed(3) + ':' + d.toFixed(3);
    const bare = style === 'floor' || style === 'pile';
    const own = (this.tray as unknown as { shell: THREE.Mesh | null }).shell;
    if (own) own.visible = !bare;
    if (key === this.shellKey) return;
    this.shellKey = key;
    if (this.trayShell) { this.trayShell.parent?.remove(this.trayShell); (this.trayShell as THREE.Mesh).geometry?.dispose?.(); this.trayShell = null; }
    const sh = spec ? containerShell(style, w, d) : null;
    if (sh) { sh.scale.copy(this.tray.root.scale); this.trayHold.add(sh); this.trayShell = sh; }
    this.trayShadow.visible = !bare;
  }

  // ================================================================ frame
  update(dt0: number) {
    const p = G.local;
    if (!p) return;
    void dt0;
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastT) / 1000);
    this.lastT = now;
    this.settleT -= dt;
    if (this.settleT <= 0) { this.settleT = 0.4; try { settlePack(p); } catch (e) { console.warn('settle', e); } }
    if (this.kitT > 0) { this.kitT -= dt; if (this.kitT <= 0) this.ensureKit(p); }
    if (G.input.hit('toolDraw' as any) && !G.input.textFocus && !(G as any).craft?.busy?.()) this.quickDraw();
    (G as any).craft?.update?.();
    if (!this.open) return;
    if (!this.suspended) this.hook();
    // wait for the lids to open on the eyes before the pack comes off the shoulder
    if (this.phase === 'waiting') {
      this.waitT += dt;
      if (eyeActive() || this.waitT > 0.9) { this.phase = 'opening'; this.layout(); this.openSeq(performance.now() - this.lastClose < 30000); }
    }
    this.tw.update(dt);
    if (this.suspended) return;
    this.scanT -= dt;
    if (this.scanT <= 0 && !this.drag) { this.scanT = 0.45; this.scanNearby(); this.dirty = true; }
    if (this.dirty) {
      this.dirty = false;
      const cubeC = this.cubeC();
      if (cubeC !== this.cube.c) this.cube.setContainer(cubeC); else this.cube.refresh();
      const rc = this.rollC();
      if (rc !== this.roll.c) this.roll.setContainer(rc); else this.roll.refresh();
      const e = this.side[this.sideSel];
      if (e?.c !== this.tray.c) this.syncTray(); else { this.tray.refresh(); this.dressTray(); }
      this.layout();
      if (this.phase === 'open') this.setOutK(1);
      this.renderSide(); this.renderWorn();
      if (this.drag) this.retarget(this.lastPX, this.lastPY);
    }
    if (this.phase === 'open') this.yaw = damp(this.yaw, this.yawT, 14, dt);
    if (this.shakeT > 0) this.shakeT -= dt;
    for (const v of this.views) v.update(dt);
    this.dust.update(dt);
    if (this.drag) this.updateGhost(dt);
    this.loadT -= dt;
    if (this.loadT <= 0) { this.loadT = 0.25; this.gauge.set(p.carriedWeight(), p.capacity(), (p as any).packSlow?.() ?? 1); }
    this.gauge.update(dt);
    this.note.update(dt);
    this.placeSide();
  }

  private poseArms(dt: number) {
    const [aR, aL] = this.arms;
    this.world.updateMatrixWorld(true);
    // at rest the hands lie on the open pack's near rim (on the floor beside it while it is still shut)
    for (const h of ['L', 'R'] as const) {
      if (this.held < 0.05 && this.cube.c) this.cube.restPoint(h === 'L' ? -1 : 1, this.palm[h]);
      else this.palm[h].copy(this.rest[h]).applyMatrix4(this.world.matrix);
    }
    for (const [a, h] of [[aL, 'L'], [aR, 'R']] as const) {
      const r = this.reach[h];
      const restAt = this.palm[h];
      let goal = _v.copy(restAt);
      if (r.o && r.w > 0.001) {
        r.o.updateWorldMatrix(true, false);
        const at = _v2.copy(r.at).applyMatrix4(r.o.matrixWorld);
        goal = _v.copy(restAt).lerp(at, Math.min(1, r.w));
      }
      // wrists come in from the floor-side of the target, the hand resting a little above what it holds
      a.target.lerp(goal, 1 - Math.exp(-(this.phase === 'open' ? 16 : 22) * dt));
      // the elbow sits between the shoulder and the hand, bent outward and down
      const sh = _s.set(SHOULDER.x * a.side, SHOULDER.y, SHOULDER.z);
      a.elbow.copy(sh).lerp(a.target, 0.42).add(_v2.set(a.side * 0.07, -0.08, 0.04));
      const holding = h === 'R' ? !!G.local?.handR : !!(G.local?.handL && G.local.handL !== G.local.handR);
      const atRest = !r.o || r.w < 0.3;
      a.want = atRest ? (holding ? 'grip' : 'relaxed') : r.pose;
      // at rest the palms lie flat on the floor (backs up); reaching, they turn as the part wants
      const roll = atRest ? Math.PI * 0.92 : r.roll;
      poseArm(a, roll, dt);
    }
  }

  /** what is held sits in the hand's grip */
  private poseHeld(dt: number) {
    const p = G.local;
    for (const h of ['R', 'L'] as const) {
      const it = h === 'R' ? p.handR : p.handL && p.handL !== p.handR ? p.handL : null;
      const uid = it?.uid ?? 0;
      if (uid !== this.heldKey[h]) {
        this.heldKey[h] = uid;
        const old = this.heldObjs[h];
        if (old) old.outer.parent?.remove(old.outer);
        this.heldObjs[h] = null;
        if (it) { const o = makeItemObj(it.key); fitItemObj(o, 0, 0.12, 0.16, 0.06, 1.2); o.outer.userData.held = h; this.g.add(o.outer); this.heldObjs[h] = o; }
      }
      const o = this.heldObjs[h];
      if (o) {
        o.outer.visible = this.held < 0.5 && this.reach[h].w < 0.3 && !(this.drag?.src === 'hand' && this.drag.hand === h);
        this.arms[h === 'R' ? 0 : 1].fp.grip.getWorldPosition(_v);
        o.outer.position.lerp(_v, 1 - Math.exp(-20 * dt));
        o.outer.rotation.set(0.4, h === 'R' ? -0.6 : 0.6, 0);
      }
    }
  }

  // ================================================================ props
  private renderSide() {
    const sig = this.side.map((e) => e.c.uid + e.name).join('|') + '#' + this.sideSel;
    if (sig === this.sideSig) return;
    this.sideSig = sig;
    this.placeSide(true);
  }
  /** the container tags lie on the floor in front of the container, tied to it */
  private placeSide(force = false) {
    if (!this.tags || (!force && !this.tags.tags.length && !this.side.length)) return;
    const idx = this.side.map((_, i) => i);
    // at most five tags: pockets, the floor, and what is nearest
    const show = idx.length <= 5 ? idx : [0, ...idx.slice(1, -1).slice(0, 3), idx.length - 1];
    if (!show.includes(this.sideSel)) show[show.length - 2] = this.sideSel;
    const names = show.map((i) => ({ name: this.side[i].name, i, n: this.side[i].c.items.length }));
    const wide = fpCamera().aspect >= 1.2;
    const th = this.trayHold.position;
    const [tw, td] = this.tray.size();
    const s = this.tray.root.scale.x;
    const spots: THREE.Vector3[] = [];
    const n = names.length;
    // landscape: a row on the floor just beyond the container; portrait: a column beside it
    for (let k = 0; k < n; k++) {
      if (wide) spots.push(new THREE.Vector3(th.x - (tw * s) / 2 + 0.06 + k * 0.14, 0.004, th.z - (td * s) / 2 - 0.085 - (k % 2) * 0.035));
      else spots.push(new THREE.Vector3(th.x + (tw * s) / 2 + 0.075 + (k % 2) * 0.012, 0.004, th.z - 0.13 + k * 0.072));
    }
    const knot = wide ? new THREE.Vector3(th.x - (tw * s) / 2 * 0.6, 0.03, th.z - (td * s) / 2) : new THREE.Vector3(th.x + (tw * s) / 2, 0.03, th.z - (td * s) / 4);
    this.tags.set(names, this.sideSel, spots, knot);
  }

  private renderWorn() {
    const p = G.local;
    const worn = [...p.worn.values()].filter((it) => it.key !== 'iron_cube' && it.key !== 'tool_roll');
    const sig = worn.map((w) => w.uid).join(',');
    if (sig === this.wornSig) return;
    this.wornSig = sig;
    for (const w of this.wornObjs) this.matG.remove(w.obj.outer);
    this.wornObjs = [];
    worn.slice(0, 6).forEach((it, i) => {
      const o = makeItemObj(it.key);
      fitItemObj(o, 0, 0.07, 0.08, 0.04, 1.2);
      o.outer.position.set(-0.11 + (i % 3) * 0.11, 0.022, -0.03 + Math.floor(i / 3) * 0.075);
      o.outer.userData.worn = it.uid;
      this.matG.add(o.outer);
      this.wornObjs.push({ it, obj: o });
    });
  }
  private placeWorn() { /* the worn things ride on the mat (its group) */ }

  private note_(text: string, bad = false) { this.note?.show(text, bad); }

  // ================================================================ controls / keys
  private control(c: string, x = 0) {
    if (this.phase !== 'open') { this.tw.finish(); return; }
    this.box.flick(c);
    G.audio?.ui?.('cube_relay', 0.3);
    if (c === 'turn') this.rotate(TURN);
    else if (c === 'tip') this.rotate(TIP);
    else if (c === 'roll') this.rotate(ROLL);
    else if (c === 'layer') this.peel(x < 0 ? -1 : 1, true);
    else if (c === 'shake') this.shake();
  }

  private onKey(e: KeyboardEvent) {
    if (!this.open || this.suspended || G.input.textFocus) return;
    if (this.phase === 'opening' || this.phase === 'waiting') { if (e.code !== 'KeyI' && e.code !== 'Escape') { if (this.phase === 'opening') this.tw.finish(); e.stopImmediatePropagation(); e.preventDefault(); return; } }
    const stop = () => { e.stopImmediatePropagation(); e.preventDefault(); };
    if (e.code === 'Escape' || (G.input.bindings.inventory || []).includes(e.code)) { stop(); if (!e.repeat) this.toggle(false); return; }
    if (this.phase !== 'open') { stop(); return; }
    switch (e.code) {
      case 'KeyR': stop(); this.control('turn'); return;
      case 'KeyT': stop(); this.control('tip'); return;
      case 'KeyY': stop(); this.control('roll'); return;
      case 'PageUp': case 'BracketRight': stop(); this.peel(1); return;
      case 'PageDown': case 'BracketLeft': stop(); this.peel(-1); return;
    }
    const mv = ['up', 'down', 'left', 'right'] as const;
    if (!this.drag && mv.some((a) => (G.input.bindings[a] || []).includes(e.code))) this.toggle(false);
  }

  /** turn what you're holding, or the selected item where it lies */
  private rotate(order: readonly Rot[]) {
    const d = this.drag;
    G.audio?.ui?.('bag_rot', 0.35);
    if (d) { d.rot = order[d.rot] ?? 0; this.retarget(this.lastPX, this.lastPY); return; }
    const s = this.sel;
    if (!s || !s.view.c || s.it.gx === undefined || s.it.gy === undefined) return;
    const c = s.view.c, it = s.it;
    if (isWorldContainer(c) || c.kind === 'floor' || !c.items.includes(it)) return;
    const occ = containerOcc(c, new Set([it]));
    if (!occ) return;
    const rot = order[(it.rot ?? 0) as Rot] as Rot;
    if (occ.spec.d > 1) {
      const ds = dropSpot(occ, it, it.gx, it.gy, rot);
      if (!ds || ds.fit === 'blocked') { this.bad(); return; }
      setPlace(it, { gx: it.gx, gy: it.gy, gz: ds.gz, rot });
      settleGravity(c);
    } else {
      if (rot > 1 || testFit(occ, it, it.gx, it.gy, rot) === 'blocked') { this.bad(); return; }
      setPlace(it, { gx: it.gx, gy: it.gy, rot });
    }
    bus.emit('inventoryChanged', G.local);
  }

  private peel(dir: number, wrap = false) {
    const spec = this.cube.spec;
    if (!spec) return;
    const cur = Math.min(this.cube.peel, spec.d);
    let n = cur + dir;
    if (wrap && n < 1) n = spec.d;
    n = Math.max(1, Math.min(spec.d, n));
    if (n === cur) return;
    this.cube.peel = n >= spec.d ? 99 : n;
    this.cube.applyPeel();
    this.box.setLayer(n);
    G.audio?.ui?.('bag_rot', 0.3);
  }

  shake(c?: Container) {
    if (this.drag) return;
    const p = G.local;
    const target = c || this.cube.c;
    if (!target) return;
    if (isWorldContainer(target)) op('gridPack', { z: G.zone.key, ref: containerRef(target) });
    else { autoPack(target); settleGravity(target); bus.emit('inventoryChanged', p); }
    this.shakeT = 0.45;
    G.audio?.ui?.('bag_shake', 0.7);
    this.dirty = true;
  }

  // ================================================================ pointer
  /** what is under the pointer: an item, a held thing, a worn thing, a control, a tag, the flap */
  private hitAt(x: number, y: number): Hit | null {
    pointerRay(this.rc, fpCamera(), x, y);
    let best: Hit | null = null, bd = Infinity;
    const consider = (h: Hit, d: number) => { if (d < bd) { bd = d; best = h; } };
    for (const v of this.views) { const h = v.pickAt(this.rc); if (h) consider({ kind: 'item', view: v, items: h.a.items }, h.dist); }
    const objs: THREE.Object3D[] = [...this.box.ctl, ...this.tags.meshes(), ...this.wornObjs.map((w) => w.obj.outer), this.cube.lid];
    for (const h of ['R', 'L'] as const) { const o = this.heldObjs[h]; if (o?.outer.visible) objs.push(o.outer); }
    for (const it of this.rc.intersectObjects(objs, true)) {
      let o: THREE.Object3D | null = it.object;
      while (o) {
        const u = o.userData;
        if (u.ctl) { _v.copy(it.point); o.worldToLocal(_v); consider({ kind: 'ctl', ctl: u.ctl, obj: o, x: _v.x }, it.distance - 0.02); break; }
        if (u.side !== undefined) { consider({ kind: 'side', i: u.side }, it.distance - 0.01); break; }
        if (u.worn !== undefined) { const w = this.wornObjs.find((q) => q.it.uid === u.worn); if (w) consider({ kind: 'worn', it: w.it }, it.distance); break; }
        if (u.held) { const p = G.local; const hi = u.held === 'R' ? p.handR : p.handL; if (hi) consider({ kind: 'held', hand: u.held, it: hi }, it.distance); break; }
        if (o === this.cube.lid) { consider({ kind: 'lid' }, it.distance + 0.05); break; }
        o = o.parent;
      }
    }
    return best;
  }

  private onDown(e: PointerEvent) {
    if (!this.open || this.suspended) return;
    if (this.phase === 'opening') { this.tw.finish(); return; }
    if (this.phase !== 'open' || this.drag) return;
    if (e.button === 1 || e.button === 2) return;
    const touch = e.pointerType !== 'mouse';
    const hit = this.hitAt(e.clientX, e.clientY);
    const pr: Press = { pointerId: e.pointerId, x0: e.clientX, y0: e.clientY, t: performance.now(), touch, hit, long: 0, done: false, shift: e.shiftKey || e.ctrlKey };
    this.press = pr;
    if (!hit) { this.orbit = { id: e.pointerId, x: e.clientX, y: e.clientY }; return; }
    if (hit.kind === 'item') pr.long = window.setTimeout(() => { if (this.press === pr && !pr.done) { pr.done = true; this.press = null; this.inspect(hit.items[0], hit.view.c!); } }, LONG_MS);
  }

  private cancelPress() { if (this.press) clearTimeout(this.press.long); this.press = null; this.orbit = null; }

  private onMove(e: PointerEvent) {
    if (!this.open || this.suspended) return;
    this.lastPX = e.clientX; this.lastPY = e.clientY;
    const pr = this.press;
    if (pr && pr.pointerId === e.pointerId && !pr.done && pr.hit) {
      const moved = Math.hypot(e.clientX - pr.x0, e.clientY - pr.y0) > (pr.touch ? 10 : 5);
      if (moved) {
        clearTimeout(pr.long);
        const h = pr.hit;
        const p = G.local;
        if (h.kind === 'item') { pr.done = true; this.press = null; this.startDrag(h.items, h.view.c!, 'grid', e); }
        else if (h.kind === 'held') { pr.done = true; this.press = null; this.startDrag([h.it], p.containerOf(h.it) || p.inv, 'hand', e, h.hand); }
        else if (h.kind === 'worn') { pr.done = true; this.press = null; this.startDrag([h.it], p.containerOf(h.it) || p.inv, 'worn', e); }
      }
    }
    if (this.orbit && this.orbit.id === e.pointerId && !this.drag) {
      // drag the floor: turn the pack where it lies, lean in over it or sit back
      const dx = e.clientX - this.orbit.x, dy = e.clientY - this.orbit.y;
      this.orbit.x = e.clientX; this.orbit.y = e.clientY;
      this.yawT = Math.max(-1.3, Math.min(1.3, this.yawT + dx * 0.008));
      this.pitchT = Math.max(40, Math.min(74, this.pitchT + dy * 0.12));
      return;
    }
    if (this.drag && this.drag.pointerId === e.pointerId) { e.preventDefault(); this.retarget(e.clientX, e.clientY); return; }
    if (!this.drag && !this.press && e.pointerType === 'mouse') this.hover(e.clientX, e.clientY);
  }

  private onUp(e: PointerEvent, cancel: boolean) {
    if (!this.open) return;
    if (this.orbit && this.orbit.id === e.pointerId) this.orbit = null;
    const d = this.drag;
    if (d && d.pointerId === e.pointerId) { if (cancel) this.cancelDrag(); else this.commit(d.over); return; }
    const pr = this.press;
    if (!pr || pr.pointerId !== e.pointerId) return;
    clearTimeout(pr.long);
    this.press = null;
    if (pr.done || cancel || !pr.hit) return;
    const h = pr.hit;
    if (h.kind === 'ctl') { this.control(h.ctl, h.x); return; }
    if (h.kind === 'side') { this.sideSel = h.i; this.sideRef = this.refOf(this.side[h.i]); this.sideSig = ''; this.syncTray(); this.layout(); this.renderSide(); G.audio?.ui?.('bag_rot', 0.3); return; }
    if (h.kind === 'lid') { this.toggle(false); return; }
    if (h.kind !== 'item') return;
    const it = h.items[0];
    const now = performance.now();
    if (pr.shift) { this.quickMove(h.items, h.view.c!); return; }
    if (this.lastTap.uid === it.uid && now - this.lastTap.t < 360) { this.lastTap.uid = 0; this.inspect(it, h.view.c!); return; }
    this.lastTap = { uid: it.uid, t: now };
    this.sel = { it, view: h.view };
    for (const v of this.views) v.setHover(v === h.view ? it : null);
    if (pr.touch) this.showTag(h);
  }

  private onContext(e: MouseEvent) {
    if (!this.open || this.phase !== 'open') return;
    if (this.drag) { this.control('turn'); return; }
    const h = this.hitAt(e.clientX, e.clientY);
    if (h?.kind === 'item') this.inspect(h.items[0], h.view.c!);
    else if (h?.kind === 'held' || h?.kind === 'worn') { const p = G.local; this.inspect(h.it, p.containerOf(h.it) || p.inv); }
  }

  private onWheel(e: WheelEvent) {
    if (!this.open || this.phase !== 'open') return;
    e.preventDefault();
    const d = this.drag;
    if (d && d.stack.length > 1) { d.count = Math.max(1, Math.min(d.stack.length, d.count + (e.deltaY < 0 ? 1 : -1))); this.retarget(this.lastPX, this.lastPY); this.note_('x' + d.count); return; }
    this.peel(e.deltaY < 0 ? 1 : -1);
  }

  private hover(x: number, y: number) {
    const h = this.hitAt(x, y);
    for (const v of this.views) v.setHover(h?.kind === 'item' && h.view === v ? h.items[0] : this.sel?.view === v ? this.sel.it : null);
    if (h) this.showTag(h); else this.gtag.hide();
  }

  /** the luggage tag tied to what you point at, lying on the rim (things in the pack) or the floor beside it */
  private showTag(h: Hit) {
    const W = this.world;
    W.updateMatrixWorld(true);
    const toW = (v: THREE.Vector3) => W.worldToLocal(v);
    if (h.kind === 'item') {
      if (!h.view.itemWorldPos(h.items[0], _v)) return;
      const rest = new THREE.Vector3();
      this.gtag.lean = 0.45;
      if (h.view === this.cube) {
        // on the floor beside the pack, on the item's side, tied back to it over the wall
        const lp = this.cube.root.worldToLocal(_v2.copy(_v));
        const side = lp.x >= 0 ? 1 : -1, sz = this.cube.size;
        this.cube.root.localToWorld(rest.set(side * (sz.x / 2 + 0.13), 0.004, Math.max(-sz.z / 2 + 0.08, Math.min(sz.z / 2 - 0.04, lp.z))));
      } else rest.copy(_v);
      toW(_v); toW(rest);
      if (h.view !== this.cube) { rest.y = 0.006; rest.z += 0.13; rest.x += rest.x > 0 ? -0.05 : 0.05; } else rest.y = 0.004;
      this.gtag.item(h.items[0], h.items.length, _v.clone(), rest);
      return;
    }
    if (h.kind === 'held' || h.kind === 'worn') {
      const o = h.kind === 'held' ? this.heldObjs[h.hand] : this.wornObjs.find((w) => w.it === h.it)?.obj;
      if (o) { this.gtag.lean = 0.4; o.outer.getWorldPosition(_v); toW(_v); this.gtag.item(h.it, 1, _v.clone(), _v.clone().add(_v2.set(0.02, 0.004 - _v.y, 0.12))); }
      return;
    }
    if (h.kind === 'lid') {
      // on the floor by the flap's hinge corner, tied to the flap's edge
      const sz = this.cube.size, rest = new THREE.Vector3();
      this.gtag.lean = 0.45;
      this.cube.flapEdge(_v); toW(_v);
      this.cube.root.localToWorld(rest.set(sz.x / 2 + 0.13, 0.004, -sz.z / 2 + 0.07)); toW(rest); rest.y = 0.004;
      this.gtag.text(['THE FLAP', 'TAP: CLOSE THE PACK'], _v.clone(), rest);
      return;
    }
    this.gtag.hide();
  }

  // ================================================================ drag
  private startDrag(stack: Item[], from: Container, src: Drag['src'], e: PointerEvent, hand?: 'R' | 'L') {
    const it = stack[0];
    const count = e.shiftKey && stack.length > 1 ? Math.ceil(stack.length / 2) : e.ctrlKey ? 1 : stack.length;
    const ghost = makeItemObj(it.key, ghostNone);
    const edges = boxEdges(0xf0e8d0, 0.9);
    this.g.add(ghost.outer, edges);
    const rot = (src === 'grid' && it.rot ? it.rot : 0) as Rot;
    this.drag = { stack, count, from, src, hand, rot, pointerId: e.pointerId, over: { k: 'none' }, ghost, edges };
    for (const v of this.views) { for (const i of stack.slice(0, count)) v.hidden.add(i); v.refresh(); }
    this.gtag.hide();
    this.sel = null;
    G.audio?.itemSound?.(it.key, 'pick', G.local);
    this.retarget(e.clientX, e.clientY);
  }

  private cancelDrag() {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    d.ghost.outer.parent?.remove(d.ghost.outer); d.edges.parent?.remove(d.edges);
    for (const v of this.views) { v.hidden.clear(); v.refresh(); }
    this.tags?.highlight(null);
  }

  private screenDist(w: THREE.Vector3, x: number, y: number) {
    _s.copy(w).project(fpCamera());
    return Math.hypot(((_s.x + 1) / 2) * window.innerWidth - x, ((1 - _s.y) / 2) * window.innerHeight - y);
  }

  private retarget(x: number, y: number) {
    const d = this.drag;
    if (!d) return;
    const it = d.stack[0];
    const def = itemDef(it.key);
    let t: Target = { k: 'none' };
    const ray = pointerRay(this.rc, fpCamera(), x, y);
    const reach = Math.min(window.innerWidth, window.innerHeight) * 0.09;
    for (const h of ['R', 'L'] as const) if (this.screenDist(this.palm[h], x, y) < reach) t = { k: 'hand', hand: h, ok: d.count === 1 };
    if (t.k === 'none') {
      this.matG.getWorldPosition(_v);
      if (this.screenDist(_v, x, y) < reach * 1.3) t = { k: 'wear', ok: !!(def.clothing || def.bag) && d.src !== 'worn' };
    }
    if (t.k === 'none') {
      const hits = this.rc.intersectObjects(this.tags.meshes(), false);
      const s = hits[0] ? this.tags.tagOf(hits[0].object) : null;
      const e = s ? this.side[s.i] : null;
      if (e) t = { k: 'tab', c: e.c, ok: e.c !== d.from && (e.c.kind === 'floor' || e.c.hasRoom(it)) };
    }
    if (t.k === 'none') {
      for (const v of [this.cube, this.roll, this.tray]) { const r = v.targetAt(ray, it, d.rot, d.count); if (r) { t = { k: 'grid', d: r }; break; } }
    }
    if (t.k === 'none') {
      // the bare floor: leave it there
      this.world.updateMatrixWorld(true);
      const inv = new THREE.Matrix4().copy(this.world.matrixWorld).invert();
      const r = ray.clone().applyMatrix4(inv);
      if (Math.abs(r.direction.y) > 1e-4) { const tt = -r.origin.y / r.direction.y; if (tt > 0) t = { k: 'floor', at: r.at(tt, new THREE.Vector3()) }; }
    }
    this.tags.highlight(t.k === 'tab' ? this.side.findIndex((e) => e.c === (t as { c: Container }).c) : null);
    d.over = t;
  }

  private updateGhost(dt: number) {
    const d = this.drag!;
    const o = d.ghost.outer;
    const t = d.over;
    const reparent = (to: THREE.Object3D) => {
      if (o.parent === to) return;
      o.getWorldPosition(_v);
      to.add(o); to.add(d.edges);
      to.updateWorldMatrix(true, false);
      o.position.copy(to.worldToLocal(_v));
    };
    const tint = (m: THREE.Material) => { if (d.ghost.mesh && d.ghost.mesh.material !== m) d.ghost.mesh.material = m; };
    if (t.k === 'grid') {
      const v = t.d.view;
      reparent(v.space);
      v.boxAt(t.d.at, t.d.ex, t.d.ey, t.d.ez, _v2, _s);
      o.position.lerp(_v2, 1 - Math.exp(-28 * dt));
      fitItemObj(d.ghost, t.d.at.rot, _s.x, _s.z, _s.y);
      d.edges.position.copy(_v2); d.edges.scale.copy(_s);
      const ok = t.d.fit !== 'blocked';
      tint(ok ? ghostOk : ghostBad);
      (d.edges.material as THREE.LineBasicMaterial).color.setHex(ok ? 0x9ae890 : 0xd84a32);
      d.edges.visible = true;
    } else if (t.k === 'floor') {
      reparent(this.world);
      o.position.lerp(_v2.copy(t.at).setY(0.04), 1 - Math.exp(-28 * dt));
      fitItemObj(d.ghost, d.rot, 0.12, 0.12, 0.08, 1);
      tint(ghostNone);
      d.edges.visible = false;
    } else {
      reparent(this.g);
      pointerRay(this.rc, fpCamera(), this.lastPX, this.lastPY).at(0.62, _v2);
      o.position.lerp(_v2, 1 - Math.exp(-28 * dt));
      fitItemObj(d.ghost, d.rot, 0.08, 0.08, 0.08, 0.9);
      tint(t.k === 'none' ? ghostNone : 'ok' in t && t.ok ? ghostOk : ghostBad);
      d.edges.visible = false;
    }
  }

  private commit(t: Target) {
    const d = this.drag;
    if (!d) return;
    const p = G.local;
    const items = d.stack.slice(0, d.count);
    const it = items[0];
    const from = d.from;
    this.cancelDrag();
    const world = (c: Container) => isWorldContainer(c) || c.kind === 'floor';
    const release = () => {
      if (d.src === 'worn') { p.actions.add(new WearAction(p, it, true)); return true; }
      if (d.src === 'hand') { p.equip(null, d.hand); if (p.handR === it || p.handL === it) p.equip(null, d.hand === 'R' ? 'L' : 'R'); bus.emit('inventoryChanged', p); }
      return false;
    };
    switch (t.k) {
      case 'grid': {
        if (t.d.fit === 'blocked') { this.bad(); return; }
        const to = t.d.c;
        const at: Placement = { ...t.d.at };
        if (to.kind === 'floor') { if (from.kind === 'floor') return; release(); queueTransfers(p, items, from, to); this.thunk(it, to); return; }
        if (to === from && d.src === 'grid') {
          if (world(to)) op('gridPlace', { z: G.zone.key, ref: containerRef(to), uids: items.map((i) => i.uid), gx: at.gx, gy: at.gy, rot: at.rot, ...(at.gz ? { gz: at.gz } : {}) });
          else { for (const i of items) setPlace(i, at); settleGravity(to); bus.emit('inventoryChanged', p); }
          this.thunk(it, to);
          this.dirty = true;
          return;
        }
        const queued = release();
        if (!world(from) && !world(to) && !queued) {
          for (const i of items) { const res = resolveTarget(p, i, from, to, at); if (res) transferItem(p, i, from, res.c, res.at); else { this.bad(); break; } }
          settleGravity(from);
          this.thunk(it, to);
        } else queueTransfers(p, items, queued ? p.inv : from, to, at);
        this.dirty = true;
        return;
      }
      case 'hand': {
        if (!t.ok) { this.bad(); return; }
        if (d.src === 'hand' && d.hand === t.hand) return;
        if (world(from)) queueTransfers(p, [it], from, p.inv);
        if (d.src === 'worn') p.actions.add(new WearAction(p, it, true));
        p.actions.add(new EquipAction(p, it, t.hand));
        G.audio?.itemSound?.(it.key, 'equip', p);
        return;
      }
      case 'wear': {
        if (!t.ok) { this.bad(); return; }
        if (world(from)) queueTransfers(p, [it], from, p.inv);
        p.actions.add(new WearAction(p, it));
        return;
      }
      case 'tab': {
        if (!t.ok) { this.bad(); return; }
        const queued = release();
        if (!world(from) && !world(t.c) && !queued) { for (const i of items) { const res = resolveTarget(p, i, from, t.c, null); if (res) transferItem(p, i, from, res.c, res.at); } this.thunk(it, t.c); }
        else queueTransfers(p, items, queued ? p.inv : from, t.c);
        return;
      }
      case 'floor': {
        const queued = release();
        if (from.kind === 'floor') return;
        queueTransfers(p, items, queued ? p.inv : from, floorContainer(G.zone, p.x, p.z));
        G.audio?.itemSound?.(it.key, 'drop', p);
        return;
      }
      default: return;
    }
  }

  /** shift / ctrl-click: to the other side */
  private quickMove(stack: Item[], from: Container) {
    const p = G.local;
    if (isWorldContainer(from) || from.kind === 'floor') { queueTransfers(p, stack, from, p.inv); return; }
    const side = this.side[this.sideSel];
    if (side && side.kind === 'loot' && !side.c.locked) { queueTransfers(p, stack, from, side.c); return; }
    const cube = this.cube.c;
    const to = from === cube ? (side && side.c !== cube ? side.c : p.inv) : cube || p.inv;
    if (to.kind === 'floor') { queueTransfers(p, stack, from, to); return; }
    let moved = false;
    for (const i of stack) { const res = resolveTarget(p, i, from, to, null); if (res && res.c !== from) { transferItem(p, i, from, res.c, res.at); moved = true; } }
    settleGravity(from);
    if (moved) this.thunk(stack[0], to); else this.bad();
  }

  private thunk(it: Item, to: Container) {
    G.audio?.ui?.(to === this.cube.c ? 'cube_place' : 'bag_place', 0.5);
    G.audio?.itemSound?.(it.key, 'drop', G.local);
    if (to === this.cube.c) { this.shakeT = Math.max(this.shakeT, 0.08 + Math.min(0.2, itemWeight(it) * 0.04)); G.missions?.set?.('pack:packed'); }
    if (to === this.roll.c) G.missions?.set?.('pack:toolroll');
    this.dirty = true;
  }
  private bad() { G.audio?.ui?.('bag_bad', 0.5); this.note_("won't go there", true); }

  private inspect(it: Item, c: Container) {
    this.cancelDrag(); this.gtag.hide();
    (G as any).craft?.inspect?.(it, c);
  }

  // ================================================================ kit & quick draw
  /** saves from before the field pack, or kits without one: strap the pack on and hang the tool roll */
  private ensureKit(p: any) {
    if (!p || p.body?.dead || !p.inv) return;
    try {
      const back = p.worn.get('back');
      if (!back || back.key !== 'iron_cube') {
        const cube = createItem('iron_cube', undefined, { pristine: true });
        p.inv.add(cube);
        if (back) {
          p.unwear(back);
          if (back.inv) for (const i of [...back.inv.items]) { back.inv.remove(i); setPlace(i, null); cube.inv!.add(i); }
          p.inv.remove(back); setPlace(back, null); cube.inv!.add(back);
        }
        p.wear(cube);
      }
      if (!p.worn.get('belt')) {
        const roll = createItem('tool_roll', undefined, { pristine: true });
        p.inv.add(roll); p.wear(roll);
      }
      bus.emit('inventoryChanged', p);
    } catch (e) { console.warn('pack kit', e); }
  }

  /** ` / Y: draw the holstered tool into the right hand, or holster what you hold */
  quickDraw() {
    const p = G.local;
    if (!p || p.body.dead) return;
    const roll = this.rollC();
    if (!roll) { bus.emit('think', p, 'No tool roll on my hip.'); return; }
    const hx = TOOL_ROLL_LOOPS;
    const inHolster = roll.items.find((i) => i.gx === hx && !isEquipped(i)) || null;
    const held = p.handR;
    if (held && !inHolster && isToolDef(itemDef(held.key))) {
      p.equip(null, 'R'); if (p.handL === held) p.equip(null, 'L');
      transferItem(p, held, p.containerOf(held) || p.inv, roll, { gx: hx, gy: 0, rot: 0 });
      G.audio?.itemSound?.(held.key, 'drop', p);
      bus.emit('halo', p, 'holstered: ' + itemName(held).toLowerCase(), 'info');
      G.missions?.set?.('pack:holster');
      return;
    }
    if (!inHolster) { bus.emit('think', p, 'The holster is empty.'); return; }
    if (held) {
      p.equip(null, 'R'); if (p.handL === held) p.equip(null, 'L');
      const b = bestDest(p, held);
      if (b) transferItem(p, held, p.containerOf(held) || p.inv, b.c, b.at);
    }
    transferItem(p, inHolster, roll, p.inv, null);
    p.equip(inHolster, 'R');
    bus.emit('inventoryChanged', p);
    G.audio?.itemSound?.(inHolster.key, 'equip', p);
    bus.emit('halo', p, itemName(inHolster).toLowerCase(), 'info');
    G.missions?.set?.('pack:holster');
  }
}
