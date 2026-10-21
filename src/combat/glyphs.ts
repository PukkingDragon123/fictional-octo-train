// World-space combat marks, physical retro things drawn in the scene itself
// (text is never drawn here: words float free in real type, src/combat/words.ts):
// brass needle gauges for a charge or a struggle, an enamel hazard sign over
// something winding up, an enamel skull over something you can finish, the
// timed struggle's target and closing hoop, chalk tally marks scratched on
// the floor round the feet, impact stars, and the weapon's own ember glow,
// sparks and swing trails. Immediate mode: callers place marks every frame
// between begin() and end(); sprites, materials, textures and particles are
// pooled (no per-frame allocation in the hot path).
import * as THREE from 'three';
import { G } from '../game/G';


// warm, painted, enamel-and-brass palette
const INK = 0x1c120a, CREAM = 0xeadcb4, CREAM_D = 0xbfa97c, CREAM_L = 0xfff4d8;
const BRASS = 0xb8902c, BRASS_L = 0xe8c860, BRASS_D = 0x6a4e16;
const STEEL = 0x9a988a, STEEL_D = 0x55544a;
const BRICK = 0xa8321e, BRICK_L = 0xd0583a, BRICK_D = 0x641a10;
const MUSTARD = 0xd89a28;
const CHALK = 0xe8dcc0;

/** a little RGBA canvas we draw pixels into, turned into a crisp texture */
class Pix {
  d: Uint8ClampedArray<ArrayBuffer>;
  constructor(public w: number, public h: number) { this.d = new Uint8ClampedArray(new ArrayBuffer(w * h * 4)); }
  px(x: number, y: number, c: number, a = 255) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.d[i] = (c >> 16) & 255; this.d[i + 1] = (c >> 8) & 255; this.d[i + 2] = c & 255; this.d[i + 3] = a;
  }
  on(x: number, y: number) { return x >= 0 && y >= 0 && x < this.w && y < this.h && this.d[(y * this.w + x) * 4 + 3] > 0; }
  rect(x: number, y: number, w: number, h: number, c: number, a = 255) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c, a); }
  disc(cx: number, cy: number, r: number, c: number) { for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.6) this.px(cx + x, cy + y, c); }
  /** a 1px dark outline round everything drawn so far */
  outline(c = INK) {
    const src = this.d.slice();
    const at = (x: number, y: number) => x >= 0 && y >= 0 && x < this.w && y < this.h && src[(y * this.w + x) * 4 + 3] > 128;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (at(x, y)) continue;
      if (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) this.px(x, y, c);
    }
  }
  /** a hard drop shadow down-right (it sits on something) */
  shadow(dx = 1, dy = 1) {
    const src = this.d.slice();
    for (let y = this.h - 1; y >= 0; y--) for (let x = this.w - 1; x >= 0; x--) {
      const sx = x - dx, sy = y - dy;
      if (sx < 0 || sy < 0 || this.on(x, y)) continue;
      if (src[(sy * this.w + sx) * 4 + 3] > 128) this.px(x, y, INK, 150);
    }
  }
  /** stamp a small 1-bit bitmap (rows of '#' / 'o') */
  art(rows: string[], x: number, y: number, c: number, c2 = c) { rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) { if (r[i] === '#') this.px(x + i, y + j, c); else if (r[i] === 'o') this.px(x + i, y + j, c2); } }); }
  texture(): THREE.Texture {
    const cv = document.createElement('canvas'); cv.width = this.w; cv.height = this.h;
    cv.getContext('2d')!.putImageData(new ImageData(this.d, this.w, this.h), 0, 0);
    const t = new THREE.CanvasTexture(cv);
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
}
const hash = (x: number, y: number) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };

// ------------------------------------------------------------------ the pieces
/** small pictograms for the enamel badges */
const ICON: Record<string, string[]> = {
  skull: ['..#####..', '.#######.', '#########', '#..#.#..#', '#..#.#..#', '#########', '.###.###.', '..#####..', '..#.#.#..'],
  bang: ['###', '###', '###', '###', '.#.', '...', '###'],
};

/** a round enamel badge (brass rim, coloured enamel, cream pictogram) */
function badge(icon: string, fill: number, fillD: number, shape: 'round' | 'shield' = 'round'): Pix {
  const r = 8, S = r * 2 + 3, P = new Pix(S + 1, S + 2), c = r + 1;
  for (let y = -r; y <= r + (shape === 'shield' ? 2 : 0); y++) for (let x = -r; x <= r; x++) {
    let inside: boolean, edge: number;
    if (shape === 'shield') {
      const yy = y < 0 ? y : y * 1.4;
      inside = y < 1 ? Math.abs(x) <= r && y >= -r : Math.hypot(x * 0.9, yy) <= r + 0.2;
      edge = y < 1 ? Math.min(r - Math.abs(x), y + r) : r + 0.2 - Math.hypot(x * 0.9, yy);
    } else { const d = Math.hypot(x, y); inside = d <= r + 0.3; edge = r + 0.3 - d; }
    if (!inside) continue;
    const rim = edge < 1.8;
    P.px(c + x, c + y, rim ? (x + y < 0 ? BRASS_L : y > 2 ? BRASS_D : BRASS) : (x + y < -5 ? mix(fill, 0xffffff, 0.18) : y > 3 ? fillD : fill));
  }
  const ic = ICON[icon];
  if (ic) {
    const iw = ic[0].length, ih = ic.length, ox = c - (iw >> 1), oy = c - (ih >> 1) + (shape === 'shield' ? 1 : 0);
    P.art(ic, ox + 1, oy + 1, INK);
    P.art(ic, ox, oy, CREAM_L);
  }
  P.outline(); P.shadow();
  return P;
}
function mix(a: number, b: number, t: number) {
  const r = ((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t, g = ((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t, bl = (a & 255) * (1 - t) + (b & 255) * t;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}

/** a hazard sign: yellow enamel triangle, black bang (a creature winding up) */
function warnSign(): Pix {
  const w = 17, h = 15, P = new Pix(w + 2, h + 2);
  for (let y = 0; y < h; y++) {
    const half = (y / (h - 1)) * (w / 2);
    for (let x = 0; x < w; x++) {
      const dx = Math.abs(x - (w - 1) / 2);
      if (dx > half + 0.2) continue;
      const rim = dx > half - 1.6 || y > h - 3;
      P.px(x, y, rim ? INK : y < 6 ? 0xf0c040 : MUSTARD);
    }
  }
  P.art(ICON.bang, 7, 5, INK);
  P.outline(INK); P.shadow();
  return P;
}

/** a brass pressure gauge: cream face, ticks, a red zone, the needle at v 0..1 */
function gauge(v: number, hot: boolean): Pix {
  const r = 10, S = r * 2 + 3, P = new Pix(S + 1, S + 1), c = r + 1;
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
    const d = Math.hypot(x, y);
    if (d > r + 0.3) continue;
    P.px(c + x, c + y, d > r - 2 ? (x + y < 0 ? BRASS_L : BRASS_D) : d > r - 2.8 ? BRASS_D : y < -4 ? CREAM_L : CREAM);
  }
  // 270 degrees of sweep, from bottom-left round to bottom-right
  const ang = (u: number) => (135 + u * 270) * Math.PI / 180;
  for (let u = 0.78; u <= 1.0001; u += 0.01) for (let rr = r - 4.5; rr <= r - 2.8; rr += 0.5) { const a = ang(u); P.px(c + Math.cos(a) * rr, c + Math.sin(a) * rr, hot ? BRICK_L : BRICK); }
  for (let i = 0; i <= 8; i++) { const a = ang(i / 8); for (let rr = r - 4.2; rr <= r - 2.8; rr += 0.6) P.px(c + Math.cos(a) * rr, c + Math.sin(a) * rr, INK); }
  const a = ang(Math.max(0, Math.min(1, v)));
  for (let t = 0; t <= r - 3; t += 0.4) P.px(c + Math.cos(a) * t, c + Math.sin(a) * t, v >= 0.78 ? BRICK_D : INK);
  P.disc(c, c, 1, BRASS_D); P.px(c, c, BRASS_L);
  P.outline(); P.shadow();
  return P;
}



function star(): Pix {
  const P = new Pix(15, 15);
  for (let i = 0; i < 7; i++) { P.px(7, i, 0xffffff); P.px(7, 14 - i, 0xffffff); P.px(i, 7, 0xffffff); P.px(14 - i, 7, 0xffffff); }
  for (let i = 2; i < 6; i++) { P.px(i + 1, i + 1, 0xffffff); P.px(13 - i, i + 1, 0xffffff); P.px(i + 1, 13 - i, 0xffffff); P.px(13 - i, 13 - i, 0xffffff); }
  P.rect(6, 6, 3, 3, 0xffffff);
  return P;
}
function glow(): Pix {
  const n = 16, P = new Pix(n, n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const d = Math.hypot(x - n / 2 + 0.5, y - n / 2 + 0.5) / (n / 2); if (d < 1) P.px(x, y, 0xffffff, Math.round(255 * Math.pow(1 - d, 1.6))); }
  return P;
}
function spark(): Pix { const P = new Pix(3, 3); P.px(1, 0, 0xffffff); P.px(0, 1, 0xffffff); P.px(1, 1, 0xffffff); P.px(2, 1, 0xffffff); P.px(1, 2, 0xffffff); return P; }
/** the timed struggle's target: concentric enamel rings, and the brass ring closing on it */
function target(): Pix {
  const r = 9, P = new Pix(r * 2 + 3, r * 2 + 3), c = r + 1;
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
    const d = Math.hypot(x, y);
    if (d > r + 0.3) continue;
    P.px(c + x, c + y, d > r - 1.5 ? INK : d > 6.5 ? CREAM : d > 4.5 ? BRICK : d > 2.5 ? CREAM : BRICK);
  }
  P.shadow();
  return P;
}
function hoop(): Pix {
  const n = 33, P = new Pix(n, n), c = (n - 1) / 2;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const d = Math.hypot(x - c, y - c); if (d > c - 2.6 && d < c - 0.4) P.px(x, y, (x + y) < n ? BRASS_L : BRASS); else if (d >= c - 0.4 && d < c + 0.4 || d > c - 3.4 && d <= c - 2.6) P.px(x, y, INK); }
  return P;
}
function spiral(): Pix {
  const P = new Pix(15, 11);
  for (let a = 0; a < 14; a += 0.12) { const r = 0.45 * a; P.px(7 + Math.cos(a) * r * 1.2, 5 + Math.sin(a) * r * 0.6, CREAM); }
  P.outline();
  return P;
}

interface Tex { tex: THREE.Texture; w: number; h: number }
const cache = new Map<string, Tex>();
const BADGES: Record<string, [string, number, number, ('round' | 'shield')?]> = {
  skull: ['skull', BRICK, BRICK_D, 'shield'],
};

/**
 * Cached glyph texture by name: 'badge:skull', 'gauge:<0..24>' / 'gauge:<n>:hot', 'warn', 'star',
 * 'spark', 'glow', 'target', 'hoop', 'pip' / 'pip:on', 'dizzy'.
 */
export function glyph(name: string): Tex {
  let t = cache.get(name);
  if (t) return t;
  let P: Pix;
  const [kind, arg, arg2] = name.split(':');
  if (kind === 'badge') { const b = BADGES[arg] ?? BADGES.skull; P = badge(b[0], b[1], b[2], b[3]); }
  else if (kind === 'gauge') P = gauge(Number(arg) / 24, arg2 === 'hot');
  else if (name === 'warn') P = warnSign();
  else if (name === 'star') P = star();
  else if (name === 'spark') P = spark();
  else if (name === 'glow') P = glow();
  else if (name === 'target') P = target();
  else if (name === 'hoop') P = hoop();
  else if (name === 'dizzy') P = spiral();
  else if (kind === 'pip') { P = new Pix(7, 7); P.disc(3, 3, 2, arg === 'on' ? BRASS_L : STEEL_D); P.px(2, 2, arg === 'on' ? CREAM_L : STEEL); P.outline(); }
  else P = badge('bang', BRICK, BRICK_D);
  t = { tex: P.texture(), w: P.w, h: P.h };
  cache.set(name, t);
  return t;
}
/** gauge glyph name for a needle at v (0..1) */
export const gaugeName = (v: number, hot = false) => 'gauge:' + Math.round(Math.max(0, Math.min(1, v)) * 24) + (hot ? ':hot' : '');

// ------------------------------------------------------------------ the mark layer
/**
 * The main pass draws into two targets (colour + the normal / outline buffer, src/gfx/materials.ts):
 * every fragment shader has to write both. Ours leave the normal buffer as it was (alpha 0 blends away).
 */
function mrtSafe<T extends THREE.Material>(m: T): T {
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = 'layout(location = 1) out highp vec4 gNormal;\n' + sh.fragmentShader.replace(/\}\s*$/, '  gNormal = vec4(0.0);\n}\n');
  };
  m.customProgramCacheKey = () => 'cb-mrt-' + m.type;
  return m;
}
/** texels per metre the glyph art is drawn for (the default camera zoom) */
const TPM = 28;

export interface MarkOpts { color?: number; opacity?: number; scale?: number; add?: boolean; rot?: number }
interface Spark { x: number; y: number; z: number; vx: number; vy: number; vz: number; t: number; life: number; c: number; s: number; grav: number }

export class Marks {
  root = new THREE.Group();
  private sprites: THREE.Sprite[] = [];
  private n = 0;
  private sparks: Spark[] = [];
  private rings: { back: THREE.Mesh; fill: THREE.Mesh }[] = [];
  private nr = 0;
  private tickGeo: THREE.BufferGeometry;
  private static TICKS = 20;
  private lastT = performance.now();

  constructor() {
    this.root.name = 'combat-marks';
    this.tickGeo = scratchRing(Marks.TICKS);
  }
  attach() { if (!this.root.parent && G.pr?.scene) G.pr.scene.add(this.root); }

  begin() { this.n = 0; this.nr = 0; }

  /** place a glyph sprite at a world point this frame */
  mark(name: string, x: number, y: number, z: number, o: MarkOpts = {}) {
    let s = this.sprites[this.n];
    if (!s) {
      const m = mrtSafe(new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false, fog: false }));
      s = new THREE.Sprite(m);
      s.renderOrder = 995;
      s.frustumCulled = false;
      this.sprites.push(s); this.root.add(s);
    }
    this.n++;
    const t = glyph(name);
    const m = s.material as THREE.SpriteMaterial;
    if (m.map !== t.tex) { m.map = t.tex; m.needsUpdate = true; }
    const blend = o.add ? THREE.AdditiveBlending : THREE.NormalBlending;
    if (m.blending !== blend) { m.blending = blend; m.needsUpdate = true; }
    m.color.setHex(o.color ?? 0xffffff);
    m.opacity = o.opacity ?? 1;
    m.rotation = o.rot ?? 0;
    const k = (o.scale ?? 1) / TPM;
    s.scale.set(t.w * k, t.h * k, 1);
    s.position.set(x, y, z);
    s.visible = true;
    return s;
  }

  /** chalk tally scratches round a point on the floor: `fill` 0..1 of them drawn bright, the rest scuffed */
  ring(x: number, y: number, z: number, r: number, fill: number, col = CHALK, back = 0x2a2016, op = 0.9) {
    let R = this.rings[this.nr];
    if (!R) {
      const mk = (c: number, o: number, ord: number) => { const m = mrtSafe(new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, depthTest: false, side: THREE.DoubleSide, fog: false })); const me = new THREE.Mesh(this.tickGeo, m); me.renderOrder = ord; me.frustumCulled = false; this.root.add(me); return me; };
      const fillM = mk(col, 0.9, 993);
      fillM.userData.n = 0;
      // the scratches run round the circle: draw only the first n
      fillM.onBeforeRender = () => { this.tickGeo.setDrawRange(0, fillM.userData.n * 6); };
      fillM.onAfterRender = () => { this.tickGeo.setDrawRange(0, Infinity); };
      R = { back: mk(back, 0.5, 992), fill: fillM };
      this.rings.push(R);
    }
    this.nr++;
    for (const m of [R.back, R.fill]) { m.position.set(x, y + 0.04, z); m.scale.set(r, 1, r); m.visible = true; }
    const bm = R.back.material as THREE.MeshBasicMaterial; bm.color.setHex(back); bm.opacity = op * 0.5;
    const fm = R.fill.material as THREE.MeshBasicMaterial; fm.color.setHex(col); fm.opacity = op;
    const k = Math.round(Math.max(0, Math.min(1, fill)) * Marks.TICKS);
    R.fill.visible = k > 0;
    R.fill.userData.n = k;
  }

  /** a hot spark / ember (gravity pulls it down) or, with grav 0 and no speed, a swing-trail dab */
  spark(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, c = 0xffb050, s = 1, grav = 9) {
    if (this.sparks.length > 64) this.sparks.shift();
    this.sparks.push({ x, y, z, vx, vy, vz, t: 0, life, c, s, grav });
  }

  end() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastT) / 1000);
    this.lastT = now;
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.t += dt;
      if (s.t >= s.life) { this.sparks.splice(i, 1); continue; }
      s.vy -= s.grav * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
      const u = s.t / s.life;
      this.mark('spark', s.x, s.y, s.z, { color: s.c, add: true, opacity: 1 - u * u, scale: s.s * (1 - u * 0.5) });
    }
    for (let i = this.n; i < this.sprites.length; i++) this.sprites[i].visible = false;
    for (let i = this.nr; i < this.rings.length; i++) { this.rings[i].back.visible = false; this.rings[i].fill.visible = false; }
  }
}

/** n short radial scratches round a unit circle (a little uneven, like they were gouged by hand), in order */
function scratchRing(n: number): THREE.BufferGeometry {
  const pos: number[] = [], idx: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2 + (hash(i, 1) - 0.5) * 0.08;
    const r0 = 0.78 + hash(i, 2) * 0.06, r1 = 1.0 - hash(i, 3) * 0.05, w = 0.035 + hash(i, 4) * 0.015;
    const lean = (hash(i, 5) - 0.5) * 0.12;
    const ca = Math.cos(a), sa = Math.sin(a), ct = Math.cos(a + Math.PI / 2), st = Math.sin(a + Math.PI / 2);
    const b = pos.length / 3;
    pos.push(ca * r0 - ct * w, 0, sa * r0 - st * w, ca * r0 + ct * w, 0, sa * r0 + st * w);
    pos.push(Math.cos(a + lean) * r1 + ct * w * 0.7, 0, Math.sin(a + lean) * r1 + st * w * 0.7, Math.cos(a + lean) * r1 - ct * w * 0.7, 0, Math.sin(a + lean) * r1 - st * w * 0.7);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}
