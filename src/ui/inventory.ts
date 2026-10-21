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
import { CubeView, CELL } from '../craft/cubeView';
import { TrayView } from '../craft/trayView';
import type { GridView3, DropAt } from '../craft/gridView3';
import { Tweens, easeOut, easeBack, easeInOut, makeArm, poseArm, type Arm, makeBackdrop, makeItemObj, fitItemObj, type ItemObj, boxEdges, pointerRay, damp, fpMat } from '../craft/fpKit';
import { registerCraftSounds } from '../craft/craftSounds';
import { craftSystem } from '../craft/craft';
import { pixTag, stamp, disposeTag, type PixTag } from '../craft/tags';
import { metalMat } from '../craft/metal';
import { Dymo, HoverTag, Gauge, ControlBox } from '../craft/props';
import { ModelBuilder } from '../gfx/modelBuilder';
import { debtorNo } from './holo/holo';
import { kick } from '../gfx/juice';
import { registerBagSounds } from './bag/bagSounds';

/**
 * The backpack is an iron cube. Opening it (I, or the rucksack on touch)
 * goes first-person: your arms swing the Remittance cube round off your
 * back and up to your face, your thumb goes on the reader (the green phosphor
 * line sweeps, the relays clack, the bolts snap back), you set it down on the
 * carpet and the lid swings open on a 5x5x5 grid of cells: stamped steel
 * dividers on the floor, chalk up the walls. Everything you carry takes its
 * real 3D size; drag it in and it drops to rest on the floor of the box or on
 * what is under it (a green ghost fits, a red one doesn't). R / T / Y, or the
 * toggles on the bakelite control box, turn, tip and roll it; the knob (or
 * the wheel) peels layers off the top; the red button shakes everything
 * tight. Drag the carpet to turn the cube and lean in. The tool roll lies on
 * the left (six loops and the brass quick-draw holster, drawn with ` or Y
 * outside the pack); whatever you are looting, your pockets, other bags and
 * the floor lie on the right as a tray, chosen by the tags on the wire behind
 * it. Your open hands rest at the bottom: put something in a palm to hold it.
 * The hook board holds what you wear: hang clothes on it to put them on, pull
 * them off to take them off. Drop on the bare carpet to leave it on the floor.
 * Double-click (long-press, right-click) an item to inspect it close up and
 * work on it (src/craft). A spring scale reads the load; the heavier and
 * fuller the cube, the slower you walk. Tap the lid to shut it.
 *
 * Nothing here is DOM but an invisible pointer catcher: every readout is a
 * pixel-art tag, plate, dial or label on a 3D object.
 *
 * World containers rearrange through ops, so co-op looters see the same
 * layout; your own cube is yours and is saved with you.
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

const LONG_MS = 480;
const ghostOk = new THREE.MeshBasicMaterial({ color: 0x9ae890, transparent: true, opacity: 0.55, depthWrite: false });
const ghostBad = new THREE.MeshBasicMaterial({ color: 0xd84a32, transparent: true, opacity: 0.6, depthWrite: false });
const ghostNone = new THREE.MeshBasicMaterial({ color: 0xe8e0c8, transparent: true, opacity: 0.7, depthWrite: false });
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _s = new THREE.Vector3();
const TILT = 0.92;

export class InventoryUI {
  open = false;
  ui: UI;
  root: HTMLDivElement;
  private suspended = false;
  private built = false;
  private g!: THREE.Group;
  /** the carpet in front of you, tilted toward your eyes: the cube, roll and tray sit on it */
  private floor = new THREE.Group();
  private ground!: THREE.Mesh;
  private cubeSpin = new THREE.Group();
  private cube = new CubeView();
  private roll = new TrayView();
  private tray = new TrayView();
  private rollHold = new THREE.Group();
  private trayHold = new THREE.Group();
  private views: GridView3[] = [];
  private arms: Arm[] = [];
  private backdrop!: THREE.Mesh;
  private tw = new Tweens();
  private phase: 'off' | 'opening' | 'open' | 'closing' = 'off';
  private lastClose = -1e9;
  /** cube held up to the face (1) or set down on the carpet (0) */
  private held = 1;
  private yaw = 0; private yawT = 0; private tilt = TILT; private tiltT = TILT;
  private shakeT = 0;
  private thumb = 0;
  // props
  private gauge = new Gauge();
  private box = new ControlBox();
  private dymo!: Dymo;
  private hoverTag!: HoverTag;
  private rail = new THREE.Group();
  private sideTags: { t: PixTag; e: Entry }[] = [];
  private wornBoard = new THREE.Group();

  private wornObjs: { it: Item; obj: ItemObj }[] = [];
  private palm = { R: new THREE.Vector3(), L: new THREE.Vector3() };
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
    bus.on('gridNoRoom', (it: Item) => { if (this.open) this.note('no room: ' + itemName(it), true); });
    bus.on('gridOverflow', (it: Item, where: string) => { if (this.open) this.note((where === 'hand' ? 'in hand: ' : 'dropped: ') + itemName(it), true); });
    bus.on('fpLost', (name: string) => { if (name === 'pack' && this.open) this.suspend(); });
    bus.on('fpChange', (name: string | null) => { if (name === null && this.open && this.suspended) setTimeout(() => this.resume(), 0); });
    // while the cube is out you are not walking anywhere
    const ui0 = ui as any;
    const orig = ui0.blocksMovement?.bind(ui0);
    if (orig) ui0.blocksMovement = () => orig() || (this.open && !this.suspended) || !!(G as any).craft?.busy?.();
    (G as any).pack = this;
    // hands-on crafting rides along with the pack (G.craft: inspect, workbench)
    try { (G as any).craft = craftSystem(); } catch (e) { console.warn('craft', e); }
  }

  // ================================================================ 3D scene
  private build() {
    if (this.built) return;
    this.built = true;
    const g = (this.g = fpGroup('pack'));
    this.backdrop = makeBackdrop();
    g.add(this.backdrop);
    g.add(new THREE.AmbientLight(0xd8ccb8, 0.55));
    const key = new THREE.DirectionalLight(0xffe2b8, 1.15); key.position.set(-0.5, 1.4, 0.7); g.add(key);
    const fill = new THREE.DirectionalLight(0x8a9aa8, 0.3); fill.position.set(0.8, -0.2, 0.4); g.add(fill);
    // the carpet
    const mb = new ModelBuilder();
    mb.box(0, -0.012, 0, 3.2, 0.01, 2.0, 'carpet_yellow', { color: 0xc8b878, uvScale: 1.5 });
    for (const [x, z, s] of [[-0.35, 0.3, 0.2], [0.9, -0.4, 0.3], [-1.1, -0.2, 0.25]] as [number, number, number][]) mb.box(x, -0.0015, z, s, 0.001, s * 0.7, 'carpet_wet', { color: 0x8a7a48 });
    this.ground = new THREE.Mesh(mb.build(), fpMat());
    this.floor.add(this.ground);
    g.add(this.floor);
    this.floor.add(this.cubeSpin, this.rollHold, this.trayHold);
    this.cubeSpin.add(this.cube.root);
    this.rollHold.add(this.roll.root);
    this.trayHold.add(this.tray.root);
    this.views = [this.cube, this.roll, this.tray];
    // the brass rod down the right edge the container tags hang from
    const wb = new ModelBuilder();
    wb.setFaceShading(false);
    wb.cylinder(0, -0.36, 0, 0.004, 0.38, 6, 'metal_brass');
    for (let i = 0; i < 5; i++) { wb.push().translate(0, -0.02 - i * 0.07, 0).rotateZ(Math.PI / 2); wb.cylinder(0, 0, 0, 0.0022, 0.022, 5, 'metal_brass'); wb.pop(); }
    this.rail.add(new THREE.Mesh(wb.build(), metalMat('brass', 4)));

    // the hook board for what you wear
    const hb = new ModelBuilder();
    hb.box(0, -0.03, 0, 0.26, 0.06, 0.014, 'wood_dark', { color: 0x8a6038 });
    for (let i = 0; i < 6; i++) { hb.push().translate(-0.105 + i * 0.042, 0.01, 0.008).rotateX(Math.PI / 2); hb.cylinder(0, 0, 0, 0.003, 0.018, 5, 'metal_brass', { color: 0xc8a050 }); hb.pop(); }
    this.wornBoard.add(new THREE.Mesh(hb.build(), fpMat()));
    const wl = pixTag('tag', 40, 18, 0.07); wl.clear(); wl.type('WORN', 8, 8); wl.flush();
    wl.mesh.position.set(0.11, -0.055, 0.01); wl.mesh.rotation.z = -0.15;
    this.wornBoard.add(wl.mesh);
    g.add(this.wornBoard, this.box.g, this.gauge.g, this.rail);
    this.dymo = new Dymo(g);
    this.hoverTag = new HoverTag(g);
    for (const s of [1, -1] as const) { const a = makeArm(s); g.add(a.root); this.arms.push(a); }
  }

  /** where things sit on screen for this aspect */
  private layout() {
    const asp = window.innerWidth / Math.max(1, window.innerHeight);
    const cam = fpCamera();
    const D = 1.05;
    const halfH = Math.tan((cam.fov * Math.PI) / 360) * D, halfW = halfH * asp;
    const wide = asp >= 1.2;
    const k = wide ? 1 : Math.max(0.55, asp / 1.2);
    this.floor.position.set(0, wide ? -0.3 : -0.16, wide ? -2.05 : -2.3);
    this.cubeSpin.position.set(0, 0, -0.06);
    const sideX = wide ? Math.min(0.6, 0.42 + (asp - 1.2) * 0.3) : 0.34;
    const sideZ = wide ? -0.22 : 0.42;
    this.rollHold.position.set(-sideX, 0.002, sideZ + 0.02); this.rollHold.rotation.set(0, wide ? 0.3 : 0.1, 0);
    this.trayHold.position.set(sideX, 0.002, sideZ); this.trayHold.rotation.set(0, wide ? -0.3 : -0.1, 0);
    this.fitSide(this.roll, this.rollHold, wide ? 0.4 : 0.3, 0.3);
    this.fitSide(this.tray, this.trayHold, wide ? 0.46 : 0.34, 0.42);
    this.rail.position.set(halfW - 0.035 * k, halfH * 0.92, -D); this.rail.scale.setScalar(k);

    // camera-space props along the bottom and top
    this.palm.L.set(-halfW * 0.78, -halfH * 0.72, -D);
    this.palm.R.set(halfW * 0.78, -halfH * 0.72, -D);
    this.wornBoard.position.set(-halfW * 0.36, -halfH * 0.8, -D); this.wornBoard.rotation.set(-0.25, 0.1, 0); this.wornBoard.scale.setScalar(k);
    this.box.g.position.set(halfW * 0.34, -halfH * 0.84, -D); this.box.g.rotation.set(0.62, -0.08, 0); this.box.g.scale.setScalar(k * 1.25);
    this.gauge.g.position.set(-halfW + 0.11 * k, halfH - 0.11 * k, -D); this.gauge.g.scale.setScalar(k);
    this.dymo.place(halfH - 0.05, -D + 0.01);
  }
  private fitSide(v: TrayView, hold: THREE.Group, maxW: number, maxD: number) {
    const [w, d] = v.size();
    hold.scale.setScalar(Math.min(1.3, maxW / Math.max(0.05, w), maxD / Math.max(0.05, d)));
  }

  // ================================================================ open / close
  toggle(v?: boolean) {
    const want = v ?? !(this.open && !this.suspended);
    if (want && this.open && this.suspended) { this.resume(); return; }
    if (want === this.open) return;
    if (want) this.show(); else this.hide();
  }

  /** open and show a specific world container in the tray */
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
    if (!p) return;
    this.build();
    if (!fpClaim('pack', 1, { cinematic: 'full' })) return;
    this.open = true; this.suspended = false;
    this.phase = 'opening';
    this.root.classList.add('on');
    G.hudBody?.setHidden?.('pack', true);
    G.input.pointerOverUI = true;
    this.scanNearby(); this.dirty = true;
    this.cube.setContainer(this.cubeC());
    this.roll.setContainer(this.rollC());
    this.syncTray();
    this.layout();
    this.cube.setPlate(debtorNo(p) || '----');
    this.cube.peel = 99; this.cube.applyPeel(); this.box.setLayer(5);
    this.yaw = this.yawT = 0; this.tilt = this.tiltT = TILT;
    this.floor.rotation.x = this.tilt;
    this.sideSig = ''; this.wornSig = '';
    this.renderSide(); this.renderWorn();
    this.openSeq(performance.now() - this.lastClose < 30000);
  }

  private hide() {
    this.cancelDrag(); this.cancelPress(); this.hoverTag.hide();
    this.phase = 'closing';
    this.tw.finish();
    const hasCube = !!this.cube.c;
    G.audio?.ui?.(hasCube ? 'cube_shut' : 'bag_zip', 0.5);
    this.tw.add(0.18, (k) => { this.cube.setLid(1 - k); this.cube.setInside(1 - k); }, easeInOut);
    this.tw.add(0.12, (k) => this.cube.setBolts(1 - k), easeOut, () => { if (hasCube) G.audio?.ui?.('cube_bolt', 0.4); }, 0.18);
    this.tw.add(0.3, (k) => { this.heldPose(k); this.cubeSpin.position.x = k * 0.9; this.cubeSpin.position.y += k * 0.5; this.cubeSpin.rotation.z = -k * 0.7; this.fade(1 - k); }, easeInOut, () => this.finishClose(), 0.26);
  }

  private finishClose() {
    this.open = false; this.suspended = false;
    this.phase = 'off';
    this.root.classList.remove('on');
    fpRelease('pack');
    G.input.pointerOverUI = false;
    this.lastClose = performance.now();
    this.cubeSpin.rotation.set(0, 0, 0);
    this.cube.setScan(0, 0);
    G.hudBody?.setHidden?.('pack', false);
    this.ui.closeMenu?.();
  }

  private suspend() {
    this.suspended = true;
    this.cancelDrag(); this.cancelPress(); this.hoverTag.hide();
    this.root.classList.remove('on');
  }
  /** come back after an inspection or the watch let go of the stage */
  resume() {
    if (!this.open || !this.suspended || fpOwner()) return;
    if (!fpClaim('pack', 1, { cinematic: 'none' })) return;
    this.suspended = false;
    this.root.classList.add('on');
    G.input.pointerOverUI = true;
    this.dirty = true;
  }

  private fade(k: number) {
    (this.backdrop.material as THREE.MeshBasicMaterial).opacity = 0.95 * k;
    const on = k > 0.02, all = k > 0.6;
    for (const a of this.arms) a.root.visible = on;
    this.ground.visible = on;
    this.rollHold.visible = this.trayHold.visible = this.rail.visible = all;
    this.wornBoard.visible = this.box.g.visible = this.gauge.g.visible = all;
  }

  /** the cube held up to your face (k = 1) or set down on the carpet (k = 0), in carpet space */
  private heldPose(k: number) {
    this.held = k;
    this.cubeSpin.position.set(0, k * 0.42, -0.06 + k * 0.62);
    this.cubeSpin.rotation.set(-this.tilt * k * 0.92, this.yaw * (1 - k), 0);
  }

  /** arms swing the cube round, thumb on the reader, bolts, set it down, lid */
  private openSeq(quick: boolean) {
    const hasCube = !!this.cube.c;
    const tw = this.tw;
    tw.clear();
    this.cube.setLid(0); this.cube.setBolts(0); this.cube.setInside(0); this.cube.setScan(0, 0);
    const sp = quick ? 0.5 : 0.8;
    let t = 0;
    const swing = (k: number) => {
      this.heldPose(1);
      this.cubeSpin.position.x = 0.9 * (1 - k); this.cubeSpin.position.y += 0.5 * (1 - k);
      this.cubeSpin.rotation.y = -0.8 * (1 - k); this.cubeSpin.rotation.z = -0.6 * (1 - k);
    };
    swing(0);
    this.fade(0);
    // swing in from over the right shoulder
    tw.add(0.42, (k) => { swing(k); this.fade(Math.min(1, k * 1.6)); }, easeBack, () => { G.audio?.ui?.(hasCube ? 'cube_clunk' : 'bag_zip', 0.55); this.shakeT = 0.18; kick(0, -1, 0.06); });
    t += 0.42;
    const setDown = (at: number) => {
      tw.add(0.26 * sp, (k) => this.heldPose(1 - k), easeInOut, () => { this.heldPose(0); G.audio?.ui?.('cube_place', 0.5); this.shakeT = 0.12; kick(0, 1, 0.04); }, at);
    };
    if (!hasCube) { setDown(t); tw.add(0.01, () => {}, easeOut, () => this.ready(), t + 0.32 * sp); return; }
    // thumb on the reader: the relays clack, the green line sweeps
    const scanDur = 0.34 * sp;
    tw.add(0.12 * sp, (k) => { this.thumb = k; }, easeOut, () => G.audio?.ui?.('cube_relay', 0.45), t);
    t += 0.12 * sp;
    tw.add(scanDur, (k) => this.cube.setScan(k, Math.sin(k * Math.PI) * 0.9 + 0.1), (x) => x, () => { this.cube.setScan(1, 1); G.audio?.ui?.('cube_ok', 0.4); }, t);
    t += scanDur;
    tw.add(0.12 * sp, (k) => { this.thumb = 1 - k; }, easeOut, undefined, t);
    // bolts snap back one after another
    for (let i = 0; i < 4; i++) tw.add(0.01, () => {}, easeOut, () => { G.audio?.ui?.('cube_bolt', 0.35); this.shakeT = Math.max(this.shakeT, 0.06); kick(i % 2 ? 1 : -1, 0, 0.025); }, t + i * 0.05 * sp);
    tw.add(0.22 * sp, (k) => this.cube.setBolts(k), easeOut, undefined, t);
    t += 0.22 * sp;
    // down on the carpet, then the lid
    setDown(t);
    t += 0.26 * sp;
    tw.add(0.01, () => {}, easeOut, () => G.audio?.ui?.('cube_hiss', 0.45), t);
    tw.add(0.3 * sp, (k) => { this.cube.setLid(k); this.cube.setInside(k, Math.random() < 0.3 ? -1.2 : 0); }, easeOut, () => { this.cube.setInside(1); this.cube.setScan(0, 0.15); this.ready(); }, t);
  }

  private ready() {
    this.phase = 'open';
    this.heldPose(0);
    this.cube.setInside(1);
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
    // the floor view is rebuilt every look; keep one container so the tray doesn't flicker
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
  private syncTray() { const e = this.side[this.sideSel]; this.tray.setContainer(e ? e.c : null); }

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
      if (e?.c !== this.tray.c) this.syncTray(); else this.tray.refresh();
      this.layout();
      this.renderSide(); this.renderWorn();
      if (this.drag) this.retarget(this.lastPX, this.lastPY);
    }
    if (this.phase === 'open') {
      this.yaw = damp(this.yaw, this.yawT, 14, dt);
      this.tilt = damp(this.tilt, this.tiltT, 14, dt);
      this.cubeSpin.rotation.set(0, this.yaw, 0);
      this.floor.rotation.x = this.tilt;
    }
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const k = Math.max(0, this.shakeT) * 0.05;
      this.cube.root.position.set((Math.random() - 0.5) * k, Math.abs(Math.random() - 0.5) * k, (Math.random() - 0.5) * k);
    } else this.cube.root.position.set(0, 0, 0);
    for (const v of this.views) v.update(dt);
    this.poseArms(dt);
    this.poseHeld(dt);
    if (this.drag) this.updateGhost(dt);
    this.loadT -= dt;
    if (this.loadT <= 0) { this.loadT = 0.25; this.gauge.set(p.carriedWeight(), p.capacity(), (p as any).packSlow?.() ?? 1); }
    this.gauge.update(dt);
    this.dymo.update(dt);
    // the side tags sway a little on their wire
    this.sideTags.forEach((s, i) => { s.t.mesh.rotation.z = Math.sin(now * 0.0016 + i) * 0.03; });
  }

  private poseArms(dt: number) {
    const [aR, aL] = this.arms;
    const H = 5 * CELL, O = H + 0.048;
    this.cube.root.updateWorldMatrix(true, false);
    const k = this.held;
    // holding the cube: hands on its flanks; set down: resting at the bottom, palms up
    const gl = this.cube.root.localToWorld(_v.set(-O / 2 - 0.012, H * 0.42, 0.06)).lerp(this.palm.L, 1 - k);
    aL.target.lerp(gl, 1 - Math.exp(-20 * dt));
    const gr = this.cube.root.localToWorld(_v2.set(O / 2 + 0.012, H * 0.42, 0.06)).lerp(this.palm.R, 1 - k);
    if (this.thumb > 0) gr.lerp(this.cube.pad.getWorldPosition(_s).add(_v.set(0.03, -0.05, 0.05)), this.thumb);
    aR.target.lerp(gr, 1 - Math.exp(-18 * dt));
    for (const a of this.arms) a.elbow.set(a.side * 0.48, -0.66, -0.75);
    aL.grip = 0.8 * k + 0.25 * (1 - k); aR.grip = this.thumb > 0 ? 0.6 : 0.8 * k + 0.25 * (1 - k);
    poseArm(aL, 1.4 * k + 2.6 * (1 - k)); poseArm(aR, -1.4 * k - 2.6 * (1 - k));
    aR.thumb.rotation.z = aR.side * (0.6 - this.thumb * 1.1);
  }

  /** what is held sits in the open palm */
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
        if (it) { const o = makeItemObj(it.key); fitItemObj(o, 0, 0.16, 0.2, 0.08, 1.3); o.outer.userData.held = h; this.g.add(o.outer); this.heldObjs[h] = o; }
      }
      const o = this.heldObjs[h];
      if (o) {
        o.outer.visible = this.held < 0.5 && !(this.drag?.src === 'hand' && this.drag.hand === h);
        o.outer.position.lerp(_v.copy(this.arms[h === 'R' ? 0 : 1].target).add(_s.set(0, 0.05, 0.02)), 1 - Math.exp(-16 * dt));
        o.outer.rotation.set(0.9, h === 'R' ? -0.5 : 0.5, 0);
      }
    }
  }

  // ================================================================ props
  private renderSide() {
    const sig = this.side.map((e) => e.c.uid + e.name).join('|') + '#' + this.sideSel;
    if (sig === this.sideSig) return;
    this.sideSig = sig;
    for (const s of this.sideTags) disposeTag(s.t);
    this.sideTags = [];
    // at most five tags fit the rod: pockets, the floor, and what is nearest
    const idx = this.side.map((_, i) => i);
    const show = idx.length <= 5 ? idx : [0, ...idx.slice(1, -1).slice(0, 3), idx.length - 1];
    if (!show.includes(this.sideSel)) show[show.length - 2] = this.sideSel;
    show.forEach((i, row) => {
      const e = this.side[i];
      const t = pixTag('tag', 66, 26, 0.17);
      t.clear();
      t.para(e.name, 6, 9, 56, undefined, 7.5, 2, 7);
      if (i === this.sideSel) stamp(t, 'OPEN', 40, 3, '#b8281c');
      t.flush();
      t.mesh.geometry.translate(-0.085, -0.03, 0);
      t.mesh.position.set(-0.012 - (i === this.sideSel ? 0.025 : 0), -0.02 - row * 0.07, 0.006 + row * 0.002);
      t.mesh.userData.side = i;
      this.rail.add(t.mesh);
      this.sideTags.push({ t, e });
    });
  }

  private renderWorn() {
    const p = G.local;
    const worn = [...p.worn.values()].filter((it) => it.key !== 'iron_cube' && it.key !== 'tool_roll');
    const sig = worn.map((w) => w.uid).join(',');
    if (sig === this.wornSig) return;
    this.wornSig = sig;
    for (const w of this.wornObjs) this.wornBoard.remove(w.obj.outer);
    this.wornObjs = [];
    worn.slice(0, 6).forEach((it, i) => {
      const o = makeItemObj(it.key);
      fitItemObj(o, 2, 0.04, 0.03, 0.06, 1.2);
      o.outer.position.set(-0.105 + i * 0.042, -0.02, 0.026);
      o.outer.userData.worn = it.uid;
      this.wornBoard.add(o.outer);
      this.wornObjs.push({ it, obj: o });
    });
  }

  private note(text: string, bad = false) { this.dymo?.show(text, bad); }

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
    if (this.phase === 'opening') { if (e.code !== 'KeyI' && e.code !== 'Escape') { this.tw.finish(); e.stopImmediatePropagation(); e.preventDefault(); return; } }
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
  /** what is under the pointer: an item, a held thing, a worn thing, a control, a tag, the lid */
  private hitAt(x: number, y: number): Hit | null {
    pointerRay(this.rc, fpCamera(), x, y);
    let best: Hit | null = null, bd = Infinity;
    const consider = (h: Hit, d: number) => { if (d < bd) { bd = d; best = h; } };
    for (const v of this.views) { const h = v.pickAt(this.rc); if (h) consider({ kind: 'item', view: v, items: h.a.items }, h.dist); }
    const objs: THREE.Object3D[] = [...this.box.ctl, ...this.sideTags.map((s) => s.t.mesh), ...this.wornObjs.map((w) => w.obj.outer), this.cube.lid];
    for (const h of ['R', 'L'] as const) { const o = this.heldObjs[h]; if (o?.outer.visible) objs.push(o.outer); }
    for (const it of this.rc.intersectObjects(objs, true)) {
      let o: THREE.Object3D | null = it.object;
      while (o) {
        const u = o.userData;
        if (u.ctl) { _v.copy(it.point); o.worldToLocal(_v); consider({ kind: 'ctl', ctl: u.ctl, obj: o, x: _v.x }, it.distance - 0.02); break; }
        if (u.side !== undefined) { consider({ kind: 'side', i: u.side }, it.distance); break; }
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
      const dx = e.clientX - this.orbit.x, dy = e.clientY - this.orbit.y;
      this.orbit.x = e.clientX; this.orbit.y = e.clientY;
      this.yawT = Math.max(-1.3, Math.min(1.3, this.yawT + dx * 0.008));
      this.tiltT = Math.max(0.55, Math.min(1.25, this.tiltT + dy * 0.004));
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
    if (d && d.stack.length > 1) { d.count = Math.max(1, Math.min(d.stack.length, d.count + (e.deltaY < 0 ? 1 : -1))); this.retarget(this.lastPX, this.lastPY); this.note('x' + d.count); return; }
    this.peel(e.deltaY < 0 ? 1 : -1);
  }

  private hover(x: number, y: number) {
    const h = this.hitAt(x, y);
    for (const v of this.views) v.setHover(h?.kind === 'item' && h.view === v ? h.items[0] : this.sel?.view === v ? this.sel.it : null);
    if (h) this.showTag(h); else this.hoverTag.hide();
  }

  private showTag(h: Hit) {
    if (h.kind === 'item') { if (h.view.itemWorldPos(h.items[0], _v)) this.hoverTag.item(h.items[0], h.items.length, _v); return; }
    if (h.kind === 'held' || h.kind === 'worn') {
      const o = h.kind === 'held' ? this.heldObjs[h.hand] : this.wornObjs.find((w) => w.it === h.it)?.obj;
      if (o) { o.outer.getWorldPosition(_v); this.hoverTag.item(h.it, 1, _v); }
      return;
    }
    if (h.kind === 'side') { const s = this.sideTags[h.i]; if (s) { s.t.mesh.getWorldPosition(_v); this.hoverTag.text([s.e.name, s.e.c.items.length + ' ITEMS', 'TAP: SHOW'], _v); } return; }
    if (h.kind === 'lid') { this.cube.lid.getWorldPosition(_v); this.hoverTag.text(['THE LID', 'TAP: SHUT'], _v); return; }
    this.hoverTag.hide();
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
    this.hoverTag.hide();
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
    for (const s of this.sideTags) s.t.mesh.scale.setScalar(1);
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
      this.wornBoard.getWorldPosition(_v);
      if (this.screenDist(_v, x, y) < reach * 1.2) t = { k: 'wear', ok: !!(def.clothing || def.bag) && d.src !== 'worn' };
    }
    if (t.k === 'none') {
      const hits = this.rc.intersectObjects(this.sideTags.map((s) => s.t.mesh), false);
      const s = hits[0] ? this.sideTags.find((q) => q.t.mesh === hits[0].object) : null;
      if (s) t = { k: 'tab', c: s.e.c, ok: s.e.c !== d.from && (s.e.c.kind === 'floor' || s.e.c.hasRoom(it)) };
    }
    if (t.k === 'none') {
      for (const v of [this.cube, this.roll, this.tray]) { const r = v.targetAt(ray, it, d.rot, d.count); if (r) { t = { k: 'grid', d: r }; break; } }
    }
    if (t.k === 'none') {
      // the bare carpet: leave it on the floor
      this.floor.updateWorldMatrix(true, false);
      const inv = new THREE.Matrix4().copy(this.floor.matrixWorld).invert();
      const r = ray.clone().applyMatrix4(inv);
      if (Math.abs(r.direction.y) > 1e-4) { const tt = -r.origin.y / r.direction.y; if (tt > 0) t = { k: 'floor', at: r.at(tt, new THREE.Vector3()) }; }
    }
    for (const s of this.sideTags) s.t.mesh.scale.setScalar(t.k === 'tab' && s.e.c === t.c ? 1.2 : 1);
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
      reparent(this.floor);
      o.position.lerp(_v2.copy(t.at).setY(0.04), 1 - Math.exp(-28 * dt));
      fitItemObj(d.ghost, d.rot, 0.12, 0.12, 0.08, 1);
      tint(ghostNone);
      d.edges.visible = false;
    } else {
      reparent(this.g);
      pointerRay(this.rc, fpCamera(), this.lastPX, this.lastPY).at(1.0, _v2);
      o.position.lerp(_v2, 1 - Math.exp(-28 * dt));
      fitItemObj(d.ghost, d.rot, 0.1, 0.1, 0.1, 0.9);
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
  private bad() { G.audio?.ui?.('bag_bad', 0.5); this.note("won't go there", true); }

  private inspect(it: Item, c: Container) {
    this.cancelDrag(); this.hoverTag.hide();
    (G as any).craft?.inspect?.(it, c);
  }

  // ================================================================ kit & quick draw
  /** saves from before the cube, or kits without one: bolt the cube on and hang the tool roll */
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
    } catch (e) { console.warn('cube kit', e); }
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
