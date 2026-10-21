import '../craft/craft.css';
import * as THREE from 'three';
import { G } from '../game/G';
import type { UI } from './ui';
import type { Container } from '../items/container';
import { type Item, itemDef, itemName, itemWeight } from '../items/item';
import { itemIconFor, itemIcon, objIcon } from './icons';
import { queueTransfers, resolveTarget } from '../actions/transfer';
import { floorContainer } from '../items/worldItems';
import { objDef } from '../world/objects';
import { lineOfSight } from '../world/collision';
import { ensureLoot, isWorldContainer, containerRef, transferItem } from '../game/worldOps';
import { op } from '../game/ops';
import { bus } from '../core/events';
import { WearAction, EquipAction } from '../actions/basic';
import { gridSpec, autoPack, settleGravity, fillOf, type Rot, TURN, TIP, ROLL, setPlace, size3, isEquipped, type Placement } from '../items/grid';
import { isToolDef, TOOL_ROLL_LOOPS } from '../items/footprints';
import { settlePack, bestDest } from '../items/packResolver';
import { createItem } from '../items/factory';
import { fpGroup, fpClaim, fpRelease, fpOwner, fpCamera } from '../fp/fp';
import { CubeView, CELL } from '../craft/cubeView';
import { TrayView } from '../craft/trayView';
import type { GridView3, DropAt } from '../craft/gridView3';
import { Tweens, easeOut, easeBack, easeInOut, makeArm, poseArm, type Arm, makeBackdrop, makeItemObj, fitItemObj, type ItemObj, boxEdges, pointerRay, damp } from '../craft/fpKit';
import { registerCraftSounds } from '../craft/craftSounds';
import { craftSystem } from '../craft/craft';
import { debtorNo } from './holo/holo';
import { registerBagSounds } from './bag/bagSounds';

/**
 * The backpack is an iron cube. Opening it (I, or the rucksack on touch)
 * goes first-person: your arms swing the Remittance cube round off your
 * back, your thumb goes on the scanner (sweep, beep, the bolts snap back),
 * the lid hisses open and you look down into a 5x5x5 grid of cells lit from
 * inside. Every item takes its real 3D size; drag it in and it drops to rest
 * on the floor of the box or on what is under it (green fits, red doesn't),
 * R turns it, T tips it on end, Y rolls it. Drag the empty space to turn the
 * cube in your hands; the wheel (or the layer buttons) peels layers off the
 * top. The tool roll on your hip lies to the left (six loops and the brass
 * quick-draw holster, drawn with ` or Y outside the pack); whatever you are
 * looting, your pockets, other bags and the floor sit to the right as a tray.
 * Your hands and what you wear are slots at the bottom left. Double-click (or
 * long-press, or right-click) an item to inspect it close up and work on it
 * (src/craft). The heavier and fuller the cube, the slower you walk.
 *
 * World containers rearrange through ops, so co-op looters see the same
 * layout; your own cube is yours and is saved with you.
 */

interface Entry { c: Container; name: string; icon: string; kind: 'pockets' | 'bag' | 'loot' | 'floor' }
type Target =
  | { k: 'grid'; d: DropAt }
  | { k: 'hand'; hand: 'R' | 'L'; ok: boolean; el: HTMLElement }
  | { k: 'wear'; ok: boolean; el: HTMLElement }
  | { k: 'tab'; c: Container; ok: boolean; el: HTMLElement }
  | { k: 'floor'; el: HTMLElement }
  | { k: 'none' };
interface Drag {
  stack: Item[]; count: number; from: Container; src: 'grid' | 'hand' | 'worn'; hand?: 'R' | 'L';
  rot: Rot; pointerId: number; over: Target; ghost: ItemObj; edges: THREE.LineSegments; view: GridView3 | null;
}
interface Press { pointerId: number; x0: number; y0: number; t: number; touch: boolean; hit: { view: GridView3; items: Item[] } | null; dom?: { it: Item; src: 'hand' | 'worn'; hand?: 'R' | 'L' }; long: number; done: boolean; orbit: boolean; shift: boolean }

const LONG_MS = 480;
const ghostOk = new THREE.MeshBasicMaterial({ color: 0x8dffb0, transparent: true, opacity: 0.6, depthWrite: false });
const ghostBad = new THREE.MeshBasicMaterial({ color: 0xff5a46, transparent: true, opacity: 0.6, depthWrite: false });
const ghostNone = new THREE.MeshBasicMaterial({ color: 0xe8eef0, transparent: true, opacity: 0.75, depthWrite: false });
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _s = new THREE.Vector3();

export class InventoryUI {
  open = false;
  ui: UI;
  root: HTMLDivElement;
  /** the stage was taken (inspection, the watch): the pack waits underneath */
  private suspended = false;
  private built = false;
  private g!: THREE.Group;
  private cubeHold = new THREE.Group();
  private cubeSpin = new THREE.Group();
  private rollHold = new THREE.Group();
  private trayHold = new THREE.Group();
  private cube = new CubeView();
  private roll = new TrayView();
  private tray = new TrayView();
  private views: GridView3[] = [];
  private arms: Arm[] = [];
  private backdrop!: THREE.Mesh;
  private key!: THREE.DirectionalLight;
  private tw = new Tweens();
  private phase: 'off' | 'opening' | 'open' | 'closing' = 'off';
  private lastClose = -1e9;
  private yaw = 0; private pitch = 0.82; private yawT = 0; private pitchT = 0.82;
  private shakeT = 0;
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
  private rc = new THREE.Raycaster();
  private lastT = performance.now();
  private grip = { L: new THREE.Vector3(), R: new THREE.Vector3() };
  // DOM
  private el: Record<string, HTMLElement> = {};
  private handEls: Record<'R' | 'L', HTMLElement | null> = { R: null, L: null };
  private wearEl: HTMLElement | null = null;
  private floorEl: HTMLElement | null = null;
  private tabEls: { el: HTMLElement; c: Container }[] = [];
  private noteT = 0;
  private dockSig = ''; private sideSig = '';

  constructor(ui: UI) {
    this.ui = ui;
    registerCraftSounds(); registerBagSounds();
    const r = document.createElement('div');
    r.className = 'fpk';
    r.id = 'bag-root';
    r.innerHTML = `
      <div class="fpk-top fpk-in"><div class="fpk-title">REMITTANCE CUBE<small></small></div>
        <div class="fpk-load"><div class="fpk-lt"></div><div class="fpk-bar"><i></i></div><div class="fpk-pace"></div></div></div>
      <div class="fpk-side fpk-in"></div>
      <div class="fpk-dock fpk-in"></div>
      <div class="fpk-hint fpk-in">drag: move · R turn · T tip · Y roll · wheel: layers · double-click: inspect · shift-click: quick move</div>
      <div class="fpk-btns fpk-in">
        <button class="fpk-b" data-b="turn">TURN<kbd>R</kbd></button><button class="fpk-b" data-b="tip">TIP<kbd>T</kbd></button><button class="fpk-b" data-b="rollz">ROLL<kbd>Y</kbd></button>
        <button class="fpk-b" data-b="up">LAYER<kbd>▲</kbd></button><button class="fpk-b" data-b="down">LAYER<kbd>▼</kbd></button>
        <button class="fpk-b" data-b="shake">SHAKE<kbd>pack tight</kbd></button><button class="fpk-b" data-b="close">CLOSE<kbd>I</kbd></button></div>
      <div class="fpk-lbls"></div>
      <div class="fpk-tag"></div><div class="fpk-note"></div>`;
    document.body.appendChild(r);
    this.root = r;
    for (const k of ['top', 'title', 'load', 'side', 'dock', 'btns', 'lbls', 'tag', 'note', 'hint']) this.el[k] = r.querySelector('.fpk-' + k) as HTMLElement;
    this.el.sub = r.querySelector('.fpk-title small') as HTMLElement;
    this.el.lt = r.querySelector('.fpk-lt') as HTMLElement;
    this.el.bar = r.querySelector('.fpk-bar i') as HTMLElement;
    this.el.pace = r.querySelector('.fpk-pace') as HTMLElement;
    r.querySelectorAll<HTMLButtonElement>('.fpk-b').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); this.button(b.dataset.b || ''); }));
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
    bus.on('gridNoRoom', (it: Item) => { if (this.open) this.note('no room: ' + itemName(it).toLowerCase(), true); });
    bus.on('gridOverflow', (it: Item, where: string) => { if (this.open) this.note((where === 'hand' ? 'no room, in hand: ' : 'no room, dropped: ') + itemName(it).toLowerCase(), true); });
    bus.on('fpLost', (name: string) => { if (name === 'pack' && this.open) this.suspend(); });
    bus.on('fpChange', (name: string | null) => { if (name === null && this.open && this.suspended) setTimeout(() => this.resume(), 0); });
    // while the cube is in your hands you are not walking anywhere
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
    g.add(new THREE.AmbientLight(0xc8d0d8, 0.55));
    this.key = new THREE.DirectionalLight(0xfff0d8, 1.1); this.key.position.set(-0.5, 1.4, 0.6); g.add(this.key);
    const rim = new THREE.DirectionalLight(0x5ae0d0, 0.45); rim.position.set(0.8, -0.2, -0.6); g.add(rim);
    g.add(this.cubeHold, this.rollHold, this.trayHold);
    this.cubeHold.add(this.cubeSpin);
    this.cubeSpin.add(this.cube.root);
    this.cubeSpin.rotation.order = 'XYZ';
    this.rollHold.add(this.roll.root);
    this.trayHold.add(this.tray.root);
    this.views = [this.cube, this.roll, this.tray];
    for (const s of [1, -1] as const) { const a = makeArm(s); g.add(a.root); this.arms.push(a); }
  }

  /** where things sit on screen for this aspect */
  private layout() {
    const asp = window.innerWidth / Math.max(1, window.innerHeight);
    const wide = asp >= 1.2;
    const D = 1.55;
    const halfH = Math.tan((fpCamera().fov * Math.PI) / 360) * D, halfW = halfH * asp;
    const H = 5 * CELL;
    if (wide) {
      this.cubeHold.position.set(0, -0.06, -D);
      this.cubeHold.scale.setScalar(1);
      const side = Math.min(halfW * 0.66, 0.62);
      this.rollHold.position.set(-side, -0.14, -D + 0.08); this.rollHold.rotation.set(0.95, 0.28, 0);
      this.trayHold.position.set(side, -0.08, -D + 0.05); this.trayHold.rotation.set(0.9, -0.26, 0);
      this.fitSide(this.roll, this.rollHold, Math.min(0.34, halfW - side - 0.02 + 0.17));
      this.fitSide(this.tray, this.trayHold, Math.min(0.42, (halfW - side) * 2 - 0.06));
    } else {
      const k = Math.min(1, halfW / 0.36);
      this.cubeHold.position.set(0, 0.08, -D);
      this.cubeHold.scale.setScalar(k);
      this.rollHold.position.set(-halfW * 0.5, -halfH * 0.62, -D + 0.1); this.rollHold.rotation.set(0.9, 0.12, 0);
      this.trayHold.position.set(halfW * 0.48, -halfH * 0.6, -D + 0.1); this.trayHold.rotation.set(0.9, -0.12, 0);
      this.fitSide(this.roll, this.rollHold, halfW * 0.9);
      this.fitSide(this.tray, this.trayHold, halfW * 0.92);
    }
    this.cube.root.position.set(0, -H / 2, 0);
  }
  private fitSide(v: TrayView, hold: THREE.Group, maxW: number) {
    const [w, d] = v.size();
    hold.scale.setScalar(Math.min(1.25, maxW / Math.max(0.05, w), 0.36 / Math.max(0.05, d)));
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
    return back?.inv && gridSpec(back.inv)?.d && gridSpec(back.inv)!.d > 1 ? back.inv : null;
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
    if (!fpClaim('pack', 1)) { this.note('hands busy', true); return; }
    this.open = true; this.suspended = false;
    this.phase = 'opening';
    this.root.classList.add('on'); this.root.classList.remove('ready');
    G.input.pointerOverUI = true;
    this.scanNearby(); this.dirty = true;
    this.cube.setContainer(this.cubeC());
    this.roll.setContainer(this.rollC());
    this.syncTray();
    this.layout();
    this.el.sub.textContent = 'DEBTOR ' + (debtorNo(p) || '----') + ' · THUMBPRINT LOCK';
    this.cube.peel = 99; this.cube.applyPeel();
    this.yawT = this.yaw = 0; this.pitchT = 0.82;
    this.openSeq(performance.now() - this.lastClose < 30000);
  }

  private hide() {
    this.cancelDrag(); this.cancelPress(); this.hideTag();
    this.root.classList.remove('ready');
    this.phase = 'closing';
    this.tw.finish();
    const hasCube = !!this.cube.c;
    G.audio?.ui?.(hasCube ? 'cube_shut' : 'bag_zip', 0.5);
    this.tw.add(0.18, (k) => { this.cube.setLid(1 - k); this.cube.setInside(1 - k); this.pitch = 0.82 + (0.15 - 0.82) * k; this.cubeSpin.rotation.x = this.pitch; }, easeInOut);
    this.tw.add(0.12, (k) => this.cube.setBolts(1 - k), easeOut, () => { if (hasCube) G.audio?.ui?.('cube_bolt', 0.4); }, 0.18);
    this.tw.add(0.26, (k) => { this.cubeHold.position.x = k * 0.9; this.cubeHold.position.y = -0.06 + k * 0.5; this.cubeSpin.rotation.z = -k * 0.7; this.fade(1 - k); }, easeInOut, () => this.finishClose(), 0.26);
  }

  private finishClose() {
    this.open = false; this.suspended = false;
    this.phase = 'off';
    this.root.classList.remove('on', 'ready');
    fpRelease('pack');
    G.input.pointerOverUI = false;
    this.lastClose = performance.now();
    this.cubeSpin.rotation.z = 0;
    this.ui.closeMenu?.();
  }

  private suspend() {
    this.suspended = true;
    this.cancelDrag(); this.cancelPress(); this.hideTag();
    this.root.classList.remove('on');
  }
  /** come back after an inspection or the watch let go of the stage */
  resume() {
    if (!this.open || !this.suspended || fpOwner()) return;
    if (!fpClaim('pack', 1)) return;
    this.suspended = false;
    this.root.classList.add('on', 'ready');
    G.input.pointerOverUI = true;
    this.dirty = true;
  }

  private fade(k: number) {
    (this.backdrop.material as THREE.MeshBasicMaterial).opacity = 0.92 * k;
    for (const a of this.arms) a.root.visible = k > 0.02;
  }

  /** arms swing the cube round, thumb on the scanner, bolts, lid */
  private openSeq(quick: boolean) {
    const hasCube = !!this.cube.c;
    const tw = this.tw;
    tw.clear();
    this.cube.setLid(0); this.cube.setBolts(0); this.cube.setInside(0); this.cube.setScan(0, 0);
    const D = this.cubeHold.position.clone();
    const sp = quick ? 0.45 : 1;
    let t = 0;
    // swing in from over the right shoulder
    this.cubeHold.position.set(D.x + 0.85, D.y + 0.55, D.z + 0.1);
    this.pitch = 0.1; this.cubeSpin.rotation.set(0.1, -0.7, -0.6);
    this.fade(0);
    tw.add(0.4 * sp, (k) => {
      this.cubeHold.position.lerpVectors(_v.set(D.x + 0.85, D.y + 0.55, D.z + 0.1), D, k);
      this.cubeSpin.rotation.y = -0.7 * (1 - k); this.cubeSpin.rotation.z = -0.6 * (1 - k);
      this.fade(Math.min(1, k * 1.6));
    }, easeBack, () => { G.audio?.ui?.(hasCube ? 'cube_clunk' : 'bag_zip', 0.55); this.shakeT = 0.18; });
    t += 0.4 * sp;
    if (!hasCube) {
      tw.add(0.2, () => {}, easeOut, () => this.ready(), t);
      return;
    }
    // thumb to the scanner
    const scanDur = 0.42 * sp;
    tw.add(0.16 * sp, (k) => { this.thumb = k; }, easeOut, () => G.audio?.ui?.('cube_beep', 0.35), t);
    t += 0.16 * sp;
    tw.add(scanDur, (k) => this.cube.setScan(k, Math.sin(k * Math.PI) * 0.9 + 0.1), (x) => x, () => { this.cube.setScan(1, 1); G.audio?.ui?.('cube_ok', 0.4); }, t);
    t += scanDur;
    tw.add(0.12 * sp, (k) => { this.thumb = 1 - k; }, easeOut, undefined, t);
    // bolts snap back one after another
    for (let i = 0; i < 4; i++) tw.add(0.01, () => {}, easeOut, () => G.audio?.ui?.('cube_bolt', 0.35), t + i * 0.06 * sp);
    tw.add(0.3 * sp, (k) => this.cube.setBolts(k), easeOut, undefined, t);
    t += 0.3 * sp;
    // the seal goes, the lid swings back, the light comes on, and you tilt it to look in
    tw.add(0.01, () => {}, easeOut, () => G.audio?.ui?.('cube_hiss', 0.45), t);
    tw.add(0.36 * sp, (k) => { this.cube.setLid(k); this.cube.setInside(k, Math.random() < 0.3 ? -1.2 : 0); }, easeOut, () => { this.cube.setInside(1); this.cube.setScan(0, 0.2); }, t);
    tw.add(0.34 * sp, (k) => { this.pitch = 0.1 + (0.82 - 0.1) * k; this.cubeSpin.rotation.x = this.pitch; }, easeInOut, () => this.ready(), t + 0.12 * sp);
  }
  private thumb = 0;

  private ready() {
    this.phase = 'open';
    this.pitch = this.pitchT = 0.82;
    this.root.classList.add('ready');
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
    const out: Entry[] = [{ c: p.inv, name: 'Pockets', icon: itemIcon('prison_jumpsuit', '', 16), kind: 'pockets' }];
    for (const c of this.carriedBags()) {
      const it = p.allItems().find((i) => i.inv === c);
      out.push({ c, name: it ? itemName(it) : c.name, icon: it ? itemIconFor(it, 16) : '', kind: 'bag' });
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
        out.push({ c: o.inv, name: d?.name || o.key, icon: objIcon(o.key), kind: 'loot' });
      }
    }
    const fresh = floorContainer(z, p.x, p.z, 1.3);
    for (const it of fresh.items) if (it.inv) out.push({ c: it.inv, name: itemName(it), icon: itemIcon(it.key, '', 16), kind: 'loot' });
    for (const corpse of G.creatures?.nearbyCorpses?.(p, R) || []) out.push({ c: corpse.inv, name: corpse.name, icon: itemIcon('skeleton', '', 16), kind: 'loot' });
    for (const v of G.items?.nearbyTrunks?.(p) || []) out.push({ c: v.c, name: v.name, icon: itemIcon('car_key', '', 16), kind: 'loot' });
    // the floor view is rebuilt every look; keep one container so the tray doesn't flicker
    if (!this.floorC) this.floorC = fresh;
    else { this.floorC.items = fresh.items; this.floorC.owner = fresh.owner; }
    out.push({ c: this.floorC, name: 'Floor', icon: '', kind: 'floor' });
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
  }

  // ================================================================ frame
  update(dt0: number) {
    const p = G.local;
    if (!p) return;
    void dt0;
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastT) / 1000);
    this.lastT = now;
    // the pack settles itself whether open or not
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
      this.renderSide(); this.renderDock();
      if (this.drag) this.retarget(this.lastPX, this.lastPY);
    }
    // turning the cube in your hands
    if (this.phase === 'open') {
      this.yaw = damp(this.yaw, this.yawT, 14, dt);
      this.pitch = damp(this.pitch, this.pitchT, 14, dt);
      this.cubeSpin.rotation.set(this.pitch, this.yaw, 0);
    }
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const k = Math.max(0, this.shakeT) * 0.05;
      this.cubeSpin.position.set((Math.random() - 0.5) * k, (Math.random() - 0.5) * k, 0);
    } else this.cubeSpin.position.set(0, 0, 0);
    for (const v of this.views) v.update(dt);
    this.poseArms(dt);
    if (this.drag) this.updateGhost(dt);
    this.loadT -= dt;
    if (this.loadT <= 0) { this.loadT = 0.25; this.renderLoad(); }
    this.renderLabels();
    if (this.noteT > 0) { this.noteT -= dt; if (this.noteT <= 0) this.el.note.classList.remove('on'); }
  }

  private poseArms(dt: number) {
    const [aR, aL] = this.arms;
    const H = 5 * CELL, O = H + 0.048;
    this.cube.root.updateWorldMatrix(true, false);
    // left hand grips the cube's left flank, right hand the right one
    const gl = this.cube.root.localToWorld(_v.set(-O / 2 - 0.012, H * 0.42, 0.06));
    this.grip.L.lerp(gl, 1 - Math.exp(-20 * dt));
    let gr = this.cube.root.localToWorld(_v2.set(O / 2 + 0.012, H * 0.42, 0.06));
    if (this.thumb > 0) {
      const pad = this.cube.pad.getWorldPosition(_s);
      gr = _v2.copy(gr).lerp(pad.add(_v.set(0.03, -0.05, 0.05)), this.thumb);
    }
    if (this.drag) gr = this.drag.ghost.outer.getWorldPosition(_v2).add(_v.set(0.02, -0.05, 0.04));
    this.grip.R.lerp(gr, 1 - Math.exp(-18 * dt));
    aL.target.copy(this.grip.L); aR.target.copy(this.grip.R);
    aL.grip = 0.8; aR.grip = this.drag ? 0.9 : this.thumb > 0 ? 0.6 : 0.8;
    poseArm(aL, 1.4); poseArm(aR, -1.4);
    aR.thumb.rotation.z = aR.side * (0.6 - this.thumb * 1.1);
  }

  // ================================================================ readouts
  private renderLoad() {
    const p = G.local;
    const w = p.carriedWeight(), cap = p.capacity();
    const cubeC = this.cube.c;
    const fill = cubeC ? fillOf(cubeC) : 0;
    const pace = (p as any).packSlow?.() ?? 1;
    const total = Math.max(0, 1 - pace * (p.body.mods(p.heavyLoad()).move));
    this.el.lt.textContent = `${w.toFixed(1)} / ${cap.toFixed(0)} kg · cube ${Math.round(fill * 100)}%`;
    this.el.bar.style.width = Math.min(100, (w / cap) * 100) + '%';
    const pct = Math.round(total * 100);
    this.el.pace.textContent = pct > 1 ? `pace −${pct}%` : 'pace: unburdened';
    this.el.pace.className = 'fpk-pace' + (pct > 30 ? ' heavy' : pct > 8 ? ' slow' : '');
  }

  private lblEls: HTMLElement[] = [];
  private renderLabels() {
    const cam = fpCamera();
    const out: { t: string; p: THREE.Vector3; k?: boolean }[] = [];
    if (this.roll.c && this.roll.root.visible) {
      for (const rc of this.roll.regionCenters) out.push({ t: rc.manual ? 'QUICK-DRAW' : 'TOOL ROLL', p: this.roll.space.localToWorld(_v.set(rc.x, 0, rc.manual ? -0.02 : -0.03)).clone(), k: rc.manual });
    }
    const e = this.side[this.sideSel];
    if (e && this.tray.root.visible) {
      const [, d] = this.tray.size();
      out.push({ t: e.name.toUpperCase(), p: this.tray.space.localToWorld(_v.set(this.tray.size()[0] / 2, 0, d + 0.035)).clone() });
      if (e.kind === 'pockets') for (const rc of this.tray.regionCenters) out.push({ t: rc.label, p: this.tray.space.localToWorld(_v.set(rc.x, 0, rc.z - 0.05)).clone() });
    }
    if (!this.cube.c) out.push({ t: 'NO CUBE ON YOUR BACK', p: this.cubeHold.getWorldPosition(_v).clone() });
    while (this.lblEls.length < out.length) { const d = document.createElement('div'); d.className = 'fpk-lbl'; this.el.lbls.appendChild(d); this.lblEls.push(d); }
    this.lblEls.forEach((d, i) => {
      const o = out[i];
      if (!o) { d.style.display = 'none'; return; }
      o.p.project(cam);
      d.style.display = '';
      if (d.textContent !== o.t) d.textContent = o.t;
      d.className = 'fpk-lbl' + (o.k ? ' k' : '');
      d.style.left = ((o.p.x + 1) / 2) * window.innerWidth + 'px';
      d.style.top = ((1 - o.p.y) / 2) * window.innerHeight + 'px';
    });
  }

  private renderSide() {
    const sig = this.side.map((e) => e.c.uid + e.name).join('|') + '#' + this.sideSel;
    if (sig === this.sideSig) return;
    this.sideSig = sig;
    const box = this.el.side;
    box.innerHTML = '';
    this.tabEls = [];
    this.side.forEach((e, i) => {
      const t = document.createElement('div');
      t.className = 'fpk-tab' + (i === this.sideSel ? ' sel' : '');
      t.innerHTML = (e.icon ? `<img src="${e.icon}">` : '') + `<span>${e.name.toUpperCase()}</span>`;
      t.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); if (this.drag) return; this.sideSel = i; this.sideRef = this.refOf(e); this.sideSig = ''; this.syncTray(); this.layout(); this.renderSide(); G.audio?.ui?.('bag_rot', 0.3); });
      box.appendChild(t);
      this.tabEls.push({ el: t, c: e.c });
    });
  }

  private renderDock() {
    const p = G.local;
    const worn = [...p.worn.values()];
    const sig = [p.handR?.uid, p.handL?.uid, ...worn.map((w) => w.uid)].join(',');
    if (sig === this.dockSig) return;
    this.dockSig = sig;
    const box = this.el.dock;
    box.innerHTML = '';
    const slot = (label: string, it: Item | null, src: 'hand' | 'wear' | 'floor', hand?: 'R' | 'L') => {
      const s = document.createElement('div');
      s.className = 'fpk-slot' + (src !== 'hand' ? ' wide' : '');
      s.innerHTML = `<b>${label}</b>` + (it ? `<img src="${itemIconFor(it, 32)}"><span>${itemName(it)}</span>` : '');
      if (it && hand) s.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.startDomPress(e, it, 'hand', hand); });
      box.appendChild(s);
      return s;
    };
    this.handEls.L = slot('L HAND', p.handL && p.handL !== p.handR ? p.handL : null, 'hand', 'L');
    this.handEls.R = slot('R HAND', p.handR, 'hand', 'R');
    this.wearEl = slot('WEAR', null, 'wear');
    this.floorEl = slot('DROP', null, 'floor');
    const wl = document.createElement('div'); wl.className = 'fpk-worn';
    for (const it of worn) {
      if (it.key === 'iron_cube' || it.key === 'tool_roll') continue;
      const c = document.createElement('div'); c.className = 'fpk-chip'; c.title = itemName(it);
      c.innerHTML = `<img src="${itemIconFor(it, 24)}">`;
      c.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.startDomPress(e, it, 'worn'); });
      wl.appendChild(c);
    }
    box.appendChild(wl);
  }

  private note(text: string, bad = false) {
    const n = this.el.note;
    n.textContent = text.toUpperCase();
    n.className = 'fpk-note on' + (bad ? ' bad' : '');
    this.noteT = 1.6;
  }

  // ================================================================ buttons / keys
  private button(b: string) {
    if (this.phase !== 'open') { this.tw.finish(); return; }
    if (b === 'turn') this.rotate(TURN);
    else if (b === 'tip') this.rotate(TIP);
    else if (b === 'rollz') this.rotate(ROLL);
    else if (b === 'up') this.peel(1);
    else if (b === 'down') this.peel(-1);
    else if (b === 'shake') this.shake();
    else if (b === 'close') this.toggle(false);
  }

  private onKey(e: KeyboardEvent) {
    if (!this.open || this.suspended || G.input.textFocus) return;
    if (this.phase === 'opening') { if (e.code !== 'KeyI' && e.code !== 'Escape') { this.tw.finish(); e.stopImmediatePropagation(); e.preventDefault(); return; } }
    const stop = () => { e.stopImmediatePropagation(); e.preventDefault(); };
    if (e.code === 'Escape' || (G.input.bindings.inventory || []).includes(e.code)) { stop(); if (!e.repeat) this.toggle(false); return; }
    if (this.phase !== 'open') { stop(); return; }
    switch (e.code) {
      case 'KeyR': stop(); this.rotate(TURN); return;
      case 'KeyT': stop(); this.rotate(TIP); return;
      case 'KeyY': stop(); this.rotate(ROLL); return;
      case 'PageUp': case 'BracketRight': stop(); this.peel(1); return;
      case 'PageDown': case 'BracketLeft': stop(); this.peel(-1); return;
    }
    // walking off puts the cube away
    const mv = ['up', 'down', 'left', 'right'] as const;
    if (!this.drag && mv.some((a) => (G.input.bindings[a] || []).includes(e.code))) this.toggle(false);
  }

  private rotate(order: readonly Rot[]) {
    const d = this.drag;
    if (!d) return;
    d.rot = order[d.rot] ?? 0;
    G.audio?.ui?.('bag_rot', 0.35);
    this.retarget(this.lastPX, this.lastPY);
  }

  private peel(dir: number) {
    const spec = this.cube.spec;
    if (!spec) return;
    const cur = Math.min(this.cube.peel, spec.d);
    const n = Math.max(1, Math.min(spec.d, cur + dir));
    if (n === cur) return;
    this.cube.peel = n >= spec.d ? 99 : n;
    this.cube.applyPeel();
    G.audio?.ui?.('bag_rot', 0.3);
    this.note(n >= spec.d ? 'all layers' : `layers 1–${n} of ${spec.d}`);
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
  private lastPX = 0; private lastPY = 0;
  private hits(x: number, y: number): { view: GridView3; items: Item[] } | null {
    pointerRay(this.rc, fpCamera(), x, y);
    let best: { view: GridView3; items: Item[]; dist: number } | null = null;
    for (const v of this.views) {
      const h = v.pickAt(this.rc);
      if (h && (!best || h.dist < best.dist)) best = { view: v, items: h.a.items, dist: h.dist };
    }
    return best;
  }

  private onDown(e: PointerEvent) {
    if (!this.open || this.suspended) return;
    if (this.phase === 'opening') { this.tw.finish(); return; }
    if (this.phase !== 'open' || this.drag) return;
    if ((e.target as HTMLElement).closest('.fpk-b,.fpk-tab,.fpk-slot,.fpk-chip')) return;
    const touch = e.pointerType !== 'mouse';
    if (e.button === 1 || e.button === 2) return;
    const hit = this.hits(e.clientX, e.clientY);
    this.press = { pointerId: e.pointerId, x0: e.clientX, y0: e.clientY, t: performance.now(), touch, hit, long: 0, done: false, orbit: !hit, shift: e.shiftKey || e.ctrlKey };
    if (hit) {
      const pr = this.press;
      pr.long = window.setTimeout(() => { if (this.press === pr && !pr.done) { pr.done = true; this.press = null; this.inspect(hit.items[0], hit.view.c!); } }, LONG_MS);
    } else this.orbit = { id: e.pointerId, x: e.clientX, y: e.clientY };
  }

  private startDomPress(e: PointerEvent, it: Item, src: 'hand' | 'worn', hand?: 'R' | 'L') {
    if (this.phase !== 'open' || this.drag) return;
    this.press = { pointerId: e.pointerId, x0: e.clientX, y0: e.clientY, t: performance.now(), touch: e.pointerType !== 'mouse', hit: null, dom: { it, src, hand }, long: 0, done: false, orbit: false, shift: false };
  }

  private cancelPress() { if (this.press) clearTimeout(this.press.long); this.press = null; this.orbit = null; }

  private onMove(e: PointerEvent) {
    if (!this.open || this.suspended) return;
    this.lastPX = e.clientX; this.lastPY = e.clientY;
    const pr = this.press;
    if (pr && pr.pointerId === e.pointerId && !pr.done) {
      const moved = Math.hypot(e.clientX - pr.x0, e.clientY - pr.y0) > (pr.touch ? 10 : 5);
      if (moved) {
        clearTimeout(pr.long);
        if (pr.hit) { pr.done = true; this.press = null; this.startDrag(pr.hit.items, pr.hit.view.c!, 'grid', e, pr.hit.view); }
        else if (pr.dom) { pr.done = true; this.press = null; const p = G.local; this.startDrag([pr.dom.it], p.containerOf(pr.dom.it) || p.inv, pr.dom.src, e, null, pr.dom.hand); }
      }
    }
    if (this.orbit && this.orbit.id === e.pointerId && !this.drag) {
      const dx = e.clientX - this.orbit.x, dy = e.clientY - this.orbit.y;
      this.orbit.x = e.clientX; this.orbit.y = e.clientY;
      this.yawT = Math.max(-1.1, Math.min(1.1, this.yawT + dx * 0.008));
      this.pitchT = Math.max(0.3, Math.min(1.4, this.pitchT + dy * 0.006));
      this.root.classList.add('dragging');
      return;
    }
    if (this.drag && this.drag.pointerId === e.pointerId) { e.preventDefault(); this.retarget(e.clientX, e.clientY); return; }
    if (!this.drag && !this.press && e.pointerType === 'mouse') this.hover(e.clientX, e.clientY);
  }

  private onUp(e: PointerEvent, cancel: boolean) {
    if (!this.open) return;
    if (this.orbit && this.orbit.id === e.pointerId) { this.orbit = null; this.root.classList.remove('dragging'); }
    const d = this.drag;
    if (d && d.pointerId === e.pointerId) {
      if (cancel) this.cancelDrag(); else this.commit(d.over);
      return;
    }
    const pr = this.press;
    if (pr && pr.pointerId === e.pointerId) {
      clearTimeout(pr.long);
      this.press = null;
      if (pr.done || cancel || !pr.hit) return;
      const it = pr.hit.items[0];
      const now = performance.now();
      if (pr.shift) { this.quickMove(pr.hit.items, pr.hit.view.c!); return; }
      if (this.lastTap.uid === it.uid && now - this.lastTap.t < 360) { this.lastTap.uid = 0; this.inspect(it, pr.hit.view.c!); return; }
      this.lastTap = { uid: it.uid, t: now };
      if (pr.touch) this.showTag(it, pr.hit.items.length, pr.x0, pr.y0);
    }
  }

  private onContext(e: MouseEvent) {
    if (!this.open || this.phase !== 'open') return;
    if (this.drag) { this.rotate(TURN); return; }
    const h = this.hits(e.clientX, e.clientY);
    if (h) this.inspect(h.items[0], h.view.c!);
  }

  private onWheel(e: WheelEvent) {
    if (!this.open || this.phase !== 'open') return;
    e.preventDefault();
    const d = this.drag;
    if (d && d.stack.length > 1) { d.count = Math.max(1, Math.min(d.stack.length, d.count + (e.deltaY < 0 ? 1 : -1))); this.retarget(this.lastPX, this.lastPY); this.note('×' + d.count); return; }
    this.peel(e.deltaY < 0 ? 1 : -1);
  }

  private hover(x: number, y: number) {
    const h = this.hits(x, y);
    for (const v of this.views) v.setHover(h && h.view === v ? h.items[0] : null);
    if (h) this.showTag(h.items[0], h.items.length, x, y); else this.hideTag();
  }

  private showTag(it: Item, n: number, x: number, y: number) {
    const d = itemDef(it.key);
    const s = size3(it.key);
    const cond = d.durability || d.weapon ? ` · ${Math.round(it.cond * 100)}%` : '';
    const val = d.value ? ` · ${d.value} scrip` : '';
    const t = this.el.tag;
    t.innerHTML = `<h4>${itemName(it)}${n > 1 ? ' ×' + n : ''}</h4>${itemWeight(it).toFixed(2)} kg · ${s[0]}×${s[1]}×${s[2]}${cond}${val}<br><span class="dim">double-click: inspect &amp; work</span>`;
    t.classList.add('on');
    const w = t.offsetWidth || 200;
    t.style.left = Math.min(window.innerWidth - w - 8, x + 16) + 'px';
    t.style.top = Math.max(8, y - 60) + 'px';
  }
  private hideTag() { this.el.tag.classList.remove('on'); for (const v of this.views) v.setHover(null); }

  // ================================================================ drag
  private startDrag(stack: Item[], from: Container, src: Drag['src'], e: PointerEvent, view: GridView3 | null, hand?: 'R' | 'L') {
    const it = stack[0];
    const count = e.shiftKey && stack.length > 1 ? Math.ceil(stack.length / 2) : e.ctrlKey ? 1 : stack.length;
    const ghost = makeItemObj(it.key, ghostNone);
    const edges = boxEdges(0xffffff, 0.9);
    this.g.add(ghost.outer, edges);
    const rot = (src === 'grid' && it.rot ? it.rot : 0) as Rot;
    this.drag = { stack, count, from, src, hand, rot, pointerId: e.pointerId, over: { k: 'none' }, ghost, edges, view };
    // lift it out: the views stop drawing it
    for (const v of this.views) { for (const i of stack.slice(0, count)) v.hidden.add(i); v.refresh(); }
    this.hideTag();
    this.root.classList.add('dragging');
    G.audio?.itemSound?.(it.key, 'pick', G.local);
    this.retarget(e.clientX, e.clientY);
  }

  private cancelDrag() {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    d.ghost.outer.parent?.remove(d.ghost.outer); d.edges.parent?.remove(d.edges);
    for (const v of this.views) { v.hidden.clear(); v.refresh(); }
    this.clearDomTargets();
    this.root.classList.remove('dragging');
  }

  private clearDomTargets() { for (const el of this.root.querySelectorAll('.drop-ok,.drop-bad')) el.classList.remove('drop-ok', 'drop-bad'); }

  private retarget(x: number, y: number) {
    const d = this.drag;
    if (!d) return;
    const p = G.local;
    const it = d.stack[0];
    const def = itemDef(it.key);
    this.clearDomTargets();
    let t: Target = { k: 'none' };
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const slot = el?.closest('.fpk-slot,.fpk-tab') as HTMLElement | null;
    if (slot) {
      if (slot === this.handEls.R || slot === this.handEls.L) {
        const hand = slot === this.handEls.R ? 'R' : 'L';
        t = { k: 'hand', hand, ok: d.count === 1, el: slot };
      } else if (slot === this.wearEl) t = { k: 'wear', ok: !!(def.clothing || def.bag) && d.src !== 'worn', el: slot };
      else if (slot === this.floorEl) t = { k: 'floor', el: slot };
      else {
        const tab = this.tabEls.find((q) => q.el === slot);
        if (tab) t = { k: 'tab', c: tab.c, ok: tab.c !== d.from && (tab.c.kind === 'floor' || tab.c.hasRoom(it)), el: slot };
      }
      if (t.k !== 'none') slot.classList.add('ok' in t && !t.ok ? 'drop-bad' : 'drop-ok');
    } else {
      const ray = pointerRay(this.rc, fpCamera(), x, y);
      let best: DropAt | null = null;
      for (const v of [this.cube, this.roll, this.tray]) {
        const r = v.targetAt(ray, it, d.rot, d.count);
        if (r) { best = r; break; }
      }
      if (best) t = { k: 'grid', d: best };
    }
    d.over = t;
    void p;
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
    if (t.k === 'grid') {
      const v = t.d.view;
      reparent(v.space);
      v.boxAt(t.d.at, t.d.ex, t.d.ey, t.d.ez, _v2, _s);
      o.position.lerp(_v2, 1 - Math.exp(-28 * dt));
      fitItemObj(d.ghost, t.d.at.rot, _s.x, _s.z, _s.y);
      d.edges.position.copy(_v2); d.edges.scale.copy(_s);
      const ok = t.d.fit !== 'blocked';
      const mat = ok ? ghostOk : ghostBad;
      if (d.ghost.mesh && d.ghost.mesh.material !== mat) d.ghost.mesh.material = mat;
      (d.edges.material as THREE.LineBasicMaterial).color.setHex(ok ? 0x8dffb0 : 0xff5a46);
      d.edges.visible = true;
    } else {
      reparent(this.g);
      pointerRay(this.rc, fpCamera(), this.lastPX, this.lastPY).at(1.25, _v2);
      o.position.lerp(_v2, 1 - Math.exp(-28 * dt));
      fitItemObj(d.ghost, d.rot, 0.12, 0.12, 0.12, 0.9);
      if (d.ghost.mesh && d.ghost.mesh.material !== ghostNone) d.ghost.mesh.material = ghostNone;
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
    if (moved) this.thunk(stack[0], to); else { this.bad(); bus.emit('think', p, 'No room.'); }
  }

  private thunk(it: Item, to: Container) {
    G.audio?.ui?.(to === this.cube.c ? 'cube_place' : 'bag_place', 0.5);
    G.audio?.itemSound?.(it.key, 'drop', G.local);
    if (to === this.cube.c) { this.shakeT = Math.max(this.shakeT, 0.08 + Math.min(0.2, itemWeight(it) * 0.04)); G.missions?.set?.('pack:packed'); }
    if (to === this.roll.c) G.missions?.set?.('pack:toolroll');
    this.dirty = true;
  }
  private bad() { G.audio?.ui?.('bag_bad', 0.5); this.note("it won't go there", true); }

  private inspect(it: Item, c: Container) {
    this.cancelDrag(); this.hideTag();
    const craft = (G as any).craft;
    if (craft?.inspect) craft.inspect(it, c);
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
