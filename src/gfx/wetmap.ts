import * as THREE from 'three';
import { U } from './materials';
import type { Zone } from '../world/zone';
import { floorDef } from '../world/defs';

/** texels per tile edge */
const SUB = 2;

/**
 * How shiny / wet each floor is. r = reflectivity used by the post pass for
 * screen-space reflections and by the floor shader for the fixtures' sheen
 * (above ~0.3 the albedo also darkens: really wet, not just polished).
 */
const FLOOR_GLOSS: Record<string, number> = {
  water_shallow: 1, water_deep: 1,
  concrete_wet: 0.82, carpet_wet: 0.18,
  tile_pool: 0.5, tile_pool_blue: 0.55,
  terrazzo: 0.32, checker: 0.26, linoleum: 0.2, linoleum_green: 0.24, linoleum_school: 0.22,
  lab: 0.3, server: 0.18, tile_white: 0.3, tile_kitchen: 0.24, wood_gym: 0.34, wood: 0.14,
  parking: 0.1, concrete: 0.06, glitch: 0.4, void: 0.5, grate: 0.12,
};

/**
 * Per-zone surface map sampled by the world floor shader (src/gfx/materials.ts):
 * r reflectivity, g water, b outdoor (rain makes it wet), a water proximity
 * (where pool caustics dance). Rebuilt when floors change or puddle decals
 * appear; two texels per tile, linear filtered so wet edges are soft.
 */
export class WetMap {
  zone: Zone | null = null;
  tex: THREE.DataTexture | null = null;
  private data: Uint8Array | null = null;
  private W = 0; private H = 0;
  private decalsN = -1;
  private dirty = false;
  private checkT = 0;

  attach(z: Zone) {
    this.zone = z;
    this.dirty = true;
    this.decalsN = -1;
    this.build();
  }

  /** floors changed (dug, built, flooded): rebuild soon */
  invalidate() { this.dirty = true; }

  update(dt: number) {
    const z = this.zone;
    if (!z) return;
    this.checkT -= dt;
    if (this.checkT > 0) return;
    this.checkT = 1;
    if (this.dirty || z.decals.length !== this.decalsN) this.build();
  }

  private build() {
    const z = this.zone;
    if (!z) return;
    this.dirty = false;
    this.decalsN = z.decals.length;
    const W = z.W * SUB, H = z.H * SUB;
    if (!this.tex || this.W !== W || this.H !== H) {
      this.tex?.dispose();
      this.W = W; this.H = H;
      this.data = new Uint8Array(W * H * 4);
      this.tex = new THREE.DataTexture(this.data, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
      this.tex.magFilter = THREE.LinearFilter; this.tex.minFilter = THREE.LinearFilter;
      this.tex.wrapS = this.tex.wrapT = THREE.ClampToEdgeWrapping;
      this.tex.generateMipmaps = false;
    }
    const d = this.data!;
    d.fill(0);
    let any = false, water = false;
    const gloss = new Map<number, [number, number, number]>();
    for (let ty = 0; ty < z.H; ty++) for (let tx = 0; tx < z.W; tx++) {
      const fid = z.floor[ty * z.W + tx];
      if (!fid) continue;
      let g = gloss.get(fid);
      if (!g) { const f = floorDef(fid); g = [Math.round((FLOOR_GLOSS[f.key] ?? 0) * 255), f.water ? 255 : 0, f.outdoor ? 255 : 0]; gloss.set(fid, g); }
      if (g[0] || g[1] || g[2]) any = true;
      if (g[1]) water = true;
      for (let sy = 0; sy < SUB; sy++) for (let sx = 0; sx < SUB; sx++) {
        const o = ((ty * SUB + sy) * W + tx * SUB + sx) * 4;
        d[o] = g[0]; d[o + 1] = g[1]; d[o + 2] = g[2];
      }
    }
    // puddles and water stains: round wet patches
    for (const dc of z.decals) {
      if (dc.vert) continue;
      const t = dc.tex;
      const amt = t.includes('puddle') ? 0.9 : t.includes('stain_water') ? 0.42 : t.includes('water') ? 0.6 : 0;
      if (!amt) continue;
      any = true;
      const r = Math.max(0.2, Math.max(dc.w, dc.d) * 0.42) * SUB;
      const cx = dc.x * SUB, cy = dc.z * SUB;
      for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const k = 1 - Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r;
        if (k <= 0) continue;
        const o = (y * W + x) * 4;
        d[o] = Math.max(d[o], Math.round(255 * amt * Math.min(1, k * 1.8)));
      }
    }
    // water proximity (chamfer distance, ~3 tiles of reach) for caustics on decks and walls
    if (water) {
      const R = 3 * SUB;
      const dist = new Float32Array(W * H).fill(1e9);
      for (let i = 0; i < W * H; i++) if (d[i * 4 + 1]) dist[i] = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x; let v = dist[i];
        if (x > 0) v = Math.min(v, dist[i - 1] + 1);
        if (y > 0) v = Math.min(v, dist[i - W] + 1);
        if (x > 0 && y > 0) v = Math.min(v, dist[i - W - 1] + 1.414);
        if (x < W - 1 && y > 0) v = Math.min(v, dist[i - W + 1] + 1.414);
        dist[i] = v;
      }
      for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
        const i = y * W + x; let v = dist[i];
        if (x < W - 1) v = Math.min(v, dist[i + 1] + 1);
        if (y < H - 1) v = Math.min(v, dist[i + W] + 1);
        if (x < W - 1 && y < H - 1) v = Math.min(v, dist[i + W + 1] + 1.414);
        if (x > 0 && y < H - 1) v = Math.min(v, dist[i + W - 1] + 1.414);
        dist[i] = v;
      }
      for (let i = 0; i < W * H; i++) { const v = dist[i]; d[i * 4 + 3] = v <= 0 ? 255 : v >= R ? 0 : Math.round(255 * Math.pow(1 - v / R, 1.6) * 0.75); }
    }
    this.tex!.needsUpdate = true;
    U.uWetTex.value = this.tex;
    U.uWetInfo.value.set(0, 0, 1 / z.W, 1 / z.H);
    U.uWetOn.value = any ? 1 : 0;
  }
}
