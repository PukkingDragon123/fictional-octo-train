// Shared kit for the damp-level inhabitants (round 15: the Fungus Mind and its
// network, Spore Rats, the Bacteria Mass, Land Jellyfish, the Whale Corpse and
// Sea Worms):
//  - mkBones(): absolute joint list -> kit BoneSpec[] (relative offsets)
//  - skBlob(): a skinned, displaced ellipsoid (brain lobes, puffballs, bells)
//  - painters for mycelium felt, gills, caps and slime
//  - spore clouds: drifting puffs every peer draws from a creature fx, and
//    what they do to a unit standing in them (lucidity, coughing, wind)
//  - pin(): keep a rooted thing rooted when a blow knocks it
import * as THREE from 'three';
import { G } from '../../game/G';
import { bus } from '../../core/events';
import { worldMaterial } from '../../gfx/materials';
import { ModelBuilder } from '../../gfx/modelBuilder';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { ph } from '../../gfx/pixel';
import type { Creature } from '../creature';
import type { Player } from '../../entities/player';
import { SkinB, Region, V3, Wt, BoneSpec, usFor, hash, type KitRig } from './humanoids';

// =====================================================================================
// skeleton + geometry helpers
// =====================================================================================
/** [name, parent, absolute model-space joint, cap?] rows -> kit bones (parents before children) */
export function mkBones(A: [string, string, V3, boolean?][]): BoneSpec[] {
  const abs = new Map<string, V3>();
  return A.map(([name, parent, p, cap]) => {
    abs.set(name, p);
    const q = parent ? abs.get(parent)! : [0, 0, 0];
    return { name, parent, at: [p[0] - q[0], p[1] - q[1], p[2] - q[2]], cap };
  });
}

export interface BlobOpt {
  n?: number; rings?: number;
  /** skin weights for a point (or one set for all) */
  w: Wt | ((p: V3) => Wt);
  /** radial displacement around 1 for a unit direction */
  bump?: (d: V3) => number;
  /** latitude range 0 (bottom pole) .. 1 (top pole); open ends are left open */
  vr?: [number, number];
  emis?: number;
}
/** a skinned, displaced ellipsoid (lofted rings, poles closed) */
export function skBlob(B: SkinB, reg: Region, g: number, c: V3, r: V3, o: BlobOpt) {
  const n = o.n ?? 12, rings = o.rings ?? 8;
  const [v0, v1] = o.vr ?? [0, 1];
  const P = (lat: number, lon: number): V3 => {
    const d: V3 = [Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)];
    const k = 1 + (o.bump ? o.bump(d) : 0);
    return [c[0] + d[0] * r[0] * k, c[1] + d[1] * r[1] * k, c[2] + d[2] * r[2] * k];
  };
  const W = (p: V3): Wt => (typeof o.w === 'function' ? o.w(p) : o.w);
  const lat0 = -Math.PI / 2 + Math.PI * v0, lat1 = -Math.PI / 2 + Math.PI * v1;
  const rr: { pts: V3[]; v: number; w: (p: V3) => Wt }[] = [];
  for (let i = 0; i <= rings; i++) {
    const lat = lat0 + ((lat1 - lat0) * i) / rings;
    if (Math.PI / 2 - Math.abs(lat) < 1e-3) continue;
    const pts: V3[] = [];
    for (let j = 0; j <= n; j++) pts.push(P(lat, -Math.PI + (Math.PI * 2 * (j % n)) / n));
    rr.push({ pts, v: i / rings, w: W });
  }
  const start = v0 <= 0 ? P(-Math.PI / 2, 0) : null, end = v1 >= 1 ? P(Math.PI / 2, 0) : null;
  return B.loft(rr, usFor(n), reg, g, { start, end, startW: start ? W(start) : undefined, endW: end ? W(end) : undefined, startV: 0, endV: 1, emis: o.emis ?? 0 });
}

/** cortex folds: ridged gyri over a unit direction (0 .. ~1) */
export function gyri(d: V3, k = 1, seed = 0): number {
  const a = Math.sin(d[0] * 9.1 * k + Math.sin(d[1] * 7.3 * k + seed) * 1.9 + seed);
  const b = Math.sin(d[2] * 8.3 * k + Math.sin(d[0] * 6.1 * k - seed) * 2.1);
  const c = Math.sin(d[1] * 10.7 * k + d[2] * 4 + seed * 2);
  return 1 - Math.abs(a * 0.55 + b * 0.35 + c * 0.25);
}

/** host: a rooted thing stays where it grew (blows knock creatures about) */
export function pin(c: Creature) { c.x = c.home.x; c.z = c.home.z; c.vx = 0; c.vz = 0; c.speed = 0; }

/**
 * A group between the rig's body and its root bone, for things that live on
 * walls and ceilings (or lie in odd ways): the species sets a full transform
 * on it every frame with setMount(). The creature manager rolls dead bodies
 * onto their side through rig.body; setMount() cancels that exactly, so the
 * species' own death pose is what shows. Call addMount() in the kit's decorate().
 */
export function addMount(rig: KitRig): THREE.Group {
  const mount = new THREE.Group();
  mount.name = 'mount'; mount.matrixAutoUpdate = false;
  rig.body.add(mount);
  mount.add(rig.parts.base);
  const i = rig.kit.idx.get('base');
  if (i !== undefined && rig.kit.cut) rig.kit.cut.parent0[i] = mount;
  rig.kit.m.mount = mount;
  return mount;
}
const _MM = new THREE.Matrix4(), _MI = new THREE.Matrix4();
export function setMount(rig: KitRig, c: Creature | null, W: THREE.Matrix4) {
  const mount = rig.kit.m.mount as THREE.Group | undefined;
  if (!mount) return;
  mount.matrix.copy(W);
  if (c && c.dead && rig.root.userData.creature === c) {
    const k = Math.min(1, Math.min(1, c.deathT * 2 + (c.deathT > 0 ? 0 : 1)) + 0.01);
    const th = (c.sp.flags?.flying ? 0 : Math.PI / 2) * k;
    const h = ((rig.root.userData.restY as number | undefined) ?? 0) * k;
    _MM.makeRotationZ(th).setPosition(0, h, 0);
    mount.matrix.premultiply(_MI.copy(_MM).invert());
  }
  mount.matrixWorldNeedsUpdate = true;
}

// =====================================================================================
// painting
// =====================================================================================
/** mycelium felt: a dark ground under a mat of fine white hyphae (random walks) */
export function paintMycelium(r: Region, R: number[], o: { seed?: number; density?: number; ground?: number; strand?: number; hi?: number } = {}) {
  const seed = o.seed ?? 11, g = o.ground ?? 1.2;
  r.fill(R, (x, y) => g + (r.fbm(x, y, 3, 2, seed) - 0.5) * 1.6, undefined, 0.6);
  const n = Math.floor(r.w * r.h * (o.density ?? 0.012));
  for (let i = 0; i < n; i++) r.crack(hash(i, seed) * r.w, hash(i + 7, seed) * r.h, 6 + Math.floor(hash(i + 3, seed) * 14), hash(i + 5, seed) * 360, o.strand ?? R[R.length - 2], seed * 7 + i, 0.55, 0.25, o.hi);
}
/** gills: fine radial lines under a cap (u around, v out from the stem) */
export function paintGills(r: Region, R: number[], seed = 3) {
  r.fill(R, (x, y) => 1.4 + ((x + (hash(x, seed) < 0.3 ? 1 : 0)) % 2 === 0 ? 1.2 : -0.4) + (y / r.h) * 1.1 + (hash(x, y + seed) - 0.5) * 0.6, undefined, 0.4);
}
/** a cap's top: lit crown, darker scaly rim, a few torn scales */
export function paintCapTop(r: Region, R: number[], o: { seed?: number; scales?: number; scale?: number; drip?: number } = {}) {
  const seed = o.seed ?? 5;
  r.fill(R, (x, y) => {
    const v = y / r.h; const th = (r.deg(x) * Math.PI) / 180;
    return R.length * 0.65 - v * 2.2 + 0.6 * Math.cos(th - 0.5) + (r.fbm(x, y, 3, 2, seed) - 0.5) * 1.3;
  }, undefined, 0.5);
  for (let i = 0; i < (o.scales ?? 10); i++) r.blob(hash(i, seed + 3) * r.w, hash(i + 2, seed + 3) * r.h * 0.8, 1 + hash(i, 4) * 1.5, 0.8 + hash(i, 9), o.scale ?? R[R.length - 1], 0.9);
  // ink caps dissolve from the rim: black drips
  if (o.drip) for (let x = 0; x < r.w; x++) { const l = Math.floor(hash(x, seed + 41) * r.h * o.drip); for (let y = r.h - 1; y > r.h - 1 - l; y--) r.set(x, y, R[0]); }
}
/** glossy slime: a wet ramp with bright specular flecks and darker pooled colonies */
export function paintSlime(r: Region, R: number[], o: { seed?: number; colonies?: number; colony?: number[]; flecks?: number } = {}) {
  const seed = o.seed ?? 9;
  r.fill(R, (x, y) => {
    const th = (r.deg(x) * Math.PI) / 180;
    return R.length * 0.5 + 0.9 * Math.cos(th) + (r.fbm(x, y, 4, 3, seed) - 0.5) * 2.2;
  }, undefined, 0.6);
  const cols = o.colony ?? [R[1], R[R.length - 2]];
  for (let i = 0; i < (o.colonies ?? 0); i++) {
    const cx = hash(i, seed + 13) * r.w, cy = hash(i + 4, seed + 13) * r.h, rr = 1.5 + hash(i, seed + 2) * 3.5;
    const c = cols[i % cols.length];
    r.ellipse(cx, cy, rr, rr * 0.9, c, 0.8);
    r.ellipse(cx, cy, rr * 0.55, rr * 0.5, R[R.length - 1], 0.35);
    r.ellipse(cx - rr * 0.3, cy - rr * 0.3, 0.8, 0.8, 0xffffff, 0.5);
  }
  for (let i = 0; i < (o.flecks ?? 14); i++) { const fx = hash(i, seed + 61) * r.w, fy = hash(i + 6, seed + 61) * r.h; r.blend(fx, fy, 0xffffff, 0.8); r.blend(fx + 1, fy, 0xffffff, 0.35); }
}

// =====================================================================================
// atlas textures for world-space growth (the fungal network's threads and mats)
// =====================================================================================
addTextureModule(() => {
  // a mycelium cord: braided pale hyphae over a violet-black core, wet glints
  atlas().add('fg_cord', 16, 16, (pc) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const s = Math.sin((x + y * 0.6) * 1.3) + Math.sin((x - y * 0.4) * 0.9 + 1.7);
      const n = ph(x, y, 731);
      let c = s > 1.1 ? 0xd8d4d8 : s > 0.4 ? 0x9a90a0 : s > -0.4 ? 0x4a3e52 : 0x1e1824;
      if (n < 0.06) c = 0xf0ecf0;
      else if (n > 0.95) c = 0x6a5a78;
      pc.set(x, y, c);
    }
  }, 0.3, 0.3);
  // a withered cord: grey-brown, flaking
  atlas().add('fg_cord_dead', 16, 16, (pc) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const s = Math.sin((x + y * 0.6) * 1.3) + Math.sin((x - y * 0.4) * 0.9 + 1.7);
      const n = ph(x, y, 733);
      pc.set(x, y, n < 0.1 ? 0x2a241e : s > 0.8 ? 0x8a7c68 : s > -0.3 ? 0x5a4e40 : 0x3a3228);
    }
  }, 0.3, 0.3);
  // a mycelium mat: radial felt fading out to loose threads, purple-black stains
  atlas().add('fg_mat', 32, 32, (pc) => {
    pc.wrap = false;
    pc.clear();
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const dx = x - 15.5, dy = y - 15.5, d = Math.hypot(dx, dy) / 16, a = Math.atan2(dy, dx);
      const ray = Math.abs(Math.sin(a * 9 + Math.sin(d * 7) * 1.3)) > 0.82 || Math.abs(Math.sin(a * 5 - d * 4)) > 0.9;
      const n = ph(x, y, 741);
      if (d > 1) continue;
      const fur = d < 0.55 ? 1 : ray && n < 1.25 - d ? 1 : 0;
      if (!fur && n > (1 - d) * 0.9) continue;
      const core = d < 0.25 ? 0x2a2030 : d < 0.45 ? 0x6a5e72 : 0xbab2be;
      pc.set(x, y, n < 0.08 ? 0xf2eef2 : ray ? 0xd6d0da : core, d > 0.8 ? 200 : 255);
    }
  }, 1.2, 1.2);
  // spore puffs: a soft dithered ball
  atlas().add('fg_spore', 8, 8, (pc) => { pc.wrap = false; pc.clear(); for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const d = Math.hypot(x - 3.5, y - 3.5) / 4; if (d < 1 && ph(x, y, 751) < 1.15 - d) pc.set(x, y, d < 0.4 ? 0xf0ecd0 : 0xc8c094); } }, 0.2, 0.2);
});

// =====================================================================================
// spore clouds
// =====================================================================================
interface Cloud { zk: string; x: number; z: number; y: number; r: number; k: number; t: number; dur: number; seed: number; col: number; hit: number }
const CLOUDS: Cloud[] = [];
const NP = 260;
let puffs: THREE.InstancedMesh | null = null, motes: THREE.InstancedMesh | null = null, sys = false, lastF = -1;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler();
const live = () => !!G && !!(G as any).players && !!(G as any).creatures;

/**
 * Burst a spore cloud here (local: every peer calls it from the same creature fx).
 * r: radius (m), k: potency 0..2, dur: seconds it hangs in the air, col: puff tint.
 */
export function sporeCloud(zk: string, x: number, z: number, o: { r?: number; k?: number; dur?: number; y?: number; col?: number } = {}) {
  if (!live()) return;
  CLOUDS.push({ zk, x, z, y: o.y ?? 0, r: o.r ?? 2.2, k: o.k ?? 1, t: 0, dur: o.dur ?? 7, seed: Math.random() * 1000, col: o.col ?? 0xc8c08e, hit: 0 });
  while (CLOUDS.length > 12) CLOUDS.shift();
  ensureSys();
}
/** is a point inside a live cloud (for AI that avoids its own spores) */
export function inSpores(zk: string, x: number, z: number): number {
  let k = 0;
  for (const c of CLOUDS) if (c.zk === zk && c.t < c.dur) { const d = Math.hypot(x - c.x, z - c.z); if (d < c.r * grow(c)) k = Math.max(k, c.k * (1 - d / (c.r * grow(c) + 0.01))); }
  return k;
}
const grow = (c: Cloud) => 0.35 + 0.65 * Math.min(1, c.t / 1.2);

function ensureSys() {
  if (sys || !(G as any).addSystem) return;
  sys = true;
  (G as any).addSystem({ name: 'sporeClouds', update: (dt: number) => stepClouds(dt) });
}
function ensureMeshes(): boolean {
  const root = (G as any).creatures?.root as THREE.Object3D | undefined;
  if (!root) return false;
  if (!puffs) {
    const mb = new ModelBuilder();
    mb.sphere(0, 0, 0, 1, 7, 5, 'fg_spore', { color: 0xffffff });
    puffs = new THREE.InstancedMesh(mb.build(), worldMaterial({ transparent: true, opacity: 0.34, depthWrite: false, outline: 0 } as any), NP);
    puffs.frustumCulled = false; puffs.castShadow = false; puffs.name = 'sporePuffs'; puffs.renderOrder = 3;
    const mm = new ModelBuilder();
    mm.sphere(0, 0, 0, 1, 4, 3, 'white', { color: 0xf8f0c0, emissive: 0.8 });
    motes = new THREE.InstancedMesh(mm.build(), worldMaterial({ additive: true, depthWrite: false, outline: 0, unlit: true, noGrid: true } as any), NP);
    motes.frustumCulled = false; motes.castShadow = false; motes.name = 'sporeMotes'; motes.renderOrder = 3;
  }
  if (puffs.parent !== root) { root.add(puffs); root.add(motes!); }
  return true;
}
function stepClouds(dt: number) {
  if (!live() || lastF === G.time) return;
  lastF = G.time;
  const p = G.local as Player | undefined;
  for (let i = CLOUDS.length - 1; i >= 0; i--) { CLOUDS[i].t += dt; if (CLOUDS[i].t > CLOUDS[i].dur + 2.5) CLOUDS.splice(i, 1); }
  if (!ensureMeshes()) return;
  let n = 0, nm = 0;
  for (const c of CLOUDS) {
    if (!p || c.zk !== p.zoneKey) continue;
    const g = grow(c), fade = c.t < c.dur ? 1 : Math.max(0, 1 - (c.t - c.dur) / 2.5);
    const per = Math.round(10 + 14 * Math.min(1.5, c.k) * Math.min(1.6, c.r / 2));
    for (let i = 0; i < per && n < NP; i++) {
      const a = hash(i, c.seed) * Math.PI * 2 + c.t * 0.12 * (hash(i, c.seed + 2) - 0.5);
      const d = c.r * g * Math.sqrt(hash(i + 3, c.seed)) * 0.85;
      const y = c.y + 0.2 + hash(i + 5, c.seed) * 1.5 * g + c.t * 0.05;
      _p.set(c.x + Math.cos(a) * d + Math.sin(c.t * 0.5 + i) * 0.12, y, c.z + Math.sin(a) * d + Math.cos(c.t * 0.4 + i * 1.3) * 0.12);
      const s = (0.18 + hash(i + 9, c.seed) * 0.32) * (0.6 + 0.4 * g) * fade * Math.min(1, c.t * 4);
      _e.set(c.t * 0.2 + i, i, 0); _q.setFromEuler(_e); _s.set(s, s * 0.8, s);
      _m.compose(_p, _q, _s); puffs!.setMatrixAt(n++, _m);
      if (nm < NP && i % 2 === 0) {
        const sm = 0.012 + hash(i + 11, c.seed) * 0.012;
        _p.y += Math.sin(c.t * 2 + i) * 0.1; _p.x += Math.cos(c.t * 1.3 + i) * 0.2;
        _s.setScalar(sm * fade); _m.compose(_p, _q, _s); motes!.setMatrixAt(nm++, _m);
      }
    }
    if (c.t < c.dur) exposeLocal(p, c, dt);
  }
  _m.makeScale(0, 0, 0);
  for (let i = n; i < puffs!.count; i++) puffs!.setMatrixAt(i, _m);
  for (let i = nm; i < motes!.count; i++) motes!.setMatrixAt(i, _m);
  puffs!.count = Math.max(1, n); motes!.count = Math.max(1, nm);
  puffs!.instanceMatrix.needsUpdate = true; motes!.instanceMatrix.needsUpdate = true;
}

const coughAt = new Map<string, number>();
const LINES = ['Spores. In my mouth. I can taste them.', 'It is like breathing flour. Wet flour. Dead flour.', 'My throat is closing. Get OUT of it.', 'Everything is going soft at the edges. The spores. It is the spores.'];
/** what standing in a cloud does to the local unit */
function exposeLocal(p: Player, c: Cloud, dt: number) {
  if (p.body.dead) return;
  const d = Math.hypot(p.x - c.x, p.z - c.z), R = c.r * grow(c);
  if (d > R) return;
  const worn = [...((p as any).worn?.values?.() ?? [])].map((w: any) => w.key);
  const mask = worn.includes('gas_mask') || worn.includes('hazmat_suit') ? 0.15 : 1;
  const k = c.k * (1 - (d / R) * 0.6) * mask;
  const b = p.body as any;
  b.lucidity = Math.max(0, b.lucidity - dt * 2.4 * k);
  b.panic = Math.min(100, b.panic + dt * 3 * k);
  b.endurance = Math.max(0, b.endurance - dt * 0.035 * k);
  b.sickness = Math.min(100, (b.sickness ?? 0) + dt * 0.25 * k);
  const fx = (G as any).pr?.fx;
  if (fx) { fx.desat = Math.max(fx.desat ?? 0, 0.35 * Math.min(1, k)); fx.wobble = Math.max(fx.wobble ?? 0, 0.25 * Math.min(1, k)); }
  c.hit += dt;
  const last = coughAt.get(p.id) ?? -99;
  if (mask > 0.5 && G.time - last > 1.5 - Math.min(0.7, k * 0.4)) {
    coughAt.set(p.id, G.time);
    G.audio?.flat?.('cough', 'voice', 0.55, 0.85 + Math.random() * 0.3);
    bus.emit('cough', p, false);
    (G as any).camera?.shake?.(0.12, 0.25, 0.6);
    if (c.hit < 1.2 || Math.random() < 0.15) bus.emit('think', p, LINES[Math.floor(Math.random() * LINES.length)]);
  }
}
