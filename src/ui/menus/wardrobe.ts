// THE ISSUE STORE: the creator's wardrobe on a green phosphor terminal.
// Racks (jumpsuits, headwear, eyewear, face, neck, back) are words on the
// glass; every piece is a green-tinted pixel thumbnail you pick with the
// arrow keys, a gamepad or a tap. Every piece is free. Moving clacks the
// keyboard, wearing one types its file card out at the bottom.
import { COSMETICS, COS_SLOTS, COSMETIC, wornIn, setWorn, type CosSlot, type CosmeticDef } from '../../game/cosmetics';
import { PixelCanvas, bayer } from '../../gfx/pixel';
import { terminal, teletype, type Terminal } from './terminal';
import { plateBtn } from './btnKit';
import { uiSettings } from './settings';
import { sfx } from './sfx';

type WithCos = { cos?: string[] };
export interface WardrobeCtx {
  app: WithCos;
  /** a 3D render of a cosmetic (data URL, '' when there is none) */
  thumb: (key: string) => string;
  /** something was put on or taken off */
  onWear: (slot: CosSlot, key: string | null) => void;
  /** the rack changed / an item got focus (to move the camera) */
  onSlot?: (slot: CosSlot) => void;
  canWear?: () => boolean;
}
export interface Wardrobe {
  term: Terminal;
  el: HTMLElement;
  slot: CosSlot;
  setSlot: (s: CosSlot | 1 | -1, sound?: boolean) => void;
  refresh: () => void;
  contains: (n: Node | null) => boolean;
}

// ------------------------------------------------------------------ phosphor pixel art
const RAMPS = {
  green: [0x062412, 0x0f5226, 0x23943f, 0x5cdc7c, 0xc4ffd2],
  amber: [0x2a1704, 0x5a3408, 0xa8661a, 0xf0a848, 0xfff0c8],
};
const ramp = () => RAMPS[uiSettings().theme === 'amber' ? 'amber' : 'green'];
const urlOf = (pc: PixelCanvas) => { const c = document.createElement('canvas'); c.width = pc.w; c.height = pc.h; c.getContext('2d')!.putImageData(pc.toImageData(), 0, 0); return c.toDataURL(); };
const lumOf = (c: number) => (((c >> 16) & 255) * 0.3 + ((c >> 8) & 255) * 0.59 + (c & 255) * 0.11) / 255;

/** levels 0..4 (-1 empty) -> phosphor, with a dim outline ring and a faint glow round the shape */
function toPhosphor(N: number, lv: Int8Array): PixelCanvas {
  const R = ramp();
  const pc = new PixelCanvas(N, N); pc.wrap = false;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= N || y >= N ? -1 : lv[y * N + x]);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const v = at(x, y);
    if (v >= 0) { pc.set(x, y, R[Math.max(1, Math.min(4, v))]); continue; }
    let near = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (at(x + i, y + j) >= 0) near++;
    if (near) pc.set(x, y, R[0], 255);
    else {
      let far = 0;
      for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) if (at(x + i, y + j) >= 2) far++;
      if (far && bayer(x, y) < 0.5) pc.set(x, y, R[1], 60);
    }
  }
  return pc;
}

/** the jumpsuit, front on, arms hanging, in the suit's weave */
function suitArt(def: CosmeticDef): string {
  const N = 24, lv = new Int8Array(N * N).fill(-1);
  const base = lumOf(def.color) > 0.55 ? 3 : lumOf(def.color) > 0.3 ? 2 : 1;
  const set = (x: number, y: number, v: number) => { if (x >= 0 && y >= 0 && x < N && y < N) lv[y * N + x] = v; };
  for (let y = 1; y <= 22; y++) for (let x = 0; x < N; x++) {
    let part = '';
    // collar and shoulders
    if (y === 1 && x >= 10 && x <= 13) part = 'c';
    else if (y === 2 && x >= 8 && x <= 15) part = 't';
    else if (y >= 3 && y <= 12 && x >= 7 && x <= 16) part = 't';
    // arms hanging beside the body (a dark gap under the armpit)
    else if (y >= 3 && y <= 13 && (x === 5 || x === 6)) part = y === 3 && x === 5 ? '' : 'l';
    else if (y >= 3 && y <= 13 && (x === 17 || x === 18)) part = y === 3 && x === 18 ? '' : 'r';
    else if (y === 14 && (x === 5 || x === 6 || x === 17 || x === 18)) part = 'h';
    // seat and legs, a gap between them, a little flare at the cuffs
    else if (y >= 13 && y <= 14 && x >= 7 && x <= 16) part = 't';
    else if (y >= 15 && y <= 22 && ((x >= 7 - (y > 20 ? 1 : 0) && x <= 10) || (x >= 13 && x <= 16 + (y > 20 ? 1 : 0)))) part = 'g';
    if (!part) continue;
    let v = base;
    if (part === 'l' || (part !== 'r' && x <= 9)) v += 1;          // lit from the left
    if (part === 'r' || x >= 16) v -= 1;
    if (part === 'h') v = 3;                                       // hands
    if (part === 'c') v = base + 1;
    // the weave
    if (part !== 'h') {
      if (def.key === 'suit_stripe' && (y >> 1) % 2) v = 1;
      if (def.key === 'suit_hazard' && (part === 'g' || part === 'l' || part === 'r') && ((x + y) >> 1) % 2) v = 1;
      if (def.key === 'suit_circuit' && (x % 4 === 0 || y % 5 === 0)) v = 4;
    }
    set(x, y, Math.max(1, Math.min(4, v)));
  }
  // zip, collar notch, the number patch, the belt line, cuffs
  for (let y = 2; y <= 13; y++) set(12, y, 1);
  set(11, 1, 0); set(12, 1, 0); set(11, 2, 1);
  for (const [x, y] of [[8, 5], [9, 5], [10, 5], [8, 6], [10, 6]]) set(x, y, 4);
  set(9, 6, 2);
  for (let x = 7; x <= 16; x++) if (lv[11 * N + x] >= 0 && x !== 12) set(x, 11, Math.max(1, lv[11 * N + x] - 1));
  for (const x of [6, 7, 8, 9, 10, 13, 14, 15, 16, 17]) if (lv[22 * N + x] >= 0) set(x, 22, 1);
  return urlOf(toPhosphor(N, lv));
}

/** an empty wire hanger: "nothing" */
function hangerArt(): string {
  const N = 24, lv = new Int8Array(N * N).fill(-1);
  const p = (x: number, y: number, v = 3) => { if (x >= 0 && y >= 0 && x < N && y < N) lv[y * N + x] = v; };
  p(12, 5, 4); p(13, 5); p(14, 6); p(14, 7); p(13, 8); p(12, 9); p(12, 10);
  for (let i = 0; i <= 9; i++) { p(12 - i, 10 + Math.round(i * 0.55), 3); p(12 + i, 10 + Math.round(i * 0.55), 2); }
  for (let x = 3; x <= 21; x++) p(x, 16, x < 12 ? 3 : 2);
  return urlOf(toPhosphor(N, lv));
}

/** a 3D thumbnail, re-dithered into phosphor */
function phosphorize(src: string, done: (url: string) => void) {
  const im = new Image();
  im.onload = () => {
    const N = 24;
    const c = document.createElement('canvas'); c.width = N; c.height = N;
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = true;
    g.drawImage(im, 0, 0, N, N);
    const d = g.getImageData(0, 0, N, N).data;
    const lv = new Int8Array(N * N).fill(-1);
    let lo = 1, hi = 0;
    for (let i = 0; i < N * N; i++) if (d[i * 4 + 3] > 90) { const l = (d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11) / 255; lo = Math.min(lo, l); hi = Math.max(hi, l); }
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x;
      if (d[i * 4 + 3] <= 90) continue;
      let l = (d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11) / 255;
      l = (l - lo) / Math.max(0.05, hi - lo);
      const f = 1 + l * 3;
      let v = Math.floor(f);
      if (f - v > 0.35 + (bayer(x, y) - 0.5) * 0.5) v++;
      lv[i] = Math.min(4, v);
    }
    done(urlOf(toPhosphor(N, lv)));
  };
  im.src = src;
}

// ------------------------------------------------------------------ the store
const RACK: Record<CosSlot, string> = { suit: 'Jumpsuits', hat: 'Headwear', eyes: 'Eyewear', face: 'Face', neck: 'Neck', back: 'Back' };

export function wardrobe(ctx: WardrobeCtx): Wardrobe {
  const t = terminal({ title: 'Issue store', sub: 'every piece free · arrows pick · Q / E rack', cls: 'ik3-ward', model: 'Meridian · Stores' });
  const racks = document.createElement('div'); racks.className = 'wd-racks';
  racks.setAttribute('role', 'tablist');
  const grid = document.createElement('div'); grid.className = 'wd-grid';
  const card = document.createElement('div'); card.className = 'wd-card';
  const cardT = document.createElement('b'); const cardD = document.createElement('span');
  card.append(cardT, cardD);
  t.body.append(racks, grid);
  t.screen.querySelector('.ct-in')!.append(card);
  const slots = COS_SLOTS.map(([s]) => s).filter((s) => COSMETICS.some((c) => c.slot === s));
  let slot: CosSlot = slots[0];
  const rackBtns = new Map<CosSlot, HTMLButtonElement>();
  for (const s of slots) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'wd-rack'; b.textContent = RACK[s] || s;
    b.setAttribute('role', 'tab');
    b.addEventListener('click', () => setSlot(s));
    b.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse' && document.activeElement !== b) b.focus({ preventScroll: true }); });
    b.addEventListener('focus', () => sfx('type', 0.5));
    racks.append(b); rackBtns.set(s, b);
  }
  // the rack keys on the housing
  const prev = plateBtn('', () => setSlot(-1), { glyph: 'L', lamp: false, size: 'md', finish: 'cream', aria: 'Previous rack (Q)', sound: 'key', shape: 'key' });
  const next = plateBtn('', () => setSlot(1), { glyph: 'R', lamp: false, size: 'md', finish: 'cream', aria: 'Next rack (E)', sound: 'key', shape: 'key' });
  t.keys.append(prev, next);

  const art = new Map<string, string>();
  const thumbFor = (c: CosmeticDef | null, img: HTMLImageElement) => {
    const k = c ? c.key : 'none';
    const hit = art.get(k);
    if (hit) { img.src = hit; return; }
    if (!c) { const u = hangerArt(); art.set(k, u); img.src = u; return; }
    if (c.slot === 'suit') { const u = suitArt(c); art.set(k, u); img.src = u; return; }
    const src = ctx.thumb(c.key);
    if (!src) { const u = hangerArt(); img.src = u; return; }
    phosphorize(src, (u) => { art.set(k, u); img.src = u; });
  };
  let stopType: (() => void) | null = null;
  const showCard = (c: CosmeticDef | null, worn: boolean) => {
    stopType?.();
    cardT.textContent = (c ? c.name : 'Nothing') + (worn ? '  · worn' : '');
    stopType = teletype(cardD, c ? c.desc : 'Leave the hook empty.', 90);
  };
  const paint = () => {
    for (const [s, b] of rackBtns) { b.classList.toggle('on', s === slot); b.setAttribute('aria-selected', String(s === slot)); }
    const worn = wornIn(ctx.app, slot);
    grid.querySelectorAll<HTMLButtonElement>('.wd-it').forEach((b) => {
      const on = (b.dataset.k === 'none' ? !worn : worn === b.dataset.k);
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
  };
  const build = () => {
    grid.innerHTML = '';
    const list: (CosmeticDef | null)[] = [...(slot === 'suit' ? [] : [null]), ...COSMETICS.filter((c) => c.slot === slot)];
    list.forEach((c, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'wd-it';
      b.dataset.k = c ? c.key : 'none';
      const img = document.createElement('img'); img.alt = ''; img.draggable = false;
      const nm = document.createElement('span'); nm.textContent = c ? c.name : 'Nothing';
      b.append(img, nm);
      b.setAttribute('aria-label', (c ? c.name : 'Nothing') + (c ? ' — ' + c.desc : ''));
      b.style.animationDelay = i * 35 + 'ms';
      thumbFor(c, img);
      b.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse' && document.activeElement !== b) b.focus({ preventScroll: true }); });
      b.addEventListener('focus', () => { sfx('type', 0.7); showCard(c, b.classList.contains('on')); ctx.onSlot?.(slot); });
      b.addEventListener('click', () => {
        if (ctx.canWear && !ctx.canWear()) return;
        const cur = wornIn(ctx.app, slot);
        const k = c ? (cur === c.key && slot !== 'suit' ? null : c.key) : null;
        setWorn(ctx.app, slot, k);
        sfx('key'); setTimeout(() => sfx(k ? 'clamp' : 'back', 0.5), 60);
        paint();
        showCard(k ? COSMETIC.get(k)! : null, true);
        ctx.onWear(slot, k);
      });
      grid.append(b);
    });
    grid.classList.remove('in'); void grid.offsetWidth; grid.classList.add('in');
    paint();
    const w = wornIn(ctx.app, slot);
    showCard(w ? COSMETIC.get(w)! : null, true);
  };
  const setSlot = (s: CosSlot | 1 | -1, sound = true) => {
    const was = slot;
    if (s === 1 || s === -1) { const i = slots.indexOf(slot); slot = slots[(i + s + slots.length) % slots.length]; }
    else slot = s;
    if (sound) sfx('key');
    build();
    ctx.onSlot?.(slot);
    // keep the focus in the store when the rack changed from inside it
    if (was !== slot && t.el.contains(document.activeElement)) {
      const a = document.activeElement as HTMLElement;
      if (a.classList.contains('wd-it') || a === prev || a === next) (grid.querySelector('.wd-it.on') as HTMLElement || grid.querySelector('.wd-it') as HTMLElement)?.focus({ preventScroll: true });
      else rackBtns.get(slot)?.focus({ preventScroll: true });
    }
  };
  build();
  const W: Wardrobe = {
    term: t, el: t.el,
    get slot() { return slot; },
    setSlot,
    refresh: () => paint(),
    contains: (n) => !!n && t.el.contains(n),
  };
  return W;
}
