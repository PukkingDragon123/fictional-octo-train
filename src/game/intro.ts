// The opening of a new contract run: the link.
//
// You are the operator at the Meridian Institute; the body in the backrooms is
// a unit (a prisoner of the Remittance Programme). Three beats:
//   link   the link suite (the prologue's set, src/game/prologue/set.ts, on the
//          intake's own cinematic stage, src/game/introKit/stage.ts): you are
//          strapped into the rig, your unit (this run's body, its own face)
//          slumped in the chair beside you under its crown; Dr. Calder at the
//          console: the crown comes down, the handshake runs on the CRTs, the
//          shock (a white flash, the body convulsing, static), black
//   wake   back to the world, through the unit's own eyes (src/fp/eye.ts): on
//          its back on the carpet of Level 0 under the fluorescent tubes, the
//          eyelids open, a blink, it gets up
//   tour   first person: Dr. Calder's hologram (src/game/handler.ts) unfolds
//          from the band in front of you and points at each control on the
//          screen in turn, read from the DOM where it really is (desktop or
//          touch): the body machine, the sanity brain, the watch, the pack,
//          the context buttons; each lit as she names it
// Then flag 'contract:intake', bus 'introDone', and the staged tutorial
// (src/game/tutorial) takes over with Calder walking you through the job.
//
// Shown once per new contract run (src/game/session.ts decides: not for loaded
// saves, co-op clients or free survival). The skip plate in the corner skips at
// any moment: Esc, a tap on it (a tap anywhere first wakes it), gamepad Start /
// Back / B. ?quick skips it, ?intro forces it.
import * as THREE from 'three';
import { G } from './G';
import type { Game, GameSystem } from './game';
import type { Player } from '../entities/player';
import type { Action } from '../core/input';
import type { PickTarget } from './picking';
import { bus } from '../core/events';
import { INTRO_ZONE } from '../world/gen/z_reality';
import { fpClaim, fpRelease, fpCamera, fpGroup } from '../fp/fp';
import { eyeEnter, eyeExit, eyeCamera } from '../fp/eye';
import { StageRender } from './introKit/stage';
import { stageMat } from './introKit/stageMat';
import { Subs } from './introKit/subs';
import { skipPlate, pollPadSkip, padConnected, type SkipPlate } from './introKit/skip';
import { animSupported, fallbackPose, overlay, clamp01 } from './cutPose';
import { letterTimes } from '../social/chipVoice';
import { LinkSet, LS } from './prologue/set';
import { calderRig } from './prologue/calder';
import { CALDER_VOICE } from './prologue/prologue';
import { debtorNumber } from './handler';
import { freshStart } from './tutorial/fresh';
import { startTutorial } from './tutorial/tutorial';
import { ensurePack } from './arrivalKit/pack';
import type { Researcher } from '../entities/researcher';
import './intro.css';

export { INTRO_ZONE };

type Phase = 'link' | 'wake' | 'tour' | 'done';
const DEG = Math.PI / 180;
const ease = (t: number) => { t = clamp01(t); return t * t * (3 - 2 * t); };
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
const noop = () => { /* scripted: the intro holds the unit */ };

/** Should a session that is about to start a fresh world play the intro? */
export function introWanted(mode: 'solo' | 'host' | 'client'): boolean {
  if (mode === 'client') return false;
  const q = new URLSearchParams(location.search);
  if (q.has('intro')) return q.get('intro') !== '0';
  return !q.has('quick');
}

/** Start the intro for a brand-new world; it ends with the unit standing in Level 0, Dr. Calder on its wrist. */
export function startIntro(g: Game, p: Player, spawn: [number, number]): Intro {
  const intro = new Intro(g, p, spawn);
  g.addSystem(intro);
  if (import.meta.env.DEV) (window as unknown as { __intro: Intro }).__intro = intro;
  return intro;
}

const CSS = `
.ix-hl { position: absolute; pointer-events: none; opacity: 0; transition: opacity .25s; }
.ix-hl.on { opacity: 1; animation: ix-hl-pulse 1.1s steps(4) infinite; }
.ix-hl i { position: absolute; width: 16px; height: 16px; border: 0 solid #ffe7a8; filter: drop-shadow(1px 0 0 #000) drop-shadow(-1px 0 0 #000) drop-shadow(0 1px 0 #000) drop-shadow(0 -1px 0 #000); }
.ix-hl i:nth-child(1) { left: 0; top: 0; border-left-width: 4px; border-top-width: 4px; }
.ix-hl i:nth-child(2) { right: 0; top: 0; border-right-width: 4px; border-top-width: 4px; }
.ix-hl i:nth-child(3) { left: 0; bottom: 0; border-left-width: 4px; border-bottom-width: 4px; }
.ix-hl i:nth-child(4) { right: 0; bottom: 0; border-right-width: 4px; border-bottom-width: 4px; }
.ix-hl b { position: absolute; left: 0; top: 100%; margin-top: 8px; white-space: nowrap; font-weight: 400; font-size: 16px; line-height: 16px; letter-spacing: 1px; color: #ffe7a8; text-shadow: var(--text-ink); }
.ix-hl.up b { top: auto; bottom: 100%; margin: 0 0 8px; }
.ix-hl.left b { left: auto; right: 0; text-align: right; }
@keyframes ix-hl-pulse { 50% { transform: scale(1.04); } }
.ix-root.tour { z-index: 120; }
.ix-visor { position: absolute; inset: -2vmax; pointer-events: none; opacity: 0; transition: opacity .8s;
  background: radial-gradient(ellipse 66% 62% at 50% 48%, transparent 72%, rgba(180, 200, 190, .14) 84%, rgba(16, 20, 18, .85) 98%); }
.ix-visor.on { opacity: 1; }
.ix-static { position: absolute; inset: 0; width: 100%; height: 100%; image-rendering: pixelated; opacity: 0; }
`;

interface Stop { key: string; label: string; line: string; rect: () => DOMRect | null; gesture?: 'point' | 'present' }

export class Intro implements GameSystem {
  name = 'intro';
  phase: Phase = 'link';
  /** seconds in this phase / in all */
  t = 0; T = 0;
  /** the HUD shows through the tour (the body HUD and the band read this) */
  get finished() { return this.phase === 'tour'; }
  private stage: StageRender | null = null;
  private set: LinkSet | null = null;
  private calder: Researcher | null = null;
  private cam = fpCamera();
  private camSave: { fov: number; near: number; far: number } | null = null;
  private look = { yaw: Math.PI - 0.95, pitch: -0.18 }; private mouse = { x: 0, y: 0 };
  private trauma = 0;
  private num: string;
  // her lines (our own floating type with her voice: the stage and the eye shots both)
  private q: { text: string; then?: () => void }[] = [];
  private lineT = -1; private lineDur = 0; private lineThen: (() => void) | undefined;
  private fired = new Set<number>();
  // the world end
  private pp: { name: string; t: number; dur: number; anim: boolean } | null = null;
  private stops: Stop[] = [];
  private stopI = -1;
  private hx = 0; private hz = 0;
  private faceYaw = 0;
  // world state to restore
  private missions: any = null;
  private missionsAt = -1;
  private offs: (() => void)[] = [];
  private inputOffs: (() => void)[] = [];
  // dom
  private root!: HTMLDivElement; private shade!: HTMLDivElement; private lidT!: HTMLDivElement; private lidB!: HTMLDivElement;
  private noise!: HTMLCanvasElement; private visor!: HTMLDivElement; private hl!: HTMLDivElement;
  private subs!: Subs; private plate!: SkipPlate;
  private shadeA = 1; private shadeGoal = 0; private lid = 1; private lidGoal = 1; private noiseA = 0;
  private touch: boolean;
  private skipHot = 0;

  constructor(public g: Game, public p: Player, public spawn: [number, number]) {
    this.num = debtorNumber(p);
    this.touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    // directives wait until the link is up (no quest chatter in the suite)
    const m = g.missions;
    if (m) { this.missions = m; this.missionsAt = g.systems.indexOf(m); if (this.missionsAt >= 0) g.systems.splice(this.missionsAt, 1); }
    // the unit waits where it will wake: the world loads behind the stage
    g.placePlayer(p, 'lobby', spawn[0], spawn[1], 0);
    this.faceYaw = this.openDir();
    p.facing = p.targetFacing = this.faceYaw;
    if (G.handler) { G.handler.scripted = true; G.handler.cine = true; }
    (g as any).touch?.setHidden?.(true);
    document.body.classList.add('noclip-cine');
    g.attract = noop;
    this.hookInput();
    this.hookBody();
    this.buildDom();
    this.claimStage();
    this.go('link');
  }

  // ================================================================== the stage (the link suite)
  private claimStage() {
    const g = this.g;
    fpGroup('intro');
    fpClaim('intro', 100, { cinematic: 'none', stage: true });
    const cam = this.cam;
    this.camSave = { fov: cam.fov, near: cam.near, far: cam.far };
    cam.fov = 62; cam.near = 0.03; cam.far = 60; cam.updateProjectionMatrix();
    g.pr.scene.visible = false;
    const st = this.stage = new StageRender(g.pr, cam);
    const root = new THREE.Group(); root.name = 'intro:suite';
    st.scene.add(root);
    const low = (g.pr as unknown as { quality?: string }).quality === 'low';
    st.low = low;
    // the unit in the chair beside you is this run's body
    this.set = new LinkSet(root, low, this.p.app);
    this.set.cuffK = this.set.cuffGoal = 1;
    this.set.doorK = this.set.doorGoal = 0;
    this.set.badge.visible = false;
    const c = this.calder = calderRig(stageMat({ rim: 1.15 }));
    c.root.position.set(2.3, 0, -8.6);
    root.add(c.root);
    st.setLook('wing', 0.05);
    st.bloom = 0.85; st.streak = 0.4; st.streakTint.setRGB(0.7, 0.85, 1); st.rays = 0.3; st.rayOn = true;
    st.nearBlur = 0.15; st.rack(2.2, 0.16);
  }
  private releaseStage() {
    if (!this.stage) return;
    fpRelease('intro');
    const cam = this.cam;
    if (this.camSave) { cam.fov = this.camSave.fov; cam.near = this.camSave.near; cam.far = this.camSave.far; cam.position.set(0, 0, 0); cam.quaternion.identity(); cam.updateProjectionMatrix(); }
    this.g.pr.scene.visible = true;
    this.calder?.dispose(); this.calder = null;
    this.set?.dispose(); this.set = null;
    this.stage.dispose(); this.stage = null;
  }

  // ================================================================== hooks
  private hookInput() {
    const g = this.g, inp = g.input as any;
    const own = Object.prototype.hasOwnProperty.call(inp, 'hit') ? inp.hit : undefined;
    const orig = inp.hit.bind(inp) as (a: Action) => boolean;
    inp.hit = (a: Action) => {
      if (a === 'pause') {
        const v = orig(a);
        const ui = g.ui;
        if (v && !(ui?.menuEl || ui?.readerEl || ui?.modal || ui?.inventory?.open)) { this.skip(); return false; }
        return v;
      }
      return false;
    };
    this.inputOffs.push(() => { if (own) inp.hit = own; else delete inp.hit; });
    // no walking, no running while the script holds the unit (the tour runs without attract: the HUD must show)
    const ownD = Object.prototype.hasOwnProperty.call(inp, 'down') ? inp.down : undefined;
    const origD = inp.down.bind(inp) as (a: Action) => boolean;
    inp.down = (a: Action) => (a === 'pause' ? origD(a) : false);
    this.inputOffs.push(() => { if (ownD) inp.down = ownD; else delete inp.down; });
    const ui = g.ui;
    if (ui) {
      const click = ui.onWorldClick, key = ui.onInteractKey;
      ui.onWorldClick = (_t: PickTarget, _b: number) => { /* scripted */ };
      ui.onInteractKey = () => { /* scripted */ };
      this.inputOffs.push(() => { ui.onWorldClick = click; ui.onInteractKey = key; });
    }
    // a tap brings the skip plate up; a tap on it skips
    const tap = (e: PointerEvent) => { if (this.phase === 'done' || this.plate.el.contains(e.target as Node)) return; this.skipHot = 2.6; this.plate.el.classList.add('hot'); };
    window.addEventListener('pointerdown', tap, true);
    this.offs.push(() => window.removeEventListener('pointerdown', tap, true));
    const mv = (e: PointerEvent) => { if (e.pointerType === 'mouse') { this.mouse.x = (e.clientX / innerWidth) * 2 - 1; this.mouse.y = (e.clientY / innerHeight) * 2 - 1; } };
    window.addEventListener('pointermove', mv, { passive: true });
    this.offs.push(() => window.removeEventListener('pointermove', mv));
  }
  /** the unit's rig in the world: poses on top of the animator (lying there, getting up) */
  private hookBody() {
    const p = this.p as any;
    const orig = p.updateVisual.bind(p) as (dt: number) => void;
    p.updateVisual = (dt: number) => {
      orig(dt);
      try {
        const s = this.pp;
        if (s && !s.anim) { s.t += dt; const ps = fallbackPose(s.name, clamp01(s.t / s.dur), this.T); if (ps) overlay(this.p.rig, ps, Math.min(1, s.t * 6)); }
        if (s && s.t >= s.dur + 0.05 && s.name !== 'prone') this.clearPose();
      } catch (e) { console.error('intro pose', e); }
    };
    this.offs.push(() => { delete p.updateVisual; });
  }
  private playPose(name: string, dur = 1) {
    const p = this.p as any;
    const anim = animSupported(name);
    this.pp = { name, t: 0, dur, anim };
    if (anim) { if (typeof p.playAnim === 'function') p.playAnim(name, dur); else { p.actionAnim = name; p.actionT = 0; p.actionDur = dur; } }
  }
  private clearPose() {
    const p = this.p as any;
    if (this.pp?.anim) { p.stopAnim?.(this.pp.name); if (p.actionAnim === this.pp.name) p.actionAnim = ''; }
    this.pp = null;
  }

  // ================================================================== dom
  private buildDom() {
    if (!document.getElementById('ix-tour-css')) { const s = document.createElement('style'); s.id = 'ix-tour-css'; s.textContent = CSS; document.head.appendChild(s); }
    const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string) => { const e = document.createElement(tag); e.className = cls; return e; };
    const root = this.root = el('div', 'ix-root');
    this.visor = el('div', 'ix-visor');
    this.noise = el('canvas', 'ix-static');
    this.lidT = el('div', 'ix-lid top'); this.lidB = el('div', 'ix-lid bot');
    this.shade = el('div', 'ix-shade');
    this.hl = el('div', 'ix-hl'); this.hl.innerHTML = '<i></i><i></i><i></i><i></i><b></b>';
    this.plate = skipPlate(() => this.skip(), 'Skip link');
    this.plate.setKey(this.touch ? '' : padConnected() ? 'Start' : 'Esc');
    this.plate.el.classList.add('on');
    this.plate.el.addEventListener('mouseenter', () => { G.input.pointerOverUI = true; });
    this.plate.el.addEventListener('mouseleave', () => { G.input.pointerOverUI = false; });
    root.append(this.visor, this.noise, this.lidT, this.lidB, this.hl, this.shade, this.plate.el);
    this.subs = new Subs(root);
    document.body.appendChild(root);
  }

  // ================================================================== the script
  private go(ph: Phase) {
    this.phase = ph; this.t = 0; this.fired.clear();
    const g = this.g, p = this.p;
    switch (ph) {
      case 'link':
        this.shadeA = 1; this.shadeGoal = 0; this.lid = 0; this.lidGoal = 0;
        this.say([`Morning, operator. Unit ${this.num} is prepped and strapped.`, 'Same as the induction. Do not brace.']);
        break;
      case 'wake': {
        this.releaseStage();
        this.noiseA = 0; this.shadeGoal = 0; this.shadeA = 0.4;
        this.lid = 1; this.lidGoal = 1;
        g.attract = noop;
        // on its back on the carpet, eyes on the ceiling tubes
        p.vx = p.vz = 0; p.speed = 0;
        p.facing = p.targetFacing = this.faceYaw;
        this.playPose('prone', 30);
        eyeEnter({ pitchDeg: -62, fov: 60 });
        this.visor.classList.add('on');
        // the kit: the band is on, the pack is on, the band's projector boots
        try { (G.band as any)?.fit?.(p, { silent: true }); } catch (e) { console.warn('band.fit', e); }
        try { ensurePack(p); } catch (e) { console.warn('pack', e); }
        freshStart(p);
        break;
      }
      case 'tour': {
        this.clearPose();
        g.attract = null;
        (g as any).touch?.setHidden?.(false);
        document.body.classList.remove('noclip-cine');
        this.root.classList.add('tour');
        this.visor.classList.remove('on');
        this.lid = this.lidGoal = 0; this.shadeGoal = 0;
        G.input.pointerOverUI = true;
        eyeEnter({ pitchDeg: 7, fov: 62 });
        try { (G.holo as any)?.boot?.(); } catch (e) { console.warn('holo.boot', e); }
        bus.emit('watchSignal', { from: 'CALDER', kind: 'handler', text: 'LINK UP' });
        const h = G.handler;
        // she stands in front of you, out of the band's beam
        const d = 1.75;
        this.hx = p.x + Math.cos(this.faceYaw) * d; this.hz = p.z + Math.sin(this.faceYaw) * d;
        if (h) { h.scripted = true; h.cine = true; h.beamFromBand = true; h.appear({ x: this.hx, z: this.hz }, 1.3); h.gesture('wave', 2.2); }
        this.stops = this.findStops();
        this.stopI = -1;
        this.say([`There you are. Welcome to Level 0, unit ${this.num}.`, 'I am on the band on your wrist. Let me show you the body before you walk it anywhere.'], () => this.nextStop());
        break;
      }
    }
  }

  update(dt0: number) {
    if (this.phase === 'done') return;
    const dt = Math.min(0.05, dt0);
    this.t += dt; this.T += dt;
    const pad = pollPadSkip();
    if (pad === 'skip') this.skip(); else if (pad === 'wake') { this.skipHot = 2.6; this.plate.el.classList.add('hot'); }
    if (this.skipHot > 0) { this.skipHot -= dt; if (this.skipHot <= 0) this.plate.el.classList.remove('hot'); }
    this.lines(dt);
    switch (this.phase) {
      case 'link': this.updLink(dt); break;
      case 'wake': this.updWake(dt); break;
      case 'tour': this.updTour(dt); break;
    }
    this.paint(dt);
  }
  private at(t: number, id: number, fn: () => void) { if (this.t >= t && !this.fired.has(id)) { this.fired.add(id); fn(); } }

  // ------------------------------------------------------------------ 1. the link suite
  private updLink(dt: number) {
    const set = this.set!, st = this.stage!, c = this.calder!, t = this.t;
    this.at(0.6, 1, () => { set.crownGoal = 1; this.sfx('cy_thunk', 0.5); });
    this.at(1.2, 2, () => { set.mode = 'link'; });
    this.at(6.4, 3, () => this.say(['Handshake. Three. Two.']));
    this.at(8.9, 4, () => {
      set.mode = 'shock'; this.subs.clear();
      st.pulse(2.6, 0xdff4ff, 1.1); st.impact(3.2);
      this.trauma = 1; this.noiseA = 1;
      this.sfx('band_shock', 0.9); this.sfx('cy_spark', 0.8); this.sfx('static_burst', 0.7);
    });
    if (t > 8.9 && t < 10.1) this.noiseA = Math.random() < 0.7 ? 1 : 0.4;
    this.at(10.1, 5, () => { this.noiseA = 0; this.shadeGoal = 1; this.shadeA = 1; this.sfx('heartbeat', 0.6); });
    if (t > 11.2) { this.go('wake'); return; }
    if (set.mode === 'link') set.linkK = Math.min(0.95, set.linkK + dt * 0.13);
    // Dr. Calder at the console, then turning to you
    c.root.rotation.y = lerp(-Math.PI / 2, -2.6, ease((t - 3) / 1.2));
    c.lookAt(t > 3 ? this.cam.position : v1.set(3.4, 1.2, -9.4));
    c.update(dt, { speed: 0, stance: 'stand', fidget: true });
    // the camera: strapped in, looking at your unit, then forward at her; the mouse leans the head a little
    this.trauma = Math.max(0, this.trauma - dt * 0.9);
    const tr = this.trauma * this.trauma;
    const sh = (s: number) => (Math.sin(this.T * 41 + s) + Math.sin(this.T * 27 + s * 2.3)) * 0.5 * tr;
    const k = ease((t - 3.4) / 1.6);
    const yaw = lerp(Math.PI - 0.95, Math.PI + 0.42, k) - this.mouse.x * 0.18;
    let pitch = lerp(-0.2, -0.06, k) - this.mouse.y * 0.1, roll = 0;
    if (set.mode === 'shock') { pitch += 0.35 * Math.sin(Math.min(1, (t - 8.9) * 3) * Math.PI) + sh(1) * 0.25; roll = sh(2) * 0.4; }
    const cam = this.cam;
    cam.position.set(LS.rigEye.x + sh(4) * 0.02, LS.rigEye.y + Math.sin(this.T * 1.5) * 0.004 + sh(5) * 0.02, LS.rigEye.z);
    cam.rotation.order = 'YXZ'; cam.rotation.set(pitch, yaw + sh(3) * 0.2, roll);
    cam.updateMatrixWorld();
    set.update(dt, cam);
    st.update(dt);
    st.rayAt.copy(set.fx.suite1?.at ?? v1.set(0, 3, -9));
    st.rack(t < 3.4 ? 1.9 : 1.6, 0.16, 3);
  }

  // ------------------------------------------------------------------ 2. awake in Level 0
  private updWake(dt: number) {
    const t = this.t, p = this.p;
    p.vx = p.vz = 0;
    p.facing = p.targetFacing = this.faceYaw;
    this.at(0.5, 1, () => { this.lidGoal = 0.55; this.sfx('breath', 0.6); });
    this.at(1.1, 2, () => { this.lidGoal = 1; });
    this.at(1.5, 3, () => { this.lidGoal = 0; this.say([`Unit ${this.num}. Can you hear me? Good. You are in.`, 'Up you get. Slowly. The legs are new to you.']); });
    this.at(3.4, 4, () => { this.clearPose(); this.playPose('get_up', 1.8); eyeEnter({ pitchDeg: 4, fov: 62 }); this.sfx('cloth', 0.4); });
    if (t > 5.6 && !this.q.length && this.lineT < 0) this.go('tour');
    if (t > 12) this.go('tour');
    G.input.stickX = G.input.stickY = 0;
  }

  // ------------------------------------------------------------------ 3. the tour of the controls
  private updTour(dt: number) {
    const p = this.p, h = G.handler;
    p.vx = p.vz = 0;
    p.facing = p.targetFacing = this.faceYaw;
    G.input.stickX = G.input.stickY = 0;
    G.input.pointerOverUI = true;
    const cam = eyeCamera();
    if (h) h.gaze = v2.copy(cam.position);
    // the lit control follows its element (layouts move: the HUD eases in, a phone rotates)
    const s = this.stops[this.stopI];
    if (s) this.placeHl(s);
    if (this.t > 70) this.finish();
    void dt;
  }
  private nextStop() {
    this.stopI++;
    // a control this screen does not show (no machine HUD, no touch buttons): on to the next
    while (this.stops[this.stopI] && !this.stops[this.stopI].rect()) this.stopI++;
    const s = this.stops[this.stopI];
    if (!s) {
      this.hl.classList.remove('on');
      G.handler?.gesture?.('nod', 1.3);
      this.say(['That is everything you need. I will talk you through the first job as you go.', 'Stand up straight. Somebody might be watching. Somebody always is.'], () => this.finish());
      return;
    }
    this.sfx('watchTick', 0.4);
    this.placeHl(s);
    this.hl.classList.add('on');
    (this.hl.lastChild as HTMLElement).textContent = s.label;
    // she points at it: a point in the air between you, along your line of sight to it on the screen
    const r = s.rect();
    const h = G.handler as unknown as { pointAt?: (v: THREE.Vector3, secs: number) => void; gesture?: (n: string, d: number) => void } | null;
    if (r && h?.pointAt) {
      const cam = eyeCamera();
      const nx = ((r.left + r.width / 2) / innerWidth) * 2 - 1, ny = -(((r.top + r.height / 2) / innerHeight) * 2 - 1);
      const w = v1.set(nx, ny, 0.5).unproject(cam).sub(cam.position).normalize().multiplyScalar(0.95).add(cam.position);
      h.pointAt(w.clone(), Math.max(2.6, letterTimes(s.line).dur + 0.8));
    } else h?.gesture?.('present', 2.4);
    this.say([s.line], () => this.nextStop());
  }
  private placeHl(s: Stop) {
    const r = s.rect();
    if (!r) { this.hl.style.visibility = 'hidden'; return; }
    this.hl.style.visibility = '';
    const pad = 6;
    this.hl.style.left = Math.round(r.left - pad) + 'px'; this.hl.style.top = Math.round(r.top - pad) + 'px';
    this.hl.style.width = Math.round(r.width + pad * 2) + 'px'; this.hl.style.height = Math.round(r.height + pad * 2) + 'px';
    this.hl.classList.toggle('up', r.bottom > innerHeight * 0.8);
    this.hl.classList.toggle('left', r.left > innerWidth * 0.6);
  }

  /** the controls, where they really are on this screen (desktop or touch) */
  private findStops(): Stop[] {
    const touch = document.documentElement.classList.contains('nc-touch') || this.touch;
    // (fixed-position HUD elements have no offsetParent: ask the style)
    const vis = (e: Element | null): e is HTMLElement => {
      if (!e) return false;
      const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
      return r.width > 4 && r.height > 4 && cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.05 && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight;
    };
    const union = (els: Element[]) => {
      const rs = els.filter(vis).map((e) => e.getBoundingClientRect());
      if (!rs.length) return null;
      const l = Math.min(...rs.map((r) => r.left)), t = Math.min(...rs.map((r) => r.top)), rr = Math.max(...rs.map((r) => r.right)), b = Math.max(...rs.map((r) => r.bottom));
      return new DOMRect(l, t, rr - l, b - t);
    };
    const btn = (label: string) => [...document.querySelectorAll('#nc-touch .nc-btn, .nc-btn')].find((e) => vis(e) && (e.textContent || '').trim().toUpperCase().startsWith(label)) ?? null;
    /** where the body HUD's own hit-test says a part is (the machine is drawn in WebGL: sample it) */
    const part = (kind: string) => () => {
      const hud = G.hudBody as unknown as { pickAt?: (x: number, y: number) => { kind: string | null } } | null;
      const ov = document.querySelector('canvas.bh-ov');
      if (!hud?.pickAt || !vis(ov)) return null;
      const R = ov.getBoundingClientRect();
      let l = Infinity, tp = Infinity, rr = -Infinity, b = -Infinity;
      for (let y = R.top; y < R.bottom + 120; y += 6) for (let x = R.left; x < R.right; x += 6) {
        let k: string | null = null;
        try { k = hud.pickAt(x, y).kind; } catch { return null; }
        if (k === kind) { l = Math.min(l, x); tp = Math.min(tp, y); rr = Math.max(rr, x); b = Math.max(b, y); }
      }
      return l < Infinity ? new DOMRect(l - 3, tp - 3, rr - l + 6, b - tp + 6) : null;
    };
    const cache = (f: () => DOMRect | null) => { let c: DOMRect | null = null, at = -1; return () => { const now = performance.now(); if (now - at > 500 || !c) { c = f() ?? c; at = now; } return c; }; };
    const stops: Stop[] = [
      { key: 'hud', label: 'THE BODY', line: 'This is the unit\'s body as the rig reads it. Heart, lungs, stomach. Keep them full and keep them beating.',
        rect: cache(() => union([...document.querySelectorAll('canvas.bh-ov, .bh-lab')])) },
      { key: 'brain', label: 'SANITY', line: 'The brain is its sanity, and yours. When it cracks, the link slips: the unit lags, drifts, does things on its own.',
        rect: cache(part('brain')) },
      { key: 'watch', label: touch ? 'WATCH' : 'WATCH · TAB', line: touch ? 'The watch. Jobs, the map, and the scanner for the inhabitants. Tap WATCH.' : 'The watch. Jobs, the map, and the scanner for the inhabitants. TAB raises it.',
        rect: cache(() => (touch ? btn('WATCH')?.getBoundingClientRect() ?? null : null) ?? part('watch')()) },
      { key: 'pack', label: touch ? 'PACK' : 'PACK · I', line: touch ? 'The pack. Everything you carry goes in there. Tap PACK.' : 'The pack. Everything you carry goes in there. Click it, or press I.',
        rect: cache(() => (touch ? btn('PACK')?.getBoundingClientRect() ?? null : null) ?? part('pack')()) },
    ];
    // the adaptive buttons (src/ui/hotbar/context.ts: a key strip on desktop, big buttons on touch), else the old touch cluster
    const CTX = '.ctx-touch .cx-btn, .ctx-desk, #nc-touch .nc-br .nc-btn';
    stops.push({ key: 'ctx', label: touch ? 'YOUR HANDS' : 'YOUR HANDS · E',
      line: touch ? 'These are its hands. Open, carry, push, scan. What they offer changes with what is in front of you.' : 'These are its hands. What it can do with whatever is in reach. E does the first one; right click and hold to get a grip.',
      rect: cache(() => union([...document.querySelectorAll(CTX)]) ?? (touch ? null : new DOMRect(innerWidth / 2 - 90, innerHeight / 2 + 40, 180, 60))) });
    return stops;
  }

  /** the most open way to face from the spawn: she needs room to stand in front of you */
  private openDir(): number {
    const g = this.g, p = this.p, z = g.getZone('lobby');
    let best = 0, bs = -1;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      let s = 0;
      let lx = Math.floor(p.x), ly = Math.floor(p.z);
      for (let d = 0.5; d <= 3.5; d += 0.5) {
        const x = Math.floor(p.x + Math.cos(a) * d), y = Math.floor(p.z + Math.sin(a) * d);
        if (!z.inb(x, y)) break;
        const idx = z.idx(x, y);
        if (!z.floor[idx] || z.solid[idx] === 1 || z.objectsAt(x, y).length) break;
        if (x !== lx && (z.wallW[z.idx(Math.max(x, lx), y)] || z.wallW[z.idx(Math.max(x, lx), ly)])) break;
        if (y !== ly && (z.wallN[z.idx(x, Math.max(y, ly))] || z.wallN[z.idx(lx, Math.max(y, ly))])) break;
        lx = x; ly = y; s++;
      }
      if (s > bs) { bs = s; best = a; }
    }
    return best;
  }

  // ------------------------------------------------------------------ her lines
  private say(lines: string[], then?: () => void) { lines.forEach((text, i) => this.q.push({ text, then: i === lines.length - 1 ? then : undefined })); }
  private lines(dt: number) {
    if (this.lineT >= 0) {
      this.lineT += dt;
      if (this.lineT >= this.lineDur) { this.lineT = -1; const f = this.lineThen; this.lineThen = undefined; f?.(); }
    }
    if (this.lineT < 0 && this.q.length) {
      const l = this.q.shift()!;
      const at = () => this.speakerAt();
      this.subs.show('DR. CALDER', l.text, { style: 'guard', shout: false, at, voice: CALDER_VOICE, hold: 1.1 });
      this.lineDur = letterTimes(l.text).dur + Math.max(0.8, Math.min(2.0, l.text.length * 0.028));
      this.lineT = 0; this.lineThen = l.then;
      this.calder?.say(this.lineDur * 0.85);
      if (this.phase === 'tour') (G.handler as unknown as { rig?: { talk: (s: number) => void } } | null)?.rig?.talk(this.lineDur * 0.85);
    }
  }
  /** where her lines hang: over her head on the stage, over her projection in the world */
  private speakerAt(): { x: number; y: number } | null {
    if (this.phase === 'link' && this.calder) { const h = this.calder.j.head.getWorldPosition(v2); h.y += 0.36; return this.project(h, this.cam); }
    if (this.phase === 'tour' && G.handler) { const r = (G.handler as unknown as { rig: Researcher }).rig; const h = r.j.head.getWorldPosition(v2); h.y += 0.4; return this.project(h, eyeCamera()); }
    return null;
  }
  private project(p: THREE.Vector3, cam: THREE.Camera) {
    const v = v1.copy(p).project(cam);
    if (v.z > 1 || v.z < -1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) return null;
    return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (0.5 - v.y * 0.5) * innerHeight };
  }

  private paint(dt: number) {
    this.subs.update(dt);
    this.shadeA += (this.shadeGoal - this.shadeA) * Math.min(1, dt * (this.shadeGoal > this.shadeA ? 6 : 1.4));
    this.shade.style.opacity = this.shadeA.toFixed(3);
    this.lid += (this.lidGoal - this.lid) * Math.min(1, dt * (this.lidGoal > this.lid ? 9 : 1.5));
    const lp = (this.lid * 50).toFixed(2) + '%';
    this.lidT.style.height = lp; this.lidB.style.height = lp;
    this.noise.style.opacity = this.noiseA.toFixed(2);
    if (this.noiseA > 0.01) {
      const c = this.noise, x = c.getContext('2d')!, W = Math.ceil(innerWidth / 4), H = Math.ceil(innerHeight / 4);
      if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
      const img = x.createImageData(W, H), d = img.data;
      for (let i = 0; i < d.length; i += 4) { const v = Math.random() * 255; d[i] = v; d[i + 1] = v; d[i + 2] = Math.min(255, v + 20); d[i + 3] = 255; }
      x.putImageData(img, 0, 0);
    }
  }
  private sfx(key: string, vol = 0.5) { G.audio?.flat?.(key, 'sfx', vol); }

  // ================================================================== skipping & the end
  skip() {
    if (this.phase === 'done') return;
    G.audio?.flat?.('static_burst', 'sfx', 0.3);
    this.finish();
  }

  finish() {
    if (this.phase === 'done') return;
    const g = this.g, p = this.p;
    this.phase = 'done';
    this.releaseStage();
    eyeExit();
    this.clearPose();
    for (const off of [...this.inputOffs.splice(0), ...this.offs.splice(0)]) { try { off(); } catch (e) { console.error(e); } }
    G.input.pointerOverUI = false;
    (g as any).touch?.setHidden?.(false);
    document.body.classList.remove('noclip-cine');
    g.attract = null;
    p.full = '';
    p.y = g.getZone(p.zoneKey).heightAt(p.tileX(), p.tileY());
    try { (G.band as any)?.fit?.(p, { silent: true }); } catch (e) { console.warn('band.fit', e); }
    try { ensurePack(p); } catch (e) { console.warn(e); }
    try { (G.holo as any)?.boot?.(); } catch { /* no band HUD */ }
    this.plate.destroy();
    this.subs.destroy();
    this.root.remove();
    const m = this.missions;
    queueMicrotask(() => {
      const i = g.systems.indexOf(this);
      if (i >= 0) g.systems.splice(i, 1);
      if (m && !g.systems.includes(m)) g.systems.splice(Math.max(0, Math.min(this.missionsAt, g.systems.length)), 0, m);
    });
    m?.set?.('contract:intake');
    freshStart(p);
    const h = G.handler as any;
    if (h) { h.scripted = false; h.cine = false; h.gaze = null; h.beamFromBand = false; h.briefed = true; }
    // the staged tutorial takes it from here (Dr. Calder walks you through the job)
    try { startTutorial(g); } catch (e) { console.warn('tutorial', e); }
    h?.begin?.();
    bus.emit('introDone', p);
    if (import.meta.env.DEV) (window as unknown as { __intro: Intro | null }).__intro = null;
  }

  // ================================================================== dev: jump around the script (screenshots)
  debugJump(phase: Phase, t = 0) {
    const run = (n: number) => { for (let i = 0; i < n; i++) this.update(0.05); };
    this.q.length = 0; this.lineT = -1;
    if (phase === 'done') { this.finish(); return; }
    if (phase !== 'link' && this.phase === 'link') this.go('wake');
    if (phase === 'tour') { this.go('tour'); eyeExit(); eyeEnter({ pitchDeg: 7, fov: 62 }); }
    if (t) run(Math.ceil(t / 0.05));
  }
}
void DEG; void wrap;
