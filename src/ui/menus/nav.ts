// Keyboard + gamepad focus navigation for the terminal menus. Every open
// screen pushes a FocusNav; only the top one listens. Arrows move the focus
// spatially between controls, Enter/Space (gamepad A) activates, Esc
// (gamepad B) goes back, Q/E (gamepad LB/RB) switch tabs. Keys a FocusNav
// handles never reach the game's own input.
import { sfx } from './sfx';

export interface NavOpts {
  onBack?: () => void;
  onTab?: (dir: -1 | 1) => void;
  /** focus the first control when pushed */
  autofocus?: boolean | HTMLElement;
  /** let printable keys through to the game (only Esc/arrows/Enter handled) */
  passive?: boolean;
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]):not([type=hidden]), select, textarea, [tabindex]:not([tabindex="-1"])';
const stack: FocusNav[] = [];

export class FocusNav {
  root: HTMLElement;
  opts: NavOpts;
  constructor(root: HTMLElement, opts: NavOpts = {}) {
    this.root = root;
    this.opts = opts;
    stack.push(this);
    ensureListeners();
    if (opts.autofocus) requestAnimationFrame(() => {
      const el = opts.autofocus instanceof HTMLElement ? opts.autofocus : this.items()[0];
      if (el && !root.contains(document.activeElement)) el.focus({ preventScroll: true });
    });
  }
  destroy() {
    const i = stack.indexOf(this);
    if (i >= 0) stack.splice(i, 1);
  }
  get active() { return stack[stack.length - 1] === this && this.root.isConnected; }

  items(): HTMLElement[] {
    return [...this.root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((e) => {
      if ((e as any).disabled || e.closest('[inert]')) return false;
      return e.offsetWidth > 0 && e.offsetHeight > 0 && getComputedStyle(e).visibility !== 'hidden';
    });
  }

  /** layout box relative to the root (ignores transforms, so opening animations don't confuse it) */
  private box(el: HTMLElement) {
    let x = 0, y = 0;
    let e: HTMLElement | null = el;
    while (e && (e === this.root || this.root.contains(e))) { x += e.offsetLeft; y += e.offsetTop; if (e === this.root) break; e = e.offsetParent as HTMLElement | null; }
    for (let p = el.parentElement; p && p !== this.root; p = p.parentElement) { x -= p.scrollLeft; y -= p.scrollTop; }
    const w = el.offsetWidth, h = el.offsetHeight;
    return { left: x, top: y, right: x + w, bottom: y + h, width: w, height: h };
  }

  /** spatial move: nearest control in the given direction (weighted towards the axis) */
  move(dx: number, dy: number) {
    const list = this.items();
    if (!list.length) return;
    const cur = document.activeElement as HTMLElement | null;
    if (!cur || !this.root.contains(cur) || !list.includes(cur)) { focusEl(list[0]); return; }
    const a = this.box(cur);
    const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    let best: HTMLElement | null = null, bestS = Infinity;
    for (const el of list) {
      if (el === cur) continue;
      const b = this.box(el);
      // edge-to-edge gaps so wide rows and narrow chips both behave
      const bx = b.left + b.width / 2, by = b.top + b.height / 2;
      const along = dx ? (dx > 0 ? b.left - a.right + a.width * 0.5 : a.left - b.right + a.width * 0.5) : (dy > 0 ? b.top - a.bottom + a.height * 0.5 : a.top - b.bottom + a.height * 0.5);
      const dirOk = dx ? (dx > 0 ? bx > ax + 2 : bx < ax - 2) : (dy > 0 ? by > ay + 2 : by < ay - 2);
      if (!dirOk) continue;
      const overlap = dx ? Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)) : Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
      const side = dx ? Math.abs(by - ay) : Math.abs(bx - ax);
      const s = Math.max(0, along) + side * (overlap > 0 ? 0.25 : 2.2) - overlap * 0.1;
      if (s < bestS) { bestS = s; best = el; }
    }
    if (!best) {
      // wrap vertically through the list order
      if (dy) best = dy > 0 ? list[0] : list[list.length - 1];
      else return;
      if (best === cur) return;
    }
    focusEl(best);
  }
}

function focusEl(el: HTMLElement) {
  el.focus({ preventScroll: false });
  el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  sfx('hover');
}

function top(): FocusNav | null {
  for (let i = stack.length - 1; i >= 0; i--) {
    const n = stack[i];
    if (n.root.isConnected) return n;
    stack.splice(i, 1);
  }
  return null;
}

let hooked = false;
function ensureListeners() {
  if (hooked) return;
  hooked = true;
  window.addEventListener('keydown', onKey, { capture: true });
  window.addEventListener('gamepadconnected', () => startPad());
  try { if ([...(navigator.getGamepads?.() || [])].some(Boolean)) startPad(); } catch { /* no gamepad api */ }
}

function onKey(e: KeyboardEvent) {
  const n = top();
  if (!n) return;
  const t = e.target as HTMLElement | null;
  const typing = !!t && (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'button'].includes((t as HTMLInputElement).type)) || t.isContentEditable);
  const range = !!t && t.tagName === 'INPUT' && (t as HTMLInputElement).type === 'range';
  const k = e.key;
  let handled = true;
  if (k === 'Escape') {
    if (typing) (t as HTMLElement).blur();
    else if (n.opts.onBack) { sfx('back'); n.opts.onBack(); }
  } else if (k === 'ArrowUp') n.move(0, -1);
  else if (k === 'ArrowDown') n.move(0, 1);
  else if (k === 'ArrowLeft') { if (typing || range) handled = false; else n.move(-1, 0); }
  else if (k === 'ArrowRight') { if (typing || range) handled = false; else n.move(1, 0); }
  else if ((k === 'q' || k === 'Q' || k === 'PageUp') && !typing && n.opts.onTab) n.opts.onTab(-1);
  else if ((k === 'e' || k === 'E' || k === 'PageDown') && !typing && n.opts.onTab) n.opts.onTab(1);
  else if (k === 'Enter' && typing && t.tagName === 'INPUT') { (t as HTMLElement).blur(); }
  else if ((k === 'Enter' || k === ' ') && t && n.root.contains(t) && !typing && t.tagName !== 'BUTTON' && t.getAttribute('role')) { e.preventDefault(); t.click(); }
  else if (k === 'Tab' || typing) handled = false;
  else handled = !n.opts.passive; // menu up: game hotkeys stay quiet
  if (!handled) return;
  e.stopPropagation();
  if (k.startsWith('Arrow') || k === 'Escape' || k === 'PageUp' || k === 'PageDown') e.preventDefault();
}

// ---------------------------------------------------------------- gamepad
let padOn = false;
const padPrev: Record<string, boolean> = {};
let repeatAt = 0;
function startPad() {
  if (padOn) return;
  padOn = true;
  const loop = () => {
    const pads = [...(navigator.getGamepads?.() || [])].filter(Boolean) as Gamepad[];
    if (!pads.length) { padOn = false; return; }
    const n = top();
    if (n) {
      const p = pads[0];
      const b = (i: number) => !!p.buttons[i]?.pressed;
      const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
      const dir = { up: b(12) || ay < -0.6, down: b(13) || ay > 0.6, left: b(14) || ax < -0.6, right: b(15) || ax > 0.6 };
      const now = performance.now();
      const edge = (k: string, v: boolean) => { const was = padPrev[k]; padPrev[k] = v; return v && !was; };
      for (const [k, v] of Object.entries(dir)) {
        const fresh = edge(k, v);
        if (fresh || (v && now > repeatAt)) {
          if (fresh) repeatAt = now + 380; else repeatAt = now + 110;
          if (k === 'up') n.move(0, -1); else if (k === 'down') n.move(0, 1); else if (k === 'left') n.move(-1, 0); else n.move(1, 0);
        }
      }
      if (edge('a', b(0))) (document.activeElement as HTMLElement | null)?.click();
      if (edge('b', b(1))) { if (n.opts.onBack) { sfx('back'); n.opts.onBack(); } }
      if (edge('lb', b(4))) n.opts.onTab?.(-1);
      if (edge('rb', b(5))) n.opts.onTab?.(1);
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
