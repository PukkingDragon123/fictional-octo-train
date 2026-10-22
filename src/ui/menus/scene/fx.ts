// Effects for the subject room, all crisp at the low render resolution:
// one-pixel dust motes that only show inside the lamp's cone, the cone itself
// as additive faceted cards, breath vapour and smoke as billboarded hexagon
// cards, jagged electric arcs as one-pixel lines, sweat beads and catchlights
// riding the head, a sagging faceted cable and a chain of real links that are
// rebuilt each frame between two moving points.
import * as THREE from 'three';
import { FacetBuilder, band } from './facet';
import type { FKey, FMats } from './pixtex';

const tmp = new THREE.Vector3();

// ------------------------------------------------------------------ dust
/** motes drifting round a region; lit only where the key light's cone reaches */
export class Dust {
  points: THREE.Points;
  private n: number; private pos: Float32Array; private col: Float32Array; private seed: Float32Array;
  constructor(n: number, private box: THREE.Box3) {
    this.n = n;
    this.pos = new Float32Array(n * 3); this.col = new Float32Array(n * 3); this.seed = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { this.seed[i * 4] = Math.random(); this.seed[i * 4 + 1] = Math.random(); this.seed[i * 4 + 2] = Math.random(); this.seed[i * 4 + 3] = Math.random() * 6.28; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ size: 1, sizeAttenuation: false, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
  }
  update(t: number, L: THREE.Vector3, dir: THREE.Vector3, cosOuter: number, cosInner: number, power: number, color: THREE.Color, extra = 0) {
    const b = this.box, P = this.pos, C = this.col, S = this.seed;
    const sx = b.max.x - b.min.x, sy = b.max.y - b.min.y, sz = b.max.z - b.min.z;
    for (let i = 0; i < this.n; i++) {
      const j = i * 4;
      // a slow tumble: each mote falls a little and wanders, wrapping round the box
      const fy = ((S[j + 1] - t * (0.004 + S[j + 2] * 0.012)) % 1 + 1) % 1;
      const x = b.min.x + ((S[j] + Math.sin(t * 0.13 + S[j + 3]) * 0.03) % 1 + 1) % 1 * sx;
      const y = b.min.y + fy * sy;
      const z = b.min.z + ((S[j + 2] + Math.cos(t * 0.11 + S[j + 3] * 2) * 0.03) % 1 + 1) % 1 * sz;
      P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z;
      tmp.set(x - L.x, y - L.y, z - L.z);
      const d = tmp.length();
      const c = tmp.dot(dir) / Math.max(1e-4, d);
      const cone = c <= cosOuter ? 0 : c >= cosInner ? 1 : (c - cosOuter) / (cosInner - cosOuter);
      // they glint as they turn
      const glint = 0.35 + 0.65 * Math.max(0, Math.sin(t * (1.5 + S[j] * 3) + S[j + 3] * 5));
      const k = (cone * power / (0.4 + d * d) + extra * 0.08) * glint;
      C[i * 3] = color.r * k; C[i * 3 + 1] = color.g * k; C[i * 3 + 2] = color.b * k;
    }
    (this.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.points.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }
}

// ------------------------------------------------------------------ the light cone
/** an open faceted cone of additive haze: apex at the origin, opening down -Y over unit length and unit radius */
export function shaftMesh(sides = 9): { mesh: THREE.Mesh; u: { uInt: { value: number }; uColor: { value: THREE.Color } } } {
  const pos: number[] = [];
  for (let i = 0; i < sides; i++) {
    const a0 = (i / sides) * Math.PI * 2, a1 = ((i + 1) / sides) * Math.PI * 2;
    pos.push(0, 0, 0, Math.cos(a1), -1, Math.sin(a1), Math.cos(a0), -1, Math.sin(a0));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const u = { uInt: { value: 0 }, uColor: { value: new THREE.Color(0xffd8a0) } };
  const mat = new THREE.ShaderMaterial({
    uniforms: u,
    vertexShader: 'varying vec3 vV; varying float vY; void main(){ vY = -position.y; vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = mv.xyz; gl_Position = projectionMatrix * mv; }',
    fragmentShader: `uniform float uInt; uniform vec3 uColor; varying vec3 vV; varying float vY;
      void main(){
        vec3 n = normalize(cross(dFdx(vV), dFdy(vV)));
        float f = abs(dot(n, normalize(-vV)));
        float a = uInt * (0.25 + 0.75 * f * f) * smoothstep(0.0, 0.12, vY) * (1.0 - smoothstep(0.45, 1.0, vY));
        gl_FragColor = vec4(uColor * a, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  return { mesh, u };
}

// ------------------------------------------------------------------ vapour and smoke
interface Puff { p: THREE.Vector3; v: THREE.Vector3; age: number; life: number; s0: number; s1: number; c: THREE.Color; rot: number; spin: number; rise: number }
/** billboarded hexagon cards, additive (breath in the cold, smoke off the cap) */
export class Puffs {
  mesh: THREE.InstancedMesh;
  private list: Puff[] = [];
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private qq = new THREE.Quaternion(); private qz = new THREE.Quaternion(); private s = new THREE.Vector3(); private col = new THREE.Color();
  constructor(private max = 48) {
    const g = new THREE.CircleGeometry(1, 6);
    this.mesh = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }), max);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
  }
  emit(p: THREE.Vector3, v: THREE.Vector3, o: { life?: number; s0?: number; s1?: number; color?: number; rise?: number } = {}) {
    if (this.list.length >= this.max) this.list.shift();
    this.list.push({ p: p.clone(), v: v.clone(), age: 0, life: o.life ?? 1.6, s0: o.s0 ?? 0.01, s1: o.s1 ?? 0.08, c: new THREE.Color(o.color ?? 0x9aa8b0), rot: Math.random() * 6.28, spin: (Math.random() - 0.5) * 0.8, rise: o.rise ?? 0.05 });
  }
  /** light(p) -> how lit a point is (0..), so vapour only shows where a lamp catches it */
  update(dt: number, cam: THREE.Camera, light: (p: THREE.Vector3) => number) {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const q = L[i];
      q.age += dt;
      if (q.age >= q.life) { L.splice(i, 1); continue; }
      q.p.addScaledVector(q.v, dt);
      q.v.multiplyScalar(Math.exp(-dt * 1.6));
      q.v.y += q.rise * dt;
      q.rot += q.spin * dt;
    }
    cam.getWorldQuaternion(this.q);
    for (let i = 0; i < L.length; i++) {
      const q = L[i], k = q.age / q.life;
      const sc = q.s0 + (q.s1 - q.s0) * (1 - (1 - k) * (1 - k));
      this.qz.setFromAxisAngle(tmp.set(0, 0, 1), q.rot);
      this.m.compose(q.p, this.qq.copy(this.q).multiply(this.qz), this.s.set(sc, sc, sc));
      this.mesh.setMatrixAt(i, this.m);
      const a = Math.sin(Math.PI * Math.min(1, k * 1.3)) * (1 - k) * light(q.p);
      this.col.copy(q.c).multiplyScalar(a);
      this.mesh.setColorAt(i, this.col);
    }
    this.mesh.count = L.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  clear() { this.list = []; this.mesh.count = 0; }
}

// ------------------------------------------------------------------ arcs
interface Arc { a: THREE.Vector3; b: THREE.Vector3; life: number; jag: number }
/** jagged one-pixel lightning between points, re-struck every frame while alive */
export class Arcs {
  lines: THREE.LineSegments;
  private arcs: Arc[] = [];
  private pos: Float32Array; private col: Float32Array;
  private seg = 9;
  constructor(private max = 10) {
    this.pos = new Float32Array(max * this.seg * 6); this.col = new Float32Array(max * this.seg * 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    g.setDrawRange(0, 0);
    this.lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 5;
  }
  strike(a: THREE.Vector3, b: THREE.Vector3, life = 0.12, jag = 0.35) {
    if (this.arcs.length >= this.max) this.arcs.shift();
    this.arcs.push({ a: a.clone(), b: b.clone(), life, jag });
  }
  get active() { return this.arcs.length > 0; }
  update(dt: number) {
    const P = this.pos, C = this.col;
    let v = 0;
    for (let i = this.arcs.length - 1; i >= 0; i--) { this.arcs[i].life -= dt; if (this.arcs[i].life <= 0) this.arcs.splice(i, 1); }
    for (const arc of this.arcs) {
      const len = arc.a.distanceTo(arc.b);
      let px = arc.a.x, py = arc.a.y, pz = arc.a.z;
      const bright = 0.6 + Math.random() * 0.8;
      for (let s = 1; s <= this.seg; s++) {
        const t = s / this.seg, w = s === this.seg ? 0 : Math.sin(t * Math.PI) * len * arc.jag;
        const x = arc.a.x + (arc.b.x - arc.a.x) * t + (Math.random() - 0.5) * w;
        const y = arc.a.y + (arc.b.y - arc.a.y) * t + (Math.random() - 0.5) * w;
        const z = arc.a.z + (arc.b.z - arc.a.z) * t + (Math.random() - 0.5) * w;
        P[v * 3] = px; P[v * 3 + 1] = py; P[v * 3 + 2] = pz; P[v * 3 + 3] = x; P[v * 3 + 4] = y; P[v * 3 + 5] = z;
        for (let k = 0; k < 2; k++) { C[(v + k) * 3] = 1.6 * bright; C[(v + k) * 3 + 1] = 2.0 * bright; C[(v + k) * 3 + 2] = 2.6 * bright; }
        v += 2; px = x; py = y; pz = z;
      }
    }
    const g = this.lines.geometry;
    g.setDrawRange(0, v);
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }
}

// ------------------------------------------------------------------ cable
/** a heavy faceted cable sagging between two moving points */
export class Cable {
  mesh: THREE.Mesh;
  private pos: Float32Array; private nrm: Float32Array;
  constructor(mat: THREE.Material, private r = 0.018, private segs = 14, private radial = 5, color = 0x6a6a6a) {
    const nv = segs * radial * 6;
    this.pos = new Float32Array(nv * 3); this.nrm = new Float32Array(nv * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nrm, 3));
    const uv = new Float32Array(nv * 2), col = new Float32Array(nv * 3);
    const c = new THREE.Color(color);
    for (let i = 0; i < nv; i++) { uv[i * 2] = (i % 6) / 6; uv[i * 2 + 1] = Math.floor(i / (radial * 6)) * 0.3; col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
  }
  private rings: THREE.Vector3[][] = [];
  update(a: THREE.Vector3, b: THREE.Vector3, sag: number, side = 0) {
    const S = this.segs, R = this.radial;
    if (!this.rings.length) for (let i = 0; i <= S; i++) { const ring: THREE.Vector3[] = []; for (let k = 0; k < R; k++) ring.push(new THREE.Vector3()); this.rings.push(ring); }
    const pt = (t: number, out: THREE.Vector3) => out.set(a.x + (b.x - a.x) * t + Math.sin(t * Math.PI) * side, a.y + (b.y - a.y) * t - Math.sin(t * Math.PI) * sag, a.z + (b.z - a.z) * t);
    const p = new THREE.Vector3(), q = new THREE.Vector3(), T = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3();
    for (let i = 0; i <= S; i++) {
      const t = i / S;
      pt(t, p); pt(Math.min(1, t + 0.02), q);
      if (t >= 1) { pt(t - 0.02, q); T.subVectors(p, q); } else T.subVectors(q, p);
      T.normalize();
      N.set(1, 0, 0); if (Math.abs(T.x) > 0.9) N.set(0, 0, 1);
      B.crossVectors(T, N).normalize(); N.crossVectors(B, T).normalize();
      for (let k = 0; k < R; k++) { const an = (k / R) * Math.PI * 2; this.rings[i][k].copy(p).addScaledVector(N, Math.cos(an) * this.r).addScaledVector(B, Math.sin(an) * this.r); }
    }
    let v = 0;
    const P = this.pos;
    const put = (w: THREE.Vector3) => { P[v * 3] = w.x; P[v * 3 + 1] = w.y; P[v * 3 + 2] = w.z; v++; };
    for (let i = 0; i < S; i++) for (let k = 0; k < R; k++) {
      const a0 = this.rings[i][k], a1 = this.rings[i][(k + 1) % R], b0 = this.rings[i + 1][k], b1 = this.rings[i + 1][(k + 1) % R];
      put(a0); put(b0); put(a1); put(a1); put(b0); put(b1);
    }
    const g = this.mesh.geometry;
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    g.computeVertexNormals();
  }
}

// ------------------------------------------------------------------ chain
/** a chain of faceted links laid along a sagging line */
export class Chain {
  mesh: THREE.InstancedMesh;
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private q2 = new THREE.Quaternion(); private one = new THREE.Vector3(1, 1, 1);
  private pitch = 0.034;
  constructor(mats: FMats, private max = 40, key: FKey = 'metal') {
    const b = new FacetBuilder();
    b.add(key, band(0.011, 0.022, 0.007, 0.007, 6), 0x9a9c9c);
    const src = b.build(mats).children[0] as THREE.Mesh;
    this.mesh = new THREE.InstancedMesh(src.geometry, src.material as THREE.Material, max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
  }
  update(a: THREE.Vector3, b: THREE.Vector3, sag = 0.04) {
    const L = a.distanceTo(b);
    const n = Math.min(this.max, Math.max(1, Math.round(L / this.pitch)));
    const p = new THREE.Vector3(), d = new THREE.Vector3(), z = new THREE.Vector3(0, 0, 1);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      p.lerpVectors(a, b, t); p.y -= Math.sin(t * Math.PI) * sag;
      d.subVectors(b, a); d.y -= Math.cos(t * Math.PI) * Math.PI * sag; d.normalize();
      this.q.setFromUnitVectors(z, d);
      if (i % 2) this.q.multiply(this.q2.setFromAxisAngle(z, Math.PI / 2));
      this.m.compose(p, this.q, this.one);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ sweat and catchlights
/** beads of sweat creeping down the forehead under the cap rim (head-bone space at height 1) */
export class Sweat {
  group = new THREE.Group();
  mat = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false });
  private beads: { m: THREE.Mesh; a: number; y: number; v: number; wait: number }[] = [];
  constructor(n = 7) {
    const g = new THREE.OctahedronGeometry(0.0036, 0);
    g.scale(1, 1.4, 0.7);
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(g, this.mat);
      this.group.add(m);
      this.beads.push({ m, a: (Math.random() - 0.5) * 70, y: 0.1 + Math.random() * 0.05, v: 0.004 + Math.random() * 0.01, wait: Math.random() * 3 });
    }
  }
  update(dt: number, glint: number) {
    for (const b of this.beads) {
      if (b.wait > 0) { b.wait -= dt; b.m.visible = false; continue; }
      b.m.visible = true;
      b.y -= b.v * dt * (0.4 + Math.random() * 1.2);
      if (b.y < 0.1 + Math.abs(b.a) * 0.0003) { b.y = 0.148 + Math.random() * 0.008; b.a = (Math.random() - 0.5) * 70; b.v = 0.004 + Math.random() * 0.01; b.wait = Math.random() * 2.5; }
      const a = (b.a * Math.PI) / 180;
      const r = (0.098 - Math.max(0, b.y - 0.143) * 0.43) * (1 - 0.12 * (b.a / 45) ** 2) + 0.004;
      b.m.position.set(Math.sin(a) * r, b.y, 0.005 + Math.cos(a) * r);
    }
    const k = Math.min(1.6, glint);
    this.mat.color.setRGB(0.55 * k, 0.6 * k, 0.62 * k);
  }
}
/** the wet glint in each eye: one pixel each */
export function catchlights(): THREE.Points {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0.029, 0.097, 0.097, -0.029, 0.097, 0.097], 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ size: 1, sizeAttenuation: false, color: 0x000000, toneMapped: false }));
  p.frustumCulled = false;
  return p;
}

// ------------------------------------------------------------------ light leaking through a louvre
/** flat additive ribbons of hazy light, one per gap between slats: each gap is a segment a→b, all thrown along dir */
export function leakCards(gaps: [THREE.Vector3, THREE.Vector3][], dir: THREE.Vector3, len: number): { mesh: THREE.Mesh; u: { uInt: { value: number }; uColor: { value: THREE.Color } } } {
  const pos: number[] = [], fade: number[] = [];
  const D = dir.clone().normalize().multiplyScalar(len);
  for (const [a, b] of gaps) {
    const c = b.clone().add(D), d = a.clone().add(D);
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
    fade.push(0, 0, 1, 0, 1, 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aFade', new THREE.Float32BufferAttribute(fade, 1));
  const u = { uInt: { value: 0 }, uColor: { value: new THREE.Color(0x9ab4ff) } };
  const mat = new THREE.ShaderMaterial({
    uniforms: u,
    vertexShader: 'attribute float aFade; varying float vF; varying vec3 vV; void main(){ vF = aFade; vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = mv.xyz; gl_Position = projectionMatrix * mv; }',
    fragmentShader: `uniform float uInt; uniform vec3 uColor; varying float vF; varying vec3 vV;
      void main(){ vec3 n = normalize(cross(dFdx(vV), dFdy(vV))); float f = 0.35 + 0.65 * abs(dot(n, normalize(-vV)));
        float a = uInt * f * smoothstep(0.0, 0.06, vF) * pow(1.0 - vF, 1.6); gl_FragColor = vec4(uColor * a, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  return { mesh, u };
}
