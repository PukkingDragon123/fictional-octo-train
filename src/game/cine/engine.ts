// The first-person cinematic engine (round 15, WORLD). A short scripted shot seen
// through the unit's own eyes: it claims the fp stage as a 'full' close-up (the dive
// and the blink into src/fp/eye.ts), so the world is drawn from the head bone and any
// arms only ever show through the eye camera; nothing floats over the iso view.
//
// A script is a generator that yields waits (like the arrival's): it walks and turns
// the unit, eases the eye (pitch, yaw, roll, a vertical dip, shake, the field of view
// in degrees), fades a black (or tinted) curtain, plays recorded samples, puts lines
// in the subtitle strip, and builds sets: small staged rooms (a lift car, a stair
// shaft, a duct) that are either seen together with the world, or ISOLATED (the eye
// then only sees the set's render layer, so the level cannot poke through it).
//
// Input is locked while it plays; Esc (the pause key), a gamepad Start / Back / B, or
// a tap on the skip plate (it wakes on any key or tap: no UI until asked) skips: the
// curtain drops, the script's skip handler puts the world into the end state (or hands
// over a short script of its own), and control comes back.
//
// Never under automation (navigator.webdriver) unless the URL says ?cine; ?nocine or
// localStorage 'noclip.cine' = '0' turn them off.
//
//   playCine(script, opts) -> Cine | null      (null: cinematics are off or one is running)
//   cineEnabled(), cineRunning()
import * as THREE from 'three';
import { G } from '../G';
import { bus } from '../../core/events';
import type { Player } from '../../entities/player';
import type { Action } from '../../core/input';
import { fpClaim, fpRelease, fpOwner } from '../../fp/fp';
import { eyeActive } from '../../fp/eye';
import { skipPlate, pollPadSkip, padConnected, type SkipPlate } from '../introKit/skip';

export type Wait = ((dt: number) => boolean) | null;
export type Script = Generator<Wait, void, unknown>;
/** the render layer of isolated sets */
export const SET_LAYER = 3;

export function cineEnabled(): boolean {
  if (typeof window === 'undefined' || typeof location === 'undefined') return false;
  let q: URLSearchParams;
  try { q = new URLSearchParams(location.search); } catch { return false; }
  if (q.has('nocine')) return false;
  if (q.has('cine') || q.has('cinetest')) return true;
  if ((navigator as unknown as { webdriver?: boolean }).webdriver) return false;
  try { if (localStorage.getItem('noclip.cine') === '0') return false; } catch { /* storage blocked */ }
  return true;
}

let current: Cine | null = null;
let seq = 0;
export function cineRunning(): Cine | null { return current; }

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

// ---------------------------------------------------------------- the curtain (one for every shot, so a hand-over stays black)
let curtain: HTMLDivElement | null = null;
let curtainA = 0;
function curtainEl(): HTMLDivElement {
  if (curtain && curtain.isConnected) return curtain;
  curtain = document.createElement('div');
  curtain.className = 'cine-curtain';
  // under the fp cut's bars (z 30), over the world and the HUD; the subtitle strip stays above it
  curtain.style.cssText = 'position:fixed;inset:0;z-index:29;pointer-events:none;background:#000;opacity:0';
  document.body.appendChild(curtain);
  return curtain;
}
function paintCurtain(a: number, col: string) {
  curtainA = a;
  const el = curtainEl();
  el.style.background = col;
  el.style.opacity = a.toFixed(3);
}
/** fade whatever curtain is left after a shot (the hand-back to play) */
function liftCurtain(secs = 0.45) {
  const el = curtainEl();
  const a0 = curtainA, t0 = performance.now();
  const step = () => {
    if (current) return; // a new shot owns it
    const k = clamp01((performance.now() - t0) / (secs * 1000));
    paintCurtain(a0 * (1 - k), el.style.background || '#000');
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ---------------------------------------------------------------- the eye on top of eye.ts
let camHooked = false;
const _q = new THREE.Quaternion();
function hookCam() {
  if (camHooked || !G.pr || !eyeActive()) return;
  camHooked = true;
  // pushed after eye.ts' own hook (it exists once the eye has been up), so this runs after it every frame
  G.pr.beforeRender.push(() => {
    const c = current, cam = G.pr.eyeCamera;
    if (!cam) return;
    if (!c) { if (cam.layers.mask !== 3) { cam.layers.set(0); cam.layers.enable(1); } return; }
    c.applyCam(cam);
  });
}

export interface CineOpts {
  name: string;
  /** the eye's rest pitch (deg below the horizon) */
  pitch?: number;
  /** start fully black (an arrival) */
  black?: boolean;
  /** keep G.transitioning up while it plays (nothing else walks the unit through a portal) */
  travel?: boolean;
  /** the subtitle strip's speaker for say() */
  who?: string;
  onEnd?: (c: Cine, skipped: boolean) => void;
}

interface Tween { t: number; dur: number; f: (k: number) => void; done?: () => void }

export class Cine {
  t = 0;
  done = false;
  skipped = false;
  /** the eye on top of eye.ts: forward / up / side offsets (m), pitch (deg, + looks down), yaw, roll (deg), shake (deg), fov (deg),
   *  height (m over the floor; -1 = the head bone's) */
  cam = { fwd: 0, dy: 0, side: 0, pitch: 0, yaw: 0, roll: 0, shake: 0, fov: 62, height: -1 };
  /** the curtain: 0 clear .. 1 covered, in this colour */
  black = 0;
  tint = '#000';
  /** only the sets' layer is seen */
  isolated = false;
  /** what a skip does: put the world in its end state, or return a short script to finish with */
  onSkip: (() => Script | void) | null = null;
  readonly p: Player;
  private script: Script | null = null;
  private wait: Wait = null;
  private tweens: Tween[] = [];
  private offs: (() => void)[] = [];
  private owned: THREE.Object3D[] = [];
  private skipping = -1;
  private plate: SkipPlate | null = null;
  private hot = 0;
  private claimed = false;
  private fovWas = 62;
  private sys = 'cine:' + (++seq);

  constructor(public opts: CineOpts, script: (c: Cine) => Script) {
    this.p = G.local;
    this.black = opts.black ? 1 : curtainA;
    this.lock();
    this.claim();
    this.script = script(this);
    G.addSystem({ name: this.sys, update: (dt: number) => this.update(dt) });
    bus.emit('cineStart', opts.name);
    if (import.meta.env.DEV) (window as unknown as { __cineNow: Cine }).__cineNow = this;
  }

  // ---------------------------------------------------------------- set-up
  private claim() {
    const g = G as unknown as { pr: { eyeFov: number } };
    this.fovWas = g.pr.eyeFov || 62;
    this.cam.fov = 62;
    this.claimed = fpClaim('cine', 92, { cinematic: 'full', eyePitch: this.opts.pitch ?? 6 });
  }
  private lock() {
    const g = G, p = this.p;
    p.actions.clear();
    p.vx = p.vz = 0;
    const inp = g.input as unknown as { hit: (a: Action) => boolean };
    const own = Object.prototype.hasOwnProperty.call(inp, 'hit');
    const prev = own ? inp.hit : undefined;
    const orig = inp.hit.bind(inp);
    inp.hit = (a: Action) => {
      if (a === 'pause') {
        const v = orig(a);
        const ui = g.ui as unknown as { menuEl?: unknown; readerEl?: unknown; modal?: unknown } | null;
        if (v && !(ui?.menuEl || ui?.readerEl || ui?.modal)) { this.skip(); return false; }
        return v;
      }
      return false;
    };
    this.offs.push(() => { if (prev) inp.hit = prev; else delete (inp as { hit?: unknown }).hit; });
    const attractWas = g.attract;
    g.attract = () => { /* the shot drives the unit */ };
    this.offs.push(() => { g.attract = attractWas; });
    const ui = g.ui;
    if (ui) {
      const click = ui.onWorldClick, key = ui.onInteractKey;
      ui.onWorldClick = () => { /* locked */ };
      ui.onInteractKey = () => { /* locked */ };
      this.offs.push(() => { ui.onWorldClick = click; ui.onInteractKey = key; });
    }
    if (this.opts.travel) { g.transitioning = true; this.offs.push(() => { g.transitioning = false; }); }
    const h = G.handler as unknown as { cine?: boolean; hush?: () => void } | null;
    if (h) { const was = !!h.cine; h.cine = true; this.offs.push(() => { h.cine = was; }); }
    G.hudBody?.setHidden?.('cine', true);
    this.offs.push(() => G.hudBody?.setHidden?.('cine', false));
    const touch = (g as unknown as { touch?: { setHidden?: (v: boolean) => void } }).touch;
    touch?.setHidden?.(true);
    this.offs.push(() => touch?.setHidden?.(false));
    document.body.classList.add('noclip-cine');
    this.offs.push(() => document.body.classList.remove('noclip-cine'));
    // the skip plate sleeps until a key or a tap wakes it (no UI unless asked)
    try {
      const pl = this.plate = skipPlate(() => this.skip(), 'Skip');
      pl.setKey(padConnected() ? 'Start' : matchMedia('(pointer: coarse)').matches ? '' : 'Esc');
      pl.el.style.zIndex = '64';
      pl.el.addEventListener('mouseenter', () => { G.input.pointerOverUI = true; });
      document.body.appendChild(pl.el);
      this.offs.push(() => pl.destroy());
    } catch (e) { console.warn('cine plate', e); }
    const wake = (e: Event) => { if (this.plate && e.target instanceof Node && this.plate.el.contains(e.target)) return; this.wake(); };
    window.addEventListener('pointerdown', wake, true);
    window.addEventListener('keydown', wake, true);
    this.offs.push(() => { window.removeEventListener('pointerdown', wake, true); window.removeEventListener('keydown', wake, true); });
    current = this;
  }
  private wake() { this.hot = 2.6; this.plate?.el.classList.add('on', 'hot'); }

  // ---------------------------------------------------------------- frame
  private update(dt0: number) {
    if (this.done) return;
    G.input.pointerOverUI = true;
    hookCam();
    const dt = Math.min(0.05, dt0);
    this.t += dt;
    const p = this.p;
    p.vx = p.vz = 0;
    if (p.body.dead) { this.end(true); return; }
    const pad = pollPadSkip();
    if (pad === 'skip') this.skip(); else if (pad === 'wake') this.wake();
    if (this.hot > 0) { this.hot -= dt; if (this.hot <= 0) this.plate?.el.classList.remove('on', 'hot'); }
    if (this.skipping >= 0) {
      this.skipping += dt0;
      this.black = Math.max(this.black, clamp01(this.skipping / 0.25));
      if (this.skipping >= 0.27) {
        this.skipping = -2;
        try { this.script?.return(); } catch { /* already done */ }
        this.script = null; this.wait = null; this.tweens.length = 0;
        let next: Script | void = undefined;
        try { next = this.onSkip?.() ?? undefined; } catch (e) { console.warn('cine skip', e); }
        this.onSkip = null;
        if (next) this.script = next; else { this.end(true); return; }
      }
    }
    for (const tw of [...this.tweens]) {
      tw.t += dt;
      const k = clamp01(tw.t / tw.dur);
      tw.f(k);
      if (k >= 1) { this.tweens.splice(this.tweens.indexOf(tw), 1); tw.done?.(); }
    }
    if (this.script) {
      let sdt = dt;
      while (this.script) {
        if (this.wait && !this.wait(sdt)) break;
        this.wait = null;
        let r: IteratorResult<Wait, void>;
        try { r = this.script.next(); } catch (e) { console.error('cine script', this.opts.name, e); r = { done: true, value: undefined }; }
        if (r.done) { this.script = null; this.end(this.skipped); return; }
        this.wait = r.value as Wait;
        sdt = 0;
      }
    }
    paintCurtain(clamp01(this.black), this.tint);
  }

  /** the eye camera, after eye.ts placed it */
  applyCam(cam: THREE.PerspectiveCamera) {
    const c = this.cam;
    const f = this.p.facing;
    cam.position.x += Math.cos(f) * c.fwd - Math.sin(f) * c.side;
    cam.position.z += Math.sin(f) * c.fwd + Math.cos(f) * c.side;
    // an absolute eye height over the floor (ducts: the crawl's head height, whatever the rig does)
    if (c.height >= 0) cam.position.y = (this.p.y ?? 0) + c.height + c.dy; else cam.position.y += c.dy;
    const D = Math.PI / 180;
    const sh = c.shake > 0 ? c.shake * D : 0;
    if (c.yaw || sh) cam.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), -c.yaw * D + (sh ? (Math.random() - 0.5) * sh : 0));
    if (c.pitch || sh) cam.rotateX(-c.pitch * D + (sh ? (Math.random() - 0.5) * sh : 0));
    if (c.roll) cam.rotateZ(c.roll * D);
    cam.updateMatrixWorld();
    void _q;
    (G.pr as unknown as { eyeFov: number }).eyeFov = c.fov;
    if (this.isolated) cam.layers.set(SET_LAYER);
    else { cam.layers.set(0); cam.layers.enable(1); }
  }

  // ---------------------------------------------------------------- script helpers
  /** wait this long */
  sleep(s: number): Wait { let t = 0; return (dt) => (t += dt) >= s; }
  /** wait for a condition (with a time limit) */
  until(fn: () => boolean, max = 30): Wait { let t = 0; return (dt) => fn() || (t += dt) >= max; }
  /** run f(k) 0..1 over dur seconds alongside the script */
  tween(dur: number, f: (k: number) => void, done?: () => void) { const tw = { t: 0, dur: Math.max(0.001, dur), f, done }; this.tweens.push(tw); f(0); return tw; }
  /** a tween the script waits for */
  tw(dur: number, f: (k: number) => void): Wait { let fin = false; this.tween(dur, f, () => { fin = true; }); return () => fin; }
  /** ease a cam field to a value */
  ease(field: keyof Cine['cam'], to: number, dur: number, curve: (t: number) => number = ease) {
    const from = this.cam[field];
    return this.tween(dur, (k) => { this.cam[field] = lerp(from, to, curve(k)); });
  }
  /** fade the curtain */
  fade(to: number, dur: number, tint?: string): Wait {
    if (tint) this.tint = tint;
    const from = this.black;
    return this.tw(dur, (k) => { this.black = lerp(from, to, k); });
  }
  /** turn the unit to a facing (rad) */
  face(yaw: number, dur: number) {
    const p = this.p, from = p.facing, d = wrap(yaw - from);
    return this.tween(dur, (k) => { p.facing = p.targetFacing = from + d * ease(k); });
  }
  /** walk the unit to (x, z) in the world (the gait plays from its speed) */
  walk(x: number, z: number, dur: number, gait = 1) {
    const p = this.p, x0 = p.x, z0 = p.z, d = Math.hypot(x - x0, z - z0);
    const zone = G.getZone(p.zoneKey);
    return this.tween(dur, (k) => {
      const e = k; // even pace; the gait carries the bob
      p.x = lerp(x0, x, e); p.z = lerp(z0, z, e);
      try { p.y = zone.heightAt(Math.floor(p.x), Math.floor(p.z)); } catch { /* keep y */ }
      p.speed = k >= 1 ? 0 : (d / dur) * gait;
    }, () => { p.speed = 0; });
  }
  /** a set into the scene, owned by the shot (on the world's layer and the set layer: an isolated eye still sees it) */
  add(o: THREE.Object3D) {
    o.traverse((q) => q.layers.enable(SET_LAYER));
    o.frustumCulled = false;
    o.traverse((q) => { q.frustumCulled = false; });
    G.pr.scene.add(o);
    this.owned.push(o);
    return o;
  }
  drop(o: THREE.Object3D | null | undefined) {
    if (!o) return;
    o.removeFromParent();
    const i = this.owned.indexOf(o);
    if (i >= 0) this.owned.splice(i, 1);
    disposeTree(o);
  }
  /** every set out of the scene */
  dropAll() { for (const o of [...this.owned]) this.drop(o); }
  sfx(key: string, vol = 1, rate = 1) { try { G.audio?.flat?.(key, 'sfx', vol, rate); } catch { /* audio optional */ } }
  /** a line in the subtitle strip (Calder by default) */
  say(text: string, who = this.opts.who ?? 'Dr. Calder', dur?: number) {
    bus.emit('subtitle', { who, text, dur: dur ?? Math.max(2.4, 1.6 + text.length * 0.055), style: who === this.p.name ? 'self' : 'radio', ...(who === this.p.name ? { pid: this.p.id } : {}) });
  }
  /** the unit's stance (crawl for ducts) */
  stance(s: 'stand' | 'crawl' | 'sneak') { (this.p as unknown as { stance: string }).stance = s; }
  /** is the eye up yet (the fp dive takes a moment) */
  eyeUp(): Wait { return this.until(() => eyeActive() || !this.claimed, 1.4); }

  // ---------------------------------------------------------------- ending
  skip() {
    if (this.done || this.skipping !== -1) return;
    this.skipped = true;
    this.skipping = 0;
  }
  /** finish now (the curtain lifts behind it) */
  end(skipped = false) {
    if (this.done) return;
    this.done = true;
    if (current === this) current = null;
    for (const o of this.owned.splice(0)) { o.removeFromParent(); disposeTree(o); }
    const p = this.p;
    p.speed = 0;
    if ((p as unknown as { stance: string }).stance === 'crawl' && !p.body.dead) this.stance('stand');
    for (const f of this.offs.splice(0).reverse()) { try { f(); } catch (e) { console.warn('cine off', e); } }
    (G.pr as unknown as { eyeFov: number }).eyeFov = this.fovWas;
    const cam = G.pr.eyeCamera;
    if (cam) { cam.layers.set(0); cam.layers.enable(1); }
    if (this.claimed && fpOwner() === 'cine') fpRelease('cine');
    // (out of the systems list after this frame's loop: no skipped neighbour)
    queueMicrotask(() => { const si = G.systems.findIndex((s) => s.name === this.sys); if (si >= 0) G.systems.splice(si, 1); });
    liftCurtain();
    try { this.opts.onEnd?.(this, skipped); } catch (e) { console.warn('cine end', e); }
    bus.emit('cineEnd', this.opts.name);
  }
}

export function disposeTree(o: THREE.Object3D) {
  o.traverse((q) => {
    const m = q as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (mat && !(mat as THREE.Material & { userData: { shared?: boolean } }).userData?.shared) (Array.isArray(mat) ? mat : [mat]).forEach((x) => x.dispose());
  });
}

/** start a shot (null when cinematics are off, the unit is not ours to drive, or one is playing) */
export function playCine(opts: CineOpts, script: (c: Cine) => Script): Cine | null {
  if (!cineEnabled() || current) return null;
  const p = G.local;
  if (!p || p.body.dead || p.inVehicle || !G.pr) return null;
  // somebody else's close-up holds the stage at a higher rank (surgery, a dialogue): no shot now
  const own = fpOwner();
  if (own && own !== 'cine' && /surgery|arrival|intro|dominion/.test(own)) return null;
  try { return new Cine(opts, script); } catch (e) { console.warn('cine', opts.name, e); current = null; return null; }
}
