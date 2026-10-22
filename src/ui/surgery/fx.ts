// Particles for the operating table: arterial blood (faceted drops that
// leave irregular splats where they land and stay), welding / grinding sparks
// (hot streaks along their velocity that bounce off the steel), and dithered
// pixel puffs for steam, weld smoke and blood mist (alpha is an ordered-dither
// threshold, so they stay crisp at the stage's pixel scale).
import * as THREE from 'three';
import { prep, gem, prism, ngon } from './geo';
import { TABLE_Y, TABLE_HALF_X, TABLE_HALF_Z, TRAY_POS } from './room';
import { PixelCanvas } from '../../gfx/pixel';
import { hashf } from '../../core/rng';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _d = new THREE.Vector3(), _c = new THREE.Color();
const _Y = new THREE.Vector3(0, 1, 0);

/** the height a falling thing lands on at (x, z) */
export function surfaceY(x: number, z: number, y: number): number {
  if (Math.abs(x) < TABLE_HALF_X && Math.abs(z) < TABLE_HALF_Z + 0.04 && y > TABLE_Y - 0.06) return TABLE_Y + 0.003;
  const T = TRAY_POS;
  if (Math.abs(x - T.x) < 0.34 && Math.abs(z - T.z) < 0.16 && y > T.y - 0.1) return T.y - 0.015;
  return 0.004;
}

class Pool {
  p: Float32Array; v: Float32Array; life: Float32Array; size: Float32Array; n = 0;
  constructor(public cap: number) { this.p = new Float32Array(cap * 3); this.v = new Float32Array(cap * 3); this.life = new Float32Array(cap); this.size = new Float32Array(cap); }
  alloc(): number { if (this.n < this.cap) return this.n++; return (Math.random() * this.cap) | 0; }
  kill(i: number) { const j = --this.n; if (i === j) return j; this.p.copyWithin(i * 3, j * 3, j * 3 + 3); this.v.copyWithin(i * 3, j * 3, j * 3 + 3); this.life[i] = this.life[j]; this.size[i] = this.size[j]; return j; }
}

// ------------------------------------------------------------------ puffs (a dithered billboard per instance)
const PUFF_VS = `
attribute vec3 aPos; attribute float aSize; attribute float aAlpha; attribute vec3 aCol; attribute float aRot;
varying vec2 vUv; varying float vAlpha; varying vec3 vCol;
void main() {
  vUv = uv; vAlpha = aAlpha; vCol = aCol;
  vec4 mv = viewMatrix * vec4(aPos, 1.0);
  float c = cos(aRot), s = sin(aRot);
  vec2 o = vec2(c * position.x - s * position.y, s * position.x + c * position.y) * aSize;
  mv.xy += o;
  gl_Position = projectionMatrix * mv;
}`;
const PUFF_FS = `
uniform sampler2D map; varying vec2 vUv; varying float vAlpha; varying vec3 vCol;
float bayer4(vec2 p) { int x = int(mod(p.x, 4.0)), y = int(mod(p.y, 4.0)); int i = x + y * 4;
  float m[16]; m[0]=0.;m[1]=8.;m[2]=2.;m[3]=10.;m[4]=12.;m[5]=4.;m[6]=14.;m[7]=6.;m[8]=3.;m[9]=11.;m[10]=1.;m[11]=9.;m[12]=15.;m[13]=7.;m[14]=13.;m[15]=5.;
  for (int k = 0; k < 16; k++) if (k == i) return (m[k] + 0.5) / 16.0; return 0.5; }
void main() {
  vec4 t = texture2D(map, vUv);
  float a = t.a * vAlpha;
  if (a < 0.06) discard;
  // a few hard alpha steps, never a smooth gradient
  a = floor(a * 4.0 + bayer4(gl_FragCoord.xy) * 0.6) / 4.0;
  gl_FragColor = vec4(vCol * t.rgb, a * 0.7);
}`;
function puffTexture(): THREE.DataTexture {
  const pc = new PixelCanvas(16, 16); pc.wrap = false;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const d = Math.hypot(x - 7.5, y - 7.5) / 7.5 + (hashf(x >> 1, y >> 1, 3) - 0.5) * 0.35;
    if (d < 1) { const l = d < 0.45 ? 255 : d < 0.75 ? 205 : 160; pc.setRGBA(x, y, l, l, l, Math.round(255 * Math.min(1, (1 - d) * 1.8))); }
  }
  const t = new THREE.DataTexture(new Uint8Array(pc.data.buffer.slice(0)), 16, 16, THREE.RGBAFormat);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true;
  return t;
}
class Puffs {
  mesh: THREE.Mesh;
  private pool: Pool;
  private aPos: THREE.InstancedBufferAttribute; private aSize: THREE.InstancedBufferAttribute; private aAlpha: THREE.InstancedBufferAttribute;
  private aCol: THREE.InstancedBufferAttribute; private aRot: THREE.InstancedBufferAttribute;
  private max: Float32Array; private grow: Float32Array; private a0: Float32Array; private spin: Float32Array; private lift: Float32Array;
  private geo: THREE.InstancedBufferGeometry;
  constructor(cap: number) {
    this.pool = new Pool(cap);
    const g = new THREE.InstancedBufferGeometry();
    const q = new THREE.PlaneGeometry(1, 1);
    g.index = q.index; g.setAttribute('position', q.getAttribute('position')); g.setAttribute('uv', q.getAttribute('uv'));
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    this.aSize = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
    this.aAlpha = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    this.aRot = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
    for (const a of [this.aPos, this.aSize, this.aAlpha, this.aCol, this.aRot]) a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aPos', this.aPos); g.setAttribute('aSize', this.aSize); g.setAttribute('aAlpha', this.aAlpha); g.setAttribute('aCol', this.aCol); g.setAttribute('aRot', this.aRot);
    g.instanceCount = 0;
    this.geo = g;
    this.max = new Float32Array(cap); this.grow = new Float32Array(cap); this.a0 = new Float32Array(cap); this.spin = new Float32Array(cap); this.lift = new Float32Array(cap);
    const mat = new THREE.ShaderMaterial({ uniforms: { map: { value: puffTexture() } }, vertexShader: PUFF_VS, fragmentShader: PUFF_FS, depthWrite: false, transparent: true, toneMapped: false });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 4;
  }
  add(p: THREE.Vector3, v: THREE.Vector3, size: number, grow: number, life: number, col: number, alpha: number, lift: number) {
    const P = this.pool, i = P.alloc();
    P.p.set([p.x, p.y, p.z], i * 3); P.v.set([v.x, v.y, v.z], i * 3);
    P.life[i] = life; this.max[i] = life; P.size[i] = size; this.grow[i] = grow; this.a0[i] = alpha; this.spin[i] = (Math.random() - 0.5) * 1.5; this.lift[i] = lift;
    _c.setHex(col);
    (this.aCol.array as Float32Array).set([_c.r, _c.g, _c.b], i * 3);
    (this.aRot.array as Float32Array)[i] = Math.random() * 6.28;
  }
  update(dt: number) {
    const P = this.pool;
    for (let i = 0; i < P.n; i++) {
      P.life[i] -= dt;
      if (P.life[i] <= 0) {
        const j = P.kill(i);
        if (j !== i) {
          this.max[i] = this.max[j]; this.grow[i] = this.grow[j]; this.a0[i] = this.a0[j]; this.spin[i] = this.spin[j]; this.lift[i] = this.lift[j];
          const c = this.aCol.array as Float32Array; c.copyWithin(i * 3, j * 3, j * 3 + 3);
          (this.aRot.array as Float32Array)[i] = (this.aRot.array as Float32Array)[j];
        }
        i--; continue;
      }
      const k = Math.exp(-1.6 * dt);
      P.v[i * 3] *= k; P.v[i * 3 + 2] *= k; P.v[i * 3 + 1] = P.v[i * 3 + 1] * k + this.lift[i] * dt;
      P.p[i * 3] += P.v[i * 3] * dt; P.p[i * 3 + 1] += P.v[i * 3 + 1] * dt; P.p[i * 3 + 2] += P.v[i * 3 + 2] * dt;
      P.size[i] += this.grow[i] * dt;
      (this.aRot.array as Float32Array)[i] += this.spin[i] * dt;
    }
    (this.aPos.array as Float32Array).set(P.p.subarray(0, P.n * 3));
    (this.aSize.array as Float32Array).set(P.size.subarray(0, P.n));
    const al = this.aAlpha.array as Float32Array;
    for (let i = 0; i < P.n; i++) { const t = P.life[i] / this.max[i]; al[i] = this.a0[i] * Math.min(1, t * 2.2) * Math.min(1, (1 - t) * 8 + 0.2); }
    for (const a of [this.aPos, this.aSize, this.aAlpha, this.aCol, this.aRot]) a.needsUpdate = true;
    this.geo.instanceCount = P.n;
  }
}

// ------------------------------------------------------------------ everything
export class FX {
  group = new THREE.Group();
  private drops: THREE.InstancedMesh; private dp: Pool;
  private splats: THREE.InstancedMesh; private sn = 0; private scap: number;
  private sparks: THREE.InstancedMesh; private sp: Pool; private sparkCol: Float32Array;
  puffs: Puffs;
  constructor(low: boolean) {
    // blood drops: faceted, wet; they do not write depth (no outline on a one-pixel drop)
    const dropMat = new THREE.MeshStandardMaterial({ color: 0x6a0608, roughness: 0.18, metalness: 0.1, flatShading: true, depthWrite: false });
    const dg = prep(gem(0.5, 0.5, 0.5), null, 1, 0xffffff);
    this.dp = new Pool(low ? 260 : 500);
    this.drops = new THREE.InstancedMesh(dg, dropMat, this.dp.cap);
    this.drops.count = 0; this.drops.frustumCulled = false; this.drops.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // splats: irregular flat polygons that stay where they land
    const blob: [number, number][] = ngon(9, 0.5).map(([x, y], i) => { const k = 0.55 + hashf(i, 3, 17) * 0.55; return [x * k, y * k] as [number, number]; });
    const sg = prep(prism(blob, 0.002).rotateX(-Math.PI / 2), null, 1, 0xffffff);
    const splatMat = new THREE.MeshStandardMaterial({ color: 0x4a0406, roughness: 0.12, metalness: 0.15, flatShading: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.scap = low ? 180 : 360;
    this.splats = new THREE.InstancedMesh(sg, splatMat, this.scap);
    this.splats.count = 0; this.splats.frustumCulled = false; this.splats.receiveShadow = true;
    this.splats.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.scap * 3).fill(1), 3);
    // sparks: hot streaks, additive
    const kg = new THREE.BoxGeometry(0.004, 1, 0.004); kg.translate(0, -0.5, 0);
    const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false });
    this.sp = new Pool(low ? 160 : 320);
    this.sparks = new THREE.InstancedMesh(kg, sparkMat, this.sp.cap);
    this.sparks.count = 0; this.sparks.frustumCulled = false; this.sparks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.sparks.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.sp.cap * 3), 3);
    this.sparkCol = new Float32Array(this.sp.cap * 3);
    this.puffs = new Puffs(low ? 90 : 180);
    this.drops.renderOrder = 3; this.sparks.renderOrder = 6;
    this.group.add(this.splats, this.drops, this.sparks, this.puffs.mesh);
  }
  /** an arterial burst from p (dir biases it) */
  blood(p: THREE.Vector3, n: number, power = 1, dir?: THREE.Vector3) {
    const P = this.dp;
    for (let k = 0; k < n; k++) {
      const i = P.alloc();
      const a = Math.random() * Math.PI * 2, s = (0.25 + Math.random() * 1.0) * power;
      let vx = Math.cos(a) * s, vy = 0.6 + Math.random() * 1.7 * power, vz = Math.sin(a) * s;
      if (dir) { vx += dir.x * power * (0.6 + Math.random()); vy += dir.y * power * (0.6 + Math.random()); vz += dir.z * power * (0.6 + Math.random()); }
      P.p.set([p.x, p.y, p.z], i * 3); P.v.set([vx, vy, vz], i * 3);
      P.life[i] = 3; P.size[i] = 0.008 + Math.random() * 0.016;
    }
  }
  splat(x: number, y: number, z: number, r: number) {
    const i = this.sn < this.scap ? this.sn++ : (Math.random() * this.scap) | 0;
    _q.setFromAxisAngle(_Y, Math.random() * 6.28);
    _m.compose(_p.set(x, y, z), _q, _s.set(r * (0.8 + Math.random() * 0.6), 1, r * (0.8 + Math.random() * 0.6)));
    this.splats.setMatrixAt(i, _m);
    const sh = 0.7 + Math.random() * 0.5;
    this.splats.setColorAt(i, _c.setRGB(sh, sh * 0.9, sh * 0.9));
    this.splats.count = this.sn;
    this.splats.instanceMatrix.needsUpdate = true; this.splats.instanceColor!.needsUpdate = true;
  }
  /** sparks: weld (blue-white), grind (orange) */
  spark(p: THREE.Vector3, n: number, kind: 'weld' | 'grind' = 'grind', dir?: THREE.Vector3, power = 1) {
    const P = this.sp;
    for (let k = 0; k < n; k++) {
      const i = P.alloc();
      const a = Math.random() * Math.PI * 2, s = (0.8 + Math.random() * 2.6) * power;
      let vx = Math.cos(a) * s, vy = 0.4 + Math.random() * 2.2 * power, vz = Math.sin(a) * s;
      if (dir) { vx += dir.x * 2.5 * power; vy += dir.y * 2.5 * power; vz += dir.z * 2.5 * power; }
      P.p.set([p.x, p.y, p.z], i * 3); P.v.set([vx, vy, vz], i * 3);
      P.life[i] = 0.18 + Math.random() * (kind === 'weld' ? 0.35 : 0.55); P.size[i] = 0;
      const hot = Math.random();
      if (kind === 'weld') _c.setRGB(hot < 0.4 ? 3.2 : 2.2, hot < 0.4 ? 3.2 : 2.6, 3.4);
      else _c.setRGB(3.4, hot < 0.3 ? 2.6 : 1.4, hot < 0.3 ? 1.2 : 0.3);
      this.sparkCol.set([_c.r, _c.g, _c.b], i * 3);
    }
  }
  steam(p: THREE.Vector3, n: number, power = 1) {
    for (let k = 0; k < n; k++) this.puffs.add(_p.copy(p).add(_d.set((Math.random() - 0.5) * 0.05, 0, (Math.random() - 0.5) * 0.05)), _d.set((Math.random() - 0.5) * 0.3, 0.25 * power + Math.random() * 0.3, (Math.random() - 0.5) * 0.3), 0.05 + Math.random() * 0.05, 0.25 + Math.random() * 0.2, 1.2 + Math.random() * 1.2, 0x8a9490, 0.55, 0.1);
  }
  smoke(p: THREE.Vector3, n: number) {
    for (let k = 0; k < n; k++) this.puffs.add(p, _d.set((Math.random() - 0.5) * 0.15, 0.2 + Math.random() * 0.25, (Math.random() - 0.5) * 0.15), 0.03 + Math.random() * 0.03, 0.18, 1.0 + Math.random() * 1.2, 0x3a3632, 0.75, 0.12);
  }
  mist(p: THREE.Vector3, n: number) {
    for (let k = 0; k < n; k++) this.puffs.add(p, _d.set((Math.random() - 0.5) * 0.6, 0.2 + Math.random() * 0.4, (Math.random() - 0.5) * 0.6), 0.03 + Math.random() * 0.03, 0.12, 0.5 + Math.random() * 0.4, 0x5a0808, 0.6, -0.2);
  }
  update(dt: number) {
    // drops: fall, land, leave a splat
    const D = this.dp;
    for (let i = 0; i < D.n; i++) {
      D.life[i] -= dt;
      D.v[i * 3 + 1] -= 9.8 * dt;
      const k = Math.exp(-0.5 * dt);
      D.v[i * 3] *= k; D.v[i * 3 + 2] *= k;
      const x = D.p[i * 3] += D.v[i * 3] * dt, y = D.p[i * 3 + 1] += D.v[i * 3 + 1] * dt, z = D.p[i * 3 + 2] += D.v[i * 3 + 2] * dt;
      const fy = surfaceY(x, z, y - D.v[i * 3 + 1] * dt);
      if (y <= fy || D.life[i] <= 0) {
        if (y <= fy + 0.01 && Math.random() < 0.55) this.splat(x, fy, z, D.size[i] * (2.5 + Math.random() * 3));
        D.kill(i); i--; continue;
      }
    }
    for (let i = 0; i < D.n; i++) {
      const s = D.size[i];
      _d.set(D.v[i * 3], D.v[i * 3 + 1], D.v[i * 3 + 2]);
      const sp = _d.length();
      _q.setFromUnitVectors(_Y, sp > 0.01 ? _d.multiplyScalar(1 / sp) : _Y);
      _m.compose(_p.set(D.p[i * 3], D.p[i * 3 + 1], D.p[i * 3 + 2]), _q, _s.set(s, s * (1 + Math.min(0.8, sp * 0.2)), s));
      this.drops.setMatrixAt(i, _m);
    }
    this.drops.count = D.n; this.drops.instanceMatrix.needsUpdate = true;
    // sparks: streak along their velocity, bounce, cool
    const S = this.sp, col = this.sparks.instanceColor!.array as Float32Array;
    for (let i = 0; i < S.n; i++) {
      S.life[i] -= dt;
      if (S.life[i] <= 0) { const j = S.kill(i); if (j !== i) this.sparkCol.copyWithin(i * 3, j * 3, j * 3 + 3); i--; continue; }
      S.v[i * 3 + 1] -= 7 * dt;
      const x = S.p[i * 3] += S.v[i * 3] * dt, y = S.p[i * 3 + 1] += S.v[i * 3 + 1] * dt, z = S.p[i * 3 + 2] += S.v[i * 3 + 2] * dt;
      const fy = surfaceY(x, z, y + 0.05);
      if (y < fy) { S.p[i * 3 + 1] = fy; S.v[i * 3 + 1] *= -0.35; S.v[i * 3] *= 0.6; S.v[i * 3 + 2] *= 0.6; }
    }
    for (let i = 0; i < S.n; i++) {
      _d.set(S.v[i * 3], S.v[i * 3 + 1], S.v[i * 3 + 2]);
      const sp = _d.length();
      _q.setFromUnitVectors(_Y, sp > 0.01 ? _d.multiplyScalar(-1 / sp) : _Y);
      _m.compose(_p.set(S.p[i * 3], S.p[i * 3 + 1], S.p[i * 3 + 2]), _q, _s.set(1, Math.min(0.09, sp * 0.018), 1));
      this.sparks.setMatrixAt(i, _m);
      const f = Math.min(1, S.life[i] * 4);
      col[i * 3] = this.sparkCol[i * 3] * f; col[i * 3 + 1] = this.sparkCol[i * 3 + 1] * f * f; col[i * 3 + 2] = this.sparkCol[i * 3 + 2] * f * f * f;
    }
    this.sparks.count = S.n; this.sparks.instanceMatrix.needsUpdate = true; this.sparks.instanceColor!.needsUpdate = true;
    this.puffs.update(dt);
  }
  dispose() { this.drops.geometry.dispose(); this.splats.geometry.dispose(); this.sparks.geometry.dispose(); this.puffs.mesh.geometry.dispose(); }
}
