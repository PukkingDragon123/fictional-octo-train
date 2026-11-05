// Loose bits flying round the operating room, all crisp at the low render
// resolution: blood as two-pixel drops (they paint the floor and walls where
// they land), sparks and embers as additive one-pixel streaks, paint mist that
// hangs and drifts, hair clippings as short dark lines that flutter down,
// bone chips and serum droplets. One pool, three draw calls.
import * as THREE from 'three';

export const Bit = { Blood: 0, Spark: 1, Mist: 2, Hair: 3, Chip: 4, Drop: 5, Ember: 6 } as const;
export type Bit = typeof Bit[keyof typeof Bit];

export interface BitBounds { w: number; back: number; h: number; plate: (x: number, z: number) => number }

export class Bits {
  readonly group = new THREE.Group();
  private n: number;
  private P: Float32Array; private V: Float32Array; private C: Float32Array; private L: Float32Array; private K: Uint8Array; private S: Float32Array;
  private next = 0;
  private sparkGeo = new THREE.BufferGeometry(); private sparkPos: Float32Array; private sparkCol: Float32Array;
  private hairGeo = new THREE.BufferGeometry(); private hairPos: Float32Array; private hairCol: Float32Array;
  private dotGeo = new THREE.BufferGeometry(); private dotPos: Float32Array; private dotCol: Float32Array;
  /** called where a blood drop lands on a surface (axis of the surface normal) */
  onLand?: (x: number, y: number, z: number, axis: 'y' | 'z' | 'x' | '-y') => void;
  constructor(n: number, private bounds: BitBounds) {
    this.n = n;
    this.P = new Float32Array(n * 3); this.V = new Float32Array(n * 3); this.C = new Float32Array(n * 3); this.L = new Float32Array(n); this.K = new Uint8Array(n); this.S = new Float32Array(n);
    this.sparkPos = new Float32Array(n * 6); this.sparkCol = new Float32Array(n * 6);
    this.hairPos = new Float32Array(n * 6); this.hairCol = new Float32Array(n * 6);
    this.dotPos = new Float32Array(n * 3); this.dotCol = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { this.sparkPos[i * 6 + 1] = this.sparkPos[i * 6 + 4] = -50; this.hairPos[i * 6 + 1] = this.hairPos[i * 6 + 4] = -50; this.dotPos[i * 3 + 1] = -50; }
    const attr = (g: THREE.BufferGeometry, p: Float32Array, c: Float32Array) => { g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('color', new THREE.BufferAttribute(c, 3)); };
    attr(this.sparkGeo, this.sparkPos, this.sparkCol); attr(this.hairGeo, this.hairPos, this.hairCol); attr(this.dotGeo, this.dotPos, this.dotCol);
    const sparks = new THREE.LineSegments(this.sparkGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    const hair = new THREE.LineSegments(this.hairGeo, new THREE.LineBasicMaterial({ vertexColors: true }));
    const dots = new THREE.Points(this.dotGeo, new THREE.PointsMaterial({ size: 2, sizeAttenuation: false, vertexColors: true }));
    for (const o of [sparks, hair, dots]) { o.frustumCulled = false; this.group.add(o); }
    sparks.renderOrder = 6;
  }
  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, kind: Bit, life: number, color = -1) {
    const i = this.next; this.next = (this.next + 1) % this.n;
    const j = i * 3;
    this.P[j] = x; this.P[j + 1] = y; this.P[j + 2] = z;
    this.V[j] = vx; this.V[j + 1] = vy; this.V[j + 2] = vz;
    this.L[i] = life; this.K[i] = kind; this.S[i] = Math.random() * 6.28;
    const b = 0.5 + Math.random() * 0.5;
    if (color >= 0) {
      const r = ((color >> 16) & 255) / 255, g = ((color >> 8) & 255) / 255, bl = (color & 255) / 255;
      const lin = (v: number) => Math.pow(v, 2.2);
      const f = kind === Bit.Mist ? 0.55 + 0.45 * b : 0.8 + 0.2 * b;
      this.C[j] = lin(r) * f; this.C[j + 1] = lin(g) * f; this.C[j + 2] = lin(bl) * f;
    } else if (kind === Bit.Blood) { this.C[j] = 0.3 * b + 0.1; this.C[j + 1] = 0.01; this.C[j + 2] = 0.015; }
    else if (kind === Bit.Spark) { this.C[j] = 2.2; this.C[j + 1] = 1.7 + 0.5 * b; this.C[j + 2] = 0.9 + 1.4 * b; }
    else if (kind === Bit.Ember) { this.C[j] = 2.4; this.C[j + 1] = 0.7 + 0.4 * b; this.C[j + 2] = 0.12; }
    else if (kind === Bit.Chip) { this.C[j] = 0.75 * b + 0.2; this.C[j + 1] = 0.7 * b + 0.18; this.C[j + 2] = 0.6 * b + 0.15; }
    else { this.C[j] = 0.3; this.C[j + 1] = 0.3; this.C[j + 2] = 0.3; }
  }
  /** a spray of one kind from p along dir (unit), speed ± spread */
  burst(p: THREE.Vector3, dir: THREE.Vector3, n: number, kind: Bit, speed: number, spread: number, life: number, color = -1) {
    for (let i = 0; i < n; i++) {
      const s = speed * (0.4 + Math.random() * 0.8);
      this.emit(p.x, p.y, p.z, dir.x * s + (Math.random() - 0.5) * spread, dir.y * s + (Math.random() - 0.3) * spread, dir.z * s + (Math.random() - 0.5) * spread, kind, life * (0.6 + Math.random() * 0.7), color);
    }
  }
  update(dt: number) {
    const P = this.P, V = this.V, B = this.bounds;
    const SP = this.sparkPos, SC = this.sparkCol, HP = this.hairPos, HC = this.hairCol, DP = this.dotPos, DC = this.dotCol;
    let any = false;
    for (let i = 0; i < this.n; i++) {
      const j = i * 3, s6 = i * 6;
      const kind = this.K[i] as Bit;
      if (this.L[i] <= 0) {
        if (SP[s6 + 1] !== -50 || HP[s6 + 1] !== -50 || DP[j + 1] !== -50) { SP[s6 + 1] = SP[s6 + 4] = -50; HP[s6 + 1] = HP[s6 + 4] = -50; DP[j + 1] = -50; any = true; }
        continue;
      }
      any = true;
      this.L[i] -= dt;
      const grav = kind === Bit.Spark ? 6 : kind === Bit.Mist ? 0.25 : kind === Bit.Hair ? 1.4 : kind === Bit.Ember ? 0.8 : 9.8;
      const drag = kind === Bit.Mist ? 2.6 : kind === Bit.Hair ? 3.5 : kind === Bit.Ember ? 1.2 : 0;
      if (drag) { const f = Math.exp(-drag * dt); V[j] *= f; V[j + 1] *= f; V[j + 2] *= f; }
      V[j + 1] -= grav * dt;
      if (kind === Bit.Hair) { this.S[i] += dt * 9; V[j] += Math.sin(this.S[i]) * 0.6 * dt; V[j + 2] += Math.cos(this.S[i] * 0.7) * 0.4 * dt; }
      if (kind === Bit.Mist) { V[j] += (Math.random() - 0.5) * 0.4 * dt; V[j + 1] += 0.15 * dt; }
      P[j] += V[j] * dt; P[j + 1] += V[j + 1] * dt; P[j + 2] += V[j + 2] * dt;
      const floor = B.plate(P[j], P[j + 2]);
      let hit: '' | 'y' | 'z' | 'x' | '-y' = '';
      const bouncy = kind === Bit.Spark || kind === Bit.Ember || kind === Bit.Chip;
      if (P[j + 1] < floor) {
        if (bouncy && V[j + 1] < -0.6) { V[j + 1] *= -0.35; V[j] *= 0.5; V[j + 2] *= 0.5; P[j + 1] = floor + 0.001; }
        else if (kind === Bit.Hair || kind === Bit.Chip) { P[j + 1] = floor + 0.002; V[j] = V[j + 1] = V[j + 2] = 0; this.L[i] = Math.min(this.L[i], 3); }
        else hit = 'y';
      } else if (P[j + 2] < B.back + 0.01) hit = 'z';
      else if (Math.abs(P[j]) > B.w - 0.01) hit = 'x';
      else if (P[j + 1] > B.h - 0.02) hit = '-y';
      if (hit || this.L[i] <= 0) {
        if (hit && kind === Bit.Blood && Math.random() < 0.05) this.onLand?.(P[j], hit === 'y' ? floor : P[j + 1], P[j + 2], hit);
        this.L[i] = 0; SP[s6 + 1] = SP[s6 + 4] = -50; HP[s6 + 1] = HP[s6 + 4] = -50; DP[j + 1] = -50;
        continue;
      }
      if (kind === Bit.Spark || kind === Bit.Ember) {
        const k = Math.min(1, this.L[i] * 3), tail = kind === Bit.Ember ? 0.012 : 0.022;
        SP[s6] = P[j]; SP[s6 + 1] = P[j + 1]; SP[s6 + 2] = P[j + 2];
        SP[s6 + 3] = P[j] - V[j] * tail; SP[s6 + 4] = P[j + 1] - V[j + 1] * tail; SP[s6 + 5] = P[j + 2] - V[j + 2] * tail;
        SC[s6] = this.C[j] * k; SC[s6 + 1] = this.C[j + 1] * k; SC[s6 + 2] = this.C[j + 2] * k;
        SC[s6 + 3] = SC[s6] * 0.35; SC[s6 + 4] = SC[s6 + 1] * 0.2; SC[s6 + 5] = SC[s6 + 2] * 0.1;
        HP[s6 + 1] = HP[s6 + 4] = -50; DP[j + 1] = -50;
      } else if (kind === Bit.Hair) {
        const a = this.S[i], l = 0.012;
        HP[s6] = P[j] - Math.cos(a) * l; HP[s6 + 1] = P[j + 1] - Math.sin(a * 0.7) * l * 0.6; HP[s6 + 2] = P[j + 2] - Math.sin(a) * l;
        HP[s6 + 3] = P[j] + Math.cos(a) * l; HP[s6 + 4] = P[j + 1] + Math.sin(a * 0.7) * l * 0.6; HP[s6 + 5] = P[j + 2] + Math.sin(a) * l;
        HC[s6] = HC[s6 + 3] = this.C[j]; HC[s6 + 1] = HC[s6 + 4] = this.C[j + 1]; HC[s6 + 2] = HC[s6 + 5] = this.C[j + 2];
        SP[s6 + 1] = SP[s6 + 4] = -50; DP[j + 1] = -50;
      } else {
        DP[j] = P[j]; DP[j + 1] = P[j + 1]; DP[j + 2] = P[j + 2];
        const fade = kind === Bit.Mist ? Math.min(1, this.L[i] * 1.5) : 1;
        DC[j] = this.C[j] * fade; DC[j + 1] = this.C[j + 1] * fade; DC[j + 2] = this.C[j + 2] * fade;
        SP[s6 + 1] = SP[s6 + 4] = -50; HP[s6 + 1] = HP[s6 + 4] = -50;
      }
    }
    if (any) for (const g of [this.sparkGeo, this.hairGeo, this.dotGeo]) { (g.attributes.position as THREE.BufferAttribute).needsUpdate = true; (g.attributes.color as THREE.BufferAttribute).needsUpdate = true; }
  }
  dispose() { for (const g of [this.sparkGeo, this.hairGeo, this.dotGeo]) g.dispose(); this.group.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; m?.dispose(); }); }
}
