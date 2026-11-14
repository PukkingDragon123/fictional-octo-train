// THE FIELD PACK, round 18b: the first-person pack close-up and pixel-art interiors in one.
//
// Opening it (I, the PACK key, Inspect Yourself, searching something, the things on the floor) goes into the
// unit's eyes (src/fp, a 'full' claim): it kneels, the real 3D field pack lies on the floor in front of it and the
// gloved hands (HumanRig arms, src/fp/hands.ts) unbuckle it and flip the lid over. The inside of the pack and the
// inside of its lid are painted pixel art mapped onto the 3D pack (./board.ts, ./shells.ts): the main well with
// what is in the bag on its back, the clothes' stitched pockets and the tool roll's loops on the lid, each thing
// lying in its real cells. A container being searched is set down beside it as its own 3D shell (a cardboard box
// whose flaps the hands pull open, a drawer that slides out, a locker door that swings over, a crate lid lifted
// off, a coat folded open, a patch of floor) with its own painted inside. Everything renders in the game's own
// overlay pixel pipeline (grade, grain, ink), never a smooth render of its own.
//
//   drag      a hand reaches in, closes on the thing and it lifts out of its pocket as its real 3D model, swinging
//             with the weight; let go over a pocket / the well / the container / a hook of the rack / a slot of the
//             tool belt and it drops in with a soft thud (or swings back where it came from if it does not fit)
//   click     with something open beside the pack: a hand carries it across (take / put back); otherwise its card
//   F         take everything (both hands, in turn)
//   R         turn what you hold      right click: its card      I / Esc: close (the lid flips back, buckled)
// The gear rack along the top (./rack.ts) hangs what is worn and held, with a spring balance for the load.
// Names and weights only on hover. Scripted browsers (navigator.webdriver, no ?fpcut) skip every animation.
import './fpack.css';
import * as THREE from 'three';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import type { Container } from '../../items/container';
import { itemName, itemWeight, itemDef, type Item } from '../../items/item';
import { containerOcc, testFit, dropSpot, extentIn, orientations, spotIn, weightOk, setPlace, type Rot, type Placement } from '../../items/grid';
import { transferItem, ensureLoot, isWorldContainer } from '../../game/worldOps';
import { floorContainer } from '../../items/worldItems';
import { openItemPanel } from '../itemPanel';
import { fpGroup, fpClaim, fpRelease, fpOwner, fpCamera } from '../../fp/fp';
import { eyeActive, eyeCamera, eyeEnter } from '../../fp/eye';
import { makeArm, poseArm, makeItemObj, itemAlign, damp, pointerRay, type Arm, type ItemObj } from '../../craft/fpKit';
import { texturizeSleeves } from '../pack/packTex';
import { contactShadow } from '../pack/packView';
import { EquipAction, WearAction } from '../../actions/basic';
import { bindHot } from '../hotbar/hotbar';
import { Board, layoutBody, layoutLid, layoutLoot, PPM, type Placed, type Comp, type PackParts } from './board';
import { buildPack, buildShell, type FieldPack, type Shell } from './shells';
import { Rack, type Hook } from './rack';

const DEG = Math.PI / 180;
export const SCRIPTED = typeof navigator !== 'undefined' && !!navigator.webdriver && typeof location !== 'undefined' && !/[?&]fpcut/.test(location.search);
/** the eyes' field of view: in close on the pack alone, wider when a container is set down beside it */
const FOV = 50, FOV_PACK = 36, FOV_LOOT = 44;
const CARRY_Y = 0.17;
const KNEEL = { y: 1.08, fwd: 0.1 };
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _plane = new THREE.Plane(), _ray = new THREE.Ray();
const ease = (t: number) => { const e = Math.max(0, Math.min(1, t)); return e * e * (3 - 2 * e); };

type Side = 'R' | 'L';
interface Hand { arm: Arm; goal: THREE.Vector3; cur: THREE.Vector3; pose: string; rate: number; roll: number; busy: number }
interface BoardHit { b: Board; ax: number; ay: number; mesh: THREE.Mesh; point: THREE.Vector3 }
interface DropT { b: Board; cp: Comp; gx: number; gy: number; gz: number; rot: Rot; w: number; h: number; ok: boolean }
interface Drag { items: Item[]; from: Container; obj: ItemObj; rot: Rot; origin: THREE.Vector3; src: Board | null; target: DropT | null; carry: THREE.Vector3; swing: THREE.Vector2; swingV: THREE.Vector2; last: THREE.Vector3; weight: number; reach: number }
interface Press { id: number; x: number; y: number; t: number; button: number; shift: boolean; hit: BoardHit | null; placed: Placed | null; hook: Hook | null }
interface Fly { obj: ItemObj; a: THREE.Vector3; b: THREE.Vector3; t: number; dur: number; hand: Side | null; arc: number; done: () => void; qa: THREE.Quaternion; qb: THREE.Quaternion }

export class FieldPackUI {
  open = false;
  phase: 'off' | 'enter' | 'opening' | 'open' | 'closing' = 'off';
  /** the look-down of the eyes while packing (the craft inspector reads it) */
  pitch = 58;
  private suspended = false;
  private built = false;
  private g!: THREE.Group;
  private set = new THREE.Group();
  private anchorM = new THREE.Matrix4();
  private synth = new THREE.PerspectiveCamera(FOV, 1, 0.05, 20);
  private body = new Board('body', 11);
  private lidB = new Board('lid', 23);
  private lootB = new Board('loot', 37);
  private pack: FieldPack | null = null;
  private packSig = '';
  private packAt = new THREE.Vector3();
  private shell: Shell | null = null;
  private shellAt = new THREE.Vector3();
  private shellSig = '';
  private shadowP!: THREE.Mesh; private shadowS!: THREE.Mesh;
  private hands!: Record<Side, Hand>;
  private loot: Container | null = null;
  private lootRef = '';
  private kneeling = false;
  private hookFn: ((dt: number) => void) | null = null;
  private seqT = 0; private seqDur = 0; private seqKind: 'pack' | 'loot' | 'close' | 'empty' | '' = '';
  private packOpenK = 0; private shellOpenK = 0;
  private opens = 0;
  private dirty = true;
  private drag: Drag | null = null;
  private press: Press | null = null;
  private flies: Fly[] = [];
  private hover: { b: Board; p: Placed } | null = null;
  private rc = new THREE.Raycaster();
  private px = 0; private py = 0;
  private root = document.createElement('div');
  private cap = document.createElement('div');
  private tip = document.createElement('div');
  private rack = new Rack();
  private lastT = performance.now();
  private emptyT = 0; private emptyOn = false;
  private takeQ: Item[] = [];
  private takeT = 0;
  private takeHand: Side = 'R';
  private ui: any;

  constructor(ui?: unknown) {
    this.ui = ui;
    (G as any).pack = this;
    const u = ui as { blocksMovement?: () => boolean } | undefined;
    const orig = u?.blocksMovement?.bind(u);
    if (u && orig) u.blocksMovement = () => orig() || (this.open && !this.suspended);
    this.root.className = 'fpk';
    this.cap.className = 'fpk-cap';
    this.tip.className = 'fpk-tip';
    this.root.append(this.cap, this.rack.el, this.tip);
    this.cap.addEventListener('pointerdown', (e) => this.onDown(e));
    this.rack.el.addEventListener('pointerdown', (e) => this.onDown(e));
    window.addEventListener('pointermove', (e) => this.onMove(e), { passive: true });
    window.addEventListener('pointerup', (e) => this.onUp(e, false));
    window.addEventListener('pointercancel', (e) => this.onUp(e, true));
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => this.onKey(e), true);
    bus.on('inventoryChanged', () => { this.dirty = true; });
    bus.on('containerChanged', () => { this.dirty = true; });
    bus.on('floorChanged', () => { this.dirty = true; });
    bus.on('fpLost', (name: string) => { if (name === 'pack' && this.open) this.suspend(); });
    bus.on('fpChange', (name: string | null) => { if (name === null && this.open && this.suspended) setTimeout(() => this.resume(), 0); });
  }

  /** older scripts ask for the hover tag */
  get hoverTag() { return null; }

  // ================================================================ the old pack's API
  toggle(v?: boolean) {
    const want = v ?? !(this.open && !this.suspended);
    if (want && this.open && this.suspended) { this.resume(); return; }
    if (want === this.open) { if (want) this.dirty = true; return; }
    if (want) this.show(); else this.hide();
  }
  focus(c: Container) {
    this.setLoot(c);
    if (this.open && !this.suspended) { this.startLootSeq(); return; }
    this.toggle(true);
  }
  openLoot(c: Container, src?: { x?: number; y?: number } | null) {
    // turn to face what is being searched
    const p = G.local as any;
    if (p && src && typeof src.x === 'number' && !this.open) { const dx = src.x + 0.5 - p.x, dz = (src.y ?? 0) + 0.5 - p.z; if (Math.hypot(dx, dz) > 0.2) p.facing = Math.atan2(dz, dx); }
    this.focus(c);
  }
  lootFloor() {
    const p = G.local; if (!p) return;
    this.loot = floorContainer(G.zone, p.x, p.z, 1.3); this.lootRef = 'floor';
    if (this.open && !this.suspended) { this.startLootSeq(); return; }
    this.toggle(true);
  }
  shake() { G.audio?.ui?.('bag_shake', 0.4); }
  quickDraw() { /* (the old close-up's quick draw) */ }
  update(_dt?: number) { /* driven from the renderer's frame */ }

  private setLoot(c: Container) {
    const z = G.zone;
    if (z && isWorldContainer(c)) { try { ensureLoot(z, c); } catch { /* client: the host fills it */ } }
    this.loot = c; this.lootRef = c.owner;
    this.dirty = true;
  }

  // ================================================================ build
  private build() {
    if (this.built) return;
    this.built = true;
    this.g = fpGroup('pack');
    this.set.matrixAutoUpdate = false;
    this.g.add(this.set);
    const S = this.set;
    // lit like a room: a warm overhead key, a cool bounce, a rim from beyond
    S.add(new THREE.HemisphereLight(0xe8e0cc, 0x3a3226, 1.0));
    const key = new THREE.DirectionalLight(0xfff0dc, 2.1); key.position.set(-0.5, 3, 0.6); key.target.position.set(0, 0, -0.7); S.add(key, key.target);
    const fill = new THREE.DirectionalLight(0x90a0b8, 0.35); fill.position.set(1.4, 0.8, 0.4); fill.target.position.set(0, 0, -0.7); S.add(fill, fill.target);
    const rim = new THREE.DirectionalLight(0xfff4e0, 0.6); rim.position.set(0.3, 1.2, -3); rim.target.position.set(0, 0, -0.7); S.add(rim, rim.target);
    this.shadowP = contactShadow(0.6, 0.5, 0.5); S.add(this.shadowP);
    this.shadowS = contactShadow(0.5, 0.4, 0.45); S.add(this.shadowS);
    const mk = (s: 1 | -1): Hand => { const a = makeArm(s, 1.05); texturizeSleeves(a.root); this.g.add(a.root); return { arm: a, goal: new THREE.Vector3(), cur: new THREE.Vector3(s * 0.2, 0.1, -0.5), pose: 'relaxed', rate: 10, roll: 0, busy: 0 }; };
    this.hands = { R: mk(1), L: mk(-1) };
  }

  /** the pack's parts: the bag on the back, the clothes' pockets, the tool roll, other bags carried */
  private parts(): PackParts {
    const p = G.local!;
    const back = (p.worn as Map<string, Item>).get('back');
    const main = back?.inv ?? null;
    let roll: Container | null = null;
    const extra: Container[] = [];
    for (const c of p.containers()) {
      if (c === p.inv || c === main) continue;
      const own = p.inv.items.find((i) => i.inv === c);
      if (own?.key === 'tool_roll' && !roll) roll = c; else extra.push(c);
    }
    return { main, pockets: p.inv, roll, extra };
  }

  /** lay the boards out again; rebuild the 3D pack / shell when their size changed */
  private refresh() {
    const p = G.local; if (!p) return;
    this.dirty = false;
    const parts = this.parts();
    const lb = layoutBody(this.body, parts);
    this.body.layout(lb.W, lb.H, lb.comps, 'canvas', lb.sig);
    const ll = layoutLid(this.lidB, parts, lb.W + 6, Math.round(lb.H * 0.86));
    this.lidB.layout(ll.W, ll.H, ll.comps, 'canvas', ll.sig);
    const sig = lb.W + 'x' + lb.H + '|' + ll.W + 'x' + ll.H;
    if (!this.pack || sig !== this.packSig) {
      const k = this.packOpenK;
      if (this.pack) { this.set.remove(this.pack.root); this.pack.dispose(); }
      const W = lb.W / PPM, L = lb.H / PPM;
      this.pack = buildPack(this.body.tex, this.lidB.tex, Math.max(W, ll.W / PPM - 0.046), L, ll.H / PPM);
      this.set.add(this.pack.root);
      this.pack.setOpen(k);
      this.packSig = sig;
    }
    if (this.lootRef === 'floor') this.loot = floorContainer(G.zone, p.x, p.z, 1.3);
    if (this.loot) {
      const lo = layoutLoot(this.lootB, this.loot);
      this.lootB.layout(lo.W, lo.H, lo.comps, lo.style, lo.sig);
      const ssig = this.loot.uid + '|' + lo.W + 'x' + lo.H + '|' + lo.style;
      if (!this.shell || ssig !== this.shellSig) {
        if (this.shell) { this.set.remove(this.shell.root); this.shell.dispose(); }
        this.shell = buildShell(lo.style, this.loot.kind, this.lootB.tex, lo.W / PPM, lo.H / PPM);
        this.set.add(this.shell.root);
        this.shell.setOpen(this.shellOpenK);
        this.shellSig = ssig;
      }
    } else if (this.shell) { this.set.remove(this.shell.root); this.shell.dispose(); this.shell = null; this.shellSig = ''; }
    for (const b of [this.body, this.lidB, this.lootB]) b.place();
    this.layout();
  }

  /** where the pack and the container sit on the floor in front of the knees (anchor-local metres) */
  private layout() {
    const pk = this.pack; if (!pk) return;
    const asp = fpCamera().aspect || 1.6;
    const wide = asp >= 1.15;
    const sh = this.shell;
    const sw = sh ? sh.W + 0.04 : 0;
    if (wide) {
      const total = pk.W + (sh ? 0.1 + sw : 0);
      this.packAt.set(-total / 2 + pk.W / 2, 0, -0.36 - pk.L / 2);
      if (sh) this.shellAt.set(this.packAt.x + pk.W / 2 + 0.1 + sw / 2, 0, -0.4 - sh.L / 2 - (sh.kind === 'drawer' ? 0.03 : 0));
    } else {
      // upright phone: the pack in front, the container beyond it to the right of the open lid
      this.packAt.set(sh ? -0.06 : 0, 0, -0.42 - pk.L / 2);
      if (sh) this.shellAt.set(Math.max(pk.W / 2 - sh.W / 2 + 0.02, 0.06), 0, this.packAt.z - pk.L / 2 - pk.lidL * 0.25 - sh.L / 2 - 0.08);
    }
    pk.root.position.copy(this.packAt);
    this.shadowP.position.set(this.packAt.x, 0.002, this.packAt.z);
    this.shadowP.scale.set((pk.W + 0.1) / 0.6, 1, (pk.L + 0.1) / 0.5);
    if (sh) {
      sh.root.position.copy(this.shellAt);
      sh.root.rotation.y = wide ? -0.05 : 0;
      this.shadowS.visible = sh.kind !== 'floor';
      this.shadowS.position.set(this.shellAt.x, 0.002, this.shellAt.z);
      this.shadowS.scale.set((sh.W + 0.1) / 0.5, 1, (sh.L + 0.1) / 0.4);
    } else this.shadowS.visible = false;
    this.pitch = wide ? 62 : 66;
  }

  // ================================================================ show / hide
  private show() {
    const p = G.local as any;
    if (!p || p.body?.dead) return;
    this.build();
    if (!fpClaim('pack', 1.5, { cinematic: 'full', eyePitch: this.pitch })) return;
    this.open = true; this.suspended = false;
    this.phase = 'enter'; this.seqT = 0;
    this.anchorM.makeRotationY(-(p.facing ?? 0) - Math.PI / 2).setPosition(p.x, p.y ?? 0, p.z);
    if (!p.full && !p.sittingOn && !p.inVehicle && p.stance !== 'swim') { p.full = 'kneel'; this.kneeling = true; }
    G.hudBody?.setHidden?.('pack', true);
    if (G.input) G.input.pointerOverUI = true;
    if (!this.root.isConnected) document.body.append(this.root);
    this.root.classList.remove('on');
    this.packOpenK = 0; this.shellOpenK = 0;
    this.refresh();
    this.pack?.setOpen(0); this.shell?.setOpen(0);
    this.restHands(true);
    this.hook();
    G.audio?.ui?.('cloth', 0.35);
  }
  private hide() {
    if (this.phase === 'closing' || !this.open) return;
    this.endDrag(true);
    this.press = null;
    this.takeQ.length = 0;
    this.setHover(null);
    this.phase = 'closing'; this.seqKind = 'close'; this.seqT = 0;
    this.seqDur = SCRIPTED || !eyeActive() ? 0 : 0.42;
    this.root.classList.remove('on');
    if (this.seqDur) G.audio?.ui?.('bag_zip', 0.4);
  }
  private finishClose() {
    this.open = false; this.suspended = false; this.phase = 'off';
    this.unhook();
    for (const f of this.flies) { f.obj.outer.removeFromParent(); f.done(); }
    this.flies.length = 0;
    fpRelease('pack');
    if (G.input) G.input.pointerOverUI = false;
    const p = G.local as any;
    if (p && this.kneeling && p.full === 'kneel') p.full = '';
    this.kneeling = false;
    G.hudBody?.setHidden?.('pack', false);
    this.root.remove();
    this.loot = null; this.lootRef = ''; this.emptyOn = false;
    if (this.shell) { this.set.remove(this.shell.root); this.shell.dispose(); this.shell = null; this.shellSig = ''; }
    this.lootB.lifted.clear(); this.body.lifted.clear(); this.lidB.lifted.clear();
    this.ui?.closeMenu?.();
  }
  private suspend() { this.suspended = true; this.endDrag(true); this.root.classList.remove('on'); }
  resume() {
    if (!this.open || !this.suspended || fpOwner()) return;
    if (!fpClaim('pack', 1.5, { cinematic: 'full', eyePitch: this.pitch })) return;
    this.suspended = false; this.dirty = true;
    this.root.classList.add('on');
    if (G.input) G.input.pointerOverUI = true;
    this.hook();
  }

  /** the opening: the hands unbuckle and flip the lid; then, if something is being searched, open that too */
  private startOpenSeq() {
    this.phase = 'opening';
    const quick = this.opens++ > 0;
    if (SCRIPTED) { this.packOpenK = 1; this.pack?.setOpen(1); this.startLootSeq(); return; }
    // searching: the pack is already undone, the time goes to the container
    if (this.loot) { this.packOpenK = 1; this.pack?.setOpen(1); this.startLootSeq(); return; }
    this.seqKind = 'pack'; this.seqT = 0; this.seqDur = quick ? 0.36 : 0.62;
    G.audio?.ui?.('bag_zip', 0.45);
  }
  private startLootSeq() {
    this.refresh();
    this.emptyOn = false;
    this.lootB.lifted.clear();
    if (!this.loot || !this.shell) { this.phase = 'open'; this.seqKind = ''; this.root.classList.add('on'); return; }
    this.phase = 'opening';
    this.shellOpenK = 0; this.shell.setOpen(0);
    if (SCRIPTED) { this.shellOpenK = 1; this.shell.setOpen(1); this.phase = 'open'; this.seqKind = ''; this.root.classList.add('on'); this.checkEmpty(); return; }
    this.seqKind = 'loot'; this.seqT = 0; this.seqDur = this.shell.dur + 0.32;
    G.audio?.ui?.(this.shell.sound, 0.5);
  }
  private checkEmpty() {
    if (this.loot && this.loot.kind !== 'floor' && this.loot.items.length === 0) { this.emptyT = 0; this.emptyOn = true; }
  }

  // ================================================================ the frame
  private hook() {
    const pr = G.pr as unknown as { beforeRender: ((dt: number) => void)[] };
    if (!this.hookFn) this.hookFn = (dt: number) => { try { this.frame(dt); } catch (e) { console.warn('fpack', e); } };
    const i = pr.beforeRender.indexOf(this.hookFn);
    if (i !== pr.beforeRender.length - 1) { if (i >= 0) pr.beforeRender.splice(i, 1); pr.beforeRender.push(this.hookFn); }
  }
  private unhook() {
    const pr = G.pr as unknown as { beforeRender: ((dt: number) => void)[] };
    const i = this.hookFn ? pr.beforeRender.indexOf(this.hookFn) : -1;
    if (i >= 0) pr.beforeRender.splice(i, 1);
    const cam = fpCamera();
    if (cam.fov !== 30) { cam.fov = 30; cam.updateProjectionMatrix(); }
  }
  private eyeFovNow(): number {
    const cam = fpCamera();
    const asp = cam.aspect || 1;
    const base = (eyeActive() ? (G.pr as unknown as { eyeFov: number }).eyeFov : this.shell ? FOV_LOOT : FOV_PACK) * DEG;
    const vf = asp >= 1.2 ? base : Math.min(104 * DEG, 2 * Math.atan(Math.tan(base / 2) * 1.2 / asp));
    return vf / DEG;
  }

  private frame(dt: number) {
    if (!this.open || this.suspended || !this.built) return;
    dt = Math.min(0.05, Math.max(0, dt));
    // the camera: the overlay sits at the eye; the set (floor, pack, container) is placed where the eyes see the floor
    const cam = fpCamera();
    cam.position.set(0, 0, 0); cam.rotation.set(0, 0, 0); cam.updateMatrixWorld();
    const fov = this.eyeFovNow();
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    let inv: THREE.Matrix4;
    if (eyeActive()) {
      const e = eyeCamera(); e.updateMatrixWorld(); inv = e.matrixWorldInverse;
      const pr = G.pr as unknown as { eyeFov: number };
      const want = this.shell ? FOV_LOOT : FOV_PACK;
      if (Math.abs(pr.eyeFov - want) > 0.05) eyeEnter({ pitchDeg: this.pitch, fov: pr.eyeFov + (want - pr.eyeFov) * Math.min(1, dt * 6) });
    } else {
      const s = this.synth;
      _v.set(0, KNEEL.y, -KNEEL.fwd).applyMatrix4(this.anchorM); s.position.copy(_v);
      _v2.set(0, KNEEL.y - Math.tan(this.pitch * DEG), -KNEEL.fwd - 1).applyMatrix4(this.anchorM);
      s.up.set(0, 1, 0); s.lookAt(_v2); s.updateMatrixWorld();
      inv = s.matrixWorldInverse;
    }
    this.set.matrix.multiplyMatrices(inv, this.anchorM);
    this.set.matrixWorldNeedsUpdate = true;
    this.set.updateMatrixWorld(true);
    if (this.dirty) this.refresh();
    // the entrance: wait for the eyes (a scripted run or a lost eye goes on regardless)
    if (this.phase === 'enter') {
      this.seqT += dt;
      if (eyeActive() || SCRIPTED || this.seqT > 1.4) this.startOpenSeq();
    }
    this.sequence(dt);
    this.takeTick(dt);
    if (this.drag) this.dragFollow(dt);
    this.flyTick(dt);
    this.poseHands(dt);
    this.body.redraw(); this.lidB.redraw(); if (this.loot) this.lootB.redraw();
    const p = G.local;
    if (p) { this.rack.sync(p, this.drag?.items[0] ?? null); this.rack.update(dt); }
  }

  private sequence(dt: number) {
    const k0 = this.seqKind;
    if (!k0) {
      // an empty container: shown open a moment, then the flaps close and the close-up ends
      if (this.emptyOn && !this.drag && !this.flies.length) {
        this.emptyT += dt;
        if (this.emptyT > 1.1) { this.emptyOn = false; this.seqKind = 'empty'; this.seqT = 0; this.seqDur = SCRIPTED ? 0 : 0.4; }
      }
      return;
    }
    this.seqT += dt;
    const k = this.seqDur > 0 ? Math.min(1, this.seqT / this.seqDur) : 1;
    const pk = this.pack, sh = this.shell;
    const L = this.hands.L, R = this.hands.R;
    if (k0 === 'pack' && pk) {
      // R lifts the buckles, L takes the lid's edge and flips it over
      const a = ease((k - 0.18) / 0.82);
      this.packOpenK = a; pk.setOpen(a);
      if (a < 0.5) { pk.lidEdge(_v); _v.add(pk.root.position); L.goal.copy(_v).add(_v2.set(0, 0.02, 0)); L.pose = 'pinch'; L.rate = 28; }
      else this.restHand('L');
      if (k < 0.3) { R.goal.set(pk.root.position.x + pk.W * 0.22, pk.h + 0.04 + Math.sin(k / 0.3 * Math.PI) * 0.04, pk.root.position.z + pk.L / 2 + 0.03); R.pose = 'pinch'; R.rate = 28; }
      else this.restHand('R');
      if (k >= 1) { this.seqKind = ''; this.phase = 'open'; this.root.classList.add('on'); this.restHands(); this.startLootSeq(); }
      return;
    }
    if (k0 === 'loot' && sh) {
      const od = sh.dur / this.seqDur;
      const a = Math.min(1, k / od);
      this.shellOpenK = ease(a); sh.setOpen(this.shellOpenK);
      if (a < 1) {
        const g = sh.grips(this.shellOpenK, L.goal, R.goal);
        sh.root.updateMatrix();
        L.goal.applyMatrix4(sh.root.matrix); R.goal.applyMatrix4(sh.root.matrix);
        L.pose = g.l; R.pose = g.r; L.rate = R.rate = 26;
      } else {
        // a quick rummage through it
        const t = (k - od) / Math.max(0.01, 1 - od), w = Math.sin(t * Math.PI);
        sh.root.updateMatrix();
        L.goal.set(-sh.W * 0.18 + Math.sin(t * 13) * 0.04, sh.h * 0.5 + 0.03 + w * 0.02, Math.cos(t * 9) * 0.04).applyMatrix4(sh.root.matrix);
        R.goal.set(sh.W * 0.2 + Math.cos(t * 11) * 0.04, sh.h * 0.5 + 0.04, Math.sin(t * 10) * 0.05).applyMatrix4(sh.root.matrix);
        L.pose = R.pose = 'claw';
        if (t < 0.05 && !(sh as any)._rum) { (sh as any)._rum = 1; G.audio?.ui?.('rummage', 0.45); }
      }
      if (k >= 1) { this.seqKind = ''; this.phase = 'open'; this.root.classList.add('on'); this.restHands(); this.checkEmpty(); }
      return;
    }
    if (k0 === 'empty' && sh) {
      this.shellOpenK = 1 - ease(k); sh.setOpen(this.shellOpenK);
      sh.grips(this.shellOpenK, L.goal, R.goal); sh.root.updateMatrix(); L.goal.applyMatrix4(sh.root.matrix); R.goal.applyMatrix4(sh.root.matrix);
      if (k >= 1) { this.seqKind = ''; this.hide(); }
      return;
    }
    if (k0 === 'close') {
      if (sh) { this.shellOpenK = Math.min(this.shellOpenK, 1 - ease(k / 0.5)); sh.setOpen(this.shellOpenK); }
      if (pk) {
        const a = 1 - ease((k - 0.3) / 0.7);
        this.packOpenK = Math.min(this.packOpenK, a); pk.setOpen(this.packOpenK);
        if (this.packOpenK < 0.5) { pk.lidEdge(_v); _v.add(pk.root.position); L.goal.copy(_v).add(_v2.set(0, 0.02, 0)); L.pose = 'pinch'; L.rate = 28; }
      }
      if (k >= 1) { this.seqKind = ''; this.finishClose(); }
      return;
    }
    this.seqKind = '';
  }

  // ================================================================ hands
  private restHand(s: Side) {
    const h = this.hands[s], pk = this.pack;
    if (!pk) return;
    const sg = s === 'R' ? 1 : -1;
    // resting on the near rim of the pack (the right one on the container's when it is open)
    if (s === 'R' && this.shell && this.shellOpenK > 0.9) h.goal.set(this.shellAt.x - this.shell.W * 0.1, this.shell.h + 0.025, this.shellAt.z + this.shell.L / 2 + 0.05);
    else h.goal.set(pk.root.position.x + sg * pk.W * 0.34, pk.h + 0.022, pk.root.position.z + pk.L / 2 + 0.035);
    h.pose = 'relaxed'; h.rate = 9;
  }
  private restHands(snap = false) {
    this.restHand('L'); this.restHand('R');
    if (snap) for (const s of ['L', 'R'] as Side[]) { const h = this.hands[s]; h.cur.copy(h.goal); h.cur.z += 0.25; h.cur.y -= 0.1; }
  }
  private poseHands(dt: number) {
    const busyR = !!this.drag || this.hands.R.busy > 0, busyL = this.hands.L.busy > 0;
    // idle: the free right hand hovers over what the pointer is on
    if (this.phase === 'open' && !this.seqKind) {
      if (!busyR) {
        const hv = this.hover;
        if (hv) { this.boardPoint(hv.b, hv.p.x + hv.p.w / 2, hv.p.y + hv.p.h * 0.7, this.hands.R.goal); this.hands.R.goal.y += 0.07; this.hands.R.goal.z += 0.05; this.hands.R.pose = 'open'; this.hands.R.rate = 8; }
        else this.restHand('R');
      }
      if (!busyL) this.restHand('L');
    }
    for (const s of ['L', 'R'] as Side[]) {
      const h = this.hands[s];
      h.busy = Math.max(0, h.busy - dt);
      h.cur.x = damp(h.cur.x, h.goal.x, h.rate, dt); h.cur.y = damp(h.cur.y, h.goal.y, h.rate, dt); h.cur.z = damp(h.cur.z, h.goal.z, h.rate, dt);
      h.arm.target.copy(h.cur).applyMatrix4(this.set.matrix);
      h.arm.want = h.pose as any;
      poseArm(h.arm, h.roll, dt);
    }
  }

  // ================================================================ boards <-> space
  /** set-local point of an art pixel on a board */
  private boardPoint(b: Board, ax: number, ay: number, out: THREE.Vector3): THREE.Vector3 {
    const m = this.meshOf(b);
    if (!m) return out.set(0, 0, -0.7);
    const g = (m.geometry as THREE.PlaneGeometry).parameters;
    out.set((ax / b.W - 0.5) * g.width, (0.5 - ay / b.H) * g.height, 0.004);
    m.updateWorldMatrix(true, false);
    out.applyMatrix4(m.matrixWorld);
    _m.copy(this.set.matrixWorld).invert();
    return out.applyMatrix4(_m);
  }
  private meshOf(b: Board): THREE.Mesh | null {
    if (b === this.body) return this.pack?.floor ?? null;
    if (b === this.lidB) return this.pack?.lidIn ?? null;
    return this.shell?.floor ?? null;
  }
  private boardHit(x: number, y: number): BoardHit | null {
    const meshes: THREE.Mesh[] = [];
    if (this.pack && this.packOpenK > 0.95) meshes.push(this.pack.floor, this.pack.lidIn);
    if (this.shell && this.shellOpenK > 0.95) meshes.push(this.shell.floor);
    if (!meshes.length) return null;
    pointerRay(this.rc, fpCamera(), x, y);
    const hits = this.rc.intersectObjects(meshes, false);
    for (const h of hits) {
      if (!h.uv) continue;
      const b = h.object === this.pack?.floor ? this.body : h.object === this.pack?.lidIn ? this.lidB : this.lootB;
      return { b, ax: h.uv.x * b.W, ay: (1 - h.uv.y) * b.H, mesh: h.object as THREE.Mesh, point: h.point };
    }
    return null;
  }

  // ================================================================ pointer
  private onDown(e: PointerEvent) {
    if (!this.open || this.suspended || this.phase !== 'open') return;
    e.preventDefault(); e.stopPropagation();
    this.px = e.clientX; this.py = e.clientY;
    const hook = this.rack.at(e.clientX, e.clientY);
    const hit = hook ? null : this.boardHit(e.clientX, e.clientY);
    const placed = hit ? hit.b.hit(hit.ax, hit.ay) : null;
    this.press = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), button: e.button, shift: e.shiftKey, hit, placed, hook: hook && hook !== 'scale' ? hook : null };
    if (e.button === 2) {
      const it = placed?.it ?? (hook && hook !== 'scale' ? this.rack.items(hook)[0] : null);
      if (it) this.card(it, placed?.comp.c ?? null, e.clientX, e.clientY);
      this.press = null;
    }
  }
  private onMove(e: PointerEvent) {
    if (!this.open || this.suspended) return;
    this.px = e.clientX; this.py = e.clientY;
    const pr = this.press;
    if (pr && !this.drag && pr.id === e.pointerId && Math.hypot(e.clientX - pr.x, e.clientY - pr.y) > 6) {
      if (pr.placed) this.beginDrag(pr.placed.items.filter((it) => !pr.hit!.b.lifted.has(it)), pr.placed.comp.c, pr.hit!.b, pr.placed, pr.shift);
      else if (pr.hook) { const it = this.rack.items(pr.hook)[0]; const p = G.local; if (it && p) this.beginDrag([it], p.containerOf(it) ?? p.inv, null, null, false); }
      this.press = null;
    }
    if (this.drag) { this.tip.classList.remove('on'); return; }
    if (this.phase !== 'open') return;
    // hover: names and weights only here
    const hook = this.rack.at(e.clientX, e.clientY);
    this.rack.hover = hook;
    if (hook) {
      this.setHover(null);
      if (hook === 'scale') this.showTip(this.rack.weightText(), '', e.clientX, e.clientY);
      else { const it = this.rack.items(hook)[0]; if (it) this.showTip(itemName(it), itemWeight(it).toFixed(2) + ' kg', e.clientX, e.clientY); else this.tip.classList.remove('on'); }
      return;
    }
    const hit = this.boardHit(e.clientX, e.clientY);
    const pl = hit ? hit.b.hit(hit.ax, hit.ay) : null;
    this.setHover(pl && hit ? { b: hit.b, p: pl } : null);
    if (pl) {
      const n = pl.items.filter((it) => !hit!.b.lifted.has(it)).length;
      this.showTip(itemName(pl.it) + (n > 1 ? ` x${n}` : ''), (itemWeight(pl.it) * n).toFixed(2) + ' kg', e.clientX, e.clientY);
    } else this.tip.classList.remove('on');
  }
  private onUp(e: PointerEvent, cancel: boolean) {
    if (!this.open) return;
    const pr = this.press;
    this.press = null;
    if (this.drag) { this.endDrag(cancel, e.clientX, e.clientY); return; }
    if (!pr || cancel || pr.id !== e.pointerId || pr.button !== 0) return;
    // a click
    const p = G.local; if (!p) return;
    if (pr.hook) { const it = this.rack.items(pr.hook)[0]; if (it) this.card(it, p.containerOf(it) ?? p.inv, e.clientX, e.clientY); return; }
    if (!pr.placed || !pr.hit) return;
    const it = pr.placed.it;
    if (pr.hit.b === this.lootB) { this.take(it); return; }
    if (this.loot && this.shellOpenK > 0.9) { this.put(it, pr.placed.comp.c); return; }
    this.card(it, pr.placed.comp.c, e.clientX, e.clientY);
  }
  private onKey(e: KeyboardEvent) {
    if (!this.open || this.suspended || (G.input as any)?.textFocus) return;
    if (e.code === 'Escape' && !document.querySelector('.ipnl, .kd-veil')) { e.preventDefault(); e.stopImmediatePropagation(); this.toggle(false); }
    else if (e.code === 'KeyF' && this.loot && this.phase === 'open') { e.preventDefault(); e.stopImmediatePropagation(); this.takeAll(); }
    else if (e.code === 'KeyR' && this.drag) { e.preventDefault(); e.stopImmediatePropagation(); this.turnHeld(); }
  }
  private card(it: Item, c: Container | null, x: number, y: number) {
    const p = G.local; if (!p) return;
    openItemPanel(it, c ?? p.containerOf(it) ?? p.inv, { x: x - 20, y: y - 20, w: 40, h: 40 });
  }
  private setHover(h: { b: Board; p: Placed } | null) {
    const was = this.hover;
    if (was && (!h || was.b !== h.b || was.p.it !== h.p.it)) { was.b.hover = null; was.b.dirty = true; }
    this.hover = h;
    if (h && h.b.hover !== h.p.it) { h.b.hover = h.p.it; h.b.dirty = true; if (!was || was.p.it !== h.p.it) G.audio?.ui?.('tick', 0.05); }
  }
  private showTip(name: string, sub: string, x: number, y: number) {
    this.tip.innerHTML = `${esc(name)}${sub ? `<small>${esc(sub)}</small>` : ''}`;
    this.tip.style.left = Math.round(x) + 'px'; this.tip.style.top = Math.round(y - 18) + 'px';
    this.tip.classList.add('on');
  }

  // ================================================================ dragging
  private heldObj(it: Item): ItemObj {
    const o = makeItemObj(it.key, undefined, it);
    const a = itemAlign(it.key);
    const md = a ? Math.max(...a.base) : 0.1;
    const want = Math.max(0.07, Math.min(0.22, md));
    o.outer.scale.setScalar(want / md);
    o.outer.traverse((x) => { x.frustumCulled = false; (x as THREE.Mesh).renderOrder = 5; });
    return o;
  }
  private beginDrag(items: Item[], from: Container, src: Board | null, placed: Placed | null, all: boolean) {
    if (!items.length || this.drag) return;
    const moving = all ? items : [items[items.length - 1]];
    const it = moving[0];
    const origin = new THREE.Vector3();
    if (src && placed) { this.boardPoint(src, placed.x + placed.w / 2, placed.y + placed.h / 2, origin); for (const m of moving) src.lifted.add(m); src.dirty = true; }
    else { pointerRay(this.rc, fpCamera(), this.px, this.py); this.carryPoint(this.px, this.py, origin); }
    const obj = this.heldObj(it);
    obj.outer.position.copy(origin); obj.outer.position.y += 0.01;
    this.set.add(obj.outer);
    const w = moving.reduce((s, m) => s + itemWeight(m), 0);
    this.drag = { items: moving, from, obj, rot: ((it.rot ?? 0) as Rot), origin, src, target: null, carry: origin.clone(), swing: new THREE.Vector2(), swingV: new THREE.Vector2(), last: origin.clone(), weight: w, reach: 0 };
    this.setHover(null);
    G.audio?.itemSound?.(it.key, 'pick', G.local);
    G.audio?.ui?.('cloth', 0.25);
  }
  private carryPoint(x: number, y: number, out: THREE.Vector3): boolean {
    const ray = pointerRay(this.rc, fpCamera(), x, y);
    _ray.copy(ray);
    _m.copy(this.set.matrixWorld).invert();
    _ray.applyMatrix4(_m);
    _plane.set(_v.set(0, 1, 0), -CARRY_Y);
    const hit = _ray.intersectPlane(_plane, out);
    if (!hit) return false;
    out.x = Math.max(-0.9, Math.min(0.9, out.x)); out.z = Math.max(-1.6, Math.min(-0.2, out.z));
    return true;
  }
  private dragFollow(dt: number) {
    const d = this.drag!;
    this.carryPoint(this.px, this.py, d.carry);
    // the hand first reaches the thing, then carries it; heavier things lag and swing more
    d.reach = Math.min(1, d.reach + dt / 0.14);
    const R = this.hands.R;
    const rate = 16 / (1 + d.weight * 0.35);
    const o = d.obj.outer;
    const goal = _v.copy(d.origin).lerp(d.carry, ease(d.reach));
    o.position.x = damp(o.position.x, goal.x, rate, dt); o.position.y = damp(o.position.y, goal.y + (d.reach < 1 ? 0.03 * d.reach : 0), rate, dt); o.position.z = damp(o.position.z, goal.z, rate, dt);
    // a pendulum from the grip
    const vx = (o.position.x - d.last.x) / Math.max(1e-3, dt), vz = (o.position.z - d.last.z) / Math.max(1e-3, dt);
    d.last.copy(o.position);
    d.swingV.x += (-d.swing.x * 70 - d.swingV.x * 6 - vz * 2.2) * dt; d.swing.x += d.swingV.x * dt;
    d.swingV.y += (-d.swing.y * 70 - d.swingV.y * 6 + vx * 2.2) * dt; d.swing.y += d.swingV.y * dt;
    o.rotation.set(Math.max(-0.6, Math.min(0.6, d.swing.x)), (d.rot & 1) ? Math.PI / 2 : 0, Math.max(-0.6, Math.min(0.6, d.swing.y)));
    R.goal.copy(o.position).add(_v2.set(0, 0.035, 0.02)); R.pose = 'grip'; R.rate = 30;
    // where it would land
    const hit = this.boardHit(this.px, this.py);
    let t: DropT | null = null;
    if (hit) t = this.dropAt(hit.b, hit.ax, hit.ay);
    const prev = d.target;
    d.target = t;
    for (const b of [this.body, this.lidB, this.lootB]) {
      const g = t && t.b === b ? { comp: t.cp, gx: t.gx, gy: t.gy, w: t.w, h: t.h, ok: t.ok } : null;
      const same = (b.ghost && g && b.ghost.comp === g.comp && b.ghost.gx === g.gx && b.ghost.gy === g.gy && b.ghost.ok === g.ok && b.ghost.w === g.w) || (!b.ghost && !g);
      if (!same) { b.ghost = g; b.dirty = true; }
    }
    void prev;
    // the rack and the belt light up under it
    this.rack.hover = this.rack.at(this.px, this.py);
  }
  private dropAt(b: Board, ax: number, ay: number): DropT | null {
    const cell = b.cellAt(ax, ay); if (!cell) return null;
    const d = this.drag!, cp = cell.comp, it = d.items[0];
    if (it.inv && (it.inv === cp.c || it.inv.all().some((x) => x.inv === cp.c))) return { b, cp, gx: Math.floor(cell.cx), gy: Math.floor(cell.cy), gz: 0, rot: 0, w: 1, h: 1, ok: false };
    const occ = containerOcc(cp.c, new Set(d.items)); if (!occ) return null;
    const spec = occ.spec;
    const rots = [d.rot, ...orientations(spec, it, d.rot)].filter((r, i, a) => a.indexOf(r) === i && (spec.d > 1 || r <= 1));
    let last: DropT | null = null;
    for (const rot of rots) {
      const [w, h] = extentIn(spec, it, rot);
      if (w > cp.gw || h > cp.gh) continue;
      const gx = Math.max(cp.gx0, Math.min(cp.gx0 + cp.gw - w, Math.round(cell.cx - w / 2)));
      const gy = Math.max(cp.gy0, Math.min(cp.gy0 + cp.gh - h, Math.round(cell.cy - h / 2)));
      let ok = false, gz = 0;
      if (spec.transient) ok = true;
      else if (spec.d > 1) { const ds = dropSpot(occ, it, gx, gy, rot, d.items.length); if (ds) { ok = true; gz = ds.gz; } }
      else ok = testFit(occ, it, gx, gy, rot, d.items.length) !== 'blocked';
      if (ok && d.from !== cp.c && !weightOk(cp.c, it)) ok = false;
      last = { b, cp, gx, gy, gz, rot, w, h, ok };
      if (ok) return last;
    }
    return last ?? { b, cp, gx: Math.floor(cell.cx), gy: Math.floor(cell.cy), gz: 0, rot: 0, w: 1, h: 1, ok: false };
  }
  private turnHeld() {
    const d = this.drag; if (!d) return;
    d.rot = (d.rot === 0 ? 1 : 0) as Rot;
    G.audio?.ui?.('bag_rot', 0.3);
  }
  private endDrag(cancel: boolean, x = this.px, y = this.py) {
    const d = this.drag; if (!d) return;
    this.drag = null;
    for (const b of [this.body, this.lidB, this.lootB]) if (b.ghost) { b.ghost = null; b.dirty = true; }
    const p = G.local;
    const it = d.items[0];
    const back = () => this.settle(d, d.origin, () => { d.src?.lifted.clear(); if (d.src) d.src.dirty = true; }, false);
    if (cancel || !p) { back(); return; }
    // onto the tool belt: bind it to that slot (it stays where it is)
    const slot = (G as any).hotbar?.slotAt?.(x, y) as number | undefined;
    if (slot && p.containerOf(it)) { bindHot(p, slot, it); back(); return; }
    // onto a hook of the rack: wear it / take it in that hand
    const hook = this.rack.at(x, y);
    if (hook && hook !== 'scale' && p.containerOf(it)) {
      const def = itemDef(it.key);
      if (hook === 'R' || hook === 'L') p.actions.add(new EquipAction(p, it, hook));
      else if (def.clothing || def.bag) p.actions.add(new WearAction(p, it));
      else { G.audio?.ui?.('bag_bad', 0.3); back(); return; }
      G.audio?.ui?.('cloth', 0.35);
      this.settle(d, d.obj.outer.position.clone().add(_v.set(0, 0.25, -0.2)), () => { d.src?.lifted.clear(); if (d.src) d.src.dirty = true; }, false);
      return;
    }
    const t = d.target;
    if (!t || !t.ok) { if (t) G.audio?.ui?.('bag_bad', 0.3); back(); return; }
    const spec = t.cp.spec;
    const at: Placement = spec.d > 1 ? { gx: t.gx, gy: t.gy, gz: t.gz, rot: t.rot } : { gx: t.gx, gy: t.gy, rot: t.rot };
    for (const m of d.items) {
      // something worn or held put into a pocket of the same clothes: take it off first
      if (d.from === t.cp.c && d.from === p.inv) {
        if (p.isWorn(m)) p.unwear(m);
        if (p.handR === m) p.equip(null, 'R');
        if (p.handL === m) p.equip(null, 'L');
        setPlace(m, at); bus.emit('inventoryChanged', p);
      } else transferItem(p, m, d.from, t.cp.c, spec.transient ? undefined : at);
    }
    t.b.lifted = new Set([...t.b.lifted, ...d.items]);
    this.refresh();
    const pl = t.b.placedOf(it);
    const dest = new THREE.Vector3();
    if (pl) this.boardPoint(t.b, pl.x + pl.w / 2, pl.y + pl.h / 2, dest); else { const c = t.b.cellCentre(t.cp, t.gx, t.gy, t.w, t.h); this.boardPoint(t.b, c[0], c[1], dest); }
    this.settle(d, dest, () => { for (const m of d.items) { t.b.lifted.delete(m); d.src?.lifted.delete(m); } t.b.dirty = true; if (d.src) d.src.dirty = true; this.thud(it); }, true);
    if (t.b === this.lootB || d.src === this.lootB) this.afterLootChange();
  }
  /** let go: the model drops onto its spot (or swings back) and turns back into the painted icon */
  private settle(d: Drag, to: THREE.Vector3, done: () => void, landed: boolean) {
    const o = d.obj;
    const qa = o.outer.quaternion.clone(), qb = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, (d.rot & 1) ? Math.PI / 2 : 0, 0));
    this.flies.push({ obj: o, a: o.outer.position.clone(), b: to.clone().add(_v.set(0, 0.012, 0)), t: 0, dur: SCRIPTED ? 0 : landed ? 0.14 : 0.22, hand: 'R', arc: landed ? 0.0 : 0.05, done, qa, qb });
    this.hands.R.busy = 0.22;
  }
  private thud(it: Item) {
    G.audio?.ui?.('bag_place', Math.min(0.55, 0.22 + itemWeight(it) * 0.1));
  }
  private flyTick(dt: number) {
    for (let i = 0; i < this.flies.length; i++) {
      const f = this.flies[i];
      f.t += dt;
      const k = f.dur > 0 ? Math.min(1, f.t / f.dur) : 1;
      const e = k * k * (3 - 2 * k);
      f.obj.outer.position.lerpVectors(f.a, f.b, e);
      f.obj.outer.position.y += Math.sin(k * Math.PI) * f.arc;
      f.obj.outer.quaternion.slerpQuaternions(f.qa, f.qb, e);
      if (f.hand) { const h = this.hands[f.hand]; h.goal.copy(f.obj.outer.position).add(_v.set(0, 0.035, 0.02)); h.pose = k < 0.85 ? 'grip' : 'open'; h.rate = 34; h.busy = Math.max(h.busy, 0.15); }
      if (k >= 1) { f.obj.outer.removeFromParent(); this.flies.splice(i, 1); i--; f.done(); }
    }
  }

  // ================================================================ taking and putting back
  private dest(it: Item): Container | null {
    const p = G.local!;
    const parts = this.parts();
    const order = [parts.main, ...parts.extra, parts.roll, p.inv].filter((c): c is Container => !!c);
    return order.find((c) => c.hasRoom(it) && !!spotIn(c, it)) ?? null;
  }
  /** a hand carries a thing across, start to end */
  private carry(it: Item, fromB: Board, toB: Board, move: () => void, hand: Side) {
    const fp = fromB.placedOf(it);
    const a = new THREE.Vector3();
    if (fp) this.boardPoint(fromB, fp.x + fp.w / 2, fp.y + fp.h / 2, a); else this.boardPoint(fromB, fromB.W / 2, fromB.H / 2, a);
    move();
    toB.lifted.add(it); fromB.lifted.add(it);
    this.refresh();
    const tp = toB.placedOf(it);
    const b = new THREE.Vector3();
    if (tp) this.boardPoint(toB, tp.x + tp.w / 2, tp.y + tp.h / 2, b); else this.boardPoint(toB, toB.W / 2, toB.H / 2, b);
    const obj = this.heldObj(it);
    obj.outer.position.copy(a);
    this.set.add(obj.outer);
    const q = new THREE.Quaternion();
    const dur = SCRIPTED ? 0 : 0.34 + Math.min(0.2, a.distanceTo(b) * 0.25);
    // the hand reaches it first (a short beat), then carries it in an arc
    const h = this.hands[hand];
    h.goal.copy(a).add(_v.set(0, 0.035, 0.02)); h.pose = 'grip'; h.rate = 40; h.busy = dur + 0.2;
    this.flies.push({ obj, a, b: b.clone().add(_v.set(0, 0.012, 0)), t: SCRIPTED ? 0 : -0.08, dur, hand, arc: 0.14, done: () => { toB.lifted.delete(it); fromB.lifted.delete(it); toB.dirty = fromB.dirty = true; this.thud(it); }, qa: q.clone(), qb: q.clone() });
    G.audio?.itemSound?.(it.key, 'pick', G.local);
  }
  private take(it: Item): boolean {
    const p = G.local, c = this.loot;
    if (!p || !c || !c.items.includes(it)) return false;
    const to = this.dest(it);
    if (!to) { G.audio?.ui?.('bag_bad', 0.4); return false; }
    const at = spotIn(to, it);
    const toB = to === this.parts().main || this.parts().extra.includes(to) ? this.body : this.lidB;
    const hand = this.takeHand; this.takeHand = hand === 'R' ? 'L' : 'R';
    this.carry(it, this.lootB, toB, () => transferItem(p, it, c, to, at ?? undefined), hand);
    this.afterLootChange();
    return true;
  }
  private put(it: Item, from: Container) {
    const p = G.local, c = this.loot;
    if (!p || !c) return;
    if (c.kind !== 'floor' && (!c.hasRoom(it) || !spotIn(c, it))) { G.audio?.ui?.('bag_bad', 0.4); return; }
    if (p.isWorn(it) || p.handR === it || p.handL === it) { this.card(it, from, this.px, this.py); return; }
    this.emptyOn = false;
    const fromB = this.parts().main === from || this.parts().extra.includes(from) ? this.body : this.lidB;
    this.carry(it, fromB, this.lootB, () => transferItem(p, it, from, c, c.kind === 'floor' ? undefined : spotIn(c, it) ?? undefined), 'R');
  }
  private takeAll() {
    const c = this.loot; if (!c) return;
    this.takeQ = [...c.items];
    this.takeT = 0;
  }
  private takeTick(dt: number) {
    if (!this.takeQ.length) return;
    this.takeT -= dt;
    if (this.takeT > 0) return;
    const it = this.takeQ.shift()!;
    if (this.loot?.items.includes(it)) { if (!this.take(it)) { this.takeQ.length = 0; return; } }
    this.takeT = SCRIPTED ? 0 : 0.17;
  }
  private afterLootChange() {
    if (this.loot && this.loot.kind !== 'floor' && this.loot.items.length === 0) { this.emptyT = -0.6; this.emptyOn = true; }
  }
}
