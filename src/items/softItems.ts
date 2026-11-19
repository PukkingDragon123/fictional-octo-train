// Paper and cloth lying about (the art pass, wave 3): a note, a sheet, a photo,
// a rag or a towel on the floor is a small verlet sheet instead of a rigid
// model. Dropped, it falls through the air like the thing it is: paper sails
// and side-slips and lands with its corners curling, cloth drops straight and
// slumps into folds. Walk past it fast and the draught of your legs lifts its
// edges; it flutters and settles again. Everything else about the item (its
// place, picking it up, its id) stays with the WorldItem; the sheet only draws.
//
// Cost: 12..42 points per sheet, four constraint passes, and only while awake;
// a settled sheet sleeps and its geometry is left alone.
import * as THREE from 'three';
import { ModelBuilder } from '../gfx/modelBuilder';
import { worldMaterial } from '../gfx/materials';
import type { Zone } from '../world/zone';

interface SoftSpec {
  w: number; d: number; nx: number; nz: number;
  top: string; back: string; color?: number; backColor?: number; rep?: number;
  /** paper: stiff in bending, sails as it falls; cloth: limp, drops and folds */
  kind: 'paper' | 'cloth';
  /** grams per square metre-ish: how much the air holds it up */
  drag?: number;
}
const SOFT: Record<string, SoftSpec> = {
  paper: { w: 0.21, d: 0.28, nx: 5, nz: 6, top: 'i3_paper', back: 'i3_paper_back', kind: 'paper' },
  note: { w: 0.1, d: 0.12, nx: 4, nz: 4, top: 'i3_note', back: 'i3_note_back', kind: 'paper' },
  photo_old: { w: 0.088, d: 0.107, nx: 3, nz: 4, top: 'i_photo_old', back: 'i3_photo_back', kind: 'paper', drag: 0.7 },
  rag: { w: 0.2, d: 0.17, nx: 6, nz: 5, top: 'i_rag', back: 'i_rag', backColor: 0xd8d4c8, rep: 0.06, kind: 'cloth' },
  rag_dirty: { w: 0.2, d: 0.17, nx: 6, nz: 5, top: 'i_rag_dirty', back: 'i_rag_dirty', backColor: 0xc8c0a8, rep: 0.06, kind: 'cloth' },
  towel_item: { w: 0.42, d: 0.28, nx: 7, nz: 5, top: 'i_knit', back: 'i_knit', color: 0x6ab0d8, backColor: 0x5a98c0, rep: 0.05, kind: 'cloth', drag: 0.4 },
};
export const isSoftItem = (key: string) => key in SOFT;
/** dev: how far a just-dropped sheet falls (hand height) */
export const SOFT_DEBUG = { fall: 0.85 };

/** something walking about that stirs the air (x, z and its velocity) */
export interface Draught { x: number; z: number; vx: number; vz: number }

const G = 9.8;
let rngS = 1;
const rnd = () => { rngS = (rngS * 16807) % 2147483647; return rngS / 2147483647; };

export class SoftSheet {
  mesh: THREE.Mesh;
  private s: SoftSpec;
  private n: number;
  private p: Float32Array;
  private q: Float32Array;
  /** constraints: a, b, rest length, stiffness */
  private cA: Int32Array; private cB: Int32Array; private cL: Float32Array; private cK: Float32Array;
  private vMap: Int32Array;
  private vSign: Float32Array;
  private pos: THREE.BufferAttribute;
  private nor: THREE.BufferAttribute;
  private still = 0;
  awake = true;
  private t = 0;
  private ox = 0; private oy = 0; private oz = 0;
  private seed: number;
  /** how high each point rests off the floor: the folds a cloth slumps into, the curl a page keeps */
  private rest: Float32Array;

  constructor(key: string, uid: number) {
    const s = this.s = SOFT[key];
    this.seed = (uid * 2654435761) >>> 0;
    {
      const W0 = s.nx + 1, H0 = s.nz + 1, f = (this.seed % 1000) / 1000;
      this.rest = new Float32Array(W0 * H0);
      for (let k = 0; k < W0 * H0; k++) {
        const u = (k % W0) / s.nx, v = Math.floor(k / W0) / s.nz;
        if (s.kind === 'cloth') {
          // two or three soft ridges running across it, a slump in the middle, a lifted corner
          const amp = Math.min(0.045, Math.max(s.w, s.d) * 0.11);
          const r1 = Math.max(0, Math.sin(u * (5 + f * 4) + v * (2 + f * 3) + f * 6.28));
          const r2 = Math.max(0, Math.sin(v * (4 + f * 3) - u * 1.5 + f * 3.1)) * 0.6;
          this.rest[k] = amp * (r1 * r1 * 0.8 + r2 * r2 * 0.5) + amp * 0.5 * Math.max(0, 1 - Math.hypot(u - 0.3 - f * 0.4, v - 0.6) * 3);
        } else {
          // a page remembers being rolled: its long edges lift, one corner more
          const e = Math.min(u, 1 - u), c = Math.max(0, u + v - 1.6) / 0.4;
          this.rest[k] = Math.max(s.w, s.d) * (0.025 * Math.max(0, 0.25 - e) / 0.25 + 0.07 * c * c);
        }
      }
    }
    const W = s.nx + 1, H = s.nz + 1;
    this.n = W * H;
    this.p = new Float32Array(this.n * 3); this.q = new Float32Array(this.n * 3);
    // the geometry: per cell a top quad and a back quad (the same corners, reversed)
    const mb = new ModelBuilder();
    const vm: number[] = [], vs: number[] = [];
    const UV = (i: number, j: number): number[] => s.rep ? [(i / s.nx) * s.w / s.rep, (j / s.nz) * s.d / s.rep] : [Math.min(0.999, i / s.nx), Math.min(0.999, j / s.nz)];
    const P = (i: number, j: number) => [-s.w / 2 + (i / s.nx) * s.w, 0, s.d / 2 - (j / s.nz) * s.d];
    for (let j = 0; j < s.nz; j++) for (let i = 0; i < s.nx; i++) {
      const a = j * W + i, b = a + 1, c = a + W + 1, d = a + W;
      mb.quadRaw([P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)], [UV(i, j), UV(i + 1, j), UV(i + 1, j + 1), UV(i, j + 1)], s.top, s.color ?? 0xffffff, 1);
      vm.push(a, b, c, d); vs.push(1, 1, 1, 1);
      mb.quadRaw([P(i, j + 1), P(i + 1, j + 1), P(i + 1, j), P(i, j)], [UV(i, j + 1), UV(i + 1, j + 1), UV(i + 1, j), UV(i, j)], s.back, s.backColor ?? s.color ?? 0xffffff, 0.7);
      vm.push(d, c, b, a); vs.push(-1, -1, -1, -1);
    }
    const g = mb.build();
    this.vMap = Int32Array.from(vm); this.vSign = Float32Array.from(vs);
    this.pos = g.getAttribute('position') as THREE.BufferAttribute;
    this.nor = g.getAttribute('normal') as THREE.BufferAttribute;
    this.pos.setUsage(THREE.DynamicDrawUsage); this.nor.setUsage(THREE.DynamicDrawUsage);
    this.mesh = new THREE.Mesh(g, worldMaterial({}));
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    // constraints: structure, shear, and bending (two apart); paper resists bending, cloth hardly
    const A: number[] = [], B: number[] = [], L: number[] = [], Kk: number[] = [];
    const dx = s.w / s.nx, dz = s.d / s.nz;
    const paper = s.kind === 'paper';
    const add = (i0: number, j0: number, i1: number, j1: number, k: number, shrink = 1) => {
      if (i1 < 0 || j1 < 0 || i1 >= W || j1 >= H) return;
      A.push(j0 * W + i0); B.push(j1 * W + i1); L.push(Math.hypot((i1 - i0) * dx, (j1 - j0) * dz) * shrink); Kk.push(k);
    };
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      add(i, j, i + 1, j, 1); add(i, j, i, j + 1, 1);
      add(i, j, i + 1, j + 1, paper ? 0.9 : 0.5); add(i + 1, j, i, j + 1, paper ? 0.9 : 0.5);
      // a sheet that has been rolled or folded keeps a little curl: its bends rest a hair short
      add(i, j, i + 2, j, paper ? 0.55 : 0.04, paper ? 0.997 : 1); add(i, j, i, j + 2, paper ? 0.55 : 0.04, paper ? 0.994 : 1);
    }
    this.cA = Int32Array.from(A); this.cB = Int32Array.from(B); this.cL = Float32Array.from(L); this.cK = Float32Array.from(Kk);
  }

  /** lay the sheet out at the item's place: falling from hand height when it was just dropped, else settled */
  place(z: Zone, x: number, y: number, zz: number, rot: number, fresh: boolean) {
    const s = this.s, W = s.nx + 1;
    rngS = (this.seed % 2147483646) + 1;
    const cs = Math.cos(rot), sn = Math.sin(rot);
    // cloth lands bunched (so it folds), paper lands flat
    const bunch = s.kind === 'cloth' ? 0.72 + rnd() * 0.12 : 1;
    const h0 = fresh ? SOFT_DEBUG.fall : 0.05;
    const tip = fresh ? (rnd() - 0.5) * 0.9 : 0;
    for (let k = 0; k < this.n; k++) {
      const i = k % W, j = Math.floor(k / W);
      const lx = (-s.w / 2 + (i / s.nx) * s.w) * bunch, lz = (s.d / 2 - (j / s.nz) * s.d) * (s.kind === 'cloth' ? 0.95 : 1);
      const px = x + lx * cs - lz * sn, pz = zz + lx * sn + lz * cs;
      const py = y + h0 + lx * Math.sin(tip) + (s.kind === 'cloth' ? (rnd() - 0.5) * 0.03 : 0);
      this.p[k * 3] = px; this.p[k * 3 + 1] = py; this.p[k * 3 + 2] = pz;
      this.q[k * 3] = px; this.q[k * 3 + 1] = py; this.q[k * 3 + 2] = pz;
    }
    this.ox = x; this.oy = y; this.oz = zz;
    this.awake = true; this.still = 0; this.t = rnd() * 10;
    // a sheet already lying there is settled now, not in front of you
    if (!fresh) { for (let i = 0; i < 70; i++) this.step(z, 1 / 60, null); this.awake = true; }
    this.write();
  }

  /** stir: something passed close and fast */
  gust(d: Draught) {
    const sp = Math.hypot(d.vx, d.vz);
    if (sp < 1.2) return;
    const s = this.s, k0 = (s.kind === 'paper' ? 0.010 : 0.004) * Math.min(1.8, sp / 3) * (s.drag ?? 1);
    let hit = false;
    for (let k = 0; k < this.n; k++) {
      const ddx = this.p[k * 3] - d.x, ddz = this.p[k * 3 + 2] - d.z, r = Math.hypot(ddx, ddz);
      if (r > 0.75) continue;
      const f = k0 * (1 - r / 0.75) * (0.6 + 0.8 * Math.abs(Math.sin(k * 1.7 + this.t * 3)));
      // the edge nearest the legs lifts most: push the old position down so the point rises
      this.q[k * 3 + 1] -= f;
      this.q[k * 3] -= d.vx / sp * f * 0.6; this.q[k * 3 + 2] -= d.vz / sp * f * 0.6;
      hit = true;
    }
    if (hit) { this.awake = true; this.still = 0; }
  }

  /** one tick; returns false once asleep */
  step(z: Zone, dt: number, draughts: Draught[] | null): boolean {
    if (draughts) for (const d of draughts) if (Math.abs(d.x - this.ox) < 1 && Math.abs(d.z - this.oz) < 1) this.gust(d);
    if (!this.awake) return false;
    dt = Math.min(dt, 1 / 30);
    this.t += dt;
    const s = this.s, W = s.nx + 1, p = this.p, q = this.q, n = this.n;
    const paper = s.kind === 'paper';
    const drag = (paper ? 2.6 : 1.4) * (s.drag ?? 1);
    // the sheet's mean normal and velocity: air presses against the face it moves into
    let nx = 0, ny = 0, nz = 0;
    {
      const a = 0, b = s.nx, c = s.nz * W, d = s.nz * W + s.nx;
      const ux = p[d * 3] - p[a * 3], uy = p[d * 3 + 1] - p[a * 3 + 1], uz = p[d * 3 + 2] - p[a * 3 + 2];
      const vx = p[c * 3] - p[b * 3], vy = p[c * 3 + 1] - p[b * 3 + 1], vz = p[c * 3 + 2] - p[b * 3 + 2];
      nx = uy * vz - uz * vy; ny = uz * vx - ux * vz; nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    }
    const dt2 = dt * dt;
    let moved = 0;
    for (let k = 0; k < n; k++) {
      const o = k * 3;
      let vx = p[o] - q[o], vy = p[o + 1] - q[o + 1], vz = p[o + 2] - q[o + 2];
      // air: plain drag, plus a push along the normal against the motion through the face (lift, side-slip)
      const vn = (vx * nx + vy * ny + vz * nz) / dt;
      const damp = Math.exp(-0.9 * dt);
      vx *= damp; vy *= damp; vz *= damp;
      const fa = -vn * drag * (paper ? 1 : 0.5);
      let ax = nx * fa, ay = ny * fa - G, az = nz * fa;
      // paper sails: a slow rocking flutter while it is off the ground
      if (paper && p[o + 1] - this.oy > 0.06) { const w = Math.sin(this.t * 7 + (k % W) * 0.6) * 2.2; ax += w * ny * 0.6; az += w * 0.4; ay += Math.abs(w) * 0.3; }
      // a sheet standing on its edge topples (nothing holds paper upright)
      if (Math.abs(ny) < 0.6 && p[o + 1] - this.oy > 0.015) { const tf = (this.seed & 1 ? 1 : -1) * 4; ax += nx * tf; az += nz * tf; }
      q[o] = p[o]; q[o + 1] = p[o + 1]; q[o + 2] = p[o + 2];
      p[o] += vx + ax * dt2; p[o + 1] += vy + ay * dt2; p[o + 2] += vz + az * dt2;
    }
    // constraints, then the floor
    for (let it = 0; it < 4; it++) {
      for (let c = 0; c < this.cA.length; c++) {
        const a = this.cA[c] * 3, b = this.cB[c] * 3;
        const dx = p[b] - p[a], dy = p[b + 1] - p[a + 1], dz = p[b + 2] - p[a + 2];
        const l = Math.hypot(dx, dy, dz) || 1e-6;
        const L = this.cL[c];
        // cloth bends freely shorter than rest (folds), never stretches
        if (!paper && this.cK[c] < 0.2 && l < L) continue;
        const k = ((l - L) / l) * 0.5 * this.cK[c];
        p[a] += dx * k; p[a + 1] += dy * k; p[a + 2] += dz * k;
        p[b] -= dx * k; p[b + 1] -= dy * k; p[b + 2] -= dz * k;
      }
      for (let k = 0; k < n; k++) {
        const o = k * 3;
        const fy = z.heightAt(Math.floor(p[o]), Math.floor(p[o + 2])) + 0.0012 + (k % 3) * 0.0002 + this.rest[k];
        if (p[o + 1] < fy) {
          p[o + 1] = fy;
          // friction: on the ground it stops sliding
          const fr = paper ? 0.55 : 0.8;
          q[o] += (p[o] - q[o]) * fr; q[o + 2] += (p[o + 2] - q[o + 2]) * fr;
          if (q[o + 1] < fy) q[o + 1] = fy;
        }
      }
    }
    // stays where the item is: a sheet that drifted is drawn back under its anchor
    let cx = 0, cz = 0;
    for (let k = 0; k < n; k++) { cx += p[k * 3]; cz += p[k * 3 + 2]; }
    cx = cx / n - this.ox; cz = cz / n - this.oz;
    const dr = Math.hypot(cx, cz);
    if (dr > 0.22) { const f = (dr - 0.22) / dr; for (let k = 0; k < n; k++) { p[k * 3] -= cx * f; q[k * 3] -= cx * f; p[k * 3 + 2] -= cz * f; q[k * 3 + 2] -= cz * f; } }
    for (let k = 0; k < n * 3; k++) moved = Math.max(moved, Math.abs(p[k] - q[k]));
    if (moved < 0.00025) { if (++this.still > 20) this.awake = false; } else this.still = 0;
    return this.awake;
  }

  /** points into the mesh (relative to the item's place), with smooth normals */
  write() {
    const s = this.s, W = s.nx + 1, H = s.nz + 1, p = this.p;
    const nrm = new Float32Array(this.n * 3);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const k = j * W + i;
      const r = j * W + Math.min(W - 1, i + 1), l = j * W + Math.max(0, i - 1);
      const u = Math.max(0, j - 1) * W + i, d = Math.min(H - 1, j + 1) * W + i;
      const ax = p[r * 3] - p[l * 3], ay = p[r * 3 + 1] - p[l * 3 + 1], az = p[r * 3 + 2] - p[l * 3 + 2];
      const bx = p[u * 3] - p[d * 3], by = p[u * 3 + 1] - p[d * 3 + 1], bz = p[u * 3 + 2] - p[d * 3 + 2];
      let nx = -(ay * bz - az * by), ny = -(az * bx - ax * bz), nz = -(ax * by - ay * bx);
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len; ny /= len; nz /= len;
      nrm[k * 3] = nx; nrm[k * 3 + 1] = ny; nrm[k * 3 + 2] = nz;
    }
    const P = this.pos.array as Float32Array, N = this.nor.array as Float32Array;
    for (let v = 0; v < this.vMap.length; v++) {
      const k = this.vMap[v] * 3, sg = this.vSign[v];
      P[v * 3] = p[k] - this.ox; P[v * 3 + 1] = p[k + 1] - this.oy + (sg < 0 ? -0.0005 : 0); P[v * 3 + 2] = p[k + 2] - this.oz;
      N[v * 3] = nrm[k] * sg; N[v * 3 + 1] = nrm[k + 1] * sg; N[v * 3 + 2] = nrm[k + 2] * sg;
    }
    this.pos.needsUpdate = true; this.nor.needsUpdate = true;
  }

  /** the anchor moved (the item was nudged or slid): carry the whole sheet */
  follow(x: number, y: number, zz: number) {
    const dx = x - this.ox, dy = y - this.oy, dz = zz - this.oz;
    if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) < 1e-5) return;
    for (let k = 0; k < this.n; k++) { this.p[k * 3] += dx; this.q[k * 3] += dx; this.p[k * 3 + 1] += dy; this.q[k * 3 + 1] += dy; this.p[k * 3 + 2] += dz; this.q[k * 3 + 2] += dz; }
    this.ox = x; this.oy = y; this.oz = zz;
    this.awake = true; this.still = 0;
  }

  dispose() { this.mesh.geometry.dispose(); }
}
