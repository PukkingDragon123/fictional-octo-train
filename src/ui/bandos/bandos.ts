// THE BAND (round 17): the operator's wrist terminal, in first person and in real time. Tab, or the phone's
// MENU key, and the unit raises its left forearm into view: the camera goes into the unit's own eyes (src/fp:
// the world stays alive behind it, a little blurred at the edges, the head breathing and the hand swaying), the
// unit strapped on the forearm, its tube lit on the device. The world does not stop: while you read it you are
// exposed, and if something starts hunting you it snaps shut. Esc is still the pause (src/ui/menus/pause.ts).
// Panicking (src/game/panic.ts), the unit fumbles: a shaky half raise that drops, the screen will not wake.
//
//   the unit      a heavy olive field instrument (./wrist3d.ts): a CRT in a deep bezel under a sun
//                 visor, the SELECT dial on the left, the brightness knob and the phosphor toggle on
//                 the right, RESUME / SAVE / QUIT keys under the tube, a message lamp. Its face is a DOM
//                 picture laid onto the 3D case with a perspective transform, so the keys stay keys
//   the tube      the shared CRT skin (src/ui/crt): phosphor green or amber, scanlines, bulge, bloom,
//                 fringe, grain, flicker; power on, static and roll, collapse to a dot
//   home          the apps as big 3D models turning slowly, a number each, the name only on the picked one.
//                 Pick with the pointer, a tap, the arrows and Enter, the number keys, or the dial
//   the apps      full screen in the tube (./apps.ts), reusing the game's own pages and systems
//   sound         recorded samples: the relay, the dial's ratchet, the tube's power-on and static; the
//                 world plays on (the ambience a little lower, threats and the heartbeat clear)
//
// On a phone held upright the unit stands tall in the view and the icons are thumb sized.
import './bandos.css';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import { sfx } from '../menus/sfx';
import { mxOk } from '../machine/core';
import { mxIconSpinWarm } from '../machine/decor';
import { crtScreen, crtIcon, type Crt, type CrtIcon } from '../crt/crt';
import { mxButton, mxKnob, mxToggleCanvas } from '../machine/kit';
import { isTouchMode } from '../touch/mode';
import { isLoading } from '../loading';
import { purseLine } from '../../game/economy/money';
import { researchPoints } from '../../game/research';
import { APPS, hookMail, mailCount, type AppDef } from './apps';
import { WIDE, TALL, wristArt, wristDial, watchBody, watchArm, type WristLayout } from './wrist3d';
import * as THREE from 'three';
import { fpGroup, fpClaim, fpRelease, fpOwner, fpCamera, fpBlend } from '../../fp/fp';
import { eyeActive } from '../../fp/eye';
import { makeArm, poseArm, type Arm } from '../../craft/fpKit';
import { panicLocks, panicFumble, huntedBy } from '../../game/panic';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; };
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);
const reduce = () => document.documentElement.classList.contains('reduce-flash') || document.body.classList.contains('reduce-flash');
const store = { get(k: string) { try { return localStorage.getItem(k); } catch { return null; } }, set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* private window */ } } };

/** what an app gets: its body in the tube, and the unit */
export interface WinApi { readonly body: HTMLElement; readonly key: string; setTitle(t: string): void; close(): void; focus(): void; readonly os: BandOS }
interface Run { app: AppDef; api: WinApi; body: HTMLElement; dispose?: () => void; tick?: (dt: number) => void }

export class BandOS {
  open = false;
  private root = el('div', 'wt');
  private L: WristLayout = WIDE;
  private built = '';
  private rig!: HTMLElement; private lift!: HTMLElement; private crt!: Crt;
  private topL!: HTMLElement; private topR!: HTMLElement; private foot!: HTMLElement; private home!: HTMLElement; private appEl!: HTMLElement;
  private icons: { b: HTMLButtonElement; ic: CrtIcon }[] = [];
  private dial: ReturnType<typeof wristDial> = null;
  private knob: ReturnType<typeof mxKnob> = null;
  private tog: ReturnType<typeof mxToggleCanvas> = null;
  private msgLamp!: HTMLElement;
  private sel = 0;
  private cur: Run | null = null;
  private busy = 0;
  private raf = 0; private last = 0; private clockT = 0;
  private amber = store.get('band.phos') === 'amber';
  private bright = Number(store.get('band.bright') ?? 2) || 2;
  private lineT = 0;
  private mailSeen = 0;
  private timers: number[] = [];
  // first person: the 3D body and the arm in the overlay scene, the raise (0 down .. 1 up), the fumble
  private fp = false;
  private g3: THREE.Group | null = null; private body3: THREE.Group | null = null; private arm: Arm | null = null; private armKind = '';
  private raise = 0; private raiseGoal = 0; private fumble = -1; private t = 0; private huntT = 0;
  private powered = false;
  private dof!: HTMLElement;

  constructor() {
    (G as any).bandos = this;
    // another close-up takes the eyes (the pack, an inspection): the band goes down
    bus.on('fpLost', (name: string) => { if (name === 'watch' && this.open) this.hide(true); });
    window.addEventListener('keydown', (e) => this.onKey(e), true);
    window.addEventListener('resize', () => { if (this.open) this.layout(); });
    // bake the home screen's turntables while the game idles, so the band turns at once
    const warm = () => { if (!mxOk()) return; for (const a of APPS) mxIconSpinWarm(a.icon, this.iconSize()); };
    setTimeout(() => { const ric = (window as any).requestIdleCallback as ((f: () => void, o?: object) => void) | undefined; if (ric) ric(warm, { timeout: 4000 }); else warm(); }, 6000);
  }

  get phone() { return isTouchMode() && (window.innerWidth < 760 || window.innerHeight > window.innerWidth); }
  /** the turntable models' size (their canvases are 8 px larger: the pad) */
  private iconSize() { return this.phone ? 76 : 70; }

  // ---------------------------------------------------------------- raise / lower
  toggle(v = !this.open) { if (v) this.show(); else this.hide(); }
  show() {
    if (this.open || this.fumble >= 0) return;
    const p = G.local;
    if (!p || p.body?.dead || isLoading() || document.body.classList.contains('noclip-cine')) return;
    hookMail();
    this.L = this.phone ? TALL : WIDE;
    this.build();
    // too frightened: a shaky half raise that drops, the screen will not wake
    if (panicLocks('watch')) { this.startFumble(); return; }
    this.open = true;
    this.raiseUp();
    this.toHome(true);
    this.refreshTop();
    for (const x of this.icons) x.ic.wake();
    this.dial?.to(0, true);
    sfx('servo', 0.4);
    G.audio?.ui?.('cloth', 0.35);
    this.busy = 1;
  }
  /** into the eyes (or, without the overlay, the flat fallback), the root up, the frame running */
  private raiseUp() {
    if (G.input) G.input.pointerOverUI = true;
    // (a fumble keeps the body console up: its heart is the cue)
    if (this.fumble < 0) G.hudBody?.setHidden?.('bandos', true);
    this.root.classList.remove('on', 'up', 'fp', 'flat2d');
    this.crt.el.querySelector('.crt-tube')?.classList.remove('lit', 'dot');
    this.powered = false;
    this.raise = 0; this.raiseGoal = 1;
    this.fp = !!G.pr?.overlayScene && fpClaim('watch', 1.4, { cinematic: 'full', eyePitch: this.L.kind === 'tall' ? 8 : 12 });
    this.root.classList.add(this.fp ? 'fp' : 'flat2d');
    if (this.fp) this.build3d();
    document.body.append(this.root);
    this.layout();
    void this.root.offsetWidth;
    this.root.classList.add('on');
    if (!this.fp) requestAnimationFrame(() => this.root.classList.add('up'));
    this.duck(true);
    this.last = performance.now();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.frame);
  }
  hide(quiet = false) {
    if (!this.open) return;
    this.open = false;
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    // apps that borrowed something give it back (the plotter's canvas, a lab panel)
    this.endApp();
    if (!quiet) sfx('back', 0.5);
    // the tube collapses to a dot, then the arm goes down and the eyes go back to the room
    void this.crt.powerOff();
    this.dial?.to(0);
    this.powered = false;
    setTimeout(() => { if (!this.open) { this.raiseGoal = 0; this.root.classList.remove('up'); G.audio?.ui?.('cloth', 0.3); } }, reduce() ? 0 : 200);
    setTimeout(() => { if (!this.open && this.fumble < 0) this.leave(); }, reduce() ? 60 : 560);
  }
  /** out of the eyes, the root down, the frame stopped */
  private leave() {
    if (this.fp) fpRelease('watch');
    this.fp = false;
    this.duck(false);
    if (G.input) G.input.pointerOverUI = false;
    G.hudBody?.setHidden?.('bandos', false);
    this.root.classList.remove('on');
    setTimeout(() => { if (!this.open && this.fumble < 0) { cancelAnimationFrame(this.raf); this.root.remove(); } }, 260);
  }
  /** the panic fumble: the arm comes up shaking, half way, and drops; a denial; the tube stays dark */
  private startFumble() {
    this.fumble = 0;
    panicFumble('watch');
    this.raiseUp();
    this.raiseGoal = 0.7;
    // the unit's own lamp blinks red (the body console is out of sight in the eyes)
    this.msgLamp.classList.add('pnc');
    setTimeout(() => this.msgLamp.classList.remove('pnc'), 1600);
  }
  private later(ms: number, fn: () => void) { const id = window.setTimeout(() => { this.timers = this.timers.filter((x) => x !== id); if (this.open) fn(); }, ms); this.timers.push(id); }

  /** the tube powers on: a bright line opens to the picture, the static settles */
  private powerOn(short = false) {
    void this.crt.powerOn(short);
    if (!short) { this.later(160, () => this.dial?.to(this.sel + 1)); G.audio?.ui?.('radio_on', 0.35); }
    this.later(short ? 220 : 520, () => { this.busy = 0; });
  }
  /** the world plays on under the band: the ambience and music a little lower (threats, steps and the heartbeat stay) */
  private duck(on: boolean) {
    const a = G.audio as any;
    const ctx = a?.ctx as AudioContext | undefined, buses = a?.buses, vol = a?.vol;
    if (!ctx || !buses || !vol) return;
    for (const k of ['amb', 'music']) buses[k]?.gain?.setTargetAtTime((vol[k] ?? 1) * (on ? 0.55 : 1), ctx.currentTime, 0.15);
  }

  // ---------------------------------------------------------------- the frame
  private frame = (now: number) => {
    if (!this.open && this.fumble < 0 && this.raise <= 0.001 && !this.root.isConnected) return;
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000)); this.last = now;
    this.t += dt;
    const c = this.cur;
    if (this.open && c?.tick) { try { c.tick(dt); } catch (e) { console.warn('band app', c.app.key, e); c.tick = undefined; } }
    this.clockT -= dt;
    if (this.clockT <= 0) { this.clockT = 1; this.refreshTop(); this.syncMsg(); }
    if (this.lineT > 0) { this.lineT -= dt; if (this.lineT <= 0) this.footLine(); }
    // exposed: something starts hunting the unit, the band snaps shut
    this.huntT -= dt;
    if (this.open && this.huntT <= 0) { this.huntT = 0.25; if (!(navigator as any).webdriver && huntedBy()) { sfx('relay', 0.6); this.hide(true); } }
    this.step(dt);
    this.raf = requestAnimationFrame(this.frame);
  };
  /** the raise and the first-person placement: the arm, the case, the face laid onto it */
  private step(dt: number) {
    const L = this.L;
    // the raise follows the camera's cut in (the arm only shows through the eyes)
    const cut = this.fp ? (eyeActive() ? Math.min(1, Math.max(0, (fpBlend() - 0.5) / 0.5)) : 0) : 1;
    const goal = Math.min(this.raiseGoal, cut);
    const sp = this.fumble >= 0 ? 5 : 3.6;
    this.raise += Math.max(-dt * sp, Math.min(dt * sp, goal - this.raise));
    if (this.fumble >= 0) {
      this.fumble += dt;
      if (this.raise >= this.raiseGoal - 0.02 && this.raiseGoal > 0) { this.raiseGoal = 0; sfx('clamp', 0.4); }
      if (this.raiseGoal === 0 && this.raise <= 0.01 && this.fumble > 0.4) { this.fumble = -1; this.leave(); }
    } else if (this.open && !this.powered && this.raise >= 0.97) { this.powered = true; this.powerOn(); }
    if (!this.fp) return;
    const cam = fpCamera();
    cam.position.set(0, 0, 0); cam.rotation.set(0, 0, 0);
    const fov = 30, half = Math.tan((fov * Math.PI) / 360), asp = cam.aspect || window.innerWidth / Math.max(1, window.innerHeight);
    if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
    const k = (L.kind === 'wide' ? 0.18 : 0.092) / L.W, Wm = L.W * k, Hm = L.H * k;
    const fill = L.kind === 'wide' ? 0.74 : 0.82;
    const d = Math.max(Hm / (fill * 2 * half), Wm / (fill * 2 * half * asp));
    // breathing, a little sway; the panic shakes it (and the fumble shakes it hard)
    const panic = Math.min(1, ((G.local?.body as any)?.panic ?? 0) / 100);
    const shake = this.fumble >= 0 ? 1 : panic * 0.4;
    const r = this.raise, e = r * r * (3 - 2 * r), lo = 1 - e;
    const t = this.t;
    const jx = (Math.sin(t * 31) + Math.sin(t * 47)) * 0.0012 * shake, jy = (Math.sin(t * 37) + Math.sin(t * 53)) * 0.0012 * shake;
    const b3 = this.body3!;
    const tall = L.kind === 'tall';
    b3.position.set((tall ? -0.012 : 0.03) * d + Math.sin(t * 0.9) * 0.0016 + jx, -d * 0.025 + Math.sin(t * 1.55) * 0.0022 - lo * d * 0.95 + jy, -d - lo * d * 0.25);
    b3.rotation.set(-0.06 + lo * 1.0 + Math.sin(t * 1.1) * 0.006, (tall ? 0.04 : 0.12) + Math.sin(t * 0.8) * 0.008, (tall ? -0.015 : -0.035) + Math.sin(t * 0.7) * 0.01 + lo * 0.25);
    b3.updateMatrixWorld(true);
    // the forearm under the case, its back to the eyes (palm away)
    const arm = this.arm!;
    const A = watchArm(L, k);
    arm.elbow.copy(b3.localToWorld(A.elbow.clone()));
    arm.target.copy(b3.localToWorld(A.wrist.clone()));
    const dir = this.v1.subVectors(arm.target, arm.elbow).normalize();
    this.q1.setFromUnitVectors(this.up, dir).invert();
    const tl = this.v2.copy(arm.target).applyQuaternion(this.q1);
    poseArm(arm, Math.atan2(tl.x, tl.z) * arm.side, dt);
    // the face: its four corners on screen, the DOM picture laid onto them
    const vw = window.innerWidth, vh = window.innerHeight;
    const pts = [[-Wm / 2, Hm / 2], [Wm / 2, Hm / 2], [Wm / 2, -Hm / 2], [-Wm / 2, -Hm / 2]].map(([x, y]) => {
      const v = b3.localToWorld(this.v3.set(x, y, 0.0005)).project(cam);
      return [(v.x + 1) / 2 * vw, (1 - v.y) / 2 * vh] as [number, number];
    });
    this.lift.style.transform = quadMatrix(L.W, L.H, pts);
    this.lift.style.visibility = r > 0.02 ? 'visible' : 'hidden';
    const cx = (pts[0][0] + pts[2][0]) / 2, cy = (pts[0][1] + pts[2][1]) / 2;
    this.root.style.setProperty('--fx', Math.round(cx) + 'px');
    this.root.style.setProperty('--fy', Math.round(cy) + 'px');
    this.root.style.setProperty('--fr', Math.round(Math.hypot(pts[2][0] - pts[0][0], pts[2][1] - pts[0][1]) * 0.62) + 'px');
  }
  private v1 = new THREE.Vector3(); private v2 = new THREE.Vector3(); private v3 = new THREE.Vector3(); private q1 = new THREE.Quaternion(); private up = new THREE.Vector3(0, 1, 0);
  /** the case's body and the gloved left forearm in the overlay scene (rebuilt when the layout changes) */
  private build3d() {
    const L = this.L;
    if (!this.g3) this.g3 = fpGroup('watch');
    if (this.armKind === L.kind && this.body3 && this.arm) return;
    this.g3.clear();
    const k = (L.kind === 'wide' ? 0.18 : 0.092) / L.W;
    this.body3 = watchBody(L, k);
    this.g3.add(this.body3);
    const A = watchArm(L, k);
    const arm = makeArm(-1, A.wrist.distanceTo(A.elbow) / 0.26);
    arm.want = 'relaxed';
    // a work glove on the hand (the sleeve covers the forearm)
    arm.fp.setLook({ skin: 0x3a3127 });
    this.g3.add(arm.root);
    this.arm = arm;
    this.armKind = L.kind;
  }

  // ---------------------------------------------------------------- building
  private build() {
    const L = this.L, key = L.kind + (mxOk() ? 'm' : '');
    if (this.built === key) return;
    this.built = key;
    this.endApp();
    const r = this.root;
    r.replaceChildren();
    r.className = 'wt ' + L.kind + (this.amber ? ' amb' : '');
    // the world behind, a little out of focus round the unit (the unit sharp)
    this.dof = el('div', 'wt-dof');
    r.append(this.dof);
    this.rig = el('div', 'wt-rig');
    this.lift = el('div', 'wt-lift');
    this.rig.append(this.lift);
    this.lift.style.width = L.W + 'px'; this.lift.style.height = L.H + 'px';
    // the unit (and the arm) as one picture, or a plain case without WebGL
    const art = wristArt(L);
    if (art) { art.className = 'wt-art'; art.style.left = L.ox + 'px'; art.style.top = L.oy + 'px'; art.style.width = L.cw + 'px'; art.style.height = L.ch + 'px'; this.lift.append(art); }
    else this.lift.classList.add('flat');
    // the tube (the shared CRT skin, src/ui/crt)
    const win = el('div', 'wt-crt');
    Object.assign(win.style, { left: L.scr.x + 'px', top: L.scr.y + 'px', width: L.scr.w + 'px', height: L.scr.h + 'px' });
    this.crt?.dispose();
    this.crt = crtScreen({ phos: this.amber ? 'amber' : 'green' });
    this.crt.glass.classList.add('wt-glass');
    const top = el('div', 'wt-top');
    this.topL = el('b'); this.topR = el('span');
    top.append(this.topL, this.topR);
    this.home = el('div', 'wt-home');
    this.appEl = el('div', 'wt-app');
    this.foot = el('div', 'wt-foot');
    this.crt.glass.append(top, this.home, this.appEl, this.foot);
    win.append(this.crt.el);
    this.lift.append(win);
    // home: the apps three by three
    this.icons = [];
    const size = this.iconSize();
    APPS.forEach((a, i) => {
      const b = el('button', 'wt-ic') as HTMLButtonElement;
      b.type = 'button'; b.dataset.k = a.key; b.setAttribute('aria-label', `${a.title}: ${a.sub}`);
      // a big turning model, its key number; the name only on the one picked
      const ic = crtIcon(a.icon, size, { name: a.title, num: i + 1 });
      b.append(ic.el);
      b.addEventListener('pointerenter', () => { if (!this.cur && !this.busy) this.select(i); });
      b.addEventListener('focus', () => { if (!this.cur) this.select(i, true); });
      b.addEventListener('click', () => { this.select(i, true); this.launch(a.key); });
      this.home.append(b);
      this.icons.push({ b, ic });
    });
    // the moving parts on the case
    const D = L.dial;
    const dial = wristDial(D.s);
    this.dial = dial;
    const dw = el('button', 'wt-dial') as HTMLButtonElement;
    dw.type = 'button'; dw.setAttribute('aria-label', 'Select dial');
    Object.assign(dw.style, { left: D.x - 5 + 'px', top: D.y - 5 + 'px', width: D.s + 10 + 'px', height: D.s + 10 + 'px' });
    if (dial) dw.append(dial.cv);
    let wheelT = 0;
    dw.addEventListener('wheel', (e) => { e.preventDefault(); const t = performance.now(); if (t - wheelT < 110) return; wheelT = t; this.turn(e.deltaY > 0 || e.deltaX > 0 ? 1 : -1); }, { passive: false });
    dw.addEventListener('click', (e) => {
      const rc = dw.getBoundingClientRect(), fx = (e.clientX - rc.left) / rc.width;
      if (e.detail === 0) { this.enter(); return; }
      if (fx < 0.36) this.turn(-1); else if (fx > 0.64) this.turn(1); else this.enter();
    });
    this.lift.append(dw);
    const K = L.knob, knob = mxKnob(K.s);
    this.knob = knob;
    const kw = el('button', 'wt-knob') as HTMLButtonElement;
    kw.type = 'button'; kw.setAttribute('aria-label', 'Brightness');
    Object.assign(kw.style, { left: K.x - 4 + 'px', top: K.y - 4 + 'px' });
    if (knob) { kw.append(knob.cv); knob.set(this.bright / 3); }
    kw.addEventListener('click', () => { this.bright = (this.bright + 1) % 4; store.set('band.bright', String(this.bright)); knob?.set(this.bright / 3, false); sfx('tick', 0.5); this.applyLook(); });
    this.lift.append(kw);
    const tg = mxToggleCanvas(!this.amber);
    this.tog = tg;
    const tw = el('button', 'wt-tog') as HTMLButtonElement;
    tw.type = 'button'; tw.setAttribute('aria-label', 'Phosphor: green or amber');
    Object.assign(tw.style, { left: L.tog.x - 4 + 'px', top: L.tog.y - 4 + 'px' });
    if (tg) tw.append(tg.cv); else tw.textContent = 'PHOS';
    tw.addEventListener('click', () => { this.amber = !this.amber; store.set('band.phos', this.amber ? 'amber' : 'green'); tg?.flip(!this.amber); sfx('rocker', 0.6); this.applyLook(); this.crt.burst(0.4, 0.25); });
    this.lift.append(tw);
    // RESUME, SAVE, QUIT under the tube
    const keyDefs: [string, () => void, 'olive' | 'yellow' | 'red', 'green' | 'amber' | 'red'][] = [
      ['RESUME', () => this.hide(), 'olive', 'green'],
      ['SAVE', () => void this.save(), 'yellow', 'amber'],
      ['QUIT', () => void this.quit(), 'red', 'red'],
    ];
    keyDefs.forEach(([label, fn, tone, lamp], i) => {
      const R = L.keys[i];
      const b = mxButton(label, fn, { tone, lamp, w: R.w, h: R.h, cls: 'wt-key', sound: 'key' });
      Object.assign(b.style, { position: 'absolute', left: R.x + 'px', top: R.y + 'px' });
      if (label === 'SAVE' && G.role === 'client') { b.disabled = true; b.classList.add('off'); }
      this.lift.append(b);
    });
    this.msgLamp = el('i', 'wt-msg');
    Object.assign(this.msgLamp.style, { left: L.msg.x - 7 + 'px', top: L.msg.y - 7 + 'px' });
    this.lift.append(this.msgLamp);
    r.append(this.rig);
    this.applyLook();
  }
  private applyLook() {
    this.root.classList.toggle('amb', this.amber);
    this.crt?.setPhos(this.amber ? 'amber' : 'green');
    this.crt?.setBright([0.72, 0.88, 1, 1.16][this.bright] ?? 1);
  }
  /** fit the unit to the window: in first person the frame lays the face onto the case; flat, it is centred */
  private layout() {
    const L = this.phone ? TALL : WIDE;
    if (L !== this.L) { this.L = L; this.build(); this.toHome(true); if (this.fp) this.build3d(); }
    if (this.fp) { this.rig.style.transform = 'none'; return; }
    const vw = window.innerWidth, vh = window.innerHeight;
    // (a desktop leaves the forearm showing either side of the case: the sleeve left, the wrist and hand right)
    const s = L.kind === 'tall' ? Math.min(vw / L.W, vh / L.H) : Math.min((vw * 0.8) / L.W, (vh * 0.9) / L.H);
    this.rig.style.transform = `translate(${Math.round((vw - L.W * s) / 2)}px, ${Math.round((vh - L.H * s) / 2 + (L.kind === 'wide' ? vh * 0.01 : 0))}px) scale(${s})`;
  }

  // ---------------------------------------------------------------- home, apps
  private select(i: number, quiet = false) {
    i = (i + APPS.length) % APPS.length;
    const was = this.sel;
    this.sel = i;
    this.icons.forEach((x, k) => { x.b.classList.toggle('sel', k === i); x.ic.hot(k === i); });
    if (!this.cur) this.footLine();
    if (i !== was && !quiet) sfx('hover', 0.3);
    if (!this.busy) this.dial?.to(i + 1);
  }
  /** the dial: on home it moves the pick; in an app it changes app */
  private turn(d: number) {
    if (this.busy) return;
    if (this.cur) { const i = (APPS.findIndex((a) => a.key === this.cur!.app.key) + d + APPS.length) % APPS.length; this.select(i, true); this.launch(APPS[i].key); }
    else this.select(this.sel + d);
  }
  private enter() { if (this.cur) this.back(); else this.launch(APPS[this.sel].key); }
  private toHome(instant = false) {
    this.endApp();
    this.home.hidden = false;
    this.appEl.hidden = true;
    this.root.classList.remove('in-app');
    this.select(this.sel, true);
    if (instant) this.dial?.to(this.sel + 1, true);
    this.refreshTop();
  }
  private endApp() {
    const c = this.cur;
    if (!c) return;
    this.cur = null;
    try { c.dispose?.(); } catch (e) { console.warn(e); }
    c.body.remove();
  }
  /** open an app full screen in the tube: a static burst, the picture rolls in, the dial turns to it */
  launch(key: string) {
    const i = APPS.findIndex((x) => x.key === key);
    const a = APPS[i];
    if (!a || !this.open) return;
    if (this.cur?.app.key === key) return;
    this.sel = i;
    this.dial?.to(i + 1);
    this.busy = 1;
    G.audio?.ui?.('static_burst', 0.22);
    void this.crt.swap(() => {
      if (!this.open) return;
      this.endApp();
      const body = el('div', 'wt-app-body wt-a-' + a.key);
      this.appEl.replaceChildren(body);
      this.appEl.hidden = false;
      this.home.hidden = true;
      this.root.classList.add('in-app');
      const api: WinApi = { body, key, os: this, setTitle: () => {}, close: () => this.back(), focus: () => {} };
      const run: Run = { app: a, api, body };
      this.cur = run;
      try {
        const out = a.build(api);
        if (out && typeof out === 'object') { run.dispose = out.dispose; run.tick = out.tick; }
      } catch (e) { console.error('band app', key, e); body.append(el('p', 'bos-p', 'NO SIGNAL. The band logged it.')); }
      if (key === 'mail') { this.mailSeen = mailCount(); this.syncMsg(); }
      this.refreshTop();
      this.footLine();
    }).then(() => { this.busy = 0; });
  }
  /** Esc / B: out of an app (the picture collapses to a dot and home powers back on); on home, lower the arm */
  back() {
    if (!this.cur) { this.hide(); return; }
    if (this.busy) return;
    this.busy = 1;
    sfx('back', 0.45);
    void this.crt.powerOff().then(() => { if (!this.open) return; this.toHome(); this.powerOn(true); });
  }

  // ---------------------------------------------------------------- the lines on the tube
  private refreshTop() {
    if (!this.topL) return;
    this.topL.textContent = this.cur ? this.cur.app.title.toUpperCase() : 'MI-7';
    const c = G.clock as any;
    const hrs = c?.hours ?? 0;
    const d = (G as any).debt;
    let rp = 0;
    try { rp = researchPoints(); } catch { /* no profile */ }
    // numbers, not sentences: the debt as a negative, the purse, the clock (it runs: the band holds nothing)
    const money = (d?.on && !d.cleared ? `-${Math.round(d.remaining ?? 0).toLocaleString('en-GB')} CR · ` : '') + purseLine(d?.on && d.cleared ? (d.surplus ?? 0) : null);
    const clock = `D${c?.day ?? Math.floor(hrs / 24) + 1} ${String(Math.floor(hrs % 24)).padStart(2, '0')}:${String(Math.floor((hrs % 1) * 60)).padStart(2, '0')}`;
    this.topR.textContent = this.L.kind === 'tall' ? clock : `${clock} · ${money}${money.includes('RP') ? '' : ` · ${rp} RP`}`;
  }
  private footLine() {
    if (!this.foot || this.lineT > 0) return;
    // keys, not sentences; in an app a soft key back to home (a phone has no Esc)
    this.foot.classList.remove('line');
    const touch = isTouchMode();
    this.foot.innerHTML = this.cur ? `<button type="button" class="wt-back">&lt; HOME</button><span></span>${touch ? '' : '<kbd>ESC</kbd>'}` : `<span></span>${touch ? '' : '<kbd>1-9</kbd><kbd>ENTER</kbd><kbd>ESC</kbd>'}`;
    this.foot.querySelector('.wt-back')?.addEventListener('click', () => this.back());
  }
  /** a line from the band: on the tube's foot line for a while, never a box */
  toast(text: string) {
    if (!this.foot) return;
    this.lineT = 3;
    this.foot.classList.add('line');
    this.foot.innerHTML = `<span>&gt; ${esc(text)}</span><i class="wt-cur"></i>`;
    sfx('type', 0.3);
  }
  private syncMsg() { this.msgLamp?.classList.toggle('on', mailCount() > this.mailSeen); }

  private async save() {
    if (G.role === 'client') return;
    const { saveGame } = await import('../../game/save');
    const ok = await saveGame();
    this.toast(ok ? 'TAPE SAVED TO THIS BROWSER.' : 'COULD NOT SAVE.');
  }
  private async quit() {
    const { confirmDialog } = await import('../menus/common');
    const ok = await confirmDialog({ title: 'Quit to title', body: G.role === 'client' ? 'Leave the room and go back to the title?' : 'Your progress is saved first, then the tape rewinds to the title.', ok: 'Quit', cancel: 'Stay', danger: true });
    if (!ok) return;
    if (G.role !== 'client') { const { saveGame } = await import('../../game/save'); await saveGame(); }
    location.reload();
  }

  // ---------------------------------------------------------------- keys
  private onKey(e: KeyboardEvent) {
    const typing = (e.target as HTMLElement)?.closest?.('input, textarea, [contenteditable="true"]');
    if (!this.open) {
      if (e.code === 'Tab' && !e.repeat && !typing && !G.input?.textFocus && G.local && !(G as any).ui?.modal && !document.querySelector('.ipnl, .kd-veil, .mx-over:not(.mx-embed)')) { e.preventDefault(); e.stopImmediatePropagation(); this.show(); }
      return;
    }
    if (document.querySelector('.kd-veil, .ipnl')) return; // a dialog or an item card over the unit takes the keys
    if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); this.back(); return; }
    if (e.code === 'Tab') { e.preventDefault(); e.stopImmediatePropagation(); this.hide(); return; }
    if (typing) return;
    if (!this.cur) {
      const cols = this.L.kind === 'wide' ? 4 : 2;
      const mv = e.code === 'ArrowLeft' ? -1 : e.code === 'ArrowRight' ? 1 : e.code === 'ArrowUp' ? -cols : e.code === 'ArrowDown' ? cols : 0;
      if (mv) { e.preventDefault(); e.stopImmediatePropagation(); this.select(this.sel + mv); return; }
      if (e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter') { e.preventDefault(); e.stopImmediatePropagation(); this.launch(APPS[this.sel].key); return; }
    }
    if (e.code === 'BracketLeft' || e.code === 'BracketRight') { e.preventDefault(); e.stopImmediatePropagation(); this.turn(e.code === 'BracketLeft' ? -1 : 1); return; }
    const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
    if (m && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); e.stopImmediatePropagation(); const i = Number(m[1]) - 1; if (APPS[i]) { this.select(i, true); this.launch(APPS[i].key); } }
  }
}

/** the CSS transform that lays a w x h element onto a screen quad (top-left, top-right, bottom-right, bottom-left) */
function quadMatrix(w: number, h: number, q: [number, number][]): string {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3, dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  const den = dx1 * dy2 - dx2 * dy1 || 1e-9;
  const g = (dx3 * dy2 - dx2 * dy3) / den, hh = (dx1 * dy3 - dx3 * dy1) / den;
  const a = x1 - x0 + g * x1, b = x3 - x0 + hh * x3, c = x0, d = y1 - y0 + g * y1, e = y3 - y0 + hh * y3, f = y0;
  const m = [a / w, d / w, 0, g / w, b / h, e / h, 0, hh / h, 0, 0, 1, 0, c, f, 0, 1];
  return `matrix3d(${m.map((v) => +v.toFixed(8)).join(',')})`;
}

let os: BandOS | null = null;
export function installBandOS(): BandOS { return (os ??= new BandOS()); }
