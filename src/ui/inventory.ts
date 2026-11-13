import { openItemPanel, closeItemPanel, itemPanelOpen } from './itemPanel';
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
import { ensureLoot, isWorldContainer, transferItem } from '../game/worldOps';
import { bus } from '../core/events';
import { gridSpec, autoPack, settleGravity, setPlace, isEquipped } from '../items/grid';
import { isToolDef, TOOL_ROLL_LOOPS } from '../items/footprints';
import { settlePack, bestDest } from '../items/packResolver';
import { createItem } from '../items/factory';
import { fpGroup, fpClaim, fpRelease, fpOwner, fpCamera } from '../fp/fp';
import { eyeActive, eyeCamera, eyeEnter } from '../fp/eye';
import { Tweens, easeOut, easeBack, easeInOut, makeArm, poseArm, type Arm, makeBackdrop, makeItemObj, fitItemObj, type ItemObj, pointerRay, damp } from '../craft/fpKit';
import { registerCraftSounds } from '../craft/craftSounds';
import { craftSystem } from '../craft/craft';
import { debtorNo } from './holo/holo';
import { kick } from '../gfx/juice';
import { registerBagSounds } from './bag/bagSounds';
import { contactShadow } from './pack/packView';
import { containerShell, GroundTag, TagRow, Dust } from './pack/packScene';
import { buildFieldPack, buildTray, Phys, makeBody, type FieldPack, type PhysBin, type Body } from './pack/physPack';
import { arrivalRunning } from '../game/arrival';
import { ensurePack } from '../game/arrivalKit/pack';
import { texturizeSleeves } from './pack/packTex';
import { installHud12 } from './hotbar';
import { hotOf } from './hotbar/hotbar';

/**
 * THE MERIDIAN FIELD PACK, round 12: physical looting. Opening it (I, the pack on
 * the HUD, Inspect Yourself, a container you search, things on the floor) goes into
 * first person (src/fp, cinematic 'full'): you go down on one knee, swing the pack
 * off your shoulder onto the real floor in front of you (the eye view of the room
 * you are in, src/fp/eye.ts), unzip it round three sides and flop the front panel
 * over: a graphite Meridian panel-loader with an amber lining, its organiser, the
 * straps and the luggage tag with your load (src/ui/pack/physPack.ts).
 *
 * Everything is the REAL item (its own mesh, its real size) and everything is
 * physical: in the pack's main compartment, in the drawer / crate / locker you are
 * looting (set down on the right as the real thing), lying on the floor in front
 * of you, turned out of your pockets into a pouch, on the unrolled tool roll. Drag
 * an item (mouse, finger or the gamepad's cursor): your hand picks it up and it
 * swings with your movement; let go over the pack and it drops in, bounces and
 * settles on what is already there. A manila tag tied to the container you are
 * looting names it; the other tags bring other containers in reach. Right click
 * (a quick tap and hold on touch) sends a thing straight across; double-click /
 * long-press looks at it closely (src/craft); R turns what you hold; Space gives
 * the pack a shake; drag the floor to lean in or sit back; I, Esc or the flap
 * close it again. Gamepad: left stick moves the cursor, A grabs / drops, X looks
 * closer, Y shakes, B closes.
 *
 * The inventory under it is unchanged (src/items/grid: the pack's 5x5x5 cells and
 * its weight rating still decide what fits): a drop is a normal transfer, and a
 * thing the pack refuses jumps back out where it came from.
 */

interface Entry { c: Container; name: string; kind: 'pockets' | 'bag' | 'loot' | 'floor' }
type Hit = { kind: 'body'; b: Body } | { kind: 'held'; hand: 'R' | 'L'; it: Item } | { kind: 'side'; i: number } | { kind: 'lid' };
interface Press { pointerId: number; x0: number; y0: number; t: number; touch: boolean; hit: Hit | null; long: number; done: boolean; shift: boolean }
interface Drag { b: Body; from: PhysBin; pointerId: number; target: THREE.Vector3; over: PhysBin | null; ok: boolean; one: boolean }
/** what a hand is doing: reaching for something (w 0..1 from rest), its pose and palm roll */
interface Reach { o: THREE.Object3D | null; at: THREE.Vector3; w: number; pose: 'relaxed' | 'grip' | 'pinch' | 'open' | 'press' | 'flat'; roll: number }

const LONG_MS = 480;
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _s = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4();
const _plane = new THREE.Plane(), _hit = new THREE.Vector3(), _inv = new THREE.Matrix4(), _ray = new THREE.Ray();
const DEG = Math.PI / 180;
/** the eye's field of view while packing (narrower than walking: you are looking at something) */
const PACK_FOV = 54;
/** the kneeling eye (for when the eye camera is not up): height and how far ahead of the feet */
const KNEEL_EYE = { y: 1.18, fwd: 0.22 };
/** where the shoulders are, in camera space (the arms' upper arms run off-frame toward them) */
const SHOULDER = new THREE.Vector3(0.19, -0.3, -0.12);
/** how high a held thing is carried over the floor (world-local metres) */
const CARRY_Y = 0.3;
const hiliteOk = new THREE.MeshBasicMaterial({ color: 0x9ae890, transparent: true, opacity: 0.22, depthWrite: false });
const hiliteBad = new THREE.MeshBasicMaterial({ color: 0xd84a32, transparent: true, opacity: 0.26, depthWrite: false });

export class InventoryUI {
  open = false;
  ui: UI;
  root: HTMLDivElement;
  /** the eye's look-down (deg): the craft inspector reads it to come back to the same view */
  pitch = 54;
  private suspended = false;
  private built = false;
  private g!: THREE.Group;
  /** the real floor in front of you (local: x right, y up, -z ahead, origin at your feet), re-placed every frame from the eye */
  private world = new THREE.Group();
  /** the pack (blended from your shoulder to the floor) */
  private packG = new THREE.Group();
  private pack!: FieldPack;
  private phys = new Phys();
  private binPack!: PhysBin; private binPockets!: PhysBin; private binRoll!: PhysBin; private binSrc!: PhysBin; private binFloor!: PhysBin;
  private srcHold = new THREE.Group();
  private pocketG = new THREE.Group();
  private rollG = new THREE.Group();
  private floorG = new THREE.Group();
  private srcShell: THREE.Object3D | null = null;
  private srcKey = '';
  private srcShadow!: THREE.Mesh;
  private packShadow!: THREE.Mesh;
  private hilite = new Map<PhysBin, THREE.Mesh>();
  private byUid = new Map<number, Body>();
  private arms: Arm[] = [];
  private backdrop!: THREE.Mesh;
  private carpet!: THREE.Mesh;
  private dust = new Dust();
  private tw = new Tweens();
  private phase: 'off' | 'waiting' | 'opening' | 'open' | 'closing' = 'off';
  private waitT = 0;
  private lastClose = -1e9;
  /** the pack on your shoulder (1) or on the floor (0) */
  private held = 1;
  private setOut = 0;
  private pitchT = 54;
  private shakeT = 0;
  private hookFn: ((dt: number) => void) | null = null;
  private anchorM = new THREE.Matrix4();
  private synth = new THREE.PerspectiveCamera(54, 1, 0.05, 20);
  private packZ = 0.66;
  private kneeling = false;
  private gtag!: GroundTag;
  private tags!: TagRow;
  private band: THREE.Group | null = null;
  private note!: HTMLDivElement;
  private help!: HTMLDivElement;
  private cursor!: HTMLDivElement;
  private noteT = 0;
  private reach: { L: Reach; R: Reach } = { L: this.mkReach(), R: this.mkReach() };
  private palm = { R: new THREE.Vector3(), L: new THREE.Vector3() };
  private heldObjs: { R: ItemObj | null; L: ItemObj | null } = { R: null, L: null };
  private heldKey = { R: 0, L: 0 };
  // data
  private side: Entry[] = [];
  private sideSel = 0;
  private sideRef = 'floor';
  private focusRef = '';
  private floorC: Container | null = null;
  private scanT = 0; private settleT = 0; private loadT = 0; private kitT = 2;
  private dirty = true;
  private fresh = true;
  private drag: Drag | null = null;
  private press: Press | null = null;
  private orbit: { id: number; x: number; y: number } | null = null;
  private lastTap = { uid: 0, t: 0 };
  private hover: Body | null = null;
  private rc = new THREE.Raycaster();
  private lastT = performance.now();
  private lastPX = 0; private lastPY = 0;
  private sideSig = '';
  private impactT = 0;
  private pad = { on: false, x: 0, y: 0, a: false, b: false, x2: false, y2: false, id: -77 };

  constructor(ui: UI) {
    this.ui = ui;
    registerCraftSounds(); registerBagSounds();
    const r = document.createElement('div');
    r.className = 'fpk';
    r.id = 'bag-root';
    document.body.appendChild(r);
    this.root = r;
    this.note = document.createElement('div'); this.note.className = 'pk12-note'; r.appendChild(this.note);
    this.help = document.createElement('div'); this.help.className = 'pk12-help'; r.appendChild(this.help);
    this.cursor = document.createElement('div'); this.cursor.className = 'pk12-cursor'; r.appendChild(this.cursor);
    const st = document.createElement('style');
    st.textContent = `.pk12-note{position:fixed;left:50%;bottom:96px;transform:translateX(-50%);font-family:var(--font-new);font-size:32px;line-height:32px;color:#ffe8a8;text-shadow:2px 2px 0 #0b0a07,-2px 0 0 #0b0a07,0 -2px 0 #0b0a07;pointer-events:none;opacity:0;transition:opacity .2s;white-space:nowrap}
.pk12-note.on{opacity:1}.pk12-note.bad{color:#ff8a6a}
.pk12-help{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);display:flex;gap:6px;font-family:var(--font-new);font-size:13px;line-height:13px;pointer-events:none;white-space:nowrap;opacity:.85}
.pk12-help kbd{font:inherit;padding:3px 7px 4px;color:#e8dcb8;background:linear-gradient(#4a4a40,#2a2a24);box-shadow:inset 0 -2px 0 #14140f,inset 0 1px 0 #6a6a5c,0 0 0 1px #0b0a07;text-shadow:1px 1px 0 #0b0a07}
.pk12-cursor{position:fixed;width:16px;height:16px;margin:-8px 0 0 -8px;border:3px solid #ffe08a;border-radius:0;box-shadow:0 0 0 2px #0b0a07;pointer-events:none;display:none}
#bag-root.pad .pk12-cursor{display:block}`;
    r.appendChild(st);
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
    // round 12: the adaptive context buttons and the hotbar
    try { installHud12(); } catch (e) { console.warn('hud12', e); }
  }

  /** older scripts call it the hover tag */
  get hoverTag() { return this.gtag; }

  private mkReach(): Reach { return { o: null, at: new THREE.Vector3(), w: 0, pose: 'relaxed', roll: 0 }; }

  // ================================================================ 3D scene
  private build() {
    if (this.built) return;
    this.built = true;
    const g = (this.g = fpGroup('pack'));
    this.backdrop = makeBackdrop();
    (this.backdrop.material as THREE.MeshBasicMaterial).opacity = 0.95;
    g.add(this.backdrop);
    this.world.matrixAutoUpdate = false;
    this.packG.matrixAutoUpdate = false;
    g.add(this.world, this.packG);
    // light like the room: a soft overhead key, a cool bounce off the floor, a warm kicker from the side
    const W = this.world;
    W.add(new THREE.HemisphereLight(0xcfc8b4, 0x2e2a22, 0.55));
    const key = new THREE.DirectionalLight(0xffe6c4, 1.8); key.position.set(-0.6, 3.2, 0.4); key.target.position.set(0, 0, -0.7); W.add(key, key.target);
    const fill = new THREE.DirectionalLight(0x8090a8, 0.28); fill.position.set(1.4, 0.6, 0.6); fill.target.position.set(0, 0, -0.7); W.add(fill, fill.target);
    const rim = new THREE.DirectionalLight(0xfff0d8, 0.5); rim.position.set(0.4, 1.2, -3); rim.target.position.set(0, 0, -0.7); W.add(rim, rim.target);
    // the carpet (fallback only: in the eye the real floor is there)
    const cg = new THREE.PlaneGeometry(3.4, 2.4, 1, 1); cg.rotateX(-Math.PI / 2);
    this.carpet = new THREE.Mesh(cg, new THREE.MeshStandardMaterial({ color: 0x8a7c4a, roughness: 1, metalness: 0 }));
    this.carpet.position.set(0, -0.001, -0.9);
    W.add(this.carpet);
    // the pack
    this.pack = buildFieldPack();
    this.packG.add(this.pack.root);
    this.packShadow = contactShadow(0.62, 0.8, 0.55); W.add(this.packShadow);
    this.srcShadow = contactShadow(0.6, 0.52, 0.45); this.srcHold.add(this.srcShadow);
    // the pouch your pockets turn out into, the unrolled tool roll, a patch of floor, the container being looted
    const pouch = buildTray('pouch', 0.26, 0.17);
    this.pocketG.add(pouch.root);
    const roll = buildTray('roll', 0.17, 0.42);
    this.rollG.add(roll.root);
    W.add(this.pocketG, this.rollG, this.floorG, this.srcHold, this.dust.points);
    const P = this.pack.inner;
    this.binPack = this.phys.add({ id: 'pack', frame: this.pack.root, min: P.min.clone(), max: P.max.clone(), catchM: 0.06, bodies: [] });
    this.binPockets = this.phys.add({ id: 'pockets', frame: this.pocketG, min: pouch.inner.min, max: pouch.inner.max, catchM: 0.05, bodies: [] });
    this.binRoll = this.phys.add({ id: 'roll', frame: this.rollG, min: roll.inner.min, max: roll.inner.max, catchM: 0.04, bodies: [] });
    this.binSrc = this.phys.add({ id: 'src', frame: this.srcHold, min: new THREE.Vector3(-0.2, 0.0, -0.15), max: new THREE.Vector3(0.2, 0.4, 0.15), catchM: 0.05, bodies: [] });
    this.binFloor = this.phys.add({ id: 'floor', frame: this.floorG, min: new THREE.Vector3(-0.3, 0.0, -0.12), max: new THREE.Vector3(0.3, 0.6, 0.12), catchM: 0.02, bodies: [] });
    for (const bin of this.phys.bins) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), hiliteOk);
      m.visible = false; m.renderOrder = 3; m.raycast = () => { /* not a target */ };
      bin.frame.add(m); this.hilite.set(bin, m);
    }
    this.phys.onImpact = (b, v) => {
      if (this.impactT > 0 || this.phase !== 'open') return;
      this.impactT = 0.06;
      if (b.bin === this.binPack) G.audio?.ui?.('bag_place', Math.min(0.5, 0.15 + v * 0.12));
      else G.audio?.itemSound?.(b.key, 'drop', G.local);
    };
    this.gtag = new GroundTag(W);
    this.tags = new TagRow(W);
    for (const s of [1, -1] as const) { const a = makeArm(s, 1.05); texturizeSleeves(a.root); g.add(a.root); this.arms.push(a); }
    // the BAILIFF band on the left wrist (its lamp shows it is live)
    const band = new THREE.Group();
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.032, 0.036, 10), new THREE.MeshStandardMaterial({ color: 0x8a8e94, roughness: 0.35, metalness: 0.85 }));
    cuff.scale.set(1, 1, 0.84);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.0355, 0.0355, 0.008, 10, 1, true), new THREE.MeshStandardMaterial({ color: 0xd8a42a, roughness: 0.5, side: THREE.DoubleSide }));
    ring.scale.set(1, 1, 0.84); ring.position.y = 0.004;
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.004, 6, 4), new THREE.MeshBasicMaterial({ color: 0x5aff7a }));
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
    const srcOn = this.srcShown();
    const sz = this.srcSize();
    this.packZ = wide ? 0.72 : 0.92;
    const pz = -this.packZ;
    this.packShadow.position.set(0, 0.002, pz);
    const setBin = (bin: PhysBin, w: number, l: number) => { bin.min.set(-w / 2, bin.min.y, -l / 2); bin.max.set(w / 2, bin.max.y, l / 2); };
    if (wide) {
      // the panel lies open to the left of the pack, the tool roll beyond it; the container on the right
      // with your pockets' pouch in front of it; loose things on the floor beyond everything
      this.rollG.position.set(-0.5, 0.002, pz - 0.44); this.rollG.rotation.set(0, Math.PI / 2 + 0.06, 0);
      this.srcHold.position.set(0.3 + sz[0] / 2 + 0.06, 0.002, pz - 0.08); this.srcHold.rotation.set(0, -0.14, 0);
      this.pocketG.position.set(0.44, 0.002, pz + 0.3); this.pocketG.rotation.set(0, -0.08, 0);
      if (srcOn) { this.floorG.position.set(0.32, 0.002, pz - 0.5); setBin(this.binFloor, 0.9, 0.18); }
      else { this.floorG.position.set(0.56, 0.002, pz - 0.06); setBin(this.binFloor, 0.5, 0.5); }
    } else {
      // portrait: the pack up the picture, the container below it on the right, pockets and floor below on the left
      this.rollG.position.set(-0.3, 0.002, pz - 0.42); this.rollG.rotation.set(0, Math.PI / 2, 0);
      this.srcHold.position.set(0.14, 0.002, pz + 0.5); this.srcHold.rotation.set(0, -0.1, 0);
      this.pocketG.position.set(-0.22, 0.002, pz + 0.48); this.pocketG.rotation.set(0, 0.12, 0);
      if (srcOn) { this.floorG.position.set(0.0, 0.002, pz + 0.72); setBin(this.binFloor, 0.5, 0.1); }
      else { this.floorG.position.set(0.14, 0.002, pz + 0.52); setBin(this.binFloor, 0.3, 0.3); }
    }
    setBin(this.binSrc, sz[0], sz[1]);
    this.binSrc.min.y = 0.0;
    this.srcShadow.scale.set((sz[0] + 0.08) / 0.6, 1, (sz[1] + 0.08) / 0.52);
    for (const [bin, m] of this.hilite) {
      m.position.set((bin.min.x + bin.max.x) / 2, bin.min.y + 0.003, (bin.min.z + bin.max.z) / 2);
      m.scale.set(bin.max.x - bin.min.x, 1, bin.max.z - bin.min.z);
    }
    this.carpet.visible = this.backdrop.visible = !eyeActive();
  }
  private srcShown() { const e = this.side[this.sideSel]; return !!e && e.kind !== 'floor' && e.kind !== 'pockets'; }
  /** the looted container's footprint (metres), from its grid */
  private srcSize(): [number, number] {
    const e = this.side[this.sideSel];
    const spec = e && e.kind !== 'floor' ? gridSpec(e.c) : null;
    if (!spec) return [0.4, 0.3];
    return [Math.max(0.26, Math.min(0.46, spec.w * 0.055)), Math.max(0.2, Math.min(0.4, spec.h * 0.055))];
  }

  // ================================================================ the floor, from your eyes
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
    _m.makeTranslation(0, 0, -this.packZ);
    const floorM = _m.premultiply(this.world.matrix);
    const fp = _v.setFromMatrixPosition(floorM);
    _q.setFromRotationMatrix(floorM);
    const h = this.held;
    if (h > 0.001) {
      const shoulder = _v2.set(0.42, 0.12, -0.2);
      _q2.setFromEuler(new THREE.Euler(1.2, -0.9, -0.5));
      const pos = fp.clone().lerp(shoulder, h);
      pos.y += Math.sin(h * Math.PI) * 0.12;
      _q.slerp(_q2, h);
      this.packG.matrix.compose(pos, _q, _s.set(1, 1, 1));
    } else this.packG.matrix.compose(fp, _q, _s.set(1, 1, 1));
    if (this.shakeT > 0) { const k = Math.max(0, this.shakeT) * 0.03; this.packG.matrix.multiply(_m.makeTranslation((Math.random() - 0.5) * k, Math.abs(Math.random() - 0.5) * k, (Math.random() - 0.5) * k)); }
    this.packG.matrixWorldNeedsUpdate = true;
    this.packG.updateMatrixWorld(true);
    this.packShadow.visible = h < 0.3;
    (this.packShadow.material as THREE.MeshBasicMaterial).opacity = 0.55 * Math.max(0, 1 - h * 3.3);
    // the held thing follows the pointer (after the floor has moved, so it never lags a frame)
    if (this.drag) this.dragFollow(dt);
    this.poseArms(dt);
    this.poseHeld(dt);
  }
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
    // (also brings it back while it is still closing, or suspended under a close-up)
    this.toggle(true);
    this.scanT = 0;
  }
  /** a container searched in the world (src/interact/verbs.ts openLoot) */
  openLoot(c: Container, _src?: unknown) { this.focus(c); }
  /** what lies on the floor around you, as real things to pick up */
  lootFloor() { this.sideRef = 'floor'; this.focusRef = ''; const was = this.open && this.phase !== 'closing' && !this.suspended; this.toggle(true); if (was) { this.scanT = 0; this.selectSide('floor'); } }

  private cubeC(): Container | null {
    const back = G.local?.worn.get('back' as any);
    const sp = back?.inv ? gridSpec(back.inv) : null;
    return sp && sp.d > 1 ? back!.inv! : back?.inv ?? null;
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
    if (!fpClaim('pack', 1.5, { cinematic: 'full', eyePitch: this.pitchT })) return;
    this.open = true; this.suspended = false;
    this.phase = 'waiting'; this.waitT = 0;
    this.root.classList.add('on');
    G.hudBody?.setHidden?.('pack', true);
    G.input.pointerOverUI = true;
    this.anchorM.makeRotationY(-(p.facing ?? 0) - Math.PI / 2).setPosition(p.x, p.y ?? 0, p.z);
    if (!p.full && !p.sittingOn && !p.inVehicle && p.stance !== 'swim') { p.full = 'kneel'; this.kneeling = true; }
    this.scanNearby();
    this.pitch = this.pitchT = (fpCamera().aspect >= 1.2 ? 57 : 60);
    this.layout();
    this.sideSig = '';
    this.fresh = true;
    this.refresh();
    this.renderSide();
    this.resetParts();
    this.updateTag();
    // round 17: no sentence along the bottom: a few key caps, for the first few opens only
    let opens = 0;
    try { opens = Number(localStorage.getItem('pack.opens') ?? 0) || 0; localStorage.setItem('pack.opens', String(opens + 1)); } catch { /* private window */ }
    const coarse = matchMedia('(pointer: coarse)').matches;
    this.help.innerHTML = opens >= 3 || coarse ? '' : ['RMB', 'SHIFT', 'R', 'SPACE', 'I'].map((k) => `<kbd>${k}</kbd>`).join('');
    this.hook();
  }

  /** everything back to how it is on your back: zipped, the panel shut, nothing set out */
  private resetParts() {
    this.pack.setOpen(0); this.pack.setZip(0);
    this.held = 1; this.setOutK(0);
    for (const h of ['L', 'R'] as const) { const r = this.reach[h]; r.o = null; r.w = 1; r.pose = 'grip'; r.roll = 0; }
  }

  private hide() {
    this.endDrag(true); this.cancelPress(); this.gtag?.hide();
    const was = this.phase;
    this.tw.finish();
    this.phase = 'closing';
    if (was === 'waiting') { this.finishClose(); return; }
    G.audio?.ui?.('bag_zip', 0.45);
    const tw = this.tw, pk = this.pack;
    this.grab('L', 'lid', 'grip', -0.6); this.grab('R', null, 'relaxed');
    this.reach.L.w = 1;
    tw.add(0.26, (k) => pk.setOpen(1 - k), easeInOut);
    tw.add(0.22, (k) => { pk.setZip(1 - k); this.setOutK(1 - k); }, easeOut, () => G.audio?.ui?.('bag_zip', 0.35), 0.24);
    tw.add(0.01, () => {}, easeOut, () => { this.grab('L', 'grip', 'grip', -Math.PI / 2); this.grab('R', 'grip', 'grip', -Math.PI / 2); }, 0.44);
    tw.add(0.3, (k) => { this.held = k; }, easeInOut, () => this.finishClose(), 0.46);
  }
  private reopen() { this.tw.clear(); this.phase = 'opening'; this.openSeq(true); }

  private finishClose() {
    this.open = false; this.suspended = false;
    this.phase = 'off';
    this.tw.clear();
    this.root.classList.remove('on', 'pad');
    this.unhook();
    fpRelease('pack');
    G.input.pointerOverUI = false;
    this.lastClose = performance.now();
    this.gtag?.hide();
    const p = G.local;
    if (p && this.kneeling && p.full === 'kneel') p.full = '';
    this.kneeling = false;
    G.hudBody?.setHidden?.('pack', false);
    this.ui.closeMenu?.();
  }

  private suspend() {
    this.suspended = true;
    this.endDrag(true); this.cancelPress(); this.gtag?.hide();
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

  /** the things round the pack set out (0..1): the container set down, the pouch, the roll */
  private setOutK(k: number) {
    this.setOut = k;
    const e = Math.max(0, Math.min(1, k));
    const on = e > 0.01;
    this.srcHold.visible = on && this.srcShown();
    this.pocketG.visible = on; this.rollG.visible = on && !!this.rollC(); this.floorG.visible = on;
    if (this.tags) this.tags.g.visible = on;
    this.srcHold.position.y = 0.002 + (1 - e) * 0.18;
    this.pocketG.scale.set(Math.max(0.01, e), 1, Math.max(0.01, e));
    this.rollG.scale.set(Math.max(0.01, e), 1, 1);
  }

  /** a hand reaches for a part (null = back to rest) */
  private grab(h: 'L' | 'R', part: string | null, pose: Reach['pose'], roll = 0) {
    const r = this.reach[h];
    const pk = this.pack;
    let o: THREE.Object3D | null = null;
    const at = r.at.set(0, 0, 0);
    switch (part) {
      case 'grip': o = pk.root; at.set((h === 'L' ? -1 : 1) * (pk.W / 2 + 0.03), pk.H * 0.6, 0.05); break;
      case 'pull': o = pk.pull; at.set(0, 0.03, 0.03); break;
      case 'lid': o = pk.lidEdge; at.set(0, 0.02, 0.05); break;
    }
    r.o = o; r.pose = pose; r.roll = roll;
  }

  /** the open: kneel, the pack off your shoulder onto the floor, the zips round, the front panel over */
  private openSeq(quick: boolean) {
    const tw = this.tw, pk = this.pack;
    tw.clear();
    const sp = quick ? 0.5 : 0.75;
    const reachW = (h: 'L' | 'R', to: number, dur: number, at: number) => { const r = this.reach[h]; let from = r.w; tw.add(dur, (k) => { if (k === 0) from = r.w; r.w = from + (to - from) * k; }, easeInOut, undefined, at); };
    let t = 0;
    if (this.held > 0.5) {
      this.grab('L', 'grip', 'grip', -Math.PI / 2); this.grab('R', 'grip', 'grip', -Math.PI / 2);
      this.reach.L.w = this.reach.R.w = 1;
      tw.add(0.5 * sp + 0.12, (k) => { this.held = 1 - k; }, (x) => x * x * (1.6 - 0.6 * x), () => {
        this.held = 0;
        G.audio?.ui?.('bag_place', 0.6);
        this.shakeT = 0.22; kick(0, 1, 0.07);
        this.dust.puff(0, -this.packZ, pk.W, pk.L);
        // what is inside rattles down
        for (const b of this.binPack.bodies) { b.sleep = 0; b.vel.y += 0.4 + Math.random() * 0.3; }
      });
      t += 0.5 * sp + 0.12;
    } else this.held = 0;
    tw.add(0.32, (k) => this.setOutK(k), easeBack, undefined, t);
    // the zips: a pull in the right hand, round three sides
    tw.add(0.01, () => {}, easeOut, () => { this.grab('R', 'pull', 'pinch', -0.3); this.grab('L', 'lid', 'flat', 0.2); G.audio?.ui?.('bag_zip', 0.6); }, t);
    reachW('R', 1, 0.14 * sp, t); reachW('L', 0.6, 0.14 * sp, t);
    tw.add(0.5 * sp, (k) => pk.setZip(k), easeInOut, undefined, t + 0.1 * sp);
    t += 0.6 * sp;
    // the panel: lift its edge and flop it over to the left
    tw.add(0.01, () => {}, easeOut, () => { this.grab('L', 'lid', 'grip', -0.6); this.grab('R', null, 'relaxed'); }, t);
    reachW('L', 1, 0.12 * sp, t); reachW('R', 0, 0.2 * sp, t);
    t += 0.1 * sp;
    tw.add(0.5 * sp, (k) => pk.setOpen(k), (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2), () => { G.audio?.ui?.('bag_place', 0.35); this.dust.puff(-pk.W, -this.packZ, pk.W, pk.L * 0.8); }, t);
    reachW('L', 0, 0.25 * sp, t + 0.35 * sp);
    t += 0.5 * sp;
    tw.add(0.01, () => {}, easeOut, () => this.ready(), t);
  }

  private ready() {
    this.phase = 'open';
    this.held = 0;
    this.setOutK(1);
    this.pack.setOpen(1); this.pack.setZip(1);
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
    const out: Entry[] = [];
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
    if (sel < 0) sel = out.findIndex((e) => e.kind === 'loot');
    if (sel < 0) sel = out.length - 1;
    if (sel !== this.sideSel) this.srcKey = '';
    this.sideSel = sel;
    this.sideRef = this.refOf(out[sel]);
  }
  private refOf(e: Entry) { return e.kind === 'pockets' ? 'pockets' : e.kind === 'floor' ? 'floor' : e.c.owner || String(e.c.uid); }
  private selectSide(ref: string) {
    const i = this.side.findIndex((e) => this.refOf(e) === ref);
    if (i < 0) return;
    this.sideSel = i; this.sideRef = ref; this.sideSig = ''; this.srcKey = '';
    this.layout(); this.dressSrc(); this.renderSide(); this.setOutK(this.setOut);
    this.dirty = true;
  }
  /** the container set down for real: a drawer, a crate, a box... (the floor shows none) */
  private dressSrc() {
    const e = this.side[this.sideSel];
    const on = this.srcShown();
    this.srcHold.visible = on && this.setOut > 0.01;
    if (!on || !e) return;
    const spec = gridSpec(e.c);
    const [w, d] = this.srcSize();
    const style = spec?.style ?? 'cardboard';
    const key = style + ':' + w.toFixed(3) + ':' + d.toFixed(3);
    if (key === this.srcKey) return;
    this.srcKey = key;
    if (this.srcShell) { this.srcShell.parent?.remove(this.srcShell); this.srcShell = null; }
    const sh = containerShell(style === 'floor' || style === 'pile' ? 'cardboard' : style, w, d) ?? containerShell('cardboard', w, d);
    if (sh) { sh.position.y = 0.014; this.srcHold.add(sh); this.srcShell = sh; }
    this.binSrc.min.y = 0.004;
  }

  /** the shown bins and what is in each (worn and in-hand things are on you, not in a bin) */
  private binContainers(): [PhysBin, Container | null][] {
    const p = G.local;
    const e = this.side[this.sideSel];
    return [
      [this.binPack, this.cubeC()],
      [this.binPockets, p.inv],
      [this.binRoll, this.rollC()],
      [this.binSrc, this.srcShown() ? e.c : null],
      [this.binFloor, this.floorC],
    ];
  }
  /** a bin's container, if it is showing one */
  private binC(bin: PhysBin | null): Container | null { return bin ? this.binContainers().find(([b]) => b === bin)?.[1] ?? null : null; }

  /** the stacks in a container: same thing in the same cell is one body */
  private groups(c: Container): Item[][] {
    const p = G.local;
    const m = new Map<string, Item[]>();
    for (const it of c.items) {
      if (p.isWorn(it) || it === p.handR || it === p.handL) continue;
      const k = it.key + '@' + (it.gx ?? 'x') + ',' + (it.gy ?? 'y') + ',' + (it.gz ?? 0);
      let a = m.get(k); if (!a) m.set(k, (a = []));
      a.push(it);
    }
    let out = [...m.values()];
    // a heap of loose things: past forty, stacks go by kind
    if (out.length > 40) {
      const byKey = new Map<string, Item[]>();
      for (const g of out) { const a = byKey.get(g[0].key); if (a) a.push(...g); else byKey.set(g[0].key, [...g]); }
      out = [...byKey.values()].slice(0, 40);
    }
    return out;
  }

  /** bodies in step with the inventory: new things fall in, gone things go, moved things move */
  private refresh() {
    if (!this.built) return;
    const now = performance.now() / 1000;
    const claimed = new Set<Body>();
    for (const [bin, c] of this.binContainers()) {
      if (!c) continue;
      for (const grp of this.groups(c)) {
        let b: Body | undefined;
        for (const it of grp) { const q = this.byUid.get(it.uid); if (q && !claimed.has(q)) { b = q; break; } }
        if (!b) {
          b = makeBody(grp);
          const sp = this.phys.spawnSpot(b, bin, grp[0].uid);
          this.phys.place(b, bin, sp.x, sp.y + (this.fresh ? 0 : 0.12), sp.z);
        } else {
          b.items = grp;
          if (b.bin !== bin && !b.held && b.pendT < now) {
            const sp = this.phys.spawnSpot(b, bin, grp[0].uid + 7);
            this.phys.place(b, bin, sp.x, sp.y + 0.15, sp.z);
          }
        }
        for (const it of grp) this.byUid.set(it.uid, b);
        claimed.add(b);
      }
    }
    for (const bin of this.phys.bins) for (const b of [...bin.bodies]) {
      if (claimed.has(b) || b.held || b.pendT > now) continue;
      this.phys.remove(b);
      for (const it of b.items) if (this.byUid.get(it.uid) === b) this.byUid.delete(it.uid);
    }
    if (this.drag && !claimed.has(this.drag.b) && this.drag.b.pendT < now) {
      // what you were holding went away (somebody took it): let go
      const b = this.drag.b; this.drag = null; b.held = false; b.holder.parent?.remove(b.holder);
    }
    if (this.fresh) { this.fresh = false; this.phys.settle(1.4); }
    this.updateTag();
  }

  private updateTag() {
    const p = G.local; if (!p || !this.pack) return;
    const c = this.cubeC();
    const w = c ? c.carriedWeight() : 0;
    // round 17: the load as a gauge against the rating, the kilos and the count as numbers
    this.pack.setTag([debtorNo(p) || 'UNIT', `${w.toFixed(1)} / ${c ? c.capacity : 0} KG`, `${c ? c.items.length : 0} ×`], c && c.capacity ? w / c.capacity : 0);
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
    if (this.kitT > 0) { this.kitT -= dt; if (this.kitT <= 0 && !this.ensureKit(p)) this.kitT = 2; }
    if (G.input.hit('toolDraw' as any) && !G.input.textFocus && !(G as any).craft?.busy?.()) this.quickDraw();
    (G as any).craft?.update?.();
    if (!this.open) return;
    if (!this.suspended) this.hook();
    if (this.phase === 'waiting') {
      this.waitT += dt;
      if (eyeActive() || this.waitT > 0.9) { this.phase = 'opening'; this.layout(); this.openSeq(performance.now() - this.lastClose < 30000); }
    }
    this.tw.update(dt);
    if (this.suspended) return;
    this.pollPad(dt);
    this.scanT -= dt;
    if (this.scanT <= 0 && !this.drag) { this.scanT = 0.45; this.scanNearby(); this.dirty = true; }
    if (this.dirty) {
      this.dirty = false;
      this.layout(); this.dressSrc();
      this.setOutK(this.phase === 'open' ? 1 : this.setOut);
      this.refresh();
      this.renderSide();
    }
    this.impactT -= dt;
    this.phys.step(dt);
    for (const bin of this.phys.bins) for (const b of bin.bodies) {
      const want = b === this.hover ? 1 : 0;
      let moved = false;
      if (b.glow !== want) { b.glow += (want - b.glow) * Math.min(1, dt * 14); if (Math.abs(b.glow - want) < 0.01) b.glow = want; moved = true; }
      // round 17: the thing under the pointer turns on the spot; let go, it turns back to how it lay
      if (want) { b.spin = ((b.spin ?? 0) + dt * 2.2) % (Math.PI * 2); moved = true; }
      else if (b.spin) { const r = Math.atan2(Math.sin(b.spin), Math.cos(b.spin)); b.spin = Math.abs(r) < 0.02 ? 0 : r * (1 - Math.min(1, dt * 8)); moved = true; }
      if (moved) this.phys.sync(b);
    }
    if (this.shakeT > 0) this.shakeT -= dt;
    this.dust.update(dt);
    this.noteT -= dt;
    if (this.noteT <= 0) this.note.classList.remove('on');
    this.loadT -= dt;
    if (this.loadT <= 0) { this.loadT = 0.5; this.updateTag(); }
    this.placeSide();
  }

  // ================================================================ arms and hands
  private poseArms(dt: number) {
    const [aR, aL] = this.arms;
    this.world.updateMatrixWorld(true);
    // at rest: the left hand on the pack's near-left rim, the right on the floor by its near-right corner
    const pk = this.pack;
    if (this.held < 0.05) {
      this.palm.L.set(-pk.W / 2 + 0.05, pk.H + 0.01, pk.L / 2 - 0.06).applyMatrix4(pk.root.matrixWorld);
      this.palm.R.set(pk.W / 2 + 0.05, 0.02, pk.L / 2 + 0.02).applyMatrix4(pk.root.matrixWorld);
    } else {
      this.palm.L.set(-0.3, 0.02, -0.4).applyMatrix4(this.world.matrix);
      this.palm.R.set(0.3, 0.02, -0.4).applyMatrix4(this.world.matrix);
    }
    for (const [a, h] of [[aL, 'L'], [aR, 'R']] as const) {
      const r = this.reach[h];
      let goal = _v.copy(this.palm[h]);
      let pose = r.pose, roll = r.roll, w = r.w;
      if (h === 'R' && this.drag) {
        // the right hand has the thing: wrist just above it, fingers round it
        this.drag.b.holder.getWorldPosition(_v2);
        goal = _v.copy(_v2).add(_s.set(0.02, 0.035, 0.03));
        pose = this.drag.b.hx > 0.06 || this.drag.b.hz > 0.06 ? 'grip' : 'pinch'; roll = -0.5; w = 1;
      } else if (r.o && r.w > 0.001) {
        r.o.updateWorldMatrix(true, false);
        const at = _v2.copy(r.at).applyMatrix4(r.o.matrixWorld);
        goal = _v.copy(this.palm[h]).lerp(at, Math.min(1, r.w));
      }
      a.target.lerp(goal, 1 - Math.exp(-(this.drag && h === 'R' ? 26 : this.phase === 'open' ? 16 : 22) * dt));
      const sh = _s.set(SHOULDER.x * a.side, SHOULDER.y, SHOULDER.z);
      a.elbow.copy(sh).lerp(a.target, 0.42).add(_v2.set(a.side * 0.07, -0.08, 0.04));
      const holding = h === 'R' ? !!G.local?.handR : !!(G.local?.handL && G.local.handL !== G.local.handR);
      const atRest = !(h === 'R' && this.drag) && (!r.o || w < 0.3);
      a.want = atRest ? (holding ? 'grip' : 'relaxed') : pose;
      poseArm(a, atRest ? Math.PI * 0.92 : roll, dt);
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
        o.outer.visible = this.held < 0.5 && this.reach[h].w < 0.3 && !(h === 'R' && this.drag);
        this.arms[h === 'R' ? 0 : 1].fp.grip.getWorldPosition(_v);
        o.outer.position.lerp(_v, 1 - Math.exp(-20 * dt));
        o.outer.rotation.set(0.4, h === 'R' ? -0.6 : 0.6, 0);
      }
    }
  }

  // ================================================================ tags
  private renderSide() {
    const sig = this.side.map((e) => e.c.uid + e.name).join('|') + '#' + this.sideSel;
    if (sig === this.sideSig) return;
    this.sideSig = sig;
    this.placeSide(true);
  }
  /** the container tags lie on the floor beyond the container, tied to it */
  private placeSide(force = false) {
    if (!this.tags || (!force && !this.side.length)) return;
    const idx = this.side.map((_, i) => i);
    const show = idx.length <= 5 ? idx : [...idx.slice(0, 4), idx.length - 1];
    if (!show.includes(this.sideSel)) show[show.length - 2] = this.sideSel;
    const names = show.map((i) => ({ name: this.side[i].name, i, n: this.side[i].c.items.length, fill: this.side[i].c.capacity ? Math.min(1, this.side[i].c.contentWeight() / this.side[i].c.capacity) : 0 }));
    const wide = fpCamera().aspect >= 1.2;
    const base = this.srcShown() ? this.srcHold.position : this.floorG.position;
    const [sw, sd] = this.srcShown() ? this.srcSize() : [0.5, 0.6];
    const spots: THREE.Vector3[] = [];
    const n = names.length;
    for (let k = 0; k < n; k++) {
      if (wide) spots.push(new THREE.Vector3(base.x - sw / 2 + 0.06 + k * 0.13, 0.004, base.z - sd / 2 - 0.09 - (k % 2) * 0.035));
      else spots.push(new THREE.Vector3(base.x - sw / 2 + 0.05 + k * 0.1, 0.004, base.z - sd / 2 - 0.08 - (k % 2) * 0.03));
    }
    const knot = new THREE.Vector3(base.x - sw / 4, 0.03, base.z - sd / 2);
    this.tags.set(names, this.sideSel, spots, knot);
  }

  private note_(text: string, bad = false) {
    this.note.textContent = text;
    this.note.classList.add('on'); this.note.classList.toggle('bad', bad);
    this.noteT = 1.8;
  }

  // ================================================================ keys
  private onKey(e: KeyboardEvent) {
    if (!this.open || this.suspended || G.input.textFocus || itemPanelOpen()) return;
    if (this.phase === 'opening' || this.phase === 'waiting') { if (e.code !== 'KeyI' && e.code !== 'Escape') { if (this.phase === 'opening') this.tw.finish(); e.stopImmediatePropagation(); e.preventDefault(); return; } }
    const stop = () => { e.stopImmediatePropagation(); e.preventDefault(); };
    if (e.code === 'Escape' || (G.input.bindings.inventory || []).includes(e.code)) { stop(); if (!e.repeat) this.toggle(false); return; }
    if (this.phase !== 'open') { stop(); return; }
    switch (e.code) {
      case 'KeyR': stop(); this.turnHeld(); return;
      case 'Space': stop(); if (!e.repeat) this.shake(); return;
      case 'KeyP': stop(); if (!e.repeat) { this.toggle(false); setTimeout(() => (G as any).selfInspect?.toggle?.(true), 400); } return;
    }
    const mv = ['up', 'down', 'left', 'right'] as const;
    if (!this.drag && mv.some((a) => (G.input.bindings[a] || []).includes(e.code))) this.toggle(false);
  }
  private turnHeld() {
    const d = this.drag;
    G.audio?.ui?.('bag_rot', 0.35);
    if (d) { const b = d.b; [b.hx, b.hz] = [b.hz, b.hx]; b.yaw += Math.PI / 2; return; }
    const b = this.hover;
    if (b) { b.yaw += Math.PI / 2; [b.hx, b.hz] = [b.hz, b.hx]; b.sleep = 0; b.vel.y = 0.6; }
  }

  /** shake the pack: everything jumps and settles (and the cells are packed tight underneath) */
  shake(c?: Container) {
    if (this.drag) return;
    const p = G.local;
    const target = c || this.cubeC();
    if (!target) return;
    if (!isWorldContainer(target)) { autoPack(target); settleGravity(target); bus.emit('inventoryChanged', p); }
    this.shakeT = 0.45;
    G.audio?.ui?.('bag_shake', 0.7);
    if (this.built) for (const b of this.binPack.bodies) { b.sleep = 0; b.vel.set((Math.random() - 0.5) * 0.6, 0.8 + Math.random() * 0.9, (Math.random() - 0.5) * 0.6); b.yawV += (Math.random() - 0.5) * 6; }
    this.dirty = true;
  }

  // ================================================================ pointer
  private hitAt(x: number, y: number): Hit | null {
    pointerRay(this.rc, fpCamera(), x, y);
    let best: Hit | null = null, bd = Infinity;
    const consider = (h: Hit, d: number) => { if (d < bd) { bd = d; best = h; } };
    const holders: THREE.Object3D[] = [];
    for (const bin of this.phys.bins) if (bin.frame.visible) for (const b of bin.bodies) holders.push(b.holder);
    for (const it of this.rc.intersectObjects(holders, true)) {
      let o: THREE.Object3D | null = it.object;
      while (o && !holders.includes(o)) o = o.parent;
      const b = o ? this.bodyOf(o) : null;
      if (b) { consider({ kind: 'body', b }, it.distance - 0.01); break; }
    }
    const objs: THREE.Object3D[] = [...this.tags.meshes(), this.pack.lidHit];
    for (const h of ['R', 'L'] as const) { const o = this.heldObjs[h]; if (o?.outer.visible) objs.push(o.outer); }
    for (const it of this.rc.intersectObjects(objs, true)) {
      let o: THREE.Object3D | null = it.object;
      while (o) {
        const u = o.userData;
        if (u.side !== undefined) { consider({ kind: 'side', i: u.side }, it.distance - 0.01); break; }
        if (u.held) { const p = G.local; const hi = u.held === 'R' ? p.handR : p.handL; if (hi) consider({ kind: 'held', hand: u.held, it: hi }, it.distance); break; }
        if (o === this.pack.lidHit) { consider({ kind: 'lid' }, it.distance + 0.05); break; }
        o = o.parent;
      }
    }
    // a near miss on a small thing still finds it (fingers are fat)
    if (!best) {
      let nb: Body | null = null, nd = 26;
      for (const bin of this.phys.bins) if (bin.frame.visible) for (const b of bin.bodies) { b.holder.getWorldPosition(_v); const d = this.screenDist(_v, x, y); if (d < nd) { nd = d; nb = b; } }
      if (nb) best = { kind: 'body', b: nb };
    }
    return best;
  }
  private bodyOf(holder: THREE.Object3D): Body | null {
    for (const bin of this.phys.bins) for (const b of bin.bodies) if (b.holder === holder) return b;
    return null;
  }
  private screenDist(w: THREE.Vector3, x: number, y: number) {
    _s.copy(w).project(fpCamera());
    return Math.hypot(((_s.x + 1) / 2) * window.innerWidth - x, ((1 - _s.y) / 2) * window.innerHeight - y);
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
    if (hit.kind === 'body') pr.long = window.setTimeout(() => requestAnimationFrame(() => { if (this.press === pr && !pr.done) { pr.done = true; this.press = null; this.inspectBody(hit.b); } }), LONG_MS);
  }
  private cancelPress() { if (this.press) clearTimeout(this.press.long); this.press = null; this.orbit = null; }

  private onMove(e: PointerEvent) {
    if (!this.open || this.suspended) return;
    this.lastPX = e.clientX; this.lastPY = e.clientY;
    const pr = this.press;
    if (pr && pr.pointerId === e.pointerId && !pr.done && pr.hit) {
      const moved = Math.hypot(e.clientX - pr.x0, e.clientY - pr.y0) > (pr.touch ? 10 : 5);
      if (moved && pr.hit.kind === 'body') { clearTimeout(pr.long); pr.done = true; this.press = null; this.startDrag(pr.hit.b, e.pointerId, pr.shift); }
    }
    if (this.orbit && this.orbit.id === e.pointerId && !this.drag) {
      const dy = e.clientY - this.orbit.y;
      this.orbit.x = e.clientX; this.orbit.y = e.clientY;
      this.pitchT = Math.max(40, Math.min(74, this.pitchT + dy * 0.12));
      return;
    }
    if (this.drag && this.drag.pointerId === e.pointerId) { e.preventDefault(); return; }
    if (!this.drag && !this.press && (e.pointerType === 'mouse' || this.pad.on)) this.hoverAt(e.clientX, e.clientY);
  }

  private onUp(e: PointerEvent, cancel: boolean) {
    if (!this.open) return;
    if (this.orbit && this.orbit.id === e.pointerId) this.orbit = null;
    const d = this.drag;
    if (d && d.pointerId === e.pointerId) { this.endDrag(cancel); return; }
    const pr = this.press;
    if (!pr || pr.pointerId !== e.pointerId) return;
    clearTimeout(pr.long);
    this.press = null;
    if (pr.done || cancel || !pr.hit) return;
    const h = pr.hit;
    if (h.kind === 'side') { this.selectSide(this.refOf(this.side[h.i])); G.audio?.ui?.('bag_rot', 0.3); return; }
    if (h.kind === 'lid') { this.toggle(false); return; }
    if (h.kind === 'held') { const p = G.local; this.inspect(h.it, p.containerOf(h.it) || p.inv); return; }
    if (h.kind !== 'body') return;
    const it = h.b.items[0];
    const now = performance.now();
    if (pr.shift) { this.quickMove(h.b); return; }
    if (this.lastTap.uid === it.uid && now - this.lastTap.t < 360) { this.lastTap.uid = 0; this.inspectBody(h.b); return; }
    this.lastTap = { uid: it.uid, t: now };
    // a tap picks it up a little and shows its tag
    h.b.sleep = 0; h.b.vel.y = 0.7; h.b.yawV += (Math.random() - 0.5) * 3;
    G.audio?.itemSound?.(it.key, 'pick', G.local);
    this.hover = h.b; this.showTag(h.b);
  }

  private onContext(e: MouseEvent) {
    if (!this.open || this.phase !== 'open') return;
    if (this.drag) { this.turnHeld(); return; }
    const h = this.hitAt(e.clientX, e.clientY);
    // right-click: the item card beside it (shift-click still moves it across)
    if (h?.kind === 'body') { if (e.shiftKey) this.quickMove(h.b); else this.inspectBody(h.b); }
    else if (h?.kind === 'held') { const p = G.local; this.inspect(h.it, p.containerOf(h.it) || p.inv, { x: e.clientX + 16, y: e.clientY }); }
    else closeItemPanel();
  }

  private onWheel(e: WheelEvent) {
    if (!this.open || this.phase !== 'open') return;
    e.preventDefault();
    this.pitchT = Math.max(40, Math.min(74, this.pitchT + (e.deltaY < 0 ? 2 : -2)));
  }

  private hoverAt(x: number, y: number) {
    const h = this.hitAt(x, y);
    const b = h?.kind === 'body' ? h.b : null;
    if (b !== this.hover) { this.hover = b; if (b) G.audio?.ui?.('hover', 0.15); }
    if (b) this.showTag(b);
    else if (h?.kind === 'lid') { this.pack.lidEdge.getWorldPosition(_v); this.world.worldToLocal(_v); this.gtag.text(['ZIP SHUT'], _v.clone(), _v.clone().add(_v2.set(-0.05, -_v.y + 0.004, 0.14))); }
    else if (h?.kind === 'held') { const o = this.heldObjs[h.hand]; if (o) { o.outer.getWorldPosition(_v); this.world.worldToLocal(_v); this.gtag.item(h.it, 1, _v.clone(), _v.clone().add(_v2.set(0.02, 0.004 - _v.y, 0.12))); } }
    else this.gtag.hide();
  }
  /** the luggage tag tied to a thing: lying on the floor in front of it */
  private showTag(b: Body) {
    b.holder.getWorldPosition(_v); this.world.worldToLocal(_v);
    const rest = _v2.copy(_v);
    rest.y = 0.005; rest.z += 0.14; rest.x += rest.x > 0 ? -0.04 : 0.04;
    if (b.bin === this.binPack) rest.z = Math.max(rest.z, -this.packZ + this.pack.L / 2 + 0.07);
    this.gtag.lean = 0.45;
    this.gtag.item(b.items[0], b.items.length, _v.clone(), rest.clone());
  }

  // ================================================================ drag
  private startDrag(b: Body, pointerId: number, one: boolean) {
    if (!b.bin) return;
    const from = b.bin;
    // out of its bin into the hand: same place in the world, now part of the floor's frame
    b.holder.getWorldPosition(_v);
    this.world.updateMatrixWorld(true);
    this.world.worldToLocal(_v);
    const i = from.bodies.indexOf(b); if (i >= 0) from.bodies.splice(i, 1);
    this.world.add(b.holder);
    b.pos.copy(_v);
    b.held = true; b.sleep = 0;
    this.drag = { b, from, pointerId, target: _v.clone(), over: from, ok: true, one: one && b.items.length > 1 };
    this.gtag.hide(); this.hover = null;
    G.audio?.itemSound?.(b.key, 'pick', G.local);
    // what was resting on it drops
    for (const o of from.bodies) o.sleep = 0;
  }
  /** per frame (from sync): the target under the pointer, the body after it, the bin it is over */
  private dragFollow(dt: number) {
    const d = this.drag!;
    const x = this.pad.on ? this.pad.x : this.lastPX, y = this.pad.on ? this.pad.y : this.lastPY;
    const ray = pointerRay(this.rc, fpCamera(), x, y);
    _inv.copy(this.world.matrixWorld).invert();
    _ray.copy(ray).applyMatrix4(_inv);
    // carried a hand's height over the floor; over a bin it dips toward the mouth
    const over = this.phys.binAt(this.world.localToWorld(_hit.copy(d.target)), null);
    const lift = over && over !== this.binFloor ? Math.max(CARRY_Y * 0.7, over === this.binPack ? this.pack.H + 0.1 : 0.16) : CARRY_Y;
    _plane.set(_v.set(0, 1, 0), -lift);
    if (_ray.intersectPlane(_plane, _hit)) {
      _hit.x = Math.max(-1.1, Math.min(1.1, _hit.x)); _hit.z = Math.max(-1.4, Math.min(-0.05, _hit.z));
      d.target.copy(_hit);
    }
    this.phys.drive(d.b, d.target, dt);
    // where would it go
    const bin = this.phys.binAt(d.b.holder.getWorldPosition(_v), null) ?? (this.inFloorArea(d.b.pos) ? this.binFloor : null);
    d.over = bin;
    d.ok = !!bin && this.accepts(bin, d.from, d.b);
    for (const [bb, m] of this.hilite) { m.visible = bb === bin && bb !== d.from; m.material = d.ok ? hiliteOk : hiliteBad; }
    if (bin !== this.binFloor && this.binFloor.frame.visible) this.hilite.get(this.binFloor)!.visible = false;
  }
  private inFloorArea(p: THREE.Vector3) { return p.z < -0.08 && p.z > -1.3 && Math.abs(p.x) < 1.1; }
  /** would this bin take the body (a pre-check: the transfer still has the last word) */
  private accepts(bin: PhysBin, from: PhysBin, b: Body): boolean {
    if (bin === from) return true;
    const c = this.binC(bin);
    if (!c && bin !== this.binFloor) return false;
    if (!c) return true;
    if (c.kind === 'floor' || isWorldContainer(c)) return true;
    try { return c.hasRoom(b.items[0]); } catch { return true; }
  }

  private endDrag(cancel: boolean) {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    for (const m of this.hilite.values()) m.visible = false;
    const b = d.b;
    b.held = false;
    let to = cancel ? d.from : d.over ?? d.from;
    if (!d.ok) { to = d.from; this.bad(); }
    // into the bin's frame, same place in the world, still moving
    b.holder.getWorldPosition(_v);
    to.frame.updateWorldMatrix(true, false);
    to.frame.worldToLocal(_v);
    const vel = b.vel.clone().multiplyScalar(0.6);
    vel.y = Math.min(vel.y, 0.5);
    if (vel.length() > 2.5) vel.setLength(2.5);
    this.phys.place(b, to, _v.x, _v.y, _v.z);
    b.vel.copy(vel); b.txV += vel.z * 4; b.tzV -= vel.x * 4;
    if (to === d.from) { G.audio?.itemSound?.(b.key, 'drop', G.local); return; }
    this.commit(b, d.from, to, d.one);
  }

  /** the inventory side of a drop: a normal transfer (it jumps back if it is refused) */
  private commit(b: Body, fromBin: PhysBin, toBin: PhysBin, one: boolean) {
    const p = G.local;
    const from = this.binC(fromBin), to0 = this.binC(toBin);
    if (!from) return;
    const to = to0 ?? (toBin === this.binFloor ? floorContainer(G.zone, p.x, p.z) : null);
    if (!to) return;
    const items = one ? b.items.slice(0, 1) : b.items.slice();
    const world = (c: Container) => isWorldContainer(c) || c.kind === 'floor';
    const it = items[0];
    // a part of a stack: the body goes back, the one that moved appears where it went
    if (one) { const sp = this.phys.spawnSpot(b, fromBin, it.uid); this.phys.place(b, fromBin, sp.x, sp.y + 0.1, sp.z); }
    else b.pendT = performance.now() / 1000 + 3;
    if (hotOf(it)) { /* a hotbar binding follows the thing wherever it goes */ }
    if (!world(from) && !world(to)) {
      let ok = true;
      for (const i of items) { const res = resolveTarget(p, i, from, to, null); if (res) transferItem(p, i, from, res.c, res.at); else { ok = false; break; } }
      settleGravity(from);
      if (!ok) { b.pendT = 0; this.bad(); this.dirty = true; return; }
    } else queueTransfers(p, items, from, to);
    this.thunk(it, toBin);
  }

  /** shift-click / right-click: straight across (out of the container or the floor into the pack, out of the pack back) */
  private quickMove(b: Body) {
    if (!b.bin) return;
    const fromBin = b.bin;
    let toBin: PhysBin;
    if (fromBin === this.binPack) toBin = this.srcShown() ? this.binSrc : this.binPockets;
    else if (fromBin === this.binPockets || fromBin === this.binRoll) toBin = this.binPack;
    else toBin = this.cubeC() ? this.binPack : this.binPockets;
    if (!this.accepts(toBin, fromBin, b)) { this.bad(); return; }
    // it flies over: up out of here, into the other bin from above
    b.holder.getWorldPosition(_v);
    toBin.frame.updateWorldMatrix(true, false);
    const sp = this.phys.spawnSpot(b, toBin, b.items[0].uid + 3);
    this.phys.place(b, toBin, sp.x, sp.y + 0.18, sp.z);
    b.vel.set(0, -0.3, 0); b.yawV += (Math.random() - 0.5) * 4;
    G.audio?.itemSound?.(b.key, 'pick', G.local);
    this.commit(b, fromBin, toBin, false);
  }

  private thunk(it: Item, to: PhysBin) {
    G.audio?.ui?.(to === this.binPack ? 'bag_place' : 'bag_rot', 0.45);
    if (to === this.binPack) { this.shakeT = Math.max(this.shakeT, 0.06 + Math.min(0.2, itemWeight(it) * 0.04)); G.missions?.set?.('pack:packed'); }
    if (to === this.binRoll) G.missions?.set?.('pack:toolroll');
    this.dirty = true;
  }
  private bad() { G.audio?.ui?.('bag_bad', 0.5); this.note_("won't fit", true); }

  private inspectBody(b: Body) {
    const c = this.binC(b.bin);
    b.holder.getWorldPosition(_v); _s.copy(_v).project(fpCamera());
    const x = ((_s.x + 1) / 2) * window.innerWidth, y = ((1 - _s.y) / 2) * window.innerHeight;
    this.inspect(b.items[0], c ?? G.local.inv, { x: x + 24, y }, b.items);
  }
  /** the item card beside the thing (src/ui/itemPanel.ts); "Inspect in hand" on it takes it up to the eyes */
  private inspect(it: Item, c: Container, at?: { x: number; y: number }, group?: Item[]) {
    this.endDrag(true); this.gtag.hide();
    openItemPanel(it, c, at ?? { x: this.lastPX, y: this.lastPY }, group);
  }

  // ================================================================ gamepad: a cursor on the left stick
  private pollPad(dt: number) {
    if (itemPanelOpen()) return;
    let gp: Gamepad | undefined;
    try { gp = [...(navigator.getGamepads?.() || [])].find(Boolean) as Gamepad | undefined; } catch { gp = undefined; }
    if (!gp) { if (this.pad.on) { this.pad.on = false; this.root.classList.remove('pad'); } return; }
    const ax = gp.axes[0] ?? 0, ay = gp.axes[1] ?? 0;
    const btn = (i: number) => !!gp!.buttons[i]?.pressed;
    const mag = Math.hypot(ax, ay);
    if (!this.pad.on && (mag > 0.3 || btn(0))) { this.pad.on = true; this.pad.x = window.innerWidth / 2; this.pad.y = window.innerHeight * 0.6; this.root.classList.add('pad'); }
    if (!this.pad.on) return;
    if (mag > 0.15) {
      const sp = 900 * Math.pow(Math.min(1, mag), 1.6) * dt;
      this.pad.x = Math.max(0, Math.min(window.innerWidth, this.pad.x + ax / mag * sp * Math.min(1, mag)));
      this.pad.y = Math.max(0, Math.min(window.innerHeight, this.pad.y + ay / mag * sp * Math.min(1, mag)));
      this.lastPX = this.pad.x; this.lastPY = this.pad.y;
      if (!this.drag) this.hoverAt(this.pad.x, this.pad.y);
    }
    this.cursor.style.left = this.pad.x + 'px'; this.cursor.style.top = this.pad.y + 'px';
    const a = btn(0), b = btn(1), x = btn(2), y = btn(3);
    if (a && !this.pad.a && this.phase === 'open') {
      const h = this.hitAt(this.pad.x, this.pad.y);
      if (h?.kind === 'body') this.startDrag(h.b, this.pad.id, false);
      else if (h?.kind === 'side') this.selectSide(this.refOf(this.side[h.i]));
      else if (h?.kind === 'lid') this.toggle(false);
    }
    if (!a && this.pad.a && this.drag?.pointerId === this.pad.id) this.endDrag(false);
    if (b && !this.pad.b) { if (this.drag) this.endDrag(true); else this.toggle(false); }
    if (x && !this.pad.x2 && this.hover) this.inspectBody(this.hover);
    if (y && !this.pad.y2) this.shake();
    this.pad.a = a; this.pad.b = b; this.pad.x2 = x; this.pad.y2 = y;
  }

  // ================================================================ kit & quick draw
  /**
   * saves from before the field pack, or kits without one: strap the pack on and hang the tool roll.
   * Not while the intro or the arrival is playing (Voss hands the pack over in the arrival; the intake
   * contract is not signed yet): it tries again a little later. Returns false to be called again.
   */
  private ensureKit(p: any): boolean {
    if (!p || p.body?.dead || !p.inv) return false;
    const m: any = G.missions;
    if (arrivalRunning() || (G as any).intro?.running || (m?.enabled && !m?.flags?.has?.('contract:intake'))) return false;
    try {
      const back = p.worn.get('back');
      if (!back || back.key !== 'iron_cube') {
        const had = back && back.key !== 'iron_cube' ? back : null;
        ensurePack(p);
        // whatever was on the back before goes inside the pack
        const pack = p.worn.get('back');
        if (had && pack?.key === 'iron_cube' && pack.inv && had !== pack) {
          if (p.worn.get('back') !== had) { try { p.unwear(had); } catch { /* already off */ } }
          const from = p.containerOf(had);
          if (from && from !== pack.inv) { from.remove(had); setPlace(had, null); pack.inv.add(had); }
        }
      }
      if (!p.worn.get('belt')) {
        const roll = createItem('tool_roll', undefined, { pristine: true });
        p.inv.add(roll); p.wear(roll);
      }
      bus.emit('inventoryChanged', p);
    } catch (e) { console.warn('pack kit', e); }
    return true;
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
