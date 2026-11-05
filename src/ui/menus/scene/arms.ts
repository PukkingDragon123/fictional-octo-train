// Hydraulic arms with a body: the wrist is a mass on a motor spring (it
// overshoots and settles), the elbow is a second mass that trails the
// two-bone solution (it lags, swings through and bounces when the wrist
// moves fast), the head is a wrist joint with its own angular spring (it
// wobbles after a jolt and leans into the move), the tip collides with a
// contact plane (pressing into the subject, recoiling off it), and a feed
// hose hangs from the shoulder to the head as a verlet rope that swings.
import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const G = new THREE.Vector3(0, -9.8, 0);
const tA = new THREE.Vector3(), tB = new THREE.Vector3(), tC = new THREE.Vector3(), tD = new THREE.Vector3();
const M = new THREE.Matrix4();

/** a contact the tip may not pass: point on the surface, outward normal, how far it may sink in */
export interface Contact { p: THREE.Vector3; n: THREE.Vector3; give: number; on: boolean }

export class PhysArm {
  readonly base: THREE.Vector3;
  readonly tip = new THREE.Vector3(); readonly tipV = new THREE.Vector3();
  readonly elbow = new THREE.Vector3(); readonly elbowV = new THREE.Vector3();
  readonly goal = new THREE.Vector3();
  /** the direction the head should point (unit); null = along the forearm */
  aimGoal: THREE.Vector3 | null = null;
  readonly aim = new THREE.Vector3(0, -1, 0); private aimV = new THREE.Vector3();
  /** wrist motor spring (stiffness, damping) — underdamped: it overshoots */
  k = 70; c = 9;
  /** elbow follow spring */
  ek = 150; ec = 11;
  /** head (wrist joint) spring */
  ak = 90; ac = 10;
  /** how much a fast move sags/leans the head */
  wobble = 0.03;
  readonly contact: Contact = { p: new THREE.Vector3(), n: new THREE.Vector3(0, 0, 1), give: 0.01, on: false };
  /** how deep the tip went into the contact this frame (m, >0 = pressing) and its closing speed at impact */
  press = 0; impact = 0;
  /** roll of the head round its axis (radians, added) */
  roll = 0;
  private accel = new THREE.Vector3(); private lastV = new THREE.Vector3();
  constructor(base: THREE.Vector3, readonly L1: number, readonly L2: number, readonly pole: THREE.Vector3, start: THREE.Vector3) {
    this.base = base.clone();
    this.tip.copy(start); this.goal.copy(start);
    this.solveElbow(this.elbow);
  }
  /** the two-bone elbow for the current tip in the plane of the pole */
  private solveElbow(out: THREE.Vector3) {
    const d = tA.subVectors(this.tip, this.base);
    let len = d.length();
    const min = Math.abs(this.L1 - this.L2) + 0.05, max = this.L1 + this.L2 - 0.005;
    len = Math.max(min, Math.min(max, len));
    const dir = d.normalize();
    const ax = (this.L1 * this.L1 - this.L2 * this.L2 + len * len) / (2 * len);
    const h = Math.sqrt(Math.max(0, this.L1 * this.L1 - ax * ax));
    const perp = tB.copy(this.pole).addScaledVector(dir, -this.pole.dot(dir));
    if (perp.lengthSq() < 1e-6) perp.set(0, 0, 1);
    perp.normalize();
    return out.copy(this.base).addScaledVector(dir, ax).addScaledVector(perp, h);
  }
  /** an impulse on the wrist (recoil, a shove): world direction × m/s */
  kick(dir: THREE.Vector3, mag: number) {
    this.tipV.addScaledVector(dir, mag);
    this.elbowV.addScaledVector(dir, mag * 0.45);
    this.aimV.addScaledVector(dir, -mag * 2.5);
  }
  /** snap to the goal (no swing) */
  snap() { this.tip.copy(this.goal); this.tipV.set(0, 0, 0); this.solveElbow(this.elbow); this.elbowV.set(0, 0, 0); }
  update(dt: number) {
    this.press = 0;
    let impact = 0;
    const max = this.L1 + this.L2 - 0.01;
    for (let rem = dt; rem > 1e-6; rem -= 1 / 120) {
      const h = Math.min(rem, 1 / 120);
      // the wrist: a motor spring toward the goal, a little gravity sag
      tA.subVectors(this.goal, this.tip).multiplyScalar(this.k).addScaledVector(this.tipV, -this.c).addScaledVector(G, 0.04);
      this.tipV.addScaledVector(tA, h);
      this.tip.addScaledVector(this.tipV, h);
      // reach
      tB.subVectors(this.tip, this.base);
      if (tB.length() > max) { tB.setLength(max); this.tip.copy(this.base).add(tB); const vn = this.tipV.dot(tB.normalize()); if (vn > 0) this.tipV.addScaledVector(tB, -vn); }
      // the contact: it may sink `give` into the surface, then it is pushed back (and bounces a little)
      if (this.contact.on) {
        const n = this.contact.n;
        const d = tC.subVectors(this.tip, this.contact.p).dot(n);
        if (d < 0) this.press = Math.max(this.press, -d);
        if (d < -this.contact.give) {
          this.tip.addScaledVector(n, -this.contact.give - d);
          const vn = this.tipV.dot(n);
          if (vn < 0) { impact = Math.max(impact, -vn); this.tipV.addScaledVector(n, -vn * 1.35); this.tipV.multiplyScalar(0.92); }
        }
      }
      // the elbow trails the solution
      this.solveElbow(tD);
      tA.subVectors(tD, this.elbow).multiplyScalar(this.ek).addScaledVector(this.elbowV, -this.ec).addScaledVector(G, 0.12);
      this.elbowV.addScaledVector(tA, h);
      this.elbow.addScaledVector(this.elbowV, h);
      // keep both segment lengths (the elbow gives, the wrist leads)
      for (let it = 0; it < 2; it++) {
        tB.subVectors(this.elbow, this.base).setLength(this.L1); this.elbow.copy(this.base).add(tB);
        tB.subVectors(this.elbow, this.tip).setLength(this.L2); this.elbow.copy(this.tip).add(tB);
      }
    }
    this.impact = impact;
    // the head: an angular spring toward the aim (or the forearm), leaning into accelerations
    this.accel.subVectors(this.tipV, this.lastV).divideScalar(Math.max(1 / 60, dt)).clampLength(0, 60);
    this.lastV.copy(this.tipV);
    const want = this.aimGoal ? tA.copy(this.aimGoal).normalize() : tA.subVectors(this.tip, this.elbow).normalize();
    want.addScaledVector(this.accel, -this.wobble * 0.02).normalize();
    for (let rem = dt; rem > 1e-6; rem -= 1 / 120) {
      const h = Math.min(rem, 1 / 120);
      tB.subVectors(want, this.aim).multiplyScalar(this.ak).addScaledVector(this.aimV, -this.ac);
      this.aimV.addScaledVector(tB, h);
      this.aim.addScaledVector(this.aimV, h).normalize();
    }
    if (!isFinite(this.aim.x)) { this.aim.copy(want); this.aimV.set(0, 0, 0); }
    if (!isFinite(this.tip.x)) { this.tip.copy(this.goal); this.tipV.set(0, 0, 0); this.solveElbow(this.elbow); this.elbowV.set(0, 0, 0); }
  }
  /** pose the meshes: shoulder segment (base→elbow), forearm (elbow→wrist), head (at the wrist, along aim) */
  pose(seg1: THREE.Object3D, seg2: THREE.Object3D, head: THREE.Object3D) {
    seg1.position.copy(this.base);
    seg1.quaternion.setFromUnitVectors(UP, tA.subVectors(this.elbow, this.base).normalize());
    seg2.position.copy(this.elbow);
    seg2.quaternion.setFromUnitVectors(UP, tA.subVectors(this.tip, this.elbow).normalize());
    head.position.copy(this.elbow).addScaledVector(tA, this.L2);
    // the head's frame: +Y along the aim, +X kept level (a scanner's fan stays flat), then the roll
    const y = this.aim;
    const x = tB.crossVectors(y, UP);
    if (x.lengthSq() < 1e-4) x.set(1, 0, 0);
    x.normalize();
    const z = tC.crossVectors(x, y).normalize();
    M.makeBasis(x, y, z);
    head.quaternion.setFromRotationMatrix(M);
    if (this.roll) head.rotateY(this.roll);
  }
}

// ------------------------------------------------------------------ the hose
/** a verlet rope between two moving ends, drawn as a faceted tube rebuilt each frame */
export class Rope {
  mesh: THREE.Mesh;
  private p: THREE.Vector3[] = []; private q: THREE.Vector3[] = [];
  private seg: number; private rest: number;
  private pos: Float32Array;
  private rings: THREE.Vector3[][] = [];
  constructor(mat: THREE.Material, private n = 12, private len = 1.2, private r = 0.014, private radial = 5, color = 0x6a6a6a) {
    for (let i = 0; i < n; i++) { this.p.push(new THREE.Vector3()); this.q.push(new THREE.Vector3()); }
    this.seg = n - 1; this.rest = len / this.seg;
    const nv = this.seg * radial * 6;
    this.pos = new Float32Array(nv * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nv * 3), 3));
    const uv = new Float32Array(nv * 2), col = new Float32Array(nv * 3), c = new THREE.Color(color);
    for (let i = 0; i < nv; i++) { uv[i * 2] = (i % 6) / 6; uv[i * 2 + 1] = Math.floor(i / (radial * 6)) * 0.4; col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    for (let i = 0; i <= this.seg; i++) { const ring: THREE.Vector3[] = []; for (let k = 0; k < radial; k++) ring.push(new THREE.Vector3()); this.rings.push(ring); }
  }
  private inited = false;
  /** step the rope with its ends pinned at a and b */
  update(a: THREE.Vector3, b: THREE.Vector3, dt: number) {
    const P = this.p, Q = this.q, n = this.n;
    // the rope is never shorter than the gap (no snapping straight)
    const rest = Math.max(this.rest, a.distanceTo(b) / this.seg * 1.02);
    if (!this.inited) { for (let i = 0; i < n; i++) { P[i].lerpVectors(a, b, i / (n - 1)); P[i].y -= Math.sin((i / (n - 1)) * Math.PI) * 0.2; Q[i].copy(P[i]); } this.inited = true; }
    const h = Math.min(dt, 1 / 30);
    for (let i = 1; i < n - 1; i++) {
      const p = P[i], q = Q[i];
      tA.subVectors(p, q).multiplyScalar(0.985);
      q.copy(p);
      p.add(tA).addScaledVector(G, h * h);
    }
    P[0].copy(a); P[n - 1].copy(b);
    for (let it = 0; it < 6; it++) {
      for (let i = 0; i < n - 1; i++) {
        const p = P[i], q = P[i + 1];
        tA.subVectors(q, p);
        const d = tA.length() || 1e-6;
        const diff = (d - rest) / d;
        const wa = i === 0 ? 0 : 0.5, wb = i + 1 === n - 1 ? 0 : 0.5;
        if (wa + wb === 0) continue;
        const s = diff / (wa + wb);
        p.addScaledVector(tA, s * wa);
        q.addScaledVector(tA, -s * wb);
      }
    }
    // the tube
    const R = this.radial, T = tB, N = tC, B = tD;
    for (let i = 0; i < n; i++) {
      const p = P[i];
      if (i < n - 1) T.subVectors(P[i + 1], p); else T.subVectors(p, P[i - 1]);
      T.normalize();
      N.set(1, 0, 0); if (Math.abs(T.x) > 0.9) N.set(0, 0, 1);
      B.crossVectors(T, N).normalize(); N.crossVectors(B, T).normalize();
      for (let k = 0; k < R; k++) { const an = (k / R) * Math.PI * 2; this.rings[i][k].copy(p).addScaledVector(N, Math.cos(an) * this.r).addScaledVector(B, Math.sin(an) * this.r); }
    }
    let v = 0;
    const X = this.pos;
    const put = (w: THREE.Vector3) => { X[v * 3] = w.x; X[v * 3 + 1] = w.y; X[v * 3 + 2] = w.z; v++; };
    for (let i = 0; i < this.seg; i++) for (let k = 0; k < R; k++) {
      const a0 = this.rings[i][k], a1 = this.rings[i][(k + 1) % R], b0 = this.rings[i + 1][k], b1 = this.rings[i + 1][(k + 1) % R];
      put(a0); put(b0); put(a1); put(a1); put(b0); put(b1);
    }
    const g = this.mesh.geometry;
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    g.computeVertexNormals();
  }
  /** a sideways shove to the middle of the rope (it swings) */
  shove(v: THREE.Vector3) { for (let i = 1; i < this.n - 1; i++) this.q[i].addScaledVector(v, -Math.sin((i / (this.n - 1)) * Math.PI) * 0.02); }
}
