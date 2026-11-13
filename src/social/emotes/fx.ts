// What flies out of an emote: sparks, confetti, smoke puffs, glitter. One
// instanced mesh of little lit (or glowing) chips per scene, struct of arrays,
// no allocation per particle; flakes tumble and flutter down and rest on the
// floor for a moment, sparks fall and shrink, smoke rises and swells, glitter
// twinkles. Used by the game (one set in the zone's scene) and by the emote
// shop's stages (src/social/emotes/stage.ts).
import * as THREE from 'three';
import { ModelBuilder } from '../../gfx/modelBuilder';
import { worldMaterial } from '../../gfx/materials';

export const enum FX { Spark = 0, Flake = 1, Smoke = 2, Glitter = 3, Trail = 4 }
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3(), tmpE = new THREE.Euler(), tmpC = new THREE.Color();

class Pool {
  n = 0;
  px: Float32Array; py: Float32Array; pz: Float32Array; vx: Float32Array; vy: Float32Array; vz: Float32Array;
  life: Float32Array; max: Float32Array; size: Float32Array; spin: Float32Array; floor: Float32Array;
  kind: Uint8Array; col: Uint32Array;
  mesh: THREE.InstancedMesh;
  constructor(public cap: number, glow: boolean, standalone: boolean) {
    const A = () => new Float32Array(cap);
    this.px = A(); this.py = A(); this.pz = A(); this.vx = A(); this.vy = A(); this.vz = A();
    this.life = A(); this.max = A(); this.size = A(); this.spin = A(); this.floor = A();
    this.kind = new Uint8Array(cap); this.col = new Uint32Array(cap);
    const mb = new ModelBuilder();
    mb.box(0, -0.5, 0, 1, 1, 1, 'white', { emissive: glow ? 1 : 0, ao: false } as never);
    const mat = standalone ? worldMaterial({ noVis: true, noFog: true, noGrid: true, outline: 0 }) : worldMaterial({ outline: 0 });
    this.mesh = new THREE.InstancedMesh(mb.build(), mat, cap);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.name = 'emoteFx';
  }
}

export class EmoteParticles {
  readonly root = new THREE.Group();
  private lit: Pool; private glow: Pool;
  constructor(cap = 700, o: { standalone?: boolean } = {}) {
    this.lit = new Pool(cap, false, !!o.standalone);
    this.glow = new Pool(Math.round(cap * 0.8), true, !!o.standalone);
    this.root.add(this.lit.mesh, this.glow.mesh);
    this.root.name = 'emoteParticles';
  }
  get count() { return this.lit.n + this.glow.n; }
  /** one particle: world position, velocity, colour, life (s), size (m), the floor it lands on */
  add(kind: FX, x: number, y: number, z: number, vx: number, vy: number, vz: number, col: number, life: number, size: number, floor = -99) {
    const P = kind === FX.Spark || kind === FX.Glitter || kind === FX.Trail ? this.glow : this.lit;
    if (P.n >= P.cap) return;
    const i = P.n++;
    P.px[i] = x; P.py[i] = y; P.pz[i] = z; P.vx[i] = vx; P.vy[i] = vy; P.vz[i] = vz;
    P.life[i] = 0; P.max[i] = life * (0.75 + Math.random() * 0.5); P.size[i] = size; P.spin[i] = Math.random() * 6.28; P.floor[i] = floor;
    P.kind[i] = kind; P.col[i] = col;
  }
  /** a round burst (a firework shell): n sparks out from (x, y, z) */
  burst(x: number, y: number, z: number, n: number, speed: number, cols: number[], floor = -99) {
    for (let k = 0; k < n; k++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      const sp = speed * (0.75 + Math.random() * 0.35);
      this.add(FX.Spark, x, y, z, Math.cos(a) * r * sp, u * sp + 0.6, Math.sin(a) * r * sp, cols[k % cols.length], 1.5, 0.05, floor);
    }
  }
  update(dt: number) { this.step(this.lit, dt); this.step(this.glow, dt); }
  private step(P: Pool, dt: number) {
    const m = P.mesh;
    let i = 0;
    while (i < P.n) {
      P.life[i] += dt;
      const k = P.kind[i], t = P.life[i] / P.max[i];
      if (t >= 1) { this.swap(P, i, --P.n); continue; }
      // motion
      if (k === FX.Spark || k === FX.Trail) { P.vy[i] -= 4.2 * dt; const d = Math.exp(-1.6 * dt); P.vx[i] *= d; P.vy[i] *= d; P.vz[i] *= d; }
      else if (k === FX.Flake) { P.vy[i] = Math.max(P.vy[i] - 6 * dt, -0.55); const d = Math.exp(-2.2 * dt); P.vx[i] *= d; P.vz[i] *= d; P.vx[i] += Math.sin(P.life[i] * 7 + P.spin[i]) * 0.9 * dt; }
      else if (k === FX.Smoke) { P.vy[i] += (0.35 - P.vy[i]) * dt * 1.5; const d = Math.exp(-1.8 * dt); P.vx[i] *= d; P.vz[i] *= d; }
      else if (k === FX.Glitter) { const d = Math.exp(-1.2 * dt); P.vx[i] *= d; P.vy[i] = P.vy[i] * d + 0.05 * dt; P.vz[i] *= d; }
      P.px[i] += P.vx[i] * dt; P.py[i] += P.vy[i] * dt; P.pz[i] += P.vz[i] * dt;
      if (P.py[i] < P.floor[i] + 0.005) { P.py[i] = P.floor[i] + 0.005; P.vx[i] *= 0.2; P.vz[i] *= 0.2; P.vy[i] = 0; if (k === FX.Spark) P.life[i] += dt * 3; }
      i++;
    }
    for (let j = 0; j < P.n; j++) {
      const k = P.kind[j], t = P.life[j] / P.max[j];
      let sz = P.size[j];
      if (k === FX.Spark) sz *= 1 - t * 0.8;
      else if (k === FX.Trail) sz *= 1 - t;
      else if (k === FX.Smoke) sz *= (0.45 + t * 1.1) * (t > 0.6 ? (1 - t) * 2.5 : 1);
      else if (k === FX.Glitter) sz *= 0.4 + 0.6 * Math.abs(Math.sin(P.life[j] * 14 + P.spin[j]));
      else if (k === FX.Flake && t > 0.85) sz *= (1 - t) / 0.15;
      const onFloor = P.py[j] <= P.floor[j] + 0.006;
      const sp = P.spin[j] + P.life[j] * (k === FX.Flake && !onFloor ? 9 : k === FX.Smoke ? 0.6 : 3);
      tmpE.set(k === FX.Flake ? (onFloor ? Math.PI / 2 : sp) : sp * 0.7, sp * 0.5, k === FX.Flake && !onFloor ? sp * 0.8 : 0);
      tmpQ.setFromEuler(tmpE);
      if (k === FX.Flake) tmpS.set(sz, sz * 0.12, sz * 0.7); else tmpS.setScalar(sz);
      tmpP.set(P.px[j], P.py[j], P.pz[j]);
      tmpM.compose(tmpP, tmpQ, tmpS);
      P.mesh.setMatrixAt(j, tmpM);
      tmpC.setHex(P.col[j]);
      if (k === FX.Spark && t > 0.6 && Math.random() < 0.3) tmpC.multiplyScalar(0.4);
      P.mesh.setColorAt(j, tmpC);
    }
    m.count = P.n;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }
  private swap(P: Pool, a: number, b: number) {
    if (a === b) return;
    P.px[a] = P.px[b]; P.py[a] = P.py[b]; P.pz[a] = P.pz[b]; P.vx[a] = P.vx[b]; P.vy[a] = P.vy[b]; P.vz[a] = P.vz[b];
    P.life[a] = P.life[b]; P.max[a] = P.max[b]; P.size[a] = P.size[b]; P.spin[a] = P.spin[b]; P.floor[a] = P.floor[b]; P.kind[a] = P.kind[b]; P.col[a] = P.col[b];
  }
  clear() { this.lit.n = 0; this.glow.n = 0; this.lit.mesh.count = 0; this.glow.mesh.count = 0; }
  dispose() { this.root.removeFromParent(); this.lit.mesh.geometry.dispose(); this.glow.mesh.geometry.dispose(); }
}

/** what an emote's props need from where they play: particles, sound, a flash of light */
export interface FxHost {
  parts: EmoteParticles;
  sound(key: string, vol: number, at: THREE.Vector3, rate?: number): void;
  flash(at: THREE.Vector3, col: number, intensity: number, secs: number): void;
}
export const CONFETTI_COLS = [0xff4d6d, 0xffd23f, 0x3bceac, 0x5e9bff, 0xf28c28, 0xe7e7e7, 0xb06cff];
export const FIRE_COLS = [[0xffd36a, 0xff8a2a, 0xfff2c0], [0x7affc4, 0x2ad1ff, 0xd6fff4], [0xff6ad5, 0xffc0f0, 0xb36aff], [0xff4040, 0xffe066, 0xffffff]];
