// The machine's parts (src/ui/machine): every housing, key, switch, knob, gauge,
// lamp and socket as faceted 3D, built with the touch controls' Mold like the
// body HUD's console. Space: the element's top-left at (0, 0), x right, y DOWN
// in the specs (the scene's y is -y), z out of the panel; z = 0 is the face
// that lines up 1:1 with the DOM element.
import * as THREE from 'three';
import { Mold, M, STEEL, CHROME, BRASS, RUBBER, PLASTIC, PAINT } from '../touch/stage3d';
import { fcyl, fbox, fdome, fring, frod, plate, clipRect, gem } from '../touch/facet';
import { mxMat, lensMat, haloMat } from './core';
import { paintFace, labelCanvas, canvasTex, hazardCanvas, stickerCanvas, placardCanvas, TONES, hh, type Tone, type Rect, type Stencil, type PaintSpec } from './paint';

export const R90 = Math.PI / 2;
const BLACK = 0x0c0d0a;
export type LampCol = 'green' | 'amber' | 'red' | 'white';
export const LAMP_RGB: Record<LampCol, number> = { green: 0x3cff6a, amber: 0xffb02a, red: 0xff4422, white: 0xfff4d0 };

export function meshOf(m: Mold, mat: THREE.Material, parent?: THREE.Object3D): THREE.Mesh {
  const me = new THREE.Mesh(m.build(), mat);
  me.frustumCulled = false;
  parent?.add(me);
  return me;
}
/** a rect (top-left x, y, w, h in spec space) as a centred clip outline + its centre in scene space */
function crect(r: Rect, cut: number): { pts: THREE.Vector2[]; cx: number; cy: number } {
  return { pts: clipRect(r.w, r.h, cut), cx: r.x + r.w / 2, cy: -(r.y + r.h / 2) };
}

// ---------------------------------------------------------------- hardware
/** a hex bolt with its washer, standing on z */
export function bolt(m: Mold, x: number, y: number, z: number, r = 2.4, col = 0x9aa2a0, seed = 1) {
  m.add(fcyl(r * 1.32, 0.7, 10, r * 1.32, 0.25), M(x, -y, z + 0.35, R90), 0x5a605c, STEEL)
    .add(fcyl(r, 1.9, 6, r, 0.3, false, hh(x, y, seed) * Math.PI), M(x, -y, z + 0.7 + 0.95, R90), col, STEEL);
}
/** a slotted screw head */
export function screw(m: Mold, x: number, y: number, z: number, r = 1.8, col = 0xb0b8b4) {
  const a = hh(x, y, 9) * Math.PI;
  m.add(fcyl(r, 1, 8, r, 0.35), M(x, -y, z + 0.5, R90), col, CHROME)
    .add(fbox(r * 1.9, 0.5, 0.5, 0), M(x, -y, z + 1.05, 0, 0, a), 0x22261f, STEEL);
}
/** a domed rivet, painted over with the panel's enamel */
export function rivet(m: Mold, x: number, y: number, z: number, r = 1.3, col = 0x7a8456) {
  m.add(fdome(r, 6, 2, 0.75), M(x, -y, z, R90), col, PAINT);
}
/** a lamp: a chromed bezel and a faceted glass lens; returns its lens / halo materials */
export function lamp(parent: THREE.Object3D, x: number, y: number, z: number, r: number, col: LampCol, guard = false): { lens: THREE.ShaderMaterial; halo: THREE.ShaderMaterial } {
  const m = new Mold();
  m.add(fcyl(r + 1.8, 1.4, 12, r + 2.1, 0.3), M(x, -y, z + 0.7, R90), 0x3a3f38, STEEL)
    .add(fring(r + 0.9, 0.75, 12, 4), M(x, -y, z + 1.6), 0xc8d0cc, CHROME);
  if (guard) {
    for (const a of [-0.5, 0.5]) m.add(frod([x + a * r * 1.4, -y - r - 1.2, z + 1.2], [x + a * r * 1.4, -y + r + 1.2, z + 1.2 + r * 0.9], 0.45, 4), null, 0x9aa2a0, STEEL);
  }
  meshOf(m, mxMat({ wear: 0.3 }), parent);
  const lens = lensMat(LAMP_RGB[col]);
  const lg = fdome(r, 8, 3, 0.85);
  const lm = new THREE.Mesh(lg, lens); lm.position.set(x, -y, z + 1.4); lm.rotation.x = R90; lm.frustumCulled = false; parent.add(lm);
  const halo = haloMat(LAMP_RGB[col]);
  const hm = new THREE.Mesh(new THREE.PlaneGeometry(r * 7, r * 7), halo); hm.position.set(x, -y, z + 0.15); hm.renderOrder = 5; hm.frustumCulled = false; parent.add(hm);
  return { lens, halo };
}
export function setLamp(l: { lens: THREE.ShaderMaterial; halo: THREE.ShaderMaterial }, on: number) { l.lens.uniforms.uOn.value = on; l.halo.uniforms.uOn.value = on; }

/** a louvred vent: a framed dark well with angled slats */
export function vent(m: Mold, r: Rect, z: number, frameCol: number) {
  const { pts, cx, cy } = crect({ x: r.x - 2, y: r.y - 2, w: r.w + 4, h: r.h + 4 }, 2);
  m.add(plate(pts, 1.4, 0.45, [clipRect(r.w, r.h, 1)]), M(cx, cy, z), frameCol, PAINT);
  for (let j = 2; j < r.h - 1; j += 4) m.add(fbox(r.w - 1, 2.4, 1.2, 0.15), M(r.x + r.w / 2, -(r.y + j), z - 0.2, -0.55, 0, 0), 0x2c3122, STEEL);
}
/** a cable gland on the face and its cable drooping off the bottom */
export function gland(m: Mold, x: number, y: number, z: number, col: number, drop: number, seed = 1) {
  m.add(fcyl(3.2, 2.2, 6, 3.2, 0.25), M(x, -y, z + 1.1, R90), 0x8a928e, STEEL)
    .add(fcyl(2.5, 2.4, 10, 2.8, 0.3), M(x, -y, z + 3.2, R90), 0x1c1e1a, RUBBER);
  let px = x, py = -y, pz = z + 4.2;
  const lean = (hh(x, y, seed) - 0.5) * 1.6;
  const steps = 6;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const nx = x + lean * t * t * 4, ny = -y - drop * t, nz = z + 4.2 + Math.sin(t * Math.PI * 0.8) * 3.2;
    m.add(frod([px, py, pz], [nx, ny, nz], 1.5, 6), null, col, RUBBER);
    px = nx; py = ny; pz = nz;
  }
}
/** a vertical grab handle: two standoffs and a chromed bar */
export function handle(m: Mold, x: number, y0: number, y1: number, z: number) {
  for (const y of [y0, y1]) {
    m.add(fcyl(2.8, 1, 8, 3.2, 0.2), M(x, -y, z + 0.5, R90), 0x4a5048, STEEL)
      .add(fcyl(1.7, 5, 8, 1.9, 0.2), M(x, -y, z + 3.3, R90), 0x8a928e, STEEL);
  }
  m.add(frod([x, -y0, z + 5.6], [x, -y1, z + 5.6], 1.45, 6), null, 0xc4ccc8, CHROME);
}
/** a weld bead from a to b (spec space) */
export function weld(m: Mold, x0: number, y0: number, x1: number, y1: number, z: number) {
  const len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(2, Math.floor(len / 2.2));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    m.add(gem(1.25, 0, 0.22, i), M(x0 + (x1 - x0) * t, -(y0 + (y1 - y0) * t), z + 0.2, 0, 0, i * 0.7, 1, 1, 0.5), 0x5a5e52, STEEL);
  }
}
/** a red octagonal handwheel on a brass stem (the HUD's pipe valves) */
export function valve(m: Mold, x: number, y: number, z: number, r = 5) {
  m.add(fcyl(r * 0.36, 1.2, 8, r * 0.42, 0.3), M(x, -y, z + 0.6, R90), 0xb08a3a, BRASS)
    .add(fcyl(r * 0.18, 3.4, 6, r * 0.18, 0), M(x, -y, z + 2.6, R90), 0x9aa29c, STEEL)
    .add(fring(r, r * 0.16, 8, 4), M(x, -y, z + 4.2, 0, 0, Math.PI / 8), 0xc8301e, PLASTIC);
  for (let i = 0; i < 4; i++) m.add(fbox(r * 2, r * 0.18, r * 0.18, 0.1), M(x, -y, z + 4.2, 0, 0, i * Math.PI / 4), 0xa8221a, PLASTIC);
  m.add(fcyl(r * 0.26, 1, 8, r * 0.26, 0.3), M(x, -y, z + 4.6, R90), 0xc8ccc0, CHROME);
}
/** a brass pipe run on standoff clamps, flanged at both ends */
export function pipe(m: Mold, x0: number, y0: number, x1: number, y1: number, z: number, r = 1.6) {
  m.add(frod([x0, -y0, z + 3], [x1, -y1, z + 3], r, 7), null, 0xb89040, BRASS);
  for (const [x, y] of [[x0, y0], [x1, y1]]) m.add(fcyl(r * 1.7, 1.6, 8, r * 1.7, 0.3), M(x, -y, z + 1.6, R90), 0x9a7428, BRASS);
  const n = Math.max(1, Math.floor(Math.hypot(x1 - x0, y1 - y0) / 40));
  for (let i = 1; i < n; i++) { const t = i / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t; m.add(fbox(r * 2.6, r * 2.6, 2.4, 0.2), M(x, -y, z + 1.6), 0x4a5048, STEEL); }
}

/** a printed plate (nameplate / tag / hazard strip): a thin bevelled plate with its print on the face */
export function printedPlate(parent: THREE.Object3D, r: Rect, z: number, cv: HTMLCanvasElement, rivets = true, col = 0xd2a020) {
  const { pts, cx, cy } = crect(r, Math.min(2, r.h * 0.2));
  const m = new Mold().add(plate(pts, 1.3, 0.4), M(cx, cy, z), col, PAINT);
  const me = meshOf(m, mxMat({ map: canvasTex(cv), wear: 0.2 }), parent);
  if (rivets && r.w > 30) {
    const hw = new Mold();
    for (const x of [r.x + 3.5, r.x + r.w - 3.5]) hw.add(fdome(1.1, 6, 2, 0.8), M(x, cy, z + 1.3, R90), 0xc8ccc0, CHROME);
    meshOf(hw, mxMat(), parent);
  }
  return me;
}

// ---------------------------------------------------------------- the housing
export interface PlateSpec extends Rect { text: string; ground?: 'yellow' | 'brass' | 'cream' | 'dark' | 'olive'; sub?: string; px?: number }
export interface LampSpec { x: number; y: number; r?: number; col: LampCol; on?: boolean; guard?: boolean }
export interface HousingSpec {
  w: number; h: number; seed?: number;
  tone?: Tone; depth?: number; cut?: number; wear?: number;
  /** the window cut through it (the screen / content), with a raised lip */
  win?: Rect & { cut?: number; lip?: number; lipTone?: Tone; back?: boolean };
  plates?: PlateSpec[];
  lamps?: LampSpec[];
  vents?: Rect[];
  glands?: { x: number; y: number; col?: number; drop?: number }[];
  /** raised hazard strips */
  hazards?: Rect[];
  /** hazard paint (flat) */
  hazPaint?: Rect[];
  bolts?: [number, number][];
  /** bolts in the corners (default true) and rivets along the edges */
  cornerBolts?: boolean; rivets?: boolean;
  guards?: boolean;
  handles?: { x: number; y0: number; y1: number }[];
  seamsY?: number[];
  welds?: [number, number, number, number][];
  stencils?: Stencil[];
  /** decor switches / knobs on the housing */
  toggles?: { x: number; y: number; on?: boolean }[];
  knobs?: { x: number; y: number; r?: number; a?: number }[];
  /** speaker grille (punched) areas, painted */
  grilles?: Rect[];
  /** dark wells painted in */
  wells?: Rect[];
  /** paper inventory stickers, yellow warning placards */
  stickers?: (Rect & { text: string })[]; placards?: (Rect & { text: string })[];
  /** red handwheel valves and brass pipe runs */
  valves?: { x: number; y: number; r?: number }[]; pipes?: [number, number, number, number][];
  hoodY?: number;
}
export interface Housing { root: THREE.Group; lamps: { lens: THREE.ShaderMaterial; halo: THREE.ShaderMaterial }[] }

export function housing(s: HousingSpec): Housing {
  const root = new THREE.Group();
  const W = s.w, H = s.h, seed = s.seed ?? 7, tone = s.tone ?? 'olive', T = TONES[tone];
  const d = s.depth ?? 8, cut = s.cut ?? Math.max(4, Math.min(14, Math.round(Math.min(W, H) * 0.07)));
  const holes: THREE.Vector2[][] = [];
  if (s.win && !s.win.back) { const wc = s.win.cut ?? 6; holes.push(clipRect(s.win.w, s.win.h, wc).map((p) => new THREE.Vector2(p.x + (s.win!.x + s.win!.w / 2) - W / 2, p.y - (s.win!.y + s.win!.h / 2) + H / 2))); }
  // ---- rust sources: every bolt and rivet
  const rust: [number, number][] = [];
  const bolts: [number, number][] = [...(s.bolts ?? [])];
  const inset = Math.max(6, cut * 0.5 + 5);
  if (s.cornerBolts !== false && W > 40 && H > 30) bolts.push([inset, inset], [W - inset, inset], [inset, H - inset], [W - inset, H - inset]);
  const rivets: [number, number][] = [];
  if (s.rivets !== false && W > 80 && H > 40) {
    const step = 26, e = W > 220 && H > 120 ? 4 : 2.6;
    for (let x = inset + 16; x < W - inset - 12; x += step) { rivets.push([x, e]); rivets.push([x, H - e]); }
    for (let y = inset + 16; y < H - inset - 12; y += step) { rivets.push([e, y]); rivets.push([W - e, y]); }
  }
  for (const b of bolts) rust.push(b);
  for (const r of rivets) if (hh(r[0], r[1], seed) > 0.6) rust.push(r);
  // ---- the paint
  const wells: Rect[] = [...(s.wells ?? [])];
  if (s.win?.back) wells.push({ x: s.win.x, y: s.win.y, w: s.win.w, h: s.win.h });
  for (const v of s.vents ?? []) wells.push(v);
  const grimeUnder: Rect[] = [...(s.vents ?? [])];
  for (const g of s.glands ?? []) grimeUnder.push({ x: g.x - 2, y: g.y, w: 4, h: 3 });
  const ps: PaintSpec = { w: W, h: H, tone, seed, cut, seamsY: s.seamsY, hazards: s.hazPaint, rustFrom: rust, grimeUnder, wells, stencils: s.stencils, wear: s.wear, hoodY: s.hoodY };
  const face = paintFace(ps);
  // speaker grilles: punched holes
  if (s.grilles?.length) {
    const c = face.getContext('2d')!;
    for (const g of s.grilles) for (let y = g.y + 1; y < g.y + g.h - 1; y += 3) for (let x = g.x + 1 + ((y / 3) & 1); x < g.x + g.w - 1; x += 3) {
      c.fillStyle = '#050504'; c.fillRect(x, y, 2, 2); c.fillStyle = 'rgba(200,210,170,0.25)'; c.fillRect(x, y + 2, 2, 1);
    }
  }
  // ---- the slab: an extruded chamfered outline, its front at z = 0
  const slab = new Mold().add(plate(clipRect(W, H, cut), d, Math.min(2.4, d * 0.3), holes), M(W / 2, -H / 2, -d), (_x, _y, _z, _nx, ny, nz) => (nz > 0.5 ? T[2] : ny > 0.3 ? T[3] : T[1]), PAINT);
  const faceTex = canvasTex(face);
  meshOf(slab, mxMat({ map: faceTex, wear: 0.5, seed }), root);
  // a raised rail round the edge (the case's lip): the field sits in it
  const rw = W > 220 && H > 120 ? 8 : W > 90 && H > 50 ? 5 : 0, rz = rw ? 2.6 : 0;
  if (rw) {
    const rail = new Mold().add(plate(clipRect(W, H, cut), rz, 0.9, [clipRect(W - rw * 2, H - rw * 2, Math.max(2, cut - rw * 0.55))]), M(W / 2, -H / 2, 0), (_x, _y, _z, _nx, _ny, nz) => (nz > 0.5 ? T[3] : T[1]), PAINT);
    const rm = mxMat({ map: faceTex, wear: 0.6, seed: seed + 1 }); (faceTex as any)._shared = true;
    meshOf(rail, rm, root);
  }
  // ---- hardware
  const hw = new Mold();
  for (const [x, y] of bolts) bolt(hw, x, y, 0, Math.min(2.6, Math.max(1.6, cut * 0.22)), 0x9aa29c, seed);
  for (const [x, y] of rivets) rivet(hw, x, y, rz, 1.25, T[3]);
  if (s.guards && W > 60 && H > 50) {
    const L = cut + 16;
    const corner = (fx: (x: number) => number, fy: (y: number) => number) => {
      const pts = [[cut, 0], [L, 0], [L, 5], [5, L], [0, L], [0, cut]].map(([x, y]) => new THREE.Vector2(fx(x), -fy(y)));
      // keep the winding counter-clockwise (mirrors flip it)
      if (THREE.ShapeUtils.isClockWise(pts)) pts.reverse();
      hw.add(plate(pts, 1.6, 0.5), M(0, 0, rz), 0x3c4236, STEEL);
    };
    corner((x) => x, (y) => y); corner((x) => W - x, (y) => y); corner((x) => x, (y) => H - y); corner((x) => W - x, (y) => H - y);
  }
  if (s.win) {
    const lip = s.win.lip ?? 5, wc = s.win.cut ?? 6, lt = TONES[s.win.lipTone ?? 'dark'];
    const { cx, cy } = crect(s.win, wc);
    const outer = clipRect(s.win.w + lip * 2, s.win.h + lip * 2, wc + lip * 0.6);
    hw.add(plate(outer, 3.4, 1.3, [clipRect(s.win.w, s.win.h, wc)]), M(cx, cy, 0), (_x, _y, _z, _nx, _ny, nz) => (nz > 0.8 ? lt[3] : nz > 0.3 ? lt[4] : lt[1]), STEEL);
    // four slotted screws on the lip
    if (lip >= 4) for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) screw(hw, cx + sx * (s.win.w / 2 + lip / 2), -cy + sy * (s.win.h / 2 + lip / 2 - wc * 0.25), 3.4, 1.3, 0xa8b0aa);
  }
  for (const v of s.vents ?? []) vent(hw, v, 0, T[1]);
  for (const g of s.glands ?? []) gland(hw, g.x, g.y, 0, g.col ?? 0x1a1a18, g.drop ?? 14, seed);
  for (const hd of s.handles ?? []) handle(hw, hd.x, hd.y0, hd.y1, 0);
  for (const [x0, y0, x1, y1] of s.welds ?? []) weld(hw, x0, y0, x1, y1, 0);
  for (const t of s.toggles ?? []) toggleOn(hw, t.x, t.y, 0, t.on ? 1 : -1, 0.8);
  for (const k of s.knobs ?? []) knobOn(hw, k.x, k.y, 0, k.r ?? 5, k.a ?? 0);
  for (const [x0, y0, x1, y1] of s.pipes ?? []) pipe(hw, x0, y0, x1, y1, 0);
  for (const v of s.valves ?? []) valve(hw, v.x, v.y, 0, v.r ?? 5);
  meshOf(hw, mxMat({ wear: 0.45, seed: seed + 3 }), root);
  for (const p of s.plates ?? []) printedPlate(root, p, 0, labelCanvas(p.w, p.h, p.text, { ground: p.ground, seed, sub: p.sub, px: p.px }), true, p.ground === 'brass' ? 0xb08a3a : TONES.yellow[2]);
  for (const hz of s.hazards ?? []) printedPlate(root, hz, 0, hazardCanvas(hz.w, hz.h, seed), hz.w > 40, TONES.yellow[2]);
  for (const st of s.stickers ?? []) printedPlate(root, st, -0.9, stickerCanvas(st.w, st.h, st.text, seed), false, TONES.cream[3]);
  for (const pl of s.placards ?? []) printedPlate(root, pl, 0, placardCanvas(pl.w, pl.h, pl.text, seed), true, TONES.yellow[2]);
  const lamps = (s.lamps ?? []).map((l) => { const o = lamp(root, l.x, l.y, 0, l.r ?? 3, l.col, l.guard); setLamp(o, l.on ? 1 : 0); return o; });
  return { root, lamps };
}

// ---------------------------------------------------------------- small switchgear (also used as decor on housings)
/** a bat-handle toggle: nut, bushing, the bat thrown up (dir 1) or down (-1); `t` -1..1 for the flip in between */
export function toggleOn(m: Mold, x: number, y: number, z: number, t: number, k = 1) {
  m.add(fcyl(3.1 * k, 1.4, 6, 3.1 * k, 0.25), M(x, -y, z + 0.7, R90), 0x8a928e, STEEL)
    .add(fcyl(2.1 * k, 2.4, 10, 2.1 * k, 0.2), M(x, -y, z + 2.4, R90), 0xa8b0ac, CHROME);
  const a = t * 0.62, L = 12 * k;
  const tip: [number, number, number] = [x, -y + Math.sin(a) * L, z + 3.4 + Math.cos(a) * L];
  m.add(frod([x, -y, z + 3.2], tip, 1.25 * k, 6), null, 0xe2e8e4, CHROME)
    .add(gem(1.9 * k, 0, 0.05, 2), M(tip[0], tip[1], tip[2]), 0xf0f4f0, CHROME);
}
/** a small bakelite pointer knob on the panel (decor), turned to angle a */
export function knobOn(m: Mold, x: number, y: number, z: number, r: number, a: number) {
  m.add(fcyl(r * 1.15, 0.8, 14, r * 1.25, 0.3), M(x, -y, z + 0.4, R90), 0x9aa29c, STEEL)
    .add(fcyl(r * 0.82, 3.2, 14, r, 0.22), M(x, -y, z + 2.4, R90), 0x1a1a16, PLASTIC)
    .add(fbox(r * 0.24, r * 0.9, 0.6, 0.1), M(x - Math.sin(a) * r * 0.45, -y + Math.cos(a) * r * 0.45, z + 4.05, 0, 0, a), 0xe8dcb0, PAINT);
}

// ---------------------------------------------------------------- keys (push buttons)
export type KeyState = 0 | 1 | 2 | 3 | 4; // rest, hot, down, latched on, disabled
export const KEY_Z: Record<KeyState, number> = { 0: 8, 1: 8, 2: 1.4, 3: 4, 4: 8 };
export interface KeySpec { w: number; h: number; tone?: Tone; bezel?: Tone; lamp?: LampCol | false; seed?: number; screws?: boolean; hazard?: boolean }
/** where the key's cap sits (spec space, at z = 0) */
export function keyLayout(s: KeySpec) {
  const H = s.h, W = s.w;
  const lr = s.lamp ? Math.max(2.6, Math.min(5.5, H * 0.16)) : 0;
  const lx = s.lamp ? 5 + lr + 1.5 : 0;
  const x0 = s.lamp ? Math.round(lx + lr + 5) : 4;
  const x1 = W - (s.screws !== false && W > 90 ? 11 : 4);
  return { lr, lx, ly: H / 2, cap: { x: x0, y: 4, w: Math.max(6, x1 - x0), h: Math.max(6, H - 8) } };
}
export function keyPart(s: KeySpec, st: KeyState): THREE.Group {
  const root = new THREE.Group();
  const seed = s.seed ?? 3, L = keyLayout(s);
  const bez = TONES[s.bezel ?? 'dark'];
  // the mounting bezel: dark steel, a gasket groove round the cap, two screws
  const bezFace = paintFace({ w: s.w, h: s.h, tone: s.bezel ?? 'dark', seed, cut: 4, wear: 0.5, wells: [{ x: L.cap.x - 2, y: L.cap.y - 2, w: L.cap.w + 4, h: L.cap.h + 4 }], hazards: s.hazard ? [{ x: L.cap.x + L.cap.w + 2, y: 2, w: Math.max(0, s.w - L.cap.x - L.cap.w - 4), h: s.h - 4 }] : undefined });
  const bm = new Mold().add(plate(clipRect(s.w, s.h, 4), 3, 0.9), M(s.w / 2, -s.h / 2, -3), (_x, _y, _z, _nx, _ny, nz) => (nz > 0.5 ? bez[2] : bez[1]), STEEL);
  meshOf(bm, mxMat({ map: canvasTex(bezFace), wear: 0.4, seed }), root);
  const hw = new Mold();
  if (s.screws !== false && s.w > 90) { screw(hw, s.w - 6, 6.5, 0, 1.5); screw(hw, s.w - 6, s.h - 6.5, 0, 1.5); }
  meshOf(hw, mxMat({ seed: seed + 1 }), root);
  // the cap: a thick chamfered enamel block that rides in the gasket
  const zc = KEY_Z[st], depth = 11;
  const cut = Math.min(3, L.cap.h * 0.18);
  const capFace = paintFace({ w: L.cap.w, h: L.cap.h, tone: s.tone ?? 'olive', seed: seed + 5, cut, wear: 0.38 });
  const { pts, cx, cy } = crect(L.cap, cut);
  const T = TONES[s.tone ?? 'olive'];
  const cm = new Mold().add(plate(pts, depth, 1.1), M(cx, cy, zc - depth), (_x, _y, _z, _nx, ny, nz) => (nz > 0.5 ? T[2] : ny < -0.3 ? T[0] : T[1]), PAINT);
  const capMat = mxMat({ map: canvasTex(capFace), wear: 0.3, seed: seed + 2 });
  capMat.uniforms.uDim.value = st === 4 ? 0.55 : st === 1 ? 1.1 : st === 2 ? 0.92 : 1;
  meshOf(cm, capMat, root);
  if (s.lamp) {
    const l = lamp(root, L.lx, L.ly, 0, L.lr, s.lamp);
    setLamp(l, st === 1 || st === 2 || st === 3 ? 1 : 0);
  }
  return root;
}

// ---------------------------------------------------------------- a bat toggle on its own plate
export const TOG_W = 34, TOG_H = 48;
export function togglePart(t: number, lit: boolean, seed = 9): THREE.Group {
  const root = new THREE.Group();
  const face = paintFace({ w: TOG_W, h: TOG_H, tone: 'olive', seed, cut: 4, wear: 0.5 });
  const c = face.getContext('2d')!;
  c.fillStyle = '#e8c440'; c.fillRect(4, 3, TOG_W - 8, 1); c.fillStyle = '#14120c'; c.fillRect(4, TOG_H - 4, TOG_W - 8, 1);
  c.font = "8px Alagard, monospace"; c.textAlign = 'left'; c.fillStyle = '#e8c440'; c.fillText('ON', 4, 12); c.fillStyle = '#d8d8c0'; c.fillText('OFF', 4, TOG_H - 6);
  const pm = new Mold().add(plate(clipRect(TOG_W, TOG_H, 4), 3, 0.9), M(TOG_W / 2, -TOG_H / 2, -3), (_x, _y, _z, _nx, _ny, nz) => (nz > 0.5 ? TONES.olive[2] : TONES.olive[1]), PAINT);
  meshOf(pm, mxMat({ map: canvasTex(face), seed }), root);
  const hw = new Mold();
  screw(hw, 5.5, 5.5, 0, 1.3); screw(hw, TOG_W - 5.5, TOG_H - 5.5, 0, 1.3);
  toggleOn(hw, TOG_W / 2 + 3, TOG_H / 2 + 2, 0, t, 1);
  meshOf(hw, mxMat({ seed: seed + 1 }), root);
  const l = lamp(root, TOG_W - 7, 7, 0, 2.6, 'green');
  setLamp(l, lit ? 1 : 0);
  return root;
}

// ---------------------------------------------------------------- a rotary knob over a printed scale
export function knobScale(s: number, seed = 4): HTMLCanvasElement {
  const cv = paintFace({ w: s, h: s, tone: 'dark', seed, cut: 4, wear: 0.4 });
  const c = cv.getContext('2d')!;
  const cx = s / 2, cy = s / 2, r0 = s * 0.42, r1 = s * 0.47;
  for (let i = 0; i <= 10; i++) {
    const a = -Math.PI * 0.75 + (i / 10) * Math.PI * 1.5 - Math.PI / 2;
    const big = i % 5 === 0;
    c.strokeStyle = i >= 8 ? '#e8642a' : '#e8c440'; c.lineWidth = big ? 2 : 1;
    c.beginPath(); c.moveTo(cx + Math.cos(a) * (big ? r0 - 2 : r0), cy + Math.sin(a) * (big ? r0 - 2 : r0)); c.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); c.stroke();
  }
  return cv;
}
export function knobPart(s: number, v: number, seed = 4, scaleTex?: THREE.Texture): THREE.Group {
  const root = new THREE.Group();
  const tex = scaleTex ?? canvasTex(knobScale(s, seed));
  const pm = new Mold().add(plate(clipRect(s, s, 4), 2.5, 0.8), M(s / 2, -s / 2, -2.5), 0x282c24, STEEL);
  const mm = mxMat({ map: tex, seed }); if (scaleTex) { (tex as any)._keep = true; }
  meshOf(pm, mm, root);
  const r = s * 0.3, cx = s / 2, cy = -s / 2;
  const g = new THREE.Group(); g.position.set(cx, cy, 0);
  const a = -(-Math.PI * 0.75 + v * Math.PI * 1.5);
  g.rotation.z = a;
  const km = new Mold()
    .add(fcyl(r * 1.08, 1.6, 18, r * 1.18, 0.3), M(0, 0, 0.8, R90), 0x16160f, PLASTIC)
    .add(fcyl(r * 0.78, 4.6, 12, r * 0.9, 0.22), M(0, 0, 3.6, R90), 0x22221a, PLASTIC);
  for (let i = 0; i < 12; i++) { const q = (i / 12) * Math.PI * 2; km.add(fbox(0.9, 1, 4.2, 0.1), M(Math.cos(q) * r * 0.86, Math.sin(q) * r * 0.86, 3.6, 0, 0, q), 0x30302a, PLASTIC); }
  km.add(fcyl(r * 0.5, 0.6, 10, r * 0.55, 0.3), M(0, 0, 6.1, R90), 0xb8c0bc, CHROME)
    .add(fbox(1.4, r * 1.25, 1.2, 0.1), M(0, r * 0.62, 5.6), 0xf0d050, PAINT)
    .add(fbox(1.2, 3, 1, 0.1), M(0, r * 1.1, 1.9), 0xf0d050, PAINT);
  meshOf(km, mxMat({ seed: seed + 2, wear: 0.25 }), g);
  root.add(g);
  return root;
}

// ---------------------------------------------------------------- an analog gauge (the needle moves)
export function gaugeDial(s: number, label: string, red = 0.8, seed = 6): HTMLCanvasElement {
  const cv = paintFace({ w: s, h: s, tone: 'cream', seed, cut: 2, wear: 0.25 });
  const c = cv.getContext('2d')!;
  const cx = s / 2, cy = s * 0.6, r = s * 0.4;
  for (let i = 0; i <= 20; i++) {
    const t = i / 20, a = Math.PI * (1.15 + t * 0.7), big = i % 5 === 0;
    c.strokeStyle = t >= red ? '#b8281c' : '#2a2418'; c.lineWidth = big ? 1.6 : 1;
    c.beginPath(); c.moveTo(cx + Math.cos(a) * (r - (big ? 5 : 3)), cy + Math.sin(a) * (r - (big ? 5 : 3))); c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); c.stroke();
  }
  c.fillStyle = 'rgba(184,40,28,0.35)';
  c.beginPath(); c.arc(cx, cy, r + 0.5, Math.PI * (1.15 + red * 0.7), Math.PI * 1.85); c.arc(cx, cy, r - 3, Math.PI * 1.85, Math.PI * (1.15 + red * 0.7), true); c.fill();
  if (label) { c.fillStyle = '#2a2418'; c.font = `${Math.max(8, Math.round(s * 0.16))}px Alagard, monospace`; c.textAlign = 'center'; c.fillText(label, cx, s * 0.86); }
  return cv;
}
export interface GaugeRig { root: THREE.Group; needle: THREE.Group }
export function gaugePart(s: number, dial: THREE.Texture, tone: Tone = 'olive'): GaugeRig {
  const root = new THREE.Group();
  const T = TONES[tone];
  const bm = new Mold().add(plate(clipRect(s, s, 4), 3, 1, [clipRect(s - 6, s - 6, 2)]), M(s / 2, -s / 2, 0), (_x, _y, _z, _nx, _ny, nz) => (nz > 0.5 ? T[2] : T[1]), PAINT);
  screw(bm, 3.2, 3.2, 3, 1.1); screw(bm, s - 3.2, s - 3.2, 3, 1.1);
  meshOf(bm, mxMat({ wear: 0.4 }), root);
  const fm = new Mold().add(plate(clipRect(s - 6, s - 6, 2), 0.6, 0), M(s / 2, -s / 2, -0.4), 0xe6dcc0, PAINT);
  (dial as any)._keep = true;
  meshOf(fm, mxMat({ map: dial, wear: 0.1 }), root);
  const needle = new THREE.Group(); needle.position.set(s / 2, -s * 0.6, 0.8);
  const nm = new Mold().add(fbox(1.2, s * 0.38, 0.6, 0.1), M(0, s * 0.19 - 1, 0), 0xb01a10, PAINT)
    .add(fcyl(1.8, 1.2, 8, 1.8, 0.3), M(0, 0, 0.4, R90), 0x1c1f23, STEEL);
  meshOf(nm, mxMat({ seed: 5 }), needle);
  root.add(needle);
  return { root, needle };
}
export function needleAngle(v: number) { return -(Math.PI * (1.15 + Math.max(0, Math.min(1, v)) * 0.7) - Math.PI * 1.5); }

// ---------------------------------------------------------------- a hotbar socket
export const SOCK = 54;
export function socketPart(n: number, held: boolean, seed = 31): THREE.Group {
  const root = new THREE.Group();
  const S = SOCK, bed: Rect = { x: 7, y: 7, w: S - 14, h: S - 14 };
  const face = paintFace({ w: S, h: S, tone: 'olive', seed: seed + n, cut: 7, wear: 0.6, rustFrom: [[S - 7, S - 7]] });
  const holes = [clipRect(bed.w, bed.h, 4)];
  const sm = new Mold().add(plate(clipRect(S, S, 7), 6, 1.4, holes), M(S / 2, -S / 2, -6), (_x, _y, _z, _nx, _ny, nz) => (nz > 0.5 ? TONES.olive[2] : TONES.olive[1]), PAINT);
  meshOf(sm, mxMat({ map: canvasTex(face), seed: seed + n }), root);
  // the felt bed at the bottom of the cup
  const felt = paintFace({ w: bed.w, h: bed.h, tone: 'dark', seed: seed + 9, cut: 3, wear: 0 });
  if (held) { const c = felt.getContext('2d')!; const g = c.createLinearGradient(0, bed.h, 0, bed.h * 0.4); g.addColorStop(0, 'rgba(255,176,42,0.55)'); g.addColorStop(1, 'rgba(255,176,42,0)'); c.fillStyle = g; c.fillRect(0, 0, bed.w, bed.h); }
  const fm = new Mold().add(plate(clipRect(bed.w + 2, bed.h + 2, 4), 1, 0), M(S / 2, -S / 2, -6.5), 0x1a1c16, RUBBER);
  meshOf(fm, mxMat({ map: canvasTex(felt), wear: 0 }), root);
  const hw = new Mold();
  bolt(hw, S - 5.5, S - 5.5, 0, 1.6);
  if (held) hw.add(fbox(bed.w - 6, 1.6, 1.2, 0.2), M(S / 2, -(bed.y + bed.h - 2), -5.6), 0xffc040, PAINT, 1);
  const hm = mxMat({ seed: 4 });
  if (held) hm.uniforms.uGlow.value.set(1.0, 0.68, 0.16);
  meshOf(hw, hm, root);
  // the number tag
  printedPlate(root, { x: 2, y: 2, w: 13, h: 12 }, 0, labelCanvas(13, 12, String(n), { ground: held ? 'yellow' : 'olive', ink: held ? 0x14120c : 0xe8c440, border: false, px: 11, seed: n }), false, held ? TONES.yellow[2] : TONES.olive[2]);
  const l = lamp(root, S - 6, 6, 0, 2, 'amber');
  setLamp(l, held ? 1 : 0);
  return root;
}
