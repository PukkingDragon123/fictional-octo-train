// Rigid bodies for loose things: wall chunks and rubble, knocked-over
// furniture, glass shards. A small, fast box solver (oriented boxes, sequential
// impulses with Coulomb friction, restitution, split position correction and
// sleeping) that collides with the tile world the way everything else does:
// floor heights per tile, wall edges (a broken wall is an open arch, so holes
// let things through), the footprints of furniture standing on the grid (tops
// can be landed on), and the other bodies (corner-in-box contacts through a
// spatial hash). It is local and cosmetic for chunks (every peer runs its own
// shower of rubble from the synced wall op); furniture bodies are owned by the
// peer that knocked them and end in an 'objRelease' op (src/world/propPhys.ts).
//
// Budget: a cap on awake bodies (the oldest chunks are put to sleep), a cap on
// bodies alive (the oldest sleeping chunks fade out first), sleeping bodies
// cost nothing, and chunks fade away a while after they settle. Drawing: the
// chunks of one break share one CPU-posed mesh (only moving pieces are
// re-posed), small rubble bits are instanced (one draw call per kind).
import * as THREE from 'three';
import type { Zone } from './zone';
import { objDef } from './objects';
import { objFootprint } from './collision';
import { worldMaterial } from '../gfx/materials';

const DT = 1 / 60;
const GRAV = 9.8;
const SLOP = 0.003;
const WALL_T = 0.065;
const ITER = 7;

export type RKind = 'chunk' | 'bit' | 'prop';

export interface RBody {
  id: number;
  kind: RKind;
  p: THREE.Vector3; q: THREE.Quaternion; v: THREE.Vector3; w: THREE.Vector3;
  /** half extents (body frame) */
  h: THREE.Vector3;
  m: number; im: number;
  /** inverse inertia, body frame (diagonal) */
  iI: THREE.Vector3;
  e: number; mu: number;
  /** material key for sounds / dust ('drywall', 'concrete', 'brick', 'wood', 'glass', 'metal', 'fabric', 'plastic', 'ceramic') */
  mat: string;
  awake: boolean; still: number; age: number; slept: number;
  /** seconds asleep before it fades (Infinity: never) */
  life: number;
  /** 1 visible .. 0 gone (fading out) */
  fade: number; fading: boolean; dead: boolean;
  /** world-only collision (rubble bits): never tested against other bodies */
  solo: boolean;
  /** bodies of one break ignore each other for a moment (they start touching) */
  group: number; groupUntil: number;
  /** frames since it last touched the ground */
  air: number;
  lastSnd: number;
  dirty: boolean;
  /** rotation matrix (row major) refreshed each step */
  R: Float32Array;
  onImpact?: (b: RBody, speed: number, x: number, y: number, z: number, other: RBody | null) => void;
  /** drawn by: a batch slot, an instance, or the owner (props) */
  batch?: Batch; slot?: number;
  pool?: InstPool; inst?: number; scale?: number;
  user?: any;
}

interface Contact { a: RBody; b: RBody | null; nx: number; ny: number; nz: number; px: number; py: number; pz: number; d: number; bias: number; jn: number; jt: number; kn: number; tx: number; ty: number; tz: number; kt: number; bStatic: boolean }

let nextId = 1;
const _v = new THREE.Vector3(), _m = new THREE.Matrix4(), _s = new THREE.Vector3();

function rot(b: RBody) {
  const { x, y, z, w } = b.q, R = b.R;
  R[0] = 1 - 2 * (y * y + z * z); R[1] = 2 * (x * y - w * z); R[2] = 2 * (x * z + w * y);
  R[3] = 2 * (x * y + w * z); R[4] = 1 - 2 * (x * x + z * z); R[5] = 2 * (y * z - w * x);
  R[6] = 2 * (x * z - w * y); R[7] = 2 * (y * z + w * x); R[8] = 1 - 2 * (x * x + y * y);
}
/** out = I^-1 (world) * (x, y, z) */
function iInv(b: RBody, x: number, y: number, z: number, out: number[]) {
  const R = b.R, I = b.iI;
  // to body frame (R^T v), scale, back (R v)
  const lx = (R[0] * x + R[3] * y + R[6] * z) * I.x, ly = (R[1] * x + R[4] * y + R[7] * z) * I.y, lz = (R[2] * x + R[5] * y + R[8] * z) * I.z;
  out[0] = R[0] * lx + R[1] * ly + R[2] * lz; out[1] = R[3] * lx + R[4] * ly + R[5] * lz; out[2] = R[6] * lx + R[7] * ly + R[8] * lz;
}
const _t3 = [0, 0, 0];

export interface BodyOpts {
  kind: RKind; p: THREE.Vector3; q?: THREE.Quaternion; v?: THREE.Vector3; w?: THREE.Vector3; h: THREE.Vector3;
  mass: number; e?: number; mu?: number; mat: string; life?: number; solo?: boolean; group?: number; groupFor?: number;
  onImpact?: RBody['onImpact']; user?: any;
}

// ================================================================ drawing
/** the chunks of one break: one mesh, each chunk a vertex range posed on the CPU */
export class Batch {
  mesh: THREE.Mesh;
  geo: THREE.BufferGeometry;
  rest: Float32Array; restN: Float32Array;
  ranges: [number, number][] = [];
  bodies: (RBody | null)[] = [];
  live = 0;
  constructor(parts: THREE.BufferGeometry[], mat: THREE.Material) {
    let vt = 0, it = 0;
    for (const g of parts) { vt += g.getAttribute('position').count; it += g.getIndex()!.count; }
    const names = Object.keys(parts[0].attributes);
    const geo = new THREE.BufferGeometry();
    for (const n of names) {
      const sz = parts[0].getAttribute(n).itemSize;
      const arr = new Float32Array(vt * sz);
      let o = 0;
      for (const g of parts) { const a = g.getAttribute(n) as THREE.BufferAttribute; arr.set(a.array as Float32Array, o); o += a.count * sz; }
      const at = new THREE.BufferAttribute(arr, sz);
      if (n === 'position' || n === 'normal') at.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute(n, at);
    }
    const idx = vt > 65535 ? new Uint32Array(it) : new Uint16Array(it);
    let v0 = 0, i0 = 0;
    for (const g of parts) {
      const I = g.getIndex()!, n = g.getAttribute('position').count;
      for (let k = 0; k < I.count; k++) idx[i0 + k] = I.getX(k) + v0;
      this.ranges.push([v0, v0 + n]);
      v0 += n; i0 += I.count;
    }
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    this.rest = new Float32Array(geo.getAttribute('position').array as Float32Array);
    this.restN = new Float32Array(geo.getAttribute('normal').array as Float32Array);
    this.geo = geo;
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false; this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.mesh.matrixAutoUpdate = false;
  }
  pose() {
    const P = this.geo.getAttribute('position') as THREE.BufferAttribute, N = this.geo.getAttribute('normal') as THREE.BufferAttribute;
    const pa = P.array as Float32Array, na = N.array as Float32Array;
    let any = false;
    for (let i = 0; i < this.bodies.length; i++) {
      const b = this.bodies[i];
      if (!b || !b.dirty) continue;
      b.dirty = false; any = true;
      const [v0, v1] = this.ranges[i];
      if (b.dead) { for (let v = v0; v < v1; v++) { pa[v * 3] = b.p.x; pa[v * 3 + 1] = -50; pa[v * 3 + 2] = b.p.z; } this.bodies[i] = null; continue; }
      const R = b.R, s = b.fade, px = b.p.x, py = b.p.y - (1 - s) * b.h.y * 1.2, pz = b.p.z;
      for (let v = v0; v < v1; v++) {
        const x = this.rest[v * 3] * s, y = this.rest[v * 3 + 1] * s, z = this.rest[v * 3 + 2] * s;
        pa[v * 3] = R[0] * x + R[1] * y + R[2] * z + px;
        pa[v * 3 + 1] = R[3] * x + R[4] * y + R[5] * z + py;
        pa[v * 3 + 2] = R[6] * x + R[7] * y + R[8] * z + pz;
        const nx = this.restN[v * 3], ny = this.restN[v * 3 + 1], nz = this.restN[v * 3 + 2];
        na[v * 3] = R[0] * nx + R[1] * ny + R[2] * nz;
        na[v * 3 + 1] = R[3] * nx + R[4] * ny + R[5] * nz;
        na[v * 3 + 2] = R[6] * nx + R[7] * ny + R[8] * nz;
      }
    }
    if (any) { P.needsUpdate = true; N.needsUpdate = true; }
  }
  dispose() { this.geo.dispose(); }
}

/** one kind of small rubble bit, instanced */
export class InstPool {
  mesh: THREE.InstancedMesh;
  free: number[] = [];
  dirty = false;
  constructor(public key: string, public geo: THREE.BufferGeometry, public half: THREE.Vector3, public cap: number, mat: THREE.Material) {
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.frustumCulled = false; this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    _m.makeScale(0, 0, 0);
    for (let i = cap - 1; i >= 0; i--) { this.mesh.setMatrixAt(i, _m); this.free.push(i); }
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }
  alloc(): number { return this.free.length ? this.free.pop()! : -1; }
  release(i: number) { _m.makeScale(0, 0, 0); this.mesh.setMatrixAt(i, _m); this.free.push(i); this.dirty = true; }
  set(i: number, b: RBody) {
    const s = (b.scale ?? 1) * b.fade;
    _s.set(s, s, s);
    _v.copy(b.p); _v.y -= (1 - b.fade) * b.h.y;
    _m.compose(_v, b.q, _s);
    this.mesh.setMatrixAt(i, _m);
    this.dirty = true;
  }
  flush() { if (this.dirty) { this.mesh.instanceMatrix.needsUpdate = true; this.dirty = false; } }
}

// ================================================================ the world
export class RigidWorld {
  bodies: RBody[] = [];
  root = new THREE.Group();
  batches: Batch[] = [];
  pools = new Map<string, InstPool>();
  zone: Zone | null = null;
  time = 0;
  private acc = 0;
  private contacts: Contact[] = [];
  private cpool: Contact[] = [];
  private hash = new Map<number, RBody[]>();
  /** a cap on impact sounds per second (a shower of rubble is not 200 sounds) */
  private sndBudget = 0;
  quality = 1;
  /** chunk budget per quality: [awake, alive] */
  static BUDGET: [number, number][] = [[45, 90], [110, 220], [170, 320]];
  /** a mover (player, inhabitant) the bodies are pushed out of: set by the owner each frame */
  movers: { x: number; y: number; z: number; r: number; vx: number; vz: number; kg: number; out?: (dx: number, dz: number) => void }[] = [];

  constructor(parent: THREE.Object3D) { this.root.name = 'rigid'; parent.add(this.root); }

  setZone(z: Zone | null) {
    if (z === this.zone) return;
    this.clear();
    this.zone = z;
  }

  clear() {
    for (const b of this.bodies) { b.dead = true; if (b.pool && b.inst !== undefined && b.inst >= 0) b.pool.release(b.inst); }
    this.bodies.length = 0;
    for (const bt of this.batches) { this.root.remove(bt.mesh); bt.dispose(); }
    this.batches.length = 0;
    for (const p of this.pools.values()) p.flush();
  }

  add(o: BodyOpts): RBody {
    const h = o.h.clone().max(_v.set(0.008, 0.008, 0.008));
    const m = Math.max(0.02, o.mass);
    const ix = 3 / (m * (h.y * h.y + h.z * h.z)), iy = 3 / (m * (h.x * h.x + h.z * h.z)), iz = 3 / (m * (h.x * h.x + h.y * h.y));
    const b: RBody = {
      id: nextId++, kind: o.kind, p: o.p.clone(), q: (o.q ?? new THREE.Quaternion()).clone().normalize(), v: (o.v ?? new THREE.Vector3()).clone(), w: (o.w ?? new THREE.Vector3()).clone(),
      h, m, im: 1 / m, iI: new THREE.Vector3(ix, iy, iz), e: o.e ?? 0.15, mu: o.mu ?? 0.6, mat: o.mat,
      awake: true, still: 0, age: 0, slept: 0, life: o.life ?? 25, fade: 1, fading: false, dead: false, solo: !!o.solo,
      group: o.group ?? 0, groupUntil: this.time + (o.groupFor ?? 0.3), air: 0, lastSnd: -1, dirty: true, R: new Float32Array(9), onImpact: o.onImpact, user: o.user,
    };
    rot(b);
    this.bodies.push(b);
    return b;
  }

  /** a set of chunk bodies drawn as one mesh (geometry of each in its body frame) */
  addBatch(bodies: RBody[], geos: THREE.BufferGeometry[], mat?: THREE.Material): Batch | null {
    if (!bodies.length) return null;
    const bt = new Batch(geos, mat ?? worldMaterial({}));
    bodies.forEach((b, i) => { b.batch = bt; b.slot = i; bt.bodies.push(b); });
    bt.live = bodies.length;
    bt.pose();
    this.root.add(bt.mesh);
    this.batches.push(bt);
    return bt;
  }

  pool(key: string, make: () => { geo: THREE.BufferGeometry; half: THREE.Vector3 }, cap = 140): InstPool {
    let p = this.pools.get(key);
    if (!p) { const g = make(); p = new InstPool(key, g.geo, g.half, cap, worldMaterial({})); this.pools.set(key, p); this.root.add(p.mesh); }
    return p;
  }

  /** a small instanced bit (null when its pool is full) */
  addBit(pool: InstPool, o: Omit<BodyOpts, 'h' | 'kind'> & { scale: number }): RBody | null {
    const i = pool.alloc(); if (i < 0) return null;
    const b = this.add({ ...o, kind: 'bit', h: pool.half.clone().multiplyScalar(o.scale), solo: true });
    b.pool = pool; b.inst = i; b.scale = o.scale;
    pool.set(i, b);
    return b;
  }

  remove(b: RBody) {
    if (b.dead) return;
    b.dead = true; b.dirty = true;
    if (b.pool && b.inst !== undefined && b.inst >= 0) { b.pool.release(b.inst); b.inst = -1; }
    if (b.batch) b.batch.live--;
  }

  wake(b: RBody) { if (!b.awake) { b.awake = true; b.still = 0; } }

  /** impulse J (N s) at world point (x, y, z) */
  impulse(b: RBody, jx: number, jy: number, jz: number, x: number, y: number, z: number) {
    this.wake(b);
    b.v.x += jx * b.im; b.v.y += jy * b.im; b.v.z += jz * b.im;
    const rx = x - b.p.x, ry = y - b.p.y, rz = z - b.p.z;
    iInv(b, ry * jz - rz * jy, rz * jx - rx * jz, rx * jy - ry * jx, _t3);
    b.w.x += _t3[0]; b.w.y += _t3[1]; b.w.z += _t3[2];
  }

  /** everything within r of (x, y, z) is thrown outward */
  blast(x: number, y: number, z: number, r: number, power: number) {
    for (const b of this.bodies) {
      if (b.dead || b.kind === 'prop') continue;
      const dx = b.p.x - x, dy = b.p.y - y, dz = b.p.z - z, d = Math.hypot(dx, dy, dz);
      if (d > r) continue;
      const k = (1 - d / r) * power, l = d || 1;
      const sp = Math.min(14, k * 7 / (0.4 + b.m * 0.08));
      this.wake(b);
      b.v.x += dx / l * sp; b.v.y += Math.abs(dy / l) * sp * 0.5 + sp * 0.5; b.v.z += dz / l * sp;
      b.w.x += (Math.random() - 0.5) * sp * 4; b.w.z += (Math.random() - 0.5) * sp * 4;
    }
  }

  near(x: number, z: number, r: number, out: RBody[] = []): RBody[] {
    out.length = 0;
    for (const b of this.bodies) if (!b.dead && Math.abs(b.p.x - x) < r + b.h.length() && Math.abs(b.p.z - z) < r + b.h.length()) out.push(b);
    return out;
  }

  get awakeCount() { let n = 0; for (const b of this.bodies) if (b.awake && !b.dead) n++; return n; }

  // ---------------------------------------------------------------- stepping
  update(dt: number) {
    const z = this.zone;
    this.sndBudget = Math.min(14, this.sndBudget + dt * 18);
    if (!z || !this.bodies.length) { for (const p of this.pools.values()) p.flush(); return; }
    this.acc = Math.min(this.acc + Math.min(dt, 0.1), DT * 3);
    let steps = 0;
    while (this.acc >= DT && steps < 3) { this.step(z); this.acc -= DT; steps++; }
    this.housekeep(dt);
    for (const bt of this.batches) bt.pose();
    for (const b of this.bodies) if (b.pool && b.inst !== undefined && b.inst >= 0 && b.dirty) { b.pool.set(b.inst, b); b.dirty = false; }
    for (const p of this.pools.values()) p.flush();
  }

  private housekeep(dt: number) {
    const [maxAwake, maxAlive] = RigidWorld.BUDGET[this.quality] ?? RigidWorld.BUDGET[1];
    let awake = 0, alive = 0;
    for (const b of this.bodies) {
      if (b.dead) continue;
      b.age += dt;
      if (b.kind !== 'prop' && !b.fading) { alive++; if (b.awake) awake++; }
      if (!b.awake && !b.fading && b.kind !== 'prop') { b.slept += dt; if (b.slept > b.life) b.fading = true; }
      if (b.fading) { b.fade -= dt / 0.9; b.dirty = true; if (b.fade <= 0) { b.fade = 0; this.remove(b); } }
      // fell out of the world
      if (b.p.y < -6) this.remove(b);
    }
    // over budget: the oldest awake chunks settle where they are, the oldest resting ones fade
    if (awake > maxAwake || alive > maxAlive) {
      const list = this.bodies.filter((b) => !b.dead && b.kind !== 'prop').sort((a, b) => b.age - a.age);
      for (const b of list) {
        if (awake <= maxAwake) break;
        if (b.awake && !b.fading && b.age > 0.8) { b.awake = false; b.v.set(0, 0, 0); b.w.set(0, 0, 0); b.dirty = true; awake--; }
      }
      for (const b of list) {
        if (alive <= maxAlive) break;
        if (!b.fading) { b.fading = true; b.fade = Math.min(b.fade, 0.6); alive--; }
      }
    }
    // compact
    if (this.bodies.length > 64 && this.bodies.some((b) => b.dead)) this.bodies = this.bodies.filter((b) => !b.dead);
    for (let i = this.batches.length - 1; i >= 0; i--) {
      const bt = this.batches[i];
      if (bt.live <= 0) { bt.pose(); this.root.remove(bt.mesh); bt.dispose(); this.batches.splice(i, 1); }
    }
  }

  private contact(): Contact {
    const c = this.cpool.pop() ?? ({} as Contact);
    this.contacts.push(c);
    return c;
  }

  private addContact(a: RBody, b: RBody | null, nx: number, ny: number, nz: number, px: number, py: number, pz: number, d: number, bStatic = false) {
    const c = this.contact();
    c.a = a; c.b = b; c.nx = nx; c.ny = ny; c.nz = nz; c.px = px; c.py = py; c.pz = pz; c.d = d; c.jn = 0; c.jt = 0; c.bStatic = bStatic;
  }

  private step(z: Zone) {
    this.time += DT;
    // movers (feet of the walkers): a kinematic sphere that shoves rubble aside
    for (const mv of this.movers) for (const b of this.bodies) {
      if (b.dead || b.kind === 'prop') continue;
      if (Math.abs(b.p.x - mv.x) > 0.6 || Math.abs(b.p.z - mv.z) > 0.6 || b.p.y > mv.y + 0.6) continue;
      this.moverHit(b, mv);
    }
    const act: RBody[] = [];
    for (const b of this.bodies) {
      if (b.dead || !b.awake) continue;
      // guards: nothing in here moves faster than a thrown brick, nothing goes NaN
      if (!Number.isFinite(b.p.x + b.p.y + b.p.z + b.v.x + b.v.y + b.v.z + b.w.x + b.w.y + b.w.z + b.q.w)) { this.remove(b); continue; }
      const vl = b.v.length(); if (vl > 24) b.v.multiplyScalar(24 / vl);
      const wl = b.w.length(); if (wl > 45) b.w.multiplyScalar(45 / wl);
      b.v.y -= GRAV * DT;
      // air drag, a little spin damping
      const ld = b.air > 2 ? 0.999 : 0.995;
      b.v.x *= ld; b.v.z *= ld;
      b.w.multiplyScalar(b.air > 2 ? 0.998 : 0.96);
      rot(b);
      act.push(b);
    }
    if (!act.length) return;
    for (const c of this.contacts) this.cpool.push(c);
    this.contacts.length = 0;
    // world contacts
    for (const b of act) this.worldContacts(z, b);
    // body pairs (spatial hash on 0.5 m cells)
    this.hash.clear();
    for (const b of this.bodies) {
      if (b.dead || b.solo) continue;
      const k = ((Math.floor(b.p.x * 2) & 0xffff) << 16) | (Math.floor(b.p.z * 2) & 0xffff);
      let l = this.hash.get(k); if (!l) this.hash.set(k, l = []);
      l.push(b);
    }
    for (const a of act) {
      if (a.solo) continue;
      const cx = Math.floor(a.p.x * 2), cz = Math.floor(a.p.z * 2), rr = Math.ceil(a.h.length() * 2) + 1;
      for (let i = -rr; i <= rr; i++) for (let j = -rr; j <= rr; j++) {
        const l = this.hash.get((((cx + i) & 0xffff) << 16) | ((cz + j) & 0xffff)); if (!l) continue;
        for (const b of l) {
          if (b === a) continue;
          // each awake pair once
          if (b.awake && b.id < a.id) continue;
          if (a.group && a.group === b.group && this.time < a.groupUntil) continue;
          const dx = b.p.x - a.p.x, dy = b.p.y - a.p.y, dz = b.p.z - a.p.z, R = a.h.length() + b.h.length();
          if (dx * dx + dy * dy + dz * dz > R * R) continue;
          if (!b.awake) rot(b);
          this.pair(a, b);
        }
      }
    }
    // precompute
    const ra = [0, 0, 0], rb = [0, 0, 0];
    for (const c of this.contacts) {
      const a = c.a, b = c.b;
      const bs = !b || c.bStatic || !b.awake;
      c.bStatic = bs;
      const rax = c.px - a.p.x, ray = c.py - a.p.y, raz = c.pz - a.p.z;
      iInv(a, ray * c.nz - raz * c.ny, raz * c.nx - rax * c.nz, rax * c.ny - ray * c.nx, ra);
      let kn = a.im + c.nx * (ra[1] * raz - ra[2] * ray) + c.ny * (ra[2] * rax - ra[0] * raz) + c.nz * (ra[0] * ray - ra[1] * rax);
      if (b && !bs) {
        const rbx = c.px - b.p.x, rby = c.py - b.p.y, rbz = c.pz - b.p.z;
        iInv(b, rby * c.nz - rbz * c.ny, rbz * c.nx - rbx * c.nz, rbx * c.ny - rby * c.nx, rb);
        kn += b.im + c.nx * (rb[1] * rbz - rb[2] * rby) + c.ny * (rb[2] * rbx - rb[0] * rbz) + c.nz * (rb[0] * rby - rb[1] * rbx);
      }
      c.kn = kn > 1e-9 ? 1 / kn : 0;
      const vn = this.relN(c);
      const e = b ? Math.max(a.e, b.e) : a.e;
      c.bias = vn < -1.1 ? -e * vn : 0;
      // impacts: sound, wake what it hit
      if (vn < -1.2) {
        if (b && !b.awake && -vn > 0.8) { this.wake(b); }
        if (a.onImpact && this.time - a.lastSnd > 0.14 && this.sndBudget >= 1) { a.lastSnd = this.time; this.sndBudget -= 1; a.onImpact(a, -vn, c.px, c.py, c.pz, b); }
      }
      if (c.ny > 0.6) a.air = 0;
    }
    // solve
    for (let it = 0; it < ITER; it++) for (const c of this.contacts) {
      const a = c.a, b = c.bStatic ? null : c.b;
      const vn = this.relN(c);
      let j = (c.bias - vn) * c.kn;
      const old = c.jn; c.jn = Math.max(0, old + j); j = c.jn - old;
      if (j !== 0) this.apply(c, a, b, c.nx * j, c.ny * j, c.nz * j);
      // friction along the sliding direction
      const vt = this.relT(c);
      if (vt.l > 1e-5) {
        const mu = b ? Math.sqrt(a.mu * b.mu) : a.mu;
        const tx = vt.x / vt.l, ty = vt.y / vt.l, tz = vt.z / vt.l;
        // effective mass along the tangent (approximate with the normal one: same order, much cheaper)
        let jt = -vt.l * c.kn;
        const lim = mu * c.jn;
        const oldT = c.jt; c.jt = Math.max(-lim, Math.min(lim, oldT + jt)); jt = c.jt - oldT;
        if (jt !== 0) this.apply(c, a, b, tx * jt, ty * jt, tz * jt);
      }
    }
    // integrate
    for (const b of act) {
      b.p.x += b.v.x * DT; b.p.y += b.v.y * DT; b.p.z += b.v.z * DT;
      const hx = b.w.x * DT * 0.5, hy = b.w.y * DT * 0.5, hz = b.w.z * DT * 0.5, q = b.q;
      const x = q.x, y = q.y, zz = q.z, w = q.w;
      q.x = x + (hx * w + hy * zz - hz * y); q.y = y + (hy * w + hz * x - hx * zz); q.z = zz + (hz * w + hx * y - hy * x); q.w = w + (-hx * x - hy * y - hz * zz);
      q.normalize();
      b.dirty = true;
      b.air++;
    }
    // split position correction (no energy added)
    for (const c of this.contacts) {
      const corr = Math.max(0, c.d - SLOP) * 0.55;
      if (corr <= 0) continue;
      const a = c.a, b = c.bStatic ? null : c.b;
      const wa = a.im, wb = b ? b.im : 0, s = corr / (wa + wb);
      a.p.x += c.nx * s * wa; a.p.y += c.ny * s * wa; a.p.z += c.nz * s * wa;
      if (b) { b.p.x -= c.nx * s * wb; b.p.y -= c.ny * s * wb; b.p.z -= c.nz * s * wb; b.dirty = true; }
    }
    // sleep
    for (const b of act) {
      const lv = b.v.lengthSq(), av = b.w.lengthSq();
      // resting contact: bleed the last creep (keeps piles from crawling)
      if (b.air < 2 && lv < 0.04 && av < 0.3) { b.v.multiplyScalar(0.9); b.w.multiplyScalar(0.88); }
      if (lv < 0.0036 && av < 0.05 && b.air < 3) {
        b.still += DT;
        if (b.still > (b.kind === 'prop' ? 0.45 : 0.35)) { b.awake = false; b.v.set(0, 0, 0); b.w.set(0, 0, 0); b.slept = 0; b.dirty = true; }
      } else b.still = 0;
    }
  }

  private relN(c: Contact): number {
    const a = c.a, b = c.bStatic ? null : c.b;
    const rx = c.px - a.p.x, ry = c.py - a.p.y, rz = c.pz - a.p.z;
    let vx = a.v.x + a.w.y * rz - a.w.z * ry, vy = a.v.y + a.w.z * rx - a.w.x * rz, vz = a.v.z + a.w.x * ry - a.w.y * rx;
    if (b) {
      const sx = c.px - b.p.x, sy = c.py - b.p.y, sz = c.pz - b.p.z;
      vx -= b.v.x + b.w.y * sz - b.w.z * sy; vy -= b.v.y + b.w.z * sx - b.w.x * sz; vz -= b.v.z + b.w.x * sy - b.w.y * sx;
    }
    return vx * c.nx + vy * c.ny + vz * c.nz;
  }
  private _vt = { x: 0, y: 0, z: 0, l: 0 };
  private relT(c: Contact) {
    const a = c.a, b = c.bStatic ? null : c.b;
    const rx = c.px - a.p.x, ry = c.py - a.p.y, rz = c.pz - a.p.z;
    let vx = a.v.x + a.w.y * rz - a.w.z * ry, vy = a.v.y + a.w.z * rx - a.w.x * rz, vz = a.v.z + a.w.x * ry - a.w.y * rx;
    if (b) {
      const sx = c.px - b.p.x, sy = c.py - b.p.y, sz = c.pz - b.p.z;
      vx -= b.v.x + b.w.y * sz - b.w.z * sy; vy -= b.v.y + b.w.z * sx - b.w.x * sz; vz -= b.v.z + b.w.x * sy - b.w.y * sx;
    }
    const vn = vx * c.nx + vy * c.ny + vz * c.nz;
    const t = this._vt;
    t.x = vx - vn * c.nx; t.y = vy - vn * c.ny; t.z = vz - vn * c.nz; t.l = Math.hypot(t.x, t.y, t.z);
    return t;
  }
  private apply(c: Contact, a: RBody, b: RBody | null, jx: number, jy: number, jz: number) {
    a.v.x += jx * a.im; a.v.y += jy * a.im; a.v.z += jz * a.im;
    let rx = c.px - a.p.x, ry = c.py - a.p.y, rz = c.pz - a.p.z;
    iInv(a, ry * jz - rz * jy, rz * jx - rx * jz, rx * jy - ry * jx, _t3);
    a.w.x += _t3[0]; a.w.y += _t3[1]; a.w.z += _t3[2];
    if (b) {
      b.v.x -= jx * b.im; b.v.y -= jy * b.im; b.v.z -= jz * b.im;
      rx = c.px - b.p.x; ry = c.py - b.p.y; rz = c.pz - b.p.z;
      iInv(b, ry * jz - rz * jy, rz * jx - rx * jz, rx * jy - ry * jx, _t3);
      b.w.x -= _t3[0]; b.w.y -= _t3[1]; b.w.z -= _t3[2];
    }
  }

  // ---------------------------------------------------------------- narrow phase
  private corners(b: RBody, out: number[]) {
    const R = b.R, h = b.h;
    let k = 0;
    for (let i = -1; i <= 1; i += 2) for (let j = -1; j <= 1; j += 2) for (let l = -1; l <= 1; l += 2) {
      const x = h.x * i, y = h.y * j, z = h.z * l;
      out[k++] = b.p.x + R[0] * x + R[1] * y + R[2] * z;
      out[k++] = b.p.y + R[3] * x + R[4] * y + R[5] * z;
      out[k++] = b.p.z + R[6] * x + R[7] * y + R[8] * z;
    }
  }
  private _ca = new Array(24).fill(0);
  private _cb = new Array(24).fill(0);

  private blocked(z: Zone, tx: number, ty: number, dx: number, dy: number): boolean {
    if (z.edgeBlocks(tx, ty, dx, dy, 'walk')) return true;
    const nx = tx + dx, ny = ty + dy;
    return !z.inb(nx, ny) || !z.floor[z.idx(nx, ny)];
  }

  private worldContacts(z: Zone, b: RBody) {
    const C = this._ca;
    this.corners(b, C);
    const tx = Math.floor(b.p.x), ty = Math.floor(b.p.z);
    const inb = z.inb(tx, ty) && !!z.floor[z.idx(tx, ty)];
    const bW = !inb || this.blocked(z, tx, ty, -1, 0), bE = !inb || this.blocked(z, tx, ty, 1, 0);
    const bN = !inb || this.blocked(z, tx, ty, 0, -1), bS = !inb || this.blocked(z, tx, ty, 0, 1);
    for (let k = 0; k < 24; k += 3) {
      const x = C[k], y = C[k + 1], zz = C[k + 2];
      const cx = Math.floor(x), cz = Math.floor(zz);
      // floor (and the tops of furniture under it)
      let fl = -50;
      if (z.inb(cx, cz)) {
        const i = z.idx(cx, cz);
        if (z.floor[i]) fl = z.heightAt(cx, cz);
        if (z.solid[i]) fl = Math.max(fl, this.furniture(z, b, cx, cz, x, y, zz, fl));
      }
      if (y < fl) this.addContact(b, null, 0, 1, 0, x, y, zz, fl - y);
      if (!inb) continue;
      // walls of the tile the body is in
      if (bW && x < tx + WALL_T) this.addContact(b, null, 1, 0, 0, x, y, zz, tx + WALL_T - x);
      if (bE && x > tx + 1 - WALL_T) this.addContact(b, null, -1, 0, 0, x, y, zz, x - (tx + 1 - WALL_T));
      if (bN && zz < ty + WALL_T) this.addContact(b, null, 0, 0, 1, x, y, zz, ty + WALL_T - zz);
      if (bS && zz > ty + 1 - WALL_T) this.addContact(b, null, 0, 0, -1, x, y, zz, zz - (ty + 1 - WALL_T));
    }
  }

  /** furniture on a solid tile: its top (returned, as a floor) or a side push */
  private furniture(z: Zone, b: RBody, cx: number, cz: number, x: number, y: number, zz: number, fl: number): number {
    let top = -50;
    for (const o of z.objectsAt(cx, cz)) {
      if (o.state?.held) continue;
      const d = objDef(o.key); if (!d || (d.block ?? 'solid') === 'none' || d.ceiling || d.onWall) continue;
      const f = objFootprint(z, o, d);
      if (x < f.x0 || x > f.x1 || zz < f.z0 || zz > f.z1) continue;
      const t = fl + Math.min(2.4, d.height);
      if (y >= t) continue;
      // coming from above (centre over the top): stand on it
      if (b.p.y > t - 0.04 || t - y < 0.06) { top = Math.max(top, t); continue; }
      // a side: out the nearest face
      const pl = x - f.x0, pr = f.x1 - x, pn = zz - f.z0, ps = f.z1 - zz;
      const mn = Math.min(pl, pr, pn, ps);
      if (mn > 0.3) continue;
      if (mn === pl) this.addContact(b, null, -1, 0, 0, x, y, zz, pl);
      else if (mn === pr) this.addContact(b, null, 1, 0, 0, x, y, zz, pr);
      else if (mn === pn) this.addContact(b, null, 0, 0, -1, x, y, zz, pn);
      else this.addContact(b, null, 0, 0, 1, x, y, zz, ps);
    }
    return top;
  }

  /** corners of each box inside the other */
  private pair(a: RBody, b: RBody) {
    this.cornersIn(a, b, this._ca, false);
    this.cornersIn(b, a, this._cb, true);
  }
  /** corners of `p` inside `box`: contacts on `a` (= p unless swapped) */
  private cornersIn(p: RBody, box: RBody, C: number[], swap: boolean) {
    this.corners(p, C);
    const R = box.R, h = box.h;
    let n = 0;
    for (let k = 0; k < 24; k += 3) {
      const dx = C[k] - box.p.x, dy = C[k + 1] - box.p.y, dz = C[k + 2] - box.p.z;
      const lx = R[0] * dx + R[3] * dy + R[6] * dz, ly = R[1] * dx + R[4] * dy + R[7] * dz, lz = R[2] * dx + R[5] * dy + R[8] * dz;
      const px = h.x - Math.abs(lx), py = h.y - Math.abs(ly), pz = h.z - Math.abs(lz);
      if (px <= 0 || py <= 0 || pz <= 0) continue;
      // out the face of least penetration (normal from box to the corner's body)
      let nx: number, ny: number, nz: number, d: number;
      if (px < py && px < pz) { const s = lx > 0 ? 1 : -1; nx = R[0] * s; ny = R[3] * s; nz = R[6] * s; d = px; }
      else if (py < pz) { const s = ly > 0 ? 1 : -1; nx = R[1] * s; ny = R[4] * s; nz = R[7] * s; d = py; }
      else { const s = lz > 0 ? 1 : -1; nx = R[2] * s; ny = R[5] * s; nz = R[8] * s; d = pz; }
      if (swap) this.addContact(box, p, -nx, -ny, -nz, C[k], C[k + 1], C[k + 2], d, !p.awake);
      else this.addContact(p, box, nx, ny, nz, C[k], C[k + 1], C[k + 2], d, !box.awake);
      if (++n >= 4) break;
    }
  }

  /** a walker's foot through rubble: pushed aside, a little kick */
  private moverHit(b: RBody, mv: RigidWorld['movers'][number]) {
    const dx = b.p.x - mv.x, dz = b.p.z - mv.z, d = Math.hypot(dx, dz), r = mv.r + Math.max(b.h.x, b.h.z) * 0.7;
    if (d > r || d < 1e-4) return;
    const sp = Math.hypot(mv.vx, mv.vz);
    if (sp < 0.4 && !b.awake) return;
    const nx = dx / d, nz = dz / d;
    const share = mv.kg / (mv.kg + b.m);
    this.wake(b);
    b.p.x += nx * (r - d) * share; b.p.z += nz * (r - d) * share;
    const along = Math.max(0, mv.vx * nx + mv.vz * nz);
    const cur = b.v.x * nx + b.v.z * nz;
    if (cur < along * share * 1.3) {
      const dv = along * share * 1.3 - cur;
      b.v.x += nx * dv; b.v.z += nz * dv; b.v.y += dv * 0.25;
      b.w.x += nz * dv * 6; b.w.z -= nx * dv * 6;
    }
    b.dirty = true;
  }
}
