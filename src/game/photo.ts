import type { Game } from './game';
import type { CameraController } from './camera';
import { clamp } from '../core/math';

const DEG = Math.PI / 180;
const PHOTO_PITCH_MIN = 16 * DEG, PHOTO_PITCH_MAX = 78 * DEG;
type FxMode = 'full' | 'clean' | 'raw';
const FX_LABEL: Record<FxMode, string> = { full: 'FULL', clean: 'CLEAN (no film)', raw: 'RAW (no realism)' };

const CSS = `
body.photo-mode > *:not(#view):not(.cam-photo-ui):not(.cam-photo-toast):not(.cam-photo-flash) { opacity: 0 !important; pointer-events: none !important; transition: opacity .2s; }
body.photo-mode #view { cursor: grab; }
body.photo-mode.photo-drag #view { cursor: grabbing; }
.cam-photo-ui { position: fixed; z-index: 9000; left: 50%; bottom: max(12px, env(safe-area-inset-bottom)); transform: translateX(-50%);
  display: flex; gap: 6px; align-items: center; flex-wrap: wrap; justify-content: center; max-width: calc(100vw - 24px);
  font: 13px/1.3 var(--font-mono, 'Share Tech Mono', monospace); color: var(--ph, #6dff8e); letter-spacing: .5px; pointer-events: auto; }
.cam-photo-ui .cpm-help { background: rgba(4, 10, 5, .78); border: 1px solid currentColor; padding: 5px 9px; text-align: center; }
.cam-photo-ui .cpm-help b { color: #fff; font-weight: normal; }
.cam-photo-ui button { font: inherit; color: inherit; background: rgba(4, 10, 5, .82); border: 1px solid currentColor; padding: 7px 12px; cursor: pointer; min-height: 36px; }
.cam-photo-ui button:hover, .cam-photo-ui button:focus-visible { background: rgba(40, 90, 50, .6); outline: none; }
.cam-photo-ui.min .cpm-help { display: none; }
.cam-photo-flash { position: fixed; inset: 0; z-index: 8999; background: #fff; opacity: .85; pointer-events: none; transition: opacity .35s ease-out; }
.cam-photo-toast { position: fixed; z-index: 9001; top: 14px; left: 50%; transform: translateX(-50%); font: 13px var(--font-mono, monospace); color: var(--ph, #6dff8e);
  background: rgba(4, 10, 5, .85); border: 1px solid currentColor; padding: 5px 10px; pointer-events: none; }
`;

/**
 * Photo mode (P): freezes play (solo; in co-op the world keeps running but
 * your survivor takes no input), hides every HUD element through a body
 * class, lets the camera fly free inside the zone, and captures the canvas
 * to a PNG download (or a new tab where downloads are blocked).
 *
 * Keys: WASD / arrows move, Q / E turn, Z / X quarter turn, wheel or + / -
 * zoom, PageUp / PageDown or R / F tilt, drag to orbit, right-drag to pan,
 * T cycles the effects, Space / Enter capture, H hides the help, Home
 * returns to your survivor, Esc / P exit. Touch: one finger pans, two
 * fingers pinch to zoom and twist to turn; on-screen buttons capture / exit.
 */
export class PhotoMode {
  active = false;
  private g: Game;
  private cam: CameraController;
  private ui: HTMLDivElement | null = null;
  private help: HTMLDivElement | null = null;
  private keys = new Set<string>();
  private saved: { yaw: number; pitch: number; px: number; paused: boolean } | null = null;
  private fxMode: FxMode = 'full';
  private ppm = 32;
  private drag: { id: number; x: number; y: number; btn: number } | null = null;
  private touches = new Map<number, { x: number; y: number }>();
  private pinch: { d: number; a: number; cx: number; cy: number } | null = null;
  private styleAdded = false;
  private lastUrl = '';

  constructor(g: Game, cam: CameraController) {
    this.g = g; this.cam = cam;
    // registered once, at game start, so these capture-phase listeners run before any UI layer's (they idle unless active)
    window.addEventListener('keydown', this.onKeyDown, true);
    window.addEventListener('keyup', this.onKeyUp, true);
    window.addEventListener('pointerdown', this.onPointerDown, true);
    window.addEventListener('pointermove', this.onPointerMove, true);
    window.addEventListener('pointerup', this.onPointerUp, true);
    window.addEventListener('pointercancel', this.onPointerUp, true);
    window.addEventListener('wheel', this.onWheel, { capture: true, passive: false });
    window.addEventListener('contextmenu', this.onContext, true);
    window.addEventListener('blur', this.onBlur);
    for (const t of ['mousedown', 'mouseup', 'mousemove', 'click', 'touchstart', 'touchmove', 'touchend'] as const) window.addEventListener(t, this.swallow, { capture: true, passive: false });
  }

  toggle() { if (this.active) this.exit(); else this.enter(); }

  enter() {
    if (this.active) return;
    const g = this.g, pr = g.pr;
    if (!g.view || !g.local) return;
    this.active = true;
    this.addStyle();
    this.saved = { yaw: this.cam.rig.yawGoal, pitch: this.cam.rig.pitchGoal, px: pr.pxSizeTarget, paused: g.paused };
    if (g.role === 'solo') g.paused = true;
    this.ppm = 1 / pr.pxSizeTarget;
    this.fxMode = 'full';
    this.applyFx();
    pr.hideOverlay = true;
    document.body.classList.add('photo-mode');
    // nothing held down carries into (or out of) photo mode
    const inp = g.input;
    inp.keys.clear(); inp.mouseDown = [false, false, false]; inp.releaseVirtual();
    this.keys.clear();
    this.buildUi();
  }

  exit() {
    if (!this.active) return;
    const g = this.g, pr = g.pr;
    this.active = false;
    document.body.classList.remove('photo-mode', 'photo-drag');
    this.ui?.remove(); this.ui = null;
    pr.hideOverlay = false;
    pr.clean = false;
    pr.setFxOverride(null, false);
    const s = this.saved;
    if (s) {
      if (g.role === 'solo') g.paused = s.paused;
      pr.pxSizeTarget = s.px;
      this.cam.setPhotoRig(s.yaw, s.pitch);
    }
    this.saved = null;
    const inp = g.input;
    inp.keys.clear(); inp.mouseDown = [false, false, false]; inp.wheel = 0;
    this.keys.clear(); this.touches.clear(); this.pinch = null; this.drag = null;
  }

  update(dt: number) {
    const g = this.g, pr = g.pr, z = g.view?.zone;
    const k = this.keys;
    // pan in camera space, speed scales with zoom
    let mx = 0, my = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) my += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) my -= 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
    const fast = k.has('ShiftLeft') || k.has('ShiftRight') ? 2.5 : 1;
    if (mx || my) {
      const sp = (lowSpan(pr) * 0.55) * fast * dt;
      this.pan(mx * sp, my * sp);
    }
    let turn = 0;
    if (k.has('KeyQ')) turn += 1;
    if (k.has('KeyE')) turn -= 1;
    if (turn) this.cam.setPhotoRig(this.cam.rig.yawGoal + turn * dt * 1.4, this.cam.rig.pitchGoal);
    let tilt = 0;
    if (k.has('KeyR') || k.has('PageUp')) tilt += 1;
    if (k.has('KeyF') || k.has('PageDown')) tilt -= 1;
    if (tilt) this.setPitch(this.cam.rig.pitchGoal + tilt * dt * 0.9);
    let zm = 0;
    if (k.has('Equal') || k.has('NumpadAdd')) zm += 1;
    if (k.has('Minus') || k.has('NumpadSubtract')) zm -= 1;
    if (zm) this.zoomBy(Math.exp(zm * dt * 1.4));
    pr.pxSizeTarget = 1 / this.ppm;
    if (z) {
      pr.target.x = clamp(pr.target.x, 0, z.W);
      pr.target.z = clamp(pr.target.z, 0, z.H);
    }
  }

  // ---------------------------------------------------------------- camera moves
  private pan(right: number, fwd: number) {
    const pr = this.g.pr;
    const rx = Math.cos(pr.yaw), rz = -Math.sin(pr.yaw), fx = -Math.sin(pr.yaw), fz = -Math.cos(pr.yaw);
    pr.target.x += rx * right + fx * fwd;
    pr.target.z += rz * right + fz * fwd;
  }
  private zoomBy(f: number) { this.ppm = clamp(this.ppm * f, 8, 96); }
  private setPitch(p: number) { this.cam.setPhotoRig(this.cam.rig.yawGoal, clamp(p, PHOTO_PITCH_MIN, PHOTO_PITCH_MAX)); }
  private home() {
    const p = this.g.local, pr = this.g.pr;
    if (p) pr.target.set(p.x, p.y, p.z);
  }

  private cycleFx() {
    this.fxMode = this.fxMode === 'full' ? 'clean' : this.fxMode === 'clean' ? 'raw' : 'full';
    this.applyFx();
    this.toast('EFFECTS: ' + FX_LABEL[this.fxMode]);
    this.refreshHelp();
  }
  private applyFx() {
    const pr = this.g.pr;
    pr.clean = this.fxMode !== 'full';
    pr.setFxOverride('high', this.fxMode === 'raw');
  }

  // ---------------------------------------------------------------- capture
  capture() {
    const g = this.g, pr = g.pr;
    // draw a fresh frame and read it back in the same task (the drawing buffer is not preserved)
    pr.render(0);
    const canvas = pr.renderer.domElement;
    const zone = (g.view?.zone.key || 'world').replace(/[^a-z0-9]+/gi, '');
    const d = new Date(), pad = (n: number) => String(n).padStart(2, '0');
    const name = `noclip-${zone}-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.png`;
    const deliver = (url: string) => {
      try {
        const a = document.createElement('a');
        a.href = url; a.download = name; a.rel = 'noopener';
        // inside our own bar so the capture-phase swallow lets the click through
        (this.ui ?? document.body).append(a); a.click(); a.remove();
        this.toast('SAVED ' + name);
      } catch {
        const w = window.open(url, '_blank');
        this.toast(w ? 'OPENED IN A NEW TAB' : 'CAPTURE BLOCKED BY THE BROWSER');
      }
    };
    try {
      canvas.toBlob((b) => {
        if (!b) { this.toast('CAPTURE FAILED'); return; }
        if (this.lastUrl) URL.revokeObjectURL(this.lastUrl);
        this.lastUrl = URL.createObjectURL(b);
        deliver(this.lastUrl);
      }, 'image/png');
    } catch {
      try { deliver(canvas.toDataURL('image/png')); } catch { this.toast('CAPTURE FAILED'); }
    }
    if (!document.documentElement.classList.contains('reduce-flash')) {
      const f = document.createElement('div'); f.className = 'cam-photo-flash';
      document.body.append(f);
      requestAnimationFrame(() => { f.style.opacity = '0'; });
      setTimeout(() => f.remove(), 420);
    }
    try { (g as any).audio?.flat?.('click', 'ui', 0.6, 1.4, 0, 0); } catch { /* optional */ }
  }

  // ---------------------------------------------------------------- input (capture phase: nothing reaches the game)
  private isUi(e: Event) { const t = e.target as Node | null; return !!(t && this.ui && this.ui.contains(t)); }
  private swallow = (e: Event) => { if (!this.active || this.isUi(e)) return; e.stopImmediatePropagation(); if (e.cancelable && e.type !== 'mousemove') e.preventDefault(); };
  private onContext = (e: Event) => { if (!this.active) return; e.preventDefault(); e.stopImmediatePropagation(); };
  private onBlur = () => { this.keys.clear(); this.drag = null; this.touches.clear(); this.pinch = null; };

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.active) return;
    const t = e.target as HTMLElement;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    e.stopImmediatePropagation();
    if (e.code !== 'F5' && e.code !== 'F12' && e.code !== 'F11') e.preventDefault();
    const first = !this.keys.has(e.code);
    this.keys.add(e.code);
    if (!first) return;
    switch (e.code) {
      case 'Escape': case 'KeyP': this.exit(); break;
      case 'Space': case 'Enter': case 'NumpadEnter': case 'KeyK': this.capture(); break;
      case 'KeyT': case 'KeyG': this.cycleFx(); break;
      case 'KeyH': this.ui?.classList.toggle('min'); break;
      case 'Home': case 'KeyC': this.home(); break;
      case 'KeyZ': this.cam.setPhotoRig(this.cam.rig.yawGoal + Math.PI / 2, this.cam.rig.pitchGoal); break;
      case 'KeyX': this.cam.setPhotoRig(this.cam.rig.yawGoal - Math.PI / 2, this.cam.rig.pitchGoal); break;
    }
  };
  private onKeyUp = (e: KeyboardEvent) => { if (!this.active) return; this.keys.delete(e.code); e.stopImmediatePropagation(); };

  private onWheel = (e: WheelEvent) => {
    if (!this.active || this.isUi(e)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (e.altKey || e.shiftKey) this.setPitch(this.cam.rig.pitchGoal - Math.sign(e.deltaY) * 3 * DEG);
    else this.zoomBy(Math.exp(-Math.sign(e.deltaY) * 0.12));
  };

  private onPointerDown = (e: PointerEvent) => {
    if (!this.active || this.isUi(e)) return;
    e.stopImmediatePropagation(); e.preventDefault();
    if (e.pointerType === 'touch') {
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.touches.size === 2) this.pinch = this.pinchState();
      return;
    }
    this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, btn: e.button };
    document.body.classList.add('photo-drag');
  };
  private onPointerMove = (e: PointerEvent) => {
    if (!this.active || this.isUi(e)) return;
    e.stopImmediatePropagation();
    const pr = this.g.pr;
    const mpp = pr.pxSize * pr.scale / pr.dpr; // metres per css px
    if (e.pointerType === 'touch') {
      const t = this.touches.get(e.pointerId);
      if (!t) return;
      const dx = e.clientX - t.x, dy = e.clientY - t.y;
      t.x = e.clientX; t.y = e.clientY;
      if (this.touches.size === 1) this.pan(-dx * mpp, dy * mpp / Math.max(0.3, Math.sin(pr.pitch)));
      else if (this.touches.size === 2 && this.pinch) {
        const s = this.pinchState();
        this.zoomBy(s.d / Math.max(1, this.pinch.d));
        let da = s.a - this.pinch.a;
        if (da > Math.PI) da -= Math.PI * 2; if (da < -Math.PI) da += Math.PI * 2;
        this.cam.setPhotoRig(this.cam.rig.yawGoal + da, this.cam.rig.pitchGoal);
        this.setPitch(this.cam.rig.pitchGoal + (s.cy - this.pinch.cy) * 0.004);
        this.pinch = s;
      }
      return;
    }
    const d = this.drag;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    d.x = e.clientX; d.y = e.clientY;
    if (d.btn === 2 || (d.btn === 0 && e.shiftKey)) this.pan(-dx * mpp, dy * mpp / Math.max(0.3, Math.sin(pr.pitch)));
    else {
      this.cam.setPhotoRig(this.cam.rig.yawGoal - dx * 0.006, this.cam.rig.pitchGoal);
      this.setPitch(this.cam.rig.pitchGoal + dy * 0.004);
    }
  };
  private onPointerUp = (e: PointerEvent) => {
    if (!this.active || this.isUi(e)) return;
    e.stopImmediatePropagation();
    if (e.pointerType === 'touch') {
      this.touches.delete(e.pointerId);
      this.pinch = this.touches.size === 2 ? this.pinchState() : null;
      return;
    }
    if (this.drag?.id === e.pointerId) { this.drag = null; document.body.classList.remove('photo-drag'); }
  };
  private pinchState() {
    const [a, b] = [...this.touches.values()];
    return { d: Math.hypot(b.x - a.x, b.y - a.y), a: Math.atan2(b.y - a.y, b.x - a.x), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
  }

  // ---------------------------------------------------------------- dom
  private addStyle() {
    if (this.styleAdded) return;
    this.styleAdded = true;
    const s = document.createElement('style');
    s.id = 'cam-photo-style';
    s.textContent = CSS;
    document.head.append(s);
  }
  private buildUi() {
    const ui = document.createElement('div');
    ui.className = 'cam-photo-ui';
    const help = document.createElement('div');
    help.className = 'cpm-help';
    this.help = help;
    const btn = (label: string, fn: () => void, tip: string) => {
      const b = document.createElement('button');
      b.textContent = label; b.title = tip;
      b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
      return b;
    };
    ui.append(help,
      btn('CAPTURE', () => this.capture(), 'Save a screenshot (Space)'),
      btn('FX', () => this.cycleFx(), 'Cycle effects (T)'),
      btn('?', () => ui.classList.toggle('min'), 'Show / hide help (H)'),
      btn('EXIT', () => this.exit(), 'Leave photo mode (Esc / P)'));
    document.body.append(ui);
    this.ui = ui;
    this.refreshHelp();
  }
  private refreshHelp() {
    if (!this.help) return;
    const touch = document.documentElement.classList.contains('nc-touch');
    this.help.innerHTML = touch
      ? `PHOTO MODE · drag <b>pan</b> · pinch <b>zoom</b> · twist <b>turn</b> · fx <b>${FX_LABEL[this.fxMode]}</b>`
      : `PHOTO MODE · <b>WASD</b> move · <b>drag</b> orbit · <b>right-drag</b> pan · <b>wheel</b> zoom · <b>Q/E</b> turn · <b>R/F</b> tilt · <b>T</b> fx: ${FX_LABEL[this.fxMode]} · <b>SPACE</b> capture · <b>H</b> help · <b>ESC</b> exit`;
  }
  private toast(text: string) {
    const t = document.createElement('div');
    t.className = 'cam-photo-toast'; t.textContent = text;
    document.body.append(t);
    setTimeout(() => t.remove(), 1800);
  }
}

/** world metres across the low-res frame */
function lowSpan(pr: Game['pr']) { return (pr.lowW + pr.margin * 2) * pr.pxSize; }
