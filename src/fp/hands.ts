// First-person arms and hands, shared by every close-up (watch, backpack,
// eating, inspection, bench, cooking, surgery, the intro). Low-poly but never
// blocky: capsule phalanges with round knuckles, a cupped rounded palm, a
// tapered forearm under a wrinkled jumpsuit sleeve, nails, crease shading in
// vertex colour, smooth normals. The pixel pipeline does the rest.
//
// Space: the elbow is the root's origin and the forearm runs up local +Y to the
// wrist (0.26 m); fingers continue along +Y; the palm faces +Z. A left arm is a
// mirrored right arm. Fingers curl toward +Z. Hang held items on `grip`.
import * as THREE from 'three';

export type HandPose = 'relaxed' | 'open' | 'fist' | 'grip' | 'point' | 'pinch' | 'cup' | 'press' | 'claw' | 'flat';
type F3 = [number, number, number];
interface PoseDef { f: [F3, F3, F3, F3]; spread: number; thumb: [number, number, number] }

const P = (i: F3, m: F3, r: F3, k: F3, spread: number, thumb: [number, number, number]): PoseDef => ({ f: [i, m, r, k], spread, thumb });
export const HAND_POSES: Record<HandPose, PoseDef> = {
  relaxed: P([0.2, 0.3, 0.2], [0.25, 0.35, 0.22], [0.3, 0.4, 0.25], [0.38, 0.45, 0.3], 0.2, [0.35, 0.15, 0.2]),
  open: P([0.02, 0.03, 0.02], [0.02, 0.03, 0.02], [0.03, 0.04, 0.03], [0.04, 0.05, 0.03], 1, [0.05, 0.02, 0.02]),
  flat: P([0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], 0, [0.25, 0, 0]),
  fist: P([1.45, 1.7, 1.15], [1.5, 1.72, 1.15], [1.52, 1.7, 1.12], [1.55, 1.65, 1.1], 0, [0.95, 0.55, 0.55]),
  grip: P([1.05, 1.2, 0.85], [1.1, 1.25, 0.88], [1.15, 1.25, 0.85], [1.2, 1.2, 0.8], 0.05, [1.05, 0.35, 0.3]),
  point: P([0.04, 0.05, 0.04], [1.5, 1.7, 1.1], [1.52, 1.7, 1.1], [1.55, 1.65, 1.05], 0.1, [0.85, 0.45, 0.4]),
  pinch: P([0.7, 0.6, 0.35], [0.55, 0.5, 0.3], [0.65, 0.6, 0.35], [0.75, 0.65, 0.4], 0.1, [1.2, 0.45, 0.35]),
  cup: P([0.45, 0.5, 0.35], [0.45, 0.5, 0.35], [0.5, 0.5, 0.35], [0.55, 0.5, 0.35], 0.15, [0.6, 0.2, 0.2]),
  press: P([1.3, 1.6, 1.1], [1.35, 1.6, 1.1], [1.4, 1.6, 1.05], [1.45, 1.55, 1.0], 0, [0.35, 0.04, 0.04]),
  claw: P([0.55, 1.1, 0.9], [0.5, 1.15, 0.95], [0.55, 1.1, 0.9], [0.6, 1.05, 0.85], 1.4, [0.5, 0.6, 0.6]),
};

const FOREARM = 0.26;
// index, middle, ring, little: knuckle x, knuckle height, splay, phalanx lengths, base and tip radius
const FINGERS: { x: number; y: number; splay: number; len: F3; r0: number; r1: number }[] = [
  { x: -0.026, y: 0.084, splay: -0.07, len: [0.039, 0.024, 0.019], r0: 0.0094, r1: 0.0074 },
  { x: -0.0085, y: 0.087, splay: 0, len: [0.043, 0.027, 0.02], r0: 0.0097, r1: 0.0076 },
  { x: 0.0095, y: 0.084, splay: 0.06, len: [0.04, 0.025, 0.019], r0: 0.0092, r1: 0.0072 },
  { x: 0.0265, y: 0.077, splay: 0.13, len: [0.031, 0.019, 0.016], r0: 0.0081, r1: 0.0063 },
];

// ---------------------------------------------------------------- geometry (shared)
const geoCache = new Map<string, THREE.BufferGeometry>();
function cached(key: string, make: () => THREE.BufferGeometry) {
  let g = geoCache.get(key);
  if (!g) { g = make(); geoCache.set(key, g); }
  return g;
}

/** vertex colours: a multiplier on the skin colour (creases darker and redder, tips pinker) */
function shade(g: THREE.BufferGeometry, fn: (x: number, y: number, z: number) => [number, number, number]) {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const c = fn(pos.getX(i), pos.getY(i), pos.getZ(i));
    col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

/** a tapered capsule with its base joint centre at the origin, running up +Y */
function phalanx(len: number, r0: number, r1: number, tip: boolean) {
  return cached(`ph:${len}:${r0}:${r1}:${tip}`, () => {
    const g = new THREE.CapsuleGeometry(r0, len, 3, 8);
    g.translate(0, len / 2, 0);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i), t = THREE.MathUtils.clamp(y / len, 0, 1);
      const k = THREE.MathUtils.lerp(1, r1 / r0, t);
      // fingers are a little flatter than round, padded on the palm side
      const z = pos.getZ(i);
      pos.setXYZ(i, pos.getX(i) * k, y, z * k * (z > 0 ? 0.95 : 0.82));
    }
    g.computeVertexNormals();
    shade(g, (_x, y, z) => {
      const crease = Math.exp(-((y / (r0 * 1.3)) ** 2)) * (z > 0 ? 0.16 : 0.07);
      const pink = tip ? THREE.MathUtils.smoothstep(y, len * 0.55, len + r1) * 0.06 : 0;
      return [1 - crease * 0.6 + pink * 0.4, 1 - crease - pink * 0.2, 1 - crease * 0.9 - pink * 0.1];
    });
    return g;
  });
}

function palmGeo() {
  return cached('palm', () => {
    const w = 0.079, h = 0.088, d = 0.027;
    const g = new THREE.BoxGeometry(w, h, d, 4, 4, 2);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      // round the box toward an ellipsoid
      const n = v.clone().divide(new THREE.Vector3(w / 2, h / 2, d / 2));
      const len = Math.max(1e-4, n.length());
      const s = THREE.MathUtils.lerp(1, 1 / len * Math.max(Math.abs(n.x), Math.abs(n.y), Math.abs(n.z)), 0.55);
      v.multiplyScalar(s);
      // cup the palm and thin it toward the fingers; heel of the hand thicker
      const ty = (v.y + h / 2) / h;
      v.z += (v.x * v.x) * 4.5 * (v.z > 0 ? 1 : 0.3);
      v.z *= THREE.MathUtils.lerp(1.12, 0.86, ty);
      // narrower at the wrist
      v.x *= THREE.MathUtils.lerp(0.84, 1, Math.min(1, ty * 1.6));
      pos.setXYZ(i, v.x, v.y + h / 2, v.z);
    }
    g.computeVertexNormals();
    shade(g, (x, y, z) => {
      const lines = z > 0 ? (Math.exp(-(((y - 0.06) / 0.004) ** 2)) + Math.exp(-(((y - 0.045 + x * 0.3) / 0.004) ** 2))) * 0.08 : 0;
      const knuckles = z < 0 ? Math.max(0, Math.cos(x * 230)) * THREE.MathUtils.smoothstep(y, 0.07, 0.088) * 0.06 : 0;
      return [1 - lines * 0.5 + knuckles * 0.3, 1 - lines - knuckles * 0.4, 1 - lines * 0.8 - knuckles * 0.3];
    });
    return g;
  });
}

function forearmGeo() {
  return cached('forearm', () => {
    const g = new THREE.CylinderGeometry(0.029, 0.043, FOREARM, 10, 6, false);
    g.translate(0, FOREARM / 2, 0);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), t = y / FOREARM;
      // muscle belly near the elbow, flatter toward the wrist
      const bulge = 1 + 0.12 * Math.sin(Math.PI * Math.min(1, (1 - t) * 1.25)) * (x > 0 ? 1.1 : 0.9);
      pos.setXYZ(i, x * bulge, y, z * bulge * THREE.MathUtils.lerp(0.86, 0.72, t));
    }
    g.computeVertexNormals();
    shade(g, (_x, y, z) => { const t = y / FOREARM; const vein = z > 0 ? 0.04 * Math.max(0, Math.sin(t * 9)) * t : 0; return [1 - vein, 1 - vein * 0.6, 1 + vein * 0.3]; });
    return g;
  });
}

function sleeveGeo(style: 'long' | 'rolled') {
  return cached('sleeve:' + style, () => {
    const top = style === 'long' ? FOREARM * 0.86 : FOREARM * 0.42;
    const g = new THREE.CylinderGeometry(0.039, 0.053, top + 0.04, 12, 8, true);
    g.translate(0, (top + 0.04) / 2 - 0.04, 0);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const a = Math.atan2(z, x);
      // fabric folds: bunching rings plus a few long creases
      const fold = 1 + 0.06 * Math.sin(y * 70 + a * 2) * Math.sin(a * 3 + 1) + 0.035 * Math.sin(a * 5 + y * 20);
      pos.setXYZ(i, x * fold, y, z * fold * 0.82);
    }
    g.computeVertexNormals();
    shade(g, (x, y, z) => { const a = Math.atan2(z, x); const s = 0.86 + 0.14 * (0.5 + 0.5 * Math.sin(y * 70 + a * 2)); return [s, s, s * 0.97]; });
    return g;
  });
}

function cuffGeo(style: 'long' | 'rolled') {
  return cached('cuff:' + style, () => {
    const r = style === 'long' ? 0.034 : 0.044, h = style === 'long' ? 0.016 : 0.032;
    const g = new THREE.CylinderGeometry(r + 0.004, r + 0.006, h, 12, 2, true);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), z = pos.getZ(i), a = Math.atan2(z, x); const f = 1 + 0.05 * Math.sin(a * 4); pos.setXYZ(i, x * f, pos.getY(i), z * f * 0.82); }
    g.computeVertexNormals();
    shade(g, () => [0.9, 0.9, 0.88]);
    return g;
  });
}

const nailGeo = () => cached('nail', () => { const g = new THREE.SphereGeometry(1, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2); g.scale(0.0056, 0.0018, 0.0068); g.rotateX(-Math.PI / 2); return g; });

// ---------------------------------------------------------------- the arm
export interface FpArm {
  root: THREE.Group;
  /** the wrist joint: rotate it to bend the hand; devices strap on here */
  wrist: THREE.Group;
  palm: THREE.Group;
  /** where a held item sits (centre of a closed grip) */
  grip: THREE.Object3D;
  /** the index fingertip (for pressing buttons and scanners) */
  tip: THREE.Object3D;
  /** the thumb tip (fingerprint readers) */
  thumbTip: THREE.Object3D;
  /** ease toward a pose (instant snaps) */
  pose(p: HandPose | PoseDef, instant?: boolean): void;
  update(dt: number): void;
  setLook(o: { skin?: number; sleeve?: number | null; sleeveStyle?: 'long' | 'rolled' | 'none' }): void;
  /** fear tremor 0..1 */
  tremor: number;
  dispose(): void;
}

export interface FpArmOpts { skin?: number; sleeve?: number | null; sleeveStyle?: 'long' | 'rolled' | 'none'; scale?: number }

export function fpArm(side: 'right' | 'left' = 'right', o: FpArmOpts = {}): FpArm {
  const skinMat = new THREE.MeshStandardMaterial({ color: o.skin ?? 0xe8b98f, roughness: 0.62, metalness: 0, vertexColors: true });
  skinMat.emissive = new THREE.Color(o.skin ?? 0xe8b98f).multiplyScalar(0.05);
  const nailMat = new THREE.MeshStandardMaterial({ color: 0xf2d6cc, roughness: 0.35, metalness: 0 });
  const clothMat = new THREE.MeshStandardMaterial({ color: o.sleeve ?? 0xeeb415, roughness: 0.92, metalness: 0, vertexColors: true, side: THREE.DoubleSide });

  const root = new THREE.Group(); root.name = 'fpArm:' + side;
  if (side === 'left') root.scale.x = -1;
  if (o.scale) root.scale.multiplyScalar(o.scale);
  const forearm = new THREE.Mesh(forearmGeo(), skinMat); root.add(forearm);
  const sleeveHolder = new THREE.Group(); root.add(sleeveHolder);

  const wrist = new THREE.Group(); wrist.position.y = FOREARM; root.add(wrist);
  const palm = new THREE.Group(); wrist.add(palm);
  palm.add(new THREE.Mesh(palmGeo(), skinMat));

  type Joint = { g: THREE.Group };
  const fingers: Joint[][] = [];
  FINGERS.forEach((f) => {
    const chain: Joint[] = [];
    let parent: THREE.Object3D = palm;
    f.len.forEach((len, i) => {
      const j = new THREE.Group();
      if (i === 0) { j.position.set(f.x, f.y, 0.002); j.rotation.z = f.splay; } else j.position.y = f.len[i - 1];
      const r0 = THREE.MathUtils.lerp(f.r0, f.r1, i / 3), r1 = THREE.MathUtils.lerp(f.r0, f.r1, (i + 1) / 3);
      j.add(new THREE.Mesh(phalanx(len, r0, r1, i === 2), skinMat));
      if (i === 2) { const n = new THREE.Mesh(nailGeo(), nailMat); n.position.set(0, len * 0.62, -r1 * 0.86); n.rotation.x = 0.12; j.add(n); }
      parent.add(j); parent = j; chain.push({ g: j });
    });
    fingers.push(chain);
  });
  const tip = new THREE.Object3D(); tip.position.y = FINGERS[0].len[2] + FINGERS[0].r1; fingers[0][2].g.add(tip);

  // the thumb leaves the heel of the palm and swings across it (opposition)
  const thumbBase = new THREE.Group(); thumbBase.position.set(-0.033, 0.024, 0.008); thumbBase.rotation.set(0.25, 0.35, 0.78); palm.add(thumbBase);
  const thumbOpp = new THREE.Group(); thumbBase.add(thumbOpp);
  const thumbLens: F3 = [0.036, 0.029, 0.025];
  const thumb: Joint[] = [];
  let tp: THREE.Object3D = thumbOpp;
  thumbLens.forEach((len, i) => {
    const j = new THREE.Group(); if (i > 0) j.position.y = thumbLens[i - 1];
    const r0 = [0.0128, 0.0112, 0.0102][i], r1 = [0.0114, 0.0104, 0.0084][i];
    j.add(new THREE.Mesh(phalanx(len, r0, r1, i === 2), skinMat));
    if (i === 2) { const n = new THREE.Mesh(nailGeo(), nailMat); n.position.set(0, len * 0.6, -r1 * 0.85); n.scale.setScalar(1.15); j.add(n); }
    tp.add(j); tp = j; thumb.push({ g: j });
  });
  const thumbTip = new THREE.Object3D(); thumbTip.position.y = thumbLens[2] + 0.008; thumb[2].g.add(thumbTip);

  const grip = new THREE.Object3D(); grip.position.set(0.002, 0.075, 0.032); palm.add(grip);

  // pose state: current and target curls
  const cur = { f: FINGERS.map(() => [0, 0, 0] as F3), spread: 0, thumb: [0, 0, 0] as [number, number, number] };
  let target: PoseDef = HAND_POSES.relaxed;
  let tremT = Math.random() * 10;

  function apply() {
    fingers.forEach((chain, fi) => {
      chain.forEach((j, i) => { j.g.rotation.x = cur.f[fi][i]; });
      chain[0].g.rotation.z = FINGERS[fi].splay * (0.6 + cur.spread * 0.9);
    });
    thumbOpp.rotation.z = -cur.thumb[0] * 0.75;
    thumbOpp.rotation.x = cur.thumb[0] * 0.55;
    thumb[1].g.rotation.x = cur.thumb[1];
    thumb[2].g.rotation.x = cur.thumb[2];
  }

  let sleeveStyle: 'long' | 'rolled' | 'none' = o.sleeveStyle ?? (o.sleeve === null ? 'none' : 'long');
  function buildSleeve() {
    sleeveHolder.clear();
    if (sleeveStyle === 'none') return;
    sleeveHolder.add(new THREE.Mesh(sleeveGeo(sleeveStyle), clothMat));
    const cuff = new THREE.Mesh(cuffGeo(sleeveStyle), clothMat);
    cuff.position.y = sleeveStyle === 'long' ? FOREARM * 0.86 : FOREARM * 0.42;
    sleeveHolder.add(cuff);
  }
  buildSleeve();

  const arm: FpArm = {
    root, wrist, palm, grip, tip, thumbTip, tremor: 0,
    pose(p, instant) {
      target = typeof p === 'string' ? HAND_POSES[p] : p;
      if (instant) { target.f.forEach((f, i) => { cur.f[i] = [...f] as F3; }); cur.spread = target.spread; cur.thumb = [...target.thumb] as [number, number, number]; apply(); }
    },
    update(dt) {
      const k = 1 - Math.exp(-dt * 16);
      // fingers close a beat after each other, like a real hand
      target.f.forEach((f, fi) => {
        const kk = 1 - Math.exp(-dt * (16 - fi * 2));
        for (let i = 0; i < 3; i++) cur.f[fi][i] += (f[i] - cur.f[fi][i]) * kk;
      });
      cur.spread += (target.spread - cur.spread) * k;
      for (let i = 0; i < 3; i++) cur.thumb[i] += (target.thumb[i] - cur.thumb[i]) * k;
      tremT += dt;
      if (arm.tremor > 0.01) {
        const t = arm.tremor * 0.035;
        for (let fi = 0; fi < 4; fi++) cur.f[fi][1] += Math.sin(tremT * (31 + fi * 7)) * t * 0.3;
        wrist.rotation.z = Math.sin(tremT * 23) * t * 0.4;
      }
      apply();
    },
    setLook(l) {
      if (l.skin != null) { skinMat.color.setHex(l.skin); skinMat.emissive.setHex(l.skin).multiplyScalar(0.05); }
      if (l.sleeve !== undefined) { if (l.sleeve === null) sleeveStyle = 'none'; else clothMat.color.setHex(l.sleeve); }
      if (l.sleeveStyle) sleeveStyle = l.sleeveStyle;
      buildSleeve();
    },
    dispose() { skinMat.dispose(); nailMat.dispose(); clothMat.dispose(); root.removeFromParent(); },
  };
  arm.pose('relaxed', true);
  return arm;
}

/** both arms dressed for a survivor (skin tone, the jumpsuit's sleeves) */
export function fpArmsFor(p: { app?: { skin?: number; suit?: { sleeves?: string } } } | null | undefined, sleeveColor: number | null = 0xeeb415) {
  const skin = p?.app?.skin ?? 0xe8b98f;
  const sleeveStyle = sleeveColor === null ? 'none' : p?.app?.suit?.sleeves === 'rolled' ? 'rolled' : 'long';
  return { right: fpArm('right', { skin, sleeve: sleeveColor, sleeveStyle }), left: fpArm('left', { skin, sleeve: sleeveColor, sleeveStyle }) };
}

/** a soft three-point rig for close-ups whose owner has no lights of its own (warm key, cool fill, rim) */
export function fpLightRig(key = 0xffe2c0, fill = 0x6c7a8c): THREE.Group {
  const g = new THREE.Group(); g.name = 'fpLights';
  g.add(new THREE.HemisphereLight(0xe8e0d0, 0x2a2420, 0.7));
  const k = new THREE.DirectionalLight(key, 1.6); k.position.set(0.6, 0.8, 0.5); g.add(k);
  const f = new THREE.DirectionalLight(fill, 0.5); f.position.set(-0.8, 0.1, 0.3); g.add(f);
  const r = new THREE.DirectionalLight(0xfff4e0, 0.9); r.position.set(-0.2, 0.6, -1); g.add(r);
  return g;
}
