import * as THREE from 'three';
import { def, Rig } from '../species';
import { atlas } from '../../gfx/atlas';
import { addTextureModule } from '../../gfx/textures/index';
import { makeRamp, ph } from '../../gfx/pixel';
import { worldMaterial } from '../../gfx/materials';
import { hash3, tileFbm } from '../../core/rng';
import { floorDef } from '../../world/defs';
import { bus } from '../../core/events';
import { G } from '../../game/G';
import type { Creature } from '../creature';
import type { Player } from '../../entities/player';
import {
  CS, zoneOf, pulse, attack, playersIn, stop, dist, faceTo, isCarpet, instFlags, sfx, galleryPose, onPlayerHit, HeldAction, heardMargin, suppressSighting,
} from '../behaviors_a';
import { SkinKit, KRig, tube, blob, spike, surf as surf_, damp, clamp01, smooth01, atkCurve, flinchOf, isLost, ik2, V3 } from '../kit/anomalies';
import { veins } from '../kit/anomalyTextures';
import '../kit/anomalyTextures';

// =====================================================================================
// UNDERLAY — something living under the carpet. No body you can see: the carpet
// itself bulges, folds around the bulge and drags in toward it, and a ripple
// runs ahead of it and trails behind as it travels. It lunges up, the pile
// splits, and a long grey arm with far too many joints whips out at ankle
// height, grabs, thrashes and pulls back under. It only knows you by your feet.
//
// The carpet is a patch of the real floor (same tiles, variants and rotations,
// world-aligned so the pattern stays put while the bulge moves under it);
// the arm is a skinned mesh.
// =====================================================================================

addTextureModule(() => {
  const A = atlas();
  // the split in the pile: frayed dark fibres, a wet grey back glimpsed in the gap
  A.add('c_underlay_tear', 32, 16, (pc) => {
    pc.wrap = false;
    pc.clear();
    const S = makeRamp(0x6a6c66, 5, { hueShift: -0.04 });
    for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) {
      const e = Math.hypot((x - 15.5) / 16, (y - 7.5) / 8);
      const ragged = 0.8 + ph(x, y >> 1, 3) * 0.18 + Math.sin(x * 1.7) * 0.05;
      if (e > ragged) continue; // transparent: the real carpet shows
      if (e > ragged - 0.14) pc.set(x, y, ph(x, y, 4) < 0.5 ? 0x2a2014 : 0x3a2c1a); // shadowed fibres at the lip
      else if (e > 0.55) pc.set(x, y, 0x0c0806);
      else pc.set(x, y, S[Math.min(4, Math.max(0, Math.round(1 + tileFbm(x, y, 32, 16, 3, 2, 5) * 2.5 - e * 2.5)))]);
    }
    for (let x = 9; x < 23; x += 2) pc.set(x, Math.round(7.5 + Math.sin(x * 0.8) * 1.5), 0x9a9a92); // a wet ridge of spine in the gap
  });
});

// ---------------------------------------------------------------- the carpet patch
const TILES = 4, SUB = 6, VT = (SUB + 1) * (SUB + 1);
const FLOOR_MAT = () => worldMaterial({ outline: 0 });
interface TileInfo { tex: string; rot: number; h: number }
type FloorSampler = (tx: number, ty: number) => TileInfo | null;

class CarpetPatch {
  readonly mesh: THREE.Mesh;
  private P: Float32Array; private N: Float32Array; private UV: Float32Array; private A: Float32Array; private C: Float32Array;
  private geo: THREE.BufferGeometry;
  private key = '';
  ox = 0; oz = 0;
  private live: boolean[] = [];
  private fh: number[] = [];

  constructor() {
    const nv = TILES * TILES * VT;
    this.P = new Float32Array(nv * 3); this.N = new Float32Array(nv * 3); this.UV = new Float32Array(nv * 2); this.A = new Float32Array(nv * 4);
    const C = this.C = new Float32Array(nv * 3).fill(1), F = new Float32Array(nv * 2);
    const I: number[] = [];
    for (let t = 0; t < TILES * TILES; t++) for (let j = 0; j < SUB; j++) for (let i = 0; i < SUB; i++) {
      const a = t * VT + j * (SUB + 1) + i, b = a + 1, c = a + SUB + 2, d = a + SUB + 1;
      // +x along i, +z along j: (a, d, c) and (a, c, b) face up
      I.push(a, d, c, a, c, b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.P, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(this.N, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(this.UV, 2));
    g.setAttribute('color', new THREE.BufferAttribute(C, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAtlas', new THREE.BufferAttribute(this.A, 4));
    g.setAttribute('aFx', new THREE.BufferAttribute(F, 2));
    g.setIndex(I);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(TILES / 2, 0.3, TILES / 2), TILES);
    this.geo = g;
    this.mesh = new THREE.Mesh(g, FLOOR_MAT());
    this.mesh.name = 'carpet';
    this.mesh.matrixAutoUpdate = false;
    this.mesh.receiveShadow = true;
    // never measured or cloned by gore
    (this.mesh as any).clone = () => new THREE.Group();
  }

  /** (re)texture the patch for the tiles starting at (ox, oz) */
  setTiles(ox: number, oz: number, sample: FloorSampler, key: string) {
    const k = key + ':' + ox + ',' + oz;
    if (k === this.key) return;
    this.key = k; this.ox = ox; this.oz = oz;
    const at = atlas();
    for (let ty = 0; ty < TILES; ty++) for (let tx = 0; tx < TILES; tx++) {
      const t = ty * TILES + tx;
      const info = sample(ox + tx, oz + ty);
      this.live[t] = !!info;
      this.fh[t] = info?.h ?? 0;
      if (!info) continue;
      const r = at.get(info.tex);
      // chunk mesher corners (x,y+1) (x+1,y+1) (x+1,y) (x,y) get these uvs, rotated per tile
      let L = [[0, 0], [1, 0], [1, 1], [0, 1]];
      for (let q = 0; q < info.rot; q++) L = [L[1], L[2], L[3], L[0]];
      for (let j = 0; j <= SUB; j++) for (let i = 0; i <= SUB; i++) {
        const fx = i / SUB, fy = j / SUB, v = t * VT + j * (SUB + 1) + i;
        const w0 = (1 - fx) * fy, w1 = fx * fy, w2 = fx * (1 - fy), w3 = (1 - fx) * (1 - fy);
        this.UV[v * 2] = L[0][0] * w0 + L[1][0] * w1 + L[2][0] * w2 + L[3][0] * w3;
        this.UV[v * 2 + 1] = L[0][1] * w0 + L[1][1] * w1 + L[2][1] * w2 + L[3][1] * w3;
        this.A[v * 4] = r.u0; this.A[v * 4 + 1] = r.v0; this.A[v * 4 + 2] = r.du; this.A[v * 4 + 3] = r.dv;
      }
    }
    this.geo.getAttribute('uv').needsUpdate = true;
    this.geo.getAttribute('aAtlas').needsUpdate = true;
  }

  /** heights from a field h(wx, wz) → [height, pullX, pullZ] (world metres, relative to the patch origin) */
  update(field: (wx: number, wz: number) => number, pull: (wx: number, wz: number, h: number) => [number, number]) {
    const e = 0.04;
    for (let t = 0; t < TILES * TILES; t++) {
      const tx = t % TILES, ty = Math.floor(t / TILES);
      for (let j = 0; j <= SUB; j++) for (let i = 0; i <= SUB; i++) {
        const v = t * VT + j * (SUB + 1) + i;
        const wx = this.ox + tx + i / SUB, wz = this.oz + ty + j / SUB;
        if (!this.live[t]) { this.P[v * 3] = tx; this.P[v * 3 + 1] = -5; this.P[v * 3 + 2] = ty; continue; }
        const h = field(wx, wz);
        const [px, pz] = pull(wx, wz, h);
        this.P[v * 3] = wx - this.ox + px; this.P[v * 3 + 1] = this.fh[t] + 0.004 + h; this.P[v * 3 + 2] = wz - this.oz + pz;
        let ao = 1;
        if (h > 0.0005) {
          const hx0 = field(wx - e, wz), hx1 = field(wx + e, wz), hz0 = field(wx, wz - e), hz1 = field(wx, wz + e);
          const gx = (hx1 - hx0) / (2 * e), gz = (hz1 - hz0) / (2 * e);
          const l = Math.hypot(gx, 1, gz);
          this.N[v * 3] = -gx / l; this.N[v * 3 + 1] = 1 / l; this.N[v * 3 + 2] = -gz / l;
          // creases and the foot of the bulge sit in shadow, its crown catches the light
          const lap = (hx0 + hx1 + hz0 + hz1 - 4 * h) / (e * e);
          ao = lap > 0 ? 1 - Math.min(0.42, lap * 0.05) : 1 + Math.min(0.08, -lap * 0.012);
        } else { this.N[v * 3] = 0; this.N[v * 3 + 1] = 1; this.N[v * 3 + 2] = 0; }
        this.C[v * 3] = this.C[v * 3 + 1] = this.C[v * 3 + 2] = ao;
      }
    }
    this.geo.getAttribute('position').needsUpdate = true;
    this.geo.getAttribute('normal').needsUpdate = true;
    this.geo.getAttribute('color').needsUpdate = true;
  }
}

function zoneSampler(zk: string): FloorSampler | null {
  const z = G.zones?.get?.(zk);
  if (!z) return null;
  return (x, y) => {
    if (!z.inb(x, y)) return null;
    const i = z.idx(x, y);
    const fid = z.floor[i];
    if (!fid) return null;
    const f = floorDef(fid);
    return { tex: f.tex[z.floorVar[i] % f.tex.length], rot: f.rotate ? (hash3(x, y, 5) & 3) : 0, h: z.height[i] * 0.1 };
  };
}
function gallerySampler(): FloorSampler {
  const z = (window as any).__gallery?.z;
  if (!z) return () => ({ tex: 'carpet_yellow', rot: 0, h: 0 });
  return (x, y) => {
    if (!z.inb(x, y) || !z.floor[z.idx(x, y)]) return null;
    const i = z.idx(x, y), f = floorDef(z.floor[i]);
    return { tex: f.tex[z.floorVar[i] % f.tex.length], rot: f.rotate ? (hash3(x, y, 5) & 3) : 0, h: z.height[i] * 0.1 };
  };
}

// ---------------------------------------------------------------- the arm
const SEG = [0.3, 0.27, 0.25, 0.22];
const FING = 4;

function buildUnderlay(): Rig {
  const K = new SkinKit(0.4, { c: worldMaterial({ alphaTest: 0.5, doubleSide: true }) });
  K.bone('inner', null, [0, 0, 0]);
  K.bone('tear', 'inner', [0, 0.3, 0.05]);
  K.bone('arm', 'tear', [0, -0.02, 0]);
  let y = 0;
  const names = ['arm', 'a1', 'a2', 'a3', 'hand'];
  for (let i = 1; i < names.length; i++) { y += SEG[i - 1]; K.bone(names[i], names[i - 1], [0, SEG[i - 1], 0]); }
  const handY = y;
  for (let f = 0; f < FING; f++) {
    const x = -0.036 + f * 0.024;
    K.bone('f' + f, 'hand', [x, 0.085, 0.004]);
    K.bone('f' + f + 'b', 'f' + f, [0, 0.1 - Math.abs(f - 1.5) * 0.012, 0]);
  }
  K.bone('thumb', 'hand', [0.04, 0.025, 0.015]);
  void handY;

  // the tear in the pile (scaled open with the lunge)
  K.local('tear', (mb) => {
    // a shallow saddle so it sits on the dome
    const W2 = 0.2, D2 = 0.085;
    surf_(mb, 6, 2, (i, j) => { const x = -W2 + (2 * W2 * i) / 6, z = -D2 + (2 * D2 * j) / 2; return [x, -(x * x) * 0.9 - z * z * 0.6, z]; }, (i, j) => [i / 6, j / 2], 'c_underlay_tear', { inside: null, ao: false });
  }, 'c');
  // the arm: one grey tube bending through four joints that are each too knobbly
  const rest = (n: string) => K.restOf(n);
  const chain = ['arm', 'a1', 'a2', 'a3', 'hand'];
  const ys = chain.map((n) => rest(n)[1]);
  K.blend((mb) => {
    const pts: V3[] = [];
    const top = ys[4] + 0.03;
    for (let k = 0; k <= 22; k++) pts.push([0, ys[0] - 0.06 + (top - ys[0] + 0.06) * (k / 22), 0]);
    tube(mb, pts, (t) => 0.026 - t * 0.008, 7, 'c_an_skin_grey', {
      bump: (t, a) => { const yy = ys[0] - 0.06 + (top - ys[0] + 0.06) * t; let b = 1; for (let q = 1; q < 4; q++) b += 0.55 * Math.exp(-((yy - ys[q]) ** 2) / 0.0007); return b + Math.sin(a * 2 + t * 30) * 0.05; },
      squash: [1, 0.85],
    });
  }, (p) => {
    const yy = p[1];
    const out: [string, number][] = [];
    for (let q = 0; q < 5; q++) {
      const lo = q === 0 ? -1 : ys[q], hi = q === 4 ? 9 : ys[q + 1];
      const wIn = yy >= lo && yy < hi ? 1 : 0;
      out.push([chain[q], wIn]);
    }
    // soften across each joint
    for (let q = 1; q < 5; q++) {
      const d = yy - ys[q];
      if (Math.abs(d) < 0.03) { const w = (d + 0.03) / 0.06; out[q - 1][1] = 1 - w; out[q][1] = w; }
    }
    return out;
  });
  // knuckled joints: hard lumps of bone under the skin
  for (let q = 1; q < 4; q++) K.local(chain[q], (mb) => { blob(mb, [0, 0, -0.01], [0.032, 0.04, 0.034], 6, 3, 'c_an_skin_grey', { disp: (d) => 1 + (d[2] < -0.5 ? 0.3 : 0), color: 0xc8c4c8 }); });
  // the hand: a long narrow palm, four long fingers in two segments, a thumb, dark thick nails
  K.local('hand', (mb) => {
    blob(mb, [0, 0.045, 0], [0.05, 0.058, 0.018], 7, 4, 'c_an_skin_grey', {});
    for (let k = 0; k < 4; k++) blob(mb, [-0.036 + k * 0.024, 0.085, 0.004], [0.012, 0.013, 0.012], 5, 3, 'c_an_skin_grey', { color: 0xd0ccd0 });
  });
  for (let f = 0; f < FING; f++) {
    const len = 0.1 - Math.abs(f - 1.5) * 0.012;
    K.local('f' + f, (mb) => { tube(mb, [[0, 0, 0], [0, len * 0.5, 0.002], [0, len, 0]], 0.0095, 5, 'c_an_skin_grey', { bump: (t) => 1 + Math.exp(-((t - 1) ** 2) / 0.02) * 0.25 }); });
    K.local('f' + f + 'b', (mb) => {
      tube(mb, [[0, 0, 0], [0, 0.045, 0.004], [0, 0.085, 0.002]], (t) => 0.0085 - t * 0.003, 5, 'c_an_skin_grey', { capEnd: true, bump: (t) => 1 + Math.exp(-((t - 0.5) ** 2) / 0.01) * 0.3 });
      spike(mb, [0, 0.074, 0.006], [0, 1, 0.45], 0.026, 0.0065, 'c_an_nail', 0xffffff, 0.005, 4);
    });
  }
  K.local('thumb', (mb) => {
    tube(mb, [[0, 0, 0], [0.02, 0.035, 0.01], [0.03, 0.065, 0.012]], (t) => 0.01 - t * 0.003, 5, 'c_an_skin_grey', { capEnd: true });
    spike(mb, [0.028, 0.058, 0.016], [0.3, 1, 0.5], 0.018, 0.006, 'c_an_nail', 0xffffff, 0, 4);
  });
  const rig = K.finish({ sphere: [0, 0.3, 0.3, 1.6] });
  const patch = new CarpetPatch();
  rig.root.add(patch.mesh);
  rig.root.userData.patch = patch;
  void veins;
  return rig;
}

// ---------------------------------------------------------------- animation
interface UPose { h: number; moving: number; open: number; reach: number; grab: number; thrash: number; dead: number; flinch: number; strain: number; speed: number }
const TMP_M = new THREE.Matrix4();

/** the dome under the carpet in creature space (x right, z forward) */
function domeField(lx: number, lz: number, o: UPose, t: number): number {
  const H = o.h;
  const rx = 0.5 - o.strain * 0.08, rz = 0.66 + o.moving * 0.14 - o.strain * 0.1;
  const sh = o.moving * 0.06;
  const q = Math.hypot(lx / rx, (lz - sh) / rz);
  let dome = 0;
  if (q < 1.45) { const c = Math.cos((q / 1.45) * Math.PI) * 0.5 + 0.5; dome = H * Math.pow(c, 1.4); }
  // carpet bunching into radial folds around the foot of the dome
  const th = Math.atan2(lz, lx);
  const env = Math.exp(-((q - 1.05) ** 2) / 0.09);
  const fold = H * (0.1 + o.strain * 0.12) * Math.sin(th * 9 + 1.3 + Math.sin(th * 4) * 0.8) * env;
  // a bow wave ahead and a trail of ripples behind while it travels
  const lat = Math.exp(-(lx * lx) / 0.18);
  const bow = o.moving * Math.max(0.05, H) * 0.32 * Math.exp(-((lz - rz * 1.25) ** 2) / 0.02) * lat;
  const wake = lz < -0.35 ? o.moving * Math.max(0.05, H) * 0.25 * Math.max(0, Math.sin(lz * 13 + t * o.speed * 6)) * Math.exp((lz + 0.35) * 1.6) * lat : 0;
  // breathing, and a shiver when it is strained or struck
  const br = (1 - o.moving) * H * 0.06 * Math.sin(t * 1.1) * Math.max(0, 1 - q);
  const shiv = (o.strain * 0.6 + o.flinch) * 0.012 * Math.sin(t * 47 + lx * 30) * Math.max(0, 1.2 - q);
  // the torn lips of the pile curl up around the split
  let lip = 0;
  if (o.open > 0.02) { const e = Math.hypot(lx / (0.2 * o.open + 0.02), (lz - 0.05) / (0.08 * o.open + 0.01)); lip = o.open * 0.035 * Math.exp(-((e - 1.1) ** 2) / 0.08); }
  return Math.max(0, dome + fold + bow + wake + br + shiv + lip);
}

function poseUnderlay(rig: KRig, o: UPose, t: number, cx: number, cz: number, ry: number, sample: FloorSampler | null) {
  const P = rig.parts;
  // the carpet patch, world-aligned (the root is rotated by facing)
  const patch: CarpetPatch = rig.root.userData.patch;
  if (patch && sample) {
    const ox = Math.round(cx) - TILES / 2, oz = Math.round(cz) - TILES / 2;
    patch.setTiles(ox, oz, sample, '');
    const cs = Math.cos(ry), sn = Math.sin(ry);
    const field = (wx: number, wz: number) => {
      const dx = wx - cx, dz = wz - cz;
      const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
      return domeField(lx, lz, o, t);
    };
    patch.update(field, (wx, wz, h) => {
      // the pile is drawn in toward the bulge
      const dx = cx - wx, dz = cz - wz, d = Math.hypot(dx, dz) || 1;
      const k = Math.min(0.06, h * 0.22) * Math.min(1, d * 2);
      return [dx / d * k, dz / d * k];
    });
    rig.root.updateMatrix();
    TMP_M.copy(rig.root.matrix).invert();
    patch.mesh.matrix.copy(TMP_M).multiply(new THREE.Matrix4().makeTranslation(ox, 0, oz));
    patch.mesh.matrixWorldNeedsUpdate = true;
    patch.mesh.visible = rig.body.visible;
  }
  // the tear rides on top of the dome
  const top = domeField(0, 0.05, { ...o, open: 0 }, t);
  P.tear.position.set(0, top + 0.006, 0.05);
  const op = clamp01(o.open);
  P.tear.scale.set(Math.max(0.001, 0.4 + op * 0.6) * (op > 0.02 ? 1 : 0.001), 1, Math.max(0.001, op));
  // the arm: out of the tear, arcing forward and down to ankle height
  const out = smooth01(o.reach);
  P.arm.scale.setScalar(Math.max(0.001, out));
  // reach for the floor ahead: two chords solved with IK, each chord a zigzag of two segments
  const BETA = 0.55;
  const tz = 0.12 + 0.62 * out + o.thrash * Math.sin(t * 6.3) * 0.06, ty = 0.3 * (1 - out) - (top - 0.09) * out;
  const ch1 = Math.sqrt(SEG[0] ** 2 + SEG[1] ** 2 + 2 * SEG[0] * SEG[1] * Math.cos(BETA)), ch2 = Math.sqrt(SEG[2] ** 2 + SEG[3] ** 2 + 2 * SEG[2] * SEG[3] * Math.cos(BETA));
  const psi1 = Math.atan2(SEG[1] * Math.sin(BETA), SEG[0] + SEG[1] * Math.cos(BETA)), psi2 = Math.atan2(SEG[3] * Math.sin(BETA), SEG[2] + SEG[3] * Math.cos(BETA));
  const [c1, c2] = ik2(tz, ty, ch1 * Math.max(0.05, out), ch2 * Math.max(0.05, out), 1);
  const d0 = c1 + psi1, d1 = d0 - BETA, d2 = c1 + c2 + psi2, d3 = d2 - BETA;
  const rel = [Math.PI / 2 - d0, d0 - d1, d1 - d2, d2 - d3];
  const th = o.thrash;
  const names = ['arm', 'a1', 'a2', 'a3'];
  for (let s = 0; s < 4; s++) {
    const b = P[names[s]];
    const wob = Math.sin(t * (9 + s * 2.3) + s * 1.7) * 0.16 * th + Math.sin(t * 23 + s) * 0.05 * o.flinch;
    if (o.dead) b.rotation.set(s === 0 ? 1.35 : [0, 0.2, -0.15, 0.25][s], 0, (s % 2 ? 0.3 : -0.25));
    else b.rotation.set(rel[s] + wob, Math.sin(t * 5.3 + s) * 0.12 * th, Math.sin(t * 7.1 + s * 2) * 0.1 * th);
  }
  // hand: splayed while reaching, clenched on the grab
  const g = clamp01(o.grab);
  P.hand.rotation.set(o.dead ? 0.2 : 0.45 + g * 0.35, 0, 0);
  for (let f = 0; f < FING; f++) {
    const spread = (f - 1.5) * 0.14 * (1 - g);
    P['f' + f].rotation.set(0.15 + g * 1.1 + Math.sin(t * 17 + f) * 0.08 * th, 0, spread);
    P['f' + f + 'b'].rotation.set(0.2 + g * 1.3, 0, 0);
  }
  P.thumb.rotation.set(0.2 + g * 0.8, 0, -0.3 + g * 0.6);
}

function animateUnderlay(rig: Rig, c: Creature, t: number, dt: number) {
  const R = rig as KRig;
  suppressSighting(c, c.state === 'hide' && !c.dead); // a flat lump in the carpet should not cue the music
  const m = c.mem;
  const { wind, rec } = atkCurve(c, dt, 1.2);
  const strike = wind > 0.6 ? smooth01((wind - 0.6) / 0.4) : 0;
  // reach: shoots out at the end of the wind-up, stays out while surfaced, sinks back after
  const reachT = c.dead ? 1 : wind > 0 ? strike : c.state === 'emerge' ? 1 : rec > 0 ? rec : 0;
  m._reach = damp(m._reach ?? 0, reachT, reachT > (m._reach ?? 0) ? 22 : 3.5, dt);
  m._open = damp(m._open ?? 0, Math.max(reachT, wind > 0.45 ? 0.6 : 0, c.dead ? 0.9 : 0), reachT > (m._open ?? 0) ? 18 : 1.2, dt);
  const h = c.dead ? 0.06 : wind > 0 ? 0.45 + wind * 0.12 : c.state === 'emerge' ? 0.42 : c.state === 'hide' ? 0.1 : c.state === 'stalk' ? 0.36 : c.state === 'flee' ? 0.28 : 0.22;
  m._h = damp(m._h ?? h, h, c.dead ? 1.5 : 3, dt);
  const mv = damp(m._mv ?? 0, c.speed > 0.15 ? 1 : 0, 4, dt); m._mv = mv;
  const grab = c.state === 'emerge' ? 1 : wind > 0.92 ? 1 : 0;
  m._grab = damp(m._grab ?? 0, c.dead ? 0.4 : grab, 14, dt);
  const z = G.zones?.get?.(c.zoneKey);
  const sample = z ? zoneSampler(c.zoneKey) : null;
  // stays flat on the floor even when the manager tips the corpse over
  rig.parts.inner.rotation.z = -rig.body.rotation.z;
  rig.parts.inner.position.y = -rig.body.position.y;
  poseUnderlay(R, {
    h: m._h, moving: mv, open: m._open, reach: isLost(c, 'arm') ? 0 : m._reach, grab: m._grab,
    thrash: c.state === 'emerge' ? 1 : rec > 0 ? rec : 0, dead: c.dead ? 1 : 0, flinch: flinchOf(c),
    strain: wind > 0 ? Math.min(1, wind * 1.4) : c.state === 'stalk' ? 0.25 : 0, speed: Math.max(0.5, c.speed),
  }, t, c.x, c.z, Math.PI / 2 - c.facing, sample);
}

/** footsteps it can feel: moving, not sneaking, on or next to carpet */
function felt(c: Creature): { p: Player; d: number } | null {
  const z = zoneOf(c);
  let best: Player | null = null, bd = Infinity;
  for (const p of playersIn(c)) {
    if (p.speed < 0.35 || p.stance === 'sneak' || p.stance === 'swim') continue;
    const d = dist(p.x, p.z, c.x, c.z);
    const r = p.running ? 10 : 6.5;
    if (d > r || !isCarpet(z, p.x, p.z) && d > 2) continue;
    if (d < bd) { bd = d; best = p; }
  }
  return best ? { p: best, d: bd } : null;
}

/** move but never leave the carpet */
function carpetMove(c: Creature, gx: number, gz: number, speed: number, dt: number, stopD: number) {
  const cs = CS(), z = zoneOf(c);
  const arrived = cs.moveTo(c, z, gx, gz, speed, dt, stopD);
  const ax = c.x + c.vx * Math.max(dt, 0.016) * 4, az = c.z + c.vz * Math.max(dt, 0.016) * 4;
  if (!isCarpet(z, ax, az)) { stop(c); return true; }
  if (c.speed > 0 && (c.mem.rustleT ?? 0) < G.time) { c.mem.rustleT = G.time + 1.1 + Math.random() * 0.6; sfx(c, 'carpet_rustle', c.speed > 2 ? 0.8 : 0.45); }
  return arrived;
}

function thinkUnderlay(c: Creature, dt: number): boolean {
  const cs = CS(), z = zoneOf(c);
  const ev = pulse(c);
  const surfaced = c.state === 'emerge';
  instFlags(c, { immortal: !surfaced });
  c.radius = surfaced ? 0.42 : 0.16;
  const f = felt(c);
  if (f) { c.targetId = f.p.id; c.lastSeen = { x: f.p.x, z: f.p.z, t: G.time }; c.mem.feltT = G.time; }
  const T = c.targetId ? G.players.get(c.targetId) ?? null : null;
  switch (c.state) {
    case 'emerge': {
      stop(c);
      if (T) faceTo(c, T.x, T.z);
      if (ev.hurt > 0 || c.stateT > 1.4) { c.setState('flee'); c.goal = null; cs.call(c, 'hurt'); }
      return true;
    }
    case 'flee': {
      if (!c.goal) c.goal = cs.wanderSpot(c, z, 8);
      if (carpetMove(c, c.goal.x, c.goal.z, 3.2, dt, 0.5) || c.stateT > 6) { c.setState('hide'); c.mem.cool = G.time + 4; }
      return true;
    }
    case 'stalk': {
      if (!T || T.body.dead || T.zoneKey !== c.zoneKey) { c.setState('hide'); return true; }
      if (ev.staggered) { c.setState('flee'); c.goal = null; return true; }
      // lose the trail when the footsteps stop
      if (G.time - (c.mem.feltT ?? 0) > 2.6) { c.setState('hide'); c.targetId = null; return true; }
      const d = dist(T.x, T.z, c.x, c.z);
      const moving = T.speed > 0.35 && T.stance !== 'sneak';
      if (d < 1.15 && (moving || G.time - (c.mem.feltT ?? 0) < 0.5) && isCarpet(z, T.x, T.z) && G.time > (c.mem.cool ?? 0)) {
        faceTo(c, T.x, T.z, true); stop(c);
        instFlags(c, { immortal: false }); c.radius = 0.42;
        attack(c, T);
        c.setState('emerge');
        return true;
      }
      const g = c.lastSeen ?? { x: T.x, z: T.z };
      carpetMove(c, g.x, g.z, T.running ? c.sp.run : c.sp.walk, dt, 0.6);
      return true;
    }
    case 'hide':
    case 'wander':
    case 'idle': {
      if (f && G.time > (c.mem.cool ?? 0)) { c.setState('stalk'); cs.call(c, 'alert'); return true; }
      if (ev.staggered) { c.setState('flee'); c.goal = null; return true; }
      if (heardMargin(c) > 6 && G.time > (c.mem.cool ?? 0) && c.lastHeard) { c.goal = { x: c.lastHeard.x, z: c.lastHeard.z }; c.setState('wander'); }
      if (c.state === 'wander') {
        if (!c.goal || carpetMove(c, c.goal.x, c.goal.z, 0.7, dt, 0.5) || c.stateT > 14) c.setState('hide');
      } else {
        stop(c);
        if (c.state !== 'hide') c.setState('hide');
        if (c.stateT > 8 + (c.id.charCodeAt(1) % 7) && cs.rng.chance(dt * 0.2)) { c.goal = cs.wanderSpot(c, z, 6); c.setState('wander'); }
      }
      return true;
    }
    default:
      // e.g. 'chase' after being struck while surfaced: sink and get away
      c.setState('flee'); c.goal = null;
      return true;
  }
}

onPlayerHit('underlay', (p) => {
  p.actions.set(new HeldAction(p, 0.9, 'kneel', 'Grabbed', 0.5));
  bus.emit('think', p, ['Something has my ankle!', 'It pulled me down — under the carpet!', 'Fingers. Through the carpet.'][Math.floor(Math.random() * 3)]);
});

const sp = def({
  key: 'underlay', name: 'Underlay', code: 'E-26 // SUBSTRATE-DWELLER', temperament: 'ambush', threat: 3,
  hp: 38, walk: 2.4, run: 3.6, turn: 6, radius: 0.16, height: 0.3, sight: 0, fov: 3.1, hearing: 1.2, vibration: true,
  attack: { dmg: [6, 12], range: 0.8, cooldown: 2.0, kinds: ['laceration', 'scratch', 'bite'], corrupt: 0.08, knock: -0.35, grab: true, parts: ['foot_l', 'foot_r', 'shin_l', 'shin_r'] },
  zones: ['lobby', 'office', 'house', 'tunnels', 'hospital'], weight: 2, maxPerZone: 3, diet: 'meat',
  flags: { underCarpet: true },
  sounds: { alert: 'underlay_hiss', attack: 'underlay_grab', hurt: 'underlay_hiss', death: 'underlay_die' },
  scan: {
    cls: 'Subsurface ambusher',
    notes: [
      'No visible body. A bulge under the carpet that moves against the weave; the pile folds in around it.',
      'Blind. Feels footsteps through the floor. Sneaking does not register at all.',
      'Standing still makes it lose you. It cannot follow you onto tile, wood or concrete.',
      'Strikes at ankles with a long grey arm, then stays surfaced for a moment. That is the only time a weapon finds it.',
    ],
  },
  gore: { blood: 'dark', tint: 0xb89a8a, sever: ['arm'] },
  build: buildUnderlay,
  animate: animateUnderlay,
  think: thinkUnderlay,
});

/** gallery poses: idle (flat lump), move (travelling), stalk, lunge (loops the strike), grab, dead */
(sp as any).animateGallery = (rig: Rig, t: number) => {
  const q = galleryPose('');
  const L = (t * 0.45) % 1;
  const cyc = q === 'lunge' || q === '';
  const reach = q === 'grab' ? 1 : cyc ? (L < 0.3 ? 0 : L < 0.4 ? (L - 0.3) / 0.1 : L < 0.7 ? 1 : Math.max(0, 1 - (L - 0.7) / 0.25)) : q === 'dead' ? 1 : 0;
  const strain = cyc ? (L < 0.3 ? L / 0.3 : 0) : 0;
  const h = q === 'idle' ? 0.1 : q === 'dead' ? 0.06 : q === 'move' ? 0.3 : q === 'stalk' ? 0.36 : 0.42 + strain * 0.12;
  const pos = rig.root.position;
  poseUnderlay(rig as KRig, {
    h, moving: q === 'move' || q === 'stalk' ? 1 : 0, open: Math.max(reach, strain > 0.6 ? 0.5 : 0), reach, grab: q === 'grab' || (cyc && L > 0.38 && L < 0.7) ? 1 : 0,
    thrash: cyc && L > 0.4 && L < 0.7 ? 1 : q === 'grab' ? 0.6 : 0, dead: q === 'dead' ? 1 : 0, flinch: 0, strain, speed: 1.2,
  }, t, pos.x, pos.z + (q === 'move' ? (t * 0.6) % 2 - 1 : 0) * 0, rig.root.rotation.y, gallerySampler());
};
void tileFbm;
