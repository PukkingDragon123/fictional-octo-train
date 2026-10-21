// World-space combat marks: pixel glyphs drawn into the scene itself (no
// panels): QTE key prompts near the survivor, execution skulls over a broken
// enemy, floating combo words, impact stars, charge and progress rings on
// the floor, the glow of a charged weapon and an attacker's wind-up glint.
// Immediate mode: callers place marks every frame between begin() and end();
// sprites, materials and textures are pooled and cached (no per-frame allocation).
import * as THREE from 'three';
import { G } from '../game/G';

// ------------------------------------------------------------------ a tiny 5x7 pixel font (uppercase, digits, a few signs)
const F: Record<string, string> = {
  ' ': '...................................', '!': '..#....#....#....#....#.........#..', '+': '.......#....#..#####..#....#.......',
  '-': '...............#####...............', '.': '..........................##...##..', '0': '.###.#...##..###.#.###..##...#.###.',
  '1': '..#...##....#....#....#....#...###.', '2': '.###.#...#....#...#...#...#...#####', '3': '#####...#...#.....#.....##...#.###.',
  '4': '...#...##..#.#.#..#.#####...#....#.', '5': '######....####.....#....##...#.###.', '6': '..##..#...#....####.#...##...#.###.',
  '7': '#####....#...#...#...#....#....#...', '8': '.###.#...##...#.###.#...##...#.###.', '9': '.###.#...##...#.####....#...#..##..',
  '<': '...#...#...#...#.....#.....#.....#.', '>': '.#.....#.....#.....#...#...#...#...', A: '.###.#...##...##...#######...##...#',
  B: '####.#...##...#####.#...##...#####.', C: '.###.#...##....#....#....#...#.###.', D: '###..#..#.#...##...##...##..#.###..',
  E: '######....#....####.#....#....#####', F: '######....#....####.#....#....#....', G: '.###.#...##....#.####...##...#.####',
  H: '#...##...##...#######...##...##...#', I: '.###...#....#....#....#....#...###.', J: '..###...#....#....#....#.#..#..##..',
  K: '#...##..#.#.#..##...#.#..#..#.#...#', L: '#....#....#....#....#....#....#####', M: '#...###.###.#.##.#.##...##...##...#',
  N: '#...##...###..##.#.##..###...##...#', O: '.###.#...##...##...##...##...#.###.', P: '####.#...##...#####.#....#....#....',
  Q: '.###.#...##...##...##.#.##..#..##.#', R: '####.#...##...#####.#.#..#..#.#...#', S: '.#####....#.....###.....#....#####.',
  T: '#####..#....#....#....#....#....#..', U: '#...##...##...##...##...##...#.###.', V: '#...##...##...##...##...#.#.#...#..',
  W: '#...##...##...##.#.##.#.##.#.#.#.#.', X: '#...##...#.#.#...#...#.#.#...##...#', Y: '#...##...##...#.#.#...#....#....#..',
  Z: '#####....#...#...#...#...#....#####',
};
const W = 5, H = 7;

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
  rect(x: number, y: number, w: number, h: number, c: number, a = 255) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c, a); }
  text(s: string, x: number, y: number, c: number) {
    for (const ch of s) {
      const g = F[ch] ?? F[' '];
      for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (g[j * W + i] === '#') this.px(x + i, y + j, c);
      x += W + 1;
    }
  }
  /** a 1px dark outline around every lit pixel (readable on any floor) */
  outline(c: number) {
    const src = this.d.slice();
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (src[(y * this.w + x) * 4 + 3]) continue;
      let n = false;
      for (let dy = -1; dy <= 1 && !n; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < this.w && yy < this.h && src[(yy * this.w + xx) * 4 + 3] > 200) { n = true; break; }
      }
      if (n) this.px(x, y, c);
    }
  }
  texture(): THREE.Texture {
    const cv = document.createElement('canvas'); cv.width = this.w; cv.height = this.h;
    const ctx = cv.getContext('2d')!;
    ctx.putImageData(new ImageData(this.d, this.w, this.h), 0, 0);
    const t = new THREE.CanvasTexture(cv);
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
}

const INK = 0x16130e, CAP = 0xe9e2c8, LIP = 0x8a8270, HI = 0xffffff;
interface Tex { tex: THREE.Texture; w: number; h: number }
const cache = new Map<string, Tex>();

/** a keycap with a label (white, tinted per use through the material colour) */
function keycap(label: string): Pix {
  const tw = label.length * 6 - 1;
  const w = Math.max(13, tw + 8), h = 15;
  const P = new Pix(w + 2, h + 2);
  P.rect(1, 1, w, h - 2, CAP); P.rect(1, h - 2, w, 2, LIP);
  P.rect(2, 2, w - 2, 1, HI);
  P.text(label, 1 + Math.round((w - tw) / 2), 4, INK);
  P.outline(INK);
  return P;
}
function word(s: string): Pix {
  const P = new Pix(s.length * 6 + 2, H + 3);
  P.text(s, 1, 1, 0xffffff);
  // a darker lower row for a bit of weight
  for (let x = 0; x < P.w; x++) for (let y = P.h - 3; y >= 1; y--) { const i = (y * P.w + x) * 4; if (P.d[i + 3] && !P.d[i + 3 + P.w * 4]) { P.px(x, y + 1, 0x9a9080); break; } }
  P.outline(INK);
  return P;
}
function skull(): Pix {
  const rows = [
    '...#####...', '..#######..', '.#########.', '.#########.', '.##..#..##.', '.##..#..##.', '.#########.', '..###.###..', '...#####...', '...#.#.#...', '...#####...',
  ];
  const P = new Pix(13, 13);
  rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) if (r[x] === '#') P.px(x + 1, y + 1, 0xffffff); });
  P.outline(INK);
  return P;
}
function mouse(): Pix {
  const rows = ['.#####.', '#LL#..#', '#LL#..#', '#LL#..#', '#######', '#.....#', '#.....#', '#.....#', '.#####.'];
  const P = new Pix(9, 11);
  rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) { const c = r[x]; if (c === '#') P.px(x + 1, y + 1, CAP); else if (c === 'L') P.px(x + 1, y + 1, 0xffc040); } });
  P.outline(INK);
  return P;
}
function finger(): Pix {
  const rows = ['...##....', '...##....', '...##....', '...######', '#..######', '##.######', '.########', '..#######', '...#####.'];
  const P = new Pix(11, 11);
  rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) if (r[x] === '#') P.px(x + 1, y + 1, CAP); });
  P.outline(INK);
  return P;
}
function arrow(left: boolean): Pix {
  const P = new Pix(11, 11);
  for (let y = 0; y < 9; y++) { const n = 5 - Math.abs(y - 4); for (let i = 0; i < n * 2 - 1 && i < 9; i++) P.px(left ? 1 + i : 9 - i, y + 1, 0xffffff); }
  P.outline(INK);
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
function ring(): Pix {
  const n = 33, P = new Pix(n, n), c = (n - 1) / 2;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const d = Math.hypot(x - c, y - c); if (d > c - 2.2 && d < c - 0.3) P.px(x, y, 0xffffff); }
  return P;
}
function spiral(): Pix {
  const P = new Pix(13, 9);
  for (let a = 0; a < 14; a += 0.15) { const r = 0.4 * a; P.px(6 + Math.cos(a) * r * 1.2, 4 + Math.sin(a) * r * 0.6, 0xffffff); }
  return P;
}

/** cached glyph texture by name: 'key:SPACE', 'word:PERFECT', 'skull', 'lmb', 'tap', 'arrowL', 'arrowR', 'star', 'glow', 'ring', 'dizzy' */
export function glyph(name: string): Tex {
  let t = cache.get(name);
  if (t) return t;
  let P: Pix;
  if (name.startsWith('key:')) P = keycap(name.slice(4));
  else if (name.startsWith('word:')) P = word(name.slice(5));
  else if (name === 'skull') P = skull();
  else if (name === 'lmb') P = mouse();
  else if (name === 'tap') P = finger();
  else if (name === 'arrowL' || name === 'arrowR') P = arrow(name === 'arrowL');
  else if (name === 'star') P = star();
  else if (name === 'glow') P = glow();
  else if (name === 'ring') P = ring();
  else if (name === 'dizzy') P = spiral();
  else P = word(name.toUpperCase());
  t = { tex: P.texture(), w: P.w, h: P.h };
  cache.set(name, t);
  return t;
}

// ------------------------------------------------------------------ the mark layer
/** texels per metre the glyph art is drawn for (the default camera zoom) */
const TPM = 28;

export interface MarkOpts { color?: number; opacity?: number; scale?: number; add?: boolean; rot?: number }
interface Floater { text: string; x: number; y: number; z: number; color: number; t0: number; dur: number; scale: number }

export class Marks {
  root = new THREE.Group();
  private sprites: THREE.Sprite[] = [];
  private n = 0;
  private floaters: Floater[] = [];
  private rings: { back: THREE.Mesh; fill: THREE.Mesh; used: boolean }[] = [];
  private nr = 0;
  private ringGeo: THREE.RingGeometry;
  private static SEG = 48;

  constructor() {
    this.root.name = 'combat-marks';
    this.root.renderOrder = 990;
    this.ringGeo = new THREE.RingGeometry(0.82, 1, Marks.SEG, 1, Math.PI / 2, -Math.PI * 2);
    this.ringGeo.rotateX(-Math.PI / 2);
  }
  attach() { if (!this.root.parent && G.pr?.scene) G.pr.scene.add(this.root); }

  begin() { this.n = 0; this.nr = 0; }

  /** place a glyph sprite at a world point this frame */
  mark(name: string, x: number, y: number, z: number, o: MarkOpts = {}) {
    let s = this.sprites[this.n];
    if (!s) {
      const m = new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false, fog: false });
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

  /** a progress ring flat on the floor: fill 0..1 */
  ring(x: number, y: number, z: number, r: number, fill: number, col: number, back = 0x2a0c08, op = 0.85) {
    let R = this.rings[this.nr];
    if (!R) {
      const mk = (c: number, o: number) => { const m = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, depthTest: false, side: THREE.DoubleSide, fog: false }); const me = new THREE.Mesh(this.ringGeo, m); me.renderOrder = 992; me.frustumCulled = false; this.root.add(me); return me; };
      const fill = mk(col, 0.9);
      fill.renderOrder = 993;
      fill.userData.segs = 0;
      // ring indices run around the circle: draw only the filled part
      fill.onBeforeRender = () => { this.ringGeo.setDrawRange(0, fill.userData.segs * 6); };
      fill.onAfterRender = () => { this.ringGeo.setDrawRange(0, Infinity); };
      R = { back: mk(back, 0.5), fill, used: true };
      this.rings.push(R);
    }
    this.nr++;
    for (const m of [R.back, R.fill]) { m.position.set(x, y + 0.04, z); m.scale.set(r, 1, r); m.visible = true; }
    (R.back.material as THREE.MeshBasicMaterial).color.setHex(back);
    (R.back.material as THREE.MeshBasicMaterial).opacity = op * 0.55;
    const fm = R.fill.material as THREE.MeshBasicMaterial;
    fm.color.setHex(col); fm.opacity = op;
    const segs = Math.round(Math.max(0, Math.min(1, fill)) * Marks.SEG);
    R.fill.visible = segs > 0;
    R.fill.userData.segs = segs;
  }

  /** a word that floats up and fades (combo counts, PERFECT, BROKE FREE) */
  float(text: string, x: number, y: number, z: number, color = 0xffd040, dur = 0.9, scale = 1) {
    if (this.floaters.length > 10) this.floaters.shift();
    this.floaters.push({ text, x, y, z, color, t0: performance.now(), dur, scale });
  }

  end() {
    const now = performance.now();
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      const u = (now - f.t0) / 1000 / f.dur;
      if (u >= 1) { this.floaters.splice(i, 1); continue; }
      const pop = u < 0.12 ? 1 + (1 - u / 0.12) * 0.6 : 1;
      this.mark('word:' + f.text, f.x, f.y + u * 0.7, f.z, { color: f.color, opacity: u > 0.7 ? 1 - (u - 0.7) / 0.3 : 1, scale: f.scale * pop });
    }
    for (let i = this.n; i < this.sprites.length; i++) this.sprites[i].visible = false;
    for (let i = this.nr; i < this.rings.length; i++) { this.rings[i].back.visible = false; this.rings[i].fill.visible = false; }
  }
}
