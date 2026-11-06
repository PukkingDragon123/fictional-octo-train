import * as THREE from 'three';
import { Zone, LightSource } from './zone';
import { U } from '../gfx/materials';
import { hashf } from '../core/rng';

export const LSUB = 2;          // light texels per tile edge
export const LWIN = 128;        // window size in tiles
/** key-light map: offsets to the dominant fixture are stored in [-DOM_R, DOM_R] metres, its height in [0, DOM_H] */
export const DOM_R = 16, DOM_H = 8;

/**
 * Mismatched tubes: a ceiling of fluorescents is never one colour (cool daylight tubes, aged ones gone a
 * little green, the odd warm replacement). Deterministic per light, the same brightness to the eye (the
 * gameplay light level is unchanged), so neighbouring rooms differ the way real ones do.
 */
const TUBE_TINTS: [number, number, number][] = [[1, 1, 1], [1, 1, 1], [0.92, 1.0, 1.12], [0.95, 1.04, 0.9], [1.06, 0.98, 0.84], [1, 1, 1], [0.94, 1.0, 1.08]];
const tintCache = new WeakMap<LightSource, [number, number, number]>();
export function lightRGB(l: LightSource): [number, number, number] {
  let c = tintCache.get(l);
  if (c) return c;
  let r = ((l.color >> 16) & 255) / 255, g = ((l.color >> 8) & 255) / 255, b = (l.color & 255) / 255;
  if (l.kind === 'fluoro') {
    const t = TUBE_TINTS[Math.floor(hashf(l.id, 3, 77) * TUBE_TINTS.length) % TUBE_TINTS.length];
    const y0 = r * 0.3 + g * 0.59 + b * 0.11;
    r *= t[0]; g *= t[1]; b *= t[2];
    const k = y0 / Math.max(1e-4, r * 0.3 + g * 0.59 + b * 0.11);
    r *= k; g *= k; b *= k;
  }
  c = [r, g, b];
  tintCache.set(l, c);
  return c;
}

/**
 * Static light accumulation grid. Every fixture (fluorescent panels, bulbs,
 * sodium lamps, glowing screens) stamps a precomputed, wall-occluded
 * footprint into a zone-wide buffer. Flicker and power changes are cheap
 * delta updates. A window around the camera is uploaded as a texture which
 * all world shaders sample.
 */
export class LightGrid {
  zone: Zone;
  W: number; H: number;
  buf: Float32Array;
  tex: THREE.DataTexture;
  data: Uint8Array;
  winX = -9999; winY = -9999;
  private texDirty = true;
  private lastUpload = 0;
  private flickerT = 0;
  /**
   * Key-light map (visual only, same window as tex): for every light texel, where the fixture that
   * dominates it hangs (rg: offset from the texel centre, b: height) and how much of the texel's light it
   * gives (a). The world shaders turn it into real per-fixture falloff (wall scallops, a key direction on
   * bodies, glossy highlights) and the post pass into soft screen-space shadows cast away from the fixture.
   * Rebuilt only when lights switch on or off, walls change or the window moves (never on flicker).
   */
  domTex: THREE.DataTexture;
  private domData: Uint8Array;
  private domDirty = true;
  private domBest: Float32Array | null = null;
  private domTot: Float32Array | null = null;
  private domIdx: Int32Array | null = null;
  /** lights whose footprint is currently stamped into buf */
  private stamped = new Set<LightSource>();
  private index = new Map<number, LightSource[]>();
  private indexedCount = -1;

  constructor(zone: Zone) {
    this.zone = zone;
    this.W = zone.W * LSUB; this.H = zone.H * LSUB;
    this.buf = new Float32Array(this.W * this.H * 3);
    const N = LWIN * LSUB;
    this.data = new Uint8Array(N * N * 4);
    this.tex = new THREE.DataTexture(this.data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.tex.magFilter = THREE.LinearFilter; this.tex.minFilter = THREE.LinearFilter;
    this.tex.generateMipmaps = false;
    this.tex.needsUpdate = true;
    this.domData = new Uint8Array(N * N * 4);
    this.domTex = new THREE.DataTexture(this.domData, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.domTex.magFilter = THREE.NearestFilter; this.domTex.minFilter = THREE.NearestFilter;
    this.domTex.generateMipmaps = false;
    this.domTex.needsUpdate = true;
    // lights already stamped by a previous view of this zone are reset
    for (const l of zone.lights) { l.level = 0; l.fp = null; }
    zone.lightDirty = false;
  }

  /** effective brightness multiplier for a light right now */
  effective(l: LightSource): number {
    if (!l.on || l.broken) return 0;
    if (!this.zone.circuitPowered(l.circuit) && !this.zone.extPower?.(l.x, l.z)) return 0;
    return 1;
  }

  private rebuildIndex() {
    this.index.clear();
    for (const l of this.zone.lights) {
      const k = (Math.floor(l.z / 16) << 12) | Math.floor(l.x / 16);
      let a = this.index.get(k); if (!a) { a = []; this.index.set(k, a); } a.push(l);
    }
    this.indexedCount = this.zone.lights.length;
  }

  /** lights whose centre lies inside the given tile rect */
  lightsIn(x0: number, y0: number, x1: number, y1: number): LightSource[] {
    if (this.indexedCount !== this.zone.lights.length) this.rebuildIndex();
    const out: LightSource[] = [];
    for (let cy = Math.floor(y0 / 16); cy <= Math.floor(y1 / 16); cy++) for (let cx = Math.floor(x0 / 16); cx <= Math.floor(x1 / 16); cx++) {
      const a = this.index.get((cy << 12) | cx);
      if (a) for (const l of a) if (l.x >= x0 && l.x <= x1 && l.z >= y0 && l.z <= y1) out.push(l);
    }
    return out;
  }

  /** full reset (all footprints recomputed lazily) */
  rebuild() {
    this.buf.fill(0);
    for (const l of this.stamped) { l.level = 0; l.fp = null; }
    this.stamped.clear();
    this.zone.lightDirty = false;
    this.texDirty = true;
    this.domDirty = true;
  }

  /** Recompute footprints of stamped lights near a tile (door opened, wall broken) */
  refreshNear(tx: number, ty: number, r = 2) {
    for (const l of [...this.stamped]) {
      if (Math.abs(l.x - tx) > l.radius + r || Math.abs(l.z - ty) > l.radius + r) continue;
      const lvl = l.level || 0;
      if (lvl) this.stamp(l, -lvl);
      l.fp = this.footprint(l);
      if (lvl) this.stamp(l, lvl);
    }
    this.texDirty = true;
    this.domDirty = true;
  }

  private stamp(l: LightSource, mult: number) {
    if (!l.fp) return;
    const rgb = lightRGB(l);
    const r = rgb[0] * l.intensity * mult;
    const g = rgb[1] * l.intensity * mult;
    const b = rgb[2] * l.intensity * mult;
    const { idx, w } = l.fp;
    const buf = this.buf;
    for (let k = 0; k < idx.length; k++) {
      const i = idx[k] * 3, ww = w[k];
      buf[i] += r * ww; buf[i + 1] += g * ww; buf[i + 2] += b * ww;
    }
  }

  setLevel(l: LightSource, level: number) {
    const cur = l.level || 0;
    if (Math.abs(cur - level) < 1e-3) return;
    if (!l.fp) l.fp = this.footprint(l);
    this.stamp(l, level - cur);
    if ((cur > 0.01) !== (level > 0.01)) this.domDirty = true;
    l.level = level;
    if (level > 0) this.stamped.add(l);
    this.texDirty = true;
  }

  /** Light footprint with tile-level occlusion via a ray fan */
  footprint(l: LightSource): { idx: Int32Array; w: Float32Array } {
    const z = this.zone;
    const R = l.radius;
    const lit = new Map<number, number>(); // tile index -> 1
    const lx = l.x, lz = l.z;
    const rays = Math.max(48, Math.ceil(2 * Math.PI * R * 3));
    const tx0 = Math.floor(lx), ty0 = Math.floor(lz);
    if (!z.inb(tx0, ty0)) return { idx: new Int32Array(0), w: new Float32Array(0) };
    lit.set(z.idx(tx0, ty0), 1);
    for (let k = 0; k < rays; k++) {
      const a = (k / rays) * Math.PI * 2;
      castRay(z, lx, lz, Math.cos(a), Math.sin(a), R, 'light', (x, y) => { lit.set(z.idx(x, y), 1); });
    }
    const idxs: number[] = []; const ws: number[] = [];
    const hy = Math.max(0.6, l.y - 1.0);
    for (const ti of lit.keys()) {
      const tx = ti % z.W, ty = (ti / z.W) | 0;
      for (let sy = 0; sy < LSUB; sy++) for (let sx = 0; sx < LSUB; sx++) {
        const px = tx + (sx + 0.5) / LSUB, pz = ty + (sy + 0.5) / LSUB;
        const dx = px - lx, dz = pz - lz;
        const d = Math.sqrt(dx * dx + dz * dz + hy * hy * 0.35);
        if (d >= R) continue;
        const t = 1 - d / R;
        let w = t * t * (3 - 2 * t);
        if (l.kind === 'bulb' || l.kind === 'lamp' || l.kind === 'fire') w = w * w * 1.25 + t * 0.15;
        if (l.kind === 'sodium') w = Math.pow(t, 1.3);
        if (w < 0.004) continue;
        idxs.push((ty * LSUB + sy) * this.W + tx * LSUB + sx);
        ws.push(w);
      }
    }
    return { idx: Int32Array.from(idxs), w: Float32Array.from(ws) };
  }

  /** static light level (luminance-ish) at world position */
  lightAt(x: number, z: number): number {
    const gx = Math.floor(x * LSUB), gz = Math.floor(z * LSUB);
    if (gx < 0 || gz < 0 || gx >= this.W || gz >= this.H) return 0;
    const i = (gz * this.W + gx) * 3;
    return this.buf[i] * 0.3 + this.buf[i + 1] * 0.59 + this.buf[i + 2] * 0.11;
  }

  update(dt: number, camTileX: number, camTileY: number, time: number) {
    const z = this.zone;
    if (z.lightDirty) this.rebuild();
    // lights removed from the zone: subtract their contribution
    if (z.removedLights.length) {
      for (const l of z.removedLights) { if (l.level) this.stamp(l, -l.level); l.level = 0; this.stamped.delete(l); }
      z.removedLights.length = 0;
      this.texDirty = true;
      this.domDirty = true;
    }
    // walls / doors changed: recompute nearby footprints
    if (z.lightDirtyTiles.length) {
      for (const [tx, ty] of z.lightDirtyTiles) this.refreshNear(tx, ty);
      z.lightDirtyTiles.length = 0;
    }
    // recentre window
    const half = LWIN / 2;
    if (Math.abs(camTileX - (this.winX + half)) > LWIN / 4 || Math.abs(camTileY - (this.winY + half)) > LWIN / 4) {
      this.winX = Math.floor(camTileX - half); this.winY = Math.floor(camTileY - half);
      this.texDirty = true;
      this.domDirty = true;
    }
    this.flickerT += dt;
    const doFlicker = this.flickerT > 1 / 15;
    if (doFlicker) this.flickerT = 0;
    // update every light whose footprint can touch the window (lazy footprint computation)
    const m = 10;
    for (const l of this.lightsIn(this.winX - m, this.winY - m, this.winX + LWIN + m, this.winY + LWIN + m)) {
      const base = this.effective(l);
      let level = base;
      if (base > 0 && l.flicker > 0) {
        if (doFlicker) {
          // fluorescent tubes stutter: mostly on, bursts of off/dim
          const slot = Math.floor(time * 3 + l.id * 13.7);
          if (hashf(slot, l.id, 3) < l.flicker) level = hashf(Math.floor(time * 15), l.id, 9) < 0.5 ? 0.05 : 0.55;
        } else level = l.level ?? base;
      }
      // a few steady tubes are dying anyway: a slow sag and the odd stutter (deterministic per light)
      else if (base > 0 && l.kind === 'fluoro' && hashf(l.id, 7, 21) < 0.08) {
        if (doFlicker) {
          const sag = 0.82 + 0.18 * Math.sin(time * 0.9 + l.id * 3.1);
          const slot = Math.floor(time * 2 + l.id * 7.3);
          level = hashf(slot, l.id, 5) < 0.06 ? (hashf(Math.floor(time * 15), l.id, 6) < 0.5 ? 0.08 : 0.5) : sag;
        } else level = l.level ?? base;
      }
      if (l.kind === 'fire' && base > 0) level = 0.8 + 0.2 * Math.sin(time * 9 + l.id) * Math.sin(time * 13.3 + l.id * 2);
      this.setLevel(l, level);
    }
    const now = performance.now();
    if (this.texDirty && now - this.lastUpload > 50) this.upload();
    if (this.domDirty && !this.texDirty) this.buildDom();
    U.uLightTex.value = this.tex;
    U.uDomTex.value = this.domTex;
    U.uLightInfo.value.set(this.winX, this.winY, 1 / LWIN, 1 / LWIN);
  }

  /** the key-light map (see domTex): every lit texel learns which fixture dominates it */
  private buildDom() {
    this.domDirty = false;
    const N = LWIN * LSUB, NN = N * N;
    const best = this.domBest ??= new Float32Array(NN), tot = this.domTot ??= new Float32Array(NN), bi = this.domIdx ??= new Int32Array(NN);
    best.fill(0); tot.fill(0); bi.fill(-1);
    const ox = this.winX * LSUB, oy = this.winY * LSUB, W = this.W;
    const m = 12;
    const ls = this.lightsIn(this.winX - m, this.winY - m, this.winX + LWIN + m, this.winY + LWIN + m);
    for (let li = 0; li < ls.length; li++) {
      const l = ls[li];
      if (!l.fp || !((l.level ?? 0) > 0.01) || l.kind === 'sky') continue;
      const s = l.intensity * (((l.color >> 16) & 255) * 0.3 + ((l.color >> 8) & 255) * 0.5 + (l.color & 255) * 0.2) / 255;
      const { idx, w } = l.fp;
      for (let k = 0; k < idx.length; k++) {
        const gi = idx[k], gx = gi % W - ox, gy = ((gi / W) | 0) - oy;
        if (gx < 0 || gy < 0 || gx >= N || gy >= N) continue;
        const t = gy * N + gx, v = w[k] * s;
        tot[t] += v;
        if (v > best[t]) { best[t] = v; bi[t] = li; }
      }
    }
    const d = this.domData;
    for (let t = 0; t < NN; t++) {
      const o = t * 4, li = bi[t];
      if (li < 0 || tot[t] < 1e-4) { d[o] = d[o + 1] = 128; d[o + 2] = 0; d[o + 3] = 0; continue; }
      const l = ls[li];
      const cx = (ox + (t % N) + 0.5) / LSUB, cz = (oy + ((t / N) | 0) + 0.5) / LSUB;
      const enc = (v: number) => Math.max(0, Math.min(255, Math.round((v / (2 * DOM_R) + 0.5) * 255)));
      d[o] = enc(l.x - cx); d[o + 1] = enc(l.z - cz);
      d[o + 2] = Math.max(0, Math.min(255, Math.round(l.y / DOM_H * 255)));
      d[o + 3] = Math.min(255, Math.round(best[t] / tot[t] * 255));
    }
    this.domTex.needsUpdate = true;
  }

  /**
   * The active fixtures nearest a point, for the haze glow (src/gfx/scenefx.ts): fills pos (x, y, z, radius)
   * and col (rgb x intensity x current level, so tubes flicker in the air too). Returns the count.
   */
  nearestLights(x: number, z: number, maxN: number, pos: Float32Array, col: Float32Array, reach = 26): number {
    const ls = this.lightsIn(x - reach, z - reach, x + reach, z + reach);
    const cand = this.nearTmp; cand.length = 0;
    for (const l of ls) {
      const lv = l.level ?? 0;
      if (lv <= 0.01 || l.kind === 'sky' || l.kind === 'screen') continue;
      cand.push(l);
    }
    const d2 = (l: LightSource) => (l.x - x) * (l.x - x) + (l.z - z) * (l.z - z);
    cand.sort((a, b) => d2(a) - d2(b));
    const n = Math.min(maxN, cand.length);
    for (let i = 0; i < n; i++) {
      const l = cand[i], lv = l.level ?? 0;
      pos[i * 4] = l.x; pos[i * 4 + 1] = l.y; pos[i * 4 + 2] = l.z; pos[i * 4 + 3] = l.radius;
      const rgb = lightRGB(l);
      col[i * 4] = rgb[0] * l.intensity * lv;
      col[i * 4 + 1] = rgb[1] * l.intensity * lv;
      col[i * 4 + 2] = rgb[2] * l.intensity * lv;
      col[i * 4 + 3] = l.kind === 'fluoro' ? 1 : 0;
    }
    return n;
  }
  private nearTmp: LightSource[] = [];

  /**
   * The (up to n) fixtures that light a body standing at x, z most, for its cast shadows (src/gfx/scenefx.ts):
   * weighted like the grid's own footprint, only lights with a clear line to the body (not through a wall).
   * out gets x, y, z, packed (radius * 10 whole part, intensity x level / 4 fraction) per light; returns the count.
   */
  lightsFor(x: number, z: number, n: number, out: Float32Array, o: number): number {
    const ls = this.lightsIn(x - 7, z - 7, x + 7, z + 7);
    const best = this.forTmp; best.length = 0;
    for (const l of ls) {
      const lv = l.level ?? 0;
      if (lv <= 0.05 || l.kind === 'sky' || l.kind === 'screen' || l.y < 1.2) continue;
      const dx = x - l.x, dz = z - l.z, hy = Math.max(0.6, l.y - 1.0);
      const d = Math.sqrt(dx * dx + dz * dz + hy * hy * 0.35);
      if (d >= l.radius) continue;
      const t = 1 - d / l.radius;
      const w = t * t * (3 - 2 * t) * l.intensity * lv;
      if (w < 0.02) continue;
      // line of sight from the fixture to the body (the grid's own wall test)
      const L = Math.hypot(dx, dz);
      if (L > 0.3) {
        let reach = false;
        const tx = Math.floor(x), tz = Math.floor(z);
        castRay(this.zone, l.x, l.z, dx / L, dz / L, L + 0.01, 'light', (vx, vy) => { if (vx === tx && vy === tz) reach = true; });
        if (!reach) continue;
      }
      best.push({ l, w });
    }
    best.sort((a, b) => b.w - a.w);
    const k = Math.min(n, best.length);
    for (let i = 0; i < k; i++) {
      const { l } = best[i];
      out[o + i * 4] = l.x; out[o + i * 4 + 1] = l.y; out[o + i * 4 + 2] = l.z;
      out[o + i * 4 + 3] = Math.round(l.radius * 10) + Math.min(0.999, l.intensity * (l.level ?? 0) / 4);
    }
    for (let i = k; i < n; i++) out[o + i * 4 + 3] = 0;
    return k;
  }
  private forTmp: { l: LightSource; w: number }[] = [];

  private lum: Float32Array | null = null;
  private lumB: Float32Array | null = null;

  private upload() {
    const N = LWIN * LSUB;
    const ox = this.winX * LSUB, oy = this.winY * LSUB;
    const inv = 1 / 4; // uGridScale
    const data = this.data, buf = this.buf, W = this.W, H = this.H;
    const lum = this.lum ??= new Float32Array(N * N), tmp = this.lumB ??= new Float32Array(N * N);
    for (let y = 0; y < N; y++) {
      const gy = oy + y;
      for (let x = 0; x < N; x++) {
        const gx = ox + x;
        const o = (y * N + x) * 4;
        if (gx < 0 || gy < 0 || gx >= W || gy >= H) { data[o] = data[o + 1] = data[o + 2] = 0; lum[y * N + x] = 0; continue; }
        const i = (gy * W + gx) * 3;
        const r = buf[i], g = buf[i + 1], b = buf[i + 2];
        // sqrt encoding: more precision in the darks
        data[o] = Math.min(255, Math.sqrt(r * inv) * 255);
        data[o + 1] = Math.min(255, Math.sqrt(g * inv) * 255);
        data[o + 2] = Math.min(255, Math.sqrt(b * inv) * 255);
        lum[y * N + x] = r * 0.3 + g * 0.5 + b * 0.2;
      }
    }
    // alpha: bounce light, the light around spread a few metres (walls and floor throwing it back), kept
    // to where some direct light reaches so it never glows through into a dark room next door
    boxBlur(lum, tmp, N, 3); boxBlur(lum, tmp, N, 3);
    for (let y = 0, k = 0; y < N; y++) {
      const gy = oy + y;
      for (let x = 0; x < N; x++, k++) {
        const gx = ox + x;
        let own = 0;
        if (gx >= 0 && gy >= 0 && gx < W && gy < H) { const i = (gy * W + gx) * 3; own = buf[i] * 0.3 + buf[i + 1] * 0.5 + buf[i + 2] * 0.2; }
        const bnc = Math.min(lum[k], own * 2);
        data[k * 4 + 3] = Math.min(255, Math.sqrt(bnc * inv) * 255);
      }
    }
    this.tex.needsUpdate = true;
    this.texDirty = false;
    this.lastUpload = performance.now();
  }
}

/** in-place separable box blur (radius r) of an N x N field, running sums; tmp is scratch */
function boxBlur(a: Float32Array, tmp: Float32Array, N: number, r: number) {
  const k = 1 / (2 * r + 1);
  for (let y = 0; y < N; y++) {
    const row = y * N;
    let s = 0;
    for (let x = -r; x <= r; x++) s += a[row + Math.min(N - 1, Math.max(0, x))];
    for (let x = 0; x < N; x++) {
      tmp[row + x] = s * k;
      s += a[row + Math.min(N - 1, x + r + 1)] - a[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < N; x++) {
    let s = 0;
    for (let y = -r; y <= r; y++) s += tmp[Math.min(N - 1, Math.max(0, y)) * N + x];
    for (let y = 0; y < N; y++) {
      a[y * N + x] = s * k;
      s += tmp[Math.min(N - 1, y + r + 1) * N + x] - tmp[Math.max(0, y - r) * N + x];
    }
  }
}

/**
 * Grid ray march (Amanatides–Woo) across tiles honouring edge walls.
 * visit(x,y) is called for each tile entered (including the start tile).
 */
export function castRay(z: Zone, px: number, pz: number, dx: number, dz: number, maxDist: number, mode: 'sight' | 'light', visit: (x: number, y: number, t: number) => void) {
  let x = Math.floor(px), y = Math.floor(pz);
  if (!z.inb(x, y)) return;
  const stepX = dx > 0 ? 1 : -1, stepY = dz > 0 ? 1 : -1;
  const tDX = dx !== 0 ? Math.abs(1 / dx) : 1e9, tDY = dz !== 0 ? Math.abs(1 / dz) : 1e9;
  let tMX = dx !== 0 ? ((dx > 0 ? x + 1 : x) - px) / dx : 1e9;
  let tMY = dz !== 0 ? ((dz > 0 ? y + 1 : y) - pz) / dz : 1e9;
  visit(x, y, 0);
  const W = z.W;
  for (let guard = 0; guard < 400; guard++) {
    let t: number;
    if (tMX < tMY) {
      t = tMX; if (t > maxDist) return;
      if (z.edgeBlocks(x, y, stepX, 0, mode)) return;
      x += stepX; tMX += tDX;
    } else {
      t = tMY; if (t > maxDist) return;
      if (z.edgeBlocks(x, y, 0, stepY, mode)) return;
      y += stepY; tMY += tDY;
    }
    if (x < 0 || y < 0 || x >= z.W || y >= z.H) return;
    visit(x, y, t);
    const i = y * W + x;
    if (z.sight[i] || !z.floor[i]) return;
  }
}
