// The skip control for the intake: a stamped steel plate in the corner, drawn
// pixel by pixel (chamfered corners, a 1 px black outline, bevels, four
// rivets, brushed grain, a hazard sliver, a recessed key cap showing which
// key does it) at a low resolution and shown at an integer scale with
// image-rendering: pixelated. The words are EB Garamond, engraved into the
// plate (dark, with a light lip under them), not in a box.
// Keyboard: Esc. Touch / mouse: tap the plate. Gamepad: Start, Back or B.
import { PixelCanvas, mixHex } from '../../gfx/pixel';

const K = 0x070806;
const STEEL = [0x1c1e1a, 0x2a2d27, 0x3a3e36, 0x4d5248, 0x63695d, 0x7c8374, 0x979e8d, 0xb4baa8, 0xd2d6c6];
const HZ = { a: 0xe2b02a, hi: 0xffd768, lo: 0x9a7212, b: 0x17150f };
const W = 92, H = 22;

function hash(x: number, y: number) { let h = Math.imul(x * 374761393 + y * 668265263, 0x27d4eb2d); h ^= h >>> 15; return ((h >>> 0) % 1000) / 1000; }

/** the plate art: state 0 idle, 1 hot / hover, 2 pressed */
function plateArt(state: number, keyW: number): PixelCanvas {
  const pc = new PixelCanvas(W, H);
  pc.wrap = false;
  const lift = state === 1 ? 1 : 0, sink = state === 2 ? -1 : 0;
  const R = (i: number) => STEEL[Math.max(0, Math.min(STEEL.length - 1, i + lift + sink))];
  const c = 3; // chamfer
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && x + y >= c && (W - 1 - x) + y >= c && x + (H - 1 - y) >= c && (W - 1 - x) + (H - 1 - y) >= c;
  // body: brushed horizontal grain, a gentle top-to-bottom ramp
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!inside(x, y)) continue;
    const v = 4.6 - y / H * 1.6 + (hash(Math.floor(x / 5), y) - 0.5) * 0.9 + (hash(x, y) - 0.5) * 0.5;
    pc.set(x, y, R(Math.round(v)));
  }
  // outline and bevels
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!inside(x, y)) continue;
    const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
    if (edge) { pc.set(x, y, K); continue; }
    const tl = !inside(x - 2, y) || !inside(x, y - 2) || !inside(x - 1, y - 1);
    const br = !inside(x + 2, y) || !inside(x, y + 2) || !inside(x + 1, y + 1);
    if (tl) pc.set(x, y, R(7)); else if (br) pc.set(x, y, R(2));
  }
  // hazard sliver on the left
  for (let y = 3; y < H - 3; y++) for (let x = 3; x < 8; x++) pc.set(x, y, ((x + y) % 6) < 3 ? HZ.a : HZ.b);
  for (let y = 3; y < H - 3; y++) { pc.set(8, y, K); pc.set(3, y, mixHex(HZ.hi, HZ.a, (y % 6) < 3 ? 0 : 1)); }
  // rivets
  for (const [x, y] of [[11, 3], [W - 5, 3], [11, H - 5], [W - 5, H - 5]]) { pc.set(x, y, R(8)); pc.set(x + 1, y, R(5)); pc.set(x, y + 1, R(5)); pc.set(x + 1, y + 1, R(1)); pc.set(x + 1, y + 2, K); pc.set(x + 2, y + 1, K); }
  // scratches
  for (let i = 0; i < 9; i++) { const x = 12 + Math.floor(hash(i, 7) * (W - 30)), y = 4 + Math.floor(hash(i, 3) * (H - 8)); for (let k = 0; k < 3 + (i % 3); k++) pc.blend(x + k, y + (k > 2 ? 1 : 0), R(8), 0.5); }
  // the recessed key cap on the right
  if (keyW > 0) {
    const kx0 = W - 6 - keyW, ky0 = 5, kx1 = W - 7, ky1 = H - 6;
    for (let y = ky0 - 1; y <= ky1 + 1; y++) for (let x = kx0 - 1; x <= kx1 + 1; x++) pc.set(x, y, R(0));
    for (let y = ky0; y <= ky1; y++) for (let x = kx0; x <= kx1; x++) {
      const top = y === ky0, left = x === kx0, bot = y === ky1, right = x === kx1;
      pc.set(x, y, top || left ? 0xf1f2e8 : bot || right ? 0x7c7e71 : (y > ky1 - 2 ? 0xb0b2a4 : 0xdddfd2));
    }
    for (let x = kx0; x <= kx1; x++) pc.set(x, ky1 + 1, K);
    for (let y = ky0; y <= ky1 + 1; y++) pc.set(kx1 + 1, y, K);
  }
  return pc;
}

export interface SkipPlate { el: HTMLButtonElement; setKey(k: string): void; setState(s: number): void; destroy(): void }

/** build the plate (append `el` where it belongs); onSkip fires on a press */
export function skipPlate(onSkip: () => void): SkipPlate {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'ix-plate';
  el.setAttribute('aria-label', 'Skip the intake');
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  cv.className = 'ix-plate-art';
  const label = document.createElement('span');
  label.className = 'ix-plate-label';
  label.textContent = 'Skip intake';
  const key = document.createElement('span');
  key.className = 'ix-plate-key';
  el.append(cv, label, key);
  let keyText = '', state = 0;
  const keyW = () => (keyText ? Math.max(14, 6 + keyText.length * 5) : 0);
  const paint = () => {
    const pc = plateArt(state, keyW());
    const ctx = cv.getContext('2d');
    if (ctx) ctx.putImageData(pc.toImageData(), 0, 0);
    el.style.setProperty('--ix-kw', String(keyW()));
  };
  const scale = () => {
    const k = Math.max(2, Math.min(4, Math.round(Math.min(innerWidth, innerHeight * 1.6) / 560)));
    el.style.setProperty('--ix-k', String(k));
  };
  scale();
  addEventListener('resize', scale);
  el.addEventListener('pointerenter', () => { if (state !== 2) { state = 1; paint(); } });
  el.addEventListener('pointerleave', () => { state = 0; paint(); });
  el.addEventListener('pointerdown', (e) => { e.stopPropagation(); state = 2; paint(); });
  el.addEventListener('pointerup', () => { state = 1; paint(); });
  el.addEventListener('click', (e) => { e.stopPropagation(); onSkip(); });
  paint();
  return {
    el,
    setKey(k: string) { if (k === keyText) return; keyText = k; key.textContent = k; key.style.display = k ? '' : 'none'; paint(); },
    setState(s: number) { if (s === state) return; state = s; paint(); },
    destroy() { removeEventListener('resize', scale); el.remove(); },
  };
}

/** gamepad buttons that skip (Start, Back) and that wake the plate (any face button) */
const padPrev: boolean[] = [];
export function pollPadSkip(): 'skip' | 'wake' | null {
  let pads: (Gamepad | null)[] = [];
  try { pads = [...(navigator.getGamepads?.() || [])]; } catch { return null; }
  const p = pads.find(Boolean);
  if (!p) return null;
  let out: 'skip' | 'wake' | null = null;
  for (const i of [0, 1, 2, 3, 8, 9]) {
    const v = !!p.buttons[i]?.pressed, was = padPrev[i];
    padPrev[i] = v;
    if (v && !was) out = i === 8 || i === 9 || i === 1 ? 'skip' : out ?? 'wake';
  }
  return out;
}
export function padConnected(): boolean { try { return [...(navigator.getGamepads?.() || [])].some(Boolean); } catch { return false; } }
