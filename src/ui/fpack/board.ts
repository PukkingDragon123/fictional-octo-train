// A painted interior (round 18b): the inside of the field pack, its lid, or a container being searched, as one
// pixel-art canvas that is mapped onto a 3D surface of the close-up (./shells.ts). The canvas is made of
// compartments (the pack's main well, the stitched pockets on the lid, the tool loops, a drawer's tray, a
// locker's shelves...), each showing one container's grid (src/items/grid.ts) at its real cells; the items
// sit in them as their own pixel icons. It answers "what is under this point" for the hands.
import * as THREE from 'three';
import type { Container } from '../../items/container';
import type { Item } from '../../items/item';
import { gridSpec, containerOcc, findSpot, claim, type GridSpec, type Anchor, type Occ, type Rot } from '../../items/grid';
import { itemIcon, iconVariant } from '../icons';
import {
  Px, PAL, hex, mix, mul, upscale, weave, leather, webbing, brushed, wood, cardboard, enamel, cloth, plastic, felt, rubble,
  stitchLine, stitchRect, innerShadow, rivet, zipper, grit, looseThread, digits, digitsW, hash2, type C3,
} from './paint';

/** art pixels per metre of a painted surface (the close-up shows ~1 art pixel per screen pixel) */
export const PPM = 440;
/** the texture is the art blown up by this much (hard pixels under the close-up's filtering) */
const UP = 2;

export type Look = 'main' | 'pocket' | 'loops' | 'pouch' | 'loot';
export interface Comp {
  c: Container; spec: GridSpec; reg: number;
  /** art px of grid cell (gx0, gy0)'s top-left, cell size */
  x: number; y: number; cell: number;
  gx0: number; gy0: number; gw: number; gh: number;
  look: Look; style: string;
  /** the frame drawn round it */
  fx: number; fy: number; fw: number; fh: number;
}
export interface Placed { comp: Comp; it: Item; items: Item[]; x: number; y: number; w: number; h: number; gz: number; rot: Rot }
export interface Ghost { comp: Comp; gx: number; gy: number; w: number; h: number; ok: boolean }

// ---------------------------------------------------------------- icons as images
const imgs = new Map<string, HTMLImageElement>();
const waiting = new Set<() => void>();
export function iconImg(it: Item, size: number): HTMLImageElement | null {
  const k = it.key + '|' + iconVariant(it) + '|' + size;
  let im = imgs.get(k);
  if (!im) {
    im = new Image();
    im.onload = () => { for (const f of waiting) f(); };
    im.src = itemIcon(it.key, iconVariant(it), size);
    imgs.set(k, im);
  }
  return im.complete && im.naturalWidth ? im : null;
}
export function onIcons(f: () => void) { waiting.add(f); return () => waiting.delete(f); }

// ---------------------------------------------------------------- the board
export class Board {
  W = 8; H = 8;
  comps: Comp[] = [];
  placed: Placed[] = [];
  lifted = new Set<Item>();
  hover: Item | null = null;
  ghost: Ghost | null = null;
  /** the empty-look decorations / the style of the whole surface */
  kind: 'body' | 'lid' | 'loot';
  style = 'canvas';
  private base: HTMLCanvasElement | null = null;
  private art: Px | null = null;
  readonly cv = document.createElement('canvas');
  readonly tex: THREE.CanvasTexture;
  private sig = '';
  dirty = true;
  seed: number;

  constructor(kind: 'body' | 'lid' | 'loot', seed = 1) {
    this.kind = kind; this.seed = seed;
    this.cv.width = this.cv.height = 4;
    this.tex = new THREE.CanvasTexture(this.cv);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.magFilter = THREE.NearestFilter;
    this.tex.minFilter = THREE.LinearMipmapLinearFilter;
    this.tex.anisotropy = 8;
    onIcons(() => { this.dirty = true; });
  }

  /** lay the compartments out; true when the size changed (the 3D surface must be rebuilt) */
  layout(W: number, H: number, comps: Comp[], style: string, sig: string): boolean {
    const resized = W !== this.W || H !== this.H;
    if (sig !== this.sig || resized) { this.base = null; this.sig = sig; }
    this.W = W; this.H = H; this.comps = comps; this.style = style;
    this.dirty = true;
    return resized;
  }

  // ---------------------------------------------------------------- where things are
  /** the items of every compartment, at their cells (items without a valid spot are given one for the picture) */
  place() {
    const out: Placed[] = [];
    const occs = new Map<Container, Occ>();
    for (const cp of this.comps) {
      let occ = occs.get(cp.c);
      if (!occ) {
        occ = containerOcc(cp.c) ?? undefined;
        if (!occ) continue;
        // things with no spot yet (just added, overflow): the first free cell, for the picture only
        for (const it of occ.bad) { if (isHeld(it)) continue; const p = findSpot(occ, it); if (p) { claim(occ, it, p); } }
        occs.set(cp.c, occ);
      }
    }
    for (const cp of this.comps) {
      const occ = occs.get(cp.c); if (!occ) continue;
      for (const a of occ.anchors) {
        if (!inComp(cp, a)) continue;
        const x = cp.x + (a.gx - cp.gx0) * cp.cell, y = cp.y + (a.gy - cp.gy0) * cp.cell;
        out.push({ comp: cp, it: a.items[a.items.length - 1], items: a.items, x, y, w: a.w * cp.cell, h: a.h * cp.cell, gz: a.gz, rot: a.rot });
      }
    }
    out.sort((p, q) => p.gz - q.gz || p.y - q.y);
    this.placed = out;
  }
  /** the thing under an art-px point (topmost) */
  hit(ax: number, ay: number): Placed | null {
    for (let i = this.placed.length - 1; i >= 0; i--) {
      const p = this.placed[i];
      if (p.items.every((it) => this.lifted.has(it))) continue;
      const pad = p.comp.look === 'loops' ? 0 : 1;
      if (ax >= p.x - pad && ay >= p.y - pad - (p.comp.look === 'loops' ? 10 : 0) && ax < p.x + p.w + pad && ay < p.y + p.h + pad) return p;
    }
    return null;
  }
  /** the compartment and its (fractional) cell under an art-px point */
  cellAt(ax: number, ay: number): { comp: Comp; cx: number; cy: number } | null {
    let best: { comp: Comp; cx: number; cy: number } | null = null, bd = 1e9;
    for (const cp of this.comps) {
      const inside = ax >= cp.fx && ay >= cp.fy && ax < cp.fx + cp.fw && ay < cp.fy + cp.fh;
      const dx = Math.max(cp.fx - ax, 0, ax - (cp.fx + cp.fw)), dy = Math.max(cp.fy - ay, 0, ay - (cp.fy + cp.fh));
      const d = inside ? 0 : Math.hypot(dx, dy);
      if (d < bd && d < 14) { bd = d; best = { comp: cp, cx: cp.gx0 + (ax - cp.x) / cp.cell, cy: cp.gy0 + (ay - cp.y) / cp.cell }; }
    }
    return best;
  }
  placedOf(it: Item): Placed | null { return this.placed.find((p) => p.items.includes(it)) ?? null; }
  /** art-px centre of a cell box in a compartment */
  cellCentre(cp: Comp, gx: number, gy: number, w: number, h: number): [number, number] {
    return [cp.x + (gx - cp.gx0 + w / 2) * cp.cell, cp.y + (gy - cp.gy0 + h / 2) * cp.cell];
  }

  // ---------------------------------------------------------------- painting
  redraw(force = false) {
    if (!this.dirty && !force) return;
    this.dirty = false;
    if (!this.base) this.base = this.paintBase();
    const W = this.W, H = this.H;
    const art = this.art && this.art.w === W && this.art.h === H ? this.art : (this.art = new Px(W, H, 3));
    const c = art.cv.getContext('2d')!;
    c.imageSmoothingEnabled = false;
    c.clearRect(0, 0, W, H);
    c.drawImage(this.base, 0, 0);
    // the things themselves, back to front
    for (const p of this.placed) {
      const vis = p.items.filter((it) => !this.lifted.has(it));
      if (!vis.length) continue;
      this.drawItem(c, p, vis.length);
    }
    // the fronts of pockets and loops go over what sits in them
    for (const cp of this.comps) this.drawFront(c, cp);
    if (this.ghost) this.drawGhost(c, this.ghost);
    // count tags
    for (const p of this.placed) {
      const n = p.items.filter((it) => !this.lifted.has(it)).length;
      if (n > 1) this.drawTag(c, p.x + p.w - 2, p.y + p.h - 3, n);
    }
    const up = upscale(art.cv, UP);
    if (this.cv.width !== up.width || this.cv.height !== up.height) {
      this.cv.width = up.width; this.cv.height = up.height;
      this.tex.dispose();
    }
    const tc = this.cv.getContext('2d')!;
    tc.clearRect(0, 0, this.cv.width, this.cv.height);
    tc.drawImage(up, 0, 0);
    this.tex.needsUpdate = true;
  }

  private drawItem(c: CanvasRenderingContext2D, p: Placed, n: number) {
    const loops = p.comp.look === 'loops';
    const hov = this.hover && p.items.includes(this.hover);
    const s = Math.max(10, Math.floor(Math.min(p.w, loops ? p.h * 1.5 : p.h) - (loops ? 0 : 3)));
    const im = iconImg(p.it, s);
    let x = Math.round(p.x + (p.w - s) / 2), y = Math.round(p.y + (p.h - s) / 2 - (loops ? 6 : 0));
    if (hov) y -= 1;
    // the shadow it throws on the fabric (deeper for things lying on top of others)
    const off = 1 + Math.min(3, p.gz) + (hov ? 1 : 0);
    if (im) {
      c.save();
      c.globalAlpha = 0.42;
      c.filter = 'brightness(0)';
      c.drawImage(im, x + off, y + off + 1, s, s);
      c.restore();
      // a stack shows its second one under it
      if (n > 1) { c.save(); c.globalAlpha = 0.85; c.filter = 'brightness(.7)'; c.drawImage(im, x - 2, y - 2, s, s); c.restore(); }
      c.drawImage(im, x, y, s, s);
      if (hov) { c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.16; c.drawImage(im, x, y, s, s); c.restore(); }
    }
  }
  private drawTag(c: CanvasRenderingContext2D, rx: number, by: number, n: number) {
    const s = n > 99 ? '99' : String(n), w = digitsW(s) + 6, h = 9;
    const t = new Px(w + 2, h + 3, n * 7);
    // a cloth tag stitched on at its top corners
    weave(t, 0, 0, w, h, hex(0xd8cca0), { seed: 5, dirt: 0.2, wear: 0.1 });
    t.rect(0, h - 1, w, 1, hex(0x8a7c58)); t.rect(w - 1, 0, 1, h, hex(0x9a8c64));
    t.put(1, 1, PAL.leatherD); t.put(w - 2, 1, PAL.leatherD);
    for (let i = 0; i < w; i++) t.put(i + 1, h, [0, 0, 0], 0.35);
    for (let j = 0; j < h; j++) t.put(w, j + 1, [0, 0, 0], 0.35);
    digits(t, 3, 2, s, hex(0x2a2014), null);
    c.drawImage(t.done(), Math.round(rx - w + 2), Math.round(by - h + 2));
  }
  private drawGhost(c: CanvasRenderingContext2D, g: Ghost) {
    const cp = g.comp;
    const x = Math.round(cp.x + (g.gx - cp.gx0) * cp.cell), y = Math.round(cp.y + (g.gy - cp.gy0) * cp.cell);
    const w = g.w * cp.cell, h = g.h * cp.cell;
    const t = new Px(w + 2, h + 2, 9);
    const col: C3 = g.ok ? hex(0xf2e2a0) : hex(0xc0644a);
    for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) t.put(i, j, col, g.ok ? 0.1 : 0.12);
    stitchRect(t, 0, 0, w, h, col);
    stitchRect(t, 2, 2, w - 4, h - 4, mul(col, 0.8), 0.6);
    c.drawImage(t.done(), x, y);
  }

  /** the board under the items: the surface, the compartments, wear and dirt */
  private paintBase(): HTMLCanvasElement {
    const p = new Px(this.W, this.H, this.seed, true);
    const W = this.W, H = this.H;
    if (this.kind === 'body') paintBody(p, W, H);
    else if (this.kind === 'lid') paintLid(p, W, H);
    else paintLootFloor(p, W, H, this.style);
    for (const cp of this.comps) paintComp(p, cp, this.kind);
    if (this.kind !== 'loot' || this.style !== 'floor') { grit(p, 3, 3, W - 6, H - 6, Math.round(W * H / 500)); }
    return p.done();
  }

  private drawFront(c: CanvasRenderingContext2D, cp: Comp) {
    const f = fronts.get(cp);
    if (f) c.drawImage(f, cp.fx, cp.fy);
  }
}

const isHeld = (it: Item) => !!it && false;
function inComp(cp: Comp, a: Anchor) { return a.gx >= cp.gx0 && a.gy >= cp.gy0 && a.gx < cp.gx0 + cp.gw && a.gy < cp.gy0 + cp.gh; }

// ---------------------------------------------------------------- the surfaces
const fronts = new WeakMap<Comp, HTMLCanvasElement>();

/** the pack's floor: an amber-khaki liner, diamond quilting, AO along the walls, seams, a hydration sleeve, a label */
function paintBody(p: Px, W: number, H: number) {
  weave(p, 0, 0, W, H, mix(PAL.lining, PAL.khaki, 0.45), { seed: 17, dirt: 0.6, wear: 0.5 });
  // quilting: stitched diamonds with the padding puffing between them
  const q = 18;
  p.fill(0, 0, W, H, (x, y) => {
    const a = ((x + y) % q + q) % q, b = ((x - y) % q + q) % q;
    const d = Math.min(a, q - a, b, q - b);
    const k = d < 1 ? 0.78 : 1 + Math.min(1, d / 5) * 0.06 - (d < 3 ? 0.06 : 0);
    const c = p.get(x, y);
    return mul(c, k);
  });
  for (let x = -H; x < W + H; x += q) { stitchLine(p, x, 0, x + H, H, mul(PAL.thread, 0.85), 0.55); stitchLine(p, x + H, 0, x, H, mul(PAL.thread, 0.85), 0.55); }
  // the sleeve along the far wall (webbing elastic, two bar tacks)
  const sx = Math.round(W * 0.14), sw = Math.round(W * 0.72);
  webbing(p, sx, 6, sw, 9, mix(PAL.oliveD, PAL.lining, 0.25), false, 21);
  for (const tx of [sx + 2, sx + sw - 5]) p.rect(tx, 7, 3, 7, mul(PAL.thread, 0.9));
  for (let i = 0; i < sw; i++) p.put(sx + i, 15, [0, 0, 0], 0.35);
  // a woven maker's label in the near-left corner: cream with two dark bands and the bishop's mitre in stitches
  const lx = 10, ly = H - 24;
  p.rect(lx, ly, 22, 12, hex(0xe0d6b0));
  p.rect(lx, ly + 2, 22, 1, hex(0x3a3a2a)); p.rect(lx, ly + 9, 22, 1, hex(0x3a3a2a));
  for (const [dx, dy] of [[10, 4], [11, 4], [9, 5], [12, 5], [9, 6], [10, 6], [11, 6], [12, 6], [10, 7], [11, 7]]) p.put(lx + dx, ly + dy, hex(0x5a2a1a));
  stitchRect(p, lx - 1, ly - 1, 24, 14, mul(PAL.thread, 0.8), 0.7);
  for (let i = 0; i < 22; i++) p.put(lx + i + 1, ly + 12, [0, 0, 0], 0.3);
  // the walls' shade on the floor, corner seams
  innerShadow(p, 0, 0, W, H, 14, 0.62);
  for (const [x0, y0, dx, dy] of [[0, 0, 1, 1], [W - 1, 0, -1, 1], [0, H - 1, 1, -1], [W - 1, H - 1, -1, -1]]) stitchLine(p, x0 + dx * 2, y0 + dy * 2, x0 + dx * 9, y0 + dy * 9, PAL.thread, 0.7);
  looseThread(p, Math.round(W * 0.7), Math.round(H * 0.8));
}

/** the inside of the lid: the darker shell canvas, a webbing binding round it, a mesh pocket behind everything */
function paintLid(p: Px, W: number, H: number) {
  weave(p, 0, 0, W, H, mul(PAL.olive, 1.12), { seed: 29, dirt: 0.55, wear: 0.6 });
  // the mesh pocket across the middle (diamond mesh over a dark void), zipped along its top
  const my = Math.round(H * 0.08), mh = Math.round(H * 0.84);
  p.fill(6, my, W - 12, mh, (x, y) => {
    const a = ((x + y) % 5 + 5) % 5, b = ((x - y) % 5 + 5) % 5;
    const c = p.get(x, y);
    return a === 0 || b === 0 ? mix(c, hex(0x2a2c22), 0.55) : mul(c, 0.82);
  });
  // binding
  webbing(p, 0, 0, W, 4, PAL.web, false, 9); webbing(p, 0, H - 4, W, 4, PAL.web, false, 10);
  webbing(p, 0, 0, 4, H, PAL.web, true, 11); webbing(p, W - 4, 0, 4, H, PAL.web, true, 12);
  stitchRect(p, 5, 5, W - 10, H - 10, mul(PAL.thread, 0.75), 0.7);
  zipper(p, 10, my - 2, W - 20, 0.82);
  for (const [x, y] of [[1, 1], [W - 4, 1], [1, H - 4], [W - 4, H - 4]]) rivet(p, x, y);
}

/** the floor of whatever is being searched, by its look */
function paintLootFloor(p: Px, W: number, H: number, style: string) {
  const s = 101;
  switch (style) {
    case 'cardboard': cardboard(p, 0, 0, W, H, PAL.card, { seed: s }); break;
    case 'wood': case 'shelf': wood(p, 0, 0, W, H, PAL.wood, 12, { seed: s }); break;
    case 'crate': wood(p, 0, 0, W, H, hex(0xa8865a), 9, { seed: s }); break;
    case 'laminate': enamel(p, 0, 0, W, H, hex(0xc8b890), { seed: s }); break;
    case 'steel': case 'safe': case 'mailbox': brushed(p, 0, 0, W, H, hex(0x7a8278), { seed: s, dirt: 0.5 }); break;
    case 'toolbox': brushed(p, 0, 0, W, H, hex(0x9a3a2a), { seed: s, dirt: 0.6, wear: 0.8 }); break;
    case 'fridge': case 'freezer': case 'cooler': case 'medical': enamel(p, 0, 0, W, H, style === 'medical' ? hex(0xd8e0d4) : hex(0xe4e2d8), { seed: s }); break;
    case 'oven': case 'vending': enamel(p, 0, 0, W, H, hex(0x3a3a38), { seed: s }); break;
    case 'carpet': felt(p, 0, 0, W, H, hex(0x55575a), s); break;
    case 'trash': plastic(p, 0, 0, W, H, hex(0x262826), s); break;
    case 'pile': rubble(p, 0, 0, W, H, hex(0x7a6e5a), s); break;
    case 'corpse': cloth(p, 0, 0, W, H, hex(0x3a3e44), { seed: s, dirt: 0.7 }); break;
    case 'floor': {
      // nothing painted: the real floor shows through; only dust where things lie
      for (let i = 0; i < W * H / 60; i++) p.film(p.ri(W), p.ri(H), PAL.dust, 0.25 + p.rnd() * 0.3);
      return;
    }
    default: wood(p, 0, 0, W, H, PAL.wood, 12, { seed: s });
  }
  // shelves / sections: a lip between them
  const deep = style === 'cardboard' || style === 'crate' || style === 'trash' || style === 'toolbox' ? 16 : 11;
  innerShadow(p, 0, 0, W, H, deep, 0.6);
  // the lived-in odds and ends of an empty-looking floor
  if (style === 'cardboard') {
    // packing paper crumpled in a corner, an old tape strip
    paper(p, W - 26, H - 20, 22, 16);
    p.fill(4, Math.round(H * 0.42), W - 8, 5, (x, y) => mix(p.get(x, y), PAL.tape, 0.55 + hash2(x, y, 3) * 0.1));
  } else if (style === 'wood' || style === 'shelf') {
    // a paper clip and pencil shavings
    const cx = Math.round(W * 0.7), cy = Math.round(H * 0.3);
    p.line(cx, cy, cx + 7, cy, PAL.steel); p.line(cx, cy + 2, cx + 7, cy + 2, PAL.steel); p.put(cx - 1, cy + 1, PAL.steel); p.put(cx + 8, cy + 1, PAL.steelD);
    grit(p, 6, H - 14, 20, 8, 14, hex(0xc89a5a));
  } else if (style === 'steel' || style === 'safe' || style === 'mailbox') {
    // perforations along the back, a hook rail
    for (let x = 8; x < W - 8; x += 5) for (const y of [5, 8]) { p.put(x, y, hex(0x1a1c1a)); p.put(x + 1, y + 1, mul(hex(0x7a8278), 1.3), 0.5); }
    for (let x = 12; x < W - 10; x += Math.max(18, Math.round(W / 5))) { p.rect(x, 12, 2, 6, PAL.steelD); p.line(x + 1, 18, x + 4, 21, PAL.steel); p.put(x + 4, 20, PAL.steel); }
  } else if (style === 'crate') {
    // straw bedding
    for (let i = 0; i < W * H / 40; i++) { const x = p.ri(W), y = p.ri(H), L = 3 + p.ri(6), d = p.rnd() < 0.5 ? 1 : -1; p.line(x, y, x + L, y + d * p.ri(3), mix(hex(0xd8b860), hex(0x9a7a30), p.rnd()), 0.85); }
  } else if (style === 'fridge' || style === 'freezer') {
    if (style === 'freezer') for (let i = 0; i < W * H / 30; i++) p.put(p.ri(W), p.ri(H), hex(0xf4f8ff), 0.5);
  } else if (style === 'corpse') {
    // the coat's zip down the middle
    for (let y = 2; y < H - 2; y++) { p.put((W >> 1), y, (y & 1) ? hex(0x8a8a80) : hex(0x4a4a44)); p.put((W >> 1) + 1, y, (y & 1) ? hex(0x4a4a44) : hex(0x8a8a80)); }
  }
}

/** crumpled paper: pale, creased facets */
function paper(p: Px, x: number, y: number, w: number, h: number) {
  p.fill(x, y, w, h, (X, Y) => {
    const dx = (X - x - w / 2) / (w / 2), dy = (Y - y - h / 2) / (h / 2);
    if (dx * dx + dy * dy > 1 - hash2(X, Y, 8) * 0.25) return null;
    const f = Math.floor(vn(X / 4, Y / 4) * 4) / 4;
    return mul(hex(0xdcd8cc), 0.78 + f * 0.3);
  });
}
const vn = (x: number, y: number) => hash2(Math.floor(x), Math.floor(y), 77);

/** one compartment's own painting (its frame, its bed); pockets and loops also get a front drawn over their items */
function paintComp(p: Px, cp: Comp, kind: 'body' | 'lid' | 'loot') {
  const { fx, fy, fw, fh } = cp;
  if (cp.look === 'main') {
    // the main well: AO already round the walls; a faint stitched outline of where the liner panel is sewn
    stitchRect(p, fx, fy, fw, fh, mul(PAL.thread, 0.7), 0.45);
    return;
  }
  if (cp.look === 'pocket' || cp.look === 'pouch') {
    const base = cp.look === 'pocket' ? mix(PAL.olive, PAL.khaki, 0.15) : mix(PAL.leather, PAL.olive, 0.35);
    // the inside of the pocket (dark, deep at its mouth)
    weave(p, fx, fy, fw, fh, mul(base, 0.62), { seed: fx * 7 + fy, dirt: 0.4, wear: 0.2 });
    innerShadow(p, fx, fy, fw, fh, 8, 0.7);
    // side gussets
    for (let j = 0; j < fh; j++) { p.shade(fx, fy + j, 0.6); p.shade(fx + fw - 1, fy + j, 0.6); }
    // the front: a lip of the pocket's own fabric over the bottom of what is in it, double stitched, bar tacks
    const lipH = 8;
    const f = new Px(fw, fh, fx + fy * 3);
    weave(f, 0, fh - lipH, fw, lipH, base, { seed: fx * 3 + fy, dirt: 0.5, wear: 0.6 });
    for (let i = 0; i < fw; i++) { f.put(i, fh - lipH, mul(base, 1.28)); f.put(i, fh - lipH + 1, mul(base, 1.1)); f.film(i, fh - lipH - 1, [0, 0, 0], 0.35); }
    stitchLine(f, 1, fh - lipH + 3, fw - 2, fh - lipH + 3, PAL.thread, 0.9);
    stitchLine(f, 1, fh - 2, fw - 2, fh - 2, PAL.thread, 0.6);
    for (const bx of [0, fw - 3]) f.rect(bx, fh - lipH, 3, 4, mul(PAL.thread, 0.95));
    if (cp.look === 'pouch') zipper(f, 2, fh - lipH - 1, fw - 4, 0.15);
    fronts.set(cp, f.done());
    // the outer seam round the pocket where it is sewn to the lid
    stitchRect(p, fx - 2, fy - 2, fw + 4, fh + 4, PAL.thread, 0.85);
    for (let i = 0; i < fw + 4; i++) p.film(fx - 2 + i, fy + fh + 2, [0, 0, 0], 0.3);
    return;
  }
  if (cp.look === 'loops') {
    // a leather strip with a loop per cell; the holster at the end is a deeper sheath with a snap
    const n = cp.gw;
    leather(p, fx, fy + Math.round(fh * 0.3), fw, Math.round(fh * 0.42), PAL.leather, { seed: 71, stitch: true });
    for (let j = 0; j < 2; j++) for (let i = 0; i < fw; i++) p.film(fx + i, fy + Math.round(fh * 0.72) + j, [0, 0, 0], 0.3 - j * 0.12);
    const f = new Px(fw, fh, 72);
    for (let i = 0; i < n; i++) {
      const reg = cp.spec.regions[cp.spec.ri[i]];
      const cx = Math.round((i + 0.5) * cp.cell);
      if (reg?.manual) {
        const sw = cp.cell - 4, sh = Math.round(fh * 0.62);
        leather(f, cx - (sw >> 1), fh - sh - 2, sw, sh, PAL.leatherD, { seed: 73, stitch: true });
        leather(f, cx - (sw >> 1) + 2, fh - sh - 6, sw - 4, 8, PAL.leather, { seed: 74 });
        rivet(f, cx - 1, fh - sh - 3, PAL.steel);
        continue;
      }
      const lw = 9, ly = Math.round(fh * 0.24), lh = Math.round(fh * 0.56);
      leather(f, cx - (lw >> 1), ly, lw, lh, mul(PAL.leather, 1.08), { seed: 75 + i });
      for (let j = 0; j < lh; j++) f.film(cx + (lw >> 1) + 1, ly + j, [0, 0, 0], 0.35);
      rivet(f, cx - 1, ly + 1); rivet(f, cx - 1, ly + lh - 4);
    }
    fronts.set(cp, f.done());
    return;
  }
  if (cp.look === 'loot' && kind === 'loot') {
    // sections (shelves): a lip along each section's top edge
    if (cp.fy > 6) {
      const lipC: C3 = cp.style === 'steel' || cp.style === 'medical' || cp.style === 'fridge' ? hex(0xb8bcb4) : cp.style === 'vending' ? hex(0x5a5a58) : mul(PAL.wood, 1.2);
      for (let i = 0; i < cp.fw + 8; i++) { p.put(cp.fx - 4 + i, cp.fy - 4, mul(lipC, 1.25)); p.put(cp.fx - 4 + i, cp.fy - 3, lipC); p.put(cp.fx - 4 + i, cp.fy - 2, mul(lipC, 0.7)); p.film(cp.fx - 4 + i, cp.fy - 1, [0, 0, 0], 0.4); p.film(cp.fx - 4 + i, cp.fy, [0, 0, 0], 0.2); }
    }
    if (cp.style === 'vending') {
      // a spiral coil in every cell
      for (let gx = 0; gx < cp.gw; gx++) for (let gy = 0; gy < cp.gh; gy++) {
        const cx = cp.x + gx * cp.cell, cy = cp.y + gy * cp.cell;
        for (let t = 0; t < cp.cell - 4; t += 1) { const yy = cy + 2 + t, xx = cx + cp.cell / 2 + Math.sin(t * 0.9) * (cp.cell * 0.32); p.put(xx, yy, hex(0xb8bcb4)); p.put(xx + 1, yy, hex(0x6a6e68)); }
      }
    }
    if (cp.style === 'corpse') {
      // each section is a pocket of the coat, stitched round, a flap line at its mouth
      stitchRect(p, cp.fx, cp.fy, cp.fw, cp.fh, hex(0x8a8478), 0.8);
      for (let i = 0; i < cp.fw; i++) p.shade(cp.fx + i, cp.fy + 1, 0.55);
    }
  }
}

// ---------------------------------------------------------------- layouts
export interface PackParts { main: Container | null; pockets: Container | null; roll: Container | null; extra: Container[] }

const regionComp = (c: Container, spec: GridSpec, reg: number, x: number, y: number, cell: number, look: Look, style: string, padX: number, padY: number, padB = padY): Comp => {
  const r = reg >= 0 ? spec.regions[reg] : { x: 0, y: 0, w: spec.w, h: spec.h };
  return { c, spec, reg, x: x + padX, y: y + padY, cell, gx0: r.x, gy0: r.y, gw: r.w, gh: r.h, look, style, fx: x, fy: y, fw: r.w * cell + padX * 2, fh: r.h * cell + padY + padB };
};

/** the pack's floor: the main well (the bag on the back), extra bags in a column beside it */
export function layoutBody(b: Board, parts: PackParts) {
  const M = 12, comps: Comp[] = [];
  let W = 0, H = 0;
  const CELL = 30;
  let mx = M, my = M + 10;
  const ms = parts.main ? gridSpec(parts.main) : null;
  let mw = 150, mh = 150;
  if (parts.main && ms) {
    const cp = regionComp(parts.main, ms, -1, mx, my, CELL, 'main', 'canvas', 4, 4);
    comps.push(cp); mw = cp.fw; mh = cp.fh;
  }
  W = mx + mw; H = my + mh;
  let ex = W + 10, ey = my;
  for (const c of parts.extra) {
    const s = gridSpec(c); if (!s) continue;
    const cp = regionComp(c, s, -1, ex, ey, 24, 'pouch', 'canvas', 4, 5, 9);
    comps.push(cp);
    ey += cp.fh + 10;
    W = Math.max(W, ex + cp.fw); H = Math.max(H, ey - 10);
  }
  W += M; H += M;
  const sig = 'body|' + comps.map((c) => c.c.uid + ':' + c.spec.sig).join(',');
  return { W: Math.max(W, 120), H: Math.max(H, 120), comps, sig };
}

/** the lid's inside: the clothes' pockets in a row, the tool roll's loops along the hinge */
export function layoutLid(b: Board, parts: PackParts, Wmin: number, Hmin: number) {
  const comps: Comp[] = [];
  const CELL = 26;
  let x = 14, y = 16, rowH = 0;
  const ps = parts.pockets ? gridSpec(parts.pockets) : null;
  let W = Wmin;
  if (parts.pockets && ps) {
    const regs = ps.regions.map((r, i) => ({ r, i })).filter((q) => !q.r.manual);
    const total = regs.reduce((s, q) => s + q.r.w * CELL + 8 + 10, 0) - 10 + 28;
    W = Math.max(W, total);
    x = Math.round((W - (total - 28)) / 2);
    for (const { r, i } of regs) {
      const cp = regionComp(parts.pockets, ps, i, x, y, CELL, 'pocket', 'canvas', 4, 4, 8);
      comps.push(cp);
      x += cp.fw + 10; rowH = Math.max(rowH, cp.fh);
    }
    y += rowH + 14;
  }
  const rs = parts.roll ? gridSpec(parts.roll) : null;
  if (parts.roll && rs) {
    const cell = 24, lw = rs.w * cell;
    W = Math.max(W, lw + 28);
    const cp: Comp = { c: parts.roll, spec: rs, reg: -1, x: Math.round((W - lw) / 2), y: y + 6, cell, gx0: 0, gy0: 0, gw: rs.w, gh: 1, look: 'loops', style: 'loops', fx: Math.round((W - lw) / 2), fy: y, fw: lw, fh: cell + 18 };
    comps.push(cp);
    y += cp.fh + 10;
  }
  const H = Math.max(Hmin, y + 8);
  const sig = 'lid|' + comps.map((c) => c.c.uid + ':' + c.spec.sig + ':' + c.reg).join(',') + '|' + W + 'x' + H;
  return { W, H, comps, sig };
}

/** a container's floor: one section per region of its grid */
export function layoutLoot(b: Board, c: Container) {
  const s = gridSpec(c);
  if (!s) return { W: 120, H: 90, comps: [] as Comp[], sig: 'none', style: 'wood' };
  const style = c.kind === 'floor' ? 'floor' : s.style === 'canvas' || s.style === 'iron' || s.style === 'loops' || s.style === 'pocket' ? 'cardboard' : s.style;
  const cell = c.kind === 'floor' ? 30 : 28;
  const M = c.kind === 'floor' ? 6 : 12, comps: Comp[] = [];
  let y = M, W = 0;
  s.regions.forEach((r, i) => {
    const cp = regionComp(c, s, i, M, y, cell, 'loot', style, 2, 2);
    comps.push(cp);
    y += cp.fh + 8;
    W = Math.max(W, cp.fw);
  });
  const sig = 'loot|' + c.uid + '|' + s.sig;
  return { W: W + M * 2, H: y - 8 + M, comps, sig, style };
}
