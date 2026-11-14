// The field pack's pixel painter (round 18b): every surface of the hybrid pack (its canvas, leather, webbing,
// brass, the inside of a cardboard box, a drawer, a locker, a corpse's coat...) is painted here, pixel by pixel,
// into small art-resolution canvases that are then blown up 3x (hard pixels) onto the 3D props. Seeded, so a
// prop always looks the same. Calm, worn, dirty colours; nothing flat.
export type C3 = [number, number, number];

export const hex = (h: number): C3 => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
export const mix = (a: C3, b: C3, t: number): C3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const mul = (a: C3, k: number): C3 => [a[0] * k, a[1] * k, a[2] * k];
export const css = (c: C3, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

// ---------------------------------------------------------------- noise
export function hash2(x: number, y: number, s: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
export function vnoise(x: number, y: number, s: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x: number, y: number, s: number, oct = 3): number {
  let v = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { v += vnoise(x * f, y * f, s + i * 31) * a; n += a; a *= 0.5; f *= 2.03; }
  return v / n;
}

// ---------------------------------------------------------------- the pixel buffer
export class Px {
  readonly cv: HTMLCanvasElement;
  readonly w: number; readonly h: number;
  private id: ImageData;
  readonly d: Uint8ClampedArray;
  private s: number;
  constructor(w: number, h: number, seed = 1, clear = true) {
    this.w = Math.max(1, Math.round(w)); this.h = Math.max(1, Math.round(h));
    this.cv = document.createElement('canvas'); this.cv.width = this.w; this.cv.height = this.h;
    this.id = this.cv.getContext('2d')!.createImageData(this.w, this.h);
    this.d = this.id.data;
    this.s = (Math.abs(seed | 0) % 2147483646) + 1;
    if (!clear) this.d.fill(255);
  }
  rnd(): number { this.s = (this.s * 16807) % 2147483647; return this.s / 2147483647; }
  ri(n: number): number { return Math.floor(this.rnd() * n); }
  inb(x: number, y: number) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  /** blend a colour onto a pixel (a: 0..1) */
  put(x: number, y: number, c: C3, a = 1) {
    x |= 0; y |= 0;
    if (!this.inb(x, y) || a <= 0) return;
    const i = (y * this.w + x) * 4, d = this.d;
    if (a >= 1 || d[i + 3] === 0) { d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = a >= 1 ? 255 : Math.max(d[i + 3], a * 255); if (a < 1 && d[i + 3] < 255) { /* fresh translucent pixel */ } return; }
    d[i] += (c[0] - d[i]) * a; d[i + 1] += (c[1] - d[i + 1]) * a; d[i + 2] += (c[2] - d[i + 2]) * a;
  }
  /** a translucent dark/light film (keeps alpha: for shadows over transparent floors) */
  film(x: number, y: number, c: C3, a: number) {
    x |= 0; y |= 0;
    if (!this.inb(x, y) || a <= 0) return;
    const i = (y * this.w + x) * 4, d = this.d;
    if (d[i + 3] === 0) { d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = Math.min(255, a * 255); return; }
    const al = d[i + 3] / 255, na = Math.min(1, al + a * (1 - al));
    for (let k = 0; k < 3; k++) d[i + k] = (d[i + k] * al * (1 - a) + c[k] * a) / Math.max(1e-3, na);
    d[i + 3] = na * 255;
  }
  get(x: number, y: number): C3 { x |= 0; y |= 0; if (!this.inb(x, y)) return [0, 0, 0]; const i = (y * this.w + x) * 4; return [this.d[i], this.d[i + 1], this.d[i + 2]]; }
  alpha(x: number, y: number) { x |= 0; y |= 0; return this.inb(x, y) ? this.d[(y * this.w + x) * 4 + 3] : 0; }
  /** multiply a pixel's brightness */
  shade(x: number, y: number, k: number) {
    x |= 0; y |= 0;
    if (!this.inb(x, y)) return;
    const i = (y * this.w + x) * 4, d = this.d;
    d[i] *= k; d[i + 1] *= k; d[i + 2] *= k;
  }
  rect(x: number, y: number, w: number, h: number, c: C3, a = 1) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.put(i, j, c, a); }
  shadeRect(x: number, y: number, w: number, h: number, k: number) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.shade(i, j, k); }
  fill(x: number, y: number, w: number, h: number, fn: (x: number, y: number) => C3 | null) {
    for (let j = Math.max(0, y | 0); j < Math.min(this.h, y + h); j++) for (let i = Math.max(0, x | 0); i < Math.min(this.w, x + w); i++) { const c = fn(i, j); if (c) this.put(i, j, c); }
  }
  line(x0: number, y0: number, x1: number, y1: number, c: C3, a = 1, dash = 0) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let e = dx + dy, n = 0;
    for (;;) {
      if (!dash || Math.floor(n / dash) % 2 === 0) this.put(x0, y0, c, a);
      n++;
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * e;
      if (e2 >= dy) { e += dy; x0 += sx; }
      if (e2 <= dx) { e += dx; y0 += sy; }
    }
  }
  disc(cx: number, cy: number, r: number, c: C3, a = 1) { for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (i * i + j * j <= r * r + r * 0.6) this.put(cx + i, cy + j, c, a); }
  done(): HTMLCanvasElement { this.cv.getContext('2d')!.putImageData(this.id, 0, 0); return this.cv; }
}

/** blow an art canvas up by k with hard pixels */
export function upscale(src: HTMLCanvasElement, k: number): HTMLCanvasElement {
  const cv = document.createElement('canvas'); cv.width = src.width * k; cv.height = src.height * k;
  const c = cv.getContext('2d')!; c.imageSmoothingEnabled = false; c.drawImage(src, 0, 0, cv.width, cv.height);
  return cv;
}

// ---------------------------------------------------------------- palettes (calm, worn)
export const PAL = {
  olive: hex(0x5d6340), oliveD: hex(0x3e4229), lining: hex(0x8f8457), liningD: hex(0x6b6140), khaki: hex(0xa39465),
  leather: hex(0x7a4f2e), leatherD: hex(0x4e301a), leatherL: hex(0xa8764a), thread: hex(0xd8c89a), threadD: hex(0x2a2416),
  brass: hex(0xc49a48), brassL: hex(0xf0d890), brassD: hex(0x6e4f1c), steel: hex(0x8a8f8c), steelD: hex(0x4a4e4c),
  web: hex(0x34372b), webL: hex(0x4f5340), card: hex(0xb08758), cardD: hex(0x7d5c38), tape: hex(0xc8b88a),
  wood: hex(0x8a5f38), woodD: hex(0x5a3c22), enamel: hex(0xdcd8c8), cloth: hex(0x3d3a36), blood: hex(0x5a1a14),
  black: hex(0x1a1b19), dust: hex(0xb8ae94),
};

// ---------------------------------------------------------------- materials
export interface MatOpts { seed?: number; dirt?: number; wear?: number }

/** woven canvas: 2px over-under threads, thread-to-thread tone, stains and frayed wear */
export function weave(p: Px, x0: number, y0: number, w: number, h: number, base: C3, o: MatOpts = {}) {
  const s = o.seed ?? 7, dirt = o.dirt ?? 0.5, wear = o.wear ?? 0.4;
  p.fill(x0, y0, w, h, (x, y) => {
    const over = ((x >> 1) + (y >> 1)) & 1;
    let k = over ? ((x & 1) ? 0.93 : 1.06) : ((y & 1) ? 0.93 : 1.06);
    k += (hash2(over ? x >> 1 : 0, over ? 0 : y >> 1, s) - 0.5) * 0.06 + (hash2(x, y, s + 3) - 0.5) * 0.05;
    let c = mul(base, k);
    const st = fbm(x / 16, y / 16, s + 11);
    if (st > 0.6 - dirt * 0.08) c = mix(c, mul(hex(0x3a2e1c), k), Math.min(0.5, (st - 0.6 + dirt * 0.08) * 1.6 * dirt));
    const wr = fbm(x / 7 + 40, y / 7, s + 23);
    if (wr > 0.74 - wear * 0.05) c = mix(c, mix(base, [200, 196, 170], 0.35), Math.min(0.45, (wr - 0.74 + wear * 0.05) * 2.5));
    return c;
  });
}

/** leather: fine grain, mottling, burnished edges, an inset stitch */
export function leather(p: Px, x0: number, y0: number, w: number, h: number, base: C3, o: MatOpts & { stitch?: boolean; edge?: boolean } = {}) {
  const s = o.seed ?? 13;
  p.fill(x0, y0, w, h, (x, y) => {
    let k = 1 + (vnoise(x / 1.4, y / 1.4, s) - 0.5) * 0.12 + (fbm(x / 9, y / 9, s + 5) - 0.5) * 0.22;
    const ex = Math.min(x - x0, x0 + w - 1 - x), ey = Math.min(y - y0, y0 + h - 1 - y);
    if (o.edge !== false) { if (ex === 0 || ey === 0) k *= 0.55; else if (y === y0 + 1) k *= 1.18; else if (y === y0 + h - 2) k *= 0.8; }
    if (fbm(x / 5, y / 5, s + 9) > 0.7) k *= 1.1;
    return mul(base, k);
  });
  if (o.stitch && w > 6 && h > 6) stitchRect(p, x0 + 2, y0 + 2, w - 4, h - 4, PAL.thread);
}

/** woven webbing strap: ribs along its length, darker edges */
export function webbing(p: Px, x0: number, y0: number, w: number, h: number, base: C3, vertical: boolean, s = 3) {
  p.fill(x0, y0, w, h, (x, y) => {
    const a = vertical ? x - x0 : y - y0, L = vertical ? y : x, W = vertical ? w : h;
    let k = (a & 1) ? 0.86 : 1.08;
    k *= ((L >> 1) & 1) ? 1.03 : 0.97;
    if (a === 0 || a === W - 1) k *= 0.6;
    k += (hash2(x, y, s) - 0.5) * 0.08;
    return mul(base, k);
  });
}

/** brushed / painted metal */
export function brushed(p: Px, x0: number, y0: number, w: number, h: number, base: C3, o: MatOpts = {}) {
  const s = o.seed ?? 5;
  p.fill(x0, y0, w, h, (x, y) => {
    let k = 1 + (hash2(0, y, s) - 0.5) * 0.06 + (vnoise(x / 20, y * 1.3, s + 1) - 0.5) * 0.1 + (hash2(x, y, s + 2) - 0.5) * 0.04;
    let c = mul(base, k);
    const r = fbm(x / 8, y / 8, s + 7);
    if (r > 0.72 - (o.dirt ?? 0.3) * 0.08) c = mix(c, hex(0x6a3a1a), Math.min(0.55, (r - 0.66) * 2.2));
    return c;
  });
  const n = Math.round(w * h / 400 * (o.wear ?? 0.5));
  for (let i = 0; i < n; i++) { const x = x0 + p.ri(w), y = y0 + p.ri(h), L = 3 + p.ri(9), dx = p.rnd() < 0.5 ? 1 : -1; p.line(x, y, x + L * dx, y + (p.rnd() < 0.5 ? 1 : 0), mul(base, 1.35), 0.55); }
}

/** wood planks: grain stretched along x, per-plank tone, gaps, knots */
export function wood(p: Px, x0: number, y0: number, w: number, h: number, base: C3, plank = 14, o: MatOpts = {}) {
  const s = o.seed ?? 9;
  p.fill(x0, y0, w, h, (x, y) => {
    const pl = Math.floor((y - y0) / plank), py = (y - y0) % plank;
    const tone = 0.88 + hash2(pl, 0, s) * 0.24;
    const g = fbm(x / 46 + pl * 3.7, y / 1.7, s + pl);
    let k = tone * (0.84 + g * 0.34) * (((x * 7 + pl * 13) % 97) < 2 ? 0.8 : 1);
    if (py === plank - 1) k *= 0.42; else if (py === 0) k *= 1.12;
    return mul(base, k + (hash2(x, y, s) - 0.5) * 0.04);
  });
  const knots = Math.round(w * h / 2400);
  for (let i = 0; i < knots; i++) {
    const cx = x0 + 4 + p.ri(Math.max(1, w - 8)), cy = y0 + 3 + p.ri(Math.max(1, h - 6));
    for (let j = -2; j <= 2; j++) for (let k = -4; k <= 4; k++) { const r = (k * k) / 16 + (j * j) / 4; if (r <= 1) p.shade(cx + k, cy + j, r < 0.35 ? 0.55 : 0.8); }
  }
}

/** corrugated cardboard: flutes, fibres, scuffs, water rings */
export function cardboard(p: Px, x0: number, y0: number, w: number, h: number, base: C3, o: MatOpts = {}) {
  const s = o.seed ?? 21;
  p.fill(x0, y0, w, h, (x, y) => {
    let k = ((x - x0) % 6 < 2 ? 1.05 : (x - x0) % 6 === 3 ? 0.94 : 1) + (hash2(x, y, s) - 0.5) * 0.07 + (vnoise(x / 3, y / 11, s + 1) - 0.5) * 0.06;
    let c = mul(base, k);
    const sc = fbm(x / 13, y / 13, s + 4);
    if (sc > 0.62) c = mix(c, mul(base, 0.7), Math.min(0.6, (sc - 0.62) * 2.4));
    return c;
  });
  // a water ring
  const cx = x0 + w * (0.25 + p.rnd() * 0.5), cy = y0 + h * (0.3 + p.rnd() * 0.4), R = Math.min(w, h) * 0.18;
  for (let a = 0; a < 360; a += 1.5) { const r = R + Math.sin(a * 0.2) * 1.5; p.shade(cx + Math.cos(a * Math.PI / 180) * r, cy + Math.sin(a * Math.PI / 180) * r * 0.8, 0.82); }
}

/** enamel / plastic: smooth, a soft top light, chips */
export function enamel(p: Px, x0: number, y0: number, w: number, h: number, base: C3, o: MatOpts = {}) {
  const s = o.seed ?? 4;
  p.fill(x0, y0, w, h, (x, y) => mul(base, 1.04 - ((y - y0) / Math.max(1, h)) * 0.1 + (hash2(x, y, s) - 0.5) * 0.03 + (vnoise(x / 14, y / 14, s) - 0.5) * 0.05));
  const n = Math.round(w * h / 1500 * (o.wear ?? 0.6));
  for (let i = 0; i < n; i++) { const x = x0 + p.ri(w), y = y0 + p.ri(h); p.rect(x, y, 2, 1, hex(0x3a3a34)); p.put(x - 1, y, hex(0x7a5a3a), 0.6); p.put(x + 2, y, hex(0x7a5a3a), 0.6); }
}

/** cloth (a coat's lining, a sheet): twill and stains */
export function cloth(p: Px, x0: number, y0: number, w: number, h: number, base: C3, o: MatOpts = {}) {
  const s = o.seed ?? 31;
  p.fill(x0, y0, w, h, (x, y) => {
    let c = mul(base, ((x + y * 2) % 4 < 2 ? 1.06 : 0.94) + (hash2(x, y, s) - 0.5) * 0.06 + (fbm(x / 10, y / 10, s) - 0.5) * 0.2);
    const st = fbm(x / 18, y / 18, s + 9);
    if (st > 0.66) c = mix(c, PAL.blood, Math.min(0.6, (st - 0.66) * 3 * (o.dirt ?? 0.6)));
    return c;
  });
}

/** black bin-bag plastic: big soft folds with a hard sheen */
export function plastic(p: Px, x0: number, y0: number, w: number, h: number, base: C3, s = 41) {
  p.fill(x0, y0, w, h, (x, y) => {
    const f = fbm(x / 22, y / 12, s, 4);
    let k = 0.75 + f * 0.45;
    const band = Math.abs(f - 0.55);
    if (band < 0.03) k += (0.03 - band) * 22;
    return mul(base, k + (hash2(x, y, s) - 0.5) * 0.04);
  });
}

/** needle felt / carpet */
export function felt(p: Px, x0: number, y0: number, w: number, h: number, base: C3, s = 51) {
  p.fill(x0, y0, w, h, (x, y) => mul(base, 0.86 + hash2(x, y, s) * 0.26 + (fbm(x / 9, y / 9, s) - 0.5) * 0.16));
}

/** a heap of rubble: lumps and stones */
export function rubble(p: Px, x0: number, y0: number, w: number, h: number, base: C3, s = 61) {
  p.fill(x0, y0, w, h, (x, y) => { const v = vnoise(x / 3.2, y / 3.2, s); const e = vnoise(x / 3.2 + 0.4, y / 3.2 + 0.4, s); return mul(base, 0.7 + v * 0.5 + (v - e) * 0.8); });
}

// ---------------------------------------------------------------- details
/** a running stitch along a line (2 on, 2 off), each stitch with a shadow under it */
export function stitchLine(p: Px, x0: number, y0: number, x1: number, y1: number, thread: C3, a = 1) {
  p.line(x0 + 1, y0 + 1, x1 + 1, y1 + 1, PAL.threadD, 0.45 * a, 2);
  p.line(x0, y0, x1, y1, thread, a, 2);
}
export function stitchRect(p: Px, x: number, y: number, w: number, h: number, thread: C3, a = 1) {
  stitchLine(p, x, y, x + w - 1, y, thread, a); stitchLine(p, x, y + h - 1, x + w - 1, y + h - 1, thread, a);
  stitchLine(p, x, y, x, y + h - 1, thread, a); stitchLine(p, x + w - 1, y, x + w - 1, y + h - 1, thread, a);
}
/** the soft dark of a sunken area, strongest along its top and left */
export function innerShadow(p: Px, x: number, y: number, w: number, h: number, depth: number, k = 0.5) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const dt = j, dl = i, db = h - 1 - j, dr = w - 1 - i;
    let s = 0;
    if (dt < depth) s = Math.max(s, (1 - dt / depth) * 1.0);
    if (dl < depth) s = Math.max(s, (1 - dl / depth) * 0.85);
    if (db < depth * 0.6) s = Math.max(s, (1 - db / (depth * 0.6)) * 0.45);
    if (dr < depth * 0.6) s = Math.max(s, (1 - dr / (depth * 0.6)) * 0.55);
    if (s > 0) p.shade(x + i, y + j, 1 - k * s * s);
  }
}
/** the shadow a raised thing throws down-right onto what is under it */
export function castShadow(p: Px, x: number, y: number, w: number, h: number, off = 2, a = 0.35) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const X = x + i + off, Y = y + j + off;
    if (X >= x + w || Y >= y + h) p.film(X, Y, [8, 6, 4], a);
  }
}
export function rivet(p: Px, x: number, y: number, c = PAL.brass) {
  p.put(x + 1, y + 2, PAL.threadD, 0.6); p.put(x + 2, y + 1, PAL.threadD, 0.6); p.put(x + 2, y + 2, PAL.threadD, 0.7);
  p.put(x, y, mix(c, [255, 255, 240], 0.55)); p.put(x + 1, y, c); p.put(x, y + 1, c); p.put(x + 1, y + 1, mul(c, 0.7));
}
/** a brass frame buckle with its prong, over a strap already drawn */
export function buckle(p: Px, x: number, y: number, w: number, h: number) {
  const B = PAL.brass;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const edge = i < 2 || j < 2 || i >= w - 2 || j >= h - 2;
    if (!edge) continue;
    const tl = i === 0 || j === 0, br = i === w - 1 || j === h - 1;
    p.put(x + i, y + j, br ? PAL.brassD : tl ? PAL.brassL : B);
  }
  p.line(x + 1, y + (h >> 1), x + w - 2, y + (h >> 1), mul(B, 1.15));
  p.put(x + w - 2, y + (h >> 1), PAL.brassL);
  castShadow(p, x, y, w, h, 1, 0.3);
}
/** a zip: dark tape, interlocked teeth, a pull */
export function zipper(p: Px, x: number, y: number, len: number, pullAt = 0.3) {
  for (let i = 0; i < len; i++) {
    p.put(x + i, y - 1, hex(0x23251d)); p.put(x + i, y + 2, hex(0x23251d));
    p.put(x + i, y, (i & 1) ? hex(0x9a9478) : hex(0x5a5848)); p.put(x + i, y + 1, (i & 1) ? hex(0x5a5848) : hex(0x9a9478));
  }
  const px = x + Math.round(len * pullAt);
  p.rect(px - 1, y - 2, 4, 6, PAL.steel); p.rect(px, y + 3, 2, 5, PAL.steelD); p.put(px - 1, y - 2, hex(0xd8dcd4)); p.rect(px - 1, y + 7, 4, 2, PAL.leatherD);
}
/** a few crumbs, a thread, grit: lived-in */
export function grit(p: Px, x: number, y: number, w: number, h: number, n: number, c: C3 = PAL.dust) {
  for (let i = 0; i < n; i++) { const X = x + p.ri(w), Y = y + p.ri(h); p.put(X, Y, mul(c, 0.7 + p.rnd() * 0.5), 0.5 + p.rnd() * 0.5); if (p.rnd() < 0.3) p.put(X + 1, Y, mul(c, 0.6), 0.5); }
}
export function looseThread(p: Px, x: number, y: number, c: C3 = PAL.thread) {
  let X = x, Y = y;
  for (let i = 0; i < 9; i++) { p.put(X, Y, c, 0.85); p.put(X + 1, Y + 1, PAL.threadD, 0.3); X += p.rnd() < 0.6 ? 1 : 0; Y += p.rnd() < 0.5 ? 1 : -1; }
}

/** a tiny pixel font (3x5) for counts and stamped numbers */
const GLYPH: Record<string, string> = {
  '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001011001111', '4': '101101111001001',
  '5': '111100111001111', '6': '111100111101111', '7': '111001010010010', '8': '111101111101111', '9': '111101111001111', 'x': '000101010101000',
};
export function digits(p: Px, x: number, y: number, s: string, c: C3, shadow: C3 | null = PAL.threadD) {
  let X = x;
  for (const ch of s) {
    const g = GLYPH[ch];
    if (g) for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (g[j * 3 + i] === '1') { if (shadow) p.put(X + i + 1, y + j + 1, shadow, 0.7); p.put(X + i, y + j, c); }
    X += 4;
  }
}
export const digitsW = (s: string) => s.length * 4 - 1;
