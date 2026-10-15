// Blood running down walls. Every wall splat (a committed vertical gore
// decal) grows a few runs that creep down the wall over several seconds and
// bead at their front; splats that were already there when the zone came
// into view show their runs at full length. Runs are derived from the decals
// themselves (seeded by the decal), so every peer draws the same ones with no
// extra network traffic. Droplets that fly into a wall leave small local
// marks too. One small dynamic mesh, rebuilt only while something grows.
import * as THREE from 'three';
import { G } from '../game/G';
import { ModelBuilder } from '../gfx/modelBuilder';
import { worldMaterial } from '../gfx/materials';
import { Rng, hash3 } from '../core/rng';
import type { Zone, Decal } from '../world/zone';

interface Run { zone: string; x: number; z: number; y0: number; len: number; born: number; dur: number; rot: number; w: number; pal: string; tint: number; axis: number }
interface Dot { zone: string; x: number; y: number; z: number; rot: number; s: number; tex: string; tint: number; axis: number }

const MAX_RUNS = 260, MAX_DOTS = 140;

export class WallRuns {
  runs: Run[] = [];
  dots: Dot[] = [];
  root: THREE.Group;
  private mesh: THREE.Mesh | null = null;
  private dirty = false;
  private lastBuild = 0;
  private seen = new WeakSet<Decal>();
  private scanned = new Map<string, number>();
  private mat = worldMaterial({ transparent: true, outline: 0.0, depthWrite: false, cutout: true });

  constructor(root: THREE.Group) { this.root = root; }

  clear() { this.runs.length = 0; this.dots.length = 0; this.scanned.clear(); this.dirty = true; }

  /** a drop hit a wall here (local, cosmetic) */
  dot(zone: string, x: number, y: number, z: number, nx: number, nz: number, col: number) {
    const rot = Math.atan2(nz, nx);
    const r = (col >> 16) & 255, g = (col >> 8) & 255;
    const pal = g > r ? 'glow' : r < 60 && g < 60 ? 'oil' : 'red';
    this.dots.push({ zone, x: x + nx * 0.065, y, z: z + nz * 0.065, rot, s: 0.05 + Math.random() * 0.07, tex: `gore_${pal}_drops`, tint: 0xffffff, axis: Math.abs(nz) >= Math.abs(nx) ? 1 : 2 });
    if (this.dots.length > MAX_DOTS) this.dots.shift();
    // a heavier hit runs
    if (Math.random() < 0.18 && y > 0.4) this.addRun(zone, x + nx * 0.066, z + nz * 0.066, y, rot, 0.08 + Math.random() * 0.4, 0.012, pal, 0xffffff, G.time, 3 + Math.random() * 5);
    this.dirty = true;
  }

  private addRun(zone: string, x: number, z: number, y0: number, rot: number, len: number, w: number, pal: string, tint: number, born: number, dur: number) {
    this.runs.push({ zone, x, z, y0, len, born, dur, rot, w, pal, tint, axis: Math.abs(Math.sin(rot)) >= Math.abs(Math.cos(rot)) ? 1 : 2 });
    if (this.runs.length > MAX_RUNS) this.runs.shift();
    this.dirty = true;
  }

  /** runs for every wall splat in the viewed zone (new ones grow, old ones are already long) */
  scan(z: Zone | null) {
    if (!z) return;
    const L = z.decals.length;
    const prev = this.scanned.get(z.key);
    const fresh = prev !== undefined;
    if (prev === L) return;
    this.scanned.set(z.key, L);
    for (let i = L - 1; i >= 0; i--) {
      const d = z.decals[i];
      if (this.seen.has(d)) { if (fresh) break; continue; }
      this.seen.add(d);
      if (!d.vert || !d.tex.startsWith('gore_')) continue;
      const pal = d.tex.startsWith('gore_red_') ? 'red' : d.tex.startsWith('gore_oil_') ? 'oil' : d.tex.startsWith('gore_glow_') ? 'glow' : '';
      if (!pal) continue;
      const rng = new Rng(hash3(Math.round(d.x * 100), Math.round(d.z * 100), Math.round((d.y ?? 1) * 100)));
      const n = rng.int(1, 3) + (d.w > 0.6 ? 1 : 0);
      const tx = -Math.sin(d.rot), tz = Math.cos(d.rot);
      const base = z.heightAt(Math.floor(d.x), Math.floor(d.z));
      for (let k = 0; k < n; k++) {
        const along = rng.float(-0.35, 0.35) * d.w;
        const y0 = base + (d.y ?? 1.2) - d.d * rng.float(0.05, 0.35);
        const len = Math.min(y0 - base - 0.02, rng.float(0.25, 1.1) * (d.w + 0.3));
        if (len < 0.08) continue;
        this.addRun(z.key, d.x + tx * along + Math.cos(d.rot) * 0.002, d.z + tz * along + Math.sin(d.rot) * 0.002, y0, d.rot, len, rng.float(0.01, 0.022), pal, d.tint ?? 0xffffff, fresh ? G.time : -999, rng.float(5, 14));
      }
    }
  }

  update(z: Zone | null) {
    this.scan(z);
    let growing = false;
    for (const r of this.runs) if (G.time - r.born < r.dur) { growing = true; break; }
    if (!this.dirty && !growing) return;
    if (growing && !this.dirty && G.time - this.lastBuild < 0.1) return;
    this.dirty = false; this.lastBuild = G.time;
    if (this.mesh) { this.root.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh = null; }
    if (!z) return;
    const mb = new ModelBuilder();
    for (const r of this.runs) {
      if (r.zone !== z.key) continue;
      const k = Math.min(1, Math.max(0, (G.time - r.born) / r.dur));
      // fast at first, then it slows as the blood runs out
      const len = r.len * (1 - Math.pow(1 - k, 2.4));
      if (len < 0.01) continue;
      const nx = Math.cos(r.rot), nz = Math.sin(r.rot), ux = nz, uz = -nx;
      const hw = r.w / 2, y1 = r.y0, y0 = r.y0 - len;
      mb.swayDefault = r.axis;
      mb.quadRaw([[r.x - ux * hw, y0, r.z - uz * hw], [r.x + ux * hw, y0, r.z + uz * hw], [r.x + ux * hw, y1, r.z + uz * hw], [r.x - ux * hw, y1, r.z - uz * hw]],
        [[0, 0], [1, 0], [1, len / 0.5], [0, len / 0.5]], `gore_${r.pal}_runline`, r.tint, 0.9, 0, 0, [nx, 0, nz]);
      const bw = r.w * 1.5;
      mb.quadRaw([[r.x - ux * bw, y0 - bw * 1.2, r.z - uz * bw], [r.x + ux * bw, y0 - bw * 1.2, r.z + uz * bw], [r.x + ux * bw, y0 + bw * 0.6, r.z + uz * bw], [r.x - ux * bw, y0 + bw * 0.6, r.z - uz * bw]],
        [[0, 0], [1, 0], [1, 1], [0, 1]], `gore_${r.pal}_bead`, r.tint, 0.9, 0, 0, [nx, 0, nz]);
    }
    for (const d of this.dots) {
      if (d.zone !== z.key) continue;
      const nx = Math.cos(d.rot), nz = Math.sin(d.rot), ux = nz * d.s / 2, uz = -nx * d.s / 2;
      mb.swayDefault = d.axis;
      mb.quadRaw([[d.x - ux, d.y - d.s / 2, d.z - uz], [d.x + ux, d.y - d.s / 2, d.z + uz], [d.x + ux, d.y + d.s / 2, d.z + uz], [d.x - ux, d.y + d.s / 2, d.z - uz]],
        [[0, 0], [1, 0], [1, 1], [0, 1]], d.tex, d.tint, 0.9, 0, 0, [nx, 0, nz]);
    }
    mb.swayDefault = 0;
    if (mb.isEmpty) return;
    this.mesh = new THREE.Mesh(mb.build(), this.mat);
    this.mesh.renderOrder = 1;
    this.mesh.frustumCulled = false;
    this.root.add(this.mesh);
  }
}
