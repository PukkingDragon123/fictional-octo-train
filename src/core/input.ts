// Keyboard / mouse input with per-frame edge detection and rebindable actions.
// On-screen controls (src/ui/touch) feed the same actions through press /
// release / tap and an analog move vector, so every system reads one path.

export type Action =
  | 'up' | 'down' | 'left' | 'right' | 'run' | 'sneak' | 'shove' | 'interact' | 'flashlight'
  | 'scanner' | 'inventory' | 'map' | 'reload' | 'shout' | 'camLeft' | 'camRight' | 'talk' | 'chat'
  | 'pause' | 'hot1' | 'hot2' | 'hot3' | 'hot4' | 'hot5' | 'rotate' | 'grab' | 'walkToggle' | 'craft' | 'sleep';

export const DEFAULT_BINDINGS: Record<Action, string[]> = {
  up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  run: ['ShiftLeft', 'ShiftRight'], sneak: ['ControlLeft', 'KeyC'], shove: ['Space'], interact: ['KeyE'],
  flashlight: ['KeyF'], scanner: ['Tab'], inventory: ['KeyI'], map: ['KeyM'], reload: ['KeyR'], shout: ['KeyQ'],
  camLeft: ['KeyZ'], camRight: ['KeyX'], talk: ['KeyV'], chat: ['Enter', 'KeyT'], pause: ['Escape'],
  hot1: ['Digit1'], hot2: ['Digit2'], hot3: ['Digit3'], hot4: ['Digit4'], hot5: ['Digit5'],
  rotate: ['KeyR'], grab: ['KeyG'], walkToggle: ['CapsLock'], craft: ['KeyB'], sleep: ['KeyZ'],
};

/** combined movement input: unit direction (x right, y forward) plus strength 0..1 */
export interface MoveAxis { x: number; y: number; mag: number; analog: boolean }

export class Input {
  keys = new Set<string>();
  pressed = new Set<string>();
  released = new Set<string>();
  mouseX = 0; mouseY = 0;
  mouseDown = [false, false, false];
  mousePressed = [false, false, false];
  mouseReleased = [false, false, false];
  mouseDownAt = [0, 0, 0];
  mouseDownPos: [number, number][] = [[0, 0], [0, 0], [0, 0]];
  wheel = 0;
  /** true when a DOM text field or a modal UI wants keyboard focus */
  textFocus = false;
  /** set by UI layers when the pointer is over interactive UI so the world ignores clicks */
  pointerOverUI = false;
  bindings: Record<Action, string[]> = JSON.parse(JSON.stringify(DEFAULT_BINDINGS));

  // ---- virtual controls (on-screen stick and buttons)
  /** analog stick, x right / y up (= camera forward), length 0..1 */
  stickX = 0; stickY = 0;
  /** sticky run (touch double-tap): any movement runs while set */
  runLatch = false;
  /** world point the on-screen attack button aims at; null when not aiming by touch */
  touchAim: { x: number; z: number } | null = null;
  private vHeld = new Set<Action>();
  private vHit = new Set<Action>();
  private vUp = new Set<Action>();
  private vPulse = new Set<Action>();

  private el: HTMLElement;

  constructor(el: HTMLElement) {
    this.el = el;
    window.addEventListener('keydown', (e) => {
      const t = e.target as HTMLElement;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if (typing) { this.textFocus = true; return; }
      this.textFocus = false;
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow') || (e.ctrlKey && e.code === 'KeyS')) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      this.released.add(e.code);
    });
    window.addEventListener('blur', () => { this.keys.clear(); this.mouseDown = [false, false, false]; this.releaseVirtual(); });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => { this.mouseX = e.clientX; this.mouseY = e.clientY; });
    el.addEventListener('mousedown', (e) => {
      const b = e.button === 2 ? 2 : e.button === 1 ? 1 : 0;
      this.mouseDown[b] = true; this.mousePressed[b] = true;
      this.mouseDownAt[b] = performance.now();
      this.mouseDownPos[b] = [e.clientX, e.clientY];
    });
    window.addEventListener('mouseup', (e) => {
      const b = e.button === 2 ? 2 : e.button === 1 ? 1 : 0;
      if (this.mouseDown[b]) this.mouseReleased[b] = true;
      this.mouseDown[b] = false;
    });
    el.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    try {
      const saved = localStorage.getItem('noclip.bindings');
      if (saved) Object.assign(this.bindings, JSON.parse(saved));
    } catch { /* storage unavailable */ }
  }

  saveBindings() { try { localStorage.setItem('noclip.bindings', JSON.stringify(this.bindings)); } catch { /* ignore */ } }

  down(a: Action): boolean {
    if (this.textFocus) return false;
    if (this.vHeld.has(a) || this.vPulse.has(a)) return true;
    for (const c of this.bindings[a]) if (this.keys.has(c)) return true;
    return false;
  }
  hit(a: Action): boolean {
    if (this.textFocus) return false;
    if (this.vHit.has(a)) return true;
    for (const c of this.bindings[a]) if (this.pressed.has(c)) return true;
    return false;
  }
  up(a: Action): boolean { if (this.vUp.has(a)) return true; for (const c of this.bindings[a]) if (this.released.has(c)) return true; return false; }
  keyHit(code: string) { return !this.textFocus && this.pressed.has(code); }

  /** on-screen button held down (acts like holding the bound key) */
  press(a: Action) { if (!this.vHeld.has(a)) this.vHit.add(a); this.vHeld.add(a); }
  /** on-screen button let go */
  release(a: Action) { if (this.vHeld.delete(a)) this.vUp.add(a); }
  /** on-screen button tapped: hit + down for one frame, up the frame after */
  tap(a: Action) { this.vHit.add(a); this.vPulse.add(a); }
  heldVirtual(a: Action) { return this.vHeld.has(a); }
  releaseVirtual() {
    for (const a of this.vHeld) this.vUp.add(a);
    this.vHeld.clear();
    this.stickX = this.stickY = 0;
    this.touchAim = null;
  }

  /**
   * Movement from the keyboard (digital, full strength) or the on-screen
   * stick (analog). Keys win when both are used.
   */
  moveAxis(): MoveAxis {
    let x = 0, y = 0;
    if (this.down('up')) y += 1;
    if (this.down('down')) y -= 1;
    if (this.down('left')) x -= 1;
    if (this.down('right')) x += 1;
    if (x || y) { const l = Math.hypot(x, y); return { x: x / l, y: y / l, mag: 1, analog: false }; }
    const m = this.textFocus ? 0 : Math.hypot(this.stickX, this.stickY);
    if (m < 1e-3) return { x: 0, y: 0, mag: 0, analog: false };
    return { x: this.stickX / m, y: this.stickY / m, mag: Math.min(1, m), analog: true };
  }

  /** A right/left click = press + release quickly without much movement */
  clicked(b: number, maxMs = 260): boolean {
    if (!this.mouseReleased[b]) return false;
    const dt = performance.now() - this.mouseDownAt[b];
    const [x, y] = this.mouseDownPos[b];
    return dt < maxMs && Math.abs(x - this.mouseX) + Math.abs(y - this.mouseY) < 8;
  }
  heldFor(b: number) { return this.mouseDown[b] ? performance.now() - this.mouseDownAt[b] : 0; }

  endFrame() {
    this.pressed.clear(); this.released.clear();
    this.mousePressed = [false, false, false]; this.mouseReleased = [false, false, false];
    this.wheel = 0;
    this.vHit.clear(); this.vUp.clear();
    for (const a of this.vPulse) this.vUp.add(a);
    this.vPulse.clear();
  }

  keyName(a: Action): string {
    const c = this.bindings[a][0] || '?';
    return c.replace('Key', '').replace('Digit', '').replace('Left', '').replace('Right', '');
  }
}
