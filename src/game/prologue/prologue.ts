// The prologue: the first time the game starts (and again from the replay
// entry, or ?prologue). You are the operator, already strapped into the link
// rig in Suite 4 of the Meridian Institute. You never meet Dr. Iris Calder:
// she is a voice on the suite's intercom (the plate under her subtitles,
// src/game/loop/plate.ts, its tube swinging with her syllables), up in the
// control room behind the glass. She talks you through it:
//   open     her voice comes on; the suite fades up around the chair
//   look     move the mouse (or drag): the unit in the chair on your right,
//            strapped down in its hazmat suit. "That is your unit."
//   consent  E (a click, a tap) begins the link: your own hand on it
//   strap    the cuffs close, the crown comes down. "Three. Two."
//   shock    the handshake: a white flash, the body convulses, static
//   black    a heartbeat in the dark
// and then the unit wakes in Level 0: the page reloads into a fresh contract
// run (src/game/launch.ts) whose intro starts at its wake (src/game/intro.ts
// reads 'noclip.intro.from'), and Calder walks you through the first job by
// voice while you walk the unit. Short, and skippable at any moment (Esc,
// the plate, a pad's Start): a skip goes straight to the wake.
//
//   prologueWanted()   first launch (localStorage), ?prologue forces, ?noprologue skips
//   runPrologue()      play it here, then reload into the run
//   replayPrologue()   from a menu: reload into it
import * as THREE from 'three';
import { Game, type GameSystem } from '../game';
import { G } from '../G';
import { AudioEngine } from '../../audio/audio';
import { fpClaim, fpRelease, fpCamera, fpGroup } from '../../fp/fp';
import { StageRender } from '../introKit/stage';
import { Subs } from '../introKit/subs';
import { skipPlate, pollPadSkip, type SkipPlate } from '../introKit/skip';
import { letterTimes, type ChipVoice } from '../../social/chipVoice';
import { randomAppearance, type Appearance } from '../../entities/humanRig';
import { Intercom } from '../loop/plate';
import { LinkSet, LS } from './set';
import '../intro.css';
import './prologue.css';

const KEY = 'noclip.prologue.seen';
/** where the run's intro picks up after the prologue (src/game/intro.ts) */
export const INTRO_FROM_KEY = 'noclip.intro.from';
export const CALDER_VOICE: ChipVoice = { base: 205, wave: 'pulse', duty: 0.3, wobble: 0.06, range: 3.4, bits: 4, vol: 0.85, grain: 'vg_fstd' } as ChipVoice;

export function prologueWanted(): boolean {
  const q = new URLSearchParams(location.search);
  if (q.has('prologue')) return q.get('prologue') !== '0';
  if (q.has('noprologue') || q.has('quick') || q.has('gallery') || q.has('sandbox') || q.has('surgery')) return false;
  if (navigator.webdriver && !q.has('prologue')) return false;
  try { return !localStorage.getItem(KEY); } catch { return false; }
}
/** from a menu: back to the start of the prologue */
export function replayPrologue() {
  const u = new URL(location.href);
  u.searchParams.set('prologue', '1');
  location.href = u.toString();
}
function markSeen() { try { localStorage.setItem(KEY, '1'); } catch { /* private mode */ } }

const FIRST = ['Robin', 'Sam', 'Alex', 'Jordan', 'Casey', 'Morgan', 'Riley', 'Quinn', 'Noor', 'Emil', 'Ines', 'Tomas', 'Aiko', 'Mara', 'Felix', 'Rosa', 'Theo', 'Wren', 'Priya', 'Kofi', 'Elena', 'Otis', 'Hana', 'Cyril'];
const LAST = ['Okonkwo', 'Varga', 'Lindqvist', 'Moreau', 'Halloran', 'Petrov', 'Nakamura', 'Silva', 'Brennan', 'Kowalski', 'Haugen', 'Duarte', 'Novak', 'Reyes', 'Lund', 'Ashdown', 'Pell', 'Osei', 'Whitlock', 'Doyle'];
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

export function runPrologue(): Promise<void> {
  return new Promise((resolve) => {
    const canvas = document.getElementById('view') as HTMLCanvasElement;
    const g = new Game(canvas);
    const audio = new AudioEngine();
    g.audio = audio;
    (window as unknown as { __game: Game }).__game = g;
    // the unit in the chair is the body you will wake in
    const app = randomAppearance(Math.random);
    const p = new Prologue(g, app, () => {
      markSeen();
      resolve();
      // into Level 0: a fresh contract run whose intro starts at the wake
      const u = new URL(location.href);
      u.searchParams.delete('prologue');
      try { history.replaceState(null, '', u.toString()); } catch { /* sandboxed */ }
      try { sessionStorage.setItem(INTRO_FROM_KEY, 'wake'); } catch { /* blocked: the run plays its own handshake */ }
      import('../launch').then((L) => L.setLaunch({
        mode: 'new', name: `${pick(FIRST)} ${pick(LAST)}`, app, occupation: 'unemployed', traits: [],
        sandbox: {}, seed: Math.floor(Math.random() * 1e9), directives: true,
      })).catch(() => location.replace(u.toString()));
    });
    g.addSystem(p);
    if (import.meta.env.DEV) (window as unknown as { __prologue: Prologue }).__prologue = p;
    document.getElementById('boot')?.classList.add('gone');
    g.start();
  });
}

type Step = 'open' | 'look' | 'unit' | 'consent' | 'strap' | 'shock' | 'black' | 'out' | 'done';
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
/** seated, facing the door (+z): the unit's chair is on the right (yaw down), the console on the left */
const REST_YAW = Math.PI - 0.5, YAW_MIN = Math.PI - 1.8, YAW_MAX = Math.PI + 1.0;

export class Prologue implements GameSystem {
  name = 'prologue';
  step: Step = 'open';
  /** seconds in this step / in all */
  t = 0; T = 0;
  private stage: StageRender;
  private set: LinkSet;
  private cam: THREE.PerspectiveCamera;
  // the operator, strapped in
  private yaw = REST_YAW; private pitch = -0.1; private trauma = 0;
  private aimYaw = REST_YAW; private aimPitch = -0.1;
  private looked = 0;
  private mouseSeen = false;
  private touch: boolean;
  private lookPtr = { id: -1, x: 0, y: 0, moved: 0, t: 0 };
  // her lines (a voice: the intercom and the subtitle strip, nobody in the room)
  private q: { text: string; then?: () => void }[] = [];
  private lineT = -1; private lineDur = 0; private lineThen: (() => void) | undefined;
  // dom
  private root: HTMLDivElement; private shade: HTMLDivElement; private lidT: HTMLDivElement; private lidB: HTMLDivElement;
  private obj: HTMLDivElement; private lesson: HTMLDivElement; private dot: HTMLDivElement;
  private noise: HTMLCanvasElement;
  private subs: Subs; private plate: SkipPlate; private icom: Intercom;
  private shadeA = 1; private shadeGoal = 0; private lid = 0; private lidGoal = 0; private noiseA = 0;
  private objText = ''; private objAt: THREE.Vector3 | null = null;
  private offs: (() => void)[] = [];
  private finished = false;
  private consented = false;
  private camSave: { fov: number; near: number; far: number };

  constructor(public g: Game, app: Appearance, private onDone: () => void) {
    this.touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    fpGroup('prologue');
    fpClaim('prologue', 100, { cinematic: 'none', stage: true });
    const cam = this.cam = fpCamera();
    this.camSave = { fov: cam.fov, near: cam.near, far: cam.far };
    cam.fov = 64; cam.near = 0.03; cam.far = 60; cam.updateProjectionMatrix();
    g.pr.scene.visible = false;
    this.stage = new StageRender(g.pr, cam);
    const root = new THREE.Group(); root.name = 'prologue:set';
    this.stage.scene.add(root);
    const low = (g.pr as unknown as { quality?: string }).quality === 'low';
    this.stage.low = low;
    this.set = new LinkSet(root, low, app);
    this.set.badge.visible = false;
    this.set.doorK = this.set.doorGoal = 0;
    this.stage.setLook('wingLit', 0.05);
    this.stage.bloom = 0.8; this.stage.streak = 0.35; this.stage.streakTint.setRGB(0.7, 0.85, 1);
    this.stage.rays = 0.3; this.stage.rayOn = true;
    this.stage.rack(2, 0.18);
    this.stage.nearBlur = 0.15;
    // dom
    const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string) => { const e = document.createElement(tag); e.className = cls; return e; };
    this.root = el('div', 'ix-root');
    this.noise = el('canvas', 'pl-static');
    this.lidT = el('div', 'ix-lid top'); this.lidB = el('div', 'ix-lid bot');
    this.shade = el('div', 'ix-shade');
    this.obj = el('div', 'pl-obj'); this.lesson = el('div', 'pl-lesson'); this.dot = el('div', 'pl-dot');
    this.plate = skipPlate(() => this.skip(), 'Skip to Level 0');
    this.plate.setKey(this.touch ? '' : 'Esc');
    const touchLayer = el('div', 'pl-touch');
    if (!this.touch) touchLayer.style.display = 'none';
    this.root.append(this.lidT, this.lidB, this.noise, this.dot, this.obj, this.lesson, touchLayer, this.shade, this.plate.el);
    this.plate.el.classList.add('on');
    this.plate.el.style.pointerEvents = 'auto';
    this.subs = new Subs(this.root);
    this.icom = new Intercom(this.root);
    document.body.appendChild(this.root);
    this.hookInput(touchLayer);
    G.audio?.positionalLoop?.('pro_hum', 'hum_fluoro', 0, 0, 0.5, 1, 40);
    this.go('open');
  }

  // ================================================================ input
  private hookInput(layer: HTMLDivElement) {
    const canvas = this.g.pr.renderer.domElement;
    const locked = () => document.pointerLockElement === canvas;
    const look = (dx: number, dy: number, k: number) => {
      if (!this.canLook()) return;
      this.aimYaw -= dx * k; this.aimPitch -= dy * k;
      this.looked += Math.abs(dx * k) + Math.abs(dy * k);
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || (e.target as Node) !== canvas) return;
      if (this.step === 'consent') { this.consent(); return; }
      if (!locked() && !this.finished) { try { void canvas.requestPointerLock?.(); } catch { /* not allowed */ } }
    };
    // unlocked, the head follows the cursor (no click needed); locked, the mouse turns it
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      if (locked()) { look(e.movementX, e.movementY, 0.0026); return; }
      if (!this.canLook()) return;
      const mx = (e.clientX / innerWidth) * 2 - 1, my = (e.clientY / innerHeight) * 2 - 1;
      const y0 = this.aimYaw, p0 = this.aimPitch;
      this.aimYaw = REST_YAW - mx * 1.3; this.aimPitch = -0.1 - my * 0.45;
      if (this.mouseSeen) this.looked += Math.abs(this.aimYaw - y0) + Math.abs(this.aimPitch - p0);
      this.mouseSeen = true;
    };
    window.addEventListener('pointerdown', down); window.addEventListener('pointermove', move);
    this.offs.push(() => { window.removeEventListener('pointerdown', down); window.removeEventListener('pointermove', move); if (locked()) document.exitPointerLock?.(); });
    // touch: drag looks, a tap uses
    const tdown = (e: PointerEvent) => {
      e.preventDefault();
      if (this.lookPtr.id < 0) this.lookPtr = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0, t: performance.now() };
      layer.setPointerCapture?.(e.pointerId);
    };
    const tmove = (e: PointerEvent) => {
      if (e.pointerId !== this.lookPtr.id) return;
      const dx = e.clientX - this.lookPtr.x, dy = e.clientY - this.lookPtr.y;
      this.lookPtr.x = e.clientX; this.lookPtr.y = e.clientY; this.lookPtr.moved += Math.abs(dx) + Math.abs(dy);
      look(dx, dy, 0.006);
    };
    const tup = (e: PointerEvent) => {
      if (e.pointerId !== this.lookPtr.id) return;
      if (this.lookPtr.moved < 12 && performance.now() - this.lookPtr.t < 400 && this.step === 'consent') this.consent();
      this.lookPtr.id = -1;
    };
    layer.addEventListener('pointerdown', tdown); layer.addEventListener('pointermove', tmove); layer.addEventListener('pointerup', tup); layer.addEventListener('pointercancel', tup);
  }
  private canLook() { return !['shock', 'black', 'out', 'done'].includes(this.step); }

  /** your own hand on it: the link begins */
  private consent() {
    if (this.step !== 'consent' || this.consented) return;
    this.consented = true;
    this.sfx('switch', 0.6);
    this.go('strap');
  }
  private aimed(p: THREE.Vector3, deg = 14) {
    const cam = this.cam;
    const dir = v1.copy(p).sub(cam.position).normalize();
    const fwd = v2.set(0, 0, -1).applyQuaternion(cam.quaternion);
    return dir.dot(fwd) > Math.cos(deg * Math.PI / 180);
  }

  // ================================================================ the script
  private go(s: Step) {
    this.step = s; this.t = 0;
    const touch = this.touch;
    switch (s) {
      case 'open':
        this.shadeGoal = 0; this.lidGoal = 0;
        this.say(['Operator. Can you hear me? Good. Do not get up, you are strapped in.', 'This is Dr. Iris Calder, in the control room upstairs. You will only ever hear me. Here on the intercom, down there on the unit\'s band.'], () => this.go('look'));
        break;
      case 'look':
        this.lessonOn('LOOK AROUND', touch ? 'DRAG ON THE SCREEN' : 'MOVE THE MOUSE');
        this.looked = 0;
        this.say(['The chair beside you, on your right. Look at it.']);
        break;
      case 'consent':
        this.lessonOn('BEGIN THE LINK', touch ? 'TAP THE SCREEN' : 'PRESS E · OR CLICK');
        this.setObj(null);
        this.say([touch ? 'When you are ready, tap. There will be a shock. Do not fight it.' : 'When you are ready, press E. There will be a shock. Do not fight it.']);
        break;
      case 'strap':
        this.lessonOff();
        this.set.cuffGoal = 1; this.sfx('lock', 0.6);
        setTimeout(() => { if (!this.finished) { this.set.crownGoal = 1; this.sfx('cy_thunk', 0.5); } }, 700);
        this.set.mode = 'link';
        this.say(['Arms on the rests. The cuffs are for you, not for it.', 'Three. Two.'], () => this.go('shock'));
        break;
      case 'shock':
        this.set.mode = 'shock';
        this.stage.pulse(2.6, 0xdff4ff, 1.1); this.stage.impact(3.2);
        this.trauma = 1;
        this.noiseA = 1;
        this.sfx('band_shock', 0.9); this.sfx('cy_spark', 0.8); this.sfx('static_burst', 0.7);
        this.subs.clear(); this.icom.quiet();
        break;
      case 'black':
        this.shadeGoal = 1; this.noiseA = 0;
        this.icom.show(false);
        this.sfx('heartbeat', 0.6);
        break;
      case 'out':
        this.lessonOff();
        this.setObj(null);
        this.shadeGoal = 1;
        this.icom.show(false);
        setTimeout(() => this.finish(), 700);
        break;
    }
  }

  update(dt: number) {
    if (this.finished) return;
    this.t += dt; this.T += dt;
    const pad = pollPadSkip();
    if (pad === 'skip') this.skip();
    if (this.g.input.hit('pause')) this.skip();
    if (this.g.input.hit('interact')) this.consent();
    this.lines(dt);
    switch (this.step) {
      case 'look': {
        const unitHead = v1.set(LS.unit[0], 1.15, LS.unit[1]);
        this.setObj(this.t > 1.2 ? 'YOUR UNIT' : null, v2.set(LS.unit[0], 1.62, LS.unit[1]));
        if ((this.aimed(unitHead.clone(), 16) && this.t > 0.8) || this.t > 14) {
          this.sfx('watchTick', 0.4);
          this.lessonOff(); this.setObj(null);
          // (the lesson waits until her lines are out)
          this.step = 'unit'; this.t = 0;
          this.say([
            'That is your unit. Remittance Programme. It owes more than it will ever earn.',
            'You will wear it: its hands, its eyes. Down in Level 0 it pays its debt in furniture, carried whole to the press. I will tell you each step.',
          ], () => this.go('consent'));
        }
        break;
      }
      case 'consent': if (!this.consented && this.t > 40 && !this.q.length && this.lineT < 0) this.consent(); break;
      case 'shock': {
        this.noiseA = this.t < 1.2 ? (Math.random() < 0.7 ? 1 : 0.4) : 0;
        if (this.t > 0.35 && this.t < 0.4) this.stage.pulse(1.8, 0xffffff, 2);
        if (this.t > 1.4) this.go('black');
        break;
      }
      case 'black': if (this.t > 1.3) this.finish(); break;
    }
    this.placeCamera(dt);
    this.set.update(dt, this.cam);
    if (this.set.mode === 'link') this.set.linkK = Math.min(0.92, this.set.linkK + dt * 0.18);
    this.stage.update(dt);
    this.stage.rayAt.copy(this.set.fx.suite0?.at ?? v1.set(0, 2.6, -9));
    this.paint(dt);
  }

  private placeCamera(dt: number) {
    const cam = this.cam;
    this.trauma = Math.max(0, this.trauma - dt * 0.9);
    const tr = this.trauma * this.trauma;
    const shake = (s: number) => (Math.sin(this.T * 41 + s) + Math.sin(this.T * 27 + s * 2.3)) * 0.5 * tr;
    // the head turns toward where you look (a little lag: a neck, not a mouse)
    this.aimYaw = Math.max(YAW_MIN, Math.min(YAW_MAX, this.aimYaw)); this.aimPitch = Math.max(-0.6, Math.min(0.45, this.aimPitch));
    const k = 1 - Math.exp(-dt * 9);
    this.yaw += wrap(this.aimYaw - this.yaw) * k; this.pitch += (this.aimPitch - this.pitch) * k;
    let yaw = this.yaw, pitch = this.pitch, roll = Math.sin(this.T * 0.6) * 0.006;
    // the crown coming down presses the head a little
    pitch -= this.set.crownK * 0.05;
    if (this.step === 'shock') { pitch += 0.35 * Math.sin(Math.min(1, this.t * 3) * Math.PI) + shake(1) * 0.25; roll += shake(2) * 0.4; yaw += shake(3) * 0.2; }
    cam.position.set(LS.rigEye.x + shake(4) * 0.02, LS.rigEye.y + Math.sin(this.T * 1.5) * 0.004 + shake(5) * 0.02, LS.rigEye.z);
    cam.rotation.order = 'YXZ';
    cam.rotation.set(pitch, yaw, roll);
    cam.updateMatrixWorld();
    // the focus sits on whatever is in the middle of the picture: the unit close, the door far
    const onUnit = this.aimed(v1.set(LS.unit[0], 1.1, LS.unit[1]), 25);
    this.stage.rack(onUnit ? 1.9 : 3.2, 0.16, 3);
  }

  // ---------------------------------------------------------------- her lines
  private say(lines: string[], then?: () => void) {
    lines.forEach((text, i) => this.q.push({ text, then: i === lines.length - 1 ? then : undefined }));
  }
  private lines(dt: number) {
    if (this.lineT >= 0) {
      this.lineT += dt;
      if (this.lineT >= this.lineDur) { this.lineT = -1; const f = this.lineThen; this.lineThen = undefined; f?.(); }
    }
    if (this.lineT < 0 && this.q.length) {
      const l = this.q.shift()!;
      this.subs.show('DR. CALDER · INTERCOM', l.text, { style: 'guard', shout: false, voice: CALDER_VOICE, hold: 1.2 });
      this.lineDur = letterTimes(l.text).dur + Math.max(0.9, Math.min(2.2, l.text.length * 0.03));
      this.lineT = 0; this.lineThen = l.then;
      this.icom.talk(l.text, letterTimes(l.text).dur);
      this.sfx('radio_on', 0.3);
    }
  }

  // ---------------------------------------------------------------- dom
  private toScreen(p: THREE.Vector3): { x: number; y: number } | null {
    const v = v1.copy(p).project(this.cam);
    if (v.z > 1 || v.z < -1 || Math.abs(v.x) > 1.2 || Math.abs(v.y) > 1.2) return null;
    return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (0.5 - v.y * 0.5) * innerHeight };
  }
  private lessonOn(small: string, big: string) { this.lesson.innerHTML = `<small>${small}</small>${big ? `<b>${big}</b>` : ''}`; this.lesson.classList.add('on'); }
  private lessonOff() { this.lesson.classList.remove('on'); }
  private setObj(text: string | null, at?: THREE.Vector3) {
    this.objAt = text && at ? at.clone() : null;
    if ((text ?? '') !== this.objText) { this.objText = text ?? ''; this.obj.innerHTML = text ? `<b>${text}</b><span class="arrow">v</span>` : ''; this.obj.classList.toggle('on', !!text); }
  }
  private paint(dt: number) {
    this.subs.update(dt);
    this.shadeA += ((this.shadeGoal) - this.shadeA) * Math.min(1, dt * (this.shadeGoal > this.shadeA ? 4 : 1.2));
    this.shade.style.opacity = this.shadeA.toFixed(3);
    this.lid += (this.lidGoal - this.lid) * Math.min(1, dt * (this.lidGoal > this.lid ? 10 : 1.6));
    const lp = (this.lid * 50).toFixed(2) + '%';
    this.lidT.style.height = lp; this.lidB.style.height = lp;
    this.noise.style.opacity = this.noiseA.toFixed(2);
    if (this.noiseA > 0.01) this.drawNoise();
    // the aim dot lights on the unit while the lesson asks for it
    const hot = (this.step === 'look' || this.step === 'unit') && this.aimed(v1.set(LS.unit[0], 1.15, LS.unit[1]), 16);
    this.dot.classList.toggle('hot', hot);
    this.dot.style.display = this.touch || !['look', 'unit', 'consent'].includes(this.step) ? 'none' : '';
    if (this.objAt) {
      const s = this.toScreen(this.objAt);
      if (s) { this.obj.style.left = s.x.toFixed(0) + 'px'; this.obj.style.top = (s.y - 8).toFixed(0) + 'px'; this.obj.style.visibility = ''; }
      else this.obj.style.visibility = 'hidden';
    }
  }
  private drawNoise() {
    const c = this.noise, x = c.getContext('2d')!;
    const W = Math.ceil(innerWidth / 4), H = Math.ceil(innerHeight / 4);
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    const img = x.createImageData(W, H), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const v = Math.random() * 255; d[i] = v; d[i + 1] = v; d[i + 2] = Math.min(255, v + 20); d[i + 3] = 255; }
    x.putImageData(img, 0, 0);
  }
  private sfx(key: string, vol = 0.5) { G.audio?.flat?.(key, 'sfx', vol); }

  // ================================================================ the end
  skip() {
    if (this.step === 'out' || this.finished) return;
    this.subs.clear(); this.q.length = 0; this.lineT = -1; this.icom.quiet();
    G.audio?.flat?.('static_burst', 'sfx', 0.3);
    this.go('out');
  }
  /** dev: jump to a step and advance a few seconds (screenshots on a slow software renderer) */
  debugJump(step: Step, secs = 0) {
    this.q.length = 0; this.lineT = -1; this.subs.clear();
    this.shadeA = this.shadeGoal = 0; this.lid = this.lidGoal = 0;
    if (step === 'consent' || step === 'strap') { this.aimYaw = REST_YAW - 0.5; }
    this.go(step);
    for (let i = 0; i < Math.ceil(secs / 0.05); i++) this.update(0.05);
  }

  private finish() {
    if (this.finished) return;
    this.finished = true;
    this.step = 'done';
    for (const f of this.offs.splice(0)) f();
    G.audio?.positionalLoop?.('pro_hum', null);
    fpRelease('prologue');
    const cam = this.cam; cam.fov = this.camSave.fov; cam.near = this.camSave.near; cam.far = this.camSave.far; cam.updateProjectionMatrix();
    this.shade.style.opacity = '1';
    this.onDone();
  }
}
void clamp01;
