import * as THREE from 'three';
import type { Game } from './game';
import type { Input } from '../core/input';
import { bus } from '../core/events';
import { clamp, clamp01, damp, lerp } from '../core/math';
import { PixelRenderer } from '../gfx/renderer';
import { itemDef } from '../items/item';
import { PhotoMode } from './photo';

const DEG = Math.PI / 180;
/** pitch range: steeper overhead .. lower, more dramatic (walls and cutaways are tuned across it) */
export const PITCH_MIN = 26 * DEG, PITCH_MAX = 56 * DEG, PITCH_DEFAULT = 36 * DEG;
const QUARTER = Math.PI / 2;

interface Shake { amp: number; t: number; dur: number; freq: number; seed: number }

/** Unity-style critically damped smoothing (ease in and out, no overshoot) */
function smoothDamp(cur: number, target: number, vel: { v: number }, time: number, dt: number) {
  const omega = 2 / Math.max(0.0001, time);
  const x = omega * dt;
  const e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = cur - target;
  const temp = (vel.v + omega * change) * dt;
  vel.v = (vel.v - omega * temp) * e;
  return target + (change + temp) * e;
}
/** smooth band-limited noise, roughly -1..1 */
function wobble(t: number, seed: number) {
  return Math.sin(t * 1.0 + seed) * 0.5 + Math.sin(t * 2.37 + seed * 1.7 + 1.3) * 0.3 + Math.sin(t * 5.13 + seed * 2.9 + 2.1) * 0.2;
}

/**
 * The game camera: follow with look-ahead and aim peek, smooth quarter-turn
 * orbit plus free orbit (middle mouse / Alt+drag), adjustable pitch, shake,
 * recoil and zoom punches, breathing sway under stress, cinematic push-ins
 * (death, waking up), speed zoom when driving, and photo mode (P).
 *
 * Public API (G.camera): shake(strength, seconds), punch(zoomAmount, seconds),
 * kick(dirX, dirZ, amount), pushIn(amount, seconds, pitchDeg), orbitBy(dYaw,
 * dPitch), endOrbit(), rotate(dir), setPitch(rad), photo.toggle().
 */
export class CameraController {
  readonly g: Game;
  readonly pr: PixelRenderer;
  readonly photo: PhotoMode;
  // ---- settings (Options -> PICTURE, GfxSettings in src/ui/menus/common.ts)
  shakeOn = true;
  shakeAmt = 1;
  peekOn = true;
  comfort = false;
  keepOrbit = false;

  // ---- rig
  yawGoal: number;
  pitchGoal = PITCH_DEFAULT;
  private yawVel = { v: 0 };
  private pitchVel = { v: 0 };
  private pxBase: number;
  private orbiting = false;
  private orbitFrom = '';
  private lastMX = 0; private lastMY = 0;
  /** peek follows the mouse only once it has actually moved (not a cursor parked at 0,0 on load) */
  private mouseMovedAt = -1e9;
  // follow
  private look = new THREE.Vector2();
  private peek = new THREE.Vector2();
  // effects
  private shakes: Shake[] = Array.from({ length: 6 }, () => ({ amp: 0, t: 1, dur: 1, freq: 1, seed: 0 }));
  private kickP = new THREE.Vector2();
  private kickV = new THREE.Vector2();
  private punchAmt = 0; private punchT = 1; private punchDur = 1;
  private push = 0; private pushGoal = 0; private pushRate = 0.2;
  /** a push-in requested from outside (intro, cutscenes) is held until pushIn(0) */
  private pushManual = false;
  private pushPitch = 0; private pushPitchGoal = 0;
  private pushYaw = 0;
  private stress = 0;
  private breathT = 0;
  private t = 0;
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();

  constructor(g: Game) {
    this.g = g;
    this.pr = g.pr;
    this.pr.externalRig = true;
    this.yawGoal = this.pr.yawTarget;
    this.pxBase = this.pr.pxSizeTarget;
    this.photo = new PhotoMode(g, this);
    try { this.comfort = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* ignore */ }
    window.addEventListener('mousemove', () => { this.mouseMovedAt = performance.now(); }, { passive: true });
    // middle-button drags must not start the browser's autoscroll
    g.pr.renderer.domElement.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });
    // Alt is a camera modifier: keep Firefox's menu bar from popping up on release
    window.addEventListener('keyup', (e) => { if (e.key === 'Alt' && this.orbitFrom) e.preventDefault(); });
    this.wireEvents();
  }

  applySettings(s: { shake?: boolean; shakeAmt?: number; peek?: boolean; comfort?: boolean; keepOrbit?: boolean }) {
    if (typeof s.shake === 'boolean') this.shakeOn = s.shake;
    if (typeof s.shakeAmt === 'number') this.shakeAmt = clamp(s.shakeAmt, 0, 1.5);
    if (typeof s.peek === 'boolean') this.peekOn = s.peek;
    if (typeof s.comfort === 'boolean') this.comfort = s.comfort;
    if (typeof s.keepOrbit === 'boolean') this.keepOrbit = s.keepOrbit;
  }

  /** effective shake multiplier from the settings */
  private get shakeMul() { return !this.shakeOn ? 0 : this.comfort ? 0.25 * this.shakeAmt : this.shakeAmt; }

  // ================================================================ public effects API
  /** screen shake: strength 0..1 (1 = heavy blow, ~7 px), fades out over `seconds`; freq < 1 rumbles, > 1 buzzes */
  shake(strength: number, seconds = 0.35, freq = 1) {
    const amp = strength * this.shakeMul;
    if (amp <= 0.001) return;
    let slot = this.shakes[0], least = Infinity;
    for (const s of this.shakes) {
      const left = s.t >= s.dur ? 0 : s.amp * (1 - s.t / s.dur);
      if (left < least) { least = left; slot = s; }
    }
    slot.amp = amp; slot.t = 0; slot.dur = Math.max(0.05, seconds); slot.freq = freq; slot.seed = Math.random() * 100;
  }

  /** zoom punch: positive pushes in (0.05 = 5% closer), negative pulls out; snaps in fast, eases back over `seconds` */
  punch(zoomAmount: number, seconds = 0.25) {
    if (this.comfort) zoomAmount *= 0.3;
    if (Math.abs(zoomAmount) < Math.abs(this.punchAmt * this.punchEnv())) return;
    this.punchAmt = clamp(zoomAmount, -0.4, 0.4); this.punchT = 0; this.punchDur = Math.max(0.06, seconds);
  }

  /** recoil / knock: shove the view along world (dirX, dirZ); amount ~0.1 (pistol) .. 0.6 (body slam); springs back */
  kick(dirX: number, dirZ: number, amount: number) {
    const l = Math.hypot(dirX, dirZ);
    if (l < 1e-5) return;
    const k = amount * 4.2 * (this.comfort ? 0.3 : 1) * (this.shakeOn ? 1 : 0.5);
    this.kickV.x += (dirX / l) * k; this.kickV.y += (dirZ / l) * k;
  }

  /**
   * Slow cinematic push-in (death, waking up, a reveal): zoom in by `amount`
   * (0.3 = 30% closer) and tilt the pitch by `pitchDeg` over `seconds`.
   * pushIn(0, seconds) eases back out.
   */
  pushIn(amount: number, seconds = 4, pitchDeg = 0) {
    this.pushManual = amount !== 0;
    this.autoPush(amount, seconds, pitchDeg);
  }
  private autoPush(amount: number, seconds: number, pitchDeg: number) {
    this.pushGoal = clamp(amount, -0.5, 0.6) * (this.comfort ? 0.4 : 1);
    this.pushPitchGoal = pitchDeg * DEG * (this.comfort ? 0.4 : 1);
    this.pushRate = 3 / Math.max(0.2, seconds);
  }

  /** quarter-turn: +1 clockwise (Z), -1 counter-clockwise (X); always animates smoothly */
  rotate(dir: number) {
    const base = this.orbiting ? this.pr.yaw : this.snapYaw(this.yawGoal);
    this.yawGoal = base + QUARTER * Math.sign(dir);
    this.pr.yawTarget = this.yawGoal;
  }

  /** free orbit (touch twist, gamepad stick...): radians of yaw and pitch; call endOrbit() when the gesture ends */
  orbitBy(dYaw: number, dPitch = 0) {
    this.orbiting = true; this.orbitFrom = this.orbitFrom || 'api';
    this.yawGoal += dYaw;
    this.pitchGoal = clamp(this.pitchGoal + dPitch, PITCH_MIN, PITCH_MAX);
    this.pr.yawTarget = this.yawGoal;
  }
  endOrbit() {
    this.orbiting = false; this.orbitFrom = '';
    if (!this.keepOrbit) this.yawGoal = this.snapYaw(this.yawGoal);
    this.pr.yawTarget = this.yawGoal;
  }

  setPitch(rad: number) { this.pitchGoal = clamp(rad, PITCH_MIN, PITCH_MAX); }
  /** step the pitch: +1 steeper, -1 lower */
  tilt(steps: number) { this.setPitch(this.pitchGoal + steps * 4 * DEG); }

  /** nearest diagonal (the views the art is drawn for) */
  snapYaw(y: number) { return Math.round((y - Math.PI / 4) / QUARTER) * QUARTER + Math.PI / 4; }

  /** instantly drop all transient motion (zone change, teleports) */
  settle() {
    this.kickP.set(0, 0); this.kickV.set(0, 0);
    this.look.set(0, 0); this.peek.set(0, 0);
    for (const s of this.shakes) s.t = s.dur;
    this.punchT = this.punchDur;
  }

  // ================================================================ input (called from Game.controlLocal)
  handleInput(inp: Input) {
    const over = inp.pointerOverUI;
    if (inp.hit('camLeft')) this.rotate(1);
    if (inp.hit('camRight')) this.rotate(-1);
    if (inp.keyHit('PageUp')) this.tilt(1);
    if (inp.keyHit('PageDown')) this.tilt(-1);
    const alt = inp.keys.has('AltLeft') || inp.keys.has('AltRight');
    if (inp.wheel && !over) {
      if (alt) this.tilt(-Math.sign(inp.wheel));
      else this.g.zoomCamera(-Math.sign(inp.wheel));
    }
    // free orbit: hold the middle button, or Alt + left drag
    const mid = inp.mouseDown[1], altDrag = alt && inp.mouseDown[0];
    if (!this.orbiting && !over && ((mid && inp.mousePressed[1]) || (altDrag && inp.mousePressed[0]))) {
      this.orbiting = true; this.orbitFrom = mid ? 'mid' : 'alt';
      this.lastMX = inp.mouseX; this.lastMY = inp.mouseY;
    }
    if (this.orbiting && (this.orbitFrom === 'mid' || this.orbitFrom === 'alt')) {
      const held = this.orbitFrom === 'mid' ? mid : inp.mouseDown[0];
      if (!held) this.endOrbit();
      else {
        const dx = inp.mouseX - this.lastMX, dy = inp.mouseY - this.lastMY;
        this.lastMX = inp.mouseX; this.lastMY = inp.mouseY;
        this.yawGoal -= dx * 0.0065;
        this.pitchGoal = clamp(this.pitchGoal + dy * 0.004, PITCH_MIN, PITCH_MAX);
        this.pr.yawTarget = this.yawGoal;
      }
    }
    if (inp.keyHit('KeyP') && !this.g.ui?.blocksMovement?.() && !document.querySelector('.t-pause')) this.photo.enter();
  }

  // ================================================================ events -> camera motion
  private wireEvents() {
    const local = () => this.g.local;
    bus.on('noise', (n: any) => {
      const p = local();
      if (!p || !n || n.zone !== p.zoneKey) return;
      const d = Math.hypot((n.x ?? p.x) - p.x, (n.z ?? p.z) - p.z);
      const mine = n.by === p.id;
      switch (n.kind) {
        case 'gun': {
          if (mine) {
            const it = p.handR; const w = it ? itemDef(it.key).weapon as any : null;
            const heavy = clamp01(((w?.noise ?? 30) - 20) / 40);
            this.kick(-Math.cos(p.facing), -Math.sin(p.facing), 0.12 + heavy * 0.2);
            this.punch(0.025 + heavy * 0.03, 0.16);
            this.shake(0.12 + heavy * 0.18, 0.18, 1.6);
          } else if (d < 25) this.shake(0.12 * (1 - d / 25), 0.2, 1.4);
          break;
        }
        case 'crash': if (d < 30) { const k = 1 - d / 30; this.shake(0.9 * k, 0.7, 0.9); this.punch(-0.06 * k, 0.5); } break;
        case 'glass': if (d < 10) this.shake(0.12 * (1 - d / 10), 0.25, 1.5); break;
        case 'node': if (d < 70) { this.shake(0.55 * (1 - d / 70) + 0.15, 1.6, 0.45); this.punch(0.05, 1.2); } break;
        case 'power': case 'machine': if (d < 40 && n.radius >= 30) this.shake(0.25 * (1 - d / 40), 1.2, 0.5); break;
        case 'build': if (mine) this.shake(0.05, 0.12, 1.8); break;
        case 'melee': if (mine) this.kick(Math.cos(p.facing), Math.sin(p.facing), 0.05); break;
      }
    });
    bus.on('playerHit', (p: any, _part: string, _kind: string, h: any) => {
      if (p !== local()) return;
      const from = h?.from as [number, number] | undefined;
      if (from) this.kick(p.x - from[0], p.z - from[1], 0.25 + clamp01((h?.dmg ?? 10) / 40) * 0.3);
      this.punch(0.05, 0.3);
    });
    bus.on('creatureKilled', (c: any, killer: any) => {
      const p = local();
      if (!p || (killer !== p.id && killer !== p)) return;
      this.punch(0.04, 0.35);
      if (c && (c.radius ?? 0) > 0.6) this.shake(0.3, 0.4, 0.8);
    });
    bus.on('death', (p: any) => { if (p === local()) { this.pushManual = false; this.autoPush(0.34, 7, -7); } });
    bus.on('downed', (p: any) => { if (p === local() && !this.pushManual) this.autoPush(0.16, 3, -4); });
    bus.on('panicAttack', (p: any) => { if (p === local()) this.punch(0.06, 1.2); });
    bus.on('enterZone', () => { this.settle(); this.pxBase = this.pr.pxSizeTarget; });
  }

  // ================================================================ per frame
  update(dt: number) {
    const g = this.g, pr = this.pr;
    this.t += dt;
    if (this.photo.active) { this.photo.update(dt); this.applyRig(dt, 1, true); pr.camOffset.set(0, 0, 0); pr.updateCamera(dt); return; }
    const p = g.local;
    if (!p) { pr.updateCamera(dt); return; }
    const b = p.body;
    const inVeh = p.inVehicle ? (g as any).vehicles?.vehicles?.get?.(p.inVehicle) : null;
    const scripted = !!g.attract;
    // ---- body state: breathing, panic, injury
    const panic = clamp01((b.panic - 20) / 80), hurt = clamp01((55 - b.health) / 55);
    const stressGoal = b.dead ? 0 : Math.max(panic, hurt * 0.85, b.downed ? 0.7 : 0);
    this.stress = damp(this.stress, stressGoal, 1.5, dt);
    // ---- cinematic push: death / downed / lying down (waking up, sleeping)
    if (!this.pushManual) {
      // automatic pushes: dead and downed hold theirs; lying down (waking up, sleeping) leans in, standing up releases
      if (b.dead || b.downed) { /* keep */ }
      else if (p.full === 'lie') { if (this.pushGoal < 0.12) this.autoPush(0.18, 3, -5); }
      else if (this.pushGoal !== 0) this.autoPush(0, 2.5, 0);
    }
    this.push = damp(this.push, this.pushGoal, this.pushRate, dt);
    this.pushPitch = damp(this.pushPitch, this.pushPitchGoal, this.pushRate, dt);
    if (b.dead && !this.comfort) this.pushYaw += dt * 0.03;
    // ---- look-ahead (movement) and peek (cursor / aim)
    let lx = 0, lz = 0;
    if (inVeh) {
      const sp = inVeh.speed ?? 0;
      lx = Math.cos(inVeh.yaw) * sp * 0.45; lz = Math.sin(inVeh.yaw) * sp * 0.45;
    } else if (!scripted) {
      lx = p.vx * 0.42 + Math.cos(p.facing) * 0.3; lz = p.vz * 0.42 + Math.sin(p.facing) * 0.3;
    }
    const ll = Math.hypot(lx, lz), lmax = inVeh ? 6 : 2.2;
    if (ll > lmax) { lx *= lmax / ll; lz *= lmax / ll; }
    this.look.x = damp(this.look.x, lx, inVeh ? 1.8 : 2.6, dt);
    this.look.y = damp(this.look.y, lz, inVeh ? 1.8 : 2.6, dt);
    this.updatePeek(dt, scripted || !!inVeh || b.dead);
    // ---- follow
    const tx = p.x + this.look.x + this.peek.x, tz = p.z + this.look.y + this.peek.y;
    pr.target.x = damp(pr.target.x, tx, 10, dt);
    pr.target.z = damp(pr.target.z, tz, 10, dt);
    pr.target.y = damp(pr.target.y, p.y, 10, dt);
    // ---- zoom multiplier: driving pulls out, stress tightens, punches and push-ins
    let mul = 1;
    if (inVeh) mul *= 1 + clamp01(Math.abs(inVeh.speed ?? 0) / 14) * (this.comfort ? 0.2 : 0.42);
    mul *= 1 - this.stress * (this.comfort ? 0.03 : 0.1);
    mul *= 1 - this.push;
    mul *= 1 - this.punchAmt * this.punchEnv();
    this.punchT += dt;
    this.applyRig(dt, mul, false);
    // ---- transient offsets: shake, recoil, breathing sway
    this.updateOffsets(dt);
    pr.updateCamera(dt);
  }

  private punchEnv() {
    const t = this.punchT / this.punchDur;
    if (t >= 1) return 0;
    return t < 0.18 ? t / 0.18 : Math.pow(1 - (t - 0.18) / 0.82, 2);
  }

  private updatePeek(dt: number, off: boolean) {
    const g = this.g, p = g.local, pr = this.pr, inp = g.input;
    let px = 0, pz = 0;
    if (this.peekOn && !off && !g.ui?.scanner?.open) {
      let firearm = false, ranged = false;
      if (p.aiming && p.handR) { const w = itemDef(p.handR.key).weapon; firearm = w?.kind === 'firearm'; ranged = firearm || w?.kind === 'thrown'; }
      const ta = inp.touchAim;
      if (ta) {
        // touch aim: lean toward the locked target
        const k = firearm ? 0.4 : 0.22;
        px = (ta.x - p.x) * k; pz = (ta.z - p.z) * k;
      } else if (!inp.pointerOverUI && performance.now() - this.mouseMovedAt < 8000 && !document.documentElement.classList.contains('nc-touch')) {
        // cursor offset from the screen centre, on the ground plane (no feedback with the camera itself)
        const nx = clamp(inp.mouseX / innerWidth * 2 - 1, -1, 1), ny = clamp(1 - inp.mouseY / innerHeight * 2, -1, 1);
        const RW = pr.lowW + pr.margin * 2, RH = pr.lowH + pr.margin * 2;
        const hw = RW * pr.pxSize / 2, hh = RH * pr.pxSize / 2 / Math.max(0.3, Math.sin(pr.pitch));
        const rx = Math.cos(pr.yaw), rz = -Math.sin(pr.yaw);
        const fx = -Math.sin(pr.yaw), fz = -Math.cos(pr.yaw);
        const wx = rx * nx * hw + fx * ny * hh, wz = rz * nx * hw + fz * ny * hh;
        const k = p.aiming ? (firearm ? 0.36 : ranged ? 0.3 : 0.2) : 0.09;
        px = wx * k; pz = wz * k;
      }
      const max = (firearm ? 4.5 : p.aiming ? 2.6 : 1.1) * (this.comfort ? 0.5 : 1);
      const l = Math.hypot(px, pz);
      if (l > max) { px *= max / l; pz *= max / l; }
    }
    const rate = p.aiming ? 3.2 : 1.6;
    this.peek.x = damp(this.peek.x, px, rate, dt);
    this.peek.y = damp(this.peek.y, pz, rate, dt);
  }

  /** yaw / pitch / zoom animation into the renderer */
  private applyRig(dt: number, zoomMul: number, free: boolean) {
    const pr = this.pr;
    // someone set yawTarget directly (gallery, legacy code): follow it
    if (Math.abs(pr.yawTarget - this.yawGoal) > 1e-6) this.yawGoal = pr.yawTarget;
    const yawTime = this.orbiting || free ? 0.08 : this.comfort ? 0.32 : 0.24;
    pr.yaw = smoothDamp(pr.yaw, this.yawGoal + this.pushYaw, this.yawVel, yawTime, dt);
    if (Math.abs(pr.yaw - (this.yawGoal + this.pushYaw)) < 1e-4 && Math.abs(this.yawVel.v) < 1e-3) pr.yaw = this.yawGoal + this.pushYaw;
    const pitchGoal = free ? clamp(this.pitchGoal, 16 * DEG, 78 * DEG) : clamp(this.pitchGoal + this.pushPitch, PITCH_MIN - 6 * DEG, PITCH_MAX);
    pr.pitch = smoothDamp(pr.pitch, pitchGoal, this.pitchVel, 0.18, dt);
    pr.pitchTarget = pitchGoal;
    this.pxBase = damp(this.pxBase, pr.pxSizeTarget, 12, dt);
    pr.pxSize = this.pxBase * zoomMul;
  }

  private updateOffsets(dt: number) {
    const pr = this.pr, ps = pr.pxSize;
    // legacy trauma (combat, gore, creatures write pr.shake): smooth instead of white noise
    const legacy = pr.shake;
    pr.shake = Math.max(0, pr.shake - dt * 3);
    let sx = 0, sy = 0;
    const lt = this.t * 24;
    const la = legacy * 3.2 * this.shakeMul;
    if (la > 0.01) { sx += wobble(lt, 1.3) * la; sy += wobble(lt * 1.13, 7.1) * la; }
    for (const s of this.shakes) {
      if (s.t >= s.dur) continue;
      s.t += dt;
      const e = Math.pow(Math.max(0, 1 - s.t / s.dur), 2) * s.amp * 7;
      const tt = this.t * 26 * s.freq;
      sx += wobble(tt, s.seed) * e; sy += wobble(tt * 1.09, s.seed + 11) * e;
    }
    // breathing sway: barely there when calm, heaving when panicking or badly hurt
    const swayAmp = this.comfort ? 0 : 0.45 + this.stress * 3.2;
    this.breathT += dt * (0.32 + this.stress * 0.75) * Math.PI * 2;
    sx += Math.sin(this.breathT * 0.5 + 0.7) * swayAmp * 0.55;
    sy += Math.sin(this.breathT) * swayAmp;
    // recoil spring (world xz)
    const k = 150, c = 2 * Math.sqrt(k) * 0.8;
    this.kickV.x += (-k * this.kickP.x - c * this.kickV.x) * dt;
    this.kickV.y += (-k * this.kickP.y - c * this.kickV.y) * dt;
    this.kickP.x += this.kickV.x * dt; this.kickP.y += this.kickV.y * dt;
    // screen-space px -> world along the camera's right / up
    const cam = pr.camera;
    const R = this.tmp.setFromMatrixColumn(cam.matrixWorld, 0), U = this.tmp2.setFromMatrixColumn(cam.matrixWorld, 1);
    pr.camOffset.set(0, 0, 0).addScaledVector(R, sx * ps).addScaledVector(U, sy * ps);
    pr.camOffset.x += this.kickP.x; pr.camOffset.z += this.kickP.y;
  }

  /** dev / photo: current state */
  get pitchDeg() { return this.pr.pitch / DEG; }
  setPhotoRig(yawGoal: number, pitchGoal: number) { this.yawGoal = yawGoal; this.pitchGoal = pitchGoal; this.pr.yawTarget = yawGoal; }
  get rig() { return { yawGoal: this.yawGoal, pitchGoal: this.pitchGoal, pxTarget: this.pr.pxSizeTarget }; }
}

export { lerp };
