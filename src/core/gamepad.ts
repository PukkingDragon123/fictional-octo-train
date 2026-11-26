// Controller play (the Gamepad API; Steam Input's "Gamepad" template and any XInput pad report the
// standard layout). The pad feeds the same actions as the keyboard (src/core/input.ts press / release),
// so every system reads one path. Menus keep their own pad handling (src/ui/menus/nav.ts): while a menu
// has the focus nothing here fires.
//
//   left stick  walk (analog)            right stick  aim (RT strikes toward it)
//   A interact · B crouch · X vault · Y grab · LB scan (hold) · RB suit lamp · LT sprint · RT use / strike
//   View: backpack (hold: survey map) · Menu: pause · L3 crawl · R3 shove
//   d-pad up / down: hotbar slot · d-pad left / right: turn the camera
//
// The last device used (keyboard and mouse, or pad) picks the glyphs on screen: Input.keyName() and the
// world prompts print "A" / "RB" while the pad is in use (html.pad-input), the key caps otherwise.
import { bus } from './events';
import type { Action, Input } from './input';

export type Device = 'kb' | 'pad';
let device: Device = 'kb';
export function inputDevice(): Device { return device; }
function setDevice(d: Device) {
  if (d === device) return;
  device = d;
  try { document.documentElement.classList.toggle('pad-input', d === 'pad'); } catch { /* no document */ }
  bus.emit('inputDevice', d);
}
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', () => setDevice('kb'), true);
  window.addEventListener('mousedown', () => setDevice('kb'), true);
  let mx = -1, my = -1;
  window.addEventListener('mousemove', (e) => { if (mx >= 0 && Math.abs(e.clientX - mx) + Math.abs(e.clientY - my) > 24) setDevice('kb'); mx = e.clientX; my = e.clientY; }, true);
}

/** standard-layout button index -> action (rebinding is keyboard-side; the pad layout is fixed and listed in Controls) */
export const PAD_BUTTONS: [number, Action, string][] = [
  [0, 'interact', 'A'], [1, 'sneak', 'B'], [2, 'jump', 'X'], [3, 'grab', 'Y'],
  [4, 'scan', 'LB'], [5, 'flashlight', 'RB'], [6, 'run', 'LT'], [7, 'primary', 'RT'],
  [9, 'pause', 'Menu'], [10, 'crawl', 'L3'], [11, 'shove', 'R3'],
  [14, 'camLeft', 'D-pad ←'], [15, 'camRight', 'D-pad →'],
];
/** the pad's other duties (not single actions) */
export const PAD_EXTRA: [string, string][] = [['Left stick', 'walk'], ['Right stick', 'aim'], ['View', 'backpack · hold: survey map'], ['D-pad ↑ ↓', 'hotbar slot']];
const GLYPH = new Map<Action, string>(PAD_BUTTONS.map(([, a, g]) => [a, g]));
GLYPH.set('inventory', 'View');
/** the pad glyph for an action ('' when the pad has none) */
export function padGlyph(a: Action): string { return GLYPH.get(a) ?? ''; }

/** checks that hand the pad to a screen with its own pad handling (menus: nav.ts; the backpack, the item panel: the game) */
const blockers: (() => boolean)[] = [];
export function setPadMenuCheck(fn: () => boolean) { blockers.push(fn); }
const menuOwns = () => { for (const f of blockers) { try { if (f()) return true; } catch { /* ignore */ } } return false; };
/** where the right stick aims, in world space (set by the game, which knows the camera and the unit) */
let aimAt: ((rx: number, ry: number) => { x: number; z: number } | null) | null = null;
export function setPadAim(fn: typeof aimAt) { aimAt = fn; }

const held = new Set<number>();
let stickOwned = false, aimOwned = false;
let viewAt = 0, viewMap = false;
let slot = 0;
const DZ = 0.22;

function key(code: string, type: 'keydown' | 'keyup') {
  try { window.dispatchEvent(new KeyboardEvent(type, { code, key: code.replace('Key', '').toLowerCase(), bubbles: true })); } catch { /* old browser */ }
}

/** read the first pad and feed the input (the game calls this at the top of every frame) */
export function pollGamepad(inp: Input) {
  let pads: (Gamepad | null)[] = [];
  try { pads = [...(navigator.getGamepads?.() || [])]; } catch { return; }
  const p = pads.find((x) => x && x.connected) ?? null;
  if (!p) { if (held.size || stickOwned) release(inp); return; }
  const btn = (i: number) => { const b = p.buttons[i]; return !!b && (b.pressed || b.value > 0.5); };
  let any = false;
  for (let i = 0; i < p.buttons.length; i++) if (btn(i)) { any = true; break; }
  const ax = p.axes[0] || 0, ay = p.axes[1] || 0, rx = p.axes[2] || 0, ry = p.axes[3] || 0;
  if (any || Math.hypot(ax, ay) > 0.5 || Math.hypot(rx, ry) > 0.5) setDevice('pad');
  if (menuOwns() || inp.textFocus) { if (held.size || stickOwned || aimOwned) release(inp); return; }
  // buttons
  for (const [i, a] of PAD_BUTTONS) {
    const on = btn(i);
    if (on && !held.has(i)) { held.add(i); inp.press(a); }
    else if (!on && held.has(i)) { held.delete(i); inp.release(a); }
  }
  // View: tap = backpack, hold = the survey map (its own key, M)
  const v = btn(8), now = performance.now();
  if (v && !held.has(8)) { held.add(8); viewAt = now; viewMap = false; }
  else if (v && !viewMap && now - viewAt > 480) { viewMap = true; key('KeyM', 'keydown'); key('KeyM', 'keyup'); }
  else if (!v && held.has(8)) { held.delete(8); if (!viewMap) inp.tap('inventory'); }
  // d-pad up / down: the hotbar slot
  for (const [i, d] of [[12, -1], [13, 1]] as const) {
    const on = btn(i);
    if (on && !held.has(i)) { held.add(i); slot = (slot + d + 5) % 5; inp.tap(('hot' + (slot + 1)) as Action); }
    else if (!on) held.delete(i);
  }
  // left stick: walking
  const m = Math.hypot(ax, ay);
  if (m > DZ) {
    const k = Math.min(1, (m - DZ) / (1 - DZ)) / m;
    inp.stickX = ax * k; inp.stickY = -ay * k; stickOwned = true;
  } else if (stickOwned) { inp.stickX = inp.stickY = 0; stickOwned = false; }
  // right stick: aim
  const r = Math.hypot(rx, ry);
  if (r > 0.35 && aimAt) { const w = aimAt(rx / r, -ry / r); if (w) { inp.touchAim = w; aimOwned = true; } }
  else if (aimOwned) { inp.touchAim = null; aimOwned = false; }
}
function release(inp: Input) {
  for (const [i, a] of PAD_BUTTONS) if (held.has(i)) inp.release(a);
  held.clear();
  if (stickOwned) { inp.stickX = inp.stickY = 0; stickOwned = false; }
  if (aimOwned) { inp.touchAim = null; aimOwned = false; }
}
