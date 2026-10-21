// On-screen controls: the whole game playable on a phone or tablet.
//
// The controls are physical found objects drawn in 3D (touch3d.ts / props.ts):
// a red valve wheel is the stick, ATTACK a chunky arcade button, RUN a toggle
// under a flip-up cover, USE a bottle cap, SHOVE a fire-exit crash bar, SNEAK
// a slipper, LIGHT a bulb's pull chain, SHOUT a whistle, the top bar tape-deck
// keys, a disposable camera, a folded map, a tiny scanner and a rucksack; in a
// car a steering wheel, pedals, a horn, a headlight knob, an ignition key and
// a door handle. The DOM buttons below are their (invisible) hit areas, so
// when WebGL is missing the flat pixel pads simply stay visible.
//
//  - floating analog stick in the left thumb zone (small push walks, full push runs)
//  - right-hand action cluster: attack (tap strikes, hold readies with auto-aim,
//    drag aims), use, shove, sneak, flashlight, shout, push-to-talk; top bars for
//    map / scanner / inventory / chat / pause / fullscreen / photo
//  - context actions: placing furniture, driving, riding, carrying, reading, reloading, throwing
//  - the physical overhaul (src/interact/grab.ts, no popups): a work glove to GRAB
//    what is in reach (hold it and the stick pushes / pulls), a throttle for POWER
//    (Shift), a squeeze bulb for the lung PUMP (H), the watch (Tab), the iron-cube
//    backpack (I), a spirit level for BUILD (B), chattering teeth for EMOTE (G);
//    the whistle is the whistle (Q, hold = shout)
//  - USE (bottle cap): tap = the primary verb of what is in reach, hold = grab it,
//    swipe sideways across it = step through its other verbs (the cap shows the word)
//  - world gestures: tap = the primary verb there (walk to a bare floor),
//    long-press = grab it while the finger stays down (or its verbs one word at a time),
//    double-tap = toggle run,
//    one-finger sideways swipe = turn the camera (snaps to the nearest view on release),
//    two-finger pinch = zoom, two-finger twist = turn the camera
//  - scanner: tap its buttons / screen / dial directly, swipe the screen to scroll,
//    or use the 2D strip that sits on top of the device
//
// Every control feeds Input (virtual actions, analog stick, touch aim), so the
// game systems read one path for keyboard, mouse and touch. Mode switching
// (auto / on / off) lives in ./mode.ts.
import * as THREE from 'three';
import './touch.css';
import { G } from '../../game/G';
import type { Game, GameSystem } from '../../game/game';
import type { Action } from '../../core/input';
import type { Player } from '../../entities/player';
import { bus } from '../../core/events';
import { clamp, angleDiff, wrapAngle } from '../../core/math';
import { pick, PickTarget, targetName, targetPos } from '../../game/picking';
import { WalkToAction } from '../../actions/basic';
import { floorItemsNear } from '../../items/worldItems';
import { itemDef } from '../../items/item';
import { objDef } from '../../world/objects';
import { PAGES } from '../scanner/pages';
import { iconUrl } from './icons';
import { isTouchMode, buzz, installTouchMode, lastTouchTime } from './mode';
import type { MenuOption } from '../ui';
import { startBreathing } from '../../survival/mindSystem';
import { Touch3D } from './touch3d';

export { getTouchSetting, setTouchSetting, isTouchMode } from './mode';
export type { TouchSetting } from './mode';

const LONG_MS = 450;       // long-press = context menu
const RING_DELAY = 110;    // the progress ring appears after this
const TAP_MS = 350;
const TAP_SLOP = 12;       // px a tap may wander
const STICK_SLOP = 8;      // px before a touch in the thumb zone becomes the stick
const DOUBLE_MS = 320;
const SWIPE_START = 20;    // px sideways before a world touch turns the camera
const PARK = -9999;        // the "mouse" is parked off-screen between touches (no hover highlight)
const SCAN_LABEL: Record<string, string> = { stat: 'BIO', scan: 'SCAN', sig: 'SIG', map: 'MAP', log: 'LOG', data: 'DATA' };

type Role = 'world' | 'stickPending' | 'stick' | 'gesture' | 'scanner' | 'swipe' | 'dead';
interface TP {
  id: number; x0: number; y0: number; x: number; y: number; ly: number; t0: number;
  role: Role; moved: boolean; long: boolean; longDue: boolean; timer: number; ringTimer: number; acc: number;
  /** a long-press took hold of something: lifting the finger lets go */
  grab?: boolean;
}
interface BtnOpts {
  label?: string; x?: number; y?: number; s?: number; cls?: string;
  /** width / height in button units when not square */
  w?: number; h?: number;
  /** fire on press (default) or on release (needed for fullscreen / keyboard focus) */
  on?: 'down' | 'up';
  tap?: () => void;
  /** held like a key while the finger is down */
  hold?: Action;
  down?: (e: PointerEvent) => void; move?: (e: PointerEvent) => void; up?: (e: PointerEvent, cancelled: boolean) => void;
}

export class TouchControls implements GameSystem {
  name = 'touch';
  root: HTMLDivElement;
  private g: Game;
  private tps = new Map<number, TP>();
  private groups: Record<string, HTMLDivElement> = {};
  private btns: Record<string, HTMLDivElement> = {};
  private vis: Record<string, boolean> = {};
  /** button key -> the group it sits in ('' = directly on the root) */
  private btnGroup: Record<string, string> = {};
  /** the physical 3D controls (null when WebGL is unavailable) */
  readonly t3: Touch3D;
  private synced = new Set<string>();
  private mode = 'walk';
  private stickRun = false;
  // one-finger swipe: free camera orbit while the finger moves, snaps to a view on release
  private swipe: { id: number; lastX: number; lastT: number; vel: number; yaw0: number } | null = null;
  // stick
  private stick: HTMLDivElement; private stickBase: HTMLDivElement; private stickKnob: HTMLDivElement;
  private stickId = -1; private sx = 0; private sy = 0; private R = 60;
  // gestures & feedback
  private gesture: { a: number; b: number; d0: number; dRef: number; aRef: number; cxRef: number } | null = null;
  private lastTap = { t: 0, x: 0, y: 0 };
  private ring: HTMLDivElement; private mark: HTMLDivElement; private reticle: HTMLDivElement;
  // attack button
  private atk: { id: number; x0: number; y0: number; dx: number; dy: number; drag: boolean } | null = null;
  private aimTarget: any = null;
  private fireQueued = false; private fireDeadline = 0; private fireFrames = 0; private aimHoldUntil = 0;
  // use button
  private useTarget: PickTarget | null = null; private useT = 0; private useLabel = '';
  private useHold: { timer: number; fired: boolean; grab: boolean; x0: number; verbs: any[] | null; sel: number } | null = null;
  private hl: THREE.Mesh | null = null; private hlKey = '';
  // context row / scanner strip
  private ctxSig = ''; private scanSig = '';
  private wasPlacing = false;
  private fadeT = 0; private rects: Record<string, DOMRect> = {};
  private fitT = 0; private userLowH = 0; private myLowH = 0;
  private lastUp = 0; private realMouse = 0;
  private active = false;
  private suppressed = false;

  constructor(g: Game) {
    this.g = g;
    installTouchMode();
    const root = this.root = document.createElement('div');
    root.id = 'nc-touch';
    root.addEventListener('contextmenu', (e) => e.preventDefault());
    document.getElementById('nc-touch')?.remove();
    document.body.appendChild(root);
    this.t3 = new Touch3D(root);

    // ---- stick
    this.stick = div(root, 'nc-stick');
    this.stickBase = div(this.stick, 'nc-stick-base');
    this.stickKnob = div(this.stickBase, 'nc-stick-knob');
    this.groups.stick = this.stick;
    this.btn(root, 'run', 'run', { label: 'RUN', cls: 'nc-runbtn', w: 1.15, h: 1.45, tap: () => this.toggleRun() });
    // POWER (Shift): push harder while holding something, sprint otherwise
    this.btn(root, 'power', 'power', { label: 'POWER', cls: 'nc-powbtn', w: 1.15, h: 1.3, down: () => { this.g.input.press('power'); this.g.input.press('run'); }, up: () => { this.g.input.release('power'); this.g.input.release('run'); } });

    // ---- top bars
    const tl = this.group('tl', 'nc-group nc-row nc-tl');
    this.btn(tl, 'menu', 'menu', { label: 'MENU', s: 0.85, tap: () => this.g.input.tap('pause') });
    const fsOk = !!(document.fullscreenEnabled || (document as any).webkitFullscreenEnabled);
    if (fsOk) this.btn(tl, 'fs', 'fullscreen', { label: 'FULL', s: 0.85, on: 'up', tap: () => toggleFullscreen() });
    this.btn(tl, 'photo', 'photo', { label: 'PHOTO', s: 0.85, tap: () => (this.g as any).camera?.photo?.toggle?.() });
    this.btn(tl, 'build', 'build', { label: 'BUILD', s: 0.85, tap: () => this.sys('build', 'toggle') });
    this.btn(tl, 'emote', 'emote', { label: 'EMOTE', s: 0.85, tap: () => this.sys('social', 'emoteWheel', 'emote') });
    const tr = this.group('tr', 'nc-group nc-row nc-tr');
    this.btn(tr, 'chat', 'chat', { label: 'CHAT', s: 0.95, on: 'up', tap: () => this.openChat() });
    this.btn(tr, 'map', 'map', { label: 'MAP', s: 0.95, tap: () => { const sc = this.g.ui?.scanner; if (sc?.open && sc.page === 'map') sc.toggle(false); else sc?.toggle(true, 'map'); } });
    this.btn(tr, 'scanner', 'watch', { label: 'WATCH', s: 0.95, tap: () => { const w = (this.g as any).watch; if (w?.toggle) w.toggle(); else this.g.ui?.scanner?.toggle?.(); } });
    this.btn(tr, 'inv', 'inventory', { label: 'PACK', s: 0.95, tap: () => { const pk = (this.g as any).pack; if (pk?.toggle) pk.toggle(); else this.g.ui?.inventory?.toggle?.(); } });

    // ---- on foot
    const act = this.group('act', 'nc-group nc-br');
    this.btn(act, 'attack', 'attack', { x: 0.05, y: 0.05, s: 1.6, cls: 'round big', down: (e) => this.atkDown(e), move: (e) => this.atkMove(e), up: (_e, c) => this.atkUp(c) });
    this.btn(act, 'use', 'use', { label: 'USE', x: 1.85, y: 0.0, s: 1.3, cls: 'big', down: (e) => this.useDown(e), move: (e) => this.useMove(e), up: (_e, c) => this.useUp(c) });
    this.btn(act, 'shove', 'shove', { label: 'SHOVE', x: 0.0, y: 1.78, w: 1.8, h: 0.82, tap: () => this.g.input.tap('shove') });
    this.btn(act, 'sneak', 'sneak', { label: 'SNEAK', x: 1.95, y: 1.45, s: 1.05, tap: () => this.g.input.tap('sneak') });
    this.btn(act, 'light', 'light', { label: 'LIGHT', x: 3.3, y: 0.08, w: 0.9, h: 2.15, tap: () => this.g.input.tap('flashlight') });
    // the whistle: Q (whistle, hold to shout) is bound to both actions, so the prop presses both
    this.btn(act, 'shout', 'shout', { label: 'WHISTLE', x: 0.3, y: 2.75, s: 1.05, down: () => { this.g.input.press('whistle'); this.g.input.press('shout'); }, up: () => { this.g.input.release('whistle'); this.g.input.release('shout'); } });
    // GRAB: hold on to what is in reach while the glove is held (the stick pushes / pulls it)
    this.btn(act, 'grab', 'grab', { label: 'GRAB', x: 3.25, y: 2.35, s: 1.05, hold: 'hold' });
    // the lung pump (H)
    this.btn(act, 'pump', 'pump', { label: 'PUMP', x: 3.35, y: 3.5, s: 0.95, hold: 'breathe', tap: () => { if (!this.g.hudBody && this.g.local) startBreathing(this.g.local); } });
    this.btn(act, 'talk', 'talk', { label: 'TALK', x: 1.75, y: 2.6, s: 1.0, cls: 'rec', hold: 'talk' });

    // ---- driver's seat (the stick steers)
    const drive = this.group('drive', 'nc-group nc-br');
    this.btn(drive, 'gas', 'gas', { label: 'GAS', x: 0.05, y: 0.05, s: 1.6, cls: 'round big', down: () => { this.g.input.press('up'); if (this.g.input.runLatch) this.g.input.press('run'); }, up: () => { this.g.input.release('up'); this.g.input.release('run'); } });
    this.btn(drive, 'brake', 'brake', { label: 'BRAKE', x: 1.85, y: 0.0, s: 1.3, cls: 'big', hold: 'down' });
    this.btn(drive, 'horn', 'horn', { label: 'HORN', x: 0.2, y: 1.85, s: 1.1, tap: () => this.g.input.tap('shove') });
    this.btn(drive, 'hlights', 'light', { label: 'LIGHTS', x: 1.6, y: 1.55, s: 1.0, tap: () => this.g.input.tap('flashlight') });
    this.btn(drive, 'ign', 'key', { label: 'START', x: 3.35, y: 0.1, s: 1.0, tap: () => this.g.input.tap('reload') });
    this.btn(drive, 'dexit', 'exit', { label: 'EXIT', x: 0.25, y: 3.15, s: 1.0, tap: () => this.g.input.tap('interact') });
    // ---- passenger
    const ride = this.group('ride', 'nc-group nc-br');
    this.btn(ride, 'rexit', 'exit', { label: 'EXIT', x: 0.05, y: 0.05, s: 1.3, tap: () => this.g.input.tap('interact') });

    // ---- context row, scanner strip
    this.group('ctx', 'nc-group nc-row nc-ctx');
    this.group('scan', 'nc-group nc-row nc-scan');

    // ---- feedback
    this.ring = div(root, 'nc-ring');
    this.ring.innerHTML = '<svg width="64" height="64"><circle class="bg" cx="32" cy="32" r="26"/><circle class="fg" cx="32" cy="32" r="26"/></svg>';
    this.ring.style.setProperty('--ring-ms', (LONG_MS - RING_DELAY) + 'ms');
    this.mark = div(root, 'nc-mark');
    this.reticle = div(root, 'nc-reticle');

    // ---- world gestures on the game canvas
    const canvas = g.pr.renderer.domElement;
    canvas.addEventListener('pointerdown', (e) => this.onDown(e), { passive: false });
    // speech bubbles, name tags and progress bars float over the world: touches on them are world touches
    document.getElementById('ui')?.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement)?.closest?.('.w-bubble, .w-bar, .w-name')) this.onDown(e);
    }, { passive: false });
    window.addEventListener('pointermove', (e) => this.onMove(e), { passive: false });
    window.addEventListener('pointerup', (e) => this.onUp(e, false));
    window.addEventListener('pointercancel', (e) => this.onUp(e, true));
    window.addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') this.lastUp = performance.now(); }, true);
    window.addEventListener('mousemove', () => { if (performance.now() - lastTouchTime() > 900) this.realMouse = performance.now(); }, true);
    // phones only unlock audio on touchend / pointerup
    const unlock = () => { const ctx = G.audio?.ctx; if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {}); };
    window.addEventListener('touchend', unlock, { capture: true, passive: true });
    window.addEventListener('resize', () => this.layout());
    window.addEventListener('orientationchange', () => setTimeout(() => this.layout(), 250));
    bus.on('touchMode', (on: boolean) => { if (!on) this.reset(); this.layout(); });
    bus.on('playerHit', (p: Player) => { if (p === G.local) buzz(35); });
    bus.on('downed', (p: Player) => { if (p === G.local) buzz([60, 40, 60]); });
    this.layout();
    (G as any).touch = this;
  }

  // ================================================================ DOM helpers
  private group(key: string, cls: string) { const el = div(this.root, cls); this.groups[key] = el; return el; }

  private btn(parent: HTMLElement, key: string, icon: string, o: BtnOpts): HTMLDivElement {
    const el = div(parent, 'nc-btn ' + (o.cls || ''));
    el.dataset.k = key;
    const i = document.createElement('i'); i.style.backgroundImage = `url(${iconUrl(icon)})`; el.appendChild(i);
    if (o.label) { const b = document.createElement('b'); b.textContent = o.label; el.appendChild(b); }
    if (o.x !== undefined) el.style.setProperty('--x', String(o.x));
    if (o.y !== undefined) el.style.setProperty('--y', String(o.y));
    if (o.s !== undefined) el.style.setProperty('--s', String(o.s));
    if (o.w !== undefined) el.style.setProperty('--w', String(o.w));
    if (o.h !== undefined) el.style.setProperty('--h', String(o.h));
    this.btnGroup[key] = Object.keys(this.groups).find((k) => this.groups[k] === parent) ?? '';
    this.t3.bind(key, el);
    let pid = -1;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (pid >= 0) return;
      pid = e.pointerId;
      try { el.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
      el.classList.add('down');
      this.t3.press(key, true);
      const inp = this.g.input;
      if (!this.g.ui?.inventory?.open) inp.pointerOverUI = false;
      if (o.hold) inp.press(o.hold);
      o.down?.(e);
      if (o.tap && o.on !== 'up') o.tap();
    });
    el.addEventListener('pointermove', (e) => { if (e.pointerId === pid) { e.preventDefault(); o.move?.(e); } });
    const end = (e: PointerEvent, cancelled: boolean) => {
      if (e.pointerId !== pid) return;
      pid = -1;
      el.classList.remove('down');
      this.t3.press(key, false, cancelled);
      if (o.hold) this.g.input.release(o.hold);
      o.up?.(e, cancelled);
      if (o.tap && o.on === 'up' && !cancelled) o.tap();
    };
    el.addEventListener('pointerup', (e) => end(e, false));
    el.addEventListener('pointercancel', (e) => end(e, true));
    el.addEventListener('lostpointercapture', (e) => end(e, true));
    // hiding a held button (leaving the car with the gas down...) lets go of it
    (el as any)._ncRelease = () => { if (pid >= 0) end({ pointerId: pid } as PointerEvent, true); };
    this.btns[key] = el;
    return el;
  }

  private show(key: string, on: boolean) {
    if (this.vis[key] === on) return;
    this.vis[key] = on;
    const el = this.groups[key] || this.btns[key];
    if (!el) return;
    el.classList.toggle('nc-hide', !on);
    if (!on) {
      for (const b of [el, ...el.querySelectorAll('.nc-btn.down')]) (b as any)._ncRelease?.();
      if (key === 'stick' && this.stickId >= 0) this.stickEnd();
    }
    this.rects = {};
  }
  private setOn(key: string, on: boolean) {
    const el = this.btns[key];
    if (el && el.classList.contains('on') !== on) el.classList.toggle('on', on);
    // the first sync snaps the physical control into place without a sound
    const first = !this.synced.has(key);
    if (first) this.synced.add(key);
    this.t3.setOn(key, on, first);
  }
  /** is a button on screen right now (its group and itself shown)? */
  private shownBtn(key: string) {
    const g = this.btnGroup[key];
    return (g ? this.vis[g] === true : this.vis[key] === true) && this.vis[key] !== false;
  }
  private shownFn = (key: string) => this.shownBtn(key);
  private fadedFn = (key: string) => this.fadedBtn(key);
  private fadedBtn(key: string) { const g = this.btnGroup[key]; return g && this.groups[g]?.classList.contains('nc-faded') ? 0.32 : 1; }

  /** button size follows the screen; icons snap to whole multiples of their pixel grid */
  layout() {
    const W = window.innerWidth, H = window.innerHeight;
    const short = Math.min(W, H);
    const u = Math.round(clamp(short * 0.118, 40, 76));
    const ip = 14 * Math.max(2, Math.round(u * 0.52 / 14));
    const ipl = 14 * Math.max(2, Math.round(u * 1.45 * 0.5 / 14));
    this.R = Math.round(clamp(short * 0.14, 46, 84));
    const st = this.root.style;
    st.setProperty('--u', u + 'px'); st.setProperty('--ip', ip + 'px'); st.setProperty('--ipl', ipl + 'px');
    st.setProperty('--R', this.R + 'px');
    this.rects = {};
    this.t3.invalidate();
    if (this.stickId < 0) this.restStick();
  }

  /** hide the on-screen controls for a while (cutscenes, intros); input held through them is released */
  setHidden(v: boolean) {
    if (this.suppressed === v) return;
    this.suppressed = v;
    this.root.classList.toggle('nc-suppressed', v);
    if (v) this.reset();
  }

  // ================================================================ per frame
  update(dt: number) {
    const on = isTouchMode() && !this.suppressed;
    if (on !== this.active) { this.active = on; if (!on) this.reset(); }
    if (!on || !this.g.local || !this.g.ui) { this.t3.update(dt, false, () => false, () => 1, null); return; }
    this.updateControls(dt);
    const stickShown = this.vis.stick ? (this.mode === 'drive' ? 'steer' : 'valve') : null;
    this.t3.update(dt, true, this.shownFn, this.fadedFn, stickShown);
  }

  private updateControls(dt: number) {
    const g = this.g, p = g.local, ui = g.ui, inp = g.input;
    const now = performance.now();
    const sc = ui.scanner;
    const seat = (g as any).vehicles?.seatOf?.(p) as { v: any; seat: number } | null;
    const dead = p.body.dead;
    const modal = !!ui.modal;
    const inv = !!ui.inventory?.open;
    const scan = !!sc?.open;
    const portrait = window.innerHeight > window.innerWidth;
    const mode = dead ? 'dead' : seat ? (seat.seat === 0 ? 'drive' : 'ride') : 'walk';
    if (mode !== this.mode) { this.mode = mode; if (this.stickId < 0) this.restStick(); }
    const free = !dead && !modal && !inv;

    // in portrait the raised scanner fills the bottom of the screen: tap-to-walk only
    const scanCovers = scan && portrait;
    this.show('stick', free && (mode === 'walk' || mode === 'drive') && !scanCovers);
    this.show('run', free && mode === 'walk' && !scanCovers);
    this.show('power', free && mode === 'walk' && !scanCovers);
    this.show('act', free && mode === 'walk' && !scanCovers);
    this.show('drive', free && mode === 'drive');
    this.show('ride', free && mode === 'ride');
    // the inventory has its own close buttons and needs the whole screen
    this.show('tr', !dead && !modal && !inv);
    this.show('tl', !modal && !inv);
    this.show('scan', scan && !inv && !modal && !dead);
    this.show('chat', !!g.net);
    this.show('talk', !!g.net);
    if (mode !== 'walk' || dead) this.cancelAttack();

    // toggles reflect the game state
    this.setOn('sneak', p.sneaking);
    this.setOn('light', p.flashlightOn);
    this.setOn('run', inp.runLatch);
    this.setOn('talk', inp.heldVirtual('talk'));
    const gr = (g as any).grab;
    this.setOn('grab', !!gr?.holding);
    this.setOn('power', inp.heldVirtual('power') || inp.down('power'));
    this.setOn('build', !!(g as any).build?.active);
    this.setOn('scanner', scan || !!(g as any).watch?.open);
    this.setOn('map', scan && sc.page === 'map');
    this.setOn('inv', inv || !!(g as any).pack?.open);
    if (seat) {
      this.setOn('hlights', !!seat.v.lights);
      this.setOn('ign', !!seat.v.running);
      const lbl = this.btns.ign?.querySelector('b');
      const want = seat.v.running ? 'STOP' : 'START';
      if (lbl && lbl.textContent !== want) lbl.textContent = want;
      this.t3.label('ign', want);
    }

    for (const tp of this.tps.values()) if (tp.longDue) { tp.longDue = false; this.longPress(tp); }
    // attack: auto-aim while held, then strike
    this.updateAttack(p, now);
    // use: what's in reach, highlighted
    this.useT -= dt;
    if (this.useT <= 0) { this.useT = 0.15; this.refreshUse(p, mode === 'walk' && free); }
    // context actions
    this.updateContext(p, mode, free);
    // scanner strip over the device
    if (scan) this.updateScanStrip(sc);
    // placing: start the ghost in front of the survivor
    const placing = !!g.items?.placing;
    if (placing && !this.wasPlacing) {
      const s = g.pr.worldToScreen(new THREE.Vector3(p.x + Math.cos(p.facing) * 1.6, p.y, p.z + Math.sin(p.facing) * 1.6));
      inp.mouseX = s.x; inp.mouseY = s.y;
    }
    this.wasPlacing = placing;
    // no hover highlight between touches (unless a real mouse is in use too)
    if (!placing && this.tps.size === 0 && now - this.lastUp > 400 && now - this.realMouse > 2000 && inp.mouseX !== PARK && !ui.menuEl) this.park();
    // keep the clusters from hiding the survivor
    this.fadeT -= dt;
    if (this.fadeT <= 0) { this.fadeT = 0.12; this.fadeOverPlayer(p); }
    // portrait phones: keep the view wide enough for the scanner
    this.fitT -= dt;
    if (this.fitT <= 0) { this.fitT = 0.5; this.fitPortrait(); }
  }

  /** drop all held touch input (mode switched off, focus lost, ...) */
  reset() {
    for (const tp of this.tps.values()) this.cancelTimers(tp);
    this.tps.clear();
    this.gesture = null;
    this.stickEnd();
    this.cancelAttack();
    this.g.input.releaseVirtual();
    this.hideRing();
    this.setHighlight(null);
    this.reticle.style.display = 'none';
    this.endSwipe(true);
    this.t3.reset();
    if (this.myLowH && !isTouchMode()) { const pr = this.g.pr; if (pr.targetLowH === this.myLowH) { pr.targetLowH = this.userLowH || 360; pr.resize(); } this.myLowH = 0; }
  }

  private park() { const inp = this.g.input; inp.mouseX = PARK; inp.mouseY = PARK; }

  // ================================================================ world touches
  private onDown(e: PointerEvent) {
    if (!isTouchMode() || this.suppressed || e.pointerType === 'mouse') return;
    e.preventDefault();
    try { (e.target as Element).setPointerCapture?.(e.pointerId); } catch { /* synthetic */ }
    const g = this.g, inp = g.input, ui = g.ui;
    if (!ui?.inventory?.open) inp.pointerOverUI = false;
    // event timestamps (not handler time) so a busy frame can't turn a tap into a long-press
    const now = evTime(e);
    const tp: TP = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, ly: e.clientY, t0: now, role: 'world', moved: false, long: false, longDue: false, timer: 0, ringTimer: 0, acc: 0 };
    this.tps.set(tp.id, tp);
    if (ui?.menuEl) { ui.closeMenu(); tp.role = 'dead'; return; }
    if (!g.local || g.local.body.dead || ui?.modal) { tp.role = 'dead'; return; }
    const sc = ui?.scanner;
    if (sc?.open && sc.raise > 0.7 && sc.hitTest(tp.x, tp.y)) { tp.role = 'scanner'; return; }
    // a second finger landing together with the first: pinch / twist
    if (this.gesture || this.swipe) { tp.role = 'dead'; return; }
    const other = [...this.tps.values()].find((o) => o !== tp && (o.role === 'world' || o.role === 'stickPending') && !o.long && now - o.t0 < 350);
    if (other) {
      this.cancelTimers(other); this.hideRing();
      other.role = 'gesture'; tp.role = 'gesture';
      const d = Math.max(1, Math.hypot(tp.x - other.x, tp.y - other.y));
      this.gesture = { a: other.id, b: tp.id, d0: d, dRef: d, aRef: Math.atan2(tp.y - other.y, tp.x - other.x), cxRef: (tp.x + other.x) / 2 };
      return;
    }
    if (this.stickId < 0 && this.inStickZone(tp.x, tp.y) && this.vis.stick) { tp.role = 'stickPending'; return; }
    tp.role = 'world';
    // the menu opens on the next frame, after any queued lift of the finger has been seen
    tp.timer = window.setTimeout(() => { tp.longDue = true; }, LONG_MS);
    tp.ringTimer = window.setTimeout(() => this.showRing(tp), RING_DELAY);
  }

  private onMove(e: PointerEvent) {
    const tp = this.tps.get(e.pointerId);
    if (!tp) return;
    if (e.cancelable) e.preventDefault();
    tp.x = e.clientX; tp.y = e.clientY;
    const d = Math.hypot(tp.x - tp.x0, tp.y - tp.y0);
    switch (tp.role) {
      case 'stickPending':
        if (d > STICK_SLOP) { tp.role = 'stick'; this.stickStart(tp); this.stickMove(tp); }
        break;
      case 'stick': this.stickMove(tp); break;
      case 'world': {
        if (d > TAP_SLOP && !tp.moved) { tp.moved = true; this.cancelTimers(tp); this.hideRing(); }
        // dragging while placing furniture slides the ghost
        if (this.g.items?.placing) { this.g.input.mouseX = tp.x; this.g.input.mouseY = tp.y; break; }
        // a sideways swipe on the world turns the camera
        const ax = Math.abs(tp.x - tp.x0), ay = Math.abs(tp.y - tp.y0);
        if (!tp.long && !this.swipe && !this.gesture && ax > SWIPE_START && ax > ay * 0.8) { tp.role = 'swipe'; this.startSwipe(tp); }
        break;
      }
      case 'swipe': this.moveSwipe(tp); break;
      case 'gesture': this.gestureMove(); break;
      case 'scanner': {
        // swipe the screen up/down = turn the dial (scroll lists, tune, zoom the map)
        tp.acc += tp.y - tp.ly;
        if (d > TAP_SLOP) tp.moved = true;
        const step = 22;
        while (Math.abs(tp.acc) >= step) { const s = Math.sign(tp.acc); this.g.ui?.scanner?.turnDial(-s); tp.acc -= s * step; }
        break;
      }
    }
    tp.ly = tp.y;
  }

  private onUp(e: PointerEvent, cancelled: boolean) {
    const tp = this.tps.get(e.pointerId);
    if (!tp) return;
    this.tps.delete(tp.id);
    this.cancelTimers(tp);
    if (tp.role === 'world' || tp.role === 'stickPending') this.hideRing();
    const at = evTime(e), dur = at - tp.t0;
    switch (tp.role) {
      case 'stickPending': if (!cancelled && dur < TAP_MS) this.tap(tp.x, tp.y, at); break;
      case 'stick': this.stickEnd(); break;
      case 'swipe': if (this.swipe?.id === tp.id) this.endSwipe(cancelled); break;
      case 'world':
        if (tp.grab) { (this.g as any).grab?.touchRelease?.(); break; }
        if (!cancelled && !tp.moved && !tp.long && dur < LONG_MS) this.tap(tp.x, tp.y, at);
        break;
      case 'gesture': {
        // lifting one finger ends the gesture; the other one is spent
        const gs = this.gesture;
        if (gs) { const o = this.tps.get(gs.a === tp.id ? gs.b : gs.a); if (o) o.role = 'dead'; }
        this.gesture = null;
        break;
      }
      case 'scanner':
        if (!cancelled && !tp.moved) {
          const inp = this.g.input;
          inp.mouseX = tp.x; inp.mouseY = tp.y;
          this.g.ui?.scanner?.tapAt?.(tp.x, tp.y);
        }
        break;
    }
  }

  private cancelTimers(tp: TP) { clearTimeout(tp.timer); clearTimeout(tp.ringTimer); tp.timer = tp.ringTimer = 0; tp.longDue = false; }

  private inStickZone(x: number, y: number) {
    const W = window.innerWidth, H = window.innerHeight;
    return H > W ? x < W * 0.6 && y > H * 0.64 : x < W * 0.38 && y > H * 0.3;
  }

  /** what a fingertip is on: the exact point first, then a small ring around it (fingers are blunt) */
  pickAt(x: number, y: number): PickTarget | null {
    const g = this.g;
    const opts = { creatures: g.creatures?.list?.() || [], ignore: g.local };
    let first: PickTarget | null = null;
    for (const [dx, dy] of [[0, 0], [0, -14], [12, -6], [-12, -6], [0, 12], [10, 9], [-10, 9]]) {
      const t = pick(x + dx, y + dy, opts);
      if (!t) continue;
      if (!first) first = t;
      if (t.kind !== 'tile') return t;
    }
    return first;
  }

  /** tap on the world = the left-click default action there (walk to / interact / pick up) */
  tap(x: number, y: number, now = performance.now()) {
    const g = this.g, p = g.local, ui = g.ui, inp = g.input;
    if (now - this.lastTap.t < DOUBLE_MS && Math.hypot(x - this.lastTap.x, y - this.lastTap.y) < 40) {
      this.lastTap.t = 0;
      this.toggleRun();
      return;
    }
    this.lastTap = { t: now, x, y };
    if (!p || p.body.dead || !ui || ui.modal) return;
    if (ui.readerEl) { ui.closeReader(); return; }
    inp.mouseX = x; inp.mouseY = y;
    if (g.items?.placing) return; // the ghost follows the finger; PLACE confirms
    const gr = (g as any).grab;
    const self = gr?.pickAt?.(x, y);
    const t = self?.kind === 'self' ? self : this.pickAt(x, y);
    if (t) {
      if (t.kind === 'tile') this.walkTo(p, t.x, t.y, x, y);
      else if (gr) gr.touchPrimary(t);
      else ui.onWorldClick?.(t, 0);
    }
    this.park();
  }

  private walkTo(p: Player, tx: number, ty: number, sx: number, sy: number) {
    if (p.inVehicle || p.body.downed || p.carriedBy || p.sleeping || this.g.transitioning) return;
    const cur = p.actions.current;
    if (cur && cur.started && cur.locks && cur.name !== 'Walk') return;
    p.actions.clear();
    p.actions.add(new WalkToAction(p, tx, ty, false, 0.3));
    this.mark.style.transform = `translate(${sx}px, ${sy}px)`;
    this.mark.classList.remove('go'); void this.mark.offsetWidth; this.mark.classList.add('go');
  }

  /** long-press = the right-click context menu at that point */
  private longPress(tp: TP) {
    if (this.tps.get(tp.id) !== tp || tp.role !== 'world' || tp.moved) return;
    tp.long = true;
    this.hideRing();
    buzz(14);
    const g = this.g, ui = g.ui, inp = g.input;
    if (!ui || ui.modal || !g.local || g.local.body.dead) return;
    if (ui.readerEl) ui.closeReader();
    inp.mouseX = tp.x; inp.mouseY = tp.y;
    const gr = (g as any).grab;
    const self = gr?.pickAt?.(tp.x, tp.y);
    const t = self?.kind === 'self' ? self : this.pickAt(tp.x, tp.y);
    if (t && gr?.touchGrab?.(t)) { tp.grab = true; buzz(20); }
    else if (t && gr) this.verbTag(t, tp.x, tp.y);
    if (!g.items?.placing) this.park();
  }

  /** the verbs of a target as the one-word tag (tap ‹ › to step, tap the word to do it) */
  private verbTag(t: any, x: number, y: number) {
    const gr = (this.g as any).grab, ui = this.g.ui;
    const verbs: { label: string; run: () => void; why?: string | false }[] = gr?.verbsOf?.(t) || [];
    if (!verbs.length || !ui) return;
    const opts: MenuOption[] = verbs.map((v) => ({ label: v.label, action: v.run, disabled: v.why || false }));
    ui.openMenu(x, y, t.kind === 'self' ? 'You' : targetName(t), opts);
  }

  /** a system's method if it is in, else a virtual key tap (build mode, the emote wheel) */
  private sys(name: string, fn: string, action?: Action) {
    const s = (this.g as any)[name];
    if (s?.[fn]) s[fn]();
    else this.g.input.tap(action ?? (name as Action));
  }

  private showRing(tp: TP) {
    if (this.tps.get(tp.id) !== tp || tp.role !== 'world' || tp.moved) return;
    const r = this.ring;
    r.style.transform = `translate(${tp.x}px, ${tp.y}px)`;
    r.classList.remove('go'); void r.offsetWidth; r.classList.add('go');
  }
  private hideRing() { this.ring.classList.remove('go'); }

  private toggleRun() {
    const inp = this.g.input;
    inp.runLatch = !inp.runLatch;
    buzz(8);
    const p = this.g.local;
    if (p) bus.emit('halo', p, inp.runLatch ? 'RUN' : 'WALK');
  }

  // ---------------------------------------------------------------- one-finger swipe: turn the camera
  private startSwipe(tp: TP) {
    const cam = (this.g as any).camera;
    if (!cam?.orbitBy) { tp.role = 'dead'; return; }
    this.swipe = { id: tp.id, lastX: tp.x0, lastT: performance.now(), vel: 0, yaw0: cam.yawGoal };
    this.moveSwipe(tp);
  }
  private moveSwipe(tp: TP) {
    const s = this.swipe, cam = (this.g as any).camera;
    if (!s || s.id !== tp.id || !cam) return;
    const dx = tp.x - s.lastX;
    s.lastX = tp.x;
    if (!dx) return;
    // about a quarter turn per third of the screen; the floor follows the finger
    const k = (Math.PI / 2) / clamp(window.innerWidth * 0.3, 140, 320);
    const dYaw = -dx * k;
    cam.orbitBy(dYaw, 0);
    const now = performance.now(), dts = Math.max(8, now - s.lastT) / 1000;
    s.lastT = now;
    s.vel = s.vel * 0.55 + (dYaw / dts) * 0.45;
  }
  /** let go: settle on the nearest view, or carry on to the next one after a flick or a decent push */
  private endSwipe(cancelled: boolean) {
    const s = this.swipe;
    if (!s) return;
    this.swipe = null;
    const cam = (this.g as any).camera;
    if (!cam?.endOrbit) return;
    const free: number = cam.yawGoal;
    cam.endOrbit();
    if (cam.keepOrbit || cancelled) return;
    const vel = performance.now() - s.lastT > 90 ? 0 : clamp(s.vel, -7, 7);
    const start: number = cam.snapYaw(s.yaw0);
    let target: number = cam.snapYaw(free + vel * 0.14);
    const moved = free - start;
    if (Math.abs(target - start) < 1e-3 && Math.abs(moved) > 0.28) target = start + Math.sign(moved) * Math.PI / 2;
    cam.yawGoal = target;
    this.g.pr.yawTarget = target;
    buzz(6);
  }

  // ---------------------------------------------------------------- two fingers
  private gestureMove() {
    const gs = this.gesture; if (!gs) return;
    const a = this.tps.get(gs.a), b = this.tps.get(gs.b);
    if (!a || !b) return;
    const d = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const cx = (a.x + b.x) / 2;
    // pinch: a zoom level per ~25% change in spread
    const r = Math.log(d / gs.dRef);
    if (Math.abs(r) > 0.26) { this.g.zoomCamera(r > 0 ? 1 : -1); gs.dRef = d; }
    // twist: a quarter turn per ~30 degrees (clockwise fingers turn the view clockwise)
    const da = wrapAngle(ang - gs.aRef);
    if (Math.abs(da) > 0.52) { this.g.rotateCamera(da > 0 ? 1 : -1); gs.aRef = ang; gs.cxRef = cx; return; }
    // two-finger sideways swipe
    const dx = cx - gs.cxRef;
    if (Math.abs(dx) > Math.max(70, window.innerWidth * 0.12) && Math.abs(Math.log(d / gs.d0)) < 0.3) {
      this.g.rotateCamera(dx > 0 ? 1 : -1); gs.cxRef = cx; gs.aRef = ang;
    }
  }

  // ---------------------------------------------------------------- stick
  private restStick() {
    const insetL = safeInset('left'), insetB = safeInset('bottom');
    this.sx = insetL + 18 + this.R;
    this.sy = window.innerHeight - insetB - 18 - this.R;
    this.placeStick(0, 0);
    this.stick.classList.remove('live', 'running');
  }
  private placeStick(kx: number, ky: number) {
    this.stickBase.style.transform = `translate(${this.sx - this.R}px, ${this.sy - this.R}px)`;
    this.stickKnob.style.transform = `translate(${kx}px, ${ky}px)`;
    this.t3.stick(this.sx, this.sy, this.R, kx, ky, this.stickId >= 0, this.stickRun, this.mode === 'drive');
  }
  private stickStart(tp: TP) {
    this.stickId = tp.id;
    const m = this.R + 6;
    this.sx = clamp(tp.x0, m, window.innerWidth - m);
    this.sy = clamp(tp.y0, m, window.innerHeight - m);
    this.stick.classList.add('live');
    // the stick takes over from tap-to-walk
    const cur = this.g.local?.actions.current;
    if (cur?.name === 'Walk') this.g.local.actions.clear();
  }
  private stickMove(tp: TP) {
    let dx = tp.x - this.sx, dy = tp.y - this.sy;
    let len = Math.hypot(dx, dy);
    const R = this.R, follow = R * 1.3;
    // floating: dragging past the rim pulls the base along
    if (len > follow) { const k = 1 - follow / len; this.sx += dx * k; this.sy += dy * k; dx = tp.x - this.sx; dy = tp.y - this.sy; len = follow; }
    const m = Math.min(1, len / R);
    const dz = 0.12;
    const mm = m < dz ? 0 : (m - dz) / (1 - dz);
    const inp = this.g.input;
    if (len > 0.001) { inp.stickX = (dx / len) * mm; inp.stickY = (-dy / len) * mm; } else { inp.stickX = inp.stickY = 0; }
    const kl = Math.min(len, R);
    const kx = len > 0.001 ? dx / len * kl : 0, ky = len > 0.001 ? dy / len * kl : 0;
    const run = mm >= 0.92 || inp.runLatch;
    this.stickRun = run;
    this.placeStick(kx, ky);
    if (this.stick.classList.contains('running') !== run) this.stick.classList.toggle('running', run);
  }
  private stickEnd() {
    const tp = this.tps.get(this.stickId);
    if (tp) tp.role = 'dead';
    this.stickId = -1;
    this.stickRun = false;
    const inp = this.g.input;
    inp.stickX = inp.stickY = 0;
    this.restStick();
  }

  // ---------------------------------------------------------------- attack
  private atkDown(e: PointerEvent) {
    const p = this.g.local;
    if (!p) return;
    this.atk = { id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0, drag: false };
    this.aimTarget = null;
    if (p.actions.current?.name === 'Walk') p.actions.clear();
    this.updateAim(p);
  }
  private atkMove(e: PointerEvent) {
    const a = this.atk; if (!a) return;
    a.dx = e.clientX - a.x0; a.dy = e.clientY - a.y0;
    if (!a.drag && Math.hypot(a.dx, a.dy) > 16) a.drag = true;
  }
  private atkUp(cancelled: boolean) {
    if (!this.atk) return;
    this.atk = null;
    if (cancelled) return;
    this.fireQueued = true;
    this.fireDeadline = performance.now() + 700;
    this.fireFrames = 0;
  }
  private cancelAttack() {
    if (!this.atk && !this.fireQueued && !this.aimHoldUntil && !this.g.input.touchAim) return;
    this.atk = null; this.fireQueued = false; this.aimHoldUntil = 0; this.aimTarget = null;
    this.g.input.touchAim = null;
    this.reticle.style.display = 'none';
  }

  private updateAttack(p: Player, now: number) {
    const inp = this.g.input;
    if (this.fireQueued) {
      const cur = p.actions.current;
      const busy = cur?.started && cur.locks;
      // a strike waits out the cooldown briefly (at least a few frames, however slow they are)
      if ((now > this.fireDeadline && ++this.fireFrames > 3) || p.body.dead || p.inVehicle) this.fireQueued = false;
      else if (p.aiming && p.attackCooldown <= 0 && !busy && !this.g.ui?.menuEl) {
        const ta = inp.touchAim;
        if (ta) p.facing = p.targetFacing = Math.atan2(ta.z - p.z, ta.x - p.x); // auto-aim snaps the swing
        inp.pointerOverUI = false;
        inp.mousePressed[0] = true; // CombatSystem strikes this frame
        this.fireQueued = false;
        this.aimHoldUntil = now + 320;
      }
    }
    if (this.atk || this.fireQueued || now < this.aimHoldUntil) this.updateAim(p);
    else if (inp.touchAim) { inp.touchAim = null; this.aimTarget = null; this.reticle.style.display = 'none'; }
    const a = this.atk;
    this.t3.attackAim(a?.drag ? a.dx : 0, a?.drag ? a.dy : 0, !!a && !!this.aimTarget);
  }

  /** where the attack button aims: a drag direction, else the nearest hostile ahead, else straight ahead */
  private updateAim(p: Player) {
    const inp = this.g.input;
    const yaw = this.g.pr.yaw;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    let tx: number, tz: number, lock = false;
    const a = this.atk;
    if (a?.drag) {
      const sx = a.dx, sy = -a.dy, len = Math.hypot(sx, sy);
      const wx = (rx * sx + fx * sy) / len, wz = (rz * sx + fz * sy) / len;
      const dist = clamp(1.5 + (len - 16) / 14, 1.5, 10);
      tx = p.x + wx * dist; tz = p.z + wz * dist;
      this.aimTarget = null;
    } else {
      // reference direction: where the stick points, else where we face
      let ref = p.facing;
      if (Math.hypot(inp.stickX, inp.stickY) > 0.2) ref = Math.atan2(rz * inp.stickX + fz * inp.stickY, rx * inp.stickX + fx * inp.stickY);
      const c = this.autoTarget(p, ref);
      if (c) { tx = c.x; tz = c.z; lock = true; }
      else { tx = p.x + Math.cos(ref) * 3; tz = p.z + Math.sin(ref) * 3; }
    }
    inp.touchAim = { x: tx, z: tz };
    // reticle on the aim point
    const s = this.g.pr.worldToScreen(new THREE.Vector3(tx, p.y + (lock ? 0.8 : 0.1), tz));
    const r = this.reticle;
    r.style.display = 'block';
    r.style.transform = `translate(${s.x}px, ${s.y}px)`;
    if (r.classList.contains('lock') !== lock) r.classList.toggle('lock', lock);
  }

  private autoTarget(p: Player, ref: number): any {
    const w = this.g.combat?.weapon?.(p)?.w;
    const kind = w?.kind ?? 'unarmed';
    const range = kind === 'firearm' ? 16 : kind === 'thrown' ? 9 : 5;
    const ok = (c: any) => {
      if (!c || c.dead || !c.visibleToLocal || c.tamedBy || c.zoneKey !== p.zoneKey) return false;
      const T = c.sp?.temperament;
      if (!(T === 'hostile' || T === 'stalker' || T === 'ambush' || T === 'territorial' || c.state === 'chase' || c.state === 'attack')) return false;
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d > range) return false;
      if (this.g.view && !this.g.view.vis.isVisible(Math.floor(c.x), Math.floor(c.z))) return false;
      return true;
    };
    // keep a target once chosen, while it stays valid
    if (ok(this.aimTarget)) return this.aimTarget;
    let best: any = null, bs = Infinity;
    for (const c of this.g.creatures?.list?.() || []) {
      if (!ok(c)) continue;
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      const da = Math.abs(angleDiff(ref, Math.atan2(c.z - p.z, c.x - p.x)));
      if (da > 1.35 && d > 1.8) continue; // ahead (about +-75 degrees), or right on top of us
      const sc = d + da * 2.2;
      if (sc < bs) { bs = sc; best = c; }
    }
    this.aimTarget = best;
    return best;
  }

  // ---------------------------------------------------------------- use
  // tap = the primary verb of what is in reach; hold = grab it (or its verbs as a one-word tag);
  // swipe sideways across the cap = step through its verbs (the cap shows the word), lift = do it
  private useDown(e: PointerEvent) {
    const timer = window.setTimeout(() => {
      const h = this.useHold;
      if (!h || h.verbs) return;
      h.fired = true;
      buzz(14);
      this.useLong(h);
    }, LONG_MS);
    this.useHold = { timer, fired: false, grab: false, x0: e.clientX, verbs: null, sel: 0 };
  }
  private useMove(e: PointerEvent) {
    const h = this.useHold; if (!h || h.fired) return;
    const dx = e.clientX - h.x0;
    if (Math.abs(dx) < 28) return;
    h.x0 = e.clientX;
    clearTimeout(h.timer);
    const gr = (this.g as any).grab;
    if (!h.verbs) { h.verbs = this.useTarget ? gr?.verbsOf?.(this.useTarget) || [] : []; h.sel = Math.max(0, h.verbs.findIndex((v: any) => !v.why)); }
    else if (h.verbs.length) h.sel = (h.sel + Math.sign(dx) + h.verbs.length) % h.verbs.length;
    const v = h.verbs[h.sel];
    const word = v ? verbShort(v.label) : 'USE';
    this.t3.label('use', word);
    const b = this.btns.use?.querySelector('b'); if (b) b.textContent = word;
    this.useLabel = '';
    buzz(6);
  }
  private useUp(cancelled: boolean) {
    const h = this.useHold; this.useHold = null;
    if (!h) return;
    clearTimeout(h.timer);
    const g = this.g, p = g.local, gr = (g as any).grab;
    if (h.grab) { gr?.touchRelease?.(); return; }
    if (cancelled || h.fired) return;
    if (!p || p.body.dead) return;
    if (h.verbs) { const v = h.verbs[h.sel]; if (v && !v.why) v.run(); else if (v?.why) bus.emit('think', p, v.why); return; }
    if (p.inVehicle) { g.input.tap('interact'); return; }
    const t = this.findUseTarget(p);
    if (t && gr) gr.touchPrimary(t);
    else if (t) g.interact?.defaultAction?.(p, t);
    else g.input.tap('interact');
  }
  /** hold USE: grab what is in reach (lifting the thumb lets go), else its verbs one word at a time */
  private useLong(h: { grab: boolean }) {
    const g = this.g, p = g.local, gr = (g as any).grab;
    if (!p || !gr) return;
    const t = this.findUseTarget(p);
    if (!t) return;
    if (gr.touchGrab(t)) { h.grab = true; return; }
    const r = this.btns.use.getBoundingClientRect();
    this.verbTag(t, Math.max(8, r.left - 160), Math.max(8, r.top - 60));
  }

  private refreshUse(p: Player, enabled: boolean) {
    if (this.useHold?.verbs) return; // a swipe is showing its verbs
    const t = enabled ? this.findUseTarget(p) : null;
    this.useTarget = t;
    const gr = (this.g as any).grab;
    const pv = t && gr ? gr.primaryOf(t) : null;
    const label = pv ? verbShort(pv.label) : t ? shortName(targetName(t)) : 'USE';
    this.t3.label('use', label);
    if (label !== this.useLabel) {
      this.useLabel = label;
      const b = this.btns.use?.querySelector('b'); if (b) b.textContent = label;
      this.setOn('use', !!t);
    }
    this.setHighlight(t && t.kind === 'object' ? t : null);
  }

  /** the nearest thing in reach, favouring what we face: furniture, doors and windows, items, cars, bodies */
  findUseTarget(p: Player): PickTarget | null {
    const g = this.g;
    if (!g.view || p.body.dead) return null;
    const z = g.getZone(p.zoneKey);
    let best: PickTarget | null = null, bs = Infinity;
    const consider = (t: PickTarget, x: number, zz: number, reach: number, bias = 0) => {
      const d = Math.hypot(x - p.x, zz - p.z);
      if (d > reach) return;
      const da = Math.abs(angleDiff(p.facing, Math.atan2(zz - p.z, x - p.x)));
      const s = d + da * 0.45 + bias;
      if (s < bs) { bs = s; best = t; }
    };
    const P0 = new THREE.Vector3();
    for (const o of g.interact?.objectsNear?.(p, 1.5) || []) {
      const d = objDef(o.key);
      if (!d || d.ceiling) continue;
      const t: PickTarget = { kind: 'object', obj: o, point: P0 };
      const c = targetPos(t);
      consider(t, c.x, c.z, 2.6, 0.2);
    }
    const tx = p.tileX(), ty = p.tileY();
    for (let dy = -1; dy <= 2; dy++) for (let dx = -1; dx <= 2; dx++) for (const side of [0, 1] as const) {
      const e = z.edge(tx + dx, ty + dy, side);
      if (!e || e.kind === 'arch') continue;
      const t: PickTarget = { kind: 'edge', x: tx + dx, y: ty + dy, side, edge: e, point: P0 };
      const c = targetPos(t);
      consider(t, c.x, c.z, 1.3);
    }
    for (const wi of floorItemsNear(z, p.x, p.z, 1.3)) consider({ kind: 'item', wi, point: P0 }, wi.x, wi.z, 1.3, -0.15);
    for (const v of (g as any).vehicles?.list?.() || []) {
      const d = Math.hypot(v.x - p.x, v.z - p.z) - v.def.len / 2;
      if (d < 1.3) consider({ kind: 'vehicle', v, point: P0 }, v.x, v.z, 99, d - Math.hypot(v.x - p.x, v.z - p.z));
    }
    for (const c of g.creatures?.list?.() || []) if (c.dead) consider({ kind: 'creature', c, point: P0 }, c.x, c.z, 1.5);
    return best;
  }

  private setHighlight(t: PickTarget | null) {
    const key = t?.kind === 'object' ? 'o' + t.obj.uid + ':' + t.obj.x + ',' + t.obj.y + ':' + t.obj.rot : '';
    if (key === this.hlKey) return;
    this.hlKey = key;
    if (this.hl) { this.hl.parent?.remove(this.hl); this.hl = null; }
    if (t?.kind === 'object' && this.g.view) {
      const m = this.g.view.zr.highlightMesh(t.obj);
      if (m) { this.g.pr.scene.add(m); this.hl = m; }
    }
  }

  // ---------------------------------------------------------------- context row
  private updateContext(p: Player, mode: string, free: boolean) {
    const g = this.g, ui = g.ui, items = g.items;
    const list: [string, string, string, () => void][] = [];
    if (!p.body.dead && !ui.modal) {
      if (ui.readerEl) list.push(['close', 'cross', 'CLOSE', () => ui.closeReader()]);
      else if (items?.placing) {
        list.push(['prot', 'rotL', 'ROTATE', () => g.input.tap('rotate')]);
        list.push(['place', 'check', 'PLACE', () => items.placementClick(0)]);
        list.push(['pcancel', 'cross', 'CANCEL', () => items.cancelPlacing()]);
      } else if (mode === 'walk' && free) {
        if (p.carrying) list.push(['putdown', 'down', 'PUT DOWN', () => g.net?.toggleCarry?.(p.carrying)]);
        const push = g.destruct?.push;
        if (push?.holding && push.mode === 'carry') list.push(['throw', 'attack', 'THROW', () => push.throw(p)]);
        if (push?.holding || (g as any).grab?.holding) list.push(['letgo', 'down', 'LET GO', () => (g as any).grab?.letGo?.()]);
        const h = p.handR;
        if (h && h.key === 'furniture' && items?.startPlacing) list.push(['fplace', 'down', 'PLACE', () => items.startPlacing(p, h)]);
        const w = h ? itemDef(h.key).weapon : null;
        if (h && w?.kind === 'firearm' && w.ammo && (h.ammo ?? 0) < (w.mag ?? 0) && p.findItem((x) => x.key === w.ammo) && !p.actions.current)
          list.push(['reload', 'reload', 'RELOAD', () => g.interact?.reload?.(p, h)]);
      }
    }
    const sig = list.map((l) => l[0]).join(',');
    this.show('ctx', list.length > 0);
    if (sig === this.ctxSig) return;
    this.ctxSig = sig;
    const el = this.groups.ctx;
    el.textContent = '';
    for (const [k, icon, label, fn] of list) this.btn(el, 'ctx_' + k, icon, { label, tap: fn });
  }

  // ---------------------------------------------------------------- scanner strip
  private updateScanStrip(sc: any) {
    const el = this.groups.scan;
    const sig = PAGES.map((p) => p.key).join(',');
    if (sig !== this.scanSig) {
      this.scanSig = sig;
      el.textContent = '';
      const tabs = div(el, 'nc-scan-tabs'), ctl = div(el, 'nc-scan-ctl');
      for (const pg of PAGES) this.btn(tabs, 'sc_' + pg.key, 'menu', { label: SCAN_LABEL[pg.key] || pg.key.toUpperCase().slice(0, 4), cls: 'txt', tap: () => sc.press(pg.key) });
      this.btn(ctl, 'sc_prev', 'left', { tap: () => sc.turnDial(-1) });
      this.btn(ctl, 'sc_next', 'right', { tap: () => sc.turnDial(1) });
      this.btn(ctl, 'sc_close', 'cross', { tap: () => sc.toggle(false) });
    }
    for (const pg of PAGES) this.setOn('sc_' + pg.key, sc.page === pg.key);
    const r = sc.deviceRect?.();
    if (!r) return;
    const tabs = el.children[0] as HTMLElement, ctl = el.children[1] as HTMLElement;
    const W = window.innerWidth, H = window.innerHeight;
    const sl = safeInset('left') + 6, sr = W - safeInset('right') - 6;
    const u = parseFloat(this.root.style.getPropertyValue('--u')) || 46;
    const topLimit = safeInset('top') + 8 + u * 0.95 + 8;
    // one row above the device when there is room (portrait), else columns either side of it (landscape)
    const rowH = u * 0.8;
    const side = r.top - rowH - 6 < topLimit && r.left - u > sl;
    if (el.classList.contains('side') !== side) el.classList.toggle('side', side);
    const tw = tabs.offsetWidth, th = tabs.offsetHeight, cw = ctl.offsetWidth, ch = ctl.offsetHeight;
    let tx: number, ty: number, cx: number, cy: number;
    if (!side) {
      const total = tw + 6 + cw;
      const left = clamp((r.left + r.right) / 2 - total / 2, sl, sr - total);
      tx = left; cx = left + tw + 6;
      ty = cy = Math.max(topLimit, r.top - rowH - 6);
    } else {
      const mid = (r.top + r.bottom) / 2;
      tx = Math.max(sl, r.left - tw - 8); ty = clamp(mid - th / 2, topLimit, H - th - 8);
      cx = Math.min(sr - cw, r.right + 8); cy = clamp(mid - ch / 2, topLimit, H - ch - 8);
    }
    const t1 = `translate(${Math.round(tx)}px, ${Math.round(ty)}px)`, t2 = `translate(${Math.round(cx)}px, ${Math.round(cy)}px)`;
    if (tabs.style.transform !== t1) tabs.style.transform = t1;
    if (ctl.style.transform !== t2) ctl.style.transform = t2;
  }

  // ---------------------------------------------------------------- chat
  private openChat() {
    const ui = this.g.ui;
    if (!this.g.net || !ui?.openChat) return;
    ui.openChat();
    // focus inside the gesture so the phone keyboard comes up
    (document.querySelector('.k-chatinput') as HTMLInputElement | null)?.focus();
  }

  // ---------------------------------------------------------------- layout helpers
  private fadeOverPlayer(p: Player) {
    if (p.body.dead) return;
    const s = this.g.pr.worldToScreen(new THREE.Vector3(p.x, p.y + 0.9, p.z));
    for (const k of ['act', 'drive', 'tr', 'tl', 'ctx']) {
      const el = this.groups[k];
      if (!this.vis[k]) continue;
      let r = this.rects[k];
      if (!r) { r = this.rects[k] = el.getBoundingClientRect(); }
      const over = s.x > r.left - 14 && s.x < r.right + 14 && s.y > r.top - 30 && s.y < r.bottom + 14;
      if (el.classList.contains('nc-faded') !== over) el.classList.toggle('nc-faded', over);
    }
  }

  /** narrow portrait screens: pick a pixel scale that keeps the view (and the scanner screen) at least 300 px wide */
  private fitPortrait() {
    const pr = this.g.pr;
    if (this.myLowH === 0 || pr.targetLowH !== this.myLowH) { this.userLowH = pr.targetLowH; this.myLowH = 0; }
    const W = Math.floor(window.innerWidth * pr.dpr), H = Math.floor(window.innerHeight * pr.dpr);
    if (H > W) {
      const s = Math.max(1, Math.floor(W / 300));
      const want = H / s;
      const atUser = Math.max(1, Math.round(H / this.userLowH));
      if (W / atUser >= 300) { if (this.myLowH) { pr.targetLowH = this.userLowH; this.myLowH = 0; pr.resize(); } return; }
      if (this.myLowH !== want) { this.myLowH = want; pr.targetLowH = want; pr.resize(); }
    } else if (this.myLowH) {
      pr.targetLowH = this.userLowH; this.myLowH = 0; pr.resize();
    }
  }
}

/** a button-sized name: 'Office Chair (Broken)' -> 'CHAIR' */
/** a verb for the cap: 'Search Filing Cabinet' -> 'SEARCH', 'Pick up Water Bottle' -> 'PICK UP' */
function verbShort(n: string) {
  const words = (n || '').replace(/\s*\(.*?\)/g, '').replace(/:.*$/, '').trim().toUpperCase().split(/\s+/);
  let out = words[0] || 'USE';
  for (let i = 1; i < words.length && (out + ' ' + words[i]).length <= 9; i++) out += ' ' + words[i];
  return out.slice(0, 9);
}
function shortName(n: string) {
  let s = (n || '').replace(/\s*\(.*?\)/g, '').trim().toUpperCase();
  if (s.length > 9) s = s.split(/\s+/).pop() || s;
  return s.slice(0, 9) || 'USE';
}

/** when the browser saw the event (falls back to now) */
function evTime(e: Event) { const t = e.timeStamp; return t > 0 && t <= performance.now() + 1 ? t : performance.now(); }

function div(parent: HTMLElement, cls: string) { const d = document.createElement('div'); d.className = cls; parent.appendChild(d); return d; }

let probe: HTMLDivElement | null = null;
/** CSS safe-area inset in px */
function safeInset(side: 'left' | 'right' | 'top' | 'bottom'): number {
  if (!probe) {
    probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
    document.body.appendChild(probe);
  }
  const cs = getComputedStyle(probe);
  return parseFloat(cs.getPropertyValue('padding-' + side)) || 0;
}

function toggleFullscreen() {
  const d = document as any;
  try {
    if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen)?.call(d);
    else { const el = document.documentElement as any; (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el, { navigationUI: 'hide' }); }
  } catch { /* not allowed */ }
}
