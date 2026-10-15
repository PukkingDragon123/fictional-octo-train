// Cheap gore particles: one InstancedMesh of tiny lit cubes (drops stretched
// along their velocity, mist puffs, meat/plaster chips, stuffing fluff,
// glitch pixels, glass, sparks, dust, slivers). Struct-of-arrays,
// swap-remove, no allocation per particle. Particles live in the zone being
// viewed and die on floors and walls (drops: a wall hit can leave a mark) or
// bounce and rest for a moment (chips); sparks skip and die, dust hangs and
// drifts down slowly.
import * as THREE from 'three';
import { ModelBuilder } from '../gfx/modelBuilder';
import { worldMaterial } from '../gfx/materials';
import type { Zone } from '../world/zone';

export const enum PK { Drop = 0, Mist = 1, Chunk = 2, Fluff = 3, Static = 4, Glass = 5, Spark = 6, Dust = 7, Sliver = 8 }

const G_ACC = 9.8;
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3();
const tmpV = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), tmpC = new THREE.Color();
const STATIC_COLS = [0xff00ff, 0x00e5ff, 0xffffff, 0x050508];

export class Particles {
  readonly cap: number;
  n = 0;
  px: Float32Array; py: Float32Array; pz: Float32Array;
  vx: Float32Array; vy: Float32Array; vz: Float32Array;
  life: Float32Array; max: Float32Array; size: Float32Array; str: Float32Array;
  kind: Uint8Array; rest: Uint8Array; col: Uint32Array;
  mesh: THREE.InstancedMesh;
  private colDirty = true;
  /** a drop flew into a wall at (x, y, z); (nx, nz) is the wall's normal toward the drop */
  onWall?: (x: number, y: number, z: number, nx: number, nz: number, col: number) => void;

  constructor(cap: number, emissive = false) {
    this.cap = cap;
    this.px = new Float32Array(cap); this.py = new Float32Array(cap); this.pz = new Float32Array(cap);
    this.vx = new Float32Array(cap); this.vy = new Float32Array(cap); this.vz = new Float32Array(cap);
    this.life = new Float32Array(cap); this.max = new Float32Array(cap); this.size = new Float32Array(cap); this.str = new Float32Array(cap);
    this.kind = new Uint8Array(cap); this.rest = new Uint8Array(cap); this.col = new Uint32Array(cap);
    const mb = new ModelBuilder();
    mb.box(0, -0.5, 0, 1, 1, 1, 'white', { emissive: emissive ? 0.9 : 0, ao: false });
    this.mesh = new THREE.InstancedMesh(mb.build(), worldMaterial({ outline: 0 }), cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, tmpC.set(0xffffff));
    this.mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false; this.mesh.receiveShadow = false;
  }

  clear() { this.n = 0; this.mesh.count = 0; this.mesh.visible = false; }

  /** spawn one particle; returns false when full */
  add(kind: PK, x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, life: number, col: number, stretch = 0): boolean {
    let i = this.n;
    if (i >= this.cap) {
      // full: recycle the oldest-looking slot (lowest remaining life) among a few
      let best = 0, bl = 1e9;
      for (let k = 0; k < 8; k++) { const j = (Math.random() * this.n) | 0; if (this.life[j] < bl) { bl = this.life[j]; best = j; } }
      i = best;
    } else this.n++;
    this.px[i] = x; this.py[i] = y; this.pz[i] = z;
    this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.size[i] = size; this.life[i] = life; this.max[i] = life; this.str[i] = stretch;
    this.kind[i] = kind; this.rest[i] = 0; this.col[i] = col;
    this.colDirty = true;
    return true;
  }

  private kill(i: number) {
    const j = --this.n;
    if (i !== j) {
      this.px[i] = this.px[j]; this.py[i] = this.py[j]; this.pz[i] = this.pz[j];
      this.vx[i] = this.vx[j]; this.vy[i] = this.vy[j]; this.vz[i] = this.vz[j];
      this.life[i] = this.life[j]; this.max[i] = this.max[j]; this.size[i] = this.size[j]; this.str[i] = this.str[j];
      this.kind[i] = this.kind[j]; this.rest[i] = this.rest[j]; this.col[i] = this.col[j];
    }
    this.colDirty = true;
  }

  update(dt: number, z: Zone | null) {
    if (!this.n) { this.mesh.count = 0; this.mesh.visible = false; return; }
    this.mesh.visible = true;
    for (let i = 0; i < this.n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0 || !z) { this.kill(i); i--; continue; }
      const k = this.kind[i];
      if (this.rest[i]) continue;
      // forces
      let grav = G_ACC, drag = 0.25;
      if (k === PK.Mist) { grav = 0.8; drag = 3.2; this.size[i] *= 1 + dt * 0.9; }
      else if (k === PK.Fluff) { grav = 1.6; drag = 2.6; this.vx[i] += Math.sin(this.life[i] * 9 + i) * dt * 1.5; }
      else if (k === PK.Static) { grav = 0; drag = 6; if (Math.random() < dt * 12) { this.px[i] += (Math.random() - 0.5) * 0.12; this.py[i] += (Math.random() - 0.5) * 0.08; this.col[i] = STATIC_COLS[(Math.random() * 4) | 0]; this.colDirty = true; } }
      else if (k === PK.Spark) { grav = 6.5; drag = 0.9; }
      else if (k === PK.Dust) { grav = 0.35; drag = 2.6; this.vx[i] += Math.sin(this.life[i] * 3 + i) * dt * 0.25; }
      this.vy[i] -= grav * dt;
      const dk = Math.exp(-drag * dt);
      this.vx[i] *= dk; this.vz[i] *= dk; if (k === PK.Mist || k === PK.Fluff || k === PK.Static || k === PK.Dust) this.vy[i] *= dk;
      const ox = this.px[i], oz = this.pz[i];
      const nx = ox + this.vx[i] * dt, nz = oz + this.vz[i] * dt;
      // walls: crossing a tile edge that blocks
      const otx = Math.floor(ox), otz = Math.floor(oz), ntx = Math.floor(nx), ntz = Math.floor(nz);
      if (otx !== ntx || otz !== ntz) {
        let hit = false;
        if (otx !== ntx && z.edgeBlocks(otx, otz, ntx > otx ? 1 : -1, 0, 'walk')) hit = true;
        if (otz !== ntz && z.edgeBlocks(otx, otz, 0, ntz > otz ? 1 : -1, 'walk')) hit = true;
        if (hit) {
          if (k === PK.Drop && this.onWall && this.size[i] > 0.012) {
            const wx = otx !== ntx ? Math.max(otx, ntx) : nx, wz = otz !== ntz ? Math.max(otz, ntz) : nz;
            this.onWall(wx, this.py[i], wz, otx !== ntx ? (ntx > otx ? -1 : 1) : 0, otz !== ntz ? (ntz > otz ? -1 : 1) : 0, this.col[i]);
          }
          if (k === PK.Drop || k === PK.Mist || k === PK.Spark) { this.kill(i); i--; continue; }
          // bounce back off the wall
          if (otx !== ntx) this.vx[i] *= -0.3; if (otz !== ntz) this.vz[i] *= -0.3;
          this.py[i] += this.vy[i] * dt;
          continue;
        }
      }
      this.px[i] = nx; this.pz[i] = nz;
      this.py[i] += this.vy[i] * dt;
      const floor = z.inb(ntx, ntz) && z.floor[z.idx(ntx, ntz)] ? z.heightAt(ntx, ntz) : -3;
      if (this.py[i] <= floor + 0.006) {
        if (floor < -2) { this.kill(i); i--; continue; }
        if (k === PK.Drop) {
          // a drop lands as a flat dot and soaks away under the decal
          this.py[i] = floor + 0.008; this.rest[i] = 1; this.str[i] = -1;
          this.life[i] = Math.min(this.life[i], 0.25 + Math.random() * 0.5);
        } else if (k === PK.Mist) { this.kill(i); i--; continue; }
        else if (k === PK.Spark) {
          // a spark skips once, then dies on the floor
          if (this.vy[i] < -1.5 && this.life[i] > 0.15) { this.py[i] = floor + 0.01; this.vy[i] *= -0.35; this.vx[i] *= 0.6; this.vz[i] *= 0.6; this.life[i] = Math.min(this.life[i], 0.35); }
          else { this.kill(i); i--; continue; }
        } else if (k === PK.Dust) { this.py[i] = floor + 0.02; this.vy[i] = 0; }
        else {
          this.py[i] = floor + this.size[i] * 0.5;
          if (Math.abs(this.vy[i]) > 1.2 && k !== PK.Fluff) { this.vy[i] *= -0.32; this.vx[i] *= 0.6; this.vz[i] *= 0.6; }
          else { this.rest[i] = 1; this.vx[i] = this.vy[i] = this.vz[i] = 0; }
        }
      }
    }
    // matrices
    const m = this.mesh;
    for (let i = 0; i < this.n; i++) {
      const k = this.kind[i];
      let s = this.size[i];
      const lf = this.life[i] / this.max[i];
      if (k === PK.Mist) s *= Math.min(1, lf * 2.5);
      else if (k === PK.Dust) s *= Math.min(1, lf * 1.8) * Math.min(1, (1 - lf) * 8 + 0.2);
      else if (lf < 0.2) s *= lf / 0.2;
      tmpP.set(this.px[i], this.py[i], this.pz[i]);
      if (this.str[i] < 0) {
        // landed drop: a flat little dot
        tmpQ.identity(); tmpS.set(s * 1.6, s * 0.12, s * 1.6);
      } else if (k === PK.Sliver) {
        // splinters / glass slivers: long thin sticks tumbling
        tmpQ.setFromAxisAngle(tmpV.set(Math.sin(i * 2.1), 0.4, Math.cos(i * 1.3)).normalize(), this.rest[i] ? i * 0.7 : this.life[i] * (6 + (i % 5)));
        if (this.rest[i]) tmpQ.setFromAxisAngle(UP, i * 1.7);
        tmpS.set(s * 0.32, s * 0.32, s * 2.6);
        if (this.rest[i]) tmpP.y -= s * 0.1;
      } else if (this.str[i] > 0 && !this.rest[i]) {
        tmpV.set(this.vx[i], this.vy[i], this.vz[i]);
        const sp = tmpV.length();
        if (sp > 0.05) { tmpV.multiplyScalar(1 / sp); tmpQ.setFromUnitVectors(UP, tmpV); } else tmpQ.identity();
        tmpS.set(s, s * (1 + Math.min(4, sp * this.str[i])), s);
      } else {
        tmpQ.setFromAxisAngle(UP, i * 1.7); tmpS.set(s, s, s);
      }
      tmpM.compose(tmpP, tmpQ, tmpS);
      m.setMatrixAt(i, tmpM);
      if (this.colDirty) m.setColorAt(i, tmpC.set(this.col[i]));
    }
    m.count = this.n;
    m.instanceMatrix.needsUpdate = true;
    if (this.colDirty && m.instanceColor) { m.instanceColor.needsUpdate = true; this.colDirty = false; }
  }
}
