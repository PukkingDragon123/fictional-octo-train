// The prologue: before the menu, the first time the game starts (and again
// from the replay entry, or ?prologue). You are the operator, arriving at the
// Meridian Institute's link suite; Dr. Iris Calder meets you in the corridor
// and teaches you as you go, in her own floating lines:
//   look    move the mouse (or drag on the right of the screen)
//   walk    WASD (or the left thumb) after her down the corridor
//   badge   pick your badge up off the trolley (E / click / tap it)
//   door    press the suite's call panel; the door slides open
//   unit    the unit in its chair: the prisoner in the hazmat suit, strapped
//           down. "We do not call them prisoners here."
//   sit     sit in the rig beside it (E at the chair): the cuffs close, the
//           crown comes down
//   shock   the handshake: a white flash, the body convulses, a burst of
//           static, black
//   wake    eyes open inside the unit, through its visor: your own body slumped
//           in the rig beside you, Calder leaning in
// then a title card, and the menu. Drawn on the intake's stage
// (src/game/introKit/stage.ts, the cold-fluorescent-and-amber 'wing' grade)
// in its own bare Game (no world): first person only, the operator's hand
// reaching for things through the eyes.
//
//   prologueWanted()   first launch (localStorage), ?prologue forces, ?noprologue skips
//   runPrologue()      play it here, then reload into the menu
//   replayPrologue()   from a menu: reload into it
import * as THREE from 'three';
import { Game, type GameSystem } from '../game';
import { G } from '../G';
import { AudioEngine } from '../../audio/audio';
import { fpClaim, fpRelease, fpCamera, fpGroup } from '../../fp/fp';
import { StageRender } from '../introKit/stage';
import { stageMat } from '../introKit/stageMat';
import { Subs } from '../introKit/subs';
import { skipPlate, pollPadSkip, type SkipPlate } from '../introKit/skip';
import { letterTimes, type ChipVoice } from '../../social/chipVoice';
import { LinkSet, LS } from './set';
import { calderRig } from './calder';
import { ReachArm } from './arm';
import type { Researcher } from '../../entities/researcher';
import '../intro.css';
import './prologue.css';

const KEY = 'noclip.prologue.seen';
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

export function runPrologue(): Promise<void> {
  return new Promise((resolve) => {
    const canvas = document.getElementById('view') as HTMLCanvasElement;
    const g = new Game(canvas);
    const audio = new AudioEngine();
    g.audio = audio;
    (window as unknown as { __game: Game }).__game = g;
    const p = new Prologue(g, () => {
      markSeen();
      resolve();
      // into the menu: a clean page (the title builds its own world)
      const u = new URL(location.href);
      u.searchParams.delete('prologue');
      setTimeout(() => location.replace(u.toString()), 60);
    });
    g.addSystem(p);
    if (import.meta.env.DEV) (window as unknown as { __prologue: Prologue }).__prologue = p;
    document.getElementById('boot')?.classList.add('gone');
    g.start();
  });
}

type Step = 'meet' | 'look' | 'walk' | 'badge' | 'door' | 'enter' | 'unit' | 'sit' | 'strap' | 'shock' | 'black' | 'wake' | 'left' | 'out' | 'done';
const DEG = Math.PI / 180;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const ease = (t: number) => { t = clamp01(t); return t * t * (3 - 2 * t); };
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3();

export class Prologue implements GameSystem {
  name = 'prologue';
  step: Step = 'meet';
  /** seconds in this step / in all */
  t = 0; T = 0;
  private stage: StageRender;
  private set: LinkSet;
  private calder: Researcher;
  private arm: ReachArm;
  private cam: THREE.PerspectiveCamera;
  // the operator
  private x = LS.start[0]; private z = LS.start[1];
  private yaw = 0; private pitch = -0.04; private bob = 0; private trauma = 0;
  private seatK = 0; private seatFrom = new THREE.Vector3(); private seatYaw = 0; private seatPitch = 0;
  private looked = 0;
  private touch: boolean;
  private stick = { id: -1, x: 0, y: 0, dx: 0, dy: 0 };
  private lookPtr = { id: -1, x: 0, y: 0, moved: 0, t: 0 };
  // Dr. Calder
  private cx = 0.3; private cz = 2.5; private cyaw = 0; private cgoal: [number, number] | null = null; private cspeed = 0;
  // her lines
  private q: { text: string; then?: () => void }[] = [];
  private lineT = -1; private lineDur = 0; private lineThen: (() => void) | undefined;
  private waitLines: (() => void) | null = null;
  // dom
  private root: HTMLDivElement; private shade: HTMLDivElement; private lidT: HTMLDivElement; private lidB: HTMLDivElement;
  private obj: HTMLDivElement; private lesson: HTMLDivElement; private dot: HTMLDivElement; private card: HTMLDivElement;
  private noise: HTMLCanvasElement; private visor: HTMLDivElement; private stickEl: HTMLDivElement;
  private subs: Subs; private plate: SkipPlate;
  private shadeA = 1; private shadeGoal = 0; private lid = 1; private lidGoal = 1; private noiseA = 0;
  private objText = ''; private objAt: THREE.Vector3 | null = null;
  private offs: (() => void)[] = [];
  private finished = false;
  private badgeHeld = 0;
  private badgeTaken = false; private panelPressed = false; private leftDone = false;
  private camSave: { fov: number; near: number; far: number };

  constructor(public g: Game, private onDone: () => void) {
    this.touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    // the stage owns the picture
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
    this.set = new LinkSet(root, low);
    this.calder = calderRig(stageMat({ rim: 1.15 }));
    this.calder.skin.castShadow = !low;
    root.add(this.calder.root);
    this.arm = new ReachArm(this.stage.scene, cam);
    this.stage.setLook('wingLit', 0.05);
    this.stage.bloom = 0.8; this.stage.streak = 0.35; this.stage.streakTint.setRGB(0.7, 0.85, 1);
    this.stage.rays = 0.3; this.stage.rayOn = true;
    this.stage.rack(3, 0.2);
    this.stage.nearBlur = 0.15;
    // dom
    const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string) => { const e = document.createElement(tag); e.className = cls; return e; };
    this.root = el('div', 'ix-root');
    this.noise = el('canvas', 'pl-static');
    this.visor = el('div', 'pl-visor');
    this.lidT = el('div', 'ix-lid top'); this.lidB = el('div', 'ix-lid bot');
    this.shade = el('div', 'ix-shade');
    this.obj = el('div', 'pl-obj'); this.lesson = el('div', 'pl-lesson'); this.dot = el('div', 'pl-dot'); this.card = el('div', 'pl-card');
    this.stickEl = el('div', 'pl-stick'); this.stickEl.innerHTML = '<i></i>';
    this.card.innerHTML = '<small>MERIDIAN INSTITUTE · OPERATOR INDUCTION</small><b>LIMBO PHOBIA</b>';
    this.plate = skipPlate(() => this.skip(), 'Skip prologue');
    this.plate.setKey(this.touch ? '' : 'Esc');
    const touchLayer = el('div', 'pl-touch');
    if (!this.touch) touchLayer.style.display = 'none';
    this.root.append(this.visor, this.lidT, this.lidB, this.noise, this.dot, this.obj, this.lesson, touchLayer, this.stickEl, this.card, this.shade, this.plate.el);
    this.plate.el.classList.add('on');
    this.plate.el.style.pointerEvents = 'auto';
    this.subs = new Subs(this.root);
    document.body.appendChild(this.root);
    this.hookInput(touchLayer);
    G.audio?.positionalLoop?.('pro_hum', 'hum_fluoro', 0, 0, 0.5, 1, 40);
    this.go('meet');
  }

  // ================================================================ input
  private hookInput(layer: HTMLDivElement) {
    const canvas = this.g.pr.renderer.domElement;
    const locked = () => document.pointerLockElement === canvas;
    const look = (dx: number, dy: number, k: number) => {
      if (!this.canLook()) return;
      this.yaw -= dx * k; this.pitch = Math.max(-1.2, Math.min(1.1, this.pitch - dy * k));
      this.looked += Math.abs(dx * k) + Math.abs(dy * k);
    };
    let drag = false;
    const down = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || (e.target as Node) !== canvas) return;
      if (!locked() && !this.finished) { try { void canvas.requestPointerLock?.(); } catch { /* not allowed */ } drag = true; }
      else if (e.button === 0) this.interact(null);
    };
    const move = (e: PointerEvent) => { if (e.pointerType === 'mouse' && (locked() || drag)) look(e.movementX, e.movementY, 0.0026); };
    const up = () => { drag = false; };
    window.addEventListener('pointerdown', down); window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    this.offs.push(() => { window.removeEventListener('pointerdown', down); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); if (locked()) document.exitPointerLock?.(); });
    // touch: the left half is a stick, the right half looks; a tap anywhere uses what it is on
    const tdown = (e: PointerEvent) => {
      e.preventDefault();
      if (e.clientX < innerWidth * 0.45 && this.stick.id < 0 && this.canWalk()) { this.stick = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, dy: 0 }; this.stickEl.style.left = e.clientX + 'px'; this.stickEl.style.top = e.clientY + 'px'; this.stickEl.classList.add('on'); }
      else if (this.lookPtr.id < 0) this.lookPtr = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0, t: performance.now() };
      layer.setPointerCapture?.(e.pointerId);
    };
    const tmove = (e: PointerEvent) => {
      if (e.pointerId === this.stick.id) {
        const dx = e.clientX - this.stick.x, dy = e.clientY - this.stick.y, l = Math.hypot(dx, dy), m = Math.min(1, l / 48);
        this.stick.dx = l ? dx / l * m : 0; this.stick.dy = l ? dy / l * m : 0;
        (this.stickEl.firstChild as HTMLElement).style.transform = `translate(${this.stick.dx * 32}px, ${this.stick.dy * 32}px)`;
      } else if (e.pointerId === this.lookPtr.id) {
        const dx = e.clientX - this.lookPtr.x, dy = e.clientY - this.lookPtr.y;
        this.lookPtr.x = e.clientX; this.lookPtr.y = e.clientY; this.lookPtr.moved += Math.abs(dx) + Math.abs(dy);
        look(dx, dy, 0.006);
      }
    };
    const tup = (e: PointerEvent) => {
      if (e.pointerId === this.stick.id) { this.stick.id = -1; this.stick.dx = this.stick.dy = 0; this.stickEl.classList.remove('on'); }
      else if (e.pointerId === this.lookPtr.id) {
        if (this.lookPtr.moved < 12 && performance.now() - this.lookPtr.t < 400) this.interact({ x: e.clientX, y: e.clientY });
        this.lookPtr.id = -1;
      }
    };
    layer.addEventListener('pointerdown', tdown); layer.addEventListener('pointermove', tmove); layer.addEventListener('pointerup', tup); layer.addEventListener('pointercancel', tup);
  }
  private canLook() { return !['shock', 'black', 'out', 'done'].includes(this.step); }
  private canWalk() { return ['look', 'walk', 'badge', 'door', 'enter', 'unit', 'meet'].includes(this.step) && this.seatK === 0; }

  /** E, a click while looking, a tap: use what the current lesson is about */
  private interact(tap: { x: number; y: number } | null) {
    const tg = this.target();
    if (!tg) return;
    const d = Math.hypot(tg.x - this.x, tg.z - this.z);
    if (d > (this.step === 'unit' ? 1.8 : 1.5)) return;
    if (tap) { const s = this.toScreen(tg); if (!s || Math.hypot(s.x - tap.x, s.y - tap.y) > 90) return; }
    else if (!this.aimed(tg)) return;
    if (this.step === 'badge' && !this.badgeTaken) { this.badgeTaken = true; this.arm.reach(LS.badge, 'pinch'); this.sfx('click', 0.4); }
    else if (this.step === 'door' && !this.panelPressed) { this.panelPressed = true; this.arm.reach(LS.panel, 'point'); }
    else if (this.step === 'unit') this.go('sit');
  }
  private target(): THREE.Vector3 | null {
    switch (this.step) {
      case 'badge': return this.badgeTaken ? null : LS.badge;
      case 'door': return this.panelPressed ? null : LS.panel;
      case 'unit': return v2.set(LS.rig[0], 0.95, LS.rig[1]);
      default: return null;
    }
  }
  private aimed(p: THREE.Vector3) {
    const cam = this.cam;
    const dir = v1.copy(p).sub(cam.position).normalize();
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    return dir.dot(fwd) > Math.cos(13 * DEG);
  }

  // ================================================================ the script
  private go(s: Step) {
    this.step = s; this.t = 0;
    const touch = this.touch;
    switch (s) {
      case 'meet':
        this.shadeGoal = 0; this.lidGoal = 0;
        this.cyaw = Math.PI;
        this.say(['Ah. You must be the new operator.', 'Dr. Iris Calder. I run the link programme here. Welcome to Meridian.'], () => this.go('look'));
        break;
      case 'look':
        this.lessonOn('LESSON 1 · LOOK', touch ? 'DRAG ON THE RIGHT' : 'MOVE THE MOUSE');
        this.looked = 0;
        this.say([touch ? 'First, look around. Drag your thumb on the right of the screen.' : 'First, look around. Move the mouse. Click once if it will not follow.']);
        break;
      case 'walk':
        this.lessonOn('LESSON 2 · WALK', touch ? 'LEFT THUMB TO WALK' : 'W A S D');
        this.cgoal = [LS.trolley[0] - 0.9, LS.trolley[1] - 0.9];
        this.say([touch ? 'Good. Now walk with me. Your left thumb.' : 'Good. Now walk with me. W, A, S and D.']);
        break;
      case 'badge':
        this.lessonOn('LESSON 3 · PICK UP', touch ? 'TAP THE BADGE' : 'LOOK AT IT · E OR CLICK');
        this.say(['Your badge is on the trolley. Pick it up. ' + (touch ? 'Tap it.' : 'Look at it and press E.')]);
        break;
      case 'door':
        this.lessonOn('LESSON 4 · USE', touch ? 'TAP THE PANEL' : 'E AT THE PANEL');
        this.cgoal = [-0.8, -4.7];
        this.say(['Clip it on. Good. The link suite is through here.', 'The panel by the door, please. Same as before.']);
        break;
      case 'enter':
        this.lessonOff();
        this.cgoal = [0.3, -7.6];
        this.say(['Come in. Mind the cables.']);
        break;
      case 'unit':
        this.cgoal = [2.2, -8.2];
        this.say([
          'This is the unit. Remittance Programme. It owes more than it will ever earn.',
          'We do not call them prisoners here. They are units. It helps, believe me.',
          'You will wear it. Its hands, its eyes. I will be on its wrist the whole time.',
          'Sit in the rig, on the right. That one is yours.',
        ], () => this.lessonOn('LESSON 5 · SIT', touch ? 'TAP THE RIG' : 'E AT THE RIGHT CHAIR'));
        break;
      case 'sit':
        this.lessonOff();
        this.seatFrom.set(this.x, 1.62, this.z); this.seatYaw = this.yaw; this.seatPitch = this.pitch;
        this.arm.reach(null);
        this.cgoal = [0.15, -8.35];
        this.sfx('cloth', 0.5);
        break;
      case 'strap':
        this.set.cuffGoal = 1; this.sfx('lock', 0.6);
        setTimeout(() => { this.set.crownGoal = 1; this.sfx('cy_thunk', 0.5); }, 900);
        this.set.mode = 'link';
        this.say(['Arms down on the rests. The cuffs are for you, not for it.', 'There will be a shock. Do not fight it. It only makes it worse.', 'Three. Two.'], () => this.go('shock'));
        break;
      case 'shock':
        this.set.mode = 'shock';
        this.stage.pulse(2.6, 0xdff4ff, 1.1); this.stage.impact(3.2);
        this.trauma = 1;
        this.noiseA = 1;
        this.sfx('band_shock', 0.9); this.sfx('cy_spark', 0.8); this.sfx('static_burst', 0.7);
        this.subs.clear();
        break;
      case 'black':
        this.shadeGoal = 1; this.noiseA = 0;
        this.sfx('heartbeat', 0.6);
        break;
      case 'wake': {
        this.shadeGoal = 0; this.lid = 1; this.lidGoal = 1; this.noiseA = 0;
        this.set.mode = 'up'; this.set.linkK = 1;
        this.set.operator.root.visible = true;
        // you are its eyes now: its own head out of the way
        (this.set.unit.bones as Record<string, THREE.Object3D>).head.scale.setScalar(0.001);
        this.x = LS.unitEye.x; this.z = LS.unitEye.z; this.yaw = Math.PI; this.pitch = -0.12;
        this.visor.classList.add('on');
        this.cx = -0.35; this.cz = -8.75; this.cgoal = [-0.55, -8.8];
        setTimeout(() => { this.lidGoal = 0; this.sfx('breath', 0.6); }, 600);
        this.say(['Hello. Can you hear me? Do not try to talk yet, the jaw takes a minute.', 'Look to your left.'], () => this.go('left'));
        break;
      }
      case 'left':
        this.lessonOn('LOOK LEFT', '');
        break;
      case 'out':
        this.lessonOff();
        this.setObj(null);
        this.shadeGoal = 1;
        setTimeout(() => this.card.classList.add('on'), 900);
        setTimeout(() => this.finish(), 4200);
        break;
    }
  }

  update(dt: number) {
    if (this.finished) return;
    this.t += dt; this.T += dt;
    const pad = pollPadSkip();
    if (pad === 'skip') this.skip();
    if (this.g.input.hit('pause')) this.skip();
    if (this.g.input.hit('interact')) this.interact(null);
    this.lines(dt);
    // ---- the lessons
    switch (this.step) {
      case 'look': if ((this.looked > 1.4 && this.t > 2) || this.t > 14) { this.sfx('watchTick', 0.4); this.go('walk'); } break;
      case 'walk': if (Math.hypot(this.x - LS.trolley[0], this.z - LS.trolley[1]) < 1.7) { this.sfx('watchTick', 0.4); this.go('badge'); } break;
      case 'badge':
        this.setObj('YOUR BADGE', LS.badge);
        if (this.badgeTaken && this.arm.k > 0.92 && !this.badgeHeld) { this.badgeHeld = 1; this.arm.arm.grip.add(this.set.badge); this.set.badge.position.set(0, 0, 0); this.set.badge.rotation.set(0.3, 0, 0); this.arm.reach(null); this.sfx('paper', 0.5); }
        if (this.badgeHeld) { this.badgeHeld += dt; if (this.badgeHeld > 1.0) { this.set.badge.visible = false; this.sfx('cloth', 0.4); this.go('door'); } }
        break;
      case 'door':
        this.setObj('CALL PANEL', LS.panel);
        if (this.panelPressed && this.arm.k > 0.9 && this.set.doorGoal === 0) { this.set.doorGoal = 1; this.arm.reach(null); this.sfx('switch', 0.6); setTimeout(() => this.sfx('door_open', 0.7), 250); }
        if (this.set.doorK > 0.6) { this.setObj(null); this.go('enter'); }
        break;
      case 'enter': if (this.z < -6.9) this.go('unit'); break;
      case 'unit': if (!this.q.length && this.lineT < 0) this.setObj('THE RIG', v1.set(LS.rig[0], 1.2, LS.rig[1])); break;
      case 'sit': {
        this.setObj(null);
        this.seatK = Math.min(1, this.seatK + dt / 1.6);
        if (this.seatK >= 1 && this.t > 1.7) this.go('strap');
        break;
      }
      case 'shock': {
        this.noiseA = this.t < 1.2 ? (Math.random() < 0.7 ? 1 : 0.4) : 0;
        if (this.t > 0.35 && this.t < 0.4) this.stage.pulse(1.8, 0xffffff, 2);
        if (this.t > 1.4) this.go('black');
        break;
      }
      case 'black': if (this.t > 1.6) this.go('wake'); break;
      case 'left': {
        if (this.leftDone) break;
        const op = v1.set(LS.rig[0], 1.0, LS.rig[1]);
        this.setObj(this.t > 1.5 ? 'YOU' : null, v2.set(LS.rig[0], 1.5, LS.rig[1]));
        if ((this.aimed(op) && this.t > 0.6) || this.t > 12) {
          this.leftDone = true;
          this.lessonOff(); this.setObj(null);
          this.say(['That is you. Do not worry, I will keep it warm.', 'This is the link. Down there, in Level 0, you are the unit, and I am on its wrist.', 'That was only the handshake. Let us go and pick you a unit properly.'], () => this.go('out'));
        }
        break;
      }
    }
    // ---- the operator
    this.walk(dt);
    this.updateCalder(dt);
    this.placeCamera(dt);
    this.arm.shown = !['shock', 'black', 'wake', 'left', 'out', 'strap'].includes(this.step) && this.seatK < 0.5;
    this.arm.update(dt, this.cam);
    this.set.update(dt, this.cam);
    if (this.set.mode === 'link') this.set.linkK = Math.min(0.92, this.set.linkK + dt * 0.12);
    this.stage.update(dt);
    this.stage.rayAt.copy(this.set.fx[this.z < -6 ? 'suite0' : 'tube1']?.at ?? v1.set(0, 2.6, 0));
    this.paint(dt);
  }

  private walk(dt: number) {
    if (!this.canWalk()) return;
    const inp = this.g.input;
    let mx = 0, my = 0;
    if (this.stick.id >= 0) { mx = this.stick.dx; my = -this.stick.dy; }
    else { const a = inp.moveAxis(); mx = a.x * a.mag; my = a.y * a.mag; }
    const sp = 1.7 * (inp.down('run') ? 1.6 : 1);
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw), rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    const dx = (fx * my + rx * mx) * sp * dt, dz = (fz * my + rz * mx) * sp * dt;
    if (this.free(this.x + dx, this.z)) this.x += dx;
    if (this.free(this.x, this.z + dz)) this.z += dz;
    const moving = Math.hypot(mx, my) > 0.1;
    if (moving) { this.bob += dt * 9; if (Math.sin(this.bob) > 0.95 && Math.sin(this.bob - dt * 9) <= 0.95) this.sfx('step_linoleum', 0.35); }
  }
  /** where the operator may stand */
  private free(x: number, z: number): boolean {
    const r = 0.25;
    const open = this.set.doorK > 0.5;
    const inCor = Math.abs(x) <= LS.cor.x1 - r && z <= LS.cor.z1 - r && z >= LS.cor.z0 + r;
    const inDoor = open && Math.abs(x) <= LS.door.x1 - r && z < LS.cor.z0 + r + 0.01 && z > LS.cor.z0 - r - 0.4;
    const inRoom = x >= LS.room.x0 + 0.75 && x <= LS.room.x1 - 0.95 && z <= LS.room.z1 - r && z >= LS.room.z0 + r;
    if (!inCor && !inDoor && !inRoom) return false;
    if (Math.hypot(x - LS.trolley[0], z - LS.trolley[1]) < 0.62) return false;
    for (const c of [LS.rig, LS.unit]) if (Math.hypot(x - c[0], z - c[1]) < 0.62) return false;
    if (Math.hypot(x - this.cx, z - this.cz) < 0.45) return false;
    return true;
  }

  private placeCamera(dt: number) {
    const cam = this.cam;
    this.trauma = Math.max(0, this.trauma - dt * 0.9);
    const tr = this.trauma * this.trauma;
    const shake = (s: number) => (Math.sin(this.T * 41 + s) + Math.sin(this.T * 27 + s * 2.3)) * 0.5 * tr;
    let x = this.x, y = 1.62 + Math.sin(this.bob) * 0.025, z = this.z;
    let yaw = this.yaw, pitch = this.pitch, roll = 0;
    if (this.seatK > 0 && !['wake', 'left', 'out'].includes(this.step)) {
      const k = ease(this.seatK);
      x = lerp(this.seatFrom.x, LS.rigEye.x, k); y = lerp(1.62, LS.rigEye.y, k); z = lerp(this.seatFrom.z, LS.rigEye.z, k);
      // seated: facing the door, a little head room to look about
      const base = Math.PI;
      if (k < 1) { yaw = lerp(this.seatYaw, this.seatYaw + wrap(base - this.seatYaw), k); pitch = lerp(this.seatPitch, -0.1, k); this.yaw = yaw; this.pitch = pitch; }
      else { this.yaw = base + Math.max(-1.1, Math.min(1.1, wrap(this.yaw - base))); this.pitch = Math.max(-0.6, Math.min(0.5, this.pitch)); yaw = this.yaw; pitch = this.pitch; }
    }
    if (['wake', 'left', 'out'].includes(this.step)) {
      x = LS.unitEye.x; y = LS.unitEye.y + Math.sin(this.T * 1.4) * 0.006; z = LS.unitEye.z;
      this.yaw = Math.PI + Math.max(-1.0, Math.min(1.65, wrap(this.yaw - Math.PI))); yaw = this.yaw;
      roll = Math.sin(this.T * 0.7) * 0.03;
    }
    // the shock: the body convulses (the head snaps back, rolls, the picture jolts)
    if (this.step === 'shock') { pitch += 0.35 * Math.sin(Math.min(1, this.t * 3) * Math.PI) + shake(1) * 0.25; roll += shake(2) * 0.4; yaw += shake(3) * 0.2; }
    // reaching for something: the body leans into it, so the hand gets there
    const lean = this.arm.goal > 0 ? ease(this.arm.k) : ease(this.arm.k) * 0.6;
    if (lean > 0.001 && this.seatK === 0) {
      const tx = this.arm.target.x - x, tz = this.arm.target.z - z, d = Math.hypot(tx, tz);
      const k = Math.max(0, Math.min(0.55, d - 0.45)) * lean;
      if (d > 1e-3) { x += tx / d * k; z += tz / d * k; y -= 0.12 * lean; }
    }
    cam.position.set(x + shake(4) * 0.02, y + shake(5) * 0.02, z);
    cam.rotation.set(0, 0, 0, 'YXZ');
    cam.rotation.order = 'YXZ';
    cam.rotation.y = yaw; cam.rotation.x = pitch; cam.rotation.z = roll;
    cam.updateMatrixWorld();
    // the focus sits on whatever is in the middle of the picture
    const reaching = this.arm.k > 0.05;
    this.stage.rack(reaching ? 0.55 : this.step === 'wake' || this.step === 'left' ? 1.4 : 2.6, reaching ? 0.05 : this.step === 'wake' ? 0.22 : 0.16, 3);
  }

  private updateCalder(dt: number) {
    const r = this.calder;
    let sp = 0;
    if (this.cgoal) {
      const dx = this.cgoal[0] - this.cx, dz = this.cgoal[1] - this.cz, d = Math.hypot(dx, dz);
      // she waits for you when you fall behind
      const lag = Math.hypot(this.x - this.cx, this.z - this.cz);
      const go = d > 0.05 && (lag < 3.2 || this.step === 'unit' || this.step === 'sit' || this.step === 'wake');
      if (go) { sp = Math.min(1.25, d * 2.2); this.cx += dx / d * sp * dt; this.cz += dz / d * sp * dt; this.cyaw += wrap(Math.atan2(dx, dz) - this.cyaw) * Math.min(1, dt * 6); }
      else if (d <= 0.05) this.cgoal = null;
    }
    this.cspeed += (sp - this.cspeed) * Math.min(1, dt * 8);
    if (sp < 0.2) { const want = Math.atan2(this.cam.position.x - this.cx, this.cam.position.z - this.cz); this.cyaw += wrap(want - this.cyaw) * Math.min(1, dt * 3); }
    r.root.position.set(this.cx, 0, this.cz);
    r.root.rotation.y = this.cyaw;
    r.lookAt(this.cam.position);
    r.update(dt, { speed: this.cspeed, stance: 'stand', fidget: true });
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
      const at = () => { const h = this.calder.j.head.getWorldPosition(v2); h.y += 0.38; return this.toScreen(h); };
      this.subs.show('DR. CALDER', l.text, { style: 'guard', shout: false, at, voice: CALDER_VOICE, hold: 1.2 });
      this.lineDur = letterTimes(l.text).dur + Math.max(0.9, Math.min(2.2, l.text.length * 0.03));
      this.lineT = 0; this.lineThen = l.then;
      this.calder.say(this.lineDur * 0.85);
      if (Math.random() < 0.35 && l.text.length > 40) this.calder.gesture('talk', { dur: 2.6 });
    }
    void this.waitLines;
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
    // a blink or two as the unit's eyes come round
    let lid = this.lid;
    if (this.step === 'wake' && this.t > 1.6 && this.t < 3.2) lid = Math.max(lid, Math.max(0, Math.sin((this.t - 1.6) * 7)) * 0.9);
    const lp = (lid * 50).toFixed(2) + '%';
    this.lidT.style.height = lp; this.lidB.style.height = lp;
    // the static
    this.noise.style.opacity = this.noiseA.toFixed(2);
    if (this.noiseA > 0.01) this.drawNoise();
    // the objective word over its target, the aim dot
    const tg = this.target();
    const hot = !!tg && this.aimed(tg) && Math.hypot(tg.x - this.x, tg.z - this.z) < (this.step === 'unit' ? 1.8 : 1.5);
    this.dot.classList.toggle('hot', hot);
    this.dot.style.display = this.touch || this.seatK > 0 ? 'none' : '';
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
    this.subs.clear(); this.q.length = 0; this.lineT = -1;
    G.audio?.flat?.('static_burst', 'sfx', 0.3);
    this.go('out');
  }
  private finish() {
    if (this.finished) return;
    this.finished = true;
    for (const f of this.offs.splice(0)) f();
    G.audio?.positionalLoop?.('pro_hum', null);
    fpRelease('prologue');
    const cam = this.cam; cam.fov = this.camSave.fov; cam.near = this.camSave.near; cam.far = this.camSave.far; cam.updateProjectionMatrix();
    this.onDone();
  }
}
