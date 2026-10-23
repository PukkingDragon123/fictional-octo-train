// The arrival: from the taped wall of the processing wing to the Lobby, where
// Staff Sergeant Voss hands the debtor a bag and a job and signs off. The
// intake (src/game/intro.ts) ends by calling playArrival(g, p).
//
//   wall   first person, its own cinematic picture (src/game/arrivalKit/cine.ts:
//          bloom, lens warp, zoom blur; cutscenes may): the debtor's own right
//          arm comes up trembling and reaches for the black; the jelly rises to
//          meet the fingers (arrivalKit/jelly.ts: a faceted sheet with a
//          vertex-shader wobble, rings from the touch, a viscous funnel that
//          clings round the wrist, glints and a refracted caustic glow), the
//          arm sinks in to the shoulder, then it takes him: the surface swells
//          over the face, the lens pulls, and a short gelatinous dark
//   lobby  crisp again (the world's own pixel picture, nothing blurred), input
//          locked, letterboxed. Iso shots (the camera framed, pushed in,
//          orbited) cut with first-person shots (a camera at the eyes):
//          spat out of the Lobby's Seam onto the floor; eyes open on the floor
//          and he gets up; the band flickers and the beam comes out of it; a
//          slow push in on Voss as he materialises from the floor up; Voss
//          talks (bus 'subtitle' lines, boxless Pixelify Sans); a hatch in the
//          ceiling drops open and a pneumatic chute hisses down
//          (arrivalKit/chute.ts) and drops the Meridian-issue pack at his
//          feet (arrivalKit/packModel.ts); he kneels, picks it up in first
//          person and shoulders it (the item 'iron_cube' goes on); the
//          mission uploads to the watch (the watch's own close-up, the quest
//          system's First Haul, flag 'contract:intake'); Voss signs off and
//          the projection collapses like a tube switching off; the Seam
//          seals; control comes back.
// A skip plate (the intake's: Esc, a tap on it after a tap wakes it, gamepad
// Start / Back / B) jumps to the end state: in the Lobby, standing, the pack
// on, the contract running, Voss gone, the Seam shut.
//
//   playArrival(g, p, { from? })  -> Promise<void>, resolves when the player has control
//   arrivalRunning()               is one playing
import * as THREE from 'three';
import { G } from './G';
import type { Game, GameSystem } from './game';
import type { Player } from '../entities/player';
import type { Action } from '../core/input';
import type { TileObject, Zone } from '../world/zone';
import type { Item } from '../items/item';
import type { Pose } from '../entities/humanRig';
import { bus } from '../core/events';
import { seamFaceOf } from '../world/gen/seam_kit';
import { WALL_H } from '../world/defs';
import { fpArmsFor, type FpArm } from '../fp/hands';
import { fpClaim, fpRelease, fpGroup, fpCamera, fpOwner } from '../fp/fp';
import { animSupported, fallbackPose, overlay } from './cutPose';
import { skipPlate, pollPadSkip, padConnected, type SkipPlate } from './introKit/skip';
import { readTime } from './lines';
import type { SeamFx } from './seam';
import { debtorNumber } from './handler';
import { CinePass } from './arrivalKit/cine';
import { makeJelly, JW, JH, type Jelly } from './arrivalKit/jelly';
import { buildWallSet, LAMP_POS, type WallSet } from './arrivalKit/wallSet';
import { Chute } from './arrivalKit/chute';
import { packWorldMesh, packOverlayGroup, disposeGroup } from './arrivalKit/packModel';
import { takePack, givePack, ensurePack, absorbStray } from './arrivalKit/pack';
import './arrivalKit/sounds';
import './intro.css';

export interface ArrivalOpts { from?: 'intro' | 'dev' }

const DEG = Math.PI / 180;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const ease = (t: number) => { t = clamp01(t); return t * t * (3 - 2 * t); };
const easeIn = (t: number) => { t = clamp01(t); return t * t * t; };
const easeOut = (t: number) => { t = clamp01(t); return 1 - (1 - t) * (1 - t) * (1 - t); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), v4 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const mtx = new THREE.Matrix4();
/** the right shoulder in the camera's own space (hands.ts puts the upper arm's root there) */
const SHOULDER_R = new THREE.Vector3(0.17, -0.25, -0.2);
const UPPER = 0.3, FORE = 0.26;

let running: Arrival | null = null;
export function arrivalRunning(): boolean { return !!running; }

/** play the arrival; resolves when the survivor is in the Lobby with control back */
export async function playArrival(g: Game, p: Player, opts: ArrivalOpts = {}): Promise<void> {
  if (running) return running.done;
  try { await Promise.race([document.fonts?.ready ?? Promise.resolve(), new Promise((r) => setTimeout(r, 1500))]); } catch { /* no fonts api */ }
  const a = new Arrival(g, p, opts);
  running = a;
  try { await a.done; } finally { running = null; }
}

// ------------------------------------------------------------------ dom
let cssDone = false;
function css() {
  if (cssDone) return;
  cssDone = true;
  const st = document.createElement('style');
  st.textContent = `
.arv-root { position: fixed; inset: 0; pointer-events: none; z-index: 182; overflow: hidden; }
.arv-shade { position: absolute; inset: 0; background: #000; opacity: 1; }
.arv-bar { position: absolute; left: 0; right: 0; height: 0; background: #000; }
.arv-bar.top { top: 0; } .arv-bar.bot { bottom: 0; }
.arv-lid { position: absolute; left: -5%; right: -5%; height: 0; background: #000; }
.arv-lid.top { top: 0; border-radius: 0 0 50% 50% / 0 0 22% 22%; box-shadow: 0 8px 14px 4px #000; }
.arv-lid.bot { bottom: 0; border-radius: 50% 50% 0 0 / 22% 22% 0 0; box-shadow: 0 -8px 14px 4px #000; }
.arv-root .ix-plate { z-index: 3; }
`;
  document.head.appendChild(st);
}

// ------------------------------------------------------------------ poses of our own (the survivor in the Lobby)
const P = (o: Record<string, unknown>) => o as unknown as Pose;
function ownPose(name: string, u: number, t: number): Pose | null {
  switch (name) {
    case 'kneel_reach': {
      const a = ease(u / 0.3);
      return P({
        rootY: -0.5 * a, bodyPitch: 0.2 * a, spine: [0.5 * a, 0, 0], chest: [0.25 * a, 0, 0], head: [0.35 * a, 0, 0],
        thighL: [-1.55 * a, 0, 0.06], shinL: [1.6 * a, 0, 0], thighR: [-0.35 * a, 0, -0.06], shinR: [1.95 * a, 0, 0], footR: [0.7 * a, 0, 0],
        uarmL: [-1.0 * a, 0, 0.15], farmL: [-0.35 * a, 0, 0], uarmR: [-1.0 * a, 0, -0.15], farmR: [-0.35 * a, 0, 0], gripL: 0.6, gripR: 0.6,
      });
    }
    case 'wrist_look': {
      const a = ease(u / 0.2) * (1 - ease((u - 0.85) / 0.15));
      return P({ uarmL: [-0.9 * a, 0.5 * a, 0.1], farmL: [-1.5 * a, -0.6 * a, 0], handL: [0.2, 0, 0], head: [0.4 * a, 0.25 * a, 0], chest: [0.08 * a, 0.12 * a, 0] });
    }
    case 'sway': {
      const s = Math.sin(t * 1.3);
      return P({ spine: [0.12 + s * 0.04, 0, s * 0.04], head: [0.15, s * 0.1, 0], uarmL: [0.1, 0, 0.12], uarmR: [0.1, 0, -0.12] });
    }
  }
  return null;
}

// ------------------------------------------------------------------ script plumbing
type Wait = (dt: number) => boolean;
type Script = Generator<Wait, void, unknown>;
const secs = (s: number): Wait => { let t = 0; return (dt) => (t += dt) >= s; };
const until = (f: () => boolean, max = 30): Wait => { let t = 0; return (dt) => f() || (t += dt) >= max; };

interface Tween { t: number; dur: number; f: (k: number) => void; done?: () => void }

class Arrival implements GameSystem {
  name = 'arrival';
  done: Promise<void>;
  private resolve!: () => void;
  phase: 'wall' | 'lobby' | 'end' | 'done' = 'wall';
  /** seconds in the phase / since the start */
  t = 0; T = 0;
  /** dev: freeze the scene's clock (screenshots) / play faster */
  hold = false; speed = 1;
  private script: Script | null = null;
  private wait: Wait | null = null;
  private tweens: Tween[] = [];
  private offs: (() => void)[] = [];
  private fired = new Set<number>();
  // dom
  private root!: HTMLDivElement; private shade!: HTMLDivElement; private bars!: HTMLDivElement[]; private lids!: HTMLDivElement[];
  private plate!: SkipPlate;
  private shadeA = 1; private barK = 0; private lidK = 0; private hot = 0;
  private skipping = -1;
  private touch = false;
  // the wall
  private cine: CinePass | null = null;
  private wall: WallSet | null = null;
  private jelly: Jelly | null = null;
  private arm: FpArm | null = null;
  private sceneWas = true;
  private camPos = new THREE.Vector3(); private camLook = new THREE.Vector3();
  private trauma = 0;
  private reach = 0; private dive = 0; private glow = 0.5;
  private funC = new THREE.Vector2(0.08, 1.28); private contact = false; private pro = 0; private wob = 0;
  private ripT = 0; private heartT = 0;
  // the lobby
  private seam: TileObject | null = null;
  private face = { x: 0, z: 0, nx: 0, nz: 1 };
  private land = new THREE.Vector3(); private vossAt = new THREE.Vector3(); private chuteAt = new THREE.Vector3();
  private yaw0 = 45 * DEG; private yawSnap = 45 * DEG; private pitchWas = 36 * DEG;
  private camOn = false; private camFocus = new THREE.Vector3(); private camGoal = new THREE.Vector3(); private camZoom = 1; private camZoomGoal = 1; private camRate = 2;
  private eye: THREE.PerspectiveCamera | null = null;
  private eyeAim = { yaw: 0, pitch: 0, roll: 0, fov: 60 };
  private eyeGoal = { yaw: 0, pitch: 0, roll: 0, fov: 60, rate: 4 };
  private eyePos = new THREE.Vector3(); private eyeFixed: THREE.Vector3 | null = null; private eyeSmooth = new THREE.Vector3();
  private fovWas = 62;
  private claimed = false;
  private fp: THREE.Group | null = null;
  private arms: { left: FpArm; right: FpArm } | null = null;
  private fpLights: THREE.Group | null = null;
  private fpPack: THREE.Group | null = null;
  private chute: Chute | null = null;
  private pack: THREE.Mesh | null = null;
  private packItem: Item | null = null;
  private packV = new THREE.Vector3(); private packFalling = false; private packSpin = 0;
  private pose: { name: string; t: number; dur: number; anim: boolean } | null = null;
  private watchUp = false;
  private uploaded = false;
  private ownCamUpdate: ((dt: number) => void) | null = null;

  constructor(public g: Game, public p: Player, public opts: ArrivalOpts) {
    this.done = new Promise((r) => { this.resolve = r; });
    this.touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    css();
    this.buildDom();
    this.lockInput();
    const h = G.handler;
    if (h) { h.hush?.(); h.scripted = true; h.cine = true; }
    this.seamFx && (this.seamFx.calm = true);
    G.hudBody?.setHidden?.('arrival', true);
    (g as unknown as { touch?: { setHidden?: (v: boolean) => void } }).touch?.setHidden?.(true);
    document.body.classList.add('noclip-cine');
    // the issue pack waits for the chute (wherever it is now: worn, the intake's, or a fresh one)
    this.packItem = takePack(p);
    this.buildWall();
    g.addSystem(this);
    if (import.meta.env.DEV) (window as unknown as { __arrival: Arrival }).__arrival = this;
  }

  private get seamFx(): SeamFx | null { return (G as unknown as { seamFx?: SeamFx }).seamFx ?? null; }

  // ================================================================== input, dom
  private lockInput() {
    const g = this.g, inp = g.input as unknown as { hit: (a: Action) => boolean };
    const own = Object.prototype.hasOwnProperty.call(inp, 'hit');
    const prev = own ? inp.hit : undefined;
    const orig = inp.hit.bind(inp);
    inp.hit = (a: Action) => {
      if (a === 'pause') {
        const v = orig(a);
        const ui = g.ui;
        if (v && !(ui?.menuEl || ui?.readerEl || ui?.modal)) { this.skip(); return false; }
        return v;
      }
      return false;
    };
    this.offs.push(() => { if (prev) inp.hit = prev; else delete (inp as { hit?: unknown }).hit; });
    const attractWas = g.attract;
    g.attract = () => { /* the arrival drives the survivor */ };
    this.offs.push(() => { g.attract = attractWas; });
    const ui = g.ui;
    if (ui) {
      const click = ui.onWorldClick, key = ui.onInteractKey;
      ui.onWorldClick = () => { /* locked */ };
      ui.onInteractKey = () => { /* locked */ };
      this.offs.push(() => { ui.onWorldClick = click; ui.onInteractKey = key; });
    }
    const tap = (e: PointerEvent) => { if (this.plate.el.contains(e.target as Node)) return; this.wake(); };
    window.addEventListener('pointerdown', tap, true);
    this.offs.push(() => window.removeEventListener('pointerdown', tap, true));
  }
  private buildDom() {
    const root = this.root = document.createElement('div');
    root.className = 'arv-root';
    const el = (cls: string) => { const e = document.createElement('div'); e.className = cls; return e; };
    this.shade = el('arv-shade');
    this.bars = [el('arv-bar top'), el('arv-bar bot')];
    this.lids = [el('arv-lid top'), el('arv-lid bot')];
    this.plate = skipPlate(() => this.skip());
    this.plate.el.setAttribute('aria-label', 'Skip the arrival');
    const lab = this.plate.el.querySelector('.ix-plate-label');
    if (lab) lab.textContent = 'Skip';
    this.plate.setKey(this.touch ? '' : padConnected() ? 'Start' : 'Esc');
    this.plate.el.classList.add('on');
    this.plate.el.addEventListener('mouseenter', () => { G.input.pointerOverUI = true; });
    this.plate.el.addEventListener('mouseleave', () => { G.input.pointerOverUI = false; });
    root.append(...this.bars, this.lids[0], this.lids[1], this.shade, this.plate.el);
    document.body.appendChild(root);
  }
  private wake() { this.hot = 2.6; this.plate.el.classList.add('hot'); }
  private paintDom(dt: number) {
    if (this.hot > 0) { this.hot -= dt; if (this.hot <= 0) this.plate.el.classList.remove('hot'); }
    this.shade.style.opacity = String(clamp01(this.shadeA));
    const bh = (this.barK * (innerWidth < 640 || innerHeight < 420 ? 11 : 9)).toFixed(2) + 'vh';
    this.bars[0].style.height = bh; this.bars[1].style.height = bh;
    const lh = (this.lidK * this.lidK * 54).toFixed(2) + 'vh';
    this.lids[0].style.height = lh; this.lids[1].style.height = lh;
  }

  // ================================================================== frame
  update(dt0: number) {
    if (this.phase === 'done') return;
    const dt = this.hold ? 0 : Math.min(0.05, dt0) * this.speed;
    this.t += dt; this.T += dt;
    const pad = pollPadSkip();
    if (pad === 'skip') this.skip(); else if (pad === 'wake') this.wake();
    if (this.skipping >= 0) {
      this.skipping += dt0;
      this.shadeA = Math.max(this.shadeA, this.skipping / 0.3);
      if (this.cine) this.cine.fade = Math.max(this.cine.fade, this.skipping / 0.3);
      if (this.skipping >= 0.32) { this.skipping = -1; this.toEnd(); return; }
    }
    for (const tw of [...this.tweens]) {
      tw.t += dt;
      const k = clamp01(tw.t / tw.dur);
      tw.f(k);
      if (k >= 1) { this.tweens.splice(this.tweens.indexOf(tw), 1); tw.done?.(); }
    }
    if (this.phase === 'wall') { this.updWall(dt); if (this.packItem) absorbStray(this.p, this.packItem); }
    else if (this.phase === 'lobby') this.updLobby(dt);
    // the script
    if (this.script && dt > 0) {
      let sdt = dt;
      while (this.script) {
        if (this.wait && !this.wait(sdt)) break;
        this.wait = null;
        const r = this.script.next();
        if (r.done) { this.script = null; break; }
        this.wait = r.value as Wait;
        sdt = 0; // later waits in the same frame see no time
      }
    }
    this.paintDom(dt0);
  }
  private tween(dur: number, f: (k: number) => void, done?: () => void) { this.tweens.push({ t: 0, dur: Math.max(0.001, dur), f, done }); }
  private at(t: number, id: number, fn: () => void) { if (this.t >= t && !this.fired.has(id)) { this.fired.add(id); fn(); } }
  private sfx(key: string, vol = 1, rate = 1) { G.audio?.flat?.(key, 'sfx', vol, rate); }
  private say(who: string, text: string, style: 'guard' | 'self') {
    const p = this.p;
    bus.emit('subtitle', { who: style === 'self' ? p.name : who, text, dur: readTime(text), style, ...(style === 'self' ? { pid: p.id } : {}) });
    if (style === 'guard') this.sfx('guard_bark', 0.55);
  }
  private voss(text: string, o: { gesture?: string; point?: { x: number; z: number }; dur?: number } = {}) {
    G.handler?.say?.(text.replace(/\{n\}/g, debtorNumber(this.p)), { ...o, cine: true });
  }

  // ================================================================== 1. the wall
  private buildWall() {
    const g = this.g;
    const low = (g.pr as unknown as { quality?: string }).quality === 'low';
    const cine = this.cine = new CinePass(g.pr, 58);
    cine.fit(58);
    cine.fade = 1;
    this.wall = buildWallSet(low);
    cine.scene.add(this.wall.root);
    const j = this.jelly = makeJelly();
    (j.mesh.material as THREE.ShaderMaterial).side = THREE.DoubleSide;
    j.mesh.position.set(0, 0, 0.0);
    cine.scene.add(j.mesh);
    j.u.uLamp.value.copy(LAMP_POS);
    const arms = fpArmsFor(this.p);
    arms.left.dispose();
    this.arm = arms.right;
    this.arm.reach = cine.camera;
    this.arm.root.traverse((o) => { o.castShadow = true; (o as THREE.Mesh).receiveShadow = true; });
    this.arm.pose('relaxed', true);
    this.arm.tremor = 0.7;
    cine.scene.add(this.arm.root);
    this.camPos.set(0.06, 1.62, 0.92);
    this.camLook.set(0.0, 1.27, 0);
    this.sceneWas = g.pr.scene.visible;
    g.pr.scene.visible = false;
    this.shadeA = 0;
    G.audio?.positionalLoop?.('arv:drone', 'seam_drone', this.p.x, this.p.z, 0.5, 0.9);
  }

  /** two-bone IK: elbow for a shoulder S, wrist W, bending toward the pole */
  private elbow(S: THREE.Vector3, W: THREE.Vector3, pole: THREE.Vector3, out: THREE.Vector3) {
    const d = v1.copy(W).sub(S);
    let L = d.length();
    L = Math.min(L, UPPER + FORE - 1e-3);
    d.normalize();
    const a = (UPPER * UPPER - FORE * FORE + L * L) / (2 * L);
    const h = Math.sqrt(Math.max(0, UPPER * UPPER - a * a));
    const pd = v2.copy(pole).addScaledVector(d, -pole.dot(d)).normalize();
    return out.copy(S).addScaledVector(d, a).addScaledVector(pd, h);
  }

  private updWall(dt: number) {
    const cine = this.cine!, wall = this.wall!, j = this.jelly!, arm = this.arm!, cam = cine.camera;
    const t = this.t;
    cine.update(dt);
    // ---- the beats
    this.at(0.0, 1, () => { cine.fade = 1; this.tween(0.6, (k) => { cine.fade = 1 - ease(k); }); this.sfx('arv_heart', 0.5); });
    this.at(0.35, 2, () => this.say('OFFICER', 'Hand first. Let it get a taste of you.', 'guard'));
    this.at(2.05, 3, () => this.contactNow());
    this.at(3.2, 4, () => this.say('self', '...it\'s warm.', 'self'));
    this.at(4.75, 5, () => this.takeNow());
    this.at(5.3, 6, () => { this.sfx('arv_inside', 0.9); G.audio?.deafen?.(0.9); });
    this.at(6.55, 7, () => this.tween(0.45, (k) => { cine.fade = Math.max(cine.fade, ease(k)); }));
    if (t > 7.05) { this.toLobby(); return; }
    // ---- the reach (0.55..2.05), then the lean in (2.05..4.75), then the pull (4.75..5.4)
    this.reach = ease((t - 0.55) / 1.5);
    this.dive = t < 2.05 ? 0 : ease((t - 2.05) / 2.7) * 0.68 + easeIn((t - 4.75) / 0.6) * 0.32;
    const breath = Math.sin(this.T * 1.7) * 0.006, sway = Math.sin(this.T * 0.9) * 0.004;
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const tr = this.trauma * this.trauma;
    const sh = (s: number) => (Math.sin(this.T * 37 + s) + Math.sin(this.T * 23 + s * 2)) * 0.5 * tr * 0.02;
    const camZ = lerp(0.92, 0.46, Math.min(1, this.dive / 0.68)) - Math.max(0, this.dive - 0.68) / 0.32 * 0.5;
    cam.position.set(this.camPos.x - this.dive * 0.06 + sway + sh(1), this.camPos.y - this.dive * 0.1 + breath + sh(2), camZ);
    v3.set(this.camLook.x - this.dive * 0.08, this.camLook.y - this.dive * 0.05 + sh(3) * 2, -1);
    cam.up.set(0, 1, 0);
    cam.lookAt(v3);
    cam.rotateZ(-this.dive * 0.16 + sh(4));
    cine.fit(58 + Math.max(0, this.dive - 0.68) * 30);
    cam.updateMatrixWorld();
    // ---- the arm: straightens toward the touch point, then rides the body in
    const S = cam.localToWorld(v4.copy(SHOULDER_R));
    const touch = v3.set(0.08, 1.29, 0.02);
    const dir = touch.clone().sub(S).normalize();
    const rest = cam.localToWorld(new THREE.Vector3(0.26, -0.52, -0.3));
    const full = S.clone().addScaledVector(dir, UPPER + FORE - 0.004);
    const W = rest.lerp(full, this.reach);
    const pole = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0).multiplyScalar(0.7).addScaledVector(UP, -0.7);
    const E = this.elbow(S, W, pole, new THREE.Vector3());
    const Y = v1.copy(W).sub(E).normalize();
    const Z = v2.set(0, -1, 0).addScaledVector(Y, Y.y).normalize();
    const X = new THREE.Vector3().crossVectors(Y, Z);
    mtx.makeBasis(X, Y, Z);
    arm.root.quaternion.setFromRotationMatrix(mtx);
    arm.root.position.copy(E);
    // the wrist: extended back so the palm meets the surface
    arm.wrist.rotation.x = lerp(-0.3, -1.25, ease((t - 1.2) / 0.9));
    arm.tremor = this.contact ? 0.15 : 0.75;
    arm.update(dt);
    arm.root.updateMatrixWorld(true);
    // ---- the jelly
    const T = this.T;
    j.u.uTime.value = T;
    const tip = arm.tip.getWorldPosition(new THREE.Vector3());
    const zs = 0.02;
    if (!this.contact) {
      const prox = clamp01(1 - (tip.z - zs) / 0.16);
      this.pro += (prox * prox - this.pro) * Math.min(1, dt * 6);
      (j.u.uPro.value as THREE.Vector4).set(tip.x, tip.y, this.pro, 0.07 + this.pro * 0.04);
      if (this.pro > 0.2 && tip.z - zs < this.pro * 0.07) this.contactNow();
    } else {
      this.pro = Math.max(0, this.pro - dt * 4);
      (j.u.uPro.value as THREE.Vector4).z = this.pro;
      // where the limb crosses the surface: shoulder -> elbow -> wrist -> fingertip
      const pts = [S, E, W, tip];
      const rad = [0.062, 0.05, 0.042];
      let cx = tip.x, cy = tip.y, r = 0.04;
      for (let i = 0; i < 3; i++) {
        const a = pts[i], b = pts[i + 1];
        if (a.z >= zs && b.z < zs) { const k = (a.z - zs) / (a.z - b.z); cx = lerp(a.x, b.x, k); cy = lerp(a.y, b.y, k); r = rad[i]; break; }
      }
      const depth = Math.max(0, zs - tip.z);
      const k = 1 - Math.exp(-dt * 5);
      const lx = cx - this.funC.x, ly = cy - this.funC.y;
      this.funC.x += lx * k; this.funC.y += ly * k;
      (j.u.uLag.value as THREE.Vector2).set(-lx * 3, -ly * 3);
      (j.u.uFun.value as THREE.Vector4).set(this.funC.x, this.funC.y, Math.min(0.13, 0.025 + depth * 0.2), r * 1.4 + 0.07 + Math.min(0.16, depth * 0.22));
      // the rings keep coming with the heart
      this.ripT -= dt;
      if (this.ripT <= 0 && t < 4.75) { this.ripT = 0.5 + Math.random() * 0.2; j.ripple(cx, cy, 0.45 + Math.random() * 0.3, T); }
      G.audio?.positionalLoop?.('arv:slide', t < 4.9 ? 'arv_slide' : null, this.p.x, this.p.z, 0.7 * clamp01((t - 2.1) * 3), 0.9 + depth * 0.2);
    }
    this.wob = Math.max(0, this.wob - dt * 0.9);
    j.u.uWob.value = this.wob + (this.contact ? 0.12 : 0.03);
    j.u.uHot.value = this.contact ? 1 : 0;
    // the heart quickens
    this.heartT -= dt;
    if (this.heartT <= 0 && t > 0.6 && t < 5.2) { this.heartT = Math.max(0.42, 0.95 - t * 0.1); this.sfx('arv_heart', 0.35 + t * 0.06); cine.heart = 1; }
    cine.heart = Math.max(0, cine.heart - dt * 5);
    // the glow swells as it gets interested
    const gGoal = 0.45 + (this.contact ? 0.35 : this.pro * 0.4) + (t > 4.75 ? 0.4 : 0);
    this.glow += (gGoal - this.glow) * Math.min(1, dt * 3);
    j.u.uGlow.value = this.glow;
    wall.update(T, this.glow);
    // the pull: the surface swells out over the face, the lens goes
    if (t > 4.75) {
      const k = ease((t - 4.75) / 0.6);
      (j.u.uEng.value as THREE.Vector4).set(cam.position.x, cam.position.y - 0.05, k * 0.38, 0.26 + k * 0.25);
      cine.warp = k; cine.zoom = k; cine.split = k * 0.9;
      cine.inside = clamp01((t - 5.25) / 0.4);
      cine.bloom = 0.55 + k * 0.5;
      cine.vig = 0.6 + k * 0.3;
      cine.center.set(0.5, 0.5);
    }
  }
  private contactNow() {
    if (this.contact) return;
    this.contact = true;
    const j = this.jelly!, arm = this.arm!;
    const tip = arm.tip.getWorldPosition(new THREE.Vector3());
    this.funC.set(tip.x, tip.y);
    j.ripple(tip.x, tip.y, 1.3, this.T);
    this.wob = 0.8;
    this.trauma = Math.max(this.trauma, 0.35);
    arm.pose('flat');
    this.sfx('arv_squelch', 0.9);
    this.sfx('seam_ripple', 0.4);
    if (this.cine) { this.cine.flash = 0.08; this.cine.flashCol.setRGB(0.4, 0.9, 1.0); }
    // it grips the fingers a beat later
    setTimeout(() => { if (this.arm && this.phase === 'wall') this.arm.pose('claw'); }, 450);
  }
  private takeNow() {
    const j = this.jelly!, cine = this.cine!;
    j.ripple(this.funC.x, this.funC.y, 2.2, this.T);
    this.wob = 1.4;
    this.trauma = 1;
    this.sfx('arv_gulp', 1);
    this.sfx('seam_through', 0.6);
    cine.flash = 0.18; cine.flashCol.setRGB(0.3, 0.85, 0.95);
    G.camera?.shake?.(0.6, 0.6);
  }
  private disposeWall() {
    if (!this.cine) return;
    this.cine.dispose(); this.cine = null;
    this.wall?.dispose(); this.wall = null;
    if (this.jelly) { this.jelly.mesh.removeFromParent(); this.jelly.dispose(); this.jelly = null; }
    this.arm?.dispose(); this.arm = null;
    this.g.pr.scene.visible = this.sceneWas || true;
    G.audio?.positionalLoop?.('arv:slide', null);
    G.audio?.positionalLoop?.('arv:drone', null);
  }

  // ================================================================== 2. the lobby
  private lobbySeam(z: Zone): TileObject | null {
    for (const o of z.objects.values()) if (o.key === 'seam_door') return o;
    return null;
  }
  private walkable(z: Zone, x: number, y: number) { return z.inb(x, y) && !!z.floor[z.idx(x, y)] && z.solid[z.idx(x, y)] !== 1; }

  /** off the wall, into the world: lying in front of the Lobby's Seam, black */
  private toLobby() {
    const g = this.g, p = this.p;
    this.disposeWall();
    this.phase = 'lobby'; this.t = 0; this.fired.clear();
    this.shadeA = 1;
    const lz = g.getZone('lobby');
    this.seam = this.lobbySeam(lz);
    let fx: number, fz: number, nx: number, nz: number;
    if (this.seam) { const f = seamFaceOf(this.seam); fx = f.x; fz = f.z; nx = f.nx; nz = f.nz; }
    else { const sp = (lz.meta.spawn as [number, number]) || [10, 10]; fx = sp[0] + 0.5; fz = sp[1] - 1; nx = 0; nz = 1; }
    this.face = { x: fx, z: fz, nx, nz };
    const [tx, ty] = g.nearestWalkable(lz, Math.floor(fx + nx * 1.4), Math.floor(fz + nz * 1.4));
    g.placePlayer(p, 'lobby', tx, ty, Math.atan2(nz, nx));
    g.net?.onLocalTravel?.('lobby');
    if (g.view) g.view.vis.enabled = true;
    p.vx = p.vz = 0; p.speed = 0;
    this.land.set(p.x, p.y, p.z);
    // Voss stands out in the room, facing back at the Seam; the chute comes down beside the debtor
    const tnx = -nz, tnz = nx;
    const pick = (cands: [number, number][], out: THREE.Vector3) => {
      for (const [a, b] of cands) {
        const x = p.x + nx * a + tnx * b, z = p.z + nz * a + tnz * b;
        if (this.walkable(lz, Math.floor(x), Math.floor(z))) { out.set(x, lz.heightAt(Math.floor(x), Math.floor(z)), z); return; }
      }
      out.set(p.x + nx * 0.8, p.y, p.z + nz * 0.8);
    };
    pick([[2.0, -0.35], [1.8, 0.4], [1.6, -0.8], [1.5, 0.9], [1.3, 0], [0.2, 1.6], [0.2, -1.6]], this.vossAt);
    pick([[0.62, 0.42], [0.6, -0.42], [0.7, 0], [0.3, 0.6], [0.3, -0.6]], this.chuteAt);
    // the Seam is awake for a minute: it has just let someone through
    if (this.seam) { this.seamFx?.setState(this.seam, false); }
    if (this.seamFx) this.seamFx.calm = true;
    // the camera: looking at the Seam's wall from the room, framed close, low
    const cam = g.camera;
    this.pitchWas = cam.rig.pitchGoal;
    const yawWall = Math.atan2(nx, nz);
    this.yawSnap = cam.snapYaw(yawWall);
    this.yaw0 = this.yawSnap;
    cam.setPhotoRig(this.yawSnap + 14 * DEG, 30 * DEG);
    g.pr.yaw = this.yawSnap + 14 * DEG;
    cam.settle();
    this.hookCamera();
    this.camOn = true;
    this.camFocus.set(lerp(fx, p.x, 0.55), p.y + 0.3, lerp(fz, p.z, 0.55));
    this.camGoal.copy(this.camFocus);
    this.camZoom = this.camZoomGoal = 2.1;
    // the first person rig: a stage of our own in the overlay (the hands), an eye camera for the world
    if (fpClaim('arrival', 95, { cinematic: 'none' })) {
      this.claimed = true;
      const oc = fpCamera();
      this.fovWas = oc.fov;
      oc.position.set(0, 0, 0); oc.quaternion.identity(); oc.updateMatrixWorld();
      this.fp = fpGroup('arrival');
    }
    this.eye = new THREE.PerspectiveCamera(60, 16 / 9, 0.05, 48);
    this.eye.layers.enable(1);
    this.hookBody();
    this.setPose('prone', 99);
    // the body comes out of the wall
    p.x = fx + nx * 0.35; p.z = fz + nz * 0.35;
    this.barK = 1;
    this.script = this.lobbyScript();
    this.wait = null;
  }

  /** the iso camera, framed by the script: focus, zoom (applied after the controller's own update) */
  private hookCamera() {
    const cam = this.g.camera as unknown as { update: (dt: number) => void };
    const own = Object.prototype.hasOwnProperty.call(cam, 'update') ? cam.update : null;
    const orig = cam.update.bind(cam);
    const pr = this.g.pr;
    cam.update = (dt: number) => {
      orig(dt);
      if (!this.camOn) return;
      const k = 1 - Math.exp(-dt * this.camRate);
      this.camFocus.lerp(this.camGoal, k);
      this.camZoom += (this.camZoomGoal - this.camZoom) * k;
      pr.target.copy(this.camFocus);
      pr.pxSize = pr.pxSize / Math.max(0.3, this.camZoom);
      pr.updateCamera(0);
    };
    this.ownCamUpdate = cam.update;
    this.offs.push(() => { if (own) cam.update = own; else delete (cam as { update?: unknown }).update; });
  }
  private frame(focus: THREE.Vector3, zoom: number, rate = 2) { this.camGoal.copy(focus); this.camZoomGoal = zoom; this.camRate = rate; }

  /** the survivor's rig: our poses on top of the animator */
  private hookBody() {
    const p = this.p as unknown as { updateVisual: (dt: number) => void };
    const own = Object.prototype.hasOwnProperty.call(p, 'updateVisual') ? p.updateVisual : null;
    const orig = p.updateVisual.bind(p);
    p.updateVisual = (dt: number) => {
      orig(dt);
      try {
        const s = this.pose;
        if (!s) return;
        s.t += dt;
        if (!s.anim) {
          const u = clamp01(s.t / s.dur);
          const ps = ownPose(s.name, u, this.T) ?? fallbackPose(s.name, u, this.T);
          if (ps) overlay(this.p.rig, ps, Math.min(1, s.t * 6));
        }
        if (s.t >= s.dur + 0.05 && s.name !== 'prone' && s.name !== 'sway') this.clearPose();
      } catch (e) { console.error('arrival pose', e); }
    };
    this.offs.push(() => { if (own) p.updateVisual = own; else delete (p as { updateVisual?: unknown }).updateVisual; });
  }
  private setPose(name: string, dur = 1) {
    this.clearPose();
    const anim = !ownPose(name, 0, 0) && animSupported(name);
    this.pose = { name, t: 0, dur, anim };
    if (anim) this.p.playAnim(name, dur);
  }
  private clearPose() {
    if (this.pose?.anim) this.p.stopAnim(this.pose.name);
    this.pose = null;
  }

  // ---------------------------------------------------------------- first person in the Lobby
  private eyeOn(o: { yaw: number; pitch: number; roll?: number; fov?: number; fixed?: THREE.Vector3 | null; snap?: boolean }) {
    const pr = this.g.pr;
    if (!this.eye) return;
    this.eyeGoal.yaw = o.yaw; this.eyeGoal.pitch = o.pitch; this.eyeGoal.roll = o.roll ?? 0; this.eyeGoal.fov = o.fov ?? 60;
    this.eyeFixed = o.fixed ?? null;
    if (o.snap || pr.eyeCamera !== this.eye) {
      this.eyeAim.yaw = o.yaw; this.eyeAim.pitch = o.pitch; this.eyeAim.roll = o.roll ?? 0; this.eyeAim.fov = o.fov ?? 60;
      this.headPos(this.eyeSmooth);
    }
    pr.eyeCamera = this.eye;
    pr.eyeHide = [this.p.rig.root];
    this.updEye(0);
  }
  private eyeOff() {
    const pr = this.g.pr;
    if (pr.eyeCamera === this.eye) { pr.eyeCamera = null; pr.eyeHide = []; }
  }
  private headPos(out: THREE.Vector3) {
    if (this.eyeFixed) return out.copy(this.eyeFixed);
    const p = this.p;
    const hb = (p.rig as unknown as { bones?: Record<string, THREE.Object3D> }).bones?.head;
    out.set(p.x, p.y + 1.6, p.z);
    if (hb) { hb.updateWorldMatrix(true, false); v1.setFromMatrixPosition(hb.matrixWorld); if (Number.isFinite(v1.y)) out.set(v1.x, v1.y + 0.07, v1.z); }
    return out;
  }
  private updEye(dt: number) {
    const e = this.eye, pr = this.g.pr;
    if (!e || pr.eyeCamera !== e) return;
    const k = dt ? 1 - Math.exp(-dt * this.eyeGoal.rate) : 1;
    const a = this.eyeAim, gl = this.eyeGoal;
    const wrap = (x: number) => Math.atan2(Math.sin(x), Math.cos(x));
    a.yaw += wrap(gl.yaw - a.yaw) * k; a.pitch += (gl.pitch - a.pitch) * k; a.roll += (gl.roll - a.roll) * k; a.fov += (gl.fov - a.fov) * k;
    this.headPos(v2);
    const sk = dt ? 1 - Math.exp(-dt * 10) : 1;
    this.eyeSmooth.lerp(v2, sk);
    const br = Math.sin(this.T * 1.9) * 0.004, bx = Math.sin(this.T * 0.8) * 0.002;
    const fx = Math.cos(a.yaw), fz = Math.sin(a.yaw);
    e.position.set(this.eyeSmooth.x + fx * 0.08, this.eyeSmooth.y + br, this.eyeSmooth.z + fz * 0.08);
    v3.set(e.position.x + Math.cos(a.yaw) * Math.cos(a.pitch), e.position.y - Math.sin(a.pitch), e.position.z + Math.sin(a.yaw) * Math.cos(a.pitch));
    e.up.set(0, 1, 0);
    e.lookAt(v3);
    e.rotateZ(a.roll + bx);
    pr.eyeFov = a.fov;
    // the overlay (the hands) sees through the same lens
    const W = pr.lowW + pr.margin * 2, H = pr.lowH + pr.margin * 2, asp = W / H;
    const base = a.fov * DEG;
    const vf = asp >= 1.2 ? base : Math.min(104 * DEG, 2 * Math.atan(Math.tan(base / 2) * 1.2 / asp));
    e.fov = vf / DEG; e.aspect = asp; e.updateProjectionMatrix(); e.updateMatrixWorld();
    if (this.claimed) { const oc = fpCamera(); oc.fov = e.fov; oc.aspect = asp; oc.updateProjectionMatrix(); }
  }
  private lookAtYawPitch(from: THREE.Vector3, to: THREE.Vector3) {
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    return { yaw: Math.atan2(dz, dx), pitch: -Math.atan2(dy, Math.hypot(dx, dz)) };
  }

  private updLobby(dt: number) {
    // (until it is handed over, no other pack may turn up on his back)
    if (this.packItem) absorbStray(this.p, this.packItem);
    this.updEye(dt);
    this.updPack(dt);
    this.chute?.apply();
    // the debtor's own arms in the overlay (the pickup)
    if (this.arms) { this.arms.left.update(dt); this.arms.right.update(dt); }
  }

  // ---------------------------------------------------------------- the lobby, scripted
  private *lobbyScript(): Script {
    const g = this.g, p = this.p, h = G.handler;
    const f = this.face, n = new THREE.Vector3(f.nx, 0, f.nz);
    const seam = this.seam;
    // ---- I1 (iso): the Seam spits him out onto the floor
    this.tween(0.7, (k) => { this.shadeA = 1 - ease(k); });
    if (seam) this.seamFx?.ripple(seam, { x: f.x, y: p.y + 1.0, z: f.z }, 2.2, false);
    this.sfx('arv_spit', 0.95);
    const from = new THREE.Vector3(f.x + f.nx * 0.35, p.y, f.z + f.nz * 0.35);
    this.tween(0.5, (k) => { const e = easeOut(k); p.x = lerp(from.x, this.land.x, e); p.z = lerp(from.z, this.land.z, e); });
    yield secs(0.48);
    G.camera?.shake?.(0.45, 0.4);
    this.sfx('body_thud', 0.8);
    this.frame(v1.set(lerp(f.x, p.x, 0.5), p.y + 0.25, lerp(f.z, p.z, 0.5)), 2.35, 0.6);
    yield secs(0.7);
    this.sfx('debtor_gasp', 0.7);
    if (seam) this.seamFx?.ripple(seam, undefined, 0.7, true);
    yield secs(1.2);
    // ---- F1 (first person): eyes open on the floor; up onto a knee, up
    this.lidK = 1;
    this.eyeOn({ yaw: Math.atan2(f.nz, f.nx) + 0.25, pitch: 38 * DEG, roll: 0.75, fov: 62, snap: true });
    this.eyeGoal.rate = 1.6;
    this.tween(0.5, (k) => { this.lidK = 1 - ease(k) * 0.55; });
    yield secs(0.7);
    this.tween(0.25, (k) => { this.lidK = 0.45 + ease(k) * 0.55; }, () => this.tween(0.6, (k) => { this.lidK = 1 - ease(k); }));
    this.setPose('get_up', 2.2);
    this.eyeGoal.roll = 0; this.eyeGoal.pitch = 8 * DEG; this.eyeGoal.yaw = Math.atan2(f.nz, f.nx);
    yield secs(0.9);
    this.say('self', '...where...', 'self');
    yield secs(1.5);
    this.setPose('sway', 99);
    // ---- the band: a chirp, the lamp in it flickering, the signal
    this.sfx('remit_chirp', 0.9);
    try { G.holo?.boot?.(); } catch (e) { console.warn('holo.boot', e); }
    bus.emit('watchSignal', { from: 'VOSS', kind: 'handler', text: 'INCOMING' });
    this.eyeGoal.pitch = 40 * DEG; this.eyeGoal.yaw = Math.atan2(f.nz, f.nx) + 0.5; this.eyeGoal.rate = 3;
    yield secs(0.9);
    // ---- I2 (iso): behind the debtor, the beam comes out of the wrist, Voss unfolds out of the floor
    this.eyeOff();
    this.setPose('wrist_look', 3.2);
    const yawRoom = Math.atan2(-f.nx, -f.nz);
    const snapRoom = g.camera.snapYaw(yawRoom);
    g.camera.setPhotoRig(snapRoom - 16 * DEG, 32 * DEG);
    g.pr.yaw = snapRoom - 16 * DEG; g.pr.pitch = 32 * DEG;
    this.yawSnap = snapRoom;
    this.camFocus.set(p.x + n.x * 0.5, p.y + 1.0, p.z + n.z * 0.5);
    this.frame(this.camFocus, 2.6, 2);
    this.camZoom = 2.6;
    yield secs(0.6);
    if (h) {
      h.beamFromBand = true;
      h.appear?.({ x: this.vossAt.x, z: this.vossAt.z }, 2.6);
      h.x = this.vossAt.x; h.z = this.vossAt.z; h.y = this.vossAt.y;
      h.facing = Math.atan2(p.z - this.vossAt.z, p.x - this.vossAt.x);
    }
    this.sfx('holo_on', 0.6);
    // the slow push in on him as he comes up out of the floor
    const vf = v2.set(this.vossAt.x, this.vossAt.y + 1.25, this.vossAt.z);
    this.frame(vf, 3.4, 0.38);
    g.camera.setPhotoRig(snapRoom + 6 * DEG, 25 * DEG);
    yield secs(2.9);
    this.setPose('sway', 99);
    // ---- he speaks
    this.voss('Signal\'s good. Debtor {n}. Staff Sergeant Voss, Remittance Programme. I\'m your handler. You\'re my problem.', { gesture: 'salute2' });
    yield until(() => !h?.busy, 12);
    // ---- F2 (first person): his face, close, a slow creep in
    {
      this.headPos(v1);
      const a = this.lookAtYawPitch(v1, v3.set(this.vossAt.x, this.vossAt.y + 1.62, this.vossAt.z));
      this.eyeOn({ yaw: a.yaw, pitch: a.pitch + 3 * DEG, fov: 52, snap: true });
      this.eyeGoal.fov = 40; this.eyeGoal.rate = 0.35;
    }
    this.voss('You owe the Institute {owed} scrip. Interest compounds. So does my patience. That one\'s a lie.'.replace('{owed}', this.owed()), { gesture: 'jab_finger' });
    yield until(() => !h?.busy, 12);
    this.voss('This place is full of goods nobody is using. You find them, you break them open, you get them to the other side. For that you\'ll need something to carry it in.', { gesture: 'dismiss' });
    yield secs(2.2);
    // ---- the chute: he looks up as the hatch drops open beside him
    const lz = g.getZone('lobby');
    const floorY = lz.heightAt(Math.floor(this.chuteAt.x), Math.floor(this.chuteAt.z));
    this.chute = new Chute(this.chuteAt.x, this.chuteAt.z, floorY, floorY + WALL_H, Math.atan2(f.nx, f.nz));
    g.pr.scene.add(this.chute.root);
    this.headPos(v1);
    {
      const a = this.lookAtYawPitch(v1, v3.set(this.chuteAt.x, floorY + WALL_H, this.chuteAt.z));
      this.eyeGoal.yaw = a.yaw; this.eyeGoal.pitch = Math.max(-55 * DEG, a.pitch); this.eyeGoal.fov = 64; this.eyeGoal.rate = 2.4;
    }
    yield until(() => !h?.busy, 10);
    this.sfx('arv_clank', 0.8);
    this.tween(0.4, (k) => { this.chute && (this.chute.hatchOpen = easeOut(k)); });
    yield secs(0.35);
    this.sfx('arv_hiss', 0.9);
    this.tween(1.3, (k) => { this.chute && (this.chute.ext = k); });
    {
      const a = this.lookAtYawPitch(v1, v3.set(this.chuteAt.x, floorY + 1.1, this.chuteAt.z));
      this.eyeGoal.yaw = a.yaw; this.eyeGoal.pitch = a.pitch; this.eyeGoal.rate = 1.2;
    }
    yield secs(1.3);
    this.sfx('arv_clank', 0.7, 1.15);
    yield secs(0.25);
    // ---- the drop
    this.tween(0.15, (k) => { this.chute && (this.chute.flapOpen = k); });
    this.dropPack();
    {
      const a = this.lookAtYawPitch(v1, v3.set(this.chuteAt.x, floorY, this.chuteAt.z));
      this.eyeGoal.pitch = a.pitch; this.eyeGoal.yaw = a.yaw; this.eyeGoal.rate = 5;
    }
    yield secs(0.45);
    // up it goes again
    this.tween(0.25, (k) => { this.chute && (this.chute.flapOpen = 1 - k); });
    this.sfx('arv_hiss', 0.6, 1.2);
    this.tween(1.1, (k) => { this.chute && (this.chute.ext = 1 - k); }, () => {
      this.sfx('arv_clank', 0.5, 0.9);
      this.tween(0.3, (k) => { this.chute && (this.chute.hatchOpen = 1 - k); });
    });
    yield secs(0.7);
    // ---- I3 (iso): a two-shot, the pack on the floor between them
    this.eyeOff();
    g.camera.setPhotoRig(snapRoom - 22 * DEG, 34 * DEG);
    this.frame(v1.set((p.x + this.vossAt.x) / 2, p.y + 0.7, (p.z + this.vossAt.z) / 2), 2.0, 1.2);
    this.voss('Meridian issue. Pick it up. Don\'t lose it, it\'s worth more than you are.', { point: { x: this.chuteAt.x, z: this.chuteAt.z } });
    yield secs(1.8);
    // ---- F3 (first person): down on a knee, the hands, up and onto the shoulder
    yield* this.pickup();
    // ---- I4 (iso): the pack on his back
    this.eyeOff();
    this.setPose('sway', 99);
    g.camera.setPhotoRig(snapRoom + 18 * DEG, 31 * DEG);
    this.frame(v1.set(p.x, p.y + 0.95, p.z), 2.7, 1.6);
    this.camZoom = 2.7; this.camFocus.copy(this.camGoal);
    yield until(() => !h?.busy, 6);
    this.voss('And the job. It\'s on your watch.', { gesture: 'jab_finger' });
    yield secs(1.4);
    // ---- the watch: its own close-up, the mission arriving
    yield* this.upload();
    // ---- I5 (iso): the sign-off; the projection collapses
    g.camera.setPhotoRig(snapRoom - 6 * DEG, 28 * DEG);
    this.frame(v1.set(this.vossAt.x * 0.65 + p.x * 0.35, this.vossAt.y + 1.0, this.vossAt.z * 0.65 + p.z * 0.35), 2.5, 1.4);
    this.voss('Break something open, find what\'s worth something, feed it to a press. Your number goes down. Don\'t try to leave, the band takes it personally. Voss out.', { gesture: 'salute2' });
    const press = h?.nearestHopper?.();
    yield until(() => !h?.busy, 16);
    yield secs(0.2);
    this.sfx('arv_collapse', 0.8);
    h?.collapse?.();
    yield secs(0.95);
    if (seam) { this.seamFx?.seal(seam, true); }
    if (press) h?.guide?.(press);
    else { const fu = h?.nearestFurniture?.(); if (fu) h?.guide?.(fu); }
    yield secs(0.9);
    // ---- control
    this.tween(0.8, (k) => { this.barK = 1 - ease(k); });
    this.camOn = false;
    g.camera.setPhotoRig(this.yawSnap, this.pitchWas || 36 * DEG);
    yield secs(0.5);
    this.finish();
  }

  private owed(): string {
    const D = G.debt as { on?: boolean; remaining?: number } | null;
    const owed = Math.round(D?.on && (D.remaining ?? 0) > 0 ? D.remaining! : Number(G.sandbox?.debt) || 25000);
    return owed.toLocaleString('en-GB');
  }

  // ---------------------------------------------------------------- the pack
  private packRest = new THREE.Quaternion(); private packPos = new THREE.Vector3();
  private dropPack() {
    const c = this.chute!;
    const m = this.pack = packWorldMesh();
    const mouth = c.mouth(v1);
    m.position.set(this.chuteAt.x, mouth.y - 0.42, this.chuteAt.z);
    m.rotation.set(0, Math.atan2(this.face.nx, this.face.nz) + 0.4, 0);
    this.g.pr.scene.add(m);
    this.packV.set(0, -0.6, 0);
    this.packFalling = true;
    this.packSpin = 0;
    // it lands on its back, a little askew
    const yaw = Math.atan2(this.p.x - this.chuteAt.x, this.p.z - this.chuteAt.z) + Math.PI + 0.35;
    this.packRest.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0, 'XYZ')).premultiply(new THREE.Quaternion().setFromAxisAngle(UP, yaw));
    this.packPos.set(this.chuteAt.x, this.chute!.floorY + 0.128, this.chuteAt.z);
    this.sfx('arv_rustle', 0.5);
  }
  private updPack(dt: number) {
    const m = this.pack;
    if (!m || !this.packFalling) return;
    this.packV.y -= 9.8 * dt;
    m.position.y += this.packV.y * dt;
    this.packSpin = Math.min(1, this.packSpin + dt * 2.6);
    m.quaternion.slerp(this.packRest, Math.min(1, dt * 7 * (0.3 + this.packSpin)));
    if (m.position.y <= this.packPos.y) {
      m.position.y = this.packPos.y;
      if (this.packV.y < -1.2) {
        this.packV.y = -this.packV.y * 0.22;
        this.sfx('arv_packdrop', 0.9);
        this.g.camera?.shake?.(0.18, 0.25);
        if (this.g.pr.eyeCamera === this.eye) this.eyeAim.pitch += 0.04;
      } else { this.packFalling = false; m.quaternion.copy(this.packRest); m.position.copy(this.packPos); }
    }
  }

  /** first person: kneel, both hands to it, lift, swing it onto the back */
  private *pickup(): Script {
    const p = this.p, g = this.g;
    if (!this.pack) { givePack(p, this.packItem); this.packItem = null; return; }
    this.packFalling = false;
    this.pack.position.copy(this.packPos); this.pack.quaternion.copy(this.packRest);
    p.facing = p.targetFacing = Math.atan2(this.chuteAt.z - p.z, this.chuteAt.x - p.x);
    this.setPose('kneel_reach', 4.2);
    this.headPos(v1);
    const standEye = v1.clone();
    const kneelEye = new THREE.Vector3(p.x + Math.cos(p.facing) * 0.12, p.y + 0.98, p.z + Math.sin(p.facing) * 0.12);
    const fixed = standEye.clone();
    const a0 = this.lookAtYawPitch(standEye, this.packPos);
    this.eyeOn({ yaw: a0.yaw, pitch: a0.pitch - 6 * DEG, fov: 60, fixed, snap: true });
    this.eyeGoal.rate = 3;
    // down on a knee
    this.tween(0.75, (k) => { fixed.lerpVectors(standEye, kneelEye, ease(k)); const a = this.lookAtYawPitch(fixed, this.packPos); this.eyeGoal.yaw = a.yaw; this.eyeGoal.pitch = a.pitch - 4 * DEG; });
    this.sfx('arv_rustle', 0.4);
    yield secs(0.8);
    // the hands come into the picture
    const fp = this.fp;
    if (!fp || !this.claimed) {
      yield secs(0.6);
      this.pack.removeFromParent(); this.pack = null;
      givePack(p, this.packItem); this.packItem = null;
      this.sfx('arv_ratchet', 0.6);
      return;
    }
    const lights = this.fpLights = new THREE.Group();
    lights.add(new THREE.HemisphereLight(0xd8d0b8, 0x2a2418, 0.9));
    const key = new THREE.DirectionalLight(0xffe2b0, 1.6); key.position.set(0.5, 1, 0.3); lights.add(key);
    const rim = new THREE.DirectionalLight(0xffb060, 0.9); rim.position.set(-0.6, 0.3, -1); lights.add(rim);
    fp.add(lights);
    const arms = this.arms = fpArmsFor(p);
    fp.add(arms.left.root, arms.right.root);
    arms.left.pose('open', true); arms.right.pose('open', true);
    // the pack's place in the eye's own space: the close-up copy takes over from the world one there
    const e = this.eye!;
    this.updEye(0);
    e.updateMatrixWorld();
    const inv = new THREE.Matrix4().copy(e.matrixWorld).invert();
    const pm = new THREE.Matrix4().multiplyMatrices(inv, this.pack.matrixWorld);
    const pk = this.fpPack = packOverlayGroup();
    pk.matrixAutoUpdate = true;
    pm.decompose(pk.position, pk.quaternion, pk.scale);
    const p0 = pk.position.clone(), q0 = pk.quaternion.clone();
    pk.visible = false;
    fp.add(pk);
    // targets in camera space: the handle (pack top) and the left shoulder strap
    const handle = () => pk.localToWorld(v3.set(0, 0.53, -0.04));
    const strap = () => pk.localToWorld(v4.set(-0.1, 0.3, -0.17));
    const restR = new THREE.Vector3(0.26, -0.5, -0.25), restL = new THREE.Vector3(-0.26, -0.5, -0.25);
    const reachArm = (arm: FpArm, side: 1 | -1, target: THREE.Vector3, k: number, pole: THREE.Vector3) => {
      const S = v1.set(0.17 * side, -0.25, -0.2);
      const W = (side > 0 ? restR : restL).clone().lerp(target, k);
      const E = this.elbow(S, W, pole, new THREE.Vector3());
      const Y = v2.copy(W).sub(E).normalize();
      const Z = new THREE.Vector3(0, -1, 0).addScaledVector(Y, Y.y).normalize();
      const X = new THREE.Vector3().crossVectors(Y, Z);
      mtx.makeBasis(X, Y, Z);
      arm.root.quaternion.setFromRotationMatrix(mtx);
      if (side < 0) arm.root.scale.set(-1, 1, 1);
      arm.root.position.copy(E);
    };
    const poleR = new THREE.Vector3(0.8, -0.6, 0.2), poleL = new THREE.Vector3(-0.8, -0.6, 0.2);
    let kr = 0;
    // swap at once (the world copy hides; the close-up copy sits exactly where it lay)
    pk.visible = true;
    this.pack.visible = false;
    this.tween(0.7, (k) => { kr = ease(k); reachArm(arms.right, 1, handle().clone(), kr, poleR); reachArm(arms.left, -1, strap().clone(), kr * 0.9, poleL); });
    yield secs(0.72);
    arms.right.pose('grip'); arms.left.pose('grip');
    this.sfx('arv_rustle', 0.6);
    yield secs(0.22);
    // lift: up toward the chest, standing as it comes
    const pLift = new THREE.Vector3(0.04, -0.3, -0.42);
    const qLift = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.15, 0.3, 0.05));
    this.tween(0.75, (k) => {
      const e2 = ease(k);
      pk.position.lerpVectors(p0, pLift, e2);
      pk.quaternion.slerpQuaternions(q0, qLift, e2);
      reachArm(arms.right, 1, handle().clone(), 1, poleR); reachArm(arms.left, -1, strap().clone(), 1, poleL);
      fixed.lerpVectors(kneelEye, standEye, ease(k * 1.2));
      this.eyeGoal.pitch = lerp(this.eyeGoal.pitch, 12 * DEG, e2 * 0.2);
    });
    this.clearPose();
    yield secs(0.78);
    // the swing: round to the right and over the shoulder, the strap sliding past the eye
    this.sfx('arv_rustle', 0.8, 0.9);
    const pSwing = new THREE.Vector3(0.75, -0.15, 0.25);
    const qSwing = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, -1.7, -0.4));
    const yaw0 = this.eyeGoal.yaw;
    this.tween(0.55, (k) => {
      const e2 = easeIn(k);
      pk.position.lerpVectors(pLift, pSwing, e2);
      pk.quaternion.slerpQuaternions(qLift, qSwing, e2);
      reachArm(arms.right, 1, handle().clone(), 1 - e2 * 0.6, poleR);
      reachArm(arms.left, -1, strap().clone(), 1 - e2, poleL);
      this.eyeGoal.yaw = yaw0 + e2 * 0.25; this.eyeGoal.roll = e2 * 0.12;
    });
    yield secs(0.5);
    // it lands on the back: weight, the straps cinched
    givePack(p, this.packItem); this.packItem = null;
    this.sfx('arv_packdrop', 0.55, 1.2);
    this.eyeAim.pitch += 0.05; this.eyeAim.roll -= 0.04;
    pk.visible = false;
    arms.right.pose('relaxed');
    // the left hand pulls the strap tight at the chest
    const sTight0 = new THREE.Vector3(-0.08, -0.32, -0.3), sTight1 = new THREE.Vector3(-0.12, -0.42, -0.26);
    arms.left.pose('grip');
    this.tween(0.5, (k) => {
      reachArm(arms.left, -1, v3.lerpVectors(sTight0, sTight1, ease(k)), 1, poleL);
      reachArm(arms.right, 1, v4.set(0.3, -0.62, -0.25), 1, poleR);
      this.eyeGoal.yaw = yaw0 + 0.25 * (1 - ease(k)); this.eyeGoal.roll = 0.12 * (1 - ease(k));
    });
    yield secs(0.12);
    this.sfx('arv_ratchet', 0.7);
    yield secs(0.45);
    this.tween(0.35, (k) => { reachArm(arms.left, -1, v3.copy(sTight1).add(v4.set(0, -0.3 * k, 0)), 1, poleL); });
    yield secs(0.35);
    this.disposeFp();
    this.pack?.removeFromParent();
    this.pack = null;
    void g;
  }
  private disposeFp() {
    if (this.arms) { this.arms.left.dispose(); this.arms.right.dispose(); this.arms = null; }
    if (this.fpPack) { disposeGroup(this.fpPack); this.fpPack = null; }
    if (this.fpLights) { this.fpLights.removeFromParent(); this.fpLights = null; }
  }

  // ---------------------------------------------------------------- the mission upload
  private ensureMission() {
    if (this.uploaded) return;
    this.uploaded = true;
    const g = this.g, m = G.missions;
    if (!m) return;
    try {
      if (m.enabled !== false) m.set?.('contract:intake');
      // the intake holds the directives back while it plays: run them once now so First Haul exists
      if (!g.systems.includes(m)) m.update?.(0.6);
    } catch (e) { console.warn('arrival: mission', e); }
  }
  private *upload(): Script {
    const w = G.watch as { toggle?: (v?: boolean, page?: string) => void; open?: boolean; message?: (...a: unknown[]) => void; st?: { qOpen?: string | null }; wearing?: (p: Player) => boolean } | null;
    this.ensureMission();
    const canWatch = !!w?.toggle && (w.wearing ? w.wearing(this.p) : true);
    if (!canWatch) { this.sfx('arv_upload', 0.6); yield secs(2); return; }
    // our stage steps aside for the watch's own close-up
    this.eyeOff();
    if (this.claimed) { fpRelease('arrival'); this.claimed = false; fpCamera().fov = this.fovWas; fpCamera().updateProjectionMatrix(); }
    try { w!.toggle!(true, 'qst'); this.watchUp = !!w!.open; } catch (e) { console.warn('arrival: watch', e); }
    yield secs(1.0);
    this.sfx('arv_upload', 0.7);
    try { w!.message?.('MISSION UPLOADED', 'FIRST HAUL', 'ok', 4, false); if (w!.st) w!.st.qOpen = 'first_haul'; } catch { /* older watch */ }
    yield secs(3.2);
    try { if (this.watchUp) w!.toggle!(false); } catch { /* */ }
    this.watchUp = false;
    yield until(() => !fpOwner(), 2);
    yield secs(0.3);
  }

  // ================================================================== skipping & the end
  skip() {
    if (this.phase === 'done' || this.phase === 'end' || this.skipping >= 0) return;
    this.skipping = 0;
    this.plate.el.classList.remove('on', 'hot');
    G.audio?.flat?.('static_burst', 'sfx', 0.3);
  }

  /** jump to the end state: in the Lobby, standing, the pack on, the contract running, Voss gone, the Seam shut */
  private toEnd() {
    if (this.phase === 'wall') this.toLobby();
    this.script = null; this.wait = null;
    this.tweens.length = 0;
    const h = G.handler;
    h?.hush?.(); h?.gone?.();
    this.p.x = this.land.x; this.p.z = this.land.z;
    if (this.chute) { this.chute.dispose(); this.chute = null; }
    if (this.pack) { this.pack.removeFromParent(); this.pack = null; }
    this.disposeFp();
    if (this.packItem || !ensurePack(this.p)) { givePack(this.p, this.packItem); this.packItem = null; }
    this.ensureMission();
    if (this.seam) this.seamFx?.setState(this.seam, true);
    const press = h?.nearestHopper?.();
    if (press) h?.guide?.(press);
    this.camOn = false;
    this.g.camera.setPhotoRig(this.yawSnap, this.pitchWas || 36 * DEG);
    this.barK = 0;
    this.tween(0.5, (k) => { this.shadeA = 1 - ease(k); });
    this.finish();
  }

  private finish() {
    if (this.phase === 'done') return;
    this.phase = 'done';
    const g = this.g, p = this.p;
    if (this.watchUp) { try { (G.watch as { toggle?: (v: boolean) => void })?.toggle?.(false); } catch { /* */ } }
    this.disposeWall();
    this.eyeOff();
    this.disposeFp();
    if (this.claimed) { fpRelease('arrival'); this.claimed = false; const oc = fpCamera(); oc.fov = this.fovWas; oc.updateProjectionMatrix(); }
    if (this.chute) { this.chute.dispose(); this.chute = null; }
    if (this.pack) { this.pack.removeFromParent(); this.pack = null; }
    if (this.packItem || !p.worn.get('back')) { givePack(p, this.packItem); this.packItem = null; }
    this.ensureMission();
    this.clearPose();
    p.full = '';
    p.vx = p.vz = 0;
    p.y = g.getZone(p.zoneKey).heightAt(p.tileX(), p.tileY());
    const h = G.handler;
    if (h) { h.cine = false; h.beamFromBand = false; h.briefed = true; h.scripted = false; }
    if (this.seamFx) this.seamFx.calm = false;
    if (this.seam && !this.seam.state.sealed) this.seamFx?.setState(this.seam, true);
    G.hudBody?.setHidden?.('arrival', false);
    (g as unknown as { touch?: { setHidden?: (v: boolean) => void } }).touch?.setHidden?.(false);
    document.body.classList.remove('noclip-cine');
    G.input.pointerOverUI = false;
    this.camOn = false;
    g.camera.pushIn(0, 0.8);
    for (const off of this.offs.splice(0).reverse()) { try { off(); } catch (e) { console.error(e); } }
    G.audio?.positionalLoop?.('arv:slide', null); G.audio?.positionalLoop?.('arv:drone', null);
    // the picture fades back in over the world, then the dom goes
    const root = this.root, plate = this.plate;
    const shade = this.shade, a0 = this.shadeA;
    if (a0 > 0.02) {
      const t0 = performance.now();
      const step = () => { const k = (performance.now() - t0) / 450; shade.style.opacity = String(Math.max(0, a0 * (1 - k))); if (k < 1) requestAnimationFrame(step); else { plate.destroy(); root.remove(); } };
      requestAnimationFrame(step);
    } else { plate.destroy(); root.remove(); }
    queueMicrotask(() => { const i = g.systems.indexOf(this); if (i >= 0) g.systems.splice(i, 1); });
    // nobody else is going to start the handler's tutorial (a dev run, no intake)
    if (!g.systems.some((s) => s.name === 'intro')) h?.begin?.();
    if (import.meta.env.DEV) (window as unknown as { __arrival: Arrival | null }).__arrival = null;
    this.resolve();
  }

  // ================================================================== dev: jump around (screenshots)
  debugJump(phase: 'wall' | 'lobby', t = 0) {
    if (phase === 'lobby' && this.phase === 'wall') this.toLobby();
    const steps = Math.ceil(t / 0.05);
    for (let i = 0; i < steps; i++) this.update(0.05);
  }
}
void JW; void JH;
