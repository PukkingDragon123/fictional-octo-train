import * as THREE from 'three';
import { Zone, LightSource } from './zone';
import { U } from '../gfx/materials';
import { hashf } from '../core/rng';

export const LSUB = 2;          // light texels per tile edge
export const LWIN = 128;        // window size in tiles

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
    // lights already stamped by a previous view of this zone are reset
    for (const l of zone.lights) { l.level = 0; l.fp = null; }
    zone.lightDirty = false;
  }

  /** effective brightness multiplier for a light right now */
  effective(l: LightSource): number {
    if (!l.on || l.broken) return 0;
    if (!this.zone.circuitPowered(l.circuit)) return 0;
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
  }

  private stamp(l: LightSource, mult: number) {
    if (!l.fp) return;
    const r = ((l.color >> 16) & 255) / 255 * l.intensity * mult;
    const g = ((l.color >> 8) & 255) / 255 * l.intensity * mult;
    const b = (l.color & 255) / 255 * l.intensity * mult;
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
      if (l.kind === 'fire' && base > 0) level = 0.8 + 0.2 * Math.sin(time * 9 + l.id) * Math.sin(time * 13.3 + l.id * 2);
      this.setLevel(l, level);
    }
    const now = performance.now();
    if (this.texDirty && now - this.lastUpload > 50) this.upload();
    U.uLightTex.value = this.tex;
    U.uLightInfo.value.set(this.winX, this.winY, 1 / LWIN, 1 / LWIN);
  }

  private upload() {
    const N = LWIN * LSUB;
    const ox = this.winX * LSUB, oy = this.winY * LSUB;
    const inv = 1 / 4; // uGridScale
    const data = this.data, buf = this.buf, W = this.W, H = this.H;
    for (let y = 0; y < N; y++) {
      const gy = oy + y;
      for (let x = 0; x < N; x++) {
        const gx = ox + x;
        const o = (y * N + x) * 4;
        if (gx < 0 || gy < 0 || gx >= W || gy >= H) { data[o] = data[o + 1] = data[o + 2] = 0; data[o + 3] = 255; continue; }
        const i = (gy * W + gx) * 3;
        // sqrt encoding: more precision in the darks
        data[o] = Math.min(255, Math.sqrt(buf[i] * inv) * 255);
        data[o + 1] = Math.min(255, Math.sqrt(buf[i + 1] * inv) * 255);
        data[o + 2] = Math.min(255, Math.sqrt(buf[i + 2] * inv) * 255);
        data[o + 3] = 255;
      }
    }
    this.tex.needsUpdate = true;
    this.texDirty = false;
    this.lastUpload = performance.now();
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
